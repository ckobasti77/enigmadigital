"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import {
  Clock,
  Loader2,
  MessageCircleReply,
  Link2,
  MousePointerClick,
  Plus,
  UserRoundPlus,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { normalizeKeyword } from "@/convex/lib/orMatch";
import { PLATFORM_LABELS } from "@/convex/lib/orPlatform";
import {
  BUTTONS_MAX,
  BUTTON_TITLE_MAX,
  QUICK_REPLIES_MAX,
  TEMPLATE_TEXT_MAX,
} from "@/convex/lib/orButtons";
import {
  FOLLOW_PROMPT_MESSAGE_DEFAULT,
  FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT,
} from "@/convex/lib/orFollow";
import {
  FOLLOW_UP_DELAY_MAX_MINUTES,
  FOLLOW_UP_DELAY_MIN_MINUTES,
  formatFollowUpDelay,
} from "@/convex/lib/orFollowUp";
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
import { DmPreview } from "./dm-preview";
import { cn } from "@/lib/utils";

type AutomationView = FunctionReturnType<
  typeof api.orAutomationsApi.listAutomations
>[number];

type AutomationTrigger = AutomationView["trigger"];
type AutomationPlatform = AutomationView["platform"];

/** One vocabulary for the trigger, used by the editor and the automation card. */
export const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  comment: "Komentar",
  dm: "DM",
  both: "Komentar + DM",
};

// Mirrors the limits enforced in convex/orAutomationsApi.ts.
const KEYWORDS_MAX = 20;
const DM_MESSAGE_MAX = 900;
const PUBLIC_REPLY_MAX = 280;

/**
 * How the message offers a choice. A message carries buttons or quick replies,
 * never both — the same rule the mutation enforces, made visible as one pick.
 */
type TapMode = "none" | "buttons" | "quickReplies";

/**
 * A row being edited. `payload` is the identity of a button already delivered
 * in a DM: it rides back to the mutation untouched so old buttons keep working.
 * `uid` is local only, so React keeps the inputs attached to their own row.
 */
type ButtonRow = {
  uid: number;
  label: string;
  type: "url" | "postback";
  url: string;
  replyMessage: string;
  payload: string | null;
};

type QuickReplyRow = {
  uid: number;
  label: string;
  replyMessage: string;
  payload: string | null;
};

let rowUid = 0;
const nextUid = () => ++rowUid;

/** Pull the friendly message out of a thrown ConvexError, else a fallback. */
function convexMessage(err: unknown, fallback: string): string {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string } | undefined;
    if (data && typeof data.message === "string") return data.message;
  }
  return fallback;
}

export function AutomationEditorDialog({
  open,
  onOpenChange,
  automationToEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  automationToEdit: AutomationView | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl sm:max-w-2xl">
        <AutomationEditorForm
          key={automationToEdit?._id ?? "new"}
          automationToEdit={automationToEdit}
          onClose={() => onOpenChange(false)}
        />
      </DialogPopup>
    </Dialog>
  );
}

