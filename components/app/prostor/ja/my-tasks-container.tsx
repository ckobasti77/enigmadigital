"use client";

// Preneto iz Devotion apps/web/components/me/tasks/my-tasks-container.tsx (main @ c05c40f), SPAJANJE S16.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "@/lib/toast";
import {
  completionCall,
  dueCall,
  EMPTY_TASK_FILTERS,
  isOptimisticId,
  OPTIMISTIC_PREFIX,
  patchItem,
  planCall,
  priorityCall,
  withEntry,
  withoutEntry,
  type RowCall,
  type TaskFilters,
  type TaskGroupBy,
  type TaskPriorityKey,
  type TaskRowModel,
} from "@/lib/prostor";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useTaskListShortcuts } from "@/components/app/prostor/precice/use-precice-liste";
import type { Today } from "@/lib/prostor/web/danas";

import { UNDO_MS, useCompletionQueue } from "@/components/app/prostor/danas/use-completion-queue";
import { useQueryState } from "@/components/app/prostor/podaci/ja";
import { useProjekatMutationOptimisticno } from "@/components/app/prostor/podaci/projekat";
import {
  PoProjektu,
  PROJEKAT_NIJE_SPREMAN,
  usePrijaviRadnje,
  useRegistarPoProjektu,
  type RegistarPoProjektu,
} from "@/components/app/prostor/podaci/po-projektu";
import { panelRequestKey, TaskPanel, type TaskPanelProps, type TaskPanelRequest } from "@/components/app/prostor/zadaci/panel/task-panel";
import type { TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import {
  buildMyTasks,
  buildTaskRows,
  findRow,
  locateTaskRow,
  type MyTasksModel,
  patchPersonalItems,
  patchTaskItems,
  PERSONAL_TASKS_LIMIT,
  TASKS_EVERYWHERE_LIMIT,
} from "@/lib/prostor/modeli/my-tasks-model";
import { MyTasksView, type MyTasksViewState } from "@/components/app/prostor/ja/my-tasks-view";

export type MyTasksContainerProps = {
  today: Today;
  profileId: Id<"profiles">;
  /** Moji projekti sa oblastima (redosled grupa, filter, panel); `undefined` dok stižu. */
  workspaces: TaskPanelProps["workspaces"] | undefined;
  onQuickAdd: () => void;
  onOpenInStartup: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
};

type Overview = FunctionReturnType<typeof api.prostor.myDay.overview>;
type OverviewEntry = Overview["entries"][number];
type PlanRef = { kind: "task"; taskPageId: Id<"pages"> } | { kind: "personal"; personalTaskId: Id<"personalTasks"> };
type UpdateMetadataArgs = Omit<FunctionArgs<typeof api.prostor.tasks.updateMetadata>, "workspaceId">;

/** Projektne radnje reda: `tasks.updateMetadata` projekta tog zadatka (D14). */
type RadnjeZadatka = { updateMetadata: (args: UpdateMetadataArgs) => Promise<unknown> };

function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.prostor.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.prostor.myDay.overview, args, update(value));
  }
}

function optimisticEntry(dayKey: string, ref: PlanRef): OverviewEntry {
  const refKey = ref.kind === "task" ? `task:${ref.taskPageId}` : `personal:${ref.personalTaskId}`;
  return {
    _id: `${OPTIMISTIC_PREFIX}${refKey}` as Id<"myDayEntries">,
    dayKey,
    refKind: ref.kind,
    refKey,
    taskPageId: ref.kind === "task" ? ref.taskPageId : null,
    personalTaskId: ref.kind === "personal" ? ref.personalTaskId : null,
    position: 0,
    createdAt: Date.now(),
  };
}

/**
 * Optimistična slika izmene zadatka projekta: lista Mojih zadataka i Moj dan
 * (oba su lični upiti, bez `workspaceId` u ključu keša). Van komponente, da
 * mutacija ostane ista funkcija kroz rendere.
 */
function izmenaZadatka(store: OptimisticLocalStore, args: FunctionArgs<typeof api.prostor.tasks.updateMetadata>) {
  const patch = {
    ...(args.status === undefined ? {} : { taskStatus: args.status }),
    ...(args.priority === undefined ? {} : { taskPriority: args.priority }),
    ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
  };
  for (const { args: queryArgs, value } of store.getAllQueries(api.prostor.tasks.listEverywhere)) {
    if (value !== undefined) store.setQuery(api.prostor.tasks.listEverywhere, queryArgs, patchTaskItems(value, args.pageId, patch));
  }
  if (args.dueDate !== undefined || args.priority !== undefined) {
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "task", id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  }
}

/** Prijavljivač ispod `ProjekatStavkeProvider`-a: mutacija projekta zadatka. */
function RadnjeZadatkaProjekta({
  workspaceId,
  registar,
}: {
  workspaceId: Id<"workspaces">;
  registar: RegistarPoProjektu<RadnjeZadatka>;
}) {
  const updateMetadata = useProjekatMutationOptimisticno(api.prostor.tasks.updateMetadata, izmenaZadatka);
  const radnje = useMemo<RadnjeZadatka>(() => ({ updateMetadata }), [updateMetadata]);
  usePrijaviRadnje(registar, workspaceId, radnje);
  return null;
}

