"use client";

// Preneto iz Devotion apps/web/components/me/my-day/use-completion-queue.ts (main @ c05c40f), SPAJANJE S19.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { toast } from "@/lib/toast";
import { completionCall, type CompletionHold, type TaskRowModel, type TaskStatusKey } from "@/lib/prostor";

import { DUR_UI } from "@/lib/motion";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

/** Zadržan red (Devotion `my-day-model` `RowHold`; S12 ga uzima pre Danas). */
type RowHold = CompletionHold<TaskRowModel>;

/** Gde se red sada vidi: sekcija zadržavanja (`<mod>:<id>`) i indeks u njoj. */
export type RowLocation = { section: string; index: number };

/**
 * Red ostaje na mestu kao završen ≈ 0,74 s (Devotion E7: trajanje „bouncy"
 * kvačice), da se vidi šta je završeno i da „Poništi" stigne pre selidbe.
 * Enigmina kvačica nema prebačaj (`DUR_UI`), ali pauza pre selidbe ostaje.
 */
export const HOLD_DONE_MS = 740;
/** Vraćanje u otvoreno: dok se kvačica isprazni. */
export const HOLD_REOPEN_MS = DUR_UI * 1000;
/** „Poništi" traje 8 s (plan K07 E6). */
export const UNDO_MS = 8_000;

export type CompletionQueue = {
  holds: ReadonlyMap<string, RowHold>;
  pending: ReadonlyMap<string, boolean>;
  announcement: string;
  toggleDone: (row: TaskRowModel, done: boolean) => void;
};

/**
 * Završi / vrati (plan K07 §4.1, trenutak 1 i E7) — Moj dan i Moji zadaci
 * (K11, `locate` opisuje raspored liste): mutacija kreće odmah;
 * red ostaje na svom mestu kao završen dok se kvačica ne smiri, pa se Flip-om
 * seli (npr. u „Završeno danas"). Drugi klik pre toga je „Poništi". Do
 * odgovora servera `pending` drži red kao završen; greška vraća red i
 * prikazuje poruku. Fokus ide za redom na novo mesto (ili na red koji je stao
 * na njegovo mesto kad je odredište skupljeno), a `aria-live` najavljuje
 * promenu. `commit` šalje stvarni poziv (kontejner) ili menja lokalne podatke
 * (izlog).
 */
