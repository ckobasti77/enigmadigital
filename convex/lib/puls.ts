import { v, type Infer } from "convex/values";

/**
 * ============================================================================
 * PULS: FORMAT ODGOVORA I GRANICE (PROJEKTI-PLAN §11, plan C15 §5)
 * ============================================================================
 *
 * Sajt projekta izlaže `GET <pulsUrl>` sa `Authorization: Bearer <token>` i
 * vraća:
 *
 *   { "vreme": "<ISO 8601>", "metrike": { "<kljuc>": <broj> },
 *     "oznake"?: { "<kljuc>": "<naziv>" } }
 *
 * Čista funkcija, bez Convex poziva: istu proveru zove akcija (`convex/puls.ts`)
 * i testovi. Poruke su za čoveka na kartici „Poslovanje“ i nikad ne citiraju
 * telo odgovora (tuđi sadržaj).
 * ============================================================================
 */

export const PULS_MAX_BAJTOVA = 64 * 1024;
export const PULS_ISTEK_MS = 10_000;
export const PULS_MAX_METRIKA = 20;
export const PULS_ZADRZAVANJE_MS = 90 * 24 * 60 * 60 * 1000;
/** Koliko starih redova jedan upis sme da obriše (jedna mutacija, mali posao). */
export const PULS_BRISANJE_PO_UPISU = 50;
/** Koliko projekata cron obilazi paralelno. */
export const PULS_PARALELNO = 4;
/** Najviše projekata u jednom prolazu cron-a. */
export const PULS_MAX_PROJEKATA = 100;
/** Snimak stariji od ovoga kartica označava kao zastareo. */
export const PULS_ZASTAREO_MS = 24 * 60 * 60 * 1000;

const BUDUCNOST_MS = 5 * 60 * 1000;
// Plan traži `^[a-z0-9_]{1,40}$`, uz jednu dopunu: Convex odbija ključ zapisa
// (`v.record`) koji počinje sa `_`, pa prvi znak mora biti slovo ili cifra.
const KLJUC = /^[a-z0-9][a-z0-9_]{0,39}$/;
const MAX_VREDNOST = 1e12;
const OZNAKA_MAX = 60;
// Kontrolni znakovi (C0, DEL, C1) se ne prikazuju na kartici.
const KONTROLNI = /[\u0000-\u001f\u007f-\u009f]/;

export const pulsGreskaValidator = v.union(
  v.literal("istek"),
  v.literal("mreza"),
  v.literal("http"),
  v.literal("preusmerenje"),
  v.literal("nije_json"),
  v.literal("prevelik"),
  v.literal("los_format"),
  v.literal("adresa_van_sajta"),
);
export type PulsGreska = Infer<typeof pulsGreskaValidator>;

export type PulsRezultat =
  | {
      ok: true;
      vreme: number;
      metrike: Record<string, number>;
      oznake: Record<string, string> | null;
    }
  | { ok: false; kod: PulsGreska; poruka: string };

const los = (poruka: string): PulsRezultat => ({ ok: false, kod: "los_format", poruka });

function jeObjekat(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Veličina teksta u UTF-8 bajtovima. */
function bajtova(tekst: string): number {
  return new TextEncoder().encode(tekst).length;
}

/**
 * Proverava telo odgovora Pulsa. `sada` je trenutak poziva (ms), da se
 * odbije `vreme` daleko u budućnosti. Dodatni ključevi najvišeg nivoa se
 * ignorišu; sve u `metrike` i `oznake` mora da prođe.
 */
export function parsirajPuls(tekst: string, sada: number): PulsRezultat {
  if (bajtova(tekst) > PULS_MAX_BAJTOVA) {
    return { ok: false, kod: "prevelik", poruka: "Odgovor je veći od 64 KB." };
  }

  let telo: unknown;
  try {
    telo = JSON.parse(tekst);
  } catch {
    return { ok: false, kod: "nije_json", poruka: "Odgovor nije ispravan JSON." };
  }
  if (!jeObjekat(telo)) {
    return { ok: false, kod: "nije_json", poruka: "Odgovor nije JSON objekat." };
  }

  const vremeTekst = telo.vreme;
  if (typeof vremeTekst !== "string" || vremeTekst.trim().length === 0) {
    return los("Polje „vreme“ nedostaje ili nije tekst (ISO 8601).");
  }
  // ISO 8601 sa datumom; `Date.parse` sam prima i „Oct 25 2026“, a to nije format.
  if (!/^\d{4}-\d{2}-\d{2}/.test(vremeTekst.trim())) {
    return los("Polje „vreme“ nije u ISO 8601 obliku.");
  }
  const vreme = Date.parse(vremeTekst);
  if (!Number.isFinite(vreme)) {
    return los("Polje „vreme“ nije ispravan datum.");
  }
  if (vreme > sada + BUDUCNOST_MS) {
    return los("Polje „vreme“ je više od 5 minuta u budućnosti.");
  }

  const metrikeUlaz = telo.metrike;
  if (!jeObjekat(metrikeUlaz)) {
    return los("Polje „metrike“ nedostaje ili nije objekat.");
  }
  const kljucevi = Object.keys(metrikeUlaz);
  if (kljucevi.length === 0) {
    return los("Puls nije vratio nijednu metriku.");
  }
  if (kljucevi.length > PULS_MAX_METRIKA) {
    return los(
      `Puls je vratio ${kljucevi.length} metrika; najviše je ${PULS_MAX_METRIKA}.`,
    );
  }
  const metrike: Record<string, number> = {};
  for (const kljuc of kljucevi) {
    if (!KLJUC.test(kljuc)) {
      return los(
        "Ključ metrike sme da ima samo mala slova, cifre i _ (najviše 40 znakova, ne počinje sa _).",
      );
    }
    const vrednost = metrikeUlaz[kljuc];
    if (
      typeof vrednost !== "number" ||
      !Number.isFinite(vrednost) ||
      Math.abs(vrednost) > MAX_VREDNOST
    ) {
      return los(`Metrika „${kljuc}“ nije konačan broj.`);
    }
    metrike[kljuc] = vrednost;
  }

  let oznake: Record<string, string> | null = null;
  if (telo.oznake !== undefined) {
    const oznakeUlaz = telo.oznake;
    if (!jeObjekat(oznakeUlaz)) {
      return los("Polje „oznake“ nije objekat.");
    }
    oznake = {};
    for (const [kljuc, naziv] of Object.entries(oznakeUlaz)) {
      if (!Object.hasOwn(metrike, kljuc)) {
        return los("Oznaka postoji za metriku koje nema u „metrike“.");
      }
      if (
        typeof naziv !== "string" ||
        naziv.length === 0 ||
        naziv.length > OZNAKA_MAX ||
        KONTROLNI.test(naziv)
      ) {
        return los(`Oznaka metrike „${kljuc}“ mora imati 1–60 znakova, bez kontrolnih.`);
      }
      oznake[kljuc] = naziv;
    }
  }

  return { ok: true, vreme, metrike, oznake };
}

/** Kratka rečenica za karticu, po kodu greške (bez tuđeg sadržaja). */
export const PULS_GRESKA_NAZIV: Record<PulsGreska, string> = {
  istek: "istek veze",
  mreza: "mrežna greška",
  http: "greška servera",
  preusmerenje: "preusmerenje",
  nije_json: "odgovor nije JSON",
  prevelik: "odgovor je prevelik",
  los_format: "neispravan format",
  adresa_van_sajta: "adresa nije na sajtu projekta",
};
