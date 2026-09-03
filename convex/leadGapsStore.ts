import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * LEAD GAPS STORE (§0, §9.2, LM8) — Rupe kao zadaci, ne kao tišina
 * ============================================================================
 *
 * ARHITEKTONSKA PRAVILA:
 * 1. Svaki broj rupa mora imati imenilac (`ukupnoFirmi`). Broj "18" bez "od 100"
 *    nema informativnu vrednost u interfejsu.
 * 2. Rupa se računa PRI ČITANJU. Nema kolone `hasPhone` koja zastari.
 * 3. Ako radni prostor ima previše firmi da bi se pouzdano i bezbedno prebrojalo
 *    u jednoj transakciji, NE vraća se približan broj kao da je tačan. Vraća se
 *    `{ ..., nepotpuno: true, prebrojano: number }` sa brojem obrađenih firmi.
 * 4. Prazan string ili beline se NE tretiraju kao validan podatak.
 * ============================================================================
 */

export const GAP_TYPE_VALIDATOR = v.union(
  v.literal("bez_telefona"),
  v.literal("bez_kontakt_osobe"),
  v.literal("bez_vlasnika"),
  v.literal("bez_sajta"),
  v.literal("bez_pib"),
);

export type GapType =
  | "bez_telefona"
  | "bez_kontakt_osobe"
  | "bez_vlasnika"
  | "bez_sajta"
  | "bez_pib";

export const MAX_GAPS_SAMPLE_DEFAULT = 500;
export const MAX_GAPS_SAMPLE_CEILING = 1000;

/**
 * Računa statistiku rupa u podacima o leadovima za dati radni prostor.
 */
export const listGaps = query({
  args: {
    workspaceId: v.id("workspaces"),
    sampleLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const safeLimit = Math.min(
      Math.max(args.sampleLimit ?? MAX_GAPS_SAMPLE_DEFAULT, 1),
      MAX_GAPS_SAMPLE_CEILING,
    );

    // Čitamo limit + 1 da bismo znali da li postoji preliv (nepotpuno prebrojavanje)
    const rawCompanies = await ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(safeLimit + 1);

    const isCompaniesOverflow = rawCompanies.length > safeLimit;
    const companies = isCompaniesOverflow
      ? rawCompanies.slice(0, safeLimit)
      : rawCompanies;

    const ukupnoFirmi = companies.length;

    if (ukupnoFirmi === 0) {
      return {
        bezTelefona: 0,
        bezKontaktOsobe: 0,
        bezVlasnika: 0,
        bezSajta: 0,
        bezPib: 0,
        ukupnoFirmi: 0,
        nepotpuno: false,
        prebrojano: 0,
      };
    }

    // Učitaj zavisne relacione tabele sa bezbednosnim gornjim limitom
    const [assignments, people, identities] = await Promise.all([
      ctx.db
        .query("leadAssignments")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(2500),
      ctx.db
        .query("leadPeople")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(2500),
      ctx.db
        .query("leadIdentities")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(5000),
    ]);

    const isRelationOverflow =
      assignments.length >= 2500 ||
      people.length >= 2500 ||
      identities.length >= 5000;

    const nepotpuno = isCompaniesOverflow || isRelationOverflow;

    // Kreiraj brze mape/setove po ID-ju firme
    const assignmentCompanyIds = new Set<string>();
    for (const a of assignments) {
      assignmentCompanyIds.add(String(a.companyId));
    }

    const personCompanyIds = new Set<string>();
    for (const p of people) {
      if (p.name && p.name.trim().length > 0) {
        personCompanyIds.add(String(p.companyId));
      }
    }

    const phoneCompanyIds = new Set<string>();
    const websiteCompanyIds = new Set<string>();

    for (const ident of identities) {
      if (ident.kind === "phone" && ident.value && ident.value.trim().length > 0) {
        phoneCompanyIds.add(String(ident.companyId));
      }
      if (
        ident.kind === "website" &&
        ident.value &&
        ident.value.trim().length > 0
      ) {
        websiteCompanyIds.add(String(ident.companyId));
      }
    }

    let bezTelefona = 0;
    let bezKontaktOsobe = 0;
    let bezVlasnika = 0;
    let bezSajta = 0;
    let bezPib = 0;

    for (const c of companies) {
      const companyIdStr = String(c._id);

      const hasPhone = phoneCompanyIds.has(companyIdStr);
      const hasContactPerson = personCompanyIds.has(companyIdStr);
      const hasOwner = assignmentCompanyIds.has(companyIdStr);
      const hasWebsite = Boolean(
        (c.website && c.website.trim().length > 0) ||
          (c.domainNormalized && c.domainNormalized.trim().length > 0) ||
          websiteCompanyIds.has(companyIdStr),
      );
      const hasPib = Boolean(c.pib && c.pib.trim().length > 0);

      if (!hasPhone) bezTelefona++;
      if (!hasContactPerson) bezKontaktOsobe++;
      if (!hasOwner) bezVlasnika++;
      if (!hasWebsite) bezSajta++;
      if (!hasPib) bezPib++;
    }

    return {
      bezTelefona,
      bezKontaktOsobe,
      bezVlasnika,
      bezSajta,
      bezPib,
      // Imenilac je broj STVARNO prebrojanih firmi, ne ukupan broj u bazi.
      // Kad je `nepotpuno` tačno, „18 od 500" ne znači „18 od svih".
      ukupnoFirmi,
      nepotpuno,
      prebrojano: ukupnoFirmi,
      // Odsečena povezana tabela pravi LAŽNE rupe: firma čiji telefon nije
      // pročitan izgleda kao firma bez telefona, i neko dobije zadatak da
      // nađe broj koji već imamo.
      moguceLazneRupe: isRelationOverflow,
    };
  },
});

