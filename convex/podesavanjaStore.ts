import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { encryptCredentials } from "./lib/crypto";
import { jeVlasnikPlatforme, projekatMutation, projekatQuery } from "./lib/projekat";
import { kljucTajneValidator } from "./lib/projekatPolja";
import {
  adresaPanela as adresaPanelaProjekta,
  granicaBudzetaValidator,
  graniceBudzeta,
  osnivackiProjekatId,
  podesavanjaProjekta,
  podesavanjaProjektaValidator,
  redTajne,
  stanjeTajne,
  stanjeTajneValidator,
} from "./lib/podesavanja";
import {
  MAKS_DOMENA,
  MOZAK_POLJA,
  SLIKA_SVEZA_MS,
  proveriAdresuNaSajtu,
  proveriBudzet,
  proveriDomen,
  proveriKratkiLinkoviBaza,
  proveriModule,
  proveriMozakPolje,
  proveriPikselId,
  proveriPosiljalacIme,
  proveriSajtove,
  proveriSliku,
  proveriTajnu,
  type KljucTajne,
  type Provera,
  type VrstaSlike,
} from "./lib/podesavanjaPravila";

/**
 * ============================================================================
 * PODEŠAVANJA PROJEKTA (PROJEKTI-PLAN §8, plan C10 §1.3)
 * ============================================================================
 *
 * Sajtovi, moduli, mozak projekta, domeni panela, slike brenda (logo,
 * ikonica), integracije sajta, budžetske granice i tajne projekta. Ime,
 * kratko ime, boja i vrsta su u `projekti.azurirajProjekat`.
 *
 * Menja samo vlasnik projekta (`uloga: "owner"`); domene menja samo vlasnik
 * platforme. Pravila polja su u `lib/podesavanjaPravila.ts`, ista kao na
 * frontu. Tajne se samo upisuju i brišu: nijedna javna funkcija ne vraća ni
 * tekst ni šifrat, samo „postavljeno: da/ne“. Šifrat čita samo interni
 * `tajnaZaAkciju`, a tekst postoji samo u memoriji akcije.
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

const KLJUCEVI_TAJNI: readonly KljucTajne[] = [
  "meta_capi_token",
  "novosti_revalidate_secret",
  "puls_token",
];

async function domeniProjekta(ctx: { db: QueryCtx["db"] }, workspaceId: Id<"workspaces">) {
  return await ctx.db
    .query("projekatDomeni")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(MAKS_DOMENA * 2);
}

/**
 * Sve što vlasnik uređuje u jezičcima „Projekat“, „Sajt i oglasi“ i „Mozak“
 * (osim polja koja već daje `mojProjekat`). Domeni idu redom dodavanja; prvi
 * je primarni. Podešavanje nosi izvor (projekat, env osnivačkog projekta ili
 * „nije podešeno“), a tajna samo da li postoji.
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
    jeOsnivacki: v.boolean(),
    podesavanja: podesavanjaProjektaValidator.omit("jeOsnivacki", "capiTestKod"),
    tajne: v.object({
      meta_capi_token: stanjeTajneValidator,
      novosti_revalidate_secret: stanjeTajneValidator,
      puls_token: stanjeTajneValidator,
    }),
  }),
  handler: async (ctx) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const domeni = await domeniProjekta(ctx, ws._id);
    const p = await podesavanjaProjekta(ctx, ws._id);
    const [capi, novosti, puls] = await Promise.all(
      KLJUCEVI_TAJNI.map((k) => stanjeTajne(ctx, ws._id, k)),
    );
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
      jeOsnivacki: p.jeOsnivacki,
      // Kod testnog događaja se ne prikazuje (E7): važi samo za osnivački piksel.
      podesavanja: {
        sajtovi: p.sajtovi,
        pikselId: p.pikselId,
        kratkiLinkoviBaza: p.kratkiLinkoviBaza,
        novostiRevalidateUrl: p.novostiRevalidateUrl,
        pulsUrl: p.pulsUrl,
        posiljalacIme: p.posiljalacIme,
        budzet: p.budzet,
      },
      tajne: { meta_capi_token: capi, novosti_revalidate_secret: novosti, puls_token: puls },
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

// ── Integracije sajta (C12) ─────────────────────────────────────────────────

/** Polje koje nije poslato ostaje; `null` ili prazno briše vrednost projekta. */
export const sacuvajIntegracijeSajta = projekatMutation({
  uloga: "owner",
  args: {
    pikselId: v.optional(tekstIliNull),
    kratkiLinkoviBaza: v.optional(tekstIliNull),
    novostiRevalidateUrl: v.optional(tekstIliNull),
    pulsUrl: v.optional(tekstIliNull),
    posiljalacIme: v.optional(tekstIliNull),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const domeni = (await domeniProjekta(ctx, ws._id)).map((d) => d.host);
    // Adrese sajta se proveravaju protiv sajtova koji zaista važe (za
    // osnivački projekat bez svojih sajtova to su praćeni domeni iz env-a).
    const sajtovi = (await podesavanjaProjekta(ctx, ws._id)).sajtovi.vrednost ?? [];
    const pravila: Record<
      "pikselId" | "kratkiLinkoviBaza" | "novostiRevalidateUrl" | "pulsUrl" | "posiljalacIme",
      (ulaz: string | null) => Provera<string | null>
    > = {
      pikselId: proveriPikselId,
      kratkiLinkoviBaza: (u) => proveriKratkiLinkoviBaza(u, domeni),
      novostiRevalidateUrl: (u) => proveriAdresuNaSajtu(u, sajtovi),
      pulsUrl: (u) => proveriAdresuNaSajtu(u, sajtovi),
      posiljalacIme: proveriPosiljalacIme,
    };
    const podesavanja: NonNullable<Doc<"workspaces">["podesavanja"]> = {
      ...(ws.podesavanja ?? {}),
    };
    for (const polje of Object.keys(pravila) as (keyof typeof pravila)[]) {
      const ulaz = args[polje];
      if (ulaz === undefined) continue;
      const p = pravila[polje](ulaz);
      if (!p.ok) nevazece(p.poruka);
      if (p.vrednost === null) delete podesavanja[polje];
      else podesavanja[polje] = p.vrednost;
    }
    await ctx.db.patch(ws._id, {
      podesavanja: Object.keys(podesavanja).length > 0 ? podesavanja : undefined,
    });
    return null;
  },
});

