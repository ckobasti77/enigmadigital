/// <reference types="vite/client" />
/**
 * Izolacija grupe C05 (Threads, YouTube, OpenReply): za svaki modul član
 * projekta A ne čita projekat B i ne menja ga, `client_viewer` ne menja ništa,
 * a funkcije vlasnika odbijaju urednika. Sve javne funkcije grupe idu kroz
 * omotače iz `lib/projekat.ts`, pa odbijanje dolazi pre bilo kakvog poziva ka
 * Meti ili Google-u.
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

/** Urednik u A ne prolazi funkcije vlasnika. */
async function urednikNePokrece(s: Svet, akcije: Akcija[]) {
  for (const [fn, args] of akcije) {
    await odbijeno(
      kao(s, s.urednica).action(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );
  }
}

async function urednikNeMenja(s: Svet, izmene: Izmena[]) {
  for (const [fn, args] of izmene) {
    await odbijeno(
      kao(s, s.urednica).mutation(fn, { ...args, workspaceId: s.wsA }),
      "forbidden",
      TREBA_VLASNIK,
    );
  }
}

/** Probni fajl u Convex storage-u (za upload/titl/sličicu). */
async function napraviFajl(s: Svet): Promise<Id<"_storage">> {
  return await s.t.run(async (ctx) => ctx.storage.store(new Blob(["proba"])));
}

// ── Threads ─────────────────────────────────────────────────────────────────

describe("Threads nalog, statistika i levak", () => {
  const UPITI: Upit[] = [
    [api.threadsStore.setupInfo, {}],
    [api.threadsStore.accountOverview, OD],
    [api.threadsStore.followerHistory, OD],
    [api.threadsStore.mediaList, {}],
    [api.threadsStore.demographicsSummary, {}],
    [api.threadsFunnels.getThreadsLinkAttributionSummary, {}],
    [api.threadsFunnels.listUnmatchedUrls, {}],
  ];

  test("član A ne čita B; u A vidi samo objave A, a Jovan u B vidi B", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (const [workspaceId, mediaId] of [
        [s.wsA, "objava-a"],
        [s.wsB, "objava-b"],
      ] as const) {
        await ctx.db.insert("threadsPosts", {
          workspaceId,
          mediaId,
          mediaType: "TEXT_POST",
          timestamp: "2026-10-02T10:00:00+0000",
        });
      }
    });

    await upitiNadBOdbijeni(s, UPITI);

    const uA = await kao(s, s.viewer).query(api.threadsStore.mediaList, { workspaceId: s.wsA });
    expect(uA.map((m) => m.mediaId)).toEqual(["objava-a"]);
    const uB = await kao(s, s.jovan).query(api.threadsStore.mediaList, { workspaceId: s.wsB });
    expect(uB.map((m) => m.mediaId)).toEqual(["objava-b"]);
  });

  test("povezivanje naloga: B odbijen, urednik odbijen, OAuth stanje ne nastaje", async () => {
    const s = await napraviSvet();
    await akcijeNadBOdbijene(s, [[api.threads.threadsAuthorizeUrl, {}]]);
    await urednikNePokrece(s, [[api.threads.threadsAuthorizeUrl, {}]]);
    const stanja = await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(stanja).toEqual([]);
  });
});

