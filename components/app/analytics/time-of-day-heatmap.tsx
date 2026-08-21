"use client";

import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { ChartCard } from "./chart-card";
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

/** Sekvencijalna skala: jedna nijansa (chart-1) od svetlog ka zasićenom. */
function cellFill(alphaPct: number): string {
  return `color-mix(in oklab, var(--color-chart-1) ${alphaPct}%, transparent)`;
}

export function TimeOfDayHeatmap({ data }: { data: TimeData }) {
  const [hovered, setHovered] = useState<{
    dayName: string;
    hour: number;
    sessions: number;
    totalUsers: number;
    hasData: boolean;
  } | null>(null);

  const maxSessions = data.totals.maxCellSessions;

  return (
    <ChartCard
      title="Aktivnost po satima i danima"
      description="Toplotna mapa raspodele poseta (7 dana × 24 sata) u lokalnoj zoni propertija."
      legend={
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <span>Manje</span>
          <div className="flex h-3 w-24 overflow-hidden rounded border border-line-soft">
            {[8, 26, 48, 70, 95].map((a) => (
              <span
                key={a}
                className="h-full flex-1"
                style={{ backgroundColor: cellFill(a) }}
              />
            ))}
          </div>
          <span>Više</span>
        </div>
      }
      footNote={
        <span>
          Vremenska zona:{" "}
          <span className="font-medium text-text-secondary">
            {data.timeZone}
          </span>{" "}
          (definisana u GA4 podešavanjima)
        </span>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[640px] space-y-1.5">
            <div className="flex items-center gap-1.5 pl-10 text-[10px] font-mono text-text-muted">
              {HOURS.map((h) => (
                <div key={h} className="flex-1 text-center">
                  {h % 3 === 0 ? `${h.toString().padStart(2, "0")}h` : ""}
                </div>
              ))}
            </div>

            {DAYS.map((day) => {
              const dayCells = data.matrix[day.index] ?? [];
              return (
                <div key={day.index} className="flex items-center gap-1.5">
                  <span className="w-8 text-xs font-medium text-text-muted">
                    {day.label}
                  </span>
                  <div className="flex flex-1 items-center gap-1">
                    {HOURS.map((hour) => {
                      const cell = dayCells[hour] ?? {
                        sessions: 0,
                        totalUsers: 0,
                        hasData: false,
                      };

                      let style: React.CSSProperties = {};
                      let classes: string;

                      if (!cell.hasData) {
                        // Nema podatka — isprekidana ivica, bez ispune.
                        classes = "border border-dashed border-line-soft";
                      } else if (cell.sessions === 0) {
                        // Stigla nula — vidljiva, ali najsvetlija; različita od „nema".
                        style = { backgroundColor: cellFill(6) };
                        classes = "border border-line-soft";
                      } else {
                        const ratio =
                          maxSessions > 0 ? cell.sessions / maxSessions : 0;
                        style = { backgroundColor: cellFill(12 + ratio * 83) };
                        classes = "border border-chart-1/20";
                      }

                      return (
                        <div
                          key={hour}
                          style={style}
                          onMouseEnter={() =>
                            setHovered({
                              dayName: day.full,
                              hour,
                              sessions: cell.sessions,
                              totalUsers: cell.totalUsers,
                              hasData: cell.hasData,
                            })
                          }
                          onMouseLeave={() => setHovered(null)}
                          className={cn(
                            "relative h-7 flex-1 rounded-sm transition-transform hover:scale-110 hover:z-10",
                            classes,
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

        <div className="min-h-5 border-t border-line-soft pt-3 text-xs">
          {hovered ? (
            <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
              <span>
                {hovered.dayName},{" "}
                {hovered.hour.toString().padStart(2, "0")}:00–
                {hovered.hour.toString().padStart(2, "0")}:59:
              </span>
              {hovered.hasData ? (
                <span className="font-mono text-text-secondary">
                  {formatNumber(hovered.sessions)} sesija (
                  {formatNumber(hovered.totalUsers)} korisnika)
                </span>
              ) : (
                <span className="italic text-text-muted">nema podataka</span>
              )}
            </div>
          ) : (
            <span className="text-text-muted">
              Pređite mišem preko kvadratića za detalje po satu.
            </span>
          )}
        </div>
      </div>
    </ChartCard>
  );
}

export function TimeOfDayHeatmapSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="px-5 pb-5">
        <Skeleton className="h-[220px] w-full rounded-xl" />
      </div>
    </Card>
  );
}
