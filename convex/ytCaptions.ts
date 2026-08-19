import { action, mutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { decryptCredentials } from "./lib/crypto";
import {
  buildCaptionsDeleteUrl,
  buildCaptionsInsertUrl,
  buildCaptionsListUrl,
  buildCaptionsUpdateUrl,
  fetchAccessToken,
  parseYouTubeCredentials,
} from "./lib/youtubeApi";
import {
  QUOTA_COST,
  QUOTA_MEDIA_EXHAUSTED_MESSAGE,
  canAffordMedia,
} from "./lib/ytQuota";
import {
  CAPTION_MAX_BYTES,
  CAPTION_NAME_MAX,
  buildMultipartRelatedBody,
  captionContentType,
  detectCaptionFormat,
  formatKilobytes,
  isCaptionLanguage,
  newMultipartBoundary,
} from "./lib/ytCaptions";
import { ytRequest } from "./ytMedia";
import type { MediaContext } from "./ytMedia";

/**
 * Caption tracks (Y9). Default V8 runtime.
 *
 * PROČITAJ CENU PRE NEGO ŠTO DIRAŠ BILO ŠTA OVDE.
 *
 *   captions.list      50
 *   captions.insert   400
 *   captions.update   450
 *   captions.delete    50
 *
 * Jedan poslat titl je 400 jedinica — osam automatskih odgovora na komentare.
 * Deset titlova je 4 000, dve trećine celog dnevnog plafona za izmene (6 000)
 * i polovina Google-ovog dnevnog budžeta. Ovo je jedino mesto u aplikaciji gde
 * jedan klik pojede vidljiv deo dana, pa svaka operacija ovde ide kroz
 * `canAffordMedia` (Y6), koji čuva 2 000 jedinica za motor za komentare, i
 * svaka ostavlja red u `ytMediaJobs`.
 *
 * Fajl ne izlazi iz backenda: browser ga okači u Convex storage, akcija ga
 * pročita odatle, pošalje Google-u i obriše ga. Titl je par desetina kilobajta
 * i nema razloga da putuje ikuda drugde.
 */

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

// ── shared preflight ─────────────────────────────────────────────────────────

/** Membership, channel and today's counter — or a sentence saying why not. */
async function loadContext(
  ctx: ActionCtx,
): Promise<NonNullable<MediaContext>> {
  const context: MediaContext = await ctx.runQuery(
    internal.ytMedia.loadMediaContext,
    {},
  );
  if (context === null) {
    invalid("Prvo poveži YouTube nalog u Podešavanjima.");
  }
  return context;
}

/** A fresh access token, or the reason there isn't one. */
async function resolveToken(
  context: NonNullable<MediaContext>,
): Promise<string> {
  const creds = parseYouTubeCredentials(
    await decryptCredentials(context.encryptedCredentials),
  );
  return await fetchAccessToken(creds);
}

// ── the two ways a file reaches Google ───────────────────────────────────────

/** What the caption endpoints answer with, for the parts we read. */
type CaptionResource = {
  id?: string;
  snippet?: {
    videoId?: string;
    lastUpdated?: string;
    trackKind?: string;
    language?: string;
    name?: string;
    isDraft?: boolean;
  };
};

/**
 * The runtime's `fetch` takes an ArrayBuffer, not a view over one, so the
 * bytes are copied out rather than handed over. A caption file is kilobytes;
 * this is not the place that costs anything.
 */
function asBody(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

type SendResult = {
  ok: boolean;
  /** The error, in the words the operator gets. Empty on success. */
  message: string;
  via: "multipart" | "resumable";
};

/** An upstream failure in one line. Status 0 is not an HTTP status. */
function describeFailure(status: number, body: string): string {
  return status === 0 ? `veza sa YouTube-om (${body})` : `${status}: ${body}`;
}

/**
 * Send metadata and a file in one operation, multipart first, resumable if
 * that is refused.
 *
 * Why both paths exist. `multipart/related` is the right shape for a caption
 * track and the only one that costs a single round trip, but it is a body we
 * assemble by hand, and a proxy or a header quirk that mangles the boundary
 * would leave subtitles permanently unsendable with no way around it. The
 * resumable path sends the same metadata as ordinary JSON and the bytes as a
 * plain PUT — nothing hand-assembled anywhere — so it is the escape hatch.
 *
 * THE FALLBACK IS NOT FREE. Google meters the operation, not the round trip:
 * a second attempt is a second 400 units. So it only runs when the first
 * failure could plausibly be about transport, and only when today's budget
 * still pays for it. A 401, 403 or 404 is about the token, the channel or the
 * video — the resumable path would fail identically and charge again for the
 * privilege.
 */
async function sendCaptionFile(params: {
  token: string;
  method: "POST" | "PUT";
  multipartUrl: string;
  resumableUrl: string;
  metadata: Record<string, unknown>;
  file: Uint8Array;
  fileContentType: string;
  unitCost: number;
  /** Book units the moment a metered attempt returns, success or not. */
  book: (units: number) => Promise<void>;
  /** Does today's budget still pay for a second full-price attempt? */
  canRetry: () => boolean;
}): Promise<SendResult> {
  const { body, contentType } = buildMultipartRelatedBody({
    metadata: params.metadata,
    file: params.file,
    fileContentType: params.fileContentType,
    boundary: newMultipartBoundary(),
  });

  const multipart = await ytRequest(params.multipartUrl, params.token, {
    method: params.method,
    body: asBody(body),
    contentType,
  });
  // Status 0 is the one failure Google did not charge for: the request never
  // reached it (DNS, TLS, a dropped socket). Everything else is metered
  // whether it succeeded or not, and booking it late would let a dying action
  // leave those units looking unspent.
  if (multipart.status !== 0) await params.book(params.unitCost);
  if (multipart.ok) return { ok: true, message: "", via: "multipart" };

  const firstError = describeFailure(multipart.status, multipart.body);

  if ([401, 403, 404].includes(multipart.status)) {
    return { ok: false, message: firstError, via: "multipart" };
  }
  if (!params.canRetry()) {
    return {
      ok: false,
      message: `${firstError} — a za rezervni pokušaj nema dovoljno kvote danas.`,
      via: "multipart",
    };
  }

  // ── resumable ──────────────────────────────────────────────────────────────
  // The session URL comes back in the `Location` header of an otherwise empty
  // response; the bytes then go there as a plain PUT, whatever the method of
  // the operation itself was.
  const init = await ytRequest(params.resumableUrl, params.token, {
    method: params.method,
    body: JSON.stringify(params.metadata),
    contentType: "application/json; charset=UTF-8",
    headers: {
      "X-Upload-Content-Type": params.fileContentType,
      "X-Upload-Content-Length": String(params.file.length),
    },
  });
  // Booked once for the whole resumable operation, here rather than after the
  // PUT: Google charges for the operation it accepted, and an action that dies
  // between the two calls must not leave those units looking unspent.
  if (init.status !== 0) await params.book(params.unitCost);

  if (!init.ok || init.location === null) {
    return {
      ok: false,
      message: `${firstError}; rezervni put nije otvoren (${describeFailure(init.status, init.body || "bez Location zaglavlja")})`,
      via: "resumable",
    };
  }

  const upload = await ytRequest(init.location, params.token, {
    method: "PUT",
    body: asBody(params.file),
    contentType: params.fileContentType,
  });
  if (upload.ok) return { ok: true, message: "", via: "resumable" };

  return {
    ok: false,
    message: `${firstError}; ni rezervni put nije uspeo (${describeFailure(upload.status, upload.body)})`,
    via: "resumable",
  };
}

// ── getting the file into the backend ────────────────────────────────────────

/**
 * A one-shot URL the browser POSTs the caption file to.
 *
 * The file goes to Convex storage first and to Google second. It could not go
 * straight from the browser: the call that carries it costs 400 units and
 * needs a token with full write access to the channel, and neither of those
 * belongs in a browser (Y6 issues a browser token only for video bytes, which
 * are too large to pass through an action at all — a caption file is not).
 */
export const generateCaptionUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireMembership(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Read an uploaded caption out of storage and check it is really a caption. */
async function readCaptionFile(
  ctx: ActionCtx,
  storageId: Id<"_storage">,
): Promise<{ file: Uint8Array; contentType: string }> {
  const blob = await ctx.storage.get(storageId);
  if (blob === null) {
    invalid("Fajl sa titlom više nije dostupan. Izaberi ga ponovo i pošalji.");
  }

  const file = new Uint8Array(await blob.arrayBuffer());
  if (file.length === 0) invalid("Fajl sa titlom je prazan.");
  if (file.length > CAPTION_MAX_BYTES) {
    invalid(
      `Fajl je ${formatKilobytes(file.length)}, a granica je 1 MB. Titl te veličine skoro sigurno nije titl.`,
    );
  }

  // The extension was the operator's claim; this is the check. Sending a file
  // YouTube cannot parse costs the full 400 units to find out.
  const format = detectCaptionFormat(file);
  if (format === null) {
    invalid(
      "Sadržaj fajla ne izgleda kao titl. Očekuje se .vtt koji počinje sa WEBVTT ili .srt sa vremenskim kodovima (00:00:01,000 --> 00:00:04,000).",
    );
  }

  return { file, contentType: captionContentType(format) };
}

// ── list ─────────────────────────────────────────────────────────────────────

const captionTrackValidator = v.object({
  id: v.string(),
  language: v.string(),
  name: v.string(),
  isDraft: v.boolean(),
  /** "standard" (uploaded), "ASR" (auto-generated) or "forced". */
  trackKind: v.string(),
  lastUpdated: v.union(v.number(), v.null()),
});

/**
 * The caption tracks on one video — 50 units.
 *
 * An action rather than a query because the answer lives at YouTube, which
 * means the panel pays 50 units every time it opens. That is the same price as
 * deleting a comment, for a list, so the panel says so and does not refresh on
 * its own.
 *
 * No `ytMediaJobs` row: this reads, it does not change the channel, and a row
 * per panel open would bury the operations that actually did something.
 */
export const listCaptions = action({
  args: { videoId: v.string() },
  returns: v.array(captionTrackValidator),
  handler: async (ctx, args) => {
    const videoId = args.videoId.trim();
    if (videoId.length === 0) invalid("Nedostaje ID videa.");

    const context = await loadContext(ctx);

    if (!canAffordMedia(context.unitsUsed, QUOTA_COST.captionsList)) {
      invalid(QUOTA_MEDIA_EXHAUSTED_MESSAGE);
    }

    let token: string;
    try {
      token = await resolveToken(context);
    } catch (err) {
      invalid(
        err instanceof Error
          ? err.message
          : "Neuspela priprema YouTube kredencijala.",
      );
    }

    const res = await ytRequest(buildCaptionsListUrl(videoId), token);
    await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
      workspaceId: context.workspaceId,
      units: QUOTA_COST.captionsList,
    });

    if (!res.ok) {
      if (res.status === 403) {
        invalid(
          "Nalog nema dozvolu da čita titlove ovog videa. Proveri da li video pripada povezanom kanalu i da li token ima opseg youtube.force-ssl.",
        );
      }
      if (res.status === 404) {
        invalid("Video nije pronađen na YouTube-u.");
      }
      invalid(`Titlovi se ne mogu učitati: ${res.body}`);
    }

    let items: CaptionResource[] = [];
    try {
      items = (JSON.parse(res.body) as { items?: CaptionResource[] }).items ?? [];
    } catch {
      invalid("YouTube je vratio neočekivan odgovor o titlovima.");
    }

    return items
      .filter((item): item is CaptionResource & { id: string } =>
        typeof item.id === "string" && item.id.length > 0,
      )
      .map((item) => {
        const lastUpdated = Date.parse(item.snippet?.lastUpdated ?? "");
        return {
          id: item.id,
          language: item.snippet?.language ?? "",
          name: item.snippet?.name ?? "",
          isDraft: item.snippet?.isDraft === true,
          trackKind: item.snippet?.trackKind ?? "standard",
          lastUpdated: Number.isNaN(lastUpdated) ? null : lastUpdated,
        };
      });
  },
});

// ── upload ───────────────────────────────────────────────────────────────────

/**
 * Add a caption track — 400 units.
 *
 * NAJSKUPLJI POZIV U APLIKACIJI. Osam automatskih odgovora na komentare po
 * jednom titlu. Zato: kvota se proverava pre svega, fajl se proverava pre
 * slanja, a jezik mora biti iz zatvorene liste — pogrešan BCP-47 kod YouTube
 * tiho prihvati i titl se pojavi pod jezikom koji niko ne traži, sa već
 * potrošenih 400 jedinica.
 *
 * `isDraft` true znači da je titl okačen ali nije objavljen — korisno da se
 * pregleda u Studiju pre nego što ga gledaoci vide.
 */
export const uploadCaption = action({
  args: {
    videoId: v.string(),
    storageId: v.id("_storage"),
    language: v.string(),
    name: v.string(),
    isDraft: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      return await runUploadCaption(ctx, args);
    } finally {
      // The file has done its job whichever way this ended; a failed send is
      // re-picked from disk, not retried from storage.
      await ctx.storage.delete(args.storageId).catch(() => {});
    }
  },
});

