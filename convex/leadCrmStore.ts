import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";

/**
 * ============================================================================
 * LEAD CRM STORE (§0, §9.1, LM8) — Vlasništvo, faze, dodiri, ishodi i istorijat
 * ============================================================================
 *
 * ARHITEKTONSKA PRAVILA:
 * 1. `leadAssignments` čuva TRENUTNO stanje: vlasnik, faza, poslednji dodir,
 *    sledeći korak i ishod. To je tačno jedan red po firmi i on se prepisuje.
 * 2. `leadStageEvents` čuva SVAKU promenu kao zaseban red istorijata:
 *    ko je promenio (actorUserId), šta se promenilo (kind), prethodna i nova
 *    vrednost (fromValue, toValue), vreme (occurredAt) i opcionalno obrazloženje.
 * 3. Faza se NIKADA ne menja automatski (nijedan signal, cron, ni skor).
 * 4. Izvedena stanja („kasni", „dana u fazi") se računaju PRI ČITANJU.
 * 5. Prelaz u faze "dobijen" i "izgubljen" zahteva obaveznu napomenu.
 * 6. Predlog za zabranu kontakta (suppression) se nudi pri odbijanju, ali se
 *    upisuje isključivo na izričitu potvrdu čoveka.
 * ============================================================================
 */

export const LEAD_STAGE_VALIDATOR = v.union(
  v.literal("nov"),
  v.literal("u_radu"),
  v.literal("poslata_ponuda"),
  v.literal("sastanak"),
  v.literal("dobijen"),
  v.literal("izgubljen"),
  v.literal("odlozen"),
);

export type LeadStage =
  | "nov"
  | "u_radu"
  | "poslata_ponuda"
  | "sastanak"
  | "dobijen"
  | "izgubljen"
  | "odlozen";

/**
 * Zatvorena lista ishoda komunikacije (§9). Ishod je RAZLOG/REZULTAT razgovora
 * i namerno je odvojen od faze (`stage`): „dobijen"/„izgubljen" su faze, ne
 * ishodi. Slobodan tekst je ranije značio da „nije zainteresovan" i „ne zanima
 * ga" budu dva različita ishoda i da statistika ne postoji — zato zatvorena
 * lista + odvojena slobodna napomena (`note` arg u `recordOutcome`).
 *
 * `LEAD_OUTCOME_CODES` je jedini izvor istine za skup. `LEAD_OUTCOME_VALIDATOR`
 * i tip `LeadOutcome` se izvode odavde: validator zaključava argument
 * `recordOutcome.outcome` (granica mutacije prima samo kod iz ovog skupa), forma
 * u `lead-actions-panel.tsx` bira kod iz njega, a prikaz koristi
 * `leadOutcomeLabel` (`components/app/leadovi/lead-labels.ts`).
 *
 * `isLeadOutcome` razlikuje kod iz zatvorene liste od starih, slobodno-
 * tekstualnih zapisa u bazi — te stare vrednosti se prikazuju KAKVE JESU
 * (`leadOutcomeLabel` pada na sirovu vrednost), nikad kao „nepoznato".
 */
export const LEAD_OUTCOME_CODES = [
  "nije_se_javio",
  "zainteresovan",
  "nije_zainteresovan",
  "preskupo",
  "nema_potrebe",
  "konkurencija",
  "postojeci_klijent",
  "trazeno_da_se_ne_zove",
  "ostalo",
] as const;

export type LeadOutcome = (typeof LEAD_OUTCOME_CODES)[number];

export const LEAD_OUTCOME_VALIDATOR = v.union(
  v.literal("nije_se_javio"),
  v.literal("zainteresovan"),
  v.literal("nije_zainteresovan"),
  v.literal("preskupo"),
  v.literal("nema_potrebe"),
  v.literal("konkurencija"),
  v.literal("postojeci_klijent"),
  v.literal("trazeno_da_se_ne_zove"),
  v.literal("ostalo"),
);

export function isLeadOutcome(value: string): value is LeadOutcome {
  return (LEAD_OUTCOME_CODES as readonly string[]).includes(value);
}

/**
 * Dodeljuje lead određenom članu tima (ili menja postojećeg vlasnika).
 *
 * Pravila:
 * - Dodeljeni korisnik (`ownerUserId`) MORA biti član istog radnog prostora.
 * - Ako lead već ima istog vlasnika, ne beleži se dupli događaj ({ changed: false }).
 * - Ako se vlasnik menja, stari vlasnik se čuva u `fromValue` tabele `leadStageEvents`.
 * - Ako `leadAssignments` red ne postoji, kreira se sa početnom fazom "nov".
 */
