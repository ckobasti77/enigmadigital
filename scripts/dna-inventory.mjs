/**
 * ============================================================================
 * DNA INVENTAR — popis zatečenog stila (A1 §1, `app-ux-plan.md` §2 S)
 * ============================================================================
 *
 *   node scripts/dna-inventory.mjs [--out nocni-run/ux/dna-pre.md]
 *
 * Grep, ne procena: prolazi kroz `app/**` i `components/**`, izvlači SVE
 * string literale i broji Tailwind klase po kategorijama (boje, veličine
 * teksta, težine, razmaci, radijusi, senke, trajanja). Uz to:
 *
 *   - koje se klase boja odnose na token koji NE POSTOJI u `app/globals.css`
 *     (npr. `text-info` — takva klasa se tiho ne generiše, pa element ostane
 *     bez boje i to izgleda kao „stil", a nije);
 *   - gde se koriste sirove Tailwind palete (`slate-*`, `cyan-*`) i heks/rgba
 *     literali van tokena;
 *   - koliko RAZLIČITIH recepata postoji za isti namen (čip, kartica, natpis
 *     pločice) — mera duplikata koju A1 komponente treba da spuste.
 *
 * Isti skript se pokreće pre i posle svake faze: razlika u brojevima je mera
 * napretka, ne utisak.
 */

import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCAN_DIRS = ["app", "components"];
const EXT = new Set([".tsx", ".ts", ".css"]);

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outPath = outIdx !== -1 ? argv[outIdx + 1] : null;

// ── skupljanje fajlova ───────────────────────────────────────────────────────

function walk(dir, acc) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "_generated" || name === ".next") continue;
      walk(full, acc);
    } else if (EXT.has(full.slice(full.lastIndexOf(".")))) {
      acc.push(full);
    }
  }
  return acc;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d), []));
const rel = (f) => relative(ROOT, f).replace(/\\/g, "/");

// ── deklarisani tokeni iz globals.css ────────────────────────────────────────

const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const declared = (prefix) => {
  const out = new Set();
  const re = new RegExp(`--${prefix}-([a-z0-9-]+)\\s*:`, "g");
  let m;
  while ((m = re.exec(css))) out.add(m[1]);
  return out;
};
const colorTokens = declared("color");
const textTokens = declared("text");
const shadowTokens = declared("shadow");
const radiusTokens = declared("radius");
const durationTokens = declared("duration");
const easeTokens = declared("ease");

// ── string literali → kandidati za klase ─────────────────────────────────────

const STRING_RE = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;

/** Skida varijante (`sm:`, `hover:`, `data-[x]:`) — ostaje sama utility klasa. */
function bare(token) {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth--;
    else if (ch === ":" && depth === 0) cut = i;
  }
  let t = cut === -1 ? token : token.slice(cut + 1);
  if (t.startsWith("!")) t = t.slice(1);
  if (t.startsWith("-")) t = t.slice(1);
  return t;
}

const counts = {
  color: new Map(), // token -> count
  colorAlpha: new Map(), // token -> Set(alpha)
  colorUndefined: new Map(), // klasa -> {count, files:Set}
  colorPalette: new Map(), // klasa -> {count, files}
  colorArbitrary: new Map(), // klasa -> {count, files}
  textSize: new Map(),
  weight: new Map(),
  family: new Map(),
  spacing: new Map(), // "p-4" -> count
  spacingValue: new Map(), // "4" -> count (samo p/m/gap/space)
  height: new Map(),
  radius: new Map(),
  shadow: new Map(),
  motion: new Map(),
  tabular: 0,
};

const bump = (map, key, n = 1) => map.set(key, (map.get(key) ?? 0) + n);
const bumpFile = (map, key, file) => {
  const cur = map.get(key) ?? { count: 0, files: new Set() };
  cur.count++;
  cur.files.add(rel(file));
  map.set(key, cur);
};

const PALETTE =
  /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/;
// `border-[trblxyse]` i `ring-offset` stoje PRE `border`/`ring`: alternacija
// uzima prvo što se poklopi, pa bi `border-l-warning` inače ispao kao boja
// „l-warning".
const COLOR_PREFIX =
  /^(text|bg|border-[trblxyse]|border|ring-offset|ring|fill|stroke|from|to|via|divide|outline|shadow|decoration|placeholder|accent|caret)-(.+?)(?:\/(\d{1,3}|\[[^\]]+\]))?$/;
