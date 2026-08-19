"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  Loader2,
  MessageSquareReply,
  ShieldCheck,
  Trash2,
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
import { CharCount, Field } from "@/components/app/form-kit";
import { FeedbackNote } from "@/components/app/feedback";
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
  const [deleteEnabled, setDeleteEnabled] = useState(
    automationToEdit?.deleteEnabled ?? false,
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
      deleteEnabled,
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

  /*
   * Iste dve vrste provera kao na OpenReply editoru: format se javlja uz
   * polje dok se kuca, a ono što nedostaje stoji uz dugme koje zbog toga ne
   * radi — da crveno ne stoji na polju koje niko nije ni dotakao.
   */
  const videoProblem =
    !matchAnyVideo && videoId.trim().length > 0 &&
    videoId.trim().length !== VIDEO_ID_LENGTH
      ? `ID videa ima ${VIDEO_ID_LENGTH} znakova, uneto ${videoId.trim().length}.`
      : null;
  const replyProblem =
    replyEnabled && replyMessage.length > REPLY_MESSAGE_MAX
      ? `Odgovor je duži za ${replyMessage.length - REPLY_MESSAGE_MAX} znakova.`
      : null;

  const missing: string[] = [];
  if (name.trim().length === 0) missing.push("naziv");
  if (keywords.length === 0 && keywordDraft.trim().length === 0)
    missing.push("bar jedna ključna reč");
  if (replyEnabled && replyMessage.trim().length === 0)
    missing.push("tekst odgovora");
  if (!matchAnyVideo && videoId.trim().length === 0) missing.push("ID videa");
  if (!replyEnabled && !moderationEnabled && !deleteEnabled)
    missing.push("bar jedna radnja (odgovor, moderacija ili brisanje)");

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
              odgovara, moderiše ga ili ga briše.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && <FeedbackNote tone="danger" title={errorMsg} />}

      {/* 28 px između celina, 12 px unutar njih — blizina je ono što kaže
          šta ide sa čim. */}
      <div className="max-h-[60vh] space-y-7 overflow-y-auto pr-1">
        <Field label="Naziv automatizacije">
          {(field) => (
            <Input
              {...field}
              placeholder="npr. Pitanja o ceni kursa"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="border-line bg-surface"
            />
          )}
        </Field>

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
              <div className="mt-2">
                <Field
                  label="ID videa"
                  error={videoProblem}
                  hint={`Deo adrese posle watch?v= — tačno ${VIDEO_ID_LENGTH} znakova.`}
                >
                  {(field) => (
                    <Input
                      {...field}
                      placeholder="npr. dQw4w9WgXcQ"
                      value={videoId}
                      onChange={(e) => setVideoId(e.target.value)}
                      disabled={submitting}
                      maxLength={VIDEO_ID_LENGTH}
                      className="border-line bg-surface font-mono text-xs"
                    />
                  )}
                </Field>
              </div>
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
            <Field
              label="Tekst odgovora"
              error={replyProblem}
              action={
                <CharCount
                  value={replyMessage.length}
                  max={REPLY_MESSAGE_MAX}
                />
              }
            >
              {(field) => (
                <Textarea
                  {...field}
                  placeholder="Hvala na komentaru! Sve o kursu je na enigmait.rs/kurs 👇"
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  disabled={submitting}
                  rows={4}
                  className="border-line bg-surface"
                />
              )}
            </Field>
          )}
        </div>

        {/* Moderacija */}
        <div
          className={cn(
            "space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5",
            deleteEnabled && "opacity-60",
          )}
        >
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
              on={!deleteEnabled && moderationEnabled}
              onChange={setModerationEnabled}
              disabled={submitting || deleteEnabled}
              onLabel="Uključena"
              offLabel="Isključena"
            />
          </div>

          {/* Deleting the comment leaves nothing to moderate, so the whole
              section steps aside rather than pretending to have an effect. */}
          {deleteEnabled && (
            <p className="text-xs leading-relaxed text-text-muted">
              Moderacija se preskače dok je brisanje uključeno — komentar koji
              se briše nema šta da se zadrži, odbije ili objavi.
            </p>
          )}

          {!deleteEnabled && moderationEnabled && (
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
                <FeedbackNote
                  tone="danger"
                  title="Nepovratno brisanje komentara"
                >
                  Odbijen komentar se trajno uklanja sa videa i ne može se
                  vratiti — ni iz YouTube Studija. Automatizacija ovo radi sama,
                  bez tvoje potvrde, svaki put kada se poklopi ključna reč. Ako
                  nisi siguran, izaberi „{MODERATION_LABELS.heldForReview}”.
                </FeedbackNote>
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

        {/* Brisanje komentara */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Trash2 className="size-3.5 text-accent-400" />
                <span>Brisanje komentara</span>
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Komentar se uklanja sa videa čim se poklopi ključna reč.
              </p>
            </div>
            <PillToggle
              on={deleteEnabled}
              onChange={setDeleteEnabled}
              disabled={submitting}
              onLabel="Uključeno"
              offLabel="Isključeno"
            />
          </div>

          {deleteEnabled && (
            <FeedbackNote
              tone="danger"
              title="Nepovratno — ni YouTube Studio ovo ne vraća"
            >
              <p>
                Za razliku od moderacije, obrisan komentar ne postoji nigde
                više. Automatizacija ovo radi sama, bez tvoje potvrde, svaki put
                kada se poklopi ključna reč — pa je pogrešna ključna reč ovde
                skuplja nego bilo gde drugde na ovom ekranu.
              </p>
              {replyEnabled && (
                <p className="mt-1.5">
                  Odgovor se šalje pre brisanja, ali brisanjem komentara nestaje
                  i odgovor ispod njega — YouTube uklanja celu nit.
                </p>
              )}
            </FeedbackNote>
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
              {deleteEnabled
                ? "Bez javnog odgovora — automatizacija samo briše komentar."
                : moderationEnabled && moderationStatus !== ""
                  ? `Bez javnog odgovora — automatizacija samo moderiše komentar (${MODERATION_LABELS[
                      moderationStatus
                    ].toLowerCase()}).`
                  : "Bez javnog odgovora — automatizacija samo moderiše komentar."}
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {missing.length > 0 && (
            <span className="text-xs text-text-muted">
              Nedostaje: {missing.join(", ")}
            </span>
          )}
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
            disabled={
              submitting ||
              missing.length > 0 ||
              videoProblem !== null ||
              replyProblem !== null
            }
            className="font-semibold"
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
