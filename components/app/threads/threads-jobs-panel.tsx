"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import {
  AlertCircle,
  CalendarClock,
  Clock,
  History,
  Info,
  Layers,
  RotateCw,
  Type,
  X,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import {
  MEDIA_TYPE_LABELS,
  PUBLISHED_UNCONFIRMED_LABEL,
  STATUS_LABELS,
  type ThreadsPublishStatus,
} from "@/convex/lib/threadsPublish";
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
import { formatBelgradeShort } from "@/lib/belgrade-time";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type PublishJob =
  FunctionReturnType<typeof api.threadsPublishStore.listJobs>[number];

const STATUS_TONES: Record<ThreadsPublishStatus, string> = {
  draft: "border-line bg-surface text-text-muted",
  queued: "border-line bg-surface-raised text-text-secondary",
  uploading: "border-accent-400/30 bg-accent-400/10 text-accent-400 animate-pulse",
  processing: "border-accent-400/30 bg-accent-400/10 text-accent-400 animate-pulse",
  publishing: "border-accent-400/30 bg-accent-400/10 text-accent-400 animate-pulse",
  published: "border-success/30 bg-success/10 text-success",
  failed: "border-danger/30 bg-danger/10 text-danger",
  canceled: "border-line bg-surface text-text-muted line-through opacity-70",
};

export function ThreadsJobsPanel() {
  const jobs = useQuery(api.threadsPublishStore.listJobs);
  const cancelJob = useMutation(api.threadsPublishStore.cancelJob);
  const retryJob = useMutation(api.threadsPublishStore.retryJob);

  const [pending, setPending] = useState<{
    job: PublishJob;
    action: "cancel" | "retry";
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleActionConfirm = async () => {
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
      if (err instanceof ConvexError) {
        const data = err.data as { message?: string } | undefined;
        setErrorMsg(data?.message ?? "Operacija nije uspela.");
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg("Došlo je do neočekivane greške.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (jobs === undefined) {
    return <ThreadsJobsPanelSkeleton />;
  }

  if (jobs.length === 0) {
    return (
      <Card className="p-6 text-center shadow-card ring-line">
        <div className="flex flex-col items-center justify-center gap-2">
          <History className="size-8 text-text-muted" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-foreground">
            Nema poslova za objavljivanje
          </h3>
          <p className="text-xs text-text-muted max-w-sm">
            Ovde će se prikazivati red poslova, zakazane objave, trenutni upload statusi i istorija poslatih objava.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Card className="overflow-hidden p-0 shadow-card ring-line">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="size-4 text-accent-400" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-foreground">
              Red i istorija objavljivanja ({jobs.length})
            </h3>
          </div>
          <span className="text-micro text-text-muted">
            Prikazano najnovijih {jobs.length} poslova
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-surface-raised/40">
              <TableRow className="border-b border-line text-xs">
                <TableHead className="py-2.5 font-medium">Tip</TableHead>
                <TableHead className="py-2.5 font-medium">Sadržaj objave</TableHead>
                <TableHead className="py-2.5 font-medium">Status</TableHead>
                <TableHead className="py-2.5 font-medium">Termin / Vreme</TableHead>
                <TableHead className="py-2.5 font-medium text-center">Pokušaji</TableHead>
                <TableHead className="py-2.5 text-right font-medium">Akcije</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-line/40 text-xs">
              {jobs.map((job) => {
                const unconfirmed =
                  job.status === "published" && job.mediaIdUnconfirmed === true;

                return (
                  <TableRow key={job._id} className="hover:bg-surface-raised/50">
                    {/* Tip */}
                    <TableCell className="py-3 font-medium">
                      <span className="inline-flex items-center gap-1 rounded bg-bg-950/80 px-2 py-0.5 font-mono text-micro text-text-primary">
                        {MEDIA_TYPE_LABELS[job.mediaType]}
                      </span>
                    </TableCell>

                    {/* Sadržaj */}
                    <TableCell className="py-3 max-w-xs">
                      <div className="flex flex-col">
                        <p className="line-clamp-2 text-foreground/90 leading-relaxed font-sans">
                          {job.text || <span className="italic text-text-muted">Bez teksta</span>}
                        </p>
                        {job.itemCount > 0 && (
                          <span className="mt-1 font-mono text-micro text-text-muted">
                            {job.itemCount} {job.itemCount === 1 ? "fajl" : "fajlova"}
                          </span>
                        )}
                        {job.error && (
                          <span className="mt-1 line-clamp-2 text-micro text-danger">
                            {job.error}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-3">
                      {unconfirmed ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-micro font-semibold text-warning">
                            {PUBLISHED_UNCONFIRMED_LABEL}
                          </span>
                          <span className="text-micro text-text-muted">
                            Objava je poslata, ali ID nije potvrđen
                          </span>
                        </div>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5 text-micro font-semibold",
                            STATUS_TONES[job.status],
                          )}
                        >
                          {STATUS_LABELS[job.status]}
                        </span>
                      )}
                    </TableCell>

                    {/* Termin */}
                    <TableCell className="py-3 text-text-muted">
                      {job.scheduledFor ? (
                        <div className="flex items-center gap-1">
                          <CalendarClock className="size-3 text-accent-400" />
                          <span>{formatBelgradeShort(job.scheduledFor)}</span>
                        </div>
                      ) : job.publishedAt ? (
                        <span>{formatRelativeTime(job.publishedAt)}</span>
                      ) : (
                        <span>Odmah</span>
                      )}
                    </TableCell>

                    {/* Pokušaji */}
                    <TableCell className="py-3 text-center font-mono tabular-nums text-text-secondary">
                      {job.attempts}
                    </TableCell>

                    {/* Akcije */}
                    <TableCell className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {job.status === "failed" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPending({ job, action: "retry" })}
                            className="h-7 gap-1 px-2 text-xs"
                          >
                            <RotateCw className="size-3" aria-hidden="true" />
                            <span>Pokušaj ponovo</span>
                          </Button>
                        )}

                        {job.cancellable && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPending({ job, action: "cancel" })}
                            className="h-7 gap-1 px-2 text-xs text-danger hover:bg-danger/10 hover:text-danger"
                          >
                            <X className="size-3" aria-hidden="true" />
                            <span>Otkaži</span>
                          </Button>
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

      {/* Confirm dialog za otkazivanje / ponovni pokušaj */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.action === "cancel"
            ? "Otkaži objavu"
            : "Ponovi slanje objave"
        }
        description={
          pending?.action === "cancel"
            ? "Da li ste sigurni da želite da otkažete ovu zakazanu objavu? Posao će biti uklonjen iz reda za slanje."
            : "Posao će ponovo biti stavljen u red za slanje na Threads sa istim parametrima i fajlovima."
        }
        confirmLabel={pending?.action === "cancel" ? "Otkaži posao" : "Ponovi slanje"}
        busyLabel="Obrada..."
        busy={busy}
        onConfirm={handleActionConfirm}
        tone={pending?.action === "cancel" ? "danger" : "accent"}
      />
    </div>
  );
}

export function ThreadsJobsPanelSkeleton() {
  return (
    <Card className="p-5 shadow-card ring-line space-y-4">
      <Skeleton className="h-5 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </Card>
  );
}
