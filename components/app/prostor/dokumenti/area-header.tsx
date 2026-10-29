"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-header.tsx (main @ c05c40f), SPAJANJE S10.
import { useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, LoaderCircle, Pencil, Plus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import type { NavIcon } from "@/components/app/nav-items";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PAGE_KIND_META, type PageKind } from "@/lib/prostor/web/vrste-stranica";

import type { AreaTab } from "@/lib/prostor/rute";
import { AREA_LABEL_MAX, AREA_TAB_LABELS, validateAreaLabel } from "@/lib/prostor/modeli/area-model";

export type AreaHeaderProps = {
  label: string;
  /** Ikonica oblasti (po ključu oblasti); crta je zaglavlje ekrana. */
  icon: NavIcon;
  /** „12 stranica · 8 zadataka"; `null` dok brojevi stižu. */
  meta: string | null;
  /** Kartice koje oblast ima (redom). */
  tabs: ReadonlyArray<AreaTab>;
  /** Brojevi uz kartice („8", „99+"); `null` = bez broja. */
  tabCounts: Partial<Record<AreaTab, string | null>>;
  /** Isti brojevi rečima za čitač ekrana („8 zadataka"). */
  tabCountLabels?: Partial<Record<AreaTab, string | null>>;
  /** Preimenovanje (svaki član, `projekat.updateArea`); `true` = sačuvano. */
  onRename: ((label: string) => Promise<boolean>) | null;
  /** Vrste koje „Nova stranica" nudi; jedna vrsta = dugme bez izbora. */
  kinds: ReadonlyArray<PageKind>;
  onCreate: (kind: PageKind) => void;
};

/**
 * Zaglavlje oblasti (K07 §5.5) na Enigminom zaglavlju ekrana (`PageHeader`,
 * ikonica mesta): naziv sa „Preimenuj oblast" (polje u mestu, Enter čuva, Esc
 * odustaje), broj stranica i zadataka, jedina primarna radnja „Nova stranica"
 * i red kartica ispod. Mora biti unutar `Tabs` (red kartica je `TabsList`).
 */
export function AreaHeader({
  label,
  icon,
  meta,
  tabs,
  tabCounts,
  tabCountLabels,
  onRename,
  kinds,
  onCreate,
}: AreaHeaderProps) {
  const pencilRef = useRef<HTMLButtonElement>(null);
  const naziv = useNazivOblasti(label, onRename, pencilRef);
  return (
    <header>
      <PageHeader
        variant="module"
        icon={icon}
        title={naziv.editing ? naziv.polje : label}
        description={
          naziv.error ? (
            <span id={naziv.errorId} role="alert" className="text-danger">
              {naziv.error}
            </span>
          ) : (
            (meta ?? undefined)
          )
        }
        actions={
          <>
            {naziv.busy ? (
              <span role="status" className="inline-flex">
                <LoaderCircle className="size-4 animate-spin text-text-secondary" aria-hidden="true" />
                <span className="sr-only">Čuvam naziv</span>
              </span>
            ) : null}
            {onRename && !naziv.editing ? (
              <Button
                ref={pencilRef}
                type="button"
                variant="ghost"
                size="icon"
                className="text-text-secondary"
                aria-label="Preimenuj oblast"
                onClick={naziv.start}
              >
                <Pencil aria-hidden="true" />
              </Button>
            ) : null}
            <NovaStranica kinds={kinds} onCreate={onCreate} />
          </>
        }
      />
      <TabsList variant="line" aria-label="Prikaz oblasti" className="mt-4 w-full">
        {tabs.map((tab) => {
          const count = tabCounts[tab];
          const spoken = tabCountLabels?.[tab];
          return (
            <TabsTrigger key={tab} value={tab}>
              {AREA_TAB_LABELS[tab]}
              {count ? (
                <>
                  <span aria-hidden={spoken ? true : undefined} className="font-normal tabular-nums text-text-secondary">
                    {count}
                  </span>
                  {spoken ? <span className="sr-only">, {spoken}</span> : null}
                </>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </header>
  );
}

/** Jedina primarna radnja oblasti; sa više vrsta otvara izbor vrste. */
function NovaStranica({
  kinds,
  onCreate,
}: {
  kinds: ReadonlyArray<PageKind>;
  onCreate: (kind: PageKind) => void;
}) {
  if (kinds.length <= 1) {
    return (
      <Button variant="primary" onClick={() => onCreate(kinds[0] ?? "note")}>
        <Plus aria-hidden="true" />
        Nova stranica
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="primary">
            <Plus aria-hidden="true" />
            Nova stranica
            <ChevronDown className="-mr-1" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-44">
        {kinds.map((kind) => {
          const KindIcon = PAGE_KIND_META[kind].icon;
          return (
            <DropdownMenuItem key={kind} onClick={() => onCreate(kind)}>
              <KindIcon className="text-text-secondary" aria-hidden="true" />
              {PAGE_KIND_META[kind].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Preimenovanje naziva oblasti u mestu (Enter čuva, Esc odustaje, napuštanje praznog vraća stari). */
function useNazivOblasti(
  label: string,
  onRename: AreaHeaderProps["onRename"],
  /** Olovka „Preimenuj oblast": fokus joj se vraća kad polje nestane sa tastature. */
  pencilRef: RefObject<HTMLButtonElement | null>,
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Dva brza Enter-a ne smeju da pošalju dva preimenovanja (stanje stiže tek posle rendera).
  const busyRef = useRef(false);
  // Polje je zatvoreno (Esc, sačuvano): kasni blur pri uklanjanju ne sme da čuva.
  const closedRef = useRef(false);
  const errorId = useId();

  function start() {
    closedRef.current = false;
    setDraft(label);
    setError(null);
    setEditing(true);
  }

  function stop(returnFocus: boolean) {
    closedRef.current = true;
    setEditing(false);
    setError(null);
    // Sa tastature fokus se vraća na olovku (polje nestaje); klik negde drugde ga ne krade.
    if (returnFocus) window.requestAnimationFrame(() => pencilRef.current?.focus());
  }

  async function commit(fromBlur: boolean) {
    if (busyRef.current || !onRename || closedRef.current) return;
    const checked = validateAreaLabel(draft);
    if (!checked.ok) {
      // Napuštanje praznog polja vraća stari naziv; Enter kaže zašto ne može.
      if (fromBlur) stop(false);
      else setError(checked.message);
      return;
    }
    if (checked.label === label) {
      stop(!fromBlur);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const saved = await onRename(checked.label);
    busyRef.current = false;
    setBusy(false);
    if (saved) stop(!fromBlur);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit(false);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop(true);
    }
  }

  const polje = (
    <Input
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        setError(null);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => void commit(true)}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      maxLength={AREA_LABEL_MAX}
      aria-label="Naziv oblasti"
      aria-invalid={error !== null}
      aria-describedby={error ? errorId : undefined}
      data-escape-local
      className="h-9 max-w-md text-title font-bold md:text-title"
    />
  );

  return { editing: editing && onRename !== null, polje, error, errorId, busy, start };
}
