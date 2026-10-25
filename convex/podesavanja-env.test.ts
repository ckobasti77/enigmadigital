/// <reference types="vite/client" />
/**
 * Podešavanja projekta i env (`convex/lib/podesavanja.ts`, `podesavanjaStore.ts`):
 * pravilo je „vrednost projekta → env SAMO za osnivački projekat → nije
 * podešeno“. Osnivački projekat je najstariji red u `workspaces` (u svetu za
 * testove to je „Enigma IT“). Drugi projekat nikad ne sme da dobije Enigmin
 * piksel, domene, kratke linkove, budžet ni ime pošiljaoca.
 */
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const ENV = {
  META_PIXEL_ID: "1111111111111",
  OR_SHORT_LINK_BASE_URL: "https://enigma.example/",
  NOVOSTI_REVALIDATE_URL: "https://www.enigma.example/api/revalidate",
  TRACKED_DOMAINS: "Enigma.Example, WWW.panel.enigma.example",
  BUDGET_MIN: "10",
  BUDGET_MAX: "900",
  BUDGET_LIMIT_CURRENCY: "rsd",
  META_ADS_MAX_DAILY_BUDGET: "50",
  GOOGLE_ADS_MAX_DAILY_BUDGET: "40",
  EMAIL_FROM: "Enigma Tim <tim@enigma.example>",
  META_CAPI_TEST_EVENT_CODE: "TEST1",
};

/** Sve što `izEnva()` i `adresaPanela` čitaju, a test ga ne postavlja. */
const NEPOSTAVLJENO = [
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "SITE_URL",
  "HUB_HOSTS",
  "BUDGET_MIN_EUR",
  "BUDGET_MAX_EUR",
];

function postaviEnv(izmene: Record<string, string | undefined> = {}) {
  for (const [k, v] of Object.entries({ ...ENV, ...izmene })) vi.stubEnv(k, v);
  for (const k of NEPOSTAVLJENO) {
    if (!(k in izmene)) vi.stubEnv(k, undefined);
  }
}

beforeEach(() => {
  postaviEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const nema = { vrednost: null, izvor: "nije_podeseno" } as const;

const zaAkciju = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.query(internal.podesavanjaStore.zaAkciju, { workspaceId });

const projekat = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.run(async (ctx) => await ctx.db.get(workspaceId));

async function dodajDomen(s: Svet, workspaceId: Id<"workspaces">, host: string) {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("projekatDomeni", { host, workspaceId, createdAt: 1 });
  });
}

