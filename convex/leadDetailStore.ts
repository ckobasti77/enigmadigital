import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireMembership } from "./lib/auth";

/**
 * LM10 — Ekran jednog leada.
 *
 * Vraća sve što o jednoj firmi znamo:
 * - osnovne podatke o firmi
 * - povezane osobe (fizička lica)
 * - komunikacione identitete (kontakte)
 * - poreklo tvrdnji za svako pojedinačno polje (leadFieldProvenance)
 * - hronološke signale opažanja (leadSignals, do 200 stavki, uz signalsTruncated zastavicu)
 */
export const getLeadDetail = query({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
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

    // 1. Osobe vezane za firmu
    const people = await ctx.db
      .query("leadPeople")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .collect();

    // 2. Identiteti (kontakt kanali)
    const identities = await ctx.db
      .query("leadIdentities")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .collect();

    // 3. Signali — najviše 200, i to NAJSKORIJIH 200.
    //
    // Ovde je bila greška koja se ne vidi dok ne bude više od 200 signala:
    // `.take(201)` bez `.order("desc")` uzima 201 NAJSTARIJI red (indeks ide
    // rastuće po vremenu nastanka), odsecanje ostavi 200 najstarijih, a
    // naknadno sortiranje po `observedAt` opadajuće ih samo PREUREDI — pa
    // ekran prikaže signale od pre više meseci kao „najskorije". Za firmu sa
    // mnogo interakcija to znači da se „otvorio stranicu pre 20 minuta" nikad
    // ne bi pojavilo, a lista bi i dalje tvrdila da je hronološka.
    const rawSignals = await ctx.db
      .query("leadSignals")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
      )
      .order("desc")
      .take(201);

    const signalsTruncated = rawSignals.length > 200;
    const signals = signalsTruncated ? rawSignals.slice(0, 200) : rawSignals;

    // `_creationTime` (redosled indeksa) i `observedAt` nisu isto: signal iz
    // uvoza može biti upisan danas a opažen pre godinu dana. Zato se lista i
    // dalje sortira po `observedAt`, ali sada nad SKORIJIM skupom.
    signals.sort((a, b) => b.observedAt - a.observedAt);

    // 4. Poreklo tvrdnji po poljima (leadFieldProvenance)
    const provenanceByField: Record<
      string,
      {
        source: string;
        sourceUrl?: string;
        confidence: "tacno" | "priblizno" | "nepoznato";
        humanConfirmed: boolean;
        observedAt: number;
      }
    > = {};

    // 4a. Poreklo za polja firme
    const companyProvs = await ctx.db
      .query("leadFieldProvenance")
      .withIndex("by_workspace_entity_field", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("entityTable", "leadCompanies")
          .eq("entityId", String(args.companyId)),
      )
      .collect();

    for (const prov of companyProvs) {
      provenanceByField[prov.fieldName] = {
        source: prov.source,
        sourceUrl: prov.sourceUrl,
        confidence: prov.confidence,
        humanConfirmed: prov.humanConfirmed,
        observedAt: prov.observedAt,
      };
      provenanceByField[`leadCompanies:${prov.fieldName}`] = {
        source: prov.source,
        sourceUrl: prov.sourceUrl,
        confidence: prov.confidence,
        humanConfirmed: prov.humanConfirmed,
        observedAt: prov.observedAt,
      };
    }

    // 4b. Poreklo za polja osoba
    for (const person of people) {
      const personProvs = await ctx.db
        .query("leadFieldProvenance")
        .withIndex("by_workspace_entity_field", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("entityTable", "leadPeople")
            .eq("entityId", String(person._id)),
        )
        .collect();

      for (const prov of personProvs) {
        provenanceByField[`person_${person._id}_${prov.fieldName}`] = {
          source: prov.source,
          sourceUrl: prov.sourceUrl,
          confidence: prov.confidence,
          humanConfirmed: prov.humanConfirmed,
          observedAt: prov.observedAt,
        };
        provenanceByField[`${person._id}:${prov.fieldName}`] = {
          source: prov.source,
          sourceUrl: prov.sourceUrl,
          confidence: prov.confidence,
          humanConfirmed: prov.humanConfirmed,
          observedAt: prov.observedAt,
        };
        if (prov.fieldName === "name") {
          provenanceByField[`person_${person._id}`] = {
            source: prov.source,
            sourceUrl: prov.sourceUrl,
            confidence: prov.confidence,
            humanConfirmed: prov.humanConfirmed,
            observedAt: prov.observedAt,
          };
        }
      }
    }

    // 4c. Poreklo za identitete
    for (const identity of identities) {
      const idProvs = await ctx.db
        .query("leadFieldProvenance")
        .withIndex("by_workspace_entity_field", (q) =>
          q
            .eq("workspaceId", args.workspaceId)
            .eq("entityTable", "leadIdentities")
            .eq("entityId", String(identity._id)),
        )
        .collect();

      for (const prov of idProvs) {
        const item = {
          source: prov.source,
          sourceUrl: prov.sourceUrl,
          confidence: prov.confidence,
          humanConfirmed: prov.humanConfirmed,
          observedAt: prov.observedAt,
        };
        provenanceByField[`identity_${identity._id}`] = item;
        provenanceByField[String(identity._id)] = item;
        provenanceByField[`${identity._id}:${prov.fieldName}`] = item;
      }
    }

    return {
      company,
      people,
      identities,
      provenanceByField,
      signals,
      signalsTruncated,
    };
  },
});
