"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LayerSpecification,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import type { Temperatura } from "./lead-chips";
import { mix } from "./leads-map-color";
import {
  dodajPinSlike,
  pinIme,
  PIN_SENKA_IME,
  type PinBoje,
} from "./leads-map-pin";
import { letiDoTacke, type Let } from "./leads-map-fly";
import { LeadsThreeLayer, type ThreeTacka } from "./leads-map-three-layer";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * MAPA LEADOVA — MapLibre sloj (GL3, pinovi u GL7) — plan §8
 * ============================================================================
 *
 * Ovaj fajl zna samo za MapLibre: stil, izvore, slojeve, kameru i događaje.
 * Stanja ekrana (učitava se / greška / nema tačaka / panel / kartica) crta
 * omotač `leads-map.tsx`; odavde izlaze samo činjenice preko callback-ova.
 *
 * GL7: heksagonalne prizme (visina = fit) su zamenjene Google-stil pinovima.
 * Lead je crveni pin (`symbol` sloj sa slikom iz `map.addImage`); temperatura
 * se čita iz kruga u glavi pina, ne iz boje/visine prizme. Fit ostaje u hover
 * kartici i panelu, ne u geometriji.
 *
 * NIŠTA LEPO NE SME DA BUDE LAŽNO:
 *  - boja kruga u glavi = temperatura iz baze, kroz `--temp-*` tokene;
 *  - broj na klasteru je stvaran broj tačaka koje je supercluster spojio;
 *  - izbor uvećava pin (×1,25) i stavlja ga u prvi plan (`symbol-sort-key`),
 *    ništa se ne izmišlja.
 *
 * STIL: prvo CARTO dark-matter, pa OpenFreeMap positron. Oba prolaze kroz
 * isti „slate" override (pozadina, kopno, voda, putevi, natpisi na tokene
 * aplikacije), pa mapa izgleda isto bez obzira na to koji je izvor uspeo.
 * Neuspeh se DETEKTUJE (`error` događaj pre učitavanja stila + rok od 20 s),
 * ne pretpostavlja.
 */

export type MapPoint = {
  companyId: string;
  naziv: string;
  grad: string | null;
  lat: number;
  lng: number;
  temperatura: Temperatura;
  /** Fit u procentima, ili `null` kad se ne može izmeriti (vidi `fitRazlog`). */
  fit: number | null;
  fitRazlog: "bez_pravila" | "bez_signala" | null;
  faza: string;
  nisa: string | null;
  imaSajt: string | null;
  poslednjiDodirAt: number | null;
  sastanakAt: number | null;
};

export type MapHover = { point: MapPoint; x: number; y: number };

export type MapStyleState =
  | { faza: "loading" }
  | { faza: "ready"; izvor: "carto" | "openfreemap" }
  | { faza: "error"; poruka: string };

export type LeadsMapCanvasProps = {
  mode: "all" | "single";
  tacke: MapPoint[];
  /** Izabrana firma (bočni panel). Kamera se pomera samo kad izbor NIJE došao klikom na mapu. */
  selectedId: string | null;
  onSelect?: (companyId: string | null) => void;
  onOpenProfile?: (companyId: string) => void;
  onHover?: (hover: MapHover | null) => void;
  onStyleState: (state: MapStyleState) => void;
  /** Širina otvorenog panela desno — kamera ne sme da sakrije tačku ispod njega. */
  paddingRight?: number;
  /** Promena vrednosti ponovo pravi mapu od nule (dugme „Pokušaj ponovo"). */
  retryKey: number;
  /**
   * „Preleti hot firme" (GL4): redosled firmi za obilazak. Dok nije `null`,
   * kamera leti od jedne do druge sa pauzom od 2 s i otvara karticu svake;
   * klik bilo gde, Esc ili prevlačenje mape prekidaju.
   */
  tura?: string[] | null;
  onTuraKraj?: () => void;
  className?: string;
};

// ── Konstante ────────────────────────────────────────────────────────────────

