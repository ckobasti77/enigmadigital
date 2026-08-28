import {
  internalMutation,
  internalAction,
  internalQuery,
} from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { hashHandle } from "./lib/leadInboundDerive";
import { recordInboundInternal } from "./leadInboundStore";

/**
 * ============================================================================
 * LEAD INBOUND INGEST (LM5, LM5.1, §1, §8, §10)
 * ============================================================================
 *
 * Automatsko punjenje `leadInbound` čekaonice iz postojećih tabela aplikacije:
 * 1. threadsReplies (odgovori i komentari na Threads objavama)
 * 2. threadsMentions (spominjanja na Threads-u)
 * 3. igComments (Instagram komentari i odgovori)
 * 4. fbComments (Facebook komentari i odgovori)
 * 5. orInboundMessages (OpenReply Instagram/Facebook DM poruke)
 *
 * KURSOR I PAKETI (LM5.1):
 * - Ingest se izvršava u paketima od BATCH_SIZE (200) dokumenata po izvoru.
 * - Svaki prolaz čita dokumente iznad `lastCreationTime` iz `leadInboundCursor`,
 *   i to OPSEGOM PO INDEKSU `by_workspace_created` (samo `workspaceId`, kojem
 *   Convex implicitno dodaje `_creationTime`). `lastDocId` NIJE deo granice —
 *   služi samo kao dijagnostika na kom dokumentu je prolaz stao.
 * - Ako je paket pun (`hasMore: true`), to se zapisuje u log; sledeći prolaz
 *   nastavlja odatle. Zaostatak od N dokumenata se stiže za ceil(N/200) prolaza,
 *   odnosno ceil(N/200) × 15 minuta. Ništa se ne odseca tiho.
 * - Kursor se pomera isključivo na `_creationTime` poslednjeg obrađenog dokumenta unutar
 *   iste mutacije (`writeInboundBatch`), čime se garantuje transakciona celovitost.
 * - Jedan izvor = jedna mutacija. Nikada svih pet izvora u jednoj transakciji.
 *
 * HEŠIRANJE U AKCIJI:
 * - `hashHandle` koristi `crypto.subtle` (Web Crypto API), koji je u Convex-u
 *   zagarantovan u akcijama (`internalAction`), a nije u mutacijama.
 * - Sirov handle postoji isključivo u radnoj memoriji akcije (`ingestSourceBatch`),
 *   nikada ne ulazi u bazu, logove, povratne vrednosti niti poruke grešaka.
 *
 * NEPREGOVARAČKA PRAVILA:
 * - Aplikacija NE skrejpuje niti radi nove spoljne pozive (§10).
 * - Sirov handle, e-mail i telefon se NIKADA ne upisuju u leadInbound niti u logove (§0).
 * - Prazan prolaz ("nema_novih") i neuspeo prolaz ("greska") su strogo razlučivi u bazi.
 * ============================================================================
 */

export const BATCH_SIZE = 200;

export const inboundSourceValidator = v.union(
  v.literal("threadsReplies"),
  v.literal("threadsMentions"),
  v.literal("igComments"),
  v.literal("fbComments"),
  v.literal("orInboundMessages"),
);

export type InboundSource =
  | "threadsReplies"
  | "threadsMentions"
  | "igComments"
  | "fbComments"
  | "orInboundMessages";

export const INBOUND_SOURCES: InboundSource[] = [
  "threadsReplies",
  "threadsMentions",
  "igComments",
  "fbComments",
  "orInboundMessages",
];

