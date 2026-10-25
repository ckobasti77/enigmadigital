import { v } from "convex/values";
import { internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { recordInboundInternal } from "./leadInboundStore";
import { isSuppressed } from "./leadSuppressionStore";
import { upisiCapiDogadjaj } from "./metaCapiStore";
import { greskeValidacije } from "./lib/generateLeadsIngest";
import { ingestOdgovor, nadjiToken, tokenIzZaglavlja } from "./lib/ingestToken";
import { extractClientIp } from "./lib/klijentIp";
import {
  LEAD_SAJT_MAX_BAJTOVA,
  PORUKA_EMAIL_ILI_TELEFON,
  domenFirmeIzMejla,
  dozvoljenOrigin,
  ispravanHttpsOrigin,
  leadSajtSchema,
  stranicaNaSajtu,
} from "./lib/leadSajt";
import { normalizePhoneRs } from "./lib/leadNormalize";
import { hashEmail, hashPhone, sha256Hex } from "./lib/metaAudienceHash";
import { podesavanjaProjekta, stanjeTajne } from "./lib/podesavanja";
import { podesavanjaZaAkciju } from "./lib/podesavanjaAkcija";
import {
  PROJEKTI_LEAD_HOURLY_CAP,
  PROJEKTI_LEAD_PO_TOKENU_HOURLY_CAP,
  ROUTE_WINDOW_MS,
} from "./publicRouteLimit";

/**
 * ============================================================================
 * LEADOVI SA SAJTA PROJEKTA: `POST /projekti/lead` (C17, PROJEKTI-PLAN §11,
 * plan C15 §6)
 * ============================================================================
 *
 * Forma na sajtu projekta (npr. scanme.rs) šalje upit sa tokenom projekta
 * namene „sajt“. Upit ulazi u `leadInbound` (izvor „website“) projekta kome
 * pripada token, a uz saglasnost posetioca i u CAPI red kao „Lead“ na piksel
 * tog projekta, sa deduplikacijom po `eventId`.
 *
 * PROJEKAT SE ZNA SAMO IZ TOKENA. Telo ne može da izabere drugi projekat.
 *
 * Redosled u POST-u (svaki korak pre upisa):
 *   1. Content-Type (415) i veličina (413)
 *   2. token (401)        3. namena „sajt“ (403)
 *   4. Origin među sajtovima projekta (403, bez CORS zaglavlja)
 *   5. kapa po tokenu i po projektu (429 + Retry-After)
 *   6. JSON + šema (422)  7. upis (200)  8. poslednja upotreba tokena
 *
 * CORS (F16): preflight odobrava svaki ispravan `https://` origin, jer nema
 * token pa ne zna projekat; pravo pravilo je korak 4, na serveru, pre upisa.
 *
 * NIŠTA IZ ZAHTEVA SE NE LOGUJE: ni token, ni telo, ni IP adresa.
 * ============================================================================
 */

/** Telo posle provere šemom (isti oblik kao `LeadSajtTelo`). */
const teloValidator = v.object({
  ime: v.optional(v.string()),
  email: v.optional(v.string()),
  telefon: v.optional(v.string()),
  firma: v.optional(v.string()),
  poruka: v.optional(v.string()),
  stranica: v.optional(v.string()),
  utm: v.optional(
    v.object({
      source: v.optional(v.string()),
      medium: v.optional(v.string()),
      campaign: v.optional(v.string()),
      term: v.optional(v.string()),
      content: v.optional(v.string()),
    }),
  ),
  eventId: v.optional(v.string()),
  klijent: v.optional(
    v.object({
      ip: v.optional(v.string()),
      userAgent: v.optional(v.string()),
      fbp: v.optional(v.string()),
      fbc: v.optional(v.string()),
    }),
  ),
  saglasnost: v.optional(v.object({ marketing: v.boolean() })),
});

/** Bez praznih polja: `{ source: undefined }` se ne upisuje kao objekat. */
function bezPraznih<T extends Record<string, string | undefined>>(o: T | undefined): T | undefined {
  if (o === undefined) return undefined;
  const izlaz: Record<string, string> = {};
  for (const [k, val] of Object.entries(o)) {
    if (typeof val === "string" && val.length > 0) izlaz[k] = val;
  }
  return Object.keys(izlaz).length > 0 ? (izlaz as T) : undefined;
}

/**
 * Upis upita i (kad sme) CAPI događaja, u jednoj transakciji. Interna:
 * zove je samo HTTP akcija posle provere tokena, izvora i kape.
 *
 * `ipZahteva` i `userAgentZahteva` postoje samo kad je zahtev došao iz
 * pregledača (ima `Origin`): tada su to podaci posetioca. Poziv sa servera
 * ScanMe-a šalje podatke posetioca u `telo.klijent`. Sirova IP adresa ide
 * SAMO u CAPI red (koji je briše posle slanja), nikad u `leadInbound`.
 */
export const primiLeadSaSajta = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    tokenId: v.id("ingestTokens"),
    telo: teloValidator,
    ipZahteva: v.optional(v.string()),
    userAgentZahteva: v.optional(v.string()),
  },
  returns: v.object({
    id: v.id("leadInbound"),
    duplikat: v.boolean(),
    capi: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { workspaceId, telo } = args;
    const now = Date.now();
    const email = telo.email?.trim().toLowerCase() || undefined;
    const telefon = telo.telefon?.trim() || undefined;
    const telefonE164 = normalizePhoneRs(telefon);

    // 1. Ključ protiv duplog upisa: eventId forme, inače otisak sadržaja u
    //    istom minutu (dvostruki klik na „Pošalji“).
    const externalId =
      telo.eventId ??
      `web_${await sha256Hex(
        [email ?? "", telefon ?? "", telo.poruka ?? "", String(Math.floor(now / 60_000))].join("|"),
      )}`;
    const postojeci = await ctx.db
      .query("leadInbound")
      .withIndex("by_workspace_platform_external", (q) =>
        q.eq("workspaceId", workspaceId).eq("platform", "website").eq("externalId", externalId),
      )
      .first();
    if (postojeci !== null) return { id: postojeci._id, duplikat: true, capi: false };

    // 2. Autor: heš kontakta, da novi upit iste osobe nasledi „povezan“ /
    //    „zabranjen_kontakt“ kroz postojeću logiku čekaonice.
    const autor = email
      ? await sha256Hex(email)
      : telefonE164
        ? await sha256Hex(telefonE164)
        : undefined;

    // 3. Lista zabrane po kontaktu i domenu firme (ne besplatnog mejla).
    const zabrana = await isSuppressed(ctx, {
      workspaceId,
      email,
      phone: telefon,
      domain: domenFirmeIzMejla(email),
    });

    const podesavanja = await podesavanjaProjekta(ctx, workspaceId);
    const sajtovi = podesavanja.sajtovi.vrednost ?? [];
    const stranica = stranicaNaSajtu(telo.stranica, sajtovi);

    // 4. Upis u čekaonicu.
    const upis = await recordInboundInternal(ctx, {
      workspaceId,
      platform: "website",
      kind: "forma",
      externalId,
      authorPlatformId: autor,
      authorHandleHash: autor,
      text: telo.poruka && telo.poruka.length > 0 ? telo.poruka : undefined,
      occurredAt: now,
      sourceUrl: stranica ?? undefined,
      forma: {
        kontakt: bezPraznih({ ime: telo.ime, email, telefon, firma: telo.firma }) ?? {},
        utm: bezPraznih(telo.utm),
        eventId: telo.eventId,
        ingestTokenId: args.tokenId,
        zabranjen: zabrana.suppressed,
      },
    });
    if (upis.status === "vec_postoji") {
      return { id: upis.inboundId, duplikat: true, capi: false };
    }
    const red = await ctx.db.get(upis.inboundId);

    // 5. CAPI „Lead“ (F17): samo uz saglasnost, bez zabrane i kad projekat
    //    ima i piksel i CAPI token. Lead je upisan u svakom slučaju.
    const smeCapi =
      red !== null &&
      red.status !== "zabranjen_kontakt" &&
      telo.saglasnost?.marketing === true &&
      podesavanja.pikselId.vrednost !== null &&
      (await stanjeTajne(ctx, workspaceId, "meta_capi_token")).postavljeno;
    if (!smeCapi) return { id: upis.inboundId, duplikat: false, capi: false };

    const hashedEmail = email ? await hashEmail(email) : "";
    const hashedPhone = telefon ? await hashPhone(telefon) : "";
    const capiId = await upisiCapiDogadjaj(ctx, {
      workspaceId,
      eventName: "Lead",
      eventTime: Math.floor(now / 1000),
      eventId: telo.eventId ?? `web_${upis.inboundId}`,
      actionSource: "website",
      sourceKind: "website_lead",
      hashedEmail: hashedEmail || undefined,
      hashedPhone: hashedPhone || undefined,
      clientIpAddress: telo.klijent?.ip ?? args.ipZahteva,
      clientUserAgent: telo.klijent?.userAgent ?? args.userAgentZahteva,
      fbp: telo.klijent?.fbp,
      fbc: telo.klijent?.fbc,
      eventSourceUrl: stranica ?? undefined,
    });
    if (capiId === null) return { id: upis.inboundId, duplikat: false, capi: false };

    await ctx.scheduler.runAfter(0, internal.metaCapi.sendPendingCapiEventsAction, {
      workspaceId,
    });
    return { id: upis.inboundId, duplikat: false, capi: true };
  },
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

function corsZaglavlja(origin: string): Record<string, string> {
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/** `OPTIONS /projekti/lead`: dozvola za svaki ispravan `https://` origin (F16). */
export function preflightLeadaSaSajta(request: Request): Response {
  const origin = ispravanHttpsOrigin(request.headers.get("origin"));
  if (origin === null) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      ...corsZaglavlja(origin),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}

async function kapa(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  route: string,
  limit: number,
): Promise<{ ok: true } | { ok: false; sekundi: number }> {
  const ok: boolean = await ctx.runMutation(internal.publicRouteLimit.claimRouteCall, {
    workspaceId,
    route,
    limit,
    windowMs: ROUTE_WINDOW_MS,
  });
  if (ok) return { ok: true };
  const ms: number = await ctx.runQuery(internal.publicRouteLimit.preostaloProzora, {
    workspaceId,
    route,
    sada: Date.now(),
  });
  return { ok: false, sekundi: Math.max(1, Math.ceil(ms / 1000)) };
}

/** `POST /projekti/lead`. */
export async function primiLeadSaSajtaHttp(ctx: ActionCtx, request: Request): Promise<Response> {
  // 1. Oblik zahteva, pre ičega drugog.
  const tip = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!tip.includes("application/json")) {
    return ingestOdgovor({ greska: "telo mora biti application/json" }, 415);
  }
  const najavljeno = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(najavljeno) && najavljeno > LEAD_SAJT_MAX_BAJTOVA) {
    return ingestOdgovor({ greska: "telo je preveliko" }, 413);
  }
  let tekst: string;
  try {
    tekst = await request.text();
  } catch {
    return ingestOdgovor({ greska: "telo se ne može pročitati" }, 400);
  }
  if (new TextEncoder().encode(tekst).length > LEAD_SAJT_MAX_BAJTOVA) {
    return ingestOdgovor({ greska: "telo je preveliko" }, 413);
  }

  // 2. Token. „Nema“, „nepoznat“ i „opozvan“ su isti odgovor.
  const token = tokenIzZaglavlja(request);
  const red = token === null ? null : await nadjiToken(ctx, token);
  if (red === null) return ingestOdgovor({ greska: "neispravan token" }, 401);

  // 3. Namena: token za uvoz ne prima formu (i obrnuto, u rutama uvoza).
  if (red.namena !== "sajt") {
    return ingestOdgovor({ greska: "token nije za formu na sajtu" }, 403);
  }

  // 4. Izvor: zahtev iz pregledača mora doći sa sajta projekta. Bez `Origin`
  //    (server–server) prolazi. Odbijeno = pre ikakvog upisa, bez CORS-a.
  const origin = request.headers.get("origin");
  let cors: Record<string, string> = {};
  if (origin !== null) {
    const podesavanja = await podesavanjaZaAkciju(ctx, red.workspaceId);
    const dozvoljen = dozvoljenOrigin(origin, podesavanja.sajtovi.vrednost ?? []);
    if (dozvoljen === null) return ingestOdgovor({ greska: "nedozvoljen izvor" }, 403);
    cors = corsZaglavlja(dozvoljen);
  }

  // 5. Kape: prvo po tokenu, pa po projektu. Troše se pre parsiranja tela.
  for (const [route, limit] of [
    [`projekti-lead:${red.tokenId}`, PROJEKTI_LEAD_PO_TOKENU_HOURLY_CAP],
    ["projekti-lead", PROJEKTI_LEAD_HOURLY_CAP],
  ] as const) {
    const k = await kapa(ctx, red.workspaceId, route, limit);
    if (!k.ok) {
      return ingestOdgovor({ greska: "previše zahteva" }, 429, {
        ...cors,
        "Retry-After": String(k.sekundi),
      });
    }
  }

  // 6. Telo.
  let sirovo: unknown;
  try {
    sirovo = JSON.parse(tekst);
  } catch {
    return ingestOdgovor({ greska: "neispravno telo", polja: ["(koren tela): nije_json"] }, 422, cors);
  }
  const parsed = leadSajtSchema.safeParse(sirovo);
  if (!parsed.success) {
    const bezKontakta = parsed.error.issues.some((i) => i.message === PORUKA_EMAIL_ILI_TELEFON);
    return ingestOdgovor(
      {
        greska: bezKontakta ? PORUKA_EMAIL_ILI_TELEFON : "neispravno telo",
        polja: greskeValidacije(parsed.error),
      },
      422,
      cors,
    );
  }

  // 7. Upis. Podaci posetioca iz zahteva samo kad je zahtev iz pregledača.
  const rezultat = await ctx.runMutation(internal.leadSajt.primiLeadSaSajta, {
    workspaceId: red.workspaceId,
    tokenId: red.tokenId,
    telo: parsed.data,
    ipZahteva: origin !== null ? extractClientIp(request) : undefined,
    userAgentZahteva:
      origin !== null ? request.headers.get("user-agent")?.slice(0, 400) || undefined : undefined,
  });

  // 8. Poslednja upotreba tokena (spisak u Podešavanjima).
  await ctx.runMutation(internal.ingestTokensStore.markTokenUsed, { tokenId: red.tokenId });

  return ingestOdgovor({ ok: true, id: rezultat.id, duplikat: rezultat.duplikat }, 200, cors);
}
