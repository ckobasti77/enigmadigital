/**
 * Parsiranje i mešanje CSS boja — deljeno između MapLibre sloja
 * (`leads-map-canvas.tsx`, slate override i klasteri) i crtanja pina
 * (`leads-map-pin.ts`). Tokeni ostaju jedini izvor boja; ovde se samo mešaju,
 * nijedna heks vrednost se ne upisuje.
 */

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

/** Linearno mešanje dve CSS boje (alfa se ignoriše). Vraća `rgb(...)`. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return a;
  const c = (i: 0 | 1 | 2) => Math.round(pa[i] + (pb[i] - pa[i]) * t);
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
}

/** Ista boja sa zadatom alfom — za meku senku pina (radijalni gradijent). */
export function withAlpha(c: string, a: number): string {
  const p = parseColor(c);
  if (!p) return c;
  return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${a})`;
}
