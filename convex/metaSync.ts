"use node";

import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { decryptCredentials } from "./lib/crypto";
import { sanitizeSyncError } from "./lib/runSync";
import { CRON_LOCKS, withCronLock } from "./lib/cronLock";
import {
  TARGETED_DEBOUNCE_MS,
  allowsBackground,
  allowsTargeted,
  createUsageTracker,
  readGate,
  type UsageTracker,
} from "./lib/metaRateLimit";
import {
  MEDIA_LIST_FIELDS,
  buildMeInsightsUrl,
  buildMeMediaIdsUrl,
  buildMeUrl,
  buildMediaCommentsUrl,
  buildMediaFieldsUrl,
  buildMediaInsightsUrl,
  classifyMissingObject,
  extractAccountInsights,
  extractGraphApiError,
  extractMediaInsights,
  getMetaGraphVersion,
  getMetricsForMediaType,
  isMissingObjectError,
  toStoredMediaRow,
  type RawCommentsResponse,
  type RawInsightsResponse,
  type RawMediaFieldsResponse,
  type RawMediaListResponse,
  type RawUserProfile,
} from "./lib/instagramApi";
import { COMMENTS_PER_MEDIA, normalizeComments } from "./lib/igComments";
import {
  buildPageInsightsUrl,
  buildPagePostIdsUrl,
  buildPostCommentsUrl,
  buildPostInsightsUrl,
  buildPostNodeUrl,
  PAGE_INSIGHT_METRICS_CORE,
  POST_INSIGHT_METRICS_CORE,
  type RawFbCommentsResponse,
  type RawFbInsightsResponse,
  type RawPagePost,
  type RawPagePostsResponse,
} from "./lib/facebookApi";
import {
  FB_COMMENTS_PER_POST,
  extractPageInsights,
  extractPostInsights,
  normalizeFbComments,
  normalizePagePosts,
} from "./lib/facebookContent";

/**
 * ============================================================================
 * META SYNC SCHEDULING (Node runtime) — F6
 * ============================================================================
 *
 * Three levels, and the difference between them is what triggers them:
 *
 *   Level 1 — an event. A comment arrives on the webhook, and THAT ONE POST is
 *     refreshed within the second. Never the whole account: a webhook is news
 *     about one object, and answering it with a full sync would turn a busy
 *     morning into a rate limit.
 *
 *   Level 2 — a two-minute poll, and the cheapest one that can exist: five ids,
 *     no numbers. Instagram has no webhook for publishing, so a new post can
 *     only be noticed by asking. Nothing is written unless the answer holds an
 *     id we have never seen — the usual outcome is one call and silence.
 *
 *   Level 3 — depth on a clock. Insights are not computed in real time by Meta
 *     anyway; reach on a post published five minutes ago is not late because we
 *     were slow, it is late because it does not exist yet. So the recent posts
 *     and the account snapshot are re-read hourly, the full pass stays at six
 *     hours, and the deletion sweep runs once a day.
 *
 * Every level reads the rate-limit gate first (`lib/metaRateLimit.ts`). Levels
 * 2 and 3 stand down while the app is over 80 % of its allowance; level 1 keeps
 * going until Meta actually refuses.
 * ============================================================================
 */

const metaProviderValidator = v.union(
  v.literal("meta_ig"),
  v.literal("meta_fb"),
);

type MetaProvider = "meta_ig" | "meta_fb";

/** How many ids the two-minute poll asks for. */
const HEAD_CHECK_LIMIT = 5;

/** A post is "recent" — worth an hourly insights read — for two weeks. */
const HOT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/** How many recent posts one hourly pass re-reads. Newest first. */
const HOT_MEDIA_LIMIT = 10;

/** How far back the daily deletion sweep's listing reaches. */
const DELETION_LIST_LIMIT = 50;

/** How many "did this post really disappear?" probes one sweep may spend. */
const DELETION_CHECK_LIMIT = 25;

/**
 * Window for the hourly Page insights read. Facebook restates the last few
 * days, so three covers every value that can still move — the six-hourly pass
 * is the one that reaches back a month.
 */
const FB_HOURLY_INSIGHTS_DAYS = 3;

// ── Shared plumbing ─────────────────────────────────────────────────────────

interface LoadedConnection {
  conn: Doc<"connections">;
  token: string;
}

/**
 * Fetch a connection and decrypt its token, or give up quietly.
 *
 * Quietly on purpose: these actions run on a two-minute cron across every
 * workspace, and a connection whose token has been revoked would otherwise
 * throw seven hundred times a day into the logs. The token lifecycle already
 * has an owner — `refreshAllTokens` marks it expired and Settings says so.
 */
