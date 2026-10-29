"use client";

// Preneto iz Devotion apps/web/components/workspace/assignee-stack.tsx (main @ c05c40f), SPAJANJE S12.
import { UserRound } from "lucide-react";

import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { cn } from "@/lib/utils";

export type AssigneeSummary = {
  displayName: string;
  avatarUrl?: string | null;
};

export function assigneeStackLabel(assignees: AssigneeSummary[]) {
  if (assignees.length === 0) return "Nedodeljeno";
  return assignees.map((assignee) => assignee.displayName).join(", ");
}

/**
 * Preklopljeni avatari izvršilaca. Svi su ravnopravni, pa nijedan nije istaknut
 * — višak preko `max` se sabija u „+N” da red tabele ne poraste.
 */
export function AssigneeStack({
  assignees,
  max = 3,
  avatarClassName,
  className,
  showLabel = false,
}: {
  assignees: AssigneeSummary[];
  max?: number;
  avatarClassName?: string;
  className?: string;
  showLabel?: boolean;
}) {
  const label = assigneeStackLabel(assignees);
  if (assignees.length === 0) {
    return (
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
        title={label}
      >
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
        {showLabel ? <span className="truncate">{label}</span> : null}
        <span className="sr-only">{label}</span>
      </span>
    );
  }

  const visible = assignees.slice(0, max);
  const overflow = assignees.length - visible.length;
  return (
    <span
      className={cn("flex min-w-0 items-center gap-1.5", className)}
      title={label}
    >
      <span className="flex shrink-0 items-center -space-x-1.5">
        {visible.map((assignee, index) => (
          <ProfileAvatar
            key={`${assignee.displayName}-${index}`}
            profile={assignee}
            className={cn("size-6 ring-2 ring-background", avatarClassName)}
          />
        ))}
        {overflow > 0 ? (
          <span
            className="grid size-6 place-items-center rounded-full bg-muted text-meta font-bold text-muted-foreground ring-2 ring-background"
            aria-hidden="true"
          >
            +{overflow}
          </span>
        ) : null}
      </span>
      {showLabel ? (
        <span className="truncate text-xs font-medium">
          {visible[0].displayName}
          {overflow > 0 ? ` +${overflow}` : ""}
        </span>
      ) : null}
      <span className="sr-only">Dodeljeno: {label}</span>
    </span>
  );
}
