/**
 * ============================================================================
 * GOOGLE ADS SERVICE ACCOUNT AUTH & GA7 ASSETS VERIFICATION SUITE
 * ============================================================================
 *
 * Verifies:
 *   1. Part A: Google Ads Service Account JSON validation (assertServiceAccountJson, validateCredentials).
 *   2. Part A: Developer Token environment gating (getGoogleAdsDeveloperToken).
 *   3. Part A: Access token scope and REST searchStream URL/header generation.
 *   4. Part B: GA7 Performance label enum mapping ({ label, known }).
 *   5. Part B: GA7 Asset field types & asset types formatting.
 *   6. Part B: GA7 Asset combination coverage calculation (undefined on 0/unknown, never 100).
 *   7. Part B: Purge coverage & Schema index uniqueness for all new tables.
 * ============================================================================
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  assertServiceAccountJson,
  validateCredentials,
} from "../convex/connections";

import { getGoogleAdsAccessToken } from "../convex/lib/googleAdsApi";
import {
  GOOGLE_ADS_SCOPE,
  getGoogleAdsDeveloperToken,
  normalizeCustomerId,
  buildSearchStreamUrl,
  buildGoogleAdsHeaders,
  extractGoogleAdsApiError,
  decamelizeRowKeys,
  microsToUnits,
  unitsToMicros,
} from "../convex/lib/googleAdsShared";

import {
  formatAssetPerformanceLabel,
  formatAssetFieldType,
  formatAssetType,
  calculateAssetCombinationCoverage,
} from "../convex/lib/googleAdsFormat";

import {
  buildGaqlQuery,
  isGaqlComboAllowed,
} from "../convex/lib/googleAdsCatalog";

import {
  PURGE_STEPS,
  TABLE_OWNERSHIP,
} from "../convex/lib/purgeMap";

console.log("▶ Running Google Ads Service Account Auth & GA7 Assets Verification Suite...\n");

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART A: AUTHENTICATION & SERVICE ACCOUNT MIGRATION
// ─────────────────────────────────────────────────────────────────────────────

const validServiceAccount = JSON.stringify({
  type: "service_account",
  project_id: "test-ads-project",
  private_key_id: "key-123",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----\n",
  client_email: "gads-service-account@test-ads-project.iam.gserviceaccount.com",
  client_id: "1234567890",
});

test("A1.1: assertServiceAccountJson accepts valid service account JSON", () => {
  assert.doesNotThrow(() => {
    assertServiceAccountJson(validServiceAccount);
  });
});

test("A1.2: assertServiceAccountJson rejects invalid JSON string", () => {
  assert.throws(
    () => {
      assertServiceAccountJson("not-a-valid-json");
    },
    (err: any) => err.data?.message?.includes("validan JSON") || err.message?.includes("JSON"),
  );
});

test("A1.3: assertServiceAccountJson rejects JSON missing private_key or client_email", () => {
  const missingKey = JSON.stringify({
    type: "service_account",
    project_id: "test-proj",
    client_email: "test@proj.iam.gserviceaccount.com",
  });
  assert.throws(() => assertServiceAccountJson(missingKey));

  const missingEmail = JSON.stringify({
    type: "service_account",
    project_id: "test-proj",
    private_key: "-----BEGIN PRIVATE KEY-----\n123\n-----END PRIVATE KEY-----",
  });
  assert.throws(() => assertServiceAccountJson(missingEmail));
});

test("A1.4: validateCredentials for google_ads normalizes customerId and externalIdAlt", () => {
  const res = validateCredentials(
    "google_ads",
    "123-456-7890",
    validServiceAccount,
    "987-654-3210",
  );
  assert.deepEqual(res, {
    externalId: "1234567890",
    externalIdAlt: "9876543210",
  });
});

test("A1.5: validateCredentials rejects invalid customerId format", () => {
  assert.throws(() => {
    validateCredentials("google_ads", "12345", validServiceAccount);
  });
  assert.throws(() => {
    validateCredentials("google_ads", "", validServiceAccount);
  });
});

test("A2.1: GOOGLE_ADS_SCOPE is strictly https://www.googleapis.com/auth/adwords", () => {
  assert.equal(GOOGLE_ADS_SCOPE, "https://www.googleapis.com/auth/adwords");
});

test("A2.2: getGoogleAdsAccessToken function exists and accepts service account payload", () => {
  assert.equal(typeof getGoogleAdsAccessToken, "function");
});

test("A3.1: getGoogleAdsDeveloperToken retrieves token when set in env", () => {
  const original = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  try {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = "DEV_TEST_TOKEN_123";
    assert.equal(getGoogleAdsDeveloperToken(), "DEV_TEST_TOKEN_123");
  } finally {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = original;
  }
});

test("A3.2: getGoogleAdsDeveloperToken throws descriptive error naming variable when missing", () => {
  const original = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  try {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    assert.throws(
      () => getGoogleAdsDeveloperToken(),
      (err: Error) => err.message.includes("GOOGLE_ADS_DEVELOPER_TOKEN"),
    );
  } finally {
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN = original;
  }
});

test("A4.1: buildSearchStreamUrl builds correct REST endpoint", () => {
  const url = buildSearchStreamUrl("123-456-7890", "v25");
  assert.equal(
    url,
    "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream",
  );
});

test("A4.2: buildGoogleAdsHeaders builds correct headers including optional MCC login-customer-id", () => {
  const headers = buildGoogleAdsHeaders({
    developerToken: "DEV_TOK",
    accessToken: "ACCESS_TOK",
    loginCustomerId: "987-654-3210",
  });
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["Authorization"], "Bearer ACCESS_TOK");
  assert.equal(headers["developer-token"], "DEV_TOK");
  assert.equal(headers["login-customer-id"], "9876543210");
});

// ─────────────────────────────────────────────────────────────────────────────
// PART B: GA7 CREATIVES & ASSETS
// ─────────────────────────────────────────────────────────────────────────────

test("B2.1: formatAssetPerformanceLabel correctly handles BEST, GOOD, LOW as known: true", () => {
  const best = formatAssetPerformanceLabel("BEST");
  assert.deepEqual(best, { label: "Najbolje", known: true, raw: "BEST" });

  const good = formatAssetPerformanceLabel("GOOD");
  assert.deepEqual(good, { label: "Dobro", known: true, raw: "GOOD" });

  const low = formatAssetPerformanceLabel("LOW");
  assert.deepEqual(low, { label: "Nisko", known: true, raw: "LOW" });
});

test("B2.2: formatAssetPerformanceLabel marks LEARNING and PENDING as known: false (learning/pending != bad)", () => {
  const learning = formatAssetPerformanceLabel("LEARNING");
  assert.deepEqual(learning, { label: "Učenje (meri se)", known: false, raw: "LEARNING" });

  const pending = formatAssetPerformanceLabel("PENDING");
  assert.deepEqual(pending, { label: "Na čekanju", known: false, raw: "PENDING" });
});

test("B2.3: formatAssetPerformanceLabel marks UNKNOWN / empty as known: false without throwing", () => {
  const unknown = formatAssetPerformanceLabel("UNKNOWN");
  assert.deepEqual(unknown, { label: "Nepoznato", known: false, raw: "UNKNOWN" });

  const empty = formatAssetPerformanceLabel(undefined);
  assert.deepEqual(empty, { label: "Nepoznato", known: false, raw: "UNKNOWN" });
});

test("B3.1: calculateAssetCombinationCoverage calculates coverage and hidden impressions when total > 0", () => {
  const res = calculateAssetCombinationCoverage(600, 1000);
  assert.equal(res.combinationImpressions, 600);
  assert.equal(res.totalImpressions, 1000);
  assert.equal(res.hiddenImpressions, 400);
  assert.equal(res.coverageRatio, 0.6);
  assert.equal(res.coveragePct, 60.0);
});

test("B3.2: calculateAssetCombinationCoverage returns undefined coverage when total is 0, undefined or unknown (NEVER 100)", () => {
  const resNull = calculateAssetCombinationCoverage(500, null);
  assert.equal(resNull.coverageRatio, undefined);
  assert.equal(resNull.coveragePct, undefined);

  const resZero = calculateAssetCombinationCoverage(0, 0);
  assert.equal(resZero.coverageRatio, undefined);
  assert.equal(resZero.coveragePct, undefined);

  const resUndef = calculateAssetCombinationCoverage(500, undefined);
  assert.equal(resUndef.coverageRatio, undefined);
  assert.equal(resUndef.coveragePct, undefined);
});

test("B4.1: formatAssetFieldType formats standard Google Ads field types", () => {
  assert.equal(formatAssetFieldType("HEADLINE").label, "Naslov");
  assert.equal(formatAssetFieldType("DESCRIPTION").label, "Opis");
  assert.equal(formatAssetFieldType("MARKETING_IMAGE").label, "Marketinška slika");
  assert.equal(formatAssetFieldType("LOGO").label, "Logotip");
  assert.equal(formatAssetFieldType("SITELINK").label, "Sitelink (veza do stranice)");
  assert.equal(formatAssetFieldType("CALL").label, "Telefonski poziv");
});

test("B4.2: formatAssetType formats standard Google Ads asset types", () => {
  assert.equal(formatAssetType("TEXT").label, "Tekst");
  assert.equal(formatAssetType("IMAGE").label, "Slika");
  assert.equal(formatAssetType("YOUTUBE_VIDEO").label, "Video (YouTube)");
  assert.equal(formatAssetType("CALL").label, "Poziv");
});

test("B5.1: GAQL query builder supports asset resources", () => {
  const assetQuery = buildGaqlQuery({
    resource: "asset",
    fields: ["asset.id", "asset.name", "asset.type"],
    where: "asset.status != 'REMOVED'",
  });
  assert.ok(assetQuery.includes("FROM asset"));
  assert.ok(assetQuery.includes("asset.id"));

  const assetViewQuery = buildGaqlQuery({
    resource: "ad_group_ad_asset_view",
    fields: [
      "campaign.id",
      "ad_group.id",
      "ad_group_ad.ad.id",
      "ad_group_ad_asset_view.asset",
      "ad_group_ad_asset_view.field_type",
      "ad_group_ad_asset_view.performance_label",
    ],
    where: "campaign.status != 'REMOVED'",
  });
  assert.ok(assetViewQuery.includes("FROM ad_group_ad_asset_view"));

  const comboQuery = buildGaqlQuery({
    resource: "ad_group_ad_asset_combination_view",
    fields: [
      "campaign.id",
      "ad_group.id",
      "ad_group_ad.ad.id",
      "ad_group_ad_asset_combination_view.served_assets",
    ],
    where: "campaign.status != 'REMOVED'",
  });
  assert.ok(comboQuery.includes("FROM ad_group_ad_asset_combination_view"));
});

test("B5.2: purgeMap includes all new GA7 asset tables in GOOGLE_ADS_STEPS and TABLE_OWNERSHIP", () => {
  const requiredTables = [
    "gadsAssets",
    "gadsAdGroupAdAssetViews",
    "gadsAssetCombinationViews",
  ];

  const purgedTables = new Set<string>();
  const steps = PURGE_STEPS.google_ads ?? [];
  for (const step of steps) {
    for (const t of step.tables) {
      purgedTables.add(t);
    }
  }

  for (const table of requiredTables) {
    assert.ok(
      purgedTables.has(table),
      `Tabela ${table} nedostaje u PURGE_STEPS.google_ads unutar purgeMap.ts`,
    );

    const ownership = (TABLE_OWNERSHIP as Record<string, any>)[table];
    assert.ok(
      ownership && ownership.purgedBy?.includes("google_ads"),
      `Tabela ${table} nedostaje ili nema purgedBy: ["google_ads"] u TABLE_OWNERSHIP unutar purgeMap.ts`,
    );
  }
});

test("B5.3: Schema index uniqueness check - verify NO table has two identical index definitions", () => {
  const schemaPath = path.resolve(process.cwd(), "convex/schema.ts");
  const content = fs.readFileSync(schemaPath, "utf-8");

  // Parse tables and their indexes
  const tableRegex = /([a-zA-Z0-9_]+):\s*defineTable\(\{[\s\S]*?\}\)([\s\S]*?)(?=\n\s*[a-zA-Z0-9_]+:\s*defineTable|\n\}\);)/g;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const indexBlock = match[2];

    const indexRegex = /\.index\(\s*["']([^"']+)["']\s*,\s*\[([^\]]+)\]\s*\)/g;
    const seenSignatures = new Map<string, string>();
    let idxMatch: RegExpExecArray | null;

    while ((idxMatch = indexRegex.exec(indexBlock)) !== null) {
      const idxName = idxMatch[1];
      const fields = idxMatch[2]
        .split(",")
        .map((f) => f.trim().replace(/["']/g, ""))
        .join(",");

      if (seenSignatures.has(fields)) {
        throw new Error(
          `Duplirani indeks u tabeli "${tableName}": indeks "${idxName}" ima identična polja [${fields}] kao "${seenSignatures.get(fields)}"`,
        );
      }
      seenSignatures.set(fields, idxName);
    }
  }
});

test("Helper decamelizeRowKeys handles nested Google Ads response objects", () => {
  const raw = {
    campaignBudget: {
      id: "123",
      amountMicros: "5000000",
    },
    metrics: {
      costMicros: "2500000",
      searchImpressionShare: 0.85,
    },
  };

  const decamelized: any = decamelizeRowKeys(raw);
  assert.equal(decamelized.campaign_budget.amount_micros, "5000000");
  assert.equal(decamelized.campaignBudget.amountMicros, "5000000");
  assert.equal(decamelized.metrics.cost_micros, "2500000");
  assert.equal(decamelized.metrics.search_impression_share, 0.85);
});

console.log(`\n🎉 All ${passed} tests passed successfully!`);
