"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChartNoAxesColumn, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { DateRangePicker, useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { KpiTile, KpiTileSkeleton } from "./kpi-tile";
import { SessionsChart, SessionsChartSkeleton } from "./sessions-chart";
import { TrafficTable, TrafficTableSkeleton } from "./traffic-table";
import { deltaPct, deltaPp, fillDays, summarize } from "@/lib/metrics";
import {
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatSignedPp,
} from "@/lib/format";

/**
 * Analytics (GA4). Three live subscriptions: current period, previous equal
 * period (deltas), traffic breakdown. Every derived number is computed in
 * `lib/metrics.ts` so it can be checked by hand against the raw rows.
 */
export function AnalyticsDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);
  // Stale-while-loading: switching the range keeps the last numbers on screen
  // (the tiles tween to the new ones) instead of flashing skeletons.
  const currentRows = useQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const traffic = useStale(
    useQuery(api.analytics.traffic, { from: range.from, to: range.to }),
  );

  // Series is derived together with the range it was fetched for, so a stale
  // frame never zero-fills old rows into a new window.
  const series = useStale(
    useMemo(
      () =>
        currentRows ? fillDays(currentRows, range.from, range.to) : undefined,
      [currentRows, range.from, range.to],
    ),
  );
  const cur = useStale(
    useMemo(() => (currentRows ? summarize(currentRows) : undefined), [currentRows]),
  );
  const prev = useStale(
    useMemo(
      () => (previousRows ? summarize(previousRows) : undefined),
      [previousRows],
    ),
  );

  const ga4Connected =
    connections === undefined ||
    connections.some((c) => c.provider === "ga4");
  const loading =
    connections === undefined ||
    series === undefined ||
    cur === undefined ||
    prev === undefined ||
    traffic === undefined;
  const compareLabel = `vs prethodnih ${range.days} d`;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <DateRangePicker />

      {!ga4Connected ? (
        <EmptyState icon={Unplug}>
          GA4 još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Sesije"
                primary
                value={cur.sessions}
                format={formatNumber}
                delta={{ kind: "pct", value: deltaPct(cur.sessions, prev.sessions) }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.sessions)}
              />
              <KpiTile
                label="Aktivni korisnici"
                value={cur.activeUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.activeUsers, prev.activeUsers),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.activeUsers)}
              />
              <KpiTile
                label="Konverzije"
                value={cur.conversions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.conversions, prev.conversions),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.conversions)}
              />
              <KpiTile
                label="Stopa angažovanja"
                value={cur.engagementRate}
                format={formatPercent}
                delta={{
                  kind: "pp",
                  value: deltaPp(cur.engagementRate, prev.engagementRate),
                }}
                formatDelta={formatSignedPp}
                compareLabel={compareLabel}
                spark={series.map((d) => d.engagementRate)}
              />
            </div>
          </Reveal>

          {cur.sessions === 0 && cur.conversions === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Istorija seže 90 dana unazad od
              prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.08}>
                <SessionsChart data={series} />
              </Reveal>

              <Reveal delay={0.16}>
                <TrafficTable traffic={traffic} />
              </Reveal>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Latest defined value — `undefined` (query in flight) keeps the previous one. */
function useStale<T>(value: T | undefined): T | undefined {
  // Render-time state update (React's "derive from previous props" pattern);
  // no effect, so there is never a frame that renders `undefined` in between.
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

/** Same grid + heights as the loaded state — data arriving must not shift. */
export function DashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <SessionsChartSkeleton />
      <TrafficTableSkeleton />
    </>
  );
}
