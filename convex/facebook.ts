import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials, encryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import { extractGraphApiError } from "./lib/instagramApi";
import {
  allowsBackground,
  createUsageTracker,
  withUsageTracker,
  readGate,
  type UsageTracker,
} from "./lib/metaRateLimit";
import {
  buildDebugTokenUrl,
  buildFacebookAuthorizeUrl,
  buildFacebookLongLivedTokenUrl,
  buildFacebookTokenUrl,
  buildMeAccountsUrl,
  buildPageInsightsUrl,
  buildPageNodeUrl,
  buildPagePostsUrl,
  buildPostCommentsUrl,
  buildPostInsightsUrl,
  buildSubscribedAppsUrl,
  getFacebookAppId,
  getFacebookAppSecret,
  getMetaGraphVersion,
  PAGE_INSIGHT_METRICS_CORE,
  PAGE_SUBSCRIBED_FIELDS,
  POST_INSIGHT_METRICS_CORE,
  type RawDebugTokenResponse,
  type RawFacebookTokenResponse,
  type RawFbCommentsResponse,
  type RawFbInsightsResponse,
  type RawPageAccount,
  type RawPageAccountsResponse,
  type RawPageNode,
  type RawPagePostsResponse,
} from "./lib/facebookApi";
import {
  countFbTruncatedReplies,
  extractPageInsights,
  extractPostInsights,
  FB_COMMENT_PAGE_LIMIT,
  FB_COMMENT_POST_LIMIT,
  FB_COMMENT_SYNC_WINDOW_MS,
  FB_COMMENT_TOTAL_LIMIT,
  FB_COMMENT_WRITE_CHUNK,
  FB_COMMENTS_PER_POST,
  FB_POSTS_PER_SYNC,
  normalizeFbComments,
  normalizePagePosts,
  translateFacebookError,
} from "./lib/facebookContent";

/**
 * ============================================================================
 * FACEBOOK PAGE ACTIONS & SYNC (F5, V8 runtime)
 * ============================================================================
 *
 * Implements:
 *   1. Facebook Login for Business connect flow → long-lived Page Access Token
 *   2. Page picker, for an account that administers more than one Page
 *   3. Daily token refresh cron (the Page token is re-minted from the stored
 *      long-lived user token, which is the only thing allowed to mint one)
 *   4. syncFacebook: Page insights + last 30 posts + comments on the recent ones
 *
 * No `"use node"`: everything here is `fetch` and Web Crypto, both of which the
 * default runtime has. The Instagram twin needs Node only for `randomUUID`.
 * ============================================================================
 */

/** How long an authorize → callback round trip may take. */
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/** Refresh when less than this is left; a Page token usually never expires. */
const REFRESH_THRESHOLD_MS = 10 * 24 * 60 * 60 * 1000;

/** How many posts get their own insights call in one sync. */
const POST_INSIGHTS_LIMIT = 15;

/** How far back the daily insights window reaches. */
const INSIGHTS_WINDOW_DAYS = 32;

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid", message });
}

/**
 * A random nonce, without Node's `randomUUID`.
 *
 * `crypto.getRandomValues` is the one CSPRNG available in both Convex runtimes,
 * and 16 bytes of it is the same 128 bits a UUID carries — minus the version
 * bits, which nothing here reads.
 */
function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

async function readJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/**
 * Walk one post's comments to the end, then let the sweep run — or say why it
 * could not (V1). The Instagram twin is `syncMediaComments` in instagram.ts,
 * and the reasoning is identical: before V1 this was a single call for the
 * newest fifty comments, and everything past that was not merely invisible but
 * ABSENT from the answer — which the sweep read as a deletion.
 *
 * Complete means the top level ran out AND no thread came back with its nested
 * replies cut. Every early stop is recorded on the post row, because a cap
 * nobody can see reads exactly like a complete read.
 */