async function loadConnection(
  ctx: ActionCtx,
  connectionId: Id<"connections">,
  provider: MetaProvider,
): Promise<LoadedConnection | null> {
  const conn: Doc<"connections"> | null = await ctx.runQuery(
    internal.connections.getForSync,
    { connectionId },
  );
  if (conn === null || conn.provider !== provider) return null;
  // Mid-erasure this connection accepts no reads-that-write (R1/4b): a targeted
  // refresh fired by a webhook must not repopulate a table the purge is
  // draining. The credentials are wiped once revoke settles, but the revoke
  // retries can keep them alive for a while, so status is the honest gate here.
  if (conn.status === "disconnecting") return null;
  if (!conn.encryptedCredentials) return null;

  try {
    return { conn, token: await decryptCredentials(conn.encryptedCredentials) };
  } catch {
    return null;
  }
}

/** Record the outcome of one pass and write down whatever usage it observed. */
async function finishPass(
  ctx: ActionCtx,
  tracker: UsageTracker,
  params: {
    workspaceId: Id<"workspaces">;
    provider: MetaProvider;
    job: string;
    ok: boolean;
    itemsWritten?: number;
    skipReason?: string;
  },
): Promise<void> {
  await tracker.flush(ctx, params.workspaceId);
  await ctx.runMutation(internal.metaSyncStore.recordJob, {
    workspaceId: params.workspaceId,
    provider: params.provider,
    job: params.job,
    ok: params.ok,
    ...(params.itemsWritten !== undefined
      ? { itemsWritten: params.itemsWritten }
      : {}),
    ...(params.skipReason !== undefined
      ? { skipReason: params.skipReason }
      : {}),
  });
}

/**
 * Human-readable reason a pass stood down, stored for the Settings table.
 *
 * Named by network even though the allowance is one shared app budget: the row
 * sits under a network's heading, and "Facebook is holding us back" printed
 * under the Instagram list would read as a different fact than it is.
 */
function gateReason(state: string, provider: MetaProvider): string {
  const network = provider === "meta_ig" ? "Instagram" : "Facebook";
  return state === "backoff"
    ? `${network} privremeno ograničava pozive.`
    : "Potrošnja Meta limita je previsoka; sledeći prolaz preskočen.";
}

// ── Level 1 — Instagram, one post ───────────────────────────────────────────

/**
 * Our own @handle, cached on the connection. The comments edge identifies an
 * author by handle alone, so without it every comment of ours would be read
 * back as somebody else's.
 */
async function resolveIgHandle(
  ctx: ActionCtx,
  loaded: LoadedConnection,
  tracker: UsageTracker,
): Promise<string | undefined> {
  if (loaded.conn.accountHandle) return loaded.conn.accountHandle;

  try {
    const res = await tracker.fetch(
      buildMeUrl(loaded.token, getMetaGraphVersion()),
    );
    if (!res.ok) return undefined;
    const profile = (await res.json()) as RawUserProfile;
    if (!profile.username) return undefined;

    await ctx.runMutation(internal.instagramStore.saveAccountHandle, {
      connectionId: loaded.conn._id,
      handle: profile.username,
    });
    return profile.username;
  } catch {
    return undefined;
  }
}

/**
 * Re-read ONE Instagram post: its node, its insights, its comments.
 *
 * Three calls, and that is the whole cost of a comment arriving. The insights
 * call is included even though Meta computes reach with a delay — the likes and
 * the comment count on the same card are exact and immediate, and a card that
 * updates half of itself looks broken.
 */
