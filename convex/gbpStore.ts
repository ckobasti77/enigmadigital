import { internalMutation, internalQuery, query } from "./_generated/server";
import { v } from "convex/values";
import { requireMembership } from "./lib/auth";
import { clearFinishedRuns } from "./purge";
import { connectionStatusValidator } from "./lib/providers";
import { getGbpClientId, getGbpClientSecret } from "./lib/gbpApi";

/**
 * Google Business Profile (GBP) sloj za perzistenciju i upite (V8 runtime, GB1).
 *
 * Upravlja stanjem pristupa (`gbAccessState`), OAuth nonce parametrima (`oauthStates`)
 * i vezom radnog prostora u `connections` tabeli.
 */

// ── OAuth state menadžment ──────────────────────────────────────────────────

/**
 * Zapisuje jednokratni `state` nonce za Google Business OAuth tok.
 * Čisti zastarele nonce-ove (>1h) kako se napušteni pokušaji ne bi gomilali.
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
      provider: "google_business",
      nonce,
      redirectUri,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Atomski troši (pronalazi i odmah briše) OAuth `state` nonce.
 * Vraća null ako je nonce nepoznat, falsifikovan, već iskorišćen ili počišćen.
 * Brisanje se dešava odmah kako bi nonce bio striktno jednokratan.
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
    if (row === null || row.provider !== "google_business") return null;
    await ctx.db.delete(row._id);
    return {
      workspaceId: row.workspaceId,
      redirectUri: row.redirectUri,
      createdAt: row.createdAt,
    };
  },
});

// ── Kredencijali i veza ─────────────────────────────────────────────────────

/**
 * Čuva šifrovane kredencijale za povezanu Google Business Profile vezu.
 */
export const saveConnectedCredentials = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    encryptedCredentials: v.string(),
  },
  returns: v.id("connections"),
  handler: async (ctx, { workspaceId, encryptedCredentials }) => {
    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "google_business"),
      )
      .first();

    await clearFinishedRuns(ctx, workspaceId, "google_business");

    const patch = {
      encryptedCredentials,
      status: "active" as const,
    };

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        ...patch,
        generation: (existing.generation ?? 0) + 1,
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider: "google_business",
      ...patch,
      generation: 1,
    });
  },
});

/**
 * Dohvata aktivnu Google Business vezu za radni prostor.
 */
export const getGbConnection = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("connections"),
      encryptedCredentials: v.string(),
      status: connectionStatusValidator,
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "google_business"),
      )
      .first();
    if (!connection) return null;
    return {
      _id: connection._id,
      encryptedCredentials: connection.encryptedCredentials,
      status: connection.status,
    };
  },
});

// ── Stanje pristupa API-ju (gbAccessState) ──────────────────────────────────

export const accessOutcomeValidator = v.union(
  v.literal("nikad_pozvano"),
  v.literal("uspesno"),
  v.literal("kvota_nula"),
  v.literal("kvota_prekoracena"),
  v.literal("servis_nije_ukljucen"),
  v.literal("nema_dozvole"),
  v.literal("nepoznato"),
);

/**
 * Zapisuje ishod provere pristupa u `gbAccessState`.
 *
 * PRAVILO: `everSucceededAt` se postavlja SAMO pri prvom uspehu i NIKADA se ne briše
 * kasnijim neuspehom — činjenica da je jednom radilo je trajna činjenica.
 */
export const recordAccessOutcome = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    outcome: accessOutcomeValidator,
    status: v.optional(v.number()),
    reason: v.optional(v.string()),
    checkedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, outcome, status, reason, checkedAt }) => {
    const existing = await ctx.db
      .query("gbAccessState")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    if (existing === null) {
      await ctx.db.insert("gbAccessState", {
        workspaceId,
        lastOutcome: outcome,
        lastCheckedAt: checkedAt,
        lastStatus: status,
        lastReason: reason,
        everSucceededAt: outcome === "uspesno" ? checkedAt : undefined,
        updatedAt: checkedAt,
      });
      return null;
    }

    // Čuvamo postojeći timestamp prvog uspeha ako postoji; ako ne postoji a ovaj poziv
    // je uspešan, beležimo ga sada.
    const everSucceededAt =
      existing.everSucceededAt ?? (outcome === "uspesno" ? checkedAt : undefined);

    await ctx.db.patch(existing._id, {
      lastOutcome: outcome,
      lastCheckedAt: checkedAt,
      lastStatus: status,
      lastReason: reason,
      everSucceededAt,
      updatedAt: checkedAt,
    });
    return null;
  },
});

/**
 * Vraća stanje pristupa Google Business API-ju za aktivni radni prostor prijavljenog korisnika.
 */
export const getAccessState = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("gbAccessState"),
      _creationTime: v.number(),
      workspaceId: v.id("workspaces"),
      lastOutcome: accessOutcomeValidator,
      lastCheckedAt: v.optional(v.number()),
      lastStatus: v.optional(v.number()),
      lastReason: v.optional(v.string()),
      everSucceededAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    return await ctx.db
      .query("gbAccessState")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
  },
});

/**
 * Proverava da li su Google Business OAuth env promenljive konfigurisane.
 */
export const setupInfo = query({
  args: {},
  returns: v.object({
    isConfigured: v.boolean(),
  }),
  handler: async (ctx) => {
    await requireMembership(ctx);
    const clientId = getGbpClientId();
    const clientSecret = getGbpClientSecret();
    return {
      isConfigured: Boolean(clientId && clientSecret),
    };
  },
});
