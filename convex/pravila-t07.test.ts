/// <reference types="vite/client" />
/**
 * Pravila bez samoupisa, sa probom pre uključivanja (ULTRA1 T07, P5).
 *
 *   - prva poseta ništa ne upisuje, a nema javne funkcije koja upisuje
 *     šablon bez praga;
 *   - `dodajIzSablona` traži prag > 0 i pravi isključeno pravilo;
 *   - pravilo koje pauzira ne uključuje se bez potvrđene probe (prekidač,
 *     novo pravilo, izmena); pravilo koje samo javlja ne traži probu;
 *   - `probaPravila` čita samo bazu: tačne pogođene kampanje, bez Google
 *     kampanje, uz najmanje prikaza i mirovanje, i ne zove mrežu;
 *   - `predlogPraga` je dvostruka medijana zaokružena naviše; bez podataka
 *     ili sa više valuta nema predloga;
 *   - evaluator dobija samo Meta ciljeve i valutu naloga.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as rulesStore from "./rulesStore";
import { kao, napraviPravilo, napraviSvet, type Svet } from "./projekatTest.pomoc";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;
const SADA = Date.parse("2026-10-20T12:00:00.000Z");

function datum(danaUnazad: number): string {
  return new Date(SADA - danaUnazad * DAN).toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.useFakeTimers({ now: SADA, toFake: ["Date"] });
  vi.stubEnv("ADS_WRITE_ENABLED", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Poziv mora da padne sa ConvexError datim kodom. */
async function pada(poziv: Promise<unknown>, kod: string): Promise<void> {
  const greska = await poziv.then(
    () => null,
    (e: unknown) => e,
  );
  expect(greska, "poziv je morao da padne").not.toBeNull();
  const podaci = (greska as { data?: { code?: string } }).data;
  expect(podaci?.code ?? String(greska)).toContain(kod);
}

type Uvid = {
  dana: number;
  spend: number;
  impressions: number;
  clicks?: number;
  results?: number;
  breakdownHash?: string;
};

async function nalog(
  s: Svet,
  provider: "meta_ads" | "google_ads",
  valuta: string,
  oznaka: string,
  workspaceId: Id<"workspaces"> = s.wsA,
): Promise<Id<"adAccounts">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("adAccounts", {
      workspaceId,
      provider,
      externalId: `act_${oznaka}`,
      name: `Nalog ${oznaka}`,
      currency: valuta,
    }),
  );
}

/** Kampanja sa jednom grupom, jednim oglasom i datim dnevnim redovima. */
async function kampanja(
  s: Svet,
  accountId: Id<"adAccounts">,
  naziv: string,
  uvidi: Uvid[],
  workspaceId: Id<"workspaces"> = s.wsA,
): Promise<string> {
  const externalId = `c_${naziv}`;
  await s.t.run(async (ctx) => {
    const campaignId = await ctx.db.insert("adCampaigns", {
      workspaceId,
      accountId,
      externalId,
      name: naziv,
      status: "ACTIVE",
      syncPriority: "cold",
    });
    const adSetId = await ctx.db.insert("adSets", {
      workspaceId,
      campaignId,
      externalId: `s_${naziv}`,
      name: `Grupa ${naziv}`,
      status: "ACTIVE",
    });
    const adId = await ctx.db.insert("ads", {
      workspaceId,
      adSetId,
      externalId: `a_${naziv}`,
      name: `Oglas ${naziv}`,
      status: "ACTIVE",
    });
    for (const u of uvidi) {
      await ctx.db.insert("adInsights", {
        workspaceId,
        adId,
        date: datum(u.dana),
        breakdownHash: u.breakdownHash ?? "none",
        spend: u.spend,
        impressions: u.impressions,
        clicks: u.clicks ?? 0,
        results: u.results,
      });
    }
  });
  return externalId;
}

/**
 * Tri Meta kampanje i jedna Google kampanja u A, sve u EUR:
 *   - „Skupa": cena po rezultatu 64,30 (643 / 10), 5.000 prikaza;
 *   - „Jeftina": 10 (100 / 10), 4.000 prikaza; stari red od pre 40 dana i
 *     red sa podelom (breakdown) ne smeju da uđu u zbir;
 *   - „Malo prikaza": 500 (500 / 1), samo 200 prikaza;
 *   - Google „Google skupa": 900, 9.000 prikaza — pravila je ne vide.
 */
