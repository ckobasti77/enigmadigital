import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { hubHostovi } from "./podesavanja";
import { jeLokalniHost, normalizujHost } from "./projekatSlug";

/**
 * ============================================================================
 * OAUTH POVRATAK (PROJEKTI-PLAN P6, plan C10 §5, E8–E10)
 * ============================================================================
 *
 * Jedna registrovana povratna adresa kod Mete i Google-a za sve projekte:
 * `redirect_uri` gradi server iz env `OAUTH_CALLBACK_ORIGIN` (bez podrazumevane
 * vrednosti u kodu). Posle razmene, callback ruta vraća korisnika na panel sa
 * kog je tok krenuo: tu adresu (`oauthStates.povratak`) server proverava pri
 * izdavanju i ponovo pri trošenju stanja, a putanju gradi sam. Klijent šalje
 * samo origin, pa nema open redirect-a ni preko domena ni preko putanje.
 * ============================================================================
 */

export const SEGMENT = {
  meta_ig: "instagram",
  meta_fb: "facebook",
  threads: "threads",
  youtube: "youtube",
  google_business: "google-business",
} as const;
export type OAuthProvider = keyof typeof SEGMENT;

export const OAUTH_NIJE_PODESEN = {
  code: "oauth_nije_podesen",
  message: "Povezivanje nije podešeno: na serveru nedostaje OAUTH_CALLBACK_ORIGIN.",
} as const;

export const POVRATAK_ODBIJEN = {
  code: "povratak_odbijen",
  message: "Povezivanje mora da krene sa panela ovog projekta ili sa huba.",
} as const;

/** Koliko dugo traje autorizacioni tok (izdavanje stanja → callback). */
export const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/** Http je dozvoljen samo za lokalni razvoj (`localhost`, `127.0.0.1`). */
function jeLokalnaAdresa(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

/**
 * `OAUTH_CALLBACK_ORIGIN`: `https://<host>` bez putanje, upita i heša (`http`
 * samo za localhost i 127.0.0.1). Nikad ne baca.
 */
export function oauthCallbackOrigin():
  | { ok: true; origin: string; host: string }
  | { ok: false; poruka: string } {
  const raw = process.env.OAUTH_CALLBACK_ORIGIN?.trim();
  if (!raw) return { ok: false, poruka: OAUTH_NIJE_PODESEN.message };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, poruka: "OAUTH_CALLBACK_ORIGIN nije ispravna adresa." };
  }
  const host = url.hostname.toLowerCase();
  const protokolOk =
    url.protocol === "https:" || (url.protocol === "http:" && jeLokalnaAdresa(host));
  if (
    !protokolOk ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    return {
      ok: false,
      poruka: "OAUTH_CALLBACK_ORIGIN mora biti samo https://<domen>, bez putanje.",
    };
  }
  return { ok: true, origin: url.origin, host };
}

/** `redirect_uri` provajdera; bez `OAUTH_CALLBACK_ORIGIN` baca jasnu grešku. */
export function redirectUriZa(provider: OAuthProvider): string {
  const o = oauthCallbackOrigin();
  if (!o.ok) {
    throw new ConvexError({ code: OAUTH_NIJE_PODESEN.code, message: o.poruka });
  }
  return `${o.origin}/api/auth/callback/${SEGMENT[provider]}`;
}

function odbij(): never {
  throw new ConvexError(POVRATAK_ODBIJEN);
}

const PUTANJA_INTEGRACIJA = "/settings?tab=integracije";

/**
 * Adresa povratka posle povezivanja (E9, E10). Vraća apsolutnu adresu ili
 * baca `povratak_odbijen`:
 *  1. samo origin: `https:` (`http:` samo kad su i host i
 *     `OAUTH_CALLBACK_ORIGIN` lokalni), bez korisnika, lozinke, putanje, upita
 *     i heša;
 *  2. host mapiran na projekat mora biti mapiran baš na ovaj projekat →
 *     panel: `/settings?tab=integracije`;
 *  3. nemapiran host iz `HUB_HOSTS`, host iz `OAUTH_CALLBACK_ORIGIN`, ili
 *     lokalni host u razvoju → hub: `/<slug>/settings?tab=integracije`;
 *  4. sve ostalo se odbija.
 */
