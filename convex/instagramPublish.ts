import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials } from "./lib/crypto";
import {
  buildContainerStatusUrl,
  buildMediaContainerUrl,
  buildMediaPublishUrl,
  buildPublishingLimitUrl,
  extractGraphApiError,
  getMetaGraphVersion,
  type RawContainerResponse,
  type RawContainerStatusResponse,
  type RawPublishingLimitResponse,
} from "./lib/instagramApi";
import {
  PROCESSING_DEADLINE_MS,
  POLL_BUDGET_MS,
  POLL_CONTINUE_MS,
  POLL_INTERVAL_MS,
  PUBLISH_LIMIT_FALLBACK,
  checkImageAspect,
  isImageContentType,
  isMissingPublishScope,
  parseContainerStatus,
  publishFailureMessage,
  readJpegDimensions,
  type PublishKind,
} from "./lib/igPublish";

/**
 * ============================================================================
 * INSTAGRAM PUBLISHING — THE CALLS TO META (V8 Runtime)
 * ============================================================================
 *
 * Default runtime on purpose: this file needs `fetch` and Web Crypto, and both
 * are here. The file bytes never pass through it — Instagram fetches them
 * itself from the public `/ig-upload/` route — so there is nothing large to
 * carry and no reason to pay for Node.
 *
 * The shape of a publish, always:
 *
 *   1. claim the job (a transaction, so two schedulers cannot both win it)
 *   2. POST /{ig-user-id}/media          → a container id
 *   3. GET  /{container-id}?fields=status_code  until FINISHED
 *   4. POST /{ig-user-id}/media_publish  → the post
 *
 * Step 3 is not optional and not a formality. A container that is still
 * IN_PROGRESS answers step 4 with an error, and the error does not say why.
 * ============================================================================
 */

/**
 * A failure with a verdict attached.
 *
 * `terminal` means retrying changes nothing — a missing scope, an image whose
 * shape Instagram will never accept, a file that is gone. Those go straight to
 * `failed` instead of burning two more attempts to arrive at the same place.
 */
class PublishError extends Error {
  readonly terminal: boolean;
  constructor(message: string, terminal = false) {
    super(message);
    this.name = "PublishError";
    this.terminal = terminal;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A Graph API POST that turns a failure into a sentence, never a stack. */
async function graphPost(
  url: string,
  params: URLSearchParams,
): Promise<RawContainerResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch {
    throw new PublishError(
      "Instagram nije odgovorio. Mreža ili Meta trenutno ne rade — pokušaj se ponavlja sam.",
    );
  }

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    const message = extractGraphApiError(body);
    throw new PublishError(
      publishFailureMessage(message),
      isMissingPublishScope(message),
    );
  }

  try {
    return JSON.parse(body) as RawContainerResponse;
  } catch {
    throw new PublishError("Instagram je odgovorio nečitljivo.");
  }
}

// ── building containers ──────────────────────────────────────────────────────

type Claim = {
  workspaceId: Id<"workspaces">;
  connectionId: Id<"connections">;
  igUserId: string;
  encryptedCredentials: string;
  kind: PublishKind;
  caption?: string;
  shareToFeed?: boolean;
  mediaUrls: string[];
  contentTypes: string[];
  storageIds: Id<"_storage">[];
  containerId?: string;
  childContainerIds?: string[];
  processingSince?: number;
  attempts: number;
  fresh: boolean;
};

/** Which URL parameter carries this file — that is the whole of the difference. */
function urlParamFor(contentType: string): "image_url" | "video_url" {
  return isImageContentType(contentType) ? "image_url" : "video_url";
}

/**
 * The container for a single-file post.
 *
 * The three types differ by two parameters and nothing else, which is exactly
 * why they are one function: a REEL is `media_type=REELS`, a STORY is
 * `media_type=STORIES` and carries no caption, and a feed image sets no
 * `media_type` at all — passing one would be rejected.
 */