const STILOVI = [
  {
    izvor: "carto" as const,
    url: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  {
    izvor: "openfreemap" as const,
    url: "https://tiles.openfreemap.org/styles/positron",
  },
];

/**
 * Worker URL se postavlja RUČNO (GL6 §1). `maplibre-gl@6.8` sam izvodi URL
 * workera iz `import.meta.url`, koji u Next/Turbopack bundlu pokazuje na
 * `/_next/static/chunks/…` — pa worker traži fajl koji tamo ne postoji, 404
 * ostaje tih i mapa je prazno platno. Fajlove u `public/maplibre/` stavlja
 * `scripts/copy-maplibre-worker.mjs` (prebuild + postinstall). Poziva se
 * jednom po modulu, pre prvog `new MapLibreMap(...)`.
 */
let workerNamesten = false;
function namestiWorker() {
  if (workerNamesten) return;
  workerNamesten = true;
  setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
}

/**
 * Ako posle ovoliko ms od `setStyle` stil još nije učitan (`isStyleLoaded()`
 * ostaje `false`) a nijedna greška stila nije javljena, tretiramo worker kao
 * mrtav i prelazimo u stanje (b) — tiho prazno platno se ne sme ponoviti
 * (GL6 §1.5). Kraće od `STIL_ROK_MS`, jer ovo hvata slučaj u kome stil JESTE
 * stigao ali ga worker ne obrađuje.
 */
const WORKER_ROK_MS = 15_000;

/** Beograd — podrazumevani centar kad nema tačaka (plan §8). */
const BEOGRAD: [number, number] = [20.4573, 44.8125];
const POCETNI_ZOOM = 11;
const PITCH = 55;
const BEARING = -15;

const STIL_ROK_MS = 20_000;
const FIT_PADDING_PX = 56;
const FOKUS_ZOOM = 15;
/** Pauza na svakoj firmi tokom preleta (plan §9). */
const TURA_PAUZA_MS = 2000;
/** Sastanak „uskoro" za beacon (plan §9): u narednih 7 dana. */
const SASTANAK_USKORO_MS = 7 * 24 * 60 * 60 * 1000;

const SRC_TACKE = "leadovi-tacke";
const L_SENKA = "leadovi-senka";
const L_PIN = "leadovi-pin";
const L_KLASTER = "leadovi-klaster";
const L_KLASTER_BROJ = "leadovi-klaster-broj";

// ── Tokeni boja ──────────────────────────────────────────────────────────────

type Tokeni = {
  hot: string;
  warm: string;
  cold: string;
  surface: string;
  surfaceRaised: string;
  line: string;
  lineSoft: string;
  text: string;
  textMuted: string;
  bg950: string;
  /** `--warning` — beacon sastanka u three.js sloju (GL4). */
  warning: string;
};

/**
 * Tokeni se čitaju sa `:root` pri montiranju, ne prepisuju ovde. Kad token
 * ne postoji, upisuje se CSS ključna reč `gray` — namerno ružno, da se rupa
 * u `globals.css` vidi, a ne da je tiho zakrpi „približna" heks vrednost.
 * Mešanje boja (`mix`) je u `leads-map-color.ts` (deljeno sa crtanjem pina).
 */
function citajTokene(): Tokeni {
  const cs = getComputedStyle(document.documentElement);
  const t = (ime: string) => cs.getPropertyValue(ime).trim() || "gray";
  return {
    hot: t("--temp-hot"),
    warm: t("--temp-warm"),
    cold: t("--temp-cold"),
    surface: t("--surface"),
    surfaceRaised: t("--surface-raised"),
    line: t("--line"),
    lineSoft: t("--line-soft"),
    text: t("--text-primary"),
    textMuted: t("--text-muted"),
    bg950: t("--bg-950"),
    warning: t("--warning"),
  };
}

/**
 * Boje pina izvedene iz tokena: CELO telo nosi temperaturu (hot/warm/cold), a
 * „nova firma" dobija neutralan slate (bez temperature). Beli „prozor" u glavi
 * je `--text-primary`. Nijedna heks vrednost — sve iz tokena.
 */
function pinBojeIz(t: Tokeni): PinBoje {
  return {
    hot: t.hot,
    warm: t.warm,
    cold: t.cold,
    // Neutralan svetao slate — vidljiv na tamnoj mapi, ne liči ni na jednu
    // temperaturu, a dovoljno taman da se beli prozor u glavi čita.
    nova: mix(t.textMuted, t.bg950, 0.15),
    belo: t.text,
    tamno: t.bg950,
  };
}

/** Tačke za three.js sloj: hot (prsten) i „sastanak uskoro" (beacon). */
function threeTacke(tacke: MapPoint[], now: number): ThreeTacka[] {
  return tacke.map((p) => ({
    companyId: p.companyId,
    lng: p.lng,
    lat: p.lat,
    hot: p.temperatura === "hot",
    sastanakUskoro:
      p.sastanakAt !== null &&
      p.sastanakAt >= now &&
      p.sastanakAt - now <= SASTANAK_USKORO_MS,
  }));
}

// ── Stil ─────────────────────────────────────────────────────────────────────

/**
 * Isti „slate" override za oba izvora. Cilj (GL6 §2): na zoomu 12–15 jasno se
 * vidi šta je voda, šta kopno, gde su glavni putevi.
 *
 *  - kopno: `mix(--surface, --surface-raised)` — dovoljno svetao slate;
 *  - voda: `--bg-950` — najtamnije, ≥ 8 % svetline ispod kopna (Sava/Dunav se
 *    jasno vide, a ne ~4 jedinice kao ranije `bg-950` vs `bg-900`);
 *  - glavni putevi: `mix(--line, --text-muted, 0.4)` — BEZ alfe (opaque),
 *    vidljiviji od sporednih koji ostaju na prigušenom `--line`;
 *  - natpisi mesta: `--text-primary` sa jačim halom — čitljivi.
 *
 * Tokeni ostaju izvor — nijedna nova heks vrednost. Širine linija i redosled
 * slojeva iz izvornog stila ostaju.
 */
function slateOverride(style: StyleSpecification, t: Tokeni): StyleSpecification {
  const kopno = mix(t.surface, t.surfaceRaised, 0.5);
  const glavniPut = mix(t.line, t.textMuted, 0.4);
  const layers = style.layers.map((layer): LayerSpecification => {
    const id = layer.id.toLowerCase();
    switch (layer.type) {
      case "background":
        return {
          ...layer,
          paint: { ...(layer.paint ?? {}), "background-color": t.bg950 },
        };
      case "fill": {
        const voda = id.includes("water") || id.includes("ocean");
        const uzdignuto =
          id.includes("building") ||
          id.includes("park") ||
          id.includes("wood") ||
          id.includes("landcover") ||
          id.includes("landuse") ||
          id.includes("aeroway");
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            // Voda najtamnija; parkovi/zgrade najsvetliji blok; ostalo kopno.
            "fill-color": voda ? t.bg950 : uzdignuto ? t.surfaceRaised : kopno,
            ...(id.includes("building") ? { "fill-outline-color": t.lineSoft } : {}),
          },
        };
      }
      case "fill-extrusion":
        return {
          ...layer,
          paint: { ...(layer.paint ?? {}), "fill-extrusion-color": t.surfaceRaised },
        };
      case "line": {
        const voda = id.includes("water");
        const granica = id.includes("boundary") || id.includes("admin");
        // CARTO/OpenFreeMap glavne puteve imenuju „motorway/trunk/primary" ili
        // „major" — oni dobijaju opaque boju; sporedni ostaju prigušeni.
        const glavni = /motorway|trunk|primary|major/.test(id);
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            "line-color": voda
              ? t.bg950
              : granica
                ? t.textMuted
                : glavni
                  ? glavniPut
                  : t.line,
          },
        };
      }
      case "symbol":
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            "text-color": id.includes("place") ? t.text : t.textMuted,
            "text-halo-color": t.bg950,
            "text-halo-width": 1.2,
          },
        };
      default:
        return layer;
    }
  });
  return { ...style, layers };
}

