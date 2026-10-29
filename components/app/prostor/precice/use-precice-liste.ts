"use client";

// Preneto iz Devotion apps/web/lib/shortcuts/use-task-list-shortcuts.ts (main @ c05c40f), SPAJANJE S08.
import { useCallback, useState, type FocusEvent, type RefObject } from "react";
import type { TaskRowModel } from "@/lib/prostor/task-row";
import { nextRowKey, taskListAction, taskListShortcutDefs, type RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { toast } from "@/lib/toast";

import { useShortcuts } from "./precice-provider";

export { nextRowKey, taskListAction, taskListShortcutDefs, type RowRequest, type TaskListAction } from "@/lib/prostor/precice/lista-zadataka";

type ListActions = {
  onToggleDone: (row: TaskRowModel, done: boolean) => void;
  onTogglePlan: (row: TaskRowModel) => void;
  onOpen: (row: TaskRowModel) => void;
};

/** Redovi u listi, redom kako se vide (bez sklopljenih sekcija i sakrivenih redova). */
function visibleRowKeys(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-row-key]"))
    .filter((element) => !element.closest("[inert]") && element.getClientRects().length > 0)
    .map((element) => element.dataset.rowKey ?? "")
    .filter(Boolean);
}

function rowElement(root: HTMLElement, key: string) {
  return root.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"]`);
}

/** Glavni fokus reda: naslov (otvara panel), inače prvi kontrol. */
function focusRow(root: HTMLElement, key: string) {
  const row = rowElement(root, key);
  if (!row) return;
  const target = row.querySelector<HTMLElement>("[data-row-focus]") ?? row.querySelector<HTMLElement>("button");
  target?.focus({ preventScroll: true });
  row.scrollIntoView({ block: "nearest" });
}

/**
 * Prečice liste: `j`/`k` i strelice biraju red (fokus prati izbor), `x`
 * završava, `Enter` otvara panel, `d` rok, `p` prioritet, `t` Moj dan, `/`
 * pretraga. Izbor se pamti po ključu reda (ne po indeksu), pa preživi
 * reaktivno pomeranje. `Enter` na dugmetu ostaje dugmetu (native), da ne
 * otvara panel umesto menija ili kvačice.
 */
export function useTaskListShortcuts({
  listRef,
  getRow,
  actions,
  searchRef,
  reorder = false,
  enabled = true,
}: {
  listRef: RefObject<HTMLElement | null>;
  getRow: (key: string) => TaskRowModel | undefined;
  actions: ListActions | undefined;
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Moj dan: u pomoći prikaži i Alt+↑/↓ (redosled plana). */
  reorder?: boolean;
  enabled?: boolean;
}): {
  selectedKey: string | null;
  request: RowRequest | null;
  /** Kad fokus uđe u red (Tab, klik), izbor ga prati. */
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
} {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [request, setRequest] = useState<RowRequest | null>(null);

  const onListFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    const key = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]")?.dataset.rowKey;
    if (key) setSelectedKey(key);
  }, []);

  const hasSearch = searchRef !== undefined;
  const defs = taskListShortcutDefs({ search: hasSearch, reorder });

  useShortcuts(
    defs,
    (id) => {
      const action = taskListAction(id);
      const root = listRef.current;
      if (action === null || !root) return false;

      if (action === "search") {
        if (!searchRef?.current) return false;
        searchRef.current.focus();
        searchRef.current.select();
        return;
      }

      const keys = visibleRowKeys(root);
      const current = selectedKey !== null && keys.includes(selectedKey) ? selectedKey : null;

      if (action === "next" || action === "prev") {
        const next = nextRowKey(keys, current, action === "next" ? 1 : -1);
        if (next === null) return false;
        setSelectedKey(next);
        focusRow(root, next);
        return;
      }

      if (action === "open") {
        // Enter na dugmetu (naslov reda, kvačica, meni, rok) radi ono što to
        // dugme radi; prečica važi samo kad fokus nije ni na čemu.
        const active = document.activeElement;
        if (active !== null && active !== document.body && active !== root) return false;
      }

      if (current === null) return false;
      const row = getRow(current);
      if (!row || !actions) return false;

      switch (action) {
        case "complete":
          actions.onToggleDone(row, !row.done);
          return;
        case "open":
          actions.onOpen(row);
          return;
        case "plan":
          actions.onTogglePlan(row);
          return;
        case "due":
          if (!row.permissions.due.allowed) {
            toast.error(row.permissions.due.reason ?? "Rok menja samo kreator zadatka.");
            return;
          }
          setRequest((previous) => ({ key: row.key, kind: "due", nonce: (previous?.nonce ?? 0) + 1 }));
          return;
        case "priority":
          if (!row.permissions.priority.allowed) {
            toast.error(row.permissions.priority.reason ?? "Prioritet menja samo kreator zadatka.");
            return;
          }
          setRequest((previous) => ({ key: row.key, kind: "priority", nonce: (previous?.nonce ?? 0) + 1 }));
          return;
      }
    },
    enabled,
  );

  return { selectedKey, request, onListFocus };
}
