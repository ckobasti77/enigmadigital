import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { DocumentByName, SystemDataModel } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { connectionStatusValidator } from "./lib/providers";
import {
  ABANDONED_AFTER_DUE_MS,
  MAX_ATTEMPTS,
  STALE_PROCESSING_MS,
  STALE_PUBLISHING_MS,
  STALE_UPLOADING_MS,
  UPLOAD_TTL_MS,
  checkAltText,
  checkAutoPublishText,
  checkFile,
  checkItemCount,
  checkLinkAttachment,
  checkPollAttachment,
  checkScheduledFor,
  checkSpoilerMedia,
  checkText,
  checkTopicTag,
  retryDelayMs,
  type ThreadsPublishMediaType,
} from "./lib/threadsPublish";
import { isControlledDomain } from "./lib/urlNormalization";
import { ensureTrackedUrlHelper } from "./orLinks";


/** The `_storage` system table's row — size and content type, as stored. */
type StorageMetadata = DocumentByName<SystemDataModel, "_storage">;

/**
 * ============================================================================
 * THREADS PUBLISHING — PERSISTENCE & QUEUE (V8 Runtime)
 * ============================================================================
 *
 * Transakcioni sloj za objavljivanje na Threads platformi: kreiranje poslova,
 * atomsko preuzimanje (claim), praćenje stanja kontejnera i publikacije,
 * listing za korisnički interfejs, kao i cron poslovi za deblokadu i čišćenje.
 * ============================================================================
 */

const mediaTypeValidator = v.union(
  v.literal("TEXT"),
  v.literal("IMAGE"),
  v.literal("VIDEO"),
  v.literal("CAROUSEL"),
);

const statusValidator = v.union(
  v.literal("draft"),
  v.literal("queued"),
  v.literal("uploading"),
  v.literal("processing"),
  v.literal("publishing"),
  v.literal("published"),
  v.literal("failed"),
  v.literal("canceled"),
);

const replyControlValidator = v.union(
  v.literal("everyone"),
  v.literal("accounts_you_follow"),
  v.literal("mentioned_only"),
  v.literal("parent_post_author_only"),
  v.literal("followers_only"),
);

const pollAttachmentValidator = v.object({
  option_a: v.string(),
  option_b: v.string(),
  option_c: v.optional(v.string()),
  option_d: v.optional(v.string()),
});

/** Statusi koji označavaju da akcija trenutno drži i obrađuje posao. */
const RUNNING_STATUSES = ["uploading", "processing", "publishing"] as const;

const STALE_AFTER_MS: Record<(typeof RUNNING_STATUSES)[number], number> = {
  uploading: STALE_UPLOADING_MS,
  processing: STALE_PROCESSING_MS,
  publishing: STALE_PUBLISHING_MS,
};

/** Statusi iz kojih posao još uvek može samostalno da se dovrši. */
const LIVE_STATUSES = [
  "draft",
  "queued",
  "uploading",
  "processing",
  "publishing",
] as const;

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid", message });
}

/**
 * Adresa sa koje Threads fetcher preuzima fajlove.
 * Čita se iz CONVEX_SITE_URL pri kreiranju i čuva na poslu.
 */
function uploadBaseUrl(): string {
  const site = process.env.CONVEX_SITE_URL?.trim().replace(/\/+$/, "");
  if (!site) {
    invalid(
      "Adresa Convex HTTP servera nije poznata, pa Threads nema odakle da preuzme fajl.",
    );
  }
  return site;
}

export function uploadUrlFor(storageId: Id<"_storage">): string {
  return `${uploadBaseUrl()}/threads-upload/${encodeURIComponent(storageId)}`;
}

// ── Upload fajlova u storage ────────────────────────────────────────────────

/**
 * Jednokratni URL za direktan upload fajla iz browsera u Convex storage.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireMembership(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Evidentira da je fajl stigao u storage pre nego što je posao kreiran.
 */
