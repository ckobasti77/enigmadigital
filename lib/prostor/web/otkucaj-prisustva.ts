/**
 * Ritam otkucaja prisustva na stranici (SPAJANJE S11, plan K07 §6.4).
 *
 * Dok je kartica vidljiva, otkucaj ide odmah pa na svakih `intervalMs`
 * (15 s, `PAGE_PRESENCE_REFRESH_MS`). Kad se kartica sakrije, sat staje: nema
 * otkucaja ni ticanja, a red na serveru istekne sam (TTL 45 s). Povratak na
 * karticu šalje otkucaj odmah i pokreće sat ponovo.
 *
 * Čista logika bez `document`/`window`: okruženje se ubacuje, pa se ponašanje
 * proverava testom bez pregledača.
 */

export type OkruzenjeOtkucaja = {
  vidljivo: () => boolean;
  /** Promena vidljivosti kartice; vraća odjavu. */
  naPromenuVidljivosti: (slusalac: () => void) => () => void;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
};

export function pokreniOtkucaje({
  intervalMs,
  posalji,
  naTik,
  okruzenje,
}: {
  intervalMs: number;
  /** Otkucaj (`presence.heartbeat`). */
  posalji: () => void;
  /** Uz svaki otkucaj: osveži sat kojim klijent bira sveže redove. */
  naTik?: () => void;
  okruzenje: OkruzenjeOtkucaja;
}): () => void {
  let sat: number | null = null;

  const otkucaj = () => {
    naTik?.();
    posalji();
  };
  const pokreni = () => {
    if (sat !== null) return;
    otkucaj();
    sat = okruzenje.setInterval(otkucaj, intervalMs);
  };
  const zaustavi = () => {
    if (sat === null) return;
    okruzenje.clearInterval(sat);
    sat = null;
  };

  if (okruzenje.vidljivo()) pokreni();
  const odjavi = okruzenje.naPromenuVidljivosti(() => {
    if (okruzenje.vidljivo()) pokreni();
    else zaustavi();
  });

  return () => {
    zaustavi();
    odjavi();
  };
}

/** Okruženje pregledača: `document.visibilityState` i prozorski sat. */
export function okruzenjePregledaca(): OkruzenjeOtkucaja {
  return {
    vidljivo: () => document.visibilityState === "visible",
    naPromenuVidljivosti: (slusalac) => {
      document.addEventListener("visibilitychange", slusalac);
      return () => document.removeEventListener("visibilitychange", slusalac);
    },
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id),
  };
}
