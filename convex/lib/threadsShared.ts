/**
 * ============================================================================
 * THREADS SHARED UTILITIES & FORMATTERS (V8 Runtime Safe)
 * ============================================================================
 *
 * KRITIČNO PRAVILO RUNTIME-A:
 * Ovaj fajl NEMA "use node" i NE UVOZI nijedan Node built-in modul (fs, crypto, net...).
 * Sadrži isključivo funkcije, konstante i tipove koji su 100% bezbedni za pokretanje
 * u Convex V8 runtime-u (mutations, queries, actions).
 * ============================================================================
 */

export const THREADS_API_BASE = "https://graph.threads.com";
export const THREADS_AUTHORIZE_URL = "https://threads.com/oauth/authorize";
export const THREADS_API_VERSION = "v1.0";
export const THREADS_REDIRECT_URI =
  "https://digital.enigmait.rs/api/auth/callback/threads";

/**
 * Svih 11 definisanih Threads API scope-ova (odeljak 3.4).
 */
export const THREADS_SCOPES = [
  "threads_basic",
  "threads_content_publish",
  "threads_read_replies",
  "threads_manage_replies",
  "threads_manage_insights",
  "threads_delete",
  "threads_location_tagging",
  "threads_keyword_search",
  "threads_manage_mentions",
  "threads_profile_discovery",
  "threads_share_to_instagram",
] as const;

export type ThreadsScope = (typeof THREADS_SCOPES)[number];

/**
 * Gradi autorizacioni URL za početak Threads OAuth toka (odeljak 3.2).
 */
