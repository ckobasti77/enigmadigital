/**
 * Veze zadatka sa ostatkom Enigme (SPAJANJE P19, S23).
 *
 * Zadatak radnog dela može da nosi dve veze koje postoje tek kad su aplikacije
 * zajedno:
 *   - `leadCompanyId`: firma iz Leadova na koju se odnosi (isti projekat);
 *   - `izvor`: odakle je nastao (komentar bez odgovora ili stavka „Čeka te“),
 *     sa naslovom i putanjom ekrana u projektu, da zadatak vodi nazad.
 *
 * Putanja je UVEK unutar projekta (`/instagram/komentari`, `/leadovi?…`): link
 * je crta `ProjekatLink`, pa spoljna adresa ili `javascript:` ne smeju da prođu.
 * Ovaj fajl uvoze i server i klijent (bez `ctx`).
 */
import { ConvexError, v, type Infer } from "convex/values";

export const izvorVrstaValidator = v.union(
  v.literal("komentar_ig"),
  v.literal("komentar_fb"),
  v.literal("ceka_te"),
);

export const izvorZadatkaValidator = v.object({
  vrsta: izvorVrstaValidator,
  /** Kratak opis povoda („@ana_frizer“, „3 firme bez broja“). */
  naslov: v.string(),
  /** Putanja ekrana u projektu, bez prefiksa projekta. */
  putanja: v.string(),
});

export type IzvorZadatka = Infer<typeof izvorZadatkaValidator>;
export type IzvorVrsta = IzvorZadatka["vrsta"];

export const IZVOR_NASLOV_MAX = 200;
export const IZVOR_PUTANJA_MAX = 300;

/** Najviše zadataka jedne firme u odeljku profila. */
export const ZADACI_FIRME_MAX = 50;

export const PORUKE_VEZA = {
  firmaNijeUProjektu: {
    code: "not_found",
    message: "Firma nije pronađena u ovom projektu.",
  },
  bezVeze: {
    code: "invalid",
    message: "Zadatak sa vezom traži firmu ili izvor.",
  },
  losIzvor: {
    code: "invalid",
    message: "Izvor zadatka nije ispravan.",
  },
} as const;

/**
 * Putanja ekrana u projektu ili `null`. Dozvoljena je samo apsolutna putanja
 * unutar aplikacije: počinje jednom kosom crtom, bez razmaka, kontrolnih
 * znakova i obrnute kose crte (pregledač je čita kao `/`).
 */
export function cistaPutanja(putanja: string): string | null {
  const p = putanja.trim();
  if (p.length === 0 || p.length > IZVOR_PUTANJA_MAX) return null;
  if (!p.startsWith("/") || p.startsWith("//")) return null;
  if (p.includes("\\")) return null;
  for (const znak of p) {
    const kod = znak.codePointAt(0) ?? 0;
    if (kod <= 0x20 || kod === 0x7f) return null;
  }
  return p;
}

/** Proveren i skraćen izvor; neispravan baca `invalid`. */
export function normalizujIzvor(izvor: IzvorZadatka): IzvorZadatka {
  const naslov = izvor.naslov.trim().replace(/\s+/g, " ");
  const putanja = cistaPutanja(izvor.putanja);
  if (naslov.length === 0 || putanja === null) {
    throw new ConvexError(PORUKE_VEZA.losIzvor);
  }
  return {
    vrsta: izvor.vrsta,
    naslov: naslov.slice(0, IZVOR_NASLOV_MAX),
    putanja,
  };
}