describe("Threads automatizacije", () => {
  const NOVO = {
    name: "Proba",
    trigger: "keyword",
    keywords: ["cena"],
    matchType: "contains",
    caseSensitive: false,
    matchAnyKeyword: true,
    matchAnyPost: true,
    actionType: "hide",
    dailyLimit: 10,
    cooldownMinutesPerAuthor: 60,
    maxRepliesPerThread: 1,
  };

  async function upisiPravilo(s: Svet, workspaceId: Id<"workspaces">, name: string) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("threadsAutomations", {
        workspaceId,
        name,
        trigger: "keyword",
        keywords: ["cena"],
        matchType: "contains",
        caseSensitive: false,
        matchAnyKeyword: true,
        matchAnyPost: true,
        actionType: "hide",
        mode: "draft",
        dailyLimit: 10,
        cooldownMinutesPerAuthor: 60,
        maxRepliesPerThread: 1,
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  }

  test("član A ne čita i ne menja pravila B; u A vidi samo pravila A", async () => {
    const s = await napraviSvet();
    const pravA = await upisiPravilo(s, s.wsA, "Pravilo A");
    const pravB = await upisiPravilo(s, s.wsB, "Pravilo B");

    await upitiNadBOdbijeni(s, [
      [api.threadsAutomations.listAutomations, {}],
      [api.threadsAutomations.getAutomation, { id: pravB }],
      [api.threadsAutomations.listAutomationLogs, {}],
    ]);
    await izmeneNadBOdbijene(s, [
      [api.threadsAutomations.createAutomation, NOVO],
      [api.threadsAutomations.updateAutomation, { id: pravB, name: "x" }],
      [api.threadsAutomations.deleteAutomation, { id: pravB }],
      [api.threadsAutomations.toggleAutomation, { id: pravB, isActive: true }],
    ]);

    const lista = await kao(s, s.ana).query(api.threadsAutomations.listAutomations, {
      workspaceId: s.wsA,
    });
    expect(lista.map((p) => p._id)).toEqual([pravA]);

    // Tuđe pravilo kroz sopstveni projekat: nije pronađeno i ostaje netaknuto.
    await expect(
      kao(s, s.ana).mutation(api.threadsAutomations.toggleAutomation, {
        workspaceId: s.wsA,
        id: pravB,
        isActive: true,
      }),
    ).rejects.toThrow(/nije pronađeno/);
    const b = await s.t.run(async (ctx) => ctx.db.get(pravB));
    expect(b?.isActive).toBe(false);
  });

  test("client_viewer čita, ali ne menja pravila", async () => {
    const s = await napraviSvet();
    const pravA = await upisiPravilo(s, s.wsA, "Pravilo A");
    await kao(s, s.viewer).query(api.threadsAutomations.listAutomations, { workspaceId: s.wsA });
    await posmatracNeMenja(s, [
      [api.threadsAutomations.createAutomation, NOVO],
      [api.threadsAutomations.toggleAutomation, { id: pravA, isActive: true }],
      [api.threadsAutomations.deleteAutomation, { id: pravA }],
    ]);
    const a = await s.t.run(async (ctx) => ctx.db.get(pravA));
    expect(a?.isActive).toBe(false);
  });
});

describe("Threads pretraga", () => {
  test("kvota B je nedostupna; kvota A broji samo pretrage A", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      for (const [workspaceId, broj] of [
        [s.wsA, 1],
        [s.wsB, 3],
      ] as const) {
        for (let i = 0; i < broj; i++) {
          await ctx.db.insert("threadsSearchUsage", {
            workspaceId,
            action: "keyword_search",
            timestamp: sada - 1000,
            resultCount: 0,
            countedAgainstQuota: true,
          });
        }
      }
    });

    await upitiNadBOdbijeni(s, [[api.threadsSearch.getSearchQuotaInfo, {}]]);
    await akcijeNadBOdbijene(s, [
      [api.threadsSearch.searchKeyword, { q: "enigma" }],
      [api.threadsSearch.lookupProfile, { username: "enigma" }],
    ]);

    const kvotaA = await kao(s, s.viewer).query(api.threadsSearch.getSearchQuotaInfo, {
      workspaceId: s.wsA,
    });
    expect(kvotaA.keywordSearch.used).toBe(1);
  });

  test("client_viewer ne pretražuje", async () => {
    const s = await napraviSvet();
    await posmatracNePokrece(s, [
      [api.threadsSearch.searchKeyword, { q: "enigma" }],
      [api.threadsSearch.lookupProfile, { username: "enigma" }],
    ]);
  });
});

