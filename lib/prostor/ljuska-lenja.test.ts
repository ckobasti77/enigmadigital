import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Prvo učitavanje Enigme ne nosi teške delove radnog dela (SPAJANJE S28,
 * plan S07 §11.1). Prati se graf STATIČKIH uvoza (bez `import type`, bez
 * `import()` i `next/dynamic`), isto kao što bundler pravi početni komad:
 *   - nijedna strana ni ljuska ne dosežu Tiptap, xyflow, `read-excel-file`
 *     ni `web-push`, niti fajlove uređivača i mapa iza dinamičkih ulaza;
 *   - ljuska (layout-i `app/(app)`) ne doseže statički dijaloge koji se
 *     otvaraju na klik (Nova stranica, Nova oblast, Brzi unos, podešavanja
 *     obaveštenja, profil), fioku lista „Više“, ekran Inbox-a ni barel
 *     `lib/prostor` (vukao bi sve module radnog dela u svaku stranu). Oni su
 *     iza `next/dynamic`: kod stiže posle prvog učitavanja.
 * Merenje builda (KB po ruti) je u progress-u S28; ovo ga drži da ne pukne tiho.
 */

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const rel = (put: string) => relative(KOREN, put).split(sep).join("/");

const LJUSKA = ["app/(app)/layout.tsx", "app/(app)/(ja)/layout.tsx", "app/(app)/[projekat]/layout.tsx"];

const TESKI_PAKETI = /^(@tiptap\/|@xyflow\/|read-excel-file|web-push)/;
const IZA_DINAMICKOG_ULAZA = (f: string) =>
  /^components\/app\/prostor\/editor\/(rich-text-editor|note-file-node|link-dijalog)\.tsx$/.test(f) ||
  (f.startsWith("components/app/prostor/mape/") &&
    !["index.tsx", "ekrani.tsx", "mapa-kostur.tsx"].includes(f.slice("components/app/prostor/mape/".length)));

const NE_U_LJUSCI = [
  "lib/prostor/index.ts",
  "components/app/prostor/dokumenti/create-page-dialog.tsx",
  "components/app/prostor/dokumenti/create-area-dialog.tsx",
  "components/app/prostor/ja/brzi-unos/quick-add-container.tsx",
  "components/app/prostor/inbox/notification-settings-dialog.tsx",
  "components/app/prostor/profil/profil-dijalog.tsx",
  "components/app/prostor/inbox/inbox-view.tsx",
  "components/ui/drawer.tsx",
];

