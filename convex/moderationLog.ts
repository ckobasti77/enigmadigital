import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * MODERATION AUDIT LOG — READ SIDE (V3)
 * ============================================================================
 *
 * `igModerationLogs` and `fbModerationLogs` have been written since F4 and F5
 * and read by nothing at all: two tables growing without a reader, which is the
 * same as two tables of data nobody can be held to. Either they get a screen or
 * they get deleted, and the argument for the screen is the one the schema
 * already makes — moderation is the single place in this app where a PERSON,
 * not a cron, makes something disappear from a public account. "Who did this
 * and when" has to be answerable, and after a delete these rows hold the only
 * surviving copy of what was removed.
 *
 * The two tables are read as ONE log because that is the question being asked.
 * An operator wants to know what was done to comments, not what was done to
 * Instagram comments; the platform is a column, not a screen. They stay two
 * tables for the reason F5 gives: a Page comment and an Instagram comment share
 * almost no fields, and Facebook has two actions Instagram cannot offer.
 * ============================================================================
 */

/** How many rows one read returns, and the ceiling the screen may ask for. */
const LOG_LIMIT_DEFAULT = 100;
const LOG_LIMIT_MAX = 200;

const moderationActionValidator = v.union(
  v.literal("reply"),
  v.literal("hide"),
  v.literal("unhide"),
  v.literal("delete"),
  v.literal("comments_on"),
  v.literal("comments_off"),
  v.literal("like"),
  v.literal("unlike"),
);

const moderationLogViewValidator = v.object({
  /** Two tables, two id spaces — flattened to a string for the React key. */
  id: v.string(),
  platform: v.union(v.literal("instagram"), v.literal("facebook")),
  action: moderationActionValidator,
  /** Absent on the two post-level actions, which touch no single comment. */
  commentId: v.union(v.string(), v.null()),
  /** Instagram media id or Facebook post id — whatever this was done under. */
  objectId: v.union(v.string(), v.null()),
  /**
   * The reply that was sent, or the text of the comment that was hidden or
   * deleted. After a delete this is the only place the words still exist.
   */
  text: v.union(v.string(), v.null()),
  author: v.union(v.string(), v.null()),
  /** Who pressed the button. Null only if the account has since been removed. */
  userEmail: v.union(v.string(), v.null()),
  status: v.union(v.literal("done"), v.literal("failed")),
  errorMessage: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

type ModerationLogView = {
  id: string;
  platform: "instagram" | "facebook";
  action:
    | "reply"
    | "hide"
    | "unhide"
    | "delete"
    | "comments_on"
    | "comments_off"
    | "like"
    | "unlike";
  commentId: string | null;
  objectId: string | null;
  text: string | null;
  author: string | null;
  userEmail: string | null;
  status: "done" | "failed";
  errorMessage: string | null;
  createdAt: number;
};

function fromInstagram(row: Doc<"igModerationLogs">): ModerationLogView {
  return {
    id: row._id,
    platform: "instagram",
    action: row.action,
    commentId: row.commentId ?? null,
    objectId: row.mediaId ?? null,
    text: row.text ?? null,
    author: row.username ?? null,
    userEmail: null,
    status: row.status,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt,
  };
}

function fromFacebook(row: Doc<"fbModerationLogs">): ModerationLogView {
  return {
    id: row._id,
    platform: "facebook",
    action: row.action,
    commentId: row.commentId ?? null,
    objectId: row.postId ?? null,
    text: row.text ?? null,
    author: row.authorName ?? null,
    userEmail: null,
    status: row.status,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt,
  };
}

/**
 * Both moderation logs, newest first.
 *
 * Each table is read to `limit` and the two are merged, so the answer is the
 * newest `limit` rows overall however lopsided the split is — an account that
 * only moderates Instagram gets a full Instagram page rather than half a
 * screen. Filtering by platform or status happens on the returned window, and
 * the screen says so: this is "the last N actions", not a searchable archive.
 */
export const listModerationLogs = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(moderationLogViewValidator),
  handler: async (ctx, args): Promise<ModerationLogView[]> => {
    const { workspaceId } = await requireMembership(ctx);
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? LOG_LIMIT_DEFAULT), 1),
      LOG_LIMIT_MAX,
    );

    const [igRows, fbRows] = await Promise.all([
      ctx.db
        .query("igModerationLogs")
        .withIndex("by_workspace_created", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(limit),
      ctx.db
        .query("fbModerationLogs")
        .withIndex("by_workspace_created", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(limit),
    ]);

    const merged = [...igRows.map(fromInstagram), ...fbRows.map(fromFacebook)]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    // One lookup per member, not one per row: a bulk delete of fifty comments
    // is fifty rows and one person.
    const emails = new Map<Id<"users">, string | null>();
    for (const row of [...igRows, ...fbRows]) {
      if (emails.has(row.userId)) continue;
      const user = await ctx.db.get(row.userId);
      emails.set(row.userId, user?.email ?? null);
    }

    const byId = new Map<string, Id<"users">>();
    for (const row of [...igRows, ...fbRows]) byId.set(row._id, row.userId);

    return merged.map((row) => {
      const userId = byId.get(row.id);
      return {
        ...row,
        userEmail: userId === undefined ? null : (emails.get(userId) ?? null),
      };
    });
  },
});
