"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { CalendarClock, History, RotateCw, X } from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  KIND_LABELS,
  PUBLISHED_UNCONFIRMED_LABEL,
  STATUS_LABELS,
  pluralFiles,
} from "@/convex/lib/igPublish";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { formatBelgradeShort } from "@/lib/belgrade-time";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Zakazane i neuspele objave — the publishing log (F3).
 *
 * The composer says what is happening to the post being written right now and
 * then forgets it. This is where a post lives afterwards: the one scheduled for
 * Thursday, the one that failed at three in the morning with a reason nobody
 * was awake to read, the one that was called off.
 *
 * Failures are shown with their reason attached rather than behind a click.
 * "Neuspešno" on its own is the least useful word an interface can say.
 */

type PublishJob = FunctionReturnType<typeof api.instagramPublishStore.listJobs>[number];

const STATUS_TONES: Record<PublishJob["status"], string> = {
  draft: "border-line bg-surface text-text-muted",
  queued: "border-line bg-surface text-text-secondary",
  uploading: "border-accent-400/30 bg-accent-400/10 text-accent-400",
  processing: "border-accent-400/30 bg-accent-400/10 text-accent-400",
  publishing: "border-accent-400/30 bg-accent-400/10 text-accent-400",
  published: "border-success/30 bg-success/10 text-success",
  failed: "border-danger/30 bg-danger/10 text-danger",
  canceled: "border-line bg-surface text-text-muted",
};

/**
 * What the badge says. Normally the status, with one exception worth spelling
 * out: a post that went out on a run whose answer was lost is `published` and
 * has no media id, so nothing on this row will ever link anywhere. Saying so
 * costs one phrase and saves the question.
 */
function statusLabel(job: PublishJob): string {
  return job.status === "published" && job.mediaIdUnconfirmed === true
    ? PUBLISHED_UNCONFIRMED_LABEL
    : STATUS_LABELS[job.status];
}

function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

