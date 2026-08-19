import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { VIDEO_UPLOAD_DAILY_LIMIT } from "./lib/ytQuota";
import {
  DEFAULT_VIDEO_CATEGORY_ID,
  checkVideoMetadata,
  isVideoCategoryId,
  normalizeTags,
} from "./lib/ytUpload";
import { addUploadsUsed, readUploadsUsed } from "./ytIngest";
import { closeMediaJob, openMediaJob } from "./ytMedia";

/**
 * Sending a video (Y10). Default V8 runtime — and, unusually for this app,
 * three mutations rather than one action.
 *
 * The reason is size. A Convex action has neither the time nor the memory for
 * a file of a few hundred megabytes, so the bytes never enter the backend at
 * all:
 *
 *   browser → Convex   startUpload — book the day's upload, open the job row,
 *                      and hand back the exact metadata that may be sent
 *   browser → Convex   ytAuth.issueUploadToken (Y6) — one hour, upload only
 *   browser → YouTube  resumable session, then the file in 8 MB chunks
 *   browser → Convex   finishUpload / failUpload — how it ended
 *
 * Two consequences shape everything here.
 *
 * PRVA: privatnost nije izbor. Google zaključava svaki video poslat kroz
 * `videos.insert` iz neproverenog projekta, pa `startUpload` sam sastavlja
 * telo zahteva i u njemu je `privacyStatus: "private"` konstanta. Browser ne
 * šalje privatnost, nego dobija telo koje sme da pošalje — jedina verzija u
 * kojoj zaključano polje u formi nešto zaista znači.
 *
 * DRUGA: brojač se knjiži na početku, ne na kraju. Dnevni limit od 100 poziva
 * je naš, ne Google-ov, i postoji zbog jednog scenarija — petlje koja iznova
 * šalje isti fajl. Brojač koji raste samo posle uspeha tu petlju ne bi
 * zaustavio nijednom. Zato se knjiži pre slanja, a vraća se samo kada browser
 * javi da sesija nikad nije ni otvorena: tada Google ništa nije primio.
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

// ── what the operator may still send today ───────────────────────────────────

/**
 * Today's upload budget.
 *
 * Deliberately not part of `ytMedia.mediaQuotaStatus`: that reports the units
 * ceiling, and an upload spends none of it. Two numbers that move for
 * different reasons do not belong in one widget.
 */
export const uploadStatus = query({
  args: {},
  returns: v.object({
    uploadsUsed: v.number(),
    uploadsRemaining: v.number(),
    uploadLimit: v.number(),
    /** False when the workspace has no active YouTube connection. */
    connected: v.boolean(),
  }),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "youtube"),
      )
      .first();

    const uploadsUsed = await readUploadsUsed(ctx, workspaceId);
    return {
      uploadsUsed,
      uploadsRemaining: Math.max(0, VIDEO_UPLOAD_DAILY_LIMIT - uploadsUsed),
      uploadLimit: VIDEO_UPLOAD_DAILY_LIMIT,
      connected: conn !== null && conn.status === "active",
    };
  },
});

// ── start ────────────────────────────────────────────────────────────────────

/**
 * The body the browser POSTs to open the resumable session.
 *
 * Assembled here rather than in the browser so `privacyStatus` cannot be
 * anything else. `selfDeclaredMadeForKids` is required on insert and there is
 * no honest default other than false — the operator declares it, not us, and
 * this app is not the place to declare a channel's content for children.
 */
const uploadMetadataValidator = v.object({
  snippet: v.object({
    title: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    categoryId: v.string(),
  }),
  status: v.object({
    privacyStatus: v.literal("private"),
    selfDeclaredMadeForKids: v.boolean(),
  }),
});

/**
 * Open the upload: check, book, record, and hand back what may be sent.
 *
 * Everything that can be refused is refused here, before a byte moves — a
 * failed upload of a 2 GB file over a phone connection is twenty minutes the
 * operator does not get back.
 */
