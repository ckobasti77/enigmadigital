"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-documents-container.tsx (main @ c05c40f), SPAJANJE S10.
import { useMemo, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { FolderInput, MoreHorizontal, SquareArrowOutUpRight, Trash2, Unlink } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoveToAreaMenu } from "@/components/app/prostor/dokumenti/move-to-area-menu";
import { trashedMessage } from "@/lib/prostor/modeli/page-document-model";
import { canDragPage } from "@/lib/prostor/modeli/page-tree-model";
import type { StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { pageKindMeta, type PageKind } from "@/lib/prostor/web/vrste-stranica";

import {
  flattenDocumentTree,
  isLoadedDescendant,
  nestedMessage,
  nestingCandidates,
  ROOT_LEVEL,
  type DocumentLevel,
  type DocumentPage,
} from "@/lib/prostor/modeli/area-model";
import { AreaDocumentsBody, type AreaDocumentsState, type DocumentRowPage } from "@/components/app/prostor/dokumenti/area-documents";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatQueries, type ZahtevProjekta } from "@/components/app/prostor/podaci/projekat";

/** Stranica po nivou stabla (raste sa „Učitaj još"). */
const LEVEL_PAGE = 20;
/** `pages.childCounts` prima najviše 50 roditelja po pozivu. */
const CHILD_COUNT_CHUNK = 50;

type ChildrenResult = FunctionReturnType<typeof api.prostor.pages.listChildren>;
type CountsResult = FunctionReturnType<typeof api.prostor.pages.childCounts>;

/**
 * Dokumenti oblasti — kontejner (PROSTOR P12, P4; K07 §5.5). Svaki nivo stabla
 * je `pages.listChildren` (lenjo, tek kad se grana razvije), a da li red ima
 * decu kaže `pages.childCounts`. Premeštanje i ugnežđavanje su odmah
 * (`areasV2.movePage`, „Poništi"), brisanje ide u Korpu (`trash.restore`).
 */