// MapLibre svojstva stila (`text-color`, `text-font`, …) nisu Tailwind klase.
const MAPLIBRE = /^(color|font|field|size|halo-color|halo-width|anchor|offset|allow-overlap|ignore-placement|opacity)$/;
// Ono što posle `text-`/`border-`/... NIJE boja.
const NOT_COLOR = new Set([
  "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl",
  "micro", "small", "body", "h1", "h2", "display",
  "left", "right", "center", "justify", "start", "end",
  "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
  "none", "solid", "dashed", "dotted", "double", "hidden",
  "inset", "offset", "auto", "full", "px", "collapse", "separate",
  "transparent", "current", "inherit",
  "x", "y", "t", "b", "l", "r", "s", "e",
  "0", "1", "2", "3", "4", "5", "6", "8", "10",
  "2xs", "elev-0", "elev-1", "elev-2", "elev-3", "card",
  "top", "bottom", "middle", "baseline", "sub", "super", "text-top", "text-bottom",
  "0.5", "1.5", "2.5", "3.5",
  "uppercase", "lowercase", "capitalize",
  "clip-text", "fixed", "local", "scroll", "cover", "contain", "no-repeat", "repeat",
  "gradient-to-r", "gradient-to-l", "gradient-to-t", "gradient-to-b", "gradient-to-br", "gradient-to-tr",
  "linear-to-r", "linear-to-b", "linear-to-t", "linear-to-l",
  "auto", "opacity", "underline", "line-through", "wavy",
]);

function classify(raw, file) {
  const t = bare(raw);
  if (!t || /[\s{}()$"]/.test(t) && !/^\(--/.test(t.slice(t.indexOf("(")))) return;

  if (t === "tabular-nums") counts.tabular++;

  let m;
  // Boje
  if ((m = COLOR_PREFIX.exec(t))) {
    const prefix = m[1];
    const name = m[2];
    const alpha = m[3];
    const isSizeLike =
      NOT_COLOR.has(name) ||
      (prefix === "text" && MAPLIBRE.test(name)) ||
      /^\d+(\.\d+)?$/.test(name) ||
      /^\(--[a-z0-9-]+\)$/.test(name) && !name.startsWith("(--color") ||
      (prefix === "shadow" && (shadowTokens.has(name) || /^elev|^card$|^none$/.test(name))) ||
      (prefix === "text" && textTokens.has(name)) ||
      (prefix === "outline" && /^(none|offset|\d)/.test(name)) ||
      (prefix === "ring" && /^(inset|offset|\d)/.test(name)) ||
      (prefix.startsWith("border") && /^(\d|none|solid|dashed|dotted|double|hidden|collapse|separate|spacing)/.test(name)) ||
      (prefix === "divide" && /^(x|y|\d|solid|dashed|dotted|double|none)/.test(name)) ||
      (prefix === "decoration" && /^(\d|auto|from-font|solid|double|dotted|dashed|wavy)/.test(name)) ||
      (prefix === "bg" && /^(none|cover|contain|auto|fixed|local|scroll|clip|origin|repeat|no-repeat|gradient|linear|radial|conic|bottom|top|left|right|center|blend)/.test(name)) ||
      (prefix === "fill" && /^(none|mode)/.test(name)) ||
      (prefix === "stroke" && /^\d/.test(name)) ||
      (prefix === "from" && /^\d+%$/.test(name)) ||
      (prefix === "to" && /^\d+%$/.test(name)) ||
      (prefix === "via" && /^\d+%$/.test(name)) ||
      (prefix === "placeholder" && /^(shown)/.test(name)) ||
      (prefix === "accent" && /^(auto)/.test(name)) ||
      (prefix === "text" && /^(\[|\()/.test(name) && !/#|rgb|hsl|color|var\(--(color|temp|text|accent|success|warning|danger|line|surface|bg)/.test(name));

    if (!isSizeLike) {
      if (/^\[.*\]$/.test(name) || /^\(--.*\)$/.test(name)) {
        bumpFile(counts.colorArbitrary, `${prefix}-${name}`, file);
      } else if (colorTokens.has(name)) {
        bump(counts.color, name);
        if (alpha) {
          const set = counts.colorAlpha.get(name) ?? new Set();
          set.add(alpha);
          counts.colorAlpha.set(name, set);
        }
      } else if (PALETTE.test(name) || name === "white" || name === "black") {
        bumpFile(counts.colorPalette, `${prefix}-${name}`, file);
      } else if (/^[a-z][a-z0-9-]*$/.test(name)) {
        bumpFile(counts.colorUndefined, `${prefix}-${name}`, file);
      }
    }
  }

  // Tekst — veličine
  if ((m = /^text-(xs|sm|base|lg|xl|[2-9]xl|micro|small|body|h1|h2|display|\[[^\]]+\]|\(--[^)]+\))$/.exec(t))) {
    bump(counts.textSize, m[1]);
  }
  // Težine i familije
  if ((m = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.exec(t))) {
    bump(counts.weight, m[1]);
  }
  if ((m = /^font-(sans|mono|heading)$/.exec(t))) bump(counts.family, m[1]);

  // Razmaci
  if ((m = /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|gap-x|gap-y|space-x|space-y)-(\d+(?:\.\d+)?|px|auto|\[[^\]]+\]|\([^)]+\))$/.exec(t))) {
    bump(counts.spacing, t);
    bump(counts.spacingValue, m[2]);
  }
  if ((m = /^(h|min-h|max-h)-(\d+(?:\.\d+)?|px|full|screen|svh|dvh|auto|\[[^\]]+\]|\([^)]+\))$/.exec(t))) {
    if (m[1] === "h") bump(counts.height, m[2]);
  }
  // Radijusi
  if (/^rounded(-(t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\[[^\]]+\]|\([^)]+\)))?$/.test(t)) {
    bump(counts.radius, t);
  }
  // Senke (bez boja senki)
  if ((m = /^shadow-(elev-\d|card|2xs|xs|sm|md|lg|xl|2xl|none|inner|\(--[^)]+\)|\[[^\]]+\])$/.exec(t))) {
    bump(counts.shadow, m[1]);
  }
  // Pokret
  if (/^(duration-|transition|animate-|ease-|delay-)/.test(t)) bump(counts.motion, t);
}

