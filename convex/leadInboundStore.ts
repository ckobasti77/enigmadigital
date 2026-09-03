import { mutation, query, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  normalizeCompanyName,
  normalizeDomain,
  isKnownLeadSignalKind,
} from "./lib/leadNormalize";
import {
  deriveSignalsFromInboundText,
  mapInboundKindToSignal,
} from "./lib/leadInboundDerive";
import { isSuppressed } from "./leadSuppressionStore";

/**
 * ============================================================================
 * LEAD INBOUND STORE (LM5, §1, §2, §8, §9.3)
 * ============================================================================
 *
 * Upravljanje inbound leadovima iz društvenih mreža (Instagram, Facebook, Threads).
 *
 * ARHITEKTONSKA PRAVILA:
 * 1. Inbound je osoba bez poznate firme. Shema zabranjuje osobu bez firme i traži
 *    obavezan naziv firme — zato inbound ulazi u tabelu `leadInbound` (čekaonicu).
 * 2. Nijedan inbound zapis ne sme da izmisli naziv firme. Ako naziv nije poznat,
 *    polje ne postoji — ne upisuje se prazan string, ni handle, ni „Nepoznato".
 * 3. Sirov handle, e-mail i telefon nikada ne ulaze u leadInbound niti u logove.
 * 4. `lawfulBasis` i `sourceUrl` su OBAVEZNI pri povezivanju sa firmom (§8).
 * ============================================================================
 */

export interface RecordInboundArgs {
  workspaceId: Id<"workspaces">;
  platform: "instagram" | "facebook" | "threads";
  kind: "komentar" | "odgovor" | "dm" | "mention";
  externalId: string;
  authorPlatformId?: string;
  authorHandleHash?: string;
  text?: string;
  occurredAt: number;
  sourceUrl?: string;
  suppressionUnverifiableReason?: string;
}

/**
 * Interna funkcija za upis inbound zapisa.
 */
export async function recordInboundInternal(
  ctx: MutationCtx,
  args: RecordInboundArgs,
): Promise<{ status: "upisano" | "vec_postoji"; inboundId: Id<"leadInbound"> }> {
  // 1. Provera postojanja — stabilan ID događaja na platformi je jedini ključ protiv duplog upisa
  const existing = await ctx.db
    .query("leadInbound")
    .withIndex("by_workspace_platform_external", (q) =>
      q
        .eq("workspaceId", args.workspaceId)
        .eq("platform", args.platform)
        .eq("externalId", args.externalId),
    )
    .first();

  if (existing !== null) {
    return { status: "vec_postoji", inboundId: existing._id };
  }

  const suppressionUnverifiable: string[] = [];
  if (args.suppressionUnverifiableReason) {
    suppressionUnverifiable.push(args.suppressionUnverifiableReason);
  }

  let status: "nov" | "povezan" | "odbacen" | "zabranjen_kontakt" = "nov";
  let linkedCompanyId: Id<"leadCompanies"> | undefined;
  let linkedPersonId: Id<"leadPeople"> | undefined;

  // 2. Provera autora i povezivanja sa ranije poznatom firmom
  if (!args.authorPlatformId) {
    suppressionUnverifiable.push("nedostaje_author_platform_id");
  } else {
    // Dva ciljana upita po indeksu (autor + status) umesto učitavanja SVIH
    // ranijih zapisa tog autora. Autor koji je komentarisao stotinu puta je
    // inače svaki novi komentar plaćao čitanjem stotinu dokumenata, a Convex
    // ima tvrdo ograničenje koliko dokumenata jedna transakcija sme da pročita.
    const suppressedPrev = await ctx.db
      .query("leadInbound")
      .withIndex("by_workspace_author_status", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("platform", args.platform)
          .eq("authorPlatformId", args.authorPlatformId)
          .eq("status", "zabranjen_kontakt"),
      )
      .first();

    if (suppressedPrev) {
      status = "zabranjen_kontakt";
    } else {
      const linkedPrev = await ctx.db
        .query("leadInbound")
        .withIndex("by_workspace_author_status", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("platform", args.platform)
            .eq("authorPlatformId", args.authorPlatformId)
            .eq("status", "povezan"),
        )
        .first();

      if (linkedPrev && linkedPrev.linkedCompanyId) {
        // Proveri da li je povezana firma na listi zabrane
        const suppCheck = await isSuppressed(ctx, {
          workspaceId: args.workspaceId,
          companyId: linkedPrev.linkedCompanyId,
        });

        if (suppCheck.suppressed) {
          status = "zabranjen_kontakt";
        } else {
          // Poveži novi događaj sa već postojećom firmom, ali NE menjaj podatke firme
          linkedCompanyId = linkedPrev.linkedCompanyId;
          linkedPersonId = linkedPrev.linkedPersonId;
          status = "povezan";
        }
      }
    }
  }

  // Ako autor nije bio povezan sa firmom, provera zabrane po kontaktu (telefon/email/PIB)
  // nije mogla da se izvede jer ti podaci još uvek ne postoje za ovaj inbound nalog.
  if (status === "nov" && suppressionUnverifiable.length === 0) {
    suppressionUnverifiable.push(
      "autor_nije_povezan_sa_kontakt_podacima_za_proveru",
    );
  }

  // 3. Izvođenje signala iz teksta poruke (npr. pitao_cenu, nema_sajt)
  const derivedSignals = deriveSignalsFromInboundText(args.text);

  // 4. Upis u čekaonicu
  const inboundId = await ctx.db.insert("leadInbound", {
    workspaceId: args.workspaceId,
    platform: args.platform,
    kind: args.kind,
    externalId: args.externalId,
    authorPlatformId: args.authorPlatformId,
    authorHandleHash: args.authorHandleHash,
    text: args.text,
    occurredAt: args.occurredAt,
    sourceUrl: args.sourceUrl,
    status,
    linkedCompanyId,
    linkedPersonId,
    derivedSignals,
    suppressionUnverifiable:
      suppressionUnverifiable.length > 0 ? suppressionUnverifiable : undefined,
    createdAt: Date.now(),
  });

  return { status: "upisano", inboundId };
}