export function AreaDocumentsContainer({
  workspace,
  profileId,
  canManage,
  areaId,
  memberName,
  now,
  onOpenPage,
  onCreate,
}: {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  canManage: boolean;
  areaId: Id<"areas">;
  memberName: (profileId: string | null) => string | null;
  now: number;
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreate: (kind?: PageKind) => void;
}) {
  const [kindFilter, setKindFilter] = useState<PageKind | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [limits, setLimits] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const movePage = useProjekatMutation(api.prostor.areasV2.movePage);
  const detachPage = useProjekatMutation(api.prostor.areasV2.detachPage);
  const archivePage = useProjekatMutation(api.prostor.areasV2.archivePage);
  const restoreFromTrash = useProjekatMutation(api.prostor.trash.restore);

  // Nivoi: koren (sa filterom vrste) + svaka razvijena stranica.
  const levelSpecs = useMemo(() => {
    const specs: Array<{ key: string; parentPageId: string | null; numItems: number }> = [
      { key: ROOT_LEVEL, parentPageId: null, numItems: limits.get(ROOT_LEVEL) ?? LEVEL_PAGE },
    ];
    for (const id of [...expanded].sort()) {
      specs.push({ key: id, parentPageId: id, numItems: limits.get(id) ?? LEVEL_PAGE });
    }
    return specs;
  }, [expanded, limits]);
  const levelKey = JSON.stringify([levelSpecs, kindFilter]);
  const levelRequests = useMemo(() => {
    const requests: Record<string, ZahtevProjekta> = {};
    for (const spec of levelSpecs) {
      requests[spec.key] = {
        query: api.prostor.pages.listChildren,
        args: {
          areaId,
          parentPageId: spec.parentPageId,
          ...(spec.parentPageId === null && kindFilter !== null ? { kind: kindFilter } : {}),
          paginationOpts: { numItems: spec.numItems, cursor: null },
        },
      };
    }
    return requests;
    // `levelKey` vrednosno pokriva specifikacije i filter (api.x.y je Proxy, ne ide u zavisnosti).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelKey, areaId]);
  // Nove granice („Učitaj još", filter) su nove pretplate: do odgovora važi poslednji
  // spreman nivo, da tabela ne padne u skeleton i fokus ne nestane.
  const levelResults = useLastReadyRecord(
    useProjekatQueries(levelRequests) as Record<string, ChildrenResult | Error | undefined>,
  );

  const levels = useMemo(() => {
    const map = new Map<string, DocumentLevel>();
    for (const spec of levelSpecs) {
      const result = levelResults[spec.key];
      if (result === undefined) map.set(spec.key, { status: "loading" });
      else if (result instanceof Error) map.set(spec.key, { status: "error" });
      else map.set(spec.key, { status: "ready", pages: result.page, hasMore: !result.isDone });
    }
    return map;
  }, [levelResults, levelSpecs]);

  // Ima li red decu: `pages.childCounts` za učitane stranice, po 50.
  const loadedIds = useMemo(() => {
    const ids: string[] = [];
    for (const level of levels.values()) {
      if (level.status === "ready") for (const page of level.pages) ids.push(page._id);
    }
    return ids.sort();
  }, [levels]);
  const countsKey = loadedIds.join(",");
  const countRequests = useMemo(() => {
    const requests: Record<string, ZahtevProjekta> = {};
    for (let start = 0; start < loadedIds.length; start += CHILD_COUNT_CHUNK) {
      requests[`counts:${start}`] = {
        query: api.prostor.pages.childCounts,
        args: { areaId, parentPageIds: loadedIds.slice(start, start + CHILD_COUNT_CHUNK) },
      };
    }
    return requests;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsKey, areaId]);
  const countResults = useLastReadyRecord(
    useProjekatQueries(countRequests) as Record<string, CountsResult | Error | undefined>,
  );
  const childCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const result of Object.values(countResults)) {
      if (result === undefined || result instanceof Error) continue;
      for (const entry of result) map.set(entry.pageId, entry.count);
    }
    return map;
  }, [countResults]);

  const rows = useMemo(
    () =>
      flattenDocumentTree<DocumentRowPage>({
        levels: new Map(
          [...levels].map(([key, level]) => [
            key,
            level.status === "ready"
              ? {
                  ...level,
                  pages: level.pages.map((page) => ({ ...page, editorName: memberName(page.updatedByProfileId) })),
                }
              : level,
          ]),
        ),
        expanded,
        childCounts,
      }),
    [levels, expanded, childCounts, memberName],
  );

  // Greška upita se ne popravlja sama: ponovni pokušaj nivoa traži jednu stavku
  // više (nove argumente = nova pretplata), bez gubitka razvijenih grana i filtera.
  function retryLevel(parentId: string | null) {
    const key = parentId ?? ROOT_LEVEL;
    setLimits((current) => new Map(current).set(key, (current.get(key) ?? LEVEL_PAGE) + 1));
  }

  const root = levels.get(ROOT_LEVEL);
  const state: AreaDocumentsState =
    root?.status === "error"
      ? { status: "error", onRetry: () => retryLevel(null) }
      : root === undefined || root.status === "loading"
        ? { status: "loading" }
        : { status: "ready", rows };

  const viewer = { profileId, canManage };
  const canMove = (page: DocumentPage) => canDragPage(page, viewer);
  const pageTitle = (id: string) => {
    for (const row of rows) if (row.type === "page" && row.page._id === id) return row.page.title;
    return "";
  };
  const pageById = (id: string) => {
    for (const row of rows) if (row.type === "page" && row.page._id === id) return row.page;
    return null;
  };

  function toggle(pageId: string, open: boolean) {
    setExpanded((current) => {
      const next = new Set(current);
      if (open) next.add(pageId);
      else next.delete(pageId);
      return next;
    });
  }

  function loadMore(parentId: string | null) {
    const key = parentId ?? ROOT_LEVEL;
    setLimits((current) => new Map(current).set(key, (current.get(key) ?? LEVEL_PAGE) + LEVEL_PAGE));
  }

  async function nest(childId: string, targetId: string) {
    const child = pageById(childId);
    if (!child || childId === targetId || child.parentPageId === targetId) return;
    const previousParent = (child.parentPageId ?? null) as Id<"pages"> | null;
    try {
      await movePage({
        pageId: childId as Id<"pages">,
        targetAreaId: areaId,
        targetParentPageId: targetId as Id<"pages">,
      });
      toggle(targetId, true);
      toast.success(nestedMessage(child.title, pageTitle(targetId)), {
        action: {
          label: "Poništi",
          onClick: () =>
            void movePage({
              pageId: childId as Id<"pages">,
              targetAreaId: areaId,
              targetParentPageId: previousParent,
            }).catch((error: unknown) => toast.error(accessErrorMessage(error, "Premeštanje nije poništeno."))),
        },
      });
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije ugnežđena."));
    }
  }

  async function detach(page: DocumentRowPage) {
    const previousParent = page.parentPageId as Id<"pages"> | null;
    try {
      const result = await detachPage({ pageId: page._id as Id<"pages"> });
      if (result.status !== "detached") throw new Error("Stranica više nije ugnežđena.");
      toast.success("Stranica je odvojena i premeštena na vrh oblasti.", {
        action: {
          label: "Poništi",
          onClick: () =>
            void movePage({
              pageId: page._id as Id<"pages">,
              targetAreaId: areaId,
              targetParentPageId: previousParent,
            }).catch((error: unknown) => toast.error(accessErrorMessage(error, "Odvajanje nije poništeno."))),
        },
      });
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije odvojena."));
    }
  }

  async function archive(page: DocumentRowPage) {
    const pageId = page._id as Id<"pages">;
    try {
      await archivePage({ pageId });
      toast.success(trashedMessage(page.title), {
        action: {
          label: "Poništi",
          onClick: () =>
            void restoreFromTrash({ target: { kind: "page", id: pageId } }).catch((error: unknown) =>
              toast.error(accessErrorMessage(error, "Stranica nije vraćena.")),
            ),
        },
      });
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije obrisana."));
    }
  }

  return (
    <AreaDocumentsBody
      now={now}
      kindFilter={kindFilter}
      onKindFilterChange={setKindFilter}
      state={state}
      onOpen={(id) => onOpenPage(id as Id<"pages">)}
      onToggle={toggle}
      onLoadMore={loadMore}
      onRetryLevel={retryLevel}
      onCreate={() => onCreate()}
      renderActions={(page) => (
        <DocumentActions
          page={page}
          canMove={canMove(page)}
          candidates={canMove(page) ? nestingCandidates(page, rows) : []}
          areaId={areaId}
          areas={workspace.areas}
          onOpen={() => onOpenPage(page._id as Id<"pages">)}
          onNest={(targetId) => void nest(page._id, targetId)}
          onDetach={() => void detach(page)}
          onArchive={() => void archive(page)}
        />
      )}
      drag={{
        draggedId,
        overId,
        canDrag: canMove,
        canDropOn: (targetId) =>
          draggedId !== null &&
          targetId !== draggedId &&
          !isLoadedDescendant(rows, draggedId, targetId) &&
          pageById(draggedId)?.parentPageId !== targetId,
        onDragStart: setDraggedId,
        onDragOver: setOverId,
        onDragEnd: () => {
          setDraggedId(null);
          setOverId(null);
        },
        onDrop: (targetId) => {
          const childId = draggedId;
          setDraggedId(null);
          setOverId(null);
          if (childId) void nest(childId, targetId);
        },
      }}
    />
  );
}