function singleContainerParams(claim: Claim, token: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set(urlParamFor(claim.contentTypes[0] ?? ""), claim.mediaUrls[0]);

  if (claim.kind === "REEL") {
    params.set("media_type", "REELS");
    params.set("share_to_feed", claim.shareToFeed === false ? "false" : "true");
  } else if (claim.kind === "STORY") {
    params.set("media_type", "STORIES");
  }

  // A story has nowhere to put a caption, and sending one is an error.
  if (claim.kind !== "STORY" && claim.caption) {
    params.set("caption", claim.caption);
  }

  params.set("access_token", token);
  return params;
}

/**
 * The container(s) for a carousel: one per slide, then one parent holding them.
 *
 * Slides are written to the job as they are made. A run that dies on slide
 * seven leaves six real containers behind, and the retry starts at seven — the
 * alternative is building six more copies of the same pictures every time.
 */
async function createCarouselContainer(
  ctx: ActionCtx,
  jobId: Id<"igPublishJobs">,
  claim: Claim,
  token: string,
  version: string,
): Promise<string> {
  const childIds = [...(claim.childContainerIds ?? [])];

  for (let index = childIds.length; index < claim.mediaUrls.length; index++) {
    const contentType = claim.contentTypes[index] ?? "";
    const params = new URLSearchParams();
    params.set(urlParamFor(contentType), claim.mediaUrls[index]);
    params.set("is_carousel_item", "true");
    // An image slide needs no `media_type`; a video slide is refused without it.
    if (!isImageContentType(contentType)) params.set("media_type", "VIDEO");
    params.set("access_token", token);

    const child = await graphPost(
      buildMediaContainerUrl(claim.igUserId, version),
      params,
    );
    if (!child.id) {
      throw new PublishError(
        `Instagram nije vratio kontejner za ${index + 1}. fajl u carousel-u.`,
      );
    }

    childIds.push(String(child.id));
    await ctx.runMutation(
      internal.instagramPublishStore.saveChildContainers,
      { jobId, childContainerIds: childIds },
    );
  }

  const parentParams = new URLSearchParams();
  parentParams.set("media_type", "CAROUSEL");
  parentParams.set("children", childIds.join(","));
  if (claim.caption) parentParams.set("caption", claim.caption);
  parentParams.set("access_token", token);

  const parent = await graphPost(
    buildMediaContainerUrl(claim.igUserId, version),
    parentParams,
  );
  if (!parent.id) {
    throw new PublishError("Instagram nije vratio kontejner za carousel.");
  }
  return String(parent.id);
}

// ── the checks that need the bytes ───────────────────────────────────────────

/** Enough of a JPEG to reach the frame header, and not a byte more. */
const HEADER_BYTES = 512 * 1024;

/**
 * Refuse an image Instagram is going to refuse.
 *
 * The composer already measured every picture, but the composer is not the
 * only caller and a mutation cannot decode an image. Here the bytes are within
 * reach, so a 3:1 picture is caught before a container is built and before
 * anyone waits on it.
 *
 * A file this parser cannot read is NOT an error: `readJpegDimensions`
 * returning null means no evidence, and refusing on no evidence would block
 * perfectly good pictures because of our own parser.
 */
async function verifyImageShapes(ctx: ActionCtx, claim: Claim): Promise<void> {
  for (let index = 0; index < claim.storageIds.length; index++) {
    if (!isImageContentType(claim.contentTypes[index] ?? "")) continue;

    const blob = await ctx.storage.get(claim.storageIds[index]);
    if (blob === null) {
      throw new PublishError(
        "Fajl objave više nije dostupan. Napravi objavu ponovo.",
        true,
      );
    }

    const header = new Uint8Array(
      await blob.slice(0, HEADER_BYTES).arrayBuffer(),
    );
    const size = readJpegDimensions(header);
    if (size === null) continue;

    const problem = checkImageAspect({
      kind: claim.kind,
      width: size.width,
      height: size.height,
    });
    if (problem !== null) {
      const where =
        claim.kind === "CAROUSEL" ? `${index + 1}. slika u carousel-u: ` : "";
      throw new PublishError(`${where}${problem}`, true);
    }
  }
}

