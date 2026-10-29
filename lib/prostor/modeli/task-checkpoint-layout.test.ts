// Preneto iz Devotion apps/web/components/workspace/canvases/task-checkpoint-layout.test.ts (main @ c05c40f), SPAJANJE S14.
import { describe, expect, test } from "vitest";

import {
  taskCheckpointOrdinal,
  taskCheckpointNodeId,
  taskCheckpointNodeMetrics,
  taskCheckpointOrbitPosition,
  taskCheckpointUsesExpandedSize,
} from "./task-checkpoint-layout";

describe("task checkpoint Canvas layout", () => {
  test("React Flow ID je stabilan i odvojen od page čvorova", () => {
    expect(taskCheckpointNodeId("abc123")).toBe("checkpoint:abc123");
  });

  test("redni broj koristi backend vrednost i bezbedan fallback za stariji odgovor", () => {
    expect(taskCheckpointOrdinal(7, 0)).toBe(7);
    expect(taskCheckpointOrdinal(undefined, 0)).toBe(1);
    expect(taskCheckpointOrdinal(null, 4)).toBe(5);
    expect(taskCheckpointOrdinal(0, 2)).toBe(3);
  });

  test("isti input daje isti orbitalni raspored bez centra taska", () => {
    const node = taskCheckpointNodeMetrics("Potvrdi finalni plan");
    const first = Array.from({ length: 20 }, (_, index) =>
      taskCheckpointOrbitPosition({
        index,
        center: { x: 200, y: 180 },
        node,
        exclusion: { width: 300, height: 220 },
      }),
    );
    const second = Array.from({ length: 20 }, (_, index) =>
      taskCheckpointOrbitPosition({
        index,
        center: { x: 200, y: 180 },
        node,
        exclusion: { width: 300, height: 220 },
      }),
    );
    expect(second).toEqual(first);
    expect(new Set(first.map(({ x, y }) => `${x}:${y}`)).size).toBe(20);
    expect(
      first.every(
        ({ x, y }) =>
          Math.abs(x - 200) > 80 || Math.abs(y - 180) > 60,
      ),
    ).toBe(true);
  });

  test("dimenzije checkpointa rastu sa sadržajem, ali ostaju ograničene", () => {
    const short = taskCheckpointNodeMetrics("QA");
    const medium = taskCheckpointNodeMetrics(
      "Proveri mobilni prikaz i tastaturu",
    );
    const long = taskCheckpointNodeMetrics("x".repeat(500));

    expect(short.width).toBeLessThan(medium.width);
    expect(short.height).toBeLessThanOrEqual(medium.height);
    expect(medium.width).toBeLessThan(long.width);
    expect(long.width).toBe(228);
    expect(long.height).toBeLessThanOrEqual(190);
  });

  test("jedno dugme naizmenično bira raširi i skupi stanje", () => {
    expect(
      taskCheckpointUsesExpandedSize({
        manuallySized: false,
        width: 360,
        height: 240,
      }),
    ).toBe(false);
    expect(
      taskCheckpointUsesExpandedSize({
        manuallySized: true,
        width: 164,
        height: 110,
      }),
    ).toBe(false);
    expect(
      taskCheckpointUsesExpandedSize({
        manuallySized: true,
        width: 360,
        height: 240,
      }),
    ).toBe(true);
  });
});
