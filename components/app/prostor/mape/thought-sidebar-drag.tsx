"use client";


// Preneto iz Devotion apps/web/components/workspace/thought-sidebar-drag.tsx (main @ c05c40f), SPAJANJE S14.
import { useEffect, useRef, useState } from "react";
import { Brain, CornerDownLeft } from "lucide-react";

import {
  THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
  type ThoughtDropTarget,
  type ThoughtSidebarDragPointer,
  type ThoughtSidebarDragReleaseDetail,
  type ThoughtSidebarDragRequest,
} from "@/components/app/prostor/ja/brzi-unos/thought-sharing";
import type { Id } from "@/convex/_generated/dataModel";

type Point = {
  x: number;
  y: number;
  pointerId: number | null;
  source: "mouse" | "pointer" | "touch";
  touchId: number | null;
};

type ThoughtSidebarDragLayerProps = {
  request: ThoughtSidebarDragRequest;
  onActiveTargetChange: (target: ThoughtDropTarget | null) => void;
  onDwellTarget: (target: ThoughtDropTarget) => void;
  onComplete: (target: ThoughtDropTarget) => void;
  onCancel: () => void;
};

function pointFromEvent(event: ThoughtSidebarDragPointer, touchId?: number | null): Point | null {
  if ("touches" in event) {
    const touches = event.touches.length > 0 ? event.touches : event.changedTouches;
    if (touches.length === 0) return null;
    const touch = touchId === null || touchId === undefined
      ? touches.item(0)
      : Array.from(touches as ArrayLike<Touch>).find((item) => item.identifier === touchId) ?? null;
    return touch === null
      ? null
      : {
          x: touch.clientX,
          y: touch.clientY,
          pointerId: null,
          source: "touch",
          touchId: touch.identifier,
        };
  }
  const pointer = event as PointerEvent | MouseEvent;
  return {
    x: pointer.clientX,
    y: pointer.clientY,
    pointerId: "pointerId" in pointer ? pointer.pointerId : null,
    source: "pointerId" in pointer ? "pointer" : "mouse",
    touchId: null,
  };
}

function releasePointFromEvent(
  event: PointerEvent | MouseEvent | TouchEvent,
  trackedPoint: Point,
): Point | null {
  if (event instanceof TouchEvent) {
    if (trackedPoint.source !== "touch" || trackedPoint.touchId === null) return null;
    const touch = Array.from(event.changedTouches).find(
      (item) => item.identifier === trackedPoint.touchId,
    );
    return touch === undefined
      ? null
      : {
          x: touch.clientX,
          y: touch.clientY,
          pointerId: null,
          source: "touch",
          touchId: touch.identifier,
        };
  }

  if (event instanceof PointerEvent) {
    if (trackedPoint.source !== "pointer") return null;
    if (
      trackedPoint.pointerId !== null &&
      event.pointerId !== trackedPoint.pointerId
    ) {
      return null;
    }
    return {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
      source: "pointer",
      touchId: null,
    };
  }

  if (trackedPoint.source !== "mouse") return null;
  return {
    x: event.clientX,
    y: event.clientY,
    pointerId: null,
    source: "mouse",
    touchId: null,
  };
}

function matchesTrackedInput(point: Point, trackedPoint: Point) {
  if (point.source !== trackedPoint.source) return false;
  if (point.source === "pointer") {
    return point.pointerId === trackedPoint.pointerId;
  }
  if (point.source === "touch") {
    return point.touchId === trackedPoint.touchId;
  }
  return true;
}

function readDropTarget(x: number, y: number): ThoughtDropTarget | null {
  const hit = document.elementFromPoint(x, y);
  const target = hit?.closest<HTMLElement>("[data-thought-drop-target]");
  if (!target || !target.closest("[data-thought-sidebar-root]")) return null;

  const areaId = target.dataset.thoughtAreaId as Id<"areas"> | undefined;
  if (!areaId) return null;
  const kind = target.dataset.thoughtDropTarget === "page" ? "page" : "area";
  const pageId = kind === "page"
    ? target.dataset.thoughtPageId as Id<"pages"> | undefined
    : null;
  if (kind === "page" && !pageId) return null;

  return {
    kind,
    areaId,
    pageId: pageId ?? null,
    parentPageId: pageId ?? null,
    label: target.dataset.thoughtDropLabel?.trim() || "Izabrano odredište",
  };
}

