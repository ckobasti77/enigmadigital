"use node";

import { randomUUID } from "node:crypto";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials, encryptCredentials } from "./lib/crypto";
import { runSync, sanitizeSyncError } from "./lib/runSync";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import {
  INSTAGRAM_OAUTH_TOKEN_URL,
  getMetaGraphVersion,
  buildInstagramAuthorizeUrl,
  buildLongLivedTokenUrl,
  buildRefreshTokenUrl,
  buildMeUrl,
  buildMeInsightsUrl,
  buildMeMediaUrl,
  buildMeStoriesUrl,
  buildMediaInsightsUrl,
  getMetricsForMediaType,
  extractAccountInsights,
  extractGraphApiError,
  toStoredMediaRow,
  buildMediaCommentsUrl,
  buildMeTagsUrl,
  type RawOAuthTokenResponse,
  type RawLongLivedTokenResponse,
  type RawUserProfile,
  type RawInsightsResponse,
  type RawMediaListResponse,
  type RawStoriesResponse,
  type RawCommentsResponse,
  type RawTagsResponse,
  type ExtractedMediaInsights,
} from "./lib/instagramApi";
import type { MetricState } from "./lib/igMetrics";
import {
  resolveMediaProductGroup,
  MEDIA_BASE_METRICS,
  MEDIA_BREAKDOWN_CONFIGS,
  parseMediaInsightsResponse,
  parseMediaBreakdownResponse,
  type ParsedMediaBreakdownRow,
} from "./lib/igMediaMetrics";
import {
  COMMENTS_PER_MEDIA,
  COMMENT_PAGE_LIMIT,
  COMMENT_SYNC_WINDOW_MS,
  COMMENT_TOTAL_LIMIT,
  COMMENT_WRITE_CHUNK,
  countTruncatedReplies,
  normalizeComments,
} from "./lib/igComments";
import {
  allowsBackground,
  createUsageTracker,
  readGate,
  withUsageTracker,
  type UsageTracker,
} from "./lib/metaRateLimit";
import {
  DAILY_METRIC_GROUPS,
  buildIgMetricInsightsUrl,
  getBackfillDateChunks,
  getRecentUtcDates,
  getSinceUntilForUtcDate,
  parseIgInsightsResponse,
  type ParsedMetricRow,
  type RawIgInsightsResponse,
} from "./lib/igMetrics";
import {
  DEMOGRAPHIC_BREAKDOWNS,
  DEMOGRAPHIC_METRICS,
  DEMOGRAPHIC_TIMEFRAMES,
  buildIgDemographicsUrl,
  parseIgDemographicsResponse,
  type RawDemographicsResponse,
} from "./lib/igDemographics";

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

/**
 * How many posts one sync pulls comments for. The window is 30 days (F4), and
 * this cap is what keeps a very busy month from turning one run into a hundred
 * extra calls; the posts are walked newest first, so what falls off the end is
 * always the oldest.
 */
const COMMENT_MEDIA_LIMIT = 20;

/**
 * Walk one post's comments to the end, then let the sweep run — or say why it
 * could not (V1).
 *
 * Before V1 this was a single call for the newest fifty comments, and whatever
 * did not fit was not merely invisible: it was ABSENT from the answer, and the
 * sweep read absence as deletion. Two separate lies came out of that — comments
 * 51+ never entered the database, and every live reply past the nested page of
 * a long thread was struck through in the panel.
 *
 * So: follow `paging.cursors.after` to the end, and declare the pass complete
 * only when the top level ran out AND no thread came back with its replies cut.
 * Every way of stopping early is recorded on the post row, because a cap nobody
 * can see reads exactly like a complete read.
 *
 * Returns how many rows were written.
 */