/**
 * Kreira `leadAssignments` red za firmu koja ga još nema i ODMAH upisuje
 * događaj „dodela".
 *
 * Postoji zato što su `logTouch` i `recordOutcome` sami kreirali dodelu sa
 * `ownerUserId: membership.userId` i nisu upisivali nikakav događaj. Ko god
 * prvi zabeleži jedan poziv postao bi vlasnik leada, a u istoriji se to ne bi
 * videlo — što je tačno situacija zbog koje §9.1 postoji: dvoje ljudi zovu
 * isti salon jer nijedan ne zna da je onaj drugi već vlasnik.
 */
async function createAssignmentWithEvent(
  ctx: MutationCtx,
  params: {
    workspaceId: Id<"workspaces">;
    companyId: Id<"leadCompanies">;
    actorUserId: Id<"users">;
    now: number;
    razlog: string;
    extra?: {
      lastTouchAt?: number;
      outcome?: string;
      outcomeAt?: number;
    };
  },
): Promise<Id<"leadAssignments">> {
  const assignmentId = await ctx.db.insert("leadAssignments", {
    workspaceId: params.workspaceId,
    companyId: params.companyId,
    ownerUserId: params.actorUserId,
    stage: "nov",
    ...(params.extra ?? {}),
    createdAt: params.now,
    updatedAt: params.now,
  });

  await ctx.db.insert("leadStageEvents", {
    workspaceId: params.workspaceId,
    companyId: params.companyId,
    kind: "dodela",
    toValue: String(params.actorUserId),
    actorUserId: params.actorUserId,
    note: `Vlasništvo preuzeto automatski pri radnji: ${params.razlog}. Lead do tada nije imao vlasnika.`,
    occurredAt: params.now,
  });

  return assignmentId;
}

export const assignLead = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    ownerUserId: v.id("users"),
    note: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    changed: v.boolean(),
    assignmentId: v.id("leadAssignments"),
  }),
  handler: async (ctx, args) => {
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

    // Proveri da je novi vlasnik član istog radnog prostora.
    //
    // `.first()` ovde nije bilo dovoljno: `members` je indeksiran samo po
    // `userId`, pa bi za korisnika sa više članstava vratio proizvoljno jedno
    // i legitimnog člana ovog prostora odbio kao stranca.
    const targetMemberships = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", args.ownerUserId))
      .collect();

    const isMemberHere = targetMemberships.some(
      (m) => m.workspaceId === args.workspaceId,
    );

    if (!isMemberHere) {
      throw new ConvexError({
        code: "invalid_member",
        message: "Dodeljeni korisnik nije član ovog radnog prostora.",
      });
    }

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    const note = args.note?.trim() || undefined;
    const now = Date.now();

    if (existing) {
      if (existing.ownerUserId === args.ownerUserId) {
        return {
          success: true,
          changed: false,
          assignmentId: existing._id,
        };
      }

      const previousOwnerId = String(existing.ownerUserId);

      await ctx.db.patch(existing._id, {
        ownerUserId: args.ownerUserId,
        updatedAt: now,
      });

      await ctx.db.insert("leadStageEvents", {
        workspaceId: args.workspaceId,
        companyId: args.companyId,
        kind: "dodela",
        fromValue: previousOwnerId,
        toValue: String(args.ownerUserId),
        actorUserId: membership.userId,
        note,
        occurredAt: now,
      });

      return {
        success: true,
        changed: true,
        assignmentId: existing._id,
      };
    }

    // Kreiraj novi assignment red sa početnom fazom "nov"
    const assignmentId = await ctx.db.insert("leadAssignments", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      ownerUserId: args.ownerUserId,
      stage: "nov",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "dodela",
      fromValue: undefined,
      toValue: String(args.ownerUserId),
      actorUserId: membership.userId,
      note,
      occurredAt: now,
    });

    return {
      success: true,
      changed: true,
      assignmentId,
    };
  },
});

/**
 * Menja fazu leada u prodajnom toku.
 *
 * Pravila:
 * - Ako je nova faza ista kao trenutna, vraća { changed: false } i ne puni istoriju praznim hodom.
 * - Prelazak u "dobijen" ili "izgubljen" OBAVEZNO zahteva napomenu (obrazloženje).
 * - Upisuje se događaj u `leadStageEvents` sa autorom (`membership.userId`).
 */
