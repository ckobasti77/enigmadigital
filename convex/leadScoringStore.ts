import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { projekatMutation, projekatQuery } from "./lib/projekat";
import {
  LEAD_SIGNAL_KINDS,
  isKnownLeadSignalKind,
  normalizeNicheSlug,
} from "./lib/leadNormalize";
import {
  scoreLead,
  type LeadScore,
} from "./lib/leadScoring";
import {
  ciljneNise,
  firmaUCiljnojNisi,
  pravilaTraziCiljnuNisu,
  signaliSaCiljnomNisom,
} from "./lib/ciljnaNisa";
import {
  NISE_SABLONA,
  PRAVILA_SABLONA,
  PRAVILA_WEB_AGENCIJA,
  sablonLeadovaValidator,
  sablonProjekta,
  type PraviloSablona,
  type SablonLeadova,
} from "./lib/sabloniLeadova";

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
 * Podrazumevani skup = pravila šablona „Web agencija“ (C14). Pravila su
 * preseljena doslovno u `convex/lib/sabloniLeadova.ts`, da bi ih čitali i
 * čarobnjak i ekran bez Convex servera u klijentskom paketu; ime ostaje zbog
 * postojećih provera (`scripts/verify-lead-scoring.ts`).
 */
export const DEFAULT_ICP_RULES = PRAVILA_WEB_AGENCIJA;

