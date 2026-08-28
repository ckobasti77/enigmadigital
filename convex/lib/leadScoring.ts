import {
  isKnownLeadSignalKind,
  type LeadSignalKind,
} from "./leadNormalize";

/**
 * ============================================================================
 * LEAD SCORING — ČISTE FUNKCIJE (§0, §2.5, §4, LM6)
 * ============================================================================
 *
 * Ocenjivanje leada po dve nezavisne ose:
 * - FIT: koliko firma odgovara idealnom profilu kupca (branša, sajt, booking, recenzije)
 * - INTENT: koliko je firma trenutno aktivna/zagrejana na tržištu (upiti, posete, klikovi)
 *
 * NEPREGOVARAČKA PRAVILA (§0, §4):
 * 1. Ocena se NIKADA ne upisuje u bazu podataka. Računa se isključivo pri čitanju.
 * 2. Nikada se ne vraća samo jedan broj ili stopa. Vraćaju se dve ose sa `points` i `maxPoints`.
 * 3. Nula signala NIJE isto što i izmerena hladna nula — zato postoji `signalsCounted`.
 * 4. Isti signalKind se broji JEDNOM po pravilu, sa najskorijim opažanjem.
 * 5. Faktor starosti opada samo za INTENT osu, dok za FIT osu ostaje 1.0 (fit se ne gasi).
 * 6. Pravila koja pokazuju na nepostojeći signalKind se prijavljuju u `invalidRules`.
 */

export type ScoredContribution = {
  signalKind: string;
  ruleName: string;
  weight: number;
  recencyFactor: number;
  points: number;
  observedAt: number;
};

export type ScoredAxis = {
  points: number;
  maxPoints: number;
  // Svaki signal koji je doprineo, sa svojim doprinosom. Ocena bez
  // objašnjenja je broj kojem niko ne može da proveri poreklo.
  contributions: ScoredContribution[];
  // Broj signala koji su ušli u račun.
  signalsCounted: number;
};

export type InvalidRule = {
  ruleName: string;
  signalKind: string;
  /**
   * Zašto pravilo ne može da se primeni:
   * - `nepoznat_signal` — `signalKind` ne postoji u LEAD_SIGNAL_KINDS
   * - `nevalidna_tezina` — težina je 0 ili negativna
   *
   * Postoji zato što se pravilo sa težinom 0 ranije preskakalo bez traga:
   * podešavanje koje ne radi ništa izgledalo je isto kao podešavanje kojeg
   * nema. Nemoćno pravilo je greška u podešavanju, ne nula.
   */
  razlog: "nepoznat_signal" | "nevalidna_tezina";
};

export type LeadScore = {
  fit: ScoredAxis;
  intent: ScoredAxis;
  /**
   * Signali koji su viđeni na firmi a nijedno aktivno pravilo ih ne pokriva.
   *
   * Stoji na nivou leada, ne na osi. Ranije je isti niz visio i na `fit` i na
   * `intent`, pa je „nepokriveno" izgledalo kao osobina ose — a signal koji
   * nijedno pravilo ne pokriva ne pripada nijednoj osi. (Ovo je bila greška u
   * mojoj specifikaciji, ne u izvedbi.)
   */
  unmatchedSignalKinds: string[];
  // Pravila koja pokazuju na `signalKind` koji ne postoji u
  // LEAD_SIGNAL_KINDS. NE preskaču se u tišini — pravilo koje ne može
  // da se primeni je greška u podešavanju, a ne nula.
  invalidRules: InvalidRule[];
};

export type LeadSignalInput = {
  kind: string;
  observedAt: number;
};

