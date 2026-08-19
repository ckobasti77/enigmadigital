import { action, internalMutation, mutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import {
  buildThumbnailsSetUrl,
  fetchAccessToken,
  parseYouTubeCredentials,
} from "./lib/youtubeApi";
import {
  QUOTA_COST,
  QUOTA_MEDIA_EXHAUSTED_MESSAGE,
  canAffordMedia,
} from "./lib/ytQuota";
import {
  THUMBNAIL_FORBIDDEN_HINT,
  THUMBNAIL_MAX_BYTES,
  THUMBNAIL_NOT_ENABLED_MESSAGE,
  detectThumbnailType,
  formatThumbnailSize,
  isThumbnailNotEnabled,
} from "./lib/ytThumbnail";
import { ytRequest } from "./ytMedia";
import type { MediaContext } from "./ytMedia";

/**
 * Custom thumbnails (Y8). Default V8 runtime.
 *
 * Slika ide KROZ backend, ne iz browsera. Y10 šalje video bajtove pravo
 * Google-u zato što nekoliko stotina megabajta ne može da prođe kroz akciju;
 * sličica je najviše 2 MB i prolazi bez problema. Zato token ostaje ovde i
 * browser ga nikada ne vidi — `ytAuth.issueUploadToken` postoji za bajtove
 * koji nemaju gde drugde, a ovo nisu oni.
 *
 * Put fajla: browser → Convex storage → ova akcija → YouTube, pa se fajl iz
 * storage-a briše. Nema razloga da duplikat nečega što sada živi na YouTube-u
 * ostane i kod nas.
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

// ── local mirror ─────────────────────────────────────────────────────────────

/**
 * Point the stored thumbnail at the new image.
 *
 * YouTube's thumbnail URL for a video never changes — the same
 * `i.ytimg.com/vi/<id>/…` address now serves different bytes. A browser that
 * already has the old picture would go on showing it, so the URL is stored
 * with a version marker: query strings are ignored by the CDN and are the only
 * way to tell the browser this is a different image. The next sync overwrites
 * it with the plain URL, by which time nothing is holding the old one.
 */
export const patchVideoThumbnail = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    videoId: v.string(),
    thumbnailUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, videoId, thumbnailUrl }) => {
    const row = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_video", (q) =>
        q.eq("workspaceId", workspaceId).eq("videoId", videoId),
      )
      .first();
    if (row !== null) await ctx.db.patch(row._id, { thumbnailUrl });
    return null;
  },
});

// ── getting the image into the backend ───────────────────────────────────────

/**
 * A one-shot URL the browser POSTs the image to.
 *
 * The image goes to Convex storage first and to Google second, for the same
 * reason a caption file does (Y9): the call that carries it needs a token with
 * full write access to the channel, and that does not belong in a browser.
 */
export const generateThumbnailUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireMembership(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * The runtime's `fetch` takes an ArrayBuffer, not a view over one, so the
 * bytes are copied out rather than handed over. Two megabytes at most.
 */
function asBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** Read the uploaded image out of storage and check it is really an image. */
async function readThumbnailFile(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
): Promise<{ file: Uint8Array; contentType: string }> {
  const blob = await ctx.storage.get(storageId);
  if (blob === null) {
    invalid("Slika više nije dostupna. Izaberi je ponovo i pošalji.");
  }

  const file = new Uint8Array(await blob.arrayBuffer());
  if (file.length === 0) invalid("Fajl sa sličicom je prazan.");
  if (file.length > THUMBNAIL_MAX_BYTES) {
    invalid(
      `Slika je ${formatThumbnailSize(file.length)}, a granica je 2 MB. YouTube veće odbija.`,
    );
  }

  // The dialog checked the extension; this checks the bytes. A renamed .webp
  // gets past the browser and would cost the full 50 units to have YouTube
  // refuse it.
  const type = detectThumbnailType(file);
  if (type === null) {
    invalid(
      "Sadržaj fajla nije JPG ni PNG. WebP, GIF i ostali formati se ne primaju — sačuvaj sliku kao JPG ili PNG.",
    );
  }

  return { file, contentType: type };
}

// ── the call ─────────────────────────────────────────────────────────────────

/** What `thumbnails.set` answers with: one set of sizes for the new image. */
type ThumbnailSet = {
  maxres?: { url?: string };
  standard?: { url?: string };
  high?: { url?: string };
  medium?: { url?: string };
  default?: { url?: string };
};

/** The size the grid wants, or null if YouTube named none. */
function bestThumbnailUrl(body: string): string | null {
  let item: ThumbnailSet | undefined;
  try {
    item = (JSON.parse(body) as { items?: ThumbnailSet[] }).items?.[0];
  } catch {
    return null;
  }
  if (item === undefined) return null;
  // The grid shows one picture at card size; `high` (480×360) is what the sync
  // stores, so preferring it keeps the two in step rather than swapping in a
  // 1280 px image for one video only.
  const url =
    item.high?.url ??
    item.medium?.url ??
    item.standard?.url ??
    item.maxres?.url ??
    item.default?.url ??
    "";
  return url.length > 0 ? url : null;
}

/**
 * Set a custom thumbnail — 50 units.
 *
 * ZAHTEVA VERIFIKOVAN KANAL. Prilagođene sličice nisu uključene na svakom
 * nalogu: dok kanal nije verifikovan brojem telefona, YouTube na ovaj poziv
 * odgovara 403 — i naplati ga. Ta greška se ovde prevodi u rečenicu koja kaže
 * šta da se uradi (lib/ytThumbnail.ts), jer Google-ova sirova poruka govori o
 * autorizaciji i šalje čoveka da sat vremena gleda OAuth opsege.
 *
 * Fajl se briše iz Convex storage-a kako god da se ovo završi: neuspelo
 * slanje se ponavlja biranjem slike sa diska, ne iz storage-a.
 */
export const setThumbnail = action({
  args: {
    videoId: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      return await runSetThumbnail(ctx, args);
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => {});
    }
  },
});

