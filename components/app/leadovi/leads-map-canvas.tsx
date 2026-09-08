"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type LayerSpecification,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import type { Temperatura } from "./lead-chips";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * MAPA LEADOVA — MapLibre sloj (GL3) — plan §8
 * ============================================================================
 *
 * Ovaj fajl zna samo za MapLibre: stil, izvore, slojeve, kameru i događaje.
 * Stanja ekrana (učitava se / greška / nema tačaka / panel / kartica) crta
 * omotač `leads-map.tsx`; odavde izlaze samo činjenice preko callback-ova.
 *
 * NIŠTA LEPO NE SME DA BUDE LAŽNO:
 *  - visina heksagona = fit skor iz `scoreLead` (20 m za 0 %, 400 m za 100 %);
 *    firma bez merljivog fita dobija NAJNIŽI heksagon, ne srednji;
 *  - boja = temperatura iz baze, kroz `--temp-*` tokene pročitane sa
 *    `document.documentElement` pri montiranju — nijedna boja nije upisana
 *    ovde;
 *  - broj na klasteru je stvaran broj tačaka koje je supercluster spojio.
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

/** Beograd — podrazumevani centar kad nema tačaka (plan §8). */
const BEOGRAD: [number, number] = [20.4573, 44.8125];
const POCETNI_ZOOM = 11;
const PITCH = 55;
const BEARING = -15;

/** Visina heksagona u metrima: fit 0 % → 20 m, 100 % → 400 m (plan §8). */
const VISINA_MIN_M = 20;
const VISINA_MAX_M = 400;
/** Poluprečnik heksagona u pikselima ekrana — u metrima zavisi od zooma. */
const HEKS_PX = 13;

const STIL_ROK_MS = 20_000;
const FIT_PADDING_PX = 56;
const FOKUS_ZOOM = 15;

const SRC_TACKE = "leadovi-tacke";
const SRC_HEKS = "leadovi-heks";
const L_HEKS = "leadovi-heks";
const L_KLASTER = "leadovi-klaster";
const L_KLASTER_BROJ = "leadovi-klaster-broj";

// ── Tokeni boja ──────────────────────────────────────────────────────────────

type Tokeni = {
  hot: string;
  warm: string;
  cold: string;
  nova: string;
  hotSvetla: string;
  warmSvetla: string;
  coldSvetla: string;
  novaSvetla: string;
  accent: string;
  surface: string;
  surfaceRaised: string;
  line: string;
  lineSoft: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  bg950: string;
  bg900: string;
  bg800: string;
};

function parseColor(input: string): [number, number, number, number] | null {
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i,
  );
  if (rgb) {
    const a =
      rgb[4] === undefined
        ? 1
        : rgb[4].endsWith("%")
          ? parseFloat(rgb[4]) / 100
          : parseFloat(rgb[4]);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), a];
  }
  return null;
}

