/**
 * C17 — unakrsni leadovi (PROJEKTI-PLAN §10, P13): `leadUnakrsnoStore`
 * pokazuje da firma iz jednog internog projekta već postoji ili odgovara
 * drugom internom projektu istog korisnika, i kopira je kao NOVU firmu
 * (bez CRM stanja). Klijentski projekti ne učestvuju ni kao izvor ni kao cilj.
 *
 * Svet: A = „Enigma IT“ (slug enigma-it), B = „ScanMe“, K = klijentski.
 * Jovan je owner u A i B.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

type PoljaFirme = Partial<
  Omit<Doc<"leadCompanies">, "_id" | "_creationTime" | "workspaceId" | "name" | "nameNormalized">
>;

async function firma(
  s: Svet,
  workspaceId: Id<"workspaces">,
  ime: string,
  polja: PoljaFirme = {},
): Promise<Id<"leadCompanies">> {
  return await s.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("leadCompanies", {
      workspaceId,
      name: ime,
      nameNormalized: ime.toLowerCase(),
      origin: "import",
      createdAt: now,
      updatedAt: now,
      ...polja,
    });
  });
}

async function identitet(
  s: Svet,
  workspaceId: Id<"workspaces">,
  companyId: Id<"leadCompanies">,
  kind: "phone" | "email",
  value: string,
  valueNormalized: string,
  dodatno: { personId?: Id<"leadPeople">; createdBy?: Id<"users"> } = {},
): Promise<Id<"leadIdentities">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("leadIdentities", {
      workspaceId,
      companyId,
      kind,
      value,
      valueNormalized,
      lawfulBasis: "legitimni_interes",
      sourceUrl: "https://izvor.test/kontakt",
      createdAt: Date.now(),
      ...dodatno,
    }),
  );
}

async function nisa(
  s: Svet,
  workspaceId: Id<"workspaces">,
  slug: string,
  naziv: string,
  ciljna?: boolean,
): Promise<Id<"niches">> {
  return await s.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("niches", {
      workspaceId,
      slug,
      naziv,
      createdAt: now,
      updatedAt: now,
      ...(ciljna === undefined ? {} : { ciljna }),
    });
  });
}

async function clan(
  s: Svet,
  workspaceId: Id<"workspaces">,
  userId: Id<"users">,
  role: "owner" | "urednik" | "client_viewer",
): Promise<void> {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("members", { workspaceId, userId, role });
  });
}

async function noviKorisnik(s: Svet, email: string): Promise<Id<"users">> {
  return await s.t.run(async (ctx) => ctx.db.insert("users", { email }));
}

async function firmeProjekta(s: Svet, workspaceId: Id<"workspaces">) {
  return await s.t.run(async (ctx) =>
    ctx.db
      .query("leadCompanies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
  );
}

type Tabela =
  | "leadCompanies"
  | "leadPeople"
  | "leadIdentities"
  | "leadFieldProvenance"
  | "leadAssignments"
  | "leadStageEvents"
  | "leadSignals"
  | "niches";

/** Redovi tabele jednog projekta (test baza je mala, pa bez indeksa: nemaju ga sve tabele). */
async function redovi<T extends Tabela>(s: Svet, tabela: T, workspaceId: Id<"workspaces">) {
  const svi = await s.t.run(async (ctx) => ctx.db.query(tabela).collect());
  return svi.filter((r) => r.workspaceId === workspaceId);
}

const kaoJovan = (s: Svet) => kao(s, s.jovan);

function drugi(s: Svet, ws: Id<"workspaces">, companyId: Id<"leadCompanies">) {
  return kaoJovan(s).query(api.leadUnakrsnoStore.uDrugimProjektima, { workspaceId: ws, companyId });
}

function kopiraj(
  s: Svet,
  user: Id<"users">,
  ws: Id<"workspaces">,
  companyId: Id<"leadCompanies">,
  ciljWorkspaceId: Id<"workspaces">,
) {
  return kao(s, user).mutation(api.leadUnakrsnoStore.kopirajUProjekat, {
    workspaceId: ws,
    companyId,
    ciljWorkspaceId,
  });
}

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;

