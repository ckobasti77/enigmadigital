import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  estimateTableHtmlLength,
  isExcelFile,
  noteTableContent,
  readTableFile,
  redova,
} from "./table-file";
import {
  MAX_PAGE_FILE_BYTES,
  MAX_PAGE_FILES,
  MAX_PAGE_MEDIA_BYTES,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_IMPORT_BATCH,
  MAX_TABLE_ROWS,
  NOTE_TABLE_MAX_COLS,
  NOTE_TABLE_MAX_ROWS,
} from "../ogranicenja";
import { MAX_FILE_BYTES, MAX_FILES, MAX_MEDIA_BYTES } from "./page-files";

describe("uvoz tabele iz fajla", () => {
  test("Excel se prepoznaje po nastavku, CSV ne", () => {
    expect(isExcelFile(new File([""], "Provizije.xlsx"))).toBe(true);
    expect(isExcelFile(new File([""], "stari.XLS"))).toBe(true);
    expect(isExcelFile(new File([""], "izvoz.csv"))).toBe(false);
  });

  test("CSV se čita bez Excel čitača (lenji uvoz se ne dira)", async () => {
    const fajl = new File(["Kartica;Provizija\nVisa;1,4 %\n"], "provizije.csv", { type: "text/csv" });
    await expect(readTableFile(fajl)).resolves.toEqual([
      ["Kartica", "Provizija"],
      ["Visa", "1,4 %"],
    ]);
  });

  test("matrica postaje Tiptap tabela; prazna ćelija nema tekst", () => {
    const cvor = noteTableContent(
      [
        ["Kartica", "Provizija"],
        ["Visa", ""],
      ],
      true,
    );
    expect(cvor.type).toBe("table");
    expect(cvor.content[0].content.map((c) => c.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(cvor.content[1].content.map((c) => c.type)).toEqual(["tableCell", "tableCell"]);
    expect(cvor.content[1].content[0].content[0].content).toEqual([{ type: "text", text: "Visa" }]);
    expect(cvor.content[1].content[1].content[0]).toEqual({ type: "paragraph" });
    expect(noteTableContent([["a"]], false).content[0].content[0].type).toBe("tableCell");
  });

  test("procena dužine HTML-a raste sa sadržajem", () => {
    const mala = estimateTableHtmlLength([["a"]]);
    const veca = estimateTableHtmlLength([["a", "bbbb"], ["c", "d"]]);
    expect(mala).toBeGreaterThan(250);
    expect(veca).toBeGreaterThan(mala);
  });

  test("broj redova u tekstu prati padež", () => {
    expect(redova(1)).toBe("1 red");
    expect(redova(3)).toBe("3 reda");
    expect(redova(5)).toBe("5 redova");
    expect(redova(11)).toBe("11 redova");
    expect(redova(12)).toBe("12 redova");
    expect(redova(21)).toBe("21 red");
    expect(redova(24)).toBe("24 reda");
  });
});

describe("granice iz lib/prostor/ogranicenja", () => {
  test("su serverske vrednosti", () => {
    expect(MAX_TABLE_COLUMNS).toBe(64);
    expect(MAX_TABLE_ROWS).toBe(5_000);
    expect(MAX_TABLE_IMPORT_BATCH).toBe(200);
    expect(MAX_PAGE_FILES).toBe(25);
    expect(MAX_PAGE_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_PAGE_MEDIA_BYTES).toBe(200 * 1024 * 1024);
  });

  test("prilozi na webu koriste iste brojeve kao server", () => {
    expect(MAX_FILES).toBe(MAX_PAGE_FILES);
    expect(MAX_FILE_BYTES).toBe(MAX_PAGE_FILE_BYTES);
    expect(MAX_MEDIA_BYTES).toBe(MAX_PAGE_MEDIA_BYTES);
  });

  test("tabela u belešci je uža od stranice-tabele", () => {
    expect(NOTE_TABLE_MAX_ROWS).toBeLessThan(MAX_TABLE_ROWS);
    expect(NOTE_TABLE_MAX_COLS).toBeLessThan(MAX_TABLE_COLUMNS);
  });
});

/**
 * Čitač Excel-a (`read-excel-file`) ulazi samo kroz dinamički `import()` u
 * `lib/prostor/web/table-file.ts`, u trenutku izbora fajla — nikad statičkim
 * uvozom, da ne uđe u komad stranice.
 */
describe("read-excel-file se učitava lenjo", () => {
  const KOREN = fileURLToPath(new URL("../../../", import.meta.url));
  function fajlovi(dir: string, out: string[] = []): string[] {
    for (const ulaz of readdirSync(dir, { withFileTypes: true })) {
      if (ulaz.name === "node_modules" || ulaz.name.startsWith(".")) continue;
      const put = join(dir, ulaz.name);
      if (ulaz.isDirectory()) fajlovi(put, out);
      else if (/\.(ts|tsx)$/.test(ulaz.name)) out.push(put);
    }
    return out;
  }

  test("nijedan statički uvoz; dinamički samo u table-file.ts", () => {
    const kod = ["components", "app", "lib"].flatMap((d) => fajlovi(join(KOREN, d))).map((put) => ({
      rel: relative(KOREN, put).split(sep).join("/"),
      tekst: readFileSync(put, "utf8"),
    }));
    const staticki = kod.filter((f) => /from\s+["']read-excel-file/.test(f.tekst)).map((f) => f.rel);
    const dinamicki = kod.filter((f) => /import\(\s*["']read-excel-file/.test(f.tekst)).map((f) => f.rel);
    expect(staticki).toEqual([]);
    expect(dinamicki).toEqual(["lib/prostor/web/table-file.ts"]);
  });
});
