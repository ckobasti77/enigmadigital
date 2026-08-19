"use node";

import { randomUUID } from "node:crypto";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials, encryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";
import {
  INSTAGRAM_OAUTH_TOKEN_URL,
  getMetaGraphVersion,
  buildInstagramAuthorizeUrl,
  buildLongLivedTokenUrl,
  buildRefreshTokenUrl,
  buildMeUrl,
  buildMeInsightsUrl,
  buildMeMediaUrl,
  buildMediaInsightsUrl,
  getMetricsForMediaType,
  extractAccountInsights,
  extractMediaInsights,
  extractGraphApiError,
  normalizeMediaChildren,
  type RawOAuthTokenResponse,
  type RawLongLivedTokenResponse,
  type RawUserProfile,
  type RawInsightsResponse,
  type RawMediaListResponse,
} from "./lib/instagramApi";

/**
 * ============================================================================
 * INSTAGRAM ACTIONS & SYNC (Node Runtime)
 * ============================================================================
 *
 * Implements:
 *   1. OAuth config & Connect Flow ("Instagram API with Instagram Login")
 *   2. Token Refresh Cron & Manual Refresh Action (60-day lifecycle)
 *   3. syncIgInsights: Account Snapshot + Last 30 Media with per-media insights
 *   4. Cron fan-out for 6h insights sync & 24h token refresh
 *
 * All operations execute within `runSync` for unified logging in `syncRuns`.
 * ============================================================================
 */

const REFRESH_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000; // 10 days before expiry (i.e. ~50 days old)

// ── OAuth Handshake ──────────────────────────────────────────────────────────

/**
 * Check if the Meta developer app environment variables are configured.
 * When missing, the Settings card displays a waiting status.
 */
export const getOAuthConfig = action({
  args: {},
  handler: async (): Promise<{ isConfigured: boolean; appId: string | null }> => {
    const appId = process.env.INSTAGRAM_APP_ID?.trim();
    const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
    const isConfigured = Boolean(appId && appSecret);
    return {
      isConfigured,
      appId: appId ?? null,
    };
  },
});

/**
 * Generate Instagram Business Login URL for starting OAuth from the client.
 *
 * Requires an authenticated workspace member: a one-time `state` nonce is
 * persisted (workspace + redirectUri) so the PUBLIC callback route can finish
 * the token exchange server-side, with no dependency on the browser session.
 */
export const getOAuthUrl = action({
  args: {
    redirectUri: v.string(),
    state: v.optional(v.string()), // ignored; kept for signature compatibility
  },
  handler: async (ctx, { redirectUri }): Promise<{ url: string }> => {
    const clientId = process.env.INSTAGRAM_APP_ID?.trim();
    if (!clientId) {
      throw new ConvexError({
        code: "invalid",
        message: "Čeka Meta app — dodaj INSTAGRAM_APP_ID/SECRET u env",
      });
    }

    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }
    const member: {
      workspaceId: Id<"workspaces">;
      role: "owner" | "client_viewer";
    } | null = await ctx.runQuery(internal.instagramStore.getMembership, {
      userId,
    });
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const nonce = randomUUID();
    await ctx.runMutation(internal.instagramStore.createOAuthState, {
      workspaceId: member.workspaceId,
      userId,
      nonce,
      redirectUri,
    });

    const url = buildInstagramAuthorizeUrl({
      clientId,
      redirectUri,
      state: nonce,
    });

    return { url };
  },
});

export interface OAuthResult {
  success: boolean;
  connectionId: Id<"connections">;
  igUserId: string;
  username: string | null;
  expiresAt: number;
}

/**
 * Shared OAuth code-exchange pipeline:
 *   1. Code -> Short-lived token
 *   2. Short-lived token -> Long-lived token (60 days)
 *   3. Retrieve IG user ID & username
 *   4. Encrypt and persist credentials to `connections` table
 *   5. Trigger an initial sync attempt
 *
 * Called from `completeOAuth` (authenticated client) and
 * `completeOAuthFromCallback` (public callback route, workspace resolved via
 * the one-time `state` nonce).
 */