export async function proveriPovratak(
  db: QueryCtx["db"],
  workspaceId: Id<"workspaces">,
  povratakOrigin: string,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(povratakOrigin.trim());
  } catch {
    odbij();
  }
  const host = normalizujHost(url.hostname);
  if (host === null) odbij();
  const callback = oauthCallbackOrigin();
  const razvoj = callback.ok && jeLokalniHost(callback.host);
  const protokolOk =
    url.protocol === "https:" || (url.protocol === "http:" && razvoj && jeLokalniHost(host));
  if (
    !protokolOk ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    odbij();
  }
  const origin = `${url.protocol}//${url.host.toLowerCase()}`;

  const mapiran = await db
    .query("projekatDomeni")
    .withIndex("by_host", (q) => q.eq("host", host))
    .first();
  if (mapiran !== null) {
    if (mapiran.workspaceId !== workspaceId) odbij();
    return `${origin}${PUTANJA_INTEGRACIJA}`;
  }

  const jeHub =
    hubHostovi().includes(host) ||
    (callback.ok && callback.host === host) ||
    (razvoj && jeLokalniHost(host));
  if (!jeHub) odbij();
  const ws = await db.get(workspaceId);
  if (ws === null) odbij();
  return `${origin}/${ws.slug}${PUTANJA_INTEGRACIJA}`;
}

/** Args svih pet `createOAuthState` mutacija. */
export const oauthStanjeArgs = {
  workspaceId: v.id("workspaces"),
  userId: v.id("users"),
  nonce: v.string(),
  redirectUri: v.string(),
  /** Origin panela sa kog je tok krenuo (`window.location.origin`). */
  povratakOrigin: v.string(),
};

/** Odgovor svih pet `consumeOAuthState` mutacija (kad stanje postoji). */
export const potrosenoStanjeValidator = v.object({
  workspaceId: v.id("workspaces"),
  redirectUri: v.string(),
  createdAt: v.number(),
  povratak: v.union(v.string(), v.null()),
});

/** Stanja starija od sat vremena se brišu pri izdavanju novog. */
const STARO_STANJE_MS = 60 * 60 * 1000;

/**
 * Upiše jednokratno OAuth stanje sa proverenom adresom povratka. Zovu ga
 * `createOAuthState` mutacije svih pet provajdera.
 */
export async function upisiOAuthStanje(
  ctx: MutationCtx,
  a: {
    workspaceId: Id<"workspaces">;
    userId: Id<"users">;
    provider: OAuthProvider;
    nonce: string;
    redirectUri: string;
    povratakOrigin: string;
  },
): Promise<void> {
  const povratak = await proveriPovratak(ctx.db, a.workspaceId, a.povratakOrigin);
  const stara = await ctx.db
    .query("oauthStates")
    .withIndex("by_createdAt", (q) => q.lt("createdAt", Date.now() - STARO_STANJE_MS))
    .take(100);
  for (const red of stara) await ctx.db.delete(red._id);
  await ctx.db.insert("oauthStates", {
    workspaceId: a.workspaceId,
    userId: a.userId,
    provider: a.provider,
    nonce: a.nonce,
    redirectUri: a.redirectUri,
    createdAt: Date.now(),
    povratak,
  });
}

export type PotrosenoStanje = {
  workspaceId: Id<"workspaces">;
  redirectUri: string;
  createdAt: number;
  povratak: string | null;
};

/**
 * Pročita i obriše stanje (jednokratno). Stanje drugog provajdera se ne troši.
 * Povratak se ponovo proverava: domen je mogao biti uklonjen u međuvremenu,
 * pa neuspeh daje `povratak: null` (callback tada ide na `/settings`).
 */
export async function potrosiOAuthStanje(
  ctx: MutationCtx,
  nonce: string,
  provider: OAuthProvider,
): Promise<PotrosenoStanje | null> {
  const red = await ctx.db
    .query("oauthStates")
    .withIndex("by_nonce", (q) => q.eq("nonce", nonce))
    .first();
  if (red === null || red.provider !== provider) return null;
  await ctx.db.delete(red._id);
  return {
    workspaceId: red.workspaceId,
    redirectUri: red.redirectUri,
    createdAt: red.createdAt,
    povratak: await ponovoProveren(ctx.db, red.workspaceId, red.povratak),
  };
}

/** Sačuvan povratak, ponovo proveren protiv današnjih domena; inače `null`. */
export async function ponovoProveren(
  db: QueryCtx["db"],
  workspaceId: Id<"workspaces">,
  povratak: string | undefined,
): Promise<string | null> {
  if (povratak === undefined) return null;
  try {
    const sacuvan = new URL(povratak);
    const sveza = await proveriPovratak(db, workspaceId, sacuvan.origin);
    return sveza === povratak ? povratak : null;
  } catch {
    return null;
  }
}
