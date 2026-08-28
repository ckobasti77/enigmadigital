/**
 * Google Business Profile (GBP) API pomoćne funkcije: OAuth razmena tokena,
 * bazne adrese servisa, sanitizacija grešaka i klasifikacija neuspeha.
 *
 * Čiste funkcije bez Convex uvoza — mogu da se izvršavaju u bilo kom runtime-u.
 *
 * GBP porodica API-ja se sastoji od više zasebnih servisa sa različitim baznim adresama:
 *   - Account Management API v1: nalozi i administracija profila
 *   - Business Information API v1: podaci lokacije (naziv, adresa, radno vreme...)
 *   - Performance API v1: analitika i metrike (pregledi, klikovi, pozivi, ključne reči)
 *   - Google My Business API v4.9: recenzije i objave (local posts) žive SAMO na v4
 *     i imaju drugačiji oblik odgovora od v1 servisa (§1 istraživanja).
 *
 * Ništa ovde nikada ne loguje niti interpolira tokene i tajne u poruke.
 */

/** Google OAuth 2.0 token endpoint (razmena koda i refresh_token grant). */
export const GBP_TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Google OAuth 2.0 autorizacioni endpoint. */
export const GBP_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * Zasebne bazne adrese za GBP servise (§1 istraživanja).
 * VAŽNO: Recenzije i objave žive SAMO na v4 i imaju drugačiji oblik odgovora od v1 servisa.
 */
export const GBP_ACCOUNTS_API =
  "https://mybusinessaccountmanagement.googleapis.com/v1";

export const GBP_INFO_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1";

export const GBP_PERFORMANCE_API =
  "https://businessprofileperformance.googleapis.com/v1";

export const GBP_LEGACY_V4 = "https://mybusiness.googleapis.com/v4";

/** Podrazumevani callback URI za Google Business OAuth. */
export const GBP_DEFAULT_REDIRECT_URI =
  "https://digital.enigmait.rs/api/auth/callback/google-business";

/** Jedinstveni opseg za sve servise Google Business Profile integracije. */
export const GBP_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/business.manage",
] as const;

export type GbpCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export type RawGoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GbpFailureKind =
  | "kvota_nula"
  | "kvota_prekoracena"
  | "servis_nije_ukljucen"
  | "nema_dozvole"
  | "nije_pronadjeno"
  | "nepoznato";

export type GbpFailureClassification = {
  vrsta: GbpFailureKind;
  status: number;
  poruka: string; // sanitizovana
  sirovRazlog?: string; // Google-ov `reason`/`status` polje ako postoji
};

// ── Sanitizacija i obrada grešaka ──────────────────────────────────────────

/** Uklanja sve što liči na token ili tajnu iz teksta greške. */
export function sanitizeGbpError(message: string): string {
  return message
    .replace(
      /(access_token|refresh_token|client_secret|id_token|code|secret|password)(\s*[=:]\s*)[^\s&",]+/gi,
      "$1$2<redacted>",
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>");
}

/**
 * Izvlači čitljivu poruku iz Google API odgovora sa greškom.
 * Podržava Google JSON-RPC format `{ error: { message, status, details, errors } }`
 * i OAuth format `{ error, error_description }`.
 */
export function extractGbpApiError(body: string): string {
  let raw = "";
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        status?: string;
        errors?: { reason?: string; message?: string }[];
      } | string;
      error_description?: string;
    };
    if (typeof parsed.error === "string") {
      // OAuth oblik: { error: "invalid_grant", error_description: "..." }
      raw = parsed.error_description
        ? `${parsed.error}: ${parsed.error_description}`
        : parsed.error;
    } else if (parsed.error && typeof parsed.error === "object") {
      if (parsed.error.message) {
        raw = parsed.error.message;
        const reason = parsed.error.errors?.[0]?.reason;
        if (reason && !raw.includes(reason)) {
          raw = `${raw} (${reason})`;
        }
      } else if (parsed.error.status) {
        raw = parsed.error.status;
      }
    }
  } catch {
    // Nije JSON — odsecamo sirovo telo
  }
  if (!raw) raw = body.slice(0, 300);
  if (!raw) raw = "Google Business API zahtev nije uspeo.";
  return sanitizeGbpError(raw);
}

/**
 * Izvlači mašinski čitljiv razlog (reason/status) iz Google API greške.
 * Vraća null ako telo ne sadrži prepoznatljiv razlog.
 */
