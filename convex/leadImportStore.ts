import { internalMutation, mutation, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id, Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizePhoneRs,
  normalizeCompanyWallUrl,
  normalizeNicheSlug,
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

export const rawLeadCellValidator = v.object({
  kolona: v.string(),
  vrednost: v.string(),
});

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
  // SVE ćelije reda iz izvornog fajla u izvornom redosledu (§2, §3)
  sirovo: v.optional(v.array(rawLeadCellValidator)),

  // ── Polja koja puni SAMO `/generate-leads` skill (GL1, plan §4.4) ──────────
  // Sva su opciona: uvoz iz XLSX/CSV fajla ih nema i nikad neće imati.
  placeId: v.optional(v.string()),
  nisa: v.optional(v.string()),
  imaSajt: v.optional(
    v.union(v.literal("da"), v.literal("ne"), v.literal("nepoznato")),
  ),
  imaSajtNapomena: v.optional(v.string()),
  sajtStatus: v.optional(
    v.union(
      v.literal("radi"),
      v.literal("ne_radi"),
      v.literal("parkiran"),
      v.literal("preusmerava_na_drustvene"),
      v.literal("nepoznato"),
    ),
  ),
  sajtHttps: v.optional(v.boolean()),
  sajtProverenAt: v.optional(v.number()),
  sajtNapomena: v.optional(v.string()),
  koordinate: v.optional(
    v.object({
      lat: v.number(),
      lng: v.number(),
      izvor: v.literal("nominatim"),
    }),
  ),
  platforme: v.optional(
    v.array(
      v.object({
        vrsta: v.union(
          v.literal("instagram"),
          v.literal("facebook"),
          v.literal("tiktok"),
          v.literal("website"),
          v.literal("threads"),
        ),
        url: v.string(),
        sourceUrl: v.string(),
      }),
    ),
  ),
  osobe: v.optional(
    v.array(
      v.object({
        ime: v.string(),
        uloga: v.string(),
        ulogaIzvor: v.string(),
        telefon: v.optional(v.string()),
        telefonSourceUrl: v.optional(v.string()),
        verovatnoca: v.optional(v.number()),
        nijeMoguceProceniti: v.optional(v.boolean()),
        obrazlozenje: v.optional(v.string()),
        rang: v.number(),
      }),
    ),
  ),
  izvestajSkilla: v.optional(v.string()),

  // GL8: ID postojeće firme iz izvoza aplikacije (režim „obogati").
  postojecaFirmaId: v.optional(v.string()),
});

export type RowConflict = {
  field: string;
  postojeca: string;
  nova: string;
  izvor: string;
};

