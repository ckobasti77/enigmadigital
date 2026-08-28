import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireMembership } from "./lib/auth";
import {
  CANONICAL_CSV_COLUMNS,
  type CanonicalLeadExportRow,
} from "./lib/leadExport";

/**
 * ============================================================================
 * LEAD EXPORT STORE (§6, §8, LM12) — Izvoz leadova u kanonski CSV format
 * ============================================================================
 *
 * ARHITEKTONSKA I PRAVNA PRAVILA:
 * 1. Granica 1000 redova po pozivu. Iznad toga baca se imenovana ConvexError.
 *    Nikada se tiho ne odseca lista.
 * 2. PRAVNI OSNOV (§8 ZZPL / GDPR):
 *    - Svaki kontakt (telefon, email, ime lica) mora imati zabeležen `lawfulBasis`
 *      i `sourceUrl`.
 *    - Kontakt BEZ pravnog osnova se NE IZVOZI.
 *    - Broj izostavljenih redova se vraća kao `izostavljenoBezOsnova` i UI ga
 *      MORA prikazati korisniku.
 * 3. Izvedena ocena leada (score) se NE izvozi — ona se računa pri čitanju.
 * 4. UI pravi CSV preko klijentskog Blob-a, server vraća samo strukturirane redove.
 * ============================================================================
 */

export const MAX_EXPORT_LIMIT = 1000;

/**
 * Broj recenzija iz tekstualne vrednosti signala.
 *
 * Nula je vrednost, ne odsustvo vrednosti — vraća se kao 0. Tekst koji nije
 * broj vraća `null`, jer je to stvarno „ne zna se".
 */
function parseReviewCount(raw?: string): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

