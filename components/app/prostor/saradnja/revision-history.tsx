"use client";

// Preneto iz Devotion apps/web/components/collab/revision-history.tsx (main @ c05c40f), SPAJANJE S11.
import { useEffect, useId, useRef, type ReactNode } from "react";
import { ArrowLeft, History, LoaderCircle, RotateCcw } from "lucide-react";
import { htmlToPlainText, revisionMeta } from "@/lib/prostor/revisions";
import type { FunctionReturnType } from "convex/server";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { api } from "@/convex/_generated/api";

import { groupRevisionsByDay, restoreConfirmTitle } from "@/lib/prostor/modeli/collab-model";

export type RevisionSummary = FunctionReturnType<typeof api.prostor.history.list>["page"][number];
export type RevisionDetail = FunctionReturnType<typeof api.prostor.history.get>;

export type RevisionListState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | {
      status: "ready";
      items: ReadonlyArray<RevisionSummary>;
      loadMore: { busy: boolean; onLoad: () => void } | null;
    };

function RevisionBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-md border border-line px-1.5 text-meta leading-5 text-text-secondary">
      {children}
    </span>
  );
}

/**
 * Lista revizija (K07 §6.2), najnovija prva, grupisana po danu: „Ana · pre
 * 5 min", oznaka „Zatečeno stanje"/„Vraćena verzija" i isečak od dva reda. Prva
 * je trenutna verzija. Klik otvara pregled u istoj fioci.
 */