export type RowMatchResult = {
  matchedCompanyId?: Id<"leadCompanies">;
  matchedBy?:
    | "postojeca_firma"
    | "pib"
    | "companywall"
    | "domain"
    | "name_city"
    | "phone";
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

/**
 * Uloga osobe kakvu je skill prijavio + odakle je zna.
 *
 * `potvrdjeno` SAMO kad uloga stiže iz zvaničnog registra (APR) ili
 * CompanyWalla koji ga prepisuje. Ime vlasnika napisano u Instagram biou je
 * verovatno tačno, ali nije potvrda — a razlika između te dve reči je razlika
 * između „znamo" i „mislimo da znamo" (§0 pravilo 4).
 */
function roleConfidenceFromSource(
  ulogaIzvor: string,
): "potvrdjeno" | "verovatno" {
  const lower = ulogaIzvor.toLowerCase();
  return lower.includes("companywall") || lower.includes("apr")
    ? "potvrdjeno"
    : "verovatno";
}

/**
 * Nalazi ili pravi nišu po slugu (GL1, plan §4.4, §7.3).
 *
 * Skill zna slug, ne `Id<"niches">`. Upsert je po slugu unutar radnog prostora
 * — dva uvoza iste niše ne smeju da naprave dve niše, jer bi tabela onda
 * pokazivala „frizerski saloni (12)" i „frizerski saloni (7)" jedno pored
 * drugog i nijedan broj ne bi bio tačan.
 *
 * `naziv` se pri pogotku NE prepisuje: čovek koji je nišu preimenovao u
 * „Frizeri i berberi" ne sme da izgubi to ime zato što je skill poslao svoj
 * slobodan tekst.
 */
/** Zapisano u `opisModel` kad opis niše dolazi iz skilla (GL6 §4). */
const GENERATE_LEADS_OPIS_MODEL = "Claude (generate-leads skill)";

async function upsertNicheBySlug(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    slug: string;
    createdBy?: Id<"users">;
    now: number;
    /** Predlog opisa iz skilla (GL6 §4). Upisuje se SAMO ako niša nema opis. */
    opis?: string;
  },
): Promise<Id<"niches"> | undefined> {
  const slug = normalizeNicheSlug(args.slug);
  // Prazan slug (npr. ulaz od same interpunkcije) bi spojio sve takve niše u
  // jednu — bolje bez niše nego u pogrešnoj.
  if (!slug) return undefined;

  // Opis se upisuje kao autorstvo „claude" SAMO kad ga je skill poslao i kad
  // niša nema svoj opis. Opis čoveka se NIKAD ne prepisuje (GL6 §4).
  const opisIzSkilla =
    typeof args.opis === "string" && args.opis.trim().length > 0
      ? args.opis.trim()
      : undefined;

  const existing = await ctx.db
    .query("niches")
    .withIndex("by_workspace_slug", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("slug", slug),
    )
    .first();
  if (existing !== null) {
    // Postojeća niša: dopuni opis samo ako ga nema (prazan ili odsutan).
    const bezOpisa = !existing.opis || existing.opis.trim().length === 0;
    if (opisIzSkilla && bezOpisa) {
      await ctx.db.patch(existing._id, {
        opis: opisIzSkilla,
        opisAutor: "claude",
        opisModel: GENERATE_LEADS_OPIS_MODEL,
        updatedAt: args.now,
      });
    }
    return existing._id;
  }

  // Naziv se izvodi iz sluga („frizerski-saloni" -> „Frizerski saloni"). To je
  // radni naziv dok ga čovek ne prepravi na ekranu Niše (GL2).
  const naziv = slug
    .split("-")
    .filter((deo) => deo.length > 0)
    .join(" ")
    .replace(/^./, (ch) => ch.toUpperCase());

  return await ctx.db.insert("niches", {
    workspaceId: args.workspaceId,
    slug,
    naziv,
    createdBy: args.createdBy,
    createdAt: args.now,
    updatedAt: args.now,
    ...(opisIzSkilla
      ? { opis: opisIzSkilla, opisAutor: "claude" as const, opisModel: GENERATE_LEADS_OPIS_MODEL }
      : {}),
  });
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
  // 0. Postojeća firma po ID-u iz izvoza aplikacije (GL8, plan §5, §2).
  //
  // Najjači ključ: to je baš ta firma u ovom radnom prostoru, ne pogodak po
  // sličnosti. `normalizeId` bezbedno odbija string koji nije ispravan Convex
  // Id (npr. iz tuđeg deploya) — vraća `null` umesto izuzetka. Provera
  // `workspaceId` je obavezna: id iz tuđeg radnog prostora ne sme da spoji
  // podatke preko granice (§0 pravilo 9).
  if (parsed.postojecaFirmaId) {
    const cleanId = parsed.postojecaFirmaId.trim();
    const normId = cleanId ? ctx.db.normalizeId("leadCompanies", cleanId) : null;
    if (normId) {
      const match = await ctx.db.get(normId);
      if (match !== null && match.workspaceId === workspaceId) {
        return { matchedCompanyId: match._id, matchedBy: "postojeca_firma" };
      }
    }
  }

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

      // ── GL8 (režim „obogati", plan §4) ────────────────────────────────────
      //
      // Skill može da dopuni firmu koja već postoji: osobe (`parsed.osobe`),
      // procenu telefona i stanje sajta. Nova osoba NIJE sukob — to je dopuna.
      // Sukob je samo kad se ista osoba (isto normalizovano ime) vraća sa
      // DRUGOM ulogom ili DRUGIM telefonom, i kad stanje sajta prelazi
      // „ne" → „da". Svaki takav sukob nosi `izvor` = `sourceUrl` NOVE vrednosti
      // (§2.4: obe se čuvaju, čovek presuđuje).
      if (parsed.osobe && parsed.osobe.length > 0) {
        const existingPeople = await ctx.db
          .query("leadPeople")
          .withIndex("by_workspace_company", (q) =>
            q.eq("workspaceId", workspaceId).eq("companyId", matchedCompanyId),
          )
          .collect();
        const poImenu = new Map(
          existingPeople.map((p) => [normalizeCompanyName(p.name), p] as const),
        );

        // Telefoni po osobi se učitavaju samo kad zaista ima osobe sa brojem.
        const trebaTelefone = parsed.osobe.some((o) => o.telefon);
        const identiteti = trebaTelefone
          ? await ctx.db
              .query("leadIdentities")
              .withIndex("by_workspace_company", (q) =>
                q.eq("workspaceId", workspaceId).eq("companyId", matchedCompanyId),
              )
              .collect()
          : [];

        for (const osoba of parsed.osobe) {
          const imeNorm = normalizeCompanyName(osoba.ime);
          if (!imeNorm) continue;
          const postojeca = poImenu.get(imeNorm);
          if (!postojeca) continue; // nova osoba je dopuna, ne sukob

          const novaUloga = mapRole(osoba.uloga);
          if (
            postojeca.role !== "nepoznato" &&
            novaUloga !== "nepoznato" &&
            postojeca.role !== novaUloga
          ) {
            conflicts.push({
              field: "osobaUloga",
              postojeca: `${postojeca.name}: ${postojeca.role}`,
              nova: `${osoba.ime}: ${novaUloga}`,
              izvor: osoba.ulogaIzvor,
            });
          }

          if (osoba.telefon) {
            const novNorm = normalizePhoneRs(osoba.telefon);
            if (novNorm) {
              const telOsobe = identiteti.filter(
                (i) => i.kind === "phone" && i.personId === postojeca._id,
              );
              const razlicit =
                telOsobe.length > 0 &&
                telOsobe.every((i) => (i.valueNormalized ?? i.value) !== novNorm);
              if (razlicit) {
                conflicts.push({
                  field: "osobaTelefon",
                  postojeca: telOsobe.map((i) => i.value).join(", "),
                  nova: osoba.telefon,
                  izvor: osoba.telefonSourceUrl ?? "generate-leads",
                });
              }
            }
          }
        }
      }

      // Stanje sajta prelazi „nema" → „ima" — vredna promena za prodaju sajtova,
      // ali i tvrdnja suprotna od one koju je firma već nosila.
      if (parsed.imaSajt === "da" && existing.imaSajt === "ne") {
        conflicts.push({
          field: "imaSajt",
          postojeca: "ne",
          nova: "da",
          izvor: parsed.sajt ?? parsed.imaSajtNapomena ?? "generate-leads",
        });
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
/**
 * Jezgro uvoza: pravi `leadImports` red i po jedan `leadImportRows` red za
 * svaki parsirani red, uz spajanje, sukobe i proveru zabrane kontakta.
 *
 * OBIČNA FUNKCIJA, NE CONVEX FUNKCIJA. Dva puta vode ovamo — čovek koji je
 * otpremio tabelu (`createImport`) i skill koji je poslao rezultat na
 * `/generate-leads/ingest` (`createImportFromIngest`) — i jedini način da oba
 * puta zaista rade isto jeste da izvršavaju isti kod. Druga kopija ove logike
 * bi se razišla prvog dana kad se dedupe pravilo promeni na jednom mestu, i to
 * bi se videlo tek kao duplirana firma u bazi.
 *
 * `uploadedBy` je ovde ARGUMENT, ne `requireMembership(ctx).userId`: ingest
 * nema sesiju, pa vlasnika daje token (`ingestTokens.createdBy`). Provera
 * pripadnosti radnom prostoru ostaje na pozivaocu — mutacija koja prima
 * `workspaceId` mora da ga poredi sa članstvom pozivaoca, a interna mutacija
 * ga izvodi iz samog tokena.
 */
async function createImportCore(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    uploadedBy: Id<"users"> | undefined;
    fileName: string;
    sheetsChosen: string[];
    headerRowIndex: number;
    rows: ParsedLeadRow[];
    skippedCount: number;
    warnings: string[];
    sourceSheet?: string;
    /** Predlog opisa niše iz skilla (GL6 §4). Samo `createImportFromIngest`. */
    nisaOpis?: string;
    /** Režim skilla (GL8, plan §5). „obogati" menja prikaz pregleda i `fileName`. */
    rezim?: "otkrivanje" | "obogati";
    /** Naziv fajla iz kojeg je „obogati" krenuo (GL8). */
    izvorFajl?: string;
    /** Podskup polja koje „obogati --polja" tok dopunjuje (GL9, plan §4). */
    polja?: Array<"sajt" | "osobe" | "platforme" | "koordinate">;
  },
): Promise<{ importId: Id<"leadImports">; rowsCount: number }> {
  const sheetName = args.sourceSheet ?? args.sheetsChosen[0] ?? "Sheet1";

  const importId = await ctx.db.insert("leadImports", {
    workspaceId: args.workspaceId,
    fileName: args.fileName,
    uploadedBy: args.uploadedBy,
    uploadedAt: Date.now(),
    status: "u_pregledu",
    sheetsChosen: args.sheetsChosen,
    headerRowIndex: args.headerRowIndex,
    rowsParsed: args.rows.length,
    rowsSkipped: args.skippedCount,
    warnings: args.warnings,
    skriveneKolone: [],
    ...(args.nisaOpis && args.nisaOpis.trim().length > 0
      ? { nisaOpis: args.nisaOpis.trim() }
      : {}),
    ...(args.rezim ? { rezim: args.rezim } : {}),
    ...(args.izvorFajl && args.izvorFajl.trim().length > 0
      ? { izvorFajl: args.izvorFajl.trim() }
      : {}),
    ...(args.polja && args.polja.length > 0 ? { polja: args.polja } : {}),
  });

  for (let i = 0; i < args.rows.length; i++) {
    const parsedRow = args.rows[i];
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
      parsed: {
        nazivFirme: parsedRow.nazivFirme,
        ulica: parsedRow.ulica,
        opstina: parsedRow.opstina,
        grad: parsedRow.grad,
        telefon: parsedRow.telefon,
        telefonNapomena: parsedRow.telefonNapomena,
        email: parsedRow.email,
        sajt: parsedRow.sajt,
        imeOsobe: parsedRow.imeOsobe,
        uloga: parsedRow.uloga,
        ocena: parsedRow.ocena,
        companyWallUrl: parsedRow.companyWallUrl,
        companyWallTacnost: parsedRow.companyWallTacnost,
        pib: parsedRow.pib,
        maticniBroj: parsedRow.maticniBroj,
        sifraDelatnosti: parsedRow.sifraDelatnosti,
        napomena: parsedRow.napomena,
        izvori: parsedRow.izvori,
        derivedSignals: parsedRow.derivedSignals,
        derivedFields: parsedRow.derivedFields,
        // GL1: polja iz skilla. `undefined` prolazi kroz Convex kao odsustvo
        // polja, pa red iz XLSX-a i dalje upisuje tačno ono što je i ranije.
        placeId: parsedRow.placeId,
        nisa: parsedRow.nisa,
        imaSajt: parsedRow.imaSajt,
        imaSajtNapomena: parsedRow.imaSajtNapomena,
        sajtStatus: parsedRow.sajtStatus,
        sajtHttps: parsedRow.sajtHttps,
        sajtProverenAt: parsedRow.sajtProverenAt,
        sajtNapomena: parsedRow.sajtNapomena,
        koordinate: parsedRow.koordinate,
        platforme: parsedRow.platforme,
        osobe: parsedRow.osobe,
        izvestajSkilla: parsedRow.izvestajSkilla,
        // GL8: prosleđuje se u red kad je uvoz došao iz izvoza aplikacije.
        postojecaFirmaId: parsedRow.postojecaFirmaId,
      },
      sirovo: parsedRow.sirovo ?? [],
      temperatura: "nova_firma",
      obrisan: false,
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
}

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

    return await createImportCore(ctx, {
      workspaceId: args.workspaceId,
      uploadedBy: membership.userId,
      fileName: args.fileName,
      sheetsChosen: args.sheetsChosen,
      headerRowIndex: args.headerRowIndex,
      rows: args.rows as ParsedLeadRow[],
      skippedCount: args.skipped.length,
      warnings: args.warnings,
      sourceSheet: args.sourceSheet,
    });
  },
});

