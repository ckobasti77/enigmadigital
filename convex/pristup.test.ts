/// <reference types="vite/client" />
/**
 * Pristup javnim funkcijama: neprijavljen poziv pada, a član projekta A ne može
 * ništa nad projektom B (ni čitanje, ni upis, ni pokretanje). Jovan kao vlasnik
 * svog projekta i dalje radi sve kao ranije.
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import * as googleAdsStore from "./googleAdsStore";
import * as threadsStore from "./threadsStore";

const modules = import.meta.glob("./**/*.*s");

type Svet = {
  t: TestConvex<typeof schema>;
  wsA: Id<"workspaces">;
  wsB: Id<"workspaces">;
  ana: Id<"users">;
  boban: Id<"users">;
  viewer: Id<"users">;
};

/** Dva projekta, vlasnik svakog, i posmatrač (client_viewer) u A. */
async function napraviSvet(): Promise<Svet> {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const wsA = await ctx.db.insert("workspaces", { name: "Enigma IT", slug: "enigma-it" });
    const wsB = await ctx.db.insert("workspaces", { name: "ScanMe", slug: "scanme" });
    const ana = await ctx.db.insert("users", { email: "ana@enigma.test" });
    const boban = await ctx.db.insert("users", { email: "boban@scanme.test" });
    const viewer = await ctx.db.insert("users", { email: "klijent@enigma.test" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: ana, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsB, userId: boban, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: viewer, role: "client_viewer" });
    return { wsA, wsB, ana, boban, viewer };
  });
  return { t, ...ids };
}

function kao(s: Svet, userId: Id<"users">) {
  return s.t.withIdentity({ subject: `${userId}|sesija-test` });
}

/** Oglas sa celim lancem nalog → kampanja → set u datom projektu. */
async function napraviOglas(s: Svet, workspaceId: Id<"workspaces">): Promise<Id<"ads">> {
  return await s.t.run(async (ctx) => {
    const accountId = await ctx.db.insert("adAccounts", {
      workspaceId,
      provider: "meta_ads",
      externalId: `act_${workspaceId}`,
      name: "Nalog",
      currency: "EUR",
    });
    const campaignId = await ctx.db.insert("adCampaigns", {
      workspaceId,
      accountId,
      externalId: `c_${workspaceId}`,
      name: "Kampanja",
      status: "ACTIVE",
      syncPriority: "cold",
    });
    const adSetId = await ctx.db.insert("adSets", {
      workspaceId,
      campaignId,
      externalId: `s_${workspaceId}`,
      name: "Set",
      status: "ACTIVE",
    });
    return await ctx.db.insert("ads", {
      workspaceId,
      adSetId,
      externalId: `a_${workspaceId}`,
      name: "Tajni oglas",
      status: "ACTIVE",
    });
  });
}

async function napraviPravilo(s: Svet, workspaceId: Id<"workspaces">): Promise<Id<"rules">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("rules", {
      workspaceId,
      name: "CPA čuvar",
      scope: "campaign",
      condition: { metric: "cpa", operator: "gt", value: 1, windowDays: 3, minImpressions: 0 },
      action: "notify",
      cooldownHours: 24,
      enabled: true,
    }),
  );
}

/** Poziv mora da padne sa datim ConvexError kodom. */
async function odbijeno(poziv: Promise<unknown>, kod: "unauthorized" | "forbidden") {
  const greska = await poziv.then(
    () => null,
    (e: unknown) => e,
  );
  expect(greska, "poziv je morao da padne").not.toBeNull();
  const podaci = (greska as { data?: { code?: string } }).data;
  const poruka = greska instanceof Error ? greska.message : String(greska);
  expect(podaci?.code ?? poruka).toContain(kod);
}

const GADS_CITANJA = [
  api.googleAdsStore.getGoogleAdsAssets,
  api.googleAdsStore.getGoogleAdsStructure,
  api.googleAdsStore.getGoogleAdsConversionActions,
  api.googleAdsStore.getGoogleAdsBudgets,
  api.googleAdsStore.getGoogleAdsSearchTerms,
  api.googleAdsStore.getGoogleAdsNegativeKeywords,
  api.googleAdsStore.getGoogleAdsSegments,
] as const;