// ── Budžetske granice (C12, E5) ─────────────────────────────────────────────

const iznosUlaz = v.optional(v.union(v.number(), v.string(), v.null()));

/**
 * Ceo blok granica (zamenjuje sačuvani). Prazno polje znači „bez vrednosti
 * projekta“: za izmenu budžeta važi 5 / 5.000 / EUR, a bez gornje granice nove
 * kampanje pravljenje kampanje ostaje isključeno.
 */
export const sacuvajBudzet = projekatMutation({
  uloga: "owner",
  args: {
    minimum: iznosUlaz,
    maksimum: iznosUlaz,
    valuta: v.optional(tekstIliNull),
    metaMaksDnevno: iznosUlaz,
    googleMaksDnevno: iznosUlaz,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ws = await projekatIliGreska(ctx, ctx.projekat.workspaceId);
    const p = proveriBudzet(args);
    if (!p.ok) nevazece(p.poruka);
    const podesavanja: NonNullable<Doc<"workspaces">["podesavanja"]> = {
      ...(ws.podesavanja ?? {}),
    };
    if (Object.keys(p.vrednost).length > 0) podesavanja.budzet = p.vrednost;
    else delete podesavanja.budzet;
    await ctx.db.patch(ws._id, {
      podesavanja: Object.keys(podesavanja).length > 0 ? podesavanja : undefined,
    });
    return null;
  },
});

/**
 * Granice koje važe za ovaj projekat (dijalog promene budžeta, čarobnjak
 * kampanje). Bez tajni; čita svaki član.
 */
export const budzetProjekta = projekatQuery({
  args: {},
  returns: granicaBudzetaValidator,
  handler: async (ctx) =>
    graniceBudzeta((await podesavanjaProjekta(ctx, ctx.projekat.workspaceId)).budzet),
});

