import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { izracunajStaMeCeka } from "./notificationsStore";
import {
  clanstvoKorisnika,
  jeVlasnikPlatforme,
  platformaMutation,
  platformaQuery,
  prijavljenQuery,
  projekatMutation,
} from "./lib/projekat";
import { proveriBoju, proveriIme, proveriKratkoIme } from "./lib/podesavanjaPravila";
import {
  jaValidator,
  projekatValidator,
  stavkaProjektaValidator,
  vrstaProjektaValidator,
} from "./lib/projekatPolja";
import { normalizujHost, proveriSlugProjekta } from "./lib/projekatSlug";
import { ulogaValidator, type Uloga } from "./lib/uloge";
import { zdravljeProjekta, type VezaZaZdravlje } from "./lib/zdravljeVeza";

/**
 * ============================================================================
 * API PROJEKATA (PROJEKTI-PLAN §5–§7, plan C02 §3)
 * ============================================================================
 *
 * Projekat = red u `workspaces` (P1). Front iz ovih funkcija zna koji su
 * korisnikovi projekti i u kom je trenutno; sve ostale funkcije nad podacima
 * projekta primaju `workspaceId` kroz omotače iz `lib/projekat.ts`.
 *
 * Backend nikad ne bira „prvi projekat“ umesto pozivaoca: `mojProjekat` traži
 * slug, a slug daje ruta `[projekat]` (u hubu putanja, u panelu domen).
 * ============================================================================
 */

const MAKS_CLANSTAVA = 100;

async function urlFajla(
  ctx: QueryCtx,
  storageId: Id<"_storage"> | undefined,
): Promise<string | null> {
  if (storageId === undefined) return null;
  return await ctx.storage.getUrl(storageId);
}

async function uStavku(ctx: QueryCtx, ws: Doc<"workspaces">, uloga: Uloga) {
  return {
    workspaceId: ws._id,
    slug: ws.slug,
    ime: ws.name,
    kratkoIme: ws.brend?.kratkoIme ?? null,
    boja: ws.brend?.boja ?? null,
    logoUrl: await urlFajla(ctx, ws.brend?.logoStorageId),
    uloga,
    vrsta: ws.vrsta ?? ("interni" as const),
    arhiviran: ws.arhiviran === true,
    redosled: ws.redosled ?? null,
    moduli: ws.moduli ?? null,
  };
}

/**
 * Svi projekti prijavljenog korisnika, redom članstva (`by_user` indeks,
 * najstarije prvo). Čita ga hub „Svi projekti“.
 */
export const mojiProjekti = prijavljenQuery({
  args: {},
  returns: v.array(stavkaProjektaValidator),
  handler: async (ctx) => {
    const clanstva = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", ctx.korisnik.userId))
      .take(MAKS_CLANSTAVA);
    const out = [];
    for (const clan of clanstva) {
      const ws = await ctx.db.get(clan.workspaceId);
      if (ws === null) continue;
      out.push(await uStavku(ctx, ws, clan.role));
    }
    return out;
  },
});

/**
 * Projekat sa datom adresom, ako je pozivalac njegov član; inače `null` —
 * isti odgovor za „ne postoji“ i „nisi član“, da se ne otkriva šta postoji.
 * Slug nije bio jedinstven u istoriji (vidi `auth.ts`), pa se uzima prvi red
 * u kome je pozivalac član, najstariji prvo.
 */
export const mojProjekat = prijavljenQuery({
  args: { slug: v.string() },
  returns: v.union(v.null(), projekatValidator),
  handler: async (ctx, { slug }) => {
    const userId = ctx.korisnik.userId;
    const kandidati = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .take(10);
    for (const ws of kandidati) {
      const clan = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", userId).eq("workspaceId", ws._id),
        )
        .first();
      if (clan === null) continue;
      const user = await ctx.db.get(userId);
      return {
        workspaceId: ws._id,
        slug: ws.slug,
        ime: ws.name,
        kratkoIme: ws.brend?.kratkoIme ?? null,
        boja: ws.brend?.boja ?? null,
        logoUrl: await urlFajla(ctx, ws.brend?.logoStorageId),
        faviconUrl: await urlFajla(ctx, ws.brend?.faviconStorageId),
        vrsta: ws.vrsta ?? ("interni" as const),
        moduli: ws.moduli ?? null,
        sajtovi: ws.sajtovi ?? [],
        uloga: clan.role,
        korisnik: {
          id: userId,
          email: user?.email ?? null,
          ime: user?.name ?? null,
        },
        platformaVlasnik: await jeVlasnikPlatforme(ctx, userId),
      };
    }
    return null;
  },
});