/**
 * Beleži jedan inbound događaj sa platforme (komentar, odgovor, DM, mention).
 * Poziva se iz ingest procesa ili webhook handlera.
 */
export const recordInbound = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    platform: v.union(
      v.literal("instagram"),
      v.literal("facebook"),
      v.literal("threads"),
    ),
    kind: v.union(
      v.literal("komentar"),
      v.literal("odgovor"),
      v.literal("dm"),
      v.literal("mention"),
    ),
    externalId: v.string(),
    authorPlatformId: v.optional(v.string()),
    authorHandleHash: v.optional(v.string()),
    text: v.optional(v.string()),
    occurredAt: v.number(),
    sourceUrl: v.optional(v.string()),
    suppressionUnverifiableReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await recordInboundInternal(ctx, args);
  },
});

/**
 * Upisuje signale za JEDAN inbound zapis: signal same interakcije
 * (komentar / dm / mention) plus svaki signal izveden iz teksta.
 *
 * Postoji kao zasebna funkcija zato što se poziva sa dva mesta — za zapis koji
 * operater povezuje i za svaki raniji zapis istog autora. Dok je bila upisana
 * samo na prvom mestu, drugi put se nije upisivalo ništa.
 *
 * `observedAt` je uvek vreme DOGAĐAJA (`occurredAt`), nikada vreme klika.
 */
