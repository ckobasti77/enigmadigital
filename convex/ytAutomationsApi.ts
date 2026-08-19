import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { normalizeKeyword } from "./lib/orMatch";
import { readUnitsUsed } from "./ytIngest";
import {
  QUOTA_SOFT_LIMIT,
  estimatedRepliesLeft,
  remainingUnits,
} from "./lib/ytQuota";

/**
 * Public API for the YouTube automations screen (PLAN.md §9 / Y5).
 *
 * Default V8 runtime — no "use node". Every function is workspace-scoped via
 * `requireMembership`; nothing here trusts an id from the client without first
 * checking that the row belongs to the caller's workspace.
 *
 * Modelled on orAutomationsApi.ts, but YouTube is a different platform and the
 * API says so: there is no DM, no button template, no quick reply and no
 * follow gate. What a match can do is post a PUBLIC reply, moderate the
 * comment, or both — and each of those costs 50 quota units, which is why the
 * screen also reads today's budget (`quotaStatus`).
 */

// ── Limits ───────────────────────────────────────────────────────────────────
const NAME_MAX = 80;
const KEYWORDS_MAX = 20;
const KEYWORD_MAX = 60;
/** YouTube rejects a longer comment outright, so the editor never sends one. */
const REPLY_MESSAGE_MAX = 1000;
/** Every YouTube video id is exactly 11 characters. */
const VIDEO_ID_LENGTH = 11;

const LOG_LIMIT_DEFAULT = 100;
const LOG_LIMIT_MAX = 200;

/** The window the automation cards summarise. */
const REPLIES_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const moderationStatusValidator = v.union(
  v.literal("heldForReview"),
  v.literal("rejected"),
  v.literal("published"),
);

const commentLogStatusValidator = v.union(
  v.literal("pending"),
  v.literal("replied"),
  v.literal("moderated"),
  v.literal("failed"),
  v.literal("skipped_no_match"),
  v.literal("skipped_quota"),
  v.literal("deleted"),
);

/** Everything the editor dialog sends, for both create and update. */
const automationInputValidator = v.object({
  name: v.string(),
  keywords: v.array(v.string()),
  matchAnyWord: v.boolean(),
  wholeWordMatch: v.boolean(),
  matchAnyVideo: v.boolean(),
  videoId: v.optional(v.string()),
  replyEnabled: v.boolean(),
  replyMessage: v.optional(v.string()),
  moderationEnabled: v.boolean(),
  moderationStatus: v.optional(moderationStatusValidator),
  markAsSpam: v.optional(v.boolean()),
  deleteEnabled: v.optional(v.boolean()),
  isActive: v.boolean(),
});

type ModerationStatus = "heldForReview" | "rejected" | "published";

type AutomationInput = {
  name: string;
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch: boolean;
  matchAnyVideo: boolean;
  videoId?: string;
  replyEnabled: boolean;
  replyMessage?: string;
  moderationEnabled: boolean;
  moderationStatus?: ModerationStatus;
  markAsSpam?: boolean;
  deleteEnabled?: boolean;
  isActive: boolean;
};

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

function notFound(): never {
  throw new ConvexError({
    code: "not_found",
    message: "Automatizacija nije pronađena.",
  });
}

/**
 * Trim, validate and normalize the editor payload into exactly the shape the
 * `ytAutomations` row stores. Keywords come out folded and deduplicated
 * (`normalizeKeyword`), which is what the matcher expects.
 */