async function refreshIgMedia(
  ctx: ActionCtx,
  params: {
    workspaceId: Id<"workspaces">;
    token: string;
    mediaId: string;
    ourUsername: string | undefined;
  },
  tracker: UsageTracker,
): Promise<number> {
  const { workspaceId, token, mediaId, ourUsername } = params;
  const version = getMetaGraphVersion();
  const now = Date.now();
  const snapshotAt = now;

  const nodeRes = await tracker.fetch(
    buildMediaFieldsUrl(mediaId, MEDIA_LIST_FIELDS, token, version),
  );
  if (!nodeRes.ok) {
    const body = await nodeRes.text().catch(() => "");
    if (!isMissingObjectError(nodeRes.status, body)) {
      console.warn("Instagram: objava nije osvežena —", extractGraphApiError(body));
    }
    // A post that is gone is left to the daily sweep, which owns that verdict
    // and knows how to tell "deleted" from "temporarily unreadable".
    return 0;
  }

  const node = (await nodeRes.json()) as RawMediaFieldsResponse;
  if (!node.id) return 0;

  let insight = { reach: 0, saves: 0, shares: 0, views: 0 };
  try {
    const metrics = getMetricsForMediaType(
      node.media_type ?? "",
      node.media_product_type,
    );
    const res = await tracker.fetch(
      buildMediaInsightsUrl(mediaId, metrics, token, version),
    );
    if (res.ok) {
      const json = (await res.json()) as RawInsightsResponse;
      insight = extractMediaInsights(
        json.data,
        node.media_type,
        node.media_product_type,
      );
    }
  } catch {
    // Insights are the one part Meta computes late anyway; the rest still lands.
  }

  const row = toStoredMediaRow(
    { ...node, id: String(node.id) },
    insight,
    now,
  );

  let written: number = await ctx.runMutation(
    internal.instagramStore.upsertMediaBatch,
    { workspaceId, rows: [row] },
  );

  try {
    const res = await tracker.fetch(
      buildMediaCommentsUrl(mediaId, token, COMMENTS_PER_MEDIA, version),
    );
    if (res.ok) {
      const json = (await res.json()) as RawCommentsResponse;
      written += await ctx.runMutation(
        internal.igCommentsStore.upsertCommentBatch,
        {
          workspaceId,
          mediaId,
          rows: normalizeComments(json.data, ourUsername),
          // NEVER marks anything as deleted, even on a complete first page.
          //
          // This refresh is triggered by a comment that arrived a second ago,
          // and the comments edge is not guaranteed to be showing it yet.
          // Treating "not in the answer" as "gone" here would let the panel
          // delete the very comment that woke it up. Deletions stay with the
          // six-hourly pass, which reads a post long after anything on it
          // settled.
          complete: false,
          syncedAt: now,
          snapshotAt,
        },
      );
    }
  } catch (err) {
    console.warn("Instagram: komentari nisu osveženi —", sanitizeSyncError(err));
  }

  return written;
}

// ── Level 1 — Facebook, one post ────────────────────────────────────────────

async function refreshFbPost(
  ctx: ActionCtx,
  params: {
    workspaceId: Id<"workspaces">;
    token: string;
    pageId: string;
    postId: string;
  },
  tracker: UsageTracker,
): Promise<number> {
  const { workspaceId, token, pageId, postId } = params;
  const version = getMetaGraphVersion();
  const now = Date.now();

  const nodeRes = await tracker.fetch(buildPostNodeUrl(postId, token, version));
  if (!nodeRes.ok) return 0;

  const node = (await nodeRes.json()) as RawPagePost;
  const posts = normalizePagePosts([node]);
  if (posts.length === 0) return 0;

  let insight = {};
  try {
    let res = await tracker.fetch(buildPostInsightsUrl(postId, token));
    // One retired metric name costs every number on the card, so a refusal is
    // retried with the metric that has never gone away.
    if (!res.ok) {
      res = await tracker.fetch(
        buildPostInsightsUrl(postId, token, POST_INSIGHT_METRICS_CORE),
      );
    }
    if (res.ok) {
      insight = extractPostInsights(
        (await res.json()) as RawFbInsightsResponse,
      );
    }
  } catch {
    // Same as Instagram: the counts are exact, the insights are best effort.
  }

  let written: number = await ctx.runMutation(
    internal.facebookStore.upsertPagePosts,
    {
      workspaceId,
      rows: [{ ...posts[0], ...insight }],
      // One post is never evidence about the others, so nothing may be marked
      // as gone from this answer.
      complete: false,
      syncedAt: now,
    },
  );

  try {
    const res = await tracker.fetch(
      buildPostCommentsUrl(postId, token, FB_COMMENTS_PER_POST, version),
    );
    if (res.ok) {
      const body = (await res.json()) as RawFbCommentsResponse;
      written += await ctx.runMutation(
        internal.fbCommentsStore.upsertCommentBatch,
        {
          workspaceId,
          postId,
          rows: normalizeFbComments(body.data, pageId),
          // Same as Instagram: a refresh woken by a brand new comment must not
          // be allowed to conclude that comments are missing.
          complete: false,
          syncedAt: now,
          snapshotAt: now,
        },
      );
    }
  } catch (err) {
    console.warn("Facebook: komentari nisu osveženi —", sanitizeSyncError(err));
  }

  return written;
}

/**
 * The webhook's entry point: a comment landed on this post, go and look at it.
 *
 * Scheduled with `runAfter(0)` from `http.ts` so the webhook answers Meta
 * immediately — Meta retries and eventually unsubscribes a callback that is
 * slow, and a Graph read is far too slow to do inline.
 *
 * A direct message deliberately does NOT come through here. A DM changes
 * nothing that lives on Instagram's side: the message, the automation and the
 * send are all written to our own tables by the ingest, and those writes reach
 * the open screen through Convex the moment they land. There is nothing to
 * fetch, so there is no call to spend.
 */
