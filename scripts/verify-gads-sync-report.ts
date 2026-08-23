/**
 * ============================================================================
 * DOKAZ I VERIFIKACIJA: Google Ads Izveštavanje Sinhronizacije i Valuta (A1–A5)
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-sync-report.ts
 *   ili: npm run verify:gads-sync-report
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 *
 * Sadrži:
 *   DEO A — V8 / Node Runtime Izolacija:
 *     - convex/lib/googleAdsShared.ts je V8 čist (nema "use node")
 *     - convex/googleAdsStore.ts je V8 čist
 *     - Nijedan V8 fajl ne uvozi fajlove sa "use node"
 *
 *   DEO B — A1: Nepoznata valuta nije EUR:
 *     - Nema hardkodovane podrazumevane valute EUR u sync kodu
 *     - Nalog sa nepoznatom valutom se NE upisuje u adAccounts
 *     - Sinhronizacija prijavljuje nedostatak valute
 *
 *   DEO C — A2 & A4: Ishod svakog resursa i 0 redova vs neuspeh:
 *     - 0 redova je uspešan upit (ok: true, rows: 0)
 *     - Pao upit je neuspešan (ok: false, reason: "<sanitizovano>")
 *     - Greške se sanitizuju (nema curenja tokena/kredencijala)
 *
 *   DEO D — A3: Klasifikacija statusa sinhronizacije:
 *     - Svi upiti prošli + poznata valuta -> "Uspešno"
 *     - Deo upita pao -> "Delimično" sa tačnim spiskom i brojem palih resursa
 *     - Svi upiti pali -> "Delimično" (razlikuje se od praznog naloga!)
 *     - Nepoznata valuta -> "Delimično"
 * ============================================================================
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  executeGaqlResource,
  summarizeGoogleAdsSync,
  type GoogleAdsResourceOutcome,
  type GoogleAdsSyncSummary,
} from "../convex/lib/googleAdsShared";

let failures = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failures++;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DEO A — PROVERA V8 / NODE RUNTIME IZOLACIJE
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO A — PROVERA V8 / NODE RUNTIME IZOLACIJE ════════");

function hasUseNodeDirective(content: string): boolean {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "")
    .trim();
  return /^["']use node["']\s*;?/.test(stripped);
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "_generated" || entry.name === "node_modules") continue;
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

function resolveImportPath(importingFilePath: string, importSpecifier: string): string | null {
  if (!importSpecifier.startsWith(".")) {
    return null;
  }
  const dir = path.dirname(importingFilePath);
  const directPath = path.resolve(dir, importSpecifier);

  const candidates = [
    directPath,
    `${directPath}.ts`,
    `${directPath}.tsx`,
    path.join(directPath, "index.ts"),
    path.join(directPath, "index.tsx"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

const convexDir = path.resolve(process.cwd(), "convex");
const allConvexFiles = getAllTsFiles(convexDir);

const nodeFiles = new Set<string>();
const v8Files = new Set<string>();

for (const file of allConvexFiles) {
  const content = fs.readFileSync(file, "utf-8");
  if (hasUseNodeDirective(content)) {
    nodeFiles.add(file);
  } else {
    v8Files.add(file);
  }
}

// 1. Proveri da je googleAdsShared.ts V8 kompatibilan
const sharedPath = path.join(convexDir, "lib", "googleAdsShared.ts");
const sharedContent = fs.readFileSync(sharedPath, "utf-8");
check(
  "convex/lib/googleAdsShared.ts nema 'use node' direktivu (V8 čist)",
  !hasUseNodeDirective(sharedContent),
);

// 2. Proveri da je googleAdsStore.ts V8 kompatibilan
const storePath = path.join(convexDir, "googleAdsStore.ts");
const storeContent = fs.readFileSync(storePath, "utf-8");
check(
  "convex/googleAdsStore.ts nema 'use node' direktivu (V8 čist)",
  !hasUseNodeDirective(storeContent),
);

// 3. Proveri da nijedan V8 fajl ne uvozi fajl sa "use node"
let importViolations = 0;
const importRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?["'](\.[^"']+)["']/g;

for (const v8File of v8Files) {
  const content = fs.readFileSync(v8File, "utf-8");
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    const importSpecifier = match[1];
    const resolvedTarget = resolveImportPath(v8File, importSpecifier);

    if (resolvedTarget && nodeFiles.has(resolvedTarget)) {
      console.error(
        `  ✗ KRŠENJE V8/NODE IZOLACIJE: V8 fajl ${path.relative(process.cwd(), v8File)} uvozi Node fajl ${path.relative(process.cwd(), resolvedTarget)}`,
      );
      importViolations++;
      failures++;
    }
  }
}

check("Nijedan V8 fajl ne uvozi modul koji ima 'use node'", importViolations === 0);

// ════════════════════════════════════════════════════════════════════════════
// DEO B — A1: NEPOZNATA VALUTA NIJE EUR
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO B — A1: NEPOZNATA VALUTA NIJE EUR ════════");

// 1. Proveri da googleAds.ts nema podrazumevanu valutu EUR
const googleAdsTsPath = path.join(convexDir, "googleAds.ts");
const googleAdsTsContent = fs.readFileSync(googleAdsTsPath, "utf-8");

const hasDefaultEurVar = /let\s+currencyCode\s*=\s*["']EUR["']/.test(googleAdsTsContent);
check("convex/googleAds.ts nema 'let currencyCode = \"EUR\"'", !hasDefaultEurVar);

const hasInitialUndefinedCurrency = /let\s+currencyCode:\s*string\s*\|\s*undefined\s*=\s*undefined/.test(
  googleAdsTsContent,
);
check(
  "convex/googleAds.ts inicijalizuje currencyCode na undefined",
  hasInitialUndefinedCurrency,
);

// 2. Proveri da upsertGoogleAdsData u googleAdsStore.ts prima opcioni account i preskače upis kad nema valute
const hasOptionalAccount = /account:\s*v\.optional\(\s*v\.object\(\{[\s\S]*?currency:\s*v\.string\(\)/.test(
  storeContent,
);
check(
  "convex/googleAdsStore.ts upsertGoogleAdsData validator ima opcioni account",
  hasOptionalAccount,
);

const skipsAccountWithoutCurrency = /if\s*\(account\s*&&\s*account\.currency\s*&&\s*account\.currency\.trim\(\)\s*!==\s*["']["']\)/.test(
  storeContent,
);
check(
  "convex/googleAdsStore.ts preskače upis adAccounts ako account nema validnu valutu",
  skipsAccountWithoutCurrency,
);

// 3. Proveri da summarizeGoogleAdsSync prijavljuje nepoznatu valutu
const summaryNoCurrency = summarizeGoogleAdsSync({
  outcomes: [{ resource: "campaign", ok: true, rows: 5 }],
  itemsWritten: 5,
  currencyKnown: false,
});
check(
  "summarizeGoogleAdsSync bez poznate valute vraća status 'Delimično'",
  summaryNoCurrency.status === "Delimično",
);
check(
  "summarizeGoogleAdsSync bez poznate valute navodi nedostatak valute u napomeni",
  Boolean(summaryNoCurrency.note?.includes("nalog nema poznatu valutu")),
);

// ════════════════════════════════════════════════════════════════════════════
// DEO C — A2 & A4: ISHOD SVAKOG RESURSA I 0 REDOVA VS NEUSPEH
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO C — A2 & A4: ISHOD RESURSA I 0 REDOVA VS NEUSPEH ════════");

// 1. Upit koji vrati 0 redova je ok: true, rows: 0 (A4)
{
  const outcomes: GoogleAdsResourceOutcome[] = [];
  const result = await executeGaqlResource("search_term_view", outcomes, async () => {
    return []; // 0 rows
  });

  check("executeGaqlResource vraća prazan niz za 0 redova", Array.isArray(result) && result.length === 0);
  check("executeGaqlResource beleži ishod za 0 redova", outcomes.length === 1);
  check(
    "executeGaqlResource za 0 redova ima ok: true i rows: 0",
    outcomes[0].ok === true && outcomes[0].rows === 0 && outcomes[0].resource === "search_term_view",
  );
}

// 2. Upit koji vrati N redova
{
  const outcomes: GoogleAdsResourceOutcome[] = [];
  const mockRows = [{ campaign: { id: "1" } }, { campaign: { id: "2" } }, { campaign: { id: "3" } }];
  const result = await executeGaqlResource("campaign", outcomes, async () => {
    return mockRows;
  });

  check("executeGaqlResource vraća dobijene redove", result.length === 3);
  check(
    "executeGaqlResource beleži ishod sa rows: 3",
    outcomes.length === 1 && outcomes[0].ok === true && outcomes[0].rows === 3,
  );
}

// 3. Upit koji baci grešku -> ok: false, reason sanitizovan, ne baca izuzetak
{
  const outcomes: GoogleAdsResourceOutcome[] = [];
  const sensitiveToken = "ya29.a0AfH6SMD_SECRET_BEARER_TOKEN_123456";
  const result = await executeGaqlResource("ad_group_ad", outcomes, async () => {
    throw new Error(`Google Ads API error 403: Authorization failed with token ${sensitiveToken}`);
  });

  check("executeGaqlResource na grešci vraća [] (ne ruši sinhronizaciju)", Array.isArray(result) && result.length === 0);
  check("executeGaqlResource beleži ishod sa ok: false", outcomes.length === 1 && outcomes[0].ok === false);
  if (!outcomes[0].ok) {
    check(
      "Razlog greške ne sadrži osetljive tokene/kredencijale",
      !outcomes[0].reason.includes(sensitiveToken) && !outcomes[0].reason.includes("SECRET"),
    );
    check(
      "Razlog greške je sanitizovan i informativan",
      outcomes[0].reason.length > 0 && outcomes[0].reason.includes("Authorization failed"),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// DEO D — A3: KLASIFIKACIJA STATUSA SINHRONIZACIJE
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO D — A3: KLASIFIKACIJA STATUSA SINHRONIZACIJE ════════");

// 1. Svi upiti uspešni (22 upita) + poznata valuta -> "Uspešno"
{
  const resources = [
    "conversion_action", "customer_client", "campaign_budget", "campaign_search_impression_share",
    "campaign", "ad_group", "campaign_criterion", "ad_group_ad", "keyword_view",
    "search_term_view", "shared_set", "shared_criterion", "campaign_shared_set",
    "geographic_view", "user_location_view", "campaign_device", "campaign_hourly",
    "age_range_view", "gender_view", "asset", "ad_group_ad_asset_view",
    "ad_group_ad_asset_combination_view",
  ];

  const outcomes: GoogleAdsResourceOutcome[] = resources.map((res) => ({
    resource: res,
    ok: true,
    rows: res === "search_term_view" ? 0 : 5, // Neki imaju 0 redova
  }));

  const summary = summarizeGoogleAdsSync({
    outcomes,
    itemsWritten: 105,
    currencyKnown: true,
  });

  check("Svi uspešni upiti daju status 'Uspešno'", summary.status === "Uspešno");
  check("Uspešna sinhronizacija nema napomenu o greškama", summary.note === undefined);
  check("Ukupan broj uspešnih je 22", summary.succeededQueries === 22);
  check("Ukupan broj neuspešnih je 0", summary.failedQueries === 0);
}

// 2. Deo upita pao (npr. 2 od 22) -> "Delimično" sa tačnim spiskom
{
  const outcomes: GoogleAdsResourceOutcome[] = [
    { resource: "campaign", ok: true, rows: 10 },
    { resource: "ad_group", ok: true, rows: 25 },
    { resource: "search_term_view", ok: false, reason: "GAQL syntax error" },
    { resource: "age_range_view", ok: false, reason: "Permission denied for demographic view" },
  ];

  const summary = summarizeGoogleAdsSync({
    outcomes,
    itemsWritten: 35,
    currencyKnown: true,
  });

  check("Sinhronizacija sa palim upitima NIJE 'Uspešno' već 'Delimično'", summary.status === "Delimično");
  check("Broj neuspešnih upita je 2", summary.failedQueries === 2);
  check("Broj uspešnih upita je 2", summary.succeededQueries === 2);
  check(
    "Napomena sadrži tačan broj i spisak palih resursa",
    summary.note !== undefined &&
      summary.note.startsWith("Delimično: 2/4 neuspelih upita (search_term_view, age_range_view)"),
  );
}

// 3. Svih 22 upita palo -> "Delimično: 22/22 neuspelih upita" (Korisnik jasno vidi da nalog nije samo prazan)
{
  const outcomes: GoogleAdsResourceOutcome[] = [
    { resource: "campaign", ok: false, reason: "Quota exceeded" },
    { resource: "ad_group", ok: false, reason: "Quota exceeded" },
  ];

  const summary = summarizeGoogleAdsSync({
    outcomes,
    itemsWritten: 0,
    currencyKnown: false,
  });

  check("Svi pali upiti daju status 'Delimično'", summary.status === "Delimično");
  check(
    "Napomena jasno govori o neuspelim upitima i nepoznatoj valuti",
    Boolean(
      summary.note?.includes("2/2 neuspelih upita") &&
        summary.note?.includes("nalog nema poznatu valutu"),
    ),
  );
}

// ════════════════════════════════════════════════════════════════════════════
// DEO E — PROVERA TVRDIH PRAVILA
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO E — PROVERA TVRDIH PRAVILA ════════");

// 1. Proveri da Meta fajlovi nisu menjani sa Google Ads uvozima
const metaFiles = allConvexFiles.filter((f) => path.basename(f).startsWith("meta"));
let metaViolations = 0;
for (const mf of metaFiles) {
  const content = fs.readFileSync(mf, "utf-8");
  if (content.includes("googleAdsShared") || content.includes("googleAdsApi")) {
    console.error(`  ✗ Meta fajl ${path.relative(process.cwd(), mf)} uvozi Google Ads module`);
    metaViolations++;
    failures++;
  }
}
check("Meta fajlovi nisu dirani niti uvoze Google Ads module", metaViolations === 0);

// 2. Proveri da nema dupliranih indeksa u schema.ts
const schemaPath = path.join(convexDir, "schema.ts");
const schemaContent = fs.readFileSync(schemaPath, "utf-8");

// Jednostavna provera indeksa po tabelama
const tableBlocks = schemaContent.split(/defineTable\s*\(/);
let duplicateIndexes = 0;

for (const block of tableBlocks.slice(1)) {
  const indexMatches = Array.from(block.matchAll(/\.index\s*\(\s*["']([^"']+)["']\s*,\s*\[([^\]]+)\]/g));
  const seenFields = new Set<string>();

  for (const m of indexMatches) {
    const fieldsKey = m[2].replace(/\s+/g, "");
    if (seenFields.has(fieldsKey)) {
      console.error(`  ✗ Duplikat polja u indeksu tabele: polja [${fieldsKey}]`);
      duplicateIndexes++;
      failures++;
    }
    seenFields.add(fieldsKey);
  }
}

check("Nijedna tabela u schema.ts nema dva indeksa sa istim poljima", duplicateIndexes === 0);

// ════════════════════════════════════════════════════════════════════════════
// ZAVRŠETAK
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ REZULTAT VERIFIKACIJE ════════");
if (failures === 0) {
  console.log("✓ SVI TESTOVI SU USPEŠNO PROŠLI (0 grešaka).\n");
  process.exit(0);
} else {
  console.error(`✗ VERIFIKACIJA NIJE USPELA: ${failures} test(ova) je palo.\n`);
  process.exit(1);
}
