/// <reference types="vite/client" />
/**
 * Izolacija grupe C07 (Meta oglasi i CAPI, backend): član projekta A ne čita
 * projekat B i ne menja ga, `client_viewer` čita ali ne menja i ne pokreće,
 * a pisanje nad oglasima, publike i okidač CAPI-ja traže vlasnika. Akcije
 * padaju u omotaču, pre bilo kakvog poziva ka Meti.
 */
import type { FunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_UREDNIK = /urednik ili vlasnik/;
const TREBA_VLASNIK = /samo vlasnik projekta/;
/** Poruka posle omotača: u testnom svetu nijedan projekat nema povezan Meta Ads nalog. */
const NIJE_POVEZAN = /Meta Ads nalog nije povezan za ovaj projekat/;
const OD = { from: "2026-10-01", to: "2026-10-07" };

type Upit = [FunctionReference<"query">, Record<string, unknown>];
type Izmena = [FunctionReference<"mutation">, Record<string, unknown>];
type Akcija = [FunctionReference<"action">, Record<string, unknown>];

type Podaci = {
  nalog: Id<"adAccounts">;
  kampanja: Id<"adCampaigns">;
  set: Id<"adSets">;
  oglas: Id<"ads">;
  kreativa: Id<"adCreatives">;
  publika: Id<"adAudiences">;
  bitka: Id<"pinnedBattles">;
};

/** Ceo lanac nalog → kampanja → set → oglas, uz kreativu, publiku, bitku, uvid i CAPI događaje. */
async function napraviPodatke(
  s: Svet,
  ws: Id<"workspaces">,
  oznaka: string,
  poslatihDogadjaja: number,
): Promise<Podaci> {
  return await s.t.run(async (ctx) => {
    const nalog = await ctx.db.insert("adAccounts", {
      workspaceId: ws,
      provider: "meta_ads",
      externalId: `act_${oznaka}`,
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
    const kreativa = await ctx.db.insert("adCreatives", {
      workspaceId: ws,
      adId: oglas,
      creativeId: `k_${oznaka}`,
      name: `Kreativa ${oznaka}`,
      syncedAt: 1,
    });
    const publika = await ctx.db.insert("adAudiences", {
      workspaceId: ws,
      adAccountId: nalog,
      audienceId: `p_${oznaka}`,
      name: `Publika ${oznaka}`,
      subtype: "CUSTOM",
      syncedAt: 1,
    });
    const bitka = await ctx.db.insert("pinnedBattles", {
      workspaceId: ws,
      adSetId: set,
      from: OD.from,
      to: OD.to,
      pinnedAt: 1,
    });
    await ctx.db.insert("adInsights", {
      workspaceId: ws,
      adId: oglas,
      date: "2026-10-03",
      breakdownHash: "none",
      spend: 10,
      impressions: 100,
      clicks: 5,
    });
    for (let i = 0; i < poslatihDogadjaja; i++) {
      await ctx.db.insert("capiEvents", {
        workspaceId: ws,
        eventName: "Lead",
        eventTime: 1_760_000_000 + i,
        eventId: `ev-${oznaka}-${i}`,
        actionSource: "website",
        sourceKind: "link_redirect",
        status: "sent",
        syncedAt: 1,
      });
    }
    return { nalog, kampanja, set, oglas, kreativa, publika, bitka };
  });
}

/** A ima jedan CAPI događaj, B dva: brojke se ne mešaju. */
async function svetSaPodacima() {
  const s = await napraviSvet();
  const a = await napraviPodatke(s, s.wsA, "a", 1);
  const b = await napraviPodatke(s, s.wsB, "b", 2);
  return { s, a, b };
}

function upiti(p: Podaci): Upit[] {
  return [
    [api.metaAdsStore.getAdById, { adId: p.oglas }],
    [api.metaAdsStore.getAdCreative, { adId: p.oglas }],
    [api.metaAdsStore.listAccounts, {}],
    [api.metaAdsStore.getAccountCurrency, { accountId: p.nalog }],
    [api.metaAdsStore.getCreationContext, {}],
    [api.metaAdsStore.listPagePostsForCreative, {}],
    [api.metaAdsStore.listCampaigns, {}],
    [api.metaAdsStore.listAdSets, { campaignId: p.kampanja }],
    [api.metaAdsStore.listAds, { adSetId: p.set }],
    [api.metaAdsStore.listAdInsights, { adId: p.oglas, ...OD }],
    [api.metaAdsStore.getCampaignsReport, OD],
    [api.metaAdsStore.getCampaignHierarchy, { campaignId: p.kampanja, ...OD }],
    [api.metaAdsStore.getAdDrilldown, { adId: p.oglas, ...OD }],
    [api.metaAdsStore.getHookBattle, { adSetId: p.set, ...OD }],
    [api.metaAdsStore.listPinnedBattles, {}],
    [api.metaAdsStore.quotaStatus, {}],
    [api.metaAdsStore.getAudienceTos, {}],
    [api.metaAdsStore.listAudiences, {}],
    [api.metaCapiStore.getCapiStats, {}],
  ];
}

function izmene(p: Podaci): Izmena[] {
  return [
    [api.metaAdsStore.setHookLabel, { adId: p.oglas, hookLabel: "Hook" }],
    [api.metaAdsStore.pinBattle, { adSetId: p.set, from: "2026-09-01", to: "2026-09-07" }],
    [api.metaAdsStore.unpinBattle, { adSetId: p.set, ...OD }],
  ];
}

/** Akcije koje traži urednik (podrazumevano). */
function akcijeUrednika(p: Podaci): Akcija[] {
  return [
    [api.metaAds.checkAudienceTosAction, {}],
    [api.metaAds.syncAudiencesAction, {}],
    [api.metaAds.getAdPreviewAction, { adId: p.oglas }],
    [api.metaAds.searchTargetingAction, { query: "kafa" }],
    [api.metaAds.listAdPixelsAction, {}],
    [api.metaAds.getDeliveryEstimateAction, {}],
  ];
}

/** Akcije koje traži vlasnik projekta: publike i CAPI okidač. */
function akcijeVlasnika(): Akcija[] {
  return [
    [api.metaAds.createCustomAudienceAction, { name: "Nova publika" }],
    [
      api.metaAds.createLookalikeAudienceAction,
      { name: "Lookalike", seedAudienceId: "123", spec: { country: "RS", ratio: 0.01 } },
    ],
    [api.metaCapi.triggerCapiDispatchAction, {}],
  ];
}

/** Stanje B koje nijedan poziv člana A ne sme da promeni. */
async function stanjeB(s: Svet, b: Podaci) {
  return await s.t.run(async (ctx) => ({
    hookLabel: (await ctx.db.get(b.oglas))?.hookLabel,
    bitke: (await ctx.db.query("pinnedBattles").collect()).filter((r) => r.workspaceId === s.wsB)
      .length,
    publike: (await ctx.db.query("adAudiences").collect()).filter((r) => r.workspaceId === s.wsB)
      .length,
    dogadjaji: (await ctx.db.query("capiEvents").collect()).filter((r) => r.workspaceId === s.wsB)
      .length,
  }));
}

describe("Meta oglasi i CAPI", () => {
  test("član samo projekta A ne čita, ne menja i ne pokreće ništa u B", async () => {
    const { s, b } = await svetSaPodacima();
    const pre = await stanjeB(s, b);
    expect(pre).toEqual({ hookLabel: undefined, bitke: 1, publike: 1, dogadjaji: 2 });

    for (const [fn, args] of upiti(b)) {
      await odbijeno(
        kao(s, s.ana).query(fn, { ...args, workspaceId: s.wsB }),
        "forbidden",
        NEMA_PRISTUP,
      );
    }
    for (const [fn, args] of izmene(b)) {
      await odbijeno(
        kao(s, s.ana).mutation(fn, { ...args, workspaceId: s.wsB }),
        "forbidden",
        NEMA_PRISTUP,
      );
    }
    for (const [fn, args] of [...akcijeUrednika(b), ...akcijeVlasnika()]) {
      await odbijeno(
        kao(s, s.ana).action(fn, { ...args, workspaceId: s.wsB }),
        "forbidden",
        NEMA_PRISTUP,
      );
    }

    expect(await stanjeB(s, b)).toEqual(pre);
  });

  test("neprijavljen i stranac bez članstva ne prolaze nijednu funkciju", async () => {
    const { s, a } = await svetSaPodacima();
    for (const [fn, args] of upiti(a)) {
      await odbijeno(s.t.query(fn, { ...args, workspaceId: s.wsA }), "unauthorized");
      await odbijeno(
        kao(s, s.stranac).query(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        NEMA_PRISTUP,
      );
    }
    for (const [fn, args] of izmene(a)) {
      await odbijeno(s.t.mutation(fn, { ...args, workspaceId: s.wsA }), "unauthorized");
      await odbijeno(
        kao(s, s.stranac).mutation(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        NEMA_PRISTUP,
      );
    }
    for (const [fn, args] of [...akcijeUrednika(a), ...akcijeVlasnika()]) {
      await odbijeno(s.t.action(fn, { ...args, workspaceId: s.wsA }), "unauthorized");
      await odbijeno(
        kao(s, s.stranac).action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        NEMA_PRISTUP,
      );
    }
  });

  test("u A se vide samo podaci A; vlasnik oba projekta u B vidi B", async () => {
    const { s, a, b } = await svetSaPodacima();
    const ana = kao(s, s.ana);

    const kampanjeA = await ana.query(api.metaAdsStore.listCampaigns, { workspaceId: s.wsA });
    expect(kampanjeA.map((k) => k._id)).toEqual([a.kampanja]);
    const naloziA = await ana.query(api.metaAdsStore.listAccounts, { workspaceId: s.wsA });
    expect(naloziA.map((n) => n._id)).toEqual([a.nalog]);
    const publikeA = await ana.query(api.metaAdsStore.listAudiences, { workspaceId: s.wsA });
    expect(publikeA.audiences.map((p) => p._id)).toEqual([a.publika]);
    const bitkeA = await ana.query(api.metaAdsStore.listPinnedBattles, { workspaceId: s.wsA });
    expect(bitkeA.map((p) => p._id)).toEqual([a.bitka]);
    const izvestajA = await ana.query(api.metaAdsStore.getCampaignsReport, {
      workspaceId: s.wsA,
      ...OD,
    });
    expect(JSON.stringify(izvestajA)).toContain("Kampanja a");
    expect(JSON.stringify(izvestajA)).not.toContain("Kampanja b");
    const capiA = await ana.query(api.metaCapiStore.getCapiStats, { workspaceId: s.wsA });
    expect(capiA.sentCount).toBe(1);
    expect(
      (await ana.query(api.metaAdsStore.getAdById, { workspaceId: s.wsA, adId: a.oglas }))?._id,
    ).toBe(a.oglas);

    // Jovan je owner i u A i u B: svaki projekat čita posebno.
    const jovan = kao(s, s.jovan);
    const kampanjeB = await jovan.query(api.metaAdsStore.listCampaigns, { workspaceId: s.wsB });
    expect(kampanjeB.map((k) => k._id)).toEqual([b.kampanja]);
    const publikeB = await jovan.query(api.metaAdsStore.listAudiences, { workspaceId: s.wsB });
    expect(publikeB.audiences.map((p) => p._id)).toEqual([b.publika]);
    const capiB = await jovan.query(api.metaCapiStore.getCapiStats, { workspaceId: s.wsB });
    expect(capiB.sentCount).toBe(2);
    const uvidiB = await jovan.query(api.metaAdsStore.listAdInsights, {
      workspaceId: s.wsB,
      adId: b.oglas,
      ...OD,
    });
    expect(uvidiB).toHaveLength(1);
    const kampanjeAJovan = await jovan.query(api.metaAdsStore.listCampaigns, { workspaceId: s.wsA });
    expect(kampanjeAJovan.map((k) => k._id)).toEqual([a.kampanja]);
  });

  test("tuđ oglas kroz sopstveni projekat: zabranjen ili prazan, B ostaje netaknut", async () => {
    const { s, b } = await svetSaPodacima();
    const ana = kao(s, s.ana);
    const pre = await stanjeB(s, b);

    // Čitanje oglasa drugog projekta baca forbidden, kao i do sada.
    await odbijeno(
      ana.query(api.metaAdsStore.getAdById, { workspaceId: s.wsA, adId: b.oglas }),
      "forbidden",
      NEMA_PRISTUP,
    );
    // Uvidi, kreativa, detalji i hijerarhija tuđeg oglasa ostaju prazni.
    expect(
      await ana.query(api.metaAdsStore.listAdInsights, {
        workspaceId: s.wsA,
        adId: b.oglas,
        ...OD,
      }),
    ).toEqual([]);
    expect(
      await ana.query(api.metaAdsStore.getAdCreative, { workspaceId: s.wsA, adId: b.oglas }),
    ).toBeNull();
    expect(
      await ana.query(api.metaAdsStore.getAdDrilldown, {
        workspaceId: s.wsA,
        adId: b.oglas,
        ...OD,
      }),
    ).toBeNull();
    expect(
      await ana.query(api.metaAdsStore.getHookBattle, {
        workspaceId: s.wsA,
        adSetId: b.set,
        ...OD,
      }),
    ).toBeNull();
    expect(
      await ana.query(api.metaAdsStore.getCampaignHierarchy, {
        workspaceId: s.wsA,
        campaignId: b.kampanja,
        ...OD,
      }),
    ).toBeNull();
    expect(
      await ana.query(api.metaAdsStore.listAdSets, { workspaceId: s.wsA, campaignId: b.kampanja }),
    ).toEqual([]);
    expect(await ana.query(api.metaAdsStore.listAds, { workspaceId: s.wsA, adSetId: b.set })).toEqual(
      [],
    );
    expect(
      await ana.query(api.metaAdsStore.getAccountCurrency, {
        workspaceId: s.wsA,
        accountId: b.nalog,
      }),
    ).toBeNull();
    expect(
      (
        await ana.query(api.metaAdsStore.listAudiences, {
          workspaceId: s.wsA,
          adAccountId: b.nalog,
        })
      ).count,
    ).toBe(0);
    expect(
      await ana.query(api.metaAdsStore.getAudienceTos, {
        workspaceId: s.wsA,
        adAccountId: b.nalog,
      }),
    ).toEqual({ status: "unknown" });

    // Pisanje po tuđem oglasu i setu pada.
    await expect(
      ana.mutation(api.metaAdsStore.setHookLabel, {
        workspaceId: s.wsA,
        adId: b.oglas,
        hookLabel: "Tuđe",
      }),
    ).rejects.toThrow(/Oglas nije pronađen/);
    await expect(
      ana.mutation(api.metaAdsStore.pinBattle, {
        workspaceId: s.wsA,
        adSetId: b.set,
        from: "2026-09-01",
        to: "2026-09-07",
      }),
    ).rejects.toThrow(/Ad Set nije pronađen/);
    // Odpinovanje tuđeg seta ne dira tuđu bitku.
    await ana.mutation(api.metaAdsStore.unpinBattle, {
      workspaceId: s.wsA,
      adSetId: b.set,
      ...OD,
    });
    // Pregled tuđeg oglasa: omotač je prošao, a oglas drugog projekta ne.
    await expect(
      ana.action(api.metaAds.getAdPreviewAction, { workspaceId: s.wsA, adId: b.oglas }),
    ).rejects.toThrow(NIJE_POVEZAN);

    expect(await stanjeB(s, b)).toEqual(pre);
  });

  test("client_viewer čita, ali ne menja i ne pokreće", async () => {
    const { s, a } = await svetSaPodacima();
    const viewer = kao(s, s.viewer);

    for (const [fn, args] of upiti(a)) {
      await viewer.query(fn, { ...args, workspaceId: s.wsA });
    }
    for (const [fn, args] of izmene(a)) {
      await odbijeno(
        viewer.mutation(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_UREDNIK,
      );
    }
    for (const [fn, args] of akcijeUrednika(a)) {
      await odbijeno(
        viewer.action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_UREDNIK,
      );
    }
    for (const [fn, args] of akcijeVlasnika()) {
      await odbijeno(
        viewer.action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }

    const stanje = await s.t.run(async (ctx) => ({
      hookLabel: (await ctx.db.get(a.oglas))?.hookLabel,
      bitke: (await ctx.db.query("pinnedBattles").collect()).filter((r) => r.workspaceId === s.wsA)
        .length,
    }));
    expect(stanje).toEqual({ hookLabel: undefined, bitke: 1 });
  });

  test("publike i CAPI okidač traže vlasnika; urednik radi ostalo", async () => {
    const { s, a } = await svetSaPodacima();
    const urednica = kao(s, s.urednica);

    for (const [fn, args] of akcijeVlasnika()) {
      await odbijeno(
        urednica.action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }

    // Urednik prolazi omotač; zaustavlja ga tek to što A nema povezan Meta Ads nalog.
    for (const [fn, args] of akcijeUrednika(a)) {
      await expect(urednica.action(fn, { ...args, workspaceId: s.wsA })).rejects.toThrow(
        NIJE_POVEZAN,
      );
    }

    // Vlasnik prolazi omotač i na publikama (zaustavlja ga isto), a CAPI okidač ne zove Metu.
    const ana = kao(s, s.ana);
    await expect(
      ana.action(api.metaAds.createCustomAudienceAction, {
        workspaceId: s.wsA,
        name: "Nova publika",
      }),
    ).rejects.toThrow(NIJE_POVEZAN);
    await expect(
      ana.action(api.metaAds.createLookalikeAudienceAction, {
        workspaceId: s.wsA,
        name: "Lookalike",
        seedAudienceId: "123",
        spec: { country: "RS", ratio: 0.01 },
      }),
    ).rejects.toThrow(NIJE_POVEZAN);
    await expect(
      ana.action(api.metaCapi.triggerCapiDispatchAction, { workspaceId: s.wsA }),
    ).resolves.toMatchObject({ sent: 0, rejected: 0 });

    // Urednik piše oznake i bitke u svom projektu.
    await urednica.mutation(api.metaAdsStore.setHookLabel, {
      workspaceId: s.wsA,
      adId: a.oglas,
      hookLabel: "  Hook A  ",
    });
    await urednica.mutation(api.metaAdsStore.pinBattle, {
      workspaceId: s.wsA,
      adSetId: a.set,
      from: "2026-09-01",
      to: "2026-09-07",
    });
    await urednica.mutation(api.metaAdsStore.unpinBattle, {
      workspaceId: s.wsA,
      adSetId: a.set,
      ...OD,
    });
    const stanje = await s.t.run(async (ctx) => ({
      hookLabel: (await ctx.db.get(a.oglas))?.hookLabel,
      bitke: (await ctx.db.query("pinnedBattles").collect())
        .filter((r) => r.workspaceId === s.wsA)
        .map((r) => r.from),
    }));
    expect(stanje).toEqual({ hookLabel: "Hook A", bitke: ["2026-09-01"] });
  });
});