export function useCompletionQueue({
  listRef,
  locate,
  flipCapture,
  commit,
}: {
  listRef: RefObject<HTMLElement | null>;
  /**
   * Gde je red u modelu na ekranu (sa zadržanim redovima). Čita najnoviji
   * model (ref), a raspored (grupisanje) iz trenutka klika.
   */
  locate: (key: string) => RowLocation | null;
  flipCapture: () => void;
  commit: (row: TaskRowModel, done: boolean, previousStatus: TaskStatusKey | undefined) => Promise<unknown>;
}): CompletionQueue {
  const [holds, setHolds] = useState<ReadonlyMap<string, RowHold>>(() => new Map());
  const [pending, setPending] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [announcement, setAnnouncement] = useState("");
  const timers = useRef(new Map<string, number>());
  const previousStatus = useRef(new Map<string, TaskStatusKey>());
  // Redni broj poslednjeg slanja po redu: stariji odgovor ne briše noviju nameru.
  const sequence = useRef(new Map<string, number>());
  // `control`: fokus se vraća na istu vrstu kontrole — kvačicu (klik) ili
  // naslov reda (prečica `x`), da sledeći Enter ne završi i susedni red.
  const refocus = useRef<{ key: string; section: string; index: number; control: string } | null>(null);
  useEffect(() => {
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // Posle commit-a fokus ide za redom (kvačica na novom mestu); ako je
  // odredište skupljeno (`inert`), na red koji je stao na staro mesto, pa na
  // prethodni red u sekciji, pa na prvu kvačicu u listi, pa na samu listu.
  useLayoutEffect(() => {
    const target = refocus.current;
    const root = listRef.current;
    if (!target || !root) return;
    refocus.current = null;
    const focusable = (element: Element | null | undefined) =>
      element instanceof HTMLElement && !element.closest("[inert]") ? element : null;
    const inSection = Array.from(
      root.querySelectorAll(`[data-section="${CSS.escape(target.section)}"] ${target.control}`),
    );
    const candidate =
      focusable(root.querySelector(`[data-row-key="${CSS.escape(target.key)}"] ${target.control}`)) ??
      focusable(inSection[target.index]) ??
      focusable(inSection[target.index - 1]) ??
      Array.from(root.querySelectorAll(target.control))
        .map((element) => focusable(element))
        .find((element) => element !== null) ??
      null;
    if (candidate) {
      candidate.focus({ preventScroll: true });
      return;
    }
    if (!root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
    root.focus({ preventScroll: true });
  });

  const dropHold = (key: string) =>
    setHolds((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  const setPendingValue = (key: string, value: boolean | null) =>
    setPending((current) => {
      const next = new Map(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  const clearTimer = (key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(key);
  };
  // Isti tekst dvaput zaredom: region mora da se promeni da bi čitač progovorio.
  const announce = (text: string) =>
    setAnnouncement((previous) => (previous === text ? `${text} ` : text));

  const release = (row: TaskRowModel, done: boolean, locateAtClick: (key: string) => RowLocation | null) => {
    timers.current.delete(row.key);
    const element = listRef.current?.querySelector(`[data-row-key="${CSS.escape(row.key)}"]`);
    if (element?.contains(document.activeElement)) {
      const location = locateAtClick(row.key);
      refocus.current = {
        control:
          document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute("data-row-focus")
            ? "[data-row-focus]"
            : '[role="checkbox"]',
        key: row.key,
        section: location ? location.section.slice(location.section.indexOf(":") + 1) : "",
        index: location?.index ?? 0,
      };
    }
    flipCapture();
    dropHold(row.key);
    announce(done ? `Završeno: ${row.title}` : `Vraćeno u otvoreno: ${row.title}`);
  };

  const send = (row: TaskRowModel, done: boolean) => {
    const order = (sequence.current.get(row.key) ?? 0) + 1;
    sequence.current.set(row.key, order);
    const latest = () => sequence.current.get(row.key) === order;
    setPendingValue(row.key, done);
    void commit(row, done, previousStatus.current.get(row.key))
      .then(() => {
        if (latest()) setPendingValue(row.key, null);
      })
      .catch((error: unknown) => {
        if (latest()) {
          clearTimer(row.key);
          dropHold(row.key);
          setPendingValue(row.key, null);
        }
        toast.error(
          accessErrorMessage(error, done ? "Zadatak nije završen. Pokušaj ponovo." : "Zadatak nije vraćen. Pokušaj ponovo."),
        );
      });
  };

  /**
   * Završi ili vrati. Red se zadrži na mestu gde se sada vidi (i kad je već
   * zadržan — drugi klik pre smirivanja je „Poništi": kvačica se prazni, red
   * ostaje), pa se posle smirivanja Flip-om seli tamo gde ga vode podaci.
   * Isti put koristi i „Poništi" iz toasta (sa zadržavanjem i najavom).
   */
  const toggleDone = (row: TaskRowModel, done: boolean) => {
    const check = completionCall(row, done, previousStatus.current.get(row.key));
    if (check.fn === "denied") {
      toast.error(check.reason);
      return;
    }
    if (done && row.status !== "done") previousStatus.current.set(row.key, row.status);
    const locateAtClick = locate;
    const location = locateAtClick(row.key);
    clearTimer(row.key);
    if (location) {
      setHolds((current) => new Map(current).set(row.key, { section: location.section, index: location.index, row, done }));
      timers.current.set(
        row.key,
        window.setTimeout(() => release(row, done, locateAtClick), done ? HOLD_DONE_MS : HOLD_REOPEN_MS),
      );
    } else {
      dropHold(row.key);
    }
    send(row, done);
    if (done) {
      toast(`Završeno: ${row.title}`, {
        duration: UNDO_MS,
        action: { label: "Poništi", onClick: () => toggleDone(row, false) },
      });
    }
  };

  return { holds, pending, announcement, toggleDone };
}
