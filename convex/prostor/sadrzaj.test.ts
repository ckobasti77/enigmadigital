/// <reference types="vite/client" />
/**
 * Ideje, beleške, mape, tabele, prilozi i AI posle spajanja (SPAJANJE S05,
 * plan S01 §5.4):
 * - ključ AI provajdera ne izlazi ni iz jedne javne funkcije;
 * - AI provajdere vodi samo vlasnik projekta koji je i vlasnik platforme (D14);
 * - dokument jednog projekta se ne dira pod drugim projektom;
 * - client_viewer ne ulazi ni u jedan modul (O5);
 * - prilog i avatar ne primaju tuđ blob i ne brišu ga;
 * - „Pošalji u projekat“ prima beleške iz drugog mog projekta, ali traži bar
 *   urednika i u izvoru i u cilju.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import * as aiModul from "./aiProviders";
import { insertProfil, kao } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const KLJUC = "sk-tajni-kljuc-0123456789";
const NOV_KLJUC = "sk-drugi-kljuc-9876543210";

async function osoba(ctx: MutationCtx, ime: string, role: "admin" | "member") {
  const email = `${ime}@enigma.test`;
  const userId = await ctx.db.insert("users", { email, name: ime });
  const now = Date.now();
  const profileId = await insertProfil(ctx, {
    userId,
    displayName: ime,
    email,
    role,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { userId, profileId };
}

async function projekat(ctx: MutationCtx, ime: string) {
  // „klijent“: owner ovde nije vlasnik platforme, pa nema prečice kroz P7.
  const workspaceId = await ctx.db.insert("workspaces", {
    name: ime,
    slug: ime.toLowerCase(),
    vrsta: "klijent",
  });
  const areaId = await ctx.db.insert("areas", {
    workspaceId,
    key: "dev",
    label: "Razvoj",
    position: 0,
    createdAt: Date.now(),
  });
  return { workspaceId, areaId };
}

/**
 * Ja: vlasnik platforme, owner u A i B, client_viewer u C.
 * Kolega: urednik u A, owner u B (nije vlasnik platforme).
 * Gost: client_viewer u A.
 */
async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const ja = await osoba(ctx, "ja", "admin");
    const kolega = await osoba(ctx, "kolega", "member");
    const gost = await osoba(ctx, "gost", "member");
    const A = await projekat(ctx, "A");
    const B = await projekat(ctx, "B");
    const C = await projekat(ctx, "C");
    const clan = (
      workspaceId: Id<"workspaces">,
      userId: Id<"users">,
      role: "owner" | "urednik" | "client_viewer",
    ) => ctx.db.insert("members", { workspaceId, userId, role });
    await clan(A.workspaceId, ja.userId, "owner");
    await clan(A.workspaceId, kolega.userId, "urednik");
    await clan(A.workspaceId, gost.userId, "client_viewer");
    await clan(B.workspaceId, ja.userId, "owner");
    await clan(B.workspaceId, kolega.userId, "owner");
    await clan(C.workspaceId, ja.userId, "client_viewer");
    return { ja, kolega, gost, A, B, C };
  });
  const asJa = kao(t, s.ja.userId);
  const asKolega = kao(t, s.kolega.userId);
  const asGost = kao(t, s.gost.userId);

  const stranica = (kind: "table" | "file" | "note") =>
    asJa.mutation(api.prostor.pages.create, {
      workspaceId: s.A.workspaceId,
      areaId: s.A.areaId,
      parentPageId: null,
      kind,
      title: `Stranica ${kind}`,
    });

  return { t, ...s, asJa, asKolega, asGost, stranica };
}

const stavkaDrugogProjekta = /nije pronađena u ovom projektu/;

