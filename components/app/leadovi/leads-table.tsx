"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import type { LeadScore, InvalidRule } from "@/convex/lib/leadScoring";

type TemperaturaType = "nova_firma" | "cold" | "warm" | "hot";
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Filter,
  Flame,
  Info,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackNote } from "@/components/app/feedback";
import { LeadScoreCell } from "./lead-score-cell";
import { LeadExportDialog } from "./lead-export-dialog";
import { LEAD_STAGE_LABELS, leadStageLabel, leadSignalLabel } from "./lead-labels";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const ALL_STAGES: readonly LeadStage[] = [
  "nov",
  "u_radu",
  "poslata_ponuda",
  "sastanak",
  "dobijen",
  "izgubljen",
  "odlozen",
];

type SortKey = "fit" | "intent" | "name" | "lastTouch" | "nextAction" | "signals";
type SortDirection = "asc" | "desc";

type LeadTableRowItem = {
  assignment: Doc<"leadAssignments">;
  company: Doc<"leadCompanies"> | null;
  isOverdue?: boolean;
  delayMs?: number;
};

type LeadsTableProps = {
  workspaceId: Id<"workspaces">;
  onInvalidRulesFound?: (invalidRules: InvalidRule[]) => void;
};

/**
 * Poredi dva opciona vremena tako da red BEZ vrednosti uvek završi na kraju
 * liste, nezavisno od smera sortiranja.
 *
 * Vraća `null` kad obe vrednosti postoje — tada poređenje radi pozivalac.
 *
 * Kad jedna nedostaje, rezultat je KONAČAN i namerno ne zavisi od smera:
 * pozivalac ga vraća odmah, pre nego što stigne do množenja sa -1. „Na kraj"
 * znači na kraj i kad se sortira rastuće i kad se sortira opadajuće.
 */
function compareOptionalTime(
  a: number | undefined,
  b: number | undefined,
): number | null {
  const aMissing = a === undefined;
  const bMissing = b === undefined;
  if (!aMissing && !bMissing) return null;
  if (aMissing && bMissing) return 0;
  return aMissing ? 1 : -1;
}

