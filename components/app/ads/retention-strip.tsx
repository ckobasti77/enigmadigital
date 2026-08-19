"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface VideoRetentionData {
  video3s: number;
  thruplay: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP95?: number;
  videoP100: number;
  p25Pct: number;
  p50Pct: number;
  p75Pct: number;
  p100Pct: number;
}

interface RetentionStripProps {
  retention?: VideoRetentionData;
  impressions?: number;
  className?: string;
  showLabels?: boolean;
}

export function RetentionStrip({
  retention,
  impressions = 0,
  className,
  showLabels = true,
}: RetentionStripProps) {
  const hasVideo = Boolean(
    retention && (retention.video3s > 0 || retention.videoP25 > 0 || retention.thruplay > 0),
  );

  if (!hasVideo || !retention) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-md border border-dashed border-line-soft bg-surface/30 px-3 py-2 text-center text-micro text-text-muted",
          className,
        )}
      >
        <span>Statična kreativa (nije video)</span>
      </div>
    );
  }

  const checkpoints = [
    {
      label: "25%",
      count: retention.videoP25,
      pct: retention.p25Pct,
      color: "bg-accent-400",
      textColor: "text-accent-400",
    },
    {
      label: "50%",
      count: retention.videoP50,
      pct: retention.p50Pct,
      color: "bg-accent-400/80",
      textColor: "text-accent-400/90",
    },
    {
      label: "75%",
      count: retention.videoP75,
      pct: retention.p75Pct,
      color: "bg-accent-400/60",
      textColor: "text-accent-400/80",
    },
    {
      label: "100%",
      count: retention.videoP100,
      pct: retention.p100Pct,
      color: "bg-accent-400/40",
      textColor: "text-accent-400/70",
    },
  ];

  return (
    <TooltipProvider delay={100}>
      <div className={cn("flex flex-col gap-1.5 w-full", className)}>
        {showLabels && (
          <div className="flex items-center justify-between text-micro text-text-muted font-medium">
            <span>Video zadržavanje</span>
            <span className="font-mono tabular-nums text-foreground/80">
              3s: {formatPercent(retention.video3s / (impressions || 1))}
            </span>
          </div>
        )}

        {/* Stepped Mini Bars */}
        <div className="grid grid-cols-4 gap-1.5 items-end h-10 rounded bg-surface-raised/40 p-1 border border-line-soft">
          {checkpoints.map((cp) => {
            const fillHeightPct = Math.max(8, Math.min(100, Math.round(cp.pct * 100)));
            return (
              <Tooltip key={cp.label}>
                <TooltipTrigger
                  render={
                    <div className="group/bar relative flex flex-col items-center justify-end h-full w-full cursor-pointer" />
                  }
                >
                  <div
                    className={cn(
                      "w-full rounded-xs transition-all duration-300 group-hover/bar:brightness-125",
                      cp.color,
                    )}
                    style={{ height: `${fillHeightPct}%` }}
                  />
                  <span className="mt-0.5 text-micro font-mono tabular-nums text-text-muted group-hover/bar:text-foreground">
                    {cp.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-micro font-mono">
                  <p className="font-semibold text-foreground">
                    Zadržavanje do {cp.label} dužine
                  </p>
                  <p className="text-text-muted mt-0.5">
                    {formatNumber(cp.count)} pregleda ({formatPercent(cp.pct)})
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Numeric Milestone Summary */}
        <div className="grid grid-cols-4 gap-1 text-center font-mono tabular-nums text-micro">
          {checkpoints.map((cp) => (
            <span key={cp.label} className={cn("truncate", cp.textColor)}>
              {formatPercent(cp.pct)}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
