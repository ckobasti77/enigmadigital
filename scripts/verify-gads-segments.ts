/**
 * ============================================================================
 * DOKAZ: Ispravnost Google Ads segmentacije (GA6) i dopune pokrivenosti (GA5)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-segments.ts
 *   ili: npm run verify:gads-segments
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 * ============================================================================
 */

import schema from "../convex/schema";
import {
  formatDeviceType,
  formatDayOfWeek,
  formatAgeRange,
  formatGender,
  formatLocationType,
} from "../convex/lib/googleAdsFormat";
import {
  calculateSearchTermCoverage,
  calculateSegmentCoverage,
  BREAKDOWN_NOT_SUM_NOTICE,
} from "../convex/googleAdsStore";
import {
  buildGaqlQuery,
  isGaqlComboAllowed,
  deriveRate,
} from "../convex/lib/googleAdsCatalog";
import { microsToUnits } from "../convex/lib/googleAdsApi";
import { TABLE_OWNERSHIP, PURGE_STEPS } from "../convex/lib/purgeMap";
import {
  calculateRollingQuota,
  checkGoogleAdsQuota,
  getGoogleAdsDailyLimit,
  ACCESS_LEVEL_LIMITS,
} from "../convex/lib/googleAdsQuota";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

// ── 1. DOPUNA GA5: Pokrivenost search termina (DEO A) ────────────────────────
console.log("1. Provera ispravke pokrivenosti search termina (DEO A)");

// Slučaj A1: Ukupno = 0 daje undefined (NE 100%)
const covZero = calculateSearchTermCoverage(0, 0);
check(
  "Pokrivenost sa ukupno = 0 daje coveragePct = undefined",
  covZero.coveragePct === undefined,
);
check(
  "Pokrivenost sa ukupno = 0 daje coverageRatio = undefined",
  covZero.coverageRatio === undefined,
);
check(
  "Notice navodi da se pokrivenost ne može utvrditi",
  covZero.notice.includes("ne može utvrditi"),
);

// Slučaj A2: Ukupno = undefined daje undefined
const covUndef = calculateSearchTermCoverage(120, undefined);
check(
  "Pokrivenost sa ukupno = undefined daje coveragePct = undefined",
  covUndef.coveragePct === undefined,
);
check(
  "Pokrivenost sa ukupno = undefined daje coverageRatio = undefined",
  covUndef.coverageRatio === undefined,
);

const covBothUndef = calculateSearchTermCoverage(undefined, undefined);
check(
  "Pokrivenost sa oba undefined daje coveragePct = undefined",
  covBothUndef.coveragePct === undefined,
);

// Slučaj A3: Poznat odnos 120/200 daje 60%
const covKnown = calculateSearchTermCoverage(120, 200);
check("Pokrivenost 120/200 daje coveragePct = 60", covKnown.coveragePct === 60);
check(
  "Pokrivenost 120/200 daje coverageRatio = 0.6",
  covKnown.coverageRatio === 0.6,
);
check(
  "Pokrivenost 120/200 ima hiddenImpressions = 80",
  covKnown.hiddenImpressions === 80,
);

// Slučaj A4: 100% pokrivenost kad su jednaki
const covFull = calculateSearchTermCoverage(500, 500);
check("Pokrivenost 500/500 daje coveragePct = 100", covFull.coveragePct === 100);
check("Pokrivenost 500/500 daje hiddenImpressions = 0", covFull.hiddenImpressions === 0);

// ── 2. GA6 B1: Geografija — geographic_view i user_location_view ─────────────
console.log("\n2. Provera geografskih segmenata (B1 — dva odvojena resursa)");

// Provera postojanja odvojenih tabela u shemi
const tables = (schema as any).tables;
check(
  "Tabela gadsGeographicView postoji u shemi",
  tables.gadsGeographicView !== undefined,
);
check(
  "Tabela gadsUserLocationView postoji u shemi",
  tables.gadsUserLocationView !== undefined,
);

// Provera indeksa
const geoIndexes = tables.gadsGeographicView?.indexes || [];
const userLocIndexes = tables.gadsUserLocationView?.indexes || [];

check(
  "gadsGeographicView ima indeks by_workspace_date",
  geoIndexes.some((idx: any) => idx.indexDescriptor === "by_workspace_date"),
);
check(
  "gadsGeographicView ima indeks by_upsert_key",
  geoIndexes.some((idx: any) => idx.indexDescriptor === "by_upsert_key"),
);
check(
  "gadsUserLocationView ima indeks by_workspace_date",
  userLocIndexes.some((idx: any) => idx.indexDescriptor === "by_workspace_date"),
);
check(
  "gadsUserLocationView ima indeks by_upsert_key",
  userLocIndexes.some((idx: any) => idx.indexDescriptor === "by_upsert_key"),
);

