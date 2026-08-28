import { mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizePhoneRs,
  normalizeCompanyWallUrl,
  LEAD_SIGNAL_KINDS,
  type LeadSignalKind,
} from "./lib/leadNormalize";
import { isSuppressed, type MatchOn, type SuppressionCheckResult } from "./leadSuppressionStore";
import type { ParsedLeadRow } from "./lib/leadImportParse";

/**
 * ============================================================================
 * LEAD IMPORT STORE (§0, §2.4, §3, §5, §9.3, LM3)
 * ============================================================================
 *
 * Staging mehanizam za uvoz tabele lidova.
 *
 * KLJUČNA PRAVILA:
 * 1. NIŠTA ne ulazi u `leadCompanies` bez izričite ljudske potvrde (applyImport).
 * 2. Deduplikacija se vrši strogo po redosledu jačine ključeva (§3):
 *    PIB -> CompanyWall URL -> Domen sajta -> Normalizovan naziv + grad -> Telefon.
 * 3. Provera zabrane kontakta (suppression / "ne diraj" lista) se radi PRI UVOZU.
 *    Ako je ključ neproveriv (`unverifiable`), red dobija `decision: "nerazreseno"`
 *    i NE SME se automatski primeniti (§0, pravilo 5).
 * 4. Poreklo tvrdnji (leadFieldProvenance):
 *    Polje koje je IZVEDENO, a ne pročitano iz tabele, dobija `confidence: "priblizno"`,
 *    nikada "tacno" (npr. grad "Beograd" izveden iz beogradske opštine, ili
 *    CompanyWall aproksimativno podudaranje).
 * 5. Sukobljene tvrdnje (npr. Ime osobe = Adaleta Krasnić, a u napomeni Vlasnik: Ana Krasnić)
 *    se prijavljuju kao sukob i ČUVAJU SE OBE (§2.4).
 * ============================================================================
 */

export const parsedLeadRowValidator = v.object({
  nazivFirme: v.optional(v.string()),
  ulica: v.optional(v.string()),
  opstina: v.optional(v.string()),
  grad: v.optional(v.string()),
  telefon: v.optional(v.string()),
  telefonNapomena: v.optional(v.string()),
  email: v.optional(v.string()),
  sajt: v.optional(v.string()),
  imeOsobe: v.optional(v.string()),
  uloga: v.optional(v.string()),
  ocena: v.optional(
    v.object({
      vrednost: v.optional(v.number()),
      skala: v.optional(v.number()),
      brojRecenzija: v.optional(v.number()),
      izvor: v.optional(v.string()),
    }),
  ),
  companyWallUrl: v.optional(v.string()),
  companyWallTacnost: v.optional(
    v.union(v.literal("tacno"), v.literal("priblizno")),
  ),
  pib: v.optional(v.string()),
  maticniBroj: v.optional(v.string()),
  sifraDelatnosti: v.optional(v.string()),
  napomena: v.optional(v.string()),
  izvori: v.array(v.string()),
  derivedSignals: v.array(v.string()),
  // Polja koja je parser ZAKLJUČIO, ne pročitao (vidi ParsedLeadRow.derivedFields).
  // Opciono zbog redova upisanih pre nego što je polje postojalo.
  derivedFields: v.optional(v.array(v.string())),
});

export type RowConflict = {
  field: string;
  postojeca: string;
  nova: string;
  izvor: string;
};

export type RowMatchResult = {
  matchedCompanyId?: Id<"leadCompanies">;
  matchedBy?: "pib" | "companywall" | "domain" | "name_city" | "phone";
};

// ── Pomoćne funkcije ──────────────────────────────────────────────────────────

function mapRole(rawRole?: string): "vlasnik" | "direktor" | "menadzer" | "nepoznato" {
  if (!rawRole) return "nepoznato";
  const lower = rawRole.toLowerCase().trim();
  if (lower.includes("vlasnik") || lower.includes("osnivac") || lower.includes("osnivač")) {
    return "vlasnik";
  }
  if (lower.includes("direktor") || lower.includes("ceo")) {
    return "direktor";
  }
  if (lower.includes("menadzer") || lower.includes("menadžer") || lower.includes("upravnik")) {
    return "menadzer";
  }
  return "nepoznato";
}

function extractBookingToolName(note?: string): string | undefined {
  if (!note) return undefined;
  const lower = note.toLowerCase();
  if (lower.includes("setmore")) return "setmore";
  if (lower.includes("dikidi")) return "dikidi";
  if (lower.includes("fresha")) return "fresha";
  if (lower.includes("treatwell")) return "treatwell";
  if (lower.includes("sredime")) return "sredime";
  return undefined;
}

