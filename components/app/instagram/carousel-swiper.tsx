"use client";

import { useCallback, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DUR_MOMENTUM,
  DUR_REDUCED,
  DUR_UI,
  EASE_MOMENTUM,
  EASE_UI,
  MOTION_QUERIES,
} from "@/lib/motion";
import {
  holdCssTransition,
  releaseCssTransition,
} from "@/components/motion/css-transition";
import { igMediaSrc } from "@/lib/ig-media";
import { PostImage, type MediaVariant } from "./post-media";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * CAROUSEL SWIPER
 * ============================================================================
 *
 * The slides of one CAROUSEL_ALBUM, one frame at a time.
 *
 * This is the one place in the app that drives GSAP by hand instead of going
 * through `Reveal`. That rule is about ENTRANCES — a screen must not re-reveal
 * itself when Convex pushes new data. A gesture is the opposite case: the
 * position is owned by a finger, so it has to be written every frame.
 *
 * What separates a good swiper from a bad one lives in three details:
 *
 *   1:1 tracking      the track follows the pointer while the gesture lasts,
 *                     and is never "animated afterwards".
 *   projection        on release the target is the slide nearest to where the
 *                     THROW would have come to rest, not the one nearest the
 *                     finger. A short hard flick therefore turns the page; a
 *                     long slow drag of the same length does not.
 *   interruptibility  every tween can be caught mid-flight — pressing down
 *                     kills it and picks the picture up wherever it is.
 *
 * Under `prefers-reduced-motion: reduce` none of that applies: the slides stack
 * on top of each other and cross-fade, and dragging is off. Both branches share
 * one DOM — each slide is laid out with `left: i * 100%`, and the still branch
 * cancels that offset with an equal `xPercent`.
 * ============================================================================
 */

export type CarouselSlide = { id: string; mediaType: string };

/** Below this a press is a click, not a drag — a tap must stay a tap. */
const DRAG_THRESHOLD_PX = 4;

/**
 * How far ahead a throw is projected. At the speed of an ordinary flick
 * (~1.5 px/ms) this lands roughly two thirds of a frame past the release
 * point — enough to turn the page, not enough to fly across the album.
 */
const PROJECTION_MS = 140;

/** Below this the gesture is a placement, not a throw: no overshoot. */
const THROW_VELOCITY = 0.05; // px/ms

/** Only the tail of the gesture decides the speed; the run-up does not. */
const VELOCITY_WINDOW_MS = 90;

/**
 * A finger that has been still for longer than this has no momentum left,
 * whatever it was doing before it stopped.
 *
 * Without it the tail window above measures a flick that ended a second ago:
 * drag fast, hold still, lift — and the track is thrown a whole frame past
 * where the finger was put down. "Drag slowly and let go exactly where I want
 * it" has to be possible, and this is the only thing that makes it so.
 */
const STILL_BEFORE_RELEASE_MS = 120;

/** Resistance constant past the first and last slide. Lower = stiffer. */
const RUBBER = 0.55;

/**
 * Growing resistance instead of a hard wall. Asymptotic in `dimension`, so the
 * edge can always be pushed and never be crossed.
 */
function rubberBand(overshoot: number, dimension: number): number {
  if (dimension <= 0) return 0;
  return (overshoot * dimension * RUBBER) / (dimension + RUBBER * overshoot);
}

type Sample = { t: number; x: number };

type DragState = {
  pointerId: number;
  startX: number;
  startTranslate: number;
  active: boolean;
  /**
   * The press landed on a moving track and killed the tween in flight.
   *
   * Stopping the picture with a finger is a legitimate act, so this is not an
   * error state — but it does mean that even a press which never becomes a
   * drag still owes the track a landing. Without it, a tap on a sliding frame
   * froze the strip halfway between two pictures for good.
   */
  caught: boolean;
  samples: Sample[];
};

