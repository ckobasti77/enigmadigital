/**
 * ============================================================================
 * THREADS PUBLISHING — DOMENSKA PRAVILA I VALIDACIJA (Pure TypeScript)
 * ============================================================================
 *
 * Pravila objavljivanja na Threads platformi (§4.1, §4.2, §4.3, §8).
 * Pure modul bez Convex zavisnosti: ista pravila važe i u browser composer-u
 * i u server mutacijama pre kreiranja Meta kontejnera.
 *
 * Tok objavljivanja:
 *   1. POST /{user-id}/threads           -> pravi kontejner, vraća `id`
 *   2. GET /{container-id}?fields=status -> čeka status `FINISHED` (do 24h)
 *   3. POST /{user-id}/threads_publish   -> objavljuje kontejner (`creation_id`)
 *
 * Za Carousel: trokoračno (svaki child -> parent CAROUSEL container -> publish).
 * Za TEXT objave: `auto_publish_text=true` može preskočiti publish korak.
 * ============================================================================
 */

export type ThreadsPublishMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";

export type ThreadsPublishStatus =
  | "draft"
  | "queued"
  | "uploading"
  | "processing"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export const THREADS_PUBLISH_MEDIA_TYPES: ThreadsPublishMediaType[] = [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "CAROUSEL",
];

export const MEDIA_TYPE_LABELS: Record<ThreadsPublishMediaType, string> = {
  TEXT: "Tekst",
  IMAGE: "Slika",
  VIDEO: "Video",
  CAROUSEL: "Carousel",
};

export const STATUS_LABELS: Record<ThreadsPublishStatus, string> = {
  draft: "Skica",
  queued: "Na čekanju",
  uploading: "Šalje se na Threads",
  processing: "Threads obrađuje",
  publishing: "Objavljuje se",
  published: "Objavljeno",
  failed: "Neuspešno",
  canceled: "Otkazano",
};

export const PUBLISHED_UNCONFIRMED_LABEL = "Objavljeno, ID nije potvrđen";

// ── Ograničenja platforme (§4.2, §4.3) ──────────────────────────────────────

/** Tekst objave je ograničen na 500 karaktera (broji se u UTF-8 bajtovima). */
export const TEXT_MAX_BYTES = 500;

/** Alt tekst za slike/video/carousel — do 1000 karaktera. */
export const ALT_TEXT_MAX_CHARS = 1000;

/** Topic tag — 1 do 50 karaktera, bez . i &. */
export const TOPIC_TAG_MAX_CHARS = 50;

/** Carousel mora imati između 2 i 20 slajdova (§4.2). */
export const CAROUSEL_MIN_ITEMS = 2;
export const CAROUSEL_MAX_ITEMS = 20;

/** Slika: JPEG/PNG do 8 MB (§4.3). */
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
];

/** Video: MOV/MP4 do 1 GB (§4.3). */
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;
export const VIDEO_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
];

/** Dozvoljeni MIME tipovi za medije. */
export const ALLOWED_MEDIA_CONTENT_TYPES = [
  ...IMAGE_CONTENT_TYPES,
  ...VIDEO_CONTENT_TYPES,
];

/** Anketa: svaka opcija ima od 1 do 25 karaktera (Dodatak A.1). */
export const POLL_OPTION_MAX_CHARS = 25;

// ── Vremenski okviri i pokušaji ─────────────────────────────────────────────

/** Razmaci između pokušaja ponovnog slanja (1 min, 5 min, 15 min). */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 4 pokušaja ukupno

export function retryDelayMs(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? null;
}

/** Vreme prepoznavanja zaglavljenih poslova (stale thresholds). */
export const STALE_UPLOADING_MS = 15 * 60_000;
export const STALE_PROCESSING_MS = 35 * 60_000;
export const STALE_PUBLISHING_MS = 15 * 60_000;

/** Maksimalni rok obrade kontejnera na Threads pre odustajanja (30 min). */
export const PROCESSING_DEADLINE_MS = 30 * 60_000;

/** TTL za fajlove u storage-u nakon neuspeha ili uploada (24 sata). */
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

/** Napušten posao koji nije poslat više od 7 dana od zakazanog termina. */
export const ABANDONED_AFTER_DUE_MS = 7 * 24 * 60 * 60 * 1000;

/** Maksimalno zakazivanje unapred (90 dana). */
export const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

// ── Funkcije za validaciju sa porukama na srpskom ───────────────────────────

