import { ConvexError } from "convex/values";
import type { Id, Doc } from "@/convex/_generated/dataModel";

/**
 * ============================================================================
 * NOVOSTI TIPIZACIJA I KONSTANTE (§2, §3, §4, §11)
 * ============================================================================
 */

export type PostKind = "note" | "article";

export type PostCategory =
  | "novac_rokovi"
  | "odluke"
  | "kako_radi"
  | "greske"
  | "ai_razvoj"
  | "srpski_kontekst";

export type PostStatus = "draft" | "scheduled" | "published" | "archived";

/** Kategorije iz §2 sa opisima */
export const POST_CATEGORIES: ReadonlyArray<{
  id: PostCategory;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "novac_rokovi",
    label: "A. Novac i rokovi",
    shortLabel: "Novac i rokovi",
    description: "Šta diže cenu, zašto rok proklizi, kako se piše obim posla, šta znači „gotovo\". Bez cifara.",
  },
  {
    id: "odluke",
    label: "B. Odluke sa projekata",
    shortLabel: "Odluke sa projekata",
    description: "Zašto smo na projektu X izabrali Y. Portfolio napisan kao odluka, a ne kao slika.",
  },
  {
    id: "kako_radi",
    label: "C. Kako stvar radi",
    shortLabel: "Kako stvar radi",
    description: "Objašnjenja mehanizama za nekoga ko nije programer (API, keš, offline, tok podataka).",
  },
  {
    id: "greske",
    label: "D. Greške i kvarovi",
    shortLabel: "Greške i kvarovi",
    description: "Šta je puklo, zašto, i kako se prepoznaje. Piše se dok se dešava.",
  },
  {
    id: "ai_razvoj",
    label: "E. AI u razvoju",
    shortLabel: "AI u razvoju",
    description: "Šta se stvarno desilo kad je AI pisao deo koda: gde je pomoglo, gde je puklo.",
  },
  {
    id: "srpski_kontekst",
    label: "F. Srpski kontekst",
    shortLabel: "Srpski kontekst",
    description: "PDV na digitalne usluge, PIB i APR, plaćanje, .rs hosting, ugovor sa domaćim klijentom.",
  },
];

/** Dve vrste posta iz §3 */
export const POST_KINDS: ReadonlyArray<{
  id: PostKind;
  label: string;
  wordRange: string;
  minWords: number;
  maxWords: number;
  description: string;
}> = [
  {
    id: "note",
    label: "Beleška (note)",
    wordRange: "200–500 reči",
    minWords: 200,
    maxWords: 500,
    description: "Jedna stvar, jedan snimak ekrana, jedna tvrdnja. Postoji da sajt bude živ i da hrani mreže.",
  },
  {
    id: "article",
    label: "Tekst (article)",
    wordRange: "1.200–2.500 reči",
    minWords: 1200,
    maxWords: 2500,
    description: "Rangira i biva citiran. Obavezno nosi bar jedno iz pravila jedinstvenosti (§2.2).",
  },
];

/** Statusi postova sa oznakama */
export const POST_STATUSES: ReadonlyArray<{
  id: PostStatus;
  label: string;
}> = [
  { id: "draft", label: "Nacrt" },
  { id: "scheduled", label: "Zakazano" },
  { id: "published", label: "Objavljeno" },
  { id: "archived", label: "Arhivirano" },
];

export function getCategoryLabel(category: PostCategory): string {
  const match = POST_CATEGORIES.find((c) => c.id === category);
  return match?.shortLabel ?? category;
}

export function getKindLabel(kind: PostKind): string {
  const match = POST_KINDS.find((k) => k.id === kind);
  return match?.label ?? kind;
}

export function getStatusLabel(status: PostStatus): string {
  const match = POST_STATUSES.find((s) => s.id === status);
  return match?.label ?? status;
}

/**
 * Podaci o postu za UI radni tok (spaja Doc<"posts"> sa lokalnim formama)
 */
export type PostItem = {
  _id: Id<"posts">;
  _creationTime: number;
  workspaceId?: Id<"workspaces">;
  slug: string;
  locale: string;
  kind: PostKind;
  category: PostCategory;
  title: string;
  dek: string;
  body: string;
  coverStorageId?: Id<"_storage">;
  coverAlt?: string;
  authorName: string;
  authorRole?: string;
  tags: string[];
  status: PostStatus;
  publishedAt?: number;
  updatedAt: number;
  reviewedAt?: number;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImageStorageId?: Id<"_storage">;
  readingMinutes?: number;
  ownProofChecked: boolean;
  ownProofNote?: string;
  humanizerPassedAt?: number;
  relatedSlugs?: string[];
};

/**
 * Stanje četiri kapije pre objave (§4)
 */
