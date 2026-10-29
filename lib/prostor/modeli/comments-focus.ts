// Preneto iz Devotion apps/web/components/workspace/task-page/comments-focus.ts (main @ c05c40f), SPAJANJE S12.
/**
 * „Svi komentari" iz panela zadatka vodi na punu stranu zadatka i traži da se
 * Komentari dovedu u vidno polje (K07 §5.7, `#komentari`). Ruta ne nosi taj
 * podatak (tekst u adresi bi preživeo svaku sledeću navigaciju), pa se zahtev
 * drži u memoriji i ističe ako strana ne stigne da ga potroši.
 */
const COMMENTS_FOCUS_TTL_MS = 10_000;

let pending: { pageId: string; at: number } | null = null;

export function requestCommentsFocus(pageId: string, now: number = Date.now()): void {
  pending = { pageId, at: now };
}

/** `true` samo jednom po zahtevu i samo dok ne istekne; strana zadatka ga troši pri učitavanju. */
export function consumeCommentsFocus(pageId: string, now: number = Date.now()): boolean {
  const request = pending;
  if (request === null || request.pageId !== pageId) return false;
  pending = null;
  return now - request.at <= COMMENTS_FOCUS_TTL_MS;
}

/** Samo za testove. */
export function resetCommentsFocus(): void {
  pending = null;
}
