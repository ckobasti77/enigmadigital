import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { extractYouTubeApiError } from "./lib/youtubeApi";
import { QUOTA_MEDIA_LIMIT, remainingMediaUnits } from "./lib/ytQuota";
import { readUnitsUsed } from "./ytIngest";

/**
 * Shared plumbing for every YouTube media operation (Y6) — the layer Y7-Y10
 * are built on. No screen imports this; the actions that do the work do.
 *
 * Three things live here:
 *
 *   1. `loadMediaContext` — one transaction that answers "may this caller act
 *      on which channel, with which credentials, and what is left of today's
 *      budget". Every media action starts with it.
 *   2. `startJob` / `finishJob` — the `ytMediaJobs` row. Media operations are
 *      rare, manual and often irreversible, so each one leaves a record of
 *      what was attempted and how it ended, including when it never started.
 *   3. `ytRequest` — an authorised call that reports failure instead of
 *      throwing, because what counts as an error differs per caller: a 404
 *      from captions.list means "no subtitles yet", the same 404 from
 *      videos.update means the video is gone.
 *
 * Default V8 runtime: `fetch` is all any of this needs.
 *
 * One public query lives here too — `mediaQuotaStatus`. It is the only thing a
 * screen reads from this file, and it belongs next to the ceiling it reports
 * on rather than in whichever feature happened to need it first.
 */

// ── what today's media budget looks like ─────────────────────────────────────

/**
 * The media ceiling, from the operator's side of the screen.
 *
 * Separate from `ytAutomationsApi.quotaStatus`, which reports the same counter
 * against the HIGHER comment-engine ceiling. Both are true; they answer
 * different questions. This one answers "can I still send this file today",
 * and a caption panel must never quote the engine's headroom — it would
 * promise 2 000 units that media is not allowed to spend.
 */
export const mediaQuotaStatus = query({
  args: {},
  returns: v.object({
    unitsUsed: v.number(),
    unitsRemaining: v.number(),
    mediaLimit: v.number(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const unitsUsed = await readUnitsUsed(ctx, workspaceId);
    return {
      unitsUsed,
      unitsRemaining: remainingMediaUnits(unitsUsed),
      mediaLimit: QUOTA_MEDIA_LIMIT,
    };
  },
});

// ── job rows ─────────────────────────────────────────────────────────────────

const mediaJobKindValidator = v.union(
  v.literal("upload"),
  v.literal("metadata"),
  v.literal("thumbnail"),
  v.literal("caption"),
  v.literal("playlist"),
  v.literal("comment_delete"),
);

export type MediaJobKind =
  | "upload"
  | "metadata"
  | "thumbnail"
  | "caption"
  | "playlist"
  | "comment_delete";

/** How a job may end. `pending` is the start state and never an outcome. */
const mediaJobOutcomeValidator = v.union(
  v.literal("done"),
  v.literal("failed"),
  v.literal("skipped_quota"),
);

export type MediaJobOutcome = "done" | "failed" | "skipped_quota";

/**
 * Open a job row before the first call goes out.
 *
 * Opened first, not last, on purpose: an action that dies mid-flight — a
 * timeout, a deploy — leaves a `pending` row that says something was started,
 * which is the truth. Writing the row only on success would lose exactly the
 * cases worth seeing.
 */
export const startJob = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    kind: mediaJobKindValidator,
    videoId: v.optional(v.string()),
    title: v.optional(v.string()),
  },
  returns: v.id("ytMediaJobs"),
  handler: async (ctx, args) => await openMediaJob(ctx, args),
});

/**
 * The same row, opened from a mutation that is already in a transaction.
 *
 * Y10's upload is driven from the browser rather than from one action, so the
 * mutations it calls need this directly; `ctx.runMutation` into the wrapper
 * above would be a subtransaction for a single insert.
 */
export async function openMediaJob(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    kind: MediaJobKind;
    videoId?: string;
    title?: string;
  },
): Promise<Id<"ytMediaJobs">> {
  return await ctx.db.insert("ytMediaJobs", {
    workspaceId: args.workspaceId,
    kind: args.kind,
    videoId: args.videoId,
    title: args.title,
    status: "pending",
    unitsSpent: 0,
    createdAt: Date.now(),
  });
}

/**
 * Close a job row with its outcome.
 *
 * `unitsSpent` is what this job actually cost — a failed call is still a
 * metered call, so a failure usually spends units too. Booking those units
 * against the daily counter is a separate step (`ytIngest.recordQuotaUsage`);
 * this row is the record, not the meter, and doing both here would double-count
 * every caller that already booked its own spend.
 */
