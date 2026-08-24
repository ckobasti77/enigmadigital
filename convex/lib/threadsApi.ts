/**
 * ============================================================================
 * THREADS GRAPH API MODULE (V8 Runtime Safe)
 * ============================================================================
 *
 * KRITIČNO PRAVILO RUNTIME-A:
 * Ovaj fajl NEMA "use node" i NE UVOZI nijedan Node built-in modul (fs, crypto, net...).
 * Poziva se običnim `fetch`-om i u potpunosti ostaje u Convex V8 runtime-u.
 *
 * Bezbednost:
 *   - Token, client_secret i autorizacioni kod se nikada ne loguju.
 *   - Token se šalje isključivo kroz Authorization: Bearer zaglavlje.
 * ============================================================================
 */

import {
  THREADS_API_BASE,
  THREADS_API_VERSION,
  buildThreadsHeaders,
  buildThreadsUrl,
  extractThreadsApiError,
  parseThreadsPublishingLimit,
  type ThreadsPublishingLimit,
} from "./threadsShared";

/**
 * Dohvata THREADS_APP_ID iz okruženja (ili fallback na META_APP_ID).
 */
export function getThreadsAppId(): string | undefined {
  return process.env.THREADS_APP_ID?.trim() || process.env.META_APP_ID?.trim();
}

/**
 * Dohvata THREADS_APP_SECRET iz okruženja (ili fallback na META_APP_SECRET).
 */
export function getThreadsAppSecret(): string | undefined {
  return (
    process.env.THREADS_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim()
  );
}

/**
 * Tipizovani GET poziv ka Threads API-ju.
 * Token ide ISKLJUČIVO kroz Authorization: Bearer zaglavlje, nikada kroz query string.
 */
export async function threadsGet<T>(
  path: string,
  {
    accessToken,
    params,
    version = THREADS_API_VERSION,
  }: {
    accessToken: string;
    params?: Record<string, string>;
    version?: string;
  },
): Promise<T> {
  const base = buildThreadsUrl(path, version);
  const url = new URL(base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: buildThreadsHeaders(accessToken),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(extractThreadsApiError(bodyText, res.status));
  }

  return (await res.json()) as T;
}

/**
 * Tipizovani POST poziv ka Threads API-ju.
 */
export async function threadsPost<T>(
  path: string,
  {
    accessToken,
    body,
    version = THREADS_API_VERSION,
  }: {
    accessToken: string;
    body?: unknown;
    version?: string;
  },
): Promise<T> {
  const url = buildThreadsUrl(path, version);
  const headers = buildThreadsHeaders(accessToken);
  let requestBody: string | undefined;

  if (body !== undefined) {
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: requestBody,
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(extractThreadsApiError(bodyText, res.status));
  }

  return (await res.json()) as T;
}

/**
 * Korak 2 OAuth toka (odeljak 3.2):
 * POST https://graph.threads.com/oauth/access_token
 * Razmena autorizacionog koda za short-lived token (trajanje ~1 sat).
 */
export async function exchangeCodeForShortLivedToken({
  clientId,
  clientSecret,
  code,
  redirectUri,
}: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; userId: string; tokenType?: string }> {
  const url = `${THREADS_API_BASE}/oauth/access_token`;
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(extractThreadsApiError(bodyText, res.status));
  }

  const data = (await res.json()) as {
    access_token?: string;
    user_id?: string | number;
    token_type?: string;
  };

  if (!data.access_token) {
    throw new Error("Threads API nije vratio access_token.");
  }
  if (!data.user_id) {
    throw new Error("Threads API nije vratio user_id.");
  }

  return {
    accessToken: data.access_token,
    userId: String(data.user_id),
    tokenType: data.token_type,
  };
}

/**
 * Korak 3 OAuth toka (odeljak 3.2):
 * GET https://graph.threads.com/access_token?grant_type=th_exchange_token&client_secret=...&access_token=...
 * Razmena short-lived tokena za long-lived token (~60 dana).
 */
export async function exchangeForLongLivedToken({
  clientSecret,
  shortLivedToken,
}: {
  clientSecret: string;
  shortLivedToken: string;
}): Promise<{ accessToken: string; expiresIn: number; tokenType?: string }> {
  const url = new URL(`${THREADS_API_BASE}/access_token`);
  url.searchParams.set("grant_type", "th_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: buildThreadsHeaders(shortLivedToken),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(extractThreadsApiError(bodyText, res.status));
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!data.access_token) {
    throw new Error("Threads API nije vratio dugotrajni access_token.");
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5184000, // ~60 dana (5184000 sekundi)
    tokenType: data.token_type,
  };
}

/**
 * Korak 4 OAuth toka (odeljak 3.2 i 3.3):
 * GET https://graph.threads.com/refresh_access_token?grant_type=th_refresh_token&access_token=...
 * Osvežavanje postojećeg long-lived tokena (produžava za novih 60 dana).
 */
export async function refreshLongLivedToken({
  longLivedToken,
}: {
  longLivedToken: string;
}): Promise<{ accessToken: string; expiresIn: number; tokenType?: string }> {
  const url = new URL(`${THREADS_API_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", longLivedToken);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: buildThreadsHeaders(longLivedToken),
  });

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(extractThreadsApiError(bodyText, res.status));
  }

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!data.access_token) {
    throw new Error("Threads API nije vratio osveženi access_token.");
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 5184000,
    tokenType: data.token_type,
  };
}

/**
 * Čita profil prijavljenog Threads naloga (/me).
 */
export async function getThreadsUserProfile({
  accessToken,
}: {
  accessToken: string;
}): Promise<{
  id: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
}> {
  return await threadsGet<{
    id: string;
    username?: string;
    name?: string;
    threads_profile_picture_url?: string;
  }>("me", {
    accessToken,
    params: {
      fields: "id,username,name,threads_profile_picture_url",
    },
  });
}

/**
 * Čita kvote naloga jednim pozivom (odeljak 8):
 * GET /{user-id}/threads_publishing_limit
 */
export async function getThreadsPublishingLimit({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<ThreadsPublishingLimit> {
  const raw = await threadsGet<unknown>(`${userId}/threads_publishing_limit`, {
    accessToken,
    params: {
      fields:
        "quota_usage,config,reply_quota_usage,reply_config,delete_quota_usage,delete_config,location_search_quota_usage,location_search_config",
    },
  });
  return parseThreadsPublishingLimit(raw);
}
