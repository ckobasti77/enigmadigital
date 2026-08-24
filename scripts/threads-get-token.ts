/**
 * ============================================================================
 * POMOĆNIK ZA PRIBAVLJANJE THREADS LONG-LIVED TOKENA
 * ============================================================================
 *
 * Svrha:
 *   Jednokratni / privremeni pomoćnik za lokalno dobavljanje long-lived tokena
 *   za Threads API (graph.threads.com/v1.0) pre nego što se izgradi kompletan
 *   Threads OAuth u Convex-u.
 *
 * Komande:
 *   1) npx tsx scripts/threads-get-token.ts url
 *      - Generiše autorizacioni URL sa 11 scope-ova i slučajnim CSRF state-om
 *      - Upisuje state u .threads-oauth-state
 *
 *   2) npx tsx scripts/threads-get-token.ts exchange <code>
 *      - Menja autorizacioni kod za short-lived token (POST /oauth/access_token)
 *      - Menja short-lived za long-lived token (GET /access_token?grant_type=th_exchange_token)
 *      - Čuva token u .threads-probe-token (BEZ ispisa u konzolu!)
 *      - Čuva metapodatke u .threads-probe-token.meta.json
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

// ── 1. Učitavanje .env i .env.local ako postoje ───────────────────────────────

function loadEnvFile(filename: string): void {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignorišemo greške pri čitanju opcionalnog env fajla
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

// ── 2. Konstante prema threads-api-istrazivanje.md (odeljci 3.1, 3.2, 3.4) ─────

const REDIRECT_URI = "https://digital.enigmait.rs/api/auth/callback/threads";
const AUTH_URL = "https://threads.com/oauth/authorize";
const GRAPH_BASE_URL = "https://graph.threads.com";

const SCOPES = [
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
].join(",");

const STATE_FILE = path.resolve(process.cwd(), ".threads-oauth-state");
const TOKEN_FILE = path.resolve(process.cwd(), ".threads-probe-token");
const META_FILE = path.resolve(process.cwd(), ".threads-probe-token.meta.json");

// ── 3. Komanda: url ──────────────────────────────────────────────────────────

function handleUrlCommand(): void {
  const appId = process.env.THREADS_APP_ID?.trim();
  if (!appId) {
    console.error("================================================================================");
    console.error("GRESKA: Promenljiva okruženja THREADS_APP_ID nije postavljena.");
    console.error("================================================================================");
    console.error("Postavite THREADS_APP_ID u okruženju ili u .env / .env.local fajlu.");
    process.exit(1);
  }

  const state = crypto.randomBytes(16).toString("hex");
  fs.writeFileSync(STATE_FILE, state, "utf-8");

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  console.log("================================================================================");
  console.log("THREADS OAUTH AUTORIZACIONI URL");
  console.log("================================================================================");
  console.log(`\n${authUrl.toString()}\n`);
  console.log("================================================================================");
  console.log("UPUTSTVO:");
  console.log("1. Otvorite gornji URL u browser-u.");
  console.log("2. Prijavite se i odobrite pristup vašem Threads nalogu.");
  console.log("3. Nakon preusmeravanja, iz adresne trake (URL) kopirajte vrednost parametra 'code'.");
  console.log("   PAŽNJA: Threads na kraj koda dodaje '#_' — OBAVEZNO to odsecite!");
  console.log("4. Pokrenite sledeću komandu za razmenu koda za trajni token:");
  console.log("   npx tsx scripts/threads-get-token.ts exchange <kod>");
  console.log("================================================================================");
}

// ── 4. Komanda: exchange <code> ──────────────────────────────────────────────

interface ShortLivedTokenResponse {
  access_token?: string;
  user_id?: string | number;
  error_message?: string;
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

interface LongLivedTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: {
    message: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

async function handleExchangeCommand(rawCode: string): Promise<void> {
  let code = rawCode.trim();
  if (!code) {
    console.error("GRESKA: Nije prosleđen autorizacioni kod.");
    console.error("Upotreba: npx tsx scripts/threads-get-token.ts exchange <code>");
    process.exit(1);
  }

  // Uklanjanje eventualnog sufiksa '#_' ili '#' ako je korisnik prekopirao ceo hash
  if (code.endsWith("#_")) {
    code = code.slice(0, -2);
  } else if (code.endsWith("#")) {
    code = code.slice(0, -1);
  }

  const appId = process.env.THREADS_APP_ID?.trim();
  const appSecret = process.env.THREADS_APP_SECRET?.trim();

  if (!appId || !appSecret) {
    console.error("================================================================================");
    console.error("GRESKA: Nedostaju THREADS_APP_ID ili THREADS_APP_SECRET.");
    console.error("================================================================================");
    console.error("Postavite ove promenljive u okruženju ili u .env / .env.local fajlu.");
    process.exit(1);
  }

  // 1) Razmena koda za short-lived token (POST /oauth/access_token)
  const shortTokenBody = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  let shortTokenRes: Response;
  try {
    shortTokenRes = await fetch(`${GRAPH_BASE_URL}/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: shortTokenBody.toString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Mrežna greška pri razmeni autorizacionog koda: ${msg}`);
    process.exit(1);
  }

  const shortTokenData = (await shortTokenRes.json().catch(() => null)) as ShortLivedTokenResponse | null;

  if (!shortTokenRes.ok || !shortTokenData?.access_token) {
    const errMsg =
      shortTokenData?.error?.message ||
      shortTokenData?.error_message ||
      `HTTP ${shortTokenRes.status}: ${shortTokenRes.statusText}`;
    console.error(`GRESKA (Threads API): ${errMsg}`);
    process.exit(1);
  }

  const shortLivedToken = shortTokenData.access_token;
  const userId = shortTokenData.user_id ? String(shortTokenData.user_id) : undefined;

  // 2) Razmena short-lived za long-lived token (GET /access_token?grant_type=th_exchange_token)
  const longTokenUrl = new URL(`${GRAPH_BASE_URL}/access_token`);
  longTokenUrl.searchParams.set("grant_type", "th_exchange_token");
  longTokenUrl.searchParams.set("client_secret", appSecret);
  longTokenUrl.searchParams.set("access_token", shortLivedToken);

  let longTokenRes: Response;
  try {
    longTokenRes = await fetch(longTokenUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Mrežna greška pri pribavljanju long-lived tokena: ${msg}`);
    process.exit(1);
  }

  const longTokenData = (await longTokenRes.json().catch(() => null)) as LongLivedTokenResponse | null;

  if (!longTokenRes.ok || !longTokenData?.access_token) {
    const errMsg =
      longTokenData?.error?.message ||
      `HTTP ${longTokenRes.status}: ${longTokenRes.statusText}`;
    console.error(`GRESKA (Threads API): ${errMsg}`);
    process.exit(1);
  }

  const longLivedToken = longTokenData.access_token.trim();
  const expiresInSeconds = typeof longTokenData.expires_in === "number" ? longTokenData.expires_in : 5184000;
  const expiresAtIso = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  // 3) Bezbedno upisivanje tokena i metapodataka u fajlove
  // Token se upisuje bez razmaka i bez novog reda na kraju.
  fs.writeFileSync(TOKEN_FILE, longLivedToken, "utf-8");

  const metaContent = {
    user_id: userId,
    expires_at_iso: expiresAtIso,
  };
  fs.writeFileSync(META_FILE, JSON.stringify(metaContent, null, 2), "utf-8");

  // U konzolu se NIKADA ne ispisuje token.
  if (userId) {
    console.log(`Threads User ID: ${userId}`);
  }
  console.log(`Token sačuvan u .threads-probe-token. Ističe: ${expiresAtIso}.`);
}

// ── 5. Glavni ulaz ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "url") {
    handleUrlCommand();
  } else if (command === "exchange") {
    const code = args[1];
    if (!code) {
      console.error("GRESKA: Nije prosleđen autorizacioni kod (code).");
      console.error("Upotreba: npx tsx scripts/threads-get-token.ts exchange <code>");
      process.exit(1);
    }
    await handleExchangeCommand(code);
  } else {
    console.log("Upotreba:");
    console.log("  npx tsx scripts/threads-get-token.ts url");
    console.log("  npx tsx scripts/threads-get-token.ts exchange <code>");
    process.exit(1);
  }
}

void main();
