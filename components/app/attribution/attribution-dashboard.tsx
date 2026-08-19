"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { Unplug, AlertTriangle, CheckCircle2, MousePointerClick } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { DateRangePicker, useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { FunnelTable, FunnelTableSkeleton } from "./funnel-table";
import {
  InstagramBreakdown,
  InstagramBreakdownSkeleton,
} from "./instagram-breakdown";
import { formatNumber, formatPercent } from "@/lib/format";

export function AttributionDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const rawReport = useQuery(api.attribution.report, {
    from: range.from,
    to: range.to,
  });

  const report = useStale(rawReport);

  const hasGa4 =
    connections === undefined ||
    connections.some((c) => c.provider === "ga4" && c.status === "active");
  const hasOr =
    connections === undefined ||
    connections.some((c) => c.provider === "openreply" && c.status === "active");

  const loading = connections === undefined || report === undefined;

  const mismatchCount =
    report?.campaigns.filter((c) => c.hasMismatch).length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <DateRangePicker />

      {!hasGa4 && !hasOr ? (
        <EmptyState icon={Unplug}>
          GA4 i OpenReply integracije još nisu povezane.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ih u podešavanjima
          </Link>{" "}
          kako bi se aktivirala UTM atribucija.
        </EmptyState>
      ) : loading ? (
        <AttributionDashboardSkeleton />
      ) : (
        <>
          {/* Top KPI row */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {/* OpenReply Sessions */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-xs font-medium text-text-muted">
                    OpenReply GA4 sesije
                  </p>
                  <AnimatedNumber
                    value={report.totals.openreply.sessions}
                    format={formatNumber}
                    className="mt-2 block text-2xl font-bold leading-none tracking-tight text-accent-400 sm:text-3xl"
                  />
                  <div className="mt-2 flex items-baseline gap-1.5 text-xs text-text-muted">
                    <span className="font-mono tabular-nums text-foreground">
                      {formatPercent(report.totals.openreplyShareOfIgSessions)}
                    </span>
                    <span>od ukupnog IG saobraćaja</span>
                  </div>
                  <div className="mt-auto mb-3 flex items-center gap-1.5 text-micro text-text-muted">
                    <MousePointerClick className="size-3 text-accent-400" />
                    <span>
                      {formatNumber(report.totals.openreply.linkClicks)} link klikova
                    </span>
                  </div>
                </div>
              </Card>

              {/* OpenReply Conversions */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-xs font-medium text-text-muted">
                    OpenReply konverzije
                  </p>
                  <AnimatedNumber
                    value={report.totals.openreply.conversions}
                    format={formatNumber}
                    className="mt-2 block text-2xl font-bold leading-none tracking-tight text-foreground sm:text-3xl"
                  />
                  <div className="mt-2 flex items-baseline gap-1.5 text-xs text-text-muted">
                    <span className="font-mono tabular-nums text-success">
                      {formatPercent(report.totals.openreply.conversionRate)}
                    </span>
                    <span>stopa sesija → konverzija</span>
                  </div>
                  <div className="mt-auto mb-3 text-micro text-text-muted">
                    <span className="font-mono tabular-nums text-foreground">
                      {formatPercent(report.totals.openreplyShareOfIgConversions)}
                    </span>{" "}
                    svih IG konverzija
                  </div>
                </div>
              </Card>

              {/* Total Instagram Traffic */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-xs font-medium text-text-muted">
                    Ukupno Instagram sesija
                  </p>
                  <AnimatedNumber
                    value={report.totals.totalInstagram.sessions}
                    format={formatNumber}
                    className="mt-2 block text-2xl font-bold leading-none tracking-tight text-foreground sm:text-3xl"
                  />
                  <div className="mt-2 flex items-baseline gap-1.5 text-xs text-text-muted">
                    <span className="font-mono tabular-nums text-accent-400">
                      {formatNumber(report.totals.totalInstagram.conversions)}
                    </span>
                    <span>ukupnih konverzija sa IG</span>
                  </div>
                  <div className="mt-auto mb-3 text-micro text-text-muted">
                    Bio: {formatNumber(report.totals.bio.sessions)} · Story:{" "}
                    {formatNumber(report.totals.story.sessions)}
                  </div>
                </div>
              </Card>

              {/* UTM Match Status / Data Honesty */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-xs font-medium text-text-muted">
                    UTM Integritet
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {mismatchCount > 0 ? (
                      <>
                        <AlertTriangle className="size-6 text-warning" />
                        <span className="font-mono text-2xl font-bold leading-none tracking-tight text-warning sm:text-3xl tabular-nums">
                          {mismatchCount}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-6 text-success" />
                        <span className="font-mono text-2xl font-bold leading-none tracking-tight text-success sm:text-3xl">
                          100%
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-text-muted">
                    {mismatchCount > 0
                      ? `${mismatchCount} ${
                          mismatchCount === 1
                            ? "kampanja ima"
                            : mismatchCount >= 2 && mismatchCount <= 4
                              ? "kampanje imaju"
                              : "kampanja ima"
                        } klikove bez GA4 sesija`
                      : "Sve kampanje sa klikovima beleže sesije"}
                  </div>
                  <div className="mt-auto mb-3 text-micro text-text-muted font-mono">
                    utm_medium=openreply-dm
                  </div>
                </div>
              </Card>
            </div>
          </Reveal>

          {/* Main Funnel Table */}
          <Reveal delay={0.08}>
            <FunnelTable campaigns={report.campaigns} />
          </Reveal>

          {/* Instagram Channel Breakdown */}
          <Reveal delay={0.16}>
            <InstagramBreakdown
              totals={report.totals}
              unmatchedGa4={report.unmatchedGa4}
            />
          </Reveal>
        </>
      )}
    </div>
  );
}

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

export function AttributionDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="gap-0 py-0 shadow-card ring-line" size="sm">
            <div className="flex h-36 flex-col px-5 pt-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-8 w-28" />
              <Skeleton className="mt-3 h-3 w-32" />
              <Skeleton className="mt-auto mb-3 h-3 w-40" />
            </div>
          </Card>
        ))}
      </div>
      <FunnelTableSkeleton />
      <InstagramBreakdownSkeleton />
    </>
  );
}
