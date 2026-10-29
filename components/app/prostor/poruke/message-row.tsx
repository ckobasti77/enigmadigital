"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/message-row.tsx (main @ c05c40f), SPAJANJE S15.
import { useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import { CornerUpLeft, FileText, Pencil, Reply, Trash2 } from "lucide-react";
import { canDeleteChatMessage } from "@/lib/prostor/chat-hub";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { ReactionPicker } from "@/components/app/prostor/poruke/reaction-picker";
import { useVlasnikPlatforme } from "@/components/app/prostor/poruke/uloge";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import type { ProfileWithAvatar } from "@/lib/prostor/rute";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
// Jedna konstanta za prozor izmene: server je koristi u `chat.editMessage`.
import { CHAT_EDIT_WINDOW_MS } from "@/convex/prostor/lib/validators";
import {
  formatMessageTime,
  splitMentions,
  formatVoiceDuration,
  type ChatMember,
  type ChatMessage,
} from "@/lib/prostor/web/chat";
import { formatFileSize } from "@/lib/prostor/web/vrste-stranica";
import { cn } from "@/lib/utils";

export function MessageRow({
  message,
  grouped,
  profile,
  members,
  repliedTo,
  onReply,
}: {
  message: ChatMessage;
  grouped: boolean;
  profile: ProfileWithAvatar;
  members: ChatMember[] | undefined;
  repliedTo?: ChatMessage | null;
  onReply: (message: ChatMessage) => void;
}) {
  const toggleReaction = useMutation(api.prostor.chat.toggleReaction);
  const editMessage = useMutation(api.prostor.chat.editMessage);
  const deleteMessage = useMutation(api.prostor.chat.deleteMessage);
  const vlasnikPlatforme = useVlasnikPlatforme();
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(message.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sistemska poruka: tiha centrirana linija (ne nosi autora ni akcije).
  if (message.kind === "system" || message.authorProfileId === null) {
    return (
      <div className="my-1.5 flex justify-center px-4">
        <p className="text-center text-meta text-text-secondary">{message.body}</p>
      </div>
    );
  }

  const isOwn = message.authorProfileId === profile._id;
  // Prozor izmene (15 min) proverava se pri kliku, ne tokom rendera — backend
  // je konačni čuvar; ovde je samo prijateljska poruka ako je prošlo.
  const canEdit = isOwn && !message.deleted;
  // Ogledalo `chat.deleteMessage`: vlasnik platforme briše tuđe poruke samo u
  // kanalima projekta; u ličnom razgovoru (`workspaceId === null`) briše samo autor.
  const canDelete = canDeleteChatMessage({
    isOwn,
    isAdmin: vlasnikPlatforme,
    workspaceId: message.workspaceId,
    deleted: message.deleted,
  });

  function beginEdit() {
    if (Date.now() - message.createdAt >= CHAT_EDIT_WINDOW_MS) {
      toast.error("Poruka se može izmeniti samo u prvih 15 minuta.");
      return;
    }
    setEditText(message.body);
    setEditing(true);
  }

  const mentionNames = message.mentions.flatMap((id) => {
    const name = members?.find((member) => member.profile._id === id)?.profile
      .displayName;
    return name ? [name] : [];
  });

  function react(emoji: string) {
    void toggleReaction({ messageId: message._id, emoji }).catch((error) =>
      toast.error(error instanceof Error ? error.message : "Reakcija nije sačuvana."),
    );
  }

  async function saveEdit() {
    const trimmed = editText.trim();
    if (!trimmed) return;
    try {
      await editMessage({ messageId: message._id, body: trimmed });
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Izmena nije sačuvana.");
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await deleteMessage({ messageId: message._id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Poruka nije obrisana.");
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 rounded-lg px-2 transition-colors hover:bg-surface-control-hover focus-within:bg-surface-control-hover",
        grouped ? "py-0.5" : "mt-3 py-1",
      )}
    >
      <div className="w-9 shrink-0">
        {grouped ? (
          <span className="mt-1 flex justify-end text-meta tabular-nums pointer-events-none text-text-muted opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100">
            {formatMessageTime(message.createdAt)}
          </span>
        ) : message.author ? (
          <ProfileAvatar profile={message.author} className="size-9" />
        ) : (
          <span className="grid size-9 place-items-center rounded-full bg-muted text-meta font-semibold text-text-secondary">
            —
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {grouped ? null : (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-ui font-semibold text-foreground">
              {message.author?.displayName ?? "Član"}
            </span>
            <time
              className="text-meta tabular-nums text-text-muted"
              dateTime={new Date(message.createdAt).toISOString()}
            >
              {formatMessageTime(message.createdAt)}
            </time>
            {message.editedAt ? (
              <span className="text-meta text-text-muted">
                (izmenjeno)
              </span>
            ) : null}
          </div>
        )}

        {repliedTo ? (
          <div className="mt-1 flex items-center gap-1.5 border-l border-line-strong pl-2 text-meta text-text-secondary">
            <CornerUpLeft className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              <span className="font-semibold">
                {repliedTo.author?.displayName ?? "Član"}
              </span>{" "}
              {repliedTo.deleted ? "Poruka je obrisana" : repliedTo.body || "prilog"}
            </span>
          </div>
        ) : message.replyToMessageId ? (
          <div className="mt-1 flex items-center gap-1.5 border-l border-line-strong pl-2 text-meta text-text-secondary">
            <CornerUpLeft className="size-3 shrink-0" aria-hidden="true" /> Odgovor na poruku
          </div>
        ) : null}

        {message.deleted ? (
          <p className="mt-0.5 text-ui italic text-text-secondary">
            Poruka je obrisana
          </p>
        ) : editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              autoFocus
              aria-label="Izmena poruke"
              className="min-h-16 rounded-lg bg-background text-ui"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void saveEdit();
                } else if (event.key === "Escape") {
                  setEditing(false);
                  setEditText(message.body);
                }
              }}
            />
            <div className="flex justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditText(message.body);
                }}
              >
                Otkaži
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!editText.trim()}
                onClick={() => void saveEdit()}
              >
                Sačuvaj
              </Button>
            </div>
          </div>
        ) : (
          <>
            {message.body ? (
              <p className="whitespace-pre-wrap break-words text-ui leading-6 text-foreground">
                {splitMentions(message.body, mentionNames).map((segment, index) =>
                  segment.kind === "mention" ? (
                    <span
                      key={index}
                      className="rounded bg-surface-control px-0.5 font-semibold text-foreground"
                    >
                      {segment.value}
                    </span>
                  ) : (
                    <span key={index}>{segment.value}</span>
                  ),
                )}
              </p>
            ) : null}

            <Attachment message={message} />

            {message.reactions.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {message.reactions.map((reaction) => (
                  <button
                    key={reaction.emoji}
                    type="button"
                    onClick={() => react(reaction.emoji)}
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-meta tabular-nums ring-1 transition-colors pointer-coarse:min-h-11",
                      reaction.mine
                        ? "bg-surface-control-hover text-foreground ring-line-strong"
                        : "bg-card text-text-secondary ring-line hover:bg-surface-control-hover",
                    )}
                    aria-pressed={reaction.mine}
                    aria-label={`Reakcija ${reaction.emoji}, ${reaction.count}${reaction.mine ? ", tvoja" : ""}`}
                  >
                    <span className="text-ui leading-none">{reaction.emoji}</span>
                    {reaction.count}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}

        {message.deleted || editing ? null : (
          // Radnje reda su ghost ikonice, uvek u toku dokumenta (nije
          // `display:none`), pa ih tastatura i čitač ekrana dostižu. Miš:
          // plutajuća traka koja se vidi na prelaz i fokus (ostaje dok je meni
          // reakcija otvoren). Dodir: nema prelaza, traka stoji ispod poruke i
          // uvek se vidi.
          <div
            className={cn(
              "flex w-fit items-center gap-0.5 text-text-secondary transition-opacity duration-(--duration-fast)",
              "absolute -top-3 right-2 rounded-lg border border-line-soft bg-popover p-0.5 shadow-sm",
              "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[data-popup-open]]:pointer-events-auto has-[[data-popup-open]]:opacity-100",
              "pointer-coarse:pointer-events-auto pointer-coarse:static pointer-coarse:mt-1 pointer-coarse:rounded-none pointer-coarse:border-0 pointer-coarse:bg-transparent pointer-coarse:p-0 pointer-coarse:opacity-100 pointer-coarse:shadow-none",
            )}
          >
            <ReactionPicker onSelect={react} />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Odgovori"
              onClick={() => onReply(message)}
            >
              <Reply aria-hidden="true" />
            </Button>
            {canEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Izmeni poruku"
                onClick={beginEdit}
              >
                <Pencil aria-hidden="true" />
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="hover:text-danger focus-visible:text-danger"
                aria-label="Obriši poruku"
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {canDelete ? (
        <ConfirmDialog
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          title="Obrisati poruku?"
          description="Poruka se briše za sve u razgovoru. U razgovoru ostaje samo oznaka da je poruka obrisana."
          confirmLabel="Obriši poruku"
          busyLabel="Brišem…"
          busy={deleting}
          onConfirm={() => void remove()}
          tone="danger"
        />
      ) : null}
    </div>
  );
}

function Attachment({ message }: { message: ChatMessage }) {
  if (!message.attachmentUrl) return null;

  if (message.kind === "voice") {
    return (
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line-soft bg-card p-2">
        <audio controls src={message.attachmentUrl} className="h-9 max-w-full" />
        <span className="shrink-0 text-meta tabular-nums text-text-secondary">
          {formatVoiceDuration(message.voiceDurationMs)}
        </span>
      </div>
    );
  }

  const isImage = message.attachmentType?.startsWith("image/");
  if (isImage) {
    return (
      <a
        href={message.attachmentUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 block w-fit"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={message.attachmentUrl}
          alt={message.attachmentName ?? "Prilog"}
          className="max-h-80 max-w-full rounded-xl border border-line-soft object-cover"
        />
      </a>
    );
  }

  return (
    <a
      href={message.attachmentUrl}
      target="_blank"
      rel="noreferrer"
      className="mt-1.5 flex w-fit max-w-full items-center gap-2.5 rounded-xl border border-line-soft bg-card px-3 py-2 transition-colors hover:bg-surface-control-hover"
    >
      <FileText className="size-4 shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-ui font-medium text-foreground">
          {message.attachmentName ?? "Prilog"}
        </span>
        {message.attachmentSize !== null ? (
          <span className="block text-meta tabular-nums text-text-muted">
            {formatFileSize(message.attachmentSize)}
          </span>
        ) : null}
      </span>
    </a>
  );
}
