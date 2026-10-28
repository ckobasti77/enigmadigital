import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { projekatMutation, projekatQuery } from "./lib/projekat";
import {
  blizinaPragu,
  meraIzmerena,
  medijana,
  PREDLOG_PROZOR_DANA,
  pravilaPauzira,
  SABLONI_PRAVILA,
  uslovIspunjen,
  vrednostMere,
  zaokruziPrag,
  type ZbirCilja,
} from "./lib/pravilaProcena";

export const metricValidator = v.union(
  v.literal("cpa"),
  v.literal("spend"),
  v.literal("ctr"),
  v.literal("cpc"),
  v.literal("roas"),
);

export const operatorValidator = v.union(
  v.literal("gt"),
  v.literal("gte"),
  v.literal("lt"),
  v.literal("lte"),
);

export const scopeValidator = v.union(
  v.literal("account"),
  v.literal("campaign"),
  v.literal("adset"),
);

export const actionValidator = v.union(
  v.literal("notify"),
  v.literal("pause"),
  v.literal("pause_and_notify"),
);

export const ruleConditionValidator = v.object({
  metric: metricValidator,
  operator: operatorValidator,
  value: v.number(),
  windowDays: v.number(),
  minImpressions: v.number(),
});

export const sablonValidator = v.union(
  v.literal("skupa_konverzija"),
  v.literal("skok_potrosnje"),
);

const DAN_MS = 24 * 60 * 60 * 1000;

/**
 * Pravilo koje pauzira uključuje se tek posle probe (P5). Ista poruka za
 * prekidač, novo pravilo i izmenu; front je prepoznaje po kodu.
 */
const PROBA_POTREBNA = {
  code: "proba_potrebna",
  message: "Pre uključivanja pogledaj probu.",
} as const;

// ── Ciljevi pravila: samo Meta oglasi ────────────────────────────────────────

type CiljPravila = ZbirCilja & {
  targetId: string; // externalId
  targetName: string;
  targetType: "account" | "campaign" | "adset";
  status: string;
  /** Potrošnja po danu (`YYYY-MM-DD`), za predlog praga skoka potrošnje. */
  potrosnjaPoDanu: Map<string, number>;
};

function noviCilj(
  targetId: string,
  targetName: string,
  targetType: CiljPravila["targetType"],
  status: string,
): CiljPravila {
  return {
    targetId,
    targetName,
    targetType,
    status,
    spend: 0,
    impressions: 0,
    clicks: 0,
    results: 0,
    conversionValue: 0,
    potrosnjaPoDanu: new Map(),
  };
}

/** Prozor pravila u UTC danima, isto kao evaluator do sada: danas i N − 1 dana pre. */
function prozorPravila(windowDays: number, now: number): { od: string; do: string } {
  const dana = Math.max(1, windowDays);
  return {
    od: new Date(now - (dana - 1) * DAN_MS).toISOString().slice(0, 10),
    do: new Date(now).toISOString().slice(0, 10),
  };
}

/**
 * Ciljevi pravila za prozor: kampanje, grupe oglasa ili nalozi, sa zbirom
 * dnevnih redova (`breakdownHash: "none"`, bez sata). Uzima SAMO Meta naloge:
 * pravilo pauzira preko `graph.facebook.com`, pa Google kampanja tu nema šta
 * da traži (ranije je njen ID odlazio na Metu i padao).
 *
 * Valuta je valuta Meta naloga kad je jedna i poznata; više valuta znači da
 * zbir i prag ne mogu da se uporede bez preračuna, koji aplikacija ne radi.
 */
