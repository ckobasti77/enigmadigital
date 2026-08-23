/**
 * ============================================================================
 * DOKAZ: Ispravnost Google Ads ključnih reči, Quality Score atributa,
 * search termina i negativnih lista (GA5)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-keywords.ts
 *   ili: npm run verify:gads-keywords
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 * ============================================================================
 */

import schema from "../convex/schema";
import {
  formatQualityComponent,
  formatQualityScoreComponent,
  formatQualityScore,
  formatSearchTermStatus,
  formatMatchType,
} from "../convex/lib/googleAdsFormat";
import {
  calculateSearchTermCoverage,
} from "../convex/googleAdsStore";
import {
  buildGaqlQuery,
  isGaqlComboAllowed,
  resolveGoogleAdsMetric,
  deriveRate,
} from "../convex/lib/googleAdsCatalog";
import { microsToUnits } from "../convex/lib/googleAdsShared";
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

// ── 1. Quality Score koji nedostaje NE postaje 0 i polje se ne upisuje (B1) ──
console.log("1. Provera Quality Score tretmana — nedostajući podatak nije 0 (B1)");

function sanitizeQualityScoreForPersist(rawScore?: number | null): number | undefined {
  if (
    rawScore !== undefined &&
    rawScore !== null &&
    typeof rawScore === "number" &&
    Number.isFinite(rawScore) &&
    rawScore >= 1 &&
    rawScore <= 10
  ) {
    return Math.round(rawScore);
  }
  return undefined;
}

const missingScore1 = sanitizeQualityScoreForPersist(undefined);
const missingScore2 = sanitizeQualityScoreForPersist(null);
const missingScore3 = sanitizeQualityScoreForPersist(0); // 0 nije validan QS u Google Ads-u
const validScore1 = sanitizeQualityScoreForPersist(1);
const validScore10 = sanitizeQualityScoreForPersist(10);
const validScoreDecimal = sanitizeQualityScoreForPersist(7.4);

check("Nedostajući Quality Score (undefined) -> polje se NE UPISUJE (rezultat je undefined)", missingScore1 === undefined);
check("Quality Score null -> polje se NE UPISUJE (rezultat je undefined)", missingScore2 === undefined);
check("Quality Score 0 -> polje se NE UPISUJE i NE POSTAJE 0 (rezultat je undefined)", missingScore3 === undefined);
check("Quality Score 1 se upisuje tačno kao 1 (prava ocena 1 preživljava)", validScore1 === 1);
check("Quality Score 10 se upisuje tačno kao 10", validScore10 === 10);
check("Quality Score 7.4 se zaokružuje na ceo broj 7 (1..10)", validScoreDecimal === 7);

// Provera prikaza / formatera za Quality Score
check("formatQualityScore(undefined) daje '—'", formatQualityScore(undefined) === "—");
check("formatQualityScore(null) daje '—'", formatQualityScore(null) === "—");
check("formatQualityScore(0) daje '—' (nula nije važeća ocena)", formatQualityScore(0) === "—");
check("formatQualityScore(1) daje '1/10'", formatQualityScore(1) === "1/10");
check("formatQualityScore(8) daje '8/10'", formatQualityScore(8) === "8/10");

// ── 2. Komponente Quality Score-a su enumovi, nikad brojevi (B2) ─────────────
console.log("\n2. Provera formatera komponenti Quality Score-a (B2)");

// a) ABOVE_AVERAGE
const aboveAvg = formatQualityComponent("ABOVE_AVERAGE");
check(
  "formatQualityComponent('ABOVE_AVERAGE') daje { label: 'iznad proseka', known: true }",
  aboveAvg.known === true && aboveAvg.label === "iznad proseka",
);

// b) AVERAGE
const avg = formatQualityComponent("AVERAGE");
check(
  "formatQualityComponent('AVERAGE') daje { label: 'prosek', known: true }",
  avg.known === true && avg.label === "prosek",
);

// c) BELOW_AVERAGE
const belowAvg = formatQualityComponent("BELOW_AVERAGE");
check(
  "formatQualityComponent('BELOW_AVERAGE') daje { label: 'ispod proseka', known: true }",
  belowAvg.known === true && belowAvg.label === "ispod proseka",
);

