import { formatNumber, formatPercent } from "@/lib/format";
import {
  isVersionStatisticallyReliable,
  DEFAULT_THRESHOLD_IMPRESSIONS,
  DEFAULT_THRESHOLD_CLICKS,
} from "./evidence-meter";

export interface VersionBattleStats {
  _id: string;
  name: string;
  displayName: string;
  hookLabel?: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  costPerResult: number;
  conversionValue: number;
  roas: number;
  hookRate: number;
  holdRate: number;
  ctr: number;
}

export interface BattleEvaluation {
  leaderId: string | null;
  leader: VersionBattleStats | null;
  runnerUp: VersionBattleStats | null;
  criterion: string;
  criterionType: "CPA" | "HOOK_RATE" | "INSUFFICIENT_DATA";
  verdict: string;
  recommendation?: string;
  eligibleCount: number;
  totalCount: number;
  reliableMap: Record<string, boolean>;
}

export function evaluateHookBattle(
  versions: VersionBattleStats[],
  thresholdImpressions = DEFAULT_THRESHOLD_IMPRESSIONS,
  thresholdClicks = DEFAULT_THRESHOLD_CLICKS,
): BattleEvaluation {
  const reliableMap: Record<string, boolean> = {};
  for (const v of versions) {
    reliableMap[v._id] = isVersionStatisticallyReliable(
      v.impressions,
      v.clicks,
      thresholdImpressions,
      thresholdClicks,
    );
  }

  const eligible = versions.filter((v) => reliableMap[v._id]);

  // Branch 1: Insufficient statistical data across all versions
  if (eligible.length === 0) {
    return {
      leaderId: null,
      leader: null,
      runnerUp: null,
      criterion: `Nedovoljno podataka — nijedna verzija nije prešla prag (${formatNumber(thresholdImpressions)} imp / ${thresholdClicks} klikova)`,
      criterionType: "INSUFFICIENT_DATA",
      verdict:
        "Uzorak je još uvek mali za donošenje pouzdanog zaključka. Sačekajte najmanje " +
        formatNumber(thresholdImpressions) +
        " impresija i " +
        thresholdClicks +
        " klikova po verziji pre gašenja ili preraspodele budžeta.",
      eligibleCount: 0,
      totalCount: versions.length,
      reliableMap,
    };
  }

  // Check how many eligible versions have conversions (results >= 1)
  const eligibleWithConversions = eligible.filter(
    (v) => v.results > 0 && v.costPerResult > 0,
  );

  // Branch 2: At least 2 eligible versions have conversions -> Leader determined by CPA
  if (eligibleWithConversions.length >= 2) {
    // Sort by CPA ascending (lowest cost per conversion wins)
    const sortedByCpa = [...eligibleWithConversions].sort(
      (a, b) => a.costPerResult - b.costPerResult,
    );

    const leader = sortedByCpa[0];
    const runnerUp = sortedByCpa[1];

    const cpaDiffPct =
      runnerUp.costPerResult > 0
        ? Math.round(
            ((runnerUp.costPerResult - leader.costPerResult) /
              runnerUp.costPerResult) *
              100,
          )
        : 0;

    const hookMultiplier =
      runnerUp.hookRate > 0
        ? (leader.hookRate / runnerUp.hookRate).toFixed(1)
        : "1.0";

    let verdict = "";
    if (leader.hookRate > runnerUp.hookRate) {
      verdict = `${leader.displayName}: ${hookMultiplier}× veći hook rate u odnosu na ${runnerUp.displayName}, CPA ${cpaDiffPct}% niži (${formatNumber(leader.costPerResult)} € vs ${formatNumber(runnerUp.costPerResult)} €).`;
    } else {
      verdict = `${leader.displayName}: Najbolji CPA sa ${formatNumber(leader.costPerResult)} € (${cpaDiffPct}% niže od ${runnerUp.displayName}). Iako ${runnerUp.displayName} ima veći Hook Rate (${formatPercent(runnerUp.hookRate)}), ${leader.displayName} ostvaruje jeftinije konverzije.`;
    }

    // Recommendation for severe underperformers
    let recommendation: string | undefined;
    const severeLosers = eligible.filter(
      (v) =>
        v._id !== leader._id &&
        (v.costPerResult > leader.costPerResult * 1.5 ||
          (v.results === 0 && v.spend > leader.costPerResult * 1.5)),
    );

    if (severeLosers.length > 0) {
      recommendation = `Preporuka: Razmislite o pauziranju verzije ${severeLosers[0].displayName} radi uštede budžeta.`;
    }

    return {
      leaderId: leader._id,
      leader,
      runnerUp,
      criterion:
        "Najbolji CPA (jer ≥ 2 verzije sa stabilnim uzorkom imaju konverzije)",
      criterionType: "CPA",
      verdict,
      recommendation,
      eligibleCount: eligible.length,
      totalCount: versions.length,
      reliableMap,
    };
  }

  // Branch 3: Less than 2 versions have conversions -> Leader determined by Hook Rate
  const sortedByHook = [...eligible].sort((a, b) => b.hookRate - a.hookRate);
  const leader = sortedByHook[0];
  const runnerUp = sortedByHook.length > 1 ? sortedByHook[1] : null;

  const hookMultiplier =
    runnerUp && runnerUp.hookRate > 0
      ? (leader.hookRate / runnerUp.hookRate).toFixed(1)
      : "1.0";

  let verdict = "";
  if (runnerUp) {
    verdict = `${leader.displayName}: Vodeći hook sa Hook Rate-om od ${formatPercent(leader.hookRate)} (${hookMultiplier}× iznad ${runnerUp.displayName}). Privlači najviše pažnje u prve 3 sekunde.`;
  } else {
    verdict = `${leader.displayName}: Jedina verzija sa pouzdanim uzorkom (Hook Rate: ${formatPercent(leader.hookRate)}). Ostale verzije još uvek prikupljaju podatke.`;
  }

  return {
    leaderId: leader._id,
    leader,
    runnerUp,
    criterion:
      "Najveći Hook Rate (manje od 2 verzije sa stabilnim uzorkom imaju konverzije)",
    criterionType: "HOOK_RATE",
    verdict,
    eligibleCount: eligible.length,
    totalCount: versions.length,
    reliableMap,
  };
}
