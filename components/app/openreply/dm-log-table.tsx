"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Inbox } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/app/empty-state";
import { StatusPill } from "@/components/app/settings/status-pill";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type DmLogView = FunctionReturnType<
  typeof api.orAutomationsApi.listDmLogs
>[number];
type DmLogStatus = DmLogView["status"];

const LOG_LIMIT = 200;

const STATUS_LABELS: Record<DmLogStatus, string> = {
  sent: "Poslato",
  pending: "Na čekanju",
  failed: "Neuspelo",
  skipped_no_match: "Bez podudaranja",
  skipped_window: "Van prozora",
};

const STATUS_TONES: Record<
  DmLogStatus,
  "success" | "warning" | "danger" | "muted"
> = {
  sent: "success",
  pending: "warning",
  failed: "danger",
  skipped_no_match: "muted",
  skipped_window: "muted",
};

const FILTERS: { value: DmLogStatus | "all"; label: string }[] = [
  { value: "all", label: "Sve" },
  { value: "sent", label: STATUS_LABELS.sent },
  { value: "pending", label: STATUS_LABELS.pending },
  { value: "failed", label: STATUS_LABELS.failed },
  { value: "skipped_no_match", label: STATUS_LABELS.skipped_no_match },
  { value: "skipped_window", label: STATUS_LABELS.skipped_window },
];

const timestampFmt = new Intl.DateTimeFormat("sr-Latn-RS", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function DmLogTable() {
  const [status, setStatus] = useState<DmLogStatus | "all">("all");
  const logs = useQuery(api.orAutomationsApi.listDmLogs, {
    status: status === "all" ? undefined : status,
    limit: LOG_LIMIT,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatus(filter.value)}
            aria-pressed={status === filter.value}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              status === filter.value
                ? "border-accent-400 bg-accent-400/10 text-accent-400"
                : "border-line bg-surface text-text-muted hover:bg-surface-raised hover:text-foreground",
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {logs === undefined ? (
        <DmLogTableSkeleton />
      ) : logs.length === 0 ? (
        <EmptyState icon={Inbox}>
          {status === "all"
            ? "Još nijedan komentar nije prošao kroz automatizacije. Zapisi se pojavljuju čim Instagram pošalje prvi webhook."
            : "Nema zapisa sa ovim statusom."}
        </EmptyState>
      ) : (
        <Card className="gap-0 py-0 shadow-card ring-line">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
            <p className="text-sm font-medium text-foreground">DM log</p>
            <p className="font-mono text-xs tabular-nums text-text-muted">
              {formatNumber(logs.length)} od poslednjih {LOG_LIMIT} zapisa
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="border-line-soft hover:bg-transparent">
                  <TableHead className="h-9 pl-5 text-xs font-medium text-text-muted">
                    Vreme
                  </TableHead>
                  <TableHead className="h-9 text-xs font-medium text-text-muted">
                    Komentar
                  </TableHead>
                  <TableHead className="hidden h-9 text-xs font-medium text-text-muted md:table-cell">
                    Automatizacija
                  </TableHead>
                  <TableHead className="hidden h-9 text-xs font-medium text-text-muted lg:table-cell">
                    Ključna reč
                  </TableHead>
                  <TableHead className="h-9 pr-5 text-right text-xs font-medium text-text-muted">
                    Status
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log._id}
                    className="border-line-soft hover:bg-surface-raised/40"
                  >
                    <TableCell className="py-3 pl-5 align-top font-mono text-xs whitespace-nowrap tabular-nums text-text-muted">
                      {timestampFmt.format(new Date(log.createdAt))}
                    </TableCell>

                    <TableCell className="max-w-72 py-3 align-top">
                      <p className="truncate text-xs font-medium text-foreground">
                        {log.commenterUsername
                          ? `@${log.commenterUsername}`
                          : log.commenterId}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {log.commentText}
                      </p>
                    </TableCell>

                    <TableCell className="hidden max-w-48 py-3 align-top md:table-cell">
                      <p className="truncate text-xs text-foreground">
                        {log.automationName ??
                          (log.automationId === null
                            ? "—"
                            : "Obrisana automatizacija")}
                      </p>
                    </TableCell>

                    <TableCell className="hidden py-3 align-top font-mono text-xs text-muted-foreground lg:table-cell">
                      {log.matchedKeyword ?? "—"}
                    </TableCell>

                    <TableCell className="py-3 pr-5 align-top">
                      <div className="flex flex-col items-end gap-1">
                        <StatusPill tone={STATUS_TONES[log.status]}>
                          {STATUS_LABELS[log.status]}
                        </StatusPill>
                        {log.status === "pending" && log.attempts > 0 && (
                          <span className="font-mono text-xs tabular-nums text-text-muted">
                            {log.attempts}. pokušaj
                          </span>
                        )}
                        {log.errorMessage && log.status !== "pending" && (
                          <span className="block max-w-48 text-right text-xs whitespace-normal text-danger/80">
                            {log.errorMessage}
                          </span>
                        )}
                        {log.publicReplyError && (
                          <span className="block max-w-48 text-right text-xs whitespace-normal text-warning">
                            Javni odgovor: {log.publicReplyError}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function DmLogTableSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="hidden h-3.5 w-32 md:block" />
            <Skeleton className="hidden h-3.5 w-20 lg:block" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </Card>
  );
}
