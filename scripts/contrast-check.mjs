/**
 * ============================================================================
 * KONTRAST — izmereni odnosi za tokene iz app/globals.css (A1 §5)
 * ============================================================================
 *
 *   node scripts/contrast-check.mjs [--out nocni-run/ux/kontrast-posle.md]
 *
 * Čita `:root` tokene (heks, rgba, var(), color-mix u srgb), spušta poluprovidne
 * boje na podlogu i računa WCAG 2.x odnos kontrasta za parove koje aplikacija
 * stvarno crta: tekst na tri nivoa površine, tekst na materijalu (hrom),
 * statusne i temperaturne boje kao tekst, ivice i fokus prsten kao granice
 * kontrola (3:1), te tekst na svetloj površini i na cijan dugmetu.
 *
 * Izlaz je tabela sa odnosom i ocenom: AA (4.5:1 za tekst, 3:1 za granice
 * i krupan tekst). „Izgleda dobro" nije merenje; ovo jeste.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");

const argv = process.argv.slice(2);
const outIdx = argv.indexOf("--out");
const outPath = outIdx !== -1 ? argv[outIdx + 1] : null;

// ── tokeni iz :root (prvi blok; medija upiti se preskaču) ────────────────────

const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}\n", css.indexOf(":root {")));
const raw = new Map();
for (const m of rootBlock.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
  raw.set(m[1], m[2].replace(/\s+/g, " ").trim());
}

function parseHex(s) {
  let h = s.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

/** Vraća [r,g,b,a]. */
function resolve(value, depth = 0) {
  if (depth > 12) throw new Error(`Predubok var(): ${value}`);
  const v = value.trim();
  let m;
  if ((m = /^var\(--([a-z0-9-]+)\)$/.exec(v))) {
    const inner = raw.get(m[1]);
    if (inner === undefined) throw new Error(`Nepoznat token --${m[1]}`);
    return resolve(inner, depth + 1);
  }
  if (v.startsWith("#")) return parseHex(v);
  if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v))) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), a];
  }
  if ((m = /^color-mix\(in srgb,\s*(.+?)\s+(\d+(?:\.\d+)?)%\s*,\s*(.+)\)$/.exec(v))) {
    const p = Number(m[2]) / 100;
    const a = resolve(m[1], depth + 1);
    const b = resolve(m[3], depth + 1);
    const mix = (i) => a[i] * p + b[i] * (1 - p);
    return [mix(0), mix(1), mix(2), a[3] * p + b[3] * (1 - p)];
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

const solid = (name, bg) => over(resolve(`var(--${name})`), bg);
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
const push = (sta, podloga, fg, bg, prag) => {
  const r = ratio(fg, bg);
  rows.push({
    sta,
    podloga,
    boja: hex(fg),
    odnos: r,
    prag,
    ok: r >= prag,
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
  ["temp-cold", "tekst"],
  ["temp-warm", "tekst"],
  ["temp-hot", "tekst"],
];
for (const [ime, vrsta] of TEXT) {
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

// Granice kontrola i fokus (3:1). `line`/`line-soft` su razdelnici, ne
// granice kontrola — mere se radi evidencije, prag za njih je informativan.
const granice = ["line-soft", "line", "line-strong", "focus-ring-strong"];
if (raw.has("line-control")) granice.splice(3, 0, "line-control");
for (const ime of granice) {
  for (const [naziv, bg] of podloge) {
    push(`${ime} (granica)`, naziv, solid(ime, bg), bg, 3);
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

// ── izlaz ────────────────────────────────────────────────────────────────────

const fails = rows.filter((r) => !r.ok);
const lines = [];
lines.push(`# Kontrast — izmereno (${new Date().toISOString().slice(0, 10)})`);
lines.push("");
lines.push(`Skript: \`scripts/contrast-check.mjs\`. Prag: 4.5:1 tekst, 3:1 granice/grafika. Pada: ${fails.length} od ${rows.length}.`);
lines.push("");
lines.push("| šta | podloga | boja (spuštena) | odnos | prag | ocena |");
lines.push("|---|---|---|---|---|---|");
for (const r of rows) {
  lines.push(`| ${r.sta} | ${r.podloga} | \`${r.boja}\` | ${r.odnos.toFixed(2)}:1 | ${r.prag}:1 | ${r.ok ? "AA" : "**PADA**"} |`);
}
lines.push("");
const out = lines.join("\n") + "\n";
if (outPath) {
  const full = join(ROOT, outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, out, "utf8");
  console.log(`Upisano: ${outPath} (pada ${fails.length}/${rows.length})`);
} else {
  process.stdout.write(out);
}
if (argv.includes("--strogo") && fails.length > 0) process.exit(1);