export const registerUpload = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    const { workspaceId } = await requireMembership(ctx);

    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    if (meta === null) invalid("Fajl nije stigao. Dodaj ga ponovo i pošalji.");

    const existing = await ctx.db
      .query("threadsPublishUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (existing !== null) return null;

    await ctx.db.insert("threadsPublishUploads", {
      workspaceId,
      storageId,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Oslobađa privremene račune o uploadu kada posao preuzme vlasništvo nad fajlovima.
 */
async function claimUploads(
  ctx: MutationCtx,
  storageIds: Id<"_storage">[],
): Promise<void> {
  for (const storageId of storageIds) {
    const receipt = await ctx.db
      .query("threadsPublishUploads")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (receipt !== null) await ctx.db.delete(receipt._id);
  }
}

/**
 * Automatski zamenjuje sve URL-ove koji vode ka našim domenima sa /r/ praćenim linkovima (TH10).
 * Ako generisanje praćenog linka ne uspe, prekida kreiranje posla kako objava ne bi otišla neprimećeno nepropraćena.
 */
async function trackControlledUrls(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  content: { text?: string; linkAttachment?: string },
): Promise<{ text?: string; linkAttachment?: string }> {
  let text = content.text;
  let linkAttachment = content.linkAttachment;

  // 1. Obrada linkAttachment-a
  if (linkAttachment && isControlledDomain(linkAttachment)) {
    const shortUrl = await ensureTrackedUrlHelper(ctx, {
      workspaceId,
      destinationUrl: linkAttachment,
      channel: "threads",
    });
    if (!shortUrl) {
      invalid(
        `Kreiranje praćenog /r/ linka nije uspelo za linkAttachment (${linkAttachment}). Objava je zaustavljena.`,
      );
    }
    linkAttachment = shortUrl;
  }

  // 2. Obrada linkova unutar teksta objave
  //
  // Zamena ide po INDEKSU podudaranja, i unazad. `text.replace(rawUrl, ...)`
  // menja PRVO pojavljivanje podniske u celom tekstu — a prvo pojavljivanje
  // posle prve zamene ume da bude unutar upravo ubačenog kratkog linka.
  // Dokazano na stvarnom slučaju:
  //
  //   ulaz:  "https://enigmait.rs/x i https://digital.enigmait.rs"
  //   staro: "https://digital.enigmait.rs/r/BBB/r/AAA i https://digital.enigmait.rs"
  //   novo:  "https://digital.enigmait.rs/r/AAA i https://digital.enigmait.rs/r/BBB"
  //
  // Prvi kratki link SADRŽI naš domen, pa je drugi `replace` pogodio njega
  // umesto pravog URL-a — i objava bi otišla sa pokvarenim linkom, tiho.
  // Unazad zato što zamena ne sme da pomeri indekse podudaranja koja tek
  // dolaze na red.
  if (text) {
    const urlRegex = /https?:\/\/[^\s<>"'()]+/gi;
    const matches = Array.from(text.matchAll(urlRegex));

    const replacements: Array<{ start: number; end: number; shortUrl: string }> =
      [];

    for (const match of matches) {
      const rawUrl = match[0];
      if (match.index === undefined) continue;
      if (!isControlledDomain(rawUrl)) continue;

      const shortUrl = await ensureTrackedUrlHelper(ctx, {
        workspaceId,
        destinationUrl: rawUrl,
        channel: "threads",
      });
      if (!shortUrl) {
        invalid(
          `Kreiranje praćenog /r/ linka nije uspelo za link u tekstu (${rawUrl}). Objava je zaustavljena.`,
        );
      }

      replacements.push({
        start: match.index,
        end: match.index + rawUrl.length,
        shortUrl,
      });
    }

    for (let i = replacements.length - 1; i >= 0; i--) {
      const { start, end, shortUrl } = replacements[i];
      text = text.slice(0, start) + shortUrl + text.slice(end);
    }
  }

  return { text, linkAttachment };
}

// ── Kreiranje posla za objavljivanje ─────────────────────────────────────────

/**
 * Kreira novu Threads objavu (odmah ili zakazanu) uz detaljnu validaciju svih pravila.
 */
export const createJob = mutation({

  args: {
    mediaType: mediaTypeValidator,
    text: v.optional(v.string()),
    storageIds: v.optional(v.array(v.id("_storage"))),
    scheduledFor: v.optional(v.number()),
    replyToId: v.optional(v.string()),
    replyControl: v.optional(replyControlValidator),
    allowlistedCountryCodes: v.optional(v.array(v.string())),
    altText: v.optional(v.string()),
    linkAttachment: v.optional(v.string()),
    quotePostId: v.optional(v.string()),
    topicTag: v.optional(v.string()),
    isSpoilerMedia: v.optional(v.boolean()),
    isGhostPost: v.optional(v.boolean()),
    enableReplyApprovals: v.optional(v.boolean()),
    crossreshareToIg: v.optional(v.boolean()),
    crossreshareToIgDarkMode: v.optional(v.boolean()),
    locationId: v.optional(v.string()),
    autoPublishText: v.optional(v.boolean()),
    pollAttachment: v.optional(pollAttachmentValidator),
  },
  returns: v.id("threadsPublishJobs"),
  handler: async (
    ctx,
    {
      mediaType,
      text,
      storageIds = [],
      scheduledFor,
      replyToId,
      replyControl,
      allowlistedCountryCodes,
      altText,
      linkAttachment,
      quotePostId,
      topicTag,
      isSpoilerMedia,
      isGhostPost,
      enableReplyApprovals,
      crossreshareToIg,
      crossreshareToIgDarkMode,
      locationId,
      autoPublishText,
      pollAttachment,
    },
  ) => {
    const { workspaceId, userId } = await requireMembership(ctx);
    const now = Date.now();

    // 1. Provera broja stavki
    const countProblem = checkItemCount(mediaType, storageIds.length);
    if (countProblem !== null) invalid(countProblem);

    // Duplikati u listi fajlova
    if (new Set(storageIds).size !== storageIds.length) {
      invalid("Isti fajl je dodat više puta.");
    }

    // 2. Tekst i obaveznost
    const trimmedText = text?.trim();
    if (
      mediaType === "TEXT" &&
      (!trimmedText || trimmedText.length === 0) &&
      !pollAttachment
    ) {
      invalid("Tekstualna objava mora imati tekst ili anketu.");
    }

    const textProblem = checkText({ mediaType, text: trimmedText });
    if (textProblem !== null) invalid(textProblem);

    // 3. Alt tekst
    const altTextProblem = checkAltText({ mediaType, altText });
    if (altTextProblem !== null) invalid(altTextProblem);

    // 4. Topic tag
    const topicTagProblem = checkTopicTag(topicTag);
    if (topicTagProblem !== null) invalid(topicTagProblem);

    // 5. Anketa
    const pollProblem = checkPollAttachment({ mediaType, pollAttachment });
    if (pollProblem !== null) invalid(pollProblem);

    // 6. Link prilog
    const linkProblem = checkLinkAttachment({ mediaType, linkAttachment });
    if (linkProblem !== null) invalid(linkProblem);

    // 7. Auto publish text
    const autoPublishProblem = checkAutoPublishText({ mediaType, autoPublishText });
    if (autoPublishProblem !== null) invalid(autoPublishProblem);

    // 8. Spoiler na mediju
    const spoilerProblem = checkSpoilerMedia({ mediaType, isSpoilerMedia });
    if (spoilerProblem !== null) invalid(spoilerProblem);

    // 9. Validacija fajlova u storage-u
    const contentTypes: string[] = [];
    for (const storageId of storageIds) {
      const meta: StorageMetadata | null = await ctx.db.system.get(
        "_storage",
        storageId,
      );
      if (meta === null) {
        invalid("Fajl više nije dostupan. Dodaj ga ponovo i pošalji.");
      }
      const contentType = meta.contentType ?? "";
      const fileProblem = checkFile({
        mediaType,
        size: meta.size,
        type: contentType,
      });
      if (fileProblem !== null) invalid(fileProblem);
      contentTypes.push(contentType);
    }

    // 10. Zakazano vreme
    if (scheduledFor !== undefined) {
      const scheduleProblem = checkScheduledFor(scheduledFor, now);
      if (scheduleProblem !== null) invalid(scheduleProblem);
    }

    // 11. Provera duplikata u toku (za objave sa medijima)
    if (storageIds.length > 0) {
      if (await hasLiveJobWithSameFiles(ctx, workspaceId, storageIds)) {
        invalid(
          "Ista objava je već poslata i još je u toku. Sačekaj da se završi ili je otkaži u listi.",
        );
      }
    }

    const dueAt = scheduledFor ?? now;
    const trimmedAltText = altText?.trim();
    const trimmedTopicTag = topicTag?.trim();
    const trimmedLocationId = locationId?.trim();
    const trimmedLinkAttachment = linkAttachment?.trim();
    const trimmedReplyToId = replyToId?.trim();
    const trimmedQuotePostId = quotePostId?.trim();

    // Zamena linkova ka našim domenima sa /r/ praćenim linkovima pre kreiranja posla (TH10)
    const { text: finalText, linkAttachment: finalLinkAttachment } =
      await trackControlledUrls(ctx, workspaceId, {
        text: trimmedText,
        linkAttachment: trimmedLinkAttachment,
      });

    const jobId = await ctx.db.insert("threadsPublishJobs", {
      workspaceId,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      mediaType,
      ...(finalText && finalText.length > 0 ? { text: finalText } : {}),
      storageIds,
      mediaUrls: storageIds.map(uploadUrlFor),
      contentTypes,
      ...(trimmedReplyToId && trimmedReplyToId.length > 0
        ? { replyToId: trimmedReplyToId }
        : {}),
      ...(replyControl ? { replyControl } : {}),
      ...(allowlistedCountryCodes && allowlistedCountryCodes.length > 0
        ? { allowlistedCountryCodes }
        : {}),
      ...(trimmedAltText && trimmedAltText.length > 0
        ? { altText: trimmedAltText }
        : {}),
      ...(finalLinkAttachment && finalLinkAttachment.length > 0
        ? { linkAttachment: finalLinkAttachment }
        : {}),

      ...(trimmedQuotePostId && trimmedQuotePostId.length > 0
        ? { quotePostId: trimmedQuotePostId }
        : {}),
      ...(trimmedTopicTag && trimmedTopicTag.length > 0
        ? { topicTag: trimmedTopicTag }
        : {}),
      ...(isSpoilerMedia !== undefined ? { isSpoilerMedia } : {}),
      ...(isGhostPost !== undefined ? { isGhostPost } : {}),
      ...(enableReplyApprovals !== undefined ? { enableReplyApprovals } : {}),
      ...(crossreshareToIg !== undefined ? { crossreshareToIg } : {}),
      ...(crossreshareToIgDarkMode !== undefined
        ? { crossreshareToIgDarkMode }
        : {}),
      ...(trimmedLocationId && trimmedLocationId.length > 0
        ? { locationId: trimmedLocationId }
        : {}),
      ...(autoPublishText !== undefined ? { autoPublishText } : {}),
      ...(pollAttachment ? { pollAttachment } : {}),
      scheduledFor: dueAt,
      status: "queued",
      attempts: 0,
    });

    // Mapa fajl -> posao za autorizaciju javne /threads-upload/ rute
    for (const storageId of storageIds) {
      await ctx.db.insert("threadsPublishFiles", {
        workspaceId,
        storageId,
        jobId,
      });
    }

    await claimUploads(ctx, storageIds);

    // Posao bez scheduledFor se odmah šalje na izvršavanje
    if (scheduledFor === undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal.threadsPublish.runPublishJob,
        { jobId },
      );
    }

    return jobId;
  },
});

/**
 * Interno kreiranje posla objavljivanja (koristi se iz threadsReplies i threadsAutomations).
 */
export const createJobDirect = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.optional(v.id("users")),
    mediaType: mediaTypeValidator,
    text: v.optional(v.string()),
    storageIds: v.optional(v.array(v.id("_storage"))),
    scheduledFor: v.optional(v.number()),
    replyToId: v.optional(v.string()),
    replyControl: v.optional(replyControlValidator),
    allowlistedCountryCodes: v.optional(v.array(v.string())),
    altText: v.optional(v.string()),
    linkAttachment: v.optional(v.string()),
    quotePostId: v.optional(v.string()),
    topicTag: v.optional(v.string()),
    isSpoilerMedia: v.optional(v.boolean()),
    isGhostPost: v.optional(v.boolean()),
    enableReplyApprovals: v.optional(v.boolean()),
    crossreshareToIg: v.optional(v.boolean()),
    crossreshareToIgDarkMode: v.optional(v.boolean()),
    locationId: v.optional(v.string()),
    autoPublishText: v.optional(v.boolean()),
    pollAttachment: v.optional(pollAttachmentValidator),
  },
  returns: v.id("threadsPublishJobs"),
  handler: async (
    ctx,
    {
      workspaceId,
      userId,
      mediaType,
      text,
      storageIds = [],
      scheduledFor,
      replyToId,
      replyControl,
      allowlistedCountryCodes,
      altText,
      linkAttachment,
      quotePostId,
      topicTag,
      isSpoilerMedia,
      isGhostPost,
      enableReplyApprovals,
      crossreshareToIg,
      crossreshareToIgDarkMode,
      locationId,
      autoPublishText,
      pollAttachment,
    },
  ) => {
    const now = Date.now();

    const countProblem = checkItemCount(mediaType, storageIds.length);
    if (countProblem !== null) invalid(countProblem);

    const trimmedText = text?.trim();
    if (
      mediaType === "TEXT" &&
      (!trimmedText || trimmedText.length === 0) &&
      !pollAttachment
    ) {
      invalid("Tekstualna objava mora imati tekst ili anketu.");
    }

    const textProblem = checkText({ mediaType, text: trimmedText });
    if (textProblem !== null) invalid(textProblem);

    const trimmedTopicTag = topicTag?.trim();
    if (trimmedTopicTag) {
      const tagProblem = checkTopicTag(trimmedTopicTag);
      if (tagProblem !== null) invalid(tagProblem);
    }

    const trimmedLinkAttachment = linkAttachment?.trim();
    if (trimmedLinkAttachment) {
      const linkProblem = checkLinkAttachment({
        mediaType,
        linkAttachment: trimmedLinkAttachment,
      });
      if (linkProblem !== null) invalid(linkProblem);
    }

    if (pollAttachment) {
      const pollProblem = checkPollAttachment({ mediaType, pollAttachment });
      if (pollProblem !== null) invalid(pollProblem);
    }

    const trimmedReplyToId = replyToId?.trim();
    const trimmedAltText = altText?.trim();
    const trimmedQuotePostId = quotePostId?.trim();
    const trimmedLocationId = locationId?.trim();
    const dueAt = scheduledFor ?? now;

    // Zamena linkova ka našim domenima sa /r/ praćenim linkovima pre kreiranja posla (TH10)
    const { text: finalText, linkAttachment: finalLinkAttachment } =
      await trackControlledUrls(ctx, workspaceId, {
        text: trimmedText,
        linkAttachment: trimmedLinkAttachment,
      });

    const jobId = await ctx.db.insert("threadsPublishJobs", {
      workspaceId,
      ...(userId ? { createdBy: userId } : {}),
      createdAt: now,
      updatedAt: now,
      mediaType,
      ...(finalText && finalText.length > 0 ? { text: finalText } : {}),
      storageIds,
      mediaUrls: storageIds.map(uploadUrlFor),
      contentTypes: [],
      ...(trimmedReplyToId && trimmedReplyToId.length > 0
        ? { replyToId: trimmedReplyToId }
        : {}),
      ...(replyControl ? { replyControl } : {}),
      ...(allowlistedCountryCodes && allowlistedCountryCodes.length > 0
        ? { allowlistedCountryCodes }
        : {}),
      ...(trimmedAltText && trimmedAltText.length > 0
        ? { altText: trimmedAltText }
        : {}),
      ...(finalLinkAttachment && finalLinkAttachment.length > 0
        ? { linkAttachment: finalLinkAttachment }
        : {}),
      ...(trimmedQuotePostId && trimmedQuotePostId.length > 0
        ? { quotePostId: trimmedQuotePostId }
        : {}),
      ...(trimmedTopicTag && trimmedTopicTag.length > 0
        ? { topicTag: trimmedTopicTag }
        : {}),

      ...(isSpoilerMedia !== undefined ? { isSpoilerMedia } : {}),
      ...(isGhostPost !== undefined ? { isGhostPost } : {}),
      ...(enableReplyApprovals !== undefined ? { enableReplyApprovals } : {}),
      ...(crossreshareToIg !== undefined ? { crossreshareToIg } : {}),
      ...(crossreshareToIgDarkMode !== undefined
        ? { crossreshareToIgDarkMode }
        : {}),
      ...(trimmedLocationId && trimmedLocationId.length > 0
        ? { locationId: trimmedLocationId }
        : {}),
      ...(autoPublishText !== undefined ? { autoPublishText } : {}),
      ...(pollAttachment ? { pollAttachment } : {}),
      scheduledFor: dueAt,
      status: "queued",
      attempts: 0,
    });

    if (scheduledFor === undefined) {
      await ctx.scheduler.runAfter(
        0,
        internal.threadsPublish.runPublishJob,
        { jobId },
      );
    }

    return jobId;
  },
});


