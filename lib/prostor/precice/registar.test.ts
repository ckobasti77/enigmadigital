// Preneto iz Devotion apps/web/lib/shortcuts/registry.test.ts (main @ c05c40f), SPAJANJE S08.
import { describe, expect, test } from "vitest";

import {
  CHAT_LIST_HELP,
  CHAT_SHORTCUTS,
  groupShortcuts,
  isTypingTarget,
  matchShortcut,
  SHELL_SHORTCUTS,
  shortcutKeys,
  type ShortcutDef,
  type ShortcutEvent,
} from "./registar";

const DEFS: ShortcutDef[] = [
  SHELL_SHORTCUTS.help,
  SHELL_SHORTCUTS.quickAdd,
  SHELL_SHORTCUTS.search,
  { id: "search-focus", key: "/", label: "Pretraga liste", group: "Liste zadataka" },
  { id: "next", key: "j", label: "Sledeći", group: "Liste zadataka", allowRepeat: true },
  { id: "open", key: "Enter", label: "Otvori", group: "Liste zadataka" },
];

function event(partial: Partial<ShortcutEvent> & { key: string }): ShortcutEvent {
  return {
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    typing: false,
    dialogOpen: false,
    ...partial,
  };
}

describe("podudaranje prečica", () => {
  test("slovo bez modifikatora; veliko slovo bez Shift-a (Caps Lock) takođe", () => {
    expect(matchShortcut(event({ key: "q" }), DEFS)).toBe("quick-add");
    expect(matchShortcut(event({ key: "Q" }), DEFS)).toBe("quick-add");
  });

  test("Shift+slovo, Alt i Ctrl ne pogađaju prečicu bez modifikatora", () => {
    expect(matchShortcut(event({ key: "Q", shiftKey: true }), DEFS)).toBeNull();
    expect(matchShortcut(event({ key: "q", altKey: true }), DEFS)).toBeNull();
    expect(matchShortcut(event({ key: "q", ctrlKey: true }), DEFS)).toBeNull();
  });

  test("? i / rade i kad raspored traži Shift (srpski raspored)", () => {
    expect(matchShortcut(event({ key: "?", shiftKey: true }), DEFS)).toBe("help");
    expect(matchShortcut(event({ key: "?" }), DEFS)).toBe("help");
    expect(matchShortcut(event({ key: "/", shiftKey: true, code: "Digit7" }), DEFS)).toBe("search-focus");
  });

  test("ćirilični raspored: slovo po event.code", () => {
    expect(matchShortcut(event({ key: "љ", code: "KeyQ" }), DEFS)).toBe("quick-add");
    expect(matchShortcut(event({ key: "ј", code: "KeyJ" }), DEFS)).toBe("next");
    expect(matchShortcut(event({ key: "ш", code: "BracketLeft" }), DEFS)).toBeNull();
  });

  test("Ctrl/⌘+K: oba modifikatora, i u polju i uz otvoren dijalog", () => {
    expect(matchShortcut(event({ key: "k", ctrlKey: true }), DEFS)).toBe("search");
    expect(matchShortcut(event({ key: "k", metaKey: true }), DEFS)).toBe("search");
    expect(matchShortcut(event({ key: "k", ctrlKey: true, typing: true, dialogOpen: true }), DEFS)).toBe("search");
    expect(matchShortcut(event({ key: "k" }), DEFS)).toBeNull();
  });

  test("dok se kuca ili je otvoren dijalog, obične prečice ćute", () => {
    expect(matchShortcut(event({ key: "q", typing: true }), DEFS)).toBeNull();
    expect(matchShortcut(event({ key: "?", shiftKey: true, dialogOpen: true }), DEFS)).toBeNull();
  });

  test("ponavljanje dok se drži taster: samo gde je dozvoljeno", () => {
    expect(matchShortcut(event({ key: "q", repeat: true }), DEFS)).toBeNull();
    expect(matchShortcut(event({ key: "j", repeat: true }), DEFS)).toBe("next");
  });

  test("imenovani taster po tačnom imenu", () => {
    expect(matchShortcut(event({ key: "Enter" }), DEFS)).toBe("open");
    expect(matchShortcut(event({ key: "Enter", shiftKey: true }), DEFS)).toBeNull();
  });
});

describe("polje za unos", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({
    tagName,
    getAttribute: (name: string) => (extra[name] as string | undefined) ?? null,
    ...extra,
  });

  test("input teksta, textarea, select i contenteditable jesu", () => {
    expect(isTypingTarget(el("INPUT", { type: "text" }))).toBe(true);
    expect(isTypingTarget(el("INPUT", { type: "search" }))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el("DIV", { role: "combobox" }))).toBe(true);
  });

  test("dugme, kvačica i telo stranice nisu", () => {
    expect(isTypingTarget(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget(el("BODY"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("prikaz u dijalogu pomoći", () => {
  test("tasteri za prikaz", () => {
    expect(shortcutKeys(SHELL_SHORTCUTS.search)).toEqual(["Ctrl", "K"]);
    expect(shortcutKeys(SHELL_SHORTCUTS.search, true)).toEqual(["⌘", "K"]);
    expect(shortcutKeys(SHELL_SHORTCUTS.help)).toEqual(["?"]);
    expect(shortcutKeys(SHELL_SHORTCUTS.quickAdd)).toEqual(["Q"]);
    expect(shortcutKeys({ id: "x", key: "ArrowDown", label: "", group: "Inbox" })).toEqual(["↓"]);
  });

  test("grupe idu redom, duplikat po id-u jednom", () => {
    const groups = groupShortcuts([...DEFS, SHELL_SHORTCUTS.help]);
    expect(groups.map((entry) => entry.group)).toEqual(["Svuda", "Liste zadataka"]);
    expect(groups[0].defs.map((def) => def.id)).toEqual(["help", "quick-add", "search"]);
  });
});

describe("Poruke (K15)", () => {
  const defs = [...Object.values(CHAT_SHORTCUTS), ...CHAT_LIST_HELP];

  test("/ (i sa Shift-om), n (i ćirilično), Esc; strelice i Enter samo u pomoći", () => {
    expect(matchShortcut(event({ key: "/" }), defs)).toBe("chat-search");
    expect(matchShortcut(event({ key: "/", shiftKey: true }), defs)).toBe("chat-search");
    expect(matchShortcut(event({ key: "n" }), defs)).toBe("chat-new-message");
    expect(matchShortcut(event({ key: "н", code: "KeyN" }), defs)).toBe("chat-new-message");
    expect(matchShortcut(event({ key: "Escape" }), defs)).toBe("chat-back");
    expect(matchShortcut(event({ key: "ArrowDown" }), defs)).toBeNull();
    expect(matchShortcut(event({ key: "Enter" }), defs)).toBeNull();
  });

  test("ništa dok se kuca (kompozitor, pretraga) ili dok je dijalog otvoren", () => {
    expect(matchShortcut(event({ key: "Escape", typing: true }), defs)).toBeNull();
    expect(matchShortcut(event({ key: "n", typing: true }), defs)).toBeNull();
    expect(matchShortcut(event({ key: "n", dialogOpen: true }), defs)).toBeNull();
  });

  test("u pomoći je jedna grupa „Poruke“", () => {
    const groups = groupShortcuts(defs);
    expect(groups.map((entry) => entry.group)).toEqual(["Poruke"]);
    expect(groups[0].defs.map((def) => def.id)).toEqual([
      "chat-search",
      "chat-new-message",
      "chat-back",
      "chat-list-move",
      "chat-list-open",
    ]);
  });
});
