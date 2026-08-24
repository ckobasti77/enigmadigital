import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials, encryptCredentials } from "./lib/crypto";
import {
  THREADS_REDIRECT_URI,
  THREADS_SCOPES,
  buildThreadsAuthorizeUrl,
  sanitizeThreadsError,
} from "./lib/threadsShared";
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  getThreadsAppId,
  getThreadsAppSecret,
  getThreadsUserProfile,
  refreshLongLivedToken,
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
