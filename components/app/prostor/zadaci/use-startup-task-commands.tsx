"use client";

// Preneto iz Devotion apps/web/components/workspace/startup-tasks/use-startup-task-commands.tsx (main @ c05c40f), SPAJANJE S12.
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore, OptimisticUpdate } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "@/lib/toast";
import {
  completionCall,
  dueCall,
  isOptimisticId,
  OPTIMISTIC_PREFIX,
  patchItem,
  patchStartupTasks,
  planCall,
  plannedKeysOf,
  priorityCall,
  withEntry,
  withoutEntry,
  type RowCall,
  type StartupTaskPatch,
  type StartupTaskStatus,
  type TaskPriorityKey,
  type TaskStatusKey,
  type TaskRowModel,
} from "@/lib/prostor";

import { UNDO_MS, useCompletionQueue, type RowLocation } from "@/components/app/prostor/danas/use-completion-queue";
import { useQueryState } from "@/components/app/prostor/podaci/ja";
import { panelRequestKey, TaskPanel, type TaskPanelProps, type TaskPanelRequest } from "@/components/app/prostor/zadaci/panel/task-panel";
import type { TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { useTaskListShortcuts } from "@/components/app/prostor/precice/use-precice-liste";
import type { Today } from "@/lib/prostor/web/danas";

import { useMoveFocus } from "@/components/app/prostor/zadaci/use-move-focus";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatMutationOptimisticno } from "@/components/app/prostor/podaci/projekat";

type Overview = FunctionReturnType<typeof api.prostor.myDay.overview>;
type OverviewEntry = Overview["entries"][number];

function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.prostor.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.prostor.myDay.overview, args, update(value));
  }
}

function optimisticEntry(dayKey: string, taskPageId: Id<"pages">): OverviewEntry {
  const refKey = `task:${taskPageId}`;
  return {
    _id: `${OPTIMISTIC_PREFIX}${refKey}` as Id<"myDayEntries">,
    dayKey,
    refKind: "task",
    refKey,
    taskPageId,
    personalTaskId: null,
    position: 0,
    createdAt: Date.now(),
  };
}

/**
 * Optimistička slika za liste u startupu: Komandni centar (`tasks.commandCenter`,
 * `tasks.listEverywhere` za „Za tebe") i Moji zadaci / tabla (`tasks.listForStartup`, svaka strana posebno), pa red
 * odmah doputuje Flip-om u novu zonu ili kolonu.
 */
function patchStartupLists(store: OptimisticLocalStore, pageId: Id<"pages">, patch: StartupTaskPatch) {
  for (const { args, value } of store.getAllQueries(api.prostor.tasks.commandCenter)) {
    if (value === undefined) continue;
    const tasks = patchStartupTasks(value.tasks, pageId, patch);
    if (tasks !== value.tasks) store.setQuery(api.prostor.tasks.commandCenter, args, { ...value, tasks: [...tasks] });
  }
  for (const { args, value } of store.getAllQueries(api.prostor.tasks.listForStartup)) {
    if (value === undefined) continue;
    const page = patchStartupTasks(value.page, pageId, patch);
    if (page !== value.page) store.setQuery(api.prostor.tasks.listForStartup, args, { ...value, page: [...page] });
  }
  // „Za tebe" u Komandnom centru (PROSTOR K19): moji otvoreni zadaci iz `tasks.listEverywhere`.
  for (const { args, value } of store.getAllQueries(api.prostor.tasks.listEverywhere)) {
    if (value === undefined) continue;
    const items = patchStartupTasks(value.items, pageId, patch);
    if (items !== value.items) store.setQuery(api.prostor.tasks.listEverywhere, args, { ...value, items: [...items] });
  }
  // Zadaci oblasti (PROSTOR P12, K13): isti red, ista tabla.
  for (const { args, value } of store.getAllQueries(api.prostor.tasks.listForArea)) {
    if (value === undefined) continue;
    const page = patchStartupTasks(value.page, pageId, patch);
    if (page !== value.page) store.setQuery(api.prostor.tasks.listForArea, args, { ...value, page: [...page] });
  }
}

/**
 * Optimistična izmena `tasks.updateMetadata` (van komponente, da je funkcija
 * stabilna): liste projekta i lični plan dana dobijaju novu vrednost odmah.
 */
