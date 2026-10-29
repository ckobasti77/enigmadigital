// Preneto iz Devotion apps/web/components/me/priority-dot.tsx (main @ c05c40f), SPAJANJE S12.
import { PRIORITY_LABELS, type TaskPriorityKey } from "@/lib/prostor/task-sort";

import { cn } from "@/lib/utils";

/**
 * Tačka prioriteta u redu (plan K07 §5). Samo za „Visok" i „Hitno" — srednji
 * je podrazumevan skoro svuda, pa bi tačka na svakom redu bila šum (isto kao
 * telefon, K09). Boja je token, nikad ton projekta: „hitno" je žuto (traži
 * pažnju), „visok" je neutralno jak. Crveno je rezervisano za grešku i
 * kašnjenje, pa prioritet nikad nije crven. Značenje nosi i tekst (`title`,
 * `aria-label`), ne samo boja.
 */
export function PriorityDot({ priority, className }: { priority: TaskPriorityKey | null; className?: string }) {
  if (priority !== "urgent" && priority !== "high") return null;
  return (
    <span
      role="img"
      aria-label={`Prioritet: ${PRIORITY_LABELS[priority]}`}
      title={`Prioritet: ${PRIORITY_LABELS[priority]}`}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        priority === "urgent" ? "bg-warning" : "bg-text-secondary",
        className,
      )}
    />
  );
}
