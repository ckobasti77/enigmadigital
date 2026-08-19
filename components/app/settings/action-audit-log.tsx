"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
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
import { cn } from "@/lib/utils";
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

function formatActionDate(ms: number): string {
  const date = new Date(ms);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

function formatTargetType(type: string): string {
  switch (type) {
    case "campaign":
      return "Kampanja";
    case "adset":
      return "Ad Set";
    case "ad":
      return "Oglas";
    default:
      return type;
  }
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
        <span className="flex size-6 items-center justify-center rounded border border-accent-400/30 bg-accent-400/10 text-accent-400">
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
    default:
      return action;
  }
}

function parseParamsSummary(paramsStr: string | null): string {
  if (!paramsStr) return "—";
  try {
    const parsed = JSON.parse(paramsStr);
    if (parsed.newDailyBudget !== undefined) {
      const prev = parsed.previousDailyBudget
        ? ` (bilo ${parsed.previousDailyBudget} €)`
        : "";
      return `Novi budžet: ${parsed.newDailyBudget} € / dan${prev}`;
    }
    if (parsed.desiredStatus) {
      return `Status: ${parsed.desiredStatus}`;
    }
    if (parsed.newName) {
      return `Naziv: ${parsed.newName} (PAUSED)`;
    }
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  } catch {
    return paramsStr;
  }
}

export function ActionAuditLog() {
  const [targetFilter, setTargetFilter] = useState<TargetFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResponseJson, setSelectedResponseJson] = useState<string | null>(
    null,
  );

  const actions = useQuery(api.adActionsStore.listActions, {
    targetType: targetFilter,
    status: statusFilter,
    limit: 100,
  });

  const stats = useQuery(api.adActionsStore.getActionStats, {});

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
          <span className="font-mono text-2xl font-bold text-foreground mt-2 block">
            {stats ? stats.total : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>

        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Uspešno izvršeno</span>
            <CheckCircle2 className="size-4 text-success" />
          </div>
          <span className="font-mono text-2xl font-bold text-success mt-2 block">
            {stats ? stats.success : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>

        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Greške / Odbijeno</span>
            <AlertCircle className="size-4 text-danger" />
          </div>
          <span className="font-mono text-2xl font-bold text-danger mt-2 block">
            {stats ? stats.error : <Skeleton className="h-7 w-12" />}
          </span>
        </Card>

        <Card className="p-4 bg-card border-line shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">Na čekanju</span>
            <Clock className="size-4 text-warning" />
          </div>
          <span className="font-mono text-2xl font-bold text-warning mt-2 block">
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
              Ad Setovi
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
          <div className="flex flex-col items-center justify-center py-16 text-center text-text-muted">
            <ShieldCheck className="size-10 text-text-muted/40 mb-3" />
            <p className="text-sm font-medium text-foreground">
              Nema zabeleženih akcija
            </p>
            <p className="text-xs text-text-muted mt-1 max-w-sm">
              Sve promene statusa, budžeta i dupliranja oglasa biće automatski
              zabeležene ovde sa punim revizorskim tragom.
            </p>
          </div>
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
                  <TableHead className="w-24 text-right text-xs">API Odgovor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActions.map((row) => (
                  <TableRow
                    key={row._id}
                    className="border-line hover:bg-surface/50 transition-colors"
                  >
                    {/* Timestamp */}
                    <TableCell className="font-mono text-xs text-text-muted tabular-nums whitespace-nowrap">
                      {formatActionDate(row.executedAt)}
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
                    <TableCell className="text-xs text-text-secondary font-mono text-micro">
                      {parseParamsSummary(row.params)}
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
                          className="h-7 text-xs text-text-muted hover:text-accent-400 gap-1"
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
            <DialogTitle>Odgovor Meta Marketing API-ja</DialogTitle>
            <DialogDescription>
              Sirovi odgovor Graph API servera ili detalji greške
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
