// Preneto iz Devotion apps/web/lib/canvas-node-size.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, test } from "vitest";

import {
  DEFAULT_CANVAS_NODE_HEIGHT,
  DEFAULT_CANVAS_NODE_WIDTH,
} from "../../../convex/prostor/canvasPlacement";

import { CHECKPOINT_NODE_SIZE, PAGE_NODE_SIZE } from "./canvas-node-size";

/**
 * Brana protiv REGRESIJE NA DESKTOPU (lanac 4, faza K6).
 *
 * Jedini dodir lanca u desktop kod je izvlačenje četiri granice veličine kartice iz
 * `components/workspace/canvases/area-flow-node.tsx` u zajednički modul
 * `lib/canvas-node-size.ts` — koji od tada koriste i desktop kanvas i mobilni embed.
 * Zbog toga izmena „za telefon" u tom modulu tiho menja i ponašanje desktop `NodeResizer`-a.
 * Ovi testovi zakivaju brojeve na ono što je desktop imao INLINE pre lanca
 * (`git show 019239d:apps/web/components/workspace/canvases/area-flow-node.tsx:284–287`).
 *
 * Ako neki od ovih testova padne, to NIJE poziv da se test popravi — to je dokaz da se
 * granica razišla i da treba proveriti šta se na desktopu promenilo.
 */
describe("granice veličine kartice na kanvasu", () => {
  test("iste su kao inline vrednosti koje je desktop imao pre lanca 4", () => {
    expect(PAGE_NODE_SIZE.minWidth).toBe(240);
    expect(PAGE_NODE_SIZE.minHeight).toBe(168);
    expect(PAGE_NODE_SIZE.maxWidth).toBe(720);
    expect(PAGE_NODE_SIZE.maxHeight).toBe(1_000);
  });

  /**
   * Server je merodavan i sam klampuje (`areasV2.resizePage`), pa raskorak znači da
   * kartica pod prstom ode dalje nego što će baza prihvatiti i „skoči" nazad.
   * `MIN_WIDTH`/`MAX_HEIGHT` iz `areasV2.ts:85–88` NISU izvezeni, pa se ne mogu uvesti —
   * broj se zato drži ovde, a jedini put da se razmimoiđe je da neko izmeni oba mesta.
   */
  test("prate granice servera iz areasV2.ts:85–88", () => {
    const server = { minWidth: 240, minHeight: 168, maxWidth: 720, maxHeight: 1_000 };
    expect({
      minWidth: PAGE_NODE_SIZE.minWidth,
      minHeight: PAGE_NODE_SIZE.minHeight,
      maxWidth: PAGE_NODE_SIZE.maxWidth,
      maxHeight: PAGE_NODE_SIZE.maxHeight,
    }).toEqual(server);
  });

  /** Podrazumevana veličina JESTE izvezena — pa se poredi sa pravim izvorom. */
  test("podrazumevana veličina je ista kao serverska (resetPageSize)", () => {
    expect(PAGE_NODE_SIZE.defaultWidth).toBe(DEFAULT_CANVAS_NODE_WIDTH);
    expect(PAGE_NODE_SIZE.defaultHeight).toBe(DEFAULT_CANVAS_NODE_HEIGHT);
    expect(PAGE_NODE_SIZE.defaultWidth).toBe(288);
    expect(PAGE_NODE_SIZE.defaultHeight).toBe(196);
  });

  // „mobilna kopija se ne razilazi od web modula" nije preneto (SPAJANJE S14):
  // telefon (`apps/mobile`) u Enigmi još ne postoji, pa kopije nema.
});

describe("granice checkpoint oblačića", () => {
  // „preseti sheet-a su isti kao desktop toolbar preseti" nije preneto
  // (SPAJANJE S14): poredi kopiju za telefon, koje u Enigmi nema.

  /** `taskCheckpoints.saveCanvasPlacement` klampuje na ove granice. */
  test("granice prate server (taskCheckpoints.saveCanvasPlacement)", () => {
    expect(CHECKPOINT_NODE_SIZE.minWidth).toBe(140);
    expect(CHECKPOINT_NODE_SIZE.minHeight).toBe(92);
    expect(CHECKPOINT_NODE_SIZE.maxWidth).toBe(520);
    expect(CHECKPOINT_NODE_SIZE.maxHeight).toBe(600);
  });
});
