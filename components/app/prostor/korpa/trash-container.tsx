"use client";

// Preneto iz Devotion apps/web/components/workspace/trash/trash-container.tsx (main @ c05c40f), SPAJANJE S21.
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { restoredMessage, type TrashKind } from "@/lib/prostor/trash";
import { api } from "@/convex/_generated/api";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

import {
  focusKeyAfterRemoval,
  openTargetAfterRestore,
  restoreTarget,
  trashItemKey,
  trashItemTitle,
  type RecoveredTrashItem,
  type RestorableTrashItem,
  type TrashOpenTarget,
} from "@/lib/prostor/modeli/trash-model";
import { TrashList, TrashView } from "@/components/app/prostor/korpa/trash-view";
import { useProjekatPaginatedQuery, useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";
import { useProjekatMutation } from "@/components/app/projekat-provider";

/** Stavki po strani (server prima najviše `TRASH_PAGE_MAX` = 50). */
const TRASH_PAGE = 30;
/** „pre N min" se osvežava jednom u minuti (`useToday` tiče samo u ponoć i na fokus). */
const CLOCK_MS = 60_000;

function useLiveNow(now: number): number {
  const [tick, setTick] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return Math.max(now, tick);
}

type TrashContainerProps = {
  segment: TrashKind;
  onSegmentChange: (segment: TrashKind) => void;
  now: number;
  onOpen: (target: TrashOpenTarget) => void;
};

/**
 * Korpa — kontejner (PROSTOR P3): brojevi segmenata (`trash.counts`, greška
 * brojača se tiho preskače) i lista segmenta (`trash.list`) sa „Vrati"
 * (`trash.restore`) i „Ukloni" za Oporavljeno (`trash.dismissRecovered`).
 */
export function TrashContainer({ segment, onSegmentChange, now: dayNow, onOpen }: TrashContainerProps) {
  const counts = useProjekatQueryTolerant(api.prostor.trash.counts);
  const now = useLiveNow(dayNow);
  return (
    <TrashView segment={segment} onSegmentChange={onSegmentChange} counts={counts}>
      <TrashListBoundary key={segment} segment={segment} now={now}>
        <TrashListLoader segment={segment} now={now} onOpen={onOpen} />
      </TrashListBoundary>
    </TrashView>
  );
}

function TrashListLoader({
  segment,
  now,
  onOpen,
}: {
  segment: TrashKind;
  now: number;
  onOpen: (target: TrashOpenTarget) => void;
}) {
  const { results, status, loadMore } = useProjekatPaginatedQuery(
    api.prostor.trash.list,
    { kind: segment },
    { initialNumItems: TRASH_PAGE },
  );
  const restore = useProjekatMutation(api.prostor.trash.restore);
  const dismissRecovered = useProjekatMutation(api.prostor.trash.dismissRecovered);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  // Fokus posle „Vrati"/„Ukloni" (DIZAJN-SMIRENJE, K07 §5.4): kad red stvarno
  // nestane iz liste, fokus ide na red koji je zauzeo njegovo mesto, a kad je
  // lista prazna — na karticu segmenta. Ključ se računa PRE mutacije.
  const pendingFocusRef = useRef<{ removedKey: string; nextKey: string | null } | null>(null);
  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    if (results.some((item) => trashItemKey(item) === pending.removedKey)) return;
    pendingFocusRef.current = null;
    const next = pending.nextKey
      ? listRef.current?.querySelector<HTMLElement>(
          `[data-trash-key="${CSS.escape(pending.nextKey)}"] [data-trash-action]:not(:disabled)`,
        )
      : null;
    (next ?? document.querySelector<HTMLElement>(`[data-trash-tab="${segment}"]`))?.focus();
  }, [results, segment]);

  function armFocus(key: string, index: number) {
    pendingFocusRef.current = {
      removedKey: key,
      nextKey: focusKeyAfterRemoval(results.map(trashItemKey), index),
    };
  }

  /** Neuspeh: dugme je bilo onemogućeno dok radi, pa mu se fokus vraća. */
  function refocus(key: string) {
    pendingFocusRef.current = null;
    window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-trash-key="${CSS.escape(key)}"] [data-trash-action]:not(:disabled)`)
        ?.focus();
    });
  }

  async function handleRestore(item: RestorableTrashItem, index: number) {
    const key = trashItemKey(item);
    setBusyKey(key);
    armFocus(key, index);
    try {
      const result = await restore({ target: restoreTarget(item) });
      const message = restoredMessage({ ...result, title: trashItemTitle(item) });
      const target = openTargetAfterRestore(item);
      toast.success(message, { action: { label: "Otvori", onClick: () => onOpen(target) } });
      setAnnouncement(message);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Vraćanje nije uspelo. Pokušaj ponovo."));
      refocus(key);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDismiss(item: RecoveredTrashItem, index: number) {
    const key = trashItemKey(item);
    setBusyKey(key);
    armFocus(key, index);
    try {
      await dismissRecovered({ recoveredId: item.recoveredId });
      const message = "Uklonjeno iz Oporavljenog.";
      toast.success(message);
      setAnnouncement(message);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Uklanjanje nije uspelo. Pokušaj ponovo."));
      refocus(key);
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <TrashList
      segment={segment}
      now={now}
      state={
        status === "LoadingFirstPage"
          ? { status: "loading" }
          : {
              status: "ready",
              items: results,
              loadMore:
                status === "CanLoadMore" || status === "LoadingMore"
                  ? { busy: status === "LoadingMore", onLoad: () => loadMore(TRASH_PAGE) }
                  : null,
            }
      }
      busyKey={busyKey}
      onRestore={(item, index) => void handleRestore(item, index)}
      onDismiss={(item, index) => void handleDismiss(item, index)}
      listRef={listRef}
      announcement={announcement}
    />
  );
}

/**
 * Greška upita liste ostaje u listi (kartice segmenata i ostatak ljuske rade);
 * „Pokušaj ponovo" ponovo montira listu, čime se pretplata pravi iznova.
 */
class TrashListBoundary extends Component<
  { children: ReactNode; segment: TrashKind; now: number },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <TrashList
        segment={this.props.segment}
        now={this.props.now}
        state={{ status: "error", onRetry: () => this.setState({ failed: false }) }}
        busyKey={null}
        onRestore={() => undefined}
        onDismiss={() => undefined}
      />
    );
  }
}
