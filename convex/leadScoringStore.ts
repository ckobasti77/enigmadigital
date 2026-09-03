import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  LEAD_SIGNAL_KINDS,
  isKnownLeadSignalKind,
  type LeadSignalKind,
} from "./lib/leadNormalize";
import {
  scoreLead,
  type LeadScore,
} from "./lib/leadScoring";

/**
 * ============================================================================
 * LEAD SCORING STORE (§0, §2.5, §4, §7, LM6)
 * ============================================================================
 *
 * Upravljanje ICP pravilima bodovanja i dinamičko računanje ocena leadova.
 *
 * KLJUČNA PRAVILA:
 * 1. OCENA SE NIKADA NE ČUVA U BAZI (§0, §4). Nema tabele leadScores, nema
 *    polja score na leadCompanies. Sve se računa pri čitanju.
 * 2. Nikada se ne vraća samo jedan broj. Vraćaju se fit i intent ose odvojeno.
 * 3. Čitanje signala se uvek vrši preko indeksa "by_workspace_company",
 *    nikada punim skeniranjem tabele.
 */

/**
 * Podrazumevani skup ICP pravila za Enigma IT digitalne usluge u Srbiji.
 *
 * Ciljna grupa: male firme i preduzetnici (turističke agencije, frizerski/kozmetički
 * saloni sa zakazivanjem i webshopom, online butici i trgovina).
 */
export const DEFAULT_ICP_RULES: ReadonlyArray<{
  name: string;
  axis: "fit" | "intent";
  signalKind: LeadSignalKind;
  weight: number;
  comment: string;
}> = [
  // --------------------------------------------------------------------------
  // FIT PRAVILA — koliko firma strukturno odgovara našim uslugama
  // --------------------------------------------------------------------------
  {
    name: "Nema sajt",
    axis: "fit",
    signalKind: "nema_sajt",
    weight: 30,
    // Firma bez sajta ima primarnu i najočigledniju potrebu za izradom web prezentacije, što je bazična usluga agencije.
    comment: "Firma bez sajta ima primarnu i najočigledniju potrebu za izradom web prezentacije, što je bazična usluga agencije.",
  },
  {
    name: "Koristi booking treće strane",
    axis: "fit",
    signalKind: "koristi_third_party_booking",
    weight: 20,
    // Firma već prepoznaje vrednost digitalnog zakazivanja i plaća eksterna rešenja (Setmore, Dikidi), pa je idealan kandidat za sopstveni integrisani sistem bez provizija.
    comment: "Firma već prepoznaje vrednost digitalnog zakazivanja i plaća eksterna rešenja (Setmore, Dikidi), pa je idealan kandidat za sopstveni integrisani sistem bez provizija.",
  },
  {
    name: "Samo Facebook",
    axis: "fit",
    signalKind: "samo_facebook",
    weight: 15,
    // Prisustvo isključivo na Facebook-u pokazuje digitalnu svest ali i ranjivost bez sopstvenog domena i profesionalnog brendinga.
    comment: "Prisustvo isključivo na Facebook-u pokazuje digitalnu svest ali i ranjivost bez sopstvenog domena i profesionalnog brendinga.",
  },
  {
    name: "Samo Instagram",
    axis: "fit",
    signalKind: "samo_instagram",
    weight: 15,
    // Aktivnost samo na Instagramu dokazuje postojanje vizuelnog sadržaja i baze pratilaca, ali nedostatak webshopa ili sajta ograničava direktnu prodaju.
    comment: "Aktivnost samo na Instagramu dokazuje postojanje vizuelnog sadržaja i baze pratilaca, ali nedostatak webshopa ili sajta ograničava direktnu prodaju.",
  },
  {
    name: "Visok broj recenzija",
    axis: "fit",
    signalKind: "visok_broj_recenzija",
    weight: 20,
    // Veliki broj recenzija (100+) uz dobru ocenu dokazuje stabilan obim posla, stalne mušterije i budžet za ulaganje u digitalni rast.
    comment: "Veliki broj recenzija (100+) uz dobru ocenu dokazuje stabilan obim posla, stalne mušterije i budžet za ulaganje u digitalni rast.",
  },
  {
    name: "Novootvorena firma",
    axis: "fit",
    signalKind: "novootvorena_firma",
    weight: 10,
    // Novootvoreni biznisi grade svoj vizuelni identitet i digitalne kanale od nule, pa im je potreban kompletan paket usluga.
    comment: "Novootvoreni biznisi grade svoj vizuelni identitet i digitalne kanale od nule, pa im je potreban kompletan paket usluga.",
  },

  // --------------------------------------------------------------------------
  // INTENT PRAVILA — trenutna zainteresovanost i angažovanje na tržištu
  // --------------------------------------------------------------------------
  {
    name: "Pitao za cenu",
    axis: "intent",
    signalKind: "pitao_cenu",
    weight: 40,
    // Direktan upit za cenu je najjasniji signal trenutne kupovne namere i spremnosti za momentalni razgovor o saradnji.
    comment: "Direktan upit za cenu je najjasniji signal trenutne kupovne namere i spremnosti za momentalni razgovor o saradnji.",
  },
  {
    name: "Kliknuo /r/ link",
    axis: "intent",
    signalKind: "r_link_clicked",
    weight: 25,
    // Klik na praćeni link u poruci ili ponudi dokazuje aktivnu radoznalost i angažovanje donosioca odluke.
    comment: "Klik na praćeni link u poruci ili ponudi dokazuje aktivnu radoznalost i angažovanje donosioca odluke.",
  },
  {
    name: "Otvorio landing stranicu",
    axis: "intent",
    signalKind: "landing_opened",
    weight: 20,
    // Otvaranje pripremljene demo/besplatne stranice potvrđuje da je klijent pogledao naš predlog neposredno pre sastanka.
    comment: "Otvaranje pripremljene demo/besplatne stranice potvrđuje da je klijent pogledao naš predlog neposredno pre sastanka.",
  },
  {
    name: "Poslao DM",
    axis: "intent",
    signalKind: "dm",
    weight: 15,
    // Privatna poruka na društvenim mrežama predstavlja direktnu dvosmernu komunikaciju i visok nivo proaktivnog interesovanja.
    comment: "Privatna poruka na društvenim mrežama predstavlja direktnu dvosmernu komunikaciju i visok nivo proaktivnog interesovanja.",
  },
  {
    name: "Ostavio komentar",
    axis: "intent",
    signalKind: "komentar",
    weight: 10,
    // Komentar na objavi pokazuje interesovanje za ponuđeni sadržaj, temu ili ponudu agencije.
    comment: "Komentar na objavi pokazuje interesovanje za ponuđeni sadržaj, temu ili ponudu agencije.",
  },
  {
    name: "Pominjanje (mention)",
    axis: "intent",
    signalKind: "mention",
    weight: 10,
    // Javno pominjanje profila ili usluga agencije ukazuje na svest o brendu i preporuku.
    comment: "Javno pominjanje profila ili usluga agencije ukazuje na svest o brendu i preporuku.",
  },
];

