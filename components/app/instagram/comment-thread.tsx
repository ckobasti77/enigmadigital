"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  Bot,
  CornerDownRight,
  ExternalLink,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
  Reply,
  Send,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackLine } from "@/components/app/feedback";
import { formatNumber, formatRelativeTime } from "@/lib/format";
import { useOptimisticToggle } from "@/lib/use-optimistic-toggle";
import { cn } from "@/lib/utils";

export type CommentThreadData = FunctionReturnType<
  typeof api.igCommentsStore.listThreads
>[number];

type CommentReply = CommentThreadData["replies"][number];

/** The reply field accepts what Instagram accepts, and says so at the edge. */
const REPLY_MAX = 2200;

export function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data?.message) return data.message;
  }
  return fallback;
}

/**
 * State of one thread, as a colour on its left edge.
 *
 * This is the only thing on the row that can be read without reading — at the
 * speed a queue is actually worked through, "is this waiting for me" has to
 * arrive before the text does. Cyan therefore means exactly one thing here, and
 * it is the interactive meaning the system already gives it: your turn.
 */
function railClass(thread: CommentThreadData): string {
  if (thread.deletedAt !== undefined) return "border-l-danger/60";
  if (thread.hidden) return "border-l-warning/60";
  if (thread.isOurs || thread.repliedByUs) return "border-l-line";
  return "border-l-accent-400";
}

/**
 * Stand-in for a profile picture. Instagram does not hand out a commenter's
 * avatar on this API at all, so rather than a grey circle that looks like a
 * failed image, the initial of the handle does the identifying.
 */
function Avatar({ username, ours }: { username: string; ours: boolean }) {
  const initial = (username.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
        ours
          ? "border-accent-400/40 bg-accent-400/10 text-accent-400"
          : "border-line-soft bg-surface-raised text-text-muted",
      )}
    >
      {initial}
    </span>
  );
}

function Handle({
  username,
  ours,
  automationName,
}: {
  username: string;
  ours: boolean;
  automationName?: string;
}) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="truncate text-sm font-semibold text-foreground">
        {username ? `@${username}` : ours ? "Naš nalog" : "Nepoznat nalog"}
      </span>
      {ours && (
        <span className="rounded bg-accent-400/10 px-1.5 py-0.5 text-micro font-semibold text-accent-400">
          Mi
        </span>
      )}
      {automationName && (
        <span className="inline-flex items-center gap-1 rounded bg-surface-raised px-1.5 py-0.5 text-micro font-medium text-text-muted">
          <Bot className="size-3" aria-hidden />
          {automationName}
        </span>
      )}
    </span>
  );
}

function Meta({
  timestamp,
  likeCount,
}: {
  timestamp: number;
  likeCount?: number;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2.5 font-mono text-micro tabular-nums text-text-muted">
      {likeCount !== undefined && likeCount > 0 && (
        // Read-only. Instagram has no endpoint for liking a comment at any
        // permission level, so this is a number and never a button.
        <span className="inline-flex items-center gap-1" title="Lajkovi">
          <Heart className="size-3" aria-hidden />
          {formatNumber(likeCount)}
        </span>
      )}
      <span>{timestamp > 0 ? formatRelativeTime(timestamp) : "—"}</span>
    </span>
  );
}

function DeletedTag({ at }: { at: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-danger/10 px-1.5 py-0.5 text-micro font-semibold text-danger">
      <Trash2 className="size-3" aria-hidden />
      Obrisano
      <span className="font-mono font-normal opacity-80">
        {formatRelativeTime(at)}
      </span>
    </span>
  );
}

function HiddenTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-micro font-semibold text-warning">
      <EyeOff className="size-3" aria-hidden />
      Sakriveno
    </span>
  );
}

