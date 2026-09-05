"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LeadStage } from "@/convex/leadCrmStore";
import type { LeadScore, InvalidRule } from "@/convex/lib/leadScoring";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Rows2,
  Rows4,
  User,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import { TooltipProvider } from "@/components/ui/tooltip";
import { FeedbackNote } from "@/components/app/feedback";
import { SegmentedToggle } from "@/components/app/analytics/segmented-toggle";
import { useWorkspace } from "@/components/app/workspace-provider";
import { useNow } from "@/components/app/use-now";
import { Unfold } from "@/components/motion/unfold";
import { LeadScoreCell } from "./lead-score-cell";
import { LeadExportDialog } from "./lead-export-dialog";
import { LeadRowActions, type RowDialogKind } from "./lead-row-actions";
import { LeadExpandedRow } from "./lead-expanded-row";
import { LeadCallStrip } from "./lead-call-strip";
import {
  ALL_STAGES,
  StageChip,
  TemperatureSelect,
  type Temperatura,
} from "./lead-chips";
import {
  AssignDialog,
  MeetingDialog,
  NextActionDialog,
  OutcomeDialog,
  StageDialog,
  TouchDialog,
  getErrorMessage,
} from "./lead-quick-dialogs";
import { leadStageLabel, leadSignalLabel } from "./lead-labels";
import {
  ROW_EDGE_CLASS,
  UNTOUCHED_LIMIT_DAYS,
  isMeetingSoon,
  isMeetingToday,
  isMeetingUnresolved,
  isNextActionOverdue,
  isUntouchedTooLong,
  rowEdge,
  type LeadRowItem,
} from "./lead-urgency";
import {
  formatClockTime,
  formatDateTime,
  formatDayRelative,
  formatDaysAgo,
  pluralSr,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;
/** Broj kolona — za `colSpan` proširenog reda i trake posle poziva. */
const COLUMN_COUNT = 11;
const DENSITY_KEY = "enigma.leadovi.density";

function readDensity(): Density {
  try {
    return typeof window !== "undefined" &&
      localStorage.getItem(DENSITY_KEY) === "compact"
      ? "compact"
      : "comfortable";
  } catch {
    return "comfortable";
  }
}

type SortKey = "fit" | "intent" | "name" | "lastTouch" | "nextAction" | "signals";
type SortDirection = "asc" | "desc";
type Density = "compact" | "comfortable";
type Focus = "overdue" | "meetingToday" | "untouched" | null;

type DialogState =
  | { kind: "meeting"; item: LeadRowItem; calledPhone?: string }
  | { kind: "nextAction" | "outcome" | "touch" | "assign"; item: LeadRowItem }
  | { kind: "stage"; item: LeadRowItem; stage: LeadStage };

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

function SortHead({
  label,
  sortKey: key,
  activeKey,
  direction,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey | null;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = activeKey === key;
  return (
    <TableHead
      className={cn("font-semibold text-text-muted", className)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(key)}
        className="flex cursor-pointer items-center gap-1 hover:text-foreground"
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="size-3.5 text-accent-400" />
          ) : (
            <ArrowDown className="size-3.5 text-accent-400" />
          )
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

/**
 * Jedan broj u traci iznad tabele (§7). Nula NIJE dugme: filter na prazan
 * skup nema šta da uradi, pa se ne crta kontrola koja ne može da radi.
 */
function FocusChip({
  count,
  label,
  tone,
  active,
  onToggle,
}: {
  count: number;
  label: string;
  tone: "danger" | "warning";
  active: boolean;
  onToggle: () => void;
}) {
  if (count === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft px-2.5 py-1 text-text-muted">
        <span className="font-mono tabular-nums">0</span>
        <span>{label}</span>
      </span>
    );
  }
  const idle =
    tone === "danger"
      ? "border-danger/40 text-danger hover:bg-danger/10"
      : "border-warning/40 text-warning hover:bg-warning/10";
  const on =
    tone === "danger"
      ? "border-danger bg-danger/15 text-danger ring-1 ring-danger/40"
      : "border-warning bg-warning/15 text-warning ring-1 ring-warning/40";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 font-medium transition-colors",
        active ? on : idle,
      )}
    >
      <span className="font-mono font-bold tabular-nums">{count}</span>
      <span>{label}</span>
    </button>
  );
}