describe("osnivački projekat nasleđuje env", () => {
  test("Enigma IT (najstariji projekat) dobija svaku env vrednost sa izvorom „env“", async () => {
    const s = await napraviSvet();
    expect(await zaAkciju(s, s.wsA)).toEqual({
      jeOsnivacki: true,
      // Mala slova, bez „www.“.
      sajtovi: { vrednost: ["enigma.example", "panel.enigma.example"], izvor: "env" },
      pikselId: { vrednost: "1111111111111", izvor: "env" },
      // Završna kosa crta iz env-a se skida.
      kratkiLinkoviBaza: { vrednost: "https://enigma.example", izvor: "env" },
      novostiRevalidateUrl: {
        vrednost: "https://www.enigma.example/api/revalidate",
        izvor: "env",
      },
      // Puls nema env: uvek „nije podešeno“ dok ga projekat sam ne upiše.
      pulsUrl: nema,
      posiljalacIme: { vrednost: "Enigma Tim", izvor: "env" },
      capiTestKod: "TEST1",
      budzet: {
        minimum: { vrednost: 10, izvor: "env" },
        maksimum: { vrednost: 900, izvor: "env" },
        valuta: { vrednost: "RSD", izvor: "env" },
        metaMaksDnevno: { vrednost: 50, izvor: "env" },
        googleMaksDnevno: { vrednost: 40, izvor: "env" },
      },
    });
  });

  test("lanac za kratke linkove: OR_SHORT_LINK_BASE_URL pa NEXT_PUBLIC_APP_URL pa APP_URL pa SITE_URL", async () => {
    const s = await napraviSvet();
    const baza = async () => (await zaAkciju(s, s.wsA)).kratkiLinkoviBaza.vrednost;

    postaviEnv({ OR_SHORT_LINK_BASE_URL: undefined, NEXT_PUBLIC_APP_URL: "https://app.example//" });
    expect(await baza()).toBe("https://app.example");

    postaviEnv({ OR_SHORT_LINK_BASE_URL: undefined, APP_URL: "https://app2.example" });
    expect(await baza()).toBe("https://app2.example");

    postaviEnv({ OR_SHORT_LINK_BASE_URL: undefined, SITE_URL: "https://site.example" });
    expect(await baza()).toBe("https://site.example");

    postaviEnv({ OR_SHORT_LINK_BASE_URL: undefined });
    expect(await baza()).toBeNull();
  });

  test("neispravne env granice budžeta se ignorišu, BUDGET_*_EUR je rezerva", async () => {
    const s = await napraviSvet();

    postaviEnv({ BUDGET_MIN: "abc", BUDGET_MAX: "-3", META_ADS_MAX_DAILY_BUDGET: "0" });
    const b = (await zaAkciju(s, s.wsA)).budzet;
    expect(b.minimum).toEqual(nema);
    expect(b.maksimum).toEqual(nema);
    expect(b.metaMaksDnevno).toEqual(nema);

    postaviEnv({ BUDGET_MIN: undefined, BUDGET_MAX: undefined, BUDGET_MIN_EUR: "7", BUDGET_MAX_EUR: "700" });
    const e = (await zaAkciju(s, s.wsA)).budzet;
    expect(e.minimum).toEqual({ vrednost: 7, izvor: "env" });
    expect(e.maksimum).toEqual({ vrednost: 700, izvor: "env" });
  });
});

describe("drugi projekat nikad ne dobija Enigmine vrednosti", () => {
  test("ScanMe i klijentski projekat: sve „nije podešeno“, bez ijedne env vrednosti", async () => {
    const s = await napraviSvet();
    for (const ws of [s.wsB, s.wsK]) {
      const odgovor = await zaAkciju(s, ws);
      expect(odgovor).toEqual({
        jeOsnivacki: false,
        sajtovi: nema,
        pikselId: nema,
        kratkiLinkoviBaza: nema,
        novostiRevalidateUrl: nema,
        pulsUrl: nema,
        posiljalacIme: nema,
        capiTestKod: null,
        budzet: {
          minimum: nema,
          maksimum: nema,
          valuta: nema,
          metaMaksDnevno: nema,
          googleMaksDnevno: nema,
        },
      });
      const tekst = JSON.stringify(odgovor);
      for (const vrednost of [
        "1111111111111",
        "enigma.example",
        "TEST1",
        "Enigma Tim",
        "tim@",
        "RSD",
        "900",
      ]) {
        expect(tekst).not.toContain(vrednost);
      }
    }
  });

  test("vlasnik koji čita ScanMe ne vidi env, a ni Enigma ne izlaže kod testnog događaja", async () => {
    const s = await napraviSvet();
    const jovan = kao(s, s.jovan);
    const b = await jovan.query(api.podesavanjaStore.procitaj, { workspaceId: s.wsB });
    expect(b.jeOsnivacki).toBe(false);
    expect(b.podesavanja.pikselId).toEqual(nema);
    expect(b.podesavanja.sajtovi).toEqual(nema);
    const tekstB = JSON.stringify(b);
    for (const vrednost of ["1111111111111", "enigma.example", "Enigma Tim", "RSD"]) {
      expect(tekstB).not.toContain(vrednost);
    }

    // Kod testnog događaja (E7) se ne prikazuje ni vlasniku osnivačkog projekta.
    const a = await jovan.query(api.podesavanjaStore.procitaj, { workspaceId: s.wsA });
    expect(a.podesavanja.pikselId).toEqual({ vrednost: "1111111111111", izvor: "env" });
    expect(JSON.stringify(a)).not.toContain("TEST1");
    expect(a.podesavanja).not.toHaveProperty("capiTestKod");
  });

  test("procitaj vraća jeOsnivacki: true samo za najstariji projekat", async () => {
    const s = await napraviSvet();
    const jovan = kao(s, s.jovan);
    expect((await jovan.query(api.podesavanjaStore.procitaj, { workspaceId: s.wsA })).jeOsnivacki).toBe(true);
    expect((await jovan.query(api.podesavanjaStore.procitaj, { workspaceId: s.wsB })).jeOsnivacki).toBe(false);
  });
});

