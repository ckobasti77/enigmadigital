// Preneto iz Devotion apps/web/components/workspace/page-tree-model.test.ts (main @ c05c40f), SPAJANJE S10.
import { describe, expect, it } from "vitest";

import { canDragPage, PAGE_TREE_VISIBLE, showMoreLabel } from "./page-tree-model";

describe("stablo stranica u meniju startupa (PROSTOR P11, K08)", () => {
  it("svaki član pomera otključanu stranicu, i tuđu", () => {
    const viewer = { profileId: "ja", canManage: false };
    expect(canDragPage({ createdByProfileId: "ana" }, viewer)).toBe(true);
    expect(canDragPage({ createdByProfileId: "ana", lockedAt: null }, viewer)).toBe(true);
  });

  it("zaključanu pomeraju samo autor, vlasnik startupa i admin", () => {
    const locked = { createdByProfileId: "ana", lockedAt: 1 };
    expect(canDragPage(locked, { profileId: "ja", canManage: false })).toBe(false);
    expect(canDragPage(locked, { profileId: "ana", canManage: false })).toBe(true);
    expect(canDragPage(locked, { profileId: "ja", canManage: true })).toBe(true);
  });

  it("dugme Prikaži još broji skrivene i kaže kad ih na serveru ima još", () => {
    expect(PAGE_TREE_VISIBLE).toBe(7);
    expect(showMoreLabel(5, false)).toBe("Prikaži još (5)");
    expect(showMoreLabel(43, true)).toBe("Prikaži još (43+)");
    expect(showMoreLabel(0, true)).toBe("Prikaži još");
  });
});
