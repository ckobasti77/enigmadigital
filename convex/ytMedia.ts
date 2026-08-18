import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { extractYouTubeApiError } from "./lib/youtubeApi";
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
 */

// ── job rows ─────────────────────────────────────────────────────────────────

const mediaJobKindValidator = v.union(
  v.literal("upload"),
  v.literal("metadata"),
  v.literal("thumbnail"),
  v.literal("caption"),
  v.literal("playlist"),
  v.literal("comment_delete"),
);

/** How a job may end. `pending` is the start state and never an outcome. */
const mediaJobOutcomeValidator = v.union(
  v.literal("done"),
  v.literal("failed"),
  v.literal("skipped_quota"),
);

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
  handler: async (ctx, args) => {
    return await ctx.db.insert("ytMediaJobs", {
      workspaceId: args.workspaceId,
      kind: args.kind,
      videoId: args.videoId,
      title: args.title,
      status: "pending",
      unitsSpent: 0,
      createdAt: Date.now(),
    });
  },
});

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
  handler: async (ctx, args) => {
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
    };
  }
}