export function LeadsTable({ workspaceId, onInvalidRulesFound }: LeadsTableProps) {
  const { user } = useWorkspace();
  const [filterMode, setFilterMode] = useState<"stage" | "overdue">("stage");
  const [selectedStage, setSelectedStage] = useState<LeadStage>("nov");
  const [focus, setFocus] = useState<Focus>(null);
  const [page, setPage] = useState<number>(1);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [actionError, setActionError] = useState<string | null>(null);
  // Gustina je navika, ne stanje podataka — sme u localStorage. Tabela se
  // crta tek na klijentu (posle učitavanja radnog prostora), pa lenji
  // inicijalizator ne pravi razliku između servera i klijenta.
  const [density, setDensity] = useState<Density>(readDensity);
  // Otvoreni redovi se NE pamte između učitavanja (§6): lažno pamćenje je
  // gore od nikakvog.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [callStrip, setCallStrip] = useState<{
    assignmentId: string;
    phone: string;
  } | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const changeDensity = (next: Density) => {
    setDensity(next);
    try {
      localStorage.setItem(DENSITY_KEY, next);
    } catch {
      /* isto */
    }
  };

  const setCompanyTemperaturaMutation = useMutation(
    api.leadCrmStore.setCompanyTemperatura,
  );

  const handleTemperaturaChange = async (
    companyId: Id<"leadCompanies">,
    temperatura: Temperatura,
  ) => {
    try {
      setActionError(null);
      await setCompanyTemperaturaMutation({ workspaceId, companyId, temperatura });
    } catch (err: unknown) {
      setActionError(getErrorMessage(err));
    }
  };

  const stageData = useQuery(
    api.leadCrmStore.listByStage,
    filterMode === "stage"
      ? { workspaceId, stage: selectedStage, limit: 200 }
      : "skip",
  );

  const overdueData = useQuery(
    api.leadCrmStore.listOverdue,
    filterMode === "overdue" ? { workspaceId, limit: 200 } : "skip",
  );

  const activeData = filterMode === "stage" ? stageData : overdueData;
  const isLoading = activeData === undefined;
  const now = useNow();

  const rawItems: LeadRowItem[] = useMemo(() => {
    if (!activeData) return [];
    return activeData.items as LeadRowItem[];
  }, [activeData]);

  // Traka iznad tabele broji UČITANU listu — jedini skup koji postoji bez
  // novog upita. Brojevi važe za ono što je na ekranu, i to se i piše.
  const counts = useMemo(() => {
    let overdue = 0;
    let meetingToday = 0;
    let untouched = 0;
    for (const item of rawItems) {
      if (isNextActionOverdue(item.assignment, now)) overdue++;
      if (isMeetingToday(item.assignment, now)) meetingToday++;
      if (isUntouchedTooLong(item.assignment, now)) untouched++;
    }
    return { overdue, meetingToday, untouched };
  }, [rawItems, now]);

  const focusedItems = useMemo(() => {
    if (!focus) return rawItems;
    return rawItems.filter((item) => {
      switch (focus) {
        case "overdue":
          return isNextActionOverdue(item.assignment, now);
        case "meetingToday":
          return isMeetingToday(item.assignment, now);
        case "untouched":
          return isUntouchedTooLong(item.assignment, now);
      }
    });
  }, [rawItems, focus, now]);

  const totalItems = focusedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const validPage = Math.min(Math.max(page, 1), totalPages);

  const currentPageItems = useMemo(() => {
    const start = (validPage - 1) * PAGE_SIZE;
    return focusedItems.slice(start, start + PAGE_SIZE);
  }, [focusedItems, validPage]);

  // Tvrda granica SCORE_COMPANIES_LIMIT (100): ocene se traže SAMO za ID-jeve na tekućoj strani
  const currentPageCompanyIds = useMemo(() => {
    return currentPageItems
      .map((item) => item.company?._id)
      .filter((id): id is Id<"leadCompanies"> => Boolean(id));
  }, [currentPageItems]);

  const scoresQuery = useQuery(
    api.leadScoringStore.scoreCompanies,
    currentPageCompanyIds.length > 0
      ? { workspaceId, companyIds: currentPageCompanyIds }
      : "skip",
  );
  const scores = scoresQuery as Record<string, LeadScore> | undefined;
  const scoresLoading = currentPageCompanyIds.length > 0 && scoresQuery === undefined;

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

    return [...currentPageItems].sort((a, b) => {
      const companyA = a.company;
      const companyB = b.company;
      const scoreA: LeadScore | undefined = companyA ? scores?.[companyA._id] : undefined;
      const scoreB: LeadScore | undefined = companyB ? scores?.[companyB._id] : undefined;

      let comparison = 0;

      switch (sortKey) {
        case "fit": {
          comparison = (scoreA?.fit.points ?? -1) - (scoreB?.fit.points ?? -1);
          break;
        }
        case "intent": {
          comparison = (scoreA?.intent.points ?? -1) - (scoreB?.intent.points ?? -1);
          break;
        }
        case "name": {
          comparison = (companyA?.name ?? "").localeCompare(companyB?.name ?? "", "sr");
          break;
        }
        // „Nikad dodirnut" i „nema sledećeg koraka" NISU vreme 0. Sa nulom bi
        // lead bez planiranog koraka pri rastućem sortiranju ispao NAJHITNIJI,
        // jer je 1970. pre svega. Takvi redovi idu na kraj u oba smera.
        case "lastTouch": {
          const rank = compareOptionalTime(a.assignment.lastTouchAt, b.assignment.lastTouchAt);
          if (rank !== null) return rank;
          comparison = (a.assignment.lastTouchAt as number) - (b.assignment.lastTouchAt as number);
          break;
        }
        case "nextAction": {
          const rank = compareOptionalTime(a.assignment.nextActionAt, b.assignment.nextActionAt);
          if (rank !== null) return rank;
          comparison = (a.assignment.nextActionAt as number) - (b.assignment.nextActionAt as number);
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
      if (sortDir === "desc") setSortDir("asc");
      else setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const resetView = () => {
    setPage(1);
    setFocus(null);
    setExpanded(new Set());
    setCallStrip(null);
  };

  const toggleFocus = (next: Exclude<Focus, null>) => {
    setFocus((cur) => (cur === next ? null : next));
    setPage(1);
  };

  const toggleExpanded = (assignmentId: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(assignmentId)) next.delete(assignmentId);
      else next.add(assignmentId);
      return next;
    });
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

  const cell = density === "compact" ? "px-2 py-1" : "px-3 py-2.5";
  const selfUserId = user?.id;

  const emptyMessage = (() => {
    if (focus === "overdue") {
      return `Nijedan od ${rawItems.length} učitanih leadova nije zaostao.`;
    }
    if (focus === "meetingToday") {
      return `Nijedan od ${rawItems.length} učitanih leadova nema sastanak danas.`;
    }
    if (focus === "untouched") {
      return `Svi učitani leadovi imaju dodir u poslednjih ${UNTOUCHED_LIMIT_DAYS} dana.`;
    }
    return filterMode === "stage"
      ? `Nema leadova u fazi „${leadStageLabel(selectedStage)}".`
      : "Nema zaostalih leadova u radnom prostoru.";
  })();

  return (
    <TooltipProvider delay={150}>
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
                  aria-pressed={isSelected}
                  onClick={() => {
                    setFilterMode("stage");
                    setSelectedStage(stage);
                    resetView();
                  }}
                  className={cn(
                    "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-accent-400 font-semibold text-text-inverse shadow-sm"
                      : "border border-line bg-surface-raised text-text-muted hover:border-line-strong hover:text-foreground",
                  )}
                >
                  {leadStageLabel(stage)}
                </button>
              );
            })}

            <div className="mx-1 h-4 w-px bg-line" />

            <button
              type="button"
              aria-pressed={filterMode === "overdue"}
              onClick={() => {
                setFilterMode("overdue");
                resetView();
              }}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                filterMode === "overdue"
                  ? "bg-danger font-semibold text-text-inverse shadow-sm"
                  : "border border-line bg-surface-raised text-danger hover:border-danger/40 hover:bg-danger/10",
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
                Prikazano{" "}
                <strong className="tabular-nums">
                  {startItemIndex}–{endItemIndex}
                </strong>{" "}
                od <strong className="tabular-nums">{totalItems}</strong>{" "}
                {focus ? "izdvojenih" : odsecenoNaGranici ? "učitanih leadova" : "leadova"}
              </div>
            )}
            <LeadExportDialog
              workspaceId={workspaceId}
              initialStage={filterMode === "stage" ? selectedStage : undefined}
            />
          </div>
        </div>

        {/* Traka hitnosti (§7): brojevi koji filtriraju + gustina */}
        {!isLoading && rawItems.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-text-muted">U učitanoj listi:</span>
            <FocusChip
              count={counts.overdue}
              label={pluralSr(counts.overdue, "zaostao", "zaostala", "zaostalih")}
              tone="danger"
              active={focus === "overdue"}
              onToggle={() => toggleFocus("overdue")}
            />
            <FocusChip
              count={counts.meetingToday}
              label={`${pluralSr(counts.meetingToday, "sastanak", "sastanka", "sastanaka")} danas`}
              tone="warning"
              active={focus === "meetingToday"}
              onToggle={() => toggleFocus("meetingToday")}
            />
            <FocusChip
              count={counts.untouched}
              label={`bez dodira ${UNTOUCHED_LIMIT_DAYS}+ dana`}
              tone="danger"
              active={focus === "untouched"}
              onToggle={() => toggleFocus("untouched")}
            />
            <div className="ml-auto">
              <SegmentedToggle
                ariaLabel="Gustina tabele"
                value={density}
                onChange={changeDensity}
                options={[
                  { value: "compact", label: "Kompaktno", icon: Rows4 },
                  { value: "comfortable", label: "Udobno", icon: Rows2 },
                ]}
              />
            </div>
          </div>
        )}

        {/* Lista je odsečena na granici upita — to se ne prećutkuje */}
        {odsecenoNaGranici && (
          <FeedbackNote tone="warning" title="Lista nije potpuna">
            Učitano je {rawItems.length} leadova, koliko upit najviše vraća
            {granica !== undefined ? ` (granica: ${granica})` : ""}. Ima ih još
            iza te granice. Brojevi u traci, strane i sortiranje odnose se samo
            na učitani deo — suzi filter po fazi da bi video ostale.
          </FeedbackNote>
        )}

        {/* Napomena o sortiranju unutar tekuće strane */}
        {sortKey && (
          <div className="flex items-center gap-2 rounded-lg border border-line-soft bg-surface-raised/50 px-3 py-2 text-micro text-text-muted">
            <Info className="size-3.5 shrink-0 text-accent-400" />
            <span>
              Sortiranje ({sortKey}, {sortDir === "asc" ? "rastuće" : "opadajuće"}) se
              primenjuje <strong>isključivo unutar prikazane strane od 25 leadova</strong>.
            </span>
          </div>
        )}

        {actionError && (
          <FeedbackNote
            tone="danger"
            title="Radnja nije sačuvana"
            action={
              <Button size="xs" variant="ghost" onClick={() => setActionError(null)}>
                Zatvori
              </Button>
            }
          >
            {actionError}
          </FeedbackNote>
        )}

        {/* Glavna tabela leadova */}
        <Card className="border-line bg-surface">
          <CardContent className="p-0">
            <Table className={density === "compact" ? "text-xs" : undefined}>
              <TableHeader>
                <TableRow className="border-line bg-surface-raised/50 hover:bg-surface-raised/50">
                  <TableHead className="w-8 border-l-[3px] border-l-transparent pr-0">
                    <span className="sr-only">Proširi</span>
                  </TableHead>
                  <SortHead
                    label="Firma i grad"
                    sortKey="name"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={handleSort}
                    className="w-56"
                  />
                  <SortHead label="Fit" sortKey="fit" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="w-32" />
                  <SortHead label="Intent" sortKey="intent" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="w-32" />
                  <TableHead className="w-28 font-semibold text-text-muted">Faza</TableHead>
                  <TableHead className="w-32 font-semibold text-text-muted">Temperatura</TableHead>
                  <TableHead className="w-24 font-semibold text-text-muted">Vlasnik</TableHead>
                  <SortHead label="Poslednji dodir" sortKey="lastTouch" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="w-36" />
                  <SortHead label="Sledeći korak / sastanak" sortKey="nextAction" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="w-52" />
                  <SortHead label="Signali" sortKey="signals" activeKey={sortKey} direction={sortDir} onSort={handleSort} className="w-32" />
                  <TableHead className="sticky right-0 z-[2] w-[7.75rem] border-l border-line-soft bg-[color-mix(in_srgb,var(--surface-raised)_50%,var(--surface))] text-right font-semibold text-text-muted">
                    Akcije
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`} className="border-line border-l-[3px] border-l-transparent">
                      <TableCell className={cell}><Skeleton className="size-5 rounded-md" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-40" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-8 w-24" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-8 w-24" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-7 w-28" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-24" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-32" /></TableCell>
                      <TableCell className={cell}><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell className={cn(cell, "sticky right-0 border-l border-line-soft bg-surface")}><Skeleton className="ml-auto h-7 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : sortedItems.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal py-12 text-center text-text-muted">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedItems.map((item) => {
                    const company = item.company;
                    const assignment = item.assignment;
                    const companyId = assignment.companyId;
                    const score: LeadScore | undefined = company ? scores?.[company._id] : undefined;
                    const signalsCount = score
                      ? score.fit.signalsCounted + score.intent.signalsCounted
                      : undefined;

                    const overdue = isNextActionOverdue(assignment, now);
                    const meetingSoon = isMeetingSoon(assignment, now);
                    const meetingUnresolved = isMeetingUnresolved(assignment, now);
                    const untouchedTooLong = isUntouchedTooLong(assignment, now);
                    const edge = rowEdge(item, now);
                    const edgeClass = edge ? ROW_EDGE_CLASS[edge] : "border-l-transparent";
                    const isExpanded = expanded.has(assignment._id);
                    const stripPhone =
                      callStrip?.assignmentId === assignment._id ? callStrip.phone : null;
                    const isMine = selfUserId !== undefined && String(assignment.ownerUserId) === selfUserId;
                    const assignedAt = assignment.createdAt ?? assignment._creationTime;
                    const expandId = `lead-expand-${assignment._id}`;

                    const openDialog = (kind: RowDialogKind) => setDialog({ kind, item });

                    return [
                      <TableRow
                        key={assignment._id}
                        className={cn(
                          "group/row border-line border-l-[3px] transition-colors hover:bg-surface-raised has-aria-expanded:bg-surface-raised",
                          edgeClass,
                          (isExpanded || stripPhone) && "border-b-0 bg-surface-raised",
                        )}
                      >
                        {/* 0. Strelica */}
                        <TableCell className={cn(cell, "w-8 pr-0")}>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-expanded={isExpanded}
                            aria-controls={expandId}
                            aria-label={isExpanded ? "Skupi red" : "Proširi red"}
                            onClick={() => toggleExpanded(assignment._id)}
                            className="text-text-muted hover:text-foreground"
                          >
                            <ChevronDown
                              className={cn(
                                "size-3.5 transition-transform duration-(--duration-base)",
                                isExpanded && "rotate-180",
                              )}
                            />
                          </Button>
                        </TableCell>

                        {/* 1. Firma i grad */}
                        <TableCell className={cn(cell, "font-medium text-foreground")}>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Link
                                href={`/leadovi/${companyId}`}
                                className="truncate font-bold transition-colors hover:text-accent-400 hover:underline"
                              >
                                {company ? company.name : "Nepoznata firma"}
                              </Link>
                              {company?.origin === "inbound" && (
                                <span className="rounded border border-accent-400/30 bg-accent-400/10 px-1.5 py-px text-micro font-semibold text-accent-400">
                                  Inbound
                                </span>
                              )}
                            </div>

                            {density === "comfortable" && company?.city && (
                              <span className="text-micro text-text-muted">
                                {company.city}
                                {company.municipality && `, ${company.municipality}`}
                              </span>
                            )}

                            {density === "comfortable" && company?.addressNeedsVerification && (
                              <span className="text-micro text-warning">(proveriti adresu)</span>
                            )}
                          </div>
                        </TableCell>

                        {/* 2. Fit */}
                        <TableCell className={cell}>
                          <LeadScoreCell axis="fit" score={score?.fit} compact={density === "compact"} />
                        </TableCell>

                        {/* 3. Intent */}
                        <TableCell className={cell}>
                          <LeadScoreCell axis="intent" score={score?.intent} compact={density === "compact"} />
                        </TableCell>

                        {/* 4. Faza */}
                        <TableCell className={cell}>
                          <StageChip stage={assignment.stage} />
                        </TableCell>

                        {/* 5. Temperatura */}
                        <TableCell className={cell}>
                          {company ? (
                            <TemperatureSelect
                              ariaLabel={`Temperatura: ${company.name}`}
                              value={company.temperatura}
                              onChange={(t) => handleTemperaturaChange(company._id, t)}
                              className="w-full"
                            />
                          ) : (
                            <span className="text-text-muted">nepoznata firma</span>
                          )}
                        </TableCell>

                        {/* 6. Vlasnik */}
                        <TableCell className={cn(cell, "text-xs text-text-muted")}>
                          <div className="flex items-center gap-1.5" title={String(assignment.ownerUserId)}>
                            <User className="size-3.5 shrink-0" />
                            <span className={cn("truncate", isMine && "font-semibold text-foreground")}>
                              {isMine ? "Ti" : "Član tima"}
                            </span>
                          </div>
                        </TableCell>

                        {/* 7. Poslednji dodir */}
                        <TableCell className={cn(cell, "text-xs")}>
                          {assignment.lastTouchAt !== undefined ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-text-muted">{formatDateTime(assignment.lastTouchAt)}</span>
                              <span
                                className={cn(
                                  "text-micro",
                                  untouchedTooLong ? "font-semibold text-danger" : "text-text-muted",
                                )}
                              >
                                {formatDaysAgo(assignment.lastTouchAt, now)}
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className={untouchedTooLong ? "font-semibold text-danger" : "text-text-muted"}>
                                Bez dodira
                              </span>
                              <span className="text-micro text-text-muted">
                                dodeljen {formatDaysAgo(assignedAt, now)}
                              </span>
                            </div>
                          )}
                        </TableCell>

                        {/* 8. Sledeći korak / sastanak */}
                        <TableCell className={cn(cell, "text-xs")}>
                          <div className="flex flex-col gap-0.5">
                            {assignment.nextActionAt !== undefined ? (
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <Calendar className={cn("size-3 shrink-0", overdue ? "text-danger" : "text-text-muted")} />
                                <span className={overdue ? "font-semibold text-danger" : "font-medium text-foreground"}>
                                  {formatDayRelative(assignment.nextActionAt, now)}{" "}
                                  {formatClockTime(assignment.nextActionAt)}
                                </span>
                                {overdue && (
                                  <span className="rounded bg-danger/10 px-1 py-px text-micro font-bold text-danger">
                                    Kasni
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-text-muted">Nema koraka</span>
                            )}
                            {density === "comfortable" && assignment.nextActionNote && (
                              <span className="line-clamp-1 italic text-text-muted">
                                „{assignment.nextActionNote}”
                              </span>
                            )}
                            {assignment.meetingAt !== undefined && (
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <CalendarClock
                                  className={cn(
                                    "size-3 shrink-0",
                                    meetingUnresolved ? "text-danger" : meetingSoon ? "text-warning" : "text-text-muted",
                                  )}
                                />
                                <span
                                  className={cn(
                                    meetingUnresolved
                                      ? "font-semibold text-danger"
                                      : meetingSoon
                                        ? "font-semibold text-warning"
                                        : "text-foreground",
                                  )}
                                >
                                  Sastanak {formatDayRelative(assignment.meetingAt, now)}{" "}
                                  {formatClockTime(assignment.meetingAt)}
                                </span>
                                {meetingUnresolved && (
                                  <span className="rounded bg-danger/10 px-1 py-px text-micro font-bold text-danger">
                                    bez ishoda
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>

                        {/* 9. Signali */}
                        <TableCell className={cn(cell, "text-xs")}>
                          {scoresLoading ? (
                            <Skeleton className="h-4 w-16" />
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold tabular-nums text-foreground">
                                {signalsCount !== undefined
                                  ? `${signalsCount} ${pluralSr(signalsCount, "signal", "signala", "signala")}`
                                  : "nije ocenjeno"}
                              </span>
                              {score?.unmatchedSignalKinds && score.unmatchedSignalKinds.length > 0 && (
                                <span
                                  className="text-micro text-text-muted"
                                  title={`Signali bez pravila: ${score.unmatchedSignalKinds.map(leadSignalLabel).join(", ")}`}
                                >
                                  Bez pravila: <strong className="tabular-nums">{score.unmatchedSignalKinds.length}</strong>
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>

                        {/* 10. Akcije — lepljivo desno */}
                        <TableCell
                          className={cn(
                            cell,
                            "sticky right-0 z-[1] border-l border-line-soft bg-surface transition-colors group-hover/row:bg-surface-raised",
                            (isExpanded || stripPhone) && "bg-surface-raised",
                          )}
                        >
                          <LeadRowActions
                            workspaceId={workspaceId}
                            item={item}
                            now={now}
                            selfUserId={selfUserId}
                            onCall={(phone) => setCallStrip({ assignmentId: assignment._id, phone })}
                            onOpenDialog={openDialog}
                            onOpenStageDialog={(stage) => setDialog({ kind: "stage", item, stage })}
                            onError={setActionError}
                          />
                        </TableCell>
                      </TableRow>,

                      stripPhone ? (
                        <TableRow
                          key={`${assignment._id}-call`}
                          className={cn(
                            "border-line border-l-[3px] bg-surface-raised hover:bg-surface-raised",
                            edgeClass,
                            isExpanded && "border-b-0",
                          )}
                        >
                          <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal p-0">
                            <Unfold>
                              <LeadCallStrip
                                workspaceId={workspaceId}
                                companyId={companyId}
                                phone={stripPhone}
                                onClose={() => setCallStrip(null)}
                                onScheduleMeeting={() =>
                                  setDialog({ kind: "meeting", item, calledPhone: stripPhone })
                                }
                                onRecordOutcome={() => openDialog("outcome")}
                                onNextStep={() => openDialog("nextAction")}
                                className="border-t border-line-soft bg-accent-400/5 px-4 py-2.5"
                              />
                            </Unfold>
                          </TableCell>
                        </TableRow>
                      ) : null,

                      isExpanded ? (
                        <TableRow
                          key={`${assignment._id}-expand`}
                          id={expandId}
                          className={cn(
                            "border-line border-l-[3px] bg-surface-raised/40 hover:bg-surface-raised/40",
                            edgeClass,
                          )}
                        >
                          <TableCell colSpan={COLUMN_COUNT} className="whitespace-normal p-0 align-top">
                            <Unfold>
                              <LeadExpandedRow
                                workspaceId={workspaceId}
                                item={item}
                                now={now}
                                onCall={(phone) => setCallStrip({ assignmentId: assignment._id, phone })}
                                onOpenDialog={openDialog}
                              />
                            </Unfold>
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Kontrole straničenja */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-line pt-3">
            <div className="text-xs text-text-muted">
              Strana <strong className="tabular-nums">{validPage}</strong> od{" "}
              <strong className="tabular-nums">{totalPages}</strong> (po 25 leadova)
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={validPage <= 1}
                className="cursor-pointer gap-1 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                Prethodna
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                disabled={validPage >= totalPages}
                className="cursor-pointer gap-1 text-xs"
              >
                Sledeća
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Dijalozi radnji iz reda — jedan primerak, vezan za izabrani red */}
        {dialog && (() => {
          const base = {
            workspaceId,
            companyId: dialog.item.assignment.companyId,
            companyName: dialog.item.company?.name ?? "Nepoznata firma",
            open: true,
            onOpenChange: (open: boolean) => {
              if (!open) setDialog(null);
            },
          };
          const a = dialog.item.assignment;
          switch (dialog.kind) {
            case "meeting":
              return (
                <MeetingDialog
                  {...base}
                  current={
                    a.meetingAt !== undefined
                      ? { meetingAt: a.meetingAt, meetingNote: a.meetingNote }
                      : null
                  }
                  currentStage={a.stage}
                  calledPhone={dialog.calledPhone}
                />
              );
            case "nextAction":
              return (
                <NextActionDialog
                  {...base}
                  current={
                    a.nextActionAt !== undefined
                      ? { nextActionAt: a.nextActionAt, nextActionNote: a.nextActionNote }
                      : null
                  }
                />
              );
            case "outcome":
              return <OutcomeDialog {...base} />;
            case "touch":
              return <TouchDialog {...base} />;
            case "assign":
              return <AssignDialog {...base} currentOwnerUserId={a.ownerUserId} />;
            case "stage":
              return (
                <StageDialog {...base} currentStage={a.stage} initialStage={dialog.stage} />
              );
          }
        })()}
      </div>
    </TooltipProvider>
  );
}