/**
 * Uvoz koji je poslao `/generate-leads` skill kroz `POST /generate-leads/ingest`
 * (GL1, plan §5, §O2).
 *
 * INTERNA: jedini pozivalac je HTTP akcija, koja je već proverila Bearer token
 * i iz njega izvela `workspaceId` i `uploadedBy`. Zato ovde nema
 * `requireMembership` — nema sesije koju bi proverio; ono što token tvrdi je
 * jedina tvrdnja koja postoji, i ona se proverava PRE poziva.
 *
 * Skill NE piše u `leadCompanies`. Uvoz nastaje sa `status: "u_pregledu"` i
 * ide kroz istu ljudsku potvrdu kao otpremljena tabela (§O2).
 */
export const createImportFromIngest = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    uploadedBy: v.id("users"),
    fileName: v.string(),
    rows: v.array(parsedLeadRowValidator),
    warnings: v.array(v.string()),
    // Predlog opisa niše iz skilla (GL6 §4). `applyImport` ga upisuje u nišu
    // samo ako niša još nema opis.
    nisaOpis: v.optional(v.string()),
    // Režim skilla (GL8, plan §5) i naziv izvornog fajla za režim „obogati".
    rezim: v.optional(v.union(v.literal("otkrivanje"), v.literal("obogati"))),
    izvorFajl: v.optional(v.string()),
    // Podskup polja koje „obogati --polja" tok dopunjuje (GL9, plan §4).
    polja: v.optional(
      v.array(
        v.union(
          v.literal("sajt"),
          v.literal("osobe"),
          v.literal("platforme"),
          v.literal("koordinate"),
        ),
      ),
    ),
  },
  returns: v.object({
    importId: v.id("leadImports"),
    rowsCount: v.number(),
  }),
  handler: async (ctx, args) => {
    return await createImportCore(ctx, {
      workspaceId: args.workspaceId,
      uploadedBy: args.uploadedBy,
      fileName: args.fileName,
      rezim: args.rezim,
      izvorFajl: args.izvorFajl,
      polja: args.polja,
      // Nema listova ni zaglavlja — nema fajla. `headerRowIndex: -1` daje
      // `sourceRowIndex` 1, 2, 3… (jer je formula `headerRowIndex + 2 + i`),
      // što je red u poslatoj listi. Lažan „Sheet1" bi tvrdio da fajl postoji.
      sheetsChosen: [],
      headerRowIndex: -1,
      sourceSheet: "generate-leads",
      rows: args.rows as ParsedLeadRow[],
      // Skill ne preskače redove tiho: ono što nije ušlo, izveštaj imenuje.
      skippedCount: 0,
      warnings: args.warnings,
      nisaOpis: args.nisaOpis,
    });
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
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const row = await ctx.db.get(args.rowId);
    if (!row || row.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Red uvoza nije pronađen.",
      });
    }

    // Red koji je već ušao u bazu (GL9 §1) ne menja odluku — inače bi „Primeni
    // preostale" mogao dvaput da ga upiše. Nerazrešeni redovi na primenjenom
    // uvozu NEMAJU `primenjenAt`, pa ostaju uređivi.
    if (row.primenjenAt !== undefined) {
      throw new ConvexError({
        code: "invalid",
        message: "Ovaj red je već primenjen u bazu i ne može da promeni odluku.",
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
/**
 * Osigurava da uvezena firma ima zaduženje u `leadAssignments` (§11.5).
 * Ako već postoji zaduženje preko indeksa `by_workspace_company`, ne menja se ništa.
 * Ako ne postoji, kreira se novi red sa fazom "nov", vremenima i događajem u `leadStageEvents`.
 */
async function ensureAssignment(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    companyId: Id<"leadCompanies">;
    ownerUserId: Id<"users">;
    actorUserId: Id<"users">;
    now: number;
  },
): Promise<{ assignment: Doc<"leadAssignments">; created: boolean }> {
  const existing = await ctx.db
    .query("leadAssignments")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
    )
    .first();

  if (existing) {
    return { assignment: existing, created: false };
  }

  const assignmentId = await ctx.db.insert("leadAssignments", {
    workspaceId: args.workspaceId,
    companyId: args.companyId,
    ownerUserId: args.ownerUserId,
    stage: "nov",
    createdAt: args.now,
    updatedAt: args.now,
  });

  await ctx.db.insert("leadStageEvents", {
    workspaceId: args.workspaceId,
    companyId: args.companyId,
    kind: "dodela",
    fromValue: undefined,
    toValue: String(args.ownerUserId),
    actorUserId: args.actorUserId,
    note: "Dodeljen pri uvozu tabele",
    occurredAt: args.now,
  });

  const assignment = (await ctx.db.get(assignmentId))!;
  return { assignment, created: true };
}

/**
 * Prenosi na firmu ono što uz stari (tabelarni) uvoz ne postoji: platforme,
 * do tri osobe sa procenom telefona i signale o stanju sajta (GL1, plan §4.4).
 *
 * ISTA funkcija se zove i za novu firmu i za spajanje sa postojećom, i sve
 * provere postojanja idu PROTIV BAZE, ne protiv skupa koji smo sami napunili u
 * ovom prolazu. Dve kopije ovog koda — jedna za „nova_firma", druga za „spoji"
 * — razišle bi se prvog dana kad se doda polje, a razlika bi se videla tek kao
 * profil firme kome posle spajanja fali pola podataka.
 *
 * Ništa se ne prepisuje: postojeći identitet, postojeća osoba i postojeći
 * telefon ostaju kakvi jesu. Uvoz dopunjuje, ne gazi (§2.4).
 */
async function attachSkillData(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    companyId: Id<"leadCompanies">;
    p: Doc<"leadImportRows">["parsed"];
    now: number;
    /**
     * Podskup polja koje „obogati --polja" tok dopunjuje (GL9, plan §4).
     * `undefined` = pun uvoz (dira sve). Kad je zadat, dira SAMO ta polja i
     * nikad ne prepisuje ostatak — red koji je istražio samo sajt ne sme da
     * obriše osobe/platforme koje firma već ima.
     */
    polja?: Array<"sajt" | "osobe" | "platforme" | "koordinate">;
  },
): Promise<void> {
  const { workspaceId, companyId, p, now, polja } = args;

  // Kad je uvoz ograničen na podskup polja, dira se samo to polje; inače sve.
  const diraj = (polje: "sajt" | "osobe" | "platforme" | "koordinate") =>
    polja === undefined || polja.includes(polje);

  // Ništa od ovoga ne postoji u uvozu iz tabele — izlaz pre ijednog čitanja.
  const imaSadrzaj =
    (diraj("platforme") && (p.platforme?.length ?? 0) > 0) ||
    (diraj("osobe") && (p.osobe?.length ?? 0) > 0) ||
    (diraj("sajt") &&
      (p.imaSajt !== undefined ||
        p.sajtStatus !== undefined ||
        p.sajtHttps !== undefined));
  if (!imaSadrzaj) return;

  const postojeciIdentiteti = await ctx.db
    .query("leadIdentities")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", workspaceId).eq("companyId", companyId),
    )
    .collect();

  // Ključ je (vrsta, normalizovana vrednost): isti Instagram handle upisan dva
  // puta je jedan nalog, a isti string kao telefon i kao handle nije.
  const kljucIdentiteta = (kind: string, value: string) =>
    `${kind}::${value.toLowerCase()}`;
  const zauzeti = new Set(
    postojeciIdentiteti.map((i) =>
      kljucIdentiteta(i.kind, i.valueNormalized ?? i.value),
    ),
  );

  // ── Platforme -> leadIdentities ───────────────────────────────────────────
  //
  // Svaka nosi svoj `sourceUrl` (stranica na kojoj smo je videli), jer je
  // izvor po ZZPL/GDPR obavezan i nikad ne sme biti Google Places (plan §O3).
  for (const platforma of diraj("platforme") ? p.platforme ?? [] : []) {
    const vrednost = platforma.url.trim();
    if (!vrednost) continue;

    const normalizovano =
      platforma.vrsta === "website"
        ? normalizeDomain(vrednost)
        : vrednost.toLowerCase().replace(/^@+/, "");
    const kljuc = kljucIdentiteta(platforma.vrsta, normalizovano || vrednost);
    if (zauzeti.has(kljuc)) continue;
    zauzeti.add(kljuc);

    await ctx.db.insert("leadIdentities", {
      workspaceId,
      companyId,
      kind: platforma.vrsta,
      value: vrednost,
      valueNormalized: normalizovano || undefined,
      // Javno objavljen poslovni profil, ne podatak dobijen od same osobe.
      lawfulBasis: "public_record",
      sourceUrl: platforma.sourceUrl,
      createdAt: now,
    });
  }

  // ── Osobe -> leadPeople + telefon sa procenom (plan §4.4, §6; GL8 §4) ──────
  const osobe = diraj("osobe")
    ? [...(p.osobe ?? [])].sort((a, b) => a.rang - b.rang)
    : [];
  if (osobe.length > 0) {
    const postojeceOsobe = await ctx.db
      .query("leadPeople")
      .withIndex("by_workspace_company", (q) =>
        q.eq("workspaceId", workspaceId).eq("companyId", companyId),
      )
      .collect();
    // Ime -> postojeća osoba: ista osoba (isto normalizovano ime) se NE duplira
    // (GL8 §4), nego dopunjuje. Karta se dopunjuje i za osobe napravljene u
    // ovom istom prolazu, da se isto ime u dve stavke ne upiše dvaput.
    const poImenu = new Map(
      postojeceOsobe.map((o) => [normalizeCompanyName(o.name), o._id] as const),
    );
    // Osobe koje već imaju bar jedan telefon — takvoj se drugi ne dodaje
    // automatski (§4: „telefon … ako ga nema").
    const osobeSaTelefonom = new Set(
      postojeciIdentiteti
        .filter((i) => i.kind === "phone" && i.personId)
        .map((i) => String(i.personId)),
    );

    // Telefon osobe: ILI se procena upiše na broj koji VEĆ POSTOJI (GL9 §2 —
    // 87 spojenih firmi ima broj iz prvog uvoza tabele, pa procena dosad nije
    // imala gde da se upiše i „ima procenu" je bilo samo 5), ILI se, ako broja
    // nema a osoba još nema nijedan, ubacuje nov identitet. Vraća true kad
    // osoba od tada „ima telefon" (pa se drugi ne dodaje automatski).
    const obradiTelefonOsobe = async (
      personId: Id<"leadPeople">,
      osoba: NonNullable<Doc<"leadImportRows">["parsed"]["osobe"]>[number],
      personVecImaTelefon: boolean,
    ): Promise<boolean> => {
      if (!osoba.telefon) return false;
      const telefonNorm = normalizePhoneRs(osoba.telefon) ?? osoba.telefon;

      // `verovatnoca` i `nijeMoguceProceniti` se prenose kakvi jesu: broj ILI
      // izričito odustajanje. Nikad izmišljena nula, nikad „50 %" kao sredina
      // (§0 pravilo 4, plan §6). Vreme i izvor procene se upisuju samo kad
      // procena zaista postoji.
      const imaProcenu =
        osoba.verovatnoca !== undefined || osoba.nijeMoguceProceniti === true;

      // Da li taj broj već postoji na firmi (isti normalizovan oblik).
      // `postojeciIdentiteti` je snimak baze s početka; broj iz prvog uvoza je
      // upisan sa `valueNormalized` = sirov string, pa se poredi normalizovano
      // sa obe strane.
      const uporedjivo = (i: Doc<"leadIdentities">) => {
        const sirova = i.valueNormalized ?? i.value;
        return normalizePhoneRs(sirova) ?? sirova;
      };
      const postojeciTel = postojeciIdentiteti.find(
        (i) => i.kind === "phone" && uporedjivo(i) === telefonNorm,
      );

      // ── Broj već postoji → upiši procenu na njega (GL9 §2). ──────────────
      if (postojeciTel) {
        if (!imaProcenu) return true; // nema procene za upis; broj već postoji
        // Ljudska procena je konačna — skill je ne dira.
        if (postojeciTel.verovatnocaIzvor === "covek") return true;
        // Raniju procenu skilla prepisuje samo novija (verovatnocaAt).
        if (
          postojeciTel.verovatnocaIzvor === "skill" &&
          now <= (postojeciTel.verovatnocaAt ?? 0)
        ) {
          return true;
        }

        await ctx.db.patch(postojeciTel._id, {
          verovatnoca: osoba.verovatnoca,
          verovatnocaObrazlozenje: osoba.obrazlozenje,
          verovatnocaIzvor: "skill" as const,
          verovatnocaAt: now,
          nijeMoguceProceniti: osoba.nijeMoguceProceniti,
          // Ako identitet nije bio vezan ni za koga, veži ga za nađenu osobu.
          ...(postojeciTel.personId ? {} : { personId }),
        });
        await ctx.db.insert("leadFieldProvenance", {
          workspaceId,
          entityTable: "leadIdentities",
          entityId: postojeciTel._id,
          fieldName: "verovatnoca",
          // Vrednost porekla je procena, ne broj — sirov telefon se ne ponavlja.
          value:
            osoba.verovatnoca !== undefined
              ? String(Math.round(osoba.verovatnoca))
              : "nije moguće proceniti",
          source: osoba.telefonSourceUrl ?? "generate-leads",
          confidence: "priblizno",
          humanConfirmed: true,
          observedAt: now,
        });
        return true;
      }

      // ── Broja nema → nov identitet, ali samo ako osoba još nema telefon. ──
      // „telefon … ako ga nema" (§4): drugi broj se ne dodaje automatski.
      if (personVecImaTelefon) return false;
      const kljucTelefona = kljucIdentiteta("phone", telefonNorm);
      if (zauzeti.has(kljucTelefona)) return false;
      zauzeti.add(kljucTelefona);

      const phoneId = await ctx.db.insert("leadIdentities", {
        workspaceId,
        companyId,
        personId,
        kind: "phone",
        value: osoba.telefon,
        valueNormalized: telefonNorm,
        lawfulBasis: "legitimni interes — javno objavljen poslovni kontakt",
        sourceUrl: osoba.telefonSourceUrl ?? "generate-leads",
        createdAt: now,
        verovatnoca: osoba.verovatnoca,
        verovatnocaObrazlozenje: osoba.obrazlozenje,
        verovatnocaIzvor: imaProcenu ? "skill" : undefined,
        verovatnocaAt: imaProcenu ? now : undefined,
        nijeMoguceProceniti: osoba.nijeMoguceProceniti,
      });
      // Poreklo za svako novo polje (GL8 §4): telefon osobe ima svoj izvor.
      await ctx.db.insert("leadFieldProvenance", {
        workspaceId,
        entityTable: "leadIdentities",
        entityId: phoneId,
        fieldName: "value",
        value: osoba.telefon,
        source: osoba.telefonSourceUrl ?? "generate-leads",
        confidence: "priblizno",
        humanConfirmed: true,
        observedAt: now,
      });
      return true;
    };

    for (const osoba of osobe) {
      const imeNorm = normalizeCompanyName(osoba.ime);
      if (!imeNorm) continue;

      const potvrdjenost = roleConfidenceFromSource(osoba.ulogaIzvor);
      const postojeciId = poImenu.get(imeNorm);

      // Osoba koja već postoji (GL8 §4): ne duplira se. Dobija veći
      // `roleConfidence` ako novi izvor (APR/CompanyWall) to opravdava, i
      // telefon sa procenom ako ga još nema. Svaka promena → red u provenance.
      if (postojeciId) {
        const postojeca = await ctx.db.get(postojeciId);
        if (postojeca && postojeca.roleConfidence !== "potvrdjeno" && potvrdjenost === "potvrdjeno") {
          const novaUloga = mapRole(osoba.uloga);
          await ctx.db.patch(postojeciId, {
            roleConfidence: "potvrdjeno",
            // Poznatu ulogu ne gazimo; popravljamo samo kad je bila „nepoznato".
            ...(postojeca.role === "nepoznato" && novaUloga !== "nepoznato"
              ? { role: novaUloga }
              : {}),
          });
          await ctx.db.insert("leadFieldProvenance", {
            workspaceId,
            entityTable: "leadPeople",
            entityId: postojeciId,
            fieldName: "role",
            value: osoba.uloga,
            source: osoba.ulogaIzvor,
            confidence: "tacno",
            humanConfirmed: true,
            observedAt: now,
          });
        }
        // Procena telefona se upisuje i kad osoba VEĆ ima broj (GL9 §2: procena
        // ide na postojeći identitet), pa se `obradiTelefonOsobe` zove uvek.
        const vecImaTelefon = osobeSaTelefonom.has(String(postojeciId));
        const upisan = await obradiTelefonOsobe(postojeciId, osoba, vecImaTelefon);
        if (upisan) osobeSaTelefonom.add(String(postojeciId));
        continue;
      }

      const personId = await ctx.db.insert("leadPeople", {
        workspaceId,
        companyId,
        name: osoba.ime,
        role: mapRole(osoba.uloga),
        roleConfidence: potvrdjenost,
        createdAt: now,
      });
      poImenu.set(imeNorm, personId);

      await ctx.db.insert("leadFieldProvenance", {
        workspaceId,
        entityTable: "leadPeople",
        entityId: personId,
        fieldName: "name",
        value: osoba.ime,
        source: osoba.ulogaIzvor,
        // Ime iz APR/CompanyWall zapisa je pročitano; ime izvučeno sa sajta ili
        // iz bioa je pročitano iz teksta koji ga ne tvrdi zvanično.
        confidence: potvrdjenost === "potvrdjeno" ? "tacno" : "priblizno",
        humanConfirmed: true,
        observedAt: now,
      });

      const upisan = await obradiTelefonOsobe(personId, osoba, false);
      if (upisan) osobeSaTelefonom.add(String(personId));
    }
  }

  // ── Signali o sajtu (plan §3.8, §4.4) ─────────────────────────────────────
  //
  // `nema_sajt` SAMO za `imaSajt === "ne"`. Za `"nepoznato"` se ne upisuje
  // ništa: to znači da neki izvor nije odgovorio, a signal bi tvrdio da firma
  // sajt nema i podigao joj Fit ocenu na osnovu NAŠE greške u proveri.
  const signaliSajta: LeadSignalKind[] = [];
  if (diraj("sajt")) {
    if (p.imaSajt === "ne") signaliSajta.push("nema_sajt");
    if (p.sajtStatus === "ne_radi" || p.sajtStatus === "parkiran") {
      signaliSajta.push("sajt_ne_radi");
    }
    if (p.sajtHttps === false) signaliSajta.push("sajt_bez_https");
  }

  // Signal koji je već stigao kroz `derivedSignals` u ovom istom redu se ne
  // udvaja. Stariji signal iste vrste od ranijeg uvoza se NE dira — bodovanje
  // uzima najskoriji po vrsti, pa novo opažanje ionako pobeđuje.
  const izReda = new Set(p.derivedSignals);

  for (const sig of signaliSajta) {
    if (izReda.has(sig)) continue;
    await ctx.db.insert("leadSignals", {
      workspaceId,
      companyId,
      kind: sig,
      // Zašto baš ovaj signal — rečenica koju je skill već napisao
      // („302 -> instagram.com/…", „timeout posle 8 s").
      value: sig === "nema_sajt" ? p.imaSajtNapomena : p.sajtNapomena,
      source: "generate-leads",
      observedAt: p.sajtProverenAt ?? now,
    });
  }

  // Izveštaj skilla po firmi ostaje kao poreklo: staging red je istorija tog
  // uvoza, a profil firme mora da može da kaže odakle podatak posle primene.
  if (p.izvestajSkilla) {
    await ctx.db.insert("leadFieldProvenance", {
      workspaceId,
      entityTable: "leadCompanies",
      entityId: companyId,
      fieldName: "izvestajSkilla",
      value: p.izvestajSkilla,
      source: "generate-leads",
      confidence: "priblizno",
      humanConfirmed: true,
      observedAt: now,
    });
  }
}