async function runUploadCaption(
  ctx: ActionCtx,
  args: {
    videoId: string;
    storageId: Id<"_storage">;
    language: string;
    name: string;
    isDraft: boolean;
  },
): Promise<null> {
  const videoId = args.videoId.trim();
  if (videoId.length === 0) invalid("Nedostaje ID videa.");

  const language = args.language.trim();
  if (!isCaptionLanguage(language)) {
    invalid("Izaberi jezik titla sa liste.");
  }

  const name = args.name.trim();
  if (name.length > CAPTION_NAME_MAX) {
    invalid(`Naziv titla može imati najviše ${CAPTION_NAME_MAX} znakova.`);
  }

  const context = await loadContext(ctx);
  const { workspaceId } = context;

  // Read and check the file BEFORE the job row: a file that is not a caption
  // is the operator's wrong click, not an operation worth recording.
  const { file, contentType } = await readCaptionFile(ctx, args.storageId);

  const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
    workspaceId,
    kind: "caption" as const,
    videoId,
    title: name.length > 0 ? `Titl ${language} — ${name}` : `Titl ${language}`,
  });

  const cost = QUOTA_COST.captionsInsert;
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
  const book = async (units: number): Promise<void> => {
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
    token = await resolveToken(context);
  } catch (err) {
    return await failJob(
      err instanceof Error
        ? err.message
        : "Neuspela priprema YouTube kredencijala.",
    );
  }

  const sent = await sendCaptionFile({
    token,
    method: "POST",
    multipartUrl: buildCaptionsInsertUrl("multipart"),
    resumableUrl: buildCaptionsInsertUrl("resumable"),
    metadata: {
      snippet: {
        videoId,
        language,
        name,
        isDraft: args.isDraft,
      },
    },
    file,
    fileContentType: contentType,
    unitCost: cost,
    book,
    canRetry: () => canAffordMedia(context.unitsUsed + spent, cost),
  });

  if (!sent.ok) {
    return await failJob(`Slanje titla nije uspelo — ${sent.message}`);
  }

  await ctx.runMutation(internal.ytMedia.finishJob, {
    jobId,
    status: "done" as const,
    unitsSpent: spent,
  });
  return null;
}

