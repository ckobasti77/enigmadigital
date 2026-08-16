"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { DateRangePicker, useDateRange } from "@/components/app/date-range-picker";
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import { UnconnectedTile } from "./unconnected-tile";
import {
  PerformanceHighlights,
  PerformanceHighlightsSkeleton,
} from "./performance-highlights";
import {
  SyncHealthWidget,
  SyncHealthWidgetSkeleton,
} from "./sync-health-widget";
import {
  deltaPct,
  fillDays,
  fillIgDays,
  fillOrDays,
  summarize,
  summarizeIg,
  summarizeOr,
} from "@/lib/metrics";
import { formatNumber, formatSignedPercent } from "@/lib/format";

export function OverviewDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);
  const syncHealth = useQuery(api.sync.health);

  // ── GA4 Queries ──────────────────────────────────────────────────────────
  const ga4Current = useQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const ga4Previous = useQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  // ── Instagram Queries ───────────────────────────────────────────────────
  const igCurrent = useQuery(api.instagramStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const igPrevious = useQuery(api.instagramStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const igMedia = useQuery(api.instagramStore.mediaList, {
    limit: 50,
  });

  // ── OpenReply Queries ───────────────────────────────────────────────────
  const orCurrent = useQuery(api.openreplyStore.daily, {
    from: range.from,
    to: range.to,
  });
  const orPrevious = useQuery(api.openreplyStore.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  // ── Attribution Report ──────────────────────────────────────────────────
  const attributionReport = useQuery(api.attribution.report, {
    from: range.from,
    to: range.to,
  });

  // ── Stale-while-loading caches ──────────────────────────────────────────
  const staleReport = useStale(attributionReport);
  const staleMedia = useStale(igMedia);

  const ga4Series = useStale(
    useMemo(
      () => (ga4Current ? fillDays(ga4Current, range.from, range.to) : undefined),
      [ga4Current, range.from, range.to],
    ),
  );
  const ga4Cur = useStale(
    useMemo(() => (ga4Current ? summarize(ga4Current) : undefined), [ga4Current]),
  );
  const ga4Prev = useStale(
    useMemo(() => (ga4Previous ? summarize(ga4Previous) : undefined), [ga4Previous]),
  );

  const igSeries = useStale(
    useMemo(
      () => (igCurrent ? fillIgDays(igCurrent, range.from, range.to) : undefined),
      [igCurrent, range.from, range.to],
    ),
  );
  const igCur = useStale(
    useMemo(() => (igCurrent ? summarizeIg(igCurrent) : undefined), [igCurrent]),
  );
  const igPrev = useStale(
    useMemo(() => (igPrevious ? summarizeIg(igPrevious) : undefined), [igPrevious]),
  );

  const orSeries = useStale(
    useMemo(
      () => (orCurrent ? fillOrDays(orCurrent, range.from, range.to) : undefined),
      [orCurrent, range.from, range.to],
    ),
  );
  const orCur = useStale(
    useMemo(() => (orCurrent ? summarizeOr(orCurrent) : undefined), [orCurrent]),
  );
  const orPrev = useStale(
    useMemo(() => (orPrevious ? summarizeOr(orPrevious) : undefined), [orPrevious]),
  );

  // Connection active states
  const hasGa4 =
    connections !== undefined &&
    connections.some((c) => c.provider === "ga4" && c.status === "active");
  const hasInstagram =
    connections !== undefined &&
    connections.some((c) => c.provider === "meta_ig" && c.status === "active");
  const hasOpenReply =
    connections !== undefined &&
    connections.some((c) => c.provider === "openreply" && c.status === "active");

  const isInitialLoading = connections === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  if (isInitialLoading) {
    return <OverviewSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <DateRangePicker />

      {/* ── Top Strip: 5 KPI Tiles ──────────────────────────────────────── */}
      <Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. GA4 Sessions */}
          {hasGa4 ? (
            ga4Cur && ga4Prev && ga4Series ? (
              <KpiTile
                label="Sesije"
                primary
                value={ga4Cur.sessions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(ga4Cur.sessions, ga4Prev.sessions),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={ga4Series.map((d) => d.sessions)}
              />
            ) : (
              <KpiTileSkeleton />
            )
          ) : (
            <UnconnectedTile label="Sesije" providerName="GA4" />
          )}

          {/* 2. Instagram Reach */}
          {hasInstagram ? (
            igCur && igPrev && igSeries ? (
              <KpiTile
                label="IG Reach"
                value={igCur.reach}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(igCur.reach, igPrev.reach),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={igSeries.map((d) => d.reach)}
              />
            ) : (
              <KpiTileSkeleton />
            )
          ) : (
            <UnconnectedTile label="IG Reach" providerName="Instagram" />
          )}

          {/* 3. OpenReply DMs Sent */}
          {hasOpenReply ? (
            orCur && orPrev && orSeries ? (
              <KpiTile
                label="Poslate DM poruke"
                value={orCur.dmsSent}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(orCur.dmsSent, orPrev.dmsSent),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={orSeries.map((d) => d.dmsSent)}
              />
            ) : (
              <KpiTileSkeleton />
            )
          ) : (
            <UnconnectedTile label="Poslate DM poruke" providerName="OpenReply" />
          )}

          {/* 4. OpenReply Link Clicks */}
          {hasOpenReply ? (
            orCur && orPrev && orSeries ? (
              <KpiTile
                label="Klikovi na linkove"
                value={orCur.linkClicks}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(orCur.linkClicks, orPrev.linkClicks),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={orSeries.map((d) => d.linkClicks)}
              />
            ) : (
              <KpiTileSkeleton />
            )
          ) : (
            <UnconnectedTile label="Klikovi na linkove" providerName="OpenReply" />
          )}

          {/* 5. GA4 Conversions */}
          {hasGa4 ? (
            ga4Cur && ga4Prev && ga4Series ? (
              <KpiTile
                label="Konverzije"
                value={ga4Cur.conversions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(ga4Cur.conversions, ga4Prev.conversions),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={ga4Series.map((d) => d.conversions)}
              />
            ) : (
              <KpiTileSkeleton />
            )
          ) : (
            <UnconnectedTile label="Konverzije" providerName="GA4" />
          )}
        </div>
      </Reveal>

      {/* ── Middle Cockpit Grid: Šta radi + Sync Health ─────────────────── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 'Šta radi' panel (2/3 width on wide screen) */}
        <Reveal delay={0.08} className="lg:col-span-2">
          <PerformanceHighlights
            report={staleReport}
            mediaList={staleMedia}
            hasOpenReply={hasOpenReply}
            hasInstagram={hasInstagram}
            hasGa4={hasGa4}
          />
        </Reveal>

        {/* Sync Health Summary (1/3 width on wide screen) */}
        <Reveal delay={0.16} className="lg:col-span-1">
          <SyncHealthWidget
            entries={syncHealth}
            connections={connections}
          />
        </Reveal>
      </div>
    </div>
  );
}

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

export function OverviewSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="h-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceHighlightsSkeleton />
        </div>
        <div className="lg:col-span-1">
          <SyncHealthWidgetSkeleton />
        </div>
      </div>
    </div>
  );
}