function parseTimestampToMs(
  timestamp?: string | number | null,
  fallback = Date.now(),
): number {
  if (timestamp === undefined || timestamp === null) {
    return fallback;
  }
  if (typeof timestamp === "number") {
    // Ako je timestamp u sekundama (manji od 100 milijardi), pretvori u milisekunde
    return timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp;
  }
  const parsed = Date.parse(timestamp);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * 1. internalQuery `readSourceBatch`
 * Čita paket dokumenata iznad kursora i vraća SAMO polja koja su potrebna
 * (uključujući sirov handle koji će akcija heširati).
 */
export const readSourceBatch = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    source: inboundSourceValidator,
  },
  handler: async (ctx, args) => {
    const cursor = await ctx.db
      .query("leadInboundCursor")
      .withIndex("by_workspace_source", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("source", args.source),
      )
      .unique();

    const lastCreationTime = cursor?.lastCreationTime ?? 0;
    const lastDocId = cursor?.lastDocId;

    let items: Array<{
      docId: string;
      creationTime: number;
      platform: "instagram" | "facebook" | "threads";
      kind: "komentar" | "odgovor" | "dm" | "mention";
      externalId: string;
      authorPlatformId?: string;
      rawHandle?: string;
      text?: string;
      occurredAt: number;
      sourceUrl?: string;
      suppressionUnverifiableReason?: string;
      shouldSkip: boolean;
    }> = [];

    let hasMore = false;

    if (args.source === "threadsReplies") {
      const rows = await ctx.db
        .query("threadsReplies")
        // Opseg PO INDEKSU, ne `.filter()`. Dve stvari su bile pogrešne:
        // (1) `by_workspace_reply` čita redosledom svog drugog polja, pa je
        //     kursor po `_creationTime` mogao trajno da preskoči zapise;
        // (2) `.filter()` u Convex-u se primenjuje POSLE čitanja, pa je svaki
        //     prolaz i dalje čitao celu tabelu — baš ono što paket treba da
        //     spreči. `by_workspace_created` ima samo `workspaceId`, a Convex
        //     mu implicitno dodaje `_creationTime`, pa je opseg pravi opseg.
        .withIndex("by_workspace_created", (q) =>
          lastCreationTime > 0
            ? q
                .eq("workspaceId", args.workspaceId)
                .gt("_creationTime", lastCreationTime)
            : q.eq("workspaceId", args.workspaceId),
        )
        .order("asc")
        .take(BATCH_SIZE);

      hasMore = rows.length === BATCH_SIZE;

      items = rows.map((r) => ({
        docId: r._id,
        creationTime: r._creationTime,
        platform: "threads" as const,
        kind: (r.isReply ? "odgovor" : "komentar") as "odgovor" | "komentar",
        externalId: r.replyId,
        authorPlatformId: r.ownerId,
        rawHandle: r.username,
        text: r.text,
        occurredAt: parseTimestampToMs(
          r.timestamp,
          r.receivedAt ?? r._creationTime,
        ),
        sourceUrl: r.permalink,
        suppressionUnverifiableReason: !r.ownerId
          ? "threads_reply_nema_owner_id"
          : undefined,
        shouldSkip: r.isReplyOwnedByMe === true,
      }));
    } else if (args.source === "threadsMentions") {
      const rows = await ctx.db
        .query("threadsMentions")
        // Opseg PO INDEKSU, ne `.filter()`. Dve stvari su bile pogrešne:
        // (1) `by_workspace_mention` čita redosledom svog drugog polja, pa je
        //     kursor po `_creationTime` mogao trajno da preskoči zapise;
        // (2) `.filter()` u Convex-u se primenjuje POSLE čitanja, pa je svaki
        //     prolaz i dalje čitao celu tabelu — baš ono što paket treba da
        //     spreči. `by_workspace_created` ima samo `workspaceId`, a Convex
        //     mu implicitno dodaje `_creationTime`, pa je opseg pravi opseg.
        .withIndex("by_workspace_created", (q) =>
          lastCreationTime > 0
            ? q
                .eq("workspaceId", args.workspaceId)
                .gt("_creationTime", lastCreationTime)
            : q.eq("workspaceId", args.workspaceId),
        )
        .order("asc")
        .take(BATCH_SIZE);

      hasMore = rows.length === BATCH_SIZE;

      items = rows.map((m) => ({
        docId: m._id,
        creationTime: m._creationTime,
        platform: "threads" as const,
        kind: "mention" as const,
        externalId: m.mentionId,
        authorPlatformId: undefined,
        rawHandle: m.username,
        text: m.text,
        occurredAt: parseTimestampToMs(
          m.timestamp,
          m.syncedAt ?? m._creationTime,
        ),
        sourceUrl: m.permalink,
        suppressionUnverifiableReason: "threads_mentions_nema_author_id",
        shouldSkip: false,
      }));
    } else if (args.source === "igComments") {
      const rows = await ctx.db
        .query("igComments")
        // Opseg PO INDEKSU, ne `.filter()`. Dve stvari su bile pogrešne:
        // (1) `by_workspace_timestamp` čita redosledom svog drugog polja, pa je
        //     kursor po `_creationTime` mogao trajno da preskoči zapise;
        // (2) `.filter()` u Convex-u se primenjuje POSLE čitanja, pa je svaki
        //     prolaz i dalje čitao celu tabelu — baš ono što paket treba da
        //     spreči. `by_workspace_created` ima samo `workspaceId`, a Convex
        //     mu implicitno dodaje `_creationTime`, pa je opseg pravi opseg.
        .withIndex("by_workspace_created", (q) =>
          lastCreationTime > 0
            ? q
                .eq("workspaceId", args.workspaceId)
                .gt("_creationTime", lastCreationTime)
            : q.eq("workspaceId", args.workspaceId),
        )
        .order("asc")
        .take(BATCH_SIZE);

      hasMore = rows.length === BATCH_SIZE;

      items = rows.map((c) => ({
        docId: c._id,
        creationTime: c._creationTime,
        platform: "instagram" as const,
        kind: (c.parentCommentId ? "odgovor" : "komentar") as
          | "odgovor"
          | "komentar",
        externalId: c.commentId,
        authorPlatformId: c.fromId,
        rawHandle: c.username,
        text: c.text,
        occurredAt: parseTimestampToMs(c.timestamp, c._creationTime),
        sourceUrl: undefined,
        suppressionUnverifiableReason: !c.fromId
          ? "instagram_komentar_bez_from_id"
          : undefined,
        shouldSkip: c.isOurs === true || c.deletedAt !== undefined,
      }));
    } else if (args.source === "fbComments") {
      const rows = await ctx.db
        .query("fbComments")
        // Opseg PO INDEKSU, ne `.filter()`. Dve stvari su bile pogrešne:
        // (1) `by_workspace_timestamp` čita redosledom svog drugog polja, pa je
        //     kursor po `_creationTime` mogao trajno da preskoči zapise;
        // (2) `.filter()` u Convex-u se primenjuje POSLE čitanja, pa je svaki
        //     prolaz i dalje čitao celu tabelu — baš ono što paket treba da
        //     spreči. `by_workspace_created` ima samo `workspaceId`, a Convex
        //     mu implicitno dodaje `_creationTime`, pa je opseg pravi opseg.
        .withIndex("by_workspace_created", (q) =>
          lastCreationTime > 0
            ? q
                .eq("workspaceId", args.workspaceId)
                .gt("_creationTime", lastCreationTime)
            : q.eq("workspaceId", args.workspaceId),
        )
        .order("asc")
        .take(BATCH_SIZE);

      hasMore = rows.length === BATCH_SIZE;

      items = rows.map((c) => ({
        docId: c._id,
        creationTime: c._creationTime,
        platform: "facebook" as const,
        kind: (c.parentCommentId ? "odgovor" : "komentar") as
          | "odgovor"
          | "komentar",
        externalId: c.commentId,
        authorPlatformId: c.authorId,
        rawHandle: undefined,
        text: c.text,
        occurredAt: parseTimestampToMs(c.timestamp, c._creationTime),
        sourceUrl: c.permalink,
        suppressionUnverifiableReason: !c.authorId
          ? "facebook_komentar_bez_author_id"
          : undefined,
        shouldSkip: c.isOurs === true || c.deletedAt !== undefined,
      }));
    } else if (args.source === "orInboundMessages") {
      const rows = await ctx.db
        .query("orInboundMessages")
        // Opseg PO INDEKSU, ne `.filter()`. Dve stvari su bile pogrešne:
        // (1) `by_workspace_mid` čita redosledom svog drugog polja, pa je
        //     kursor po `_creationTime` mogao trajno da preskoči zapise;
        // (2) `.filter()` u Convex-u se primenjuje POSLE čitanja, pa je svaki
        //     prolaz i dalje čitao celu tabelu — baš ono što paket treba da
        //     spreči. `by_workspace_created` ima samo `workspaceId`, a Convex
        //     mu implicitno dodaje `_creationTime`, pa je opseg pravi opseg.
        .withIndex("by_workspace_created", (q) =>
          lastCreationTime > 0
            ? q
                .eq("workspaceId", args.workspaceId)
                .gt("_creationTime", lastCreationTime)
            : q.eq("workspaceId", args.workspaceId),
        )
        .order("asc")
        .take(BATCH_SIZE);

      hasMore = rows.length === BATCH_SIZE;

      items = rows.map((m) => ({
        docId: m._id,
        creationTime: m._creationTime,
        platform: (m.platform === "facebook" ? "facebook" : "instagram") as
          | "facebook"
          | "instagram",
        kind: "dm" as const,
        externalId: m.mid,
        authorPlatformId: m.igsid,
        rawHandle: undefined,
        text: m.text,
        occurredAt: m.receivedAt,
        sourceUrl: undefined,
        suppressionUnverifiableReason: undefined,
        shouldSkip: false,
      }));
    }

    if (items.length > 0) {
      items.sort((a, b) => {
        if (a.creationTime !== b.creationTime) {
          return a.creationTime - b.creationTime;
        }
        return a.docId.localeCompare(b.docId);
      });

      const lastItem = items[items.length - 1];
      return {
        items,
        lastCreationTime: lastItem.creationTime,
        lastDocId: lastItem.docId,
        hasMore,
      };
    }

    return {
      items: [],
      lastCreationTime,
      lastDocId,
      hasMore: false,
    };
  },
});

