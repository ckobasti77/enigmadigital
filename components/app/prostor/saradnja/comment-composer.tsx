"use client";

// Preneto iz Devotion apps/web/components/collab/comment-composer.tsx (main @ c05c40f), SPAJANJE S11.
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { insertMention, mentionQueryAt, serializeComment, type MentionCandidate } from "@/lib/prostor/mentions";

import { Button } from "@/components/ui/button";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { cn } from "@/lib/utils";

import { keptMentions, mentionSuggestions } from "@/lib/prostor/modeli/collab-model";

export type MentionMember = MentionCandidate & { avatarUrl: string | null };

export type CommentPayload = { content: string; mentionProfileIds: string[] };

/** Najviše redova pre unutrašnjeg skrola (K07 §6.1). */
const MAX_ROWS = 8;
const LINE_PX = 24;

export type CommentComposerProps = {
  members: ReadonlyArray<MentionMember>;
  selfProfileId: string | null;
  onSubmit: (payload: CommentPayload) => Promise<void>;
  /** Izmena u mestu: postojeći tekst i pominjanja. */
  initial?: { text: string; mentions: MentionCandidate[] };
  submitLabel?: string;
  onCancel?: () => void;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
  failureMessage?: string;
  /** Izlog: lista za @ otvorena za ovaj upit (bez kucanja). */
  previewQuery?: string;
  className?: string;
};

/**
 * Unos komentara (K07 §6.1): polje koje raste do 8 redova; `@` otvara listu
 * članova (strelice, Enter/Tab bira, Esc zatvara); Ctrl/⌘ Enter šalje. Tekst
 * ostaje u polju dok server ne potvrdi — neuspeh ga ne briše.
 */
export function CommentComposer({
  members,
  selfProfileId,
  onSubmit,
  initial,
  submitLabel = "Pošalji",
  onCancel,
  autoFocus = false,
  label = "Novi komentar",
  placeholder = "Napiši komentar… (@ za pominjanje)",
  failureMessage = "Komentar nije poslat. Pokušaj ponovo.",
  previewQuery,
  className,
}: CommentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const errorId = useId();
  const [text, setText] = useState(initial?.text ?? "");
  const [mentions, setMentions] = useState<MentionCandidate[]>(initial?.mentions ?? []);
  const [query, setQuery] = useState<string | null>(previewQuery ?? null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const suggestions = query === null ? [] : mentionSuggestions(members, query, selfProfileId);
  const menuOpen = suggestions.length > 0;
  const optionId = (profileId: string) => `${listId}-${profileId}`;
  const empty = text.trim() === "";

  // Polje raste sa tekstom do 8 redova, pa skroluje.
  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, MAX_ROWS * LINE_PX + 18)}px`;
  }, [text]);

  function syncQuery(element: HTMLTextAreaElement) {
    const found = mentionQueryAt(element.value, element.selectionStart ?? element.value.length);
    setQuery(found?.query ?? null);
    setActiveIndex(0);
  }

  function pick(member: MentionMember) {
    const element = textareaRef.current;
    const caret = element?.selectionStart ?? text.length;
    const next = insertMention(text, caret, member);
    setText(next.text);
    setMentions((current) =>
      current.some((item) => item.profileId === member.profileId)
        ? current
        : [...current, { profileId: member.profileId, displayName: member.displayName }],
    );
    setQuery(null);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      target.focus();
      target.setSelectionRange(next.caret, next.caret);
    });
  }

  async function submit() {
    if (busy || empty) return;
    const payload = serializeComment(text, keptMentions(text, mentions));
    if (payload.content === "") return;
    setBusy(true);
    setFailed(false);
    try {
      await onSubmit(payload);
      if (!initial) {
        setText("");
        setMentions([]);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        // Esc zatvara samo listu, ne fioku ni stranicu.
        event.preventDefault();
        event.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
      return;
    }
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        {menuOpen ? (
          <span role="status" className="sr-only">
            {suggestions.length} članova za pominjanje
          </span>
        ) : null}
        {menuOpen ? (
          <ul
            role="listbox"
            id={listId}
            aria-label="Članovi za pominjanje"
            className="scrollbar-thin absolute bottom-full left-0 z-30 mb-1 max-h-60 w-64 max-w-full overflow-y-auto rounded-lg border border-line bg-popover p-1 shadow-elev-2"
          >
            {suggestions.map((member, index) => (
              <li
                key={member.profileId}
                role="option"
                id={optionId(member.profileId)}
                aria-selected={index === activeIndex}
                // Pre blur-a polja, da izbor ne izgubi fokus.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(member);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-ui pointer-coarse:min-h-11",
                  index === activeIndex ? "bg-surface-control-hover text-foreground" : "text-text-secondary",
                )}
              >
                <ProfileAvatar profile={member} className="size-5" />
                <span className="min-w-0 flex-1 truncate">{member.displayName}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <textarea
          ref={textareaRef}
          value={text}
          rows={2}
          maxLength={12_000}
          autoFocus={autoFocus}
          aria-label={label}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={menuOpen}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          data-escape-local={menuOpen || onCancel ? "true" : undefined}
          aria-controls={menuOpen ? listId : undefined}
          aria-activedescendant={menuOpen ? optionId(suggestions[Math.min(activeIndex, suggestions.length - 1)].profileId) : undefined}
          aria-describedby={failed ? errorId : undefined}
          aria-keyshortcuts="Control+Enter Meta+Enter"
          // Isti izgled kao `ui/textarea`; svoj element zbog @ liste (combobox).
          className="block w-full resize-none rounded-lg border border-input bg-input/30 px-2.5 py-2 text-ui leading-6 text-foreground outline-none transition-colors placeholder:text-text-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          onChange={(event) => {
            setText(event.target.value);
            setFailed(false);
            syncQuery(event.target);
          }}
          onClick={(event) => syncQuery(event.currentTarget)}
          onKeyUp={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) syncQuery(event.currentTarget);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setQuery(null)}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {failed ? (
          <p id={errorId} role="alert" className="mr-auto text-meta leading-5 text-danger">
            {failureMessage}
          </p>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Otkaži
          </Button>
        ) : null}
        <Button variant="secondary" type="button" size="sm" disabled={busy || empty} onClick={() => void submit()}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
