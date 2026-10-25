import { ConvexError, v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { projekatMutation, projekatQuery, requireProjekat } from "./lib/projekat";
import { imaUlogu } from "./lib/uloge";
import { isSuppressed } from "./leadSuppressionStore";

/**
 * ============================================================================
 * UNAKRSNI LEADOVI (C17, P13, PROJEKTI-PLAN §10, plan C15 §4)
 * ============================================================================
 *
 * Firma iz jednog internog projekta može da postoji ili da odgovara drugom
 * internom projektu istog korisnika. Profil firme to pokazuje oznakom, a
 * urednik u oba projekta može da je kopira („Kopiraj u <projekat>“).
 *
 * PRAVILA (F12, F13):
 * - Samo interni, nearhivirani projekti u kojima je pozivalac ČLAN. Projekat
 *   u kome nije član se ne čita i ne pominje; klijentski projekti nikad ne
 *   učestvuju (ni kao izvor ni kao cilj).
 * - „Postoji“ = isti domen, telefon, ime + grad, ili je već kopirana (u bilo
 *   kom smeru). „Odgovara“ = firma ne postoji u cilju, a njena niša je
 *   ciljna niša cilja (isti slug).
 * - Bez automatskog spajanja: kopija je nova firma u cilju, sa poreklom
 *   (`kopijaIz` + `leadFieldProvenance`). CRM stanje se ne kopira.
 * - Sve kroz indekse sa `workspaceId`; nema prolaza kroz celu bazu.
 * ============================================================================
 */

/** Najviše projekata koje poređenje gleda (isto kao birač i hub). */
const MAX_PROJEKATA = 20;
const MAX_TELEFONA = 5;
const MAX_OSOBA = 20;
const MAX_IDENTITETA = 50;
const MAX_POREKLA = 200;

type Poklapanje = "domen" | "telefon" | "ime_grad" | "kopija" | "nisa";

type Kljucevi = {
  firma: Doc<"leadCompanies">;
  telefoni: string[];
  nisaSlug: string | null;
};

const jeInterni = (ws: Doc<"workspaces"> | null): ws is Doc<"workspaces"> =>
  ws !== null && (ws.vrsta ?? "interni") === "interni" && ws.arhiviran !== true;

async function kljuceviFirme(ctx: QueryCtx, firma: Doc<"leadCompanies">): Promise<Kljucevi> {
  const identiteti = await ctx.db
    .query("leadIdentities")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", firma.workspaceId).eq("companyId", firma._id),
    )
    .take(MAX_IDENTITETA);
  const telefoni: string[] = [];
  for (const i of identiteti) {
    if (i.kind !== "phone" || !i.valueNormalized) continue;
    if (!telefoni.includes(i.valueNormalized)) telefoni.push(i.valueNormalized);
    if (telefoni.length >= MAX_TELEFONA) break;
  }
  const nisa = firma.nicheId ? await ctx.db.get(firma.nicheId) : null;
  return {
    firma,
    telefoni,
    nisaSlug: nisa !== null && nisa.workspaceId === firma.workspaceId ? nisa.slug : null,
  };
}

