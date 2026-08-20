/**
 * Instagram publishing rules (F3). Pure — no Convex imports — so the composer
 * in the browser and the mutation on the server apply exactly the same rules:
 * the composer refuses a bad file before a byte leaves the machine, the
 * mutation refuses it again before a container is created, because the
 * composer is not the only thing that can call it.
 *
 * PROČITAJ PRE SVEGA OSTALOG.
 *
 * Instagram NE prima bajtove od nas. Kontejner se pravi tako što mu se da
 * JAVNA adresa fajla (`image_url` / `video_url`), pa Instagram sam povuče fajl
 * sa te adrese. Zato fajl prvo ide u Convex storage, servira se sa javne rute
 * `/ig-upload/<storageId>` (convex/http.ts), i tek onda se pravi kontejner.
 *
 * Objavljivanje je uvek dva poziva:
 *   POST /{ig-user-id}/media          → napravi kontejner, vrati `id`
 *   POST /{ig-user-id}/media_publish  → objavi taj kontejner (`creation_id`)
 *
 * Između njih ide anketiranje `GET /{container-id}?fields=status_code` dok ne
 * vrati `FINISHED`. Objaviti pre toga je greška, ne trka koju vredi rizikovati.
 */

// ── what is being published ──────────────────────────────────────────────────

export type PublishKind = "IMAGE" | "REEL" | "STORY" | "CAROUSEL";

/**
 * Tok stanja: `queued → uploading → processing → publishing → published`.
 * Svaki prelaz se upisuje, jer panel prikazuje gde je posao TRENUTNO — „šalje
 * se" je jedna reč za četiri različite stvari koje traju različito dugo.
 *
 * `publishing` se upisuje PRE poziva `media_publish`, ne posle. Ako pokretanje
 * umre između poziva i odgovora (istekla akcija, prekinut socket), sledeći
 * prolaz vidi `publishing` sa kontejnerom i mora prvo da PITA Instagram šta se
 * desilo — jer ponovno slanje pravi drugu objavu na profilu, a to se ne
 * povlači.
 *
 * `draft` postoji u tabeli i nikad se ne upisuje iz ovog koda: forma živi u
 * browseru dok se ne pošalje. Ostavljen je jer je snimljena skica sledeće
 * očigledna stvar koja se traži, a status koji tada treba već ima ime.
 */
export type PublishStatus =
  | "draft"
  | "queued"
  | "uploading"
  | "processing"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export const PUBLISH_KINDS: PublishKind[] = [
  "IMAGE",
  "REEL",
  "STORY",
  "CAROUSEL",
];

export const KIND_LABELS: Record<PublishKind, string> = {
  IMAGE: "Slika",
  REEL: "Reel",
  STORY: "Story",
  CAROUSEL: "Carousel",
};

export const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: "Skica",
  queued: "Na čekanju",
  uploading: "Šalje se na Instagram",
  processing: "Instagram obrađuje",
  publishing: "Objavljuje se",
  published: "Objavljeno",
  failed: "Neuspešno",
  canceled: "Otkazano",
};

/**
 * Objava jeste otišla, ali se ne zna KOJA je to objava.
 *
 * Kontejner je odgovorio `PUBLISHED`, što znači da je neko ranije pokretanje
 * uspelo i izgubilo odgovor. Panel to kaže naglas umesto da prikaže red kao da
 * je sve uredno — bez `publishedMediaId` nema linka ni brojeva, i bolje je da
 * piše zašto.
 */
export const PUBLISHED_UNCONFIRMED_LABEL = "Objavljeno, ID nije potvrđen";

/** Story nosi sliku ili video preko celog ekrana — opis nema gde da stane. */
export function acceptsCaption(kind: PublishKind): boolean {
  return kind !== "STORY";
}

/** Samo Reel ima izbor da li se pojavljuje i u feed-u. */
export function acceptsShareToFeed(kind: PublishKind): boolean {
  return kind === "REEL";
}

/** Koliko fajlova ide u jednu objavu. */
export function itemRange(kind: PublishKind): { min: number; max: number } {
  return kind === "CAROUSEL"
    ? { min: CAROUSEL_MIN, max: CAROUSEL_MAX }
    : { min: 1, max: 1 };
}

// ── limits Instagram enforces ────────────────────────────────────────────────

/** Duži opis Instagram odbija. */
export const CAPTION_MAX = 2200;
/** Više hashtagova Instagram odbija. */
export const HASHTAG_MAX = 30;

export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 10;

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

