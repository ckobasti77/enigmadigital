import { action, internalMutation, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import {
  buildPlaylistItemsInsertUrl,
  buildPlaylistsListUrl,
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
 * Playlists (Y8). Default V8 runtime.
 *
 * Dve operacije koje se razlikuju u ceni pedeset puta:
 *
 *   playlists.list         1 jedinica
 *   playlistItems.insert  50 jedinica
 *
 * Zato spisak plejlista stoji u tabeli `ytPlaylists` i padajući meni ga čita
 * odatle besplatno, a osvežavanje je dugme koje čovek pritisne — ne poll.
 * Dodavanje videa u plejlistu je, s druge strane, isto što i jedan odgovor na
 * komentar, pa ide kroz `canAffordMedia` (Y6) i ostavlja red u `ytMediaJobs`.
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

/** How many playlists one `playlists.list` page brings back. YouTube's max. */
const PLAYLISTS_PAGE_SIZE = 50;

// ── the cache ────────────────────────────────────────────────────────────────

const playlistValidator = v.object({
  playlistId: v.string(),
  title: v.string(),
  itemCount: v.number(),
});

/**
 * The cached playlists, by name — free to read.
 *
 * Empty when the workspace has never loaded them, which the dialog reads as
 * "fetch them once" rather than as "this channel has no playlists". The two
 * are told apart by the wording in the dropdown, never by claiming the second.
 */
export const playlists = query({
  args: {},
  returns: v.array(playlistValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);
    const rows = await ctx.db
      .query("ytPlaylists")
      .withIndex("by_workspace_playlist", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return rows
      .map((row) => ({
        playlistId: row.playlistId,
        title: row.title,
        itemCount: row.itemCount,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

/**
 * Replace the cached list with what YouTube just said.
 *
 * Rows that no longer come back are deleted rather than left behind: a
 * playlist that was removed on YouTube must not stay in the dropdown, because
 * choosing it would spend 50 units on a 404.
 */
export const cachePlaylists = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    playlists: v.array(
      v.object({
        playlistId: v.string(),
        title: v.string(),
        itemCount: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, playlists: fresh }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("ytPlaylists")
      .withIndex("by_workspace_playlist", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const byId = new Map(existing.map((row) => [row.playlistId, row]));

    for (const item of fresh) {
      const row = byId.get(item.playlistId);
      if (row === undefined) {
        await ctx.db.insert("ytPlaylists", {
          workspaceId,
          playlistId: item.playlistId,
          title: item.title,
          itemCount: item.itemCount,
          syncedAt: now,
        });
      } else {
        await ctx.db.patch(row._id, {
          title: item.title,
          itemCount: item.itemCount,
          syncedAt: now,
        });
        byId.delete(item.playlistId);
      }
    }

    // Whatever is left in the map did not come back from YouTube.
    for (const row of byId.values()) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * One more video in this playlist.
 *
 * Cosmetic and deliberately so: the count next to the name would otherwise
 * stay wrong until the next refresh, and a dropdown that says "12 videa" right
 * after adding the thirteenth looks like the add did not happen.
 */
export const bumpPlaylistCount = internalMutation({
  args: { workspaceId: v.id("workspaces"), playlistId: v.string() },
  returns: v.null(),
  handler: async (ctx, { workspaceId, playlistId }) => {
    const row = await ctx.db
      .query("ytPlaylists")
      .withIndex("by_workspace_playlist", (q) =>
        q.eq("workspaceId", workspaceId).eq("playlistId", playlistId),
      )
      .first();
    if (row !== null) {
      await ctx.db.patch(row._id, { itemCount: row.itemCount + 1 });
    }
    return null;
  },
});

// ── shared preflight ─────────────────────────────────────────────────────────

async function loadContext(ctx: ActionCtx): Promise<NonNullable<MediaContext>> {
  const context: MediaContext = await ctx.runQuery(
    internal.ytMedia.loadMediaContext,
    {},
  );
  if (context === null) {
    invalid("Prvo poveži YouTube nalog u Podešavanjima.");
  }
  return context;
}

async function resolveToken(
  context: NonNullable<MediaContext>,
): Promise<string> {
  const creds = parseYouTubeCredentials(
    await decryptCredentials(context.encryptedCredentials),
  );
  return await fetchAccessToken(creds);
}

// ── list ─────────────────────────────────────────────────────────────────────

/** What `playlists.list` gives back for `part=snippet,contentDetails`. */
type PlaylistResource = {
  id?: string;
  snippet?: { title?: string };
  contentDetails?: { itemCount?: number };
};

/**
 * The channel's own playlists — 1 unit — cached on the way back.
 *
 * One page of fifty. A channel with more than fifty playlists would need
 * paging, and each page is another unit; fifty is well past what a dropdown
 * can usefully hold anyway, so the rest are left unfetched rather than
 * silently paged in behind the operator's back.
 */
export const listPlaylists = action({
  args: {},
  returns: v.array(playlistValidator),
  handler: async (ctx): Promise<
    { playlistId: string; title: string; itemCount: number }[]
  > => {
    const context = await loadContext(ctx);
    const { workspaceId } = context;

    const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
      workspaceId,
      kind: "playlist" as const,
      title: "Učitavanje plejlista",
    });

    if (!canAffordMedia(context.unitsUsed, QUOTA_COST.playlistsList)) {
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
      token = await resolveToken(context);
    } catch (err) {
      return await failJob(
        err instanceof Error
          ? err.message
          : "Neuspela priprema YouTube kredencijala.",
      );
    }

    const res = await ytRequest(
      buildPlaylistsListUrl({ mine: true, maxResults: PLAYLISTS_PAGE_SIZE }),
      token,
    );
    if (res.status !== 0) {
      spent = QUOTA_COST.playlistsList;
      await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
        workspaceId,
        units: spent,
      });
    }

    if (!res.ok) {
      if (res.status === 403) {
        return await failJob(
          "Nalog nema dozvolu da čita plejliste. Proveri da li token ima opseg youtube.force-ssl.",
        );
      }
      return await failJob(`Plejliste se ne mogu učitati: ${res.body}`);
    }

    let items: PlaylistResource[] = [];
    try {
      items = (JSON.parse(res.body) as { items?: PlaylistResource[] }).items ?? [];
    } catch {
      return await failJob("YouTube je vratio neočekivan odgovor o plejlistama.");
    }

    const fresh = items
      .filter(
        (item): item is PlaylistResource & { id: string } =>
          typeof item.id === "string" && item.id.length > 0,
      )
      .map((item) => ({
        playlistId: item.id,
        title: item.snippet?.title ?? "(bez naziva)",
        itemCount: item.contentDetails?.itemCount ?? 0,
      }));

    await ctx.runMutation(internal.ytPlaylists.cachePlaylists, {
      workspaceId,
      playlists: fresh,
    });

    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "done" as const,
      unitsSpent: spent,
    });

    return [...fresh].sort((a, b) => a.title.localeCompare(b.title));
  },
});

// ── add ──────────────────────────────────────────────────────────────────────

/**
 * Put one video into one playlist — 50 units.
 *
 * Isto što i jedan odgovor na komentar, za jedan klik. YouTube dozvoljava isti
 * video dva puta u istoj plejlisti i neće se pobuniti — dupli klik je duplih
 * 50 jedinica i dva unosa — pa forma dugme zaključava dok poziv traje.
 *
 * Reverzibilno je: unos se u Studiju uklanja iz plejliste, sam video ostaje.
 */
export const addVideoToPlaylist = action({
  args: { playlistId: v.string(), videoId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const playlistId = args.playlistId.trim();
    const videoId = args.videoId.trim();
    if (playlistId.length === 0) invalid("Izaberi plejlistu.");
    if (videoId.length === 0) invalid("Nedostaje ID videa.");

    const context = await loadContext(ctx);
    const { workspaceId } = context;

    const localTitle: string | null = await ctx.runQuery(
      internal.ytVideos.loadVideoTitle,
      { workspaceId, videoId },
    );

    const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
      workspaceId,
      kind: "playlist" as const,
      videoId,
      title:
        localTitle !== null
          ? `Dodavanje u plejlistu — ${localTitle}`
          : "Dodavanje u plejlistu",
    });

    if (!canAffordMedia(context.unitsUsed, QUOTA_COST.playlistItemsInsert)) {
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
      token = await resolveToken(context);
    } catch (err) {
      return await failJob(
        err instanceof Error
          ? err.message
          : "Neuspela priprema YouTube kredencijala.",
      );
    }

    const res = await ytRequest(buildPlaylistItemsInsertUrl(), token, {
      method: "POST",
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId },
        },
      }),
      contentType: "application/json",
    });
    if (res.status !== 0) {
      spent = QUOTA_COST.playlistItemsInsert;
      await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
        workspaceId,
        units: spent,
      });
    }

    if (!res.ok) {
      if (res.status === 403) {
        return await failJob(
          "Nalog nema dozvolu da menja ovu plejlistu — proveri da li pripada povezanom kanalu.",
        );
      }
      if (res.status === 404) {
        return await failJob(
          "Plejlista ili video ne postoje. Osveži spisak plejlista i pokušaj ponovo.",
        );
      }
      return await failJob(`Dodavanje u plejlistu nije uspelo: ${res.body}`);
    }

    await ctx.runMutation(internal.ytPlaylists.bumpPlaylistCount, {
      workspaceId,
      playlistId,
    });

    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "done" as const,
      unitsSpent: spent,
    });
    return null;
  },
});
