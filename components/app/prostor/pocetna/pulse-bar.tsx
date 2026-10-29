"use client";

// Preneto iz Devotion apps/web/components/workspace/pulse-bar.tsx (main @ c05c40f), SPAJANJE S20.
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { tasksWord } from "@/lib/prostor/web/projekat";

export type PulseTone = "danger" | "warn" | "info" | "muted" | "success";

const TONE_CLASS: Record<PulseTone, string> = {
  danger: "bg-danger",
  warn: "bg-warning",
  info: "bg-info",
  muted: "bg-line-control",
  success: "bg-success",
};

export type PulseSegment = {
  key: string;
  label: string;
  count: number;
  tone: PulseTone;
};

/**
 * Sastav posla u jednoj traci od 10 px — stanje se čita periferno, pre teksta.
 * Samo na ekranu Puls tima, bez pokreta (radni ekran se ne animira). Boja nosi
 * stanje (kasni · zapelo · završeno), a natpis svakog dela je u `aria-label`
 * i oblačiću, pa boja nije jedini nosilac značenja.
 */
export function PulseBar({
  segments,
  label,
  emptyLabel = "Nema otvorenih zadataka",
  className,
}: {
  segments: Array<PulseSegment>;
  label: string;
  emptyLabel?: string;
  className?: string;
}) {
  const visible = segments.filter((segment) => segment.count > 0);
  const total = visible.reduce((sum, segment) => sum + segment.count, 0);

  if (total === 0) {
    return (
      <div
        role="img"
        aria-label={emptyLabel}
        title={emptyLabel}
        className={cn("h-2.5 w-full rounded-sm bg-surface-raised", className)}
      />
    );
  }

  return (
    <div role="group" aria-label={label} className={cn("flex w-full items-center gap-[2px]", className)}>
      {visible.map((segment) => {
        const description = `${segment.label}: ${formatNumber(segment.count)} ${tasksWord(segment.count)}`;
        return (
          <div
            key={segment.key}
            style={{ flexGrow: segment.count, flexBasis: 0, minWidth: "4%" }}
            role="img"
            aria-label={description}
            title={description}
          >
            <span aria-hidden="true" className={cn("block h-3 w-full rounded-[3px] md:h-2.5", TONE_CLASS[segment.tone])} />
          </div>
        );
      })}
    </div>
  );
}