/** Linearno mešanje dve CSS boje (alfa se ignoriše — ekstruzije je ne koriste). */
function mix(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return a;
  const c = (i: 0 | 1 | 2) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/**
 * Tokeni se čitaju sa `:root` pri montiranju, ne prepisuju ovde. Kad token
 * ne postoji, upisuje se CSS ključna reč `gray` — namerno ružno, da se rupa
 * u `globals.css` vidi, a ne da je tiho zakrpi „približna" heks vrednost.
 */
function citajTokene(): Tokeni {
  const cs = getComputedStyle(document.documentElement);
  const t = (ime: string) => cs.getPropertyValue(ime).trim() || "gray";
  const hot = t("--temp-hot");
  const warm = t("--temp-warm");
  const cold = t("--temp-cold");
  const surfaceRaised = t("--surface-raised");
  const text = t("--text-primary");
  const textMuted = t("--text-muted");
  // „Nova firma" nema svoj token boje — ni u tabeli nema boju (neutralan
  // čip). Ovde je prigušen slate: pola puta između prigušenog teksta i
  // uzdignute površine, da se vidi kao tačka a ne kao temperatura.
  const nova = mix(textMuted, surfaceRaised, 0.55);
  return {
    hot,
    warm,
    cold,
    nova,
    hotSvetla: mix(hot, text, 0.3),
    warmSvetla: mix(warm, text, 0.3),
    coldSvetla: mix(cold, text, 0.3),
    novaSvetla: mix(nova, text, 0.3),
    accent: t("--accent-400"),
    surface: t("--surface"),
    surfaceRaised,
    line: t("--line"),
    lineSoft: t("--line-soft"),
    text,
    textSecondary: t("--text-secondary"),
    textMuted,
    bg950: t("--bg-950"),
    bg900: t("--bg-900"),
    bg800: t("--bg-800"),
  };
}

function bojaZa(temp: Temperatura, t: Tokeni): { boja: string; svetla: string } {
  switch (temp) {
    case "hot":
      return { boja: t.hot, svetla: t.hotSvetla };
    case "warm":
      return { boja: t.warm, svetla: t.warmSvetla };
    case "cold":
      return { boja: t.cold, svetla: t.coldSvetla };
    default:
      return { boja: t.nova, svetla: t.novaSvetla };
  }
}

// ── Stil ─────────────────────────────────────────────────────────────────────

/**
 * Isti „slate" override za oba izvora: pozadina i kopno na `--bg-*`, voda
 * tamnija od kopna, putevi na `--line`, natpisi na prigušen tekst. Širine
 * linija i redosled slojeva ostaju kakvi jesu u izvornom stilu.
 */
function slateOverride(style: StyleSpecification, t: Tokeni): StyleSpecification {
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
            "fill-color": voda ? t.bg950 : uzdignuto ? t.bg800 : t.bg900,
            ...(id.includes("building") ? { "fill-outline-color": t.lineSoft } : {}),
          },
        };
      }
      case "fill-extrusion":
        return {
          ...layer,
          paint: { ...(layer.paint ?? {}), "fill-extrusion-color": t.bg800 },
        };
      case "line": {
        const voda = id.includes("water");
        const granica = id.includes("boundary") || id.includes("admin");
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            "line-color": voda ? t.bg800 : granica ? t.textMuted : t.line,
          },
        };
      }
      case "symbol":
        return {
          ...layer,
          paint: {
            ...(layer.paint ?? {}),
            "text-color": id.includes("place") ? t.textSecondary : t.textMuted,
            "text-halo-color": t.bg950,
            "text-halo-width": 1,
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

// ── Geometrija ───────────────────────────────────────────────────────────────

function visinaZa(fit: number | null): number {
  if (fit === null) return VISINA_MIN_M;
  const f = Math.min(100, Math.max(0, fit)) / 100;
  return VISINA_MIN_M + f * (VISINA_MAX_M - VISINA_MIN_M);
}

function metaraPoPikselu(lat: number, zoom: number): number {
  return (156_543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

function heksagon(
  p: MapPoint,
  id: number,
  zoom: number,
  t: Tokeni,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const r = HEKS_PX * metaraPoPikselu(p.lat, zoom);
  const dLat = r / 111_320;
  const dLng = r / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  const prsten: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    prsten.push([p.lng + dLng * Math.cos(a), p.lat + dLat * Math.sin(a)]);
  }
  prsten.push(prsten[0]);
  const { boja, svetla } = bojaZa(p.temperatura, t);
  return {
    type: "Feature",
    id,
    geometry: { type: "Polygon", coordinates: [prsten] },
    properties: { companyId: p.companyId, visina: visinaZa(p.fit), boja, svetla },
  };
}

function kolekcijaTacaka(tacke: MapPoint[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: tacke.map((p, i) => ({
      type: "Feature",
      id: i,
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { companyId: p.companyId, temp: p.temperatura },
    })),
  };
}

const PRAZNO: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// ── Slojevi ──────────────────────────────────────────────────────────────────

function dodajSlojeve(
  map: MapLibreMap,
  t: Tokeni,
  mode: "all" | "single",
  tacke: MapPoint[],
) {
  if (map.getSource(SRC_TACKE)) return;

  map.addSource(SRC_TACKE, {
    type: "geojson",
    data: kolekcijaTacaka(tacke),
    cluster: mode === "all",
    clusterRadius: 44,
    clusterMaxZoom: 15,
  });
  map.addSource(SRC_HEKS, { type: "geojson", data: PRAZNO });

  map.addLayer({
    id: L_HEKS,
    type: "fill-extrusion",
    source: SRC_HEKS,
    paint: {
      "fill-extrusion-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        ["get", "svetla"],
        ["boolean", ["feature-state", "hover"], false],
        ["get", "svetla"],
        ["get", "boja"],
      ],
      "fill-extrusion-height": ["get", "visina"],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.9,
      "fill-extrusion-vertical-gradient": true,
    },
  });

  if (mode !== "all") return;

  const font = nadjiFont(map.getStyle());

  map.addLayer({
    id: L_KLASTER,
    type: "circle",
    source: SRC_TACKE,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": t.surfaceRaised,
      "circle-opacity": 0.94,
      "circle-radius": ["step", ["get", "point_count"], 15, 10, 19, 50, 24, 200, 30],
      "circle-stroke-color": t.accent,
      "circle-stroke-width": 1.5,
      "circle-stroke-opacity": 0.85,
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
      "text-size": 12,
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
  className,
}: LeadsMapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const tokeniRef = useRef<Tokeni | null>(null);
  const spremnaRef = useRef(false);
  // Bump posle svakog `style.load` — efekti podataka i kamere čekaju na njega.
  const [spremna, setSpremna] = useState(0);

  // Poslednje vrednosti props-a za MapLibre listenere, koji se vežu jednom.
  const tackeRef = useRef(tacke);
  const indeksRef = useRef(new Map<string, { p: MapPoint; id: number }>());
  const selectedRef = useRef(selectedId);
  const paddingRef = useRef(paddingRight);
  const cbRef = useRef({ onSelect, onOpenProfile, onHover, onStyleState });
  /** Firma na koju je čovek KLIKNUO — za nju se kamera ne pomera. */
  const klikRef = useRef<string | null>(null);
  const prethodniIzborRef = useRef<number | null>(null);

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
    cbRef.current = { onSelect, onOpenProfile, onHover, onStyleState };
  }, [onSelect, onOpenProfile, onHover, onStyleState]);

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
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cb = () => cbRef.current;

    let stilIndex = 0;
    let ucitan = false;
    let uklonjena = false;
    let rok: ReturnType<typeof setTimeout> | null = null;
    let raf: number | null = null;

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
      if (rok) clearTimeout(rok);
      cb().onStyleState({ faza: "error", poruka });
    };

    const ucitajStil = () => {
      if (rok) clearTimeout(rok);
      rok = setTimeout(() => {
        if (!ucitan && !uklonjena) probajSledeci("izvor nije odgovorio u roku od 20 s");
      }, STIL_ROK_MS);
      cb().onStyleState({ faza: "loading" });
      map.setStyle(STILOVI[stilIndex].url, {
        diff: false,
        transformStyle: (_prethodni, sledeci) => slateOverride(sledeci, tokeni),
      });
    };

    const probajSledeci = (razlog: string) => {
      if (uklonjena || ucitan) return;
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

    // ── Heksagoni: samo za tačke koje TRENUTNO nisu u klasteru ──
    const osveziHeks = () => {
      raf = null;
      if (uklonjena) return;
      const src = map.getSource(SRC_HEKS) as GeoJSONSource | undefined;
      if (!src || !map.getSource(SRC_TACKE)) return;
      const feats = map.querySourceFeatures(SRC_TACKE, {
        filter: ["!", ["has", "point_count"]],
      });
      const zoom = map.getZoom();
      const videni = new Set<string>();
      const out: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
      for (const f of feats) {
        const companyId = f.properties?.companyId as string | undefined;
        if (!companyId || videni.has(companyId)) continue;
        videni.add(companyId);
        const unos = indeksRef.current.get(companyId);
        if (!unos) continue;
        out.push(heksagon(unos.p, unos.id, zoom, tokeni));
      }
      src.setData({ type: "FeatureCollection", features: out });
      // Stanje izbora se ponovo upisuje — `setData` ne sme da ga izgubi.
      const izabran = selectedRef.current
        ? indeksRef.current.get(selectedRef.current)
        : undefined;
      if (izabran) {
        map.setFeatureState({ source: SRC_HEKS, id: izabran.id }, { selected: true });
      }
    };
    const zakaziOsvezi = () => {
      if (raf !== null || uklonjena) return;
      raf = requestAnimationFrame(osveziHeks);
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
      dodajSlojeve(map, tokeni, mode, tackeRef.current);
      spremnaRef.current = true;
      setSpremna((n) => n + 1);
      cb().onStyleState({ faza: "ready", izvor: STILOVI[stilIndex].izvor });
      zakaziOsvezi();
    });

    // ── Interakcija (samo puna mapa) ──
    if (mode === "all") {
      const canvas = map.getCanvas();
      let hoverId: number | null = null;
      const skiniHover = () => {
        if (hoverId !== null) {
          map.setFeatureState({ source: SRC_HEKS, id: hoverId }, { hover: false });
          hoverId = null;
        }
      };
      const companyIdOd = (f: MapGeoJSONFeature | undefined) =>
        (f?.properties?.companyId as string | undefined) ?? null;

      map.on("mousemove", L_HEKS, (e) => {
        const f = e.features?.[0];
        const companyId = companyIdOd(f);
        if (!f || !companyId) return;
        const unos = indeksRef.current.get(companyId);
        if (!unos) return;
        if (hoverId !== unos.id) {
          skiniHover();
          hoverId = unos.id;
          map.setFeatureState({ source: SRC_HEKS, id: hoverId }, { hover: true });
        }
        canvas.style.cursor = "pointer";
        cb().onHover?.({ point: unos.p, x: e.point.x, y: e.point.y });
      });
      map.on("mouseleave", L_HEKS, () => {
        skiniHover();
        canvas.style.cursor = "";
        cb().onHover?.(null);
      });
      map.on("click", L_HEKS, (e) => {
        const companyId = companyIdOd(e.features?.[0]);
        if (!companyId) return;
        klikRef.current = companyId;
        cb().onSelect?.(companyId);
      });
      map.on("dblclick", L_HEKS, (e) => {
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

      // Klik u prazno zatvara panel. Isti klik na heksagon/klaster je već
      // obrađen gore, pa se ovde proverava da li je ispod kursora bilo šta.
      map.on("click", (e) => {
        if (!map.getLayer(L_HEKS) || !map.getLayer(L_KLASTER)) return;
        const pogodjeno = map.queryRenderedFeatures(e.point, {
          layers: [L_HEKS, L_KLASTER],
        });
        if (pogodjeno.length === 0 && selectedRef.current) cb().onSelect?.(null);
      });
    }

    ucitajStil();

    return () => {
      uklonjena = true;
      if (rok) clearTimeout(rok);
      if (raf !== null) cancelAnimationFrame(raf);
      spremnaRef.current = false;
      prethodniIzborRef.current = null;
      mapRef.current = null;
      map.remove();
    };
  }, [retryKey, mode]);

  // ── Podaci → izvor tačaka ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremnaRef.current) return;
    const src = map.getSource(SRC_TACKE) as GeoJSONSource | undefined;
    src?.setData(kolekcijaTacaka(tacke));
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
      map.easeTo({
        center: [fokus.p.lng, fokus.p.lat],
        zoom: FOKUS_ZOOM,
        pitch: PITCH,
        bearing: BEARING,
        padding: { top: 0, bottom: 0, left: 0, right: paddingRef.current },
        duration,
      });
      return;
    }

    const granice = new LngLatBounds();
    for (const p of lista) granice.extend([p.lng, p.lat]);
    map.fitBounds(granice, {
      padding: FIT_PADDING_PX,
      maxZoom: FOKUS_ZOOM,
      pitch: PITCH,
      bearing: BEARING,
      duration,
    });
  }, [idsKey, spremna]);

  // ── Izbor: stanje heksagona + prostor za panel + kamera kad izbor nije klik ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !spremnaRef.current) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = still ? 0 : 450;

    if (prethodniIzborRef.current !== null) {
      map.setFeatureState(
        { source: SRC_HEKS, id: prethodniIzborRef.current },
        { selected: false },
      );
      prethodniIzborRef.current = null;
    }

    // Padding se NE upisuje trajno (`setPadding` bi mapu odmah pomerio za
    // pola panela); ide samo uz pokret kamere koji je ionako potreban, a
    // vraća se kad se panel zatvori — i to samo ako je ranije i postavljen.
    const saPanelom = { top: 0, bottom: 0, left: 0, right: paddingRef.current };
    const bezPanela = { top: 0, bottom: 0, left: 0, right: 0 };

    const unos = selectedId ? indeksRef.current.get(selectedId) : undefined;
    if (!unos) {
      klikRef.current = null;
      if ((map.getPadding().right ?? 0) > 0) {
        map.easeTo({ padding: bezPanela, duration });
      }
      return;
    }
    map.setFeatureState({ source: SRC_HEKS, id: unos.id }, { selected: true });
    prethodniIzborRef.current = unos.id;

    const center: [number, number] = [unos.p.lng, unos.p.lat];
    if (klikRef.current === selectedId) {
      // Klik: kamera miruje — osim ako je panel prekrio baš tu tačku.
      const px = map.project(center);
      const sirina = map.getContainer().clientWidth;
      if (px.x > sirina - paddingRef.current - 24) {
        map.easeTo({ center, padding: saPanelom, duration });
      }
    } else {
      map.easeTo({
        center,
        zoom: Math.max(map.getZoom(), FOKUS_ZOOM - 0.5),
        padding: saPanelom,
        duration,
      });
    }
    klikRef.current = null;
  }, [selectedId, spremna]);

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
