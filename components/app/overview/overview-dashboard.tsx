"use client";

import { Component, useMemo, useState, type ReactNode } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import {
  ArrowUpRight,
  LineChart,
  MessageCircleReply,
  Unplug,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { CountUp } from "@/components/motion/count-up";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InstagramIcon } from "@/components/app/brand-glyphs";
import { useDateRange } from "@/components/app/date-range-picker";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import {
  DeltaPill,
  KpiTile,
  KpiTileSkeleton,
} from "@/components/app/system/kpi-tile";
import {
  SessionsChart,
  SessionsChartSkeleton,
} from "@/components/app/analytics/sessions-chart";
import { brojPosla, useStaMeCeka } from "@/components/app/use-sta-me-ceka";
import { UnconnectedTile } from "./unconnected-tile";
import { PoslovanjeKartica } from "./poslovanje-kartica";
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
import { formatDateSpan, formatNumber, formatSignedPercent } from "@/lib/format";
import type { DateRange } from "@/lib/date-range";

export function OverviewDashboard() {
  const { range } = useDateRange();
  const connections = useProjekatQuery(api.connections.list);
  const syncHealth = useProjekatQuery(api.sync.health);

  // ── GA4 Queries ──────────────────────────────────────────────────────────
  const ga4Current = useProjekatQuery(api.analytics.daily, {
    from: range.from,
    to: range.to,
  });
  const ga4Previous = useProjekatQuery(api.analytics.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  // ── Instagram Queries ───────────────────────────────────────────────────
  const igCurrent = useProjekatQuery(api.instagramStore.dailyHistory, {
    from: range.from,
    to: range.to,
  });
  const igPrevious = useProjekatQuery(api.instagramStore.dailyHistory, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const igMedia = useProjekatQuery(api.instagramStore.mediaList, {
    limit: 50,
  });

  // ── OpenReply Queries ───────────────────────────────────────────────────
  const orCurrent = useProjekatQuery(api.openreplyStore.daily, {
    from: range.from,
    to: range.to,
  });
  const orPrevious = useProjekatQuery(api.openreplyStore.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });

  // ── Attribution Report ──────────────────────────────────────────────────
  const attributionReport = useProjekatQuery(api.attribution.report, {
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
      {/* Četiri kanala, svaki u svojoj boji i svaki vodi u svoj modul: koliko
          ih je došlo na sajt, koliki je organski doseg, koliko je
          automatizacija poslala i koliko leadova još čeka prvi poziv. Boja je
          ovde MESTO — `data-module` na omotaču daje pločici boju kanala.
          Radni ekran ne animira sekcije pri otvaranju, pa `Reveal` ovde nema. */}
      <section aria-labelledby="kanali-naslov" className="flex flex-col gap-3">
        {/* Okvir u naslovu: tabla meša dan, nedelju i period, pa svaka
            sekcija kaže svoj. Ovde je to period izabran u gornjoj traci. */}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="kanali-naslov" className="text-copy font-semibold text-foreground">
            Kanali
          </h2>
          <span className="text-meta tabular-nums text-text-muted">
            {okvirPerioda(range)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div data-module="analitika">
            {hasGa4 ? (
              ga4Cur && ga4Prev && ga4Series ? (
                <KpiTile
                  label="Sesije"
                  mera="sesije"
                  icon={LineChart}
                  href="/analytics"
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
          </div>

          <div data-module="instagram">
            {hasInstagram ? (
              igCur && igPrev && igSeries ? (
                <KpiTile
                  label="Instagram doseg"
                  mera="doseg"
                  shortLabel="IG doseg"
                  icon={InstagramIcon}
                  href="/instagram"
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
          </div>

          <div data-module="openreply">
            {hasOpenReply ? (
              orCur && orPrev && orSeries ? (
                <KpiTile
                  label="Poslate DM poruke"
                  mera="poslate_poruke"
                  shortLabel="DM poruke"
                  icon={MessageCircleReply}
                  href="/openreply"
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

          <div data-module="leadovi">
            <TileBoundary
              fallback={
                <KpiTile
                  label="Leadovi bez poziva"
                  mera="leadovi_bez_poziva"
                  icon={Users}
                  href="/leadovi"
                  value={undefined}
                  format={formatNumber}
                  state="unavailable"
                  reason="Broj trenutno nije dostupan."
                />
              }
            >
              <LeadoviPlocica />
            </TileBoundary>
          </div>
        </div>
      </section>

      {/* Brojke poslovanja sa sajta projekta (Puls), ispod kanala. */}
      <PoslovanjeKartica />

      {/* Glavni sadržaj ekrana: kretanje sesija i ključnih događaja kroz period. */}
      {!hasGa4 ? (
        <ConnectNotice provider="GA4">
          Kretanje sesija i ključnih događaja kroz period crta se iz Google
          Analytics 4. Bez te veze ovde su samo Instagram i OpenReply.
        </ConnectNotice>
      ) : ga4Series === undefined ? (
        <SessionsChartSkeleton />
      ) : (
        <ChartErrorBoundary>
          <SessionsChart data={ga4Series} />
        </ChartErrorBoundary>
      )}

      {/* Prateće mere: važe, ali se ne gledaju prve. */}
      <SecondaryStats
        compareLabel={compareLabel}
        items={[
          {
            label: "Ključni događaji",
            provider: "GA4",
            connected: hasGa4,
            loading: hasGa4 && ga4Cur === undefined,
            value: ga4Cur?.keyEvents,
            delta:
              ga4Cur && ga4Prev
                ? deltaPct(ga4Cur.keyEvents, ga4Prev.keyEvents)
                : undefined,
          },
          {
            label: "Korisnici",
            provider: "GA4",
            connected: hasGa4,
            loading: hasGa4 && ga4Cur === undefined,
            value: ga4Cur?.totalUsers,
            delta:
              ga4Cur && ga4Prev
                ? deltaPct(ga4Cur.totalUsers, ga4Prev.totalUsers)
                : undefined,
          },
          {
            label: "Klikovi na linkove",
            provider: "OpenReply",
            connected: hasOpenReply,
            loading: hasOpenReply && orCur === undefined,
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
            loading: hasInstagram && igCur === undefined,
            value: igCur?.followersCount,
            delta:
              igCur && igPrev
                ? deltaPct(igCur.followersCount, igPrev.followersCount)
                : undefined,
          },
        ]}
      />

      {/* Šta je radilo u periodu, i da li su brojevi uopšte sveži. */}
      <PerformanceHighlights
        report={staleReport}
        mediaList={staleMedia}
        hasOpenReply={hasOpenReply}
        hasInstagram={hasInstagram}
        hasGa4={hasGa4}
      />

      <SyncHealthWidget entries={syncHealth} connections={connections} />
    </div>
  );
}

/** Okvir sekcije Kanali: „Poslednjih 7 dana“ ili prilagođen raspon. */
function okvirPerioda(range: DateRange): string {
  return range.preset === "custom"
    ? formatDateSpan(range.from, range.to)
    : `Poslednjih ${range.days} dana`;
}

const NIKAD_DODIRNUT = "leadovi.nikad_dodirnut";

/**
 * Četvrta pločica: leadovi koji još nisu zvani. Broj je isti onaj iz zvona
 * (`useStaMeCeka` — ista pretplata, bez novog upita), pa Kontrolna tabla i
 * zvono ne mogu da kažu dve različite stvari. Zadatak sa brojem 0 se ne pravi,
 * pa je nula ovde stvarna nula, a ne „ne znamo".
 */
function LeadoviPlocica() {
  const staMeCeka = useStaMeCeka();
  if (staMeCeka === undefined) return <KpiTileSkeleton />;

  const zadatak =
    staMeCeka.zadaci.find((z) => z.kljuc === NIKAD_DODIRNUT) ??
    staMeCeka.sklonjeni.find((z) => z.kljuc === NIKAD_DODIRNUT);
  const broj = brojPosla(staMeCeka, NIKAD_DODIRNUT) ?? 0;

  return (
    <KpiTile
      label="Leadovi bez poziva"
      mera="leadovi_bez_poziva"
      shortLabel="Bez poziva"
      icon={Users}
      href="/leadovi"
      value={broj}
      format={(v) => `${zadatak?.odsecen ? "≥ " : ""}${formatNumber(v)}`}
      note={
        zadatak?.imenilac ??
        // Jedina pločica Kanala koja ne zavisi od perioda: kaže da je stanje.
        (broj === 0 ? "svaki lead u tabeli je bar jednom zvan" : "stanje sada")
      }
    />
  );
}

/** Pad upita iza jedne pločice ne sme da obori red — pločica kaže da broja nema. */
class TileBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
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
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-soft bg-card/40 px-6 py-12 text-center">
      <div className="flex size-9 items-center justify-center rounded-full border border-line-soft text-text-muted">
        <Unplug className="size-4" aria-hidden />
      </div>
      <p className="mt-3 text-copy font-medium text-foreground">
        {provider} nije povezan
      </p>
      <p className="mt-1 max-w-md text-ui leading-relaxed text-text-muted">
        {children}
      </p>
      <Button
        render={<ProjekatLink href="/settings" />}
        nativeButton={false}
        variant="outline"
        size="sm"
        className="mt-4"
      >
        Poveži u Podešavanjima
        <ArrowUpRight data-icon="inline-end" aria-hidden />
      </Button>
    </div>
  );
}

type SecondaryStat = {
  label: string;
  provider: string;
  connected: boolean;
  loading?: boolean;
  value: number | undefined;
  delta: number | null | undefined;
};

/**
 * Jedan red, četiri mere, bez sparklinija — drugi nivo, i izgleda tako:
 * razdelnici umesto kutije, i broj koji pri otvaranju STOJI (kotrlja se tek
 * kad se promeni period ili stigne svež podatak).
 */
function SecondaryStats({
  items,
  compareLabel,
}: {
  items: SecondaryStat[];
  compareLabel: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line-soft py-4 lg:grid-cols-4 lg:gap-x-0 lg:divide-x lg:divide-line-soft">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 lg:px-5 lg:first:pl-0">
          <p className="heading-caps truncate text-meta font-medium text-text-muted">
            {item.label}
          </p>
          {!item.connected ? (
            <ProjekatLink
              href="/settings"
              className="mt-1.5 inline-flex items-center gap-1 text-ui text-text-muted underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              {item.provider} nije povezan
              <ArrowUpRight className="size-3" aria-hidden />
            </ProjekatLink>
          ) : item.loading ? (
            <Skeleton className="mt-2 h-6 w-24" />
          ) : item.value === undefined ? (
            <span className="mt-1.5 block text-title font-bold text-text-muted">
              —
            </span>
          ) : (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <CountUp
                value={item.value}
                format={formatNumber}
                className="text-title tabular-nums font-bold text-foreground"
              />
              {item.delta !== null && item.delta !== undefined && (
                <>
                  <DeltaPill value={item.delta} format={formatSignedPercent} />
                  <span className="truncate text-meta text-text-muted">
                    {compareLabel}
                  </span>
                </>
              )}
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
    <div className="flex flex-1 flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <SessionsChartSkeleton />
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line-soft py-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2.5 h-6 w-24" />
          </div>
        ))}
      </div>
      <PerformanceHighlightsSkeleton />
      <SyncHealthWidgetSkeleton />
    </div>
  );
}
