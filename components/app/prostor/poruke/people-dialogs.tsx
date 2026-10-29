"use client";


// Preneto iz Devotion apps/web/components/me/chat/people-dialogs.tsx (main @ c05c40f), SPAJANJE S15.
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LoaderCircle, Lock, LogOut, RefreshCw, Search } from "lucide-react";
import {
  filterPeople,
  GROUP_MEMBERS_MAX,
  GROUP_NAME_MAX,
  GROUP_OTHER_MEMBERS_MAX,
  groupDraftProblem,
  groupMembersLabel,
  sharedStartupsLabel,
} from "@/lib/prostor";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { cn } from "@/lib/utils";

/** Osoba iz `chat.listPeople` (samo ime, avatar i zajednički projekti). */
export type HubPersonModel = {
  _id: string;
  displayName: string;
  avatarUrl: string | null;
  sharedStartupNames: ReadonlyArray<string>;
};

export type PeopleState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; people: ReadonlyArray<HubPersonModel> };

/** Strelice gore/dole kroz redove liste (i iz polja za pretragu na prvi red). */
function moveFocus(event: KeyboardEvent<HTMLElement>, root: HTMLElement | null, selector: string) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = Array.from(root?.querySelectorAll<HTMLElement>(selector) ?? []).filter(
    (item) => !item.hasAttribute("disabled"),
  );
  if (items.length === 0) return;
  event.preventDefault();
  const current = items.indexOf(document.activeElement as HTMLElement);
  const next =
    current === -1
      ? event.key === "ArrowDown"
        ? 0
        : items.length - 1
      : Math.min(items.length - 1, Math.max(0, current + (event.key === "ArrowDown" ? 1 : -1)));
  items[next]?.focus();
}

/**
 * Fokus posle zatvaranja dijaloga. Podrazumevano se vraća na element koji ga je
 * otvorio; ako je on tada sakriven ili uklonjen (uzak ekran je prešao sa liste
 * na razgovor, meni se zatvorio), fokus ide na `returnFocusFallback`.
 */
function useFinalFocus(open: boolean, returnFocusFallback?: () => HTMLElement | null) {
  const openerRef = useRef<HTMLElement | null>(null);
  const fallbackRef = useRef(returnFocusFallback);
  useLayoutEffect(() => {
    fallbackRef.current = returnFocusFallback;
  });
  // Element sa fokusom u trenutku otvaranja (pre nego što fokus pređe u dijalog).
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [open]);
  return () => {
    const opener = openerRef.current;
    if (opener !== null && opener.isConnected && opener.getClientRects().length > 0) return true;
    return fallbackRef.current?.() ?? true;
  };
}

function PeopleSearch({
  value,
  onChange,
  inputRef,
  onArrowDown,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onArrowDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Pretraži ljude
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Esc zatvara ceo dijalog (polje ga ne troši) — kao u ostalim dijalozima.
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") onArrowDown(event);
        }}
        placeholder="Pretraži ljude…"
        autoComplete="off"
        className="h-9 pl-8 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
    </div>
  );
}

function PeopleLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" className="space-y-1">
      <span className="sr-only">Učitavanje ljudi…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2.5 px-2 py-2" aria-hidden="true">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function PeopleError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="px-4 py-6 text-center">
      <p className="text-ui font-semibold text-foreground">Ljudi se ne mogu učitati</p>
      <p className="mt-1 text-ui text-text-secondary">Proveri vezu i pokušaj ponovo.</p>
      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Pokušaj ponovo
      </Button>
    </div>
  );
}

// --- Nova poruka --------------------------------------------------------------

export type NewDmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PeopleState;
  /** Otvara (ili pronalazi) lični DM; dijalog ostaje otvoren dok ne uspe. */
  onPick: (personId: string) => void;
  /** Osoba čiji se razgovor upravo otvara. */
  pendingId: string | null;
  /** Fokus posle izlaza kad dugme koje je otvorilo dijalog više nije vidljivo. */
  returnFocusFallback?: () => HTMLElement | null;
};

