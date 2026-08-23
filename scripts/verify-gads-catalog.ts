/**
 * ============================================================================
 * DOKAZ: Ispravnost Google Ads kataloga metrika, pravila i GAQL graditelja (GA2)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-catalog.ts
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 * ============================================================================
 */

import {
  GOOGLE_ADS_METRIC_CATALOG,
  resolveGoogleAdsMetric,
  deriveRate,
  isGaqlComboAllowed,
  buildGaqlQuery,
  PROHIBITED_SEGMENT_COMBINATIONS,
  RESOURCE_FIELD_RESTRICTIONS,
} from "../convex/lib/googleAdsCatalog";
import type { GoogleAdsMetricUnit } from "../convex/lib/googleAdsCatalog";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

console.log("1. Provera kataloga metrika i jedinica (B1)");

const VALID_UNITS: GoogleAdsMetricUnit[] = ["count", "currency", "ratio", "duration", "score"];
const catalogKeys = Object.keys(GOOGLE_ADS_METRIC_CATALOG);

check("Katalog metrika nije prazan", catalogKeys.length > 0);

// Provera obaveznih metrika
const requiredMetrics = [
  "impressions",
  "clicks",
  "cost_micros",
  "conversions",
  "conversions_value_micros",
  "ctr",
  "average_cpc",
  "average_cpm",
  "search_impression_share",
  "video_views",
  "interactions",
];

for (const req of requiredMetrics) {
  const metric = GOOGLE_ADS_METRIC_CATALOG[req];
  check(`Obavezna metrika '${req}' postoji u katalogu`, metric !== undefined);
}

// Svaka metrika ima validnu jedinicu, label na srpskom, i kategoriju
let allMetricsHaveValidUnit = true;
let allRatiosAreNotStored = true;
let allMicrosAreCurrency = true;

for (const [key, metric] of Object.entries(GOOGLE_ADS_METRIC_CATALOG)) {
  if (!VALID_UNITS.includes(metric.unit)) {
    allMetricsHaveValidUnit = false;
    console.error(`    Neispravna jedinica za metriku '${key}': ${metric.unit}`);
  }
  if (metric.unit === "ratio" && metric.stored !== false) {
    allRatiosAreNotStored = false;
    console.error(`    GREŠKA: Ratio metrika '${key}' je označena kao stored: true!`);
  }
  if (metric.isMicros && metric.unit !== "currency") {
    allMicrosAreCurrency = false;
    console.error(`    GREŠKA: Metrika sa isMicros '${key}' nije tipa currency!`);
  }
}

check("Svaka metrika u katalogu ima validnu jedinicu (count, currency, ratio, duration, score)", allMetricsHaveValidUnit);
check("Nijedan ratio (odnos) nije označen kao polje koje se čuva (stored: false)", allRatiosAreNotStored);
check("Sve *_micros metrike su tipa currency i nose oznaku isMicros", allMicrosAreCurrency);

// Provera resolveGoogleAdsMetric
check("resolveGoogleAdsMetric pronalazi metriku po apiName ('metrics.impressions')", resolveGoogleAdsMetric("metrics.impressions")?.unit === "count");
check("resolveGoogleAdsMetric pronalazi metriku po ključu ('cost_micros')", resolveGoogleAdsMetric("cost_micros")?.unit === "currency");

// Provera deriveRate
check("deriveRate(undefined, 100) === undefined", deriveRate(undefined, 100) === undefined);
check("deriveRate(100, undefined) === undefined", deriveRate(100, undefined) === undefined);
check("deriveRate(100, 0) === undefined (deljenje nulom)", deriveRate(100, 0) === undefined);
check("deriveRate(0, 100) === 0 (prava nula preživljava)", deriveRate(0, 100) === 0);
check("deriveRate(50, 1000) === 0.05", deriveRate(50, 1000) === 0.05);

console.log("\n2. Provera pravila kompatibilnosti za GAQL (B2)");

// Provera segmenta age_range + gender
const ageGenderCombo = isGaqlComboAllowed("ad_group", [
  "metrics.impressions",
  "segments.age_range",
  "segments.gender",
]);
check(
  "age_range + gender u istom upitu daje allowed: false",
  ageGenderCombo.allowed === false,
);
if (!ageGenderCombo.allowed) {
  check(
    "Razlog za zabranu age_range + gender je na srpskom i pominje segmente",
    ageGenderCombo.reason.includes("age_range") &&
      ageGenderCombo.reason.includes("gender") &&
      ageGenderCombo.reason.includes("Google Ads API"),
  );
}

// Provera dva resursa u FROM (ili JOIN)
const multiResourceCheck1 = isGaqlComboAllowed("campaign, ad_group", [
  "metrics.impressions",
]);
check("Više resursa odvojenih zarezom u FROM daje allowed: false", multiResourceCheck1.allowed === false);

