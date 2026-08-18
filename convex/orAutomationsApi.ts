import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { normalizeKeyword } from "./lib/orMatch";
import { shortLinkOrigin } from "./lib/orLink";

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

const dmLogStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped_no_match"),
  v.literal("skipped_window"),
);

/** Everything the editor dialog sends, for both create and update. */
const automationInputValidator = v.object({
  name: v.string(),
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
  isActive: v.boolean(),
});

type AutomationInput = {
  name: string;
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

  const postId = optionalText(input.postId, POST_ID_MAX, "ID objave");
  if (!input.matchAnyPost && postId === undefined) {
    invalid("Unesi ID objave ili uključi opciju „Sve objave”.");
  }

  const linkUrl = optionalText(input.linkUrl, LINK_URL_MAX, "Link");
  if (linkUrl !== undefined) {
    let parsed: URL;
    try {
      parsed = new URL(linkUrl);
    } catch {
      invalid("Link mora biti puna adresa, npr. https://enigmait.rs/ponuda.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      invalid("Link mora počinjati sa http:// ili https://.");
    }
  }

  const publicReplyMessage = optionalText(
    input.publicReplyMessage,
    PUBLIC_REPLY_MAX,
    "Javni odgovor",
  );
  if (input.publicReplyEnabled && publicReplyMessage === undefined) {
    invalid("Unesi tekst javnog odgovora ili isključi javni odgovor.");
  }

  return {
    name,
    keywords,
    matchAnyWord: input.matchAnyWord,
    wholeWordMatch: input.wholeWordMatch,
    matchAnyPost: input.matchAnyPost,
    postId: input.matchAnyPost ? undefined : postId,
    dmMessage,
    linkUrl,
    linkLabel: optionalText(input.linkLabel, LINK_LABEL_MAX, "Naziv linka"),
    publicReplyEnabled: input.publicReplyEnabled,
    publicReplyMessage: input.publicReplyEnabled
      ? publicReplyMessage
      : undefined,
    isActive: input.isActive,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

const automationViewValidator = v.object({
  _id: v.id("orAutomations"),
  name: v.string(),
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
  automationId: v.union(v.id("orAutomations"), v.null()),
  automationName: v.union(v.string(), v.null()),
  commentId: v.string(),
  mediaId: v.union(v.string(), v.null()),
  commenterId: v.string(),
  commenterUsername: v.union(v.string(), v.null()),
  commentText: v.string(),
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
      logs = await (status === undefined
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

    return logs.map((l) => ({
      _id: l._id,
      automationId: l.automationId ?? null,
      automationName:
        l.automationId !== undefined ? (names.get(l.automationId) ?? null) : null,
      commentId: l.commentId,
      mediaId: l.mediaId ?? null,
      commenterId: l.commenterId,
      commenterUsername: l.commenterUsername ?? null,
      commentText: l.commentText,
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

/** Mint / repoint the short link, then refresh the rolled-up campaign row. */
async function syncDerived(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  automationId: Id<"orAutomations">,
): Promise<void> {
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
