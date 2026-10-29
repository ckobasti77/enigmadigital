"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-documents.tsx (main @ c05c40f), SPAJANJE S10.
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight, FileText, LoaderCircle, Lock, Plus } from "lucide-react";
import { formatEditTime } from "@/lib/prostor";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { PAGE_KIND_KEYS, PAGE_KIND_META, pageKindMeta, type PageKind } from "@/lib/prostor/web/vrste-stranica";
import { cn } from "@/lib/utils";

import type { DocumentPage, DocumentTreeRow } from "@/lib/prostor/modeli/area-model";

/** Red Dokumenata: stranica + ime poslednjeg urednika (iz spiska članova). */
export type DocumentRowPage = DocumentPage & { editorName: string | null };

export type AreaDocumentsState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | { status: "ready"; rows: ReadonlyArray<DocumentTreeRow<DocumentRowPage>> };

/** Prevlačenje reda na red = ugnežđavanje (P4); `null` kad gledalac ne sme da pomera. */
export type DocumentsDrag = {
  draggedId: string | null;
  overId: string | null;
  canDrag: (page: DocumentRowPage) => boolean;
  /** Sme li `draggedId` da padne na ovaj red (nije on sam ni njegov potomak). */
  canDropOn: (targetId: string) => boolean;
  onDragStart: (pageId: string) => void;
  onDragOver: (targetId: string | null) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
};

export type AreaDocumentsBodyProps = {
  now: number;
  kindFilter: PageKind | null;
  onKindFilterChange: (kind: PageKind | null) => void;
  state: AreaDocumentsState;
  onOpen: (pageId: string) => void;
  onToggle: (pageId: string, expanded: boolean) => void;
  onLoadMore: (parentId: string | null) => void;
  onRetryLevel: (parentId: string | null) => void;
  onCreate: () => void;
  /** Meni „…" reda (kontejner zna mutacije); izlog daje statičan meni. */
  renderActions: (page: DocumentRowPage) => ReactNode;
  drag: DocumentsDrag | null;
};

/** Uvlačenje po nivou stabla (kolona Naslov): uže na telefonu, gde je red i meta. */
const INDENT_CLASS = "[--indent:0.75rem] md:[--indent:1.25rem]";

/**
 * Dokumenti oblasti — prezentacija (PROSTOR P12, K07 §5.5): stablo stranica kao
 * tabela Naslov · Vrsta · Poslednja izmena · Ko (od `md`), a ispod `md` redovi
 * sa meta redom. Filter vrste važi za vrh oblasti (podstranice se ne filtriraju,
 * kao na telefonu). Enter otvara, strelice desno/levo razvijaju i skupljaju granu.
 */
export function AreaDocumentsBody({
  now,
  kindFilter,
  onKindFilterChange,
  state,
  onOpen,
  onToggle,
  onLoadMore,
  onRetryLevel,
  onCreate,
  renderActions,
  drag,
}: AreaDocumentsBodyProps) {
  const emptyRoot = state.status === "ready" && state.rows.length === 0;
  // Razvijanje strelicama na naslovu se najavljuje (strelica nosi `aria-expanded`, naslov ne).
  const [announcement, setAnnouncement] = useState("");
  const toggleFromKeyboard = (pageId: string, open: boolean, title: string) => {
    onToggle(pageId, open);
    setAnnouncement(`${open ? "Razvijeno" : "Skupljeno"}: „${title}”`);
  };

  return (
    <div>
      {/* „Nova stranica" je u zaglavlju oblasti (jedna primarna radnja po ekranu). */}
      <div className="mb-4">
        <KindChips value={kindFilter} onChange={onKindFilterChange} />
      </div>
      {state.status === "loading" ? (
        <div role="status" aria-label="Učitavanje dokumenata" className="space-y-1">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-14 w-full rounded-lg xl:h-10" />
          ))}
        </div>
      ) : state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 px-2 py-2 text-sm">
          <p className="text-muted-foreground">Dokumenti nisu učitani.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      ) : emptyRoot ? (
        kindFilter === null ? (
          <EmptyState
            icon={FileText}
            headingAs="h2"
            title="Oblast još nema stranica."
            description="Dodaj prvu stranicu da bi se ovde pojavio spisak."
            action={
              <Button variant="secondary" onClick={onCreate}>
                <Plus aria-hidden="true" /> Nova stranica
              </Button>
            }
          />
        ) : (
          <EmptyState
            size="section"
            title="Nema rezultata za ovaj filter."
            action={
              <Button variant="outline" size="sm" onClick={() => onKindFilterChange(null)}>
                Poništi filter
              </Button>
            }
          />
        )
      ) : (
        <div role="table" aria-label="Dokumenti oblasti">
          <div role="rowgroup" className="max-xl:sr-only">
            <div
              role="row"
              className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 border-b border-line px-2 pb-1.5 text-xs font-medium text-muted-foreground xl:grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_9rem_2.5rem]"
            >
              <span role="columnheader">Naslov</span>
              <span role="columnheader" className="max-xl:hidden">
                Vrsta
              </span>
              <span role="columnheader" className="max-xl:hidden">
                Poslednja izmena
              </span>
              <span role="columnheader" className="max-xl:hidden">
                Ko
              </span>
              <span role="columnheader">
                <span className="sr-only">Radnje</span>
              </span>
            </div>
          </div>
          <div role="rowgroup" className="mt-1 space-y-0.5">
            {state.rows.map((row) =>
              row.type === "page" ? (
                <DocumentRow
                  key={row.key}
                  row={row}
                  now={now}
                  onOpen={onOpen}
                  onToggle={onToggle}
                  onKeyboardToggle={toggleFromKeyboard}
                  actions={renderActions(row.page)}
                  drag={drag}
                />
              ) : (
                <LevelRow
                  key={row.key}
                  row={row}
                  onLoadMore={onLoadMore}
                  onRetryLevel={onRetryLevel}
                />
              ),
            )}
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** Naslovi redova u istoj tabeli, redom (strelice gore/dole kroz stablo). */
function treeTitles(from: HTMLElement): HTMLButtonElement[] {
  const table = from.closest('[role="table"]');
  return table ? Array.from(table.querySelectorAll<HTMLButtonElement>("button[data-doc-title]")) : [];
}

