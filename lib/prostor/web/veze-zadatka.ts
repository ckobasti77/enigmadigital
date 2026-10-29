/**
 * Veze novog zadatka (SPAJANJE P19, S23): šta dijalog „Novi zadatak“ dobija
 * kad se otvori sa profila firme, iz komentara bez odgovora ili iz stavke
 * „Čeka te“, i kako se veza piše na zadatku. Server proverava isto
 * (`convex/prostor/lib/veze.ts`); ovde je samo predlog koji čovek menja.
 */
import {
  cistaPutanja,
  IZVOR_NASLOV_MAX,
  type IzvorVrsta,
  type IzvorZadatka,
} from "../../../convex/prostor/lib/veze";

export type { IzvorVrsta, IzvorZadatka };

/** Naslov zadatka (isto ograničenje kao polje u dijalogu i server). */
export const NASLOV_ZADATKA_MAX = 200;

/** Koliko teksta komentara ulazi u naslov; ceo tekst ide u instrukcije. */
const ODLOMAK_U_NASLOVU = 60;

/** Šta dijalog „Novi zadatak“ dobija od mesta odakle je otvoren. */
export type NoviZadatakVeza = {
  firma?: { id: string; naziv: string };
  izvor?: IzvorZadatka;
  /** Predlog naslova; čovek ga menja pre pravljenja. */
  naslov?: string;
  /** Predlog instrukcija (tekst komentara). */
  instrukcije?: string;
};

/** Natpis čipa izvora na zadatku. */
export const NAZIV_IZVORA: Record<IzvorVrsta, string> = {
  komentar_ig: "Komentar na Instagramu",
  komentar_fb: "Komentar na Facebooku",
  ceka_te: "Iz „Čeka te“",
};

export type MrezaKomentara = "instagram" | "facebook";

const KOMENTARI: Record<MrezaKomentara, { vrsta: IzvorVrsta; putanja: string; naziv: string }> = {
  instagram: { vrsta: "komentar_ig", putanja: "/instagram/komentari", naziv: "Komentar na Instagramu" },
  facebook: { vrsta: "komentar_fb", putanja: "/facebook/komentari", naziv: "Komentar na Facebooku" },
};

/** Jedan red bez viška razmaka, skraćen sa „…“ kad je duži od `max`. */
export function skrati(tekst: string, max: number): string {
  const t = tekst.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Profil firme → zadatak vezan za firmu (naslov piše čovek). */
export function vezaZaFirmu(firma: { id: string; naziv: string }): NoviZadatakVeza {
  return { firma: { id: firma.id, naziv: firma.naziv } };
}

/**
 * Komentar bez odgovora → predlog zadatka. Naslov nosi ko je pisao i početak
 * komentara, instrukcije ceo tekst, a izvor vodi nazad na ekran komentara.
 */
export function vezaIzKomentara(k: {
  mreza: MrezaKomentara;
  autor: string;
  tekst: string;
}): NoviZadatakVeza {
  const m = KOMENTARI[k.mreza];
  const ime = k.autor.trim().replace(/^@/, "");
  const potpis = ime ? (k.mreza === "instagram" ? `@${ime}` : ime) : "bez imena";
  const tekst = k.tekst.trim();
  const naslov = tekst
    ? `Odgovori ${potpis}: „${skrati(tekst, ODLOMAK_U_NASLOVU)}“`
    : `Odgovori na komentar ${potpis}`;
  return {
    naslov: skrati(naslov, NASLOV_ZADATKA_MAX),
    ...(tekst ? { instrukcije: `${m.naziv}, ${potpis}:\n„${tekst}“` } : {}),
    // Čip već kaže „Komentar na …“, pa izvor nosi samo ko je pisao.
    izvor: { vrsta: m.vrsta, naslov: skrati(potpis, IZVOR_NASLOV_MAX), putanja: m.putanja },
  };
}

/**
 * Stavka „Čeka te“ → predlog zadatka sa njenim naslovom; izvor vodi tamo gde
 * vodi i radnja stavke. Putanja van projekta se ne nudi (server je odbija).
 */
export function vezaIzCekaTe(stavka: { naslov: string; veza: string }): NoviZadatakVeza | null {
  const putanja = cistaPutanja(stavka.veza);
  const naslov = skrati(stavka.naslov, NASLOV_ZADATKA_MAX);
  if (putanja === null || naslov.length === 0) return null;
  return {
    naslov,
    izvor: { vrsta: "ceka_te", naslov: skrati(stavka.naslov, IZVOR_NASLOV_MAX), putanja },
  };
}

/** Jedna rečenica u dijalogu: za šta je zadatak i kuda će voditi. */
export function opisVeze(veza: NoviZadatakVeza): string {
  if (veza.firma) return `Zadatak za firmu ${veza.firma.naziv}. Vidi se na profilu firme.`;
  if (veza.izvor?.vrsta === "ceka_te") return "Zadatak iz „Čeka te“ vodi nazad na posao koji čeka.";
  if (veza.izvor) return `${NAZIV_IZVORA[veza.izvor.vrsta]}: zadatak vodi nazad na komentare.`;
  return "Novi zadatak.";
}

/** Profil firme u projektu, otvoren na njenim zadacima. */
export function adresaFirme(leadCompanyId: string): string {
  return `/leadovi/${leadCompanyId}?tab=zadaci`;
}
