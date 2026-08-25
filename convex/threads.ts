import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials, encryptCredentials } from "./lib/crypto";
import { runSync } from "./lib/runSync";
import {
  THREADS_REDIRECT_URI,
  THREADS_SCOPES,
  buildThreadsAuthorizeUrl,
  executeThreadsResource,
  sanitizeThreadsError,
  summarizeThreadsSync,
  type ThreadsPublishingLimit,
  type ThreadsResourceOutcome,
  type ThreadsSyncSummary,
} from "./lib/threadsShared";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getThreadsAccountTotals,
  getThreadsAccountViews,
  getThreadsAppId,
  getThreadsAppSecret,
  getThreadsClicksByUrl,
  getThreadsDemographics,
  getThreadsFollowersCount,
  getThreadsOwnReplies,
  getThreadsPostInsights,
  getThreadsPostReplies,
  getThreadsPostsPage,
  getThreadsProfile,
  getThreadsPublishingLimitDetailed,
  getThreadsReplies,
  getThreadsUserProfile,
  refreshLongLivedToken,
  type RawThreadsPostItem,
} from "./lib/threadsApi";


/**
 * ============================================================================
 * THREADS ACTIONS & OAUTH HANDSHAKE (V8 runtime, BEZ "use node")
 * ============================================================================
 *
 * KRITIČNO PRAVILO RUNTIME-A:
 * Ovaj fajl NEMA "use node" i NE UVOZI nijedan Node built-in modul.
 * Sve operacije (fetch, crypto.getRandomValues, Web Crypto) rade unutar Convex V8 runtime-a.
 * ============================================================================
 */

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000; // 15 minuta
const MS_IN_24_HOURS = 24 * 60 * 60 * 1000;
const MS_IN_60_DAYS = 60 * MS_IN_24_HOURS;
const MS_IN_59_DAYS = 59 * MS_IN_24_HOURS;

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Javna akcija za autentifikovanog člana:
 * Generiše jednokratni nonce, upisuje OAuth state u bazu i vraća Threads autorizacioni URL.
 */
export const threadsAuthorizeUrl = action({
  args: {
    redirectUri: v.optional(v.string()),
  },
  handler: async (ctx, { redirectUri }): Promise<{ url: string }> => {
    const clientId = getThreadsAppId();
    const clientSecret = getThreadsAppSecret();

    if (!clientId || !clientSecret) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Čeka Threads OAuth konfiguraciju — dodaj THREADS_APP_ID i THREADS_APP_SECRET u Convex env promenljive.",
      });
    }

    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new ConvexError({
        code: "unauthorized",
        message: "Niste prijavljeni.",
      });
    }

    const member: {
      workspaceId: Id<"workspaces">;
      role: "owner" | "client_viewer";
    } | null = await ctx.runQuery(internal.instagramStore.getMembership, {
      userId,
    });

    if (member === null) {
      throw new ConvexError({
        code: "forbidden",
        message: "Niste član aktivnog workspace-a.",
      });
    }

    const effectiveRedirectUri = redirectUri ?? THREADS_REDIRECT_URI;
    const nonce = randomNonce();

    await ctx.runMutation(internal.threadsStore.createOAuthState, {
      workspaceId: member.workspaceId,
      userId,
      nonce,
      redirectUri: effectiveRedirectUri,
    });

    const url = buildThreadsAuthorizeUrl({
      clientId,
      redirectUri: effectiveRedirectUri,
      scopes: THREADS_SCOPES,
      state: nonce,
    });

    return { url };
  },
});

export interface ThreadsOAuthResult {
  success: boolean;
  connectionId: Id<"connections">;
  userId: string;
  username?: string;
}

/**
 * Završetak OAuth toka iz javne callback rute (/api/auth/callback/threads).
 * 1. Atomski proverava i briše state nonce
 * 2. Proverava TTL state-a (15 min)
 * 3. Menja autorizacioni kod za short-lived token
 * 4. Odmah menja short-lived za long-lived token (~60 dana)
 * 5. Čita profil naloga (/me?fields=id,username)
 * 6. Šifruje long-lived token i upisuje vezu u bazu sa statusom "active"
 */
