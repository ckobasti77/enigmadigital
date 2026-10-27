/// <reference types="vite/client" />
/**
 * T02 (ULTRA-PLAN §4): osam ispravki podataka u petlji Leadova, po jedan test.
 *
 *   1. beleška ne menja `lastTouchAt` (ni red poziva);
 *   2. ishod `trazeno_da_se_ne_zove` uvek nudi zabranu (bez upisa);
 *   3. upit sa sajta (i poruka sa mreže) pravi zaduženje;
 *   4. naknadno zaduženje je u serijama i idempotentno;
 *   5. zatvorena faza nije zaostala i nema korak;
 *   6. `zavrsiKorak` briše korak;
 *   7. današnji korak se vidi pre roka;
 *   8. „Zovi sada" preskače firmu sa dogovorenim korakom.
 *
 * Svet iz `projekatTest.pomoc.ts`: A = „Enigma IT" (owner ana pa jovan,
 * urednica, viewer), B = „ScanMe" (owner boban, jovan).
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ZOVI_SADA_FILTER } from "./lib/leadKorak";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;

async function firma(
  s: Svet,
  ws: Id<"workspaces">,
  name: string,
  createdBy?: Id<"users">,
): Promise<Id<"leadCompanies">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("leadCompanies", {
      workspaceId: ws,
      name,
      nameNormalized: name.toLowerCase(),
      origin: "import",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...(createdBy ? { createdBy } : {}),
    }),
  );
}

async function dodela(
  s: Svet,
  ws: Id<"workspaces">,
  companyId: Id<"leadCompanies">,
  polja: {
    stage?: "nov" | "u_radu" | "dobijen" | "izgubljen" | "odlozen";
    nextActionAt?: number;
    nextActionNote?: string;
    lastTouchAt?: number;
  } = {},
): Promise<Id<"leadAssignments">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("leadAssignments", {
      workspaceId: ws,
      companyId,
      ownerUserId: s.ana,
      stage: polja.stage ?? "nov",
      ...(polja.nextActionAt !== undefined ? { nextActionAt: polja.nextActionAt } : {}),
      ...(polja.nextActionNote !== undefined ? { nextActionNote: polja.nextActionNote } : {}),
      ...(polja.lastTouchAt !== undefined ? { lastTouchAt: polja.lastTouchAt } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function zaduzenje(s: Svet, companyId: Id<"leadCompanies">) {
  return await s.t.run(async (ctx) =>
    (await ctx.db.query("leadAssignments").collect()).filter((a) => a.companyId === companyId),
  );
}

async function dogadjaji(s: Svet, companyId: Id<"leadCompanies">) {
  return await s.t.run(async (ctx) =>
    (await ctx.db.query("leadStageEvents").collect()).filter((e) => e.companyId === companyId),
  );
}

/** Telefon sa procenom „čiji je broj" (uslov reda „Zovi sada"). */
async function telefon(s: Svet, ws: Id<"workspaces">, companyId: Id<"leadCompanies">) {
  await s.t.run(async (ctx) =>
    ctx.db.insert("leadIdentities", {
      workspaceId: ws,
      companyId,
      kind: "phone",
      value: "+381641234567",
      valueNormalized: "+381641234567",
      lawfulBasis: "javni izvor",
      sourceUrl: "https://primer.rs",
      verovatnoca: 80,
    }),
  );
}

const ucitajFirme = (items: Array<{ company: { _id: string } | null }>) =>
  items.map((i) => i.company?._id);

afterEach(() => {
  vi.useRealTimers();
});