describe("vrednost projekta pobeđuje env", () => {
  test("sačuvane vrednosti imaju izvor „projekat“, ostalo ostaje iz env-a", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    await ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsA,
      pikselId: "2222222222222",
      posiljalacIme: "Enigma Projekat",
    });
    await ana.mutation(api.podesavanjaStore.sacuvajBudzet, {
      workspaceId: s.wsA,
      minimum: 20,
      maksimum: "800",
      valuta: "usd",
      metaMaksDnevno: 30,
      googleMaksDnevno: 25,
    });

    const p = await zaAkciju(s, s.wsA);
    expect(p.pikselId).toEqual({ vrednost: "2222222222222", izvor: "projekat" });
    expect(p.posiljalacIme).toEqual({ vrednost: "Enigma Projekat", izvor: "projekat" });
    expect(p.budzet).toEqual({
      minimum: { vrednost: 20, izvor: "projekat" },
      maksimum: { vrednost: 800, izvor: "projekat" },
      valuta: { vrednost: "USD", izvor: "projekat" },
      metaMaksDnevno: { vrednost: 30, izvor: "projekat" },
      googleMaksDnevno: { vrednost: 25, izvor: "projekat" },
    });
    // Što projekat nije upisao, osnivački i dalje uzima iz env-a.
    expect(p.kratkiLinkoviBaza).toEqual({ vrednost: "https://enigma.example", izvor: "env" });
    expect(p.novostiRevalidateUrl.izvor).toBe("env");
    expect(p.sajtovi.izvor).toBe("env");
    expect(p.capiTestKod).toBe("TEST1");
  });

  test("brisanje vrednosti vraća osnivački projekat na env; budžet je ceo blok", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const ws = { workspaceId: s.wsA };
    await ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, { ...ws, pikselId: "2222222222222" });
    await ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, { ...ws, pikselId: null });
    expect((await zaAkciju(s, s.wsA)).pikselId).toEqual({ vrednost: "1111111111111", izvor: "env" });
    expect((await projekat(s, s.wsA))?.podesavanja).toBeUndefined();

    // Blok granica zamenjuje sačuvani: polja koja nisu poslata nemaju vrednost projekta.
    await ana.mutation(api.podesavanjaStore.sacuvajBudzet, { ...ws, minimum: 20, maksimum: 800 });
    await ana.mutation(api.podesavanjaStore.sacuvajBudzet, { ...ws, minimum: 20 });
    const b = (await zaAkciju(s, s.wsA)).budzet;
    expect(b.minimum).toEqual({ vrednost: 20, izvor: "projekat" });
    expect(b.maksimum).toEqual({ vrednost: 900, izvor: "env" });
    expect(b.valuta).toEqual({ vrednost: "RSD", izvor: "env" });

    await ana.mutation(api.podesavanjaStore.sacuvajBudzet, ws);
    expect((await zaAkciju(s, s.wsA)).budzet.minimum).toEqual({ vrednost: 10, izvor: "env" });
    expect((await projekat(s, s.wsA))?.podesavanja).toBeUndefined();
  });

  test("ScanMe koji sam upiše piksel ima izvor „projekat“, a Enigma ostaje na svom", async () => {
    const s = await napraviSvet();
    await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pikselId: "3333333333333",
    });
    expect((await zaAkciju(s, s.wsB)).pikselId).toEqual({ vrednost: "3333333333333", izvor: "projekat" });
    expect((await zaAkciju(s, s.wsB)).kratkiLinkoviBaza).toEqual(nema);
    expect((await zaAkciju(s, s.wsA)).pikselId).toEqual({ vrednost: "1111111111111", izvor: "env" });
  });
});

