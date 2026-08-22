/**
 * ============================================================================
 * DOKAZ: System User token prolazi kroz Meta putanje bez tihih kvarova
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/test-meta-token.ts
 *   (ili: npm run verify:meta-token)
 *
 * Zašto postoji: prebacivanje aplikacije sa ličnog Facebook tokena (ističe za
 * 60 dana) na neistekući System User token ima tri tihe zamke — token bez roka
 * koji se prikaže kao „istekao", nehotičan poziv `fb_exchange_token` /
 * `/me/accounts` nad system userom, i prepisivanje @handle-a imenom system
 * usera. Nijedna se ne vidi na localhostu; sve tri obaraju ovaj dokaz.
 *
 * Čisto, bez mreže i bez ijednog tokena u tekstu. Import ide na iste čiste
 * funkcije koje kod zaista koristi — ne na kopiju logike.
 */

import {
  buildPageAccessTokenUrl,
  tokenExpiryMsFromDebug,
} from "../convex/lib/facebookApi";
import {
  describeTokenExpiry,
  TOKEN_NEVER_EXPIRES_TEXT,
} from "../lib/token-expiry";

const problems: string[] = [];
function check(label: string, cond: boolean): void {
  if (!cond) problems.push(label);
}

// ── 1. Token bez isteka → „ne ističe", NIKAD „istekao" ───────────────────────

// debug_token nad System User Page tokenom vraća expires_at=0 i bez
// data-access prozora → nema roka.
check(
  "tokenExpiryMsFromDebug(0,0) mora biti undefined (ne ističe)",
  tokenExpiryMsFromDebug(0, 0) === undefined,
);
check(
  "tokenExpiryMsFromDebug(undefined,undefined) mora biti undefined",
  tokenExpiryMsFromDebug(undefined, undefined) === undefined,
);
// Dugoživeći Page token (expires_at=0) i dalje broji do data-access prozora.
check(
  "tokenExpiryMsFromDebug(0, 1000) mora pasti na data_access (1000s → ms)",
  tokenExpiryMsFromDebug(0, 1000) === 1_000_000,
);

const now = 1_700_000_000_000;
const never = describeTokenExpiry(null, now);
check("expiresAt=null → kind 'never'", never.kind === "never");
check(
  "expiresAt=undefined → kind 'never'",
  describeTokenExpiry(undefined, now).kind === "never",
);
// Odsustvo roka NE SME da se čita kao istek.
check("kind za null nikad nije 'expiring'", never.kind !== "expiring");
const neverText = never.neverText ?? "";
check("'never' nosi tekst", neverText.length > 0 && neverText === TOKEN_NEVER_EXPIRES_TEXT);
check(
  "tekst za 'never' ne sadrži reč „istekao”/„isteklo”",
  !/istekl?o|istekao/i.test(neverText),
);
// Realan datum daleko u budućnosti = važeći; blizu = upozorenje.
check(
  "rok za 40 dana → 'valid'",
  describeTokenExpiry(now + 40 * 864e5, now).kind === "valid",
);
check(
  "rok za 3 dana → 'expiring'",
  describeTokenExpiry(now + 3 * 864e5, now).kind === "expiring",
);
// Sat još nije otkucao: ne znamo → nikad „expiring".
check(
  "now=null (sat nije otkucao) → nikad 'expiring'",
  describeTokenExpiry(now + 3 * 864e5, null).kind !== "expiring",
);

// ── 2. fb_exchange_token / /me/accounts se NE pozivaju za system user token ──

const mintUrl = buildPageAccessTokenUrl("1234567890", "SYSTEM_USER_TOKEN");
check("mint URL cilja na /{pageId}", mintUrl.includes("/1234567890"));
check("mint URL traži fields=access_token", /fields=access_token/.test(mintUrl));
check(
  "mint URL NE poziva fb_exchange_token",
  !mintUrl.includes("fb_exchange_token"),
);
check("mint URL NE poziva /me/accounts", !/\/me\/accounts/.test(mintUrl));
check("mint URL NE poziva /me/", !/graph\.facebook\.com\/[^/]+\/me\b/.test(mintUrl));

// ── 3. accountHandle se ne prepisuje imenom system usera ─────────────────────
//
// meta_ig ostaje na Instagram Login-u (odluka), pa se `saveAccountHandle` i
// njegov izvor (`/me.username`) ne diraju. System-user meta_fb putanja ne piše
// nikakav handle: dokaz je da mint URL uopšte ne traži `username`, i da meta_fb
// atribucija ne zavisi od `accountHandle` (koristi `from.id`). Provera hvata
// regresiju u kojoj bi neko dodao `username` u mint fields.
check(
  "mint URL ne traži 'username' (ne kuje handle iz system usera)",
  !/username/.test(mintUrl),
);

// ── izveštaj ─────────────────────────────────────────────────────────────────

if (problems.length > 0) {
  console.error("✗ test-meta-token: provere nisu prošle:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log("✓ test-meta-token: sve provere prošle (Z1 rok, Z2/fb_exchange, Z3 handle).");