export async function ciljeviPravila(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  scope: "account" | "campaign" | "adset",
  windowDays: number,
  now: number,
): Promise<{
  ciljevi: CiljPravila[];
  valuta: string | null;
  viseValuta: boolean;
  od: string;
  do: string;
}> {
  const { od, do: doDatuma } = prozorPravila(windowDays, now);
  const nalozi = await ctx.db
    .query("adAccounts")
    .withIndex("by_workspace_provider", (q) =>
      q.eq("workspaceId", workspaceId).eq("provider", "meta_ads"),
    )
    .collect();

  const valute = new Set(
    nalozi
      .map((n) => n.currency?.trim().toUpperCase())
      .filter((c): c is string => Boolean(c)),
  );

  const ciljevi: CiljPravila[] = [];
  for (const nalog of nalozi) {
    const zbirNaloga = noviCilj(nalog.externalId, nalog.name, "account", "ACTIVE");
    const kampanje = await ctx.db
      .query("adCampaigns")
      .withIndex("by_workspace_account", (q) =>
        q.eq("workspaceId", workspaceId).eq("accountId", nalog._id),
      )
      .collect();

    for (const kampanja of kampanje) {
      const zbirKampanje = noviCilj(
        kampanja.externalId,
        kampanja.name,
        "campaign",
        kampanja.status,
      );
      const grupe = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_campaign", (q) =>
          q.eq("workspaceId", workspaceId).eq("campaignId", kampanja._id),
        )
        .collect();

      for (const grupa of grupe) {
        const zbirGrupe = noviCilj(grupa.externalId, grupa.name, "adset", grupa.status);
        const oglasi = await ctx.db
          .query("ads")
          .withIndex("by_workspace_adset", (q) =>
            q.eq("workspaceId", workspaceId).eq("adSetId", grupa._id),
          )
          .collect();

        for (const oglas of oglasi) {
          const uvidi = await ctx.db
            .query("adInsights")
            .withIndex("by_ad_date", (q) =>
              q.eq("adId", oglas._id).gte("date", od).lte("date", doDatuma),
            )
            .collect();
          for (const ins of uvidi) {
            if (ins.breakdownHash !== "none" || ins.hour !== undefined) continue;
            for (const zbir of [zbirGrupe, zbirKampanje, zbirNaloga]) {
              zbir.spend += ins.spend;
              zbir.impressions += ins.impressions;
              zbir.clicks += ins.clicks;
              if (ins.results !== undefined) zbir.results += ins.results;
              if (ins.conversionValue !== undefined) zbir.conversionValue += ins.conversionValue;
              zbir.potrosnjaPoDanu.set(
                ins.date,
                (zbir.potrosnjaPoDanu.get(ins.date) ?? 0) + ins.spend,
              );
            }
          }
        }
        if (scope === "adset") ciljevi.push(zbirGrupe);
      }
      if (scope === "campaign") ciljevi.push(zbirKampanje);
    }
    if (scope === "account") ciljevi.push(zbirNaloga);
  }

  for (const c of ciljevi) {
    c.spend = Number(c.spend.toFixed(2));
    c.conversionValue = Number(c.conversionValue.toFixed(2));
  }

  return {
    ciljevi,
    valuta: valute.size === 1 ? [...valute][0] : null,
    viseValuta: valute.size > 1,
    od,
    do: doDatuma,
  };
}

/** Poslednje okidanje pravila za cilj u periodu mirovanja, ili `null`. */
async function okidanjeUMirovanju(
  ctx: QueryCtx,
  ruleId: Id<"rules">,
  targetId: string,
  cooldownHours: number,
  now: number,
): Promise<Doc<"ruleFirings"> | null> {
  return await ctx.db
    .query("ruleFirings")
    .withIndex("by_ruleId_and_targetId_and_firedAt", (q) =>
      q
        .eq("ruleId", ruleId)
        .eq("targetId", targetId)
        .gt("firedAt", now - cooldownHours * 3600 * 1000),
    )
    .order("desc")
    .first();
}

// ── Public Queries & Mutations ───────────────────────────────────────────────

/**
 * List all rules for the current project.
 */