describe("Threads objava", () => {
  async function upisiPosao(s: Svet, workspaceId: Id<"workspaces">, text: string) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("threadsPublishJobs", {
        workspaceId,
        createdAt: 1,
        updatedAt: 1,
        mediaType: "TEXT",
        text,
        storageIds: [],
        mediaUrls: [],
        contentTypes: [],
        status: "queued",
        attempts: 0,
      }),
    );
  }

  test("član A ne čita i ne menja objave B; tuđ posao kroz A nije pronađen", async () => {
    const s = await napraviSvet();
    const posaoA = await upisiPosao(s, s.wsA, "objava A");
    const posaoB = await upisiPosao(s, s.wsB, "objava B");
    const fajl = await napraviFajl(s);

    await upitiNadBOdbijeni(s, [[api.threadsPublishStore.listJobs, {}]]);
    await izmeneNadBOdbijene(s, [
      [api.threadsPublishStore.generateUploadUrl, {}],
      [api.threadsPublishStore.registerUpload, { storageId: fajl }],
      [api.threadsPublishStore.createJob, { mediaType: "TEXT", text: "x" }],
      [api.threadsPublishStore.cancelJob, { jobId: posaoB }],
      [api.threadsPublishStore.retryJob, { jobId: posaoB }],
    ]);
    await akcijeNadBOdbijene(s, [
      [api.threadsPublish.publishingLimit, {}],
      [api.threadsPublish.repostPost, { mediaId: "m1" }],
      [api.threadsPublish.deletePost, { mediaId: "m1" }],
    ]);

    const lista = await kao(s, s.ana).query(api.threadsPublishStore.listJobs, {
      workspaceId: s.wsA,
    });
    expect(lista.map((j) => j._id)).toEqual([posaoA]);

    await odbijeno(
      kao(s, s.ana).mutation(api.threadsPublishStore.cancelJob, {
        workspaceId: s.wsA,
        jobId: posaoB,
      }),
      "invalid",
      /nije pronađena/,
    );
    const b = await s.t.run(async (ctx) => ctx.db.get(posaoB));
    expect(b?.status).toBe("queued");
  });

  test("client_viewer ne objavljuje; brisanje objave traži vlasnika", async () => {
    const s = await napraviSvet();
    const posaoA = await upisiPosao(s, s.wsA, "objava A");
    await kao(s, s.viewer).query(api.threadsPublishStore.listJobs, { workspaceId: s.wsA });
    await posmatracNeMenja(s, [
      [api.threadsPublishStore.generateUploadUrl, {}],
      [api.threadsPublishStore.createJob, { mediaType: "TEXT", text: "x" }],
      [api.threadsPublishStore.cancelJob, { jobId: posaoA }],
    ]);
    await posmatracNePokrece(s, [
      [api.threadsPublish.publishingLimit, {}],
      [api.threadsPublish.repostPost, { mediaId: "m1" }],
    ]);
    await urednikNePokrece(s, [[api.threadsPublish.deletePost, { mediaId: "m1" }]]);
    const a = await s.t.run(async (ctx) => ctx.db.get(posaoA));
    expect(a?.status).toBe("queued");
  });
});