async function writeSignalsForInbound(
  ctx: MutationCtx,
  params: {
    workspaceId: Id<"workspaces">;
    companyId: Id<"leadCompanies">;
    personId: Id<"leadPeople">;
    inbound: Doc<"leadInbound">;
    fallbackSourceUrl: string;
  },
): Promise<void> {
  const { workspaceId, companyId, personId, inbound, fallbackSourceUrl } = params;
  const signalKind = mapInboundKindToSignal(inbound.kind);
  const source = `inbound_${inbound.platform}`;
  const sourceUrl = inbound.sourceUrl ?? fallbackSourceUrl;

  await ctx.db.insert("leadSignals", {
    workspaceId,
    companyId,
    personId,
    kind: signalKind,
    value: inbound.text,
    observedAt: inbound.occurredAt,
    source,
    sourceUrl,
  });

  for (const ds of inbound.derivedSignals) {
    if (ds !== signalKind && isKnownLeadSignalKind(ds)) {
      await ctx.db.insert("leadSignals", {
        workspaceId,
        companyId,
        personId,
        kind: ds,
        value: inbound.text,
        observedAt: inbound.occurredAt,
        source,
        sourceUrl,
      });
    }
  }
}

/**
 * Povezuje inbound zapis sa postojećom ili novom firmom (§1, §2, §8).
 *
 * Čovek potvrđuje firmu i unosi naziv ručno. Tek tada:
 * 1. Kreira se firma (ako je nova, dobija origin: "inbound" i provenance).
 * 2. Kreira se osoba (leadPeople) i identitet (leadIdentities) sa obaveznim pravnim osnovom.
 * 3. Kreiraju se signali (leadSignals) sa datumom događaja (occurredAt).
 * 4. Inbound zapis se prebacuje u status "povezan".
 */