function normalizeAutomationInput(input: AutomationInput): AutomationInput {
  const name = input.name.trim();
  if (name.length === 0) {
    invalid("Unesi naziv automatizacije.");
  }
  if (name.length > NAME_MAX) {
    invalid(`Naziv može imati najviše ${NAME_MAX} karaktera.`);
  }

  const keywords: string[] = [];
  for (const raw of input.keywords) {
    const keyword = normalizeKeyword(raw);
    if (keyword.length === 0) continue;
    if (keyword.length > KEYWORD_MAX) {
      invalid(`Ključna reč može imati najviše ${KEYWORD_MAX} karaktera.`);
    }
    if (!keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  if (keywords.length === 0) {
    invalid("Dodaj bar jednu ključnu reč.");
  }
  if (keywords.length > KEYWORDS_MAX) {
    invalid(`Automatizacija može imati najviše ${KEYWORDS_MAX} ključnih reči.`);
  }

  // Deleting the comment supersedes moderating it: there is nothing to hold
  // for review once it is gone. The flag is normalised away here so the stored
  // row cannot claim both, and ytReply.ts / automationQuotaCost never have to
  // guess which one an operator meant.
  const deleteEnabled = input.deleteEnabled ?? false;
  const moderationEnabled = deleteEnabled ? false : input.moderationEnabled;

  // An automation with no action switched on cannot do anything on a match —
  // the ingest path skips it outright — so it is refused here rather than
  // saved as a rule that silently never fires.
  if (!input.replyEnabled && !moderationEnabled && !deleteEnabled) {
    invalid("Uključi bar odgovor, moderaciju ili brisanje komentara.");
  }

  const replyMessage = input.replyMessage?.trim();
  if (input.replyEnabled) {
    if (!replyMessage) {
      invalid("Unesi tekst javnog odgovora ili isključi odgovor.");
    }
    if (replyMessage.length > REPLY_MESSAGE_MAX) {
      invalid(
        `Odgovor može imati najviše ${REPLY_MESSAGE_MAX} karaktera — YouTube odbija duže komentare.`,
      );
    }
  }

  const moderationStatus = moderationEnabled
    ? input.moderationStatus
    : undefined;
  if (moderationEnabled && moderationStatus === undefined) {
    invalid("Izaberi šta se radi sa komentarom.");
  }

  const videoId = input.videoId?.trim();
  if (!input.matchAnyVideo) {
    if (!videoId) {
      invalid("Unesi ID videa ili uključi opciju „Svi videi”.");
    }
    if (videoId.length !== VIDEO_ID_LENGTH) {
      invalid(`ID videa mora imati ${VIDEO_ID_LENGTH} znakova.`);
    }
  }

  return {
    name,
    keywords,
    matchAnyWord: input.matchAnyWord,
    wholeWordMatch: input.wholeWordMatch,
    matchAnyVideo: input.matchAnyVideo,
    videoId: input.matchAnyVideo ? undefined : videoId,
    replyEnabled: input.replyEnabled,
    replyMessage: input.replyEnabled ? replyMessage : undefined,
    moderationEnabled,
    moderationStatus,
    deleteEnabled,
    // YouTube only accepts `banAuthor` together with `rejected`; anywhere else
    // the flag would make setModerationStatus fail.
    markAsSpam:
      moderationStatus === "rejected" ? (input.markAsSpam ?? false) : undefined,
    isActive: input.isActive,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

const automationViewValidator = v.object({
  _id: v.id("ytAutomations"),
  name: v.string(),
  keywords: v.array(v.string()),
  matchAnyWord: v.boolean(),
  wholeWordMatch: v.boolean(),
  matchAnyVideo: v.boolean(),
  videoId: v.union(v.string(), v.null()),
  replyEnabled: v.boolean(),
  replyMessage: v.union(v.string(), v.null()),
  moderationEnabled: v.boolean(),
  moderationStatus: v.union(moderationStatusValidator, v.null()),
  markAsSpam: v.boolean(),
  deleteEnabled: v.boolean(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** Comments this automation actually acted on in the last 7 days. */
  repliesLast7Days: v.number(),
});

/**
 * All automations for the caller's workspace, newest first, each with the
 * number of comments it acted on over the last seven days.
 *
 * The count is read straight off `ytCommentLogs` rather than a rolled-up
 * table: a week of comment logs is a small set, and there is no equivalent of
 * `orCampaignStats` here that a write would have to keep in sync.
 */
export const listAutomations = query({
  args: {},
  returns: v.array(automationViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const automations = await ctx.db
      .query("ytAutomations")
      .withIndex("by_workspace_active", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const since = Date.now() - REPLIES_WINDOW_MS;
    const recentLogs = await ctx.db
      .query("ytCommentLogs")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId).gte("createdAt", since),
      )
      .collect();

    // "Acted on" is the pair of statuses that cost quota and changed something
    // on YouTube; a skipped or failed row is not an answer.
    const counts = new Map<Id<"ytAutomations">, number>();
    for (const log of recentLogs) {
      if (log.automationId === undefined) continue;
      if (log.status !== "replied" && log.status !== "moderated") continue;
      counts.set(log.automationId, (counts.get(log.automationId) ?? 0) + 1);
    }

    return automations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        keywords: a.keywords,
        matchAnyWord: a.matchAnyWord,
        wholeWordMatch: a.wholeWordMatch,
        matchAnyVideo: a.matchAnyVideo,
        videoId: a.videoId ?? null,
        replyEnabled: a.replyEnabled,
        replyMessage: a.replyMessage ?? null,
        moderationEnabled: a.moderationEnabled,
        moderationStatus: a.moderationStatus ?? null,
        markAsSpam: a.markAsSpam ?? false,
        deleteEnabled: a.deleteEnabled ?? false,
        isActive: a.isActive,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        repliesLast7Days: counts.get(a._id) ?? 0,
      }));
  },
});

const commentLogViewValidator = v.object({
  _id: v.id("ytCommentLogs"),
  automationId: v.union(v.id("ytAutomations"), v.null()),
  automationName: v.union(v.string(), v.null()),
  commentId: v.string(),
  videoId: v.string(),
  videoTitle: v.union(v.string(), v.null()),
  authorName: v.union(v.string(), v.null()),
  commentText: v.string(),
  matchedKeyword: v.union(v.string(), v.null()),
  status: commentLogStatusValidator,
  attempts: v.number(),
  repliedAt: v.union(v.number(), v.null()),
  /** Set once the comment itself was removed from YouTube (Y7). */
  deletedAt: v.union(v.number(), v.null()),
  errorMessage: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

/**
 * The comment log, newest first, optionally narrowed to one status. Both paths
 * go through an index, so neither scans the table.
 */
export const listCommentLogs = query({
  args: {
    status: v.optional(commentLogStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(commentLogViewValidator),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? LOG_LIMIT_DEFAULT), 1),
      LOG_LIMIT_MAX,
    );

    const status = args.status;
    const logs =
      status === undefined
        ? await ctx.db
            .query("ytCommentLogs")
            .withIndex("by_workspace_created", (q) =>
              q.eq("workspaceId", workspaceId),
            )
            .order("desc")
            .take(limit)
        : await ctx.db
            .query("ytCommentLogs")
            .withIndex("by_workspace_status", (q) =>
              q.eq("workspaceId", workspaceId).eq("status", status),
            )
            .order("desc")
            .take(limit);

    // Deleting an automation keeps its log rows (history is the point), so the
    // id can dangle — resolve names once and label the misses in the UI.
    const names = new Map<Id<"ytAutomations">, string>();
    for (const id of new Set(
      logs.flatMap((l) => (l.automationId ? [l.automationId] : [])),
    )) {
      const automation = await ctx.db.get(id);
      if (automation !== null && automation.workspaceId === workspaceId) {
        names.set(id, automation.name);
      }
    }

    return logs.map((l) => ({
      _id: l._id,
      automationId: l.automationId ?? null,
      automationName:
        l.automationId !== undefined
          ? (names.get(l.automationId) ?? null)
          : null,
      commentId: l.commentId,
      videoId: l.videoId,
      videoTitle: l.videoTitle ?? null,
      authorName: l.authorName ?? null,
      commentText: l.commentText,
      matchedKeyword: l.matchedKeyword ?? null,
      status: l.status,
      attempts: l.attempts,
      repliedAt: l.repliedAt ?? null,
      deletedAt: l.deletedAt ?? null,
      errorMessage: l.errorMessage ?? null,
      createdAt: l.createdAt,
    }));
  },
});

/**
 * Today's Data API budget, as the quota widget states it.
 *
 * `softLimit` is not YouTube's 10 000 but what the comment engine is allowed
 * to touch: the rest is reserved for the analytics sync (lib/ytQuota.ts).
 */
export const quotaStatus = query({
  args: {},
  returns: v.object({
    unitsUsed: v.number(),
    unitsRemaining: v.number(),
    repliesLeft: v.number(),
    softLimit: v.number(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const unitsUsed = await readUnitsUsed(ctx, workspaceId);
    return {
      unitsUsed,
      unitsRemaining: remainingUnits(unitsUsed),
      repliesLeft: estimatedRepliesLeft(unitsUsed),
      softLimit: QUOTA_SOFT_LIMIT,
    };
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

export const createAutomation = mutation({
  args: automationInputValidator.fields,
  returns: v.id("ytAutomations"),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const input = normalizeAutomationInput(args);
    const now = Date.now();

    return await ctx.db.insert("ytAutomations", {
      workspaceId,
      ...input,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAutomation = mutation({
  args: {
    automationId: v.id("ytAutomations"),
    ...automationInputValidator.fields,
  },
  returns: v.null(),
  handler: async (ctx, { automationId, ...rest }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(automationId);
    if (existing === null || existing.workspaceId !== workspaceId) {
      notFound();
    }

    const input = normalizeAutomationInput(rest);
    await ctx.db.patch(automationId, { ...input, updatedAt: Date.now() });
    return null;
  },
});

export const toggleAutomation = mutation({
  args: {
    automationId: v.id("ytAutomations"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { automationId, isActive }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(automationId);
    if (existing === null || existing.workspaceId !== workspaceId) {
      notFound();
    }

    await ctx.db.patch(automationId, { isActive, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Remove an automation. Its comment logs are deliberately kept — they are the
 * record of replies that are still sitting under the videos, and the log table
 * labels the dangling id rather than hiding the row.
 */
export const deleteAutomation = mutation({
  args: { automationId: v.id("ytAutomations") },
  returns: v.null(),
  handler: async (ctx, { automationId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(automationId);
    if (existing === null || existing.workspaceId !== workspaceId) {
      notFound();
    }

    await ctx.db.delete(automationId);
    return null;
  },
});
