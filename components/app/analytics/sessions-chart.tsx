"use client";

import { useState } from "react";
import {
  TimelineChart,
  TimelineChartSkeleton,
} from "@/components/app/timeline-chart";
import {
  formatNumber,
  formatPercent,
  formatSeconds,
} from "@/lib/format";
import type { DailyPoint } from "@/lib/metrics";
import { cn } from "@/lib/utils";

type MetricKey =
  | "sessions"
  | "totalUsers"
  | "newUsers"
  | "engagedSessions"
  | "engagementRate"
  | "screenPageViews"
  | "avgEngagementDurationPerSession"
  | "keyEvents";

interface MetricOption {
  key: MetricKey;
  label: string;
  format: (v: number) => string;
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: "sessions", label: "Sesije", format: formatNumber },
  { key: "totalUsers", label: "Korisnici", format: formatNumber },
  { key: "newUsers", label: "Novi korisnici", format: formatNumber },
  { key: "engagedSessions", label: "Angažovane sesije", format: formatNumber },
  { key: "engagementRate", label: "Stopa angažovanja", format: formatPercent },
  { key: "screenPageViews", label: "Pregledi stranica", format: formatNumber },
  {
    key: "avgEngagementDurationPerSession",
    label: "Prosečno vreme angažovanja",
    format: formatSeconds,
  },
  { key: "keyEvents", label: "Ključni događaji", format: formatNumber },
];

/** Dnevni prikaz izabrane metrike kroz vreme sa biračem metrika. */
export function SessionsChart({ data }: { data: DailyPoint[] }) {
  const [selectedKey, setSelectedKey] = useState<MetricKey>("sessions");

  const currentOption =
    METRIC_OPTIONS.find((o) => o.key === selectedKey) ?? METRIC_OPTIONS[0];

  const values = data.map((d) => d[selectedKey]);
  const hasAnyData = values.some((v) => v !== undefined && v !== null);

  const emptyReason = !hasAnyData
    ? "Merenje ove metrike je početo kasnije; stariji dani nemaju podatak."
    : "GA4 nije prijavio podatke za izabranu metriku u ovom periodu. Istorija seže 90 dana unazad od prve sinhronizacije.";

  return (
    <div className="flex flex-col gap-3">
      {/* Metric Selector Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface-raised/30 p-1.5">
        <span className="px-2 text-xs font-medium text-text-muted">
          Prikaži na grafikonu:
        </span>
        {METRIC_OPTIONS.map((opt) => {
          const active = opt.key === selectedKey;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSelectedKey(opt.key)}
              className={cn(
                "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-text-muted hover:bg-surface-raised hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <TimelineChart
        syncId="ga4-timeline"
        yWidth={52}
        dates={data.map((d) => d.date)}
        area={{
          label: currentOption.label,
          color: "var(--color-chart-1)",
          values,
          format: currentOption.format,
        }}
        emptyReason={emptyReason}
      />
    </div>
  );
}

export function SessionsChartSkeleton() {
  return <TimelineChartSkeleton topLabelWidth="w-24" />;
}