export const linkInboundToCompany = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    inboundId: v.id("leadInbound"),

    // Izbor postojeće firme ili unos nove
    companyId: v.optional(v.id("leadCompanies")),
    newCompanyName: v.optional(v.string()),
    newCompanyCity: v.optional(v.string()),
    newCompanyStreet: v.optional(v.string()),
    newCompanyWebsite: v.optional(v.string()),

    // Podaci o osobi
    personName: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("vlasnik"),
        v.literal("direktor"),
        v.literal("menadzer"),
        v.literal("nepoznato"),
      ),
    ),

    // Podaci o identitetu i pravni osnov (ZZPL / GDPR §8)
    identityValue: v.string(),
    lawfulBasis: v.string(),
    sourceUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);

    const inbound = await ctx.db.get(args.inboundId);
    if (!inbound || inbound.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Inbound zapis nije pronađen.",
      });
    }

    // ZZPL / GDPR validacija (§8): lawfulBasis i sourceUrl su striktno obavezni
    const lawfulBasisClean = args.lawfulBasis.trim();
    if (!lawfulBasisClean) {
      throw new ConvexError({
        code: "invalid",
        message:
          "Pravni osnov (lawfulBasis) je obavezan po ZZPL/GDPR pravilima (§8).",
      });
    }

    const sourceUrlClean = args.sourceUrl.trim();
    if (!sourceUrlClean) {
      throw new ConvexError({
        code: "invalid",
        message:
          "URL izvora (sourceUrl) je obavezan po ZZPL/GDPR pravilima (§8).",
      });
    }

    const identityValueClean = args.identityValue.trim();
    if (!identityValueClean) {
      throw new ConvexError({
        code: "invalid",
        message: "Vrednost kontakta (identityValue) je obavezna.",
      });
    }

    const now = Date.now();
    let companyId: Id<"leadCompanies">;

    // 1. Razrešavanje firme
    if (args.companyId) {
      const company = await ctx.db.get(args.companyId);
      if (!company || company.workspaceId !== args.workspaceId) {
        throw new ConvexError({
          code: "not_found",
          message: "Izabrana firma nije pronađena.",
        });
      }
      companyId = args.companyId;
    } else if (args.newCompanyName && args.newCompanyName.trim().length > 0) {
      const companyName = args.newCompanyName.trim();
      const city = args.newCompanyCity?.trim() || undefined;
      const street = args.newCompanyStreet?.trim() || undefined;
      const website = args.newCompanyWebsite?.trim() || undefined;
      const domainNormalized = website ? normalizeDomain(website) : undefined;

      companyId = await ctx.db.insert("leadCompanies", {
        workspaceId: args.workspaceId,
        name: companyName,
        nameNormalized: normalizeCompanyName(companyName),
        city,
        street,
        website,
        domainNormalized,
        origin: "inbound",
        firstSeenSource: `inbound_${inbound.platform}`,
        createdAt: now,
        updatedAt: now,
        createdBy: membership.userId,
      });

      // Provenance zapisi za novu firmu (§2.4)
      await ctx.db.insert("leadFieldProvenance", {
        workspaceId: args.workspaceId,
        entityTable: "leadCompanies",
        entityId: companyId,
        fieldName: "name",
        value: companyName,
        source: `inbound_${inbound.platform}`,
        confidence: "tacno",
        humanConfirmed: true,
        observedAt: now,
      });

      if (city) {
        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadCompanies",
          entityId: companyId,
          fieldName: "city",
          value: city,
          source: `inbound_${inbound.platform}`,
          confidence: "tacno",
          humanConfirmed: true,
          observedAt: now,
        });
      }

      if (street) {
        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadCompanies",
          entityId: companyId,
          fieldName: "street",
          value: street,
          source: `inbound_${inbound.platform}`,
          confidence: "tacno",
          humanConfirmed: true,
          observedAt: now,
        });
      }

      if (website) {
        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadCompanies",
          entityId: companyId,
          fieldName: "website",
          value: website,
          source: `inbound_${inbound.platform}`,
          confidence: "tacno",
          humanConfirmed: true,
          observedAt: now,
        });
      }
    } else {
      throw new ConvexError({
        code: "invalid",
        message:
          "Morate odabrati postojeću firmu ili uneti naziv nove firme.",
      });
    }

    // 2. Kreiranje osobe u firmi (leadPeople)
    //
    // Ime osobe se NE IZMIŠLJA. Ranije je ovde stajalo
    // `args.personName?.trim() || "Kontakt sa mreže"`, a zatim se ta izmišljena
    // vrednost upisivala u `leadFieldProvenance` kao `confidence: "tacno"` i
    // `humanConfirmed: true` — dakle izmišljotina overena kao proverena
    // činjenica. To je najgori oblik greške koju ceo model poretka podataka
    // treba da spreči.
    //
    // Ako operater nije uneo ime, jedino što stvarno znamo je nalog sa kog je
    // poruka stigla. To je OPAŽENA vrednost, ne ime, pa se i beleži tako:
    // `priblizno` i `humanConfirmed: false`.
    const typedName = args.personName?.trim();
    const personNameIsHandle = !typedName;
    const personName = typedName && typedName.length > 0
      ? typedName
      : identityValueClean;
    const personRole = args.role ?? "nepoznato";
    const personId = await ctx.db.insert("leadPeople", {
      workspaceId: args.workspaceId,
      companyId,
      name: personName,
      role: personRole,
      roleConfidence: args.role ? "potvrdjeno" : "nepoznato",
      createdAt: now,
    });

    await ctx.db.insert("leadFieldProvenance", {
      workspaceId: args.workspaceId,
      entityTable: "leadPeople",
      entityId: personId,
      fieldName: "name",
      value: personName,
      source: personNameIsHandle
        ? `inbound_${inbound.platform}_nalog`
        : `inbound_${inbound.platform}`,
      sourceUrl: sourceUrlClean,
      confidence: personNameIsHandle ? "priblizno" : "tacno",
      humanConfirmed: !personNameIsHandle,
      observedAt: now,
    });

    // 3. Kreiranje identiteta (leadIdentities)
    const identityKind =
      inbound.platform === "threads"
        ? ("threads" as const)
        : inbound.platform === "instagram"
          ? ("instagram" as const)
          : ("facebook" as const);

    const normalizedValue = identityValueClean
      .toLowerCase()
      .replace(/^@+/, "");

    await ctx.db.insert("leadIdentities", {
      workspaceId: args.workspaceId,
      companyId,
      personId,
      kind: identityKind,
      value: identityValueClean,
      valueNormalized: normalizedValue,
      lawfulBasis: lawfulBasisClean,
      sourceUrl: sourceUrlClean,
      createdAt: now,
    });

    // 4. Kreiranje signala (leadSignals) sa observedAt = occurredAt događaja (§2.5)
    await writeSignalsForInbound(ctx, {
      workspaceId: args.workspaceId,
      companyId,
      personId,
      inbound,
      fallbackSourceUrl: sourceUrlClean,
    });

    // 5. Ažuriranje statusa trenutnog inbound zapisa
    await ctx.db.patch(inbound._id, {
      status: "povezan",
      linkedCompanyId: companyId,
      linkedPersonId: personId,
    });

    // 6. Ostali raniji zapisi istog autora se takođe povezuju.
    //
    // Ranije su samo dobijali status „povezan" — bez ijednog signala. Zapis je
    // izgledao obrađeno, a ono što je čovek napisao (npr. `pitao_cenu` u
    // komentaru od pre dve nedelje) nestajalo je bez traga. Status koji tvrdi
    // da je nešto obrađeno mora da znači da je i upisano.
    let alsoLinkedCount = 0;
    if (inbound.authorPlatformId) {
      const relatedNew = await ctx.db
        .query("leadInbound")
        .withIndex("by_workspace_author_status", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("platform", inbound.platform)
            .eq("authorPlatformId", inbound.authorPlatformId)
            .eq("status", "nov"),
        )
        .collect();

      for (const rel of relatedNew) {
        if (rel._id === inbound._id) continue;

        await writeSignalsForInbound(ctx, {
          workspaceId: args.workspaceId,
          companyId,
          personId,
          inbound: rel,
          fallbackSourceUrl: sourceUrlClean,
        });

        await ctx.db.patch(rel._id, {
          status: "povezan",
          linkedCompanyId: companyId,
          linkedPersonId: personId,
        });
        alsoLinkedCount++;
      }
    }

    return {
      success: true,
      companyId,
      personId,
      inboundId: inbound._id,
      // Koliko je ranijih poruka istog autora povezano zajedno sa ovom —
      // operater mora da vidi da se desilo više nego što je kliknuo.
      alsoLinkedCount,
    };
  },
});

