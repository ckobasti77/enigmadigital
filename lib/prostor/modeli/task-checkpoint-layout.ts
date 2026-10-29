// Preneto iz Devotion apps/web/components/workspace/canvases/task-checkpoint-layout.ts (main @ c05c40f), SPAJANJE S14.
export type CheckpointNodeMetrics = {
  width: number;
  height: number;
};

export const TASK_CHECKPOINT_SIZE_PRESETS = {
  compact: { width: 164, height: 110 },
  expanded: { width: 360, height: 240 },
} as const;

export type TaskCheckpointSizePreset =
  keyof typeof TASK_CHECKPOINT_SIZE_PRESETS;

const CHECKPOINT_EXPANDED_WIDTH_THRESHOLD =
  (TASK_CHECKPOINT_SIZE_PRESETS.compact.width +
    TASK_CHECKPOINT_SIZE_PRESETS.expanded.width) /
  2;
const CHECKPOINT_EXPANDED_HEIGHT_THRESHOLD =
  (TASK_CHECKPOINT_SIZE_PRESETS.compact.height +
    TASK_CHECKPOINT_SIZE_PRESETS.expanded.height) /
  2;

export function taskCheckpointUsesExpandedSize({
  manuallySized,
  width,
  height,
}: {
  manuallySized: boolean;
  width: number | undefined;
  height: number | undefined;
}) {
  return (
    manuallySized &&
    (width ?? TASK_CHECKPOINT_SIZE_PRESETS.compact.width) >=
      CHECKPOINT_EXPANDED_WIDTH_THRESHOLD &&
    (height ?? TASK_CHECKPOINT_SIZE_PRESETS.compact.height) >=
      CHECKPOINT_EXPANDED_HEIGHT_THRESHOLD
  );
}

export function taskCheckpointOrdinal(
  ordinal: number | null | undefined,
  index: number,
) {
  return typeof ordinal === "number" &&
    Number.isInteger(ordinal) &&
    ordinal > 0
    ? ordinal
    : index + 1;
}

export function taskCheckpointNodeId(checkpointId: string) {
  return `checkpoint:${checkpointId}`;
}

export function taskCheckpointNodeMetrics(
  text: string,
): CheckpointNodeMetrics {
  const normalized = text.trim().replace(/\s+/g, " ");
  const length = Math.max(1, normalized.length);
  const width =
    length <= 26 ? 164 : length <= 70 ? 196 : 228;
  const charactersPerLine = Math.max(18, Math.floor((width - 34) / 7));
  const lineCount = Math.min(6, Math.max(1, Math.ceil(length / charactersPerLine)));
  return {
    width,
    height: 82 + lineCount * 18,
  };
}

export function taskCheckpointOrbitPosition({
  index,
  center,
  node,
  exclusion = { width: 288, height: 196 },
}: {
  index: number;
  center: { x: number; y: number };
  node: CheckpointNodeMetrics;
  exclusion?: CheckpointNodeMetrics;
}) {
  const safeIndex = Math.max(0, Math.floor(index));
  let ring = 0;
  let indexInRing = safeIndex;
  let ringCapacity = 8;
  while (indexInRing >= ringCapacity) {
    indexInRing -= ringCapacity;
    ring += 1;
    ringCapacity = 8 + ring * 6;
  }

  const angle =
    -Math.PI / 2 + (Math.PI * 2 * indexInRing) / ringCapacity;
  const radiusX = exclusion.width / 2 + 132 + ring * 152;
  const radiusY = exclusion.height / 2 + 104 + ring * 128;

  return {
    x: Math.round(
      center.x + Math.cos(angle) * radiusX - node.width / 2,
    ),
    y: Math.round(
      center.y + Math.sin(angle) * radiusY - node.height / 2,
    ),
  };
}