async function syncMediaComments(
  ctx: ActionCtx,
  params: {
    workspaceId: Id<"workspaces">;
    mediaId: string;
    token: string;
    version: string;
    ourUsername: string | undefined;
    syncedAt: number;
    tracker: UsageTracker;
  },
): Promise<number> {
  const {
    workspaceId,
    mediaId,
    token,
    version,
    ourUsername,
    syncedAt,
    tracker,
  } = params;

  // The instant BEFORE the first call. Everything the database learns after
  // this moment arrived by another road and is none of this answer's business.
  const snapshotAt = Date.now();

  const seenIds: string[] = [];
  let written = 0;
  let after: string | undefined;
  let pages = 0;
  let topLevel = 0;
  let threadsCut = 0;
  /**
   * Set when the TOP-LEVEL walk stopped short (R1/5c). This is the one that
   * governs whether a missing TOP-LEVEL comment may be called deleted: if we did
   * not read every page of top-level comments, absence proves nothing about them.
   */
  let topTruncated: string | null = null;

  for (;;) {
    if (tracker.throttled) {
      topTruncated = "Meta je odbila zahtev usred čitanja komentara.";
      break;
    }

    const res = await tracker.fetch(
      buildMediaCommentsUrl(mediaId, token, COMMENTS_PER_MEDIA, version, after),
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn("Instagram comments warning:", extractGraphApiError(errBody));
      topTruncated = "Instagram nije odgovorio na čitanje komentara.";
      break;
    }

    const json = (await res.json()) as RawCommentsResponse;
    const page = json.data ?? [];
    pages++;
    topLevel += page.length;
    threadsCut += countTruncatedReplies(page);

    const rows = normalizeComments(page, ourUsername);
    for (const chunk of chunked(rows, COMMENT_WRITE_CHUNK)) {
      written += await ctx.runMutation(
        internal.igCommentsStore.upsertCommentBatch,
        {
          workspaceId,
          mediaId,
          rows: chunk,
          // Never on a chunk: the sweep needs every id the walk saw, and the
          // last chunk alone knows nothing about the first one's comments.
          complete: false,
          syncedAt,
          snapshotAt,
        },
      );
    }
    for (const row of rows) seenIds.push(row.commentId);

    after = json.paging?.cursors?.after;
    if (json.paging?.next === undefined || !after) break;
    if (pages >= COMMENT_PAGE_LIMIT) {
      topTruncated = `Stalo na ${COMMENT_PAGE_LIMIT} stranica komentara.`;
      break;
    }
    if (topLevel >= COMMENT_TOTAL_LIMIT) {
      topTruncated = `Stalo na ${COMMENT_TOTAL_LIMIT} komentara.`;
      break;
    }
  }

  // Two completeness verdicts, not one (R1/5c). The top level is complete when
  // every page was read; the REPLIES are complete only if, on top of that, no
  // thread outgrew its single nested page. Splitting them means a post with one
  // long thread no longer switches deletion detection OFF entirely — top-level
  // deletions are still caught; only reply deletions stand down, because a reply
  // absent from a thread we only partly read might just be on the page we did
  // not follow. (We do not chase the nested cursor here — the damage is limited,
  // and the truncation is shown on the post so the operator knows.)
  const complete = topTruncated === null;
  const repliesComplete = complete && threadsCut === 0;

  // What the post card shows (R1/5c, 5d): the top-level reason if there is one,
  // else the reply-only reason, else `null` to clear an older stamp.
  const truncatedReason =
    topTruncated ??
    (threadsCut > 0
      ? `${threadsCut} niti ima više odgovora nego što staje u jedan odgovor Instagrama; ti odgovori se ne uvoze i njihovo brisanje se ne prati.`
      : null);

  // One closing call: it carries both verdicts, the ids from every page, and the
  // truncation stamp — including the `null` that clears an older one.
  written += await ctx.runMutation(internal.igCommentsStore.upsertCommentBatch, {
    workspaceId,
    mediaId,
    rows: [],
    complete,
    repliesComplete,
    syncedAt,
    snapshotAt,
    seenIds,
    truncated: truncatedReason,
  });

  return written;
}