/** Prijavljen korisnik bez projekta: hub i meni korisnika. */
export const ja = prijavljenQuery({
  args: {},
  returns: jaValidator,
  handler: async (ctx) => {
    const userId = ctx.korisnik.userId;
    const user = await ctx.db.get(userId);
    return {
      id: userId,
      email: user?.email ?? null,
      ime: user?.name ?? null,
      platformaVlasnik: await jeVlasnikPlatforme(ctx, userId),
    };
  },
});

/** Birač projekta računa stanje za najviše ovoliko projekata (plan C02 §8.3). */
export const MAKS_STANJA_PROJEKATA = 20;
/**
 * Budžet čitanja za „šta me čeka“ svih projekata zajedno, deljen na jednake
 * delove. Granica jedne transakcije je 32.000 dokumenata i 4.096 opsega
 * indeksa; ostatak ostaje za članstva, veze i prolaze. Projekat koji svoj deo
 * prekorači dobija `ceka: null` („—“), umesto da obori ceo upit.
 */
const BUDZET_DOKUMENATA = 24_000;
const BUDZET_UPITA = 2_400;
const MAKS_VEZA = 50;

const zdravljeValidator = v.union(
  v.literal("ok"),
  v.literal("upozorenje"),
  v.literal("greska"),
  v.literal("bez_veza"),
);

/**
 * Stanje projekata za birač: tačka stanja veza i broj „šta me čeka“, za
 * najviše 20 projekata prijavljenog korisnika (redom članstva, kao
 * `mojiProjekti`). Čita samo projekte u kojima je pozivalac član.
 *
 * Vreme stiže od klijenta (upit ne čita sat). Preko 20 projekata `ceka` je
 * `null` za sve, a stanje veza se daje za prvih 20; projekat bez reda u
 * odgovoru birač crta kao nepoznat.
 */
export const stanjeProjekata = prijavljenQuery({
  args: { sada: v.number(), pomerajMin: v.optional(v.number()) },
  returns: v.array(
    v.object({
      workspaceId: v.id("workspaces"),
      zdravlje: zdravljeValidator,
      ceka: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { sada, pomerajMin }) => {
    const userId = ctx.korisnik.userId;
    const clanstva = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAKS_STANJA_PROJEKATA + 1);
    const previse = clanstva.length > MAKS_STANJA_PROJEKATA;
    const obradi = clanstva.slice(0, MAKS_STANJA_PROJEKATA);
    const deo = Math.max(1, obradi.length);

    const out = [];
    for (const clan of obradi) {
      const workspaceId = clan.workspaceId;
      if ((await ctx.db.get(workspaceId)) === null) continue;

      const veze = await ctx.db
        .query("connections")
        .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId))
        .take(MAKS_VEZA);
      const zaZdravlje: VezaZaZdravlje[] = [];
      for (const veza of veze) {
        if (veza.status === "disconnecting") continue;
        const prolaz = await ctx.db
          .query("syncRuns")
          .withIndex("by_workspace_provider", (q) =>
            q.eq("workspaceId", workspaceId).eq("provider", veza.provider),
          )
          .order("desc")
          .first();
        zaZdravlje.push({
          status: veza.status,
          expiresAt: veza.expiresAt,
          lastSyncAt: veza.lastSyncAt,
          poslednjiProlaz:
            prolaz === null
              ? null
              : { status: prolaz.status, startedAt: prolaz.startedAt, finishedAt: prolaz.finishedAt },
        });
      }

      let ceka: number | null = null;
      if (!previse) {
        try {
          // Tip je napisan ručno: poziv funkcije iz istog fajla bi inače
          // napravio kružni tip (guidelines, „Function calling“).
          const broj: number = await ctx.runQuery(
            internal.projekti.cekaProjekta,
            { workspaceId, userId, sada, pomerajMin },
            {
              transactionLimits: {
                documentsRead: Math.floor(BUDZET_DOKUMENATA / deo),
                databaseQueries: Math.floor(BUDZET_UPITA / deo),
              },
            },
          );
          ceka = broj;
        } catch {
          // Prekoračen deo budžeta (ili pad čitanja): broj nije poznat.
          ceka = null;
        }
      }

      out.push({ workspaceId, zdravlje: zdravljeProjekta(zaZdravlje, sada), ceka });
    }
    return out;
  },
});

