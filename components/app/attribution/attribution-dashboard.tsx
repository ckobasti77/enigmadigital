"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useState } from "react";
import { ArrowRight, MousePointerClick, Unplug } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/system/empty-state";
import { FocusCard } from "@/components/app/system/focus-card";
import { FunnelSteps } from "@/components/app/system/funnel-steps";
import { ProgressBar } from "@/components/app/system/progress";
import { Button } from "@/components/ui/button";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/motion/count-up";
import { FunnelTable, FunnelTableSkeleton } from "./funnel-table";
import {
  InstagramBreakdown,
  InstagramBreakdownSkeleton,
} from "./instagram-breakdown";
import { formatNumber, formatPercent, pluralSr } from "@/lib/format";

export function AttributionDashboard() {
  const { range } = useDateRange();
  const connections = useProjekatQuery(api.connections.list);

  const rawReport = useProjekatQuery(api.attribution.report, {
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

  // UTM integritet: od kampanja koje imaju klikove, koliko ih beleži i GA4
  // sesije. Kampanja bez ijednog klika ne ulazi u imenilac.
  const withClicks =
    report?.campaigns.filter((c) => c.linkClicks > 0 || c.hasMismatch).length ??
    0;
  const mismatchCount =
    report?.campaigns.filter((c) => c.hasMismatch).length ?? 0;
  const matched = Math.max(0, withClicks - mismatchCount);

  return (
    <div className="flex flex-1 flex-col gap-6">
      {!hasGa4 && !hasOr ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži GA4 i OpenReply"
          steps={[
            { label: "Poveži OpenReply u Podešavanjima" },
            { label: "Poveži Google Analytics 4 u Podešavanjima" },
            { label: "Šalji linkove iz DM poruka sa UTM parametrima" },
          ]}
          action={
            <Button
              variant="primary"
              render={<ProjekatLink href="/settings" />}
              nativeButton={false}
            >
              Otvori podešavanja
            </Button>
          }
        >
          Atribucija spaja klik iz DM poruke sa sesijom i konverzijom na sajtu.
        </EmptyState>
      ) : loading ? (
        <AttributionDashboardSkeleton />
      ) : (
        <>
          {/* Fokus: put od poruke do konverzije, i koliko mu se može verovati. */}
          <FocusCard
            eyebrow="Levak DM → konverzija"
            // Jedno dugme fokusa: poruka i link koji pune levak se menjaju u
            // automatizacijama.
            action={
              <Button
                variant="primary"
                render={<ProjekatLink href="/openreply/automatizacije" />}
                nativeButton={false}
              >
                Otvori automatizacije
                <ArrowRight data-icon="inline-end" aria-hidden />
              </Button>
            }
            aside={
              <div className="flex w-full flex-col gap-2 md:w-80">
                <p className="heading-caps text-meta font-medium text-text-muted">
                  UTM integritet
                </p>
                {withClicks === 0 ? (
                  <p className="text-ui text-text-muted">
                    Još nema kampanja sa klikovima u ovom periodu.
                  </p>
                ) : (
                  <>
                    <ProgressBar
                      label="Kampanje sa klikovima koje beleže sesije"
                      value={matched}
                      max={withClicks}
                      tone={mismatchCount > 0 ? "warning" : "success"}
                      showValue
                    />
                    <p className="text-ui text-text-muted">
                      {mismatchCount > 0
                        ? `${mismatchCount} ${pluralSr(
                            mismatchCount,
                            "kampanja ima",
                            "kampanje imaju",
                            "kampanja ima",
                          )} klikove bez GA4 sesija.`
                        : "Sve kampanje sa klikovima beleže sesije."}
                    </p>
                  </>
                )}
                <p className="font-mono text-meta text-text-muted">
                  utm_medium=openreply-dm
                </p>
              </div>
            }
          >
            <FunnelSteps
              label="Levak od DM poruke do konverzije"
              steps={[
                { label: "Poslati DM", value: report.totals.openreply.dmsSent },
                {
                  label: "Klikovi na link",
                  value: report.totals.openreply.linkClicks,
                  per: "klikova po poruci",
                  ratioOnly: true,
                },
                {
                  label: "GA4 sesije",
                  value: report.totals.openreply.sessions,
                  per: "sesija po kliku",
                },
                {
                  label: "Konverzije",
                  value: report.totals.openreply.keyEvents,
                  per: "konverzija po sesiji",
                },
              ]}
            />
          </FocusCard>

          <div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* OpenReply Sessions */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-micro font-medium text-text-muted">
                    OpenReply GA4 sesije
                  </p>
                  <CountUp
                    value={report.totals.openreply.sessions}
                    format={formatNumber}
                    className="mt-2 block text-2xl font-bold leading-none text-foreground sm:text-3xl"
                  />
                  <div className="mt-2 flex items-baseline gap-1.5 text-xs text-text-muted">
                    <span className="font-mono tabular-nums text-foreground">
                      {formatPercent(report.totals.openreplyShareOfIgSessions)}
                    </span>
                    <span>od ukupnog IG saobraćaja</span>
                  </div>
                  <div className="mt-auto mb-3 flex items-center gap-1.5 text-micro text-text-muted">
                    <MousePointerClick className="size-3 text-mod" />
                    <span>
                      {formatNumber(report.totals.openreply.linkClicks)} link klikova
                    </span>
                  </div>
                </div>
              </Card>

              {/* OpenReply Conversions */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-micro font-medium text-text-muted">
                    OpenReply konverzije
                  </p>
                  <CountUp
                    value={report.totals.openreply.keyEvents}
                    format={formatNumber}
                    className="mt-2 block text-2xl font-bold leading-none text-foreground sm:text-3xl"
                  />
                  <div className="mt-2 flex items-baseline gap-1.5 text-xs text-text-muted">
                    <span className="font-mono tabular-nums text-success">
                      {formatPercent(report.totals.openreply.conversionRate)}
                    </span>
                    <span>stopa sesija → konverzija</span>
                  </div>
                  <div className="mt-auto mb-3 text-micro text-text-muted">
                    <span className="font-mono tabular-nums text-foreground">
                      {formatPercent(report.totals.openreplyShareOfIgKeyEvents)}
                    </span>{" "}
                    svih IG konverzija
                  </div>
                </div>
              </Card>

              {/* Total Instagram Traffic */}
              <Card className="gap-0 py-0 shadow-card ring-line" size="sm">
                <div className="flex h-36 flex-col px-5 pt-4">
                  <p className="heading-caps text-micro font-medium text-text-muted">
                    Ukupno Instagram sesija
                  </p>
                  <CountUp
                    value={report.totals.totalInstagram.sessions}
                    format={formatNumber}
                    className="mt-2 block text-2xl font-bold leading-none text-foreground sm:text-3xl"
                  />
                  <div className="mt-2 flex items-baseline gap-1.5 text-xs text-text-muted">
                    <span className="font-mono tabular-nums text-mod">
                      {formatNumber(report.totals.totalInstagram.keyEvents)}
                    </span>
                    <span>ukupnih konverzija sa IG</span>
                  </div>
                  <div className="mt-auto mb-3 text-micro text-text-muted">
                    Bio: {formatNumber(report.totals.bio.sessions)} · Story:{" "}
                    {formatNumber(report.totals.story.sessions)}
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* Levak i IG breakdown pod jednom granicom greške: pokvaren izveštaj
              degradira u poruku sa „Pokušaj ponovo", ne u prazan ekran — isti
              standard kao ostali grafikonski ekrani. */}
          <ChartErrorBoundary>
            {/* Main Funnel Table */}
            <div>
              <FunnelTable campaigns={report.campaigns} />
            </div>

            {/* Instagram Channel Breakdown */}
            <div>
              <InstagramBreakdown
                totals={report.totals}
                unmatchedGa4={report.unmatchedGa4}
              />
            </div>
          </ChartErrorBoundary>
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
      <div className="h-56 animate-pulse rounded-xl border border-line bg-card" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
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