export const refreshFromWebhook = internalAction({
  args: {
    provider: metaProviderValidator,
    /** IG professional account id, or Page id — whichever webhook called. */
    accountId: v.string(),
    mediaId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { provider, accountId, mediaId }): Promise<null> => {
    const resolved: {
      connectionId: Id<"connections">;
      workspaceId: Id<"workspaces">;
    } | null =
      provider === "meta_ig"
        ? await ctx.runQuery(
            internal.instagramStore.resolveConnectionByAccount,
            { accountId },
          )
        : await ctx.runQuery(internal.facebookStore.resolveConnectionByPage, {
            pageId: accountId,
          });
    if (resolved === null) return null;

    const { connectionId, workspaceId } = resolved;

    const gate = await readGate(ctx, workspaceId);
    if (!allowsTargeted(gate)) {
      await ctx.runMutation(internal.metaSyncStore.recordJob, {
        workspaceId,
        provider,
        job: "event",
        ok: false,
        skipReason: gateReason(gate.state, provider),
      });
      return null;
    }

    // Ten comments in ten seconds are one refresh, not ten.
    const claimed: boolean = await ctx.runMutation(
      internal.metaSyncStore.claimTargeted,
      { workspaceId, provider, mediaId, minIntervalMs: TARGETED_DEBOUNCE_MS },
    );
    if (!claimed) return null;

    const loaded = await loadConnection(ctx, connectionId, provider);
    if (loaded === null) return null;

    const tracker = createUsageTracker();
    let written = 0;
    let ok = true;

    try {
      if (provider === "meta_ig") {
        const ourUsername = await resolveIgHandle(ctx, loaded, tracker);
        written = await refreshIgMedia(
          ctx,
          { workspaceId, token: loaded.token, mediaId, ourUsername },
          tracker,
        );
      } else {
        written = await refreshFbPost(
          ctx,
          {
            workspaceId,
            token: loaded.token,
            pageId: loaded.conn.externalId ?? accountId,
            postId: mediaId,
          },
          tracker,
        );
      }
    } catch (err) {
      ok = false;
      console.warn(
        "Ciljano osvežavanje nije uspelo —",
        sanitizeSyncError(err),
      );
    }

    await finishPass(ctx, tracker, {
      workspaceId,
      provider,
      job: "event",
      ok,
      itemsWritten: written,
    });
    return null;
  },
});

// ── Level 2 — the two-minute head check ─────────────────────────────────────

/**
 * Instagram: are there posts we have never seen?
 *
 * One call per account per tick, and in the overwhelming majority of ticks the
 * answer is "no" and the pass ends there having written nothing at all.
 */
export const igHeadCheck = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One run at a time (P2). A pass that outlives its own cadence would
    // otherwise be running as two copies, both spending the same allowance
    // on the same posts.
    await withCronLock(ctx, CRON_LOCKS.igHeadCheck, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );

      for (const connectionId of connectionIds) {
        const loaded = await loadConnection(ctx, connectionId, "meta_ig");
        if (loaded === null) continue;

        const workspaceId = loaded.conn.workspaceId;
        const gate = await readGate(ctx, workspaceId);
        if (!allowsBackground(gate)) {
          await ctx.runMutation(internal.metaSyncStore.recordJob, {
            workspaceId,
            provider: "meta_ig",
            job: "head",
            ok: false,
            skipReason: gateReason(gate.state, "meta_ig"),
          });
          continue;
        }

        const tracker = createUsageTracker();
        let written = 0;
        let ok = true;

        try {
          const res = await tracker.fetch(
            buildMeMediaIdsUrl(
              loaded.token,
              HEAD_CHECK_LIMIT,
              getMetaGraphVersion(),
            ),
          );
          if (res.ok) {
            const json = (await res.json()) as RawMediaListResponse;
            const ids = (json.data ?? [])
              .map((item) => (item?.id ? String(item.id) : ""))
              .filter((id) => id.length > 0);

            const unknown: string[] = ids.length
              ? await ctx.runQuery(internal.instagramStore.findUnknownMediaIds, {
                  workspaceId,
                  mediaIds: ids,
                })
              : [];

            if (unknown.length > 0) {
              const ourUsername = await resolveIgHandle(ctx, loaded, tracker);
              for (const mediaId of unknown) {
                // Meta refused: the remaining posts are not likelier to land,
                // and asking anyway only lengthens the block (P2).
                if (tracker.throttled) break;

                // The claim's answer is the point of the claim (P2). Ignoring it
                // meant an overlapped run — or a webhook that arrived one second
                // ago — re-read the same brand new post a second time, which is
                // exactly the duplicate work the debounce exists to stop.
                const claimed: boolean = await ctx.runMutation(
                  internal.metaSyncStore.claimTargeted,
                  {
                    workspaceId,
                    provider: "meta_ig",
                    mediaId,
                    minIntervalMs: TARGETED_DEBOUNCE_MS,
                  },
                );
                if (!claimed) continue;

                written += await refreshIgMedia(
                  ctx,
                  { workspaceId, token: loaded.token, mediaId, ourUsername },
                  tracker,
                );
              }
            }
          } else {
            ok = false;
          }
        } catch (err) {
          ok = false;
          console.warn("Instagram head check —", sanitizeSyncError(err));
        }

        await finishPass(ctx, tracker, {
          workspaceId,
          provider: "meta_ig",
          job: "head",
          ok,
          itemsWritten: written,
        });
      }
    });
    return null;
  },
});