/** Split a list into fixed-size pieces; one mutation is one transaction. */
function chunked<T>(list: T[], size: number): T[][] {
  if (list.length <= size) return list.length > 0 ? [list] : [];
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

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
  // Both OAuth calls go to graph.instagram.com, so both count against the same
  // allowance the schedulers are rationing (P2). One tracker for the whole
  // exchange, flushed even when a step throws at the UI.
  return await withUsageTracker(ctx, workspaceId, async (tracker) => {
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

    const tokenRes = await tracker.fetch(INSTAGRAM_OAUTH_TOKEN_URL, {
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
    const longLivedRes = await tracker.fetch(longLivedUrl);

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
      const meRes = await tracker.fetch(buildMeUrl(longLivedToken, version));
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

    // 5. Trigger initial sync in background — unless Meta is already refusing.
    //
    // This is the LAST unguarded way into `syncIgInsights`, which is ~50 Graph
    // calls (P1/K1). Connecting an account is rare and human-driven, so it can
    // never be the cause of a block — but starting fifty calls INTO one is
    // still fifty calls that cannot land, and the six-hourly pass and the
    // two-minute head check fill the screen on their own within minutes.
    try {
      const gate = await readGate(ctx, workspaceId);
      if (allowsBackground(gate)) {
        await ctx.runAction(internal.instagram.syncIgInsights, { connectionId });
      }
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
  });
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

    // Daily, per connection, and straight at graph.instagram.com — so it counts
    // like everything else does (P2).
    const tracker = createUsageTracker();
    const refreshUrl = buildRefreshTokenUrl(token, version);
    try {
      const res = await tracker.fetch(refreshUrl);
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
    } finally {
      await tracker.flush(ctx, conn.workspaceId);
    }
  },
});

/**
 * Daily cron fan-out: refresh long-lived tokens older than ~50 days.
 */
export const refreshAllTokens = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.igTokens, async () => {
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
    });
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

        // Every Graph answer carries how much of the app's allowance is spent
        // (F6). Reading it costs nothing and is the only honest way to know
        // when the schedulers have to stand down — so it is read here too, on
        // the pass that spends the most calls of any of them.
        const tracker = createUsageTracker();

        // 1. Fetch User Profile for followers_count
        let followersCount = 0;
        // Our own handle. The comments edge identifies a commenter by username
        // and nothing else, so this is the only way to tell our own replies
        // apart from everybody else's (F4).
        let ourUsername: string | undefined;
        try {
          const meRes = await tracker.fetch(buildMeUrl(token, version));
          if (meRes.ok) {
            const meData = (await meRes.json()) as RawUserProfile;
            followersCount = meData.followers_count ?? 0;
            ourUsername = meData.username;
            if (ourUsername) {
              // Cached so the event-driven refresh (F6) does not have to spend
              // a call re-learning who we are on every incoming comment.
              await ctx.runMutation(
                internal.instagramStore.saveAccountHandle,
                { connectionId, handle: ourUsername },
              );
            }
          } else {
            const errBody = await meRes.text().catch(() => "");
            console.warn("Instagram /me query warning:", extractGraphApiError(errBody));
          }
        } catch (err) {
          console.warn("Instagram /me fetch failed:", sanitizeSyncError(err));
        }

        // 2. Fetch Account Daily Insights (reach, total_interactions, accounts_engaged)
        let accountInsights = {
          reach: 0,
          totalInteractions: 0,
          accountsEngaged: 0,
        };
        try {
          const insightsRes = await tracker.fetch(
            buildMeInsightsUrl(token, version),
          );
          if (insightsRes.ok) {
            const json = (await insightsRes.json()) as RawInsightsResponse;
            const extracted = extractAccountInsights(json.data);
            accountInsights = {
              reach: extracted.reach,
              totalInteractions: extracted.totalInteractions,
              accountsEngaged: extracted.accountsEngaged,
            };
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
              totalInteractions: accountInsights.totalInteractions,
              accountsEngaged: accountInsights.accountsEngaged,
            },
          },
        );

        // 4. Fetch latest 30 media items
        const mediaRes = await tracker.fetch(buildMeMediaUrl(token, 30, version));
        if (!mediaRes.ok) {
          const errBody = await mediaRes.text().catch(() => "");
          throw new Error(
            `Instagram Media API greška: ${extractGraphApiError(errBody)}`,
          );
        }

        const mediaJson = (await mediaRes.json()) as RawMediaListResponse;
        const mediaItems = mediaJson.data ?? [];
        const mediaRows = [];
        const mediaBreakdownRows: ParsedMediaBreakdownRow[] = [];

        for (const item of mediaItems) {
          // Thirty per-post insight reads. After a refusal not one of them can
          // land, and each attempt lengthens the block (P2). The posts already
          // collected are still written below.
          if (tracker.throttled) break;
          if (!item.id) continue;

          let mediaInsight: ExtractedMediaInsights = {
            reach: 0,
            saves: 0,
            shares: 0,
            views: 0,
          };

          const group = resolveMediaProductGroup(
            item.media_type ?? "",
            item.media_product_type,
          );

          // Fetch per-media base insights (isolated try-catch so one failing media never breaks the run)
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
            const mRes = await tracker.fetch(insightsUrl);
            const body = await mRes.json().catch(() => null);
            const parsedMap = parseMediaInsightsResponse({
              response: body,
              requestedMetrics: metrics,
              isError: !mRes.ok,
              statusCode: mRes.status,
            });

            const metricStates: Record<string, { state: MetricState; reason?: string }> = {};
            for (const [mName, mResVal] of Object.entries(parsedMap)) {
              metricStates[mName] = {
                state: mResVal.state,
                ...(mResVal.reason !== undefined ? { reason: mResVal.reason } : {}),
              };
            }

            mediaInsight = {
              reach: parsedMap.reach?.value ?? 0,
              saves: parsedMap.saved?.value ?? 0,
              shares: parsedMap.shares?.value ?? 0,
              views: parsedMap.views?.value ?? 0,
              likes: parsedMap.likes?.value,
              comments: parsedMap.comments?.value,
              reposts: parsedMap.reposts?.value,
              profileVisits: parsedMap.profile_visits?.value,
              follows: parsedMap.follows?.value,
              replies: parsedMap.replies?.value,
              totalInteractions: parsedMap.total_interactions?.value,
              reelsAvgWatchTimeMs: parsedMap.ig_reels_avg_watch_time?.value,
              reelsVideoViewTotalTimeMs: parsedMap.ig_reels_video_view_total_time?.value,
              reelsSkipRate: parsedMap.reels_skip_rate?.value,
              crosspostedViews: parsedMap.crossposted_views?.value,
              facebookViews: parsedMap.facebook_views?.value,
              metricStates,
            };
          } catch {
            // Tolerate unsupported or inaccessible media insights
          }

          // Fetch breakdowns for this media (if configured for this media group)
          const breakdownConfigs = MEDIA_BREAKDOWN_CONFIGS[group];
          for (const bConfig of breakdownConfigs) {
            if (tracker.throttled) break;
            try {
              const bUrl = buildMediaInsightsUrl(
                item.id,
                [bConfig.metric],
                token,
                version,
                bConfig.breakdown,
              );
              const bRes = await tracker.fetch(bUrl);
              const bBody = await bRes.json().catch(() => null);
              const parsedBreakdowns = parseMediaBreakdownResponse({
                mediaId: String(item.id),
                metric: bConfig.metric,
                dimensionKey: bConfig.breakdown,
                response: bBody,
                isError: !bRes.ok,
                statusCode: bRes.status,
                syncedAt: now,
              });
              mediaBreakdownRows.push(...parsedBreakdowns);
            } catch {
              // Tolerate failure
            }
          }

          // Shared with the event-driven single-post refresh (F6): both read
          // the same fields off the same endpoint, and two copies of this
          // mapping would drift the day one of them learned a new field.
          mediaRows.push(toStoredMediaRow(item, mediaInsight, now));
        }

        // 5. Upsert media batch and breakdowns
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
        if (mediaBreakdownRows.length > 0) {
          await ctx.runMutation(
            internal.instagramStore.upsertMediaBreakdownsBatch,
            {
              workspaceId,
              rows: mediaBreakdownRows,
            },
          );
        }

        // 6. Comments on recent posts (F4).
        //
        // The webhook already delivers every NEW comment within seconds, so
        // this pass exists for everything the webhook cannot know: comments
        // left before the account was connected, edits, hides performed in the
        // Instagram app, and — the one that matters most — deletions, which are
        // never announced at all.
        //
        // Deliberately last, and deliberately quiet. Insights are what this run
        // is for; a post whose comments cannot be read must not cost the run
        // its numbers.
        //
        // Detecting DELETED POSTS moved out of this run in F6 — it is its own
        // daily pass now (`metaSync.igDeletionCheck`). Spending up to
        // twenty-five probes four times a day on a question whose answer
        // changes about once a month was the single most wasteful thing this
        // sync did.
        let commentsWritten = 0;
        const commentCutoff = now - COMMENT_SYNC_WINDOW_MS;
        const recent = mediaRows
          .filter((r) => r.publishedAt >= commentCutoff)
          .sort((a, b) => b.publishedAt - a.publishedAt)
          .slice(0, COMMENT_MEDIA_LIMIT);

        for (const row of recent) {
          if (tracker.throttled) break; // P2: a refusal ends the loop
          try {
            commentsWritten += await syncMediaComments(ctx, {
              workspaceId,
              mediaId: row.mediaId,
              token,
              version,
              ourUsername,
              syncedAt: now,
              tracker,
            });
          } catch (err) {
            console.warn(
              "Instagram comments fetch failed:",
              sanitizeSyncError(err),
            );
          }
        }

        // 7. Tagged media / Tags (G5).
        // Fetch posts where account is tagged, up to 30 items.
        let tagsWritten = 0;
        if (!tracker.throttled) {
          try {
            const tagsRes = await tracker.fetch(
              buildMeTagsUrl(token, 30, version),
            );
            if (tagsRes.ok) {
              const tagsJson = (await tagsRes.json()) as RawTagsResponse;
              const tagItems = (tagsJson.data ?? []).map((t) => ({
                mediaId: String(t.id),
                caption: t.caption,
                permalink: t.permalink,
                username: t.username,
                timestamp: t.timestamp
                  ? new Date(t.timestamp).getTime()
                  : 0,
              }));
              if (tagItems.length > 0) {
                tagsWritten = await ctx.runMutation(
                  internal.igMentionsStore.upsertTagsBatch,
                  {
                    workspaceId,
                    tags: tagItems,
                    syncedAt: now,
                  },
                );
              }
            }
          } catch (err) {
            console.warn(
              "Instagram tags fetch failed:",
              sanitizeSyncError(err),
            );
          }
        }

        // What Meta said about the allowance, written once for the whole run.
        // Also stamps the "full pass" row the Settings schedule table reads.
        await tracker.flush(ctx, workspaceId);
        await ctx.runMutation(internal.metaSyncStore.recordJob, {
          workspaceId,
          provider: "meta_ig",
          job: "full",
          ok: true,
          itemsWritten:
            accountWritten + mediaWritten + commentsWritten + tagsWritten,
        });

        return accountWritten + mediaWritten + commentsWritten + tagsWritten;
      },
    );
  },
});

