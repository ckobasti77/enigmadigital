/**
 * Pure helpers for the OpenReply follow-up message. No Convex imports.
 *
 * Not to be confused with lib/orFollow.ts: that one is the gate that asks
 * someone to FOLLOW the account. This one is the second message sent a while
 * AFTER the first one — a nudge to whoever did not answer.
 *
 * The delay is capped below Instagram's 24h messaging window on purpose. A
 * follow-up scheduled past it could never be delivered, so the cap turns a
 * guaranteed drop into a message that at least has a chance; the window is
 * still re-checked at fire time (orSend.queueFollowUp), because the clock runs
 * from the person's last message, not from ours.
 */

/** A follow-up may not arrive sooner than this. */
export const FOLLOW_UP_DELAY_MIN_MINUTES = 1;

/** One hour of headroom under the 24h window. */
export const FOLLOW_UP_DELAY_MAX_MINUTES = 23 * 60;

/** What the editor offers when the operator switches the follow-up on. */
export const FOLLOW_UP_DELAY_DEFAULT_MINUTES = 60;

/** Clamp whatever is stored on the row into a delay we can actually schedule. */
export function followUpDelayMinutes(raw: number | undefined): number {
  const minutes = Math.round(raw ?? FOLLOW_UP_DELAY_DEFAULT_MINUTES);
  if (!Number.isFinite(minutes)) {
    return FOLLOW_UP_DELAY_DEFAULT_MINUTES;
  }
  return Math.min(
    FOLLOW_UP_DELAY_MAX_MINUTES,
    Math.max(FOLLOW_UP_DELAY_MIN_MINUTES, minutes),
  );
}

/** The same delay in milliseconds, ready for `ctx.scheduler.runAfter`. */
export function followUpDelayMs(raw: number | undefined): number {
  return followUpDelayMinutes(raw) * 60_000;
}

/** "45 min", "1 h", "1 h 30 min" — compact enough for a card badge. */
export function formatFollowUpDelay(raw: number | undefined): string {
  const minutes = followUpDelayMinutes(raw);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}
