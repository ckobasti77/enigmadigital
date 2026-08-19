import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { decryptCredentials } from "./lib/crypto";
import {
  buildVideosDeleteUrl,
  buildVideosListUrl,
  buildVideosUpdateUrl,
  fetchAccessToken,
  parseYouTubeCredentials,
} from "./lib/youtubeApi";
import {
  QUOTA_COST,
  QUOTA_MEDIA_EXHAUSTED_MESSAGE,
  canAffordMedia,
} from "./lib/ytQuota";
import { ytRequest } from "./ytMedia";
import type { MediaContext } from "./ytMedia";

/**
 * Editing and deleting videos (Y7). Default V8 runtime — `fetch` and Web
 * Crypto are all this needs.
 *
 * Both actions here change something on the channel that nobody can undo for
 * the operator afterwards, so both leave a `ytMediaJobs` row, both work
 * against the media quota ceiling rather than the full budget, and both keep
 * the local `ytVideoStats` row in step so the screen does not disagree with
 * YouTube until the next sync.
 */

const privacyStatusValidator = v.union(
  v.literal("public"),
  v.literal("unlisted"),
  v.literal("private"),
);

type PrivacyStatus = "public" | "unlisted" | "private";

// ── limits YouTube enforces, checked here so the call never goes out ─────────

/** Longer titles are rejected outright. */
const TITLE_MAX = 100;
/** Longer descriptions are rejected outright. */
const DESCRIPTION_MAX = 5000;
/**
 * All tags joined by a comma may not exceed this. It is a limit on the TOTAL,
 * not on any single tag, and a dozen ordinary tags already reach it — which is
 * why it is counted before sending rather than discovered from a 400.
 */
const TAGS_TOTAL_MAX = 500;

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

// ── local mirror ─────────────────────────────────────────────────────────────

/**
 * Keep the `ytVideoStats` row in step with what was just written to YouTube.
 *
 * Only the title: it is the one edited field the screen actually shows, and
 * waiting for the next sync to catch up would make the grid look like the save
 * never happened.
 */
export const patchVideoTitle = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    videoId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, videoId, title }) => {
    const row = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_video", (q) =>
        q.eq("workspaceId", workspaceId).eq("videoId", videoId),
      )
      .first();
    if (row !== null) await ctx.db.patch(row._id, { title });
    return null;
  },
});

/** Drop the local row for a video that no longer exists on YouTube. */
export const deleteVideoRow = internalMutation({
  args: { workspaceId: v.id("workspaces"), videoId: v.string() },
  returns: v.null(),
  handler: async (ctx, { workspaceId, videoId }) => {
    const row = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_video", (q) =>
        q.eq("workspaceId", workspaceId).eq("videoId", videoId),
      )
      .first();
    if (row !== null) await ctx.db.delete(row._id);
    return null;
  },
});

/** The stored title, so the job row says which video was meant. */
export const loadVideoTitle = internalQuery({
  args: { workspaceId: v.id("workspaces"), videoId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { workspaceId, videoId }) => {
    const row = await ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_video", (q) =>
        q.eq("workspaceId", workspaceId).eq("videoId", videoId),
      )
      .first();
    return row?.title ?? null;
  },
});

// ── the metadata edit ────────────────────────────────────────────────────────

/** What the Data API gives back for `part=snippet,status` on one video. */
type VideoResource = {
  id?: string;
  snippet?: {
    channelId?: string;
    title?: string;
    description?: string;
    tags?: string[];
    categoryId?: string;
    defaultLanguage?: string;
    defaultAudioLanguage?: string;
  };
  status?: {
    privacyStatus?: string;
    license?: string;
    embeddable?: boolean;
    publicStatsViewable?: boolean;
    publishAt?: string;
    madeForKids?: boolean;
    selfDeclaredMadeForKids?: boolean;
  };
};

type MetadataPatch = {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: PrivacyStatus;
};