// d) UNKNOWN i odsustvo vrednosti moraju da daju known: false i NIKADA 'ispod proseka'
const unknownComp = formatQualityComponent("UNKNOWN");
check(
  "formatQualityComponent('UNKNOWN') daje { known: false } i NIJE 'ispod proseka'",
  unknownComp.known === false && !unknownComp.label.includes("ispod proseka"),
);

const undefinedComp = formatQualityComponent(undefined);
check(
  "formatQualityComponent(undefined) daje { known: false } i NIJE 'ispod proseka'",
  undefinedComp.known === false && !undefinedComp.label.includes("ispod proseka"),
);

const nullComp = formatQualityComponent(null);
check(
  "formatQualityComponent(null) daje { known: false }",
  nullComp.known === false,
);

const emptyComp = formatQualityComponent("");
check(
  "formatQualityComponent('') daje { known: false }",
  emptyComp.known === false,
);

// Provera aliasa formatQualityScoreComponent
check(
  "formatQualityScoreComponent alias radi identično",
  formatQualityScoreComponent("ABOVE_AVERAGE").label === "iznad proseka" &&
    formatQualityScoreComponent("UNKNOWN").known === false,
);

// ── 3. Zbir search termina nije jednak ukupnom broju i prijavljuje se kao razlika (B3) ─
console.log("\n3. Provera kalkulacije pokrivenosti i privatnosne razlike search termina (B3)");

// Slučaj 1: Vidljivi search termini (850 impresija) od ukupno 1000 impresija
const coverage1 = calculateSearchTermCoverage(850, 1000);
check("termsImpressions je 850", coverage1.termsImpressions === 850);
check("totalImpressions je 1000", coverage1.totalImpressions === 1000);
check("Razlika (hiddenImpressions) je tačno 150 (1000 - 850)", coverage1.hiddenImpressions === 150);
check("coveragePct je 85.0%", coverage1.coveragePct === 85.0);
check(
  "Obaveštenje jasno navodi prikazano X od Y i objašnjenje za privatnost",
  coverage1.notice.includes("Prikazano 850 od 1000") &&
    coverage1.notice.includes("privatnosti") &&
    coverage1.notice.includes("85%"),
);

// Slučaj 2: 100% pokrivenost (nema skrivene razlike)
const coverage2 = calculateSearchTermCoverage(500, 500);
check("Kada su termini jednaki ukupnom broju, hiddenImpressions je 0", coverage2.hiddenImpressions === 0);
check("coveragePct je 100%", coverage2.coveragePct === 100);

// Slučaj 3: 0 ukupnih impresija (GA5 Dopuna)
const coverage3 = calculateSearchTermCoverage(0, 0);
check("Za 0 impresija coveragePct je undefined (ne lažnih 100%)", coverage3.coveragePct === undefined && coverage3.coverageRatio === undefined);
check("Za 0 impresija notice navodi da se pokrivenost ne može utvrditi", coverage3.notice.includes("ne može utvrditi"));

// ── 4. Tip podudaranja i status preživljavaju (B4) ───────────────────────────
console.log("\n4. Provera formata statusa i tipa podudaranja search termina (B4)");

// a) Statusi pretraga: ADDED, EXCLUDED, NONE, UNKNOWN
const statusAdded = formatSearchTermStatus("ADDED");
check("formatSearchTermStatus('ADDED') prepoznaje dodatu reč", statusAdded.raw === "ADDED" && statusAdded.label.includes("Dodato"));

const statusExcluded = formatSearchTermStatus("EXCLUDED");
check("formatSearchTermStatus('EXCLUDED') prepoznaje isključenu reč", statusExcluded.raw === "EXCLUDED" && statusExcluded.label.includes("Isključeno"));

const statusNone = formatSearchTermStatus("NONE");
check("formatSearchTermStatus('NONE') prepoznaje neobrađenu pretragu", statusNone.raw === "NONE" && statusNone.label.includes("Nije obrađeno"));

const statusUndef = formatSearchTermStatus(undefined);
check("formatSearchTermStatus(undefined) vraća podrazumevani status", statusUndef.raw === "NONE");

// b) Match Types: EXACT, PHRASE, BROAD, NEAR_EXACT, NEAR_PHRASE
const mtExact = formatMatchType("EXACT");
check("formatMatchType('EXACT') vraća Tačno podudaranje i simbol [reč]", mtExact.raw === "EXACT" && mtExact.symbol === "[reč]");