export const setStage = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    stage: LEAD_STAGE_VALIDATOR,
    note: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    changed: v.boolean(),
    stage: LEAD_STAGE_VALIDATOR,
  }),
  handler: async (ctx, args) => {
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

    const cleanNote = args.note?.trim() || undefined;

    // Za faze "dobijen" i "izgubljen" napomena je striktno obavezna
    if ((args.stage === "dobijen" || args.stage === "izgubljen") && !cleanNote) {
      throw new ConvexError({
        code: "missing_note",
        message: `Za prelazak u fazu "${args.stage}" obavezna je napomena sa obrazloženjem ishoda.`,
      });
    }

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      if (existing.stage === args.stage) {
        return {
          success: true,
          changed: false,
          stage: existing.stage,
        };
      }

      const previousStage = existing.stage;

      await ctx.db.patch(existing._id, {
        stage: args.stage,
        updatedAt: now,
      });

      await ctx.db.insert("leadStageEvents", {
        workspaceId: args.workspaceId,
        companyId: args.companyId,
        kind: "faza",
        fromValue: previousStage,
        toValue: args.stage,
        actorUserId: membership.userId,
        note: cleanNote,
        occurredAt: now,
      });

      return {
        success: true,
        changed: true,
        stage: args.stage,
      };
    }

    // Ako assignments red još uvek nije postojao, kreiramo ga dodeljenog autoru akcije
    await ctx.db.insert("leadAssignments", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      ownerUserId: membership.userId,
      stage: args.stage,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "faza",
      fromValue: undefined,
      toValue: args.stage,
      actorUserId: membership.userId,
      note: cleanNote,
      occurredAt: now,
    });

    return {
      success: true,
      changed: true,
      stage: args.stage,
    };
  },
});

/**
 * Beleži ostvareni kontakt (dodir) sa leadom.
 *
 * Pravila:
 * - Postavlja `lastTouchAt` na `touchedAt` koji unosi čovek.
 * - Ako `touchedAt` nije unet, koristi se `Date.now()`, ali se u događaju
 *   eksplicitno beleži da vreme nije uneto od strane čoveka.
 * - Upiši `leadStageEvents` kind "dodir".
 */
export const logTouch = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    channel: v.string(), // npr. "poziv", "email", "instagram_dm", "sastanak", "ostalo"
    note: v.optional(v.string()),
    touchedAt: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    touchedAt: v.number(),
    isAutoTime: v.boolean(),
  }),
  handler: async (ctx, args) => {
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

    const channelClean = args.channel.trim();
    if (!channelClean) {
      throw new ConvexError({
        code: "invalid",
        message: "Kanal komunikacije ne sme biti prazan.",
      });
    }

    const isAutoTime = args.touchedAt === undefined;
    const effectiveTouchedAt = args.touchedAt ?? Date.now();
    // Napomena ostaje ono što je čovek napisao. Podatak o tome da vreme nije
    // potvrđeno ide u `timeConfirmed`, a ne u tekst napomene.
    const eventNote = args.note?.trim() || undefined;

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        lastTouchAt: effectiveTouchedAt,
        updatedAt: now,
      });
    } else {
      await createAssignmentWithEvent(ctx, {
        workspaceId: args.workspaceId,
        companyId: args.companyId,
        actorUserId: membership.userId,
        now,
        razlog: "beleženje dodira",
        extra: { lastTouchAt: effectiveTouchedAt },
      });
    }

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "dodir",
      // Za „dodir" postoji samo nova vrednost — kanal kontakta. `fromValue` je
      // ranije nosio vreme prethodnog dodira, pa je istorija čitala
      // „1756000000000 → poziv", što nije prelaz nego dve nepovezane stvari.
      toValue: channelClean,
      actorUserId: membership.userId,
      note: eventNote,
      timeConfirmed: !isAutoTime,
      occurredAt: effectiveTouchedAt,
    });

    return {
      success: true,
      touchedAt: effectiveTouchedAt,
      isAutoTime,
    };
  },
});

/**
 * Postavlja planirani datum i napomenu za sledeću radnju (sledeći korak).
 *
 * Pravila:
 * - Datum u prošlosti je dozvoljen (zaostala obaveza), ali se u odgovoru
 *   vraća `uProslosti: true` kako bi UI mogao jasno da ga prikaže.
 * - Upiši `leadStageEvents` kind "sledeci_korak".
 */
export const setNextAction = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    nextActionAt: v.number(),
    nextActionNote: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    uProslosti: v.boolean(),
    nextActionAt: v.number(),
  }),
  handler: async (ctx, args) => {
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

    const cleanNote = args.nextActionNote?.trim() || undefined;
    const now = Date.now();
    const uProslosti = args.nextActionAt < now;

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        nextActionAt: args.nextActionAt,
        nextActionNote: cleanNote,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("leadAssignments", {
        workspaceId: args.workspaceId,
        companyId: args.companyId,
        ownerUserId: membership.userId,
        stage: "nov",
        nextActionAt: args.nextActionAt,
        nextActionNote: cleanNote,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "sledeci_korak",
      fromValue: existing?.nextActionAt ? String(existing.nextActionAt) : undefined,
      toValue: String(args.nextActionAt),
      actorUserId: membership.userId,
      note: cleanNote,
      occurredAt: now,
    });

    return {
      success: true,
      uProslosti,
      nextActionAt: args.nextActionAt,
    };
  },
});