// ── waiting on Instagram ─────────────────────────────────────────────────────

/**
 * Ask the container whether it is ready, and keep asking.
 *
 * Returns `true` when Instagram is done, `false` when this run has used up its
 * time and has scheduled itself to continue. Throws when the answer is a
 * verdict rather than a delay.
 *
 * Two clocks run here and they measure different things: the RUN budget caps
 * how long one action sits waiting, and the PROCESSING deadline caps how long
 * the post as a whole waits — a video that has been "in progress" for half an
 * hour is not slow, it is stuck, and saying so beats waiting until the
 * container expires tomorrow.
 */
async function awaitContainer(
  ctx: ActionCtx,
  jobId: Id<"igPublishJobs">,
  containerId: string,
  token: string,
  version: string,
  processingSince: number,
): Promise<boolean> {
  const runDeadline = Date.now() + POLL_BUDGET_MS;

  for (;;) {
    let res: Response;
    try {
      res = await fetch(buildContainerStatusUrl(containerId, token, version));
    } catch {
      throw new PublishError(
        "Instagram nije odgovorio na pitanje o statusu obrade.",
      );
    }

    const body = await res.text().catch(() => "");
    if (!res.ok) {
      const message = extractGraphApiError(body);
      throw new PublishError(
        publishFailureMessage(message),
        isMissingPublishScope(message),
      );
    }

    let parsed: RawContainerStatusResponse;
    try {
      parsed = JSON.parse(body) as RawContainerStatusResponse;
    } catch {
      throw new PublishError("Instagram je odgovorio nečitljivo.");
    }

    const status = parseContainerStatus(parsed.status_code);
    if (status === "FINISHED" || status === "PUBLISHED") return true;

    if (status === "ERROR") {
      // `status` (not `status_code`) is the only place Instagram says WHY a
      // video was rejected, and it is usually the codec or the length.
      const detail = parsed.status?.trim();
      throw new PublishError(
        detail && detail.length > 0
          ? `Instagram je odbio fajl: ${detail}`
          : "Instagram je odbio fajl pri obradi. Proveri format i trajanje videa.",
        true,
      );
    }
    if (status === "EXPIRED") {
      throw new PublishError(
        "Kontejner je istekao pre objave (Instagram ih drži 24 h).",
        true,
      );
    }

    if (Date.now() - processingSince > PROCESSING_DEADLINE_MS) {
      throw new PublishError(
        "Instagram obrađuje fajl duže od 30 minuta. Objava je zaustavljena — pokušaj ponovo ili pošalji kraći video.",
        true,
      );
    }

    if (Date.now() + POLL_INTERVAL_MS >= runDeadline) {
      await ctx.scheduler.runAfter(
        POLL_CONTINUE_MS,
        internal.instagramPublish.runPublishJob,
        { jobId },
      );
      return false;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

// ── the job ──────────────────────────────────────────────────────────────────

/**
 * Publish one job, from wherever it currently stands.
 *
 * Reached three ways — straight from `createJob`, from the 1-minute cron, and
 * from itself when a video needs more waiting than one run can give. All three
 * go through `claimJob` first, which is what makes running it twice harmless.
 */
export const runPublishJob = internalAction({
  args: { jobId: v.id("igPublishJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }): Promise<null> => {
    const claim: Claim | null = await ctx.runMutation(
      internal.instagramPublishStore.claimJob,
      { jobId },
    );
    if (claim === null) return null;

    let token: string;
    try {
      token = await decryptCredentials(claim.encryptedCredentials);
    } catch {
      await ctx.runMutation(internal.instagramPublishStore.markFailure, {
        jobId,
        message:
          "Pristupni token Instagram naloga se ne može pročitati. Poveži nalog ponovo u Podešavanjima.",
        terminal: true,
      });
      return null;
    }

    const version = getMetaGraphVersion();

    try {
      let containerId = claim.containerId;
      let processingSince = claim.processingSince ?? Date.now();

      if (containerId === undefined) {
        await verifyImageShapes(ctx, claim);
        containerId =
          claim.kind === "CAROUSEL"
            ? await createCarouselContainer(ctx, jobId, claim, token, version)
            : await createSingleContainer(claim, token, version);

        processingSince = Date.now();
        await ctx.runMutation(internal.instagramPublishStore.markProcessing, {
          jobId,
          containerId,
        });
      } else if (claim.fresh) {
        // A retry that already owns a container: publish THAT one rather than
        // build a second copy of the same post. The deadline is re-armed,
        // because the wait genuinely starts again.
        processingSince = Date.now();
        await ctx.runMutation(internal.instagramPublishStore.markProcessing, {
          jobId,
          containerId,
        });
      }

      const ready = await awaitContainer(
        ctx,
        jobId,
        containerId,
        token,
        version,
        processingSince,
      );
      if (!ready) return null; // still processing; a continuation is scheduled

      const published = await graphPost(
        buildMediaPublishUrl(claim.igUserId, version),
        (() => {
          const params = new URLSearchParams();
          params.set("creation_id", containerId);
          params.set("access_token", token);
          return params;
        })(),
      );

      await ctx.runMutation(internal.instagramPublishStore.markPublished, {
        jobId,
        ...(published.id ? { publishedMediaId: String(published.id) } : {}),
        connectionId: claim.connectionId,
      });
    } catch (err) {
      const terminal = err instanceof PublishError ? err.terminal : false;
      const message =
        err instanceof Error && err.message.trim().length > 0
          ? err.message
          : "Objavljivanje nije uspelo.";
      await ctx.runMutation(internal.instagramPublishStore.markFailure, {
        jobId,
        message,
        terminal,
      });
    }

    return null;
  },
});

async function createSingleContainer(
  claim: Claim,
  token: string,
  version: string,
): Promise<string> {
  const created = await graphPost(
    buildMediaContainerUrl(claim.igUserId, version),
    singleContainerParams(claim, token),
  );
  if (!created.id) {
    throw new PublishError("Instagram nije vratio kontejner za objavu.");
  }
  return String(created.id);
}

// ── the 24-hour allowance ────────────────────────────────────────────────────

/**
 * How much of the rolling 24-hour publishing allowance is spent.
 *
 * An action rather than a query because the number lives at Meta, not here.
 * Counting our own published rows would be a different number: posts made from
 * the phone count against the same allowance and we never see them.
 *
 * Never throws for a missing scope or an unreachable Meta — the screen has to
 * render either way, so the failure comes back as a sentence in `error` and
 * the composer shows it next to the count instead of instead of the screen.
 */
export const publishingLimit = action({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    used: v.number(),
    total: v.number(),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
  ): Promise<{
    connected: boolean;
    used: number;
    total: number;
    error?: string;
  }> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.instagramPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.instagramPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.igUserId) {
      return { connected: false, used: 0, total: PUBLISH_LIMIT_FALLBACK };
    }

    let token: string;
    try {
      token = await decryptCredentials(connection.encryptedCredentials);
    } catch {
      return {
        connected: true,
        used: 0,
        total: PUBLISH_LIMIT_FALLBACK,
        error: "Pristupni token se ne može pročitati.",
      };
    }

    const version = getMetaGraphVersion();
    try {
      const res = await fetch(
        buildPublishingLimitUrl(connection.igUserId, token, version),
      );
      const body = await res.text().catch(() => "");
      if (!res.ok) {
        const message = extractGraphApiError(body);
        return {
          connected: true,
          used: 0,
          total: PUBLISH_LIMIT_FALLBACK,
          error: publishFailureMessage(message),
        };
      }

      const parsed = JSON.parse(body) as RawPublishingLimitResponse;
      const entry = parsed.data?.[0];
      return {
        connected: true,
        used: Number(entry?.quota_usage) || 0,
        total: Number(entry?.config?.quota_total) || PUBLISH_LIMIT_FALLBACK,
      };
    } catch {
      return {
        connected: true,
        used: 0,
        total: PUBLISH_LIMIT_FALLBACK,
        error: "Instagram trenutno ne odgovara na pitanje o kvoti.",
      };
    }
  },
});
