import type { MutationCtx } from "../_generated/server";
import type { DataModel, Id, TableNames } from "../_generated/dataModel";
import type { NamedTableInfo, Query } from "convex/server";
import type { Provider } from "./providers";

/**
 * ============================================================================
 * WHAT ERASURE MEANS, PER PROVIDER — the one list, in one file (P3)
 * ============================================================================
 *
 * YA2 wrote this list once, for YouTube, inside the mutation that used it. Two
 * things went wrong with that. Instagram and Facebook never got one at all, so
 * disconnecting them left comment text and author names behind forever under a
 * platform with the same obligation. And nothing anywhere could tell that a
 * table was missing — the list was a local constant, and a table added six
 * months later joins no list and breaks the guarantee in silence.
 *
 * So the list moved here, it covers every provider, and it is checked. The
 * check is `TABLE_OWNERSHIP` below: a `Record` keyed by EVERY table whose name
 * marks it as a provider's (`yt*`, `ig*`, `fb*`, `meta*`, `ga4*`, `gads*`,
 * `ad*`, `or*`). Add such a table to the schema and forget it here and the
 * build stops — TypeScript refuses a Record with a missing key. Nothing about
 * that is optional or opt-in, which is the entire point.
 *
 * A table is either purged by a list of providers or explicitly excluded with
 * the reason written down. "Not decided yet" is not one of the options.
 * ============================================================================
 */

/** Rows removed per pass. Well under the per-mutation document ceiling. */
export const PURGE_BATCH = 200;

/**
 * What one step of a purge did.
 *
 * `exhausted` is separate from `deleted` on purpose. A step that internally
 * caps its own page — the publish jobs do, because each row can take a handful
 * of stored files down with it — returns fewer rows than it was offered while
 * still having work left, and inferring "finished" from a short page would
 * step past it and leave the rest behind.
 */
export type StepResult = { deleted: number; exhausted: boolean };

export type PurgeStep = {
  /** Tables this step empties. Read by the coverage check, not at runtime. */
  readonly tables: readonly TableNames[];
  readonly run: (
    ctx: MutationCtx,
    workspaceId: Id<"workspaces">,
    limit: number,
  ) => Promise<StepResult>;
};

/**
 * Delete up to `limit` rows matched by an already-scoped query.
 *
 * Every caller passes a query that starts from an index whose first field is
 * `workspaceId`, so a purge can never reach into another workspace.
 */
async function drain<T extends TableNames>(
  ctx: MutationCtx,
  query: Query<NamedTableInfo<DataModel, T>>,
  limit: number,
): Promise<StepResult> {
  const rows = await query.take(limit);
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
  return { deleted: rows.length, exhausted: rows.length < limit };
}

// ── Meta: the shared rate-limit row ─────────────────────────────────────────

/**
 * `metaApiUsage` holds ONE row per workspace because `X-App-Usage` is the whole
 * Meta app's hourly budget, shared by the Instagram account, the Page and the
 * ad account. Disconnecting one of them must not wipe the throttle state the
 * others are still steering by — a reset row reads as "0% spent" and the next
 * scheduler pass would spend straight into a block.
 *
 * So the row goes only when the last Meta connection goes. A run whose sibling
 * is still connected reports the step exhausted with nothing deleted, which is
 * the truth: there is nothing here for THIS erasure to remove.
 */
async function drainMetaApiUsage(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  self: Provider,
  limit: number,
): Promise<StepResult> {
  const metaProviders: Provider[] = ["meta_ig", "meta_fb", "meta_ads"];
  for (const provider of metaProviders) {
    if (provider === self) continue;
    const sibling = await ctx.db
      .query("connections")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .unique();
    // A sibling that is itself mid-erasure does not count as still connected:
    // its own run will take its turn at this row.
    if (sibling !== null && sibling.status !== "disconnecting") {
      return { deleted: 0, exhausted: true };
    }
  }
  return await drain(
    ctx,
    ctx.db
      .query("metaApiUsage")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId)),
    limit,
  );
}

// ── Instagram: rows that own bytes as well as fields ────────────────────────

/**
 * Publish jobs, and the files they still hold.
 *
 * A row here names up to ten objects in Convex storage — the actual pictures
 * and videos an operator uploaded. Deleting the row without them would leave
 * the bytes on disk with nothing left that knows their names, which is the
 * same failure as an orphaned table, only more expensive.
 *
 * The page is capped well below the caller's budget because each row can cost
 * eleven writes rather than one.
 */
