import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials } from "./lib/crypto";
import {
  createThreadsContainer,
  deleteThreadsPost,
  getThreadsContainerStatus,
  getThreadsPostsPage,
  getThreadsPublishingLimitDetailed,
  publishThreadsContainer,
  repostThreadsPost,
  type CreateThreadsContainerParams,
} from "./lib/threadsApi";
import { sanitizeThreadsError } from "./lib/threadsShared";
import {
  IMAGE_CONTENT_TYPES,
  PROCESSING_DEADLINE_MS,
  type ThreadsPublishMediaType,
} from "./lib/threadsPublish";

/**
 * ============================================================================
 * THREADS PUBLISHING — IZVRŠNI SLOJ I POZIVI KA META API-JU (V8 Runtime)
 * ============================================================================
 *
 * Izvršavanje poslova objavljivanja na Threads platformi (§4.1, §4.2, §4.3, §8).
 * Svi pozivi se obavljaju u V8 runtime-u uz strogu atomsku zaštitu stanja:
 *
 *   1. claimJob (atomsko preuzimanje i mintovanje fence tokena `runToken`)
 *   2. Provera rate-limit kvote (250 objava / 24h) PRE prvog poziva ka Meta
 *   3. POST /{user-id}/threads (kreiranje child kontejnera za Carousel ili glavnog)
 *   4. Čekanje (30s inicijalno, zatim provera statusa jednom u minutu do 5 min)
 *   5. markPublishing se upisuje PRE slanja POST /{user-id}/threads_publish
 *   6. Oporavak (matchPublishedMedia) ukoliko je publishStartedAt već postavljen
 *   7. markPublished po uspehu (brisanje fajlova i oslobađanje storage-a)
 * ============================================================================
 */

class PublishError extends Error {
  readonly terminal: boolean;
  constructor(message: string, terminal = false) {
    super(message);
    this.name = "PublishError";
    this.terminal = terminal;
  }
}

