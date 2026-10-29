"use client";

export { redova } from "@/lib/prostor/web/table-file";

/** Redova u pregledu pre uvoza. */
const PREGLED_REDOVA = 6;

/**
 * Pregled prvih redova fajla pre uvoza (oba dijaloga uvoza: stranica-tabela
 * i tabela u belešci; Devotion ih je crtao dvaput, isto). Ćelije su tekst,
 * bez HTML-a.
 */
export function PregledMatrice({
  matrix,
  firstRowIsHeader,
}: {
  matrix: string[][];
  firstRowIsHeader: boolean;
}) {
  const zaglavlje = firstRowIsHeader ? matrix[0] : null;
  const redovi = (firstRowIsHeader ? matrix.slice(1) : matrix).slice(0, PREGLED_REDOVA);
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line-soft bg-card">
      <table className="w-full text-left text-meta">
        <caption className="sr-only">Pregled prvih redova fajla</caption>
        {zaglavlje ? (
          <thead className="bg-surface-raised">
            <tr>
              {zaglavlje.map((label, index) => (
                <th key={index} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-text-secondary">
                  {label || `Kolona ${index + 1}`}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {redovi.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-line-soft">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="max-w-56 truncate px-3 py-1.5 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