/**
 * Beleži konkretan ishod komunikacije (npr. "preskupo", "rekao_ne", "dogovoren_ugovor").
 *
 * Pravila:
 * - Razlikuje se od faze (`stage`): ishod je razlog/rezultat razgovora.
 * - Ako ishod predstavlja odbijanje, nudi `predlogZaSuppression: true`, ali NE vrši
 *   automatski upis u `leadSuppression` bez eksplicitne ljudske potvrde.
 */
export const recordOutcome = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    outcome: LEAD_OUTCOME_VALIDATOR,
    outcomeAt: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    predlogZaSuppression: v.boolean(),
    razlog: v.optional(v.string()),
    // Predlog je nastao poklapanjem reči u slobodnom tekstu, ne pouzdanom
    // klasifikacijom. Onaj ko prikazuje predlog mora to da kaže.
    predlogPoTekstu: v.boolean(),
    poklopljeniIzraz: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
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

    // Zatvorenu listu (§9) sada nameće `LEAD_OUTCOME_VALIDATOR` na samom
    // argumentu, pa je ovde nema šta re-proveravati: `args.outcome` je već
    // jedan od `LEAD_OUTCOME_CODES`. Detalji razgovora idu u `note`, ne u
    // ishod — tako dva operatera ne prave dva različita ishoda za istu stvar.
    const cleanOutcome = args.outcome;

    const cleanNote = args.note?.trim() || undefined;
    const now = Date.now();
    const effectiveOutcomeAt = args.outcomeAt ?? now;

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        outcome: cleanOutcome,
        outcomeAt: effectiveOutcomeAt,
        updatedAt: now,
      });
    } else {
      await createAssignmentWithEvent(ctx, {
        workspaceId: args.workspaceId,
        companyId: args.companyId,
        actorUserId: membership.userId,
        now,
        razlog: "beleženje ishoda",
        extra: { outcome: cleanOutcome, outcomeAt: effectiveOutcomeAt },
      });
    }

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "ishod",
      fromValue: existing?.outcome ?? undefined,
      toValue: cleanOutcome,
      actorUserId: membership.userId,
      note: cleanNote,
      occurredAt: effectiveOutcomeAt,
    });

    // `outcome` je slobodan tekst, pa je ovo POGAĐANJE po rečima, ne činjenica.
    // „nije odbijen, zakazali smo" sadrži „odbij". Zato se vraća i tačan izraz
    // koji se poklopio: čovek koji potvrđuje mora da vidi na osnovu čega mu se
    // predlaže zabrana kontakta, inače nauči da klikće bez čitanja.
    const lower = cleanOutcome.toLowerCase();
    const ODBIJANJE_IZRAZI = [
      "odbij",
      "rekao_ne",
      "odust",
      "nije_zainteresovan",
      "zabrana",
      "ne zeli",
      "ne_zeli",
      "trazio_da_ga_ne_zovemo",
    ];
    const poklopljeniIzraz = ODBIJANJE_IZRAZI.find((izraz) =>
      lower.includes(izraz),
    );

    if (poklopljeniIzraz !== undefined) {
      return {
        success: true,
        predlogZaSuppression: true,
        razlog: "rekao_ne",
        predlogPoTekstu: true,
        poklopljeniIzraz,
      };
    }

    return {
      success: true,
      predlogZaSuppression: false,
      predlogPoTekstu: false,
    };
  },
});

/**
 * Eksplicitno dodavanje leada na listu zabrane kontakta (suppression / "ne diraj")
 * nakon što je čovek potvrdio predlog iz ishoda komunikacije.
 */