describe("uDrugimProjektima: šta znači „postoji“", () => {
  test("isti domen: postoji u ScanMe, ali se ne kopira", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "salon-lepote.rs" });
    const uB = await firma(s, s.wsB, "Potpuno drugo ime", { domainNormalized: "salon-lepote.rs" });
    await firma(s, s.wsB, "Neka treća firma", { domainNormalized: "nesto-drugo.rs" });

    expect(await drugi(s, s.wsA, f)).toEqual([
      {
        workspaceId: s.wsB,
        slug: "scanme",
        ime: "ScanMe",
        stanje: "postoji",
        companyId: uB,
        poklapanje: ["domen"],
        nisa: null,
        mozeKopirati: false,
      },
    ]);
  });

  test("isti telefon preko identiteta (posle normalizacije)", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote");
    await identitet(s, s.wsA, f, "phone", "064 123 4567", "+381641234567");
    const uB = await firma(s, s.wsB, "Studio Sjaj");
    await identitet(s, s.wsB, uB, "phone", "0641234567", "+381641234567");
    // Isti broj u DRUGOM projektu A ne sme da se računa (samo cilj B).
    const druga = await firma(s, s.wsA, "Neko treći");
    await identitet(s, s.wsA, druga, "phone", "0641234567", "+381641234567");

    const rez = await drugi(s, s.wsA, f);
    expect(rez).toHaveLength(1);
    expect(rez[0]).toMatchObject({
      workspaceId: s.wsB,
      stanje: "postoji",
      companyId: uB,
      poklapanje: ["telefon"],
      mozeKopirati: false,
    });
  });

  test("isto ime + grad; isto ime u drugom gradu se ne računa", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Pekara Sunce", { city: "Beograd" });
    const uB = await firma(s, s.wsB, "Pekara Sunce", { city: "Beograd" });
    expect(await drugi(s, s.wsA, f)).toMatchObject([
      { workspaceId: s.wsB, stanje: "postoji", companyId: uB, poklapanje: ["ime_grad"] },
    ]);

    const s2 = await napraviSvet();
    const f2 = await firma(s2, s2.wsA, "Pekara Sunce", { city: "Beograd" });
    await firma(s2, s2.wsB, "Pekara Sunce", { city: "Niš" });
    await firma(s2, s2.wsB, "Pekara Sunce"); // bez grada
    expect(await drugi(s2, s2.wsA, f2)).toEqual([]);
  });

  test("više ključeva odjednom daje više oznaka, a companyId je prvi pogodak", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs", city: "Niš" });
    await identitet(s, s.wsA, f, "phone", "0641234567", "+381641234567");
    const uB = await firma(s, s.wsB, "Salon Lepote", { domainNormalized: "lepota.rs", city: "Niš" });
    await identitet(s, s.wsB, uB, "phone", "0641234567", "+381641234567");

    const rez = await drugi(s, s.wsA, f);
    expect(rez).toHaveLength(1);
    expect(rez[0]!.poklapanje).toEqual(["domen", "telefon", "ime_grad"]);
    expect(rez[0]!.companyId).toBe(uB);
  });

  test("posle kopiranja A→B: iz A „postoji“ sa „kopija“, a iz B se vidi A", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote"); // bez domena, telefona i grada
    const { companyId: kopija } = await kopiraj(s, s.jovan, s.wsA, f, s.wsB);

    expect(await drugi(s, s.wsA, f)).toEqual([
      {
        workspaceId: s.wsB,
        slug: "scanme",
        ime: "ScanMe",
        stanje: "postoji",
        companyId: kopija,
        poklapanje: ["kopija"],
        nisa: null,
        mozeKopirati: false,
      },
    ]);
    expect(await drugi(s, s.wsB, kopija)).toEqual([
      {
        workspaceId: s.wsA,
        slug: "enigma-it",
        ime: "Enigma IT",
        stanje: "postoji",
        companyId: f,
        poklapanje: ["kopija"],
        nisa: null,
        mozeKopirati: false,
      },
    ]);

    // Ponovno kopiranje iste firme je sukob, ne druga kopija.
    await odbijeno(kopiraj(s, s.jovan, s.wsA, f, s.wsB), "conflict", /već postoji u ScanMe/);
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(1);
  });

  test("kopija nosi i ostale ključeve: domen, telefon i ime+grad stoje uz „kopija“", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs", city: "Niš" });
    await identitet(s, s.wsA, f, "phone", "0641234567", "+381641234567");
    const { companyId: kopija } = await kopiraj(s, s.jovan, s.wsA, f, s.wsB);

    const rez = await drugi(s, s.wsA, f);
    expect(rez).toHaveLength(1);
    expect(rez[0]!.poklapanje).toEqual(["domen", "telefon", "ime_grad", "kopija"]);
    expect(rez[0]!.companyId).toBe(kopija);
  });

  test("firma bez ikakvog poklapanja i bez ciljne niše se ne pominje", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs", city: "Niš" });
    await firma(s, s.wsB, "Autoservis Brzi", { domainNormalized: "brzi.rs", city: "Niš" });
    expect(await drugi(s, s.wsA, f)).toEqual([]);
  });
});