export function CarouselSwiper({
  mediaId,
  slides,
  caption,
  variant,
}: {
  mediaId: string;
  slides: CarouselSlide[];
  caption: string;
  variant: MediaVariant;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const indexRef = useRef(0);
  const widthRef = useRef(0);
  const stillRef = useRef(false);

  const [index, setIndex] = useState(0);
  /**
   * Which frame the TRACK is over, which during a gesture is not `index` —
   * `index` only moves once the gesture ends. The preload window below hangs
   * off this one so a swipe across two frames does not uncover a picture that
   * was never mounted.
   */
  const [nearIndex, setNearIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [still, setStill] = useState(false);

  const count = slides.length;
  const label = caption.trim() || "Instagram objava";

  const slideEls = useCallback(
    () => Array.from(trackRef.current?.children ?? []) as HTMLElement[],
    [],
  );

  /** Which frame a given track offset is nearest to. */
  const frameAt = useCallback(
    (x: number): number => {
      const width = widthRef.current || 1;
      return Math.max(0, Math.min(count - 1, Math.round(-x / width)));
    },
    [count],
  );

  /** Snap to a slide. `thrown` is what earns the momentum ease. */
  const goTo = useCallback(
    (next: number, thrown = false) => {
      const track = trackRef.current;
      if (!track) return;

      const target = Math.max(0, Math.min(count - 1, next));
      indexRef.current = target;
      setIndex(target);
      setNearIndex(target);

      tweenRef.current?.kill();

      if (stillRef.current) {
        const els = slideEls();
        for (const el of els) holdCssTransition(el);
        tweenRef.current = gsap.to(els, {
          opacity: (i: number) => (i === target ? 1 : 0),
          duration: DUR_REDUCED,
          ease: "none",
          overwrite: "auto",
          onComplete: () => {
            for (const el of els) releaseCssTransition(el);
          },
        });
        return;
      }

      // Overshoot belongs to a throw — and only where there is something to
      // overshoot into. Past the first and last frame there is only empty
      // space, so those two land on the plain UI curve.
      const atEdge = target === 0 || target === count - 1;
      tweenRef.current = gsap.to(track, {
        x: -target * widthRef.current,
        duration: thrown ? DUR_MOMENTUM : DUR_UI,
        ease: thrown && !atEdge ? EASE_MOMENTUM : EASE_UI,
        overwrite: "auto",
      });
    },
    [count, slideEls],
  );

  useGSAP(
    () => {
      const track = trackRef.current;
      if (!track) return;

      widthRef.current = track.clientWidth;
      if (indexRef.current > count - 1) {
        // Convex dropped a slide out from under us. Clamping the ref alone was
        // not enough: React state kept the old number, so the counter said
        // "4 / 3" and the load window below — which is a distance from the
        // current frame — matched no slide at all and the swiper showed a
        // black rectangle.
        const clamped = Math.max(0, count - 1);
        indexRef.current = clamped;
        setIndex(clamped);
        setNearIndex(clamped);
      }

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const isStill = Boolean(ctx.conditions?.still);
        stillRef.current = isStill;
        setStill(isStill);
        tweenRef.current?.kill();

        const els = slideEls();
        if (isStill) {
          // Cancel the `left` offset so the frames sit on top of each other.
          gsap.set(track, { x: 0 });
          els.forEach((el, i) => {
            gsap.set(el, {
              xPercent: -100 * i,
              opacity: i === indexRef.current ? 1 : 0,
            });
          });
          return;
        }

        gsap.set(els, { xPercent: 0, opacity: 1 });
        gsap.set(track, { x: -indexRef.current * widthRef.current });
      });

      // A resize moves every frame boundary; the track is re-parked without
      // animation so a layout change never reads as a swipe.
      const observer = new ResizeObserver(() => {
        widthRef.current = track.clientWidth;
        if (stillRef.current || dragRef.current) return;
        tweenRef.current?.kill();
        gsap.set(track, { x: -indexRef.current * widthRef.current });
      });
      observer.observe(track);

      return () => {
        observer.disconnect();
        // The tweens are built inside the event handlers, outside this
        // context, so nothing else kills them. Unmounting mid-flight otherwise
        // leaves a tween writing transforms into a detached node — and in the
        // reduced-motion branch fires `onComplete` over elements that are
        // already gone.
        tweenRef.current?.kill();
        tweenRef.current = null;
        // A cross-fade killed halfway leaves `transition: none !important` on
        // every slide. Harmless on unmount, permanent when this ran because
        // the slide COUNT changed and the same elements stay on screen.
        for (const el of slideEls()) releaseCssTransition(el);
      };
    },
    { dependencies: [count, slideEls], scope: rootRef },
  );

  /** Clamp with resistance rather than with a wall. */
  const withResistance = (raw: number): number => {
    const width = widthRef.current;
    const min = -(count - 1) * width;
    if (raw > 0) return rubberBand(raw, width);
    if (raw < min) return min - rubberBand(min - raw, width);
    return raw;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || stillRef.current || count < 2) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    // Catch the picture in flight instead of waiting for it to land. Whether
    // there WAS something to catch decides what a press that never turns into
    // a drag has to do on release — see `closeGesture`.
    const caught = tweenRef.current?.isActive() === true;
    tweenRef.current?.kill();
    tweenRef.current = null;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTranslate: Number(gsap.getProperty(track, "x")),
      active: false,
      caught,
      samples: [{ t: event.timeStamp, x: event.clientX }],
    };
    // The pointer is deliberately NOT captured here. Capturing on press
    // retargets the following `click` to this element, which would swallow
    // every tap on a dot or an arrow inside it. Capture waits until the
    // gesture is unmistakably a drag.
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || !track || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    if (!drag.active) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      drag.active = true;
      setDragging(true);
      // Now it is a drag: take the pointer so it keeps reporting even when it
      // leaves the frame, and so the release does not read as a click.
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    drag.samples.push({ t: event.timeStamp, x: event.clientX });
    if (drag.samples.length > 6) drag.samples.shift();

    // Written straight, with no tween in between: this is the 1:1 part.
    const x = withResistance(drag.startTranslate + dx);
    gsap.set(track, { x });
    setNearIndex(frameAt(x));
  };

  /**
   * Close the gesture, whichever way it ended.
   *
   * EVERY exit goes through here — `pointerup`, `pointercancel`, the pointer
   * leaving the card before the capture is taken, and the browser taking the
   * capture away. Before V3 only the first two existed, so a mouse pressed on
   * the swiper, nudged two pixels and released outside the card left `dragRef`
   * populated with a live `startX`: no `pointerup` ever reached the root, and
   * the next move back over the card — button up, same `pointerId` — crossed
   * the threshold, took the capture and tracked a bare cursor.
   *
   * `release` is where and when the pointer let go. Null when there is no such
   * moment (a capture taken away by the browser), and then there is no throw
   * to project either.
   */
  const closeGesture = (
    node: HTMLElement,
    pointerId: number,
    release: Sample | null,
  ) => {
    const drag = dragRef.current;
    const track = trackRef.current;
    if (!drag || drag.pointerId !== pointerId) return;

    dragRef.current = null;
    if (node.hasPointerCapture(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
    setDragging(false);
    if (!track) return;

    const width = widthRef.current || 1;
    const current = Number(gsap.getProperty(track, "x"));

    // A press that never crossed the threshold is a tap, and a tap moves
    // nothing — unless it caught a tween in flight, in which case the track is
    // sitting between two frames and only this can put it back on one.
    if (!drag.active) {
      if (drag.caught) goTo(frameAt(current));
      return;
    }

    // The last real MOVE is what says whether the finger was still moving at
    // all. Read before the release is appended, because the release is not a
    // movement — it is the end of one.
    const samples = drag.samples;
    const lastMove = samples[samples.length - 1];
    const stalled =
      release === null || release.t - lastMove.t > STILL_BEFORE_RELEASE_MS;

    // The release is a sample too. Without it the tail window below can be
    // measuring a stretch of the gesture that ended long before the finger did.
    if (release !== null) samples.push(release);

    let velocity = 0;
    if (!stalled) {
      const last = samples[samples.length - 1];
      let first = samples[0];
      for (let i = samples.length - 1; i >= 0; i--) {
        if (last.t - samples[i].t > VELOCITY_WINDOW_MS) break;
        first = samples[i];
      }
      const elapsed = last.t - first.t;
      if (elapsed > 0) velocity = (last.x - first.x) / elapsed;
    }

    // Where the throw would have come to rest — the target is the frame
    // nearest THAT point, which is why a flick turns the page and a slow drag
    // across the same distance does not. A still finger projects nowhere and
    // lands exactly where it is.
    const projected = current + velocity * PROJECTION_MS;
    goTo(Math.round(-projected / width), Math.abs(velocity) > THROW_VELOCITY);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    closeGesture(event.currentTarget, event.pointerId, {
      t: event.timeStamp,
      x: event.clientX,
    });
  };

  /**
   * The pointer left the card before the gesture earned its capture.
   *
   * Only before: once the capture is taken, it IS the promise that `pointerup`
   * comes back to this element, and a touch pointer holds an implicit capture
   * from the moment it goes down — so this fires for an uncommitted mouse and
   * for nothing else.
   */
  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.active) return;
    closeGesture(event.currentTarget, event.pointerId, {
      t: event.timeStamp,
      x: event.clientX,
    });
  };

  /**
   * The capture was taken away — the page scroll won the touch, the node was
   * re-parented, a dialog opened over it. Our own `releasePointerCapture` fires
   * this too, but by then `dragRef` is already empty and this returns at once.
   */
  const handleLostCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    closeGesture(event.currentTarget, event.pointerId, null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(indexRef.current - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(indexRef.current + 1);
    }
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="karusel"
      aria-label={`${label} — ${count} slika`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={handlePointerLeave}
      onLostPointerCapture={handleLostCapture}
      className={cn(
        "group/swiper absolute inset-0 touch-pan-y overflow-hidden select-none",
        still ? "cursor-default" : dragging ? "cursor-grabbing" : "cursor-grab",
      )}
    >
      <div ref={trackRef} className="relative size-full">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            aria-hidden={i !== index}
            style={{ left: `${i * 100}%` }}
            className="absolute inset-y-0 w-full overflow-hidden bg-bg-900"
          >
            {/* Only the frame in view and its two neighbours are fetched — a
                page full of carousels would otherwise open hundreds of proxy
                requests for pictures nobody has swiped to. Measured from where
                the TRACK is, not from `index`: `index` stands still for the
                whole gesture, so a drag across two frames used to reveal a
                slide whose picture had never been mounted and slide a skeleton
                in under the finger. */}
            {Math.abs(i - nearIndex) <= 1 && (
              <PostImage
                src={igMediaSrc(mediaId, slide.id)}
                alt={`${label} — slika ${i + 1} od ${count}`}
                type={slide.mediaType}
                variant={variant}
              />
            )}
          </div>
        ))}
      </div>

      {/* ── Arrows — pointer only, and only once the card is hovered ─────── */}
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-2 opacity-0 transition-opacity duration-150 group-focus-within/swiper:opacity-100 group-hover/swiper:opacity-100 max-md:hidden">
        <SwiperArrow
          direction="prev"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        />
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 opacity-0 transition-opacity duration-150 group-focus-within/swiper:opacity-100 group-hover/swiper:opacity-100 max-md:hidden">
        <SwiperArrow
          direction="next"
          disabled={index === count - 1}
          onClick={() => goTo(index + 1)}
        />
      </div>

      {/* ── Position: dots in the middle, count in the corner ────────────── */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2.5">
        <div className="flex-1" />

        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-bg-950/70 px-2 py-1.5 backdrop-blur-md">
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Slika ${i + 1} od ${count}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
              className={cn(
                "size-1.5 rounded-full transition-all duration-150",
                i === index
                  ? "w-4 bg-accent-400"
                  : "bg-text-muted hover:bg-text-secondary",
              )}
            />
          ))}
        </div>

        <div className="flex flex-1 justify-end">
          <span
            aria-live="polite"
            className="rounded bg-bg-950/80 px-2 py-0.5 font-mono text-micro tabular-nums text-text-primary backdrop-blur-md"
          >
            {index + 1} / {count}
          </span>
        </div>
      </div>
    </div>
  );
}

function SwiperArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={direction === "prev" ? "Prethodna slika" : "Sledeća slika"}
      className="pointer-events-auto inline-flex size-7 items-center justify-center rounded-full bg-bg-950/75 text-text-primary backdrop-blur-md transition-colors duration-150 hover:bg-bg-950/90 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
