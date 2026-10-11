"use client";

import { useEffect, type RefObject } from "react";

/**
 * Traka koja kliza vodoravno bez vidljivog klizača (`.tab-scroll`, F1) mora
 * drugačije da pokaže da ima još sadržaja: ivica iza koje nešto čeka dobija
 * `data-edge-start` / `data-edge-end`, a CSS je na osnovu toga pretapa.
 *
 * Atribut se piše pravo na element — klizanje trake ne renderuje komponentu.
 * Efekat namerno nema listu zavisnosti: novi jezičak ili bedž menja širinu
 * sadržaja bez promene veličine same trake, pa se stanje ivica ponovo očita
 * posle svakog rendera.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute("data-edge-start", el.scrollLeft > 1);
      el.toggleAttribute("data-edge-end", el.scrollLeft < max - 1);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  });
}