/** Da li firma postoji u projektu `cilj`, i po čemu. */
async function postojiU(
  ctx: QueryCtx,
  cilj: Id<"workspaces">,
  k: Kljucevi,
): Promise<{ poklapanje: Poklapanje[]; companyId: Id<"leadCompanies"> | null }> {
  const poklapanje: Poklapanje[] = [];
  let companyId: Id<"leadCompanies"> | null = null;
  const pogodak = (vrsta: Poklapanje, id: Id<"leadCompanies">) => {
    if (!poklapanje.includes(vrsta)) poklapanje.push(vrsta);
    companyId ??= id;
  };
  const f = k.firma;

  if (f.domainNormalized) {
    const d = await ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace_domain", (q) =>
        q.eq("workspaceId", cilj).eq("domainNormalized", f.domainNormalized),
      )
      .first();
    if (d !== null) pogodak("domen", d._id);
  }
  for (const tel of k.telefoni) {
    const t = await ctx.db
      .query("leadIdentities")
      .withIndex("by_workspace_kind_value", (q) =>
        q.eq("workspaceId", cilj).eq("kind", "phone").eq("valueNormalized", tel),
      )
      .first();
    if (t !== null) {
      pogodak("telefon", t.companyId);
      break;
    }
  }
  const grad = f.city?.trim();
  if (grad) {
    const n = await ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace_name_city", (q) =>
        q.eq("workspaceId", cilj).eq("nameNormalized", f.nameNormalized).eq("city", grad),
      )
      .first();
    if (n !== null) pogodak("ime_grad", n._id);
  }
  // Već kopirana u cilj, ili je ova firma kopija firme iz cilja.
  const kopija = await ctx.db
    .query("leadCompanies")
    .withIndex("by_workspace_kopija", (q) =>
      q.eq("workspaceId", cilj).eq("kopijaIz.companyId", f._id),
    )
    .first();
  if (kopija !== null) pogodak("kopija", kopija._id);
  if (f.kopijaIz?.workspaceId === cilj) {
    const izvor = await ctx.db.get(f.kopijaIz.companyId);
    if (izvor !== null && izvor.workspaceId === cilj) pogodak("kopija", izvor._id);
  }
  return { poklapanje, companyId };
}

/** Ciljna niša istog sluga u projektu `cilj`, ili `null`. */
async function ciljnaNisaU(
  ctx: QueryCtx,
  cilj: Id<"workspaces">,
  slug: string | null,
): Promise<Doc<"niches"> | null> {
  if (slug === null) return null;
  const nisa = await ctx.db
    .query("niches")
    .withIndex("by_workspace_slug", (q) => q.eq("workspaceId", cilj).eq("slug", slug))
    .first();
  return nisa !== null && nisa.ciljna === true ? nisa : null;
}

const rezultatValidator = v.object({
  workspaceId: v.id("workspaces"),
  slug: v.string(),
  ime: v.string(),
  stanje: v.union(v.literal("postoji"), v.literal("odgovara")),
  companyId: v.union(v.id("leadCompanies"), v.null()),
  poklapanje: v.array(
    v.union(
      v.literal("domen"),
      v.literal("telefon"),
      v.literal("ime_grad"),
      v.literal("kopija"),
      v.literal("nisa"),
    ),
  ),
  /** Naziv ciljne niše u cilju (samo za „odgovara“). */
  nisa: v.union(v.string(), v.null()),
  mozeKopirati: v.boolean(),
});

export const uDrugimProjektima = projekatQuery({
  args: { companyId: v.id("leadCompanies") },
  returns: v.array(rezultatValidator),
  handler: async (ctx, args) => {
    const firma = await ctx.db.get(args.companyId);
    if (firma === null || firma.workspaceId !== args.workspaceId) {
      throw new ConvexError({ code: "not_found", message: "Firma nije pronađena." });
    }
    const izvor = await ctx.db.get(args.workspaceId);
    if (!jeInterni(izvor)) return [];

    const clanstva = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", ctx.projekat.userId))
      .take(MAX_PROJEKATA + 1);
    const k = await kljuceviFirme(ctx, firma);
    const mozeUIzvoru = imaUlogu(ctx.projekat.uloga, "urednik");

    const izlaz = [];
    const vidjeni = new Set<string>();
    for (const clan of clanstva.slice(0, MAX_PROJEKATA)) {
      if (clan.workspaceId === args.workspaceId || vidjeni.has(clan.workspaceId)) continue;
      vidjeni.add(clan.workspaceId);
      const cilj = await ctx.db.get(clan.workspaceId);
      if (!jeInterni(cilj)) continue;

      const p = await postojiU(ctx, cilj._id, k);
      if (p.poklapanje.length > 0) {
        izlaz.push({
          workspaceId: cilj._id,
          slug: cilj.slug,
          ime: cilj.name,
          stanje: "postoji" as const,
          companyId: p.companyId,
          poklapanje: p.poklapanje,
          nisa: null,
          mozeKopirati: false,
        });
        continue;
      }
      const nisa = await ciljnaNisaU(ctx, cilj._id, k.nisaSlug);
      if (nisa !== null) {
        izlaz.push({
          workspaceId: cilj._id,
          slug: cilj.slug,
          ime: cilj.name,
          stanje: "odgovara" as const,
          companyId: null,
          poklapanje: ["nisa" as const],
          nisa: nisa.naziv,
          mozeKopirati: mozeUIzvoru && imaUlogu(clan.role, "urednik"),
        });
      }
    }
    return izlaz;
  },
});