/**
 * Proverava da li već postoji aktivna objava sa istim skupom fajlova.
 */
async function hasLiveJobWithSameFiles(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  storageIds: Id<"_storage">[],
): Promise<boolean> {
  const wanted = new Set<string>(storageIds);

  for (const status of LIVE_STATUSES) {
    const rows = await ctx.db
      .query("threadsPublishJobs")
      .withIndex("by_workspace_status", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", status),
      )
      .order("desc")
      .take(LIVE_TAKE);

    for (const row of rows) {
      if (row.storageIds.length !== wanted.size) continue;
      if (row.storageIds.every((id) => wanted.has(id))) return true;
    }
  }
  return false;
}

/**
 * Da li je akcija koja je preuzela posao postala neaktivna (prekoračen prag).
 */
function isStaleClaim(job: Doc<"threadsPublishJobs">, now: number): boolean {
  const threshold =
    STALE_AFTER_MS[job.status as (typeof RUNNING_STATUSES)[number]];
  if (threshold === undefined) return false;
  return now - (job.claimedAt ?? job.updatedAt) > threshold;
}

// ── Otkazivanje i ponovno slanje ────────────────────────────────────────────

/**
 * Otkazuje objavu koja je na čekanju ili je zaglavljena u slanju.
 */
export const cancelJob = mutation({
  args: { jobId: v.id("threadsPublishJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const job = await ctx.db.get(jobId);
    if (job === null || job.workspaceId !== workspaceId) {
      invalid("Objava nije pronađena.");
    }

    const now = Date.now();
    const cancellable =
      job.status === "queued" ||
      ((job.status === "uploading" || job.status === "processing") &&
        isStaleClaim(job, now));

    if (!cancellable) {
      invalid(
        job.status === "published"
          ? "Objava je već otišla na Threads i ne može se povući odavde."
          : job.status === "publishing"
            ? "Objava je predata Threads-u i odgovor se još čeka — možda je već otišla. Sačekaj da se stanje razreši."
            : "Objava je već krenula i ne može se otkazati.",
      );
    }

    await ctx.db.patch(jobId, { status: "canceled", updatedAt: now });
    return null;
  },
});

/**
 * Ponovo šalje neuspelu objavu.
 */
export const retryJob = mutation({
  args: { jobId: v.id("threadsPublishJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const job = await ctx.db.get(jobId);
    if (job === null || job.workspaceId !== workspaceId) {
      invalid("Objava nije pronađena.");
    }
    if (job.status !== "failed") {
      invalid("Ponovo se šalju samo objave koje nisu uspele.");
    }
    if (job.filesDeletedAt !== undefined) {
      invalid(
        "Fajlovi ove objave su obrisani posle 24 h. Napravi novu objavu i dodaj ih ponovo.",
      );
    }

    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "queued",
      attempts: 0,
      error: undefined,
      scheduledFor: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(
      0,
      internal.threadsPublish.runPublishJob,
      { jobId },
    );
    return null;
  },
});


// ── Prikaz za korisnički interfejs ──────────────────────────────────────────

const jobViewValidator = v.object({
  _id: v.id("threadsPublishJobs"),
  mediaType: mediaTypeValidator,
  text: v.optional(v.string()),
  itemCount: v.number(),
  status: statusValidator,
  scheduledFor: v.optional(v.number()),
  attempts: v.number(),
  error: v.optional(v.string()),
  publishedMediaId: v.optional(v.string()),
  mediaIdUnconfirmed: v.optional(v.boolean()),
  publishedAt: v.optional(v.number()),
  filesDeleted: v.boolean(),
  cancellable: v.boolean(),
  topicTag: v.optional(v.string()),
  linkAttachment: v.optional(v.string()),
  pollAttachment: v.optional(pollAttachmentValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const LIVE_TAKE = 25;
const CLOSED_TAKE = 8;

/**
 * Lista nedavnih Threads objava za radni prostor.
 */
export const listJobs = query({
  args: {},
  returns: v.array(jobViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const groups: Array<[Doc<"threadsPublishJobs">["status"], number]> = [
      ["queued", LIVE_TAKE],
      ["uploading", LIVE_TAKE],
      ["processing", LIVE_TAKE],
      ["publishing", LIVE_TAKE],
      ["failed", LIVE_TAKE],
      ["published", CLOSED_TAKE],
      ["canceled", CLOSED_TAKE],
    ];

    const rows: Doc<"threadsPublishJobs">[] = [];
    for (const [status, take] of groups) {
      const batch = await ctx.db
        .query("threadsPublishJobs")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", status),
        )
        .order("desc")
        .take(take);
      rows.push(...batch);
    }

    const now = Date.now();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((row) => ({
        _id: row._id,
        mediaType: row.mediaType,
        ...(row.text !== undefined ? { text: row.text } : {}),
        itemCount: row.storageIds.length,
        status: row.status,
        ...(row.scheduledFor !== undefined
          ? { scheduledFor: row.scheduledFor }
          : {}),
        attempts: row.attempts,
        ...(row.error !== undefined ? { error: row.error } : {}),
        ...(row.publishedMediaId !== undefined
          ? { publishedMediaId: row.publishedMediaId }
          : {}),
        ...(row.mediaIdUnconfirmed === true
          ? { mediaIdUnconfirmed: true }
          : {}),
        ...(row.publishedAt !== undefined
          ? { publishedAt: row.publishedAt }
          : {}),
        filesDeleted: row.filesDeletedAt !== undefined,
        cancellable:
          row.status === "queued" ||
          ((row.status === "uploading" || row.status === "processing") &&
            isStaleClaim(row, now)),
        ...(row.topicTag !== undefined ? { topicTag: row.topicTag } : {}),
        ...(row.linkAttachment !== undefined
          ? { linkAttachment: row.linkAttachment }
          : {}),
        ...(row.pollAttachment !== undefined
          ? { pollAttachment: row.pollAttachment }
          : {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
  },
});

// ── Izvršavanje: Claim, tranzicije stanja, završetak ─────────────────────────

const claimValidator = v.object({
  workspaceId: v.id("workspaces"),
  connectionId: v.id("connections"),
  threadsUserId: v.string(),
  encryptedCredentials: v.string(),
  mediaType: mediaTypeValidator,
  text: v.optional(v.string()),
  mediaUrls: v.array(v.string()),
  contentTypes: v.array(v.string()),
  storageIds: v.array(v.id("_storage")),
  replyToId: v.optional(v.string()),
  replyControl: v.optional(replyControlValidator),
  allowlistedCountryCodes: v.optional(v.array(v.string())),
  altText: v.optional(v.string()),
  linkAttachment: v.optional(v.string()),
  quotePostId: v.optional(v.string()),
  topicTag: v.optional(v.string()),
  isSpoilerMedia: v.optional(v.boolean()),
  isGhostPost: v.optional(v.boolean()),
  enableReplyApprovals: v.optional(v.boolean()),
  crossreshareToIg: v.optional(v.boolean()),
  crossreshareToIgDarkMode: v.optional(v.boolean()),
  locationId: v.optional(v.string()),
  autoPublishText: v.optional(v.boolean()),
  pollAttachment: v.optional(pollAttachmentValidator),
  containerId: v.optional(v.string()),
  childContainerIds: v.optional(v.array(v.string())),
  processingSince: v.optional(v.number()),
  publishStartedAt: v.optional(v.number()),
  attempts: v.number(),
  fresh: v.boolean(),
  runToken: v.string(),
});

/**
 * Atomski preuzima vlasništvo nad poslom objavljivanja.
 */
export const claimJob = internalMutation({
  args: { jobId: v.id("threadsPublishJobs") },
  returns: v.union(v.null(), claimValidator),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (job === null) return null;
    if (job.status !== "queued" && job.status !== "processing") return null;

    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", job.workspaceId).eq("provider", "threads"),
      )
      .unique();

    const now = Date.now();
    if (connection === null || !connection.externalId) {
      await ctx.db.patch(jobId, {
        status: "failed",
        error:
          "Threads nije povezan. Poveži nalog u Podešavanjima pa napravi objavu ponovo.",
        updatedAt: now,
      });
      return null;
    }

    if (connection.status === "expired") {
      await ctx.db.patch(jobId, {
        status: "failed",
        error:
          "Pristupni token Threads naloga je istekao. Poveži nalog ponovo u Podešavanjima, pa pošalji objavu iz liste.",
        updatedAt: now,
      });
      return null;
    }

    // Backfill za threadsPublishFiles ako je potrebno
    if (job.filesDeletedAt === undefined && job.storageIds.length > 0) {
      const anyFileRow = await ctx.db
        .query("threadsPublishFiles")
        .withIndex("by_job", (q) => q.eq("jobId", jobId))
        .first();
      if (anyFileRow === null) {
        for (const storageId of job.storageIds) {
          await ctx.db.insert("threadsPublishFiles", {
            workspaceId: job.workspaceId,
            storageId,
            jobId,
          });
        }
      }
    }

    const fresh = job.status === "queued";
    const runToken = crypto.randomUUID();
    await ctx.db.patch(jobId, {
      claimedAt: now,
      runToken,
      ...(fresh
        ? {
            status: "uploading" as const,
            attempts: job.attempts + 1,
            error: undefined,
          }
        : {}),
      updatedAt: now,
    });

    return {
      workspaceId: job.workspaceId,
      connectionId: connection._id,
      threadsUserId: connection.externalId,
      encryptedCredentials: connection.encryptedCredentials,
      mediaType: job.mediaType,
      ...(job.text !== undefined ? { text: job.text } : {}),
      mediaUrls: job.mediaUrls,
      contentTypes: job.contentTypes,
      storageIds: job.storageIds,
      ...(job.replyToId !== undefined ? { replyToId: job.replyToId } : {}),
      ...(job.replyControl !== undefined
        ? { replyControl: job.replyControl }
        : {}),
      ...(job.allowlistedCountryCodes !== undefined
        ? { allowlistedCountryCodes: job.allowlistedCountryCodes }
        : {}),
      ...(job.altText !== undefined ? { altText: job.altText } : {}),
      ...(job.linkAttachment !== undefined
        ? { linkAttachment: job.linkAttachment }
        : {}),
      ...(job.quotePostId !== undefined
        ? { quotePostId: job.quotePostId }
        : {}),
      ...(job.topicTag !== undefined ? { topicTag: job.topicTag } : {}),
      ...(job.isSpoilerMedia !== undefined
        ? { isSpoilerMedia: job.isSpoilerMedia }
        : {}),
      ...(job.isGhostPost !== undefined
        ? { isGhostPost: job.isGhostPost }
        : {}),
      ...(job.enableReplyApprovals !== undefined
        ? { enableReplyApprovals: job.enableReplyApprovals }
        : {}),
      ...(job.crossreshareToIg !== undefined
        ? { crossreshareToIg: job.crossreshareToIg }
        : {}),
      ...(job.crossreshareToIgDarkMode !== undefined
        ? { crossreshareToIgDarkMode: job.crossreshareToIgDarkMode }
        : {}),
      ...(job.locationId !== undefined ? { locationId: job.locationId } : {}),
      ...(job.autoPublishText !== undefined
        ? { autoPublishText: job.autoPublishText }
        : {}),
      ...(job.pollAttachment !== undefined
        ? { pollAttachment: job.pollAttachment }
        : {}),
      ...(job.containerId !== undefined
        ? { containerId: job.containerId }
        : {}),
      ...(job.childContainerIds !== undefined
        ? { childContainerIds: job.childContainerIds }
        : {}),
      ...(job.processingSince !== undefined
        ? { processingSince: job.processingSince }
        : {}),
      ...(job.publishStartedAt !== undefined
        ? { publishStartedAt: job.publishStartedAt }
        : {}),
      attempts: fresh ? job.attempts + 1 : job.attempts,
      fresh,
      runToken,
    };
  },
});

/**
 * Parcijalno beleženje ID-jeva child kontejnera za Carousel.
 */
export const saveChildContainers = internalMutation({
  args: {
    jobId: v.id("threadsPublishJobs"),
    childContainerIds: v.array(v.string()),
    runToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { jobId, childContainerIds, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;
    await ctx.db.patch(jobId, { childContainerIds, updatedAt: Date.now() });
    return true;
  },
});

/**
 * Kontejner je kreiran i Threads ga obrađuje.
 */
export const markProcessing = internalMutation({
  args: {
    jobId: v.id("threadsPublishJobs"),
    containerId: v.string(),
    runToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { jobId, containerId, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;
    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "processing",
      containerId,
      processingSince: now,
      updatedAt: now,
    });
    return true;
  },
});

/**
 * Prelazak u status publishing neposredno PRE slanja publish poziva.
 */
export const markPublishing = internalMutation({
  args: { jobId: v.id("threadsPublishJobs"), runToken: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { jobId, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;

    const now = Date.now();
    await ctx.db.patch(jobId, {
      status: "publishing",
      publishStartedAt: now,
      claimedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

/**
 * Objava je uspešno objavljena na Threads-u.
 * Brišu se fajlovi iz storage-a i privremene veze iz threadsPublishFiles.
 */
export const markPublished = internalMutation({
  args: {
    jobId: v.id("threadsPublishJobs"),
    publishedMediaId: v.optional(v.string()),
    mediaIdUnconfirmed: v.optional(v.boolean()),
    connectionId: v.id("connections"),
    runToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (
    ctx,
    { jobId, publishedMediaId, mediaIdUnconfirmed, connectionId, runToken },
  ) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;

    const now = Date.now();
    for (const storageId of job.storageIds) {
      try {
        await ctx.storage.delete(storageId);
      } catch {
        // Ignoriši ako je već obrisan
      }
    }
    await deletePublishFileRows(ctx, jobId);

    await ctx.db.patch(jobId, {
      status: "published",
      ...(publishedMediaId !== undefined ? { publishedMediaId } : {}),
      ...(mediaIdUnconfirmed === true ? { mediaIdUnconfirmed: true } : {}),
      publishedAt: now,
      error: undefined,
      filesDeletedAt: now,
      updatedAt: now,
    });

    return true;
  },
});

/**
 * Obrada neuspešnog pokušaja slanja ili terminalne greške.
 */
export const markFailure = internalMutation({
  args: {
    jobId: v.id("threadsPublishJobs"),
    message: v.string(),
    terminal: v.optional(v.boolean()),
    runToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { jobId, message, terminal = false, runToken }) => {
    const job = await ctx.db.get(jobId);
    if (job === null || job.runToken !== runToken) return false;
    if (job.status === "published" || job.status === "canceled") return true;

    const now = Date.now();
    const delay = terminal ? null : retryDelayMs(job.attempts);

    const text =
      job.status === "publishing" && !terminal
        ? `${message} Objava je već bila predata Threads-u — proveri profil pre nego što je pošalješ ponovo.`
        : message;

    if (delay === null) {
      await ctx.db.patch(jobId, {
        status: "failed",
        error: text,
        updatedAt: now,
      });
      return true;
    }

    await ctx.db.patch(jobId, {
      status: "queued",
      error: text,
      scheduledFor: now + delay,
      updatedAt: now,
    });
    return true;
  },
});

// ── Pomoćni upiti za HTTP rutu /threads-upload/ ─────────────────────────────

/**
 * Vraća MIME tip sačuvanog fajla u storage-u.
 */
export const getUploadContentType = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { storageId }) => {
    const meta: StorageMetadata | null = await ctx.db.system.get(
      "_storage",
      storageId,
    );
    if (meta === null) return null;
    return meta.contentType ?? "application/octet-stream";
  },
});

// ── Cron poslovi ────────────────────────────────────────────────────────────

const DUE_BATCH = 10;
const RECLAIM_BATCH = 10;

/**
 * Svaki minut: deblokira zaglavljene poslove i pronalazi dospele objave.
 */
export const enqueueDueJobs = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();

    await reclaimStuckJobs(ctx, now);

    const due = await ctx.db
      .query("threadsPublishJobs")
      .withIndex("by_status_scheduled", (q) =>
        q.eq("status", "queued").lte("scheduledFor", now),
      )
      .take(DUE_BATCH);

    for (const job of due) {
      await ctx.scheduler.runAfter(
        0,
        internal.threadsPublish.runPublishJob,
        { jobId: job._id },
      );
    }

    return null;
  },
});


/**
 * Vraća u red poslove čije su akcije umrle držeći ih.
 */
async function reclaimStuckJobs(ctx: MutationCtx, now: number): Promise<void> {
  for (const status of RUNNING_STATUSES) {
    const stuck = await ctx.db
      .query("threadsPublishJobs")
      .withIndex("by_status_claimed", (q) =>
        q.eq("status", status).lt("claimedAt", now - STALE_AFTER_MS[status]),
      )
      .take(RECLAIM_BATCH);

    for (const job of stuck) {
      if (job.attempts >= MAX_ATTEMPTS) {
        await ctx.db.patch(job._id, {
          status: "failed",
          error:
            status === "publishing"
              ? "Objavljivanje je prekinuto i nije se razrešilo posle svih pokušaja. Objava je možda otišla — proveri profil pre nego što je pošalješ ponovo."
              : "Slanje se prekidalo više puta i nije se završilo. Proveri fajl i pokušaj ponovo.",
          updatedAt: now,
        });
        continue;
      }

      await ctx.db.patch(job._id, {
        status: "queued",
        scheduledFor: now,
        updatedAt: now,
      });
    }
  }
}

const SWEEP_BATCH = 50;

/**
 * Svaki sat: oslobađa disk od fajlova završenih, otkazanih ili napuštenih poslova.
 */
export const sweepExpiredUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - UPLOAD_TTL_MS;

    const old = await ctx.db
      .query("threadsPublishJobs")
      .withIndex("by_pending_files_created", (q) =>
        q.eq("filesDeletedAt", undefined).lt("createdAt", cutoff),
      )
      .take(SWEEP_BATCH);

    for (const job of old) {
      // 1. Zakazana objava čije vreme još nije došlo se ne dira
      if (job.status === "queued" && (job.scheduledFor ?? 0) > now) continue;

      // 2. Napuštena objava čiji je termin prošao pre više od 7 dana
      const due = job.scheduledFor ?? job.createdAt;
      if (isUnfinished(job.status) && now - due > ABANDONED_AFTER_DUE_MS) {
        await ctx.db.patch(job._id, {
          status: "failed",
          error:
            job.status === "publishing"
              ? "Zakazano vreme je prošlo pre više od 7 dana i objavljivanje se nikada nije razrešilo. Objava je možda otišla — proveri profil."
              : "Zakazano vreme je prošlo pre više od 7 dana, a objava nikada nije otišla.",
          updatedAt: now,
        });
        await deleteJobFiles(ctx, job);
        continue;
      }

      // 3. Završeni poslovi
      if (
        job.status === "failed" ||
        job.status === "canceled" ||
        job.status === "published" ||
        job.status === "draft"
      ) {
        await deleteJobFiles(ctx, job);
      }
    }

    await sweepOrphanedUploads(ctx, cutoff);
    return null;
  },
});

function isUnfinished(status: Doc<"threadsPublishJobs">["status"]): boolean {
  return (
    status === "queued" ||
    status === "uploading" ||
    status === "processing" ||
    status === "publishing"
  );
}

async function sweepOrphanedUploads(
  ctx: MutationCtx,
  cutoff: number,
): Promise<void> {
  const orphans = await ctx.db
    .query("threadsPublishUploads")
    .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
    .take(SWEEP_BATCH);

  for (const orphan of orphans) {
    try {
      await ctx.storage.delete(orphan.storageId);
    } catch {
      // Već obrisan
    }
    await ctx.db.delete(orphan._id);
  }
}

async function deleteJobFiles(
  ctx: MutationCtx,
  job: Doc<"threadsPublishJobs">,
): Promise<void> {
  for (const storageId of job.storageIds) {
    try {
      await ctx.storage.delete(storageId);
    } catch {
      // Već obrisan
    }
  }
  await deletePublishFileRows(ctx, job._id);

  const now = Date.now();
  await ctx.db.patch(job._id, { filesDeletedAt: now, updatedAt: now });
}

export async function deletePublishFileRows(
  ctx: MutationCtx,
  jobId: Id<"threadsPublishJobs">,
): Promise<void> {
  const rows = await ctx.db
    .query("threadsPublishFiles")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

// ── Konekcija i autorizacija za akcije ──────────────────────────────────────

/**
 * Vraća Threads konekciju sa šifrovanim tokenima za dati workspace.
 */
export const getConnectionForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(
    v.null(),
    v.object({
      connectionId: v.id("connections"),
      threadsUserId: v.optional(v.string()),
      encryptedCredentials: v.string(),
      status: connectionStatusValidator,
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const connection = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", "threads"),
      )
      .unique();
    if (connection === null) return null;
    return {
      connectionId: connection._id,
      ...(connection.externalId !== undefined
        ? { threadsUserId: connection.externalId }
        : {}),
      encryptedCredentials: connection.encryptedCredentials,
      status: connection.status,
    };
  },
});

/**
 * Vraća workspace ID korisnika za akciju.
 */
export const membershipForAction = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.null(), v.object({ workspaceId: v.id("workspaces") })),
  handler: async (ctx, { userId }) => {
    const membership = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (membership === null) return null;
    return { workspaceId: membership.workspaceId };
  },
});

export type { ThreadsPublishMediaType };
