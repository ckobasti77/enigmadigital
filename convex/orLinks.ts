import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
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
 * OpenReply tracked short links (PLAN.md §4 / Step 4).
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
 * Get-or-create the tracked link for an automation and return the short URL
 * to put in the DM, or null when there is nothing to track.
 *
 * The slug is stable for the lifetime of the automation: editing the link in
 * the UI repoints the existing slug instead of minting a new one, so short
 * links already sitting in DMs that were sent days ago keep resolving.
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

    const origin = shortLinkOrigin();
    if (origin === null) {
      return null;
    }

    const label = automation.linkLabel?.trim() || undefined;

    const existing = await ctx.db
      .query("orTrackedLinks")
      .withIndex("by_workspace_automation", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("automationId", args.automationId),
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
      automationId: args.automationId,
      slug,
      destinationUrl,
      label,
      createdAt: Date.now(),
    });

    return `${origin}/r/${slug}`;
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
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      destinationUrl: v.string(),
      campaignSlug: v.string(),
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

    const automation = await ctx.db.get(link.automationId);
    // Same slugify the Atribucija screen joins GA4 campaigns on.
    const campaignSlug = automation === null ? "" : slugify(automation.name);

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
        automationId: link.automationId,
        trackedLinkId: link._id,
        date,
        ipHash: args.ipHash,
        userAgent: args.userAgent?.slice(0, USER_AGENT_MAX),
        referrer: args.referrer?.slice(0, REFERRER_MAX),
        createdAt: now,
      });

      await ctx.runMutation(internal.orRollup.recompute, {
        workspaceId: link.workspaceId,
        date,
        automationId: link.automationId,
      });

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

      // args.ipHash NE prosleđujemo kao clientIpAddress jer je to heš, a Meta traži sirovu IP adresu.
      // Oslanjamo se na user-agent i fbc identifikatore.
      const capiEventDocId = await ctx.runMutation(
        internal.metaCapiStore.recordCapiEvent,
        {
          workspaceId: link.workspaceId,
          eventName: "PageView",
          eventTime,
          eventId,
          actionSource: "website",
          sourceKind: "link_redirect",
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
      ...(capiEventId ? { eventId: capiEventId } : {}),
    };
  },
});