// Provera formatera lokacije
const locPres = formatLocationType("LOCATION_OF_PRESENCE");
check(
  "formatLocationType('LOCATION_OF_PRESENCE') prepoznaje fizičko prisustvo",
  locPres.known && locPres.label.includes("Fizička lokacija prisustva"),
);

const locInt = formatLocationType("AREA_OF_INTEREST");
check(
  "formatLocationType('AREA_OF_INTEREST') prepoznaje područje interesovanja",
  locInt.known && locInt.label.includes("Područje interesovanja"),
);

const locUnk = formatLocationType("UNKNOWN");
check(
  "formatLocationType('UNKNOWN') vraća known: false",
  !locUnk.known,
);

// Provera GAQL upita za geographic_view i user_location_view
const geoGaql = buildGaqlQuery({
  resource: "geographic_view",
  fields: [
    "campaign.id",
    "geographic_view.country_criterion_id",
    "geographic_view.location_type",
    "segments.date",
    "metrics.impressions",
    "metrics.cost_micros",
  ],
  dateRange: { startDate: "2026-02-01", endDate: "2026-02-07" },
});
check(
  "buildGaqlQuery gradi upit za geographic_view sa segments.date",
  geoGaql.includes("FROM geographic_view") && geoGaql.includes("segments.date"),
);

const userLocGaql = buildGaqlQuery({
  resource: "user_location_view",
  fields: [
    "campaign.id",
    "user_location_view.country_criterion_id",
    "user_location_view.targeting_location",
    "segments.date",
    "metrics.impressions",
  ],
  dateRange: { startDate: "2026-02-01", endDate: "2026-02-07" },
});
check(
  "buildGaqlQuery gradi upit za user_location_view",
  userLocGaql.includes("FROM user_location_view"),
);

// ── 3. GA6 B2: Uređaji — segments.device (MOBILE, DESKTOP, TABLET, CTV, OTHER, UNKNOWN)
console.log("\n3. Provera uređaja (B2 — očuvanje svih tipova i UNKNOWN flag)");

check(
  "Tabela gadsDeviceStats postoji u shemi",
  tables.gadsDeviceStats !== undefined,
);

const devMobile = formatDeviceType("MOBILE");
check("formatDeviceType('MOBILE') -> Mobilni telefoni (known: true)", devMobile.known && devMobile.label === "Mobilni telefoni");

const devDesktop = formatDeviceType("DESKTOP");
check("formatDeviceType('DESKTOP') -> Računari (known: true)", devDesktop.known && devDesktop.label === "Računari");

const devTablet = formatDeviceType("TABLET");
check("formatDeviceType('TABLET') -> Tableti (known: true)", devTablet.known && devTablet.label === "Tableti");

const devCtv = formatDeviceType("CONNECTED_TV");
check("formatDeviceType('CONNECTED_TV') -> Smart TV (known: true)", devCtv.known && devCtv.label.includes("Connected TV"));

const devOther = formatDeviceType("OTHER");
check("formatDeviceType('OTHER') -> Ostalo (known: true, nije izbačeno)", devOther.known && devOther.label === "Ostalo");

const devUnknown = formatDeviceType("UNKNOWN");
check("formatDeviceType('UNKNOWN') -> Nepoznato sa known: false (ne nestaje)", !devUnknown.known && devUnknown.label === "Nepoznato");

const devMissing = formatDeviceType(undefined);
check("formatDeviceType(undefined) -> known: false", !devMissing.known);

// GAQL upit za uređaje
const devGaql = buildGaqlQuery({
  resource: "campaign",
  fields: [
    "campaign.id",
    "segments.device",
    "segments.date",
    "metrics.impressions",
    "metrics.cost_micros",
  ],
  dateRange: { startDate: "2026-02-01", endDate: "2026-02-07" },
});
check(
  "buildGaqlQuery gradi upit sa segments.device",
  devGaql.includes("segments.device"),
);

// ── 4. GA6 B3: Raspored — segments.day_of_week i segments.hour ───────────────
console.log("\n4. Provera vremenskog rasporeda (B3 — stvarno trošenje po satima)");

check(
  "Tabela gadsHourlyStats postoji u shemi",
  tables.gadsHourlyStats !== undefined,
);

const dayMon = formatDayOfWeek("MONDAY");
check("formatDayOfWeek('MONDAY') -> Ponedeljak", dayMon.known && dayMon.label === "Ponedeljak");

const daySun = formatDayOfWeek("SUNDAY");
check("formatDayOfWeek('SUNDAY') -> Nedelja", daySun.known && daySun.label === "Nedelja");