/**
 * Izdvaja tvrdnju o imenu osobe iz napomene (npr. "Vlasnik: Ana Krasnić").
 * Služi za otkrivanje sukoba unutar istog reda (§5.2, red 61 "Pro Team Borča").
 */
export function extractPersonClaimFromNote(note?: string): string | undefined {
  if (!note) return undefined;
  const match = note.match(/(?:vlasnik|vlasnica|direktor|kontakt|menadzer|menadžer)\s*:\s*([A-Za-zČĆŠĐŽčćšđž\s]+?)(?:[,;.]|$)/i);
  if (match && match[1]) {
    const extracted = match[1].trim();
    if (extracted.length >= 3 && !/^(?:da|ne|ima|nema|nepoznato)$/i.test(extracted)) {
      return extracted;
    }
  }
  return undefined;
}

// ── 1. Pronalaženje postojeće firme (Dedupe po jačini ključa §3) ──────────────

/**
 * Traži postojeću firmu u bazi podataka redom po jačini ključa:
 * 1. PIB (zvaničan, jedinstven)
 * 2. CompanyWall URL (stabilan identifikator)
 * 3. Domen sajta (normalizovan)
 * 4. Normalizovan naziv + grad
 * 5. Telefon centrale / kontakta (normalizovan na +381)
 */
export async function matchRowToExistingCompany(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  parsed: ParsedLeadRow,
): Promise<RowMatchResult> {
  // 1. PIB
  if (parsed.pib) {
    const cleanPib = parsed.pib.trim();
    if (cleanPib) {
      const match = await ctx.db
        .query("leadCompanies")
        .withIndex("by_workspace_pib", (q) =>
          q.eq("workspaceId", workspaceId).eq("pib", cleanPib),
        )
        .first();
      if (match !== null) {
        return { matchedCompanyId: match._id, matchedBy: "pib" };
      }
    }
  }

  // 2. CompanyWall URL
  if (parsed.companyWallUrl) {
    const normCw = normalizeCompanyWallUrl(parsed.companyWallUrl);
    if (normCw) {
      const match = await ctx.db
        .query("leadCompanies")
        .withIndex("by_workspace_companywall", (q) =>
          q.eq("workspaceId", workspaceId).eq("companyWallUrl", normCw),
        )
        .first();
      if (match !== null) {
        return { matchedCompanyId: match._id, matchedBy: "companywall" };
      }
    }
  }

  // 3. Domen sajta
  if (parsed.sajt) {
    const normDomain = normalizeDomain(parsed.sajt);
    if (normDomain) {
      const match = await ctx.db
        .query("leadCompanies")
        .withIndex("by_workspace_domain", (q) =>
          q.eq("workspaceId", workspaceId).eq("domainNormalized", normDomain),
        )
        .first();
      if (match !== null) {
        return { matchedCompanyId: match._id, matchedBy: "domain" };
      }
    }
  }

  // 4. Normalizovan naziv + grad
  if (parsed.nazivFirme && parsed.grad) {
    const normName = normalizeCompanyName(parsed.nazivFirme);
    const cleanCity = parsed.grad.trim();
    if (normName && cleanCity) {
      const match = await ctx.db
        .query("leadCompanies")
        .withIndex("by_workspace_name_city", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("nameNormalized", normName)
            .eq("city", cleanCity),
        )
        .first();
      if (match !== null) {
        return { matchedCompanyId: match._id, matchedBy: "name_city" };
      }
    }
  }

  // 5. Telefon
  if (parsed.telefon) {
    const normPhone = normalizePhoneRs(parsed.telefon);
    if (normPhone) {
      const identityMatch = await ctx.db
        .query("leadIdentities")
        .withIndex("by_workspace_kind_value", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("kind", "phone")
            .eq("valueNormalized", normPhone),
        )
        .first();
      if (identityMatch !== null) {
        return { matchedCompanyId: identityMatch.companyId, matchedBy: "phone" };
      }
    }
  }

  return {};
}

// ── 2. Detekcija sukoba polja (§2.4) ──────────────────────────────────────────

/**
 * Poredi polje po polje sa postojećom firmom i otkriva sukobe.
 * Sukob je isključivo kada OBE strane imaju vrednost i one se razlikuju.
 * Takođe proverava sukob tvrdnji unutar istog reda (npr. kolona vs napomena).
 */