describe("neprijavljen poziv pada", () => {
  test("pravila, CAPI, atribucija, Google i Meta oglasi", async () => {
    const s = await napraviSvet();
    const adId = await napraviOglas(s, s.wsA);
    const t = s.t;

    await odbijeno(t.query(api.rulesStore.listRules, { workspaceId: s.wsA }), "unauthorized");
    await odbijeno(
      t.mutation(api.rulesStore.dodajIzSablona, { workspaceId: s.wsA, sablon: "skupa_konverzija", prag: 13 }),
      "unauthorized",
    );
    await odbijeno(t.action(api.rules.manualEvaluateRules, { workspaceId: s.wsA }), "unauthorized");
    await odbijeno(t.action(api.rules.manualEvaluateRules, { workspaceId: s.wsA }), "unauthorized");
    for (const fn of GADS_CITANJA) {
      await odbijeno(t.query(fn, { workspaceId: s.wsA }), "unauthorized");
    }
    await odbijeno(t.query(api.metaAdsStore.getAdById, { workspaceId: s.wsA, adId }), "unauthorized");
    await odbijeno(t.query(api.metaCapiStore.getCapiStats, { workspaceId: s.wsA }), "unauthorized");
    await odbijeno(
      t.mutation(api.attribution.recordOpenReplyConversion, { workspaceId: s.wsA }),
      "unauthorized",
    );
    await odbijeno(t.action(api.metaCapi.triggerCapiDispatchAction, { workspaceId: s.wsA }), "unauthorized");
    await odbijeno(t.action(api.instagram.getOAuthConfig, { workspaceId: s.wsA }), "unauthorized");

    // Ništa nije upisano.
    const upisano = await t.run(async (ctx) => ({
      pravila: await ctx.db.query("rules").collect(),
      capi: await ctx.db.query("capiEvents").collect(),
    }));
    expect(upisano).toEqual({ pravila: [], capi: [] });
  });

  test("YouTube titl i sličica ne brišu tuđi fajl bez prijave", async () => {
    const s = await napraviSvet();
    const storageId = await s.t.run(async (ctx) =>
      ctx.storage.store(new Blob(["WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nZdravo"])),
    );

    await odbijeno(
      s.t.action(api.ytCaptions.uploadCaption, {
        workspaceId: s.wsA,
        videoId: "",
        storageId,
        language: "sr",
        name: "",
        isDraft: true,
      }),
      "unauthorized",
    );
    await odbijeno(s.t.action(api.ytCaptions.updateCaption, { workspaceId: s.wsA, captionId: "", storageId }), "unauthorized");
    await odbijeno(s.t.action(api.ytThumbnails.setThumbnail, { workspaceId: s.wsA, videoId: "", storageId }), "unauthorized");

    const fajlPostoji = await s.t.run(
      async (ctx) => (await ctx.storage.get(storageId)) !== null,
    );
    expect(fajlPostoji).toBe(true);
  });
});

