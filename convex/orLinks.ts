import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  generateSlug,
  shortLinkOrigin,
  extractFbclidFromUrl,
  formatFbc,
} from "./lib/orLink";
import { slugify } from "./lib/slug";
import { utcDateKey } from "./lib/orMatch";
import {
  claimPublicRouteCall,
  R_HOURLY_CAP,
  ROUTE_WINDOW_MS,
} from "./publicRouteLimit";

/**
 * OpenReply & Threads tracked short links (PLAN.md §4 / Step 4 & TH10).
 *
 * Default V8 runtime — no "use node": these run inside the send action's and
 * the /r/ HTTP action's transaction path and must stay cheap.
 */

/** Max stored length for click provenance headers. */
const USER_AGENT_MAX = 300;
const REFERRER_MAX = 500;
/** How many slug candidates to try before giving up on a collision. */
const SLUG_ATTEMPTS = 5;

/**
 * Pomoćna funkcija za get-or-create praćenog linka po (workspaceId, destinationUrl, channel).
 */
export async function ensureTrackedUrlHelper(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    destinationUrl: string;
    channel?: string;
    label?: string;
    automationId?: Id<"orAutomations">;
  },
): Promise<string | null> {
  const destinationUrl = args.destinationUrl.trim();
  if (!destinationUrl) return null;

  const origin = shortLinkOrigin();
  if (!origin) return null;

  const channel = args.channel ?? "threads";
  const label = args.label?.trim() || undefined;

  if (args.automationId) {
    const existing = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_workspace_automation", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("automationId", args.automationId!),
      )
      .first();

    if (existing !== null) {
      if (
        existing.destinationUrl !== destinationUrl ||
        existing.label !== label
      ) {
        await ctx.db.patch(existing._id, { destinationUrl, label });
      }
      return `${origin}/r/${existing.slug}`;
    }
  } else {
    // Provera da li već postoji praćeni link za istu destinaciju i kanal
    const existing = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_workspace_destination", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("destinationUrl", destinationUrl),
      )
      .filter((q) => q.eq(q.field("channel"), channel))
      .first();

    if (existing !== null) {
      return `${origin}/r/${existing.slug}`;
    }
  }

  let slug: string | null = null;
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    const candidate = generateSlug();
    const clash = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .first();
    if (clash === null) {
      slug = candidate;
      break;
    }
  }
  if (slug === null) {
    return null;
  }

  await ctx.db.insert("orTrackedLinks", {
    workspaceId: args.workspaceId,
    ...(args.automationId ? { automationId: args.automationId } : {}),
    channel,
    slug,
    destinationUrl,
    label,
    createdAt: Date.now(),
  });

  return `${origin}/r/${slug}`;
}

/**
 * Get-or-create the tracked link for an automation and return the short URL
 * to put in the DM, or null when there is nothing to track.
 */
export const ensureTrackedLink = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    automationId: v.id("orAutomations"),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const automation = await ctx.db.get(args.automationId);
    if (automation === null) {
      return null;
    }

    const destinationUrl = automation.linkUrl?.trim();
    if (!destinationUrl) {
      return null;
    }

    return await ensureTrackedUrlHelper(ctx, {
      workspaceId: args.workspaceId,
      destinationUrl,
      channel: "instagram",
      label: automation.linkLabel?.trim() || undefined,
      automationId: args.automationId,
    });
  },
});

/**
 * Interna mutacija za kreiranje praćenog linka za zadatu destinaciju i kanal.
 */
export const ensureTrackedUrl = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    destinationUrl: v.string(),
    channel: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    return await ensureTrackedUrlHelper(ctx, {
      workspaceId: args.workspaceId,
      destinationUrl: args.destinationUrl,
      channel: args.channel ?? "threads",
      label: args.label,
    });
  },
});

/**
 * Resolve a slug for the /r/ redirect and, unless the visitor is a bot, log the
 * click and refresh the rollups it feeds.
 *
 * Returns null for an unknown slug so the HTTP action can answer 404. Bots get
 * a working redirect but no click row — `countClick: false` keeps preview
 * fetches (Instagram, WhatsApp, link unfurlers) out of the CTR numbers.
 */
