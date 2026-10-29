// Preneto iz Devotion packages/shared/src/table-matrix.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  chunkRows,
  clampCellLengths,
  detectCsvDelimiter,
  normalizeTableMatrix,
  parseCsv,
} from "./table-matrix";

// Gol-slučajevi lanca 7: prazan fajl, jedan red, ćirilica, tačka-zarez i BOM —
// svaki mora da da upotrebljiv rezultat ili jasnu prazninu, nikad pad.
describe("parseCsv", () => {
  test("prazan ulaz daje nula redova", () => {
    expect(parseCsv("").rows).toEqual([]);
    // Fajl od samih praznih linija takođe ne nosi podatke.
    expect(parseCsv("\n\n").rows).toEqual([]);
  });

  test("jedan red bez završnog preloma", () => {
    expect(parseCsv("ime,grad").rows).toEqual([["ime", "grad"]]);
  });

  test("ćirilica prolazi netaknuta", () => {
    const { rows } = parseCsv("Име,Град\nЈован,Ниш");
    expect(rows).toEqual([
      ["Име", "Град"],
      ["Јован", "Ниш"],
    ]);
  });

  test("tačka-zarez se prepoznaje kao razdvajač (srpski Excel)", () => {
    const { rows } = parseCsv("ime;grad;broj\nAna;Niš;12");
    expect(rows).toEqual([
      ["ime", "grad", "broj"],
      ["Ana", "Niš", "12"],
    ]);
  });

  test("BOM ne završava u prvoj ćeliji zaglavlja", () => {
    const { rows } = parseCsv("﻿ime,grad\nAna,Niš");
    expect(rows[0][0]).toBe("ime");
  });

  test("navodnici: razdvajač i prelom reda unutar polja, dupli navodnik", () => {
    const { rows } = parseCsv('a,"x, y","kaže ""zdravo"""\r\n"više\nredova",b,c');
    expect(rows).toEqual([
      ["a", "x, y", 'kaže "zdravo"'],
      ["više\nredova", "b", "c"],
    ]);
  });
});

describe("detectCsvDelimiter", () => {
  test("bira razdvajač sa najviše pogodaka van navodnika", () => {
    expect(detectCsvDelimiter('a;b;"c;d";e\n')).toBe(";");
    expect(detectCsvDelimiter("a\tb\tc\n")).toBe("\t");
    expect(detectCsvDelimiter('"x;y",z\n')).toBe(",");
  });
});

describe("normalizeTableMatrix", () => {
  test("poravnava širinu, seče prazan rep i poštuje maxColumns", () => {
    const matrix = normalizeTableMatrix(
      [
        ["a", "b", "", ""],
        ["c"],
      ],
      64,
    );
    expect(matrix).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
    expect(normalizeTableMatrix([["a", "b", "c"]], 2)).toEqual([["a", "b"]]);
    expect(normalizeTableMatrix([["", ""]], 64)).toEqual([]);
  });
});

describe("clampCellLengths", () => {
  test("seče predugačke ćelije i broji ih", () => {
    const { matrix, truncated } = clampCellLengths([["abcd", "ab"]], 3);
    expect(matrix).toEqual([["abc", "ab"]]);
    expect(truncated).toBe(1);
  });
});

describe("chunkRows", () => {
  test("deli na serije zadate veličine", () => {
    const rows = [["1"], ["2"], ["3"], ["4"], ["5"]];
    expect(chunkRows(rows, 2)).toEqual([[["1"], ["2"]], [["3"], ["4"]], [["5"]]]);
    expect(chunkRows([], 2)).toEqual([]);
  });
});
