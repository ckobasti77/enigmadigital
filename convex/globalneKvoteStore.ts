import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  dostupno,
  obnovaGoogleAds,
  obnovaYoutube,
  pacifickiDan,
  plafonGoogleAds,
  plafonYoutube,
  pocetakProzoraGoogleAds,
  porukaGoogleAds,
  porukaYoutube,
  smeDaPotrosi,
  utcSat,
  deoProjekta,
  brojProjekata,
  type KlasaYoutube,
} from "./lib/globalneKvote";
import {
  ROLLING_WINDOW_MS,
  calculateRollingQuota,
  getGoogleAdsDailyLimit,
} from "./lib/googleAdsQuota";
import { BACKOFF_MIN_MS, nextBackoffMs } from "./lib/metaRateLimit";
import { QUOTA_SOFT_LIMIT } from "./lib/ytQuota";

/**
 * ============================================================================
 * ZAJEDNIČKE KVOTE (PROJEKTI-PLAN §9, plan C10 §6.3) — samo interne funkcije
 * ============================================================================
 *
 * Jedino mesto koje upisuje `globalneKvote` i, za YouTube i Google Ads, brojač
 * projekta u istoj transakciji. Rezervacija je jedna mutacija: globalni red,
 * red projekta i broj projekata čitaju se i upisuju zajedno, pa dva projekta
 * koja istovremeno rezervišu ne mogu oba da prođu preko plafona (OCC
 * serijalizuje upis u isti globalni red).
 *
 * Redosled kod svakog poziva API-ja: `rezervisi` PRE poziva, `vrati` kad poziv
 * nije ni stigao do Google-a. Tako dva projekta ne mogu da prođu proveru pa
 * tek posle poziva zajedno pređu plafon.
 * ============================================================================
 */

type Db = QueryCtx["db"];

const kljucValidator = v.union(v.literal("youtube"), v.literal("google_ads"));
const klasaValidator = v.union(
  v.literal("odgovori"),
  v.literal("izmene"),
  v.literal("upload"),
  v.literal("operacije"),
);
const razlogValidator = v.union(v.literal("globalno"), v.literal("rezerva_drugih"));

const rezultatValidator = v.object({
  ok: v.boolean(),
  razlog: v.optional(razlogValidator),
  /** Rečenica za korisnika kad `ok` nije tačno. */
  poruka: v.optional(v.string()),
  /** Kad se bazen obnavlja (ms). */
  obnovaU: v.number(),
  /** Zagarantovan deo ovog projekta. */
  R: v.number(),
});

export type RezultatRezervacije = {
  ok: boolean;
  razlog?: "globalno" | "rezerva_drugih";
  poruka?: string;
  obnovaU: number;
  R: number;
};

export type StanjeKvote = {
  /** Plafon klase. */
  Z: number;
  /** Zagarantovan deo projekta (`floor(Z / N)`). */
  R: number;
  /** Broj aktivnih projekata sa tom vezom (najmanje 1). */
  N: number;
  /** Svi projekti zajedno u prozoru. */
  ukupno: number;
  /** Ovaj projekat u prozoru. */
  projekat: number;
  /** Koliko projekat još sme da potroši (formula rezerve). */
  dostupno: number;
  obnovaU: number;
};

// ── aktivni projekti ─────────────────────────────────────────────────────────

/**
 * Projekti koji dele bazen: aktivna veza tog provajdera (status nije
 * `disconnecting`) u projektu koji nije arhiviran. Projekat koji pita je uvek
 * u spisku, i kad mu veza upravo prelazi u prekid.
 */
async function projektiSaVezom(
  db: Db,
  provider: "youtube" | "google_ads",
  workspaceId: Id<"workspaces">,
): Promise<Id<"workspaces">[]> {
  const veze = await db
    .query("connections")
    .withIndex("by_provider", (q) => q.eq("provider", provider))
    .collect();
  const ostali = new Set<Id<"workspaces">>();
  for (const c of veze) {
    if (c.status === "disconnecting" || c.workspaceId === workspaceId) continue;
    ostali.add(c.workspaceId);
  }
  const aktivni: Id<"workspaces">[] = [];
  for (const id of ostali) {
    const ws = await db.get(id);
    if (ws !== null && ws.arhiviran !== true) aktivni.push(id);
  }
  return aktivni;
}

