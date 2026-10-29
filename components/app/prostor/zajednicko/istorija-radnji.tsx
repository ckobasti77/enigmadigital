"use client";

// Preneto iz Devotion apps/web/components/workspace/workspace-history.tsx (main @ c05c40f), SPAJANJE S10.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "@/lib/toast";

export type WorkspaceHistoryEntry = {
  label: string;
  undo: () => Promise<unknown>;
  redo: () => Promise<unknown>;
};

type WorkspaceHistoryState = {
  undoCount: number;
  redoCount: number;
  busy: boolean;
};

type WorkspaceHistoryValue = {
  historyState: WorkspaceHistoryState;
  pushHistory: (entry: WorkspaceHistoryEntry) => void;
  runHistory: (direction: "undo" | "redo") => Promise<void>;
};

const WorkspaceHistoryContext = createContext<WorkspaceHistoryValue | null>(null);

export function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [role='textbox']",
      ),
    )
  );
}

export function WorkspaceHistoryProvider({ children }: { children: ReactNode }) {
  const undoStackRef = useRef<WorkspaceHistoryEntry[]>([]);
  const redoStackRef = useRef<WorkspaceHistoryEntry[]>([]);
  const busyRef = useRef(false);
  const [historyState, setHistoryState] = useState<WorkspaceHistoryState>({
    undoCount: 0,
    redoCount: 0,
    busy: false,
  });

  const syncState = useCallback((busy = busyRef.current) => {
    setHistoryState({
      undoCount: undoStackRef.current.length,
      redoCount: redoStackRef.current.length,
      busy,
    });
  }, []);

  const pushHistory = useCallback((entry: WorkspaceHistoryEntry) => {
    if (busyRef.current) return;
    undoStackRef.current = [...undoStackRef.current, entry];
    redoStackRef.current = [];
    syncState(false);
  }, [syncState]);

  const runHistory = useCallback(async (direction: "undo" | "redo") => {
    if (busyRef.current) return;
    const source = direction === "undo" ? undoStackRef : redoStackRef;
    const destination = direction === "undo" ? redoStackRef : undoStackRef;
    const entry = source.current.at(-1);
    if (!entry) return;

    busyRef.current = true;
    syncState(true);
    try {
      await (direction === "undo" ? entry.undo() : entry.redo());
      source.current = source.current.slice(0, -1);
      destination.current = [...destination.current, entry];
      toast.success(
        direction === "undo"
          ? `Poništeno: ${entry.label}`
          : `Ponovljeno: ${entry.label}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Promena nije mogla da se primeni.",
      );
    } finally {
      busyRef.current = false;
      syncState(false);
    }
  }, [syncState]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isEditableTarget(event.target) || event.altKey) return;
      const command = event.ctrlKey || event.metaKey;
      if (!command) return;
      const key = event.key.toLowerCase();

      if (key === "z") {
        event.preventDefault();
        void runHistory(event.shiftKey ? "redo" : "undo");
      } else if (key === "y" && !event.shiftKey) {
        event.preventDefault();
        void runHistory("redo");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [runHistory]);

  const value = useMemo(
    () => ({ historyState, pushHistory, runHistory }),
    [historyState, pushHistory, runHistory],
  );

  return (
    <WorkspaceHistoryContext.Provider value={value}>
      {children}
    </WorkspaceHistoryContext.Provider>
  );
}

export function useWorkspaceHistory() {
  const value = useContext(WorkspaceHistoryContext);
  if (!value) {
    throw new Error("useWorkspaceHistory mora biti unutar WorkspaceHistoryProvider-a.");
  }
  return value;
}
