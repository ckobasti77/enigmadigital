/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/trash.nodelete.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { PRUNE_GRACE_MS } from "./lib/page_files";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

/**
 * PROSTOR K03 (D8, plan K01 §5.7): nijedna radnja člana više ne briše trajno
 * sadržaj. Posle `remove`, `prune`, `removeRow`, `importRows(replace)` i
 * `removeColumn` redovi, blobovi i vrednosti i dalje postoje; „Vrati ovu
 * verziju" beleške vraća prilog koji je `prune` sklonio.
 */

const modules = import.meta.glob("/convex/**/*.*s");

async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (name: string) => {
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
    const author = await person("Author");
    const member = await person("Member");
    const workspaceId = await insertStartup(ctx, {
      name: "Projekat",
      description: "",
      createdByProfileId: author.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const p of [author, member]) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId: p.profileId,
        addedByProfileId: author.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    const areaId = await ctx.db.insert("areas", {
      workspaceId,
      key: "dev",
      label: "Razvoj",
      position: 0,
      createdAt: now,
    });
    return { author, member, workspaceId, areaId };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const asAuthor = as(seeded.author);
  const asMember = as(seeded.member);
  const createPage = (kind: "note" | "file" | "table", title: string) =>
    asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: seeded.workspaceId,
      areaId: seeded.areaId,
      parentPageId: null,
      kind,
      title,
    });
  const upload = async (pageId: Id<"pages">, name: string) => {
    const { token } = await asAuthor.mutation(api.prostor.pageFiles.generateUploadUrl, {
      workspaceId: seeded.workspaceId,
      pageId,
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([name], { type: "image/png" })),
    );
    const result = await asAuthor.mutation(api.prostor.pageFiles.attach, {
      workspaceId: seeded.workspaceId,
      pageId,
      storageId,
      token,
      name,
    });
    if (!result.ok) throw new Error(result.message);
    return { fileId: result.fileId, storageId };
  };
  return { t, ...seeded, asAuthor, asMember, createPage, upload };
}

