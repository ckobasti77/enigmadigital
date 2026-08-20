import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { normalizeKeyword } from "./lib/orMatch";
import { shortLinkOrigin } from "./lib/orLink";
import {
  BUTTONS_MAX,
  BUTTON_TITLE_MAX,
  QUICK_REPLIES_MAX,
  TEMPLATE_TEXT_MAX,
  buildPostbackPayload,
  parsePostbackPayload,
} from "./lib/orButtons";
import {
  automationPlatformValidator,
  orPlatformValidator,
  resolveAutomationPlatform,
  resolvePlatform,
  type AutomationPlatform,
} from "./lib/orPlatform";
import {
  FOLLOW_UP_DELAY_DEFAULT_MINUTES,
  FOLLOW_UP_DELAY_MAX_MINUTES,
  FOLLOW_UP_DELAY_MIN_MINUTES,
} from "./lib/orFollowUp";

/**
 * Public API for the OpenReply automations screen (PLAN.md §4 / Step 5).
 *
 * Default V8 runtime — no "use node". Every function is workspace-scoped via
 * `requireMembership`; nothing here trusts a `workspaceId` from the client.
 *
 * Any write that changes what an automation *is* (name, keywords, active flag)
 * or that removes one re-runs `orRollup.recompute` for it, because the
 * OpenReply dashboard reads `orCampaignStats`, not `orAutomations`.
 */

// ── Limits ───────────────────────────────────────────────────────────────────
// Instagram caps a DM at ~1000 characters and composeDmMessage appends the link
// block on top of the base message, so the base is capped lower.
const NAME_MAX = 80;
const KEYWORDS_MAX = 20;
const KEYWORD_MAX = 60;
const DM_MESSAGE_MAX = 900;
const PUBLIC_REPLY_MAX = 280;
const LINK_LABEL_MAX = 60;
const LINK_URL_MAX = 1000;
const POST_ID_MAX = 60;

const DM_LOG_LIMIT_DEFAULT = 100;
const DM_LOG_LIMIT_MAX = 200;

const automationTriggerValidator = v.union(
  v.literal("comment"),
  v.literal("dm"),
  v.literal("both"),
);

const dmLogStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped_no_match"),
  v.literal("skipped_window"),
  v.literal("awaiting_follow"),
);

const dmLogSourceValidator = v.union(
  v.literal("comment"),
  v.literal("dm"),
  v.literal("postback"),
);

const dmLogKindValidator = v.union(v.literal("primary"), v.literal("followup"));

const buttonInputValidator = v.object({
  label: v.string(),
  type: v.union(v.literal("url"), v.literal("postback")),
  url: v.optional(v.string()),
  payload: v.optional(v.string()),
  replyMessage: v.optional(v.string()),
});

const quickReplyInputValidator = v.object({
  label: v.string(),
  payload: v.optional(v.string()),
  replyMessage: v.optional(v.string()),
});

/** Everything the editor dialog sends, for both create and update. */
const automationInputValidator = v.object({
  name: v.string(),
  // Optional on the wire so an older client keeps working; undefined is the
  // documented default, "instagram".
  platform: v.optional(automationPlatformValidator),
  // Optional on the wire so an older client keeps working; undefined is the
  // documented default, "comment".
  trigger: v.optional(automationTriggerValidator),
  keywords: v.array(v.string()),
  matchAnyWord: v.boolean(),
  wholeWordMatch: v.boolean(),
  matchAnyPost: v.boolean(),
  postId: v.optional(v.string()),
  dmMessage: v.string(),
  linkUrl: v.optional(v.string()),
  linkLabel: v.optional(v.string()),
  publicReplyEnabled: v.boolean(),
  publicReplyMessage: v.optional(v.string()),
  // Optional on the wire: an older client sends neither and keeps working.
  buttons: v.optional(v.array(buttonInputValidator)),
  quickReplies: v.optional(v.array(quickReplyInputValidator)),
  // The follow gate. Both texts are optional even with the gate on — the send
  // path falls back to the defaults in lib/orFollow.ts.
  requireFollow: v.optional(v.boolean()),
  followPromptMessage: v.optional(v.string()),
  followPromptButtonLabel: v.optional(v.string()),
  // The delayed second message. The delay is optional even with the follow-up
  // on — undefined means the default hour.
  followUpEnabled: v.optional(v.boolean()),
  followUpMessage: v.optional(v.string()),
  followUpDelayMinutes: v.optional(v.number()),
  isActive: v.boolean(),
});