/**
 * Trim and check the operator's changes before a single unit is spent.
 *
 * Only the fields actually present are validated: an absent field means "leave
 * this alone", which is not the same as an empty one. Sending an empty
 * description clears the description, and that has to stay possible.
 */
function normalizeMetadataInput(args: MetadataPatch): MetadataPatch {
  const patch: MetadataPatch = {};

  if (args.title !== undefined) {
    const title = args.title.trim();
    if (title.length === 0) invalid("Naslov videa ne može biti prazan.");
    if (title.length > TITLE_MAX) {
      invalid(`Naslov može imati najviše ${TITLE_MAX} znakova.`);
    }
    patch.title = title;
  }

  if (args.description !== undefined) {
    if (args.description.length > DESCRIPTION_MAX) {
      invalid(`Opis može imati najviše ${DESCRIPTION_MAX} znakova.`);
    }
    patch.description = args.description;
  }

  if (args.tags !== undefined) {
    const tags: string[] = [];
    for (const raw of args.tags) {
      const tag = raw.trim();
      if (tag.length === 0) continue;
      if (!tags.includes(tag)) tags.push(tag);
    }
    // YouTube counts the tags as one comma-joined string, so the limit is on
    // their sum and not on any single tag.
    const total = tags.join(",").length;
    if (total > TAGS_TOTAL_MAX) {
      invalid(
        `Tagovi zajedno mogu imati najviše ${TAGS_TOTAL_MAX} znakova — trenutno ih ima ${total}. Ukloni neki tag.`,
      );
    }
    patch.tags = tags;
  }

  if (args.categoryId !== undefined) {
    const categoryId = args.categoryId.trim();
    if (!/^\d+$/.test(categoryId)) invalid("Kategorija nije ispravna.");
    patch.categoryId = categoryId;
  }

  if (args.privacyStatus !== undefined) {
    patch.privacyStatus = args.privacyStatus;
  }

  if (Object.keys(patch).length === 0) invalid("Nema izmena za čuvanje.");
  return patch;
}

/**
 * Change a video's metadata — 51 units (1 read + 50 write).
 *
 * PROČITAJ OVO PRE NEGO ŠTO DIRAŠ OVU FUNKCIJU.
 *
 * `videos.update` NE radi delimičnu izmenu. Šalje se ceo `snippet` objekat i
 * YouTube njime ZAMENJUJE postojeći. Ako pošalješ samo `title`, video ostaje
 * bez opisa, bez tagova i bez kategorije — trajno, bez upozorenja. To je
 * greška koja uništi tuđi rad i ne može da se vrati.
 *
 * Zato je redosled ovde obavezan:
 *   1. `videos.list?part=snippet,status&id=<videoId>` (1 jedinica)
 *   2. uzmi postojeći `snippet`
 *   3. preko njega primeni SAMO polja koja je operater promenio
 *   4. tek onda pošalji `videos.update` sa kompletnim, spojenim `snippet`-om
 *
 * `categoryId` je obavezan u `snippet`-u pri update-u. Ako ga nema u odgovoru,
 * ova funkcija prekida sa greškom umesto da pošalje nepotpun snippet.
 *
 * Isto pravilo važi i za `status`: on se šalje samo kada se privatnost stvarno
 * menja, i tada se ostala polja (licenca, ugrađivanje, oznaka za decu) prenose
 * iz pročitanog resursa — inače bi ih update obrisao isto tako tiho.
 */
