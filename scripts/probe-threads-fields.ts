/**
 * ============================================================================
 * EMPIRIJSKA PROVERA POLJA THREADS API-JA (graph.threads.com/v1.0)
 * ============================================================================
 *
 * Svrha:
 *   Samostalni skript koji empirijski razrešava 7 spornih tačaka iz odeljka 11
 *   (linije 455–476 u threads-api-istrazivanje.md) PRE nego što se napiše
 *   ijedna linija sync koda.
 *
 * Ključno pravilo:
 *   Za SVAKO kandidat-polje šalje se ZASEBAN GET sa samo tim poljem (+ id),
 *   jer jedno nepostojeće polje obara ceo upit. Ishod se beleži u tri stanja:
 *   POSTOJI | NEODLUČENO | NE POSTOJI, sa tačnom porukom greške ili sample-om.
 *
 * Režimi rada:
 *   - `--read-only` (podrazumevani):
 *       Čita GET /me/threads, pa za postojeće objave testira sva kandidat-polja.
 *       Pokretanje:
 *         node --import ./scripts/ts-hooks.mjs scripts/probe-threads-fields.ts
 *         (ili: npx tsx scripts/probe-threads-fields.ts)
 *
 *   - `--publish`:
 *       Pre čitanja proverava kvotu (/me/threads_publishing_limit) i objavljuje
 *       test objave kako bi svi tipovi bili pokriveni:
 *       TEXT (ghost i običan), link, quote, reply, poll, repost, IMAGE, VIDEO, CAROUSEL.
 *       Pokretanje:
 *         npx tsx scripts/probe-threads-fields.ts --publish
 *
 *   - `--cleanup <id> [<id>...]`:
 *       Briše navedene objave preko DELETE /{media-id}.
 *       Pokretanje:
 *         npx tsx scripts/probe-threads-fields.ts --cleanup 12345 67890
 *
 * Bezbednost tokena:
 *   Token se čita iz process.env.THREADS_PROBE_TOKEN.
 *   Token se NIKADA ne ispisuje u konzolu, ne loguje i ne šalje u query stringu.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

// ── 1. Konfiguracija i validacija tokena i medija ─────────────────────────────

function resolveToken(): string {
  const envToken = process.env.THREADS_PROBE_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const tokenFilePath = path.resolve(process.cwd(), ".threads-probe-token");
  if (fs.existsSync(tokenFilePath)) {
    try {
      const fileContent = fs.readFileSync(tokenFilePath, "utf-8").trim();
      if (fileContent) {
        return fileContent;
      }
    } catch {
      // Ignorišemo grešku pri čitanju fajla i nastavljamo do greške
    }
  }

  console.error("================================================================================");
  console.error("GRESKA: Threads probe token nije pronađen.");
  console.error("================================================================================");
  console.error("Nije postavljena promenljiva THREADS_PROBE_TOKEN niti postoji fajl .threads-probe-token.");
  console.error("Pribavite token pokretanjem:");
  console.error("  npx tsx scripts/threads-get-token.ts url");
  console.error("================================================================================");
  process.exit(1);
}

const TOKEN = resolveToken();
const IMAGE_URL = process.env.THREADS_PROBE_IMAGE_URL?.trim();
const VIDEO_URL = process.env.THREADS_PROBE_VIDEO_URL?.trim();


// Bazni URL prema odeljku 3.1 (linije 110–118)
const GRAPH_BASE_URL = "https://graph.threads.com/v1.0";

// ── 2. Lista svih kandidat-polja (odeljci 5.1, 5.2 i 11) ──────────────────────

export const CANDIDATE_FIELDS = [
  "id",
  "media_product_type",
  "media_type",
  "media_url",
  "permalink",
  "owner",
  "username",
  "text",
  "timestamp",
  "shortcode",
  "thumbnail_url",
  "children",
  "is_quote_post",
  "alt_text",
  "link_attachment_url",
  "url_attached",
  "quoted_post",
  "quoted_post_id",
  "reposted_post",
  "reposted_media_id",
  "poll_attachment",
  "location",
  "location_id",
  "topic_tag",
  "gif_attachment",
  "has_replies",
  "root_post",
  "replied_to",
  "is_reply",
  "is_reply_owned_by_me",
  "hide_status",
  "reply_audience",
] as const;

export type CandidateField = (typeof CANDIDATE_FIELDS)[number];

// ── 3. Pomoćne funkcije za bezbedan mrežni rad ───────────────────────────────

function sanitizeUrl(urlString: string): string {
  try {
    const parsed = new URL(urlString);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return urlString.split("?")[0] || urlString;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ApiErrorResponse {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiErrorResponse;
}

/**
 * Šalje HTTP zahtev ka Threads Graph API-ju.
 * Token se prosleđuje ISKLJUČIVO kroz Authorization: Bearer header.
 */