describe("član projekta A ne može ništa nad projektom B", () => {
  test("pravila: čitanje, šabloni, ručno pokretanje", async () => {
    const s = await napraviSvet();
    const praviloB = await napraviPravilo(s, s.wsB);
    const ana = kao(s, s.ana);

    await odbijeno(ana.query(api.rulesStore.listRules, { workspaceId: s.wsB }), "forbidden");
    await odbijeno(
      ana.mutation(api.rulesStore.dodajIzSablona, { workspaceId: s.wsB, sablon: "skupa_konverzija", prag: 13 }),
      "forbidden",
    );
    await odbijeno(ana.action(api.rules.manualEvaluateRules, { workspaceId: s.wsB }), "forbidden");

    // Istorija i ručno pokretanje tuđeg pravila preko ID-a ne rade ništa.
    expect(
      await ana.query(api.rulesStore.listRuleFirings, { workspaceId: s.wsA, ruleId: praviloB }),
    ).toEqual([]);
    const rezultat = await ana.action(api.rules.manualEvaluateRules, {
      workspaceId: s.wsA,
      ruleId: praviloB,
    });
    expect(rezultat.evaluatedRulesCount).toBe(0);

    // Sopstveni prostor radi kao ranije (sa i bez prosleđenog ID-a).
    expect(await ana.query(api.rulesStore.listRules, { workspaceId: s.wsA })).toEqual([]);
    await ana.mutation(api.rulesStore.dodajIzSablona, {
      workspaceId: s.wsA,
      sablon: "skupa_konverzija",
      prag: 13,
    });
    const mojaPravila = await ana.query(api.rulesStore.listRules, { workspaceId: s.wsA });
    expect(mojaPravila.length).toBeGreaterThan(0);
    expect(mojaPravila.every((r) => r.workspaceId === s.wsA)).toBe(true);
    const moje = await ana.action(api.rules.manualEvaluateRules, { workspaceId: s.wsA });
    expect(moje.evaluatedRulesCount).toBe(0); // pravilo iz šablona nastaje isključeno

    // B-ova pravila su netaknuta.
    const praviliB = await s.t.run(async (ctx) =>
      ctx.db
        .query("rules")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", s.wsB))
        .collect(),
    );
    expect(praviliB.map((r) => r._id)).toEqual([praviloB]);
  });

  test("ručno pokretanje pravila traži vlasnika", async () => {
    const s = await napraviSvet();
    await odbijeno(
      kao(s, s.viewer).action(api.rules.manualEvaluateRules, { workspaceId: s.wsA }),
      "forbidden",
    );
  });

  test("Google oglasi: sedam čitanja", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    for (const fn of GADS_CITANJA) {
      await odbijeno(ana.query(fn, { workspaceId: s.wsB }), "forbidden");
      await ana.query(fn, { workspaceId: s.wsA });
      await ana.query(fn, { workspaceId: s.wsA });
    }
  });

  test("Meta oglasi: oglas, uvidi i prikačene bitke", async () => {
    const s = await napraviSvet();
    const oglasA = await napraviOglas(s, s.wsA);
    const oglasB = await napraviOglas(s, s.wsB);
    const ana = kao(s, s.ana);

    await odbijeno(
      ana.query(api.metaAdsStore.getAdById, { workspaceId: s.wsA, adId: oglasB }),
      "forbidden",
    );
    expect(
      (await ana.query(api.metaAdsStore.getAdById, { workspaceId: s.wsA, adId: oglasA }))?._id,
    ).toBe(oglasA);
    expect(
      await ana.query(api.metaAdsStore.listAdInsights, {
        workspaceId: s.wsA,
        adId: oglasB,
        from: "2026-01-01",
        to: "2026-12-31",
      }),
    ).toEqual([]);

    const setB = await s.t.run(async (ctx) => (await ctx.db.get(oglasB))!.adSetId);
    await expect(
      ana.mutation(api.metaAdsStore.pinBattle, {
        workspaceId: s.wsA,
        adSetId: setB,
        from: "2026-01-01",
        to: "2026-01-31",
      }),
    ).rejects.toThrow();
  });

  test("CAPI i atribucija", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);

    await odbijeno(ana.query(api.metaCapiStore.getCapiStats, { workspaceId: s.wsB }), "forbidden");
    await odbijeno(
      ana.mutation(api.attribution.recordOpenReplyConversion, { workspaceId: s.wsB, email: "x@y.rs" }),
      "forbidden",
    );
    await odbijeno(ana.action(api.metaCapi.triggerCapiDispatchAction, { workspaceId: s.wsB }), "forbidden");

    const statistika = await ana.query(api.metaCapiStore.getCapiStats, { workspaceId: s.wsA });
    expect(statistika.sentCount).toBe(0);
    const capiB = await s.t.run(async (ctx) =>
      ctx.db
        .query("capiEvents")
        .filter((q) => q.eq(q.field("workspaceId"), s.wsB))
        .collect(),
    );
    expect(capiB).toEqual([]);
  });

  test("leadovi: uvoz, lista zabrane, redovi uvoza", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);

    await odbijeno(
      ana.mutation(api.leadImportStore.createImport, {
        workspaceId: s.wsB,
        fileName: "tudje.xlsx",
        sheetsChosen: [],
        headerRowIndex: 0,
        rows: [],
        skipped: [],
        warnings: [],
      }),
      "forbidden",
    );
    await odbijeno(
      ana.mutation(api.leadSuppressionStore.addSuppression, {
        workspaceId: s.wsB,
        kind: "rekao_ne",
        matchOn: "domain",
        value: "primer.rs",
      }),
      "forbidden",
    );

    // Uvoz projekta B sa jednim redom: indeks po odluci ne zna za prostor, pa
    // je ranije vraćao tuđe redove.
    const uvozB = await s.t.run(async (ctx) => {
      const importId = await ctx.db.insert("leadImports", {
        workspaceId: s.wsB,
        fileName: "b.xlsx",
        uploadedBy: s.boban,
        uploadedAt: Date.now(),
        status: "u_pregledu",
        sheetsChosen: [],
        headerRowIndex: 0,
        rowsParsed: 1,
        rowsSkipped: 0,
        warnings: [],
      });
      await ctx.db.insert("leadImportRows", {
        workspaceId: s.wsB,
        importId,
        sourceSheet: "List1",
        sourceRowIndex: 1,
        parsed: { nazivFirme: "Tajna firma", izvori: [], derivedSignals: [] },
        decision: "nova_firma",
        conflicts: [],
      });
      return importId;
    });
    expect(
      await ana.query(api.leadImportStore.listImportRows, {
        workspaceId: s.wsA,
        importId: uvozB,
        decision: "nova_firma",
      }),
    ).toEqual([]);
    // Vlasnik B i dalje vidi svoj red.
    expect(
      await kao(s, s.boban).query(api.leadImportStore.listImportRows, {
        workspaceId: s.wsB,
        importId: uvozB,
        decision: "nova_firma",
      }),
    ).toHaveLength(1);

    const upisano = await s.t.run(async (ctx) => ({
      uvozi: (await ctx.db.query("leadImports").collect()).filter((u) => u.fileName === "tudje.xlsx"),
      zabrane: await ctx.db.query("leadSuppression").collect(),
    }));
    expect(upisano).toEqual({ uvozi: [], zabrane: [] });
  });
});