/**
 * Cron fan-out (every 6h): sync every active Instagram connection.
 *
 * This is the most expensive pass in the app — fifty-odd calls — so since F6 it
 * asks the rate-limit gate first, like every other scheduled pass. Standing
 * down costs nothing: the two-minute poll and the hourly refresh keep the
 * screen current, and the next tick is six hours away, not six seconds.
 */
export const syncAllIg = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.igSync, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );

      for (const connectionId of connectionIds) {
        try {
          const conn: Doc<"connections"> | null = await ctx.runQuery(
            internal.connections.getForSync,
            { connectionId },
          );
          if (conn === null) continue;

          const gate = await readGate(ctx, conn.workspaceId);
          if (!allowsBackground(gate)) {
            await ctx.runMutation(internal.metaSyncStore.recordJob, {
              workspaceId: conn.workspaceId,
              provider: "meta_ig",
              job: "full",
              ok: false,
              skipReason:
                "Potrošnja Meta limita je previsoka; sledeći prolaz preskočen.",
            });
            continue;
          }

          await ctx.runAction(internal.instagram.syncIgInsights, {
            connectionId,
          });
        } catch {
          // Recorded on syncRuns; continue with the next connection
        }
      }
    });
  },
});

// ── Instagram Account Metrics Sync (G1) ─────────────────────────────────────

/**
 * Helper to sync all 12 day metrics (and breakdowns) for a list of UTC dates.
 * Executes at most 5 calls per date through tracker.fetch, stopping immediately if throttled.
 */