/**
 * Broj „šta me čeka“ jednog projekta za `stanjeProjekata` (isti pomoćnik kao
 * zvono). Interna: članstvo je pozivalac već proverio — projekat dolazi iz
 * njegovog spiska članstava, a `userId` iz prijave.
 */
export const cekaProjekta = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    sada: v.number(),
    pomerajMin: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => (await izracunajStaMeCeka(ctx, args)).ukupno,
});

// javno: proxy razrešava domen pre prijave; vraća samo slug projekta za taj host
export const razresiDomen = query({
  args: { host: v.string() },
  returns: v.union(v.null(), v.object({ slug: v.string() })),
  handler: async (ctx, { host }) => {
    const h = normalizujHost(host);
    if (h === null) return null;
    const red = await ctx.db
      .query("projekatDomeni")
      .withIndex("by_host", (q) => q.eq("host", h))
      .first();
    if (red === null) return null;
    const ws = await ctx.db.get(red.workspaceId);
    if (ws === null || ws.arhiviran === true) return null;
    return { slug: ws.slug };
  },
});

/**
 * Brend panel domena za ekran prijave (plan C10 §2.2, E11). Vraća samo ime,
 * boju i logo, i to samo za host mapiran na projekat (ne arhiviran): to je
 * ono što taj domen i inače pokazuje svakom posetiocu. Slug, ID, ikonica i
 * podešavanja ne izlaze, a nemapiran host ne otkriva ništa.
 */
// javno: ekran prijave na panel domenu; samo ime, boja i logo mapiranog hosta
export const javniBrend = query({
  args: { host: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ime: v.string(),
      boja: v.union(v.string(), v.null()),
      logoUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { host }) => {
    const h = normalizujHost(host);
    if (h === null) return null;
    const red = await ctx.db
      .query("projekatDomeni")
      .withIndex("by_host", (q) => q.eq("host", h))
      .first();
    if (red === null) return null;
    const ws = await ctx.db.get(red.workspaceId);
    if (ws === null || ws.arhiviran === true) return null;
    return {
      ime: ws.name,
      boja: ws.brend?.boja ?? null,
      logoUrl: await urlFajla(ctx, ws.brend?.logoStorageId),
    };
  },
});

/**
 * Da li je adresa slobodna za novi projekat (čarobnjak, uživo dok se kuca).
 * Samo vlasnik platforme, isto kao `kreirajProjekat`.
 */
export const proveriSlug = platformaQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), poruka: v.string() }),
  ),
  handler: async (ctx, args) => {
    const slug = args.slug.trim().toLowerCase();
    const provera = proveriSlugProjekta(slug);
    if (!provera.ok) return { ok: false as const, poruka: provera.razlog };
    const zauzet = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (zauzet !== null) {
      return { ok: false as const, poruka: "Ova adresa projekta je zauzeta." };
    }
    return { ok: true as const };
  },
});

/**
 * Novi projekat (samo vlasnik platforme, P3). Adresa prolazi P8 i mora biti
 * slobodna; kreator postaje `owner`. Šablon ICP-a i ostala podešavanja nisu
 * ovde (C11, C14).
 */