/** „Nova poruka" (plan K07 §2): izbor osobe iz tima → `chat.openPersonalDm`. */
export function NewDmDialog({ open, onOpenChange, people, onPick, pendingId, returnFocusFallback }: NewDmDialogProps) {
  const [query, setQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  // Svako otvaranje kreće od prazne pretrage (i kad je dijalog zatvorio izbor osobe).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery("");
  }
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const visible = people.status === "ready" ? filterPeople(people.people, query) : [];

  const finalFocus = useFinalFocus(open, returnFocusFallback);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        initialFocus={() => searchRef.current ?? true}
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[28rem]"
      >
        <DialogHeader>
          <DialogTitle>Nova poruka</DialogTitle>
          <DialogDescription>Izaberi osobu iz tima.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <PeopleSearch
            value={query}
            onChange={setQuery}
            inputRef={searchRef}
            onArrowDown={(event) => moveFocus(event, listRef.current, "[data-person]")}
          />
          {people.status === "loading" ? (
            <PeopleLoading />
          ) : people.status === "error" ? (
            <PeopleError retry={people.retry} />
          ) : people.people.length === 0 ? (
            <p className="px-2 py-6 text-center text-ui text-text-secondary">U timu još nema drugih ljudi.</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-6 text-center text-ui text-text-secondary">Nema rezultata.</p>
          ) : (
            <ul
              ref={listRef}
              aria-label="Ljudi"
              className="-mx-1 max-h-[min(20rem,45dvh)] space-y-0.5 overflow-y-auto [scrollbar-width:thin]"
              onKeyDown={(event) => moveFocus(event, listRef.current, "[data-person]")}
            >
              {visible.map((person) => {
                const pending = pendingId === person._id;
                return (
                  <li key={person._id}>
                    <button
                      type="button"
                      data-person=""
                      disabled={pendingId !== null && !pending}
                      aria-busy={pending || undefined}
                      onClick={() => onPick(person._id)}
                      className="flex min-h-12 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-control-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ProfileAvatar profile={person} className="size-8 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ui font-medium text-foreground">{person.displayName}</span>
                        <span className="block truncate text-meta text-text-muted">
                          {sharedStartupsLabel(person.sharedStartupNames)}
                        </span>
                      </span>
                      {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogPopup>
    </Dialog>
  );
}

// --- Izbor članova ------------------------------------------------------------

function PeoplePicker({
  people,
  selected,
  onToggle,
  locked,
  lockedReason,
}: {
  people: ReadonlyArray<HubPersonModel>;
  selected: ReadonlySet<string>;
  onToggle: (personId: string) => void;
  /** Podešavanja za ne-vlasnika: spisak se vidi, ali se ne menja (E15). */
  locked?: boolean;
  lockedReason?: string;
}) {
  const [query, setQuery] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const reasonId = useId();
  const visible = filterPeople(people, query);
  const full = selected.size >= GROUP_OTHER_MEMBERS_MAX;

  return (
    <div className="space-y-2">
      {locked ? null : (
        <PeopleSearch
          value={query}
          onChange={setQuery}
          onArrowDown={(event) => moveFocus(event, listRef.current, "input[type=checkbox]")}
        />
      )}
      {locked && lockedReason ? (
        <p id={reasonId} className="flex items-center gap-1.5 text-meta text-text-muted">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          {lockedReason}
        </p>
      ) : null}
      {!locked && full ? (
        <p role="status" className="text-meta text-text-muted">
          Grupa je puna ({GROUP_MEMBERS_MAX} članova sa tobom). Ukloni nekog da dodaš drugog.
        </p>
      ) : null}
      {people.length === 0 ? (
        <p className="px-2 py-4 text-center text-ui text-text-secondary">U timu još nema drugih ljudi.</p>
      ) : visible.length === 0 ? (
        <p className="px-2 py-4 text-center text-ui text-text-secondary">Nema rezultata.</p>
      ) : (
        <ul
          ref={listRef}
          aria-label="Članovi"
          className="-mx-1 max-h-[min(18rem,35dvh)] space-y-0.5 overflow-y-auto [scrollbar-width:thin]"
          onKeyDown={(event) => moveFocus(event, listRef.current, "input[type=checkbox]")}
        >
          {visible.map((person) => {
            const checked = selected.has(person._id);
            const disabled = !checked && full;
            return (
              <li key={person._id}>
                <label
                  className={cn(
                    "flex min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors",
                    locked ? "cursor-default" : "cursor-pointer hover:bg-surface-control-hover",
                    disabled && "cursor-not-allowed",
                  )}
                >
                  {locked ? null : (
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => onToggle(person._id)}
                    />
                  )}
                  <ProfileAvatar profile={person} className="size-7 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ui text-foreground">{person.displayName}</span>
                    <span className="block truncate text-meta text-text-muted">
                      {sharedStartupsLabel(person.sharedStartupNames)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GroupNameField({
  value,
  onChange,
  inputRef,
  locked,
  lockedReasonId,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  locked?: boolean;
  lockedReasonId?: string;
  /** Enter u nazivu = glavna radnja dijaloga. */
  onEnter?: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-ui font-medium text-foreground">
        Naziv grupe
      </label>
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(event) => {
          if (!locked) onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !locked && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onEnter?.();
          }
        }}
        readOnly={locked}
        aria-disabled={locked || undefined}
        aria-describedby={locked ? lockedReasonId : undefined}
        maxLength={GROUP_NAME_MAX}
        placeholder="npr. Vikend plan"
        autoComplete="off"
        className={cn(locked && "text-muted-foreground")}
      />
    </div>
  );
}

// --- Nova grupa ---------------------------------------------------------------

export type NewGroupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  people: PeopleState;
  /** Pravi grupu; greška servera se vraća kao tekst (prikazuje se ispod forme). */
  onCreate: (name: string, memberIds: string[]) => Promise<string | null>;
  /** Početno stanje (izlog). */
  initialName?: string;
  initialSelected?: ReadonlyArray<string>;
  /** Fokus posle izlaza kad dugme koje je otvorilo dijalog više nije vidljivo. */
  returnFocusFallback?: () => HTMLElement | null;
};

/** „Nova grupa" (plan K07 §2): naziv + članovi → `chat.createPersonalGroup`. */
export function NewGroupDialog({
  open,
  onOpenChange,
  people,
  onCreate,
  initialName = "",
  initialSelected = [],
  returnFocusFallback,
}: NewGroupDialogProps) {
  const [name, setName] = useState(initialName);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialSelected));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [wasOpen, setWasOpen] = useState(open);
  // Nacrt se briše pri sledećem otvaranju (ne tokom izlazne animacije).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(initialName);
      setSelected(new Set(initialSelected));
      setError(null);
    }
  }

  const finalFocus = useFinalFocus(open, returnFocusFallback);

  async function submit() {
    if (busy) return;
    const problem = groupDraftProblem({ name, otherCount: selected.size });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onCreate(name.trim(), [...selected]);
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        initialFocus={() => nameRef.current ?? true}
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[30rem]"
      >
        <DialogHeader>
          <DialogTitle>Nova grupa</DialogTitle>
          <DialogDescription>Lična grupa ne pripada nijednom projektu. Vide je samo njeni članovi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <GroupNameField value={name} onChange={setName} inputRef={nameRef} onEnter={() => void submit()} />
          <fieldset className="space-y-2">
            <legend className="mb-2 text-ui font-medium text-foreground">{groupMembersLabel(selected.size)}</legend>
            {people.status === "loading" ? (
              <PeopleLoading rows={4} />
            ) : people.status === "error" ? (
              <PeopleError retry={people.retry} />
            ) : (
              <PeoplePicker
                people={people.people}
                selected={selected}
                onToggle={(personId) =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(personId)) next.delete(personId);
                    else next.add(personId);
                    return next;
                  })
                }
              />
            )}
          </fieldset>
          {error ? (
            <p id={errorId} role="alert" className="text-ui text-danger">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button
            variant="primary"
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            aria-describedby={error ? errorId : undefined}
          >
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Napravi grupu
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

// --- Podešavanja grupe ----------------------------------------------------------

export type GroupSettingsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      name: string;
      isOwner: boolean;
      /** Trenutni članovi BEZ mene (vlasnik ostaje uvek). */
      members: ReadonlyArray<HubPersonModel>;
      /** Ostali ljudi koje vlasnik može da doda. */
      people: ReadonlyArray<HubPersonModel>;
    };

export type GroupSettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: GroupSettingsState;
  /** Čuva ime i članove; vraća grešku servera kao tekst ili `null`. */
  onSave: (name: string, memberIds: string[]) => Promise<string | null>;
  /** Napušta grupu; vraća grešku servera kao tekst ili `null`. */
  onLeave: () => Promise<string | null>;
  /** Izlog: odmah prikaži potvrdu napuštanja. */
  initialConfirmLeave?: boolean;
  /** Fokus posle izlaza kad meni koji je otvorio dijalog više nije vidljiv (napuštena grupa). */
  returnFocusFallback?: () => HTMLElement | null;
};

const OWNER_ONLY = "Podešavanja grupe menja samo njen vlasnik.";

/**
 * „Podešavanja grupe" (plan K07 §2): vlasnik menja ime i članove
 * (`chat.updatePersonalGroup`, „Poništi" u toastu radi kontejner); svi mogu da
 * napuste grupu (`chat.leavePersonalGroup`, uz potvrdu u samom dijalogu).
 */
export function GroupSettingsDialog({
  open,
  onOpenChange,
  state,
  onSave,
  onLeave,
  initialConfirmLeave = false,
  returnFocusFallback,
}: GroupSettingsDialogProps) {
  const ready = state.status === "ready" ? state : null;
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftSelected, setDraftSelected] = useState<Set<string> | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(initialConfirmLeave);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "leave" | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const reasonId = useId();
  const errorId = useId();

  // Nacrt kreće od stanja servera i živi dok se dijalog ne zatvori.
  const name = draftName ?? ready?.name ?? "";
  const currentIds = useMemo(() => new Set(ready?.members.map((member) => member._id) ?? []), [ready]);
  const selected = draftSelected ?? currentIds;
  const candidates = useMemo(() => {
    if (!ready) return [];
    const seen = new Set(ready.members.map((member) => member._id));
    return [...ready.members, ...ready.people.filter((person) => !seen.has(person._id))];
  }, [ready]);
  const locked = ready !== null && !ready.isOwner;
  const cancelLeaveRef = useRef<HTMLButtonElement>(null);
  const focusedNameRef = useRef(false);

  // Nacrt se briše pri sledećem otvaranju (ne tokom izlazne animacije).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraftName(null);
      setDraftSelected(null);
      setConfirmLeave(initialConfirmLeave);
      setError(null);
    }
  }

  // Podaci stižu posle otvaranja (fokus je tada na samom oknu): vlasnik
  // dobija fokus u nazivu čim forma postoji, jednom po otvaranju.
  useEffect(() => {
    if (!open) {
      focusedNameRef.current = false;
      return;
    }
    if (focusedNameRef.current || ready === null || locked) return;
    focusedNameRef.current = true;
    if (!(document.activeElement instanceof HTMLInputElement)) nameRef.current?.focus();
  }, [open, ready, locked]);

  // Potvrda napuštanja menja dugmad: fokus na bezbedan izbor („Otkaži").
  useEffect(() => {
    if (confirmLeave) cancelLeaveRef.current?.focus();
  }, [confirmLeave]);

  const finalFocus = useFinalFocus(open, returnFocusFallback);

  function close(next: boolean) {
    onOpenChange(next);
  }

  async function save() {
    if (!ready || locked || busy) return;
    const problem = groupDraftProblem({ name, otherCount: selected.size });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy("save");
    setError(null);
    const failure = await onSave(name.trim(), [...selected]);
    setBusy(null);
    if (failure) setError(failure);
    else close(false);
  }

  async function leave() {
    if (busy) return;
    setBusy("leave");
    setError(null);
    const failure = await onLeave();
    setBusy(null);
    if (failure) setError(failure);
    else close(false);
  }

  const groupName = ready?.name ?? "";
  const footer = !ready ? null : confirmLeave ? (
    <DialogFooter className="flex-col sm:flex-row sm:items-center">
      <p role="alert" className="min-w-0 text-ui text-foreground sm:mr-auto">
        Napustiti grupu „{groupName}“? Više nećeš videti nove poruke.
      </p>
      <Button
        ref={cancelLeaveRef}
        type="button"
        variant="ghost"
        onClick={() => setConfirmLeave(false)}
        disabled={busy !== null}
      >
        Otkaži
      </Button>
      <Button type="button" variant="destructive" onClick={() => void leave()} disabled={busy !== null}>
        {busy === "leave" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
        Napusti grupu
      </Button>
    </DialogFooter>
  ) : (
    <DialogFooter className="sm:items-center">
      <Button
        type="button"
        variant="destructive"
        className="sm:mr-auto"
        onClick={() => {
          setError(null);
          setConfirmLeave(true);
        }}
        disabled={busy !== null}
      >
        <LogOut aria-hidden="true" />
        Napusti grupu
      </Button>
      <Button type="button" variant="ghost" onClick={() => close(false)}>
        Otkaži
      </Button>
      {locked ? null : (
        <Button
          variant="primary"
          type="button"
          onClick={() => void save()}
          disabled={busy !== null}
          aria-describedby={error ? errorId : undefined}
        >
          {busy === "save" ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          Sačuvaj
        </Button>
      )}
    </DialogFooter>
  );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogPopup
        initialFocus={() => (locked ? true : (nameRef.current ?? true))}
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[30rem]"
      >
        <DialogHeader>
          <DialogTitle>Podešavanja grupe</DialogTitle>
          {ready ? <DialogDescription>{groupName}</DialogDescription> : null}
        </DialogHeader>
        {state.status === "loading" ? (
          <PeopleLoading rows={4} />
        ) : state.status === "error" ? (
          <div role="alert" className="px-4 py-6 text-center">
            <p className="text-ui font-semibold text-foreground">Podešavanja se ne mogu učitati</p>
            <p className="mt-1 text-ui text-text-secondary">Proveri vezu i pokušaj ponovo.</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={state.retry}>
              <RefreshCw aria-hidden="true" />
              Pokušaj ponovo
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <GroupNameField
              value={name}
              onChange={setDraftName}
              inputRef={nameRef}
              locked={locked}
              lockedReasonId={reasonId}
              onEnter={() => void save()}
            />
            <fieldset className="space-y-2">
              <legend className="mb-2 text-ui font-medium text-foreground">
                {locked ? `Članovi (${state.members.length + 1})` : groupMembersLabel(selected.size)}
              </legend>
              <PeoplePicker
                people={locked ? state.members : candidates}
                selected={selected}
                locked={locked}
                lockedReason={OWNER_ONLY}
                onToggle={(personId) => {
                  const next = new Set(selected);
                  if (next.has(personId)) next.delete(personId);
                  else next.add(personId);
                  setDraftSelected(next);
                }}
              />
            </fieldset>
            {locked ? (
              <span id={reasonId} className="sr-only">
                {OWNER_ONLY}
              </span>
            ) : null}
            {error ? (
              <p id={errorId} role="alert" className="text-ui text-danger">
                {error}
              </p>
            ) : null}
          </div>
        )}
        {footer}
      </DialogPopup>
    </Dialog>
  );
}
