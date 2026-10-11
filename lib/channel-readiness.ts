import { formatRelativeTime, pluralSr } from "@/lib/format";

/**
 * ============================================================================
 * SPREMNOST KANALA — merač koji uči (UI Boost §6.8)
 * ============================================================================
 *
 * Četiri uslova, svaki ispunjen ili ne: povezan · sinhronizuje · objava u
 * poslednjih 7 dana · nema neodgovorenih komentara. Sve se izvodi iz podataka
 * koje ekran kanala već čita; ovde nema nijednog upita i nijednog praga koji
 * nije napisan ispod.
 *
 * NEPOZNATO ≠ NEISPUNJENO. Kanal koji nema podatak o neodgovorenim komentarima
 * (YouTube, Threads) taj uslov nema u meraču — ne dobija ga kao „nije
 * ispunjeno", i imenilac mu je 3, ne 4.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Sinhronizacija starija od ovoga više ne znači „sinhronizuje". */
export const SYNC_FRESH_MS = 24 * HOUR;
/** Prozor u kom objava znači „kanal je živ". */
export const POST_WINDOW_MS = 7 * DAY;

export type ReadinessKey = "connected" | "sync" | "post" | "comments";

export type ReadinessSegment = {
  key: ReadinessKey;
  label: string;
  done: boolean;
  /** Šta tačno stoji iza kvačice ili kruga — za oblačić i čitač ekrana. */
  hint: string;
};

export type PostNoun = { label: string; last: string; none: string };

export const POST_NOUN_OBJAVA: PostNoun = {
  label: "Objava u 7 dana",
  last: "Poslednja objava",
  none: "Još nema objava na kanalu.",
};

export const POST_NOUN_VIDEO: PostNoun = {
  label: "Video u 7 dana",
  last: "Poslednji video",
  none: "Još nema videa na kanalu.",
};

export type ReadinessInput = {
  connected: boolean;
  /** Kraj poslednjeg uspešnog prolaza (ms); `null` = još nije bilo nijednog. */
  lastSyncAt: number | null;
  /** Poslednji prolaz je pao ili zastao. */
  syncFailed?: boolean;
  /** Vreme najnovije objave koja još postoji (ms); `null` = nema nijedne. */
  lastPostAt: number | null;
  /** Kako kanal zove objavu; podrazumevano „objava". */
  postNoun?: PostNoun;
  /**
   * Neodgovoreni komentari. `undefined` = kanal taj podatak nema, pa uslova
   * nema u meraču.
   */
  unanswered?: number;
  /** Broj je donja granica (prozor moderacije je odsečen). */
  unansweredCapped?: boolean;
  now: number;
};

export type Readiness = {
  segments: ReadinessSegment[];
  done: number;
  total: number;
  /** Prvi neispunjen uslov — ono što ekran nudi kao sledeći korak. */
  next: ReadinessKey | null;
};

export function channelReadiness(input: ReadinessInput): Readiness {
  const {
    connected,
    lastSyncAt,
    syncFailed = false,
    lastPostAt,
    postNoun = POST_NOUN_OBJAVA,
    unanswered,
    unansweredCapped = false,
    now,
  } = input;

  const syncFresh =
    connected &&
    !syncFailed &&
    lastSyncAt !== null &&
    now - lastSyncAt <= SYNC_FRESH_MS;

  const postFresh =
    connected && lastPostAt !== null && now - lastPostAt <= POST_WINDOW_MS;

  const segments: ReadinessSegment[] = [
    {
      key: "connected",
      label: "Povezan",
      done: connected,
      hint: connected ? "Nalog je povezan." : "Nalog još nije povezan.",
    },
    {
      key: "sync",
      label: "Sinhronizuje",
      done: syncFresh,
      hint: !connected
        ? "Sinhronizacija kreće posle povezivanja."
        : lastSyncAt === null
          ? "Još nije bilo uspešne sinhronizacije."
          : syncFailed
            ? `Poslednji prolaz nije uspeo; poslednji uspešan ${formatRelativeTime(lastSyncAt, now)}.`
            : `Poslednja sinhronizacija ${formatRelativeTime(lastSyncAt, now)}.`,
    },
    {
      key: "post",
      label: postNoun.label,
      done: postFresh,
      hint:
        lastPostAt === null
          ? postNoun.none
          : `${postNoun.last}: ${formatRelativeTime(lastPostAt, now)}.`,
    },
  ];

  if (unanswered !== undefined) {
    segments.push({
      key: "comments",
      label: "Komentari odgovoreni",
      done: connected && unanswered === 0,
      hint:
        unanswered === 0
          ? "Nema komentara koji čekaju odgovor."
          : `${unanswered}${unansweredCapped ? "+" : ""} ${pluralSr(
              unanswered,
              "komentar čeka",
              "komentara čekaju",
              "komentara čeka",
            )} odgovor.`,
    });
  }

  return {
    segments,
    done: segments.filter((s) => s.done).length,
    total: segments.length,
    next: segments.find((s) => !s.done)?.key ?? null,
  };
}

/**
 * Razred angažmana objave u odnosu na medijanu prikazanog skupa. Poređenje
 * ima smisla tek sa četiri izmerene objave; ispod toga razreda nema i bedž
 * nosi samo broj.
 */
export type EngagementTier = "high" | "mid" | "low";

export type EngagementScale = {
  median: number | null;
  tierOf: (rate: number | null) => EngagementTier | null;
};

const MIN_FOR_TIERS = 4;
/** Petina iznad ili ispod medijane je razlika koja se vidi i u malom skupu. */
const HIGH_FACTOR = 1.2;
const LOW_FACTOR = 0.8;

export function engagementScale(rates: Array<number | null>): EngagementScale {
  const known = rates
    .filter((r): r is number => r !== null && Number.isFinite(r))
    .sort((a, b) => a - b);

  if (known.length < MIN_FOR_TIERS) {
    return { median: null, tierOf: () => null };
  }

  const mid = Math.floor(known.length / 2);
  const median =
    known.length % 2 === 0 ? (known[mid - 1] + known[mid]) / 2 : known[mid];

  if (median <= 0) return { median: null, tierOf: () => null };

  return {
    median,
    tierOf: (rate) => {
      if (rate === null || !Number.isFinite(rate)) return null;
      if (rate >= median * HIGH_FACTOR) return "high";
      if (rate <= median * LOW_FACTOR) return "low";
      return "mid";
    },
  };
}

/** Interakcije po prikazu; bez prikaza se stopa ne zna (nije nula). */
export function engagementRate(
  interactions: number | null | undefined,
  views: number | null | undefined,
): number | null {
  if (interactions === null || interactions === undefined) return null;
  if (views === null || views === undefined || views <= 0) return null;
  return interactions / views;
}
