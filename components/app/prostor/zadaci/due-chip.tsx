// Preneto iz Devotion apps/web/components/me/due-chip.tsx (main @ c05c40f), SPAJANJE S12.
import { CalendarClock, Flame } from "lucide-react";
import { describeDueForRow, type DueTone } from "@/lib/prostor/dates";

import { cn } from "@/lib/utils";

const TONE_CLASS: Record<DueTone, string> = {
  overdue: "text-danger",
  today: "text-foreground",
  soon: "text-muted-foreground",
  later: "text-muted-foreground",
  none: "text-muted-foreground",
};

export type DueChipProps = {
  dueDate: number | null;
  now: number;
  /** Završen zadatak: rok bez tona upozorenja. */
  done?: boolean;
  /** Bez roka: ništa (u gustim redovima) ili „Bez roka". */
  showEmpty?: boolean;
  className?: string;
};

/**
 * Čip roka (plan K07 §5): kratka oznaka iz `describeDue` (srpski format,
 * „kasni 2 d", „danas", „sre 28. okt"; završen zadatak samo datum), puna
 * rečenica za čitač ekrana.
 * Boja prati ton roka, nikad boju projekta: crveno samo kad rok kasni.
 */
export function DueChip({ dueDate, now, done = false, showEmpty = false, className }: DueChipProps) {
  const due = describeDueForRow(dueDate, now, done);
  if (due.tone === "none" && !showEmpty) return null;
  const tone: DueTone = due.tone;
  const Icon = tone === "overdue" ? Flame : tone === "today" ? CalendarClock : null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-meta tabular-nums",
        tone === "overdue" && "font-semibold",
        TONE_CLASS[tone],
        className,
      )}
      title={due.ariaLabel}
    >
      {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
      <span aria-hidden="true">{due.label}</span>
      <span className="sr-only">{due.ariaLabel}</span>
    </span>
  );
}
