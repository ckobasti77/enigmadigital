"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/team-block.tsx (main @ c05c40f), SPAJANJE S20.
import { useMemo } from "react";
import { UserRound } from "lucide-react";
import { COMMAND_BLOCK_TEXT, teamWorkloadLabel } from "@/lib/prostor/command-center";

import { EmptyState, ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import {
  workloadCounts,
  type CommandCenterAssignee,
  type WorkloadFilter,
} from "@/lib/prostor/modeli/command-center-model";
import { cn } from "@/lib/utils";

import { Block, type BlockStatus, useBlockRetry } from "./blok";
import { useTriageData } from "./use-triage-data";

export type TeamEntry = {
  key: string;
  name: string;
  avatar: { displayName: string; avatarUrl?: string | null } | null;
  open: number;
  overdue: number;
};

export type TeamViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  entries: ReadonlyArray<TeamEntry>;
  /** Filter Trijaže: izabran član ima `aria-pressed`, ponovni klik ga skida. */
  activeKey: WorkloadFilter;
  onSelect: (key: WorkloadFilter) => void;
};

/**
 * „Tim" (plan S18 E11): ko nosi koliko. Red je dugme koje filtrira Trijažu;
 * članovi bez zadataka ostaju u listi (kapacitet je podatak).
 */
export function TeamView({ status, onRetry, entries, activeKey, onSelect }: TeamViewProps) {
  return (
    <Block
      id="cc-tim"
      title="Tim"
      count={entries.filter((entry) => entry.avatar !== null).length}
      status={status}
      errorText={COMMAND_BLOCK_TEXT.teamError}
      onRetry={onRetry}
      skeletonRows={3}
    >
      {entries.length === 0 ? (
        <EmptyState size="section" title="U projektu još nema članova." />
      ) : (
        <ul className="space-y-0.5">
          {entries.map((entry) => {
            const active = activeKey === entry.key;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  aria-pressed={active}
                  aria-label={`${entry.name}: ${teamWorkloadLabel(entry)}`}
                  onClick={() => onSelect(active ? null : entry.key)}
                  className={cn(
                    "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
                    active && "bg-surface-raised ring-1 ring-line-control",
                  )}
                >
                  {entry.avatar === null ? (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-raised text-text-muted">
                      <UserRound className="size-4" aria-hidden="true" />
                    </span>
                  ) : (
                    <ProfileAvatar profile={entry.avatar} className="size-7" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-ui text-foreground">{entry.name}</span>
                  <span
                    className={cn(
                      "shrink-0 text-meta tabular-nums text-text-muted",
                      entry.overdue > 0 && "text-danger",
                    )}
                  >
                    {teamWorkloadLabel(entry)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}

/** Kontejner „Tim": opterećenje je izvedeno iz Trijaže (iste pretplate), bez novog upita. */
export function TeamBlock({
  now,
  activeKey,
  onSelect,
}: {
  now: number;
  activeKey: WorkloadFilter;
  onSelect: (key: WorkloadFilter) => void;
}) {
  const retry = useBlockRetry();
  const data = useTriageData();
  const tasks = data.status === "ready" ? data.tasks : null;
  const members = data.status === "ready" ? data.members : null;
  const assignees = data.status === "ready" ? data.assigneesByTaskId : null;
  const entries = useMemo<TeamEntry[]>(() => {
    if (tasks === null || members === null) return [];
    const byId = new Map(members.map((member) => [member.profileId, member] as const));
    return workloadCounts(
      tasks,
      [...byId.keys()],
      assignees ?? new Map<string, CommandCenterAssignee[]>(),
      now,
    ).map((count) => {
      const member = byId.get(count.key);
      return {
        key: count.key,
        name: member?.displayName ?? "Nedodeljeno",
        avatar: member === undefined ? null : { displayName: member.displayName, avatarUrl: member.avatarUrl },
        open: count.open,
        overdue: count.overdue,
      };
    });
  }, [tasks, members, assignees, now]);
  return <TeamView status={data.status} onRetry={retry} entries={entries} activeKey={activeKey} onSelect={onSelect} />;
}