describe("AI provajderi: ključ i pristup", () => {
  test("ključ ne izlazi ni iz jedne javne funkcije; čita ga samo interna", async () => {
    const s = await svet();
    const A = s.A.workspaceId;

    // Spisak javnih funkcija je ugovor: nova javna funkcija mora ući u ovaj test.
    const javne = Object.entries(aiModul)
      .filter(([, fn]) => (fn as { isPublic?: boolean }).isPublic === true)
      .map(([ime]) => ime)
      .sort();
    expect(javne).toEqual(["create", "list", "remove", "setDefault", "update"]);

    const odgovori: unknown[] = [];
    const prvi = await s.asJa.mutation(api.prostor.aiProviders.create, {
      workspaceId: A,
      label: "Glavni",
      baseUrl: "https://api.example.test/v1",
      model: "model-1",
      apiKey: KLJUC,
    });
    odgovori.push(prvi);
    const drugi = await s.asJa.mutation(api.prostor.aiProviders.create, {
      workspaceId: A,
      label: "Rezervni",
      baseUrl: "https://api.example.test/v1",
      model: "model-2",
      apiKey: KLJUC,
    });
    odgovori.push(drugi);
    odgovori.push(
      await s.asJa.query(api.prostor.aiProviders.list, { workspaceId: A }),
    );
    odgovori.push(
      await s.asJa.mutation(api.prostor.aiProviders.update, {
        workspaceId: A,
        providerId: drugi,
        apiKey: NOV_KLJUC,
      }),
    );
    odgovori.push(
      await s.asJa.mutation(api.prostor.aiProviders.setDefault, {
        workspaceId: A,
        providerId: drugi,
      }),
    );
    const spisak = await s.asJa.query(api.prostor.aiProviders.list, {
      workspaceId: A,
    });
    odgovori.push(spisak);
    odgovori.push(
      await s.asJa.mutation(api.prostor.aiProviders.remove, {
        workspaceId: A,
        providerId: prvi,
      }),
    );
    odgovori.push(
      await s.asJa.query(api.prostor.aiProviders.list, { workspaceId: A }),
    );

    const sve = JSON.stringify(odgovori);
    expect(sve).not.toContain(KLJUC);
    expect(sve).not.toContain(NOV_KLJUC);
    expect(sve).not.toContain("apiKey");
    // Klijent vidi samo poslednja 4 znaka.
    expect(spisak.find((p) => p._id === drugi)?.keySuffix).toBe("3210");

    // Greška pri izmeni ne nosi ključ (kratak ključ se odbija bez odjeka).
    const greska = await s.asJa
      .mutation(api.prostor.aiProviders.update, {
        workspaceId: A,
        providerId: drugi,
        apiKey: "kratak",
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(String(greska)).toContain("prekratak");
    expect(String(greska)).not.toContain(NOV_KLJUC);

    // Ključ postoji i izlazi samo iz interne funkcije (agent akcija).
    const interni = await s.t.query(internal.prostor.aiProviders.getWithKey, {
      providerId: drugi,
    });
    expect(interni?.apiKey).toBe(NOV_KLJUC);
  });

  test("samo vlasnik projekta koji je i vlasnik platforme; ništa se ne upisuje", async () => {
    const s = await svet();
    const args = {
      label: "X",
      baseUrl: "https://api.example.test/v1",
      model: "m",
      apiKey: KLJUC,
    };
    // Urednik u A: omotač traži vlasnika projekta.
    await odbijeno(
      s.asKolega.mutation(api.prostor.aiProviders.create, {
        workspaceId: s.A.workspaceId,
        ...args,
      }),
      "forbidden",
      /samo vlasnik projekta/,
    );
    // Owner u B, ali nije vlasnik platforme (Devotion: bez globalne admin role).
    await odbijeno(
      s.asKolega.query(api.prostor.aiProviders.list, {
        workspaceId: s.B.workspaceId,
      }),
      "forbidden",
      /samo vlasnik platforme/,
    );
    await odbijeno(
      s.asKolega.mutation(api.prostor.aiProviders.create, {
        workspaceId: s.B.workspaceId,
        ...args,
      }),
      "forbidden",
      /samo vlasnik platforme/,
    );
    // client_viewer.
    await odbijeno(
      s.asGost.query(api.prostor.aiProviders.list, {
        workspaceId: s.A.workspaceId,
      }),
      "forbidden",
    );
    const redovi = await s.t.run((ctx) => ctx.db.query("aiProviders").take(10));
    expect(redovi).toEqual([]);
  });
});

describe("izolacija projekta", () => {
  test("dokument projekta A se ne dira pod projektom B", async () => {
    const s = await svet();
    const A = s.A.workspaceId;
    const B = s.B.workspaceId;

    const ideja = await s.asJa.mutation(api.prostor.ideas.create, {
      workspaceId: A,
      title: "Ideja A",
      text: "Tekst ideje A",
    });
    const tabela = await s.stranica("table");
    const fajlovi = await s.stranica("file");
    const provajder = await s.asJa.mutation(api.prostor.aiProviders.create, {
      workspaceId: A,
      label: "Provajder A",
      baseUrl: "https://api.example.test/v1",
      model: "m",
      apiKey: KLJUC,
    });
    const misao = await s.asJa.mutation(api.prostor.thoughts.createNode, {
      workspaceId: A,
      title: "Misao A",
      text: "Misao A",
      x: 0,
      y: 0,
      color: "neutral",
    });
    const misao2 = await s.asJa.mutation(api.prostor.thoughts.createNode, {
      workspaceId: A,
      title: "Misao A2",
      text: "Misao A2",
      x: 400,
      y: 0,
      color: "neutral",
    });
    const pre = await s.t.run(async (ctx) => ({
      glasovi: (await ctx.db.query("ideaVotes").take(50)).length,
      redovi: (await ctx.db.query("pageTableRows").take(50)).length,
      veze: (await ctx.db.query("thoughtEdges").take(50)).length,
      dozvole: (await ctx.db.query("pageFileUploads").take(50)).length,
    }));

    // Ideje proveravaju projekat ideje same (Devotion), ostalo kroz adapter.
    await expect(
      s.asJa.mutation(api.prostor.ideas.vote, {
        workspaceId: B,
        ideaId: ideja,
        voteType: "down",
      }),
    ).rejects.toThrow("Ideja nije pronađena");
    await expect(
      s.asJa.mutation(api.prostor.ideas.setStage, {
        workspaceId: B,
        ideaId: ideja,
        stage: "odobreno",
      }),
    ).rejects.toThrow();
    await expect(
      s.asJa.mutation(api.prostor.ideas.update, {
        workspaceId: B,
        ideaId: ideja,
        title: "Preoteto",
        text: "Preoteto",
        color: "rose",
      }),
    ).rejects.toThrow();
    await odbijeno(
      s.asJa.query(api.prostor.pageTables.getMeta, {
        workspaceId: B,
        pageId: tabela,
      }),
      "not_found",
      stavkaDrugogProjekta,
    );
    await odbijeno(
      s.asJa.mutation(api.prostor.pageTables.addRow, {
        workspaceId: B,
        pageId: tabela,
      }),
      "not_found",
      stavkaDrugogProjekta,
    );
    await odbijeno(
      s.asJa.query(api.prostor.pageFiles.list, { workspaceId: B, pageId: fajlovi }),
      "not_found",
      stavkaDrugogProjekta,
    );
    await odbijeno(
      s.asJa.mutation(api.prostor.pageFiles.generateUploadUrl, {
        workspaceId: B,
        pageId: fajlovi,
      }),
      "not_found",
      stavkaDrugogProjekta,
    );
    await odbijeno(
      s.asJa.mutation(api.prostor.aiProviders.update, {
        workspaceId: B,
        providerId: provajder,
        label: "Preoteto",
      }),
      "not_found",
      stavkaDrugogProjekta,
    );
    await odbijeno(
      s.asJa.mutation(api.prostor.aiProviders.remove, {
        workspaceId: B,
        providerId: provajder,
      }),
      "not_found",
      stavkaDrugogProjekta,
    );
    await expect(
      s.asJa.mutation(api.prostor.thoughts.createEdge, {
        workspaceId: B,
        nodeAId: misao,
        nodeBId: misao2,
      }),
    ).rejects.toThrow("Misao nije pronađena");
    await expect(
      s.asJa.query(api.prostor.canvases.getAreaCanvas, {
        workspaceId: B,
        areaId: s.A.areaId,
        kind: "note",
      }),
    ).rejects.toThrow();

    const posle = await s.t.run(async (ctx) => ({
      glasovi: (await ctx.db.query("ideaVotes").take(50)).length,
      redovi: (await ctx.db.query("pageTableRows").take(50)).length,
      veze: (await ctx.db.query("thoughtEdges").take(50)).length,
      dozvole: (await ctx.db.query("pageFileUploads").take(50)).length,
    }));
    expect(posle).toEqual(pre);
    const stanje = await s.t.run(async (ctx) => ({
      ideja: await ctx.db.get(ideja),
      provajder: await ctx.db.get(provajder),
    }));
    expect(stanje.ideja).toMatchObject({ title: "Ideja A", archivedAt: null });
    // Faza nije menjana (bez polja = „Predlog“).
    expect(stanje.ideja?.stage ?? "predlog").toBe("predlog");
    expect(stanje.provajder).toMatchObject({ label: "Provajder A" });
  });

  test("client_viewer ne ulazi ni u projektne ni u lične funkcije projekta", async () => {
    const s = await svet();
    const A = s.A.workspaceId;
    const tabela = await s.stranica("table");
    const fajlovi = await s.stranica("file");

    for (const poziv of [
      () => s.asGost.query(api.prostor.ideas.list, { workspaceId: A }),
      () => s.asGost.query(api.prostor.thoughts.getCanvas, { workspaceId: A }),
      () =>
        s.asGost.query(api.prostor.pageTables.getMeta, {
          workspaceId: A,
          pageId: tabela,
        }),
      () =>
        s.asGost.query(api.prostor.pageFiles.list, {
          workspaceId: A,
          pageId: fajlovi,
        }),
      () =>
        s.asGost.query(api.prostor.canvases.getAreaCanvas, {
          workspaceId: A,
          areaId: s.A.areaId,
          kind: "note",
        }),
      () =>
        s.asGost.mutation(api.prostor.ideas.create, {
          workspaceId: A,
          title: "Gost",
          text: "Gost",
        }),
    ]) {
      await odbijeno(poziv(), "forbidden");
    }
    // Lične funkcije sa projektom iz argumenta: adapter traži bar urednika.
    await odbijeno(
      s.asGost.mutation(api.prostor.thoughts.createNote, {
        workspaceId: A,
        text: "Gost piše",
      }),
      "forbidden",
    );
    await odbijeno(
      s.asGost.query(api.prostor.thoughts.listMine, {
        workspaceId: A,
        paginationOpts: { numItems: 10, cursor: null },
      }),
      "forbidden",
    );
    const upisano = await s.t.run(async (ctx) => ({
      ideje: await ctx.db.query("ideaNodes").take(5),
      misli: await ctx.db.query("thoughtNodes").take(5),
    }));
    expect(upisano).toEqual({ ideje: [], misli: [] });
  });
});

describe("otpremanje: tuđ blob se ne prima i ne briše", () => {
  test("prilog odbija blob stariji od dozvole, logo projekta i tuđ avatar", async () => {
    const s = await svet();
    const A = s.A.workspaceId;
    const fajlovi = await s.stranica("file");
    const store = (telo: string, tip: string) =>
      s.t.run((ctx) => ctx.storage.store(new Blob([telo], { type: tip })));
    const postoji = (id: Id<"_storage">) =>
      s.t.run(async (ctx) => (await ctx.db.system.get("_storage", id)) !== null);

    // 1) Blob koji je postojao pre dozvole (nepodržan tip bi ga inače obrisao).
    const stari = await store("MZ", "application/x-msdownload");
    const prva = await s.asJa.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId: A,
      pageId: fajlovi,
    });
    await expect(
      s.asJa.mutation(api.prostor.pageFiles.attach, {
        workspaceId: A,
        pageId: fajlovi,
        storageId: stari,
        token: prva.token,
        name: "stari.exe",
      }),
    ).rejects.toThrow("Fajl nije pronađen. Pošalji ga ponovo.");
    expect(await postoji(stari)).toBe(true);

    // 2) Logo projekta B (nastao posle dozvole, ali ga drži projekat).
    const logo = await store("png", "application/x-msdownload");
    await s.t.run((ctx) =>
      ctx.db.patch("workspaces", s.B.workspaceId, { brend: { logoStorageId: logo } }),
    );
    await expect(
      s.asJa.mutation(api.prostor.pageFiles.attach, {
        workspaceId: A,
        pageId: fajlovi,
        storageId: logo,
        token: prva.token,
        name: "logo.exe",
      }),
    ).rejects.toThrow("Fajl nije pronađen. Pošalji ga ponovo.");
    expect(await postoji(logo)).toBe(true);

    // 3) Avatar kolege.
    const avatar = await store("png", "image/png");
    await s.t.run((ctx) =>
      ctx.db.patch("profiles", s.kolega.profileId, { avatarStorageId: avatar }),
    );
    await expect(
      s.asJa.mutation(api.prostor.pageFiles.attach, {
        workspaceId: A,
        pageId: fajlovi,
        storageId: avatar,
        token: prva.token,
        name: "avatar.png",
      }),
    ).rejects.toThrow("Fajl nije pronađen. Pošalji ga ponovo.");
    expect(await postoji(avatar)).toBe(true);

    // Sopstven blob posle dozvole prolazi.
    const moj = await store("pdf", "application/pdf");
    const rezultat = await s.asJa.mutation(api.prostor.pageFiles.attach, {
      workspaceId: A,
      pageId: fajlovi,
      storageId: moj,
      token: prva.token,
      name: "plan.pdf",
    });
    expect(rezultat).toMatchObject({ ok: true, category: "pdf" });
    const prilozi = await s.asJa.query(api.prostor.pageFiles.list, {
      workspaceId: A,
      pageId: fajlovi,
    });
    expect(prilozi.map((f) => f.name)).toEqual(["plan.pdf"]);
  });

  test("avatar ne prima tuđ blob, pa ga sledeća promena ne može obrisati", async () => {
    const s = await svet();
    const store = (telo: string) =>
      s.t.run((ctx) => ctx.storage.store(new Blob([telo], { type: "image/png" })));
    const postoji = (id: Id<"_storage">) =>
      s.t.run(async (ctx) => (await ctx.db.system.get("_storage", id)) !== null);

    const stari = await store("stari");
    const dozvola = await s.asKolega.mutation(
      api.prostor.storage.generateAvatarUploadUrl,
      {},
    );
    await expect(
      s.asKolega.mutation(api.prostor.storage.setAvatar, {
        storageId: stari,
        token: dozvola.token,
      }),
    ).rejects.toThrow("Slika nije pronađena. Pošalji je ponovo.");

    // Fajl prijavljen u Enigmi (npr. naslovna slika posta).
    const prijavljen = await store("naslovna");
    await s.t.run((ctx) =>
      ctx.db.insert("projekatUploadi", {
        workspaceId: s.A.workspaceId,
        storageId: prijavljen,
        userId: s.ja.userId,
        svrha: "novosti_naslovna",
        createdAt: Date.now(),
      }),
    );
    await expect(
      s.asKolega.mutation(api.prostor.storage.setAvatar, {
        storageId: prijavljen,
        token: dozvola.token,
      }),
    ).rejects.toThrow("Slika nije pronađena. Pošalji je ponovo.");

    // Sopstvena slika prolazi; sledeća promena briše samo nju.
    const moja = await store("moja");
    await s.asKolega.mutation(api.prostor.storage.setAvatar, {
      storageId: moja,
      token: dozvola.token,
    });
    const druga = await s.asKolega.mutation(
      api.prostor.storage.generateAvatarUploadUrl,
      {},
    );
    const nova = await store("nova");
    await s.asKolega.mutation(api.prostor.storage.setAvatar, {
      storageId: nova,
      token: druga.token,
    });
    expect(await postoji(moja)).toBe(false);
    expect(await postoji(stari)).toBe(true);
    expect(await postoji(prijavljen)).toBe(true);
  });
});

