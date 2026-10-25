"use client";

import { ProjekatLink } from "@/components/app/projekat-link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  Camera,
  ChartNoAxesColumn,
  Megaphone,
  MousePointerClick,
  Unplug,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { useDateRange } from "@/components/app/date-range-picker";
import { EmptyState } from "@/components/app/system/empty-state";
import { FocusCard } from "@/components/app/system/focus-card";
import { FunnelSteps } from "@/components/app/system/funnel-steps";
import { Button } from "@/components/ui/button";
import { ChartErrorBoundary } from "@/components/app/chart-states";
import {
  DeltaPill,
  KpiTile,
  KpiTileSkeleton,
  StatTile,
} from "@/components/app/system/kpi-tile";
import { OpenReplyChart, OpenReplyChartSkeleton } from "./openreply-chart";
import { CampaignsTable, CampaignsTableSkeleton } from "./campaigns-table";
import {
  deltaPct,
  fillOrDays,
  summarizeOr,
} from "@/lib/metrics";
import {
  formatRatio,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from "@/lib/format";

/**
 * OpenReply Dashboard. Live subscriptions to daily aggregate totals and
 * campaign stats.
 */
export function OpenReplyDashboard() {
  const { range } = useDateRange();
  const connections = useProjekatQuery(api.connections.list);

  const currentRows = useProjekatQuery(api.openreplyStore.daily, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useProjekatQuery(api.openreplyStore.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawCampaigns = useProjekatQuery(api.openreplyStore.campaigns);

  const campaigns = useStale(rawCampaigns);

  const series = useStale(
    useMemo(
      () =>
        currentRows ? fillOrDays(currentRows, range.from, range.to) : undefined,
      [currentRows, range.from, range.to],
    ),
  );

  const cur = useStale(
    useMemo(
      () => (currentRows ? summarizeOr(currentRows) : undefined),
      [currentRows],
    ),
  );

  const prev = useStale(
    useMemo(
      () => (previousRows ? summarizeOr(previousRows) : undefined),
      [previousRows],
    ),
  );

  const orConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "openreply");

  // The split is only shown to a workspace that actually has both accounts.
  // A permanently empty "Facebook" tile next to a busy Instagram one reads as
  // a broken integration rather than as an absent one.
  const fbConnected =
    connections !== undefined &&
    connections.some((c) => c.provider === "meta_fb");

  const loading =
    connections === undefined ||
    series === undefined ||
    cur === undefined ||
    prev === undefined ||
    campaigns === undefined;

  const compareLabel = `vs prethodnih ${range.days} d`;

  const totalCampaigns = campaigns?.length ?? 0;
  const activeCampaigns = campaigns?.filter((c) => c.active).length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-6">
      {!orConnected ? (
        <EmptyState
          icon={Unplug}
          variant="mission"
          title="Poveži OpenReply"
          steps={[
            { label: "Poveži OpenReply u Podešavanjima" },
            { label: "Napravi prvu automatizaciju: ključna reč i poruka" },
            { label: "Prvi poslati DM se pojavljuje ovde" },
          ]}
          action={
            <Button
              variant="primary"
              render={<ProjekatLink href="/settings" />}
              nativeButton={false}
            >
              Poveži OpenReply
            </Button>
          }
        >
          Posle povezivanja ovde stižu poslate poruke i klikovi na linkove.
        </EmptyState>
      ) : loading ? (
        <OpenReplyDashboardSkeleton />
      ) : (
        <>
          {/* Fokus: levak DM → klik. Odnos, ne stopa (F6): `orLinkClicks`
              beleži svako otvaranje linka, a link pripada automatizaciji, ne
              poruci — klik se ne može vezati za primaoca, pa jedan čovek sa
              tri otvaranja daje tri klika na jedan DM. Kao „CTR" to prelazi
              100 %; zato između koraka piše „klikova po poruci". */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="col-span-2 lg:col-span-1">
              {/* Jedno dugme fokusa: levak se menja u automatizacijama
                  (poruka i link), pa vodi tamo. */}
              <FocusCard
                eyebrow="Levak DM → klik"
                className="h-full"
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
              >
                <FunnelSteps
                  label="Levak od poslate poruke do klika na link"
                  steps={[
                    {
                      label: "Poslati DM",
                      value: cur.dmsSent,
                      aside: <Promena value={deltaPct(cur.dmsSent, prev.dmsSent)} />,
                    },
                    {
                      label: "Klikovi na linkove",
                      value: cur.linkClicks,
                      per: "klikova po poruci",
                      ratioOnly: true,
                      aside: (
                        <Promena
                          value={deltaPct(cur.linkClicks, prev.linkClicks)}
                        />
                      ),
                    },
                  ]}
                />
                {(deltaPct(cur.dmsSent, prev.dmsSent) !== null ||
                  deltaPct(cur.linkClicks, prev.linkClicks) !== null) && (
                  <p className="text-meta text-text-muted">
                    Promena je {compareLabel}.
                  </p>
                )}
              </FocusCard>
            </div>
            <KpiTile
              label="Klikova po poruci"
              shortLabel="Po poruci"
              icon={MousePointerClick}
              value={cur.ctr}
              format={formatRatio}
              delta={{
                kind: "pct",
                value: deltaPct(cur.ctr, prev.ctr),
              }}
              formatDelta={formatSignedPercent}
              compareLabel={compareLabel}
              spark={series.map((d) => (d.dmsSent > 0 ? d.linkClicks / d.dmsSent : 0))}
            />
            <KpiTile
              label="Aktivne kampanje"
              shortLabel="Kampanje"
              icon={Megaphone}
              value={activeCampaigns}
              format={formatNumber}
              // Nema prethodnog perioda za broj kampanja — imenilac ide kao
              // napomena, ne kao lažno poređenje (A1 §3).
              note={`od ${totalCampaigns} ukupno`}
            />
          </div>

          {fbConnected && (
            <div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <StatTile
                  label="Odgovoreno na Instagramu"
                  value={cur.dmsSentInstagram}
                  format={formatNumber}
                  note={`${formatPercent(
                    cur.dmsSent > 0 ? cur.dmsSentInstagram / cur.dmsSent : 0,
                  )} svih poslatih poruka u periodu`}
                  icon={Camera}
                />
                <StatTile
                  label="Odgovoreno na Facebook-u"
                  value={cur.dmsSentFacebook}
                  format={formatNumber}
                  note={`${formatPercent(
                    cur.dmsSent > 0 ? cur.dmsSentFacebook / cur.dmsSent : 0,
                  )} svih poslatih poruka u periodu`}
                  icon={Users}
                />
              </div>
            </div>
          )}

          {cur.dmsSent === 0 && cur.linkClicks === 0 && campaigns.length === 0 ? (
            <EmptyState
              icon={ChartNoAxesColumn}
              variant="line"
              title="Još nema podataka za ovaj period."
            >
              Istorija seže 90 dana unazad od prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <div>
                <ChartErrorBoundary>
                  <OpenReplyChart data={series} />
                </ChartErrorBoundary>
              </div>

              <div>
                <CampaignsTable campaigns={campaigns} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Pilula promene uz korak levka; bez prethodnog perioda se ne crta. */
function Promena({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) return null;
  return <DeltaPill value={value} format={formatSignedPercent} />;
}

function useStale<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

export function OpenReplyDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 h-40 animate-pulse rounded-xl border border-line bg-card lg:col-span-1" />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <OpenReplyChartSkeleton />
      <CampaignsTableSkeleton />
    </>
  );
}