export const addToSuppressionFromOutcome = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    kind: v.optional(
      v.union(
        v.literal("postojeci_klijent"),
        v.literal("rekao_ne"),
        v.literal("trazio_da_ga_ne_zovemo"),
        v.literal("interno"),
      ),
    ),
    reason: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    suppressed: v.boolean(),
  }),
  handler: async (ctx, args) => {
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

    const suppressionKind = args.kind ?? "rekao_ne";
    const suppressionReason =
      args.reason?.trim() || `Zabeležen ishod komunikacije za firmu ${company.name}`;
    const now = Date.now();

    // 1. Zabrana po ID-ju firme
    const existingCompanyMatch = await ctx.db
      .query("leadSuppression")
      .withIndex("by_workspace_match", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("matchOn", "companyId")
          .eq("value", String(args.companyId)),
      )
      .first();

    if (existingCompanyMatch) {
      await ctx.db.patch(existingCompanyMatch._id, {
        kind: suppressionKind,
        reason: suppressionReason,
      });
    } else {
      await ctx.db.insert("leadSuppression", {
        workspaceId: args.workspaceId,
        kind: suppressionKind,
        matchOn: "companyId",
        value: String(args.companyId),
        reason: suppressionReason,
        addedBy: membership.userId,
        addedAt: now,
      });
    }

    // 2. Ako firma ima PIB, zabrani i po PIB-u za zaštitu budućih uvoza
    if (company.pib && company.pib.trim()) {
      const normPib = company.pib.trim();
      const existingPibMatch = await ctx.db
        .query("leadSuppression")
        .withIndex("by_workspace_match", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("matchOn", "pib")
            .eq("value", normPib),
        )
        .first();

      if (!existingPibMatch) {
        await ctx.db.insert("leadSuppression", {
          workspaceId: args.workspaceId,
          kind: suppressionKind,
          matchOn: "pib",
          value: normPib,
          reason: suppressionReason,
          addedBy: membership.userId,
          addedAt: now,
        });
      }
    }

    return {
      success: true,
      suppressed: true,
    };
  },
});

/**
 * Zakazuje (ili menja) sastanak sa firmom (§4/O1).
 *
 * Sastanak je dogovoren termin sa drugom stranom i zaseban je od `nextActionAt`.
 *
 * Pravila:
 * - NE menja `stage` automatski. Prelazak u „Sastanak" se predlaže na ekranu, ali
 *   ga bira čovek — tiha promena faze bi prepisala rad.
 * - Termin u prošlosti se DOZVOLJAVA (beleži se sastanak koji je bio), ali odgovor
 *   nosi `uProslosti: true` da ekran to jasno kaže.
 * - `meetingSetAt` beleži KAD je sastanak dogovoren (za istoriju).
 * - Upisuje `leadStageEvents` kind "sastanak" — istorija mora znati da je dogovoren.
 */
export const setMeeting = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    meetingAt: v.number(),
    meetingNote: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    uProslosti: v.boolean(),
    meetingAt: v.number(),
  }),
  handler: async (ctx, args) => {
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

    const cleanNote = args.meetingNote?.trim() || undefined;
    const now = Date.now();
    const uProslosti = args.meetingAt < now;

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        meetingAt: args.meetingAt,
        meetingNote: cleanNote,
        meetingSetAt: now,
        updatedAt: now,
      });
    } else {
      // Bez tihog vlasništva (§9.1): kreiranje dodele upisuje „dodela" događaj,
      // pa se posle dopunjuju polja sastanka.
      const assignmentId = await createAssignmentWithEvent(ctx, {
        workspaceId: args.workspaceId,
        companyId: args.companyId,
        actorUserId: membership.userId,
        now,
        razlog: "zakazivanje sastanka",
      });
      await ctx.db.patch(assignmentId, {
        meetingAt: args.meetingAt,
        meetingNote: cleanNote,
        meetingSetAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "sastanak",
      toValue: String(args.meetingAt),
      actorUserId: membership.userId,
      note: cleanNote,
      occurredAt: now,
    });

    return {
      success: true,
      uProslosti,
      meetingAt: args.meetingAt,
    };
  },
});

/**
 * Otkazuje zakazan sastanak (§4).
 *
 * Otkazano ≠ nikad zakazano: briše se `meetingAt` (i `meetingNote`, koja opisuje
 * otkazan termin), ali se `meetingSetAt` ZADRŽAVA i upisuje se događaj u istoriju.
 */
export const clearMeeting = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    note: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    changed: v.boolean(),
  }),
  handler: async (ctx, args) => {
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

    const existing = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    // Nema šta da se otkaže — nije greška, samo ništa nije promenjeno.
    if (!existing || existing.meetingAt === undefined) {
      return { success: true, changed: false };
    }

    const now = Date.now();
    const previousMeetingAt = existing.meetingAt;
    const cleanNote = args.note?.trim() || undefined;

    await ctx.db.patch(existing._id, {
      meetingAt: undefined,
      meetingNote: undefined,
      // meetingSetAt se NAMERNO ne dira — dokaz da je sastanak nekad postojao.
      updatedAt: now,
    });

    await ctx.db.insert("leadStageEvents", {
      workspaceId: args.workspaceId,
      companyId: args.companyId,
      kind: "sastanak",
      fromValue: String(previousMeetingAt),
      // toValue izostaje: sastanka više nema.
      actorUserId: membership.userId,
      note: cleanNote,
      occurredAt: now,
    });

    return { success: true, changed: true };
  },
});

