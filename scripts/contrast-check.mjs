/**
 * ============================================================================
 * KONTRAST — izmereni odnosi za tokene iz app/globals.css (A1 §5, B2)
 * ============================================================================
 *
 *   node scripts/contrast-check.mjs [--out nocni-run/ux/kontrast-b2.md] [--strogo]
 *
 * Čita `:root` tokene (heks, rgba, oklch, var(), color-mix u srgb / oklab /
 * oklch), spušta poluprovidne boje na podlogu i računa WCAG 2.x odnos
 * kontrasta za parove koje aplikacija stvarno crta: tekst na tri nivoa
 * površine, tekst na materijalu (hrom), statusne i temperaturne boje kao
 * tekst, ivice i fokus prsten kao granice kontrola (3:1), tekst na svetloj
 * površini i na punom dugmetu.
 *
 * B2 (UI Boost §3): boje modula (ink na tri površine, tamni tekst na strong,
 * ink na sopstvenoj podlozi, strong kao tekst), XP, niz, rang, retkost, tekst
 * čipova kategorija i stanja na svojoj `-soft` podlozi. Izvedeni tokeni
 * (`--mod-soft`, `--mod-line`, `--cat-soft`) se čitaju iz samih `[data-module]`
 * i `[data-cat]` pravila, pa formula stoji na jednom mestu — u CSS-u.
 *
 * Izlaz je tabela sa odnosom i ocenom: AA (4.5:1 za tekst, 3:1 za granice
 * i krupan tekst). Red sa ocenom „info" je ukras (razdelnik, ivica kartice):
 * meri se radi evidencije i ne ulazi u pad. „Izgleda dobro" nije merenje;
 * ovo jeste.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8").replace(/\r\n/g, "\n");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outPath = outIdx !== -1 ? argv[outIdx + 1] : null;

// ── tokeni iz :root (prvi blok; medija upiti se preskaču) ────────────────────

/** Deklaracije prvog bloka sa zadatim selektorom. */
function blok(selektor) {
  const start = css.indexOf(`${selektor} {`);
  if (start === -1) return new Map();
  const end = css.indexOf("\n}", start);
  const mapa = new Map();
  for (const m of css.slice(start, end).matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
  return mapa;
}

const raw = blok(":root");
const MOD_PRAVILO = blok("[data-module]");
const CAT_PRAVILO = blok("[data-cat]");

function parseHex(s) {
  let h = s.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

// ── OKLab / OKLCH (Björn Ottosson) ───────────────────────────────────────────

const srgbLin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const linSrgb = (v) => {
  const c = Math.min(1, Math.max(0, v));
  return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255;
};

function rgbToOklab([r, g, b]) {
  const R = srgbLin(r);
  const G = srgbLin(g);
  const B = srgbLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    linSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const lchToLab = ([L, C, H]) => [L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)];
const labToLch = ([L, a, b]) => [L, Math.hypot(a, b), ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360];

/**
 * `color-mix(in <prostor>, A p%, B)` po CSS Color 4: interpolacija nad
 * premultiplikovanim komponentama, nijansa najkraćim lukom, a boja bez
 * nijanse (ahromatska ili potpuno providna) preuzima nijansu druge.
 */
function mix(prostor, A, p, B) {
  const alpha = A[3] * p + B[3] * (1 - p);
  if (alpha === 0) return [0, 0, 0, 0];
  if (prostor === "srgb") {
    const k = (i) => (A[i] * A[3] * p + B[i] * B[3] * (1 - p)) / alpha;
    return [k(0), k(1), k(2), alpha];
  }
  const la = rgbToOklab(A);
  const lb = rgbToOklab(B);
  if (prostor === "oklab") {
    const k = (i) => (la[i] * A[3] * p + lb[i] * B[3] * (1 - p)) / alpha;
    return [...oklabToRgb([k(0), k(1), k(2)]), alpha];
  }
  // oklch
  const ca = labToLch(la);
  const cb = labToLch(lb);
  const bezNijanseA = A[3] === 0 || ca[1] < 1e-4;
  const bezNijanseB = B[3] === 0 || cb[1] < 1e-4;
  const ha = bezNijanseA ? cb[2] : ca[2];
  const hb = bezNijanseB ? ca[2] : cb[2];
  let d = hb - ha;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const k = (i) => (ca[i] * A[3] * p + cb[i] * B[3] * (1 - p)) / alpha;
  // Potpuno providna strana ne nosi ni svetlinu ni hromu.
  const L = A[3] === 0 ? cb[0] : B[3] === 0 ? ca[0] : k(0);
  const C = A[3] === 0 ? cb[1] : B[3] === 0 ? ca[1] : k(1);
  return [...oklabToRgb(lchToLab([L, C, ha + d * (1 - p)])), alpha];
}

/** Vraća [r,g,b,a]. `env` nadjačava tokene iz `:root` (npr. `{ mod: "…" }`). */
function resolve(value, env = null, depth = 0) {
  if (depth > 14) throw new Error(`Predubok var(): ${value}`);
  const v = value.trim();
  let m;
  if ((m = /^var\(--([a-z0-9-]+)\)$/.exec(v))) {
    const inner = env?.get(m[1]) ?? raw.get(m[1]);
    if (inner === undefined) throw new Error(`Nepoznat token --${m[1]}`);
    return resolve(inner, env, depth + 1);
  }
  if (v === "transparent") return [0, 0, 0, 0];
  if (v.startsWith("#")) return parseHex(v);
  if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v))) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  if ((m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(v))) {
    return [...oklabToRgb(lchToLab([Number(m[1]), Number(m[2]), Number(m[3])])), 1];
  }
  if ((m = /^color-mix\(in (srgb|oklab|oklch),\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/.exec(v))) {
    const A = resolve(m[2], env, depth + 1);
    const B = resolve(m[4], env, depth + 1);
    return mix(m[1], A, Number(m[3]) / 100, B);
  }
  throw new Error(`Ne umem da pročitam boju: ${value}`);
}

