"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, CornerUpLeft, LogOut, Navigation } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STORY_NAVIGATION_LABELS } from "@/convex/lib/igMediaMetrics";
import type { BreakdownItem } from "./post-profile-actions";

export interface PostStoryFunnelProps {
  breakdowns: BreakdownItem[];
  className?: string;
}

const NAV_CONFIG: Record<
  string,
  { label: string; description: string; color: string; icon: typeof ArrowRight; order: number }
> = {
  TAP_FORWARD: {
    label: "Dodir za sledeće",
    description: "Korisnik je tapnuo ekran da pređe na vaš sledeći stori.",
    color: "var(--chart-1)",
    icon: ChevronRight,
    order: 1,
  },
  SWIPE_FORWARD: {
    label: "Prevlačenje na sledeći nalog",
    description: "Korisnik je prevukao prstom i preskočio na priče drugog naloga.",
    color: "var(--chart-2)",
    icon: ArrowRight,
    order: 2,
  },
  TAP_BACK: {
    label: "Povratak nazad",
    description: "Korisnik se vratio nazad na prethodni stori da ponovo pogleda.",
    color: "var(--chart-3)",
    icon: CornerUpLeft,
    order: 3,
  },
  TAP_EXIT: {
    label: "Napuštanje priče",
    description: "Korisnik je zatvorio pregled storija i izašao na feed.",
    color: "var(--chart-5)",
    icon: LogOut,
    order: 4,
  },
};

export function PostStoryFunnel({ breakdowns, className }: PostStoryFunnelProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const navRows = useMemo(() => {
    return breakdowns.filter(
      (b) => b.metric === "navigation" && b.dimensionKey === "story_navigation_action_type",
    );
  }, [breakdowns]);

  const { items, totalNavigations, isBelowThreshold, isSuppressedReason } = useMemo(() => {
    const isSupp = navRows.some((r) => r.state === "suppressed");
    const suppReason = navRows.find((r) => r.reason)?.reason;

    let sum = 0;
    const list = Object.entries(NAV_CONFIG).map(([key, cfg]) => {
      const row = navRows.find((r) => r.dimensionValue === key);
      const val = row && row.state === "value" && typeof row.value === "number" ? row.value : 0;
      sum += val;
      return {
        key,
        label: cfg.label,
        description: cfg.description,
        color: cfg.color,
        icon: cfg.icon,
        order: cfg.order,
        value: val,
        rawLabel: STORY_NAVIGATION_LABELS[key] ?? key,
      };
    });

    list.sort((a, b) => a.order - b.order);

    return {
      items: list,
      totalNavigations: Math.max(1, sum),
      isBelowThreshold: isSupp,
      isSuppressedReason: suppReason,
    };
  }, [navRows]);

  const hasData = items.some((i) => i.value > 0);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <span className="heading-caps text-micro font-semibold text-accent-400">
          Story analitika
        </span>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Levak navigacije kroz priču
        </h2>
        <p className="text-xs text-text-muted">
          Prikaz kretanja gledalaca kroz sadržaj priče — prelazi, povratci i odustajanja.
        </p>
      </div>

      <Card className="flex flex-col gap-6 p-6 shadow-card ring-line">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
          <div className="flex items-center gap-2">
            <Navigation className="size-4 text-accent-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">
              Segmentacija radnji gledalaca
            </h3>
          </div>
          {hasData && (
            <span className="font-mono text-xs text-text-muted">
              Ukupno zabeleženih radnji: {formatNumber(items.reduce((s, i) => s + i.value, 0))}
            </span>
          )}
        </div>

        {isBelowThreshold && !hasData ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm font-medium text-text-secondary">
              {isSuppressedReason || "Instagram ne prikazuje uvide za priče sa manje od 5 gledalaca."}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Meta Graph API automatski skriva uvide za priče dok ne dostignu minimalan prag pregleda.
            </p>
          </div>
        ) : hasData ? (
          <div className="flex flex-col gap-6">
            {/* Horizontal Funnel Segment Bar (Stacked bar with 4px rounded radius and 2px gap) */}
            <div className="flex flex-col gap-2">
              <div className="relative flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px] bg-surface-raised p-0.5">
                {items.map((item) => {
                  const pct = (item.value / totalNavigations) * 100;
                  if (pct <= 0) return null;
                  const isHovered = hoveredKey === item.key;

                  return (
                    <div
                      key={item.key}
                      onMouseEnter={() => setHoveredKey(item.key)}
                      onMouseLeave={() => setHoveredKey(null)}
                      style={{
                        width: `${pct}%`,
                        backgroundColor: item.color,
                      }}
                      className={cn(
                        "h-full rounded-[3px] transition-all cursor-pointer",
                        isHovered ? "opacity-100 ring-2 ring-white/60" : "opacity-90 hover:opacity-100",
                      )}
                      title={`${item.label}: ${formatNumber(item.value)} (${formatPercent(item.value / totalNavigations)})`}
                    />
                  );
                })}
              </div>

              {/* Legend with action names and color boxes */}
              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs">
                {items.map((item) => (
                  <div
                    key={item.key}
                    onMouseEnter={() => setHoveredKey(item.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className={cn(
                      "flex items-center gap-1.5 transition-opacity cursor-pointer",
                      hoveredKey && hoveredKey !== item.key ? "opacity-40" : "opacity-100",
                    )}
                  >
                    <span
                      className="size-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: item.color }}
                      aria-hidden="true"
                    />
                    <span className="text-text-secondary font-medium">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Detailed Funnel Step Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((item) => {
                const pct = item.value / totalNavigations;
                const isHovered = hoveredKey === item.key;
                const IconComponent = item.icon;

                return (
                  <div
                    key={item.key}
                    onMouseEnter={() => setHoveredKey(item.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className={cn(
                      "flex flex-col justify-between gap-3 rounded-lg border border-line bg-surface-raised/40 p-4 transition-all",
                      isHovered && "border-line-strong bg-surface-raised/80 ring-1 ring-accent-400/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-xs"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span className="text-xs font-semibold text-foreground">
                          {item.label}
                        </span>
                      </div>
                      <IconComponent className="size-4 text-text-muted" aria-hidden="true" />
                    </div>

                    <div className="flex items-baseline justify-between gap-2 font-mono pt-1">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(item.value)}
                      </span>
                      <span className="text-xs font-medium text-text-muted">
                        {formatPercent(pct)}
                      </span>
                    </div>

                    <p className="text-[11px] text-text-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-text-muted">
            <p>Nema dostupnih podataka o navigaciji za ovu priču.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
