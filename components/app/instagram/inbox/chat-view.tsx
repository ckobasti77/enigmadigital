/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  FileText,
  Heart,
  Image as ImageIcon,
  Info,
  Loader2,
  Paperclip,
  Play,
  Send,
  SlidersHorizontal,
  Smile,
  X,
  XCircle,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getUtf8ByteLength } from "@/convex/lib/orMessage";
import { BUTTON_TITLE_MAX } from "@/convex/lib/orButtons";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ChatViewProps {
  igsid: string;
  onBack?: () => void;
  onOpenSettings: () => void;
}

const COMMON_EMOJIS = ["❤️", "👍", "🔥", "😂", "😮", "👏", "🙌", "😍"];

export function ChatView({ igsid, onBack, onOpenSettings }: ChatViewProps) {
  const conversation = useQuery(api.instagramInboxStore.getConversation, {
    igsid,
  });
  const messagesData = useQuery(api.instagramInboxStore.listMessages, {
    igsid,
  });

  const sendMessageAction = useAction(api.orSend.sendInboxMessage);
  const sendActionAction = useAction(api.orSend.sendSenderAction);
  const sendReactionAction = useAction(api.orSend.sendMessageReaction);
  const markSeenMutation = useMutation(api.instagramInboxStore.markSeen);

  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Attachment modal & state
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [attachmentType, setAttachmentType] = useState<
    "image" | "video" | "audio" | "file" | "like_heart"
  >("image");
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [activeAttachment, setActiveAttachment] = useState<{
    type: "image" | "video" | "audio" | "file" | "like_heart";
    url?: string;
  } | null>(null);

  // Quick replies selection for next message
  const [attachedQuickReplies, setAttachedQuickReplies] = useState<string[]>([]);

  // Reaction picker state
  const [activeReactionPickerMid, setActiveReactionPickerMid] = useState<
    string | null
  >(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesData?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messagesData?.messages]);

  // Mark seen when opening
  const unreadCount = conversation?.unreadCount ?? 0;
  useEffect(() => {
    if (unreadCount > 0) {
      markSeenMutation({ igsid }).catch(() => {});
      sendActionAction({ igsid, senderAction: "mark_seen" }).catch(() => {});
    }
  }, [unreadCount, igsid, markSeenMutation, sendActionAction]);

  // UTF-8 byte counting
  const byteLength = getUtf8ByteLength(text);
  const isByteLimitExceeded = byteLength > 1000;

  // Send typing_on indicator (debounced 3s)
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    setErrorMessage(null);

    if (typingTimerRef.current === null && conversation?.isWindowOpen) {
      sendActionAction({ igsid, senderAction: "typing_on" }).catch(() => {});
      typingTimerRef.current = setTimeout(() => {
        typingTimerRef.current = null;
      }, 3000);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isSending) return;

    if (!conversation?.isWindowOpen) {
      setErrorMessage(
        "Prozor za odgovor je istekao. Instagram dozvoljava odgovor 24 sata od poslednje poruke korisnika.",
      );
      return;
    }

    if (isByteLimitExceeded) {
      setErrorMessage("Tekst poruke prelazi maksimalnih 1000 bajtova.");
      return;
    }

    const trimmedText = text.trim();
    if (!trimmedText && !activeAttachment) {
      return;
    }

    try {
      setIsSending(true);
      setErrorMessage(null);

      const quickRepliesPayload =
        attachedQuickReplies.length > 0
          ? attachedQuickReplies.map((label) => ({
              label: label.slice(0, BUTTON_TITLE_MAX),
              payload: label.slice(0, BUTTON_TITLE_MAX),
            }))
          : undefined;

      await sendMessageAction({
        igsid,
        text: trimmedText.length > 0 ? trimmedText : undefined,
        attachment: activeAttachment ?? undefined,
        quickReplies: quickRepliesPayload,
      });

      setText("");
      setActiveAttachment(null);
      setAttachedQuickReplies([]);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Neuspelo slanje poruke.";
      setErrorMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendHeartSticker = async () => {
    if (!conversation?.isWindowOpen || isSending) return;
    try {
      setIsSending(true);
      await sendMessageAction({
        igsid,
        attachment: { type: "like_heart" },
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Neuspelo slanje lajka.";
      setErrorMessage(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleReactionClick = async (mid: string, emoji: string, isOurs: boolean) => {
    try {
      if (isOurs) {
        await sendReactionAction({
          igsid,
          mid,
          action: "unreact",
        });
      } else {
        await sendReactionAction({
          igsid,
          mid,
          emoji,
          action: "react",
        });
      }
      setActiveReactionPickerMid(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Greška pri reakciji.";
      setErrorMessage(msg);
    }
  };

  if (conversation === undefined) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

  if (conversation === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-muted-foreground text-center">
        <p className="text-sm font-medium">Razgovor nije pronađen</p>
      </div>
    );
  }

  const isWindowOpen = conversation.isWindowOpen;
  const isExpiringSoon =
    isWindowOpen && conversation.windowRemainingMs <= 4 * 60 * 60 * 1000;

  return (
    <div className="flex h-full flex-col bg-surface-sunken/30">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="lg:hidden size-8 shrink-0 -ml-1 text-muted-foreground"
            >
              <ArrowLeft className="size-4" />
            </Button>
          )}

          {/* Avatar */}
          <div className="relative shrink-0">
            {conversation.profilePic ? (
              <img
                src={conversation.profilePic}
                alt={conversation.username ?? "Korisnik"}
                className="size-9 rounded-full object-cover border border-line"
              />
            ) : (
              <div className="size-9 rounded-full bg-accent/15 text-accent font-semibold flex items-center justify-center text-xs border border-accent/20">
                {(conversation.name || conversation.username || "IG")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-foreground truncate">
                {conversation.name ||
                  (conversation.username
                    ? `@${conversation.username}`
                    : `Korisnik #${conversation.igsid.slice(-4)}`)}
              </h3>
              {conversation.username && (
                <a
                  href={`https://instagram.com/${conversation.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-accent transition-colors"
                  title="Otvori Instagram profil"
                >
                  <ExternalLink className="size-3" />
                </a>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {conversation.username
                ? `@${conversation.username}`
                : `IGSID: ${conversation.igsid}`}
            </p>
          </div>
        </div>

        {/* 24h Window & Settings */}
        <div className="flex items-center gap-2">
          {isWindowOpen ? (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
                isExpiringSoon
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 animate-pulse"
                  : "border-line bg-surface-raised text-foreground",
              )}
              title="Preostalo vreme unutar Meta 24-časovnog prozora za odgovor."
            >
              <Clock className="size-3" />
              <span>{conversation.windowFormatted}</span>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
              title="Prozor za odgovor je istekao. Instagram dozvoljava odgovor 24 sata od poslednje poruke korisnika."
            >
              <XCircle className="size-3" />
              <span>Istekao prozor</span>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            title="Podešavanja inboxa (Ledolomci, meni profila, brzi odgovori)"
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="size-4" />
          </Button>
        </div>
      </div>

      {/* ── Messages Thread ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Older messages notice */}
        {messagesData?.hasOlderMessages && (
          <div className="mx-auto max-w-md rounded-lg border border-line bg-surface/80 px-3 py-2 text-center text-xs text-muted-foreground shadow-xs">
            <Info className="inline size-3.5 mr-1 text-muted-foreground/70" />
            Instagram Graph API isporučuje do 20 najnovijih poruka. Starije poruke
            nisu dostupne preko API-ja.
          </div>
        )}

        {messagesData?.messages.map((msg) => {
          const isOurs = msg.isOurs;

          return (
            <div
              key={msg.mid}
              className={cn(
                "flex flex-col group",
                isOurs ? "items-end" : "items-start",
              )}
            >
              <div
                className={cn(
                  "relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2.5 shadow-xs text-sm",
                  isOurs
                    ? "bg-accent text-accent-foreground rounded-br-xs"
                    : "bg-surface-raised border border-line text-foreground rounded-bl-xs",
                )}
              >
                {/* Unsupported message notice */}
                {msg.isUnsupported && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300 font-medium py-1">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>Poruka koju Instagram ne isporučuje preko API-ja</span>
                  </div>
                )}

                {/* Attachments */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="space-y-2 mb-1.5">
                    {msg.attachments.map((att, attIdx) => {
                      if (att.type === "like_heart") {
                        return (
                          <div key={attIdx} className="py-1">
                            <Heart className="size-8 fill-red-500 text-red-500 animate-pulse" />
                          </div>
                        );
                      }
                      if (att.type === "image" && att.url) {
                        return (
                          <a
                            key={attIdx}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg overflow-hidden border border-line/40 max-w-xs"
                          >
                            <img
                              src={att.url}
                              alt="Prilog"
                              className="max-h-60 w-full object-cover"
                            />
                          </a>
                        );
                      }
                      if (att.type === "video" && att.url) {
                        return (
                          <video
                            key={attIdx}
                            src={att.url}
                            controls
                            className="max-h-60 rounded-lg max-w-xs"
                          />
                        );
                      }
                      if (att.type === "audio" && att.url) {
                        return (
                          <audio
                            key={attIdx}
                            src={att.url}
                            controls
                            className="w-full max-w-xs"
                          />
                        );
                      }
                      return (
                        <a
                          key={attIdx}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 rounded-lg bg-surface/40 p-2 text-xs font-mono underline"
                        >
                          <FileText className="size-4" />
                          <span>{att.title || "Dokument (PDF)"}</span>
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Shared Post */}
                {msg.shares && (
                  <div className="mb-2 rounded-md border border-line/60 bg-surface/50 p-2 text-xs">
                    <span className="font-semibold block mb-0.5">Deljena objava:</span>
                    {msg.shares.link && (
                      <a
                        href={msg.shares.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent underline flex items-center gap-1"
                      >
                        Otvori objavu <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Text */}
                {msg.text && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed">
                    {msg.text}
                  </p>
                )}

                {/* Timestamp & Status */}
                <div
                  className={cn(
                    "flex items-center justify-end gap-1 text-[10px] mt-1 opacity-75",
                    isOurs ? "text-accent-foreground" : "text-muted-foreground",
                  )}
                >
                  <span>{formatRelativeTime(msg.sentAt)}</span>
                  {msg.editedAt && <span>(izmenjeno)</span>}
                  {isOurs && (
                    <span title={msg.status}>
                      {msg.status === "seen" ? (
                        <CheckCheck className="size-3 text-sky-300" />
                      ) : (
                        <Check className="size-3" />
                      )}
                    </span>
                  )}
                </div>
              </div>

              {/* Message Reactions & Picker */}
              <div className="flex items-center gap-1.5 mt-1 px-1">
                {/* Active reactions pill list */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {msg.reactions.map((r, rIdx) => (
                      <button
                        key={rIdx}
                        type="button"
                        onClick={() =>
                          handleReactionClick(msg.mid, r.emoji, r.isOurs)
                        }
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-2xs transition-transform active:scale-95",
                          r.isOurs
                            ? "border-accent/40 bg-accent/15 text-accent font-bold"
                            : "border-line bg-surface text-foreground",
                        )}
                        title={r.isOurs ? "Kliknite da uklonite vašu reakciju" : undefined}
                      >
                        <span>{r.emoji}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Emoji Reaction trigger */}
                {isWindowOpen && (
                  <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveReactionPickerMid(
                          activeReactionPickerMid === msg.mid ? null : msg.mid,
                        )
                      }
                      className="size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-raised border border-line"
                      title="Dodaj reakciju"
                    >
                      <Smile className="size-3.5" />
                    </button>

                    {/* Reaction Popup */}
                    {activeReactionPickerMid === msg.mid && (
                      <div className="absolute bottom-full mb-1 left-0 z-50 flex items-center gap-1 rounded-full border border-line bg-surface-raised p-1 shadow-elev-2 animate-in fade-in-0 zoom-in-95">
                        {COMMON_EMOJIS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleReactionClick(msg.mid, emoji, false)}
                            className="size-7 flex items-center justify-center rounded-full hover:bg-surface-sunken hover:scale-125 transition-transform text-sm"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Composer / 24h Expired Guard ─────────────────────────────────── */}
      <div className="border-t border-line bg-surface p-3 shrink-0">
        {errorMessage && (
          <div className="mb-2 flex items-center justify-between rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-destructive/80 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* 24-HOUR WINDOW EXPIRED GUARD */}
        {!isWindowOpen ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-center space-y-2">
            <div className="flex items-center justify-center gap-2 text-destructive font-semibold text-sm">
              <XCircle className="size-5" />
              <span>Prozor za odgovor je istekao.</span>
            </div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              Instagram dozvoljava odgovor 24 sata od poslednje poruke korisnika.
              Polje za unos biće automatski omogućeno čim korisnik pošalje novu poruku.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Quick replies preview tray */}
            {attachedQuickReplies.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 p-1.5 rounded-lg bg-surface-sunken border border-line">
                <span className="text-[11px] text-muted-foreground font-medium mr-1">
                  Brzi odgovori:
                </span>
                {attachedQuickReplies.map((label, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent"
                  >
                    <span>{label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedQuickReplies(
                          attachedQuickReplies.filter((_, i) => i !== idx),
                        )
                      }
                      className="text-accent hover:text-destructive transition-colors ml-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Active Attachment Pill */}
            {activeAttachment && (
              <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent">
                <div className="flex items-center gap-2">
                  <Paperclip className="size-3.5" />
                  <span>
                    Prilog: <strong>{activeAttachment.type}</strong>
                    {activeAttachment.url && ` (${activeAttachment.url})`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAttachment(null)}
                  className="hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            {/* Input & Action buttons */}
            <form onSubmit={handleSendMessage} className="space-y-2">
              <div className="relative">
                <Textarea
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Napišite poruku... (Shift+Enter za novi red)"
                  rows={2}
                  className="resize-none text-sm pr-20 bg-surface-raised"
                />

                {/* Live Byte Counter */}
                <div className="absolute right-2 bottom-2 text-[11px] font-mono">
                  <span
                    className={cn(
                      byteLength > 1000
                        ? "text-destructive font-bold"
                        : byteLength > 800
                          ? "text-amber-500 font-semibold"
                          : "text-muted-foreground",
                    )}
                  >
                    {byteLength}
                  </span>
                  <span className="text-muted-foreground"> / 1000 B</span>
                </div>
              </div>

              {/* Bottom bar controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachmentModalOpen(true)}
                    className="text-xs text-muted-foreground hover:text-foreground h-8 px-2"
                  >
                    <Paperclip className="size-3.5 mr-1" />
                    Prilog
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSendHeartSticker}
                    disabled={isSending}
                    className="text-xs text-muted-foreground hover:text-red-500 h-8 px-2"
                    title="Pošalji lajk srce"
                  >
                    <Heart className="size-3.5 text-red-500 mr-1" />
                    Lajk
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    disabled={
                      isSending ||
                      isByteLimitExceeded ||
                      (!text.trim() && !activeAttachment)
                    }
                    className="font-medium h-8 px-4"
                  >
                    {isSending ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Send className="size-3.5 mr-1.5" />
                    )}
                    Pošalji
                  </Button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* ── Attachment Selector Dialog ──────────────────────────────────── */}
      <Dialog open={attachmentModalOpen} onOpenChange={setAttachmentModalOpen}>
        <DialogPopup className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">
              Dodaj prilog uz poruku
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Instagram podržava slike (do 8 MB), video, audio i PDF fajlove (do 25 MB).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Attachment Type Selector */}
            <div className="grid grid-cols-4 gap-2">
              {(["image", "video", "audio", "file"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAttachmentType(t)}
                  className={cn(
                    "flex flex-col items-center justify-center p-2.5 rounded-lg border text-xs capitalize transition-colors",
                    attachmentType === t
                      ? "border-accent bg-accent/10 font-bold text-accent"
                      : "border-line bg-surface hover:bg-surface-raised text-muted-foreground",
                  )}
                >
                  {t === "image" && <ImageIcon className="size-4 mb-1" />}
                  {t === "video" && <Play className="size-4 mb-1" />}
                  {t === "audio" && <FileText className="size-4 mb-1" />}
                  {t === "file" && <FileText className="size-4 mb-1" />}
                  <span>{t === "file" ? "PDF" : t}</span>
                </button>
              ))}
            </div>

            {/* Public URL Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Javni URL priloga (HTTPS):
              </label>
              <Input
                value={attachmentUrl}
                onChange={(e) => setAttachmentUrl(e.target.value)}
                placeholder="https://domen.rs/fajl.jpg"
                className="text-xs font-mono"
              />
              <span className="text-[11px] text-muted-foreground block">
                Instagram Graph API preuzima fajl sa javno dostupnog HTTPS URL-a.
              </span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAttachmentModalOpen(false)}
              >
                Otkaži
              </Button>
              <Button
                size="sm"
                disabled={!attachmentUrl.trim()}
                onClick={() => {
                  setActiveAttachment({
                    type: attachmentType,
                    url: attachmentUrl.trim(),
                  });
                  setAttachmentModalOpen(false);
                }}
              >
                Dodaj prilog
              </Button>
            </div>
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
