import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { matchKeywords, utcDateKey } from "./lib/orMatch";
import {
  QUOTA_COST,
  QUOTA_EXHAUSTED_MESSAGE,
  canAfford,
} from "./lib/ytQuota";

/**
 * YouTube comment ingest (Y4) — the cousin of orIngest.ts, with two
 * differences that come from the platform rather than from us:
 *
 *   1. YouTube has no direct messages. A match ends in a PUBLIC reply on the
 *      comment, in moderating it, or both. There is no private path.
 *   2. There is no webhook for comments, so nothing pushes them at us: the
 *      poller (ytPoll.ts) re-reads the same page every few minutes and hands
 *      each comment here. `ytProcessedComments` is what keeps that from
 *      answering the same person over and over.
 *
 * And one that comes from the meter: every reply costs 50 quota units out of
 * a daily budget shared with the analytics sync, so a match that we cannot
 * afford is refused here — logged, never silently dropped (lib/ytQuota.ts).
 */

const ingestResultValidator = v.union(
  v.literal("ignored_engine_off"),
  v.literal("duplicate"),
  v.literal("no_match"),
  v.literal("queued"),
  v.literal("skipped_quota"),
);

// ── quota bookkeeping ────────────────────────────────────────────────────────

/**
 * Units spent today.
 *
 * The day is keyed in UTC like every other daily table here, while YouTube's
 * own quota resets at midnight Pacific. The two boundaries are ~8h apart, so
 * a counter that resets at 16:00 PT can hand out a fresh budget in the middle
 * of YouTube's day. The reply path treats a real `quotaExceeded` from YouTube
 * as authoritative and closes the engine for the rest of our day, which is the
 * backstop for that gap.
 */
export async function readUnitsUsed(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<number> {
  const row = await ctx.db
    .query("ytQuotaUsage")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).eq("date", utcDateKey(Date.now())),
    )
    .first();
  return row?.unitsUsed ?? 0;
}

/** Add to today's counter, creating the row on first spend. */
async function addUnitsUsed(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  units: number,
): Promise<void> {
  if (units <= 0) return;
  const now = Date.now();
  const date = utcDateKey(now);
  const row = await ctx.db
    .query("ytQuotaUsage")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).eq("date", date),
    )
    .first();

  if (row === null) {
    await ctx.db.insert("ytQuotaUsage", {
      workspaceId,
      date,
      unitsUsed: units,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(row._id, {
    unitsUsed: row.unitsUsed + units,
    updatedAt: now,
  });
}

/** Book quota an action has just spent (poller pages, reply retries). */
export const recordQuotaUsage = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    units: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, units }) => {
    await addUnitsUsed(ctx, workspaceId, units);
    return null;
  },
});

/** Units the workspace has spent today; 0 when nothing has been spent yet. */
export const loadQuotaUsage = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.number(),
  handler: async (ctx, { workspaceId }) => readUnitsUsed(ctx, workspaceId),
});

// ── automation cost & matching ───────────────────────────────────────────────

/**
 * What one match against this automation will cost in Data API units.
 *
 * A reply with no text written is not a reply, so it costs nothing and does
 * nothing — the same rule the send path applies.
 */
export function automationQuotaCost(a: Doc<"ytAutomations">): number {
  let cost = 0;
  if (a.replyEnabled && (a.replyMessage ?? "").trim().length > 0) {
    cost += QUOTA_COST.commentsInsert;
  }
  if (a.moderationEnabled && a.moderationStatus !== undefined) {
    cost += QUOTA_COST.commentsSetModerationStatus;
  }
  return cost;
}

// ── ingest ───────────────────────────────────────────────────────────────────

