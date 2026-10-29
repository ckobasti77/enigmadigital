import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

/**
 * Uređivač teksta je samo iza dinamičkog ulaza (SPAJANJE S10, plan S07 §7.1 i
 * §11.1). Tiptap je najveći komad radnog dela i čita `window`, pa:
 *   - `@tiptap/*` uvoze samo fajlovi uređivača (`components/app/prostor/editor/`);
 *   - `rich-text-editor.tsx` uvozi samo ulaz `editor/index.tsx` (`next/dynamic`,
 *     `ssr: false`); svi ostali zovu `@/components/app/prostor/editor`.
 * Tako ljuska, meni i stablo nikad ne povuku Tiptap u početni komad.
 */

const KOREN = fileURLToPath(new URL("../../", import.meta.url));
const FASCIKLA_UREDJIVACA = "components/app/prostor/editor/";
const ULAZ = "components/app/prostor/editor/index.tsx";

function fajlovi(dir: string, out: string[] = []): string[] {
  for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
    if (ulaz.name === "node_modules" || ulaz.name.startsWith(".")) continue;
    const put = join(dir, ulaz.name);
    if (ulaz.isDirectory()) fajlovi(put, out);
    else if (/\.(ts|tsx)$/.test(ulaz.name)) out.push(put);
  }
  return out;
}

const KOD = [...fajlovi(join(KOREN, "components")), ...fajlovi(join(KOREN, "app"))].map((put) => ({
  rel: relative(KOREN, put).split(sep).join("/"),
  kod: readFileSync(put, "utf8"),
}));

describe("uređivač iza dinamičkog ulaza", () => {
  test("@tiptap/* uvozi samo fascikla uređivača", () => {
    const pali = KOD.filter(
      (f) => /from\s+["']@tiptap\//.test(f.kod) && !f.rel.startsWith(FASCIKLA_UREDJIVACA),
    ).map((f) => f.rel);
    expect(pali).toEqual([]);
  });

  test("rich-text-editor uvozi samo ulaz (next/dynamic, bez SSR-a)", () => {
    const uvoz = /(?:from\s+|import\()\s*["'][^"']*editor\/rich-text-editor["']|import\(\s*["']\.\/rich-text-editor["']/;
    const pali = KOD.filter((f) => uvoz.test(f.kod) && f.rel !== ULAZ).map((f) => f.rel);
    expect(pali).toEqual([]);
    const ulaz = KOD.find((f) => f.rel === ULAZ)?.kod ?? "";
    expect(ulaz).toMatch(/dynamic\(/);
    expect(ulaz).toMatch(/ssr:\s*false/);
  });

  test("uzorak hvata statički uvoz uređivača", () => {
    const uvoz = /(?:from\s+|import\()\s*["'][^"']*editor\/rich-text-editor["']/;
    expect(uvoz.test('import { RichTextEditor } from "@/components/app/prostor/editor/rich-text-editor";')).toBe(true);
    expect(uvoz.test('import { RichTextEditor } from "@/components/app/prostor/editor";')).toBe(false);
  });
});
