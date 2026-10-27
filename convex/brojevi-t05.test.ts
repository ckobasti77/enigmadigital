/// <reference types="vite/client" />
/**
 * Pošteni brojevi u Oglasima: nula i jedinica se ne izmišljaju.
 *
 *   - kampanja bez prikaza nema stopu klikova, cenu klika, cenu 1.000 prikaza
 *     ni frekvenciju (bilo je 0 i 1);
 *   - Google red ne nosi doseg, frekvenciju ni video preglede, i kad ih stari
 *     prolaz jeste upisao u bazu (zaštita pri čitanju);
 *   - novi Google prolaz briše te stare vrednosti, a ne upisuje nove;
 *   - Meta red sa dosegom i dalje daje pravu frekvenciju.
 */
import { describe, expect, test } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

const OD = { from: "2026-10-01", to: "2026-10-07" };

type Lanac = {
  nalog: Id<"adAccounts">;
  kampanja: Id<"adCampaigns">;
  set: Id<"adSets">;
  oglas: Id<"ads">;
};

async function lanac(
  s: Svet,
  provider: "meta_ads" | "google_ads",
  oznaka: string,
  uvid: {
    spend: number;
    impressions: number;
    clicks: number;
    reach?: number;
    frequency?: number;
    video3s?: number;
    thruplay?: number;
    videoP25?: number;
  },
): Promise<Lanac> {
  return await s.t.run(async (ctx) => {
    const ws = s.wsA;
    const nalog = await ctx.db.insert("adAccounts", {
      workspaceId: ws,
      provider,
      externalId: `n_${oznaka}`,
      name: `Nalog ${oznaka}`,
      currency: "EUR",
    });
    const kampanja = await ctx.db.insert("adCampaigns", {
      workspaceId: ws,
      accountId: nalog,
      externalId: `c_${oznaka}`,
      name: `Kampanja ${oznaka}`,
      status: "ACTIVE",
      syncPriority: "cold",
    });
    const set = await ctx.db.insert("adSets", {
      workspaceId: ws,
      campaignId: kampanja,
      externalId: `s_${oznaka}`,
      name: `Set ${oznaka}`,
      status: "ACTIVE",
    });
    const oglas = await ctx.db.insert("ads", {
      workspaceId: ws,
      adSetId: set,
      externalId: `a_${oznaka}`,
      name: `Oglas ${oznaka}`,
      status: "ACTIVE",
    });
    await ctx.db.insert("adInsights", {
      workspaceId: ws,
      adId: oglas,
      date: "2026-10-03",
      breakdownHash: "none",
      ...uvid,
    });
    return { nalog, kampanja, set, oglas };
  });
}

