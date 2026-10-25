/// <reference types="vite/client" />
/**
 * C19 (plan C02 §10.3, D12): ID fajla iz storage-a nije dokaz vlasništva.
 * Slika posta, titl i sličica prihvataju samo fajl prijavljen u istom
 * projektu (`projekatUploadi`), a tuđ fajl se ne čita, ne objavljuje i ne
 * briše.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

afterEach(() => {
  vi.useRealTimers();
});

async function fajl(s: Svet, tip = "image/png"): Promise<Id<"_storage">> {
  return await s.t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(2000)], { type: tip })),
  );
}

const postoji = (s: Svet, id: Id<"_storage">) =>
  s.t.run(async (ctx) => (await ctx.db.system.get("_storage", id)) !== null);

const prijave = (s: Svet) =>
  s.t.run(async (ctx) => await ctx.db.query("projekatUploadi").collect());

async function napraviPost(s: Svet, ws: Id<"workspaces">, cover?: Id<"_storage">) {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("posts", {
      workspaceId: ws,
      slug: `post-${ws}`,
      locale: "sr",
      kind: "note",
      category: "odluke",
      title: "Post",
      dek: "",
      body: "Tekst.",
      authorName: "Autor",
      tags: [],
      status: "draft",
      updatedAt: Date.now(),
      ownProofChecked: false,
      ...(cover !== undefined ? { coverStorageId: cover } : {}),
    }),
  );
}

describe("registrujUpload", () => {
  test("prvi prijavljuje projekat koji je otpremio; tuđ fajl se ne preuzima", async () => {
    const s = await napraviSvet();
    const f = await fajl(s);
    const ana = kao(s, s.ana);

    await ana.mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: f,
      svrha: "novosti_naslovna",
    });
    // Ponovljena prijava istog fajla je ista prijava.
    await ana.mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: f,
      svrha: "novosti_naslovna",
    });
    expect(
      (await prijave(s)).map((r) => [r.workspaceId, r.userId, r.svrha]),
    ).toEqual([[s.wsA, s.ana, "novosti_naslovna"]]);

    // Isti projekat, druga namena: ne (YouTube bi posle slanja obrisao sliku posta).
    await odbijeno(
      ana.mutation(api.projekatUploadi.registrujUpload, {
        workspaceId: s.wsA,
        storageId: f,
        svrha: "yt_slicica",
      }),
      "not_found",
    );
    // Drugi projekat ne preuzima prijavljen fajl, ni Jovan koji je član oba.
    await odbijeno(
      kao(s, s.boban).mutation(api.projekatUploadi.registrujUpload, {
        workspaceId: s.wsB,
        storageId: f,
        svrha: "novosti_naslovna",
      }),
      "not_found",
    );
    await odbijeno(
      kao(s, s.jovan).mutation(api.projekatUploadi.registrujUpload, {
        workspaceId: s.wsB,
        storageId: f,
        svrha: "novosti_naslovna",
      }),
      "not_found",
    );
    expect((await prijave(s)).map((r) => r.workspaceId)).toEqual([s.wsA]);
  });

  test("posmatrač, stranac i neprijavljen ne prijavljuju", async () => {
    const s = await napraviSvet();
    const f = await fajl(s);
    const args = { workspaceId: s.wsA, storageId: f, svrha: "yt_titl" as const };
    await odbijeno(kao(s, s.viewer).mutation(api.projekatUploadi.registrujUpload, args), "forbidden");
    await odbijeno(kao(s, s.stranac).mutation(api.projekatUploadi.registrujUpload, args), "forbidden");
    await odbijeno(kao(s, s.boban).mutation(api.projekatUploadi.registrujUpload, args), "forbidden");
    await odbijeno(s.t.mutation(api.projekatUploadi.registrujUpload, args), "unauthorized");
    expect(await prijave(s)).toEqual([]);
  });

  test("star fajl, logo drugog projekta i fajl objave se ne prijavljuju", async () => {
    // Samo sat: convex-test sam koristi tajmere.
    vi.useFakeTimers({ toFake: ["Date"] });
    const s = await napraviSvet();
    const ana = kao(s, s.ana);

    // Slika objavljenog posta (stara) ne može da se „prijavi“ naknadno.
    const star = await fajl(s);
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await odbijeno(
      ana.mutation(api.projekatUploadi.registrujUpload, {
        workspaceId: s.wsA,
        storageId: star,
        svrha: "yt_slicica",
      }),
      "invalid",
      /isteklo/,
    );

    const logoB = await fajl(s);
    const objavaB = await fajl(s, "video/mp4");
    await s.t.run(async (ctx) => {
      await ctx.db.patch(s.wsB, { brend: { logoStorageId: logoB } });
      await ctx.db.insert("igPublishUploads", {
        workspaceId: s.wsB,
        storageId: objavaB,
        createdAt: Date.now(),
      });
    });
    for (const storageId of [logoB, objavaB]) {
      await odbijeno(
        ana.mutation(api.projekatUploadi.registrujUpload, {
          workspaceId: s.wsA,
          storageId,
          svrha: "yt_slicica",
        }),
        "not_found",
      );
    }
    expect(await prijave(s)).toEqual([]);
  });
});

describe("slika posta", () => {
  test("samo fajl prijavljen u istom projektu za novosti", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const postA = await napraviPost(s, s.wsA);

    const fajlB = await fajl(s);
    await kao(s, s.boban).mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsB,
      storageId: fajlB,
      svrha: "novosti_naslovna",
    });
    const neprijavljen = await fajl(s);
    const titlA = await fajl(s, "text/vtt");
    await ana.mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: titlA,
      svrha: "yt_titl",
    });

    for (const slika of [fajlB, neprijavljen, titlA]) {
      await odbijeno(
        ana.mutation(api.postsStore.updateDraft, {
          workspaceId: s.wsA,
          postId: postA,
          coverStorageId: slika,
        }),
        "not_found",
      );
      await odbijeno(
        ana.mutation(api.postsStore.updateDraft, {
          workspaceId: s.wsA,
          postId: postA,
          ogImageStorageId: slika,
        }),
        "not_found",
      );
    }
    const posle = await s.t.run(async (ctx) => await ctx.db.get(postA));
    expect(posle?.coverStorageId).toBeUndefined();
    expect(posle?.ogImageStorageId).toBeUndefined();

    const nasa = await fajl(s);
    await ana.mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: nasa,
      svrha: "novosti_naslovna",
    });
    await ana.mutation(api.postsStore.updateDraft, {
      workspaceId: s.wsA,
      postId: postA,
      coverStorageId: nasa,
    });
    // Ista slika i kao OG slika istog posta, i ponovljeno čuvanje bez nove prijave.
    await ana.mutation(api.postsStore.updateDraft, {
      workspaceId: s.wsA,
      postId: postA,
      coverStorageId: nasa,
      ogImageStorageId: nasa,
    });
    const sacuvan = await s.t.run(async (ctx) => await ctx.db.get(postA));
    expect([sacuvan?.coverStorageId, sacuvan?.ogImageStorageId]).toEqual([nasa, nasa]);
  });

  test("post sa slikom od pre ove provere se čuva kao i do sada", async () => {
    const s = await napraviSvet();
    const stara = await fajl(s);
    const postA = await napraviPost(s, s.wsA, stara);
    await kao(s, s.ana).mutation(api.postsStore.updateDraft, {
      workspaceId: s.wsA,
      postId: postA,
      title: "Novi naslov",
      coverStorageId: stara,
    });
    const posle = await s.t.run(async (ctx) => await ctx.db.get(postA));
    expect([posle?.title, posle?.coverStorageId]).toEqual(["Novi naslov", stara]);
  });
});

describe("titl i sličica", () => {
  test("tuđ, neprijavljen ili fajl druge namene se ne šalje i ne briše", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);

    const fajlB = await fajl(s);
    await kao(s, s.boban).mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsB,
      storageId: fajlB,
      svrha: "yt_slicica",
    });
    const neprijavljen = await fajl(s);
    const naslovnaA = await fajl(s);
    await ana.mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: naslovnaA,
      svrha: "novosti_naslovna",
    });

    for (const storageId of [fajlB, neprijavljen, naslovnaA]) {
      await odbijeno(
        ana.action(api.ytThumbnails.setThumbnail, { workspaceId: s.wsA, videoId: "v1", storageId }),
        "invalid",
        /nije pronađena/,
      );
      await odbijeno(
        ana.action(api.ytCaptions.uploadCaption, {
          workspaceId: s.wsA,
          videoId: "v1",
          storageId,
          language: "sr",
          name: "",
          isDraft: true,
        }),
        "invalid",
        /nije pronađen/,
      );
      await odbijeno(
        ana.action(api.ytCaptions.updateCaption, { workspaceId: s.wsA, captionId: "c1", storageId }),
        "invalid",
        /nije pronađen/,
      );
      expect(await postoji(s, storageId)).toBe(true);
    }
    // Prijava drugog projekta ostaje netaknuta.
    expect((await prijave(s)).map((r) => r.workspaceId).sort()).toEqual([s.wsA, s.wsB].sort());
  });

  test("fajl prijavljen u ovom projektu prolazi proveru i briše se posle slanja", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const titl = await fajl(s, "text/vtt");
    await ana.mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsA,
      storageId: titl,
      svrha: "yt_titl",
    });
    // Bez YouTube veze slanje staje posle provere fajla; fajl je odradio svoje.
    await odbijeno(
      ana.action(api.ytCaptions.uploadCaption, {
        workspaceId: s.wsA,
        videoId: "v1",
        storageId: titl,
        language: "sr",
        name: "",
        isDraft: true,
      }),
      "invalid",
      /Prvo poveži YouTube/,
    );
    expect(await postoji(s, titl)).toBe(false);
    expect(await prijave(s)).toEqual([]);
  });
});

describe("logo projekta", () => {
  test("ne preuzima fajl koji je drugi projekat prijavio", async () => {
    const s = await napraviSvet();
    const naslovnaB = await fajl(s);
    await kao(s, s.boban).mutation(api.projekatUploadi.registrujUpload, {
      workspaceId: s.wsB,
      storageId: naslovnaB,
      svrha: "novosti_naslovna",
    });
    await odbijeno(
      kao(s, s.ana).mutation(api.podesavanjaStore.postaviSlikuBrenda, {
        workspaceId: s.wsA,
        vrsta: "logo",
        storageId: naslovnaB,
      }),
      "invalid",
      /u upotrebi/,
    );
    expect(await postoji(s, naslovnaB)).toBe(true);
    const a = await s.t.run(async (ctx) => await ctx.db.get(s.wsA));
    expect(a?.brend).toBeUndefined();
  });
});