export async function detectRowConflicts(
  ctx: QueryCtx | MutationCtx,
  workspaceId: Id<"workspaces">,
  parsed: ParsedLeadRow,
  matchedCompanyId?: Id<"leadCompanies">,
): Promise<RowConflict[]> {
  const conflicts: RowConflict[] = [];

  // A. Sukob unutar samog reda uvoza (npr. Ime_osobe vs Vlasnik u Napomeni)
  if (parsed.imeOsobe && parsed.napomena) {
    const notePersonClaim = extractPersonClaimFromNote(parsed.napomena);
    if (
      notePersonClaim &&
      normalizeCompanyName(notePersonClaim) !== normalizeCompanyName(parsed.imeOsobe)
    ) {
      conflicts.push({
        field: "imeOsobe",
        postojeca: parsed.imeOsobe,
        nova: notePersonClaim,
        izvor: "napomena",
      });
    }
  }

  // B. Sukob u odnosu na postojeću firmu u bazi
  if (matchedCompanyId) {
    const existing = await ctx.db.get(matchedCompanyId);
    if (existing && existing.workspaceId === workspaceId) {
      // Naziv firme
      if (
        existing.name &&
        parsed.nazivFirme &&
        normalizeCompanyName(existing.name) !== normalizeCompanyName(parsed.nazivFirme)
      ) {
        conflicts.push({
          field: "name",
          postojeca: existing.name,
          nova: parsed.nazivFirme,
          izvor: "tabela",
        });
      }

      // Ulica
      if (
        existing.street &&
        parsed.ulica &&
        existing.street.trim().toLowerCase() !== parsed.ulica.trim().toLowerCase()
      ) {
        conflicts.push({
          field: "street",
          postojeca: existing.street,
          nova: parsed.ulica,
          izvor: "tabela",
        });
      }

      // Opština
      if (
        existing.municipality &&
        parsed.opstina &&
        existing.municipality.trim().toLowerCase() !== parsed.opstina.trim().toLowerCase()
      ) {
        conflicts.push({
          field: "municipality",
          postojeca: existing.municipality,
          nova: parsed.opstina,
          izvor: "tabela",
        });
      }

      // Grad
      if (
        existing.city &&
        parsed.grad &&
        existing.city.trim().toLowerCase() !== parsed.grad.trim().toLowerCase()
      ) {
        conflicts.push({
          field: "city",
          postojeca: existing.city,
          nova: parsed.grad,
          izvor: "tabela",
        });
      }

      // PIB
      if (existing.pib && parsed.pib && existing.pib.trim() !== parsed.pib.trim()) {
        conflicts.push({
          field: "pib",
          postojeca: existing.pib,
          nova: parsed.pib,
          izvor: "tabela",
        });
      }

      // Matični broj
      if (
        existing.maticniBroj &&
        parsed.maticniBroj &&
        existing.maticniBroj.trim() !== parsed.maticniBroj.trim()
      ) {
        conflicts.push({
          field: "maticniBroj",
          postojeca: existing.maticniBroj,
          nova: parsed.maticniBroj,
          izvor: "tabela",
        });
      }

      // Domen / Web sajt
      if (existing.website && parsed.sajt) {
        const dom1 = normalizeDomain(existing.website);
        const dom2 = normalizeDomain(parsed.sajt);
        if (dom1 && dom2 && dom1 !== dom2) {
          conflicts.push({
            field: "website",
            postojeca: existing.website,
            nova: parsed.sajt,
            izvor: "tabela",
          });
        }
      }

      // Osoba u firmi
      if (parsed.imeOsobe) {
        const existingPeople = await ctx.db
          .query("leadPeople")
          .withIndex("by_workspace_company", (q) =>
            q.eq("workspaceId", workspaceId).eq("companyId", matchedCompanyId),
          )
          .collect();

        if (existingPeople.length > 0) {
          const parsedNorm = normalizeCompanyName(parsed.imeOsobe);
          const hasMatch = existingPeople.some(
            (p) => normalizeCompanyName(p.name) === parsedNorm,
          );
          if (!hasMatch) {
            conflicts.push({
              field: "imeOsobe",
              postojeca: existingPeople.map((p) => p.name).join(", "),
              nova: parsed.imeOsobe,
              izvor: "tabela",
            });
          }
        }
      }
    }
  }

  return conflicts;
}

// ── 3. Kreiranje uvoza u staging-u (createImport) ─────────────────────────────

