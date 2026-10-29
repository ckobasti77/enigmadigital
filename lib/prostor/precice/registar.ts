// Preneto iz Devotion apps/web/lib/shortcuts/registry.ts (main @ c05c40f), SPAJANJE S08.
/**
 * Registar tastaturnih prečica — ČISTO (vitest). Jedan `keydown` slušalac
 * (`components/app/prostor/precice/precice-provider.tsx`) pita `matchShortcut` koja
 * prečica važi. Prečice su IZUZETAK „samo web" (telefon ima gestove).
 *
 * Pravila (plan K07, E17 i §6.1):
 * - podudaranje po `event.key`; slova bez obzira na veličinu, ali bez Shift-a;
 * - za simbole `?` i `/` Shift se ignoriše (srpski raspored: Shift+' i Shift+7);
 * - kad je raspored ćirilični, slovo se prepoznaje po `event.code` (`KeyQ`);
 * - ništa dok se kuca u polju, dok je otvoren drugi dijalog ili uz Alt,
 *   osim ako definicija to izričito dozvoli.
 */

export type ShortcutGroup = "Svuda" | "Liste zadataka" | "Inbox" | "Poruke" | "Birač datuma";

export const SHORTCUT_GROUP_ORDER: ReadonlyArray<ShortcutGroup> = [
  "Svuda",
  "Liste zadataka",
  "Inbox",
  "Poruke",
  "Birač datuma",
];

export type ShortcutDef = {
  id: string;
  /** `event.key` (malo slovo za slova, sam simbol za simbole). */
  key: string;
  /** Ctrl na Windows/Linux, ⌘ na macOS. */
  mod?: boolean;
  /** Traži Shift (samo za slova; simboli ga ignorišu). */
  shift?: boolean;
  label: string;
  group: ShortcutGroup;
  /** Radi i dok je fokus u polju za unos. */
  allowInInputs?: boolean;
  /** Radi i dok je otvoren drugi dijalog. */
  allowInDialogs?: boolean;
  /** Ponavljanje dok se drži taster (npr. j/k); podrazumevano ne. */
  allowRepeat?: boolean;
  /**
   * Samo za dijalog pomoći (npr. tasteri birača datuma, koje obrađuje sam
   * birač): `matchShortcut` ga nikad ne vraća.
   */
  displayOnly?: boolean;
  /** Ne prikazuje se u dijalogu pomoći (npr. strelica uz j/k — prikazuje je `helpKeys`). */
  hideInHelp?: boolean;
  /** Prikaz u pomoći: alternative (svaka je kombinacija tastera), npr. `[["J"], ["↓"]]`. */
  helpKeys?: string[][];
};

export type ShortcutEvent = {
  key: string;
  code?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat?: boolean;
  /** Fokus je u polju za unos (`isTypingTarget`). */
  typing: boolean;
  /** Otvoren je modalni dijalog/sheet/popover. */
  dialogOpen: boolean;
};

/** Simboli za koje se Shift ignoriše (na raznim rasporedima traže Shift). */
const SHIFT_AGNOSTIC = new Set(["?", "/"]);

function isLatinLetter(value: string) {
  return /^[a-z]$/i.test(value);
}

/** Slovo koje je taster proizveo, uz rezervu `KeyX` za ćirilični raspored. */
function pressedLetter(event: Pick<ShortcutEvent, "key" | "code">): string | null {
  if (isLatinLetter(event.key)) return event.key.toLowerCase();
  if (event.key.length === 1 && event.code && /^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3).toLowerCase();
  }
  return null;
}

function matchesKey(def: ShortcutDef, event: ShortcutEvent): boolean {
  const mod = event.ctrlKey || event.metaKey;
  if (Boolean(def.mod) !== mod) return false;
  if (event.altKey) return false;

  if (SHIFT_AGNOSTIC.has(def.key)) return event.key === def.key;

  if (isLatinLetter(def.key)) {
    if (Boolean(def.shift) !== event.shiftKey) return false;
    return pressedLetter(event) === def.key.toLowerCase();
  }

  // Imenovani tasteri (Enter, Escape, ArrowDown…): tačno ime, Shift po definiciji.
  if (Boolean(def.shift) !== event.shiftKey) return false;
  return event.key === def.key;
}

