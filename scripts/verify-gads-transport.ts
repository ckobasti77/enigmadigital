/**
 * ============================================================================
 * DOKAZ: Ispravnost Google Ads API transportnog sloja i brojanja kvote
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-transport.ts
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 * ============================================================================
 */

import {
  buildGoogleAdsHeaders,
  buildSearchStreamUrl,
  getGoogleAdsApiVersion,
  microsToUnits,
  normalizeCustomerId,
  unitsToMicros,
  DEFAULT_GOOGLE_ADS_API_VERSION,
} from "../convex/lib/googleAdsApi";
import {
  calculateOperationCost,
  calculateRollingQuota,
  checkGoogleAdsQuota,
  getGoogleAdsDailyLimit,
  ACCESS_LEVEL_LIMITS,
  ROLLING_WINDOW_MS,
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

console.log("1. Provera konverzije novčanih jedinica (microsToUnits / unitsToMicros)");

// microsToUnits
check("microsToUnits(undefined) === undefined", microsToUnits(undefined) === undefined);
check("microsToUnits(null) === undefined", microsToUnits(null) === undefined);
check("microsToUnits(0) === 0 (prava nula preživljava)", microsToUnits(0) === 0);
check("microsToUnits('2500000') === 2.5", microsToUnits("2500000") === 2.5);
check("microsToUnits(2500000) === 2.5", microsToUnits(2500000) === 2.5);
check("microsToUnits('') === undefined", microsToUnits("") === undefined);
check("microsToUnits('   ') === undefined", microsToUnits("   ") === undefined);
check("microsToUnits('abc') === undefined", microsToUnits("abc") === undefined);

// unitsToMicros
check("unitsToMicros(undefined) === undefined", unitsToMicros(undefined) === undefined);
check("unitsToMicros(null) === undefined", unitsToMicros(null) === undefined);
check("unitsToMicros(0) === 0", unitsToMicros(0) === 0);
check("unitsToMicros(2.5) === 2500000", unitsToMicros(2.5) === 2500000);
check("unitsToMicros(12.345678) === 12345678 (eksplicitno zaokruživanje)", unitsToMicros(12.345678) === 12345678);

console.log("\n2. Provera normalizacije Customer ID-ja i građenja URL-ova/zaglavlja");

// normalizeCustomerId
const normalizedFromDashes = normalizeCustomerId("123-456-7890");
const normalizedDirect = normalizeCustomerId("1234567890");
check(
  "normalizeCustomerId sa crticama i bez njih daje isto ('1234567890')",
  normalizedFromDashes === "1234567890" && normalizedDirect === "1234567890",
);

let threwFor9 = false;
try {
  normalizeCustomerId("123456789"); // 9 digits
} catch {
  threwFor9 = true;
}
check("normalizeCustomerId baca grešku za 9 cifara", threwFor9);

let threwForLetters = false;
try {
  normalizeCustomerId("123-456-789A"); // contains letter
} catch {
  threwForLetters = true;
}
check("normalizeCustomerId baca grešku za slova", threwForLetters);

let threwFor11 = false;
try {
  normalizeCustomerId("12345678901"); // 11 digits
} catch {
  threwFor11 = true;
}
check("normalizeCustomerId baca grešku za 11 cifara", threwFor11);

// buildSearchStreamUrl
const url = buildSearchStreamUrl("123-456-7890", "v25");
check(
  "buildSearchStreamUrl gradi tačan REST endpoint",
  url === "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:searchStream",
);
check(
  "DEFAULT_GOOGLE_ADS_API_VERSION je 'v25'",
  DEFAULT_GOOGLE_ADS_API_VERSION === "v25" && getGoogleAdsApiVersion() === "v25",
);

// buildGoogleAdsHeaders
const headers = buildGoogleAdsHeaders({
  developerToken: "test-dev-tok",
  accessToken: "test-acc-tok",
  loginCustomerId: "987-654-3210",
});
check("buildGoogleAdsHeaders postavlja Content-Type", headers["Content-Type"] === "application/json");
check("buildGoogleAdsHeaders postavlja Authorization Bearer", headers["Authorization"] === "Bearer test-acc-tok");
check("buildGoogleAdsHeaders postavlja developer-token", headers["developer-token"] === "test-dev-tok");
check("buildGoogleAdsHeaders normalizuje login-customer-id", headers["login-customer-id"] === "9876543210");

const headersNoLogin = buildGoogleAdsHeaders({
  developerToken: "test-dev-tok",
  accessToken: "test-acc-tok",
});
check("buildGoogleAdsHeaders izostavlja login-customer-id kad nije prosleđen", headersNoLogin["login-customer-id"] === undefined);

console.log("\n3. Provera kvote, nivoa pristupa i brojanja operacija");

// calculateOperationCost
check("brojač kvote: prvi poziv (searchStream) = 1 operacija", calculateOperationCost({ isSearchStream: true }) === 1);
check("brojač kvote: prvi poziv (običan search bez tokena) = 1 operacija", calculateOperationCost({ isSearchStream: false, nextPageToken: undefined }) === 1);
check(
  "brojač kvote: nastavak sa validnim next_page_token = 0 operacija",
  calculateOperationCost({ isSearchStream: false, nextPageToken: "token_abc123" }) === 0,
);
check(
  "brojač kvote: prazan next_page_token se tretira kao novi poziv (+1)",
  calculateOperationCost({ isSearchStream: false, nextPageToken: "" }) === 1,
);

// Access levels and fallback
check(
  "explorer nivo daje 2880 plafon",
  getGoogleAdsDailyLimit("explorer").dailyLimit === 2880,
);
check(
  "basic nivo daje 15000 plafon",
  getGoogleAdsDailyLimit("basic").dailyLimit === 15000,
);
check(
  "standard nivo daje 100000 plafon",
  getGoogleAdsDailyLimit("standard").dailyLimit === 100000,
);
check(
  "nepoznat GOOGLE_ADS_ACCESS_LEVEL ('nepoznato') daje najniži plafon (explorer = 2880)",
  getGoogleAdsDailyLimit("nepoznato").dailyLimit === ACCESS_LEVEL_LIMITS.explorer &&
    getGoogleAdsDailyLimit("nepoznato").level === "explorer",
);
check(
  "nedefinisan GOOGLE_ADS_ACCESS_LEVEL (undefined) daje najniži plafon (explorer = 2880)",
  getGoogleAdsDailyLimit(undefined).dailyLimit === ACCESS_LEVEL_LIMITS.explorer,
);

console.log("\n4. Provera klizećeg 24-časovnog prozora i pre-flight kapije");

const now = 1700000000000;
const entries = [
  { timestamp: now - ROLLING_WINDOW_MS - 1000, count: 500 }, // starije od 24h -> otpada
  { timestamp: now - 12 * 60 * 60 * 1000, count: 100 },      // pre 12h -> važi
  { timestamp: now - 1 * 60 * 60 * 1000, count: 50 },        // pre 1h -> važi
];

const rolling = calculateRollingQuota(entries, 2880, now);
check(
  "klizeći prozor odbacuje pozive starije od 24h (potrošeno 150 od 2880)",
  rolling.consumed24h === 150 && rolling.remaining24h === 2730,
);
check("stanje za nisku potrošnju je 'ok'", rolling.state === "ok");

// Pre-flight quota check: available
const checkPass = checkGoogleAdsQuota(150, 2880, 5);
check("checkGoogleAdsQuota kad ima dovoljno kvote vraća skipped: false", checkPass.skipped === false);

// Pre-flight quota check: exhausted / hard stop (>95%)
const checkExhausted = checkGoogleAdsQuota(2800, 2880, 5); // 2800/2880 = 97.2% > 95%
check(
  "checkGoogleAdsQuota pri visokoj potrošnji vraća skipped: true sa razlogom",
  checkExhausted.skipped === true && typeof checkExhausted.reason === "string",
);
check("tip povratne vrednosti sadrži state: 'stop'", checkExhausted.state === "stop");

if (failures > 0) {
  console.error(`\n${failures} provera(e) pale.`);
  process.exit(1);
}

console.log("\nSve provere za Google Ads transport i kvotu su uspešno prošle.");
