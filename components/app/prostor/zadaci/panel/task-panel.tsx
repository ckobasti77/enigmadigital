"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/task-panel.tsx (main @ c05c40f), SPAJANJE S12.
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import type { TaskPriorityKey } from "@/lib/prostor/task-sort";

import { CommentsSection } from "@/components/app/prostor/saradnja/comments-section";
import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import { Drawer } from "@/components/ui/drawer";
import { requestCommentsFocus } from "@/lib/prostor/modeli/comments-focus";
import { TaskCheckpointList } from "@/components/app/prostor/zadaci/task-checkpoint-list";
import { taskPermissionsOf } from "@/lib/prostor/modeli/task-page-model";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { Today } from "@/lib/prostor/web/danas";

import { useQueryState } from "@/components/app/prostor/podaci/ja";
import { PersonalTaskPanelHeader, PersonalTaskPanelView, type MoveTargetStartup } from "@/components/app/prostor/zadaci/panel/personal-task-panel-view";
import { PanelInstructions, StartupTaskPanelHeader, type StartupTaskStatus } from "@/components/app/prostor/zadaci/panel/startup-task-panel-view";
import { VezeZadatka } from "@/components/app/prostor/zadaci/firma-cip";
import { TaskDetailLayout } from "@/components/app/prostor/zadaci/panel/task-detail-layout";
import { isGoneError, TaskPanelError, TaskPanelGone, TaskPanelHeaderSkeleton, TaskPanelSkeleton } from "@/components/app/prostor/zadaci/panel/task-panel-states";
import { PLAN_UNDO_MS, usePlanEntry, usePlanToggle } from "@/components/app/prostor/zadaci/panel/use-plan-toggle";
import { useTitleFlight } from "@/components/app/prostor/zadaci/panel/use-title-flight";
import { useProjekatQueryState } from "@/components/app/prostor/podaci/projekat";
import { ProjekatStavkeProvider, useProjekatMutation } from "@/components/app/projekat-provider";

/**
 * Šta panel otvara. Zadatak projekta sa ekrana „Ja“ (Moji zadaci, Danas) nosi
 * i `workspaceId`: panel ga tada umotava u `ProjekatStavkeProvider` (plan S07
 * D14), pa projektne kuke šalju projekat stavke. Na ekranu projekta ga nema
 * (projekat daje ljuska).
 */
export type TaskPanelTarget =
  | { kind: "task"; pageId: Id<"pages">; workspaceId?: Id<"workspaces"> }
  | { kind: "personal"; personalTaskId: Id<"personalTasks"> };

/** Otvaranje panela: cilj, naslov (ime dijaloga dok se podaci ne učitaju) i naslov reda za let. */
export type TaskPanelRequest = {
  target: TaskPanelTarget;
  title: string;
  origin: HTMLElement | null;
  /** `performance.now()` pri kliku (rukovalac) — let naslova samo dok panel ulazi. */
  openedAt: number;
};

export type TaskPanelProps = {
  request: TaskPanelRequest | null;
  onClose: () => void;
  today: Today;
  profileId: Id<"profiles">;
  /** Projekti sa oblastima: ime i znak projekta, naziv oblasti i „Prebaci u projekat". */
  workspaces: ReadonlyArray<MoveTargetStartup & { _id: Id<"workspaces">; areas: ReadonlyArray<{ _id: Id<"areas">; label: string }> }>;
  onOpenInStartup: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
  /**
   * Liste u projektu (K17): umesto „Otvori u projektu" (već si u njemu)
   * panel nudi „Puni prikaz" — punu stranicu zadatka.
   */
  onOpenFull?: (pageId: Id<"pages">) => void;
};

/** „Poništi" traje 8 s (plan K07 E6). */
const UNDO_MS = PLAN_UNDO_MS;

export function panelRequestKey(request: TaskPanelRequest | null) {
  if (!request) return null;
  return request.target.kind === "task" ? `task:${request.target.pageId}` : `personal:${request.target.personalTaskId}`;
}

