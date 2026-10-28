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
  video3s?: number;
  thruplay?: number;
  videoP25?: number;
  videoP50?: number;
  videoP75?: number;
  videoP95?: number;
  videoP100?: number;
  p25Pct?: number;
  p50Pct?: number;
  p75Pct?: number;
  p100Pct?: number;
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
    retention &&
      ((retention.video3s !== undefined && retention.video3s > 0) ||
        (retention.videoP25 !== undefined && retention.videoP25 > 0) ||
        (retention.thruplay !== undefined && retention.thruplay > 0)),
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

  const checkpoints: {
    label: string;
    count?: number;
    pct?: number;
    color: string;
    textColor: string;
  }[] = [
    {
      label: "25%",
      count: retention.videoP25,
      pct: retention.p25Pct,
      color: "bg-mod-strong",
      textColor: "text-mod",
    },
    {
      label: "50%",
      count: retention.videoP50,
      pct: retention.p50Pct,
      color: "bg-mod-strong/80",
      textColor: "text-mod",
    },
    {
      label: "75%",
      count: retention.videoP75,
      pct: retention.p75Pct,
      color: "bg-mod-strong/60",
      textColor: "text-mod",
    },
    {
      label: "100%",
      count: retention.videoP100,
      pct: retention.p100Pct,
      color: "bg-mod-strong/40",
      textColor: "text-mod",
    },
  ];

  return (
    <TooltipProvider delay={100}>
      <div className={cn("flex flex-col gap-1.5 w-full", className)}>
        {showLabels && (
          <div className="flex items-center justify-between text-micro text-text-muted font-medium">
            <span>Video zadržavanje</span>
            <span className="tabular-nums text-foreground">
              3s:{" "}
              {retention.video3s !== undefined && impressions > 0
                ? formatPercent(retention.video3s / impressions)
                : "—"}
            </span>
          </div>
        )}

        {/* Stepped Mini Bars */}
        <div className="grid grid-cols-4 gap-1.5 items-end h-10 rounded bg-surface-raised/40 p-1 border border-line-soft">
          {checkpoints.map((cp) => {
            const isKnown = cp.count !== undefined && cp.pct !== undefined;
            const fillHeightPct = isKnown
              ? Math.max(8, Math.min(100, Math.round((cp.pct as number) * 100)))
              : 100;

            return (
              <Tooltip key={cp.label}>
                <TooltipTrigger
                  render={
                    <div className="group/bar relative flex flex-col items-center justify-end h-full w-full cursor-pointer" />
                  }
                >
                  {isKnown ? (
                    <div
                      className={cn(
                        "w-full rounded-xs transition-all duration-300 group-hover/bar:brightness-125",
                        cp.color,
                      )}
                      style={{ height: `${fillHeightPct}%` }}
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-xs border border-dashed border-line-soft bg-surface-raised/80 bg-[repeating-linear-gradient(45deg,var(--color-line-soft),var(--color-line-soft)_4px,transparent_4px,transparent_8px)]"
                    />
                  )}
                  <span className="mt-0.5 text-micro tabular-nums text-text-muted group-hover/bar:text-foreground">
                    {cp.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-micro">
                  <p className="font-semibold text-foreground">
                    Zadržavanje do {cp.label} dužine
                  </p>
                  {isKnown ? (
                    <p className="text-text-muted mt-0.5">
                      {formatNumber(cp.count as number)} pregleda ({formatPercent(cp.pct as number)})
                    </p>
                  ) : (
                    <p className="text-text-muted mt-0.5">
                      Meta nije poslala ovu metriku za ovaj oglas
                    </p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Numeric Milestone Summary */}
        <div className="grid grid-cols-4 gap-1 text-center tabular-nums text-micro">
          {checkpoints.map((cp) => (
            <span key={cp.label} className={cn("truncate", cp.textColor)}>
              {cp.pct !== undefined ? formatPercent(cp.pct) : "—"}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}
