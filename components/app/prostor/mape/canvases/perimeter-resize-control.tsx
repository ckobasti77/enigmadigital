"use client";


// Preneto iz Devotion apps/web/components/workspace/canvases/perimeter-resize-control.tsx (main @ c05c40f), SPAJANJE S14.
import {
  useCallback,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  useReactFlow,
  useUpdateNodeInternals,
  type Node,
  type ResizeParams,
} from "@xyflow/react";

import { cn } from "@/lib/utils";

import {
  pointerDistance,
  radialResizeStart,
  radialScaleFromPointer,
  resizeCursorForPoint,
  scaleLayoutAroundCenter,
  type RadialResizeBounds,
  type RadialResizeStart,
} from "@/lib/prostor/modeli/perimeter-resize-geometry";
import styles from "@/components/app/prostor/mape/canvases/perimeter-resize-control.module.css";
import { isCanvasSpacePanActive } from "@/components/app/prostor/mape/canvases/use-canvas-navigation";

/**
 * Sve Mape (oblast, ideje, koraci, beleške) koriste pravougaonu karticu
 * (PROSTOR P15). Organski oblik je uklonjen u K23 — više ga niko nije koristio.
 */
export type PerimeterResizeShape = "rounded";

type ActiveResize = {
  pointerId: number;
  start: RadialResizeStart;
  startDistance: number;
  centerClient: { x: number; y: number };
  initialNode: Node;
  latest: ResizeParams;
  moved: boolean;
};

function roundedPath(width: number, height: number, radius = 20) {
  const rx = Math.min(49, (radius / Math.max(width, 1)) * 100);
  const ry = Math.min(49, (radius / Math.max(height, 1)) * 100);
  return [
    `M ${rx} 0`,
    `H ${100 - rx}`,
    `A ${rx} ${ry} 0 0 1 100 ${ry}`,
    `V ${100 - ry}`,
    `A ${rx} ${ry} 0 0 1 ${100 - rx} 100`,
    `H ${rx}`,
    `A ${rx} ${ry} 0 0 1 0 ${100 - ry}`,
    `V ${ry}`,
    `A ${rx} ${ry} 0 0 1 ${rx} 0`,
    "Z",
  ].join(" ");
}

function shapePath(
  _shape: PerimeterResizeShape,
  width: number,
  height: number,
  cornerRadius?: number,
) {
  return roundedPath(width, height, cornerRadius);
}