export const completeOAuthFromCallback = action({
  args: {
    state: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { state, code }): Promise<ThreadsOAuthResult> => {
    const stored: {
      workspaceId: Id<"workspaces">;
      redirectUri: string;
      createdAt: number;
    } | null = await ctx.runMutation(internal.threadsStore.consumeOAuthState, {
      nonce: state,
    });

    if (stored === null) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Nepoznat ili već iskorišćen state parametar. Pokreni povezivanje ponovo iz Podešavanja.",
      });
    }

    if (Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS) {
      throw new ConvexError({
        code: "invalid",
        message: "Autorizacija je istekla. Pokreni povezivanje ponovo.",
      });
    }

    const clientId = getThreadsAppId();
    const clientSecret = getThreadsAppSecret();

    if (!clientId || !clientSecret) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Čeka Threads OAuth konfiguraciju — dodaj THREADS_APP_ID i THREADS_APP_SECRET u Convex env promenljive.",
      });
    }

    // 1. Razmena koda za short-lived token
    let shortLived: { accessToken: string; userId: string };
    try {
      shortLived = await exchangeCodeForShortLivedToken({
        clientId,
        clientSecret,
        code,
        redirectUri: stored.redirectUri,
      });
    } catch (err) {
      throw new ConvexError({
        code: "invalid",
        message: sanitizeThreadsError(err),
      });
    }

    // 2. Razmena short-lived za long-lived token (~60 dana)
    let longLived: { accessToken: string; expiresIn: number };
    try {
      longLived = await exchangeForLongLivedToken({
        clientSecret,
        shortLivedToken: shortLived.accessToken,
      });
    } catch (err) {
      throw new ConvexError({
        code: "invalid",
        message: sanitizeThreadsError(err),
      });
    }

    // 3. Dohvatanje profila korisnika (/me)
    let profile: { id: string; username?: string };
    try {
      profile = await getThreadsUserProfile({
        accessToken: longLived.accessToken,
      });
    } catch (err) {
      throw new ConvexError({
        code: "invalid",
        message: sanitizeThreadsError(err),
      });
    }

    // 4. Šifrovanje kredencijala i čuvanje konekcije
    const encryptedCredentials = await encryptCredentials(longLived.accessToken);
    const expiresAt = Date.now() + (longLived.expiresIn || 5184000) * 1000;

    const connectionId: Id<"connections"> = await ctx.runMutation(
      internal.threadsStore.saveConnectedCredentials,
      {
        workspaceId: stored.workspaceId,
        userId: profile.id || shortLived.userId,
        username: profile.username,
        encryptedCredentials,
        expiresAt,
      },
    );

    return {
      success: true,
      connectionId,
      userId: profile.id || shortLived.userId,
      username: profile.username,
    };
  },
});

/**
 * Osvežavanje long-lived tokena za pojedinačnu Threads konekciju.
 *
 * Pravila trajanja (odeljak 3.3):
 *  - Token se sme osvežiti tek kada je stariji od 24 sata
 *  - Token stariji od 60 dana je mrtav — ne pokušavati refresh, već označiti vezu kao "expired"
 *  - Profil je javan, pa se grant permisija automatski produžava sa refresh-om tokena
 */
export const refreshConnectionToken = internalAction({
  args: {
    connectionId: v.id("connections"),
    force: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { connectionId, force = false },
  ): Promise<{
    success?: boolean;
    skipped?: boolean;
    status?: string;
    reason?: string;
    expiresAt?: number;
  }> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );

    if (conn === null || conn.provider !== "threads") {
      return { skipped: true, reason: "Konekcija nije pronađena ili nije threads" };
    }

    const now = Date.now();

    // 1. Provera da li je token stariji od 60 dana (mrtav token)
    if (conn.expiresAt && now >= conn.expiresAt) {
      await ctx.runMutation(internal.threadsStore.markConnectionExpired, {
        connectionId,
      });
      return {
        success: false,
        status: "expired",
        reason:
          "Threads token je istekao (>60 dana) i ne može se osvežiti. Potrebno je ponovno povezivanje u Podešavanjima.",
      };
    }

    // 2. Provera da li je token mlađi od 24 sata (ne sme se osvežavati u prvih 24h)
    // conn.expiresAt je bio postavljen na (issuance + 60 days).
    // Ako je preostalo više od 59 dana, token je izdat pre manje od 24h.
    if (!force && conn.expiresAt && conn.expiresAt - now > MS_IN_59_DAYS) {
      return {
        skipped: true,
        reason:
          "Token je mlađi od 24 sata. Threads API dozvoljava osvežavanje tek nakon 24 sata od izdavanja.",
      };
    }

    let token: string;
    try {
      token = await decryptCredentials(conn.encryptedCredentials);
    } catch {
      await ctx.runMutation(internal.threadsStore.markConnectionExpired, {
        connectionId,
      });
      return { success: false, status: "expired", reason: "Dekripcija tokena nije uspela." };
    }

    try {
      const refreshed = await refreshLongLivedToken({ longLivedToken: token });
      const newEncrypted = await encryptCredentials(refreshed.accessToken);
      const newExpiresAt = Date.now() + (refreshed.expiresIn || 5184000) * 1000;

      await ctx.runMutation(internal.threadsStore.updateTokenExpiry, {
        connectionId,
        encryptedCredentials: newEncrypted,
        expiresAt: newExpiresAt,
      });

      return {
        success: true,
        status: "active",
        expiresAt: newExpiresAt,
      };
    } catch (err) {
      await ctx.runMutation(internal.threadsStore.markConnectionExpired, {
        connectionId,
      });
      return {
        success: false,
        status: "expired",
        reason: sanitizeThreadsError(err),
      };
    }
  },
});