async function svetSaKampanjama() {
  const s = await napraviSvet();
  const meta = await nalog(s, "meta_ads", "EUR", "meta");
  const google = await nalog(s, "google_ads", "EUR", "google");
  const skupa = await kampanja(s, meta, "Skupa", [
    { dana: 0, spend: 343, impressions: 3000, results: 5 },
    { dana: 1, spend: 300, impressions: 2000, results: 5 },
  ]);
  const jeftina = await kampanja(s, meta, "Jeftina", [
    { dana: 0, spend: 100, impressions: 4000, results: 10 },
    { dana: 40, spend: 10_000, impressions: 1000, results: 0 },
    { dana: 0, spend: 9_999, impressions: 1, results: 0, breakdownHash: "uzrast" },
  ]);
  const malo = await kampanja(s, meta, "Malo prikaza", [
    { dana: 2, spend: 500, impressions: 200, results: 1 },
  ]);
  const googleSkupa = await kampanja(s, google, "Google skupa", [
    { dana: 0, spend: 900, impressions: 9000, results: 1 },
  ]);
  return { s, meta, skupa, jeftina, malo, googleSkupa };
}

const USLOV_CPA = {
  metric: "cpa",
  operator: "gt",
  value: 50,
  windowDays: 3,
  minImpressions: 1000,
} as const;

describe("bez samoupisa", () => {
  test("prva poseta Pravilima ne upisuje nijedno pravilo", async () => {
    const s = await napraviSvet();
    for (const korisnik of [s.ana, s.urednica, s.viewer]) {
      expect(await kao(s, korisnik).query(api.rulesStore.listRules, { workspaceId: s.wsA })).toEqual([]);
    }
    expect(await kao(s, s.ana).query(api.rulesStore.listRules, { workspaceId: s.wsA })).toEqual([]);
    const sva = await s.t.run(async (ctx) => ctx.db.query("rules").collect());
    expect(sva).toEqual([]);
  });


  test("nema javne funkcije koja upisuje šablon bez praga", async () => {
    const izvoz = Object.keys(rulesStore);
    expect(izvoz).not.toContain("ensureTemplateRules");
    expect(izvoz).not.toContain("TEMPLATE_RULES");

    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    for (const prag of [0, -5, Number.NaN]) {
      await pada(
        ana.mutation(api.rulesStore.dodajIzSablona, {
          workspaceId: s.wsA,
          sablon: "skupa_konverzija",
          prag,
        }),
        "invalid_argument",
      );
    }
    expect(await s.t.run(async (ctx) => ctx.db.query("rules").collect())).toEqual([]);
  });

  test("dodajIzSablona pravi jedno isključeno pravilo sa izabranim pragom", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const id = await ana.mutation(api.rulesStore.dodajIzSablona, {
      workspaceId: s.wsA,
      sablon: "skupa_konverzija",
      prag: 130,
    });
    const pravilo = await s.t.run(async (ctx) => ctx.db.get(id));
    expect(pravilo).toMatchObject({
      workspaceId: s.wsA,
      name: "Skupa konverzija",
      enabled: false,
      scope: "campaign",
      condition: { metric: "cpa", operator: "gt", value: 130, windowDays: 3, minImpressions: 1000 },
      action: "pause_and_notify",
      cooldownHours: 24,
      createdBy: s.ana,
    });

    const skok = await ana.mutation(api.rulesStore.dodajIzSablona, {
      workspaceId: s.wsA,
      sablon: "skok_potrosnje",
      prag: 650,
    });
    expect(await s.t.run(async (ctx) => ctx.db.get(skok))).toMatchObject({
      name: "Skok potrošnje",
      enabled: false,
      condition: { metric: "spend", operator: "gt", value: 650, windowDays: 1, minImpressions: 500 },
      action: "notify",
      cooldownHours: 12,
    });
  });
});