// ── recepti (duplikati istog namena) ─────────────────────────────────────────

const recipes = {
  chip: new Map(), // cela className string -> count
  card: new Map(),
  kpiLabel: new Map(),
  emptyState: new Map(),
};
const hexLiterals = new Map(); // file -> count
const rgbaLiterals = new Map();
const inlineColorStyles = new Map();
const gsapDurations = new Map();
const celebratingEmpty = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const isCss = file.endsWith(".css");

  if (!isCss) {
    let m;
    STRING_RE.lastIndex = 0;
    while ((m = STRING_RE.exec(src))) {
      const s = m[1] ?? m[2] ?? m[3] ?? "";
      const tokens = s.split(/\s+/).filter(Boolean);
      for (const tok of tokens) classify(tok, file);

      const hasRounded = /\brounded(-\w+)?\b/.test(s);
      const hasBorder = /\bborder\b|\bborder-line/.test(s);
      const hasPx = /\bpx-[\d.]+/.test(s);
      const smallText = /\btext-(xs|micro)\b/.test(s);
      const inlineFlex = /\binline-flex\b/.test(s);
      if (inlineFlex && hasRounded && hasBorder && hasPx && smallText) bump(recipes.chip, s.trim());
      if (/\brounded-xl\b/.test(s) && /\b(bg-card|bg-surface)\b/.test(s) && !/\bh-\d/.test(s)) bump(recipes.card, s.trim());
      if (/\bheading-caps\b/.test(s) && /\btext-micro\b/.test(s)) bump(recipes.kpiLabel, s.trim());
      if (/\bitems-center\b/.test(s) && /\btext-center\b/.test(s) && /\b(py-|p-)(1[0-9]|2[0-9]|[89])\b/.test(s)) {
        bump(recipes.emptyState, s.trim());
      }

      const hex = s.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hex) bump(hexLiterals, rel(file), hex.length);
      const rgba = s.match(/rgba?\(/g);
      if (rgba) bump(rgbaLiterals, rel(file), rgba.length);
    }

    const inline = src.match(/style=\{\{[^}]*\b(color|background|backgroundColor|borderColor|boxShadow|fill|stroke)\b/g);
    if (inline) bump(inlineColorStyles, rel(file), inline.length);

    let g;
    const GSAP_RE = /duration:\s*([A-Z_]+|[\d.]+)/g;
    while ((g = GSAP_RE.exec(src))) bump(gsapDurations, g[1]);

    if (/CheckCircle2/.test(src) && /Nema |Sve (planirane|je)|nema (zaostalih|posla)/i.test(src) && /(py-12|p-12|py-24|py-16)/.test(src)) {
      celebratingEmpty.push(rel(file));
    }
  } else {
    let g;
    const CSS_DUR_RE = /(\d+)ms/g;
    while ((g = CSS_DUR_RE.exec(src))) bump(counts.motion, `css:${g[1]}ms`);
  }
}

