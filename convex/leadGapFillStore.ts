import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import { normalizeDomain, normalizePhoneRs } from "./lib/leadNormalize";
import { isSuppressed } from "./leadSuppressionStore";
import { GAP_TYPE_VALIDATOR } from "./leadGapsStore";

/**
 * ============================================================================
 * LEAD GAP FILL STORE (§0, §8, §9.2, LM12) — Popunjavanje rupa u podacima
 * ============================================================================
 *
 * ARHITEKTONSKA I PRAVNA PRAVILA:
 * 1. Za `bez_telefona` i `bez_kontakt_osobe` pravni osnov (`lawfulBasis`) i
 *    izvor (`sourceUrl`) su STRIKTNO OBAVEZNI po ZZPL/GDPR pravilima.
 * 2. Svaki unos kreira `leadFieldProvenance` zapis sa `source: "rucni_unos"`,
 *    `humanConfirmed: true` i `confidence` nivoom koji BIRA ČOVEK („tacno"
 *    ili „priblizno"). „Tacno" se nikada ne podrazumeva automatski.
 * 3. Telefon se obavezno normalizuje kroz `normalizePhoneRs`. Ako nije
 *    prepoznat kao validan srpski broj, unos se odbija greškom.
 * 4. Pre svakog upisa proverava se `isSuppressed` („ne diraj" lista).
 *    Ako je identifikator zabranjen, operacija se momentalno prekida.
 * ============================================================================
 */

