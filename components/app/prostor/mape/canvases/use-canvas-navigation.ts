"use client";


// Preneto iz Devotion apps/web/components/workspace/canvases/use-canvas-navigation.ts (main @ c05c40f), SPAJANJE S14.
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
} from "react";

import {
  mapActivation,
  type MapActivationEvent,
} from "@/lib/prostor/modeli/map-model";

const DISABLED_PAN_GUARD_CLASS = "__canvas_pan_guard_disabled__";
const DISABLED_WHEEL_GUARD_CLASS = "__canvas_wheel_guard_disabled__";

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""], .nokey',
    ),
  );
}

export function isCanvasSpacePanActive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest('[data-canvas-space-pan="true"]') !== null
  );
}

export function useCanvasNavigation() {
  const [spacePressed, setSpacePressed] = useState(false);
  const [zoomModifierPressed, setZoomModifierPressed] = useState(false);

  useEffect(() => {
    const reset = () => {
      setSpacePressed(false);
      setZoomModifierPressed(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Space" && !isTextEntryTarget(event.target)) {
        setSpacePressed(true);
      }
      if (event.key === "Control" || event.key === "Meta") {
        setZoomModifierPressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpacePressed(false);
      if (event.key === "Control" || event.key === "Meta") {
        setZoomModifierPressed(event.ctrlKey || event.metaKey);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") reset();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, []);

  return useMemo(
    () => ({
      spacePressed,
      zoomModifierPressed,
      noPanClassName: spacePressed
        ? DISABLED_PAN_GUARD_CLASS
        : "nopan",
      noWheelClassName:
        spacePressed || zoomModifierPressed
          ? DISABLED_WHEEL_GUARD_CLASS
          : "nowheel",
    }),
    [spacePressed, zoomModifierPressed],
  );
}

/**
 * Aktivacija točkića Mape (PROSTOR P15, K07 §7). Neaktivna mapa pušta točkić
 * stranici (`preventScrolling={false}`, bez `panOnScroll`); klik ili fokus u
 * mapi je aktivira, klik van, odlazak fokusa van, Esc ili napuštanje prozora je
 * gasi. Pravila su čista funkcija `mapActivation` (test u `map-model.test.ts`).
 */
export function useMapActivation() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(false);
  const dispatch = useCallback((event: MapActivationEvent) => {
    setActive((current) => mapActivation(current, event));
  }, []);

  useEffect(() => {
    if (!active) return;
    const handlePointerDown = (event: PointerEvent) => {
      const container = ref.current;
      if (
        container &&
        event.target instanceof Node &&
        !container.contains(event.target)
      ) {
        dispatch("pointer-outside");
      }
    };
    const handleWindowBlur = () => dispatch("window-blur");
    // Klik na prazno platno ne daje fokus ničemu u mapi, pa Esc stiže samo do
    // dokumenta — zato se sluša tamo, i to samo dok je mapa aktivna.
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch("escape");
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [active, dispatch]);

  // ⌘ + točkić (Mac) zumira i neaktivnu mapu: xyflow bez `preventScrolling`
  // propušta samo Ctrl. Prvi takav potez aktivira mapu i ne skroluje stranicu.
  useEffect(() => {
    const container = ref.current;
    if (!container || active) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      dispatch("focus-inside");
    };
    container.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => container.removeEventListener("wheel", handleWheel, { capture: true });
  }, [active, dispatch]);

  const handlers = useMemo(
    () => ({
      onPointerDownCapture: () => dispatch("pointer-inside"),
      onFocusCapture: () => dispatch("focus-inside"),
      onBlurCapture: (event: ReactFocusEvent<HTMLElement>) => {
        // Klik na neaktivno platno skida fokus bez novog cilja (`relatedTarget`
        // je null) — to nije izlazak iz mape; izlazak je fokus na nešto van nje.
        const next = event.relatedTarget;
        const container = ref.current;
        if (next instanceof Node && container && !container.contains(next)) {
          dispatch("focus-outside");
        }
      },
    }),
    [dispatch],
  );

  const deactivate = useCallback(() => dispatch("escape"), [dispatch]);

  return { ref, active, handlers, deactivate };
}
