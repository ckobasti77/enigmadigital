/// <reference types="vite/client" />
/**
 * Izolacija grupe C04 (analitika, atribucija, Instagram, Facebook): za svaki
 * modul član projekta A ne čita projekat B i ne menja ga, `client_viewer` ne
 * menja ništa, a funkcije vlasnika odbijaju urednika. Sve javne funkcije grupe
 * idu kroz omotače iz `lib/projekat.ts`, pa odbijanje dolazi pre bilo kakvog
 * poziva ka Meti ili Google-u.
 */
import type { FunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_UREDNIK = /urednik ili vlasnik/;
const TREBA_VLASNIK = /samo vlasnik projekta/;
const OD = { from: "2026-10-01", to: "2026-10-07" };

type Upit = [FunctionReference<"query">, Record<string, unknown>];
type Izmena = [FunctionReference<"mutation">, Record<string, unknown>];
type Akcija = [FunctionReference<"action">, Record<string, unknown>];

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

async function akcijeNadBOdbijene(s: Svet, akcije: Akcija[]) {
  for (const [fn, args] of akcije) {
    await odbijeno(
      kao(s, s.ana).action(fn, { ...args, workspaceId: s.wsB }),
      "forbidden",
      NEMA_PRISTUP,
    );
  }
}

/** `client_viewer` u A ne pokreće nijednu akciju sa liste (podrazumevano urednik). */
async function posmatracNePokrece(s: Svet, akcije: Akcija[]) {
  for (const [fn, args] of akcije) {
    await odbijeno(
      kao(s, s.viewer).action(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_UREDNIK,
    );
  }
}

async function posmatracNeMenja(s: Svet, izmene: Izmena[]) {
  for (const [fn, args] of izmene) {
    await odbijeno(
      kao(s, s.viewer).mutation(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_UREDNIK,
    );
  }
}

describe("analitika (GA4)", () => {
  const UPITI: Upit[] = [
    [api.analytics.daily, OD],
    [api.analytics.traffic, OD],
    [api.analytics.reportMeta, {}],
    [api.analytics.acquisitionByChannel, OD],
    [api.analytics.acquisitionBySource, { ...OD, scope: "session" }],
    [api.analytics.contentPages, OD],
    [api.analytics.landingPages, OD],
    [api.analytics.eventsByName, OD],
    [api.analytics.audienceDevice, OD],
    [api.analytics.audienceGeo, { ...OD, level: "country" }],
    [api.analytics.timeOfDay, OD],
    [api.analytics.realtimeSnapshot, {}],
    [api.analytics.cohortRetention, {}],
    [api.analytics.adsPerformance, { ...OD, level: "campaign" }],
    [api.analytics.ga4Configuration, {}],
  ];
  const AKCIJE: Akcija[] = [
    [api.ga4.refreshRealtime, {}],
    [api.ga4.refreshGa4Config, {}],
  ];

  test("član A ne čita B i ne pokreće osvežavanje u B; u A vidi samo A", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (const [workspaceId, sessions] of [
        [s.wsA, 11],
        [s.wsB, 999],
      ] as const) {
        await ctx.db.insert("ga4Daily", {
          workspaceId,
          date: "2026-10-02",
          sessions,
          activeUsers: 1,
          newUsers: 1,
        });
      }
    });

    await upitiNadBOdbijeni(s, UPITI);
    await akcijeNadBOdbijene(s, AKCIJE);

    const redovi = await kao(s, s.ana).query(api.analytics.daily, { ...OD, workspaceId: s.wsA });
    expect(redovi.map((r) => r.sessions)).toEqual([11]);
    // Jovan je član oba projekta i u B vidi baš B.
    const uB = await kao(s, s.jovan).query(api.analytics.daily, { ...OD, workspaceId: s.wsB });
    expect(uB.map((r) => r.sessions)).toEqual([999]);
  });

  test("client_viewer čita, ali ne pokreće osvežavanje", async () => {
    const s = await napraviSvet();
    await kao(s, s.viewer).query(api.analytics.daily, { ...OD, workspaceId: s.wsA });
    await posmatracNePokrece(s, AKCIJE);
  });
});