function DocumentRow({
  row,
  now,
  onOpen,
  onToggle,
  onKeyboardToggle,
  actions,
  drag,
}: {
  row: Extract<DocumentTreeRow<DocumentRowPage>, { type: "page" }>;
  now: number;
  onOpen: (pageId: string) => void;
  onToggle: (pageId: string, expanded: boolean) => void;
  onKeyboardToggle: (pageId: string, expanded: boolean, title: string) => void;
  actions: ReactNode;
  drag: DocumentsDrag | null;
}) {
  const { page, depth, expandable, expanded } = row;
  const meta = pageKindMeta(page.kind);
  const Icon = meta.icon;
  const title = page.title.trim() || "Bez naslova";
  const locked = page.lockedAt !== null && page.lockedAt !== undefined;
  const edited = formatEditTime(page.updatedAt, now);
  const editor = page.editorName?.trim() || "Član tima";
  const draggable = drag !== null && drag.canDrag(page);
  const isDropTarget = drag !== null && drag.overId === page._id;
  const isDragged = drag !== null && drag.draggedId === page._id;
  // Brojač ulaska u red: dragleave se okida i pri prelazu na dete reda.
  const enterDepth = useRef(0);

  // Stablo tastaturom (K07 §5.5): Enter otvara, desno/levo razvija i skuplja
  // (levo na podstranici vodi na roditelja), gore/dole idu kroz naslove redova.
  function onTitleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" && expandable && !expanded) {
      event.preventDefault();
      onKeyboardToggle(page._id, true, title);
    } else if (event.key === "ArrowLeft" && expanded) {
      event.preventDefault();
      onKeyboardToggle(page._id, false, title);
    } else if (event.key === "ArrowLeft" && page.parentPageId !== null) {
      const parent = treeTitles(event.currentTarget).find((item) => item.dataset.docTitle === page.parentPageId);
      if (parent) {
        event.preventDefault();
        parent.focus();
      }
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const titles = treeTitles(event.currentTarget);
      const next = titles[titles.indexOf(event.currentTarget) + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  }

  const dropHandlers =
    drag !== null && drag.draggedId !== null && drag.canDropOn(page._id)
      ? {
          onDragEnter: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            enterDepth.current += 1;
            drag.onDragOver(page._id);
          },
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          },
          onDragLeave: () => {
            enterDepth.current = Math.max(0, enterDepth.current - 1);
            if (enterDepth.current === 0 && drag.overId === page._id) drag.onDragOver(null);
          },
          onDrop: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            enterDepth.current = 0;
            drag.onDrop(page._id);
          },
        }
      : {};

  return (
    <div
      role="row"
      aria-level={depth + 1}
      data-page-id={page._id}
      // Prevlači se ceo red (dugme kao izvor prevlačenja ne radi u svim pregledačima).
      draggable={draggable}
      onDragStart={
        draggable
          ? (event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", page._id);
              drag?.onDragStart(page._id);
            }
          : undefined
      }
      onDragEnd={draggable ? () => drag?.onDragEnd() : undefined}
      {...dropHandlers}
      className={cn(
        "group/row relative grid grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-3 rounded-lg px-2 transition-colors hover:bg-surface-control-hover xl:grid-cols-[minmax(0,1fr)_6.5rem_8.5rem_9rem_2.5rem]",
        isDropTarget && "bg-surface-control-hover outline-dashed outline-1 outline-line-strong hover:bg-surface-control-hover",
        isDragged && "text-text-muted",
      )}
    >
      <div
        role="cell"
        className={cn("flex min-w-0 items-center", INDENT_CLASS)}
        style={{ paddingLeft: `calc(var(--indent) * ${depth})` }}
      >
        {expandable ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "Skupi" : "Razvij"} „${title}”`}
            onClick={() => onToggle(page._id, !expanded)}
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} aria-hidden="true" />
          </button>
        ) : (
          <span className="size-7 shrink-0" aria-hidden="true" />
        )}
        <button
          type="button"
          data-doc-title={page._id}
          aria-keyshortcuts={expandable ? "ArrowRight ArrowLeft ArrowUp ArrowDown" : "ArrowUp ArrowDown"}
          onClick={() => onOpen(page._id)}
          onKeyDown={onTitleKeyDown}
          className="flex min-h-10 min-w-0 flex-1 flex-col justify-center gap-0.5 rounded-md py-1.5 pl-1 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring xl:flex-row xl:items-center xl:justify-start xl:gap-2"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate text-sm font-medium">{title}</span>
            {locked ? <Lock className="size-3.5 shrink-0 text-muted-foreground" aria-label="Zaključano" /> : null}
          </span>
          {/* Ispod `md` kolone postaju meta red. */}
          <span className="truncate pl-6 text-xs text-muted-foreground xl:hidden">
            {meta.label} · {editor} · {edited}
          </span>
        </button>
        {isDropTarget ? (
          <span className="pointer-events-none ml-2 hidden shrink-0 text-meta font-medium text-foreground sm:inline">
            Pusti da ugnezdiš
          </span>
        ) : null}
      </div>
      <div role="cell" className="truncate text-xs text-muted-foreground max-xl:hidden">
        {meta.label}
      </div>
      <div role="cell" className="truncate text-xs tabular-nums text-muted-foreground max-xl:hidden">
        {edited}
      </div>
      <div role="cell" className="truncate text-xs text-muted-foreground max-xl:hidden">
        {editor}
      </div>
      <div role="cell" className="flex justify-end">
        {actions}
      </div>
    </div>
  );
}

function LevelRow({
  row,
  onLoadMore,
  onRetryLevel,
}: {
  row: Exclude<DocumentTreeRow<DocumentRowPage>, { type: "page" }>;
  onLoadMore: (parentId: string | null) => void;
  onRetryLevel: (parentId: string | null) => void;
}) {
  const indent = { paddingLeft: `calc(var(--indent) * ${row.depth} + 2.25rem)` };
  return (
    <div role="row" className="flex min-h-10 items-center px-2">
      <div
        role="cell"
        className={cn("flex min-w-0 flex-1 items-center gap-3 text-sm text-muted-foreground", INDENT_CLASS)}
        style={indent}
      >
        {row.type === "loading" ? (
          <span role="status" className="inline-flex items-center gap-2 text-xs">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            Učitavam…
          </span>
        ) : row.type === "error" ? (
          <>
            <span className="text-xs">Podstranice nisu učitane.</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onRetryLevel(row.parentId)}>
              Pokušaj ponovo
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onLoadMore(row.parentId)}>
            Učitaj još
          </Button>
        )}
      </div>
    </div>
  );
}

const KIND_OPTIONS: ReadonlyArray<{ value: PageKind | null; label: string }> = [
  { value: null, label: "Sve" },
  ...PAGE_KIND_KEYS.map((kind) => ({ value: kind, label: PAGE_KIND_META[kind].label })),
];

/** Filter vrste — radio grupa (jedan Tab stop, strelice biraju). */
function KindChips({ value, onChange }: { value: PageKind | null; onChange: (value: PageKind | null) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = Math.max(
    0,
    KIND_OPTIONS.findIndex((option) => option.value === value),
  );
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = KIND_OPTIONS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % KIND_OPTIONS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + KIND_OPTIONS.length) % KIND_OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(KIND_OPTIONS[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Vrsta (vrh oblasti)" className="flex flex-wrap items-center gap-1">
      {KIND_OPTIONS.map((option, index) => {
        const checked = index === checkedIndex;
        const Icon = option.value ? PAGE_KIND_META[option.value].icon : null;
        return (
          <button
            key={option.value ?? "sve"}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm text-muted-foreground transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              checked ? "border-line bg-surface-control-hover font-medium text-foreground" : "border-transparent",
            )}
          >
            {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