async function drainIgPublishJobs(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  limit: number,
): Promise<StepResult> {
  const page = Math.min(limit, 20);
  const rows = await ctx.db
    .query("igPublishJobs")
    .withIndex("by_workspace_status", (q) => q.eq("workspaceId", workspaceId))
    .take(page);
  for (const row of rows) {
    if (row.filesDeletedAt === undefined) {
      for (const storageId of row.storageIds) {
        await ctx.storage.delete(storageId).catch(() => {});
      }
    }
    await ctx.db.delete(row._id);
  }
  return { deleted: rows.length, exhausted: rows.length < page };
}

/** Uploads that never became a job — the row plus the bytes it is holding. */
async function drainIgPublishUploads(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  limit: number,
): Promise<StepResult> {
  const page = Math.min(limit, 50);
  const rows = await ctx.db
    .query("igPublishUploads")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(page);
  for (const row of rows) {
    await ctx.storage.delete(row.storageId).catch(() => {});
    await ctx.db.delete(row._id);
  }
  return { deleted: rows.length, exhausted: rows.length < page };
}

// ── Ads: a five-level tree with no per-level provider column ────────────────

/**
 * The ad hierarchy for ONE provider: accounts → campaigns → ad sets → ads →
 * insights, plus the bookmarks that point into it.
 *
 * Only `adAccounts` carries `provider`; everything below it is reachable only
 * through its parent. That rules out the obvious "delete by workspace" pass —
 * it would take the other ad platform's rows with it — and it also rules out
 * collecting the tree into memory, which is precisely the unbounded read this
 * whole task exists to stamp out.
 *
 * So it walks ONE node at a time, bottom-up: find the first account, its first
 * campaign, its first ad set, its first ad, empty that ad's insights, delete
 * the ad, and go round again. Each pass costs a fixed handful of `first()`
 * reads plus at most `limit` deletions, and every deletion it commits is
 * progress the next pass does not repeat.
 */
async function drainAdHierarchy(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  provider: Provider,
  limit: number,
): Promise<StepResult> {
  let budget = limit;
  let deleted = 0;

  for (;;) {
    if (budget <= 0) return { deleted, exhausted: false };

    const account = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", provider),
      )
      .first();
    if (account === null) return { deleted, exhausted: true };

    const campaign = await ctx.db
      .query("adCampaigns")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .first();
    if (campaign === null) {
      await ctx.db.delete(account._id);
      deleted++;
      budget--;
      continue;
    }

    const adSet = await ctx.db
      .query("adSets")
      .withIndex("by_campaign", (q) => q.eq("campaignId", campaign._id))
      .first();
    if (adSet === null) {
      await ctx.db.delete(campaign._id);
      deleted++;
      budget--;
      continue;
    }

    const ad = await ctx.db
      .query("ads")
      .withIndex("by_adset", (q) => q.eq("adSetId", adSet._id))
      .first();
    if (ad === null) {
      // A pinned Hook Battle is a saved comparison of two ads inside this ad
      // set. With the ad set gone it opens onto nothing, so it goes with it.
      const pins = await ctx.db
        .query("pinnedBattles")
        .withIndex("by_workspace_adset", (q) =>
          q.eq("workspaceId", workspaceId).eq("adSetId", adSet._id),
        )
        .take(budget);
      for (const pin of pins) {
        await ctx.db.delete(pin._id);
      }
      deleted += pins.length;
      budget -= pins.length;
      if (budget <= 0) return { deleted, exhausted: false };

      await ctx.db.delete(adSet._id);
      deleted++;
      budget--;
      continue;
    }

    const insights = await ctx.db
      .query("adInsights")
      .withIndex("by_ad_date", (q) => q.eq("adId", ad._id))
      .take(budget);
    for (const insight of insights) {
      await ctx.db.delete(insight._id);
    }
    deleted += insights.length;
    budget -= insights.length;
    if (budget <= 0) return { deleted, exhausted: false };

    await ctx.db.delete(ad._id);
    deleted++;
    budget--;
  }
}

// ── the per-provider step lists ─────────────────────────────────────────────

/** Shorthand for the common case: one table, one workspace-scoped index. */
function simple<T extends TableNames>(
  table: T,
  scope: (
    ctx: MutationCtx,
    workspaceId: Id<"workspaces">,
  ) => Query<NamedTableInfo<DataModel, T>>,
): PurgeStep {
  return {
    tables: [table],
    run: (ctx, workspaceId, limit) =>
      drain(ctx, scope(ctx, workspaceId), limit),
  };
}