/**
 * Prima rezultat parsiranja tabele i upisuje podatke u staging tabele
 * `leadImports` i `leadImportRows`.
 *
 * KRITIČNO PRAVILO:
 * Ova funkcija NIŠTA ne dira u tabeli `leadCompanies`!
 */
export const createImport = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    fileName: v.string(),
    sheetsChosen: v.array(v.string()),
    headerRowIndex: v.number(),
    rows: v.array(parsedLeadRowValidator),
    skipped: v.array(v.object({ rowIndex: v.number(), razlog: v.string() })),
    warnings: v.array(v.string()),
    sourceSheet: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);

    const sheetName = args.sourceSheet ?? args.sheetsChosen[0] ?? "Sheet1";

    const importId = await ctx.db.insert("leadImports", {
      workspaceId: args.workspaceId,
      fileName: args.fileName,
      uploadedBy: membership.userId,
      uploadedAt: Date.now(),
      status: "u_pregledu",
      sheetsChosen: args.sheetsChosen,
      headerRowIndex: args.headerRowIndex,
      rowsParsed: args.rows.length,
      rowsSkipped: args.skipped.length,
      warnings: args.warnings,
    });

    for (let i = 0; i < args.rows.length; i++) {
      const parsedRow = args.rows[i] as ParsedLeadRow;
      const rowIndex = args.headerRowIndex + 2 + i; // 1-indexed stvarni red

      // 1. Spajanje sa postojećom firmom
      const matchRes = await matchRowToExistingCompany(
        ctx,
        args.workspaceId,
        parsedRow,
      );

      // 2. Detekcija sukoba
      const conflicts = await detectRowConflicts(
        ctx,
        args.workspaceId,
        parsedRow,
        matchRes.matchedCompanyId,
      );

      // 3. Provera zabrane kontakta (suppression)
      const suppRes = await isSuppressed(ctx, {
        workspaceId: args.workspaceId,
        pib: parsedRow.pib,
        domain: parsedRow.sajt,
        phone: parsedRow.telefon,
        email: parsedRow.email,
        companyId: matchRes.matchedCompanyId,
      });

      // 4. Određivanje početne odluke
      let decision: "nova_firma" | "spoji" | "preskoci" | "nerazreseno" = "nova_firma";

      if (suppRes.suppressed) {
        decision = "preskoci";
      } else if (suppRes.unverifiable && suppRes.unverifiable.length > 0) {
        // PRAVILO: Nepoznato stanje nije dozvola -> nerazreseno
        decision = "nerazreseno";
      } else if (conflicts.length > 0) {
        // Ako ima sukoba, čovek mora da potvrdi
        decision = "nerazreseno";
      } else if (matchRes.matchedCompanyId) {
        decision = "spoji";
      } else {
        decision = "nova_firma";
      }

      await ctx.db.insert("leadImportRows", {
        workspaceId: args.workspaceId,
        importId,
        sourceSheet: sheetName,
        sourceRowIndex: rowIndex,
        parsed: parsedRow,
        matchedCompanyId: matchRes.matchedCompanyId,
        matchedBy: matchRes.matchedBy,
        decision,
        conflicts,
        suppression: {
          suppressed: suppRes.suppressed,
          matchedOn: suppRes.matchedOn,
          unverifiable: suppRes.unverifiable,
        },
      });
    }

    return { importId, rowsCount: args.rows.length };
  },
});

// ── 4. Ručno postavljanje odluke za red (setRowDecision) ───────────────────────

/**
 * Omogućava operateru da ručno izabere sudbinu pojedinačnog reda u staging-u
 * (`nova_firma`, `spoji`, `preskoci`, `nerazreseno`).
 */
export const setRowDecision = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    rowId: v.id("leadImportRows"),
    decision: v.union(
      v.literal("nova_firma"),
      v.literal("spoji"),
      v.literal("preskoci"),
      v.literal("nerazreseno"),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx);

    const row = await ctx.db.get(args.rowId);
    if (!row || row.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Red uvoza nije pronađen.",
      });
    }

    await ctx.db.patch(args.rowId, { decision: args.decision });
    return { success: true };
  },
});

// ── 5. Primena uvoza (applyImport) ────────────────────────────────────────────

