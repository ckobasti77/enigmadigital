/**
 * Caption-track rules and the multipart body `captions.insert` expects (Y9).
 *
 * Pure — no Convex imports — so the panel and the action apply exactly the
 * same rules. The panel refuses a bad file before it is uploaded anywhere; the
 * action refuses it again before a single quota unit is spent, because the
 * panel is not the only thing that can call the action.
 *
 * Why the checks are worth this much code: captions.insert costs 400 units out
 * of a 6 000-unit media day. A file rejected by YouTube costs the same 400 as
 * one it accepts, so every rejection we can see coming has to be caught here.
 */

// ── limits ───────────────────────────────────────────────────────────────────

/**
 * 1 MB. A caption track for a feature-length film is a few hundred kilobytes;
 * anything past a megabyte is almost certainly not a caption file, and finding
 * that out from YouTube would cost 400 units.
 */
export const CAPTION_MAX_BYTES = 1_048_576;

/** YouTube truncates longer track names; we refuse them instead. */
export const CAPTION_NAME_MAX = 150;

/** The two formats we accept. YouTube takes more, these are the ones people have. */
export type CaptionFormat = "vtt" | "srt";

export const CAPTION_ACCEPTED_EXTENSIONS = [".srt", ".vtt"] as const;

/** What the file input advertises, and what the error message names. */
export const CAPTION_ACCEPT_ATTRIBUTE = ".srt,.vtt,text/vtt,application/x-subrip";

// ── languages ────────────────────────────────────────────────────────────────

export type CaptionLanguage = { code: string; label: string };

/**
 * The BCP-47 codes an operator may pick, in the order they are offered.
 *
 * A closed list on purpose. `language` is not validated by YouTube in any way
 * an operator would notice: a typo is accepted, stored, and the track simply
 * appears under a language nobody is looking for — with no error, and 400
 * units already spent. A dropdown cannot be mistyped.
 *
 * Serbian first, then the languages this channel's audience actually reads,
 * then the rest.
 */
export const CAPTION_LANGUAGES: CaptionLanguage[] = [
  { code: "sr", label: "Srpski" },
  { code: "sr-Latn", label: "Srpski (latinica)" },
  { code: "en", label: "Engleski" },
  { code: "hr", label: "Hrvatski" },
  { code: "bs", label: "Bosanski" },
  { code: "cnr", label: "Crnogorski" },
  { code: "sl", label: "Slovenački" },
  { code: "mk", label: "Makedonski" },
  { code: "sq", label: "Albanski" },
  { code: "hu", label: "Mađarski" },
  { code: "ro", label: "Rumunski" },
  { code: "bg", label: "Bugarski" },
  { code: "de", label: "Nemački" },
  { code: "fr", label: "Francuski" },
  { code: "it", label: "Italijanski" },
  { code: "es", label: "Španski" },
  { code: "pt", label: "Portugalski" },
  { code: "ru", label: "Ruski" },
  { code: "uk", label: "Ukrajinski" },
  { code: "tr", label: "Turski" },
  { code: "el", label: "Grčki" },
  { code: "nl", label: "Holandski" },
  { code: "pl", label: "Poljski" },
  { code: "cs", label: "Češki" },
  { code: "sk", label: "Slovački" },
  { code: "sv", label: "Švedski" },
  { code: "da", label: "Danski" },
  { code: "fi", label: "Finski" },
  { code: "ar", label: "Arapski" },
  { code: "he", label: "Hebrejski" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanski" },
  { code: "ko", label: "Korejski" },
  { code: "zh-Hans", label: "Kineski (pojednostavljeni)" },
  { code: "zh-Hant", label: "Kineski (tradicionalni)" },
];

/** Is this one of the codes the dropdown offers? */
export function isCaptionLanguage(code: string): boolean {
  return CAPTION_LANGUAGES.some((lang) => lang.code === code);
}

/** Human name for a code, falling back to the code itself for foreign tracks. */
export function captionLanguageLabel(code: string): string {
  return CAPTION_LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}

// ── format ───────────────────────────────────────────────────────────────────

/** The extension, when it is one we take. Null means "not a caption file". */
export function captionFormatFromFileName(fileName: string): CaptionFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".vtt")) return "vtt";
  if (lower.endsWith(".srt")) return "srt";
  return null;
}