/** Prva definicija koja važi za događaj, ili `null`. */
export function matchShortcut(
  event: ShortcutEvent,
  defs: ReadonlyArray<ShortcutDef>,
): string | null {
  for (const def of defs) {
    if (def.displayOnly) continue;
    if (event.typing && !def.allowInInputs) continue;
    if (event.dialogOpen && !def.allowInDialogs) continue;
    if (event.repeat && !def.allowRepeat) continue;
    if (matchesKey(def, event)) return def.id;
  }
  return null;
}

type TargetLike = {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
  type?: string;
};

/** Tipovi `<input>` u koje se ne kuca tekst — prečice tu rade. */
const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"]);

/** Da li je fokus u polju za unos teksta (input, textarea, select, contenteditable). */
export function isTypingTarget(target: unknown): boolean {
  if (target === null || typeof target !== "object") return false;
  const element = target as TargetLike;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input") {
    const type = (element.type ?? element.getAttribute?.("type") ?? "text").toLowerCase();
    return !NON_TEXT_INPUTS.has(type);
  }
  const role = element.getAttribute?.("role");
  return role === "textbox" || role === "combobox" || role === "searchbox";
}

/** Tasteri za prikaz u dijalogu pomoći: `["Ctrl", "K"]`, `["?"]`. */
export function shortcutKeys(def: ShortcutDef, isMac = false): string[] {
  const keys: string[] = [];
  if (def.mod) keys.push(isMac ? "⌘" : "Ctrl");
  if (def.shift && isLatinLetter(def.key)) keys.push("Shift");
  keys.push(isLatinLetter(def.key) ? def.key.toUpperCase() : KEY_NAMES[def.key] ?? def.key);
  return keys;
}

const KEY_NAMES: Record<string, string> = {
  Enter: "Enter",
  Escape: "Esc",
  ArrowDown: "↓",
  ArrowUp: "↑",
  ArrowLeft: "←",
  ArrowRight: "→",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Home: "Home",
  End: "End",
};

/** Alternative za dijalog pomoći: `helpKeys` ili jedina kombinacija prečice. */
export function shortcutHelpKeys(def: ShortcutDef, isMac = false): string[][] {
  return def.helpKeys ?? [shortcutKeys(def, isMac)];
}

/** Prečice ljuske (K08). Kasniji koraci dodaju svoje kroz `useShortcuts`. */
export const SHELL_SHORTCUTS = {
  help: { id: "help", key: "?", label: "Prečice", group: "Svuda" },
  quickAdd: { id: "quick-add", key: "q", label: "Brzi unos", group: "Svuda" },
  search: {
    id: "search",
    key: "k",
    mod: true,
    label: "Pretraga",
    group: "Svuda",
    allowInInputs: true,
    allowInDialogs: true,
  },
} as const satisfies Record<string, ShortcutDef>;

const LIST = "Liste zadataka" as const;

/**
 * Prečice liste zadataka (plan K07 §6.1, E20): Moj dan, Moji zadaci, a od K17
 * i liste u startupu. Registruje ih `useTaskListShortcuts`.
 */
export const TASK_LIST_SHORTCUTS = {
  next: { id: "list-next", key: "j", label: "Sledeći zadatak", group: LIST, allowRepeat: true, helpKeys: [["J"], ["↓"]] },
  nextArrow: { id: "list-next-arrow", key: "ArrowDown", label: "Sledeći zadatak", group: LIST, allowRepeat: true, hideInHelp: true },
  prev: { id: "list-prev", key: "k", label: "Prethodni zadatak", group: LIST, allowRepeat: true, helpKeys: [["K"], ["↑"]] },
  prevArrow: { id: "list-prev-arrow", key: "ArrowUp", label: "Prethodni zadatak", group: LIST, allowRepeat: true, hideInHelp: true },
  complete: { id: "list-complete", key: "x", label: "Završi ili vrati", group: LIST },
  open: { id: "list-open", key: "Enter", label: "Otvori panel zadatka", group: LIST },
  due: { id: "list-due", key: "d", label: "Rok", group: LIST },
  priority: { id: "list-priority", key: "p", label: "Prioritet", group: LIST },
  plan: { id: "list-plan", key: "t", label: "Dodaj u Moj dan / ukloni", group: LIST },
  search: { id: "list-search", key: "/", label: "Pretraga zadataka", group: LIST },
} as const satisfies Record<string, ShortcutDef>;