export const VIDEO_MIN_SECONDS = 3;
export const VIDEO_MAX_SECONDS = 15 * 60;
/** Story se prekida na minutu, bez obzira na to koliko video traje. */
export const STORY_VIDEO_MAX_SECONDS = 60;

/**
 * Odnos stranica koji feed prima: od 4:5 (uspravno) do 1.91:1 (položeno).
 *
 * NE važi za Story. Story je 9:16, dakle 0.5625 — daleko ispod donje granice,
 * pa bi ovo pravilo odbilo baš svaki ispravan story. Za story se odnos ne
 * odbija nego se kaže šta će Instagram uraditi (`storyAspectNote`).
 */
export const ASPECT_MIN = 4 / 5;
export const ASPECT_MAX = 1.91;

/** Instagram prima JPEG i ništa drugo. PNG i WebP se odbijaju bez poruke. */
export const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/jpg"];
/** MP4 i MOV. */
export const VIDEO_CONTENT_TYPES = ["video/mp4", "video/quicktime"];

/** Kada Graph API ne odgovori na `content_publishing_limit`. */
export const PUBLISH_LIMIT_FALLBACK = 100;

// ── timings the pipeline runs on ─────────────────────────────────────────────

/**
 * Razmak posle neuspelog pokušaja broj N (1-indeksirano).
 *
 * Spec traži razmake 1 min, 5 min i 15 min. Tri razmaka postoje samo ako ima
 * četiri pokretanja — prvi pokušaj i tri ponavljanja — pa je plafon četiri, a
 * ne tri. Ranije je stajalo tri, i onda unos od 15 min nikada nije dohvaćen:
 * pravilo iz specifikacije je postojalo u nizu i nije se primenjivalo.
 */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

/** Koliko se puta jedan posao uopšte pokreće: prvi put + `RETRY_DELAYS_MS`. */
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;

/** `null` znači da je plafon dostignut i da posao ide u `failed`. */
export function retryDelayMs(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return RETRY_DELAYS_MS[Math.max(0, attempts - 1)] ?? null;
}

/**
 * Posle koliko vremena „radi se na tome" prestaje da bude istina.
 *
 * `claimedAt` se upisuje pri SVAKOM preuzimanju posla, i anketiranje se nastavlja
 * novom akcijom, pa ova granica meri koliko dugo nijedno pokretanje nije dotaklo
 * posao — a ne koliko posao ukupno traje.
 *
 * Svaki prag je namerno iznad životnog veka jednog pokretanja: akcija ima
 * ograničeno vreme izvršavanja (reda nekoliko minuta), a anketiranje se javlja
 * najmanje jednom u ~5 min (`POLL_BUDGET_MS` + `POLL_CONTINUE_MS`). To je ceo
 * bezbednosni argument za vraćanje posla u red — kada prag istekne, pokretanje
 * koje je posao preuzelo više NE MOŽE biti živo, pa nema dva pokretača nad
 * istim poslom.
 */
export const STALE_UPLOADING_MS = 15 * 60_000;
/** Malo iznad roka obrade od 30 min, iz istog razloga. */
export const STALE_PROCESSING_MS = 35 * 60_000;
/**
 * `publishing` je jedan HTTP poziv, ne obrada — ako se za ovoliko nije rešio,
 * pokretanja nema. Vraćanje u red je bezbedno jer sledeći prolaz prvo pita
 * kontejner da li je već objavljen.
 */
export const STALE_PUBLISHING_MS = 15 * 60_000;

/**
 * Kada zakazana objava prestaje da bude zakazana i postaje mrtva.
 *
 * Zakazivanje ide do 90 dana unapred, pa starost reda ne govori ništa o tome
 * da li posao još ima smisla. Ovo govori: termin je prošao pre nedelju dana, a
 * objava nikada nije otišla. Tu se posao zatvara kao neuspeo i tek onda mu se
 * uzimaju fajlovi.
 */
export const ABANDONED_AFTER_DUE_MS = 7 * 24 * 60 * 60 * 1000;

/** Razmak između dva pitanja „je li kontejner gotov". */
export const POLL_INTERVAL_MS = 3_000;

/**
 * Koliko jedan pokretač sme da provede anketirajući. Akcija ima svoje vreme,
 * a video od petnaest minuta se obrađuje duže od bilo kog razumnog čekanja u
 * jednom pozivu — pa se posle ovoga zakazuje nastavak umesto da se visi.
 */
export const POLL_BUDGET_MS = 4 * 60_000;

/** Razmak do nastavka anketiranja, kada budžet jednog pokretanja istekne. */
export const POLL_CONTINUE_MS = 60_000;