const YOUTUBE_STEPS: PurgeStep[] = [
  // Analytics (Y2) — channel roll-ups, per-video stats, traffic sources.
  simple("ytDailyTotals", (ctx, ws) =>
    ctx.db
      .query("ytDailyTotals")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
  ),
  simple("ytVideoStats", (ctx, ws) =>
    ctx.db
      .query("ytVideoStats")
      .withIndex("by_workspace_video", (q) => q.eq("workspaceId", ws)),
  ),
  simple("ytTrafficSources", (ctx, ws) =>
    ctx.db
      .query("ytTrafficSources")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
  ),
  // Comment engine (Y4) — the automations, the log of every comment they
  // looked at (author names and comment text included), and the dedup table.
  simple("ytAutomations", (ctx, ws) =>
    ctx.db
      .query("ytAutomations")
      .withIndex("by_workspace_active", (q) => q.eq("workspaceId", ws)),
  ),
  simple("ytCommentLogs", (ctx, ws) =>
    ctx.db
      .query("ytCommentLogs")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", ws)),
  ),
  simple("ytProcessedComments", (ctx, ws) =>
    ctx.db
      .query("ytProcessedComments")
      .withIndex("by_workspace_comment", (q) => q.eq("workspaceId", ws)),
  ),
  // Quota accounting (Y4/Y6) and the media job log (Y6-Y10).
  simple("ytQuotaUsage", (ctx, ws) =>
    ctx.db
      .query("ytQuotaUsage")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
  ),
  simple("ytMediaJobs", (ctx, ws) =>
    ctx.db
      .query("ytMediaJobs")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", ws)),
  ),
  // Playlist cache (Y8) — a copy of channel data, so it goes with the rest.
  simple("ytPlaylists", (ctx, ws) =>
    ctx.db
      .query("ytPlaylists")
      .withIndex("by_workspace_playlist", (q) => q.eq("workspaceId", ws)),
  ),
];

const INSTAGRAM_STEPS: PurgeStep[] = [
  simple("igAccountDaily", (ctx, ws) =>
    ctx.db
      .query("igAccountDaily")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
  ),
  simple("igMediaStats", (ctx, ws) =>
    ctx.db
      .query("igMediaStats")
      .withIndex("by_workspace_media", (q) => q.eq("workspaceId", ws)),
  ),
  // Other people's comment text and handles — the same class of data the
  // YouTube list starts from.
  simple("igComments", (ctx, ws) =>
    ctx.db
      .query("igComments")
      .withIndex("by_workspace_media", (q) => q.eq("workspaceId", ws)),
  ),
  simple("igModerationLogs", (ctx, ws) =>
    ctx.db
      .query("igModerationLogs")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", ws)),
  ),
  { tables: ["igPublishJobs"], run: drainIgPublishJobs },
  { tables: ["igPublishUploads"], run: drainIgPublishUploads },
  {
    tables: ["metaTargetedSyncs"],
    run: (ctx, ws, limit) =>
      drain(
        ctx,
        ctx.db
          .query("metaTargetedSyncs")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ws))
          .filter((q) => q.eq(q.field("provider"), "meta_ig")),
        limit,
      ),
  },
  {
    tables: ["metaSyncJobs"],
    run: (ctx, ws, limit) =>
      drain(
        ctx,
        ctx.db
          .query("metaSyncJobs")
          .withIndex("by_workspace_provider_job", (q) =>
            q.eq("workspaceId", ws).eq("provider", "meta_ig"),
          ),
        limit,
      ),
  },
  {
    tables: ["metaApiUsage"],
    run: (ctx, ws, limit) => drainMetaApiUsage(ctx, ws, "meta_ig", limit),
  },
];

const FACEBOOK_STEPS: PurgeStep[] = [
  simple("fbPageDaily", (ctx, ws) =>
    ctx.db
      .query("fbPageDaily")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
  ),
  simple("fbPagePosts", (ctx, ws) =>
    ctx.db
      .query("fbPagePosts")
      .withIndex("by_workspace_post", (q) => q.eq("workspaceId", ws)),
  ),
  simple("fbComments", (ctx, ws) =>
    ctx.db
      .query("fbComments")
      .withIndex("by_workspace_post", (q) => q.eq("workspaceId", ws)),
  ),
  simple("fbModerationLogs", (ctx, ws) =>
    ctx.db
      .query("fbModerationLogs")
      .withIndex("by_workspace_created", (q) => q.eq("workspaceId", ws)),
  ),
  {
    tables: ["metaTargetedSyncs"],
    run: (ctx, ws, limit) =>
      drain(
        ctx,
        ctx.db
          .query("metaTargetedSyncs")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ws))
          .filter((q) => q.eq(q.field("provider"), "meta_fb")),
        limit,
      ),
  },
  {
    tables: ["metaSyncJobs"],
    run: (ctx, ws, limit) =>
      drain(
        ctx,
        ctx.db
          .query("metaSyncJobs")
          .withIndex("by_workspace_provider_job", (q) =>
            q.eq("workspaceId", ws).eq("provider", "meta_fb"),
          ),
        limit,
      ),
  },
  {
    tables: ["metaApiUsage"],
    run: (ctx, ws, limit) => drainMetaApiUsage(ctx, ws, "meta_fb", limit),
  },
];

