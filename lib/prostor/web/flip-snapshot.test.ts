// Preneto iz Devotion apps/web/lib/motion/flip-snapshot.test.ts (main @ c05c40f), SPAJANJE S08.
import { describe, expect, test } from "vitest";

import { shouldFlip } from "./flip-snapshot";

describe("FlipGroup: kada se snima raspored", () => {
  test("ista lista (isti potpis) — nema Flip-a", () => {
    expect(shouldFlip({ layoutKey: "a|b" }, { layoutKey: "a|b" })).toBe(false);
  });

  test("promena redosleda, nova ili uklonjena stavka — Flip", () => {
    expect(shouldFlip({ layoutKey: "a|b" }, { layoutKey: "b|a" })).toBe(true);
    expect(shouldFlip({ layoutKey: "a|b" }, { layoutKey: "c|a|b" })).toBe(true);
    expect(shouldFlip({ layoutKey: "a|b" }, { layoutKey: "a" })).toBe(true);
  });

  test("nov skup (drugi tab, kucanje u pretrazi) — raspored se menja odmah", () => {
    expect(shouldFlip({ layoutKey: "a|b", resetKey: "vote" }, { layoutKey: "c", resetKey: "mine" })).toBe(false);
    expect(shouldFlip({ layoutKey: "a|b", resetKey: "" }, { layoutKey: "a", resetKey: "kif" })).toBe(false);
  });

  test("previše stavki (E12) — bez Flip-a", () => {
    expect(shouldFlip({ layoutKey: "a|b" }, { layoutKey: "b|a", disabled: true })).toBe(false);
  });
});
