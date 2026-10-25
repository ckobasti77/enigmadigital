import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { metaAppRed, stanjeGoogleAds, stanjeYoutube } from "./globalneKvoteStore";
import {
  brojSaKapom,
  nepoznato,
  zbirPotrosnje,
  zbirPratilaca,
  type Brojka,
  type UlazPratilaca,
} from "./lib/hubAgregati";
import { USAGE_STOP_PCT, USAGE_WARN_PCT } from "./lib/metaRateLimit";
import { modulUkljucen } from "./lib/moduli";
import { DAN, jeDanKljuc, lokalnoUEpohu } from "./lib/napredak";
import { projekatQuery } from "./lib/projekat";
import { providerValidator, type Provider } from "./lib/providers";
import { citajVezeProjekta, type VezaProjekta } from "./lib/vezeProjekta";
import { razlogZdravlja, zdravljeProjekta } from "./lib/zdravljeVeza";

/**
 * ============================================================================
 * HUB „SVI PROJEKTI“ — brojke jednog projekta (plan C15 §1–§2)
 * ============================================================================
 *
 * Jedan upit = jedan red huba. Hub ga zove posebno za svaki projekat (najviše
 * 20), pa svaki red ima svoju transakciju i svoju proveru članstva u omotaču
 * (odluka F1); pad jednog reda ne obara ekran.
 *
 * Sve se čita preko indeksa sa `workspaceId`, sa kapom za svaku kolonu.
 * Upit ne čita sat: `sada` šalje klijent, zaokruženo na minut.
 * Nepoznato je `null` sa razlogom, nikad 0 (`lib/hubAgregati.ts`).
 * ============================================================================
 */

/** Najduži period koji hub sme da traži. */
const MAKS_DANA_PERIODA = 366;
export const KAPA_LEADOVA = 2_000;
export const KAPA_UPITA = 500;
export const KAPA_UVIDA = 10_000;
export const KAPA_PORUKA = 500;
const MAKS_NALOGA = 50;

const razlogBrojkeValidator = v.union(
  v.literal("nije_povezano"),
  v.literal("nema_podataka"),
  v.literal("previse_podataka"),
  v.literal("vise_valuta"),
  v.literal("modul_iskljucen"),
);

const brojkaPolja = {
  vrednost: v.union(v.number(), v.null()),
  razlog: v.union(razlogBrojkeValidator, v.null()),
  vise: v.optional(v.boolean()),
};
const brojkaValidator = v.object(brojkaPolja);

const stanjeValidator = v.union(v.literal("ok"), v.literal("upozorenje"), v.literal("greska"));

const kvotaValidator = v.union(
  v.null(),
  v.object({
    stanje: stanjeValidator,
    /** `brojiva`: potrošeno od granice projekta; `procenat`: Meta aplikacija (0–100). */
    vrsta: v.union(v.literal("brojiva"), v.literal("procenat")),
    potroseno: v.number(),
    granica: v.number(),
  }),
);