describe("pauza se ne uključuje bez probe", () => {
  test("prekidač: pauza traži probu, obaveštenje i gašenje ne traže", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const pauza = await ana.mutation(api.rulesStore.dodajIzSablona, {
      workspaceId: s.wsA,
      sablon: "skupa_konverzija",
      prag: 130,
    });
    const javi = await ana.mutation(api.rulesStore.dodajIzSablona, {
      workspaceId: s.wsA,
      sablon: "skok_potrosnje",
      prag: 650,
    });

    await pada(
      ana.mutation(api.rulesStore.toggleRule, { workspaceId: s.wsA, ruleId: pauza, enabled: true }),
      "proba_potrebna",
    );
    await pada(
      ana.mutation(api.rulesStore.toggleRule, {
        workspaceId: s.wsA,
        ruleId: pauza,
        enabled: true,
        probaPotvrdjena: false,
      }),
      "proba_potrebna",
    );
    expect((await s.t.run(async (ctx) => ctx.db.get(pauza)))?.enabled).toBe(false);

    await ana.mutation(api.rulesStore.toggleRule, {
      workspaceId: s.wsA,
      ruleId: pauza,
      enabled: true,
      probaPotvrdjena: true,
    });
    expect((await s.t.run(async (ctx) => ctx.db.get(pauza)))?.enabled).toBe(true);

    // Gašenje i pravilo koje samo javlja ne traže probu.
    await ana.mutation(api.rulesStore.toggleRule, { workspaceId: s.wsA, ruleId: pauza, enabled: false });
    await ana.mutation(api.rulesStore.toggleRule, { workspaceId: s.wsA, ruleId: javi, enabled: true });
    const posle = await s.t.run(async (ctx) => [await ctx.db.get(pauza), await ctx.db.get(javi)]);
    expect(posle.map((r) => r?.enabled)).toEqual([false, true]);
  });

  test("novo pravilo i izmena: pauza po novom uslovu traži probu, preimenovanje ne", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const telo = {
      workspaceId: s.wsA,
      name: "Pauziraj skupe",
      scope: "campaign",
      condition: USLOV_CPA,
      action: "pause",
      cooldownHours: 24,
      enabled: true,
    } as const;

    await pada(ana.mutation(api.rulesStore.createRule, telo), "proba_potrebna");
    expect(await s.t.run(async (ctx) => ctx.db.query("rules").collect())).toEqual([]);

    // Isključeno pravilo i pravilo koje samo javlja nastaju bez probe.
    const iskljuceno = await ana.mutation(api.rulesStore.createRule, { ...telo, enabled: false });
    await ana.mutation(api.rulesStore.createRule, { ...telo, action: "notify" });

    // Uključivanje kroz izmenu traži probu.
    await pada(
      ana.mutation(api.rulesStore.updateRule, { ...telo, ruleId: iskljuceno }),
      "proba_potrebna",
    );
    await ana.mutation(api.rulesStore.updateRule, {
      ...telo,
      ruleId: iskljuceno,
      probaPotvrdjena: true,
    });

    // Aktivno pravilo: novo ime i mirovanje ne traže probu, nov prag traži.
    await ana.mutation(api.rulesStore.updateRule, {
      ...telo,
      ruleId: iskljuceno,
      name: "Pauziraj skupe kampanje",
      cooldownHours: 48,
    });
    await pada(
      ana.mutation(api.rulesStore.updateRule, {
        ...telo,
        ruleId: iskljuceno,
        condition: { ...USLOV_CPA, value: 40 },
      }),
      "proba_potrebna",
    );
    // Pravilo koje je javljalo pa počinje da pauzira takođe traži probu.
    const javljalo = await ana.mutation(api.rulesStore.createRule, { ...telo, action: "notify" });
    await pada(
      ana.mutation(api.rulesStore.updateRule, { ...telo, ruleId: javljalo }),
      "proba_potrebna",
    );

    const pravilo = await s.t.run(async (ctx) => ctx.db.get(iskljuceno));
    expect(pravilo).toMatchObject({
      name: "Pauziraj skupe kampanje",
      cooldownHours: 48,
      enabled: true,
      condition: { value: 50 },
    });
  });

  test("createRule sa pauzom i potvrđenom probom prolazi", async () => {
    const s = await napraviSvet();
    const id = await kao(s, s.ana).mutation(api.rulesStore.createRule, {
      workspaceId: s.wsA,
      name: "Pauziraj skupe",
      scope: "campaign",
      condition: USLOV_CPA,
      action: "pause_and_notify",
      cooldownHours: 24,
      enabled: true,
      probaPotvrdjena: true,
    });
    expect((await s.t.run(async (ctx) => ctx.db.get(id)))?.enabled).toBe(true);
  });
});

