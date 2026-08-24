import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { connectionStatusValidator } from "./lib/providers";
import { beginPurgeRun, clearFinishedRuns } from "./purge";
import { getThreadsAppId, getThreadsAppSecret } from "./lib/threadsApi";

/**
 * ============================================================================
 * THREADS PERSISTENCE & QUERY LAYER (V8 runtime)
 * ============================================================================
 *
 * Upravljanje stanjem veze i OAuth handshaking za Threads integraciju.
 * Svi kredencijali se čuvaju šifrovano (AES-256-GCM) preko lib/crypto.ts.
 * ============================================================================
 */

// ── OAuth handshake ──────────────────────────────────────────────────────────

/**
 * Zapisuje jednokratni OAuth `state` nonce za Threads povezivanje.
 * Takođe čisti zastarele nonces (>1h).
 */
export const createOAuthState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    nonce: v.string(),
    redirectUri: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, userId, nonce, redirectUri }) => {
    const cutoff = Date.now() - 60 * 60 * 1000;
    const stale = await ctx.db
      .query("oauthStates")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", cutoff))
      .collect();
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }

    await ctx.db.insert("oauthStates", {
      workspaceId,
      userId,
      provider: "threads",
      nonce,
      redirectUri,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Atomski pronalazi i briše OAuth `state` nonce.
 * Vraća null ako nonce ne postoji, već je iskorišćen ili pripada drugom provideru.
 */
export const consumeOAuthState = internalMutation({
  args: { nonce: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      redirectUri: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { nonce }) => {
    const row = await ctx.db
      .query("oauthStates")
      .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
      .first();
    if (row === null || row.provider !== "threads") return null;
    await ctx.db.delete(row._id);
    return {
      workspaceId: row.workspaceId,
      redirectUri: row.redirectUri,
      createdAt: row.createdAt,
    };
  },
});

// ── Konekcija ────────────────────────────────────────────────────────────────

/**
 * Čuva šifrovane kredencijale povezane Threads veze.
 * externalId = Threads user ID
 * accountHandle = @username
 */
export const saveConnectedCredentials = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    username: v.optional(v.string()),
    encryptedCredentials: v.string(),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("connections"),
  handler: async (
    ctx,
    { workspaceId, userId, username, encryptedCredentials, expiresAt },
  ) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "threads"),
      )
      .first();

    await clearFinishedRuns(ctx, workspaceId, "threads");

    const formattedHandle = username
      ? username.startsWith("@")
        ? username
        : `@${username}`
      : undefined;

    const patch = {
      externalId: userId,
      ...(formattedHandle !== undefined ? { accountHandle: formattedHandle } : {}),
      encryptedCredentials,
      status: "active" as const,
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        ...patch,
        // Sveže povezivanje poništava prethodna brisanja (R1/4c)
        generation: (existing.generation ?? 0) + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider: "threads",
      ...patch,
      generation: 1,
    });
  },
});

/**
 * Vraća podatke o aktivnoj Threads konekciji za zadati workspace.
 */
export const getConnection = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      userId: v.string(),
      username: v.union(v.string(), v.null()),
      encryptedCredentials: v.string(),
      expiresAt: v.union(v.number(), v.null()),
      status: connectionStatusValidator,
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "threads"),
      )
      .first();

    if (conn === null || !conn.externalId) return null;

    return {
      connectionId: conn._id,
      userId: conn.externalId,
      username: conn.accountHandle ?? null,
      encryptedCredentials: conn.encryptedCredentials,
      expiresAt: conn.expiresAt ?? null,
      status: conn.status,
    };
  },
});

/**
 * Ažurira datum isteka tokena i opcione nove šifrovane kredencijale nakon uspešnog osvežavanja.
 */
export const updateTokenExpiry = internalMutation({
  args: {
    connectionId: v.id("connections"),
    encryptedCredentials: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { connectionId, encryptedCredentials, expiresAt }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return null;
    await ctx.db.patch(connectionId, {
      status: "active",
      ...(encryptedCredentials !== undefined ? { encryptedCredentials } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    });
    return null;
  },
});

/**
 * Označava konekciju kao istekla (status = "expired").
 */
export const markConnectionExpired = internalMutation({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn !== null) {
      await ctx.db.patch(connectionId, { status: "expired" });
    }
    return null;
  },
});

/**
 * Označava Threads konekciju kao istekla na osnovu Meta korisničkog identifikatora (externalId).
 * Poziva se iz deauthorize callback endpointa.
 * Red se NE briše (poštuje pravilo za status u schema.ts).
 */
export const markExpiredByExternalId = mutation({
  args: { externalId: v.string() },
  returns: v.null(),
  handler: async (ctx, { externalId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "threads"))
      .filter((q) => q.eq(q.field("externalId"), externalId))
      .first();

    if (conn !== null) {
      await ctx.db.patch(conn._id, { status: "expired" });
    }
    return null;
  },
});

/**
 * Pokreće proces brisanja podataka za Threads nalog na osnovu Meta korisničkog identifikatora (externalId).
 * Poziva se iz data-deletion callback endpointa.
 * Koristi postojeći purge mehanizam (beginPurgeRun) i vraća confirmationCode.
 */
