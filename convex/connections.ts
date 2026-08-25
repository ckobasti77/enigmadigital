import { query, mutation, internalQuery, action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { z } from "zod";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import {
  connectionStatusValidator,
  providerValidator,
  type Provider,
} from "./lib/providers";
import { requireMembership, requireOwner } from "./lib/auth";
import { encryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";
import { allowsManual, readGate } from "./lib/metaRateLimit";
import { beginPurgeRun, clearFinishedRuns } from "./purge";
import { purgeSteps } from "./lib/purgeMap";
import {
  readGate as readAdsQuotaGate,
  allowsManual as adsQuotaAllowsManual,
} from "./lib/metaAdsQuota";

import { normalizeCustomerId } from "./lib/googleAdsShared";

// ── credential validation (runs BEFORE encryption; never echoes the secret) ──

const serviceAccountSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().min(1),
});

function invalid(message: string): never {
  // Generic, secret-free message the Settings form can show inline.
  throw new ConvexError({ code: "invalid", message });
}

export function assertServiceAccountJson(secret: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    invalid("Servisni nalog nije validan JSON.");
  }
  const result = serviceAccountSchema.safeParse(parsed);
  if (
    !result.success ||
    !result.data.private_key.includes("PRIVATE KEY") ||
    !result.data.client_email.includes("@")
  ) {
    invalid(
      "Servisni nalog nije ispravan (potrebni type=service_account, project_id, client_email, private_key).",
    );
  }
}

/**
 * Validate provider-specific credentials and return the normalized externalId
 * (GA4 property ID, Customer ID, etc.) and optional externalIdAlt (Manager ID, etc.)
 */
export function validateCredentials(
  provider: Provider,
  externalId: string | undefined,
  secret: string,
  externalIdAlt?: string,
): { externalId?: string; externalIdAlt?: string } {
  if (secret.length === 0) invalid("Kredencijal je prazan.");
  switch (provider) {
    case "ga4": {
      assertServiceAccountJson(secret);
      const id = (externalId ?? "").trim();
      if (!/^\d+$/.test(id)) invalid("GA4 property ID mora biti broj.");
      return { externalId: id };
    }
    case "openreply": {
      invalid(
        "OpenReply se uključuje u Podešavanjima, ne prima kredencijale.",
      );
    }
    case "meta_fb": {
      // The Page Access Token is minted by the OAuth flow and never pasted by
      // hand: it is derived from a user token that has to be stored alongside
      // it, and a token pasted here would arrive without one.
      invalid(
        "Facebook stranica se povezuje dugmetom „Poveži Facebook stranicu” u Podešavanjima.",
      );
    }
    case "meta_ads": {
      if (secret.length < 10) {
        invalid("Meta System User token nije ispravan.");
      }
      return { externalId: externalId?.trim() || undefined };
    }
    case "google_ads": {
      assertServiceAccountJson(secret);
      const rawCustomerId = (externalId ?? "").trim();
      if (!rawCustomerId) {
        invalid("Customer ID je obavezan.");
      }
      const customerId = normalizeCustomerId(rawCustomerId);
      let loginCustomerId: string | undefined = undefined;
      if (externalIdAlt && externalIdAlt.trim() !== "") {
        loginCustomerId = normalizeCustomerId(externalIdAlt);
      }
      return { externalId: customerId, externalIdAlt: loginCustomerId };
    }
    case "youtube": {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(secret);
      } catch {
        invalid("YouTube kredencijali moraju biti validan JSON format.");
      }
      const clientId = String(
        parsed.clientId || parsed.client_id || "",
      ).trim();
      const clientSecret = String(
        parsed.clientSecret || parsed.client_secret || "",
      ).trim();
      const refreshToken = String(
        parsed.refreshToken || parsed.refresh_token || "",
      ).trim();
      const channelId = String(
        parsed.channelId || parsed.channel_id || externalId || "",
      ).trim();

      if (!clientId || !clientSecret)
        invalid("Nedostaju OAuth Client ID ili Client Secret.");
      if (!refreshToken) invalid("Nedostaje OAuth Refresh Token.");
      // Canonical YouTube channel ID: "UC" + 22 url-safe base64 chars.
      if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) {
        invalid("Channel ID mora biti u obliku UC… (24 znaka).");
      }
      return { externalId: channelId };
    }
    default:
      return { externalId: externalId?.trim() || undefined };
  }
}

