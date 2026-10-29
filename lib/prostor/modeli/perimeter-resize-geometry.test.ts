// Preneto iz Devotion apps/web/components/workspace/canvases/perimeter-resize-geometry.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, test } from "vitest";

import {
  radialResizeStart,
  radialScaleFromPointer,
  scaleLayoutAroundCenter,
} from "./perimeter-resize-geometry";

const bounds = {
  minWidth: 100,
  minHeight: 80,
  maxWidth: 600,
  maxHeight: 480,
};

describe("radial perimeter resize geometry", () => {
  test("keeps the center and aspect ratio fixed", () => {
    const start = radialResizeStart({
      x: 100,
      y: 80,
      width: 240,
      height: 160,
    });
    const result = scaleLayoutAroundCenter(start, 1.5, bounds);

    expect(result).toEqual({
      x: 40,
      y: 40,
      width: 360,
      height: 240,
    });
    expect(result.x + result.width / 2).toBe(start.centerX);
    expect(result.y + result.height / 2).toBe(start.centerY);
    expect(result.width / result.height).toBe(1.5);
  });

  test("clamps against both minimum dimensions", () => {
    const start = radialResizeStart({
      x: 0,
      y: 0,
      width: 240,
      height: 120,
    });
    const result = scaleLayoutAroundCenter(start, 0.1, bounds);

    expect(result.width).toBe(160);
    expect(result.height).toBe(80);
    expect(result.x + result.width / 2).toBe(start.centerX);
    expect(result.y + result.height / 2).toBe(start.centerY);
  });

  test("clamps against both maximum dimensions", () => {
    const start = radialResizeStart({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    });
    const result = scaleLayoutAroundCenter(start, 10, bounds);

    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
  });

  test("derives a zoom-independent radial scale from screen distances", () => {
    expect(radialScaleFromPointer(120, 180)).toBe(1.5);
    expect(radialScaleFromPointer(0, 180)).toBe(1);
  });
});
