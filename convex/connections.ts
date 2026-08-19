import { query, mutation, internalQuery, action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { z } from "zod";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";
import { providerValidator, type Provider } from "./lib/providers";
import { requireMembership } from "./lib/auth";
import { encryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";
import { allowsManual, readGate } from "./lib/metaRateLimit";

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

function assertServiceAccountJson(secret: string): void {
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
 * (GA4 property ID) or `undefined` when the provider has none (OpenReply).
 */
function validateCredentials(
  provider: Provider,
  externalId: string | undefined,
  secret: string,
): string | undefined {
  if (secret.length === 0) invalid("Kredencijal je prazan.");
  switch (provider) {
    case "ga4": {
      assertServiceAccountJson(secret);
      const id = (externalId ?? "").trim();
      if (!/^\d+$/.test(id)) invalid("GA4 property ID mora biti broj.");
      return id;
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
      return externalId?.trim() || undefined;
    }
    case "google_ads": {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(secret);
      } catch {
        invalid("Google Ads kredencijali moraju biti validan JSON format.");
      }
      const devToken = String(
        parsed.developerToken || parsed.developer_token || "",
      ).trim();
      const clientId = String(
        parsed.clientId || parsed.client_id || "",
      ).trim();
      const clientSecret = String(
        parsed.clientSecret || parsed.client_secret || "",
      ).trim();
      const refreshToken = String(
        parsed.refreshToken || parsed.refresh_token || "",
      ).trim();
      const customerId = String(
        parsed.customerId || parsed.customer_id || externalId || "",
      )
        .trim()
        .replace(/-/g, "");

      if (!devToken) invalid("Nedostaje Developer Token.");
      if (!clientId || !clientSecret)
        invalid("Nedostaju OAuth Client ID ili Client Secret.");
      if (!refreshToken) invalid("Nedostaje OAuth Refresh Token.");
      if (!customerId || !/^\d{10}$/.test(customerId)) {
        invalid("Customer ID mora imati 10 cifara (npr. 123-456-7890).");
      }
      return customerId;
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
      return channelId;
    }
    default:
      return externalId?.trim() || undefined;
  }
}

// ── queries ──────────────────────────────────────────────────────────────────

const connectionViewValidator = v.object({
  _id: v.id("connections"),
  _creationTime: v.number(),
  provider: providerValidator,
  status: v.union(
    v.literal("active"),
    v.literal("error"),
    v.literal("expired"),
  ),
  externalId: v.union(v.string(), v.null()),
  lastSyncAt: v.union(v.number(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
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
      lastSyncAt: c.lastSyncAt ?? null,
      expiresAt: c.expiresAt ?? null,
    }));
  },
});

// ── mutations ────────────────────────────────────────────────────────────────

/** Create or update a provider's credentials (encrypted before write). */
export const save = mutation({
  args: {
    provider: providerValidator,
    externalId: v.optional(v.string()),
    secret: v.string(),
  },
  handler: async (ctx, { provider, externalId, secret }) => {
    const { workspaceId } = await requireMembership(ctx);

    const trimmedSecret = secret.trim();
    const normalizedExternalId = validateCredentials(
      provider,
      externalId,
      trimmedSecret,
    );

    const encryptedCredentials = await encryptCredentials(trimmedSecret);

    const existing = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .unique();

    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        encryptedCredentials,
        status: "active",
        ...(normalizedExternalId !== undefined
          ? { externalId: normalizedExternalId }
          : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("connections", {
      workspaceId,
      provider,
      encryptedCredentials,
      status: "active",
      ...(normalizedExternalId !== undefined
        ? { externalId: normalizedExternalId }
        : {}),
    });
  },
});

/** Disconnect an integration (deletes stored credentials). */
export const remove = mutation({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const conn = await ctx.db.get(connectionId);
    if (conn === null || conn.workspaceId !== workspaceId) {
      throw new ConvexError({ code: "forbidden" });
    }

    // YouTube's Developer Policies require data retrieved from the API to be
    // deleted when the authorization is revoked — not merely left unsynced. So
    // disconnecting the channel erases every yt* table for this workspace, in
    // rescheduled batches (`ytPurge`), rather than orphaning years of channel
    // statistics and comment logs. The dialog in Settings says so out loud.
    if (conn.provider === "youtube") {
      await ctx.scheduler.runAfter(0, internal.ytPurge.purgeYouTubeData, {
        workspaceId,
      });
    }

    await ctx.db.delete(connectionId);
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
    return rows.map((c) => c._id);
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
