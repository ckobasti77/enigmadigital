"use client";

// Preneto iz Devotion apps/web/components/me/notes/note-row.tsx (main @ c05c40f), SPAJANJE S16.
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Archive, ChevronRight, LoaderCircle, MoreHorizontal, Send } from "lucide-react";
import {
  NOTE_TEXT_MAX,
  NOTE_TITLE_MAX,
  noteDisplayTitle,
  noteEditPatch,
  noteMetaLabel,
  notePreview,
  noteScopeLabel,
  type NoteEditPatch,
  type NoteNode,
} from "@/lib/prostor/notes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";

import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";

/** Projekat beleške; `boja` je identitet projekta (znak). */
export type NoteStartup = { _id: string; name: string; logoUrl: string | null; boja?: string | null };

/** Beleška onoliko koliko je prikaz čita (`thoughts.listMine` / `searchMine`). */
export type NoteItemModel = NoteNode & {
  workspace: NoteStartup | null;
  /** Pogodak pretrage: tekst je isečak, starosti nema — izmena tek posle punog učitavanja. */
  snippet?: boolean;
  /** Stanje punog učitavanja pogotka koji je otvoren za izmenu. */
  detail?: "loading" | "missing";
};

/** Uvlačenje podbeleške po nivou (K07 §5.10). */
const INDENT_PX = 16;

export type NoteRowProps = {
  note: NoteItemModel;
  depth: number;
  now: number;
  expanded: boolean;
  /** Postoji bar jedan projekat kome se može poslati ideja. */
  canSend: boolean;
  onToggle: () => void;
  /** Čuva promenjena polja; greška (poruka) se prikazuje u uređivaču. */
  onSave: (patch: NoteEditPatch) => Promise<void>;
  onArchive: () => void;
  onSend: () => void;
};

/**
 * Red Beleški: naslov, isečak, čip projekta ili „Lično" i starost. Klik otvara
 * red u mestu (naslov + tekst), izmena se čuva kad fokus izađe iz uređivača.
 * „Pošalji u projekat" i meni „…" su susedna dugmad (ne unutar dugmeta reda).
 * Radnje reda se vide na prelaz ili fokus, a na dodir uvek.
 */