// ── Tajne projekta (C12) ────────────────────────────────────────────────────

/**
 * Upiše ili zameni tajnu. Vrednost se šifruje pre upisa i nikad se ne vraća,
 * ni u odgovoru ni u poruci greške.
 */
export const postaviTajnu = projekatMutation({
  uloga: "owner",
  args: { kljuc: kljucTajneValidator, vrednost: v.string() },
  returns: v.null(),
  handler: async (ctx, { kljuc, vrednost }) => {
    const p = proveriTajnu(kljuc, vrednost);
    if (!p.ok) nevazece(p.poruka);
    const sifrovano = await encryptCredentials(p.vrednost);
    const { workspaceId, userId } = ctx.projekat;
    const red = await redTajne(ctx.db, workspaceId, kljuc);
    if (red !== null) {
      await ctx.db.patch(red._id, { sifrovano, updatedAt: Date.now(), updatedBy: userId });
    } else {
      await ctx.db.insert("projekatTajne", {
        workspaceId,
        kljuc,
        sifrovano,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    }
    return null;
  },
});

/** Obriše tajnu projekta (osnivački projekat posle toga opet nasleđuje env). */
export const obrisiTajnu = projekatMutation({
  uloga: "owner",
  args: { kljuc: kljucTajneValidator },
  returns: v.null(),
  handler: async (ctx, { kljuc }) => {
    const red = await redTajne(ctx.db, ctx.projekat.workspaceId, kljuc);
    if (red !== null) await ctx.db.delete(red._id);
    return null;
  },
});

// ── Za akcije i HTTP rute (interno) ─────────────────────────────────────────

/** Razrešena podešavanja projekta, bez tajni (plan C10 §4.2). */
export const zaAkciju = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: podesavanjaProjektaValidator,
  handler: async (ctx, { workspaceId }) => await podesavanjaProjekta(ctx, workspaceId),
});

/**
 * Šifrat tajne za akciju (`podesavanjaAkcija.procitajTajnu` ga dešifruje), ili
 * znak da osnivački projekat bez svoje tajne uzima env. Nikad tekst.
 */
export const tajnaZaAkciju = internalQuery({
  args: { workspaceId: v.id("workspaces"), kljuc: kljucTajneValidator },
  returns: v.union(
    v.object({ sifrovano: v.string() }),
    v.object({ izEnva: v.literal(true) }),
    v.null(),
  ),
  handler: async (ctx, { workspaceId, kljuc }) => {
    const red = await redTajne(ctx.db, workspaceId, kljuc);
    if (red !== null) return { sifrovano: red.sifrovano };
    if ((await osnivackiProjekatId(ctx.db)) === workspaceId) return { izEnva: true as const };
    return null;
  },
});

/** Adresa panela za linkove koje pravi backend (plan C10 §4.4). */
export const adresaPanela = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { workspaceId }) => await adresaPanelaProjekta(ctx.db, workspaceId),
});

/**
 * Ime pošiljaoca i adresa panela za mejl pravila (E6): ime iz podešavanja
 * projekta (osnivački bez njega: ime iz `EMAIL_FROM`), inače ime projekta.
 */
export const zaMejl = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({ ime: v.string(), adresaPanela: v.union(v.string(), v.null()) }),
  handler: async (ctx, { workspaceId }) => {
    const ws = await ctx.db.get(workspaceId);
    const ime = (await podesavanjaProjekta(ctx, workspaceId)).posiljalacIme.vrednost;
    return {
      ime: ime ?? ws?.name ?? "Command Center",
      adresaPanela: await adresaPanelaProjekta(ctx.db, workspaceId),
    };
  },
});

/**
 * Mozak projekta za `GET /projekti/mozak` (C14, P15): samo pet polja mozga,
 * za projekat kome pripada ingest token. Ništa drugo iz projekta.
 */
export const mozakZaToken = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.union(mozakOdgovor, v.null()),
  handler: async (ctx, { workspaceId }) => {
    const ws = await ctx.db.get(workspaceId);
    return ws === null ? null : mozakZaOdgovor(ws);
  },
});
