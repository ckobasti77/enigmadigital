"use client";

// Preneto iz Devotion apps/web/components/me/notes/notes-view.tsx (main @ c05c40f), SPAJANJE S16.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ChevronDown, LoaderCircle, Map as MapIcon, NotebookPen, Plus, RefreshCw, Search, X } from "lucide-react";
import {
  cleanNoteText,
  NOTE_SEARCH_LIMIT,
  NOTE_TEXT_MAX,
  notesCountLabel,
  notesEmptyText,
  noteScopeLabel,
  sameNoteFilter,
  type NoteEditPatch,
  type NoteFilter,
  type NoteRow as NoteRowModel,
} from "@/lib/prostor";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { formatNumber } from "@/lib/format";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";

import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { NoteRow, type NoteItemModel, type NoteStartup } from "@/components/app/prostor/ja/note-row";
import { NotesSkeleton } from "@/components/app/prostor/ja/notes-skeleton";

export type NotesListState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      rows: ReadonlyArray<NoteRowModel<NoteItemModel>>;
      canLoadMore: boolean;
      loadingMore: boolean;
      onLoadMore: () => void;
    };

export type NotesViewProps = {
  now: number;
  workspaces: ReadonlyArray<NoteStartup>;
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Pretraga je u toku (dovoljno znakova): lista je ravna, bez uvlačenja. */
  searching: boolean;
  list: NotesListState;
  expandedId: string | null;
  onToggle: (id: string) => void;
  /** Brzi unos: `workspaceId === null` = Lično. Greška (poruka) se prikazuje ispod polja. */
  onQuickAdd: (workspaceId: string | null, text: string) => Promise<void>;
  onSave: (note: NoteItemModel, patch: NoteEditPatch) => Promise<void>;
  onArchive: (note: NoteItemModel) => void;
  onSend: (note: NoteItemModel) => void;
  /** Mapa beleški izabranog projekta; odsutno kad filter nije jedan projekat. */
  onOpenMap?: () => void;
  /** Najava za čitač ekrana (npr. „Beleška je arhivirana."). */
  announcement?: string;
  /** Razvojni prikaz: početni tekst brzog unosa i greška. */
  initialQuickText?: string;
  initialQuickError?: string | null;
  listRef?: RefObject<HTMLDivElement | null>;
};

/** Čip filtera: izbor je neutralno istaknut (boja radnje nije stanje izbora). */
const chipClass = (active: boolean) =>
  cn(
    "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-ui font-medium transition-colors duration-(--duration-fast) ease-(--ease-ui) outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
    active
      ? "border-line-strong bg-surface-control-hover text-foreground"
      : "border-line bg-surface text-text-secondary hover:bg-surface-control hover:text-foreground",
  );

/**
 * Beleške u „Ja" (PROSTOR P7, K07 §5.10): moje misli iz svih projekata i lične
 * na jednom mestu — brzi unos, filter Sve · Lično · projekti, pretraga, redovi
 * koji se otvaraju u mestu i „Pošalji u projekat". Prezentacija: podaci i
 * radnje kroz props. Jedina primarna radnja ekrana je „Nova beleška" (vodi u
 * polje brze beleške).
 */