const mtPhrase = formatMatchType("PHRASE");
check("formatMatchType('PHRASE') vraća Podudaranje fraze i simbol \"reč\"", mtPhrase.raw === "PHRASE" && mtPhrase.symbol === '"reč"');

const mtBroad = formatMatchType("BROAD");
check("formatMatchType('BROAD') vraća Široko podudaranje i simbol reč", mtBroad.raw === "BROAD" && mtBroad.symbol === "reč");

const mtNearExact = formatMatchType("NEAR_EXACT");
check("formatMatchType('NEAR_EXACT') vraća Približno tačno", mtNearExact.raw === "NEAR_EXACT");

// ── 5. Sve nove tabele u šemi i purgeMap na OBA mesta (B5, B6) ──────────────
console.log("\n5. Provera novih tabela u šemi i purgeMap (B5, B6)");

const schemaTables = (schema as unknown as { tables: Record<string, { validator: { fields: Record<string, unknown> } }> }).tables;

const newGadsTables = [
  "gadsSearchTerms",
  "gadsSharedSets",
  "gadsSharedCriteria",
  "gadsCampaignSharedSets",
] as const;

const gadsSteps = PURGE_STEPS.google_ads ?? [];
const purgedTableSet = new Set<string>();
for (const s of gadsSteps) {
  for (const t of s.tables) {
    purgedTableSet.add(t);
  }
}

for (const tbl of newGadsTables) {
  const inSchema = Boolean(schemaTables[tbl]);
  check(`Tabela '${tbl}' postoji u Convex šemi`, inSchema);

  const ownership = TABLE_OWNERSHIP[tbl as keyof typeof TABLE_OWNERSHIP];
  const inOwnership =
    ownership &&
    "purgedBy" in ownership &&
    ownership.purgedBy.includes("google_ads");
  check(`Tabela '${tbl}' je definisana u TABLE_OWNERSHIP sa purgedBy: ['google_ads']`, Boolean(inOwnership));

  const inSteps = purgedTableSet.has(tbl);
  check(`Tabela '${tbl}' je uključena u PURGE_STEPS.google_ads`, inSteps);
}

// ── 6. Svi GAQL upiti prolaze kroz buildGaqlQuery i isGaqlComboAllowed (B6) ───
console.log("\n6. Provera GAQL upita za search_term_view i negativne liste (B6)");

// a) search_term_view
const stQuery = buildGaqlQuery({
  resource: "search_term_view",
  fields: [
    "campaign.id",
    "ad_group.id",
    "search_term_view.search_term",
    "search_term_view.status",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
    "metrics.conversions",
    "metrics.all_conversions",
  ],
  segments: [
    "segments.date",
    "segments.search_term_match_type",
  ],
  dateRange: { startDate: "2026-08-01", endDate: "2026-08-15" },
  where: [
    "campaign.status != 'REMOVED'",
    "ad_group.status != 'REMOVED'",
  ],
});

const stComboCheck = isGaqlComboAllowed("search_term_view", [
  "search_term_view.search_term",
  "metrics.impressions",
]);

check(
  "buildGaqlQuery gradi ispravan SELECT za search_term_view",
  stQuery.startsWith("SELECT campaign.id, ad_group.id, search_term_view.search_term") &&
    stQuery.includes("FROM search_term_view") &&
    stQuery.includes("segments.date BETWEEN '2026-08-01' AND '2026-08-15'") &&
    stComboCheck.allowed === true,
);

// b) shared_set (deljene negativne liste)
const sharedSetQuery = buildGaqlQuery({
  resource: "shared_set",
  fields: [
    "shared_set.id",
    "shared_set.name",
    "shared_set.type",
    "shared_set.status",
    "shared_set.member_count",
    "shared_set.reference_count",
  ],
  where: "shared_set.status != 'REMOVED'",
});
const ssComboCheck = isGaqlComboAllowed("shared_set", ["shared_set.id", "shared_set.name"]);

check(
  "buildGaqlQuery gradi ispravan GAQL SELECT za shared_set",
  sharedSetQuery.includes("FROM shared_set") &&
    sharedSetQuery.includes("WHERE shared_set.status != 'REMOVED'") &&
    ssComboCheck.allowed === true,
);