// ── izlaz ────────────────────────────────────────────────────────────────────

const sortDesc = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]);
const sortDescObj = (map) => [...map.entries()].sort((a, b) => b[1].count - a[1].count);
const table = (rows, head) =>
  [`| ${head[0]} | ${head[1]} |`, `|---|---|`, ...rows.map(([k, v]) => `| \`${k}\` | ${v} |`)].join("\n");
const tableFiles = (rows, head) =>
  [
    `| ${head[0]} | ${head[1]} | ${head[2]} |`,
    `|---|---|---|`,
    ...rows.map(([k, v]) => `| \`${k}\` | ${v.count} | ${[...v.files].slice(0, 6).join(", ")}${v.files.size > 6 ? ` +${v.files.size - 6}` : ""} |`),
  ].join("\n");

const pxOf = (v) => (v === "px" ? 1 : /^\d+(\.\d+)?$/.test(v) ? Number(v) * 4 : null);
const spacingRows = sortDesc(counts.spacingValue).map(([v, c]) => {
  const px = pxOf(v);
  const grid = px === null ? "?" : px % 8 === 0 ? "8" : px % 4 === 0 ? "4" : "van";
  return [`${v} (${px === null ? "?" : px + "px"}, mreža ${grid})`, c];
});
const offGrid = sortDesc(counts.spacingValue)
  .filter(([v]) => {
    const px = pxOf(v);
    return px !== null && px % 8 !== 0;
  })
  .reduce((n, [, c]) => n + c, 0);
const totalSpacing = [...counts.spacingValue.values()].reduce((a, b) => a + b, 0);

const lines = [];
lines.push(`# Design DNA — popis zatečenog (grep, ne procena)`);
lines.push("");
lines.push(`Izmereno skriptom \`scripts/dna-inventory.mjs\` nad \`app/**\` i \`components/**\` (${files.length} fajlova). Datum: ${new Date().toISOString().slice(0, 10)}.`);
lines.push("");
lines.push(`## 1. Boje — tokeni koji se STVARNO koriste`);
lines.push("");
lines.push(`Deklarisano u \`@theme inline\`: ${colorTokens.size} tokena boja. Korišćeno: ${counts.color.size}.`);
lines.push("");
lines.push(table(sortDesc(counts.color).map(([k, v]) => [k, `${v}${counts.colorAlpha.has(k) ? ` · alfa koraci: ${[...counts.colorAlpha.get(k)].sort((a, b) => Number(a) - Number(b)).join(", ")}` : ""}`]), ["token", "upotreba"]));
lines.push("");
const unused = [...colorTokens].filter((t) => !counts.color.has(t));
lines.push(`Deklarisani, a nekorišćeni: ${unused.length ? unused.map((u) => `\`${u}\``).join(", ") : "—"}.`);
lines.push("");
lines.push(`### 1a. Klase boja bez tokena (tiho se NE generišu — element ostaje bez boje)`);
lines.push("");
lines.push(counts.colorUndefined.size ? tableFiles(sortDescObj(counts.colorUndefined), ["klasa", "upotreba", "fajlovi"]) : "Nema.");
lines.push("");
lines.push(`### 1b. Sirova Tailwind paleta (zabranjeno pravilom projekta)`);
lines.push("");
lines.push(counts.colorPalette.size ? tableFiles(sortDescObj(counts.colorPalette), ["klasa", "upotreba", "fajlovi"]) : "Nema.");
lines.push("");
lines.push(`### 1c. Proizvoljne vrednosti boja (\`[...]\` / \`(--...)\`)`);
lines.push("");
lines.push(counts.colorArbitrary.size ? tableFiles(sortDescObj(counts.colorArbitrary), ["klasa", "upotreba", "fajlovi"]) : "Nema.");
lines.push("");
lines.push(`### 1d. Heks / rgba literali u TSX-u (van globals.css)`);
lines.push("");
lines.push(hexLiterals.size ? table(sortDesc(hexLiterals), ["fajl", "heks literala"]) : "Nema heks literala.");
lines.push("");
lines.push(rgbaLiterals.size ? table(sortDesc(rgbaLiterals), ["fajl", "rgba( literala"]) : "Nema rgba literala.");
lines.push("");
lines.push(inlineColorStyles.size ? table(sortDesc(inlineColorStyles), ["fajl", "inline style sa bojom"]) : "Nema inline stilova sa bojom.");
lines.push("");

