/**
 * Danas (`/`, SPAJANJE S19, plan S18 §1) — čiste funkcije sastava ekrana.
 *
 *   - koji blokovi desne kolone postoje i kojim redom;
 *   - „Čeka te" iz svih projekata: koji projekti se računaju (isti izbor i
 *     ista granica kao hub „Svi projekti") i zbir kroz `zbirCekanja`;
 *   - podnaslov ekrana, sažeti čipovi ispod `xl` i misije u kartici napretka.
 *
 * Bez React-a i bez Convex-a (vitest, `node`). Proizvođači „Čeka te"
 * (`notificationsStore.staMeCeka`) i pravila Napretka se ovde ne menjaju:
 * model samo bira i slaže ono što oni vrate.
 */

import { pluralSr } from "../../format";
import { zbirCekanja, type CekaProjekta, type ProjekatZbira, type Zbir } from "../../hub-zbir";
import { formatDayHeading } from "../dates";
import type { MyDaySectionId } from "../my-day";

// ── Granice (plan S18 §1.4) ──────────────────────────────────────────────────

/** „Čeka te" se računa za najviše ovoliko projekata — ista granica kao hub (E5). */
export const MAKS_PROJEKATA_CEKA = 20;
/**
 * Stavki „Čeka te" pre „Prikaži sve" (1536 i 390). Plan S18 je računao 5
 * redova od 44 px, ali red „Čeka te" ima dva reda teksta (≈ 61 px): sa tri
 * reda i kartica napretka staje iznad preloma na 1536 × 695 (S19 ODLUKA).
 */
export const CEKA_TE_DANAS = 3;
/** Nezavršenih misija u kartici napretka; ostale su na Napretku. */
export const MISIJA_U_KARTICI = 2;
/** Ideja za glasanje u desnoj koloni (telefon: 3). */
export const IDEJA_DANAS = 4;
export const IDEJA_DANAS_TELEFON = 3;
/** Podnaslov ekrana je jedan red (CLAUDE.md: ≤ 90 znakova). */
export const PODNASLOV_MAKS = 90;

// ── „Čeka te" iz svih projekata ──────────────────────────────────────────────

/** Projekat iz `projekti.mojiProjekti` u obliku koji ovaj model čita. */
export type ProjekatDanas = ProjekatZbira & {
  arhiviran: boolean;
  redosled: number | null;
};

/** Redosled kao hub i traka: `redosled`, pa ime (sr-Latn). */
function poRedosledu(a: ProjekatDanas, b: ProjekatDanas): number {
  const ra = a.redosled ?? Number.POSITIVE_INFINITY;
  const rb = b.redosled ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.ime.localeCompare(b.ime, "sr-Latn");
}

/**
 * Projekti čiji se „Čeka te" računa: prvih `maks` koji nisu arhivirani, po
 * redosledu. Uloga se ne gleda: posmatrač vidi Enigmin posao svog projekta i
 * na hubu i u zvonu „Ja" (E6), a radni deo ionako ne ulazi u ovaj zbir.
 */
export function izborProjekataCeka(
  projekti: ReadonlyArray<ProjekatDanas>,
  maks = MAKS_PROJEKATA_CEKA,
): { izabrani: ProjekatZbira[]; ukupno: number } {
  const aktivni = projekti.filter((p) => !p.arhiviran).sort(poRedosledu);
  return {
    izabrani: aktivni
      .slice(0, maks)
      .map((p) => ({ workspaceId: p.workspaceId, slug: p.slug, ime: p.ime })),
    ukupno: aktivni.length,
  };
}

export type CekaTeDanas =
  | { stanje: "ucitava" }
  | { stanje: "bez_projekata" }
  | {
      stanje: "projekti";
      zbir: Zbir;
      /** „Uračunato 20 od 34 projekta." ili `null` kad su uračunati svi. */
      napomena: string | null;
    };

/** „Uračunato 20 od 34 projekta." — kad projekata ima više od granice. */
export function napomenaIzostavljenih(izabrano: number, ukupno: number): string | null {
  if (ukupno <= izabrano) return null;
  return `Uračunato ${izabrano} od ${ukupno} ${pluralSr(ukupno, "projekta", "projekta", "projekata")}.`;
}

/**
 * Blok „Čeka te" na Danas. `projekti === undefined` dok spisak projekata
 * stiže; prazan spisak je „bez projekata" (Danas tada ne šalje nijedan
 * projektni upit).
 */
export function cekaTeDanas(
  projekti: ReadonlyArray<ProjekatDanas> | undefined,
  ceka: ReadonlyMap<string, CekaProjekta>,
  maks = MAKS_PROJEKATA_CEKA,
): CekaTeDanas {
  if (projekti === undefined) return { stanje: "ucitava" };
  const { izabrani, ukupno } = izborProjekataCeka(projekti, maks);
  if (izabrani.length === 0) return { stanje: "bez_projekata" };
  return {
    stanje: "projekti",
    zbir: zbirCekanja(izabrani, ceka),
    napomena: napomenaIzostavljenih(izabrani.length, ukupno),
  };
}

// ── Zaglavlje ────────────────────────────────────────────────────────────────

/** „2 kasne, 3 za danas" — delovi sa nulom se izostavljaju; `null` kad nema ničega. */
export function sazetakDana(counts: Pick<Record<MyDaySectionId, number>, "overdue" | "today">): string | null {
  const delovi: string[] = [];
  if (counts.overdue > 0) delovi.push(`${counts.overdue} ${pluralSr(counts.overdue, "kasni", "kasne", "kasni")}`);
  if (counts.today > 0) delovi.push(`${counts.today} za danas`);
  return delovi.length === 0 ? null : delovi.join(", ");
}