export function gbpApiErrorReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        errors?: { reason?: string }[];
        status?: string;
        details?: { reason?: string; "@type"?: string }[];
      } | string;
    };
    if (typeof parsed.error === "string") return parsed.error;
    if (parsed.error && typeof parsed.error === "object") {
      const errorInfoDetail = parsed.error.details?.find(
        (d) =>
          d["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" ||
          Boolean(d.reason),
      );
      if (errorInfoDetail?.reason) return errorInfoDetail.reason;
      return (
        parsed.error.errors?.[0]?.reason ??
        parsed.error.status ??
        null
      );
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Klasifikuje neuspeh poziva ka Google Business Profile API-ju.
 *
 * NAPOMENA O KLASIFIKACIJI:
 * Ova klasifikacija NIJE proverena uživo (jer je nalog nov i kvota je 0 QPM pre odobrenja).
 * Dopuniće se posle prvog pravog odgovora u fazi GB7.
 *
 * PRAVILO: Klasifikujemo SAMO ono što pouzdano pročitamo iz odgovora.
 * Ako se iz tela ne može 100% razlikovati „kvota je 0 (nema odobrenja)" od
 * „prekoračen limit 300 QPM", vraća se `vrsta: "nepoznato"` i čuva se `sirovRazlog`.
 * Nagađanje je opasnije od poštenog „nepoznato".
 */
export function classifyGbpFailure(
  status: number,
  body: string,
): GbpFailureClassification {
  const poruka = extractGbpApiError(body);
  const sirovRazlog = gbpApiErrorReason(body) ?? undefined;
  const lowerBody = body.toLowerCase();
  const lowerPoruka = poruka.toLowerCase();

  // 1. Resurs / nalog / lokacija nije pronađena
  if (status === 404 || sirovRazlog === "NOT_FOUND") {
    return {
      vrsta: "nije_pronadjeno",
      status,
      poruka,
      sirovRazlog,
    };
  }

  // 2. Servis nije uključen u Google Cloud projektu
  if (
    sirovRazlog === "SERVICE_DISABLED" ||
    sirovRazlog === "accessNotConfigured" ||
    lowerBody.includes("has not been used in project") ||
    lowerBody.includes("is disabled") ||
    lowerPoruka.includes("service disabled")
  ) {
    return {
      vrsta: "servis_nije_ukljucen",
      status,
      poruka,
      sirovRazlog,
    };
  }

  // 3. Dozvola odbijena / neovlašćen pristup / pogrešan opseg / nevažeći token
  if (
    status === 401 ||
    sirovRazlog === "UNAUTHENTICATED" ||
    sirovRazlog === "invalid_grant" ||
    sirovRazlog === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" ||
    sirovRazlog === "IAM_PERMISSION_DENIED" ||
    sirovRazlog === "USER_PROJECT_DENIED"
  ) {
    return {
      vrsta: "nema_dozvole",
      status,
      poruka,
      sirovRazlog,
    };
  }

  // 4. Kvote i ograničenja (429 ili RESOURCE_EXHAUSTED / quotaExceeded)
  if (
    status === 429 ||
    sirovRazlog === "RESOURCE_EXHAUSTED" ||
    sirovRazlog === "QUOTA_EXCEEDED" ||
    sirovRazlog === "RATE_LIMIT_EXCEEDED" ||
    sirovRazlog === "quotaExceeded" ||
    sirovRazlog === "rateLimitExceeded"
  ) {
    // Proveravamo da li odgovor eksplicitno pominje da je limit 0 (0 QPM / Basic Access nije odobren)
    const isExplicitZeroLimit =
      lowerBody.includes("limit '0'") ||
      lowerBody.includes("limit 0") ||
      lowerBody.includes("limit: 0") ||
      lowerBody.includes("quota limit '0'") ||
      lowerBody.includes("quota metric: 0");

    if (isExplicitZeroLimit) {
      return {
        vrsta: "kvota_nula",
        status,
        poruka,
        sirovRazlog,
      };
    }

    // Ako se ne može pouzdano dokazati da li je 0 QPM ili 300 QPM premašeno,
    // po pravilu vraćamo "nepoznato" sa sirovim razlogom
    return {
      vrsta: "nepoznato",
      status,
      poruka,
      sirovRazlog,
    };
  }

  // 5. Opšti 403 Forbidden ako nije pokriven iznad
  if (status === 403) {
    // Ako eksplicitno piše permission denied bez quota konteksta
    if (
      sirovRazlog === "PERMISSION_DENIED" ||
      sirovRazlog === "forbidden" ||
      lowerBody.includes("permission")
    ) {
      return {
        vrsta: "nema_dozvole",
        status,
        poruka,
        sirovRazlog,
      };
    }
  }

  // Za sve ostale slučajeve (npr. 500, nepoznati 4xx...)
  return {
    vrsta: "nepoznato",
    status,
    poruka,
    sirovRazlog,
  };
}

// ── OAuth konfiguracija i razmena tokena ────────────────────────────────────

/** Čita Google Business Client ID iz environment promenljivih. */
export function getGbpClientId(): string | undefined {
  return process.env.GOOGLE_BUSINESS_CLIENT_ID?.trim();
}

/** Čita Google Business Client Secret iz environment promenljivih. */
export function getGbpClientSecret(): string | undefined {
  return process.env.GOOGLE_BUSINESS_CLIENT_SECRET?.trim();
}

/**
 * Sastavlja Google OAuth 2.0 autorizacioni URL za Google Business Profile.
 * Obavezno uključuje `access_type=offline` i `prompt=consent` kako bi Google
 * vratio `refresh_token`.
 */
export function buildGbpAuthorizeUrl({
  clientId,
  redirectUri = GBP_DEFAULT_REDIRECT_URI,
  state,
}: {
  clientId: string;
  redirectUri?: string;
  state: string;
}): string {
  const url = new URL(GBP_OAUTH_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GBP_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Parsira i validira kredencijal blob sačuvan u bazi.
 * Nikada ne loguje niti otkriva tajne u greškama.
 */
export function parseGbpCredentials(secretJson: string): GbpCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(secretJson);
  } catch {
    throw new Error("Google Business kredencijali nisu validan JSON format.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Google Business kredencijali moraju biti JSON objekat.");
  }

  const obj = parsed as Record<string, unknown>;
  const clientId = String(obj.clientId || obj.client_id || "").trim();
  const clientSecret = String(obj.clientSecret || obj.client_secret || "").trim();
  const refreshToken = String(obj.refreshToken || obj.refresh_token || "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Nedostaju OAuth Client ID ili Client Secret.");
  }
  if (!refreshToken) {
    throw new Error("Nedostaje OAuth Refresh Token.");
  }

  return { clientId, clientSecret, refreshToken };
}

/**
 * Razmenjuje autorizacioni kod za Google access i refresh tokene.
 * Nedostatak `refresh_token`-a se tretira kao fatalna greška jer bez njega
 * veza umire nakon 1h.
 */
export async function exchangeCodeForTokens({
  clientId,
  clientSecret,
  redirectUri,
  code,
}: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ accessToken: string; refreshToken: string; expiresIn?: number }> {
  const tokenParams = new URLSearchParams();
  tokenParams.set("code", code);
  tokenParams.set("client_id", clientId);
  tokenParams.set("client_secret", clientSecret);
  tokenParams.set("redirect_uri", redirectUri);
  tokenParams.set("grant_type", "authorization_code");

  const res = await fetch(GBP_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenParams.toString(),
  });

  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(
      `Google OAuth razmena koda nije uspela (${res.status}): ${extractGbpApiError(body)}`,
    );
  }

  let data: RawGoogleTokenResponse;
  try {
    data = JSON.parse(body) as RawGoogleTokenResponse;
  } catch {
    throw new Error("Google OAuth je vratio neispravan odgovor (nije JSON).");
  }

  if (data.error) {
    const desc = data.error_description ? `: ${data.error_description}` : "";
    throw new Error(
      `Google OAuth greška: ${sanitizeGbpError(`${data.error}${desc}`)}`,
    );
  }

  const accessToken = (data.access_token ?? "").trim();
  const refreshToken = (data.refresh_token ?? "").trim();

  if (!accessToken) {
    throw new Error("Google OAuth nije vratio access token.");
  }

  if (!refreshToken) {
    throw new Error(
      "Google OAuth nije vratio refresh token — veza bi istekla za 1h. Ponovo pokreni autorizaciju uz potpunu saglasnost.",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: data.expires_in,
  };
}

/**
 * Razmenjuje sačuvani refresh token za kratkoživeći access token (~1h).
 */
export async function fetchAccessToken(
  creds: GbpCredentials,
): Promise<string> {
  const res = await fetch(GBP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: creds.refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });

  const body = await res.text().catch(() => "");

  if (!res.ok) {
    if (gbpApiErrorReason(body) === "invalid_grant") {
      throw new Error(
        "Google Business refresh token više ne važi — ponovo poveži Google Business nalog u Podešavanjima.",
      );
    }
    throw new Error(`Google OAuth ${res.status}: ${extractGbpApiError(body)}`);
  }

  let token = "";
  try {
    token = String(
      (JSON.parse(body) as { access_token?: string }).access_token ?? "",
    );
  } catch {
    // pokriveno proverom ispod
  }

  if (!token) {
    throw new Error("Google OAuth nije vratio access token.");
  }

  return token;
}
