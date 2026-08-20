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
    .index("by_workspace_deletion_checked", ["workspaceId", "deletionCheckedAt"])
    .index("by_media", ["mediaId"]), // public /ig-media/ proxy lookup

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
    // Content type per file, same order. Instagram needs to be told `image_url`
    // or `video_url`, and by publish time the file's own name is long gone.
    contentTypes: v.array(v.string()),
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
    // window searched when a lost media id has to be recovered.
    publishStartedAt: v.optional(v.number()),
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
    .index("by_workspace_scheduled", ["workspaceId", "scheduledFor"])
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
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"]),

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
    .index("by_workspace_timestamp", ["workspaceId", "timestamp"]),

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
    .index("by_workspace_date", ["workspaceId", "date"]),

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
  }).index("by_workspace_comment", ["workspaceId", "commentId"]),

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
    lastUserMessageAt: v.optional(v.number()),
    lastBotMessageAt: v.optional(v.number()),
    consentAt: v.optional(v.number()), // first time they wrote / tapped
    // Last answer the follow gate got from Instagram for this person, and when.
    // A short-lived cache (lib/orFollow.ts), never a source of truth.
    followsBusiness: v.optional(v.boolean()),
    followCheckedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_workspace_igsid", ["workspaceId", "igsid"]),

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
  }).index("by_workspace_mid", ["workspaceId", "mid"]),

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
    automationId: v.id("orAutomations"),
    slug: v.string(),
    destinationUrl: v.string(),
    label: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_workspace_automation", ["workspaceId", "automationId"]),

  orLinkClicks: defineTable({
    workspaceId: v.id("workspaces"),
    automationId: v.id("orAutomations"),
    trackedLinkId: v.id("orTrackedLinks"),
    date: v.string(), // "YYYY-MM-DD", UTC
    ipHash: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    referrer: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_workspace_date", ["workspaceId", "date"])
    .index("by_link", ["trackedLinkId"])
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
});
