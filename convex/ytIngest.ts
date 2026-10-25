import { internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { matchKeywords, utcDateKey } from "./lib/orMatch";
import { QUOTA_COST } from "./lib/ytQuota";
import { pacifickiDan } from "./lib/globalneKvote";
import { rezervisiYoutube } from "./globalneKvoteStore";

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
 * Units the project has spent today.
 *
 * The day is the Pacific day (lib/globalneKvote.ts, E18), the same day Google
 * resets the quota on, so "resumes at 09:00" is true. The counter is this
 * project's share; the shared counter of all projects lives in
 * `globalneKvote` and is written in the same transaction by
 * `globalneKvoteStore.rezervisiYoutube`.
 */
export async function readUnitsUsed(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<number> {
  const row = await ctx.db
    .query("ytQuotaUsage")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).eq("date", pacifickiDan(Date.now())),
    )
    .first();
  return row?.unitsUsed ?? 0;
}

// ── uploads: a second counter on the same row (Y10) ──────────────────────────

/**
 * Videos sent today.
 *
 * Kept apart from `unitsUsed` because Google meters `videos.insert` separately:
 * an upload does not cost a single unit of the 10 000/day budget, so counting
 * it there would make the comment engine stop for a reason that never touched
 * its allowance. The ceiling it works against is ours, not Google's
 * (lib/ytQuota.ts, VIDEO_UPLOAD_DAILY_LIMIT).
 *
 * Both counters live on one row so a day has one record; both are written by
 * `globalneKvoteStore.ts`, together with the shared counter of all projects.
 */
export async function readUploadsUsed(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<number> {
  const row = await ctx.db
    .query("ytQuotaUsage")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).eq("date", pacifickiDan(Date.now())),
    )
    .first();
  return row?.uploadsUsed ?? 0;
}

// ── automation cost & matching ───────────────────────────────────────────────

/**
 * What one match against this automation will cost in Data API units.
 *
 * A reply with no text written is not a reply, so it costs nothing and does
 * nothing — the same rule the send path applies.
 *
 * Deleting and moderating are exclusive, not additive: there is nothing to
 * moderate about a comment that is being removed, so `deleteEnabled` wins and
 * the moderation call is never made (Y7). ytReply.ts makes the same choice, and
 * the two must agree or the reserved cost stops matching the calls that go out.
 */
export function automationQuotaCost(a: Doc<"ytAutomations">): number {
  let cost = 0;
  if (a.replyEnabled && (a.replyMessage ?? "").trim().length > 0) {
    cost += QUOTA_COST.commentsInsert;
  }
  if (a.deleteEnabled === true) {
    cost += QUOTA_COST.commentsDelete;
  } else if (a.moderationEnabled && a.moderationStatus !== undefined) {
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

    // 6–7. Can we afford to act on it — and if so, reserve it now. The check
    // happens here rather than at send time because a burst of matching
    // comments would otherwise each pass an affordability test that none of
    // them had yet paid for. The reservation books this project's share and
    // the shared counter of all projects in this same transaction, so two
    // projects cannot both pass the last free units. The send path spends
    // exactly what was reserved on its first attempt and reserves any retry
    // separately.
    const rezervacija = await rezervisiYoutube(
      ctx,
      args.workspaceId,
      "odgovori",
      matchedCost,
    );
    if (!rezervacija.ok) {
      await ctx.db.insert("ytCommentLogs", {
        ...logRow,
        automationId: matchedAutomation._id,
        matchedKeyword,
        status: "skipped_quota",
        errorMessage: rezervacija.poruka,
      });
      return "skipped_quota";
    }

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
