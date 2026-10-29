"use client";

// Preneto iz Devotion apps/web/components/collab/comments-section.tsx (main @ c05c40f), SPAJANJE S11.
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { FunctionArgs } from "convex/server";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { compactComments } from "@/lib/prostor/modeli/collab-model";
import { CommentComposer, type CommentPayload, type MentionMember } from "@/components/app/prostor/saradnja/comment-composer";
import { CommentList, type CommentItem } from "@/components/app/prostor/saradnja/comment-list";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatPaginatedQuery } from "@/components/app/prostor/podaci/projekat";

export type CommentTarget = FunctionArgs<typeof api.prostor.comments.list>["target"];

/**
 * Kompaktan prikaz učitava ostatak liste da bi pokazao PRAVA poslednja tri (lista
 * je rastuća); preko ove granice ne učitava dalje i pokazuje samo „Svi komentari".
 */
const COMPACT_LOAD_MAX = 200;

/** Komentara po strani (lista je rastuća; „Učitaj još" na dnu donosi novije). */
const COMMENTS_PAGE = 20;

export type CommentsCount = { count: number; capped: boolean };

/**
 * Komentari stavke — kontejner (PROSTOR P5, K07 §6.1) nad `comments.list/add/
 * update/remove/restore`. Lista ima svoju granicu greške („Pokušaj ponovo"
 * ponovo montira upit); unos radi i kad lista padne. Uklanjanje nudi
 * „Poništi" dok traje rok servera (`undoUntil`).
 */
export function CommentsSection({
  target,
  members,
  selfProfileId,
  now,
  headingId,
  onCountChange,
  compact,
  className,
}: {
  target: CommentTarget;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  now: number;
  headingId?: string;
  onCountChange?: (count: CommentsCount | null) => void;
  /**
   * Kompaktan prikaz (panel zadatka, K07 §5.7): poslednja tri komentara i
   * „Svi komentari" koji vodi na punu stranu. Unos i izmena rade isto.
   */
  compact?: { onShowAll: () => void };
  className?: string;
}) {
  const add = useProjekatMutation(api.prostor.comments.add);
  const [attempt, setAttempt] = useState(0);
  const [count, setCount] = useState<CommentsCount | null>(null);
  // Uvećava se posle slanja: lista učita do kraja i pokaže nov komentar.
  const [revealSignal, setRevealSignal] = useState(0);
  // Najava uspešnog slanja za čitač ekrana (greška se najavljuje u polju).
  const [announcement, setAnnouncement] = useState("");
  const targetKey = `${target.kind}:${target.id}`;

  useEffect(() => {
    onCountChange?.(count);
  }, [count, onCountChange]);

  // Greška slanja se prikazuje u polju (tekst ostaje), bez dodatnog toasta.
  async function submit(payload: CommentPayload) {
    await add({
      target,
      content: payload.content,
      mentionProfileIds: payload.mentionProfileIds as Array<Id<"profiles">>,
    });
    setRevealSignal((value) => value + 1);
    // Prvo prazno pa tekst, da se ista poruka najavi i drugi put zaredom.
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement("Komentar je poslat."), 50);
  }

  return (
    <CommentsPanel
      headingId={headingId}
      headingAs={compact ? "h3" : "h2"}
      className={className}
      count={count === null ? null : `${count.count}${count.capped ? "+" : ""}`}
      composer={
        <>
          <CommentComposer members={members} selfProfileId={selfProfileId} onSubmit={submit} />
          <p role="status" className="sr-only">
            {announcement}
          </p>
        </>
      }
    >
      <CommentsBoundary
        key={`${targetKey}:${attempt}`}
        onRetry={() => setAttempt((value) => value + 1)}
        onError={() => setCount(null)}
      >
        <CommentsLoader
          target={target}
          members={members}
          selfProfileId={selfProfileId}
          now={now}
          onCount={setCount}
          revealSignal={revealSignal}
          compact={compact}
        />
      </CommentsBoundary>
    </CommentsPanel>
  );
}

/** Sekcija „Komentari" — prezentacija: naslov sa brojem, lista (`children`) i unos. */
export function CommentsPanel({
  headingId,
  headingAs,
  count,
  children,
  composer,
  className,
}: {
  headingId?: string;
  /** Naslov sekcije u fioci je `h3` (ispod naslova panela). */
  headingAs?: "h2" | "h3";
  count: string | null;
  children: ReactNode;
  composer: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={headingId} className={cn("scroll-mt-20", className)}>
      <SectionHeading id={headingId} title="Komentari" count={count} as={headingAs} />
      {children}
      <div className="mt-3">{composer}</div>
    </section>
  );
}