export function PublishJobsPanel() {
  const jobs = useQuery(api.instagramPublishStore.listJobs);
  const cancelJob = useMutation(api.instagramPublishStore.cancelJob);
  const retryJob = useMutation(api.instagramPublishStore.retryJob);

  const [pending, setPending] = useState<{
    job: PublishJob;
    action: "cancel" | "retry";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const run = async () => {
    if (pending === null) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      if (pending.action === "cancel") {
        await cancelJob({ jobId: pending.job._id });
      } else {
        await retryJob({ jobId: pending.job._id });
      }
      setPending(null);
    } catch (err) {
      setErrorMsg(
        convexMessage(
          err,
          pending.action === "cancel"
            ? "Otkazivanje nije uspelo."
            : "Ponovno slanje nije uspelo.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4 p-5 shadow-card">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
          <History className="size-4" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Zakazane i poslate objave
          </h2>
          <p className="text-xs text-text-muted">
            Šta čeka svoj termin, šta je otišlo, i zašto nešto nije
          </p>
        </div>
      </div>

      {errorMsg !== null && (
        <FeedbackNote tone="danger" title={errorMsg} />
      )}

      {jobs === undefined ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface/40 px-3 py-6 text-center text-xs text-text-muted">
          Još nijedna objava nije poslata sa ovog naloga iz panela.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-line-soft bg-surface-raised/50 hover:bg-transparent">
                <TableHead className="h-9 pl-3 text-xs font-medium text-text-muted">
                  Objava
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-text-muted">
                  Status
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-text-muted">
                  Kada
                </TableHead>
                <TableHead className="h-9 pr-3 text-right text-xs font-medium text-text-muted">
                  Radnja
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <JobRow
                  key={job._id}
                  job={job}
                  onCancel={() => setPending({ job, action: "cancel" })}
                  onRetry={() => setPending({ job, action: "retry" })}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(next) => {
          if (!next) {
            setPending(null);
            setErrorMsg(null);
          }
        }}
        title={
          pending?.action === "cancel"
            ? "Otkazati zakazanu objavu?"
            : "Poslati objavu ponovo?"
        }
        description={
          pending === null ? null : pending.action === "cancel" ? (
            <>
              {describeJob(pending.job)} neće otići na Instagram. Red u istoriji
              ostaje, a fajlovi se brišu posle 24 h.
            </>
          ) : (
            <>
              {describeJob(pending.job)} ide na Instagram odmah. Objava je
              nepovratna radnja — sa profila se skida u samoj aplikaciji
              Instagram.
            </>
          )
        }
        confirmLabel={
          pending?.action === "cancel" ? "Otkaži objavu" : "Pošalji ponovo"
        }
        busyLabel={pending?.action === "cancel" ? "Otkazujem…" : "Šaljem…"}
        busy={busy}
        onConfirm={run}
        tone={pending?.action === "cancel" ? "danger" : "accent"}
      />
    </Card>
  );
}

function describeJob(job: PublishJob): string {
  const label = KIND_LABELS[job.kind];
  const files = pluralFiles(job.itemCount);
  const caption = job.caption?.trim();
  const tail = caption ? ` — „${caption.slice(0, 60)}${caption.length > 60 ? "…" : ""}“` : "";
  return `${label} (${files})${tail}`;
}

function JobRow({
  job,
  onCancel,
  onRetry,
}: {
  job: PublishJob;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const hasError = job.error !== undefined && job.error.length > 0;
  const caption = job.caption?.trim();

  return (
    <>
      <TableRow
        className={cn(
          "border-line-soft hover:bg-surface-raised/40",
          hasError && "border-b-0",
        )}
      >
        <TableCell className="max-w-64 py-2 pl-3">
          <span className="block text-xs font-medium text-foreground">
            {KIND_LABELS[job.kind]}
            {job.itemCount > 1 && (
              <span className="ml-1.5 font-mono text-micro text-text-muted">
                ×{job.itemCount}
              </span>
            )}
          </span>
          <span className="block truncate text-micro text-text-muted">
            {caption && caption.length > 0 ? caption : "bez opisa"}
          </span>
        </TableCell>

        <TableCell className="py-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-medium",
              STATUS_TONES[job.status],
            )}
          >
            {statusLabel(job)}
          </span>
          {job.attempts > 1 && job.status !== "published" && (
            <span className="ml-1.5 font-mono text-micro tabular-nums text-text-muted">
              {job.attempts}. pokušaj
            </span>
          )}
        </TableCell>

        <TableCell className="py-2 whitespace-nowrap text-xs text-text-muted">
          {job.status === "published" && job.publishedAt !== undefined ? (
            formatRelativeTime(job.publishedAt)
          ) : job.status === "queued" && job.scheduledFor !== undefined ? (
            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
              <CalendarClock className="size-3" aria-hidden />
              {formatBelgradeShort(job.scheduledFor)}
            </span>
          ) : (
            formatRelativeTime(job.updatedAt)
          )}
        </TableCell>

        <TableCell className="py-2 pr-3 text-right">
          {job.cancellable && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onCancel}
              className="text-text-muted hover:text-danger"
            >
              <X data-icon="inline-start" />
              Otkaži
            </Button>
          )}
          {job.status === "failed" && !job.filesDeleted && (
            <Button type="button" variant="outline" size="xs" onClick={onRetry}>
              <RotateCw data-icon="inline-start" />
              Pokušaj ponovo
            </Button>
          )}
          {job.status === "failed" && job.filesDeleted && (
            <span className="text-micro text-text-muted">Fajlovi obrisani</span>
          )}
        </TableCell>
      </TableRow>

      {hasError && (
        <TableRow className="border-line-soft hover:bg-transparent">
          <TableCell colSpan={4} className="px-3 pb-2 pt-0">
            <p
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-micro leading-relaxed",
                job.status === "failed"
                  ? "border-danger/25 bg-danger/5 text-danger"
                  : "border-warning/25 bg-warning/5 text-warning",
              )}
            >
              {job.error}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
