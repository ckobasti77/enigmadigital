/**
 * Pure helpers for OpenReply message buttons and quick replies.
 * No Convex imports.
 *
 * Two ways to offer the same choice, both delivered on /{IG_PRO_ID}/messages:
 *  - buttons      → an attached button template (max 3, sticks to the message)
 *  - quickReplies → chips above the composer (max 13, disappear once tapped)
 * A message carries one or the other, never both — see orAutomationsApi.
 */

import { generateSlug } from "./orLink";

// ── Meta limits ──────────────────────────────────────────────────────────────
/** A button template accepts at most 3 buttons. */
export const BUTTONS_MAX = 3;
/** A message accepts at most 13 quick replies. */
export const QUICK_REPLIES_MAX = 13;
/** Both a button and a quick reply cut their title at 20 characters. */
export const BUTTON_TITLE_MAX = 20;
/** The button template's own text field is shorter than a plain DM. */
export const TEMPLATE_TEXT_MAX = 640;
/** A plain DM body. */
export const MESSAGE_TEXT_MAX = 1000;

const PAYLOAD_PREFIX = "or";
const PAYLOAD_SEPARATOR = ":";

/**
 * Reserved key for the follow gate's button (`or:<automationId>:follow`).
 *
 * Fixed rather than random because that button is never stored on the
 * automation — it is built at send time — so the tap has to be recognisable
 * from the payload alone. `generateSlug` only ever emits 7 characters, so a
 * minted payload can never collide with it.
 */
export const FOLLOW_PAYLOAD_KEY = "follow";

export interface OutgoingButton {
  label: string;
  type: "url" | "postback";
  url?: string;
  payload?: string;
}

export interface OutgoingQuickReply {
  label: string;
  payload?: string;
}

export interface OutgoingAttachment {
  type: "image" | "video" | "audio" | "file" | "like_heart";
  url?: string;
}

// ── Postback payloads ────────────────────────────────────────────────────────

/**
 * Mint a payload that names the automation it belongs to: `or:<id>:<key>`.
 *
 * Self-locating on purpose — a tap arriving days later resolves with a single
 * `db.get` instead of scanning every automation for a matching button, and the
 * random key survives the operator reordering or renaming the buttons.
 */
export function buildPostbackPayload(automationId: string): string {
  return [PAYLOAD_PREFIX, automationId, generateSlug()].join(PAYLOAD_SEPARATOR);
}

/**
 * Mint the payload for the follow gate's button. Same shape as a normal
 * postback payload, but with the reserved key instead of a random one — the
 * gate button lives nowhere except in the message it was sent with.
 */
export function buildFollowPayload(automationId: string): string {
  return [PAYLOAD_PREFIX, automationId, FOLLOW_PAYLOAD_KEY].join(
    PAYLOAD_SEPARATOR,
  );
}

/**
 * Read the automation id back out of a payload, or null when the string is not
 * one of ours (a hand-written payload, or one from another tool entirely).
 */
export function parsePostbackPayload(
  payload: string,
): { automationId: string; key: string } | null {
  const parts = payload.split(PAYLOAD_SEPARATOR);
  if (parts.length !== 3) return null;
  const [prefix, automationId, key] = parts;
  if (prefix !== PAYLOAD_PREFIX) return null;
  if (automationId.length === 0 || key.length === 0) return null;
  return { automationId, key };
}

// ── Graph API message body ───────────────────────────────────────────────────

interface GraphButton {
  type: "web_url" | "postback";
  title: string;
  url?: string;
  payload?: string;
}

interface GraphQuickReply {
  content_type: "text";
  title: string;
  payload: string;
}

function formatQuickReplies(
  quickReplies?: OutgoingQuickReply[],
): GraphQuickReply[] {
  return (quickReplies ?? [])
    .slice(0, QUICK_REPLIES_MAX)
    .flatMap((quickReply): GraphQuickReply[] => {
      const title = quickReply.label.trim().slice(0, BUTTON_TITLE_MAX);
      const payload = (quickReply.payload?.trim() || title).slice(0, 1000);
      if (title.length === 0) return [];
      return [{ content_type: "text", title, payload }];
    });
}

/**
 * Build the `message` object for POST /{IG_PRO_ID}/messages.
 *
 * Supports plain text, attachments (image, video, audio, pdf, sticker),
 * button templates, and quick replies.
 * Everything is clamped to Meta's limits here rather than trusted from the
 * caller, so an automation or input cannot produce a request Instagram rejects.
 */
export function buildOutgoingMessage(params: {
  text?: string;
  buttons?: OutgoingButton[];
  quickReplies?: OutgoingQuickReply[];
  attachment?: OutgoingAttachment;
}): Record<string, unknown> {
  const formattedQuickReplies = formatQuickReplies(params.quickReplies);

  // 1. Prilozi (Attachment: image, video, audio, file/PDF, like_heart)
  if (params.attachment) {
    const { type, url } = params.attachment;
    if (type === "like_heart") {
      const msg: Record<string, unknown> = {
        attachment: { type: "like_heart" },
      };
      if (formattedQuickReplies.length > 0) {
        msg.quick_replies = formattedQuickReplies;
      }
      return msg;
    }
    if (url && url.trim().length > 0) {
      const msg: Record<string, unknown> = {
        attachment: {
          type,
          payload: { url: url.trim(), is_reusable: false },
        },
      };
      if (formattedQuickReplies.length > 0) {
        msg.quick_replies = formattedQuickReplies;
      }
      return msg;
    }
  }

  // 2. Dugmad (Buttons)
  const buttons = (params.buttons ?? [])
    .slice(0, BUTTONS_MAX)
    .flatMap((button): GraphButton[] => {
      const title = button.label.trim().slice(0, BUTTON_TITLE_MAX);
      if (title.length === 0) return [];

      if (button.type === "url") {
        const url = button.url?.trim();
        if (!url) return [];
        return [{ type: "web_url", url, title }];
      }

      const payload = button.payload?.trim();
      if (!payload) return [];
      return [{ type: "postback", title, payload }];
    });

  const hasButtons = buttons.length > 0;
  const rawText = params.text ?? "";
  const text = rawText.slice(
    0,
    hasButtons ? TEMPLATE_TEXT_MAX : MESSAGE_TEXT_MAX,
  );

  const message: Record<string, unknown> = hasButtons
    ? {
        attachment: {
          type: "template",
          payload: { template_type: "button", text, buttons },
        },
      }
    : { text };

  if (formattedQuickReplies.length > 0) {
    message.quick_replies = formattedQuickReplies;
  }

  return message;
}