/**
 * 2. internalMutation `writeInboundBatch`
 * Prima već izračunate hešove, upisuje zapise kroz `recordInboundInternal`,
 * i transakciono pomera kursor u tabeli `leadInboundCursor`.
 */
export const writeInboundBatch = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    source: inboundSourceValidator,
    items: v.array(
      v.object({
        platform: v.union(
          v.literal("instagram"),
          v.literal("facebook"),
          v.literal("threads"),
        ),
        kind: v.union(
          v.literal("komentar"),
          v.literal("odgovor"),
          v.literal("dm"),
          v.literal("mention"),
        ),
        externalId: v.string(),
        authorPlatformId: v.optional(v.string()),
        authorHandleHash: v.optional(v.string()),
        text: v.optional(v.string()),
        occurredAt: v.number(),
        sourceUrl: v.optional(v.string()),
        suppressionUnverifiableReason: v.optional(v.string()),
        shouldSkip: v.boolean(),
        docId: v.string(),
        creationTime: v.number(),
      }),
    ),
    lastCreationTime: v.number(),
    lastDocId: v.optional(v.string()),
    hasMore: v.boolean(),
  },
  handler: async (ctx, args) => {
    let processed = 0;
    for (const item of args.items) {
      if (item.shouldSkip) {
        continue;
      }
      const res = await recordInboundInternal(ctx, {
        workspaceId: args.workspaceId,
        platform: item.platform,
        kind: item.kind,
        externalId: item.externalId,
        authorPlatformId: item.authorPlatformId,
        authorHandleHash: item.authorHandleHash,
        text: item.text,
        occurredAt: item.occurredAt,
        sourceUrl: item.sourceUrl,
        suppressionUnverifiableReason: item.suppressionUnverifiableReason,
      });
      if (res.status === "upisano") {
        processed++;
      }
    }

    const existing = await ctx.db
      .query("leadInboundCursor")
      .withIndex("by_workspace_source", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("source", args.source),
      )
      .unique();

    const outcome = args.items.length > 0 ? "obradjeno" : "nema_novih";

    if (existing) {
      if (args.items.length > 0) {
        await ctx.db.patch("leadInboundCursor", existing._id, {
          lastCreationTime: args.lastCreationTime,
          lastDocId: args.lastDocId,
          lastRunAt: Date.now(),
          lastOutcome: outcome,
          lastError: undefined,
        });
      } else {
        await ctx.db.patch("leadInboundCursor", existing._id, {
          lastRunAt: Date.now(),
          lastOutcome: outcome,
          lastError: undefined,
        });
      }
    } else {
      await ctx.db.insert("leadInboundCursor", {
        workspaceId: args.workspaceId,
        source: args.source,
        lastCreationTime: args.lastCreationTime,
        lastDocId: args.lastDocId,
        lastRunAt: Date.now(),
        lastOutcome: outcome,
        lastError: undefined,
      });
    }

    return {
      processed,
      scanned: args.items.length,
      hasMore: args.hasMore,
    };
  },
});