async function exchangeCodeAndConnect(
  ctx: ActionCtx,
  {
    workspaceId,
    code,
    redirectUri,
  }: {
    workspaceId: Id<"workspaces">;
    code: string;
    redirectUri: string;
  },
): Promise<OAuthResult> {
  {
    const appId = process.env.INSTAGRAM_APP_ID?.trim();
    const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
    const version = getMetaGraphVersion();

    if (!appId || !appSecret) {
      throw new ConvexError({
        code: "invalid",
        message: "Čeka Meta app — dodaj INSTAGRAM_APP_ID/SECRET u env",
      });
    }

    // 1. Exchange authorization code for short-lived token
    const tokenParams = new URLSearchParams();
    tokenParams.set("client_id", appId);
    tokenParams.set("client_secret", appSecret);
    tokenParams.set("grant_type", "authorization_code");
    tokenParams.set("redirect_uri", redirectUri);
    tokenParams.set("code", code);

    const tokenRes = await fetch(INSTAGRAM_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text().catch(() => "");
      throw new ConvexError({
        code: "invalid",
        message: `Greška pri preuzimanju tokena: ${extractGraphApiError(errBody)}`,
      });
    }

    const shortLivedData = (await tokenRes.json()) as RawOAuthTokenResponse;
    const shortLivedToken = shortLivedData.access_token;
    console.log(
      "IG OAuth odobrene permisije:",
      Array.isArray(shortLivedData.permissions)
        ? shortLivedData.permissions.join(",")
        : "(nema polja permissions)",
    );
    if (!shortLivedToken) {
      throw new ConvexError({
        code: "invalid",
        message: "Instagram nije vratio access token.",
      });
    }

    // 2. Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = buildLongLivedTokenUrl(
      appSecret,
      shortLivedToken,
      version,
    );
    const longLivedRes = await fetch(longLivedUrl);

    if (!longLivedRes.ok) {
      const errBody = await longLivedRes.text().catch(() => "");
      throw new ConvexError({
        code: "invalid",
        message: `Greška pri zameni za dugotrajni token: ${extractGraphApiError(errBody)}`,
      });
    }

    const longLivedData =
      (await longLivedRes.json()) as RawLongLivedTokenResponse;
    const longLivedToken = longLivedData.access_token;
    const expiresInSeconds = longLivedData.expires_in || 5184000; // default 60 days
    const expiresAt = Date.now() + expiresInSeconds * 1000;

    // 3. Fetch Instagram user ID and profile info
    let igUserId = shortLivedData.user_id ? String(shortLivedData.user_id) : "";
    let username: string | undefined;
    let igProfessionalId: string | undefined;

    try {
      const meRes = await fetch(buildMeUrl(longLivedToken, version));
      if (meRes.ok) {
        const raw = (await meRes.json()) as
          | RawUserProfile
          | { data?: RawUserProfile[] };
        const profile: RawUserProfile =
          "data" in raw && Array.isArray(raw.data) && raw.data.length > 0
            ? raw.data[0]
            : (raw as RawUserProfile);
        if (profile.id) igUserId = String(profile.id);
        username = profile.username;
        igProfessionalId =
          profile.user_id !== undefined ? String(profile.user_id) : undefined;
      }
    } catch {
      // Fall back to shortLivedData.user_id if /me lookup fails
    }

    if (!igUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Nije moguće utvrditi Instagram korisnički ID.",
      });
    }

    // 4. Encrypt and persist connection
    const encryptedCredentials = await encryptCredentials(longLivedToken);
    const connectionId: Id<"connections"> = await ctx.runMutation(
      internal.instagramStore.saveConnectedCredentials,
      {
        workspaceId,
        externalId: igUserId,
        externalIdAlt: igProfessionalId,
        encryptedCredentials,
        expiresAt,
      },
    );

    // 5. Trigger initial sync in background
    try {
      await ctx.runAction(internal.instagram.syncIgInsights, { connectionId });
    } catch {
      // Errors will be recorded on syncRuns table
    }

    return {
      success: true,
      connectionId,
      igUserId,
      username: username ?? null,
      expiresAt,
    };
  }
}

/**
 * Complete OAuth from the authenticated client (legacy path — used by the
 * Settings page when the code arrives via URL/localStorage fallback).
 */
export const completeOAuth = action({
  args: {
    code: v.string(),
    redirectUri: v.string(),
  },
  handler: async (ctx, { code, redirectUri }): Promise<OAuthResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member: {
      workspaceId: Id<"workspaces">;
      role: "owner" | "client_viewer";
    } | null = await ctx.runQuery(internal.instagramStore.getMembership, {
      userId,
    });
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    return exchangeCodeAndConnect(ctx, {
      workspaceId: member.workspaceId,
      code,
      redirectUri,
    });
  },
});

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // authorize -> callback within 15 min

/**
 * Complete OAuth from the PUBLIC callback route (no browser session needed).
 * The one-time `state` nonce — created by `getOAuthUrl` for an authenticated
 * member — both authenticates the request and resolves the target workspace.
 * The redirectUri used for the token exchange is the one stored with the
 * nonce, guaranteeing an exact match with the authorize request.
 */
