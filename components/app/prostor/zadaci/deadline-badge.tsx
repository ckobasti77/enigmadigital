"use client";

// Preneto iz Devotion apps/web/components/workspace/deadline-badge.tsx (main @ c05c40f), SPAJANJE S12.
import { useMemo, useState } from "react";
import { CalendarDays, CalendarClock, CircleDashed, Flame, type LucideIcon } from "lucide-react";

import { Badge, type BadgeTon } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  classifyDeadline,
  deadlineAriaLabel,
  deadlineLabel,
  type DeadlineUrgency,
} from "@/lib/prostor/web/deadline";
import type { TaskStatus } from "@/lib/prostor/web/projekat";

/**
 * Boja je stanje, ne ukras: crveno samo kad rok kasni, žuto kad je rok danas,
 * zeleno kad je zadatak završen. Sutra i ove nedelje su neutralni, a dalji rok
 * i „bez roka" prigušeni — mirna radna površina svetli samo ono što traži
 * pažnju.
 */
const URGENCY_STYLE: Record<DeadlineUrgency, { ton: BadgeTon; icon: LucideIcon }> = {
  overdue: { ton: "danger", icon: Flame },
  today: { ton: "warning", icon: CalendarClock },
  tomorrow: { ton: "neutral", icon: CalendarDays },
  week: { ton: "neutral", icon: CalendarDays },
  later: { ton: "muted", icon: CalendarDays },
  none: { ton: "muted", icon: CircleDashed },
  done: { ton: "success", icon: CalendarDays },
};

/** Nivoi koji se prikazuju i na gustim površinama (stablo, kanvas čvorovi). */
const LOUD_URGENCIES = new Set<DeadlineUrgency>(["overdue", "today"]);

export type DeadlineBadgeProps = {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  /** Prosleđuje se kad više redova deli isti trenutak — inače se čita jednom. */
  now?: number;
  size?: "sm" | "md";
  showIcon?: boolean;
  /** Na gustim površinama prikazuje samo ono što gori ili je za danas. */
  calmHidden?: boolean;
  className?: string;
};

/**
 * Jedina oznaka roka u aplikaciji. Boja, ikona i tekst nose isto značenje, pa
 * poruka preživi i sivu štampu i daltonizam; tekst ima tabelarne cifre da se
 * kolona skenira, a ne čita. Puna rečenica za čitač ekrana je u skrivenom
 * tekstu, a kratka oznaka je samo za oko.
 */
export function DeadlineBadge({
  dueDate,
  taskStatus,
  now,
  size = "md",
  showIcon = true,
  calmHidden = false,
  className,
}: DeadlineBadgeProps) {
  const [fallbackNow] = useState(() => Date.now());
  const resolvedNow = now ?? fallbackNow;

  const classification = useMemo(
    () => classifyDeadline({ dueDate, taskStatus, now: resolvedNow }),
    [dueDate, taskStatus, resolvedNow],
  );

  if (calmHidden && !LOUD_URGENCIES.has(classification.urgency)) return null;
  if (classification.urgency === "none" && size === "sm") return null;

  const style = URGENCY_STYLE[classification.urgency];
  const Icon = style.icon;
  const label = deadlineLabel(classification, dueDate);
  const ariaLabel = deadlineAriaLabel(classification, dueDate);

  return (
    <Badge
      ton={style.ton}
      title={ariaLabel}
      className={cn(size === "sm" && "h-4 gap-0.5 px-1.5", className)}
    >
      {showIcon ? <Icon aria-hidden="true" /> : null}
      {dueDate === null ? (
        <span aria-hidden="true">{label}</span>
      ) : (
        <time dateTime={new Date(dueDate).toISOString()} aria-hidden="true">
          {label}
        </time>
      )}
      <span className="sr-only">{ariaLabel}</span>
    </Badge>
  );
}
