"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  ChevronDown,
  MessageCircle,
  MessageSquareOff,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FeedbackLine } from "@/components/app/feedback";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommentThread, convexMessage } from "./comment-thread";

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
export function PostCommentsPanel({
  mediaId,
  commentCount,
  commentsEnabled,
  deleted,
}: {
  mediaId: string;
  commentCount: number;
  /** Undefined until a sync has asked Instagram — shown as its own state. */
  commentsEnabled?: boolean;
  deleted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const threads = useQuery(
    api.igCommentsStore.listThreads,
    open ? { mediaId, filter: "all" as const, limit: 50 } : "skip",
  );

  // A post Instagram no longer has cannot be moderated, and its switch would
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

        <CommentsEnabledSwitch
          mediaId={mediaId}
          commentsEnabled={commentsEnabled}
        />
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
                <CommentThread key={thread._id} thread={thread} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The `comment_enabled` switch.
 *
 * Optimistic like the hide button, and for the same reason: the round trip to
 * Instagram is long enough that a switch which waits for it reads as broken. If
 * the call fails the switch goes back where it was and says why.
 */
function CommentsEnabledSwitch({
  mediaId,
  commentsEnabled,
}: {
  mediaId: string;
  commentsEnabled?: boolean;
}) {
  const setEnabled = useAction(api.igComments.setCommentsEnabled);
  const [override, setOverride] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Undefined means no sync has asked yet. Assuming "on" is the honest guess —
  // it is Instagram's default and what the post almost certainly is — and the
  // next sync replaces the guess with the answer.
  const actual = commentsEnabled ?? true;
  const value = override ?? actual;
  const unknown = commentsEnabled === undefined;

  const change = async (next: boolean) => {
    setOverride(next);
    setError(null);
    try {
      await setEnabled({ mediaId, enabled: next });
      setOverride(null);
    } catch (err) {
      setOverride(null);
      setError(
        convexMessage(
          err,
          next
            ? "Uključivanje komentara nije uspelo."
            : "Isključivanje komentara nije uspelo.",
        ),
      );
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-xs">
        <span
          className={cn(
            "font-medium",
            value ? "text-text-muted" : "text-warning",
          )}
        >
          {value ? "Komentari uključeni" : "Komentari isključeni"}
        </span>
        <Switch
          checked={value}
          onCheckedChange={(next) => void change(next)}
          aria-label="Komentari na objavi"
        />
      </label>

      {!value && (
        <span className="inline-flex items-center gap-1 text-micro text-warning">
          <MessageSquareOff className="size-3" aria-hidden />
          Niko ne može da komentariše ovu objavu
        </span>
      )}

      {unknown && value && (
        <span className="text-micro text-text-muted">
          Stanje se potvrđuje pri sledećoj sinhronizaciji
        </span>
      )}

      {error && <FeedbackLine tone="danger">{error}</FeedbackLine>}
    </div>
  );
}