export const completeOAuthFromCallback = action({
  args: {
    state: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { state, code }): Promise<OAuthResult> => {
    const stored: {
      workspaceId: Id<"workspaces">;
      redirectUri: string;
      createdAt: number;
    } | null = await ctx.runMutation(internal.instagramStore.consumeOAuthState, {
      nonce: state,
    });

    if (stored === null) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Nepoznat ili već iskorišćen state parametar. Pokreni povezivanje ponovo iz Podešavanja.",
      });
    }
    if (Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS) {
      throw new ConvexError({
        code: "invalid",
        message: "Autorizacija je istekla. Pokreni povezivanje ponovo.",
      });
    }

    return exchangeCodeAndConnect(ctx, {
      workspaceId: stored.workspaceId,
      code,
      redirectUri: stored.redirectUri,
    });
  },
});

// ── Token Refresh ────────────────────────────────────────────────────────────

/**
 * Refresh a single long-lived token for an existing connection.
 * Can be triggered manually or via the daily cron.
 */
export const refreshConnectionToken = internalAction({
  args: {
    connectionId: v.id("connections"),
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { connectionId, force = false },
  ): Promise<{
    success?: boolean;
    skipped?: boolean;
    status?: string;
    reason?: string;
    expiresAt?: number;
  }> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null || conn.provider !== "meta_ig") {
      return { skipped: true, reason: "Connection not found or not meta_ig" };
    }

    const now = Date.now();
    const version = getMetaGraphVersion();

    // Check if token is older than ~50 days (less than 10 days remaining until expiresAt)
    if (!force && conn.expiresAt && conn.expiresAt - now > REFRESH_THRESHOLD_MS) {
      return { skipped: true, reason: "Token is still fresh" };
    }

    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      await ctx.runMutation(internal.instagramStore.markConnectionExpired, {
        connectionId,
      });
      return { success: false, status: "expired", reason: "Decryption failed" };
    }

    const refreshUrl = buildRefreshTokenUrl(token, version);
    try {
      const res = await fetch(refreshUrl);
      if (!res.ok) {
        // Meta refresh endpoint returned an error -> token revoked/expired
        await ctx.runMutation(internal.instagramStore.markConnectionExpired, {
          connectionId,
        });
        return {
          success: false,
          status: "expired",
          reason: "Meta refresh endpoint returned error",
        };
      }

      const data = (await res.json()) as RawLongLivedTokenResponse;
      if (!data.access_token) {
        await ctx.runMutation(internal.instagramStore.markConnectionExpired, {
          connectionId,
        });
        return {
          success: false,
          status: "expired",
          reason: "No access token in response",
        };
      }

      const newEncrypted = await encryptCredentials(data.access_token);
      const expiresInSeconds = data.expires_in || 5184000;
      const newExpiresAt = now + expiresInSeconds * 1000;

      await ctx.runMutation(internal.instagramStore.updateRefreshedToken, {
        connectionId,
        encryptedCredentials: newEncrypted,
        expiresAt: newExpiresAt,
      });

      return { success: true, status: "active", expiresAt: newExpiresAt };
    } catch {
      await ctx.runMutation(internal.instagramStore.markConnectionExpired, {
        connectionId,
      });
      return {
        success: false,
        status: "expired",
        reason: "Network or API failure",
      };
    }
  },
});

/**
 * Daily cron fan-out: refresh long-lived tokens older than ~50 days.
 */
export const refreshAllTokens = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const connectionIds: Id<"connections">[] = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "meta_ig" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.instagram.refreshConnectionToken, {
          connectionId,
        });
      } catch {
        // Continue to next connection
      }
    }
  },
});

// ── Insights Synchronization ────────────────────────────────────────────────

/**
 * Instagram Insights sync (PLAN.md §4, M5).
 *
 * Pulls:
 *   1. Account snapshot -> igAccountDaily (followers_count, reach, profile_views, accounts_engaged)
 *   2. Last 30 media with per-media insights -> igMediaStats (likes, comments, reach, saves, shares, views)
 *
 * Wrapped in `runSync` for logging to `syncRuns`.
 * Gracefully handles metric differences between REELS and static posts.
 * An error on an individual media item will NEVER fail the entire sync run.
 */