export const exportLeads = query({
  args: {
    workspaceId: v.id("workspaces"),
    stage: v.optional(v.string()),
    ownerUserId: v.optional(v.id("users")),
    onlyWithPhone: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx);
    if (membership.workspaceId !== args.workspaceId) {
      throw new ConvexError({
        code: "forbidden",
        message: "Nemate pristup ovom radnom prostoru.",
      });
    }

    // 1. Učitaj firme, ali OGRANIČENO.
    //
    // Ranije je ovde stajao `.collect()` nad celom tabelom, pa se provera
    // granice od 1000 dešavala TEK POSLE čitanja svih firmi. Radni prostor sa
    // 5000 firmi bi probio Convex-ov limit čitanja i pao sa sistemskom
    // greškom — pre nego što stigne da kaže čoveku „suzi filter".
    const scannedCompanies = await ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(MAX_EXPORT_LIMIT + 1);

    const preveliko = scannedCompanies.length > MAX_EXPORT_LIMIT;
    const allCompanies = preveliko
      ? scannedCompanies.slice(0, MAX_EXPORT_LIMIT)
      : scannedCompanies;

    // 2. Ako su zadati filteri po fazi ili vlasniku, filtriramo preko leadAssignments
    let targetCompanies = allCompanies;

    if (args.stage || args.ownerUserId) {
      const assignments = await ctx.db
        .query("leadAssignments")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
        .collect();

      const matchingCompanyIds = new Set<string>();
      for (const a of assignments) {
        let match = true;
        if (args.stage && a.stage !== args.stage) {
          match = false;
        }
        if (args.ownerUserId && a.ownerUserId !== args.ownerUserId) {
          match = false;
        }
        if (match) {
          matchingCompanyIds.add(String(a.companyId));
        }
      }

      targetCompanies = targetCompanies.filter((c) =>
        matchingCompanyIds.has(String(c._id)),
      );
    }

    // 3. Opciona pretraga po nazivu, gradu ili PIB-u
    if (args.search && args.search.trim().length > 0) {
      const searchNorm = args.search.trim().toLowerCase();
      targetCompanies = targetCompanies.filter(
        (c) =>
          c.name.toLowerCase().includes(searchNorm) ||
          (c.city && c.city.toLowerCase().includes(searchNorm)) ||
          (c.pib && c.pib.includes(searchNorm)),
      );
    }

    // 4. Zaštitni limit: iznad 1000 redova se ne dozvoljava masovni izvoz.
    // Kad se granica probila već pri čitanju firmi, tačan broj ne znamo — i
    // ne izmišljamo ga.
    if (preveliko || targetCompanies.length > MAX_EXPORT_LIMIT) {
      throw new ConvexError({
        code: "export_limit_exceeded",
        message: preveliko
          ? `U radnom prostoru ima više od ${MAX_EXPORT_LIMIT} firmi, što prelazi granicu za jedan izvoz. Primenite filtere (faza, vlasnik) da suzite opseg.`
          : `Zahtevan je izvoz ${targetCompanies.length} leadova, što prelazi maksimalnu granicu od ${MAX_EXPORT_LIMIT} redova po izvozu. Primenite filtere (faza, vlasnik) da suzite opseg.`,
      });
    }

    if (targetCompanies.length === 0) {
      return {
        rows: [] as CanonicalLeadExportRow[],
        ukupno: 0,
        odseceno: false,
        izostavljenoBezOsnova: 0,
        kolone: [...CANONICAL_CSV_COLUMNS],
      };
    }

    // 5. Učitaj povezane relacije za radni prostor
    // Povezane tabele se takođe čitaju ograničeno. Ako se neka prelije, izvoz
    // se NE nastavlja: lead čiji telefon nije pročitan izašao bi u fajl sa
    // praznom kolonom telefona, a fajl koji izgleda potpuno je gori od fajla
    // koji nije napravljen. Zato se baca imenovana greška.
    const RELATION_SCAN = 20_000;

    const [allIdentities, allPeople, allSignals, allProvenance] =
      await Promise.all([
        ctx.db
          .query("leadIdentities")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", args.workspaceId),
          )
          .take(RELATION_SCAN + 1),
        ctx.db
          .query("leadPeople")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", args.workspaceId),
          )
          .take(RELATION_SCAN + 1),
        ctx.db
          .query("leadSignals")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", args.workspaceId),
          )
          .take(RELATION_SCAN + 1),
        ctx.db
          .query("leadFieldProvenance")
          .withIndex("by_workspace", (q) =>
            q.eq("workspaceId", args.workspaceId),
          )
          .take(RELATION_SCAN + 1),
      ]);

    const prelivTabela = [
      { naziv: "leadIdentities", broj: allIdentities.length },
      { naziv: "leadPeople", broj: allPeople.length },
      { naziv: "leadSignals", broj: allSignals.length },
      { naziv: "leadFieldProvenance", broj: allProvenance.length },
    ].filter((t) => t.broj > RELATION_SCAN);

    if (prelivTabela.length > 0) {
      throw new ConvexError({
        code: "export_relations_overflow",
        message: `Izvoz je zaustavljen: ${prelivTabela
          .map((t) => t.naziv)
          .join(", ")} ima više od ${RELATION_SCAN} zapisa, pa se ne može pouzdano spojiti sa firmama. Suzite izvoz filterima.`,
      });
    }

    // 6. Mape relacija po firmi
    const identitiesByCompany = new Map<string, Doc<"leadIdentities">[]>();
    for (const ident of allIdentities) {
      const cid = String(ident.companyId);
      const list = identitiesByCompany.get(cid) ?? [];
      list.push(ident);
      identitiesByCompany.set(cid, list);
    }

    const peopleByCompany = new Map<string, Doc<"leadPeople">[]>();
    for (const p of allPeople) {
      const cid = String(p.companyId);
      const list = peopleByCompany.get(cid) ?? [];
      list.push(p);
      peopleByCompany.set(cid, list);
    }

    const ratingSignalsByCompany = new Map<string, Doc<"leadSignals">>();
    for (const s of allSignals) {
      if (s.numerator !== undefined && s.denominator !== undefined) {
        ratingSignalsByCompany.set(String(s.companyId), s);
      }
    }

    const sourcesByCompany = new Map<string, Set<string>>();
    const notesByCompany = new Map<string, string>();
    for (const prov of allProvenance) {
      if (prov.entityTable === "leadCompanies") {
        const cid = prov.entityId;
        if (prov.source) {
          const set = sourcesByCompany.get(cid) ?? new Set<string>();
          set.add(prov.source);
          sourcesByCompany.set(cid, set);
        }
        if (prov.fieldName === "napomena" || prov.fieldName === "notes") {
          notesByCompany.set(cid, prov.value);
        }
      }
    }

    // 7. Obrada i provera pravnog osnova (§8)
    let izostavljenoBezOsnova = 0;
    const exportRows: CanonicalLeadExportRow[] = [];

    for (const company of targetCompanies) {
      const cid = String(company._id);
      const companyIdentities = identitiesByCompany.get(cid) ?? [];
      const companyPeople = peopleByCompany.get(cid) ?? [];

      const phoneIdent = companyIdentities.find(
        (i) => i.kind === "phone" && i.value && i.value.trim().length > 0,
      );
      const emailIdent = companyIdentities.find(
        (i) => i.kind === "email" && i.value && i.value.trim().length > 0,
      );
      const websiteIdent = companyIdentities.find(
        (i) => i.kind === "website" && i.value && i.value.trim().length > 0,
      );
      const contactPerson = companyPeople.find(
        (p) => p.name && p.name.trim().length > 0,
      );

      // Ako je uključen filter "onlyWithPhone", a firma nema telefon, preskače se
      if (args.onlyWithPhone && !phoneIdent) {
        continue;
      }

      // PRAVNI DEO (§8):
      // Kontakt podaci (telefon, email, ime fizičkog lica) su podaci o ličnosti po ZZPL/GDPR.
      // Izvoz je tačka u kojoj podaci napuštaju kontrolisani sistem.
      // Ako postoje lični kontakt podaci, oni MORAJU imati evidentiran pravni osnov i izvor.
      let hasPersonalContact = false;
      let lawfulBasisValid = true;

      if (phoneIdent) {
        hasPersonalContact = true;
        if (
          !phoneIdent.lawfulBasis ||
          phoneIdent.lawfulBasis.trim().length === 0 ||
          phoneIdent.lawfulBasis === "nepoznato" ||
          !phoneIdent.sourceUrl ||
          phoneIdent.sourceUrl.trim().length === 0
        ) {
          lawfulBasisValid = false;
        }
      }

      if (emailIdent) {
        hasPersonalContact = true;
        if (
          !emailIdent.lawfulBasis ||
          emailIdent.lawfulBasis.trim().length === 0 ||
          emailIdent.lawfulBasis === "nepoznato" ||
          !emailIdent.sourceUrl ||
          emailIdent.sourceUrl.trim().length === 0
        ) {
          lawfulBasisValid = false;
        }
      }

      // IME FIZIČKOG LICA JE PODATAK O LIČNOSTI (§8), isto kao telefon.
      //
      // Ranije se proveravao samo telefon i e-mail, pa je red bez oba a sa
      // imenom vlasnika izlazio u fajl bez ijedne provere pravnog osnova.
      // Ime i prezime vlasnika salona je upravo ono što ZZPL štiti.
      let imeBezOsnova = false;
      if (contactPerson && contactPerson.name.trim().length > 0) {
        hasPersonalContact = true;

        // Osoba nema sopstveni `lawfulBasis` — on stoji na identitetu. Ako
        // za tu osobu ne postoji NIJEDAN identitet sa važećim osnovom, ime
        // nema pravni osnov po kom bi izašlo iz sistema.
        const personIdentities = companyIdentities.filter(
          (i) => i.personId === contactPerson._id,
        );
        const imaValidan = personIdentities.some(
          (i) =>
            i.lawfulBasis &&
            i.lawfulBasis.trim().length > 0 &&
            i.lawfulBasis !== "nepoznato" &&
            i.sourceUrl &&
            i.sourceUrl.trim().length > 0,
        );
        if (!imaValidan) {
          imeBezOsnova = true;
        }
      }

      // Ako postoje podaci o ličnosti bez važećeg pravnog osnova ili izvora, red se NE IZVOZI (§8)
      if (hasPersonalContact && (!lawfulBasisValid || imeBezOsnova)) {
        izostavljenoBezOsnova++;
        continue;
      }

      const ratingSignal = ratingSignalsByCompany.get(cid);
      const sourceSet = sourcesByCompany.get(cid) ?? new Set<string>();
      if (company.firstSeenSource) {
        sourceSet.add(company.firstSeenSource);
      }
      const sourcesStr = Array.from(sourceSet).join(";");

      const row: CanonicalLeadExportRow = {
        naziv_firme: company.name,
        ulica: company.street || "",
        opstina: company.municipality || "",
        grad: company.city || "",
        telefon: phoneIdent
          ? phoneIdent.valueNormalized || phoneIdent.value
          : "",
        email: emailIdent ? emailIdent.value : "",
        sajt:
          company.website ||
          company.domainNormalized ||
          (websiteIdent ? websiteIdent.value : ""),
        ime_osobe: contactPerson ? contactPerson.name : "",
        uloga:
          contactPerson && contactPerson.role !== "nepoznato"
            ? contactPerson.role
            : "",
        ocena_vrednost: ratingSignal?.numerator ?? null,
        ocena_skala: ratingSignal?.denominator ?? null,
        // `|| null` je ovde gutao pravu NULU: salon sa 0 recenzija (nov
        // biznis) izlazio bi sa praznom ćelijom, isto kao salon o kom ne
        // znamo ništa. To su suprotne informacije za prodaju.
        ocena_broj_recenzija: parseReviewCount(ratingSignal?.value),
        ocena_izvor: ratingSignal?.source ?? "",
        companywall_url: company.companyWallUrl || "",
        pib: company.pib || "",
        maticni_broj: company.maticniBroj || "",
        sifra_delatnosti: company.sifraDelatnosti || "",
        napomena: notesByCompany.get(cid) || "",
        izvori: sourcesStr,
      };

      exportRows.push(row);
    }

    return {
      rows: exportRows,
      ukupno: exportRows.length,
      odseceno: false,
      izostavljenoBezOsnova,
      kolone: [...CANONICAL_CSV_COLUMNS],
    };
  },
});