/** Statički uvozi i ponovni izvozi koda; `import type` / `export type` i `{ type A }` se ne broje. */
export function statickiUvozi(kod: string): string[] {
  const bez = kod.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  for (const m of bez.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/gm)) {
    if (m[1]) continue;
    const imena = m[2].replace(/[{}]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (imena.length > 0 && imena.every((s) => s.startsWith("type "))) continue;
    out.push(m[3]);
  }
  for (const m of bez.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(m[1]);
  return out;
}

function razresi(odFajla: string, spec: string): string | null {
  let baza: string;
  if (spec.startsWith("@/")) baza = join(KOREN, spec.slice(2));
  else if (spec.startsWith(".")) baza = resolve(dirname(odFajla), spec);
  else return null;
  for (const k of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = baza + k;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** Svi fajlovi i paketi dostižni statičkim uvozima iz ulaza. */
function graf(ulazi: string[]): { fajlovi: Map<string, string>; paketi: Map<string, string> } {
  const fajlovi = new Map<string, string>();
  const paketi = new Map<string, string>();
  const red = ulazi.map((u) => join(KOREN, u));
  for (const u of red) fajlovi.set(rel(u), "(ulaz)");
  while (red.length > 0) {
    const f = red.shift()!;
    if (!/\.(ts|tsx)$/.test(f)) continue;
    for (const spec of statickiUvozi(readFileSync(f, "utf8"))) {
      const p = razresi(f, spec);
      if (p === null) {
        if (!spec.startsWith(".") && !spec.startsWith("@/") && !paketi.has(spec)) paketi.set(spec, rel(f));
        continue;
      }
      const r = rel(p);
      if (!fajlovi.has(r)) {
        fajlovi.set(r, rel(f));
        red.push(p);
      }
    }
  }
  return { fajlovi, paketi };
}

function sviFajlovi(dir: string, out: string[] = []): string[] {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    if (ulaz.name === "node_modules" || ulaz.name.startsWith(".")) continue;
    const put = join(dir, ulaz.name);
    if (ulaz.isDirectory()) sviFajlovi(put, out);
    else if (/\.(ts|tsx)$/.test(ulaz.name)) out.push(put);
  }
  return out;
}

function strane(dir: string, out: string[] = []): string[] {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    const put = join(dir, ulaz.name);
    if (ulaz.isDirectory()) strane(put, out);
    else if (ulaz.name === "page.tsx" || ulaz.name === "layout.tsx") out.push(rel(put));
  }
  return out;
}

describe("prvo učitavanje bez teških delova radnog dela", () => {
  test("nijedna strana ni layout iza prijave ne doseže Tiptap, xyflow, Excel ni web-push", () => {
    const pali: string[] = [];
    for (const strana of strane(join(KOREN, "app/(app)"))) {
      const { fajlovi, paketi } = graf([strana]);
      for (const [paket, ko] of paketi) if (TESKI_PAKETI.test(paket)) pali.push(`${strana}: ${paket} (iz ${ko})`);
      for (const [f, ko] of fajlovi) if (IZA_DINAMICKOG_ULAZA(f)) pali.push(`${strana}: ${f} (iz ${ko})`);
    }
    expect(pali).toEqual([]);
  });

  test("ljuska ne doseže dijaloge na klik, ekran Inbox-a ni barel lib/prostor", () => {
    const { fajlovi } = graf(LJUSKA);
    const pali = NE_U_LJUSCI.filter((f) => fajlovi.has(f)).map((f) => `${f} (iz ${fajlovi.get(f)})`);
    expect(pali).toEqual([]);
    // Graf zaista prolazi kroz ljusku (inače bi gornja provera bila prazna istina).
    expect(fajlovi.has("components/app/app-shell.tsx")).toBe(true);
    expect(fajlovi.has("components/app/prostor/dokumenti/dokumenti-kontekst.tsx")).toBe(true);
  });

  test("kod aplikacije uvozi module radnog dela direktno, ne kroz barel lib/prostor", () => {
    const pali = ["components", "app", "lib"]
      .flatMap((dir) => sviFajlovi(join(KOREN, dir)))
      .filter((f) => !f.endsWith(".test.ts") && rel(f) !== "lib/prostor/index.ts")
      .filter((f) => {
        const uvozi = statickiUvozi(readFileSync(f, "utf8"));
        return uvozi.some((s) => s === "@/lib/prostor" || (rel(f).startsWith("lib/prostor/") && /^(\.\.\/)*(index)?$|^\.\.?\/index$|^\.\.$/.test(s)));
      })
      .map(rel);
    expect(pali).toEqual([]);
  });

  test("lenji ulazi ljuske su dinamički i bez SSR-a", () => {
    const ulazi: Array<[string, RegExp]> = [
      ["components/app/prostor/dokumenti/dokumenti-kontekst.tsx", /import\(\s*["']\.\/create-page-dialog["']\)/],
      ["components/app/prostor/dokumenti/dokumenti-kontekst.tsx", /import\(\s*["']\.\/create-area-dialog["']\)/],
      ["components/app/prostor/ja/brzi-unos/brzi-unos.tsx", /import\(\s*["']\.\/quick-add-container["']\)/],
      ["components/app/prostor/lenji-dijalozi.tsx", /import\(\s*["']\.\/inbox\/notification-settings-dialog["']\)/],
      ["components/app/prostor/lenji-dijalozi.tsx", /import\(\s*["']\.\/profil\/profil-dijalog["']\)/],
      ["components/app/mobile-nav.tsx", /import\(\s*["']@\/components\/ui\/drawer["']\)/],
    ];
    for (const [fajl, uvoz] of ulazi) {
      const kod = readFileSync(join(KOREN, fajl), "utf8");
      expect(kod, fajl).toMatch(uvoz);
      expect(kod, fajl).toMatch(/dynamic\(/);
      expect(kod, fajl).toMatch(/ssr:\s*false/);
    }
  });

  test("uzorak: type-uvoz se ne broji, ponovni izvoz i uvoz bez imena se broje", () => {
    expect(statickiUvozi('import type { A } from "x";')).toEqual([]);
    expect(statickiUvozi('import { type A, type B } from "x";')).toEqual([]);
    expect(statickiUvozi('import { type A, b } from "x";')).toEqual(["x"]);
    expect(statickiUvozi('export { a } from "../index";')).toEqual(["../index"]);
    expect(statickiUvozi('import "./stil.css";')).toEqual(["./stil.css"]);
    expect(statickiUvozi('const X = dynamic(() => import("./y"));')).toEqual([]);
    expect(statickiUvozi('// import { a } from "x";')).toEqual([]);
  });
});
