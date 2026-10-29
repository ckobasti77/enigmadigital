// Preneto iz Devotion apps/web/components/workspace/canvases/nesting-drop.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, it } from "vitest";

import {
  selectNestingDropTarget,
  type NestingDropNode,
} from "./nesting-drop";

const node = (
  id: string,
  x: number,
  y: number,
  width = 100,
  height = 100,
): NestingDropNode => ({
  id,
  position: { x, y },
  width,
  height,
});

describe("selectNestingDropTarget", () => {
  it("selects the card containing the dragged card centre", () => {
    const dragged = node("dragged", 80, 80);
    const target = node("target", 100, 100, 160, 160);

    expect(
      selectNestingDropTarget(dragged, [target]),
    ).toEqual(target);
  });

  it("ignores a casual edge overlap", () => {
    const dragged = node("dragged", 20, 20);
    const target = node("target", 100, 100);

    expect(
      selectNestingDropTarget(dragged, [target]),
    ).toBeNull();
  });

  it("does not nest into another card in the dragged group", () => {
    const dragged = node("dragged", 80, 80);
    const selectedPeer = node("selected-peer", 100, 100, 160, 160);

    expect(
      selectNestingDropTarget(
        dragged,
        [selectedPeer],
        new Set(["dragged", "selected-peer"]),
      ),
    ).toBeNull();
  });

  it("among several containing cards picks the largest overlap (PROSTOR K15)", () => {
    const dragged = node("dragged", 100, 100, 100, 100);
    const small = node("small", 140, 140, 40, 40);
    const large = node("large", 60, 60, 300, 300);

    expect(
      selectNestingDropTarget(dragged, [small, large])?.id,
    ).toBe("large");
  });

  it("ignores cards without a known size", () => {
    const dragged = node("dragged", 80, 80);
    const unsized: NestingDropNode = { id: "unsized", position: { x: 100, y: 100 } };

    expect(selectNestingDropTarget(dragged, [unsized])).toBeNull();
  });

  it("uses the measured size when xyflow has measured the card", () => {
    const dragged = node("dragged", 300, 300);
    const target: NestingDropNode = {
      id: "target",
      position: { x: 250, y: 250 },
      width: 50,
      height: 50,
      measured: { width: 300, height: 300 },
    };

    expect(selectNestingDropTarget(dragged, [target])?.id).toBe("target");
  });
});