// ── replace ──────────────────────────────────────────────────────────────────

/**
 * Replace an existing track's file — 450 units.
 *
 * Menja se SAMO fajl. Jezik, naziv i status (objavljen / radna verzija) ostaju
 * kakvi jesu, jer se šalje `part=id` sa telom od samo `{ id }`: `captions.
 * update` zamenjuje svaki deo koji dobije, pa bi `part=snippet` sa snippetom
 * koji nismo prethodno pročitali obrisao naziv i draft oznaku (lib/youtubeApi.
 * ts). Čitanje snippeta bi koštalo još 50 jedinica za podatak koji nam ne
 * treba.
 *
 * Skuplje od slanja novog titla za 50 jedinica — zameniti dva puta je skuplje
 * nego poslati jednom kako treba.
 */
export const updateCaption = action({
  args: {
    captionId: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      return await runUpdateCaption(ctx, args);
    } finally {
      await ctx.storage.delete(args.storageId).catch(() => {});
    }
  },
});

async function runUpdateCaption(
  ctx: ActionCtx,
  args: { captionId: string; storageId: Id<"_storage"> },
): Promise<null> {
  const captionId = args.captionId.trim();
  if (captionId.length === 0) invalid("Nedostaje ID titla.");

  const context = await loadContext(ctx);
  const { workspaceId } = context;

  const { file, contentType } = await readCaptionFile(ctx, args.storageId);

  const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
    workspaceId,
    kind: "caption" as const,
    title: `Zamena titla ${captionId}`,
  });

  const cost = QUOTA_COST.captionsUpdate;
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
  const book = async (units: number): Promise<void> => {
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
    token = await resolveToken(context);
  } catch (err) {
    return await failJob(
      err instanceof Error
        ? err.message
        : "Neuspela priprema YouTube kredencijala.",
    );
  }

  const sent = await sendCaptionFile({
    token,
    method: "PUT",
    multipartUrl: buildCaptionsUpdateUrl({
      parts: ["id"],
      uploadType: "multipart",
    }),
    resumableUrl: buildCaptionsUpdateUrl({
      parts: ["id"],
      uploadType: "resumable",
    }),
    metadata: { id: captionId },
    file,
    fileContentType: contentType,
    unitCost: cost,
    book,
    canRetry: () => canAffordMedia(context.unitsUsed + spent, cost),
  });

  if (!sent.ok) {
    return await failJob(`Zamena titla nije uspela — ${sent.message}`);
  }

  await ctx.runMutation(internal.ytMedia.finishJob, {
    jobId,
    status: "done" as const,
    unitsSpent: spent,
  });
  return null;
}