describe("uDrugimProjektima: „odgovara“ po ciljnoj niši", () => {
  test("ista niša (slug) koja je ciljna u ScanMe: odgovara i može da se kopira", async () => {
    const s = await napraviSvet();
    const nisaA = await nisa(s, s.wsA, "restorani", "Restorani");
    await nisa(s, s.wsB, "restorani", "Restorani i kafei", true);
    const f = await firma(s, s.wsA, "Restoran Kod Mike", { nicheId: nisaA });

    expect(await drugi(s, s.wsA, f)).toEqual([
      {
        workspaceId: s.wsB,
        slug: "scanme",
        ime: "ScanMe",
        stanje: "odgovara",
        companyId: null,
        poklapanje: ["nisa"],
        nisa: "Restorani i kafei",
        mozeKopirati: true,
      },
    ]);
  });

  test("niša u cilju nije ciljna (false ili bez polja) ili je drugi slug: ScanMe se ne pominje", async () => {
    const s = await napraviSvet();
    const nisaA = await nisa(s, s.wsA, "restorani", "Restorani");
    const nisaB = await nisa(s, s.wsB, "restorani", "Restorani", false);
    await nisa(s, s.wsB, "pekare", "Pekare", true); // ciljna, ali drugi slug
    const f = await firma(s, s.wsA, "Restoran Kod Mike", { nicheId: nisaA });

    expect(await drugi(s, s.wsA, f)).toEqual([]);

    await s.t.run(async (ctx) => ctx.db.patch(nisaB, { ciljna: undefined }));
    expect(await drugi(s, s.wsA, f)).toEqual([]);

    await s.t.run(async (ctx) => ctx.db.patch(nisaB, { ciljna: true }));
    expect(await drugi(s, s.wsA, f)).toMatchObject([{ stanje: "odgovara" }]);
  });

  test("firma bez niše ne odgovara nijednom projektu", async () => {
    const s = await napraviSvet();
    await nisa(s, s.wsB, "restorani", "Restorani", true);
    const f = await firma(s, s.wsA, "Restoran Kod Mike");
    expect(await drugi(s, s.wsA, f)).toEqual([]);
  });

  test("ako firma već postoji u cilju, stanje je „postoji“ (ne „odgovara“)", async () => {
    const s = await napraviSvet();
    const nisaA = await nisa(s, s.wsA, "restorani", "Restorani");
    await nisa(s, s.wsB, "restorani", "Restorani", true);
    const f = await firma(s, s.wsA, "Restoran Kod Mike", {
      nicheId: nisaA,
      domainNormalized: "kodmike.rs",
    });
    const uB = await firma(s, s.wsB, "Restoran Mika", { domainNormalized: "kodmike.rs" });

    expect(await drugi(s, s.wsA, f)).toMatchObject([
      { stanje: "postoji", companyId: uB, poklapanje: ["domen"], nisa: null, mozeKopirati: false },
    ]);
  });

  test("niša sa slugom iz DRUGOG projekta se ne uzima kao niša firme", async () => {
    const s = await napraviSvet();
    // Firma iz A pokazuje na nišu koja pripada B: ne sme da bude „restorani“ iz A.
    const tudjaNisa = await nisa(s, s.wsB, "restorani", "Restorani", true);
    const f = await firma(s, s.wsA, "Restoran Kod Mike", { nicheId: tudjaNisa });
    expect(await drugi(s, s.wsA, f)).toEqual([]);
  });
});

