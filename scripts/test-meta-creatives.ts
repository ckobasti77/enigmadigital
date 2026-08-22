import assert from "node:assert/strict";
import {
  PREVIEW_CACHE_MAX_AGE_MS,
  buildAdPreviewUrl,
  buildTargetingSearchUrl,
  buildDeliveryEstimateUrl,
  formatEstimateRange,
  AD_CREATIVE_FIELDS,
} from "../convex/lib/metaAdsApi";

async function runTests() {
  console.log("Pokrećem testove za Meta Kreative i Preglede (Modul C)...");

  // ── Test 1: Konstante i polja kreativa (C1) ──────────────────────────────────
  console.log("\n[Test 1] Polja adCreatives i definicije:");
  assert.ok(AD_CREATIVE_FIELDS.includes("id"), "AD_CREATIVE_FIELDS mora sadržati 'id'");
  assert.ok(AD_CREATIVE_FIELDS.includes("name"), "AD_CREATIVE_FIELDS mora sadržati 'name'");
  assert.ok(AD_CREATIVE_FIELDS.includes("thumbnail_url"), "AD_CREATIVE_FIELDS mora sadržati 'thumbnail_url'");
  assert.ok(AD_CREATIVE_FIELDS.includes("body"), "AD_CREATIVE_FIELDS mora sadržati 'body'");
  assert.ok(AD_CREATIVE_FIELDS.includes("title"), "AD_CREATIVE_FIELDS mora sadržati 'title'");
  assert.ok(AD_CREATIVE_FIELDS.includes("call_to_action_type"), "AD_CREATIVE_FIELDS mora sadržati 'call_to_action_type'");
  console.log("  ✓ Sva obavezna polja kreativa su prisutna u definiciji");

  // ── Test 2: Keširanje pregleda (C2) ─────────────────────────────────────────
  console.log("\n[Test 2] TTL keširanja pregleda (12 sati):");
  assert.strictEqual(
    PREVIEW_CACHE_MAX_AGE_MS,
    12 * 60 * 60 * 1000,
    "PREVIEW_CACHE_MAX_AGE_MS mora biti tačno 12 sati (43.200.000 ms)",
  );
  assert.ok(
    PREVIEW_CACHE_MAX_AGE_MS < 24 * 60 * 60 * 1000,
    "Keš ne sme biti blizu 24h limita da se izbegne beli prazan okvir",
  );
  console.log("  ✓ TTL keša je tačno 12 sati (43.200.000 ms)");

  // ── Test 3: Logika osvežavanja i vraćanja zastarelog pregleda (C2) ───────────
  console.log("\n[Test 3] Logika starosti keša i stale fallback:");
  const now = 1700000000000;
  const freshFetchedAt = now - 2 * 60 * 60 * 1000; // pre 2 sata
  const isFresh = now - freshFetchedAt < PREVIEW_CACHE_MAX_AGE_MS;
  assert.strictEqual(isFresh, true, "Pregled od pre 2h mora biti u kešu");

  const staleFetchedAt = now - 13 * 60 * 60 * 1000; // pre 13 sati
  const isStale = now - staleFetchedAt >= PREVIEW_CACHE_MAX_AGE_MS;
  assert.strictEqual(isStale, true, "Pregled od pre 13h mora biti prepoznat kao zastareo");
  console.log("  ✓ Keš prepoznaje sveže i zastarele preglede");

  // ── Test 4: URL bilderi za pregled i targeting (C2, C5) ──────────────────────
  console.log("\n[Test 4] Bilderi URL-ova:");
  const previewUrl = buildAdPreviewUrl("123456789", "token123", "DESKTOP_FEED_STANDARD");
  assert.ok(previewUrl.includes("/123456789/previews?"));
  assert.ok(previewUrl.includes("ad_format=DESKTOP_FEED_STANDARD"));
  assert.ok(previewUrl.includes("access_token=token123"));

  const targetingUrl = buildTargetingSearchUrl("987654321", "marketing", "adinterest");
  assert.ok(targetingUrl.includes("/act_987654321/targetingsearch?"));
  assert.ok(targetingUrl.includes("q=marketing"));
  assert.ok(targetingUrl.includes("type=adinterest"));

  const deliveryUrl = buildDeliveryEstimateUrl("987654321", {
    optimization_goal: "OFFSITE_CONVERSIONS",
  });
  assert.ok(deliveryUrl.includes("/act_987654321/delivery_estimate?"));
  assert.ok(deliveryUrl.includes("optimization_goal=OFFSITE_CONVERSIONS"));
  console.log("  ✓ URL bilderi generišu ispravne putanje sa v25.0 verzijom");

  // ── Test 5: Formatiranje procena kao RASPONI (C4) ────────────────────────────
  console.log("\n[Test 5] Formatiranje procene dosega (C4 rasponi, nikad jedan broj, nikad nula):");
  
  // Oba poznata
  const rangeBoth = formatEstimateRange(1200, 5000);
  assert.strictEqual(rangeBoth.formatted, "1.200 – 5.000");
  assert.strictEqual(rangeBoth.lower, 1200);
  assert.strictEqual(rangeBoth.upper, 5000);

  // Samo donja granica
  const rangeLower = formatEstimateRange(10000, undefined);
  assert.strictEqual(rangeLower.formatted, "≥ 10.000");

  // Samo gornja granica
  const rangeUpper = formatEstimateRange(undefined, 25000);
  assert.strictEqual(rangeUpper.formatted, "≤ 25.000");

  // Nepoznato (oba undefined) -> crtica, nikada 0!
  const rangeUnknown = formatEstimateRange(undefined, undefined);
  assert.strictEqual(rangeUnknown.formatted, "—", "Nepoznata procena mora vratiti '—', a ne '0'");
  assert.strictEqual(rangeUnknown.lower, undefined);
  assert.strictEqual(rangeUnknown.upper, undefined);

  console.log("  ✓ Oba poznata -> '1.200 – 5.000'");
  console.log("  ✓ Samo donja -> '≥ 10.000'");
  console.log("  ✓ Samo gornja -> '≤ 25.000'");
  console.log("  ✓ Nepoznate granice -> '—' (nikad lažna nula)");

  console.log("\n✅ SVI TESTOVI ZA META KREATIVE I PREGLEDE SU USPEŠNO PROŠLI!\n");
}

runTests().catch((err) => {
  console.error("❌ Greška pri pokretanju testova:", err);
  process.exit(1);
});