/** Facebook: the same question, asked of the Page feed. */
export const fbHeadCheck = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One run at a time (P2). A pass that outlives its own cadence would
    // otherwise be running as two copies, both spending the same allowance
    // on the same posts.
    await withCronLock(ctx, CRON_LOCKS.fbHeadCheck, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_fb" },
      );

      for (const connectionId of connectionIds) {
        const loaded = await loadConnection(ctx, connectionId, "meta_fb");
        if (loaded === null) continue;

        const pageId = loaded.conn.externalId;
        if (!pageId) continue;

        const workspaceId = loaded.conn.workspaceId;
        const gate = await readGate(ctx, workspaceId);
        if (!allowsBackground(gate)) {
          await ctx.runMutation(internal.metaSyncStore.recordJob, {
            workspaceId,
            provider: "meta_fb",
            job: "head",
            ok: false,
            skipReason: gateReason(gate.state, "meta_fb"),
          });
          continue;
        }

        const tracker = createUsageTracker();
        let written = 0;
        let ok = true;

        try {
          const res = await tracker.fetch(
            buildPagePostIdsUrl(
              pageId,
              loaded.token,
              HEAD_CHECK_LIMIT,
              getMetaGraphVersion(),
            ),
          );
          if (res.ok) {
            const json = (await res.json()) as RawPagePostsResponse;
            const ids = (json.data ?? [])
              .map((post) => (post?.id ? String(post.id) : ""))
              .filter((id) => id.length > 0);

            const unknown: string[] = ids.length
              ? await ctx.runQuery(internal.facebookStore.findUnknownPostIds, {
                  workspaceId,
                  postIds: ids,
                })
              : [];

            for (const postId of unknown) {
              // Same two rules as Instagram: stop on a refusal, and honour the
              // claim rather than re-reading what somebody else just took (P2).
              if (tracker.throttled) break;

              const claimed: boolean = await ctx.runMutation(
                internal.metaSyncStore.claimTargeted,
                {
                  workspaceId,
                  provider: "meta_fb",
                  mediaId: postId,
                  minIntervalMs: TARGETED_DEBOUNCE_MS,
                },
              );
              if (!claimed) continue;

              written += await refreshFbPost(
                ctx,
                { workspaceId, token: loaded.token, pageId, postId },
                tracker,
              );
            }
          } else {
            ok = false;
          }
        } catch (err) {
          ok = false;
          console.warn("Facebook head check —", sanitizeSyncError(err));
        }

        await finishPass(ctx, tracker, {
          workspaceId,
          provider: "meta_fb",
          job: "head",
          ok,
          itemsWritten: written,
        });
      }
    });
    return null;
  },
});

// ── Level 3 — the hourly depth pass ─────────────────────────────────────────