/**
 * Panel zadatka (plan K07 §1.4, trenutak 3) — kontejner. Desni `Drawer`
 * (28rem, na uskom ekranu ceo ekran) za zadatak projekta ili lični zadatak;
 * Moj dan i Moji zadaci otvaraju ISTI panel. Tokom izlaza prikazuje poslednji
 * cilj (Drawer izlazi istim putem).
 */
export function TaskPanel({ request, onClose, today, profileId, workspaces, onOpenInStartup, onOpenFull }: TaskPanelProps) {
  const [shown, setShown] = useState(request);
  // „Pokušaj ponovo" ponovo montira sadržaj (nova pretplata).
  const [attempt, setAttempt] = useState(0);
  if (request && request !== shown) setShown(request);
  const requestRef = useRef(request);
  useLayoutEffect(() => {
    requestRef.current = request;
  });
  // Posle izlaza panel se demontira (pretplate se puštaju do sledećeg otvaranja).
  const onExited = () => {
    if (!requestRef.current) setShown(null);
  };
  const startedAt = shown?.openedAt ?? null;
  const open = request !== null;
  // „Otvori" iz toasta može stići kasnije: uvek najnoviji rukovalac.
  const openInStartupRef = useRef(onOpenInStartup);
  const openFullRef = useRef(onOpenFull);
  useLayoutEffect(() => {
    openInStartupRef.current = onOpenInStartup;
    openFullRef.current = onOpenFull;
  });

  if (!shown) return null;
  const common = {
    open,
    onClose,
    today,
    profileId,
    workspaces,
    origin: shown.origin,
    fallbackTitle: shown.title,
    flightKey: open ? `${panelRequestKey(shown)}:${startedAt ?? 0}` : null,
    startedAt,
    openInStartup: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => openInStartupRef.current(workspaceId, pageId),
    openFull: onOpenFull ? (pageId: Id<"pages">) => openFullRef.current?.(pageId) : null,
    retry: () => setAttempt((value) => value + 1),
    onExited,
  };
  if (shown.target.kind === "task") {
    const panel = <StartupTaskPanel key={`${shown.target.pageId}:${attempt}`} pageId={shown.target.pageId} {...common} />;
    return shown.target.workspaceId ? (
      <ProjekatStavkeProvider workspaceId={shown.target.workspaceId}>{panel}</ProjekatStavkeProvider>
    ) : (
      panel
    );
  }
  return (
    <PersonalTaskPanel key={`${shown.target.personalTaskId}:${attempt}`} personalTaskId={shown.target.personalTaskId} {...common} />
  );
}

type PanelCommon = {
  open: boolean;
  onClose: () => void;
  today: Today;
  profileId: Id<"profiles">;
  workspaces: TaskPanelProps["workspaces"];
  origin: HTMLElement | null;
  fallbackTitle: string;
  flightKey: string | null;
  startedAt: number | null;
  openInStartup: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
  /** „Puni prikaz" (liste u projektu) ili `null` („Otvori u projektu"). */
  openFull: ((pageId: Id<"pages">) => void) | null;
  retry: () => void;
  onExited: () => void;
};

/** Ako je panel otvoren iz menija (stavka nestaje), fokus se vraća na naslov reda. */
function rowFocusOf(origin: HTMLElement | null) {
  return () => origin?.closest("[data-row-key]")?.querySelector<HTMLElement>("[data-row-focus]") ?? null;
}

