import { CornerDownRight, ShieldCheck, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The reply exactly as it appears under the video.
 *
 * Same job as OpenReply's `DmPreview`, different medium: nothing here is
 * private. A YouTube reply is a public comment nested under someone else's,
 * signed with the channel's own name and visible to everyone who scrolls that
 * far — which is why the preview draws the channel row rather than a chat
 * bubble. Whoever writes the text should see whose face is on it.
 */
export function YtCommentPreview({
  message,
  channelName = "Tvoj kanal",
  moderationLabel,
  compact = false,
  className,
}: {
  message: string;
  /** Whose name the reply is signed with. */
  channelName?: string;
  /** What happens to the original comment, when the automation moderates it. */
  moderationLabel?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const text = message.trim();
  const initial = channelName.trim().charAt(0).toUpperCase() || "K";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <CornerDownRight className="size-3" aria-hidden />
          <span>Javni odgovor ispod komentara na YouTube-u</span>
        </div>
      )}

      <div className="flex gap-2.5">
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-accent-400/10 font-medium text-accent-400",
            compact ? "size-6 text-xs" : "size-8 text-sm",
          )}
          aria-hidden
        >
          {initial}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span
              className={cn(
                "font-medium text-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {channelName}
            </span>
            {/* YouTube badges the channel owner on its own videos. */}
            <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-xs text-text-muted">
              Autor
            </span>
            <span className="text-xs text-text-muted">sada</span>
          </p>

          {text.length > 0 ? (
            <p
              className={cn(
                "mt-0.5 leading-relaxed break-words whitespace-pre-line text-foreground",
                compact ? "line-clamp-2 text-xs" : "text-sm",
              )}
            >
              {text}
            </p>
          ) : (
            <p
              className={cn(
                "mt-0.5 text-muted-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              Odgovor još nije napisan.
            </p>
          )}

          {!compact && (
            <p className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="size-3" aria-hidden />0
              </span>
              <span>Odgovori</span>
              <span className="font-mono tabular-nums">
                {text.length} karaktera
              </span>
            </p>
          )}
        </div>
      </div>

      {moderationLabel ? (
        <p className="flex items-start gap-1.5 text-xs text-text-muted">
          <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
          <span className="leading-relaxed">
            <span>Komentar se: </span>
            <span className="text-muted-foreground">{moderationLabel}</span>
          </span>
        </p>
      ) : null}
    </div>
  );
}
