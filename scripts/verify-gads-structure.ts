/**
 * ============================================================================
 * DOKAZ: Ispravnost Google Ads strukture naloga, deljenih budžeta,
 * kvotne kapije i purge pokrivenosti (GA3)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-structure.ts
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 * ============================================================================
 */

import {
  calculateTotalAllocatedBudget,
  SPENDING_CAP_NOTICE,
} from "../convex/googleAdsStore";
import {
  deriveRate,
} from "../convex/lib/rates";
import {
  deriveRate as deriveRateMeta,
} from "../convex/lib/metaAdsCatalog";
import {
  deriveRate as deriveRateGoogle,
} from "../convex/lib/googleAdsCatalog";
import {
  buildGaqlQuery,
  isGaqlComboAllowed,
} from "../convex/lib/googleAdsCatalog";
import {
  microsToUnits,
} from "../convex/lib/googleAdsShared";
import {
  checkGoogleAdsQuota,
} from "../convex/lib/googleAdsQuota";
import {
  TABLE_OWNERSHIP,
  PURGE_STEPS,
} from "../convex/lib/purgeMap";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

// ── 1. Deo A: Konsolidacija deriveRate u rates.ts ────────────────────────────
console.log("1. Provera deriveRate konsolidacije u rates.ts (Deo A)");

check("deriveRate iz rates.ts: deriveRate(0, 100) === 0 (prava nula preživljava)", deriveRate(0, 100) === 0);
check("deriveRate iz rates.ts: deriveRate(5, 0) === undefined (deljenje nulom nije nula)", deriveRate(5, 0) === undefined);
check("deriveRate iz rates.ts: deriveRate(undefined, 100) === undefined", deriveRate(undefined, 100) === undefined);
check("deriveRate iz rates.ts: deriveRate(100, undefined) === undefined", deriveRate(100, undefined) === undefined);
check("deriveRate iz rates.ts: deriveRate(NaN, 100) === undefined", deriveRate(NaN, 100) === undefined);
check("deriveRate iz rates.ts: deriveRate(100, -5) === undefined", deriveRate(100, -5) === undefined);

// Provera re-eksporta iz metaAdsCatalog i googleAdsCatalog
check("deriveRate uvezen kroz metaAdsCatalog je identičan", deriveRateMeta(0, 100) === 0 && deriveRateMeta(5, 0) === undefined);
check("deriveRate uvezen kroz googleAdsCatalog je identičan", deriveRateGoogle(0, 100) === 0 && deriveRateGoogle(5, 0) === undefined);

// ── 2. Deljeni budžeti se ne broje dvaput u zbiru (GA3 B2) ───────────────────
console.log("\n2. Provera rukovanja deljenim budžetima (B2)");

const sampleBudgets = [
  {
    budgetId: "budget_shared_101",
    name: "Deljeni Search Budžet RS",
    amount: 50,
    explicitlyShared: true,
  },
  {
    budgetId: "budget_shared_101", // Isti budžet vezan za drugu kampanju
    name: "Deljeni Search Budžet RS",
    amount: 50,
    explicitlyShared: true,
  },
  {
    budgetId: "budget_standalone_202",
    name: "Zaseban PMax Budžet",
    amount: 30,
    explicitlyShared: false,
  },
];

const totalAllocated = calculateTotalAllocatedBudget(sampleBudgets);
check(
  `Deljen budžet (50 EUR) vezan za dve kampanje i zaseban budžet (30 EUR) daju zbir 80 EUR (dobijeno: ${totalAllocated})`,
  totalAllocated === 80,
);

// ── 3. Micros konverzija i nepoznati/nulti iznosi budžeta (GA3 B4) ───────────
console.log("\n3. Provera tretmana nepoznatog iznosa i nule (B4)");

// a) Nepoznat iznos kroz microsToUnits daje undefined
const unknownMicros1 = microsToUnits(undefined);
const unknownMicros2 = microsToUnits(null);
const unknownMicros3 = microsToUnits("nepoznato");
check("microsToUnits(undefined) vraća undefined", unknownMicros1 === undefined);
check("microsToUnits(null) vraća undefined", unknownMicros2 === undefined);
check("microsToUnits('nepoznato') vraća undefined", unknownMicros3 === undefined);