export const listRules = projekatQuery({
  args: {},
  handler: async (ctx) => {
    const { workspaceId } = ctx.projekat;

    const rules = await ctx.db
      .query("rules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return rules;
  },
});

/**
 * Jedno pravilo iz šablona, sa pragom koji je čovek video i potvrdio (P5).
 * Šabloni se ne upisuju sami: nema javne funkcije koja upisuje pravilo bez
 * praga. Pravilo nastaje isključeno; pauza se uključuje tek posle probe.
 */
export const dodajIzSablona = projekatMutation({
  uloga: "owner",
  args: {
    sablon: sablonValidator,
    prag: v.number(),
  },
  handler: async (ctx, args) => {
    const { workspaceId, userId } = ctx.projekat;
    if (!Number.isFinite(args.prag) || args.prag <= 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Prag mora biti broj veći od nule.",
      });
    }
    const s = SABLONI_PRAVILA[args.sablon];
    return await ctx.db.insert("rules", {
      workspaceId,
      name: s.naziv,
      scope: s.scope,
      condition: { ...s.condition, value: args.prag },
      action: s.action,
      cooldownHours: s.cooldownHours,
      enabled: false,
      createdBy: userId,
    });
  },
});

/**
 * Predlog praga za šablon iz podataka Meta naloga za poslednjih 28 dana (P5):
 * dvostruka medijana, zaokružena naviše na dve značajne cifre.
 *   - skupa konverzija: medijana cene po rezultatu po kampanji (samo kampanje
 *     sa rezultatima);
 *   - skok potrošnje: medijana dnevne potrošnje kampanje (dani sa potrošnjom).
 * Bez podataka ili sa više valuta nema predloga: polje ostaje prazno.
 */
export const predlogPraga = projekatQuery({
  args: { sablon: sablonValidator },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const { ciljevi, valuta, viseValuta } = await ciljeviPravila(
      ctx,
      workspaceId,
      "campaign",
      PREDLOG_PROZOR_DANA,
      Date.now(),
    );
    if (viseValuta) {
      return { prag: null, valuta: null, osnova: null, razlog: "vise_valuta" as const };
    }

    const vrednosti: number[] = [];
    let kampanja = 0;
    for (const c of ciljevi) {
      if (args.sablon === "skupa_konverzija") {
        if (c.results <= 0) continue;
        vrednosti.push(c.spend / c.results);
        kampanja++;
      } else {
        const dani = [...c.potrosnjaPoDanu.values()].filter((x) => x > 0);
        if (dani.length === 0) continue;
        vrednosti.push(...dani);
        kampanja++;
      }
    }

    const m = medijana(vrednosti);
    const prag = m === null ? null : zaokruziPrag(2 * m);
    if (m === null || prag === null) {
      return { prag: null, valuta, osnova: null, razlog: "nema_podataka" as const };
    }
    return {
      prag,
      valuta,
      osnova: { kampanja, medijana: Number(m.toFixed(2)) },
      razlog: null,
    };
  },
});

/**
 * Proba pravila pre uključivanja (P5): šta bi pravilo SADA uradilo nad
 * podacima iz baze. Upit čita samo bazu i ne može da zove Metu. Radi i pre
 * čuvanja (uslov iz urednika) i za postojeće pravilo (`ruleId`: tada zna i
 * koje su kampanje u periodu mirovanja).
 *
 * Odluka ista kao u evaluatoru: najmanje prikaza, pa vrednost mere, pa uslov.
 */