/**
 * Dokle se uopšte čeka na Instagram. Kontejner živi 24 h, ali video koji se
 * pola sata „obrađuje" nije spor nego zaglavljen, i bolje je to reći.
 */
export const PROCESSING_DEADLINE_MS = 30 * 60_000;

/**
 * Koliko fajl ostaje u storage-u kada objava ne uspe.
 *
 * Posle uspešne objave fajl se briše odmah — Instagram ga sada ima i nema
 * razloga da tuđi video stoji i kod nas. Posle neuspeha ostaje, da bi
 * „Pokušaj ponovo" imao šta da pošalje, i cron ga počisti posle 24 h.
 */
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

// ── formatting ───────────────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace(".", ",")} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/** Sekunde kao „m:ss" — tako se čita trajanje, ne kao „92 s". */
export function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

/**
 * Serbian counts the noun, not just the numeral: 1 fajl, 2 fajla, 5 fajlova —
 * and 11 through 14 break the pattern that 21 and 24 follow.
 */
export function pluralFiles(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} fajlova`;
  if (last === 1) return `${count} fajl`;
  if (last >= 2 && last <= 4) return `${count} fajla`;
  return `${count} fajlova`;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * Odnos stranica onako kako se izgovara: „3:1", „4:5", pa tek kada se ne
 * skrati na male brojeve — „2,37:1". Poruka koja kaže „1500×500" ne kaže
 * ništa; poruka koja kaže „3:1" kaže tačno u čemu je problem.
 */
export function formatAspectRatio(width: number, height: number): string {
  if (width <= 0 || height <= 0) return "—";
  const divisor = greatestCommonDivisor(width, height) || 1;
  const w = Math.round(width / divisor);
  const h = Math.round(height / divisor);
  if (w <= 40 && h <= 40) return `${w}:${h}`;

  const ratio = width / height;
  const decimal = (value: number) =>
    (Math.round(value * 100) / 100).toString().replace(".", ",");
  return ratio >= 1 ? `${decimal(ratio)}:1` : `1:${decimal(1 / ratio)}`;
}

// ── the file, judged from the file alone ─────────────────────────────────────

export function isImageContentType(type: string): boolean {
  return IMAGE_CONTENT_TYPES.includes(type.toLowerCase().split(";")[0].trim());
}

export function isVideoContentType(type: string): boolean {
  return VIDEO_CONTENT_TYPES.includes(type.toLowerCase().split(";")[0].trim());
}

/** Šta `<input type="file">` uopšte nudi za izabrani tip objave. */
export function acceptAttribute(kind: PublishKind): string {
  if (kind === "IMAGE") return IMAGE_CONTENT_TYPES.join(",");
  if (kind === "REEL") return VIDEO_CONTENT_TYPES.join(",");
  return [...IMAGE_CONTENT_TYPES, ...VIDEO_CONTENT_TYPES].join(",");
}

/** Prima li ovaj tip objave i video, ili samo sliku? */
export function acceptsVideo(kind: PublishKind): boolean {
  return kind !== "IMAGE";
}

/** Prima li ovaj tip objave i sliku? */
export function acceptsImage(kind: PublishKind): boolean {
  return kind !== "REEL";
}

/**
 * Sve što se vidi iz samog fajla, rečima operatera.
 *
 * Poruka uvek kaže ŠTA je fajl i ŠTA Instagram prima — „Neispravan fajl" je
 * poruka posle koje čovek probava nasumično dok mu ne dosadi.
 */
export function checkFile(params: {
  kind: PublishKind;
  size: number;
  type: string;
}): string | null {
  const { kind, size, type } = params;
  if (size === 0) return "Fajl je prazan.";

  const image = isImageContentType(type);
  const video = isVideoContentType(type);

  if (!image && !video) {
    const seen = type.trim().length > 0 ? type : "nepoznat tip";
    return `Fajl je ${seen}. Instagram prima JPEG sliku ili MP4/MOV video.`;
  }

  if (image && !acceptsImage(kind)) {
    return "Reel mora biti video. Izaberi MP4 ili MOV fajl.";
  }
  if (video && !acceptsVideo(kind)) {
    return "Objava tipa Slika prima samo JPEG. Za video izaberi Reel ili Story.";
  }

  if (image && size > IMAGE_MAX_BYTES) {
    return `Slika je ${formatBytes(size)}, a Instagram prima najviše ${formatBytes(IMAGE_MAX_BYTES)}.`;
  }
  if (video && size > VIDEO_MAX_BYTES) {
    return `Video je ${formatBytes(size)}, a Instagram prima najviše 1 GB.`;
  }

  return null;
}

/**
 * Odnos stranica slike. Vraća `null` za Story — tamo odnos nije greška nego
 * napomena (vidi `storyAspectNote`).
 */
export function checkImageAspect(params: {
  kind: PublishKind;
  width: number;
  height: number;
}): string | null {
  const { kind, width, height } = params;
  if (kind === "STORY") return null;
  if (width <= 0 || height <= 0) {
    return "Dimenzije slike se ne mogu pročitati. Sačuvaj je ponovo kao JPEG.";
  }

  const ratio = width / height;
  const shown = formatAspectRatio(width, height);
  if (ratio > ASPECT_MAX) {
    return `Slika je ${shown}, Instagram prima najviše 1.91:1. Iseci je uže ili je postavi kao Story.`;
  }
  if (ratio < ASPECT_MIN) {
    return `Slika je ${shown}, Instagram prima najuže 4:5. Iseci je šire ili je postavi kao Story.`;
  }
  return null;
}

/** Story se ne odbija zbog odnosa — kaže mu se šta će Instagram uraditi. */
export function storyAspectNote(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return null;
  const ratio = width / height;
  // 9:16 je 0,5625; sve iznad ~0,6 vidno se seče na vrhu i dnu.
  if (ratio <= 0.6) return null;
  return `Story je ${formatAspectRatio(width, height)}, a ekran je 9:16 — Instagram će ga iseći po visini.`;
}

/** Trajanje videa, po tipu objave. */
export function checkVideoDuration(params: {
  kind: PublishKind;
  seconds: number;
}): string | null {
  const { kind, seconds } = params;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  if (seconds < VIDEO_MIN_SECONDS) {
    return `Video traje ${formatSeconds(seconds)}, a Instagram prima najkraće 3 s.`;
  }
  const max = kind === "STORY" ? STORY_VIDEO_MAX_SECONDS : VIDEO_MAX_SECONDS;
  if (seconds > max) {
    return kind === "STORY"
      ? `Video traje ${formatSeconds(seconds)}, a Story prima najviše 60 s.`
      : `Video traje ${formatSeconds(seconds)}, a Instagram prima najviše 15 min.`;
  }
  return null;
}

/**
 * An image's dimensions, read from the JPEG itself.
 *
 * The composer measures the picture by decoding it, which a mutation cannot
 * do — but the publish action holds the bytes, and a 3:1 image is worth
 * catching there rather than letting Instagram build a container and refuse
 * it. Only the header is walked: the marker chain from SOI to the first SOFn,
 * where the frame header carries height then width.
 *
 * Returns `null` for anything it does not recognise, and the caller treats
 * that as "no evidence" rather than as a failure — refusing an image because
 * our own parser gave up would be the worse mistake.
 */
export function readJpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++; // fill byte or padding between segments
      continue;
    }
    const marker = bytes[offset + 1];
    offset += 2;

    // Standalone markers carry no length: padding, restart, SOI/EOI.
    if (marker === 0xff || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      continue;
    }

    if (offset + 1 >= bytes.length) return null;
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2) return null;

    // SOF0–SOF15, minus DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isFrameHeader =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;

    if (isFrameHeader) {
      if (offset + 8 >= bytes.length) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += length;
  }
  return null;
}

// ── the caption ──────────────────────────────────────────────────────────────

/**
 * Hashtagovi u opisu. Broji se `#reč`, ne svaka tarabica: „C#" u rečenici nije
 * hashtag, a Instagram i ne broji tarabicu zalepljenu za prethodnu reč.
 */
