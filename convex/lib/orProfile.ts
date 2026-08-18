/**
 * Pure helpers for the Instagram messenger profile: ice breakers and the
 * persistent menu. No Convex imports.
 *
 * Both live on the SAME node — POST/GET/DELETE /me/messenger_profile — so one
 * request writes both, and clearing one means DELETE-ing that field by name.
 *
 * They are the cleanest legitimate way to start a conversation without waiting
 * for a comment: a tap opens the 24h messaging window and grants profile
 * consent, exactly like the person having written first. Neither renders on
 * Instagram desktop — both are a mobile-only entry point.
 */

// ── Meta limits ──────────────────────────────────────────────────────────────
/** Instagram shows at most 4 ice breaker questions on an empty thread. */
export const ICE_BREAKERS_MAX = 4;
/** A question is cut at 80 characters. */
export const ICE_BREAKER_QUESTION_MAX = 80;
/** The menu holds more, but past 5 it stops being a menu. */
export const MENU_ITEMS_MAX = 5;
/** A menu item's title is cut at 30 characters. */
export const MENU_TITLE_MAX = 30;

export interface ProfileIceBreaker {
  question: string;
  payload?: string;
}

/**
 * One row of the persistent menu. Stored with the same `"url" | "postback"`
 * vocabulary as a message button (`lib/orButtons.ts`); the Graph API's own
 * `web_url` spelling only appears in the body built below.
 */
export interface ProfileMenuItem {
  title: string;
  type: "url" | "postback";
  url?: string;
  payload?: string;
}

// ── Graph API body ───────────────────────────────────────────────────────────

interface GraphCallToAction {
  type?: "postback" | "web_url";
  title?: string;
  question?: string;
  payload?: string;
  url?: string;
  webview_height_ratio?: "full";
}

/**
 * Build the `ice_breakers` field, or null when there is nothing to show.
 *
 * Null is not the same as an empty array here: an empty array would have to be
 * POSTed to mean "no questions", and Meta clears a field through DELETE, so the
 * caller deletes the field instead. Everything is clamped to Meta's limits
 * here rather than trusted from the stored row, so a row written before a limit
 * changed cannot produce a request Instagram rejects.
 */
export function buildIceBreakersField(
  iceBreakers: ProfileIceBreaker[],
): Record<string, unknown>[] | null {
  const callToActions = iceBreakers
    .slice(0, ICE_BREAKERS_MAX)
    .flatMap((iceBreaker): GraphCallToAction[] => {
      const question = iceBreaker.question
        .trim()
        .slice(0, ICE_BREAKER_QUESTION_MAX);
      const payload = iceBreaker.payload?.trim();
      if (question.length === 0 || !payload) return [];
      return [{ question, payload }];
    });

  if (callToActions.length === 0) {
    return null;
  }
  return [{ call_to_actions: callToActions }];
}

/**
 * Build the `persistent_menu` field, or null when there is nothing to show.
 * `locale: "default"` is the only locale we write — the copy is Serbian for
 * every visitor, the same as the automations themselves.
 */
export function buildPersistentMenuField(
  menuItems: ProfileMenuItem[],
): Record<string, unknown>[] | null {
  const callToActions = menuItems
    .slice(0, MENU_ITEMS_MAX)
    .flatMap((item): GraphCallToAction[] => {
      const title = item.title.trim().slice(0, MENU_TITLE_MAX);
      if (title.length === 0) return [];

      if (item.type === "url") {
        const url = item.url?.trim();
        if (!url) return [];
        return [
          { type: "web_url", title, url, webview_height_ratio: "full" },
        ];
      }

      const payload = item.payload?.trim();
      if (!payload) return [];
      return [{ type: "postback", title, payload }];
    });

  if (callToActions.length === 0) {
    return null;
  }
  return [{ locale: "default", call_to_actions: callToActions }];
}

// ── Readback ─────────────────────────────────────────────────────────────────

interface RawProfileEntry {
  ice_breakers?: { call_to_actions?: GraphCallToAction[] }[];
  persistent_menu?: {
    locale?: string;
    call_to_actions?: GraphCallToAction[];
  }[];
}

export interface RawMessengerProfileResponse {
  data?: RawProfileEntry[];
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

/**
 * Read what Instagram actually holds right now out of a
 * GET /me/messenger_profile?fields=ice_breakers,persistent_menu response.
 *
 * Only the visible labels come back — that is all the screen needs to answer
 * "is what I saved the thing people see?", and it keeps payloads out of a
 * response that is rendered straight into the UI.
 */
export function extractProfileSummary(body: unknown): {
  iceBreakerQuestions: string[];
  menuTitles: string[];
} {
  const entries =
    typeof body === "object" && body !== null
      ? ((body as RawMessengerProfileResponse).data ?? [])
      : [];

  const iceBreakerQuestions: string[] = [];
  const menuTitles: string[] = [];

  for (const entry of entries) {
    for (const group of entry?.ice_breakers ?? []) {
      for (const cta of group?.call_to_actions ?? []) {
        if (typeof cta?.question === "string" && cta.question.length > 0) {
          iceBreakerQuestions.push(cta.question);
        }
      }
    }
    for (const group of entry?.persistent_menu ?? []) {
      for (const cta of group?.call_to_actions ?? []) {
        if (typeof cta?.title === "string" && cta.title.length > 0) {
          menuTitles.push(cta.title);
        }
      }
    }
  }

  return { iceBreakerQuestions, menuTitles };
}
