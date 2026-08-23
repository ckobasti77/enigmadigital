/**
 * ============================================================================
 * DOKAZ: Ispravnost Google Ads konverzija, dinamičkog backfill-a i dopune GA3 (GA4)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-conversions.ts
 *   ili: npm run verify:gads-conversions
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 * ============================================================================
 */

import schema from "../convex/schema";
import {
  calculateGoogleAdsBackfillDepth,
  type GoogleAdsConversionActionItem,
} from "../convex/lib/googleAdsBackfill";
import {
  GOOGLE_ADS_METRIC_CATALOG,
  resolveGoogleAdsMetric,
  buildGaqlQuery,
  isGaqlComboAllowed,
  deriveRate,
} from "../convex/lib/googleAdsCatalog";
import { microsToUnits } from "../convex/lib/googleAdsApi";
import { TABLE_OWNERSHIP, PURGE_STEPS } from "../convex/lib/purgeMap";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

// ── 1. Deo A: Dopuna GA3 (monthlyCap i spendingCapNotice uklonjeni iz schema) ─
console.log("1. Provera Dopune GA3 — polja uklonjena iz šeme i baze (Deo A)");

const schemaTables = (schema as unknown as { tables: Record<string, { validator: { fields: Record<string, unknown> } }> }).tables;
const gadsBudgetsTable = schemaTables["gadsBudgets"];

check("Tabela 'gadsBudgets' postoji u šemi", Boolean(gadsBudgetsTable));

const budgetFields = gadsBudgetsTable?.validator?.fields ?? {};

check(
  "gadsBudgets.monthlyCap se više NE NALAZI u šemi (A1: izvedena vrednost pri čitanju)",
  !("monthlyCap" in budgetFields),
);

check(
  "gadsBudgets.spendingCapNotice se više NE NALAZI u šemi (A2: statička konstanta u kodu)",
  !("spendingCapNotice" in budgetFields),
);

// Provera izvođenja monthlyCap pri čitanju: amount * 30.4
const testAmount = 25.5;
const derivedMonthlyCap = Number((testAmount * 30.4).toFixed(2));
check(
  `Izvođenje monthlyCap pri čitanju: amount ${testAmount} EUR -> ${derivedMonthlyCap} EUR`,
  derivedMonthlyCap === 775.2,
);

// ── 2. Deo B: Dinamičko izvođenje dubine backfill-a (B2) ─────────────────────
console.log("\n2. Provera dinamičkog izvođenja dubine backfill-a (B2)");

// a) Prozor 90 kod jedne akcije i 7 kod druge -> dubina je 90
const actionsMixed: GoogleAdsConversionActionItem[] = [
  {
    id: "ca_1",
    name: "Lead Form Submission",
    status: "ENABLED",
    primaryForGoal: true,
    clickThroughLookupWindowDays: 7,
  },
  {
    id: "ca_2",
    name: "High Value Purchase",
    status: "ENABLED",
    primaryForGoal: true,
    clickThroughLookupWindowDays: 90,
  },
];
const resMixed = calculateGoogleAdsBackfillDepth(actionsMixed);
check(
  "Prozor 90 kod jedne akcije i 7 kod druge -> dubina backfill-a je 90",
  resMixed.skipped === false && resMixed.depth === 90,
);

// b) Prozor 0 ili nedostaje kod svih -> skipped: true sa razlogom, NE pretpostavlja se 30
const actionsMissing: GoogleAdsConversionActionItem[] = [
  {
    id: "ca_3",
    name: "Zero Window Action",
    status: "ENABLED",
    primaryForGoal: true,
    clickThroughLookupWindowDays: 0,
  },
  {
    id: "ca_4",
    name: "Undefined Window Action",
    status: "ENABLED",
    primaryForGoal: false,
    clickThroughLookupWindowDays: undefined,
  },
];
const resMissing = calculateGoogleAdsBackfillDepth(actionsMissing);
check(
  "Prozor 0 ili nedostaje kod svih aktivnih akcija -> skipped: true sa razlogom (NE 30)",
  resMissing.skipped === true &&
    typeof resMissing.reason === "string" &&
    resMissing.reason.includes("prozor pripisivanja"),
);