async function syncPostComments(
  ctx: ActionCtx,
  params: {
    workspaceId: Id<"workspaces">;
    postId: string;
    pageId: string;
    token: string;
    version: string;
    syncedAt: number;
    tracker: UsageTracker;
  },
): Promise<number> {
  const { workspaceId, postId, pageId, token, version, syncedAt, tracker } =
    params;

  // The instant BEFORE the first call. Everything the database learns after
  // this moment arrived by another road and is none of this answer's business.
  const snapshotAt = Date.now();

  const seenIds: string[] = [];
  let written = 0;
  let after: string | undefined;
  let pages = 0;
  let topLevel = 0;
  let threadsCut = 0;
  let truncated: string | null = null;

  for (;;) {
    if (tracker.throttled) {
      truncated = "Meta je odbila zahtev usred čitanja komentara.";
      break;
    }

    const res = await tracker.fetch(
      buildPostCommentsUrl(postId, token, FB_COMMENTS_PER_POST, version, after),
    );
    if (!res.ok) {
      truncated = "Facebook nije odgovorio na čitanje komentara.";
      break;
    }

    const body = await readJson<RawFbCommentsResponse>(res);
    const page = body.data ?? [];
    pages++;
    topLevel += page.length;
    threadsCut += countFbTruncatedReplies(page);

    const rows = normalizeFbComments(page, pageId);
    for (const chunk of chunked(rows, FB_COMMENT_WRITE_CHUNK)) {
      written += await ctx.runMutation(
        internal.fbCommentsStore.upsertCommentBatch,
        {
          workspaceId,
          postId,
          rows: chunk,
          // Never on a chunk: the sweep needs every id the walk saw.
          complete: false,
          syncedAt,
          snapshotAt,
        },
      );
    }
    for (const row of rows) seenIds.push(row.commentId);

    after = body.paging?.cursors?.after;
    if (!body.paging?.next || !after) break;
    if (pages >= FB_COMMENT_PAGE_LIMIT) {
      truncated = `Stalo na ${FB_COMMENT_PAGE_LIMIT} stranica komentara.`;
      break;
    }
    if (topLevel >= FB_COMMENT_TOTAL_LIMIT) {
      truncated = `Stalo na ${FB_COMMENT_TOTAL_LIMIT} komentara.`;
      break;
    }
  }

  if (truncated === null && threadsCut > 0) {
    truncated = `${threadsCut} niti ima više odgovora nego što staje u jedan odgovor Facebooka.`;
  }

  // One closing call: the verdict, the ids from every page, and the truncation
  // stamp — including the `null` that clears an older one.
  written += await ctx.runMutation(
    internal.fbCommentsStore.upsertCommentBatch,
    {
      workspaceId,
      postId,
      rows: [],
      complete: truncated === null,
      syncedAt,
      snapshotAt,
      seenIds,
      truncated,
    },
  );

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

/** Every Page the person administers, newest handshake first. */
async function fetchPages(
  userToken: string,
  tracker: UsageTracker,
): Promise<RawPageAccount[]> {
  const res = await tracker.fetch(buildMeAccountsUrl(userToken));
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    invalid(`Čitanje liste stranica nije uspelo: ${extractGraphApiError(body)}`);
  }
  const body = await readJson<RawPageAccountsResponse>(res);
  return (body.data ?? []).filter(
    (page): page is RawPageAccount =>
      typeof page?.id === "string" && typeof page?.access_token === "string",
  );
}

/**
 * When this token stops working, as a timestamp — or undefined for "never".
 *
 * A long-lived Page token reports `expires_at: 0`, which is Meta's way of
 * saying it does not expire on a clock. What still does expire is data access
 * (90 days), so that is the date the card counts down to when there is one.
 */