// ── queries ──────────────────────────────────────────────────────────────────

const connectionViewValidator = v.object({
  _id: v.id("connections"),
  _creationTime: v.number(),
  provider: providerValidator,
  status: connectionStatusValidator,
  externalId: v.union(v.string(), v.null()),
  externalIdAlt: v.optional(v.union(v.string(), v.null())),
  accountHandle: v.optional(v.union(v.string(), v.null())),
  lastSyncAt: v.union(v.number(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  // meta_fb only: "system_user" marks a non-expiring System User Page token, so
  // the card can hide the refresh/picker controls and say "Ne ističe". `null`
  // reads as the OAuth path. Never any secret — just the mode.
  authMode: v.union(
    v.literal("oauth"),
    v.literal("system_user"),
    v.null(),
  ),
});

/**
 * Connections for the caller's workspace — SAFE fields only. The explicit
 * `returns` validator has no `encryptedCredentials`, so an accidental leak
 * becomes a hard runtime error. Plaintext is never fetched here at all.
 */
export const list = query({
  args: {},
  returns: v.array(connectionViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();
    return rows.map((c) => ({
      _id: c._id,
      _creationTime: c._creationTime,
      provider: c.provider,
      status: c.status,
      externalId: c.externalId ?? null,
      externalIdAlt: c.externalIdAlt ?? null,
      accountHandle: c.accountHandle ?? null,
      lastSyncAt: c.lastSyncAt ?? null,
      expiresAt: c.expiresAt ?? null,
      authMode: c.authMode ?? null,
    }));
  },
});

// ── mutations ────────────────────────────────────────────────────────────────

/**
 * Create or update a provider's credentials (encrypted before write).
 *
 * Owner-only (R1/6). It calls `clearFinishedRuns` — the record that a purge ran
 * — and flips a `disconnecting` row back to `active`, which is the reconnect
 * that closes the purge race. `client_viewer`, a role that exists in order to
 * only look at things, must not be able to reach either. The UI already hides
 * the form from a viewer, so anyone who hits this got here some other way.
 */
export const save = mutation({
  args: {
    provider: providerValidator,
    externalId: v.optional(v.string()),
    externalIdAlt: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { provider, externalId, externalIdAlt, secret }) => {
    const { workspaceId } = await requireOwner(ctx);

    const trimmedSecret = secret.trim();
    const validated = validateCredentials(
      provider,
      externalId,
      trimmedSecret,
      externalIdAlt,
    );

    const encryptedCredentials = await encryptCredentials(trimmedSecret);

    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .unique();

    // A "Podaci obrisani" notice belongs to the connection that was erased, not
    // to the one being made right now (P3). A run still in flight is left
    // alone: it is deleting rows this second, and the card has to keep saying
    // so until it stops.
    await clearFinishedRuns(ctx, workspaceId, provider);

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        encryptedCredentials,
        status: "active",
        // A fresh grant on this row (R1/4c). Any purge run still pointing at the
        // old generation stops the moment it next checks, so it cannot reach the
        // data this reconnect is about to sync.
        generation: (existing.generation ?? 0) + 1,
        ...(validated.externalId !== undefined
          ? { externalId: validated.externalId }
          : {}),
        ...(validated.externalIdAlt !== undefined
          ? { externalIdAlt: validated.externalIdAlt }
          : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider,
      encryptedCredentials,
      status: "active",
      generation: 1,
      ...(validated.externalId !== undefined
        ? { externalId: validated.externalId }
        : {}),
      ...(validated.externalIdAlt !== undefined
        ? { externalIdAlt: validated.externalIdAlt }
        : {}),
    });
  },
});

/**
 * Disconnect an integration: revoke the grant, erase everything pulled from it,
 * and only then forget the connection.
 *
 * Two things changed here in P3, and both were the difference between the
 * dialog's promise and what the code did.
 *
 * The row is no longer deleted first. It used to go in the same transaction
 * that merely SCHEDULED the erasure, so the mutation reported success before a
 * single row had been removed, and an erasure that then died halfway was
 * indistinguishable from one that finished. Worse, with the connection gone
 * nothing indexed "this workspace has YouTube data and no YouTube connection" —
 * the leftovers were unreachable by any cron, query or admin path. Now the row
 * is flagged `disconnecting` and stays until `purgeRuns` says the last step
 * came back empty.
 *
 * And it takes the owner role. `requireMembership` hands back any membership
 * regardless of `role`, which meant `client_viewer` — a role that exists in
 * order to only look at things — could irreversibly erase a workspace's whole
 * dataset.
 */
export const remove = mutation({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }) => {
    const { workspaceId } = await requireOwner(ctx);
    const conn = await ctx.db.get(connectionId);
    if (conn === null || conn.workspaceId !== workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }
    if (conn.status === "disconnecting") {
      // Already under way. Pressing the button twice must not open a second
      // run against the same tables.
      return null;
    }

    // Every provider that stores anything gets the same treatment. YouTube's
    // Developer Policies are what forced the question, but Instagram, the Page,
    // GA4 and the ad platforms hold the same class of data under the same kind
    // of obligation — and code that answers one question two ways is a bug
    // waiting for whoever reads it next (`lib/purgeMap.ts` is the list).
    if (purgeSteps(conn.provider).length === 0) {
      await ctx.db.delete(connectionId);
      return null;
    }

    await clearFinishedRuns(ctx, workspaceId, conn.provider);
    await ctx.db.patch(connectionId, { status: "disconnecting" });
    await beginPurgeRun(ctx, {
      workspaceId,
      provider: conn.provider,
      connectionId,
    });
    return null;
  },
});

