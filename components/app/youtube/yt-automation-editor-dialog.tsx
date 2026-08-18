"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  Loader2,
  MessageSquareReply,
  ShieldCheck,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { normalizeKeyword } from "@/convex/lib/orMatch";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { YtCommentPreview } from "./yt-comment-preview";
import { cn } from "@/lib/utils";

type YtAutomationView = FunctionReturnType<
  typeof api.ytAutomationsApi.listAutomations
>[number];

type ModerationStatus = NonNullable<YtAutomationView["moderationStatus"]>;

/** One vocabulary for the moderation action, used by the editor and the card. */
export const MODERATION_LABELS: Record<ModerationStatus, string> = {
  heldForReview: "Zadrži za pregled",
  rejected: "Odbij komentar",
  published: "Objavi komentar",
};

const MODERATION_HINTS: Record<ModerationStatus, string> = {
  heldForReview:
    "Komentar nestaje sa videa i čeka tvoju odluku u YouTube Studiju.",
  rejected:
    "Komentar se trajno uklanja sa videa. Ovo je nepovratno — ni ti ga posle ne možeš vratiti.",
  published:
    "Objavljuje komentar koji je YouTube zadržao na automatskoj proveri.",
};

// Mirrors the limits enforced in convex/ytAutomationsApi.ts.
const KEYWORDS_MAX = 20;
const REPLY_MESSAGE_MAX = 1000;
const VIDEO_ID_LENGTH = 11;

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

