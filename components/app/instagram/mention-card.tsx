"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  AtSign,
  CheckCircle2,
  CornerDownRight,
  ExternalLink,
  LoaderCircle,
  MessageSquare,
  Reply,
  Send,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackLine } from "@/components/app/feedback";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { convexMessage } from "./comment-thread";

export type MentionData = FunctionReturnType<
  typeof api.igMentionsStore.listMentions
>[number];

const REPLY_MAX = 2200;

function Avatar({ username }: { username?: string }) {
  const initial = (username?.trim()[0] ?? "@").toUpperCase();
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-line-soft bg-surface-raised text-xs font-semibold text-text-muted"
    >
      {initial}
    </span>
  );
}

function MentionReplyComposer({
  mentionId,
  onDone,
  onError,
}: {
  mentionId: MentionData["_id"];
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const reply = useAction(api.igMentions.replyToMention);
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
      await reply({ mentionId, message });
      setText("");
      onDone();
    } catch (err) {
      onError(convexMessage(err, "Odgovor na spominjanje nije poslat."));
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
        placeholder="Napiši javni odgovor na spominjanje…"
        aria-label="Javni odgovor na spominjanje"
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

export function MentionCard({ mention }: { mention: MentionData }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReplied = mention.repliedAt !== undefined;
  const isComment = mention.kind === "comment";

  return (
    <article
      className={cn(
        "border-l-2 py-3 pl-3.5 transition-opacity duration-(--duration-base)",
        isReplied ? "border-l-line" : "border-l-accent-400",
      )}
    >
      <div className="flex gap-3">
        <Avatar username={mention.authorUsername} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">
                {mention.authorUsername
                  ? `@${mention.authorUsername}`
                  : "Nepoznat nalog"}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-medium",
                  isComment
                    ? "bg-accent-400/10 text-accent-400"
                    : "bg-purple-500/10 text-purple-400",
                )}
              >
                {isComment ? (
                  <>
                    <MessageSquare className="size-3" aria-hidden />
                    Spominjanje u komentaru
                  </>
                ) : (
                  <>
                    <AtSign className="size-3" aria-hidden />
                    Spominjanje u opisu
                  </>
                )}
              </span>
              {isReplied && (
                <span className="inline-flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-micro font-medium text-success">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Odgovoreno
                </span>
              )}
            </div>

            <span className="font-mono text-micro tabular-nums text-text-muted">
              {mention.timestamp > 0
                ? formatRelativeTime(mention.timestamp)
                : "—"}
            </span>
          </div>

          <p className="mt-1 text-sm leading-relaxed break-words text-foreground">
            {mention.text || (
              <span className="italic text-text-muted">Bez teksta</span>
            )}
          </p>

          {mention.contextState !== "value" && (
            <p className="mt-1.5 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-micro leading-relaxed text-warning">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden />
              <span>
                {mention.contextReason ??
                  (mention.contextState === "suppressed"
                    ? "Izvorna objava je sa privatnog naloga."
                    : "Kontekst spominjanja trenutno nije dostupan.")}
              </span>
            </p>
          )}

          {mention.permalink && (
            <div className="mt-1.5 flex items-center gap-2">
              <a
                href={mention.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-micro font-medium text-text-muted transition-colors hover:text-accent-400"
              >
                Otvori na Instagramu
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </div>
          )}

          {/* Odgovor ako postoji */}
          {isReplied && mention.replyText && (
            <div className="mt-2.5 flex gap-2.5 border-l border-line-soft pl-3">
              <CornerDownRight
                className="mt-1.5 size-3.5 shrink-0 text-text-muted"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    Naš odgovor
                    <span className="rounded bg-accent-400/10 px-1.5 py-0.5 text-micro font-semibold text-accent-400">
                      Mi
                    </span>
                  </span>
                  <span className="font-mono text-micro tabular-nums text-text-muted">
                    {mention.repliedAt ? formatRelativeTime(mention.repliedAt) : "—"}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-relaxed break-words text-text-secondary">
                  {mention.replyText}
                </p>
              </div>
            </div>
          )}

          {/* Jedina dozvoljena radnja: Odgovori (bez sakrivanja i bez brisanja) */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-expanded={replyOpen}
              onClick={() => setReplyOpen((open) => !open)}
              className="text-text-muted hover:text-foreground"
            >
              <Reply data-icon="inline-start" />
              {isReplied ? "Ponovo odgovori" : "Odgovori"}
            </Button>
          </div>

          {replyOpen && (
            <MentionReplyComposer
              mentionId={mention._id}
              onDone={() => setReplyOpen(false)}
              onError={setError}
            />
          )}

          {error && (
            <FeedbackLine tone="danger" className="mt-2">
              {error}
            </FeedbackLine>
          )}
        </div>
      </div>
    </article>
  );
}