export function countHashtags(caption: string): number {
  const matches = caption.match(/(^|[^\p{L}\p{N}_])#[\p{L}\p{N}_]+/gu);
  return matches ? matches.length : 0;
}

export function checkCaption(params: {
  kind: PublishKind;
  caption: string;
}): string | null {
  const { kind, caption } = params;
  if (!acceptsCaption(kind)) return null;
  if (caption.length > CAPTION_MAX) {
    return `Opis ima ${caption.length} znakova, a Instagram prima najviše ${CAPTION_MAX}.`;
  }
  const tags = countHashtags(caption);
  if (tags > HASHTAG_MAX) {
    return `Opis ima ${tags} hashtagova, a Instagram prima najviše ${HASHTAG_MAX}.`;
  }
  return null;
}

/** Broj fajlova za izabrani tip objave. */
export function checkItemCount(kind: PublishKind, count: number): string | null {
  const { min, max } = itemRange(kind);
  if (count < min) {
    return kind === "CAROUSEL"
      ? `Carousel traži najmanje ${CAROUSEL_MIN} fajla — dodato je ${count}.`
      : "Izaberi fajl za objavu.";
  }
  if (count > max) {
    return kind === "CAROUSEL"
      ? `Carousel prima najviše ${CAROUSEL_MAX} fajlova — dodato je ${count}.`
      : "Ovaj tip objave prima tačno jedan fajl.";
  }
  return null;
}

// ── scheduling ───────────────────────────────────────────────────────────────

/** Ispod ovoga „zakazano" i „odmah" su ista stvar, pa nema smisla birati. */
export const MIN_SCHEDULE_LEAD_MS = 60_000;

/** Dalje od ovoga kontejner ionako ne bi preživeo dogovor. */
export const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

export function checkScheduledFor(
  scheduledFor: number,
  now: number,
): string | null {
  if (!Number.isFinite(scheduledFor)) return "Izabrano vreme nije ispravno.";
  if (scheduledFor < now + MIN_SCHEDULE_LEAD_MS) {
    return "Zakazano vreme mora biti bar minut u budućnosti. Za sada koristi „Objavi odmah“.";
  }
  if (scheduledFor > now + MAX_SCHEDULE_AHEAD_MS) {
    return "Zakazivanje ide najdalje 90 dana unapred.";
  }
  return null;
}

// ── what the operator has to be told, in the interface ───────────────────────

/**
 * Postojeći token nema opseg za objavljivanje. Ovo stoji na ekranu, ne u
 * konzoli: nalog povezan pre F3 odobrio je čitanje i poruke, a objavljivanje
 * se traži posebno i dobija se samo novim prolaskom kroz povezivanje.
 */
export const SCOPE_NOTICE_TITLE =
  "Za objavljivanje je potrebno ponovo povezati Instagram";

export const SCOPE_NOTICE_BODY =
  "Objavljivanje traži opseg instagram_business_content_publish, koji token dobijen pre ove verzije nema. Otvori Podešavanja i poveži Instagram ponovo — postojeći podaci i istorija ostaju netaknuti.";

/**
 * Dve stvari koje ova aplikacija ne radi, i to ne zato što nisu urađene.
 * Stoje na ekranu jer je pitanje „a gde je dugme za lajk" neizbežno, i bolje
 * je da odgovor stoji tu nego da se traži.
 */
export const NO_LIKE_NOTICE =
  "Instagram API nema poziv za lajkovanje — ni objave ni komentara. Ne postoji kao mogućnost, nije stvar dozvola.";

export const NO_DELETE_NOTICE =
  "Brisanje objava preko Instagram Login-a nije podržano (samo preko Facebook Login-a), pa se objava skida iz same aplikacije Instagram.";

/** Stoji iznad dugmeta za objavu, uvek. */
export const IRREVERSIBLE_NOTICE =
  "Objava odlazi na profil odmah i ne može se povući odavde.";

// ── Graph API answers, translated ────────────────────────────────────────────

/** Vrednosti koje `status_code` na kontejneru uopšte vraća. */
export type ContainerStatus =
  | "IN_PROGRESS"
  | "FINISHED"
  | "ERROR"
  | "EXPIRED"
  | "PUBLISHED";

export function parseContainerStatus(raw: string | undefined): ContainerStatus {
  const upper = (raw ?? "").toUpperCase();
  if (
    upper === "FINISHED" ||
    upper === "ERROR" ||
    upper === "EXPIRED" ||
    upper === "PUBLISHED"
  ) {
    return upper;
  }
  return "IN_PROGRESS";
}

/**
 * Da li greška znači „token ne sme da objavljuje"?
 *
 * Meta na nedostajući opseg odgovara porukom koja pominje sam opseg ili
 * generičkim OAuth kodom. Razlika je bitna: nedostajući opseg se ne popravlja
 * ponavljanjem, nego ponovnim povezivanjem naloga.
 */
export function isMissingPublishScope(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("content_publish") ||
    lower.includes("permission") ||
    lower.includes("dozvol")
  );
}

/** Poruka koja ide u `error` polje posla, na srpskom i bez tajni. */
export function publishFailureMessage(raw: string): string {
  const message = raw.trim().length > 0 ? raw.trim() : "Nepoznata greška.";
  return isMissingPublishScope(message)
    ? `${message} — nalogu nedostaje opseg za objavljivanje, poveži Instagram ponovo u Podešavanjima.`
    : message;
}