describe("ime pošiljaoca mejla", () => {
  test("ScanMe šalje pod imenom projekta, Enigma pod imenom iz EMAIL_FROM", async () => {
    const s = await napraviSvet();
    const zaMejl = (ws: Id<"workspaces">) =>
      s.t.query(internal.podesavanjaStore.zaMejl, { workspaceId: ws });
    expect((await zaMejl(s.wsB)).ime).toBe("ScanMe");
    expect((await zaMejl(s.wsA)).ime).toBe("Enigma Tim");

    // Svoje ime pošiljaoca pobeđuje i ime projekta.
    await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      posiljalacIme: "ScanMe Tim",
    });
    expect((await zaMejl(s.wsB)).ime).toBe("ScanMe Tim");
  });

  test("bez EMAIL_FROM (ili bez imena u njemu) Enigma šalje pod imenom projekta", async () => {
    const s = await napraviSvet();
    const ime = async () =>
      (await s.t.query(internal.podesavanjaStore.zaMejl, { workspaceId: s.wsA })).ime;

    postaviEnv({ EMAIL_FROM: undefined });
    expect(await ime()).toBe("Enigma IT");

    postaviEnv({ EMAIL_FROM: "tim@enigma.example" });
    expect(await ime()).toBe("Enigma IT");

    postaviEnv({ EMAIL_FROM: '"Enigma Tim" <tim@enigma.example>' });
    expect(await ime()).toBe("Enigma Tim");
  });
});

describe("granice budžeta (budzetProjekta)", () => {
  test("ScanMe dobija zaštitne podrazumevane granice, Enigma svoje iz env-a", async () => {
    const s = await napraviSvet();
    expect(
      await kao(s, s.boban).query(api.podesavanjaStore.budzetProjekta, { workspaceId: s.wsB }),
    ).toEqual({
      minimum: 5,
      maksimum: 5000,
      valuta: "EUR",
      metaMaksDnevno: null,
      googleMaksDnevno: null,
    });
    expect(
      await kao(s, s.ana).query(api.podesavanjaStore.budzetProjekta, { workspaceId: s.wsA }),
    ).toEqual({
      minimum: 10,
      maksimum: 900,
      valuta: "RSD",
      metaMaksDnevno: 50,
      googleMaksDnevno: 40,
    });
  });

  test("čita ga svaki član projekta, a nečlan ne", async () => {
    const s = await napraviSvet();
    const pogled = await kao(s, s.viewer).query(api.podesavanjaStore.budzetProjekta, {
      workspaceId: s.wsA,
    });
    expect(pogled.maksimum).toBe(900);
    await odbijeno(
      kao(s, s.boban).query(api.podesavanjaStore.budzetProjekta, { workspaceId: s.wsA }),
      "forbidden",
    );
    await odbijeno(
      kao(s, s.stranac).query(api.podesavanjaStore.budzetProjekta, { workspaceId: s.wsB }),
      "forbidden",
    );
  });

  test("maksimum manji od minimuma u env-u vraća se na 5.000", async () => {
    const s = await napraviSvet();
    postaviEnv({ BUDGET_MIN: "1000", BUDGET_MAX: "900" });
    const b = await kao(s, s.ana).query(api.podesavanjaStore.budzetProjekta, { workspaceId: s.wsA });
    expect(b.minimum).toBe(1000);
    expect(b.maksimum).toBe(5000);
  });

  test("granice koje upiše projekat važe i za ScanMe", async () => {
    const s = await napraviSvet();
    await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajBudzet, {
      workspaceId: s.wsB,
      minimum: 2,
      maksimum: 300,
      valuta: "rsd",
      metaMaksDnevno: 100,
    });
    expect(
      await kao(s, s.boban).query(api.podesavanjaStore.budzetProjekta, { workspaceId: s.wsB }),
    ).toEqual({ minimum: 2, maksimum: 300, valuta: "RSD", metaMaksDnevno: 100, googleMaksDnevno: null });
  });
});

