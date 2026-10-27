/**
 * ============================================================================
 * SLEDEĆI KORAK — jedno pravilo za server i ekran (ULTRA-PLAN §4, tačke 5–8)
 * ============================================================================
 *
 * Fajl ne uvozi ništa serversko, pa ga koriste i Convex funkcije (`listOverdue`,
 * filteri, zvono) i komponente (`lead-urgency.ts`, `use-zovi-sada.ts`). Dve
 * kopije pravila „šta je zaostalo" su dale dva broja za istu stvar: jezičak je
 * brojao jedno, a zvono drugo.
 *
 * - Zatvoren posao (Dobijen, Izgubljen, Odložen) nema korak, ni kad je stari
 *   rok ostao upisan u bazi pre nego što je `setStage` počeo da ga briše.
 * - „Zovi sada" je red PRVIH poziva: firma sa dogovorenim korakom (pre ili
 *   posle roka) čeka u „Vrati se na", ne u oba reda.
 */

export const ZATVORENE_FAZE = ["dobijen", "izgubljen", "odlozen"] as const;

export function jeZatvorenaFaza(stage: string): boolean {
  return (ZATVORENE_FAZE as readonly string[]).includes(stage);
}

type SaKorakom = { stage: string; nextActionAt?: number };

/** Rok koraka koji važi, ili `undefined` kad koraka nema ili je posao zatvoren. */
export function rokKoraka(a: SaKorakom): number | undefined {
  if (a.nextActionAt === undefined || jeZatvorenaFaza(a.stage)) return undefined;
  return a.nextActionAt;
}

export function korakKasni(a: SaKorakom, now: number): boolean {
  const rok = rokKoraka(a);
  return rok !== undefined && rok < now;
}

/**
 * Argumenti `listLeadsFiltered` za red „Zovi sada" (traka na Danas i režim
 * poziva): procena „čiji je broj" ≥ 40 %, nikad dodirnut, bez dogovorenog koraka.
 */
export const ZOVI_SADA_FILTER: {
  tel: number;
  dodir: "nikad"[];
  bezKoraka: true;
} = {
  tel: 40,
  dodir: ["nikad"],
  bezKoraka: true,
};