async function graphRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    queryParams?: Record<string, string | number | boolean | undefined>;
    bodyParams?: Record<string, string | number | boolean | undefined>;
  } = {}
): Promise<ApiResult<T>> {
  const method = options.method || "GET";
  const url = new URL(`${GRAPH_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);

  if (options.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json",
  };

  let body: string | undefined;
  if (method === "POST" && options.bodyParams) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    const bodySearchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.bodyParams)) {
      if (value !== undefined) {
        bodySearchParams.set(key, String(value));
      }
    }
    body = bodySearchParams.toString();
  }

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body,
    });

    const resJson = (await res.json().catch(() => null)) as Record<string, unknown> | null;

    if (res.ok && resJson) {
      return {
        ok: true,
        status: res.status,
        data: resJson as T,
      };
    }

    const errObj =
      resJson && typeof resJson === "object" && "error" in resJson
        ? (resJson.error as ApiErrorResponse)
        : { message: `HTTP ${res.status}: ${res.statusText || "Nepoznata greška"}` };

    return {
      ok: false,
      status: res.status,
      error: errObj,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      error: { message: `Mrežna greška: ${msg}` },
    };
  }
}

// ── 3b. Threads user ID ───────────────────────────────────────────────────────
//
// `/me` alias radi na većini Threads endpointa, ALI NE i na
// `threads_publishing_limit` — tamo vraća HTTP 500 Internal Server Error.
// Empirijski provereno 24.08.2026: `/me/threads_publishing_limit` -> 500,
// `/{threads-user-id}/threads_publishing_limit` -> 200.
// Zato ID rešavamo jednom i koristimo ga svuda umesto aliasa.

let cachedUserId: string | null = null;

async function getThreadsUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  const res = await graphRequest<{ id?: string; username?: string }>("/me", {
    queryParams: { fields: "id,username" },
  });

  if (!res.ok || !res.data?.id) {
    throw new Error(
      `Nije moguće pročitati Threads user ID (GET /me): ${res.error?.message || `HTTP ${res.status}`}`,
    );
  }

  cachedUserId = res.data.id;
  console.log(`Threads nalog: @${res.data.username ?? "nepoznat"} (ID: ${cachedUserId})`);
  return cachedUserId;
}

// ── 4. Provera kvote (Odeljak 8, linije 332–358) ──────────────────────────────

interface PublishingLimitResponse {
  data?: Array<{
    quota_usage?: number;
    config?: {
      quota_total?: number;
      quota_duration?: number;
    };
    reply_quota_usage?: number;
    reply_config?: {
      quota_total?: number;
      quota_duration?: number;
    };
    delete_quota_usage?: number;
    delete_config?: {
      quota_total?: number;
      quota_duration?: number;
    };
    location_search_quota_usage?: number;
    location_search_config?: {
      quota_total?: number;
      quota_duration?: number;
    };
  }>;
}

async function checkAndAssertPublishingQuota(): Promise<void> {
  const userId = await getThreadsUserId();

  console.log(`\nProveravam kvotu objavljivanja (GET /${userId}/threads_publishing_limit)...`);

  // Empirijski provereno 24.08.2026: ako se u `fields` pošalje svih osam polja,
  // Meta vraća HTTP 500 bez ijednog detalja. Sa četiri polja vraća 200.
  // Zato se OBAVEZNA polja traže sama, a opciona se dodaju u zasebnim pozivima —
  // jedno nepostojeće opciono polje ne sme da obori čitanje kvote.
  const REQUIRED_FIELDS = "quota_usage,config,reply_quota_usage,reply_config";
  const OPTIONAL_FIELD_GROUPS = [
    "delete_quota_usage,delete_config",
    "location_search_quota_usage,location_search_config",
  ];

  const res = await graphRequest<PublishingLimitResponse>(
    `/${userId}/threads_publishing_limit`,
    { queryParams: { fields: REQUIRED_FIELDS } },
  );

  if (!res.ok || !res.data) {
    console.error("================================================================================");
    console.error(`GRESKA: Nije moguće pročitati kvotu objavljivanja: ${res.error?.message || "Nepoznata greška"}`);
    console.error("Nepoznata kvota nije dozvola da se objavljuje. Prekidam rad.");
    console.error("================================================================================");
    process.exitCode = 1;
    throw new Error("Kvota nije pročitana.");
  }

  const item = res.data.data?.[0];
  if (!item) {
    console.error("GRESKA: Odgovor o kvoti je prazan. Prekidam rad.");
    process.exitCode = 1;
    throw new Error("Kvota nije pročitana.");
  }

  const postUsage = item.quota_usage;
  const postTotal = item.config?.quota_total;
  const replyUsage = item.reply_quota_usage;
  const replyTotal = item.reply_config?.quota_total;

  const show = (u?: number, t?: number) =>
    u === undefined || t === undefined ? "nepoznato" : `${u} / ${t}`;

  console.log(`  - Objave:   ${show(postUsage, postTotal)}`);
  console.log(`  - Odgovori: ${show(replyUsage, replyTotal)}`);

  // Opciona polja: svako u zasebnom pozivu, ishod se prijavljuje ali ne prekida rad.
  for (const group of OPTIONAL_FIELD_GROUPS) {
    const optRes = await graphRequest<PublishingLimitResponse>(
      `/${userId}/threads_publishing_limit`,
      { queryParams: { fields: group } },
    );
    if (optRes.ok) {
      const optItem = optRes.data?.data?.[0] as Record<string, unknown> | undefined;
      console.log(`  - [${group}] OK: ${optItem ? JSON.stringify(optItem) : "prazno"}`);
    } else {
      console.log(`  - [${group}] NE RADI: ${optRes.error?.message || `HTTP ${optRes.status}`}`);
    }
  }

  if (postUsage === undefined || postTotal === undefined) {
    console.error("\nGRESKA: Kvota za objave nije stigla u odgovoru. Prekidam rad.");
    process.exitCode = 1;
    throw new Error("Kvota za objave je nepoznata.");
  }

  if (postUsage >= postTotal) {
    console.error(`\nGRESKA: Kvota za objave je POTROŠENA (${postUsage}/${postTotal}). Prekidam rad.`);
    process.exitCode = 1;
    throw new Error("Kvota potrošena.");
  }
}

// ── 5. Tok objavljivanja sa čekanjem i statusom (Odeljak 4.1 i 4.2) ───────────

interface ContainerCreateResponse {
  id: string;
}

interface ContainerStatusResponse {
  id: string;
  status: "EXPIRED" | "ERROR" | "FINISHED" | "IN_PROGRESS" | "PUBLISHED";
  error_message?: string;
}

interface PublishResponse {
  id: string;
}

async function createAndPublishPost(params: {
  media_type: "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";
  text?: string;
  is_ghost_post?: boolean;
  link_attachment?: string;
  poll_attachment?: string;
  quote_post_id?: string;
  reply_to_id?: string;
  topic_tag?: string;
  image_url?: string;
  video_url?: string;
  children?: string;
  is_carousel_item?: boolean;
  enable_reply_approvals?: boolean;
}): Promise<string> {
  console.log(`\nKreiram container: media_type=${params.media_type}, ghost=${Boolean(params.is_ghost_post)}...`);

  const createRes = await graphRequest<ContainerCreateResponse>(`/${await getThreadsUserId()}/threads`, {
    method: "POST",
    bodyParams: {
      media_type: params.media_type,
      text: params.text,
      is_ghost_post: params.is_ghost_post !== undefined ? params.is_ghost_post : undefined,
      link_attachment: params.link_attachment,
      poll_attachment: params.poll_attachment,
      quote_post_id: params.quote_post_id,
      reply_to_id: params.reply_to_id,
      topic_tag: params.topic_tag,
      image_url: params.image_url,
      video_url: params.video_url,
      children: params.children,
      is_carousel_item: params.is_carousel_item !== undefined ? params.is_carousel_item : undefined,
      enable_reply_approvals: params.enable_reply_approvals !== undefined ? params.enable_reply_approvals : undefined,
    },
  });

  if (!createRes.ok || !createRes.data?.id) {
    throw new Error(`Greška pri kreiranju containera: ${createRes.error?.message || "Nepoznata greška"}`);
  }

  const containerId = createRes.data.id;
  console.log(`Container kreiran [ID: ${containerId}].`);

  // Odeljak 4.1: Preporučeno čekanje 30 sekundi pre objavljivanja
  console.log("Čekam 30 sekundi (prema specifikaciji u odeljku 4.1)...");
  await sleep(30_000);

  // Provera statusa containera (najviše 1 u minutu, max 5 minuta)
  let attempts = 0;
  const maxAttempts = 5;
  let isReady = false;

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`Proveravam status containera ${containerId} (pokušaj ${attempts}/${maxAttempts})...`);
    const statusRes = await graphRequest<ContainerStatusResponse>(`/${containerId}`, {
      queryParams: { fields: "status,error_message" },
    });

    if (!statusRes.ok || !statusRes.data) {
      console.warn(`Neuspešna provera statusa containera: ${statusRes.error?.message}`);
    } else {
      const { status, error_message } = statusRes.data;
      console.log(`Status containera: ${status}`);

      if (status === "FINISHED") {
        isReady = true;
        break;
      }
      if (status === "PUBLISHED") {
        return containerId;
      }
      if (status === "ERROR" || status === "EXPIRED") {
        throw new Error(`Container je u neuspešnom stanju (${status}): ${error_message || "nema detalja"}`);
      }
    }

    if (attempts < maxAttempts) {
      console.log("Container još nije FINISHED. Čekam 60 sekundi pre sledeće provere...");
      await sleep(60_000);
    }
  }

  if (!isReady) {
    throw new Error(`Container ${containerId} nije stigao u FINISHED stanje nakon 5 minuta.`);
  }

  // Objavljivanje
  console.log(`Objavljujem container ${containerId} (POST /me/threads_publish)...`);
  const pubRes = await graphRequest<PublishResponse>(`/${await getThreadsUserId()}/threads_publish`, {
    method: "POST",
    bodyParams: { creation_id: containerId },
  });

  if (!pubRes.ok || !pubRes.data?.id) {
    throw new Error(`Greška pri objavljivanju containera: ${pubRes.error?.message || "Nepoznata greška"}`);
  }

  console.log(`Objava uspešno objavljena [Media ID: ${pubRes.data.id}].`);
  return pubRes.data.id;
}

// ── 6. Brisanje objava (--cleanup) ───────────────────────────────────────────

async function handleCleanup(ids: string[]): Promise<void> {
  console.log("\n================================================================================");
  console.log(`POKREĆEM BRISANJE ${ids.length} OBJAVA (DELETE /{media-id})`);
  console.log("================================================================================");

  for (const id of ids) {
    console.log(`Brišem objavu [ID: ${id}]...`);
    const res = await graphRequest<{ success: boolean }>(`/${id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      console.log(`  -> [OK] Objava ${id} uspešno obrisana.`);
    } else {
      console.error(`  -> [GRESKA] Brisanje objave ${id} nije uspelo: ${res.error?.message}`);
    }
  }

  console.log("================================================================================\n");
}

