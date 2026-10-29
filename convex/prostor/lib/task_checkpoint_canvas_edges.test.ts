// Preneto iz Devotion packages/backend/convex/lib/task_checkpoint_canvas_edges.test.ts (main @ c05c40f), SPAJANJE S03.
import { describe, expect, test } from "vitest";

import type { Id } from "../../_generated/dataModel";
import { canonicalTaskCheckpointCanvasEndpoints } from "./task_checkpoint_canvas_edges";

describe("task checkpoint canvas edge identity", () => {
  test("uses the same pair key when endpoint order is reversed", () => {
    const checkpoint = {
      kind: "task_checkpoint" as const,
      id: "checkpoint-1" as Id<"taskCheckpoints">,
    };
    const task = {
      kind: "page" as const,
      id: "task-1" as Id<"pages">,
    };

    const forward = canonicalTaskCheckpointCanvasEndpoints(checkpoint, task);
    const reverse = canonicalTaskCheckpointCanvasEndpoints(task, checkpoint);

    expect(reverse.pairKey).toBe(forward.pairKey);
    expect(reverse.endpointAKey).toBe(forward.endpointAKey);
    expect(reverse.endpointBKey).toBe(forward.endpointBKey);
  });
});
