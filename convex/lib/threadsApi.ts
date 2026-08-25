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
  sanitizeThreadsError,
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
    params,
    body,
    version = THREADS_API_VERSION,
  }: {
    accessToken: string;
    params?: Record<string, string>;
    body?: unknown;
    version?: string;
  },
): Promise<T> {
  const base = buildThreadsUrl(path, version);
  const url = new URL(base);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  const headers = buildThreadsHeaders(accessToken);
  let requestBody: string | undefined;

  if (body !== undefined) {
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(url.toString(), {
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
 * Tipizovani DELETE poziv ka Threads API-ju.
 */
export async function threadsDelete<T>(
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
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }
  const headers = buildThreadsHeaders(accessToken);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers,
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
 * Koristi se isključivo tokom OAuth callback-a da se sazna početni ID.
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
 * Čita profil korisnika po eksplicitnom ID-ju (nikad /me).
 * Resurs 1: GET /{id}?fields=id,username
 */
export async function getThreadsProfile({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<{ id: string; username?: string }> {
  return await threadsGet<{ id: string; username?: string }>(userId, {
    accessToken,
    params: {
      fields: "id,username",
    },
  });
}

/**
 * Polja dokazana u Dodatku B.2 za objave.
 * NIKADA ne uključuje polja iz B.3 (url_attached, quoted_post_id, reposted_media_id, gif_attachment).
 */
export const THREADS_POST_FIELDS =
  "id,media_product_type,media_type,permalink,owner{id},username,text,timestamp,shortcode,is_quote_post,quoted_post{id},reposted_post{id},poll_attachment,has_replies,root_post{id},replied_to{id},is_reply,is_reply_owned_by_me,reply_audience,media_url,thumbnail_url,children,alt_text,link_attachment_url,topic_tag,location_id,hide_status";

export interface RawThreadsPostItem {
  id: string;
  media_product_type?: string;
  media_type: string;
  permalink?: string;
  owner?: { id?: string };
  username?: string;
  text?: string;
  timestamp?: string;
  shortcode?: string;
  is_quote_post?: boolean;
  quoted_post?: { id?: string };
  reposted_post?: { id?: string };
  poll_attachment?: unknown;
  has_replies?: boolean;
  root_post?: { id?: string };
  replied_to?: { id?: string };
  is_reply?: boolean;
  is_reply_owned_by_me?: boolean;
  reply_audience?: string;
  media_url?: string;
  thumbnail_url?: string;
  children?:
    | {
        data?: Array<{
          id: string;
          media_type?: string;
          media_url?: string;
          thumbnail_url?: string;
        }>;
      }
    | Array<{
        id: string;
        media_type?: string;
        media_url?: string;
        thumbnail_url?: string;
      }>;
  alt_text?: string;
  link_attachment_url?: string;
  topic_tag?: string;
  location_id?: string;
  hide_status?: string;
}

export interface ThreadsPostsPageResponse {
  data?: RawThreadsPostItem[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
}

/**
 * Čita objave korisnika sa kursor paginacijom i lookback prozorom.
 * Resurs 2: GET /{id}/threads
 */
export async function getThreadsPostsPage({
  accessToken,
  userId,
  since,
  limit = 50,
  after,
}: {
  accessToken: string;
  userId: string;
  since?: number;
  limit?: number;
  after?: string;
}): Promise<ThreadsPostsPageResponse> {
  const params: Record<string, string> = {
    fields: THREADS_POST_FIELDS,
    limit: String(limit),
  };
  if (since !== undefined) {
    params.since = String(since);
  }
  if (after !== undefined) {
    params.after = after;
  }

  return await threadsGet<ThreadsPostsPageResponse>(`${userId}/threads`, {
    accessToken,
    params,
  });
}

export interface RawThreadsPostInsightsResponse {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{ value?: number }>;
    total_value?: { value?: number };
    title?: string;
    description?: string;
    id?: string;
  }>;
}

/**
 * Čita kumulativne metrike po objavi (views, likes, replies, reposts, quotes, shares).
 * Resurs 3: GET /{media-id}/insights?metric=views,likes,replies,reposts,quotes,shares
 * NAPOMENA: Za REPOST_FACADE objave API vraća prazan niz (uredan ishod, ne greška).
 */
export async function getThreadsPostInsights({
  accessToken,
  mediaId,
}: {
  accessToken: string;
  mediaId: string;
}): Promise<RawThreadsPostInsightsResponse> {
  return await threadsGet<RawThreadsPostInsightsResponse>(
    `${mediaId}/insights`,
    {
      accessToken,
      params: {
        metric: "views,likes,replies,reposts,quotes,shares",
      },
    },
  );
}

export interface RawThreadsAccountViewsResponse {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{
      value?: number;
      end_time?: string;
    }>;
    total_value?: { value?: number };
    title?: string;
    description?: string;
    id?: string;
  }>;
}

/**
 * Čita vremensku seriju pregleda po danu za nalog.
 * Resurs 4: GET /{id}/threads_insights?metric=views
 */
export async function getThreadsAccountViews({
  accessToken,
  userId,
  since,
  until,
}: {
  accessToken: string;
  userId: string;
  since?: number;
  until?: number;
}): Promise<RawThreadsAccountViewsResponse> {
  const params: Record<string, string> = {
    metric: "views",
  };
  if (since !== undefined) params.since = String(since);
  if (until !== undefined) params.until = String(until);

  return await threadsGet<RawThreadsAccountViewsResponse>(
    `${userId}/threads_insights`,
    {
      accessToken,
      params,
    },
  );
}

export interface RawThreadsAccountTotalsResponse {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{ value?: number }>;
    total_value?: { value?: number };
    title?: string;
    description?: string;
    id?: string;
  }>;
}

/**
 * Čita kumulativne metrike naloga (likes, replies, reposts, quotes).
 * Resurs 5: GET /{id}/threads_insights?metric=likes,replies,reposts,quotes
 */
export async function getThreadsAccountTotals({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<RawThreadsAccountTotalsResponse> {
  return await threadsGet<RawThreadsAccountTotalsResponse>(
    `${userId}/threads_insights`,
    {
      accessToken,
      params: {
        metric: "likes,replies,reposts,quotes",
      },
    },
  );
}

export interface RawThreadsClicksResponse {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{
      value?: number | Record<string, number>;
      end_time?: string;
      dimension_values?: string[];
    }>;
    total_value?: {
      value?: number;
      breakdowns?: Array<{
        dimension_keys?: string[];
        results?: Array<{
          dimension_values?: string[];
          value?: number;
        }>;
      }>;
    };
    title?: string;
    description?: string;
    id?: string;
  }>;
}

/**
 * Čita klikove razbijene po URL-u.
 * Resurs 6: GET /{id}/threads_insights?metric=clicks
 */
export async function getThreadsClicksByUrl({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<RawThreadsClicksResponse> {
  return await threadsGet<RawThreadsClicksResponse>(
    `${userId}/threads_insights`,
    {
      accessToken,
      params: {
        metric: "clicks",
      },
    },
  );
}

export interface RawThreadsFollowersCountResponse {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{ value?: number }>;
    total_value?: { value?: number };
    title?: string;
    description?: string;
    id?: string;
  }>;
}

/**
 * Čita trenutno stanje broja pratilaca.
 * Resurs 7: GET /{id}/threads_insights?metric=followers_count
 */
export async function getThreadsFollowersCount({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<RawThreadsFollowersCountResponse> {
  return await threadsGet<RawThreadsFollowersCountResponse>(
    `${userId}/threads_insights`,
    {
      accessToken,
      params: {
        metric: "followers_count",
      },
    },
  );
}

export interface RawThreadsDemographicsResponse {
  data?: Array<{
    name: string;
    period?: string;
    values?: Array<{
      value?: number | Record<string, number>;
      dimension_values?: string[];
    }>;
    total_value?: {
      value?: number;
      breakdowns?: Array<{
        dimension_keys?: string[];
        results?: Array<{
          dimension_values?: string[];
          value?: number;
        }>;
      }>;
    };
    title?: string;
    description?: string;
    id?: string;
  }>;
}

/**
 * Čita demografiju pratilaca za jedan specificiran breakdown ("country" | "city" | "age" | "gender").
 * Resurs 8: GET /{id}/threads_insights?metric=follower_demographics&breakdown={breakdown}
 * NAPOMENA: Zahteva min 100 pratilaca. Ako API to odbije (npr. greška ili <100), vraća null kao uredan ishod „nije dostupno".
 */
export async function getThreadsDemographics({
  accessToken,
  userId,
  breakdown,
}: {
  accessToken: string;
  userId: string;
  breakdown: "country" | "city" | "age" | "gender";
}): Promise<RawThreadsDemographicsResponse | null> {
  try {
    return await threadsGet<RawThreadsDemographicsResponse>(
      `${userId}/threads_insights`,
      {
        accessToken,
        params: {
          metric: "follower_demographics",
          breakdown,
        },
      },
    );
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    const isDemographicsUnavailable =
      errMessage.includes("100") ||
      errMessage.toLowerCase().includes("follower") ||
      errMessage.toLowerCase().includes("demographic") ||
      errMessage.toLowerCase().includes("not enough data") ||
      errMessage.toLowerCase().includes("insufficient");

    if (isDemographicsUnavailable) {
      console.log(
        `[Threads demographics unavailable for ${breakdown} on ${userId}]: ${errMessage}`,
      );
      return null;
    }

    throw err;
  }
}

export const THREADS_REPLY_FIELDS =
  "id,text,username,permalink,timestamp,media_type,media_url,shortcode,owner{id},root_post{id},replied_to{id},is_reply,is_reply_owned_by_me,has_replies,reply_audience,hide_status";

export interface RawThreadsReplyItem {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string | number;
  media_type?: string;
  media_url?: string;
  shortcode?: string;
  owner?: { id?: string };
  root_post?: { id?: string };
  replied_to?: { id?: string };
  is_reply?: boolean;
  is_reply_owned_by_me?: boolean;
  has_replies?: boolean;
  reply_audience?: string;
  hide_status?: string;
  approval_status?: string;
}

export interface RawThreadsRepliesResponse {
  data?: RawThreadsReplyItem[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
}

/**
 * Čita prvi nivo odgovora za određenu objavu (§5.2).
 * Resurs 9: GET /{media-id}/replies
 */
export async function getThreadsPostReplies({
  accessToken,
  mediaId,
  fields = THREADS_REPLY_FIELDS,
  reverse,
  after,
  limit = 50,
}: {
  accessToken: string;
  mediaId: string;
  fields?: string;
  reverse?: boolean;
  after?: string;
  limit?: number;
}): Promise<RawThreadsRepliesResponse> {
  const params: Record<string, string> = {
    fields,
    limit: String(limit),
  };
  if (reverse !== undefined) params.reverse = String(reverse);
  if (after) params.after = after;

  return await threadsGet<RawThreadsRepliesResponse>(`${mediaId}/replies`, {
    accessToken,
    params,
  });
}

/** Kompatibilni alias za getThreadsPostReplies */
export const getThreadsReplies = getThreadsPostReplies;

/**
 * Čita celu spljoštenu nit odgovora za određenu objavu (§5.2).
 * GET /{media-id}/conversation
 */
export async function getThreadsConversation({
  accessToken,
  mediaId,
  fields = THREADS_REPLY_FIELDS,
  reverse,
  after,
  limit = 50,
}: {
  accessToken: string;
  mediaId: string;
  fields?: string;
  reverse?: boolean;
  after?: string;
  limit?: number;
}): Promise<RawThreadsRepliesResponse> {
  const params: Record<string, string> = {
    fields,
    limit: String(limit),
  };
  if (reverse !== undefined) params.reverse = String(reverse);
  if (after) params.after = after;

  return await threadsGet<RawThreadsRepliesResponse>(
    `${mediaId}/conversation`,
    {
      accessToken,
      params,
    },
  );
}

/**
 * Čita sve odgovore koje je naš nalog napisao (§5.2).
 * GET /{user-id}/replies
 *
 * VAŽNO: Koristi eksplicitni userId naloga, NIKADA /me/replies (/me alias je nepouzdan).
 */
export async function getThreadsOwnReplies({
  accessToken,
  userId,
  fields = THREADS_REPLY_FIELDS,
  since,
  after,
  limit = 50,
}: {
  accessToken: string;
  userId: string;
  fields?: string;
  since?: number;
  after?: string;
  limit?: number;
}): Promise<RawThreadsRepliesResponse> {
  const params: Record<string, string> = {
    fields,
    limit: String(limit),
  };
  if (since !== undefined) params.since = String(since);
  if (after) params.after = after;

  return await threadsGet<RawThreadsRepliesResponse>(`${userId}/replies`, {
    accessToken,
    params,
  });
}

/**
 * Upravlja vidljivošću odgovora (sakrivanje / otkrivanje, §5.2).
 * POST /{reply-id}/manage_reply
 */
export async function manageThreadsReply({
  accessToken,
  replyId,
  hide,
}: {
  accessToken: string;
  replyId: string;
  hide: boolean;
}): Promise<{ success: boolean }> {
  return await threadsPost<{ success: boolean }>(`${replyId}/manage_reply`, {
    accessToken,
    params: {
      hide: String(hide),
    },
  });
}

/**
 * Čita odgovore koji čekaju odobrenje za konkretnu objavu (Dodatak A.2).
 * GET /{media-id}/pending_replies
 *
 * VAŽNO (Dodatak A.2): /me/pending_replies NE POSTOJI — poziva se ISKLJUČIVO nad ID-jem objave.
 * VAŽNO (Dodatak B.6): Tačan oblik odgovora nije empirijski dokazan. Ako odgovor ne sadrži
 * očekivani format sa nizom `data`, funkcija BACA grešku sa jasnom porukom umesto vraćanja praznog niza.
 */
/**
 * Opisuje OBLIK odgovora, bez ijedne vrednosti iz njega.
 *
 * `JSON.stringify(raw)` u poruci greške je curenje: telo `pending_replies`
 * nosi `username` i `text` tuđih ljudi, a ta poruka završava u bazi, u
 * logovima i na ekranu. Za dijagnostiku „oblik nije onakav kakav očekujemo“
 * dovoljna su imena ključeva — sadržaj nije.
 */
export function describeThreadsShape(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return `niz[${raw.length}]`;
  if (typeof raw !== "object") return typeof raw;

  const obj = raw as Record<string, unknown>;
  const parts = Object.keys(obj).map((key) => {
    const value = obj[key];
    if (Array.isArray(value)) {
      const first = value[0];
      const inner =
        first !== null && typeof first === "object"
          ? `{${Object.keys(first as Record<string, unknown>).join(",")}}`
          : typeof first;
      return `${key}: niz[${value.length}] od ${inner}`;
    }
    if (value !== null && typeof value === "object") {
      return `${key}: {${Object.keys(value as Record<string, unknown>).join(",")}}`;
    }
    return `${key}: ${value === null ? "null" : typeof value}`;
  });

  return `{${parts.join(", ")}}`;
}

export async function getThreadsPendingReplies({
  accessToken,
  mediaId,
  approvalStatus = "pending",
  reverse,
}: {
  accessToken: string;
  mediaId: string;
  approvalStatus?: "pending" | "ignored";
  reverse?: boolean;
}): Promise<RawThreadsRepliesResponse> {
  const params: Record<string, string> = {
    approval_status: approvalStatus,
  };
  if (reverse !== undefined) params.reverse = String(reverse);

  const raw = await threadsGet<unknown>(`${mediaId}/pending_replies`, {
    accessToken,
    params,
  });

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("data" in raw) ||
    !Array.isArray((raw as { data: unknown }).data)
  ) {
    throw new Error(
      `[Threads API] Endpoint ${mediaId}/pending_replies vratio je neočekivan/nedokazan oblik odgovora. Pročitan oblik: ${describeThreadsShape(raw)}`,
    );
  }

  return raw as RawThreadsRepliesResponse;
}

/**
 * Odobrava ili ignoriše odgovor na čekanju (Dodatak A.2).
 * POST /{reply-id}/manage_pending_reply
 *
 * VAŽNO (Dodatak B.6): Tačan oblik odgovora nije empirijski dokazan. Ako odgovor ne sadrži
 * boolean polje `success`, funkcija BACA grešku umesto pretpostavke uspeha.
 */
export async function managePendingReply({
  accessToken,
  replyId,
  approve,
}: {
  accessToken: string;
  replyId: string;
  approve: boolean;
}): Promise<{ success: boolean }> {
  const raw = await threadsPost<unknown>(`${replyId}/manage_pending_reply`, {
    accessToken,
    params: {
      approve: String(approve),
    },
  });

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("success" in raw) ||
    typeof (raw as { success: unknown }).success !== "boolean"
  ) {
    throw new Error(
      `[Threads API] Endpoint ${replyId}/manage_pending_reply vratio je neočekivan/nedokazan oblik odgovora. Pročitan oblik: ${describeThreadsShape(raw)}`,
    );
  }

  return raw as { success: boolean };
}


/**
 * Čita kvote naloga (Resurs 10):
 * Obavezna polja se traže zajedno: quota_usage,config,reply_quota_usage,reply_config
 * Opciona (delete_*, location_search_*) se traže u zasebnim upitima jer umeju da vrate HTTP 500.
 */
export async function getThreadsPublishingLimitDetailed({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<ThreadsPublishingLimit> {
  // 1. Obavezna polja
  const requiredRaw = await threadsGet<unknown>(
    `${userId}/threads_publishing_limit`,
    {
      accessToken,
      params: {
        fields: "quota_usage,config,reply_quota_usage,reply_config",
      },
    },
  );

  const baseQuota = parseThreadsPublishingLimit(requiredRaw);

  // 2. Opciono: delete kvota
  try {
    const deleteRaw = await threadsGet<unknown>(
      `${userId}/threads_publishing_limit`,
      {
        accessToken,
        params: {
          fields: "delete_quota_usage,delete_config",
        },
      },
    );
    const deleteParsed = parseThreadsPublishingLimit(deleteRaw);
    if (deleteParsed.delete) {
      baseQuota.delete = deleteParsed.delete;
    }
  } catch (err) {
    console.warn(
      `[Threads delete_quota not supported or failed for ${userId}]`,
      sanitizeThreadsError(err),
    );
  }

  // 3. Opciono: location search kvota
  try {
    const locRaw = await threadsGet<unknown>(
      `${userId}/threads_publishing_limit`,
      {
        accessToken,
        params: {
          fields: "location_search_quota_usage,location_search_config",
        },
      },
    );
    const locParsed = parseThreadsPublishingLimit(locRaw);
    if (locParsed.locationSearch) {
      baseQuota.locationSearch = locParsed.locationSearch;
    }
  } catch (err) {
    console.warn(
      `[Threads location_search_quota not supported or failed for ${userId}]`,
      sanitizeThreadsError(err),
    );
  }

  return baseQuota;
}

/**
 * Čita kvote naloga jednim pozivom (kompatibilnost).
 */
export async function getThreadsPublishingLimit({
  accessToken,
  userId,
}: {
  accessToken: string;
  userId: string;
}): Promise<ThreadsPublishingLimit> {
  return await getThreadsPublishingLimitDetailed({ accessToken, userId });
}

// ── Objavljivanje i upravljanje objavama (§4.1, §4.2, §4.4) ─────────────────

export interface CreateThreadsContainerParams {
  media_type: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
  text?: string;
  image_url?: string;
  video_url?: string;
  is_carousel_item?: boolean;
  children?: string;
  reply_to_id?: string;
  reply_control?:
    | "everyone"
    | "accounts_you_follow"
    | "mentioned_only"
    | "parent_post_author_only"
    | "followers_only";
  allowlisted_country_codes?: string[] | string;
  alt_text?: string;
  link_attachment?: string;
  quote_post_id?: string;
  poll_attachment?:
    | {
        option_a: string;
        option_b: string;
        option_c?: string;
        option_d?: string;
      }
    | string;
  auto_publish_text?: boolean;
  topic_tag?: string;
  is_spoiler_media?: boolean;
  is_ghost_post?: boolean;
  enable_reply_approvals?: boolean;
  crossreshare_to_ig?: boolean;
  crossreshare_to_ig_dark_mode?: boolean;
  location_id?: string;
}

/**
 * Kreira medijski ili tekstualni kontejner na Threads-u (§4.2).
 * POST /{user-id}/threads
 *
 * Polja koja nisu prosleđena se izostavljaju (ne šalju se prazni stringovi).
 */
export async function createThreadsContainer({
  accessToken,
  userId,
  params,
}: {
  accessToken: string;
  userId: string;
  params: CreateThreadsContainerParams;
}): Promise<{ id: string }> {
  const queryParams: Record<string, string> = {
    media_type: params.media_type,
  };

  if (params.text) queryParams.text = params.text;
  if (params.image_url) queryParams.image_url = params.image_url;
  if (params.video_url) queryParams.video_url = params.video_url;
  if (params.is_carousel_item !== undefined) {
    queryParams.is_carousel_item = String(params.is_carousel_item);
  }
  if (params.children) queryParams.children = params.children;
  if (params.reply_to_id) queryParams.reply_to_id = params.reply_to_id;
  if (params.reply_control) queryParams.reply_control = params.reply_control;
  if (params.allowlisted_country_codes) {
    queryParams.allowlisted_country_codes = Array.isArray(
      params.allowlisted_country_codes,
    )
      ? params.allowlisted_country_codes.join(",")
      : params.allowlisted_country_codes;
  }
  if (params.alt_text) queryParams.alt_text = params.alt_text;
  if (params.link_attachment) queryParams.link_attachment = params.link_attachment;
  if (params.quote_post_id) queryParams.quote_post_id = params.quote_post_id;
  if (params.poll_attachment) {
    queryParams.poll_attachment =
      typeof params.poll_attachment === "string"
        ? params.poll_attachment
        : JSON.stringify(params.poll_attachment);
  }
  if (params.auto_publish_text !== undefined) {
    queryParams.auto_publish_text = String(params.auto_publish_text);
  }
  if (params.topic_tag) queryParams.topic_tag = params.topic_tag;
  if (params.is_spoiler_media !== undefined) {
    queryParams.is_spoiler_media = String(params.is_spoiler_media);
  }
  if (params.is_ghost_post !== undefined) {
    queryParams.is_ghost_post = String(params.is_ghost_post);
  }
  if (params.enable_reply_approvals !== undefined) {
    queryParams.enable_reply_approvals = String(params.enable_reply_approvals);
  }
  if (params.crossreshare_to_ig !== undefined) {
    queryParams.crossreshare_to_ig = String(params.crossreshare_to_ig);
  }
  if (params.crossreshare_to_ig_dark_mode !== undefined) {
    queryParams.crossreshare_to_ig_dark_mode = String(
      params.crossreshare_to_ig_dark_mode,
    );
  }
  if (params.location_id) queryParams.location_id = params.location_id;

  return await threadsPost<{ id: string }>(`${userId}/threads`, {
    accessToken,
    params: queryParams,
  });
}

export type ThreadsContainerStatusVerdict =
  | "FINISHED"
  | "IN_PROGRESS"
  | "ERROR"
  | "EXPIRED"
  | "PUBLISHED"
  | "UNKNOWN";

export interface ThreadsContainerStatusResponse {
  id: string;
  status: ThreadsContainerStatusVerdict;
  rawStatus?: string;
  errorMessage?: string;
}

export function parseThreadsContainerStatus(
  status?: string,
): ThreadsContainerStatusVerdict {
  if (!status) return "UNKNOWN";
  const upper = status.trim().toUpperCase();
  if (upper === "FINISHED") return "FINISHED";
  if (upper === "IN_PROGRESS") return "IN_PROGRESS";
  if (upper === "ERROR") return "ERROR";
  if (upper === "EXPIRED") return "EXPIRED";
  if (upper === "PUBLISHED") return "PUBLISHED";
  return "UNKNOWN";
}

/**
 * Čita status obrade kontejnera (§4.1).
 * GET /{container-id}?fields=status,error_message
 *
 * Vraća razdvojena stanja: FINISHED / IN_PROGRESS / ERROR / EXPIRED / PUBLISHED / UNKNOWN.
 * error_message se sanitizuje i prenosi netaknut.
 */
export async function getThreadsContainerStatus({
  accessToken,
  containerId,
}: {
  accessToken: string;
  containerId: string;
}): Promise<ThreadsContainerStatusResponse> {
  const raw = await threadsGet<{
    id: string;
    status?: string;
    error_message?: string;
  }>(containerId, {
    accessToken,
    params: {
      fields: "status,error_message",
    },
  });

  const parsedStatus = parseThreadsContainerStatus(raw.status);
  return {
    id: raw.id,
    status: parsedStatus,
    rawStatus: raw.status,
    errorMessage: raw.error_message
      ? sanitizeThreadsError(raw.error_message)
      : undefined,
  };
}

/**
 * Objavljuje kreirani kontejner na Threads-u (§4.1).
 * POST /{user-id}/threads_publish
 */
export async function publishThreadsContainer({
  accessToken,
  userId,
  creationId,
}: {
  accessToken: string;
  userId: string;
  creationId: string;
}): Promise<{ id: string }> {
  return await threadsPost<{ id: string }>(`${userId}/threads_publish`, {
    accessToken,
    params: {
      creation_id: creationId,
    },
  });
}

/**
 * Kreira repost postojeće objave (§4.4).
 * POST /{media-id}/repost
 */
export async function repostThreadsPost({
  accessToken,
  mediaId,
}: {
  accessToken: string;
  mediaId: string;
}): Promise<{ id?: string; media_type?: string }> {
  return await threadsPost<{ id?: string; media_type?: string }>(
    `${mediaId}/repost`,
    {
      accessToken,
    },
  );
}

/**
 * Briše objavu na Threads-u (§4.4).
 * DELETE /{media-id}
 */
export async function deleteThreadsPost({
  accessToken,
  mediaId,
}: {
  accessToken: string;
  mediaId: string;
}): Promise<{ success: boolean; deleted_id?: string }> {
  return await threadsDelete<{ success: boolean; deleted_id?: string }>(
    mediaId,
    {
      accessToken,
    },
  );
}

export const THREADS_MENTION_FIELDS =
  "id,text,username,permalink,timestamp,media_type,media_url,shortcode,owner{id}";

export const THREADS_MIN_MENTIONS_SINCE = 1688540400; // Threads launch epoch timestamp (5. jul 2023, §6)

export interface RawThreadsMentionItem {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string | number;
  media_type?: string;
  media_url?: string;
  shortcode?: string;
  owner?: { id?: string };
}

export interface RawThreadsMentionsResponse {
  data?: RawThreadsMentionItem[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
}

/**
 * Čita javna spominjanja (mentions) našeg Threads naloga (§6).
 * GET /{user-id}/mentions
 *
 * VAŽNO (§6):
 *   - Koristi eksplicitni `{user-id}`, NIKADA `/me/mentions`.
 *   - `since` mora biti ≥ 1688540400 (datum lansiranja Threads-a).
 *   - Privatni nalozi se nikada ne vraćaju — to nije greška i ne sme se prijaviti kao greška.
 */
export async function getThreadsMentions({
  accessToken,
  userId,
  since,
  after,
  limit = 50,
  fields = THREADS_MENTION_FIELDS,
}: {
  accessToken: string;
  userId: string;
  since?: number;
  after?: string;
  limit?: number;
  fields?: string;
}): Promise<RawThreadsMentionsResponse> {
  const effectiveSince =
    since !== undefined
      ? Math.max(since, THREADS_MIN_MENTIONS_SINCE)
      : THREADS_MIN_MENTIONS_SINCE;

  const params: Record<string, string> = {
    fields,
    since: String(effectiveSince),
    limit: String(limit),
  };
  if (after) params.after = after;

  return await threadsGet<RawThreadsMentionsResponse>(`${userId}/mentions`, {
    accessToken,
    params,
  });
}

// ── Keyword Search & Profile Lookup (§6) ────────────────────────────────────

export const THREADS_KEYWORD_SEARCH_FIELDS =
  "id,text,permalink,timestamp,media_type,media_url,shortcode,username";

export interface RawThreadsKeywordSearchItem {
  id: string;
  text?: string;
  username?: string;
  permalink?: string;
  timestamp?: string | number;
  media_type?: string;
  media_url?: string;
  shortcode?: string;
}

export interface RawThreadsKeywordSearchResponse {
  data?: RawThreadsKeywordSearchItem[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
  };
}

/**
 * Pretraga javnog sadržaja po ključnoj reči (§6).
 * GET /keyword_search
 *
 * VAŽNO (§2.1, §6):
 *   - `q` je obavezno.
 *   - `limit` je default 25, max 100.
 *   - Polje `owner` se NE VRAĆA — ne traži ga i ne pretvaraj se da postoji.
 *   - Bez App Review-a pretražuje SAMO sopstvene objave naloga.
 *   - Pri neočekivanom obliku koristi se `describeThreadsShape(raw)`, NIKADA `JSON.stringify(raw)`,
 *     jer telo odgovora nosi tuđi username i text.
 */
export async function searchThreadsKeyword({
  accessToken,
  q,
  searchType,
  searchMode,
  mediaType,
  authorUsername,
  since,
  until,
  limit = 25,
  fields = THREADS_KEYWORD_SEARCH_FIELDS,
}: {
  accessToken: string;
  q: string;
  searchType?: "TOP" | "RECENT";
  searchMode?: "KEYWORD" | "TAG";
  mediaType?: string;
  authorUsername?: string;
  since?: number;
  until?: number;
  limit?: number;
  fields?: string;
}): Promise<RawThreadsKeywordSearchResponse> {
  const trimmedQ = q.trim();
  if (!trimmedQ) {
    throw new Error("Parametar 'q' (ključna reč) je obavezan za pretragu.");
  }

  const effectiveLimit = Math.min(Math.max(1, limit), 100);

  const params: Record<string, string> = {
    q: trimmedQ,
    fields,
    limit: String(effectiveLimit),
  };

  if (searchType) params.search_type = searchType;
  if (searchMode) params.search_mode = searchMode;
  if (mediaType) params.media_type = mediaType;
  if (authorUsername) {
    const cleanAuthor = authorUsername.replace(/^@/, "").trim();
    if (cleanAuthor) params.author_username = cleanAuthor;
  }
  if (since !== undefined) params.since = String(since);
  if (until !== undefined) params.until = String(until);

  const raw = await threadsGet<unknown>("keyword_search", {
    accessToken,
    params,
  });

  if (
    typeof raw !== "object" ||
    raw === null ||
    !("data" in raw) ||
    !Array.isArray((raw as { data: unknown }).data)
  ) {
    throw new Error(
      `[Threads API] Endpoint keyword_search vratio je neočekivan/nedokazan oblik odgovora. Pročitan oblik: ${describeThreadsShape(raw)}`,
    );
  }

  return raw as RawThreadsKeywordSearchResponse;
}

export const THREADS_PROFILE_LOOKUP_FIELDS =
  "follower_count,likes_count,quotes_count,reposts_count,views_count,is_verified";

export interface RawThreadsProfileLookupResponse {
  id?: string;
  username?: string;
  follower_count?: number;
  likes_count?: number;
  quotes_count?: number;
  reposts_count?: number;
  views_count?: number;
  is_verified?: boolean;
}

/**
 * Otkrivanje / lookup javnog profila (§6).
 * GET /profile_lookup?username=...
 *
 * VAŽNO (§6):
 *   - Samo javni profili, 18+, minimum 100 pratilaca.
 *   - 1.000 zahteva / 24h.
 *   - Vraća follower_count, likes_count, quotes_count, reposts_count, views_count, is_verified.
 *   - Pri neočekivanom obliku koristi se `describeThreadsShape(raw)`, NIKADA `JSON.stringify(raw)`.
 */
export async function lookupThreadsProfile({
  accessToken,
  username,
  fields = THREADS_PROFILE_LOOKUP_FIELDS,
}: {
  accessToken: string;
  username: string;
  fields?: string;
}): Promise<RawThreadsProfileLookupResponse> {
  const cleanUsername = username.replace(/^@/, "").trim();
  if (!cleanUsername) {
    throw new Error("Korisničko ime je obavezno za lookup profila.");
  }

  const raw = await threadsGet<unknown>("profile_lookup", {
    accessToken,
    params: {
      username: cleanUsername,
      fields,
    },
  });

  if (typeof raw !== "object" || raw === null) {
    throw new Error(
      `[Threads API] Endpoint profile_lookup vratio je neočekivan oblik odgovora. Pročitan oblik: ${describeThreadsShape(raw)}`,
    );
  }

  return raw as RawThreadsProfileLookupResponse;
}

