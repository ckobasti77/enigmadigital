// Preneto iz Devotion packages/backend/convex/lib/task_checkpoints.ts (main @ c05c40f), SPAJANJE S03.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  MAX_TASK_CHECKPOINTS,
  normalizeTaskCheckpoints,
  type TaskCheckpointInput,
} from "./validators";

type ReadCtx = QueryCtx | MutationCtx;

export async function listActiveTaskCheckpoints(
  ctx: ReadCtx,
  taskPageId: Id<"pages">,
) {
  const rows = await ctx.db
    .query("taskCheckpoints")
    .withIndex("by_taskPageId_and_archivedAt_and_position", (q) =>
      q.eq("taskPageId", taskPageId).eq("archivedAt", null),
    )
    .order("asc")
    .take(MAX_TASK_CHECKPOINTS + 1);
  if (rows.length > MAX_TASK_CHECKPOINTS) {
    throw new Error(
      `Zadatak može imati najviše ${MAX_TASK_CHECKPOINTS} checkpointa.`,
    );
  }
  return rows.sort(
    (left, right) =>
      left.createdAt - right.createdAt ||
      left.position - right.position ||
      left._creationTime - right._creationTime ||
      left._id.localeCompare(right._id),
  );
}

export type TaskCheckpointChainRow = {
  completed: boolean;
  chainedToPrevious?: boolean;
};

export type TaskCheckpointLockState = {
  locked: boolean;
  /** Redni broj koraka koji drži katanac; `null` kad korak nije zaključan. */
  blockedByOrdinal: number | null;
};

/**
 * Redosled je kanonski — onaj koji vraća `listActiveTaskCheckpoints`. Korak je
 * zaključan kada je vezan za prethodni, a prethodni nije završen. Lanac
 * kaskadira sam od sebe: ako #2 ostane nezavršen jer je zaključan, onda je i #3
 * vezan za njega zaključan, bez posebnog pravila.
 */
export function taskCheckpointLockStates(
  rows: TaskCheckpointChainRow[],
): TaskCheckpointLockState[] {
  return rows.map((row, index) => {
    if (index === 0 || row.chainedToPrevious !== true) {
      return { locked: false, blockedByOrdinal: null };
    }
    return rows[index - 1].completed
      ? { locked: false, blockedByOrdinal: null }
      : { locked: true, blockedByOrdinal: index };
  });
}

export function normalizeCheckpointText(value: string) {
  return normalizeTaskCheckpoints([
    { id: "checkpoint", text: value, completed: false },
  ])![0].text;
}

export function newCheckpointLegacyId(
  actorProfileId: Id<"profiles">,
  now: number,
) {
  return `cp-${now}-${actorProfileId.slice(-8)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function checkpointProjection(rows: Doc<"taskCheckpoints">[]) {
  return rows.map((row) => ({
    id: row.legacyId,
    text: row.text,
    completed: row.completed,
  }));
}

export async function syncTaskCheckpointProjection(
  ctx: MutationCtx,
  taskPageId: Id<"pages">,
  actorProfileId: Id<"profiles">,
  now: number,
) {
  const page = await ctx.db.get("pages", taskPageId);
  if (page === null || page.kind !== "task") {
    throw new Error("Checkpoint pripada task stranici koja više nije dostupna.");
  }
  const rows = await listActiveTaskCheckpoints(ctx, taskPageId);
  await ctx.db.patch("pages", taskPageId, {
    checkpoints: checkpointProjection(rows),
    checkpointTotal: rows.length,
    checkpointCompleted: rows.filter((row) => row.completed).length,
    checkpointRevision: (page.checkpointRevision ?? 0) + 1,
    updatedByProfileId: actorProfileId,
    updatedAt: now,
  });
  return rows;
}

export async function reconcileLegacyTaskCheckpoints(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    checkpoints: TaskCheckpointInput[] | null | undefined;
    actorProfileId: Id<"profiles">;
    now: number;
  },
) {
  if (args.page.kind !== "task") return;
  const normalized = normalizeTaskCheckpoints(args.checkpoints) ?? [];
  const activeRows = await listActiveTaskCheckpoints(ctx, args.page._id);
  const desiredLegacyIds = new Set(normalized.map((item) => item.id));

  for (const row of activeRows) {
    if (!desiredLegacyIds.has(row.legacyId)) {
      await ctx.db.patch("taskCheckpoints", row._id, {
        archivedAt: args.now,
        updatedAt: args.now,
      });
    }
  }

  for (const [position, checkpoint] of normalized.entries()) {
    const existing = await ctx.db
      .query("taskCheckpoints")
      .withIndex("by_taskPageId_and_legacyId", (q) =>
        q
          .eq("taskPageId", args.page._id)
          .eq("legacyId", checkpoint.id),
      )
      .unique();
    if (existing === null) {
      await ctx.db.insert("taskCheckpoints", {
        workspaceId: args.page.workspaceId,
        areaId: args.page.areaId,
        taskPageId: args.page._id,
        legacyId: checkpoint.id,
        text: checkpoint.text,
        completed: checkpoint.completed,
        position,
        createdByProfileId: args.page.createdByProfileId,
        archivedAt: null,
        createdAt: args.now,
        updatedAt: args.now,
      });
    } else if (
      existing.text !== checkpoint.text ||
      existing.completed !== checkpoint.completed ||
      existing.position !== position ||
      existing.archivedAt !== null
    ) {
      await ctx.db.patch("taskCheckpoints", existing._id, {
        text: checkpoint.text,
        completed: checkpoint.completed,
        position,
        archivedAt: null,
        updatedAt: args.now,
      });
    }
  }

  await syncTaskCheckpointProjection(
    ctx,
    args.page._id,
    args.actorProfileId,
    args.now,
  );
}
