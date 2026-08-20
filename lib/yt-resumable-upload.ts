import { buildResumableUploadInitUrl } from "@/convex/lib/youtubeApi";
import {
  UPLOAD_CHUNK_ALIGNMENT,
  UPLOAD_CHUNK_BYTES,
} from "@/convex/lib/ytUpload";

/**
 * Google's resumable upload protocol, in the browser (Y10).
 *
 * Runs in the browser and nowhere else, on purpose: a Convex action has
 * neither the time nor the memory for a file of a few hundred megabytes, so
 * the bytes go straight from the machine that has them to Google. Convex hands
 * out the token and records how it ended (convex/ytUpload.ts).
 *
 * The protocol in one paragraph. A POST carrying only the metadata opens a
 * session and answers with a `Location` header — that URL is the upload. The
 * file then goes there in chunks, each PUT declaring which slice of the whole
 * it is via `Content-Range`. Google answers 308 for "have it, keep going",
 * 200/201 with the finished video for the last one. A dropped connection is
 * not lost work: a PUT with `Content-Range: bytes *​/<total>` and no body asks
 * how far it got, and the next chunk resumes from there.
 *
 * ONO ŠTO NIJE OČIGLEDNO, A OBAVEZNO JE:
 *
 *   - Google odgovara sa 308, a to je HTTP kod za preusmerenje. Browser NE
 *     prati ovo preusmerenje samo zato što odgovor nema `Location` zaglavlje —
 *     po specifikaciji fetch-a, preusmerenje bez odredišta se vraća pozivaocu
 *     kakvo jeste. Zato ovde stoji podrazumevani `redirect: "follow"`;
 *     `redirect: "manual"` bi vratio neprozirni odgovor bez statusa i bez
 *     zaglavlja, dakle bez `Range` — a `Range` je jedino što nam kaže dokle je
 *     fajl stigao.
 *   - `Content-Length` se ne postavlja. Browser ga računa sam iz tela i to je
 *     zabranjeno zaglavlje koje `fetch` tiho ignoriše; dokumentacija ga
 *     pominje jer je pisana za servere.
 *   - Napredak se meri po parčetu, ne po bajtu: `fetch` ne javlja ništa dok
 *     telo zahteva putuje. 8 MB je zato i veličina parčeta i rezolucija
 *     trake napretka.
 */

/**
 * The chunk size, forced onto Google's 256 KB grid.
 *
 * Every chunk but the last must be a multiple of it; one that is not is
 * refused with a 400 that does not say why. Rounding down here rather than
 * asserting means a future edit to the constant costs alignment, not uploads.
 */
const CHUNK_BYTES = Math.max(
  UPLOAD_CHUNK_ALIGNMENT,
  Math.floor(UPLOAD_CHUNK_BYTES / UPLOAD_CHUNK_ALIGNMENT) *
    UPLOAD_CHUNK_ALIGNMENT,
);

/** How many times one chunk is retried before the upload gives up. */
const MAX_CHUNK_ATTEMPTS = 5;

/** Backoff between attempts: 1s, 2s, 4s, 8s. */
const RETRY_BASE_MS = 1000;

export type UploadProgress = {
  /** Bytes Google has confirmed it holds. */
  uploadedBytes: number;
  totalBytes: number;
  /** 0..1, from confirmed bytes only — never optimistic. */
  ratio: number;
};

export type UploadPhase = "opening" | "sending" | "finishing";

export type ResumableUploadResult = {
  videoId: string;
  /**
   * Whether Google ever answered with a session URL.
   *
   * Carried on the failure path too (as `UploadError.sessionOpened`), because
   * it decides whether the day's upload counter is given back: no session
   * means nothing was sent and nothing was metered.
   */
  sessionOpened: boolean;
};

/** A failure that knows whether anything actually reached Google. */
export class UploadError extends Error {
  readonly sessionOpened: boolean;
  readonly cancelled: boolean;

  constructor(
    message: string,
    options: { sessionOpened: boolean; cancelled?: boolean },
  ) {
    super(message);
    this.name = "UploadError";
    this.sessionOpened = options.sessionOpened;
    this.cancelled = options.cancelled === true;
  }
}

/** The metadata `startUpload` handed back. Sent as-is; never edited here. */
export type UploadMetadata = {
  snippet: {
    title: string;
    description: string;
    tags: string[];
    categoryId: string;
  };
  status: { privacyStatus: "private"; selfDeclaredMadeForKids: boolean };
};

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Wait, unless the operator cancelled first. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * How far Google says the file has got, from a 308's `Range` header.
 *
 * The header is `bytes=0-1048575` — an inclusive end — so the next byte to
 * send is one past it. A 308 with no `Range` at all means Google is holding
 * nothing yet, which is 0 and not an error.
 */
