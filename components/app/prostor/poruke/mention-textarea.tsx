"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/mention-textarea.tsx (main @ c05c40f), SPAJANJE S15.
import { useId, useMemo, useRef, useState } from "react";

import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMember } from "@/lib/prostor/web/chat";
import { cn } from "@/lib/utils";

type MentionQuery = { start: number; query: string };

/**
 * Pronalazi aktivni `@token` neposredno pre kursora. Token počinje `@` (na
 * početku ili posle razmaka) i ne sme da sadrži razmak — dakle otvara se dok se
 * kuca prva reč imena.
 */
function findMentionQuery(value: string, caret: number): MentionQuery | null {
  let index = caret - 1;
  while (index >= 0) {
    const char = value[index];
    if (char === "@") {
      const before = index === 0 ? " " : value[index - 1];
      if (index === 0 || /\s|[(<]/.test(before)) {
        return { start: index, query: value.slice(index + 1, caret) };
      }
      return null;
    }
    if (/\s/.test(char)) return null;
    index -= 1;
  }
  return null;
}

export function MentionTextarea({
  value,
  onChange,
  members,
  onSubmit,
  onPaste,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Ko se nudi posle `@` (`mentionCandidates` po opsegu razgovora). */
  members: ChatMember[] | undefined;
  onSubmit: () => void;
  /** Nalepljen sadržaj (slika iz clipboard-a) — vidi `message-composer.tsx`. */
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const optionId = (profileId: string) => `${listId}-${profileId}`;

  const matches = useMemo(() => {
    if (mention === null || members === undefined) return [];
    const term = mention.query.toLowerCase();
    return members
      .filter((member) => member.profile.displayName.toLowerCase().includes(term))
      .slice(0, 6);
  }, [mention, members]);

  const menuOpen = mention !== null && matches.length > 0;

  function syncMention(textarea: HTMLTextAreaElement) {
    const found = findMentionQuery(textarea.value, textarea.selectionStart ?? 0);
    setMention(found);
    setActiveIndex(0);
  }

  function select(member: ChatMember) {
    const textarea = textareaRef.current;
    if (mention === null || textarea === null) return;
    const caret = textarea.selectionStart ?? value.length;
    const insert = `@${member.profile.displayName} `;
    const next = value.slice(0, mention.start) + insert + value.slice(caret);
    onChange(next);
    setMention(null);
    const nextCaret = mention.start + insert.length;
    requestAnimationFrame(() => {
      const element = textareaRef.current;
      if (element) {
        element.focus();
        element.setSelectionRange(nextCaret, nextCaret);
      }
    });
  }

  return (
    <div className="relative flex-1">
      {menuOpen ? (
        <ul
          role="listbox"
          id={listId}
          aria-label="Predlozi za pominjanje"
          className="scrollbar-thin absolute bottom-full left-0 z-30 mb-1 max-h-56 w-64 overflow-y-auto rounded-xl border border-line bg-popover p-1 shadow-lg"
        >
          {matches.map((member, index) => (
            <li key={member.profile._id}>
              <button
                type="button"
                role="option"
                id={optionId(member.profile._id)}
                aria-selected={index === activeIndex}
                // onMouseDown pre blur-a textarea-e, da izbor ne izgubi fokus.
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(member);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-ui text-foreground transition-colors pointer-coarse:min-h-11",
                  index === activeIndex && "bg-surface-control-hover",
                )}
              >
                <ProfileAvatar profile={member.profile} className="size-6" />
                <span className="min-w-0 flex-1 truncate">
                  {member.profile.displayName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Textarea
        ref={textareaRef}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        maxLength={10_000}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? listId : undefined}
        aria-activedescendant={
          menuOpen ? optionId(matches[activeIndex].profile._id) : undefined
        }
        className="max-h-40 min-h-11 resize-none rounded-2xl bg-card py-2.5"
        onChange={(event) => {
          onChange(event.target.value);
          syncMention(event.target);
        }}
        onPaste={onPaste}
        onClick={(event) => syncMention(event.currentTarget)}
        onKeyUp={(event) => {
          if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            syncMention(event.currentTarget);
          }
        }}
        onKeyDown={(event) => {
          if (menuOpen) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              select(matches[activeIndex]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMention(null);
              return;
            }
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit();
          }
        }}
        onBlur={() => setMention(null)}
      />
    </div>
  );
}
