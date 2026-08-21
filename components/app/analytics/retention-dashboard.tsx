"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Info,
  Layers,
  LineChart as LineChartIcon,
  Percent,
  Unplug,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion/reveal";
import { EmptyState } from "@/components/app/empty-state";
import { formatNumber, formatPercent } from "@/lib/format";

const CHART_COLORS = [
  "var(--color-chart-1, #3b82f6)",
  "var(--color-chart-2, #10b981)",
  "var(--color-chart-3, #f59e0b)",
  "var(--color-chart-4, #8b5cf6)",
  "var(--color-chart-5, #ec4899)",
  "var(--color-chart-6, #06b6d4)",
];

export function RetentionDashboard() {
  const connections = useQuery(api.connections.list);
  const data = useQuery(api.analytics.cohortRetention, { granularity: "WEEKLY" });

  const [selectedCohortNames] = useState<string[]>([]);

  const hasGa4 = Boolean(
    connections?.some((c) => c.provider === "ga4" && c.status === "active"),
  );

  const cohorts = useMemo(() => data?.cohorts ?? [], [data?.cohorts]);

  // Default to selecting top 5 recent cohorts if none explicitly selected
  const activeCohorts = useMemo(() => {
    if (selectedCohortNames.length > 0) {
      return cohorts.filter((c) => selectedCohortNames.includes(c.cohortName));
    }
    // Take last 5 cohorts
    return cohorts.slice(-5);
  }, [cohorts, selectedCohortNames]);

  // Average W1 & W4 Retention across all cohorts with valid data
  const { avgW1, avgW4, totalTrackedUsers } = useMemo(() => {
    let sumW1 = 0;
    let countW1 = 0;
    let sumW4 = 0;
    let countW4 = 0;
    let totalUsers = 0;

    for (const c of cohorts) {
      if (c.totalUsers) totalUsers += c.totalUsers;

      const p1 = c.points.find((p) => p.nth === 1);
      if (p1?.retention !== undefined && p1.state === "value") {
        sumW1 += p1.retention;
        countW1++;
      }

      const p4 = c.points.find((p) => p.nth === 4);
      if (p4?.retention !== undefined && p4.state === "value") {
        sumW4 += p4.retention;
        countW4++;
      }
    }

    return {
      avgW1: countW1 > 0 ? sumW1 / countW1 : 0,
      avgW4: countW4 > 0 ? sumW4 / countW4 : 0,
      totalTrackedUsers: totalUsers,
    };
  }, [cohorts]);

  if (connections !== undefined && !hasGa4) {
    return (
      <EmptyState icon={Unplug}>
        Google Analytics nije povezan. Povežite GA4 nalog sa JSON ključem servisnog naloga u{" "}
        <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">
          Podešavanjima
        </Link>{" "}
        da biste pratili kohortnu retenciju posetilaca.
      </EmptyState>
    );
  }

  if (data === undefined) {
    return <RetentionDashboardSkeleton />;
  }

  if (cohorts.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center shadow-card ring-line">
        <Layers className="h-10 w-10 text-muted-foreground/60 mb-3" />
        <h3 className="text-base font-semibold text-foreground">
          Nema podataka o kohortama
        </h3>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Kohortni podaci se osvežavaju automatski jednom dnevno tokom redovne GA4 sinhronizacije. Ukoliko je nalog tek povezan, podaci će biti dostupni nakon sledeće sinhronizacije.
        </p>
      </Card>
    );
  }

  const weeks = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="flex flex-col gap-8">
      {/* Quality Notice if thresholded rows exist */}
      {data.thresholdedCount > 0 && (
        <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-200">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex flex-col gap-1 text-xs">
            <p className="font-semibold">Privatnost i pragovi (Thresholding)</p>
            <p>
              Google je primenio pragove privatnosti na {data.thresholdedCount} kohortnih tačaka zbog malog broja korisnika. Ćelije označene zvezdicom (*) predstavljaju zaštićene vrednosti.
            </p>
          </div>
        </Card>
      )}

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Reveal delay={0.05}>
          <Card className="flex flex-col gap-2 p-5 shadow-card ring-line">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prosečna retencija (1. nedelja)
              </span>
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tracking-tight text-foreground">
                {formatPercent(avgW1)}
              </span>
              <span className="text-xs text-muted-foreground">nakon 7 dana</span>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.1}>
          <Card className="flex flex-col gap-2 p-5 shadow-card ring-line">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Prosečna retencija (4. nedelja)
              </span>
              <Percent className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tracking-tight text-foreground">
                {formatPercent(avgW4)}
              </span>
              <span className="text-xs text-muted-foreground">nakon 28 dana</span>
            </div>
          </Card>
        </Reveal>

        <Reveal delay={0.15}>
          <Card className="flex flex-col gap-2 p-5 shadow-card ring-line">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ukupno novih korisnika
              </span>
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tracking-tight text-foreground">
                {formatNumber(totalTrackedUsers)}
              </span>
              <span className="text-xs text-muted-foreground">u 12 kohorti</span>
            </div>
          </Card>
        </Reveal>
      </div>

      {/* Cohort Line Chart (Retention Curves) */}
      <Reveal delay={0.2}>
        <Card className="flex flex-col gap-5 p-6 shadow-card ring-line">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">
                  Krive zadržavanja korisnika (Retencija)
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Procenat korisnika koji su se vratili na sajt po nedeljama nakon prve posete.
              </p>
            </div>

            {/* Legend for active cohorts */}
            <div className="flex flex-wrap items-center gap-3">
              {activeCohorts.map((c, idx) => {
                const color = CHART_COLORS[idx % CHART_COLORS.length];
                return (
                  <div key={c.cohortName} className="flex items-center gap-1.5 text-xs font-mono">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-foreground">{c.cohortStartDate}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SVG Multi-Line Chart */}
          <div className="relative flex h-64 w-full flex-col justify-end pt-4">
            <svg className="h-full w-full overflow-visible" viewBox="0 0 500 200" preserveAspectRatio="none">
              {/* Horizontal Grid lines at 0%, 25%, 50%, 75%, 100% */}
              {[0, 25, 50, 75, 100].map((pct) => {
                const y = 200 - (pct / 100) * 190;
                return (
                  <g key={pct}>
                    <line
                      x1="0"
                      y1={y}
                      x2="500"
                      y2={y}
                      stroke="currentColor"
                      className="text-line/40"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y={y - 4}
                      className="fill-muted-foreground text-[9px] font-mono"
                    >
                      {pct}%
                    </text>
                  </g>
                );
              })}

              {/* Render lines for active cohorts */}
              {activeCohorts.map((c, idx) => {
                const color = CHART_COLORS[idx % CHART_COLORS.length];
                const points = c.points.filter((p) => p.retention !== undefined);
                if (points.length === 0) return null;

                const pathCoords = points.map((p) => {
                  const x = (p.nth / 11) * 500;
                  const retPct = Math.min(1, Math.max(0, p.retention ?? 0));
                  const y = 200 - retPct * 190;
                  return `${x},${y}`;
                });

                const pathData = `M ${pathCoords.join(" L ")}`;

                return (
                  <g key={c.cohortName}>
                    <path
                      d={pathData}
                      fill="none"
                      stroke={color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all duration-300 hover:stroke-[3.5]"
                    />
                    {points.map((p) => {
                      const cx = (p.nth / 11) * 500;
                      const cy = 200 - Math.min(1, Math.max(0, p.retention ?? 0)) * 190;
                      return (
                        <circle
                          key={p.nth}
                          cx={cx}
                          cy={cy}
                          r="3.5"
                          fill={color}
                          stroke="var(--background, #fff)"
                          strokeWidth="1.5"
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* X-axis week indicators */}
            <div className="flex justify-between border-t border-line/60 pt-2 font-mono text-[10px] text-muted-foreground">
              {weeks.map((w) => (
                <span key={w}>Ned {w}</span>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>

      {/* Triangular Heatmap Retention Table */}
      <Reveal delay={0.25}>
        <Card className="flex flex-col overflow-hidden shadow-card ring-line">
          <div className="flex flex-col gap-1 border-b border-line px-6 py-4">
            <h3 className="text-sm font-semibold text-foreground">
              Kohortna matrica (Nedeljni pregled)
            </h3>
            <p className="text-xs text-muted-foreground">
              Svaki red predstavlja kohortu korisnika čija je prva sesija zabeležena u toj nedelji. Vrednosti u ćelijama prikazuju procenat i broj povratnih korisnika.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-line bg-muted/40 text-[11px] text-muted-foreground">
                  <th className="py-3 pl-6 pr-3 font-semibold uppercase tracking-wider">
                    Kohorta (Početak)
                  </th>
                  <th className="py-3 px-3 text-right font-semibold uppercase tracking-wider">
                    Korisnici
                  </th>
                  {weeks.map((w) => (
                    <th
                      key={w}
                      className="py-3 px-2 text-center font-semibold uppercase tracking-wider w-16"
                    >
                      Ned {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {cohorts.map((cohort) => {
                  const pointsMap = new Map(cohort.points.map((p) => [p.nth, p]));

                  return (
                    <tr
                      key={cohort.cohortName}
                      className="transition-colors hover:bg-muted/20"
                    >
                      {/* Cohort start date */}
                      <td className="py-2.5 pl-6 pr-3 font-medium text-foreground whitespace-nowrap">
                        {cohort.cohortStartDate}
                      </td>

                      {/* Total Users in cohort */}
                      <td className="py-2.5 px-3 text-right font-semibold text-foreground whitespace-nowrap">
                        {formatNumber(cohort.totalUsers ?? 0)}
                      </td>

                      {/* 12 Weekly Retention Cells */}
                      {weeks.map((w) => {
                        const point = pointsMap.get(w);

                        if (!point) {
                          return (
                            <td
                              key={w}
                              className="py-2.5 px-2 text-center text-muted-foreground/30 font-normal"
                            >
                              —
                            </td>
                          );
                        }

                        if (w === 0) {
                          // Week 0 is always 100%
                          return (
                            <td
                              key={w}
                              className="py-2.5 px-2 text-center font-semibold text-primary bg-primary/10"
                            >
                              100%
                            </td>
                          );
                        }

                        const ret = point.retention;
                        const isThresholded = point.state === "thresholded";

                        if (ret === undefined) {
                          return (
                            <td
                              key={w}
                              className="py-2.5 px-2 text-center text-muted-foreground font-normal"
                            >
                              {isThresholded ? "*" : "—"}
                            </td>
                          );
                        }

                        // Calculate opacity intensity based on retention percentage (e.g. 0% -> 0.05, 30% -> 0.6)
                        const opacity = Math.min(0.7, Math.max(0.08, ret * 2));

                        return (
                          <td
                            key={w}
                            className="py-2.5 px-2 text-center font-medium tabular-nums transition-colors"
                            style={{
                              backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                            }}
                            title={`Nedelja ${w}: ${formatPercent(ret)} (${point.activeUsers ?? 0} korisnika)`}
                          >
                            <span className="text-foreground">
                              {formatPercent(ret)}
                              {isThresholded && <sup className="text-amber-500">*</sup>}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </Reveal>

      {/* Cohort Methodology Info Footer */}
      <Card className="flex items-start gap-3 border-line/70 bg-muted/20 p-4 text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="flex flex-col gap-1 text-xs leading-relaxed">
          <p className="font-medium text-foreground">
            Metodologija kohortne analize i retencije
          </p>
          <p>
            Kohorte se formiraju na osnovu dimenzije <code>firstSessionDate</code> (datum prvog dolaska korisnika). Stopa retencije se izračunava u letu kao udeo aktivnih korisnika u datoj nedelji u odnosu na ukupan broj korisnika te kohorte. Prazne ćelije (—) označavaju nedelje koje još uvek nisu protekle od početka kohorte.
          </p>
        </div>
      </Card>
    </div>
  );
}

export function RetentionDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
      <Card className="p-6">
        <Skeleton className="h-6 w-48 rounded mb-4" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </Card>
      <Card className="p-6">
        <Skeleton className="h-6 w-48 rounded mb-4" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </Card>
    </div>
  );
}