/**
 * Poslednji spreman rezultat po ključu: kad ključ dobije nove argumente,
 * `useQueries` vraća `undefined` dok odgovor ne stigne — tada važi prethodni.
 * Greška zamenjuje stari rezultat (mora da se vidi).
 */
function useLastReadyRecord<T>(record: Record<string, T | Error | undefined>): Record<string, T | Error | undefined> {
  const [last, setLast] = useState<Record<string, T | Error | undefined>>(record);
  let changed = false;
  const next = { ...last };
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined && value !== last[key]) {
      next[key] = value;
      changed = true;
    }
  }
  if (changed) setLast(next);
  const merged: Record<string, T | Error | undefined> = {};
  for (const [key, value] of Object.entries(record)) merged[key] = value ?? last[key];
  return merged;
}

/** Meni „…" reda Dokumenata (K07 §5.5): Otvori · Premesti u oblast · Ugnezdi u… · Odvoji · Obriši. */
function DocumentActions({
  page,
  canMove,
  candidates,
  areaId,
  areas,
  onOpen,
  onNest,
  onDetach,
  onArchive,
}: {
  page: DocumentRowPage;
  canMove: boolean;
  candidates: ReadonlyArray<DocumentRowPage>;
  areaId: Id<"areas">;
  areas: ReadonlyArray<{ _id: Id<"areas">; label: string }>;
  onOpen: () => void;
  onNest: (targetId: string) => void;
  onDetach: () => void;
  onArchive: () => void;
}) {
  const title = page.title.trim() || "Bez naslova";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-text-secondary"
            aria-label={`Radnje: „${title}”`}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onOpen}>
          <SquareArrowOutUpRight aria-hidden="true" />
          Otvori
        </DropdownMenuItem>
        {canMove && areas.length > 1 ? (
          <MoveToAreaMenu
            asSubmenu
            pageId={page._id as Id<"pages">}
            pageTitle={page.title}
            currentAreaId={areaId}
            areas={[...areas]}
          />
        ) : null}
        {canMove && candidates.length > 0 ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput aria-hidden="true" />
              Ugnezdi u…
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 w-60 overflow-y-auto">
              {candidates.map((candidate) => {
                const Icon = pageKindMeta(candidate.kind).icon;
                return (
                  <DropdownMenuItem key={candidate._id} onClick={() => onNest(candidate._id)}>
                    <Icon className="text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{candidate.title.trim() || "Bez naslova"}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {canMove && page.parentPageId !== null ? (
          <DropdownMenuItem onClick={onDetach}>
            <Unlink aria-hidden="true" />
            Odvoji na vrh oblasti
          </DropdownMenuItem>
        ) : null}
        {canMove ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onArchive}>
              <Trash2 aria-hidden="true" />
              Obriši
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
