"use client";

// Preneto iz Devotion apps/web/components/workspace/task-page/task-page-view.tsx (main @ c05c40f), SPAJANJE S12.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PERMISSION_REASONS } from "@/lib/prostor";
import { toast } from "@/lib/toast";

import { CommentsSection, type CommentsCount } from "@/components/app/prostor/saradnja/comments-section";
import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { ConflictDialog } from "@/components/app/prostor/saradnja/conflict-dialog";
import { LOCK_NOTICE_TASK } from "@/lib/prostor/modeli/collab-model";
import { RevisionHistoryDrawer } from "@/components/app/prostor/saradnja/revision-history-drawer";
import { DiskusijaDijalog, useDiskusijaSidra } from "@/components/app/prostor/poruke/diskusija";
import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import { usePagePresence } from "@/components/app/prostor/saradnja/use-page-presence";

import { InstructionsSection, type StartupTaskPanelChange, type StartupTaskStatus } from "@/components/app/prostor/zadaci/panel/startup-task-panel-view";
import { TaskDetailLayout } from "@/components/app/prostor/zadaci/panel/task-detail-layout";
import { VezeZadatka } from "@/components/app/prostor/zadaci/firma-cip";
import { usePlanEntry, usePlanToggle } from "@/components/app/prostor/zadaci/panel/use-plan-toggle";
import { Button } from "@/components/ui/button";
import { MoveToAreaMenu } from "@/components/app/prostor/dokumenti/move-to-area-menu";
import { combinedEditorSaveState } from "@/lib/prostor/modeli/page-autosave-model";
import { PAGE_ACTIONS_SELECTOR, PageDocument, type PageDocumentNotice } from "@/components/app/prostor/dokumenti/page-document";
import { buildPageMenuItems, usePageDocumentActions, useSaveShortcut } from "@/components/app/prostor/dokumenti/page-document-actions";
import { countLabel, documentAccess, restoreBlockedReason } from "@/lib/prostor/modeli/page-document-model";
import {
  RelationsContainer,
  SubpagesBoundary,
  SubpagesLoader,
  type PageDetails,
} from "@/components/app/prostor/dokumenti/page-document-view";
import { PageSideFacts } from "@/components/app/prostor/dokumenti/page-side-column";
import { useBeforeUnloadGuard, usePageAutosave } from "@/components/app/prostor/dokumenti/use-page-autosave";
import { pageEntryDisplayText } from "@/lib/prostor/modeli/page-entry-text";
import { TaskCheckpointList } from "@/components/app/prostor/zadaci/task-checkpoint-list";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { SectionHeading } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { MOTION_QUERIES } from "@/lib/motion";
import type { Today } from "@/lib/prostor/web/danas";

import { consumeCommentsFocus } from "@/lib/prostor/modeli/comments-focus";
import { taskChangeRoute, taskMenuKeys, taskPermissionsOf, taskSaveErrorMessage } from "@/lib/prostor/modeli/task-page-model";
import type { PageMenuKey } from "@/lib/prostor/modeli/page-document-model";
import { useTaskInstructions } from "@/components/app/prostor/zadaci/use-task-instructions";
import { useProjekatQueryResult, useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useCuvarNapustanja } from "@/components/app/prostor/cuvar-napustanja";

/** Fioka/dijalog otvoren iz menija: stavka menija nestaje, fokus se vraća na „…". */
const actionsTrigger = () => document.querySelector<HTMLElement>(PAGE_ACTIONS_SELECTOR);

const noop = () => {};

/**
 * Radnje menija „…" koje zadatak već ume (isti spisak kao stranica u
 * `page-document-view.tsx`), sa „Diskusijom u Porukama" (S15).
 */
const RADNJE_MENIJA: ReadonlySet<PageMenuKey> = new Set([
  "comments",
  "history",
  "lock",
  "unlock",
  "move",
  "detach",
  "discussion",
  "archive",
]);

export type TaskPageViewProps = {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  page: PageDetails;
  today: Today;
  autoFocusTitle?: boolean;
  onAutoFocusDone?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"areas">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  /** Zadatak je u Korpi: shell vodi na roditelja ili oblast. */
  onArchived: () => void;
};

/**
 * Zadatak na celu stranu — kontejner (PROSTOR P14, K07 §5.7). Isti okvir kao
 * stranica (`PageDocument`: putanja, čuvanje, „uređuje", Komentari, Istorija,
 * zaključavanje, konflikt, bočna kolona) sa rasporedom zadatka koji deli sa
 * panelom (`TaskDetailLayout`). Zadatak nema mapu. Izvori: `pages.get`,
 * `areasV2.updatePage` (naslov i osobine, jedan red sa revizijom),
 * `tasks.updateMetadata` (status na zaključanom zadatku), `taskAssignees.*`,
 * `taskCheckpoints.*`, `comments.*`, `history.*`, `pages.lock/unlock`, `presence.*`.
 */
