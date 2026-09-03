import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import {
  connectionStatusValidator,
  providerValidator,
} from "./lib/providers";

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
    // meta_fb only: the long-lived USER token the Page token was minted from,
    // encrypted the same way. Kept because "Osvezi token" and the daily cron
    // both have to ask `/me/accounts` for a fresh Page token, and only a user
    // token may do that. Never sent anywhere else.
    encryptedUserCredentials: v.optional(v.string()),
    externalId: v.optional(v.string()), // GA4 property ID, IG user ID, ad account ID…
    externalIdAlt: v.optional(v.string()), // meta_ig: IG professional account
    // ID (webhook `entry.id`); meta_fb: the Page's name, so Settings can say
    // which Page is connected without a round trip to Meta
    //
    // meta_ig only: our own @handle, cached from `/me` by the full sync (F6).
    // The comments edge names an author by handle and nothing else, so this is
    // the only way to tell our replies from everybody else's — and a targeted
    // single-post refresh cannot afford a `/me` call just to learn it again.
    accountHandle: v.optional(v.string()),
    // Includes "disconnecting" (P3): the row is NOT deleted the moment somebody
    // disconnects. It is the only thing that still says this workspace has
    // provider data, and deleting it first orphans everything the purge has not
    // reached yet. See `lib/providers.ts`.
    status: connectionStatusValidator,
    // meta_fb only: how the Page token was obtained. `undefined` reads as
    // "oauth" (every row written before the System User path existed, and every
    // connection made through Facebook Login). "system_user" marks a Page token
    // minted from a non-expiring Meta System User token: it has NO
    // `encryptedUserCredentials`, `refreshConnectionToken` deliberately skips it
    // (there is nothing to re-mint from and nothing that expires), and the
    // Settings card must say "Ne ističe" and hide the refresh/picker controls.
    authMode: v.optional(
      v.union(v.literal("oauth"), v.literal("system_user")),
    ),
    expiresAt: v.optional(v.number()), // Meta long-lived tokens (60 days)
    lastSyncAt: v.optional(v.number()),
    // Bumped every time a fresh grant is written to this row (a reconnect). A
    // purge run records the generation it was opened for; a pass whose recorded
    // generation no longer matches is working against a grant the operator has
    // since replaced, and stops (R1/4c). Optional so pre-R1 rows read as
    // generation 0 — the value `beginPurgeRun` also records for them.
    generation: v.optional(v.number()),
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
  })
    .index("by_nonce", ["nonce"])
    // Metenje isteklih nonce-ova ide kroz opseg po vremenu, ne kroz `.filter()`
    // nad celom tabelom.
    .index("by_createdAt", ["createdAt"]),

  // GA4 — daily aggregate + per channel/campaign (for UTM attribution).
  ga4Daily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    sessions: v.number(),
    activeUsers: v.number(),
    newUsers: v.number(),
    keyEvents: v.optional(v.number()),
    conversions: v.optional(v.number()),
    engagementRate: v.optional(v.number()),
    totalUsers: v.optional(v.number()),
    engagedSessions: v.optional(v.number()),
    screenPageViews: v.optional(v.number()),
    userEngagementDuration: v.optional(v.number()),
    scrolledUsers: v.optional(v.number()),
    metricsVersion: v.optional(v.number()),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  ga4TrafficDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    sessionSource: v.string(),
    sessionMedium: v.string(),
    sessionCampaign: v.string(),
    sessions: v.number(),
    keyEvents: v.optional(v.number()),
    conversions: v.optional(v.number()),
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

  // GA4 Data API quota tracking (consumed vs remaining)
  ga4Quota: defineTable({
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    fetchedAt: v.number(),
    tokensPerDay: v.optional(
      v.object({ consumed: v.number(), remaining: v.number() }),
    ),
    tokensPerHour: v.optional(
      v.object({ consumed: v.number(), remaining: v.number() }),
    ),
    tokensPerProjectPerHour: v.optional(
      v.object({ consumed: v.number(), remaining: v.number() }),
    ),
    concurrentRequests: v.optional(
      v.object({ consumed: v.number(), remaining: v.number() }),
    ),
    serverErrorsPerProjectPerHour: v.optional(
      v.object({ consumed: v.number(), remaining: v.number() }),
    ),
    potentiallyThresholdedRequestsPerHour: v.optional(
      v.object({ consumed: v.number(), remaining: v.number() }),
    ),
    peakPct: v.number(),
    state: v.union(v.literal("ok"), v.literal("warn"), v.literal("stop")),
  }).index("by_workspace", ["workspaceId"]),

  // GA4 report response metadata (sampling, thresholding, timezone)
  ga4ReportMeta: defineTable({
    workspaceId: v.id("workspaces"),
    reportKey: v.string(), // "daily" | "traffic"
    fetchedAt: v.number(),
    timeZone: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    emptyReason: v.optional(v.string()),
    subjectToThresholding: v.optional(v.boolean()),
    dataLossFromOtherRow: v.optional(v.boolean()),
    sampled: v.optional(v.boolean()),
    samplesReadCount: v.optional(v.number()),
    samplingSpaceSize: v.optional(v.number()),
  }).index("by_workspace_report", ["workspaceId", "reportKey"]),

  // GA4 dugački format za sve metrike i razdvajanja (A2/A3-A6).
  // Model tri stanja: "value" | "thresholded" | "unavailable" (F6).
  ga4MetricDaily: defineTable({
    workspaceId: v.id("workspaces"),
    reportKey: v.optional(v.string()), // "acq_channel_first" | "content_pages" ...
    date: v.string(), // "YYYY-MM-DD" u vremenskoj zoni propertije
    metric: v.string(),
    dimensionKeys: v.array(v.string()),
    dimensionValues: v.array(v.string()),
    dimKey: v.optional(v.string()), // dimensionKeys.join("|") + "\u0000" + dimensionValues.join("|")
    value: v.optional(v.number()),
    state: v.union(
      v.literal("value"),
      v.literal("thresholded"),
      v.literal("unavailable"),
    ),
    syncedAt: v.number(),
  })
    .index("by_workspace_report_date", ["workspaceId", "reportKey", "date"])
    .index("by_ws_report_date_metric_dim", [
      "workspaceId",
      "reportKey",
      "date",
      "metric",
      "dimKey",
    ]),

  // GA4 postepeni backfill za izveštaje u ga4MetricDaily (A4 §5.2).
  ga4Backfill: defineTable({
    workspaceId: v.id("workspaces"),
    reportKey: v.string(),
    oldestSyncedDate: v.string(), // "YYYY-MM-DD"
    completedAt: v.optional(v.number()),
  }).index("by_workspace_report", ["workspaceId", "reportKey"]),

  // GA4 katalog otkriven kroz getMetadata za svaku propertiju (A2/A3).
  ga4Catalog: defineTable({
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    fetchedAt: v.number(),
    dimensions: v.array(
      v.object({
        apiName: v.string(),
        uiName: v.string(),
        description: v.string(),
        customDefinition: v.optional(v.boolean()),
        category: v.optional(v.string()),
      }),
    ),
    metrics: v.array(
      v.object({
        apiName: v.string(),
        uiName: v.string(),
        description: v.string(),
        type: v.string(),
        expression: v.optional(v.string()),
        customDefinition: v.optional(v.boolean()),
        category: v.optional(v.string()),
        blockedReasons: v.optional(v.array(v.string())),
      }),
    ),
    lastErrorAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  // GA4 keš provere kompatibilnosti dimenzija i metrika (A2).
  ga4Compat: defineTable({
    workspaceId: v.id("workspaces"),
    comboKey: v.string(),
    compatible: v.boolean(),
    incompatible: v.array(v.string()),
    checkedAt: v.number(),
    schemaVersion: v.optional(v.number()),
  }).index("by_workspace_combo", ["workspaceId", "comboKey"]),

  // GA4 podaci uživo za poslednjih 30 minuta (A5 §5.1).
  // Čuva se samo jedan red po radnom prostoru (poslednji snimak).
  ga4Realtime: defineTable({
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    fetchedAt: v.number(),
    activeUsers: v.optional(v.number()),
    byMinute: v.array(
      v.object({ minutesAgo: v.number(), activeUsers: v.number() }),
    ),
    byScreen: v.array(v.object({ key: v.string(), value: v.number() })),
    byCountry: v.array(v.object({ key: v.string(), value: v.number() })),
    byDevice: v.array(v.object({ key: v.string(), value: v.number() })),
    byEvent: v.array(v.object({ key: v.string(), value: v.number() })),
    state: v.union(v.literal("value"), v.literal("unavailable")),
    error: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

  // GA4 kohortna retencija (A5 §5.2).
  // 12 nedeljnih kohorti sa stopama povratka (nth 0..11).
  ga4Cohorts: defineTable({
    workspaceId: v.id("workspaces"),
    granularity: v.string(), // "WEEKLY"
    cohortName: v.string(),
    cohortStartDate: v.string(),
    nth: v.number(),
    cohortTotalUsers: v.optional(v.number()),
    cohortActiveUsers: v.optional(v.number()),
    state: v.union(
      v.literal("value"),
      v.literal("thresholded"),
      v.literal("unavailable"),
    ),
    syncedAt: v.number(),
  })
    .index("by_workspace_granularity", ["workspaceId", "granularity"])
    .index("by_workspace_cohort_nth", [
      "workspaceId",
      "granularity",
      "cohortName",
      "nth",
    ]),

  // GA4 konfiguracija propertije očitana kroz Admin API (A7).
  // Čuva se samo jedan red po radnom prostoru (trenutno stanje, ne istorija).
  ga4Config: defineTable({
    workspaceId: v.id("workspaces"),
    propertyId: v.string(),
    fetchedAt: v.number(),
    displayName: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    currencyCode: v.optional(v.string()),
    industryCategory: v.optional(v.string()),
    serviceLevel: v.optional(v.string()),
    createTime: v.optional(v.string()),
    eventDataRetention: v.optional(v.string()),
    resetUserDataOnNewActivity: v.optional(v.boolean()),
    keyEvents: v.optional(
      v.array(
        v.object({
          eventName: v.string(),
          countingMethod: v.optional(v.string()),
          custom: v.optional(v.boolean()),
          createTime: v.optional(v.string()),
        }),
      ),
    ),
    customDimensions: v.optional(
      v.array(
        v.object({
          parameterName: v.string(),
          displayName: v.string(),
          description: v.optional(v.string()),
          scope: v.optional(v.string()),
        }),
      ),
    ),
    customMetrics: v.optional(
      v.array(
        v.object({
          parameterName: v.string(),
          displayName: v.string(),
          description: v.optional(v.string()),
          scope: v.optional(v.string()),
        }),
      ),
    ),
    dataStreams: v.optional(
      v.array(
        v.object({
          displayName: v.string(),
          type: v.optional(v.string()),
          measurementId: v.optional(v.string()),
          defaultUri: v.optional(v.string()),
        }),
      ),
    ),
    googleAdsLinks: v.optional(
      v.array(
        v.object({
          customerId: v.string(),
          adsPersonalizationEnabled: v.optional(v.boolean()),
          createTime: v.optional(v.string()),
        }),
      ),
    ),
    errors: v.optional(
      v.array(
        v.object({
          resource: v.string(),
          reason: v.string(),
        }),
      ),
    ),
  }).index("by_workspace", ["workspaceId"]),

  // Instagram organic.
  igAccountDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    followersCount: v.number(),
    reach: v.number(),
    profileViews: v.optional(v.number()),
    totalInteractions: v.optional(v.number()),
    accountsEngaged: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  // Dugački format za svih 15 metrika naloga i njihova razdvajanja (G1).
  // Model tri stanja: "value" | "suppressed" | "unavailable".
  igMetricDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD", UTC
    metric: v.string(), // "reach", "views", ...
    // Prazan niz = ukupna vrednost bez razdvajanja.
    dimensionKeys: v.array(v.string()), // ["media_product_type"]
    dimensionValues: v.array(v.string()), // ["REELS"]
    value: v.optional(v.number()), // undefined kad state != "value"
    state: v.union(
      v.literal("value"),
      v.literal("suppressed"),
      v.literal("unavailable"),
    ),
    reason: v.optional(v.string()), // zašto, kad nije "value"
    syncedAt: v.number(),
  })
    .index("by_workspace_date_metric", ["workspaceId", "date", "metric"])
    .index("by_workspace_metric_date", ["workspaceId", "metric", "date"]),

  // Demografski podaci publike i angažovane publike (G2).
  // Model tri stanja: "value" | "suppressed" | "unavailable".
  igDemographics: defineTable({
    workspaceId: v.id("workspaces"),
    metric: v.union(v.literal("follower"), v.literal("engaged")),
    timeframe: v.string(), // "last_14_days" | "last_30_days" | "last_90_days" | "prev_month" | "this_month" | "this_week"
    dimensionKeys: v.array(v.string()), // ["age","gender"] | ["country"] | ["city"]
    dimensionValues: v.array(v.string()),
    value: v.optional(v.number()),
    state: v.union(
      v.literal("value"),
      v.literal("suppressed"),
      v.literal("unavailable"),
    ),
    reason: v.optional(v.string()),
    syncedAt: v.number(),
  }).index("by_workspace_metric_timeframe", [
    "workspaceId",
    "metric",
    "timeframe",
  ]),

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
    // Extended post metrics (G3) — all optional to maintain backward compatibility
    reposts: v.optional(v.number()),
    profileVisits: v.optional(v.number()),
    follows: v.optional(v.number()),
    replies: v.optional(v.number()),
    totalInteractions: v.optional(v.number()),
    reelsAvgWatchTimeMs: v.optional(v.number()),
    reelsVideoViewTotalTimeMs: v.optional(v.number()),
    reelsSkipRate: v.optional(v.number()),
    crosspostedViews: v.optional(v.number()),
    facebookViews: v.optional(v.number()),
    // 3-state metric map for scalar fields on this post
    metricStates: v.optional(
      v.record(
        v.string(),
        v.object({
          state: v.union(
            v.literal("value"),
            v.literal("suppressed"),
            v.literal("unavailable"),
          ),
          reason: v.optional(v.string()),
        }),
      ),
    ),
    syncedAt: v.number(),
    // Picture URLs as Instagram handed them out. They are SIGNED CDN links with
    // an expiry, so nothing renders them directly — the public /ig-media/
    // route in http.ts refreshes them on demand and redirects.
    mediaUrl: v.optional(v.string()), // original Instagram CDN URL
    thumbnailUrl: v.optional(v.string()),
    children: v.optional(
      v.array(
        v.object({
          id: v.string(),
          mediaType: v.string(),
          mediaUrl: v.optional(v.string()),
          thumbnailUrl: v.optional(v.string()),
        }),
      ),
    ), // CAROUSEL_ALBUM slides only
    // When the picture URLs above were last refreshed. Kept apart from
    // `syncedAt` so a proxy refresh never pretends the STATS are fresh.
    mediaUrlSyncedAt: v.optional(v.number()),
    // When the /ig-media/ proxy last FAILED to refresh this post's links, and
    // the growing backoff it earned (R1/2a). A success clears both. Without
    // them a failing refresh bought only the 60 s per-media claim, so while Meta
    // refused, the ceiling was "one call per stored post per minute" — 18 000/h
    // for a 300-post archive. The backoff (1m → 5m → 30m → 6h) makes a refusal
    // buy MORE silence, not less.
    mediaUrlAttemptedAt: v.optional(v.number()),
    mediaUrlBackoffMs: v.optional(v.number()),
    // Set when Instagram reports the media is gone; cleared by the next sync
    // that still sees it.
    deletedAt: v.optional(v.number()),
    // Whether Instagram currently accepts comments on this post (F4). Optional
    // because rows written before moderation existed never asked, and "we do
    // not know yet" is not the same statement as "comments are off".
    commentsEnabled: v.optional(v.boolean()),
    // When the comment sync last hit its ceiling on this post, and which one
    // (V1). A cap nobody records is indistinguishable from a complete read, so
    // this is written in the database rather than logged: it is the answer to
    // "why does this post never report a deleted comment". Cleared by the first
    // pass that gets all the way through.
    commentsTruncatedAt: v.optional(v.number()),
    commentsTruncatedReason: v.optional(v.string()),
    // When the deletion sweep last probed this post (V1). The sweep walks
    // oldest-checked first, so this is what turns "every stored post is a
    // candidate" into a rotation that fits inside one pass's call budget.
    deletionCheckedAt: v.optional(v.number()),
  })
    .index("by_workspace_media", ["workspaceId", "mediaId"]) // upsert by mediaId
    .index("by_workspace_published", ["workspaceId", "publishedAt"])
    // The deletion sweep's rotation. `deletedAt` is FIRST so the sweep can pin
    // it to `undefined` and never walk a row that is already known gone (R1/5b):
    // rows marked deleted before this index existed have no `deletionCheckedAt`,
    // sorted ahead of everything, and used to fill the 400-row scan budget with
    // rows the sweep then skipped — 400+ of them and detection stopped silently.
    // Constraining `deletedAt` at the index level spends the budget only on live
    // posts.
    .index("by_workspace_deleted_checked", [
      "workspaceId",
      "deletedAt",
      "deletionCheckedAt",
    ])
    .index("by_media", ["mediaId"]), // public /ig-media/ proxy lookup

  // ── Instagram razdvajanja po objavi (G3) ────────────────────────────────────
  // 3-state breakdown metrics on post level: "profile_activity" and "navigation".
  igMediaBreakdowns: defineTable({
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    metric: v.string(), // "profile_activity" | "navigation"
    dimensionKey: v.string(), // "action_type" | "story_navigation_action_type"
    dimensionValue: v.string(), // "BIO_LINK_CLICKED" | "TAP_EXIT" ...
    value: v.optional(v.number()),
    state: v.union(
      v.literal("value"),
      v.literal("suppressed"),
      v.literal("unavailable"),
    ),
    reason: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_workspace_media", ["workspaceId", "mediaId"])
    .index("by_workspace_media_metric", ["workspaceId", "mediaId", "metric"]),

  // ── Instagram priče / Stories (G4) ──────────────────────────────────────────
  // Aktivne i arhivirane priče. Metrike idu u igMediaStats i igMediaBreakdowns.
  igStories: defineTable({
    workspaceId: v.id("workspaces"),
    storyId: v.string(),
    mediaType: v.string(), // IMAGE | VIDEO
    mediaUrl: v.optional(v.string()), // ističe — ne oslanjaj se
    thumbnailUrl: v.optional(v.string()),
    permalink: v.optional(v.string()),
    timestamp: v.number(), // objavljena
    expiresAt: v.number(), // timestamp + 24h
    firstSeenAt: v.number(),
    lastPolledAt: v.number(),
    pollCount: v.number(),
    // Kad istekne, red OSTAJE. Brojke su istorija.
    archivedAt: v.optional(v.number()),
  })
    .index("by_workspace_expires", ["workspaceId", "expiresAt"])
    .index("by_workspace_story", ["workspaceId", "storyId"])
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"]),

  // ── Instagram spominjanja / Mentions (G5) ───────────────────────────────────
  igMentions: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(v.literal("comment"), v.literal("caption")),
    commentId: v.optional(v.string()),
    mediaId: v.string(),
    text: v.string(),
    authorUsername: v.optional(v.string()),
    permalink: v.optional(v.string()),
    timestamp: v.number(),
    repliedAt: v.optional(v.number()),
    replyText: v.optional(v.string()),
    // Kontekst koji nije uvek dostupan (privatan nalog, obrisano)
    contextState: v.union(
      v.literal("value"),
      v.literal("suppressed"),
      v.literal("unavailable"),
    ),
    contextReason: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"])
    .index("by_workspace_replied", ["workspaceId", "repliedAt"])
    .index("by_workspace_media", ["workspaceId", "mediaId"])
    .index("by_workspace_comment", ["workspaceId", "commentId"]),

  // ── Instagram poruke / Inbox (G6) ───────────────────────────────────────────
  igMessages: defineTable({
    workspaceId: v.id("workspaces"),
    platform: v.optional(
      v.union(v.literal("instagram"), v.literal("facebook")),
    ),
    igsid: v.string(), // Korisnikov IGSID / sagovornik
    conversationId: v.optional(v.string()),
    mid: v.string(), // Meta message ID
    senderId: v.string(),
    senderType: v.union(v.literal("user"), v.literal("business")),
    text: v.optional(v.string()),
    attachments: v.optional(
      v.array(
        v.object({
          type: v.string(), // "image" | "video" | "audio" | "file" | "like_heart" | "share" | "story"
          url: v.optional(v.string()),
          title: v.optional(v.string()),
        }),
      ),
    ),
    shares: v.optional(
      v.object({
        link: v.optional(v.string()),
        id: v.optional(v.string()),
      }),
    ),
    story: v.optional(
      v.object({
        id: v.optional(v.string()),
        url: v.optional(v.string()),
      }),
    ),
    reactions: v.optional(
      v.array(
        v.object({
          emoji: v.string(),
          actorId: v.string(),
          isOurs: v.boolean(),
        }),
      ),
    ),
    isUnsupported: v.optional(v.boolean()),
    isEcho: v.optional(v.boolean()),
    sentAt: v.number(),
    editedAt: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("sending"),
        v.literal("sent"),
        v.literal("failed"),
        v.literal("delivered"),
        v.literal("seen"),
      ),
    ),
    errorMessage: v.optional(v.string()),
    replyToMid: v.optional(v.string()),
  })
    .index("by_workspace_igsid", ["workspaceId", "igsid"])
    .index("by_workspace_mid", ["workspaceId", "mid"])
    .index("by_workspace_sent", ["workspaceId", "sentAt"])
    .index("by_workspace_igsid_sent", ["workspaceId", "igsid", "sentAt"]),

  // ── Instagram publishing (F3) ───────────────────────────────────────────────
  // One row per post an operator started — sent now or scheduled for later.
  //
  // Publishing is two calls with an asynchronous wait between them (create a
  // container, poll it, publish it), and the file has to sit on a public URL
  // the whole time. That is far too much state to hold in a browser tab that
  // may be closed at any moment, so it lives here: the row IS the job, and the
  // cron can pick it up whether or not anyone is watching.
  //
  // Nothing is ever deleted. A failed post is the one an operator most needs to
  // see afterwards, and "why did it not go out" is only answerable from a row
  // that says which step it died on.
  igPublishJobs: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(
      v.literal("IMAGE"),
      v.literal("REEL"),
      v.literal("STORY"),
      v.literal("CAROUSEL"),
    ),
    caption: v.optional(v.string()), // never set for STORIES
    shareToFeed: v.optional(v.boolean()), // REELS only
    // The files, in the order they appear in the post. A carousel keeps its
    // slide order here — there is nowhere else it is written down.
    storageIds: v.array(v.id("_storage")),
    // Public `/ig-upload/<storageId>` addresses, in the same order. Built once
    // at creation so a retry cannot silently point at a different host.
    mediaUrls: v.array(v.string()),
    contentTypes: v.array(v.string()),
    userTags: v.optional(
      v.array(
        v.object({
          username: v.string(),
          x: v.optional(v.number()),
          y: v.optional(v.number()),
        }),
      ),
    ),
    locationId: v.optional(v.string()),
    altText: v.optional(v.string()),
    audioName: v.optional(v.string()),
    trialGraduationStrategy: v.optional(
      v.union(v.literal("MANUAL"), v.literal("SS_PERFORMANCE")),
    ),
    containerId: v.optional(v.string()),
    childContainerIds: v.optional(v.array(v.string())), // CAROUSEL slides
    // When the container was handed to Instagram. The processing deadline runs
    // from here, not from `createdAt`, so a retry gets a full fresh wait.
    processingSince: v.optional(v.number()),
    scheduledFor: v.optional(v.number()), // epoch ms; the picker works in Europe/Belgrade
    status: v.union(
      v.literal("draft"),
      v.literal("queued"),
      v.literal("uploading"),
      // `POST /media_publish` has been sent and its answer has not arrived.
      // Written BEFORE the call, never after: a run that dies here must let
      // the next one ASK Instagram what happened rather than send it again.
      v.literal("publishing"),
      v.literal("processing"),
      v.literal("published"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    attempts: v.number(),
    // When a run last took this job. A run can die between the claim and the
    // next write (isolate killed, deploy, action timeout), and this is the only
    // evidence that the `uploading`/`processing`/`publishing` on the row is
    // stale rather than live.
    claimedAt: v.optional(v.number()),
    // When `media_publish` was actually sent. Doubles as the lower bound of the
    // window searched when a lost media id has to be recovered. It is ALSO the
    // lock (R1/1): once set, no run may send `media_publish` again — a `ready`
    // verdict goes to recovery instead, whatever Meta's `status_code` says.
    publishStartedAt: v.optional(v.number()),
    // The fence token minted by `claimJob` on every claim (R1/1). Every state
    // transition carries it and is refused if it no longer matches the row, so
    // two runs that both claimed the same job — a scheduler race, a reclaim of a
    // run that was still alive — cannot both advance it. The loser reads a
    // mismatch and stops.
    runToken: v.optional(v.string()),
    error: v.optional(v.string()),
    publishedMediaId: v.optional(v.string()),
    // The post is on the profile but we could not prove WHICH post it is —
    // the container answered `PUBLISHED` from an earlier run whose reply was
    // lost. An honest gap beats an invented id, and beats a second post.
    mediaIdUnconfirmed: v.optional(v.boolean()),
    publishedAt: v.optional(v.number()),
    // Cleared once the files are gone, so the 24h sweep knows what is left.
    filesDeletedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    createdBy: v.id("users"),
  })
    .index("by_workspace_status", ["workspaceId", "status"])
    // The 1-minute cron asks "what is due, anywhere" — a question no
    // workspace-scoped index can answer without walking every workspace first.
    .index("by_status_scheduled", ["status", "scheduledFor"])
    // The 24h file sweep. Keyed on `filesDeletedAt` FIRST so the scan starts at
    // the rows that still hold bytes: an index on `createdAt` alone would fill
    // every batch with long-since-swept posts and never reach the ones that
    // still cost disk.
    .index("by_pending_files_created", ["filesDeletedAt", "createdAt"])
    // "Which jobs claim to be running but have not been touched in a while?"
    // Rows written before `claimedAt` existed sort first (undefined precedes
    // every number), which is what we want: they are the oldest stuck ones.
    .index("by_status_claimed", ["status", "claimedAt"]),

  // ── Instagram publishing: files that have arrived but own nothing yet ──────
  //
  // A file reaches Convex storage BEFORE the job that will send it exists —
  // the browser has to upload it to learn its storage id, and a gigabyte of
  // video cannot travel through a mutation. Everything between those two
  // moments is unreferenced disk: if `createJob` refuses the post, or the tab
  // is closed mid-flow, nothing in `igPublishJobs` names those bytes and the
  // sweep that walks that table cannot see them.
  //
  // A row here is exactly that gap, and nothing else. `createJob` DELETES the
  // row when the job takes the file over, so the table only ever holds uploads
  // still waiting for an owner — and anything older than the 24h TTL is an
  // orphan by definition.
  igPublishUploads: defineTable({
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_storage", ["storageId"])
    .index("by_created", ["createdAt"])
    // Erasure (P3) needs to ask "what does THIS workspace still hold" — a
    // question neither of the two indexes above can answer without a scan.
    .index("by_workspace", ["workspaceId"]),

  // ── Instagram publishing: the reverse map from a file to its job (R1/5a) ────
  //
  // The public `/ig-upload/<storageId>` route has to answer one question fast —
  // "is a live publish job pointing at this file?" — and `storageIds` is an
  // ARRAY on `igPublishJobs`, which Convex cannot index by membership. The
  // previous answer walked the 512 newest jobs across every workspace, and
  // scheduling posts 90 days ahead pushes real jobs out of that window: the file
  // for a post booked for next month is no longer in the 512, Instagram fetches
  // it and gets a 404, and the scheduled post fails — the exact P1 bug, back
  // through P2's scan.
  //
  // One row per (job, file) closes that: `createJob` writes them, the file
  // deletions (publish success, sweep, purge, cancel) remove them, and the route
  // looks a storage id straight up. A row exists iff a job is still pointing at
  // the file, so its mere presence is the authorisation.
  igPublishFiles: defineTable({
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    jobId: v.id("igPublishJobs"),
  })
    .index("by_storage", ["storageId"])
    // Removing a job's rows when its files go, without walking the whole table.
    .index("by_job", ["jobId"]),

  // ── Instagram komentari (F4) ────────────────────────────────────────────────
  // Every comment we have ever seen on our own posts — not only the ones that
  // happened to trigger an automation.
  //
  // Until now a comment was written down only when the OpenReply engine reacted
  // to it (`orDmLogs`), which makes that table a log of the ENGINE, not of the
  // account. Moderation needs the opposite: the full list, including the
  // comments nothing answered, because those are exactly the ones an operator
  // opens this screen to deal with.
  //
  // Rows are never removed. A comment that disappears from Instagram — deleted
  // by us here, or by its author over there — gets `deletedAt` and stays, the
  // same rule the posts follow in `igMediaStats`.
  igComments: defineTable({
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    commentId: v.string(),
    // Set on a reply; absent on a top-level comment. A reply's own replies do
    // not exist on Instagram — the tree is exactly two levels deep.
    parentCommentId: v.optional(v.string()),
    text: v.string(),
    username: v.string(),
    // Instagram only hands out the commenter's id on the webhook. The comments
    // edge answers with a username and nothing else, so this stays optional.
    fromId: v.optional(v.string()),
    timestamp: v.number(),
    likeCount: v.optional(v.number()), // read-only; the API cannot set it
    hidden: v.boolean(),
    isOurs: v.boolean(), // written by the connected account
    repliedByUs: v.boolean(),
    // Gone from Instagram: deleted from this screen, or by whoever wrote it.
    deletedAt: v.optional(v.number()),
    // Set when the webhook that created this row carried no usable parent
    // information, so we do not know whether it is a top-level comment or a
    // reply (V1). A reply cannot be replied to — Instagram threads are exactly
    // two levels deep — so the panel withholds its "Odgovori" button until a
    // sync resolves the thread and clears this.
    levelUnknown: v.optional(v.boolean()),
    syncedAt: v.number(),
  })
    .index("by_workspace_media", ["workspaceId", "mediaId"])
    .index("by_workspace_comment", ["workspaceId", "commentId"]) // upsert key
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"])
    // Ingest inbound leadova čita ovu tabelu u paketima, po redosledu nastanka.
    // Convex svakom indeksu implicitno dodaje `_creationTime` kao poslednje
    // polje, pa indeks sa SAMO `workspaceId` dozvoljava opseg
    // `.gt("_creationTime", kursor)`. Sa indeksom koji ima još jedno polje
    // ispred (npr. `replyId`) čitanje ide redosledom TOG polja, pa kursor po
    // vremenu nastanka preskače zapise zauvek. (LM5.1)
    .index("by_workspace_created", ["workspaceId"]),

  // Who did what to a comment, and when (F4).
  //
  // Moderation is the one place in this app where a person, not a cron, makes
  // something disappear from a public account. Hiding is reversible and
  // deleting is not, so both leave a row saying which member did it — the
  // question after the fact is never "what does the state look like now" but
  // "who did this and when".
  //
  // A refusal is recorded too. "The reply never went out and here is what
  // Instagram said" is precisely what a log holding only successes loses.
  igModerationLogs: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    action: v.union(
      v.literal("reply"),
      v.literal("hide"),
      v.literal("unhide"),
      v.literal("delete"),
      v.literal("comments_on"),
      v.literal("comments_off"),
    ),
    commentId: v.optional(v.string()), // absent on the two post-level actions
    mediaId: v.optional(v.string()),
    // What the action was about: the reply that was sent, or the text of the
    // comment that was hidden or deleted. Kept because a deleted comment has
    // nowhere else left to be read from.
    text: v.optional(v.string()),
    username: v.optional(v.string()),
    status: v.union(v.literal("done"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_workspace_created", ["workspaceId", "createdAt"]),

  // ── Facebook stranica (F5) ──────────────────────────────────────────────────
  //
  // Facebook content gets its own three tables rather than a `platform` column
  // on the Instagram ones. The OpenReply engine tables go the other way — one
  // set of tables, a platform beside each row — and the difference is not an
  // inconsistency but the point: an automation is the SAME object on both
  // platforms, while a Page post and an Instagram post share almost no fields
  // (no carousel, no saves, no reach-per-media; a Page post has shares and a
  // `status_type` instead). Folding them together would also mean every
  // existing Instagram query starts filtering, which is exactly the behaviour
  // F5 forbids changing.
  //
  // Same rules as the Instagram side otherwise: upsert by natural key, and
  // nothing is ever deleted — what disappeared from Facebook gets `deletedAt`
  // and stays.
  fbPageDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    impressions: v.number(),
    engagements: v.number(),
    fans: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  fbPagePosts: defineTable({
    workspaceId: v.id("workspaces"),
    postId: v.string(),
    message: v.string(),
    /** Meta's own word for the kind of post: "photo", "video", "link"… */
    statusType: v.string(),
    permalink: v.string(),
    // Unlike Instagram's signed CDN links, `full_picture` is a plain URL that
    // keeps working, so it is rendered directly and needs no proxy route.
    pictureUrl: v.optional(v.string()),
    publishedAt: v.number(),
    likes: v.number(),
    comments: v.number(),
    shares: v.number(),
    // Per-post insights; optional because a post whose insights call failed is
    // still a post worth showing.
    impressions: v.optional(v.number()),
    reach: v.optional(v.number()),
    clicks: v.optional(v.number()),
    // Whether the Page itself has liked this post — the one thing Facebook
    // offers that Instagram does not.
    likedByUs: v.optional(v.boolean()),
    deletedAt: v.optional(v.number()),
    // Same contract as `igMediaStats` (V1): when the comment sync last hit its
    // ceiling on this post, and which one. Cleared by the first pass that gets
    // all the way through.
    commentsTruncatedAt: v.optional(v.number()),
    commentsTruncatedReason: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_workspace_post", ["workspaceId", "postId"]) // upsert key
    .index("by_workspace_published", ["workspaceId", "publishedAt"]),

  fbComments: defineTable({
    workspaceId: v.id("workspaces"),
    postId: v.string(),
    commentId: v.string(),
    parentCommentId: v.optional(v.string()),
    text: v.string(),
    // Facebook has no @handle on a comment — it hands out a display name, and
    // withholds even that from a commenter who never granted the app anything.
    authorName: v.string(),
    authorId: v.optional(v.string()),
    permalink: v.optional(v.string()),
    timestamp: v.number(),
    likeCount: v.optional(v.number()),
    // Set by the Page's own like button. Undefined means "never asked" — the
    // comments edge does not report whether WE liked it, only how many did.
    likedByUs: v.optional(v.boolean()),
    hidden: v.boolean(),
    isOurs: v.boolean(),
    repliedByUs: v.boolean(),
    deletedAt: v.optional(v.number()),
    syncedAt: v.number(),
  })
    .index("by_workspace_post", ["workspaceId", "postId"])
    .index("by_workspace_comment", ["workspaceId", "commentId"]) // upsert key
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"])
    // Ingest inbound leadova čita ovu tabelu u paketima, po redosledu nastanka.
    // Convex svakom indeksu implicitno dodaje `_creationTime` kao poslednje
    // polje, pa indeks sa SAMO `workspaceId` dozvoljava opseg
    // `.gt("_creationTime", kursor)`. Sa indeksom koji ima još jedno polje
    // ispred (npr. `replyId`) čitanje ide redosledom TOG polja, pa kursor po
    // vremenu nastanka preskače zapise zauvek. (LM5.1)
    .index("by_workspace_created", ["workspaceId"]),

  // Who did what to a Facebook comment, and when. Same contract as
  // `igModerationLogs`, plus the two actions Instagram cannot offer.
  fbModerationLogs: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    action: v.union(
      v.literal("reply"),
      v.literal("hide"),
      v.literal("unhide"),
      v.literal("delete"),
      v.literal("like"),
      v.literal("unlike"),
    ),
    commentId: v.optional(v.string()),
    postId: v.optional(v.string()),
    text: v.optional(v.string()),
    authorName: v.optional(v.string()),
    status: v.union(v.literal("done"), v.literal("failed")),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_workspace_created", ["workspaceId", "createdAt"]),

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
    // The same day split by platform (F5). Optional because every row written
    // before Facebook existed has neither, and on those `dmsSent` is by
    // definition all Instagram — which is exactly what the reader assumes.
    dmsSentInstagram: v.optional(v.number()),
    dmsSentFacebook: v.optional(v.number()),
    linkClicks: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  orAutomations: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    // Which platform this automation listens to (F5). Optional so every row
    // written before Facebook existed stays valid without a migration;
    // undefined means "instagram" — see lib/orPlatform.ts, which is the only
    // place that rule is written down.
    platform: v.optional(
      v.union(
        v.literal("instagram"),
        v.literal("facebook"),
        v.literal("both"),
      ),
    ),
    keywords: v.array(v.string()), // stored already lowercased+trimmed
    matchAnyWord: v.boolean(), // true = any keyword, false = all keywords
    wholeWordMatch: v.boolean(),
    matchAnyPost: v.boolean(), // true = any media, false = only `postId`
    postId: v.optional(v.string()),
    dmMessage: v.string(),
    linkUrl: v.optional(v.string()),
    linkLabel: v.optional(v.string()),
    publicReplyEnabled: v.boolean(),
    publicReplyMessage: v.optional(v.string()),
    // What makes the automation fire. Optional so rows written before DM
    // support stay valid without a migration; undefined means "comment".
    trigger: v.optional(
      v.union(v.literal("comment"), v.literal("dm"), v.literal("both")),
    ),
    // Tappable buttons attached to the outgoing message (button template, max
    // 3). A "url" button carries `url`; a "postback" button carries the minted
    // `payload` that a tap comes back on and the `replyMessage` we answer with.
    buttons: v.optional(
      v.array(
        v.object({
          label: v.string(),
          type: v.union(v.literal("url"), v.literal("postback")),
          url: v.optional(v.string()),
          payload: v.optional(v.string()),
          replyMessage: v.optional(v.string()),
        }),
      ),
    ),
    // The other way to offer a choice: chips above the composer (max 13). Every
    // one is a postback in disguise, so the shape is the button minus the URL.
    quickReplies: v.optional(
      v.array(
        v.object({
          label: v.string(),
          payload: v.optional(v.string()),
          replyMessage: v.optional(v.string()),
        }),
      ),
    ),
    // The follow gate: when `requireFollow` is on, someone who does not follow
    // the account gets `followPromptMessage` plus a single button labelled
    // `followPromptButtonLabel` instead of the real message, and the real
    // message only after tapping it. Both texts fall back to the defaults in
    // lib/orFollow.ts, so switching the gate on needs nothing else.
    requireFollow: v.optional(v.boolean()),
    followPromptMessage: v.optional(v.string()),
    followPromptButtonLabel: v.optional(v.string()),
    // The delayed second message: `followUpDelayMinutes` after the automation's
    // DM actually leaves, whoever got it gets `followUpMessage` too. Capped
    // below Instagram's 24h window (lib/orFollowUp.ts) and dropped outright
    // when that window has closed by the time it fires.
    followUpEnabled: v.optional(v.boolean()),
    followUpMessage: v.optional(v.string()),
    followUpDelayMinutes: v.optional(v.number()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_active", ["workspaceId", "isActive"]),

  orDmLogs: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("orAutomations")),
    // Where this happened (F5). Undefined means "instagram" — every row
    // written before Facebook existed.
    platform: v.optional(
      v.union(v.literal("instagram"), v.literal("facebook")),
    ),
    // What the engine reacted to. Undefined means "comment" (every row written
    // before DM triggers existed). For a DM row `commentId` holds the message
    // id and `commenterId` the sender's IGSID; for a "postback" row `commentId`
    // holds the tap's message id and `commentText` the button's title.
    source: v.optional(
      v.union(v.literal("comment"), v.literal("dm"), v.literal("postback")),
    ),
    // Which half of the automation wrote this row. Undefined means "primary" —
    // the answer to the trigger itself, and every row written before follow-ups
    // existed. Only a primary row ever schedules a follow-up, so a follow-up
    // can never chain into another one.
    kind: v.optional(v.union(v.literal("primary"), v.literal("followup"))),
    commentId: v.string(),
    mediaId: v.optional(v.string()),
    commenterId: v.string(),
    commenterUsername: v.optional(v.string()),
    /**
     * What the person said — but ONLY where the engine is the only place it is
     * written down (V3): a DM, a button tap, or a comment webhook that carried
     * no post id.
     *
     * A comment under one of our posts is written to `igComments` /
     * `fbComments` before the engine is even asked whether it is switched on,
     * and that row is the single source of truth for the text: it is what
     * moderation hides, and what moderation marks deleted. So those rows carry
     * an empty string here and `listDmLogs` reads the text out of the comment
     * table instead — which is also what makes a deletion visible on the
     * OpenReply screen and not only on the moderation one.
     *
     * Rows written before V3 keep their copy; the read path prefers the
     * comment table whenever there is one, so they are corrected on display
     * rather than migrated.
     */
    commentText: v.string(),
    matchedKeyword: v.optional(v.string()),
    // Text this row sends *instead of* the automation's `dmMessage` — the reply
    // written on the button that was tapped. Only set on a "postback" row.
    replyMessage: v.optional(v.string()),
    // Set on the row a tap of the follow gate's button creates: ask Instagram
    // again instead of trusting the cached answer, because the whole point of
    // the tap is that the state just changed.
    followRecheck: v.optional(v.boolean()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("skipped_no_match"),
      v.literal("skipped_window"),
      // The follow gate sent its prompt instead of the message. Deliberately
      // not "sent": a delivered payload is what `orCampaignStats.dmsSent`
      // counts, and the tap that follows gets a row of its own.
      v.literal("awaiting_follow"),
    ),
    attempts: v.number(),
    dmSentAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    publicReplySentAt: v.optional(v.number()),
    publicReplyError: v.optional(v.string()),
    date: v.string(), // "YYYY-MM-DD" of createdAt, UTC
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_workspace_comment", ["workspaceId", "commentId"])
    .index("by_automation", ["automationId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_date", ["workspaceId", "date"])
    // Erasure drains this per platform (R1/4g): a Meta disconnect must take the
    // message text and handles it pulled through THAT connection, the same
    // obligation `igComments` meets. `undefined` reads as instagram.
    .index("by_workspace_platform", ["workspaceId", "platform"]),

  // The dedup key stays [workspaceId, commentId] and the platform is compared
  // in code (orIngest.ts). Putting it in the index instead would have meant
  // `.eq("platform", "instagram")` missing every row written before this field
  // existed — turning a redelivered old webhook into a second DM.
  orProcessedComments: defineTable({
    workspaceId: v.id("workspaces"),
    platform: v.optional(
      v.union(v.literal("instagram"), v.literal("facebook")),
    ),
    commentId: v.string(),
    processedAt: v.number(),
  })
    .index("by_workspace_comment", ["workspaceId", "commentId"])
    .index("by_workspace_platform", ["workspaceId", "platform"]), // erasure (R1/4g)

  // One row per person who has ever written to the account. `lastUserMessageAt`
  // is the gate for Meta's 24h messaging window: the app may only reply inside
  // it, and only to someone who messaged first.
  orConversations: defineTable({
    workspaceId: v.id("workspaces"),
    platform: v.optional(
      v.union(v.literal("instagram"), v.literal("facebook")),
    ),
    // The person's page-scoped id: an IGSID on Instagram, a PSID on Facebook.
    // One column for both, because it is the same thing under two names and
    // the platform beside it says which.
    igsid: v.string(),
    username: v.optional(v.string()),
    name: v.optional(v.string()),
    profilePic: v.optional(v.string()),
    conversationId: v.optional(v.string()), // Meta conversation ID (t_...)
    lastUserMessageAt: v.optional(v.number()),
    lastBotMessageAt: v.optional(v.number()),
    lastMessageText: v.optional(v.string()),
    lastMessageAt: v.optional(v.number()),
    unreadCount: v.optional(v.number()),
    consentAt: v.optional(v.number()), // first time they wrote / tapped
    // Last answer the follow gate got from Instagram for this person, and when.
    // A short-lived cache (lib/orFollow.ts), never a source of truth.
    followsBusiness: v.optional(v.boolean()),
    followCheckedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace_igsid", ["workspaceId", "igsid"])
    .index("by_workspace_platform", ["workspaceId", "platform"]) // erasure (R1/4g)
    .index("by_workspace_updated", ["workspaceId", "updatedAt"]),

  // Inbound DMs, kept for de-duplication — Meta redelivers a webhook whenever
  // it does not get a 200 fast enough.
  orInboundMessages: defineTable({
    workspaceId: v.id("workspaces"),
    platform: v.optional(
      v.union(v.literal("instagram"), v.literal("facebook")),
    ),
    mid: v.string(),
    igsid: v.string(),
    text: v.string(),
    receivedAt: v.number(),
  })
    .index("by_workspace_mid", ["workspaceId", "mid"])
    .index("by_workspace_platform", ["workspaceId", "platform"]) // erasure (R1/4g)
    // Ingest inbound leadova čita ovu tabelu u paketima, po redosledu nastanka.
    // Convex svakom indeksu implicitno dodaje `_creationTime` kao poslednje
    // polje, pa indeks sa SAMO `workspaceId` dozvoljava opseg
    // `.gt("_creationTime", kursor)`. Sa indeksom koji ima još jedno polje
    // ispred (npr. `replyId`) čitanje ide redosledom TOG polja, pa kursor po
    // vremenu nastanka preskače zapise zauvek. (LM5.1)
    .index("by_workspace_created", ["workspaceId"]),

  // Button taps coming back from message buttons.
  orPostbacks: defineTable({
    workspaceId: v.id("workspaces"),
    igsid: v.string(),
    payload: v.string(),
    title: v.optional(v.string()),
    receivedAt: v.number(),
  }).index("by_workspace_created", ["workspaceId", "receivedAt"]),

  // Ice breakers and the persistent menu — the two taps that start a
  // conversation without waiting for a comment, and the reason they matter:
  // a tap opens the 24h messaging window and grants profile consent. Both live
  // on the same Instagram node (/me/messenger_profile), so one row holds both.
  // One row per workspace.
  orProfileMenus: defineTable({
    workspaceId: v.id("workspaces"),
    // Up to 4 questions shown on an empty thread. Tapping one starts the DM of
    // the automation it names; `payload` is the minted `or:<id>:<key>` the tap
    // comes back on, the same format a message button uses.
    iceBreakers: v.array(
      v.object({
        question: v.string(),
        automationId: v.id("orAutomations"),
        payload: v.optional(v.string()),
      }),
    ),
    // Up to 5 items in the hamburger menu. A "url" item opens a page and never
    // reaches the webhook; a "postback" item starts an automation's DM.
    menuItems: v.array(
      v.object({
        title: v.string(),
        type: v.union(v.literal("url"), v.literal("postback")),
        url: v.optional(v.string()),
        automationId: v.optional(v.id("orAutomations")),
        payload: v.optional(v.string()),
      }),
    ),
    // Saving only writes this row; these two say whether what is saved is what
    // Instagram is actually showing.
    publishedAt: v.optional(v.number()),
    publishError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  orTrackedLinks: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("orAutomations")),
    channel: v.optional(v.string()), // "instagram", "threads", itd.
    slug: v.string(),
    destinationUrl: v.string(),
    label: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_workspace_automation", ["workspaceId", "automationId"])
    .index("by_workspace_destination", ["workspaceId", "destinationUrl"])
    .index("by_workspace_channel", ["workspaceId", "channel"]),

  orLinkClicks: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("orAutomations")),
    channel: v.optional(v.string()),
    trackedLinkId: v.id("orTrackedLinks"),
    date: v.string(), // "YYYY-MM-DD", UTC
    ipHash: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    // Zahtev prepoznat kao bot / generator pregleda linka (LM7). Beleži se samo
    // za landing linkove, da bi se ignorisani zahtevi mogli prebrojati.
    isBot: v.optional(v.boolean()),
    // Zahtev koji JESTE izgledao kao čovek, ali je odbijen zato što je radni
    // prostor prešao satni limit upisa na `/r/`. Zaseban razlog od `isBot`:
    // ranije su i ovakvi zahtevi upisivani kao `isBot: true`, pa je čovek
    // preko limita u izveštaju izgledao kao bot. Razlog odbacivanja koji nije
    // istinit je gori od nezabeleženog odbacivanja.
    overCap: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_link", ["trackedLinkId"])
    .index("by_workspace_link", ["workspaceId", "trackedLinkId"])
    .index("by_workspace_channel", ["workspaceId", "channel"])
    .index("by_workspace_automation", ["workspaceId", "automationId"]),


  // Operations — one row per sync attempt (start/finish/fail); powers the
  // Sync Health widget. Latest-per-provider = withIndex(...).order("desc").first()
  // (Convex appends _creationTime as the implicit trailing index column).
  syncRuns: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    connectionId: v.optional(v.id("connections")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal("running"), v.literal("ok"), v.literal("error")),
    error: v.optional(v.string()), // pre-sanitized; safe to show in the UI
    note: v.optional(v.string()), // npr. quota warn partial sync notice (F5)
    itemsWritten: v.number(),
  }).index("by_workspace_provider", ["workspaceId", "provider"]),

  // ── Meta sync scheduling & rate limiting (F6) ───────────────────────────────
  //
  // Every Graph API answer carries `X-App-Usage` (and, on Business endpoints,
  // `X-Business-Use-Case-Usage`) with three percentages of the rolling hourly
  // allowance. The highest of the three is the one that matters — Meta blocks
  // on whichever runs out first — so that is what the schedulers read before
  // spending a call.
  //
  // ONE row per workspace, not per provider: `X-App-Usage` is the whole Meta
  // APP's budget, and the Instagram and the Page connection share it. Splitting
  // it per provider would let each half believe it still had room.
  metaApiUsage: defineTable({
    workspaceId: v.id("workspaces"),
    callCount: v.number(), // 0..100 (percent)
    cpuTime: v.number(),
    totalTime: v.number(),
    updatedAt: v.number(),
    // Set when Meta actually refused (HTTP 429, or error code 4 / 17 / 32).
    // `backoffMs` is the current step of the doubling, kept so the next
    // refusal knows where it left off.
    backoffUntil: v.optional(v.number()),
    backoffMs: v.optional(v.number()),
    lastThrottleAt: v.optional(v.number()),
  }).index("by_workspace", ["workspaceId"]),

  // When each scheduled pass last ran, and whether it got anywhere. This is
  // NOT `syncRuns`: a run row is one whole sync of one integration and shows up
  // in Sync Health, while these are the small recurring passes (head check,
  // hourly insights, event-driven refresh) that would drown that widget.
  //
  // `job` is a short key — "event" | "head" | "account" | "hot" | "deletion".
  metaSyncJobs: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    job: v.string(),
    lastRunAt: v.number(),
    lastOkAt: v.optional(v.number()),
    // When this pass last actually REFRESHED DATA, which is not the same thing
    // as `lastOkAt` (P2). The two-minute head check succeeds all day long while
    // writing nothing — five ids in, five ids we already had — so a header
    // reading `lastOkAt` says "synced 40 s ago" over numbers that stopped
    // moving six hours ago. That is the exact lie the header exists to remove,
    // so the age of the DATA gets its own field.
    lastDataAt: v.optional(v.number()),
    // Why the last attempt did nothing: rate limit, backoff, nothing new.
    lastSkipReason: v.optional(v.string()),
    itemsWritten: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_provider_job", ["workspaceId", "provider", "job"]),

  // ── Cron self-overlap guard (P2) ────────────────────────────────────────────
  //
  // Convex fires a cron on its own clock and does not care whether the previous
  // firing is still running. A six-hourly sync that takes seven hours would be
  // running twice, both halves spending the same Meta allowance on the same
  // posts — and the slower it got, the more copies of itself it would start.
  //
  // One row per job name. `expiresAt` is what makes it safe: a run that dies
  // between the claim and the release (isolate killed, deploy, timeout) would
  // otherwise hold the lock for good, so a lock past its expiry is taken over
  // rather than waited on.
  cronLocks: defineTable({
    name: v.string(),
    startedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_name", ["name"]),

  // Debounce ledger for the event-driven refresh: one row per post that has
  // ever been refreshed on its own. Deliberately its own table rather than a
  // field on `igMediaStats` — the first comment on a brand new post arrives
  // before that post has a row at all, and a claim that cannot be written is a
  // claim two concurrent webhooks both win.
  metaTargetedSyncs: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    mediaId: v.string(), // IG media id, or FB post id
    lastSyncAt: v.number(),
  })
    .index("by_provider_media", ["provider", "mediaId"])
    // The purge engine drains this table per workspace AND per provider. Reading
    // `by_workspace` and `.filter()`-ing the provider walked every row of the
    // other Meta connection first — a workspace with 18 000 meta_fb rows and
    // 2 000 meta_ig rows blew the read limit before the first meta_ig row and the
    // whole erasure failed (R1/4a). The provider is in the index now.
    .index("by_workspace_provider", ["workspaceId", "provider"])
    .index("by_workspace", ["workspaceId"]),

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
    budgetId: v.optional(v.string()), // Google Ads campaign budget resource ID / name
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
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

  // Meta Ads Kreativi i pregledi (C1)
  adCreatives: defineTable({
    workspaceId: v.id("workspaces"),
    adId: v.id("ads"),
    creativeId: v.string(), // Meta creative ID
    name: v.string(),
    objectStoryId: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    bodyText: v.optional(v.string()),
    titleText: v.optional(v.string()),
    callToActionType: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    previewHtml: v.optional(v.string()),
    previewFetchedAt: v.optional(v.number()),
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_ad", ["adId"])
    .index("by_upsert_key", ["adId", "creativeId"]),

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
    clicks: v.number(),
    reach: v.optional(v.number()),
    frequency: v.optional(v.number()),
    ctr: v.optional(v.number()),
    uniqueCtr: v.optional(v.number()),
    cpc: v.optional(v.number()),
    cpm: v.optional(v.number()),
    cpp: v.optional(v.number()),
    video3s: v.optional(v.number()),
    thruplay: v.optional(v.number()),
    videoP25: v.optional(v.number()),
    videoP50: v.optional(v.number()),
    videoP75: v.optional(v.number()),
    videoP95: v.optional(v.number()),
    videoP100: v.optional(v.number()),
    outboundCtr: v.optional(v.number()),
    results: v.optional(v.number()), // konverzije/rezultati (izostaje kad nalog nema konverzije)
    costPerResult: v.optional(v.number()), // CPA/CPL (izvedena metrika, deriveRate)
    conversionValue: v.optional(v.number()), // purchase/lead value
    roas: v.optional(v.number()), // conversionValue / spend (izvedena metrika, deriveRate)
    searchImpressionShare: v.optional(v.number()),
    conversions: v.optional(v.number()), // primarne konverzije (decimalni broj float64, npr. 2.33)
    allConversions: v.optional(v.number()), // sve konverzije uključujući sekundarne (decimalni broj)
    allConversionsValue: v.optional(v.number()), // vrednost svih konverzija (kroz microsToUnits)
    // Read-only echo iz Meta odgovora, npr. "7d_click,1d_view" (MA1). Kaže KOJA
    // je postavka atribucije dala ove brojeve; ne postavlja se nikad iz koda.
    attributionSetting: v.optional(v.string()),
    qualityRanking: v.optional(v.string()),
    engagementRanking: v.optional(v.string()),
    conversionRanking: v.optional(v.string()),
    insightsVersion: v.optional(v.number()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_ad_date", ["adId", "date"])
    .index("by_ad_date_hash", ["adId", "date", "breakdownHash"])
    .index("by_upsert_key", ["adId", "date", "breakdownHash", "hour"]),

  adActionBreakdown: defineTable({
    workspaceId: v.id("workspaces"),
    adId: v.id("ads"),
    date: v.string(),
    breakdownHash: v.string(),
    actionType: v.string(),
    window: v.string(), // "1d_click" | "7d_click" | "1d_view" | "7d_view" | "default"
    count: v.optional(v.number()),
    value: v.optional(v.number()), // iz action_values
    costPer: v.optional(v.number()), // iz cost_per_action_type
    syncedAt: v.number(),
  })
    .index("by_ws_date", ["workspaceId", "date"])
    .index("by_ad_date_type", ["adId", "date", "actionType"])
    .index("by_upsert_key", [
      "adId",
      "date",
      "breakdownHash",
      "actionType",
      "window",
    ]),

  // Kvota Meta Marketing API-ja: oba zaglavlja u jednom redu po workspace-u (MA1).
  // BUC procenti opisuju klizajući SAT, Insights-Throttle sekundu — zato oba,
  // i zato `peakPct` uzima najveći, a ne prosek.
  metaAdsQuota: defineTable({
    workspaceId: v.id("workspaces"),
    fetchedAt: v.number(),
    // X-Business-Use-Case-Usage (procenti 0-100 nad klizajućim satom).
    callCount: v.optional(v.number()),
    totalCpuTime: v.optional(v.number()),
    totalTime: v.optional(v.number()),
    // X-FB-Ads-Insights-Throttle (opterećenje po sekundi).
    appIdUtilPct: v.optional(v.number()),
    accIdUtilPct: v.optional(v.number()),
    // ads_api_access_tier: "development_access" | "standard_access".
    tier: v.optional(v.string()),
    // estimated_time_to_regain_access je u MINUTIMA; ovde se čuva i sirov broj
    // i trenutak kad blokada ističe, da kapija ne mora ponovo da računa.
    regainMinutes: v.optional(v.number()),
    blockedUntil: v.optional(v.number()),
    peakPct: v.number(),
    state: v.union(v.literal("ok"), v.literal("warn"), v.literal("stop")),
  }).index("by_workspace", ["workspaceId"]),

  // Dokle je stigao postepeni povratak na 28-dnevni prozor restatement-a (MA1).
  // Jedan red po (workspace, scope) jer dnevni/demografski/plasmanski upit
  // napreduju nezavisno.
  metaAdsBackfill: defineTable({
    workspaceId: v.id("workspaces"),
    scope: v.string(), // "daily" | "demo" | "placement"
    oldestSyncedDate: v.string(), // "YYYY-MM-DD"
    completedAt: v.optional(v.number()),
  }).index("by_workspace_scope", ["workspaceId", "scope"]),

  // Meta Custom & Lookalike Audiences
  adAudiences: defineTable({
    workspaceId: v.id("workspaces"),
    adAccountId: v.id("adAccounts"),
    audienceId: v.string(), // Meta id
    name: v.string(),
    subtype: v.string(), // CUSTOM | LOOKALIKE | WEBSITE | ENGAGEMENT | ...
    description: v.optional(v.string()),
    approximateCountLower: v.optional(v.number()),
    approximateCountUpper: v.optional(v.number()),
    operationStatus: v.optional(v.string()),
    deliveryStatus: v.optional(v.string()),
    timeContentUpdated: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
    ruleAggregation: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_account", ["adAccountId"])
    .index("by_upsert_key", ["adAccountId", "audienceId"]),

  // Keš statusa prihvatanja Custom Audience Uslova korišćenja (ToS)
  metaAudienceTos: defineTable({
    workspaceId: v.id("workspaces"),
    adAccountId: v.id("adAccounts"),
    status: v.union(
      v.literal("accepted"),
      v.literal("not_accepted"),
      v.literal("unknown"),
    ),
    lastError: v.optional(v.string()),
    checkedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_account", ["adAccountId"]),

  // Meta Conversions API (CAPI) događaji (B1, B-F1, B-F3)
  capiEvents: defineTable({
    workspaceId: v.id("workspaces"),
    eventName: v.string(), // npr. "PageView", "ViewContent", "Lead", "Purchase"
    eventTime: v.number(), // Unix timestamp u SEKUNDAMA
    eventId: v.string(), // Deterministički ID za deduplikaciju sa Meta Pixelom
    actionSource: v.union(
      v.literal("website"),
      v.literal("business_messaging"),
    ),
    sourceKind: v.union(
      v.literal("link_redirect"),
      v.literal("openreply_conversion"),
    ),
    hashedEmail: v.optional(v.string()), // 64 hex karaktera, mala slova SHA-256
    hashedPhone: v.optional(v.string()), // 64 hex karaktera, mala slova SHA-256
    // Sirova IP adresa posetioca. Izuzetak od pravila "samo heševi" jer Meta Conversions API
    // protokol za polje client_ip_address eksplicitno zahteva neheširanu IPv4/IPv6 adresu.
    clientIpAddress: v.optional(v.string()),
    clientUserAgent: v.optional(v.string()), // User agent browsera
    fbc: v.optional(v.string()), // Meta click ID u formatu "fb.1.<timestamp>.<fbclid>"
    fbp: v.optional(v.string()), // Meta browser cookie u formatu "fb.1.<timestamp>.<random>"
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("rejected"),
    ),
    attempts: v.optional(v.number()), // Broj neuspelih pokušaja slanja batch-a (max 5)
    lastAttemptAt: v.optional(v.number()), // Unix timestamp poslednjeg pokušaja u milisekundama
    rejectReason: v.optional(v.string()), // Sanitizovan razlog odbijanja
    metaResponse: v.optional(v.string()), // Sanitizovan odgovor Meta API-ja
    sentAt: v.optional(v.number()), // Unix timestamp u milisekundama kada je poslato
    syncedAt: v.number(), // Unix timestamp u milisekundama kada je ažuriran red
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_time", ["workspaceId", "eventTime"])
    .index("by_event_id", ["workspaceId", "eventId"])
    .index("by_status", ["workspaceId", "status"]),

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
      // MA8 — kreiranje: svaki objekat je zaseban auditovani red.
      v.literal("create_campaign"),
      v.literal("create_adset"),
      v.literal("create_ad"),
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
      v.union(v.literal("account"), v.literal("campaign"), v.literal("adset")),
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
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
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

  // Google Ads API 24h klizeća kvota po workspace-u i customer ID-ju
  gadsQuota: defineTable({
    workspaceId: v.id("workspaces"),
    customerId: v.optional(v.string()),
    accessLevel: v.string(), // "explorer" | "basic" | "standard"
    dailyLimit: v.number(),
    consumed24h: v.number(),
    remaining24h: v.number(),
    peakPct: v.number(),
    state: v.union(v.literal("ok"), v.literal("warn"), v.literal("stop")),
    operations: v.optional(
      v.array(v.object({ timestamp: v.number(), count: v.number() })),
    ),
    lastCallAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_customer", ["workspaceId", "customerId"]),

  // Google Ads Account Hierarchy (MCC & Client accounts under it) (GA3)
  gadsCustomerClients: defineTable({
    workspaceId: v.id("workspaces"),
    clientCustomer: v.string(), // "customers/1234567890"
    customerId: v.string(), // "1234567890" (normalized 10 digits)
    descriptiveName: v.string(),
    currencyCode: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    manager: v.boolean(),
    level: v.number(),
    status: v.string(), // "ENABLED", "CANCELED", "SUSPENDED", "CLOSED", "UNKNOWN"
    hidden: v.optional(v.boolean()),
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_customer", ["workspaceId", "customerId"]),

  // Google Ads Conversion Actions (GA4 B1)
  gadsConversionActions: defineTable({
    workspaceId: v.id("workspaces"),
    id: v.string(), // "123456789" (criterion/action id)
    name: v.string(),
    status: v.string(), // "ENABLED", "PAUSED", "REMOVED", "HIDDEN", "UNKNOWN"
    category: v.optional(v.string()), // "DEFAULT", "PAGE_VIEW", "PURCHASE", "SIGNUP", "LEAD", etc.
    type: v.optional(v.string()), // "WEBPAGE", "CALL_METRIC", "CLICK_TO_CALL", etc.
    primaryForGoal: v.boolean(), // primary_for_goal
    countingType: v.optional(v.string()), // "ONE_PER_CLICK", "MANY_PER_CLICK"
    attributionModel: v.optional(v.string()), // "DATA_DRIVEN", "LAST_CLICK", etc.
    clickThroughLookupWindowDays: v.optional(v.number()), // 1..90
    viewThroughLookupWindowDays: v.optional(v.number()), // 1..30
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_upsert_key", ["workspaceId", "id"]),

  // Google Ads Campaign Budgets (GA3 B2, B3, B4 & GA4 A1, A2)
  // VAŽNO (B2): campaign_budget je zaseban objekat i MOŽE biti deljen između više
  // kampanja (polje explicitlyShared). Ako se veže 1:1, isti novac se broji više puta.
  // VAŽNO (GA4 A1/A2): monthlyCap (amount * 30.4) je izvedena vrednost pri čitanju i ne
  // čuva se u bazi; spendingCapNotice je konstanta u kodu.
  gadsBudgets: defineTable({
    workspaceId: v.id("workspaces"),
    budgetId: v.string(), // e.g. "customers/123/campaignBudgets/456" or "456"
    name: v.string(),
    amount: v.number(), // dnevni budžet u standardnim novčanim jedinicama (kroz microsToUnits; ako nedostaje, red se ne upisuje; 0 je 0)
    totalAmount: v.optional(v.number()), // ukupan/lifetime budžet ako je definisan
    status: v.optional(v.string()), // "ENABLED", "REMOVED", "UNKNOWN"
    deliveryMethod: v.optional(v.string()), // "STANDARD", "ACCELERATED"
    explicitlyShared: v.boolean(), // true ako je budžet eksplicitno deljen između više kampanja
    referenceCount: v.optional(v.number()), // broj kampanja koje koriste ovaj budžet
    maxDailySpend: v.number(), // amount * 2: maksimalna dnevna potrošnja (do 200% dnevnog budžeta)
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_budget", ["workspaceId", "budgetId"]),

  // Google Ads Campaign Criteria / Ciljanje na nivou kampanje (GA3)
  // Lokacije, jezici, raspored prikazivanja oglasa (ad schedule), uređaji, negativne ključne reči
  gadsCampaignCriteria: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    criterionId: v.string(),
    type: v.string(), // "LOCATION", "LANGUAGE", "AD_SCHEDULE", "KEYWORD", "DEVICE", ...
    negative: v.boolean(), // true za isključenja / negativne kriterijume
    status: v.optional(v.string()),
    bidModifier: v.optional(v.number()),
    location: v.optional(
      v.object({
        geoTargetConstant: v.string(),
        displayName: v.optional(v.string()),
      }),
    ),
    language: v.optional(
      v.object({
        languageConstant: v.string(),
        code: v.optional(v.string()),
      }),
    ),
    adSchedule: v.optional(
      v.object({
        dayOfWeek: v.string(),
        startHour: v.number(),
        startMinute: v.string(),
        endHour: v.number(),
        endMinute: v.string(),
      }),
    ),
    keyword: v.optional(
      v.object({
        text: v.string(),
        matchType: v.string(),
      }),
    ),
    device: v.optional(
      v.object({
        type: v.string(),
      }),
    ),
    detailsSummary: v.optional(v.string()),
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_workspace_campaign_id", ["workspaceId", "campaignId"])
    .index("by_upsert_key", ["workspaceId", "campaignExternalId", "criterionId"]),

  // Google Ads Search Terms (search_term_view) (GA5)
  // Stvarne pretrage korisnika koje su okinule prikaz oglasa, sa statusom i tipom podudaranja.
  gadsSearchTerms: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    adGroupId: v.optional(v.id("adSets")),
    adGroupExternalId: v.string(),
    searchTerm: v.string(),
    status: v.string(), // "ADDED", "EXCLUDED", "NONE", "UNKNOWN"
    matchType: v.optional(v.string()), // "EXACT", "PHRASE", "BROAD", "NEAR_EXACT", "NEAR_PHRASE", "UNKNOWN"
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_workspace_adgroup", ["workspaceId", "adGroupExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "adGroupExternalId",
      "searchTerm",
      "date",
    ]),

  // Google Ads Shared Sets (Deljene negativne liste) (shared_set) (GA5)
  gadsSharedSets: defineTable({
    workspaceId: v.id("workspaces"),
    sharedSetId: v.string(), // npr. "123456" ili resource name
    name: v.string(),
    type: v.string(), // "NEGATIVE_KEYWORDS", etc.
    status: v.optional(v.string()), // "ENABLED", "REMOVED", etc.
    memberCount: v.optional(v.number()),
    referenceCount: v.optional(v.number()),
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_upsert_key", ["workspaceId", "sharedSetId"]),

  // Google Ads Shared Criteria (Kriterijumi u deljenim listama) (shared_criterion) (GA5)
  gadsSharedCriteria: defineTable({
    workspaceId: v.id("workspaces"),
    sharedSetId: v.string(),
    criterionId: v.string(),
    type: v.string(), // "KEYWORD", etc.
    keywordText: v.optional(v.string()),
    matchType: v.optional(v.string()), // "EXACT", "PHRASE", "BROAD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_upsert_key", ["workspaceId", "sharedSetId", "criterionId"]),

  // Google Ads Campaign Shared Sets (Povezivanje kampanja sa deljenim listama) (campaign_shared_set) (GA5)
  gadsCampaignSharedSets: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    sharedSetId: v.string(),
    status: v.optional(v.string()), // "ENABLED", "REMOVED", etc.
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "sharedSetId",
    ]),

  // Google Ads Geographic View (Fizička lokacija prisustva korisnika) (geographic_view) (GA6 B1)
  // VAŽNO: geographic_view = gde se korisnik FIZIČKI nalazio u trenutku pretrage/interakcije.
  // Razlikuje se od user_location_view i ove dve dimenzije se nikada ne sabiraju niti mešaju.
  gadsGeographicView: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    countryCriterionId: v.optional(v.string()),
    locationType: v.string(), // "LOCATION_OF_PRESENCE", "AREA_OF_INTEREST", etc.
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "locationType",
      "date",
    ]),

  // Google Ads User Location View (Lokacija interesovanja / targetiranja) (user_location_view) (GA6 B1)
  // VAŽNO: user_location_view = za koju lokaciju se korisnik ZANIMAO (lokacija interesovanja).
  // Nikada se ne sabira niti spaja sa geographic_view (fizičkim prisustvom).
  gadsUserLocationView: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    countryCriterionId: v.optional(v.string()),
    targetingLocation: v.optional(v.boolean()),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "date",
    ]),

  // Google Ads Device Segments (Razlaganje po uređajima) (segments.device) (GA6 B2)
  // Vrednosti: MOBILE, DESKTOP, TABLET, CONNECTED_TV, OTHER, UNKNOWN.
  // "OTHER" i "UNKNOWN" se ne odbacuju i ne spajaju.
  gadsDeviceStats: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    device: v.string(), // "MOBILE", "DESKTOP", "TABLET", "CONNECTED_TV", "OTHER", "UNKNOWN"
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "device",
      "date",
    ]),

  // Google Ads Hourly & Day of Week Schedule Segments (segments.day_of_week & segments.hour) (GA6 B3)
  // VAŽNO: Ovo su segmenti izveštaja (kada se stvarno trošilo), a NE AD_SCHEDULE kriterijumi kampanje (dozvola).
  gadsHourlyStats: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    dayOfWeek: v.string(), // "MONDAY", "TUESDAY", ...
    hour: v.number(), // 0..23
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "date",
      "hour",
    ]),

  // Google Ads Age Range Demographics (age_range_view) (GA6 B4)
  // VAŽNO: UNDETERMINED / UNKNOWN je validna i često velika kategorija koja se mora čuvati.
  gadsAgeRangeView: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    adGroupId: v.optional(v.id("adSets")),
    adGroupExternalId: v.optional(v.string()),
    criterionId: v.optional(v.string()),
    ageRange: v.string(), // "AGE_RANGE_18_24", ..., "UNDETERMINED", "UNKNOWN"
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "ageRange",
      "date",
    ]),

  // Google Ads Gender Demographics (gender_view) (GA6 B4)
  // VAŽNO: UNDETERMINED / UNKNOWN je validna i često velika kategorija koja se mora čuvati.
  gadsGenderView: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    adGroupId: v.optional(v.id("adSets")),
    adGroupExternalId: v.optional(v.string()),
    criterionId: v.optional(v.string()),
    gender: v.string(), // "MALE", "FEMALE", "UNDETERMINED", "UNKNOWN"
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "campaignExternalId",
      "gender",
      "date",
    ]),

  // Google Ads Assets (asset) (GA7 B1)
  // VAŽNO (B1): Google Ads asset se NE MOŽE obrisati u Google Ads-u — samo se raskida veza sa oglasom.
  // Sam objekat ostaje zauvek. Nijedno dugme u aplikaciji ne sme obećavati brisanje asseta.
  gadsAssets: defineTable({
    workspaceId: v.id("workspaces"),
    assetId: v.string(), // "12345678" ili resource name "customers/123/assets/456"
    name: v.optional(v.string()),
    type: v.string(), // "TEXT", "IMAGE", "VIDEO", "CALL", etc.
    text: v.optional(v.string()), // za TEXT assete (naslovi, opisi)
    imageUrl: v.optional(v.string()), // URL slike pune veličine
    imageFileSize: v.optional(v.number()),
    youtubeVideoId: v.optional(v.string()),
    youtubeVideoTitle: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
    source: v.optional(v.string()), // "ADVERTISER", "GOOGLE", etc.
    status: v.optional(v.string()), // "ENABLED", "REMOVED", "UNKNOWN"
    cannotBeDeleted: v.optional(v.boolean()), // true — trajna napomena o nemogućnosti brisanja (GA7 B1)
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_type", ["workspaceId", "type"])
    .index("by_upsert_key", ["workspaceId", "assetId"]),

  // Google Ads Ad Group Ad Asset View (ad_group_ad_asset_view) (GA7 B2, B4)
  // Povezuje asset sa pojedinačnim oglasom unutar oglasne grupe.
  // performance_label je enum (BEST, GOOD, LOW, LEARNING, PENDING, UNKNOWN) i NIKADA se ne mapira u broj niti sortira kao ocena.
  gadsAdGroupAdAssetViews: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    adGroupId: v.optional(v.id("adSets")),
    adGroupExternalId: v.string(),
    adId: v.optional(v.id("ads")),
    adExternalId: v.string(),
    assetExternalId: v.string(),
    fieldType: v.string(), // "HEADLINE", "DESCRIPTION", "MARKETING_IMAGE", etc.
    performanceLabel: v.string(), // "BEST", "GOOD", "LOW", "LEARNING", "PENDING", "UNKNOWN"
    pinnedField: v.optional(v.string()), // "HEADLINE_1", "HEADLINE_2", etc.
    status: v.optional(v.string()), // "ENABLED", "PAUSED", "REMOVED", etc.
    enabled: v.optional(v.boolean()),
    impressions: v.optional(v.number()),
    clicks: v.optional(v.number()),
    cost: v.optional(v.number()),
    conversions: v.optional(v.number()),
    allConversions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_workspace_adgroup", ["workspaceId", "adGroupExternalId"])
    .index("by_workspace_ad", ["workspaceId", "adExternalId"])
    .index("by_workspace_asset", ["workspaceId", "assetExternalId"])
    .index("by_workspace_field_type", ["workspaceId", "fieldType"])
    .index("by_upsert_key", [
      "workspaceId",
      "adExternalId",
      "assetExternalId",
      "fieldType",
      "date",
    ]),

  // Google Ads Asset Combination Views (ad_group_ad_asset_combination_view) (GA7 B3)
  // Prikazuje kombinacije asseta koje su se stvarno prikazivale.
  gadsAssetCombinationViews: defineTable({
    workspaceId: v.id("workspaces"),
    campaignId: v.optional(v.id("adCampaigns")),
    campaignExternalId: v.string(),
    adGroupId: v.optional(v.id("adSets")),
    adGroupExternalId: v.string(),
    adId: v.optional(v.id("ads")),
    adExternalId: v.string(),
    servedAssetIds: v.array(v.string()), // npr. ["123", "456", "789"]
    combinationHash: v.string(), // deterministički ključ sortiranih ID-jeva
    impressions: v.optional(v.number()),
    date: v.string(), // "YYYY-MM-DD"
    syncedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_campaign", ["workspaceId", "campaignExternalId"])
    .index("by_workspace_adgroup", ["workspaceId", "adGroupExternalId"])
    .index("by_workspace_ad", ["workspaceId", "adExternalId"])
    .index("by_upsert_key", [
      "workspaceId",
      "adExternalId",
      "combinationHash",
      "date",
    ]),

  // ── YouTube (Y2) ────────────────────────────────────────────────────────────
  // Channel-wide daily roll-up from the YouTube Analytics API.
  ytDailyTotals: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD"
    views: v.number(),
    estimatedMinutesWatched: v.number(),
    averageViewDuration: v.number(), // seconds
    averageViewPercentage: v.number(), // 0-100
    subscribersGained: v.number(),
    subscribersLost: v.number(),
    likes: v.number(),
    comments: v.number(),
    shares: v.number(),
    syncedAt: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]), // natural upsert key

  // One row per video: Data API metadata + Analytics API watch-time overlay.
  ytVideoStats: defineTable({
    workspaceId: v.id("workspaces"),
    videoId: v.string(),
    title: v.string(),
    publishedAt: v.number(),
    thumbnailUrl: v.optional(v.string()),
    duration: v.optional(v.string()), // ISO 8601 from the Data API, e.g. "PT4M13S"
    views: v.number(),
    likes: v.number(),
    comments: v.number(),
    // Absent when the video falls outside the Analytics top-100 window.
    estimatedMinutesWatched: v.optional(v.number()),
    averageViewPercentage: v.optional(v.number()),
    syncedAt: v.number(),
  })
    .index("by_workspace_video", ["workspaceId", "videoId"]) // upsert by videoId
    .index("by_workspace_published", ["workspaceId", "publishedAt"]),

  // Where the views came from, per day (insightTrafficSourceType).
  ytTrafficSources: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(),
    sourceType: v.string(), // e.g. "YT_SEARCH", "SUGGESTED_VIDEO"
    views: v.number(),
    estimatedMinutesWatched: v.number(),
    syncedAt: v.number(),
  })
    // Upsert key is [workspaceId, date, sourceType]; the index prefix also
    // serves the date-range read, with sourceType matched in the mutation.
    .index("by_workspace_date", ["workspaceId", "date"]),

  // ── YouTube comment engine (Y4) ─────────────────────────────────────────────
  // A parallel engine to OpenReply's, with one structural difference that
  // shapes everything: YouTube has no direct messages. The only thing an
  // automation can do is answer PUBLICLY on the comment, moderate it, or both.
  ytAutomations: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    keywords: v.array(v.string()), // stored already folded (lib/orMatch.ts)
    matchAnyWord: v.boolean(), // true = any keyword, false = all keywords
    wholeWordMatch: v.boolean(),
    // Scope: every video on the channel, or exactly one.
    matchAnyVideo: v.boolean(),
    videoId: v.optional(v.string()),
    // What happens on a match. At least one of the two must be on — an
    // automation with neither cannot match, because there is nothing to do.
    replyEnabled: v.boolean(),
    replyMessage: v.optional(v.string()),
    moderationEnabled: v.boolean(),
    moderationStatus: v.optional(
      v.union(
        v.literal("heldForReview"),
        v.literal("rejected"),
        v.literal("published"),
      ),
    ),
    // Maps to `banAuthor` on comments.setModerationStatus, which YouTube only
    // accepts together with moderationStatus "rejected".
    markAsSpam: v.optional(v.boolean()),
    // Delete the comment outright (Y7). When on, `moderationEnabled` is
    // ignored: there is nothing to moderate about a comment that is gone. The
    // deletion runs AFTER the reply, because a reply needs its parent to exist.
    deleteEnabled: v.optional(v.boolean()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace_active", ["workspaceId", "isActive"]),

  // One row per comment the engine looked at — answered, moderated, ignored or
  // refused for want of quota. The same "log everything" rule as orDmLogs: a
  // skipped comment is the row that explains why nothing happened.
  ytCommentLogs: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("ytAutomations")),
    commentId: v.string(), // top-level comment id; the reply's parentId
    videoId: v.string(), // "" for a comment on the channel rather than a video
    videoTitle: v.optional(v.string()),
    authorName: v.optional(v.string()),
    authorChannelId: v.optional(v.string()),
    commentText: v.string(),
    matchedKeyword: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("replied"), // a public reply went out (moderation may have too)
      v.literal("moderated"), // moderation only — the automation posts no reply
      v.literal("failed"),
      v.literal("skipped_no_match"),
      // The engine stopped rather than spend the quota the analytics sync
      // needs tomorrow (lib/ytQuota.ts).
      v.literal("skipped_quota"),
      // The comment itself was removed from YouTube — by an automation with
      // `deleteEnabled`, or by hand from the log (Y7). Unlike moderation this
      // cannot be undone from YouTube Studio either.
      v.literal("deleted"),
    ),
    attempts: v.number(),
    repliedAt: v.optional(v.number()),
    // Set whenever the comment was deleted, including on a row whose status
    // stayed "replied" because a manual deletion came later.
    deletedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    date: v.string(), // "YYYY-MM-DD" of createdAt, UTC
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  // Dedup. There is no webhook for comments, so the poller re-reads the same
  // page of comments every run; this table is what keeps it from answering
  // twice. Same shape as orProcessedComments.
  ytProcessedComments: defineTable({
    workspaceId: v.id("workspaces"),
    commentId: v.string(),
    processedAt: v.number(),
  }).index("by_workspace_comment", ["workspaceId", "commentId"]),

  // One row per workspace per day: how many Data API units the comment engine
  // has spent. The Data API meters writes at 50 units each against a 10 000/day
  // budget shared with Y2's analytics sync, so this counter is what stops the
  // engine before it starves the numbers (lib/ytQuota.ts).
  ytQuotaUsage: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD", UTC (utcDateKey)
    unitsUsed: v.number(),
    // videos.insert calls made today. Kept apart from `unitsUsed` because
    // Google meters uploads separately: an upload does not cost a single unit
    // of the 10 000/day budget (lib/ytQuota.ts, VIDEO_UPLOAD_DAILY_LIMIT).
    uploadsUsed: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  // ── YouTube media operations (Y6) ───────────────────────────────────────────
  // One row per media operation an operator started: an upload, a metadata
  // edit, a thumbnail, a caption track, a playlist add, a comment deletion.
  //
  // The comment engine writes hundreds of rows a week and its log is a stream;
  // this is the opposite. Media operations happen rarely and by hand, and the
  // mistakes are expensive and often irreversible — a deleted video does not
  // come back. So each one leaves a row saying what was attempted, what it
  // cost, and how it ended, even when it ended before a single unit was spent.
  ytMediaJobs: defineTable({
    workspaceId: v.id("workspaces"),
    kind: v.union(
      v.literal("upload"),
      v.literal("metadata"),
      v.literal("thumbnail"),
      v.literal("caption"),
      v.literal("playlist"),
      v.literal("comment_delete"),
    ),
    videoId: v.optional(v.string()),
    title: v.optional(v.string()), // what the operator saw themselves doing
    status: v.union(
      v.literal("pending"),
      v.literal("done"),
      v.literal("failed"),
      // Refused before it started: the media ceiling was already reached
      // (lib/ytQuota.ts, QUOTA_MEDIA_LIMIT).
      v.literal("skipped_quota"),
    ),
    unitsSpent: v.number(),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_workspace_created", ["workspaceId", "createdAt"]),

  // ── YouTube playlists (Y8) ──────────────────────────────────────────────────
  // A cache, not a record. The playlists live on YouTube; this table exists so
  // that opening a dropdown does not cost a unit every time, and so the list
  // is on screen the moment the dialog opens instead of after a round trip.
  //
  // Refreshed only when the operator asks (`ytPlaylists.listPlaylists`) or on
  // the first open of a workspace that has never loaded them. A playlist
  // deleted on YouTube stays here until the next refresh — choosing it then
  // spends 50 units on a 404, which is why the refresh button is next to the
  // dropdown rather than buried.
  ytPlaylists: defineTable({
    workspaceId: v.id("workspaces"),
    playlistId: v.string(),
    title: v.string(),
    itemCount: v.number(),
    syncedAt: v.number(),
  }).index("by_workspace_playlist", ["workspaceId", "playlistId"]), // upsert key

  // ── Threads (T1–T10) ────────────────────────────────────────────────────────
  // 1) threadsPosts — jedna objava (polja dokazana u Dodatku B.2)
  threadsPosts: defineTable({
    workspaceId: v.id("workspaces"),
    mediaId: v.string(), // Threads API ID objave
    mediaProductType: v.optional(v.string()), // "THREADS"
    mediaType: v.string(), // TEXT_POST, REPOST_FACADE, itd. Čuva se kao string onakav kakav je stigao (NE union)
    permalink: v.optional(v.string()),
    ownerId: v.optional(v.string()), // owner{id}
    username: v.optional(v.string()),
    text: v.optional(v.string()),
    timestamp: v.optional(v.string()), // ISO 8601 string
    shortcode: v.optional(v.string()),
    isQuotePost: v.optional(v.boolean()),
    quotedPostId: v.optional(v.string()), // quoted_post{id}
    repostedPostId: v.optional(v.string()), // reposted_post{id}
    pollAttachment: v.optional(v.any()), // poll_attachment struktura
    hasReplies: v.optional(v.boolean()),
    rootPostId: v.optional(v.string()), // root_post{id}
    repliedToId: v.optional(v.string()), // replied_to{id}
    isReply: v.optional(v.boolean()),
    isReplyOwnedByMe: v.optional(v.boolean()),
    replyAudience: v.optional(v.string()),
    // Polja koja postoje u API-ju ali su bila prazna na tekstualnim objavama (B.2)
    mediaUrl: v.optional(v.string()),
    thumbnailUrl: v.optional(v.string()),
    children: v.optional(
      v.array(
        v.object({
          id: v.string(),
          mediaType: v.optional(v.string()),
          mediaUrl: v.optional(v.string()),
          thumbnailUrl: v.optional(v.string()),
        }),
      ),
    ),
    altText: v.optional(v.string()),
    linkAttachmentUrl: v.optional(v.string()),
    topicTag: v.optional(v.string()),
    locationId: v.optional(v.string()),
    hideStatus: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_workspace_media", ["workspaceId", "mediaId"])
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"])
    .index("by_media", ["mediaId"]),

  // 2) threadsPostInsights — metrike po objavi (kumulativne, snimak stanja za `date`)
  threadsPostInsights: defineTable({
    workspaceId: v.id("workspaces"),
    mediaId: v.string(),
    date: v.string(), // "YYYY-MM-DD"
    views: v.optional(v.number()),
    likes: v.optional(v.number()),
    replies: v.optional(v.number()),
    reposts: v.optional(v.number()),
    quotes: v.optional(v.number()),
    shares: v.optional(v.number()),
    fetchedAt: v.optional(v.number()),
  })
    .index("by_workspace_media_date", ["workspaceId", "mediaId", "date"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_media", ["workspaceId", "mediaId"]),

  // 3) threadsAccountDaily — jedina prava vremenska serija sa Threads API-ja
  threadsAccountDaily: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD"
    views: v.optional(v.number()),
    fetchedAt: v.optional(v.number()),
  }).index("by_workspace_date", ["workspaceId", "date"]),

  // 4) threadsAccountTotals — kumulativne metrike naloga
  threadsAccountTotals: defineTable({
    workspaceId: v.id("workspaces"),
    likes: v.optional(v.number()),
    replies: v.optional(v.number()),
    reposts: v.optional(v.number()),
    quotes: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // 5) threadsClicksByUrl — clicks razbijeno po URL-u (temelj za spajanje sa orLinkClicks)
  threadsClicksByUrl: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD"
    url: v.string(),
    clicks: v.optional(v.number()),
    fetchedAt: v.optional(v.number()),
  })
    .index("by_workspace_date_url", ["workspaceId", "date", "url"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_url", ["workspaceId", "url"]),

  // 6) threadsFollowerSnapshots — dnevna istorija broja pratilaca
  threadsFollowerSnapshots: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD"
    takenAt: v.number(), // Unix timestamp u ms
    followersCount: v.optional(v.number()),
  })
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_takenAt", ["workspaceId", "takenAt"]),

  // 7) threadsDemographics — demografski podaci po kombinaciji
  threadsDemographics: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD"
    breakdown: v.union(
      v.literal("country"),
      v.literal("city"),
      v.literal("age"),
      v.literal("gender"),
    ),
    key: v.string(),
    value: v.optional(v.number()),
    takenAt: v.number(),
  })
    .index("by_workspace_date_breakdown_key", [
      "workspaceId",
      "date",
      "breakdown",
      "key",
    ])
    .index("by_workspace_date_breakdown", [
      "workspaceId",
      "date",
      "breakdown",
    ])
    .index("by_workspace_breakdown", ["workspaceId", "breakdown"]),

  // 8) threadsReplies — odgovori sa sync-a i webhook-a
  threadsReplies: defineTable({
    workspaceId: v.id("workspaces"),
    replyId: v.string(), // Meta reply ID (prirodni ključ za dedup)
    text: v.optional(v.string()),
    username: v.optional(v.string()),
    permalink: v.optional(v.string()),
    timestamp: v.optional(v.union(v.string(), v.number())),
    mediaType: v.optional(v.string()), // string, NE union
    mediaUrl: v.optional(v.string()),
    shortcode: v.optional(v.string()),
    ownerId: v.optional(v.string()),
    rootPostId: v.optional(v.string()), // root_post{id}
    repliedToId: v.optional(v.string()), // replied_to{id}
    isReply: v.optional(v.boolean()),
    isReplyOwnedByMe: v.optional(v.boolean()),
    hasReplies: v.optional(v.boolean()),
    replyAudience: v.optional(v.string()),
    approvalStatus: v.optional(v.string()),
    hideStatus: v.optional(v.string()),
    source: v.string(), // "webhook" | "sync"
    receivedAt: v.optional(v.number()),
  })
    .index("by_reply_id", ["replyId"])
    .index("by_workspace_reply", ["workspaceId", "replyId"])
    .index("by_workspace_root_post", ["workspaceId", "rootPostId"])
    .index("by_workspace_replied_to", ["workspaceId", "repliedToId"])
    // Ingest inbound leadova čita ovu tabelu u paketima, po redosledu nastanka.
    // Convex svakom indeksu implicitno dodaje `_creationTime` kao poslednje
    // polje, pa indeks sa SAMO `workspaceId` dozvoljava opseg
    // `.gt("_creationTime", kursor)`. Sa indeksom koji ima još jedno polje
    // ispred (npr. `replyId`) čitanje ide redosledom TOG polja, pa kursor po
    // vremenu nastanka preskače zapise zauvek. (LM5.1)
    .index("by_workspace_created", ["workspaceId"]),

  // 9) threadsMentions — spominjanja sa webhook-a i sync-a
  threadsMentions: defineTable({
    workspaceId: v.id("workspaces"),
    mentionId: v.string(), // Meta mention ID (prirodni ključ za dedup)
    mediaId: v.optional(v.string()),
    text: v.optional(v.string()),
    username: v.optional(v.string()),
    permalink: v.optional(v.string()),
    timestamp: v.optional(v.union(v.string(), v.number())),
    mediaType: v.optional(v.string()), // string, NE union
    source: v.optional(v.string()), // "webhook" | "sync"
    repliedAt: v.optional(v.number()),
    replyText: v.optional(v.string()),
    syncedAt: v.optional(v.number()),
  })
    .index("by_mention_id", ["mentionId"])
    .index("by_workspace_mention", ["workspaceId", "mentionId"])
    .index("by_workspace_media", ["workspaceId", "mediaId"])
    // Ingest inbound leadova čita ovu tabelu u paketima, po redosledu nastanka.
    // Convex svakom indeksu implicitno dodaje `_creationTime` kao poslednje
    // polje, pa indeks sa SAMO `workspaceId` dozvoljava opseg
    // `.gt("_creationTime", kursor)`. Sa indeksom koji ima još jedno polje
    // ispred (npr. `replyId`) čitanje ide redosledom TOG polja, pa kursor po
    // vremenu nastanka preskače zapise zauvek. (LM5.1)
    .index("by_workspace_created", ["workspaceId"]),

  // 10) threadsQuota — kvote iz odeljka 8 (used i total odvojeno, bez izvedenih procenata)
  threadsQuota: defineTable({
    workspaceId: v.id("workspaces"),
    postsUsed: v.optional(v.number()),
    postsTotal: v.optional(v.number()),
    repliesUsed: v.optional(v.number()),
    repliesTotal: v.optional(v.number()),
    deleteUsed: v.optional(v.number()),
    deleteTotal: v.optional(v.number()),
    locationSearchUsed: v.optional(v.number()),
    locationSearchTotal: v.optional(v.number()),
    keywordSearchUsed: v.optional(v.number()),
    keywordSearchTotal: v.optional(v.number()),
    profileLookupUsed: v.optional(v.number()),
    profileLookupTotal: v.optional(v.number()),
    quotaDurationSeconds: v.optional(v.number()),
    fetchedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // ── Threads objavljivanje: red poslova i praćenje stanja ─────────────────────
  //
  // Objavljivanje na Threads je asinhroni dvokoračni proces (ili trokoračni za
  // Carousel): kreiranje kontejnera (ili više child kontejnera) -> čekanje na obradu
  // (status FINISHED) -> slanje threads_publish zahteva. Kontejner na Meta strani
  // živi 24h. Sve faze ovog toka se čuvaju u bazi kako bi cron i akcije mogli da
  // nastave rad bez obzira na osvežavanje ili zatvaranje stranice u browseru.
  //
  // Redovi se nikada ne brišu pri neuspehu: operater mora da vidi na kom je koraku
  // objava stala i zbog čega nije otišla.
  threadsPublishJobs: defineTable({
    workspaceId: v.id("workspaces"),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),

    updatedAt: v.number(),
    // Tip objave na Threads-u (§4.2). TEXT nema medije, IMAGE/VIDEO tačno jedan,
    // CAROUSEL od 2 do 20 slajdova.
    mediaType: v.union(
      v.literal("TEXT"),
      v.literal("IMAGE"),
      v.literal("VIDEO"),
      v.literal("CAROUSEL"),
    ),
    // Tekstualni sadržaj objave. Do 500 karaktera (broji se u UTF-8 bajtovima zbog emojija).
    text: v.optional(v.string()),
    // Fajlovi u Convex storage-u poređani tačno po redosledu slajdova (prazan niz za TEXT).
    storageIds: v.array(v.id("_storage")),
    // Javne adrese `/threads-upload/<storageId>` sa kojih Meta preuzima fajlove.
    mediaUrls: v.array(v.string()),
    contentTypes: v.array(v.string()),
    // Opcioni parametri za Threads objave (§4.2)
    replyToId: v.optional(v.string()), // ID objave na koju se odgovara
    replyControl: v.optional(
      v.union(
        v.literal("everyone"),
        v.literal("accounts_you_follow"),
        v.literal("mentioned_only"),
        v.literal("parent_post_author_only"),
        v.literal("followers_only"),
      ),
    ),
    allowlistedCountryCodes: v.optional(v.array(v.string())), // Geo-gating po ISO 3166-1 alpha-2
    altText: v.optional(v.string()), // Pristupačnost za medije (max 1000 karaktera, samo uz medij)
    linkAttachment: v.optional(v.string()), // URL link prilog (samo text-only objave)
    quotePostId: v.optional(v.string()), // Citiranje druge Threads objave
    topicTag: v.optional(v.string()), // Jedan tag po objavi (1-50 karaktera, bez . i &)
    isSpoilerMedia: v.optional(v.boolean()), // Zamućenje medija (samo IMAGE/VIDEO/CAROUSEL)
    isGhostPost: v.optional(v.boolean()), // Post koji se automatski arhivira posle 24h
    enableReplyApprovals: v.optional(v.boolean()), // Zahteva odobrenje odgovora
    crossreshareToIg: v.optional(v.boolean()), // Automatski cross-share na Instagram Story
    crossreshareToIgDarkMode: v.optional(v.boolean()), // Tamna tema za Instagram Story preview
    locationId: v.optional(v.string()), // ID lokacije iz GET /location_search
    autoPublishText: v.optional(v.boolean()), // Preskače publish korak za jednostavne tekstualne objave
    // Anketa sa 2 do 4 opcije (Dodatak A.1). Dozvoljena samo uz tekstualne objave.
    pollAttachment: v.optional(
      v.object({
        option_a: v.string(),
        option_b: v.string(),
        option_c: v.optional(v.string()),
        option_d: v.optional(v.string()),
      }),
    ),
    // ID glavnog Meta kontejnera dobijen iz POST /{user-id}/threads
    containerId: v.optional(v.string()),
    // ID-jevi child kontejnera za Carousel slajdove (čuvaju se redom kako se prave)
    childContainerIds: v.optional(v.array(v.string())),
    // Trenutak kada je kontejner poslat na obradu. Rok za čekanje teče odavde.
    processingSince: v.optional(v.number()),
    // Zakazano vreme objave (epoch ms).
    scheduledFor: v.optional(v.number()),
    status: v.union(
      v.literal("draft"),
      v.literal("queued"),
      v.literal("uploading"),
      // Upisuje se PRE slanja POST /{user-id}/threads_publish poziva kako bi u slučaju
      // prekida mreže sledeći prolaz proverio stanje na Meta serveru umesto duplog slanja.
      v.literal("publishing"),
      v.literal("processing"),
      v.literal("published"),
      v.literal("failed"),
      v.literal("canceled"),
    ),
    attempts: v.number(),
    // Vreme kada je akcija preuzela posao. Sprečava da se posao tretira kao aktivan ako je akcija umrla.
    claimedAt: v.optional(v.number()),
    // Vreme slanja threads_publish poziva (služi kao zaključavanje protiv dvostrukog objavljivanja).
    publishStartedAt: v.optional(v.number()),
    // Fence token iz claimJob funkcije — sprečava trku između dva konkurentna procesa.
    runToken: v.optional(v.string()),
    error: v.optional(v.string()),
    publishedMediaId: v.optional(v.string()),
    // Postoji na profilu ali ID nije mogao biti potvrđen
    mediaIdUnconfirmed: v.optional(v.boolean()),
    publishedAt: v.optional(v.number()),
    // Vreme brisanja fajlova iz storage-a (nakon objave ili kroz 24h sweep).
    filesDeletedAt: v.optional(v.number()),
  })
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_status_scheduled", ["status", "scheduledFor"])
    .index("by_pending_files_created", ["filesDeletedAt", "createdAt"])
    .index("by_status_claimed", ["status", "claimedAt"]),

  // ── Threads objavljivanje: privremeno evidentirani uploadovani fajlovi ───────
  //
  // Pre nego što se posao (job) kreira, browser uploaduje fajl u storage i saznaje storageId.
  // Ovaj red zatvara prazninu između uploada i poziva createJob. Kada createJob uspe,
  // red se briše. Ako kreiranje ne uspe ili korisnik odustane, 24h sweep čisti siročiće.
  threadsPublishUploads: defineTable({
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  })
    .index("by_storage", ["storageId"])
    .index("by_created", ["createdAt"])
    .index("by_workspace", ["workspaceId"]),

  // ── Threads objavljivanje: mapa fajla ka poslu za autorizaciju rute ──────────
  //
  // Javna ruta `/threads-upload/<storageId>` mora brzo da proveri da li fajl pripada
  // aktivnom poslu objavljivanja pre serviranja bajtova Meta fetcher-u.
  // Prisustvo reda ovde jeste autorizacija.
  threadsPublishFiles: defineTable({
    workspaceId: v.id("workspaces"),
    storageId: v.id("_storage"),
    jobId: v.id("threadsPublishJobs"),
  })
    .index("by_storage", ["storageId"])
    .index("by_job", ["jobId"]),

  // ── Threads Automations (OpenReply za Threads — TH8 / TH14) ────────────────
  threadsAutomations: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    // Okidači: reply_to_our_post (webhook), mention (polling), keyword (search pretraga javnog sadržaja — traži App Review)
    trigger: v.union(
      v.literal("reply_to_our_post"),
      v.literal("mention"),
      v.literal("keyword"),
    ),
    keywords: v.array(v.string()), // lista ključnih reči
    matchType: v.union(v.literal("exact"), v.literal("contains")), // podudaranje tačno / sadrži
    caseSensitive: v.boolean(), // razlikovanje malih/velikih slova
    matchAnyKeyword: v.boolean(), // true = bilo koja ključna reč, false = sve
    requireExactPhrase: v.optional(v.boolean()), // podudaranje na granicama reči / celih fraza
    matchAnyPost: v.boolean(), // true = bilo koja objava, false = samo `postId`
    postId: v.optional(v.string()),
    // Akcije
    actionType: v.union(
      v.literal("public_reply"),
      v.literal("hide"),
      v.literal("ignore"),
      v.literal("approve_pending"),
    ),
    replyText: v.optional(v.string()), // Javni odgovor (tekst)
    linkUrl: v.optional(v.string()), // Opcioni praćeni link uz javni odgovor
    topicTag: v.optional(v.string()),
    autoPublishText: v.optional(v.boolean()),
    // OBAVEZNI zaštitni parametri iz upozorenja na kraju §9:
    mode: v.union(v.literal("draft"), v.literal("live")), // draft je jedina dozvoljena početna vrednost
    dailyLimit: v.number(), // Maksimalan broj akcija u 24h po pravilu
    cooldownMinutesPerAuthor: v.number(), // Pauza pre ponovnog gađanja istog autora
    maxRepliesPerThread: v.number(), // Maksimalan broj odgovora unutar iste niti/objave
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_active", ["workspaceId", "isActive"])
    .index("by_workspace_trigger", ["workspaceId", "trigger"]),

  // Evidencija obrađenih odgovora i spominjanja (sprečava višestruko okidanje nad istim autorom/odgovorom)
  threadsProcessedReplies: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("threadsAutomations")),
    replyId: v.string(), // ID komentara/odgovora/mentions-a
    // OPCION namerno. Threads ne vrati uvek autora; upisivati string
    // "unknown_author" značilo bi izmisliti identitet i strpati sve
    // neidentifikovane autore u jednu kofu ovog indeksa. Odsustvo polja je
    // jedini iskren zapis „ne znamo ko je“.
    authorId: v.optional(v.string()),
    rootPostId: v.optional(v.string()),
    trigger: v.union(
      v.literal("reply_to_our_post"),
      v.literal("mention"),
      v.literal("keyword"),
    ),
    actionType: v.string(),
    mode: v.union(v.literal("draft"), v.literal("live")),
    processedAt: v.number(),
  })
    .index("by_workspace_reply", ["workspaceId", "replyId"])
    .index("by_workspace_author", ["workspaceId", "authorId"])
    .index("by_workspace_author_time", ["workspaceId", "authorId", "processedAt"])
    .index("by_workspace_root_post", ["workspaceId", "rootPostId"])
    .index("by_workspace_automation", ["workspaceId", "automationId"]),

  // Revizioni log evaluacije i izvršavanja Threads automatizacija
  threadsAutomationLogs: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.optional(v.id("threadsAutomations")),
    trigger: v.union(
      v.literal("reply_to_our_post"),
      v.literal("mention"),
      v.literal("keyword"),
    ),
    sourceReplyId: v.string(),
    rootPostId: v.optional(v.string()),
    authorId: v.optional(v.string()), // vidi threadsProcessedReplies.authorId
    matchedKeyword: v.optional(v.string()),
    mode: v.union(v.literal("draft"), v.literal("live")),
    actionType: v.string(),
    status: v.union(
      v.literal("executed"),
      v.literal("draft_simulated"),
      v.literal("rejected_limit"),
      v.literal("rejected_cooldown"),
      v.literal("rejected_thread_limit"),
      v.literal("failed"),
      v.literal("skipped_no_match"),
    ),
    reason: v.optional(v.string()), // npr. "daily_limit_reached", "cooldown_active", "thread_limit_reached", "quota_exhausted", "api_error"
    errorMessage: v.optional(v.string()),
    jobId: v.optional(v.id("threadsPublishJobs")),
    date: v.string(), // "YYYY-MM-DD" UTC
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_workspace_automation", ["workspaceId", "automationId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_reply", ["workspaceId", "sourceReplyId"]),

  // ── Threads atribucija linkova i levak (funnel) (§10.2) ─────────────────────
  //
  // Spajanje dva nezavisna izvora klikova za isti link po (workspaceId, date):
  //   1) threadsClicks: zabeleženo u Threads aplikaciji (GET /me/threads_insights?metric=clicks)
  //   2) siteClicks: stvarni dolasci na sajt preko /r/ rute (orLinkClicks)
  //
  // PRAVILA (§10.2):
  // - Nikada ne skladištimo odnos, razliku ili procenat u bazu.
  // - Ako za određeni dan jedan izvor nije sinhronizovan, polje je ODSUTNO (undefined), nikada 0.
  // - Nespojeni URL-ovi (linkovi koji nisu /r/ praćeni linkovi) se čuvaju sa trackedLinkId = undefined
  //   i isMatched = false kako bi se rupa videla u UI-ju.
  threadsLinkAttribution: defineTable({
    workspaceId: v.id("workspaces"),
    date: v.string(), // "YYYY-MM-DD", UTC
    trackedLinkId: v.optional(v.id("orTrackedLinks")),
    rawUrl: v.string(),
    normalizedUrl: v.string(),
    destinationUrl: v.optional(v.string()),
    label: v.optional(v.string()),
    threadsClicks: v.optional(v.number()), // Broj klikova u Threads aplikaciji
    siteClicks: v.optional(v.number()), // Broj stvarnih dolazaka na sajt
    isMatched: v.boolean(), // true ako je uspešno spojen sa praćenim linkom, false ako je nespojen
    updatedAt: v.number(),
  })
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_workspace_link_date", ["workspaceId", "trackedLinkId", "date"])
    .index("by_workspace_url_date", ["workspaceId", "normalizedUrl", "date"])
    .index("by_workspace_matched", ["workspaceId", "isMatched"]),

  // 12) threadsSearchUsage — brojanje upita za pretragu i lookup profila (§6)
  // Keyword search (2.200 / 24h) i Profile lookup (1.000 / 24h) su odvojeni od kvota objavljivanja.
  // Prazni rezultati se kod keyword search-a NE broje, pa se brojač uvećava samo kad je rezultat neprazan.
  threadsSearchUsage: defineTable({
    workspaceId: v.id("workspaces"),
    action: v.union(
      v.literal("keyword_search"),
      v.literal("profile_lookup"),
    ),
    timestamp: v.number(),
    resultCount: v.number(),
    countedAgainstQuota: v.boolean(),
  })
    .index("by_workspace_action_time", [
      "workspaceId",
      "action",
      "timestamp",
    ])
    .index("by_workspace_time", ["workspaceId", "timestamp"]),



  // ── Brisanje preuzetih podataka (P3) ────────────────────────────────────────
  //
  // One row per erasure of one provider's data from one workspace. It exists
  // because YA2's version did not: the purge was a chain of `runAfter` calls
  // and nothing else, so a single failed pass — an OCC conflict with the
  // 15-minute comment poller is enough — took the scheduled continuation down
  // with it. Tens of thousands of rows carrying comment text and author names
  // stayed in the database for good, nobody was told, and nothing would ever
  // pick the work back up.
  //
  // So the chain now writes down where it is. Every pass commits its progress
  // in the SAME transaction as the deletions it just made, which means a pass
  // that dies loses only its own batch; `stepIndex` and `deletedTotal` still
  // describe exactly what is already gone. The 10-minute watchdog cron finds a
  // run whose `updatedAt` has stopped moving and starts it again from there.
  //
  // `fenceToken` is what makes the restart safe. The watchdog bumps it before
  // rescheduling, and every pass compares the token it was handed against the
  // one on the row — so a pass from the old chain that turns out to be alive
  // after all returns without touching anything instead of running beside the
  // new one.
  purgeRuns: defineTable({
    workspaceId: v.id("workspaces"),
    provider: providerValidator,
    // The connection row this erasure will delete once it is finished. Absent
    // only if that row disappeared some other way in the meantime.
    connectionId: v.optional(v.id("connections")),
    // The connection's `generation` when this run opened (R1/4c). A reconnect
    // reuses the SAME connection row, so `connectionId` alone cannot tell "the
    // grant this run is erasing" from "a fresh grant on the same row". Every pass
    // compares this against the live row and stops on a mismatch, so a resumed
    // stale chain can never reach into a reconnected account's data.
    connectionGeneration: v.optional(v.number()),
    startedAt: v.number(),
    // Touched by every pass that commits. The watchdog reads nothing else to
    // decide whether a run is still moving.
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
    // "done" is written ONLY when every step has answered with zero remaining
    // rows. There is no other way to reach it.
    status: v.union(
      v.literal("running"),
      v.literal("done"),
      v.literal("failed"),
    ),
    // How far through `purgeSteps(provider)` this run has got. A step is only
    // stepped past once it reports itself exhausted.
    stepIndex: v.number(),
    deletedTotal: v.number(),
    lastError: v.optional(v.string()),
    fenceToken: v.number(),
    // Consecutive watchdog restarts that produced no deletions. Reset to 0 by
    // any pass that deletes something, so a big slow purge is never mistaken
    // for a stuck one.
    resumes: v.number(),
    // Set once every step has been walked forward at least once. Deletion runs
    // in parallel with the revoke retries (R1/4d), so the run is only finalised
    // when this is true AND the revoke has settled — see `maybeFinalize`.
    deletionDone: v.optional(v.boolean()),
    // Verification cycles run after the forward pass (R1/4b). "done" is written
    // only when a WHOLE re-scan of every step deletes zero rows — the guarantee
    // that a webhook write which landed in an already-finished step's table
    // cannot be sealed in as "obrisano". `sweepDeleted` accumulates one cycle's
    // deletions across its several batches.
    finalSweeps: v.optional(v.number()),
    sweepDeleted: v.optional(v.number()),
    // How many times the revoke has been attempted (R1/4d). A failed attempt
    // keeps the credentials and retries, up to a ceiling, instead of the old
    // behaviour that wiped the token on the first failure and could never revoke
    // it again.
    revokeAttempts: v.optional(v.number()),
    // Whether the token was handed back to the provider BEFORE the credentials
    // were destroyed. "unsupported" means the provider has no revoke endpoint
    // for this kind of credential (a GA4 service account key, for one) — not
    // that the attempt failed.
    revokeStatus: v.union(
      v.literal("pending"),
      v.literal("ok"),
      v.literal("failed"),
      v.literal("unsupported"),
    ),
    revokeError: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_provider", ["workspaceId", "provider"])
    // The watchdog's only question: which runs claim to be running, oldest
    // heartbeat first.
    .index("by_status_updated", ["status", "updatedAt"]),

  // ── Webhook signature health (P3) ───────────────────────────────────────────
  //
  // A webhook whose signature does not verify answers 401 and says nothing
  // else — to Meta, which eventually unsubscribes, and to nobody at all here.
  // The failure mode this exists for is a deployment where the app secret sits
  // in a variable the verifier never reads: OAuth works, the sync works, the
  // card is green, and every single event is refused.
  //
  // One row per route ("instagram" / "facebook"), deployment-wide rather than
  // per workspace: the signature is checked before the payload is parsed, so
  // there is no workspace to attribute a refusal to yet.
  webhookSignatureFailures: defineTable({
    route: v.string(),
    failures: v.number(),
    lastFailureAt: v.number(),
    // Names the environment variable that has to be set. Shown verbatim in
    // Settings, so it is written for the person reading it there.
    lastReason: v.string(),
    // When a signature last verified. A counter without this cannot tell
    // "broken since forever" from "one stray request last Tuesday".
    lastOkAt: v.optional(v.number()),
  }).index("by_route", ["route"]),

  // ── Per-route hourly ceiling on the public HTTP routes (R1/2c, 2d) ──────────
  //
  // `/ig-media/` and `/r/` are public and unauthenticated, and each one drives a
  // write the caller does not pay for: `/ig-media/` an outbound Graph call,
  // `/r/` an `orLinkClicks` insert. A fixed-window counter per (workspace, route)
  // caps how many of those an hour of traffic can start; over the ceiling the
  // route stops the outbound work (serving the stale answer, or skipping the
  // click) and stamps `cappedAt` so Settings can say it happened.
  //
  // At most `limit`+1 writes to a row per window on purpose: once the count
  // reaches the ceiling the mutation stops incrementing, so a flood of requests
  // cannot turn this row itself into the write storm it exists to prevent.
  publicRouteUsage: defineTable({
    workspaceId: v.id("workspaces"),
    route: v.string(), // "ig-media" | "r"
    windowStartedAt: v.number(),
    count: v.number(),
    cappedAt: v.optional(v.number()),
  }).index("by_workspace_route", ["workspaceId", "route"]),

  // ── Lead mašina (LM1–LM10) ──────────────────────────────────────────────────

  // 1) leadCompanies — korenski entitet firme (§2.1)
  //
  // Jedan red = jedna firma. Predstavlja jedinstveni entitet oko koga se vezuju
  // osobe, kontakt identiteti, opaženi signali i istorijat pojedinačnih tvrdnji.
  //
  // Razdvajanje firme od kontakata i osoba sprečava propadanje baze u gomilu
  // ponovljenih redova: ista firma može imati više lokacija, telefona, vlasnika
  // i promena tokom vremena.
  //
  // Sva polja osim workspaceId, naziva, normalizovanog naziva, origin-a i vremena
  // su opciona jer odsustvo polja predstavlja stvaran podatak (npr. firma nema sajt
  // ili PIB još nije pronađen) — upisivanje lažnih podrazumevanih vrednosti ili
  // praznih stringova bi pokvarilo deduplikaciju i bodovanje (§0).
  leadCompanies: defineTable({
    workspaceId: v.id("workspaces"),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),

    // Poslovno ime firme u originalnom obliku iz izvora
    name: v.string(),
    // Normalizovan naziv (mala slova, bez pravnih oblika poput DOO/PR/SZR, bez dijakritika).
    // Neophodan za ključ #4 pri deduplikaciji; bez njega pretraga ne bi spojila "Šljivić DOO" i "Sljivic".
    nameNormalized: v.string(),

    // Zvanični poreski identifikacioni broj — najjači dedupe ključ (#1)
    pib: v.optional(v.string()),
    // Matični broj iz APR registra
    maticniBroj: v.optional(v.string()),
    // Šifra pretežne delatnosti (npr. "9602" za frizerske i kozmetičke salone)
    sifraDelatnosti: v.optional(v.string()),

    // Zvanični sajt i normalizovan domen (ključ #3 za deduplikaciju)
    website: v.optional(v.string()),
    domainNormalized: v.optional(v.string()),

    // Lokacijski podaci — ulica, opština i grad
    street: v.optional(v.string()),
    municipality: v.optional(v.string()),
    city: v.optional(v.string()),

    // Stabilan CompanyWall URL — najčešći jedinstveni identifikator u uvezenim tabelama (§3 ključ #2)
    companyWallUrl: v.optional(v.string()),
    // Naziv izvora iz kog je firma prvi put uneta (npr. "google_maps", "companywall", "inbound_instagram")
    firstSeenSource: v.optional(v.string()),

    // Zastavica za sumnjive lokacije iz uvoza gde je u tekstu stajalo "(proveriti adresu)" (§5.2)
    addressNeedsVerification: v.optional(v.boolean()),

    // Poreklo unosa: "inbound" (samoinicijativni kontakt) ili "import" (ručni uvoz tabele).
    // Neophodno jer se inbound leadovi u interfejsu vizuelno izdvajaju kao prioritetni (§1).
    origin: v.union(v.literal("inbound"), v.literal("import")),

    // Temperatura leada (§1, §3) — trajno polje na firmi
    temperatura: v.optional(
      v.union(
        v.literal("nova_firma"),
        v.literal("cold"),
        v.literal("warm"),
        v.literal("hot"),
      ),
    ),
    temperaturaPromenjenaAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_pib", ["workspaceId", "pib"])
    .index("by_workspace_companywall", ["workspaceId", "companyWallUrl"])
    .index("by_workspace_domain", ["workspaceId", "domainNormalized"])
    .index("by_workspace_name_city", ["workspaceId", "nameNormalized", "city"]),

  // 2) leadPeople — fizičko lice vezano za firmu (§2.2)
  //
  // Jedan red = jedna osoba unutar firme.
  //
  // OSOBA BEZ FIRME NE POSTOJI: polje companyId je striktno obavezno. Ako uvoz
  // naiđe na osobu bez firme, to je greška uvoznika a ne samostalni entitet.
  // Razdvajanje osoba od same firme omogućava podršku za više suvlasnika, direktora
  // ili promenu menadžmenta bez prepisivanja istorije firme.
  leadPeople: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    name: v.string(),
    // Uloga osobe u privrednom subjektu
    role: v.union(
      v.literal("vlasnik"),
      v.literal("direktor"),
      v.literal("menadzer"),
      v.literal("nepoznato"),
    ),
    // Nivo sigurnosti uloge (npr. potvrđeno iz APR-a naspram slobodne procene iz napomene)
    roleConfidence: v.union(
      v.literal("potvrdjeno"),
      v.literal("verovatno"),
      v.literal("nepoznato"),
    ),
    createdAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_company", ["workspaceId", "companyId"]),

  // 3) leadIdentities — pojedinačni kanali komunikacije (§2.3, §8)
  //
  // Jedan red = tačno jedan kontakt kanal (telefon, email, IG nalog, FB stranica, website).
  //
  // NIKADA se ne čuva više kontakata u jednom polju. Svaki kontakt nosi sopstveno
  // poreklo i pravni osnov. Telefon centrale vezuje se direktno za firmu bez personId-ja,
  // dok se lični mobilni telefon vezuje i za firmu i za konkretnu osobu.
  //
  // Polja lawfulBasis i sourceUrl su OBAVEZNA po ZZPL/GDPR pravilima (§8): bez
  // zabeleženog pravnog osnova i izvora sistem ne poseduje pravnu odbranu za obradu.
  leadIdentities: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    // Opciono — kontakt može pripadati firmi (centrala) ili konkretnoj osobi
    personId: v.optional(v.id("leadPeople")),

    kind: v.union(
      v.literal("phone"),
      v.literal("email"),
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("website"),
      v.literal("threads"),
    ),
    // Sirova vrednost kontakta
    value: v.string(),
    // Normalizovana vrednost (npr. +381... za telefone) za deduplikaciju po kontaktu (§3 ključ #5)
    valueNormalized: v.optional(v.string()),

    // Da li je kontakt operativno verifikovan (npr. uspešno poslat SMS/email)
    isVerified: v.optional(v.boolean()),

    // Pravni osnov obrade podataka o ličnosti po ZZPL/GDPR (§8) — OBAVEZNO
    lawfulBasis: v.string(),
    // Tačna URL adresa ili dokument odakle je kontakt preuzet (§8) — OBAVEZNO
    sourceUrl: v.string(),

    // Datum kada je lice obavešteno o obradi podataka (rok od 30 dana po ZZPL kada podaci nisu uzeti direktno)
    dataSubjectNotifiedAt: v.optional(v.number()),
    createdAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_kind_value", ["workspaceId", "kind", "valueNormalized"])
    .index("by_workspace_company", ["workspaceId", "companyId"])
    .index("by_person", ["personId"]),

  // 4) leadFieldProvenance — istorija i poreklo svake pojedinačne tvrdnje (§2.4)
  //
  // KLJUČNO PRAVILO:
  // Sukobljene tvrdnje se ČUVAJU obe i u korisničkom interfejsu prikazuju kao sukob.
  // Spajanje (merge) ili ponovni uvoz nikada ne sme tiho da obriše niti prepiše tuđu tvrdnju!
  //
  // Primer iz stvarnih podataka (§2.4, §5): u tabeli za "Pro Team Borča" u koloni `Ime_osobe`
  // stoji "Adaleta Krasnić", dok u napomeni istog reda piše "Vlasnik: Ana Krasnić".
  // Bez tabele porekla, poslednji upis bi tiho pregazio prethodni i lažna ili konfliktna
  // informacija bi ostala neprimećena. Tabela omogućava uvid u sve izvore koji su tvrdili
  // određenu vrednost za bilo koje polje entiteta.
  leadFieldProvenance: defineTable({
    workspaceId: v.id("workspaces"),
    // Tabela entiteta na koji se tvrdnja odnosi
    entityTable: v.union(
      v.literal("leadCompanies"),
      v.literal("leadPeople"),
      v.literal("leadIdentities"),
    ),
    // ID zapisa kao string (jer povezuje tri različite Convex tabele)
    entityId: v.string(),
    // Naziv polja čija se vrednost beleži (npr. "name", "role", "street", "phone")
    fieldName: v.string(),
    // Opažena vrednost u tekstualnom obliku
    value: v.string(),

    // Izvor tvrdnje (npr. "companywall", "apr", "google_maps", "user_edit")
    source: v.string(),
    // URL adresa izvora ako je dostupna
    sourceUrl: v.optional(v.string()),
    // Stepen pouzdanosti izvora
    confidence: v.union(
      v.literal("tacno"),
      v.literal("priblizno"),
      v.literal("nepoznato"),
    ),
    // Da li je tvrdnju pregledao i potvrdio čovek (operater)
    humanConfirmed: v.boolean(),
    // Vreme kada je činjenica opažena
    observedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_entity_field", [
      "workspaceId",
      "entityTable",
      "entityId",
      "fieldName",
    ]),

  // 5) leadSignals — pojedinačne opažene činjenice i događaji (§2.5, §4.1, §7)
  //
  // Jedan red = jedna opažena činjenica sa datumom i izvorom.
  //
  // Signali se NE sabiraju u broj koji se čuva u bazi (§0, §2.5). Ocena leada se
  // računa dinamički pri čitanju (LM6).
  //
  // VAŽNO ZA `landing_opened` (§7):
  // Svako otvaranje besplatne stranice beleži se kao ZASEBAN RED u ovoj tabeli,
  // a ne kao brojač koji se uvećava. Samo tako ostaje odgovorljivo pitanje
  // „koliko puta i TAČNO KADA je stranica otvorena", dok brojač to gubi.
  //
  // Za signale koji predstavljaju odnos (npr. ocena 9.4 od 10), čuvaju se
  // `numerator` (9.4) i `denominator` (10) odvojeno. NIKADA se ne čuva već
  // izračunata stopa (§0 pravilo #2).
  leadSignals: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    // Opciono — signal može biti vezan za konkretnu osobu (npr. poslat DM, komentar, pitanje)
    personId: v.optional(v.id("leadPeople")),

    // Tip opaženog signala (§4.1, §7)
    kind: v.union(
      v.literal("nema_sajt"),
      v.literal("koristi_third_party_booking"),
      v.literal("samo_facebook"),
      v.literal("samo_instagram"),
      v.literal("visok_broj_recenzija"),
      v.literal("novootvorena_firma"),
      v.literal("landing_opened"),
      v.literal("r_link_clicked"),
      v.literal("komentar"),
      v.literal("dm"),
      v.literal("mention"),
      v.literal("pitao_cenu"),
      v.literal("ostalo"),
    ),

    // Opciona tekstualna vrednost (npr. naziv booking alata "Setmore", broj recenzija "133")
    value: v.optional(v.string()),

    // Brojilac i imenilac za ocene i odnose (npr. 9.4 i 10). NIKADA izračunata stopa.
    numerator: v.optional(v.number()),
    denominator: v.optional(v.number()),

    // Vreme kada je signal opažen
    observedAt: v.number(),
    // Naziv izvora signala (npr. "landing_tracker", "instagram", "google_maps", "companywall")
    source: v.string(),
    // Opcioni URL izvora ili događaja
    sourceUrl: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_company", ["workspaceId", "companyId"])
    .index("by_workspace_kind", ["workspaceId", "kind"])
    .index("by_workspace_company_kind", [
      "workspaceId",
      "companyId",
      "kind",
    ]),

  // 6) leadIcpRules — podesiva pravila idealnog profila kupca (ICP) (§4)
  //
  // Definiše težine pojedinačnih signala za ose FIT (koliko firma odgovara profilu kupca)
  // i INTENT (koliko je firma trenutno aktivna/zagrejana na tržištu).
  //
  // Težine žive u bazi podataka baš zato da bi se mogle menjati i kalibrisati
  // bez potrebe za novim deploy-om koda.
  //
  // KLJUČNO PRAVILO (§0, §4):
  // Rezultat bodovanja se NIKADA ne upisuje nazad u firmu niti u lead; ocena i
  // lista signala („zašto") se računaju isključivo dinamički pri čitanju.
  leadIcpRules: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    // Osa kojoj pravilo doprinosi: profil kupca (fit) ili trenutna namera (intent)
    axis: v.union(v.literal("fit"), v.literal("intent")),
    // Tip signala na koji se pravilo odnosi (iz skupa signal kinds)
    signalKind: v.string(),
    // Težina pravila (doprinos ukupnom skoru na toj osi)
    weight: v.number(),
    // Zašto baš ova težina — jedna rečenica, vidljiva operateru pri izmeni.
    // Broj bez obrazloženja se posle šest meseci menja nasumično, jer niko
    // više ne zna na osnovu čega je postavljen.
    rationale: v.optional(v.string()),
    // Da li je pravilo trenutno aktivno pri evaluaciji
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_axis", ["workspaceId", "axis"]),

  // 7) leadSuppression — lista zabrane kontakta („ne diraj" lista) (§9.3)
  //
  // Čuva identifikatore privrednih subjekata i osoba kojima se ne sme slati
  // ponuda niti inicirati prodajni kontakt (postojeći klijenti, odbijeni,
  // zatražen opt-out, interni test unosi).
  //
  // KLJUČNO PRAVILO:
  // Provera se radi PRI UVOZU podataka, a ne pri pozivanju. Time se sprečava da
  // se sopstveni klijenti ili zaštićeni kontakti uopšte uvezu kao hladni leadovi.
  // Sve vrednosti se čuvaju u strogo normalizovanom obliku (putem funkcija iz `leadNormalize.ts`).
  leadSuppression: defineTable({
    workspaceId: v.id("workspaces"),
    // Razlog zabrane kontakta
    kind: v.union(
      v.literal("postojeci_klijent"),
      v.literal("rekao_ne"),
      v.literal("trazio_da_ga_ne_zovemo"),
      v.literal("interno"),
    ),
    // Ključ po kom se vrši provera podudaranja pri uvozu
    matchOn: v.union(
      v.literal("pib"),
      v.literal("domain"),
      v.literal("phone"),
      v.literal("email"),
      v.literal("companyId"),
    ),
    // Normalizovana vrednost identifikatora (npr. +381... za telefon, čist domen bez www)
    value: v.string(),
    // Opciono obrazloženje zabrane kontakta
    reason: v.optional(v.string()),
    // Korisnik koji je uneo zabranu u sistem
    addedBy: v.optional(v.id("users")),
    addedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_match", ["workspaceId", "matchOn", "value"]),

  // 8) leadAssignments — vlasništvo nad leadom, faza toka i ishod (§9.1)
  //
  // Sprečava koliziju unutar tima: svaki lead ima tačno jednog zaduženog člana
  // tima, zabeležen datum poslednjeg dodira i planiran datum sledećeg koraka.
  //
  // KLJUČNO PRAVILO:
  // `stage` (faza u prodajnom toku) i `outcome` (ishod) su DVE RAZLIČITE stvari i
  // ne smeju se spajati u jedno polje. Na primer: „izgubljen" je faza (stage),
  // dok je „nije se javio tri puta" ili „preskupo" konkretan ishod (outcome).
  leadAssignments: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    // Član tima zadužen za komunikaciju sa leadom
    ownerUserId: v.id("users"),

    // Trenutna faza u prodajnom toku
    stage: v.union(
      v.literal("nov"),
      v.literal("u_radu"),
      v.literal("poslata_ponuda"),
      v.literal("sastanak"),
      v.literal("dobijen"),
      v.literal("izgubljen"),
      v.literal("odlozen"),
    ),

    // Datum poslednjeg kontakta sa leadom
    lastTouchAt: v.optional(v.number()),
    // Datum i vreme kada je planirana sledeća radnja
    nextActionAt: v.optional(v.number()),
    // Napomena za sledeći korak (npr. "Pozvati u 18h posle smene")
    nextActionNote: v.optional(v.string()),

    // Zabeležen ishod komunikacije
    outcome: v.optional(v.string()),
    // Vreme kada je ishod zabeležen
    outcomeAt: v.optional(v.number()),

    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_owner", ["workspaceId", "ownerUserId"])
    .index("by_workspace_stage", ["workspaceId", "stage"])
    .index("by_workspace_next_action", ["workspaceId", "nextActionAt"])
    .index("by_workspace_company", ["workspaceId", "companyId"]),

  // 8b) leadStageEvents — istorijat promena faza, dodela, dodira i ishoda (§9.1, LM8)
  leadStageEvents: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    // Šta se promenilo
    kind: v.union(
      v.literal("dodela"), // lead dobio ili promenio vlasnika
      v.literal("faza"), // pomeren kroz tok
      v.literal("dodir"), // zabeležen kontakt sa klijentom
      v.literal("ishod"), // zabeležen ishod
      v.literal("sledeci_korak"), // postavljen ili pomeren sledeći korak
    ),
    // Prethodna i nova vrednost — obe opcione, jer prva dodela nema prethodnu.
    // Prazan string NIJE dozvoljen kao „nema prethodne".
    fromValue: v.optional(v.string()),
    toValue: v.optional(v.string()),
    // Ko je izveo radnju. Obavezno: promena bez autora je promena bez odgovornosti.
    actorUserId: v.id("users"),
    note: v.optional(v.string()),
    /**
     * Da li je `occurredAt` vreme koje je čovek POTVRDIO, ili vreme unosa
     * uzeto kao zamena.
     *
     * Postoji kao polje zato što je ranije stajalo kao tekst zalepljen u
     * `note` („[automatsko_vreme] …"). Stanje sistema upisano u slobodan
     * tekst na srpskom znači da svaki budući kod mora da parsira rečenicu da
     * bi saznao činjenicu — a operater u međuvremenu čita tehničku oznaku u
     * svojoj napomeni.
     */
    timeConfirmed: v.optional(v.boolean()),
    occurredAt: v.number(),
  })
    .index("by_workspace_company", ["workspaceId", "companyId"])
    .index("by_workspace_actor", ["workspaceId", "actorUserId"])
    .index("by_workspace_kind", ["workspaceId", "kind"]),

  // 9) leadImports — pojedinačni uvoz tabele lidova u staging (§5, LM3)
  leadImports: defineTable({
    workspaceId: v.id("workspaces"),
    fileName: v.string(),
    uploadedBy: v.optional(v.id("users")),
    uploadedAt: v.number(),

    // Status obrade uvoza u staging-u
    status: v.union(
      v.literal("parsiran"),
      v.literal("u_pregledu"),
      v.literal("primenjen"),
      v.literal("ponisten"),
      v.literal("neuspeo"),
    ),

    // Izabrani sheetovi i statistika parsiranja
    sheetsChosen: v.array(v.string()),
    headerRowIndex: v.number(),
    rowsParsed: v.number(),
    rowsSkipped: v.number(),
    warnings: v.array(v.string()),
    // Kolone koje je čovek sklonio u staging koraku (§3)
    skriveneKolone: v.array(v.string()),

    appliedAt: v.optional(v.number()),
    revertedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  // 10) leadImportRows — pojedinačni red uvoza u staging-u (§5, LM3)
  leadImportRows: defineTable({
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
    sourceSheet: v.string(),
    sourceRowIndex: v.number(),

    // Ceo parsirani red
    parsed: v.object({
      nazivFirme: v.optional(v.string()),
      ulica: v.optional(v.string()),
      opstina: v.optional(v.string()),
      grad: v.optional(v.string()),
      telefon: v.optional(v.string()),
      telefonNapomena: v.optional(v.string()),
      email: v.optional(v.string()),
      sajt: v.optional(v.string()),
      imeOsobe: v.optional(v.string()),
      uloga: v.optional(v.string()),
      ocena: v.optional(
        v.object({
          vrednost: v.optional(v.number()),
          skala: v.optional(v.number()),
          brojRecenzija: v.optional(v.number()),
          izvor: v.optional(v.string()),
        }),
      ),
      companyWallUrl: v.optional(v.string()),
      companyWallTacnost: v.optional(
        v.union(v.literal("tacno"), v.literal("priblizno")),
      ),
      pib: v.optional(v.string()),
      maticniBroj: v.optional(v.string()),
      sifraDelatnosti: v.optional(v.string()),
      napomena: v.optional(v.string()),
      izvori: v.array(v.string()),
      derivedSignals: v.array(v.string()),
      derivedFields: v.optional(v.array(v.string())),
    }),

    // Ceo red kako je stigao iz fajla, u izvornom redosledu kolona (§3)
    sirovo: v.array(
      v.object({ kolona: v.string(), vrednost: v.string() }),
    ),

    // Temperatura postavljena u staging koraku; prenosi se na lead pri uvozu (§3)
    temperatura: v.union(
      v.literal("nova_firma"),
      v.literal("cold"),
      v.literal("warm"),
      v.literal("hot"),
    ),

    // Meko brisanje (§3)
    obrisan: v.boolean(),

    // Deduplikacija i spajanje
    matchedCompanyId: v.optional(v.id("leadCompanies")),
    matchedBy: v.optional(
      v.union(
        v.literal("pib"),
        v.literal("companywall"),
        v.literal("domain"),
        v.literal("name_city"),
        v.literal("phone"),
      ),
    ),

    // Odluka operatera / sistema
    decision: v.union(
      v.literal("nova_firma"),
      v.literal("spoji"),
      v.literal("preskoci"),
      v.literal("nerazreseno"),
    ),

    // Detektovani sukobi vrednosti
    conflicts: v.array(
      v.object({
        field: v.string(),
        postojeca: v.string(),
        nova: v.string(),
        izvor: v.string(),
      }),
    ),

    // Ishod provere zabrane kontakta (suppression)
    suppression: v.optional(
      v.object({
        suppressed: v.boolean(),
        matchedOn: v.optional(
          v.union(
            v.literal("pib"),
            v.literal("domain"),
            v.literal("phone"),
            v.literal("email"),
            v.literal("companyId"),
          ),
        ),
        unverifiable: v.optional(
          v.array(
            v.union(
              v.literal("pib"),
              v.literal("domain"),
              v.literal("phone"),
              v.literal("email"),
              v.literal("companyId"),
            ),
          ),
        ),
      }),
    ),

    // ID kreirane firme ako je uvoz primenjen (potrebno za poništavanje / revert)
    createdCompanyId: v.optional(v.id("leadCompanies")),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_import", ["workspaceId", "importId"])
    .index("by_import_decision", ["importId", "decision"]),

  // 11) leadInbound — čekaonica za inbound leadove sa platformi (LM5, §1, §2)
  //
  // Inbound je OSOBA BEZ POZNATE FIRME. Shema u leadCompanies i leadPeople zabranjuje
  // osobu bez firme i traži obavezan naziv firme. Zato inbound NE ULAZI direktno
  // u leadCompanies, već u ovu čekaonicu dok operater ne potvrdi firmu.
  //
  // Nijedan inbound zapis ne sme da izmisli naziv firme. Ako naziv nije poznat,
  // polje ne postoji — ne upisuje se prazan string, ni handle, ni „Nepoznato".
  leadInbound: defineTable({
    workspaceId: v.id("workspaces"),
    platform: v.union(
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("threads"),
    ),
    kind: v.union(
      v.literal("komentar"),
      v.literal("odgovor"),
      v.literal("dm"),
      v.literal("mention"),
    ),
    // Stabilan ID događaja na platformi — jedini ključ protiv duplog upisa
    externalId: v.string(),
    // Autor: SAMO ID sa platforme i heš handle-a. Sirov handle, e-mail i
    // broj telefona NE SMEJU da uđu u ovu tabelu.
    authorPlatformId: v.optional(v.string()),
    authorHandleHash: v.optional(v.string()),
    // Tekst poruke je poslovni sadržaj i ostaje, ali se ne loguje nigde.
    text: v.optional(v.string()),
    occurredAt: v.number(),
    sourceUrl: v.optional(v.string()),
    // Ishod trijaže
    status: v.union(
      v.literal("nov"),
      v.literal("povezan"),
      v.literal("odbacen"),
      v.literal("zabranjen_kontakt"),
    ),
    linkedCompanyId: v.optional(v.id("leadCompanies")),
    linkedPersonId: v.optional(v.id("leadPeople")),

    // Razlog odbacivanja. Postoji zato što je `dismissInbound` tražio obavezan
    // razlog i zatim ga bacao — obavezno polje koje se ne čuva je pozorište.
    dismissReason: v.optional(v.string()),
    dismissedAt: v.optional(v.number()),
    dismissedBy: v.optional(v.id("users")),

    // Signali prepoznati iz teksta (koristi LEAD_SIGNAL_KINDS)
    derivedSignals: v.array(v.string()),
    // Ako autor nije mogao da se proveri na listi zabrane
    suppressionUnverifiable: v.optional(v.array(v.string())),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_status", ["workspaceId", "status"])
    .index("by_workspace_platform_external", [
      "workspaceId",
      "platform",
      "externalId",
    ])
    .index("by_workspace_author", [
      "workspaceId",
      "platform",
      "authorPlatformId",
    ])
    // Autor + status: bez ovoga se svaki novi komentar plaćao učitavanjem SVIH
    // ranijih zapisa tog autora, samo da bi se našao jedan „povezan".
    .index("by_workspace_author_status", [
      "workspaceId",
      "platform",
      "authorPlatformId",
      "status",
    ]),

  // 12) leadInboundCursor — evidencija dokle je ingest stigao po izvoru (LM5.1)
  leadInboundCursor: defineTable({
    workspaceId: v.id("workspaces"),
    source: v.union(
      v.literal("threadsReplies"),
      v.literal("threadsMentions"),
      v.literal("igComments"),
      v.literal("fbComments"),
      v.literal("orInboundMessages"),
    ),
    // Dokle je ingest stigao: _creationTime poslednjeg OBRAĐENOG dokumenta.
    // Namerno _creationTime, a NE timestamp sa platforme: platformsko vreme
    // može da stigne van redosleda i tada kursor preskoči zapise zauvek.
    lastCreationTime: v.number(),
    // ID poslednjeg obrađenog dokumenta.
    //
    // NE koristi se kao deo granice čitanja — granica je isključivo
    // `.gt("_creationTime", lastCreationTime)` po indeksu `by_workspace_created`.
    // Ostaje kao dijagnostika: kad ingest stane ili preskoči nešto, ovo je
    // jedini zapis o tome NA KOM dokumentu je stao. Polje koje se ne koristi
    // za logiku mora i da kaže da se ne koristi, inače sledeći čitalac
    // pretpostavi da granica ima dva dela.
    lastDocId: v.optional(v.string()),
    lastRunAt: v.number(),
    // Ishod poslednjeg prolaza — prazan prolaz i neuspeo prolaz NE SMEJU da
    // izgledaju isto.
    lastOutcome: v.union(
      v.literal("obradjeno"),
      v.literal("nema_novih"),
      v.literal("greska"),
    ),
    lastError: v.optional(v.string()),
  })
    .index("by_workspace_source", ["workspaceId", "source"]),

  // 13) leadLandings — praćenje besplatnih landing stranica za firme (§7, LM7)
  leadLandings: defineTable({
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    // Praćeni link iza kog stoji besplatna stranica
    trackedLinkId: v.id("orTrackedLinks"),
    // Naslov/opis da operater zna koja je to stranica
    label: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
    createdAt: v.number(),
    // Kada je link STVARNO poslat klijentu. Različito od createdAt: stranica
    // može da stoji napravljena dva dana pre nego što je iko dobije, i
    // „nije otvorena" pre slanja ne znači isto što i posle slanja.
    sentAt: v.optional(v.number()),
    // Kako je poslat (telefonom, DM, mejlom) — slobodan tekst operatera
    sentVia: v.optional(v.string()),
    status: v.union(
      v.literal("napravljena"),
      v.literal("poslata"),
      v.literal("arhivirana"),
    ),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_company", ["workspaceId", "companyId"])
    .index("by_tracked_link", ["trackedLinkId"]),

  // ── Google Business Profile (GB1) ──────────────────────────────────────────
  // Stanje pristupa API-ju po radnom prostoru, odvojeno od `connections`
  // jer veza može da postoji (token je tu), a pristup da ne bude odobren (kvota 0 QPM).
  gbAccessState: defineTable({
    workspaceId: v.id("workspaces"),
    // Šta smo POSLEDNJI PUT videli kao ishod poziva ka Google-u
    lastOutcome: v.union(
      v.literal("nikad_pozvano"),
      v.literal("uspesno"),
      v.literal("kvota_nula"),
      v.literal("kvota_prekoracena"),
      v.literal("servis_nije_ukljucen"),
      v.literal("nema_dozvole"),
      v.literal("nepoznato"),
    ),
    lastCheckedAt: v.optional(v.number()),
    lastStatus: v.optional(v.number()),
    lastReason: v.optional(v.string()), // sanitizovano, bez tokena
    // Da li je iko IKADA dobio uspešan odgovor sa ovog API-ja u ovom
    // radnom prostoru. Postoji da bi UI mogao da kaže „još nismo ni
    // jednom uspeli" umesto da prikaže praznu tablu kao rezultat merenja.
    everSucceededAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // ── Novosti / Blog (NV1) ──────────────────────────────────────────────────
  posts: defineTable({
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    locale: v.string(), // "sr-Latn"
    kind: v.union(v.literal("note"), v.literal("article")),
    category: v.union(
      v.literal("novac_rokovi"),
      v.literal("odluke"),
      v.literal("kako_radi"),
      v.literal("greske"),
      v.literal("ai_razvoj"),
      v.literal("srpski_kontekst"),
    ),
    title: v.string(),
    dek: v.string(),
    body: v.string(), // markdown
    coverStorageId: v.optional(v.id("_storage")),
    coverAlt: v.optional(v.string()),
    authorName: v.string(),
    authorRole: v.optional(v.string()),
    tags: v.array(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("scheduled"),
      v.literal("published"),
      v.literal("archived"),
    ),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    seoTitle: v.optional(v.string()),
    seoDescription: v.optional(v.string()),
    canonicalUrl: v.optional(v.string()),
    ogImageStorageId: v.optional(v.id("_storage")),
    readingMinutes: v.optional(v.number()),
    ownProofChecked: v.boolean(),
    ownProofNote: v.optional(v.string()), // ČIME je ispunjeno, jednom rečenicom
    humanizerPassedAt: v.optional(v.number()),
    relatedSlugs: v.optional(v.array(v.string())),
  })
    .index("by_workspace_status_published", [
      "workspaceId",
      "status",
      "publishedAt",
    ])
    .index("by_workspace_slug", ["workspaceId", "slug"])
    .index("by_workspace_category", ["workspaceId", "category"]),

  postRevisions: defineTable({
    postId: v.id("posts"),
    body: v.string(),
    savedAt: v.number(),
    note: v.optional(v.string()),
  }).index("by_post", ["postId"]),
});