type AutomationButton = {
  label: string;
  type: "url" | "postback";
  url?: string;
  payload?: string;
  replyMessage?: string;
};

type AutomationQuickReply = {
  label: string;
  payload?: string;
  replyMessage?: string;
};

type AutomationInput = {
  name: string;
  platform?: AutomationPlatform;
  trigger?: "comment" | "dm" | "both";
  keywords: string[];
  matchAnyWord: boolean;
  wholeWordMatch: boolean;
  matchAnyPost: boolean;
  postId?: string;
  dmMessage: string;
  linkUrl?: string;
  linkLabel?: string;
  publicReplyEnabled: boolean;
  publicReplyMessage?: string;
  buttons?: AutomationButton[];
  quickReplies?: AutomationQuickReply[];
  requireFollow?: boolean;
  followPromptMessage?: string;
  followPromptButtonLabel?: string;
  followUpEnabled?: boolean;
  followUpMessage?: string;
  followUpDelayMinutes?: number;
  isActive: boolean;
};

function invalid(message: string): never {
  throw new ConvexError({ code: "invalid_argument", message });
}

function optionalText(
  raw: string | undefined,
  max: number,
  label: string,
): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    invalid(`${label} može imati najviše ${max} karaktera.`);
  }
  return trimmed;
}

/** Instagram only opens a full http(s) address, on a link or on a button. */
function requireHttpUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    invalid(`${label} mora biti puna adresa, npr. https://enigmait.rs/ponuda.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    invalid(`${label} mora počinjati sa http:// ili https://.`);
  }
}

/**
 * Trim and validate the tappable part of the message. A message carries either
 * buttons or quick replies, never both — they are two renderings of the same
 * choice, and sending a template with chips attached is asking Instagram to
 * reject the whole message.
 *
 * Payloads are NOT minted here: the automation id they have to name only exists
 * after the insert, so `mintButtonPayloads` fills them in right afterwards.
 */
function normalizeTapTargets(input: AutomationInput): {
  buttons: AutomationButton[];
  quickReplies: AutomationQuickReply[];
} {
  const buttons: AutomationButton[] = [];
  for (const raw of input.buttons ?? []) {
    const label = raw.label.trim();
    if (label.length === 0) continue;
    if (label.length > BUTTON_TITLE_MAX) {
      invalid(
        `Natpis na dugmetu može imati najviše ${BUTTON_TITLE_MAX} karaktera.`,
      );
    }

    if (raw.type === "url") {
      const url = optionalText(raw.url, LINK_URL_MAX, "Link na dugmetu");
      if (url === undefined) {
        invalid(`Unesi link za dugme „${label}”.`);
      }
      requireHttpUrl(url, "Link na dugmetu");
      buttons.push({ label, type: "url", url });
      continue;
    }

    const replyMessage = optionalText(
      raw.replyMessage,
      DM_MESSAGE_MAX,
      "Odgovor na dugme",
    );
    if (replyMessage === undefined) {
      invalid(`Unesi poruku koja se šalje kada neko klikne na „${label}”.`);
    }
    buttons.push({
      label,
      type: "postback",
      payload: raw.payload,
      replyMessage,
    });
  }
  if (buttons.length > BUTTONS_MAX) {
    invalid(`Poruka može imati najviše ${BUTTONS_MAX} dugmadi.`);
  }

  const quickReplies: AutomationQuickReply[] = [];
  for (const raw of input.quickReplies ?? []) {
    const label = raw.label.trim();
    if (label.length === 0) continue;
    if (label.length > BUTTON_TITLE_MAX) {
      invalid(
        `Natpis brzog odgovora može imati najviše ${BUTTON_TITLE_MAX} karaktera.`,
      );
    }

    const replyMessage = optionalText(
      raw.replyMessage,
      DM_MESSAGE_MAX,
      "Odgovor na brzi odgovor",
    );
    if (replyMessage === undefined) {
      invalid(`Unesi poruku koja se šalje kada neko izabere „${label}”.`);
    }
    quickReplies.push({ label, payload: raw.payload, replyMessage });
  }
  if (quickReplies.length > QUICK_REPLIES_MAX) {
    invalid(`Poruka može imati najviše ${QUICK_REPLIES_MAX} brzih odgovora.`);
  }

  if (buttons.length > 0 && quickReplies.length > 0) {
    invalid("Poruka može imati ili dugmad ili brze odgovore, ne oboje.");
  }

  return { buttons, quickReplies };
}