/**
 * Računa ocenu pojedinačne firme na osnovu njenih signala i važećih pravila radnog prostora.
 */
export const scoreCompany = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
  },
  handler: async (ctx, args): Promise<LeadScore> => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom radnom prostoru.",
      });
    }

    const signals = await ctx.db
      .query("leadSignals")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .collect();

    const rules = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return scoreLead(signals, rules, Date.now());
  },
});

/**
 * Računa ocenu za grupu firmi odjednom (npr. za prikaz tabele sa ocenama).
 *
 * ARHITEKTURA I N+1 RAZMATRANJE (§0, KORAK 4):
 * Pravila se učitavaju tačno jednom po pozivu.
 * Signali za svaku firmu čitaju se strogo preko indeksa "by_workspace_company".
 *
 * Granica je 100 firmi po pozivu i ona se PROVERAVA, ne samo opisuje. Iznad
 * toga se baca imenovana greška, jer bi inače Convex pukao svojim limitom
 * (documentsRead / bytesRead) — a ta greška ne kaže pozivaocu šta je uradio
 * pogrešno. Za veće skupove: paginacija na strani UI-ja, po 25–50 firmi.
 */
export const SCORE_COMPANIES_LIMIT = 100;

export const scoreCompanies = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyIds: v.array(v.id("leadCompanies")),
  },
  handler: async (ctx, args): Promise<Record<string, LeadScore>> => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    if (args.companyIds.length > SCORE_COMPANIES_LIMIT) {
      throw new ConvexError({
        code: "invalid",
        message: `Traženo je ${args.companyIds.length} firmi odjednom, a granica je ${SCORE_COMPANIES_LIMIT}. Podeli na strane i pozovi više puta.`,
      });
    }

    const rules = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    const signalsPerCompany = await Promise.all(
      args.companyIds.map((companyId) =>
        ctx.db
          .query("leadSignals")
          .withIndex("by_workspace_company", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("companyId", companyId),
          )
          .collect(),
      ),
    );

    const now = Date.now();
    const result: Record<string, LeadScore> = {};

    for (let i = 0; i < args.companyIds.length; i++) {
      const companyId = args.companyIds[i];
      const signals = signalsPerCompany[i];
      result[companyId] = scoreLead(signals, rules, now);
    }

    return result;
  },
});