const INBOX = "Inbox" as const;

/** Prečice Inbox-a (K14, plan K07 §6.1): segmenti 1/2/3 i kretanje kroz redove; Enter otvara fokusiran red. */
export const INBOX_SHORTCUTS = {
  all: { id: "inbox-all", key: "1", label: "Sve", group: INBOX },
  unread: { id: "inbox-unread", key: "2", label: "Nepročitano", group: INBOX },
  pending: { id: "inbox-pending", key: "3", label: "Čeka tebe", group: INBOX },
  next: { id: "inbox-next", key: "j", label: "Sledeće obaveštenje", group: INBOX, allowRepeat: true, helpKeys: [["J"]] },
  prev: { id: "inbox-prev", key: "k", label: "Prethodno obaveštenje", group: INBOX, allowRepeat: true, helpKeys: [["K"]] },
} as const satisfies Record<string, ShortcutDef>;

const CHAT = "Poruke" as const;

/**
 * Prečice Poruka (K15, plan K07 §6.1): `/` pretraga razgovora, `n` nova poruka,
 * `Esc` vraća razgovor na listu na uskom ekranu (ne dok se kuca u kompozitoru).
 * Strelice i Enter u listi obrađuje sama lista.
 */
export const CHAT_SHORTCUTS = {
  search: { id: "chat-search", key: "/", label: "Pretraga razgovora", group: CHAT },
  newMessage: { id: "chat-new-message", key: "n", label: "Nova poruka", group: CHAT },
  back: { id: "chat-back", key: "Escape", label: "Nazad na razgovore (uzak ekran)", group: CHAT },
} as const satisfies Record<string, ShortcutDef>;

/** Kretanje kroz listu razgovora — obrađuje ga lista; ovde samo za pomoć. */
export const CHAT_LIST_HELP: ReadonlyArray<ShortcutDef> = [
  { id: "chat-list-move", key: "ArrowDown", label: "Sledeći / prethodni razgovor", group: CHAT, displayOnly: true, helpKeys: [["↓"], ["↑"]] },
  { id: "chat-list-open", key: "Enter", label: "Otvori razgovor", group: CHAT, displayOnly: true },
];

const PICKER = "Birač datuma" as const;

/** Tasteri birača datuma — obrađuje ih sam birač; ovde su samo za pomoć. */
export const DATE_PICKER_HELP: ReadonlyArray<ShortcutDef> = [
  { id: "picker-day", key: "ArrowLeft", label: "Prethodni / sledeći dan", group: PICKER, displayOnly: true, helpKeys: [["←"], ["→"]] },
  { id: "picker-week", key: "ArrowUp", label: "Nedelju ranije / kasnije", group: PICKER, displayOnly: true, helpKeys: [["↑"], ["↓"]] },
  { id: "picker-month", key: "PageUp", label: "Prethodni / sledeći mesec", group: PICKER, displayOnly: true, helpKeys: [["PgUp"], ["PgDn"]] },
  { id: "picker-week-edge", key: "Home", label: "Početak / kraj nedelje", group: PICKER, displayOnly: true, helpKeys: [["Home"], ["End"]] },
  { id: "picker-select", key: "Enter", label: "Izaberi dan", group: PICKER, displayOnly: true },
];

/** Grupiše definicije za dijalog pomoći, redom grupa; duplikati po `id` jednom. */
export function groupShortcuts(
  defs: ReadonlyArray<ShortcutDef>,
): Array<{ group: ShortcutGroup; defs: ShortcutDef[] }> {
  const seen = new Set<string>();
  const byGroup = new Map<ShortcutGroup, ShortcutDef[]>();
  for (const def of defs) {
    if (def.hideInHelp || seen.has(def.id)) continue;
    seen.add(def.id);
    byGroup.set(def.group, [...(byGroup.get(def.group) ?? []), def]);
  }
  return SHORTCUT_GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
    group,
    defs: byGroup.get(group) ?? [],
  }));
}