function CommentsLoader({
  target,
  members,
  selfProfileId,
  now,
  onCount,
  revealSignal,
  compact,
}: {
  target: CommentTarget;
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  now: number;
  onCount: (count: CommentsCount | null) => void;
  revealSignal: number;
  compact?: { onShowAll: () => void };
}) {
  const { results, status, loadMore } = useProjekatPaginatedQuery(
    api.prostor.comments.list,
    { target },
    { initialNumItems: COMMENTS_PAGE },
  );
  const update = useProjekatMutation(api.prostor.comments.update);
  const remove = useProjekatMutation(api.prostor.comments.remove);
  const restore = useProjekatMutation(api.prostor.comments.restore);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loading = status === "LoadingFirstPage";
  const hasMore = status === "CanLoadMore" || status === "LoadingMore";
  const isCompact = compact !== undefined;
  // Lista je rastuća, pa su „poslednja tri" na kraju: kompaktan prikaz učitava
  // ostatak (po 50) da bi pokazao prave poslednje, a ne prve komentare.
  useEffect(() => {
    if (isCompact && status === "CanLoadMore" && results.length < COMPACT_LOAD_MAX) loadMore(50);
  }, [isCompact, loadMore, results.length, status]);
  const compactView = isCompact ? compactComments(results) : null;
  const compactCapped = isCompact && hasMore && results.length >= COMPACT_LOAD_MAX;
  // Dok se ostatak učitava, kompaktan prikaz je u učitavanju (ne pokazuje stare), a broj
  // u naslovu se ne javlja (inače bi treperio „20+ / 70+ / 120+").
  const compactLoading = isCompact && hasMore && !compactCapped;
  useEffect(() => {
    onCount(loading || compactLoading ? null : { count: results.length, capped: hasMore });
  }, [compactLoading, hasMore, loading, onCount, results.length]);

  // Lista je rastuća: nov komentar je na kraju, iza „Učitaj još". Posle slanja
  // se učita ostatak (po 50) i poslednji komentar se dovede u vidno polje.
  const revealedRef = useRef(revealSignal);
  const sectionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (revealSignal === revealedRef.current) return;
    if (status === "CanLoadMore") {
      loadMore(50);
      return;
    }
    if (status !== "Exhausted") return;
    revealedRef.current = revealSignal;
    sectionRef.current
      ?.querySelector("[data-comment-id]:last-of-type")
      ?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia(MOTION_QUERIES.still).matches ? "auto" : "smooth",
      });
  }, [loadMore, results.length, revealSignal, status]);

  async function saveEdit(comment: CommentItem, payload: CommentPayload) {
    try {
      await update({
        commentId: comment._id,
        content: payload.content,
        mentionProfileIds: payload.mentionProfileIds as Array<Id<"profiles">>,
      });
      setEditingId(null);
    } catch (error) {
      // Poruka je u polju izmene; tekst ostaje.
      throw error;
    }
  }

  function removeComment(comment: CommentItem) {
    void remove({ commentId: comment._id })
      .then(({ undoUntil }) => {
        toast.success("Komentar je uklonjen.", {
          duration: Math.max(2_000, undoUntil - Date.now()),
          action: {
            label: "Poništi",
            onClick: () =>
              void restore({ commentId: comment._id }).catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Komentar nije vraćen.")),
              ),
          },
        });
      })
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Komentar nije uklonjen.")));
  }

  return (
    <div ref={sectionRef}>
    {compactCapped ? null : (
    <CommentList
      state={
        loading || compactLoading
          ? { status: "loading" }
          : {
              status: "ready",
              items: compactView ? compactView.shown : results,
              loadMore:
                hasMore && !isCompact
                  ? { busy: status === "LoadingMore", onLoad: () => loadMore(COMMENTS_PAGE) }
                  : null,
            }
      }
      now={now}
      members={members}
      selfProfileId={selfProfileId}
      editingId={editingId}
      onStartEdit={(comment) => setEditingId(comment._id)}
      onCancelEdit={() => setEditingId(null)}
      onSaveEdit={saveEdit}
      onRemove={removeComment}
    />
    )}
    {compact && compactCapped ? (
      <ShowAllCommentsButton count={`${results.length}+`} onClick={compact.onShowAll} />
    ) : compact && compactView && compactView.hidden > 0 && !compactLoading ? (
      <ShowAllCommentsButton count={results.length} onClick={compact.onShowAll} />
    ) : null}
    </div>
  );
}

/** „Svi komentari" ispod kompaktne liste (panel zadatka) — vodi na punu stranu. */
export function ShowAllCommentsButton({ count, onClick }: { count: number | string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="-ml-2 mt-1 text-text-secondary" onClick={onClick}>
      Svi komentari
      <span className="tabular-nums">{count}</span>
    </Button>
  );
}

/** Pad liste komentara ne obara stranicu: poruka i „Pokušaj ponovo" u bloku. */
class CommentsBoundary extends Component<
  { children: ReactNode; onRetry: () => void; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <CommentList
        state={{ status: "error", onRetry: this.props.onRetry }}
        now={0}
        members={[]}
        selfProfileId={null}
        editingId={null}
        onStartEdit={() => {}}
        onCancelEdit={() => {}}
        onSaveEdit={async () => {}}
        onRemove={() => {}}
      />
    );
  }
}
