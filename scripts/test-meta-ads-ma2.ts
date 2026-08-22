import {
  deriveRate,
  isBreakdownComboAllowed,
  resolveMetric,
  META_INSIGHTS_VERSION,
  BREAKDOWN_RULES,
} from "../convex/lib/metaAdsCatalog";
import { formatMetric, formatRanking } from "../convex/lib/metaAdsFormat";
import {
  extractActionBreakdowns,
  buildInsightsUrl,
  toNumOrUndefined,
} from "../convex/lib/metaAdsApi";
import {
  evaluateHookBattle,
  type VersionBattleStats,
} from "../components/app/ads/battle-verdict";

console.log("=================================================");
console.log("TESTING MA2 METRICS CATALOG & BREAKDOWN LOGIC");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

// 1. Test deriveRate
console.log("── 1. deriveRate Tests ──");
const r1 = deriveRate(0, 0);
assert(r1 === undefined, `deriveRate(0, 0) === undefined (got: ${r1})`);

const r2 = deriveRate(5, 0);
assert(r2 === undefined, `deriveRate(5, 0) === undefined (got: ${r2})`);

const r3 = deriveRate(0, 100);
assert(r3 === 0, `deriveRate(0, 100) === 0 (got: ${r3})`);

const r4 = deriveRate(25, 100);
assert(r4 === 0.25, `deriveRate(25, 100) === 0.25 (got: ${r4})`);

const r5 = deriveRate(undefined, 100);
assert(r5 === undefined, `deriveRate(undefined, 100) === undefined (got: ${r5})`);

const r6 = deriveRate(10, undefined);
assert(r6 === undefined, `deriveRate(10, undefined) === undefined (got: ${r6})`);

// 2. Test isBreakdownComboAllowed
console.log("\n── 2. isBreakdownComboAllowed Tests ──");
const c1 = isBreakdownComboAllowed(
  ["hourly_stats_aggregated_by_audience_time_zone"],
  ["reach", "impressions"],
);
assert(!c1.allowed, "Hourly + reach/impressions is NOT allowed");
if (!c1.allowed) {
  assert(
    c1.dropMetrics.length === 1 && c1.dropMetrics[0] === "reach",
    `dropMetrics is precisely ["reach"] (got: ${JSON.stringify(c1.dropMetrics)})`,
  );
  assert(
    c1.reason.length > 0,
    `reason provided: "${c1.reason}"`,
  );
}

const c2 = isBreakdownComboAllowed(["action_type"], ["impressions"]);
assert(!c2.allowed, "action_type in breakdowns is NOT allowed");
if (!c2.allowed) {
  assert(
    c2.dropMetrics.length === 0,
    `dropMetrics is empty [] for action_breakdown confusion (got: ${JSON.stringify(c2.dropMetrics)})`,
  );
  assert(
    c2.reason.includes("action_breakdowns"),
    `reason explains action_breakdowns: "${c2.reason}"`,
  );
}

const c3 = isBreakdownComboAllowed(["age", "gender"], ["reach", "impressions"]);
assert(c3.allowed, "age + gender with reach/impressions is allowed");

const c4 = isBreakdownComboAllowed(
  ["region"],
  ["video_p25_watched_actions", "impressions", "spend"],
);
assert(!c4.allowed, "region with video_p25_watched_actions is NOT allowed");
if (!c4.allowed) {
  assert(
    c4.dropMetrics.includes("video_p25_watched_actions") &&
      !c4.dropMetrics.includes("impressions") &&
      !c4.dropMetrics.includes("spend"),
    `dropMetrics filters only video quartiles (got: ${JSON.stringify(c4.dropMetrics)})`,
  );
}

const c5 = isBreakdownComboAllowed(
  ["image_asset"],
  ["impressions", "clicks", "cpc", "cpm"],
);
assert(!c5.allowed, "image_asset with cpc/cpm is NOT allowed");
if (!c5.allowed) {
  assert(
    c5.dropMetrics.includes("cpc") && c5.dropMetrics.includes("cpm"),
    `dropMetrics includes cpc and cpm (got: ${JSON.stringify(c5.dropMetrics)})`,
  );
}

// 3. Test buildInsightsUrl field pruning
console.log("\n── 3. buildInsightsUrl Field Pruning Tests ──");
const testUrl = buildInsightsUrl({
  targetId: "act_123456",
  breakdowns: ["hourly_stats_aggregated_by_audience_time_zone"],
  accessToken: "EAAB_test_token",
});
assert(
  !testUrl.includes("reach") && !testUrl.includes("video_3_sec_watched_actions"),
  "buildInsightsUrl pruned incompatible reach and video metrics from request URL fields",
);
assert(
  testUrl.includes("spend") && testUrl.includes("impressions") && testUrl.includes("clicks"),
  "buildInsightsUrl kept valid metrics (spend, impressions, clicks)",
);

// 4. Test formatMetric
console.log("\n── 4. formatMetric Tests ──");
const spendDef = resolveMetric("spend")!;
const ctrDef = resolveMetric("ctr")!;
const hookRateDef = resolveMetric("hookRate")!;
const frequencyDef = resolveMetric("frequency")!;

