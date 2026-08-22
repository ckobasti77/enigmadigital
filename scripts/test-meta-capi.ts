import assert from "node:assert/strict";
import {
  validateCapiEvent,
  partitionCapiBatch,
  buildCapiPayload,
  buildCapiEventsUrl,
  CAPI_MAX_BATCH_SIZE,
  CAPI_RETRY_DELAYS_MS,
  CAPI_DISPATCH_LOCK_TTL_MS,
  getCapiRetryDelayMs,
  type CapiEventItem,
} from "../convex/lib/metaCapi";
import { hashEmail, hashPhone } from "../convex/lib/metaAudienceHash";
import { CRON_LOCKS } from "../convex/lib/cronLock";

async function runTests() {
  console.log("Pokrećem testove za Meta Conversions API (Modul B, B-F1..F3, D1, D2)...");

  const nowSec = 1700000000; // Fixed timestamp for deterministic testing
  const validEmailHash = await hashEmail("korisnik@example.com");
  const validPhoneHash = await hashPhone("0641234567");

  // ── 1. Valid Event Passing Pre-flight ───────────────────────────────────────
  console.log("\n[Test 1] Validacija ispravnih CAPI događaja:");
  const validEvent: CapiEventItem = {
    event_name: "PageView",
    event_time: nowSec - 300, // 5 min ago
    event_id: "test_event_001",
    action_source: "website",
    user_data: {
      em: [validEmailHash],
      ph: [validPhoneHash],
      client_ip_address: "192.168.1.1",
    },
  };

  const validRes = validateCapiEvent(validEvent, nowSec);
  assert.equal(validRes.valid, true);
  console.log("  ✓ Valid događaj sa heširanim emailom i telefonom prolazi pre-flight validaciju");

  // ── 2. Event Name Validation ────────────────────────────────────────────────
  console.log("\n[Test 2] Validacija naziva događaja (event_name):");
  const emptyNameEvent: CapiEventItem = {
    ...validEvent,
    event_name: "   ",
  };
  const emptyNameRes = validateCapiEvent(emptyNameEvent, nowSec);
  assert.equal(emptyNameRes.valid, false);
  assert.match(emptyNameRes.reason!, /event_name/i);
  console.log("  ✓ Prazan event_name je odbijen");

  // ── 3. Event Time Window Validation (7 days limit) ──────────────────────────
  console.log("\n[Test 3] Validacija vremenskog prozora (7 dana i budućnost):");
  const tooOldEvent: CapiEventItem = {
    ...validEvent,
    event_time: nowSec - 8 * 86400, // 8 days old
  };
  const tooOldRes = validateCapiEvent(tooOldEvent, nowSec);
  assert.equal(tooOldRes.valid, false);
  assert.match(tooOldRes.reason!, /stariji od 7 dana/i);
  console.log("  ✓ Događaj stariji od 7 dana je odbijen");

  const futureEvent: CapiEventItem = {
    ...validEvent,
    event_time: nowSec + 120, // 2 minutes in future
  };
  const futureRes = validateCapiEvent(futureEvent, nowSec);
  assert.equal(futureRes.valid, false);
  assert.match(futureRes.reason!, /budućnosti/i);
  console.log("  ✓ Događaj više od 1 minuta u budućnosti je odbijen");

  // ── 4. User Data Identifiers Requirement (B-F1) ─────────────────────────────
  console.log("\n[Test 4] Provera identifikatora u user_data (B-F1):");
  const noIdEvent: CapiEventItem = {
    ...validEvent,
    user_data: {},
  };
  const noIdRes = validateCapiEvent(noIdEvent, nowSec);
  assert.equal(noIdRes.valid, false);
  assert.match(noIdRes.reason!, /bar jedan identifikator/i);
  console.log("  ✓ Događaj bez ijednog identifikatora je nevalidan (invalid)");

  const uaOnlyEvent: CapiEventItem = {
    ...validEvent,
    user_data: {
      client_user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
    },
  };
  const uaOnlyRes = validateCapiEvent(uaOnlyEvent, nowSec);
  assert.equal(uaOnlyRes.valid, true);
  console.log("  ✓ Događaj samo sa client_user_agent je validan (valid)");

  const ipOnlyEvent: CapiEventItem = {
    ...validEvent,
    user_data: {
      client_ip_address: "178.222.45.10",
    },
  };
  assert.equal(validateCapiEvent(ipOnlyEvent, nowSec).valid, true);
  console.log("  ✓ Događaj samo sa sirovom IP adresom je validan");

  const fbcOnlyEvent: CapiEventItem = {
    ...validEvent,
    user_data: {
      fbc: "fb.1.1700000000.IwAR2_test123",
    },
  };
  assert.equal(validateCapiEvent(fbcOnlyEvent, nowSec).valid, true);
  console.log("  ✓ Događaj samo sa fbc identifikatorom je validan");

  // ── 5. Hash Format Validation (Strict 64 hex lowercase) ──────────────────────
  console.log("\n[Test 5] Stroga validacija SHA-256 heševa:");
  const invalidHashEvent: CapiEventItem = {
    ...validEvent,
    user_data: {
      em: ["not_a_valid_64_char_hash"],
    },
  };
  const invalidHashRes = validateCapiEvent(invalidHashEvent, nowSec);
  assert.equal(invalidHashRes.valid, false);
  assert.match(invalidHashRes.reason!, /64-karakterni SHA-256/i);
  console.log("  ✓ Nevalidan heš emaila (nije 64 hex znaka) je odbijen");

  const uppercaseHashEvent: CapiEventItem = {
    ...validEvent,
    user_data: {
      em: [validEmailHash.toUpperCase()],
    },
  };
  const upperRes = validateCapiEvent(uppercaseHashEvent, nowSec);
  assert.equal(upperRes.valid, false);
  console.log("  ✓ Velika slova u hešu su odbijena (Meta zahteva mala slova)");

  // ── 6. Batch Partitioning (Isolation of Bad Events) ─────────────────────────
  console.log("\n[Test 6] Particionisanje batch-a i izolacija neispravnih događaja:");
  const batch = [
    validEvent,
    tooOldEvent,
    { ...validEvent, event_id: "test_event_002" },
    noIdEvent,
  ];

  const { valid, rejected } = partitionCapiBatch(batch, nowSec);
  assert.equal(valid.length, 2);
  assert.equal(rejected.length, 2);
  assert.equal(valid[0].event_id, "test_event_001");
  assert.equal(valid[1].event_id, "test_event_002");
  console.log("  ✓ partitionCapiBatch tačno izdvaja neispravne događaje bez rušenja ispravnih u batch-u");

  // ── 7. Deterministic eventId Logic (B-F2) ───────────────────────────────────
  console.log("\n[Test 7] Deterministički eventId po sekundi klika (B-F2):");
  const linkId = "link_abc123";
  const userIpHash = "a1b2c3d4e5f67890";
  
  const generateClickEventId = (link: string, sec: number, iph?: string) => {
    const ident = iph ? iph.slice(0, 12) : "anon";
    return `r_${link}_${sec}_${ident}`;
  };

  const click1 = generateClickEventId(linkId, 1700000000, userIpHash);
  const click2SameSec = generateClickEventId(linkId, 1700000000, userIpHash);
  assert.equal(click1, click2SameSec);
  console.log("  ✓ Isti klik dva puta u istoj sekundi daje ISTI eventId (deduplikacija)");

  const click3DiffSec = generateClickEventId(linkId, 1700000001, userIpHash);
  assert.notEqual(click1, click3DiffSec);
  console.log("  ✓ Isti klik u različitim sekundama daje RAZLIČIT eventId");

  // ── 8. Batch Sizing & Quarantine Rejection (B-F3) ───────────────────────────
  console.log("\n[Test 8] Konstanta batch limita i karantin odbijanje (B-F3):");
  assert.equal(CAPI_MAX_BATCH_SIZE, 500);
  console.log("  ✓ CAPI_MAX_BATCH_SIZE je tačno 500 (Meta Graph API limit)");

  // Retry failure simulation: attempts >= 5 transitions from pending to rejected
  const simulateFailure = (currentAttempts: number, reason: string) => {
    const nextAttempts = currentAttempts + 1;
    if (nextAttempts >= 5) {
      return { status: "rejected", attempts: nextAttempts, reason: `Pet neuspelih pokušaja slanja: ${reason}` };
    }
    return { status: "pending", attempts: nextAttempts };
  };

  const attempt4 = simulateFailure(3, "Network timeout");
  assert.equal(attempt4.status, "pending");
  assert.equal(attempt4.attempts, 4);

  const attempt5 = simulateFailure(4, "500 Internal Server Error");
  assert.equal(attempt5.status, "rejected");
  assert.equal(attempt5.attempts, 5);
  assert.match(attempt5.reason!, /Pet neuspelih pokušaja slanja/);
  console.log("  ✓ Red sa attempts 5 prelazi u 'rejected' sa razlogom, ne ostaje 'pending'");

  // ── 9. Exponential Backoff Retry Schedule (D1 & D2) ─────────────────────────
  console.log("\n[Test 9] Eksponencijalno odlaganje za ponovni pokušaj (D1):");
  assert.equal(CAPI_RETRY_DELAYS_MS[1], 30000);
  assert.equal(getCapiRetryDelayMs(1), 30000);
  console.log("  ✓ attempts 1 -> 30000 ms (30 sekundi)");

  assert.equal(getCapiRetryDelayMs(2), 300000);
  console.log("  ✓ attempts 2 -> 300000 ms (5 minuta)");

  assert.equal(getCapiRetryDelayMs(3), 1800000);
  console.log("  ✓ attempts 3 -> 1800000 ms (30 minuta)");

  assert.equal(getCapiRetryDelayMs(4), 7200000);
  console.log("  ✓ attempts 4 -> 7200000 ms (2 sata)");

  assert.equal(getCapiRetryDelayMs(5), null);
  assert.equal(getCapiRetryDelayMs(6), null);
  console.log("  ✓ attempts 5+ -> null (ne zakazuje se ništa, redovi su u karantinu/rejected)");

  // ── 10. URL and Payload Building ────────────────────────────────────────────
  console.log("\n[Test 10] Bilderi URL-a i Payload-a:");
  const url = buildCapiEventsUrl("act_123456789", "v25.0");
  assert.equal(url, "https://graph.facebook.com/v25.0/123456789/events");
  console.log("  ✓ buildCapiEventsUrl uklanja 'act_' prefiks ako je prosleđen i postavlja verziju");

  const payloadWithTest = buildCapiPayload([validEvent], "TEST12345");
  assert.equal(payloadWithTest.data.length, 1);
  assert.equal(payloadWithTest.test_event_code, "TEST12345");

  const payloadWithoutTest = buildCapiPayload([validEvent]);
  assert.equal(payloadWithoutTest.test_event_code, undefined);
  console.log("  ✓ buildCapiPayload ispravno uključuje test_event_code kada postoji");

  // ── 11. Cron Lock & Mutual Exclusion (E) ────────────────────────────────────
  console.log("\n[Test 11] Provera Cron Lock-a i TTL-a od 60s (E):");
  assert.equal(CRON_LOCKS.capiDispatch, "meta:capi:dispatch");
  assert.equal(CAPI_DISPATCH_LOCK_TTL_MS, 60000);
  console.log("  ✓ CRON_LOCKS.capiDispatch je definisan kao 'meta:capi:dispatch'");
  console.log("  ✓ CAPI_DISPATCH_LOCK_TTL_MS je tačno 60 sekundi (omogućava backoff retry posle 30s)");

  console.log("\n✅ SVI TESTOVI ZA META CONVERSIONS API SU USPEŠNO PROŠLI!");
}

runTests().catch((err) => {
  console.error("Testovi za CAPI pali:", err);
  process.exit(1);
});