/**
 * Lista firmi sa zakazanim (ili prošlim) sastankom — hrani jezičak „Sastanci"
 * i njegov brojač (§4).
 *
 * Koristi indeks "by_workspace_meeting". `gt("meetingAt", 0)` preskače redove bez
 * sastanka (`undefined` se u indeksu sortira pre svih brojeva), pa se ne skenira
 * gomila dodela koje nemaju sastanak.
 *
 * Grupisanje po danima (danas/sutra/ove nedelje) se NE radi ovde: server je UTC,
 * a „danas" je lokalni pojam — zato se vraća sirov `meetingAt` i računa na klijentu.
 * `ishodZabelezen` je jedini izvedeni znak: sastanak je „bez ishoda" ako ishod
 * nije zabeležen u trenutku sastanka ili posle njega.
 */
export const listMeetings = query({
  args: {
    workspaceId: v.id("workspaces"),
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

    const maxRows = Math.min(Math.max(args.limit ?? 200, 1), 500);

    const scanned = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_meeting", (q) =>
        q.eq("workspaceId", args.workspaceId).gt("meetingAt", 0),
      )
      .take(maxRows + 1);

    const mozdaImaJos = scanned.length > maxRows;
    const assignments = mozdaImaJos ? scanned.slice(0, maxRows) : scanned;

    const now = Date.now();

    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const company = await ctx.db.get(assignment.companyId);
        // Sken je ograničen na `meetingAt > 0`, pa je ovde uvek definisan.
        const meetingAt = assignment.meetingAt!;
        return {
          assignment,
          company,
          meetingAt,
          meetingNote: assignment.meetingNote,
          uProslosti: meetingAt < now,
          ishodZabelezen:
            assignment.outcomeAt !== undefined &&
            assignment.outcomeAt >= meetingAt,
        };
      }),
    );

    return {
      items,
      count: items.length,
      mozdaImaJos,
      now,
    };
  },
});

/**
 * Vraća trenutno CRM stanje za firmu i hronološku listu poslednjih događaja iz istorijata.
 */
export const getLeadCrm = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
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

    const company = await ctx.db.get(args.companyId);
    if (!company || company.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Firma nije pronađena u ovom radnom prostoru.",
      });
    }

    const assignment = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .first();

    const maxEvents = Math.min(Math.max(args.limit ?? 20, 1), 100);

    // Istorija se čita ograničeno i sortira po `occurredAt`, koji NIJE isto
    // što i redosled upisa: dodir unet naknadno nosi vreme kad se poziv desio.
    // Zato se ne može samo uzeti poslednjih `maxEvents` po indeksu.
    const HISTORY_SCAN = 500;
    const scannedEvents = await ctx.db
      .query("leadStageEvents")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .order("desc")
      .take(HISTORY_SCAN + 1);

    // Dva različita odsecanja i oba se prijavljuju:
    //  - `istorijaOdsecena`: ima više od HISTORY_SCAN zapisa, pa sortiranje po
    //    `occurredAt` možda ne vidi neki stariji naknadno unet dodir;
    //  - `eventsTruncated`: prikazano je manje nego što je pročitano.
    const istorijaOdsecena = scannedEvents.length > HISTORY_SCAN;
    const rawEvents = istorijaOdsecena
      ? scannedEvents.slice(0, HISTORY_SCAN)
      : scannedEvents;

    rawEvents.sort((a, b) => b.occurredAt - a.occurredAt);
    const events = rawEvents.slice(0, maxEvents);
    const eventsTruncated = rawEvents.length > events.length;

    const now = Date.now();
    const isOverdue =
      assignment?.nextActionAt !== undefined && assignment.nextActionAt < now;

    return {
      company,
      assignment: assignment ?? null,
      events,
      eventsTruncated,
      istorijaOdsecena,
      procitanoDogadjaja: rawEvents.length,
      isOverdue,
      now,
    };
  },
});

/**
 * Dohvata kontakte i kontekst za JEDAN red tabele leadova (§3): telefone,
 * mejlove, osobe, signale i poslednji dodir. Tabela je danas jednobojna jer
 * nema čime da radi — broj telefona živi u `leadIdentities`, ne na
 * `leadCompanies` — pa se ovde vraća sve u istom paketu (bez dodatnih upita po
 * otvorenom redu na klijentu, §2/O4).
 *
 * GRANICA (§3): svaki red radi ~4 dodatna čitanja (telefoni/mejlovi/osobe/
 * signali) + jedan upit za poslednji dodir. Prihvatljivo dok liste čitaju do
 * ~50 redova. AKO SE GRANICA IKAD DIGNE IZNAD 50, ovo se MORA prebaciti na
 * denormalizovana polja (na `leadCompanies`/`leadAssignments`), a ne rešavati
 * po redu — zapisano kao uslov, da se ne otkrije tek kad uspori.
 * (Trenutni cap listi je 200; ako se približi radu na tolikom broju redova,
 * denormalizacija je već potrebna.)
 *
 * PRAZNO vs NEPOZNATO (§3): ovde se uvek vraćaju nizovi. Prazan niz
 * (`telefoni: []`) znači „nema u bazi" i po njemu se NE crta dugme za poziv.
 * „Nije učitano" je `undefined` na nivou celog rezultata upita, ne ovde.
 */