async function syncMetricsForDates(
  ctx: ActionCtx,
  params: {
    workspaceId: Id<"workspaces">;
    token: string;
    version: string;
    dates: string[];
    tracker: UsageTracker;
  },
): Promise<number> {
  const { workspaceId, token, version, dates, tracker } = params;
  const now = Date.now();
  let totalWritten = 0;

  for (const date of dates) {
    if (tracker.throttled) break;

    const { since, until } = getSinceUntilForUtcDate(date);
    const dateRows: ParsedMetricRow[] = [];

    for (const group of DAILY_METRIC_GROUPS) {
      if (tracker.throttled) break;

      const url = buildIgMetricInsightsUrl({
        accessToken: token,
        metrics: group.metrics,
        period: group.period,
        metricType: group.metricType,
        breakdown: group.breakdown,
        since,
        until,
        version,
      });

      try {
        const res = await tracker.fetch(url);
        if (res.ok) {
          const json = (await res.json()) as RawIgInsightsResponse;
          const parsed = parseIgInsightsResponse({
            response: json,
            requestedMetrics: group.metrics,
            date,
          });
          dateRows.push(...parsed);
        } else {
          const errBody = await res.text().catch(() => "");
          const errMsg = extractGraphApiError(errBody);
          const parsed = parseIgInsightsResponse({
            requestedMetrics: group.metrics,
            date,
            isError: true,
            errorMessage: errMsg,
          });
          dateRows.push(...parsed);
        }
      } catch (err) {
        const parsed = parseIgInsightsResponse({
          requestedMetrics: group.metrics,
          date,
          isError: true,
          errorMessage: sanitizeSyncError(err),
        });
        dateRows.push(...parsed);
      }
    }

    if (dateRows.length > 0) {
      const written: number = await ctx.runMutation(
        internal.instagramStore.upsertMetricBatch,
        {
          workspaceId,
          rows: dateRows.map((r) => ({
            ...r,
            syncedAt: now,
          })),
        },
      );
      totalWritten += written;
    }
  }

  return totalWritten;
}

/**
 * Action to sync Instagram metrics for a specific connection (daily: last 3 days, or backfill: 90 days).
 */
export const syncConnectionMetrics = internalAction({
  args: {
    connectionId: v.id("connections"),
    mode: v.union(v.literal("daily"), v.literal("backfill")),
  },
  handler: async (ctx, { connectionId, mode }): Promise<number> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null || conn.provider !== "meta_ig" || !conn.encryptedCredentials) {
      throw new Error("Instagram konekcija nije dostupna.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      throw new Error("Neuspela dekripcija Instagram kredencijala.");
    }

    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();
    let written = 0;

    try {
      if (mode === "backfill") {
        // 90 days in 3 chunks of 30 days
        const chunks = getBackfillDateChunks(90, 30);
        for (const chunk of chunks) {
          if (tracker.throttled) break;
          written += await syncMetricsForDates(ctx, {
            workspaceId,
            token,
            version,
            dates: chunk,
            tracker,
          });
        }
      } else {
        // Daily: last 3 days
        const dates = getRecentUtcDates(3);
        written += await syncMetricsForDates(ctx, {
          workspaceId,
          token,
          version,
          dates,
          tracker,
        });
      }
    } finally {
      await tracker.flush(ctx, workspaceId);
      await ctx.runMutation(internal.metaSyncStore.recordJob, {
        workspaceId,
        provider: "meta_ig",
        job: mode === "backfill" ? "metric_backfill" : "metrics_daily",
        ok: !tracker.throttled,
        itemsWritten: written,
        ...(tracker.throttled
          ? { skipReason: "Meta je ograničila zahteve (429 / throttle)." }
          : {}),
      });
    }

    return written;
  },
});

/**
 * Daily cron action (at 05:45 UTC): sync metrics for all active Instagram connections.
 * Performs 90-day backfill on first run for workspace, else syncs last 3 days.
 */
export const syncAllIgMetrics = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await withCronLock(ctx, CRON_LOCKS.igDailyMetrics, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );

      for (const connectionId of connectionIds) {
        try {
          const conn: Doc<"connections"> | null = await ctx.runQuery(
            internal.connections.getForSync,
            { connectionId },
          );
          if (conn === null || conn.status === "disconnecting") continue;

          const gate = await readGate(ctx, conn.workspaceId);
          if (!allowsBackground(gate)) {
            await ctx.runMutation(internal.metaSyncStore.recordJob, {
              workspaceId: conn.workspaceId,
              provider: "meta_ig",
              job: "metrics_daily",
              ok: false,
              skipReason:
                "Potrošnja Meta limita je previsoka; sledeći prolaz preskočen.",
            });
            continue;
          }

          await runSync(
            ctx,
            {
              workspaceId: conn.workspaceId,
              provider: "meta_ig",
              connectionId,
            },
            async (): Promise<number> => {
              const hasBackfill: boolean = await ctx.runQuery(
                internal.instagramStore.hasMetricBackfill,
                { workspaceId: conn.workspaceId },
              );
              const mode = hasBackfill ? "daily" : "backfill";

              return await ctx.runAction(
                internal.instagram.syncConnectionMetrics,
                {
                  connectionId,
                  mode,
                },
              );
            },
          );
        } catch {
          // Recorded on syncRuns; continue to next connection
        }
      }
    });
  },
});

// ── Instagram Audience Demographics Sync (G2) ───────────────────────────────

/**
 * Action to sync all 36 demographics calls (2 metrics × 6 timeframes × 3 breakdowns) for a connection.
 * Once daily, through tracker.fetch, stopping immediately if throttled.
 */
