"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/rows-context.tsx (main @ c05c40f), SPAJANJE S20.
import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { canJoinTask, type StartupTaskSection } from "@/lib/prostor/startup-tasks";
import type { TaskRowModel, WorkspaceMini } from "@/lib/prostor/task-row";

import { TaskRow, type TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import { AssigneeStack } from "@/components/app/prostor/zadaci/assignee-stack";
import type { StartupTaskCommands } from "@/components/app/prostor/zadaci/use-startup-task-commands";
import type { CommandCenterAssignee } from "@/lib/prostor/modeli/command-center-model";
import type { LimitiPocetne } from "@/lib/prostor/modeli/pocetna-model";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";

/**
 * Zajednički red zadatka za blokove početne (Za tebe, Trijaža): jedan
 * `useStartupTaskCommands` na ceo ekran, a blokovi samo prijave svoje redove
 * (`register`) da zadržavanje posle kvačice i prečice znaju gde je koji red.
 */
export type CommandRowsValue = {
  now: number;
  profileId: string;
  /** Vlasnik projekta ili vlasnik platforme: zaključane zadatke menja i bez autorstva. */
  isManager: boolean;
  workspace: WorkspaceMini;
  areaLabels: ReadonlyMap<string, string>;
  /** Granice blokova za širinu ekrana (plan S18 §2.3). */
  limiti: LimitiPocetne;
  commands: Pick<
    StartupTaskCommands,
    "actions" | "plannedKeys" | "holds" | "pending" | "selectedKey" | "activeKey" | "request"
  >;
  /** Blok prijavljuje (ili skida, praznim nizom) sekcije koje trenutno crta. */
  register: (blockId: string, sections: StartupTaskSection[]) => void;
};

const CommandRowsContext = createContext<CommandRowsValue | null>(null);

export function CommandRowsProvider({ value, children }: { value: CommandRowsValue; children: ReactNode }) {
  return <CommandRowsContext.Provider value={value}>{children}</CommandRowsContext.Provider>;
}

export function useCommandRows(): CommandRowsValue {
  const value = useContext(CommandRowsContext);
  if (value === null) throw new Error("Blok početne mora biti unutar CommandRowsProvider-a.");
  return value;
}

/** Prijavi sekcije bloka dok je montiran; skida ih pri izlasku. */
export function useRegisterSections(blockId: string, sections: StartupTaskSection[]) {
  const { register } = useCommandRows();
  useLayoutEffect(() => {
    register(blockId, sections);
    return () => register(blockId, []);
  }, [blockId, sections, register]);
}

/** Red zadatka u bloku: zajednički `TaskRow` sa radnjama, „Priključi se" i izvršiocima. */
export function CommandTaskRow({
  row,
  now,
  assignees,
  actions,
  selected,
  active,
  request,
}: {
  row: TaskRowModel;
  now: number;
  /** `undefined` = izvršioci nisu poznati (npr. „Za tebe" ih ne učitava). */
  assignees?: ReadonlyArray<CommandCenterAssignee>;
  actions: TaskRowActions;
  selected: boolean;
  active: boolean;
  request: RowRequest | null;
}) {
  return (
    <TaskRow
      row={row}
      now={now}
      actions={actions}
      canOpen
      showStartup={false}
      canJoin={canJoinTask(row)}
      extraMeta={assignees === undefined ? undefined : <AssigneeStack assignees={[...assignees]} max={3} />}
      selected={selected}
      active={active}
      request={request}
    />
  );
}