/**
 * Podnaslov ekrana Danas, jedan red: „Zdravo, Jovan · četvrtak 29. oktobar ·
 * 2 kasne, 3 za danas". Dok Moj dan nije učitan (`counts === null`) nema
 * brojeva; kad je dan prazan piše „Ništa ne gori.". Predugačak red gubi
 * pozdrav, nikad datum ni brojeve.
 */
export function podnaslovDanas({
  ime,
  now,
  counts,
  zone,
}: {
  ime: string | null;
  now: number;
  counts: Pick<Record<MyDaySectionId, number>, "overdue" | "today"> | null;
  zone?: string;
}): string {
  const { pozdrav, ostatak } = podnaslovDelovi({ ime, now, counts, zone });
  return pozdrav === null ? ostatak : `${pozdrav} · ${ostatak}`;
}

/**
 * Isti podnaslov u delovima, da ekran na telefonu pokaže samo brojeve (uzak
 * red bi ih inače odsekao). `pozdrav` je `null` kad nema imena ili kad bi red
 * prešao 90 znakova; `sazetak` je `null` dok Moj dan nije učitan.
 */
export function podnaslovDelovi({
  ime,
  now,
  counts,
  zone,
}: {
  ime: string | null;
  now: number;
  counts: Pick<Record<MyDaySectionId, number>, "overdue" | "today"> | null;
  zone?: string;
}): { pozdrav: string | null; dan: string; sazetak: string | null; ostatak: string } {
  const dan = formatDayHeading(now, zone);
  const sazetak = counts === null ? null : (sazetakDana(counts) ?? "Ništa ne gori.");
  const ostatak = [dan, sazetak].filter((d): d is string => d !== null).join(" · ");
  const pozdrav = ime ? `Zdravo, ${ime}` : null;
  const staje = pozdrav !== null && `${pozdrav} · ${ostatak}`.length <= PODNASLOV_MAKS;
  return { pozdrav: staje ? pozdrav : null, dan, sazetak, ostatak };
}

// ── Blokovi desne kolone ─────────────────────────────────────────────────────

export type BlokDanas = "cekaTe" | "napredak" | "inbox" | "poruke" | "ideje";

/** Šta kartica napretka crta (E3). */
export type StanjeNapretka = "ucitava" | "sabira" | "spremno" | "skriveno";

/**
 * Isključen Napredak, pao upit i dan koji se ne otvara (zastoj) ne crtaju
 * karticu: Napredak ima svoj ekran, a Danas ne pokazuje grešku nagrade.
 */
export function stanjeNapretka({
  stanje,
  pao,
  zastoj,
}: {
  stanje: { ukljucen: false } | { ukljucen: true; spremno: boolean } | undefined;
  pao: boolean;
  zastoj: boolean;
}): StanjeNapretka {
  if (pao) return "skriveno";
  if (stanje === undefined) return "ucitava";
  if (!stanje.ukljucen) return "skriveno";
  if (stanje.spremno) return "spremno";
  return zastoj ? "skriveno" : "sabira";
}

/**
 * Redosled blokova desne kolone (plan S18 §1.1): Čeka te, Napredak, Inbox,
 * Poruke, Ideje za glasanje. Napredak ispada kad je skriven.
 */
export function sastavDanas(napredak: StanjeNapretka): BlokDanas[] {
  const blokovi: BlokDanas[] = ["cekaTe"];
  if (napredak !== "skriveno") blokovi.push("napredak");
  blokovi.push("inbox", "poruke", "ideje");
  return blokovi;
}

// ── Sažeti čipovi (< xl) ─────────────────────────────────────────────────────

export type CipDanas = {
  kljuc: "cekaTe" | "inbox" | "poruke" | "ideje";
  naziv: string;
  broj: number;
  /** Izvor je odsečen: broj je donja granica („30+"). */
  vise: boolean;
};

const NAZIV_CIPA: Record<CipDanas["kljuc"], string> = {
  cekaTe: "Čeka te",
  inbox: "Inbox",
  poruke: "Poruke",
  ideje: "Glasanje",
};

/**
 * Traka čipova ispod `xl`: samo brojevi veći od nule; `null` (nepoznato ili
 * blok koji je pao) se ne crta.
 */
export function cipoviDanas(
  brojevi: Record<CipDanas["kljuc"], { broj: number | null; vise?: boolean }>,
): CipDanas[] {
  return (Object.keys(NAZIV_CIPA) as Array<CipDanas["kljuc"]>)
    .filter((kljuc) => (brojevi[kljuc].broj ?? 0) > 0)
    .map((kljuc) => ({
      kljuc,
      naziv: NAZIV_CIPA[kljuc],
      broj: brojevi[kljuc].broj ?? 0,
      vise: brojevi[kljuc].vise === true,
    }));
}

// ── Misije u kartici napretka ────────────────────────────────────────────────

/**
 * Do `n` nezavršenih misija, redom kako ih je server poređao, i „X / N".
 * Bez XP-a: nagrada živi na Napretku (E3, „Tiha").
 */
export function misijeZaKarticu<M extends { zavrsena: boolean }>(
  misije: ReadonlyArray<M>,
  n = MISIJA_U_KARTICI,
): { prikazane: M[]; zavrsenih: number; ukupno: number } {
  return {
    prikazane: misije.filter((m) => !m.zavrsena).slice(0, n),
    zavrsenih: misije.filter((m) => m.zavrsena).length,
    ukupno: misije.length,
  };
}
