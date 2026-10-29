// Preneto iz Devotion apps/web/components/map/map-model.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, it } from "vitest";

import { selectNestingDropTarget } from "./nesting-drop";

import {
  MAP_INACTIVE_HINT,
  MAP_UNTITLED,
  mapActivation,
  mapByline,
  mapCardSnippet,
  mapChildCountLabel,
  mapIdeaCard,
  mapKindFromLabel,
  mapPageCard,
  mapPageText,
  mapZoomLabel,
  planMapDrop,
  type MapDropNode,
  type MapPageInput,
} from "./map-model";

const NOW = new Date("2026-10-27T10:00:00").getTime();
const DAY = 86_400_000;

const page = (overrides: Partial<MapPageInput> = {}): MapPageInput => ({
  title: "Plan lansiranja",
  text: "Prvi red\n\nDrugi   red",
  kind: "note",
  taskStatus: null,
  dueDate: null,
  checkpointTotal: 0,
  checkpointCompleted: 0,
  fileCategory: null,
  updatedAt: NOW - 2 * 60_000,
  isLocked: false,
  creatorName: "Ana",
  ...overrides,
});

const card = (id: string, canMove = true): MapDropNode => ({
  id,
  isCheckpoint: false,
  canMove,
});

describe("kartica Mape (PROSTOR K15)", () => {
  it("beleška: vrsta, naslov, isečak u jednom redu, ko i kad", () => {
    const result = mapPageCard(page(), NOW);
    expect(result.kind).toBe("note");
    expect(result.kindLabel).toBe("Beleška");
    expect(result.title).toBe("Plan lansiranja");
    expect(result.snippet).toBe("Prvi red Drugi red");
    expect(result.byline).toBe("Ana · pre 2 min");
    expect(result.task).toBeNull();
    expect(result.locked).toBe(false);
  });

  it("prazan naslov i tekst, zaključana stranica i broj podstranica", () => {
    const result = mapPageCard(page({ title: "  ", text: "", isLocked: true }), NOW, {
      count: 9,
      capped: true,
    });
    expect(result.title).toBe(MAP_UNTITLED);
    expect(result.snippet).toBeNull();
    expect(result.locked).toBe(true);
    expect(result.childCount).toBe("9+");
  });

  it("prazna stranica: server šalje naslov kao isečak, kartica ga ne ponavlja", () => {
    expect(mapPageCard(page({ title: "Plan izdanja", text: "Plan  izdanja" }), NOW).snippet).toBeNull();
    expect(mapPageText("Plan", "plan")).toBe("");
    expect(mapPageText("Plan", "Plan rada")).toBe("Plan rada");
  });

  it("zadatak: status, rok koji kasni i koraci 2/5", () => {
    const result = mapPageCard(
      page({
        kind: "task",
        taskStatus: "in_progress",
        dueDate: NOW - 3 * DAY,
        checkpointTotal: 5,
        checkpointCompleted: 2,
      }),
      NOW,
    );
    expect(result.task).toEqual({
      statusLabel: "U toku",
      statusTone: "progress",
      due: expect.objectContaining({ overdue: true, label: "kasni 3 d" }),
      steps: { done: 2, total: 5 },
    });
  });

  it("zadatak bez roka i koraka nema te delove", () => {
    const result = mapPageCard(page({ kind: "task", taskStatus: "done" }), NOW);
    expect(result.task).toEqual({
      statusLabel: "Gotovo",
      statusTone: "done",
      due: null,
      steps: null,
    });
  });

  it("fajl nosi kategoriju u vrsti", () => {
    expect(mapPageCard(page({ kind: "file", fileCategory: "image" }), NOW).kindLabel).toMatch(/^Fajl · /);
  });

  it("ideja: faza, Za/Protiv, boja; bez naslova prvi red postaje naslov", () => {
    const result = mapIdeaCard(
      {
        title: null,
        text: "Uvesti mesečnu pretplatu\nza timove",
        color: "violet",
        authorName: "Marko",
        createdAt: NOW - 5 * 60_000,
        stageLabel: "Razmatra se",
        upvotes: 4,
        downvotes: 1,
        userVote: "up",
      },
      NOW,
    );
    expect(result.kind).toBe("idea");
    expect(result.title).toBe("Uvesti mesečnu pretplatu");
    expect(result.snippet).toBeNull();
    expect(result.byline).toBe("Marko · pre 5 min");
    expect(result.idea).toEqual({ stageLabel: "Razmatra se", up: 4, down: 1, myVote: "up" });
    expect(result.color).toBe("violet");
  });

  it("isečak se seče na granici i dobija tri tačke", () => {
    const long = "reč ".repeat(200);
    const snippet = mapCardSnippet(long);
    expect(snippet?.length).toBeLessThanOrEqual(280);
    expect(snippet?.endsWith("…")).toBe(true);
  });

  it("ko · kad, broj podstranica i zum", () => {
    expect(mapByline(null, null, NOW)).toBeNull();
    expect(mapByline("Ana", null, NOW)).toBe("Ana");
    expect(mapChildCountLabel({ count: 0, capped: false })).toBeNull();
    expect(mapChildCountLabel({ count: 3, capped: false })).toBe("3");
    expect(mapZoomLabel(1)).toBe("100 %");
    expect(mapZoomLabel(0.456)).toBe("46 %");
  });

  it("embed vraća vrstu iz natpisa stranice, ostalo ostaje bez vrste", () => {
    expect(mapKindFromLabel("Zadatak")).toBe("task");
    expect(mapKindFromLabel("Tabela")).toBe("table");
    expect(mapKindFromLabel("3 za · 1 protiv")).toBeNull();
    expect(mapKindFromLabel(undefined)).toBeNull();
  });
});