describe("atribucija", () => {
  test("član A ne čita izveštaj B i ne upisuje konverziju u B", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, [[api.attribution.report, OD]]);
    await izmeneNadBOdbijene(s, [
      [api.attribution.recordOpenReplyConversion, { email: "x@y.rs" }],
    ]);
    await posmatracNeMenja(s, [
      [api.attribution.recordOpenReplyConversion, { email: "x@y.rs" }],
    ]);
    const capi = await s.t.run(async (ctx) => ctx.db.query("capiEvents").collect());
    expect(capi).toEqual([]);

    // U sopstvenom projektu konverzija ide u A.
    await kao(s, s.urednica).mutation(api.attribution.recordOpenReplyConversion, {
      workspaceId: s.wsA,
      email: "kupac@primer.rs",
    });
    const posle = await s.t.run(async (ctx) => ctx.db.query("capiEvents").collect());
    expect(posle.map((e) => e.workspaceId)).toEqual([s.wsA]);
  });
});

describe("Instagram nalog i sadržaj", () => {
  const UPITI: Upit[] = [
    [api.instagramStore.dailyHistory, OD],
    [api.instagramStore.metricSeries, { ...OD, metric: "views" }],
    [api.instagramStore.mediaList, {}],
    [api.instagramStore.getMediaDetail, { mediaId: "m1" }],
    [api.instagramStore.getDemographicsSummary, { metric: "follower", timeframe: "this_month" }],
    [api.instagramStore.getStoriesOverview, {}],
  ];
  const VLASNIK: Akcija[] = [
    [api.instagram.getOAuthConfig, {}],
    [api.instagram.getOAuthUrl, { povratakOrigin: "https://x.test" }],
    [api.instagram.completeOAuth, { code: "c" }],
  ];

  test("član A ne čita B i ne povezuje nalog u B", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, UPITI);
    await akcijeNadBOdbijene(s, [...VLASNIK, [api.instagram.pollStoriesManual, {}]]);
    const stanja = await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(stanja).toEqual([]);
  });

  test("povezivanje naloga traži vlasnika; priče osvežava urednik", async () => {
    const s = await napraviSvet();
    for (const [fn, args] of VLASNIK) {
      await odbijeno(
        kao(s, s.urednica).action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }
    await posmatracNePokrece(s, [[api.instagram.pollStoriesManual, {}]]);
    // Urednik prolazi omotač; bez povezanog naloga dobija poruku o vezi.
    await odbijeno(
      kao(s, s.urednica).action(api.instagram.pollStoriesManual, { workspaceId: s.wsA }),
      "invalid",
      /nije povezan/,
    );
  });
});

describe("Instagram inbox", () => {
  test("član A ne čita razgovore B i ne označava ih kao pročitane", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (const workspaceId of [s.wsA, s.wsB]) {
        await ctx.db.insert("orConversations", {
          workspaceId,
          platform: "instagram",
          igsid: "osoba-1",
          unreadCount: 3,
          createdAt: 1,
        });
      }
    });

    await upitiNadBOdbijeni(s, [
      [api.instagramInboxStore.listConversations, {}],
      [api.instagramInboxStore.getConversation, { igsid: "osoba-1" }],
      [api.instagramInboxStore.listMessages, { igsid: "osoba-1" }],
    ]);
    await izmeneNadBOdbijene(s, [[api.instagramInboxStore.markSeen, { igsid: "osoba-1" }]]);
    await akcijeNadBOdbijene(s, [[api.instagramInbox.syncConversations, {}]]);
    await posmatracNeMenja(s, [[api.instagramInboxStore.markSeen, { igsid: "osoba-1" }]]);
    await posmatracNePokrece(s, [[api.instagramInbox.syncConversations, {}]]);

    // Ista osoba u A: označavanje u A ne dira B.
    await kao(s, s.ana).mutation(api.instagramInboxStore.markSeen, {
      workspaceId: s.wsA,
      igsid: "osoba-1",
    });
    const neprocitano = await s.t.run(async (ctx) =>
      (await ctx.db.query("orConversations").collect()).map((r) => [r.workspaceId, r.unreadCount]),
    );
    expect(neprocitano).toEqual([
      [s.wsA, 0],
      [s.wsB, 3],
    ]);
  });
});

