/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/pageFiles.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  MAX_PAGE_FILE_BYTES,
  MAX_PAGE_MEDIA_BYTES,
  maxPageFileBytesFor,
  pageFileCategoryFor,
  PRUNE_GRACE_MS,
} from "./lib/page_files";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seedFileWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const createPerson = async (name: string) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await createPerson("Owner");
    const member = await createPerson("Member");
    const workspaceId = await insertStartup(ctx, {
      name: "File startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, member]) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId: person.profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    const areaId = await ctx.db.insert("areas", {
      workspaceId,
      key: "file-area",
      label: "File area",
      position: 0,
      createdAt: now,
    });
    return { owner, member, workspaceId, areaId };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const asOwner = asPerson(seeded.owner);
  const asMember = asPerson(seeded.member);
  const pageId = await asOwner.mutation(api.prostor.pages.create, {
    workspaceId: seeded.workspaceId,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "file",
    title: "Ugovori",
  });

  /** Ubacuje blob direktno u skladište, kao da je klijent već završio upload. */
  const store = (body: string, contentType: string) =>
    t.run((ctx) => ctx.storage.store(new Blob([body], { type: contentType })));

  const upload = async (
    name: string,
    contentType: string,
    body = "sadržaj",
    targetPageId: Id<"pages"> = pageId,
  ) => {
    const { token } = await asOwner.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId: seeded.workspaceId,
      pageId: targetPageId,
    });
    const storageId = await store(body, contentType);
    const result = await asOwner.mutation(api.prostor.pageFiles.attach, {
      workspaceId: seeded.workspaceId,
      pageId: targetPageId,
      storageId,
      token,
      name,
    });
    if (!result.ok) {
      throw new Error(`attach je odbijen: ${result.message}`);
    }
    return result;
  };

  const createNote = (title = "Beleška") =>
    asOwner.mutation(api.prostor.pages.create, {
      workspaceId: seeded.workspaceId,
      areaId: seeded.areaId,
      parentPageId: null,
      kind: "note",
      title,
    });

  return { t, ...seeded, asOwner, asMember, pageId, store, upload, createNote };
}