// ── 7. Pojedinačna provera polja (KLJUČNO PRAVILO: TRI STANJA) ──────────────

export type FieldOutcome = "POSTOJI" | "NEODLUCENO" | "NE_POSTOJI";

export interface FieldProbeResult {
  field: string;
  outcome: FieldOutcome;
  reason?: string;
  sample?: string;
}

/**
 * Šalje ZASEBAN GET sa samo zadatim poljem (+ id).
 * Ishod se kategorizuje u tri stanja (Dodatak A.3, linije 576–597):
 *   - "POSTOJI": HTTP 200 i ključ je prisutan u odgovoru (čak i ako je vrednost null).
 *   - "NEODLUCENO": HTTP 200 ali ključa nema u odgovoru (API je tiho ignorisao polje).
 *   - "NE_POSTOJI": HTTP greška sa tačnom porukom.
 */
async function probeSingleField(postId: string, field: string): Promise<FieldProbeResult> {
  const res = await graphRequest<Record<string, unknown>>(`/${postId}`, {
    queryParams: { fields: `id,${field}` },
  });

  if (res.ok && res.data) {
    if (Object.prototype.hasOwnProperty.call(res.data, field) || field in res.data) {
      const rawVal = res.data[field];
      let sampleStr = "";
      if (rawVal === undefined || rawVal === null) {
        sampleStr = "null";
      } else if (typeof rawVal === "object") {
        sampleStr = JSON.stringify(rawVal);
      } else {
        sampleStr = String(rawVal);
      }
      return { field, outcome: "POSTOJI", sample: sampleStr };
    }

    return {
      field,
      outcome: "NEODLUCENO",
      reason: "HTTP 200, ključ izostavljen iz odgovora (tiho ignorisano)",
    };
  }

  const exactMessage = res.error?.message || `HTTP ${res.status}`;

  // Ako Meta vrati da polje zahteva podpolja (npr. "Field quoted_post must specify subfields"),
  // to znači da polje POSTOJI na tipu kao objekat!
  if (exactMessage.toLowerCase().includes("must specify subfields")) {
    const subRes = await graphRequest<Record<string, unknown>>(`/${postId}`, {
      queryParams: { fields: `id,${field}{id}` },
    });
    if (subRes.ok && subRes.data && (Object.prototype.hasOwnProperty.call(subRes.data, field) || field in subRes.data)) {
      const subVal = subRes.data[field];
      return {
        field,
        outcome: "POSTOJI",
        sample: `Objekat sa podpoljima: ${subVal !== undefined ? JSON.stringify(subVal) : "null"}`,
      };
    }
    if (subRes.ok) {
      return {
        field,
        outcome: "POSTOJI",
        sample: "Objekat sa podpoljima ({id})",
      };
    }
  }

  return {
    field,
    outcome: "NE_POSTOJI",
    reason: exactMessage,
  };
}