export const updateVideoMetadata = action({
  args: {
    videoId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    categoryId: v.optional(v.string()),
    privacyStatus: v.optional(privacyStatusValidator),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const videoId = args.videoId.trim();
    if (videoId.length === 0) invalid("Nedostaje ID videa.");

    // Membership is checked inside; null means no active YouTube connection.
    const context: MediaContext = await ctx.runQuery(
      internal.ytMedia.loadMediaContext,
      {},
    );
    if (context === null) {
      invalid("Prvo poveži YouTube nalog u Podešavanjima.");
    }
    const { workspaceId } = context;

    // Validated before the job row exists: a rejected title is the operator's
    // typo, not an attempted operation worth recording.
    const patch = normalizeMetadataInput(args);

    // The job row is opened before the affordability check so that a refusal
    // is on the record too — "nothing happened and here is why" is exactly the
    // case a log holding only successes would lose.
    const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
      workspaceId,
      kind: "metadata" as const,
      videoId,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
    });

    const cost = QUOTA_COST.videosList + QUOTA_COST.videosUpdate;
    if (!canAffordMedia(context.unitsUsed, cost)) {
      await ctx.runMutation(internal.ytMedia.finishJob, {
        jobId,
        status: "skipped_quota" as const,
        unitsSpent: 0,
        errorMessage: QUOTA_MEDIA_EXHAUSTED_MESSAGE,
      });
      invalid(QUOTA_MEDIA_EXHAUSTED_MESSAGE);
    }

    // Every metered call is booked the moment it returns, success or not:
    // Google charged for it either way, and an action that dies halfway must
    // not leave the counter thinking those units are still there.
    let spent = 0;
    const bookUnits = async (units: number): Promise<void> => {
      spent += units;
      await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
        workspaceId,
        units,
      });
    };

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

    // ── 1. read ──────────────────────────────────────────────────────────────
    const listRes = await ytRequest(
      buildVideosListUrl({ ids: [videoId], parts: ["snippet", "status"] }),
      token,
    );
    await bookUnits(QUOTA_COST.videosList);
    if (!listRes.ok) {
      return await failJob(
        `YouTube nije vratio podatke o videu: ${listRes.body}`,
      );
    }

    let existing: VideoResource | undefined;
    try {
      existing = (JSON.parse(listRes.body) as { items?: VideoResource[] })
        .items?.[0];
    } catch {
      return await failJob("YouTube je vratio neočekivan odgovor o videu.");
    }
    if (existing === undefined) {
      return await failJob(
        "Video nije pronađen na YouTube-u. Možda je obrisan ili ne pripada povezanom kanalu.",
      );
    }

    const snippet = existing.snippet ?? {};
    // The credential blob carries the channel id; when it does, a video from
    // another channel is refused here instead of by a 403 after the write.
    if (
      context.channelId.length > 0 &&
      (snippet.channelId ?? "").length > 0 &&
      snippet.channelId !== context.channelId
    ) {
      return await failJob(
        "Ovaj video ne pripada povezanom YouTube kanalu, pa se ne može menjati odavde.",
      );
    }

    // ── 2. merge ─────────────────────────────────────────────────────────────
    const categoryId = patch.categoryId ?? snippet.categoryId ?? "";
    if (categoryId.length === 0) {
      // Sending a snippet without it would strip the category off the video,
      // so stopping here is the only safe answer.
      return await failJob(
        "YouTube nije vratio kategoriju videa, a ona je obavezna pri izmeni. Izaberi kategoriju u formi i pokušaj ponovo.",
      );
    }

    const title = patch.title ?? snippet.title ?? "";
    if (title.length === 0) {
      return await failJob("YouTube nije vratio naslov videa. Unesi naslov.");
    }

    const mergedTags = patch.tags ?? snippet.tags;
    const mergedSnippet: Record<string, unknown> = {
      title,
      description: patch.description ?? snippet.description ?? "",
      categoryId,
      ...(mergedTags !== undefined ? { tags: mergedTags } : {}),
      ...(snippet.defaultLanguage !== undefined
        ? { defaultLanguage: snippet.defaultLanguage }
        : {}),
      ...(snippet.defaultAudioLanguage !== undefined
        ? { defaultAudioLanguage: snippet.defaultAudioLanguage }
        : {}),
    };

    const body: Record<string, unknown> = {
      id: videoId,
      snippet: mergedSnippet,
    };
    const parts = ["snippet"];

    if (patch.privacyStatus !== undefined) {
      const status = existing.status ?? {};
      parts.push("status");
      body.status = {
        privacyStatus: patch.privacyStatus,
        ...(status.license !== undefined ? { license: status.license } : {}),
        ...(status.embeddable !== undefined
          ? { embeddable: status.embeddable }
          : {}),
        ...(status.publicStatsViewable !== undefined
          ? { publicStatsViewable: status.publicStatsViewable }
          : {}),
        // `madeForKids` is read-only; `selfDeclaredMadeForKids` is what carries
        // it back, and losing it would silently re-declare the video as not
        // made for kids.
        selfDeclaredMadeForKids:
          status.selfDeclaredMadeForKids ?? status.madeForKids ?? false,
        // A scheduled publication only means anything while the video is
        // private; carrying it into a public one makes YouTube reject the call.
        ...(patch.privacyStatus === "private" && status.publishAt !== undefined
          ? { publishAt: status.publishAt }
          : {}),
      };
    }

    // ── 3. write ─────────────────────────────────────────────────────────────
    const updateRes = await ytRequest(buildVideosUpdateUrl(parts), token, {
      method: "PUT",
      body: JSON.stringify(body),
      contentType: "application/json",
    });
    await bookUnits(QUOTA_COST.videosUpdate);
    if (!updateRes.ok) {
      return await failJob(`Izmena videa nije uspela: ${updateRes.body}`);
    }

    if (patch.title !== undefined) {
      await ctx.runMutation(internal.ytVideos.patchVideoTitle, {
        workspaceId,
        videoId,
        title: patch.title,
      });
    }

    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "done" as const,
      unitsSpent: spent,
    });
    return null;
  },
});

