"use client";

// Preneto iz Devotion apps/web/components/workspace/chat/entity-discussion-panel.tsx (main @ c05c40f), SPAJANJE S15.
import { useState } from "react";
import { ArrowRight, LoaderCircle, MessagesSquare, Send } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { StartupMember } from "@/lib/prostor/rute";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber } from "@/lib/format";
import { formatMessageTime, porukaWord, resolveMentions } from "@/lib/prostor/web/chat";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";
import { cn } from "@/lib/utils";

/**
 * „Diskusija" nad entitetom (stranica, zadatak, ideja). Zove
 * `chat.channelForAnchor`; kanal ne postoji dok neko ne pošalje prvu poruku,
 * pa slanje uvek ide preko `chat.sendToAnchor` (lenjo pravljenje niti). Kad
 * kanal postoji, panel pokazuje broj poruka i vodi na pun razgovor u Porukama
 * projekta (`/<projekat>/poruke?kanal=…`).
 *
 * Oba poziva su projektna, pa `workspaceId` ubacuju kuke projekta (Devotion
 * ga je primao kao prop).
 */
export function EntityDiscussionPanel({
  anchorType,
  anchorId,
  members,
  onOpenChannel,
  className,
}: {
  anchorType: "page" | "idea";
  anchorId: string;
  /** Kad je prosleđeno, `@Ime` u brzoj poruci razrešava pominjanja. */
  members?: StartupMember[];
  onOpenChannel?: (channelId: Id<"chatChannels">) => void;
  className?: string;
}) {
  const channel = useProjekatQuery(api.prostor.chat.channelForAnchor, {
    anchorType,
    anchorId,
  });
  const sendToAnchor = useProjekatMutation(api.prostor.chat.sendToAnchor);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  const loading = channel === undefined;
  const messageCount = channel?.messageCount ?? 0;

  const send = async () => {
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    try {
      await sendToAnchor({
        anchorType,
        anchorId,
        body,
        ...(members ? { mentions: resolveMentions(body, members) } : {}),
      });
      setDraft("");
    } catch (error) {
      toast.error(accessErrorMessage(error, "Poruka nije poslata."));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={className} aria-label="Diskusija">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <MessagesSquare className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-ui font-semibold text-foreground">Diskusija</h3>
            {loading ? (
              <div role="status" className="py-0.5">
                <span className="sr-only">Učitavanje…</span>
                <Skeleton aria-hidden="true" className="h-3.5 w-24" />
              </div>
            ) : (
              <p className="truncate text-meta text-text-muted">
                {messageCount === 0
                  ? "Još nema poruka."
                  : `${formatNumber(messageCount)} ${porukaWord(messageCount)}`}
              </p>
            )}
          </div>
        </div>
        {channel && onOpenChannel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => onOpenChannel(channel._id)}
          >
            Otvori razgovor
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-14 rounded-lg" />
      ) : channel && channel.lastMessagePreview ? (
        <button
          type="button"
          disabled={!onOpenChannel}
          onClick={() => onOpenChannel?.(channel._id)}
          className={cn(
            "mt-3 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-(--duration-fast)",
            "hover:bg-surface-control-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-default disabled:hover:bg-transparent",
          )}
        >
          {channel.lastMessageAuthor ? (
            <ProfileAvatar profile={channel.lastMessageAuthor} className="size-6 shrink-0" />
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-meta font-semibold text-foreground">
                {channel.lastMessageAuthor?.displayName ?? "Sistem"}
              </span>
              <time
                className="shrink-0 text-meta tabular-nums text-text-muted"
                dateTime={new Date(channel.lastMessageAt).toISOString()}
              >
                {formatMessageTime(channel.lastMessageAt)}
              </time>
            </span>
            <span className="mt-0.5 line-clamp-2 text-ui text-text-secondary">
              {channel.lastMessagePreview}
            </span>
          </span>
        </button>
      ) : null}

      <div className="mt-3 flex items-end gap-2">
        <Textarea
          aria-label="Poruka u diskusiji"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={messageCount === 0 ? "Napiši prvu poruku…" : "Napiši poruku…"}
          disabled={loading}
          className="min-h-10 resize-none py-2 text-ui"
        />
        <Button
          variant="secondary"
          type="button"
          size="icon"
          className="size-10 shrink-0"
          aria-label="Pošalji poruku"
          disabled={loading || pending || !draft.trim()}
          onClick={() => void send()}
        >
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
        </Button>
      </div>
    </section>
  );
}