async function hourlyInstagram(
  ctx: ActionCtx,
  loaded: LoadedConnection,
): Promise<void> {
  const workspaceId = loaded.conn.workspaceId;
  const version = getMetaGraphVersion();
  const tracker = createUsageTracker();

  // 1. The account snapshot. Followers move all day; a six-hour-old number is
  // the kind of stale that makes a person doubt the whole screen.
  let accountOk = true;
  try {
    let followersCount = 0;
    const meRes = await tracker.fetch(buildMeUrl(loaded.token, version));
    if (meRes.ok) {
      const profile = (await meRes.json()) as RawUserProfile;
      followersCount = profile.followers_count ?? 0;
      if (profile.username) {
        await ctx.runMutation(internal.instagramStore.saveAccountHandle, {
          connectionId: loaded.conn._id,
          handle: profile.username,
        });
      }
    } else {
      accountOk = false;
    }

    let insights = { reach: 0, profileViews: 0, accountsEngaged: 0 };
    const insightsRes = await tracker.fetch(
      buildMeInsightsUrl(loaded.token, version),
    );
    if (insightsRes.ok) {
      const json = (await insightsRes.json()) as RawInsightsResponse;
      insights = extractAccountInsights(json.data);
    }

    if (accountOk) {
      await ctx.runMutation(internal.instagramStore.upsertAccountDaily, {
        workspaceId,
        row: {
          date: new Date(Date.now()).toISOString().slice(0, 10),
          followersCount,
          reach: insights.reach,
          profileViews: insights.profileViews,
          accountsEngaged: insights.accountsEngaged,
        },
      });
    }
  } catch (err) {
    accountOk = false;
    console.warn("Instagram: snimak naloga —", sanitizeSyncError(err));
  }

  await ctx.runMutation(internal.metaSyncStore.recordJob, {
    workspaceId,
    provider: "meta_ig",
    job: "account",
    ok: accountOk,
    // The snapshot writes exactly one row, and saying so is what lets the
    // header tell "the numbers moved" apart from "the call went through" (P2).
    itemsWritten: accountOk ? 1 : 0,
  });

  // 2. The recent posts. Anything older than two weeks moves by single digits a
  // day and is left to the six-hourly pass.
  let written = 0;
  let hotOk = true;
  try {
    const ourUsername = await resolveIgHandle(ctx, loaded, tracker);
    const mediaIds: string[] = await ctx.runQuery(
      internal.instagramStore.listRecentMediaIds,
      {
        workspaceId,
        since: Date.now() - HOT_WINDOW_MS,
        limit: HOT_MEDIA_LIMIT,
      },
    );

    for (const mediaId of mediaIds) {
      if (tracker.throttled) break; // P2: a refusal ends the pass, not one call
      written += await refreshIgMedia(
        ctx,
        { workspaceId, token: loaded.token, mediaId, ourUsername },
        tracker,
      );
    }
  } catch (err) {
    hotOk = false;
    console.warn("Instagram: uvidi skorašnjih objava —", sanitizeSyncError(err));
  }

  await finishPass(ctx, tracker, {
    workspaceId,
    provider: "meta_ig",
    job: "hot",
    ok: hotOk,
    itemsWritten: written,
  });
}

async function hourlyFacebook(
  ctx: ActionCtx,
  loaded: LoadedConnection,
): Promise<void> {
  const workspaceId = loaded.conn.workspaceId;
  const pageId = loaded.conn.externalId;
  if (!pageId) return;

  const version = getMetaGraphVersion();
  const tracker = createUsageTracker();

  // 1. Daily Page insights over a short window.
  let pageOk = true;
  let pageWritten = 0;
  try {
    const now = Date.now();
    const since = Math.floor(
      (now - FB_HOURLY_INSIGHTS_DAYS * 24 * 60 * 60 * 1000) / 1000,
    );
    const until = Math.floor(now / 1000);

    let res = await tracker.fetch(
      buildPageInsightsUrl({
        pageId,
        accessToken: loaded.token,
        since,
        until,
        version,
      }),
    );
    if (!res.ok) {
      // Meta refuses the WHOLE request over one retired metric name, so the
      // fallback asks for the two that have never gone away.
      res = await tracker.fetch(
        buildPageInsightsUrl({
          pageId,
          accessToken: loaded.token,
          since,
          until,
          metrics: PAGE_INSIGHT_METRICS_CORE,
          version,
        }),
      );
    }

    if (res.ok) {
      const rows = extractPageInsights(
        (await res.json()) as RawFbInsightsResponse,
      );
      if (rows.length > 0) {
        pageWritten += await ctx.runMutation(
          internal.facebookStore.upsertPageDaily,
          { workspaceId, rows },
        );
      }
    } else {
      pageOk = false;
    }
  } catch (err) {
    pageOk = false;
    console.warn("Facebook: uvidi stranice —", sanitizeSyncError(err));
  }

  await ctx.runMutation(internal.metaSyncStore.recordJob, {
    workspaceId,
    provider: "meta_fb",
    job: "account",
    ok: pageOk,
    // See the Instagram twin: the header needs to know a row was written, not
    // only that the call came back (P2).
    itemsWritten: pageWritten,
  });

  // 2. The recent posts.
  let written = 0;
  let hotOk = true;
  try {
    const postIds: string[] = await ctx.runQuery(
      internal.facebookStore.listRecentPostIds,
      {
        workspaceId,
        since: Date.now() - HOT_WINDOW_MS,
        limit: HOT_MEDIA_LIMIT,
      },
    );

    for (const postId of postIds) {
      if (tracker.throttled) break; // P2: a refusal ends the pass, not one call
      written += await refreshFbPost(
        ctx,
        { workspaceId, token: loaded.token, pageId, postId },
        tracker,
      );
    }
  } catch (err) {
    hotOk = false;
    console.warn("Facebook: uvidi skorašnjih objava —", sanitizeSyncError(err));
  }

  await finishPass(ctx, tracker, {
    workspaceId,
    provider: "meta_fb",
    job: "hot",
    ok: hotOk,
    itemsWritten: written,
  });
}

