/**
 * ============================================================================
 * DOKAZ: događaj bez identifikatora koji Meta uparuje se NE upisuje
 * ============================================================================
 *
 * Pokretanje:
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-capi-identity.ts
 *
 * Bez mreže, bez kopije logike — uvozi PRAVU `hasMatchableIdentity` iz
 * `convex/lib/metaCapi.ts`. To je izvučen uslov iz `recordCapiEvent`: bez bar
 * jednog stvarnog identifikatora (heširani email/telefon, sirova IP, fbc, fbp)
 * događaj se ne upisuje. User-agent NIJE dovoljan — Meta ga ne priznaje kao
 * parametar za uparivanje, pa je to bio uzrok da CAPI odbija baš svaki događaj.
 *
 * Pokriveno:
 *   - samo user agent → ne upisuj (false)
 *   - user agent + IP → upiši (true)
 *   - samo fbc → upiši (true)
 *   - prazno → ne upisuj (false)
 *   - samo email / telefon / fbp → upiši (true)
 */

import { hasMatchableIdentity } from "../convex/lib/metaCapi";

const SHA256 =
  "a".repeat(64); // oblik heša nije bitan za ovaj uslov, samo prisustvo

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

// 1) samo user agent → NE upisuj
check(
  "samo clientUserAgent → false (ne upisuj)",
  hasMatchableIdentity({ clientUserAgent: "Mozilla/5.0 (iPhone)" }) === false,
);

// 2) user agent + IP → upiši
check(
  "clientUserAgent + clientIpAddress → true (upiši)",
  hasMatchableIdentity({
    clientUserAgent: "Mozilla/5.0 (iPhone)",
    clientIpAddress: "203.0.113.7",
  }) === true,
);

// 3) samo fbc → upiši
check(
  "samo fbc → true (upiši)",
  hasMatchableIdentity({ fbc: "fb.1.1700000000.abc123" }) === true,
);

// 4) prazno → NE upisuj
check("prazno {} → false (ne upisuj)", hasMatchableIdentity({}) === false);

// 5) svaki pojedinačni pravi identifikator → upiši
check("samo hashedEmail → true", hasMatchableIdentity({ hashedEmail: SHA256 }) === true);
check("samo hashedPhone → true", hasMatchableIdentity({ hashedPhone: SHA256 }) === true);
check(
  "samo fbp → true",
  hasMatchableIdentity({ fbp: "fb.1.1700000000.9988" }) === true,
);

// 6) prazni/beli-razmak stringovi se ne računaju (trim)
check(
  'clientIpAddress="   " uz user agent → false',
  hasMatchableIdentity({
    clientIpAddress: "   ",
    clientUserAgent: "Mozilla/5.0",
  }) === false,
);

if (failures > 0) {
  console.error(`\n${failures} provera(e) pale.`);
  process.exit(1);
}
console.log("\nSve provere prošle.");
