/**
 * Rutiranje projekata (PROJEKTI-PLAN §6, plan C02 §7.2): čiste funkcije bez
 * React-a i bez Next-a, da bi ih testirao vitest u `node` okruženju.
 *
 * - IZLAZ: `putanjaEkrana` pravi adresu linka od putanje ekrana
 *   (`/leadovi` → `/enigma-it/leadovi` u hubu, `/leadovi` u panelu), a
 *   `ekranIzPutanje` radi obrnuto za navigaciju (aktivna stavka, naslov).
 * - ULAZ: `odluciRutu` je odluka za `proxy.ts` (panel, hub, stare adrese);
 *   proxy je samo primenjuje.
 *
 * Pravila sluga i spisak rezervisanih imena žive u `convex/lib/projekatSlug.ts`
 * (jedan izvor za backend i front). Uvoz je relativan jer vitest nema alias
 * `@/`.
 */
import {
  EKRANI,
  GLOBALNE_PUTANJE,
  HUB_PUTANJE,
  JA_PUTANJE,
  jeIspravanSlug,
} from "../convex/lib/projekatSlug";
import { modulUkljucen } from "../convex/lib/moduli";
import { periodUUpit, type RangeParams } from "./date-range";

export { MODULI_PROJEKTA, modulUkljucen } from "../convex/lib/moduli";

export {
  EKRANI,
  GLOBALNE_PUTANJE,
  HUB_PUTANJE,
  JA_PUTANJE,
  REZERVISANI_SLUGOVI,
  jeIspravanSlug,
  jeLokalniHost,
  normalizujHost,
  proveriSlugProjekta,
} from "../convex/lib/projekatSlug";

/** Kolačić sa poslednjim projektom u hubu (stare adrese, C08). */
export const KOLACIC_PROJEKAT = "ep_projekat";

/** Hub = birač i projekti na `/<slug>/…`; panel = domen zaključan na jedan projekat. */
export type Rezim = "hub" | "panel";

const GLOBALNE: ReadonlySet<string> = new Set<string>(GLOBALNE_PUTANJE);
const HUB: ReadonlySet<string> = new Set<string>(HUB_PUTANJE);
const JA: ReadonlySet<string> = new Set<string>(JA_PUTANJE);

/** Prvi segment putanje: „/leadovi/uvoz“ → „leadovi“, „/“ → „“. */
export function prviSegment(pathname: string): string {
  return pathname.split("/").filter((deo) => deo.length > 0)[0] ?? "";
}

/**
 * Putanja koju rutiranje nikad ne dira: prvi segment je globalna putanja
 * (`api`, `login`, `privacy`, `r`, …) ili je poslednji segment fajl (ima tačku).
 */
export function jeGlobalnaPutanja(pathname: string): boolean {
  if (GLOBALNE.has(prviSegment(pathname))) return true;
  const delovi = pathname.split("/").filter((deo) => deo.length > 0);
  const poslednji = delovi[delovi.length - 1] ?? "";
  return poslednji.includes(".");
}

/** Putanja huba van projekta (`/novi`, …). */
export function jeHubPutanja(pathname: string): boolean {
  return HUB.has(prviSegment(pathname));
}

/**
 * Putanja ličnog nivoa „Ja“ (SPAJANJE P13): `/` (Danas) ili prvi segment iz
 * `JA_PUTANJE`. Važi samo u hubu; u panelu je sve pod projektom (plan S07 D4).
 */
export function jeJaPutanja(pathname: string): boolean {
  return pathname === "/" || JA.has(prviSegment(pathname));
}

/** Stari hub „Svi projekti“ pre SPAJANJA (`/svi`, `/hub`); sada je na `/projekti`. */
const STARI_HUB: ReadonlySet<string> = new Set(["svi", "hub"]);

/** Prefiks putanje projekta: „/<slug>“ u hubu, prazno u panelu. */
export function prefiksProjekta(slug: string, rezim: Rezim): string {
  return rezim === "hub" ? `/${slug}` : "";
}

/** Putanja ekrana iz putanje pregledača: skida prefiks projekta. */
export function ekranIzPutanje(pathname: string, prefiks: string): string {
  if (prefiks === "") return pathname;
  if (pathname === prefiks) return "/";
  if (pathname.startsWith(`${prefiks}/`)) return pathname.slice(prefiks.length);
  return pathname;
}

/** Deli „/a/b?x=1#y“ na „/a/b“ i „?x=1#y“. */
function podeli(adresa: string): [string, string] {
  const upit = adresa.indexOf("?");
  const hes = adresa.indexOf("#");
  const kraj = [upit, hes].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  return kraj === undefined ? [adresa, ""] : [adresa.slice(0, kraj), adresa.slice(kraj)];
}

/**
 * Adresa linka za ekran u tekućem projektu. Ne dira: spoljne adrese, sidra,
 * globalne putanje i putanje huba. Idempotentna: adresa koja već nosi prefiks
 * ostaje ista.
 *
 * `period` (P4): zapamćen izbor perioda za ekran koji radi nad periodom.
 * Dodaje se u upit samo kad adresa već ne nosi `range`, `from` ni `to`;
 * postojeći upit i heš ostaju. Bez njega je ponašanje kao ranije.
 */