/**
 * Font za broj na klasteru mora da postoji na glyph serveru TOG stila
 * (CARTO i OpenFreeMap nemaju iste fontove). Uzima se stack sa prvog symbol
 * sloja koji ga ima — bold ako postoji.
 */
function nadjiFont(style: StyleSpecification): string[] {
  let prvi: string[] | null = null;
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const font = layer.layout?.["text-font"];
    if (!Array.isArray(font) || !font.every((x) => typeof x === "string")) continue;
    const stack = font as string[];
    if (stack.some((x) => /bold/i.test(x))) return stack;
    prvi ??= stack;
  }
  return prvi ?? ["Open Sans Regular"];
}

// ── Geometrija / izvor tačaka ─────────────────────────────────────────────────

/**
 * Kolekcija tačaka za `symbol` sloj pina. Izbor se nosi kroz PODATKE
 * (`izabran`, `icon`), ne kroz `feature-state` — jer `icon-image`,
 * `icon-size` i `symbol-sort-key` su layout svojstva koja ne primaju
 * feature-state. Promena izbora → nov `setData`.
 */
function kolekcijaTacaka(
  tacke: MapPoint[],
  selectedId: string | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: tacke.map((p, i) => {
      const izabran = p.companyId === selectedId;
      return {
        type: "Feature",
        id: i,
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: {
          companyId: p.companyId,
          temp: p.temperatura,
          izabran,
          icon: pinIme(p.temperatura, izabran),
        },
      };
    }),
  };
}

// ── Slojevi ──────────────────────────────────────────────────────────────────