/** The hourly pass covers two rows in the Settings table, so a skip explains both. */
async function recordHourlySkip(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  provider: MetaProvider,
  state: string,
): Promise<void> {
  for (const job of ["account", "hot"]) {
    await ctx.runMutation(internal.metaSyncStore.recordJob, {
      workspaceId,
      provider,
      job,
      ok: false,
      skipReason: gateReason(state, provider),
    });
  }
}

/**
 * Hourly depth for both networks. One cron rather than two because the work is
 * the same shape and the gate is the same gate — the app's allowance is shared,
 * so deciding twice would mean deciding on stale information the second time.
 */
export const hourlyRefresh = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One run at a time (P2). A pass that outlives its own cadence would
    // otherwise be running as two copies, both spending the same allowance
    // on the same posts.
    await withCronLock(ctx, CRON_LOCKS.metaHourly, async () => {
      const igIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );
      for (const connectionId of igIds) {
        const loaded = await loadConnection(ctx, connectionId, "meta_ig");
        if (loaded === null) continue;

        const gate = await readGate(ctx, loaded.conn.workspaceId);
        if (!allowsBackground(gate)) {
          await recordHourlySkip(ctx, loaded.conn.workspaceId, "meta_ig", gate.state);
          continue;
        }
        await hourlyInstagram(ctx, loaded);
      }

      const fbIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_fb" },
      );
      for (const connectionId of fbIds) {
        const loaded = await loadConnection(ctx, connectionId, "meta_fb");
        if (loaded === null) continue;

        const gate = await readGate(ctx, loaded.conn.workspaceId);
        if (!allowsBackground(gate)) {
          await recordHourlySkip(ctx, loaded.conn.workspaceId, "meta_fb", gate.state);
          continue;
        }
        await hourlyFacebook(ctx, loaded);
      }
    });
    return null;
  },
});

// ── Level 3 — the daily deletion sweep ──────────────────────────────────────

/**
 * Can this token still read a post we know for a fact exists?
 *
 * The control question behind every ambiguous verdict. Meta answers "Object
 * with ID … does not exist, cannot be loaded due to missing permissions" for a
 * deleted object and for a live one the token may no longer see, so a single
 * refusal cannot tell the two apart — but a second call can. `controlIds` are
 * ids the feed listing returned seconds ago: if one of them reads back, the
 * connection is healthy and a refusal elsewhere is about the object. If none
 * of them read, everything is failing and nothing may be called deleted.
 *
 * At most two calls per pass, and only when an ambiguous answer turns up.
 */
async function connectionStillReads(
  tracker: UsageTracker,
  controlIds: string[],
  token: string,
  version: string,
): Promise<boolean> {
  for (const controlId of controlIds.slice(0, 2)) {
    if (tracker.throttled) return false;
    try {
      const res = await tracker.fetch(
        buildMediaFieldsUrl(controlId, "id", token, version),
      );
      if (res.ok) return true;
      // Drain the body so the connection is not left hanging.
      await res.text().catch(() => "");
    } catch {
      // Network failure is not an answer either; try the second id.
    }
  }
  return false;
}

/**
 * Which of the posts we hold has Instagram stopped having?
 *
 * A deletion is never announced. Absence from a listing proves nothing either —
 * the post may simply have fallen past the end of the page — so every suspect
 * gets one targeted `?fields=id` read and only a real "object does not exist"
 * writes `deletedAt`. The row is never removed: the post did exist and did have
 * reach, and that stays a true statement about the past.
 *
 * Its own daily pass since F6. It used to ride along the six-hourly sync, which
 * meant spending up to twenty-five probes four times a day on a question whose
 * answer changes about once a month.
 */
