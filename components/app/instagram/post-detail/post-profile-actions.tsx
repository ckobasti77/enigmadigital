"use client";

import { useMemo, useState } from "react";
import { UserPlus, UserCheck, Activity, Link2, Phone, MapPin, Mail, MessageSquare, MoreHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PostMetricCard } from "./post-metric-card";
import { PROFILE_ACTION_LABELS } from "@/convex/lib/igMediaMetrics";
import type { MetricState } from "@/convex/lib/igMetrics";

export interface BreakdownItem {
  metric: string;
  dimensionKey: string;
  dimensionValue: string;
  value?: number;
  state: MetricState;
  reason?: string;
}

export interface PostProfileActionsProps {
  profileVisits?: number;
  profileVisitsState?: MetricState;
  profileVisitsReason?: string;
  follows?: number;
  followsState?: MetricState;
  followsReason?: string;
  breakdowns: BreakdownItem[];
  className?: string;
}

const ACTION_ICONS: Record<string, typeof Link2> = {
  BIO_LINK_CLICKED: Link2,
  CALL: Phone,
  DIRECTION: MapPin,
  EMAIL: Mail,
  TEXT: MessageSquare,
  OTHER: MoreHorizontal,
};

const ACTION_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

export function PostProfileActions({
  profileVisits,
  profileVisitsState = "value",
  profileVisitsReason,
  follows,
  followsState = "value",
  followsReason,
  breakdowns,
  className,
}: PostProfileActionsProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Extract profile activity breakdown rows
  const activityRows = useMemo(() => {
    return breakdowns.filter(
      (b) => b.metric === "profile_activity" && b.dimensionKey === "action_type",
    );
  }, [breakdowns]);

  const { items, totalActivityValue } = useMemo(() => {
    const list = activityRows
      .filter((r) => r.state === "value" && typeof r.value === "number" && r.value > 0)
      .map((r, idx) => {
        const val = r.value ?? 0;
        const rawLabel = PROFILE_ACTION_LABELS[r.dimensionValue] ?? r.dimensionValue;
        return {
          key: r.dimensionValue,
          label: rawLabel,
          value: val,
          color: ACTION_COLORS[idx % ACTION_COLORS.length],
          icon: ACTION_ICONS[r.dimensionValue] ?? MoreHorizontal,
        };
      })
      .sort((a, b) => b.value - a.value);

    const sum = list.reduce((acc, item) => acc + item.value, 0);

    return {
      items: list,
      totalActivityValue: Math.max(1, sum),
    };
  }, [activityRows]);

  const hasActivityData = items.length > 0;
  const isBreakdownSuppressed =
    activityRows.length > 0 &&
    activityRows.every((r) => r.state === "suppressed");
  const isBreakdownUnavailable =
    activityRows.length > 0 &&
    activityRows.every((r) => r.state === "unavailable");

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <span className="heading-caps text-micro font-semibold text-accent-400">
          Najvredniji rezultati
        </span>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Šta je objava donela
        </h2>
        <p className="text-xs text-text-muted">
          Direktne radnje i konverzije koje su korisnici izvršili nakon pregleda ovog sadržaja.
        </p>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PostMetricCard
          label="Posete profilu"
          value={profileVisits}
          state={profileVisitsState}
          reason={profileVisitsReason}
          icon={UserCheck}
          highlight
          description="Broj poseta profilu ostvarenih direktno sa ove objave."
        />

        <PostMetricCard
          label="Novi pratioci"
          value={follows}
          state={followsState}
          reason={followsReason}
          icon={UserPlus}
          highlight
          description="Broj korisnika koji su počeli da vas prate nakon što su videli ovu objavu."
        />
      </div>

      {/* Profile Activity Breakdown Bar & List */}
      <Card className="flex flex-col gap-5 p-5 shadow-card ring-line">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-accent-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">
              Radnje preduzete na profilu (Profile activity)
            </h3>
          </div>
          {hasActivityData && (
            <span className="font-mono text-xs text-text-muted">
              Ukupno: {formatNumber(items.reduce((s, i) => s + i.value, 0))} radnji
            </span>
          )}
        </div>

        {hasActivityData ? (
          <div className="flex flex-col gap-4">
            {/* Horizontal Segmented Bar */}
            <div className="relative flex h-6 w-full gap-[2px] overflow-hidden rounded-[4px] bg-surface-raised p-0.5">
              {items.map((item, idx) => {
                const pct = (item.value / totalActivityValue) * 100;
                const isHovered = hoveredIdx === idx;
                return (
                  <div
                    key={item.key}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: item.color,
                    }}
                    className={cn(
                      "h-full rounded-[3px] transition-all cursor-pointer",
                      isHovered ? "opacity-100 ring-2 ring-white/60" : "opacity-90 hover:opacity-100",
                    )}
                    title={`${item.label}: ${formatNumber(item.value)} (${formatPercent(item.value / totalActivityValue)})`}
                  />
                );
              })}
            </div>

            {/* Breakdown List Rows */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-1">
              {items.map((item, idx) => {
                const pct = item.value / totalActivityValue;
                const isHovered = hoveredIdx === idx;
                const IconComponent = item.icon;

                return (
                  <div
                    key={item.key}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised/40 p-3 transition-colors",
                      isHovered && "border-line-strong bg-surface-raised/80",
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="size-3 shrink-0 rounded-xs"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <IconComponent className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
                      <span className="truncate text-xs font-medium text-text-primary">
                        {item.label}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-baseline gap-1.5 font-mono">
                      <span className="text-xs font-bold text-foreground">
                        {formatNumber(item.value)}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        ({formatPercent(pct)})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-text-muted">
            {isBreakdownSuppressed ? (
              <p>Nedovoljno podataka za prikaz detaljnog razdvajanja radnji.</p>
            ) : isBreakdownUnavailable ? (
              <p>Podaci o radnjama na profilu nisu dostupni za ovu objavu.</p>
            ) : (
              <p>Nema zabeleženih radnji na profilu (klikovi na link, pozivi, email) sa ove objave.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