export const finishJob = internalMutation({
  args: {
    jobId: v.id("ytMediaJobs"),
    status: mediaJobOutcomeValidator,
    unitsSpent: v.number(),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => await closeMediaJob(ctx, args),
});

/** `finishJob`'s body, for callers already inside a transaction (Y10). */
export async function closeMediaJob(
  ctx: MutationCtx,
  args: {
    jobId: Id<"ytMediaJobs">;
    status: MediaJobOutcome;
    unitsSpent: number;
    errorMessage?: string;
  },
): Promise<null> {
  const job = await ctx.db.get(args.jobId);
  if (job === null) return null;

  await ctx.db.patch(args.jobId, {
    status: args.status,
    unitsSpent: args.unitsSpent,
    ...(args.errorMessage !== undefined
      ? { errorMessage: args.errorMessage.slice(0, 300) }
      : {}),
    finishedAt: Date.now(),
  });
  return null;
}

/** How many rows the panel shows. Enough for a working session, no more. */
const RECENT_JOBS_DEFAULT = 12;
const RECENT_JOBS_MAX = 50;

/**
 * The last media operations, newest first (Y10).
 *
 * The only place an operator ever sees why something did not go through. A
 * failed caption, a refused upload, an edit that hit the quota ceiling — all
 * of them end as a row here and nowhere else: the actions throw a sentence at
 * whoever was on screen at that second, and that sentence is gone the moment
 * the dialog closes.
 *
 * `pending` rows are shown as they are. A job that never finished is a real
 * outcome — the action died, or the browser closed mid-upload — and hiding it
 * would leave the operator wondering where their video went.
 */
export const recentJobs = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("ytMediaJobs"),
      kind: mediaJobKindValidator,
      videoId: v.optional(v.string()),
      title: v.optional(v.string()),
      status: v.union(v.literal("pending"), mediaJobOutcomeValidator),
      unitsSpent: v.number(),
      errorMessage: v.optional(v.string()),
      createdAt: v.number(),
      finishedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { limit }) => {
    const { workspaceId } = await requireMembership(ctx);
    const take = Math.min(
      Math.max(1, Math.floor(limit ?? RECENT_JOBS_DEFAULT)),
      RECENT_JOBS_MAX,
    );
    const rows = await ctx.db
      .query("ytMediaJobs")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(take);

    return rows.map((row) => ({
      _id: row._id,
      kind: row.kind,
      videoId: row.videoId,
      title: row.title,
      status: row.status,
      unitsSpent: row.unitsSpent,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      finishedAt: row.finishedAt,
    }));
  },
});

// ── context ──────────────────────────────────────────────────────────────────

export type MediaContext = {
  workspaceId: Id<"workspaces">;
  channelId: string;
  encryptedCredentials: string;
  unitsUsed: number;
} | null;

/**
 * Whose channel, which credentials, and what today's budget looks like — in
 * one read, so the affordability check and the call it guards cannot see two
 * different counters.
 *
 * Returns `null` when the workspace has no active YouTube connection: that is
 * "nothing to work with", not a fault, and the caller says so in Serbian.
 * A caller who is not a member never gets that far — `requireMembership`
 * throws first.
 */
export const loadMediaContext = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      channelId: v.string(),
      encryptedCredentials: v.string(),
      unitsUsed: v.number(),
    }),
  ),
  handler: async (ctx): Promise<MediaContext> => {
    const { workspaceId } = await requireMembership(ctx);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "youtube"),
      )
      .first();
    if (conn === null || conn.status !== "active") return null;

    return {
      workspaceId,
      // Empty when the credential blob carried no channelId. Only the calls
      // that address the channel itself care; a per-video call does not.
      channelId: (conn.externalId ?? "").trim(),
      encryptedCredentials: conn.encryptedCredentials,
      unitsUsed: await readUnitsUsed(ctx, workspaceId),
    };
  },
});

// ── the shared request ───────────────────────────────────────────────────────

export type YouTubeApiResult = {
  ok: boolean;
  /** HTTP status, or 0 when the request never reached Google. */
  status: number;
  /** Response body as text — the parsed payload on success, the error on failure. */
  body: string;
  /**
   * The `Location` header, or null when there is none.
   *
   * Only one caller needs it and it is the reason this field exists: opening a
   * resumable upload answers 200 with an EMPTY body, and the session URL the
   * bytes go to is in this header. Reading only the body would lose it.
   */
  location: string | null;
};

/**
 * One authorised call to the Data API. Never throws and never logs the token.
 *
 * Deliberately returns the status and the raw body rather than deciding what
 * they mean. Callers differ on that: `captions.list` answering 404 is a video
 * without subtitles, `videos.update` answering 404 is a video that no longer
 * exists, and only the caller knows which it asked for.
 *
 * `body` is passed through `extractYouTubeApiError` only on failure — on
 * success it is the untouched response text, so the caller can parse it.
 */
export async function ytRequest(
  url: string,
  token: string,
  init?: {
    method?: string;
    /** JSON body, thumbnails' raw bytes, or a multipart body — sent as given. */
    body?: BodyInit;
    /** Omit for a GET/DELETE; set it whenever a body goes out. */
    contentType?: string;
    /** Extra headers, e.g. `Slug` on a caption insert. */
    headers?: Record<string, string>;
  },
): Promise<YouTubeApiResult> {
  try {
    const res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.contentType !== undefined
          ? { "Content-Type": init.contentType }
          : {}),
        ...(init?.headers ?? {}),
      },
      ...(init?.body !== undefined ? { body: init.body } : {}),
    });

    const text = await res.text().catch(() => "");
    return {
      ok: res.ok,
      status: res.status,
      body: res.ok ? text : extractYouTubeApiError(text),
      location: res.headers.get("location"),
    };
  } catch (err) {
    // Never reached Google: DNS, TLS, a dropped socket. Status 0 tells the
    // caller this is worth retrying, unlike a 403.
    return {
      ok: false,
      status: 0,
      body: extractYouTubeApiError(
        err instanceof Error ? err.message : String(err),
      ),
      location: null,
    };
  }
}