function dodajSlojeve(
  map: MapLibreMap,
  t: Tokeni,
  mode: "all" | "single",
  tacke: MapPoint[],
  selectedId: string | null,
) {
  if (map.getSource(SRC_TACKE)) return;

  map.addSource(SRC_TACKE, {
    type: "geojson",
    data: kolekcijaTacaka(tacke, selectedId),
    cluster: mode === "all",
    clusterRadius: 44,
    clusterMaxZoom: 15,
  });

  // Senka — na TLU (icon-pitch-alignment: map), ispod pina; daje pinu oslonac
  // na nagnutoj mapi. Samo za tačke koje nisu u klasteru.
  map.addLayer({
    id: L_SENKA,
    type: "symbol",
    source: SRC_TACKE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": PIN_SENKA_IME,
      "icon-anchor": "center",
      "icon-pitch-alignment": "map",
      "icon-rotation-alignment": "map",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.85, 14, 1.0, 17, 1.2],
    },
    paint: { "icon-opacity": 0.6 },
  });

  // Pin — billboard (icon-pitch/rotation-alignment: viewport), šiljak (anchor
  // bottom) na tački; uspravan na nagnutoj mapi kao u Google-u. `allow-overlap`
  // da pin ne nestane zbog suseda; izabran u prvom planu (symbol-sort-key).
  map.addLayer({
    id: L_PIN,
    type: "symbol",
    source: SRC_TACKE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["get", "icon"],
      "icon-anchor": "bottom",
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      // Izabran u prvom planu; njegovo uvećanje (×1,25) je u sAMOJ slici
      // (`pin-sel-*`), pa `icon-size` ostaje čisto po zoomu.
      "symbol-sort-key": ["case", ["get", "izabran"], 1, 0],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.85, 14, 1.0, 17, 1.15],
    },
  });

  if (mode !== "all") return;

  const font = nadjiFont(map.getStyle());

  // Klaster u istom jeziku kao pin: crven krug, bela tanka ivica, beo broj,
  // tri veličine (2–9, 10–49, 50+). Boja se ne meša sa temperaturom.
  map.addLayer({
    id: L_KLASTER,
    type: "circle",
    source: SRC_TACKE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": t.hot,
      "circle-opacity": 0.95,
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
      "circle-stroke-color": t.text,
      "circle-stroke-width": 2,
      "circle-stroke-opacity": 0.9,
      "circle-pitch-alignment": "viewport",
    },
  });
  map.addLayer({
    id: L_KLASTER_BROJ,
    type: "symbol",
    source: SRC_TACKE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": font,
      "text-size": 13,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": t.text },
  });
}

// ── Komponenta ───────────────────────────────────────────────────────────────