export const kreirajProjekat = platformaMutation({
  args: {
    ime: v.string(),
    slug: v.string(),
    vrsta: v.optional(vrstaProjektaValidator),
  },
  returns: v.object({ workspaceId: v.id("workspaces"), slug: v.string() }),
  handler: async (ctx, args) => {
    const imeP = proveriIme(args.ime);
    if (!imeP.ok) throw new ConvexError({ code: "invalid", message: imeP.poruka });
    const ime = imeP.vrednost;
    const slug = args.slug.trim().toLowerCase();
    const provera = proveriSlugProjekta(slug);
    if (!provera.ok) {
      throw new ConvexError({ code: "invalid", message: provera.razlog });
    }
    const zauzet = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (zauzet !== null) {
      throw new ConvexError({
        code: "conflict",
        message: "Ova adresa projekta je zauzeta.",
      });
    }
    const userId = ctx.korisnik.userId;
    const postojeca = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(MAKS_CLANSTAVA);
    const workspaceId = await ctx.db.insert("workspaces", {
      name: ime,
      slug,
      vrsta: args.vrsta ?? "interni",
      createdBy: userId,
      redosled: postojeca.length,
    });
    await ctx.db.insert("members", { workspaceId, userId, role: "owner" });
    return { workspaceId, slug };
  },
});

/**
 * Osnovni podaci projekta (vlasnik projekta). Adresa (slug) se ne menja.
 * `null` briše vrednost. Vrstu menja samo vlasnik platforme: inače bi vlasnik
 * klijentskog projekta mogao da ga proglasi internim i postane vlasnik
 * platforme po P3. Logo, ikonica, sajtovi, moduli, mozak i domeni su u
 * `podesavanjaStore.ts`; podešavanja sajta i budžeta dodaje C12.
 */
export const azurirajProjekat = projekatMutation({
  uloga: "owner",
  args: {
    ime: v.optional(v.string()),
    kratkoIme: v.optional(v.union(v.string(), v.null())),
    boja: v.optional(v.union(v.string(), v.null())),
    vrsta: v.optional(vrstaProjektaValidator),
    redosled: v.optional(v.number()),
    arhiviran: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ws = await ctx.db.get(ctx.projekat.workspaceId);
    if (ws === null) {
      throw new ConvexError({ code: "not_found", message: "Projekat nije pronađen." });
    }
    const izmena: Partial<Doc<"workspaces">> = {};

    if (args.ime !== undefined) {
      const p = proveriIme(args.ime);
      if (!p.ok) throw new ConvexError({ code: "invalid", message: p.poruka });
      izmena.name = p.vrednost;
    }

    if (args.vrsta !== undefined && args.vrsta !== (ws.vrsta ?? "interni")) {
      if (!(await jeVlasnikPlatforme(ctx, ctx.projekat.userId))) {
        throw new ConvexError({
          code: "forbidden",
          message: "Vrstu projekta može da promeni samo vlasnik platforme.",
        });
      }
      izmena.vrsta = args.vrsta;
    }

    if (args.redosled !== undefined) izmena.redosled = args.redosled;
    if (args.arhiviran !== undefined) izmena.arhiviran = args.arhiviran;

    if (args.kratkoIme !== undefined || args.boja !== undefined) {
      const brend = { ...(ws.brend ?? {}) };
      if (args.kratkoIme !== undefined) {
        const p = proveriKratkoIme(args.kratkoIme);
        if (!p.ok) throw new ConvexError({ code: "invalid", message: p.poruka });
        if (p.vrednost === null) delete brend.kratkoIme;
        else brend.kratkoIme = p.vrednost;
      }
      if (args.boja !== undefined) {
        const p = proveriBoju(args.boja);
        if (!p.ok) throw new ConvexError({ code: "invalid", message: p.poruka });
        if (p.vrednost === null) delete brend.boja;
        else brend.boja = p.vrednost;
      }
      izmena.brend = brend;
    }

    if (Object.keys(izmena).length > 0) {
      await ctx.db.patch(ws._id, izmena);
    }
    return null;
  },
});

/**
 * Članstvo za `projekatAction` (akcija nema `ctx.db`). Interna: `userId`
 * dolazi iz prijave koju je akcija već proverila.
 */
export const clanstvoZaAkciju = internalQuery({
  args: {
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    minimalna: ulogaValidator,
  },
  returns: v.object({
    userId: v.id("users"),
    workspaceId: v.id("workspaces"),
    uloga: ulogaValidator,
  }),
  handler: async (ctx, { userId, workspaceId, minimalna }) =>
    await clanstvoKorisnika(ctx, userId, workspaceId, minimalna),
});