/** Brojanje dužine teksta u UTF-8 bajtovima (emojiji troše više bajtova). */
export function utf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/** Validacija broja fajlova za izabrani tip objave. */
export function checkItemCount(
  mediaType: ThreadsPublishMediaType,
  count: number,
): string | null {
  if (mediaType === "TEXT") {
    if (count > 0) {
      return "Tekstualna objava ne sme sadržati fajlove slika ili videa.";
    }
    return null;
  }

  if (mediaType === "IMAGE" || mediaType === "VIDEO") {
    if (count === 0) {
      return `${mediaType === "IMAGE" ? "Slika" : "Video"} zahteva tačno jedan fajl.`;
    }
    if (count > 1) {
      return `${mediaType === "IMAGE" ? "Slika" : "Video"} može imati samo jedan fajl. Za više fajlova izaberi Carousel.`;
    }
    return null;
  }

  if (mediaType === "CAROUSEL") {
    if (count < CAROUSEL_MIN_ITEMS) {
      return `Carousel objava mora imati najmanje ${CAROUSEL_MIN_ITEMS} stavke.`;
    }
    if (count > CAROUSEL_MAX_ITEMS) {
      return `Carousel objava može imati najviše ${CAROUSEL_MAX_ITEMS} stavki (izabrano ${count}).`;
    }
    return null;
  }

  return "Nepoznat tip objave.";
}

/** Validacija teksta objave (max 500 karaktera / UTF-8 bajtova). */
export function checkText(params: {
  mediaType: ThreadsPublishMediaType;
  text?: string;
}): string | null {
  const { text } = params;
  if (text === undefined || text === null) return null;

  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const bytes = utf8ByteLength(trimmed);
  if (bytes > TEXT_MAX_BYTES) {
    return `Tekst objave je predugačak: ${bytes} bajtova (dozvoljeno je najviše ${TEXT_MAX_BYTES}). Emojiji zauzimaju više bajtova.`;
  }
  return null;
}

/** Validacija alt teksta (max 1000 karaktera, samo uz medije). */
export function checkAltText(params: {
  mediaType: ThreadsPublishMediaType;
  altText?: string;
}): string | null {
  const { mediaType, altText } = params;
  if (!altText || altText.trim().length === 0) return null;

  if (mediaType === "TEXT") {
    return "Alt tekst se može postaviti samo uz sliku, video ili carousel, ne uz tekstualnu objavu.";
  }

  if (altText.trim().length > ALT_TEXT_MAX_CHARS) {
    return `Alt tekst je predugačak: ${altText.trim().length} karaktera (maksimalno ${ALT_TEXT_MAX_CHARS}).`;
  }
  return null;
}

/** Validacija topic taga (1-50 karaktera, bez . i &). */
export function checkTopicTag(topicTag?: string): string | null {
  if (!topicTag || topicTag.trim().length === 0) return null;

  const trimmed = topicTag.trim();
  if (trimmed.length > TOPIC_TAG_MAX_CHARS) {
    return `Topic tag može imati najviše ${TOPIC_TAG_MAX_CHARS} karaktera (trenutno ${trimmed.length}).`;
  }

  if (trimmed.includes(".") || trimmed.includes("&")) {
    return "Topic tag ne sme sadržati tačku (.) ili znak (&).";
  }

  return null;
}

/** Validacija ankete (samo uz TEXT, 2-4 opcije, svaka 1-25 karaktera). */
export function checkPollAttachment(params: {
  mediaType: ThreadsPublishMediaType;
  pollAttachment?: {
    option_a: string;
    option_b: string;
    option_c?: string;
    option_d?: string;
  };
}): string | null {
  const { mediaType, pollAttachment } = params;
  if (!pollAttachment) return null;

  if (mediaType !== "TEXT") {
    return "Anketa se može dodati isključivo na tekstualne objave.";
  }

  const optA = pollAttachment.option_a?.trim() ?? "";
  const optB = pollAttachment.option_b?.trim() ?? "";
  if (optA.length === 0 || optB.length === 0) {
    return "Anketa mora imati najmanje dve obavezne opcije (opcija A i opcija B).";
  }

  if (optA.length > POLL_OPTION_MAX_CHARS) {
    return `Opcija A u anketi ima ${optA.length} karaktera (dozvoljeno je najviše ${POLL_OPTION_MAX_CHARS}).`;
  }
  if (optB.length > POLL_OPTION_MAX_CHARS) {
    return `Opcija B u anketi ima ${optB.length} karaktera (dozvoljeno je najviše ${POLL_OPTION_MAX_CHARS}).`;
  }

  if (pollAttachment.option_c !== undefined) {
    const optC = pollAttachment.option_c.trim();
    if (optC.length === 0) {
      return "Opcija C u anketi ne sme biti prazan tekst ako je navedena.";
    }
    if (optC.length > POLL_OPTION_MAX_CHARS) {
      return `Opcija C u anketi ima ${optC.length} karaktera (dozvoljeno je najviše ${POLL_OPTION_MAX_CHARS}).`;
    }
  }

  if (pollAttachment.option_d !== undefined) {
    if (pollAttachment.option_c === undefined) {
      return "Nije moguće navesti opciju D bez opcije C u anketi.";
    }
    const optD = pollAttachment.option_d.trim();
    if (optD.length === 0) {
      return "Opcija D u anketi ne sme biti prazan tekst ako je navedena.";
    }
    if (optD.length > POLL_OPTION_MAX_CHARS) {
      return `Opcija D u anketi ima ${optD.length} karaktera (dozvoljeno je najviše ${POLL_OPTION_MAX_CHARS}).`;
    }
  }

  return null;
}