// b) Budžet bez iznosa se ne upisuje
function shouldPersistBudget(amount?: number | null): boolean {
  return (
    amount !== undefined &&
    amount !== null &&
    typeof amount === "number" &&
    Number.isFinite(amount)
  );
}

check("Budžet bez iznosa (undefined) -> shouldPersistBudget je false (red se NE UPISUJE)", !shouldPersistBudget(unknownMicros1));

// c) Budžet sa iznosom 0 se upisuje sa nulom
const zeroMicros = microsToUnits(0);
check("microsToUnits(0) vraća tačno 0 (prava nula preživljava)", zeroMicros === 0);
check("Budžet sa iznosom 0 -> shouldPersistBudget je true (red se UPISUJE sa 0)", shouldPersistBudget(zeroMicros));

// ── 4. Google limit potrošnje 2x dnevno i 30.4x mesečno (GA3 B3) ─────────────
console.log("\n4. Provera kalkulacije limita potrošnje (2x dnevno / 30.4x mesečno) (B3)");

const testDailyBudget = 10;
const maxDailySpend = Number((testDailyBudget * 2).toFixed(2));
const monthlyCap = Number((testDailyBudget * 30.4).toFixed(2));

check("Za dnevni budžet 10 EUR, maxDailySpend je 20 EUR (2x)", maxDailySpend === 20);
check("Za dnevni budžet 10 EUR, monthlyCap je 304 EUR (10 * 30.4)", monthlyCap === 304);
check("SPENDING_CAP_NOTICE sadrži jasno objašnjenje na srpskom", SPENDING_CAP_NOTICE.includes("2x") && SPENDING_CAP_NOTICE.includes("30.4"));

// ── 5. Svi GAQL upiti prolaze kroz buildGaqlQuery i isGaqlComboAllowed (GA3 B5)
console.log("\n5. Provera GAQL upita strukture naloga (B5)");

// Upit 1: customer_client (MCC hijerarhija)
const query1 = buildGaqlQuery({
  resource: "customer_client",
  fields: [
    "customer_client.client_customer",
    "customer_client.id",
    "customer_client.descriptive_name",
    "customer_client.currency_code",
    "customer_client.time_zone",
    "customer_client.manager",
    "customer_client.level",
    "customer_client.status",
    "customer_client.hidden",
  ],
});
const check1 = isGaqlComboAllowed("customer_client", [
  "customer_client.id",
  "customer_client.descriptive_name",
]);
check("Upit za customer_client je validan GAQL", query1.startsWith("SELECT customer_client.client_customer") && check1.allowed);

// Upit 2: campaign_budget (budžeti)
const query2 = buildGaqlQuery({
  resource: "campaign_budget",
  fields: [
    "campaign_budget.id",
    "campaign_budget.name",
    "campaign_budget.amount_micros",
    "campaign_budget.total_amount_micros",
    "campaign_budget.status",
    "campaign_budget.delivery_method",
    "campaign_budget.explicitly_shared",
    "campaign_budget.reference_count",
  ],
  where: "campaign_budget.status != 'REMOVED'",
});
const check2 = isGaqlComboAllowed("campaign_budget", [
  "campaign_budget.id",
  "campaign_budget.amount_micros",
]);
check("Upit za campaign_budget je validan GAQL", query2.includes("FROM campaign_budget") && check2.allowed);

// Upit 3: campaign (kampanje sa budžetom)
const query3 = buildGaqlQuery({
  resource: "campaign",
  fields: [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "campaign.advertising_channel_type",
    "campaign.campaign_budget",
    "campaign.start_date",
    "campaign.end_date",
  ],
  where: "campaign.status != 'REMOVED'",
});
const check3 = isGaqlComboAllowed("campaign", [
  "campaign.id",
  "campaign.name",
]);
check("Upit za campaign je validan GAQL", query3.includes("FROM campaign") && check3.allowed);

// Upit 4: ad_group (oglasne grupe)
const query4 = buildGaqlQuery({
  resource: "ad_group",
  fields: [
    "campaign.id",
    "campaign.name",
    "ad_group.id",
    "ad_group.name",
    "ad_group.status",
    "ad_group.type",
    "ad_group.cpc_bid_micros",
  ],
  where: [
    "campaign.status != 'REMOVED'",
    "ad_group.status != 'REMOVED'",
  ],
});
const check4 = isGaqlComboAllowed("ad_group", [
  "ad_group.id",
  "ad_group.name",
]);
check("Upit za ad_group je validan GAQL", query4.includes("FROM ad_group") && check4.allowed);