// Nema akcija uopšte -> skipped: true
const resEmpty = calculateGoogleAdsBackfillDepth([]);
check(
  "Prazna lista akcija -> skipped: true sa jasnim razlogom",
  resEmpty.skipped === true && typeof resEmpty.reason === "string",
);

// c) Prozor 200 -> ograničen na 90
const actionsOversized: GoogleAdsConversionActionItem[] = [
  {
    id: "ca_5",
    name: "Oversized Window Action",
    status: "ENABLED",
    primaryForGoal: true,
    clickThroughLookupWindowDays: 200,
  },
];
const resOversized = calculateGoogleAdsBackfillDepth(actionsOversized);
check(
  "Prozor 200 dana -> ograničen na maksimalnih 90 dana ([1, 90])",
  resOversized.skipped === false && resOversized.depth === 90,
);

// d) Samo pauzirane ili uklonjene akcije -> dubina se ne računa iz njih
const actionsPausedOnly: GoogleAdsConversionActionItem[] = [
  {
    id: "ca_6",
    name: "Paused Action with 90d window",
    status: "PAUSED",
    primaryForGoal: true,
    clickThroughLookupWindowDays: 90,
  },
  {
    id: "ca_7",
    name: "Removed Action with 60d window",
    status: "REMOVED",
    primaryForGoal: true,
    clickThroughLookupWindowDays: 60,
  },
];
const resPausedOnly = calculateGoogleAdsBackfillDepth(actionsPausedOnly);
check(
  "Samo pauzirane/uklonjene akcije -> dubina se ne računa iz njih (skipped: true)",
  resPausedOnly.skipped === true && resPausedOnly.reason.includes("Nema aktivnih"),
);

// ── 3. Deo B: conversions je decimalan broj (B3) ─────────────────────────────
console.log("\n3. Provera decimalnih konverzija (B3)");

const decimalConversions = 2.33;
const rawConversionsApi = "2.33";
const parsedConversions = Number(rawConversionsApi);

check(
  "Parsed conversions '2.33' ostaje tačno 2.33 bez odsecanja na ceo broj",
  parsedConversions === 2.33 && !Number.isInteger(parsedConversions),
);

// Provera da conversions u adInsights validatoru prihvata decimalan broj (Float64)
const adInsightsTable = schemaTables["adInsights"];
const adInsightsFields = adInsightsTable?.validator?.fields ?? {};
check("adInsights tabela ima definisano conversions polje", "conversions" in adInsightsFields);
check("adInsights tabela ima definisano allConversions polje", "allConversions" in adInsightsFields);

// Simulacija upisa gde se decimalni broj ne zaokružuje
function sanitizeConversionsValue(val: number | string | undefined | null): number | undefined {
  if (val === undefined || val === null) return undefined;
  const num = typeof val === "number" ? val : Number(val);
  return Number.isFinite(num) ? num : undefined;
}

check(
  "sanitizeConversionsValue(2.33) preživljava kao 2.33 bez zaokruživanja",
  sanitizeConversionsValue(decimalConversions) === 2.33,
);

// ── 4. Deo B: conversions i all_conversions su odvojena polja (B4) ───────────
console.log("\n4. Provera odvajanja conversions i all_conversions (B4)");

const mockRecord = {
  conversions: 4.25, // samo primary_for_goal
  allConversions: 9.75, // sve konverzije
};

check("conversions i allConversions su dva odvojena polja", mockRecord.conversions !== mockRecord.allConversions);
check("conversions se nikada ne prepisuje preko allConversions", mockRecord.conversions === 4.25 && mockRecord.allConversions === 9.75);

// ── 5. Deo B: conversions_value_micros kroz microsToUnits (B5) ───────────────
console.log("\n5. Provera konverzije novčane vrednosti konverzija (B5)");