/**
 * Pomoćna interna mutacija za beleženje greške u kursoru.
 * lastError NE SME da sadrži sirov handle, e-mail ni telefon.
 */
export const recordCursorError = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    source: inboundSourceValidator,
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leadInboundCursor")
      .withIndex("by_workspace_source", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("source", args.source),
      )
      .unique();

    if (existing) {
      await ctx.db.patch("leadInboundCursor", existing._id, {
        lastRunAt: Date.now(),
        lastOutcome: "greska",
        lastError: args.errorMessage,
      });
    } else {
      await ctx.db.insert("leadInboundCursor", {
        workspaceId: args.workspaceId,
        source: args.source,
        lastCreationTime: 0,
        lastDocId: undefined,
        lastRunAt: Date.now(),
        lastOutcome: "greska",
        lastError: args.errorMessage,
      });
    }
  },
});

/**
 * Pomoćna funkcija za obradu jednog izvora unutar akcije.
 */
export async function ingestSourceBatchHelper(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  source: InboundSource,
): Promise<{
  processed: number;
  scanned: number;
  hasMore: boolean;
}> {
  try {
    const batch: {
      items: Array<{
        docId: string;
        creationTime: number;
        platform: "instagram" | "facebook" | "threads";
        kind: "komentar" | "odgovor" | "dm" | "mention";
        externalId: string;
        authorPlatformId?: string;
        rawHandle?: string;
        text?: string;
        occurredAt: number;
        sourceUrl?: string;
        suppressionUnverifiableReason?: string;
        shouldSkip: boolean;
      }>;
      lastCreationTime: number;
      lastDocId?: string;
      hasMore: boolean;
    } = await ctx.runQuery(internal.leadInboundIngest.readSourceBatch, {
      workspaceId,
      source,
    });

    const itemsWithHash = await Promise.all(
      batch.items.map(async (item) => {
        let authorHandleHash: string | undefined = undefined;
        if (!item.shouldSkip && item.rawHandle) {
          authorHandleHash = await hashHandle(item.rawHandle);
        }
        return {
          platform: item.platform,
          kind: item.kind,
          externalId: item.externalId,
          authorPlatformId: item.authorPlatformId,
          authorHandleHash,
          text: item.text,
          occurredAt: item.occurredAt,
          sourceUrl: item.sourceUrl,
          suppressionUnverifiableReason: item.suppressionUnverifiableReason,
          shouldSkip: item.shouldSkip,
          docId: item.docId,
          creationTime: item.creationTime,
        };
      }),
    );

    const writeResult: {
      processed: number;
      scanned: number;
      hasMore: boolean;
    } = await ctx.runMutation(internal.leadInboundIngest.writeInboundBatch, {
      workspaceId,
      source,
      items: itemsWithHash,
      lastCreationTime: batch.lastCreationTime,
      lastDocId: batch.lastDocId,
      hasMore: batch.hasMore,
    });

    return writeResult;
  } catch (err) {
    const safeError =
      err instanceof Error ? err.name || "Error" : "GreskaPriIngestu";
    try {
      await ctx.runMutation(internal.leadInboundIngest.recordCursorError, {
        workspaceId,
        source,
        errorMessage: safeError,
      });
    } catch {
      // Ignorišemo grešku pri beleženju da ne maskiramo originalnu grešku
    }
    throw err;
  }
}

