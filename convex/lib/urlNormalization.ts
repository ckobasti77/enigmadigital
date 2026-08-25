import { shortLinkOrigin } from "./orLink";

/**
 * ============================================================================
 * THREADS & OPENREPLY URL NORMALIZATION & DOMAIN VALIDATION (TH10)
 * ============================================================================
 *
 * Centralizovana normalizacija URL-ova za spajanje Threads metrike klikova
 * (`threadsClicksByUrl`) i server-side dolazaka na sajt (`orLinkClicks`).
 *
 * Takođe proverava da li URL pripada domenima koje kontrolišemo kako bi se
 * automatski zamenio praćenim `/r/` linkom.
 * ============================================================================
 */

/** Podrazumevani domeni našeg projekta */
const DEFAULT_CONTROLLED_DOMAINS = [
  "enigmait.rs",
  "digital.enigmait.rs",
  "localhost",
  "127.0.0.1",
];

/**
 * Vraća listu svih kontrolisanih domena (uključujući one iz env konfiguracije).
 */
export function getControlledDomains(): string[] {
  const domains = new Set<string>(DEFAULT_CONTROLLED_DOMAINS);

  const origin = shortLinkOrigin();
  if (origin) {
    try {
      const parsed = new URL(origin);
      domains.add(parsed.hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // Ignoriši neispravan origin
    }
  }

  const extra = process.env.TRACKED_DOMAINS;
  if (extra) {
    for (const d of extra.split(",")) {
      const clean = d.trim().toLowerCase().replace(/^www\./, "");
      if (clean) domains.add(clean);
    }
  }

  return Array.from(domains);
}

/**
 * Proverava da li URL vodi ka domenu koji kontrolišemo i koji treba da bude praćen.
 *
 * VAŽNO: Ako je URL već kratki `/r/` link (npr. `digital.enigmait.rs/r/slug`),
 * vraća `false` kako se ne bi dvostruko pakovao u novi `/r/` link!
 */
export function isControlledDomain(rawUrl?: string): boolean {
  if (!rawUrl) return false;

  let parsed: URL;
  try {
    const candidate = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : `https://${rawUrl}`;
    parsed = new URL(candidate);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  // Ako je već /r/ kratki link, ne pakuj ga ponovo
  if (parsed.pathname.startsWith("/r/")) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const controlled = getControlledDomains();

  return controlled.some((domain) => {
    return hostname === domain || hostname.endsWith(`.${domain}`);
  });
}

/**
 * Izdvaja slug iz kratkog `/r/:slug` URL-a ako postoji.
 * Podržava URL-ove sa query parametrima, hash-em ili završnom kosom crtom.
 */
export function extractSlugFromShortUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;

  try {
    const candidate = rawUrl.startsWith("http://") || rawUrl.startsWith("https://")
      ? rawUrl
      : `https://${rawUrl}`;
    const parsed = new URL(candidate);

    const match = parsed.pathname.match(/^\/r\/([a-z0-9]+)/i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  } catch {
    const match = rawUrl.match(/\/r\/([a-z0-9]+)/i);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

/**
 * Deterministička normalizacija URL-a:
 *   - protokol se svodi na mala slova (default https)
 *   - hostname se svodi na mala slova i uklanja se vodeće `www.`
 *   - uklanja se podrazumevani port (:80 za http, :443 za https)
 *   - pathname se čisti od višestrukih kosih crta i uklanja se završna kosa crta (osim korena `/`)
 *   - query parametri se sortiraju po abecednom redosledu ključeva i vrednosti
 *   - uklanjaju se privremeni tracking/ad parametri (fbclid, igshid, threads_token itd.) radi čistog poređenja
 */
export function normalizeUrl(rawUrl?: string): string {
  if (!rawUrl) return "";

  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  let parsed: URL;
  try {
    const candidate = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    parsed = new URL(candidate);
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/, "");
  }

  // Protokol i hostname
  const protocol = parsed.protocol.toLowerCase();
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith("www.")) {
    hostname = hostname.slice(4);
  }

  // Port
  let host = hostname;
  if (
    parsed.port &&
    !(protocol === "http:" && parsed.port === "80") &&
    !(protocol === "https:" && parsed.port === "443")
  ) {
    host = `${hostname}:${parsed.port}`;
  }

  // Pathname: ukloni duple kose crte i završni slash
  let pathname = parsed.pathname.replace(/\/+/g, "/");
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // Query parametri: uklanjamo prolazne ad-click parametre i sortiramo ostale
  const ignoreParams = new Set([
    "fbclid",
    "igshid",
    "threads_token",
    "gclid",
    "ttclid",
    "_ga",
    "_gl",
  ]);

  const searchParams = new URLSearchParams();
  const sortedKeys = Array.from(parsed.searchParams.keys()).sort();

  for (const key of sortedKeys) {
    if (ignoreParams.has(key.toLowerCase())) continue;
    const values = parsed.searchParams.getAll(key).sort();
    for (const val of values) {
      searchParams.append(key, val);
    }
  }

  const queryStr = searchParams.toString();
  const normalized = `${protocol}//${host}${pathname}${queryStr ? `?${queryStr}` : ""}`;

  return normalized;
}