function AutomationEditorForm({
  automationToEdit,
  onClose,
}: {
  automationToEdit: AutomationView | null;
  onClose: () => void;
}) {
  const isEditing = automationToEdit !== null;

  const [name, setName] = useState(automationToEdit?.name ?? "");
  const [platform, setPlatform] = useState<AutomationPlatform>(
    automationToEdit?.platform ?? "instagram",
  );
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    automationToEdit?.trigger ?? "comment",
  );
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
  const [matchAnyPost, setMatchAnyPost] = useState(
    automationToEdit?.matchAnyPost ?? true,
  );
  const [postId, setPostId] = useState(automationToEdit?.postId ?? "");
  const [dmMessage, setDmMessage] = useState(automationToEdit?.dmMessage ?? "");
  const [linkUrl, setLinkUrl] = useState(automationToEdit?.linkUrl ?? "");
  const [linkLabel, setLinkLabel] = useState(automationToEdit?.linkLabel ?? "");
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(
    automationToEdit?.publicReplyEnabled ?? false,
  );
  const [publicReplyMessage, setPublicReplyMessage] = useState(
    automationToEdit?.publicReplyMessage ?? "",
  );
  const [buttons, setButtons] = useState<ButtonRow[]>(() =>
    (automationToEdit?.buttons ?? []).map((button) => ({
      uid: nextUid(),
      label: button.label,
      type: button.type,
      url: button.url ?? "",
      replyMessage: button.replyMessage ?? "",
      payload: button.payload,
    })),
  );
  const [quickReplies, setQuickReplies] = useState<QuickReplyRow[]>(() =>
    (automationToEdit?.quickReplies ?? []).map((quickReply) => ({
      uid: nextUid(),
      label: quickReply.label,
      replyMessage: quickReply.replyMessage ?? "",
      payload: quickReply.payload,
    })),
  );
  const [tapMode, setTapMode] = useState<TapMode>(() =>
    (automationToEdit?.buttons.length ?? 0) > 0
      ? "buttons"
      : (automationToEdit?.quickReplies.length ?? 0) > 0
        ? "quickReplies"
        : "none",
  );
  const [requireFollow, setRequireFollow] = useState(
    automationToEdit?.requireFollow ?? false,
  );
  const [followPromptMessage, setFollowPromptMessage] = useState(
    automationToEdit?.followPromptMessage ?? "",
  );
  const [followPromptButtonLabel, setFollowPromptButtonLabel] = useState(
    automationToEdit?.followPromptButtonLabel ?? "",
  );
  const [followUpEnabled, setFollowUpEnabled] = useState(
    automationToEdit?.followUpEnabled ?? false,
  );
  const [followUpMessage, setFollowUpMessage] = useState(
    automationToEdit?.followUpMessage ?? "",
  );
  // Kept as text so the field can be emptied while typing; empty means the
  // default the mutation fills in.
  const [followUpDelay, setFollowUpDelay] = useState(
    String(automationToEdit?.followUpDelayMinutes ?? ""),
  );
  const [isActive, setIsActive] = useState(automationToEdit?.isActive ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // A DM has no post behind it and nothing public to reply to, so both of
  // those controls disappear when the automation only listens to messages.
  const dmOnly = trigger === "dm";

  // The follow gate asks Instagram whether someone follows the account. There
  // is no such question on Facebook, so an automation that runs there is told
  // outright what the gate will and will not do — rather than having the
  // control quietly hidden, which would read as "this setting was lost".
  const gateReachesFacebook = platform !== "instagram";

  // Only the mode that is actually picked is sent, which is what keeps the
  // either/or true no matter what the other list still holds.
  const sentButtons = tapMode === "buttons" ? buttons : [];
  const sentQuickReplies = tapMode === "quickReplies" ? quickReplies : [];
  // The button template's own text field is shorter than a plain DM.
  const messageMax = tapMode === "buttons" ? TEMPLATE_TEXT_MAX : DM_MESSAGE_MAX;

  const followUpDelayMinutes = Number.parseInt(followUpDelay, 10);
  const hasFollowUpDelay = Number.isFinite(followUpDelayMinutes);

  /*
   * Provere stižu uz polje dok se kuca, a ne kao spisak posle „Sačuvaj".
   * Razlika je između dve vrste problema:
   *   — format (link nije link, poruka preduga) → crveno odmah uz polje;
   *   — nedostaje obavezno → nema crvenog na polju koje niko nije ni dirnuo,
   *     nego jedna rečenica uz dugme koje zbog toga ne radi.
   */
  const linkProblem =
    linkUrl.trim().length > 0 && !/^https?:\/\/\S+\.\S+/.test(linkUrl.trim())
      ? "Link mora počinjati sa http:// ili https://."
      : null;
  const messageProblem =
    dmMessage.length > messageMax
      ? `Poruka je duža za ${dmMessage.length - messageMax} znakova od dozvoljenog.`
      : null;
  const postProblem =
    !dmOnly && !matchAnyPost && postId.trim().length === 0
      ? "Unesi ID objave ili se vrati na „Sve objave”."
      : null;
  const publicReplyProblem =
    publicReplyEnabled && publicReplyMessage.length > PUBLIC_REPLY_MAX
      ? `Javni odgovor je duži za ${publicReplyMessage.length - PUBLIC_REPLY_MAX} znakova.`
      : null;
  const followUpMessageProblem =
    followUpEnabled && followUpMessage.length > DM_MESSAGE_MAX
      ? `Naknadna poruka je duža za ${followUpMessage.length - DM_MESSAGE_MAX} znakova.`
      : null;
  const followUpDelayProblem =
    followUpEnabled &&
    followUpDelay.trim().length > 0 &&
    (!hasFollowUpDelay ||
      followUpDelayMinutes < FOLLOW_UP_DELAY_MIN_MINUTES ||
      followUpDelayMinutes > FOLLOW_UP_DELAY_MAX_MINUTES)
      ? `Kašnjenje ide od ${FOLLOW_UP_DELAY_MIN_MINUTES} do ${FOLLOW_UP_DELAY_MAX_MINUTES} minuta.`
      : null;

  const hasFormatProblem = Boolean(
    linkProblem ||
      messageProblem ||
      postProblem ||
      publicReplyProblem ||
      followUpMessageProblem ||
      followUpDelayProblem,
  );

  // Šta još fali da bi automatizacija uopšte mogla da postoji.
  const missing: string[] = [];
  if (name.trim().length === 0) missing.push("naziv");
  if (keywords.length === 0 && keywordDraft.trim().length === 0)
    missing.push("bar jedna ključna reč");
  if (dmMessage.trim().length === 0) missing.push("tekst poruke");

  const createAutomation = useMutation(api.orAutomationsApi.createAutomation);
  const updateAutomation = useMutation(api.orAutomationsApi.updateAutomation);

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
      platform,
      trigger,
      keywords: finalKeywords,
      matchAnyWord,
      wholeWordMatch,
      matchAnyPost,
      postId: postId.trim() || undefined,
      dmMessage,
      linkUrl: linkUrl.trim() || undefined,
      linkLabel: linkLabel.trim() || undefined,
      publicReplyEnabled: dmOnly ? false : publicReplyEnabled,
      publicReplyMessage: publicReplyMessage.trim() || undefined,
      buttons: sentButtons.map((button) => ({
        label: button.label,
        type: button.type,
        url: button.url.trim() || undefined,
        replyMessage: button.replyMessage.trim() || undefined,
        payload: button.payload ?? undefined,
      })),
      quickReplies: sentQuickReplies.map((quickReply) => ({
        label: quickReply.label,
        replyMessage: quickReply.replyMessage.trim() || undefined,
        payload: quickReply.payload ?? undefined,
      })),
      requireFollow,
      // Empty means "use the default text", which is what the placeholders show.
      followPromptMessage: followPromptMessage.trim() || undefined,
      followPromptButtonLabel: followPromptButtonLabel.trim() || undefined,
      followUpEnabled,
      followUpMessage: followUpMessage.trim() || undefined,
      followUpDelayMinutes: hasFollowUpDelay ? followUpDelayMinutes : undefined,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg border border-accent-400/20 bg-accent-400/10 text-accent-400">
            <MessageCircleReply className="size-4" />
          </div>
          <div>
            <DialogTitle>
              {isEditing ? "Izmeni automatizaciju" : "Nova automatizacija"}
            </DialogTitle>
            <DialogDescription>
              Kada komentar ili poruka na Instagramu sadrži ključnu reč,
              pošiljalac dobija direktnu poruku.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {errorMsg && <FeedbackNote tone="danger" title={errorMsg} />}

      {/* Razmak između celina (28 px) je vidljivo veći od razmaka unutar
          njih (12 px) — forma se tako čita kao pet pitanja, a ne kao spisak
          od dvadeset polja. */}
      <div className="max-h-[60vh] space-y-7 overflow-y-auto pr-1">
        <Field label="Naziv automatizacije">
          {(field) => (
            <Input
              {...field}
              placeholder="npr. Lead magnet — „cenovnik”"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              className="border-line bg-surface"
            />
          )}
        </Field>

        {/* Okidač: ključne reči + podudaranje */}
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
            <Label className="mb-1 block text-xs text-text-muted">
              Gde se automatizacija okida
            </Label>
            <SegmentedControl
              value={platform}
              onChange={(value) => setPlatform(value as AutomationPlatform)}
              disabled={submitting}
              options={[
                { value: "instagram", label: PLATFORM_LABELS.instagram },
                { value: "facebook", label: PLATFORM_LABELS.facebook },
                { value: "both", label: "Obe" },
              ]}
            />
            <p className="mt-1.5 text-xs text-text-muted">
              {platform === "both"
                ? "Ista ključna reč radi i na Instagramu i na Facebook stranici. Poruka se šalje sa naloga na kom je komentar ostavljen."
                : platform === "facebook"
                  ? "Radi samo na objavama Facebook stranice. Instagram komentari se ne razmatraju."
                  : "Radi samo na Instagram nalogu. Facebook komentari se ne razmatraju."}
            </p>
          </div>

          <div>
            <Label className="mb-1 block text-xs text-text-muted">
              Šta pokreće automatizaciju
            </Label>
            <SegmentedControl
              value={trigger}
              onChange={(value) => setTrigger(value as AutomationTrigger)}
              disabled={submitting}
              options={[
                { value: "comment", label: TRIGGER_LABELS.comment },
                { value: "dm", label: TRIGGER_LABELS.dm },
                { value: "both", label: TRIGGER_LABELS.both },
              ]}
            />
            {trigger !== "comment" && (
              <p className="mt-1.5 text-xs text-text-muted">
                Instagram dozvoljava odgovor na poruku samo u roku od 24 sata od
                poslednje poruke korisnika. Posle toga se poruka ne šalje.
              </p>
            )}
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
                  keywords.length === 0 ? "cenovnik, ponuda, info…" : "Dodaj…"
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

          <div className={cn(dmOnly && "hidden")}>
            <Label className="mb-1 block text-xs text-text-muted">
              Objave koje se prate
            </Label>
            <SegmentedControl
              value={matchAnyPost ? "any" : "one"}
              onChange={(value) => setMatchAnyPost(value === "any")}
              disabled={submitting}
              options={[
                { value: "any", label: "Sve objave" },
                { value: "one", label: "Jedna objava" },
              ]}
            />
            {!matchAnyPost && (
              <div className="mt-2">
                <Field label="ID objave" error={postProblem}>
                  {(field) => (
                    <Input
                      {...field}
                      placeholder="media ID iz Instagram API-ja"
                      value={postId}
                      onChange={(e) => setPostId(e.target.value)}
                      disabled={submitting}
                      className="border-line bg-surface font-mono text-xs"
                    />
                  )}
                </Field>
              </div>
            )}
          </div>
        </div>

        <Field
          label="Tekst poruke"
          error={messageProblem}
          action={<CharCount value={dmMessage.length} max={messageMax} />}
        >
          {(field) => (
            <Textarea
              {...field}
              placeholder="Hvala na komentaru! Šaljem ti cenovnik…"
              value={dmMessage}
              onChange={(e) => setDmMessage(e.target.value)}
              disabled={submitting}
              rows={4}
              className="border-line bg-surface"
            />
          )}
        </Field>

        {/* Link */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Link2 className="size-3.5 text-accent-400" />
            <span>Link u poruci</span>
          </span>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_13rem]">
            <Field label="Adresa" error={linkProblem}>
              {(field) => (
                <Input
                  {...field}
                  placeholder="https://enigmait.rs/ponuda"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  disabled={submitting}
                  className="border-line bg-surface text-xs"
                  inputMode="url"
                />
              )}
            </Field>
            <Field label="Naziv linka">
              {(field) => (
                <Input
                  {...field}
                  placeholder="Opciono"
                  value={linkLabel}
                  onChange={(e) => setLinkLabel(e.target.value)}
                  disabled={submitting}
                  className="border-line bg-surface text-xs"
                />
              )}
            </Field>
          </div>
          <p className="text-xs text-text-muted">
            Link se u poruci zamenjuje kratkom adresom sa tvog domena, pa se
            svaki klik broji i prosleđuje u GA4.
          </p>
        </div>

        {/* Dugmad — poruka nosi ili dugmad ili brze odgovore, ne oboje */}
        <div className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MousePointerClick className="size-3.5 text-accent-400" />
              <span>Dugmad u poruci</span>
            </span>
            {tapMode !== "none" && (
              <span className="font-mono text-xs tabular-nums text-text-muted">
                {tapMode === "buttons"
                  ? `${buttons.length}/${BUTTONS_MAX}`
                  : `${quickReplies.length}/${QUICK_REPLIES_MAX}`}
              </span>
            )}
          </div>

          <SegmentedControl
            value={tapMode}
            onChange={(value) => setTapMode(value as TapMode)}
            disabled={submitting}
            options={[
              { value: "none", label: "Bez dugmadi" },
              { value: "buttons", label: "Dugmad" },
              { value: "quickReplies", label: "Brzi odgovori" },
            ]}
          />

          <p className="text-xs text-text-muted">
            {tapMode === "quickReplies"
              ? "Brzi odgovori stoje iznad polja za kucanje i nestaju čim neko izabere jedan."
              : tapMode === "buttons"
                ? "Dugmad ostaju uz poruku i mogu se kliknuti i kasnije. Klik na „Odgovor” šalje poruku koju upišeš ispod."
                : "Dodaj dugmad ako želiš da razgovor ide dalje od jedne poruke."}
          </p>

          {tapMode === "buttons" && (
            <div className="space-y-2.5">
              {buttons.map((button, index) => (
                <TapRow
                  key={button.uid}
                  disabled={submitting}
                  label={button.label}
                  onLabelChange={(label) =>
                    setButtons((prev) =>
                      prev.map((b, i) => (i === index ? { ...b, label } : b)),
                    )
                  }
                  onRemove={() =>
                    setButtons((prev) => prev.filter((_, i) => i !== index))
                  }
                  removeLabel={`Ukloni dugme ${button.label || index + 1}`}
                  head={
                    <SegmentedControl
                      value={button.type}
                      onChange={(value) =>
                        setButtons((prev) =>
                          prev.map((b, i) =>
                            i === index
                              ? { ...b, type: value as "url" | "postback" }
                              : b,
                          ),
                        )
                      }
                      disabled={submitting}
                      options={[
                        { value: "url", label: "Link" },
                        { value: "postback", label: "Odgovor" },
                      ]}
                    />
                  }
                >
                  {button.type === "url" ? (
                    <Input
                      placeholder="https://enigmait.rs/ponuda"
                      value={button.url}
                      onChange={(e) =>
                        setButtons((prev) =>
                          prev.map((b, i) =>
                            i === index ? { ...b, url: e.target.value } : b,
                          ),
                        )
                      }
                      disabled={submitting}
                      className="border-line bg-surface text-xs"
                      inputMode="url"
                    />
                  ) : (
                    <Textarea
                      placeholder="Šta se šalje kada neko klikne na ovo dugme…"
                      value={button.replyMessage}
                      onChange={(e) =>
                        setButtons((prev) =>
                          prev.map((b, i) =>
                            i === index
                              ? { ...b, replyMessage: e.target.value }
                              : b,
                          ),
                        )
                      }
                      disabled={submitting}
                      rows={2}
                      className="border-line bg-surface text-xs"
                    />
                  )}
                </TapRow>
              ))}

              <AddRowButton
                disabled={submitting || buttons.length >= BUTTONS_MAX}
                onClick={() =>
                  setButtons((prev) => [
                    ...prev,
                    {
                      uid: nextUid(),
                      label: "",
                      type: "url",
                      url: "",
                      replyMessage: "",
                      payload: null,
                    },
                  ])
                }
              >
                Dodaj dugme
              </AddRowButton>
            </div>
          )}

          {tapMode === "quickReplies" && (
            <div className="space-y-2.5">
              {quickReplies.map((quickReply, index) => (
                <TapRow
                  key={quickReply.uid}
                  disabled={submitting}
                  label={quickReply.label}
                  onLabelChange={(label) =>
                    setQuickReplies((prev) =>
                      prev.map((q, i) => (i === index ? { ...q, label } : q)),
                    )
                  }
                  onRemove={() =>
                    setQuickReplies((prev) =>
                      prev.filter((_, i) => i !== index),
                    )
                  }
                  removeLabel={`Ukloni brzi odgovor ${quickReply.label || index + 1}`}
                >
                  <Textarea
                    placeholder="Šta se šalje kada neko izabere ovaj odgovor…"
                    value={quickReply.replyMessage}
                    onChange={(e) =>
                      setQuickReplies((prev) =>
                        prev.map((q, i) =>
                          i === index
                            ? { ...q, replyMessage: e.target.value }
                            : q,
                        ),
                      )
                    }
                    disabled={submitting}
                    rows={2}
                    className="border-line bg-surface text-xs"
                  />
                </TapRow>
              ))}

              <AddRowButton
                disabled={
                  submitting || quickReplies.length >= QUICK_REPLIES_MAX
                }
                onClick={() =>
                  setQuickReplies((prev) => [
                    ...prev,
                    {
                      uid: nextUid(),
                      label: "",
                      replyMessage: "",
                      payload: null,
                    },
                  ])
                }
              >
                Dodaj brzi odgovor
              </AddRowButton>
            </div>
          )}
        </div>

        {/* Zaprati pre poruke — kapija koja traži praćenje */}
        <div className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <UserRoundPlus className="size-3.5 text-accent-400" />
                <span>Zaprati pre poruke</span>
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Ko ne prati nalog, prvo dobija poziv da zaprati. Poruku dobija
                čim klikne na dugme.
              </p>
            </div>
            <PillToggle
              on={requireFollow}
              onChange={setRequireFollow}
              disabled={submitting}
              onLabel="Uključena"
              offLabel="Isključena"
            />
          </div>

          {requireFollow && gateReachesFacebook && (
            <p className="rounded-lg border border-line-soft bg-surface-raised/40 px-3 py-2 text-xs leading-relaxed text-text-muted">
              Facebook nema način da proveri da li neko prati stranicu, pa na
              Facebook-u kapija ne radi — poruka odlazi odmah. Podešavanje ispod
              važi samo za Instagram.
            </p>
          )}

          {requireFollow && (
            <div className="space-y-2.5">
              <Textarea
                placeholder={FOLLOW_PROMPT_MESSAGE_DEFAULT}
                value={followPromptMessage}
                onChange={(e) => setFollowPromptMessage(e.target.value)}
                disabled={submitting}
                rows={2}
                className="border-line bg-surface text-xs"
              />
              <div className="grid gap-2.5 sm:grid-cols-[auto_1fr] sm:items-center">
                <Input
                  placeholder={FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT}
                  value={followPromptButtonLabel}
                  onChange={(e) => setFollowPromptButtonLabel(e.target.value)}
                  disabled={submitting}
                  maxLength={BUTTON_TITLE_MAX}
                  className="border-line bg-surface text-xs sm:w-52"
                />
                <p className="text-xs text-text-muted">
                  Natpis na dugmetu koje otvara poruku. Ostavi prazno za
                  podrazumevani tekst.
                </p>
              </div>

              <DmPreview
                caption="Poruka pre nego što neko zaprati"
                message={
                  followPromptMessage.trim() || FOLLOW_PROMPT_MESSAGE_DEFAULT
                }
                buttons={[
                  {
                    label:
                      followPromptButtonLabel.trim() ||
                      FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT,
                    type: "postback",
                  },
                ]}
              />

              <p className="text-xs text-text-muted">
                Ako Instagram ne može da proveri praćenje, poruka ide normalno —
                kapija nikada ne zadržava poruku bez odgovora.
              </p>
            </div>
          )}
        </div>

        {/* Naknadna poruka — drugi dodir posle prve poruke */}
        <div className="space-y-3 rounded-xl border border-line bg-surface/50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Clock className="size-3.5 text-accent-400" />
                <span>Naknadna poruka</span>
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Druga poruka stiže sama, određeno vreme posle prve.
              </p>
            </div>
            <PillToggle
              on={followUpEnabled}
              onChange={setFollowUpEnabled}
              disabled={submitting}
              onLabel="Uključena"
              offLabel="Isključena"
            />
          </div>

          {followUpEnabled && (
            <div className="space-y-2.5">
              <Field
                label="Tekst naknadne poruke"
                error={followUpMessageProblem}
                action={
                  <CharCount
                    value={followUpMessage.length}
                    max={DM_MESSAGE_MAX}
                  />
                }
              >
                {(field) => (
                  <Textarea
                    {...field}
                    placeholder="Jesi li stigao/la da pogledaš? Tu sam za svako pitanje."
                    value={followUpMessage}
                    onChange={(e) => setFollowUpMessage(e.target.value)}
                    disabled={submitting}
                    rows={2}
                    className="border-line bg-surface text-xs"
                  />
                )}
              </Field>

              <div className="grid gap-2.5 sm:grid-cols-[auto_1fr] sm:items-center">
                <Field label="Kašnjenje (minuta)" error={followUpDelayProblem}>
                  {(field) => (
                    <Input
                      {...field}
                      type="number"
                      inputMode="numeric"
                      min={FOLLOW_UP_DELAY_MIN_MINUTES}
                      max={FOLLOW_UP_DELAY_MAX_MINUTES}
                      placeholder="60"
                      value={followUpDelay}
                      onChange={(e) => setFollowUpDelay(e.target.value)}
                      disabled={submitting}
                      className="w-28 border-line bg-surface font-mono text-xs tabular-nums"
                    />
                  )}
                </Field>
                <p className="text-xs text-text-muted">
                  Stiže{" "}
                  {formatFollowUpDelay(
                    hasFollowUpDelay ? followUpDelayMinutes : undefined,
                  )}{" "}
                  posle prve poruke. Najduže 23 h — posle 24 sata od poslednje
                  poruke korisnika Instagram više ne dozvoljava odgovor.
                </p>
              </div>

              <DmPreview
                caption="Poruka koja stiže kasnije"
                message={followUpMessage}
                linkUrl={
                  linkUrl.trim().length === 0
                    ? ""
                    : (automationToEdit?.trackedLinkUrl ?? linkUrl)
                }
                linkDestination={linkUrl.trim()}
                linkLabel={linkLabel}
              />

              <p className="text-xs text-text-muted">
                Naknadna poruka ide bez dugmadi. Ako je prozor od 24 sata do
                tada istekao, poruka se ne šalje i u DM logu stoji „Van
                prozora”.
              </p>
            </div>
          )}
        </div>

        {/* Javni odgovor — postoji samo kad automatizaciju pokreće komentar */}
        <div
          className={cn(
            "space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5",
            dmOnly && "hidden",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-foreground">
                Javni odgovor na komentar
              </span>
              <p className="mt-0.5 text-xs text-text-muted">
                Instagram traži da odgovoriš i javno kada šalješ DM.
              </p>
            </div>
            <PillToggle
              on={publicReplyEnabled}
              onChange={setPublicReplyEnabled}
              disabled={submitting}
              onLabel="Uključen"
              offLabel="Isključen"
            />
          </div>
          {publicReplyEnabled && (
            <Field
              label="Tekst javnog odgovora"
              error={publicReplyProblem}
              action={
                <CharCount
                  value={publicReplyMessage.length}
                  max={PUBLIC_REPLY_MAX}
                />
              }
            >
              {(field) => (
                <Textarea
                  {...field}
                  placeholder="Poslato u DM! 📩"
                  value={publicReplyMessage}
                  onChange={(e) => setPublicReplyMessage(e.target.value)}
                  disabled={submitting}
                  rows={2}
                  className="border-line bg-surface text-xs"
                />
              )}
            </Field>
          )}
        </div>

        {/* Živi pregled poruke */}
        <div className="rounded-xl border border-line-soft bg-card p-3.5">
          <DmPreview
            message={dmMessage}
            // An existing automation keeps its short link even when the
            // destination changes, so preview the real one when we have it.
            linkUrl={
              linkUrl.trim().length === 0
                ? ""
                : (automationToEdit?.trackedLinkUrl ?? linkUrl)
            }
            linkDestination={linkUrl.trim()}
            linkLabel={linkLabel}
            publicReply={
              publicReplyEnabled && !dmOnly ? publicReplyMessage : null
            }
            buttons={sentButtons}
            quickReplies={sentQuickReplies}
          />
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
            disabled={submitting || hasFormatProblem || missing.length > 0}
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

/**
 * One editable button or quick reply: the label everyone sees, whatever that
 * kind needs underneath it, and a way to take it back out.
 */
function TapRow({
  label,
  onLabelChange,
  onRemove,
  removeLabel,
  head,
  children,
  disabled,
}: {
  label: string;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
  removeLabel: string;
  head?: React.ReactNode;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-line-soft bg-surface p-2.5">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Natpis na dugmetu"
          value={label}
          onChange={(e) => onLabelChange(e.target.value)}
          disabled={disabled}
          maxLength={BUTTON_TITLE_MAX}
          className="h-8 border-line bg-surface-raised text-xs"
        />
        {head}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={removeLabel}
          className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:text-danger disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      </div>
      {children}
    </div>
  );
}

function AddRowButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className="w-full border-dashed border-line text-text-muted hover:text-foreground"
    >
      <Plus className="size-3.5" />
      <span>{children}</span>
    </Button>
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
