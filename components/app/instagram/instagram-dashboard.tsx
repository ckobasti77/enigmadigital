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
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import { TimelineChartSkeleton } from "@/components/app/timeline-chart";
import { MetricExplorer } from "./metric-explorer";
import {
  InstagramContentGrid,
  InstagramContentGridSkeleton,
} from "./instagram-content-grid";
import {
  deltaPct,
  fillIgDays,
  summarizeIg,
} from "@/lib/metrics";
import {
  formatNumber,
  formatSignedPercent,
} from "@/lib/format";

/**
 * Instagram Dashboard. Live subscriptions to daily account metrics
 * (followers, reach, profile views, accounts engaged) and recent media.
 */
export function InstagramDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const currentRows = useQuery(api.instagramStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useQuery(api.instagramStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const profileViewsCurrent = useQuery(api.instagramStore.metricSeries, {
    metric: "profile_views",
    from: range.from,
    to: range.to,
  });
  const profileViewsPrevious = useQuery(api.instagramStore.metricSeries, {
    metric: "profile_views",
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawMedia = useQuery(api.instagramStore.mediaList, {
    limit: 30,
  });

  const media = useStale(rawMedia);

  const series = useStale(
    useMemo(
      () =>
        currentRows ? fillIgDays(currentRows, range.from, range.to) : undefined,
      [currentRows, range.from, range.to],
    ),
  );

  const cur = useStale(
    useMemo(
      () => (currentRows ? summarizeIg(currentRows) : undefined),
      [currentRows],
    ),
  );

  const prev = useStale(
    useMemo(
      () => (previousRows ? summarizeIg(previousRows) : undefined),
      [previousRows],
    ),
  );

  const curProfileViews = useMemo(() => {
    if (!profileViewsCurrent) return 0;
    return profileViewsCurrent
      .filter((r) => r.state === "value" && typeof r.value === "number")
      .reduce((sum, r) => sum + (r.value ?? 0), 0);
  }, [profileViewsCurrent]);

  const prevProfileViews = useMemo(() => {
    if (!profileViewsPrevious) return 0;
    return profileViewsPrevious
      .filter((r) => r.state === "value" && typeof r.value === "number")
      .reduce((sum, r) => sum + (r.value ?? 0), 0);
  }, [profileViewsPrevious]);

  // Tri stanja za pločicu pregleda profila: nula i „nema podatka" ne smeju da
  // izgledaju isto. Prebacujemo na potisnuto/nedostupno samo kad Meta to
  // izričito javi — prazan skup ostaje 0, da se ništa ne regresira.
  const profileViewsState = useMemo<{
    state: "value" | "suppressed" | "unavailable";
    reason?: string;
  }>(() => {
    if (!profileViewsCurrent) return { state: "value" };
    if (
      profileViewsCurrent.some(
        (r) => r.state === "value" && typeof r.value === "number",
      )
    ) {
      return { state: "value" };
    }
    const supp = profileViewsCurrent.find((r) => r.state === "suppressed");
    if (supp) return { state: "suppressed", reason: supp.reason };
    const unav = profileViewsCurrent.find((r) => r.state === "unavailable");
    if (unav) return { state: "unavailable", reason: unav.reason };
    return { state: "value" };
  }, [profileViewsCurrent]);

  const profileViewsSpark = useMemo(() => {
    if (!series) return [];
    const byDate = new Map<string, number>();
    if (profileViewsCurrent) {
      for (const r of profileViewsCurrent) {
        if (r.state === "value" && typeof r.value === "number") {
          byDate.set(r.date, r.value);
        }
      }
    }
    return series.map((d) => byDate.get(d.date) ?? 0);
  }, [series, profileViewsCurrent]);

  const igConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "meta_ig");

  const loading =
    connections === undefined ||
    series === undefined ||
    cur === undefined ||
    prev === undefined ||
    media === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  return (
    <div className="flex flex-1 flex-col gap-8">
      {/* Stoji iznad svega i van <Reveal>-a: ovo nije podatak koji se otkriva
          sa ekranom nego stanje koje objašnjava zašto podaci kasne. */}
      <RateLimitBanner network="Instagram" />

      {!igConnected ? (
        <EmptyState icon={Unplug}>
          Instagram još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <InstagramDashboardSkeleton />
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <KpiTile
                label="Pratioci"
                primary
                value={cur.followersCount}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.followersCount, prev.followersCount),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.followersCount)}
              />
              <KpiTile
                label="Reach (Doseg)"
                value={cur.reach}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.reach, prev.reach),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.reach)}
              />
              <KpiTile
                label="Pregledi profila"
                value={curProfileViews}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(curProfileViews, prevProfileViews),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={profileViewsSpark}
                state={profileViewsState.state}
                reason={profileViewsState.reason}
              />
              <KpiTile
                label="Ukupno interakcija"
                value={cur.totalInteractions}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.totalInteractions, prev.totalInteractions),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.totalInteractions)}
              />
              <KpiTile
                label="Angažovani nalozi"
                value={cur.accountsEngaged}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.accountsEngaged, prev.accountsEngaged),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.accountsEngaged)}
              />
            </div>
          </Reveal>

          {cur.reach === 0 && cur.followersCount === 0 && media.length === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Istorija seže 90 dana unazad od
              prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.05}>
                <ChartErrorBoundary>
                  <MetricExplorer
                    from={range.from}
                    to={range.to}
                    dates={series.map((d) => d.date)}
                    followers={series.map((d) => d.followersCount)}
                  />
                </ChartErrorBoundary>
              </Reveal>

              <Reveal delay={0.1}>
                <InstagramContentGrid media={media} />
              </Reveal>
            </>
          )}
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

export function InstagramDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <TimelineChartSkeleton topLabelWidth="w-32" bottomPanel={false} />
      <InstagramContentGridSkeleton />
    </>
  );
}
