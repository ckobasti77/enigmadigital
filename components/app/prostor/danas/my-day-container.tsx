"use client";

// Preneto iz Devotion apps/web/components/me/my-day/my-day-container.tsx (main @ c05c40f), SPAJANJE S19.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { toast } from "@/lib/toast";
import {
  completionCall,
  dueCall,
  moveInPlan,
  planCall,
  priorityCall,
  type RowCall,
  type TaskRowModel,
} from "@/lib/prostor/task-row";
import type { TaskPriorityKey } from "@/lib/prostor/task-sort";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useTaskListShortcuts } from "@/components/app/prostor/precice/use-precice-liste";
import type { Today } from "@/lib/prostor/web/danas";

import { PlanDayDialog, type PlanDayState } from "@/components/app/prostor/danas/plan-day-dialog";
import { useProjekatMutationOptimisticno } from "@/components/app/prostor/podaci/projekat";
import {
  PoProjektu,
  PROJEKAT_NIJE_SPREMAN,
  usePrijaviRadnje,
  useRegistarPoProjektu,
  type RegistarPoProjektu,
} from "@/components/app/prostor/podaci/po-projektu";
import { panelRequestKey, TaskPanel, type TaskPanelProps, type TaskPanelRequest } from "@/components/app/prostor/zadaci/panel/task-panel";
import { buildPlanDay } from "@/lib/prostor/modeli/plan-day-model";
import type { TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import {
  applyHolds,
  buildMyDay,
  GROUP_MODE_STORAGE_KEY,
  isOptimisticId,
  locateRow,
  type MyDayGroupMode,
  type MyDayModel,
  OPTIMISTIC_PREFIX,
  parseGroupMode,
  patchItem,
  plannedOrder,
  withEntry,
  withEntryOrder,
  withoutEntry,
  withoutHistory,
} from "@/lib/prostor/modeli/my-day-model";
import { MyDayView } from "@/components/app/prostor/danas/my-day-view";
import { chatSummary, pendingSummary, type SideBlock, type SideInbox } from "@/lib/prostor/modeli/side-model";
import type { CekaTeDanas, StanjeNapretka } from "@/lib/prostor/modeli/danas-model";
import { UNDO_MS, useCompletionQueue } from "@/components/app/prostor/danas/use-completion-queue";
import { useQueryState, type QueryState } from "@/components/app/prostor/podaci/ja";

export type MyDayContainerProps = {
  today: Today;
  firstName: string | null;
  profileId: Id<"profiles">;
  /** Moji projekti radnog dela sa oblastima (bez posmatrača): panel zadatka i boja znaka. */
  workspaces: TaskPanelProps["workspaces"];
  /** „Puni prikaz" iz panela: stranica zadatka u njenom projektu. */
  onOpenTask: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
  onOpenTasks: () => void;
  onQuickAdd: () => void;
  onOpenInbox: () => void;
  onOpenChat: () => void;
  /** „Ideje za glasanje": ideja u svom projektu. */
  onOpenIdea: (workspaceId: Id<"workspaces">, ideaId: Id<"ideaNodes">) => void;
  /** „Čeka te" iz svih projekata (zbir sastavlja ekran, plan S18 E4). */
  cekaTe: CekaTeDanas;
  /** Šta kartica napretka crta (plan S18 E3). */
  napredak: StanjeNapretka;
};

type Overview = FunctionReturnType<typeof api.prostor.myDay.overview>;
type OverviewEntry = Overview["entries"][number];
type PlanRef = { kind: "task"; taskPageId: Id<"pages"> } | { kind: "personal"; personalTaskId: Id<"personalTasks"> };
type UpdateMetadataArgs = Omit<FunctionArgs<typeof api.prostor.tasks.updateMetadata>, "workspaceId">;

/** Projektne radnje reda: `tasks.updateMetadata` projekta tog zadatka (D14, S16 ODLUKA 1). */
type RadnjeZadatka = { updateMetadata: (args: UpdateMetadataArgs) => Promise<unknown> };

/** Optimistička izmena svih `myDay.overview` pretplata (opciono samo za jedan dan). */
function updateOverviews(store: OptimisticLocalStore, dayKey: string | null, update: (value: Overview) => Overview) {
  for (const { args, value } of store.getAllQueries(api.prostor.myDay.overview)) {
    if (value === undefined || (dayKey !== null && args.dayKey !== dayKey)) continue;
    store.setQuery(api.prostor.myDay.overview, args, update(value));
  }
}

/** Optimistična slika izmene zadatka projekta u Moj dan (lični upit, bez `workspaceId` u ključu keša). */
function izmenaZadatka(store: OptimisticLocalStore, args: FunctionArgs<typeof api.prostor.tasks.updateMetadata>) {
  if (args.dueDate === undefined && args.priority === undefined) return;
  updateOverviews(store, null, (value) =>
    patchItem(value, { kind: "task", id: args.pageId }, { dueDate: args.dueDate, priority: args.priority }),
  );
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

function optimisticEntry(dayKey: string, ref: PlanRef): OverviewEntry {
  const refKey = ref.kind === "task" ? `task:${ref.taskPageId}` : `personal:${ref.personalTaskId}`;
  return {
    // Privremeni id: zamenjuje ga pravi čim server odgovori (nikad ne ide na server).
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

function refOfKey(refKey: string): PlanRef {
  const [kind, id] = [refKey.slice(0, refKey.indexOf(":")), refKey.slice(refKey.indexOf(":") + 1)];
  return kind === "task"
    ? { kind: "task", taskPageId: id as Id<"pages"> }
    : { kind: "personal", personalTaskId: id as Id<"personalTasks"> };
}

function sideBlock<T, R>(state: QueryState<T>, map: (data: T) => R): SideBlock<R> {
  if (state.status === "loading") return { status: "loading" };
  if (state.status === "error") return { status: "hidden" };
  return { status: "ready", data: map(state.data) };
}

function readGroupMode(): MyDayGroupMode {
  try {
    return parseGroupMode(typeof window === "undefined" ? null : window.localStorage.getItem(GROUP_MODE_STORAGE_KEY));
  } catch {
    return "time";
  }
}

/**
 * Moj dan na ekranu Danas — kontejner (Devotion K10, SPAJANJE S19): jedna
 * pretplata `myDay.overview` (deljena sa menijem „Ja"), radnje u redu
 * (završi sa „Poništi", Moj dan, rok, prioritet, redosled), „Isplaniraj dan"
 * i desna kolona (Inbox, Poruke, Ideje za glasanje). „Čeka te" i napredak
 * stižu spolja, iz zbira ekrana. Greška glavnog upita je stanje prikaza;
 * „Pokušaj ponovo" ponovo montira kontejner (nova pretplata).
 *
 * Zadatak projekta menja se mutacijom SVOG projekta: za svaki projekat sa
 * zadatkom u Moj dan stoji `ProjekatStavkeProvider` sa prijavljivačem
 * (`PoProjektu`, D14). Projekti u kojima sam posmatrač ovde nikad ne dolaze:
 * `overview` ih ne vraća (plan S18 E6).
 */
export function MyDayContainer(props: MyDayContainerProps) {
  const [attempt, setAttempt] = useState(0);
  return <MyDayContent key={attempt} {...props} retry={() => setAttempt((value) => value + 1)} />;
}

function MyDayContent({
  today,
  firstName,
  profileId,
  workspaces: projekti,
  onOpenTask,
  onOpenTasks,
  onQuickAdd,
  onOpenInbox,
  onOpenChat,
  onOpenIdea,
  cekaTe,
  napredak,
  retry,
}: MyDayContainerProps & { retry: () => void }) {
  const { dayKey, doneSince, now } = today;
  const overviewState = useQueryState(api.prostor.myDay.overview, { dayKey, doneSince });
  const overview = overviewState.status === "ready" ? overviewState.data : undefined;

  // --- Mutacije (sa optimističkom slikom tamo gde se red pomera) ---
  const zadaci = useRegistarPoProjektu<RadnjeZadatka>();
  const setPersonalStatus = useMutation(api.prostor.personalTasks.setStatus);
  const updatePersonal = useMutation(api.prostor.personalTasks.update).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) =>
      patchItem(value, { kind: "personal", id: args.personalTaskId }, { dueDate: args.dueDate, priority: args.priority }),
    ),
  );
  const planMutation = useMutation(api.prostor.myDay.plan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntry(value, optimisticEntry(args.dayKey, args.ref))),
  );
  const unplanMutation = useMutation(api.prostor.myDay.unplan).withOptimisticUpdate((store, args) =>
    updateOverviews(store, null, (value) => withoutEntry(value, args.entryId)),
  );
  const reorderMutation = useMutation(api.prostor.myDay.reorder).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) => withEntryOrder(value, args.entryIds)),
  );
  const carryOverMutation = useMutation(api.prostor.myDay.carryOver).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) =>
      args.refKeys.reduce(
        (next, refKey) => withEntry(next, optimisticEntry(args.dayKey, refOfKey(refKey))),
        withoutHistory(value, new Set(args.refKeys)),
      ),
    ),
  );
  const clearOldMutation = useMutation(api.prostor.myDay.clearOld).withOptimisticUpdate((store, args) =>
    updateOverviews(store, args.dayKey, (value) =>
      withoutHistory(value, args.refKeys === undefined ? null : new Set(args.refKeys)),
    ),
  );

  const send = useCallback(
    (row: TaskRowModel, call: Exclude<RowCall, { fn: "denied" }>): Promise<unknown> => {
      // Id-jevi su prošli kroz deljen model kao stringovi; potiču iz `overview`.
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

  // --- Prikaz ---
  const [groupMode, setGroupMode] = useState<MyDayGroupMode>(readGroupMode);
  const changeGroupMode = (mode: MyDayGroupMode) => {
    setGroupMode(mode);
    try {
      window.localStorage.setItem(GROUP_MODE_STORAGE_KEY, mode);
    } catch {
      // Pamćenje je pogodnost.
    }
  };

  const [planOpen, setPlanOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Model na ekranu (sa zadržanim redovima), za rukovaoce posle commit-a.
  const modelRef = useRef<MyDayModel | null>(null);
  // Flip i dolazak novog reda radi `FlipGroup` u prikazu (snimak pre commit-a),
  // pa radnje ne snimaju ništa (isto kao Moji zadaci, S16).
  const flipCapture = useCallback(() => {}, []);

  // --- Završi / vrati (E7) ---
  const completion = useCompletionQueue({
    listRef,
    locate: (key) => (modelRef.current ? locateRow(modelRef.current, groupMode, key) : null),
    flipCapture,
    commit: (row, done, previous) => {
      const call = completionCall(row, done, previous);
      return call.fn === "denied" ? Promise.reject(new Error(call.reason)) : send(row, call);
    },
  });

  // Znak projekta u redu nosi boju projekta (identitet), kao traka i Moji zadaci.
  const boje = useMemo(
    () => new Map(projekti.map((workspace) => [workspace._id as string, workspace.boja ?? null] as const)),
    [projekti],
  );
  const baseModel = useMemo(() => {
    if (!overview) return null;
    const model = buildMyDay(overview, now);
    // `boja` ide uz mini projekta (StartupChip je čita), kao u Mojim zadacima.
    const obojen = (row: TaskRowModel): TaskRowModel => {
      if (!row.workspace) return row;
      const workspace = { ...row.workspace, boja: boje.get(row.workspace._id) ?? null };
      return { ...row, workspace };
    };
    return {
      ...model,
      sections: model.sections.map((section) => ({ ...section, rows: section.rows.map(obojen) })),
      byStartup: {
        groups: model.byStartup.groups.map((group) => ({ ...group, rows: group.rows.map(obojen) })),
        doneToday: model.byStartup.doneToday.map(obojen),
      },
    };
  }, [overview, now, boje]);
  const model = useMemo(
    () => (baseModel ? applyHolds(baseModel, completion.holds, completion.pending) : null),
    [baseModel, completion.holds, completion.pending],
  );
  useLayoutEffect(() => {
    modelRef.current = model;
  });

  // Projekti čije zadatke Moj dan prikazuje (svaki dobija svoj prijavljivač).
  const projektiRedova = useMemo(() => {
    const ids = new Set<string>();
    for (const task of overview?.tasks ?? []) ids.add(task.workspace._id);
    return [...ids].sort() as Id<"workspaces">[];
  }, [overview]);

  // --- Plan, rok, prioritet, redosled ---
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

  const move = (row: TaskRowModel, direction: -1 | 1) => {
    const current = modelRef.current;
    if (!current || row.planEntryId === null || isOptimisticId(row.planEntryId)) return;
    const order = plannedOrder(current).filter((id) => !isOptimisticId(id));
    const next = moveInPlan(order, row.planEntryId, direction);
    if (!next) return;
    void reorderMutation({ dayKey, entryIds: next as Id<"myDayEntries">[] }).catch((error: unknown) =>
      toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
    );
  };

  // --- Panel zadatka (K11): isti panel kao u Mojim zadacima ---
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
              // Zadatak projekta: panel radi pod njegovim projektom (D14).
              ...(row.workspace ? { workspaceId: row.workspace._id as Id<"workspaces"> } : {}),
            }
          : { kind: "personal", personalTaskId: row.id as Id<"personalTasks"> },
      title: row.title,
      origin,
      openedAt: performance.now(),
    });
  };

  const actions: TaskRowActions = {
    onToggleDone: completion.toggleDone,
    onTogglePlan: togglePlan,
    onSetDue: setDue,
    onSetPriority: setPriority,
    onOpen: openPanel,
    onMove: move,
  };

  // --- Prečice liste (E20): isti red, iste radnje kao u Mojim zadacima ---
  const shortcuts = useTaskListShortcuts({
    listRef,
    getRow: (key) => {
      const current = modelRef.current;
      if (!current) return undefined;
      const all = [
        ...current.sections.flatMap((section) => section.rows),
        ...current.byStartup.groups.flatMap((group) => group.rows),
        ...current.byStartup.doneToday,
      ];
      return all.find((row) => row.key === key);
    },
    actions,
    reorder: true,
    enabled: panel === null && !planOpen,
  });

  // --- Desna kolona ---
  const inboxCounts = useQueryState(api.prostor.inbox.unreadCounts, {});
  const inboxFeed = useQueryState(api.prostor.inbox.feed, { unreadOnly: true, paginationOpts: { numItems: 3, cursor: null } });
  const chatUnread = useQueryState(api.prostor.chat.unreadSummary, {});
  const pendingState = useQueryState(api.prostor.inbox.pending, { include: ["idea_vote"] });
  // Znak projekta i u desnoj koloni nosi boju projekta (isto kao red zadatka).
  const oboji = useCallback(
    <T extends { _id: string }>(mini: T): T & { boja: string | null } => ({ ...mini, boja: boje.get(mini._id) ?? null }),
    [boje],
  );
  const workspaces = useMemo(() => (overview?.workspaces ?? []).map(oboji), [overview, oboji]);
  const inboxBlock: SideBlock<SideInbox> =
    inboxCounts.status === "error" || inboxFeed.status === "error"
      ? { status: "hidden" }
      : inboxCounts.status === "loading" || inboxFeed.status === "loading"
        ? { status: "loading" }
        : {
            status: "ready",
            data: {
              unread: inboxCounts.data.total.count,
              capped: inboxCounts.data.total.capped,
              items: inboxFeed.data.page.map((item) => ({
                id: item._id,
                title: item.title,
                workspace: item.workspace ? oboji(item.workspace) : null,
                createdAt: item.createdAt,
              })),
            },
          };

  // --- Isplaniraj dan ---
  // Model plana postoji čim postoji `overview`: dijalog tokom izlaza ne trepne skeletonom.
  const planModel = useMemo(() => (overview ? buildPlanDay(overview, now) : null), [overview, now]);
  const planState: PlanDayState =
    overviewState.status === "error"
      ? { status: "error", retry }
      : planModel
        ? { status: "ready", model: planModel }
        : { status: "loading" };

  return (
    <>
      <PoProjektu workspaceIds={projektiRedova}>
        {(workspaceId) => <RadnjeZadatkaProjekta workspaceId={workspaceId} registar={zadaci} />}
      </PoProjektu>
      <MyDayView
        now={now}
        firstName={firstName}
        state={
          overviewState.status === "error"
            ? { status: "error", retry }
            : model
              ? { status: "ready", model }
              : { status: "loading" }
        }
        groupMode={groupMode}
        onGroupModeChange={changeGroupMode}
        side={{
          cekaTe,
          napredak,
          inbox: inboxBlock,
          chat: sideBlock(chatUnread, (data) => chatSummary(data, workspaces)),
          pending: sideBlock(pendingState, (data) => {
            const sazetak = pendingSummary(data);
            return { ...sazetak, items: sazetak.items.map((item) => ({ ...item, workspace: oboji(item.workspace) })) };
          }),
          onOpenInbox,
          onOpenChat,
          onOpenPending: ({ workspaceId, ideaId }) => onOpenIdea(workspaceId as Id<"workspaces">, ideaId as Id<"ideaNodes">),
        }}
        actions={actions}
        canOpen={() => true}
        selectedKey={shortcuts.selectedKey}
        activeKey={panelRequestKey(panel)}
        request={shortcuts.request}
        onListFocus={shortcuts.onListFocus}
        onQuickAdd={onQuickAdd}
        onPlanDay={() => setPlanOpen(true)}
        onOpenTasks={onOpenTasks}
        listRef={listRef}
        announcement={completion.announcement}
      />
      <PlanDayDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        now={now}
        state={planState}
        onAdd={(row) => {
          const call = planCall(row);
          if (call.fn !== "myDay.plan") return;
          void send(row, call).catch((error: unknown) => toast.error(accessErrorMessage(error, "Plan nije sačuvan.")));
        }}
        onCarryOver={(refKeys) => {
          void carryOverMutation({ dayKey, refKeys }).catch((error: unknown) =>
            toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
          );
        }}
        onDismiss={(refKeys) => {
          void clearOldMutation({ dayKey, refKeys }).catch((error: unknown) =>
            toast.error(accessErrorMessage(error, "Plan nije sačuvan.")),
          );
        }}
      />
      <TaskPanel
        request={panel}
        onClose={() => setPanel(null)}
        today={today}
        profileId={profileId}
        workspaces={projekti}
        onOpenInStartup={onOpenTask}
      />
    </>
  );
}
