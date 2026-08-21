"use client";

import { Card } from "@/components/ui/card";
import { formatNumber, formatPercent, formatDurationMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { MetricState } from "@/convex/lib/igMetrics";

export interface PostMetricCardProps {
  label: string;
  value?: number;
  unit?: "number" | "ms" | "percent";
  state?: MetricState;
  reason?: string;
  isEstimate?: boolean;
  isOrganicOnly?: boolean;
  description?: string;
  icon?: LucideIcon;
  highlight?: boolean;
  className?: string;
}

export function PostMetricCard({
  label,
  value,
  unit = "number",
  state = "value",
  reason,
  isEstimate = false,
  isOrganicOnly = false,
  description,
  icon: Icon,
  highlight = false,
  className,
}: PostMetricCardProps) {
  const isAvailable = state === "value" && value !== undefined;
  const isSuppressed = state === "suppressed";
  const isUnavailable = state === "unavailable";

  let formattedValue = "—";
  if (isAvailable && value !== undefined) {
    if (unit === "ms") {
      formattedValue = formatDurationMs(value);
    } else if (unit === "percent") {
      // Rates can be 0..1 or 0..100
      const rate = value > 1 ? value / 100 : value;
      formattedValue = formatPercent(rate);
    } else {
      formattedValue = formatNumber(value);
    }
  }

  return (
    <Card
      className={cn(
        "flex flex-col justify-between p-4.5 transition-all shadow-card ring-line",
        highlight && "bg-surface-raised/60 border-accent-400/30",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="heading-caps text-micro font-medium text-text-muted">
              {label}
            </span>
            {isEstimate && (
              <span
                className="rounded-xs border border-line bg-surface-raised px-1.5 py-0.2 text-[10px] font-medium text-text-muted"
                title="Procenjena vrednost"
              >
                Procena
              </span>
            )}
            {isOrganicOnly && (
              <span
                className="rounded-xs border border-line bg-surface-raised px-1.5 py-0.2 text-[10px] font-medium text-text-muted"
                title="Samo organski podaci — interakcije sa oglasa se ne broje"
              >
                Samo organski
              </span>
            )}
          </div>
        </div>

        {Icon && (
          <div className="flex size-7 items-center justify-center rounded-md bg-surface-raised text-text-secondary">
            <Icon className="size-4" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1">
        {isAvailable ? (
          <div className="font-mono text-2xl font-bold tracking-tight text-foreground">
            {formattedValue}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="font-mono text-2xl font-semibold text-text-muted">
              —
            </div>
            {(isSuppressed || isUnavailable) && (
              <p className="text-xs text-text-muted leading-tight">
                {reason ||
                  (isSuppressed
                    ? "Nedovoljno podataka."
                    : "Podatak nije dostupan za ovu objavu.")}
              </p>
            )}
          </div>
        )}

        {description && (
          <p className="mt-1 text-xs text-text-muted leading-relaxed">
            {description}
          </p>
        )}
      </div>
    </Card>
  );
}
