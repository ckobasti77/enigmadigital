/**
 * Video upload rules (Y10). Pure — no Convex imports — so the dialog and the
 * mutation apply exactly the same rules: the dialog refuses a bad file before
 * a byte leaves the machine, the mutation refuses it again before the daily
 * counter moves, because the dialog is not the only thing that can call it.
 *
 * PROČITAJ PRE SVEGA OSTALOG.
 *
 * Google, doslovno iz dokumentacije za `videos.insert`:
 *
 *   "All videos uploaded via the videos.insert endpoint from unverified API
 *    projects created after 28 July 2020 will be restricted to private
 *    viewing mode."
 *
 * Projekat enigma-command-center je napravljen posle tog datuma i nije prošao
 * YouTube API Services audit. Znači: SVAKI video poslat kroz ovu aplikaciju
 * ostaje privatan, i to se ne može promeniti — ni odavde, ni iz YouTube
 * Studija. Skida se isključivo tako što projekat prođe audit.
 *
 * Zato je privatnost ovde konstanta, a ne polje u formi, i backend šalje
 * `privacyStatus: "private"` bez obzira šta browser traži. Ponuditi opciju
 * „javno" koja ne radi gore je nego je ne ponuditi.
 */

// ── the restriction, in the words the operator reads ─────────────────────────

/** Shown above the send button, always, never folded into a tooltip. */
export const UPLOAD_PRIVATE_NOTICE =
  "Video poslat odavde ostaje PRIVATAN dok Google ne odobri aplikaciju. To je Google-ovo ograničenje za neproverene projekte i ne može se zaobići. Za javnu objavu koristi YouTube Studio dok odobrenje ne stigne.";

/** Why the privacy field is locked, next to the field itself. */
export const UPLOAD_PRIVACY_LOCK_REASON =
  "Privatnost se ne bira. YouTube zaključava svaki video poslat preko API-ja iz neproverenog projekta, pa bi svaka druga vrednost ovde bila laž.";

// ── limits YouTube enforces on the metadata ──────────────────────────────────

/** Longer titles are rejected outright. */
export const VIDEO_TITLE_MAX = 100;
/** Longer descriptions are rejected outright. */
export const VIDEO_DESCRIPTION_MAX = 5000;
/**
 * All tags joined by a comma may not exceed this. A limit on the TOTAL, not on
 * any single tag — a dozen ordinary tags already reach it.
 */
export const VIDEO_TAGS_TOTAL_MAX = 500;

/**
 * YouTube's assignable video categories, by the id the Data API expects.
 * Deliberately the subset that is assignable in every region — the full list
 * includes ids that only exist for old uploads and answer 400 on write.
 */
export const VIDEO_CATEGORIES: { id: string; label: string }[] = [
  { id: "1", label: "Film i animacija" },
  { id: "2", label: "Automobili i vozila" },
  { id: "10", label: "Muzika" },
  { id: "15", label: "Kućni ljubimci i životinje" },
  { id: "17", label: "Sport" },
  { id: "19", label: "Putovanja i događaji" },
  { id: "20", label: "Igre" },
  { id: "22", label: "Ljudi i blogovi" },
  { id: "23", label: "Komedija" },
  { id: "24", label: "Zabava" },
  { id: "25", label: "Vesti i politika" },
  { id: "26", label: "Uputstva i stil" },
  { id: "27", label: "Obrazovanje" },
  { id: "28", label: "Nauka i tehnologija" },
  { id: "29", label: "Neprofitne organizacije i aktivizam" },
];

/** What a video gets when the operator picks nothing — "Ljudi i blogovi". */
export const DEFAULT_VIDEO_CATEGORY_ID = "22";

/** Is this an id the Data API will accept from us? */
export function isVideoCategoryId(id: string): boolean {
  return VIDEO_CATEGORIES.some((category) => category.id === id);
}

// ── the file ─────────────────────────────────────────────────────────────────

/** What the file input advertises. */
export const VIDEO_ACCEPT_ATTRIBUTE = "video/*";

