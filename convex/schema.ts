import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { providerValidator } from "./lib/providers";

// Multi-tenant from day one (PLAN.md §3). V1 is single-user, but every future
// table carries a `workspaceId`, so onboarding clients later needs no migration.
// Sync always upserts by natural key (`date`, `mediaId`, `orCampaignId`) with a
// lookback window; nothing is ever deleted — the whole point is history.
// `date` fields are "YYYY-MM-DD" strings (lexicographic sort = chronological).
export default defineSchema({
  // Convex Auth: users, authAccounts, authSessions, authVerificationCodes, …
  ...authTables,

  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
  }).index("by_slug", ["slug"]),

  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("client_viewer")),
  })
    .index("by_user", ["userId"])
    .index("by_workspace", ["workspaceId"]),

  // Per-integration credentials. The secret (token / service account JSON /
  // connection string) is AES-256-GCM encrypted before write; the plaintext is
  // decrypted ONLY inside "use node" sync actions and never returned by a query.
  connections: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    encryptedCredentials: v.string(),
    externalId: v.optional(v.string()), // GA4 property ID, IG user ID, ad account ID…
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("expired"),
    ),
    expiresAt: v.optional(v.number()), // Meta long-lived tokens (60 days)
    lastSyncAt: v.optional(v.number()),
  })
    .index("by_workspace_provider", ["workspaceId", "provider"])
    .index("by_provider", ["provider"]),

  // One-time OAuth `state` nonces. Created when an authenticated user starts
  // the connect flow; consumed by the PUBLIC callback route to finish the
  // token exchange server-side. This makes the OAuth return leg independent of
  // the browser session (no login round-trip can lose the code). Rows are
  // deleted on consume; stale rows (>1h) are swept opportunistically.
  oauthStates: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    provider: providerValidator,
    nonce: v.string(),
    redirectUri: v.string(),
    createdAt: v.number(),
  }).index("by_nonce", ["nonce"]),

  // GA4 — daily aggregate + per channel/campaign (for UTM attribution).
  ga4Daily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    sessions: v.number(),
    activeUsers: v.number(),
    newUsers: v.number(),
    conversions: v.number(),
    engagementRate: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  ga4TrafficDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    sessionSource: v.string(),
    sessionMedium: v.string(),
    sessionCampaign: v.string(),
    sessions: v.number(),
    conversions: v.number(),
  })
    // Full dimension tuple = natural upsert key; the prefix also serves
    // date-range reads for the dashboard.
    .index("by_workspace_date_dims", [
      "workspaceId",
      "date",
      "sessionSource",
      "sessionMedium",
      "sessionCampaign",
    ])
    // M6 UTM join: OpenReply campaign name ↔ GA4 sessionCampaign.
    .index("by_workspace_campaign", ["workspaceId", "sessionCampaign"]),

  // Instagram organic.
  igAccountDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    followersCount: v.number(),
    reach: v.number(),
    profileViews: v.number(),
    accountsEngaged: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  igMediaStats: defineTable({
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    mediaType: v.string(),
    caption: v.string(),
    permalink: v.string(),
    publishedAt: v.number(),
    reach: v.number(),
    likes: v.number(),
    comments: v.number(),
    saves: v.number(),
    shares: v.number(),
    views: v.number(),
    syncedAt: v.number(),
  })
    .index("by_workspace_media", ["workspaceId", "mediaId"]) // upsert by mediaId
    .index("by_workspace_published", ["workspaceId", "publishedAt"]),

  // OpenReply snapshot (source of truth stays its own Postgres).
  orCampaignStats: defineTable({
    workspaceId: v.id("workspaces"),
    orCampaignId: v.string(),
    name: v.string(),
    keyword: v.string(),
    active: v.boolean(),
    dmsSent: v.number(),
    dmsFailed: v.number(),
    linkClicks: v.number(),
    ctr: v.number(),
    syncedAt: v.number(),
  }).index("by_workspace_campaign", ["workspaceId", "orCampaignId"]),

  orDailyTotals: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    dmsSent: v.number(),
    linkClicks: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  // Operations — one row per sync attempt (start/finish/fail); powers the
  // Sync Health widget. Latest-per-provider = withIndex(...).order("desc").first()
  // (Convex appends _creationTime as the implicit trailing index column).
  syncRuns: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    connectionId: v.optional(v.id("connections")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(
      v.literal("running"),
      v.literal("ok"),
      v.literal("error"),
    ),
    error: v.optional(v.string()), // pre-sanitized; safe to show in the UI
    itemsWritten: v.number(),
  }).index("by_workspace_provider", ["workspaceId", "provider"]),

  // Ads Command module (V2 - PLAN.md §7.3).
  // Hierarchy: adAccounts -> adCampaigns -> adSets -> ads
  adAccounts: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    externalId: v.string(), // "act_123456789"
    name: v.string(),
    currency: v.string(),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_provider", ["workspaceId", "provider"])
    .index("by_workspace_external", ["workspaceId", "externalId"]),

  adCampaigns: defineTable({
    workspaceId: v.id("workspaces"),
    accountId: v.id("adAccounts"),
    externalId: v.string(), // Meta campaign ID / Google campaign ID
    name: v.string(),
    objective: v.optional(v.string()),
    status: v.string(), // "ACTIVE", "PAUSED", "ARCHIVED"
    dailyBudget: v.optional(v.number()),
    lifetimeBudget: v.optional(v.number()),
    searchImpressionShare: v.optional(v.number()), // Google Search Impression Share (0..1 or %)
    syncPriority: v.union(v.literal("hot"), v.literal("cold")),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_account", ["workspaceId", "accountId"])
    .index("by_workspace_external", ["workspaceId", "externalId"])
    .index("by_account", ["accountId"])
    .index("by_workspace_priority", ["workspaceId", "syncPriority"]),

  adSets: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.id("adCampaigns"),
    externalId: v.string(), // Meta adset ID / Google ad group ID
    name: v.string(),
    status: v.string(),
    targetingSummary: v.optional(v.string()),
    dailyBudget: v.optional(v.number()),
    lifetimeBudget: v.optional(v.number()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_campaign", ["workspaceId", "campaignId"])
    .index("by_workspace_external", ["workspaceId", "externalId"])
    .index("by_campaign", ["campaignId"]),

  ads: defineTable({
    workspaceId: v.id("workspaces"),
    adSetId: v.id("adSets"),
    externalId: v.string(), // Meta ad ID / Google ad group ad ID
    name: v.string(),
    status: v.string(),
    creativeId: v.optional(v.string()),
    hookLabel: v.optional(v.string()), // ručna oznaka verzije hook-a
    primaryText: v.optional(v.string()), // primarni tekst / hook copy
    headline: v.optional(v.string()), // naslov oglasa uz CTA
    thumbnailUrl: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_adset", ["workspaceId", "adSetId"])
    .index("by_workspace_external", ["workspaceId", "externalId"])
    .index("by_adset", ["adSetId"]),

  adInsights: defineTable({
    workspaceId: v.id("workspaces"),
    adId: v.id("ads"),
    date: v.string(), // "YYYY-MM-DD"
    hour: v.optional(v.number()), // 0..23 (hourly for "hot")
    breakdownHash: v.string(), // "none" or hash of dimensions; part of upsert key
    breakdown: v.optional(
      v.object({
        age: v.optional(v.string()),
        gender: v.optional(v.string()),
        placement: v.optional(v.string()),
        platform: v.optional(v.string()),
        device: v.optional(v.string()),
      }),
    ),
    spend: v.number(),
    impressions: v.number(),
    reach: v.number(),
    frequency: v.number(),
    clicks: v.number(),
    ctr: v.number(),
    uniqueCtr: v.optional(v.number()),
    cpc: v.number(),
    cpm: v.number(),
    cpp: v.optional(v.number()),
    video3s: v.number(),
    thruplay: v.number(),
    videoP25: v.number(),
    videoP50: v.number(),
    videoP75: v.number(),
    videoP95: v.optional(v.number()),
    videoP100: v.number(),
    hookRate: v.number(), // (video3s / impressions) computed at write time
    holdRate: v.number(), // (thruplay / video3s) computed at write time
    outboundCtr: v.optional(v.number()),
    results: v.number(), // konverzije/rezultati
    costPerResult: v.number(), // CPA/CPL
    conversionValue: v.number(), // purchase/lead value
    roas: v.number(), // conversionValue / spend
    searchImpressionShare: v.optional(v.number()),
    qualityRanking: v.optional(v.string()),
    engagementRanking: v.optional(v.string()),
    conversionRanking: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_ad_date", ["adId", "date"])
    .index("by_ad_date_hash", ["adId", "date", "breakdownHash"])
    .index("by_upsert_key", ["adId", "date", "breakdownHash", "hour"]),

  adActions: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.optional(v.id("users")),
    targetType: v.union(
      v.literal("campaign"),
      v.literal("adset"),
      v.literal("ad"),
    ),
    targetId: v.string(), // externalId
    targetName: v.optional(v.string()),
    action: v.union(
      v.literal("pause"),
      v.literal("resume"),
      v.literal("budget_change"),
      v.literal("duplicate"),
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("error"),
      v.literal("blocked"),
    ),
    params: v.optional(v.string()), // JSON stringified audit parameters
    executedAt: v.number(),
    apiResponse: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_executed", ["workspaceId", "executedAt"])
    .index("by_workspace_target", ["workspaceId", "targetType", "targetId"])
    .index("by_workspace_target_status", [
      "workspaceId",
      "targetType",
      "targetId",
      "status",
    ])
    .index("by_workspace_status", ["workspaceId", "status"]),

  // Hook Battle bookmarks (PLAN.md §7.4)
  pinnedBattles: defineTable({
    workspaceId: v.id("workspaces"),
    adSetId: v.id("adSets"),
    from: v.string(), // "YYYY-MM-DD"
    to: v.string(), // "YYYY-MM-DD"
    name: v.optional(v.string()),
    pinnedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_adset", ["workspaceId", "adSetId"]),

  // Automated Rules Engine (V3 - PLAN.md §6/§7.4)
  rules: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    enabled: v.boolean(),
    scope: v.union(
      v.literal("account"),
      v.literal("campaign"),
      v.literal("adset"),
    ),
    condition: v.object({
      metric: v.union(
        v.literal("cpa"),
        v.literal("spend"),
        v.literal("ctr"),
        v.literal("cpc"),
        v.literal("roas"),
      ),
      operator: v.union(
        v.literal("gt"),
        v.literal("gte"),
        v.literal("lt"),
        v.literal("lte"),
      ),
      value: v.number(),
      windowDays: v.number(),
      minImpressions: v.number(),
    }),
    action: v.union(
      v.literal("notify"),
      v.literal("pause"),
      v.literal("pause_and_notify"),
    ),
    cooldownHours: v.number(),
    lastFiredAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_enabled", ["workspaceId", "enabled"]),

  ruleFirings: defineTable({
    workspaceId: v.id("workspaces"),
    ruleId: v.id("rules"),
    targetId: v.string(), // externalId
    targetName: v.optional(v.string()),
    targetType: v.optional(
      v.union(
        v.literal("account"),
        v.literal("campaign"),
        v.literal("adset"),
      ),
    ),
    firedAt: v.number(),
    metricValue: v.number(),
    actionTaken: v.union(
      v.literal("notify"),
      v.literal("pause"),
      v.literal("pause_and_notify"),
      v.literal("notify_only_write_disabled"),
    ),
    notified: v.boolean(),
    details: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_firedAt", ["workspaceId", "firedAt"])
    .index("by_ruleId", ["ruleId"])
    .index("by_ruleId_and_firedAt", ["ruleId", "firedAt"])
    .index("by_ruleId_and_targetId_and_firedAt", [
      "ruleId",
      "targetId",
      "firedAt",
    ]),

  // Google Ads Keyword Quality Score & metrics (V3 - PLAN.md §7.2)
  gadsKeywordQuality: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    adGroupId: v.optional(v.id("adSets")),
    adGroupExternalId: v.string(),
    keywordId: v.string(), // criterion_id
    keywordText: v.string(),
    matchType: v.string(), // "EXACT", "PHRASE", "BROAD"
    qualityScore: v.optional(v.number()), // 1..10
    creativeQualityScore: v.optional(v.string()), // "ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE", "UNKNOWN"
    postClickQualityScore: v.optional(v.string()), // landing page experience
    searchPredictedCtr: v.optional(v.string()), // expected CTR
    status: v.optional(v.string()), // "ENABLED", "PAUSED", etc.
    impressions: v.number(),
    clicks: v.number(),
    cost: v.number(),
    conversions: v.number(),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_workspace_campaign_id", ["workspaceId", "campaignId"])
    .index("by_workspace_adgroup", ["workspaceId", "adGroupExternalId"])
    .index("by_workspace_keyword", ["workspaceId", "keywordId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_upsert_key", ["workspaceId", "keywordId", "date"]),
});