describe("bez trajnog brisanja (D8)", () => {
  test("remove i prune čuvaju red i blob", async () => {
    const s = await seed();
    const filePage = await s.createPage("file", "Fajlovi");
    const removed = await s.upload(filePage, "a.png");
    await s.asMember.mutation(api.prostor.pageFiles.remove, { workspaceId: s.workspaceId, fileId: removed.fileId });

    const note = await s.createPage("note", "Beleška");
    const pruned = await s.upload(note, "b.png");
    await s.t.run((ctx) =>
      ctx.db.patch("pageFiles", pruned.fileId, {
        createdAt: Date.now() - PRUNE_GRACE_MS - 1_000,
      }),
    );
    await s.asMember.mutation(api.prostor.pageFiles.prune, {
      workspaceId: s.workspaceId,
      pageId: note,
      keepFileIds: [],
    });

    for (const { fileId, storageId } of [removed, pruned]) {
      const state = await s.t.run(async (ctx) => ({
        row: await ctx.db.get("pageFiles", fileId),
        blob: await ctx.db.system.get("_storage", storageId),
      }));
      expect(state.row?.archivedAt).toEqual(expect.any(Number));
      expect(state.blob).not.toBeNull();
    }
  });

  test("removeRow, importRows(replace) i removeColumn čuvaju redove i vrednosti", async () => {
    const s = await seed();
    const table = await s.createPage("table", "Tabela");
    await s.asMember.mutation(api.prostor.pageTables.importRows, {
      workspaceId: s.workspaceId,
      pageId: table,
      columns: ["Ime", "Grad"],
      rows: [
        ["Ana", "Beograd"],
        ["Bojan", "Niš"],
      ],
      mode: "replace",
    });
    const meta = await s.asMember.query(api.prostor.pageTables.getMeta, { workspaceId: s.workspaceId, pageId: table });
    const [nameColumn, cityColumn] = meta.columns;
    const rows = await s.asMember.query(api.prostor.pageTables.listRows, {
      workspaceId: s.workspaceId,
      pageId: table,
      paginationOpts: { numItems: 50, cursor: null },
    });
    await s.asMember.mutation(api.prostor.pageTables.removeRow, {
      workspaceId: s.workspaceId,
      rowId: rows.page[0]._id,
    });
    await s.asMember.mutation(api.prostor.pageTables.removeColumn, {
      workspaceId: s.workspaceId,
      pageId: table,
      columnId: cityColumn.id,
    });
    await s.asMember.mutation(api.prostor.pageTables.importRows, {
      workspaceId: s.workspaceId,
      pageId: table,
      columns: ["Ime"],
      rows: [["Ceca"]],
      mode: "replace",
    });

    const all = await s.t.run((ctx) =>
      ctx.db
        .query("pageTableRows")
        .withIndex("by_pageId_and_rowKey", (q) => q.eq("pageId", table))
        .collect(),
    );
    // Dva stara reda (jedan uklonjen, jedan zamenjen) + početni red + nov red.
    const byName = new Map(all.map((row) => [row.cells[nameColumn.id], row]));
    expect(byName.get("Ana")).toMatchObject({
      archivedAt: expect.any(Number),
      cells: { [nameColumn.id]: "Ana", [cityColumn.id]: "Beograd" },
    });
    expect(byName.get("Bojan")).toMatchObject({
      archivedAt: expect.any(Number),
      cells: { [nameColumn.id]: "Bojan", [cityColumn.id]: "Niš" },
    });
    expect(byName.get("Ceca")?.archivedAt).toBeNull();
    const visible = await s.asMember.query(api.prostor.pageTables.listRows, {
      workspaceId: s.workspaceId,
      pageId: table,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(visible.page.map((row) => row.cells[nameColumn.id])).toEqual(["Ceca"]);
  });

  test("„Vrati ovu verziju” beleške vraća prilog koji je prune sklonio", async () => {
    const s = await seed();
    const note = await s.createPage("note", "Beleška sa slikom");
    const image = await s.upload(note, "slika.png");
    const withImage = `<p>Tekst</p><img data-file-id="${image.fileId}" />`;
    let page = await s.asAuthor.query(api.prostor.pages.get, { workspaceId: s.workspaceId, pageId: note });
    await s.asAuthor.mutation(api.prostor.pages.update, {
      workspaceId: s.workspaceId,
      pageId: note,
      content: withImage,
      expectedRevision: page.revision,
    });
    page = await s.asAuthor.query(api.prostor.pages.get, { workspaceId: s.workspaceId, pageId: note });
    // Drugi autor (posle prozora spajanja) briše sliku iz teksta.
    await s.asMember.mutation(api.prostor.pages.update, {
      workspaceId: s.workspaceId,
      pageId: note,
      content: "<p>Tekst</p>",
      expectedRevision: page.revision,
    });
    await s.t.run((ctx) =>
      ctx.db.patch("pageFiles", image.fileId, {
        createdAt: Date.now() - PRUNE_GRACE_MS - 1_000,
      }),
    );
    await s.asMember.mutation(api.prostor.pageFiles.prune, {
      workspaceId: s.workspaceId,
      pageId: note,
      keepFileIds: [],
    });
    expect(await s.asAuthor.query(api.prostor.pageFiles.list, { workspaceId: s.workspaceId, pageId: note })).toEqual(
      [],
    );

    const history = await s.asAuthor.query(api.prostor.history.list, {
      workspaceId: s.workspaceId,
      target: { kind: "page", id: note },
      paginationOpts: { numItems: 10, cursor: null },
    });
    const withImageRevision = history.page.find(
      (revision) => revision.kind === "edit" && revision.excerpt === "Tekst" &&
        revision.contentLength === withImage.length,
    );
    expect(withImageRevision).toBeDefined();
    page = await s.asAuthor.query(api.prostor.pages.get, { workspaceId: s.workspaceId, pageId: note });
    await s.asAuthor.mutation(api.prostor.history.restore, {
      workspaceId: s.workspaceId,
      revisionId: withImageRevision!._id,
      expectedRevision: page.revision,
    });
    const files = await s.asAuthor.query(api.prostor.pageFiles.list, { workspaceId: s.workspaceId, pageId: note });
    expect(files.map((file) => file._id)).toEqual([image.fileId]);
  });
});
