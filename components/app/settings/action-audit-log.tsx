"use client";

import { useState, useMemo } from "react";
import { useProjekatQuery } from "@/components/app/projekat-provider";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { StatusPill } from "./status-pill";
import { EmptyState } from "@/components/app/system/empty-state";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { CILJ_KAMPANJE, NIVO_OGLASA, STATUS_KAMPANJE, naziv } from "@/lib/recnik";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Pause,
  Play,
  Search,
  ShieldCheck,
  TrendingUp,
  User,
} from "lucide-react";

type TargetFilter = "all" | "campaign" | "adset" | "ad";
type StatusFilter = "all" | "success" | "error" | "pending" | "blocked";

function formatTargetType(type: string): string {
  return naziv(NIVO_OGLASA, type, "Objekat");
}

function ActionIcon({ action }: { action: string }) {
  switch (action) {
    case "pause":
      return (
        <span className="flex size-6 items-center justify-center rounded border border-danger/30 bg-danger/10 text-danger">
          <Pause className="size-3" />
        </span>
      );
    case "resume":
      return (
        <span className="flex size-6 items-center justify-center rounded border border-success/30 bg-success/10 text-success">
          <Play className="size-3" />
        </span>
      );
    case "budget_change":
      return (
        <span className="flex size-6 items-center justify-center rounded border border-mod-line bg-mod-soft text-mod">
          <TrendingUp className="size-3" />
        </span>
      );
    case "duplicate":
      return (
        <span className="flex size-6 items-center justify-center rounded border border-line bg-surface text-foreground">
          <Copy className="size-3" />
        </span>
      );
    default:
      return (
        <span className="flex size-6 items-center justify-center rounded border border-line bg-surface text-text-muted">
          <Activity className="size-3" />
        </span>
      );
  }
}

function formatActionTitle(action: string): string {
  switch (action) {
    case "pause":
      return "Pauziranje";
    case "resume":
      return "Aktivacija";
    case "budget_change":
      return "Promena budžeta";
    case "duplicate":
      return "Dupliranje oglasa";
    case "create_campaign":
      return "Pravljenje kampanje";
    case "create_adset":
      return "Pravljenje grupe oglasa";
    case "create_ad":
      return "Pravljenje oglasa";
    default:
      return "Radnja";
  }
}

const statusTekst = (v: unknown) =>
  naziv(STATUS_KAMPANJE, typeof v === "string" ? v : undefined, "nepoznat").toLowerCase();

/** Skraćuje dugačak tekst iz zapisa na jedan red. */
const skratiTekst = (v: string) => (v.length > 80 ? `${v.slice(0, 77)}…` : v);

/**
 * Ljudski redovi umesto sirovih ključeva. Poznat ključ dobija srpski natpis,
 * tehnički ključevi (ID-jevi, API nazivi) se ne ispisuju, a nepoznat ključ
 * nikad ne izlazi sirov.
 */
function parseParamsSummary(paramsStr: string | null): string[] {
  if (!paramsStr) return [];
  try {
    const parsed = JSON.parse(paramsStr) as Record<string, unknown>;
    // Iznos u valuti naloga koju je radnja zapisala. Stari zapisi je nemaju,
    // pa im iznos stoji bez znaka valute — ne pretpostavlja se evro.
    const valuta =
      typeof parsed.currency === "string" && parsed.currency.trim()
        ? parsed.currency.trim()
        : undefined;
    const iznos = (v: number) => formatCurrency(v, valuta);
    const redovi: string[] = [];

    if (typeof parsed.newDailyBudget === "number") {
      const prev = parsed.previousDailyBudget
        ? ` (bilo ${iznos(parsed.previousDailyBudget as number)})`
        : "";
      redovi.push(`Novi budžet: ${iznos(parsed.newDailyBudget)} / dan${prev}`);
    }
    if (typeof parsed.desiredStatus === "string") {
      const bilo =
        typeof parsed.previousStatus === "string"
          ? ` (bilo ${statusTekst(parsed.previousStatus)})`
          : "";
      redovi.push(`Status: ${statusTekst(parsed.desiredStatus)}${bilo}`);
    }
    if (typeof parsed.newName === "string") {
      redovi.push(`Naziv: ${parsed.newName}`);
    } else if (typeof parsed.name === "string") {
      redovi.push(`Naziv: ${parsed.name}`);
    }
    if (typeof parsed.objective === "string") {
      redovi.push(`Cilj: ${naziv(CILJ_KAMPANJE, parsed.objective, "kampanja").toLowerCase()}`);
    }
    if (typeof parsed.channelType === "string") {
      redovi.push(`Vrsta: ${naziv(CILJ_KAMPANJE, parsed.channelType, "kampanja").toLowerCase()}`);
    }
    if (typeof parsed.dailyBudget === "number" && parsed.newDailyBudget === undefined) {
      redovi.push(`Dnevni budžet: ${iznos(parsed.dailyBudget)}`);
    }
    if (typeof parsed.hookLabel === "string" && parsed.hookLabel) {
      redovi.push(`Oznaka verzije: ${parsed.hookLabel}`);
    }
    if (typeof parsed.headline === "string" && parsed.headline) {
      redovi.push(`Naslov: ${skratiTekst(parsed.headline)}`);
    }
    if (typeof parsed.primaryText === "string" && parsed.primaryText) {
      redovi.push(`Tekst: ${skratiTekst(parsed.primaryText)}`);
    }
    if (typeof parsed.createdStatus === "string") {
      redovi.push(`Nastaje kao: ${statusTekst(parsed.createdStatus)}`);
    }
    return redovi;
  } catch {
    return [];
  }
}