export const igDeletionCheck = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    // One run at a time (P2). A pass that outlives its own cadence would
    // otherwise be running as two copies, both spending the same allowance
    // on the same posts.
    await withCronLock(ctx, CRON_LOCKS.igDeletion, async () => {
      const connectionIds: Id<"connections">[] = await ctx.runQuery(
        internal.connections.listByProvider,
        { provider: "meta_ig" },
      );

      for (const connectionId of connectionIds) {
        const loaded = await loadConnection(ctx, connectionId, "meta_ig");
        if (loaded === null) continue;

        const workspaceId = loaded.conn.workspaceId;
        const gate = await readGate(ctx, workspaceId);
        if (!allowsBackground(gate)) {
          await ctx.runMutation(internal.metaSyncStore.recordJob, {
            workspaceId,
            provider: "meta_ig",
            job: "deletion",
            ok: false,
            skipReason: gateReason(gate.state, "meta_ig"),
          });
          continue;
        }

        const version = getMetaGraphVersion();
        const tracker = createUsageTracker();
        const now = Date.now();
        let marked = 0;
        let ok = true;
        /** Set when the pass refused to write a verdict it could not trust. */
        let standDown: string | undefined;

        try {
          const res = await tracker.fetch(
            buildMeMediaIdsUrl(loaded.token, DELETION_LIST_LIMIT, version),
          );
          if (!res.ok) {
            ok = false;
          } else {
            const json = (await res.json()) as RawMediaListResponse;
            const listed = json.data ?? [];
            const seenIds = new Set(
              listed.map((item) => String(item?.id ?? "")).filter(Boolean),
            );

            if (seenIds.size > 0) {
              // Every stored post Instagram did not just list is a suspect —
              // not only the ones inside the listing's date window (V1).
              //
              // The window used to be `publishedAt >= oldestSeen`, and it had a
              // blind spot with a guarantee attached: when the post that was
              // deleted happened to be the OLDEST the account had, every post
              // still listed is newer than it, so it could never enter its own
              // window. It was the one post the sweep was structurally unable
              // to find.
              //
              // Dropping the window means more suspects than one pass can
              // afford to probe, so they are worked through in rounds: the
              // query hands back the least recently checked first, and every
              // post the pass looks at is stamped. Nothing is excluded, some
              // things simply wait their turn.
              const candidates: {
                _id: Id<"igMediaStats">;
                mediaId: string;
              }[] = await ctx.runQuery(
                internal.instagramStore.listDeletionCandidates,
                {
                  workspaceId,
                  seenIds: [...seenIds],
                  limit: DELETION_CHECK_LIMIT,
                },
              );

              const checked: Id<"igMediaStats">[] = [];
              // Asked for at most once per pass, and only if an ambiguous
              // answer actually turns up. See `connectionStillReads`.
              let health: boolean | undefined;

              for (const candidate of candidates) {
                // Twenty-five probes into a refusal is twenty-five calls that
                // cannot land and a longer block for the trouble (P2).
                if (tracker.throttled) break;
                const probe = await tracker.fetch(
                  buildMediaFieldsUrl(
                    candidate.mediaId,
                    "id",
                    loaded.token,
                    version,
                  ),
                );
                checked.push(candidate._id);
                if (probe.ok) continue;

                const body = await probe.text().catch(() => "");
                const verdict = classifyMissingObject(probe.status, body);
                if (verdict === "other") continue;

                if (verdict === "ambiguous") {
                  // Code 100 / subcode 33 means "deleted" and "your token may
                  // no longer read this" in the same breath, so one refusal is
                  // not evidence. Ask something we KNOW exists: if that reads,
                  // the connection is healthy and the suspect really is gone.
                  // If it does not, the token is the problem and this pass may
                  // not mark anything at all.
                  if (health === undefined) {
                    health = await connectionStillReads(
                      tracker,
                      [...seenIds],
                      loaded.token,
                      version,
                    );
                    if (!health) {
                      standDown =
                        "Instagram ne čita ni objave koje sigurno postoje; ništa nije označeno kao obrisano.";
                      console.warn("Instagram: provera obrisanih —", standDown);
                    }
                  }
                  if (!health) {
                    // This suspect never got an answer, so it must not count as
                    // checked — it would go to the back of the rotation on the
                    // strength of a question the token could not ask.
                    checked.pop();
                    ok = false;
                    break;
                  }
                }

                await ctx.runMutation(internal.instagramStore.markMediaDeleted, {
                  id: candidate._id,
                });
                marked++;
              }

              // Both the probed suspects and the posts the listing vouched for:
              // rotation only works if everything the pass looked at moves to
              // the back of the queue.
              if (checked.length > 0 || seenIds.size > 0) {
                await ctx.runMutation(
                  internal.instagramStore.stampDeletionChecked,
                  {
                    workspaceId,
                    ids: checked,
                    mediaIds: [...seenIds],
                    at: now,
                  },
                );
              }
            }
          }
        } catch (err) {
          ok = false;
          console.warn("Instagram: provera obrisanih —", sanitizeSyncError(err));
        }

        await finishPass(ctx, tracker, {
          workspaceId,
          provider: "meta_ig",
          job: "deletion",
          ok,
          itemsWritten: marked,
          ...(standDown !== undefined ? { skipReason: standDown } : {}),
        });
      }
    });
    return null;
  },
});