/**
 * What the bytes actually are, regardless of what the file is called.
 *
 * The extension is the operator's claim; this is the check. A .srt that is
 * really a PDF would be accepted by the name test, sent, and cost 400 units to
 * have YouTube reject it.
 *
 *   - WebVTT must open with the token `WEBVTT`. That is the format's own rule,
 *     not ours — a file without it is not valid WebVTT.
 *   - SubRip has no header, so it is recognised by its timecode line, which is
 *     the one thing every SubRip cue has.
 *
 * WEBVTT is tested first because both formats share the timecode shape and a
 * VTT file would otherwise answer to the SubRip test.
 */
export function detectCaptionFormat(bytes: Uint8Array): CaptionFormat | null {
  // The first cue is enough; decoding a megabyte to identify a header is not.
  const head = new TextDecoder("utf-8")
    .decode(bytes.slice(0, 4096))
    .replace(/^\uFEFF/, "")
    .trimStart();

  if (head.startsWith("WEBVTT")) return "vtt";
  if (
    /\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(head)
  ) {
    return "srt";
  }
  return null;
}

/**
 * The Content-Type the file part carries.
 *
 * WebVTT has a registered type; SubRip does not have one YouTube documents, so
 * it goes as opaque bytes — which the captions endpoint accepts and parses by
 * content.
 */
export function captionContentType(format: CaptionFormat): string {
  return format === "vtt" ? "text/vtt" : "application/octet-stream";
}

// ── validation ───────────────────────────────────────────────────────────────

export type CaptionFileProblem = string | null;

/**
 * Everything that can be judged from the file alone, in one place, in the
 * words the operator sees. Returns null when the file is fine.
 */
export function checkCaptionFile(params: {
  fileName: string;
  size: number;
}): CaptionFileProblem {
  if (captionFormatFromFileName(params.fileName) === null) {
    return "Prihvataju se samo .srt i .vtt fajlovi. Izvezi titl u jednom od ta dva formata.";
  }
  if (params.size === 0) {
    return "Fajl je prazan.";
  }
  if (params.size > CAPTION_MAX_BYTES) {
    return `Fajl je veći od 1 MB (${formatKilobytes(params.size)}). Titl te veličine skoro sigurno nije titl — proveri da nisi izabrao pogrešan fajl.`;
  }
  return null;
}

/** Size in the unit a caption file is actually measured in. */
export function formatKilobytes(bytes: number): string {
  if (bytes >= CAPTION_MAX_BYTES) {
    return `${(bytes / CAPTION_MAX_BYTES).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

// ── the multipart body ───────────────────────────────────────────────────────

/**
 * `captions.insert` is not a JSON call and not a raw-bytes call: it is
 * `multipart/related`, one JSON part with the snippet and one part with the
 * file, separated by a boundary that also has to appear in the Content-Type
 * header. There is no library for this in the project and we are not adding
 * one, so the body is assembled here.
 *
 * Byte-level rather than string concatenation on purpose: the caption file is
 * text, but decoding and re-encoding it would quietly rewrite anything that is
 * not clean UTF-8 — and a subtitle file full of č and ž is exactly where that
 * shows up.
 *
 * CRLF between the headers and the body of each part is required by the
 * format; a bare LF is accepted by some servers and not by Google's.
 */
export function buildMultipartRelatedBody(params: {
  metadata: unknown;
  file: Uint8Array;
  fileContentType: string;
  boundary: string;
}): { body: Uint8Array; contentType: string } {
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${params.boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(params.metadata)}\r\n` +
      `--${params.boundary}\r\n` +
      `Content-Type: ${params.fileContentType}\r\n\r\n`,
  );
  const tail = encoder.encode(`\r\n--${params.boundary}--\r\n`);

  const body = new Uint8Array(head.length + params.file.length + tail.length);
  body.set(head, 0);
  body.set(params.file, head.length);
  body.set(tail, head.length + params.file.length);

  return {
    body,
    contentType: `multipart/related; boundary=${params.boundary}`,
  };
}

/**
 * A boundary that cannot occur inside the payload.
 *
 * A UUID is not merely unlikely to collide — a caption file containing this
 * exact random string would have to have been written after it was generated.
 */
export function newMultipartBoundary(): string {
  return `enigma-${crypto.randomUUID()}`;
}