function ReplyComposer({
  parentId,
  onDone,
  onError,
}: {
  parentId: string;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const reply = useAction(api.igComments.replyToComment);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const send = async () => {
    const message = text.trim();
    if (message.length === 0 || busy) return;
    setBusy(true);
    onError(null);
    try {
      await reply({ commentId: parentId, message });
      setText("");
      onDone();
    } catch (err) {
      onError(convexMessage(err, "Odgovor nije poslat."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2.5 flex flex-col gap-2 rounded-lg border border-line-soft bg-surface-raised/40 p-2.5">
      <Textarea
        ref={ref}
        value={text}
        maxLength={REPLY_MAX}
        rows={2}
        placeholder="Napiši javni odgovor…"
        aria-label="Javni odgovor na komentar"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onDone();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
        className="min-h-14 border-line-soft bg-transparent text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-micro tabular-nums text-text-muted">
          {text.trim().length} / {REPLY_MAX}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={busy}
          >
            Otkaži
          </Button>
          <Button
            type="button"
            size="sm"
            className="font-semibold"
            onClick={() => void send()}
            disabled={busy || text.trim().length === 0}
          >
            {busy ? (
              <>
                <LoaderCircle className="animate-spin" />
                Šaljem…
              </>
            ) : (
              <>
                <Send data-icon="inline-start" />
                Pošalji
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The actions available on one comment, top-level or reply. */
function CommentActions({
  commentId,
  text,
  hidden,
  deleted,
  automationName,
  canReply,
  replyOpen,
  onToggleReply,
  onError,
}: {
  commentId: string;
  text: string;
  hidden: boolean;
  deleted: boolean;
  automationName?: string;
  canReply: boolean;
  replyOpen: boolean;
  onToggleReply: () => void;
  onError: (message: string | null) => void;
}) {
  const setHidden = useAction(api.igComments.setCommentHidden);
  const remove = useAction(api.igComments.deleteComment);

  const flag = useOptimisticToggle(hidden);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nothing left to do to a comment that is already gone.
  if (deleted) return null;

  const toggleHidden = async () => {
    const next = !flag.value;
    onError(null);
    try {
      await flag.run(next, () => setHidden({ commentId, hidden: next }));
    } catch (err) {
      onError(
        convexMessage(
          err,
          next ? "Sakrivanje nije uspelo." : "Prikazivanje nije uspelo.",
        ),
      );
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    onError(null);
    try {
      await remove({
        commentId,
        // The dialog has already named the automation; this is the second yes
        // the backend refuses to act without.
        ...(automationName ? { acknowledgeAutomation: true } : {}),
      });
      setConfirming(false);
    } catch (err) {
      onError(convexMessage(err, "Brisanje nije uspelo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {canReply && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-expanded={replyOpen}
            onClick={onToggleReply}
            className="text-text-muted hover:text-foreground"
          >
            <Reply data-icon="inline-start" />
            Odgovori
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="xs"
          // Two quick presses would be two opposite writes to Instagram, and
          // whichever answered last would decide the state (V2/3).
          disabled={flag.pending}
          onClick={() => void toggleHidden()}
          className="text-text-muted hover:text-foreground"
        >
          {flag.value ? (
            <>
              <Eye data-icon="inline-start" />
              Prikaži
            </>
          ) : (
            <>
              <EyeOff data-icon="inline-start" />
              Sakrij
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setConfirming(true)}
          className="text-text-muted hover:text-danger"
        >
          <Trash2 data-icon="inline-start" />
          Obriši
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Obriši komentar?"
        confirmLabel="Obriši"
        busyLabel="Brišem…"
        busy={busy}
        onConfirm={() => void confirmDelete()}
        description={
          <>
            {automationName && (
              <span className="mb-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-warning">
                <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="text-xs leading-relaxed">
                  Ovaj odgovor je poslala automatizacija „{automationName}”.
                  Brisanje ne isključuje automatizaciju — ona će isto odgovoriti
                  i na sledeći komentar.
                </span>
              </span>
            )}
            <span className="mb-2 block rounded-lg border border-line-soft bg-surface-raised/60 px-3 py-2 text-xs leading-relaxed text-foreground">
              {text || "(komentar bez teksta)"}
            </span>
            Brisanje je trajno. Komentar nestaje sa Instagrama i ne može da se
            vrati. Ostaje zapisan u listi, prigušen, sa oznakom „Obrisano”.
          </>
        }
      />
    </>
  );
}

function ReplyRow({
  reply,
  onError,
}: {
  reply: CommentReply;
  onError: (message: string | null) => void;
}) {
  const deleted = reply.deletedAt !== undefined;

  return (
    <div
      className={cn(
        "flex gap-2.5 border-l border-line-soft pl-3 transition-opacity duration-(--duration-base)",
        deleted && "opacity-55",
      )}
    >
      <CornerDownRight
        className="mt-1.5 size-3.5 shrink-0 text-text-muted"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Handle
            username={reply.username}
            ours={reply.isOurs}
            automationName={reply.automationName}
          />
          <Meta timestamp={reply.timestamp} likeCount={reply.likeCount} />
        </div>

        <p className="mt-1 text-sm leading-relaxed break-words text-text-secondary">
          {reply.text || <span className="italic text-text-muted">Bez teksta</span>}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {deleted && <DeletedTag at={reply.deletedAt ?? 0} />}
          {reply.hidden && !deleted && <HiddenTag />}
        </div>

        <CommentActions
          commentId={reply.commentId}
          text={reply.text}
          hidden={reply.hidden}
          deleted={deleted}
          automationName={reply.automationName}
          canReply={false}
          replyOpen={false}
          onToggleReply={() => {}}
          onError={onError}
        />
      </div>
    </div>
  );
}

/**
 * One comment and everything under it.
 *
 * Used by both surfaces — the moderation screen and the panel inside a post
 * card — which is why the post label and the selection checkbox are optional
 * rather than two near-identical components.
 */
export function CommentThread({
  thread,
  selected,
  onSelectedChange,
  showPost = false,
  selectDisabled = false,
}: {
  thread: CommentThreadData;
  /** Omit to render the thread without a checkbox. */
  selected?: boolean;
  onSelectedChange?: (next: boolean) => void;
  showPost?: boolean;
  /**
   * The selection is full — one bulk action carries only so many comments, and
   * a checkbox that silently refuses is worse than one that says it cannot.
   */
  selectDisabled?: boolean;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleted = thread.deletedAt !== undefined;
  const selectable = onSelectedChange !== undefined;

  return (
    <article
      className={cn(
        "border-l-2 py-3 pl-3.5 transition-opacity duration-(--duration-base)",
        railClass(thread),
        deleted && "opacity-55",
      )}
    >
      <div className="flex gap-3">
        {selectable && (
          <Checkbox
            checked={selected ?? false}
            onCheckedChange={(next) => onSelectedChange(next)}
            disabled={deleted || (selectDisabled && selected !== true)}
            aria-label={`Izaberi komentar korisnika ${thread.username || "bez imena"}`}
            className="mt-1.5"
          />
        )}

        <Avatar username={thread.username} ours={thread.isOurs} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Handle
              username={thread.username}
              ours={thread.isOurs}
              automationName={thread.automationName}
            />
            <Meta timestamp={thread.timestamp} likeCount={thread.likeCount} />
          </div>

          <p className="mt-1 text-sm leading-relaxed break-words text-foreground">
            {thread.text || (
              <span className="italic text-text-muted">Bez teksta</span>
            )}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {deleted && <DeletedTag at={thread.deletedAt ?? 0} />}
            {thread.hidden && !deleted && <HiddenTag />}

            {showPost && (
              <span className="inline-flex max-w-full items-center gap-1 rounded bg-surface-raised px-1.5 py-0.5 text-micro text-text-muted">
                <span className="font-semibold uppercase tracking-wider">
                  {thread.media?.mediaType ?? "OBJAVA"}
                </span>
                <span className="truncate">
                  {thread.media?.caption?.trim()
                    ? thread.media.caption
                    : "bez opisa"}
                </span>
              </span>
            )}

            {thread.media?.permalink && (
              <a
                href={thread.media.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-micro font-medium text-text-muted transition-colors hover:text-accent-400"
              >
                Otvori na Instagramu
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>

          <CommentActions
            commentId={thread.commentId}
            text={thread.text}
            hidden={thread.hidden}
            deleted={deleted}
            automationName={thread.automationName}
            // Until a sync says whether this is a thread or somebody's reply,
            // there is no reply button: Instagram refuses a reply to a reply,
            // so offering one on a row we cannot place would only ever fail.
            canReply={thread.levelUnknown !== true}
            replyOpen={replyOpen}
            onToggleReply={() => setReplyOpen((open) => !open)}
            onError={setError}
          />

          {replyOpen && !deleted && (
            <ReplyComposer
              parentId={thread.commentId}
              onDone={() => setReplyOpen(false)}
              onError={setError}
            />
          )}

          {error && (
            <FeedbackLine tone="danger" className="mt-2">
              {error}
            </FeedbackLine>
          )}

          {thread.replies.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              {thread.replies.map((reply) => (
                <ReplyRow
                  key={reply._id}
                  reply={reply}
                  onError={setError}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
