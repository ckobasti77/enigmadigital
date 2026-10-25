import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { jeVlasnikPlatforme, projekatMutation, projekatQuery } from "./lib/projekat";
import {
  MAKS_DOMENA,
  MOZAK_POLJA,
  SLIKA_SVEZA_MS,
  proveriDomen,
  proveriModule,
  proveriMozakPolje,
  proveriSajtove,
  proveriSliku,
  type VrstaSlike,
} from "./lib/podesavanjaPravila";

/**
 * ============================================================================
 * PODEŠAVANJA PROJEKTA (PROJEKTI-PLAN §8, plan C10 §1.3)
 * ============================================================================
 *
 * Sajtovi, moduli, mozak projekta, domeni panela i slike brenda (logo,
 * ikonica). Ime, kratko ime, boja i vrsta su u `projekti.azurirajProjekat`.
 * Integracije sajta, budžetske granice i tajne dodaje C12.
 *
 * Menja samo vlasnik projekta (`uloga: "owner"`); domene menja samo vlasnik
 * platforme. Pravila polja su u `lib/podesavanjaPravila.ts`, ista kao na
 * frontu. Nijedna funkcija ne vraća tajnu (tajne ovde i ne postoje).
 * ============================================================================
 */

function nevazece(poruka: string): never {
  throw new ConvexError({ code: "invalid", message: poruka });
}

