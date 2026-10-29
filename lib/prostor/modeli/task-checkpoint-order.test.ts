// Preneto iz Devotion apps/web/components/workspace/task-checkpoint-order.test.ts (main @ c05c40f), SPAJANJE S12.
import { describe, expect, test } from "vitest";

import { orderTaskCheckpointsForEditor } from "./task-checkpoint-order";

describe("redosled checkpointa u editoru zadatka", () => {
  test("otvorene prikazuje numerički pre završenih, uz očuvane brojeve", () => {
    const checkpoints = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      ordinal: index + 1,
      completed: [2, 5, 7].includes(index + 1),
    }));

    const ordered = orderTaskCheckpointsForEditor(checkpoints);

    expect(ordered.map(({ checkpoint }) => checkpoint.id)).toEqual([
      1, 3, 4, 6, 2, 5, 7,
    ]);
    expect(ordered.map(({ ordinal }) => ordinal)).toEqual([
      1, 3, 4, 6, 2, 5, 7,
    ]);
  });

  test("kad postoji vezan korak, redosled je strogo numerički", () => {
    const checkpoints = Array.from({ length: 5 }, (_, index) => ({
      id: index + 1,
      ordinal: index + 1,
      completed: [1, 2].includes(index + 1),
      chainedToPrevious: index > 0,
    }));

    const ordered = orderTaskCheckpointsForEditor(checkpoints);

    expect(ordered.map(({ checkpoint }) => checkpoint.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  test("jedan vezan korak je dovoljan da lista pređe u numerički redosled", () => {
    const checkpoints = [
      { id: 1, ordinal: 1, completed: true, chainedToPrevious: false },
      { id: 2, ordinal: 2, completed: false, chainedToPrevious: true },
      { id: 3, ordinal: 3, completed: true, chainedToPrevious: false },
    ];

    expect(
      orderTaskCheckpointsForEditor(checkpoints).map(
        ({ checkpoint }) => checkpoint.id,
      ),
    ).toEqual([1, 2, 3]);
  });
});