export const probaPravila = projekatQuery({
  args: {
    scope: scopeValidator,
    condition: ruleConditionValidator,
    ruleId: v.optional(v.id("rules")),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const now = Date.now();
    const cond = args.condition;
    const prozorDana = Math.max(1, cond.windowDays);
    const { ciljevi, valuta } = await ciljeviPravila(
      ctx,
      workspaceId,
      args.scope,
      prozorDana,
      now,
    );

    // Tuđe pravilo ne otkriva svoje mirovanje: kao da `ruleId` nije dat.
    const pravilo = args.ruleId ? await ctx.db.get(args.ruleId) : null;
    const svoje = pravilo !== null && pravilo.workspaceId === workspaceId ? pravilo : null;

    // `izmereno: false` = imenioca nema (bez rezultata, klikova, prikaza ili
    // potrošnje): `vrednost` je ona kojom evaluator i tada računa, ali ekran
    // je ne predstavlja kao izmerenu meru.
    const pogodjeni: Array<{
      naziv: string;
      targetId: string;
      targetType: "account" | "campaign" | "adset";
      status: string;
      vrednost: number;
      izmereno: boolean;
      prag: number;
      uPauzi: boolean;
      cekaJosSati: number | null;
    }> = [];
    let najblizi: {
      naziv: string;
      vrednost: number;
      izmereno: boolean;
      procenatPraga: number | null;
      preko: boolean;
    } | null = null;
    let najblizaBlizina = -Infinity;
    let ispodMinPrikaza = 0;

    for (const c of ciljevi) {
      if (c.impressions < cond.minImpressions) {
        ispodMinPrikaza++;
        continue;
      }
      const vrednost = vrednostMere(cond.metric, c);
      const izmereno = meraIzmerena(cond.metric, c);
      const ispunjen = uslovIspunjen(cond.operator, vrednost, cond.value);
      const blizina = blizinaPragu(cond.operator, vrednost, cond.value);
      if (blizina !== null && blizina > najblizaBlizina) {
        najblizaBlizina = blizina;
        najblizi = {
          naziv: c.targetName,
          vrednost: Number(vrednost.toFixed(2)),
          izmereno,
          // Procenat praga ima smisla samo za izmerenu meru.
          procenatPraga:
            izmereno && (cond.operator === "gt" || cond.operator === "gte")
              ? Math.round(blizina * 100)
              : null,
          preko: ispunjen,
        };
      }
      if (!ispunjen) continue;

      const okidanje = svoje
        ? await okidanjeUMirovanju(ctx, svoje._id, c.targetId, svoje.cooldownHours, now)
        : null;
      pogodjeni.push({
        naziv: c.targetName,
        targetId: c.targetId,
        targetType: c.targetType,
        status: c.status,
        vrednost: Number(vrednost.toFixed(2)),
        izmereno,
        prag: cond.value,
        uPauzi: okidanje !== null,
        cekaJosSati:
          okidanje !== null && svoje !== null
            ? Math.max(
                1,
                Math.ceil(
                  (okidanje.firedAt + svoje.cooldownHours * 3600 * 1000 - now) / 3_600_000,
                ),
              )
            : null,
      });
    }

    // Najdalje preko praga prvo.
    pogodjeni.sort(
      (a, b) =>
        (blizinaPragu(cond.operator, b.vrednost, cond.value) ?? 0) -
        (blizinaPragu(cond.operator, a.vrednost, cond.value) ?? 0),
    );

    return {
      valuta,
      pisanjeUkljuceno: process.env.ADS_WRITE_ENABLED === "true",
      pogodjeni,
      najblizi,
      ispodMinPrikaza,
      ciljeva: ciljevi.length,
      prozorDana,
    };
  },
});

/** Da li se uslov ili nivo pravila menja (izmena aktivnog pravila koje pauzira). */
function uslovSeMenja(
  postojece: Doc<"rules">,
  scope: Doc<"rules">["scope"],
  condition: Doc<"rules">["condition"],
): boolean {
  const a = postojece.condition;
  return (
    postojece.scope !== scope ||
    a.metric !== condition.metric ||
    a.operator !== condition.operator ||
    a.value !== condition.value ||
    a.windowDays !== condition.windowDays ||
    a.minImpressions !== condition.minImpressions
  );
}

/**
 * Get a single rule by ID.
 */
export const getRule = projekatQuery({
  args: {
    ruleId: v.id("rules"),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.workspaceId !== workspaceId) {
      return null;
    }
    return rule;
  },
});