function StartupTaskPanel({
  pageId,
  open,
  onClose,
  today,
  profileId,
  workspaces,
  origin,
  fallbackTitle,
  flightKey,
  startedAt,
  openInStartup,
  openFull,
  retry,
  onExited,
}: PanelCommon & { pageId: Id<"pages"> }) {
  const page = useProjekatQueryState(api.prostor.pages.get, { pageId });
  const assignees = useProjekatQueryState(api.prostor.taskAssignees.listForTask, { taskPageId: pageId });
  const data = page.status === "ready" ? page.data : null;
  // Izvršioce menja svaki član dok zadatak nije zaključan (P1), pa su članovi uvek potrebni.
  const members = useProjekatQueryState(api.prostor.projekat.listMembers, data ? { limit: 50 } : "skip");
  const liveNow = useLiveNow(today.now);
  const commentsHeadingId = useId();
  const memberData = members.status === "ready" ? members.data : null;
  const mentionMembers = useMemo(
    () =>
      (memberData ?? []).map(({ profile }) => ({
        profileId: profile._id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      })),
    [memberData],
  );
  const entryId = usePlanEntry(today, `task:${pageId}`);
  const togglePlan = usePlanToggle(today, entryId, { kind: "task", taskPageId: pageId });

  const updateMetadata = useProjekatMutation(api.prostor.tasks.updateMetadata);
  const renamePage = useProjekatMutation(api.prostor.pages.update);
  const join = useProjekatMutation(api.prostor.taskAssignees.join);
  const leave = useProjekatMutation(api.prostor.taskAssignees.leave);

  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  useTitleFlight({ origin, target: titleEl, flightKey, startedAt });

  // Projekat van spiska (npr. iza prvih 50) i dalje otvara panel, uz opšte ime.
  const workspace = data
    ? (workspaces.find((item) => item._id === data.workspaceId) ?? { _id: data.workspaceId, name: "Projekat", logoUrl: null, areas: [] })
    : undefined;
  const area = data && workspace ? workspace.areas.find((item) => item._id === data.areaId) : undefined;
  // Dozvole zavise od izvršilaca: dok se ne učitaju, panel je u učitavanju
  // (inače bi izvršilac na trenutak video zaključan status i „Priključi se").
  const assigneeList = assignees.status === "ready" ? assignees.data : [];
  const isAssignee = assigneeList.some((person) => person.profileId === profileId);
  // Zaključan zadatak menjaju autor, vlasnik i admin (`permissions.canEdit`); izvršilac još i status.
  // Dok se stranica učitava, panel je skeleton (dozvole se ne koriste).
  const permissions = taskPermissionsOf(data ? data.permissions : { isLocked: false, canEdit: true }, isAssignee);

  const fail = (fallback: string) => (error: unknown) => toast.error(accessErrorMessage(error, fallback));

  const change = (patch: {
    status?: StartupTaskStatus;
    priority?: TaskPriorityKey;
    dueDate?: number | null;
    assigneeProfileIds?: string[];
    instructions?: string | null;
  }) => {
    if (!data) return;
    const previousStatus = (data.taskStatus ?? "backlog") as StartupTaskStatus;
    void updateMetadata({
      pageId,
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.priority === undefined ? {} : { priority: patch.priority }),
      ...(patch.dueDate === undefined ? {} : { dueDate: patch.dueDate }),
      ...(patch.assigneeProfileIds === undefined
        ? {}
        : { assigneeProfileIds: patch.assigneeProfileIds as Id<"profiles">[] }),
      ...(patch.instructions === undefined ? {} : { instructions: patch.instructions }),
    })
      .then(() => {
        if (patch.dueDate !== undefined) toast.success("Rok je promenjen.");
        if (patch.status === "done" && previousStatus !== "done") {
          toast(`Završeno: ${data.title}`, {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => {
                void updateMetadata({ pageId, status: previousStatus }).catch(fail("Zadatak nije vraćen. Pokušaj ponovo."));
              },
            },
          });
        }
      })
      .catch(
        fail(
          patch.dueDate !== undefined
            ? "Rok nije sačuvan."
            : patch.instructions !== undefined
              ? "Instrukcije nisu sačuvane."
              : "Izmena nije sačuvana.",
        ),
      );
  };

  const title = data?.title ?? fallbackTitle;
  let body;
  let header;
  if (page.status === "error" || assignees.status === "error") {
    header = null;
    const error = page.status === "error" ? page.error : assignees.status === "error" ? assignees.error : null;
    body = error && isGoneError(error) ? <TaskPanelGone onClose={onClose} /> : <TaskPanelError retry={retry} onClose={onClose} />;
  } else if (!data || !workspace || assignees.status !== "ready") {
    header = <TaskPanelHeaderSkeleton />;
    body = <TaskPanelSkeleton />;
  } else {
    const task = {
      title: data.title,
      status: (data.taskStatus ?? "backlog") as StartupTaskStatus,
      priority: data.taskPriority ?? null,
      dueDate: data.dueDate ?? null,
      instructions: data.instructions ?? null,
      workspace: { _id: workspace._id, name: workspace.name, logoUrl: workspace.logoUrl },
      areaLabel: area?.label ?? null,
    };
    header = (
      <StartupTaskPanelHeader
        task={task}
        canEditTitle={data.permissions.canEdit}
        titleRef={setTitleEl}
        onRename={(next) => {
          void renamePage({ pageId, title: next, expectedRevision: data.revision }).catch(fail("Naslov nije sačuvan."));
        }}
      />
    );
    const memberList =
      members.status === "ready"
        ? members.data.map(({ profile }) => ({ _id: profile._id, displayName: profile.displayName, avatarUrl: profile.avatarUrl }))
        : members.status === "error"
          ? ("error" as const)
          : undefined;
    const openFullPage = () => {
      onClose();
      if (openFull) openFull(pageId);
      else openInStartup(data.workspaceId, pageId);
    };
    body = (
      <TaskDetailLayout
        variant="panel"
        now={today.now}
        task={task}
        assignees={assigneeList.map((person) => ({
          _id: person.profileId,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
        }))}
        members={memberList}
        permissions={permissions}
        isSelfAssigned={isAssignee}
        planned={entryId !== null}
        onChange={change}
        onJoin={() => void join({ taskPageId: pageId }).catch(fail("Priključivanje nije uspelo."))}
        onLeave={() => void leave({ taskPageId: pageId }).catch(fail("Napuštanje zadatka nije uspelo."))}
        onTogglePlan={togglePlan}
        onDenied={(reason) => toast.error(reason)}
        openAction={{ kind: openFull ? "full" : "startup", onSelect: openFullPage }}
        veze={<VezeZadatka leadCompanyId={data.leadCompanyId} izvor={data.izvor} />}
        checkpoints={
          <TaskCheckpointList taskPageId={pageId} canCreate={permissions.checkpoints.allowed} compact />
        }
        instructions={
          <PanelInstructions
            value={task.instructions}
            editable={permissions.instructions.allowed}
            lockedReason={permissions.instructions.allowed ? null : permissions.instructions.reason}
            onDenied={(reason) => toast.error(reason)}
            onSave={(instructions) => change({ instructions })}
          />
        }
        comments={
          <CommentsSection
            target={{ kind: "page", id: pageId }}
            members={mentionMembers}
            selfProfileId={profileId}
            now={liveNow}
            headingId={commentsHeadingId}
            compact={{
              onShowAll: () => {
                requestCommentsFocus(pageId);
                openFullPage();
              },
            }}
          />
        }
      />
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={title}
      header={header}
      width="28rem"
      initialFocus="panel"
      closeLabel="Zatvori panel"
      returnFocusFallback={rowFocusOf(origin)}
      onExited={onExited}
    >
      {body}
    </Drawer>
  );
}

