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

export function formatMetricName(metric: RuleMetric): string {
  switch (metric) {
    case "cpa":
      return "CPA";
    case "spend":
      return "potrošnja";
    case "ctr":
      return "CTR";
    case "cpc":
      return "CPC";
    case "roas":
      return "ROAS";
  }
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

export function formatThresholdValue(metric: RuleMetric, val: number): string {
  if (metric === "cpa" || metric === "spend" || metric === "cpc") {
    return `€${val}`;
  }
  if (metric === "ctr") {
    return `${val}%`;
  }
  if (metric === "roas") {
    return `${val}x`;
  }
  return String(val);
}

export function formatActionText(action: RuleAction): string {
  switch (action) {
    case "pause_and_notify":
      return "pauziraj i javi mi";
    case "pause":
      return "automatski pauziraj";
    case "notify":
      return "javi mi na email";
  }
}

export function formatDaysText(days: number): string {
  if (days === 1) return "1 dana";
  return `${days} dana`;
}

/**
 * Returns plain-language Serbian summary of the rule:
 * e.g. "Ako CPA > €15 tokom 3 dana uz ≥1000 impresija → pauziraj i javi mi"
 */
export function formatRuleSentence(rule: RuleLike): string {
  const metric = formatMetricName(rule.condition.metric);
  const op = formatOperatorSymbol(rule.condition.operator);
  const threshold = formatThresholdValue(
    rule.condition.metric,
    rule.condition.value,
  );
  const days = formatDaysText(rule.condition.windowDays);
  const minImp = rule.condition.minImpressions;
  const action = formatActionText(rule.action);

  let sentence = `Ako ${metric} ${op} ${threshold} tokom ${days} uz ≥${minImp} impresija → ${action}`;

  if (rule.cooldownHours && rule.cooldownHours > 0) {
    sentence += ` (cooldown ${rule.cooldownHours}h)`;
  }

  return sentence;
}