/**
 * Create a new rule.
 */
export const createRule = projekatMutation({
  uloga: "owner",
  args: {
    name: v.string(),
    scope: scopeValidator,
    condition: ruleConditionValidator,
    action: actionValidator,
    cooldownHours: v.number(),
    enabled: v.boolean(),
    /** Korisnik je video probu za ovaj uslov (obavezno kad se uključuje pauza). */
    probaPotvrdjena: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Omotač je proverio da je pozivalac vlasnik baš ovog projekta; u red se
    // upisuje on kao autor.
    const { workspaceId, userId } = ctx.projekat;

    if (!args.name.trim()) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Naziv pravila ne može biti prazan.",
      });
    }

    if (args.condition.value < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vrednost praga mora biti nenegativan broj.",
      });
    }

    if (args.condition.windowDays < 1 || args.condition.windowDays > 90) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vremenski prozor mora biti između 1 i 90 dana.",
      });
    }

    if (args.condition.minImpressions < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Minimalan broj impresija ne može biti negativan.",
      });
    }

    if (args.cooldownHours < 1 || args.cooldownHours > 720) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Period mirovanja (cooldown) mora biti između 1h i 720h (30 dana).",
      });
    }

    if (args.enabled && pravilaPauzira(args.action) && args.probaPotvrdjena !== true) {
      throw new ConvexError(PROBA_POTREBNA);
    }

    const ruleId = await ctx.db.insert("rules", {
      workspaceId,
      name: args.name.trim(),
      scope: args.scope,
      condition: args.condition,
      action: args.action,
      cooldownHours: args.cooldownHours,
      enabled: args.enabled,
      createdBy: userId,
    });

    return ruleId;
  },
});

/**
 * Update an existing rule.
 */
export const updateRule = projekatMutation({
  uloga: "owner",
  args: {
    ruleId: v.id("rules"),
    name: v.string(),
    scope: scopeValidator,
    condition: ruleConditionValidator,
    action: actionValidator,
    cooldownHours: v.number(),
    enabled: v.boolean(),
    /** Korisnik je video probu za ovaj uslov (obavezno kad se uključuje pauza). */
    probaPotvrdjena: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno.",
      });
    }

    if (!args.name.trim()) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Naziv pravila ne može biti prazan.",
      });
    }

    if (args.condition.value < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vrednost praga mora biti nenegativan broj.",
      });
    }

    if (args.condition.windowDays < 1 || args.condition.windowDays > 90) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Vremenski prozor mora biti između 1 i 90 dana.",
      });
    }

    if (args.condition.minImpressions < 0) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Minimalan broj impresija ne može biti negativan.",
      });
    }

    if (args.cooldownHours < 1 || args.cooldownHours > 720) {
      throw new ConvexError({
        code: "invalid_argument",
        message: "Period mirovanja (cooldown) mora biti između 1h i 720h.",
      });
    }

    // Proba se traži kad pauza tek počinje da važi: pravilo se uključuje,
    // počinje da pauzira ili pauzira po novom uslovu. Promena naziva ili
    // mirovanja aktivnog pravila je ne traži.
    const pauzaPocinje =
      !existing.enabled ||
      !pravilaPauzira(existing.action) ||
      uslovSeMenja(existing, args.scope, args.condition);
    if (
      args.enabled &&
      pravilaPauzira(args.action) &&
      pauzaPocinje &&
      args.probaPotvrdjena !== true
    ) {
      throw new ConvexError(PROBA_POTREBNA);
    }

    await ctx.db.patch(args.ruleId, {
      name: args.name.trim(),
      scope: args.scope,
      condition: args.condition,
      action: args.action,
      cooldownHours: args.cooldownHours,
      enabled: args.enabled,
    });

    return args.ruleId;
  },
});

/**
 * Delete a rule and its firing history.
 */