/**
 * Past this the upload is a long sitting, not a click.
 *
 * Not a refusal: YouTube itself takes up to 256 GB, and a 3 GB master is an
 * ordinary thing to publish. The operator is told what they are starting so
 * they do not close the tab twenty minutes in.
 */
export const LARGE_FILE_WARNING_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * How much goes in one PUT.
 *
 * Google requires every chunk except the last to be a multiple of 256 KB;
 * 8 MB is a common compromise — large enough that a big file is not thousands
 * of round trips, small enough that a dropped connection re-sends seconds of
 * work rather than minutes. It is also the granularity of the progress bar,
 * since `fetch` reports nothing while a request body is in flight.
 */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

/** Google's chunk alignment. Asserted on the constant above, not guessed at. */
export const UPLOAD_CHUNK_ALIGNMENT = 256 * 1024;

/** Everything judgeable from the file alone, in the operator's words. */
export function checkVideoFile(params: {
  fileName: string;
  size: number;
  type: string;
}): string | null {
  if (params.size === 0) {
    return "Fajl je prazan.";
  }
  // The browser fills `type` from the extension. An empty one means it did not
  // recognise the file at all, which YouTube will not either.
  if (!params.type.toLowerCase().startsWith("video/")) {
    return params.type.length === 0
      ? "Nije prepoznat tip fajla. Izaberi video fajl (npr. .mp4, .mov, .webm)."
      : `Ovo nije video fajl (${params.type}). Izaberi video — .mp4, .mov, .webm i slično.`;
  }
  return null;
}

/** Everything judgeable from the typed metadata, in the operator's words. */
export function checkVideoMetadata(params: {
  title: string;
  description: string;
  tags: string[];
}): string | null {
  const title = params.title.trim();
  if (title.length === 0) return "Naslov je obavezan.";
  if (title.length > VIDEO_TITLE_MAX) {
    return `Naslov može imati najviše ${VIDEO_TITLE_MAX} znakova.`;
  }
  if (params.description.length > VIDEO_DESCRIPTION_MAX) {
    return `Opis može imati najviše ${VIDEO_DESCRIPTION_MAX} znakova.`;
  }
  const total = normalizeTags(params.tags).join(",").length;
  if (total > VIDEO_TAGS_TOTAL_MAX) {
    return `Tagovi zajedno mogu imati najviše ${VIDEO_TAGS_TOTAL_MAX} znakova — trenutno ih ima ${total}. Ukloni neki tag.`;
  }
  return null;
}

/** Trimmed, de-duplicated, empties dropped. The list that actually goes out. */
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (tag.length === 0) continue;
    if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

// ── Shorts ───────────────────────────────────────────────────────────────────

/**
 * There is no Shorts API, and no flag on the video that makes one.
 *
 * A Short is an ordinary upload that YouTube itself reclassifies afterwards,
 * by two properties of the file: it is taller than it is wide, and it runs no
 * longer than three minutes. Nothing we send changes that verdict, so the
 * dialog only reads the file and says what will happen — it never edits it.
 */
export const SHORTS_MAX_SECONDS = 180;

export type VideoShape = "short" | "vertical_long" | "regular";

/**
 * Which of the three a chosen file is.
 *
 * `unknown` is a real fourth case handled by the caller: a browser that cannot
 * decode the container reports zeroes, and claiming "this will be a Short" on
 * no evidence is worse than saying nothing.
 */
export function classifyVideoShape(params: {
  width: number;
  height: number;
  durationSeconds: number;
}): VideoShape {
  const vertical = params.height > params.width;
  if (!vertical) return "regular";
  return params.durationSeconds <= SHORTS_MAX_SECONDS
    ? "short"
    : "vertical_long";
}

// ── formatting ───────────────────────────────────────────────────────────────

/** File size in the unit a video is actually measured in. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** Seconds as "m:ss" or "h:mm:ss" — how a runtime is read, not a duration. */
export function formatDurationSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`;
}
