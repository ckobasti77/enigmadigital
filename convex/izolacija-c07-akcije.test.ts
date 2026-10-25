/// <reference types="vite/client" />
/**
 * Izolacija grupe C07 (akcije nad oglasima i Google oglasi): član projekta A ne
 * čita B i ne pokreće akcije nad njim, sve akcije pisanja nad oglasima traže
 * vlasnika projekta (urednik i posmatrač su odbijeni), a veza, dnevnik akcija i
 * Google tabele se čitaju samo za projekat iz poziva. Odbijanje dolazi iz
 * omotača, pre bilo kakvog poziva ka Meti ili Google-u.
 */
import type { FunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_VLASNIK = /samo vlasnik projekta/;
const NIJE_POVEZAN = /nije povezana u ovom projektu/;

type Upit = [FunctionReference<"query">, Record<string, unknown>];
type Akcija = [FunctionReference<"action">, Record<string, unknown>];

const OD = { from: "2026-10-01", to: "2026-10-07" };

const META_PLAN = {
  accountExternalId: "act_1",
  campaign: { name: "Kampanja", objective: "OUTCOME_TRAFFIC", specialAdCategories: [] },
  adSet: {
    name: "Set",
    dailyBudget: 10,
    billingEvent: "IMPRESSIONS",
    optimizationGoal: "REACH",
    targeting: {},
  },
  ad: { name: "Oglas", creative: { kind: "existing_post", objectStoryId: "1_2" } },
} as const;

const GADS_PLAN = {
  campaign: { name: "Kampanja", channelType: "SEARCH", dailyBudget: 10 },
} as const;

/** Svih deset akcija pisanja, sa najmanjim važećim argumentima. */
const META_AKCIJE: Akcija[] = [
  [api.adActions.pauseResume, { targetType: "campaign", targetId: "c1", desiredStatus: "PAUSED" }],
  [api.adActions.changeBudget, { targetType: "campaign", targetId: "c1", newDailyBudget: 10 }],
  [api.adActions.duplicateAd, { adId: "ad1" }],
  [
    api.adActions.createHookVersion,
    { sourceAdId: "ad1", newName: "Nova", hookLabel: "H1", primaryText: "Tekst" },
  ],
  [api.adActions.createCampaignFull, { ...META_PLAN, requestId: "zahtev-1" }],
  [api.adActions.validateCampaignPlan, META_PLAN],
];
const GADS_AKCIJE: Akcija[] = [
  [api.adActions.createGoogleAdsCampaignFull, GADS_PLAN],
  [api.adActions.validateGoogleAdsCampaignPlan, GADS_PLAN],
  [api.adActions.changeGoogleAdsBudget, { campaignId: "c1", budgetId: "b1", newDailyBudget: 10 }],
  [api.adActions.pauseResumeGoogleAds, { campaignId: "c1", desiredStatus: "PAUSED" }],
];
const SVE_AKCIJE: Akcija[] = [...META_AKCIJE, ...GADS_AKCIJE];

const ADS_UPITI: Upit[] = [
  [api.adActionsStore.getTargetContext, { targetType: "campaign", targetId: "c1" }],
  [api.adActionsStore.listActions, {}],
  [api.adActionsStore.getActionStats, {}],
  [api.adActionsStore.getAdCreativeDetails, { adExternalId: "ad1" }],
];

const GADS_UPITI: Upit[] = [
  [api.googleAdsStore.getGoogleAdsAssets, {}],
  [api.googleAdsStore.getGoogleAdsStructure, {}],
  [api.googleAdsStore.getGoogleAdsConversionActions, {}],
  [api.googleAdsStore.getGoogleAdsBudgets, {}],
  [api.googleAdsStore.getGoogleAdsSearchTerms, {}],
  [api.googleAdsStore.getGoogleAdsNegativeKeywords, {}],
  [api.googleAdsStore.getKeywordQualityReport, OD],
  [api.googleAdsStore.getGoogleAdsSegments, {}],
];

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

async function akcijeNadBOdbijene(s: Svet, akcije: Akcija[]) {
  for (const [fn, args] of akcije) {
    await odbijeno(
      kao(s, s.ana).action(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

/** Urednik i posmatrač u A ne pokreću nijednu akciju sa liste (traži se vlasnik). */
async function samoVlasnikPokrece(s: Svet, akcije: Akcija[]) {
  for (const korisnik of [s.urednica, s.viewer]) {
    for (const [fn, args] of akcije) {
      await odbijeno(
        kao(s, korisnik).action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }
  }
}

/** Po jedan red dnevnika akcija u projektu `ws`, sa oznakom u `targetId`. */
async function upisiDnevnik(s: Svet, ws: Id<"workspaces">, oznaka: string) {
  await s.t.run(async (ctx) => {
    await ctx.db.insert("adActions", {
      workspaceId: ws,
      targetType: "campaign",
      targetId: `kampanja-${oznaka}`,
      targetName: `Kampanja ${oznaka}`,
      action: "pause",
      status: "success",
      executedAt: 1_760_000_000_000,
    });
  });
}

// ── Akcije nad oglasima ─────────────────────────────────────────────────────

describe("akcije nad oglasima", () => {
  // Kill switch se proverava tek u telu akcije; da bi test video "nije povezan",
  // a ne "pisanje je isključeno", uključi se samo za vreme testa.
  let staro: string | undefined;
  beforeEach(() => {
    staro = process.env.ADS_WRITE_ENABLED;
    process.env.ADS_WRITE_ENABLED = "true";
  });
  afterEach(() => {
    if (staro === undefined) delete process.env.ADS_WRITE_ENABLED;
    else process.env.ADS_WRITE_ENABLED = staro;
  });

  test("član samo A ne čita B: četiri upita nad dnevnikom i oglasom", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, ADS_UPITI);
  });

  test("član samo A ne pokreće nijednu od deset akcija nad B", async () => {
    const s = await napraviSvet();
    await akcijeNadBOdbijene(s, SVE_AKCIJE);
  });

  test("urednik i posmatrač u A ne pokreću nijednu od deset akcija: traži se vlasnik", async () => {
    const s = await napraviSvet();
    await samoVlasnikPokrece(s, SVE_AKCIJE);
  });

  test("nijedna akcija se ne izvršava bez prijave", async () => {
    const s = await napraviSvet();
    for (const [fn, args] of SVE_AKCIJE) {
      await odbijeno(s.t.action(fn, { ...args, workspaceId: s.wsA }), "unauthorized");
    }
  });

  test("listActions u A ne vidi zapis iz B, a getActionStats broji samo A", async () => {
    const s = await napraviSvet();
    await upisiDnevnik(s, s.wsA, "a");
    await upisiDnevnik(s, s.wsB, "b");

    const uA = await kao(s, s.viewer).query(api.adActionsStore.listActions, {
      workspaceId: s.wsA,
    });
    expect(uA.map((r) => r.targetId)).toEqual(["kampanja-a"]);

    const uB = await kao(s, s.jovan).query(api.adActionsStore.listActions, {
      workspaceId: s.wsB,
    });
    expect(uB.map((r) => r.targetId)).toEqual(["kampanja-b"]);

    const statistika = await kao(s, s.viewer).query(api.adActionsStore.getActionStats, {
      workspaceId: s.wsA,
    });
    expect(statistika).toEqual({ total: 1, success: 1, error: 0, pending: 0 });
  });

  test("oglas i kampanja iz B nisu vidljivi iz A (isto ponašanje kao do sada)", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      const nalog = await ctx.db.insert("adAccounts", {
        workspaceId: s.wsB,
        provider: "meta_ads",
        externalId: "act_b",
        name: "Nalog B",
        currency: "EUR",
      });
      const kampanja = await ctx.db.insert("adCampaigns", {
        workspaceId: s.wsB,
        accountId: nalog,
        externalId: "kampanja-b",
        name: "Kampanja B",
        status: "ACTIVE",
        dailyBudget: 20,
        syncPriority: "hot",
      });
      const set = await ctx.db.insert("adSets", {
        workspaceId: s.wsB,
        campaignId: kampanja,
        externalId: "set-b",
        name: "Set B",
        status: "ACTIVE",
      });
      await ctx.db.insert("ads", {
        workspaceId: s.wsB,
        adSetId: set,
        externalId: "oglas-b",
        name: "Oglas B",
        status: "ACTIVE",
      });
    });

    // Posmatrač u A: oglasa nema, a kontekst cilja se vraća prazan (ime = id).
    const oglas = await kao(s, s.viewer).query(api.adActionsStore.getAdCreativeDetails, {
      workspaceId: s.wsA,
      adExternalId: "oglas-b",
    });
    expect(oglas).toBeNull();
    const cilj = await kao(s, s.viewer).query(api.adActionsStore.getTargetContext, {
      workspaceId: s.wsA,
      targetType: "campaign",
      targetId: "kampanja-b",
    });
    expect(cilj.name).toBe("kampanja-b");
    expect(cilj.status).toBe("UNKNOWN");
    expect(cilj.dailyBudget).toBeUndefined();

    // Isti pozivi nad B (Jovan je član oba) vide stvarne podatke.
    const uB = await kao(s, s.jovan).query(api.adActionsStore.getAdCreativeDetails, {
      workspaceId: s.wsB,
      adExternalId: "oglas-b",
    });
    expect(uB?.name).toBe("Oglas B");
    const ciljB = await kao(s, s.jovan).query(api.adActionsStore.getTargetContext, {
      workspaceId: s.wsB,
      targetType: "campaign",
      targetId: "kampanja-b",
    });
    expect(ciljB.name).toBe("Kampanja B");
  });

  test("vlasnik A prolazi omotač: bez veze u A dobija 'nije povezano', ne 'forbidden'", async () => {
    const s = await napraviSvet();
    // Veza postoji samo u B: akcija iz A je ne sme ni videti.
    await s.t.run(async (ctx) => {
      for (const provider of ["meta_ads", "google_ads"] as const) {
        await ctx.db.insert("connections", {
          workspaceId: s.wsB,
          provider,
          encryptedCredentials: "nije-sifrovano",
          externalId: "123",
          status: "active",
        });
      }
    });

    for (const [fn, args] of SVE_AKCIJE) {
      const greska = await kao(s, s.ana)
        .action(fn, { ...args, workspaceId: s.wsA })
        .then(
          () => null,
          (e: unknown) => e as { data?: { code?: string; message?: string } },
        );
      expect(greska, "akcija je morala da padne bez veze").not.toBeNull();
      expect(greska?.data?.code).toBe("missing_connection");
      expect(greska?.data?.message).toMatch(NIJE_POVEZAN);
    }
  });
});

// ── Google oglasi ───────────────────────────────────────────────────────────

describe("Google oglasi", () => {
  test("osam upita: član samo A ne čita B", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, GADS_UPITI);
  });

  test("neprijavljen poziv pada na svih osam upita", async () => {
    const s = await napraviSvet();
    for (const [fn, args] of GADS_UPITI) {
      await odbijeno(s.t.query(fn, { ...args, workspaceId: s.wsA }), "unauthorized");
    }
  });

  test("posmatrač u A čita sve upite bez greške", async () => {
    const s = await napraviSvet();
    for (const [fn, args] of GADS_UPITI) {
      await expect(
        kao(s, s.viewer).query(fn, { ...args, workspaceId: s.wsA }),
      ).resolves.not.toBeUndefined();
    }
  });

  test("A vidi samo svoje redove: konverzije, budžeti, asseti, search termini", async () => {
    const s = await napraviSvet();
    const sada = 1_760_000_000_000;
    await s.t.run(async (ctx) => {
      for (const [workspaceId, oznaka] of [
        [s.wsA, "a"],
        [s.wsB, "b"],
      ] as const) {
        await ctx.db.insert("gadsConversionActions", {
          workspaceId,
          id: `konv-${oznaka}`,
          name: `Konverzija ${oznaka}`,
          status: "ENABLED",
          primaryForGoal: true,
          syncedAt: sada,
        });
        await ctx.db.insert("gadsBudgets", {
          workspaceId,
          budgetId: `budzet-${oznaka}`,
          name: `Budžet ${oznaka}`,
          amount: 10,
          explicitlyShared: false,
          maxDailySpend: 20,
          syncedAt: sada,
        });
        await ctx.db.insert("gadsAssets", {
          workspaceId,
          assetId: `asset-${oznaka}`,
          type: "TEXT",
          text: `Naslov ${oznaka}`,
          syncedAt: sada,
        });
        await ctx.db.insert("gadsSearchTerms", {
          workspaceId,
          campaignExternalId: `kampanja-${oznaka}`,
          adGroupExternalId: `grupa-${oznaka}`,
          searchTerm: `termin ${oznaka}`,
          status: "NONE",
          date: "2026-10-02",
          syncedAt: sada,
        });
      }
    });

    const kaoViewer = kao(s, s.viewer);
    const konverzije = await kaoViewer.query(api.googleAdsStore.getGoogleAdsConversionActions, {
      workspaceId: s.wsA,
    });
    expect(konverzije.map((k) => k.id)).toEqual(["konv-a"]);

    const asseti = await kaoViewer.query(api.googleAdsStore.getGoogleAdsAssets, {
      workspaceId: s.wsA,
    });
    expect(asseti.assets.map((a) => a.assetId)).toEqual(["asset-a"]);

    const budzeti = await kaoViewer.query(api.googleAdsStore.getGoogleAdsBudgets, {
      workspaceId: s.wsA,
    });
    expect(JSON.stringify(budzeti)).toContain("budzet-a");
    expect(JSON.stringify(budzeti)).not.toContain("budzet-b");

    const termini = await kaoViewer.query(api.googleAdsStore.getGoogleAdsSearchTerms, {
      workspaceId: s.wsA,
    });
    expect(JSON.stringify(termini)).toContain("termin a");
    expect(JSON.stringify(termini)).not.toContain("termin b");

    // Jovan (član oba) u B vidi samo B.
    const uB = await kao(s, s.jovan).query(api.googleAdsStore.getGoogleAdsConversionActions, {
      workspaceId: s.wsB,
    });
    expect(uB.map((k) => k.id)).toEqual(["konv-b"]);
  });
});
