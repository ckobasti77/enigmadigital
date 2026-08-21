"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type TimeData = FunctionReturnType<typeof api.analytics.timeOfDay>;

const DAYS = [
  { index: 1, label: "Pon", full: "Ponedeljak" },
  { index: 2, label: "Uto", full: "Utorak" },
  { index: 3, label: "Sre", full: "Sreda" },
  { index: 4, label: "Čet", full: "Četvrtak" },
  { index: 5, label: "Pet", full: "Petak" },
  { index: 6, label: "Sub", full: "Subota" },
  { index: 0, label: "Ned", full: "Nedelja" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeOfDayHeatmap({ data }: { data: TimeData }) {
  const [hoveredCell, setHoveredCell] = useState<{
    dayName: string;
    hour: number;
    sessions: number;
    totalUsers: number;
    hasData: boolean;
  } | null>(null);

  const maxSessions = data.totals.maxCellSessions;

  return (
    <Card className="flex flex-col gap-5 rounded-2xl border border-line bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Aktivnost po satima i danima u nedelji
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Toplotna mapa raspodele poseta (7 dana × 24 sata) u lokalnoj zoni propertija.
          </p>
        </div>

        {/* Monochromatic Scale Indicator */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>Manje</span>
          <div className="flex h-3 w-24 overflow-hidden rounded border border-line">
            <div className="h-full w-1/5 bg-primary/10" />
            <div className="h-full w-1/5 bg-primary/30" />
            <div className="h-full w-1/5 bg-primary/50" />
            <div className="h-full w-1/5 bg-primary/70" />
            <div className="h-full w-1/5 bg-primary/95" />
          </div>
          <span>Više</span>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[640px] space-y-1.5">
          {/* Hours Header */}
          <div className="flex items-center gap-1.5 pl-10 text-[10px] font-mono text-muted-foreground">
            {HOURS.map((h) => (
              <div key={h} className="flex-1 text-center">
                {h % 3 === 0 ? `${h.toString().padStart(2, "0")}h` : ""}
              </div>
            ))}
          </div>

          {/* Matrix Rows */}
          {DAYS.map((day) => {
            const dayCells = data.matrix[day.index] ?? [];
            return (
              <div key={day.index} className="flex items-center gap-1.5">
                {/* Day label */}
                <span className="w-8 text-xs font-medium text-muted-foreground">
                  {day.label}
                </span>

                {/* 24 Hour Cells */}
                <div className="flex flex-1 items-center gap-1">
                  {HOURS.map((hour) => {
                    const cell = dayCells[hour] ?? {
                      sessions: 0,
                      totalUsers: 0,
                      hasData: false,
                    };

                    let bgStyle: React.CSSProperties = {};
                    let cellClasses = "";

                    if (!cell.hasData) {
                      // Empty / no data -> dashed border & pattern
                      cellClasses =
                        "border border-dashed border-line/70 bg-muted/10";
                    } else if (cell.sessions === 0) {
                      // 0 sessions -> lightest sequential tint
                      bgStyle = { backgroundColor: "hsl(var(--primary) / 0.05)" };
                      cellClasses = "border border-line/30";
                    } else {
                      const ratio = maxSessions > 0 ? cell.sessions / maxSessions : 0;
                      const opacity = 0.12 + ratio * 0.83;
                      bgStyle = {
                        backgroundColor: `hsl(var(--primary) / ${opacity})`,
                      };
                      cellClasses = "border border-primary/20";
                    }

                    return (
                      <div
                        key={hour}
                        style={bgStyle}
                        onMouseEnter={() =>
                          setHoveredCell({
                            dayName: day.full,
                            hour,
                            sessions: cell.sessions,
                            totalUsers: cell.totalUsers,
                            hasData: cell.hasData,
                          })
                        }
                        onMouseLeave={() => setHoveredCell(null)}
                        className={cn(
                          "relative h-7 flex-1 rounded-sm cursor-pointer transition-transform hover:scale-110 hover:z-10 hover:shadow",
                          cellClasses,
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dynamic Hover Details / Info Bar */}
      <div className="flex flex-col gap-1 border-t border-line/60 pt-3 sm:flex-row sm:items-center sm:justify-between text-xs">
        <div>
          {hoveredCell ? (
            <div className="flex items-center gap-2 font-medium text-foreground">
              <span>
                {hoveredCell.dayName}, {hoveredCell.hour.toString().padStart(2, "0")}:00 –{" "}
                {hoveredCell.hour.toString().padStart(2, "0")}:59:
              </span>
              {hoveredCell.hasData ? (
                <span className="font-mono text-primary">
                  {formatNumber(hoveredCell.sessions)} sesija (
                  {formatNumber(hoveredCell.totalUsers)} korisnika)
                </span>
              ) : (
                <span className="italic text-muted-foreground">nema podataka</span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">
              Pređite mišem preko kvadratića za detalje po satu.
            </span>
          )}
        </div>

        {/* Required Timezone Disclaimer */}
        <div className="text-[11px] text-muted-foreground">
          * Vremenska zona: <span className="font-medium text-foreground">{data.timeZone}</span> (definisana u GA4 podešavanjima)
        </div>
      </div>
    </Card>
  );
}

export function TimeOfDayHeatmapSkeleton() {
  return (
    <Card className="flex flex-col gap-4 rounded-2xl border border-line p-6 shadow-sm">
      <Skeleton className="h-5 w-56 rounded" />
      <Skeleton className="h-[220px] w-full rounded-xl" />
      <Skeleton className="h-4 w-64 rounded" />
    </Card>
  );
}
