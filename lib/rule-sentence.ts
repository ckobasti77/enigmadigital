import { formatVrednostPravila } from "../convex/lib/pravilaProcena";
import { mera, type KljucMere } from "./mere";

export type RuleMetric = "cpa" | "spend" | "ctr" | "cpc" | "roas";
export type RuleOperator = "gt" | "gte" | "lt" | "lte";
export type RuleScope = "account" | "campaign" | "adset";
export type RuleAction = "notify" | "pause" | "pause_and_notify";

export interface RuleConditionLike {
  metric: RuleMetric;
  operator: RuleOperator;
  value: number;
  windowDays: number;
  minImpressions: number;
}

export interface RuleLike {
  scope?: RuleScope;
  condition: RuleConditionLike;
  action: RuleAction;
  cooldownHours?: number;
}

/** Mera pravila → zapis u rečniku mera (naziv, akronim za oblačić). */
const KLJUC_MERE: Record<RuleMetric, KljucMere> = {
  cpa: "cena_po_rezultatu",
  spend: "potrosnja",
  ctr: "stopa_klikova",
  cpc: "cena_po_kliku",
  roas: "povracaj",
};

export const MERE_PRAVILA: readonly RuleMetric[] = ["cpa", "spend", "ctr", "cpc", "roas"];

/** Srpski naziv mere („Cena po rezultatu"); akronim ide u oblačić (O15). */
export function formatMetricName(metric: RuleMetric): string {
  const m = mera(KLJUC_MERE[metric]);
  // „Povraćaj na oglase" je predug za rečenicu i meni; kratko je dovoljno.
  return metric === "roas" ? m.kratko : m.naziv;
}

export function metricAcronym(metric: RuleMetric): string | undefined {
  return mera(KLJUC_MERE[metric]).akronim;
}

/** Da li je prag mere iznos u valuti naloga. */
export function pragJeIznos(metric: RuleMetric): boolean {
  return metric === "cpa" || metric === "spend" || metric === "cpc";
}

export function formatOperatorSymbol(op: RuleOperator): string {
  switch (op) {
    case "gt":
      return ">";
    case "gte":
      return "≥";
    case "lt":
      return "<";
    case "lte":
      return "≤";
  }
}

/**
 * Prag u jedinici mere. Iznos nosi valutu naloga kad je poznata; bez nje
 * stoji kao broj bez znaka — evro se ne pretpostavlja (O16).
 */
export function formatThresholdValue(
  metric: RuleMetric,
  val: number,
  valuta?: string | null,
): string {
  return formatVrednostPravila(metric, val, valuta);
}

export function formatActionText(action: RuleAction): string {
  switch (action) {
    case "pause_and_notify":
      return "pauziraj i javi mi";
    case "pause":
      return "pauziraj";
    case "notify":
      return "javi mi mejlom";
  }
}

export function formatDaysText(days: number): string {
  return `${days} dana`;
}

/** „istu kampanju", „istu grupu oglasa", „isti nalog". */
export function istiCilj(scope: RuleScope = "campaign"): string {
  switch (scope) {
    case "campaign":
      return "istu kampanju";
    case "adset":
      return "istu grupu oglasa";
    case "account":
      return "isti nalog";
  }
}

const brojFmt = new Intl.NumberFormat("sr-Latn-RS", { maximumFractionDigits: 0 });

/**
 * Pravilo rečima, npr. „Ako cena po rezultatu > 1.500,00 € tokom 3 dana uz
 * najmanje 1.000 prikaza → pauziraj i javi mi · pauza za istu kampanju 12 h".
 */
export function formatRuleSentence(
  rule: RuleLike,
  valuta?: string | null,
  /** Reč umesto iznosa praga (šablon još nema prag: „… > prag tokom …"). */
  pragTekst?: string,
): string {
  const naziv = formatMetricName(rule.condition.metric);
  const metric = naziv.charAt(0).toLowerCase() + naziv.slice(1);
  const op = formatOperatorSymbol(rule.condition.operator);
  const threshold =
    pragTekst ??
    formatThresholdValue(rule.condition.metric, rule.condition.value, valuta);
  const days = formatDaysText(rule.condition.windowDays);
  const minImp = rule.condition.minImpressions;
  const action = formatActionText(rule.action);

  let sentence = `Ako ${metric} ${op} ${threshold} tokom ${days}`;
  if (minImp > 0) sentence += ` uz najmanje ${brojFmt.format(minImp)} prikaza`;
  sentence += ` → ${action}`;

  if (rule.cooldownHours && rule.cooldownHours > 0) {
    sentence += ` · pauza za ${istiCilj(rule.scope)} ${rule.cooldownHours} h`;
  }

  return sentence;
}