export function putanjaEkrana(
  ekran: string,
  prefiks: string,
  period?: RangeParams | null,
): string {
  if (!ekran.startsWith("/") || ekran.startsWith("//")) return ekran;
  const [putanja, ostatak] = podeli(ekran);
  if (jeGlobalnaPutanja(putanja) || jeHubPutanja(putanja)) return ekran;
  const saPeriodom = period ? dodajPeriod(ostatak, period) : ostatak;
  if (prefiks === "") return putanja + saPeriodom;
  if (putanja === prefiks || putanja.startsWith(`${prefiks}/`)) return putanja + saPeriodom;
  return (putanja === "/" ? prefiks : `${prefiks}${putanja}`) + saPeriodom;
}

/** „?x=1#y“ + period → „?x=1&range=7d#y“; upit sa periodom ostaje isti. */
function dodajPeriod(ostatak: string, period: RangeParams): string {
  const hes = ostatak.indexOf("#");
  const upit = hes === -1 ? ostatak : ostatak.slice(0, hes);
  const sidro = hes === -1 ? "" : ostatak.slice(hes);
  const params = new URLSearchParams(upit);
  if (params.has("range") || params.has("from") || params.has("to")) return ostatak;
  const dodatak = periodUUpit(period);
  if (dodatak === "") return ostatak;
  const pre = upit.length > 1 ? `${upit}&` : "?";
  return `${pre}${dodatak}${sidro}`;
}

const EKRAN: ReadonlySet<string> = new Set<string>(EKRANI);

export type UlazRutiranja = {
  pathname: string;
  /** „“ ili „?…“, prenosi se nepromenjen. */
  search: string;
  /** Projekat na koji je host zaključan; `null` = hub (i greška upita, P5). */
  panelSlug: string | null;
  /** Kolačić `ep_projekat`: poslednji projekat u hubu. */
  kolacicProjekat: string | undefined;
};

export type OdlukaRutiranja =
  | { tip: "dalje" }
  | { tip: "rewrite"; putanja: string }
  | { tip: "redirect"; putanja: string };

/**
 * Odluka rutiranja (PROJEKTI-PLAN §6), ovim redom:
 * 1. globalna putanja se ne dira;
 * 2. panel (`panelSlug = S`): `/S…` → redirect na kanonski oblik bez `/S`,
 *    a sve ostalo → rewrite na `/S…`;
 * 3. hub: `/` (Danas) i putanje „Ja“ (`/moji-zadaci`, `/poruke`, …)
 *    prolaze — „Ja“ ima prednost na najvišem nivou, pa `/poruke` nije stara
 *    adresa ekrana (SPAJANJE, plan S07 D3); stari hub `/svi` i `/hub` →
 *    redirect na `/projekti` (upit ostaje); stara adresa ekrana (`/leadovi`)
 *    → redirect na poslednji projekat iz kolačića, a bez ispravnog kolačića
 *    na `/` (upit ostaje, pa i `ig_code`); ostalo prolazi, a članstvo
 *    proverava layout `[projekat]`.
 * Lokalni host i greška upita su hub još u razrešavaču domena, pa ovde
 * stižu kao `panelSlug: null`.
 */
export function odluciRutu(u: UlazRutiranja): OdlukaRutiranja {
  const { pathname, search, panelSlug } = u;
  if (jeGlobalnaPutanja(pathname)) return { tip: "dalje" };

  if (panelSlug !== null) {
    const prefiks = `/${panelSlug}`;
    if (pathname === prefiks || pathname.startsWith(`${prefiks}/`)) {
      const ostatak = pathname.slice(prefiks.length);
      return { tip: "redirect", putanja: (ostatak === "" ? "/" : ostatak) + search };
    }
    return {
      tip: "rewrite",
      putanja: (pathname === "/" ? prefiks : `${prefiks}${pathname}`) + search,
    };
  }

  if (jeJaPutanja(pathname)) return { tip: "dalje" };
  if (STARI_HUB.has(prviSegment(pathname)) && pathname.split("/").filter(Boolean).length === 1) {
    return { tip: "redirect", putanja: `/projekti${search}` };
  }
  if (EKRAN.has(prviSegment(pathname))) {
    const kolacic = u.kolacicProjekat;
    const putanja =
      kolacic !== undefined && jeIspravanSlug(kolacic)
        ? `/${kolacic}${pathname}`
        : "/";
    return { tip: "redirect", putanja: putanja + search };
  }
  return { tip: "dalje" };
}

/** Ekran u koji vodi prelazak: adresa bez prefiksa i modul (za `moduli`). */
export type EkranZaPrelazak = { href: string; modul: string };

/**
 * Promena projekta čuva ekran (plan C02 §8.4): `/enigma-it/analytics` →
 * `/scanme/analytics`.
 *  1. Upit i heš se skidaju (ID-jevi iz drugog projekta tamo ne važe).
 *  2. Ekran daje `ekranZa` (komponenta šalje rešavač iz navigacije, koji već
 *     svodi ekran sa ID-jem na roditelja); nepoznat ekran → kontrolna tabla.
 *  3. Modul koji nije uključen u cilju → kontrolna tabla.
 */
export function putanjaZaPrelazak(o: {
  /** Putanja ekrana bez prefiksa (`useEkranPutanja()`). */
  ekran: string;
  cilj: { slug: string; moduli: readonly string[] | null };
  ekranZa: (putanja: string) => EkranZaPrelazak | undefined;
}): string {
  const [putanja] = podeli(o.ekran);
  const ekran = o.ekranZa(putanja);
  const iskljucen =
    ekran !== undefined && !modulUkljucen(o.cilj.moduli, ekran.modul);
  const href = ekran === undefined || iskljucen ? "/" : ekran.href;
  return `/${o.cilj.slug}${href === "/" ? "" : href}`;
}