export function PerimeterResizeControl<NodeType extends Node>({
  nodeId,
  width,
  height,
  selected,
  disabled = false,
  shape,
  cornerRadius,
  minWidth,
  minHeight,
  maxWidth,
  maxHeight,
  ariaLabel,
  onResizeStart,
  onResizeEnd,
}: {
  nodeId: string;
  width: number;
  height: number;
  selected: boolean;
  disabled?: boolean;
  shape: PerimeterResizeShape;
  /** Poluprečnik ugla za `rounded` u px (kartica Mape `rounded-lg` = 10). */
  cornerRadius?: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  ariaLabel: string;
  onResizeStart?: () => void;
  onResizeEnd: (layout: ResizeParams) => void;
}) {
  const { getNode, updateNode } = useReactFlow<NodeType>();
  const updateNodeInternals = useUpdateNodeInternals();
  const activeRef = useRef<ActiveResize | null>(null);
  const keyboardStartRef = useRef<RadialResizeStart | null>(null);
  const keyboardLayoutRef = useRef<ResizeParams | null>(null);
  const [resizing, setResizing] = useState(false);
  const [cursor, setCursor] = useState<CSSProperties["cursor"]>("nwse-resize");
  const bounds: RadialResizeBounds = {
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  };

  const applyLayout = useCallback(
    (layout: ResizeParams) => {
      updateNode(nodeId, (node) => ({
        position: { x: layout.x, y: layout.y },
        width: layout.width,
        height: layout.height,
        style: {
          ...node.style,
          width: layout.width,
          height: layout.height,
        },
      }) as Partial<NodeType>);
      window.requestAnimationFrame(() => updateNodeInternals(nodeId));
    },
    [nodeId, updateNode, updateNodeInternals],
  );

  const restoreInitialNode = useCallback(() => {
    const active = activeRef.current;
    if (!active) return;
    updateNode(nodeId, {
      position: active.initialNode.position,
      width: active.initialNode.width,
      height: active.initialNode.height,
      style: active.initialNode.style,
    } as Partial<NodeType>);
    window.requestAnimationFrame(() => updateNodeInternals(nodeId));
  }, [nodeId, updateNode, updateNodeInternals]);

  const handlePointerDown = (event: ReactPointerEvent<SVGPathElement>) => {
    if (
      disabled ||
      event.button !== 0 ||
      isCanvasSpacePanActive(event.currentTarget)
    ) {
      return;
    }
    const node = getNode(nodeId);
    const nodeElement = event.currentTarget.closest(
      ".react-flow__node",
    ) as HTMLElement | null;
    if (!node || !nodeElement) return;
    const nodeWidth = node.width ?? node.measured?.width ?? width;
    const nodeHeight = node.height ?? node.measured?.height ?? height;
    const start = radialResizeStart({
      x: node.position.x,
      y: node.position.y,
      width: nodeWidth,
      height: nodeHeight,
    });
    const rect = nodeElement.getBoundingClientRect();
    const centerClient = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const startDistance = pointerDistance(
      { x: event.clientX, y: event.clientY },
      centerClient,
    );
    if (startDistance < 1) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeRef.current = {
      pointerId: event.pointerId,
      start,
      startDistance,
      centerClient,
      initialNode: node,
      latest: {
        x: start.x,
        y: start.y,
        width: start.width,
        height: start.height,
      },
      moved: false,
    };
    onResizeStart?.();
    setResizing(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGPathElement>) => {
    const nodeElement = event.currentTarget.closest(
      ".react-flow__node",
    ) as HTMLElement | null;
    const rect = nodeElement?.getBoundingClientRect();
    const hoverCenter = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: event.clientX, y: event.clientY };
    setCursor(
      resizeCursorForPoint(
        { x: event.clientX, y: event.clientY },
        activeRef.current?.centerClient ?? hoverCenter,
      ),
    );

    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const distance = pointerDistance(
      { x: event.clientX, y: event.clientY },
      active.centerClient,
    );
    const next = scaleLayoutAroundCenter(
      active.start,
      radialScaleFromPointer(active.startDistance, distance),
      bounds,
    );
    active.latest = next;
    active.moved =
      Math.abs(next.width - active.start.width) >= 0.5 ||
      Math.abs(next.height - active.start.height) >= 0.5;
    applyLayout(next);
  };

  const finishPointerResize = (
    event: ReactPointerEvent<SVGPathElement>,
  ) => {
    const active = activeRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeRef.current = null;
    setResizing(false);
    if (active.moved) onResizeEnd(active.latest);
  };

  const cancelPointerResize = (
    event: ReactPointerEvent<SVGPathElement>,
  ) => {
    if (activeRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    restoreInitialNode();
    activeRef.current = null;
    setResizing(false);
  };

  const handleKeyboardResize = (
    event: ReactKeyboardEvent<SVGPathElement>,
  ) => {
    if (disabled) return;
    const shrink = event.key === "ArrowLeft" || event.key === "ArrowDown";
    const grow = event.key === "ArrowRight" || event.key === "ArrowUp";
    if (!shrink && !grow && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const node = getNode(nodeId);
    if (!node) return;
    const currentWidth = node.width ?? node.measured?.width ?? width;
    const currentHeight = node.height ?? node.measured?.height ?? height;
    if (keyboardStartRef.current === null) {
      keyboardStartRef.current = radialResizeStart({
        x: node.position.x,
        y: node.position.y,
        width: currentWidth,
        height: currentHeight,
      });
      onResizeStart?.();
    }
    const current = radialResizeStart({
      x: node.position.x,
      y: node.position.y,
      width: currentWidth,
      height: currentHeight,
    });
    const step = event.shiftKey ? 0.1 : 0.025;
    const requestedScale =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? Number.POSITIVE_INFINITY
          : shrink
            ? 1 - step
            : 1 + step;
    const next = scaleLayoutAroundCenter(current, requestedScale, bounds);
    keyboardLayoutRef.current = next;
    applyLayout(next);
    setResizing(true);
  };

  const finishKeyboardResize = (
    event: ReactKeyboardEvent<SVGPathElement>,
  ) => {
    if (
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    const next = keyboardLayoutRef.current;
    keyboardStartRef.current = null;
    keyboardLayoutRef.current = null;
    setResizing(false);
    if (next) onResizeEnd(next);
  };

  const path = shapePath(shape, width, height, cornerRadius);

  return (
    <svg
      className={cn(
        styles.control,
        selected && styles.selected,
        resizing && styles.resizing,
      )}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="false"
    >
      <path
        className={cn(
          styles.path,
          styles.hitPath,
          "canvas-perimeter-resize nodrag nopan nowheel",
        )}
        d={path}
        pathLength={100}
        role="slider"
        // Tab stanica samo na izabranoj kartici (inače svaka kartica ima dve).
        tabIndex={disabled || !selected ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${Math.round(width)} puta ${Math.round(height)}`}
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerResize}
        onPointerCancel={cancelPointerResize}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyboardResize}
        onKeyUp={finishKeyboardResize}
        onBlur={() => {
          const next = keyboardLayoutRef.current;
          keyboardStartRef.current = null;
          keyboardLayoutRef.current = null;
          setResizing(false);
          if (next) onResizeEnd(next);
        }}
      />
      <path
        className={cn(styles.path, styles.visualPath)}
        d={path}
        pathLength={100}
        aria-hidden="true"
      />
    </svg>
  );
}
