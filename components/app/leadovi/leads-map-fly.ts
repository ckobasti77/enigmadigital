import gsap from "gsap";
import type { Map as MapLibreMap } from "maplibre-gl";

/**
 * Let kamere (GL4, plan §9): `gsap.to` nad jednim napretkom `t` i
 * `map.jumpTo` na svakom `onUpdate`. 1,4 s, `power3.inOut` — spor polazak,
 * brz sredinom, meko sletanje. Zoom u sredini leta blago „padne" (zavisno od
 * udaljenosti u pikselima), pa dug let izgleda kao let, a ne kao klizanje.
 *
 * Prekid: `dragstart` na mapi (čovek je uzeo mapu u ruke) ili `kill()`
 * spolja. Pod `prefers-reduced-motion` nema leta — `jumpTo` odmah.
 */

export type CiljKamere = {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
  /** Prostor za bočni panel desno (piksela). */
  paddingRight?: number;
};

export type Let = {
  kill: () => void;
  /** Rešava se kad kamera stigne, ili kad je let prekinut. */
  gotov: Promise<"stigao" | "prekinut">;
};

export const LET_TRAJANJE_S = 1.4;
const LET_EASE = "power3.inOut";

export function letiDoTacke(
  map: MapLibreMap,
  cilj: CiljKamere,
  opts: { reducedMotion: boolean },
): Let {
  const padding = { top: 0, bottom: 0, left: 0, right: cilj.paddingRight ?? 0 };
  const odrediste = {
    center: [cilj.lng, cilj.lat] as [number, number],
    zoom: cilj.zoom,
    pitch: cilj.pitch,
    bearing: cilj.bearing,
    padding,
  };

  if (opts.reducedMotion) {
    map.jumpTo(odrediste);
    return { kill: () => {}, gotov: Promise.resolve("stigao") };
  }

  const c = map.getCenter();
  const start = {
    lng: c.lng,
    lat: c.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  };
  // Najkraći put po azimutu — ne 340° u pogrešnu stranu.
  const dBearing = ((cilj.bearing - start.bearing + 540) % 360) - 180;

  // Pad zooma u sredini leta: nula do ~300 px udaljenosti, do 3 nivoa za
  // let preko celog grada.
  const p0 = map.project([start.lng, start.lat]);
  const p1 = map.project([cilj.lng, cilj.lat]);
  const razdaljinaPx = Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const pad = Math.min(3, Math.max(0, Math.log2(razdaljinaPx / 300)));

  const stanje = { t: 0 };
  let ishod: "stigao" | "prekinut" = "stigao";
  let resolve: (v: "stigao" | "prekinut") => void = () => {};
  const gotov = new Promise<"stigao" | "prekinut">((r) => {
    resolve = r;
  });
  let zavrseno = false;

  const zavrsi = () => {
    if (zavrseno) return;
    zavrseno = true;
    map.off("dragstart", naDrag);
    resolve(ishod);
  };
  const naDrag = () => {
    ishod = "prekinut";
    tween.kill();
    zavrsi();
  };

  const tween = gsap.to(stanje, {
    t: 1,
    duration: LET_TRAJANJE_S,
    ease: LET_EASE,
    onUpdate() {
      const t = stanje.t;
      map.jumpTo({
        center: [
          start.lng + (cilj.lng - start.lng) * t,
          start.lat + (cilj.lat - start.lat) * t,
        ],
        zoom: start.zoom + (cilj.zoom - start.zoom) * t - pad * Math.sin(Math.PI * t),
        pitch: start.pitch + (cilj.pitch - start.pitch) * t,
        bearing: start.bearing + dBearing * t,
        padding,
      });
    },
    onComplete() {
      // Poslednji kadar tačno na cilju — bez akumulirane greške interpolacije.
      map.jumpTo(odrediste);
      zavrsi();
    },
  });
  map.on("dragstart", naDrag);

  return {
    kill: () => {
      if (zavrseno) return;
      ishod = "prekinut";
      tween.kill();
      zavrsi();
    },
    gotov,
  };
}