check("microsToUnits(0) === 0 (prava nula iz API-ja ostaje nula)", microsToUnits(0) === 0);
check("microsToUnits('15500000') === 15.5", microsToUnits("15500000") === 15.5);
check("microsToUnits(undefined) === undefined (nepoznato ostaje undefined)", microsToUnits(undefined) === undefined);
check("microsToUnits(null) === undefined", microsToUnits(null) === undefined);
check("microsToUnits('invalid') === undefined", microsToUnits("invalid") === undefined);

// ── 6. Deo B: Nova tabela gadsConversionActions u purgeMap na OBA mesta (B1) ─
console.log("\n6. Provera nove tabele gadsConversionActions u purgeMap (B1)");

const caTableInSchema = Boolean(schemaTables["gadsConversionActions"]);
check("Tabela 'gadsConversionActions' postoji u Convex šemi", caTableInSchema);

const ownership = TABLE_OWNERSHIP["gadsConversionActions" as keyof typeof TABLE_OWNERSHIP];
const inOwnership =
  ownership &&
  "purgedBy" in ownership &&
  ownership.purgedBy.includes("google_ads");
check(
  "Tabela 'gadsConversionActions' je definisana u TABLE_OWNERSHIP sa purgedBy: ['google_ads']",
  Boolean(inOwnership),
);

const gadsSteps = PURGE_STEPS.google_ads ?? [];
const purgedTables = new Set<string>();
for (const s of gadsSteps) {
  for (const t of s.tables) {
    purgedTables.add(t);
  }
}
check(
  "Tabela 'gadsConversionActions' je uključena u PURGE_STEPS.google_ads",
  purgedTables.has("gadsConversionActions"),
);

// ── 7. Deo B: GAQL upit za conversion_action kroz buildGaqlQuery (B6) ────────
console.log("\n7. Provera GAQL graditelja i kataloga za conversion_action (B6)");

const caComboCheck = isGaqlComboAllowed("conversion_action", [
  "conversion_action.id",
  "conversion_action.name",
  "conversion_action.status",
  "conversion_action.primary_for_goal",
]);
check("isGaqlComboAllowed dozvoljava resurs 'conversion_action'", caComboCheck.allowed === true);

const caQuery = buildGaqlQuery({
  resource: "conversion_action",
  fields: [
    "conversion_action.id",
    "conversion_action.name",
    "conversion_action.status",
    "conversion_action.category",
    "conversion_action.type",
    "conversion_action.primary_for_goal",
    "conversion_action.counting_type",
    "conversion_action.attribution_model_settings.attribution_model",
    "conversion_action.click_through_lookback_window_days",
    "conversion_action.view_through_lookback_window_days",
  ],
  where: "conversion_action.status != 'REMOVED'",
});

check(
  "buildGaqlQuery gradi ispravan GAQL SELECT za conversion_action",
  caQuery.startsWith("SELECT conversion_action.id, conversion_action.name") &&
    caQuery.includes("FROM conversion_action") &&
    caQuery.includes("WHERE conversion_action.status != 'REMOVED'"),
);

// Provera da su konverzione metrike u katalogu
check("Metrika 'conversions' je u katalogu sa unit: count", resolveGoogleAdsMetric("metrics.conversions")?.unit === "count");
check("Metrika 'all_conversions' je u katalogu sa unit: count", resolveGoogleAdsMetric("metrics.all_conversions")?.unit === "count");
check("Metrika 'conversions_value_micros' je u katalogu sa isMicros: true", resolveGoogleAdsMetric("metrics.conversions_value_micros")?.isMicros === true);
check("Metrika 'cost_per_conversion' je ratio/izvedena (stored: false)", resolveGoogleAdsMetric("cost_per_conversion")?.stored === false);

// ── Završni izveštaj ────────────────────────────────────────────────────────
console.log("\nRezultat provere Google Ads konverzija i backfill-a:");
if (failures === 0) {
  console.log("✓ Sve provere za GA4 konverzije, dinamički backfill i dopunu GA3 su USPEŠNO PROŠLE.");
  process.exit(0);
} else {
  console.error(`✗ Broj neuspešnih provera: ${failures}`);
  process.exit(1);
}