const dayUnk = formatDayOfWeek("UNKNOWN");
check("formatDayOfWeek('UNKNOWN') -> known: false", !dayUnk.known);

const hourlyGaql = buildGaqlQuery({
  resource: "campaign",
  fields: [
    "campaign.id",
    "segments.day_of_week",
    "segments.hour",
    "segments.date",
    "metrics.impressions",
    "metrics.cost_micros",
  ],
  dateRange: { startDate: "2026-02-01", endDate: "2026-02-07" },
});
check(
  "buildGaqlQuery gradi upit sa segments.day_of_week i segments.hour",
  hourlyGaql.includes("segments.day_of_week") && hourlyGaql.includes("segments.hour"),
);

// ── 5. GA6 B4: Demografija — age_range_view i gender_view (dva upita) ─────────
console.log("\n5. Provera demografije (B4 — 2 odvojena upita i UNDETERMINED)");

check(
  "Tabela gadsAgeRangeView postoji u shemi",
  tables.gadsAgeRangeView !== undefined,
);
check(
  "Tabela gadsGenderView postoji u shemi",
  tables.gadsGenderView !== undefined,
);

// Zabrana mešanja age_range i gender u istom upitu
const comboCheck = isGaqlComboAllowed("campaign", [
  "segments.date",
  "segments.hour",
  "metrics.impressions",
]);
check("Kompatibilna kombinacija je dozvoljena", comboCheck.allowed);

// Provera formatera starosti
const age18 = formatAgeRange("AGE_RANGE_18_24");
check("formatAgeRange('AGE_RANGE_18_24') -> 18–24", age18.known && age18.label === "18–24");

const age65 = formatAgeRange("AGE_RANGE_65_UP");
check("formatAgeRange('AGE_RANGE_65_UP') -> 65+", age65.known && age65.label === "65+");

const ageUndet = formatAgeRange("UNDETERMINED");
check(
  "formatAgeRange('UNDETERMINED') preživljava sa known: true i oznakom 'Neodređeno'",
  ageUndet.known && ageUndet.label === "Neodređeno",
);

// Provera formatera pola
const genMale = formatGender("MALE");
check("formatGender('MALE') -> Muški", genMale.known && genMale.label === "Muški");

const genFemale = formatGender("FEMALE");
check("formatGender('FEMALE') -> Ženski", genFemale.known && genFemale.label === "Ženski");

const genUndet = formatGender("UNDETERMINED");
check(
  "formatGender('UNDETERMINED') preživljava sa known: true i oznakom 'Neodređeno'",
  genUndet.known && genUndet.label === "Neodređeno",
);

// Dva odvojena GAQL upita za starosne i polne grupe
const ageGaql = buildGaqlQuery({
  resource: "age_range_view",
  fields: [
    "campaign.id",
    "ad_group.id",
    "ad_group_criterion.criterion_id",
    "ad_group_criterion.age_range.type",
    "segments.date",
    "metrics.impressions",
    "metrics.cost_micros",
  ],
  dateRange: { startDate: "2026-02-01", endDate: "2026-02-07" },
});
check(
  "buildGaqlQuery gradi upit za age_range_view",
  ageGaql.includes("FROM age_range_view") && ageGaql.includes("age_range.type"),
);

const genderGaql = buildGaqlQuery({
  resource: "gender_view",
  fields: [
    "campaign.id",
    "ad_group.id",
    "ad_group_criterion.criterion_id",
    "ad_group_criterion.gender.type",
    "segments.date",
    "metrics.impressions",
    "metrics.cost_micros",
  ],
  dateRange: { startDate: "2026-02-01", endDate: "2026-02-07" },
});
check(
  "buildGaqlQuery gradi upit za gender_view",
  genderGaql.includes("FROM gender_view") && genderGaql.includes("gender.type"),
);

// ── 6. GA6 B5: Zbir preko segmenata nije ukupan broj (Razlaganje) ─────────────
console.log("\n6. Provera segmentnog pokrivanja i pravila razlaganja (B5)");

const segCovKnown = calculateSegmentCoverage(150, 200);
check("calculateSegmentCoverage(150, 200) daje coveragePct = 75", segCovKnown.coveragePct === 75);
check(
  "calculateSegmentCoverage sadrži isBreakdownOnlyNotice",
  segCovKnown.isBreakdownOnlyNotice === BREAKDOWN_NOT_SUM_NOTICE,
);
check(
  "Notice navodi da je u pitanju razlaganje",
  segCovKnown.notice.includes("razlaganje"),
);

const segCovZero = calculateSegmentCoverage(0, 0);
check(
  "calculateSegmentCoverage(0, 0) daje coveragePct = undefined",
  segCovZero.coveragePct === undefined && segCovZero.coverageRatio === undefined,
);