export function LeadsMapCanvas({
  mode,
  tacke,
  selectedId,
  onSelect,
  onOpenProfile,
  onHover,
  onStyleState,
  paddingRight = 0,
  retryKey,
  tura = null,
  onTuraKraj,
  className,
}: LeadsMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tokeniRef = useRef<Tokeni | null>(null);
  const spremnaRef = useRef(false);
  /** three.js sloj (GL4) — nov primerak posle svakog `style.load`. */
  const threeRef = useRef<LeadsThreeLayer | null>(null);
  /** Aktivan let kamere (GL4) — nov let ubija prethodni. */
  const letRef = useRef<Let | null>(null);
  /** Dok traje prelet, hover sa miša ne prepisuje karticu obilaska. */
  const turaAktivnaRef = useRef(false);
  // Bump posle svakog `style.load` — efekti podataka i kamere čekaju na njega.
  const [spremna, setSpremna] = useState(0);

  // Poslednje vrednosti props-a za MapLibre listenere, koji se vežu jednom.
  const tackeRef = useRef(tacke);
  const indeksRef = useRef(new Map<string, { p: MapPoint; id: number }>());
  const selectedRef = useRef(selectedId);
  const paddingRef = useRef(paddingRight);
  const cbRef = useRef({ onSelect, onOpenProfile, onHover, onStyleState, onTuraKraj });
  /** Firma na koju je čovek KLIKNUO — za nju se kamera ne pomera. */
  const klikRef = useRef<string | null>(null);

  useEffect(() => {
    tackeRef.current = tacke;
    indeksRef.current = new Map(tacke.map((p, i) => [p.companyId, { p, id: i }]));
  }, [tacke]);
  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    paddingRef.current = paddingRight;
  }, [paddingRight]);
  useEffect(() => {
    cbRef.current = { onSelect, onOpenProfile, onHover, onStyleState, onTuraKraj };
  }, [onSelect, onOpenProfile, onHover, onStyleState, onTuraKraj]);

  /**
   * Jedini ulaz za let kamere: ubija prethodni let, pa kreće nov. Pod
   * `prefers-reduced-motion` je to skok (`jumpTo`), ne let.
   */
  const letiDo = useCallback(
    (cilj: { lng: number; lat: number; zoom: number; paddingRight: number }): Let | null => {
      const map = mapRef.current;
      if (!map) return null;
      letRef.current?.kill();
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const let_ = letiDoTacke(
        map,
        { ...cilj, pitch: PITCH, bearing: BEARING },
        { reducedMotion: still },
      );
      letRef.current = let_;
      return let_;
    },
    [],
  );

  const idsKey = useMemo(
    () =>
      tacke
        .map((p) => p.companyId)
        .sort()
        .join(","),
    [tacke],
  );

  // ── Životni ciklus mape ──
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const tokeni = citajTokene();
    tokeniRef.current = tokeni;
    const pinBoje = pinBojeIz(tokeni);
    const reducedMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const still = reducedMq.matches;
    // Promena podešavanja usred sesije se prenosi na three sloj (puls i
    // beacon se gase/pale bez ponovnog učitavanja).
    const naPromenuPokreta = () => threeRef.current?.setReducedMotion(reducedMq.matches);
    reducedMq.addEventListener("change", naPromenuPokreta);
    const cb = () => cbRef.current;

    let stilIndex = 0;
    let ucitan = false;
    let uklonjena = false;
    let zavrsenGreskom = false;
    let rok: ReturnType<typeof setTimeout> | null = null;
    // Watchdog mrtvog workera (GL6 §1.5): 15 s od `setStyle`. Odvojen od `rok`
    // jer hvata slučaj u kome stil stigne ali ga worker ne obradi — tada
    // `style.load` može i da javi „ready", a platno ostane prazno.
    let rokWorker: ReturnType<typeof setTimeout> | null = null;
    let raf: number | null = null;

    // Bez ovoga worker traži nepostojeći `/_next/static/chunks/…worker.mjs`
    // (GL6 §1). Mora pre prvog `new MapLibreMap`.
    namestiWorker();
    cb().onStyleState({ faza: "loading" });

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        center: BEOGRAD,
        zoom: POCETNI_ZOOM,
        pitch: PITCH,
        bearing: BEARING,
        // Atribucija se dodaje ručno dole LEVO: desno stoji bočni panel, koji
        // bi je prekrio — a mora da bude vidljiva (plan §8, §O4).
        attributionControl: false,
        maplibreLogo: false,
        dragPan: mode === "all",
        dragRotate: mode === "all",
        keyboard: mode === "all",
        touchPitch: mode === "all",
        pitchWithRotate: mode === "all",
      });
    } catch {
      cb().onStyleState({
        faza: "error",
        poruka:
          "Pregledač nije mogao da pokrene WebGL, pa mapa ne može da se nacrta na ovom uređaju.",
      });
      return;
    }
    mapRef.current = map;

    if (mode === "single") map.touchZoomRotate.disableRotation();
    map.addControl(
      new AttributionControl({
        compact: false,
        customAttribution: "© OpenStreetMap contributors",
      }),
      "bottom-left",
    );
    map.addControl(
      new NavigationControl({
        showCompass: mode === "all",
        visualizePitch: true,
      }),
      "top-left",
    );

    const zavrsiSaGreskom = (poruka: string) => {
      zavrsenGreskom = true;
      if (rok) clearTimeout(rok);
      if (rokWorker) clearTimeout(rokWorker);
      cb().onStyleState({ faza: "error", poruka });
    };

    // three.js sloj (GL4) samo na punoj mapi, samo uz WebGL2, i samo dok ga
    // `?three=0` ne isključi (izlaz za nuždu bez deploya). `getContext` na
    // canvasu koji već ima webgl2 kontekst vraća taj isti kontekst; `null`
    // znači da mapa radi na nečem drugom i sloj se ne montira.
    let threeDozvoljen = mode === "all";
    if (threeDozvoljen) {
      const param = new URLSearchParams(window.location.search).get("three");
      if (param === "0") threeDozvoljen = false;
    }
    if (threeDozvoljen && !map.getCanvas().getContext("webgl2")) {
      threeDozvoljen = false;
      console.info("[leads-map] three.js sloj preskočen: WebGL2 nije dostupan.");
    }

    const ukloniThree = () => {
      const sloj = threeRef.current;
      if (!sloj) return;
      threeRef.current = null;
      try {
        if (map.getLayer(sloj.id)) map.removeLayer(sloj.id);
        else sloj.onRemove();
      } catch {
        /* stil je već srušen — resursi umiru sa kontekstom */
      }
    };

    const ucitajStil = () => {
      if (rok) clearTimeout(rok);
      if (rokWorker) clearTimeout(rokWorker);
      rok = setTimeout(() => {
        if (!ucitan && !uklonjena) probajSledeci("izvor nije odgovorio u roku od 20 s");
      }, STIL_ROK_MS);
      // Mrtav worker: stil (i „ready") može da stigne, ali `isStyleLoaded()`
      // ostaje `false` jer se nijedna pločica/glif ne obradi. Tada stanje (b).
      rokWorker = setTimeout(() => {
        if (uklonjena || zavrsenGreskom) return;
        if (map.isStyleLoaded()) return;
        zavrsiSaGreskom("Mapa se nije učitala do kraja (worker ne odgovara).");
      }, WORKER_ROK_MS);
      cb().onStyleState({ faza: "loading" });
      // Nov stil briše sve slojeve; three sloj se skida uredno pre toga.
      ukloniThree();
      map.setStyle(STILOVI[stilIndex].url, {
        diff: false,
        transformStyle: (_prethodni, sledeci) => slateOverride(sledeci, tokeni),
      });
    };

    const probajSledeci = (razlog: string) => {
      if (uklonjena || ucitan || zavrsenGreskom) return;
      if (stilIndex + 1 >= STILOVI.length) {
        zavrsiSaGreskom(
          `Nijedan izvor mape nije dostupan (${STILOVI[stilIndex].izvor}: ${razlog}).`,
        );
        return;
      }
      stilIndex++;
      ucitajStil();
    };

    map.on("error", (e) => {
      // Posle učitavanja stila greške su šum pločica/glifova — MapLibre ih
      // sam loguje. Pre učitavanja, greška pločice takođe nije greška stila.
      if (ucitan || uklonjena) return;
      if ((e as { tile?: unknown }).tile) return;
      probajSledeci(e.error?.message ?? "nepoznata greška");
    });

    // ── Skup tačaka koje TRENUTNO nisu u klasteru → three.js sloj ──
    // Pinove crta MapLibre iz izvora sam (symbol sloj sa filterom !point_count);
    // ovde samo skupljamo id-jeve nekластерisanih tačaka da prsten/beacon three
    // sloja pulsira baš pod pinovima koji se vide (pod klasterom bi bio šum).
    const osveziVidljive = () => {
      raf = null;
      if (uklonjena || !map.getSource(SRC_TACKE)) return;
      const feats = map.querySourceFeatures(SRC_TACKE, {
        filter: ["!", ["has", "point_count"]],
      });
      const videni = new Set<string>();
      for (const f of feats) {
        const companyId = f.properties?.companyId as string | undefined;
        if (companyId) videni.add(companyId);
      }
      threeRef.current?.setVidljive(videni);
    };
    const zakaziOsvezi = () => {
      if (raf !== null || uklonjena) return;
      raf = requestAnimationFrame(osveziVidljive);
    };
    map.on("move", zakaziOsvezi);
    map.on("sourcedata", (e) => {
      if ("sourceId" in e && e.sourceId === SRC_TACKE && e.isSourceLoaded) {
        zakaziOsvezi();
      }
    });

    map.on("style.load", () => {
      if (uklonjena) return;
      ucitan = true;
      if (rok) clearTimeout(rok);
      // Slike pina + senku stil briše pri `setStyle`, pa se dodaju ponovo,
      // PRE slojeva koji ih koriste (GL7 §4).
      dodajPinSlike(map, pinBoje);
      dodajSlojeve(map, tokeni, mode, tackeRef.current, selectedRef.current);
      if (threeDozvoljen) {
        // Umeće se ISPOD sloja pina (`beforeId`), pa prsten/beacon stoje na
        // tlu ispod pina, a ne preko njega.
        const sloj = new LeadsThreeLayer({ hot: tokeni.hot, warning: tokeni.warning }, still);
        sloj.setData(threeTacke(tackeRef.current, Date.now()));
        map.addLayer(sloj, L_PIN);
        threeRef.current = sloj;
      }
      spremnaRef.current = true;
      setSpremna((n) => n + 1);
      cb().onStyleState({ faza: "ready", izvor: STILOVI[stilIndex].izvor });
      zakaziOsvezi();
    });

    // ── Interakcija (samo puna mapa) ──
    if (mode === "all") {
      const canvas = map.getCanvas();
      const companyIdOd = (f: MapGeoJSONFeature | undefined) =>
        (f?.properties?.companyId as string | undefined) ?? null;

      // Hover: samo kartica (uvećanje bi tražilo feature-state u layout
      // svojstvima, što symbol sloj ne prima — izbor uvećava kroz podatke).
      map.on("mousemove", L_PIN, (e) => {
        const companyId = companyIdOd(e.features?.[0]);
        if (!companyId) return;
        const unos = indeksRef.current.get(companyId);
        if (!unos) return;
        canvas.style.cursor = "pointer";
        if (!turaAktivnaRef.current) {
          cb().onHover?.({ point: unos.p, x: e.point.x, y: e.point.y });
        }
      });
      map.on("mouseleave", L_PIN, () => {
        canvas.style.cursor = "";
        if (!turaAktivnaRef.current) cb().onHover?.(null);
      });
      map.on("click", L_PIN, (e) => {
        const companyId = companyIdOd(e.features?.[0]);
        if (!companyId) return;
        klikRef.current = companyId;
        cb().onSelect?.(companyId);
      });
      map.on("dblclick", L_PIN, (e) => {
        const companyId = companyIdOd(e.features?.[0]);
        if (!companyId) return;
        // Bez ovoga dvoklik i otvara profil i zumira mapu ispod njega.
        e.preventDefault();
        cb().onOpenProfile?.(companyId);
      });

      map.on("mouseenter", L_KLASTER, () => {
        canvas.style.cursor = "pointer";
      });
      map.on("mouseleave", L_KLASTER, () => {
        canvas.style.cursor = "";
      });
      map.on("click", L_KLASTER, (e) => {
        const f = e.features?.[0];
        const clusterId = f?.properties?.cluster_id as number | undefined;
        if (!f || clusterId === undefined || f.geometry.type !== "Point") return;
        const src = map.getSource(SRC_TACKE) as GeoJSONSource | undefined;
        const center = f.geometry.coordinates as [number, number];
        src
          ?.getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            if (uklonjena) return;
            map.easeTo({ center, zoom, duration: still ? 0 : 500 });
          })
          .catch(() => {
            /* klaster je u međuvremenu nestao — nema šta da se zumira */
          });
      });

      // Klik u prazno zatvara panel. Isti klik na pin/klaster je već obrađen
      // gore, pa se ovde proverava da li je ispod kursora bilo šta.
      map.on("click", (e) => {
        if (!map.getLayer(L_PIN) || !map.getLayer(L_KLASTER)) return;
        const pogodjeno = map.queryRenderedFeatures(e.point, {
          layers: [L_PIN, L_KLASTER],
        });
        if (pogodjeno.length === 0 && selectedRef.current) cb().onSelect?.(null);
      });
    }

    ucitajStil();

    return () => {
      uklonjena = true;
      reducedMq.removeEventListener("change", naPromenuPokreta);
      if (rok) clearTimeout(rok);
      if (rokWorker) clearTimeout(rokWorker);
      if (raf !== null) cancelAnimationFrame(raf);
      letRef.current?.kill();
      letRef.current = null;
      // Sloj se skida PRE `map.remove()`, da `onRemove` uredno oslobodi
      // geometrije, materijale i renderer dok kontekst još živi.
      ukloniThree();
      spremnaRef.current = false;
      mapRef.current = null;
      map.remove();
    };
  }, [retryKey, mode]);

  // ── Podaci → izvor tačaka (sa trenutnim izborom) + three.js sloj ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremnaRef.current) return;
    const src = map.getSource(SRC_TACKE) as GeoJSONSource | undefined;
    src?.setData(kolekcijaTacaka(tacke, selectedRef.current));
    threeRef.current?.setData(threeTacke(tacke, Date.now()));
  }, [tacke, spremna]);

  // ── Kamera: kad se promeni SKUP tačaka (ne na svaki render) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremnaRef.current) return;
    const lista = tackeRef.current;
    if (lista.length === 0) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = still ? 0 : 700;

    const fokus = selectedRef.current
      ? indeksRef.current.get(selectedRef.current)
      : undefined;
    if (fokus) {
      // Firma iz URL-a: let (GL4), ne `easeTo`.
      letiDo({
        lng: fokus.p.lng,
        lat: fokus.p.lat,
        zoom: FOKUS_ZOOM,
        paddingRight: paddingRef.current,
      });
      return;
    }

    letRef.current?.kill();
    const granice = new LngLatBounds();
    for (const p of lista) granice.extend([p.lng, p.lat]);
    map.fitBounds(granice, {
      padding: FIT_PADDING_PX,
      maxZoom: FOKUS_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      duration,
    });
  }, [idsKey, spremna, letiDo]);

  // ── Izbor: veći pin u prvom planu (kroz podatke) + prostor za panel +
  //    kamera kad izbor NIJE klik na mapu ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremnaRef.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = still ? 0 : 450;

    // Pin izbora se menja kroz PODATKE: `icon` na svetliju sliku, `izabran`
    // uvećava (`icon-size`) i diže u prvi plan (`symbol-sort-key`). Symbol
    // layout svojstva ne primaju feature-state, pa nema drugog puta.
    const src = map.getSource(SRC_TACKE) as GeoJSONSource | undefined;
    src?.setData(kolekcijaTacaka(tackeRef.current, selectedId));

    // Padding se NE upisuje trajno (`setPadding` bi mapu odmah pomerio za
    // pola panela); ide samo uz pokret kamere koji je ionako potreban, a
    // vraća se kad se panel zatvori — i to samo ako je ranije i postavljen.
    const saPanelom = { top: 0, bottom: 0, left: 0, right: paddingRef.current };
    const bezPanela = { top: 0, bottom: 0, left: 0, right: 0 };

    const unos = selectedId ? indeksRef.current.get(selectedId) : undefined;
    if (!unos) {
      klikRef.current = null;
      if ((map.getPadding().right ?? 0) > 0) {
        letRef.current?.kill();
        map.easeTo({ padding: bezPanela, duration });
      }
      return;
    }

    const center: [number, number] = [unos.p.lng, unos.p.lat];
    if (klikRef.current === selectedId) {
      // Klik: kamera miruje — osim ako je panel prekrio baš tu tačku.
      const px = map.project(center);
      const sirina = map.getContainer().clientWidth;
      if (px.x > sirina - paddingRef.current - 24) {
        letRef.current?.kill();
        map.easeTo({ center, padding: saPanelom, duration });
      }
    } else {
      // Izbor iz tabele / profila / URL-a: let (GL4, plan §9).
      letiDo({
        lng: unos.p.lng,
        lat: unos.p.lat,
        zoom: Math.max(map.getZoom(), FOKUS_ZOOM - 0.5),
        paddingRight: paddingRef.current,
      });
    }
    klikRef.current = null;
  }, [selectedId, spremna, letiDo]);

  // ── Prelet hot firmi (GL4, plan §9) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremnaRef.current || !tura || tura.length === 0) return;
    const cb = () => cbRef.current;
    let otkazan = false;
    let pauza: ReturnType<typeof setTimeout> | null = null;
    let nastaviPauzu: (() => void) | null = null;

    const stani = () => {
      if (otkazan) return;
      otkazan = true;
      turaAktivnaRef.current = false;
      if (pauza) clearTimeout(pauza);
      nastaviPauzu?.();
      letRef.current?.kill();
      document.removeEventListener("pointerdown", naPointer, true);
      document.removeEventListener("keydown", naTaster);
      map.off("dragstart", stani);
      cb().onHover?.(null);
      cb().onTuraKraj?.();
    };
    const naTaster = (e: KeyboardEvent) => {
      if (e.key === "Escape") stani();
    };
    // Klik BILO GDE prekida — zato `capture` na dokumentu, pre nego što bilo
    // ko drugi obradi klik. Izuzetak je samo dugme „Zaustavi prelet": njega
    // gasi njegov sopstveni klik. Da ga i ovaj listener ugasi na pointerdown,
    // React bi dugme pre klika već prekrojio u „Preleti", pa bi klik odmah
    // pokrenuo NOV prelet.
    const naPointer = (e: PointerEvent) => {
      const cilj = e.target as Element | null;
      if (cilj?.closest?.("[data-tura-stop]")) return;
      stani();
    };
    document.addEventListener("pointerdown", naPointer, true);
    document.addEventListener("keydown", naTaster);
    map.on("dragstart", stani);
    turaAktivnaRef.current = true;

    const cekaj = () =>
      new Promise<void>((resolve) => {
        nastaviPauzu = resolve;
        pauza = setTimeout(resolve, TURA_PAUZA_MS);
      });

    void (async () => {
      for (const companyId of tura) {
        if (otkazan) return;
        const unos = indeksRef.current.get(companyId);
        if (!unos) continue;
        const let_ = letiDo({
          lng: unos.p.lng,
          lat: unos.p.lat,
          zoom: FOKUS_ZOOM,
          paddingRight: paddingRef.current,
        });
        if (!let_) return;
        const ishod = await let_.gotov;
        if (otkazan) return;
        if (ishod === "prekinut") {
          stani();
          return;
        }
        // Kartica firme na koju je kamera sletela — iznad vrha pina. Šiljak je
        // na projektovanoj tački; vrh glave je ~44 px iznad njega (visina pina
        // × icon-size na fokus zumu), pa kartica ide iznad toga.
        const px = map.project([unos.p.lng, unos.p.lat]);
        cb().onHover?.({ point: unos.p, x: px.x, y: px.y - 44 });
        await cekaj();
        if (otkazan) return;
        cb().onHover?.(null);
      }
      stani();
    })();

    return () => {
      stani();
    };
  }, [tura, spremna, letiDo]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "size-full",
        // MapLibre kontrole i atribucija na tokene aplikacije. Ikonice su
        // crni SVG u CSS-u biblioteke; `invert` ih okreće u svetle.
        "[&_.maplibregl-ctrl-group]:bg-surface-raised [&_.maplibregl-ctrl-group]:shadow-none [&_.maplibregl-ctrl-group]:ring-1 [&_.maplibregl-ctrl-group]:ring-line",
        "[&_.maplibregl-ctrl-group_button]:invert [&_.maplibregl-ctrl-group_button+button]:border-t [&_.maplibregl-ctrl-group_button+button]:border-line",
        "[&_.maplibregl-ctrl-attrib]:bg-surface/85 [&_.maplibregl-ctrl-attrib]:text-micro [&_.maplibregl-ctrl-attrib]:text-text-muted [&_.maplibregl-ctrl-attrib_a]:text-text-muted",
        className,
      )}
    />
  );
}