const GA4_STEPS: PurgeStep[] = [
  simple("ga4Daily", (ctx, ws) =>
    ctx.db
      .query("ga4Daily")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", ws)),
  ),
  simple("ga4TrafficDaily", (ctx, ws) =>
    ctx.db
      .query("ga4TrafficDaily")
      .withIndex("by_workspace_date_dims", (q) => q.eq("workspaceId", ws)),
  ),
];

const GOOGLE_ADS_STEPS: PurgeStep[] = [
  simple("gadsKeywordQuality", (ctx, ws) =>
    ctx.db
      .query("gadsKeywordQuality")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ws)),
  ),
  {
    tables: ["adAccounts", "adCampaigns", "adSets", "ads", "adInsights"],
    run: (ctx, ws, limit) => drainAdHierarchy(ctx, ws, "google_ads", limit),
  },
];

const META_ADS_STEPS: PurgeStep[] = [
  {
    tables: ["adAccounts", "adCampaigns", "adSets", "ads", "adInsights"],
    run: (ctx, ws, limit) => drainAdHierarchy(ctx, ws, "meta_ads", limit),
  },
  {
    tables: ["metaApiUsage"],
    run: (ctx, ws, limit) => drainMetaApiUsage(ctx, ws, "meta_ads", limit),
  },
];

/**
 * Provider → the ordered list of steps that empties it.
 *
 * `openreply` is absent because it has no connection row to disconnect: it is
 * switched on and off in Settings and holds no credential. See the exclusions
 * in `TABLE_OWNERSHIP` for what that means for its tables.
 */
export const PURGE_STEPS: Partial<Record<Provider, PurgeStep[]>> = {
  youtube: YOUTUBE_STEPS,
  meta_ig: INSTAGRAM_STEPS,
  meta_fb: FACEBOOK_STEPS,
  meta_ads: META_ADS_STEPS,
  ga4: GA4_STEPS,
  google_ads: GOOGLE_ADS_STEPS,
};

/** The steps for a provider, or an empty list when it has no data of its own. */
export function purgeSteps(provider: Provider): PurgeStep[] {
  return PURGE_STEPS[provider] ?? [];
}

// ── the coverage check ──────────────────────────────────────────────────────

/**
 * Every table whose NAME says which integration it belongs to.
 *
 * Derived from the schema, not typed out: `TableNames` comes from the generated
 * data model, so this union changes the moment the schema does.
 */
export const PROVIDER_TABLE_PREFIXES = [
  "yt",
  "ig",
  "fb",
  "meta",
  "ga4",
  "gads",
  "ad",
  "or",
] as const;

/**
 * The same prefixes as a type. It has to be written twice — a template literal
 * type cannot be built from a runtime array — so
 * `scripts/verify-purge-coverage.ts` compares the two: a prefix added to one
 * and not the other produces either a missing key (tsc) or a surplus one (the
 * script), and both are failures.
 */
export type ProviderPrefixedTable = Extract<
  TableNames,
  | `yt${string}`
  | `ig${string}`
  | `fb${string}`
  | `meta${string}`
  | `ga4${string}`
  | `gads${string}`
  | `ad${string}`
  | `or${string}`
>;

type Disposition =
  | { readonly purgedBy: readonly Provider[] }
  | { readonly excluded: string };

/**
 * The decision, for every one of them.
 *
 * This is a total `Record`. Adding `ytShorts` to the schema and not adding it
 * here fails `tsc`, which fails `npm run build` — which is the cheap version of
 * finding out. `scripts/verify-purge-coverage.ts` then checks the other half:
 * that a table claiming to be purged by a provider really does appear in that
 * provider's step list.
 */