function nextOffsetFromRange(header: string | null): number {
  if (header === null) return 0;
  const match = /bytes=\d+-(\d+)/.exec(header.trim());
  if (match === null) return 0;
  return Number(match[1]) + 1;
}

/** An upstream failure in one line, in the words the operator gets. */
async function describeResponse(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  let message = "";
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } };
    message = parsed.error?.message ?? "";
  } catch {
    message = text.slice(0, 200);
  }
  return message.length > 0 ? `${res.status}: ${message}` : `HTTP ${res.status}`;
}

/**
 * Ask the session how many bytes it holds.
 *
 * The whole point of the resumable protocol, and the reason a dropped
 * connection halfway through a 2 GB file is an interruption rather than a
 * loss. Returns the offset to continue from, or the finished video when the
 * last chunk did land and only its answer went missing.
 */
async function queryUploadStatus(
  sessionUrl: string,
  totalBytes: number,
  token: string,
  signal: AbortSignal,
): Promise<{ done: false; offset: number } | { done: true; videoId: string }> {
  const res = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Range": `bytes */${totalBytes}`,
    },
    signal,
  });

  if (res.status === 308) {
    return { done: false, offset: nextOffsetFromRange(res.headers.get("range")) };
  }
  if (res.ok) {
    return { done: true, videoId: await readVideoId(res) };
  }
  throw new UploadError(
    `Sesija za slanje više ne važi (${await describeResponse(res)}). Izaberi fajl ponovo i pokušaj iz početka.`,
    { sessionOpened: true },
  );
}

/** The `id` off the finished video resource. */
async function readVideoId(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const parsed = JSON.parse(text) as { id?: string };
    if (typeof parsed.id === "string" && parsed.id.length > 0) return parsed.id;
  } catch {
    // handled below
  }
  throw new UploadError(
    "Video je poslat, ali YouTube nije vratio njegov ID. Proveri kanal u YouTube Studiju pre nego što pošalješ ponovo.",
    { sessionOpened: true },
  );
}

/**
 * Send one file to YouTube and return the id of the video it became.
 *
 * `onProgress` reports only what Google has confirmed, so the bar never runs
 * ahead of the transfer and never goes backwards after a resume.
 */