class LostJobError extends Error {
  constructor() {
    super("Posao je preuzeo drugi pokušaj.");
    this.name = "LostJobError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Vremenski okviri za proveru i oporavak (§4.1) ───────────────────────────

/** Inicijalno čekanje pre prve provere statusa kontejnera (§4.1: 30 sekundi). */
const INITIAL_POLL_WAIT_MS = 30_000;

/** Interval anketiranja statusa kontejnera (§4.1: jednom u minutu). */
const POLL_INTERVAL_MS = 60_000;

/** Maksimalno vreme anketiranja unutar jednog action pokretanja (§4.1: do 5 minuta). */
const POLL_BUDGET_MS = 5 * 60_000;

/** Vremenski prozor pre i posle slanja za pretragu izgubljenog media ID-ja. */
const RECOVERY_SLACK_MS = 5 * 60_000;
const RECOVERY_FORWARD_MS = 15 * 60_000;
const RECOVERY_LOOKBACK = 10;

type Claim = {
  workspaceId: Id<"workspaces">;
  connectionId: Id<"connections">;
  threadsUserId: string;
  encryptedCredentials: string;
  mediaType: ThreadsPublishMediaType;
  text?: string;
  mediaUrls: string[];
  contentTypes: string[];
  storageIds: Id<"_storage">[];
  replyToId?: string;
  replyControl?:
    | "everyone"
    | "accounts_you_follow"
    | "mentioned_only"
    | "parent_post_author_only"
    | "followers_only";
  allowlistedCountryCodes?: string[];
  altText?: string;
  linkAttachment?: string;
  quotePostId?: string;
  topicTag?: string;
  isSpoilerMedia?: boolean;
  isGhostPost?: boolean;
  enableReplyApprovals?: boolean;
  crossreshareToIg?: boolean;
  crossreshareToIgDarkMode?: boolean;
  locationId?: string;
  autoPublishText?: boolean;
  pollAttachment?: {
    option_a: string;
    option_b: string;
    option_c?: string;
    option_d?: string;
  };
  containerId?: string;
  childContainerIds?: string[];
  processingSince?: number;
  publishStartedAt?: number;
  attempts: number;
  fresh: boolean;
  runToken: string;
};

type ContainerVerdict = "ready" | "already-published" | "waiting";

// ── Anketiranje statusa kontejnera ──────────────────────────────────────────

async function awaitContainer(
  ctx: ActionCtx,
  jobId: Id<"threadsPublishJobs">,
  containerId: string,
  token: string,
  processingSince: number,
): Promise<ContainerVerdict> {
  // 1. Inicijalno preporučeno čekanje od 30 sekundi (§4.1)
  await sleep(INITIAL_POLL_WAIT_MS);

  const runDeadline = Date.now() + POLL_BUDGET_MS;

  for (;;) {
    let res: {
      id: string;
      status:
        | "FINISHED"
        | "IN_PROGRESS"
        | "ERROR"
        | "EXPIRED"
        | "PUBLISHED"
        | "UNKNOWN";
      errorMessage?: string;
    };

    try {
      res = await getThreadsContainerStatus({
        accessToken: token,
        containerId,
      });
    } catch (err) {
      throw new PublishError(
        `Threads nije odgovorio na proveru statusa kontejnera: ${sanitizeThreadsError(err)}`,
      );
    }

    if (res.status === "FINISHED") return "ready";
    if (res.status === "PUBLISHED") return "already-published";

    if (res.status === "ERROR") {
      const detail = res.errorMessage?.trim();
      throw new PublishError(
        detail && detail.length > 0
          ? `Threads je odbio kontejner: ${detail}`
          : "Threads je odbio fajl pri obradi. Proveri format i parametre objave.",
        true,
      );
    }

    if (res.status === "EXPIRED") {
      throw new PublishError(
        "Threads kontejner je istekao pre objave (kontejneri važe 24 h).",
        true,
      );
    }

    if (Date.now() - processingSince > PROCESSING_DEADLINE_MS) {
      throw new PublishError(
        "Threads obrađuje kontejner duže od 30 minuta. Objava je zaustavljena — pokušaj ponovo.",
        true,
      );
    }

    // Ako ističe budžet trenutnog action poziva, zakaži nastavak
    if (Date.now() + POLL_INTERVAL_MS >= runDeadline) {
      await ctx.scheduler.runAfter(
        0,
        internal.threadsPublish.runPublishJob,
        { jobId },
      );
      return "waiting";
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

// ── Oporavak media ID-ja za objave čiji je odgovor izgubljen ────────────────

export function matchPublishedMedia(
  items: Array<{ id?: string; text?: string; timestamp?: string }>,
  params: { text?: string; since: number },
): string | null {
  const wanted = params.text?.trim();
  if (wanted === undefined || wanted.length === 0) return null;

  const floor = params.since - RECOVERY_SLACK_MS;
  const ceiling = params.since + RECOVERY_FORWARD_MS;

  const candidates = items.filter((item) => {
    if (!item.id) return false;
    const at = Date.parse(item.timestamp ?? "");
    if (!Number.isFinite(at) || at < floor || at > ceiling) return false;
    return (item.text ?? "").trim() === wanted;
  });

  return candidates.length === 1 ? String(candidates[0].id) : null;
}

async function recoverPublishedMediaId(
  claim: Claim,
  token: string,
  since: number,
): Promise<string | null> {
  try {
    const page = await getThreadsPostsPage({
      accessToken: token,
      userId: claim.threadsUserId,
      since: Math.floor((since - RECOVERY_SLACK_MS) / 1000),
      limit: RECOVERY_LOOKBACK,
    });
    const items = page.data ?? [];
    return matchPublishedMedia(items, {
      ...(claim.text !== undefined ? { text: claim.text } : {}),
      since,
    });
  } catch {
    return null;
  }
}

async function finishAsRecovered(
  ctx: ActionCtx,
  params: {
    jobId: Id<"threadsPublishJobs">;
    claim: Claim;
    token: string;
    since: number;
    postKnownLive: boolean;
  },
): Promise<void> {
  const { jobId, claim, token, since, postKnownLive } = params;

  const recovered = await recoverPublishedMediaId(claim, token, since);

  if (recovered !== null) {
    await ctx.runMutation(internal.threadsPublishStore.markPublished, {
      jobId,
      publishedMediaId: recovered,
      connectionId: claim.connectionId,
      runToken: claim.runToken,
    });
    return;
  }

  if (postKnownLive) {
    await ctx.runMutation(internal.threadsPublishStore.markPublished, {
      jobId,
      mediaIdUnconfirmed: true,
      connectionId: claim.connectionId,
      runToken: claim.runToken,
    });
    return;
  }

  await ctx.runMutation(internal.threadsPublishStore.markFailure, {
    jobId,
    message:
      "Ne mogu da potvrdim da li je objava otišla na Threads — proveri profil pa označi ručno.",
    terminal: true,
    runToken: claim.runToken,
  });
}

// ── Glavna akcija za objavljivanje ──────────────────────────────────────────

export const runPublishJob = internalAction({
  args: { jobId: v.id("threadsPublishJobs") },
  returns: v.null(),
  handler: async (ctx, { jobId }): Promise<null> => {
    // a) Atomsko preuzimanje posla
    const claim: Claim | null = await ctx.runMutation(
      internal.threadsPublishStore.claimJob,
      { jobId },
    );
    if (claim === null) return null;

    let token: string;
    try {
      token = await decryptCredentials(claim.encryptedCredentials);
    } catch {
      await ctx.runMutation(internal.threadsPublishStore.markFailure, {
        jobId,
        message:
          "Pristupni token Threads naloga se ne može dešifrovati. Poveži nalog ponovo u Podešavanjima.",
        terminal: true,
        runToken: claim.runToken,
      });
      return null;
    }

    try {
      // b) Provera rate limit kvote PRE prvog poziva (§8: 250 objava na 24h)
      let quota;
      try {
        quota = await getThreadsPublishingLimitDetailed({
          accessToken: token,
          userId: claim.threadsUserId,
        });
      } catch (err) {
        throw new PublishError(
          `Ne mogu da proverim Threads kvotu pre objavljivanja. Slanje je prekinuto radi zaštite naloga: ${sanitizeThreadsError(err)}`,
          false,
        );
      }

      const postsUsed = quota.publishing?.used;
      const postsTotal = quota.publishing?.total;

      // Poziv je uspeo, ali odgovor bez `used`/`total` NIJE pročitana kvota.
      // Nastaviti ovde značilo bi objaviti ne znajući koliko je prostora
      // ostalo — a nepoznato stanje nije dozvola da se nastavi. Greška je
      // NAMERNO neterminalna: kvota se čita ponovo pri sledećem pokušaju.
      if (postsUsed === undefined || postsTotal === undefined) {
        throw new PublishError(
          "Threads je odgovorio na proveru kvote, ali bez podataka o iskorišćenosti. Objava je zaustavljena dok se kvota ne pročita.",
          false,
        );
      }

      if (postsUsed >= postsTotal) {
        throw new PublishError(
          `Dnevna kvota za objavljivanje na Threads-u je popunjena (${postsUsed}/${postsTotal}). Objava je vraćena na čekanje za sledeći prozor.`,
          false,
        );
      }


      let containerId = claim.containerId;
      let processingSince = claim.processingSince ?? Date.now();

      // c) Kreiranje kontejnera ako već ne postoji
      if (containerId === undefined) {
        if (claim.mediaType === "CAROUSEL") {
          // Carousel: kreiranje svakog slajda kao child kontejnera
          const childIds = [...(claim.childContainerIds ?? [])];

          for (
            let index = childIds.length;
            index < claim.mediaUrls.length;
            index++
          ) {
            const contentType = claim.contentTypes[index] ?? "";
            const isImage = IMAGE_CONTENT_TYPES.includes(
              contentType.toLowerCase().trim(),
            );

            const childParams: CreateThreadsContainerParams = {
              media_type: isImage ? "IMAGE" : "VIDEO",
              is_carousel_item: true,
              ...(isImage
                ? { image_url: claim.mediaUrls[index] }
                : { video_url: claim.mediaUrls[index] }),
            };

            const child = await createThreadsContainer({
              accessToken: token,
              userId: claim.threadsUserId,
              params: childParams,
            });

            if (!child.id) {
              throw new PublishError(
                `Threads nije vratio kontejner za ${index + 1}. fajl u carousel-u.`,
              );
            }

            childIds.push(String(child.id));
            const held = await ctx.runMutation(
              internal.threadsPublishStore.saveChildContainers,
              {
                jobId,
                childContainerIds: childIds,
                runToken: claim.runToken,
              },
            );
            if (!held) throw new LostJobError();
          }

          // Roditeljski CAROUSEL kontejner
          const parentParams: CreateThreadsContainerParams = {
            media_type: "CAROUSEL",
            children: childIds.join(","),
            ...(claim.text ? { text: claim.text } : {}),
            ...(claim.replyToId ? { reply_to_id: claim.replyToId } : {}),
            ...(claim.replyControl ? { reply_control: claim.replyControl } : {}),
            ...(claim.allowlistedCountryCodes &&
            claim.allowlistedCountryCodes.length > 0
              ? {
                  allowlisted_country_codes:
                    claim.allowlistedCountryCodes.join(","),
                }
              : {}),
            ...(claim.quotePostId ? { quote_post_id: claim.quotePostId } : {}),
            ...(claim.topicTag ? { topic_tag: claim.topicTag } : {}),
            ...(claim.isSpoilerMedia !== undefined
              ? { is_spoiler_media: claim.isSpoilerMedia }
              : {}),
            ...(claim.isGhostPost !== undefined
              ? { is_ghost_post: claim.isGhostPost }
              : {}),
            ...(claim.enableReplyApprovals !== undefined
              ? { enable_reply_approvals: claim.enableReplyApprovals }
              : {}),
            ...(claim.crossreshareToIg !== undefined
              ? { crossreshare_to_ig: claim.crossreshareToIg }
              : {}),
            ...(claim.crossreshareToIgDarkMode !== undefined
              ? {
                  crossreshare_to_ig_dark_mode:
                    claim.crossreshareToIgDarkMode,
                }
              : {}),
            ...(claim.locationId ? { location_id: claim.locationId } : {}),
          };

          const parent = await createThreadsContainer({
            accessToken: token,
            userId: claim.threadsUserId,
            params: parentParams,
          });

          if (!parent.id) {
            throw new PublishError("Threads nije vratio kontejner za carousel.");
          }
          containerId = String(parent.id);
        } else {
          // Single-post: TEXT, IMAGE ili VIDEO
          const singleParams: CreateThreadsContainerParams = {
            media_type: claim.mediaType,
            ...(claim.text ? { text: claim.text } : {}),
            ...(claim.mediaType === "IMAGE" && claim.mediaUrls[0]
              ? { image_url: claim.mediaUrls[0] }
              : {}),
            ...(claim.mediaType === "VIDEO" && claim.mediaUrls[0]
              ? { video_url: claim.mediaUrls[0] }
              : {}),
            ...(claim.replyToId ? { reply_to_id: claim.replyToId } : {}),
            ...(claim.replyControl ? { reply_control: claim.replyControl } : {}),
            ...(claim.allowlistedCountryCodes &&
            claim.allowlistedCountryCodes.length > 0
              ? {
                  allowlisted_country_codes:
                    claim.allowlistedCountryCodes.join(","),
                }
              : {}),
            ...(claim.altText ? { alt_text: claim.altText } : {}),
            ...(claim.linkAttachment
              ? { link_attachment: claim.linkAttachment }
              : {}),
            ...(claim.quotePostId ? { quote_post_id: claim.quotePostId } : {}),
            ...(claim.pollAttachment
              ? { poll_attachment: claim.pollAttachment }
              : {}),
            ...(claim.autoPublishText !== undefined
              ? { auto_publish_text: claim.autoPublishText }
              : {}),
            ...(claim.topicTag ? { topic_tag: claim.topicTag } : {}),
            ...(claim.isSpoilerMedia !== undefined
              ? { is_spoiler_media: claim.isSpoilerMedia }
              : {}),
            ...(claim.isGhostPost !== undefined
              ? { is_ghost_post: claim.isGhostPost }
              : {}),
            ...(claim.enableReplyApprovals !== undefined
              ? { enable_reply_approvals: claim.enableReplyApprovals }
              : {}),
            ...(claim.crossreshareToIg !== undefined
              ? { crossreshare_to_ig: claim.crossreshareToIg }
              : {}),
            ...(claim.crossreshareToIgDarkMode !== undefined
              ? {
                  crossreshare_to_ig_dark_mode:
                    claim.crossreshareToIgDarkMode,
                }
              : {}),
            ...(claim.locationId ? { location_id: claim.locationId } : {}),
          };

          const single = await createThreadsContainer({
            accessToken: token,
            userId: claim.threadsUserId,
            params: singleParams,
          });

          if (!single.id) {
            throw new PublishError("Threads nije vratio kontejner za objavu.");
          }
          containerId = String(single.id);

          // d) Za TEXT sa autoPublishText=true: Threads preskače drugi korak i
          // objava je već živa (§4.1). ALI: ono što je vraćeno je id KONTEJNERA,
          // a da li je taj id istovremeno i id objave nije nigde dokazano
          // (Dodatak B.6). Upisati ga kao `publishedMediaId` značilo bi
          // predstaviti pretpostavku kao činjenicu — i svaki kasniji poziv
          // uvida nad tim id-jem bi tiho vraćao ništa.
          //
          // Zato se ide istim putem kao kod izgubljenog odgovora: objava se
          // TRAŽI na profilu i id se upisuje samo ako je nedvosmisleno
          // pronađena; u suprotnom se beleži `mediaIdUnconfirmed`. Post je
          // ovde sigurno živ, pa `postKnownLive: true`.
          if (claim.mediaType === "TEXT" && claim.autoPublishText === true) {
            await finishAsRecovered(ctx, {
              jobId,
              claim,
              token,
              since: Date.now(),
              postKnownLive: true,
            });
            return null;
          }
        }

        processingSince = Date.now();
        const held = await ctx.runMutation(
          internal.threadsPublishStore.markProcessing,
          { jobId, containerId, runToken: claim.runToken },
        );
        if (!held) return null;
      } else if (claim.fresh) {
        processingSince = Date.now();
        const held = await ctx.runMutation(
          internal.threadsPublishStore.markProcessing,
          { jobId, containerId, runToken: claim.runToken },
        );
        if (!held) return null;
      }

      // e) Čekanje i anketiranje statusa obrade
      const verdict = await awaitContainer(
        ctx,
        jobId,
        containerId,
        token,
        processingSince,
      );
      if (verdict === "waiting") return null;

      // f) Provera da li je publishStartedAt već postavljen (brava protiv dvostrukog objavljivanja)
      const alreadySent = claim.publishStartedAt !== undefined;
      if (verdict === "already-published" || alreadySent) {
        await finishAsRecovered(ctx, {
          jobId,
          claim,
          token,
          since: claim.publishStartedAt ?? processingSince,
          postKnownLive: verdict === "already-published",
        });
        return null;
      }

      // markPublishing se upisuje PRE slanja threads_publish poziva
      const heldPublishing = await ctx.runMutation(
        internal.threadsPublishStore.markPublishing,
        { jobId, runToken: claim.runToken },
      );
      if (!heldPublishing) return null;

      // Slanje POST /{user-id}/threads_publish poziva
      const published = await publishThreadsContainer({
        accessToken: token,
        userId: claim.threadsUserId,
        creationId: containerId,
      });

      await ctx.runMutation(internal.threadsPublishStore.markPublished, {
        jobId,
        ...(published.id
          ? { publishedMediaId: String(published.id) }
          : { mediaIdUnconfirmed: true }),
        connectionId: claim.connectionId,
        runToken: claim.runToken,
      });
    } catch (err) {
      if (err instanceof LostJobError) return null;
      const terminal = err instanceof PublishError ? err.terminal : false;
      // OBAVEZNO kroz `sanitizeThreadsError`. Greške iz `lib/threadsApi.ts`
      // nose sirovu Meta poruku (`extractThreadsApiError`), a Meta ume da u
      // poruci VRATI vrednost koju smo joj poslali — 25.08.2026. je tako
      // `Invalid client_secret: THAA...` završio na ekranu. Ova poruka ide u
      // bazu i u UI, pa je ovo poslednje mesto gde se to može zaustaviti.
      const sanitized = sanitizeThreadsError(err);
      const message =
        sanitized.trim().length > 0
          ? sanitized
          : "Objavljivanje na Threads-u nije uspelo.";
      await ctx.runMutation(internal.threadsPublishStore.markFailure, {
        jobId,
        message,
        terminal,
        runToken: claim.runToken,
      });
    }

    return null;
  },
});

// ── Javne akcije za UI (§4.4, §8) ───────────────────────────────────────────

/**
 * Vraća trenutno stanje kvote objavljivanja za Threads nalog radnog prostora.
 */
export const publishingLimit = action({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    used: v.number(),
    total: v.number(),
    replyUsed: v.optional(v.number()),
    replyTotal: v.optional(v.number()),
    deleteUsed: v.optional(v.number()),
    deleteTotal: v.optional(v.number()),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
  ): Promise<{
    connected: boolean;
    used: number;
    total: number;
    replyUsed?: number;
    replyTotal?: number;
    deleteUsed?: number;
    deleteTotal?: number;
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
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      return { connected: false, used: 0, total: 250 };
    }

    let token: string;
    try {
      token = await decryptCredentials(connection.encryptedCredentials);
    } catch {
      return {
        connected: true,
        used: 0,
        total: 250,
        error: "Pristupni token se ne može pročitati.",
      };
    }

    try {
      const quota = await getThreadsPublishingLimitDetailed({
        accessToken: token,
        userId: connection.threadsUserId,
      });

      return {
        connected: true,
        used: quota.publishing?.used ?? 0,
        total: quota.publishing?.total ?? 250,
        ...(quota.reply?.used !== undefined
          ? { replyUsed: quota.reply.used }
          : {}),
        ...(quota.reply?.total !== undefined
          ? { replyTotal: quota.reply.total }
          : {}),
        ...(quota.delete?.used !== undefined
          ? { deleteUsed: quota.delete.used }
          : {}),
        ...(quota.delete?.total !== undefined
          ? { deleteTotal: quota.delete.total }
          : {}),
      };
    } catch (err) {
      return {
        connected: true,
        used: 0,
        total: 250,
        error: `Threads trenutno ne odgovara na pitanje o kvoti: ${sanitizeThreadsError(err)}`,
      };
    }
  },
});

/**
 * Repostuje postojeću objavu na profilu (§4.4).
 */
export const repostPost = action({
  args: { mediaId: v.string() },
  returns: v.object({
    success: v.boolean(),
    id: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { mediaId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);
    try {
      const res = await repostThreadsPost({ accessToken: token, mediaId });
      return { success: true, id: res.id };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});

/**
 * Briše objavu sa Threads-a uz proveru kvote brisanja (§4.4: 100 brisanja/24h).
 */
export const deletePost = action({
  args: { mediaId: v.string() },
  returns: v.object({
    success: v.boolean(),
    deletedId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, { mediaId }) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member = await ctx.runQuery(
      internal.threadsPublishStore.membershipForAction,
      { userId },
    );
    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const connection = await ctx.runQuery(
      internal.threadsPublishStore.getConnectionForWorkspace,
      { workspaceId: member.workspaceId },
    );
    if (connection === null || !connection.threadsUserId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads nalog nije povezan.",
      });
    }

    const token = await decryptCredentials(connection.encryptedCredentials);

    // Provera kvote za brisanje (100 u 24h)
    try {
      const quota = await getThreadsPublishingLimitDetailed({
        accessToken: token,
        userId: connection.threadsUserId,
      });
      if (
        quota.delete?.used !== undefined &&
        quota.delete?.total !== undefined &&
        quota.delete.used >= quota.delete.total
      ) {
        return {
          success: false,
          error: `Dnevna kvota za brisanje na Threads-u je popunjena (${quota.delete.used}/${quota.delete.total}). Pokušaj ponovo u sledećem prozoru.`,
        };
      }
    } catch {
      // Ako delete endpoint ne odgovara, dozvoli pokušaj brisanja
    }

    try {
      const res = await deleteThreadsPost({ accessToken: token, mediaId });
      return { success: res.success, deletedId: res.deleted_id };
    } catch (err) {
      return {
        success: false,
        error: sanitizeThreadsError(err),
      };
    }
  },
});
