"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { Activity, ChartNoAxesColumn, Info, Radio, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useDateRange } from "@/components/app/date-range-picker";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { EmptyState } from "@/components/app/system/empty-state";
import { KpiTile, KpiTileSkeleton } from "@/components/app/system/kpi-tile";
import { Button } from "@/components/ui/button";
import { SessionsChart, SessionsChartSkeleton } from "./sessions-chart";
import { TrafficTable, TrafficTableSkeleton } from "./traffic-table";
import { DataQualityNotice } from "./data-quality-notice";
import { metricFormat } from "./metric-state";
import {
  computeSessionKeyEventRate,
  computeUserKeyEventRate,
} from "@/convex/lib/ga4Catalog";
import { deltaPct, deltaPp, fillDays, summarize } from "@/lib/metrics";
import {
  formatNumber,
  formatPercent,
  formatSeconds,
  formatSignedPercent,
  formatSignedPp,
} from "@/lib/format";

/** Fokus levo (Sesije + dve prateće mere), veliki grafikon desno. */
const FOCUS_GRID =
  "grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]";
const FOCUS_SIDE = "grid content-start grid-cols-2 gap-4 lg:grid-cols-1";
/** Sedam kompaktnih pločica; poslednja popunjava red da ne ostane sama. */
const COMPACT_GRID =
  "grid grid-cols-2 gap-4 lg:grid-cols-4 [&>*:last-child]:col-span-2";

/**
 * Jedino primarno dugme Analitike, u zaglavlju strane: šta se na sajtu dešava
 * baš sada. Crta se tek kad se zna da je GA4 povezan — nepovezan ekran nosi
 * svoje dugme („Poveži GA4") u Misiji za start, a dva primarna dugmeta na
 * jednom pogledu nisu dozvoljena.
 */
export function AnalyticsHeaderAction() {
  const connections = useProjekatQuery(api.connections.list);
  if (!connections?.some((c) => c.provider === "ga4")) return null;
  return (
    <Button
      variant="primary"
      render={<Link href="/analytics/uzivo" />}
      nativeButton={false}
    >
      <Radio data-icon="inline-start" aria-hidden />
      Pogledaj uživo
    </Button>
  );
}

/**
 * Analytics (GA4). Three live subscriptions: current period, previous equal
 * period (deltas), traffic breakdown, plus report metadata for data quality.
 * Every derived number is computed in `lib/metrics.ts` so it can be checked
 * by hand against the raw rows.
 *
 * Fokus ekrana su Sesije: hero pločica i veliki grafikon. Ostalih devet mera
 * su kompaktne pločice — isti brojevi i ista poređenja, bez sparklinije.
 */
