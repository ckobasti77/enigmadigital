/**
 * „—" sa razlogom za mere Oglasa koje nisu izmerene. Nula se piše samo kad je
 * izmerena; kad imenioca nema (nema prikaza, nema klikova) ili platforma meru
 * ne meri (Google: doseg i frekvencija), ćelija nosi crticu, a razlog je u
 * `title` i u tekstu za čitač ekrana.
 */

const jeGoogle = (provider?: string) =>
  provider === "google_ads" || provider === "google";

export const RAZLOG = {
  bezPrikaza: "Bez prikazivanja u periodu",
  bezKlikova: "Bez klikova u periodu",
} as const;

/** Razlog za frekvenciju: Google je ne meri, Meta je nije poslala. */
export function razlogFrekvencije(provider?: string, impressions?: number): string {
  if (jeGoogle(provider)) return "Google ne meri frekvenciju";
  if (impressions === 0) return RAZLOG.bezPrikaza;
  return "Meta nije poslala doseg za ovaj period";
}

/** Razlog za doseg: Google ga ne meri, Meta ga nije poslala. */
export function razlogDosega(provider?: string): string {
  return jeGoogle(provider)
    ? "Google ne meri doseg"
    : "Meta nije poslala doseg za ovaj period";
}

/**
 * Vrednost ili crtica. `razlog` ide u `title` (miš) i u `sr-only` (čitač),
 * pa crtica nikad ne stoji bez objašnjenja.
 */
export function MeraIliCrtica({
  value,
  format,
  razlog,
}: {
  value: number | undefined;
  format: (v: number) => string;
  razlog: string;
}) {
  if (value !== undefined && Number.isFinite(value)) return <>{format(value)}</>;
  return (
    <span title={razlog} className="text-text-muted">
      <span aria-hidden>—</span>
      <span className="sr-only">{razlog}</span>
    </span>
  );
}
