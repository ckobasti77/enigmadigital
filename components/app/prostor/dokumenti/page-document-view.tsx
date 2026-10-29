"use client";

// Preneto iz Devotion apps/web/components/workspace/page/page-document-view.tsx (main @ c05c40f), SPAJANJE S10.
import { Component, useCallback, useEffect, useMemo, useId, useRef, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "@/lib/toast";

import { CommentsSection, type CommentsCount } from "@/components/app/prostor/saradnja/comments-section";
import type { MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { ConflictDialog } from "@/components/app/prostor/saradnja/conflict-dialog";
import { RevisionHistoryDrawer } from "@/components/app/prostor/saradnja/revision-history-drawer";
import { usePagePresence } from "@/components/app/prostor/saradnja/use-page-presence";
import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import { PageRelationsCompact } from "@/components/app/prostor/saradnja/page-relations";
import { RichTextEditor } from "@/components/app/prostor/editor";
import { NoteAttachmentsProvider, useNoteFileUpload } from "@/components/app/prostor/prilozi/note-attachments";
import { PageFilesPanel } from "@/components/app/prostor/prilozi/page-files-panel";
import { PageTablePanel } from "@/components/app/prostor/tabele/page-table-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { MoveToAreaMenu } from "@/components/app/prostor/dokumenti/move-to-area-menu";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { MOTION_QUERIES } from "@/lib/motion";

import { PAGE_ACTIONS_SELECTOR, PageDocument, type PageDocumentNotice } from "@/components/app/prostor/dokumenti/page-document";
import { buildPageMenuItems, usePageDocumentActions, useSaveShortcut } from "@/components/app/prostor/dokumenti/page-document-actions";
import {
  countLabel,
  documentAccess,
  pageMenuKeys,
  restoreBlockedReason,
  subpageMeta,
  type PageMenuKey,
} from "@/lib/prostor/modeli/page-document-model";
import { PageSideFacts } from "@/components/app/prostor/dokumenti/page-side-column";
import { SubpagesList } from "@/components/app/prostor/dokumenti/subpages-list";
import { useBeforeUnloadGuard, usePageAutosave } from "@/components/app/prostor/dokumenti/use-page-autosave";
import { useCuvarNapustanja } from "@/components/app/prostor/cuvar-napustanja";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import {
  useProjekatPaginatedQuery,
  useProjekatQueryResult,
  useProjekatQueryTolerant,
} from "@/components/app/prostor/podaci/projekat";

export type PageDetails = FunctionReturnType<typeof api.prostor.pages.get>;

/** Podstranica po strani liste. */
const SUBPAGES_PAGE = 20;

/**
 * Radnje menija „…" koje ovaj prikaz već ume. Mapa i Diskusija dolaze sa
 * svojim modulima (mape, poruke) i tada se dodaju ovde.
 */
const RADNJE_MENIJA: ReadonlySet<PageMenuKey> = new Set([
  "comments",
  "history",
  "lock",
  "unlock",
  "move",
  "detach",
  "archive",
]);

/** Fioka otvorena iz menija: stavka menija nestaje, fokus se vraća na „…". */
const actionsTrigger = () => document.querySelector<HTMLElement>(PAGE_ACTIONS_SELECTOR);

export type PageDocumentViewProps = {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  page: PageDetails;
  now: number;
  /** Fokus na naslov samo za upravo napravljenu stranicu (K07 §5.6). */
  autoFocusTitle?: boolean;
  /** Naslov je dobio fokus (ljuska zaboravlja da je stranica nova). */
  onAutoFocusDone?: () => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenArea: (areaId: Id<"areas">) => void;
  onCreateChild: (target: CreatePageTarget) => void;
  /** Stranica je u Korpi: ljuska vodi na roditelja ili oblast. */
  onArchived: () => void;
};

/**
 * Stranica (beleška, tabela, fajl) kao dokument tima — kontejner (PROSTOR
 * P13, P19, P23; K07 §5.6). Izvori: `pages.get` (dozvole), `getBreadcrumbs`,
 * `projekat.listMembers` (imena i @), `areasV2.updatePage` kroz
 * `usePageAutosave` (650 ms, `expectedRevision`, konflikt „Učitaj najnoviju /
 * Prepiši"), `pages.listChildren`, `areasV2.listRelations`, `pages.lock/unlock`,
 * `presence.*`, `comments.*`, `history.*`, `pageFiles.*`, `pageTables.*` i
 * `areasV2.archivePage` (Korpa + „Poništi").
 *
 * Stanje čuvanja ide čuvaru napuštanja ljuske (`useCuvarNapustanja`), a
 * zatvaranje kartice pita pregledač (`useBeforeUnloadGuard`).
 */
export function PageDocumentView({
  workspace,
  profileId,
  page,
  now,
  autoFocusTitle = false,
  onAutoFocusDone,
  onOpenPage,
  onOpenArea,
  onCreateChild,
  onArchived,
}: PageDocumentViewProps) {
  const pageId = page._id;
  const liveNow = useLiveNow(now);
  const access = documentAccess(page.permissions);
  const breadcrumbs = useProjekatQueryTolerant(api.prostor.pages.getBreadcrumbs, { pageId });
  const membersResult = useProjekatQueryTolerant(api.prostor.projekat.listMembers, { limit: 50 });
  // Tolerantno: pad spiska priloga ne obara dokument (prilozi se tada ne prikazuju).
  const noteFiles = useProjekatQueryTolerant(
    api.prostor.pageFiles.list,
    page.kind === "note" ? { pageId } : "skip",
  );
  const uploadNoteFile = useNoteFileUpload(page.kind === "note" && access.editable ? pageId : null);
  const autosave = usePageAutosave({
    pageId,
    page,
    noteFileCount: noteFiles?.length ?? 0,
  });

  const regionRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const subpagesHeadingId = useId();
  const commentsHeadingId = useId();
  const relationsHeadingId = useId();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState<CommentsCount | null>(null);
  const [subpageCount, setSubpageCount] = useState<{ count: number; capped: boolean } | null>(null);
  const { editors } = usePagePresence(pageId, { canEdit: access.editable, region: regionRef });

  const members = useMemo(() => membersResult ?? [], [membersResult]);
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

  const saveState = autosave.saveState;
  useBeforeUnloadGuard(saveState);
  // Čuvar napuštanja ljuske: dok nešto nije sačuvano, odlazak pita.
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

  useSaveShortcut(autosave.saveNow);

  const draftReady = autosave.draftReady;
  useEffect(() => {
    if (!autoFocusTitle || !draftReady) return;
    titleRef.current?.focus();
    onAutoFocusDone?.();
  }, [autoFocusTitle, draftReady, onAutoFocusDone]);

  function jumpToComments() {
    const heading = document.getElementById(commentsHeadingId);
    const still = window.matchMedia(MOTION_QUERIES.still).matches;
    heading?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    heading
      ?.closest("section")
      ?.querySelector<HTMLTextAreaElement>("textarea")
      ?.focus({ preventScroll: true });
  }

  const { lockBusy, setLocked, archive, detach } = usePageDocumentActions({
    kind: "page",
    pageId,
    title: page.title,
    saveState,
    onArchived: () => {
      // Stranica je u Korpi: nacrt više nema šta da čuva.
      prijavi(pageId, null);
      onArchived();
    },
  });

  const otherAreas = workspace.areas.filter((area) => area._id !== page.areaId).length;
  const hasChildren = (subpageCount?.count ?? 0) > 0;
  const menuKeys = pageMenuKeys(page.permissions, { hasChildren, otherAreas }).filter((key) =>
    RADNJE_MENIJA.has(key),
  );
  const menuItems = buildPageMenuItems({
    keys: menuKeys,
    kind: "page",
    discussionLabel: "Diskusija u Porukama",
    onJumpToComments: jumpToComments,
    onOpenHistory: () => setHistoryOpen(true),
    onSetLocked: (locked) => void setLocked(locked),
    onOpenMap: () => {},
    onDetach: () => void detach(),
    onDiscussion: () => {},
    onArchive: () => void archive(),
  });

  // Stranica je zaključana dok je nacrt čekao: editor je samo za čitanje, a
  // nacrt nije na serveru — to mora da se vidi i da se reši (kopija ili odbacivanje).
  const lostEditRight = !access.editable && saveState !== "saved";
  const notice: PageDocumentNotice | null = lostEditRight
    ? {
        text: "Stranica je zaključana dok si je menjao/la — tvoje izmene nisu sačuvane.",
        actionLabel: "Učitaj najnoviju",
        onAction: () => void autosave.discardDraft(),
        secondary: { label: "Kopiraj moju verziju", onAction: () => void autosave.copyDraft() },
      }
    : saveState === "conflict" && !conflictOpen
      ? { text: "Nije sačuvano zbog izmene tima.", actionLabel: "Reši", onAction: () => setConflictOpen(true) }
      : autosave.retriesExhausted
        ? { text: "Izmene nisu sačuvane.", actionLabel: "Pokušaj ponovo", onAction: autosave.saveNow }
        : null;

  // Prilozi u telu beleške: spisak iz `pageFiles.list`, otpremanje kroz
  // uređivač (traka, prevlačenje, lepljenje), pregled u pregledaču fajlova.
  const body =
    page.kind === "note" ? (
      autosave.draftReady ? (
        <NoteAttachmentsProvider files={noteFiles}>
          <RichTextEditor
            key={pageId}
            documentKey={pageId}
            content={autosave.content}
            editable={access.editable}
            attachments={uploadNoteFile !== null ? { upload: uploadNoteFile } : undefined}
            onChange={({ html }) => autosave.editContent(html)}
          />
        </NoteAttachmentsProvider>
      ) : (
        <Skeleton className="h-[42vh] rounded-lg sm:h-[52vh]" />
      )
    ) : page.kind === "table" ? (
      <PageTablePanel pageId={pageId} />
    ) : (
      <PageFilesPanel pageId={pageId} canManage={access.editable} />
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
        onJumpToComments={jumpToComments}
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
              onCount={setSubpageCount}
            />
          </SubpagesBoundary>
        }
        sideFacts={
          <PageSideFacts
            author={
              page.creator
                ? { displayName: page.creator.displayName, avatarUrl: page.creator.avatarUrl }
                : null
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
      {/* Pregled verzije beleške vidi priloge stranice (blok priloga u starom tekstu). */}
      <NoteAttachmentsProvider files={noteFiles}>
        <RevisionHistoryDrawer
          returnFocusFallback={actionsTrigger}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          target={{ kind: "page", id: pageId }}
          currentRevision={page.revision}
          blockedReason={restoreBlockedReason({ canRestoreRevision: page.permissions.canRestoreRevision, saveState })}
          richPreview={page.kind === "note"}
          memberName={memberName}
          now={liveNow}
        />
      </NoteAttachmentsProvider>
      <ConflictDialog
        open={conflictOpen && saveState === "conflict"}
        onOpenChange={setConflictOpen}
        updaterName={memberName(autosave.conflict?.updatedByProfileId ?? null)}
        updatedAt={autosave.conflict?.updatedAt ?? null}
        now={liveNow}
        onCopy={() => void autosave.copyDraft()}
        onLoadLatest={() => {
          if (autosave.loadLatest()) setConflictOpen(false);
        }}
        onOverwrite={() => {
          setConflictOpen(false);
          autosave.overwrite();
        }}
      />
    </>
  );
}

/** Podstranice stranice ili zadatka (deli ih i puna strana zadatka, K11). */
export function SubpagesLoader({
  page,
  headingId,
  now,
  canCreate,
  memberName,
  onOpen,
  onCreate,
  onShowMap,
  onCount,
}: {
  page: PageDetails;
  headingId: string;
  now: number;
  canCreate: boolean;
  memberName: (id: string | null) => string | null;
  onOpen: (id: Id<"pages">) => void;
  onCreate: () => void;
  /** Zadatak nema mapu (P14): bez ovoga nema „Prikaži na mapi". */
  onShowMap?: () => void;
  onCount: (count: { count: number; capped: boolean } | null) => void;
}) {
  const { results, status, loadMore } = useProjekatPaginatedQuery(
    api.prostor.pages.listChildren,
    { areaId: page.areaId, parentPageId: page._id },
    { initialNumItems: SUBPAGES_PAGE },
  );
  const loading = status === "LoadingFirstPage";
  const hasMore = status === "CanLoadMore" || status === "LoadingMore";
  useEffect(() => {
    onCount(loading ? null : { count: results.length, capped: hasMore });
  }, [hasMore, loading, onCount, results.length]);

  return (
    <SubpagesList
      headingId={headingId}
      state={
        loading
          ? { status: "loading" }
          : {
              status: "ready",
              items: results.map((child) => ({
                id: child._id,
                title: child.title,
                kind: child.kind,
                meta: subpageMeta(
                  { kind: child.kind, editorName: memberName(child.updatedByProfileId), updatedAt: child.updatedAt },
                  now,
                ),
                locked: child.lockedAt !== null && child.lockedAt !== undefined,
              })),
              loadMore: hasMore
                ? { busy: status === "LoadingMore", onLoad: () => loadMore(SUBPAGES_PAGE) }
                : null,
            }
      }
      count={countLabel(loading ? null : { count: results.length, capped: hasMore })}
      onOpen={(id) => onOpen(id as Id<"pages">)}
      onCreate={canCreate ? onCreate : undefined}
      onShowMap={onShowMap}
    />
  );
}

export class SubpagesBoundary extends Component<{ children: ReactNode; headingId: string }, { failed: boolean; attempt: number }> {
  state = { failed: false, attempt: 0 };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return <div key={this.state.attempt}>{this.props.children}</div>;
    return (
      <SubpagesList
        headingId={this.props.headingId}
        state={{
          status: "error",
          onRetry: () => this.setState((current) => ({ failed: false, attempt: current.attempt + 1 })),
        }}
        count={null}
        onOpen={() => {}}
      />
    );
  }
}

/** „Povezano" u bočnoj koloni dokumenta (deli ga i puna strana zadatka). */
export function RelationsContainer(props: {
  page: PageDetails;
  areas: ReadonlyArray<{ _id: Id<"areas">; label: string }>;
  headingId: string;
  onOpenPage: (pageId: Id<"pages">) => void;
}) {
  // Greška upita se ne popravlja sama: „Pokušaj ponovo" pravi novu pretplatu.
  const [attempt, setAttempt] = useState(0);
  return <RelationsLoader key={attempt} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

function RelationsLoader({
  page,
  areas,
  headingId,
  onOpenPage,
  onRetry,
}: {
  page: PageDetails;
  areas: ReadonlyArray<{ _id: Id<"areas">; label: string }>;
  headingId: string;
  onOpenPage: (pageId: Id<"pages">) => void;
  onRetry: () => void;
}) {
  const { data: result, failed } = useProjekatQueryResult(api.prostor.areasV2.listRelations, { pageId: page._id });
  const createRelation = useProjekatMutation(api.prostor.areasV2.createRelation);
  const deleteRelation = useProjekatMutation(api.prostor.areasV2.deleteRelation);
  const [selected, setSelected] = useState<Id<"pages"> | "">("");
  const [busy, setBusy] = useState(false);
  const areaLabel = (areaId: Id<"areas">) =>
    areaId === page.areaId ? null : (areas.find((area) => area._id === areaId)?.label ?? "Druga oblast");

  async function create() {
    if (!selected) return;
    setBusy(true);
    try {
      const linked = result?.candidates.find((candidate) => candidate.pageId === selected);
      await createRelation({ pageAId: page._id, pageBId: selected });
      setSelected("");
      toast.success(`Povezano sa „${linked?.title.trim() || "Bez naslova"}“.`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(relationId: Id<"pageRelations">) {
    setBusy(true);
    try {
      await deleteRelation({ relationId });
      toast.success("Veza je uklonjena.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageRelationsCompact
      headingId={headingId}
      loading={result === undefined && !failed}
      failed={failed ? { onRetry } : null}
      relations={(result?.relations ?? []).map((relation) => ({
        id: relation._id,
        pageId: relation.linkedPage.pageId,
        title: relation.linkedPage.title,
        kind: relation.linkedPage.kind,
        areaLabel: areaLabel(relation.linkedPage.areaId),
        canDelete: relation.canDelete,
        canRequestDeletion: false,
      }))}
      candidates={(result?.candidates ?? []).map((candidate) => ({
        pageId: candidate.pageId,
        title: candidate.title,
        kind: candidate.kind,
        areaLabel: areaLabel(candidate.areaId),
      }))}
      candidatesTruncated={result?.candidatesTruncated ?? false}
      selectedCandidate={selected}
      onSelectedCandidate={setSelected}
      busy={busy}
      onCreate={create}
      onDelete={remove}
      onOpenPage={onOpenPage}
    />
  );
}
