/**
 * ============================================================================
 * ZDRAVLJE VEZA PROJEKTA — tačka u biraču i kolona „Veze“ u hubu
 * (plan C02 §8.3, plan C15 §2)
 * ============================================================================
 *
 * Čista funkcija: ne čita bazu ni sat (vreme dolazi od pozivaoca). Donji
 * pragovi su isti kao na ekranima koji isto pitanje postavljaju po vezi:
 *   - token ističe za 7 dana ili manje (`lib/token-expiry.ts`; P3 iz
 *     `docs/ULTRA-PLAN.md`, do ULTRA1 je bilo 14 dana);
 *   - podaci su stari kad posle 24 h nije stiglo ništa
 *     (`lib/channel-readiness.ts`);
 *   - prolaz koji „radi“ duže od 15 minuta je zaglavljen (`sync.ts`, zvono).
 *
 * C16 (plan C15 §2.2) dodaje crveno i prag po učestalosti provajdera:
 *   - žuto kad od poslednje uspešne sinhronizacije prođe više od
 *     `max(24 h, 2 × razmak)`, crveno preko `max(72 h, 4 × razmak)`;
 *   - token: žuto ≤ 7 dana, crveno ≤ 2 dana.
 *
 * Ista funkcija je osnova jednog statusa veze (`statusVeze.ts`): tačka u
 * gornjoj traci, zaglavlje kanala, Podešavanja i zvono čitaju isti razlog.
 * Razmak je iz `convex/crons.ts`; provajder bez redovnog prolaza (`leads`,
 * `google_business`) nema pravilo starosti.
 *
 * Pravila (najgore stanje pobeđuje):
 *   greška       veza `error` ili `expired`; poslednji prolaz je pao, a posle
 *                njega nije stiglo ništa svežije (isto kao zvono); token
 *                ističe za ≤ 2 dana; podaci stariji od crvenog praga;
 *   upozorenje   token ističe za ≤ 7 dana, prolaz je zaglavljen, ili su
 *                podaci stariji od žutog praga;
 *   ok           bar jedna veza, bez ičega od navedenog;
 *   bez_veza     nijedna veza (veza u prekidu se ne broji).
 *
 * Veza bez ijednog prolaza (nova, ili se ne sinhronizuje po rasporedu) ne
 * diže upozorenje zbog starosti: to nije zastoj nego odsustvo podatka.
 */

export type ZdravljeVeza = "ok" | "upozorenje" | "greska" | "bez_veza";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;

/**
 * Isti pragovi kao na frontu, preslikani jer Convex ne uvozi `lib/` aplikacije
 * (`@/` putanje). `lib/zdravlje-veza.test.ts` proverava da su jednaki.
 */
export const TOKEN_ISTICE_MS = 7 * DAN; // TOKEN_EXPIRY_WARNING_MS
export const PODACI_STARI_MS = 24 * SAT; // SYNC_FRESH_MS
export const ZAGLAVLJEN_MS = 15 * 60 * 1000; // ZASTAO_MS (sync.ts, zvono)

/** Token koji ističe za ≤ 2 dana: dnevno osvežavanje je očigledno palo. */
export const TOKEN_KRITICNO_MS = 2 * DAN;
/** Donja granica crvenog za stare podatke (žuto je `PODACI_STARI_MS`). */
export const PODACI_KRITICNO_MS = 72 * SAT;

/**
 * Očekivani razmak redovne sinhronizacije po provajderu, u satima
 * (`convex/crons.ts`). Provajder kog nema ovde nema pravilo starosti.
 */
export const OCEKIVANI_RAZMAK_H: Readonly<Record<string, number>> = {
  ga4: 6,
  meta_ig: 6,
  meta_fb: 6,
  meta_ads: 3,
  google_ads: 3,
  youtube: 6,
  openreply: 1,
  threads: 24,
};

/** Prag žutog i crvenog za stare podatke; `null` = pravilo ne važi. */
export function pragoviStarosti(
  provider: string | undefined,
): { zuto: number; crveno: number } | null {
  // Bez provajdera (stari pozivaoci) važi donja granica, kao pre C16.
  if (provider === undefined) return { zuto: PODACI_STARI_MS, crveno: PODACI_KRITICNO_MS };
  const razmak = OCEKIVANI_RAZMAK_H[provider];
  if (razmak === undefined) return null;
  return {
    zuto: Math.max(PODACI_STARI_MS, 2 * razmak * SAT),
    crveno: Math.max(PODACI_KRITICNO_MS, 4 * razmak * SAT),
  };
}