async function fetchTokenExpiry(
  token: string,
  tracker: UsageTracker,
): Promise<number | undefined> {
  const appId = getFacebookAppId();
  const appSecret = getFacebookAppSecret();
  if (!appId || !appSecret) return undefined;

  try {
    const res = await tracker.fetch(
      buildDebugTokenUrl({ inputToken: token, appId, appSecret }),
    );
    if (!res.ok) return undefined;
    const body = await readJson<RawDebugTokenResponse>(res);
    const expires = body.data?.expires_at ?? 0;
    const dataAccess = body.data?.data_access_expires_at ?? 0;
    const seconds = expires > 0 ? expires : dataAccess;
    return seconds > 0 ? seconds * 1000 : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ask Meta to start sending this Page's events to our webhook.
 *
 * Best effort on purpose: the subscription can also be made by hand in the app
 * dashboard, and a Page that connected but did not subscribe is still a Page
 * whose posts and comments sync. A hard failure here would make the whole
 * connect flow fail for something recoverable.
 */
async function subscribePageToWebhook(
  pageId: string,
  pageToken: string,
  tracker: UsageTracker,
): Promise<void> {
  try {
    const params = new URLSearchParams();
    params.set("subscribed_fields", PAGE_SUBSCRIBED_FIELDS);
    params.set("access_token", pageToken);
    const res = await tracker.fetch(buildSubscribedAppsUrl(pageId), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        "Facebook: pretplata stranice na webhook nije uspela —",
        extractGraphApiError(body),
      );
    }
  } catch (err) {
    console.warn(
      "Facebook: pretplata stranice na webhook nije uspela —",
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Start Facebook Login for Business.
 *
 * The one-time `state` nonce is persisted with the workspace and the redirect
 * URI, so the PUBLIC callback route can finish the exchange server-side with no
 * dependency on the browser session — the same design the Instagram flow uses,
 * and for the same reason: a login round trip must not be able to eat the code.
 */
export const getOAuthUrl = action({
  args: { redirectUri: v.string() },
  handler: async (ctx, { redirectUri }): Promise<{ url: string }> => {
    const clientId = getFacebookAppId();
    if (!clientId) {
      invalid("Čeka Meta app — dodaj FACEBOOK_APP_ID/SECRET u env");
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

    const nonce = randomNonce();
    await ctx.runMutation(internal.facebookStore.createOAuthState, {
      workspaceId: member.workspaceId,
      userId,
      nonce,
      redirectUri,
    });

    return {
      url: buildFacebookAuthorizeUrl({
        clientId,
        redirectUri,
        state: nonce,
      }),
    };
  },
});

export interface FacebookOAuthResult {
  success: boolean;
  connectionId: Id<"connections">;
  pageId: string;
  pageName: string | null;
  /** How many Pages the person administers — >1 means the picker matters. */
  pageCount: number;
}

/**
 * Code → short-lived user token → long-lived user token → Page token.
 *
 * The middle step is not optional: Page tokens inherit their lifetime from the
 * user token they were minted with, so skipping it would hand back a token that
 * dies within the hour and a sync that stops the same afternoon.
 *
 * When the person administers several Pages the FIRST one is connected rather
 * than leaving the connection half-made. A half-made connection is a state the
 * rest of the app would have to learn about; a connected wrong Page is one
 * click away from being the right one, in a picker that has to exist anyway.
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
): Promise<FacebookOAuthResult> {
  const clientId = getFacebookAppId();
  const clientSecret = getFacebookAppSecret();
  if (!clientId || !clientSecret) {
    invalid("Čeka Meta app — dodaj FACEBOOK_APP_ID/SECRET u env");
  }

  // Five calls to graph.facebook.com before this returns, and every one of
  // them counts against the allowance the schedulers ration (P2).
  const tracker = createUsageTracker();
  try {
    return await exchangeSteps(ctx, tracker, {
      workspaceId,
      clientId,
      clientSecret,
      redirectUri,
      code,
    });
  } finally {
    await tracker.flush(ctx, workspaceId);
  }
}

/**
 * The exchange itself, split out only so the tracker above can be flushed in a
 * `finally` — every step here reports failure by throwing at the UI, and a
 * `flush` before each `invalid()` is a line somebody would eventually forget.
 */
async function exchangeSteps(
  ctx: ActionCtx,
  tracker: UsageTracker,
  {
    workspaceId,
    clientId,
    clientSecret,
    redirectUri,
    code,
  }: {
    workspaceId: Id<"workspaces">;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    code: string;
  },
): Promise<FacebookOAuthResult> {
  const shortRes = await tracker.fetch(
    buildFacebookTokenUrl({ clientId, clientSecret, redirectUri, code }),
  );
  if (!shortRes.ok) {
    const body = await shortRes.text().catch(() => "");
    invalid(`Greška pri preuzimanju tokena: ${extractGraphApiError(body)}`);
  }
  const shortToken = (await readJson<RawFacebookTokenResponse>(shortRes))
    .access_token;
  if (!shortToken) {
    invalid("Facebook nije vratio access token.");
  }

  const longRes = await tracker.fetch(
    buildFacebookLongLivedTokenUrl({
      clientId,
      clientSecret,
      shortLivedToken: shortToken,
    }),
  );
  if (!longRes.ok) {
    const body = await longRes.text().catch(() => "");
    invalid(
      `Greška pri zameni za dugotrajni token: ${extractGraphApiError(body)}`,
    );
  }
  const userToken = (await readJson<RawFacebookTokenResponse>(longRes))
    .access_token;
  if (!userToken) {
    invalid("Facebook nije vratio dugotrajni token.");
  }

  const pages = await fetchPages(userToken, tracker);
  if (pages.length === 0) {
    invalid(
      "Ovaj nalog ne administrira nijednu Facebook stranicu, ili dozvola pages_show_list nije odobrena.",
    );
  }

  const page = pages[0];
  const pageId = String(page.id);
  const pageToken = String(page.access_token);

  const connectionId: Id<"connections"> = await ctx.runMutation(
    internal.facebookStore.saveConnectedCredentials,
    {
      workspaceId,
      pageId,
      ...(page.name ? { pageName: page.name } : {}),
      encryptedCredentials: await encryptCredentials(pageToken),
      encryptedUserCredentials: await encryptCredentials(userToken),
    },
  );

  const expiresAt = await fetchTokenExpiry(pageToken, tracker);
  if (expiresAt !== undefined) {
    await ctx.runMutation(internal.facebookStore.updateTokenExpiry, {
      connectionId,
      expiresAt,
    });
  }

  await subscribePageToWebhook(pageId, pageToken, tracker);

  try {
    await ctx.runAction(internal.facebook.syncFacebook, { connectionId });
  } catch {
    // Errors are already recorded on the syncRuns row.
  }

  return {
    success: true,
    connectionId,
    pageId,
    pageName: page.name ?? null,
    pageCount: pages.length,
  };
}

/**
 * Complete OAuth from the PUBLIC callback route (no browser session needed).
 * The one-time `state` nonce both authenticates the request and resolves the
 * target workspace.
 */
export const completeOAuthFromCallback = action({
  args: { state: v.string(), code: v.string() },
  handler: async (ctx, { state, code }): Promise<FacebookOAuthResult> => {
    const stored: {
      workspaceId: Id<"workspaces">;
      redirectUri: string;
      createdAt: number;
    } | null = await ctx.runMutation(
      internal.facebookStore.consumeOAuthState,
      { nonce: state },
    );

    if (stored === null) {
      invalid(
        "Nepoznat ili već iskorišćen state parametar. Pokreni povezivanje ponovo iz Podešavanja.",
      );
    }
    if (Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS) {
      invalid("Autorizacija je istekla. Pokreni povezivanje ponovo.");
    }

    return await exchangeCodeAndConnect(ctx, {
      workspaceId: stored.workspaceId,
      code,
      redirectUri: stored.redirectUri,
    });
  },
});

// ── Page picker ──────────────────────────────────────────────────────────────

/** Resolve the caller's workspace, or throw. Used by every authenticated action. */
async function requireWorkspace(ctx: ActionCtx): Promise<Id<"workspaces">> {
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
  return member.workspaceId;
}

type StoredConnection = {
  connectionId: Id<"connections">;
  pageId: string;
  encryptedCredentials: string;
  encryptedUserCredentials: string | null;
};

async function requireStoredUserToken(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
): Promise<{ conn: StoredConnection; userToken: string }> {
  const conn: StoredConnection | null = await ctx.runQuery(
    internal.facebookStore.getConnection,
    { workspaceId },
  );
  if (conn === null) {
    invalid("Facebook stranica nije povezana.");
  }
  if (conn.encryptedUserCredentials === null) {
    invalid(
      "Nedostaje Facebook autorizacija naloga. Klikni „Poveži Facebook stranicu” da ponoviš prijavu.",
    );
  }

  let userToken: string;
  try {
    userToken = await decryptCredentials(conn.encryptedUserCredentials);
  } catch {
    invalid("Facebook kredencijali se ne mogu pročitati. Ponovo poveži nalog.");
  }
  return { conn, userToken };
}

/** Every Page the connected account administers, for the picker. */
export const listPages = action({
  args: {},
  returns: v.array(
    v.object({
      id: v.string(),
      name: v.string(),
      category: v.union(v.string(), v.null()),
      connected: v.boolean(),
    }),
  ),
  handler: async (
    ctx,
  ): Promise<
    Array<{
      id: string;
      name: string;
      category: string | null;
      connected: boolean;
    }>
  > => {
    const workspaceId = await requireWorkspace(ctx);
    const { conn, userToken } = await requireStoredUserToken(ctx, workspaceId);

    const pages = await withUsageTracker(ctx, workspaceId, (tracker) =>
      fetchPages(userToken, tracker),
    );
    return pages.map((page) => ({
      id: String(page.id),
      name: page.name ?? String(page.id),
      category: page.category ?? null,
      connected: String(page.id) === conn.pageId,
    }));
  },
});

/** Switch the workspace to a different Page the same account administers. */
export const selectPage = action({
  args: { pageId: v.string() },
  returns: v.object({ pageId: v.string(), pageName: v.union(v.string(), v.null()) }),
  handler: async (
    ctx,
    { pageId },
  ): Promise<{ pageId: string; pageName: string | null }> => {
    const workspaceId = await requireWorkspace(ctx);
    const { userToken } = await requireStoredUserToken(ctx, workspaceId);

    // Three Meta calls to swap Page, and the readings matter even when the
    // middle one throws at the picker (P2).
    const tracker = createUsageTracker();
    try {
      const pages = await fetchPages(userToken, tracker);
      const page = pages.find((p) => String(p.id) === pageId);
      if (page === undefined) {
        invalid("Ova stranica nije među stranicama koje nalog administrira.");
      }

      const pageToken = String(page.access_token);
      const connectionId: Id<"connections"> = await ctx.runMutation(
        internal.facebookStore.saveConnectedCredentials,
        {
          workspaceId,
          pageId,
          ...(page.name ? { pageName: page.name } : {}),
          encryptedCredentials: await encryptCredentials(pageToken),
        },
      );

      const expiresAt = await fetchTokenExpiry(pageToken, tracker);
      if (expiresAt !== undefined) {
        await ctx.runMutation(internal.facebookStore.updateTokenExpiry, {
          connectionId,
          expiresAt,
        });
      }

      await subscribePageToWebhook(pageId, pageToken, tracker);

      try {
        await ctx.runAction(internal.facebook.syncFacebook, { connectionId });
      } catch {
        // Errors are already recorded on the syncRuns row.
      }

      return { pageId, pageName: page.name ?? null };
    } finally {
      await tracker.flush(ctx, workspaceId);
    }
  },
});

// ── Token refresh ────────────────────────────────────────────────────────────

/**
 * Re-mint the Page token from the stored long-lived user token, and extend that
 * user token while we are there.
 *
 * "Refresh" is a slight misnomer for Facebook: a long-lived Page token has no
 * expiry of its own, so what this really guards against is the user token
 * ageing out from under it and the 90-day data-access window closing. Asking
 * `/me/accounts` again is how a token that has quietly been invalidated —
 * password change, permission withdrawn — is discovered before a sync fails.
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
    reason?: string;
    expiresAt?: number;
  }> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (conn === null || conn.provider !== "meta_fb") {
      return { skipped: true, reason: "Connection not found or not meta_fb" };
    }

    const now = Date.now();
    if (!force && conn.expiresAt && conn.expiresAt - now > REFRESH_THRESHOLD_MS) {
      return { skipped: true, reason: "Token is still fresh" };
    }

    if (!conn.encryptedUserCredentials) {
      return { skipped: true, reason: "No stored user token" };
    }

    const clientId = getFacebookAppId();
    const clientSecret = getFacebookAppSecret();
    if (!clientId || !clientSecret) {
      return { skipped: true, reason: "Meta app not configured" };
    }

    let userToken: string;
    try {
      userToken = await decryptCredentials(conn.encryptedUserCredentials);
    } catch {
      await ctx.runMutation(internal.facebookStore.markConnectionExpired, {
        connectionId,
      });
      return { success: false, reason: "Decryption failed" };
    }

    // Three Meta calls on a daily cron, per connection. The reading matters
    // most on the failing path — a 429 here is exactly what the gate has to
    // hear about (P2).
    const tracker = createUsageTracker();
    try {
      // Extend the user token first; a failure here means the person has to sign
      // in again, and there is no point asking for Page tokens with a dead one.
      try {
        const res = await tracker.fetch(
          buildFacebookLongLivedTokenUrl({
            clientId,
            clientSecret,
            shortLivedToken: userToken,
          }),
        );
        if (res.ok) {
          const body = await readJson<RawFacebookTokenResponse>(res);
          if (body.access_token) userToken = body.access_token;
        }
      } catch {
        // Keep the old one and let the /me/accounts call be the real verdict.
      }

      let pages: RawPageAccount[];
      try {
        pages = await fetchPages(userToken, tracker);
      } catch {
        await ctx.runMutation(internal.facebookStore.markConnectionExpired, {
          connectionId,
        });
        return { success: false, reason: "Facebook refused /me/accounts" };
      }

      const page = pages.find((p) => String(p.id) === conn.externalId);
      if (page === undefined) {
        await ctx.runMutation(internal.facebookStore.markConnectionExpired, {
          connectionId,
        });
        return {
          success: false,
          reason: "Connected Page is no longer administered by this account",
        };
      }

      const pageToken = String(page.access_token);
      await ctx.runMutation(internal.facebookStore.saveConnectedCredentials, {
        workspaceId: conn.workspaceId,
        pageId: String(page.id),
        ...(page.name ? { pageName: page.name } : {}),
        encryptedCredentials: await encryptCredentials(pageToken),
        encryptedUserCredentials: await encryptCredentials(userToken),
      });

      const expiresAt = await fetchTokenExpiry(pageToken, tracker);
      await ctx.runMutation(internal.facebookStore.updateTokenExpiry, {
        connectionId,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });

      return { success: true, ...(expiresAt !== undefined ? { expiresAt } : {}) };
    } finally {
      await tracker.flush(ctx, conn.workspaceId);
    }
  },
});

/** The button in Settings. Forces the refresh regardless of remaining time. */
export const refreshTokenNow = action({
  args: {},
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx): Promise<{ success: boolean; message: string }> => {
    const workspaceId = await requireWorkspace(ctx);
    const conn: StoredConnection | null = await ctx.runQuery(
      internal.facebookStore.getConnection,
      { workspaceId },
    );
    if (conn === null) {
      invalid("Facebook stranica nije povezana.");
    }

    const result: { success?: boolean; skipped?: boolean; reason?: string } =
      await ctx.runAction(internal.facebook.refreshConnectionToken, {
        connectionId: conn.connectionId,
        force: true,
      });

    if (result.success === true) {
      return { success: true, message: "Token je osvežen." };
    }
    return {
      success: false,
      message:
        "Osvežavanje nije uspelo. Klikni „Poveži Facebook stranicu” da ponoviš prijavu.",
    };
  },
});

/** Daily cron fan-out. */
export const refreshAllTokens = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.fbTokens, async () => {
      const ids: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_fb" },
      );
      for (const connectionId of ids) {
        try {
          await ctx.runAction(internal.facebook.refreshConnectionToken, {
            connectionId,
          });
        } catch (err) {
          console.warn(
            "Facebook: osvežavanje tokena nije uspelo —",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    });
    return null;
  },
});

// ── Sync ─────────────────────────────────────────────────────────────────────

/**
 * One Page: daily insights, the recent feed, and comments on the recent posts.
 *
 * Everything after the token decrypt is best-effort per step. A Page whose
 * insights call is rate-limited still gets its posts, and a post whose comments
 * call fails does not take the other nineteen with it — the run is recorded as
 * ok with whatever it managed to write, and the next one picks the rest up.
 * Only a failure that leaves nothing to write at all throws.
 */
export const syncFacebook = internalAction({
  args: { connectionId: v.id("connections") },
  returns: v.null(),
  handler: async (ctx, { connectionId }): Promise<null> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );
    if (
      conn === null ||
      conn.provider !== "meta_fb" ||
      !conn.externalId ||
      conn.externalId.length === 0
    ) {
      return null;
    }

    const workspaceId = conn.workspaceId;
    const pageId = conn.externalId;

    await runSync(
      ctx,
      { workspaceId, provider: "meta_fb", connectionId },
      async () => {
        const token = await decryptCredentials(conn.encryptedCredentials);
        const version = getMetaGraphVersion();
        const now = Date.now();
        let written = 0;

        // Every Graph answer says how much of the app's allowance is spent
        // (F6). The Page and the Instagram account share one Meta app, so this
        // reading is what makes the two-minute schedulers stand down in time.
        const tracker = createUsageTracker();

        // 1. The Page node — mostly to keep the name in Settings honest.
        try {
          const res = await tracker.fetch(
            buildPageNodeUrl(pageId, token, version),
          );
          if (res.ok) {
            const node = await readJson<RawPageNode>(res);
            if (node.name) {
              await ctx.runMutation(
                internal.facebookStore.saveConnectedCredentials,
                {
                  workspaceId,
                  pageId,
                  pageName: node.name,
                  encryptedCredentials: conn.encryptedCredentials,
                },
              );
            }
          }
        } catch {
          // The name is a nicety; nothing downstream depends on it.
        }

        // 2. Daily Page insights.
        //
        // Asked for twice at most. Meta refuses the WHOLE request when one
        // metric in the list has been retired, and `page_fans` is the one Meta
        // keeps threatening — so a refusal is retried without it rather than
        // costing the two metrics that were fine.
        try {
          const since = Math.floor(
            (now - INSIGHTS_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000,
          );
          const until = Math.floor(now / 1000);

          let res = await tracker.fetch(
            buildPageInsightsUrl({
              pageId,
              accessToken: token,
              since,
              until,
              version,
            }),
          );
          if (!res.ok) {
            const body = await res.text().catch(() => "");
            console.warn(
              "Facebook: uvidi stranice odbijeni, pokušavam bez page_fans —",
              extractGraphApiError(body),
            );
            res = await tracker.fetch(
              buildPageInsightsUrl({
                pageId,
                accessToken: token,
                since,
                until,
                metrics: PAGE_INSIGHT_METRICS_CORE,
                version,
              }),
            );
          }

          if (res.ok) {
            const rows = extractPageInsights(
              await readJson<RawFbInsightsResponse>(res),
            );
            if (rows.length > 0) {
              written += await ctx.runMutation(
                internal.facebookStore.upsertPageDaily,
                { workspaceId, rows },
              );
            }
          } else {
            const body = await res.text().catch(() => "");
            console.warn(
              "Facebook: uvidi stranice nisu preuzeti —",
              extractGraphApiError(body),
            );
          }
        } catch (err) {
          console.warn(
            "Facebook: uvidi stranice nisu preuzeti —",
            err instanceof Error ? err.message : String(err),
          );
        }

        // 3. The feed.
        const postsRes = await tracker.fetch(
          buildPagePostsUrl(pageId, token, FB_POSTS_PER_SYNC, version),
        );
        if (!postsRes.ok) {
          const body = await postsRes.text().catch(() => "");
          throw new Error(translateFacebookError(body));
        }
        const postsBody = await readJson<RawPagePostsResponse>(postsRes);
        const posts = normalizePagePosts(postsBody.data);

        // 4. Per-post insights, newest first and capped: thirty extra calls
        // every six hours would spend the Page's whole rate budget on numbers
        // nobody scrolls down to.
        const withInsights = await Promise.all(
          posts.map(async (post, index) => {
            if (index >= POST_INSIGHTS_LIMIT) return post;
            // Meta already refused; the rest of the batch cannot land (P2).
            if (tracker.throttled) return post;
            try {
              let res = await tracker.fetch(
                buildPostInsightsUrl(post.postId, token),
              );
              // Same all-or-nothing rule as the Page insights: one retired
              // metric name costs every number on the card, so a refusal is
              // retried with the one metric that has never gone away.
              if (!res.ok) {
                res = await tracker.fetch(
                  buildPostInsightsUrl(
                    post.postId,
                    token,
                    POST_INSIGHT_METRICS_CORE,
                  ),
                );
              }
              if (!res.ok) return post;
              const insight = extractPostInsights(
                await readJson<RawFbInsightsResponse>(res),
              );
              return { ...post, ...insight };
            } catch {
              return post;
            }
          }),
        );

        if (withInsights.length > 0) {
          written += await ctx.runMutation(
            internal.facebookStore.upsertPagePosts,
            {
              workspaceId,
              rows: withInsights,
              // Only a first page with nothing after it proves that a post
              // missing from the answer is actually gone.
              complete: !postsBody.paging?.next,
              syncedAt: now,
            },
          );
        }

        // 5. Comments on the recent posts.
        const postIds: string[] = await ctx.runQuery(
          internal.facebookStore.listRecentPostIds,
          {
            workspaceId,
            since: now - FB_COMMENT_SYNC_WINDOW_MS,
            limit: FB_COMMENT_POST_LIMIT,
          },
        );

        for (const postId of postIds) {
          if (tracker.throttled) break; // P2: a refusal ends the loop
          try {
            written += await syncPostComments(ctx, {
              workspaceId,
              postId,
              pageId,
              token,
              version,
              syncedAt: now,
              tracker,
            });
          } catch {
            // One post's comments failing must not cost the other nineteen.
          }
        }

        // What Meta said about the allowance, written once for the whole run.
        // Also stamps the "full pass" row the Settings schedule table reads.
        await tracker.flush(ctx, workspaceId);
        await ctx.runMutation(internal.metaSyncStore.recordJob, {
          workspaceId,
          provider: "meta_fb",
          job: "full",
          ok: true,
          itemsWritten: written,
        });

        return written;
      },
    );

    return null;
  },
});

/**
 * Six-hourly cron fan-out.
 *
 * Gated like every other scheduled pass since F6: the Page and the Instagram
 * account draw on ONE Meta app allowance, and this is the pass that spends the
 * most of it in a single go.
 */
export const syncAllFacebook = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One run at a time (P2). Convex fires a cron on its own clock and does not
    // ask whether the previous firing has finished; a pass that outgrows its
    // cadence would otherwise run as two copies over the same allowance.
    await withCronLock(ctx, CRON_LOCKS.fbSync, async () => {
      const ids: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_fb" },
      );
      for (const connectionId of ids) {
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
              provider: "meta_fb",
              job: "full",
              ok: false,
              skipReason:
                "Potrošnja Meta limita je previsoka; sledeći prolaz preskočen.",
            });
            continue;
          }

          await ctx.runAction(internal.facebook.syncFacebook, { connectionId });
        } catch {
          // Already recorded on the syncRuns row.
        }
      }
    });
    return null;
  },
});
