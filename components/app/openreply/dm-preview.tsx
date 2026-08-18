import { CornerDownRight, ExternalLink, Send } from "lucide-react";
import { composeDmMessage } from "@/convex/lib/orMessage";
import { cn } from "@/lib/utils";

type PreviewButton = {
  label: string;
  type: "url" | "postback";
  url?: string | null;
};

type PreviewQuickReply = {
  label: string;
};

/**
 * The message exactly as the commenter receives it.
 *
 * The body is built with the same `composeDmMessage` the send action uses, so
 * the preview can't drift from what Instagram actually delivers — including
 * the blank line before the link block and the "Naziv: url" form.
 *
 * Buttons and quick replies are drawn the way Instagram draws them, because
 * that difference is the whole reason to pick one over the other: buttons stay
 * attached to the message, chips sit loose under it and vanish once tapped.
 */
export function DmPreview({
  message,
  linkUrl,
  linkDestination,
  linkLabel,
  publicReply,
  buttons = [],
  quickReplies = [],
  caption,
  compact = false,
  className,
}: {
  message: string;
  linkUrl?: string | null;
  /**
   * The raw address behind `linkUrl`, when the two differ because `linkUrl` is
   * already the tracked short link. Only used to recognise a button that points
   * at the same place.
   */
  linkDestination?: string | null;
  linkLabel?: string | null;
  publicReply?: string | null;
  buttons?: PreviewButton[];
  quickReplies?: PreviewQuickReply[];
  /** What this bubble is, when it is not the automation's own message. */
  caption?: string;
  compact?: boolean;
  className?: string;
}) {
  // A url button already carries the link, exactly as the send path decides it,
  // so printing it in the text right above the button would only repeat it.
  const linkOnButton = buttons.some(
    (button) =>
      button.type === "url" &&
      (button.url === linkUrl || button.url === linkDestination),
  );

  const body = composeDmMessage(
    message,
    linkOnButton ? undefined : (linkUrl ?? undefined),
    linkLabel ?? undefined,
  );
  // Two lines is all the card gets, and the blank line before the link block
  // would eat one of them — close it up so the link still shows.
  const display = compact ? body.replace(/\n{2,}/g, "\n") : body;

  const namedButtons = buttons.filter(
    (button) => button.label.trim().length > 0,
  );
  const namedQuickReplies = quickReplies.filter(
    (quickReply) => quickReply.label.trim().length > 0,
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!compact && (
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Send className="size-3" aria-hidden />
          <span>{caption ?? "Direktna poruka koju autor komentara dobija"}</span>
        </div>
      )}

      <div className="w-fit max-w-full">
        <div
          className={cn(
            // A DM bubble: rounded except the corner it "comes from".
            "rounded-2xl rounded-bl-sm border border-line-soft bg-surface-raised px-3.5 py-2.5",
            compact ? "text-xs" : "text-sm",
            // Buttons hang off the bottom of the same bubble.
            namedButtons.length > 0 && "rounded-b-none border-b-0",
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

        {namedButtons.length > 0 && (
          <div className="overflow-hidden rounded-b-2xl border border-t-0 border-line-soft bg-surface-raised">
            {namedButtons.map((button, index) => (
              <div
                key={index}
                className="flex items-center justify-center gap-1.5 border-t border-line-soft px-3.5 py-2 text-xs font-medium text-accent-400"
              >
                {button.type === "url" && (
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                )}
                <span className="truncate">{button.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {namedQuickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {namedQuickReplies.map((quickReply, index) => (
            <span
              key={index}
              className="max-w-full truncate rounded-full border border-accent-400/40 px-2.5 py-1 text-xs font-medium text-accent-400"
            >
              {quickReply.label}
            </span>
          ))}
        </div>
      )}

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