describe("fajlovi za objavu ostaju u svom projektu", () => {
  test("tuđ prijavljen fajl ne može da se prijavi ponovo (Instagram i Threads)", async () => {
    const s = await napraviSvet();
    const storageId = await s.t.run(async (ctx) => ctx.storage.store(new Blob(["slika"])));
    const boban = kao(s, s.boban);
    const ana = kao(s, s.ana);

    await boban.mutation(api.instagramPublishStore.registerUpload, { workspaceId: s.wsB, storageId });
    await boban.mutation(api.threadsPublishStore.registerUpload, { workspaceId: s.wsB, storageId });
    await expect(
      ana.mutation(api.instagramPublishStore.registerUpload, { workspaceId: s.wsA, storageId }),
    ).rejects.toThrow();
    await expect(ana.mutation(api.threadsPublishStore.registerUpload, { workspaceId: s.wsA, storageId })).rejects.toThrow();
    // Ponovljena prijava sopstvenog fajla je i dalje u redu.
    await boban.mutation(api.instagramPublishStore.registerUpload, { workspaceId: s.wsB, storageId });

    const racuni = await s.t.run(async (ctx) => ({
      ig: (await ctx.db.query("igPublishUploads").collect()).map((r) => r.workspaceId),
      threads: (await ctx.db.query("threadsPublishUploads").collect()).map((r) => r.workspaceId),
    }));
    expect(racuni).toEqual({ ig: [s.wsB], threads: [s.wsB] });
  });
});

describe("funkcije koje više nisu javne", () => {
  test("Threads brisanje/deautorizacija i Google seed su interne", () => {
    for (const fn of [
      threadsStore.markExpiredByExternalId,
      threadsStore.triggerDataDeletionByExternalId,
      googleAdsStore.seedGoogleAdsData,
      googleAdsStore.clearGoogleAdsSeeds,
    ]) {
      expect((fn as unknown as { isInternal: boolean }).isInternal).toBe(true);
      expect((fn as unknown as { isPublic?: boolean }).isPublic).toBeFalsy();
    }
    expect((threadsStore.getDeletionStatus as unknown as { isPublic: boolean }).isPublic).toBe(true);
  });
});