describe("fajlovi u oblačiću", () => {
  test("više fajlova po oblačiću, kategorija se izvodi sa servera", async () => {
    const { t, workspaceId, pageId, asOwner, upload } = await seedFileWorkspace();

    await upload("plan.pdf", "application/pdf");
    await upload("logo.png", "image/png");
    await upload("snimak.mp4", "video/mp4");

    const files = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId });
    expect(files.map((file) => file.category)).toEqual([
      "pdf",
      "image",
      "video",
    ]);
    expect(files.map((file) => file.position)).toEqual([0, 1, 2]);

    // Slika nosi pregled na kanvasu, čak i kad nije prva po redu.
    expect(
      await t.run((ctx) => ctx.db.get("pages", pageId)),
    ).toMatchObject({ fileCount: 3, filePrimaryCategory: "image" });
  });

  test("nepodržan tip se odbija, ne ulazi u spisak i blob se briše", async () => {
    const { t, workspaceId, pageId, asOwner, store } = await seedFileWorkspace();
    const { token } = await asOwner.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId,
      pageId,
    });
    const storageId = await store("MZ", "application/x-msdownload");

    const result = await asOwner.mutation(api.prostor.pageFiles.attach, {
      workspaceId,
      pageId,
      storageId,
      token,
      name: "virus.exe",
    });
    expect(result).toMatchObject({ ok: false, reason: "unsupported" });
    expect(await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId })).toEqual([]);
    // Odbijen blob ne sme da ostane bez reference u skladištu.
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).toBeNull();
  });

  test("istekla ili tuđa dozvola ne prolazi", async () => {
    const { t, workspaceId, pageId, asOwner, asMember, store } = await seedFileWorkspace();
    const { token } = await asOwner.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId,
      pageId,
    });
    const storageId = await store("x", "image/png");

    // PROSTOR P1 (namerna promena pravila): član sme da dodaje fajlove, ali
    // tuđa dozvola za slanje i dalje ne prolazi.
    await expect(
      asMember.mutation(api.prostor.pageFiles.attach, {
        workspaceId,
        pageId,
        storageId,
        token,
        name: "tudje.png",
      }),
    ).rejects.toThrow("Dozvola za slanje fajla nije ispravna");
    // Neuspeh autorizacije ne sme da dira blob — pozivalac nije dokazao da je
    // blob njegov.
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).not.toBeNull();

    await t.run(async (ctx) => {
      const upload = await ctx.db.query("pageFileUploads").first();
      if (upload !== null) {
        await ctx.db.patch("pageFileUploads", upload._id, {
          expiresAt: Date.now() - 1,
        });
      }
    });
    const expired = await asOwner.mutation(api.prostor.pageFiles.attach, {
      workspaceId,
      pageId,
      storageId,
      token,
      name: "kasno.png",
    });
    expect(expired).toMatchObject({ ok: false, reason: "expired" });
    // Istekla sopstvena dozvola briše blob umesto da ga ostavi bez reference.
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).toBeNull();
  });

  test("isti blob ne može da visi na dva oblačića", async () => {
    const { t, workspaceId, areaId, pageId, asOwner, store } =
      await seedFileWorkspace();
    const first = await asOwner.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId,
      pageId,
    });
    const storageId = await store("x", "image/png");
    await asOwner.mutation(api.prostor.pageFiles.attach, {
      workspaceId,
      pageId,
      storageId,
      token: first.token,
      name: "prva.png",
    });

    const otherPageId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "file",
      title: "Drugi oblačić",
    });
    const second = await asOwner.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId,
      pageId: otherPageId,
    });
    await expect(
      asOwner.mutation(api.prostor.pageFiles.attach, {
        workspaceId,
        pageId: otherPageId,
        storageId,
        token: second.token,
        name: "ista.png",
      }),
    ).rejects.toThrow("već zakačen");
    // Tuđ (već zakačen) blob ostaje netaknut.
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).not.toBeNull();
  });

  test("attach preko limita briše blob umesto da ga ostavi bez reference", async () => {
    const { t, owner, workspaceId, areaId, pageId, asOwner, store } =
      await seedFileWorkspace();
    // Dozvola se uzima pre nego što se oblačić napuni — generateUploadUrl bi
    // posle limita odbio, a ovde se testira attach grana.
    const { token } = await asOwner.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId,
      pageId,
    });
    const storageId = await store("x", "image/png");
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 25; index += 1) {
        const filler = await ctx.storage.store(
          new Blob([`f${index}`], { type: "image/png" }),
        );
        await ctx.db.insert("pageFiles", {
          workspaceId,
          areaId,
          pageId,
          storageId: filler,
          name: `f${index}.png`,
          contentType: "image/png",
          size: 4,
          category: "image",
          position: index,
          uploadedByProfileId: owner.profileId,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const result = await asOwner.mutation(api.prostor.pageFiles.attach, {
      workspaceId,
      pageId,
      storageId,
      token,
      name: "preko.png",
    });
    expect(result).toMatchObject({ ok: false, reason: "limit" });
    expect(
      await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).toBeNull();
  });

  // PROSTOR K03 (P19, D8): uklanjanje priloga je meko — svaki član ga šalje u
  // Korpu, blob ostaje u storage-u, a „Vrati" ga vraća na kraj spiska.
  test("uklanjanje ide u Korpu: blob ostaje, preostali se prenumerišu, Vrati ga vraća", async () => {
    const { t, pageId, member, asOwner, asMember, workspaceId, upload } =
      await seedFileWorkspace();
    await upload("a.png", "image/png");
    const second = await upload("b.png", "image/png");
    await upload("c.png", "image/png");

    const storageId = await t.run(async (ctx) => {
      const row = await ctx.db.get("pageFiles", second.fileId);
      return row?.storageId ?? null;
    });
    await asMember.mutation(api.prostor.pageFiles.remove, { workspaceId, fileId: second.fileId });

    const files = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId });
    expect(files.map((file) => file.name)).toEqual(["a.png", "c.png"]);
    expect(files.map((file) => file.position)).toEqual([0, 1]);
    expect(
      storageId === null
        ? null
        : await t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).not.toBeNull();
    expect(
      await t.run((ctx) => ctx.db.get("pageFiles", second.fileId)),
    ).toMatchObject({
      archivedAt: expect.any(Number),
      archivedByProfileId: member.profileId,
      trashState: "root",
    });
    const trash = await asOwner.query(api.prostor.trash.list, {
      workspaceId,
      kind: "file",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(trash.page).toEqual([
      expect.objectContaining({
        kind: "file",
        fileId: second.fileId,
        name: "b.png",
        pageAvailable: true,
        canRestore: true,
      }),
    ]);

    await asOwner.mutation(api.prostor.trash.restore, {
      workspaceId,
      target: { kind: "file", id: second.fileId },
    });
    const restored = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId });
    expect(restored.map((file) => file.name)).toEqual([
      "a.png",
      "c.png",
      "b.png",
    ]);
    expect(restored.map((file) => file.position)).toEqual([0, 1, 2]);
  });

  test("član dodaje fajlove u tuđi oblačić, osim kad je zaključan", async () => {
    // PROSTOR P1/P19 (namerna promena pravila): ranije je tuđi oblačić
    // odbijao fajlove; sada samo zaključan (autor, vlasnik, admin).
    const { workspaceId, pageId, asOwner, asMember } = await seedFileWorkspace();
    await expect(
      asMember.mutation(api.prostor.pageFiles.generateUploadUrl, { workspaceId, pageId }),
    ).resolves.toMatchObject({ token: expect.any(String) });
    expect(await asMember.query(api.prostor.pageFiles.list, { workspaceId, pageId })).toEqual([]);

    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId });
    await expect(
      asMember.mutation(api.prostor.pageFiles.generateUploadUrl, { workspaceId, pageId }),
    ).rejects.toThrow("zaključana");
  });

  test("fajl API odbija stranice koje ne podržavaju fajlove", async () => {
    const { workspaceId, areaId, asOwner } = await seedFileWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Nije fajl",
    });
    await expect(
      asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId: taskId }),
    ).rejects.toThrow("ne podržava fajlove");
  });

  test("granica veličine zavisi od kategorije", () => {
    expect(MAX_PAGE_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_PAGE_MEDIA_BYTES).toBe(200 * 1024 * 1024);
    expect(maxPageFileBytesFor("video")).toBe(MAX_PAGE_MEDIA_BYTES);
    expect(maxPageFileBytesFor("image")).toBe(MAX_PAGE_FILE_BYTES);
    expect(maxPageFileBytesFor("document")).toBe(MAX_PAGE_FILE_BYTES);
  });

  test("kategorija pada na ekstenziju kad content-type nije prepoznat", () => {
    expect(pageFileCategoryFor("text/rtf", "a.rtf")).toBe("document");
    expect(pageFileCategoryFor("text/x-csv", "b.csv")).toBe("sheet");
    expect(pageFileCategoryFor("application/octet-stream", "IMG_1.heic")).toBe(
      "image",
    );
    expect(pageFileCategoryFor(undefined, "IMG_2.heif")).toBe("image");
    expect(pageFileCategoryFor("", "video.mov")).toBe("video");
    // Prepoznat content-type i dalje ima prednost nad ekstenzijom.
    expect(pageFileCategoryFor("image/png", "cudno.mp4")).toBe("image");
    // Nepoznat tip sa nepoznatom ekstenzijom se i dalje odbija.
    expect(pageFileCategoryFor("application/x-msdownload", "virus.exe")).toBe(
      null,
    );
    expect(pageFileCategoryFor("application/octet-stream", "bezimena")).toBe(
      null,
    );
  });
});

