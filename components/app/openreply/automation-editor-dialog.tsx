"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { Loader2, MessageCircleReply, Link2, X } from "lucide-react";
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
import { DmPreview } from "./dm-preview";
import { cn } from "@/lib/utils";

type AutomationView = FunctionReturnType<
  typeof api.orAutomationsApi.listAutomations
>[number];

// Mirrors the limits enforced in convex/orAutomationsApi.ts.
const KEYWORDS_MAX = 20;
const DM_MESSAGE_MAX = 900;
const PUBLIC_REPLY_MAX = 280;

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
  const [isActive, setIsActive] = useState(automationToEdit?.isActive ?? true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      keywords: finalKeywords,
      matchAnyWord,
      wholeWordMatch,
      matchAnyPost,
      postId: postId.trim() || undefined,
      dmMessage,
      linkUrl: linkUrl.trim() || undefined,
      linkLabel: linkLabel.trim() || undefined,
      publicReplyEnabled,
      publicReplyMessage: publicReplyMessage.trim() || undefined,
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
      setErrorMsg(
        convexMessage(err, "Čuvanje nije uspelo. Pokušaj ponovo."),
      );
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
              Kada komentar na Instagramu sadrži ključnu reč, autor komentara
              dobija direktnu poruku.
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
            placeholder="npr. Lead magnet — „cenovnik”"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className="border-line bg-surface"
          />
        </div>

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
              Enter ili zarez dodaje reč. Mala slova i naša slova (č, ć, š, ž, đ)
              se izjednačavaju automatski.
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
              <Input
                placeholder="ID objave (media ID iz Instagram API-ja)"
                value={postId}
                onChange={(e) => setPostId(e.target.value)}
                disabled={submitting}
                className="mt-2 border-line bg-surface font-mono text-xs"
              />
            )}
          </div>
        </div>

        {/* Poruka */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <Label className="text-xs font-medium text-text-muted">
              Tekst poruke
            </Label>
            <span
              className={cn(
                "font-mono text-xs tabular-nums",
                dmMessage.length > DM_MESSAGE_MAX
                  ? "text-danger"
                  : "text-text-muted",
              )}
            >
              {dmMessage.length}/{DM_MESSAGE_MAX}
            </span>
          </div>
          <Textarea
            placeholder="Hvala na komentaru! Šaljem ti cenovnik…"
            value={dmMessage}
            onChange={(e) => setDmMessage(e.target.value)}
            disabled={submitting}
            rows={4}
            className="border-line bg-surface"
          />
        </div>

        {/* Link */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Link2 className="size-3.5 text-accent-400" />
            <span>Link u poruci</span>
          </span>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
            <Input
              placeholder="https://enigmait.rs/ponuda"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              disabled={submitting}
              className="border-line bg-surface text-xs"
              inputMode="url"
            />
            <Input
              placeholder="Naziv linka (opciono)"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              disabled={submitting}
              className="border-line bg-surface text-xs sm:w-52"
            />
          </div>
          <p className="text-xs text-text-muted">
            Link se u poruci zamenjuje kratkom adresom sa tvog domena, pa se
            svaki klik broji i prosleđuje u GA4.
          </p>
        </div>

        {/* Javni odgovor */}
        <div className="space-y-2.5 rounded-xl border border-line bg-surface/50 p-3.5">
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
            <div>
              <Textarea
                placeholder="Poslato u DM! 📩"
                value={publicReplyMessage}
                onChange={(e) => setPublicReplyMessage(e.target.value)}
                disabled={submitting}
                rows={2}
                className="border-line bg-surface text-xs"
              />
              <span
                className={cn(
                  "mt-1 block text-right font-mono text-xs tabular-nums",
                  publicReplyMessage.length > PUBLIC_REPLY_MAX
                    ? "text-danger"
                    : "text-text-muted",
                )}
              >
                {publicReplyMessage.length}/{PUBLIC_REPLY_MAX}
              </span>
            </div>
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
            linkLabel={linkLabel}
            publicReply={publicReplyEnabled ? publicReplyMessage : null}
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

function SegmentedControl({
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
    <div className="grid grid-cols-2 gap-2">
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