export const TABLE_OWNERSHIP: Record<ProviderPrefixedTable, Disposition> = {
  // ── YouTube (YA2 / Y2-Y10) ────────────────────────────────────────────────
  ytDailyTotals: { purgedBy: ["youtube"] },
  ytVideoStats: { purgedBy: ["youtube"] },
  ytTrafficSources: { purgedBy: ["youtube"] },
  ytAutomations: { purgedBy: ["youtube"] },
  ytCommentLogs: { purgedBy: ["youtube"] },
  ytProcessedComments: { purgedBy: ["youtube"] },
  ytQuotaUsage: { purgedBy: ["youtube"] },
  ytMediaJobs: { purgedBy: ["youtube"] },
  ytPlaylists: { purgedBy: ["youtube"] },

  // ── Instagram ─────────────────────────────────────────────────────────────
  igAccountDaily: { purgedBy: ["meta_ig"] },
  igMediaStats: { purgedBy: ["meta_ig"] },
  igComments: { purgedBy: ["meta_ig"] },
  igModerationLogs: { purgedBy: ["meta_ig"] },
  igPublishJobs: { purgedBy: ["meta_ig"] },
  igPublishUploads: { purgedBy: ["meta_ig"] },

  // ── Facebook Page ─────────────────────────────────────────────────────────
  fbPageDaily: { purgedBy: ["meta_fb"] },
  fbPagePosts: { purgedBy: ["meta_fb"] },
  fbComments: { purgedBy: ["meta_fb"] },
  fbModerationLogs: { purgedBy: ["meta_fb"] },

  // ── Meta, shared between the Instagram and the Page connection ────────────
  metaSyncJobs: { purgedBy: ["meta_ig", "meta_fb"] },
  metaTargetedSyncs: { purgedBy: ["meta_ig", "meta_fb"] },
  // Deleted only by whichever Meta connection leaves last — see
  // `drainMetaApiUsage`.
  metaApiUsage: { purgedBy: ["meta_ig", "meta_fb", "meta_ads"] },

  // ── GA4 ───────────────────────────────────────────────────────────────────
  ga4Daily: { purgedBy: ["ga4"] },
  ga4TrafficDaily: { purgedBy: ["ga4"] },

  // ── Ads ───────────────────────────────────────────────────────────────────
  gadsKeywordQuality: { purgedBy: ["google_ads"] },
  adAccounts: { purgedBy: ["meta_ads", "google_ads"] },
  adCampaigns: { purgedBy: ["meta_ads", "google_ads"] },
  adSets: { purgedBy: ["meta_ads", "google_ads"] },
  ads: { purgedBy: ["meta_ads", "google_ads"] },
  adInsights: { purgedBy: ["meta_ads", "google_ads"] },
  adActions: {
    excluded:
      "Log radnji koje je operater sam izveo nad oglasima (pauza, budžet), a ne podataka preuzetih od providera. Nema `provider` kolonu ni vezu ka `adAccounts`, pa se ne može svesti na jednu platformu; ostaje kao revizioni trag.",
  },

  // ── OpenReply ─────────────────────────────────────────────────────────────
  // OpenReply je zaseban provider koji nema red u `connections` — pali se i
  // gasi u Podešavanjima i ne čuva kredencijal — pa nema ni prekid veze koji bi
  // pokrenuo brisanje. Njegovi redovi uz to nose `platform` i dele se između
  // Instagrama i Facebook-a (`orAutomations` sme da bude i „both”), tako da bi
  // brisanje pri prekidu jedne od dve Meta veze odnelo i podatke one druge.
  // Zato ovde stoje kao izuzetak sa razlogom, a ne kao previd: OpenReply-ju
  // treba sopstveni purge koji zna za `platform`.
  orCampaignStats: { excluded: "OpenReply — vidi belešku iznad." },
  orDailyTotals: { excluded: "OpenReply — vidi belešku iznad." },
  orAutomations: { excluded: "OpenReply — vidi belešku iznad." },
  orDmLogs: { excluded: "OpenReply — vidi belešku iznad." },
  orProcessedComments: { excluded: "OpenReply — vidi belešku iznad." },
  orConversations: { excluded: "OpenReply — vidi belešku iznad." },
  orInboundMessages: { excluded: "OpenReply — vidi belešku iznad." },
  orPostbacks: { excluded: "OpenReply — vidi belešku iznad." },
  orProfileMenus: { excluded: "OpenReply — vidi belešku iznad." },
  orTrackedLinks: { excluded: "OpenReply — vidi belešku iznad." },
  orLinkClicks: { excluded: "OpenReply — vidi belešku iznad." },
};