describe("Instagram objava", () => {
  async function posaoU(s: Svet, workspaceId: Id<"workspaces">, createdBy: Id<"users">) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("igPublishJobs", {
        workspaceId,
        kind: "IMAGE",
        storageIds: [],
        mediaUrls: [],
        contentTypes: [],
        status: "queued",
        attempts: 0,
        createdAt: 1,
        updatedAt: 1,
        createdBy,
      }),
    );
  }

  test("član A ne vidi, ne pravi i ne otkazuje objave B", async () => {
    const s = await napraviSvet();
    const posaoB = await posaoU(s, s.wsB, s.boban);
    const storageId = await s.t.run(async (ctx) => ctx.storage.store(new Blob(["slika"])));

    await upitiNadBOdbijeni(s, [[api.instagramPublishStore.listJobs, {}]]);
    await izmeneNadBOdbijene(s, [
      [api.instagramPublishStore.generateUploadUrl, {}],
      [api.instagramPublishStore.registerUpload, { storageId }],
      [api.instagramPublishStore.createJob, { kind: "IMAGE", storageIds: [storageId] }],
      [api.instagramPublishStore.cancelJob, { jobId: posaoB }],
      [api.instagramPublishStore.retryJob, { jobId: posaoB }],
    ]);
    await akcijeNadBOdbijene(s, [[api.instagramPublish.publishingLimit, {}]]);
    await posmatracNeMenja(s, [
      [api.instagramPublishStore.generateUploadUrl, {}],
      [api.instagramPublishStore.cancelJob, { jobId: posaoB }],
    ]);
    await posmatracNePokrece(s, [[api.instagramPublish.publishingLimit, {}]]);

    // Tuđ posao preko sopstvenog projekta: nije pronađen, ostaje netaknut.
    await odbijeno(
      kao(s, s.ana).mutation(api.instagramPublishStore.cancelJob, {
        workspaceId: s.wsA,
        jobId: posaoB,
      }),
      "invalid",
      /nije pronađena/,
    );
    const posao = await s.t.run(async (ctx) => ctx.db.get(posaoB));
    expect(posao?.status).toBe("queued");

    // Spisak u A ne sadrži posao B.
    const spisakA = await kao(s, s.ana).query(api.instagramPublishStore.listJobs, {
      workspaceId: s.wsA,
    });
    expect(JSON.stringify(spisakA)).not.toContain(posaoB);
  });
});

describe("Instagram komentari i spominjanja", () => {
  const AKCIJE: Akcija[] = [
    [api.igComments.replyToComment, { commentId: "c1", message: "hvala" }],
    [api.igComments.setCommentHidden, { commentId: "c1", hidden: true }],
    [api.igComments.deleteComment, { commentId: "c1" }],
    [api.igComments.bulkSetHidden, { commentIds: ["c1"], hidden: true }],
    [api.igComments.bulkDelete, { commentIds: ["c1"] }],
    [api.igComments.setCommentsEnabled, { mediaId: "m1", enabled: false }],
  ];

  test("član A ne čita komentare i spominjanja B i ne moderira ih", async () => {
    const s = await napraviSvet();
    const spominjanjeB = await s.t.run(async (ctx) => {
      for (const [workspaceId, text] of [
        [s.wsA, "komentar A"],
        [s.wsB, "komentar B"],
      ] as const) {
        await ctx.db.insert("igComments", {
          workspaceId,
          mediaId: "m1",
          commentId: `c-${text}`,
          text,
          username: "pratilac",
          timestamp: 1,
          hidden: false,
          isOurs: false,
          repliedByUs: false,
          syncedAt: 1,
        });
      }
      return await ctx.db.insert("igMentions", {
        workspaceId: s.wsB,
        kind: "caption",
        mediaId: "m9",
        text: "@enigma",
        timestamp: 1,
        contextState: "value",
        syncedAt: 1,
      });
    });

    await upitiNadBOdbijeni(s, [
      [api.igCommentsStore.listThreads, { filter: "all" }],
      [api.igCommentsStore.filterCounts, {}],
      [api.igMentionsStore.listMentions, {}],
    ]);
    await akcijeNadBOdbijene(s, [
      ...AKCIJE,
      [api.igMentions.replyToMention, { mentionId: spominjanjeB, message: "hvala" }],
    ]);
    await posmatracNePokrece(s, [
      ...AKCIJE,
      [api.igMentions.replyToMention, { mentionId: spominjanjeB, message: "hvala" }],
    ]);

    const nitiA = await kao(s, s.ana).query(api.igCommentsStore.listThreads, {
      workspaceId: s.wsA,
      filter: "all",
    });
    expect(JSON.stringify(nitiA)).toContain("komentar A");
    expect(JSON.stringify(nitiA)).not.toContain("komentar B");
    const spominjanjaA = await kao(s, s.ana).query(api.igMentionsStore.listMentions, {
      workspaceId: s.wsA,
    });
    expect(spominjanjaA).toEqual([]);

    // Urednik prolazi omotač; bez Instagram veze u A ne stiže do Mete.
    await odbijeno(
      kao(s, s.urednica).action(api.igComments.setCommentHidden, {
        workspaceId: s.wsA,
        commentId: "c-komentar A",
        hidden: true,
      }),
      "invalid",
    );
    const komentari = await s.t.run(async (ctx) =>
      (await ctx.db.query("igComments").collect()).map((c) => c.hidden),
    );
    expect(komentari).toEqual([false, false]);
  });
});

