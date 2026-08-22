import { formatNumber, formatPercent } from "@/lib/format";
import { formatMetric } from "@/convex/lib/metaAdsFormat";
import { resolveMetric } from "@/convex/lib/metaAdsCatalog";

const cpaDef = resolveMetric("costPerResult")!;

export const DEFAULT_THRESHOLD_IMPRESSIONS = 1000;
export const DEFAULT_THRESHOLD_CLICKS = 50;

export function isVersionStatisticallyReliable(
  impressions: number,
  clicks: number,
  thresholdImpressions = DEFAULT_THRESHOLD_IMPRESSIONS,
  thresholdClicks = DEFAULT_THRESHOLD_CLICKS,
): boolean {
  return impressions >= thresholdImpressions && clicks >= thresholdClicks;
}

export interface VersionBattleStats {
  _id: string;
  name: string;
  displayName: string;
  hookLabel?: string;
  spend: number;
  impressions: number;
  clicks: number;
  results?: number;
  costPerResult?: number;
  conversionValue?: number;
  roas?: number;
  hookRate?: number;
  holdRate?: number;
  ctr: number;
}

export type BattleEvaluation =
  | {
      kind: "odluka";
      leaderId: string;
      leader: VersionBattleStats;
      runnerUp: VersionBattleStats | null;
      criterion: string;
      criterionType: "CPA" | "HOOK_RATE";
      verdict: string;
      recommendation?: string;
      eligibleCount: number;
      totalCount: number;
      reliableMap: Record<string, boolean>;
    }
  | {
      kind: "nedovoljno";
      leaderId: null;
      leader: null;
      runnerUp: null;
      criterion: string;
      criterionType: "INSUFFICIENT_DATA";
      verdict: string;
      razlog: string;
      recommendation?: string;
      eligibleCount: number;
      totalCount: number;
      reliableMap: Record<string, boolean>;
    };