/**
 * Odbacuje inbound lead uz obavezan razlog odbacivanja.
 */
export const dismissInbound = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    inboundId: v.id("leadInbound"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);

    const reasonClean = args.reason.trim();
    if (!reasonClean) {
      throw new ConvexError({
        code: "invalid",
        message: "Razlog odbacivanja je obavezan.",
      });
    }

    const inbound = await ctx.db.get(args.inboundId);
    if (!inbound || inbound.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Inbound zapis nije pronađen.",
      });
    }

    await ctx.db.patch(inbound._id, {
      status: "odbacen",
      // Razlog je bio obavezan a nije se nigde upisivao — obavezno polje koje
      // se baci je samo trošak operateru, bez ijedne koristi kasnije.
      dismissReason: reasonClean,
      dismissedAt: Date.now(),
      dismissedBy: membership.userId,
    });

    return { success: true };
  },
});

/**
 * Lista inbound zapisa sa opcionim filterima po statusu i platformi.
 */
export const listInbound = query({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.optional(
      v.union(
        v.literal("nov"),
        v.literal("povezan"),
        v.literal("odbacen"),
        v.literal("zabranjen_kontakt"),
      ),
    ),
    platform: v.optional(
      v.union(
        v.literal("instagram"),
        v.literal("facebook"),
        v.literal("threads"),
      ),
    ),
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

    const maxLimit = Math.min(args.limit ?? 100, 500);

    let records;
    if (args.status) {
      records = await ctx.db
        .query("leadInbound")
        .withIndex("by_workspace_status", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", args.status!),
        )
        .take(maxLimit);
    } else {
      records = await ctx.db
        .query("leadInbound")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .take(maxLimit);
    }

    if (args.platform) {
      records = records.filter((r) => r.platform === args.platform);
    }

    return records;
  },
});

/**
 * Dohvata pojedinačni inbound zapis.
 */
export const getInbound = query({
  args: {
    workspaceId: v.id("workspaces"),
    inboundId: v.id("leadInbound"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const record = await ctx.db.get(args.inboundId);
    if (!record || record.workspaceId !== args.workspaceId) {
      return null;
    }

    return record;
  },
});