// ── delete ───────────────────────────────────────────────────────────────────

/**
 * Remove a caption track — 50 units.
 *
 * Cheap to undo the wrong way round: deleting costs 50, putting the track back
 * costs 400. The panel asks before calling this, and says that number.
 *
 * Automatski generisani titlovi (`trackKind: "ASR"`) se ne mogu obrisati —
 * YouTube na to odgovara 403, a jedinice su već potrošene. Zato ih panel ni ne
 * nudi za brisanje.
 */
export const deleteCaption = action({
  args: { captionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const captionId = args.captionId.trim();
    if (captionId.length === 0) invalid("Nedostaje ID titla.");

    const context = await loadContext(ctx);
    const { workspaceId } = context;

    const jobId = await ctx.runMutation(internal.ytMedia.startJob, {
      workspaceId,
      kind: "caption" as const,
      title: `Brisanje titla ${captionId}`,
    });

    if (!canAffordMedia(context.unitsUsed, QUOTA_COST.captionsDelete)) {
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

    const res = await ytRequest(buildCaptionsDeleteUrl(captionId), token, {
      method: "DELETE",
    });
    spent = QUOTA_COST.captionsDelete;
    await ctx.runMutation(internal.ytIngest.recordQuotaUsage, {
      workspaceId,
      units: spent,
    });

    if (!res.ok) {
      if (res.status === 403) {
        return await failJob(
          "Ovaj titl se ne može obrisati — ili ne pripada povezanom kanalu, ili ga je YouTube automatski generisao.",
        );
      }
      if (res.status === 404) {
        return await failJob("Titl ne postoji — možda je već obrisan.");
      }
      return await failJob(`Brisanje titla nije uspelo: ${res.body}`);
    }

    await ctx.runMutation(internal.ytMedia.finishJob, {
      jobId,
      status: "done" as const,
      unitsSpent: spent,
    });
    return null;
  },
});