const izmenaZadatka: OptimisticUpdate<FunctionArgs<typeof api.prostor.tasks.updateMetadata>> = (store, args) => {
  patchStartupLists(store, args.pageId, {
    ...(args.status === undefined ? {} : { taskStatus: args.status }),
    ...(args.priority === undefined ? {} : { taskPriority: args.priority }),
    ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
  });
  if (args.dueDate !== undefined || args.priority !== undefined) {
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "task", id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  }
};

export type StartupTaskCommands = {
  actions: TaskRowActions;
  /** Plan za danas (refKey → id stavke) iz deljene pretplate `myDay.overview`. */
  plannedKeys: ReadonlyMap<string, string>;
  holds: ReturnType<typeof useCompletionQueue>["holds"];
  pending: ReturnType<typeof useCompletionQueue>["pending"];
  announcement: string;
  selectedKey: string | null;
  request: RowRequest | null;
  onListFocus: ReturnType<typeof useTaskListShortcuts>["onListFocus"];
  /** Ključ reda čiji je panel otvoren (red ostaje istaknut, trenutak 3). */
  activeKey: string | null;
  /** Panel zadatka (Drawer) — kontejner ga renderuje pored liste. */
  panel: ReactNode;
};

/**
 * Radnje u listama zadataka u startupu (K17, plan K07 §2): završi sa
 * zadržavanjem reda i „Poništi" (E7), rok kroz birač, prioritet, status,
 * „Dodaj u Moj dan", „Priključi se", panel zadatka umesto teškog dijaloga
 * (sa „Puni prikaz") i iste prečice kao u Mojim zadacima (E20). Mutacije su
 * iste kao na ličnom nivou (`tasks.updateMetadata`, `myDay.plan/unplan`,
 * `taskAssignees.join`) — pravila servera se ne menjaju.
 */