/** Šablon projekta (C14); bez vrednosti „Web agencija“. */
async function sablonZa(
  ctx: { db: QueryCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<SablonLeadova> {
  const ws = await ctx.db.get(workspaceId);
  return ws === null ? "prazno" : sablonProjekta(ws);
}

/** Pravila šablona projekta — podrazumevani skup za seed i dopunu. */
async function podrazumevanaPravila(
  ctx: { db: QueryCtx["db"] },
  workspaceId: Id<"workspaces">,
): Promise<ReadonlyArray<PraviloSablona>> {
  return PRAVILA_SABLONA[await sablonZa(ctx, workspaceId)];
}

async function upisiPravilo(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  rule: PraviloSablona,
  now: number,
): Promise<void> {
  await ctx.db.insert("leadIcpRules", {
    workspaceId,
    name: rule.name,
    axis: rule.axis,
    signalKind: rule.signalKind,
    weight: rule.weight,
    rationale: rule.comment,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Računa ocenu pojedinačne firme na osnovu njenih signala i važećih pravila radnog prostora.
 */
export const scoreCompany = projekatQuery({
  args: {
    companyId: v.id("leadCompanies"),
  },
  handler: async (ctx, args): Promise<LeadScore> => {
    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom projektu.",
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

    // Ciljna niša (C14) se izvodi samo kad je neko pravilo traži.
    if (pravilaTraziCiljnuNisu(rules)) {
      const ciljne = await ciljneNise(ctx, args.workspaceId);
      return scoreLead(
        signaliSaCiljnomNisom(signals, company, firmaUCiljnojNisi(company, ciljne)),
        rules,
        Date.now(),
      );
    }

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

export const scoreCompanies = projekatQuery({
  args: {
    companyIds: v.array(v.id("leadCompanies")),
  },
  handler: async (ctx, args): Promise<Record<string, LeadScore>> => {
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

    // Ciljna niša (C14): firme i niše se čitaju samo kad je pravilo traži.
    // Firma koja ne pripada projektu ne dobija signal.
    const trebaNisa = pravilaTraziCiljnuNisu(rules);
    const ciljne = trebaNisa ? await ciljneNise(ctx, args.workspaceId) : null;
    const firme = trebaNisa
      ? await Promise.all(args.companyIds.map((id) => ctx.db.get(id)))
      : null;

    const now = Date.now();
    const result: Record<string, LeadScore> = {};

    for (let i = 0; i < args.companyIds.length; i++) {
      const companyId = args.companyIds[i];
      const signals = signalsPerCompany[i];
      const firma = firme?.[i] ?? null;
      result[companyId] =
        ciljne !== null && firma !== null && firma.workspaceId === args.workspaceId
          ? scoreLead(
              signaliSaCiljnomNisom(signals, firma, firmaUCiljnojNisi(firma, ciljne)),
              rules,
              now,
            )
          : scoreLead(signals, rules, now);
    }

    return result;
  },
});

/**
 * Prikazuje sva ICP pravila radnog prostora, uz opcioni filter po osi (fit / intent).
 */
export const listIcpRules = projekatQuery({
  args: {
    axis: v.optional(v.union(v.literal("fit"), v.literal("intent"))),
  },
  handler: async (ctx, args) => {
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
export const upsertIcpRule = projekatMutation({
  args: {
    ruleId: v.optional(v.id("leadIcpRules")),
    name: v.string(),
    axis: v.union(v.literal("fit"), v.literal("intent")),
    signalKind: v.string(),
    weight: v.number(),
    rationale: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"leadIcpRules">> => {
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
        message: "Pravilo nije pronađeno u ovom projektu.",
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
export const setIcpRuleActive = projekatMutation({
  args: {
    ruleId: v.id("leadIcpRules"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"leadIcpRules">> => {
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno u ovom projektu.",
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
export const deleteIcpRule = projekatMutation({
  args: {
    ruleId: v.id("leadIcpRules"),
  },
  handler: async (ctx, args): Promise<Id<"leadIcpRules">> => {
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno u ovom projektu.",
      });
    }

    await ctx.db.delete(args.ruleId);
    return args.ruleId;
  },
});

/**
 * Upisuje podrazumevani skup ICP pravila SAMO ako radni prostor nema nijedno pravilo.
 * Nikada ne prepisuje postojeća pravila (§0, LM6). Skup je šablon projekta
 * (C14): Enigma i projekti bez šablona dobijaju „Web agencija“, kao do sada;
 * „Prazno“ ne upisuje ništa.
 */
export const seedDefaultIcpRules = projekatMutation({
  args: {},
  handler: async (
    ctx,
    args,
  ): Promise<{
    seeded: boolean;
    count: number;
    razlog?: "vec_postoje_pravila";
  }> => {
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

    for (const rule of await podrazumevanaPravila(ctx, args.workspaceId)) {
      await upisiPravilo(ctx, args.workspaceId, rule, now);
      count++;
    }

    return { seeded: count > 0, count };
  },
});

/**
 * Koja podrazumevana pravila radni prostor NEMA (po `signalKind`).
 *
 * Postoji zato što `seedDefaultIcpRules` staje na prvom postojećem pravilu:
 * radni prostor koji je pravila zasejao pre GL1 nikad ne bi dobio
 * `sajt_ne_radi` ni `sajt_bez_https`, a signali bi se uredno upisivali i tiho
 * ne bi ulazili ni u jedan zbir. Ekran mora da vidi taj nedostatak da bi mogao
 * da ga ponudi — dugme koje se crta „za svaki slučaj" krši pravilo da se ne
 * crta kontrola koja nema šta da uradi.
 */
export const missingDefaultIcpRules = projekatQuery({
  args: {},
  returns: v.array(
    v.object({
      signalKind: v.string(),
      name: v.string(),
      axis: v.union(v.literal("fit"), v.literal("intent")),
      weight: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    // Poređenje ide po `signalKind`, ne po nazivu: čovek sme da preimenuje
    // pravilo, i to ne znači da pravilo fali.
    const pokriveno = new Set(existing.map((r) => r.signalKind));

    // Šablon projekta (C14), ne zakucan Enigma skup.
    const pravila = await podrazumevanaPravila(ctx, args.workspaceId);
    return pravila.filter(
      (rule) => !pokriveno.has(rule.signalKind),
    ).map((rule) => ({
      signalKind: rule.signalKind as string,
      name: rule.name,
      axis: rule.axis,
      weight: rule.weight,
    }));
  },
});

/**
 * Dodaje SAMO ona podrazumevana pravila čiji `signalKind` u radnom prostoru ne
 * postoji. Postojeća pravila se ne diraju — ni težina, ni naziv, ni stanje.
 *
 * Radni prostor koji je pravila zasejao pre nego što je signal uveden inače
 * ostaje bez njega zauvek, jer `seedDefaultIcpRules` po dizajnu ne prepisuje
 * ništa kad pravila već postoje.
 */
export const addMissingDefaultIcpRules = projekatMutation({
  args: {},
  returns: v.object({
    added: v.number(),
    addedNames: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const pokriveno = new Set(existing.map((r) => r.signalKind));

    const now = Date.now();
    const addedNames: string[] = [];

    for (const rule of await podrazumevanaPravila(ctx, args.workspaceId)) {
      if (pokriveno.has(rule.signalKind)) continue;
      await upisiPravilo(ctx, args.workspaceId, rule, now);
      addedNames.push(rule.name);
    }

    return { added: addedNames.length, addedNames };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Šabloni (C14, PROJEKTI-PLAN §10)
// ─────────────────────────────────────────────────────────────────────────────

/** Šablon projekta i da li projekat već ima pravila (ekran i čarobnjak). */
export const sablonLeadova = projekatQuery({
  args: {},
  returns: v.object({
    sablon: sablonLeadovaValidator,
    imaPravila: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const prvo = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .first();
    return {
      sablon: await sablonZa(ctx, args.workspaceId),
      imaPravila: prvo !== null,
    };
  },
});

/**
 * Primenjuje šablon na projekat: pamti ga (`workspaces.sablonLeadova`),
 * upisuje njegova pravila i dodaje njegove niše kao ciljne.
 *
 * SAMO DOK PROJEKAT NEMA NIJEDNO PRAVILO. Šablon preko postojećih pravila bi
 * promenio bodovanje firmi koje projekat već ima (npr. Enigma): novo pravilo
 * menja i najveći mogući zbir ose. Postojeća pravila se menjaju ručno.
 *
 * Niše se dodaju po slugu: postojeća niša se ne preimenuje i ne gubi ništa;
 * dobija samo oznaku ciljne i odluku o zakazivanju, i to samo ako ih još nema
 * (odluka čoveka se ne prepisuje).
 */
export const primeniSablon = projekatMutation({
  args: {
    sablon: sablonLeadovaValidator,
  },
  returns: v.object({
    dodatoPravila: v.number(),
    dodateNise: v.number(),
    oznaceneNise: v.number(),
  }),
  handler: async (ctx, args) => {
    const workspaceId = args.workspaceId;
    const postojece = await ctx.db
      .query("leadIcpRules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (postojece !== null) {
      throw new ConvexError({
        code: "conflict",
        message:
          "Projekat već ima pravila ocenjivanja. Šablon se bira dok pravila nema; postojeća menjaš ručno.",
      });
    }

    await ctx.db.patch(workspaceId, { sablonLeadova: args.sablon });

    const now = Date.now();
    let dodatoPravila = 0;
    for (const rule of PRAVILA_SABLONA[args.sablon]) {
      await upisiPravilo(ctx, workspaceId, rule, now);
      dodatoPravila++;
    }

    let dodateNise = 0;
    let oznaceneNise = 0;
    for (const nisa of NISE_SABLONA[args.sablon]) {
      // Slug iz šablona je već normalizovan (test); ovde je samo odbrana.
      const slug = normalizeNicheSlug(nisa.slug);
      const postojeca = await ctx.db
        .query("niches")
        .withIndex("by_workspace_slug", (q) =>
          q.eq("workspaceId", workspaceId).eq("slug", slug),
        )
        .first();
      if (postojeca === null) {
        await ctx.db.insert("niches", {
          workspaceId,
          slug,
          naziv: nisa.naziv,
          ...(nisa.sifreDelatnosti
            ? { sifreDelatnosti: [...nisa.sifreDelatnosti] }
            : {}),
          ...(nisa.trebaZakazivanje !== undefined
            ? { trebaZakazivanje: nisa.trebaZakazivanje }
            : {}),
          ciljna: true,
          createdBy: ctx.projekat.userId,
          createdAt: now,
          updatedAt: now,
        });
        dodateNise++;
        continue;
      }
      const izmena: { ciljna?: boolean; trebaZakazivanje?: boolean } = {};
      if (postojeca.ciljna === undefined) izmena.ciljna = true;
      if (
        postojeca.trebaZakazivanje === undefined &&
        nisa.trebaZakazivanje !== undefined
      ) {
        izmena.trebaZakazivanje = nisa.trebaZakazivanje;
      }
      if (Object.keys(izmena).length > 0) {
        await ctx.db.patch(postojeca._id, { ...izmena, updatedAt: now });
        oznaceneNise++;
      }
    }

    return { dodatoPravila, dodateNise, oznaceneNise };
  },
});