export const syncConnectionDemographics = internalAction({
  args: {
    connectionId: v.id("connections"),
  },
  handler: async (ctx, { connectionId }): Promise<number> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null || conn.provider !== "meta_ig" || !conn.encryptedCredentials) {
      throw new Error("Instagram konekcija nije dostupna.");
    }
    const workspaceId: Id<"workspaces"> = conn.workspaceId;

    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      throw new Error("Neuspela dekripcija Instagram kredencijala.");
    }

    const version = getMetaGraphVersion();
    const tracker = createUsageTracker();
    const now = Date.now();
    let totalWritten = 0;

    try {
      for (const metric of DEMOGRAPHIC_METRICS) {
        if (tracker.throttled) break;

        for (const timeframe of DEMOGRAPHIC_TIMEFRAMES) {
          if (tracker.throttled) break;

          for (const breakdown of DEMOGRAPHIC_BREAKDOWNS) {
            if (tracker.throttled) break;

            const url = buildIgDemographicsUrl({
              accessToken: token,
              metric,
              timeframe,
              breakdown,
              version,
            });

            try {
              const res = await tracker.fetch(url);
              if (res.ok) {
                const json = (await res.json()) as RawDemographicsResponse;
                const parsed = parseIgDemographicsResponse({
                  metric,
                  timeframe,
                  breakdown,
                  response: json,
                });
                const written: number = await ctx.runMutation(
                  internal.instagramStore.upsertDemographicsBatch,
                  {
                    workspaceId,
                    rows: parsed.map((r) => ({
                      ...r,
                      syncedAt: now,
                    })),
                  },
                );
                totalWritten += written;
              } else {
                const errBody = await res.text().catch(() => "");
                const errMsg = extractGraphApiError(errBody);
                const parsed = parseIgDemographicsResponse({
                  metric,
                  timeframe,
                  breakdown,
                  isError: true,
                  errorMessage: errMsg,
                });
                const written: number = await ctx.runMutation(
                  internal.instagramStore.upsertDemographicsBatch,
                  {
                    workspaceId,
                    rows: parsed.map((r) => ({
                      ...r,
                      syncedAt: now,
                    })),
                  },
                );
                totalWritten += written;
              }
            } catch (err) {
              const parsed = parseIgDemographicsResponse({
                metric,
                timeframe,
                breakdown,
                isError: true,
                errorMessage: sanitizeSyncError(err),
              });
              const written: number = await ctx.runMutation(
                internal.instagramStore.upsertDemographicsBatch,
                {
                  workspaceId,
                  rows: parsed.map((r) => ({
                    ...r,
                    syncedAt: now,
                  })),
                },
              );
              totalWritten += written;
            }
          }
        }
      }
    } finally {
      await tracker.flush(ctx, workspaceId);
      await ctx.runMutation(internal.metaSyncStore.recordJob, {
        workspaceId,
        provider: "meta_ig",
        job: "demographics_daily",
        ok: !tracker.throttled,
        itemsWritten: totalWritten,
        ...(tracker.throttled
          ? { skipReason: "Meta je ograničila zahteve (429 / throttle)." }
          : {}),
      });
    }

    return totalWritten;
  },
});

/**
 * Daily cron action (at 04:55 UTC): sync audience demographics for all active Instagram connections.
 */
export const syncAllIgDemographics = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await withCronLock(ctx, CRON_LOCKS.igDemographics, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );

      for (const connectionId of connectionIds) {
        try {
          const conn: Doc<"connections"> | null = await ctx.runQuery(
            internal.connections.getForSync,
            { connectionId },
          );
          if (conn === null || conn.status === "disconnecting") continue;

          const gate = await readGate(ctx, conn.workspaceId);
          if (!allowsBackground(gate)) {
            await ctx.runMutation(internal.metaSyncStore.recordJob, {
              workspaceId: conn.workspaceId,
              provider: "meta_ig",
              job: "demographics_daily",
              ok: false,
              skipReason:
                "Potrošnja Meta limita je previsoka; sledeći prolaz preskočen.",
            });
            continue;
          }

          await runSync(
            ctx,
            {
              workspaceId: conn.workspaceId,
              provider: "meta_ig",
              connectionId,
            },
            async (): Promise<number> => {
              return await ctx.runAction(
                internal.instagram.syncConnectionDemographics,
                {
                  connectionId,
                },
              );
            },
          );
        } catch {
          // Recorded on syncRuns; continue to next connection
        }
      }
    });
  },
});

// ── Instagram Stories Sync (G4) ─────────────────────────────────────────────

/**
 * Poll active stories and their insights for a single Instagram connection.
 *
 * Polling Rules:
 *   - Runs every 30 minutes.
 *   - `GET /me/stories` returns only currently active stories (<= 24h old).
 *   - Fetches base STORY metrics (views, reach, shares, total_interactions, reposts, profile_visits, follows, replies, facebook_views)
 *   - Fetches breakdowns (profile_activity by action_type, navigation by story_navigation_action_type)
 *   - Error 10 (less than 5 viewers) is treated as `state: "suppressed"` with STORY_BELOW_THRESHOLD_REASON (not a crash).
 *   - Rate Gate Rule:
 *     Pri poslednjoj prilici pred istek (npr. expiresAt - now < 60 min)
 *     anketiraj i ako je readGate u warn stanju — bolje potrošiti poziv nego
 *     izgubiti podatak zauvek. Samo stop/backoff sme da preskoči.
 *   - Archived check: marks `archivedAt` on expired stories without deleting rows.
 */