export function RevisionList({
  state,
  now,
  onSelect,
  focusId = null,
}: {
  state: RevisionListState;
  now: number;
  onSelect: (revision: RevisionSummary) => void;
  /** Posle povratka iz pregleda fokus ide na red koji ga je otvorio. */
  focusId?: string | null;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready || focusId === null) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-revision-id="${CSS.escape(focusId)}"]`)
      ?.focus();
  }, [focusId, ready]);
  const groupIdBase = useId();
  if (state.status === "loading") {
    return (
      <div role="status" aria-label="Učitavanje istorije izmena" className="space-y-2">
        {[0, 1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 py-2 text-ui">
        <p className="text-text-secondary">Istorija izmena nije učitana.</p>
        <Button variant="outline" size="sm" onClick={state.onRetry}>
          Pokušaj ponovo
        </Button>
      </div>
    );
  }
  if (state.items.length === 0 && state.loadMore === null) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-ui text-text-secondary">
        <History className="size-5 text-text-muted" aria-hidden="true" />
        <p>Još nema izmena.</p>
      </div>
    );
  }
  const firstId = state.items[0]?._id;
  return (
    <div ref={listRef} className="space-y-4">
      {groupRevisionsByDay(state.items, now).map((group) => (
        <div key={group.key}>
          <h3 id={`${groupIdBase}-${group.key}`} className="mb-1 px-2 text-meta font-medium text-text-muted">
            {group.label}
          </h3>
          <ul className="space-y-0.5" aria-labelledby={`${groupIdBase}-${group.key}`}>
            {group.items.map((revision) => {
              const meta = revisionMeta(
                { kind: revision.kind, authorName: revision.author?.displayName ?? null, updatedAt: revision.updatedAt },
                now,
              );
              return (
                <li key={revision._id}>
                  <button
                    type="button"
                    data-revision-id={revision._id}
                    onClick={() => onSelect(revision)}
                    className="w-full rounded-lg px-2 py-2 text-left outline-none transition-colors hover:bg-surface-control-hover focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-ui font-medium text-foreground">{meta.title}</span>
                      {revision._id === firstId ? <RevisionBadge>Trenutna</RevisionBadge> : null}
                      {meta.badge ? <RevisionBadge>{meta.badge}</RevisionBadge> : null}
                    </span>
                    {revision.excerpt ? (
                      <span className="mt-0.5 line-clamp-2 text-meta leading-5 text-text-secondary">
                        {revision.excerpt}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-meta leading-5 text-text-muted">Bez sadržaja</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {state.loadMore ? (
        <Button variant="outline" size="sm" disabled={state.loadMore.busy} onClick={state.loadMore.onLoad}>
          {state.loadMore.busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {state.loadMore.busy ? "Učitavam…" : "Učitaj još"}
        </Button>
      ) : null}
    </div>
  );
}

export type RevisionPreviewState =
  | { status: "loading" }
  | { status: "ready"; revision: RevisionDetail };

/**
 * Pregled jedne verzije: ko i kad, naslov i sadržaj (`preview` za belešku je
 * editor samo za čitanje; ostalo tekst). „Vrati ovu verziju" kad je dozvoljeno,
 * inače onemogućeno uz razlog.
 */
export function RevisionPreview({
  state,
  now,
  onBack,
  preview,
  blockedReason,
  onRestore,
  focusBackOnMount = false,
}: {
  state: RevisionPreviewState;
  now: number;
  onBack: () => void;
  /** Pregled otvoren izborom reda: fokus na „Sve verzije" (red koji je kliknut nestaje). */
  focusBackOnMount?: boolean;
  /** Sadržaj beleške (editor samo za čitanje); bez njega se crta tekst. */
  preview?: ReactNode;
  /** Zašto vraćanje nije moguće (zaključano, izmene čekaju); `null` = moguće. */
  blockedReason: string | null;
  onRestore: (revision: RevisionDetail) => void;
}) {
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusBackOnMount) backRef.current?.focus();
  }, [focusBackOnMount]);
  return (
    <div className="space-y-4">
      <Button ref={backRef} type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft aria-hidden="true" />
        Sve verzije
      </Button>
      {state.status === "loading" ? (
        <div role="status" aria-label="Učitavanje verzije" className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      ) : (
        <RevisionPreviewBody
          revision={state.revision}
          now={now}
          preview={preview}
          blockedReason={blockedReason}
          onRestore={onRestore}
        />
      )}
    </div>
  );
}

function RevisionPreviewBody({
  revision,
  now,
  preview,
  blockedReason,
  onRestore,
}: {
  revision: RevisionDetail;
  now: number;
  preview?: ReactNode;
  blockedReason: string | null;
  onRestore: (revision: RevisionDetail) => void;
}) {
  const meta = revisionMeta(
    { kind: revision.kind, authorName: revision.author?.displayName ?? null, updatedAt: revision.updatedAt },
    now,
  );
  const reason = revision.canRestore ? blockedReason : (blockedReason ?? "Stranica je zaključana.");
  const text = htmlToPlainText(revision.content);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-ui font-medium text-foreground">{meta.title}</p>
        {meta.badge ? <RevisionBadge>{meta.badge}</RevisionBadge> : null}
      </div>
      <div className="space-y-1">
        <Button variant="secondary" type="button" size="sm" disabled={reason !== null} onClick={() => onRestore(revision)}>
          <RotateCcw aria-hidden="true" />
          Vrati ovu verziju
        </Button>
        {reason ? <p className="text-meta leading-5 text-text-secondary">{reason}</p> : null}
      </div>
      <article aria-label="Sadržaj verzije" className="border-t border-line-soft pt-4">
        {revision.title ? <h3 className="mb-2 text-copy font-semibold text-foreground">{revision.title}</h3> : null}
        {preview ?? (
          text ? (
            <p className="whitespace-pre-wrap break-words text-ui leading-6 text-foreground">{text}</p>
          ) : (
            <p className="text-ui text-text-secondary">Bez sadržaja.</p>
          )
        )}
        {revision.instructions ? (
          <div className="mt-4">
            <h4 className="mb-1 text-meta font-medium text-text-muted">Instrukcije</h4>
            <p className="whitespace-pre-wrap break-words text-ui leading-6 text-foreground">{revision.instructions}</p>
          </div>
        ) : null}
      </article>
    </>
  );
}

/** Potvrda „Vrati ovu verziju" — menja ono što ceo tim vidi (DIZAJN-SMIRENJE §5.6). */
export function RestoreConfirmDialog({
  open,
  onOpenChange,
  revisionAt,
  now,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  revisionAt: number;
  now: number;
  busy: boolean;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-[26rem]" initialFocus={() => cancelRef.current}>
        <DialogHeader>
          <DialogTitle>{restoreConfirmTitle(revisionAt, now)}</DialogTitle>
          <DialogDescription>Trenutni tekst ostaje u Istoriji izmena.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Otkaži
          </Button>
          <Button variant="primary" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            Vrati verziju
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