/**
 * Dnevni cron za osvežavanje svih aktivnih Threads tokena koji su spremni za refresh.
 */
export const refreshAllThreadsTokens = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "threads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.threads.refreshConnectionToken, {
          connectionId,
        });
      } catch (err) {
        console.error(
          `[Threads token refresh failed for ${connectionId}]`,
          sanitizeThreadsError(err),
        );
      }
    }
  },
});

/**
 * Format date YYYY-MM-DD for today.
 */
function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * ============================================================================
 * THREADS FULL SYNC (TH3 / TH4, V8 runtime, BEZ "use node")
 * ============================================================================
 *
 * Sinhronizacija svih 10 resursa:
 *   1. profile        GET /{id}?fields=id,username         -> username u connection
 *   2. posts          GET /{id}/threads                    -> paginacija kursorom, lookback prozor po datumu
 *   3. post_insights  GET /{media-id}/insights             -> za svaku objavu iz koraka 2 (views,likes,replies,reposts,quotes,shares)
 *   4. account_views  GET /{id}/threads_insights?metric=views -> vremenska serija po danu
 *   5. account_totals GET /{id}/threads_insights            -> likes,replies,reposts,quotes
 *   6. clicks_by_url  GET /{id}/threads_insights?metric=clicks -> razbijeno po URL-u
 *   7. followers      GET /{id}/threads_insights?metric=followers_count -> snapshot za današnji datum
 *   8. demographics   GET /{id}/threads_insights?metric=follower_demographics -> 4 odvojena breakdown-a (country, city, age, gender)
 *   9. replies        GET /{media-id}/replies za objave iz koraka 2 (source: "sync")
 *  10. quota          GET /{id}/threads_publishing_limit -> obavezna polja u jednom upitu, opciona izolovano
 * ============================================================================
 */
