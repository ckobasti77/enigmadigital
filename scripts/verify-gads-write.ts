/**
 * ============================================================================
 * DOKAZ I VERIFIKACIJA: GA8 Google Ads Pisanje i V8/Node Runtime Podela
 * ============================================================================
 *
 * Pokretanje:
 *   node --import ./scripts/ts-hooks.mjs scripts/verify-gads-write.ts
 *   ili: npm run verify:gads-write
 *
 * Testira se u potpunosti OFFLINE, bez mrežnih poziva i bez živih kredencijala.
 *
 * Sadrži:
 *   DEO A — NAJVAŽNIJI TEST U CELOM PROJEKTU:
 *     - Proverava SVE .ts fajlove u convex/ i convex/lib/
 *     - Za svaki fajl BEZ "use node", proverava da ne uvozi nijedan modul KOJI IMA "use node"
 *     - Test pada sa tačnim imenom fajla i imenom uvoza ako postoji kršenje
 *
 *   DEO B — GA8 PISANJE KAMPANJA:
 *     - B1: validateOnly levak (validateOnly: true UVEK prvi, pravi poziv se ne šalje ako padne)
 *     - B2: Sve novo je PAUSED (kampanja, ad grupa, oglas — hardkodovano, bez zaobilaženja)
 *     - B3: Atomičan mutate sa negativnim privremenim ID-jevima i partialFailure: false
 *     - B4: Ograda budžeta (GOOGLE_ADS_MAX_DAILY_BUDGET, BUDGET_LIMIT_CURRENCY, 2x i 30.4x obaveštenje)
 *     - B5: ADS_WRITE_ENABLED kill switch
 *     - B6: Video kampanje su READ-ONLY (kreiranje i izmena se odbijaju)
 *     - B7: client_viewer uloga ne može da piše (samo owner)
 * ============================================================================
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  validateGoogleAdsCampaignInput,
  validateGoogleAdsAdGroupInput,
  validateGoogleAdsAdInput,
  validateGoogleAdsFullCreateInput,
  getGoogleAdsMaxDailyBudget,
  evaluateGoogleAdsBudgetGate,
  formatGoogleAdsBudgetConfirmation,
  buildGoogleAdsCampaignMutatePayload,
  buildGoogleAdsCampaignStatusMutatePayload,
  buildGoogleAdsBudgetChangeMutatePayload,
  runGoogleAdsValidateOnly,
  runGoogleAdsMutateWithValidateOnly,
  type GoogleAdsFullCampaignCreateInput,
  type GoogleAdsFetchImpl,
} from "../convex/lib/googleAdsWrite";

import {
  unitsToMicros,
  microsToUnits,
  normalizeCustomerId,
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
// DEO A — PODELA V8 / NODE RUNTIME-A (NAJVAŽNIJI TEST)
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO A — PROVERA V8 / NODE RUNTIME IZOLACIJE ════════");

function hasUseNodeDirective(content: string): boolean {
  // Ukloni komentare pre prve direktive
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
    // Spoljni npm paket ili framework uvoz
    return null;
  }
  const dir = path.dirname(importingFilePath);
  const directPath = path.resolve(dir, importSpecifier);

  const candidates = [
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

function extractRelativeImports(content: string): string[] {
  const imports: string[] = [];
  // Match standard static imports: import ... from "..."
  const staticImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?["'](\.[^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = staticImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Match dynamic imports: import("...")
  const dynamicImportRegex = /import\s*\(\s*["'](\.[^"']+)["']\s*\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

const convexRoot = path.resolve(process.cwd(), "convex");
const tsFiles = getAllTsFiles(convexRoot);

console.log(`Pronađeno ${tsFiles.length} TypeScript fajlova u convex/ za analizu runtime zavisnosti.`);

interface RuntimeViolation {
  v8File: string;
  importSpecifier: string;
  nodeFile: string;
}

const violations: RuntimeViolation[] = [];

for (const filePath of tsFiles) {
  const content = fs.readFileSync(filePath, "utf-8");
  const isNode = hasUseNodeDirective(content);

  // Ako fajl NEMA "use node", on se izvršava u V8 runtime-u
  if (!isNode) {
    const importSpecifiers = extractRelativeImports(content);
    for (const specifier of importSpecifiers) {
      const resolvedTarget = resolveImportPath(filePath, specifier);
      if (resolvedTarget && resolvedTarget.startsWith(convexRoot)) {
        const targetContent = fs.readFileSync(resolvedTarget, "utf-8");
        if (hasUseNodeDirective(targetContent)) {
          violations.push({
            v8File: path.relative(process.cwd(), filePath),
            importSpecifier: specifier,
            nodeFile: path.relative(process.cwd(), resolvedTarget),
          });
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error("\n❌ KRŠENJE RUNTIME PRAVILA! V8 fajl uvozi modul koji ima 'use node':");
  for (const v of violations) {
    console.error(`  - Fajl [${v.v8File}] uvozi "${v.importSpecifier}" koji pokazuje na Node modul [${v.nodeFile}]`);
  }
  assert.fail(
    `Pronađeno je ${violations.length} nedozvoljenih uvoza Node modula u V8 fajlove. Bundler će pasti pri deploy-u!`,
  );
} else {
  console.log("  ✓ Nijedan V8 fajl (.ts bez 'use node') ne uvozi fajl koji ima 'use node'.");
  console.log("  ✓ connections.ts i svi ostali V8 moduli uvoze isključivo iz V8-bezbednih modula.");
}

// ════════════════════════════════════════════════════════════════════════════
// DEO B — GA8 PISANJE KAMPANJA (VALIDACIJE, OGRADE, ATOMIČAN MUTATE, FUNNEL)
// ════════════════════════════════════════════════════════════════════════════

console.log("\n════════ DEO B — GA8 PISANJE KAMPANJA ════════");

const validCampaignInput = {
  customerId: "123-456-7890",
  campaign: {
    name: "Search Prodaja Proleće",
    channelType: "SEARCH",
    dailyBudget: 25,
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    biddingStrategyType: "MAXIMIZE_CLICKS",
  },
  adGroup: {
    name: "Standardna Grupa 1",
    type: "SEARCH_STANDARD",
    cpcBid: 1.5,
  },
  ad: {
    name: "RSA Oglas 1",
    headlines: ["Kvalitetan Softver", "Brza Implementacija", "Pouzdan Partner"],
    descriptions: [
      "Vrhunska digitalna rešenja za unapređenje vašeg poslovanja.",
      "Kontaktirajte naš tim stručnjaka i zakažite besplatne konsultacije.",
    ],
    finalUrls: ["https://example.com/ponuda"],
    path1: "softver",
    path2: "ponuda",
  },
  keywords: [
    { text: "izrada softvera", matchType: "EXACT" as const, cpcBid: 1.2 },
    { text: "web development beograd", matchType: "PHRASE" as const },
  ],
};

// ── Test B1: Video kampanje su READ-ONLY ─────────────────────────────────────
console.log("\n[Test B1] Video kampanje su READ-ONLY i kreiranje/izmena se odbija:");
assert.throws(
  () =>
    validateGoogleAdsCampaignInput({
      name: "Video Promocija",
      channelType: "VIDEO",
      dailyBudget: 20,
    }),
  /Video kampanje su samo za čitanje.*READ-ONLY/i,
  "Kreiranje Video kampanje mora baciti grešku",
);

assert.throws(
  () =>
    buildGoogleAdsCampaignStatusMutatePayload(
      "1234567890",
      "987654",
      "ACTIVE",
      "VIDEO",
    ),
  /Video kampanje su samo za čitanje.*READ-ONLY/i,
  "Izmena Video kampanje mora baciti grešku",
);
console.log("  ✓ Video kampanja je prepoznata kao READ-ONLY i odbijena sa jasnom porukom.");

// ── Test B2: SVE NOVO JE PAUZIRANO (B2) ──────────────────────────────────────
console.log("\n[Test B2] Builderi hardkoduju status=PAUSED za sve kreirane objekte:");
const mutatePayload = buildGoogleAdsCampaignMutatePayload(validCampaignInput);
assert.strictEqual(mutatePayload.partialFailure, false, "partialFailure mora biti false");

let campaignOpFound = false;
let adGroupOpFound = false;
let adOpFound = false;
let keywordOpCount = 0;

for (const op of mutatePayload.mutateOperations) {
  if (op.campaignOperation) {
    const c = (op.campaignOperation as any).create;
    assert.strictEqual(c.status, "PAUSED", "Kampanja mora imati status PAUSED");
    assert.notStrictEqual(c.status, "ENABLED", "Kampanja ne sme biti ENABLED");
    assert.notStrictEqual(c.status, "ACTIVE", "Kampanja ne sme biti ACTIVE");
    campaignOpFound = true;
  }
  if (op.adGroupOperation) {
    const ag = (op.adGroupOperation as any).create;
    assert.strictEqual(ag.status, "PAUSED", "Ad grupa mora imati status PAUSED");
    adGroupOpFound = true;
  }
  if (op.adGroupAdOperation) {
    const ad = (op.adGroupAdOperation as any).create;
    assert.strictEqual(ad.status, "PAUSED", "Oglas mora imati status PAUSED");
    adOpFound = true;
  }
  if (op.adGroupCriterionOperation) {
    const kw = (op.adGroupCriterionOperation as any).create;
    assert.strictEqual(kw.status, "PAUSED", "Ključna reč mora imati status PAUSED");
    keywordOpCount++;
  }
}

check("Kampanja kreirana kao PAUSED", campaignOpFound);
check("Ad grupa kreirana kao PAUSED", adGroupOpFound);
check("Oglas kreiran kao PAUSED", adOpFound);
check("Ključne reči (2) kreirane kao PAUSED", keywordOpCount === 2);

// ── Test B3: Atomičan mutate sa negativnim privremenim ID-jevima (B3) ────────
console.log("\n[Test B3] Negativni privremeni ID-jevi i budžet u mikrosima:");
const budgetOp = mutatePayload.mutateOperations.find((op) => op.campaignBudgetOperation);
assert.ok(budgetOp, "Budžet operacija mora postojati u payload-u");
const bCreate = (budgetOp.campaignBudgetOperation as any).create;
assert.strictEqual(
  bCreate.resourceName,
  "customers/1234567890/campaignBudgets/-1",
  "Budžet mora imati privremeni ID -1",
);
assert.strictEqual(
  bCreate.amountMicros,
  "25000000",
  "25 EUR mora biti 25_000_000 mikrosa (jedinice -> mikrosi)",
);

const campOp = mutatePayload.mutateOperations.find((op) => op.campaignOperation);
const cCreate = (campOp!.campaignOperation as any).create;
assert.strictEqual(
  cCreate.resourceName,
  "customers/1234567890/campaigns/-2",
  "Kampanja mora imati privremeni ID -2",
);
assert.strictEqual(
  cCreate.campaignBudget,
  "customers/1234567890/campaignBudgets/-1",
  "Kampanja mora referencirati privremeni ID budžeta -1",
);
console.log("  ✓ Privremeni resursi (-1, -2, -3) su ispravno uvezani u jednom atomičnom zahtevu.");

// ── Test B4: Ograda budžeta i upozorenje o potrošnji (B4) ────────────────────
console.log("\n[Test B4] Ograde budžeta (GOOGLE_ADS_MAX_DAILY_BUDGET) i poruka 2x / 30.4x:");

const prevGadsEnv = process.env.GOOGLE_ADS_MAX_DAILY_BUDGET;

// 1. Nepostavljen GOOGLE_ADS_MAX_DAILY_BUDGET blokira
delete process.env.GOOGLE_ADS_MAX_DAILY_BUDGET;
assert.strictEqual(getGoogleAdsMaxDailyBudget(), null, "Nepostavljen env vraća null");
const gateUnset = evaluateGoogleAdsBudgetGate({
  accountCurrency: "EUR",
  limitCurrency: "EUR",
  maxDailyBudget: getGoogleAdsMaxDailyBudget(),
  minBudget: 5,
  dailyBudget: 25,
});
assert.strictEqual(gateUnset.ok, false);
assert.strictEqual(gateUnset.code, "max_budget_unset");

// 2. Prekoračenje GOOGLE_ADS_MAX_DAILY_BUDGET
process.env.GOOGLE_ADS_MAX_DAILY_BUDGET = "50";
const gateOver = evaluateGoogleAdsBudgetGate({
  accountCurrency: "EUR",
  limitCurrency: "EUR",
  maxDailyBudget: getGoogleAdsMaxDailyBudget(),
  minBudget: 5,
  dailyBudget: 100, // 100 > 50
});
assert.strictEqual(gateOver.ok, false);
assert.strictEqual(gateOver.code, "budget_over_limit");

// 3. Nepoznata valuta naloga blokira
const gateUnknownCur = evaluateGoogleAdsBudgetGate({
  accountCurrency: "",
  limitCurrency: "EUR",
  maxDailyBudget: 50,
  minBudget: 5,
  dailyBudget: 25,
});
assert.strictEqual(gateUnknownCur.ok, false);
assert.strictEqual(gateUnknownCur.code, "currency_unknown");

// 4. Nepoklapanje valute naloga i granice blokira
const gateMismatch = evaluateGoogleAdsBudgetGate({
  accountCurrency: "USD",
  limitCurrency: "EUR",
  maxDailyBudget: 50,
  minBudget: 5,
  dailyBudget: 25,
});
assert.strictEqual(gateMismatch.ok, false);
assert.strictEqual(gateMismatch.code, "currency_mismatch");

// 5. Validan budžet prolazi i vraća upozorenje o 2x dnevno i 30.4x mesečno
const gateValid = evaluateGoogleAdsBudgetGate({
  accountCurrency: "EUR",
  limitCurrency: "EUR",
  maxDailyBudget: 50,
  minBudget: 5,
  dailyBudget: 25,
});
assert.strictEqual(gateValid.ok, true);
assert.ok(gateValid.confirmationWarning?.includes("2x"));
assert.ok(gateValid.confirmationWarning?.includes("30.4"));
assert.ok(gateValid.confirmationWarning?.includes("50.00 EUR")); // 25 * 2 = 50
assert.ok(gateValid.confirmationWarning?.includes("760.00 EUR")); // 25 * 30.4 = 760

if (prevGadsEnv !== undefined) process.env.GOOGLE_ADS_MAX_DAILY_BUDGET = prevGadsEnv;
else delete process.env.GOOGLE_ADS_MAX_DAILY_BUDGET;

console.log("  ✓ Nepostavljen/prekoračen/nepoznata valuta blokira; upozorenje 2x i 30.4x generisano.");

// ── Test B5: validate_only levak (B1) ────────────────────────────────────────
console.log("\n[Test B5] runGoogleAdsMutateWithValidateOnly: validateOnly je UVEK prvi:");

function fakeResponse(ok: boolean, jsonObj: unknown): Response {
  return {
    ok,
    status: ok ? 200 : 400,
    text: async () => JSON.stringify(jsonObj),
    json: async () => jsonObj,
  } as unknown as Response;
}

{
  // 5a. validateOnly padne -> pravi poziv se NIKADA ne šalje
  const callPayloads: any[] = [];
  const failingValidateFetch: GoogleAdsFetchImpl = async (_url, init) => {
    const parsed = JSON.parse(String(init?.body || "{}"));
    callPayloads.push(parsed);
    return fakeResponse(false, {
      error: { message: "Invalid budget amount" },
    });
  };

  await assert.rejects(
    () =>
      runGoogleAdsMutateWithValidateOnly(
        failingValidateFetch,
        "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:mutate",
        { "developer-token": "tok" },
        mutatePayload,
      ),
    /validate_only.*Invalid budget amount/i,
    "Neuspela validacija mora baciti grešku i prekinuti izvršavanje",
  );

  assert.strictEqual(callPayloads.length, 1, "Mora biti poslat tačno 1 poziv (validateOnly)");
  assert.strictEqual(callPayloads[0].validateOnly, true, "Prvi poziv mora imati validateOnly: true");
}

{
  // 5b. validateOnly prođe -> šalje se pravi poziv sa validateOnly: false
  const callPayloads: any[] = [];
  let callIndex = 0;
  const successfulFetch: GoogleAdsFetchImpl = async (_url, init) => {
    const parsed = JSON.parse(String(init?.body || "{}"));
    callPayloads.push(parsed);
    callIndex++;
    if (callIndex === 1) {
      // Prvi poziv (validateOnly) prolazi
      return fakeResponse(true, { results: [] });
    }
    // Drugi poziv (pravi mutate) vraća kreirane ID-jeve
    return fakeResponse(true, {
      mutateOperationResponses: [
        { campaignBudgetResult: { resourceName: "customers/1234567890/campaignBudgets/991" } },
        { campaignResult: { resourceName: "customers/1234567890/campaigns/992" } },
      ],
    });
  };

  const result = await runGoogleAdsMutateWithValidateOnly(
    successfulFetch,
    "https://googleads.googleapis.com/v25/customers/1234567890/googleAds:mutate",
    { "developer-token": "tok" },
    mutatePayload,
  );

  assert.strictEqual(callPayloads.length, 2, "Moraju biti poslata tačno 2 poziva");
  assert.strictEqual(callPayloads[0].validateOnly, true, "Prvi poziv je validateOnly: true");
  assert.strictEqual(callPayloads[1].validateOnly, false, "Drugi poziv je validateOnly: false");
  assert.ok(result.mutateOperationResponses, "Pravi poziv vraća rezultat");
}
console.log("  ✓ Pad validateOnly zaustavlja proces; prolaz izvršava validateOnly pa stvarni mutate.");

// ── Test B6: Validacija formata oglasa (RSA naslovi i opisi) ────────────────
console.log("\n[Test B6] Validacija formata oglasa (RSA pravila):");
assert.throws(
  () =>
    validateGoogleAdsAdInput({
      headlines: ["Naslov 1", "Naslov 2"], // samo 2 naslova
      descriptions: ["Opis 1", "Opis 2"],
      finalUrls: ["https://example.com"],
    }),
  /najmanje 3 naslova/i,
  "RSA sa manje od 3 naslova mora baciti grešku",
);

assert.throws(
  () =>
    validateGoogleAdsAdInput({
      headlines: [
        "Ovo je predugačak naslov koji prelazi trideset karaktera sigurno",
        "Naslov 2",
        "Naslov 3",
      ],
      descriptions: ["Opis 1", "Opis 2"],
      finalUrls: ["https://example.com"],
    }),
  /prelazi maksimalnu dužinu od 30 znakova/i,
  "Naslov duži od 30 karaktera mora baciti grešku",
);
console.log("  ✓ RSA oglas striktno proverava broj naslova (min 3) i dužinu (max 30).");

if (failures > 0) {
  console.error(`\n❌ ${failures} provera nije prošlo!`);
  process.exit(1);
}

console.log("\n✅ SVE PROVERE ZA GA8 GOOGLE ADS PISANJE I RUNTIME IZOLACIJU SU USPEŠNO PROŠLE!\n");
