/**
 * Temperatura leada — JEDAN izvor za tabelu, mapu i profil (A1 §2, plan O5).
 *
 * Niz ima smisao i redosled: Nova → Cold → Warm → Hot. Boja stoji u
 * `app/globals.css` (`--temp-nova`, `--temp-cold`, `--temp-warm`, `--temp-hot`
 * i `*-bg` parnjaci); ovde su samo IMENA tokena i klase koje ih čitaju, da
 * nijedan ekran ne sastavlja sopstveni `switch` po temperaturi. MapLibre sloj
 * ne može da čita Tailwind klase, pa čita `TEMPERATURE_TOKEN` kroz
 * `getComputedStyle` — ista promenljiva, isti broj.
 *
 * Nema heks vrednosti u ovom fajlu. Ako boja treba da se promeni, menja se u
 * `globals.css` i menja se svuda.
 */

export const TEMPERATURE = ["nova_firma", "cold", "warm", "hot"] as const;
export type Temperatura = (typeof TEMPERATURE)[number];

export const TEMPERATURE_LABEL: Record<Temperatura, string> = {
  nova_firma: "Nova firma",
  cold: "Cold",
  warm: "Warm",
  hot: "Hot",
};

/** CSS promenljiva koja nosi boju — jedino mesto koje mapa čita. */
export const TEMPERATURE_TOKEN: Record<Temperatura, string> = {
  nova_firma: "--temp-nova",
  cold: "--temp-cold",
  warm: "--temp-warm",
  hot: "--temp-hot",
};

/** `var(--temp-*)` za inline stil (sjaj panela, SVG legenda). */
export function temperatureVar(t: Temperatura): string {
  return `var(${TEMPERATURE_TOKEN[t]})`;
}

/**
 * Čip / izbor temperature: ivica u boji, blaga podloga, tekst u boji prednjeg
 * plana. Isti oblik u tabeli, na kartici iznad mape i u profilu.
 */
export const TEMPERATURE_CHIP_CLASS: Record<Temperatura, string> = {
  nova_firma: "border-temp-nova/50 bg-temp-nova-bg text-foreground",
  cold: "border-temp-cold/50 bg-temp-cold-bg text-foreground",
  warm: "border-temp-warm/50 bg-temp-warm-bg text-foreground",
  hot: "border-temp-hot/50 bg-temp-hot-bg text-foreground",
};

/** Tekst u boji temperature (legenda, natpis). */
export const TEMPERATURE_TEXT_CLASS: Record<Temperatura, string> = {
  nova_firma: "text-temp-nova",
  cold: "text-temp-cold",
  warm: "text-temp-warm",
  hot: "text-temp-hot",
};

/** Tačka u boji temperature (stavka menija, legenda). */
export const TEMPERATURE_DOT_CLASS: Record<Temperatura, string> = {
  nova_firma: "bg-temp-nova",
  cold: "bg-temp-cold",
  warm: "bg-temp-warm",
  hot: "bg-temp-hot",
};

/** Leva ivica reda tabele (`lead-urgency.ts`); nova firma nema ivicu. */
export const TEMPERATURE_EDGE_CLASS: Record<Exclude<Temperatura, "nova_firma">, string> = {
  cold: "border-l-temp-cold",
  warm: "border-l-temp-warm",
  hot: "border-l-temp-hot",
};

/** Baza ne garantuje polje; odsustvo se čita kao „nova firma", nikad kao greška. */
export function normalizeTemperatura(
  raw: string | null | undefined,
): Temperatura {
  return (TEMPERATURE as readonly string[]).includes(raw ?? "")
    ? (raw as Temperatura)
    : "nova_firma";
}
