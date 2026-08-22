/**
 * ============================================================================
 * PROZOR PONOVNOG DOHVATA ZA adInsights (MA1)
 * ============================================================================
 *
 * Meta osvežava insights na oko 15 minuta, a red se USTALJUJE tek posle 28
 * dana. Sve mlađe od toga je privremeno: atribuiran klik od pre tri nedelje i
 * dalje može da doda konverziju danas. Kod je do sada ponovo dohvatao 7 dana,
 * pa je sve između 8. i 28. dana zauvek ostajalo na prvom, nedovršenom broju.
 *
 * Prosto proširenje 7 → 28 dana bi učetvorostručilo potrošnju svakog prolaza,
 * i to na razvojnoj kvoti od 600 + 400 × broj aktivnih oglasa na sat. Zato se
 * dubina osvaja postepeno:
 *
 *   - poslednja 3 dana se osvežavaju UVEK, u svakom prolazu;
 *   - pored toga, jedan prolaz ide najviše 7 dana dublje u prošlost, dok se ne
 *     pokrije punih 28.
 *
 * Odatle: 1. pokretanje pokriva 7 dana, 2. pokriva 14, 3. pokriva 21, a 4.
 * pokriva punih 28 i time zatvara krug.
 *
 * ODLUKA KOJA NIJE DOSLOVNO IZ SPECA: kad se krug zatvori, on se PONAVLJA —
 * 5. pokretanje kreće ponovo od 7 dana. Varijanta u kojoj se posle 28. dana
 * osvežavaju samo poslednja 3 ostavlja dane od 4. do 28. zauvek na broju s
 * kojim su prvi put dohvaćeni, a to je tačno ona rupa zbog koje ovaj zadatak
 * postoji: red mlađi od 28 dana je privremen. Ovako svaki dan unutar prozora
 * bude ponovo dohvaćen jednom u četiri prolaza (cold_all ide na 6 h → jednom
 * dnevno), a nijedan prolaz i dalje ne ide dublje od 7 dana.
 *
 * Dokle se stiglo pamti `metaAdsBackfill` red po (workspaceId, scope) — jer
 * tri upita (dnevni, demografija, plasman) napreduju nezavisno i jedan koji
 * padne ne sme da pomeri stanje ostalih.
 * ============================================================================
 */

/** Posle ovoliko dana Meta više ne menja red. */
export const RESTATEMENT_WINDOW_DAYS = 28;

/** Najviše toliko dana dubine po jednom pokretanju. */
export const BACKFILL_CHUNK_DAYS = 7;

/** Poslednja 3 dana (danas + 2) se osvežavaju u svakom prolazu. */
export const ALWAYS_REFRESH_DAYS = 3;

const DAY_MS = 86_400_000;

export function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

export function shiftDay(iso: string, days: number): string {
  return isoDay(dayMs(iso) + days * DAY_MS);
}

export interface DateWindow {
  since: string;
  until: string;
}

export interface BackfillPlan {
  /** Uvek prisutan: poslednja 3 dana. */
  refresh: DateWindow;
  /** Sledećih najviše 7 dana dubine; izostaje kad je 28 dana već pokriveno. */
  chunk?: DateWindow;
  /** Šta upisati u `oldestSyncedDate` kad oba prozora prođu. */
  nextOldest: string;
  /** Da li je posle ovog prolaza pokriveno punih 28 dana. */
  complete: boolean;
  /** Da li je ovim prolazom započet novi krug preko istih 28 dana. */
  restarted: boolean;
}

/**
 * Isplaniraj prozore jednog prolaza.
 *
 * `today` je „YYYY-MM-DD”; `oldestSyncedDate` je najstariji dan koji je već
 * dohvaćen, ili undefined pre prvog prolaza.
 *
 * Kada se prozor dubine i prozor osvežavanja dodiruju (a to je slučaj u prvom
 * prolazu), plan vraća JEDAN spojeni prozor — dva zahteva nad istim danima
 * troše kvotu dvaput za isti odgovor.
 */
export function planBackfill(
  today: string,
  oldestSyncedDate: string | undefined,
): BackfillPlan {
  const refreshSince = shiftDay(today, -(ALWAYS_REFRESH_DAYS - 1));
  const horizon = shiftDay(today, -(RESTATEMENT_WINDOW_DAYS - 1));

  // Pre prvog prolaza nema šta da se nastavlja: krene se od danas unazad.
  const anchor = oldestSyncedDate ?? shiftDay(today, 1);
  const chunkUntil = shiftDay(anchor, -1);

  // Krug je zatvoren (ili je red zastareo dok prolaz nije radio): kreni iz
  // početka, od danas unazad. Vidi belešku o ponavljanju kruga iznad.
  const restarted = dayMs(chunkUntil) < dayMs(horizon);
  const effectiveUntil = restarted ? today : chunkUntil;

  const rawSince = shiftDay(effectiveUntil, -(BACKFILL_CHUNK_DAYS - 1));
  const chunkSince = dayMs(rawSince) < dayMs(horizon) ? horizon : rawSince;

  const nextOldest = chunkSince;
  const complete = dayMs(chunkSince) <= dayMs(horizon);

  // Prozori se dodiruju ili preklapaju → jedan zahtev umesto dva.
  if (dayMs(effectiveUntil) >= dayMs(refreshSince) - DAY_MS) {
    return {
      refresh: { since: chunkSince, until: today },
      nextOldest,
      complete,
      restarted,
    };
  }

  return {
    refresh: { since: refreshSince, until: today },
    chunk: { since: chunkSince, until: effectiveUntil },
    nextOldest,
    complete,
    restarted,
  };
}

/** Broj dana u prozoru, uključivo. */
export function windowDays(window: DateWindow): number {
  return Math.round((dayMs(window.until) - dayMs(window.since)) / DAY_MS) + 1;
}

/**
 * Prepolovi prozor sa mlađe strane — lek za `error_subcode 1487534`.
 *
 * Vraća `null` kada je prozor već jedan dan: tu više nema šta da se suzi i
 * jedini preostali put je asinhroni izveštaj.
 */
export function narrowWindow(window: DateWindow): DateWindow | null {
  const days = windowDays(window);
  if (days <= 1) return null;
  const half = Math.max(1, Math.floor(days / 2));
  return { since: shiftDay(window.until, -(half - 1)), until: window.until };
}