describe("granice pristupa u uDrugimProjektima", () => {
  test("projekat u kome pozivalac nije član se ne pominje", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs" });
    await firma(s, s.wsB, "Salon Lepote", { domainNormalized: "lepota.rs" });

    // Ana je owner samo u A: B za nju ne postoji.
    expect(
      await kao(s, s.ana).query(api.leadUnakrsnoStore.uDrugimProjektima, {
        workspaceId: s.wsA,
        companyId: f,
      }),
    ).toEqual([]);
    // Jovan je u oba: vidi B.
    expect(await drugi(s, s.wsA, f)).toHaveLength(1);
  });

  test("klijentski projekat nikad ne učestvuje (ni kao izvor ni kao cilj)", async () => {
    const s = await napraviSvet();
    await clan(s, s.wsK, s.jovan, "owner");
    const polja = { domainNormalized: "lepota.rs", city: "Niš" };
    const f = await firma(s, s.wsA, "Salon Lepote", polja);
    const uK = await firma(s, s.wsK, "Salon Lepote", polja);
    await nisa(s, s.wsK, "saloni", "Saloni", true);

    // Iz A: K se ne pominje iako ima isti domen i ime+grad.
    expect(await drugi(s, s.wsA, f)).toEqual([]);
    // Iz K: ništa, ni A ni B.
    await firma(s, s.wsA, "Salon Lepote 2", polja);
    expect(await drugi(s, s.wsK, uK)).toEqual([]);
  });

  test("arhiviran interni projekat se ne pominje i ne prima kopiju", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs" });
    await firma(s, s.wsB, "Salon Lepote", { domainNormalized: "lepota.rs" });
    await s.t.run(async (ctx) => ctx.db.patch(s.wsB, { arhiviran: true }));

    expect(await drugi(s, s.wsA, f)).toEqual([]);
    await odbijeno(kopiraj(s, s.jovan, s.wsA, f, s.wsB), "forbidden", /samo između internih/);
  });

  test("tuđa firma preko A: not_found (i za upit i za kopiranje)", async () => {
    const s = await napraviSvet();
    const uB = await firma(s, s.wsB, "Firma iz ScanMe");
    const brojPre = (await firmeProjekta(s, s.wsB)).length;

    await odbijeno(drugi(s, s.wsA, uB), "not_found");
    await odbijeno(kopiraj(s, s.jovan, s.wsA, uB, s.wsB), "not_found");
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(brojPre);
    expect(await firmeProjekta(s, s.wsA)).toHaveLength(0);
  });

  test("stranac i neprijavljen su odbijeni, nečlan cilja dobija isti odgovor kao za tuđ projekat", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote");

    await odbijeno(
      s.t.query(api.leadUnakrsnoStore.uDrugimProjektima, { workspaceId: s.wsA, companyId: f }),
      "unauthorized",
    );
    await odbijeno(
      s.t.mutation(api.leadUnakrsnoStore.kopirajUProjekat, {
        workspaceId: s.wsA,
        companyId: f,
        ciljWorkspaceId: s.wsB,
      }),
      "unauthorized",
    );
    await odbijeno(
      kao(s, s.stranac).query(api.leadUnakrsnoStore.uDrugimProjektima, {
        workspaceId: s.wsA,
        companyId: f,
      }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(kopiraj(s, s.stranac, s.wsA, f, s.wsB), "forbidden", NEMA_PRISTUP);
    // Ana je owner u A, ali nije član ScanMe-a.
    await odbijeno(kopiraj(s, s.ana, s.wsA, f, s.wsB), "forbidden", NEMA_PRISTUP);
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(0);
  });
});

