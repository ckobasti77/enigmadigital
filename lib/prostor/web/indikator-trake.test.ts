// Preneto iz Devotion apps/web/lib/motion/rail-indicator.test.ts (main @ c05c40f), SPAJANJE S08.
import { describe, expect, test } from "vitest";

import { frameWithin, framesDiffer } from "./indikator-trake";

describe("indikator trake", () => {
  test("okvir stavke u koordinatama kontejnera", () => {
    const container = { left: 100, top: 40, width: 56, height: 400 };
    const item = { left: 106, top: 98, width: 44, height: 44 };
    expect(frameWithin(container, item)).toEqual({ x: 6, y: 58, width: 44, height: 44 });
  });

  test("skrol kontejnera se dodaje (stavka ispod prevoja)", () => {
    const container = { left: 0, top: 0, width: 56, height: 200 };
    const item = { left: 6, top: 20, width: 44, height: 44 };
    expect(frameWithin(container, item, { left: 0, top: 300 })).toEqual({ x: 6, y: 320, width: 44, height: 44 });
  });

  test("razlika ispod pola piksela nije promena; bez prethodnog okvira jeste", () => {
    const frame = { x: 6, y: 58, width: 44, height: 44 };
    expect(framesDiffer(null, frame)).toBe(true);
    expect(framesDiffer(frame, { ...frame, y: 58.4 })).toBe(false);
    expect(framesDiffer(frame, { ...frame, y: 59 })).toBe(true);
    expect(framesDiffer(frame, { ...frame, width: 40 })).toBe(true);
  });
});