/**
 * How long after the first message the follow-up goes out. Capped at 23h
 * rather than 24 because Instagram's window runs from the person's LAST
 * message, which is already older than the DM we are answering with.
 */
function normalizeFollowUpDelay(raw: number | undefined): number {
  const minutes = Math.round(raw ?? FOLLOW_UP_DELAY_DEFAULT_MINUTES);
  if (
    !Number.isFinite(minutes) ||
    minutes < FOLLOW_UP_DELAY_MIN_MINUTES ||
    minutes > FOLLOW_UP_DELAY_MAX_MINUTES
  ) {
    invalid(
      `Kašnjenje naknadne poruke mora biti između ${FOLLOW_UP_DELAY_MIN_MINUTES} i ${FOLLOW_UP_DELAY_MAX_MINUTES} minuta (23 sata).`,
    );
  }
  return minutes;
}

/**
 * Trim, validate and normalize the editor payload into exactly the shape the
 * `orAutomations` row stores. Keywords come out lowercased, folded and
 * deduplicated (`normalizeKeyword`), which is what the matcher expects.
 */
function normalizeAutomationInput(input: AutomationInput): AutomationInput {
  const name = input.name.trim();
  if (name.length === 0) {
    invalid("Unesi naziv automatizacije.");
  }
  if (name.length > NAME_MAX) {
    invalid(`Naziv može imati najviše ${NAME_MAX} karaktera.`);
  }

  const keywords: string[] = [];
  for (const raw of input.keywords) {
    const keyword = normalizeKeyword(raw);
    if (keyword.length === 0) continue;
    if (keyword.length > KEYWORD_MAX) {
      invalid(`Ključna reč može imati najviše ${KEYWORD_MAX} karaktera.`);
    }
    if (!keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  }
  if (keywords.length === 0) {
    invalid("Dodaj bar jednu ključnu reč.");
  }
  if (keywords.length > KEYWORDS_MAX) {
    invalid(`Automatizacija može imati najviše ${KEYWORDS_MAX} ključnih reči.`);
  }

  const dmMessage = input.dmMessage.trim();
  if (dmMessage.length === 0) {
    invalid("Unesi tekst poruke koja se šalje u DM.");
  }
  if (dmMessage.length > DM_MESSAGE_MAX) {
    invalid(`Poruka može imati najviše ${DM_MESSAGE_MAX} karaktera.`);
  }

  // The button template's own text field is shorter than a plain DM.
  const { buttons, quickReplies } = normalizeTapTargets(input);
  if (buttons.length > 0 && dmMessage.length > TEMPLATE_TEXT_MAX) {
    invalid(
      `Kada poruka ima dugmad, tekst može imati najviše ${TEMPLATE_TEXT_MAX} karaktera.`,
    );
  }

  const trigger = input.trigger ?? "comment";

  const postId = optionalText(input.postId, POST_ID_MAX, "ID objave");
  // Post scope and the public reply only exist on the comment path — a DM has
  // no post and no comment behind it.
  if (trigger !== "dm" && !input.matchAnyPost && postId === undefined) {
    invalid("Unesi ID objave ili uključi opciju „Sve objave”.");
  }

  const linkUrl = optionalText(input.linkUrl, LINK_URL_MAX, "Link");
  if (linkUrl !== undefined) {
    requireHttpUrl(linkUrl, "Link");
  }

  const followUpEnabled = input.followUpEnabled ?? false;
  const followUpMessage = optionalText(
    input.followUpMessage,
    DM_MESSAGE_MAX,
    "Naknadna poruka",
  );
  if (followUpEnabled && followUpMessage === undefined) {
    invalid("Unesi tekst naknadne poruke ili isključi naknadnu poruku.");
  }

  const publicReplyEnabled =
    trigger === "dm" ? false : input.publicReplyEnabled;
  const publicReplyMessage = optionalText(
    input.publicReplyMessage,
    PUBLIC_REPLY_MAX,
    "Javni odgovor",
  );
  if (publicReplyEnabled && publicReplyMessage === undefined) {
    invalid("Unesi tekst javnog odgovora ili isključi javni odgovor.");
  }

  return {
    name,
    platform: resolveAutomationPlatform(input.platform),
    trigger,
    keywords,
    matchAnyWord: input.matchAnyWord,
    wholeWordMatch: input.wholeWordMatch,
    matchAnyPost: input.matchAnyPost,
    postId: input.matchAnyPost ? undefined : postId,
    dmMessage,
    linkUrl,
    linkLabel: optionalText(input.linkLabel, LINK_LABEL_MAX, "Naziv linka"),
    publicReplyEnabled,
    publicReplyMessage: publicReplyEnabled ? publicReplyMessage : undefined,
    buttons,
    quickReplies,
    // The gate's prompt always ships with a button, so its text lives under the
    // button template's shorter limit, not the plain-DM one. Empty is allowed
    // and means "use the default" — the toggle alone is a working gate.
    requireFollow: input.requireFollow ?? false,
    followPromptMessage: optionalText(
      input.followPromptMessage,
      TEMPLATE_TEXT_MAX,
      "Poruka za praćenje",
    ),
    followPromptButtonLabel: optionalText(
      input.followPromptButtonLabel,
      BUTTON_TITLE_MAX,
      "Natpis na dugmetu za praćenje",
    ),
    // The follow-up is sent as plain text — no buttons ride along — so it gets
    // the full DM limit, and it is nothing without a text to send.
    followUpEnabled,
    followUpMessage: followUpEnabled ? followUpMessage : undefined,
    followUpDelayMinutes: followUpEnabled
      ? normalizeFollowUpDelay(input.followUpDelayMinutes)
      : undefined,
    isActive: input.isActive,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

const automationViewValidator = v.object({
  _id: v.id("orAutomations"),
  name: v.string(),
  platform: automationPlatformValidator,
  trigger: automationTriggerValidator,
  keywords: v.array(v.string()),
  matchAnyWord: v.boolean(),
  wholeWordMatch: v.boolean(),
  matchAnyPost: v.boolean(),
  postId: v.union(v.string(), v.null()),
  dmMessage: v.string(),
  linkUrl: v.union(v.string(), v.null()),
  linkLabel: v.union(v.string(), v.null()),
  publicReplyEnabled: v.boolean(),
  publicReplyMessage: v.union(v.string(), v.null()),
  // `payload` rides back out to the editor and in again on save: it is the
  // identity of a button already delivered in a DM, and re-minting it would
  // silently break every one of those.
  buttons: v.array(
    v.object({
      label: v.string(),
      type: v.union(v.literal("url"), v.literal("postback")),
      url: v.union(v.string(), v.null()),
      payload: v.union(v.string(), v.null()),
      replyMessage: v.union(v.string(), v.null()),
    }),
  ),
  quickReplies: v.array(
    v.object({
      label: v.string(),
      payload: v.union(v.string(), v.null()),
      replyMessage: v.union(v.string(), v.null()),
    }),
  ),
  requireFollow: v.boolean(),
  followPromptMessage: v.union(v.string(), v.null()),
  followPromptButtonLabel: v.union(v.string(), v.null()),
  followUpEnabled: v.boolean(),
  followUpMessage: v.union(v.string(), v.null()),
  // Always a number, so the editor and the card have something to show even
  // for an automation saved before follow-ups existed.
  followUpDelayMinutes: v.number(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  // Short link already minted for this automation, ready to copy. Null when the
  // automation has no link or OR_SHORT_LINK_BASE_URL is unset on the deployment.
  trackedLinkUrl: v.union(v.string(), v.null()),
  dmsSent: v.number(),
  dmsFailed: v.number(),
  linkClicks: v.number(),
  ctr: v.number(),
});

/**
 * All automations for the caller's workspace, newest first, each joined with
 * its rolled-up counters (`orCampaignStats`, keyed by the automation id) and
 * its tracked short link.
 */
export const listAutomations = query({
  args: {},
  returns: v.array(automationViewValidator),
  handler: async (ctx) => {
    const { workspaceId } = await requireMembership(ctx);

    const automations = await ctx.db
      .query("orAutomations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const stats = await ctx.db
      .query("orCampaignStats")
      .withIndex("by_workspace_campaign", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();
    const statsById = new Map(stats.map((s) => [s.orCampaignId, s]));

    const links = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_workspace_automation", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();
    const slugById = new Map(links.map((l) => [l.automationId, l.slug]));

    const origin = shortLinkOrigin();

    return automations
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => {
        const stat = statsById.get(a._id);
        const slug = slugById.get(a._id);
        return {
          _id: a._id,
          name: a.name,
          platform: resolveAutomationPlatform(a.platform),
          trigger: a.trigger ?? "comment",
          keywords: a.keywords,
          matchAnyWord: a.matchAnyWord,
          wholeWordMatch: a.wholeWordMatch,
          matchAnyPost: a.matchAnyPost,
          postId: a.postId ?? null,
          dmMessage: a.dmMessage,
          linkUrl: a.linkUrl ?? null,
          linkLabel: a.linkLabel ?? null,
          publicReplyEnabled: a.publicReplyEnabled,
          publicReplyMessage: a.publicReplyMessage ?? null,
          buttons: (a.buttons ?? []).map((b) => ({
            label: b.label,
            type: b.type,
            url: b.url ?? null,
            payload: b.payload ?? null,
            replyMessage: b.replyMessage ?? null,
          })),
          quickReplies: (a.quickReplies ?? []).map((q) => ({
            label: q.label,
            payload: q.payload ?? null,
            replyMessage: q.replyMessage ?? null,
          })),
          requireFollow: a.requireFollow ?? false,
          followPromptMessage: a.followPromptMessage ?? null,
          followPromptButtonLabel: a.followPromptButtonLabel ?? null,
          followUpEnabled: a.followUpEnabled ?? false,
          followUpMessage: a.followUpMessage ?? null,
          followUpDelayMinutes:
            a.followUpDelayMinutes ?? FOLLOW_UP_DELAY_DEFAULT_MINUTES,
          isActive: a.isActive,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          trackedLinkUrl:
            origin !== null && slug !== undefined
              ? `${origin}/r/${slug}`
              : null,
          dmsSent: stat?.dmsSent ?? 0,
          dmsFailed: stat?.dmsFailed ?? 0,
          linkClicks: stat?.linkClicks ?? 0,
          ctr: stat?.ctr ?? 0,
        };
      });
  },
});

const dmLogViewValidator = v.object({
  _id: v.id("orDmLogs"),
  platform: orPlatformValidator,
  source: dmLogSourceValidator,
  kind: dmLogKindValidator,
  automationId: v.union(v.id("orAutomations"), v.null()),
  automationName: v.union(v.string(), v.null()),
  commentId: v.string(),
  mediaId: v.union(v.string(), v.null()),
  commenterId: v.string(),
  commenterUsername: v.union(v.string(), v.null()),
  /** Resolved from `igComments` / `fbComments` where there is a row (V3). */
  commentText: v.string(),
  /** When moderation marked that comment deleted. Null while it is still up. */
  commentDeletedAt: v.union(v.number(), v.null()),
  matchedKeyword: v.union(v.string(), v.null()),
  status: dmLogStatusValidator,
  attempts: v.number(),
  dmSentAt: v.union(v.number(), v.null()),
  errorMessage: v.union(v.string(), v.null()),
  publicReplySentAt: v.union(v.number(), v.null()),
  publicReplyError: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

/**
 * The DM log, newest first. Optionally narrowed to one automation or one
 * status — each filter has its own index, so no full-table scan.
 */
export const listDmLogs = query({
  args: {
    automationId: v.optional(v.id("orAutomations")),
    status: v.optional(dmLogStatusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(dmLogViewValidator),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? DM_LOG_LIMIT_DEFAULT), 1),
      DM_LOG_LIMIT_MAX,
    );

    let logs;
    if (args.automationId !== undefined) {
      const automationId = args.automationId;
      const automation = await ctx.db.get(automationId);
      if (automation === null || automation.workspaceId !== workspaceId) {
        return [];
      }
      const status = args.status;
      const byAutomation = ctx.db
        .query("orDmLogs")
        .withIndex("by_automation", (q) => q.eq("automationId", automationId));
      logs = await (
        status === undefined
          ? byAutomation
          : byAutomation.filter((q) => q.eq(q.field("status"), status))
      )
        .order("desc")
        .take(limit);
    } else if (args.status !== undefined) {
      const status = args.status;
      logs = await ctx.db
        .query("orDmLogs")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", status),
        )
        .order("desc")
        .take(limit);
    } else {
      logs = await ctx.db
        .query("orDmLogs")
        .withIndex("by_workspace_created", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(limit);
    }

    // Deleting an automation keeps its log rows (history is the point), so the
    // id can dangle — resolve names once and label the misses in the UI.
    const names = new Map<Id<"orAutomations">, string>();
    for (const id of new Set(
      logs.flatMap((l) => (l.automationId ? [l.automationId] : [])),
    )) {
      const automation = await ctx.db.get(id);
      if (automation !== null) {
        names.set(id, automation.name);
      }
    }

    // The comment itself, read from the table that owns it (V3).
    //
    // `mediaId` is the marker: a row that has one came from a comment under one
    // of our posts, which means F4 wrote that comment down before the engine
    // was asked anything — so its text, and whether it has since been deleted,
    // are that row's to answer, not this one's. A DM or a button tap has no
    // `mediaId` and no comment anywhere; those keep their own text.
    //
    // Keyed by platform AND id, and asked once per key even when the answer is
    // "no such comment": a primary row and its follow-up share one comment id,
    // and a log page is 200 rows.
    const comments = new Map<string, { text: string; deletedAt?: number }>();
    const asked = new Set<string>();
    for (const l of logs) {
      if (l.mediaId === undefined) continue;
      const platform = resolvePlatform(l.platform);
      const key = `${platform}:${l.commentId}`;
      if (asked.has(key)) continue;
      asked.add(key);

      const comment =
        platform === "facebook"
          ? await ctx.db
              .query("fbComments")
              .withIndex("by_workspace_comment", (q) =>
                q.eq("workspaceId", workspaceId).eq("commentId", l.commentId),
              )
              .first()
          : await ctx.db
              .query("igComments")
              .withIndex("by_workspace_comment", (q) =>
                q.eq("workspaceId", workspaceId).eq("commentId", l.commentId),
              )
              .first();
      if (comment !== null) {
        comments.set(key, {
          text: comment.text,
          ...(comment.deletedAt !== undefined
            ? { deletedAt: comment.deletedAt }
            : {}),
        });
      }
    }

    return logs.map((l) => ({
      _id: l._id,
      platform: resolvePlatform(l.platform),
      source: l.source ?? "comment",
      kind: l.kind ?? "primary",
      automationId: l.automationId ?? null,
      automationName:
        l.automationId !== undefined
          ? (names.get(l.automationId) ?? null)
          : null,
      commentId: l.commentId,
      mediaId: l.mediaId ?? null,
      commenterId: l.commenterId,
      commenterUsername: l.commenterUsername ?? null,
      // The stored copy is the fallback, not the answer: rows written before
      // V3 still hold one, and it is only used when no comment row is there.
      commentText:
        comments.get(`${resolvePlatform(l.platform)}:${l.commentId}`)?.text ??
        l.commentText,
      commentDeletedAt:
        comments.get(`${resolvePlatform(l.platform)}:${l.commentId}`)
          ?.deletedAt ?? null,
      matchedKeyword: l.matchedKeyword ?? null,
      status: l.status,
      attempts: l.attempts,
      dmSentAt: l.dmSentAt ?? null,
      errorMessage: l.errorMessage ?? null,
      publicReplySentAt: l.publicReplySentAt ?? null,
      publicReplyError: l.publicReplyError ?? null,
      createdAt: l.createdAt,
    }));
  },
});

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Give every postback button a payload that names its automation, so a tap can
 * be resolved with a single `db.get`. Runs after the write because the id does
 * not exist before the insert.
 *
 * A payload that already points at this automation is left alone: it is sitting
 * in DMs that were delivered days ago, and those buttons have to keep working
 * after the operator renames or reorders them.
 */
async function mintButtonPayloads(
  ctx: MutationCtx,
  automationId: Id<"orAutomations">,
): Promise<void> {
  const automation = await ctx.db.get(automationId);
  if (automation === null) {
    return;
  }

  let minted = false;
  const keep = (payload: string | undefined): string => {
    if (
      payload !== undefined &&
      parsePostbackPayload(payload)?.automationId === automationId
    ) {
      return payload;
    }
    minted = true;
    return buildPostbackPayload(automationId);
  };

  const buttons = (automation.buttons ?? []).map((button) =>
    button.type === "postback"
      ? { ...button, payload: keep(button.payload) }
      : button,
  );
  const quickReplies = (automation.quickReplies ?? []).map((quickReply) => ({
    ...quickReply,
    payload: keep(quickReply.payload),
  }));

  if (minted) {
    await ctx.db.patch(automationId, { buttons, quickReplies });
  }
}

/**
 * Mint the button payloads and the short link, then refresh the rolled-up
 * campaign row.
 */
async function syncDerived(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  automationId: Id<"orAutomations">,
): Promise<void> {
  await mintButtonPayloads(ctx, automationId);
  await ctx.runMutation(internal.orLinks.ensureTrackedLink, {
    workspaceId,
    automationId,
  });
  await ctx.runMutation(internal.orRollup.recompute, {
    workspaceId,
    automationId,
  });
}

export const createAutomation = mutation({
  args: automationInputValidator.fields,
  returns: v.id("orAutomations"),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireMembership(ctx);
    const input = normalizeAutomationInput(args);
    const now = Date.now();

    const automationId = await ctx.db.insert("orAutomations", {
      workspaceId,
      ...input,
      createdAt: now,
      updatedAt: now,
    });

    await syncDerived(ctx, workspaceId, automationId);
    return automationId;
  },
});

export const updateAutomation = mutation({
  args: {
    automationId: v.id("orAutomations"),
    ...automationInputValidator.fields,
  },
  returns: v.null(),
  handler: async (ctx, { automationId, ...rest }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(automationId);
    if (existing === null || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Automatizacija nije pronađena.",
      });
    }

    const input = normalizeAutomationInput(rest);
    await ctx.db.patch(automationId, { ...input, updatedAt: Date.now() });

    await syncDerived(ctx, workspaceId, automationId);
    return null;
  },
});

export const toggleAutomation = mutation({
  args: {
    automationId: v.id("orAutomations"),
    isActive: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { automationId, isActive }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(automationId);
    if (existing === null || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Automatizacija nije pronađena.",
      });
    }

    await ctx.db.patch(automationId, { isActive, updatedAt: Date.now() });

    // `orCampaignStats.active` mirrors this flag on the dashboard.
    await ctx.runMutation(internal.orRollup.recompute, {
      workspaceId,
      automationId,
    });
    return null;
  },
});

/**
 * Remove an automation. DM logs, tracked links and click rows are deliberately
 * kept: they are history, the daily totals are computed from them, and short
 * links already sitting in DMs keep resolving. The recompute drops the
 * automation's `orCampaignStats` row, so it leaves the dashboard immediately.
 */
export const deleteAutomation = mutation({
  args: { automationId: v.id("orAutomations") },
  returns: v.null(),
  handler: async (ctx, { automationId }) => {
    const { workspaceId } = await requireMembership(ctx);
    const existing = await ctx.db.get(automationId);
    if (existing === null || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Automatizacija nije pronađena.",
      });
    }

    await ctx.db.delete(automationId);

    await ctx.runMutation(internal.orRollup.recompute, {
      workspaceId,
      automationId,
    });
    return null;
  },
});
