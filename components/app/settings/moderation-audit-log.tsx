"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  Eye,
  EyeOff,
  Heart,
  HeartOff,
  MessageSquareOff,
  MessageSquareReply,
  MessagesSquare,
  ShieldCheck,
  Trash2,
} from "lucide-react";
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
import { PlatformBadge } from "@/components/app/openreply/platform-badge";
import { StatusPill } from "./status-pill";
import { cn } from "@/lib/utils";

/**
 * The moderation audit log (V3).
 *
 * The panel that finally reads `igModerationLogs` and `fbModerationLogs`. It is
 * built like `action-audit-log` next door on purpose — same table, same pills,
 * same filter chips — because an operator who has learned one audit screen has
 * learned both.
 *
 * One thing is said here that the ads log has no reason to say: which of these
 * actions can be taken back. Hiding is reversible, deleting is not, and after a
 * delete this row holds the only surviving copy of what was removed. That is
 * the whole reason the table is worth keeping, so the row carries the comment
 * itself and marks the one irreversible action instead of colouring every line
 * the same.
 */

type ModerationRow = FunctionReturnType<
  typeof api.moderationLog.listModerationLogs
>[number];
type ModerationAction = ModerationRow["action"];

const LOG_LIMIT = 200;

const ACTION_LABELS: Record<ModerationAction, string> = {
  reply: "Odgovor",
  hide: "Sakrivanje",
  unhide: "Prikazivanje",
  delete: "Brisanje",
  comments_on: "Komentari uključeni",
  comments_off: "Komentari isključeni",
  like: "Lajk",
  unlike: "Uklonjen lajk",
};

const ACTION_ICONS: Record<ModerationAction, typeof Eye> = {
  reply: MessageSquareReply,
  hide: EyeOff,
  unhide: Eye,
  delete: Trash2,
  comments_on: MessagesSquare,
  comments_off: MessageSquareOff,
  like: Heart,
  unlike: HeartOff,
};

/**
 * The one action nothing can take back — not the operator, not Instagram, not
 * this app. Everything else is a switch that can be flipped the other way, so
 * only this one is marked, and it is marked on the row rather than announced
 * in a legend.
 */
const IRREVERSIBLE: ReadonlySet<ModerationAction> = new Set(["delete"]);

type PlatformFilter = "all" | "instagram" | "facebook";
type StatusFilter = "all" | "done" | "failed";

const PLATFORM_FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "Sve platforme" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Svi ishodi" },
  { value: "done", label: "Izvršeno" },
  { value: "failed", label: "Odbijeno" },
];

const timestampFmt = new Intl.DateTimeFormat("sr-Latn-RS", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function ModerationAuditLog() {
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const rows = useQuery(api.moderationLog.listModerationLogs, {
    limit: LOG_LIMIT,
  });

  // Filtered here rather than in the query: both filters narrow the SAME window
  // of the last 200 actions, so the counts always describe one set of rows.
  const filtered = useMemo(() => {
    if (rows === undefined) return [];
    return rows.filter(
      (row) =>
        (platform === "all" || row.platform === platform) &&
        (status === "all" || row.status === status),
    );
  }, [rows, platform, status]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterGroup
          options={PLATFORM_FILTERS}
          value={platform}
          onChange={setPlatform}
        />
        <FilterGroup
          options={STATUS_FILTERS}
          value={status}
          onChange={setStatus}
        />
      </div>

      <Card className="gap-0 overflow-hidden py-0 shadow-card ring-line">
        {rows === undefined ? (
          <ModerationAuditLogSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="mb-3 size-10 text-text-muted/40" />
            <p className="text-sm font-medium text-foreground">
              {rows.length === 0
                ? "Još nijedna radnja moderacije"
                : "Nema radnji sa ovim filterom"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-text-muted">
              {rows.length === 0
                ? "Svaki odgovor, sakrivanje i brisanje komentara upisuje se ovde — i onda kada Instagram ili Facebook radnju odbije."
                : "Promeni platformu ili ishod da vidiš ostale zapise."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
              <p className="text-sm font-medium text-foreground">
                Moderacija komentara
              </p>
              <p className="font-mono text-xs tabular-nums text-text-muted">
                {filtered.length} od poslednjih {LOG_LIMIT} radnji
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
                      Radnja
                    </TableHead>
                    <TableHead className="h-9 text-xs font-medium text-text-muted">
                      Komentar
                    </TableHead>
                    <TableHead className="hidden h-9 text-xs font-medium text-text-muted md:table-cell">
                      Član
                    </TableHead>
                    <TableHead className="h-9 pr-5 text-right text-xs font-medium text-text-muted">
                      Ishod
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const Icon = ACTION_ICONS[row.action];
                    return (
                      <TableRow
                        key={row.id}
                        className="border-line-soft hover:bg-surface-raised/40"
                      >
                        <TableCell className="py-3 pl-5 align-top font-mono text-xs whitespace-nowrap tabular-nums text-text-muted">
                          {timestampFmt.format(new Date(row.createdAt))}
                        </TableCell>

                        <TableCell className="py-3 align-top">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded border",
                                IRREVERSIBLE.has(row.action)
                                  ? "border-danger/30 bg-danger/10 text-danger"
                                  : "border-line bg-surface text-text-muted",
                              )}
                            >
                              <Icon className="size-3" aria-hidden />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium whitespace-nowrap text-foreground">
                                {ACTION_LABELS[row.action]}
                              </p>
                              <PlatformBadge
                                platform={row.platform}
                                short
                                className="mt-0.5"
                              />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="max-w-80 py-3 align-top">
                          <p className="truncate text-xs text-foreground">
                            {row.author ? `@${row.author}` : "—"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.text || "Radnja na celoj objavi"}
                          </p>
                          {row.commentId !== null && (
                            <p className="truncate font-mono text-micro text-text-muted">
                              ID: {row.commentId}
                            </p>
                          )}
                        </TableCell>

                        <TableCell className="hidden max-w-44 py-3 align-top md:table-cell">
                          <p
                            className="truncate text-xs text-text-secondary"
                            title={row.userEmail ?? undefined}
                          >
                            {row.userEmail ?? "Uklonjen član"}
                          </p>
                        </TableCell>

                        <TableCell className="py-3 pr-5 align-top">
                          <div className="flex flex-col items-end gap-1">
                            <StatusPill
                              tone={row.status === "done" ? "success" : "danger"}
                            >
                              {row.status === "done" ? "Izvršeno" : "Odbijeno"}
                            </StatusPill>
                            {row.errorMessage && (
                              <span className="block max-w-56 text-right text-xs whitespace-normal text-danger/80">
                                {row.errorMessage}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function FilterGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-line bg-surface p-0.5 text-xs">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            value === option.value
              ? "bg-surface-raised text-foreground shadow-xs"
              : "text-text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModerationAuditLogSkeleton() {
  return (
    <div>
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-36" />
      </div>
      <div className="border-t border-line-soft">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-b border-line-soft px-5 py-3.5 last:border-0"
          >
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="hidden h-3.5 w-32 md:block" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