function PersonalTaskPanel({
  personalTaskId,
  open,
  onClose,
  today,
  workspaces,
  origin,
  fallbackTitle,
  flightKey,
  startedAt,
  openInStartup,
  retry,
  onExited,
}: PanelCommon & { personalTaskId: Id<"personalTasks"> }) {
  const taskState = useQueryState(api.prostor.personalTasks.get, { personalTaskId });
  const entryId = usePlanEntry(today, `personal:${personalTaskId}`);
  const togglePlan = usePlanToggle(today, entryId, { kind: "personal", personalTaskId });
  const update = useMutation(api.prostor.personalTasks.update);
  const setStatus = useMutation(api.prostor.personalTasks.setStatus);
  const archive = useMutation(api.prostor.personalTasks.archive);
  const restore = useMutation(api.prostor.personalTasks.restore);
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  useTitleFlight({ origin, target: titleEl, flightKey, startedAt });

  const fail = (fallback: string) => (error: unknown) => toast.error(accessErrorMessage(error, fallback));
  const task = taskState.status === "ready" ? taskState.data : undefined;

  let header = null;
  let body;
  if (taskState.status === "error") {
    body = isGoneError(taskState.error) ? <TaskPanelGone onClose={onClose} /> : <TaskPanelError retry={retry} onClose={onClose} />;
  } else if (taskState.status === "loading") {
    header = <TaskPanelHeaderSkeleton />;
    body = <TaskPanelSkeleton />;
  } else if (!task) {
    body = <TaskPanelGone onClose={onClose} />;
  } else {
    const view = {
      title: task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
    };
    const change = (patch: { title?: string; notes?: string | null; priority?: TaskPriorityKey | null; dueDate?: number | null }) => {
      void update({ personalTaskId, ...patch })
        .then(() => {
          if (patch.dueDate !== undefined) toast.success("Rok je promenjen.");
        })
        .catch(fail(patch.dueDate !== undefined ? "Rok nije sačuvan." : "Izmena nije sačuvana."));
    };
    const toggleDone = (done: boolean) => {
      void setStatus({ personalTaskId, status: done ? "done" : "open" })
        .then(() => {
          if (!done) return;
          toast(`Završeno: ${task.title}`, {
            duration: UNDO_MS,
            action: {
              label: "Poništi",
              onClick: () => void setStatus({ personalTaskId, status: "open" }).catch(fail("Zadatak nije vraćen. Pokušaj ponovo.")),
            },
          });
        })
        .catch(fail(done ? "Zadatak nije završen. Pokušaj ponovo." : "Zadatak nije vraćen. Pokušaj ponovo."));
    };
    header = <PersonalTaskPanelHeader task={view} onChange={change} onToggleDone={toggleDone} titleRef={setTitleEl} />;
    body = (
      <PersonalTaskPanelView
        now={today.now}
        task={view}
        planned={entryId !== null}
        workspaces={workspaces}
        onChange={change}
        onToggleDone={toggleDone}
        onTogglePlan={togglePlan}
        onArchive={() => {
          onClose();
          void archive({ personalTaskId })
            .then(() =>
              toast("Zadatak je obrisan.", {
                duration: UNDO_MS,
                action: {
                  label: "Poništi",
                  onClick: () => void restore({ personalTaskId }).catch(fail("Vraćanje nije uspelo.")),
                },
              }),
            )
            .catch(fail("Brisanje nije uspelo."));
        }}
        personalTaskId={personalTaskId}
        onMoved={(workspaceId, pageId) => {
          // Prebacivanje (projektna mutacija ciljnog projekta) radi korak u
          // prikazu, pod `ProjekatStavkeProvider`-om izabranog projekta.
          const target = workspaces.find((item) => item._id === workspaceId);
          onClose();
          toast.success(`Prebačeno u ${target?.name ?? "projekat"}.`, {
            duration: UNDO_MS,
            action: { label: "Otvori", onClick: () => openInStartup(workspaceId, pageId) },
          });
        }}
      />
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={task?.title ?? fallbackTitle}
      header={header}
      width="28rem"
      initialFocus="panel"
      closeLabel="Zatvori panel"
      returnFocusFallback={rowFocusOf(origin)}
      onExited={onExited}
    >
      {body}
    </Drawer>
  );
}