// ── YouTube ──────────────────────────────────────────────────────────────────

async function globalniYoutube(db: Db, dan: string): Promise<Doc<"globalneKvote"> | null> {
  return await db
    .query("globalneKvote")
    .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "youtube").eq("datum", dan))
    .first();
}

async function projekatYoutube(
  db: Db,
  workspaceId: Id<"workspaces">,
  dan: string,
): Promise<Doc<"ytQuotaUsage"> | null> {
  return await db
    .query("ytQuotaUsage")
    .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId).eq("date", dan))
    .first();
}

function brojac(klasa: KlasaYoutube) {
  return klasa === "upload"
    ? {
        globalno: (r: Doc<"globalneKvote"> | null) => r?.uploadi ?? 0,
        projekat: (r: Doc<"ytQuotaUsage"> | null) => r?.uploadsUsed ?? 0,
      }
    : {
        globalno: (r: Doc<"globalneKvote"> | null) => r?.jedinice ?? 0,
        projekat: (r: Doc<"ytQuotaUsage"> | null) => r?.unitsUsed ?? 0,
      };
}

type UlazBazena = {
  Z: number;
  ukupno: number;
  projekat: number;
  ostaliPotroseno: number[];
};

function izUlaza(u: UlazBazena, obnovaU: number): StanjeKvote {
  const N = brojProjekata(u.ostaliPotroseno);
  return {
    Z: u.Z,
    R: deoProjekta(u.Z, N),
    N,
    ukupno: u.ukupno,
    projekat: u.projekat,
    dostupno: dostupno(u),
    obnovaU,
  };
}

async function ulazYoutube(
  db: Db,
  workspaceId: Id<"workspaces">,
  klasa: KlasaYoutube,
  dan: string,
): Promise<UlazBazena> {
  const b = brojac(klasa);
  const ostaliPotroseno: number[] = [];
  for (const q of await projektiSaVezom(db, "youtube", workspaceId)) {
    ostaliPotroseno.push(b.projekat(await projekatYoutube(db, q, dan)));
  }
  return {
    Z: plafonYoutube(klasa),
    ukupno: b.globalno(await globalniYoutube(db, dan)),
    projekat: b.projekat(await projekatYoutube(db, workspaceId, dan)),
    ostaliPotroseno,
  };
}

/** Stanje YouTube klase za projekat, na dan `now` po pacifičkom vremenu. */
export async function stanjeYoutube(
  db: Db,
  workspaceId: Id<"workspaces">,
  klasa: KlasaYoutube,
  now: number,
): Promise<StanjeKvote> {
  const u = await ulazYoutube(db, workspaceId, klasa, pacifickiDan(now));
  return izUlaza(u, obnovaYoutube(now));
}

/**
 * Pomeri oba YouTube brojača (globalni i projekta) za `delta`, bez provere.
 * Negativan `delta` je povraćaj; brojač nikad ne pada ispod nule.
 */
async function pomeriYoutube(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  klasa: KlasaYoutube,
  delta: number,
  now: number,
): Promise<void> {
  if (delta === 0) return;
  const dan = pacifickiDan(now);
  const upload = klasa === "upload";

  const g = await globalniYoutube(ctx.db, dan);
  if (g === null) {
    if (delta > 0) {
      await ctx.db.insert("globalneKvote", {
        kljuc: "youtube",
        datum: dan,
        jedinice: upload ? 0 : delta,
        ...(upload ? { uploadi: delta } : {}),
        updatedAt: now,
      });
    }
  } else if (upload) {
    await ctx.db.patch(g._id, { uploadi: Math.max(0, (g.uploadi ?? 0) + delta), updatedAt: now });
  } else {
    await ctx.db.patch(g._id, { jedinice: Math.max(0, g.jedinice + delta), updatedAt: now });
  }

  const p = await projekatYoutube(ctx.db, workspaceId, dan);
  if (p === null) {
    if (delta > 0) {
      await ctx.db.insert("ytQuotaUsage", {
        workspaceId,
        date: dan,
        unitsUsed: upload ? 0 : delta,
        ...(upload ? { uploadsUsed: delta } : {}),
        updatedAt: now,
      });
    }
  } else if (upload) {
    await ctx.db.patch(p._id, { uploadsUsed: Math.max(0, (p.uploadsUsed ?? 0) + delta), updatedAt: now });
  } else {
    await ctx.db.patch(p._id, { unitsUsed: Math.max(0, p.unitsUsed + delta), updatedAt: now });
  }
}

