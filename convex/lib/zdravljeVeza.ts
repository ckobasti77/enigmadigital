/**
 * ============================================================================
 * ZDRAVLJE VEZA PROJEKTA — jedna tačka u biraču projekta (plan C02 §8.3)
 * ============================================================================
 *
 * Čista funkcija: ne čita bazu ni sat (vreme dolazi od pozivaoca). Pragovi su
 * isti kao na ekranima koji isto pitanje postavljaju po vezi:
 *   - token ističe za manje od 14 dana (`lib/token-expiry.ts`);
 *   - podaci su stari kad posle 24 h nije stiglo ništa
 *     (`lib/channel-readiness.ts`);
 *   - prolaz koji „radi“ duže od 15 minuta je zaglavljen (`sync.ts`, zvono).
 *
 * Pravila (najgore stanje pobeđuje):
 *   greška       veza `error` ili `expired`, ili je poslednji prolaz pao, a
 *                posle njega nije stiglo ništa svežije (isto kao zvono);
 *   upozorenje   token ističe uskoro, prolaz je zaglavljen, ili se veza
 *                sinhronizuje, a ništa nije stiglo duže od praga;
 *   ok           bar jedna veza, bez ičega od navedenog;
 *   bez_veza     nijedna veza (veza u prekidu se ne broji).
 *
 * Veza bez ijednog prolaza (nova, ili se ne sinhronizuje po rasporedu) ne
 * diže upozorenje zbog starosti: to nije zastoj nego odsustvo podatka.
 */

export type ZdravljeVeza = "ok" | "upozorenje" | "greska" | "bez_veza";

const SAT = 60 * 60 * 1000;

/**
 * Isti pragovi kao na frontu, preslikani jer Convex ne uvozi `lib/` aplikacije
 * (`@/` putanje). `lib/zdravlje-veza.test.ts` proverava da su jednaki.
 */
export const TOKEN_ISTICE_MS = 14 * 24 * SAT; // TOKEN_EXPIRY_WARNING_MS
export const PODACI_STARI_MS = 24 * SAT; // SYNC_FRESH_MS
export const ZAGLAVLJEN_MS = 15 * 60 * 1000; // ZASTAO_MS (sync.ts, zvono)

export type VezaZaZdravlje = {
  status: "active" | "error" | "expired" | "disconnecting";
  expiresAt?: number;
  lastSyncAt?: number;
  /** Poslednji prolaz sinhronizacije tog provajdera, ako postoji. */
  poslednjiProlaz: {
    status: "running" | "ok" | "error";
    startedAt: number;
    finishedAt?: number;
  } | null;
};

const TEZINA: Record<ZdravljeVeza, number> = {
  bez_veza: 0,
  ok: 1,
  upozorenje: 2,
  greska: 3,
};

function zdravljeVeze(veza: VezaZaZdravlje, sada: number): Exclude<ZdravljeVeza, "bez_veza"> {
  if (veza.status === "error" || veza.status === "expired") return "greska";

  const prolaz = veza.poslednjiProlaz;
  if (prolaz !== null && prolaz.status === "error") {
    const kad = prolaz.finishedAt ?? prolaz.startedAt;
    // Prolaz je pao, ali je posle njega nešto ipak stiglo → kvar je prošao.
    if ((veza.lastSyncAt ?? 0) <= kad) return "greska";
  }

  if (veza.expiresAt !== undefined && veza.expiresAt - sada < TOKEN_ISTICE_MS) {
    return "upozorenje";
  }
  if (prolaz !== null && prolaz.status === "running") {
    // Prolaz u toku nije zastoj dok ne pređe prag; starost podataka tada
    // ne meri ništa (prvo povezivanje još nema `lastSyncAt`).
    return prolaz.startedAt < sada - ZAGLAVLJEN_MS ? "upozorenje" : "ok";
  }
  if (prolaz !== null) {
    const poslednjiPodatak = Math.max(
      veza.lastSyncAt ?? 0,
      prolaz.status === "ok" ? (prolaz.finishedAt ?? prolaz.startedAt) : 0,
    );
    if (poslednjiPodatak < sada - PODACI_STARI_MS) return "upozorenje";
  }
  return "ok";
}

export function zdravljeProjekta(veze: readonly VezaZaZdravlje[], sada: number): ZdravljeVeza {
  let najgore: ZdravljeVeza = "bez_veza";
  for (const veza of veze) {
    if (veza.status === "disconnecting") continue;
    const z = zdravljeVeze(veza, sada);
    if (TEZINA[z] > TEZINA[najgore]) najgore = z;
  }
  return najgore;
}
