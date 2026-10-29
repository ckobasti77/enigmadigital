"use client";

// Preneto iz Devotion apps/web/components/workspace/startup-tasks/use-move-focus.ts (main @ c05c40f), SPAJANJE S12.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { TaskRowModel } from "@/lib/prostor";

/** Interaktivan element — tu je korisnik namerno, fokus se ne otima. */
const INTERACTIVE = 'input, textarea, select, button, a[href], [contenteditable="true"], [role^="menuitem"], [role="option"]';

/**
 * Posle promene roka, prioriteta ili statusa red može da pređe u drugu zonu
 * ili kolonu (drugi `<ul>`), pa se montira iznova i fokus iz birača ili menija
 * nema gde da se vrati. Posle commit-a fokus ide na naslov istog reda na novom
 * mestu (DNK §5.5), a `aria-live` najavljuje promenu. Najava kvačice
 * (`completionAnnouncement`) ide kroz isti region.
 */
export function useMoveFocus(
  listRef: RefObject<HTMLElement | null>,
  completionAnnouncement: string,
): { announcement: string; moved: (row: TaskRowModel, text: string) => void } {
  const [notice, setNotice] = useState(completionAnnouncement);
  const [seenCompletion, setSeenCompletion] = useState(completionAnnouncement);
  if (completionAnnouncement !== seenCompletion) {
    setSeenCompletion(completionAnnouncement);
    setNotice(completionAnnouncement);
  }
  const refocusKey = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    const key = refocusKey.current;
    if (key === null) return;
    refocusKey.current = null;
    if (timer.current !== null) window.clearTimeout(timer.current);
    // Posle vraćanja fokusa iz Base UI sloja (popover / meni se zatvara u istom potezu).
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const root = listRef.current;
      const active = document.activeElement;
      if (!root) return;
      const lost =
        active === null || active === document.body || (!root.contains(active) && !active.matches(INTERACTIVE));
      if (!lost) return;
      // Red je mogao da izađe iz prikaza (npr. rok pomeren van liste „Za tebe"): fokus ide na prvi red, ne na body.
      const target =
        root.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"] [data-row-focus]`) ??
        root.querySelector<HTMLElement>("[data-row-key] [data-row-focus]");
      target?.focus({ preventScroll: true });
    }, 0);
  });

  const moved = (row: TaskRowModel, text: string) => {
    refocusKey.current = row.key;
    const message = `${text}: ${row.title}`;
    setNotice((previous) => (previous === message ? `${message} ` : message));
  };

  return { announcement: notice, moved };
}