/**
 * 3. internalAction `ingestSourceBatch`
 * Nad rezultatom upita računa hešove (Web Crypto dozvoljen u akcijama),
 * poziva mutaciju za upis i ažuriranje kursora.
 */
export const ingestSourceBatch = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    source: inboundSourceValidator,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    processed: number;
    scanned: number;
    hasMore: boolean;
  }> => {
    return await ingestSourceBatchHelper(ctx, args.workspaceId, args.source);
  },
});

/**
 * Pomoćni interni upit za listanje svih radnih prostora.
 */
export const listAllWorkspaces = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("workspaces").collect();
  },
});

/**
 * Glavna akcija koja se poziva periodično (cron na 15 minuta) i obrađuje sve radne prostore × 5 izvora.
 */
export const ingestAllInbound = internalAction({
  args: {},
  handler: async (ctx) => {
    const workspaces: Array<{ _id: Id<"workspaces">; [key: string]: unknown }> =
      await ctx.runQuery(internal.leadInboundIngest.listAllWorkspaces, {});

    let totalRuns = 0;
    let okRuns = 0;
    const failed: Array<{
      workspaceId: string;
      source: string;
      reason: string;
    }> = [];

    for (const ws of workspaces) {
      for (const source of INBOUND_SOURCES) {
        totalRuns++;
        try {
          const res = await ingestSourceBatchHelper(ctx, ws._id, source);
          okRuns++;
          if (res.hasMore) {
            console.log(
              `[leadInboundIngest] Izvor ${source} za prostor ${ws._id} ima još podataka (hasMore: true).`,
            );
          }
        } catch (err) {
          const safeReason =
            err instanceof Error ? err.name || "Error" : "GreskaPriIngestu";
          failed.push({
            workspaceId: ws._id,
            source,
            reason: safeReason,
          });
        }
      }
    }

    if (failed.length > 0) {
      console.error(
        `[leadInboundIngest] neuspelo prolaza izvora: ${failed.length} od ${totalRuns}`,
        failed.map((f) => `${f.workspaceId}/${f.source}: ${f.reason}`).join(" | "),
      );
    }

    // Ako nijedan prolaz nije uspeo (a bilo je bar jednog), ovo NIJE „nema novih poruka" nego kvar.
    if (totalRuns > 0 && okRuns === 0) {
      throw new Error(
        `[leadInboundIngest] ingest nije uspeo ni za jedan izvor (${failed.length} neuspeha).`,
      );
    }

    return {
      workspacesTotal: workspaces.length,
      totalRuns,
      okRuns,
      failedRuns: failed.length,
    };
  },
});

