"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { ArrowUpRight, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { CountUp } from "@/components/motion/count-up";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateRange } from "@/components/app/date-range-picker";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import {
  SessionsChart,
  SessionsChartSkeleton,
} from "@/components/app/analytics/sessions-chart";
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
    <div className="flex flex-1 flex-col gap-8">
      {/* Četiri mere koje odlučuju da li je dan dobar: koliko ih je došlo,
          koliko ih je konvertovalo, koliki je organski doseg i koliko je
          automatizacija poslala. Ostalo je niže — ne zato što ne važi, nego
          zato što se ne gleda prvo. */}
      <Reveal>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

          {hasInstagram ? (
            igCur && igPrev && igSeries ? (
              <KpiTile
                label="Instagram doseg"
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
            <UnconnectedTile label="Instagram doseg" providerName="Instagram" />
          )}

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
            <UnconnectedTile
              label="Poslate DM poruke"
              providerName="OpenReply"
            />
          )}
        </div>
      </Reveal>

      {/* Glavni sadržaj ekrana: kretanje sesija i konverzija kroz period. */}
      <Reveal delay={0.05}>
        {!hasGa4 ? (
          <ConnectNotice provider="GA4">
            Kretanje sesija i konverzija kroz period crta se iz Google
            Analytics 4. Bez te veze kontrolna tabla prikazuje samo Instagram i
            OpenReply.
          </ConnectNotice>
        ) : ga4Series === undefined ? (
          <SessionsChartSkeleton />
        ) : (
          <ChartErrorBoundary>
            <SessionsChart data={ga4Series} />
          </ChartErrorBoundary>
        )}
      </Reveal>

      {/* Prateće mere: važe, ali se ne gledaju prve. */}
      <Reveal delay={0.075}>
        <SecondaryStats
          compareLabel={compareLabel}
          items={[
            {
              label: "Aktivni korisnici",
              provider: "GA4",
              connected: hasGa4,
              value: ga4Cur?.activeUsers,
              delta:
                ga4Cur && ga4Prev
                  ? deltaPct(ga4Cur.activeUsers, ga4Prev.activeUsers)
                  : undefined,
            },
            {
              label: "Klikovi na linkove",
              provider: "OpenReply",
              connected: hasOpenReply,
              value: orCur?.linkClicks,
              delta:
                orCur && orPrev
                  ? deltaPct(orCur.linkClicks, orPrev.linkClicks)
                  : undefined,
            },
            {
              label: "Pratioci na Instagramu",
              provider: "Instagram",
              connected: hasInstagram,
              value: igCur?.followersCount,
              delta:
                igCur && igPrev
                  ? deltaPct(igCur.followersCount, igPrev.followersCount)
                  : undefined,
            },
          ]}
        />
      </Reveal>

      {/* Šta je radilo u periodu, i da li su brojevi uopšte sveži. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Reveal delay={0.1} className="lg:col-span-2">
          <PerformanceHighlights
            report={staleReport}
            mediaList={staleMedia}
            hasOpenReply={hasOpenReply}
            hasInstagram={hasInstagram}
            hasGa4={hasGa4}
          />
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-1">
          <SyncHealthWidget entries={syncHealth} connections={connections} />
        </Reveal>
      </div>
    </div>
  );
}

/**
 * Objašnjava ZAŠTO je prazno i šta se povodom toga radi — a ne samo da jeste.
 * Prazan grafikon bez ovoga izgleda kao kvar.
 */
function ConnectNotice({
  provider,
  children,
}: {
  provider: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-soft bg-card/40 px-6 py-12 text-center">
      <div className="flex size-9 items-center justify-center rounded-full border border-line-soft text-text-muted">
        <Unplug className="size-4" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">
        {provider} nije povezan
      </p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-text-muted">
        {children}
      </p>
      <Link
        href="/settings"
        className="mt-4 inline-flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent-400/50 hover:text-accent-400"
      >
        Poveži u Podešavanjima
        <ArrowUpRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}

type SecondaryStat = {
  label: string;
  provider: string;
  connected: boolean;
  value: number | undefined;
  delta: number | null | undefined;
};

/** Jedan red, tri mere, bez sparklinija — drugi nivo, i izgleda tako. */
function SecondaryStats({
  items,
  compareLabel,
}: {
  items: SecondaryStat[];
  compareLabel: string;
}) {
  return (
    <div className="grid grid-cols-1 divide-y divide-line-soft overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
      {items.map((item) => (
        <div key={item.label} className="px-5 py-4">
          <p className="heading-caps text-micro font-medium text-text-muted">
            {item.label}
          </p>
          {!item.connected ? (
            <Link
              href="/settings"
              className="mt-1.5 inline-flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-accent-400"
            >
              {item.provider} nije povezan
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          ) : item.value === undefined ? (
            <Skeleton className="mt-2 h-6 w-24" />
          ) : (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <CountUp
                value={item.value}
                format={formatNumber}
                className="font-mono text-xl font-bold tracking-tight text-foreground"
              />
              <span className="font-mono text-xs tabular-nums text-text-muted">
                {item.delta === null || item.delta === undefined
                  ? "—"
                  : formatSignedPercent(item.delta)}
              </span>
              <span className="text-xs text-text-muted">{compareLabel}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

/** Isti raspored i iste visine kao učitane table — podaci ništa ne pomeraju. */
export function OverviewSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <SessionsChartSkeleton />
      <div className="grid grid-cols-1 divide-y divide-line-soft overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-5 py-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2.5 h-6 w-24" />
          </div>
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
