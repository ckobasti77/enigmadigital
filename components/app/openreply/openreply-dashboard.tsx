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
import { KpiTile, KpiTileSkeleton } from "@/components/app/analytics/kpi-tile";
import { OpenReplyChart, OpenReplyChartSkeleton } from "./openreply-chart";
import { CampaignsTable, CampaignsTableSkeleton } from "./campaigns-table";
import {
  deltaPct,
  deltaPp,
  fillOrDays,
  summarizeOr,
} from "@/lib/metrics";
import {
  formatNumber,
  formatPercent,
  formatSignedPercent,
  formatSignedPp,
} from "@/lib/format";

/**
 * OpenReply Dashboard. Live subscriptions to daily aggregate totals and
 * campaign stats.
 */
export function OpenReplyDashboard() {
  const { range } = useDateRange();
  const connections = useQuery(api.connections.list);

  const currentRows = useQuery(api.openreplyStore.daily, {
    from: range.from,
    to: range.to,
  });
  const previousRows = useQuery(api.openreplyStore.daily, {
    from: range.prevFrom,
    to: range.prevTo,
  });
  const rawCampaigns = useQuery(api.openreplyStore.campaigns);

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
        <EmptyState icon={Unplug}>
          OpenReply još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : loading ? (
        <OpenReplyDashboardSkeleton />
      ) : (
        <>
          <Reveal>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiTile
                label="Poslati DM"
                primary
                value={cur.dmsSent}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.dmsSent, prev.dmsSent),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.dmsSent)}
              />
              <KpiTile
                label="Klikovi na linkove"
                value={cur.linkClicks}
                format={formatNumber}
                delta={{
                  kind: "pct",
                  value: deltaPct(cur.linkClicks, prev.linkClicks),
                }}
                formatDelta={formatSignedPercent}
                compareLabel={compareLabel}
                spark={series.map((d) => d.linkClicks)}
              />
              <KpiTile
                label="Prosečan CTR"
                value={cur.ctr}
                format={formatPercent}
                delta={{
                  kind: "pp",
                  value: deltaPp(cur.ctr, prev.ctr),
                }}
                formatDelta={formatSignedPp}
                compareLabel={compareLabel}
                spark={series.map((d) => (d.dmsSent > 0 ? d.linkClicks / d.dmsSent : 0))}
              />
              <KpiTile
                label="Aktivne kampanje"
                value={activeCampaigns}
                format={formatNumber}
                delta={{ kind: "pct", value: null }}
                formatDelta={() => "—"}
                compareLabel={`od ${totalCampaigns} ukupno`}
                spark={[]}
              />
            </div>
          </Reveal>

          {cur.dmsSent === 0 && cur.linkClicks === 0 && campaigns.length === 0 ? (
            <EmptyState icon={ChartNoAxesColumn}>
              Nema podataka za izabrani period. Istorija seže 90 dana unazad od
              prve sinhronizacije.
            </EmptyState>
          ) : (
            <>
              <Reveal delay={0.05}>
                <ChartErrorBoundary>
                  <OpenReplyChart data={series} />
                </ChartErrorBoundary>
              </Reveal>

              <Reveal delay={0.1}>
                <CampaignsTable campaigns={campaigns} />
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

export function OpenReplyDashboardSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
        <KpiTileSkeleton />
      </div>
      <OpenReplyChartSkeleton />
      <CampaignsTableSkeleton />
    </>
  );
}