describe("Threads odgovori", () => {
  const AKCIJE: Akcija[] = [
    [api.threadsReplies.hideReply, { replyId: "r1" }],
    [api.threadsReplies.unhideReply, { replyId: "r1" }],
    [api.threadsReplies.approvePendingReply, { replyId: "r1" }],
    [api.threadsReplies.ignorePendingReply, { replyId: "r1" }],
    [api.threadsReplies.deleteReply, { replyId: "r1" }],
  ];

  test("član A ne čita i ne moderira odgovore B", async () => {
    const s = await napraviSvet();
    await upitiNadBOdbijeni(s, [[api.threadsReplies.listRepliesForPost, { postId: "p1" }]]);
    await izmeneNadBOdbijene(s, [
      [api.threadsReplies.replyToPost, { replyToId: "p1", text: "hvala" }],
    ]);
    await akcijeNadBOdbijene(s, AKCIJE);
    const poslovi = await s.t.run(async (ctx) => ctx.db.query("threadsPublishJobs").collect());
    expect(poslovi).toEqual([]);
  });

  test("client_viewer čita, ali ne odgovara i ne moderira", async () => {
    const s = await napraviSvet();
    await kao(s, s.viewer).query(api.threadsReplies.listRepliesForPost, {
      workspaceId: s.wsA,
      postId: "p1",
    });
    await posmatracNeMenja(s, [
      [api.threadsReplies.replyToPost, { replyToId: "p1", text: "hvala" }],
    ]);
    await posmatracNePokrece(s, AKCIJE);
  });
});

// ── YouTube ─────────────────────────────────────────────────────────────────

describe("YouTube nalog i statistika", () => {
  const UPITI: Upit[] = [
    [api.youtubeStore.dailyTotals, OD],
    [api.youtubeStore.videos, {}],
    [api.youtubeStore.trafficSources, OD],
    [api.youtubeStore.setupInfo, {}],
  ];

  test("član A ne čita B; u A vidi samo dane A, a Jovan u B vidi B", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (const [workspaceId, views] of [
        [s.wsA, 12],
        [s.wsB, 888],
      ] as const) {
        await ctx.db.insert("ytDailyTotals", {
          workspaceId,
          date: "2026-10-02",
          views,
          estimatedMinutesWatched: 0,
          averageViewDuration: 0,
          averageViewPercentage: 0,
          subscribersGained: 0,
          subscribersLost: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          syncedAt: 1,
        });
      }
    });

    await upitiNadBOdbijeni(s, UPITI);

    const uA = await kao(s, s.viewer).query(api.youtubeStore.dailyTotals, {
      ...OD,
      workspaceId: s.wsA,
    });
    expect(uA.map((d) => d.views)).toEqual([12]);
    const uB = await kao(s, s.jovan).query(api.youtubeStore.dailyTotals, {
      ...OD,
      workspaceId: s.wsB,
    });
    expect(uB.map((d) => d.views)).toEqual([888]);
  });

  test("povezivanje kanala: B odbijen, urednik odbijen, OAuth stanje ne nastaje", async () => {
    const s = await napraviSvet();
    await akcijeNadBOdbijene(s, [[api.youtube.youtubeAuthorizeUrl, {}]]);
    await urednikNePokrece(s, [[api.youtube.youtubeAuthorizeUrl, {}]]);
    const stanja = await s.t.run(async (ctx) => ctx.db.query("oauthStates").collect());
    expect(stanja).toEqual([]);
  });
});