export type PublishGateStatus = {
  // 1. ownProofChecked === true (§2.2, §4.1)
  ownProof: {
    passed: boolean;
    note?: string;
    reason: string;
  };
  // 2. humanizerPassedAt postavljen (§4.2)
  humanizer: {
    passed: boolean;
    timestamp?: number;
    reason: string;
  };
  // 3. coverAlt popunjen ako postoji slika (§4.3)
  coverAlt: {
    passed: boolean;
    hasCover: boolean;
    reason: string;
  };
  // 4. dek neprazan (§4.4)
  dek: {
    passed: boolean;
    reason: string;
  };
  // Sve 4 kapije ispunjene
  allPassed: boolean;
};

/**
 * Proverava stanje sve 4 kapije iz §4
 */
export function evaluatePublishGates(post: Partial<PostItem>): PublishGateStatus {
  // 1. ownProofChecked === true
  const ownProofPassed = post.ownProofChecked === true;
  const ownProof = {
    passed: ownProofPassed,
    note: post.ownProofNote,
    reason: ownProofPassed
      ? "Potvrđeno postojanje sopstvenog dokaza (§2.2)."
      : "Vlasnički dokaz mora biti ručno potvrđen (čekirajte „Šta je ovde moje?\").",
  };

  // 2. humanizerPassedAt postavljen
  const humanizerPassed =
    post.humanizerPassedAt !== undefined &&
    post.humanizerPassedAt !== null &&
    post.humanizerPassedAt > 0;
  const humanizer = {
    passed: humanizerPassed,
    timestamp: post.humanizerPassedAt,
    reason: humanizerPassed
      ? "Tekst je verifikovan kroz proveru humanizera."
      : "Tekst mora proći proveru humanizera pre objave.",
  };

  // 3. coverAlt popunjen ako postoji slika
  const hasCover = Boolean(post.coverStorageId);
  const coverAltPopulated = Boolean(post.coverAlt && post.coverAlt.trim().length > 0);
  const coverAltPassed = !hasCover || coverAltPopulated;
  const coverAlt = {
    passed: coverAltPassed,
    hasCover,
    reason: !hasCover
      ? "Nema naslovne slike (nije obavezno)."
      : coverAltPopulated
        ? "Naslovna slika ima popunjen ALT opis."
        : "Naslovna slika postoji, ali je ALT opis prazan — ovo je blokada.",
  };

  // 4. dek neprazan
  const dekPopulated = Boolean(post.dek && post.dek.trim().length > 0);
  const dek = {
    passed: dekPopulated,
    reason: dekPopulated
      ? "Podnaslov (dek) je popunjen."
      : "Podnaslov (dek) je prazan — obavezno 1–2 rečenice.",
  };

  const allPassed =
    ownProof.passed && humanizer.passed && coverAlt.passed && dek.passed;

  return {
    ownProof,
    humanizer,
    coverAlt,
    dek,
    allPassed,
  };
}

/**
 * Automatske provere merljivih pravila humanizera iz §4
 */
export type HumanizerCheckResult = {
  clean: boolean;
  emDashCount: number;
  notOnlyPatternCount: number;
  clichePatternCount: number;
  wordCount: number;
  issues: string[];
};

export function checkHumanizerRules(body: string): HumanizerCheckResult {
  const issues: string[] = [];

  // 1. Nula em crtica (—)
  const emDashMatches = body.match(/—/g);
  const emDashCount = emDashMatches ? emDashMatches.length : 0;
  if (emDashCount > 0) {
    issues.push(
      `Pronađeno ${emDashCount} em crtica (—). Zamenite ih običnom crticom (-) ili zarezom.`,
    );
  }

  // 2. Bez „ne samo X nego Y"
  const notOnlyMatches = body.match(/ne samo\s+[^.,\n]+\s+nego/gi);
  const notOnlyPatternCount = notOnlyMatches ? notOnlyMatches.length : 0;
  if (notOnlyPatternCount > 0) {
    issues.push(
      `Pronađena zabranjena konstrukcija „ne samo ... nego" (${notOnlyPatternCount}x). Preformulišite u direktnu tvrdnju.`,
    );
  }

  // 3. Bez izreka / konstrukcija „X je Y od Z"
  const clicheMatches = body.match(/\b\w+\s+je\s+\w+\s+od\s+\w+\b/gi);
  const clichePatternCount = clicheMatches ? clicheMatches.length : 0;

  // Brojač reči
  const words = body.trim().split(/\s+/).filter(Boolean);
  const wordCount = body.trim() ? words.length : 0;

  return {
    clean: issues.length === 0,
    emDashCount,
    notOnlyPatternCount,
    clichePatternCount,
    wordCount,
    issues,
  };
}

/**
 * Izvlači tačnu poruku iz bačene ConvexError greške
 */
export function extractConvexErrorMessage(
  err: unknown,
  fallback = "Operacija nije uspela iz nepoznatog razloga.",
): string {
  if (err instanceof ConvexError) {
    if (typeof err.data === "string") return err.data;
    if (
      err.data &&
      typeof err.data === "object" &&
      "message" in err.data &&
      typeof (err.data as { message?: string }).message === "string"
    ) {
      return (err.data as { message: string }).message;
    }
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