describe("pošteni brojevi u Oglasima", () => {
  test("kampanja sa 0 prikaza nema CTR, CPC, CPM ni frekvenciju", async () => {
    const s = await napraviSvet();
    const p = await lanac(s, "meta_ads", "prazna", {
      spend: 0,
      impressions: 0,
      clicks: 0,
    });
    const ana = kao(s, s.ana);
    const izvestaj = await ana.query(api.metaAdsStore.getCampaignsReport, {
      workspaceId: s.wsA,
      ...OD,
    });
    const red = izvestaj.campaigns.find((c) => c._id === p.kampanja)!;
    expect(red.impressions).toBe(0);
    expect(red.spend).toBe(0);
    expect(red.ctr).toBeUndefined();
    expect(red.cpc).toBeUndefined();
    expect(red.cpm).toBeUndefined();
    expect(red.frequency).toBeUndefined();
    expect(izvestaj.totals.overallCtr).toBeUndefined();
    expect(izvestaj.totals.overallFrequency).toBeUndefined();

    const hijerarhija = await ana.query(api.metaAdsStore.getCampaignHierarchy, {
      workspaceId: s.wsA,
      campaignId: p.kampanja,
      ...OD,
    });
    expect(hijerarhija!.campaign.ctr).toBeUndefined();
    expect(hijerarhija!.campaign.frequency).toBeUndefined();
    expect(hijerarhija!.adSets[0].ctr).toBeUndefined();
    expect(hijerarhija!.adSets[0].ads[0].cpm).toBeUndefined();

    const detalj = await ana.query(api.metaAdsStore.getAdDrilldown, {
      workspaceId: s.wsA,
      adId: p.oglas,
      ...OD,
    });
    expect(detalj!.coreMetrics.ctr).toBeUndefined();
    expect(detalj!.coreMetrics.cpc).toBeUndefined();
    expect(detalj!.coreMetrics.frequency).toBeUndefined();
  });

  test("Google red sa dosegom i frekvencijom u bazi ih vraća prazne", async () => {
    const s = await napraviSvet();
    // Ono što su stari prolazi upisivali: doseg = prikazi, frekvencija 1, video 0.
    const p = await lanac(s, "google_ads", "g", {
      spend: 20,
      impressions: 500,
      clicks: 10,
      reach: 500,
      frequency: 1,
      video3s: 0,
      thruplay: 0,
      videoP25: 0,
    });
    const ana = kao(s, s.ana);

    const izvestaj = await ana.query(api.metaAdsStore.getCampaignsReport, {
      workspaceId: s.wsA,
      ...OD,
    });
    const red = izvestaj.campaigns.find((c) => c._id === p.kampanja)!;
    expect(red.provider).toBe("google_ads");
    expect(red.reach).toBeUndefined();
    expect(red.frequency).toBeUndefined();
    expect(red.video3s).toBeUndefined();
    expect(red.thruplay).toBeUndefined();
    // Izmereno ostaje izmereno.
    expect(red.impressions).toBe(500);
    expect(red.ctr).toBe(0.02);

    const hijerarhija = await ana.query(api.metaAdsStore.getCampaignHierarchy, {
      workspaceId: s.wsA,
      campaignId: p.kampanja,
      ...OD,
    });
    expect(hijerarhija!.campaign.reach).toBeUndefined();
    expect(hijerarhija!.campaign.frequency).toBeUndefined();
    expect(hijerarhija!.adSets[0].ads[0].hookRate).toBeUndefined();

    const detalj = await ana.query(api.metaAdsStore.getAdDrilldown, {
      workspaceId: s.wsA,
      adId: p.oglas,
      ...OD,
    });
    expect(detalj!.coreMetrics.reach).toBeUndefined();
    expect(detalj!.coreMetrics.frequency).toBeUndefined();
    expect(detalj!.videoFunnel.video3s).toBeUndefined();
    expect(detalj!.videoFunnel.videoP25).toBeUndefined();

    const bitka = await ana.query(api.metaAdsStore.getHookBattle, {
      workspaceId: s.wsA,
      adSetId: p.set,
      ...OD,
    });
    const verzija = bitka!.versions[0];
    expect(verzija.frequency).toBeUndefined();
    expect(verzija.hookRate).toBeUndefined();
    expect(
      verzija.dailySeries.find((d) => d.date === "2026-10-03")!.hookRate,
    ).toBeUndefined();
  });

  test("Meta red sa dosegom vraća pravu frekvenciju", async () => {
    const s = await napraviSvet();
    const p = await lanac(s, "meta_ads", "m", {
      spend: 30,
      impressions: 1000,
      clicks: 25,
      reach: 400,
      video3s: 300,
    });
    const ana = kao(s, s.ana);
    const izvestaj = await ana.query(api.metaAdsStore.getCampaignsReport, {
      workspaceId: s.wsA,
      ...OD,
    });
    const red = izvestaj.campaigns.find((c) => c._id === p.kampanja)!;
    expect(red.reach).toBe(400);
    expect(red.frequency).toBe(2.5);
    expect(red.ctr).toBe(0.025);
    expect(red.cpc).toBe(1.2);
    expect(red.cpm).toBe(30);
    expect(red.video3s).toBe(300);
    expect(izvestaj.totals.overallFrequency).toBe(2.5);
  });

  test("ukupna frekvencija ne meša Google prikaze bez dosega", async () => {
    const s = await napraviSvet();
    await lanac(s, "meta_ads", "m", {
      spend: 30,
      impressions: 1000,
      clicks: 25,
      reach: 400,
    });
    await lanac(s, "google_ads", "g", {
      spend: 20,
      impressions: 5000,
      clicks: 10,
      reach: 5000,
      frequency: 1,
    });
    const izvestaj = await kao(s, s.ana).query(
      api.metaAdsStore.getCampaignsReport,
      { workspaceId: s.wsA, ...OD },
    );
    expect(izvestaj.totals.overallFrequency).toBe(2.5);
    expect(izvestaj.totals.totalImpressions).toBe(6000);
  });

  test("Google prolaz briše stare izmišljene vrednosti i ne upisuje nove", async () => {
    const s = await napraviSvet();
    const unos = {
      workspaceId: s.wsA,
      account: { externalId: "123-456-7890", name: "Google nalog", currency: "EUR" },
      campaigns: [
        {
          externalId: "gc1",
          name: "Pretraga",
          status: "ENABLED",
          syncPriority: "cold" as const,
        },
      ],
      adGroups: [
        {
          externalId: "gg1",
          campaignExternalId: "gc1",
          name: "Grupa",
          status: "ENABLED",
        },
      ],
      ads: [
        { externalId: "ga1", adGroupExternalId: "gg1", name: "Oglas", status: "ENABLED" },
      ],
      insights: [
        { adExternalId: "ga1", date: "2026-10-03", spend: 12, impressions: 300, clicks: 9 },
      ],
      keywordQuality: [],
    };

    await s.t.mutation(internal.googleAdsStore.upsertGoogleAdsData, unos);
    const prvi = await s.t.run(async (ctx) =>
      ctx.db
        .query("adInsights")
        .withIndex("by_workspace_date", (q) => q.eq("workspaceId", s.wsA))
        .collect(),
    );
    expect(prvi).toHaveLength(1);
    for (const polje of ["reach", "frequency", "video3s", "thruplay", "videoP25", "videoP100"] as const) {
      expect(prvi[0][polje]).toBeUndefined();
    }

    // Stari prolaz je upisao doseg = prikazi, frekvenciju 1 i video nule.
    await s.t.run(async (ctx) => {
      await ctx.db.patch(prvi[0]._id, {
        reach: 300,
        frequency: 1,
        video3s: 0,
        thruplay: 0,
        videoP25: 0,
        videoP100: 0,
      });
    });

    await s.t.mutation(internal.googleAdsStore.upsertGoogleAdsData, unos);
    const drugi = await s.t.run(async (ctx) => ctx.db.get(prvi[0]._id));
    expect(drugi!.impressions).toBe(300);
    expect(drugi!.clicks).toBe(9);
    for (const polje of ["reach", "frequency", "video3s", "thruplay", "videoP25", "videoP100"] as const) {
      expect(drugi![polje]).toBeUndefined();
    }
  });
});