function targetKey(target: ThoughtDropTarget | null) {
  if (target === null) return "none";
  return target.kind === "page" ? `page:${target.pageId}` : `area:${target.areaId}`;
}

export function ThoughtSidebarDragLayer({
  request,
  onActiveTargetChange,
  onDwellTarget,
  onComplete,
  onCancel,
}: ThoughtSidebarDragLayerProps) {
  const [point, setPoint] = useState<Point | null>(() => pointFromEvent(request.pointerEvent));
  const [activeTarget, setActiveTarget] = useState<ThoughtDropTarget | null>(null);
  const pointRef = useRef<Point | null>(null);
  const hoverKeyRef = useRef("none");
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onActiveTargetChange, onDwellTarget, onComplete, onCancel });

  useEffect(() => {
    callbacksRef.current = { onActiveTargetChange, onDwellTarget, onComplete, onCancel };
  }, [onActiveTargetChange, onDwellTarget, onComplete, onCancel]);

  useEffect(() => {
    let active = true;
    const initialPoint = pointFromEvent(request.pointerEvent);
    if (initialPoint === null) {
      callbacksRef.current.onCancel();
      return;
    }

    pointRef.current = initialPoint;

    function clearHoverTimer() {
      if (hoverTimerRef.current !== null) {
        clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    }

    function updateTarget(nextPoint: Point) {
      const target = readDropTarget(nextPoint.x, nextPoint.y);
      const nextKey = targetKey(target);
      if (hoverKeyRef.current === nextKey) return;

      setActiveTarget(target);
      callbacksRef.current.onActiveTargetChange(target);
      hoverKeyRef.current = nextKey;
      clearHoverTimer();
      if (target !== null) {
        hoverTimerRef.current = setTimeout(() => {
          if (active && hoverKeyRef.current === nextKey) {
            callbacksRef.current.onDwellTarget(target);
          }
        }, target.kind === "area" ? 450 : 550);
      }
    }

    function updatePoint(nextPoint: Point, event?: Event) {
      if (!active) return;
      if (event?.cancelable) event.preventDefault();
      pointRef.current = nextPoint;
      setPoint(nextPoint);
      updateTarget(nextPoint);
    }

    function onPointerMove(event: PointerEvent) {
      const currentPoint = pointRef.current;
      if (
        currentPoint === null ||
        currentPoint.source !== "pointer" ||
        (currentPoint.pointerId !== null && currentPoint.pointerId !== event.pointerId)
      ) {
        return;
      }
      updatePoint({
        x: event.clientX,
        y: event.clientY,
        pointerId: event.pointerId,
        source: "pointer",
        touchId: null,
      }, event);
    }

    function onMouseMove(event: MouseEvent) {
      if (
        pointRef.current?.source !== "mouse"
      ) {
        return;
      }
      updatePoint({
        x: event.clientX,
        y: event.clientY,
        pointerId: null,
        source: "mouse",
        touchId: null,
      }, event);
    }

    function onTouchMove(event: TouchEvent) {
      if (pointRef.current?.source !== "touch") return;
      const nextPoint = pointFromEvent(event, pointRef.current?.touchId);
      if (nextPoint !== null) updatePoint(nextPoint, event);
    }

    function finishAtPoint(releasePoint: Point) {
      if (!active) return;
      const currentPoint = pointRef.current;
      if (
        currentPoint === null ||
        !matchesTrackedInput(releasePoint, currentPoint)
      ) {
        return;
      }
      const target = readDropTarget(releasePoint.x, releasePoint.y);
      active = false;
      if (target === null) callbacksRef.current.onCancel();
      else callbacksRef.current.onComplete(target);
    }

    function finish(event: PointerEvent | MouseEvent | TouchEvent) {
      const currentPoint = pointRef.current;
      if (currentPoint === null) return;
      const releasePoint = releasePointFromEvent(event, currentPoint);
      if (releasePoint !== null) finishAtPoint(releasePoint);
    }

    function onDeferredRelease(event: Event) {
      const detail = (event as CustomEvent<ThoughtSidebarDragReleaseDetail>).detail;
      if (!detail || detail.sessionId !== request.sessionId) return;
      finishAtPoint(detail);
    }

    function cancel(event?: PointerEvent | TouchEvent) {
      if (!active) return;
      const currentPoint = pointRef.current;
      if (event !== undefined && currentPoint !== null) {
        const cancellationPoint = releasePointFromEvent(event, currentPoint);
        if (cancellationPoint === null) return;
      }
      active = false;
      callbacksRef.current.onCancel();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
      }
    }

    function onBlur() {
      cancel();
    }

    function autoScroll() {
      if (!active) return;
      const currentPoint = pointRef.current;
      if (currentPoint !== null) {
        const hit = document.elementFromPoint(currentPoint.x, currentPoint.y);
        const sidebar = hit?.closest<HTMLElement>("[data-thought-sidebar-root]");
        const scroller = sidebar?.querySelector<HTMLElement>("[data-thought-sidebar-scroll]");
        if (scroller) {
          const rect = scroller.getBoundingClientRect();
          const edge = Math.min(64, Math.max(36, rect.height * 0.14));
          let delta = 0;
          if (currentPoint.y >= rect.top && currentPoint.y < rect.top + edge) {
            delta = -Math.ceil(((rect.top + edge - currentPoint.y) / edge) * 12);
          } else if (currentPoint.y <= rect.bottom && currentPoint.y > rect.bottom - edge) {
            delta = Math.ceil(((currentPoint.y - (rect.bottom - edge)) / edge) * 12);
          }
          if (delta !== 0) {
            const before = scroller.scrollTop;
            scroller.scrollTop += delta;
            if (scroller.scrollTop !== before) updateTarget(currentPoint);
          }
        }
      }
      animationFrameRef.current = window.requestAnimationFrame(autoScroll);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      const currentPoint = pointRef.current;
      if (currentPoint !== null) updateTarget(currentPoint);
      autoScroll();
    });
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("mousemove", onMouseMove, true);
    window.addEventListener("mouseup", finish, true);
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", finish, true);
    window.addEventListener("touchcancel", cancel, true);
    window.addEventListener(
      THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
      onDeferredRelease,
      true,
    );
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("blur", onBlur);

    return () => {
      active = false;
      clearHoverTimer();
      hoverKeyRef.current = "none";
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("mousemove", onMouseMove, true);
      window.removeEventListener("mouseup", finish, true);
      window.removeEventListener("touchmove", onTouchMove, true);
      window.removeEventListener("touchend", finish, true);
      window.removeEventListener("touchcancel", cancel, true);
      window.removeEventListener(
        THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
        onDeferredRelease,
        true,
      );
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [request]);

  if (point === null) return null;
  const count = request.nodeIds.length;

  return (
    <>
      <span className="sr-only" aria-live="polite">
        Prevlačenje {count === 1 ? "jedne misli" : `${count} misli`} u bočnu navigaciju.
        {activeTarget ? ` Odredište: ${activeTarget.label}.` : " Izaberi oblast ili stranicu."}
      </span>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-[80] flex max-w-64 items-center gap-2 rounded-xl border border-line-strong bg-popover px-3 py-2 text-xs font-semibold text-popover-foreground shadow-elev-2"
        style={{ transform: `translate3d(${point.x + 14}px, ${point.y + 14}px, 0)` }}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-control text-foreground">
          <Brain className="size-3.5" />
        </span>
        <span className="truncate">{count === 1 ? request.label || "1 misao" : `${count} misli`}</span>
        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
    </>
  );
}