async function runSetThumbnail(
  ctx: ActionCtx,
  args: { videoId: string; storageId: Id<"_storage"> },
): Promise<null> {
  const videoId = args.videoId.trim();
  if (videoId.length === 0) invalid("Nedostaje ID videa.");

  const context: MediaContext = await ctx.runQuery(
    internal.ytMedia.loadMediaContext,
    {},
  );
  if (context === null) {
    invalid("Prvo poveži YouTube nalog u Podešavanjima.");
  }
  const { workspaceId } = context;

  // Read and check the image BEFORE the job row: a file that is not an image
  // is the operator's wrong click, not an operation worth recording.
  const { file, contentType } = await readThumbnailFile(ctx, args.storageId);

  const localTitle: string | null = await ctx.runQuery(
    internal.ytVideos.loadVideoTitle,
    { workspaceId, videoId },
  );

  const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
    workspaceId,
    kind: "thumbnail" as const,
    videoId,
    ...(localTitle !== null ? { title: localTitle } : {}),
  });

  const cost = QUOTA_COST.thumbnailsSet;
  if (!canAffordMedia(context.unitsUsed, cost)) {
    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "skipped_quota" as const,
      unitsSpent: 0,
      errorMessage: QUOTA_MEDIA_EXHAUSTED_MESSAGE,
    });
    invalid(QUOTA_MEDIA_EXHAUSTED_MESSAGE);
  }

  let spent = 0;
  const failJob = async (message: string): Promise<never> => {
    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "failed" as const,
      unitsSpent: spent,
      errorMessage: message,
    });
    invalid(message);
  };

  let token: string;
  try {
    const creds = parseYouTubeCredentials(
      await decryptCredentials(context.encryptedCredentials),
    );
    token = await fetchAccessToken(creds);
  } catch (err) {
    return await failJob(
      err instanceof Error
        ? err.message
        : "Neuspela priprema YouTube kredencijala.",
    );
  }

  // The bytes are the whole body — this is not a JSON call, and the image's
  // own Content-Type is what tells Google how to read them.
  const res = await ytRequest(buildThumbnailsSetUrl(videoId), token, {
    method: "POST",
    body: asBody(file),
    contentType,
  });
  // Status 0 is the one failure Google did not charge for: the request never
  // reached it. Everything else is metered whether it succeeded or not.
  if (res.status !== 0) {
    spent = cost;
    await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
      workspaceId,
      units: spent,
    });
  }

  if (!res.ok) {
    if (isThumbnailNotEnabled(res.status, res.body)) {
      return await failJob(
        `${THUMBNAIL_NOT_ENABLED_MESSAGE} ${THUMBNAIL_FORBIDDEN_HINT}`,
      );
    }
    if (res.status === 404) {
      return await failJob(
        "Video nije pronađen na YouTube-u. Možda je obrisan ili ne pripada povezanom kanalu.",
      );
    }
    return await failJob(`Slanje sličice nije uspelo: ${res.body}`);
  }

  const url = bestThumbnailUrl(res.body);
  if (url !== null) {
    await ctx.runMutation(internal.ytThumbnails.patchVideoThumbnail, {
      workspaceId,
      videoId,
      // See `patchVideoThumbnail`: same address, different bytes, so the
      // browser needs to be told this is not the picture it already has.
      thumbnailUrl: `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`,
    });
  }

  await ctx.runMutation(internal.ytMedia.finishJob, {
    jobId,
    status: "done" as const,
    unitsSpent: spent,
  });
  return null;
}
