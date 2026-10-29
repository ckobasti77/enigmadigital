// Preneto iz Devotion apps/web/lib/shortcuts/task-list.test.ts (main @ c05c40f), SPAJANJE S08.
import { describe, expect, test } from "vitest";

import { groupShortcuts, matchShortcut, shortcutHelpKeys, type ShortcutEvent } from "./registar";
import { nextRowKey, taskListAction, taskListShortcutDefs } from "./lista-zadataka";

function press(key: string, extra: Partial<ShortcutEvent> = {}): ShortcutEvent {
  return {
    key,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    typing: false,
    dialogOpen: false,
    ...extra,
  };
}

const withSearch = taskListShortcutDefs({ search: true });
const withoutSearch = taskListShortcutDefs({ search: false });
const actionOf = (event: ShortcutEvent, defs = withSearch) => {
  const id = matchShortcut(event, defs);
  return id === null ? null : taskListAction(id);
};

describe("mapiranje prečica liste", () => {
  test("svaka prečica iz plana vodi na svoju radnju", () => {
    expect(actionOf(press("j"))).toBe("next");
    expect(actionOf(press("ArrowDown"))).toBe("next");
    expect(actionOf(press("k"))).toBe("prev");
    expect(actionOf(press("ArrowUp"))).toBe("prev");
    expect(actionOf(press("x"))).toBe("complete");
    expect(actionOf(press("Enter"))).toBe("open");
    expect(actionOf(press("d"))).toBe("due");
    expect(actionOf(press("p"))).toBe("priority");
    expect(actionOf(press("t"))).toBe("plan");
    expect(actionOf(press("/"))).toBe("search");
  });

  test(`„/" sa Shift-om (srpski raspored: Shift+7) i bez pretrage ne važi`, () => {
    expect(actionOf(press("/", { shiftKey: true }))).toBe("search");
    expect(actionOf(press("/"), withoutSearch)).toBeNull();
  });

  test("ćirilični raspored: slova po fizičkom tasteru", () => {
    expect(actionOf(press("ј", { code: "KeyJ" }))).toBe("next");
    expect(actionOf(press("х", { code: "KeyX" }))).toBe("complete");
    expect(actionOf(press("т", { code: "KeyT" }))).toBe("plan");
  });

  test("kucanje u polju, otvoren dijalog/meni/birač i modifikatori utišavaju prečice", () => {
    expect(actionOf(press("x", { typing: true }))).toBeNull();
    expect(actionOf(press("j", { dialogOpen: true }))).toBeNull();
    expect(actionOf(press("ArrowDown", { dialogOpen: true }))).toBeNull();
    expect(actionOf(press("x", { ctrlKey: true }))).toBeNull();
    expect(actionOf(press("ArrowDown", { altKey: true }))).toBeNull();
    expect(actionOf(press("X", { shiftKey: true }))).toBeNull();
  });

  test("ponavljanje: j/k i strelice da, x i t ne (plan K07 §6.1)", () => {
    expect(actionOf(press("j", { repeat: true }))).toBe("next");
    expect(actionOf(press("ArrowUp", { repeat: true }))).toBe("prev");
    expect(actionOf(press("x", { repeat: true }))).toBeNull();
    expect(actionOf(press("t", { repeat: true }))).toBeNull();
  });

  test("tasteri birača datuma su samo u pomoći — nikad ne hvataju taster", () => {
    expect(actionOf(press("ArrowLeft"))).toBeNull();
    expect(actionOf(press("PageUp"))).toBeNull();
    expect(actionOf(press("Home"))).toBeNull();
    expect(taskListAction("picker-day")).toBeNull();
    expect(taskListAction("help")).toBeNull();
  });

  test("dijalog pomoći: grupe, bez dupliranih strelica, alternative za j/k", () => {
    const groups = groupShortcuts(withSearch);
    expect(groups.map((group) => group.group)).toEqual(["Liste zadataka", "Birač datuma"]);
    const list = groups[0].defs;
    expect(list.map((def) => def.label)).toEqual([
      "Sledeći zadatak",
      "Prethodni zadatak",
      "Završi ili vrati",
      "Otvori panel zadatka",
      "Rok",
      "Prioritet",
      "Dodaj u Moj dan / ukloni",
      "Pretraga zadataka",
    ]);
    expect(shortcutHelpKeys(list[0])).toEqual([["J"], ["↓"]]);
    expect(shortcutHelpKeys(list[2])).toEqual([["X"]]);
    expect(shortcutHelpKeys(groups[1].defs[2])).toEqual([["PgUp"], ["PgDn"]]);
  });
});

describe("kretanje kroz redove", () => {
  const keys = ["a", "b", "c"];

  test("bez izbora: dole prvi, gore poslednji", () => {
    expect(nextRowKey(keys, null, 1)).toBe("a");
    expect(nextRowKey(keys, null, -1)).toBe("c");
  });

  test("korak i krajevi bez kruženja", () => {
    expect(nextRowKey(keys, "a", 1)).toBe("b");
    expect(nextRowKey(keys, "b", -1)).toBe("a");
    expect(nextRowKey(keys, "c", 1)).toBe("c");
    expect(nextRowKey(keys, "a", -1)).toBe("a");
  });

  test("izbor koji je nestao kreće ispočetka; prazna lista nema izbora", () => {
    expect(nextRowKey(keys, "z", 1)).toBe("a");
    expect(nextRowKey(keys, "z", -1)).toBe("c");
    expect(nextRowKey([], null, 1)).toBeNull();
  });
});