/**
 * Prikazuje sva ICP pravila radnog prostora, uz opcioni filter po osi (fit / intent).
 */
export const listIcpRules = query({
  args: {
    workspaceId: v.id("workspaces"),
    axis: v.optional(v.union(v.literal("fit"), v.literal("intent"))),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    if (args.axis) {
      return await ctx.db
        .query("leadIcpRules")
        .withIndex("by_workspace_axis", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("axis", args.axis!),
        )
        .collect();
    }

    return await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
  },
});

/**
 * Kreira novo ili ažurira postojeće ICP pravilo.
 *
 * ODBIJA:
 * - Nepoznat signalKind koji nije u LEAD_SIGNAL_KINDS
 * - Težinu manju ili jednaku 0
 * - Prazan naziv pravila
 */
export const upsertIcpRule = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ruleId: v.optional(v.id("leadIcpRules")),
    name: v.string(),
    axis: v.union(v.literal("fit"), v.literal("intent")),
    signalKind: v.string(),
    weight: v.number(),
    rationale: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"leadIcpRules">> => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const trimmedName = args.name.trim();
    if (!trimmedName) {
      throw new ConvexError({
        code: "invalid",
        message: "Naziv pravila ne sme biti prazan.",
      });
    }

    if (!isKnownLeadSignalKind(args.signalKind)) {
      throw new ConvexError({
        code: "invalid",
        message: `Nepoznat tip signala: "${args.signalKind}". Dozvoljeni tipovi su: ${LEAD_SIGNAL_KINDS.join(", ")}`,
      });
    }

    if (args.weight <= 0) {
      throw new ConvexError({
        code: "invalid",
        message: "Težina pravila mora biti veća od nule.",
      });
    }

    const now = Date.now();

    if (args.ruleId) {
      const existing = await ctx.db.get(args.ruleId);
      if (!existing || existing.workspaceId !== args.workspaceId) {
        throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno u ovom radnom prostoru.",
      });
      }

      await ctx.db.patch(args.ruleId, {
        name: trimmedName,
        axis: args.axis,
        signalKind: args.signalKind,
        weight: args.weight,
        rationale: args.rationale?.trim() || undefined,
        isActive: args.isActive,
        updatedAt: now,
      });

      return args.ruleId;
    }

    const newRuleId = await ctx.db.insert("leadIcpRules", {
      workspaceId: args.workspaceId,
      name: trimmedName,
      axis: args.axis,
      signalKind: args.signalKind,
      weight: args.weight,
      rationale: args.rationale?.trim() || undefined,
      isActive: args.isActive,
      createdAt: now,
      updatedAt: now,
    });

    return newRuleId;
  },
});

/**
 * Uključuje ili isključuje aktivnost pojedinačnog ICP pravila.
 */
export const setIcpRuleActive = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ruleId: v.id("leadIcpRules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"leadIcpRules">> => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno u ovom radnom prostoru.",
      });
    }

    await ctx.db.patch(args.ruleId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });

    return args.ruleId;
  },
});

/**
 * Briše ICP pravilo iz radnog prostora.
 */
export const deleteIcpRule = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    ruleId: v.id("leadIcpRules"),
  },
  handler: async (ctx, args): Promise<Id<"leadIcpRules">> => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno u ovom radnom prostoru.",
      });
    }

    await ctx.db.delete(args.ruleId);
    return args.ruleId;
  },
});

/**
 * Upisuje podrazumevani skup ICP pravila SAMO ako radni prostor nema nijedno pravilo.
 * Nikada ne prepisuje postojeća pravila (§0, LM6).
 */
export const seedDefaultIcpRules = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    seeded: boolean;
    count: number;
    razlog?: "vec_postoje_pravila";
  }> => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const existingRule = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();

    if (existingRule !== null) {
      // `count: 0` ovde znači „ništa nije zasejano", a ne „radni prostor ima
      // nula pravila" — te dve stvari se ne smeju čitati kao ista nula.
      return { seeded: false, count: 0, razlog: "vec_postoje_pravila" };
    }

    const now = Date.now();
    let count = 0;

    for (const rule of DEFAULT_ICP_RULES) {
      await ctx.db.insert("leadIcpRules", {
        workspaceId: args.workspaceId,
        name: rule.name,
        axis: rule.axis,
        signalKind: rule.signalKind,
        weight: rule.weight,
        rationale: rule.comment,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      count++;
    }

    return { seeded: true, count };
  },
});
