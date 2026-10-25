import { ConvexError, v } from "convex/values";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  clanstvoKorisnika,
  jeVlasnikPlatforme,
  platformaMutation,
  prijavljenQuery,
  projekatMutation,
} from "./lib/projekat";
import {
  jaValidator,
  projekatValidator,
  stavkaProjektaValidator,
  vrstaProjektaValidator,
} from "./lib/projekatPolja";
import { normalizujHost, proveriSlugProjekta } from "./lib/projekatSlug";
import { ulogaValidator, type Uloga } from "./lib/uloge";

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

const BOJA = /^#[0-9a-f]{6}$/;
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
    const ime = args.ime.trim();
    if (ime.length < 2 || ime.length > 60) {
      throw new ConvexError({
        code: "invalid",
        message: "Ime projekta mora imati od 2 do 60 znakova.",
      });
    }
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
 * platforme po P3. Domeni, logo, podešavanja, moduli i mozak su C11/C12.
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
      const ime = args.ime.trim();
      if (ime.length < 2 || ime.length > 60) {
        throw new ConvexError({
          code: "invalid",
          message: "Ime projekta mora imati od 2 do 60 znakova.",
        });
      }
      izmena.name = ime;
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
        const kratko = args.kratkoIme?.trim() ?? "";
        if (kratko.length > 24) {
          throw new ConvexError({
            code: "invalid",
            message: "Kratko ime može imati najviše 24 znaka.",
          });
        }
        if (kratko.length === 0) delete brend.kratkoIme;
        else brend.kratkoIme = kratko;
      }
      if (args.boja !== undefined) {
        const boja = args.boja?.trim().toLowerCase() ?? "";
        if (boja.length === 0) delete brend.boja;
        else if (!BOJA.test(boja)) {
          throw new ConvexError({
            code: "invalid",
            message: "Boja mora biti u obliku #rrggbb.",
          });
        } else brend.boja = boja;
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
