"use node";

/**
 * ============================================================================
 * GOOGLE ADS NODE RUNTIME TRANSPORT LAYER (Node.js Runtime Only)
 * ============================================================================
 *
 * PRAVILO KOJE MORA DA PREŽIVI:
 * Nijedan fajl BEZ "use node" ne sme da uvozi modul KOJI IMA "use node".
 *
 * Ovaj fajl SADRŽI "use node" i uvozi google-auth-library radi JWT razmene tokena.
 * Zato se sme uvoziti ISKLJUČIVO iz Node.js akcija (fajlova koji takođe imaju "use node").
 * Sve deljene funkcije (URL builderi, konverzije valuta, normalizacija) nalaze se u
 * ./googleAdsShared.ts koji NEMA "use node".
 * ============================================================================
 */

import { JWT } from "google-auth-library";
import {
  GOOGLE_ADS_SCOPE,
  buildSearchStreamUrl,
  buildGoogleAdsHeaders,
  extractGoogleAdsApiError,
  decamelizeRowKeys,
} from "./googleAdsShared";

/**
 * Obtain OAuth2 access token for Google Ads via Service Account JWT exchange (A2).
 * Scope: https://www.googleapis.com/auth/adwords
 * Exchange: https://oauth2.googleapis.com/token
 */
export async function getGoogleAdsAccessToken(sa: {
  client_email: string;
  private_key: string;
}): Promise<string> {
  const client = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [GOOGLE_ADS_SCOPE],
  });
  const { token } = await client.getAccessToken();
  if (!token) {
    throw new Error("Google Ads access token request returned no token.");
  }
  return token;
}

export interface QueryGoogleAdsParams {
  customerId: string;
  query: string;
  accessToken: string;
  developerToken: string;
  loginCustomerId?: string;
  version?: string;
}

/**
 * Executes a GAQL query against Google Ads searchStream REST endpoint.
 */
export async function queryGoogleAdsSearchStream(
  params: QueryGoogleAdsParams,
): Promise<any[]> {
  const url = buildSearchStreamUrl(params.customerId, params.version);
  const headers = buildGoogleAdsHeaders({
    developerToken: params.developerToken,
    accessToken: params.accessToken,
    loginCustomerId: params.loginCustomerId,
  });

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query: params.query }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(extractGoogleAdsApiError(errorText, res.status));
  }

  const chunks = (await res.json()) as Array<{ results?: any[] }>;
  const rows: any[] = [];
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (chunk.results && Array.isArray(chunk.results)) {
        for (const row of chunk.results) {
          rows.push(decamelizeRowKeys(row));
        }
      }
    }
  }
  return rows;
}