describe("YouTube automatizacije komentara", () => {
  const NOVO = {
    name: "Proba",
    keywords: ["cena"],
    matchAnyWord: true,
    wholeWordMatch: false,
    matchAnyVideo: true,
    replyEnabled: true,
    replyMessage: "Hvala!",
    moderationEnabled: false,
    isActive: false,
  };

  async function upisiPravilo(s: Svet, workspaceId: Id<"workspaces">, name: string) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("ytAutomations", {
        workspaceId,
        name,
        keywords: ["cena"],
        matchAnyWord: true,
        wholeWordMatch: false,
        matchAnyVideo: true,
        replyEnabled: true,
        replyMessage: "Hvala!",
        moderationEnabled: false,
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  }

  test("član A ne čita i ne menja pravila B; u A vidi samo pravila A", async () => {
    const s = await napraviSvet();
    const pravA = await upisiPravilo(s, s.wsA, "Pravilo A");
    const pravB = await upisiPravilo(s, s.wsB, "Pravilo B");

    await upitiNadBOdbijeni(s, [
      [api.ytAutomationsApi.listAutomations, {}],
      [api.ytAutomationsApi.listCommentLogs, {}],
      [api.ytAutomationsApi.quotaStatus, {}],
    ]);
    await izmeneNadBOdbijene(s, [
      [api.ytAutomationsApi.createAutomation, NOVO],
      [api.ytAutomationsApi.updateAutomation, { ...NOVO, automationId: pravB }],
      [api.ytAutomationsApi.toggleAutomation, { automationId: pravB, isActive: true }],
      [api.ytAutomationsApi.deleteAutomation, { automationId: pravB }],
    ]);

    const lista = await kao(s, s.ana).query(api.ytAutomationsApi.listAutomations, {
      workspaceId: s.wsA,
    });
    expect(lista.map((p) => p._id)).toEqual([pravA]);

    await expect(
      kao(s, s.ana).mutation(api.ytAutomationsApi.toggleAutomation, {
        workspaceId: s.wsA,
        automationId: pravB,
        isActive: true,
      }),
    ).rejects.toThrow();
    const b = await s.t.run(async (ctx) => ctx.db.get(pravB));
    expect(b?.isActive).toBe(false);
  });

  test("client_viewer čita, ali ne menja pravila", async () => {
    const s = await napraviSvet();
    const pravA = await upisiPravilo(s, s.wsA, "Pravilo A");
    await kao(s, s.viewer).query(api.ytAutomationsApi.quotaStatus, { workspaceId: s.wsA });
    await posmatracNeMenja(s, [
      [api.ytAutomationsApi.createAutomation, NOVO],
      [api.ytAutomationsApi.toggleAutomation, { automationId: pravA, isActive: true }],
      [api.ytAutomationsApi.deleteAutomation, { automationId: pravA }],
    ]);
    const a = await s.t.run(async (ctx) => ctx.db.get(pravA));
    expect(a?.isActive).toBe(false);
  });
});

describe("YouTube media (titlovi, sličice, plejliste, upload, videi, komentari)", () => {
  async function upisiPosao(s: Svet, workspaceId: Id<"workspaces">, title: string) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("ytMediaJobs", {
        workspaceId,
        kind: "upload",
        title,
        status: "pending",
        unitsSpent: 0,
        createdAt: 1,
      }),
    );
  }

  test("član A ne čita i ne menja B; tuđ posao kroz A ostaje netaknut; tuđ fajl se ne briše", async () => {
    const s = await napraviSvet();
    const posaoA = await upisiPosao(s, s.wsA, "Video A");
    const posaoB = await upisiPosao(s, s.wsB, "Video B");
    const fajl = await napraviFajl(s);

    await upitiNadBOdbijeni(s, [
      [api.ytMedia.mediaQuotaStatus, {}],
      [api.ytMedia.recentJobs, {}],
      [api.ytPlaylists.playlists, {}],
      [api.ytUpload.uploadStatus, {}],
    ]);
    await izmeneNadBOdbijene(s, [
      [api.ytCaptions.generateCaptionUploadUrl, {}],
      [api.ytThumbnails.generateThumbnailUploadUrl, {}],
      [api.ytUpload.startUpload, { title: "x", description: "", tags: [], categoryId: "22" }],
      [api.ytUpload.finishUpload, { jobId: posaoB, videoId: "v1", title: "x" }],
      [api.ytUpload.failUpload, { jobId: posaoB, message: "x", sessionOpened: false }],
    ]);
    await akcijeNadBOdbijene(s, [
      [api.ytAuth.issueUploadToken, {}],
      [api.ytCaptions.listCaptions, { videoId: "v1" }],
      [
        api.ytCaptions.uploadCaption,
        { videoId: "v1", storageId: fajl, language: "sr", name: "", isDraft: true },
      ],
      [api.ytCaptions.updateCaption, { captionId: "c1", storageId: fajl }],
      [api.ytCaptions.deleteCaption, { captionId: "c1" }],
      [api.ytComments.deleteComment, { commentId: "k1" }],
      [api.ytPlaylists.listPlaylists, {}],
      [api.ytPlaylists.addVideoToPlaylist, { playlistId: "pl1", videoId: "v1" }],
      [api.ytThumbnails.setThumbnail, { videoId: "v1", storageId: fajl }],
      [api.ytVideos.updateVideoMetadata, { videoId: "v1", title: "x" }],
      [api.ytVideos.deleteVideo, { videoId: "v1" }],
    ]);

    // Odbijen poziv ne dosegne `finally` koji briše fajl.
    const jos = await s.t.run(async (ctx) => ctx.db.system.get(fajl));
    expect(jos).not.toBeNull();

    const poslovi = await kao(s, s.ana).query(api.ytMedia.recentJobs, { workspaceId: s.wsA });
    expect(poslovi.map((j) => j._id)).toEqual([posaoA]);

    // Tuđ posao kroz sopstveni projekat se tiho preskače (kao i ranije).
    await kao(s, s.ana).mutation(api.ytUpload.failUpload, {
      workspaceId: s.wsA,
      jobId: posaoB,
      message: "x",
      sessionOpened: false,
    });
    const b = await s.t.run(async (ctx) => ctx.db.get(posaoB));
    expect(b?.status).toBe("pending");
  });

  test("client_viewer čita, ali ne menja; brisanje videa traži vlasnika", async () => {
    const s = await napraviSvet();
    const fajl = await napraviFajl(s);
    await kao(s, s.viewer).query(api.ytMedia.recentJobs, { workspaceId: s.wsA });
    await posmatracNeMenja(s, [
      [api.ytCaptions.generateCaptionUploadUrl, {}],
      [api.ytThumbnails.generateThumbnailUploadUrl, {}],
      [api.ytUpload.startUpload, { title: "x", description: "", tags: [], categoryId: "22" }],
    ]);
    await posmatracNePokrece(s, [
      [api.ytAuth.issueUploadToken, {}],
      [api.ytCaptions.listCaptions, { videoId: "v1" }],
      [api.ytThumbnails.setThumbnail, { videoId: "v1", storageId: fajl }],
      [api.ytPlaylists.listPlaylists, {}],
      [api.ytVideos.updateVideoMetadata, { videoId: "v1", title: "x" }],
      [api.ytComments.deleteComment, { commentId: "k1" }],
    ]);
    await urednikNePokrece(s, [[api.ytVideos.deleteVideo, { videoId: "v1" }]]);
    const poslovi = await s.t.run(async (ctx) => ctx.db.query("ytMediaJobs").collect());
    expect(poslovi).toEqual([]);
  });
});