export function NotesView({
  now,
  workspaces,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  searching,
  list,
  expandedId,
  onToggle,
  onQuickAdd,
  onSave,
  onArchive,
  onSend,
  onOpenMap,
  announcement = "",
  initialQuickText,
  initialQuickError,
  listRef,
}: NotesViewProps) {
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  const quickRef = useRef<HTMLTextAreaElement>(null);
  const searchId = useId();
  const selectedStartup = filter.kind === "startup" ? workspaces.find((item) => item._id === filter.workspaceId) : undefined;
  const count = list.status === "ready" ? list.rows.length : null;
  const more = list.status === "ready" && (list.canLoadMore || list.loadingMore);
  const hasSearchText = search.trim().length > 0;

  return (
    <div className="flex w-full flex-col gap-5 pb-16">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <PageHeader
        variant="module"
        title="Beleške"
        description={
          count !== null && count > 0 && !searching
            ? `Moje misli iz svih projekata i lične · ${notesCountLabel(count, more)}`
            : "Moje misli iz svih projekata i lične."
        }
        actions={
          <>
            {onOpenMap ? (
              <Button type="button" variant="outline" onClick={onOpenMap}>
                <MapIcon aria-hidden="true" /> Mapa
              </Button>
            ) : null}
            <Button type="button" variant="primary" onClick={() => quickRef.current?.focus()}>
              <Plus aria-hidden="true" /> Nova beleška
            </Button>
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <QuickNote
          quickRef={quickRef}
          workspaces={workspaces}
          defaultStartupId={selectedStartup?._id ?? null}
          onSubmit={onQuickAdd}
          initialText={initialQuickText}
          initialError={initialQuickError}
        />

        <div className="space-y-2">
          <div role="group" aria-label="Filter beležaka" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-1">
            <FilterChip active={filter.kind === "all"} onClick={() => onFilterChange({ kind: "all" })}>
              Sve
            </FilterChip>
            <FilterChip
              active={filter.kind === "personal"}
              onClick={() => onFilterChange({ kind: "personal" })}
              leading={<StartupChip workspace={null} size="xs" />}
            >
              Lično
            </FilterChip>
            {workspaces.map((workspace) => (
              <FilterChip
                key={workspace._id}
                active={sameNoteFilter(filter, { kind: "startup", workspaceId: workspace._id })}
                onClick={() => onFilterChange({ kind: "startup", workspaceId: workspace._id })}
                leading={<StartupChip workspace={workspace} size="xs" />}
              >
                <span className="max-w-32 truncate">{workspace.name}</span>
              </FilterChip>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <label htmlFor={searchId} className="sr-only">
              Pretraži beleške
            </label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              id={searchId}
              type="search"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && hasSearchText) {
                  event.stopPropagation();
                  onSearchChange("");
                }
              }}
              placeholder="Pretraži beleške…"
              autoComplete="off"
              className="h-9 pl-8 pr-9 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {hasSearchText ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Obriši pretragu"
                onClick={() => onSearchChange("")}
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2 text-text-muted"
              >
                <X aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        <div ref={scopeRef}>
          {list.status === "loading" ? (
            <NotesSkeleton />
          ) : list.status === "error" ? (
            <EmptyState
              headingAs="h2"
              icon={RefreshCw}
              title="Beleške se ne mogu učitati."
              description="Proveri vezu i pokušaj ponovo."
              action={
                <Button type="button" variant="outline" onClick={list.retry}>
                  Pokušaj ponovo
                </Button>
              }
            />
          ) : list.rows.length === 0 ? (
            <EmptyNotes filter={filter} searching={searching} startupName={selectedStartup?.name ?? null} />
          ) : (
            <>
              <ul aria-label={searching ? "Rezultati pretrage" : "Beleške"} className="border-t border-line">
                {list.rows.map(({ note, depth }) => (
                  <NoteRow
                    key={note._id}
                    note={note}
                    depth={depth}
                    now={now}
                    expanded={expandedId === note._id}
                    canSend={workspaces.length > 0}
                    onToggle={() => onToggle(note._id)}
                    onSave={(patch) => onSave(note, patch)}
                    onArchive={() => onArchive(note)}
                    onSend={() => onSend(note)}
                  />
                ))}
              </ul>
              {searching && list.rows.length >= NOTE_SEARCH_LIMIT ? (
                <p role="status" className="mt-3 px-2 text-ui text-text-muted">
                  Prikazano je prvih {formatNumber(NOTE_SEARCH_LIMIT)} beležaka. Suzi pretragu.
                </p>
              ) : null}
              {more ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={list.loadingMore}
                  onClick={list.onLoadMore}
                >
                  {list.loadingMore ? "Učitavam…" : "Učitaj još"}
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyNotes({
  filter,
  searching,
  startupName,
}: {
  filter: NoteFilter;
  searching: boolean;
  startupName: string | null;
}) {
  const copy = notesEmptyText(filter, { searching, startupName });
  return <EmptyState headingAs="h2" icon={NotebookPen} title={copy.title} description={copy.description ?? undefined} />;
}

function FilterChip({
  active,
  onClick,
  leading,
  children,
}: {
  active: boolean;
  onClick: () => void;
  leading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={chipClass(active)}>
      {leading}
      {children}
    </button>
  );
}

/**
 * Brzi unos: Enter čuva, Shift+Enter je novi red. Odredište je izabrani
 * projekat (ili Lično) i može da se promeni u meniju uz polje; promena filtera
 * vraća podrazumevano odredište.
 */
function QuickNote({
  quickRef,
  workspaces,
  defaultStartupId,
  onSubmit,
  initialText = "",
  initialError = null,
}: {
  quickRef: RefObject<HTMLTextAreaElement | null>;
  workspaces: ReadonlyArray<NoteStartup>;
  defaultStartupId: string | null;
  onSubmit: (workspaceId: string | null, text: string) => Promise<void>;
  initialText?: string;
  initialError?: string | null;
}) {
  const [text, setText] = useState(initialText);
  const [target, setTarget] = useState<string | null>(defaultStartupId);
  // Promena filtera vraća podrazumevano odredište, a ukucan tekst ostaje.
  const [seenDefault, setSeenDefault] = useState(defaultStartupId);
  if (seenDefault !== defaultStartupId) {
    setSeenDefault(defaultStartupId);
    setTarget(defaultStartupId);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const errorId = useId();
  const check = cleanNoteText(text);
  const targetStartup = target === null ? undefined : workspaces.find((item) => item._id === target);
  // Projekat koji je u međuvremenu nestao iz liste vraća unos na Lično.
  const effectiveTarget = targetStartup ? target : null;
  const shownError = error ?? (check.ok ? null : check.reason);
  const scope = noteScopeLabel({ workspace: targetStartup ?? null });

  const submit = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(effectiveTarget, check.text);
      setText("");
      quickRef.current?.focus();
    } catch (cause) {
      setError(accessErrorMessage(cause, "Beleška nije sačuvana. Pokušaj ponovo."));
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-2 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring">
      <Textarea
        ref={quickRef}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onKeyDown={onKeyDown}
        maxLength={NOTE_TEXT_MAX + 1}
        placeholder="Brza beleška…"
        aria-label="Brza beleška"
        aria-invalid={shownError ? true : undefined}
        aria-describedby={shownError ? errorId : undefined}
        className="max-h-48 min-h-10 resize-none border-0 bg-transparent px-2 py-2 text-copy shadow-none focus-visible:ring-0 md:text-ui"
      />
      {shownError ? (
        <p id={errorId} role="alert" className="px-2 pb-1 text-ui text-danger">
          {shownError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Čuva se u: ${scope}`}
                  className="min-w-0 text-text-secondary hover:text-foreground"
                />
              }
            >
              <StartupChip workspace={targetStartup ?? null} size="xs" />
              <span className="max-w-40 truncate">{scope}</span>
              <ChevronDown aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup
                value={effectiveTarget ?? "personal"}
                onValueChange={(value: string) => setTarget(value === "personal" ? null : value)}
              >
                <DropdownMenuRadioItem value="personal">
                  <StartupChip workspace={null} size="xs" /> Lično
                </DropdownMenuRadioItem>
                {workspaces.map((workspace) => (
                  <DropdownMenuRadioItem key={workspace._id} value={workspace._id}>
                    <StartupChip workspace={workspace} size="xs" />
                    <span className="max-w-48 truncate">{workspace.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="hidden text-meta text-text-muted sm:block">Enter čuva · Shift + Enter nov red</p>
        </div>
        <Button type="button" variant="secondary" size="sm" disabled={!check.ok || busy} onClick={() => void submit()}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Sačuvaj
        </Button>
      </div>
    </div>
  );
}
