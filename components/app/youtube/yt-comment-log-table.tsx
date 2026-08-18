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

type YtCommentLogView = FunctionReturnType<
  typeof api.ytAutomationsApi.listCommentLogs
>[number];
type YtCommentLogStatus = YtCommentLogView["status"];

const LOG_LIMIT = 200;

const STATUS_LABELS: Record<YtCommentLogStatus, string> = {
  pending: "Na čekanju",
  replied: "Odgovoreno",
  moderated: "Moderisano",
  failed: "Neuspelo",
  skipped_no_match: "Bez podudaranja",
  skipped_quota: "Kvota potrošena",
};

const STATUS_TONES: Record<
  YtCommentLogStatus,
  "success" | "warning" | "danger" | "muted" | "accent"
> = {
  pending: "warning",
  replied: "success",
  moderated: "accent",
  failed: "danger",
  skipped_no_match: "muted",
  skipped_quota: "warning",
};

const FILTERS: { value: YtCommentLogStatus | "all"; label: string }[] = [
  { value: "all", label: "Sve" },
  { value: "replied", label: STATUS_LABELS.replied },
  { value: "moderated", label: STATUS_LABELS.moderated },
  { value: "pending", label: STATUS_LABELS.pending },
  { value: "failed", label: STATUS_LABELS.failed },
  { value: "skipped_no_match", label: STATUS_LABELS.skipped_no_match },
  { value: "skipped_quota", label: STATUS_LABELS.skipped_quota },
];

const timestampFmt = new Intl.DateTimeFormat("sr-Latn-RS", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Deep link straight to the comment under the video. `lc` is YouTube's own
 * "linked comment" parameter — it scrolls to that comment and highlights it.
 * A comment left on the channel rather than a video has no `videoId`, and
 * there is no address for it, so those rows stay plain text.
 */
function commentUrl(videoId: string, commentId: string): string | null {
  if (videoId.length === 0) return null;
  return `https://www.youtube.com/watch?v=${encodeURIComponent(
    videoId,
  )}&lc=${encodeURIComponent(commentId)}`;
}

export function YtCommentLogTable() {
  const [status, setStatus] = useState<YtCommentLogStatus | "all">("all");
  const logs = useQuery(api.ytAutomationsApi.listCommentLogs, {
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
        <YtCommentLogTableSkeleton />
      ) : logs.length === 0 ? (
        <EmptyState icon={Inbox}>
          {status === "all"
            ? "Još nijedan komentar nije prošao kroz automatizacije. Motor obilazi kanal na svakih nekoliko minuta — YouTube ne šalje komentare sam."
            : "Nema zapisa sa ovim statusom."}
        </EmptyState>
      ) : (
        <Card className="gap-0 py-0 shadow-card ring-line">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 pb-3">
            <p className="text-sm font-medium text-foreground">
              Log komentara
            </p>
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
                    Video
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
                {logs.map((log) => {
                  const url = commentUrl(log.videoId, log.commentId);
                  return (
                    <TableRow
                      key={log._id}
                      className="border-line-soft hover:bg-surface-raised/40"
                    >
                      <TableCell className="py-3 pl-5 align-top font-mono text-xs whitespace-nowrap tabular-nums text-text-muted">
                        {timestampFmt.format(new Date(log.createdAt))}
                      </TableCell>

                      <TableCell className="max-w-72 py-3 align-top">
                        <p className="truncate text-xs font-medium text-foreground">
                          {log.authorName ?? "Nepoznat autor"}
                        </p>
                        {url === null ? (
                          <p className="truncate text-xs text-muted-foreground">
                            {log.commentText}
                          </p>
                        ) : (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-accent-400 hover:underline"
                          >
                            {log.commentText}
                          </a>
                        )}
                      </TableCell>

                      <TableCell className="hidden max-w-48 py-3 align-top md:table-cell">
                        <p className="truncate text-xs text-foreground">
                          {log.videoTitle ??
                            (log.videoId.length > 0 ? (
                              <span className="font-mono">{log.videoId}</span>
                            ) : (
                              "Komentar na kanalu"
                            ))}
                        </p>
                        <p className="truncate text-xs text-text-muted">
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
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}

export function YtCommentLogTableSkeleton() {
  return (
    <Card className="gap-0 py-0 shadow-card ring-line">
      <div className="flex items-baseline justify-between px-5 pt-5 pb-3">
        <Skeleton className="h-4 w-28" />
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
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    </Card>
  );
}