/** Poslednja učitana vrednost (izvedeno stanje, bez efekta). */
function useLastReady<T>(value: T | undefined): T | undefined {
  const [last, setLast] = useState(value);
  if (value !== undefined && value !== last) setLast(value);
  return value ?? last;
}

/**
 * Moji zadaci — kontejner (K11): `tasks.listEverywhere` (do 200) +
 * `personalTasks.list` (do 300) + plan za danas iz deljene pretplate
 * `myDay.overview`. Filter po projektu je na klijentu. Radnje u redu kao u
 * Moj dan (deljen `task-row.ts` bira poziv), sa optimističkom slikom da red
 * odmah doputuje Flip-om; red otvara panel zadatka. „Pokušaj ponovo"
 * ponovo montira kontejner.
 *
 * Zadatak projekta menja se mutacijom SVOG projekta: za svaki projekat iz
 * liste stoji `ProjekatStavkeProvider` sa prijavljivačem (`PoProjektu`, D14).
 */
export function MyTasksContainer(props: MyTasksContainerProps) {
  const [attempt, setAttempt] = useState(0);
  return <MyTasksContent key={attempt} {...props} retry={() => setAttempt((value) => value + 1)} />;
}

function MyTasksContent({ today, profileId, workspaces, onQuickAdd, onOpenInStartup, retry }: MyTasksContainerProps & { retry: () => void }) {
  const { dayKey, doneSince, now } = today;
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [groupBy, setGroupBy] = useState<TaskGroupBy>("startup");
  const scope = filters.showDone ? "all" : "open";
  const tasksState = useQueryState(api.prostor.tasks.listEverywhere, { scope, limit: TASKS_EVERYWHERE_LIMIT });
  const personalState = useQueryState(api.prostor.personalTasks.list, { status: scope, limit: PERSONAL_TASKS_LIMIT });
  const overviewState = useQueryState(api.prostor.myDay.overview, { dayKey, doneSince });

  // --- Mutacije sa optimističkom slikom (lista + Moj dan) ---
  const zadaci = useRegistarPoProjektu<RadnjeZadatka>();
  const updatePersonal = useMutation(api.prostor.personalTasks.update).withOptimisticUpdate((store, args) => {
    const patch = {
      ...(args.priority === undefined ? {} : { priority: args.priority }),
      ...(args.dueDate === undefined ? {} : { dueDate: args.dueDate }),
    };
    for (const { args: queryArgs, value } of store.getAllQueries(api.prostor.personalTasks.list)) {
      if (value !== undefined) store.setQuery(api.prostor.personalTasks.list, queryArgs, patchPersonalItems(value, args.personalTaskId, patch));
    }
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "personal", id: args.personalTaskId }, { dueDate: args.dueDate, priority: args.priority }),
    );
  });
  const setPersonalStatus = useMutation(api.prostor.personalTasks.setStatus).withOptimisticUpdate((store, args) => {
    for (const { args: queryArgs, value } of store.getAllQueries(api.prostor.personalTasks.list)) {
      if (value !== undefined) {
        store.setQuery(api.prostor.personalTasks.list, queryArgs, patchPersonalItems(value, args.personalTaskId, { status: args.status }));
      }
    }
  });
  const planMutation = useMutation(api.prostor.myDay.plan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, args.ref))),
  );
  const unplanMutation = useMutation(api.prostor.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );

  const send = useCallback(
    (row: TaskRowModel, call: Exclude<RowCall, { fn: "denied" }>): Promise<unknown> => {
      // Id-jevi su prošli kroz deljen model kao stringovi; potiču iz upita.
      switch (call.fn) {
        case "personalTasks.setStatus":
          return setPersonalStatus({ personalTaskId: call.personalTaskId as Id<"personalTasks">, status: call.status });
        case "personalTasks.update":
          return updatePersonal({
            personalTaskId: call.personalTaskId as Id<"personalTasks">,
            ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
            ...(call.priority === undefined ? {} : { priority: call.priority }),
          });
        case "tasks.updateMetadata": {
          const radnje = row.workspace ? zadaci.uzmi(row.workspace._id) : undefined;
          if (!radnje) return Promise.reject(new Error(PROJEKAT_NIJE_SPREMAN));
          return radnje.updateMetadata({
            pageId: call.pageId as Id<"pages">,
            ...(call.status === undefined ? {} : { status: call.status }),
            ...(call.dueDate === undefined ? {} : { dueDate: call.dueDate }),
            ...(call.priority === undefined ? {} : { priority: call.priority }),
          });
        }
        case "myDay.plan":
          return planMutation({
            dayKey,
            ref:
              call.ref.kind === "task"
                ? { kind: "task", taskPageId: call.ref.taskPageId as Id<"pages"> }
                : { kind: "personal", personalTaskId: call.ref.personalTaskId as Id<"personalTasks"> },
          });
        case "myDay.unplan":
          return unplanMutation({ entryId: call.entryId as Id<"myDayEntries"> });
      }
    },
    [dayKey, planMutation, setPersonalStatus, unplanMutation, updatePersonal, zadaci],
  );

  // --- Model ---
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<MyTasksModel | null>(null);
  // Flip radi `FlipGroup` u prikazu sam (snimak pre commit-a), pa radnje ne snimaju ništa.
  const flipCapture = useCallback(() => {}, []);

  const completion = useCompletionQueue({
    listRef,
    locate: (key) => (modelRef.current ? locateTaskRow(modelRef.current, groupBy, key) : null),
    flipCapture,
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === "denied" ? Promise.reject(new Error(call.reason)) : send(row, call);
    },
  });

  // Promena „Prikaži završene" menja argumente upita: dok stiže nov odgovor,
  // lista ostaje na poslednjim podacima (bez treptaja skeletona).
  const tasksData = useLastReady(tasksState.status === "ready" ? tasksState.data : undefined);
  const personalData = useLastReady(personalState.status === "ready" ? personalState.data : undefined);
  // Odgovor upita zadržava istu referencu dok se ne promeni, pa memo važi.
  const overviewEntries = overviewState.status === "ready" ? overviewState.data.entries : null;
  const entries = useMemo(() => overviewEntries ?? [], [overviewEntries]);
  const projekti = useMemo(() => workspaces ?? [], [workspaces]);
  const rows = useMemo(() => {
    if (!tasksData || !personalData) return null;
    // Znak projekta u redu nosi boju projekta (identitet), kao traka.
    const boje = new Map(projekti.map((workspace) => [workspace._id as string, workspace.boja ?? null] as const));
    return buildTaskRows({ tasks: tasksData.items, personal: personalData.items, entries, capped: false }).map((row) =>
      row.workspace ? { ...row, workspace: { ...row.workspace, boja: boje.get(row.workspace._id) ?? null } } : row,
    );
  }, [tasksData, personalData, entries, projekti]);
  const startupMinis = useMemo(
    () =>
      projekti.map((workspace) => ({
        _id: workspace._id,
        name: workspace.name,
        logoUrl: workspace.logoUrl,
        boja: workspace.boja ?? null,
      })),
    [projekti],
  );
  const startupOrder = useMemo(() => projekti.map((workspace) => workspace._id as string), [projekti]);
  // Projekti čije zadatke lista prikazuje (svaki dobija svoj prijavljivač).
  const projektiRedova = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows ?? []) if (row.workspace) ids.add(row.workspace._id);
    return [...ids].sort() as Id<"workspaces">[];
  }, [rows]);
  const model = useMemo(
    () =>
      rows
        ? buildMyTasks(rows, filters, groupBy, now, {
            startupOrder,
            capped: Boolean(tasksData?.capped || personalData?.capped),
            holds: completion.holds,
            pending: completion.pending,
          })
        : null,
    [rows, filters, groupBy, now, startupOrder, tasksData?.capped, personalData?.capped, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    modelRef.current = model;
  });

  // --- Panel zadatka ---
  const [panel, setPanel] = useState<TaskPanelRequest | null>(null);
  const openPanel = (row: TaskRowModel) => {
    const origin =
      listRef.current?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(row.key)}"] [data-row-title]`) ?? null;
    setPanel({
      target:
        row.kind === "task"
          ? {
              kind: "task",
              pageId: row.id as Id<"pages">,
              // Zadatak drugog projekta: panel radi pod njegovim projektom (D14).
              ...(row.workspace ? { workspaceId: row.workspace._id as Id<"workspaces"> } : {}),
            }
          : { kind: "personal", personalTaskId: row.id as Id<"personalTasks"> },
      title: row.title,
      origin,
      openedAt: performance.now(),
    });
  };

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
    void send(row, call)
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
    void send(row, call)
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
    void send(row, call).catch((error: unknown) => toast.error(accessErrorMessage(error, "Prioritet nije sačuvan.")));
  };

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: togglePlan,
    onSetDue: setDue,
    onSetPriority: setPriority,
    onOpen: openPanel,
  };

  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => findRow(modelRef.current, key),
    actions,
    searchRef,
    enabled: panel === null,
  });

  const state: MyTasksViewState =
    tasksState.status === "error" || personalState.status === "error"
      ? { status: "error", retry }
      : model
        ? { status: "ready", model }
        : { status: "loading" };

  return (
    <>
      <PoProjektu workspaceIds={projektiRedova}>
        {(workspaceId) => <RadnjeZadatkaProjekta workspaceId={workspaceId} registar={zadaci} />}
      </PoProjektu>
      <MyTasksView
        now={now}
        state={state}
        workspaces={startupMinis}
        filters={filters}
        onFiltersChange={setFilters}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        actions={actions}
        onQuickAdd={onQuickAdd}
        searchRef={searchRef}
        listRef={listRef}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelRequestKey(panel)}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        announcement={completion.announcement}
      />
      <TaskPanel
        request={panel}
        onClose={() => setPanel(null)}
        today={today}
        profileId={profileId}
        workspaces={projekti}
        onOpenInStartup={onOpenInStartup}
      />
    </>
  );
}
