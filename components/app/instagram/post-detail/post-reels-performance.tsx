"use client";

import { Timer, Clock, FastForward, Share2 } from "lucide-react";
import { PostMetricCard } from "./post-metric-card";
import { cn } from "@/lib/utils";
import type { MetricState } from "@/convex/lib/igMetrics";

export interface PostReelsPerformanceProps {
  avgWatchTimeMs?: number;
  avgWatchTimeState?: MetricState;
  avgWatchTimeReason?: string;
  totalViewTimeMs?: number;
  totalViewTimeState?: MetricState;
  totalViewTimeReason?: string;
  skipRate?: number;
  skipRateState?: MetricState;
  skipRateReason?: string;
  crosspostedViews?: number;
  crosspostedViewsState?: MetricState;
  crosspostedViewsReason?: string;
  className?: string;
}

export function PostReelsPerformance({
  avgWatchTimeMs,
  avgWatchTimeState = "value",
  avgWatchTimeReason,
  totalViewTimeMs,
  totalViewTimeState = "value",
  totalViewTimeReason,
  skipRate,
  skipRateState = "value",
  skipRateReason,
  crosspostedViews,
  crosspostedViewsState = "value",
  crosspostedViewsReason,
  className,
}: PostReelsPerformanceProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1">
        <span className="heading-caps text-micro font-semibold text-accent-400">
          Video analiza
        </span>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Performanse Reels videa
        </h2>
        <p className="text-xs text-text-muted">
          Metrike zadržavanja pažnje gledalaca i vreme provedeno uz video.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PostMetricCard
          label="Prosečno vreme gledanja"
          value={avgWatchTimeMs}
          unit="ms"
          state={avgWatchTimeState}
          reason={avgWatchTimeReason}
          icon={Timer}
          description="Prosečno trajanje gledanja ovog Reels videa po sesiji."
        />

        <PostMetricCard
          label="Ukupno vreme gledanja"
          value={totalViewTimeMs}
          unit="ms"
          state={totalViewTimeState}
          reason={totalViewTimeReason}
          icon={Clock}
          description="Ukupno vreme koje su svi korisnici proveli gledajući video."
        />

        <PostMetricCard
          label="Stopa preskakanja"
          value={skipRate}
          unit="percent"
          state={skipRateState}
          reason={skipRateReason}
          isEstimate
          icon={FastForward}
          description="Procenat gledalaca koji su prekinuli ili preskočili video pre kraja."
        />

        <PostMetricCard
          label="Crosspost pregledi"
          value={crosspostedViews}
          unit="number"
          state={crosspostedViewsState}
          reason={crosspostedViewsReason}
          icon={Share2}
          description="Pregledi ostvareni deljenjem na povezanim profilima i mrežama."
        />
      </div>
    </div>
  );
}