/**
 * Primenjuje uvoz iz staging-a u glavne tabele sistema (`leadCompanies`,
 * `leadPeople`, `leadIdentities`, `leadSignals`, `leadFieldProvenance`).
 *
 * PRAVILA:
 * - Red sa `decision: "nerazreseno"` se PRESKAČE i broji se posebno.
 * - Red sa `decision: "preskoci"` se preskače.
 * - Svaki upis dobija zapis u `leadFieldProvenance`.
 * - Izvedeni podaci dobijaju `confidence: "priblizno"` (Rule 3).
 * - Svi unosi dobijaju `origin: "import"`.
 */
export const applyImport = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);

    const importDoc = await ctx.db.get(args.importId);
    if (!importDoc || importDoc.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Uvoz nije pronađen.",
      });
    }

    if (importDoc.status === "primenjen") {
      throw new ConvexError({
        code: "invalid",
        message: "Ovaj uvoz je već primenjen u bazi.",
      });
    }

    if (importDoc.status === "ponisten") {
      throw new ConvexError({
        code: "invalid",
        message: "Poništen uvoz se ne može primeniti.",
      });
    }

    const rows = await ctx.db
      .query("leadImportRows")
      .withIndex("by_workspace_import", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("importId", args.importId),
      )
      .collect();

    let appliedCount = 0;
    let newCompaniesCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;
    let unresolvedSkippedCount = 0;

    const now = Date.now();

    for (const r of rows) {
      // 1. Nerazrešeni redovi se preskaču i broje posebno
      if (r.decision === "nerazreseno") {
        unresolvedSkippedCount++;
        continue;
      }

      // 2. Preskočeni redovi
      if (r.decision === "preskoci") {
        skippedCount++;
        continue;
      }

      const p = r.parsed;

      // 3. Nova firma
      if (r.decision === "nova_firma") {
        const companyName = p.nazivFirme || "Nepoznata firma";

        const companyId = await ctx.db.insert("leadCompanies", {
          workspaceId: args.workspaceId,
          name: companyName,
          nameNormalized: normalizeCompanyName(companyName),
          pib: p.pib,
          maticniBroj: p.maticniBroj,
          sifraDelatnosti: p.sifraDelatnosti,
          website: p.sajt,
          domainNormalized: p.sajt ? normalizeDomain(p.sajt) : undefined,
          street: p.ulica,
          municipality: p.opstina,
          city: p.grad,
          companyWallUrl: p.companyWallUrl,
          firstSeenSource: p.izvori[0] ?? "import",
          origin: "import",
          createdAt: now,
          updatedAt: now,
          createdBy: importDoc.uploadedBy ?? membership.userId,
        });

        await ctx.db.patch(r._id, { createdCompanyId: companyId });
        newCompaniesCount++;
        appliedCount++;

        // PROVENANCE ZAPISI ZA FIRMU (§2.4, Rule 3)
        // Naziv
        await ctx.db.insert("leadFieldProvenance", {
          workspaceId: args.workspaceId,
          entityTable: "leadCompanies",
          entityId: companyId,
          fieldName: "name",
          value: companyName,
          source: p.izvori[0] ?? "import",
          confidence: "tacno",
          humanConfirmed: true,
          observedAt: now,
        });

        // Ulica
        if (p.ulica) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "street",
            value: p.ulica,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Opština
        if (p.opstina) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "municipality",
            value: p.opstina,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Grad (PRAVILO 3: ako je izveden iz opštine, dobija confidence: "priblizno")
        if (p.grad) {
          // Ranije je ovde stajala heuristika `p.opstina && p.grad === "Beograd"`
          // — dakle store je POGAĐAO šta je parser zaključio. Poreklo podatka ne
          // sme da bude nagađanje; sada parser sam prijavljuje šta je izveo.
          const cityConfidence: "tacno" | "priblizno" =
            p.derivedFields?.includes("grad") ? "priblizno" : "tacno";

          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "city",
            value: p.grad,
            source: p.izvori[0] ?? "import",
            confidence: cityConfidence,
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // CompanyWall URL (PRAVILO 3: ako je uvoznik označio aproksimaciju, nasleđuje "priblizno")
        if (p.companyWallUrl) {
          const cwConfidence: "tacno" | "priblizno" =
            p.companyWallTacnost === "priblizno" ? "priblizno" : "tacno";

          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "companyWallUrl",
            value: p.companyWallUrl,
            source: "companywall",
            confidence: cwConfidence,
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // PIB
        if (p.pib) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "pib",
            value: p.pib,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Matični broj
        if (p.maticniBroj) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "maticniBroj",
            value: p.maticniBroj,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Šifra delatnosti
        if (p.sifraDelatnosti) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "sifraDelatnosti",
            value: p.sifraDelatnosti,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Website
        if (p.sajt) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: companyId,
            fieldName: "website",
            value: p.sajt,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Fizičko lice (leadPeople)
        let personId: Id<"leadPeople"> | undefined;
        if (p.imeOsobe) {
          personId = await ctx.db.insert("leadPeople", {
            workspaceId: args.workspaceId,
            companyId,
            name: p.imeOsobe,
            role: mapRole(p.uloga),
            roleConfidence: "verovatno",
            createdAt: now,
          });

          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadPeople",
            entityId: personId,
            fieldName: "name",
            value: p.imeOsobe,
            source: "kolona_ime_osobe",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });

          // Ako u napomeni postoji dodatna ili sukobljena tvrdnja (npr. Vlasnik: Ana Krasnić),
          // čuvamo i nju u provenance tabeli (§2.4)
          const extraPersonClaim = extractPersonClaimFromNote(p.napomena);
          if (
            extraPersonClaim &&
            normalizeCompanyName(extraPersonClaim) !== normalizeCompanyName(p.imeOsobe)
          ) {
            await ctx.db.insert("leadFieldProvenance", {
              workspaceId: args.workspaceId,
              entityTable: "leadPeople",
              entityId: personId,
              fieldName: "name",
              value: extraPersonClaim,
              source: "napomena",
              confidence: "priblizno",
              humanConfirmed: false,
              observedAt: now,
            });
          }
        }

        // Identiteti (leadIdentities)
        if (p.telefon) {
          const phoneId = await ctx.db.insert("leadIdentities", {
            workspaceId: args.workspaceId,
            companyId,
            personId,
            kind: "phone",
            value: p.telefon,
            valueNormalized: p.telefon,
            lawfulBasis: "legitimate_interest",
            sourceUrl: p.companyWallUrl ?? (p.izvori[0] ?? "import"),
            createdAt: now,
          });

          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadIdentities",
            entityId: phoneId,
            fieldName: "value",
            value: p.telefon,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        if (p.email) {
          const emailId = await ctx.db.insert("leadIdentities", {
            workspaceId: args.workspaceId,
            companyId,
            personId,
            kind: "email",
            value: p.email,
            valueNormalized: p.email.toLowerCase(),
            lawfulBasis: "legitimate_interest",
            sourceUrl: p.companyWallUrl ?? (p.izvori[0] ?? "import"),
            createdAt: now,
          });

          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadIdentities",
            entityId: emailId,
            fieldName: "value",
            value: p.email,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        if (p.sajt) {
          await ctx.db.insert("leadIdentities", {
            workspaceId: args.workspaceId,
            companyId,
            kind: "website",
            value: p.sajt,
            valueNormalized: normalizeDomain(p.sajt),
            lawfulBasis: "public_record",
            sourceUrl: p.sajt,
            createdAt: now,
          });
        }

        // Signali (leadSignals)
        for (const sig of p.derivedSignals) {
          await ctx.db.insert("leadSignals", {
            workspaceId: args.workspaceId,
            companyId,
            kind: sig as LeadSignalKind,
            value:
              sig === "koristi_third_party_booking"
                ? extractBookingToolName(p.napomena)
                : undefined,
            source: "import",
            observedAt: now,
          });
        }

        if (p.ocena && p.ocena.vrednost !== undefined && p.ocena.skala !== undefined) {
          await ctx.db.insert("leadSignals", {
            workspaceId: args.workspaceId,
            companyId,
            kind: "visok_broj_recenzija",
            numerator: p.ocena.vrednost,
            denominator: p.ocena.skala,
            value: p.ocena.brojRecenzija ? String(p.ocena.brojRecenzija) : undefined,
            source: p.ocena.izvor ?? "import",
            observedAt: now,
          });
        }
      }

      // 4. Spajanje sa postojećom firmom (spoji)
      if (r.decision === "spoji") {
        const targetCompanyId = r.matchedCompanyId;
        if (!targetCompanyId) {
          unresolvedSkippedCount++;
          continue;
        }

        const existing = await ctx.db.get(targetCompanyId);
        if (!existing || existing.workspaceId !== args.workspaceId) {
          unresolvedSkippedCount++;
          continue;
        }

        // Dopuni prazna polja na postojećoj firmi
        const patch: Partial<Doc<"leadCompanies">> = {};
        if (!existing.pib && p.pib) patch.pib = p.pib;
        if (!existing.maticniBroj && p.maticniBroj) patch.maticniBroj = p.maticniBroj;
        if (!existing.sifraDelatnosti && p.sifraDelatnosti) patch.sifraDelatnosti = p.sifraDelatnosti;
        if (!existing.website && p.sajt) {
          patch.website = p.sajt;
          patch.domainNormalized = normalizeDomain(p.sajt);
        }
        if (!existing.street && p.ulica) patch.street = p.ulica;
        if (!existing.municipality && p.opstina) patch.municipality = p.opstina;
        if (!existing.city && p.grad) patch.city = p.grad;
        if (!existing.companyWallUrl && p.companyWallUrl) patch.companyWallUrl = p.companyWallUrl;
        patch.updatedAt = now;

        await ctx.db.patch(targetCompanyId, patch);

        // UVEK zabeleži poreklo dolaznih tvrdnji u leadFieldProvenance (§2.4)
        if (p.nazivFirme) {
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: targetCompanyId,
            fieldName: "name",
            value: p.nazivFirme,
            source: p.izvori[0] ?? "import",
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }

        if (p.companyWallUrl) {
          const cwConfidence: "tacno" | "priblizno" =
            p.companyWallTacnost === "priblizno" ? "priblizno" : "tacno";
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId: args.workspaceId,
            entityTable: "leadCompanies",
            entityId: targetCompanyId,
            fieldName: "companyWallUrl",
            value: p.companyWallUrl,
            source: "companywall",
            confidence: cwConfidence,
            humanConfirmed: true,
            observedAt: now,
          });
        }

        // Dodaj osobu ako ne postoji
        if (p.imeOsobe) {
          const existingPeople = await ctx.db
            .query("leadPeople")
            .withIndex("by_workspace_company", (q) =>
              q.eq("workspaceId", args.workspaceId).eq("companyId", targetCompanyId),
            )
            .collect();

          const normName = normalizeCompanyName(p.imeOsobe);
          const alreadyHasPerson = existingPeople.some(
            (ep) => normalizeCompanyName(ep.name) === normName,
          );

          if (!alreadyHasPerson) {
            const newPersonId = await ctx.db.insert("leadPeople", {
              workspaceId: args.workspaceId,
              companyId: targetCompanyId,
              name: p.imeOsobe,
              role: mapRole(p.uloga),
              roleConfidence: "verovatno",
              createdAt: now,
            });

            await ctx.db.insert("leadFieldProvenance", {
              workspaceId: args.workspaceId,
              entityTable: "leadPeople",
              entityId: newPersonId,
              fieldName: "name",
              value: p.imeOsobe,
              source: "kolona_ime_osobe",
              confidence: "tacno",
              humanConfirmed: true,
              observedAt: now,
            });
          }
        }

        // Dodaj telefon ako ne postoji u identitetima
        if (p.telefon) {
          const existingIdent = await ctx.db
            .query("leadIdentities")
            .withIndex("by_workspace_kind_value", (q) =>
              q
                .eq("workspaceId", args.workspaceId)
                .eq("kind", "phone")
                .eq("valueNormalized", p.telefon!),
            )
            .first();

          if (!existingIdent) {
            const phoneId = await ctx.db.insert("leadIdentities", {
              workspaceId: args.workspaceId,
              companyId: targetCompanyId,
              kind: "phone",
              value: p.telefon,
              valueNormalized: p.telefon,
              lawfulBasis: "legitimate_interest",
              sourceUrl: p.companyWallUrl ?? (p.izvori[0] ?? "import"),
              createdAt: now,
            });

            await ctx.db.insert("leadFieldProvenance", {
              workspaceId: args.workspaceId,
              entityTable: "leadIdentities",
              entityId: phoneId,
              fieldName: "value",
              value: p.telefon,
              source: p.izvori[0] ?? "import",
              confidence: "tacno",
              humanConfirmed: true,
              observedAt: now,
            });
          }
        }

        // Dodaj signale
        for (const sig of p.derivedSignals) {
          await ctx.db.insert("leadSignals", {
            workspaceId: args.workspaceId,
            companyId: targetCompanyId,
            kind: sig as LeadSignalKind,
            value:
              sig === "koristi_third_party_booking"
                ? extractBookingToolName(p.napomena)
                : undefined,
            source: "import",
            observedAt: now,
          });
        }

        mergedCount++;
        appliedCount++;
      }
    }

    await ctx.db.patch(args.importId, {
      status: "primenjen",
      appliedAt: now,
    });

    return {
      appliedCount,
      newCompaniesCount,
      mergedCount,
      skippedCount,
      unresolvedSkippedCount,
    };
  },
});

