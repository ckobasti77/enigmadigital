// Preneto iz Devotion packages/shared/src/table-matrix.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Jedno jezgro za CSV parsiranje i normalizaciju tabelarne matrice — troše ga
 * OBA klijenta (web: `apps/web/lib/csv.ts` re-export; mobilni:
 * `apps/mobile/src/lib/table-import.ts`). Dve kopije parsera su ranije živele
 * u tim fajlovima i razilazile se; izmene idu isključivo ovde.
 *
 * Čitanje BINARNIH formata (XLSX/XLS) ostaje platformsko — web koristi
 * `read-excel-file/browser` (`apps/web/lib/table-file.ts`), mobilni SheetJS sa
 * CDN tarball-a — ali obe grane svoj izlaz provlače kroz ove funkcije.
 *
 * RFC 4180: Excel izvozi CSV sa navodnicima, zarezima i prelomima reda unutar
 * polja, pa `split(",")` nije opcija. Razdvajač se pogađa iz prvog reda jer
 * srpski Excel često izvozi sa `;`.
 */
export type CsvTable = { rows: string[][] };

const DELIMITERS = [",", ";", "\t"] as const;

export function detectCsvDelimiter(sample: string) {
  const firstLine = sample.split(/\r?\n/, 1)[0] ?? "";
  let best: (typeof DELIMITERS)[number] = ",";
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let index = 0; index < firstLine.length; index += 1) {
      const char = firstLine[index];
      if (char === '"') {
        if (inQuotes && firstLine[index + 1] === '"') index += 1;
        else inQuotes = !inQuotes;
        continue;
      }
      if (!inQuotes && char === delimiter) count += 1;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return best;
}

export function parseCsv(input: string, delimiter?: string): CsvTable {
  // BOM bi inače završio kao deo prve ćelije zaglavlja.
  const text = input.replace(/^﻿/, "");
  const separator = delimiter ?? detectCsvDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnyChar = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    sawAnyChar = true;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      field += char;
      continue;
    }
    if (char === '"' && field === "") {
      inQuotes = true;
      continue;
    }
    if (char === separator) {
      endField();
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      endRow();
      continue;
    }
    if (char === "\n") {
      endRow();
      continue;
    }
    field += char;
  }

  if (sawAnyChar && (field !== "" || row.length > 0)) endRow();

  // Prazan poslednji red nastaje od završnog preloma; ne nosi podatke.
  while (
    rows.length > 0 &&
    rows[rows.length - 1].every((cell) => cell.trim() === "")
  ) {
    rows.pop();
  }
  return { rows };
}

/**
 * Poravnava sve redove na istu širinu i seče prazne repove — uvoz mora da dobije
 * pravougaonu matricu bez obzira kako je izvor izgledao.
 */
export function normalizeTableMatrix(
  rows: string[][],
  maxColumns: number,
): string[][] {
  const width = Math.min(maxColumns, sourceWidth(rows));
  if (width === 0) return [];
  return rows.map((row) =>
    Array.from({ length: width }, (_, index) => (row[index] ?? "").trim()),
  );
}

/** Najveća popunjena širina (broj kolona) u sirovoj matrici, bez sečenja. */
export function sourceWidth(rows: string[][]): number {
  return rows.reduce((widest, row) => {
    let lastFilled = 0;
    for (let index = 0; index < row.length; index += 1) {
      if (row[index].trim() !== "") lastFilled = index + 1;
    }
    return Math.max(widest, lastFilled);
  }, 0);
}

/**
 * Seče ćelije duže od `maxCellLength` na klijentu i broji koliko ih je skraćeno.
 * Server (`importRows` → `page_tables.ts#cleanCellValue`) inače BACI grešku i
 * odbije CELU seriju čim ijedna ćelija pređe limit — bolje seći ovde i javiti
 * korisniku nego da ceo uvoz padne na jednoj predugačkoj ćeliji.
 */
export function clampCellLengths(
  rows: string[][],
  maxCellLength: number,
): { matrix: string[][]; truncated: number } {
  let truncated = 0;
  const matrix = rows.map((row) =>
    row.map((cell) => {
      if (cell.length > maxCellLength) {
        truncated += 1;
        return cell.slice(0, maxCellLength);
      }
      return cell;
    }),
  );
  return { matrix, truncated };
}

/** Deli redove na serije ≤ `size` — `importRows` mutacija ima transakcione limite. */
export function chunkRows(rows: string[][], size: number): string[][][] {
  const batches: string[][][] = [];
  for (let start = 0; start < rows.length; start += size) {
    batches.push(rows.slice(start, start + size));
  }
  return batches;
}