export function evaluateHookBattle(
  versions: VersionBattleStats[],
  thresholdImpressions = DEFAULT_THRESHOLD_IMPRESSIONS,
  thresholdClicks = DEFAULT_THRESHOLD_CLICKS,
  currencyCode?: string,
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
    const razlog = `Nijedna verzija nije prešla statistički prag od ${formatNumber(thresholdImpressions)} impresija i ${thresholdClicks} klikova.`;
    return {
      kind: "nedovoljno",
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
      razlog,
      eligibleCount: 0,
      totalCount: versions.length,
      reliableMap,
    };
  }

  // Check how many eligible versions have conversions (results >= 1) and defined costPerResult
  const eligibleWithConversions = eligible.filter(
    (v) =>
      v.results !== undefined &&
      v.results > 0 &&
      v.costPerResult !== undefined &&
      v.costPerResult > 0,
  );

  // Branch 2: At least 2 eligible versions have conversions -> Leader determined by CPA
  if (eligibleWithConversions.length >= 2) {
    // Sort by CPA ascending (lowest cost per conversion wins)
    const sortedByCpa = [...eligibleWithConversions].sort(
      (a, b) => (a.costPerResult as number) - (b.costPerResult as number),
    );

    const leader = sortedByCpa[0];
    const runnerUp = sortedByCpa[1];

    if (leader.costPerResult === undefined || runnerUp.costPerResult === undefined) {
      return {
        kind: "nedovoljno",
        leaderId: null,
        leader: null,
        runnerUp: null,
        criterion: "CPA (Cena po rezultatu)",
        criterionType: "INSUFFICIENT_DATA",
        verdict:
          "Nije moguće doneti odluku po CPA kriterijumu jer jedna od vodećih verzija nema definisan podatak o ceni po konverziji.",
        razlog: "Nedostaje podatak o costPerResult na jednoj od verzija.",
        eligibleCount: eligible.length,
        totalCount: versions.length,
        reliableMap,
      };
    }

    const leaderCpa = leader.costPerResult;
    const runnerUpCpa = runnerUp.costPerResult;

    const leaderCpaFmt = formatMetric(leaderCpa, cpaDef, currencyCode);
    const runnerUpCpaFmt = formatMetric(runnerUpCpa, cpaDef, currencyCode);

    const cpaDiffPct =
      runnerUpCpa > 0
        ? Math.round(((runnerUpCpa - leaderCpa) / runnerUpCpa) * 100)
        : 0;

    const leaderHook = leader.hookRate;
    const runnerUpHook = runnerUp.hookRate;

    const hookMultiplier =
      leaderHook !== undefined && runnerUpHook !== undefined && runnerUpHook > 0
        ? (leaderHook / runnerUpHook).toFixed(1)
        : "1.0";

    let verdict = "";
    if (leaderHook !== undefined && runnerUpHook !== undefined && leaderHook > runnerUpHook) {
      verdict = `${leader.displayName}: ${hookMultiplier}× veći hook rate u odnosu na ${runnerUp.displayName}, CPA ${cpaDiffPct}% niži (${leaderCpaFmt} vs ${runnerUpCpaFmt}).`;
    } else {
      const runnerUpHookText =
        runnerUpHook !== undefined ? formatPercent(runnerUpHook) : "nedovoljno podataka";
      verdict = `${leader.displayName}: Najbolji CPA sa ${leaderCpaFmt} (${cpaDiffPct}% niže od ${runnerUp.displayName}). Iako ${runnerUp.displayName} ima veći Hook Rate (${runnerUpHookText}), ${leader.displayName} ostvaruje jeftinije konverzije.`;
    }

    // Recommendation for severe underperformers
    let recommendation: string | undefined;
    const severeLosers = eligible.filter(
      (v) =>
        v._id !== leader._id &&
        ((v.costPerResult !== undefined &&
          v.costPerResult > leaderCpa * 1.5 &&
          v.costPerResult > 0) ||
          (v.results !== undefined && v.results === 0 && v.spend > leaderCpa * 1.5)),
    );

    if (severeLosers.length > 0) {
      recommendation = `Preporuka: Razmislite o pauziranju verzije ${severeLosers[0].displayName} radi uštede budžeta.`;
    }

    return {
      kind: "odluka",
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
  const eligibleWithHook = eligible.filter((v) => v.hookRate !== undefined);
  if (eligibleWithHook.length > 0) {
    const sortedByHook = [...eligibleWithHook].sort(
      (a, b) => (b.hookRate as number) - (a.hookRate as number),
    );
    const leader = sortedByHook[0];
    const runnerUp = sortedByHook.length > 1 ? sortedByHook[1] : null;

    const leaderHook = leader.hookRate;
    const runnerUpHook = runnerUp?.hookRate;

    const hookMultiplier =
      leaderHook !== undefined && runnerUpHook !== undefined && runnerUpHook > 0
        ? (leaderHook / runnerUpHook).toFixed(1)
        : "1.0";

    let verdict = "";
    const leaderHookText = leaderHook !== undefined ? formatPercent(leaderHook) : "—";
    if (runnerUp && runnerUpHook !== undefined) {
      verdict = `${leader.displayName}: Vodeći hook sa Hook Rate-om od ${leaderHookText} (${hookMultiplier}× iznad ${runnerUp.displayName}). Privlači najviše pažnje u prve 3 sekunde.`;
    } else {
      verdict = `${leader.displayName}: Jedina verzija sa pouzdanim uzorkom (Hook Rate: ${leaderHookText}). Ostale verzije još uvek prikupljaju podatke.`;
    }

    return {
      kind: "odluka",
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

  // Branch 4: Fallback to CTR for non-video / static ads with 0 conversions
  const eligibleWithCtr = eligible.filter((v) => v.ctr !== undefined);
  if (eligibleWithCtr.length > 0) {
    const sortedByCtr = [...eligibleWithCtr].sort((a, b) => b.ctr - a.ctr);
    const leader = sortedByCtr[0];
    const runnerUp = sortedByCtr.length > 1 ? sortedByCtr[1] : null;
    const leaderCtrText = formatPercent(leader.ctr);
    let verdict = "";
    if (runnerUp && runnerUp.ctr !== undefined) {
      const ctrMultiplier =
        runnerUp.ctr > 0 ? (leader.ctr / runnerUp.ctr).toFixed(1) : "1.0";
      verdict = `${leader.displayName}: Vodeći CTR sa ${leaderCtrText} (${ctrMultiplier}× iznad ${runnerUp.displayName}).`;
    } else {
      verdict = `${leader.displayName}: Najveći CTR (${leaderCtrText}).`;
    }

    return {
      kind: "odluka",
      leaderId: leader._id,
      leader,
      runnerUp,
      criterion: "Najveći CTR (statični oglasi / bez video zadržavanja)",
      criterionType: "HOOK_RATE",
      verdict,
      eligibleCount: eligible.length,
      totalCount: versions.length,
      reliableMap,
    };
  }

  return {
    kind: "nedovoljno",
    leaderId: null,
    leader: null,
    runnerUp: null,
    criterion: "Nedovoljno podataka",
    criterionType: "INSUFFICIENT_DATA",
    verdict: "Nijedna verzija nema podatke o video pregledima ili CTR-u.",
    razlog: "Nedostaju metrike za statističko poređenje verzija.",
    eligibleCount: eligible.length,
    totalCount: versions.length,
    reliableMap,
  };
}