export function buildThreadsAuthorizeUrl({
  clientId,
  redirectUri = THREADS_REDIRECT_URI,
  scopes = THREADS_SCOPES,
  state,
}: {
  clientId: string;
  redirectUri?: string;
  scopes?: readonly string[];
  state: string;
}): string {
  const url = new URL(THREADS_AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes.join(","));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Gradi puni URL ka Graph Threads endpoint-u sa odgovarajućom verzijom (podrazumevano v1.0).
 */
export function buildThreadsUrl(
  path: string,
  version: string = THREADS_API_VERSION,
): string {
  const cleanPath = path.replace(/^\/+/, "");
  return `${THREADS_API_BASE}/${version}/${cleanPath}`;
}

/**
 * Gradi HTTP zaglavlja za pozive Threads API-ja.
 *
 * BEZBEDNOST: Token se šalje ISKLJUČIVO kroz Authorization: Bearer zaglavlje,
 * NIKADA u query stringu.
 */
export function buildThreadsHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Struktura sirove Threads / Graph API greške:
 * {"error":{"message":"...","type":"OAuthException","code":190,"error_subcode":463,"fbtrace_id":"..."}}
 */
export interface RawThreadsApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Izvlači čitljivu poruku iz Threads API greške, bez curenja tajni.
 * Vraća message uz type i code kada postoje. Ako poruke nema — vraća opis uz prvih 900 karaktera sirovog odgovora.
 */
export function extractThreadsApiError(body: string, status?: number): string {
  try {
    const parsed = JSON.parse(body) as RawThreadsApiError;
    const errorObj = parsed?.error;

    if (errorObj && typeof errorObj === "object") {
      const message =
        typeof errorObj.message === "string" ? errorObj.message.trim() : "";
      const type =
        typeof errorObj.type === "string" ? errorObj.type.trim() : "";
      const code = errorObj.code !== undefined ? String(errorObj.code) : "";
      const subcode =
        errorObj.error_subcode !== undefined
          ? String(errorObj.error_subcode)
          : "";

      const metaParts: string[] = [];
      if (type) metaParts.push(`type: ${type}`);
      if (code) metaParts.push(`code: ${code}`);
      if (subcode) metaParts.push(`subcode: ${subcode}`);

      if (message) {
        const metaStr = metaParts.length > 0 ? ` (${metaParts.join(", ")})` : "";
        return `${message}${metaStr}`;
      }

      const metaStr = metaParts.length > 0 ? ` [${metaParts.join(", ")}]` : "";
      return `Threads API je odbio zahtev bez poruke${metaStr}. SIROVO=${body.slice(0, 900)}`;
    }
  } catch {
    // Nije validan JSON — vraćamo isečak sirovog tela
  }

  return `Threads API greška (${status ?? "status nepoznat"}): ${body.slice(0, 900)}`;
}

/**
 * Uklanja sve osetljive tokene, ključeve i tajne iz poruka o greškama.
 *
 * Prepisano 25.08.2026 posle stvarnog curenja. Meta je na neispravan
 * `client_secret` vratila poruku `Invalid client_secret: THAAduwf23c6...` —
 * dakle ECHO vrednosti koju smo poslali. Stara verzija je gađala samo
 * `client_secret=` (query oblik) i prefiks `THQVJ`, pa je vrednost u obliku
 * `client_secret: THAA...` prošla netaknuta: završila je u query stringu
 * `?threads_error=`, u istoriji pregledača i na ekranu.
 *
 * Zato se sada redigujе po OBLIKU vrednosti, ne po susednoj reči. Redakcija
 * koja zavisi od toga da li je provajder napisao `=` ili `: ` nije redakcija.
 *
 * Poslednje pravilo je mreža za nepoznato: svaki dovoljno dug neprozirni niz
 * koji meša velika, mala slova i cifre je kandidat za tajnu i pada. Radije
 * ćemo izgubiti jedan dugačak identifikator iz poruke nego propustiti jedan
 * token.
 */
export function sanitizeThreadsError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw
      // 1) Vrednost uz imenovani ključ — i `k=v` i `k: v` oblik. Kratke
      //    vrednosti (`code: 101`) se ne diraju: prag je 6 karaktera.
      .replace(
        /\b(client_secret|app_secret|access_token|refresh_token|client_token|code)\b\s*[=:]\s*"?([A-Za-z0-9._~+/=-]{6,})"?/gi,
        (_m, key: string) => `${key}=[REDACTED]`,
      )
      // 2) Authorization zaglavlje.
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]{10,}=*/gi, "Bearer [REDACTED]")
      // 3) Poznati prefiksi Meta/Threads/Instagram tokena, ma gde se pojavili.
      .replace(
        /\b(TH[A-Za-z0-9]{2}|EAA|IGQ|IGAA)[A-Za-z0-9_-]{20,}/g,
        "[REDACTED_TOKEN]",
      )
      // 4) App secret: hex niz od 32+ karaktera koji sadrži bar jedno slovo
      //    (uslov za slovo čuva duge numeričke ID-jeve objava od redakcije).
      .replace(/\b(?=[a-f0-9]*[a-f])[a-f0-9]{32,}\b/gi, "[REDACTED_SECRET]")
      // 5) Mreža za nepoznate oblike: dug neprozirni niz sa mešavinom
      //    velikih i malih slova i cifara.
      .replace(
        /\b(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{40,}\b/g,
        "[REDACTED]",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Opisuje OBLIK odgovora, bez ijedne vrednosti iz njega.
 *
 * `JSON.stringify(raw)` u poruci greške je curenje: telo odgovora
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

export type ThreadsResourceOutcome =
  | { resource: string; ok: true; rows: number }
  | { resource: string; ok: false; reason: string };

export interface ThreadsSyncSummary {
  status: "Uspešno" | "Delimično" | "Greška";
  totalResources: number;
  successfulResources: number;
  failedResources: number;
  succeededQueries: number;
  failedQueries: number;
  failedResourceNames: string[];
  outcomes: ThreadsResourceOutcome[];
  itemsWritten: number;
  note?: string;
}

/**
 * Izvršava pojedinačni resurs / upit uz praćenje ishoda po uzoru na executeGaqlResource.
 *
 * Pravila:
 *   - Upit koji vrati 0 redova je USPEH: { resource, ok: true, rows: 0 }
 *   - Neuspeo upit NIKADA ne sme da izgleda kao prazan rezultat: { resource, ok: false, reason: "..." }
 *   - Nikada ne baca grešku dalje kako bi ostali resursi mogli da se obrade, ali se neuspeh beleži.
 */
export async function executeThreadsResource<T>(
  resource: string,
  outcomes: ThreadsResourceOutcome[],
  fn: () => Promise<T[]>,
  sanitizeFn: (err: unknown) => string = sanitizeThreadsError,
): Promise<T[]> {
  try {
    const rows = await fn();
    const count = Array.isArray(rows) ? rows.length : 0;
    outcomes.push({ resource, ok: true, rows: count });
    return rows;
  } catch (err) {
    const reason = sanitizeFn(err);
    outcomes.push({ resource, ok: false, reason });
    return [];
  }
}

/**
 * Sažima ishod sinhronizacije na osnovu rezultata pojedinačnih resursa.
 */
export function summarizeThreadsSync(params: {
  outcomes: ThreadsResourceOutcome[];
  itemsWritten: number;
  authOrQuotaFailed?: boolean;
  fatalError?: string;
}): ThreadsSyncSummary {
  const { outcomes, itemsWritten, authOrQuotaFailed, fatalError } = params;
  const totalResources = outcomes.length;
  const failedOutcomes = outcomes.filter(
    (o): o is { resource: string; ok: false; reason: string } => !o.ok,
  );
  const failedResources = failedOutcomes.length;
  const successfulResources = totalResources - failedResources;
  const failedResourceNames = failedOutcomes.map((o) => o.resource);

  let status: "Uspešno" | "Delimično" | "Greška";
  const noteParts: string[] = [];

  if (authOrQuotaFailed || fatalError) {
    status = "Greška";
    if (fatalError) noteParts.push(fatalError);
  } else if (failedResources > 0) {
    status = "Delimično";
    noteParts.push(
      `Delimično: ${failedResources}/${totalResources} neuspelih upita (${failedResourceNames.join(", ")})`,
    );
  } else {
    status = "Uspešno";
  }

  const note = noteParts.length > 0 ? noteParts.join(" | ") : undefined;

  return {
    status,
    totalResources,
    successfulResources,
    failedResources,
    succeededQueries: successfulResources,
    failedQueries: failedResources,
    failedResourceNames,
    outcomes,
    itemsWritten,
    note,
  };
}

/** Pojedinačna kvota u okviru Threads publishing limita. */
export interface ThreadsQuotaItem {
  used?: number;
  total?: number;
  durationSeconds?: number;
}

/**
 * Četiri tipizovane kvote za Threads profil (odeljak 8):
 *  - publishing (objave: 250)
 *  - reply (odgovori: 1000)
 *  - delete (brisanja: 100)
 *  - locationSearch (location search: 500)
 */
export interface ThreadsPublishingLimit {
  publishing?: ThreadsQuotaItem;
  reply?: ThreadsQuotaItem;
  delete?: ThreadsQuotaItem;
  locationSearch?: ThreadsQuotaItem;
}

function parseQuotaItem(
  usage: unknown,
  config: unknown,
): ThreadsQuotaItem | undefined {
  const cfg =
    typeof config === "object" && config !== null
      ? (config as Record<string, unknown>)
      : undefined;

  const used = typeof usage === "number" ? usage : undefined;
  const total = typeof cfg?.quota_total === "number" ? cfg.quota_total : undefined;
  const durationSeconds =
    typeof cfg?.quota_duration === "number" ? cfg.quota_duration : undefined;

  if (used === undefined && total === undefined && durationSeconds === undefined) {
    return undefined;
  }

  const item: ThreadsQuotaItem = {};
  if (used !== undefined) item.used = used;
  if (total !== undefined) item.total = total;
  if (durationSeconds !== undefined) item.durationSeconds = durationSeconds;
  return item;
}

/**
 * Parsira odgovor sa /{user-id}/threads_publishing_limit.
 * Ako neka vrednost nije stigla, ostaje undefined — nikad se ne podmeće 0 ni podrazumevani maksimum.
 */
export function parseThreadsPublishingLimit(raw: unknown): ThreadsPublishingLimit {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const root = raw as Record<string, unknown>;
  const target =
    Array.isArray(root.data) &&
    root.data.length > 0 &&
    typeof root.data[0] === "object" &&
    root.data[0] !== null
      ? (root.data[0] as Record<string, unknown>)
      : root;

  const publishing = parseQuotaItem(target.quota_usage, target.config);
  const reply = parseQuotaItem(target.reply_quota_usage, target.reply_config);
  const deleteQuota = parseQuotaItem(
    target.delete_quota_usage,
    target.delete_config,
  );
  const locationSearch = parseQuotaItem(
    target.location_search_quota_usage,
    target.location_search_config,
  );

  const result: ThreadsPublishingLimit = {};
  if (publishing) result.publishing = publishing;
  if (reply) result.reply = reply;
  if (deleteQuota) result.delete = deleteQuota;
  if (locationSearch) result.locationSearch = locationSearch;

  return result;
}

/**
 * Prijavljuje nepoznat media_type kroz console.warn (Dodatak B.5 i B.7).
 * Dozvoljene poznate vrednosti: "TEXT_POST", "REPOST_FACADE".
 */
export function checkAndLogMediaType(mediaType: string | undefined): void {
  if (!mediaType) return;
  if (mediaType !== "TEXT_POST" && mediaType !== "REPOST_FACADE") {
    console.warn(
      `[Threads API] Otkriven nepoznat/novi media_type: "${mediaType}". Zabeleži vrednost u dokumentaciju.`,
    );
  }
}
