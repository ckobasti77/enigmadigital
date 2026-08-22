/**
 * ============================================================================
 * DOKAZ: dedup između CAPI (server) i Pixel (browser) preko `eid` parametra
 * ============================================================================
 *
 * Pokretanje:
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-or-eventid.ts
 *
 * Bez mreže, bez kopije logike — uvozi PRAVE funkcije `appendEventId` i
 * `appendUtm` iz `convex/lib/orLink.ts`. `appendEventId` u URL upisuje DOSLOVNO
 * onaj event_id koji je otišao u CAPI; Pixel ga pročita iz `eid` i pošalje isti
 * ključ, pa Meta dva događaja spaja u jedan.
 *
 * Pokriveno:
 *   - undefined eventId → URL nepromenjen (nema server-događaja za dedup)
 *   - postavljen eventId → `eid=<vrednost>` je prisutan
 *   - neispravan URL → vraćen nepromenjen (isto kao appendUtm)
 *   - appendUtm pa appendEventId → utm oznake prežive uz `eid`
 *   - dvostruka primena → `eid` se ne duplira
 */

import { appendEventId, appendUtm } from "../convex/lib/orLink";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

const URL_A = "https://example.com/proizvod?a=1";
const EVENT_ID = "r_x_1_y";

// 1) undefined → nepromenjen
check(
  "appendEventId(u, undefined) === u",
  appendEventId(URL_A, undefined) === URL_A,
);

// 2) postavljen → sadrži eid=<vrednost>
{
  const out = appendEventId(URL_A, EVENT_ID);
  check("appendEventId(u, 'r_x_1_y') sadrži eid=r_x_1_y", out.includes("eid=r_x_1_y"));
  // Vrednost mora biti DOSLOVNO ista koja bi otišla u CAPI.
  check(
    "eid nosi tačno prosleđenu string vrednost",
    new URL(out).searchParams.get("eid") === EVENT_ID,
  );
}

// 3) neispravan URL → nepromenjen
check(
  'appendEventId("nije-url", "x") === "nije-url"',
  appendEventId("nije-url", "x") === "nije-url",
);

// 4) appendUtm pa appendEventId → utm oznake prežive
{
  const withUtm = appendUtm("https://example.com/proizvod", "letnja-akcija");
  const out = appendEventId(withUtm, EVENT_ID);
  const params = new URL(out).searchParams;
  check(
    "utm oznake prežive appendEventId",
    params.get("utm_source") === "instagram" &&
      params.get("utm_medium") === "dm" &&
      params.get("utm_campaign") === "letnja-akcija",
  );
  check("eid dodat pored utm oznaka", params.get("eid") === EVENT_ID);
}

// 5) dvostruka primena → eid se ne duplira
{
  const once = appendEventId(URL_A, EVENT_ID);
  const twice = appendEventId(once, EVENT_ID);
  const count = new URL(twice).searchParams.getAll("eid").length;
  check("eid se ne duplira pri dvostrukoj primeni", count === 1);
  check("dvostruka primena je idempotentna", twice === once);
}

if (failures > 0) {
  console.error(`\n${failures} provera(e) pale.`);
  process.exit(1);
}
console.log("\nSve provere prošle.");
