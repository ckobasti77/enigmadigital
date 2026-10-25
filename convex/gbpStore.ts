import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  oauthStanjeArgs,
  potrosenoStanjeValidator,
  potrosiOAuthStanje,
  upisiOAuthStanje,
} from "./lib/oauthPovratak";
import { projekatQuery } from "./lib/projekat";
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
  args: oauthStanjeArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await upisiOAuthStanje(ctx, { ...args, provider: "google_business" });
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
  returns: v.union(v.null(), potrosenoStanjeValidator),
  handler: async (ctx, { nonce }) => await potrosiOAuthStanje(ctx, nonce, "google_business"),
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
 * Vraća stanje pristupa Google Business API-ju za projekat prijavljenog korisnika.
 */
export const getAccessState = projekatQuery({
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
    const { workspaceId } = ctx.projekat;
    return await ctx.db
      .query("gbAccessState")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
  },
});

/**
 * Proverava da li su Google Business OAuth env promenljive konfigurisane.
 */
export const setupInfo = projekatQuery({
  args: {},
  returns: v.object({
    isConfigured: v.boolean(),
  }),
  handler: async () => {
    const clientId = getGbpClientId();
    const clientSecret = getGbpClientSecret();
    return {
      isConfigured: Boolean(clientId && clientSecret),
    };
  },
});
