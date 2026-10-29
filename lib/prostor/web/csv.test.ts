// Preneto iz Devotion apps/web/lib/csv.test.ts (main @ c05c40f), SPAJANJE S11.
import { describe, expect, test } from "vitest";

import { detectCsvDelimiter, normalizeTableMatrix, parseCsv } from "./csv";

describe("CSV parser", () => {
  test("čita obična polja i CRLF prelome", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  test("navodnici čuvaju zarez, prelom reda i dvostruki navodnik", () => {
    const input = '"Ime, prezime","Više\nlinija","On je rekao ""ok"""';
    expect(parseCsv(input).rows).toEqual([
      ["Ime, prezime", "Više\nlinija", 'On je rekao "ok"'],
    ]);
  });

  test("BOM ne ulazi u prvu ćeliju", () => {
    expect(parseCsv("﻿kolona\nvrednost").rows).toEqual([
      ["kolona"],
      ["vrednost"],
    ]);
  });

  test("prazna polja i završni prelom ne prave lažne redove", () => {
    expect(parseCsv("a,,c\n\n").rows).toEqual([["a", "", "c"]]);
  });

  test("prazan ulaz daje praznu matricu", () => {
    expect(parseCsv("").rows).toEqual([]);
    expect(parseCsv("\n").rows).toEqual([]);
  });

  test("razdvajač se pogađa iz prvog reda", () => {
    expect(detectCsvDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectCsvDelimiter("a,b,c")).toBe(",");
    expect(detectCsvDelimiter("a\tb\tc")).toBe("\t");
    // Zarez unutar navodnika ne sme da pobedi pravi razdvajač.
    expect(detectCsvDelimiter('"a,b";c;d')).toBe(";");
  });

  test("tačka-zarez izvoz se čita bez dodatnog podešavanja", () => {
    expect(parseCsv("ime;iznos\nAna;1.200,50").rows).toEqual([
      ["ime", "iznos"],
      ["Ana", "1.200,50"],
    ]);
  });
});

describe("normalizacija matrice", () => {
  test("poravnava širinu i seče prazne repove", () => {
    expect(
      normalizeTableMatrix(
        [
          ["a", "b", "", ""],
          ["c"],
        ],
        64,
      ),
    ).toEqual([
      ["a", "b"],
      ["c", ""],
    ]);
  });

  test("poštuje gornju granicu kolona", () => {
    const wide = [Array.from({ length: 100 }, (_, index) => `c${index}`)];
    expect(normalizeTableMatrix(wide, 64)[0]).toHaveLength(64);
  });

  test("matrica bez ijedne popunjene ćelije je prazna", () => {
    expect(normalizeTableMatrix([["", ""], ["", ""]], 64)).toEqual([]);
  });
});