export const startUpload = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    tags: v.array(v.string()),
    categoryId: v.string(),
  },
  returns: v.object({
    jobId: v.id("ytMediaJobs"),
    metadata: uploadMetadataValidator,
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);

    const conn = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "youtube"),
      )
      .first();
    if (conn === null || conn.status !== "active") {
      invalid("Prvo poveži YouTube nalog u Podešavanjima.");
    }

    // Rejected metadata is the operator's typo, not an attempted upload, so it
    // never reaches the job log.
    const problem = checkVideoMetadata({
      title: args.title,
      description: args.description,
      tags: args.tags,
    });
    if (problem !== null) invalid(problem);

    const categoryId = args.categoryId.trim();
    if (!isVideoCategoryId(categoryId)) {
      invalid("Izaberi kategoriju videa.");
    }

    const title = args.title.trim();

    // The ceiling is checked and the upload booked in one transaction, so two
    // tabs cannot both read 99 and both send.
    const uploadsUsed = await readUploadsUsed(ctx, workspaceId);
    if (uploadsUsed >= VIDEO_UPLOAD_DAILY_LIMIT) {
      const jobId = await openMediaJob(ctx, {
        workspaceId,
        kind: "upload",
        title,
      });
      await closeMediaJob(ctx, {
        jobId,
        status: "skipped_quota",
        unitsSpent: 0,
        errorMessage: `Dnevni limit od ${VIDEO_UPLOAD_DAILY_LIMIT} poslatih videa je dostignut.`,
      });
      invalid(
        `Danas je poslato ${uploadsUsed} od ${VIDEO_UPLOAD_DAILY_LIMIT} videa, koliko je dnevni limit. Pokušaj ponovo sutra.`,
      );
    }
    await addUploadsUsed(ctx, workspaceId, 1);

    const jobId = await openMediaJob(ctx, {
      workspaceId,
      kind: "upload",
      title,
    });

    return {
      jobId,
      metadata: {
        snippet: {
          title,
          description: args.description,
          tags: normalizeTags(args.tags),
          categoryId: categoryId.length > 0 ? categoryId : DEFAULT_VIDEO_CATEGORY_ID,
        },
        status: {
          // Not a default and not a preference — see the file header.
          privacyStatus: "private" as const,
          selfDeclaredMadeForKids: false,
        },
      },
    };
  },
});

// ── the two ways it ends ─────────────────────────────────────────────────────

/**
 * The job row, if it belongs to the caller and is still open.
 *
 * Ownership is checked rather than assumed: these are public mutations that
 * take an id, and a job id from another workspace must not be closable from
 * here. `pending` is checked too — a second call for a job already closed is a
 * retry that would otherwise rewrite history.
 */
async function claimJob(
  ctx: MutationCtx,
  jobId: Id<"ytMediaJobs">,
  workspaceId: Id<"workspaces">,
): Promise<Doc<"ytMediaJobs"> | null> {
  const job = await ctx.db.get(jobId);
  if (job === null || job.workspaceId !== workspaceId) return null;
  if (job.status !== "pending") return null;
  return job;
}

/**
 * The upload succeeded.
 *
 * Besides closing the row this writes the video into `ytVideoStats` with zero
 * counters, so it appears in the grid immediately. Waiting for the 6h cron
 * would leave the operator looking at a screen that says the upload never
 * happened, an hour after it did.
 *
 * The row is a placeholder, not a claim about the video: views, likes and
 * comments are genuinely zero on a video published a second ago, and the next
 * sync overwrites the rest (thumbnail, duration, real figures).
 */
export const finishUpload = mutation({
  args: {
    jobId: v.id("ytMediaJobs"),
    videoId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);

    const videoId = args.videoId.trim();
    if (videoId.length === 0) invalid("YouTube nije vratio ID videa.");

    const job = await claimJob(ctx, args.jobId, workspaceId);
    if (job === null) return null;

    // The id lands on the row before anything can return early — it is the
    // only link from this log entry to the video it produced.
    await ctx.db.patch(args.jobId, { videoId });
    await closeMediaJob(ctx, {
      jobId: args.jobId,
      status: "done",
      // videos.insert is metered on its own counter, not in units.
      unitsSpent: 0,
    });

    // The cron may have got there first on a re-run; the sync's row wins,
    // since it carries the thumbnail and duration this one cannot.
    const existing = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_video", (q) =>
        q.eq("workspaceId", workspaceId).eq("videoId", videoId),
      )
      .first();
    if (existing !== null) return null;

    const now = Date.now();
    await ctx.db.insert("ytVideoStats", {
      workspaceId,
      videoId,
      title: args.title.trim(),
      publishedAt: now,
      views: 0,
      likes: 0,
      comments: 0,
      syncedAt: now,
    });
    return null;
  },
});

/**
 * The upload did not succeed — a refused token, a rejected file, a cancelled
 * transfer, a connection that never came back.
 *
 * `sessionOpened` is the one thing the browser knows and the backend cannot:
 * whether Google ever answered with a session URL. If it did not, nothing was
 * sent and nothing was metered, so the upload booked at the start is given
 * back. If it did, the attempt counts — a cancelled 900 MB transfer is not
 * free, and pretending otherwise is how a retry loop hides.
 */
export const failUpload = mutation({
  args: {
    jobId: v.id("ytMediaJobs"),
    message: v.string(),
    sessionOpened: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);

    const job = await claimJob(ctx, args.jobId, workspaceId);
    if (job === null) return null;

    if (!args.sessionOpened) {
      await addUploadsUsed(ctx, workspaceId, -1);
    }

    await closeMediaJob(ctx, {
      jobId: args.jobId,
      status: "failed",
      unitsSpent: 0,
      errorMessage:
        args.message.trim().length > 0
          ? args.message.trim()
          : "Slanje videa nije uspelo.",
    });
    return null;
  },
});
