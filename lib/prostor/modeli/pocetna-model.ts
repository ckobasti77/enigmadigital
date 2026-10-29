/**
 * ============================================================================
 * POČETNA PROJEKTA — sastav i granice (SPAJANJE S20, plan S18 §2)
 * ============================================================================
 *
 * Jedna početna projekta (O10, P18): gore Za tebe, Trijaža i Čeka te; ispod
 * Brojke (Enigmin `OverviewDashboard`), Puls tima i Nedavne izmene. Ovde je
 * samo čista odluka ŠTA se crta i KOLIKO redova: ekran (`pocetna/ekran.tsx`)
 * je čita i ne odlučuje sam.
 *
 * Pravila (plan S18 §2.2, E8–E10):
 * - dok uloga nije poznata crta se samo skelet i nijedan upit radnog dela ne
 *   ide (`smeRadniDeo === false`);
 * - posmatrač (`client_viewer`) nema radni deo: samo Enigmini blokovi;
 * - owner/urednik dobija P18 blokove, a u panelu (nema Danas) i karticu
 *   napretka posle Čeka te.
 *
 * Na telefonu (jedna kolona) DOM red je `glavna`, pa `strana`, pa `dole`, što
 * za urednika tačno prati P18.
 */

export type UlogaPocetne = "owner" | "urednik" | "client_viewer" | null;
export type RezimPocetne = "hub" | "panel";

export type BlokPocetne =
  // Radni deo (owner/urednik).
  | "zaTebe"
  | "trijaza"
  | "idejeZaGlasanje"
  | "tim"
  | "pulsTima"
  | "nedavneIzmene"
  // Enigma (ostaje iz Kontrolne table).
  | "cekaTe"
  | "napredak"
  | "brojke"
  | "fokusZadatak"
  | "staMeCeka"
  /** `CommandTop` kakav je bio: napredak, misije, fokus i svoje „Šta me čeka". */
  | "commandTop";

export type SastavPocetne = {
  /** Uloga još nije poznata: samo skelet, bez upita. */
  skelet: boolean;
  /** Smeju li se montirati blokovi (i upiti) radnog dela. */
  smeRadniDeo: boolean;
  /** Gornji pojas, glavna kolona (od `xl` levo). */
  glavna: BlokPocetne[];
  /** Gornji pojas, desna kolona (od `xl`; ispod `xl` ide posle glavne). */
  strana: BlokPocetne[];
  /** Ispod gornjeg pojasa, puna širina. */
  dole: BlokPocetne[];
  /** Jedina primarna radnja zaglavlja (`null` = zaglavlje bez nje). */
  primarnaRadnja: "noviZadatak" | null;
};

/** Blokovi radnog dela: posmatrač ih nikad ne dobija. */
export const BLOKOVI_RADNOG_DELA: ReadonlySet<BlokPocetne> = new Set<BlokPocetne>([
  "zaTebe",
  "trijaza",
  "idejeZaGlasanje",
  "tim",
  "pulsTima",
  "nedavneIzmene",
]);

export function sastavPocetne({
  uloga,
  rezim,
}: {
  uloga: UlogaPocetne;
  rezim: RezimPocetne;
}): SastavPocetne {
  if (uloga === null) {
    return { skelet: true, smeRadniDeo: false, glavna: [], strana: [], dole: [], primarnaRadnja: null };
  }
  if (uloga === "client_viewer") {
    return {
      skelet: false,
      smeRadniDeo: false,
      // U panelu nema Danas, pa napredak i misije ostaju na početnoj (E10).
      glavna: rezim === "panel" ? ["commandTop"] : ["fokusZadatak", "staMeCeka"],
      strana: [],
      dole: ["brojke"],
      // Primarno dugme nosi Enigmin fokus (kad ima stavku), ne zaglavlje.
      primarnaRadnja: null,
    };
  }
  return {
    skelet: false,
    smeRadniDeo: true,
    glavna: ["zaTebe", "trijaza"],
    strana:
      rezim === "panel"
        ? ["cekaTe", "napredak", "idejeZaGlasanje", "tim"]
        : ["cekaTe", "idejeZaGlasanje", "tim"],
    dole: ["brojke", "pulsTima", "nedavneIzmene"],
    primarnaRadnja: "noviZadatak",
  };
}

/** Red blokova u jednoj koloni (telefon i čitač ekrana). */
export function redBlokova(sastav: SastavPocetne): BlokPocetne[] {
  return [...sastav.glavna, ...sastav.strana, ...sastav.dole];
}

export type LimitiPocetne = {
  /** Redova u „Za tebe“. */
  zaTebe: number;
  /** Redova po zoni Trijaže pre „Prikaži još“. */
  zona: number;
  /** Koliko „Prikaži još“ dodaje. */
  zonaKorak: number;
  /** Najviše redova po zoni (Devotion granica); ostalo je na Zadacima. */
  zonaMaks: number;
  /** Ideja za glasanje. */
  ideje: number;
  /** Stavki „Nedavne izmene“. */
  nedavne: number;
};

/** Granice blokova (plan S18 §2.3, E12, E13): široko = 1536/1440, usko = 390. */
export function limitiPocetne(siroko: boolean): LimitiPocetne {
  return siroko
    ? { zaTebe: 6, zona: 8, zonaKorak: 25, zonaMaks: 100, ideje: 5, nedavne: 8 }
    : { zaTebe: 5, zona: 5, zonaKorak: 25, zonaMaks: 100, ideje: 3, nedavne: 5 };
}

/** Sledeća granica zone posle „Prikaži još“ (nikad preko maksimuma). */
export function sledecaGranicaZone(trenutna: number, limiti: LimitiPocetne): number {
  return Math.min(trenutna + limiti.zonaKorak, limiti.zonaMaks);
}

function mnozina(broj: number, jedan: string, malo: string, mnogo: string): string {
  const poslednje = broj % 10;
  const dveCifre = broj % 100;
  if (poslednje === 1 && dveCifre !== 11) return jedan;
  if (poslednje >= 2 && poslednje <= 4 && (dveCifre < 12 || dveCifre > 14)) return malo;
  return mnogo;
}

/**
 * Podnaslov zaglavlja: „7 za tebe · 24 otvorenih u timu · 3 čeka te“.
 * `undefined` = broj se još ne zna ili je blok pao (izostavlja se, ne piše
 * se nula). Broj 0 se ne piše; kad je sve poznato nula, „Ništa za tebe
 * danas.“. Kad se ništa ne zna, `null` (zaglavlje je samo „Početna“).
 * Na telefonu (`usko`) broj tima otpada: „7 za tebe · 3 čeka te“ (plan S18 §2.5).
 */
export function podnaslovPocetne(
  brojevi: {
    zaTebe: number | undefined;
    otvorenihUTimu: number | undefined;
    cekaTe: number | undefined;
  },
  usko = false,
): string | null {
  const { zaTebe, cekaTe } = brojevi;
  const otvorenihUTimu = usko ? undefined : brojevi.otvorenihUTimu;
  if (zaTebe === undefined && otvorenihUTimu === undefined && cekaTe === undefined) return null;
  const delovi: string[] = [];
  if (zaTebe) delovi.push(`${zaTebe} za tebe`);
  if (otvorenihUTimu) {
    delovi.push(`${otvorenihUTimu} ${mnozina(otvorenihUTimu, "otvoren", "otvorena", "otvorenih")} u timu`);
  }
  if (cekaTe) delovi.push(`${cekaTe} čeka te`);
  return delovi.length === 0 ? "Ništa za tebe danas." : delovi.join(" · ");
}