describe("probaPravila", () => {
  test("vraća tačne pogođene Meta kampanje, bez Google kampanje, uz najmanje prikaza", async () => {
    const { s, skupa } = await svetSaKampanjama();
    const mreza = vi.fn(() => {
      throw new Error("proba ne sme da zove mrežu");
    });
    vi.stubGlobal("fetch", mreza);

    const proba = await kao(s, s.ana).query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: USLOV_CPA,
    });

    expect(proba).toMatchObject({
      valuta: "EUR",
      pisanjeUkljuceno: false,
      ispodMinPrikaza: 1,
      ciljeva: 3,
      prozorDana: 3,
    });
    expect(proba.pogodjeni).toEqual([
      {
        naziv: "Skupa",
        targetId: skupa,
        targetType: "campaign",
        status: "ACTIVE",
        vrednost: 64.3,
        izmereno: true,
        prag: 50,
        uPauzi: false,
        cekaJosSati: null,
      },
    ]);
    expect(proba.najblizi).toEqual({ naziv: "Skupa", vrednost: 64.3, izmereno: true, procenatPraga: 129, preko: true });
    expect(mreza).not.toHaveBeenCalled();
  });

  test("bez pogođenih: najbliža pragu; bez praga prikaza ulazi i mala kampanja", async () => {
    const { s } = await svetSaKampanjama();
    const ana = kao(s, s.ana);

    const visok = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: { ...USLOV_CPA, value: 1000 },
    });
    expect(visok.pogodjeni).toEqual([]);
    expect(visok.najblizi).toEqual({ naziv: "Skupa", vrednost: 64.3, izmereno: true, procenatPraga: 6, preko: false });

    const bezMinimuma = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: { ...USLOV_CPA, minImpressions: 0 },
    });
    expect(bezMinimuma.ispodMinPrikaza).toBe(0);
    expect(bezMinimuma.pogodjeni.map((p) => [p.naziv, p.vrednost])).toEqual([
      ["Malo prikaza", 500],
      ["Skupa", 64.3],
    ]);

    // „Manje od": procenat nema smisla, piše se vrednost i prag.
    const manje = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: { ...USLOV_CPA, operator: "lt", value: 20 },
    });
    expect(manje.pogodjeni.map((p) => p.naziv)).toEqual(["Jeftina"]);
    expect(manje.najblizi).toMatchObject({ naziv: "Jeftina", procenatPraga: null, preko: true });
  });

  test("neizmerena mera nije predstavljena kao izmerena (T13)", async () => {
    const { s, meta } = await svetSaKampanjama();
    const ana = kao(s, s.ana);
    // Troši, a nema ni rezultata ni klikova: evaluator i dalje računa cenu po
    // rezultatu kao celu potrošnju (pravilo okida), ali to nije izmerena mera.
    await kampanja(s, meta, "Bez rezultata", [
      { dana: 0, spend: 80, impressions: 2000, results: 0 },
    ]);

    const cpa = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: USLOV_CPA,
    });
    const bez = cpa.pogodjeni.find((p) => p.naziv === "Bez rezultata");
    expect(bez).toMatchObject({ vrednost: 80, izmereno: false, prag: 50 });
    expect(cpa.pogodjeni.find((p) => p.naziv === "Skupa")).toMatchObject({ izmereno: true });
    // Najbliži pragu je baš ta kampanja (80 > 64,3), ali bez lažnog procenta.
    expect(cpa.najblizi).toEqual({
      naziv: "Bez rezultata",
      vrednost: 80,
      izmereno: false,
      procenatPraga: null,
      preko: true,
    });

    const cpc = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: { ...USLOV_CPA, metric: "cpc", operator: "lt", value: 0.1 },
    });
    expect(cpc.pogodjeni.find((p) => p.naziv === "Bez rezultata")).toMatchObject({
      vrednost: 0,
      izmereno: false,
    });
  });

  test("postojeće pravilo zna mirovanje; tuđe pravilo ništa ne otkriva", async () => {
    const { s, skupa } = await svetSaKampanjama();
    const ana = kao(s, s.ana);
    const pravilo = await ana.mutation(api.rulesStore.dodajIzSablona, {
      workspaceId: s.wsA,
      sablon: "skupa_konverzija",
      prag: 50,
    });
    const tudje = await napraviPravilo(s, s.wsB, "Pravilo B");
    await s.t.run(async (ctx) => {
      for (const ruleId of [pravilo, tudje]) {
        await ctx.db.insert("ruleFirings", {
          workspaceId: ruleId === pravilo ? s.wsA : s.wsB,
          ruleId,
          targetId: skupa,
          firedAt: SADA - 2 * SAT,
          metricValue: 64.3,
          actionTaken: "pause_and_notify",
          notified: true,
        });
      }
    });

    const svoje = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: USLOV_CPA,
      ruleId: pravilo,
    });
    expect(svoje.pogodjeni[0]).toMatchObject({ naziv: "Skupa", uPauzi: true, cekaJosSati: 22 });

    const krozTudje = await ana.query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: USLOV_CPA,
      ruleId: tudje,
    });
    expect(krozTudje.pogodjeni[0]).toMatchObject({ naziv: "Skupa", uPauzi: false, cekaJosSati: null });
  });

  test("piše da li je pauziranje uključeno na serveru", async () => {
    const { s } = await svetSaKampanjama();
    vi.stubEnv("ADS_WRITE_ENABLED", "true");
    const proba = await kao(s, s.viewer).query(api.rulesStore.probaPravila, {
      workspaceId: s.wsA,
      scope: "campaign",
      condition: USLOV_CPA,
    });
    expect(proba.pisanjeUkljuceno).toBe(true);
  });
});