async function hydrateLeadRowExtras(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  companyId: Id<"leadCompanies">,
) {
  const HYDRATE_CAP = 200;

  // Osobe + mapa personId -> ime. Iz iste liste se popunjava ime na
  // identitetu, bez dodatnog `ctx.db.get` po svakom telefonu/mejlu.
  const peopleDocs = await ctx.db
    .query("leadPeople")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", workspaceId).eq("companyId", companyId),
    )
    .take(HYDRATE_CAP);

  const imePoOsobi = new Map<Id<"leadPeople">, string>();
  for (const person of peopleDocs) imePoOsobi.set(person._id, person.name);

  const osobe = peopleDocs.map((person) => ({
    name: person.name,
    role: person.role,
    roleConfidence: person.roleConfidence,
  }));

  // Identiteti redom kojim su upisani (default asc `_creationTime`).
  const identityDocs = await ctx.db
    .query("leadIdentities")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", workspaceId).eq("companyId", companyId),
    )
    .take(HYDRATE_CAP);

  const telefoni: { value: string; personName?: string }[] = [];
  const emailovi: { value: string; personName?: string }[] = [];
  for (const identity of identityDocs) {
    if (identity.kind !== "phone" && identity.kind !== "email") continue;
    const entry: { value: string; personName?: string } = {
      value: identity.value,
    };
    // Ime SAMO kad identitet nosi `personId` — centralni/firma broj nema
    // vlasnika, pa se ne pogađa čiji je (§3).
    if (identity.personId) {
      const ime = imePoOsobi.get(identity.personId);
      if (ime) entry.personName = ime;
    }
    (identity.kind === "phone" ? telefoni : emailovi).push(entry);
  }

  // Signali: koje vrste postoje (distinct, prvo-viđeni redosled). Tabela već
  // broji signale; ovde se vraća koji su. Ponovljeni „komentar" kao više
  // istih čipova je šum, pa distinct.
  const signalDocs = await ctx.db
    .query("leadSignals")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", workspaceId).eq("companyId", companyId),
    )
    .take(HYDRATE_CAP);
  const signaliSet = new Set<string>();
  for (const signal of signalDocs) signaliSet.add(signal.kind);
  const signali = [...signaliSet];

  // Poslednji dodir = poslednje zabeležen „dodir" (po redosledu upisa, što
  // prati način na koji `logTouch` dodaje red). `leadStageEvents` nema polje
  // `channel`; `logTouch` upisuje kanal u `toValue`, napomenu u `note`.
  const lastTouch = await ctx.db
    .query("leadStageEvents")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", workspaceId).eq("companyId", companyId),
    )
    .order("desc")
    .filter((q) => q.eq(q.field("kind"), "dodir"))
    .first();

  const poslednjiDodir = lastTouch
    ? {
        channel: lastTouch.toValue ?? "",
        note: lastTouch.note,
        occurredAt: lastTouch.occurredAt,
      }
    : undefined;

  return { telefoni, emailovi, osobe, signali, poslednjiDodir };
}

/**
 * Lista leadova po vlasniku (koristi indeks "by_workspace_owner", nikad pun sken).
 */
export const listByOwner = query({
  args: {
    workspaceId: v.id("workspaces"),
    ownerUserId: v.id("users"),
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

    const maxRows = Math.min(Math.max(args.limit ?? 50, 1), 200);

    // Jedan preko granice — puna lista i odsečena lista inače izgledaju
    // identično, pa tabela tvrdi da je to sve što taj vlasnik ima.
    const scannedOwner = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_owner", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("ownerUserId", args.ownerUserId),
      )
      .take(maxRows + 1);

    const mozdaImaJos = scannedOwner.length > maxRows;
    const assignments = mozdaImaJos
      ? scannedOwner.slice(0, maxRows)
      : scannedOwner;

    const now = Date.now();

    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const company = await ctx.db.get(assignment.companyId);
        const extras = await hydrateLeadRowExtras(
          ctx,
          args.workspaceId,
          assignment.companyId,
        );
        return {
          assignment,
          company,
          ...extras,
          isOverdue:
            assignment.nextActionAt !== undefined &&
            assignment.nextActionAt < now,
        };
      }),
    );

    return {
      items,
      count: items.length,
      mozdaImaJos,
      granica: maxRows,
      now,
    };
  },
});

/**
 * Lista leadova po fazi u prodajnom toku (koristi indeks "by_workspace_stage", nikad pun sken).
 */