export const syncIgInsights = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }): Promise<void> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null) {
      throw new Error("Instagram konekcija nije pronađena.");
    }
    if (conn.provider !== "meta_ig") {
      throw new Error("Konekcija nije Instagram provajder.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    await runSync(
      ctx,
      { workspaceId, provider: "meta_ig", connectionId },
      async (): Promise<number> => {
        if (!conn.encryptedCredentials) {
          throw new Error("Instagram nije povezan.");
        }

        let token: string;
        try {
          token = await decryptCredentials(conn.encryptedCredentials);
        } catch {
          throw new Error("Neuspela dekripcija Instagram kredencijala.");
        }

        const version = getMetaGraphVersion();
        const now = Date.now();
        const today = new Date(now).toISOString().slice(0, 10);

        // 1. Fetch User Profile for followers_count
        let followersCount = 0;
        try {
          const meRes = await fetch(buildMeUrl(token, version));
          if (meRes.ok) {
            const meData = (await meRes.json()) as RawUserProfile;
            followersCount = meData.followers_count ?? 0;
          } else {
            const errBody = await meRes.text().catch(() => "");
            console.warn("Instagram /me query warning:", extractGraphApiError(errBody));
          }
        } catch (err) {
          console.warn("Instagram /me fetch failed:", sanitizeSyncError(err));
        }

        // 2. Fetch Account Daily Insights (reach, profile_views, accounts_engaged)
        let accountInsights = {
          reach: 0,
          profileViews: 0,
          accountsEngaged: 0,
        };
        try {
          const insightsRes = await fetch(buildMeInsightsUrl(token, version));
          if (insightsRes.ok) {
            const json = (await insightsRes.json()) as RawInsightsResponse;
            accountInsights = extractAccountInsights(json.data);
          } else {
            const errBody = await insightsRes.text().catch(() => "");
            console.warn(
              "Instagram account insights warning:",
              extractGraphApiError(errBody),
            );
          }
        } catch (err) {
          console.warn(
            "Instagram account insights fetch failed:",
            sanitizeSyncError(err),
          );
        }

        // 3. Upsert Account Snapshot
        const accountWritten: number = await ctx.runMutation(
          internal.instagramStore.upsertAccountDaily,
          {
            workspaceId,
            row: {
              date: today,
              followersCount,
              reach: accountInsights.reach,
              profileViews: accountInsights.profileViews,
              accountsEngaged: accountInsights.accountsEngaged,
            },
          },
        );

        // 4. Fetch latest 30 media items
        const mediaRes = await fetch(buildMeMediaUrl(token, 30, version));
        if (!mediaRes.ok) {
          const errBody = await mediaRes.text().catch(() => "");
          throw new Error(
            `Instagram Media API greška: ${extractGraphApiError(errBody)}`,
          );
        }

        const mediaJson = (await mediaRes.json()) as RawMediaListResponse;
        const mediaItems = mediaJson.data ?? [];
        const mediaRows = [];

        for (const item of mediaItems) {
          if (!item.id) continue;

          let mediaInsight = {
            reach: 0,
            saves: 0,
            shares: 0,
            views: 0,
          };

          // Fetch per-media insights (isolated try-catch so one failing media never breaks the run)
          try {
            const metrics = getMetricsForMediaType(
              item.media_type ?? "",
              item.media_product_type,
            );
            const insightsUrl = buildMediaInsightsUrl(
              item.id,
              metrics,
              token,
              version,
            );
            const mRes = await fetch(insightsUrl);
            if (mRes.ok) {
              const mJson = (await mRes.json()) as RawInsightsResponse;
              mediaInsight = extractMediaInsights(
                mJson.data,
                item.media_type,
                item.media_product_type,
              );
            }
          } catch {
            // Tolerate unsupported or inaccessible media insights
          }

          const rawPublished = item.timestamp
            ? new Date(item.timestamp).getTime()
            : now;
          const publishedAt = Number.isFinite(rawPublished) ? rawPublished : now;

          // Carousel slides; undefined for every other media type.
          const children = normalizeMediaChildren(item.children);

          const isReels =
            item.media_product_type?.toUpperCase() === "REELS" ||
            item.media_type?.toUpperCase() === "REELS";
          const mediaType = isReels ? "REELS" : item.media_type || "IMAGE";

          mediaRows.push({
            mediaId: String(item.id),
            mediaType,
            caption: item.caption ?? "",
            permalink: item.permalink ?? "",
            publishedAt,
            reach: mediaInsight.reach,
            likes: Number(item.like_count) || 0,
            comments: Number(item.comments_count) || 0,
            saves: mediaInsight.saves,
            shares: mediaInsight.shares,
            views: mediaInsight.views,
            syncedAt: now,
            // Signed CDN links — stored so the /ig-media/ proxy has a starting
            // point, never rendered straight from the database.
            ...(item.media_url ? { mediaUrl: item.media_url } : {}),
            ...(item.thumbnail_url
              ? { thumbnailUrl: item.thumbnail_url }
              : {}),
            ...(children ? { children } : {}),
          });
        }

        // 5. Upsert media batch
        let mediaWritten = 0;
        if (mediaRows.length > 0) {
          mediaWritten = await ctx.runMutation(
            internal.instagramStore.upsertMediaBatch,
            {
              workspaceId,
              rows: mediaRows,
            },
          );
        }

        return accountWritten + mediaWritten;
      },
    );
  },
});

/**
 * Cron fan-out (every 6h): sync every active Instagram connection.
 */
export const syncAllIg = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const connectionIds: Id<"connections">[] = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "meta_ig" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.instagram.syncIgInsights, {
          connectionId,
        });
      } catch {
        // Recorded on syncRuns; continue with the next connection
      }
    }
  },
});
