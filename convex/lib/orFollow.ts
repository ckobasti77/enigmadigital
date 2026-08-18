/**
 * Pure helpers for the OpenReply follow gate. No Convex imports.
 *
 * The gate is one question asked before the payload goes out: does this person
 * follow the account? If not, they get a prompt with a single button instead of
 * the message they asked for, and the real message only after they tap it.
 *
 * Two rules the whole feature hangs on:
 *  - The answer comes from GET /{IGSID}?fields=is_user_follow_business, which
 *    needs `instagram_business_manage_messages`. When Instagram will not answer
 *    (no conversation yet, missing scope, rate limit) the state is UNKNOWN, and
 *    unknown always sends the real message. A gate that cannot verify must not
 *    hold the lead hostage — the alternative is an endless "zaprati" loop.
 *  - The tap that reopens the gate carries a payload with a FIXED key
 *    (`or:<automationId>:follow`, see lib/orButtons.ts), so it is recognisable
 *    without being stored on the automation like a real button.
 */

/**
 * How long a "follows" answer is trusted before asking Instagram again. Short
 * on purpose: the gate is about a state the person changes deliberately, and a
 * tap on the gate button always forces a live check regardless of this.
 */
export const FOLLOW_STATE_TTL_MS = 10 * 60 * 1000;

/** Sent when the automation has the gate on and nothing else is written. */
export const FOLLOW_PROMPT_MESSAGE_DEFAULT =
  "Još jedan korak: zaprati nalog i klikni na dugme ispod — poruka stiže odmah.";

/** Fits Instagram's 20-character button title. */
export const FOLLOW_PROMPT_BUTTON_LABEL_DEFAULT = "Zapratio/la sam";

/** True when a cached answer is still young enough to send on. */
export function isFollowStateFresh(
  checkedAt: number | undefined,
  now: number,
): boolean {
  return checkedAt !== undefined && now - checkedAt < FOLLOW_STATE_TTL_MS;
}

interface RawMessagingUserProfile {
  id?: string;
  username?: string;
  is_user_follow_business?: boolean;
  is_business_follow_user?: boolean;
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

/**
 * Read the follow state out of a user-profile response.
 *
 * `follows` is null whenever Instagram did not actually say — a missing field
 * is not a "no". The username rides along because this is the only place the
 * DM path learns the handle of someone who tapped rather than wrote.
 */
export function extractFollowState(body: unknown): {
  follows: boolean | null;
  username?: string;
} {
  if (typeof body !== "object" || body === null) {
    return { follows: null };
  }
  const profile = body as RawMessagingUserProfile;
  const username =
    typeof profile.username === "string" && profile.username.length > 0
      ? profile.username
      : undefined;

  return {
    follows:
      typeof profile.is_user_follow_business === "boolean"
        ? profile.is_user_follow_business
        : null,
    username,
  };
}
