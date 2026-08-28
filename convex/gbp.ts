import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptCredentials, encryptCredentials } from "./lib/crypto";
import {
  GBP_ACCOUNTS_API,
  GBP_DEFAULT_REDIRECT_URI,
  buildGbpAuthorizeUrl,
  classifyGbpFailure,
  exchangeCodeForTokens,
  fetchAccessToken,
  getGbpClientId,
  getGbpClientSecret,
  parseGbpCredentials,
  sanitizeGbpError,
  type GbpCredentials,
} from "./lib/gbpApi";

/**
 * Google Business Profile (GBP) akcije: OAuth tok i provera stanja pristupa (GB1).
 *
 * Izvršava se u standardnom V8 runtime-u uz Web Crypto (`crypto.subtle`) i `fetch`.
 */

/** Koliko dugo traje autorizacioni tok (15 minuta). */
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Javna akcija za prijavljene članove radnog prostora:
 * generiše jednokratni state nonce i sastavlja Google OAuth 2.0 autorizacioni URL.
 */
export const gbpAuthorizeUrl = action({
  args: {
    redirectUri: v.optional(v.string()),
  },
  handler: async (ctx, { redirectUri }): Promise<{ url: string }> => {
    const clientId = getGbpClientId();
    const clientSecret = getGbpClientSecret();
    if (!clientId || !clientSecret) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Čeka Google Business OAuth konfiguraciju — dodaj GOOGLE_BUSINESS_CLIENT_ID i GOOGLE_BUSINESS_CLIENT_SECRET u Convex env promenljive.",
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

    const effectiveRedirectUri = redirectUri ?? GBP_DEFAULT_REDIRECT_URI;
    const nonce = randomNonce();
    await ctx.runMutation(internal.gbpStore.createOAuthState, {
      workspaceId: member.workspaceId,
      userId,
      nonce,
      redirectUri: effectiveRedirectUri,
    });

    const url = buildGbpAuthorizeUrl({
      clientId,
      redirectUri: effectiveRedirectUri,
      state: nonce,
    });

    return { url };
  },
});

export interface GbpOAuthResult {
  success: boolean;
  connectionId: Id<"connections">;
}

/**
 * Završetak OAuth toka iz JAVNE callback rute.
 * 1. Atomski troši state nonce (odmah se briše iz baze).
 * 2. Proverava TTL (15 min).
 * 3. Razmenjuje kod za Google tokene.
 * 4. AKO NEMA `refresh_token` — prekida sa jasnom porukom (veza bez njega umire za 1h).
 * 5. Šifruje `{ clientId, clientSecret, refreshToken }` i upisuje u `connections` tabelu.
 * 6. NE povlači naloge i lokacije (to pripada GB2, i puklo bi na 0 QPM pre odobrenja).
 */
export const completeOAuthFromCallback = action({
  args: {
    state: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { state, code }): Promise<GbpOAuthResult> => {
    const stored: {
      workspaceId: Id<"workspaces">;
      redirectUri: string;
      createdAt: number;
    } | null = await ctx.runMutation(
      internal.gbpStore.consumeOAuthState,
      { nonce: state },
    );

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

    const clientId = getGbpClientId();
    const clientSecret = getGbpClientSecret();
    if (!clientId || !clientSecret) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Čeka Google Business OAuth konfiguraciju — dodaj GOOGLE_BUSINESS_CLIENT_ID i GOOGLE_BUSINESS_CLIENT_SECRET u Convex env promenljive.",
      });
    }

    // 1. Razmena autorizacionog koda za tokene
    let tokens: { accessToken: string; refreshToken: string };
    try {
      tokens = await exchangeCodeForTokens({
        clientId,
        clientSecret,
        redirectUri: stored.redirectUri,
        code,
      });
    } catch (err) {
      throw new ConvexError({
        code: "invalid",
        message:
          err instanceof Error
            ? sanitizeGbpError(err.message)
            : "Razmena koda nije uspela.",
      });
    }

    if (!tokens.refreshToken) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Google nije vratio refresh token — veza bi istekla za 1h. Pokreni povezivanje ponovo i potvrdi sve tražene dozvole.",
      });
    }

    // 2. Šifrovanje i čuvanje kredencijala
    const secretJson = JSON.stringify({
      clientId,
      clientSecret,
      refreshToken: tokens.refreshToken,
    });

    const encryptedCredentials = await encryptCredentials(secretJson);

    // 3. Upis reda u connections tabelu
    const connectionId: Id<"connections"> = await ctx.runMutation(
      internal.gbpStore.saveConnectedCredentials,
      {
        workspaceId: stored.workspaceId,
        encryptedCredentials,
      },
    );

    return {
      success: true,
      connectionId,
    };
  },
});