export const ingestComment = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    commentId: v.string(),
    videoId: v.string(),
    videoTitle: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorChannelId: v.optional(v.string()),
    text: v.string(),
  },
  returns: ingestResultValidator,
  handler: async (ctx, args) => {
    // 0. The engine switch. The poller only runs for an active connection, but
    // this is the other entry point and a paused integration must stay paused.
    // Checked before the dedup write, so switching the engine back on does not
    // find every comment already marked as processed.
    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("provider", "youtube"),
      )
      .first();
    if (conn === null || conn.status !== "active") {
      return "ignored_engine_off";
    }

    // 1. Dedup — the poller re-reads the same comments every run.
    const existing = await ctx.db
      .query("ytProcessedComments")
      .withIndex("by_workspace_comment", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("commentId", args.commentId),
      )
      .first();
    if (existing !== null) {
      return "duplicate";
    }

    // 2. Mark it seen immediately, whatever happens below.
    const now = Date.now();
    await ctx.db.insert("ytProcessedComments", {
      workspaceId: args.workspaceId,
      commentId: args.commentId,
      processedAt: now,
    });

    // 3. Active automations for this workspace.
    const automations = await ctx.db
      .query("ytAutomations")
      .withIndex("by_workspace_active", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("isActive", true),
      )
      .collect();

    // 4. First automation matching BOTH video scope and keywords wins.
    let matchedAutomation: Doc<"ytAutomations"> | null = null;
    let matchedKeyword: string | null = null;
    let matchedCost = 0;

    for (const a of automations) {
      // An automation with nothing switched on cannot match: there is no
      // action behind it, so letting it win would only shadow the next one.
      const cost = automationQuotaCost(a);
      if (cost === 0) continue;

      const videoMatches =
        a.matchAnyVideo === true ||
        (a.videoId !== undefined &&
          a.videoId.length > 0 &&
          a.videoId === args.videoId);
      if (!videoMatches) continue;

      const kw = matchKeywords(args.text, a.keywords, {
        matchAnyWord: a.matchAnyWord,
        wholeWordMatch: a.wholeWordMatch,
      });

      if (kw !== null) {
        matchedAutomation = a;
        matchedKeyword = kw;
        matchedCost = cost;
        break;
      }
    }

    // The title is not on the comment payload; Y2 already stores it per video.
    const videoTitle =
      args.videoTitle ??
      (args.videoId.length > 0
        ? (
            await ctx.db
              .query("ytVideoStats")
              .withIndex("by_workspace_video", (q) =>
                q
                  .eq("workspaceId", args.workspaceId)
                  .eq("videoId", args.videoId),
              )
              .first()
          )?.title
        : undefined);

    const logRow = {
      workspaceId: args.workspaceId,
      commentId: args.commentId,
      videoId: args.videoId,
      videoTitle,
      authorName: args.authorName,
      authorChannelId: args.authorChannelId,
      commentText: args.text,
      attempts: 0,
      date: utcDateKey(now),
      createdAt: now,
    };

    // 5. Nothing matched — logged anyway, so the screen shows what came in.
    if (matchedAutomation === null || matchedKeyword === null) {
      await ctx.db.insert("ytCommentLogs", {
        ...logRow,
        status: "skipped_no_match",
      });
      return "no_match";
    }

    // 6. Can we afford to act on it? The check happens here rather than at
    // send time because a burst of matching comments would otherwise each pass
    // an affordability test that none of them had yet paid for.
    const unitsUsed = await readUnitsUsed(ctx, args.workspaceId);
    if (!canAfford(unitsUsed, matchedCost)) {
      await ctx.db.insert("ytCommentLogs", {
        ...logRow,
        automationId: matchedAutomation._id,
        matchedKeyword,
        status: "skipped_quota",
        errorMessage: QUOTA_EXHAUSTED_MESSAGE,
      });
      return "skipped_quota";
    }

    // 7. Reserve the cost now. The send path spends exactly what was reserved
    // on its first attempt and books any retry separately.
    await addUnitsUsed(ctx, args.workspaceId, matchedCost);

    const commentLogId = await ctx.db.insert("ytCommentLogs", {
      ...logRow,
      automationId: matchedAutomation._id,
      matchedKeyword,
      status: "pending",
    });

    await ctx.scheduler.runAfter(0, internal.ytReply.replyToComment, {
      commentLogId,
    });

    return "queued";
  },
});
