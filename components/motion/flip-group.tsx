"use client";

// Preneto iz Devotion apps/web/components/motion/flip-group.tsx (main @ c05c40f), SPAJANJE S08.

import { Component, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { shouldFlip } from "@/lib/prostor/web/flip-snapshot";

gsap.registerPlugin(Flip);

/** Stavke liste koje Flip prati nose ovaj atribut (`data-flip-id="<ključ>"`). */
export const FLIP_SELECTOR = "[data-flip-id]";

/** Iznad ovoliko stavki raspored se menja odmah, bez Flip-a (Devotion K07, E12). */
export const FLIP_MAX_ITEMS = 80;

/** Ulaz nove stavke kreće od ove veličine (Devotion `SCALE.enterFrom`). */
const ULAZ_OD = 0.98;

type FlipGroupProps = {
  /** Kontejner u kome su stavke sa `data-flip-id`. */
  scope: RefObject<HTMLElement | null>;
  /** Potpis rasporeda (npr. ključevi redom); promena okida Flip. */
  layoutKey: string;
  /**
   * Promena ovog ključa nije pomeranje nego nov skup (drugi tab, kucanje u
   * pretrazi): raspored se menja odmah, bez Flip-a i bez ulaza.
   */
  resetKey?: string;
  /** Npr. previše stavki: raspored se menja odmah. */
  disabled?: boolean;
  children: ReactNode;
};

type Snapshot = { state: Flip.FlipState; ids: ReadonlySet<string> } | null;

function flipIds(elements: ReadonlyArray<HTMLElement>): Set<string> {
  return new Set(elements.map((element) => element.dataset.flipId ?? ""));
}

/**
 * Flip za liste koje menja server (glas, odluka, nova stavka drugog člana).
 * `getSnapshotBeforeUpdate` snimi položaje stavki dok je DOM još stari, a
 * posle commit-a stavke doputuju sa starog mesta (`DUR_UI`, `EASE_UI`); nove
 * ulaze neprozirnošću i veličinom 0,98 → 1. Ne treba `capture()` u rukovaocu,
 * pa radi i kad promena stigne posle odgovora servera. Prekidivo:
 * `Flip.getState` zatekne let u toku i nastavlja od trenutnog položaja.
 *
 * Smanjen pokret (`MOTION_QUERIES.still`): bez Flip-a, nove stavke se samo
 * pretope (`DUR_REDUCED`).
 *
 * Ne pravi DOM element (vraća `children`); stavke nose `data-flip-id`.
 */
export class FlipGroup extends Component<FlipGroupProps> {
  private mm: gsap.MatchMedia | null = null;
  private animation: gsap.core.Animation | null = null;

  getSnapshotBeforeUpdate(previous: Readonly<FlipGroupProps>): Snapshot {
    if (!shouldFlip(previous, this.props)) return null;
    const root = this.props.scope.current;
    if (!root) return null;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(FLIP_SELECTOR));
    const state = Flip.getState(elements);
    gsap.killTweensOf(elements, "x,y,scale");
    gsap.set(elements, { clearProps: "transform" });
    return { state, ids: flipIds(elements) };
  }

  componentDidUpdate(
    _previous: Readonly<FlipGroupProps>,
    _state: unknown,
    snapshot: Snapshot,
  ) {
    if (!snapshot) return;
    const root = this.props.scope.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>(FLIP_SELECTOR));
    this.animation?.kill();
    this.animation = null;
    // Prethodna grana se gasi bez vraćanja stilova: nov let kreće od zatečenog
    // položaja, ne od početka starog.
    this.mm?.kill(false);
    this.mm = gsap.matchMedia();

    this.mm.add(MOTION_QUERIES, (ctx) => {
      if (ctx.conditions?.still) {
        const arrived = elements.filter(
          (element) => !snapshot.ids.has(element.dataset.flipId ?? ""),
        );
        if (arrived.length > 0) {
          this.animation = gsap.fromTo(
            arrived,
            { opacity: 0 },
            { opacity: 1, duration: DUR_REDUCED, ease: "none", clearProps: "opacity" },
          );
        }
        return;
      }

      this.animation = Flip.from(snapshot.state, {
        targets: elements,
        duration: DUR_UI,
        ease: EASE_UI,
        nested: true,
        simple: true,
        prune: true,
        onEnter: (entering) =>
          gsap.fromTo(
            entering,
            { autoAlpha: 0, scale: ULAZ_OD },
            {
              autoAlpha: 1,
              scale: 1,
              duration: DUR_UI,
              ease: EASE_UI,
              clearProps: "opacity,visibility,transform",
            },
          ),
      });
    });
  }

  componentWillUnmount() {
    this.animation?.kill();
    this.animation = null;
    this.mm?.kill(false);
    this.mm = null;
  }

  render() {
    return this.props.children;
  }
}