// ── internal (server-only) ───────────────────────────────────────────────────

/**
 * Full connection doc INCLUDING ciphertext — internal-only, for the "use node"
 * sync actions (M3+) that decrypt at sync time. Must never be public.
 */
export const getForSync = internalQuery({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    return await ctx.db.get(connectionId);
  },
});

/**
 * All connection IDs for a provider, across workspaces — used by cron fan-outs.
 */
export const listByProvider = internalQuery({
  args: { provider: providerValidator },
  returns: v.array(v.id("connections")),
  handler: async (ctx, { provider }) => {
    const rows = await ctx.db
      .query("connections")
      .withIndex("by_provider", (q) => q.eq("provider", provider))
      .collect();
    // A connection mid-erasure has no credentials left (P3): the revoke step
    // wipes them before the deletions start. Handing its id to a cron fan-out
    // would only produce a `syncRuns` failure row for an integration the
    // operator has already disconnected.
    return rows
      .filter((c) => c.status !== "disconnecting")
      .map((c) => c._id);
  },
});

/** Authorize a caller against a connection's workspace; returns non-secret fields. */
export const authorizeForSync = internalQuery({
  args: { connectionId: v.id("connections"), userId: v.id("users") },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      provider: providerValidator,
    }),
  ),
  handler: async (ctx, { connectionId, userId }) => {
    const conn = await ctx.db.get(connectionId);
    if (conn === null) return null;
    // Mid-erasure the credentials are already gone (P3), so there is nothing
    // left to sync with — refuse rather than record a failed run.
    if (conn.status === "disconnecting") return null;
    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (membership === null || membership.workspaceId !== conn.workspaceId) {
      return null;
    }
    return { workspaceId: conn.workspaceId, provider: conn.provider };
  },
});

