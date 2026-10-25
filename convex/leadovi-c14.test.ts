/**
 * C14 — leadovi po projektu: šabloni ICP-a i niša, signal ciljne niše i mozak
 * projekta preko ingest tokena (PROJEKTI-PLAN §10, P15).
 *
 * Svet: A = „Enigma IT“ (bez šablona = „Web agencija“), B = „ScanMe“.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

async function firma(
  s: Svet,
  workspaceId: Id<"workspaces">,
  ime: string,
  nicheId?: Id<"niches">,
  signali: Array<"nema_sajt" | "visok_broj_recenzija" | "pitao_cenu"> = [],
): Promise<Id<"leadCompanies">> {
  return await s.t.run(async (ctx) => {
    const now = Date.now();
    const companyId = await ctx.db.insert("leadCompanies", {
      workspaceId,
      name: ime,
      nameNormalized: ime.toLowerCase(),
      origin: "import",
      createdAt: now,
      updatedAt: now,
      ...(nicheId ? { nicheId } : {}),
    });
    for (const kind of signali) {
      await ctx.db.insert("leadSignals", {
        workspaceId,
        companyId,
        kind,
        observedAt: now,
        source: "test",
      });
    }
    return companyId;
  });
}

async function nisaPoSlugu(s: Svet, workspaceId: Id<"workspaces">, slug: string) {
  return await s.t.run(async (ctx) =>
    ctx.db
      .query("niches")
      .withIndex("by_workspace_slug", (q) => q.eq("workspaceId", workspaceId).eq("slug", slug))
      .first(),
  );
}

describe("Enigma (bez šablona) boduje isto kao pre", () => {
  test("seed daje 20 pravila „Web agencija“, a ciljna niša ne menja ocenu", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    expect(await ana.query(api.leadScoringStore.sablonLeadova, { workspaceId: s.wsA })).toEqual({
      sablon: "web_agencija",
      imaPravila: false,
    });
    expect(
      (await ana.query(api.leadScoringStore.missingDefaultIcpRules, { workspaceId: s.wsA })).length,
    ).toBe(20);
    expect(await ana.mutation(api.leadScoringStore.seedDefaultIcpRules, { workspaceId: s.wsA })).toEqual({
      seeded: true,
      count: 20,
    });

    // Niša označena kao ciljna u Enigmi: nema pravila za nju, pa ništa.
    const nisaId = await ana.mutation(api.nichesStore.upsertNiche, {
      workspaceId: s.wsA,
      naziv: "Frizerski saloni",
      ciljna: true,
    });
    const id = await firma(s, s.wsA, "Salon Ana", nisaId, ["nema_sajt", "visok_broj_recenzija", "pitao_cenu"]);
    const ocena = await ana.query(api.leadScoringStore.scoreCompany, { workspaceId: s.wsA, companyId: id });
    expect(ocena.fit).toMatchObject({ points: 50, maxPoints: 260, signalsCounted: 2 });
    expect(ocena.intent).toMatchObject({ points: 40, maxPoints: 120, signalsCounted: 1 });
    expect(ocena.unmatchedSignalKinds).toEqual([]);
    expect(
      await ana.query(api.leadScoringStore.missingDefaultIcpRules, { workspaceId: s.wsA }),
    ).toEqual([]);
  });

  test("šablon se ne primenjuje preko postojećih pravila", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    await ana.mutation(api.leadScoringStore.seedDefaultIcpRules, { workspaceId: s.wsA });
    await odbijeno(
      ana.mutation(api.leadScoringStore.primeniSablon, { workspaceId: s.wsA, sablon: "qr_lokali" }),
      "conflict",
    );
    const pravila = await ana.query(api.leadScoringStore.listIcpRules, { workspaceId: s.wsA });
    expect(pravila).toHaveLength(20);
    expect(pravila.some((p) => p.signalKind === "ciljna_nisa")).toBe(false);
  });
});

describe("„QR za lokale“", () => {
  test("projekat dobija svoja pravila i niše, a Enigma ostaje netaknuta", async () => {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.leadScoringStore.seedDefaultIcpRules, { workspaceId: s.wsA });

    const boban = kao(s, s.boban);
    expect(
      await boban.mutation(api.leadScoringStore.primeniSablon, { workspaceId: s.wsB, sablon: "qr_lokali" }),
    ).toEqual({ dodatoPravila: 13, dodateNise: 7, oznaceneNise: 0 });

    const pravilaB = await boban.query(api.leadScoringStore.listIcpRules, { workspaceId: s.wsB });
    expect(pravilaB).toHaveLength(13);
    expect(pravilaB.find((p) => p.signalKind === "ciljna_nisa")?.weight).toBe(30);
    const niseB = await boban.query(api.nichesStore.listNiches, { workspaceId: s.wsB });
    expect(niseB).toHaveLength(7);
    expect(niseB.every((n) => n.ciljna === true)).toBe(true);
    expect(await boban.query(api.leadScoringStore.sablonLeadova, { workspaceId: s.wsB })).toEqual({
      sablon: "qr_lokali",
      imaPravila: true,
    });

    const ana = kao(s, s.ana);
    const pravilaA = await ana.query(api.leadScoringStore.listIcpRules, { workspaceId: s.wsA });
    expect(pravilaA).toHaveLength(20);
    expect(await ana.query(api.nichesStore.listNiches, { workspaceId: s.wsA })).toHaveLength(0);
  });

  test("lokal iz ciljne niše se boduje više od firme iz neciljne", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    await boban.mutation(api.leadScoringStore.primeniSablon, { workspaceId: s.wsB, sablon: "qr_lokali" });
    const kafici = await nisaPoSlugu(s, s.wsB, "kafici");
    const advokati = await boban.mutation(api.nichesStore.upsertNiche, {
      workspaceId: s.wsB,
      naziv: "Advokati",
    });

    const lokal = await firma(s, s.wsB, "Kafić Kod Mike", kafici!._id, ["visok_broj_recenzija"]);
    const kancelarija = await firma(s, s.wsB, "Advokat Perić", advokati, ["visok_broj_recenzija"]);
    const bezNise = await firma(s, s.wsB, "Bez niše", undefined, ["visok_broj_recenzija"]);

    const a = await boban.query(api.leadScoringStore.scoreCompany, { workspaceId: s.wsB, companyId: lokal });
    const b = await boban.query(api.leadScoringStore.scoreCompany, { workspaceId: s.wsB, companyId: kancelarija });
    expect(a.fit.points).toBe(55);
    expect(b.fit.points).toBe(25);
    expect(a.fit.contributions.map((c) => c.signalKind)).toContain("ciljna_nisa");

    const grupno = await boban.query(api.leadScoringStore.scoreCompanies, {
      workspaceId: s.wsB,
      companyIds: [lokal, kancelarija, bezNise],
    });
    expect(grupno[lokal].fit.points).toBe(55);
    expect(grupno[kancelarija].fit.points).toBe(25);
    expect(grupno[bezNise].fit.points).toBe(25);

    // Oznaka niše važi odmah, bez ponovnog uvoza.
    await boban.mutation(api.nichesStore.upsertNiche, {
      workspaceId: s.wsB,
      nicheId: advokati,
      naziv: "Advokati",
      ciljna: true,
    });
    const posle = await boban.query(api.leadScoringStore.scoreCompany, {
      workspaceId: s.wsB,
      companyId: kancelarija,
    });
    expect(posle.fit.points).toBe(55);
  });

  test("postojeća niša dobija oznaku samo ako je čovek nije već odlučio", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    const restorani = await boban.mutation(api.nichesStore.upsertNiche, {
      workspaceId: s.wsB,
      naziv: "Restorani u centru",
      slug: "restorani",
    });
    await boban.mutation(api.nichesStore.upsertNiche, {
      workspaceId: s.wsB,
      naziv: "Hoteli",
      slug: "hoteli",
      ciljna: false,
    });
    const r = await boban.mutation(api.leadScoringStore.primeniSablon, {
      workspaceId: s.wsB,
      sablon: "qr_lokali",
    });
    expect(r).toEqual({ dodatoPravila: 13, dodateNise: 5, oznaceneNise: 1 });
    const n = await s.t.run(async (ctx) => ctx.db.get(restorani));
    expect(n).toMatchObject({ naziv: "Restorani u centru", ciljna: true, trebaZakazivanje: false });
    expect((await nisaPoSlugu(s, s.wsB, "hoteli"))?.ciljna).toBe(false);
  });

  test("tuđ projekat i posmatrač ne primenjuju šablon", async () => {
    const s = await napraviSvet();
    await odbijeno(
      kao(s, s.ana).mutation(api.leadScoringStore.primeniSablon, { workspaceId: s.wsB, sablon: "qr_lokali" }),
      "forbidden",
    );
    await odbijeno(
      kao(s, s.viewer).mutation(api.leadScoringStore.primeniSablon, { workspaceId: s.wsA, sablon: "qr_lokali" }),
      "forbidden",
    );
    expect(await kao(s, s.boban).query(api.leadScoringStore.listIcpRules, { workspaceId: s.wsB })).toEqual([]);
  });
});

describe("novi projekat", () => {
  test("kreće kao „Prazno“: seed ne upisuje ništa dok se šablon ne izabere", async () => {
    const s = await napraviSvet();
    const jovan = kao(s, s.jovan);
    const { workspaceId } = await jovan.mutation(api.projekti.kreirajProjekat, {
      ime: "Pekara Đorđević",
      slug: "pekara-djordjevic",
    });
    expect(await jovan.query(api.leadScoringStore.sablonLeadova, { workspaceId })).toEqual({
      sablon: "prazno",
      imaPravila: false,
    });
    expect(await jovan.query(api.leadScoringStore.missingDefaultIcpRules, { workspaceId })).toEqual([]);
    expect(await jovan.mutation(api.leadScoringStore.seedDefaultIcpRules, { workspaceId })).toEqual({
      seeded: false,
      count: 0,
    });

    await jovan.mutation(api.leadScoringStore.primeniSablon, { workspaceId, sablon: "web_agencija" });
    const pravila = await jovan.query(api.leadScoringStore.listIcpRules, { workspaceId });
    expect(pravila).toHaveLength(20);
    expect((await jovan.query(api.nichesStore.listNiches, { workspaceId })).map((n) => n.slug).sort()).toEqual(
      ["butici", "frizerski-saloni", "kozmeticki-saloni", "turisticke-agencije"],
    );

    // Dopuna radi sa šablonom projekta: obrisano pravilo je jedino koje fali.
    const ciljno = pravila.find((p) => p.signalKind === "nema_sajt")!;
    await jovan.mutation(api.leadScoringStore.deleteIcpRule, { workspaceId, ruleId: ciljno._id });
    expect(
      (await jovan.query(api.leadScoringStore.missingDefaultIcpRules, { workspaceId })).map((m) => m.signalKind),
    ).toEqual(["nema_sajt"]);
  });

  test("dopuna u QR projektu nudi QR pravila, ne Enigmina", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    await boban.mutation(api.leadScoringStore.primeniSablon, { workspaceId: s.wsB, sablon: "qr_lokali" });
    const pravila = await boban.query(api.leadScoringStore.listIcpRules, { workspaceId: s.wsB });
    await boban.mutation(api.leadScoringStore.deleteIcpRule, {
      workspaceId: s.wsB,
      ruleId: pravila.find((p) => p.signalKind === "ciljna_nisa")!._id,
    });
    expect(
      await boban.mutation(api.leadScoringStore.addMissingDefaultIcpRules, { workspaceId: s.wsB }),
    ).toEqual({ added: 1, addedNames: ["Lokal iz ciljne niše"] });
  });
});

describe("mozak projekta preko ingest tokena", () => {
  async function svetSaMozgom() {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.podesavanjaStore.sacuvajMozak, {
      workspaceId: s.wsA,
      ponuda: "Sajtovi za male firme",
      ton: "Direktno, bez žargona",
    });
    await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajMozak, {
      workspaceId: s.wsB,
      ponuda: "QR meni za lokale",
      icpOpis: "Kafići i restorani",
    });
    const { token: tokenA } = await kao(s, s.ana).mutation(api.ingestTokensStore.createIngestToken, {
      workspaceId: s.wsA,
      naziv: "laptop",
    });
    const { token: tokenB } = await kao(s, s.boban).mutation(api.ingestTokensStore.createIngestToken, {
      workspaceId: s.wsB,
      naziv: "laptop",
    });
    return { s, tokenA, tokenB };
  }

  const citaj = (s: Svet, token?: string) =>
    s.t.fetch("/projekti/mozak", {
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  test("token vraća samo polja mozga svog projekta", async () => {
    const { s, tokenA, tokenB } = await svetSaMozgom();

    const a = await citaj(s, tokenA);
    expect(a.status).toBe(200);
    expect(await a.json()).toEqual({
      ponuda: "Sajtovi za male firme",
      icpOpis: null,
      ton: "Direktno, bez žargona",
      zabrane: null,
      skripte: null,
    });

    const b = await citaj(s, tokenB);
    const teloB = (await b.json()) as Record<string, unknown>;
    expect(Object.keys(teloB).sort()).toEqual(["icpOpis", "ponuda", "skripte", "ton", "zabrane"]);
    expect(teloB.ponuda).toBe("QR meni za lokale");
    // Tuđim tokenom se ne vidi mozak drugog projekta.
    expect(JSON.stringify(teloB)).not.toContain("Sajtovi za male firme");
  });

  test("bez tokena, sa lažnim ili opozvanim tokenom: 401 bez sadržaja", async () => {
    const { s, tokenA } = await svetSaMozgom();
    for (const odgovor of [await citaj(s), await citaj(s, "lazan-token")]) {
      expect(odgovor.status).toBe(401);
      expect(JSON.stringify(await odgovor.json())).not.toContain("Sajtovi");
    }

    const ana = kao(s, s.ana);
    const tokeni = await ana.query(api.ingestTokensStore.listIngestTokens, { workspaceId: s.wsA });
    await ana.mutation(api.ingestTokensStore.revokeIngestToken, {
      workspaceId: s.wsA,
      tokenId: tokeni[0]._id,
    });
    const opozvan = await citaj(s, tokenA);
    expect(opozvan.status).toBe(401);
    expect(JSON.stringify(await opozvan.json())).not.toContain("Sajtovi");
  });
});