describe("predlogPraga", () => {
  test("skupa konverzija: dvostruka medijana cene po rezultatu, zaokružena naviše", async () => {
    const { s } = await svetSaKampanjama();
    const predlog = await kao(s, s.ana).query(api.rulesStore.predlogPraga, {
      workspaceId: s.wsA,
      sablon: "skupa_konverzija",
    });
    // Meta: 64,30, 10 i 500 → medijana 64,30 → 128,6 → 130. Sa Google
    // kampanjom (900) bilo bi 570, a sa redom od pre 40 dana 1.000.
    expect(predlog).toEqual({
      prag: 130,
      valuta: "EUR",
      osnova: { kampanja: 3, medijana: 64.3 },
      razlog: null,
    });
  });

  test("skok potrošnje: dvostruka medijana dnevne potrošnje", async () => {
    const { s } = await svetSaKampanjama();
    const predlog = await kao(s, s.ana).query(api.rulesStore.predlogPraga, {
      workspaceId: s.wsA,
      sablon: "skok_potrosnje",
    });
    // Dani sa potrošnjom: 343, 300, 100, 500 → medijana 321,5 → 643 → 650.
    expect(predlog).toEqual({
      prag: 650,
      valuta: "EUR",
      osnova: { kampanja: 3, medijana: 321.5 },
      razlog: null,
    });
  });

  test("bez podataka nema predloga; sa više valuta takođe", async () => {
    const s = await napraviSvet();
    await nalog(s, "meta_ads", "EUR", "prazan");
    const ana = kao(s, s.ana);
    expect(
      await ana.query(api.rulesStore.predlogPraga, { workspaceId: s.wsA, sablon: "skupa_konverzija" }),
    ).toEqual({ prag: null, valuta: "EUR", osnova: null, razlog: "nema_podataka" });

    const dolari = await nalog(s, "meta_ads", "USD", "dolari");
    await kampanja(s, dolari, "Dolarska", [{ dana: 0, spend: 50, impressions: 2000, results: 5 }]);
    expect(
      await ana.query(api.rulesStore.predlogPraga, { workspaceId: s.wsA, sablon: "skupa_konverzija" }),
    ).toEqual({ prag: null, valuta: null, osnova: null, razlog: "vise_valuta" });
  });
});

describe("evaluator", () => {
  test("dobija samo Meta ciljeve i valutu naloga", async () => {
    const { s, skupa, jeftina, malo, googleSkupa } = await svetSaKampanjama();
    await s.t.run(async (ctx) =>
      ctx.db.insert("rules", {
        workspaceId: s.wsA,
        name: "Javi za skupe",
        enabled: true,
        scope: "campaign",
        condition: USLOV_CPA,
        action: "notify",
        cooldownHours: 24,
      }),
    );
    const konteksti = await s.t.query(internal.rulesStore.getEvaluationContext, {
      now: SADA,
      specificWorkspaceId: s.wsA,
    });
    expect(konteksti).toHaveLength(1);
    const [k] = konteksti;
    expect(k.valuta).toBe("EUR");
    expect(k.from).toBe(datum(2));
    expect(k.to).toBe(datum(0));
    const ids = k.targets.map((t) => t.targetId).sort();
    expect(ids).toEqual([jeftina, malo, skupa].sort());
    expect(ids).not.toContain(googleSkupa);
    expect(k.targets.find((t) => t.targetId === skupa)).toMatchObject({
      spend: 643,
      impressions: 5000,
      results: 10,
      isCoolingDown: false,
    });
  });
});