// Frequency ratio formatting
const fFreq = formatMetric(2.34, frequencyDef);
console.log(`  Formatted frequency (2.34): ${fFreq}`);
assert(fFreq.includes("2,34") || fFreq.includes("2.34"), "Frequency formatted as decimal");

// Currency with provided currencyCode
const fSpendEur = formatMetric(1234.56, spendDef, "EUR");
console.log(`  Formatted spend (EUR): ${fSpendEur}`);
assert(fSpendEur.includes("1.234,56") || fSpendEur.includes("1234,56"), "Spend formatted with Serbian decimal separator");

// Currency WITHOUT currencyCode (no fallback to RSD hardcoding!)
const fSpendNoCurr = formatMetric(1234.56, spendDef, undefined);
console.log(`  Formatted spend (no currency): ${fSpendNoCurr}`);
assert(
  !fSpendNoCurr.includes("RSD") && !fSpendNoCurr.includes("€") && !fSpendNoCurr.includes("$"),
  "Spend without currencyCode has NO currency symbol (never fallback to RSD)",
);

// Meta CTR (0-100 returned by Meta, e.g. 2.45 for 2.45%)
const fCtr = formatMetric(2.45, ctrDef);
console.log(`  Formatted Meta CTR (2.45): ${fCtr}`);
assert(
  fCtr.includes("2,45") && !fCtr.includes("245"),
  "Meta CTR not multiplied by 100 (displays 2,45 %, not 245 %)",
);

// Derived Hook Rate (0-1 ratio returned by deriveRate, e.g. 0.245 for 24.5%)
const fHook = formatMetric(0.245, hookRateDef);
console.log(`  Formatted derived Hook Rate (0.245): ${fHook}`);
assert(
  fHook.includes("24,5") || fHook.includes("25"),
  "Derived hookRate formatted as percent",
);

// Undefined value -> dash
const fUndefined = formatMetric(undefined, hookRateDef);
assert(fUndefined === "—", `Undefined value formatted as "—" (got: "${fUndefined}")`);

// 4b. Test formatRanking (A1)
console.log("\n── 4b. formatRanking Tests ──");
const rkUnknown = formatRanking("UNKNOWN");
assert(
  rkUnknown.known === false && rkUnknown.label === "—",
  `formatRanking("UNKNOWN") -> known === false, label "—" (got: ${JSON.stringify(rkUnknown)})`,
);

const rkBelow10 = formatRanking("BELOW_AVERAGE_10");
assert(
  rkBelow10.known === true && rkBelow10.label.includes("10%"),
  `formatRanking("BELOW_AVERAGE_10") -> known === true (got: ${JSON.stringify(rkBelow10)})`,
);

const rkUndef = formatRanking(undefined);
assert(
  rkUndef.known === false && rkUndef.label === "—",
  `formatRanking(undefined) -> known === false, label "—" (got: ${JSON.stringify(rkUndef)})`,
);

const rkAbove = formatRanking("ABOVE_AVERAGE");
assert(
  rkAbove.known === true && rkAbove.label === "iznad proseka",
  `formatRanking("ABOVE_AVERAGE") -> known === true, label "iznad proseka" (got: ${JSON.stringify(rkAbove)})`,
);

// 5. Test extractActionBreakdowns
console.log("\n── 5. extractActionBreakdowns Tests ──");
const rawActions = [
  {
    action_type: "offsite_conversion.fb_pixel_purchase",
    value: "12",
    "1d_click": "9",
    "7d_click": "12",
    "1d_view": "3",
  },
  {
    action_type: "lead",
    value: "5",
    "1d_click": "5",
    // 1d_view and 7d_view are omitted by Meta!
  },
];
const rawValues = [
  {
    action_type: "offsite_conversion.fb_pixel_purchase",
    value: "1500.00",
    "1d_click": "1200.00",
    "7d_click": "1500.00",
    "1d_view": "300.00",
  },
];

const extracted = extractActionBreakdowns(rawActions, rawValues, []);
console.log(`  Extracted ${extracted.length} action breakdown records:`, extracted);

// Purchase should have default, 1d_click, 7d_click, 1d_view
const purchase1dView = extracted.find(
  (e) => e.actionType === "offsite_conversion.fb_pixel_purchase" && e.window === "1d_view",
);
assert(purchase1dView?.count === 3, "Purchase 1d_view count is 3");
assert(purchase1dView?.value === 300, "Purchase 1d_view value is 300");

// Lead should NOT have 1d_view row since Meta did not send it
const lead1dView = extracted.find(
  (e) => e.actionType === "lead" && e.window === "1d_view",
);
assert(
  lead1dView === undefined,
  "Lead 1d_view row is NOT created (omitted window is not recorded as 0)",
);