/**
 * Rezerviši YouTube trošak u već otvorenoj transakciji (za mutacije kao
 * `ytIngest.ingestComment` i `ytUpload`, koje ne idu kroz `ctx.runMutation`).
 */
export async function rezervisiYoutube(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  klasa: KlasaYoutube,
  trosak: number,
): Promise<RezultatRezervacije> {
  const now = Date.now();
  const u = await ulazYoutube(ctx.db, workspaceId, klasa, pacifickiDan(now));
  const R = deoProjekta(u.Z, brojProjekata(u.ostaliPotroseno));
  const obnovaU = obnovaYoutube(now);
  const ishod = smeDaPotrosi({ ...u, trosak });
  if (!ishod.ok) {
    return { ok: false, razlog: ishod.razlog, poruka: porukaYoutube(klasa, ishod.razlog, R, obnovaU), obnovaU, R };
  }
  await pomeriYoutube(ctx, workspaceId, klasa, trosak, now);
  return { ok: true, obnovaU, R };
}

/** Povraćaj YouTube troška u već otvorenoj transakciji. */
export async function vratiYoutube(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  klasa: KlasaYoutube,
  trosak: number,
): Promise<void> {
  if (trosak <= 0) return;
  await pomeriYoutube(ctx, workspaceId, klasa, -trosak, Date.now());
}

// ── Google Ads ───────────────────────────────────────────────────────────────

/** Operacije projekta u klizećih 24 h, zbir svih njegovih `gadsQuota` redova. */
async function potrosnjaGoogleAdsProjekta(
  db: Db,
  workspaceId: Id<"workspaces">,
  now: number,
): Promise<number> {
  const redovi = await db
    .query("gadsQuota")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  let zbir = 0;
  for (const r of redovi) {
    zbir += calculateRollingQuota(r.operations ?? [], r.dailyLimit, now).consumed24h;
  }
  return zbir;
}

async function satiGoogleAds(db: Db, now: number): Promise<Doc<"globalneKvote">[]> {
  return await db
    .query("globalneKvote")
    .withIndex("by_kljuc_datum", (q) =>
      q.eq("kljuc", "google_ads").gte("datum", pocetakProzoraGoogleAds(now)),
    )
    .collect();
}

async function ulazGoogleAds(
  db: Db,
  workspaceId: Id<"workspaces">,
  now: number,
): Promise<UlazBazena & { dnevniLimit: number; obnovaU: number }> {
  const { dailyLimit } = getGoogleAdsDailyLimit();
  const sati = await satiGoogleAds(db, now);
  const ostaliPotroseno: number[] = [];
  for (const q of await projektiSaVezom(db, "google_ads", workspaceId)) {
    ostaliPotroseno.push(await potrosnjaGoogleAdsProjekta(db, q, now));
  }
  const najstariji = sati.find((s) => s.jedinice > 0)?.datum ?? null;
  return {
    Z: plafonGoogleAds(dailyLimit),
    ukupno: sati.reduce((zbir, s) => zbir + s.jedinice, 0),
    projekat: await potrosnjaGoogleAdsProjekta(db, workspaceId, now),
    ostaliPotroseno,
    dnevniLimit: dailyLimit,
    obnovaU: obnovaGoogleAds(najstariji, now),
  };
}

/** Stanje Google Ads operacija za projekat (klizećih 24 h). */
export async function stanjeGoogleAds(
  db: Db,
  workspaceId: Id<"workspaces">,
  now: number,
): Promise<StanjeKvote & { dnevniLimit: number }> {
  const u = await ulazGoogleAds(db, workspaceId, now);
  return { ...izUlaza(u, u.obnovaU), dnevniLimit: u.dnevniLimit };
}