/** Return GA4 connection for a workspace (internal for realtime/sync). */
export const getGa4ForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "ga4"),
      )
      .first();
    if (conn === null || conn.status === "disconnecting") return null;
    return conn;
  },
});

/** Return Meta Ads connection for a workspace (internal for audiences/sync). */
export const getMetaAdsForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "meta_ads"),
      )
      .first();
    if (conn === null || conn.status === "disconnecting") return null;
    return conn;
  },
});

// ── manual trigger ───────────────────────────────────────────────────────────

/**
 * "Sync now" — triggers the connection's real sync so a `syncRuns` row lands in
 * the Sync Health widget. GA4 (M3) dispatches to the `"use node"` `syncGa4`
 * action, which records its own run. Providers not yet implemented fall back to
 * a no-op run so the button still gives feedback.
 */
export const syncNow = action({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new ConvexError({ code: "unauthorized" });

    const authorized = await ctx.runQuery(
      internal.connections.authorizeForSync,
      { connectionId, userId },
    );
    if (authorized === null) throw new ConvexError({ code: "forbidden" });

    // Meta's allowance is shared by the Instagram account and the Page, and a
    // full sync is the most expensive thing this app can ask for. Near the
    // ceiling it is refused OUT LOUD rather than run and blocked halfway: the
    // background schedules keep the screen current anyway, and a person who
    // pressed a button deserves a sentence, not a spinner that ends in nothing.
    if (authorized.provider === "meta_ig" || authorized.provider === "meta_fb") {
      const gate = await readGate(ctx, authorized.workspaceId);
      if (!allowsManual(gate)) {
        // No clock time in this sentence on purpose: the server runs in UTC and
        // the person reading it does not. The banner on the screen already says
        // when, in their own time zone.
        throw new ConvexError({
          code: "rate_limited",
          message:
            "Meta trenutno ograničava pozive. Sinhronizacija se nastavlja sama čim se limit oslobodi.",
        });
      }
    }

    if (authorized.provider === "ga4") {
      // syncGa4 wraps its own runSync; a failure re-throws here so the button
      // can surface it (the error is already recorded on syncRuns either way).
      await ctx.runAction(internal.ga4.syncGa4, { connectionId });
      return;
    }


    if (authorized.provider === "meta_ig") {
      await ctx.runAction(internal.instagram.syncIgInsights, { connectionId });
      return;
    }

    if (authorized.provider === "meta_fb") {
      await ctx.runAction(internal.facebook.syncFacebook, { connectionId });
      return;
    }

    if (authorized.provider === "meta_ads") {
      // Ručno pokretanje prolazi i na „warn”, staje tek na „stop” (MA1) —
      // uključujući blokadu koju je Meta izričito najavila.
      const adsGate = await readAdsQuotaGate(ctx, authorized.workspaceId);
      if (!adsQuotaAllowsManual(adsGate)) {
        throw new Error(
          adsGate.blockedUntil !== undefined
            ? "Meta je ograničila Marketing API. Sačekaj da blokada istekne pa probaj ponovo."
            : `Kvota Meta oglasa je iskorišćena ${Math.round(adsGate.peakPct)} %. Sačekaj da se prozor od sat vremena obnovi.`,
        );
      }
      await ctx.runAction(internal.metaAds.syncAdsStructure, { connectionId });
      await ctx.runAction(internal.metaAds.syncAdsInsights, {
        connectionId,
        mode: "cold_all",
      });
      return;
    }

    if (authorized.provider === "google_ads") {
      await ctx.runAction(internal.googleAds.syncGoogleAds, { connectionId });
      return;
    }

    if (authorized.provider === "youtube") {
      await ctx.runAction(internal.youtube.syncYouTube, { connectionId });
      return;
    }

    if (authorized.provider === "threads") {
      await ctx.runAction(internal.threads.syncThreads, { connectionId });
      return;
    }

    await runSync(
      ctx,
      {
        workspaceId: authorized.workspaceId,
        provider: authorized.provider,
        connectionId,
      },
      async () => 0,
    );
  },
});