export const triggerDataDeletionByExternalId = mutation({
  args: { externalId: v.string() },
  returns: v.object({
    confirmationCode: v.string(),
  }),
  handler: async (ctx, { externalId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", "threads"))
      .filter((q) => q.eq(q.field("externalId"), externalId))
      .first();

    if (conn === null) {
      // Nalog nije pronađen — podaci ne postoje ili su već obrisani
      return { confirmationCode: `del_completed_${Date.now()}` };
    }

    if (conn.status === "disconnecting") {
      // Brisanje je već pokrenuto — pronađi aktivan ili postojeći run
      const existingRun = await ctx.db
        .query("purgeRuns")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", conn.workspaceId).eq("provider", "threads"),
        )
        .first();
      if (existingRun !== null) {
        return { confirmationCode: existingRun._id };
      }
    }

    await clearFinishedRuns(ctx, conn.workspaceId, "threads");
    await ctx.db.patch(conn._id, { status: "disconnecting" });
    const runId = await beginPurgeRun(ctx, {
      workspaceId: conn.workspaceId,
      provider: "threads",
      connectionId: conn._id,
    });

    return { confirmationCode: runId };
  },
});

/**
 * Očitava status zahteva za brisanje podataka na osnovu koda potvrde.
 */
export const getDeletionStatus = query({
  args: { confirmationCode: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      startedAt: v.number(),
      finishedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { confirmationCode }) => {
    if (confirmationCode.startsWith("del_completed_")) {
      return {
        status: "done",
        startedAt: Date.now(),
        finishedAt: Date.now(),
      };
    }
    try {
      const run = await ctx.db.get(confirmationCode as Id<"purgeRuns">);
      if (run === null) return null;
      return {
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt ?? null,
      };
    } catch {
      return null;
    }
  },
});

/**
 * Provera da li su THREADS_APP_ID i THREADS_APP_SECRET podešeni.
 */
export const setupInfo = query({
  args: {},
  returns: v.object({
    isConfigured: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireMembership(ctx);
    const appId = getThreadsAppId();
    const appSecret = getThreadsAppSecret();
    return {
      isConfigured: Boolean(appId && appSecret),
    };
  },
});
// ── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * Interna mutacija za evidentiranje primljenog Threads odgovora (replies webhook događaj).
 *
 * Idempotentnost:
 *   - Oslanja se na `id` kao prirodni ključ (Meta reply ID).
 *   - Kada tabela za Threads odgovore (npr. `threadsReplies`) bude definisana u sledećoj fazi,
 *     ovde se vrši provera postojanja po indeksu `by_reply_id` pre upisa, čime se sprečavaju duplikati
 *     pri ponovljenim isporukama od strane Mete.
 *
 * Bezbednost i privatnost:
 *   - Ne loguje se celokupan payload jer sadrži korisničko ime (`username`) i tekst odgovora (`text`) (PII).
 *   - Tajne i tokeni se nikada ne ispisuju.
 */
export const recordWebhookReply = internalMutation({
  args: {
    id: v.string(),
    accountId: v.optional(v.string()),
    field: v.optional(v.string()),
    username: v.optional(v.string()),
    text: v.optional(v.string()),
    mediaType: v.optional(v.string()),
    permalink: v.optional(v.string()),
    repliedTo: v.optional(v.any()),
    rootPost: v.optional(v.any()),
    shortcode: v.optional(v.string()),
    timestamp: v.optional(v.union(v.string(), v.number())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Bezbedno logovanje: SAMO tehnički metapodaci bez PII (username, text) i bez tajni
    console.log("[Threads webhook reply received]", {
      id: args.id,
      accountId: args.accountId,
      field: args.field,
      mediaType: args.mediaType,
      hasText: Boolean(args.text),
      hasUsername: Boolean(args.username),
    });

    // TODO (FAZA 2 - Tabela za odgovore):
    // Kada se u `convex/schema.ts` definise tabela za Threads odgovore (npr. `threadsReplies` sa indeksom "by_reply_id", ["replyId"]):
    // 1. Provera postojanja odgovora po prirodnom kljucu (`id`):
    //    const existing = await ctx.db
    //      .query("threadsReplies")
    //      .withIndex("by_reply_id", (q) => q.eq("replyId", args.id))
    //      .first();
    // 2. Idempotentni upis ako odgovor ne postoji:
    //    if (existing === null) {
    //      await ctx.db.insert("threadsReplies", {
    //        replyId: args.id,
    //        accountId: args.accountId,
    //        username: args.username,
    //        text: args.text,
    //        mediaType: args.mediaType,
    //        permalink: args.permalink,
    //        repliedTo: typeof args.repliedTo === "object" && args.repliedTo !== null ? args.repliedTo.id : args.repliedTo,
    //        rootPost: typeof args.rootPost === "object" && args.rootPost !== null ? args.rootPost.id : args.rootPost,
    //        shortcode: args.shortcode,
    //        timestamp: typeof args.timestamp === "string" ? new Date(args.timestamp).getTime() : (args.timestamp ?? Date.now()),
    //        receivedAt: Date.now(),
    //      });
    //    }

    return null;
  },
});

