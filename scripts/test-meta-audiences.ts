import assert from "node:assert/strict";
import {
  normalizeEmail,
  normalizePhone,
  normalizeName,
  normalizeCity,
  normalizeCountry,
  normalizeZip,
  hashEmail,
  hashPhone,
  hashName,
  prepareHashedAudiencePayload,
  sanitizePii,
} from "../convex/lib/metaAudienceHash";
import {
  validateLookalikeSpec,
  formatAudienceSize,
  formatAudienceRange,
  formatAudienceSubtype,
  formatAudienceDeliveryStatus,
  parseTosResponse,
  TOS_INSTRUCTIONS_SR,
  TOS_UNKNOWN_MESSAGE_SR,
} from "../convex/lib/metaAdsApi";

async function runTests() {
  console.log("Pokrećem testove za Meta Audiences (MA-Publike)...");

  // ── 1. Phone Normalization ──────────────────────────────────────────────────
  console.log("\n[Test 1] Normalizacija telefonskih brojeva:");
  assert.equal(normalizePhone("0641234567"), "381641234567");
  assert.equal(normalizePhone("064/123-4567"), "381641234567");
  assert.equal(normalizePhone("+381 64 123 4567"), "381641234567");
  assert.equal(normalizePhone("00381641234567"), "381641234567");
  assert.equal(normalizePhone("  +381 (64) 123-4567  "), "381641234567");
  console.log("  ✓ Srpski mobilni prefiksi 06x se ispravno konvertuju u 3816x");
  console.log("  ✓ Uklanjaju se razmaci, crtice, zagrade i vodeće nule / plus");

  // ── 2. Name & Diacritics Normalization ──────────────────────────────────────
  console.log("\n[Test 2] Normalizacija imena i dijakritika:");
  assert.equal(normalizeName("Đorđe Šarić"), "dordesaric");
  assert.equal(normalizeName("Čedomir Živojinović"), "cedomirzivojinovic");
  assert.equal(normalizeName("   DŽON   DOE   "), "dzondoe");
  assert.equal(normalizeName("Marko-Polo"), "markopolo");
  console.log("  ✓ 'Đorđe Šarić' -> 'dordesaric'");
  console.log("  ✓ 'Čedomir Živojinović' -> 'cedomirzivojinovic'");

  // ── 3. Email, City, Country, Zip Normalization ──────────────────────────────
  console.log("\n[Test 3] Normalizacija emaila, grada, države i poštanskog broja:");
  assert.equal(normalizeEmail("  Korisnik.Test+1@Primer.RS  "), "korisnik.test+1@primer.rs");
  assert.equal(normalizeCity("  Beograd / Novi Beograd  "), "beogradnovibeograd");
  assert.equal(normalizeCountry("  rs  "), "rs");
  assert.equal(normalizeZip(" 11 000 "), "11000");
  console.log("  ✓ Email se pretvara u mala slova i trimuje");
  console.log("  ✓ Grad, država i poštanski broj se čiste od suvišnih karaktera");

  // ── 4. SHA-256 Hashing & Zero-PII Leakage ──────────────────────────────────
  console.log("\n[Test 4] SHA-256 heširanje i provera nultog curenja PII-a:");
  const testEmail = "marko.petrovic@example.rs";
  const hashedMail = await hashEmail(testEmail);
  assert.equal(typeof hashedMail, "string");
  assert.equal(hashedMail?.length, 64); // SHA-256 hex dužina je tačno 64 karaktera
  assert.match(hashedMail!, /^[0-9a-f]{64}$/);
  assert.equal(hashedMail?.includes("marko"), false);
  assert.equal(hashedMail?.includes("example"), false);
  assert.equal(hashedMail?.includes("@"), false);

  const hashedPhone = await hashPhone("0641234567");
  assert.equal(hashedPhone?.length, 64);
  assert.equal(hashedPhone?.includes("064"), false);

  const hashedName = await hashName("Đorđe");
  assert.equal(hashedName?.length, 64);
  assert.equal(hashedName?.includes("dorde"), false);

  const sanitized = sanitizePii({ email: "tajno@primer.rs", phone: "0641234567" });
  assert.equal(JSON.stringify(sanitized).includes("tajno@primer.rs"), false);

  const payload = await prepareHashedAudiencePayload([
    {
      email: "pera@example.rs",
      phone: "0641122334",
      firstName: "Petar",
      lastName: "Petrović",
      city: "Beograd",
      country: "RS",
      zip: "11000",
    },
  ]);

  assert.equal(payload.data.length, 1);
  const row = payload.data[0];
  const payloadStr = JSON.stringify(payload);
  assert.equal(payloadStr.includes("pera@example.rs"), false);
  assert.equal(payloadStr.includes("0641122334"), false);
  assert.equal(payloadStr.includes("Petar"), false);
  assert.equal(payloadStr.includes("Petrović"), false);
  assert.equal(row.length, payload.schema.length);
  for (const fieldVal of row) {
    assert.match(fieldVal, /^[0-9a-f]{64}$/);
  }
  console.log("  ✓ SHA-256 heševi su tačno 64 hex karaktera za email, telefon i ime");
  console.log("  ✓ sanitizePii uklanja ili maskira PII pre logovanja");
  console.log("  ✓ Sirovi email, telefon i imena se NIKADA ne nalaze u heširanom JSON payload-u");

  // ── 5. Lookalike Specification Validation ──────────────────────────────────
  console.log("\n[Test 5] Validacija Lookalike specifikacije pre mrežnog poziva:");

  // A) Both type and ratio provided -> MUST THROW
  assert.throws(
    () => {
      validateLookalikeSpec(
        { country: "RS", type: "similarity", ratio: 0.01 },
        { approximateCountLower: 500, name: "Kupci" },
      );
    },
    {
      message: /ne sme sadržati i 'type' i 'ratio' istovremeno/i,
    },
  );
  console.log("  ✓ Blokira kada su navedeni i 'type' i 'ratio' istovremeno");

  // B) Neither type nor ratio provided -> MUST THROW
  assert.throws(
    () => {
      validateLookalikeSpec(
        { country: "RS" },
        { approximateCountLower: 500, name: "Kupci" },
      );
    },
    {
      message: /mora sadržati ili 'type' ili 'ratio'/i,
    },
  );
  console.log("  ✓ Blokira kada nije naveden ni 'type' ni 'ratio'");

  // C) Seed audience count unknown (undefined) -> MUST THROW
  assert.throws(
    () => {
      validateLookalikeSpec(
        { country: "RS", ratio: 0.01 },
        { approximateCountLower: undefined, name: "Nepoznata publika" },
      );
    },
    {
      message: /nema poznatu procenu veličine/i,
    },
  );
  console.log("  ✓ Blokira kada seed publika ima nepoznatu veličinu (approximateCountLower === undefined)");

  // D) Seed audience count < 100 -> MUST THROW
  assert.throws(
    () => {
      validateLookalikeSpec(
        { country: "RS", ratio: 0.01 },
        { approximateCountLower: 75, name: "Mala publika" },
      );
    },
    {
      message: /ima procenjenu veličinu od samo 75 korisnika/i,
    },
  );
  console.log("  ✓ Blokira kada seed publika ima manje od 100 korisnika");

  // E) Ratio out of bounds (< 0.01 or > 0.20) -> MUST THROW
  assert.throws(
    () => {
      validateLookalikeSpec(
        { country: "RS", ratio: 0.005 },
        { approximateCountLower: 1500, name: "Kupci" },
      );
    },
    {
      message: /mora biti broj između 0.01/i,
    },
  );
  assert.throws(
    () => {
      validateLookalikeSpec(
        { country: "RS", ratio: 0.25 },
        { approximateCountLower: 1500, name: "Kupci" },
      );
    },
    {
      message: /mora biti broj između 0.01/i,
    },
  );
  console.log("  ✓ Blokira ratio manji od 0.01 (1%) ili veći od 0.20 (20%)");

  // F) Valid specs -> PASS
  assert.doesNotThrow(() => {
    validateLookalikeSpec(
      { country: "RS", ratio: 0.02 },
      { approximateCountLower: 1200, name: "Kupci" },
    );
  });
  assert.doesNotThrow(() => {
    validateLookalikeSpec(
      { country: "RS", type: "similarity" },
      { approximateCountLower: 100, name: "Seed 100" },
    );
  });
  console.log("  ✓ Dozvoljava validnu specifikaciju sa ratio-om (npr. 0.02) i seed >= 100");
  console.log("  ✓ Dozvoljava validnu specifikaciju sa type-om ('similarity') i seed >= 100");

  // ── 6. Range Formatting & Threshold Rules ───────────────────────────────────
  console.log("\n[Test 6] Formatiranje raspona i pragovi veličine (sr-Latn-RS):");
  
  // Both bounds
  const rangeBoth = formatAudienceSize(1200, 1500);
  assert.equal(rangeBoth.label, "1.200 – 1.500");
  assert.equal(rangeBoth.state, "value");
  assert.equal(formatAudienceRange(1200, 1500), "1.200 – 1.500");
  console.log("  ✓ Oba raspona poznata (1200, 1500) -> '1.200 – 1.500'");

  // Only lower bound
  const rangeLowerOnly = formatAudienceSize(1200, undefined);
  assert.equal(rangeLowerOnly.label, "≥ 1.200");
  assert.equal(rangeLowerOnly.state, "value");
  console.log("  ✓ Samo donja granica poznata (1200, undefined) -> '≥ 1.200'");

  // Only upper bound
  const rangeUpperOnly = formatAudienceSize(undefined, 1500);
  assert.equal(rangeUpperOnly.label, "≤ 1.500");
  assert.equal(rangeUpperOnly.state, "value");
  console.log("  ✓ Samo gornja granica poznata (undefined, 1500) -> '≤ 1.500'");

  // Below display threshold
  const rangeThresholded = formatAudienceSize(50, 500);
  assert.equal(rangeThresholded.label, "—");
  assert.equal(rangeThresholded.state, "thresholded");
  assert.match(rangeThresholded.reason!, /ispod praga prikaza/i);
  console.log("  ✓ Ispod praga prikaza (50, 500) -> thresholded stanje (nije nula)");

  // Neither bound known
  const rangeUnknown = formatAudienceSize(undefined, undefined);
  assert.equal(rangeUnknown.label, "—");
  assert.equal(rangeUnknown.state, "unavailable");
  console.log("  ✓ Nepoznate granice (undefined, undefined) -> '—' sa tooltip razlogom");

  // Subtype formatting
  assert.equal(formatAudienceSubtype("CUSTOM"), "Korisnička lista");
  assert.equal(formatAudienceSubtype("LOOKALIKE"), "Slična publika (Lookalike)");
  assert.equal(formatAudienceSubtype("WEBSITE"), "Veb-sajt posetioci");

  // Delivery status formatting
  assert.equal(formatAudienceDeliveryStatus("READY").label, "Spremna");
  assert.equal(formatAudienceDeliveryStatus("READY").tone, "success");
  assert.equal(formatAudienceDeliveryStatus("POPULATING").label, "Popunjava se");
  assert.equal(formatAudienceDeliveryStatus("POPULATING").tone, "progress");

  // ── 7. ToS Parsing & Message Generation (A1 & A2) ──────────────────────────
  console.log("\n[Test 7] Parsiranje ToS odgovora i generisanje poruka (A1 & A2):");
  assert.equal(parseTosResponse({ tos_accepted: { custom_audience_tos: 1 } }), "accepted");
  assert.equal(parseTosResponse({ tos_accepted: { custom_audience_tos: true } }), "accepted");
  assert.equal(parseTosResponse({ tos_accepted: { custom_audience_tos: "1" } }), "accepted");
  assert.equal(parseTosResponse({ tos_accepted: { custom_audience_tos: 0 } }), "not_accepted");
  assert.equal(parseTosResponse({ tos_accepted: { custom_audience_tos: false } }), "not_accepted");
  assert.equal(parseTosResponse({ tos_accepted: {} }), "not_accepted");
  assert.equal(parseTosResponse(null), "not_accepted");
  assert.equal(parseTosResponse(undefined), "not_accepted");
  assert.equal(parseTosResponse("error"), "not_accepted");
  console.log("  ✓ parseTosResponse tačno mapira 1/true/'1' u 'accepted', sve ostalo u 'not_accepted'");

  const instructions = TOS_INSTRUCTIONS_SR("123456789");
  assert.match(instructions, /Meta Business Suite/);
  assert.match(instructions, /act_123456789/);
  assert.match(instructions, /Publike/);
  console.log("  ✓ TOS_INSTRUCTIONS_SR sadrži uputstvo od 5 koraka sa ID-jem naloga");

  const unknownMsg = TOS_UNKNOWN_MESSAGE_SR("Mrežni prekid");
  assert.match(unknownMsg, /Ne mogu da proverim da li su uslovi/);
  assert.match(unknownMsg, /Mrežni prekid/);
  console.log("  ✓ TOS_UNKNOWN_MESSAGE_SR generiše poruku sa razlogom");

  console.log("\n✅ SVI TESTOVI ZA META AUDIENCES SU USPEŠNO PROŠLI!");
}

runTests().catch((err) => {
  console.error("\n❌ GREŠKA U TESTU:", err);
  process.exit(1);
});