describe("prilozi u belešci", () => {
  test("beleška prima fajlove, a njen dokument ne dobija sažetke", async () => {
    const { t, workspaceId, asOwner, upload, createNote } = await seedFileWorkspace();
    const noteId = await createNote();

    const attached = await upload("logo.png", "image/png", "png", noteId);
    expect(attached).toMatchObject({ category: "image", name: "logo.png" });
    expect(attached.size).toBeGreaterThan(0);

    const files = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId: noteId });
    expect(files.map((file) => file.name)).toEqual(["logo.png"]);

    // Sažeci (`fileCount` itd.) su rezervisani za „fajl” oblačiće.
    const doc = await t.run((ctx) => ctx.db.get("pages", noteId));
    expect(doc?.fileCount).toBeUndefined();
    expect(doc?.filePrimaryCategory).toBeUndefined();
  });

  // PROSTOR K03 (D8): prune sklanja meko — blob ostaje, prilog nije u Korpi, a
  // vraća se čim mu se id ponovo pojavi u telu (poništeno brisanje slike).
  test("prune meko sklanja nereferencirane priloge starije od grace perioda i vraća ih po id-ju", async () => {
    const { t, workspaceId, asOwner, upload, createNote } =
      await seedFileWorkspace();
    const noteId = await createNote();
    const first = await upload("a.png", "image/png", "a", noteId);
    const second = await upload("b.png", "image/png", "b", noteId);
    const third = await upload("c.png", "image/png", "c", noteId);

    const storageIds = await t.run(async (ctx) => {
      const rows = await Promise.all(
        [first, second, third].map((file) =>
          ctx.db.get("pageFiles", file.fileId),
        ),
      );
      // Svi prilozi se „ostare” da grace period ne bi štitio nijedan.
      for (const row of rows) {
        if (row === null) continue;
        await ctx.db.patch("pageFiles", row._id, {
          createdAt: Date.now() - PRUNE_GRACE_MS - 1_000,
        });
      }
      return rows.map((row) => row?.storageId ?? null);
    });

    const result = await asOwner.mutation(api.prostor.pageFiles.prune, {
      workspaceId,
      pageId: noteId,
      // Neispravni id-jevi iz nalepljenog sadržaja se preskaču bez greške.
      keepFileIds: [second.fileId, "nije-id", ""],
    });
    expect(result).toEqual({ removed: 2 });

    const files = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId: noteId });
    expect(files.map((file) => file.name)).toEqual(["b.png"]);
    expect(files.map((file) => file.position)).toEqual([0]);

    const blobs = await t.run((ctx) =>
      Promise.all(
        storageIds.map((storageId) =>
          storageId === null
            ? null
            : ctx.db.system.get("_storage", storageId),
        ),
      ),
    );
    expect(blobs.every((blob) => blob !== null)).toBe(true);
    const pruned = await t.run((ctx) => ctx.db.get("pageFiles", first.fileId));
    expect(pruned?.archivedAt).toEqual(expect.any(Number));
    expect(pruned?.trashState).toBeUndefined();
    const trash = await asOwner.query(api.prostor.trash.list, {
      workspaceId,
      kind: "file",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(trash.page).toEqual([]);

    await asOwner.mutation(api.prostor.pageFiles.prune, {
      workspaceId,
      pageId: noteId,
      keepFileIds: [second.fileId, first.fileId],
    });
    const back = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId: noteId });
    expect(back.map((file) => file.name)).toEqual(["b.png", "a.png"]);
    expect(back.map((file) => file.position)).toEqual([0, 1]);
  });

  test("prune ne dira sveže priloge — upload možda još nije sačuvan u telu", async () => {
    const { workspaceId, asOwner, upload, createNote } = await seedFileWorkspace();
    const noteId = await createNote();
    await upload("svez.png", "image/png", "x", noteId);

    const result = await asOwner.mutation(api.prostor.pageFiles.prune, {
      workspaceId,
      pageId: noteId,
      keepFileIds: [],
    });
    expect(result).toEqual({ removed: 0 });
    const files = await asOwner.query(api.prostor.pageFiles.list, { workspaceId, pageId: noteId });
    expect(files.map((file) => file.name)).toEqual(["svez.png"]);
  });

  // PROSTOR K03 (P1, D8): sklanjanje priloga tuđe beleške radi svaki član (meko);
  // zaključanu belešku samo autor, vlasnik startupa i admin.
  test("prune radi svaki član, zaključanu belešku ne; samo za beleške", async () => {
    const { workspaceId, pageId, asOwner, asMember, createNote } =
      await seedFileWorkspace();
    const noteId = await createNote();

    await expect(
      asMember.mutation(api.prostor.pageFiles.prune, { workspaceId, pageId: noteId, keepFileIds: [] }),
    ).resolves.toEqual({ removed: 0 });
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId: noteId });
    await expect(
      asMember.mutation(api.prostor.pageFiles.prune, { workspaceId, pageId: noteId, keepFileIds: [] }),
    ).rejects.toThrow("zaključana");
    await expect(
      asOwner.mutation(api.prostor.pageFiles.prune, { workspaceId, pageId, keepFileIds: [] }),
    ).rejects.toThrow("samo za beleške");
  });
});