export function useStartupTaskCommands({
  today,
  profileId,
  workspaces,
  listRef,
  locate,
  getRow,
  flipCapture,
  onOpenInStartup,
  onOpenFull,
}: {
  today: Today;
  profileId: Id<"profiles">;
  workspaces: TaskPanelProps["workspaces"];
  listRef: RefObject<HTMLElement | null>;
  /** Gde je red na ekranu (sa zadržanim redovima) — čita najnoviji model. */
  locate: (key: string) => RowLocation | null;
  getRow: (key: string) => TaskRowModel | undefined;
  /** Snimak za Flip pre promene (kontejner zna granicu E12). */
  flipCapture: () => void;
  onOpenInStartup: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
  /** „Puni prikaz" iz panela: puna stranica zadatka. */
  onOpenFull: (pageId: Id<"pages">) => void;
}): StartupTaskCommands {
  const { dayKey, doneSince } = today;
  const overview = useQueryState(api.prostor.myDay.overview, { dayKey, doneSince });
  const entries = overview.status === "ready" ? overview.data.entries : null;
  const plannedKeys = useMemo(() => plannedKeysOf(entries ?? []), [entries]);

  // Projektna mutacija: kuka ubacuje `workspaceId`, a izmena keša ga dobija u `args`.
  const updateTask = useProjekatMutationOptimisticno(api.prostor.tasks.updateMetadata, izmenaZadatka);
  const join = useProjekatMutation(api.prostor.taskAssignees.join);
  const planMutation = useMutation(api.prostor.myDay.plan).withOptimisticUpdate((store, args) => {
    if (args.ref.kind !== "task") return;
    const taskPageId = args.ref.taskPageId;
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, taskPageId)));
  });
  const unplanMutation = useMutation(api.prostor.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );

  const send = useCallback(
    (call: Exclude<RowCall, { fn: "denied" }>): Promise<unknown> => {
      // Id-jevi su prošli kroz shared model kao stringovi; potiču iz upita.
      switch (call.fn) {
        case "tasks.updateMetadata":
          return updateTask({
            pageId: call.pageId as Id<"pages">,
            ...(call.status === undefined ? {} : { status: call.status as StartupTaskStatus }),
            ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
            ...(call.priority === undefined ? {} : { priority: call.priority }),
          });
        case "myDay.plan":
          return call.ref.kind === "task"
            ? planMutation({ dayKey, ref: { kind: "task", taskPageId: call.ref.taskPageId as Id<"pages"> } })
            : Promise.reject(new Error("Lični zadatak nije u projektu."));
        case "myDay.unplan":
          return unplanMutation({ entryId: call.entryId as Id<"myDayEntries"> });
        default:
          // Lični zadaci ne postoje u listama projekta.
          return Promise.reject(new Error("Radnja nije dostupna u projektu."));
      }
    },
    [dayKey, planMutation, unplanMutation, updateTask],
  );

  const completion = useCompletionQueue({
    listRef,
    locate,
    flipCapture,
    commit: (row: TaskRowModel, done: boolean, previous: TaskStatusKey | undefined) => {
      const call = completionCall(row, done, previous);
      return call.fn === "denied" ? Promise.reject(new Error(call.reason)) : send(call);
    },
  });

  // Fokus i najava posle pomeranja reda (rok, prioritet, status).
  const { announcement, moved } = useMoveFocus(listRef, completion.announcement);

  // --- Panel zadatka ---
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  const openPanel = (row: TaskRowModel) => {
    const origin =
      listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
    setPanel({
      target: { kind: "task", pageId: row.id as Id<"pages"> },
      title: row.title,
      origin,
      openedAt: performance.now(),
    });
  };
  // „Puni prikaz" i „Otvori" iz toasta mogu stići kasnije: uvek najnoviji rukovalac.
  const openFullRef = useRef(onOpenFull);
  useLayoutEffect(() => {
    openFullRef.current = onOpenFull;
  });

  // --- Radnje u redu ---
  const togglePlan = (row: TaskRowModel) => {
    if (isOptimisticId(row.planEntryId)) return;
    const call = planCall(row);
    if (call.fn === "myDay.unplan") {
      void unplanMutation({ entryId: call.entryId as Id<"myDayEntries"> })
        .then((removed) =>
          toast("Uklonjeno iz Moj dan.", {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => {
                void planMutation({ dayKey: removed.dayKey, ref: removed.ref, position: removed.position }).catch(
                  (error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
                );
              },
            },
          }),
        )
        .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
      return;
    }
    if (call.fn !== "myDay.plan") return;
    void send(call)
      .then(() => toast.success("Dodato u Moj dan."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
  };

  const setDue = (row: TaskRowModel, due: number | null) => {
    const call = dueCall(row, due);
    if (call.fn === "denied") {
      toast.error(call.reason);
      return;
    }
    if (row.dueDate === due) return;
    flipCapture();
    moved(row, "Rok je promenjen");
    void send(call)
      .then(() => toast.success("Rok je promenjen."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Rok nije sačuvan.")));
  };

  const setPriority = (row: TaskRowModel, priority: TaskPriorityKey | null) => {
    const call = priorityCall(row, priority);
    if (call.fn === "denied") {
      toast.error(call.reason);
      return;
    }
    if (row.priority === priority) return;
    flipCapture();
    moved(row, "Prioritet je promenjen");
    void send(call).catch((error: unknown) => toast.error(accessErrorMessage(error, "Prioritet nije sačuvan.")));
  };

  const setStatus = (row: TaskRowModel, status: StartupTaskStatus) => {
    if (row.status === status) return;
    // Završavanje ide kroz isti tok kao kvačica (zadržavanje + „Poništi");
    // vraćanje završenog ide na IZABRANI status (ne na zapamćeni prethodni).
    if (status === "done") {
      completion.toggleDone(row, true);
      return;
    }
    if (!row.permissions.status.allowed) {
      toast.error(row.permissions.status.reason ?? "Status menja kreator zadatka ili osoba kojoj je dodeljen.");
      return;
    }
    flipCapture();
    moved(row, "Status je promenjen");
    void updateTask({ pageId: row.id as Id<"pages">, status }).catch((error: unknown) =>
      toast.error(accessErrorMessage(error, "Status nije sačuvan.")),
    );
  };

  const joinTask = (row: TaskRowModel) => {
    void join({ taskPageId: row.id as Id<"pages"> })
      .then(() => toast.success("Sad si na zadatku."))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Priključivanje nije uspelo.")));
  };

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: togglePlan,
    onSetDue: setDue,
    onSetPriority: setPriority,
    onOpen: openPanel,
    onSetStatus: setStatus,
    onJoin: joinTask,
  };

  const shortcuts = useTaskListShortcuts({ listRef, getRow, actions, enabled: panel === null });

  return {
    actions,
    plannedKeys,
    holds: completion.holds,
    pending: completion.pending,
    announcement,
    selectedKey: shortcuts.selectedKey,
    request: shortcuts.request,
    onListFocus: shortcuts.onListFocus,
    activeKey: panelRequestKey(panel),
    panel: (
      <TaskPanel
        request={panel}
        onClose={() => setPanel(null)}
        today={today}
        profileId={profileId}
        workspaces={workspaces}
        onOpenInStartup={onOpenInStartup}
        onOpenFull={(pageId) => openFullRef.current(pageId)}
      />
    ),
  };
}
