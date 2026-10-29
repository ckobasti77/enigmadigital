"use client";

// Preneto iz Devotion apps/web/components/collab/revision-history-drawer.tsx (main @ c05c40f), SPAJANJE S11.
import { Component, useState, type ReactNode } from "react";
import type { FunctionArgs } from "convex/server";
import { toast } from "@/lib/toast";

import { Drawer } from "@/components/ui/drawer";
import { RichTextEditor } from "@/components/app/prostor/editor";
import { conflictFromError, type ConflictInfo } from "@/lib/prostor/modeli/page-autosave-model";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

import { restoreOutcomeMessage } from "@/lib/prostor/modeli/collab-model";
import { ConflictDialog } from "@/components/app/prostor/saradnja/conflict-dialog";
import {
  RestoreConfirmDialog,
  RevisionList,
  RevisionPreview,
  type RevisionDetail,
  type RevisionSummary,
} from "@/components/app/prostor/saradnja/revision-history";
import { useProjekatPaginatedQuery } from "@/components/app/prostor/podaci/projekat";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";

export type RevisionTarget = FunctionArgs<typeof api.prostor.history.list>["target"];

/** Revizija po strani (server prima najviše 50). */
const HISTORY_PAGE = 20;

/**
 * Istorija izmena — fioka s desna (PROSTOR P2, K07 §6.2) nad `history.list`
 * (20 po strani), `history.get` (pregled) i `history.restore` („Vrati ovu
 * verziju" uz potvrdu). Vraćanje pravi NOVU reviziju; konflikt otvara isti
 * dijalog kao čuvanje („Prepiši" ponavlja vraćanje nad najnovijom verzijom).
 */
export function RevisionHistoryDrawer({
  open,
  onOpenChange,
  target,
  currentRevision,
  blockedReason,
  richPreview = false,
  memberName,
  now,
  returnFocusFallback,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: RevisionTarget;
  /** Revizija koju gledalac vidi (`expectedRevision` za stranicu i opis oblasti). */
  currentRevision: number;
  /** Zašto vraćanje trenutno nije moguće (npr. izmene čekaju); `null` = moguće. */
  blockedReason: string | null;
  /** Sadržaj je HTML beleške — pregled kroz editor samo za čitanje. */
  richPreview?: boolean;
  memberName: (profileId: string | null) => string | null;
  now: number;
  /** Kuda fokus kad element koji je otvorio fioku više ne postoji (stavka menija). */
  returnFocusFallback?: () => HTMLElement | null;
}) {
  const [attempt, setAttempt] = useState(0);
  // Sadržaj ostaje montiran dok fioka izlazi (inače klizi prazna).
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Istorija izmena"
      width="28rem"
      returnFocusFallback={returnFocusFallback}
      onExited={() => setPresent(false)}
    >
      {present ? (
        <HistoryBoundary key={attempt} onRetry={() => setAttempt((value) => value + 1)}>
          <HistoryBody
            target={target}
            currentRevision={currentRevision}
            blockedReason={blockedReason}
            richPreview={richPreview}
            memberName={memberName}
            now={now}
          />
        </HistoryBoundary>
      ) : null}
    </Drawer>
  );
}

function HistoryBody({
  target,
  currentRevision,
  blockedReason,
  richPreview,
  memberName,
  now,
}: {
  target: RevisionTarget;
  currentRevision: number;
  blockedReason: string | null;
  richPreview: boolean;
  memberName: (profileId: string | null) => string | null;
  now: number;
}) {
  const { results, status, loadMore } = useProjekatPaginatedQuery(
    api.prostor.history.list,
    { target },
    { initialNumItems: HISTORY_PAGE },
  );
  const restore = useProjekatMutation(api.prostor.history.restore);
  const [selectedId, setSelectedId] = useState<Id<"contentRevisions"> | null>(null);
  // Red koji je otvorio pregled — „Sve verzije" mu vraća fokus.
  const [returnId, setReturnId] = useState<Id<"contentRevisions"> | null>(null);
  const detail = useProjekatQuery(api.prostor.history.get, selectedId ? { revisionId: selectedId } : "skip");
  const [confirming, setConfirming] = useState<RevisionDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<{ info: ConflictInfo; revision: RevisionDetail } | null>(null);

  async function runRestore(revision: RevisionDetail, expectedRevision: number) {
    setBusy(true);
    try {
      const result = await restore({ revisionId: revision._id, expectedRevision });
      toast.success(restoreOutcomeMessage(result.changed, revision.updatedAt, Date.now()));
      setConfirming(null);
      setConflict(null);
      setSelectedId(null);
    } catch (error) {
      const found = conflictFromError(error);
      setConfirming(null);
      if (found) setConflict({ info: found, revision });
      else toast.error(accessErrorMessage(error, "Verzija nije vraćena."));
    } finally {
      setBusy(false);
    }
  }

  const listState =
    status === "LoadingFirstPage"
      ? ({ status: "loading" } as const)
      : ({
          status: "ready",
          items: results,
          loadMore:
            status === "CanLoadMore" || status === "LoadingMore"
              ? { busy: status === "LoadingMore", onLoad: () => loadMore(HISTORY_PAGE) }
              : null,
        } as const);

  return (
    <>
      {selectedId === null ? (
        <RevisionList
          state={listState}
          now={now}
          focusId={returnId}
          onSelect={(revision: RevisionSummary) => {
            setReturnId(revision._id);
            setSelectedId(revision._id);
          }}
        />
      ) : (
        <RevisionPreview
          state={detail === undefined ? { status: "loading" } : { status: "ready", revision: detail }}
          now={now}
          onBack={() => setSelectedId(null)}
          focusBackOnMount
          preview={
            richPreview && detail ? (
              <RichTextEditor
                key={detail._id}
                documentKey={`revision:${detail._id}`}
                content={detail.content}
                editable={false}
                onChange={() => {}}
              />
            ) : undefined
          }
          blockedReason={blockedReason}
          onRestore={setConfirming}
        />
      )}
      <RestoreConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirming(null);
        }}
        revisionAt={confirming?.updatedAt ?? now}
        now={now}
        busy={busy}
        onConfirm={() => {
          if (confirming) void runRestore(confirming, currentRevision);
        }}
      />
      <ConflictDialog
        open={conflict !== null}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
        subject={target.kind === "area" ? "area" : "page"}
        updaterName={memberName(conflict?.info.updatedByProfileId ?? null)}
        updatedAt={conflict?.info.updatedAt ?? null}
        now={now}
        busy={busy}
        onLoadLatest={() => setConflict(null)}
        onOverwrite={() => {
          if (!conflict) return;
          void runRestore(conflict.revision, conflict.info.currentRevision ?? currentRevision);
        }}
      />
    </>
  );
}

class HistoryBoundary extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <RevisionList state={{ status: "error", onRetry: this.props.onRetry }} now={0} onSelect={() => {}} />;
  }
}