// 6. Test META_INSIGHTS_VERSION and BREAKDOWN_RULES URLs (A3 & A4)
console.log("\n── 6. Metadata and Version Tests ──");
assert(
  META_INSIGHTS_VERSION === 3,
  `META_INSIGHTS_VERSION === 3 (got: ${META_INSIGHTS_VERSION})`,
);

const hourlyRule = BREAKDOWN_RULES.find((r) => r.breakdown === "hourly_stats_aggregated_by_audience_time_zone");
assert(
  hourlyRule?.source === "https://developers.facebook.com/docs/marketing-api/insights/breakdowns",
  `Hourly breakdown rule documentation URL is exact (got: ${hourlyRule?.source})`,
);

const dynamicRule = BREAKDOWN_RULES.find((r) => r.breakdown === "image_asset");
assert(
  dynamicRule?.source === "https://developers.facebook.com/docs/marketing-api/guides/dynamic-creative",
  `Dynamic creative rule documentation URL is exact (got: ${dynamicRule?.source})`,
);

// 7. Test toNumOrUndefined (A4)
console.log("\n── 7. toNumOrUndefined Tests ──");
assert(toNumOrUndefined(undefined) === undefined, "toNumOrUndefined(undefined) === undefined");
assert(toNumOrUndefined("") === undefined, "toNumOrUndefined('') === undefined");
assert(toNumOrUndefined("0") === 0, "toNumOrUndefined('0') === 0");
assert(toNumOrUndefined("123.45") === 123.45, "toNumOrUndefined('123.45') === 123.45");
assert(toNumOrUndefined("invalid") === undefined, "toNumOrUndefined('invalid') === undefined");

// 8. Test evaluateHookBattle verdict (C1)
console.log("\n── 8. evaluateHookBattle Verdict Tests (C1) ──");

const baseVersionA: VersionBattleStats = {
  _id: "ad_1",
  name: "Ad 1",
  displayName: "Hook A",
  spend: 100,
  impressions: 1500,
  clicks: 120,
  results: 10,
  costPerResult: 10,
  ctr: 0.08,
};

const baseVersionB: VersionBattleStats = {
  _id: "ad_2",
  name: "Ad 2",
  displayName: "Hook B",
  spend: 100,
  impressions: 1500,
  clicks: 110,
  results: 5,
  costPerResult: 20,
  ctr: 0.07,
};

// Case 1: Both known -> kind === "odluka"
const evalBothKnown = evaluateHookBattle([baseVersionA, baseVersionB]);
assert(
  evalBothKnown.kind === "odluka",
  `Both costPerResult known -> kind === "odluka" (got: ${evalBothKnown.kind})`,
);
if (evalBothKnown.kind === "odluka") {
  assert(evalBothKnown.leaderId === "ad_1", "Leader is ad_1 with lowest CPA");
}

// Currency formatting tests (D2)
const fSpendUndefined = formatMetric(1234.5, spendDef, undefined);
console.log(`  formatMetric(1234.5, def_spend, undefined): "${fSpendUndefined}"`);
assert(
  !fSpendUndefined.includes("€") && !fSpendUndefined.includes("RSD") && !fSpendUndefined.includes("$"),
  `formatMetric(1234.5, def_spend, undefined) -> bez simbola valute (got: "${fSpendUndefined}")`,
);

const fSpendRsd = formatMetric(1234.5, spendDef, "RSD");
console.log(`  formatMetric(1234.5, def_spend, "RSD"): "${fSpendRsd}"`);
assert(
  fSpendRsd.includes("RSD") || fSpendRsd.includes("din") || fSpendRsd.includes("дин"),
  `formatMetric(1234.5, def_spend, "RSD") -> sa RSD (got: "${fSpendRsd}")`,
);

// Case 3: Both results === 0 -> evaluates by Hook Rate (or CTR) -> kind === "odluka", not "nedovoljno" (D1)
const versionAZeroResults: VersionBattleStats = {
  _id: "ad_1",
  name: "Ad 1",
  displayName: "Hook A",
  spend: 100,
  impressions: 2000,
  clicks: 120,
  results: 0,
  costPerResult: undefined,
  hookRate: 0.35,
  ctr: 0.06,
};
const versionBZeroResults: VersionBattleStats = {
  _id: "ad_2",
  name: "Ad 2",
  displayName: "Hook B",
  spend: 100,
  impressions: 1800,
  clicks: 90,
  results: 0,
  costPerResult: undefined,
  hookRate: 0.20,
  ctr: 0.05,
};
const evalZeroResults = evaluateHookBattle([versionAZeroResults, versionBZeroResults]);
assert(
  evalZeroResults.kind === "odluka",
  `verdikt kad su results === 0 na obe strane -> kind "odluka", ne "nedovoljno" (got: ${evalZeroResults.kind})`,
);
if (evalZeroResults.kind === "odluka") {
  assert(evalZeroResults.leaderId === "ad_1", "Leader with higher Hook Rate is ad_1");
}

console.log(`\n=================================================`);
console.log(`TOTAL: ${passed} passed, ${failed} failed.`);
console.log(`=================================================`);

if (failed > 0) {
  process.exit(1);
}