const vezaValidator = v.object({
  provider: providerValidator,
  stanje: stanjeValidator,
  razlog: v.union(
    v.null(),
    v.literal("token_istekao"),
    v.literal("token_istice"),
    v.literal("greska_veze"),
    v.literal("pao_prolaz"),
    v.literal("zastao"),
    v.literal("stari_podaci"),
  ),
  za: v.optional(v.number()),
  lastSyncAt: v.union(v.number(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  greska: v.union(v.string(), v.null()),
  kvota: kvotaValidator,
});

export const pregledValidator = v.object({
  posete: brojkaValidator,
  noviLeadovi: brojkaValidator,
  upiti: brojkaValidator,
  pratioci: v.object({
    ...brojkaPolja,
    promena: v.union(v.number(), v.null()),
    kanali: v.array(
      v.object({
        kanal: v.union(v.literal("instagram"), v.literal("facebook"), v.literal("threads")),
        vrednost: v.union(v.number(), v.null()),
      }),
    ),
  }),
  oglasi: v.object({ ...brojkaPolja, valuta: v.union(v.string(), v.null()) }),
  poruke: brojkaValidator,
  zdravlje: v.union(
    v.literal("ok"),
    v.literal("upozorenje"),
    v.literal("greska"),
    v.literal("bez_veza"),
  ),
  veze: v.array(vezaValidator),
});

type Kvota = {
  stanje: "ok" | "upozorenje" | "greska";
  vrsta: "brojiva" | "procenat";
  potroseno: number;
  granica: number;
} | null;

const META_PROVAJDERI: ReadonlySet<Provider> = new Set(["meta_ig", "meta_fb", "meta_ads"]);

/**
 * Stanje kvote za jednu vezu (plan C15 §2.2, red „kvota“). Brojive kvote:
 * crveno kad projektu ne ostaje ništa, žuto ispod 10 % zagarantovanog dela.
 * Meta aplikacija: isti pragovi kao kapija (`USAGE_WARN_PCT`/`USAGE_STOP_PCT`).
 */
async function kvotaVeze(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
  provider: Provider,
  sada: number,
): Promise<Kvota> {
  if (provider === "youtube" || provider === "google_ads") {
    const s =
      provider === "youtube"
        ? await stanjeYoutube(ctx.db, workspaceId, "odgovori", sada)
        : await stanjeGoogleAds(ctx.db, workspaceId, sada);
    const stanje = s.dostupno <= 0 ? "greska" : s.dostupno < 0.1 * s.R ? "upozorenje" : "ok";
    return { stanje, vrsta: "brojiva", potroseno: s.projekat, granica: s.projekat + s.dostupno };
  }
  if (META_PROVAJDERI.has(provider)) {
    const red = await metaAppRed(ctx.db);
    if (red === null) return null;
    const pct = Math.max(red.callCount ?? 0, red.cpuTime ?? 0, red.totalTime ?? 0);
    const prigusen = red.backoffUntil !== undefined && red.backoffUntil > sada;
    const stanje =
      prigusen || pct >= USAGE_STOP_PCT ? "greska" : pct >= USAGE_WARN_PCT ? "upozorenje" : "ok";
    return { stanje, vrsta: "procenat", potroseno: pct, granica: 100 };
  }
  return null;
}

function povezan(veze: readonly VezaProjekta[], provider: Provider): boolean {
  return veze.some((veza) => veza.provider === provider);
}

/** Zbir `sessions` iz `ga4Daily` za period (uključive granice). */
async function posete(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
  od: string,
  doDana: string,
  veze: readonly VezaProjekta[],
): Promise<Brojka> {
  if (!povezan(veze, "ga4")) return nepoznato("nije_povezano");
  const redovi = await ctx.db
    .query("ga4Daily")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).gte("date", od).lte("date", doDana),
    )
    .take(MAKS_DANA_PERIODA + 1);
  if (redovi.length === 0) return nepoznato("nema_podataka");
  return { vrednost: redovi.reduce((z, r) => z + r.sessions, 0), razlog: null };
}

/** Poslednji poznat ukupan broj do kraja perioda i prvi od početka perioda. */
async function pratiociKanala(
  ctx: Pick<QueryCtx, "db">,
  kanal: "instagram" | "facebook" | "threads",
  workspaceId: Id<"workspaces">,
  od: string,
  doDana: string,
): Promise<{ kraj: number | null; pocetak: number | null }> {
  const broj = (n: number | undefined): number | null =>
    typeof n === "number" && Number.isFinite(n) ? n : null;

  if (kanal === "instagram") {
    const kraj = await ctx.db
      .query("igAccountDaily")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId).lte("date", doDana))
      .order("desc")
      .first();
    const pocetak = await ctx.db
      .query("igAccountDaily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", od).lte("date", doDana),
      )
      .first();
    return { kraj: broj(kraj?.followersCount), pocetak: broj(pocetak?.followersCount) };
  }
  if (kanal === "facebook") {
    const kraj = await ctx.db
      .query("fbPageDaily")
      .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId).lte("date", doDana))
      .order("desc")
      .first();
    const pocetak = await ctx.db
      .query("fbPageDaily")
      .withIndex("by_workspace_date", (q) =>
        q.eq("workspaceId", workspaceId).gte("date", od).lte("date", doDana),
      )
      .first();
    return { kraj: broj(kraj?.fans), pocetak: broj(pocetak?.fans) };
  }
  const kraj = await ctx.db
    .query("threadsFollowerSnapshots")
    .withIndex("by_workspace_date", (q) => q.eq("workspaceId", workspaceId).lte("date", doDana))
    .order("desc")
    .first();
  const pocetak = await ctx.db
    .query("threadsFollowerSnapshots")
    .withIndex("by_workspace_date", (q) =>
      q.eq("workspaceId", workspaceId).gte("date", od).lte("date", doDana),
    )
    .first();
  return { kraj: broj(kraj?.followersCount), pocetak: broj(pocetak?.followersCount) };
}

/**
 * Brojke jednog projekta za izabrani period. Uloga: svaki član (CV).
 * `od`/`do` su beogradski dani „YYYY-MM-DD“ (uključivo).
 */