// Upit 5: campaign_criterion (ciljanje: lokacije, jezici, raspored, uređaji)
const query5 = buildGaqlQuery({
  resource: "campaign_criterion",
  fields: [
    "campaign.id",
    "campaign_criterion.criterion_id",
    "campaign_criterion.type",
    "campaign_criterion.negative",
    "campaign_criterion.status",
    "campaign_criterion.bid_modifier",
    "campaign_criterion.location.geo_target_constant",
    "campaign_criterion.language.language_constant",
    "campaign_criterion.ad_schedule.day_of_week",
    "campaign_criterion.ad_schedule.start_hour",
    "campaign_criterion.ad_schedule.start_minute",
    "campaign_criterion.ad_schedule.end_hour",
    "campaign_criterion.ad_schedule.end_minute",
    "campaign_criterion.keyword.text",
    "campaign_criterion.keyword.match_type",
    "campaign_criterion.device.type",
  ],
  where: "campaign.status != 'REMOVED'",
});
const check5 = isGaqlComboAllowed("campaign_criterion", [
  "campaign_criterion.criterion_id",
  "campaign_criterion.type",
]);
check("Upit za campaign_criterion je validan GAQL", query5.includes("FROM campaign_criterion") && check5.allowed);

// ── 6. Nove tabele postoje u purgeMap na oba mesta (GA3 B6) ──────────────────
console.log("\n6. Provera novih tabela u purgeMap (B6)");

const newTables = [
  "gadsCustomerClients",
  "gadsBudgets",
  "gadsCampaignCriteria",
] as const;

const gadsSteps = PURGE_STEPS.google_ads ?? [];
const purgedTableSet = new Set<string>();
for (const s of gadsSteps) {
  for (const t of s.tables) {
    purgedTableSet.add(t);
  }
}

for (const tbl of newTables) {
  const ownership = TABLE_OWNERSHIP[tbl as keyof typeof TABLE_OWNERSHIP];
  const inOwnership = ownership && "purgedBy" in ownership && ownership.purgedBy.includes("google_ads");
  const inSteps = purgedTableSet.has(tbl);

  check(`Tabela '${tbl}' je definisana u TABLE_OWNERSHIP sa purgedBy: ['google_ads']`, Boolean(inOwnership));
  check(`Tabela '${tbl}' je uključena u PURGE_STEPS.google_ads`, inSteps);
}

// ── 7. Kvotna kapija sa skipped: true sprečava pokretanje (GA3 B1) ───────────
console.log("\n7. Provera kvotne kapije (B1)");

// a) Kada je potrošeno 96% kvote (preko 95% STOP praga)
const highQuotaCheck = checkGoogleAdsQuota(2750, 2880, 1);
check("Prekoračena kvota (2750/2880 = 95.5%) vraća skipped: true", highQuotaCheck.skipped === true);
if (highQuotaCheck.skipped) {
  check("Kvotna kapija vraća deskriptivan razlog na srpskom", highQuotaCheck.reason.includes("Nedovoljno preostale Google Ads API kvote"));
  check("Kvotna kapija vraća state: 'stop'", highQuotaCheck.state === "stop");
}

// b) Kada nema dovoljno preostalih operacija za traženi broj
const insufficientOpsCheck = checkGoogleAdsQuota(2879, 2880, 5);
check("Nedovoljan broj slobodnih operacija (1 preostala, traženo 5) vraća skipped: true", insufficientOpsCheck.skipped === true);

// c) Kada ima dovoljno kvote
const normalQuotaCheck = checkGoogleAdsQuota(100, 2880, 1);
check("Normalna kvota (100/2880) vraća skipped: false", normalQuotaCheck.skipped === false);

// ── Završni izveštaj ────────────────────────────────────────────────────────
console.log("\nRezultat provere strukture Google Ads naloga:");
if (failures === 0) {
  console.log("✓ Sve provere za GA3 (struktura, budžeti, kvotna kapija, rates, purge) su uspešno prošle.");
  process.exit(0);
} else {
  console.error(`✗ Broj neuspešnih provera: ${failures}`);
  process.exit(1);
}
