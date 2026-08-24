import type { Provider } from "./providers";
import {
  INSTAGRAM_GRAPH_BASE_URL,
  getMetaGraphVersion,
} from "./instagramApi";
import { FACEBOOK_GRAPH_BASE_URL } from "./facebookApi";

/**
 * ============================================================================
 * HANDING THE TOKEN BACK (P3, point 3)
 * ============================================================================
 *
 * Erasure that only deletes the local copy of a token is half a disconnect.
 * The grant itself lives on the user's Google or Meta account, and until it is
 * revoked THERE the app is still authorized — with `youtube.force-ssl`, which
 * is permission to write on the channel. A person who pressed "Prekini vezu"
 * has no reason to believe that survived, and an auditor checking the account's
 * connected-apps list finds it still listed.
 *
 * The order matters and is the reason this runs where it does: the credentials
 * cannot be destroyed first, because then there is nothing left to revoke WITH.
 * So the disconnect revokes, records what happened, and only then wipes.
 *
 * Failure is never fatal. The data has to go regardless of what the provider's
 * revoke endpoint answers, so a refusal is written down and shown to the person
 * with the link they need to finish it by hand — not raised as an error that
 * would leave the erasure unstarted.
 * ============================================================================
 */

export type RevokeOutcome = {
  status: "ok" | "failed" | "unsupported";
  /** Non-secret, already fit to show in Settings. */
  error?: string;
};

/**
 * What to tell the operator when automatic revoke has run out of tries (R1/4d).
 *
 * The data is gone either way; this is the one thing left for a person to do,
 * and it has to name WHERE. A pure function so a mutation can build the notice
 * without an outbound call.
 */
export function manualRevokeMessage(provider: Provider): string {
  switch (provider) {
    case "youtube":
    case "google_ads":
      return "Opoziv nije uspeo posle više pokušaja. Ručno ukloni pristup aplikaciji na https://myaccount.google.com/permissions.";
    case "meta_ig":
    case "meta_fb":
      return "Opoziv nije uspeo posle više pokušaja. Ručno ukloni aplikaciju u podešavanjima Meta naloga: Settings → Business Integrations (https://www.facebook.com/settings?tab=business_tools).";
    case "meta_ads":
      return "Opoziv nije uspeo posle više pokušaja. System User token se opoziva u Business Manager-u: Business settings → System users → Assets.";
    case "ga4":
    case "openreply":
      return "Opoziv nije uspeo posle više pokušaja.";
    case "threads":
      return "Opoziv nije uspeo posle više pokušaja. Ručno ukloni aplikaciju u podešavanjima Threads naloga.";
  }
}

const REVOKE_TIMEOUT_MS = 10_000;

/** `fetch` with a ceiling. A revoke that hangs must not hold up the erasure. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVOKE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Read the refresh token out of a stored JSON credential blob. */
function readRefreshToken(secret: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secret);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const p = parsed as Record<string, unknown>;
  const token = String(p.refreshToken || p.refresh_token || "").trim();
  return token.length > 0 ? token : null;
}

/**
 * Google's revoke endpoint, exactly as documented: a form-encoded POST whose
 * body is the token.
 *
 * A 400 answer meaning "this token is not valid" counts as success. The grant
 * is gone either way, and reporting a failure that tells the user to go and
 * revoke something that no longer exists is worse than saying nothing.
 */
async function revokeGoogleToken(refreshToken: string): Promise<RevokeOutcome> {
  let response: Response;
  try {
    response = await fetchWithTimeout("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken }).toString(),
    });
  } catch (error) {
    return {
      status: "failed",
      error: `Google nije odgovorio na zahtev za opoziv (${
        error instanceof Error ? error.message : "mrežna greška"
      }).`,
    };
  }

  if (response.ok) return { status: "ok" };

  const body = await response.text().catch(() => "");
  if (response.status === 400 && body.includes("invalid_token")) {
    return { status: "ok" };
  }
  return {
    status: "failed",
    error: `Google je odbio opoziv (HTTP ${response.status}).`,
  };
}

/**
 * Meta's equivalent: `DELETE /me/permissions`, which drops every permission the
 * app holds for that user and de-authorizes it.
 *
 * The Page token cannot do this — it belongs to the Page, not to the person who
 * granted anything — so the Facebook side revokes with the stored USER token
 * and falls back to the Page token only when there is no user token left.
 */
async function revokeMetaToken(
  baseUrl: string,
  accessToken: string,
): Promise<RevokeOutcome> {
  const url = new URL(
    `${baseUrl}/${getMetaGraphVersion()}/me/permissions`,
  );
  url.searchParams.set("access_token", accessToken);

  let response: Response;
  try {
    response = await fetchWithTimeout(url.toString(), { method: "DELETE" });
  } catch (error) {
    return {
      status: "failed",
      error: `Meta nije odgovorila na zahtev za opoziv (${
        error instanceof Error ? error.message : "mrežna greška"
      }).`,
    };
  }

  if (response.ok) return { status: "ok" };
  return {
    status: "failed",
    error: `Meta je odbila opoziv (HTTP ${response.status}).`,
  };
}

/**
 * Revoke this app's access for one provider, best effort.
 *
 * `secret` is the decrypted primary credential; `userSecret` the decrypted
 * `encryptedUserCredentials` where one exists (Facebook Pages only).
 */
export async function revokeProviderAccess(
  provider: Provider,
  secret: string,
  userSecret?: string,
): Promise<RevokeOutcome> {
  switch (provider) {
    case "youtube":
    case "google_ads": {
      const refreshToken = readRefreshToken(secret);
      if (refreshToken === null) {
        return {
          status: "failed",
          error:
            "U sačuvanim kredencijalima nije pronađen refresh token, pa opoziv nije ni pokušan.",
        };
      }
      return await revokeGoogleToken(refreshToken);
    }
    case "meta_ig":
      return await revokeMetaToken(INSTAGRAM_GRAPH_BASE_URL, secret);
    case "meta_fb":
      return await revokeMetaToken(
        FACEBOOK_GRAPH_BASE_URL,
        userSecret ?? secret,
      );
    case "ga4":
      // A GA4 connection is a service account key, not a user grant: there is
      // no consent on anybody's Google account to take back. The key itself is
      // deleted here, but it also has to be removed in Google Cloud IAM.
      return {
        status: "unsupported",
        error:
          "GA4 koristi ključ servisnog naloga, a ne dozvolu na Google nalogu — nema šta da se opozove. Sam ključ obriši u Google Cloud konzoli (IAM → Service accounts).",
      };
    case "meta_ads":
      // A System User token is issued by Business Manager and is not tied to a
      // person's consent, so `DELETE /me/permissions` has nothing to remove.
      return {
        status: "unsupported",
        error:
          "Meta Ads koristi System User token iz Business Manager-a — opoziv se radi tamo (Business settings → System users → Assets).",
      };
    case "openreply":
    case "threads":
      return { status: "unsupported" };
  }
}
