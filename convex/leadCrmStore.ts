import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
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
    outcome: v.string(),
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

    const cleanOutcome = args.outcome.trim();
    if (!cleanOutcome) {
      throw new ConvexError({
        code: "invalid",
        message: "Ishod komunikacije ne sme biti prazan.",
      });
    }

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
        return {
          assignment,
          company,
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
        return {
          assignment,
          company,
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
        return {
          assignment,
          company,
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
