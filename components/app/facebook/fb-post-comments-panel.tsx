"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { ChevronDown, MessageCircle, ThumbsUp } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FeedbackLine } from "@/components/app/feedback";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FbCommentThread, convexMessage } from "./fb-comment-thread";

/**
 * Comments on one post, on the post's own card.
 *
 * The moderation screen is for working through a queue across every post; this
 * is for the opposite question — "what is going on under THIS one" — which is
 * asked while looking at the post and would otherwise mean leaving it.
 *
 * Nothing is fetched until it is opened. A grid of thirty cards each holding a
 * live subscription to its own comments would cost thirty subscriptions to show
 * nothing.
 */
export function FbPostCommentsPanel({
  postId,
  commentCount,
  likedByUs,
  deleted,
}: {
  postId: string;
  commentCount: number;
  /** Undefined until the Page has liked or unliked it from here. */
  likedByUs?: boolean;
  deleted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const threads = useQuery(
    api.fbCommentsStore.listThreads,
    open ? { postId, filter: "all" as const, limit: 50 } : "skip",
  );

  // A post Facebook no longer has cannot be moderated, and its buttons would
  // fail on every press. The count stays visible — it was true.
  if (deleted) {
    return (
      <div className="mt-3 flex items-center gap-1.5 border-t border-line-soft pt-3 text-xs text-text-muted">
        <MessageCircle className="size-3.5" aria-hidden />
        <span className="font-mono tabular-nums">
          {formatNumber(commentCount)}
        </span>
        <span>komentara na obrisanoj objavi</span>
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-line-soft pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="-ml-2 gap-1.5 text-text-muted hover:text-foreground"
        >
          <MessageCircle data-icon="inline-start" />
          <span className="font-mono tabular-nums">
            {formatNumber(commentCount)}
          </span>
          <span>{open ? "Sakrij komentare" : "Komentari"}</span>
          <ChevronDown
            className={cn(
              "transition-transform duration-(--duration-base) ease-(--ease-ui)",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </Button>

        <PostLikeButton postId={postId} likedByUs={likedByUs} />
      </div>

      {open && (
        <div className="mt-2 border-t border-line-soft">
          {threads === undefined ? (
            <div className="space-y-2 py-3">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3.5 w-full" />
            </div>
          ) : threads.length === 0 ? (
            <p className="py-3 text-xs text-text-muted">
              Nema zabeleženih komentara na ovoj objavi.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft">
              {threads.map((thread) => (
                <FbCommentThread key={thread._id} thread={thread} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Page's own like on the post.
 *
 * Optimistic like the hide button on a comment, and for the same reason: the
 * round trip to Facebook is long enough that a button which waits for it reads
 * as broken. If the call fails the state goes back and says why.
 *
 * `likedByUs` is undefined until this button has been used. Facebook's comments
 * and feed edges report how many people liked something, never whether WE did,
 * so an unknown state is drawn as "not liked" — which is what it is until
 * somebody presses it.
 */
function PostLikeButton({
  postId,
  likedByUs,
}: {
  postId: string;
  likedByUs?: boolean;
}) {
  const setPostLiked = useAction(api.fbComments.setPostLiked);
  const [override, setOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actual = likedByUs === true;
  const value = override === null || override === actual ? actual : override;

  const toggle = async () => {
    const next = !value;
    setOverride(next);
    setError(null);
    try {
      await setPostLiked({ postId, liked: next });
    } catch (err) {
      setOverride(null);
      setError(
        convexMessage(
          err,
          next ? "Lajkovanje nije uspelo." : "Sklanjanje lajka nije uspelo.",
        ),
      );
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        aria-pressed={value}
        onClick={() => void toggle()}
        className={cn(
          "text-text-muted hover:text-foreground",
          value && "text-accent-400 hover:text-accent-400",
        )}
      >
        <ThumbsUp data-icon="inline-start" />
        {value ? "Stranica je lajkovala" : "Lajkuj kao stranica"}
      </Button>

      {error && <FeedbackLine tone="danger">{error}</FeedbackLine>}
    </div>
  );
}
