"use client";

// Preneto iz Devotion apps/web/components/workspace/startup-tasks/task-meta-chips.tsx (main @ c05c40f), SPAJANJE S12.
import type { StartupTaskStatus, TaskPermissions, TaskPriorityKey } from "@/lib/prostor";

import { DueMetaChip, PriorityChip } from "@/components/app/prostor/zadaci/panel/panel-parts";
import { AssigneesChip, StatusChip, type PanelPerson } from "@/components/app/prostor/zadaci/panel/startup-task-panel-view";
import { cn } from "@/lib/utils";

export type TaskMetaField = "status" | "priority" | "due" | "assignees";

export type TaskMetaChange = {
  status?: StartupTaskStatus;
  priority?: TaskPriorityKey;
  dueDate?: number | null;
  assigneeProfileIds?: string[];
};

export type TaskMetaChipsProps = {
  now: number;
  status: StartupTaskStatus;
  priority: TaskPriorityKey;
  dueDate: number | null;
  assignees: PanelPerson[];
  /** Članovi za izbor izvršilaca; `undefined` dok se učitavaju. */
  members: PanelPerson[] | undefined | "error";
  permissions: TaskPermissions;
  isSelfAssigned: boolean;
  onChange: (change: TaskMetaChange) => void;
  onJoin: () => void;
  onLeave: () => void;
  /** Klik na zaključan čip (na dodiru nema tooltipa): razlog kao toast. */
  onDenied: (reason: string) => void;
  /** Koji čipovi (podrazumevano sva četiri, redom). */
  fields?: ReadonlyArray<TaskMetaField>;
  className?: string;
};

const ALL_FIELDS: ReadonlyArray<TaskMetaField> = ["status", "priority", "due", "assignees"];

/**
 * Metapodaci zadatka u detalju stranice (K17, plan K07 §2): čipovi Status /
 * Prioritet / Rok / Izvršioci umesto `Select`-ova i izvornog datumskog inputa.
 * Zabranjen čip je zaključan sa razlogom u tooltipu i `aria-describedby`
 * (E15) — pravila su ogledalo servera, ne menjaju se.
 */
export function TaskMetaChips({
  now,
  status,
  priority,
  dueDate,
  assignees,
  members,
  permissions,
  isSelfAssigned,
  onChange,
  onJoin,
  onLeave,
  onDenied,
  fields = ALL_FIELDS,
  className,
}: TaskMetaChipsProps) {
  return (
    <div role="group" aria-label="Podaci zadatka" className={cn("flex flex-wrap gap-2", className)}>
      {fields.map((field) =>
        field === "status" ? (
          <StatusChip key={field} value={status} perm={permissions.status} onDenied={onDenied} onChange={(next) => onChange({ status: next })} />
        ) : field === "priority" ? (
          <PriorityChip
            key={field}
            value={priority}
            perm={permissions.priority}
            allowNone={false}
            onDenied={onDenied}
            onChange={(next) => {
              if (next !== null) onChange({ priority: next });
            }}
          />
        ) : field === "due" ? (
          <DueMetaChip
            key={field}
            value={dueDate}
            now={now}
            perm={permissions.due}
            onDenied={onDenied}
            onChange={(next) => onChange({ dueDate: next })}
          />
        ) : (
          <AssigneesChip
            key={field}
            assignees={assignees}
            members={members}
            selfOnly={permissions.assignees.selfOnly}
            reason={permissions.assignees.reason}
            isSelfAssigned={isSelfAssigned}
            onChange={(assigneeProfileIds) => onChange({ assigneeProfileIds })}
            onJoin={onJoin}
            onLeave={onLeave}
          />
        ),
      )}
    </div>
  );
}