/**
 * Pomeri Google Ads brojače za `delta` operacija: sat u `globalneKvote` i red
 * projekta u `gadsQuota` (isti oblik koji je pisao `recordGadsOperations`).
 * Negativan `delta` (ispravka procene posle prolaza) skida sa najnovijih
 * unosa; ništa ne pada ispod nule.
 */
export async function pomeriGoogleAds(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  customerId: string | undefined,
  delta: number,
  now: number,
): Promise<void> {
  if (delta === 0) return;

  // 1. Globalni sat.
  if (delta > 0) {
    const sat = utcSat(now);
    const red = await ctx.db
      .query("globalneKvote")
      .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "google_ads").eq("datum", sat))
      .first();
    if (red === null) {
      await ctx.db.insert("globalneKvote", { kljuc: "google_ads", datum: sat, jedinice: delta, updatedAt: now });
    } else {
      await ctx.db.patch(red._id, { jedinice: red.jedinice + delta, updatedAt: now });
    }
  } else {
    let ostatak = -delta;
    const sati = (await satiGoogleAds(ctx.db, now)).reverse();
    for (const s of sati) {
      if (ostatak <= 0) break;
      const skini = Math.min(ostatak, s.jedinice);
      if (skini > 0) {
        await ctx.db.patch(s._id, { jedinice: s.jedinice - skini, updatedAt: now });
        ostatak -= skini;
      }
    }
  }

  // 2. Red projekta.
  let red: Doc<"gadsQuota"> | null = null;
  if (customerId) {
    red = await ctx.db
      .query("gadsQuota")
      .withIndex("by_workspace_customer", (q) =>
        q.eq("workspaceId", workspaceId).eq("customerId", customerId),
      )
      .first();
  }
  if (red === null) {
    red = await ctx.db
      .query("gadsQuota")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
  }
  const { level, dailyLimit } = getGoogleAdsDailyLimit();
  let ops = (red?.operations ?? []).filter((o) => o.timestamp >= now - ROLLING_WINDOW_MS);
  if (delta > 0) {
    ops = [...ops, { timestamp: now, count: delta }];
  } else {
    let ostatak = -delta;
    const novo = [...ops];
    for (let i = novo.length - 1; i >= 0 && ostatak > 0; i--) {
      const skini = Math.min(ostatak, novo[i].count);
      novo[i] = { ...novo[i], count: novo[i].count - skini };
      ostatak -= skini;
    }
    ops = novo.filter((o) => o.count > 0);
  }
  const limit = red?.dailyLimit ?? dailyLimit;
  const rolling = calculateRollingQuota(ops, limit, now);
  const podaci = {
    workspaceId,
    customerId: red?.customerId ?? customerId,
    accessLevel: red?.accessLevel ?? level,
    dailyLimit: limit,
    consumed24h: rolling.consumed24h,
    remaining24h: rolling.remaining24h,
    peakPct: rolling.peakPct,
    state: rolling.state,
    operations: ops,
    lastCallAt: now,
    updatedAt: now,
  };
  if (red !== null) {
    await ctx.db.patch(red._id, podaci);
  } else if (delta > 0) {
    await ctx.db.insert("gadsQuota", podaci);
  }
}

// ── rezervacija ──────────────────────────────────────────────────────────────

/**
 * Rezerviši trošak zajedničke kvote: u jednoj transakciji čita globalni red,
 * red projekta i broj aktivnih projekata, primenjuje `smeDaPotrosi` i, ako sme,
 * uvećava oba brojača. Ne baca kad kvote nema: vraća razlog i rečenicu.
 */
