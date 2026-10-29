// Preneto iz Devotion apps/web/lib/canvas-nesting.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, test } from "vitest";

import {
  absolutePositions,
  storedMovesFor,
  toStoredPosition,
  type NestedNode,
} from "./canvas-nesting";

/**
 * Dokaz za zamku iz `ZA-POPRAVKU.md` §9: embed ugnježdene čvorove CRTA apsolutno, a
 * baza ih ČUVA relativno u odnosu na roditelja. Naivno vezivanje `onNodeDragStop` na
 * `ideas.updatePositions` / `thoughts.moveNodes` upisalo bi poziciju uvećanu za offset
 * roditelja — a greška je tiha (čvor odskoči tek nekom drugom, na sledeći render).
 *
 * Ako neki od ovih testova padne, ne popravlja se test.
 */

/** Lanac dubine 3: koren → dete → unuk. */
const CHAIN: NestedNode[] = [
  { id: "koren", x: 100, y: 200, parentId: null },
  { id: "dete", x: 30, y: 40, parentId: "koren" },
  { id: "unuk", x: 5, y: 6, parentId: "dete" },
  { id: "samac", x: -50, y: 12, parentId: null },
];

describe("apsolutne pozicije", () => {
  test("zbir celog lanca roditelja", () => {
    const absolute = absolutePositions(CHAIN);
    expect(absolute.get("koren")).toEqual({ x: 100, y: 200 });
    expect(absolute.get("dete")).toEqual({ x: 130, y: 240 });
    expect(absolute.get("unuk")).toEqual({ x: 135, y: 246 });
    expect(absolute.get("samac")).toEqual({ x: -50, y: 12 });
  });

  test("ciklus u lancu roditelja ne zamrzava kanvas", () => {
    const cyclic: NestedNode[] = [
      { id: "a", x: 1, y: 1, parentId: "b" },
      { id: "b", x: 2, y: 2, parentId: "a" },
    ];
    expect(absolutePositions(cyclic).get("a")).toEqual({ x: 3, y: 3 });
  });

  test("roditelj koji nije na platnu se preskače, ne ruši", () => {
    const orphan: NestedNode[] = [
      { id: "siroče", x: 7, y: 8, parentId: "nema-ga" },
    ];
    expect(absolutePositions(orphan).get("siroče")).toEqual({ x: 7, y: 8 });
  });
});

describe("povratak u ono što ide u bazu", () => {
  test("round-trip: apsolutno → relativno vraća original", () => {
    const absolute = absolutePositions(CHAIN);
    for (const node of CHAIN) {
      const point = absolute.get(node.id);
      expect(point).toBeDefined();
      expect(toStoredPosition(node.id, point!, CHAIN, absolute)).toEqual({
        x: node.x,
        y: node.y,
      });
    }
  });

  test("čvor bez roditelja piše apsolutnu poziciju nepromenjenu", () => {
    const absolute = absolutePositions(CHAIN);
    expect(
      toStoredPosition("samac", { x: 999, y: -1 }, CHAIN, absolute),
    ).toEqual({ x: 999, y: -1 });
  });
});

describe("prevod celog poteza", () => {
  test("povučeno samo dete: upisuje se razlika u odnosu na roditelja", () => {
    // Dete je na platnu bilo na (130, 240); prst ga je odneo na (200, 300).
    const moves = storedMovesFor([{ id: "dete", x: 200, y: 300 }], CHAIN);
    // Roditelj je i dalje na (100, 200) — u bazu ide 200-100 i 300-200.
    expect(moves).toEqual([{ id: "dete", x: 100, y: 100 }]);
  });

  test("povučen roditelj i dete zajedno: dete se NE upisuje", () => {
    // Multi-selekcija pomera oba za isti pomeraj (+10, +10). Njihov međusobni
    // odnos se nije promenio, pa u bazi nema šta da se menja.
    const moves = storedMovesFor(
      [
        { id: "koren", x: 110, y: 210 },
        { id: "dete", x: 140, y: 250 },
      ],
      CHAIN,
    );
    expect(moves).toEqual([{ id: "koren", x: 110, y: 210 }]);
  });

  test("potez bez stvarne promene ne pravi upis", () => {
    expect(storedMovesFor([{ id: "unuk", x: 135, y: 246 }], CHAIN)).toEqual([]);
  });

  test("nepoznat čvor se tiho preskače umesto da obori ceo potez", () => {
    expect(storedMovesFor([{ id: "ghost:1", x: 0, y: 0 }], CHAIN)).toEqual([]);
  });
});