export async function uploadVideoResumable(params: {
  file: File;
  accessToken: string;
  metadata: UploadMetadata;
  signal: AbortSignal;
  onPhase?: (phase: UploadPhase) => void;
  onProgress?: (progress: UploadProgress) => void;
}): Promise<ResumableUploadResult> {
  const { file, accessToken, metadata, signal } = params;
  const totalBytes = file.size;

  const report = (uploadedBytes: number) => {
    params.onProgress?.({
      uploadedBytes,
      totalBytes,
      ratio: totalBytes > 0 ? Math.min(1, uploadedBytes / totalBytes) : 0,
    });
  };

  // ── 1. open the session ────────────────────────────────────────────────────
  params.onPhase?.("opening");
  let initRes: Response;
  try {
    initRes = await fetch(buildResumableUploadInitUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(totalBytes),
        "X-Upload-Content-Type": file.type,
      },
      body: JSON.stringify(metadata),
      signal,
    });
  } catch (err) {
    if (isAbort(err)) {
      throw new UploadError("Slanje je prekinuto.", {
        sessionOpened: false,
        cancelled: true,
      });
    }
    throw new UploadError(
      "Nije uspelo povezivanje sa YouTube-om. Proveri internet i pokušaj ponovo.",
      { sessionOpened: false },
    );
  }

  if (!initRes.ok) {
    throw new UploadError(
      `YouTube je odbio slanje (${await describeResponse(initRes)}).`,
      { sessionOpened: false },
    );
  }

  const sessionUrl = initRes.headers.get("location");
  if (sessionUrl === null || sessionUrl.length === 0) {
    // Without it there is nowhere to send the bytes. Stopping here is the only
    // honest answer — see the file header on why `redirect` stays default.
    throw new UploadError(
      "YouTube je prihvatio zahtev ali nije vratio adresu za slanje fajla. Pokušaj ponovo za koji minut.",
      { sessionOpened: false },
    );
  }

  // ── 2. send the file ───────────────────────────────────────────────────────
  params.onPhase?.("sending");
  let offset = 0;
  let attempts = 0;
  report(0);

  while (offset < totalBytes) {
    if (signal.aborted) {
      throw new UploadError("Slanje je prekinuto.", {
        sessionOpened: true,
        cancelled: true,
      });
    }

    const end = Math.min(offset + CHUNK_BYTES, totalBytes);
    const chunk = file.slice(offset, end);

    let res: Response | null = null;
    try {
      res = await fetch(sessionUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          // Content-Length is the browser's to set; see the file header.
          "Content-Range": `bytes ${offset}-${end - 1}/${totalBytes}`,
        },
        body: chunk,
        signal,
      });
    } catch (err) {
      if (isAbort(err)) {
        throw new UploadError("Slanje je prekinuto.", {
          sessionOpened: true,
          cancelled: true,
        });
      }
      // The connection dropped. Not lost work: ask where it got to.
      res = null;
    }

    if (res !== null && res.status === 308) {
      const confirmed = nextOffsetFromRange(res.headers.get("range"));
      // Google is the authority on how much it holds — trusting our own `end`
      // would silently skip a chunk it did not keep.
      offset = confirmed > offset ? confirmed : end;
      attempts = 0;
      report(offset);
      continue;
    }

    if (res !== null && res.ok) {
      params.onPhase?.("finishing");
      report(totalBytes);
      return { videoId: await readVideoId(res), sessionOpened: true };
    }

    // 4xx other than 408/429 is about the request itself; retrying re-sends
    // the same rejected bytes and wastes the operator's connection.
    if (
      res !== null &&
      res.status >= 400 &&
      res.status < 500 &&
      res.status !== 408 &&
      res.status !== 429
    ) {
      throw new UploadError(
        `YouTube je odbio fajl (${await describeResponse(res)}).`,
        { sessionOpened: true },
      );
    }

    attempts += 1;
    if (attempts >= MAX_CHUNK_ATTEMPTS) {
      const reason =
        res === null
          ? "veza je prekinuta više puta"
          : await describeResponse(res);
      throw new UploadError(
        `Slanje je zastalo na ${Math.round((offset / Math.max(1, totalBytes)) * 100)}% (${reason}). Pokušaj ponovo — YouTube čuva započetu sesiju kratko, pa je najsigurnije poslati fajl iz početka.`,
        { sessionOpened: true },
      );
    }

    await delay(RETRY_BASE_MS * 2 ** (attempts - 1), signal).catch(() => {
      throw new UploadError("Slanje je prekinuto.", {
        sessionOpened: true,
        cancelled: true,
      });
    });

    // Resync before re-sending: the failed chunk may have landed anyway.
    const status = await queryUploadStatus(
      sessionUrl,
      totalBytes,
      accessToken,
      signal,
    );
    if (status.done) {
      params.onPhase?.("finishing");
      report(totalBytes);
      return { videoId: status.videoId, sessionOpened: true };
    }
    offset = status.offset;
    report(offset);
  }

  // Every byte is confirmed but no response carried the video: ask once more.
  params.onPhase?.("finishing");
  const final = await queryUploadStatus(
    sessionUrl,
    totalBytes,
    accessToken,
    signal,
  );
  if (final.done) {
    report(totalBytes);
    return { videoId: final.videoId, sessionOpened: true };
  }
  throw new UploadError(
    "Fajl je poslat, ali YouTube ga nije potvrdio kao gotov video. Proveri kanal u YouTube Studiju pre nego što pošalješ ponovo.",
    { sessionOpened: true },
  );
}

/**
 * Width, height and duration of a chosen file, read by the browser itself.
 *
 * The only way to know whether an upload will become a Short, and it needs no
 * library: a detached `<video>` element decodes the container's metadata
 * without playing or downloading anything beyond the header.
 *
 * Returns null when the browser cannot decode it — some codecs it will happily
 * upload but not preview. Saying nothing then is better than guessing.
 */
export function probeVideoFile(file: File): Promise<{
  width: number;
  height: number;
  durationSeconds: number;
} | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    // Never fetch more than the header; the file is already local anyway.
    video.preload = "metadata";
    video.muted = true;

    const done = (
      result: { width: number; height: number; durationSeconds: number } | null,
    ) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(result);
    };

    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = Number.isFinite(video.duration)
        ? video.duration
        : 0;
      done(
        width > 0 && height > 0 && durationSeconds > 0
          ? { width, height, durationSeconds }
          : null,
      );
    };
    video.onerror = () => done(null);

    video.src = url;
  });
}