describe("beleške: „Pošalji u projekat“", () => {
  test("beleška iz drugog mog projekta postaje ideja u cilju; client_viewer ni u izvoru ni u cilju", async () => {
    const s = await svet();
    const beleska = await s.asJa.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.A.workspaceId,
      text: "Beleška iz A",
    });
    const rezultat = await s.asJa.mutation(api.prostor.thoughts.convertToIdeas, {
      workspaceId: s.B.workspaceId,
      nodeIds: [beleska],
    });
    expect(rezultat.ideaIds).toHaveLength(1);
    const ideja = await s.t.run((ctx) => ctx.db.get(rezultat.ideaIds[0]));
    expect(ideja).toMatchObject({ workspaceId: s.B.workspaceId });
    expect(ideja?.stage ?? "predlog").toBe("predlog");

    // Cilj u kome sam client_viewer.
    await odbijeno(
      s.asJa.mutation(api.prostor.thoughts.convertToIdeas, {
        workspaceId: s.C.workspaceId,
        nodeIds: [beleska],
      }),
      "forbidden",
    );

    // Izvor u kome je autor beleške postao client_viewer.
    const kolegina = await s.asKolega.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.A.workspaceId,
      text: "Kolegina beleška",
    });
    await s.t.run(async (ctx) => {
      const red = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", s.kolega.userId).eq("workspaceId", s.A.workspaceId),
        )
        .first();
      await ctx.db.patch("members", red!._id, { role: "client_viewer" });
    });
    await odbijeno(
      s.asKolega.mutation(api.prostor.thoughts.convertToIdeas, {
        workspaceId: s.B.workspaceId,
        nodeIds: [kolegina],
      }),
      "forbidden",
    );
    const ideje = await s.t.run((ctx) => ctx.db.query("ideaNodes").take(10));
    expect(ideje).toHaveLength(1);
  });
});