export const registerClick = internalMutation({
  args: {
    slug: v.string(),
    countClick: v.boolean(),
    ipHash: v.optional(v.string()),
    // Sirova IP posetioca, ODVOJENA od ipHash. Ide ISKLJUČIVO u CAPI kao
    // clientIpAddress; nikad u orLinkClicks, eventId, log ili URL.
    clientIp: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      destinationUrl: v.string(),
      campaignSlug: v.string(),
      channel: v.string(),
      eventId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (link === null) {
      return null;
    }

    const automation = link.automationId ? await ctx.db.get(link.automationId) : null;
    // Same slugify the Atribucija screen joins GA4 campaigns on.
    const campaignSlug =
      automation !== null
        ? slugify(automation.name)
        : link.label
          ? slugify(link.label)
          : "threads";
    const channel = link.channel ?? "instagram";

    // The redirect ALWAYS happens; only the click WRITE is capped (R1/2d). This
    // route is public and every hit inserts an `orLinkClicks` row with a rollup
    // recompute behind it — an unauthenticated write amplifier bounded only by a
    // user-agent bot filter. Over the hourly ceiling the visitor still reaches
    // the destination; the click just is not counted.
    const withinCap = args.countClick
      ? await claimPublicRouteCall(ctx, {
          workspaceId: link.workspaceId,
          route: "r",
          limit: R_HOURLY_CAP,
          windowMs: ROUTE_WINDOW_MS,
        })
      : false;

    // Isti event_id koji je otišao u CAPI vraćamo pozivaocu SAMO ako je server
    // događaj stvarno upisan — da ga doda na odredišni URL kao `eid`, gde ga
    // Pixel pročita i pošalje isti ključ (dedup). Ostaje undefined inače.
    let capiEventId: string | undefined;

    if (args.countClick && withinCap) {
      const now = Date.now();
      const date = utcDateKey(now);

      await ctx.db.insert("orLinkClicks", {
        workspaceId: link.workspaceId,
        ...(link.automationId ? { automationId: link.automationId } : {}),
        channel,
        trackedLinkId: link._id,
        date,
        ipHash: args.ipHash,
        userAgent: args.userAgent?.slice(0, USER_AGENT_MAX),
        referrer: args.referrer?.slice(0, REFERRER_MAX),
        createdAt: now,
      });

      if (link.automationId) {
        await ctx.runMutation(internal.orRollup.recompute, {
          workspaceId: link.workspaceId,
          date,
          automationId: link.automationId,
        });
      }

      // B3 & B-F1 & B-F2: Conversions API (CAPI) - website PageView event on short-link redirect
      const eventTime = Math.floor(now / 1000);
      const identKey = args.ipHash ? args.ipHash.slice(0, 12) : "anon";

      // Deterministički event_id baziran na sekundi klika i identifikatoru posetioca.
      // Pixel na odredišnoj stranici (web sajtu) mora poslati isti event_id u istoj sekundi
      // kako bi Meta uspešno izvršila deduplikaciju između browser i server događaja.
      const eventId = `r_${link._id}_${eventTime}_${identKey}`;

      const clientUserAgent = args.userAgent?.slice(0, USER_AGENT_MAX)?.trim() || undefined;

      // Extract fbclid from destinationUrl or referrer to create fbc (Meta click ID)
      const fbclid =
        extractFbclidFromUrl(link.destinationUrl) ||
        extractFbclidFromUrl(args.referrer);
      const fbc = fbclid ? formatFbc(fbclid, now) : undefined;

      // Sirovu IP (args.clientIp) prosleđujemo kao clientIpAddress — Meta traži
      // baš nehaširanu adresu za uparivanje; args.ipHash (heš) ostaje samo u
      // orLinkClicks. Bez ijednog od IP/fbc/fbp/email/telefon događaj se ne
      // upisuje (recordCapiEvent vrati null) — user-agent sam nije dovoljan.
      const capiEventDocId = await ctx.runMutation(
        internal.metaCapiStore.recordCapiEvent,
        {
          workspaceId: link.workspaceId,
          eventName: "PageView",
          eventTime,
          eventId,
          actionSource: "website",
          sourceKind: "link_redirect",
          clientIpAddress: args.clientIp,
          clientUserAgent,
          fbc,
        },
      );

      // Scheduled sending via ctx.scheduler.runAfter (only if event was successfully recorded)
      if (capiEventDocId !== null) {
        capiEventId = eventId;
        await ctx.scheduler.runAfter(
          0,
          internal.metaCapi.sendPendingCapiEventsAction,
          {
            workspaceId: link.workspaceId,
          },
        );
      }
    }

    return {
      destinationUrl: link.destinationUrl,
      campaignSlug,
      channel,
      ...(capiEventId ? { eventId: capiEventId } : {}),
    };
  },
});
