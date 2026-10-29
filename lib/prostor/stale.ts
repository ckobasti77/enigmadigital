// Preneto iz Devotion packages/shared/src/stale.ts (main @ c05c40f), SPAJANJE S02.
/**
 * „Zastarelo” (PROSTOR P10) — otvoren zadatak čiji je rok prošao pre više od 14
 * dana. ČISTO: bez React-a i bez Convex tipova, ista funkcija za web i telefon
 * trijažu (njihove grupe Gori/Danas/… i Prekoračeno/Danas/… ostaju različite,
 * „Zastarelo” se izdvaja iz obe istom logikom). Računa se po kalendarskim
 * danima u lokalnoj zoni, ne po 24 h, pa ponoć i prelaz na zimsko vreme ne
 * pomeraju granicu. Upiti ne čitaju sat — klijent šalje `now`.
 */
import { dayDiff } from "./dates";

/** Zadatak je zastareo tek kad je rok stariji od ovoliko kalendarskih dana. */
export const STALE_AFTER_DAYS = 14;

/**
 * Rok je stariji od `STALE_AFTER_DAYS` dana: 14 dana unazad još nije zastarelo,
 * 15 jeste. Bez roka nikad nije zastarelo.
 */
export function isStale(
  dueDate: number | null,
  now: number,
  zone?: string,
): boolean {
  return dueDate !== null && dayDiff(dueDate, now, zone) < -STALE_AFTER_DAYS;
}

type StaleCandidate = { dueDate: number | null; taskStatus?: string | null };

/** Zastareo je samo otvoren zadatak: završen (`done`) nikad nije zastareo. */
export function isStaleTask(
  task: StaleCandidate,
  now: number,
  zone?: string,
): boolean {
  return task.taskStatus !== "done" && isStale(task.dueDate, now, zone);
}

/** Deli zadatke na sveže i zastarele; redosled u obe grupe se čuva. */
export function splitStale<T extends StaleCandidate>(
  items: readonly T[],
  now: number,
  zone?: string,
): { fresh: T[]; stale: T[] } {
  const fresh: T[] = [];
  const stale: T[] = [];
  for (const item of items) {
    (isStaleTask(item, now, zone) ? stale : fresh).push(item);
  }
  return { fresh, stale };
}