export const deleteRule = projekatMutation({
  uloga: "owner",
  args: {
    ruleId: v.id("rules"),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno.",
      });
    }

    // Delete associated firings
    const firings = await ctx.db
      .query("ruleFirings")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", args.ruleId))
      .collect();

    for (const f of firings) {
      await ctx.db.delete(f._id);
    }

    await ctx.db.delete(args.ruleId);
    return true;
  },
});

/**
 * Toggle enabled status of a rule.
 */
export const toggleRule = projekatMutation({
  uloga: "owner",
  args: {
    ruleId: v.id("rules"),
    enabled: v.boolean(),
    /** Korisnik je video probu (obavezno kad se uključuje pravilo koje pauzira). */
    probaPotvrdjena: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const existing = await ctx.db.get(args.ruleId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Pravilo nije pronađeno.",
      });
    }

    if (
      args.enabled &&
      !existing.enabled &&
      pravilaPauzira(existing.action) &&
      args.probaPotvrdjena !== true
    ) {
      throw new ConvexError(PROBA_POTREBNA);
    }

    await ctx.db.patch(args.ruleId, { enabled: args.enabled });
    return { ruleId: args.ruleId, enabled: args.enabled };
  },
});

export const listRuleFiringsInternal = internalQuery({
  args: {
    ruleId: v.optional(v.id("rules")),
    workspaceId: v.optional(v.id("workspaces")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    let firings;
    if (args.ruleId) {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_ruleId_and_firedAt", (q) => q.eq("ruleId", args.ruleId!))
        .order("desc")
        .take(limit);
    } else if (args.workspaceId) {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_workspace_and_firedAt", (q) =>
          q.eq("workspaceId", args.workspaceId!),
        )
        .order("desc")
        .take(limit);
    } else {
      firings = await ctx.db.query("ruleFirings").order("desc").take(limit);
    }

    return firings;
  },
});

/**
 * List firing history for the workspace or specific rule.
 */
