/// <reference types="vite/client" />
/**
 * Izolacija grupe C06 (leadovi, novosti, napredak, obaveštenja): za svaki
 * modul član projekta A ne čita projekat B i ne menja ga, `client_viewer` ne
 * menja podatke projekta, a funkcije vlasnika odbijaju urednika. Napredak i
 * zvono su lični redovi po projektu: posmatrač ih menja, ali samo svoje i samo
 * u projektu u kome jeste, a isti ključ u drugom projektu je drugi red.
 */
import type { FunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_UREDNIK = /urednik ili vlasnik/;
const TREBA_VLASNIK = /samo vlasnik projekta/;

type Upit = [FunctionReference<"query">, Record<string, unknown>];
type Izmena = [FunctionReference<"mutation">, Record<string, unknown>];

/** Svaki upit sa liste, pozvan nad B od člana samo projekta A, pada. */
async function upitiNadBOdbijeni(s: Svet, upiti: Upit[]) {
  for (const [fn, args] of upiti) {
    await odbijeno(
      kao(s, s.ana).query(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

async function izmeneNadBOdbijene(s: Svet, izmene: Izmena[]) {
  for (const [fn, args] of izmene) {
    await odbijeno(
      kao(s, s.ana).mutation(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

/** `client_viewer` u A ne menja ništa sa liste (podrazumevano urednik). */
async function posmatracNeMenja(s: Svet, izmene: Izmena[]) {
  for (const [fn, args] of izmene) {
    await odbijeno(
      kao(s, s.viewer).mutation(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_UREDNIK,
    );
  }
}

type Podaci = {
  firma: Id<"leadCompanies">;
  identitet: Id<"leadIdentities">;
  preset: Id<"leadFilterPresets">;
  uvoz: Id<"leadImports">;
  red: Id<"leadImportRows">;
  prijem: Id<"leadInbound">;
  landing: Id<"leadLandings">;
  pravilo: Id<"leadIcpRules">;
  zabrana: Id<"leadSuppression">;
  nisa: Id<"niches">;
  platforma: Id<"nichePlatforms">;
  token: Id<"ingestTokens">;
  objava: Id<"posts">;
};

/** Po jedan red svake tabele grupe u projektu `ws`, sa oznakom u imenu. */
async function napraviPodatke(
  s: Svet,
  ws: Id<"workspaces">,
  vlasnik: Id<"users">,
  oznaka: string,
): Promise<Podaci> {
  return await s.t.run(async (ctx) => {
    const sada = 1_760_000_000_000;
    const firma = await ctx.db.insert("leadCompanies", {
      workspaceId: ws,
      createdAt: sada,
      updatedAt: sada,
      name: `Firma ${oznaka}`,
      nameNormalized: `firma ${oznaka}`.toLowerCase(),
      origin: "import",
    });
    const identitet = await ctx.db.insert("leadIdentities", {
      workspaceId: ws,
      companyId: firma,
      kind: "phone",
      value: "+381601234567",
      lawfulBasis: "javni izvor",
      sourceUrl: "https://primer.rs",
    });
    const preset = await ctx.db.insert("leadFilterPresets", {
      workspaceId: ws,
      naziv: `Preset ${oznaka}`,
      query: "faza=nov",
      createdAt: sada,
    });
    const uvoz = await ctx.db.insert("leadImports", {
      workspaceId: ws,
      fileName: `uvoz-${oznaka}.xlsx`,
      uploadedAt: sada,
      status: "u_pregledu",
      sheetsChosen: ["List1"],
      headerRowIndex: 0,
      rowsParsed: 1,
      rowsSkipped: 0,
      warnings: [],
    });
    const red = await ctx.db.insert("leadImportRows", {
      workspaceId: ws,
      importId: uvoz,
      sourceSheet: "List1",
      sourceRowIndex: 1,
      parsed: { nazivFirme: `Firma ${oznaka}`, izvori: [], derivedSignals: [] },
      decision: "nerazreseno",
      conflicts: [],
    });
    const prijem = await ctx.db.insert("leadInbound", {
      workspaceId: ws,
      platform: "instagram",
      kind: "dm",
      externalId: `dm-${oznaka}`,
      occurredAt: sada,
      status: "nov",
      derivedSignals: [],
      createdAt: sada,
    });
    const link = await ctx.db.insert("orTrackedLinks", {
      workspaceId: ws,
      slug: `l-${oznaka}`,
      destinationUrl: "https://primer.rs",
      createdAt: sada,
    });
    const landing = await ctx.db.insert("leadLandings", {
      workspaceId: ws,
      companyId: firma,
      trackedLinkId: link,
      createdAt: sada,
      status: "napravljena",
    });
    const pravilo = await ctx.db.insert("leadIcpRules", {
      workspaceId: ws,
      name: `Pravilo ${oznaka}`,
      axis: "fit",
      signalKind: `signal_${oznaka}`,
      weight: 10,
      isActive: true,
      createdAt: sada,
      updatedAt: sada,
    });
    const zabrana = await ctx.db.insert("leadSuppression", {
      workspaceId: ws,
      kind: "interno",
      matchOn: "domain",
      value: `${oznaka}.rs`,
      addedAt: sada,
    });
    const nisa = await ctx.db.insert("niches", {
      workspaceId: ws,
      slug: `nisa-${oznaka}`,
      naziv: `Niša ${oznaka}`,
      createdAt: sada,
      updatedAt: sada,
    });
    const platforma = await ctx.db.insert("nichePlatforms", {
      workspaceId: ws,
      nicheId: nisa,
      platforma: "instagram",
      redosled: 0,
      createdAt: sada,
    });
    const token = await ctx.db.insert("ingestTokens", {
      workspaceId: ws,
      tokenHash: `hes-${oznaka}`,
      naziv: `Token ${oznaka}`,
      createdBy: vlasnik,
      createdAt: sada,
    });
    const objava = await ctx.db.insert("posts", {
      workspaceId: ws,
      slug: `objava-${oznaka}`,
      locale: "sr",
      kind: "note",
      category: "odluke",
      title: `Objava ${oznaka}`,
      dek: "",
      body: "Tekst.",
      authorName: "Autor",
      tags: [],
      status: "draft",
      updatedAt: sada,
      ownProofChecked: false,
    });
    return {
      firma,
      identitet,
      preset,
      uvoz,
      red,
      prijem,
      landing,
      pravilo,
      zabrana,
      nisa,
      platforma,
      token,
      objava,
    };
  });
}

async function svetSaPodacima() {
  const s = await napraviSvet();
  const a = await napraviPodatke(s, s.wsA, s.ana, "a");
  const b = await napraviPodatke(s, s.wsB, s.boban, "b");
  return { s, a, b };
}

/** Koliko redova tabele pripada projektu (preko indeksa `by_workspace*`). */
async function brojRedova(
  s: Svet,
  tabela:
    | "leadAssignments"
    | "leadStageEvents"
    | "leadSuppression"
    | "leadIcpRules"
    | "niches"
    | "leadLandings"
    | "posts"
    | "leadImports"
    | "leadFilterPresets",
  ws: Id<"workspaces">,
): Promise<number> {
  return await s.t.run(async (ctx) => {
    const svi = await ctx.db.query(tabela).collect();
    return svi.filter((r) => r.workspaceId === ws).length;
  });
}

// ── CRM, detalj, izvoz, dopuna rupa ──────────────────────────────────────────

describe("leadovi: CRM, detalj, izvoz, dopuna", () => {
  function upiti(p: Podaci, s: Svet): Upit[] {
    return [
      [api.leadCrmStore.listMeetings, {}],
      [api.leadCrmStore.getLeadCrm, { companyId: p.firma }],
      [api.leadCrmStore.listByOwner, { ownerUserId: s.boban }],
      [api.leadCrmStore.listByStage, { stage: "nov" }],
      [api.leadCrmStore.listOverdue, {}],
      [api.leadDetailStore.getLeadDetail, { companyId: p.firma }],
      [api.leadExportStore.exportLeads, {}],
    ];
  }
  function izmene(p: Podaci, vlasnik: Id<"users">): Izmena[] {
    return [
      [api.leadCrmStore.assignLead, { companyId: p.firma, ownerUserId: vlasnik }],
      [api.leadCrmStore.setStage, { companyId: p.firma, stage: "u_radu" }],
      [api.leadCrmStore.logTouch, { companyId: p.firma, channel: "poziv" }],
      [api.leadCrmStore.setNextAction, { companyId: p.firma, nextActionAt: 1 }],
      [api.leadCrmStore.recordOutcome, { companyId: p.firma, outcome: "nije_se_javio" }],
      [api.leadCrmStore.addToSuppressionFromOutcome, { companyId: p.firma }],
      [api.leadCrmStore.setMeeting, { companyId: p.firma, meetingAt: 1 }],
      [api.leadCrmStore.clearMeeting, { companyId: p.firma }],
      [api.leadCrmStore.setCompanyTemperatura, { companyId: p.firma, temperatura: "hot" }],
      [
        api.leadDetailStore.setPhoneConfidence,
        { identityId: p.identitet, verovatnoca: 50, obrazlozenje: "x" },
      ],
      [
        api.leadGapFillStore.fillGap,
        {
          companyId: p.firma,
          gapType: "bez_sajta",
          vrednost: "https://primer.rs",
          confidence: "tacno",
        },
      ],
    ];
  }

  test("član A ne čita i ne menja leadove B; B ostaje netaknut", async () => {
    const { s, b } = await svetSaPodacima();
    await upitiNadBOdbijeni(s, upiti(b, s));
    await izmeneNadBOdbijene(s, izmene(b, s.boban));

    expect(await brojRedova(s, "leadAssignments", s.wsB)).toBe(0);
    expect(await brojRedova(s, "leadStageEvents", s.wsB)).toBe(0);
    expect(await brojRedova(s, "leadSuppression", s.wsB)).toBe(1);
    const firmaB = await s.t.run(async (ctx) => ctx.db.get(b.firma));
    expect(firmaB?.temperatura).toBeUndefined();
  });

  test("tuđa firma kroz sopstveni projekat nije pronađena", async () => {
    const { s, b } = await svetSaPodacima();
    await expect(
      kao(s, s.urednica).mutation(api.leadCrmStore.setStage, {
        workspaceId: s.wsA,
        companyId: b.firma,
        stage: "u_radu",
      }),
    ).rejects.toThrow(/nije pronađena/);
    await expect(
      kao(s, s.urednica).query(api.leadDetailStore.getLeadDetail, {
        workspaceId: s.wsA,
        companyId: b.firma,
      }),
    ).rejects.toThrow(/nije pronađena/);
    expect(await brojRedova(s, "leadAssignments", s.wsB)).toBe(0);
  });

  test("posmatrač čita, ali ne menja i ne izvozi kontakte", async () => {
    const { s, a } = await svetSaPodacima();
    const crm = await kao(s, s.viewer).query(api.leadCrmStore.getLeadCrm, {
      workspaceId: s.wsA,
      companyId: a.firma,
    });
    expect(crm).not.toBeNull();
    await posmatracNeMenja(s, izmene(a, s.viewer));
    await odbijeno(
      kao(s, s.viewer).query(api.leadExportStore.exportLeads, { workspaceId: s.wsA }),
      "forbidden",
      TREBA_UREDNIK,
    );
    expect(await brojRedova(s, "leadAssignments", s.wsA)).toBe(0);
  });

  test("dodela: vlasnik leada mora biti član baš ovog projekta", async () => {
    const { s, a } = await svetSaPodacima();
    // Boban je član samo B: u A ga nema, iako ima članstvo.
    await expect(
      kao(s, s.urednica).mutation(api.leadCrmStore.assignLead, {
        workspaceId: s.wsA,
        companyId: a.firma,
        ownerUserId: s.boban,
      }),
    ).rejects.toThrow(/nije član ovog projekta/);
    // Jovan je član i A i B: prolazi.
    await kao(s, s.urednica).mutation(api.leadCrmStore.assignLead, {
      workspaceId: s.wsA,
      companyId: a.firma,
      ownerUserId: s.jovan,
    });
    const dodele = await s.t.run(async (ctx) => ctx.db.query("leadAssignments").collect());
    expect(dodele.map((d) => [d.workspaceId, d.ownerUserId])).toEqual([[s.wsA, s.jovan]]);
  });

  test("član oba projekta radi u svakom posebno", async () => {
    const { s, b } = await svetSaPodacima();
    await kao(s, s.jovan).mutation(api.leadCrmStore.setStage, {
      workspaceId: s.wsB,
      companyId: b.firma,
      stage: "u_radu",
    });
    expect(await brojRedova(s, "leadAssignments", s.wsB)).toBe(1);
    expect(await brojRedova(s, "leadAssignments", s.wsA)).toBe(0);
  });
});

// ── uvoz, prijem, lista zabrane ──────────────────────────────────────────────

describe("leadovi: uvoz, prijem, lista zabrane", () => {
  function upiti(p: Podaci): Upit[] {
    return [
      [api.leadImportStore.getImport, { importId: p.uvoz }],
      [api.leadImportStore.listImportRows, { importId: p.uvoz }],
      [api.leadImportStore.listImports, {}],
      [api.leadInboundStore.listInbound, {}],
      [api.leadInboundStore.getInbound, { inboundId: p.prijem }],
      [api.leadSuppressionStore.listSuppression, {}],
    ];
  }
  function izmene(p: Podaci): Izmena[] {
    return [
      [
        api.leadImportStore.createImport,
        {
          fileName: "novo.xlsx",
          sheetsChosen: ["List1"],
          headerRowIndex: 0,
          rows: [],
          skipped: [],
          warnings: [],
        },
      ],
      [api.leadImportStore.setRowDecision, { rowId: p.red, decision: "preskoci" }],
      [api.leadImportStore.applyImport, { importId: p.uvoz }],
      [api.leadImportStore.applyRemainingRows, { importId: p.uvoz }],
      [api.leadImportStore.abandonImport, { importId: p.uvoz }],
      [api.leadImportStore.revertImport, { importId: p.uvoz }],
      [api.leadImportStore.setRowTemperatura, { rowId: p.red, temperatura: "warm" }],
      [api.leadImportStore.setRowObrisan, { rowId: p.red, obrisan: true }],
      [api.leadImportStore.setImportHiddenColumns, { importId: p.uvoz, skriveneKolone: [] }],
      [
        api.leadInboundStore.linkInboundToCompany,
        {
          inboundId: p.prijem,
          companyId: p.firma,
          identityValue: "@primer",
          lawfulBasis: "javni profil",
          sourceUrl: "https://instagram.com/primer",
        },
      ],
      [api.leadInboundStore.dismissInbound, { inboundId: p.prijem, reason: "x" }],
      [api.leadSuppressionStore.addSuppression, { kind: "interno", matchOn: "domain", value: "z.rs" }],
      [api.leadSuppressionStore.removeSuppression, { id: p.zabrana }],
    ];
  }

  test("član A ne čita i ne menja uvoz, prijem i zabranu B", async () => {
    const { s, b } = await svetSaPodacima();
    await upitiNadBOdbijeni(s, upiti(b));
    await izmeneNadBOdbijene(s, izmene(b));

    const stanje = await s.t.run(async (ctx) => ({
      uvoz: (await ctx.db.get(b.uvoz))?.status,
      red: (await ctx.db.get(b.red))?.decision,
      prijem: (await ctx.db.get(b.prijem))?.status,
      zabrana: (await ctx.db.get(b.zabrana)) !== null,
    }));
    expect(stanje).toEqual({ uvoz: "u_pregledu", red: "nerazreseno", prijem: "nov", zabrana: true });
    expect(await brojRedova(s, "leadImports", s.wsB)).toBe(1);
    expect(await brojRedova(s, "leadSuppression", s.wsB)).toBe(1);
  });

  test("u A se vide samo uvozi A; tuđ uvoz kroz A nije pronađen", async () => {
    const { s, a, b } = await svetSaPodacima();
    const uvozi = await kao(s, s.ana).query(api.leadImportStore.listImports, {
      workspaceId: s.wsA,
    });
    expect(uvozi.map((u) => u._id)).toEqual([a.uvoz]);
    const redovi = await kao(s, s.ana).query(api.leadImportStore.listImportRows, {
      workspaceId: s.wsA,
      importId: b.uvoz,
    });
    expect(redovi).toEqual([]);
    await expect(
      kao(s, s.urednica).mutation(api.leadImportStore.abandonImport, {
        workspaceId: s.wsA,
        importId: b.uvoz,
      }),
    ).rejects.toThrow(/nije pronađen/);
    const uvozB = await s.t.run(async (ctx) => ctx.db.get(b.uvoz));
    expect(uvozB?.status).toBe("u_pregledu");
  });

  test("posmatrač ne menja uvoz, prijem ni zabranu", async () => {
    const { s, a } = await svetSaPodacima();
    await posmatracNeMenja(s, izmene(a));
    const uvozA = await s.t.run(async (ctx) => ctx.db.get(a.uvoz));
    expect(uvozA?.status).toBe("u_pregledu");
    expect(await brojRedova(s, "leadImports", s.wsA)).toBe(1);
  });
});

// ── filteri, rupe, ocenjivanje ───────────────────────────────────────────────

describe("leadovi: filteri, rupe, ocenjivanje", () => {
  function upiti(p: Podaci): Upit[] {
    return [
      [api.leadFiltersStore.listLeadsFiltered, {}],
      [api.leadFiltersStore.countLeadsByFacet, {}],
      [api.leadFiltersStore.listLeadsForMap, {}],
      [api.leadFiltersStore.getLeadRow, { companyId: p.firma }],
      [api.leadFiltersStore.listPresets, {}],
      [api.leadGapsStore.listGaps, {}],
      [api.leadGapsStore.listCompaniesWithGap, { gapType: "bez_sajta" }],
      [api.leadScoringStore.scoreCompany, { companyId: p.firma }],
      [api.leadScoringStore.scoreCompanies, { companyIds: [p.firma] }],
      [api.leadScoringStore.listIcpRules, {}],
      [api.leadScoringStore.missingDefaultIcpRules, {}],
    ];
  }
  function izmene(p: Podaci): Izmena[] {
    return [
      [api.leadFiltersStore.savePreset, { naziv: "Novi", query: "faza=nov" }],
      [api.leadFiltersStore.deletePreset, { presetId: p.preset }],
      [
        api.leadScoringStore.upsertIcpRule,
        { name: "Novo", axis: "fit", signalKind: "novo", weight: 1, isActive: true },
      ],
      [api.leadScoringStore.setIcpRuleActive, { ruleId: p.pravilo, isActive: false }],
      [api.leadScoringStore.deleteIcpRule, { ruleId: p.pravilo }],
      [api.leadScoringStore.seedDefaultIcpRules, {}],
      [api.leadScoringStore.addMissingDefaultIcpRules, {}],
    ];
  }

  test("član A ne čita i ne menja filtere i pravila B", async () => {
    const { s, b } = await svetSaPodacima();
    await upitiNadBOdbijeni(s, upiti(b));
    await izmeneNadBOdbijene(s, izmene(b));
    expect(await brojRedova(s, "leadFilterPresets", s.wsB)).toBe(1);
    expect(await brojRedova(s, "leadIcpRules", s.wsB)).toBe(1);
    const pravilo = await s.t.run(async (ctx) => ctx.db.get(b.pravilo));
    expect(pravilo?.isActive).toBe(true);
  });

  test("u A se vide samo preseti i pravila A; tuđ preset kroz A ostaje", async () => {
    const { s, a, b } = await svetSaPodacima();
    const preseti = await kao(s, s.ana).query(api.leadFiltersStore.listPresets, {
      workspaceId: s.wsA,
    });
    expect(preseti.map((p) => p._id)).toEqual([a.preset]);
    const pravila = await kao(s, s.viewer).query(api.leadScoringStore.listIcpRules, {
      workspaceId: s.wsA,
    });
    expect(pravila.map((p) => p._id)).toEqual([a.pravilo]);
    await odbijeno(
      kao(s, s.urednica).mutation(api.leadFiltersStore.deletePreset, {
        workspaceId: s.wsA,
        presetId: b.preset,
      }),
      "forbidden",
    );
    await expect(
      kao(s, s.urednica).query(api.leadScoringStore.scoreCompany, {
        workspaceId: s.wsA,
        companyId: b.firma,
      }),
    ).rejects.toThrow(/nije pronađena/);
    expect(await brojRedova(s, "leadFilterPresets", s.wsB)).toBe(1);
  });

  test("posmatrač čita, ali ne menja filtere ni pravila", async () => {
    const { s, a } = await svetSaPodacima();
    await posmatracNeMenja(s, izmene(a));
    expect(await brojRedova(s, "leadIcpRules", s.wsA)).toBe(1);
    expect(await brojRedova(s, "leadFilterPresets", s.wsA)).toBe(1);
  });
});

// ── niše, landing strane, ocene sajta ────────────────────────────────────────

describe("leadovi: niše, landing strane, ocene sajta", () => {
  function upiti(p: Podaci): Upit[] {
    return [
      [api.nichesStore.listNiches, {}],
      [api.leadLandingStore.listLandingsForCompany, { companyId: p.firma }],
      [api.leadLandingStore.landingStatus, { companyId: p.firma }],
      [api.leadSiteAuditsStore.listSiteAudits, { companyId: p.firma }],
    ];
  }
  function izmene(p: Podaci): Izmena[] {
    return [
      [api.nichesStore.upsertNiche, { naziv: "Nova niša" }],
      [api.nichesStore.updateNicheOpis, { nicheId: p.nisa, opis: "x" }],
      [api.nichesStore.upsertNichePlatform, { nicheId: p.nisa, platforma: "facebook" }],
      [api.nichesStore.deleteNichePlatform, { platformId: p.platforma }],
      [api.nichesStore.deleteNiche, { nicheId: p.nisa }],
      [api.leadLandingStore.createLanding, { companyId: p.firma, destinationUrl: "https://x.rs" }],
      [api.leadLandingStore.markLandingSent, { landingId: p.landing }],
      [api.leadLandingStore.archiveLanding, { landingId: p.landing }],
    ];
  }

  test("član A ne čita i ne menja niše i landing strane B", async () => {
    const { s, b } = await svetSaPodacima();
    await upitiNadBOdbijeni(s, upiti(b));
    await izmeneNadBOdbijene(s, izmene(b));
    expect(await brojRedova(s, "niches", s.wsB)).toBe(1);
    expect(await brojRedova(s, "leadLandings", s.wsB)).toBe(1);
    const stanje = await s.t.run(async (ctx) => ({
      opis: (await ctx.db.get(b.nisa))?.opis,
      platforma: (await ctx.db.get(b.platforma)) !== null,
      landing: (await ctx.db.get(b.landing))?.status,
    }));
    expect(stanje).toEqual({ opis: undefined, platforma: true, landing: "napravljena" });
  });

  test("u A se vide samo niše A; tuđa niša kroz A ostaje", async () => {
    const { s, a, b } = await svetSaPodacima();
    const nise = await kao(s, s.ana).query(api.nichesStore.listNiches, { workspaceId: s.wsA });
    expect(nise.map((n) => n._id)).toEqual([a.nisa]);
    await odbijeno(
      kao(s, s.urednica).mutation(api.nichesStore.deleteNiche, {
        workspaceId: s.wsA,
        nicheId: b.nisa,
      }),
      "forbidden",
    );
    expect(await brojRedova(s, "niches", s.wsB)).toBe(1);
  });

  test("posmatrač ne menja niše ni landing strane", async () => {
    const { s, a } = await svetSaPodacima();
    await posmatracNeMenja(s, izmene(a));
    expect(await brojRedova(s, "niches", s.wsA)).toBe(1);
    const landing = await s.t.run(async (ctx) => ctx.db.get(a.landing));
    expect(landing?.status).toBe("napravljena");
  });
});

// ── ingest tokeni (samo vlasnik) ─────────────────────────────────────────────

describe("ingest tokeni", () => {
  test("član A ne vidi i ne menja tokene B; urednik i posmatrač ne prolaze", async () => {
    const { s, a, b } = await svetSaPodacima();
    await upitiNadBOdbijeni(s, [[api.ingestTokensStore.listIngestTokens, {}]]);
    await izmeneNadBOdbijene(s, [
      [api.ingestTokensStore.createIngestToken, { naziv: "x" }],
      [api.ingestTokensStore.revokeIngestToken, { tokenId: b.token }],
    ]);

    for (const ko of [s.urednica, s.viewer]) {
      await odbijeno(
        kao(s, ko).query(api.ingestTokensStore.listIngestTokens, { workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
      await odbijeno(
        kao(s, ko).mutation(api.ingestTokensStore.createIngestToken, {
          workspaceId: s.wsA,
          naziv: "x",
        }),
        "forbidden",
        TREBA_VLASNIK,
      );
      await odbijeno(
        kao(s, ko).mutation(api.ingestTokensStore.revokeIngestToken, {
          workspaceId: s.wsA,
          tokenId: a.token,
        }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }

    const spisak = await kao(s, s.ana).query(api.ingestTokensStore.listIngestTokens, {
      workspaceId: s.wsA,
    });
    expect(spisak.map((t) => t._id)).toEqual([a.token]);
    // Tuđ token kroz sopstveni projekat se ne opoziva.
    await odbijeno(
      kao(s, s.ana).mutation(api.ingestTokensStore.revokeIngestToken, {
        workspaceId: s.wsA,
        tokenId: b.token,
      }),
      "forbidden",
    );
    const tokeni = await s.t.run(async (ctx) => ctx.db.query("ingestTokens").collect());
    expect(tokeni.every((t) => t.revokedAt === undefined)).toBe(true);
    expect(tokeni).toHaveLength(2);
  });
});

// ── novosti ──────────────────────────────────────────────────────────────────

describe("novosti", () => {
  function izmene(p: Podaci): Izmena[] {
    return [
      [api.postsStore.create, { kind: "note", category: "odluke", title: "Nova objava" }],
      [api.postsStore.updateDraft, { postId: p.objava, title: "Izmenjeno" }],
      [api.postsStore.saveRevision, { postId: p.objava, body: "Novi tekst." }],
      [api.postsStore.archive, { postId: p.objava }],
      [api.postsStore.publish, { postId: p.objava }],
      [api.postsStore.unpublish, { postId: p.objava }],
    ];
  }

  test("član A ne menja objave B; tuđa objava kroz A nije pronađena", async () => {
    const { s, b } = await svetSaPodacima();
    await izmeneNadBOdbijene(s, izmene(b));
    await expect(
      kao(s, s.urednica).mutation(api.postsStore.updateDraft, {
        workspaceId: s.wsA,
        postId: b.objava,
        title: "Izmenjeno",
      }),
    ).rejects.toThrow(/nije pronađen/);
    const objavaB = await s.t.run(async (ctx) => ctx.db.get(b.objava));
    expect([objavaB?.title, objavaB?.status]).toEqual(["Objava b", "draft"]);
    expect(await brojRedova(s, "posts", s.wsB)).toBe(1);
  });

  test("posmatrač ne piše; urednik piše samo u svoj projekat", async () => {
    const { s, a } = await svetSaPodacima();
    await posmatracNeMenja(s, izmene(a));
    expect(await brojRedova(s, "posts", s.wsA)).toBe(1);

    await kao(s, s.urednica).mutation(api.postsStore.create, {
      workspaceId: s.wsA,
      kind: "note",
      category: "odluke",
      title: "Nova objava",
    });
    expect(await brojRedova(s, "posts", s.wsA)).toBe(2);
    expect(await brojRedova(s, "posts", s.wsB)).toBe(1);
  });
});

// ── napredak (lični redovi po projektu) ──────────────────────────────────────

describe("napredak", () => {
  test("član A ne čita i ne menja napredak u B", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, [
      [api.napredak.stanje, {}],
      [api.napredak.profil, {}],
    ]);
    await izmeneNadBOdbijene(s, [
      [api.napredak.podesi, { ukljucen: false }],
      [api.napredak.potvrdi, { kljucevi: [] }],
      [api.napredak.zamrzniDan, {}],
    ]);
    const redovi = await s.t.run(async (ctx) => ctx.db.query("napredakPodesavanja").collect());
    expect(redovi).toEqual([]);
  });

  test("posmatrač podešava svoj napredak; podešavanje u A ne dira B", async () => {
    const s = await napraviSvet();
    await kao(s, s.viewer).mutation(api.napredak.podesi, {
      workspaceId: s.wsA,
      ukljucen: false,
    });

    // Jovan je član oba projekta: isključen napredak u A ostaje uključen u B.
    await kao(s, s.jovan).mutation(api.napredak.podesi, { workspaceId: s.wsA, ukljucen: false });
    const uA = await kao(s, s.jovan).query(api.napredak.stanje, { workspaceId: s.wsA });
    const uB = await kao(s, s.jovan).query(api.napredak.stanje, { workspaceId: s.wsB });
    expect(uA.ukljucen).toBe(false);
    expect(uB.ukljucen).toBe(true);

    const redovi = await s.t.run(async (ctx) => ctx.db.query("napredakPodesavanja").collect());
    expect(
      redovi.map((r) => [r.userId, r.workspaceId, r.ukljucen]).sort(),
    ).toEqual(
      [
        [s.viewer, s.wsA, false],
        [s.jovan, s.wsA, false],
      ].sort(),
    );
  });
});

// ── zvono „Šta me čeka" ──────────────────────────────────────────────────────

describe("zvono", () => {
  const KLJUC = "leadovi.zaostali";

  test("član A ne čita i ne sklanja stavke u B", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, [[api.notificationsStore.staMeCeka, {}]]);
    await izmeneNadBOdbijene(s, [
      [api.notificationsStore.odloziZadatak, { kljuc: KLJUC }],
      [api.notificationsStore.sakrijZadatak, { kljuc: KLJUC, broj: 3 }],
      [api.notificationsStore.vratiZadatak, { kljuc: KLJUC }],
    ]);
    const redovi = await s.t.run(async (ctx) => ctx.db.query("notificationState").collect());
    expect(redovi).toEqual([]);
  });

  test("odlaganje u A ne menja isti ključ u B (red po projektu)", async () => {
    const s = await napraviSvet();
    const jovan = kao(s, s.jovan);

    // U B je stavka odložena.
    const { odlozenoDo } = await jovan.mutation(api.notificationsStore.odloziZadatak, {
      workspaceId: s.wsB,
      kljuc: KLJUC,
    });
    // U A je isti ključ sakriven: to je NOV red, a odlaganje u B ostaje.
    await jovan.mutation(api.notificationsStore.sakrijZadatak, {
      workspaceId: s.wsA,
      kljuc: KLJUC,
      broj: 4,
    });

    const citaj = () =>
      s.t.run(async (ctx) => {
        const redovi = await ctx.db.query("notificationState").collect();
        return {
          A: redovi.filter((r) => r.workspaceId === s.wsA),
          B: redovi.filter((r) => r.workspaceId === s.wsB),
        };
      });
    let stanje = await citaj();
    expect(stanje.A).toHaveLength(1);
    expect(stanje.A[0]).toMatchObject({ userId: s.jovan, kljuc: KLJUC, brojPriSakrivanju: 4 });
    expect(stanje.B).toHaveLength(1);
    expect(stanje.B[0]).toMatchObject({ userId: s.jovan, kljuc: KLJUC, odlozenoDo });
    expect(stanje.B[0].sakrivenoAt).toBeUndefined();

    // „Vrati" u A briše samo red A.
    await jovan.mutation(api.notificationsStore.vratiZadatak, { workspaceId: s.wsA, kljuc: KLJUC });
    stanje = await citaj();
    expect(stanje.A).toHaveLength(0);
    expect(stanje.B).toHaveLength(1);

    // Zvono B se i dalje čita.
    const zvonoB = await jovan.query(api.notificationsStore.staMeCeka, { workspaceId: s.wsB });
    expect(zvonoB.ukupno).toBe(0);
  });

  test("posmatrač sklanja stavke u svom zvonu", async () => {
    const s = await napraviSvet();
    await kao(s, s.viewer).mutation(api.notificationsStore.odloziZadatak, {
      workspaceId: s.wsA,
      kljuc: KLJUC,
    });
    const redovi = await s.t.run(async (ctx) => ctx.db.query("notificationState").collect());
    expect(redovi.map((r) => [r.userId, r.workspaceId])).toEqual([[s.viewer, s.wsA]]);
  });
});