export const fillGap = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    companyId: v.id("leadCompanies"),
    gapType: GAP_TYPE_VALIDATOR,
    vrednost: v.string(),
    lawfulBasis: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    personName: v.optional(v.string()),
    role: v.optional(
      v.union(
        v.literal("vlasnik"),
        v.literal("direktor"),
        v.literal("menadzer"),
        v.literal("nepoznato"),
      ),
    ),
    confidence: v.union(v.literal("tacno"), v.literal("priblizno")),
    ownerUserId: v.optional(v.id("users")),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
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

    const now = Date.now();
    const rawVal = args.vrednost.trim();

    if (rawVal.length === 0 && args.gapType !== "bez_vlasnika") {
      throw new ConvexError({
        code: "empty_value",
        message: "Vrednost za popunjavanje rupe ne može biti prazna.",
      });
    }

    switch (args.gapType) {
      case "bez_telefona": {
        // Pravni osnov i URL izvora su obavezni za podatke o ličnosti (§8)
        if (
          !args.lawfulBasis ||
          args.lawfulBasis.trim().length === 0 ||
          args.lawfulBasis === "nepoznato"
        ) {
          throw new ConvexError({
            code: "missing_lawful_basis",
            message:
              "Pravni osnov je obavezan po ZZPL-u pri unosu broja telefona.",
          });
        }

        if (!args.sourceUrl || args.sourceUrl.trim().length === 0) {
          throw new ConvexError({
            code: "missing_source_url",
            message:
              "URL adresa izvora ili dokumenta je obavezna po ZZPL-u pri unosu broja telefona.",
          });
        }

        // Normalizacija srpskog broja telefona
        const normPhone = normalizePhoneRs(rawVal);
        if (!normPhone) {
          throw new ConvexError({
            code: "invalid_phone_number",
            message:
              "Broj telefona nije prepoznat kao validan srpski broj (npr. 0601234567, 0113979965 ili +38160...).",
          });
        }

        // Provera „ne diraj" liste zabrane (§9.3)
        const suppression = await isSuppressed(ctx, {
          workspaceId: args.workspaceId,
          phone: normPhone,
          companyId: args.companyId,
        });

        if (suppression.suppressed) {
          throw new ConvexError({
            code: "suppressed_value",
            message: `Ovaj broj telefona ili firma se nalazi na listi zabrane kontakta („ne diraj" lista). Razlog: ${
              suppression.reason ?? "zabranjen kontakt"
            }.`,
          });
        }

        let personId: Id<"leadPeople"> | undefined;
        if (args.personName && args.personName.trim().length > 0) {
          const personNameTrimmed = args.personName.trim();
          personId = await ctx.db.insert("leadPeople", {
            workspaceId: args.workspaceId,
            companyId: args.companyId,
            name: personNameTrimmed,
            role: args.role ?? "nepoznato",
            // Sigurnost u BROJ TELEFONA i sigurnost u ULOGU osobe su dve
            // različite tvrdnje: čovek može da bude siguran u broj a da samo
            // pretpostavlja da je taj čovek vlasnik. Ranije je `confidence`
            // telefona prepisivan u `roleConfidence`, pa je pretpostavka o
            // ulozi dobijala status „potvrđeno".
            //
            // Ako uloga nije izričito uneta, ne zna se — i tako se beleži.
            roleConfidence: args.role === undefined ? "nepoznato" : "verovatno",
            createdAt: now,
          });

          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadPeople",
            entityId: String(personId),
            fieldName: "name",
            value: personNameTrimmed,
            source: "rucni_unos",
            sourceUrl: args.sourceUrl.trim(),
            confidence: args.confidence,
            humanConfirmed: true,
            observedAt: now,
          });
        }

        const identityId = await ctx.db.insert("leadIdentities", {
          workspaceId: args.workspaceId,
          companyId: args.companyId,
          personId,
          kind: "phone",
          value: rawVal,
          valueNormalized: normPhone,
          lawfulBasis: args.lawfulBasis.trim(),
          sourceUrl: args.sourceUrl.trim(),
          createdAt: now,
        });

        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadIdentities",
          entityId: String(identityId),
          fieldName: "phone",
          value: normPhone,
          source: "rucni_unos",
          sourceUrl: args.sourceUrl.trim(),
          confidence: args.confidence,
          humanConfirmed: true,
          observedAt: now,
        });

        return {
          success: true,
          message: `Broj telefona ${normPhone} je uspešno evidentiran sa pravnim osnovom.`,
        };
      }

      case "bez_kontakt_osobe": {
        const personName = (args.personName || rawVal).trim();
        if (personName.length === 0) {
          throw new ConvexError({
            code: "empty_person_name",
            message: "Ime kontakt osobe ne može biti prazno.",
          });
        }

        if (
          !args.lawfulBasis ||
          args.lawfulBasis.trim().length === 0 ||
          args.lawfulBasis === "nepoznato"
        ) {
          throw new ConvexError({
            code: "missing_lawful_basis",
            message:
              "Pravni osnov je obavezan po ZZPL-u pri unosu kontakt osobe.",
          });
        }

        if (!args.sourceUrl || args.sourceUrl.trim().length === 0) {
          throw new ConvexError({
            code: "missing_source_url",
            message:
              "URL adresa izvora ili dokumenta je obavezna po ZZPL-u pri unosu kontakt osobe.",
          });
        }

        const suppression = await isSuppressed(ctx, {
          workspaceId: args.workspaceId,
          companyId: args.companyId,
        });

        if (suppression.suppressed) {
          throw new ConvexError({
            code: "suppressed_value",
            message: `Firma se nalazi na listi zabrane kontakta („ne diraj" lista). Razlog: ${
              suppression.reason ?? "zabranjen kontakt"
            }.`,
          });
        }

        const personId = await ctx.db.insert("leadPeople", {
          workspaceId: args.workspaceId,
          companyId: args.companyId,
          name: personName,
          role: args.role ?? "nepoznato",
          roleConfidence:
            args.confidence === "tacno" ? "potvrdjeno" : "verovatno",
          createdAt: now,
        });

        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadPeople",
          entityId: String(personId),
          fieldName: "name",
          value: personName,
          source: "rucni_unos",
          sourceUrl: args.sourceUrl.trim(),
          confidence: args.confidence,
          humanConfirmed: true,
          observedAt: now,
        });

        return {
          success: true,
          message: `Kontakt osoba „${personName}" je uspešno evidentirana.`,
        };
      }

      case "bez_sajta": {
        const normDomain = normalizeDomain(rawVal);
        if (!normDomain && !rawVal.includes(".")) {
          throw new ConvexError({
            code: "invalid_domain",
            message:
              "Uneti veb-sajt ili domen nije prepoznat kao validna veb adresa.",
          });
        }

        const suppression = await isSuppressed(ctx, {
          workspaceId: args.workspaceId,
          domain: normDomain,
          companyId: args.companyId,
        });

        if (suppression.suppressed) {
          throw new ConvexError({
            code: "suppressed_value",
            message: `Domen ili firma se nalazi na listi zabrane kontakta. Razlog: ${
              suppression.reason ?? "zabranjen kontakt"
            }.`,
          });
        }

        await ctx.db.patch(args.companyId, {
          website: rawVal,
          domainNormalized: normDomain ?? undefined,
          updatedAt: now,
        });

        const identityId = await ctx.db.insert("leadIdentities", {
          workspaceId: args.workspaceId,
          companyId: args.companyId,
          kind: "website",
          value: rawVal,
          valueNormalized: normDomain,
          lawfulBasis: args.lawfulBasis?.trim() || "javni_podatak",
          sourceUrl: args.sourceUrl?.trim() || rawVal,
          createdAt: now,
        });

        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadCompanies",
          entityId: String(args.companyId),
          fieldName: "website",
          value: rawVal,
          source: "rucni_unos",
          sourceUrl: args.sourceUrl?.trim() || rawVal,
          confidence: args.confidence,
          humanConfirmed: true,
          observedAt: now,
        });

        return {
          success: true,
          message: `Veb-sajt „${rawVal}" je uspešno ažuriran.`,
        };
      }

      case "bez_pib": {
        const cleanPib = rawVal.replace(/\D/g, "");
        if (cleanPib.length < 8 || cleanPib.length > 9) {
          throw new ConvexError({
            code: "invalid_pib",
            message:
              "PIB mora sadržati tačno 8 ili 9 numeričkih cifara (npr. 108234567).",
          });
        }

        const suppression = await isSuppressed(ctx, {
          workspaceId: args.workspaceId,
          pib: cleanPib,
          companyId: args.companyId,
        });

        if (suppression.suppressed) {
          throw new ConvexError({
            code: "suppressed_value",
            message: `PIB ili firma se nalazi na listi zabrane kontakta. Razlog: ${
              suppression.reason ?? "zabranjen kontakt"
            }.`,
          });
        }

        await ctx.db.patch(args.companyId, {
          pib: cleanPib,
          updatedAt: now,
        });

        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadCompanies",
          entityId: String(args.companyId),
          fieldName: "pib",
          value: cleanPib,
          source: "rucni_unos",
          sourceUrl: args.sourceUrl?.trim() || "apr_registar",
          confidence: args.confidence,
          humanConfirmed: true,
          observedAt: now,
        });

        return {
          success: true,
          message: `PIB ${cleanPib} je uspešno evidentiran.`,
        };
      }

      case "bez_vlasnika": {
        const targetUserId = args.ownerUserId ?? membership.userId;

        const targetMember = await ctx.db
          .query("members")
          .withIndex("by_user", (q) => q.eq("userId", targetUserId))
          .first();

        if (!targetMember || targetMember.workspaceId !== args.workspaceId) {
          throw new ConvexError({
            code: "invalid_user",
            message: "Izabrani operater nije član ovog radnog prostora.",
          });
        }

        const existingAssignment = await ctx.db
          .query("leadAssignments")
          .withIndex("by_workspace_company", (q) =>
            q
              .eq("workspaceId", args.workspaceId)
              .eq("companyId", args.companyId),
          )
          .first();

        if (!existingAssignment) {
          await ctx.db.insert("leadAssignments", {
            workspaceId: args.workspaceId,
            companyId: args.companyId,
            ownerUserId: targetUserId,
            stage: "nov",
            createdAt: now,
            updatedAt: now,
          });
        } else {
          await ctx.db.patch(existingAssignment._id, {
            ownerUserId: targetUserId,
            updatedAt: now,
          });
        }

        await ctx.db.insert("leadStageEvents", {
          workspaceId: args.workspaceId,
          companyId: args.companyId,
          kind: "dodela",
          fromValue: existingAssignment
            ? String(existingAssignment.ownerUserId)
            : undefined,
          toValue: String(targetUserId),
          actorUserId: membership.userId,
          note: "Ručno popunjavanje rupe: lead dodeljen operateru.",
          occurredAt: now,
        });

        return {
          success: true,
          message: "Vlasništvo nad leadom je uspešno dodeljeno.",
        };
      }

      default:
        throw new ConvexError({
          code: "unsupported_gap_type",
          message: `Vrsta rupe „${args.gapType}" nije podržana za popunjavanje.`,
        });
    }
  },
});
