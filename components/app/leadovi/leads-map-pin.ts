import type { Map as MapLibreMap } from "maplibre-gl";
import { TEMPERATURE, type Temperatura } from "@/lib/temperature";
import { PIN, PIN_SIRINA_PX } from "./leads-map-geo";
import { mix, withAlpha } from "./leads-map-color";

/**
 * ============================================================================
 * SLIKE PINA (GL7) — Google-stil kap
 * ============================================================================
 *
 * Umesto heksagonalnih prizmi (GL3/GL4, „visina = fit"), lead je sada pin kao
 * na Google mapama. Slike se crtaju u `<canvas>` pri montiranju stila
 * (`style.load` briše sve slike, pa se dodaju ponovo posle svakog `setStyle`),
 * `pixelRatio` gušće za oštrinu na nagnutoj mapi — ne PNG fajl.
 *
 * CELO TELO pina nosi temperaturu (Google-stil obojeni pin):
 *  - hot  → crveno (`--temp-hot`);
 *  - warm → ćilibar (`--temp-warm`);
 *  - cold → plavo (`--temp-cold`);
 *  - nova firma → neutralan slate (`--temp-nova`) — četvrti član niza, isti
 *    token koji čitaju čip u tabeli i profil (A1 §2, `lib/temperature.ts`).
 * U glavi je beo „prozor" (krug) na svakom pinu, sa tankom tamnijom ivicom
 * tela. Izabran pin je blago svetliji + veći (×1,25, pečeno u `pin-sel-*`).
 *
 * Senka je zasebna meka elipsa (`pin-senka`), poravnata sa TLOM
 * (`icon-pitch-alignment: map`), ispod pina — daje pinu oslonac na nagnutoj
 * mapi. Na najtamnijim površinama (voda) je jedva vidljiva; to je u redu.
 */

export type PinBoje = {
  /** Telo pina po temperaturi. */
  hot: string;
  warm: string;
  cold: string;
  /** `--temp-nova` — telo „nove firme". */
  nova: string;
  /** `--text-primary` — beli krug u glavi i mešanje za „svetliji" (izbor). */
  belo: string;
  /** `--bg-950` — tamnija ivica tela, ivica kruga i boja senke. */
  tamno: string;
};

/** Ključ temperature u imenu slike (`nova_firma` → `nova`). */
export function pinKljuc(temp: Temperatura): string {
  return temp === "nova_firma" ? "nova" : temp;
}

/** Ime slike pina za (temperatura, izabran). */
export function pinIme(temp: Temperatura, izabran: boolean): string {
  return `pin-${izabran ? "sel-" : ""}${pinKljuc(temp)}`;
}

export const PIN_SENKA_IME = "pin-senka";

/** Boja tela pina po temperaturi. */
function teloZa(temp: Temperatura, b: PinBoje): string {
  switch (temp) {
    case "hot":
      return b.hot;
    case "warm":
      return b.warm;
    case "cold":
      return b.cold;
    default:
      return b.nova;
  }
}

/** Uvećanje izabranog pina peče se u SLIKU (×1,25) — `icon-size` ostaje samo
 * po zoomu, bez zoom-i-podatak izraza koji neki stilovi ne prihvataju. */
const IZBOR_SKALA = 1.25;

/** Kap sa šiljkom dole; šiljak je na dnu-sredini slike (`icon-anchor: bottom`). */
function crtajPin(temp: Temperatura, izabran: boolean, b: PinBoje): ImageData {
  const ratio = PIN.pixelRatio;
  const k = izabran ? IZBOR_SKALA : 1;
  const r = PIN.glavaR * k;
  const d = PIN.telo * k;
  const naturalW = 2 * r + 2 * PIN.padStrana * k;
  const cx = naturalW / 2;
  const cy = PIN.padVrh * k + r;
  const tipY = cy + d;
  // +1 px ispod šiljka da se ivica ne odseče; `icon-anchor: bottom` je onda
  // ~1 px ispod tačke — zanemarljivo.
  const naturalH = tipY + 1;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(naturalW * ratio);
  canvas.height = Math.round(naturalH * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(canvas.width, canvas.height);
  }
  ctx.scale(ratio, ratio);

  // Telo: tangente iz šiljka na glavu (glatka kap). Dodirne tačke su na
  // ±acos(r/d) od nadole-vertikale (canvas ugao = +PI/2).
  const theta = Math.acos(r / d);
  const a1 = Math.PI / 2 - theta;
  const a2 = Math.PI / 2 + theta;
  // Telo = boja temperature. Izabran → blago svetlije (uz veći oblik).
  const telo = teloZa(temp, b);
  ctx.beginPath();
  ctx.moveTo(cx, tipY);
  ctx.lineTo(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
  ctx.arc(cx, cy, r, a1, a2, true); // duži luk preko vrha
  ctx.closePath();
  ctx.fillStyle = izabran ? mix(telo, b.belo, 0.18) : telo;
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = mix(telo, b.tamno, 0.4); // tanka tamnija ivica
  ctx.stroke();

  // Beli „prozor" u glavi (Google stil), sa tankom tamnijom ivicom da se čita
  // i na svetlom telu (nova firma).
  ctx.beginPath();
  ctx.arc(cx, cy, PIN.krugR * k, 0, 2 * Math.PI);
  ctx.fillStyle = b.belo;
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = mix(telo, b.tamno, 0.3);
  ctx.stroke();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Meka okrugla senka; poravnata sa tlom u sloju, pa je perspektiva spljošti. */
function crtajSenku(b: PinBoje): ImageData {
  const ratio = PIN.pixelRatio;
  const rr = PIN_SIRINA_PX * 0.9; // poluprečnik senke ≈ širina pina
  const natural = Math.ceil(rr * 2) + 2;
  const c = natural / 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(natural * ratio);
  canvas.height = Math.round(natural * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new ImageData(canvas.width, canvas.height);
  }
  ctx.scale(ratio, ratio);

  const grad = ctx.createRadialGradient(c, c, 0, c, c, rr);
  grad.addColorStop(0, withAlpha(b.tamno, 0.45));
  grad.addColorStop(0.6, withAlpha(b.tamno, 0.22));
  grad.addColorStop(1, withAlpha(b.tamno, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, rr, 0, 2 * Math.PI);
  ctx.fill();

  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Dodaje sve slike pina + senku u trenutni stil. Zove se u `style.load`, pre
 * dodavanja slojeva koji ih koriste. `hasImage` čuva od dvostrukog dodavanja.
 */
export function dodajPinSlike(map: MapLibreMap, boje: PinBoje) {
  for (const temp of TEMPERATURE) {
    for (const izabran of [false, true]) {
      const ime = pinIme(temp, izabran);
      if (!map.hasImage(ime)) {
        map.addImage(ime, crtajPin(temp, izabran, boje), { pixelRatio: PIN.pixelRatio });
      }
    }
  }
  if (!map.hasImage(PIN_SENKA_IME)) {
    map.addImage(PIN_SENKA_IME, crtajSenku(boje), { pixelRatio: PIN.pixelRatio });
  }
}