export function TaskPageView({
  workspace,
  profileId,
  page,
  today,
  autoFocusTitle = false,
  onAutoFocusDone,
  onOpenPage,
  onOpenArea,
  onCreateChild,
  onArchived,
}: TaskPageViewProps) {
  const pageId = page._id;
  const liveNow = useLiveNow(today.now);
  const access = documentAccess(page.permissions);
  const breadcrumbs = useProjekatQueryTolerant(api.prostor.pages.getBreadcrumbs, { pageId });
  const { data: membersData, failed: membersFailed } = useProjekatQueryResult(api.prostor.projekat.listMembers, {
    limit: 50,
  });
  const autosave = usePageAutosave({ pageId, page });
  const updatePage = useProjekatMutation(api.prostor.areasV2.updatePage);
  const updateTaskStatus = useProjekatMutation(api.prostor.tasks.updateMetadata);
  const joinTask = useProjekatMutation(api.prostor.taskAssignees.join);
  const leaveTask = useProjekatMutation(api.prostor.taskAssignees.leave);
  const planEntryId = usePlanEntry(today, `task:${pageId}`);
  const togglePlan = usePlanToggle(today, planEntryId, { kind: "task", taskPageId: pageId });

  const regionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const subpagesHeadingId = useId();
  const commentsHeadingId = useId();
  const relationsHeadingId = useId();
  const contextHeadingId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState<CommentsCount | null>(null);
  const { editors } = usePagePresence(pageId, { canEdit: access.editable, region: regionRef });

  const members = useMemo(() => membersData ?? [], [membersData]);
  const mentionMembers = useMemo<MentionMember[]>(
    () =>
      members.map(({ profile }) => ({
        profileId: profile._id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      })),
    [members],
  );
  const memberName = useCallback(
    (id: string | null) => members.find(({ profile }) => profile._id === id)?.profile.displayName ?? null,
    [members],
  );
  const panelMembers = membersFailed
    ? ("error" as const)
    : membersData === undefined
      ? undefined
      : mentionMembers.map((member) => ({ _id: member.profileId, displayName: member.displayName, avatarUrl: member.avatarUrl }));

  const runPageUpdate = autosave.runPageUpdate;
  const instructions = useTaskInstructions({
    page: { _id: pageId, instructions: page.instructions, revision: page.revision },
    canEdit: page.permissions.canEdit,
    save: (value) =>
      runPageUpdate((expectedRevision) =>
        updatePage({ pageId, expectedRevision, instructions: value }),
      ),
  });

  const saveState = combinedEditorSaveState(autosave.saveState, instructions.state);
  useBeforeUnloadGuard(saveState);
  // Čuvar napuštanja ljuske: dok naslov ili instrukcije nisu sačuvani, odlazak pita.
  const { prijavi } = useCuvarNapustanja();
  useEffect(() => {
    prijavi(pageId, saveState, "stranica");
  }, [pageId, prijavi, saveState]);
  useEffect(() => () => prijavi(pageId, null), [pageId, prijavi]);

  const conflictKey = autosave.conflict
    ? `${autosave.conflict.currentRevision ?? "?"}:${autosave.conflict.updatedAt ?? "?"}`
    : null;
  // Nov konflikt otvara dijalog sam; Esc ga zatvara za taj konflikt (traka ostaje).
  const conflictOpen = conflictKey !== null && dismissedConflict !== conflictKey;
  const setConflictOpen = (open: boolean) => setDismissedConflict(open ? null : conflictKey);

  // Dok naslov čeka odluku o konfliktu, revizija u redu je zastarela: upis instrukcija
  // bi pao isto, pa se umesto njega otvara dijalog konflikta.
  function commitInstructionsOrResolve() {
    if (autosave.conflict !== null) {
      setConflictOpen(true);
      return;
    }
    void instructions.commit();
  }

  // Ctrl/⌘ S: sačuvaj naslov i instrukcije odmah.
  useSaveShortcut(() => {
    autosave.saveNow();
    commitInstructionsOrResolve();
  });

  const draftReady = autosave.draftReady;
  useEffect(() => {
    if (!autoFocusTitle || !draftReady) return;
    titleRef.current?.focus();
    onAutoFocusDone?.();
  }, [autoFocusTitle, draftReady, onAutoFocusDone]);

  function scrollToComments(focusField: boolean) {
    const heading = document.getElementById(commentsHeadingId);
    const smanjen = window.matchMedia(MOTION_QUERIES.still).matches;
    heading?.scrollIntoView({ behavior: smanjen ? "auto" : "smooth", block: "start" });
    if (focusField) {
      heading?.closest("section")?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    }
  }
  // „Svi komentari" iz panela zadatka: strana se otvara već na Komentarima. Zahtev
  // se troši pri otvaranju, a skrol ide tek kad se Komentari učitaju (do tada se
  // raspored još menja) i ponavlja jednom kad se smiri.
  const commentsFocusPending = useRef(false);
  const settleRef = useRef<number>(0);
  useEffect(() => {
    if (consumeCommentsFocus(pageId)) commentsFocusPending.current = true;
  }, [pageId]);
  const commentsLoaded = commentCount !== null;
  useEffect(() => {
    if (!commentsFocusPending.current || !commentsLoaded) return;
    commentsFocusPending.current = false;
    const reveal = (onlyIfHidden: boolean) => {
      const heading = document.getElementById(commentsHeadingId);
      if (!heading) return;
      const top = heading.getBoundingClientRect().top;
      if (onlyIfHidden && top >= 0 && top < window.innerHeight * 0.6) return;
      heading.scrollIntoView({ behavior: "auto", block: "start" });
    };
    reveal(false);
    // Fokus na naslov sekcije: čitač ekrana nastavlja odatle (panel koji je bio fokusiran više ne postoji).
    const heading = document.getElementById(commentsHeadingId);
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
    settleRef.current = window.setTimeout(() => reveal(true), 600);
  }, [commentsLoaded, commentsHeadingId]);
  useEffect(() => () => window.clearTimeout(settleRef.current), []);

  const { lockBusy, setLocked, archive, detach } = usePageDocumentActions({
    kind: "task",
    pageId,
    title: page.title,
    saveState,
    onArchived,
  });

  // --- Osobine zadatka ---------------------------------------------------------
  const assignees = page.assignees.map((person) => ({
    _id: person._id,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl ?? null,
  }));
  const isAssignee = assignees.some((person) => person._id === profileId);
  const permissions = taskPermissionsOf(page.permissions, isAssignee);
  const status = (page.taskStatus ?? "backlog") as StartupTaskStatus;

  function changeTaskMeta(change: StartupTaskPanelChange) {
    const route = taskChangeRoute(change, page.permissions.canEdit);
    if (route === "denied") {
      // Čip je već zaključan; ovde se stiže samo kad je zaključavanje stiglo posle prikaza.
      toast.error(PERMISSION_REASONS.locked);
      return;
    }
    // Naslov čeka odluku o konfliktu: revizija u redu je zastarela, pa bi svaka izmena pala isto.
    if (route === "update" && autosave.conflict !== null) {
      setConflictOpen(true);
      return;
    }
    const previousStatus = status;
    const fail = (fallback: string) => (error: unknown) => toast.error(taskSaveErrorMessage(error, fallback));
    const afterSave = () => {
      if (change.dueDate !== undefined) toast.success("Rok je promenjen.");
      if (change.status === "done" && previousStatus !== "done") {
        toast(`Završeno: ${page.title}`, {
          duration: 8_000,
          action: {
            label: "Poništi",
            onClick: () => void sendStatus(previousStatus).catch(fail("Zadatak nije vraćen. Pokušaj ponovo.")),
          },
        });
      }
    };
    if (route === "status") {
      void updateTaskStatus({ pageId, status: change.status as StartupTaskStatus })
        .then(afterSave)
        .catch(fail("Status nije sačuvan."));
      return;
    }
    void runPageUpdate((expectedRevision) =>
      updatePage({
        pageId,
        expectedRevision,
        ...(change.status === undefined ? {} : { taskStatus: change.status }),
        ...(change.priority === undefined ? {} : { taskPriority: change.priority }),
        ...(change.dueDate === undefined ? {} : { dueDate: change.dueDate }),
        ...(change.assigneeProfileIds === undefined
          ? {}
          : { assigneeProfileIds: change.assigneeProfileIds as Array<Id<"profiles">> }),
      }),
    )
      .then(afterSave)
      .catch(fail(change.dueDate !== undefined ? "Rok nije sačuvan." : "Izmena nije sačuvana."));
  }

  /** Vraćanje statusa iz „Poništi" ide istim putem kao promena. */
  function sendStatus(next: StartupTaskStatus) {
    return page.permissions.canEdit
      ? runPageUpdate((expectedRevision) => updatePage({ pageId, expectedRevision, taskStatus: next }))
      : updateTaskStatus({ pageId, status: next });
  }

  // --- Meni, obaveštenja ---------------------------------------------------------
  const diskusija = useDiskusijaSidra("page", pageId);
  const otherAreas = workspace.areas.filter((area) => area._id !== page.areaId).length;
  const menuKeys = taskMenuKeys(page.permissions, { otherAreas }).filter((key) => RADNJE_MENIJA.has(key));
  const menuItems = buildPageMenuItems({
    keys: menuKeys,
    kind: "task",
    discussionLabel: diskusija.natpis,
    onJumpToComments: () => scrollToComments(true),
    onOpenHistory: () => setHistoryOpen(true),
    onSetLocked: (locked) => void setLocked(locked),
    onOpenMap: () => {},
    onDetach: () => void detach(),
    onDiscussion: diskusija.pokreni,
    onArchive: () => void archive(),
  });

  // Zadatak je zaključan dok je nacrt čekao: polje je samo za čitanje, a nacrt nije na serveru.
  const lostEditRight = !access.editable && saveState !== "saved";
  const notice: PageDocumentNotice | null = lostEditRight
    ? {
        text: "Zadatak je zaključan dok si menjao/la — tvoje izmene nisu sačuvane.",
        actionLabel: "Učitaj najnoviju",
        onAction: discardMyVersion,
        secondary: { label: "Kopiraj moju verziju", onAction: () => void copyMyVersion() },
      }
    : autosave.saveState === "conflict" && !conflictOpen
      ? { text: "Nije sačuvano zbog izmene tima.", actionLabel: "Reši", onAction: () => setConflictOpen(true) }
      : autosave.retriesExhausted
        ? { text: "Izmene nisu sačuvane.", actionLabel: "Pokušaj ponovo", onAction: autosave.saveNow }
        : null;

  const legacyContext = pageEntryDisplayText(autosave.content);

  /** „Kopiraj moju verziju": naslov, instrukcije koje čekaju i (stari) tekst zadatka. */
  async function copyMyVersion() {
    const text = [autosave.title.trim(), instructions.draftText(), legacyContext].filter(Boolean).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Tvoja verzija je kopirana.");
    } catch {
      toast.error("Kopiranje nije uspelo. Obeleži tekst i kopiraj ga ručno.");
    }
  }
  /** „Učitaj najnoviju" kad je pravo izmene nestalo: odbacuje i naslov i instrukcije. */
  function discardMyVersion() {
    instructions.discard();
    void autosave.discardDraft();
  }
  const task = {
    status,
    priority: page.taskPriority ?? "medium",
    dueDate: page.dueDate,
  };

  const body = (
    <div className="space-y-6">
      <TaskDetailLayout
        variant="page"
        now={today.now}
        task={task}
        assignees={assignees}
        members={panelMembers}
        permissions={permissions}
        isSelfAssigned={isAssignee}
        planned={planEntryId !== null}
        onChange={changeTaskMeta}
        onJoin={() =>
          void joinTask({ taskPageId: pageId })
            .then(() => toast.success("Sad si na zadatku."))
            .catch((error: unknown) => toast.error(accessErrorMessage(error, "Priključivanje nije uspelo.")))
        }
        onLeave={() =>
          void leaveTask({ taskPageId: pageId })
            .then(() => toast.success("Više nisi na zadatku."))
            .catch((error: unknown) => toast.error(accessErrorMessage(error, "Napuštanje zadatka nije uspelo.")))
        }
        onTogglePlan={togglePlan}
        onDenied={(reason) => toast.error(reason)}
        veze={<VezeZadatka leadCompanyId={page.leadCompanyId} izvor={page.izvor} />}
        checkpoints={
          <TaskCheckpointList taskPageId={pageId} canCreate={permissions.checkpoints.allowed} />
        }
        instructions={
          <InstructionsSection
            headingAs="h2"
            value={instructions.value}
            onValueChange={instructions.change}
            onCommit={commitInstructionsOrResolve}
            editable={permissions.instructions.allowed}
            lockedReason={permissions.instructions.allowed ? null : permissions.instructions.reason}
            onDenied={(reason) => toast.error(reason)}
            saveState={permissions.instructions.allowed ? instructions.state : undefined}
            onRetry={commitInstructionsOrResolve}
            aside={
              <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setHistoryOpen(true)}>
                Istorija izmena
              </Button>
            }
          />
        }
      />
      {legacyContext ? (
        <section aria-labelledby={contextHeadingId}>
          <SectionHeading id={contextHeadingId} title="Dodatni kontekst" />
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{legacyContext}</p>
        </section>
      ) : null}
    </div>
  );

  const ancestors = (breadcrumbs ?? []).slice(0, -1).map((item) => ({ id: item._id, title: item.title }));
  const areaLabel = workspace.areas.find((area) => area._id === page.areaId)?.label ?? "Oblast";

  return (
    <>
      <PageDocument
        crumbs={{
          areaLabel,
          onOpenArea: () => onOpenArea(page.areaId),
          ancestors,
          onOpenPage: (id) => onOpenPage(id as Id<"pages">),
        }}
        title={autosave.draftReady ? autosave.title : page.title}
        titleLabel="Naslov zadatka"
        lockNotice={LOCK_NOTICE_TASK}
        subject="task"
        editable={access.editable && autosave.draftReady}
        onTitleChange={autosave.editTitle}
        titleRef={titleRef}
        saveState={access.editable || lostEditRight ? saveState : null}
        notice={notice}
        editors={editors}
        lock={{
          view: access.lock,
          lockedByName: page.lockedBy?.displayName ?? null,
          lockedAt: page.lockedAt ?? null,
        }}
        meta={{
          authorName: page.creator?.displayName ?? null,
          editorName: page.updater?.displayName ?? null,
          updatedAt: page.updatedAt,
        }}
        commentCount={countLabel(commentCount)}
        onJumpToComments={() => scrollToComments(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        menuItems={menuItems}
        menuExtra={
          menuKeys.includes("move") ? (
            <MoveToAreaMenu
              asSubmenu
              pageId={pageId}
              pageTitle={page.title}
              currentAreaId={page.areaId}
              areas={workspace.areas}
            />
          ) : null
        }
        body={body}
        subpages={
          <SubpagesBoundary headingId={subpagesHeadingId}>
            <SubpagesLoader
              page={page}
              headingId={subpagesHeadingId}
              now={liveNow}
              canCreate={access.canCreateChild}
              memberName={memberName}
              onOpen={(id) => onOpenPage(id)}
              onCreate={() => onCreateChild({ areaId: page.areaId, parentPageId: pageId })}
              onCount={noop}
            />
          </SubpagesBoundary>
        }
        sideFacts={
          <PageSideFacts
            author={
              page.creator ? { displayName: page.creator.displayName, avatarUrl: page.creator.avatarUrl } : null
            }
            lastEdit={{ editorName: page.updater?.displayName ?? null, at: page.updatedAt }}
            lock={{
              locked: page.permissions.isLocked,
              canLock: page.permissions.canLock,
              canUnlock: page.permissions.canUnlock,
              busy: lockBusy,
              onLock: () => void setLocked(true),
              onUnlock: () => void setLocked(false),
            }}
            now={liveNow}
          />
        }
        relations={
          <RelationsContainer
            page={page}
            areas={workspace.areas}
            headingId={relationsHeadingId}
            onOpenPage={onOpenPage}
          />
        }
        comments={
          <CommentsSection
            target={{ kind: "page", id: pageId }}
            members={mentionMembers}
            selfProfileId={profileId}
            now={liveNow}
            headingId={commentsHeadingId}
            onCountChange={setCommentCount}
          />
        }
        regionRef={regionRef}
        now={liveNow}
      />
      <RevisionHistoryDrawer
        returnFocusFallback={actionsTrigger}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        target={{ kind: "page", id: pageId }}
        currentRevision={page.revision}
        blockedReason={restoreBlockedReason({ canRestoreRevision: page.permissions.canRestoreRevision, saveState, subject: "task" })}
        memberName={memberName}
        now={liveNow}
      />
      <DiskusijaDijalog
        open={diskusija.dijalog.otvoren}
        onOpenChange={diskusija.dijalog.setOtvoren}
        anchorType="page"
        predmet="zadatak"
        anchorId={pageId}
        members={members}
        onOpenChannel={diskusija.dijalog.otvoriKanal}
        finalFocus={actionsTrigger}
      />
      <ConflictDialog
        open={conflictOpen && autosave.saveState === "conflict"}
        onOpenChange={setConflictOpen}
        subject="task"
        updaterName={memberName(autosave.conflict?.updatedByProfileId ?? null)}
        updatedAt={autosave.conflict?.updatedAt ?? null}
        now={liveNow}
        onCopy={() => void copyMyVersion()}
        onLoadLatest={() => {
          if (autosave.loadLatest()) {
            // „Učitaj najnoviju" odbacuje tvoju verziju: i naslov i instrukcije koje čekaju.
            instructions.discard();
            setConflictOpen(false);
          }
        }}
        onOverwrite={() => {
          setConflictOpen(false);
          autosave.overwrite();
        }}
      />
    </>
  );
}