export function ActionAuditLog() {
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResponseJson, setSelectedResponseJson] = useState<string | null>(
    null,
  );

  const actions = useProjekatQuery(api.adActionsStore.listActions, {
    targetType: targetFilter,
    status: statusFilter,
    limit: 100,
  });

  const stats = useProjekatQuery(api.adActionsStore.getActionStats);

  // Client-side text search filter
  const filteredActions = useMemo(() => {
    if (!actions) return [];
    if (!searchQuery.trim()) return actions;
    const query = searchQuery.toLowerCase().trim();
    return actions.filter(
      (a) =>
        (a.targetName && a.targetName.toLowerCase().includes(query)) ||
        a.targetId.toLowerCase().includes(query) ||
        (a.user?.email && a.user.email.toLowerCase().includes(query)),
    );
  }, [actions, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Ukupno komandi</span>
            <Activity className="size-4 text-text-muted" />
          </div>
          <span className="text-2xl tabular-nums font-bold text-foreground mt-2 block">
            {stats ? stats.total : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>

        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Uspešno izvršeno</span>
            <CheckCircle2 className="size-4 text-success" />
          </div>
          <span className="text-2xl tabular-nums font-bold text-success mt-2 block">
            {stats ? stats.success : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>

        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Greške / Odbijeno</span>
            <AlertCircle className="size-4 text-danger" />
          </div>
          <span className="text-2xl tabular-nums font-bold text-danger mt-2 block">
            {stats ? stats.error : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>

        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Na čekanju</span>
            <Clock className="size-4 text-warning" />
          </div>
          <span className="text-2xl tabular-nums font-bold text-warning mt-2 block">
            {stats ? stats.pending : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Type Filters */}
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setTargetFilter("all")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                targetFilter === "all"
                  ? "bg-surface-raised text-foreground shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Sve
            </button>
            <button
              type="button"
              onClick={() => setTargetFilter("campaign")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                targetFilter === "campaign"
                  ? "bg-surface-raised text-foreground shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Kampanje
            </button>
            <button
              type="button"
              onClick={() => setTargetFilter("adset")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                targetFilter === "adset"
                  ? "bg-surface-raised text-foreground shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Grupe oglasa
            </button>
            <button
              type="button"
              onClick={() => setTargetFilter("ad")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                targetFilter === "ad"
                  ? "bg-surface-raised text-foreground shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Oglasi
            </button>
          </div>

          {/* Status Filter */}
          <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                statusFilter === "all"
                  ? "bg-surface-raised text-foreground shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Svi statusi
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("success")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                statusFilter === "success"
                  ? "bg-surface-raised text-success shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Uspešno
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("error")}
              className={cn(
                "rounded px-2.5 py-1 font-medium transition-colors",
                statusFilter === "error"
                  ? "bg-surface-raised text-danger shadow-xs"
                  : "text-text-muted hover:text-foreground",
              )}
            >
              Greška
            </button>
          </div>
        </div>

        {/* Text Search */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-text-muted" />
          <Input
            type="text"
            placeholder="Pretraži po nazivu ili ID-ju..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-surface border-line"
          />
        </div>
      </div>

      {/* Main Audit Log Table */}
      <Card className="border-line bg-card overflow-hidden shadow-card">
        {actions === undefined ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filteredActions.length === 0 ? (
          // A7 §1: prazno stanje kaže šta fali, zašto i šta sad. Filter aktivan
          // ≠ „ničega još nema" — razlog i sledeći korak se razlikuju.
          targetFilter !== "all" ||
          statusFilter !== "all" ||
          searchQuery.trim() ? (
            <EmptyState
              icon={Search}
              title="Nema akcija za ovaj filter"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTargetFilter("all");
                    setStatusFilter("all");
                    setSearchQuery("");
                  }}
                >
                  Očisti filtere
                </Button>
              }
            >
              Nijedna zabeležena akcija ne odgovara izabranom filteru ili
              pretrazi. Očisti ih da vidiš ceo revizorski trag.
            </EmptyState>
          ) : (
            <EmptyState icon={ShieldCheck} title="Nema zabeleženih akcija">
              Sve promene statusa, budžeta i dupliranja oglasa biće automatski
              zabeležene ovde sa punim revizorskim tragom.
            </EmptyState>
          )
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  <TableHead className="w-40 text-xs">Vreme</TableHead>
                  <TableHead className="w-36 text-xs">Korisnik</TableHead>
                  <TableHead className="w-44 text-xs">Akcija</TableHead>
                  <TableHead className="text-xs">Meta / Objekat</TableHead>
                  <TableHead className="text-xs">Parametri</TableHead>
                  <TableHead className="w-28 text-center text-xs">Status</TableHead>
                  <TableHead className="w-24 text-right text-xs">Odgovor Mete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActions.map((row) => (
                  <TableRow
                    key={row._id}
                    className="border-line hover:bg-surface/50 transition-colors"
                  >
                    {/* Timestamp */}
                    <TableCell className="text-xs text-text-muted tabular-nums whitespace-nowrap">
                      {formatDateTime(row.executedAt)}
                    </TableCell>

                    {/* User */}
                    <TableCell className="text-xs text-foreground">
                      <div className="flex items-center gap-1.5 truncate max-w-[130px]" title={row.user?.email || "Sistem"}>
                        <User className="size-3 text-text-muted shrink-0" />
                        <span className="truncate">
                          {row.user?.email ? row.user.email.split("@")[0] : "Sistem"}
                        </span>
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        <ActionIcon action={row.action} />
                        <span className="font-medium text-foreground">
                          {formatActionTitle(row.action)}
                        </span>
                      </div>
                    </TableCell>

                    {/* Target Name + ID + Type */}
                    <TableCell className="text-xs">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex rounded bg-surface px-1.5 py-0.5 text-micro font-medium text-text-secondary border border-line-soft">
                            {formatTargetType(row.targetType)}
                          </span>
                          <span
                            className="font-semibold text-foreground truncate max-w-[200px]"
                            title={row.targetName || row.targetId}
                          >
                            {row.targetName || row.targetId}
                          </span>
                        </div>
                        <span className="font-mono text-micro text-text-muted">
                          ID: {row.targetId}
                        </span>
                      </div>
                    </TableCell>

                    {/* Params */}
                    <TableCell className="text-xs text-text-secondary text-micro">
                      {(() => {
                        const redovi = parseParamsSummary(row.params);
                        if (redovi.length === 0) return "—";
                        return redovi.map((red) => <div key={red}>{red}</div>);
                      })()}
                    </TableCell>

                    {/* Status Pill */}
                    <TableCell className="text-center">
                      {row.status === "success" && (
                        <StatusPill tone="success">Uspešno</StatusPill>
                      )}
                      {row.status === "error" && (
                        <StatusPill tone="danger">Greška</StatusPill>
                      )}
                      {row.status === "pending" && (
                        <StatusPill tone="warning">Na čekanju</StatusPill>
                      )}
                      {row.status === "blocked" && (
                        <StatusPill tone="muted">Blokirano</StatusPill>
                      )}
                    </TableCell>

                    {/* Inspect API Response */}
                    <TableCell className="text-right">
                      {row.apiResponse || row.error ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setSelectedResponseJson(
                              row.apiResponse || JSON.stringify({ error: row.error }, null, 2),
                            )
                          }
                          className="h-7 text-xs text-text-muted hover:text-foreground gap-1"
                        >
                          <Code2 className="size-3.5" />
                          <span>Detalji</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* JSON Response Inspect Dialog */}
      <Dialog
        open={selectedResponseJson !== null}
        onOpenChange={(open) => !open && setSelectedResponseJson(null)}
      >
        <DialogPopup className="sm:max-w-lg">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Odgovor Mete</DialogTitle>
            <DialogDescription>
              Sirov odgovor Mete ili detalji greške
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-line bg-background p-3.5 font-mono text-xs text-foreground overflow-auto max-h-80">
            <pre className="whitespace-pre-wrap break-all">
              {(() => {
                if (!selectedResponseJson) return "";
                try {
                  return JSON.stringify(JSON.parse(selectedResponseJson), null, 2);
                } catch {
                  return selectedResponseJson;
                }
              })()}
            </pre>
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