describe("adresa panela", () => {
  const adresa = (s: Svet, ws: Id<"workspaces">) =>
    s.t.query(internal.podesavanjaStore.adresaPanela, { workspaceId: ws });

  test("ScanMe bez domena i bez HUB_HOSTS nema adresu, ni kad Enigma ima env", async () => {
    const s = await napraviSvet();
    expect(await adresa(s, s.wsB)).toBeNull();
    expect(await adresa(s, s.wsK)).toBeNull();
  });

  test("HUB_HOSTS: prvi host i slug projekta", async () => {
    const s = await napraviSvet();
    postaviEnv({ HUB_HOSTS: "Hub.Example:3000,second.example" });
    expect(await adresa(s, s.wsB)).toBe("https://hub.example/scanme");
    // Hub važi i za osnivački projekat, pre env lanca.
    expect(await adresa(s, s.wsA)).toBe("https://hub.example/enigma-it");
  });

  test("primarni domen projekta pobeđuje hub", async () => {
    const s = await napraviSvet();
    postaviEnv({ HUB_HOSTS: "hub.example,second.example" });
    await dodajDomen(s, s.wsB, "panel.scanme.example");
    expect(await adresa(s, s.wsB)).toBe("https://panel.scanme.example");
    // Tuđ domen ne menja adresu drugog projekta.
    expect(await adresa(s, s.wsK)).toBe("https://hub.example/klijent-doo");
  });

  test("osnivački projekat bez domena i huba uzima env lanac", async () => {
    const s = await napraviSvet();
    expect(await adresa(s, s.wsA)).toBe("https://enigma.example");
    postaviEnv({ OR_SHORT_LINK_BASE_URL: undefined });
    expect(await adresa(s, s.wsA)).toBeNull();
  });
});

describe("provera vrednosti pri čuvanju", () => {
  test("baza kratkih linkova mora biti jedan od domena OVOG projekta", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    const sacuvaj = (kratkiLinkoviBaza: string) =>
      boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        workspaceId: s.wsB,
        kratkiLinkoviBaza,
      });

    await odbijeno(sacuvaj("https://panel.scanme.example"), "invalid");
    // Domen Enigme nije domen ScanMe-a.
    await dodajDomen(s, s.wsA, "panel.enigma.example");
    await odbijeno(sacuvaj("https://panel.enigma.example"), "invalid");
    expect((await projekat(s, s.wsB))?.podesavanja).toBeUndefined();

    await dodajDomen(s, s.wsB, "panel.scanme.example");
    await odbijeno(sacuvaj("http://panel.scanme.example"), "invalid");
    await odbijeno(sacuvaj("https://panel.scanme.example:8443"), "invalid");
    await odbijeno(sacuvaj("https://panel.scanme.example/r"), "invalid");

    await sacuvaj("https://Panel.ScanMe.example/");
    expect((await projekat(s, s.wsB))?.podesavanja?.kratkiLinkoviBaza).toBe("https://panel.scanme.example");
    expect((await zaAkciju(s, s.wsB)).kratkiLinkoviBaza).toEqual({
      vrednost: "https://panel.scanme.example",
      izvor: "projekat",
    });
  });

  test("adresa za osvežavanje novosti i Puls moraju biti na sajtovima projekta", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    const ws = { workspaceId: s.wsB };
    const novosti = (novostiRevalidateUrl: string) =>
      boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, { ...ws, novostiRevalidateUrl });

    // ScanMe još nema sajtove, a Enigmini praćeni domeni iz env-a ne važe za njega.
    await odbijeno(novosti("https://scanme.example/api/revalidate"), "invalid");
    await odbijeno(novosti("https://enigma.example/api/revalidate"), "invalid");

    await boban.mutation(api.podesavanjaStore.sacuvajSajtove, { ...ws, sajtovi: ["scanme.example"] });
    await novosti("https://www.scanme.example/api/revalidate");
    expect((await zaAkciju(s, s.wsB)).novostiRevalidateUrl).toEqual({
      vrednost: "https://www.scanme.example/api/revalidate",
      izvor: "projekat",
    });
    await odbijeno(novosti("https://evil.example/api/revalidate"), "invalid");
    await odbijeno(novosti("http://scanme.example/api/revalidate"), "invalid");
    await odbijeno(novosti("https://user:lozinka@scanme.example/api"), "invalid");

    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      ...ws,
      pulsUrl: "https://scanme.example/api/puls",
    });
    await odbijeno(
      boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        ...ws,
        pulsUrl: "https://enigma.example/api/puls",
      }),
      "invalid",
    );
    expect((await zaAkciju(s, s.wsB)).pulsUrl).toEqual({
      vrednost: "https://scanme.example/api/puls",
      izvor: "projekat",
    });
  });

  test("Enigma bez svojih sajtova proverava adresu protiv praćenih domena iz env-a", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    await ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsA,
      novostiRevalidateUrl: "https://www.enigma.example/api/revalidate",
    });
    await odbijeno(
      ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        workspaceId: s.wsA,
        novostiRevalidateUrl: "https://scanme.example/api/revalidate",
      }),
      "invalid",
    );
  });

  test("piksel, ime pošiljaoca i budžet odbijaju neispravan unos", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const ws = { workspaceId: s.wsA };
    const integracija = (a: FunctionArgs<typeof api.podesavanjaStore.sacuvajIntegracijeSajta>) =>
      ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, a);
    await odbijeno(integracija({ ...ws, pikselId: "abc" }), "invalid");
    await odbijeno(integracija({ ...ws, pikselId: "12345" }), "invalid");
    await odbijeno(integracija({ ...ws, posiljalacIme: "Tim <x@y.z>" }), "invalid");
    await odbijeno(integracija({ ...ws, posiljalacIme: "A" }), "invalid");

    const budzet = (a: FunctionArgs<typeof api.podesavanjaStore.sacuvajBudzet>) =>
      ana.mutation(api.podesavanjaStore.sacuvajBudzet, a);
    await odbijeno(budzet({ ...ws, minimum: 100, maksimum: 50 }), "invalid");
    await odbijeno(budzet({ ...ws, maksimum: 100, metaMaksDnevno: 500 }), "invalid");
    await odbijeno(budzet({ ...ws, minimum: -1 }), "invalid");
    await odbijeno(budzet({ ...ws, valuta: "euro" }), "invalid");
    expect((await projekat(s, s.wsA))?.podesavanja).toBeUndefined();
  });
});

