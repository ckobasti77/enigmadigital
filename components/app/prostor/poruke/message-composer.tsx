"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/message-composer.tsx (main @ c05c40f), SPAJANJE S15.
import { useEffect, useMemo, useRef, useState } from "react";
import { insertAtTop, useMutation } from "convex/react";
import { toast } from "@/lib/toast";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { LoaderCircle, Mic, Paperclip, Reply, Send, Trash2, X } from "lucide-react";
import { mentionCandidates, mentionScopeFor } from "@/lib/prostor/chat-hub";

import { MentionTextarea } from "@/components/app/prostor/poruke/mention-textarea";
import type { ProfileWithAvatar } from "@/lib/prostor/rute";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatVoiceDuration,
  resolveMentions,
  type ChatChannel,
  type ChatMember,
  type ChatMessage,
} from "@/lib/prostor/web/chat";

// Van komponente: `Date.now()`/`crypto` su nečiste, ali se pozivaju tek pri
// slanju (u optimističkom callback-u), ne tokom rendera.
function buildOptimisticTextMessage(
  args: {
    channelId: Id<"chatChannels">;
    body: string;
    mentions?: Id<"profiles">[];
    replyToMessageId?: Id<"chatMessages">;
  },
  channel: ChatChannel,
  profile: ProfileWithAvatar,
): ChatMessage {
  const now = Date.now();
  return {
    _id: crypto.randomUUID() as Id<"chatMessages">,
    _creationTime: now,
    channelId: args.channelId,
    workspaceId: channel.workspaceId,
    authorProfileId: profile._id,
    body: args.body,
    mentions: args.mentions ?? [],
    kind: "text",
    attachmentName: null,
    attachmentType: null,
    attachmentSize: null,
    voiceDurationMs: null,
    replyToMessageId: args.replyToMessageId ?? null,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
    deleted: false,
    author: {
      _id: profile._id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
    },
    reactions: [],
    attachmentUrl: null,
  };
}

export function MessageComposer({
  channel,
  profile,
  members,
  replyTo,
  uploading,
  sendAttachment,
  sendFiles,
  onCancelReply,
  onSent,
}: {
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  /**
   * Članovi opsega razgovora: tim za kanal projekta, članovi za lični
   * razgovor. Pominjanje nudi `mentionCandidates` (lični razgovor bez mene).
   */
  members: ChatMember[] | undefined;
  replyTo: ChatMessage | null;
  /**
   * Slanje priloga živi u `conversation-pane` (`use-attachment-sender.ts`), jer
   * ista logika treba i drop zoni koja pokriva ceo prozor razgovora — a `replyTo`
   * je tamo. Composer je samo jedan od tri ulaza (spajalica, `Ctrl+V`, drop).
   */
  uploading: boolean;
  sendAttachment: (
    file: File,
    kind: "file" | "voice",
    voiceDurationMs?: number,
  ) => void;
  sendFiles: (files: File[]) => void;
  onCancelReply: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelWorkspaceId = channel.workspaceId;
  const candidates = useMemo(
    () =>
      members === undefined
        ? undefined
        : mentionCandidates(mentionScopeFor({ workspaceId: channelWorkspaceId }, members), profile._id),
    [members, channelWorkspaceId, profile._id],
  );

  // Optimistički unos samo za tekst — prilog/glas čekaju upload, pa se šalju bez
  // optimizma (poruka se pojavi kad server potvrdi).
  const send = useMutation(api.prostor.chat.sendMessage).withOptimisticUpdate(
    (store, args) => {
      if ((args.kind ?? "text") !== "text") return;
      insertAtTop({
        paginatedQuery: api.prostor.chat.messages,
        argsToMatch: { channelId: args.channelId },
        localQueryStore: store,
        item: buildOptimisticTextMessage(args, channel, profile),
      });
    },
  );
  async function sendText() {
    const body = draft.trim();
    if (!body) return;
    const mentions = resolveMentions(body, members ?? []);
    const replyId = replyTo?._id;
    setDraft("");
    onCancelReply();
    try {
      await send({
        channelId: channel._id,
        body,
        mentions,
        replyToMessageId: replyId,
      });
      onSent();
    } catch (error) {
      setDraft(body);
      toast.error(accessErrorMessage(error, "Poruka nije poslata."));
    }
  }

  /**
   * `Ctrl+V` sa slikom. Screenshot iz clipboard-a je `image/png` bez upotrebljivog
   * imena — ime sa vremenskom oznakom pravi `use-attachment-sender.ts`. Kad u
   * clipboard-u nema fajlova, `preventDefault` se NE zove: običan tekst se lepi kao
   * i pre.
   */
  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    sendFiles(files);
  }

  return (
    <div className="shrink-0 border-t border-line-soft bg-background px-3 py-3 sm:px-5">
      {replyTo ? (
        <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded-lg border border-line-soft bg-surface py-1 pl-3 pr-1 text-meta">
          <Reply className="size-3.5 shrink-0 text-text-secondary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-text-secondary">
            Odgovor{" "}
            <span className="font-semibold text-foreground">
              {replyTo.author?.displayName ?? "Član"}
            </span>
            : {replyTo.deleted ? "Poruka je obrisana" : replyTo.body || "prilog"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onCancelReply}
            aria-label="Otkaži odgovor"
            className="shrink-0 text-text-secondary"
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            sendFiles(files);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-text-secondary"
          aria-label="Priloži fajl"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Paperclip className="size-4" aria-hidden="true" />
          )}
        </Button>

        <MentionTextarea
          value={draft}
          onChange={setDraft}
          members={candidates}
          onSubmit={() => void sendText()}
          onPaste={handlePaste}
          placeholder="Napiši poruku…  (@ za pominjanje)"
        />

        {draft.trim() ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="size-11 shrink-0"
            aria-label="Pošalji"
            disabled={!draft.trim()}
            onClick={() => void sendText()}
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <VoiceRecorder
            disabled={uploading}
            onRecorded={(file, durationMs) =>
              sendAttachment(file, "voice", durationMs)
            }
          />
        )}
      </div>
    </div>
  );
}

function VoiceRecorder({
  disabled,
  onRecorded,
}: {
  disabled: boolean;
  onRecorded: (file: File, durationMs: number) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(() => {
      setElapsed(Date.now() - startedAtRef.current);
    }, 250);
    return () => window.clearInterval(interval);
  }, [recording]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        stream.getTracks().forEach((track) => track.stop());
        if (cancelledRef.current) return;
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `glasovna-poruka-${startedAtRef.current}.webm`, {
          type,
        });
        onRecorded(file, durationMs);
      };
      startedAtRef.current = Date.now();
      setElapsed(0);
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Mikrofon nije dostupan.");
    }
  }

  function stop(cancel: boolean) {
    cancelledRef.current = cancel;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  if (!recording) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-text-secondary"
        aria-label="Snimi glasovnu poruku"
        disabled={disabled}
        onClick={() => void start()}
      >
        <Mic className="size-4" aria-hidden="true" />
      </Button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-line-soft bg-card px-2 py-1">
      <span className="sr-only" role="status">
        Snimanje poruke počelo.
      </span>
      <span
        className="size-2 rounded-full bg-foreground motion-safe:animate-pulse"
        aria-hidden="true"
      />
      <span className="text-meta tabular-nums text-text-secondary">
        {formatVoiceDuration(elapsed)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-text-secondary"
        aria-label="Otkaži snimanje"
        onClick={() => stop(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="icon-sm"
        aria-label="Pošalji glasovnu poruku"
        onClick={() => stop(false)}
      >
        <Send aria-hidden="true" />
      </Button>
    </div>
  );
}