/**
 * Jezgro primene uvoza: prolazi kroz redove i upisuje ih u glavne tabele.
 * Deljeno između prve primene (`applyImport`) i naknadne „Primeni preostale"
 * (`applyRemainingRows`), jer se u režimu „obogati" nerazrešeni redovi rešavaju
 * tek POSLE prve primene (GL9 §1) — a oba puta moraju da rade isti upis.
 *
 * `samoNeprimenjeni` preskače redove koji već nose `primenjenAt` (primenjene u
 * ranijem krugu); inače je ponašanje isto. Svaki stvarno primenjen red dobija
 * `primenjenAt`, pa i „Primeni preostale" i `revertImport` znaju koji su redovi
 * ušli i u kom krugu.
 */
async function applyRows(
  ctx: MutationCtx,
  params: {
    workspaceId: Id<"workspaces">;
    importDoc: Doc<"leadImports">;
    ownerUserId: Id<"users">;
    actorUserId: Id<"users">;
    now: number;
    samoNeprimenjeni: boolean;
  },
): Promise<{
  appliedCount: number;
  newCompaniesCount: number;
  mergedCount: number;
  skippedCount: number;
  unresolvedSkippedCount: number;
  assignedCount: number;
}> {
    const { importDoc, ownerUserId, now, samoNeprimenjeni } = params;
    // Aliasi: telo petlje je izvučeno iz `applyImport` bez ijedne izmene, pa
    // `args.workspaceId` i `membership.userId` moraju i dalje da postoje.
    const args = { workspaceId: params.workspaceId, importId: importDoc._id };
    const membership = { userId: params.actorUserId };

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
    let assignedCount = 0;

    for (const r of rows) {
      // Redovi primenjeni u ranijem krugu se preskaču („Primeni preostale", GL9 §1).
      if (samoNeprimenjeni && r.primenjenAt !== undefined) continue;

      // 0. Preskoči meko obrisane redove (§1, §3, §6)
      if (r.obrisan === true) {
        skippedCount++;
        continue;
      }

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

        // Niša se upsert-uje po slugu PRE upisa firme, jer firma nosi njen id.
        const nicheId = p.nisa
          ? await upsertNicheBySlug(ctx, {
              workspaceId: args.workspaceId,
              slug: p.nisa,
              createdBy: ownerUserId,
              now,
              opis: importDoc.nisaOpis,
            })
          : undefined;

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
          // `r.temperatura` moze da nedostaje na starijim redovima. Odsustvo
          // je isto sto i "nova_firma" — to je podrazumevano stanje, ne odluka.
          // Vreme promene se upisuje SAMO kad je covek stvarno izabrao
          // temperaturu; inace bi red bez ijedne odluke dobio lazan trenutak
          // odlucivanja.
          temperatura: r.temperatura ?? "nova_firma",
          temperaturaPromenjenaAt:
            r.temperatura && r.temperatura !== "nova_firma" ? now : undefined,
          createdAt: now,
          updatedAt: now,
          createdBy: ownerUserId,

          // GL1 (plan §4.4): podaci iz skilla. Svako polje koje skill nije
          // poslao ostaje `undefined` — što u Convexu znači da polja NEMA, a to
          // je tačna tvrdnja „nije proveravano".
          nicheId,
          placeId: p.placeId,
          lat: p.koordinate?.lat,
          lng: p.koordinate?.lng,
          koordinateIzvor: p.koordinate ? p.koordinate.izvor : undefined,
          koordinateAt: p.koordinate ? now : undefined,
          imaSajt: p.imaSajt,
          imaSajtNapomena: p.imaSajtNapomena,
          sajtStatus: p.sajtStatus,
          sajtHttps: p.sajtHttps,
          sajtProverenAt: p.sajtProverenAt,
          sajtNapomena: p.sajtNapomena,
        });

        await ctx.db.patch(r._id, { createdCompanyId: companyId, primenjenAt: now });
        newCompaniesCount++;
        appliedCount++;

        const assignmentRes = await ensureAssignment(ctx, {
          workspaceId: args.workspaceId,
          companyId,
          ownerUserId,
          actorUserId: membership.userId,
          now,
        });
        if (assignmentRes.created) {
          assignedCount++;
        }

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

        // Platforme, osobe sa procenom telefona i signali o sajtu (GL1).
        await attachSkillData(ctx, {
          workspaceId: args.workspaceId,
          companyId,
          p,
          now,
          polja: importDoc.polja,
        });

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

        // GL1: dopuna praznih polja iz skilla, istim pravilom kao gore —
        // postojeća vrednost se NE gazi.
        if (!existing.placeId && p.placeId) patch.placeId = p.placeId;
        if (existing.lat === undefined && p.koordinate) {
          patch.lat = p.koordinate.lat;
          patch.lng = p.koordinate.lng;
          patch.koordinateIzvor = p.koordinate.izvor;
          patch.koordinateAt = now;
        }
        if (!existing.nicheId && p.nisa) {
          const nicheId = await upsertNicheBySlug(ctx, {
            workspaceId: args.workspaceId,
            slug: p.nisa,
            createdBy: ownerUserId,
            now,
            opis: importDoc.nisaOpis,
          });
          if (nicheId) patch.nicheId = nicheId;
        }
        // Stanje sajta je OPAŽANJE SA DATUMOM, ne trajna činjenica: svežija
        // provera pobeđuje stariju, jer sajt koji je juče radio danas može biti
        // mrtav. Zato se ovde prepisuje — ali samo ako je novija.
        if (
          p.sajtProverenAt !== undefined &&
          p.sajtProverenAt >= (existing.sajtProverenAt ?? 0)
        ) {
          patch.imaSajt = p.imaSajt ?? existing.imaSajt;
          patch.imaSajtNapomena = p.imaSajtNapomena;
          patch.sajtStatus = p.sajtStatus;
          patch.sajtHttps = p.sajtHttps;
          patch.sajtProverenAt = p.sajtProverenAt;
          patch.sajtNapomena = p.sajtNapomena;
        } else if (existing.imaSajt === undefined && p.imaSajt !== undefined) {
          // Skill nije zabeležio kad je proveravao, ali firma o sajtu nema
          // nikakav podatak — bolje nešto sa poznatim poreklom nego ništa.
          patch.imaSajt = p.imaSajt;
          patch.imaSajtNapomena = p.imaSajtNapomena;
        }

        if (r.temperatura && r.temperatura !== "nova_firma") {
          patch.temperatura = r.temperatura;
          patch.temperaturaPromenjenaAt = now;
        }
        patch.updatedAt = now;

        await ctx.db.patch(targetCompanyId, patch);

        const mergeAssignmentRes = await ensureAssignment(ctx, {
          workspaceId: args.workspaceId,
          companyId: targetCompanyId,
          ownerUserId,
          actorUserId: membership.userId,
          now,
        });
        if (mergeAssignmentRes.created) {
          assignedCount++;
        }
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

        // Platforme, osobe i signali o sajtu — isti put kao za novu firmu, sa
        // proverom postojanja, da spajanje ne izgubi ono što novi uvoz nosi.
        await attachSkillData(ctx, {
          workspaceId: args.workspaceId,
          companyId: targetCompanyId,
          p,
          now,
          polja: importDoc.polja,
        });

        // Red je stvarno primenjen — beleži se krug (GL9 §1), da „Primeni
        // preostale" ne dira ovaj red drugi put i da `revertImport` zna kad je ušao.
        await ctx.db.patch(r._id, { primenjenAt: now });

        mergedCount++;
        appliedCount++;
      }
    }

    return {
      appliedCount,
      newCompaniesCount,
      mergedCount,
      skippedCount,
      unresolvedSkippedCount,
      assignedCount,
    };
}