describe("Facebook", () => {
  const UPITI: Upit[] = [
    [api.facebookStore.dailyHistory, OD],
    [api.facebookStore.postsList, {}],
    [api.facebookStore.setupInfo, {}],
    [api.facebookStore.pageInfo, {}],
    [api.fbCommentsStore.listThreads, { filter: "all" }],
    [api.fbCommentsStore.filterCounts, {}],
  ];
  const VLASNIK: Akcija[] = [
    [api.facebook.getOAuthUrl, { povratakOrigin: "https://x.test" }],
    [api.facebook.listPages, {}],
    [api.facebook.selectPage, { pageId: "123" }],
    [api.facebook.connectWithSystemUserToken, { systemUserToken: "t".repeat(20), pageId: "123" }],
    [api.facebook.refreshTokenNow, {}],
  ];
  const MODERACIJA: Akcija[] = [
    [api.fbComments.replyToComment, { commentId: "c1", message: "hvala" }],
    [api.fbComments.setCommentHidden, { commentId: "c1", hidden: true }],
    [api.fbComments.deleteComment, { commentId: "c1" }],
    [api.fbComments.setCommentLiked, { commentId: "c1", liked: true }],
    [api.fbComments.setPostLiked, { postId: "p1", liked: true }],
    [api.fbComments.bulkSetHidden, { commentIds: ["c1"], hidden: true }],
    [api.fbComments.bulkDelete, { commentIds: ["c1"] }],
  ];

  test("član A ne čita stranicu B, ne povezuje je i ne moderira njene komentare", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (const [workspaceId, text] of [
        [s.wsA, "fb A"],
        [s.wsB, "fb B"],
      ] as const) {
        await ctx.db.insert("fbComments", {
          workspaceId,
          postId: "p1",
          commentId: `c-${text}`,
          text,
          authorName: "Posetilac",
          timestamp: 1,
          hidden: false,
          isOurs: false,
          repliedByUs: false,
          syncedAt: 1,
        });
      }
    });

    await upitiNadBOdbijeni(s, UPITI);
    await akcijeNadBOdbijene(s, [...VLASNIK, ...MODERACIJA]);
    await posmatracNePokrece(s, MODERACIJA);

    const nitiA = await kao(s, s.ana).query(api.fbCommentsStore.listThreads, {
      workspaceId: s.wsA,
      filter: "all",
    });
    expect(JSON.stringify(nitiA)).toContain("fb A");
    expect(JSON.stringify(nitiA)).not.toContain("fb B");
    const stanja = await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(stanja).toEqual([]);
  });

  test("veza stranice traži vlasnika", async () => {
    const s = await napraviSvet();
    for (const [fn, args] of VLASNIK) {
      await odbijeno(
        kao(s, s.urednica).action(fn, { ...args, workspaceId: s.wsA }),
        "forbidden",
        TREBA_VLASNIK,
      );
    }
  });
});

describe("dnevnik moderacije i stanje Meta sinhronizacije", () => {
  test("član A ne čita dnevnik ni brojače B; u A vidi samo A", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (const [workspaceId, userId, text] of [
        [s.wsA, s.ana, "zapis A"],
        [s.wsB, s.boban, "zapis B"],
      ] as const) {
        await ctx.db.insert("igModerationLogs", {
          workspaceId,
          userId,
          action: "hide",
          text,
          status: "done",
          createdAt: 1,
        });
        await ctx.db.insert("metaSyncJobs", {
          workspaceId,
          provider: "meta_ig",
          job: text,
          lastRunAt: 1,
        });
      }
    });

    await upitiNadBOdbijeni(s, [
      [api.moderationLog.listModerationLogs, {}],
      [api.metaSyncStore.rateLimit, {}],
      [api.metaSyncStore.jobStatus, {}],
    ]);

    const dnevnik = await kao(s, s.viewer).query(api.moderationLog.listModerationLogs, {
      workspaceId: s.wsA,
    });
    expect(JSON.stringify(dnevnik)).toContain("zapis A");
    expect(JSON.stringify(dnevnik)).not.toContain("zapis B");
    const poslovi = await kao(s, s.viewer).query(api.metaSyncStore.jobStatus, {
      workspaceId: s.wsA,
    });
    expect(poslovi.map((p) => p.job)).toEqual(["zapis A"]);
  });
});