describe("kopirajUProjekat: ko sme i kuda", () => {
  test("kopija ne ide u klijentski projekat", async () => {
    const s = await napraviSvet();
    await clan(s, s.wsK, s.jovan, "owner");
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs" });

    await odbijeno(kopiraj(s, s.jovan, s.wsA, f, s.wsK), "forbidden", /samo između internih/);
    expect(await firmeProjekta(s, s.wsK)).toHaveLength(0);
    expect(await redovi(s, "leadPeople", s.wsK)).toHaveLength(0);
    expect(await redovi(s, "leadFieldProvenance", s.wsK)).toHaveLength(0);
  });

  test("kopija ne ide ni IZ klijentskog projekta", async () => {
    const s = await napraviSvet();
    await clan(s, s.wsK, s.jovan, "owner");
    const uK = await firma(s, s.wsK, "Firma klijenta", { domainNormalized: "klijent.rs" });
    const pre = await firmeProjekta(s, s.wsA);

    await odbijeno(kopiraj(s, s.jovan, s.wsK, uK, s.wsA), "forbidden", /samo između internih/);
    expect(await firmeProjekta(s, s.wsA)).toEqual(pre);
    expect(await redovi(s, "leadFieldProvenance", s.wsA)).toHaveLength(0);
  });

  test("kopiranje u isti projekat je odbijeno", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote");
    await odbijeno(kopiraj(s, s.jovan, s.wsA, f, s.wsA), "forbidden", /samo između internih/);
    expect(await firmeProjekta(s, s.wsA)).toHaveLength(1);
  });

  test("posmatrač u izvoru ili cilju ne kopira, a upit kaže mozeKopirati: false", async () => {
    const s = await napraviSvet();
    const nisaA = await nisa(s, s.wsA, "restorani", "Restorani");
    await nisa(s, s.wsB, "restorani", "Restorani", true);
    const f = await firma(s, s.wsA, "Restoran Kod Mike", { nicheId: nisaA });

    // Urednik u A, posmatrač u B.
    const uA = await noviKorisnik(s, "mix@enigma.test");
    await clan(s, s.wsA, uA, "urednik");
    await clan(s, s.wsB, uA, "client_viewer");
    // Posmatrač u A, urednik u B.
    const obrnuto = await noviKorisnik(s, "obrnuto@enigma.test");
    await clan(s, s.wsA, obrnuto, "client_viewer");
    await clan(s, s.wsB, obrnuto, "urednik");

    for (const korisnik of [uA, obrnuto]) {
      const rez = await kao(s, korisnik).query(api.leadUnakrsnoStore.uDrugimProjektima, {
        workspaceId: s.wsA,
        companyId: f,
      });
      expect(rez).toMatchObject([{ workspaceId: s.wsB, stanje: "odgovara", mozeKopirati: false }]);
    }

    await odbijeno(kopiraj(s, uA, s.wsA, f, s.wsB), "forbidden", /urednik ili vlasnik/);
    await odbijeno(kopiraj(s, obrnuto, s.wsA, f, s.wsB), "forbidden", /urednik ili vlasnik/);
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(0);

    // Urednik u oba projekta sme.
    await clan(s, s.wsB, s.urednica, "urednik");
    const rez = await kao(s, s.urednica).query(api.leadUnakrsnoStore.uDrugimProjektima, {
      workspaceId: s.wsA,
      companyId: f,
    });
    expect(rez).toMatchObject([{ stanje: "odgovara", mozeKopirati: true }]);
    await kopiraj(s, s.urednica, s.wsA, f, s.wsB);
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(1);
  });

  test("firma koja već postoji u cilju: conflict", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs" });
    await firma(s, s.wsB, "Salon Lepote B", { domainNormalized: "lepota.rs" });

    await odbijeno(kopiraj(s, s.jovan, s.wsA, f, s.wsB), "conflict", /već postoji u ScanMe/);
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(1);
  });

  test("lista zabrane CILJA blokira kopiju (pib, domen, telefon, email)", async () => {
    const slucajevi: Array<{
      naziv: string;
      polja: PoljaFirme;
      identitet?: { kind: "phone" | "email"; value: string; norm: string };
      zabrana: { matchOn: "pib" | "domain" | "phone" | "email"; value: string };
    }> = [
      {
        naziv: "pib",
        polja: { pib: "109876543" },
        zabrana: { matchOn: "pib", value: "109876543" },
      },
      {
        naziv: "domen",
        polja: { domainNormalized: "salon-lepote.rs" },
        zabrana: { matchOn: "domain", value: "salon-lepote.rs" },
      },
      {
        naziv: "telefon",
        polja: {},
        identitet: { kind: "phone", value: "064/123-4567", norm: "+381641234567" },
        zabrana: { matchOn: "phone", value: "+381641234567" },
      },
      {
        naziv: "email",
        polja: {},
        identitet: { kind: "email", value: "Info@Salon.rs", norm: "info@salon.rs" },
        zabrana: { matchOn: "email", value: "info@salon.rs" },
      },
    ];

    for (const slucaj of slucajevi) {
      const s = await napraviSvet();
      const f = await firma(s, s.wsA, `Salon ${slucaj.naziv}`, slucaj.polja);
      if (slucaj.identitet) {
        await identitet(s, s.wsA, f, slucaj.identitet.kind, slucaj.identitet.value, slucaj.identitet.norm);
      }
      await s.t.run(async (ctx) =>
        ctx.db.insert("leadSuppression", {
          workspaceId: s.wsB,
          kind: "interno",
          matchOn: slucaj.zabrana.matchOn,
          value: slucaj.zabrana.value,
          addedAt: Date.now(),
        }),
      );

      await odbijeno(kopiraj(s, s.jovan, s.wsA, f, s.wsB), "forbidden", /listi zabrane/);
      expect(await firmeProjekta(s, s.wsB), slucaj.naziv).toHaveLength(0);
      expect(await redovi(s, "leadIdentities", s.wsB), slucaj.naziv).toHaveLength(0);
      expect(await redovi(s, "leadFieldProvenance", s.wsB), slucaj.naziv).toHaveLength(0);
    }
  });

  test("zabrana u IZVORU (A) ne blokira kopiju: važi lista cilja", async () => {
    const s = await napraviSvet();
    const f = await firma(s, s.wsA, "Salon Lepote", { domainNormalized: "lepota.rs" });
    await s.t.run(async (ctx) =>
      ctx.db.insert("leadSuppression", {
        workspaceId: s.wsA,
        kind: "interno",
        matchOn: "domain",
        value: "lepota.rs",
        addedAt: Date.now(),
      }),
    );
    await kopiraj(s, s.jovan, s.wsA, f, s.wsB);
    expect(await firmeProjekta(s, s.wsB)).toHaveLength(1);
  });
});

