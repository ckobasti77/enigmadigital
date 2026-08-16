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
});
