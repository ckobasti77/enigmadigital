// Preneto iz Devotion apps/web/components/workspace/task-checkpoint-order.ts (main @ c05c40f), SPAJANJE S12.
import { taskCheckpointOrdinal } from "./task-checkpoint-layout";

type OrderableTaskCheckpoint = {
  completed: boolean;
  ordinal?: number | null;
  chainedToPrevious?: boolean;
};

/**
 * Bez lanca lista gura završene korake na dno — otvoreni posao je ono što se
 * gleda. Čim postoji makar jedan vezan korak, redosled postaje strogo numerički:
 * lanac se mora čitati odozgo nadole da bi katanac imao smisla.
 */
export function orderTaskCheckpointsForEditor<
  TCheckpoint extends OrderableTaskCheckpoint,
>(checkpoints: TCheckpoint[]) {
  const hasChain = checkpoints.some(
    (checkpoint) => checkpoint.chainedToPrevious === true,
  );
  return checkpoints
    .map((checkpoint, index) => ({
      checkpoint,
      ordinal: taskCheckpointOrdinal(checkpoint.ordinal, index),
    }))
    .sort((left, right) =>
      hasChain
        ? left.ordinal - right.ordinal
        : Number(left.checkpoint.completed) -
            Number(right.checkpoint.completed) ||
          left.ordinal - right.ordinal,
    );
}