export const pollConnectionStories = internalAction({
  args: {
    connectionId: v.id("connections"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { connectionId, force = false }): Promise<number> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null || conn.provider !== "meta_ig" || !conn.encryptedCredentials) {
      return 0;
    }

    const workspaceId: Id<"workspaces"> = conn.workspaceId;
    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      throw new Error("Neuspela dekripcija Instagram kredencijala za Story anketu.");
    }

    const version = getMetaGraphVersion();
    const now = Date.now();
    const tracker = createUsageTracker();

    try {
      const gate = await readGate(ctx, workspaceId);
      // Hard block: stop (>95%) or backoff (429) stops all polling
      if (!force && (gate.state === "stop" || gate.state === "backoff")) {
        console.warn(
          `[Story Poll] Radni prostor ${workspaceId} preskače Story anketu zbog rate-limit stanja (${gate.state}).`,
        );
        return 0;
      }

      // 1. Fetch active stories from /me/stories
      const storiesUrl = buildMeStoriesUrl(token, version);
      const storiesRes = await tracker.fetch(storiesUrl);

      if (!storiesRes.ok) {
        const errBody = await storiesRes.text().catch(() => "");
        console.warn("Instagram stories fetch warning:", extractGraphApiError(errBody));
        return 0;
      }

      const storiesData = (await storiesRes.json()) as RawStoriesResponse;
      const rawStories = storiesData.data ?? [];

      const storiesToUpsert: Array<{
        storyId: string;
        mediaType: string;
        mediaUrl?: string;
        thumbnailUrl?: string;
        permalink?: string;
        timestamp: number;
        expiresAt: number;
      }> = [];

      type StoryMediaUpsertRow = {
        mediaId: string;
        mediaType: string;
        caption: string;
        permalink: string;
        publishedAt: number;
        reach: number;
        likes: number;
        comments: number;
        saves: number;
        shares: number;
        views: number;
        reposts?: number;
        profileVisits?: number;
        follows?: number;
        replies?: number;
        totalInteractions?: number;
        facebookViews?: number;
        metricStates?: Record<string, { state: MetricState; reason?: string }>;
        syncedAt: number;
        mediaUrl?: string;
        thumbnailUrl?: string;
      };

      type StoryBreakdownUpsertRow = {
        mediaId: string;
        metric: string;
        dimensionKey: string;
        dimensionValue: string;
        value?: number;
        state: MetricState;
        reason?: string;
        syncedAt: number;
      };

      const mediaRowsToUpsert: StoryMediaUpsertRow[] = [];
      const breakdownRowsToUpsert: StoryBreakdownUpsertRow[] = [];

      for (const item of rawStories) {
        if (!item.id) continue;
        if (tracker.throttled) break;

        const storyTimestamp = item.timestamp
          ? new Date(item.timestamp).getTime()
          : now;
        const expiresAt = storyTimestamp + 24 * 60 * 60 * 1000;
        const mediaType = (item.media_type || "IMAGE").toUpperCase();

        storiesToUpsert.push({
          storyId: item.id,
          mediaType,
          mediaUrl: item.media_url,
          thumbnailUrl: item.thumbnail_url,
          permalink: item.permalink,
          timestamp: storyTimestamp,
          expiresAt,
        });

        // Check if insights should be queried:
        // Pri poslednjoj prilici pred istek (npr. expiresAt - now < 60 min)
        // anketiraj i ako je readGate u warn stanju — bolje potrošiti poziv nego
        // izgubiti podatak zauvek. Samo stop/backoff sme da preskoči.
        const isExpiringSoon = expiresAt - now < 60 * 60 * 1000;
        if (gate.state === "warn" && !isExpiringSoon && !force) {
          // If in warn state and story is not expiring soon, skip insights to preserve quota
          continue;
        }

        // Fetch base story metrics
        const baseMetrics = MEDIA_BASE_METRICS.STORY;
        const insightsUrl = buildMediaInsightsUrl(
          item.id,
          baseMetrics,
          token,
          version,
        );

        let parsedMetrics: Record<
          string,
          { value?: number; state: MetricState; reason?: string }
        > = {};
        try {
          const insightsRes = await tracker.fetch(insightsUrl);
          if (insightsRes.ok) {
            const json = (await insightsRes.json()) as RawInsightsResponse;
            parsedMetrics = parseMediaInsightsResponse({
              response: json,
              requestedMetrics: baseMetrics,
              statusCode: insightsRes.status,
            });
          } else {
            const errBody = await insightsRes.text().catch(() => "");
            let errObj: RawInsightsResponse | undefined;
            try {
              errObj = JSON.parse(errBody) as RawInsightsResponse;
            } catch {
              errObj = undefined;
            }

            parsedMetrics = parseMediaInsightsResponse({
              response: errObj,
              requestedMetrics: baseMetrics,
              isError: true,
              errorMessage: extractGraphApiError(errBody),
              statusCode: insightsRes.status,
            });
          }
        } catch (e: unknown) {
          parsedMetrics = parseMediaInsightsResponse({
            requestedMetrics: baseMetrics,
            isError: true,
            errorMessage:
              e instanceof Error
                ? e.message
                : "Greška pri dohvatanju uvida za priču.",
          });
        }

        const metricStates: Record<string, { state: MetricState; reason?: string }> = {};
        for (const [k, v] of Object.entries(parsedMetrics)) {
          metricStates[k] = { state: v.state, reason: v.reason };
        }

        mediaRowsToUpsert.push({
          mediaId: item.id,
          mediaType: "STORY",
          caption: "",
          permalink: item.permalink ?? "",
          publishedAt: storyTimestamp,
          reach: parsedMetrics.reach?.value ?? 0,
          likes: 0,
          comments: 0,
          saves: 0,
          shares: parsedMetrics.shares?.value ?? 0,
          views: parsedMetrics.views?.value ?? 0,
          reposts: parsedMetrics.reposts?.value,
          profileVisits: parsedMetrics.profile_visits?.value,
          follows: parsedMetrics.follows?.value,
          replies: parsedMetrics.replies?.value,
          totalInteractions: parsedMetrics.total_interactions?.value,
          facebookViews: parsedMetrics.facebook_views?.value,
          metricStates,
          syncedAt: now,
          mediaUrl: item.media_url,
          thumbnailUrl: item.thumbnail_url,
        });

        // Fetch story breakdowns: profile_activity and navigation
        for (const cfg of MEDIA_BREAKDOWN_CONFIGS.STORY) {
          if (tracker.throttled) break;
          const bdUrl = buildMediaInsightsUrl(
            item.id,
            [cfg.metric],
            token,
            version,
            cfg.breakdown,
          );

          try {
            const bdRes = await tracker.fetch(bdUrl);
            let parsedBreakdowns: ParsedMediaBreakdownRow[] = [];
            if (bdRes.ok) {
              const bdJson = (await bdRes.json()) as RawInsightsResponse;
              parsedBreakdowns = parseMediaBreakdownResponse({
                mediaId: item.id,
                metric: cfg.metric,
                dimensionKey: cfg.breakdown,
                response: bdJson,
                statusCode: bdRes.status,
                syncedAt: now,
              });
            } else {
              const errBody = await bdRes.text().catch(() => "");
              let errObj: RawInsightsResponse | undefined;
              try {
                errObj = JSON.parse(errBody) as RawInsightsResponse;
              } catch {
                errObj = undefined;
              }
              parsedBreakdowns = parseMediaBreakdownResponse({
                mediaId: item.id,
                metric: cfg.metric,
                dimensionKey: cfg.breakdown,
                response: errObj,
                isError: true,
                errorMessage: extractGraphApiError(errBody),
                statusCode: bdRes.status,
                syncedAt: now,
              });
            }

            for (const row of parsedBreakdowns) {
              breakdownRowsToUpsert.push({
                mediaId: row.mediaId,
                metric: row.metric,
                dimensionKey: row.dimensionKey,
                dimensionValue: row.dimensionValue,
                value: row.value,
                state: row.state,
                reason: row.reason,
                syncedAt: row.syncedAt,
              });
            }
          } catch (e: unknown) {
            breakdownRowsToUpsert.push({
              mediaId: item.id,
              metric: cfg.metric,
              dimensionKey: cfg.breakdown,
              dimensionValue: "ALL",
              value: undefined,
              state: "unavailable",
              reason:
                e instanceof Error
                  ? e.message
                  : "Greška pri čitanju razdvajanja.",
              syncedAt: now,
            });
          }
        }
      }

      // Upsert into database
      if (storiesToUpsert.length > 0 || mediaRowsToUpsert.length > 0) {
        await ctx.runMutation(internal.instagramStore.upsertStoriesAndMetrics, {
          workspaceId,
          stories: storiesToUpsert,
          mediaRows: mediaRowsToUpsert,
          breakdownRows: breakdownRowsToUpsert,
          now,
        });
      }

      // Archive expired stories
      await ctx.runMutation(internal.instagramStore.archiveExpiredStories, {
        workspaceId,
        now,
      });

      return storiesToUpsert.length;
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

/**
 * 30-minute cron action to poll active stories for all connected Instagram accounts.
 */
export const pollAllIgStories = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    await withCronLock(ctx, CRON_LOCKS.igStories, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );

      for (const connectionId of connectionIds) {
        try {
          const conn: Doc<"connections"> | null = await ctx.runQuery(
            internal.connections.getForSync,
            { connectionId },
          );
          if (conn === null || conn.status !== "active") continue;

          await runSync(
            ctx,
            {
              workspaceId: conn.workspaceId,
              provider: "meta_ig",
              connectionId,
            },
            async (): Promise<number> => {
              return await ctx.runAction(
                internal.instagram.pollConnectionStories,
                {
                  connectionId,
                },
              );
            },
          );
        } catch {
          // Errors recorded in syncRuns table, continue to next connection
        }
      }
    });
  },
});

/**
 * Manual action to trigger story poll for the current workspace.
 */
export const pollStoriesManual = action({
  args: {},
  handler: async (ctx): Promise<{ success: boolean; count: number }> => {
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

    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.instagramStore.getWorkspaceConnection,
      {
        workspaceId: member.workspaceId,
        provider: "meta_ig",
      },
    );
    if (conn === null || conn.status !== "active") {
      throw new ConvexError({
        code: "invalid",
        message: "Instagram nalog nije povezan.",
      });
    }

    const count: number = await ctx.runAction(
      internal.instagram.pollConnectionStories,
      {
        connectionId: conn._id,
        force: true,
      },
    );

    return { success: true, count };
  },
});
