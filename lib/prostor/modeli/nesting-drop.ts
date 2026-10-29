// Preneto iz Devotion apps/web/components/workspace/canvases/nesting-drop.ts (main @ c05c40f), SPAJANJE S14.
export type NestingDropNode = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
};

type NodeRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

function nodeRect(node: NestingDropNode): NodeRect | null {
  const width = node.measured?.width ?? node.width;
  const height = node.measured?.height ?? node.height;
  if (
    width === undefined ||
    height === undefined ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
  };
}

function overlapArea(first: NodeRect, second: NodeRect) {
  const width =
    Math.min(first.right, second.right) -
    Math.max(first.left, second.left);
  const height =
    Math.min(first.bottom, second.bottom) -
    Math.max(first.top, second.top);
  return Math.max(0, width) * Math.max(0, height);
}

/**
 * A card becomes a nesting target only when the dragged card's centre is
 * inside it. Requiring the centre prevents a casual edge overlap during normal
 * canvas layout from unexpectedly changing the hierarchy.
 */
export function selectNestingDropTarget<TNode extends NestingDropNode>(
  dragged: TNode,
  candidates: TNode[],
  excludedIds: ReadonlySet<string> = new Set([dragged.id]),
) {
  const draggedRect = nodeRect(dragged);
  if (draggedRect === null) return null;
  const centreX = (draggedRect.left + draggedRect.right) / 2;
  const centreY = (draggedRect.top + draggedRect.bottom) / 2;

  return (
    candidates
      .flatMap((candidate) => {
        if (excludedIds.has(candidate.id)) return [];
        const candidateRect = nodeRect(candidate);
        if (
          candidateRect === null ||
          centreX < candidateRect.left ||
          centreX > candidateRect.right ||
          centreY < candidateRect.top ||
          centreY > candidateRect.bottom
        ) {
          return [];
        }
        return [{
          candidate,
          overlap: overlapArea(draggedRect, candidateRect),
        }];
      })
      .sort(
        (first, second) =>
          second.overlap - first.overlap ||
          first.candidate.id.localeCompare(second.candidate.id),
      )[0]?.candidate ?? null
  );
}