export type LeadIcpRuleInput = {
  name: string;
  axis: "fit" | "intent";
  signalKind: string;
  weight: number;
  isActive: boolean;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Računa faktor starosti signala na osnovu proteklog vremena.
 *
 * PRAVILA (§4, KORAK 3):
 * 1. FIT osa se nikada ne gasi — "nema sajt" od pre godinu dana je i dalje istina o firmi (faktor je uvek 1.0).
 * 2. INTENT osa se gasi po definisanim pragovima:
 *      <= 7 dana   -> 1.0
 *      <= 30 dana  -> 0.6
 *      <= 90 dana  -> 0.3
 *      > 90 dana   -> 0.1
 * 3. Signal čiji je observedAt u budućnosti predstavlja grešku u podacima.
 *    Uključuje se sa faktorom 1.0, a observedAt ostaje zabeležen u izvornom obliku radi uočavanja.
 */
export function calculateRecencyFactor(
  axis: "fit" | "intent",
  observedAt: number,
  now: number,
): number {
  if (axis === "fit") {
    return 1.0;
  }

  // Ako je vreme u budućnosti (greška u podacima), dodeljuje se faktor 1.0
  if (observedAt > now) {
    return 1.0;
  }

  const ageInDays = (now - observedAt) / MS_PER_DAY;

  if (ageInDays <= 7) {
    return 1.0;
  }
  if (ageInDays <= 30) {
    return 0.6;
  }
  if (ageInDays <= 90) {
    return 0.3;
  }
  return 0.1;
}

/**
 * Pomoćna funkcija za evaluaciju pojedinačne ose (FIT ili INTENT).
 */
function scoreAxis(
  axis: "fit" | "intent",
  activeRules: readonly LeadIcpRuleInput[],
  latestSignalsByKind: Map<string, LeadSignalInput>,
  now: number,
): ScoredAxis {
  let maxPoints = 0;
  const contributions: ScoredContribution[] = [];
  const countedKinds = new Set<string>();

  for (const rule of activeRules) {
    // maxPoints po osi je zbir težina svih aktivnih validnih pravila te ose (bez faktora starosti)
    maxPoints += rule.weight;

    const signal = latestSignalsByKind.get(rule.signalKind);
    if (signal) {
      const recencyFactor = calculateRecencyFactor(axis, signal.observedAt, now);
      const rawPoints = rule.weight * recencyFactor;
      // Zaokruživanje na 2 decimale radi sprečavanja grešaka u decimalnom zapisu
      const points = Math.round(rawPoints * 100) / 100;

      contributions.push({
        signalKind: rule.signalKind,
        ruleName: rule.name,
        weight: rule.weight,
        recencyFactor,
        points,
        observedAt: signal.observedAt,
      });
      countedKinds.add(rule.signalKind);
    }
  }

  const totalPoints = contributions.reduce((acc, c) => acc + c.points, 0);
  const roundedPoints = Math.round(totalPoints * 100) / 100;
  const roundedMaxPoints = Math.round(maxPoints * 100) / 100;

  return {
    points: roundedPoints,
    maxPoints: roundedMaxPoints,
    contributions,
    signalsCounted: countedKinds.size,
  };
}

/**
 * Čista funkcija za računanje skora leada po dve ose (fit i intent) i analizu pravila.
 *
 * @param signals - Lista svih signala zabeleženih za firmu
 * @param rules - Lista svih ICP pravila radnog prostora
 * @param now - Trenutni vremenski žig u milisekundama (omogućava determinističko testiranje)
 * @returns LeadScore objekat sa fit i intent osama i nevalidnim pravilima
 */
export function scoreLead(
  signals: readonly LeadSignalInput[],
  rules: readonly LeadIcpRuleInput[],
  now: number,
): LeadScore {
  const invalidRules: InvalidRule[] = [];
  const activeFitRules: LeadIcpRuleInput[] = [];
  const activeIntentRules: LeadIcpRuleInput[] = [];
  const coveredSignalKinds = new Set<string>();

  // 1. Filtriranje pravila: samo isActive: true ulaze u račun, a nevalidna se beleže u invalidRules
  for (const rule of rules) {
    if (!rule.isActive) {
      continue;
    }

    if (!isKnownLeadSignalKind(rule.signalKind)) {
      invalidRules.push({
        ruleName: rule.name,
        signalKind: rule.signalKind,
        razlog: "nepoznat_signal",
      });
      continue;
    }

    if (rule.weight <= 0) {
      invalidRules.push({
        ruleName: rule.name,
        signalKind: rule.signalKind,
        razlog: "nevalidna_tezina",
      });
      continue;
    }

    if (rule.axis === "fit") {
      activeFitRules.push(rule);
    } else {
      activeIntentRules.push(rule);
    }

    coveredSignalKinds.add(rule.signalKind);
  }

  // 2. Pronalaženje najskorijeg opažanja za svaki tip signala
  // Isti signalKind viđen više puta broji se JEDNOM po pravilu, sa najskorijim opažanjem
  const latestSignalsByKind = new Map<string, LeadSignalInput>();
  for (const signal of signals) {
    const existing = latestSignalsByKind.get(signal.kind);
    if (!existing || signal.observedAt > existing.observedAt) {
      latestSignalsByKind.set(signal.kind, signal);
    }
  }

  // 3. Pronalaženje signala koji su viđeni na firmi, ali nijedno aktivno pravilo ih ne pokriva
  const unmatchedSignalKinds: string[] = [];
  for (const kind of latestSignalsByKind.keys()) {
    if (!coveredSignalKinds.has(kind)) {
      unmatchedSignalKinds.push(kind);
    }
  }

  // 4. Evaluacija FIT i INTENT ose
  const fit = scoreAxis("fit", activeFitRules, latestSignalsByKind, now);
  const intent = scoreAxis("intent", activeIntentRules, latestSignalsByKind, now);

  return {
    fit,
    intent,
    unmatchedSignalKinds,
    invalidRules,
  };
}