describe("T02 — ispravke podataka u Leadovima", () => {
  test("1. beleška ne menja lastTouchAt i ne izbacuje firmu iz reda poziva", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Beleška");
    await telefon(s, s.wsA, f);
    await dodela(s, s.wsA, f);
    // Firma bez zaduženja: beleška ga pravi, ali bez „poslednjeg kontakta".
    const bez = await firma(s, s.wsA, "Salon Bez Zaduženja");

    await kao(s, s.urednica).mutation(api.leadCrmStore.logTouch, {
      workspaceId: s.wsA,
      companyId: f,
      channel: "beleska",
      note: "Vlasnica radi do 18h.",
    });
    await kao(s, s.urednica).mutation(api.leadCrmStore.logTouch, {
      workspaceId: s.wsA,
      companyId: bez,
      channel: "beleska",
      note: "Proveriti sajt.",
    });

    const [a] = await zaduzenje(s, f);
    expect(a.lastTouchAt).toBeUndefined();
    const [b] = await zaduzenje(s, bez);
    expect(b.lastTouchAt).toBeUndefined();

    // Beleška ostaje u istoriji.
    const istorija = await dogadjaji(s, f);
    expect(istorija).toEqual([
      expect.objectContaining({ kind: "dodir", toValue: "beleska", note: "Vlasnica radi do 18h." }),
    ]);

    // Firma je i dalje „nikad dodirnuta", pa ostaje u redu „Zovi sada".
    const red = await kao(s, s.urednica).query(api.leadFiltersStore.listLeadsFiltered, {
      workspaceId: s.wsA,
      ...ZOVI_SADA_FILTER,
    });
    expect(ucitajFirme(red.items)).toContain(f);
    // Ni kolona „Poslednji dodir" ne prikazuje belešku kao kontakt.
    expect(red.items.find((i) => i.company?._id === f)?.poslednjiDodir).toBeUndefined();

    // Pravi kontakt i dalje pomera „poslednji kontakt".
    await kao(s, s.urednica).mutation(api.leadCrmStore.logTouch, {
      workspaceId: s.wsA,
      companyId: f,
      channel: "poziv",
      touchedAt: 1_760_000_000_000,
    });
    expect((await zaduzenje(s, f))[0].lastTouchAt).toBe(1_760_000_000_000);
  });

  test("2. ishod „Tražio da ga ne zovemo“ uvek nudi zabranu, a ne upisuje je", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Ne Zovi");
    await dodela(s, s.wsA, f);

    const res = await kao(s, s.urednica).mutation(api.leadCrmStore.recordOutcome, {
      workspaceId: s.wsA,
      companyId: f,
      outcome: "trazeno_da_se_ne_zove",
      note: "Rekao da ne zovemo više.",
    });
    expect(res).toMatchObject({
      predlogZaSuppression: true,
      razlog: "trazio_da_ga_ne_zovemo",
      // Predlog nije pogađanje po rečima: zahtev je sam ishod.
      predlogPoTekstu: false,
    });

    // Bez potvrde čoveka nema zabrane.
    const zabrane = await s.t.run(async (ctx) => ctx.db.query("leadSuppression").collect());
    expect(zabrane).toHaveLength(0);

    // Potvrda upisuje zabranu sa vrstom iz predloga.
    await kao(s, s.urednica).mutation(api.leadCrmStore.addToSuppressionFromOutcome, {
      workspaceId: s.wsA,
      companyId: f,
      kind: res.razlog,
    });
    const posle = await s.t.run(async (ctx) => ctx.db.query("leadSuppression").collect());
    expect(posle).toEqual([
      expect.objectContaining({ kind: "trazio_da_ga_ne_zovemo", matchOn: "companyId", value: String(f) }),
    ]);

    // Ishod bez odbijanja ne nudi zabranu.
    const zainteresovan = await kao(s, s.urednica).mutation(api.leadCrmStore.recordOutcome, {
      workspaceId: s.wsA,
      companyId: f,
      outcome: "zainteresovan",
    });
    expect(zainteresovan.predlogZaSuppression).toBe(false);
  });

  test("3. upit sa sajta i poruka sa mreže prave zaduženje, pa se firma vidi u Tabeli", async () => {
    const s = await napraviSvet();
    const upit = await s.t.run(async (ctx) =>
      ctx.db.insert("leadInbound", {
        workspaceId: s.wsA,
        platform: "website",
        kind: "forma",
        externalId: "forma-t02-0001",
        occurredAt: Date.now(),
        status: "nov",
        derivedSignals: [],
        createdAt: Date.now(),
        kontakt: { ime: "Mira Mirić", email: "mira@salon.rs", firma: "Salon Mira" },
      }),
    );
    const poruka = await s.t.run(async (ctx) =>
      ctx.db.insert("leadInbound", {
        workspaceId: s.wsA,
        platform: "instagram",
        kind: "dm",
        externalId: "ig-t02-0001",
        occurredAt: Date.now(),
        status: "nov",
        derivedSignals: [],
        createdAt: Date.now(),
      }),
    );

    const { companyId: izUpita } = await kao(s, s.urednica).mutation(
      api.leadInboundStore.napraviFirmuIzUpita,
      { workspaceId: s.wsA, inboundId: upit },
    );
    const { companyId: izPoruke } = await kao(s, s.urednica).mutation(
      api.leadInboundStore.linkInboundToCompany,
      {
        workspaceId: s.wsA,
        inboundId: poruka,
        newCompanyName: "Salon Insta",
        identityValue: "@salon.insta",
        lawfulBasis: "legitimni_interes",
        sourceUrl: "https://instagram.com/salon.insta",
      },
    );

    for (const companyId of [izUpita, izPoruke]) {
      const dodele = await zaduzenje(s, companyId);
      expect(dodele).toHaveLength(1);
      // Zadužen je član koji je firmu napravio, faza je „nov".
      expect(dodele[0]).toMatchObject({ ownerUserId: s.urednica, stage: "nov" });
      expect(await dogadjaji(s, companyId)).toContainEqual(
        expect.objectContaining({ kind: "dodela", toValue: String(s.urednica) }),
      );
    }

    const tabela = await kao(s, s.urednica).query(api.leadFiltersStore.listLeadsFiltered, {
      workspaceId: s.wsA,
    });
    expect(ucitajFirme(tabela.items)).toEqual(expect.arrayContaining([izUpita, izPoruke]));
  });

  test("4. naknadno zaduženje radi u serijama i idempotentno je", async () => {
    vi.useFakeTimers();
    const s = await napraviSvet();
    const odUrednice = await firma(s, s.wsA, "Od urednice", s.urednica);
    const odStranca = await firma(s, s.wsA, "Od bivšeg člana", s.stranac);
    const odPosmatraca = await firma(s, s.wsA, "Od posmatrača", s.viewer);
    const bezAutora = await firma(s, s.wsA, "Iz skilla");
    const uB = await firma(s, s.wsB, "ScanMe firma");
    const vecIma = await firma(s, s.wsA, "Već zadužena");
    await dodela(s, s.wsA, vecIma);

    // Probno: samo broji.
    const probno = await s.t.mutation(internal.leadZaduzenja.dodeliBezZaduzenja, {
      probno: true,
    });
    expect(probno).toMatchObject({ probno: true, gotovo: true });
    expect(probno.ukupno).toMatchObject({ pregledano: 6, dodeljeno: 5, vecImaju: 1 });
    expect(await s.t.run(async (ctx) => ctx.db.query("leadAssignments").collect())).toHaveLength(1);

    // Prava dodela u serijama od 2 (tri serije, nastavak zakazuje sama).
    const prva = await s.t.mutation(internal.leadZaduzenja.dodeliBezZaduzenja, { velicina: 2 });
    expect(prva.gotovo).toBe(false);
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);

    const vlasnik = async (companyId: Id<"leadCompanies">) => (await zaduzenje(s, companyId))[0]?.ownerUserId;
    expect(await vlasnik(odUrednice)).toBe(s.urednica);
    // Bez člana koji ju je napravio (bivši član, posmatrač, skill) → vlasnik projekta.
    expect(await vlasnik(odStranca)).toBe(s.ana);
    expect(await vlasnik(odPosmatraca)).toBe(s.ana);
    expect(await vlasnik(bezAutora)).toBe(s.ana);
    expect(await vlasnik(uB)).toBe(s.boban);
    expect(await zaduzenje(s, vecIma)).toHaveLength(1);

    const preDrugog = await s.t.run(async (ctx) => ({
      dodele: (await ctx.db.query("leadAssignments").collect()).length,
      dogadjaji: (await ctx.db.query("leadStageEvents").collect()).length,
    }));
    expect(preDrugog).toEqual({ dodele: 6, dogadjaji: 5 });

    // Drugo puštanje ne menja ništa.
    const drugo = await s.t.mutation(internal.leadZaduzenja.dodeliBezZaduzenja, {});
    expect(drugo.ukupno).toMatchObject({ pregledano: 6, dodeljeno: 0, vecImaju: 6 });
    const posleDrugog = await s.t.run(async (ctx) => ({
      dodele: (await ctx.db.query("leadAssignments").collect()).length,
      dogadjaji: (await ctx.db.query("leadStageEvents").collect()).length,
    }));
    expect(posleDrugog).toEqual(preDrugog);
  });

  test("5. zatvorena faza nije zaostala i nema korak", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const f = await firma(s, s.wsA, "Salon Dobijen");
    await dodela(s, s.wsA, f, { stage: "u_radu", nextActionAt: sada - DAN, nextActionNote: "Poslati ponudu" });
    // Stari zapis: zatvoren pre nego što je `setStage` brisao korak.
    const stari = await firma(s, s.wsA, "Salon Izgubljen Ranije");
    await dodela(s, s.wsA, stari, { stage: "izgubljen", nextActionAt: sada - 2 * DAN });

    const pre = await kao(s, s.urednica).query(api.leadCrmStore.listOverdue, { workspaceId: s.wsA });
    expect(ucitajFirme(pre.items)).toEqual([f]);

    await kao(s, s.urednica).mutation(api.leadCrmStore.setStage, {
      workspaceId: s.wsA,
      companyId: f,
      stage: "dobijen",
      note: "Potpisan ugovor.",
    });

    const [a] = await zaduzenje(s, f);
    expect(a.stage).toBe("dobijen");
    expect(a.nextActionAt).toBeUndefined();
    expect(a.nextActionNote).toBeUndefined();
    const skinut = (await dogadjaji(s, f)).find((e) => e.kind === "sledeci_korak");
    expect(skinut).toMatchObject({ korakZatvoren: "posao_zatvoren", note: "Poslati ponudu" });
    // Bez `toValue`: korak je skinut, a Napredak takav događaj ne broji.
    expect(skinut?.toValue).toBeUndefined();

    const posle = await kao(s, s.urednica).query(api.leadCrmStore.listOverdue, { workspaceId: s.wsA });
    expect(posle.items).toHaveLength(0);
    // Isto pravilo i za filter „zaostali" i brojač fasete.
    const filter = await kao(s, s.urednica).query(api.leadFiltersStore.listLeadsFiltered, {
      workspaceId: s.wsA,
      zaostali: true,
    });
    expect(filter.items).toHaveLength(0);
    const faseta = await kao(s, s.urednica).query(api.leadFiltersStore.countLeadsByFacet, {
      workspaceId: s.wsA,
    });
    expect(faseta.zaostali).toBe(0);
  });

  test("6. zavrsiKorak briše korak i upisuje ga u istoriju", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const f = await firma(s, s.wsA, "Salon Urađeno");
    await dodela(s, s.wsA, f, { stage: "u_radu", nextActionAt: sada - 3 * SAT, nextActionNote: "Javiti cenu" });

    const res = await kao(s, s.urednica).mutation(api.leadCrmStore.zavrsiKorak, {
      workspaceId: s.wsA,
      companyId: f,
    });
    expect(res).toEqual({ success: true, changed: true });

    const [a] = await zaduzenje(s, f);
    expect(a.nextActionAt).toBeUndefined();
    expect(a.nextActionNote).toBeUndefined();
    // Faza se ne menja: urađen korak nije zatvoren posao.
    expect(a.stage).toBe("u_radu");
    expect(await dogadjaji(s, f)).toContainEqual(
      expect.objectContaining({
        kind: "sledeci_korak",
        korakZatvoren: "uradjen",
        note: "Javiti cenu",
        actorUserId: s.urednica,
      }),
    );

    // Firma izlazi iz Zaostalih i iz „Vrati se na".
    const zaostali = await kao(s, s.urednica).query(api.leadCrmStore.listOverdue, { workspaceId: s.wsA });
    expect(zaostali.items).toHaveLength(0);
    const danas = await kao(s, s.urednica).query(api.leadCrmStore.listKoraciDanas, {
      workspaceId: s.wsA,
      krajDana: sada + 2 * SAT,
    });
    expect(danas.items).toHaveLength(0);

    // Drugi klik nema šta da zatvori.
    const opet = await kao(s, s.urednica).mutation(api.leadCrmStore.zavrsiKorak, {
      workspaceId: s.wsA,
      companyId: f,
    });
    expect(opet.changed).toBe(false);
    expect((await dogadjaji(s, f)).filter((e) => e.kind === "sledeci_korak")).toHaveLength(1);
  });

  test("7. današnji korak se vidi pre roka, zakasneli nose „kasni“", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const kasniFirma = await firma(s, s.wsA, "Kasni");
    const danasFirma = await firma(s, s.wsA, "Danas");
    const sutraFirma = await firma(s, s.wsA, "Sutra");
    const bezKoraka = await firma(s, s.wsA, "Bez koraka");
    await dodela(s, s.wsA, danasFirma, { stage: "u_radu", nextActionAt: sada + SAT });
    await dodela(s, s.wsA, kasniFirma, { stage: "u_radu", nextActionAt: sada - DAN });
    await dodela(s, s.wsA, sutraFirma, { stage: "u_radu", nextActionAt: sada + 30 * SAT });
    await dodela(s, s.wsA, bezKoraka);

    const danas = await kao(s, s.urednica).query(api.leadCrmStore.listKoraciDanas, {
      workspaceId: s.wsA,
      krajDana: sada + 2 * SAT,
    });
    // Po roku: zakasneli pa današnji; sutrašnji i firma bez koraka ne.
    expect(ucitajFirme(danas.items)).toEqual([kasniFirma, danasFirma]);
    expect(danas.items.map((i) => i.kasni)).toEqual([true, false]);
    expect(danas.zakasnelih).toBe(1);

    // Zaostali ostaju samo zakasneli.
    const zaostali = await kao(s, s.urednica).query(api.leadCrmStore.listOverdue, { workspaceId: s.wsA });
    expect(ucitajFirme(zaostali.items)).toEqual([kasniFirma]);
  });

  test("8. „Zovi sada“ preskače firmu sa dogovorenim korakom", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const slobodna = await firma(s, s.wsA, "Slobodna");
    const buduci = await firma(s, s.wsA, "Dogovoreno sutra");
    const zakasneli = await firma(s, s.wsA, "Dogovoreno juče");
    for (const f of [slobodna, buduci, zakasneli]) await telefon(s, s.wsA, f);
    await dodela(s, s.wsA, slobodna);
    await dodela(s, s.wsA, buduci, { nextActionAt: sada + DAN });
    await dodela(s, s.wsA, zakasneli, { nextActionAt: sada - DAN });

    const red = await kao(s, s.urednica).query(api.leadFiltersStore.listLeadsFiltered, {
      workspaceId: s.wsA,
      ...ZOVI_SADA_FILTER,
    });
    expect(ucitajFirme(red.items)).toEqual([slobodna]);
    expect(red.ukupno).toBe(1);

    // Bez novog filtera bi sve tri stajale u redu (dokaz da test meri pravu stvar).
    const stari = await kao(s, s.urednica).query(api.leadFiltersStore.listLeadsFiltered, {
      workspaceId: s.wsA,
      tel: 40,
      dodir: ["nikad"],
    });
    expect(stari.ukupno).toBe(3);
  });
});