/** Spušta boju sa alfom na neprovidnu podlogu. */
function over(fg, bg) {
  const a = fg[3];
  return [
    fg[0] * a + bg[0] * (1 - a),
    fg[1] * a + bg[1] * (1 - a),
    fg[2] * a + bg[2] * (1 - a),
    1,
  ];
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const solid = (name, bg, env = null) => over(resolve(`var(--${name})`, env), bg);
const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

// ── podloge ──────────────────────────────────────────────────────────────────

const BG950 = resolve("var(--bg-950)");
const SURFACE = resolve("var(--surface)");
const RAISED = resolve("var(--surface-raised)");
const MATERIAL = over(resolve("var(--material-bg)"), BG950);
const LIGHT = resolve("var(--surface-light)");
const ACCENT = resolve("var(--accent-400)");

const podloge = [
  ["bg-950 (strana)", BG950],
  ["surface (kartica)", SURFACE],
  ["surface-raised (iskačuće)", RAISED],
];

// ── parovi ───────────────────────────────────────────────────────────────────

const rows = [];
const push = (sta, podloga, fg, bg, prag, info = false) => {
  const r = ratio(fg, bg);
  rows.push({
    sta,
    podloga,
    boja: hex(fg),
    odnos: r,
    prag,
    info,
    ok: info || r >= prag,
  });
};

const TEXT = [
  ["text-primary", "tekst"],
  ["text-secondary", "tekst"],
  ["text-muted", "tekst"],
  ["accent-400", "tekst / link"],
  ["success", "tekst"],
  ["warning", "tekst"],
  ["danger", "tekst"],
  ["info", "tekst"],
  ["temp-cold", "tekst"],
  ["temp-warm", "tekst"],
  ["temp-hot", "tekst"],
];
for (const [ime, vrsta] of TEXT) {
  if (!raw.has(ime)) continue;
  for (const [naziv, bg] of podloge) {
    push(`${ime} (${vrsta})`, naziv, solid(ime, bg), bg, 4.5);
  }
}
if (raw.has("temp-nova")) {
  for (const [naziv, bg] of podloge) push("temp-nova (tekst)", naziv, solid("temp-nova", bg), bg, 4.5);
}
if (raw.has("strength-low")) {
  for (const ime of ["strength-low", "strength-mid", "strength-high"]) {
    push(`${ime} (tekst)`, "surface (kartica)", solid(ime, SURFACE), SURFACE, 4.5);
  }
}

// Vibrancy na hromu (sidebar, gornja traka) — podloga je materijal preko strane.
push("text-secondary-vibrant (tekst na hromu)", "material preko bg-950", solid("text-secondary-vibrant", MATERIAL), MATERIAL, 4.5);
push("text-muted-vibrant (tekst na hromu)", "material preko bg-950", solid("text-muted-vibrant", MATERIAL), MATERIAL, 4.5);
push("text-primary (tekst na hromu)", "material preko bg-950", solid("text-primary", MATERIAL), MATERIAL, 4.5);

// Grafikoni (krupan tekst / grafika ≥ 3:1)
for (let i = 1; i <= 6; i++) push(`chart-${i} (serija)`, "surface (kartica)", solid(`chart-${i}`, SURFACE), SURFACE, 3);

// Granice kontrola i fokus (3:1). `line-soft`, `line` i `line-strong` su
// razdelnici i ivice kartica, ne granice kontrola — mere se radi evidencije
// (ocena „info"). Granica koja MORA da se vidi je `line-control`.
const UKRASNE = new Set(["line-soft", "line", "line-strong"]);
const granice = ["line-soft", "line", "line-strong", "focus-ring-strong"];
if (raw.has("line-control")) granice.splice(3, 0, "line-control");
for (const ime of granice) {
  for (const [naziv, bg] of podloge) {
    push(`${ime} (${UKRASNE.has(ime) ? "razdelnik" : "granica"})`, naziv, solid(ime, bg), bg, 3, UKRASNE.has(ime));
  }
}

// Svetla površina i cijan dugme
push("text-on-light (tekst)", "surface-light", solid("text-on-light", LIGHT), LIGHT, 4.5);
if (raw.has("text-on-light-secondary")) {
  push("text-on-light-secondary (tekst)", "surface-light", solid("text-on-light-secondary", LIGHT), LIGHT, 4.5);
  push("text-on-light-muted (tekst)", "surface-light", solid("text-on-light-muted", LIGHT), LIGHT, 4.5);
} else {
  push("text-muted (tekst na svetloj)", "surface-light", solid("text-muted", LIGHT), LIGHT, 4.5);
}
push("text-inverse (tekst na cijan dugmetu)", "accent-400", solid("text-inverse", ACCENT), ACCENT, 4.5);

// ── B2: moduli (UI Boost §3.2, §3.4) ─────────────────────────────────────────

const MODULI = [...raw.keys()]
  .filter((k) => /^mod-[a-z]+$/.test(k) && raw.has(`${k}-strong`))
  .map((k) => k.slice(4));
const INVERSE = resolve("var(--text-inverse)");

for (const kljuc of MODULI) {
  // Isto što radi `[data-module="<kljuc>"]`, pa `[data-module]` izvede ostalo.
  const env = new Map([
    ["mod", `var(--mod-${kljuc})`],
    ["mod-strong", `var(--mod-${kljuc}-strong)`],
  ]);
  for (const [ime, vrednost] of MOD_PRAVILO) env.set(ime, vrednost);

  for (const [naziv, bg] of podloge) {
    push(`mod-${kljuc} (ink: tekst, ikonica, fokus)`, naziv, solid("mod", bg, env), bg, 4.5);
  }
  const strong = resolve("var(--mod-strong)", env);
  push(`text-inverse (tekst na primarnom dugmetu)`, `mod-${kljuc}-strong`, INVERSE, strong, 4.5);
  for (const [naziv, bg] of podloge) {
    push(`mod-${kljuc}-strong (--primary kao tekst)`, naziv, strong, bg, 4.5);
  }
  if (env.has("mod-soft")) {
    const soft = resolve("var(--mod-soft)", env);
    push(`mod-${kljuc} (tekst sekundarnog dugmeta i čipa)`, `mod-${kljuc}-soft`, solid("mod", soft, env), soft, 4.5);
  }
  if (env.has("mod-line")) {
    push(`mod-${kljuc}-line (ivica)`, "surface (kartica)", over(resolve("var(--mod-line)", env), SURFACE), SURFACE, 3, true);
  }
}

// ── B2: stanja na svojoj podlozi (§3.5) ──────────────────────────────────────

for (const stanje of ["success", "warning", "danger", "info"]) {
  if (!raw.has(`${stanje}-soft`)) continue;
  const soft = resolve(`var(--${stanje}-soft)`);
  push(`${stanje} (tekst pilule)`, `${stanje}-soft`, solid(stanje, soft), soft, 4.5);
}

// ── B2: kategorije (§3.6) ────────────────────────────────────────────────────

for (const slot of [1, 2, 3, 5, 6]) {
  if (!raw.has(`chart-${slot}-ink`) || !CAT_PRAVILO.has("cat-soft")) continue;
  const env = new Map([
    ["cat", `var(--chart-${slot})`],
    ["cat-ink", `var(--chart-${slot}-ink)`],
  ]);
  for (const [ime, vrednost] of CAT_PRAVILO) env.set(ime, vrednost);
  const soft = resolve("var(--cat-soft)", env);
  push(`chart-${slot}-ink (tekst čipa kategorije)`, `chart-${slot} 18 %`, solid("cat-ink", soft, env), soft, 4.5);
}

// ── B2: napredak i nagrada (§3.7) ────────────────────────────────────────────

if (raw.has("xp")) {
  for (const [naziv, bg] of podloge) push("xp (tekst)", naziv, solid("xp", bg), bg, 4.5);
  for (const [naziv, bg] of podloge) push("xp-strong (grafika)", naziv, solid("xp-strong", bg), bg, 3);
  const XP = resolve("var(--xp)");
  push("text-inverse (tekst na XP bedžu)", "xp", INVERSE, XP, 4.5);
  const xpSoft = resolve("var(--xp-soft)");
  push("xp (tekst toasta i čipa)", "xp-soft", solid("xp", xpSoft), xpSoft, 4.5);
  for (const ime of ["streak", "streak-hot"]) {
    for (const [naziv, bg] of podloge) push(`${ime} (ikonica)`, naziv, solid(ime, bg), bg, 3);
  }
  for (const [naziv, bg] of podloge) push("streak (tekst)", naziv, solid("streak", bg), bg, 4.5);
  for (const rang of ["bronze", "silver", "gold", "platinum", "diamond"]) {
    for (const [naziv, bg] of podloge) push(`tier-${rang} (bedž)`, naziv, solid(`tier-${rang}`, bg), bg, 3);
    const boja = resolve(`var(--tier-${rang})`);
    push("text-inverse (broj na bedžu nivoa)", `tier-${rang}`, INVERSE, boja, 4.5);
  }
  for (const retkost of ["common", "rare", "epic", "legendary"]) {
    push(`rarity-${retkost} (prsten dostignuća)`, "surface (kartica)", solid(`rarity-${retkost}`, SURFACE), SURFACE, 3);
  }
}

// ── izlaz ────────────────────────────────────────────────────────────────────

const mereni = rows.filter((r) => !r.info);
const fails = mereni.filter((r) => !r.ok);
const lines = [];
lines.push(`# Kontrast — izmereno (${new Date().toISOString().slice(0, 10)})`);
lines.push("");
lines.push(
  `Skript: \`scripts/contrast-check.mjs\`. Prag: 4.5:1 tekst, 3:1 granice/grafika. Pada: ${fails.length} od ${mereni.length} (uz ${rows.length - mereni.length} informativnih redova).`,
);
lines.push("");
lines.push("| šta | podloga | boja (spuštena) | odnos | prag | ocena |");
lines.push("|---|---|---|---|---|---|");
for (const r of rows) {
  const ocena = r.info ? "info" : r.ok ? "AA" : "**PADA**";
  lines.push(`| ${r.sta} | ${r.podloga} | \`${r.boja}\` | ${r.odnos.toFixed(2)}:1 | ${r.info ? "—" : `${r.prag}:1`} | ${ocena} |`);
}
lines.push("");
const out = lines.join("\n") + "\n";
if (outPath) {
  const full = join(ROOT, outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, out, "utf8");
  console.log(`Upisano: ${outPath} (pada ${fails.length}/${mereni.length})`);
} else {
  process.stdout.write(out);
}
if (argv.includes("--strogo") && fails.length > 0) process.exit(1);