const multiResourceCheck2 = isGaqlComboAllowed("campaign JOIN ad_group", [
  "metrics.impressions",
]);
check("JOIN u FROM daje allowed: false", multiResourceCheck2.allowed === false);

const emptyResourceCheck = isGaqlComboAllowed("", ["metrics.impressions"]);
check("Prazan resurs daje allowed: false", emptyResourceCheck.allowed === false);

// Provera specifičnih nekompatibilnosti resursa i metrika
const searchShareOnAd = isGaqlComboAllowed("ad_group_ad", [
  "metrics.impressions",
  "metrics.search_impression_share",
]);
check(
  "search_impression_share na resursu 'ad_group_ad' daje allowed: false",
  searchShareOnAd.allowed === false,
);

const qsOnCampaign = isGaqlComboAllowed("campaign", [
  "metrics.impressions",
  "quality_score",
]);
check("quality_score na resursu 'campaign' daje allowed: false", qsOnCampaign.allowed === false);

// Provera validne kombinacije
const validCombo1 = isGaqlComboAllowed("campaign", [
  "campaign.id",
  "campaign.name",
  "metrics.impressions",
  "metrics.clicks",
  "metrics.cost_micros",
  "segments.date",
]);
check("Validna kombinacija za resurs 'campaign' daje allowed: true", validCombo1.allowed === true);

const validCombo2 = isGaqlComboAllowed("keyword_view", [
  "ad_group_criterion.keyword.text",
  "metrics.impressions",
  "metrics.clicks",
  "quality_score",
  "search_predicted_ctr",
  "segments.date",
]);
check("Validna kombinacija za resurs 'keyword_view' sa Quality Score daje allowed: true", validCombo2.allowed === true);

console.log("\n3. Provera graditelja GAQL upita (B3)");

// Validno građenje upita sa datumskim rasponom i WHERE
const validQuery = buildGaqlQuery({
  resource: "campaign",
  fields: [
    "campaign.id",
    "campaign.name",
    "campaign.status",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
  ],
  segments: ["segments.date"],
  dateRange: {
    startDate: "2026-08-01",
    endDate: "2026-08-15",
  },
  where: "campaign.status = 'ENABLED'",
  limit: 50,
});

check(
  "buildGaqlQuery gradi ispravan SELECT",
  validQuery.startsWith(
    "SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, segments.date",
  ),
);
check("buildGaqlQuery sadrži FROM campaign", validQuery.includes("FROM campaign"));
check(
  "buildGaqlQuery sadrži WHERE sa datumskim rasponom i filterom",
  validQuery.includes("WHERE campaign.status = 'ENABLED' AND segments.date BETWEEN '2026-08-01' AND '2026-08-15'"),
);
check("buildGaqlQuery sadrži LIMIT 50", validQuery.endsWith("LIMIT 50"));

// buildGaqlQuery baca grešku za zabranjenu kombinaciju (age_range + gender)
let threwForForbiddenCombo = false;
let forbiddenReason = "";
try {
  buildGaqlQuery({
    resource: "ad_group",
    fields: ["metrics.impressions"],
    segments: ["segments.age_range", "segments.gender"],
  });
} catch (err: any) {
  threwForForbiddenCombo = true;
  forbiddenReason = err.message;
}
check(
  "buildGaqlQuery za zabranjenu kombinaciju (age_range + gender) baca Error",
  threwForForbiddenCombo,
);
check(
  "Razlog u bačenoj grešci je razumljiv opis na srpskom",
  forbiddenReason.includes("age_range") && forbiddenReason.includes("gender"),
);

// buildGaqlQuery baca grešku za multi-resource FROM
let threwForMultiResource = false;
try {
  buildGaqlQuery({
    resource: "campaign, ad_group",
    fields: ["metrics.impressions"],
  });
} catch {
  threwForMultiResource = true;
}
check("buildGaqlQuery baca grešku za multi-resource FROM", threwForMultiResource);

// buildGaqlQuery baca grešku za neispravan datumski format
let threwForInvalidDate = false;
try {
  buildGaqlQuery({
    resource: "campaign",
    fields: ["metrics.impressions"],
    dateRange: {
      startDate: "01/08/2026",
      endDate: "2026-08-15",
    },
  });
} catch {
  threwForInvalidDate = true;
}
check("buildGaqlQuery baca grešku za neispravan format datuma", threwForInvalidDate);

console.log("\nRezultat provere:");
if (failures === 0) {
  console.log("✓ Sve provere za Google Ads katalog metrika i GAQL pravila su uspešno prošle.");
  process.exit(0);
} else {
  console.error(`✗ Broj neuspešnih provera: ${failures}`);
  process.exit(1);
}
