/**
 * Custom thumbnail rules (Y8). Pure — no Convex imports — so the dialog and
 * the action apply exactly the same rules: the dialog refuses a bad image
 * before a byte leaves the machine, the action refuses it again before the
 * daily counter moves, because the dialog is not the only thing that can call
 * it.
 *
 * PROČITAJ OVO PRE NEGO ŠTO DIRAŠ FORMU.
 *
 * `thumbnails.set` je 50 jedinica po pozivu i naplaćuje se i kad ne uspe. Sve
 * što se može proveriti iz samog fajla proverava se OVDE, pre slanja — jer
 * YouTube na prevelik ili nepodržan fajl odgovori greškom tek pošto je već
 * naplatio poziv.
 *
 * I jedna stvar koja se ne vidi iz fajla: prilagođene sličice nisu uključene
 * na svakom nalogu. Kanal mora biti verifikovan brojem telefona; dok nije,
 * svaki poziv ovde vraća 403. Zato ovaj fajl nosi i prevod te greške
 * (THUMBNAIL_NOT_ENABLED_MESSAGE) — sirova engleska poruka nikome ne kaže šta
 * da uradi.
 */

// ── what YouTube accepts ─────────────────────────────────────────────────────

/**
 * Hard ceiling. Anything larger is refused by YouTube outright, and the
 * refusal costs the same 50 units as a successful call.
 */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;

/** The image formats `thumbnails.set` takes. WebP and GIF are not among them. */
export type ThumbnailType = "image/jpeg" | "image/png";

export const THUMBNAIL_ALLOWED_TYPES: ThumbnailType[] = [
  "image/jpeg",
  "image/png",
];

/** What the file input advertises. */
export const THUMBNAIL_ACCEPT_ATTRIBUTE =
  "image/jpeg,image/png,.jpg,.jpeg,.png";

/** What YouTube recommends, and what the preview frames against. */
export const THUMBNAIL_RECOMMENDED_WIDTH = 1280;
export const THUMBNAIL_RECOMMENDED_HEIGHT = 720;

/**
 * Below this the image is worth a word, not a refusal.
 *
 * YouTube accepts a 480 px thumbnail and scales it up; it just looks soft on
 * a full-width player. That is a recommendation, so the operator gets a
 * warning and the send button stays enabled — refusing here would block a
 * legitimate upload over taste.
 */
export const THUMBNAIL_MIN_COMFORTABLE_WIDTH = 640;

// ── checks that must pass before a single unit is spent ──────────────────────

/**
 * Everything judgeable from the file alone, in the operator's words.
 *
 * Returns null when the file may be sent. `type` is what the browser read off
 * the extension in the dialog, and what the action re-derives from the bytes
 * themselves — a renamed .webp passes the first check and fails the second.
 */
export function checkThumbnailFile(params: {
  size: number;
  type: string;
}): string | null {
  if (params.size === 0) return "Fajl je prazan.";
  if (params.size > THUMBNAIL_MAX_BYTES) {
    return `Slika je ${formatThumbnailSize(params.size)}, a granica je 2 MB. YouTube veće odbija — smanji je i pokušaj ponovo.`;
  }

  const type = params.type.toLowerCase();
  if (!THUMBNAIL_ALLOWED_TYPES.includes(type as ThumbnailType)) {
    return type.length === 0
      ? "Nije prepoznat tip fajla. Sličica mora biti JPG ili PNG."
      : `Ovaj format (${type}) nije podržan. Sličica mora biti JPG ili PNG — WebP i GIF YouTube ne prima.`;
  }
  return null;
}

/**
 * The soft note about dimensions. Never blocks: it is advice, and the operator
 * may well know their image is a still from a vertical video.
 */
export function thumbnailSizeWarning(params: {
  width: number;
  height: number;
}): string | null {
  if (params.width === 0 || params.height === 0) return null;
  if (params.width < THUMBNAIL_MIN_COMFORTABLE_WIDTH) {
    return `Slika je široka ${params.width} px. Preporuka je ${THUMBNAIL_RECOMMENDED_WIDTH}×${THUMBNAIL_RECOMMENDED_HEIGHT} — ovoliko će izgledati mutno na velikom ekranu. Može se poslati i ovakva.`;
  }
  const ratio = params.width / params.height;
  const target = THUMBNAIL_RECOMMENDED_WIDTH / THUMBNAIL_RECOMMENDED_HEIGHT;
  if (Math.abs(ratio - target) > 0.15) {
    return `Odnos stranica je ${ratio.toFixed(2)}:1, a plejer očekuje 16:9. YouTube će sliku iseći ili dodati crne trake.`;
  }
  return null;
}

/**
 * What the bytes actually are, regardless of the extension.
 *
 * The extension was the operator's claim; this is the check. A .webp renamed
 * to .jpg passes the browser's own sniffing and would cost the full 50 units
 * to have YouTube refuse it.
 */
export function detectThumbnailType(bytes: Uint8Array): ThumbnailType | null {
  // JPEG: FF D8 FF — the SOI marker plus the first segment's leading byte.
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG: the fixed 8-byte signature.
  const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  return null;
}

// ── the error that is not really an error ────────────────────────────────────

/**
 * Custom thumbnails are a per-channel privilege, not an API feature.
 *
 * Until the channel is verified by phone, `thumbnails.set` answers 403 for
 * every video on it. Google's own wording for this is a sentence about
 * authorisation that sends people looking at their OAuth scopes for an hour;
 * the actual fix is two minutes in YouTube Studio.
 */
export const THUMBNAIL_NOT_ENABLED_MESSAGE =
  "Kanal još nema uključene prilagođene sličice. Uključi ih u YouTube Studiju: Podešavanja → Kanal → Podobnost za funkcije → verifikuj broj telefona.";

/**
 * The other thing a 403 here can mean, said in one line after the message
 * above rather than instead of it.
 *
 * `isThumbnailNotEnabled` reads every 403 as the unverified channel, because
 * that is what it nearly always is and because the raw alternative helps
 * nobody. This sentence is what keeps the rarer case — somebody else's video —
 * from being invisible.
 */
export const THUMBNAIL_FORBIDDEN_HINT =
  "Ako je kanal već verifikovan, proveri da li ovaj video pripada povezanom nalogu.";

/**
 * Is this failure the unverified-channel one?
 *
 * Deliberately broad, in both directions the spec asks for: any 403 from
 * `thumbnails.set`, and any message that mentions custom thumbnails whatever
 * the status. `body` here is already the extracted message
 * (`extractYouTubeApiError`), which carries Google's `reason` in parentheses —
 * so "forbidden" is matched on the text too.
 */
export function isThumbnailNotEnabled(status: number, body: string): boolean {
  const text = body.toLowerCase();
  if (text.includes("custom thumbnail")) return true;
  if (text.includes("forbidden")) return true;
  return status === 403;
}

// ── formatting ───────────────────────────────────────────────────────────────

/** Image size in the unit a thumbnail is argued about in. */
export function formatThumbnailSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}