/** Polja firme koja se kopiraju (podaci o firmi, ne CRM stanje). */
function kopiranaPolja(f: Doc<"leadCompanies">) {
  return {
    name: f.name,
    nameNormalized: f.nameNormalized,
    pib: f.pib,
    maticniBroj: f.maticniBroj,
    sifraDelatnosti: f.sifraDelatnosti,
    website: f.website,
    domainNormalized: f.domainNormalized,
    companyWallUrl: f.companyWallUrl,
    placeId: f.placeId,
    street: f.street,
    municipality: f.municipality,
    city: f.city,
    addressNeedsVerification: f.addressNeedsVerification,
    lat: f.lat,
    lng: f.lng,
    koordinateIzvor: f.koordinateIzvor,
    koordinateAt: f.koordinateAt,
    imaSajt: f.imaSajt,
    imaSajtNapomena: f.imaSajtNapomena,
    sajtStatus: f.sajtStatus,
    sajtHttps: f.sajtHttps,
    sajtProverenAt: f.sajtProverenAt,
  };
}

export const kopirajUProjekat = projekatMutation({
  args: { companyId: v.id("leadCompanies"), ciljWorkspaceId: v.id("workspaces") },
  returns: v.object({ companyId: v.id("leadCompanies"), slug: v.string() }),
  handler: async (ctx, args) => {
    const A = args.workspaceId;
    const firma = await ctx.db.get(args.companyId);
    if (firma === null || firma.workspaceId !== A) {
      throw new ConvexError({ code: "not_found", message: "Firma nije pronađena." });
    }
    const samoInterni = {
      code: "forbidden",
      message: "Kopiranje ide samo između internih projekata.",
    } as const;
    const izvor = await ctx.db.get(A);
    if (!jeInterni(izvor) || args.ciljWorkspaceId === A) throw new ConvexError(samoInterni);
    // Urednik i u cilju; nečlan dobija isti odgovor kao za tuđ projekat.
    await requireProjekat(ctx, args.ciljWorkspaceId, "urednik");
    const cilj = await ctx.db.get(args.ciljWorkspaceId);
    if (!jeInterni(cilj)) throw new ConvexError(samoInterni);
    const B = cilj._id;

    const k = await kljuceviFirme(ctx, firma);
    const p = await postojiU(ctx, B, k);
    if (p.poklapanje.length > 0) {
      throw new ConvexError({ code: "conflict", message: `Firma već postoji u ${cilj.name}.` });
    }

    const osobe = await ctx.db
      .query("leadPeople")
      .withIndex("by_workspace_company", (q) => q.eq("workspaceId", A).eq("companyId", firma._id))
      .take(MAX_OSOBA);
    const identiteti = await ctx.db
      .query("leadIdentities")
      .withIndex("by_workspace_company", (q) => q.eq("workspaceId", A).eq("companyId", firma._id))
      .take(MAX_IDENTITETA);

    // Lista zabrane CILJA: firma ili bilo koji njen kontakt.
    const proveri = async (o: { pib?: string; domain?: string; phone?: string; email?: string }) =>
      (await isSuppressed(ctx, { workspaceId: B, ...o })).suppressed;
    let zabranjeno = await proveri({ pib: firma.pib, domain: firma.domainNormalized });
    for (const i of identiteti) {
      if (zabranjeno) break;
      if (i.kind === "phone") zabranjeno = await proveri({ phone: i.value });
      else if (i.kind === "email") zabranjeno = await proveri({ email: i.value });
    }
    if (zabranjeno) {
      throw new ConvexError({
        code: "forbidden",
        message: `Firma je na listi zabrane u ${cilj.name}.`,
      });
    }

    const now = Date.now();
    const userId = ctx.projekat.userId;
    const nisaCilja =
      k.nisaSlug === null
        ? null
        : await ctx.db
            .query("niches")
            .withIndex("by_workspace_slug", (q) => q.eq("workspaceId", B).eq("slug", k.nisaSlug!))
            .first();

    const novaId = await ctx.db.insert("leadCompanies", {
      workspaceId: B,
      ...kopiranaPolja(firma),
      nicheId: nisaCilja?._id,
      origin: "import",
      firstSeenSource: "kopija_iz_projekta",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      kopijaIz: { workspaceId: A, companyId: firma._id, at: now, userId },
    });

    const noviId = new Map<string, string>([[String(firma._id), String(novaId)]]);
    const osobaId = new Map<string, Id<"leadPeople">>();
    for (const o of osobe) {
      const id = await ctx.db.insert("leadPeople", {
        workspaceId: B,
        companyId: novaId,
        name: o.name,
        role: o.role,
        roleConfidence: o.roleConfidence,
        createdAt: now,
      });
      osobaId.set(String(o._id), id);
      noviId.set(String(o._id), String(id));
    }
    // `createdBy` se namerno ne upisuje: on znači „ručna dopuna“ i donosi
    // napredak, a kopija nije dopuna (kopirao je `kopijaIz.userId`).
    for (const i of identiteti) {
      const id = await ctx.db.insert("leadIdentities", {
        workspaceId: B,
        companyId: novaId,
        personId: i.personId ? osobaId.get(String(i.personId)) : undefined,
        kind: i.kind,
        value: i.value,
        valueNormalized: i.valueNormalized,
        isVerified: i.isVerified,
        lawfulBasis: i.lawfulBasis,
        sourceUrl: i.sourceUrl,
        dataSubjectNotifiedAt: i.dataSubjectNotifiedAt,
        createdAt: now,
        verovatnoca: i.verovatnoca,
        verovatnocaObrazlozenje: i.verovatnocaObrazlozenje,
        verovatnocaIzvor: i.verovatnocaIzvor,
        verovatnocaAt: i.verovatnocaAt,
        nijeMoguceProceniti: i.nijeMoguceProceniti,
      });
      noviId.set(String(i._id), String(id));
    }

    // Poreklo: izvorni redovi za kopirane entitete, preslikani na nove ID-jeve.
    const entiteti: Array<{ tabela: Doc<"leadFieldProvenance">["entityTable"]; id: string }> = [
      { tabela: "leadCompanies", id: String(firma._id) },
      ...osobe.map((o) => ({ tabela: "leadPeople" as const, id: String(o._id) })),
      ...identiteti.map((i) => ({ tabela: "leadIdentities" as const, id: String(i._id) })),
    ];
    let preostalo = MAX_POREKLA;
    for (const e of entiteti) {
      if (preostalo <= 0) break;
      const redovi = await ctx.db
        .query("leadFieldProvenance")
        .withIndex("by_workspace_entity_field", (q) =>
          q.eq("workspaceId", A).eq("entityTable", e.tabela).eq("entityId", e.id),
        )
        .take(preostalo);
      preostalo -= redovi.length;
      const novi = noviId.get(e.id);
      if (novi === undefined) continue;
      for (const r of redovi) {
        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: B,
          entityTable: r.entityTable,
          entityId: novi,
          fieldName: r.fieldName,
          value: r.value,
          source: r.source,
          sourceUrl: r.sourceUrl,
          confidence: r.confidence,
          humanConfirmed: r.humanConfirmed,
          observedAt: r.observedAt,
        });
      }
    }
    await ctx.db.insert("leadFieldProvenance", {
      workspaceId: B,
      entityTable: "leadCompanies",
      entityId: String(novaId),
      fieldName: "kopija",
      value: izvor.slug,
      source: "kopija_iz_projekta",
      confidence: "tacno",
      humanConfirmed: true,
      observedAt: now,
    });

    return { companyId: novaId, slug: cilj.slug };
  },
});