export const rezervisi = internalMutation({
  args: {
    kljuc: kljucValidator,
    klasa: klasaValidator,
    workspaceId: v.id("workspaces"),
    trosak: v.number(),
    /** Samo Google Ads: red `gadsQuota` po nalogu. */
    customerId: v.optional(v.string()),
  },
  returns: rezultatValidator,
  handler: async (ctx, args): Promise<RezultatRezervacije> => {
    if (args.kljuc === "youtube") {
      if (args.klasa === "operacije") throw new Error("YouTube nema klasu „operacije“.");
      return await rezervisiYoutube(ctx, args.workspaceId, args.klasa, args.trosak);
    }
    const now = Date.now();
    const u = await ulazGoogleAds(ctx.db, args.workspaceId, now);
    const R = deoProjekta(u.Z, brojProjekata(u.ostaliPotroseno));
    const ishod = smeDaPotrosi({ ...u, trosak: args.trosak });
    if (!ishod.ok) {
      return {
        ok: false,
        razlog: ishod.razlog,
        poruka: porukaGoogleAds(ishod.razlog, R, u.obnovaU),
        obnovaU: u.obnovaU,
        R,
      };
    }
    await pomeriGoogleAds(ctx, args.workspaceId, args.customerId, args.trosak, now);
    return { ok: true, obnovaU: u.obnovaU, R };
  },
});

/**
 * Vrati rezervisan trošak oba brojača — samo kad poziv nije ni stigao do
 * Google-a (npr. mreža pala pre zahteva, upload odbijen pre slanja).
 */
export const vrati = internalMutation({
  args: {
    kljuc: kljucValidator,
    klasa: klasaValidator,
    workspaceId: v.id("workspaces"),
    trosak: v.number(),
    customerId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.trosak <= 0) return null;
    if (args.kljuc === "youtube") {
      if (args.klasa === "operacije") return null;
      await vratiYoutube(ctx, args.workspaceId, args.klasa, args.trosak);
      return null;
    }
    await pomeriGoogleAds(ctx, args.workspaceId, args.customerId, -args.trosak, Date.now());
    return null;
  },
});

/**
 * Ispravka Google Ads brojača posle prolaza: stvarni broj upita minus
 * rezervisana procena (može biti i negativna). Upisuje i globalni sat i red
 * projekta, bez provere — operacije su već potrošene.
 */
export const ispraviGoogleAds = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    customerId: v.optional(v.string()),
    delta: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pomeriGoogleAds(ctx, args.workspaceId, args.customerId, args.delta, Date.now());
    return null;
  },
});

/**
 * YouTube je rekao `quotaExceeded`: budžet Google Cloud projekta je potrošen
 * za sve projekte. Globalni brojač se diže na plafon odgovora, pa staje svaki
 * projekat do pacifičke ponoći. Brojač projekta ostaje stvarna potrošnja.
 */
export const zatvoriYoutubeDan = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const dan = pacifickiDan(now);
    const g = await globalniYoutube(ctx.db, dan);
    if (g === null) {
      await ctx.db.insert("globalneKvote", { kljuc: "youtube", datum: dan, jedinice: QUOTA_SOFT_LIMIT, updatedAt: now });
    } else if (g.jedinice < QUOTA_SOFT_LIMIT) {
      await ctx.db.patch(g._id, { jedinice: QUOTA_SOFT_LIMIT, updatedAt: now });
    }
    return null;
  },
});

const stanjeValidator = v.object({
  Z: v.number(),
  R: v.number(),
  N: v.number(),
  ukupno: v.number(),
  projekat: v.number(),
  dostupno: v.number(),
  obnovaU: v.number(),
});

/** Stanje kvote za projekat (cron prolazi i ekrani). */
export const stanje = internalQuery({
  args: {
    kljuc: kljucValidator,
    klasa: klasaValidator,
    workspaceId: v.id("workspaces"),
  },
  returns: stanjeValidator,
  handler: async (ctx, args): Promise<StanjeKvote> => {
    const now = Date.now();
    if (args.kljuc === "youtube") {
      const klasa: KlasaYoutube = args.klasa === "operacije" ? "odgovori" : args.klasa;
      return await stanjeYoutube(ctx.db, args.workspaceId, klasa, now);
    }
    const s = await stanjeGoogleAds(ctx.db, args.workspaceId, now);
    return {
      Z: s.Z,
      R: s.R,
      N: s.N,
      ukupno: s.ukupno,
      projekat: s.projekat,
      dostupno: s.dostupno,
      obnovaU: s.obnovaU,
    };
  },
});