describe("točkić Mape: aktivacija (K07 §7)", () => {
  it("klik ili fokus u mapi je aktivira, klik van, Esc, fokus van i napuštanje prozora je gase", () => {
    expect(mapActivation(false, "pointer-inside")).toBe(true);
    expect(mapActivation(false, "focus-inside")).toBe(true);
    expect(mapActivation(true, "pointer-outside")).toBe(false);
    expect(mapActivation(true, "escape")).toBe(false);
    expect(mapActivation(true, "focus-outside")).toBe(false);
    expect(mapActivation(true, "window-blur")).toBe(false);
  });

  it("oznaka neaktivne mape kaže kako se pomera i zumira", () => {
    expect(MAP_INACTIVE_HINT).toBe("Klikni u mapu za pomeranje · Ctrl + točkić za zum");
  });
});

describe("prevlačenje na Mapi (PROSTOR P4 — bez zahteva)", () => {
  it("kartica puštena na TUĐU karticu se ugnežđava odmah", () => {
    // Cilj je tuđa kartica (član je ne može pomeriti) — ugnežđavanje je ipak
    // direktno; dozvolu i zaključavanje proverava server (R5/R6).
    const mine = { id: "moja", position: { x: 80, y: 80 }, width: 100, height: 100 };
    const foreign = { id: "tudja", position: { x: 100, y: 100 }, width: 300, height: 200 };
    const target = selectNestingDropTarget(mine, [foreign]);
    expect(target?.id).toBe("tudja");

    const plan = planMapDrop(card("moja"), [card("moja")], target?.id ?? null);
    expect(plan).toEqual({ kind: "nest", childId: "moja", targetId: "tudja" });
    expect(JSON.stringify(plan)).not.toMatch(/pending|zahtev/i);
  });

  it("bez cilja ili sa grupom samo pomera", () => {
    expect(planMapDrop(card("a"), [card("a")], null)).toEqual({ kind: "move", ids: ["a"] });
    expect(planMapDrop(card("a"), [card("a"), card("b")], "c")).toEqual({
      kind: "move",
      ids: ["a", "b"],
    });
  });

  it("kartica koju gledalac ne sme da pomera ne radi ništa", () => {
    expect(planMapDrop(card("a", false), [card("a", false)], "b")).toEqual({ kind: "none" });
  });

  it("u grupi sa nepokretnom karticom ugnežđava samo jednu pokretnu", () => {
    expect(planMapDrop(card("a"), [card("a"), card("b", false)], "c")).toEqual({
      kind: "nest",
      childId: "a",
      targetId: "c",
    });
  });

  it("korak zadatka se samo pomera, nikad ne ugnežđava", () => {
    const step: MapDropNode = { id: "checkpoint:1", isCheckpoint: true, canMove: true };
    expect(planMapDrop(step, [step, card("a")], "a")).toEqual({
      kind: "checkpoints",
      ids: ["checkpoint:1"],
    });
  });

  it("kartica se ne ugnežđava u samu sebe", () => {
    expect(planMapDrop(card("a"), [card("a")], "a")).toEqual({ kind: "move", ids: ["a"] });
  });
});
