import { CornerDownRight, Send } from "lucide-react";
import { composeDmMessage } from "@/convex/lib/orMessage";
import { cn } from "@/lib/utils";

/**
 * The message exactly as the commenter receives it.
 *
 * The body is built with the same `composeDmMessage` the send action uses, so
 * the preview can't drift from what Instagram actually delivers — including
 * the blank line before the link block and the "Naziv: url" form.
 */
export function DmPreview({
  message,
  linkUrl,
  linkLabel,
  publicReply,
  compact = false,
  className,
}: {
  message: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
  publicReply?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const body = composeDmMessage(
    message,
    linkUrl ?? undefined,
    linkLabel ?? undefined,
  );
  // Two lines is all the card gets, and the blank line before the link block
  // would eat one of them — close it up so the link still shows.
  const display = compact ? body.replace(/\n{2,}/g, "\n") : body;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Send className="size-3" aria-hidden />
          <span>Direktna poruka koju autor komentara dobija</span>
        </div>
      )}

      <div
        className={cn(
          // A DM bubble: rounded except the corner it "comes from".
          "w-fit max-w-full rounded-2xl rounded-bl-sm border border-line-soft bg-surface-raised px-3.5 py-2.5",
          compact ? "text-xs" : "text-sm",
        )}
      >
        {body.length > 0 ? (
          <p
            className={cn(
              "whitespace-pre-line break-words leading-relaxed text-foreground",
              compact && "line-clamp-2",
            )}
          >
            {display}
          </p>
        ) : (
          <p className="text-muted-foreground">Poruka još nije napisana.</p>
        )}
      </div>

      {!compact && (
        <p className="font-mono text-xs tabular-nums text-text-muted">
          {body.length} karaktera
        </p>
      )}

      {publicReply ? (
        <div
          className={cn(
            "flex items-start gap-1.5 text-text-muted",
            compact ? "text-xs" : "text-xs",
          )}
        >
          <CornerDownRight className="mt-0.5 size-3 shrink-0" aria-hidden />
          <p className="break-words leading-relaxed">
            <span className="text-text-muted">Javni odgovor: </span>
            <span className="text-muted-foreground">{publicReply}</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