export const applyImport = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

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
        message:
          "Ovaj uvoz je već primenjen u bazi. Redove koji su ostali nerazrešeni primeni preko „Primeni preostale“.",
      });
    }

    if (importDoc.status === "ponisten") {
      throw new ConvexError({
        code: "invalid",
        message: "Poništen uvoz se ne može primeniti.",
      });
    }

    const now = Date.now();
    const rezultat = await applyRows(ctx, {
      workspaceId: args.workspaceId,
      importDoc,
      ownerUserId: importDoc.uploadedBy ?? membership.userId,
      actorUserId: membership.userId,
      now,
      samoNeprimenjeni: false,
    });

    await ctx.db.patch(args.importId, {
      status: "primenjen",
      appliedAt: now,
    });

    return rezultat;
  },
});

/**
 * „Primeni preostale (N)" (GL9 §1): primenjuje SAMO rešene redove bez
 * `primenjenAt` na uvozu koji je već primenjen. Tako 41 red koji je pri prvoj
 * primeni bio nerazrešen može da se reši i uđe u bazu, umesto da ostane zauvek
 * van nje. Status ostaje „primenjen"; `appliedAt` se NE pomera — prvi krug je
 * referenca za toleranciju u `revertImport`, a svaki red nosi svoj `primenjenAt`.
 */