export function LeadsTable({ workspaceId, onInvalidRulesFound }: LeadsTableProps) {
  const [filterMode, setFilterMode] = useState<"stage" | "overdue">("stage");
  const [selectedStage, setSelectedStage] = useState<LeadStage>("nov");
  const [page, setPage] = useState<number>(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [actionError, setActionError] = useState<string | null>(null);

  const setCompanyTemperaturaMutation = useMutation(
    api.leadCrmStore.setCompanyTemperatura,
  );

  const handleTemperaturaChange = async (
    companyId: Id<"leadCompanies">,
    temperatura: TemperaturaType,
  ) => {
    try {
      setActionError(null);
      await setCompanyTemperaturaMutation({
        workspaceId,
        companyId,
        temperatura,
      });
    } catch (err: unknown) {
      if (err instanceof ConvexError) {
        const data = err.data as { code?: string; message?: string };
        setActionError(`[${data.code || "greška"}]: ${data.message || err.message}`);
      } else if (err instanceof Error) {
        setActionError(err.message);
      } else {
        setActionError(String(err));
      }
    }
  };

  // Query za leadove po fazi
  const stageData = useQuery(
    api.leadCrmStore.listByStage,
    filterMode === "stage"
      ? {
          workspaceId,
          stage: selectedStage,
          limit: 200,
        }
      : "skip",
  );

  // Query za zaostale leadove
  const overdueData = useQuery(
    api.leadCrmStore.listOverdue,
    filterMode === "overdue"
      ? {
          workspaceId,
          limit: 200,
        }
      : "skip",
  );

  const activeData = filterMode === "stage" ? stageData : overdueData;
  const isLoading = activeData === undefined;

  const rawItems: LeadTableRowItem[] = useMemo(() => {
    if (!activeData) return [];
    return activeData.items as LeadTableRowItem[];
  }, [activeData]);

  // Paginacija: 25 leadova po strani
  const totalItems = rawItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(Math.max(page, 1), totalPages);

  const currentPageItems = useMemo(() => {
    const start = (validPage - 1) * PAGE_SIZE;
    return rawItems.slice(start, start + PAGE_SIZE);
  }, [rawItems, validPage]);

  // Tvrda granica SCORE_COMPANIES_LIMIT (100): ocene se traže SAMO za ID-jeve na tekućoj strani
  const currentPageCompanyIds = useMemo(() => {
    return currentPageItems
      .map((item: LeadTableRowItem) => item.company?._id)
      .filter((id): id is Id<"leadCompanies"> => Boolean(id));
  }, [currentPageItems]);

  const scoresQuery = useQuery(
    api.leadScoringStore.scoreCompanies,
    currentPageCompanyIds.length > 0
      ? {
          workspaceId,
          companyIds: currentPageCompanyIds,
        }
      : "skip",
  );
  const scores = scoresQuery as Record<string, LeadScore> | undefined;

  // Prosleđivanje pronađenih nevalidnih pravila roditeljskoj komponenti.
  //
  // Mora biti `useEffect`, ne `useMemo`: ovo poziva `setState` roditelja, a to
  // je propratni efekat. Iz `useMemo` se izvršava TOKOM crtanja, pa React
  // prijavljuje ažuriranje jedne komponente dok se druga crta i, u lošem
  // slučaju, ulazi u petlju.
  useEffect(() => {
    if (scores && onInvalidRulesFound) {
      const invalidRulesMap = new Map<string, InvalidRule>();
      for (const score of Object.values(scores)) {
        if (score && Array.isArray(score.invalidRules)) {
          for (const rule of score.invalidRules) {
            const key = `${rule.ruleName}-${rule.signalKind}-${rule.razlog}`;
            if (!invalidRulesMap.has(key)) {
              invalidRulesMap.set(key, rule);
            }
          }
        }
      }
      onInvalidRulesFound(Array.from(invalidRulesMap.values()));
    }
  }, [scores, onInvalidRulesFound]);

  // Sortiranje SE RADI ISKLJUČIVO UNUTAR TEKUĆE PRIKAZANE STRANE (§4, KORAK 4)
  const sortedItems = useMemo(() => {
    if (!sortKey) return currentPageItems;

    return [...currentPageItems].sort((a: LeadTableRowItem, b: LeadTableRowItem) => {
      const companyA = a.company;
      const companyB = b.company;
      const scoreA: LeadScore | undefined = companyA ? scores?.[companyA._id] : undefined;
      const scoreB: LeadScore | undefined = companyB ? scores?.[companyB._id] : undefined;

      let comparison = 0;

      switch (sortKey) {
        case "fit": {
          const valA = scoreA?.fit.points ?? -1;
          const valB = scoreB?.fit.points ?? -1;
          comparison = valA - valB;
          break;
        }
        case "intent": {
          const valA = scoreA?.intent.points ?? -1;
          const valB = scoreB?.intent.points ?? -1;
          comparison = valA - valB;
          break;
        }
        case "name": {
          const nameA = companyA?.name ?? "";
          const nameB = companyB?.name ?? "";
          comparison = nameA.localeCompare(nameB, "sr");
          break;
        }
        // „Nikad dodirnut" i „nema sledećeg koraka" NISU vreme 0. Sa nulom bi
        // lead bez planiranog koraka pri rastućem sortiranju ispao NAJHITNIJI,
        // jer je 1970. pre svega. Takvi redovi idu na kraj u oba smera.
        case "lastTouch": {
          const rank = compareOptionalTime(
            a.assignment.lastTouchAt,
            b.assignment.lastTouchAt,
          );
          if (rank !== null) return rank;
          comparison =
            (a.assignment.lastTouchAt as number) -
            (b.assignment.lastTouchAt as number);
          break;
        }
        case "nextAction": {
          const rank = compareOptionalTime(
            a.assignment.nextActionAt,
            b.assignment.nextActionAt,
          );
          if (rank !== null) return rank;
          comparison =
            (a.assignment.nextActionAt as number) -
            (b.assignment.nextActionAt as number);
          break;
        }
        case "signals": {
          const sigA = (scoreA?.fit.signalsCounted ?? 0) + (scoreA?.intent.signalsCounted ?? 0);
          const sigB = (scoreB?.fit.signalsCounted ?? 0) + (scoreB?.intent.signalsCounted ?? 0);
          comparison = sigA - sigB;
          break;
        }
      }

      return sortDir === "asc" ? comparison : -comparison;
    });
  }, [currentPageItems, sortKey, sortDir, scores]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "desc") {
        setSortDir("asc");
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  // Upit vraća najviše `granica` redova. Ako ih ima još, „od 200 leadova"
  // nije ukupan broj u toj fazi nego broj koji je stigao — a tabela bez ove
  // razlike tvrdi da je to sve što postoji.
  const odsecenoNaGranici = activeData?.mozdaImaJos === true;
  const granica =
    activeData && "granica" in activeData
      ? (activeData.granica as number | undefined)
      : undefined;

  const startItemIndex = (validPage - 1) * PAGE_SIZE + 1;
  const endItemIndex = Math.min(validPage * PAGE_SIZE, totalItems);

  return (
    <div className="flex flex-col gap-5">
      {/* Kontrole filtera (faze i zaostali) */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="mr-1 text-xs font-semibold text-text-muted">Faze toka:</div>
          {ALL_STAGES.map((stage) => {
            const isSelected = filterMode === "stage" && selectedStage === stage;
            return (
              <button
                key={stage}
                type="button"
                onClick={() => {
                  setFilterMode("stage");
                  setSelectedStage(stage);
                  setPage(1);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                  isSelected
                    ? "bg-accent-400 text-surface-highest shadow-sm font-semibold"
                    : "bg-surface-raised border border-line text-text-muted hover:text-foreground hover:border-line-strong",
                )}
              >
                {leadStageLabel(stage)}
              </button>
            );
          })}

          <div className="mx-1 h-4 w-px bg-line" />

          <button
            type="button"
            onClick={() => {
              setFilterMode("overdue");
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              filterMode === "overdue"
                ? "bg-danger text-white shadow-sm font-semibold"
                : "bg-surface-raised border border-line text-danger hover:border-danger/40 hover:bg-danger/10",
            )}
          >
            <Clock className="size-3.5" />
            <span>Samo zaostali</span>
          </button>
        </div>

        {/* Informacija o straničenju i izvoz */}
        <div className="flex items-center gap-3">
          {!isLoading && totalItems > 0 && (
            <div className="text-xs text-text-muted">
              Prikazano <strong>{startItemIndex}–{endItemIndex}</strong> od{" "}
              <strong>{totalItems}</strong>{" "}
              {odsecenoNaGranici ? "učitanih leadova" : "leadova"}
            </div>
          )}
          <LeadExportDialog
            workspaceId={workspaceId}
            initialStage={filterMode === "stage" ? selectedStage : undefined}
          />
        </div>
      </div>

      {/* Lista je odsečena na granici upita — to se ne prećutkuje */}
      {odsecenoNaGranici && (
        <FeedbackNote tone="warning" title="Lista nije potpuna">
          Učitano je {totalItems} leadova, koliko upit najviše vraća
          {granica !== undefined ? ` (granica: ${granica})` : ""}. Ima ih još
          iza te granice. Broj strana i sortiranje odnose se samo na učitani
          deo — suzi filter po fazi ili vlasniku da bi video ostale.
        </FeedbackNote>
      )}

      {/* Napomena o sortiranju unutar tekuće strane */}
      {sortKey && (
        <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface-raised/50 px-3 py-2 text-micro text-text-muted">
          <Info className="size-3.5 text-accent-400 shrink-0" />
          <span>
            Sortiranje ({sortKey}, {sortDir === "asc" ? "rastuće" : "opadajuće"}) se
            primenjuje <strong>isključivo unutar prikazane strane od 25 leadova</strong>.
          </span>
        </div>
      )}

      {/* Greška pri promeni temperature */}
      {actionError && (
        <FeedbackNote tone="danger" title="Greška pri promeni temperature">
          {actionError}
        </FeedbackNote>
      )}

      {/* Glavna tabela leadova */}
      <Card className="border-line bg-surface">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-line bg-surface-raised/50 hover:bg-surface-raised/50">
                  {/* Firma i grad */}
                  <TableHead className="w-56 font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Firma i grad</span>
                      {sortKey === "name" ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 text-accent-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>

                  {/* Fit (profil kupca) */}
                  <TableHead className="w-32 font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => handleSort("fit")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Fit</span>
                      {sortKey === "fit" ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 text-accent-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>

                  {/* Intent (namera) */}
                  <TableHead className="w-32 font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => handleSort("intent")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Intent</span>
                      {sortKey === "intent" ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 text-accent-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>

                  {/* Faza toka */}
                  <TableHead className="w-28 font-semibold text-text-muted">Faza</TableHead>

                  {/* Temperatura */}
                  <TableHead className="w-32 font-semibold text-text-muted">Temperatura</TableHead>

                  {/* Vlasnik */}
                  <TableHead className="w-28 font-semibold text-text-muted">Vlasnik</TableHead>

                  {/* Poslednji dodir */}
                  <TableHead className="w-36 font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => handleSort("lastTouch")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Poslednji dodir</span>
                      {sortKey === "lastTouch" ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 text-accent-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>

                  {/* Sledeći korak */}
                  <TableHead className="w-48 font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => handleSort("nextAction")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Sledeći korak</span>
                      {sortKey === "nextAction" ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 text-accent-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>

                  {/* Signali (broj) */}
                  <TableHead className="w-36 font-semibold text-text-muted">
                    <button
                      type="button"
                      onClick={() => handleSort("signals")}
                      className="flex items-center gap-1 hover:text-foreground cursor-pointer"
                    >
                      <span>Signali</span>
                      {sortKey === "signals" ? (
                        sortDir === "asc" ? (
                          <ArrowUp className="size-3.5 text-accent-400" />
                        ) : (
                          <ArrowDown className="size-3.5 text-accent-400" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`} className="border-line">
                      <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : sortedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-text-muted">
                      {filterMode === "stage"
                        ? `Nema leadova u fazi „${leadStageLabel(selectedStage)}".`
                        : "Nema zaostalih leadova u radnom prostoru."}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedItems.map((item: LeadTableRowItem) => {
                    const company = item.company;
                    const assignment = item.assignment;
                    const companyId = company?._id;
                    const score: LeadScore | undefined = companyId
                      ? scores?.[companyId]
                      : undefined;

                    const signalsCount = score
                      ? score.fit.signalsCounted + score.intent.signalsCounted
                      : undefined;

                    const isOverdue =
                      item.isOverdue ||
                      (assignment.nextActionAt !== undefined &&
                        assignment.nextActionAt < Date.now());

                    return (
                      <TableRow
                        key={assignment._id}
                        className={cn(
                          "border-line transition-colors hover:bg-surface-raised/60",
                          company?.temperatura === "hot" &&
                            "border-l-[3px] border-l-[var(--temp-hot)] bg-[var(--temp-hot-bg)]",
                          company?.temperatura === "warm" &&
                            "border-l-[3px] border-l-[var(--temp-warm)] bg-[var(--temp-warm-bg)]",
                          company?.temperatura === "cold" &&
                            "border-l-[3px] border-l-[var(--temp-cold)] bg-[var(--temp-cold-bg)]",
                        )}
                      >
                        {/* 1. Firma i grad */}
                        <TableCell className="font-medium text-foreground">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {companyId ? (
                                <Link
                                  href={`/leadovi/${companyId}`}
                                  className="font-bold hover:text-accent-400 hover:underline transition-colors"
                                >
                                  {company ? company.name : "Nepoznata firma"}
                                </Link>
                              ) : (
                                <span className="font-bold">
                                  {company ? company.name : "Nepoznata firma"}
                                </span>
                              )}
                              {company?.origin && (
                                <span
                                  className={cn(
                                    "rounded px-1.5 py-0.2 text-micro font-semibold",
                                    company.origin === "inbound"
                                      ? "bg-accent-400/10 text-accent-400 border border-accent-400/30"
                                      : "bg-surface-raised text-text-muted border border-line",
                                  )}
                                >
                                  {company.origin === "inbound" ? "Inbound" : "Uvoz"}
                                </span>
                              )}
                            </div>

                            {company?.city && (
                              <span className="text-micro text-text-muted">
                                {company.city}
                                {company.municipality && `, ${company.municipality}`}
                              </span>
                            )}

                            {company?.addressNeedsVerification && (
                              <span className="text-micro text-warning">
                                (proveriti adresu)
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* 2. Fit osa */}
                        <TableCell>
                          <LeadScoreCell axis="fit" score={score?.fit} />
                        </TableCell>

                        {/* 3. Intent osa */}
                        <TableCell>
                          <LeadScoreCell axis="intent" score={score?.intent} />
                        </TableCell>

                        {/* 4. Faza */}
                        <TableCell>
                          <span className="inline-flex rounded-md border border-line bg-surface-raised px-2 py-1 text-xs font-semibold text-foreground">
                            {leadStageLabel(assignment.stage)}
                          </span>
                        </TableCell>

                        {/* 5. Temperatura */}
                        <TableCell>
                          {companyId ? (
                            <select
                              value={company?.temperatura || "nova_firma"}
                              onChange={(e) =>
                                handleTemperaturaChange(
                                  companyId,
                                  e.target.value as TemperaturaType,
                                )
                              }
                              className={cn(
                                "w-full rounded-md border px-2 py-1 text-xs font-medium outline-none transition-colors cursor-pointer",
                                company?.temperatura === "hot" &&
                                  "border-[var(--temp-hot)]/40 bg-[var(--temp-hot-bg)] text-foreground font-semibold",
                                company?.temperatura === "warm" &&
                                  "border-[var(--temp-warm)]/40 bg-[var(--temp-warm-bg)] text-foreground font-semibold",
                                company?.temperatura === "cold" &&
                                  "border-[var(--temp-cold)]/40 bg-[var(--temp-cold-bg)] text-foreground font-semibold",
                                (!company?.temperatura ||
                                  company?.temperatura === "nova_firma") &&
                                  "border-line-soft bg-surface-raised text-text-secondary",
                              )}
                            >
                              <option value="nova_firma" className="bg-surface text-foreground">Nova firma</option>
                              <option value="cold" className="bg-surface text-foreground">Cold</option>
                              <option value="warm" className="bg-surface text-foreground">Warm</option>
                              <option value="hot" className="bg-surface text-foreground">Hot</option>
                            </select>
                          ) : (
                            <span className="text-text-muted/60 select-none">—</span>
                          )}
                        </TableCell>

                        {/* 6. Vlasnik */}
                        <TableCell className="text-xs text-text-muted">
                          <div className="flex items-center gap-1.5">
                            <User className="size-3.5 text-text-soft shrink-0" />
                            <span className="truncate max-w-[100px]" title={assignment.ownerUserId}>
                              Član tima
                            </span>
                          </div>
                        </TableCell>

                        {/* 6. Poslednji dodir */}
                        <TableCell className="text-xs text-text-muted whitespace-nowrap">
                          {assignment.lastTouchAt ? (
                            formatDateTime(assignment.lastTouchAt)
                          ) : (
                            <span className="text-text-soft">—</span>
                          )}
                        </TableCell>

                        {/* 7. Sledeći korak */}
                        <TableCell className="text-xs">
                          {assignment.nextActionAt ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <Calendar className="size-3 text-text-muted shrink-0" />
                                <span
                                  className={cn(
                                    "font-medium",
                                    isOverdue ? "text-danger font-semibold" : "text-foreground",
                                  )}
                                >
                                  {formatDateTime(assignment.nextActionAt)}
                                </span>
                                {isOverdue && (
                                  <span className="rounded bg-danger/10 px-1 py-0.2 text-micro font-bold text-danger">
                                    Kasni
                                  </span>
                                )}
                              </div>
                              {assignment.nextActionNote && (
                                <span className="italic text-text-muted line-clamp-1">
                                  „{assignment.nextActionNote}"
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-soft">—</span>
                          )}
                        </TableCell>

                        {/* 8. Signali (broj + nepokriveni signali) */}
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-foreground">
                              {signalsCount !== undefined ? `${signalsCount} signala` : "—"}
                            </span>

                            {/* Tiha napomena za signale bez pravila (§4, KORAK 3.5) */}
                            {score?.unmatchedSignalKinds && score.unmatchedSignalKinds.length > 0 && (
                              <span
                                className="text-micro text-text-soft"
                                title={`Signali bez pravila: ${score.unmatchedSignalKinds.map(leadSignalLabel).join(", ")}`}
                              >
                                Bez pravila:{" "}
                                <strong className="text-text-muted">
                                  {score.unmatchedSignalKinds.length}
                                </strong>
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Kontrole straničenja */}
      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line pt-3">
          <div className="text-xs text-text-muted">
            Strana <strong>{validPage}</strong> od <strong>{totalPages}</strong> (po 25 leadova)
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={validPage <= 1}
              className="text-xs gap-1 cursor-pointer"
            >
              <ChevronLeft className="size-3.5" />
              Prethodna
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={validPage >= totalPages}
              className="text-xs gap-1 cursor-pointer"
            >
              Sledeća
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