export function AnalyticsDashboard() {
  const { range } = useDateRange();
  const connections = useProjekatQuery(api.connections.list);
  // Stale-while-loading: switching the range keeps the last numbers on screen
  // (the tiles tween to the new ones) instead of flashing skeletons.
  const currentRows = useProjekatQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useProjekatQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const traffic = useStale(
    useProjekatQuery(api.analytics.traffic, { from: range.from, to: range.to }),
  );
  const reportMeta = useStale(
    useProjekatQuery(api.analytics.reportMeta, { reportKey: "daily" }),
  );
  const ga4Config = useStale(useProjekatQuery(api.analytics.ga4Configuration));

  // Dan poslednjeg očitavanja u zoni propertija: do njega je dan bez reda
  // „nije bilo saobraćaja" (0), posle njega „još nije očitano" (rupa) — F4.
  const syncedThrough = reportMeta
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: reportMeta.timeZone ?? "UTC",
      }).format(new Date(reportMeta.fetchedAt))
    : undefined;

  // Series is derived together with the range it was fetched for, so a stale
  // frame never zero-fills old rows into a new window.
  const series = useStale(
    useMemo(
      () =>
        currentRows
          ? fillDays(currentRows, range.from, range.to, syncedThrough)
          : undefined,
      [currentRows, range.from, range.to, syncedThrough],
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      {!ga4Connected ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži Google Analytics 4"
          steps={[
            { label: "Poveži GA4 u Podešavanjima (service account, samo čitanje)" },
            { label: "Prva sinhronizacija povlači do 90 dana istorije" },
          ]}
          action={
            <Button
              variant="primary"
              render={<Link href="/settings" />}
              nativeButton={false}
            >
              Poveži GA4
            </Button>
          }
        >
          Posle povezivanja ovde stižu sesije, korisnici i konverzije sajta.
        </EmptyState>
      ) : loading ? (
        <DashboardSkeleton />
      ) : cur.sessions === 0 && cur.keyEvents === 0 ? (
        <EmptyState
          icon={ChartNoAxesColumn}
          variant="line"
          title="Još nema podataka za ovaj period."
        >
          Istorija seže 90 dana unazad od prve sinhronizacije.
        </EmptyState>
      ) : (
        <>
          {/* Retention period notice if range exceeds retention setting */}
          {isShortRetention && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-raised/40 p-4 text-ui text-text-muted">
              <div className="flex items-center gap-2">
                <Info className="size-4 shrink-0 text-text-muted" aria-hidden />
                <span>
                  GA4 čuva podatke 2 meseca, a izabrani raspon je {range.days}{" "}
                  dana.
                </span>
              </div>
              <Link
                href="/settings"
                className="shrink-0 font-medium text-foreground underline-offset-4 hover:underline"
              >
                Podešavanja
              </Link>
            </div>
          )}

          <div className={FOCUS_GRID}>
            <div className={FOCUS_SIDE}>
              <div className="col-span-2 lg:col-span-1">
                <KpiTile
                  size="hero"
                  label="Sesije"
                  icon={Activity}
                  value={cur.sessions}
                  format={formatNumber}
                  delta={{
                    kind: "pct",
                    value: deltaPct(cur.sessions, prev.sessions),
                  }}
                  formatDelta={formatSignedPercent}
                  compareLabel={compareLabel}
                  spark={series.map((d) => d.sessions)}
                />
              </div>
              <KpiTile
                size="compact"
                label="Korisnici"
                value={cur.totalUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.totalUsers, prev.totalUsers),
                }}
                formatDelta={formatSignedPercent}
              />
              <KpiTile
                size="compact"
                label="Novi korisnici"
                value={cur.newUsers}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.newUsers, prev.newUsers),
                }}
                formatDelta={formatSignedPercent}
              />
            </div>

            <ChartErrorBoundary>
              <SessionsChart data={series} />
            </ChartErrorBoundary>
          </div>

          <div className={COMPACT_GRID}>
            <KpiTile
              size="compact"
              label="Angažovane sesije"
              value={cur.engagedSessions}
              format={formatNumber}
              delta={{
                kind: "pct",
                value: deltaPct(cur.engagedSessions, prev.engagedSessions),
              }}
              formatDelta={formatSignedPercent}
            />
            <KpiTile
              size="compact"
              label="Stopa angažovanja"
              value={cur.engagementRate}
              format={formatPercent}
              delta={{
                kind: "pp",
                value: deltaPp(cur.engagementRate, prev.engagementRate),
              }}
              formatDelta={formatSignedPp}
            />
            <KpiTile
              size="compact"
              label="Pregledi stranica"
              value={cur.screenPageViews}
              format={formatNumber}
              delta={{
                kind: "pct",
                value: deltaPct(cur.screenPageViews, prev.screenPageViews),
              }}
              formatDelta={formatSignedPercent}
            />
            <KpiTile
              size="compact"
              label="Vreme angažovanja po sesiji"
              shortLabel="Vreme po sesiji"
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
            />
            <KpiTile
              size="compact"
              label="Ključni događaji"
              value={cur.keyEvents}
              format={formatNumber}
              delta={{
                kind: "pct",
                value: deltaPct(cur.keyEvents, prev.keyEvents),
              }}
              formatDelta={formatSignedPercent}
            />
            <KpiTile
              size="compact"
              label="Klj. događaji po sesiji"
              shortLabel="Po sesiji"
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
            />
            <KpiTile
              size="compact"
              label="Klj. događaji po korisniku"
              shortLabel="Po korisniku"
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
            />
          </div>

          {/* Data quality notice & timezone footer */}
          <DataQualityNotice meta={reportMeta} />

          <TrafficTable traffic={traffic} kpiSessions={cur.sessions} />
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
      <div className={FOCUS_GRID}>
        <div className={FOCUS_SIDE}>
          <div className="col-span-2 lg:col-span-1">
            <KpiTileSkeleton size="hero" />
          </div>
          <KpiTileSkeleton size="compact" />
          <KpiTileSkeleton size="compact" />
        </div>
        <SessionsChartSkeleton />
      </div>
      <div className={COMPACT_GRID}>
        {Array.from({ length: 7 }).map((_, i) => (
          <KpiTileSkeleton key={i} size="compact" />
        ))}
      </div>
      <TrafficTableSkeleton />
    </>
  );
}
