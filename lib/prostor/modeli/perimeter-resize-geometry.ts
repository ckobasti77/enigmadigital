// Preneto iz Devotion apps/web/components/workspace/canvases/perimeter-resize-geometry.ts (main @ c05c40f), SPAJANJE S14.
import type { ResizeParams } from "@xyflow/react";

export type RadialResizeBounds = {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
};

export type RadialResizeStart = ResizeParams & {
  centerX: number;
  centerY: number;
};

export function radialResizeStart(layout: ResizeParams): RadialResizeStart {
  return {
    ...layout,
    centerX: layout.x + layout.width / 2,
    centerY: layout.y + layout.height / 2,
  };
}

export function pointerDistance(
  point: { x: number; y: number },
  center: { x: number; y: number },
) {
  return Math.hypot(point.x - center.x, point.y - center.y);
}

export function radialScaleFromPointer(
  startDistance: number,
  currentDistance: number,
) {
  if (
    !Number.isFinite(startDistance) ||
    !Number.isFinite(currentDistance) ||
    startDistance < 1
  ) {
    return 1;
  }
  return currentDistance / startDistance;
}

export function scaleLayoutAroundCenter(
  start: RadialResizeStart,
  requestedScale: number,
  bounds: RadialResizeBounds,
): ResizeParams {
  const minimumScale = Math.max(
    bounds.minWidth / start.width,
    bounds.minHeight / start.height,
  );
  const maximumScale = Math.min(
    bounds.maxWidth / start.width,
    bounds.maxHeight / start.height,
  );
  const safeScale = Number.isNaN(requestedScale) ? 1 : requestedScale;
  const scale = Math.min(
    Math.max(safeScale, minimumScale),
    maximumScale,
  );
  const width = start.width * scale;
  const height = start.height * scale;

  return {
    x: start.centerX - width / 2,
    y: start.centerY - height / 2,
    width,
    height,
  };
}

export function resizeCursorForPoint(
  point: { x: number; y: number },
  center: { x: number; y: number },
) {
  const angle = Math.atan2(point.y - center.y, point.x - center.x);
  const sector = Math.round(angle / (Math.PI / 4));
  const normalized = ((sector % 4) + 4) % 4;

  if (normalized === 0) return "ew-resize";
  if (normalized === 1) return "nwse-resize";
  if (normalized === 2) return "ns-resize";
  return "nesw-resize";
}