export const applyRemainingRows = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const importDoc = await ctx.db.get(args.importId);
    if (!importDoc || importDoc.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Uvoz nije pronađen.",
      });
    }

    // Pre prve primene se koristi „Primeni uvoz"; „preostali" postoje tek posle.
    if (importDoc.status !== "primenjen") {
      throw new ConvexError({
        code: "invalid",
        message: "Preostali redovi se primenjuju tek posle prve primene uvoza.",
      });
    }

    const now = Date.now();
    return await applyRows(ctx, {
      workspaceId: args.workspaceId,
      importDoc,
      ownerUserId: importDoc.uploadedBy ?? membership.userId,
      actorUserId: membership.userId,
      now,
      samoNeprimenjeni: true,
    });
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
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

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
    let revertedAssignmentsCount = 0;

    const appliedTime = importDoc.appliedAt ?? 0;

    for (const r of rows) {
      if (r.createdCompanyId) {
        const company = await ctx.db.get(r.createdCompanyId);
        if (company && company.workspaceId === args.workspaceId) {
          // Referenca je trenutak kad je BAŠ OVAJ red primenjen (GL9 §1): red
          // primenjen u drugom krugu („Primeni preostale") ima `primenjenAt`
          // mnogo posle `appliedAt`, pa bi ga fiksna referenca lažno proglasila
          // „izmenjenim posle uvoza" i preskočila. Uvoz mora da poništi sve što
          // je napravio, bez obzira u kom je krugu red ušao.
          const refTime = r.primenjenAt ?? appliedTime;
          // Ako je firma izmenjena posle primene (uz toleranciju od 10 sekundi pri upisu),
          // ne brišemo je već je preskačemo radi bezbednosti podataka
          if (company.updatedAt > refTime + 10_000) {
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
            //
            // NE samo za samu firmu: `applyImport` upisuje poreklo i za svaku
            // osobu i za svaki telefon/mejl. Ranije su ti redovi ostajali posle
            // poništavanja — poreklo bez entiteta na koji pokazuje, koje se u
            // bazi nikad više ne pročita, a broji se u kvoti. Sa GL1 ih po
            // firmi ima do tri puta više (tri osobe + njihovi telefoni), pa je
            // spisak id-jeva sada izričit.
            const obrisaniEntiteti = new Set<string>([
              company._id as string,
              ...idents.map((i) => i._id as string),
              ...people.map((pe) => pe._id as string),
            ]);
            const provs = await ctx.db
              .query("leadFieldProvenance")
              .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
              .collect();
            for (const pr of provs) {
              if (!obrisaniEntiteti.has(pr.entityId)) continue;
              await ctx.db.delete(pr._id);
            }

            // 4b. Dodele te firme
            const assignments = await ctx.db
              .query("leadAssignments")
              .withIndex("by_workspace_company", (q) =>
                q.eq("workspaceId", args.workspaceId).eq("companyId", company._id),
              )
              .collect();
            for (const a of assignments) {
              await ctx.db.delete(a._id);
              revertedAssignmentsCount++;
            }

            // 4c. Događaji faze koje je kreirao ovaj uvoz
            const stageEvents = await ctx.db
              .query("leadStageEvents")
              .withIndex("by_workspace_company", (q) =>
                q.eq("workspaceId", args.workspaceId).eq("companyId", company._id),
              )
              .collect();
            for (const ev of stageEvents) {
              if (ev.kind === "dodela" && ev.note === "Dodeljen pri uvozu tabele") {
                await ctx.db.delete(ev._id);
              }
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
      revertedAssignmentsCount,
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
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }
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
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const rows = args.decision
      ? await ctx.db
          .query("leadImportRows")
          .withIndex("by_import_decision", (q) =>
            q.eq("importId", args.importId).eq("decision", args.decision!),
          )
          .collect()
      : await ctx.db
          .query("leadImportRows")
          .withIndex("by_workspace_import", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("importId", args.importId),
          )
          .collect();

    // U primenjenom uvozu staging red je istorija — temperatura koja VAŽI živi
    // na leadCompanies. Zato svaki red dobija `firmaId` i `firmaTemperatura` sa
    // žive firme (createdCompanyId ili matchedCompanyId), da ekran može da menja
    // FIRMU, ne staging red. Ako firma ne postoji (obrisana posle uvoza), oba su
    // undefined — prikaz to kaže izričito, NE pretvara u „nova firma".
    const imp = await ctx.db.get(args.importId);
    const applied = imp?.status === "primenjen";

    type FirmaTemperatura =
      | "nova_firma"
      | "cold"
      | "warm"
      | "hot"
      | undefined;

    return await Promise.all(
      rows.map(async (row) => {
        let firmaId: Id<"leadCompanies"> | undefined = undefined;
        let firmaTemperatura: FirmaTemperatura = undefined;

        if (applied) {
          const companyId = row.createdCompanyId ?? row.matchedCompanyId;
          if (companyId) {
            const company = await ctx.db.get(companyId);
            if (company && company.workspaceId === args.workspaceId) {
              firmaId = company._id;
              firmaTemperatura = company.temperatura;
            }
          }
        }

        return { ...row, firmaId, firmaTemperatura };
      }),
    );
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
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const imports = await ctx.db
      .query("leadImports")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .collect();

    // Broj nerazrešenih redova po uvozu (GL9 §1): istorija ga prikazuje u koloni
    // „Preskočeno / Nerazrešeno" i, za primenjen uvoz sa nerazrešenima, nudi
    // dugme „Reši preostale". Nerazrešen red nikad nema `primenjenAt`, pa je broj
    // po odluci dovoljan (indeks `by_import_decision`).
    return await Promise.all(
      imports.map(async (imp) => {
        const nerazreseni = await ctx.db
          .query("leadImportRows")
          .withIndex("by_import_decision", (q) =>
            q.eq("importId", imp._id).eq("decision", "nerazreseno"),
          )
          .collect();
        return { ...imp, nerazresenoCount: nerazreseni.length };
      }),
    );
  },
});

/**
 * Postavlja temperaturu pojedinačnog reda u staging-u (§1, §3, §6).
 */
export const setRowTemperatura = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    rowId: v.id("leadImportRows"),
    temperatura: v.union(
      v.literal("nova_firma"),
      v.literal("cold"),
      v.literal("warm"),
      v.literal("hot"),
    ),
  },
  handler: async (ctx, args) => {
    // Poredi se sa radnim prostorom POZIVAOCA, ne sa onim iz argumenata.
    // `requireMembership` vraća workspace samog korisnika i ne gleda nijedan
    // argument; ako se `args.workspaceId` poredi sam sa sobom, provera je
    // prazna — pozivalac prosto pošalje tuđi id i prođe.
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const row = await ctx.db.get(args.rowId);
    if (!row || row.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Red uvoza nije pronađen.",
      });
    }

    await ctx.db.patch(args.rowId, { temperatura: args.temperatura });
    return { success: true };
  },
});