export function NoteRow({ note, depth, now, expanded, canSend, onToggle, onSave, onArchive, onSend }: NoteRowProps) {
  const editorId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const title = noteDisplayTitle(note);
  const preview = notePreview(note);
  const scopeLabel = noteScopeLabel(note);
  const meta = note.snippet ? scopeLabel : noteMetaLabel(note, now);

  return (
    <li data-note-id={note._id} className="border-b border-line">
      <div className="group flex items-start gap-1" style={{ paddingLeft: depth * INDENT_PX }}>
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? editorId : undefined}
          aria-label={`${title.replace(/[.!?…]+$/u, "")}. ${meta}`}
          onClick={onToggle}
          className="flex min-h-12 min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-14"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none",
              expanded && "rotate-90",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ui font-medium text-foreground">{title}</span>
            {preview && !expanded ? (
              <span className="mt-0.5 block truncate text-ui text-text-secondary">{preview}</span>
            ) : null}
            <span className="mt-1 flex items-center gap-1.5 text-meta text-text-muted">
              <StartupChip workspace={note.workspace} size="xs" />
              <span className="truncate">{meta}</span>
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 pt-1.5">
          {canSend ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onSend}
              aria-label={`Pošalji u projekat: ${title}`}
              className="text-text-secondary transition-opacity hover:text-foreground focus-visible:opacity-100 pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
            >
              <Send aria-hidden="true" />
              <span className="hidden sm:inline">Pošalji u projekat</span>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Radnje za belešku: ${title}`}
                  className="text-text-secondary"
                />
              }
            >
              <MoreHorizontal aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onToggle}>{expanded ? "Zatvori" : "Izmeni"}</DropdownMenuItem>
              {canSend ? (
                <DropdownMenuItem onClick={onSend}>
                  <Send aria-hidden="true" /> Pošalji u projekat
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onArchive}>
                <Archive aria-hidden="true" /> Arhiviraj
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {expanded ? (
        <div id={editorId} style={{ paddingLeft: depth * INDENT_PX + 28 }} className="pb-3 pr-2">
          {note.detail === "missing" ? (
            <p role="alert" className="py-2 text-ui text-danger">
              Beleška više nije dostupna.
            </p>
          ) : note.snippet ? (
            <p role="status" className="flex items-center gap-2 py-2 text-ui text-text-muted">
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Učitavam belešku…
            </p>
          ) : (
            <NoteEditor
              key={note._id}
              note={note}
              onSave={onSave}
              onClose={() => {
                onToggle();
                // Uređivač nestaje zajedno sa fokusom: vraća se na red.
                window.requestAnimationFrame(() => toggleRef.current?.focus());
              }}
            />
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Uređivač u mestu. Šalju se samo promenjena polja (`noteEditPatch`); prazan
 * naslov ili tekst daju poruku umesto tihog vraćanja. Čuva se kad fokus izađe
 * iz celog uređivača, na „Gotovo" i na Esc.
 */
function NoteEditor({
  note,
  onSave,
  onClose,
}: {
  note: NoteItemModel;
  onSave: (patch: NoteEditPatch) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(note.title ?? "");
  const [text, setText] = useState(note.text);
  // Osnova za poređenje je stanje pri otvaranju (i posle poslednjeg čuvanja), ne živ `note`:
  // izmena sa drugog uređaja se ne prepisuje poljem koje nisam dirao.
  const [base, setBase] = useState({ title: note.title, text: note.text });
  const [error, setError] = useState<{ field: "title" | "text" | "server"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const titleErrorId = useId();
  const textErrorId = useId();

  /** `true` = nema šta da se čuva ili je sačuvano (uređivač sme da se zatvori). */
  const flush = async (): Promise<boolean> => {
    const result = noteEditPatch(base, { title, text });
    if (!result.ok) {
      setError({ field: result.field, message: result.reason });
      return false;
    }
    if (result.patch === null) {
      setError(null);
      return true;
    }
    setSaving(true);
    try {
      await onSave(result.patch);
      setBase({ title: result.patch.title ?? base.title, text: result.patch.text ?? base.text });
      setError(null);
      return true;
    } catch (cause) {
      setError({
        field: "server",
        message: accessErrorMessage(cause, "Izmena nije sačuvana. Pokušaj ponovo."),
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    // Klik na „Gotovo" ili na red sam zatvara uređivač; ovde samo čuvamo.
    void flush();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    void flush().then((ok) => {
      if (ok) onClose();
    });
  };

  const fieldError = (field: "title" | "text") => (error?.field === field ? error.message : null);

  return (
    <div ref={rootRef} role="group" aria-label="Izmena beleške" onBlur={onBlur} onKeyDown={onKeyDown} className="space-y-2">
      <Input
        value={title}
        onChange={(event) => {
          setTitle(event.target.value);
          setError(null);
        }}
        maxLength={NOTE_TITLE_MAX + 1}
        aria-label="Naslov beleške"
        placeholder={noteDisplayTitle({ title: null, text })}
        aria-invalid={fieldError("title") ? true : undefined}
        aria-describedby={fieldError("title") ? titleErrorId : undefined}
        className="h-10 text-copy font-medium md:text-ui"
      />
      {fieldError("title") ? (
        <p id={titleErrorId} role="alert" className="text-ui text-danger">
          {fieldError("title")}
        </p>
      ) : null}
      <Textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        maxLength={NOTE_TEXT_MAX + 1}
        aria-label="Tekst beleške"
        aria-invalid={fieldError("text") ? true : undefined}
        aria-describedby={fieldError("text") ? textErrorId : undefined}
        className="max-h-96 min-h-24 resize-y text-ui leading-6"
      />
      {fieldError("text") ? (
        <p id={textErrorId} role="alert" className="text-ui text-danger">
          {fieldError("text")}
        </p>
      ) : null}
      {error?.field === "server" ? (
        <p role="alert" className="text-ui text-danger">
          {error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta text-text-muted" aria-live="polite">
          {saving ? "Čuvam…" : "Čuva se kad izađeš iz polja."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={saving}
          // Safari/Firefox ne fokusiraju dugme pri pritisku: bez ovoga blur-čuvanje onemogući dugme pre klika.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            void flush().then((ok) => {
              if (ok) onClose();
            });
          }}
        >
          Gotovo
        </Button>
      </div>
    </div>
  );
}