describe("kopirajUProjekat: šta se kopira, a šta ne", () => {
  test("podaci, osobe, kontakti i poreklo se kopiraju; CRM stanje ne", async () => {
    const s = await napraviSvet();
    const nisaA = await nisa(s, s.wsA, "frizeri", "Frizeri");
    const f = await firma(s, s.wsA, "Frizerski salon Mina", {
      pib: "109876543",
      website: "https://www.mina.rs",
      domainNormalized: "mina.rs",
      street: "Bulevar 1",
      city: "Novi Sad",
      companyWallUrl: "https://www.companywall.rs/firma/mina",
      lat: 45.25,
      lng: 19.83,
      koordinateIzvor: "nominatim",
      imaSajt: "da",
      sajtStatus: "radi",
      sajtHttps: true,
      nicheId: nisaA,
      createdBy: s.ana,
      temperatura: "hot",
      temperaturaPromenjenaAt: Date.now() - 1000,
    });

    // Osoba, kontakt osobe (sa createdBy = ručna dopuna) i kontakt firme.
    const osobaA = await s.t.run(async (ctx) =>
      ctx.db.insert("leadPeople", {
        workspaceId: s.wsA,
        companyId: f,
        name: "Mina Ilić",
        role: "vlasnik",
        roleConfidence: "potvrdjeno",
        createdAt: Date.now(),
      }),
    );
    const telA = await identitet(s, s.wsA, f, "phone", "064/123-4567", "+381641234567", {
      personId: osobaA,
      createdBy: s.ana,
    });
    const mejlA = await identitet(s, s.wsA, f, "email", "info@mina.rs", "info@mina.rs", {
      createdBy: s.ana,
    });

    // Poreklo u A: po jedan red za firmu, osobu i telefon.
    const posmatrano = Date.now() - 5000;
    await s.t.run(async (ctx) => {
      const red = (entityTable: "leadCompanies" | "leadPeople" | "leadIdentities", entityId: string, fieldName: string, value: string) =>
        ctx.db.insert("leadFieldProvenance", {
          workspaceId: s.wsA,
          entityTable,
          entityId,
          fieldName,
          value,
          source: "companywall",
          sourceUrl: "https://www.companywall.rs/firma/mina",
          confidence: "tacno",
          humanConfirmed: false,
          observedAt: posmatrano,
        });
      await red("leadCompanies", f, "name", "Frizerski salon Mina");
      await red("leadPeople", osobaA, "role", "vlasnik");
      await red("leadIdentities", telA, "phone", "064/123-4567");
    });

    // CRM stanje u A.
    await s.t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("leadAssignments", {
        workspaceId: s.wsA,
        companyId: f,
        ownerUserId: s.ana,
        stage: "u_radu",
        createdAt: now,
      });
      await ctx.db.insert("leadStageEvents", {
        workspaceId: s.wsA,
        companyId: f,
        kind: "dodela",
        toValue: "ana",
        actorUserId: s.ana,
        occurredAt: now,
      });
      await ctx.db.insert("leadSignals", {
        workspaceId: s.wsA,
        companyId: f,
        kind: "nema_sajt",
        observedAt: now,
        source: "test",
      });
    });

    const pre = Date.now();
    const rez = await kopiraj(s, s.jovan, s.wsA, f, s.wsB);
    expect(rez.slug).toBe("scanme");

    // Firma.
    const firmeB = await firmeProjekta(s, s.wsB);
    expect(firmeB).toHaveLength(1);
    const kopija = firmeB[0]!;
    expect(kopija._id).toBe(rez.companyId);
    expect(kopija).toMatchObject({
      workspaceId: s.wsB,
      name: "Frizerski salon Mina",
      nameNormalized: "frizerski salon mina",
      pib: "109876543",
      website: "https://www.mina.rs",
      domainNormalized: "mina.rs",
      street: "Bulevar 1",
      city: "Novi Sad",
      companyWallUrl: "https://www.companywall.rs/firma/mina",
      lat: 45.25,
      lng: 19.83,
      koordinateIzvor: "nominatim",
      imaSajt: "da",
      sajtStatus: "radi",
      sajtHttps: true,
      origin: "import",
      firstSeenSource: "kopija_iz_projekta",
      createdBy: s.jovan,
    });
    expect(kopija.kopijaIz).toEqual({
      workspaceId: s.wsA,
      companyId: f,
      userId: s.jovan,
      at: expect.any(Number),
    });
    expect(kopija.kopijaIz!.at).toBeGreaterThanOrEqual(pre);
    // CRM stanje se ne prenosi.
    expect(kopija.temperatura).toBeUndefined();
    expect(kopija.temperaturaPromenjenaAt).toBeUndefined();

    // Osobe.
    const osobeB = await redovi(s, "leadPeople", s.wsB);
    expect(osobeB).toHaveLength(1);
    expect(osobeB[0]).toMatchObject({
      workspaceId: s.wsB,
      companyId: kopija._id,
      name: "Mina Ilić",
      role: "vlasnik",
      roleConfidence: "potvrdjeno",
    });
    expect(osobeB[0]!._id).not.toBe(osobaA);

    // Kontakti: osnov i izvor ostaju, personId se preslikava, createdBy se ne upisuje.
    const identitetiB = await redovi(s, "leadIdentities", s.wsB);
    expect(identitetiB).toHaveLength(2);
    const telB = identitetiB.find((i) => i.kind === "phone")!;
    const mejlB = identitetiB.find((i) => i.kind === "email")!;
    expect(telB).toMatchObject({
      workspaceId: s.wsB,
      companyId: kopija._id,
      personId: osobeB[0]!._id,
      value: "064/123-4567",
      valueNormalized: "+381641234567",
      lawfulBasis: "legitimni_interes",
      sourceUrl: "https://izvor.test/kontakt",
    });
    expect(mejlB).toMatchObject({
      workspaceId: s.wsB,
      companyId: kopija._id,
      value: "info@mina.rs",
      lawfulBasis: "legitimni_interes",
      sourceUrl: "https://izvor.test/kontakt",
    });
    expect(mejlB.personId).toBeUndefined();
    for (const i of identitetiB) {
      expect("createdBy" in i, "kopija nije ručna dopuna").toBe(false);
    }

    // Poreklo: preslikani ID-jevi + red „kopija“.
    const poreklo = await redovi(s, "leadFieldProvenance", s.wsB);
    expect(poreklo).toHaveLength(4);
    const po = (tabela: string, id: string) =>
      poreklo.find((p) => p.entityTable === tabela && p.entityId === String(id));
    expect(po("leadCompanies", kopija._id)).toMatchObject({
      workspaceId: s.wsB,
      fieldName: "name",
      value: "Frizerski salon Mina",
      source: "companywall",
      sourceUrl: "https://www.companywall.rs/firma/mina",
      confidence: "tacno",
      humanConfirmed: false,
      observedAt: posmatrano,
    });
    expect(po("leadPeople", osobeB[0]!._id)).toMatchObject({ fieldName: "role", value: "vlasnik" });
    expect(po("leadIdentities", telB._id)).toMatchObject({ fieldName: "phone", value: "064/123-4567" });
    expect(
      poreklo.find((p) => p.entityTable === "leadCompanies" && p.fieldName === "kopija"),
    ).toMatchObject({
      workspaceId: s.wsB,
      entityId: String(kopija._id),
      value: "enigma-it",
      source: "kopija_iz_projekta",
      confidence: "tacno",
      humanConfirmed: true,
    });

    // CRM stanje iz A se ne prenosi (faza „u_radu", vlasnik ana, signal). Kopija
    // je nova firma u B, pa dobija SVOJE zaduženje (ULTRA-PLAN §4, tačka 4):
    // faza „nov", zadužen onaj ko je kopirao, i samo događaj „dodela".
    const dodeleB = await redovi(s, "leadAssignments", s.wsB);
    expect(dodeleB).toHaveLength(1);
    expect(dodeleB[0]).toMatchObject({
      companyId: kopija._id,
      ownerUserId: s.jovan,
      stage: "nov",
    });
    expect(dodeleB[0]!.lastTouchAt).toBeUndefined();
    expect(dodeleB[0]!.nextActionAt).toBeUndefined();
    expect(dodeleB[0]!.outcome).toBeUndefined();
    const dogadjajiB = await redovi(s, "leadStageEvents", s.wsB);
    expect(dogadjajiB).toHaveLength(1);
    expect(dogadjajiB[0]).toMatchObject({ kind: "dodela", toValue: String(s.jovan) });
    expect(await redovi(s, "leadSignals", s.wsB)).toHaveLength(0);

    // Izvor u A je netaknut.
    const izvor = await s.t.run(async (ctx) => ctx.db.get(f));
    expect(izvor).toMatchObject({ temperatura: "hot", name: "Frizerski salon Mina" });
    expect(izvor!.kopijaIz).toBeUndefined();
    expect(await redovi(s, "leadAssignments", s.wsA)).toHaveLength(1);
    expect(await redovi(s, "leadStageEvents", s.wsA)).toHaveLength(1);
    expect(await redovi(s, "leadSignals", s.wsA)).toHaveLength(1);
    expect(await redovi(s, "leadPeople", s.wsA)).toHaveLength(1);
    const identitetiA = await redovi(s, "leadIdentities", s.wsA);
    expect(identitetiA.map((i) => i._id).sort()).toEqual([mejlA, telA].sort());
    expect(identitetiA.every((i) => i.createdBy === s.ana)).toBe(true);
    expect(await redovi(s, "leadFieldProvenance", s.wsA)).toHaveLength(3);
  });

  test("niša kopije je niša cilja sa istim slugom, ili je nema", async () => {
    const s = await napraviSvet();
    const frizeriA = await nisa(s, s.wsA, "frizeri", "Frizeri");
    const pekareA = await nisa(s, s.wsA, "pekare", "Pekare");
    const frizeriB = await nisa(s, s.wsB, "frizeri", "Frizerski saloni"); // nije ciljna: ne smeta
    const f1 = await firma(s, s.wsA, "Salon Mina", { nicheId: frizeriA });
    const f2 = await firma(s, s.wsA, "Pekara Sunce", { nicheId: pekareA });
    const f3 = await firma(s, s.wsA, "Firma bez niše");

    const k1 = await kopiraj(s, s.jovan, s.wsA, f1, s.wsB);
    const k2 = await kopiraj(s, s.jovan, s.wsA, f2, s.wsB);
    const k3 = await kopiraj(s, s.jovan, s.wsA, f3, s.wsB);

    const dohvati = (id: Id<"leadCompanies">) => s.t.run(async (ctx) => ctx.db.get(id));
    expect((await dohvati(k1.companyId))!.nicheId).toBe(frizeriB);
    expect((await dohvati(k2.companyId))!.nicheId).toBeUndefined();
    expect((await dohvati(k3.companyId))!.nicheId).toBeUndefined();
    // Niša se u cilju ne pravi usput.
    expect(await redovi(s, "niches", s.wsB)).toHaveLength(1);
  });
});