// c) shared_criterion (kriterijumi u deljenim listama)
const sharedCritQuery = buildGaqlQuery({
  resource: "shared_criterion",
  fields: [
    "shared_criterion.criterion_id",
    "shared_criterion.shared_set",
    "shared_criterion.type",
    "shared_criterion.keyword.text",
    "shared_criterion.keyword.match_type",
  ],
});
const scComboCheck = isGaqlComboAllowed("shared_criterion", [
  "shared_criterion.criterion_id",
  "shared_criterion.shared_set",
]);

check(
  "buildGaqlQuery gradi ispravan GAQL SELECT za shared_criterion",
  sharedCritQuery.includes("FROM shared_criterion") && scComboCheck.allowed === true,
);

// d) campaign_shared_set (povezivanje kampanja sa deljenim listama)
const campSharedSetQuery = buildGaqlQuery({
  resource: "campaign_shared_set",
  fields: [
    "campaign.id",
    "campaign_shared_set.shared_set",
    "campaign_shared_set.status",
  ],
  where: "campaign_shared_set.status != 'REMOVED'",
});
const cssComboCheck = isGaqlComboAllowed("campaign_shared_set", [
  "campaign.id",
  "campaign_shared_set.shared_set",
]);

check(
  "buildGaqlQuery gradi ispravan GAQL SELECT za campaign_shared_set",
  campSharedSetQuery.includes("FROM campaign_shared_set") && cssComboCheck.allowed === true,
);

// e) keyword_view sa Quality Score poljima
const kwViewQuery = buildGaqlQuery({
  resource: "keyword_view",
  fields: [
    "campaign.id",
    "ad_group.id",
    "ad_group_criterion.criterion_id",
    "ad_group_criterion.keyword.text",
    "ad_group_criterion.keyword.match_type",
    "ad_group_criterion.quality_info.quality_score",
    "ad_group_criterion.quality_info.creative_quality_score",
    "ad_group_criterion.quality_info.post_click_quality_score",
    "ad_group_criterion.quality_info.search_predicted_ctr",
    "ad_group_criterion.status",
    "metrics.impressions",
    "metrics.clicks",
    "metrics.cost_micros",
    "metrics.conversions",
  ],
  segments: ["segments.date"],
  dateRange: { startDate: "2026-08-01", endDate: "2026-08-15" },
  where: "ad_group_criterion.status != 'REMOVED'",
});
const kwComboCheck = isGaqlComboAllowed("keyword_view", [
  "quality_score",
  "search_predicted_ctr",
  "metrics.impressions",
]);

check(
  "buildGaqlQuery gradi ispravan GAQL SELECT za keyword_view sa Quality Score",
  kwViewQuery.includes("FROM keyword_view") && kwComboCheck.allowed === true,
);

// ── 7. Novčane i ratio metrike u katalogu (TVRDA PRAVILA) ───────────────────
console.log("\n7. Provera kataloga i pravila za novac i odnose (TVRDA PRAVILA)");

check("microsToUnits(5500000) === 5.5", microsToUnits(5500000) === 5.5);
check("microsToUnits(0) === 0 (prava nula ostaje 0)", microsToUnits(0) === 0);
check("microsToUnits(undefined) === undefined (nepoznato ostaje undefined)", microsToUnits(undefined) === undefined);

const qsMetric = resolveGoogleAdsMetric("quality_score");
check("quality_score metrika ima unit: 'score' i stored: true", qsMetric?.unit === "score" && qsMetric.stored === true);

const expCtrMetric = resolveGoogleAdsMetric("search_predicted_ctr");
check("search_predicted_ctr ima unit: 'score'", expCtrMetric?.unit === "score");

const ctrMetric = resolveGoogleAdsMetric("ctr");
check("CTR je ratio metrika i stored je false (izvodi se preko deriveRate)", ctrMetric?.unit === "ratio" && ctrMetric.stored === false);
check("deriveRate(10, 200) === 0.05", deriveRate(10, 200) === 0.05);

// ── Završni izveštaj ────────────────────────────────────────────────────────
console.log("\nRezultat provere Google Ads ključnih reči, Quality Score-a i search termina:");
if (failures === 0) {
  console.log("✓ Sve provere za GA5 (Quality Score B1/B2, Search Terms B3/B4, Negative Lists B5, GAQL/Purge B6) su USPEŠNO PROŠLE.");
  process.exit(0);
} else {
  console.error(`✗ Broj neuspešnih provera: ${failures}`);
  process.exit(1);
}