// ── OpenReply ───────────────────────────────────────────────────────────────

describe("OpenReply", () => {
  const NOVO = {
    name: "Proba",
    keywords: ["cena"],
    matchAnyWord: true,
    wholeWordMatch: false,
    matchAnyPost: true,
    dmMessage: "Evo linka",
    publicReplyEnabled: false,
    isActive: false,
  };

  async function upisiAutomatizaciju(s: Svet, workspaceId: Id<"workspaces">, name: string) {
    return await s.t.run(async (ctx) =>
      ctx.db.insert("orAutomations", {
        workspaceId,
        name,
        keywords: ["cena"],
        matchAnyWord: true,
        wholeWordMatch: false,
        matchAnyPost: true,
        dmMessage: "Evo linka",
        publicReplyEnabled: false,
        isActive: false,
        createdAt: 1,
        updatedAt: 1,
      }),
    );
  }

  test("član A ne čita i ne menja B; u A vidi samo kampanje i automatizacije A", async () => {
    const s = await napraviSvet();
    const autA = await upisiAutomatizaciju(s, s.wsA, "Automatizacija A");
    const autB = await upisiAutomatizaciju(s, s.wsB, "Automatizacija B");
    await s.t.run(async (ctx) => {
      for (const [workspaceId, name] of [
        [s.wsA, "Kampanja A"],
        [s.wsB, "Kampanja B"],
      ] as const) {
        await ctx.db.insert("orCampaignStats", {
          workspaceId,
          orCampaignId: name,
          name,
          keyword: "cena",
          active: true,
          dmsSent: 0,
          dmsFailed: 0,
          linkClicks: 0,
          ctr: 0,
          syncedAt: 1,
        });
      }
    });

    await upitiNadBOdbijeni(s, [
      [api.openreplyStore.campaigns, {}],
      [api.openreplyStore.daily, OD],
      [api.orAutomationsApi.listAutomations, {}],
      [api.orAutomationsApi.listDmLogs, {}],
      [api.orEngine.status, {}],
      [api.orProfileMenu.getProfileMenu, {}],
    ]);
    await izmeneNadBOdbijene(s, [
      [api.orAutomationsApi.createAutomation, NOVO],
      [api.orAutomationsApi.updateAutomation, { ...NOVO, automationId: autB }],
      [api.orAutomationsApi.toggleAutomation, { automationId: autB, isActive: true }],
      [api.orAutomationsApi.deleteAutomation, { automationId: autB }],
      [api.orEngine.enable, {}],
      [api.orEngine.disable, {}],
      [api.orProfileMenu.saveProfileMenu, { iceBreakers: [], menuItems: [] }],
    ]);
    await akcijeNadBOdbijene(s, [
      [api.orProfileMenu.publish, {}],
      [api.orProfileMenu.unpublish, {}],
      [api.orProfileMenu.fetchLiveProfile, {}],
      [api.orSend.sendInboxMessage, { igsid: "u1", text: "zdravo" }],
      [api.orSend.sendSenderAction, { igsid: "u1", senderAction: "typing_on" }],
      [api.orSend.sendMessageReaction, { igsid: "u1", mid: "m1", action: "react" }],
    ]);

    const kampanje = await kao(s, s.viewer).query(api.openreplyStore.campaigns, {
      workspaceId: s.wsA,
    });
    expect(kampanje.map((k) => k.name)).toEqual(["Kampanja A"]);
    const automatizacije = await kao(s, s.ana).query(api.orAutomationsApi.listAutomations, {
      workspaceId: s.wsA,
    });
    expect(automatizacije.map((a) => a._id)).toEqual([autA]);

    await expect(
      kao(s, s.ana).mutation(api.orAutomationsApi.toggleAutomation, {
        workspaceId: s.wsA,
        automationId: autB,
        isActive: true,
      }),
    ).rejects.toThrow(/nije pronađena/);
    const b = await s.t.run(async (ctx) => ctx.db.get(autB));
    expect(b?.isActive).toBe(false);
  });

  test("client_viewer čita, ali ne menja i ne šalje; motor uključuje samo vlasnik", async () => {
    const s = await napraviSvet();
    const autA = await upisiAutomatizaciju(s, s.wsA, "Automatizacija A");
    await kao(s, s.viewer).query(api.orEngine.status, { workspaceId: s.wsA });
    await posmatracNeMenja(s, [
      [api.orAutomationsApi.createAutomation, NOVO],
      [api.orAutomationsApi.toggleAutomation, { automationId: autA, isActive: true }],
      [api.orProfileMenu.saveProfileMenu, { iceBreakers: [], menuItems: [] }],
    ]);
    await posmatracNePokrece(s, [
      [api.orProfileMenu.publish, {}],
      [api.orSend.sendInboxMessage, { igsid: "u1", text: "zdravo" }],
    ]);
    await urednikNeMenja(s, [
      [api.orEngine.enable, {}],
      [api.orEngine.disable, {}],
    ]);
    const a = await s.t.run(async (ctx) => ctx.db.get(autA));
    expect(a?.isActive).toBe(false);
  });
});