export function YtAutomationEditorDialog({
  open,
  onOpenChange,
  automationToEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automationToEdit: YtAutomationView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl sm:max-w-2xl">
        <YtAutomationEditorForm
          key={automationToEdit?._id ?? "new"}
          automationToEdit={automationToEdit}
          onClose={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}

function YtAutomationEditorForm({
  automationToEdit,
  onClose,
}: {
  automationToEdit: YtAutomationView | null;
  onClose: () => void;
}) {
  const isEditing = automationToEdit !== null;

  const [name, setName] = useState(automationToEdit?.name ?? "");
  const [keywords, setKeywords] = useState<string[]>(
    automationToEdit?.keywords ?? [],
  );
  const [keywordDraft, setKeywordDraft] = useState("");
  const [matchAnyWord, setMatchAnyWord] = useState(
    automationToEdit?.matchAnyWord ?? true,
  );
  const [wholeWordMatch, setWholeWordMatch] = useState(
    automationToEdit?.wholeWordMatch ?? false,
  );
  const [matchAnyVideo, setMatchAnyVideo] = useState(
    automationToEdit?.matchAnyVideo ?? true,
  );
  const [videoId, setVideoId] = useState(automationToEdit?.videoId ?? "");
  const [replyEnabled, setReplyEnabled] = useState(
    automationToEdit?.replyEnabled ?? true,
  );
  const [replyMessage, setReplyMessage] = useState(
    automationToEdit?.replyMessage ?? "",
  );
  const [moderationEnabled, setModerationEnabled] = useState(
    automationToEdit?.moderationEnabled ?? false,
  );
  const [moderationStatus, setModerationStatus] = useState<
    ModerationStatus | ""
  >(automationToEdit?.moderationStatus ?? "");
  const [markAsSpam, setMarkAsSpam] = useState(
    automationToEdit?.markAsSpam ?? false,
  );
  const [isActive, setIsActive] = useState(automationToEdit?.isActive ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const createAutomation = useMutation(api.ytAutomationsApi.createAutomation);
  const updateAutomation = useMutation(api.ytAutomationsApi.updateAutomation);

  const addKeyword = (raw: string) => {
    const keyword = normalizeKeyword(raw);
    if (keyword.length === 0) return;
    setKeywords((prev) =>
      prev.includes(keyword) || prev.length >= KEYWORDS_MAX
        ? prev
        : [...prev, keyword],
    );
    setKeywordDraft("");
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordDraft);
    } else if (e.key === "Backspace" && keywordDraft.length === 0) {
      setKeywords((prev) => prev.slice(0, -1));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // The draft the user typed but never confirmed still counts.
    const finalKeywords =
      keywordDraft.trim().length > 0 &&
      !keywords.includes(normalizeKeyword(keywordDraft))
        ? [...keywords, normalizeKeyword(keywordDraft)]
        : keywords;

    setSubmitting(true);
    setErrorMsg(null);

    const payload = {
      name,
      keywords: finalKeywords,
      matchAnyWord,
      wholeWordMatch,
      matchAnyVideo,
      videoId: videoId.trim() || undefined,
      replyEnabled,
      replyMessage: replyMessage.trim() || undefined,
      moderationEnabled,
      moderationStatus: moderationStatus === "" ? undefined : moderationStatus,
      markAsSpam,
      isActive,
    };

    try {
      if (isEditing) {
        await updateAutomation({
          automationId: automationToEdit._id,
          ...payload,
        });
      } else {
        await createAutomation(payload);
      }
      onClose();
    } catch (err) {
      setErrorMsg(convexMessage(err, "Čuvanje nije uspelo. Pokušaj ponovo."));
    } finally {
      setSubmitting(false);
    }
  };

  const rejecting = moderationEnabled && moderationStatus === "rejected";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-400">
            <MessageSquareReply className="size-4" />
          </div>
          <div>
            <DialogTitle>
              {isEditing ? "Izmeni automatizaciju" : "Nova automatizacija"}
            </DialogTitle>
            <DialogDescription>
              Kada komentar na kanalu sadrži ključnu reč, kanal mu javno
              odgovara, moderiše ga, ili oboje.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
          {errorMsg}
        </div>
      )}

      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {/* Naziv */}
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-text-muted">
            Naziv automatizacije
          </Label>
          <Input
            placeholder="npr. Pitanja o ceni kursa"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className="border-line bg-surface"
          />
        </div>

        {/* Okidač: ključne reči + podudaranje + opseg videa */}
        <div className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">
              Okidač
            </span>
            <span className="font-mono text-xs text-text-muted">
              {keywords.length}/{KEYWORDS_MAX} ključnih reči
            </span>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs text-text-muted">
              Ključne reči
            </Label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface p-2">
              {keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="inline-flex items-center gap-1 rounded-md border border-line-soft bg-surface-raised px-2 py-0.5 font-mono text-xs text-foreground"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() =>
                      setKeywords((prev) => prev.filter((k) => k !== keyword))
                    }
                    disabled={submitting}
                    className="text-text-muted transition-colors hover:text-danger"
                    aria-label={`Ukloni ključnu reč ${keyword}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={keywordDraft}
                onChange={(e) => setKeywordDraft(e.target.value)}
                onKeyDown={handleKeywordKeyDown}
                onBlur={() => addKeyword(keywordDraft)}
                disabled={submitting || keywords.length >= KEYWORDS_MAX}
                placeholder={
                  keywords.length === 0 ? "cena, kurs, prijava…" : "Dodaj…"
                }
                className="min-w-32 flex-1 bg-transparent px-1 py-0.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
              />
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Enter ili zarez dodaje reč. Mala slova i naša slova (č, ć, š, ž,
              đ) se izjednačavaju automatski.
            </p>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs text-text-muted">
                Kada se okida
              </Label>
              <SegmentedControl
                value={matchAnyWord ? "any" : "all"}
                onChange={(value) => setMatchAnyWord(value === "any")}
                disabled={submitting}
                options={[
                  { value: "any", label: "Bilo koja reč" },
                  { value: "all", label: "Sve reči" },
                ]}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs text-text-muted">
                Podudaranje
              </Label>
              <SegmentedControl
                value={wholeWordMatch ? "whole" : "partial"}
                onChange={(value) => setWholeWordMatch(value === "whole")}
                disabled={submitting}
                options={[
                  { value: "partial", label: "Deo reči" },
                  { value: "whole", label: "Cela reč" },
                ]}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-text-muted">
              Videi koji se prate
            </Label>
            <SegmentedControl
              value={matchAnyVideo ? "any" : "one"}
              onChange={(value) => setMatchAnyVideo(value === "any")}
              disabled={submitting}
              options={[
                { value: "any", label: "Svi videi" },
                { value: "one", label: "Jedan video" },
              ]}
            />
            {!matchAnyVideo && (
              <>
                <Input
                  placeholder="ID videa, npr. dQw4w9WgXcQ"
                  value={videoId}
                  onChange={(e) => setVideoId(e.target.value)}
                  disabled={submitting}
                  maxLength={VIDEO_ID_LENGTH}
                  className="mt-2 border-line bg-surface font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-text-muted">
                  Deo adrese posle <span className="font-mono">watch?v=</span> —
                  tačno {VIDEO_ID_LENGTH} znakova.
                </p>
              </>
            )}
          </div>
        </div>

        {/* Javni odgovor */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <MessageSquareReply className="size-3.5 text-accent-400" />
                <span>Javni odgovor na komentar</span>
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                YouTube nema privatne poruke — odgovor vidi svako ko otvori
                video.
              </p>
            </div>
            <PillToggle
              on={replyEnabled}
              onChange={setReplyEnabled}
              disabled={submitting}
              onLabel="Uključen"
              offLabel="Isključen"
            />
          </div>

          {replyEnabled && (
            <div>
              <Textarea
                placeholder="Hvala na komentaru! Sve o kursu je na enigmait.rs/kurs 👇"
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                disabled={submitting}
                rows={4}
                className="border-line bg-surface"
              />
              <span
                className={cn(
                  "mt-1 block text-right font-mono text-xs tabular-nums",
                  replyMessage.length > REPLY_MESSAGE_MAX
                    ? "text-danger"
                    : "text-text-muted",
                )}
              >
                {replyMessage.length}/{REPLY_MESSAGE_MAX}
              </span>
            </div>
          )}
        </div>

        {/* Moderacija */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ShieldCheck className="size-3.5 text-accent-400" />
                <span>Moderacija komentara</span>
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Šta se radi sa komentarom koji je pokrenuo automatizaciju.
              </p>
            </div>
            <PillToggle
              on={moderationEnabled}
              onChange={setModerationEnabled}
              disabled={submitting}
              onLabel="Uključena"
              offLabel="Isključena"
            />
          </div>

          {moderationEnabled && (
            <div className="space-y-2.5">
              <SegmentedControl
                value={moderationStatus}
                onChange={(value) =>
                  setModerationStatus(value as ModerationStatus)
                }
                disabled={submitting}
                options={[
                  {
                    value: "heldForReview",
                    label: MODERATION_LABELS.heldForReview,
                  },
                  { value: "rejected", label: MODERATION_LABELS.rejected },
                  { value: "published", label: MODERATION_LABELS.published },
                ]}
              />

              {moderationStatus !== "" && (
                <p className="text-xs text-text-muted">
                  {MODERATION_HINTS[moderationStatus]}
                </p>
              )}

              {/* The one action on this screen that cannot be taken back. */}
              {rejecting && (
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3">
                  <AlertTriangle
                    className="mt-0.5 size-3.5 shrink-0 text-danger"
                    aria-hidden
                  />
                  <div className="text-xs leading-relaxed text-foreground">
                    <p className="font-semibold text-danger">
                      Nepovratno brisanje komentara
                    </p>
                    <p className="mt-1">
                      Odbijen komentar se trajno uklanja sa videa i ne može se
                      vratiti — ni iz YouTube Studija. Automatizacija ovo radi
                      sama, bez tvoje potvrde, svaki put kada se poklopi ključna
                      reč. Ako nisi siguran, izaberi „
                      {MODERATION_LABELS.heldForReview}”.
                    </p>
                  </div>
                </div>
              )}

              {/* `banAuthor` — YouTube accepts it only alongside "rejected". */}
              {rejecting && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Prijavi i autora kao spam i blokiraj mu komentare na kanalu.
                  </p>
                  <PillToggle
                    on={markAsSpam}
                    onChange={setMarkAsSpam}
                    disabled={submitting}
                    onLabel="Blokira se"
                    offLabel="Ne blokira se"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Živi pregled odgovora */}
        <div className="rounded-xl border border-line-soft bg-card p-3.5">
          {replyEnabled ? (
            <YtCommentPreview
              message={replyMessage}
              moderationLabel={
                moderationEnabled && moderationStatus !== ""
                  ? MODERATION_LABELS[moderationStatus].toLowerCase()
                  : null
              }
            />
          ) : (
            <p className="text-xs text-text-muted">
              Bez javnog odgovora — automatizacija samo moderiše komentar
              {moderationEnabled && moderationStatus !== ""
                ? ` (${MODERATION_LABELS[moderationStatus].toLowerCase()}).`
                : "."}
            </p>
          )}
        </div>
      </div>

      <DialogFooter className="items-center gap-2 border-t border-line pt-3 sm:justify-between">
        <PillToggle
          on={isActive}
          onChange={setIsActive}
          disabled={submitting}
          onLabel="Automatizacija je aktivna"
          offLabel="Automatizacija je pauzirana"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            Otkaži
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting}
            className="bg-accent-400 font-semibold text-surface-dark hover:bg-accent-400/90"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                <span>Čuvam…</span>
              </>
            ) : isEditing ? (
              "Sačuvaj izmene"
            ) : (
              "Napravi automatizaciju"
            )}
          </Button>
        </div>
      </DialogFooter>
    </form>
  );
}

export function SegmentedControl({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        options.length === 3 ? "grid-cols-3" : "grid-cols-2",
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          disabled={disabled}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
            value === option.value
              ? "border-accent-400 bg-accent-400/10 font-semibold text-accent-400"
              : "border-line bg-surface text-text-muted hover:bg-surface-raised hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function PillToggle({
  on,
  onChange,
  onLabel,
  offLabel,
  disabled,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  onLabel: string;
  offLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      disabled={disabled}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
        on
          ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
          : "border-line bg-surface text-text-muted hover:bg-surface-raised hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full",
          on ? "bg-success" : "bg-text-muted/40",
        )}
      />
      <span>{on ? onLabel : offLabel}</span>
    </button>
  );
}