// ── 6. Poništavanje uvoza (revertImport) ───────────────────────────────────────

/**
 * Poništava uvoz i briše sve entitete koje je TAJ uvoz kreirao (po `createdCompanyId`).
 *
 * PRAVILO:
 * Ne dira firme koje su postojale pre uvoza, niti firme/polja koje je neko
 * izmenio nakon uvoza — takvi zapisi se preskaču i prijavljuju.
 */
export const revertImport = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx);

    const importDoc = await ctx.db.get(args.importId);
    if (!importDoc || importDoc.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Uvoz nije pronađen.",
      });
    }

    if (importDoc.status !== "primenjen") {
      throw new ConvexError({
        code: "invalid",
        message: "Samo uspešno primenjen uvoz se može poništiti.",
      });
    }

    const rows = await ctx.db
      .query("leadImportRows")
      .withIndex("by_workspace_import", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("importId", args.importId),
      )
      .collect();

    let revertedCompaniesCount = 0;
    let skippedModifiedCount = 0;

    const appliedTime = importDoc.appliedAt ?? 0;

    for (const r of rows) {
      if (r.createdCompanyId) {
        const company = await ctx.db.get(r.createdCompanyId);
        if (company && company.workspaceId === args.workspaceId) {
          // Ako je firma izmenjena posle uvoza (uz toleranciju od 10 sekundi pri upisu),
          // ne brišemo je već je preskačemo radi bezbednosti podataka
          if (company.updatedAt > appliedTime + 10_000) {
            skippedModifiedCount++;
          } else {
            // 1. Signali firme
            const signals = await ctx.db
              .query("leadSignals")
              .withIndex("by_workspace_company", (q) =>
                q.eq("workspaceId", args.workspaceId).eq("companyId", company._id),
              )
              .collect();
            for (const s of signals) {
              await ctx.db.delete(s._id);
            }

            // 2. Identiteti
            const idents = await ctx.db
              .query("leadIdentities")
              .withIndex("by_workspace_company", (q) =>
                q.eq("workspaceId", args.workspaceId).eq("companyId", company._id),
              )
              .collect();
            for (const id of idents) {
              await ctx.db.delete(id._id);
            }

            // 3. Fizička lica
            const people = await ctx.db
              .query("leadPeople")
              .withIndex("by_workspace_company", (q) =>
                q.eq("workspaceId", args.workspaceId).eq("companyId", company._id),
              )
              .collect();
            for (const person of people) {
              await ctx.db.delete(person._id);
            }

            // 4. Istorijat tvrdnji (provenance)
            const provs = await ctx.db
              .query("leadFieldProvenance")
              .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
              .filter((q) => q.eq(q.field("entityId"), company._id))
              .collect();
            for (const pr of provs) {
              await ctx.db.delete(pr._id);
            }

            // 5. Sama firma
            await ctx.db.delete(company._id);
            revertedCompaniesCount++;
          }
        }

        await ctx.db.patch(r._id, { createdCompanyId: undefined });
      }
    }

    await ctx.db.patch(args.importId, {
      status: "ponisten",
      revertedAt: Date.now(),
    });

    return {
      revertedCompaniesCount,
      skippedModifiedCount,
    };
  },
});

// ── 7. Upiti za pregled staging stanja ─────────────────────────────────────────

/**
 * Prikazuje detalje o jednom uvozu.
 */
export const getImport = query({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx);
    const doc = await ctx.db.get(args.importId);
    if (!doc || doc.workspaceId !== args.workspaceId) {
      return null;
    }
    return doc;
  },
});

/**
 * Lista sve redove jednog uvoza u staging-u, uz opcioni filter po odluci.
 */
export const listImportRows = query({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
    decision: v.optional(
      v.union(
        v.literal("nova_firma"),
        v.literal("spoji"),
        v.literal("preskoci"),
        v.literal("nerazreseno"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx);

    if (args.decision) {
      return await ctx.db
        .query("leadImportRows")
        .withIndex("by_import_decision", (q) =>
          q.eq("importId", args.importId).eq("decision", args.decision!),
        )
        .collect();
    }

    return await ctx.db
      .query("leadImportRows")
      .withIndex("by_workspace_import", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("importId", args.importId),
      )
      .collect();
  },
});

/**
 * Lista sve uvoze u radnom prostoru.
 */
export const listImports = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireMembership(ctx);

    return await ctx.db
      .query("leadImports")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();
  },
});