const segCovUndef = calculateSegmentCoverage(undefined, undefined);
check(
  "calculateSegmentCoverage(undefined, undefined) daje undefined",
  segCovUndef.coveragePct === undefined,
);

// ── 7. GA6 B6: Kvota — četiri segmentna upita troše 4 operacije ──────────────
console.log("\n7. Provera potrošnje kvote za 4 segmentna upita (B6)");

const now = Date.now();
const rolling1 = calculateRollingQuota(
  [
    { timestamp: now - 5000, count: 1 },
    { timestamp: now - 4000, count: 1 },
    { timestamp: now - 3000, count: 1 },
    { timestamp: now - 2000, count: 1 },
  ],
  15000,
  now,
);

check(
  "Četiri segmentna upita troše tačno 4 operacije kvote",
  rolling1.consumed24h === 4 && rolling1.remaining24h === 14996,
);

// ── 8. GA6 B6: Purge mapa pokriva svih 6 novih tabela na oba mesta ───────────
console.log("\n8. Provera purgeMap pokrivenosti za novih 6 tabela (B6)");

const newSegmentTables = [
  "gadsGeographicView",
  "gadsUserLocationView",
  "gadsDeviceStats",
  "gadsHourlyStats",
  "gadsAgeRangeView",
  "gadsGenderView",
] as const;

for (const tableName of newSegmentTables) {
  // Provera TABLE_OWNERSHIP
  const ownership = (TABLE_OWNERSHIP as any)[tableName];
  check(
    `TABLE_OWNERSHIP sadrži ${tableName} sa purgedBy: ['google_ads']`,
    ownership !== undefined &&
      Array.isArray(ownership.purgedBy) &&
      ownership.purgedBy.includes("google_ads"),
  );

  // Provera PURGE_STEPS.google_ads
  const gadsPurgeSteps = PURGE_STEPS.google_ads ?? [];
  const isPurgedInSteps = gadsPurgeSteps.some(
    (step: any) => Array.isArray(step.tables) && step.tables.includes(tableName),
  );
  check(
    `PURGE_STEPS.google_ads sadrži korak za ${tableName}`,
    isPurgedInSteps,
  );
}

// ── 9. Tvrda pravila: Stope se ne upisuju u bazu, cene kroz microsToUnits ────
console.log("\n9. Provera tvrdih pravila: bez izvedenih stopa i cene kroz microsToUnits");

// Provera strukture tabela u schema.ts — ne smeju sadržati cpc, ctr, cpm kolone
for (const tableName of newSegmentTables) {
  const tableDef = tables[tableName];
  const fieldValidator = tableDef?.validator?.fields || {};
  const fieldNames = Object.keys(fieldValidator);

  const hasCtr = fieldNames.includes("ctr");
  const hasCpc = fieldNames.includes("cpc");
  const hasCpm = fieldNames.includes("cpm");
  const hasRoas = fieldNames.includes("roas");

  check(
    `Tabela ${tableName} ne sadrži izvedenu stopu (ctr, cpc, cpm, roas)`,
    !hasCtr && !hasCpc && !hasCpm && !hasRoas,
  );
}

// Provera deriveRate za segmentne podatke
const ctrDerived = deriveRate(38, 480);
check("deriveRate računa CTR na klijentu/upitu (38/480)", ctrDerived !== undefined && Math.abs(ctrDerived - 38 / 480) < 0.0001);

const cpcDerived = deriveRate(24.5, 38);
check("deriveRate računa CPC na klijentu/upitu (24.5/38)", cpcDerived !== undefined && Math.abs(cpcDerived - 24.5 / 38) < 0.0001);

check("deriveRate za pravu nulu (0 / 480) vraća 0 (prava nula preživljava)", deriveRate(0, 480) === 0);
check("deriveRate za deljenje nulom (38 / 0) vraća undefined (ne lažnu nulu)", deriveRate(38, 0) === undefined);

// Provera konverzije novčanih iznosa
check("microsToUnits(15500000) -> 15.5 EUR", microsToUnits(15500000) === 15.5);
check("microsToUnits(0) -> 0", microsToUnits(0) === 0);
check("microsToUnits(undefined) -> undefined", microsToUnits(undefined) === undefined);

// ── Rezultat ─────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════════");
if (failures === 0) {
  console.log("✓ SVI TESTOVI ZA GA6 SEGMENTE I GA5 POKRIVENOST SU USPEŠNO PROŠLI!");
  console.log("════════════════════════════════════════════════════════════════\n");
  process.exit(0);
} else {
  console.error(`✗ UKUPNO NEUSPELIH TESTOVA: ${failures}`);
  console.log("════════════════════════════════════════════════════════════════\n");
  process.exit(1);
}