// ── Meta aplikacija (E17: procenat se ne deli) ───────────────────────────────

const META_DATUM = "tekuce";

export async function metaAppRed(db: Db): Promise<Doc<"globalneKvote"> | null> {
  return await db
    .query("globalneKvote")
    .withIndex("by_kljuc_datum", (q) => q.eq("kljuc", "meta_app").eq("datum", META_DATUM))
    .first();
}

/**
 * Upiši deo `X-App-Usage` jednog prolaza i, kod odbijanja sa kodom 4 (limit
 * cele aplikacije), globalno prigušenje. Isto pravilo kao `metaSyncStore.
 * recordUsage`: procenti se zamenjuju najnovijim očitavanjem, čist prolaz
 * gasi isteklo prigušenje, a odbijanje udvostručuje čekanje.
 */
export const zabeleziMetaApp = internalMutation({
  args: {
    callCount: v.number(),
    cpuTime: v.number(),
    totalTime: v.number(),
    throttled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { callCount, cpuTime, totalTime, throttled }) => {
    const now = Date.now();
    const red = await metaAppRed(ctx.db);
    if (red === null) {
      await ctx.db.insert("globalneKvote", {
        kljuc: "meta_app",
        datum: META_DATUM,
        jedinice: 0,
        callCount,
        cpuTime,
        totalTime,
        updatedAt: now,
        ...(throttled ? { backoffMs: BACKOFF_MIN_MS, backoffUntil: now + BACKOFF_MIN_MS } : {}),
      });
      return null;
    }
    if (!throttled) {
      const isteklo = red.backoffUntil !== undefined && red.backoffUntil <= now;
      await ctx.db.patch(red._id, {
        callCount,
        cpuTime,
        totalTime,
        updatedAt: now,
        ...(isteklo ? { backoffUntil: undefined, backoffMs: undefined } : {}),
      });
      return null;
    }
    const korak = nextBackoffMs(red.backoffMs);
    await ctx.db.patch(red._id, {
      callCount,
      cpuTime,
      totalTime,
      updatedAt: now,
      backoffMs: korak,
      backoffUntil: now + korak,
    });
    return null;
  },
});

/**
 * `app_id_util_pct` iz `X-FB-Ads-Insights-Throttle`: procenat cele aplikacije,
 * pa ide u globalni red, ne u red projekta. Zove ga `metaAdsStore.recordQuota`
 * u svojoj transakciji.
 */
export async function upisiUvidiAppPct(
  ctx: MutationCtx,
  pct: number,
  at: number,
): Promise<void> {
  const red = await metaAppRed(ctx.db);
  if (red === null) {
    await ctx.db.insert("globalneKvote", {
      kljuc: "meta_app",
      datum: META_DATUM,
      jedinice: 0,
      uvidiAppPct: pct,
      uvidiAt: at,
      updatedAt: at,
    });
    return;
  }
  await ctx.db.patch(red._id, { uvidiAppPct: pct, uvidiAt: at });
}

// ── čišćenje ─────────────────────────────────────────────────────────────────

const DAN_MS = 24 * 60 * 60 * 1000;
const PO_POZIVU = 500;

/** Cron: YouTube redovi stariji od 3 dana, Google Ads sati stariji od 48 h. */
export const ocisti = internalMutation({
  args: {},
  returns: v.object({ obrisano: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    let obrisano = 0;
    const yt = await ctx.db
      .query("globalneKvote")
      .withIndex("by_kljuc_datum", (q) =>
        q.eq("kljuc", "youtube").lt("datum", pacifickiDan(now - 3 * DAN_MS)),
      )
      .take(PO_POZIVU);
    const gads = await ctx.db
      .query("globalneKvote")
      .withIndex("by_kljuc_datum", (q) =>
        q.eq("kljuc", "google_ads").lt("datum", utcSat(now - 2 * DAN_MS)),
      )
      .take(PO_POZIVU);
    for (const r of [...yt, ...gads]) {
      await ctx.db.delete(r._id);
      obrisano++;
    }
    return { obrisano };
  },
});
