"use client";

import { useRef, useState } from "react";

/**
 * One switch whose value lives on the far side of a Meta round trip.
 *
 * Hiding a comment, liking one, turning comments off on a post — all of them
 * are a call to Instagram or Facebook, and a control that waits for the answer
 * before it moves reads as broken. So the flip happens first and the call
 * catches up.
 *
 * Three things had to be true at once, and each of the three was a separate bug
 * before this existed (V2/3):
 *
 *   1. TWO CLICKS ARE NOT TWO CALLS. While a call is in flight the switch is
 *      `pending` and `run` refuses — otherwise two quick presses send two
 *      opposite writes and whichever answers last decides the final state.
 *
 *   2. THE OVERRIDE RETIRES WHEN THE SERVER AGREES, NOT BEFORE AND NOT NEVER.
 *      Clearing it the moment the call returns flashes the old value for the
 *      frame before Convex pushes the new row — which is the exact flicker the
 *      override exists to prevent. Never clearing it is worse: somebody hides
 *      the same comment in Meta Business Suite, the sync writes `hidden: true`,
 *      and the row keeps showing our stale answer until it is remounted. So the
 *      override is held until the stored value matches it, and then dropped, at
 *      which point the server is in charge again.
 *
 *   3. A FAILED CALL PUTS IT BACK. Nothing was changed on Meta's side, so
 *      nothing may stay changed on screen.
 */
export interface OptimisticToggle {
  /** What to draw right now. */
  value: boolean;
  /** True while a call is in flight — bind it to the control's `disabled`. */
  pending: boolean;
  /**
   * Flip to `next` and run the write. A no-op while `pending`. Rethrows what
   * the write threw, after putting the value back, so the call site can turn it
   * into a sentence.
   */
  run: (next: boolean, commit: () => Promise<unknown>) => Promise<void>;
}

export function useOptimisticToggle(actual: boolean): OptimisticToggle {
  const [override, setOverride] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  // Guards the second click inside the same tick, where `pending` has been set
  // but React has not re-rendered yet.
  const inFlight = useRef(false);

  // Retired the moment the stored value agrees — adjusted here rather than in
  // an effect, which is React's own answer for state that has to follow a
  // prop: the re-render this schedules produces the identical value, so there
  // is no frame in which the old one is visible.
  if (override !== null && override === actual) setOverride(null);

  return {
    value: override ?? actual,
    pending,
    run: async (next, commit) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setPending(true);
      setOverride(next);
      try {
        await commit();
      } catch (err) {
        setOverride(null);
        throw err;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
  };
}