/**
 * Vraća listu firmi koje imaju konkretnu rupu u podacima,
 * kako bi tim mogao da preuzme zadatak popunjavanja (§9.2).
 */
export const listCompaniesWithGap = query({
  args: {
    workspaceId: v.id("workspaces"),
    gapType: GAP_TYPE_VALIDATOR,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const maxLimit = Math.min(Math.max(args.limit ?? 50, 1), 200);

    const COMPANY_SCAN = 500;
    const ASSIGN_SCAN = 1500;
    const PEOPLE_SCAN = 1500;
    const IDENT_SCAN = 3000;

    const rawCompanies = await ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(COMPANY_SCAN + 1);

    const companiesOverflow = rawCompanies.length > COMPANY_SCAN;
    const companies = companiesOverflow
      ? rawCompanies.slice(0, COMPANY_SCAN)
      : rawCompanies;

    const [assignments, people, identities] = await Promise.all([
      ctx.db
        .query("leadAssignments")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(ASSIGN_SCAN),
      ctx.db
        .query("leadPeople")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(PEOPLE_SCAN),
      ctx.db
        .query("leadIdentities")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(IDENT_SCAN),
    ]);

    // Ovo je jedina lista u aplikaciji koja PRAVI ZADATKE ljudima. Ako je
    // telefon neke firme ostao izvan pročitanog dela `leadIdentities`, ta
    // firma ovde ispadne kao „bez telefona" i neko krene da traži broj koji
    // već imamo. Zato se odsecanje ne prećutkuje.
    const relationsOverflow =
      assignments.length >= ASSIGN_SCAN ||
      people.length >= PEOPLE_SCAN ||
      identities.length >= IDENT_SCAN;

    const assignmentCompanyIds = new Set(assignments.map((a) => String(a.companyId)));
    const personCompanyIds = new Set(
      people.filter((p) => p.name?.trim()).map((p) => String(p.companyId)),
    );
    const phoneCompanyIds = new Set(
      identities
        .filter((i) => i.kind === "phone" && i.value?.trim())
        .map((i) => String(i.companyId)),
    );
    const websiteCompanyIds = new Set(
      identities
        .filter((i) => i.kind === "website" && i.value?.trim())
        .map((i) => String(i.companyId)),
    );

    const matchingCompanies: Doc<"leadCompanies">[] = [];

    for (const c of companies) {
      if (matchingCompanies.length >= maxLimit) break;

      const cid = String(c._id);
      let isGap = false;

      switch (args.gapType) {
        case "bez_telefona":
          isGap = !phoneCompanyIds.has(cid);
          break;
        case "bez_kontakt_osobe":
          isGap = !personCompanyIds.has(cid);
          break;
        case "bez_vlasnika":
          isGap = !assignmentCompanyIds.has(cid);
          break;
        case "bez_sajta":
          isGap =
            !c.website?.trim() &&
            !c.domainNormalized?.trim() &&
            !websiteCompanyIds.has(cid);
          break;
        case "bez_pib":
          isGap = !c.pib || c.pib.trim().length === 0;
          break;
      }

      if (isGap) {
        matchingCompanies.push(c);
      }
    }

    return {
      gapType: args.gapType,
      companies: matchingCompanies,
      count: matchingCompanies.length,
      pregledanoFirmi: companies.length,
      // `nepotpuno` znači: postoji još firmi koje nisu pregledane, ili je
      // neka od povezanih tabela odsečena — pa poneki red u ovoj listi može
      // biti lažna rupa. Bez ove zastavice lista tvrdi da je potpuna.
      nepotpuno: companiesOverflow || relationsOverflow,
      moguceLazneRupe: relationsOverflow,
    };
  },
});