export interface CheckGbpAccessResult {
  ok: boolean;
  outcome:
    | "nikad_pozvano"
    | "uspesno"
    | "kvota_nula"
    | "kvota_prekoracena"
    | "servis_nije_ukljucen"
    | "nema_dozvole"
    | "nije_pronadjeno"
    | "nepoznato";
  status?: number;
  poruka?: string;
  sirovRazlog?: string;
}

/**
 * Provera stanja pristupa Google Business Profile API-ju.
 *
 * Izvršava jedan najjeftiniji mogući poziv (`GET {GBP_ACCOUNTS_API}/accounts?pageSize=1`)
 * samo da bi se utvrdilo stanje pristupa i kvote.
 * Rezultat se klasifikuje kroz `classifyGbpFailure` i beleži u `gbAccessState`.
 */
export const checkGbpAccess = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, { workspaceId }): Promise<CheckGbpAccessResult> => {
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
    if (member === null || member.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const conn = await ctx.runQuery(internal.gbpStore.getGbConnection, {
      workspaceId,
    });

    if (!conn) {
      throw new ConvexError({
        code: "invalid",
        message: "Google Business nalog nije povezan za ovaj radni prostor.",
      });
    }

    let creds: GbpCredentials;
    try {
      const decrypted = await decryptCredentials(conn.encryptedCredentials);
      creds = parseGbpCredentials(decrypted);
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : "Neispravni kredencijali";
      const sanitized = sanitizeGbpError(reason);
      await ctx.runMutation(internal.gbpStore.recordAccessOutcome, {
        workspaceId,
        outcome: "nema_dozvole",
        reason: sanitized,
        checkedAt: Date.now(),
      });
      return {
        ok: false,
        outcome: "nema_dozvole",
        poruka: sanitized,
      };
    }

    // 1. Dohvatanje kratkoživećeg access tokena
    let accessToken: string;
    try {
      accessToken = await fetchAccessToken(creds);
    } catch (err) {
      const poruka =
        err instanceof Error
          ? sanitizeGbpError(err.message)
          : "Neuspelo osvežavanje tokena";
      await ctx.runMutation(internal.gbpStore.recordAccessOutcome, {
        workspaceId,
        outcome: "nema_dozvole",
        status: 401,
        reason: poruka,
        checkedAt: Date.now(),
      });
      return {
        ok: false,
        outcome: "nema_dozvole",
        status: 401,
        poruka,
      };
    }

    // 2. Najjeftiniji mogući poziv ka Google Business API-ju
    const checkUrl = `${GBP_ACCOUNTS_API}/accounts?pageSize=1`;
    let res: Response;
    let body = "";
    try {
      res = await fetch(checkUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      body = await res.text().catch(() => "");
    } catch (err) {
      const poruka =
        err instanceof Error
          ? sanitizeGbpError(err.message)
          : "Mrežna greška pri pozivu Google API-ja";
      await ctx.runMutation(internal.gbpStore.recordAccessOutcome, {
        workspaceId,
        outcome: "nepoznato",
        reason: poruka,
        checkedAt: Date.now(),
      });
      return {
        ok: false,
        outcome: "nepoznato",
        poruka,
      };
    }

    const now = Date.now();
    if (res.ok) {
      await ctx.runMutation(internal.gbpStore.recordAccessOutcome, {
        workspaceId,
        outcome: "uspesno",
        status: res.status,
        checkedAt: now,
      });
      return {
        ok: true,
        outcome: "uspesno",
        status: res.status,
      };
    }

    const failure = classifyGbpFailure(res.status, body);
    const outcomeToRecord:
      | "nikad_pozvano"
      | "uspesno"
      | "kvota_nula"
      | "kvota_prekoracena"
      | "servis_nije_ukljucen"
      | "nema_dozvole"
      | "nepoznato" =
      failure.vrsta === "nije_pronadjeno" ? "nepoznato" : failure.vrsta;

    await ctx.runMutation(internal.gbpStore.recordAccessOutcome, {
      workspaceId,
      outcome: outcomeToRecord,
      status: failure.status,
      reason: failure.poruka,
      checkedAt: now,
    });

    return {
      ok: false,
      outcome: failure.vrsta,
      status: failure.status,
      poruka: failure.poruka,
      sirovRazlog: failure.sirovRazlog,
    };
  },
});