export type VezaZaZdravlje = {
  /** Provajder veze (za prag starosti); bez njega važi donja granica. */
  provider?: string;
  status: "active" | "error" | "expired" | "disconnecting";
  expiresAt?: number;
  lastSyncAt?: number;
  /**
   * Kad je podatak tog provajdera poslednji put stvarno upisan izvan redovnog
   * prolaza (`metaSyncJobs.lastDataAt`). Hub ga ne šalje; status veze da.
   */
  poslednjiPodatak?: number;
  /** Poslednji prolaz sinhronizacije tog provajdera, ako postoji. */
  poslednjiProlaz: {
    status: "running" | "ok" | "error";
    startedAt: number;
    finishedAt?: number;
  } | null;
};

export type RazlogZdravlja =
  | "token_istekao"
  | "token_istice"
  | "greska_veze"
  | "pao_prolaz"
  | "zastao"
  | "stari_podaci";

export type ZdravljeJedneVeze = {
  stanje: Exclude<ZdravljeVeza, "bez_veza">;
  razlog: RazlogZdravlja | null;
  /** Za tekst: dani do isteka tokena ili sati bez podataka. */
  za?: number;
};

const TEZINA: Record<ZdravljeVeza, number> = {
  bez_veza: 0,
  ok: 1,
  upozorenje: 2,
  greska: 3,
};

/** Stanje i razlog jedne veze (veza u prekidu se ne zove ovde). */
export function razlogZdravlja(veza: VezaZaZdravlje, sada: number): ZdravljeJedneVeze {
  if (veza.status === "expired") return { stanje: "greska", razlog: "token_istekao" };
  if (veza.status === "error") return { stanje: "greska", razlog: "greska_veze" };

  const prolaz = veza.poslednjiProlaz;
  if (prolaz !== null && prolaz.status === "error") {
    const kad = prolaz.finishedAt ?? prolaz.startedAt;
    // Prolaz je pao, ali je posle njega nešto ipak stiglo → kvar je prošao.
    if ((veza.lastSyncAt ?? 0) <= kad) return { stanje: "greska", razlog: "pao_prolaz" };
  }

  if (veza.expiresAt !== undefined) {
    const ostalo = veza.expiresAt - sada;
    const dana = Math.max(0, Math.ceil(ostalo / DAN));
    if (ostalo <= 0) return { stanje: "greska", razlog: "token_istekao" };
    if (ostalo <= TOKEN_KRITICNO_MS) return { stanje: "greska", razlog: "token_istice", za: dana };
    if (ostalo < TOKEN_ISTICE_MS) return { stanje: "upozorenje", razlog: "token_istice", za: dana };
  }
  if (prolaz !== null && prolaz.status === "running") {
    // Prolaz u toku nije zastoj dok ne pređe prag; starost podataka tada
    // ne meri ništa (prvo povezivanje još nema `lastSyncAt`).
    return prolaz.startedAt < sada - ZAGLAVLJEN_MS
      ? { stanje: "upozorenje", razlog: "zastao" }
      : { stanje: "ok", razlog: null };
  }
  const pragovi = pragoviStarosti(veza.provider);
  if (prolaz !== null && pragovi !== null) {
    const poslednjiPodatak = Math.max(
      veza.lastSyncAt ?? 0,
      prolaz.status === "ok" ? (prolaz.finishedAt ?? prolaz.startedAt) : 0,
      veza.poslednjiPodatak ?? 0,
    );
    const starost = sada - poslednjiPodatak;
    const sati = Math.floor(starost / SAT);
    if (starost > pragovi.crveno) return { stanje: "greska", razlog: "stari_podaci", za: sati };
    if (starost > pragovi.zuto) return { stanje: "upozorenje", razlog: "stari_podaci", za: sati };
  }
  return { stanje: "ok", razlog: null };
}

export function zdravljeProjekta(veze: readonly VezaZaZdravlje[], sada: number): ZdravljeVeza {
  let najgore: ZdravljeVeza = "bez_veza";
  for (const veza of veze) {
    if (veza.status === "disconnecting") continue;
    const z = razlogZdravlja(veza, sada).stanje;
    if (TEZINA[z] > TEZINA[najgore]) najgore = z;
  }
  return najgore;
}

/** Najgora veza (za liniju razloga ispod imena projekta); `null` bez veza. */
export function najgoraVeza<T extends VezaZaZdravlje>(
  veze: readonly T[],
  sada: number,
): { veza: T; zdravlje: ZdravljeJedneVeze } | null {
  let najgora: { veza: T; zdravlje: ZdravljeJedneVeze } | null = null;
  for (const veza of veze) {
    if (veza.status === "disconnecting") continue;
    const z = razlogZdravlja(veza, sada);
    if (najgora === null || TEZINA[z.stanje] > TEZINA[najgora.zdravlje.stanje]) {
      najgora = { veza, zdravlje: z };
    }
  }
  return najgora;
}
