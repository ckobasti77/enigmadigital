"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChartNoAxesColumn, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/empty-state";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { KpiTile, KpiTileSkeleton } from "./kpi-tile";
import { SessionsChart, SessionsChartSkeleton } from "./sessions-chart";
import { TrafficTable, TrafficTableSkeleton } from "./traffic-table";
import { DataQualityNotice } from "./data-quality-notice";
import { metricFormat } from "./metric-state";
import {
  computeSessionKeyEventRate,
  computeUserKeyEventRate,
} from "@/convex/lib/ga4Catalog";
import { deltaPct, deltaPp, fillDays, summarize } from "@/lib/metrics";
import { Info } from "lucide-react";
import {
  formatNumber,
  formatPercent,
  formatSeconds,
  formatSignedPercent,
  formatSignedPp,
} from "@/lib/format";

/**
 * Analytics (GA4). Three live subscriptions: current period, previous equal
 * period (deltas), traffic breakdown, plus report metadata for data quality.
 * Every derived number is computed in `lib/metrics.ts` so it can be checked
 * by hand against the raw rows.
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
  const reportMeta = useStale(
    useQuery(api.analytics.reportMeta, { reportKey: "daily" }),
  );
  const ga4Config = useStale(useQuery(api.analytics.ga4Configuration));

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

  const isShortRetention =
    ga4Config?.eventDataRetention === "TWO_MONTHS" && range.days > 60;

  // F1: stope ključnih događaja — dosad mrtve funkcije. Kad nema imenioca
  // (sesija/korisnika), stanje je „unavailable" → pločica pokazuje „—", ne 0%.
  const sessionRate = computeSessionKeyEventRate(cur?.keyEvents, cur?.sessions);
  const userRate = computeUserKeyEventRate(cur?.keyEvents, cur?.totalUsers);
  const prevSessionRate = computeSessionKeyEventRate(
    prev?.keyEvents,
    prev?.sessions,
  );
  const prevUserRate = computeUserKeyEventRate(prev?.keyEvents, prev?.totalUsers);
  const sessionRateSpark =
    series?.map((d) => {
      const r = computeSessionKeyEventRate(d.keyEvents, d.sessions);
      return r.state === "value" ? r.value : undefined;
    }) ?? [];
  const userRateSpark =
    series?.map((d) => {
      const r = computeUserKeyEventRate(d.keyEvents, d.totalUsers);
      return r.state === "value" ? r.value : undefined;
    }) ?? [];

  return (
    <div className="flex flex-1 flex-col gap-8">
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
          {/* Retention period notice if range exceeds retention setting */}
          {isShortRetention && (
            <Reveal>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised/40 p-4 text-xs text-text-muted">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-text-muted" />
                  <span>
                    Period čuvanja podataka u GA4 je podešen na 2 meseca
                    (TWO_MONTHS), što je kraće od izabranog raspona od{" "}
                    {range.days} dana.
                  </span>
                </div>
                <Link
                  href="/settings"
                  className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Podešavanja
                </Link>
              </div>
            </Reveal>
          )}

          {/* 10 KPI pločica u 2 reda po 5 (poslednje dve su F1 stope) */}
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {/* 1. Korisnici */}
              <KpiTile
                label="Korisnici"
                value={cur.totalUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.totalUsers, prev.totalUsers),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.totalUsers)}
              />

              {/* 2. Novi korisnici */}
              <KpiTile
                label="Novi korisnici"
                value={cur.newUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.newUsers, prev.newUsers),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.newUsers)}
              />

              {/* 3. Sesije */}
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

              {/* 4. Angažovane sesije */}
              <KpiTile
                label="Angažovane sesije"
                value={cur.engagedSessions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.engagedSessions, prev.engagedSessions),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.engagedSessions)}
              />

              {/* 5. Stopa angažovanja */}
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

              {/* 6. Pregledi stranica */}
              <KpiTile
                label="Pregledi stranica"
                value={cur.screenPageViews}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.screenPageViews, prev.screenPageViews),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.screenPageViews)}
              />

              {/* 7. Prosečno vreme angažovanja po sesiji */}
              <KpiTile
                label="Prosečno vreme angažovanja po sesiji"
                value={cur.avgEngagementDurationPerSession}
                format={formatSeconds}
                delta={{
                  kind: "pct",
                  value: deltaPct(
                    cur.avgEngagementDurationPerSession,
                    prev.avgEngagementDurationPerSession,
                  ),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.avgEngagementDurationPerSession)}
              />

              {/* 8. Ključni događaji */}
              <KpiTile
                label="Ključni događaji"
                value={cur.keyEvents}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.keyEvents, prev.keyEvents),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.keyEvents)}
              />

              {/* 9. F1 — stopa ključnih događaja po sesiji */}
              <KpiTile
                label="Stopa klj. događaja / sesiji"
                value={sessionRate.value}
                state={sessionRate.state === "value" ? "value" : "unavailable"}
                reason="Za ovu stopu nema sesija u periodu."
                format={metricFormat("sessionKeyEventRate")}
                delta={{
                  kind: "pp",
                  value:
                    sessionRate.state === "value" &&
                    prevSessionRate.state === "value"
                      ? deltaPp(sessionRate.value ?? 0, prevSessionRate.value ?? 0)
                      : null,
                }}
                formatDelta={formatSignedPp}
                compareLabel={compareLabel}
                spark={sessionRateSpark}
              />

              {/* 10. F1 — stopa ključnih događaja po korisniku */}
              <KpiTile
                label="Stopa klj. događaja / korisniku"
                value={userRate.value}
                state={userRate.state === "value" ? "value" : "unavailable"}
                reason="Za ovu stopu nema korisnika u periodu."
                format={metricFormat("userKeyEventRate")}
                delta={{
                  kind: "pp",
                  value:
                    userRate.state === "value" && prevUserRate.state === "value"
                      ? deltaPp(userRate.value ?? 0, prevUserRate.value ?? 0)
                      : null,
                }}
                formatDelta={formatSignedPp}
                compareLabel={compareLabel}
                spark={userRateSpark}
              />
            </div>
          </Reveal>

          {cur.sessions === 0 && cur.keyEvents === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Istorija seže 90 dana unazad od
              prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.05}>
                <ChartErrorBoundary>
                  <SessionsChart data={series} />
                </ChartErrorBoundary>
              </Reveal>

              {/* Data quality notice & timezone footer */}
              <Reveal delay={0.075}>
                <DataQualityNotice meta={reportMeta} />
              </Reveal>

              <Reveal delay={0.1}>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <SessionsChartSkeleton />
      <TrafficTableSkeleton />
    </>
  );
}