// ── the delete ───────────────────────────────────────────────────────────────

/**
 * Take a video off the channel — 50 units.
 *
 * NEPOVRATNO. YouTube nema kantu za otpatke: posle ovoga videa nema ni u
 * Studiju, ni na linku, ni u statistici. Zato pozivalac MORA da traži potvrdu
 * pre nego što ovo pozove.
 *
 * Ownership is left to YouTube: `videos.delete` answers 403 for a video that
 * is not the caller's, and a `videos.list` first would spend a unit to learn
 * the same thing a moment earlier. That 403 is translated into a sentence that
 * says exactly what happened.
 */
export const deleteVideo = action({
  args: { videoId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
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

    const localTitle: string | null = await ctx.runQuery(
      internal.ytVideos.loadVideoTitle,
      { workspaceId, videoId },
    );

    const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
      workspaceId,
      kind: "metadata" as const,
      videoId,
      ...(localTitle !== null ? { title: localTitle } : {}),
    });

    if (!canAffordMedia(context.unitsUsed, QUOTA_COST.videosDelete)) {
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

    const res = await ytRequest(buildVideosDeleteUrl(videoId), token, {
      method: "DELETE",
    });
    spent = QUOTA_COST.videosDelete;
    await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
      workspaceId,
      units: spent,
    });

    if (!res.ok) {
      if (res.status === 403) {
        return await failJob(
          "Ovaj video ne pripada povezanom YouTube kanalu ili nalog nema dozvolu da ga obriše.",
        );
      }
      if (res.status === 404) {
        // Already gone: the local row is what is out of date, so it goes, and
        // the job row still says the delete itself found nothing.
        await ctx.runMutation(internal.ytVideos.deleteVideoRow, {
          workspaceId,
          videoId,
        });
        return await failJob(
          "Video ne postoji na YouTube-u — možda je već obrisan.",
        );
      }
      return await failJob(`Brisanje videa nije uspelo: ${res.body}`);
    }

    await ctx.runMutation(internal.ytVideos.deleteVideoRow, {
      workspaceId,
      videoId,
    });

    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "done" as const,
      unitsSpent: spent,
    });
    return null;
  },
});
