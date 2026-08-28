import {
  scoreLead,
  calculateRecencyFactor,
  type LeadSignalInput,
  type LeadIcpRuleInput,
} from "../convex/lib/leadScoring";
import { DEFAULT_ICP_RULES } from "../convex/leadScoringStore";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ Test failed: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ ${message}`);
  }
}

const now = 1_700_000_000_000;
const MS_PER_DAY = 86_400_000;

console.log("=== Test 1: calculateRecencyFactor ===");
assert(calculateRecencyFactor("fit", now - 365 * MS_PER_DAY, now) === 1.0, "Fit factor is always 1.0 for 1 year old signal");
assert(calculateRecencyFactor("fit", now + 10 * MS_PER_DAY, now) === 1.0, "Fit factor is 1.0 for future signal");
assert(calculateRecencyFactor("intent", now - 3 * MS_PER_DAY, now) === 1.0, "Intent factor is 1.0 for 3 days old signal");
assert(calculateRecencyFactor("intent", now - 7 * MS_PER_DAY, now) === 1.0, "Intent factor is 1.0 for 7 days old signal");
assert(calculateRecencyFactor("intent", now - 15 * MS_PER_DAY, now) === 0.6, "Intent factor is 0.6 for 15 days old signal");
assert(calculateRecencyFactor("intent", now - 30 * MS_PER_DAY, now) === 0.6, "Intent factor is 0.6 for 30 days old signal");
assert(calculateRecencyFactor("intent", now - 60 * MS_PER_DAY, now) === 0.3, "Intent factor is 0.3 for 60 days old signal");
assert(calculateRecencyFactor("intent", now - 90 * MS_PER_DAY, now) === 0.3, "Intent factor is 0.3 for 90 days old signal");
assert(calculateRecencyFactor("intent", now - 91 * MS_PER_DAY, now) === 0.1, "Intent factor is 0.1 for 91 days old signal");
assert(calculateRecencyFactor("intent", now - 300 * MS_PER_DAY, now) === 0.1, "Intent factor is 0.1 for 300 days old signal");
assert(calculateRecencyFactor("intent", now + 5 * MS_PER_DAY, now) === 1.0, "Intent factor is 1.0 for future signal");

console.log("\n=== Test 2: scoreLead with empty signals ===");
const rules: LeadIcpRuleInput[] = [
  { name: "Nema sajt", axis: "fit", signalKind: "nema_sajt", weight: 30, isActive: true },
  { name: "Visok broj recenzija", axis: "fit", signalKind: "visok_broj_recenzija", weight: 20, isActive: true },
  { name: "Pitao cenu", axis: "intent", signalKind: "pitao_cenu", weight: 40, isActive: true },
  { name: "DM", axis: "intent", signalKind: "dm", weight: 15, isActive: true },
];

const emptyScore = scoreLead([], rules, now);
assert(emptyScore.fit.points === 0, "Empty signals: fit points === 0");
assert(emptyScore.fit.maxPoints === 50, "Empty signals: fit maxPoints === 50");
assert(emptyScore.fit.signalsCounted === 0, "Empty signals: fit signalsCounted === 0");
assert(emptyScore.fit.contributions.length === 0, "Empty signals: fit contributions === []");
assert(emptyScore.unmatchedSignalKinds.length === 0, "Empty signals: unmatched === []");
assert(emptyScore.intent.points === 0, "Empty signals: intent points === 0");
assert(emptyScore.intent.maxPoints === 55, "Empty signals: intent maxPoints === 55");
assert(emptyScore.intent.signalsCounted === 0, "Empty signals: intent signalsCounted === 0");
assert(emptyScore.invalidRules.length === 0, "Empty signals: invalidRules === []");

console.log("\n=== Test 3: Deduplication of same signalKind ===");
const duplicateSignals: LeadSignalInput[] = [
  { kind: "pitao_cenu", observedAt: now - 50 * MS_PER_DAY },
  { kind: "pitao_cenu", observedAt: now - 3 * MS_PER_DAY },
  { kind: "pitao_cenu", observedAt: now - 100 * MS_PER_DAY },
];
const dupScore = scoreLead(duplicateSignals, rules, now);
assert(dupScore.intent.signalsCounted === 1, "Duplicate signals: intent signalsCounted === 1");
assert(dupScore.intent.contributions.length === 1, "Duplicate signals: intent contributions === 1");
assert(dupScore.intent.contributions[0].observedAt === now - 3 * MS_PER_DAY, "Duplicate signals: latest observedAt picked");
assert(dupScore.intent.contributions[0].recencyFactor === 1.0, "Duplicate signals: latest recency factor is 1.0");
assert(dupScore.intent.points === 40, "Duplicate signals: points === 40");

console.log("\n=== Test 4: Aging factor for intent & no decay for fit ===");
const mixedSignals: LeadSignalInput[] = [
  { kind: "nema_sajt", observedAt: now - 200 * MS_PER_DAY }, // fit -> no decay -> 30 pts
  { kind: "dm", observedAt: now - 45 * MS_PER_DAY }, // intent (45 days) -> 0.3 * 15 = 4.5 pts
];
const mixedScore = scoreLead(mixedSignals, rules, now);
assert(mixedScore.fit.points === 30, "Fit points = 30 (no decay)");
assert(mixedScore.fit.signalsCounted === 1, "Fit signalsCounted = 1");
assert(mixedScore.intent.points === 4.5, "Intent points = 4.5 (decay 0.3 * 15)");
assert(mixedScore.intent.signalsCounted === 1, "Intent signalsCounted = 1");

console.log("\n=== Test 5: Inactive & Invalid rules ===");
const complexRules: LeadIcpRuleInput[] = [
  { name: "Nema sajt", axis: "fit", signalKind: "nema_sajt", weight: 30, isActive: true },
  { name: "Isključeno pravilo", axis: "fit", signalKind: "visok_broj_recenzija", weight: 20, isActive: false },
  { name: "Loše pravilo", axis: "intent", signalKind: "nepoznat_signal_xyz", weight: 50, isActive: true },
];
const test5Signals: LeadSignalInput[] = [
  { kind: "nema_sajt", observedAt: now - 2 * MS_PER_DAY },
  { kind: "visok_broj_recenzija", observedAt: now - 2 * MS_PER_DAY },
  { kind: "ostalo", observedAt: now - 2 * MS_PER_DAY },
];
const test5Score = scoreLead(test5Signals, complexRules, now);
assert(test5Score.fit.maxPoints === 30, "Inactive rule excluded from maxPoints");
assert(test5Score.fit.points === 30, "Inactive rule does not give points");
assert(test5Score.invalidRules.length === 1, "Invalid rule captured");
assert(test5Score.invalidRules[0].ruleName === "Loše pravilo", "Invalid rule name correct");
assert(test5Score.invalidRules[0].signalKind === "nepoznat_signal_xyz", "Invalid rule signalKind correct");
assert(test5Score.unmatchedSignalKinds.includes("ostalo"), "Unmatched signal kind captured");
assert(test5Score.unmatchedSignalKinds.includes("visok_broj_recenzija"), "Inactive rule signal is unmatched");

console.log("\n=== Test 6: Future signal ===");
const futureSignal: LeadSignalInput[] = [
  { kind: "pitao_cenu", observedAt: now + 50_000 },
];
const futureScore = scoreLead(futureSignal, rules, now);
assert(futureScore.intent.contributions[0].observedAt === now + 50_000, "Future observedAt preserved as is");
assert(futureScore.intent.contributions[0].recencyFactor === 1.0, "Future signal recency factor is 1.0");

console.log("\n=== Test 7: DEFAULT_ICP_RULES validation ===");
assert(DEFAULT_ICP_RULES.length === 12, "DEFAULT_ICP_RULES has exactly 12 rules");

const fitRules = DEFAULT_ICP_RULES.filter(r => r.axis === "fit");
const intentRules = DEFAULT_ICP_RULES.filter(r => r.axis === "intent");
assert(fitRules.length === 6, "6 FIT default rules");
assert(intentRules.length === 6, "6 INTENT default rules");

const expectedFit = {
  nema_sajt: 30,
  koristi_third_party_booking: 20,
  samo_facebook: 15,
  samo_instagram: 15,
  visok_broj_recenzija: 20,
  novootvorena_firma: 10,
};

const expectedIntent = {
  pitao_cenu: 40,
  r_link_clicked: 25,
  landing_opened: 20,
  dm: 15,
  komentar: 10,
  mention: 10,
};

for (const [kind, weight] of Object.entries(expectedFit)) {
  const rule = fitRules.find(r => r.signalKind === kind);
  assert(!!rule && rule.weight === weight, `FIT rule for ${kind} has weight ${weight}`);
  assert(!!rule?.comment && rule.comment.length > 10, `FIT rule for ${kind} has explanation comment`);
}

for (const [kind, weight] of Object.entries(expectedIntent)) {
  const rule = intentRules.find(r => r.signalKind === kind);
  assert(!!rule && rule.weight === weight, `INTENT rule for ${kind} has weight ${weight}`);
  assert(!!rule?.comment && rule.comment.length > 10, `INTENT rule for ${kind} has explanation comment`);
}

console.log("\nALL TESTS PASSED SUCCESSFULLY! 🚀");
