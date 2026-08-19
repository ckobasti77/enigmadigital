"use client";

import { useQuery } from "convex/react";
import {
  Captions,
  History,
  Image as ImageIcon,
  ListVideo,
  MessageSquareX,
  Pencil,
  Upload,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
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
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Poslednje radnje — the media operation log (Y10).
 *
 * Ovo je jedino mesto gde operater vidi zašto nešto nije prošlo. Akcije koje
 * menjaju kanal (slanje videa, izmena, titlovi, thumbnail, brisanje) bace
 * rečenicu onome ko je u tom trenutku ispred ekrana, i ta rečenica nestane čim
 * se dijalog zatvori. Red u `ytMediaJobs` ostaje.
 *
 * Zato se ovde prikazuje i ono što nije uspelo, i ono što je odbijeno zbog
 * kvote, i ono što je ostalo nedovršeno. Tabela samo uspešnih radnji bila bi
 * tabela bez ijedne korisne informacije.
 */

type MediaJob = FunctionReturnType<typeof api.ytMedia.recentJobs>[number];

const KIND_LABELS: Record<MediaJob["kind"], string> = {
  upload: "Slanje videa",
  metadata: "Izmena videa",
  thumbnail: "Thumbnail",
  caption: "Titl",
  playlist: "Plejlista",
  comment_delete: "Brisanje komentara",
};

const KIND_ICONS: Record<
  MediaJob["kind"],
  React.ComponentType<{ className?: string }>
> = {
  upload: Upload,
  metadata: Pencil,
  thumbnail: ImageIcon,
  caption: Captions,
  playlist: ListVideo,
  comment_delete: MessageSquareX,
};

const STATUS_LABELS: Record<MediaJob["status"], string> = {
  pending: "U toku",
  done: "Uspešno",
  failed: "Neuspešno",
  skipped_quota: "Odbijeno — kvota",
};

const STATUS_TONES: Record<MediaJob["status"], string> = {
  pending: "border-line bg-surface text-text-muted",
  done: "border-success/30 bg-success/10 text-success",
  failed: "border-danger/30 bg-danger/10 text-danger",
  skipped_quota: "border-warning/30 bg-warning/10 text-warning",
};

export function YtMediaJobsPanel() {
  const jobs = useQuery(api.ytMedia.recentJobs, {});

  return (
    <Card className="flex flex-col gap-4 p-5 shadow-card">
      <div className="flex items-center gap-2">
        <div className="flex size-7 items-center justify-center rounded-lg bg-accent-400/10 text-accent-400">
          <History className="size-4" aria-hidden />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Poslednje radnje
          </h2>
          <p className="text-xs text-text-muted">
            Slanja, izmene, titlovi i brisanja — sa razlogom kada nešto ne prođe
          </p>
        </div>
      </div>

      {jobs === undefined ? (
        <div className="space-y-1.5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-surface/40 px-3 py-6 text-center text-xs text-text-muted">
          Još nijedna izmena nije poslata na YouTube sa ovog naloga.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line">
          <Table className="text-xs">
            <TableHeader>
              <TableRow className="border-line-soft bg-surface-raised/50 hover:bg-transparent">
                <TableHead className="h-9 pl-3 text-xs font-medium text-text-muted">
                  Radnja
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-text-muted">
                  Video
                </TableHead>
                <TableHead className="h-9 text-xs font-medium text-text-muted">
                  Status
                </TableHead>
                <TableHead className="h-9 text-right text-xs font-medium text-text-muted">
                  Jedinice
                </TableHead>
                <TableHead className="h-9 pr-3 text-right text-xs font-medium text-text-muted">
                  Kada
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => (
                <JobRow key={job._id} job={job} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function JobRow({ job }: { job: MediaJob }) {
  const Icon = KIND_ICONS[job.kind];
  const hasError = job.errorMessage !== undefined && job.errorMessage.length > 0;

  return (
    <>
      <TableRow
        className={cn(
          "border-line-soft hover:bg-surface-raised/40",
          // The error line belongs to this row, so the border goes under it.
          hasError && "border-b-0",
        )}
      >
        <TableCell className="py-2 pl-3">
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <Icon className="size-3.5 shrink-0 text-text-muted" />
            {KIND_LABELS[job.kind]}
          </span>
        </TableCell>
        <TableCell className="max-w-56 py-2 text-xs text-text-secondary">
          <span className="block truncate">
            {job.title ?? job.videoId ?? "—"}
          </span>
        </TableCell>
        <TableCell className="py-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-micro font-medium",
              STATUS_TONES[job.status],
            )}
          >
            {STATUS_LABELS[job.status]}
          </span>
        </TableCell>
        <TableCell className="py-2 text-right font-mono text-xs tabular-nums text-text-muted">
          {/* An upload spends none: videos.insert is metered on its own
              counter, not in units. A dash is the truth, 0 would read as a
              free operation. */}
          {job.kind === "upload" ? "—" : formatNumber(job.unitsSpent)}
        </TableCell>
        <TableCell className="py-2 pr-3 text-right text-xs whitespace-nowrap text-text-muted">
          {formatRelativeTime(job.finishedAt ?? job.createdAt)}
        </TableCell>
      </TableRow>

      {hasError && (
        <TableRow className="border-line-soft hover:bg-transparent">
          <TableCell colSpan={5} className="px-3 pb-2 pt-0">
            <p
              className={cn(
                "rounded-md border px-2.5 py-1.5 text-micro leading-relaxed",
                job.status === "skipped_quota"
                  ? "border-warning/25 bg-warning/5 text-warning"
                  : "border-danger/25 bg-danger/5 text-danger",
              )}
            >
              {job.errorMessage}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