function formatOutcomeDisplay(outcome: FieldOutcome): string {
  switch (outcome) {
    case "POSTOJI":
      return "POSTOJI";
    case "NEODLUCENO":
      return "NEODLUČENO";
    case "NE_POSTOJI":
      return "NE POSTOJI";
  }
}

// ── 8. Pomoćne provere za reply approvals ────────────────────────────────────

async function probeEndpoint(path: string): Promise<{ ok: boolean; message: string }> {
  const res = await graphRequest(path);
  if (res.ok) {
    return { ok: true, message: `Endpoint ${path} je aktivan i vraća 200 OK` };
  }
  return { ok: false, message: res.error?.message || `HTTP ${res.status}` };
}

// ── 9. Glavni tok ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Provera za --cleanup
  const cleanupIndex = args.indexOf("--cleanup");
  if (cleanupIndex !== -1) {
    const targetIds = args.slice(cleanupIndex + 1).filter((arg) => !arg.startsWith("--"));
    if (targetIds.length === 0) {
      console.error("GRESKA: --cleanup zahteva bar jedan ID objave. Primer: --cleanup 12345678");
      process.exit(1);
    }
    await handleCleanup(targetIds);
    return;
  }

  const isPublishMode = args.includes("--publish");
  console.log("================================================================================");
  console.log("THREADS API PROBE SKRIPT — EMPIRIJSKA PROVERA POLJA I RAZREŠENJE SPORNIH TAČAKA");
  console.log(`Režim: ${isPublishMode ? "PUBLISH (kreiranje test objava + čitanje)" : "READ-ONLY (čitanje postojećih objava)"}`);
  console.log(`Bazni URL: ${GRAPH_BASE_URL}`);
  console.log("================================================================================");

  const nonGhostIdsToCleanup: string[] = [];
  const testPostIds: string[] = [];
  const skippedTypes: string[] = [];
  let replyApprovalsPostId: string | null = null;

  // Ako je uključen --publish režim, proveravamo kvotu i objavljujemo test objave
  if (isPublishMode) {
    await checkAndAssertPublishingQuota();

    try {
      // 1. Tekstualna objava (OBAVEZNO is_ghost_post=true)
      console.log("\n--- Kreiram testnu tekstualnu objavu (is_ghost_post=true) ---");
      try {
        const ghostPostId = await createAndPublishPost({
          media_type: "TEXT",
          text: `[PROBE TEST] Tekstualna ghost objava (${new Date().toISOString()})`,
          is_ghost_post: true,
          topic_tag: "probetest",
        });
        testPostIds.push(ghostPostId);
      } catch (err: unknown) {
        console.warn(`[INFO] Ghost tekstualna objava nije uspela: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 2. Tekstualna objava sa linkom (is_ghost_post=true)
      console.log("\n--- Kreiram testnu objavu sa linkom (is_ghost_post=true) ---");
      try {
        const linkPostId = await createAndPublishPost({
          media_type: "TEXT",
          text: `[PROBE TEST] Link attachment proba (${new Date().toISOString()})`,
          link_attachment: "https://example.com",
          is_ghost_post: true,
        });
        testPostIds.push(linkPostId);
      } catch (err: unknown) {
        console.warn(`[INFO] Ghost link objava nije uspela: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 3. Bazna OBIČNA objava (prema A.4, quote i reply se prave nad običnom objavom, nikad nad ghost)
      console.log("\n--- Kreiram baznu OBIČNU tekstualnu objavu (za quote, reply, repost) ---");
      let baseOrdinaryPostId: string | null = null;
      try {
        baseOrdinaryPostId = await createAndPublishPost({
          media_type: "TEXT",
          text: `[PROBE TEST] Bazna obična objava za quote/reply/repost (${new Date().toISOString()})`,
          is_ghost_post: false,
        });
        testPostIds.push(baseOrdinaryPostId);
        nonGhostIdsToCleanup.push(baseOrdinaryPostId);
      } catch (err: unknown) {
        console.warn(`[INFO] Bazna obična objava nije uspela: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 4. Citirana objava (Quote nad običnom objavom)
      if (baseOrdinaryPostId) {
        console.log("\n--- Kreiram testnu citiranu objavu (Quote nad običnom objavom) ---");
        try {
          const quotePostId = await createAndPublishPost({
            media_type: "TEXT",
            text: `[PROBE TEST] Quote proba (${new Date().toISOString()})`,
            quote_post_id: baseOrdinaryPostId,
            is_ghost_post: false,
          });
          testPostIds.push(quotePostId);
          nonGhostIdsToCleanup.push(quotePostId);
        } catch (err: unknown) {
          console.warn(`[INFO] Quote post nije uspeo: ${err instanceof Error ? err.message : String(err)}`);
        }

        // 5. Odgovor (Reply nad običnom objavom)
        console.log("\n--- Kreiram testni odgovor (Reply nad običnom objavom) ---");
        try {
          const replyPostId = await createAndPublishPost({
            media_type: "TEXT",
            text: `[PROBE TEST] Reply proba na običan post (${new Date().toISOString()})`,
            reply_to_id: baseOrdinaryPostId,
            is_ghost_post: false,
          });
          testPostIds.push(replyPostId);
          nonGhostIdsToCleanup.push(replyPostId);
        } catch (err: unknown) {
          console.warn(`[INFO] Reply post nije uspeo: ${err instanceof Error ? err.message : String(err)}`);
        }

        // 6. Repost (POST /{media-id}/repost nad običnom objavom)
        console.log("\n--- Kreiram testni repost (POST /{media-id}/repost) ---");
        try {
          const repostRes = await graphRequest<{ id: string }>(`/${baseOrdinaryPostId}/repost`, {
            method: "POST",
          });
          if (repostRes.ok && repostRes.data?.id) {
            const repostId = repostRes.data.id;
            console.log(`Repost uspešno kreiran [ID: ${repostId}].`);
            testPostIds.push(repostId);
            nonGhostIdsToCleanup.push(repostId);
          } else {
            console.warn(`[INFO] Repost nije uspeo: ${repostRes.error?.message || "Nepoznata greška"}`);
          }
        } catch (err: unknown) {
          console.warn(`[INFO] Repost nije uspeo: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.warn("[INFO] Quote, Reply i Repost preskočeni jer bazna obična objava nije kreirana.");
      }

      // 7. Objava sa enable_reply_approvals=true (Dodatak A.2)
      console.log("\n--- Kreiram testnu objavu sa enable_reply_approvals=true ---");
      try {
        const approvalsPostId = await createAndPublishPost({
          media_type: "TEXT",
          text: `[PROBE TEST] Objava sa reply approvals (${new Date().toISOString()})`,
          enable_reply_approvals: true,
          is_ghost_post: false,
        });
        testPostIds.push(approvalsPostId);
        nonGhostIdsToCleanup.push(approvalsPostId);
        replyApprovalsPostId = approvalsPostId;
      } catch (err: unknown) {
        console.warn(`[INFO] Objava sa enable_reply_approvals nije uspela: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 8. Anketa (Poll) - Dodatak A.1: opcije option_a i option_b, a tekst objave je pitanje
      console.log("\n--- Kreiram testnu anketu (Poll sa option_a i option_b) ---");
      try {
        const pollPostId = await createAndPublishPost({
          media_type: "TEXT",
          text: "[PROBE TEST] Da li probe radi?",
          poll_attachment: JSON.stringify({
            option_a: "Da",
            option_b: "Ne",
          }),
          is_ghost_post: false,
        });
        testPostIds.push(pollPostId);
        nonGhostIdsToCleanup.push(pollPostId);
      } catch (err: unknown) {
        console.warn(`[INFO] Poll post nije uspeo: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 9. IMAGE objava (Dodatak A.4)
      if (IMAGE_URL) {
        console.log("\n--- Kreiram testnu IMAGE objavu ---");
        try {
          const imagePostId = await createAndPublishPost({
            media_type: "IMAGE",
            text: `[PROBE TEST] Image objava (${new Date().toISOString()})`,
            image_url: IMAGE_URL,
            is_ghost_post: false,
          });
          testPostIds.push(imagePostId);
          nonGhostIdsToCleanup.push(imagePostId);
        } catch (err: unknown) {
          console.warn(`[INFO] IMAGE objava nije uspela: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log("\n[PRESKOČENO] IMAGE objava preskočena (THREADS_PROBE_IMAGE_URL nije postavljen).");
        skippedTypes.push("IMAGE (THREADS_PROBE_IMAGE_URL nije postavljen)");
      }

      // 10. VIDEO objava (Dodatak A.4)
      if (VIDEO_URL) {
        console.log("\n--- Kreiram testnu VIDEO objavu ---");
        try {
          const videoPostId = await createAndPublishPost({
            media_type: "VIDEO",
            text: `[PROBE TEST] Video objava (${new Date().toISOString()})`,
            video_url: VIDEO_URL,
            is_ghost_post: false,
          });
          testPostIds.push(videoPostId);
          nonGhostIdsToCleanup.push(videoPostId);
        } catch (err: unknown) {
          console.warn(`[INFO] VIDEO objava nije uspela: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log("\n[PRESKOČENO] VIDEO objava preskočena (THREADS_PROBE_VIDEO_URL nije postavljen).");
        skippedTypes.push("VIDEO (THREADS_PROBE_VIDEO_URL nije postavljen)");
      }

      // 11. CAROUSEL objava (Dodatak A.4: min 2 deteta)
      const carouselMediaUrl = IMAGE_URL || VIDEO_URL;
      const carouselMediaType = IMAGE_URL ? "IMAGE" : "VIDEO";
      if (carouselMediaUrl) {
        console.log(`\n--- Kreiram testni CAROUSEL (2 deteta, tip: ${carouselMediaType}) ---`);
        try {
          console.log(`Kreiram CAROUSEL child 1 (${carouselMediaType})...`);
          const child1Res = await graphRequest<ContainerCreateResponse>(`/${await getThreadsUserId()}/threads`, {
            method: "POST",
            bodyParams: {
              media_type: carouselMediaType,
              ...(carouselMediaType === "IMAGE" ? { image_url: carouselMediaUrl } : { video_url: carouselMediaUrl }),
              is_carousel_item: true,
            },
          });
          if (!child1Res.ok || !child1Res.data?.id) {
            throw new Error(`Greška pri kreiranju child 1: ${child1Res.error?.message || "Nepoznata greška"}`);
          }
          const child1Id = child1Res.data.id;

          console.log(`Kreiram CAROUSEL child 2 (${carouselMediaType})...`);
          const child2Res = await graphRequest<ContainerCreateResponse>(`/${await getThreadsUserId()}/threads`, {
            method: "POST",
            bodyParams: {
              media_type: carouselMediaType,
              ...(carouselMediaType === "IMAGE" ? { image_url: carouselMediaUrl } : { video_url: carouselMediaUrl }),
              is_carousel_item: true,
            },
          });
          if (!child2Res.ok || !child2Res.data?.id) {
            throw new Error(`Greška pri kreiranju child 2: ${child2Res.error?.message || "Nepoznata greška"}`);
          }
          const child2Id = child2Res.data.id;

          console.log(`Kreiram i objavljujem CAROUSEL parent container [deca: ${child1Id}, ${child2Id}]...`);
          const carouselPostId = await createAndPublishPost({
            media_type: "CAROUSEL",
            children: `${child1Id},${child2Id}`,
            text: `[PROBE TEST] Carousel objava (${new Date().toISOString()})`,
            is_ghost_post: false,
          });
          testPostIds.push(carouselPostId);
          nonGhostIdsToCleanup.push(carouselPostId);
        } catch (err: unknown) {
          console.warn(`[INFO] CAROUSEL objava nije uspela: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.log("\n[PRESKOČENO] CAROUSEL objava preskočena (ni THREADS_PROBE_IMAGE_URL ni THREADS_PROBE_VIDEO_URL nisu postavljeni).");
        skippedTypes.push("CAROUSEL (potreban bar THREADS_PROBE_IMAGE_URL ili THREADS_PROBE_VIDEO_URL)");
      }
    } catch (err: unknown) {
      console.error(`\n[GRESKA] Objavljivanje test objava je prekinuto: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Dobavljanje postojećih objava sa naloga
  console.log("\nDobavljam listu postojećih objava (GET /me/threads)...");
  const threadsListRes = await graphRequest<{ data: Array<{ id: string }> }>(`/${await getThreadsUserId()}/threads`, {
    queryParams: { fields: "id", limit: 30 },
  });

  const availablePostIds = new Set<string>(testPostIds);
  if (threadsListRes.ok && threadsListRes.data?.data) {
    for (const item of threadsListRes.data.data) {
      if (item.id) availablePostIds.add(item.id);
    }
  }

  // Takođe dobavljamo i odgovore ako postoje
  const repliesListRes = await graphRequest<{ data: Array<{ id: string }> }>(`/${await getThreadsUserId()}/replies`, {
    queryParams: { fields: "id", limit: 10 },
  });
  if (repliesListRes.ok && repliesListRes.data?.data) {
    for (const item of repliesListRes.data.data) {
      if (item.id) availablePostIds.add(item.id);
    }
  }

  const postIdsToTest = Array.from(availablePostIds);
  console.log(`Ukupno pronađeno ${postIdsToTest.length} objava/odgovora za testiranje polja.`);

  if (postIdsToTest.length === 0) {
    console.error("\n================================================================================");
    console.error("UPOZORENJE: Na nalogu nema nijedne objave za empirijsko testiranje polja!");
    console.error("Pokrenite skript sa opcijom --publish kako bi se automatski objavili testni postovi:");
    console.error("  npx tsx scripts/probe-threads-fields.ts --publish");
    console.error("================================================================================");
    process.exit(0);
  }

  // ── 10. Kontrolna provera ponašanja API-ja na nepoznato polje (ISPRAVKA 2) ───

  const controlPostId = postIdsToTest[0];
  console.log(`\nIzvršavam kontrolnu proveru na nepoznato polje (GET /${controlPostId}?fields=id,ovo_polje_sigurno_ne_postoji_123)...`);
  const controlRes = await graphRequest<Record<string, unknown>>(`/${controlPostId}`, {
    queryParams: { fields: "id,ovo_polje_sigurno_ne_postoji_123" },
  });

  let controlCheckReport: string;
  if (controlRes.ok) {
    controlCheckReport = "PONAŠANJE API-JA NA NEPOZNATO POLJE: TIHO GUTA (HTTP 200, ključ izostavljen)";
  } else {
    const exactMsg = controlRes.error?.message || `HTTP ${controlRes.status}`;
    controlCheckReport = `PONAŠANJE API-JA NA NEPOZNATO POLJE: GREŠI (${exactMsg})`;
  }

  // ── 11. Testiranje svakog polja pojedinačno (ISPRAVKA 1: TRI STANJA) ─────────

  console.log("\nZapočinjem pojedinačno testiranje svakog kandidat-polja...");

  const fieldOutcomes = new Map<string, FieldProbeResult>();
  const seenMediaTypes = new Set<string>();

  // Prvo pročitamo media_type sa svih objava da prikupimo viđene vrednosti
  for (const postId of postIdsToTest) {
    const mtRes = await graphRequest<{ media_type?: string }>(`/${postId}`, {
      queryParams: { fields: "id,media_type" },
    });
    if (mtRes.ok && mtRes.data?.media_type) {
      seenMediaTypes.add(mtRes.data.media_type);
    }
  }

  // Za svako kandidat-polje prolazimo kroz objave
  for (const field of CANDIDATE_FIELDS) {
    let bestResult: FieldProbeResult | null = null;

    for (const postId of postIdsToTest) {
      const result = await probeSingleField(postId, field);
      if (result.outcome === "POSTOJI") {
        bestResult = result;
        break; // Čim nađemo post gde polje POSTOJI, imamo definitivan dokaz
      }
      if (!bestResult) {
        bestResult = result;
      } else if (bestResult.outcome === "NE_POSTOJI" && result.outcome === "NEODLUCENO") {
        bestResult = result;
      }
    }

    if (bestResult) {
      fieldOutcomes.set(field, bestResult);
    }
  }

  // ── 12. Provera reply approvals (ISPRAVKA 4) ──────────────────────────────────

  let replyApprovalsVerdict: string;
  if (!replyApprovalsPostId) {
    replyApprovalsVerdict = "NEODLUČENO — nije bilo objave sa enable_reply_approvals";
  } else {
    const pendingRepliesCheck = await probeEndpoint(`/${replyApprovalsPostId}/pending_replies`);
    if (pendingRepliesCheck.ok) {
      replyApprovalsVerdict = `POBEDNIK: pending_replies endpoint POSTOJI (${pendingRepliesCheck.message})`;
    } else {
      replyApprovalsVerdict = `PADA: pending_replies endpoint NE POSTOJI (${pendingRepliesCheck.message})`;
    }
  }

  // ── 13. Generisanje izlaza (kopiran-i-nalepljiv za TH2) ──────────────────────

  console.log("\n");
  console.log("========================================================================================================================");
  console.log(controlCheckReport);
  console.log("========================================================================================================================");

  console.log("\n========================================================================================================================");
  console.log("1. TABELA POLJA THREADS API-JA (EMPIRIJSKI PROVERENO)");
  console.log("========================================================================================================================");
  console.log(
    `| ${"Polje".padEnd(24)} | ${"Ishod".padEnd(12)} | ${"Detalji / Sample / Tačna poruka greške".padEnd(75)} |`
  );
  console.log(
    `|${"-".repeat(26)}|${"-".repeat(14)}|${"-".repeat(77)}|`
  );

  for (const field of CANDIDATE_FIELDS) {
    const outcome = fieldOutcomes.get(field);
    const outcomeStr = outcome ? formatOutcomeDisplay(outcome.outcome) : "NE POSTOJI";
    const detailStr =
      outcome?.outcome === "POSTOJI"
        ? `Sample: ${outcome.sample || "null"}`
        : outcome?.outcome === "NEODLUCENO"
          ? (outcome.reason || "HTTP 200, ključ izostavljen iz odgovora")
          : (outcome?.reason || "Greška pri upitu");

    // Skraćivanje za prikaz u tabeli ako je predugačko
    const truncatedDetail = detailStr.length > 73 ? `${detailStr.slice(0, 70)}...` : detailStr;

    console.log(
      `| ${field.padEnd(24)} | ${outcomeStr.padEnd(12)} | ${truncatedDetail.padEnd(75)} |`
    );
  }

  console.log("========================================================================================================================");

  // 2. Lista stvarno viđenih media_type vrednosti
  console.log("\n========================================================================================================================");
  console.log("2. STVARNO VIĐENE `media_type` VREDNOSTI PRI ČITANJU");
  console.log("========================================================================================================================");
  if (seenMediaTypes.size > 0) {
    for (const mt of Array.from(seenMediaTypes)) {
      console.log(`  * ${mt}`);
    }
  } else {
    console.log("  (Nijedna media_type vrednost nije očitana)");
  }
  if (skippedTypes.length > 0) {
    console.log("\n  Napomena o nepokrivenim tipovima u --publish režimu:");
    for (const skipped of skippedTypes) {
      console.log(`  ! Preskočeno: ${skipped}`);
    }
  }
  console.log("========================================================================================================================");

  // 3. Presuda za 7 spornih parova iz odeljka 11 (linije 462–470)
  console.log("\n========================================================================================================================");
  console.log("3. PRESUDA ZA 7 SPORNIH TAČAKA (ODELJAK 11)");
  console.log("========================================================================================================================");

  /**
   * Pravilo iz linija 588–590:
   * Presuda sme da glasi "POBEDNIK: X" SAMO ako je X "POSTOJI", a drugi "NE POSTOJI".
   * U svim ostalim slučajevima ispisuje se "NEODLUČENO — potrebna ručna provera".
   */
  function judgePair(fieldA: string, fieldB: string): string {
    const outcomeA = fieldOutcomes.get(fieldA)?.outcome;
    const outcomeB = fieldOutcomes.get(fieldB)?.outcome;

    if (outcomeA === "POSTOJI" && outcomeB === "NE_POSTOJI") {
      return `POBEDNIK: ${fieldA}`;
    }
    if (outcomeB === "POSTOJI" && outcomeA === "NE_POSTOJI") {
      return `POBEDNIK: ${fieldB}`;
    }
    return "NEODLUČENO — potrebna ručna provera";
  }

  // 1. Polje za link
  const linkVerdict = judgePair("link_attachment_url", "url_attached");
  console.log(`1. Polje za link u pročitanoj objavi (link_attachment_url vs url_attached):`);
  console.log(`   -> ${linkVerdict}`);

  // 2. poll_attachment kao čitljivo polje
  const pollOutcome = fieldOutcomes.get("poll_attachment");
  let pollVerdict = "NEODLUČENO — potrebna ručna provera";
  if (pollOutcome?.outcome === "POSTOJI") {
    pollVerdict = `POBEDNIK: poll_attachment (postoji kao čitljivo polje: ${pollOutcome.sample})`;
  } else if (pollOutcome?.outcome === "NE_POSTOJI") {
    pollVerdict = `PADA: poll_attachment ne postoji kao čitljivo polje (${pollOutcome.reason})`;
  }
  console.log(`2. poll_attachment kao čitljivo polje:`);
  console.log(`   -> ${pollVerdict}`);

  // 3. Citirana objava
  const quoteVerdict = judgePair("quoted_post", "quoted_post_id");
  console.log(`3. Citirana objava (quoted_post vs quoted_post_id):`);
  console.log(`   -> ${quoteVerdict}`);

  // 4. Repostovana objava
  const repostVerdict = judgePair("reposted_post", "reposted_media_id");
  console.log(`4. Repostovana objava (reposted_post vs reposted_media_id):`);
  console.log(`   -> ${repostVerdict}`);

  // 5. media_type vrednosti
  const seenTypesList = Array.from(seenMediaTypes);
  let mediaTypeVerdict = "NEODLUČENO — potrebna ručna provera";
  const isVerA = seenTypesList.some((t) => ["TEXT", "IMAGE", "VIDEO", "CAROUSEL", "REPOST_FACADE"].includes(t));
  const isVerB = seenTypesList.some((t) => ["TEXT_POST", "CAROUSEL_ALBUM", "REPOST", "QUOTE", "AUDIO"].includes(t));
  if (isVerA && !isVerB) {
    mediaTypeVerdict = `POBEDNIK: Verzija A (viđeno: ${seenTypesList.join(", ")})`;
  } else if (!isVerA && isVerB) {
    mediaTypeVerdict = `POBEDNIK: Verzija B (viđeno: ${seenTypesList.join(", ")})`;
  } else if (seenTypesList.length > 0) {
    mediaTypeVerdict = `NEODLUČENO — potrebna ručna provera (viđeno: ${seenTypesList.join(", ")})`;
  } else {
    mediaTypeVerdict = "NEODLUČENO — nijedan media_type nije očitan";
  }
  console.log(`5. media_type vrednosti pri čitanju:`);
  console.log(`   -> ${mediaTypeVerdict}`);

  // 6. Reply approvals endpointi
  console.log(`6. Reply approvals endpointi:`);
  console.log(`   -> ${replyApprovalsVerdict}`);

  // 7. Lokacija (location vs location_id)
  const locationVerdict = judgePair("location", "location_id");
  console.log(`7. Lokacija u pročitanoj objavi (location vs location_id):`);
  console.log(`   -> ${locationVerdict}`);

  console.log("========================================================================================================================");

  // Ako je bilo kreiranih non-ghost objava u --publish režimu, ispisujemo spisak za brisanje
  if (nonGhostIdsToCleanup.length > 0) {
    console.log("\n================================================================================");
    console.log("OBRIŠI RUČNO ILI POKRENI --cleanup");
    console.log("================================================================================");
    console.log("Sledeće objave NISU ghost objave i ostaju na nalogu dok se ne obrišu:");
    console.log(`ID-jevi: ${nonGhostIdsToCleanup.join(" ")}`);
    console.log("\nZa automatsko brisanje ovih objava pokrenite komandu:");
    console.log(`  npx tsx scripts/probe-threads-fields.ts --cleanup ${nonGhostIdsToCleanup.join(" ")}`);
    console.log("================================================================================\n");
  }
}

// Pokretanje skripte
main().catch((err) => {
  console.error("Fatalna greška:", err);
  process.exit(1);
});