export const listRuleFirings = projekatQuery({
  args: {
    ruleId: v.optional(v.id("rules")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = ctx.projekat;
    const limit = args.limit ?? 50;

    let firings;
    if (args.ruleId) {
      // Istorija tuđeg pravila se ne čita: pravilo mora biti iz ovog projekta.
      const rule = await ctx.db.get(args.ruleId);
      if (rule === null || rule.workspaceId !== workspaceId) return [];
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_ruleId_and_firedAt", (q) => q.eq("ruleId", args.ruleId!))
        .order("desc")
        .take(limit);
    } else {
      firings = await ctx.db
        .query("ruleFirings")
        .withIndex("by_workspace_and_firedAt", (q) =>
          q.eq("workspaceId", workspaceId),
        )
        .order("desc")
        .take(limit);
    }

    // Ime pravila i mera kojom meri (za iznos u istoriji). Prag uz okidanje
    // se ne pamti, pa istorija pokazuje današnji prag kao „prag sada".
    const ruleIds = Array.from(new Set(firings.map((f) => f.ruleId)));
    const rulesMap = new Map<Id<"rules">, Doc<"rules">>();
    for (const rId of ruleIds) {
      const rule = await ctx.db.get(rId);
      if (rule) {
        rulesMap.set(rId, rule);
      }
    }

    return firings.map((f) => {
      const rule = rulesMap.get(f.ruleId);
      return {
        ...f,
        ruleName: rule?.name ?? "Obrisano pravilo",
        metric: rule?.condition.metric ?? null,
        pragSada: rule?.condition.value ?? null,
      };
    });
  },
});

// ── Internal Evaluator Context Gathering ─────────────────────────────────────

export interface EvaluationTargetMetric {
  targetId: string; // externalId
  targetName: string;
  targetType: "account" | "campaign" | "adset";
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  conversionValue: number;
  isCoolingDown: boolean;
  lastFiredAt?: number;
}

export interface EvaluationRuleContext {
  rule: {
    _id: Id<"rules">;
    workspaceId: Id<"workspaces">;
    name: string;
    scope: "account" | "campaign" | "adset";
    condition: {
      metric: "cpa" | "spend" | "ctr" | "cpc" | "roas";
      operator: "gt" | "gte" | "lt" | "lte";
      value: number;
      windowDays: number;
      minImpressions: number;
    };
    action: "notify" | "pause" | "pause_and_notify";
    cooldownHours: number;
    lastFiredAt?: number;
  };
  from: string;
  to: string;
  targets: EvaluationTargetMetric[];
  connection: {
    encryptedCredentials?: string;
    externalId?: string;
  } | null;
  allowedEmails: string[];
  /** Valuta Meta naloga kad je jedna i poznata (iznos u mejlu), inače `null`. */
  valuta: string | null;
}

/**
 * Projekti koji imaju bar jedno uključeno pravilo (cron ih procenjuje jedan po
 * jedan, C19). Interna: prolazi kroz sve projekte, ali vraća samo ID-jeve.
 */
export const projektiSaPravilima = internalQuery({
  args: {},
  returns: v.array(v.id("workspaces")),
  handler: async (ctx) => {
    const out: Id<"workspaces">[] = [];
    for (const ws of await ctx.db.query("workspaces").collect()) {
      const ima = await ctx.db
        .query("rules")
        .withIndex("by_workspace_and_enabled", (q) =>
          q.eq("workspaceId", ws._id).eq("enabled", true),
        )
        .first();
      if (ima !== null) out.push(ws._id);
    }
    return out;
  },
});

/**
 * Collects all enabled rules and aggregates fresh adInsights metrics for their respective windows.
 */
export const getEvaluationContext = internalQuery({
  args: {
    now: v.number(),
    specificRuleId: v.optional(v.id("rules")),
    specificWorkspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args): Promise<EvaluationRuleContext[]> => {
    let rules: Array<{
      _id: Id<"rules">;
      workspaceId: Id<"workspaces">;
      name: string;
      enabled: boolean;
      scope: "account" | "campaign" | "adset";
      condition: {
        metric: "cpa" | "spend" | "ctr" | "cpc" | "roas";
        operator: "gt" | "gte" | "lt" | "lte";
        value: number;
        windowDays: number;
        minImpressions: number;
      };
      action: "notify" | "pause" | "pause_and_notify";
      cooldownHours: number;
      lastFiredAt?: number;
    }> = [];

    if (args.specificRuleId) {
      const single = await ctx.db.get(args.specificRuleId);
      // Kad je dat i prostor, pravilo mora biti iz njega (ručno pokretanje
      // šalje prostor pozivaoca; tuđe pravilo se tada ne procenjuje).
      if (
        single &&
        (args.specificWorkspaceId === undefined ||
          single.workspaceId === args.specificWorkspaceId)
      ) {
        rules = [single];
      }
    } else if (args.specificWorkspaceId) {
      rules = await ctx.db
        .query("rules")
        .withIndex("by_workspace_and_enabled", (q) =>
          q
            .eq("workspaceId", args.specificWorkspaceId!)
            .eq("enabled", true),
        )
        .collect();
    } else {
      // Find all workspaces
      const allWorkspaces = await ctx.db.query("workspaces").collect();
      for (const ws of allWorkspaces) {
        const wsRules = await ctx.db
          .query("rules")
          .withIndex("by_workspace_and_enabled", (q) =>
            q.eq("workspaceId", ws._id).eq("enabled", true),
          )
          .collect();
        rules.push(...wsRules);
      }
    }

    const results: EvaluationRuleContext[] = [];

    for (const rule of rules) {
      const windowDays = Math.max(1, rule.condition.windowDays);

      // Fetch connection for credentials if needed
      const conn = await ctx.db
        .query("connections")
        .withIndex("by_workspace_provider", (q) =>
          q.eq("workspaceId", rule.workspaceId).eq("provider", "meta_ads"),
        )
        .first();

      // Fetch allowed emails (workspace members + users)
      const members = await ctx.db
        .query("members")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", rule.workspaceId))
        .collect();

      const memberEmails: string[] = [];
      for (const m of members) {
        const u = await ctx.db.get(m.userId);
        if (u?.email) {
          memberEmails.push(u.email.trim().toLowerCase());
        }
      }

      // Ciljevi su samo Meta kampanje, grupe oglasa ili nalozi (isti pomoćnik
      // kao proba, pa proba i evaluator vide isto).
      const { ciljevi, valuta, od, do: doDatuma } = await ciljeviPravila(
        ctx,
        rule.workspaceId,
        rule.scope,
        windowDays,
        args.now,
      );

      const targets: EvaluationTargetMetric[] = [];
      for (const cilj of ciljevi) {
        const recentFiring = await okidanjeUMirovanju(
          ctx,
          rule._id,
          cilj.targetId,
          rule.cooldownHours,
          args.now,
        );
        targets.push({
          targetId: cilj.targetId,
          targetName: cilj.targetName,
          targetType: cilj.targetType,
          status: cilj.status,
          spend: cilj.spend,
          impressions: cilj.impressions,
          clicks: cilj.clicks,
          results: cilj.results,
          conversionValue: cilj.conversionValue,
          isCoolingDown: recentFiring !== null,
          lastFiredAt: recentFiring?.firedAt,
        });
      }

      results.push({
        rule,
        from: od,
        to: doDatuma,
        targets,
        connection: conn
          ? {
              encryptedCredentials: conn.encryptedCredentials,
              externalId: conn.externalId,
            }
          : null,
        allowedEmails: memberEmails,
        valuta,
      });
    }

    return results;
  },
});

// ── Internal Recording Mutations ─────────────────────────────────────────────

export const recordFiring = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    ruleId: v.id("rules"),
    targetId: v.string(),
    targetName: v.optional(v.string()),
    targetType: v.optional(
      v.union(v.literal("account"), v.literal("campaign"), v.literal("adset")),
    ),
    firedAt: v.number(),
    metricValue: v.number(),
    actionTaken: v.union(
      v.literal("notify"),
      v.literal("pause"),
      v.literal("pause_and_notify"),
      v.literal("notify_only_write_disabled"),
    ),
    notified: v.boolean(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const firingId = await ctx.db.insert("ruleFirings", {
      workspaceId: args.workspaceId,
      ruleId: args.ruleId,
      targetId: args.targetId,
      targetName: args.targetName,
      targetType: args.targetType,
      firedAt: args.firedAt,
      metricValue: args.metricValue,
      actionTaken: args.actionTaken,
      notified: args.notified,
      details: args.details,
    });

    // Update rule's lastFiredAt
    await ctx.db.patch(args.ruleId, {
      lastFiredAt: args.firedAt,
    });

    return firingId;
  },
});

export const updateTargetStatusLocally = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    targetType: v.union(
      v.literal("account"),
      v.literal("campaign"),
      v.literal("adset"),
    ),
    targetId: v.string(), // externalId
    newStatus: v.string(), // "PAUSED"
  },
  handler: async (ctx, args) => {
    if (args.targetType === "campaign") {
      const campaign = await ctx.db
        .query("adCampaigns")
        .withIndex("by_workspace_external", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("externalId", args.targetId),
        )
        .first();

      if (campaign) {
        await ctx.db.patch(campaign._id, {
          status: args.newStatus,
          syncedAt: Date.now(),
        });
      }
    } else if (args.targetType === "adset") {
      const adSet = await ctx.db
        .query("adSets")
        .withIndex("by_workspace_external", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("externalId", args.targetId),
        )
        .first();

      if (adSet) {
        await ctx.db.patch(adSet._id, {
          status: args.newStatus,
          syncedAt: Date.now(),
        });
      }
    }
  },
});