export const pregledProjekta = projekatQuery({
  args: { od: v.string(), do: v.string(), sada: v.number() },
  returns: pregledValidator,
  handler: async (ctx, args) => {
    const { workspaceId, sada } = args;
    const od = args.od;
    const doDana = args.do;
    if (!jeDanKljuc(od) || !jeDanKljuc(doDana) || od > doDana) {
      throw new ConvexError("Neispravan period.");
    }
    const odMs = lokalnoUEpohu(od);
    const doMs = lokalnoUEpohu(doDana) + DAN;
    if (doMs - odMs > MAKS_DANA_PERIODA * DAN + 2 * 60 * 60 * 1000) {
      throw new ConvexError("Neispravan period.");
    }
    const ws = await ctx.db.get(workspaceId);
    if (ws === null) throw new ConvexError("Projekat ne postoji.");

    const veze = await citajVezeProjekta(ctx, workspaceId);

    // ── leadovi i upiti (po `_creationTime`, u beogradskim danima) ──────────
    let noviLeadovi: Brojka;
    let upiti: Brojka;
    if (!modulUkljucen(ws.moduli, "leadovi")) {
      noviLeadovi = nepoznato("modul_iskljucen");
      upiti = nepoznato("modul_iskljucen");
    } else {
      const firme = await ctx.db
        .query("leadCompanies")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", workspaceId).gte("_creationTime", odMs).lt("_creationTime", doMs),
        )
        .take(KAPA_LEADOVA + 1);
      noviLeadovi = brojSaKapom(firme.length, KAPA_LEADOVA);
      const prijemi = await ctx.db
        .query("leadInbound")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", workspaceId).gte("_creationTime", odMs).lt("_creationTime", doMs),
        )
        .take(KAPA_UPITA + 1);
      upiti = brojSaKapom(prijemi.length, KAPA_UPITA);
    }

    // ── pratioci (odluka F4) ─────────────────────────────────────────────────
    const ulazPratilaca: UlazPratilaca[] = [];
    for (const [kanal, provider] of [
      ["instagram", "meta_ig"],
      ["facebook", "meta_fb"],
      ["threads", "threads"],
    ] as const) {
      if (!povezan(veze, provider)) {
        ulazPratilaca.push({ kanal, povezan: false, kraj: null, pocetak: null });
        continue;
      }
      const { kraj, pocetak } = await pratiociKanala(ctx, kanal, workspaceId, od, doDana);
      ulazPratilaca.push({ kanal, povezan: true, kraj, pocetak });
    }

    // ── oglasi (odluka F5) ───────────────────────────────────────────────────
    const nalozi = await ctx.db
      .query("adAccounts")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(MAKS_NALOGA);
    let oglasi;
    if (nalozi.length === 0) {
      oglasi = zbirPotrosnje({ valute: [], redovi: [], kapaPredjena: false });
    } else {
      const redovi = await ctx.db
        .query("adInsights")
        .withIndex("by_workspace_date", (q) =>
          q.eq("workspaceId", workspaceId).gte("date", od).lte("date", doDana),
        )
        .take(KAPA_UVIDA + 1);
      oglasi = zbirPotrosnje({
        valute: nalozi.map((n) => n.currency),
        redovi: redovi.slice(0, KAPA_UVIDA),
        kapaPredjena: redovi.length > KAPA_UVIDA,
      });
    }

    // ── neodgovorene poruke · sada (odluka F3) ──────────────────────────────
    let poruke: Brojka;
    if (!povezan(veze, "meta_ig") && !povezan(veze, "meta_fb")) {
      poruke = nepoznato("nije_povezano");
    } else {
      const razgovori = await ctx.db
        .query("orConversations")
        .withIndex("by_workspace_updated", (q) => q.eq("workspaceId", workspaceId))
        .order("desc")
        .take(KAPA_PORUKA + 1);
      const neodgovoreni = razgovori
        .slice(0, KAPA_PORUKA)
        .filter((r) => (r.unreadCount ?? 0) > 0).length;
      poruke =
        razgovori.length > KAPA_PORUKA
          ? { vrednost: neodgovoreni, razlog: null, vise: true }
          : { vrednost: neodgovoreni, razlog: null };
    }

    // ── veze i zdravlje (plan C15 §2) ───────────────────────────────────────
    const vezeOut = [];
    for (const veza of veze) {
      const z = razlogZdravlja(veza, sada);
      vezeOut.push({
        provider: veza.provider,
        stanje: z.stanje,
        razlog: z.razlog,
        ...(z.za !== undefined ? { za: z.za } : {}),
        lastSyncAt: veza.lastSyncAt ?? null,
        expiresAt: veza.expiresAt ?? null,
        greska: veza.greska,
        kvota: await kvotaVeze(ctx, workspaceId, veza.provider, sada),
      });
    }

    return {
      posete: await posete(ctx, workspaceId, od, doDana, veze),
      noviLeadovi,
      upiti,
      pratioci: zbirPratilaca(ulazPratilaca),
      oglasi,
      poruke,
      zdravlje: zdravljeProjekta(veze, sada),
      veze: vezeOut,
    };
  },
});
