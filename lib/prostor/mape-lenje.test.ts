import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Mape su samo iza dinamičkog ulaza (SPAJANJE S14, plan S07 §7.2 i §11.1).
 * `@xyflow/react` je, uz Tiptap, najveći komad radnog dela i meri DOM, pa:
 *   - `@xyflow/react` (kod, ne `import type`) uvozi samo fascikla mapa;
 *   - xyflow `style.css` i `mape.css` uvozi samo `mape/mapa-stil.ts`;
 *   - van `mape/` se sme uvesti samo ulaz (`mape`, dinamički pogledi), ekran
 *     beleški (`mape/ekrani`) i kostur (`mape/mapa-kostur`), a oni sami ne
 *     uvoze xyflow ni poglede statički.
 * Tako oblast, stranica i ideje ne vuku mapu dok se ne otvori kartica „Mapa".
 */

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const MAPE = "components/app/prostor/mape/";
const DOZVOLJENI_ULAZI = new Set(["", "/ekrani", "/mapa-kostur"]);
const LAKI = ["index.tsx", "ekrani.tsx", "mapa-kostur.tsx"].map((ime) => MAPE + ime);

function fajlovi(dir: string, out: string[] = []): string[] {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    if (ulaz.name === "node_modules" || ulaz.name.startsWith(".")) continue;
    const put = join(dir, ulaz.name);
    if (ulaz.isDirectory()) fajlovi(put, out);
    else if (/\.(ts|tsx)$/.test(ulaz.name)) out.push(put);
  }
  return out;
}

const KOD = ["components", "app", "lib"]
  .flatMap((dir) => fajlovi(join(KOREN, dir)))
  .map((put) => ({ rel: relative(KOREN, put).split(sep).join("/"), kod: readFileSync(put, "utf8") }));

/** Statički uvozi koda (bez `import type`): specifikator po redu. */
function statickiUvozi(kod: string): string[] {
  const out: string[] = [];
  for (const m of kod.matchAll(/^\s*import\s+(?!type\b)([^;]*?)\s*from\s*["']([^"']+)["']/gm)) out.push(m[2]);
  for (const m of kod.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) out.push(m[1]);
  return out;
}

describe("mape iza dinamičkog ulaza", () => {
  test("@xyflow/react (kod) uvozi samo fascikla mapa", () => {
    const pali = KOD.filter(
      (f) => statickiUvozi(f.kod).some((s) => s.startsWith("@xyflow/")) && !f.rel.startsWith(MAPE),
    ).map((f) => f.rel);
    expect(pali).toEqual([]);
  });

  test("stil xyflow-a i mape.css uvozi samo mapa-stil.ts, a nju samo pogledi mapa", () => {
    const stil = KOD.filter((f) =>
      statickiUvozi(f.kod).some((s) => s.endsWith("/style.css") && s.includes("xyflow") || s.endsWith("mape.css")),
    ).map((f) => f.rel);
    expect(stil).toEqual([MAPE + "mapa-stil.ts"]);
    const korisnici = KOD.filter((f) => statickiUvozi(f.kod).some((s) => /(^|\/)mapa-stil$/.test(s)))
      .map((f) => f.rel)
      .sort();
    expect(korisnici).toEqual(
      [
        MAPE + "area-canvas-view.tsx",
        MAPE + "ideas-canvas-view.tsx",
        MAPE + "page-map-view.tsx",
        MAPE + "thoughts/thoughts-canvas-view.tsx",
      ].sort(),
    );
  });

  test("van mape/ se uvoze samo ulaz, ekran beleški i kostur", () => {
    const pali: string[] = [];
    for (const f of KOD) {
      if (f.rel.startsWith(MAPE)) continue;
      for (const s of statickiUvozi(f.kod)) {
        const m = /^@\/components\/app\/prostor\/mape(\/.*)?$/.exec(s);
        if (m && !DOZVOLJENI_ULAZI.has(m[1] ?? "")) pali.push(`${f.rel} → ${s}`);
      }
    }
    expect(pali).toEqual([]);
  });

  test("ulaz je dinamički i bez SSR-a; laki fajlovi ne vuku xyflow ni poglede", () => {
    const ulaz = KOD.find((f) => f.rel === MAPE + "index.tsx")?.kod ?? "";
    expect(ulaz.match(/dynamic\(/g)?.length).toBe(4);
    expect(ulaz.match(/ssr:\s*false/g)?.length).toBe(4);
    for (const rel of LAKI) {
      const kod = KOD.find((f) => f.rel === rel)?.kod;
      expect(kod, rel).toBeDefined();
      const uvozi = statickiUvozi(kod ?? "").filter((s) => s.startsWith(".") || s.startsWith("@/components/app/prostor/mape"));
      const dozvoljeni = uvozi.every((s) => /(^\.\/(index|mapa-kostur)$)/.test(s));
      expect({ rel, uvozi, dozvoljeni }).toEqual({ rel, uvozi, dozvoljeni: true });
      expect(statickiUvozi(kod ?? "").some((s) => s.startsWith("@xyflow/"))).toBe(false);
    }
  });

  test("uzorak razlikuje uvoz koda od uvoza tipa", () => {
    expect(statickiUvozi('import type { Node } from "@xyflow/react";')).toEqual([]);
    expect(statickiUvozi('import { ReactFlow } from "@xyflow/react";')).toEqual(["@xyflow/react"]);
    expect(statickiUvozi('import "@xyflow/react/dist/style.css";')).toEqual(["@xyflow/react/dist/style.css"]);
    expect(
      statickiUvozi('import {\n  MapaOblasti,\n} from "@/components/app/prostor/mape/area-canvas-view";'),
    ).toEqual(["@/components/app/prostor/mape/area-canvas-view"]);
  });
});
