"use client";

// Preneto iz Devotion apps/web/components/workspace/page/page-document-view.tsx (main @ c05c40f), SPAJANJE S10.
import { Component, useCallback, useEffect, useMemo, useId, useRef, useState, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { FileSpreadsheet, Paperclip } from "lucide-react";

import { ConflictDialog } from "@/components/app/prostor/saradnja/conflict-dialog";
import { useLiveNow } from "@/components/app/prostor/saradnja/use-live-now";
import { RichTextEditor } from "@/components/app/prostor/editor";
import {
  NoteAttachmentsContext,
  type NoteAttachmentsContextValue,
} from "@/components/app/prostor/editor/prilozi-kontekst";
import { Skeleton } from "@/components/ui/skeleton";
import { MoveToAreaMenu } from "@/components/app/prostor/dokumenti/move-to-area-menu";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

import { PageDocument, type PageDocumentNotice } from "@/components/app/prostor/dokumenti/page-document";
import { buildPageMenuItems, usePageDocumentActions, useSaveShortcut } from "@/components/app/prostor/dokumenti/page-document-actions";
import {
  countLabel,
  documentAccess,
  pageMenuKeys,
  subpageMeta,
  type PageMenuKey,
} from "@/lib/prostor/modeli/page-document-model";
import { PageSideFacts } from "@/components/app/prostor/dokumenti/page-side-column";
import { SubpagesList } from "@/components/app/prostor/dokumenti/subpages-list";
import { useBeforeUnloadGuard, usePageAutosave } from "@/components/app/prostor/dokumenti/use-page-autosave";
import { useCuvarNapustanja } from "@/components/app/prostor/cuvar-napustanja";
import {
  useProjekatPaginatedQuery,
  useProjekatQueryTolerant,
} from "@/components/app/prostor/podaci/projekat";

export type PageDetails = FunctionReturnType<typeof api.prostor.pages.get>;

/** Podstranica po strani liste. */
const SUBPAGES_PAGE = 20;

/**
 * Radnje menija „…" koje ovaj prikaz već ume. Komentari, Istorija,
 * zaključavanje, Mapa i Diskusija dolaze sa svojim modulima (saradnja, mape,
 * poruke) i tada se dodaju ovde, uz svoju fioku ili prikaz.
 */
const RADNJE_MENIJA: ReadonlySet<PageMenuKey> = new Set(["move", "detach", "archive"]);

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
 * P13, P23; K07 §5.6). Izvori: `pages.get` (dozvole), `getBreadcrumbs`,
 * `projekat.listMembers` (imena), `areasV2.updatePage` kroz `usePageAutosave`
 * (650 ms, `expectedRevision`, konflikt „Učitaj najnoviju / Prepiši"),
 * `pages.listChildren` i `areasV2.archivePage` (Korpa + „Poništi").
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
  void profileId;
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
  const autosave = usePageAutosave({
    pageId,
    page,
    noteFileCount: noteFiles?.length ?? 0,
  });

  const titleRef = useRef<HTMLInputElement>(null);
  const subpagesHeadingId = useId();
  const [dismissedConflict, setDismissedConflict] = useState<string | null>(null);
  const [subpageCount, setSubpageCount] = useState<{ count: number; capped: boolean } | null>(null);

  const members = useMemo(() => membersResult ?? [], [membersResult]);
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

  const { archive, detach } = usePageDocumentActions({
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
    onJumpToComments: () => {},
    onOpenHistory: () => {},
    onSetLocked: () => {},
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

  // Prilozi u telu beleške: spisak iz `pageFiles.list`; pregled otvara fajl u
  // novoj kartici dok modul priloga ne donese svoj pregledač.
  const attachments = useMemo<NoteAttachmentsContextValue>(
    () => ({
      files: noteFiles,
      openFile: (fileId) => {
        const url = noteFiles?.find((file) => file._id === fileId)?.url;
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      },
    }),
    [noteFiles],
  );

  const body =
    page.kind === "note" ? (
      autosave.draftReady ? (
        <NoteAttachmentsContext.Provider value={attachments}>
          <RichTextEditor
            key={pageId}
            documentKey={pageId}
            content={autosave.content}
            editable={access.editable}
            onChange={({ html }) => autosave.editContent(html)}
          />
        </NoteAttachmentsContext.Provider>
      ) : (
        <Skeleton className="h-[42vh] rounded-lg sm:h-[52vh]" />
      )
    ) : (
      <EmptyState
        icon={page.kind === "table" ? FileSpreadsheet : Paperclip}
        headingAs="h2"
        title={page.kind === "table" ? "Prikaz tabele stiže uskoro." : "Prikaz fajlova stiže uskoro."}
        description="Naslov i podstranice možeš da menjaš već sada."
      />
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
        editors={[]}
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
        commentCount={null}
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
              // Zaključavanje dobija svoje dugme sa modulom saradnje.
              canLock: false,
              canUnlock: false,
              busy: false,
              onLock: () => {},
              onUnlock: () => {},
            }}
            now={liveNow}
          />
        }
        relations={null}
        comments={null}
        now={liveNow}
      />
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
