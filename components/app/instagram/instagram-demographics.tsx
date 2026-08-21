"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Table, BarChart2, Unplug, Users, UserCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "@/components/motion/reveal";
import { EmptyState } from "@/components/app/empty-state";
import { RateLimitBanner } from "@/components/app/rate-limit-banner";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/app/tab-nav";
import {
  PopulationPyramidChart,
  PopulationPyramidSkeleton,
} from "./population-pyramid-chart";
import {
  DemographicsRankingList,
  DemographicsRankingSkeleton,
} from "./demographics-ranking-list";
import { DemographicsTableView } from "./demographics-table";
import {
  DEMOGRAPHIC_TIMEFRAMES,
  DEMOGRAPHIC_TIMEFRAME_LABELS,
  type DemographicMetric,
  type DemographicTimeframe,
} from "@/convex/lib/igDemographics";
import { cn } from "@/lib/utils";

type ViewMode = "chart" | "table";

const METRIC_TABS = [
  { id: "follower" as const, label: "Pratioci", icon: Users },
  { id: "engaged" as const, label: "Angažovana publika", icon: UserCheck },
] as const;

export function InstagramDemographics() {
  const [metric, setMetric] = useState<DemographicMetric>("follower");
  const [timeframe, setTimeframe] =
    useState<DemographicTimeframe>("last_30_days");
  const [viewMode, setViewMode] = useState<ViewMode>("chart");

  const connections = useQuery(api.connections.list);
  const summary = useQuery(api.instagramStore.getDemographicsSummary, {
    metric,
    timeframe,
  });

  const igConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "meta_ig");

  const loading = connections === undefined || summary === undefined;

  return (
    <div className="flex flex-1 flex-col gap-8">
      {/* Rate limit status banner */}
      <RateLimitBanner network="Instagram" />

      {!igConnected ? (
        <EmptyState icon={Unplug}>
          Instagram još nije povezan.{" "}
          <Link
            href="/settings"
            className="text-accent-400 underline-offset-4 hover:underline"
          >
            Poveži ga u podešavanjima
          </Link>
          .
        </EmptyState>
      ) : (
        <>
          {/* Controls in a single row above content */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-2">
            <TabNav
              className="border-b-0 pb-0"
              tabs={METRIC_TABS}
              active={metric}
              onChange={setMetric}
              panelId="demographics-panel"
            />

            <div className="flex shrink-0 items-center gap-3">
              {/* Timeframe picker */}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="demographics-timeframe-select"
                  className="text-xs text-text-muted"
                >
                  Period:
                </label>
                <select
                  id="demographics-timeframe-select"
                  value={timeframe}
                  onChange={(e) =>
                    setTimeframe(e.target.value as DemographicTimeframe)
                  }
                  className="h-8 rounded-xs border border-line bg-surface px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-accent-400 cursor-pointer"
                >
                  {DEMOGRAPHIC_TIMEFRAMES.map((tf) => (
                    <option key={tf} value={tf}>
                      {DEMOGRAPHIC_TIMEFRAME_LABELS[tf]}
                    </option>
                  ))}
                </select>
              </div>

              {/* View mode toggle button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setViewMode((prev) => (prev === "chart" ? "table" : "chart"))
                }
                className="h-8 gap-1.5 text-xs"
                title={
                  viewMode === "chart"
                    ? "Prikaži podatke kao tabelu"
                    : "Prikaži podatke kao grafikon"
                }
              >
                {viewMode === "chart" ? (
                  <>
                    <Table className="size-3.5" aria-hidden />
                    <span>Tabela</span>
                  </>
                ) : (
                  <>
                    <BarChart2 className="size-3.5" aria-hidden />
                    <span>Grafikon</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Demographics Content Area */}
          <div id="demographics-panel" className="flex flex-1 flex-col">
            {loading ? (
              <InstagramDemographicsSkeleton />
            ) : summary.state === "suppressed" ? (
              /*
               * Kad je nalog ispod praga: ekran stoji prazan bez grafikona, bez nula,
               * bez trake napretka — samo jedna rečenica sitnim tekstom.
               */
              <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
                <p className="max-w-md text-xs leading-relaxed text-text-muted">
                  {metric === "follower"
                    ? "Instagram ne isporučuje demografske podatke ispod 100 pratilaca."
                    : "Instagram ne isporučuje demografske podatke ispod 100 angažovanja u izabranom periodu."}
                </p>
              </div>
            ) : summary.state === "unavailable" ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
                <p className="max-w-md text-xs leading-relaxed text-text-muted">
                  {summary.reason ?? "Demografski podaci trenutno nisu dostupni sa Meta API-ja."}
                </p>
              </div>
            ) : summary.state === "empty" ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center p-8 text-center">
                <p className="max-w-md text-xs leading-relaxed text-text-muted">
                  Sinhronizacija demografskih podataka još nije izvršena. Dnevni prolaz se pokreće automatski.
                </p>
              </div>
            ) : (
              /*
               * Kad ima podataka: ulazak kroz Reveal.
               * Menjanje filtera ne okida ponovni Reveal — sveži podaci ulaze kratkim CSS fade prelazom.
               */
              <Reveal>
                <div
                  className={cn(
                    "flex flex-col gap-8 transition-opacity duration-200",
                  )}
                >
                  {viewMode === "table" ? (
                    <DemographicsTableView
                      ageGender={summary.ageGender}
                      countries={summary.countries}
                      cities={summary.cities}
                    />
                  ) : (
                    <>
                      {/* 5.1 Populaciona piramida (Uzrast × pol) */}
                      <PopulationPyramidChart data={summary.ageGender} />

                      {/* 5.2 & 5.3 Države i Gradovi (Horizontalni rang) */}
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <DemographicsRankingList
                          title="Top Države"
                          subtitle="Geografska raspodela"
                          data={summary.countries}
                          isCountry={true}
                        />
                        <DemographicsRankingList
                          title="Top Gradovi"
                          subtitle="Geografska raspodela"
                          data={summary.cities}
                          isCountry={false}
                        />
                      </div>

                      {/* Obavezna napomena ispod rang lista */}
                      <p className="text-xs text-text-muted">
                        Instagram vraća najviše 45 stavki i računa samo
                        posetioce za koje ima demografske podatke, pa je zbir
                        manji od ukupnog broja pratilaca.
                      </p>
                    </>
                  )}
                </div>
              </Reveal>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function InstagramDemographicsSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <PopulationPyramidSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DemographicsRankingSkeleton />
        <DemographicsRankingSkeleton />
      </div>
    </div>
  );
}