async function projekatIliGreska(
  ctx: { db: QueryCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<Doc<"workspaces">> {
  const ws = await ctx.db.get(workspaceId);
  if (ws === null) {
    throw new ConvexError({ code: "not_found", message: "Projekat nije pronađen." });
  }
  return ws;
}

const tekstIliNull = v.union(v.string(), v.null());

const mozakOdgovor = v.object({
  ponuda: tekstIliNull,
  icpOpis: tekstIliNull,
  ton: tekstIliNull,
  zabrane: tekstIliNull,
  skripte: tekstIliNull,
});

function mozakZaOdgovor(ws: Doc<"workspaces">) {
  const m = ws.mozak ?? {};
  return {
    ponuda: m.ponuda ?? null,
    icpOpis: m.icpOpis ?? null,
    ton: m.ton ?? null,
    zabrane: m.zabrane ?? null,
    skripte: m.skripte ?? null,
  };
}

/**
 * Sve što vlasnik uređuje u jezičku „Projekat“ i „Mozak“ (osim polja koja već
 * daje `mojProjekat`). Domeni idu redom dodavanja; prvi je primarni.
 */
export const procitaj = projekatQuery({
  uloga: "owner",
  args: {},
  returns: v.object({
    sajtovi: v.array(v.string()),
    moduli: v.union(v.array(v.string()), v.null()),
    mozak: mozakOdgovor,
    domeni: v.array(
      v.object({
        domenId: v.id("projekatDomeni"),
        host: v.string(),
        primarni: v.boolean(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const domeni = await ctx.db
      .query("projekatDomeni")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id))
      .take(MAKS_DOMENA * 2);
    return {
      sajtovi: ws.sajtovi ?? [],
      moduli: ws.moduli ?? null,
      mozak: mozakZaOdgovor(ws),
      domeni: domeni.map((d, i) => ({
        domenId: d._id,
        host: d.host,
        primarni: i === 0,
        createdAt: d.createdAt,
      })),
    };
  },
});

/** Mozak projekta za čitanje (urednik i posmatrač ga vide, ne menjaju). */
export const mozak = projekatQuery({
  args: {},
  returns: mozakOdgovor,
  handler: async (ctx) =>
    mozakZaOdgovor(await projekatIliGreska(ctx, ctx.projekat.workspaceId)),
});

// ── Slike brenda ────────────────────────────────────────────────────────────

/** Adresa za otpremanje loga ili ikonice (vlasnik). */
export const uploadUrlBrenda = projekatMutation({
  uloga: "owner",
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

const POLJE: Record<VrstaSlike, "logoStorageId" | "faviconStorageId"> = {
  logo: "logoStorageId",
  favicon: "faviconStorageId",
};

/** Da li neki projekat (uključujući ovaj) već koristi fajl kao logo ili ikonicu. */
async function fajlVecKoristi(
  ctx: { db: QueryCtx["db"] },
  storageId: Id<"_storage">,
): Promise<Doc<"workspaces"> | null> {
  const kaoLogo = await ctx.db
    .query("workspaces")
    .withIndex("by_logo", (q) => q.eq("brend.logoStorageId", storageId))
    .first();
  if (kaoLogo !== null) return kaoLogo;
  return await ctx.db
    .query("workspaces")
    .withIndex("by_favicon", (q) => q.eq("brend.faviconStorageId", storageId))
    .first();
}

/**
 * Postavi ili ukloni logo/ikonicu (plan C10 E12). Prihvata se samo fajl koji:
 *  - je slika dozvoljenog tipa i veličine (bez SVG-a);
 *  - je otpremljen u poslednjih 10 minuta;
 *  - nije logo ni ikonica nijednog projekta.
 * Tako vlasnik ne može da „pozajmi“ (pa posle zamenom obriše) tuđ fajl čiji
 * ID zna. Odbijen fajl se ne briše: možda nije naš. Stari fajl istog polja se
 * briše posle uspešne zamene; `null` uklanja sliku i briše fajl.
 */
export const postaviSlikuBrenda = projekatMutation({
  uloga: "owner",
  args: {
    vrsta: v.union(v.literal("logo"), v.literal("favicon")),
    storageId: v.union(v.id("_storage"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { vrsta, storageId }) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const polje = POLJE[vrsta];
    const staro = ws.brend?.[polje];
    if (storageId !== null && storageId === staro) return null;

    if (storageId !== null) {
      const meta = await ctx.db.system.get("_storage", storageId);
      if (meta === null) nevazece("Fajl nije pronađen. Otpremi sliku ponovo.");
      const provera = proveriSliku(vrsta, meta);
      if (!provera.ok) nevazece(provera.poruka);
      if (meta._creationTime < Date.now() - SLIKA_SVEZA_MS) {
        nevazece("Otpremanje je isteklo. Izaberi sliku ponovo.");
      }
      if ((await fajlVecKoristi(ctx, storageId)) !== null) {
        nevazece("Ova slika je već u upotrebi. Otpremi novu.");
      }
    }

    const brend = { ...(ws.brend ?? {}) };
    if (storageId === null) delete brend[polje];
    else brend[polje] = storageId;
    await ctx.db.patch(ws._id, { brend });
    if (staro !== undefined) await ctx.storage.delete(staro);
    return null;
  },
});

// ── Sajtovi, moduli, mozak ──────────────────────────────────────────────────

/** Praćeni domeni sajta (zamenjuje ceo spisak). */
export const sacuvajSajtove = projekatMutation({
  uloga: "owner",
  args: { sajtovi: v.array(v.string()) },
  returns: v.null(),
  handler: async (ctx, { sajtovi }) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const p = proveriSajtove(sajtovi);
    if (!p.ok) nevazece(p.poruka);
    await ctx.db.patch(ws._id, { sajtovi: p.vrednost.length > 0 ? p.vrednost : undefined });
    return null;
  },
});

/** Uključeni moduli; `null` = svi. */
export const sacuvajModule = projekatMutation({
  uloga: "owner",
  args: { moduli: v.union(v.array(v.string()), v.null()) },
  returns: v.null(),
  handler: async (ctx, { moduli }) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const p = proveriModule(moduli);
    if (!p.ok) nevazece(p.poruka);
    await ctx.db.patch(ws._id, { moduli: p.vrednost ?? undefined });
    return null;
  },
});

/** Mozak projekta (P15). Polje koje nije poslato ostaje; `null` ili prazno briše. */
export const sacuvajMozak = projekatMutation({
  uloga: "owner",
  args: {
    ponuda: v.optional(tekstIliNull),
    icpOpis: v.optional(tekstIliNull),
    ton: v.optional(tekstIliNull),
    zabrane: v.optional(tekstIliNull),
    skripte: v.optional(tekstIliNull),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const mozak: NonNullable<Doc<"workspaces">["mozak"]> = { ...(ws.mozak ?? {}) };
    for (const polje of MOZAK_POLJA) {
      const ulaz = args[polje];
      if (ulaz === undefined) continue;
      const p = proveriMozakPolje(ulaz);
      if (!p.ok) nevazece(p.poruka);
      if (p.vrednost === null) delete mozak[polje];
      else mozak[polje] = p.vrednost;
    }
    await ctx.db.patch(ws._id, {
      mozak: Object.keys(mozak).length > 0 ? mozak : undefined,
    });
    return null;
  },
});

// ── Domeni panela (samo vlasnik platforme) ──────────────────────────────────

async function vlasnikPlatformeIliGreska(
  ctx: Parameters<typeof jeVlasnikPlatforme>[0],
  userId: Id<"users">,
): Promise<void> {
  if (!(await jeVlasnikPlatforme(ctx, userId))) {
    throw new ConvexError({
      code: "forbidden",
      message: "Domene panela menja samo vlasnik platforme.",
    });
  }
}

/**
 * Domen na kome se otvara panel ovog projekta. Jedan host = jedan projekat.
 * Proxy pamti mapu 60 s, pa izmena stiže sa toliko zakašnjenja.
 */
export const dodajDomen = projekatMutation({
  uloga: "owner",
  args: { host: v.string() },
  returns: v.id("projekatDomeni"),
  handler: async (ctx, { host }) => {
    await vlasnikPlatformeIliGreska(ctx, ctx.projekat.userId);
    const p = proveriDomen(host);
    if (!p.ok) nevazece(p.poruka);
    const postojeci = await ctx.db
      .query("projekatDomeni")
      .withIndex("by_host", (q) => q.eq("host", p.vrednost))
      .first();
    if (postojeci !== null) {
      throw new ConvexError({
        code: "conflict",
        message:
          postojeci.workspaceId === ctx.projekat.workspaceId
            ? "Ovaj domen je već dodat."
            : "Taj domen je već dodeljen drugom projektu.",
      });
    }
    const svoji = await ctx.db
      .query("projekatDomeni")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.projekat.workspaceId))
      .take(MAKS_DOMENA);
    if (svoji.length >= MAKS_DOMENA) {
      nevazece(`Projekat može imati najviše ${MAKS_DOMENA} domena.`);
    }
    return await ctx.db.insert("projekatDomeni", {
      host: p.vrednost,
      workspaceId: ctx.projekat.workspaceId,
      createdAt: Date.now(),
      createdBy: ctx.projekat.userId,
    });
  },
});

export const ukloniDomen = projekatMutation({
  uloga: "owner",
  args: { domenId: v.id("projekatDomeni") },
  returns: v.null(),
  handler: async (ctx, { domenId }) => {
    await vlasnikPlatformeIliGreska(ctx, ctx.projekat.userId);
    const domen = await ctx.db.get(domenId);
    if (domen === null || domen.workspaceId !== ctx.projekat.workspaceId) {
      throw new ConvexError({ code: "not_found", message: "Domen nije pronađen." });
    }
    await ctx.db.delete(domenId);
    return null;
  },
});