/** Validacija link priloga (samo uz TEXT). */
export function checkLinkAttachment(params: {
  mediaType: ThreadsPublishMediaType;
  linkAttachment?: string;
}): string | null {
  const { mediaType, linkAttachment } = params;
  if (!linkAttachment || linkAttachment.trim().length === 0) return null;

  if (mediaType !== "TEXT") {
    return "Link prilog (link_attachment) je dozvoljen samo za tekstualne objave.";
  }
  return null;
}

/** Validacija autoPublishText (samo uz TEXT). */
export function checkAutoPublishText(params: {
  mediaType: ThreadsPublishMediaType;
  autoPublishText?: boolean;
}): string | null {
  const { mediaType, autoPublishText } = params;
  if (autoPublishText === undefined) return null;

  if (mediaType !== "TEXT" && autoPublishText === true) {
    return "Automatsko objavljivanje teksta (auto_publish_text) je dozvoljeno samo za tekstualne objave.";
  }
  return null;
}

/** Validacija spoiler oznake za medije (samo uz IMAGE/VIDEO/CAROUSEL). */
export function checkSpoilerMedia(params: {
  mediaType: ThreadsPublishMediaType;
  isSpoilerMedia?: boolean;
}): string | null {
  const { mediaType, isSpoilerMedia } = params;
  if (!isSpoilerMedia) return null;

  if (mediaType === "TEXT") {
    return "Oznaka za spoiler na mediju (is_spoiler_media) je dozvoljena samo uz sliku, video ili carousel.";
  }
  return null;
}

/**
 * Provera formata i veličine fajla na osnovu storage metapodataka (§4.3).
 * Ono što se ne može proveriti bez raspakivanja bajtova (FPS, odnos stranica,
 * trajanje videa) se ne proverava ovde.
 */
export function checkFile(params: {
  mediaType: ThreadsPublishMediaType;
  size: number;
  type: string;
}): string | null {
  const { mediaType, size, type } = params;
  const mime = type.toLowerCase().trim();

  if (mediaType === "IMAGE") {
    if (!IMAGE_CONTENT_TYPES.includes(mime)) {
      return `Format slike nije podržan (${mime || "nepoznat format"}). Threads podržava JPEG i PNG slike.`;
    }
    if (size > IMAGE_MAX_BYTES) {
      return `Slika je prevelika (${(size / (1024 * 1024)).toFixed(1)} MB). Maksimalna dozvoljena veličina slike je 8 MB.`;
    }
    return null;
  }

  if (mediaType === "VIDEO") {
    if (!VIDEO_CONTENT_TYPES.includes(mime)) {
      return `Format videa nije podržan (${mime || "nepoznat format"}). Threads podržava MP4 i MOV video zapise.`;
    }
    if (size > VIDEO_MAX_BYTES) {
      return `Video je prevelik (${(size / (1024 * 1024)).toFixed(1)} MB). Maksimalna dozvoljena veličina videa je 1 GB.`;
    }
    return null;
  }

  if (mediaType === "CAROUSEL") {
    const isImage = IMAGE_CONTENT_TYPES.includes(mime);
    const isVideo = VIDEO_CONTENT_TYPES.includes(mime);

    if (!isImage && !isVideo) {
      return `Fajl u carouselu nije podržanog formata (${mime || "nepoznat format"}). Dozvoljeni su JPEG/PNG za slike i MP4/MOV za video.`;
    }
    if (isImage && size > IMAGE_MAX_BYTES) {
      return `Slika u carouselu je prevelika (${(size / (1024 * 1024)).toFixed(1)} MB, maks 8 MB).`;
    }
    if (isVideo && size > VIDEO_MAX_BYTES) {
      return `Video u carouselu je prevelik (${(size / (1024 * 1024)).toFixed(1)} MB, maks 1 GB).`;
    }
    return null;
  }

  return null;
}

/** Validacija zakazanog vremena objave. */
export function checkScheduledFor(scheduledFor: number, now: number): string | null {
  if (!Number.isFinite(scheduledFor)) {
    return "Neispravan format zakazanog vremena.";
  }
  // Tolerancija od 60 sekundi za blagu razliku satova
  if (scheduledFor < now - 60_000) {
    return "Zakazano vreme ne može biti u prošlosti.";
  }
  if (scheduledFor > now + MAX_SCHEDULE_AHEAD_MS) {
    return "Objavu nije moguće zakazati više od 90 dana unapred.";
  }
  return null;
}
