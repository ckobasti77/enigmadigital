/**
 * Mesto mape dok se njen komad učitava (SPAJANJE S14): iste visine kao okvir
 * mape, da se ništa ne pomeri kad mapa stigne. Namerno je u svom fajlu: ulaz
 * `index.tsx` ga crta bez uvoza xyflow-a.
 */
export function MapaKostur({ label = "Učitavam mapu" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="h-[min(72vh,52rem)] min-h-[32rem] animate-pulse rounded-lg border border-line bg-card"
    />
  );
}