describe("prava na podešavanja", () => {
  test("urednik i posmatrač ne menjaju ni ne čitaju podešavanja; ništa se ne menja", async () => {
    const s = await napraviSvet();
    const pre = await projekat(s, s.wsA);
    const ws = { workspaceId: s.wsA };
    for (const ko of [s.urednica, s.viewer]) {
      const k = kao(s, ko);
      await odbijeno(
        k.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, { ...ws, pikselId: "2222222222222" }),
        "forbidden",
      );
      await odbijeno(k.mutation(api.podesavanjaStore.sacuvajBudzet, { ...ws, minimum: 20 }), "forbidden");
      await odbijeno(
        k.mutation(api.podesavanjaStore.postaviTajnu, {
          ...ws,
          kljuc: "meta_capi_token",
          vrednost: "x".repeat(30),
        }),
        "forbidden",
      );
      await odbijeno(
        k.mutation(api.podesavanjaStore.obrisiTajnu, { ...ws, kljuc: "meta_capi_token" }),
        "forbidden",
      );
      await odbijeno(k.query(api.podesavanjaStore.procitaj, ws), "forbidden");
    }
    expect(await projekat(s, s.wsA)).toEqual(pre);
    expect(await s.t.run(async (ctx) => await ctx.db.query("projekatTajne").collect())).toEqual([]);
  });

  test("vlasnik jednog projekta ne menja ni ne čita podešavanja drugog", async () => {
    const s = await napraviSvet();
    const ws = { workspaceId: s.wsB };
    await odbijeno(
      kao(s, s.ana).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, { ...ws, pikselId: "2222222222222" }),
      "forbidden",
    );
    await odbijeno(kao(s, s.ana).query(api.podesavanjaStore.procitaj, ws), "forbidden");
    await odbijeno(s.t.query(api.podesavanjaStore.procitaj, ws), "unauthorized");
    expect((await projekat(s, s.wsB))?.podesavanja).toBeUndefined();
  });
});