lines.push(`## 2. Tipografija`);
lines.push("");
lines.push(`Deklarisane veličine u \`@theme\`: ${[...textTokens].map((t) => `\`${t}\``).join(", ")}.`);
lines.push("");
lines.push(`### 2a. Veličine teksta (klase)`);
lines.push("");
lines.push(table(sortDesc(counts.textSize), ["klasa", "upotreba"]));
lines.push("");
lines.push(`Ukupno različitih veličina u upotrebi: ${counts.textSize.size}.`);
lines.push("");
lines.push(`### 2b. Težine`);
lines.push("");
lines.push(table(sortDesc(counts.weight), ["težina", "upotreba"]));
lines.push("");
lines.push(`Aeonik nosi 300/400/700 — \`medium\` i \`semibold\` se tiho zaokružuju na 400 ili 700.`);
lines.push("");
lines.push(`### 2c. Familije`);
lines.push("");
lines.push(table(sortDesc(counts.family), ["familija", "upotreba"]));
lines.push("");
lines.push(`\`tabular-nums\` kao klasa: ${counts.tabular} mesta (brojevi bez nje se ne mogu izbrojati grep-om).`);
lines.push("");

lines.push(`## 3. Razmaci (p/m/gap/space)`);
lines.push("");
lines.push(table(spacingRows, ["vrednost", "upotreba"]));
lines.push("");
lines.push(`Ukupno ${totalSpacing} razmaka; ${offGrid} (${Math.round((offGrid / Math.max(1, totalSpacing)) * 100)} %) NIJE na mreži od 8 px.`);
lines.push("");
lines.push(`### 3a. Visine kontrola (\`h-*\`)`);
lines.push("");
lines.push(table(sortDesc(counts.height).slice(0, 25), ["h-", "upotreba"]));
lines.push("");

lines.push(`## 4. Radijusi`);
lines.push("");
lines.push(table(sortDesc(counts.radius), ["klasa", "upotreba"]));
lines.push("");
lines.push(`Deklarisano: ${[...radiusTokens].map((t) => `\`${t}\``).join(", ")}.`);
lines.push("");

lines.push(`## 5. Senke`);
lines.push("");
lines.push(table(sortDesc(counts.shadow), ["klasa", "upotreba"]));
lines.push("");
lines.push(`Deklarisano: ${[...shadowTokens].map((t) => `\`${t}\``).join(", ")}.`);
lines.push("");

lines.push(`## 6. Pokret`);
lines.push("");
lines.push(table(sortDesc(counts.motion), ["klasa / css", "upotreba"]));
lines.push("");
lines.push(`GSAP \`duration:\` vrednosti u TSX/TS: ${sortDesc(gsapDurations).map(([k, v]) => `\`${k}\` ×${v}`).join(", ") || "—"}.`);
lines.push("");
lines.push(`Deklarisani tokeni: trajanja ${[...durationTokens].map((t) => `\`${t}\``).join(", ")}; krive ${[...easeTokens].map((t) => `\`${t}\``).join(", ")}.`);
lines.push("");

lines.push(`## 7. Duplikati istog namena (različiti recepti klasa)`);
lines.push("");
const recipeLine = (name, map) => {
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return `- **${name}**: ${map.size} različitih recepata za ${total} upotreba`;
};
lines.push(recipeLine("Čip (inline-flex + rounded + border + px + sitan tekst)", recipes.chip));
lines.push(recipeLine("Kartica (rounded-xl + bg-card/bg-surface)", recipes.card));
lines.push(recipeLine("Natpis pločice (heading-caps + text-micro)", recipes.kpiLabel));
lines.push(recipeLine("Prazno stanje (centrirano, veliki vertikalni razmak)", recipes.emptyState));
lines.push("");
lines.push(`Najčešći recepti čipa:`);
lines.push("");
for (const [s, c] of sortDesc(recipes.chip).slice(0, 8)) lines.push(`- ×${c} \`${s}\``);
lines.push("");
lines.push(`Najčešći recepti kartice:`);
lines.push("");
for (const [s, c] of sortDesc(recipes.card).slice(0, 8)) lines.push(`- ×${c} \`${s}\``);
lines.push("");
lines.push(`## 8. Prazna stanja koja slave prazninu (zelena kvačica + „Nema …")`);
lines.push("");
lines.push(celebratingEmpty.length ? celebratingEmpty.map((f) => `- \`${f}\``).join("\n") : "Nema.");
lines.push("");

const out = lines.join("\n") + "\n";
if (outPath) {
  const full = join(ROOT, outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, out, "utf8");
  console.log(`Upisano: ${outPath}`);
} else {
  process.stdout.write(out);
}