export const listByStage = query({
  args: {
    workspaceId: v.id("workspaces"),
    stage: LEAD_STAGE_VALIDATOR,
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

    const maxRows = Math.min(Math.max(args.limit ?? 50, 1), 200);

    // Čitamo jedan više od granice, da bismo znali postoji li još redova.
    // Bez toga lista od tačno `maxRows` izgleda isto kao potpuna lista, pa
    // tabela tvrdi da je to sve što u toj fazi postoji.
    const scanned = await ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_stage", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("stage", args.stage),
      )
      .take(maxRows + 1);

    const mozdaImaJos = scanned.length > maxRows;
    const assignments = mozdaImaJos ? scanned.slice(0, maxRows) : scanned;

    const now = Date.now();

    const items = await Promise.all(
      assignments.map(async (assignment) => {
        const company = await ctx.db.get(assignment.companyId);
        const extras = await hydrateLeadRowExtras(
          ctx,
          args.workspaceId,
          assignment.companyId,
        );
        return {
          assignment,
          company,
          ...extras,
          isOverdue:
            assignment.nextActionAt !== undefined &&
            assignment.nextActionAt < now,
        };
      }),
    );

    return {
      items,
      count: items.length,
      mozdaImaJos,
      granica: maxRows,
      now,
    };
  },
});

/**
 * Lista leadova kojima je rok za sledeći korak istekao (prekoračen).
 *
 * Pravila:
 * - „Prošao" se računa PRI ČITANJU poređenjem sa `Date.now()`.
 * - Koristi indeks "by_workspace_next_action".
 */
export const listOverdue = query({
  args: {
    workspaceId: v.id("workspaces"),
    ownerUserId: v.optional(v.id("users")),
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

    const maxRows = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const now = Date.now();

    const queryBuilder = ctx.db
      .query("leadAssignments")
      .withIndex("by_workspace_next_action", (q) =>
        q.eq("workspaceId", args.workspaceId).lt("nextActionAt", now),
      );

    const scanned = await queryBuilder.take(maxRows * 2);

    // `nextActionAt` je opciono polje. Lead kome sledeći korak NIJE ni
    // postavljen nema šta da kasni — a bez ove provere bi ušao u listu
    // zaostalih sa `delayMs: 0`, što se čita kao „kasni, ali tačno nimalo".
    // Ne oslanjamo se na to kako opseg indeksa tretira nepostojeće polje:
    // pitanje se rešava izričito.
    const withPlan = scanned.filter((a) => a.nextActionAt !== undefined);

    const filtered = args.ownerUserId
      ? withPlan.filter((a) => a.ownerUserId === args.ownerUserId)
      : withPlan;

    const sliced = filtered.slice(0, maxRows);

    // Filtriranje po vlasniku se radi POSLE čitanja, pa ako je pročitan ceo
    // paket, zaostali leadovi tog vlasnika mogu da leže iza granice. Tiho
    // odsecanje bi izgledalo kao „nema više zaostalih".
    const mozdaImaJos =
      scanned.length === maxRows * 2 || filtered.length > sliced.length;

    const items = await Promise.all(
      sliced.map(async (assignment) => {
        const company = await ctx.db.get(assignment.companyId);
        const extras = await hydrateLeadRowExtras(
          ctx,
          args.workspaceId,
          assignment.companyId,
        );
        return {
          assignment,
          company,
          ...extras,
          // Nema grane sa nulom: u ovoj listi su samo leadovi sa planiranim
          // korakom, pa je kašnjenje uvek stvarna vrednost.
          delayMs: now - assignment.nextActionAt!,
        };
      }),
    );

    return {
      items,
      count: items.length,
      mozdaImaJos,
      pregledano: scanned.length,
      now,
    };
  },
});

/**
 * Postavlja temperaturu pojedinačne firme (§10.3).
 *
 * Upisuje:
 * - `temperatura`: nova_firma | cold | warm | hot
 * - `temperaturaPromenjenaAt`: trenutno vreme (Date.now())
 * - `updatedAt`: trenutno vreme (Date.now())
 *
 * Povratak na "nova_firma" je dozvoljen i takođe beleži vreme odluke.
 */
export const setCompanyTemperatura = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    temperatura: v.union(
      v.literal("nova_firma"),
      v.literal("cold"),
      v.literal("warm"),
      v.literal("hot"),
    ),
  },
  handler: async (ctx, args) => {
    // Provera radnog prostora: requireMembership vraća prostor samog pozivaoca,
    // pa poredimo sa args.workspaceId (NIKAKO args sa args).
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

    const now = Date.now();
    await ctx.db.patch(args.companyId, {
      temperatura: args.temperatura,
      temperaturaPromenjenaAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});
