/**
 * Procena pravila oglasa: jedna logika za evaluator (`convex/rules.ts`), probu
 * pre uključivanja i predlog praga (`convex/rulesStore.ts`). Čiste funkcije,
 * bez baze i bez mreže, pa ih front uvozi kao `@/convex/lib/pravilaProcena`.
 *
 * Izvučeno iz `runRuleEvaluations` bez promene ponašanja: proba mora da kaže
 * tačno ono što bi evaluator uradio.
 */

import { procenatSirov } from "./formatJezgro";

export type MeraPravila = "cpa" | "spend" | "ctr" | "cpc" | "roas";
export type OperatorPravila = "gt" | "gte" | "lt" | "lte";

/** Zbir jednog cilja (kampanja, grupa oglasa ili nalog) za prozor pravila. */
export type ZbirCilja = {
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  conversionValue: number;
};

/**
 * Vrednost mere za cilj. Cena po rezultatu bez rezultata, a sa potrošnjom, je
 * cela potrošnja: tako evaluator i do sada gleda kampanju koja troši, a ništa
 * ne donosi.
 */
export function vrednostMere(metric: MeraPravila, cilj: ZbirCilja): number {
  switch (metric) {
    case "cpa":
      if (cilj.results > 0) return cilj.spend / cilj.results;
      return cilj.spend > 0 ? cilj.spend : 0;
    case "spend":
      return cilj.spend;
    case "ctr":
      return cilj.impressions > 0 ? (cilj.clicks / cilj.impressions) * 100 : 0;
    case "cpc":
      return cilj.clicks > 0 ? cilj.spend / cilj.clicks : 0;
    case "roas":
      return cilj.spend > 0 ? cilj.conversionValue / cilj.spend : 0;
  }
}

/**
 * Da li je mera stvarno izmerena: cena po rezultatu traži rezultat, stopa
 * klikova prikaz, cena po kliku klik, a povraćaj potrošnju. Evaluator i bez
 * toga računa vrednost (`vrednostMere`), ali ekran je tada ne sme predstaviti
 * kao izmerenu („Cena po rezultatu 40 €" za kampanju bez ijednog rezultata).
 */
export function meraIzmerena(metric: MeraPravila, cilj: ZbirCilja): boolean {
  switch (metric) {
    case "cpa":
      return cilj.results > 0;
    case "spend":
      return true;
    case "ctr":
      return cilj.impressions > 0;
    case "cpc":
      return cilj.clicks > 0;
    case "roas":
      return cilj.spend > 0;
  }
}

/** Zašto mera nije izmerena, za rečenicu uz vrednost koju evaluator koristi. */
export const RAZLOG_NEIZMERENE: Record<MeraPravila, string> = {
  cpa: "bez rezultata",
  spend: "",
  ctr: "bez prikaza",
  cpc: "bez klikova",
  roas: "bez potrošnje",
};

export function uslovIspunjen(
  op: OperatorPravila,
  vrednost: number,
  prag: number,
): boolean {
  switch (op) {
    case "gt":
      return vrednost > prag;
    case "gte":
      return vrednost >= prag;
    case "lt":
      return vrednost < prag;
    case "lte":
      return vrednost <= prag;
  }
}

/**
 * Koliko je vrednost blizu praga, kao udeo (1 = na pragu, više = preko). Za
 * „veće od" je to vrednost / prag, a za „manje od" prag / vrednost. Bez
 * smislenog odnosa (prag ili vrednost 0) vraća `null`, ne izmišljen broj.
 */
export function blizinaPragu(
  op: OperatorPravila,
  vrednost: number,
  prag: number,
): number | null {
  if (op === "gt" || op === "gte") {
    return prag > 0 ? vrednost / prag : null;
  }
  return vrednost > 0 ? prag / vrednost : null;
}

/** Medijana niza; prazan niz nema medijanu. */
export function medijana(niz: readonly number[]): number | null {
  if (niz.length === 0) return null;
  const s = [...niz].sort((a, b) => a - b);
  const sredina = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[sredina] : (s[sredina - 1] + s[sredina]) / 2;
}

/**
 * Prag za predlog: naviše na dve značajne cifre (1.286 → 1.300; 12,86 → 13;
 * 6,43 → 6,5). Naviše, jer predlog ne sme da bude stroži od podatka iz koga je
 * izveden. Nepozitivan ulaz nema prag.
 */
export function zaokruziPrag(x: number): number | null {
  if (!Number.isFinite(x) || x <= 0) return null;
  const korak = 10 ** (Math.floor(Math.log10(x)) - 1);
  // `toPrecision` skida ostatak deljenja u pokretnom zarezu (1,1 / 0,1).
  const koraka = Math.ceil(Number((x / korak).toPrecision(12)));
  return Number((koraka * korak).toPrecision(12));
}

const LOCALE = "sr-Latn-RS";
const decimalFmt = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Vrednost ili prag u jedinici mere, za karticu, probu, istoriju i mejl.
 * Iznos nosi valutu naloga kad je poznata; bez nje je broj bez znaka, jer se
 * evro ne pretpostavlja (O16).
 */
export function formatVrednostPravila(
  metric: MeraPravila,
  vrednost: number,
  valuta?: string | null,
): string {
  if (!Number.isFinite(vrednost)) return "—";
  // Procenat sa tvrdim razmakom, kao svuda u aplikaciji (P7).
  if (metric === "ctr") return procenatSirov(vrednost);
  if (metric === "roas") return `${decimalFmt.format(vrednost)}×`;
  const kod = valuta?.trim().toUpperCase();
  if (!kod) return decimalFmt.format(vrednost);
  try {
    return new Intl.NumberFormat(LOCALE, { style: "currency", currency: kod }).format(vrednost);
  } catch {
    return `${decimalFmt.format(vrednost)} ${kod}`;
  }
}

/** Šabloni koje „Dodaj iz šablona" nudi; prag uvek bira čovek. */
export type SablonPravila = "skupa_konverzija" | "skok_potrosnje";

export const SABLONI_PRAVILA: Record<
  SablonPravila,
  {
    naziv: string;
    scope: "campaign";
    condition: {
      metric: MeraPravila;
      operator: OperatorPravila;
      windowDays: number;
      minImpressions: number;
    };
    action: "notify" | "pause_and_notify";
    cooldownHours: number;
  }
> = {
  skupa_konverzija: {
    naziv: "Skupa konverzija",
    scope: "campaign",
    condition: { metric: "cpa", operator: "gt", windowDays: 3, minImpressions: 1000 },
    action: "pause_and_notify",
    cooldownHours: 24,
  },
  skok_potrosnje: {
    naziv: "Skok potrošnje",
    scope: "campaign",
    condition: { metric: "spend", operator: "gt", windowDays: 1, minImpressions: 500 },
    action: "notify",
    cooldownHours: 12,
  },
};

/** Prozor iz koga se izvodi predlog praga (P5). */
export const PREDLOG_PROZOR_DANA = 28;

/** Pravilo koje pauzira traži probu pre uključivanja (P5). */
export function pravilaPauzira(action: "notify" | "pause" | "pause_and_notify"): boolean {
  return action === "pause" || action === "pause_and_notify";
}