export const syncThreads = internalAction({
  args: { connectionId: v.id("connections") },
  handler: async (ctx, { connectionId }): Promise<ThreadsSyncSummary> => {
    const conn: Doc<"connections"> | null = await ctx.runQuery(
      internal.connections.getForSync,
      { connectionId },
    );

    if (conn === null || conn.provider !== "threads") {
      throw new ConvexError({
        code: "invalid",
        message: "Threads konekcija nije pronađena.",
      });
    }

    const { workspaceId, encryptedCredentials } = conn;

    let accessToken: string;
    try {
      accessToken = await decryptCredentials(encryptedCredentials);
    } catch {
      await ctx.runMutation(internal.threadsStore.markConnectionExpired, {
        connectionId,
      });
      throw new ConvexError({
        code: "invalid",
        message: "Dekripcija Threads tokena nije uspela.",
      });
    }

    // Pročitaj i keširaj Threads user ID
    let userId = conn.externalId;
    try {
      const meProfile = await getThreadsUserProfile({ accessToken });
      if (meProfile.id) {
        userId = meProfile.id;
      }
      if (meProfile.username) {
        await ctx.runMutation(internal.threadsStore.saveAccountHandle, {
          connectionId,
          handle: meProfile.username,
        });
      }
    } catch {
      // Ako /me ne odgovori, oslanjamo se na sačuvani externalId
    }

    if (!userId) {
      throw new ConvexError({
        code: "invalid",
        message: "Threads konekcija nema konfigurisan User ID.",
      });
    }

    const outcomes: ThreadsResourceOutcome[] = [];
    let summaryResult: ThreadsSyncSummary | undefined;

    const todayDateStr = getTodayDateString();
    const lookbackDays = 30;
    const sinceTimestamp = Math.floor(
      (Date.now() - lookbackDays * 24 * 60 * 60 * 1000) / 1000,
    );

    await runSync(
      ctx,
      { workspaceId, provider: "threads", connectionId },
      async (): Promise<{ itemsWritten: number; note?: string }> => {
        // ── 1. Profile (GET /{id}?fields=id,username) ────────────────────────
        await executeThreadsResource("profile", outcomes, async () => {
          const prof = await getThreadsProfile({ accessToken, userId });
          if (prof.username) {
            await ctx.runMutation(internal.threadsStore.saveAccountHandle, {
              connectionId,
              handle: prof.username,
            });
          }
          return [prof];
        });

        // ── 2. Posts (GET /{id}/threads) ─────────────────────────────────────
        const fetchedPosts: RawThreadsPostItem[] = [];
        await executeThreadsResource("posts", outcomes, async () => {
          let afterCursor: string | undefined = undefined;
          let pageCount = 0;
          const MAX_PAGES = 10;

          while (pageCount < MAX_PAGES) {
            pageCount++;
            const resp = await getThreadsPostsPage({
              accessToken,
              userId,
              since: sinceTimestamp,
              limit: 50,
              after: afterCursor,
            });

            const items = resp.data ?? [];
            for (const item of items) {
              fetchedPosts.push(item);
            }

            afterCursor = resp.paging?.cursors?.after;
            if (!resp.paging?.next || !afterCursor || items.length === 0) {
              break;
            }
          }

          return fetchedPosts;
        });

        const postRows = fetchedPosts.map((p) => {
          const rawChildren = Array.isArray(p.children)
            ? p.children
            : Array.isArray(p.children?.data)
              ? p.children?.data
              : undefined;

          const children = rawChildren?.map((c) => ({
            id: String(c.id),
            ...(c.media_type !== undefined
              ? { mediaType: String(c.media_type) }
              : {}),
            ...(c.media_url !== undefined
              ? { mediaUrl: String(c.media_url) }
              : {}),
            ...(c.thumbnail_url !== undefined
              ? { thumbnailUrl: String(c.thumbnail_url) }
              : {}),
          }));

          return {
            mediaId: p.id,
            ...(p.media_product_type !== undefined
              ? { mediaProductType: p.media_product_type }
              : {}),
            mediaType: p.media_type,
            ...(p.permalink !== undefined ? { permalink: p.permalink } : {}),
            ...(p.owner?.id !== undefined ? { ownerId: p.owner.id } : {}),
            ...(p.username !== undefined ? { username: p.username } : {}),
            ...(p.text !== undefined ? { text: p.text } : {}),
            ...(p.timestamp !== undefined ? { timestamp: p.timestamp } : {}),
            ...(p.shortcode !== undefined ? { shortcode: p.shortcode } : {}),
            ...(p.is_quote_post !== undefined
              ? { isQuotePost: p.is_quote_post }
              : {}),
            ...(p.quoted_post?.id !== undefined
              ? { quotedPostId: p.quoted_post.id }
              : {}),
            ...(p.reposted_post?.id !== undefined
              ? { repostedPostId: p.reposted_post.id }
              : {}),
            ...(p.poll_attachment !== undefined
              ? { pollAttachment: p.poll_attachment }
              : {}),
            ...(p.has_replies !== undefined
              ? { hasReplies: p.has_replies }
              : {}),
            ...(p.root_post?.id !== undefined
              ? { rootPostId: p.root_post.id }
              : {}),
            ...(p.replied_to?.id !== undefined
              ? { repliedToId: p.replied_to.id }
              : {}),
            ...(p.is_reply !== undefined ? { isReply: p.is_reply } : {}),
            ...(p.is_reply_owned_by_me !== undefined
              ? { isReplyOwnedByMe: p.is_reply_owned_by_me }
              : {}),
            ...(p.reply_audience !== undefined
              ? { replyAudience: p.reply_audience }
              : {}),
            ...(p.media_url !== undefined ? { mediaUrl: p.media_url } : {}),
            ...(p.thumbnail_url !== undefined
              ? { thumbnailUrl: p.thumbnail_url }
              : {}),
            ...(children !== undefined ? { children } : {}),
            ...(p.alt_text !== undefined ? { altText: p.alt_text } : {}),
            ...(p.link_attachment_url !== undefined
              ? { linkAttachmentUrl: p.link_attachment_url }
              : {}),
            ...(p.topic_tag !== undefined ? { topicTag: p.topic_tag } : {}),
            ...(p.location_id !== undefined
              ? { locationId: p.location_id }
              : {}),
            ...(p.hide_status !== undefined
              ? { hideStatus: p.hide_status }
              : {}),
          };
        });

        // ── 3. Post Insights (GET /{media-id}/insights) ──────────────────────
        const postInsightRows: Array<{
          mediaId: string;
          date: string;
          views?: number;
          likes?: number;
          replies?: number;
          reposts?: number;
          quotes?: number;
          shares?: number;
        }> = [];

        // Dokazane `media_type` vrednosti (Dodatak B.5). Nazivi za sliku, video i
        // carousel NISU dokazani, pa svaki tip van ovog skupa mora glasno da se prijavi —
        // tako i saznajemo kako se zovu, umesto da ih pogađamo.
        const POZNATI_MEDIA_TYPES = new Set(["TEXT_POST", "REPOST_FACADE"]);
        const nepoznatiTipovi = new Set<string>();
        for (const post of fetchedPosts) {
          const mt = post.media_type;
          if (typeof mt === "string" && mt !== "" && !POZNATI_MEDIA_TYPES.has(mt)) {
            nepoznatiTipovi.add(mt);
          }
        }
        if (nepoznatiTipovi.size > 0) {
          console.warn(
            `[Threads] NOVE media_type vrednosti (dosad nedokazane): ${Array.from(nepoznatiTipovi).join(", ")}. ` +
              `Upisane su kako su stigle. Dopuniti Dodatak B.5 u threads-api-istrazivanje.md.`,
          );
        }

        let postInsightsFailed = 0;
        let postInsightsOk = 0;

        await executeThreadsResource("post_insights", outcomes, async () => {
          for (const post of fetchedPosts) {
            // REPOST_FACADE vraća prazan niz (linija 271) — preskačemo kao uredan ishod
            if (post.media_type === "REPOST_FACADE") {
              continue;
            }
            try {
              const insightsResp = await getThreadsPostInsights({
                accessToken,
                mediaId: post.id,
              });

              const metricsMap: Record<string, number> = {};
              for (const item of insightsResp.data ?? []) {
                let val: number | undefined = undefined;
                if (typeof item.total_value?.value === "number") {
                  val = item.total_value.value;
                } else if (
                  Array.isArray(item.values) &&
                  item.values.length > 0 &&
                  typeof item.values[0]?.value === "number"
                ) {
                  val = item.values[0].value;
                }
                if (val !== undefined) {
                  metricsMap[item.name] = val;
                }
              }

              postInsightRows.push({
                mediaId: post.id,
                date: todayDateStr,
                ...(metricsMap.views !== undefined
                  ? { views: metricsMap.views }
                  : {}),
                ...(metricsMap.likes !== undefined
                  ? { likes: metricsMap.likes }
                  : {}),
                ...(metricsMap.replies !== undefined
                  ? { replies: metricsMap.replies }
                  : {}),
                ...(metricsMap.reposts !== undefined
                  ? { reposts: metricsMap.reposts }
                  : {}),
                ...(metricsMap.quotes !== undefined
                  ? { quotes: metricsMap.quotes }
                  : {}),
                ...(metricsMap.shares !== undefined
                  ? { shares: metricsMap.shares }
                  : {}),
              });
              postInsightsOk++;
            } catch (err) {
              postInsightsFailed++;
              console.warn(
                `[Threads post_insights fetch failed for ${post.id}]`,
                sanitizeThreadsError(err),
              );
            }
          }

          // Ako je SVAKI pokušaj pao, resurs je pao — prazan niz ovde bi izgledao
          // kao "nalog nema metrike", a to nije isto što i "nismo uspeli da ih pročitamo".
          if (postInsightsFailed > 0 && postInsightsOk === 0) {
            throw new Error(
              `Metrike po objavi nisu pročitane ni za jednu od ${postInsightsFailed} objava.`,
            );
          }
          if (postInsightsFailed > 0) {
            console.warn(
              `[Threads] Metrike po objavi: ${postInsightsOk} uspešno, ${postInsightsFailed} neuspešno.`,
            );
          }

          return postInsightRows;
        });

        // ── 4. Account Views (GET /{id}/threads_insights?metric=views) ───────
        const accountDailyRows: Array<{
          date: string;
          views?: number;
        }> = [];

        await executeThreadsResource("account_views", outcomes, async () => {
          const viewsResp = await getThreadsAccountViews({
            accessToken,
            userId,
            since: sinceTimestamp,
          });

          for (const item of viewsResp.data ?? []) {
            if (item.name === "views" && Array.isArray(item.values)) {
              for (const valItem of item.values) {
                if (valItem.end_time && typeof valItem.value === "number") {
                  const date = valItem.end_time.split("T")[0];
                  accountDailyRows.push({
                    date,
                    views: valItem.value,
                  });
                }
              }
            }
          }
          return accountDailyRows;
        });

        // ── 5. Account Totals (GET /{id}/threads_insights?metric=likes,...) ──
        let accountTotalsRow:
          | {
              likes?: number;
              replies?: number;
              reposts?: number;
              quotes?: number;
              fetchedAt: number;
            }
          | undefined = undefined;

        await executeThreadsResource("account_totals", outcomes, async () => {
          const totalsResp = await getThreadsAccountTotals({
            accessToken,
            userId,
          });

          const totalsMap: Record<string, number> = {};
          for (const item of totalsResp.data ?? []) {
            let val: number | undefined = undefined;
            if (typeof item.total_value?.value === "number") {
              val = item.total_value.value;
            } else if (
              Array.isArray(item.values) &&
              item.values.length > 0 &&
              typeof item.values[0]?.value === "number"
            ) {
              val = item.values[0].value;
            }
            if (val !== undefined) {
              totalsMap[item.name] = val;
            }
          }

          accountTotalsRow = {
            ...(totalsMap.likes !== undefined ? { likes: totalsMap.likes } : {}),
            ...(totalsMap.replies !== undefined
              ? { replies: totalsMap.replies }
              : {}),
            ...(totalsMap.reposts !== undefined
              ? { reposts: totalsMap.reposts }
              : {}),
            ...(totalsMap.quotes !== undefined
              ? { quotes: totalsMap.quotes }
              : {}),
            fetchedAt: Date.now(),
          };

          return [accountTotalsRow];
        });

        // ── 6. Clicks by URL (GET /{id}/threads_insights?metric=clicks) ──────
        const clicksByUrlRows: Array<{
          date: string;
          url: string;
          clicks?: number;
        }> = [];

        await executeThreadsResource("clicks_by_url", outcomes, async () => {
          const clicksResp = await getThreadsClicksByUrl({
            accessToken,
            userId,
          });

          for (const item of clicksResp.data ?? []) {
            if (item.name === "clicks") {
              if (
                item.total_value?.breakdowns &&
                item.total_value.breakdowns.length > 0
              ) {
                for (const breakdownObj of item.total_value.breakdowns) {
                  for (const resItem of breakdownObj.results ?? []) {
                    const urlVal = resItem.dimension_values?.[0];
                    if (urlVal && typeof resItem.value === "number") {
                      clicksByUrlRows.push({
                        date: todayDateStr,
                        url: urlVal,
                        clicks: resItem.value,
                      });
                    }
                  }
                }
              } else if (Array.isArray(item.values)) {
                for (const valItem of item.values) {
                  if (
                    valItem.dimension_values?.[0] &&
                    typeof valItem.value === "number"
                  ) {
                    const date = valItem.end_time
                      ? valItem.end_time.split("T")[0]
                      : todayDateStr;
                    clicksByUrlRows.push({
                      date,
                      url: valItem.dimension_values[0],
                      clicks: valItem.value,
                    });
                  } else if (
                    typeof valItem.value === "object" &&
                    valItem.value !== null
                  ) {
                    const date = valItem.end_time
                      ? valItem.end_time.split("T")[0]
                      : todayDateStr;
                    for (const [url, count] of Object.entries(valItem.value)) {
                      if (typeof count === "number") {
                        clicksByUrlRows.push({
                          date,
                          url,
                          clicks: count,
                        });
                      }
                    }
                  }
                }
              }
            }
          }

          return clicksByUrlRows;
        });

        // ── 7. Followers (GET /{id}/threads_insights?metric=followers_count) ─
        const followerSnapshotRows: Array<{
          date: string;
          takenAt: number;
          followersCount?: number;
        }> = [];

        await executeThreadsResource("followers", outcomes, async () => {
          const followersResp = await getThreadsFollowersCount({
            accessToken,
            userId,
          });

          let followersCount: number | undefined = undefined;
          for (const item of followersResp.data ?? []) {
            if (item.name === "followers_count") {
              if (typeof item.total_value?.value === "number") {
                followersCount = item.total_value.value;
              } else if (
                Array.isArray(item.values) &&
                item.values.length > 0 &&
                typeof item.values[0]?.value === "number"
              ) {
                followersCount = item.values[0].value;
              }
            }
          }

          const snapshot = {
            date: todayDateStr,
            takenAt: Date.now(),
            ...(followersCount !== undefined ? { followersCount } : {}),
          };

          followerSnapshotRows.push(snapshot);
          return [snapshot];
        });

        // ── 8. Demographics (4 odvojena poziva: country, city, age, gender) ─
        const demographicRows: Array<{
          date: string;
          breakdown: "country" | "city" | "age" | "gender";
          key: string;
          value?: number;
          takenAt: number;
        }> = [];

        await executeThreadsResource("demographics", outcomes, async () => {
          const breakdowns: Array<"country" | "city" | "age" | "gender"> = [
            "country",
            "city",
            "age",
            "gender",
          ];

          for (const b of breakdowns) {
            const demoResp = await getThreadsDemographics({
              accessToken,
              userId,
              breakdown: b,
            });

            if (!demoResp || !demoResp.data) continue;

            for (const item of demoResp.data) {
              if (
                item.total_value?.breakdowns &&
                item.total_value.breakdowns.length > 0
              ) {
                for (const breakdownObj of item.total_value.breakdowns) {
                  for (const resItem of breakdownObj.results ?? []) {
                    const key = resItem.dimension_values?.[0];
                    if (key) {
                      demographicRows.push({
                        date: todayDateStr,
                        breakdown: b,
                        key,
                        ...(typeof resItem.value === "number"
                          ? { value: resItem.value }
                          : {}),
                        takenAt: Date.now(),
                      });
                    }
                  }
                }
              } else if (Array.isArray(item.values)) {
                for (const valItem of item.values) {
                  if (valItem.dimension_values?.[0]) {
                    demographicRows.push({
                      date: todayDateStr,
                      breakdown: b,
                      key: valItem.dimension_values[0],
                      ...(typeof valItem.value === "number"
                        ? { value: valItem.value }
                        : {}),
                      takenAt: Date.now(),
                    });
                  } else if (
                    typeof valItem.value === "object" &&
                    valItem.value !== null
                  ) {
                    for (const [key, count] of Object.entries(valItem.value)) {
                      demographicRows.push({
                        date: todayDateStr,
                        breakdown: b,
                        key,
                        ...(typeof count === "number" ? { value: count } : {}),
                        takenAt: Date.now(),
                      });
                    }
                  }
                }
              }
            }
          }

          return demographicRows;
        });

        // ── 9. Post Replies (GET /{media-id}/replies za objave iz koraka 2) ──
        const postReplyRows: Array<{
          replyId: string;
          text?: string;
          username?: string;
          permalink?: string;
          timestamp?: string | number;
          mediaType?: string;
          mediaUrl?: string;
          shortcode?: string;
          ownerId?: string;
          rootPostId?: string;
          repliedToId?: string;
          isReply?: boolean;
          isReplyOwnedByMe?: boolean;
          hasReplies?: boolean;
          replyAudience?: string;
          approvalStatus?: string;
          hideStatus?: string;
          source: string;
          receivedAt?: number;
        }> = [];

        let postRepliesAttempted = 0;
        let postRepliesFailed = 0;

        await executeThreadsResource("post_replies", outcomes, async () => {
          for (const post of fetchedPosts) {
            if (post.media_type === "REPOST_FACADE") continue;
            postRepliesAttempted++;
            try {
              const repliesResp = await getThreadsPostReplies({
                accessToken,
                mediaId: post.id,
              });

              for (const r of repliesResp.data ?? []) {
                postReplyRows.push({
                  replyId: r.id,
                  ...(r.text !== undefined ? { text: r.text } : {}),
                  ...(r.username !== undefined ? { username: r.username } : {}),
                  ...(r.permalink !== undefined
                    ? { permalink: r.permalink }
                    : {}),
                  ...(r.timestamp !== undefined
                    ? { timestamp: r.timestamp }
                    : {}),
                  ...(r.media_type !== undefined
                    ? { mediaType: r.media_type }
                    : {}),
                  ...(r.media_url !== undefined
                    ? { mediaUrl: r.media_url }
                    : {}),
                  ...(r.shortcode !== undefined
                    ? { shortcode: r.shortcode }
                    : {}),
                  ...(r.owner?.id !== undefined
                    ? { ownerId: r.owner.id }
                    : {}),
                  ...(r.root_post?.id !== undefined
                    ? { rootPostId: r.root_post.id }
                    : {}),
                  ...(r.replied_to?.id !== undefined
                    ? { repliedToId: r.replied_to.id }
                    : {}),
                  ...(r.is_reply !== undefined ? { isReply: r.is_reply } : {}),
                  ...(r.is_reply_owned_by_me !== undefined
                    ? { isReplyOwnedByMe: r.is_reply_owned_by_me }
                    : {}),
                  ...(r.has_replies !== undefined
                    ? { hasReplies: r.has_replies }
                    : {}),
                  ...(r.reply_audience !== undefined
                    ? { replyAudience: r.reply_audience }
                    : {}),
                  ...(r.approval_status !== undefined
                    ? { approvalStatus: r.approval_status }
                    : {}),
                  ...(r.hide_status !== undefined
                    ? { hideStatus: r.hide_status }
                    : {}),
                  source: "sync",
                  receivedAt: Date.now(),
                });
              }
            } catch (err) {
              postRepliesFailed++;
              console.warn(
                `[Threads replies fetch failed for media ${post.id}]`,
                sanitizeThreadsError(err),
              );
            }
          }

          if (
            postRepliesAttempted > 0 &&
            postRepliesFailed === postRepliesAttempted
          ) {
            throw new Error(
              `Odgovori na objave nisu pročitani ni za jednu od ${postRepliesAttempted} objava.`,
            );
          }

          return postReplyRows;
        });

        // ── 10. Own Replies (GET /{user-id}/replies) ────────────────────────
        const ownReplyRows: Array<{
          replyId: string;
          text?: string;
          username?: string;
          permalink?: string;
          timestamp?: string | number;
          mediaType?: string;
          mediaUrl?: string;
          shortcode?: string;
          ownerId?: string;
          rootPostId?: string;
          repliedToId?: string;
          isReply?: boolean;
          isReplyOwnedByMe?: boolean;
          hasReplies?: boolean;
          replyAudience?: string;
          approvalStatus?: string;
          hideStatus?: string;
          source: string;
          receivedAt?: number;
        }> = [];

        await executeThreadsResource("own_replies", outcomes, async () => {
          const ownResp = await getThreadsOwnReplies({
            accessToken,
            userId,
            since: sinceTimestamp,
          });

          for (const r of ownResp.data ?? []) {
            ownReplyRows.push({
              replyId: r.id,
              ...(r.text !== undefined ? { text: r.text } : {}),
              ...(r.username !== undefined ? { username: r.username } : {}),
              ...(r.permalink !== undefined
                ? { permalink: r.permalink }
                : {}),
              ...(r.timestamp !== undefined
                ? { timestamp: r.timestamp }
                : {}),
              ...(r.media_type !== undefined
                ? { mediaType: r.media_type }
                : {}),
              ...(r.media_url !== undefined
                ? { mediaUrl: r.media_url }
                : {}),
              ...(r.shortcode !== undefined
                ? { shortcode: r.shortcode }
                : {}),
              ...(r.owner?.id !== undefined
                ? { ownerId: r.owner.id }
                : {}),
              ...(r.root_post?.id !== undefined
                ? { rootPostId: r.root_post.id }
                : {}),
              ...(r.replied_to?.id !== undefined
                ? { repliedToId: r.replied_to.id }
                : {}),
              ...(r.is_reply !== undefined ? { isReply: r.is_reply } : {}),
              ...(r.is_reply_owned_by_me !== undefined
                ? { isReplyOwnedByMe: r.is_reply_owned_by_me }
                : {}),
              ...(r.has_replies !== undefined
                ? { hasReplies: r.has_replies }
                : {}),
              ...(r.reply_audience !== undefined
                ? { replyAudience: r.reply_audience }
                : {}),
              ...(r.approval_status !== undefined
                ? { approvalStatus: r.approval_status }
                : {}),
              ...(r.hide_status !== undefined
                ? { hideStatus: r.hide_status }
                : {}),
              source: "sync",
              receivedAt: Date.now(),
            });
          }

          return ownReplyRows;
        });

        // Kombinovanje i dedup po replyId
        const replyMap = new Map<string, (typeof postReplyRows)[number]>();
        for (const r of postReplyRows) {
          replyMap.set(r.replyId, r);
        }
        for (const r of ownReplyRows) {
          replyMap.set(r.replyId, r);
        }
        const combinedReplies = Array.from(replyMap.values());

        // ── 11. Quota (GET /{id}/threads_publishing_limit) ───────────────────
        let publishingLimit: ThreadsPublishingLimit | undefined = undefined;

        await executeThreadsResource("quota", outcomes, async () => {
          publishingLimit = await getThreadsPublishingLimitDetailed({
            accessToken,
            userId,
          });

          await ctx.runMutation(internal.threadsStore.recordThreadsQuota, {
            workspaceId,
            ...(publishingLimit.publishing?.used !== undefined
              ? { postsUsed: publishingLimit.publishing.used }
              : {}),
            ...(publishingLimit.publishing?.total !== undefined
              ? { postsTotal: publishingLimit.publishing.total }
              : {}),
            ...(publishingLimit.reply?.used !== undefined
              ? { repliesUsed: publishingLimit.reply.used }
              : {}),
            ...(publishingLimit.reply?.total !== undefined
              ? { repliesTotal: publishingLimit.reply.total }
              : {}),
            ...(publishingLimit.delete?.used !== undefined
              ? { deleteUsed: publishingLimit.delete.used }
              : {}),
            ...(publishingLimit.delete?.total !== undefined
              ? { deleteTotal: publishingLimit.delete.total }
              : {}),
            ...(publishingLimit.locationSearch?.used !== undefined
              ? { locationSearchUsed: publishingLimit.locationSearch.used }
              : {}),
            ...(publishingLimit.locationSearch?.total !== undefined
              ? { locationSearchTotal: publishingLimit.locationSearch.total }
              : {}),
            ...(publishingLimit.publishing?.durationSeconds !== undefined
              ? {
                  quotaDurationSeconds:
                    publishingLimit.publishing.durationSeconds,
                }
              : {}),
          });

          return [publishingLimit];
        });

        // ── Upis svih preuzetih podataka u bazu (TH3) ────────────────────────
        const itemsWritten: number = await ctx.runMutation(
          internal.threadsStore.upsertThreadsData,
          {
            workspaceId,
            posts: postRows.length > 0 ? postRows : undefined,
            postInsights:
              postInsightRows.length > 0 ? postInsightRows : undefined,
            accountDaily:
              accountDailyRows.length > 0 ? accountDailyRows : undefined,
            accountTotals: accountTotalsRow,
            clicksByUrl:
              clicksByUrlRows.length > 0 ? clicksByUrlRows : undefined,
            followerSnapshots:
              followerSnapshotRows.length > 0
                ? followerSnapshotRows
                : undefined,
            demographics:
              demographicRows.length > 0 ? demographicRows : undefined,
            replies: combinedReplies.length > 0 ? combinedReplies : undefined,
          },
        );


        const summary = summarizeThreadsSync({
          outcomes,
          itemsWritten,
        });

        summaryResult = summary;

        return {
          itemsWritten: summary.itemsWritten,
          note: summary.note,
        };
      },
    );

    return summaryResult ?? summarizeThreadsSync({ outcomes, itemsWritten: 0 });
  },
});

/**
 * Dnevna sinhronizacija za sve aktivne Threads konekcije.
 */
export const syncAllThreads = internalAction({
  args: {},
  handler: async (ctx) => {
    const connectionIds = await ctx.runQuery(
      internal.connections.listByProvider,
      { provider: "threads" },
    );

    for (const connectionId of connectionIds) {
      try {
        await ctx.runAction(internal.threads.syncThreads, { connectionId });
      } catch (err) {
        console.error(
          `[Threads sync failed for connection ${connectionId}]`,
          sanitizeThreadsError(err),
        );
      }
    }
  },
});