/**
 * Postavlja meko brisanje za pojedinačni red u staging-u (§1, §3, §6).
 */
export const setRowObrisan = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    rowId: v.id("leadImportRows"),
    obrisan: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Poredi se sa radnim prostorom POZIVAOCA, ne sa onim iz argumenata.
    // `requireMembership` vraća workspace samog korisnika i ne gleda nijedan
    // argument; ako se `args.workspaceId` poredi sam sa sobom, provera je
    // prazna — pozivalac prosto pošalje tuđi id i prođe.
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const row = await ctx.db.get(args.rowId);
    if (!row || row.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Red uvoza nije pronađen.",
      });
    }

    await ctx.db.patch(args.rowId, { obrisan: args.obrisan });
    return { success: true };
  },
});

/**
 * Ažurira skrivene kolone za ceo uvoz (§3, §6).
 */
export const setImportHiddenColumns = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    importId: v.id("leadImports"),
    skriveneKolone: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Poredi se sa radnim prostorom POZIVAOCA, ne sa onim iz argumenata.
    // `requireMembership` vraća workspace samog korisnika i ne gleda nijedan
    // argument; ako se `args.workspaceId` poredi sam sa sobom, provera je
    // prazna — pozivalac prosto pošalje tuđi id i prođe.
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    const imp = await ctx.db.get(args.importId);
    if (!imp || imp.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "not_found",
        message: "Uvoz nije pronađen.",
      });
    }

    await ctx.db.patch(args.importId, { skriveneKolone: args.skriveneKolone });
    return { success: true };
  },
});
