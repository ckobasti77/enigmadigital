/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/pages.security.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seedPagesSecurityWorkspace() {
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
    const actor = await createPerson("Actor");
    const member = await createPerson("Member");
    const outsider = await createPerson("Outsider");
    const startupA = await insertStartup(ctx, {
      name: "Startup A",
      description: "",
      createdByProfileId: actor.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const startupB = await insertStartup(ctx, {
      name: "Startup B",
      description: "",
      createdByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const profileId of [actor.profileId, member.profileId]) {
      await insertClanstvo(ctx, {
        workspaceId: startupA,
        profileId,
        addedByProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await insertClanstvo(ctx, {
      workspaceId: startupB,
      profileId: outsider.profileId,
      addedByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
    });
    const createArea = (
      workspaceId: Id<"workspaces">,
      key: string,
      position: number,
    ) =>
      ctx.db.insert("areas", {
        workspaceId,
        key,
        label: key,
        position,
        createdAt: now,
      });
    const areaA1 = await createArea(startupA, "a-1", 0);
    const areaA2 = await createArea(startupA, "a-2", 1);
    const areaB = await createArea(startupB, "b", 0);
    return {
      actor,
      member,
      outsider,
      startupA,
      startupB,
      areaA1,
      areaA2,
      areaB,
    };
  });
  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...seeded,
    asActor: asPerson(seeded.actor),
    asMember: asPerson(seeded.member),
    asOutsider: asPerson(seeded.outsider),
  };
}

describe("bezbednost stranica i poslovnih oblasti", () => {
  test("kind pagination ne skriva belešku iza prvih 50 taskova", async () => {
    const { t, actor, startupA, areaA1, asActor } =
      await seedPagesSecurityWorkspace();
    const noteId = await t.run(async (ctx) => {
      const now = Date.now();
      const insertedNoteId = await ctx.db.insert("pages", {
        workspaceId: startupA,
        areaId: areaA1,
        parentPageId: null,
        kind: "note",
        title: "Beleška na kraju mešovite stranice",
        searchText: "",
        revision: 0,
        position: 0,
        taskStatus: null,
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        createdByProfileId: actor.profileId,
        updatedByProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      for (let index = 1; index <= 51; index += 1) {
        await ctx.db.insert("pages", {
          workspaceId: startupA,
          areaId: areaA1,
          parentPageId: null,
          kind: "task",
          title: `Task ${index}`,
          searchText: "",
          revision: 0,
          position: index,
          taskStatus: "backlog",
          taskPriority: null,
          assigneeProfileId: null,
          dueDate: null,
          taskSortAt: now,
          createdByProfileId: actor.profileId,
          updatedByProfileId: actor.profileId,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      return insertedNoteId;
    });

    const mixedPage = await asActor.query(api.prostor.pages.listChildren, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(mixedPage.page).toHaveLength(50);
    expect(mixedPage.page.map((page) => page._id)).not.toContain(noteId);

    const notePage = await asActor.query(api.prostor.pages.listChildren, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      paginationOpts: { numItems: 50, cursor: null },
    });
    expect(notePage.page).toEqual([
      expect.objectContaining({ _id: noteId, kind: "note" }),
    ]);
  });

  test("kanvas prikazuje instrukciju taska i tekst tela beleške", async () => {
    const { startupA, areaA1, asActor } =
      await seedPagesSecurityWorkspace();
    const taskId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "task",
      title: "Task sa instrukcijom",
      instructions: "  Pripremi materijal za sastanak.  ",
    });
    const convertedTaskId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "task",
      title: "Task sa body fallback-om",
      content: "<p>Tekst prenet iz ideje</p>",
    });
    const noteId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Beleška sa sadržajem",
      content: "<p>Važan <strong>tekst</strong></p>",
    });

    const [taskCanvas, noteCanvas] = await Promise.all([
      asActor.query(api.prostor.canvases.getAreaCanvas, {
        workspaceId: startupA,
        areaId: areaA1,
        kind: "task",
      }),
      asActor.query(api.prostor.canvases.getAreaCanvas, {
        workspaceId: startupA,
        areaId: areaA1,
        kind: "note",
      }),
    ]);

    expect(taskCanvas.pages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: taskId,
          text: "Pripremi materijal za sastanak.",
        }),
        expect.objectContaining({
          _id: convertedTaskId,
          text: "Tekst prenet iz ideje",
        }),
      ]),
    );
    expect(noteCanvas.pages).toEqual([
      expect.objectContaining({
        _id: noteId,
        text: "Važan tekst",
      }),
    ]);
  });

  test("oštećen cross-tenant parent lanac ne otkriva tuđ naslov", async () => {
    const {
      t,
      startupA,
      startupB,
      areaA1,
      areaB,
      asActor,
      asOutsider,
    } = await seedPagesSecurityWorkspace();
    const localPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Lokalna stranica",
    });
    const foreignParentId = await asOutsider.mutation(api.prostor.pages.create, {
      workspaceId: startupB,
      areaId: areaB,
      parentPageId: null,
      kind: "note",
      title: "Tajni naslov drugog startupa",
    });
    await t.run((ctx) =>
      ctx.db.patch("pages", localPageId, { parentPageId: foreignParentId }),
    );

    await expect(
      asActor.query(api.prostor.pages.get, { workspaceId: startupA, pageId: localPageId }),
    ).rejects.toThrow("Stranica nije pronađena");
    await expect(
      asActor.query(api.prostor.pages.getBreadcrumbs, { workspaceId: startupA, pageId: localPageId }),
    ).rejects.toThrow("Stranica nije pronađena");
  });

  test.each(["note", "task"] as const)(
    "autor može odmah da upiše sadržaj u praznu %s stranicu",
    async (kind) => {
      const { t, actor, startupA, areaA1, asActor } =
        await seedPagesSecurityWorkspace();
      const pageId = await asActor.mutation(api.prostor.pages.create, {
        workspaceId: startupA,
        areaId: areaA1,
        parentPageId: null,
        kind,
        title: `Prazan ${kind}`,
      });

      const created = await asActor.query(api.prostor.pages.get, { workspaceId: startupA, pageId });
      expect(created.content).toBe("");
      expect(created.permissions.canEditBody).toBe(true);

      const provenance = await t.run((ctx) =>
        ctx.db
          .query("contentContributions")
          .withIndex("by_sourceKind_and_sourceId", (q) =>
            q.eq("sourceKind", "page_body").eq("sourceId", pageId),
          )
          .unique(),
      );
      expect(provenance).toMatchObject({
        workspaceId: startupA,
        targetKind: "page",
        targetId: pageId,
        authorProfileId: actor.profileId,
        attribution: "author",
        sourceKind: "page_body",
        sourceId: pageId,
        content: "",
        archivedAt: null,
      });

      await expect(
        asActor.mutation(api.prostor.pages.update, {
          workspaceId: startupA,
          pageId,
          expectedRevision: 0,
          content: "<p>Prvi sadržaj</p>",
        }),
      ).resolves.toMatchObject({ pageId, revision: 1 });

      const updated = await asActor.query(api.prostor.pages.get, { workspaceId: startupA, pageId });
      expect(updated.content).toBe("<p>Prvi sadržaj</p>");
      expect(updated.permissions.canEditBody).toBe(true);
    },
  );

  test("postojeća prazna stranica sama obnavlja nedostajući zapis autorstva", async () => {
    const { t, actor, startupA, areaA1, asActor } =
      await seedPagesSecurityWorkspace();
    const pageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "task",
      title: "Raniji prazan task",
    });
    await t.run(async (ctx) => {
      const contribution = await ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_body").eq("sourceId", pageId),
        )
        .unique();
      if (contribution === null) throw new Error("Test zapis nije pronađen.");
      await ctx.db.delete("contentContributions", contribution._id);
    });

    const before = await asActor.query(api.prostor.pages.get, { workspaceId: startupA, pageId });
    expect(before.permissions.canEditBody).toBe(true);
    await asActor.mutation(api.prostor.pages.update, {
      workspaceId: startupA,
      pageId,
      expectedRevision: 0,
      content: "<p>Oporavljen sadržaj</p>",
    });

    const repaired = await t.run((ctx) =>
      ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_body").eq("sourceId", pageId),
        )
        .unique(),
    );
    expect(repaired).toMatchObject({
      authorProfileId: actor.profileId,
      content: "<p>Oporavljen sadržaj</p>",
      attribution: "author",
    });
  });

  test("nepotpisan raniji sadržaj menja svaki član, a zatečeno stanje ostaje u Istoriji", async () => {
    // PROSTOR P1/P2 (namerna promena pravila): ranije je „raniji zajednički
    // sadržaj" bio zaključan za sve; sada ga menja svaki član, a zatečeno stanje
    // ostaje kao bazna revizija bez autora.
    const { t, startupA, areaA1, asActor, asMember } =
      await seedPagesSecurityWorkspace();
    const pageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Raniji zajednički sadržaj",
      content: "<p>Nasleđen tekst</p>",
    });
    await t.run(async (ctx) => {
      const contribution = await ctx.db
        .query("contentContributions")
        .withIndex("by_sourceKind_and_sourceId", (q) =>
          q.eq("sourceKind", "page_body").eq("sourceId", pageId),
        )
        .unique();
      if (contribution === null) throw new Error("Test zapis nije pronađen.");
      await ctx.db.delete("contentContributions", contribution._id);
    });

    // Raniji sadržaj nije potpisan, ali stranica je već menjana (revision 1),
    // pa autor bazne revizije nije poznat.
    await t.run((ctx) => ctx.db.patch("pages", pageId, { revision: 1 }));
    const page = await asMember.query(api.prostor.pages.get, { workspaceId: startupA, pageId });
    expect(page.permissions.canEditBody).toBe(true);
    await asMember.mutation(api.prostor.pages.update, {
      workspaceId: startupA,
      pageId,
      expectedRevision: 1,
      content: "<p>Izmena člana</p>",
    });
    const revisions = await asActor.query(api.prostor.history.list, {
      workspaceId: startupA,
      target: { kind: "page", id: pageId },
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(revisions.page.map((row) => [row.kind, row.author])).toEqual([
      ["edit", expect.objectContaining({ displayName: "Member" })],
      ["baseline", null],
    ]);
    expect(revisions.page[1].excerpt).toBe("Nasleđen tekst");
  });

  // Nije preneto (S01 §1.4): „legacy body backfill ne duplira canonical ni raniji bodyId zapis“ – migracije se ne prenose (P21).

  test("osnovni HTML nije prikazan među plain-text doprinosima članova", async () => {
    const { startupA, areaA1, asActor, asMember } =
      await seedPagesSecurityWorkspace();
    const pageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Bezbedan prikaz",
      content: "<p>Formatirana osnova</p>",
    });
    const payload =
      '<img src=x onerror="globalThis.__xss = true">Tekst člana';
    const entryId = await asMember.mutation(api.prostor.pages.addEntry, {
      workspaceId: startupA,
      pageId,
      content: payload,
    });

    const visible = await asActor.query(
      api.prostor.collaboration.listContributions,
      { workspaceId: startupA, target: { kind: "page", id: pageId } },
    );
    expect(visible).toEqual([
      expect.objectContaining({
        sourceKind: "page_entry",
        sourceId: entryId,
        content: payload,
      }),
    ]);
  });

  test("paginacija ne gubi 200. unos zbog skrivenog osnovnog sadržaja", async () => {
    const { t, actor, startupA, areaA1, asActor } =
      await seedPagesSecurityWorkspace();
    const pageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Mnogo doprinosa",
      content: "<p>Osnova koja se ne prikazuje u listi</p>",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 200; index += 1) {
        await ctx.db.insert("contentContributions", {
          workspaceId: startupA,
          targetKind: "page",
          targetKey: `page:${pageId}`,
          targetId: pageId,
          authorProfileId: actor.profileId,
          attribution: "author",
          content: `Doprinos ${index + 1}`,
          sourceKind: "page_entry",
          sourceId: `legacy-entry-${index + 1}`,
          moderationStatus: "approved",
          archivedAt: null,
          createdAt: now + index,
          updatedAt: now + index,
        });
      }
    });

    const visibleIds = new Set<string>();
    let cursor: string | null = null;
    let isDone = false;
    for (let pageIndex = 0; pageIndex < 10 && !isDone; pageIndex += 1) {
      const result: {
        page: Array<{
          _id: Id<"contentContributions">;
          sourceKind?: "idea_original" | "page_entry" | "page_body";
        }>;
        continueCursor: string;
        isDone: boolean;
      } = await asActor.query(
        api.prostor.collaboration.listContributionsPaginated,
        {
          workspaceId: startupA,
          target: { kind: "page", id: pageId },
          paginationOpts: { numItems: 40, cursor },
        },
      );
      for (const contribution of result.page) {
        expect(contribution.sourceKind).toBe("page_entry");
        visibleIds.add(contribution._id);
      }
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    expect(isDone).toBe(true);
    expect(visibleIds.size).toBe(200);
  });

  // PROSTOR K03 (P4, D4): podstranicu pod tuđom stranicom pravi svaki član;
  // spisak dece zaključane stranice menjaju samo autor, vlasnik i admin.
  test("član pravi podstranicu pod tuđom stranicom, a pod zaključanom ne", async () => {
    const { t, startupA, areaA1, asActor, asMember } =
      await seedPagesSecurityWorkspace();
    const foreignParentId = await asMember.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Tuđi parent",
    });
    const childId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: foreignParentId,
      kind: "task",
      title: "Dete bez odobrenja",
    });
    expect(await t.run((ctx) => ctx.db.get("pages", childId))).toMatchObject({
      parentPageId: foreignParentId,
    });

    // Actor je vlasnik startupa; zaključanu stranicu ne menja običan član.
    const lockedParentId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Zaključan parent",
    });
    await asActor.mutation(api.prostor.pages.lock, {
      workspaceId: startupA,
      pageId: lockedParentId,
    });
    const lockedError = await asMember
      .mutation(api.prostor.pages.create, {
        workspaceId: startupA,
        areaId: areaA1,
        parentPageId: lockedParentId,
        kind: "task",
        title: "Pod zaključanim",
      })
      .catch((error: unknown) => error);
    expect(String(lockedError)).toContain("Zaključan parent");
    expect((lockedError as { data?: { code?: string } }).data?.code).toBe(
      "ZAKLJUCANO",
    );

    const children = await t.run((ctx) =>
      ctx.db
        .query("pages")
        .withIndex("by_parentPageId_and_archivedAt", (q) =>
          q.eq("parentPageId", lockedParentId).eq("archivedAt", null),
        )
        .take(2),
    );
    expect(children).toHaveLength(0);
  });

  // PROSTOR K03 (D1): brisanje šalje celu granu u Korpu — 201 dete ide sa
  // roditeljem (ranije: „više od 200" odbijeno), a grana preko 250 se odbija
  // bez ijedne izmene.
  test("brisanje šalje granu do 250 stranica u Korpu, a veću odbija bez izmena", async () => {
    const { t, actor, startupA, areaA1, asActor } =
      await seedPagesSecurityWorkspace();
    const parentPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Veliki parent",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 201; index += 1) {
        await ctx.db.insert("pages", {
          workspaceId: startupA,
          areaId: areaA1,
          parentPageId,
          kind: "note",
          title: `Dete ${index + 1}`,
          searchText: "",
          revision: 0,
          position: index,
          taskStatus: null,
          taskPriority: null,
          assigneeProfileId: null,
          dueDate: null,
          taskSortAt: now,
          createdByProfileId: actor.profileId,
          updatedByProfileId: actor.profileId,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    await asActor.mutation(api.prostor.pages.archive, {
      workspaceId: startupA,
      pageId: parentPageId,
    });
    const trashed = await t.run(async (ctx) => {
      const parent = await ctx.db.get("pages", parentPageId);
      const children = await ctx.db
        .query("pages")
        .withIndex("by_parentPageId_and_archivedAt", (q) =>
          q
            .eq("parentPageId", parentPageId)
            .eq("archivedAt", parent?.archivedAt ?? null),
        )
        .take(202);
      return { parent, children };
    });
    expect(trashed.parent).toMatchObject({
      trashState: "root",
      trashDescendantCount: 201,
    });
    expect(trashed.children).toHaveLength(201);
    expect(
      trashed.children.every(
        (child) =>
          child.trashState === "descendant" &&
          child.archivedWithPageId === parentPageId,
      ),
    ).toBe(true);

    const bigParentId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Preveliki parent",
    });
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < 251; index += 1) {
        await ctx.db.insert("pages", {
          workspaceId: startupA,
          areaId: areaA1,
          parentPageId: bigParentId,
          kind: "note",
          title: `Veliko dete ${index + 1}`,
          searchText: "",
          revision: 0,
          position: index,
          taskStatus: null,
          taskPriority: null,
          assigneeProfileId: null,
          dueDate: null,
          taskSortAt: now,
          createdByProfileId: actor.profileId,
          updatedByProfileId: actor.profileId,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    await expect(
      asActor.mutation(api.prostor.pages.archive, {
        workspaceId: startupA,
        pageId: bigParentId,
      }),
    ).rejects.toThrow("više od 250");
    const untouched = await t.run(async (ctx) => ({
      parent: await ctx.db.get("pages", bigParentId),
      children: await ctx.db
        .query("pages")
        .withIndex("by_parentPageId_and_archivedAt", (q) =>
          q.eq("parentPageId", bigParentId).eq("archivedAt", null),
        )
        .take(252),
    }));
    expect(untouched.parent?.archivedAt).toBeNull();
    expect(untouched.children).toHaveLength(251);
  });

  test("svaki član pomera vidljivu karticu na kanvasu oblasti", async () => {
    // PROSTOR P1 (namerna promena pravila, D20): raspored kartica menja svaki
    // član; scope (samo kartice sa kanvasa oblasti) ostaje.
    const { t, actor, startupA, areaA1, asActor, asMember } =
      await seedPagesSecurityWorkspace();
    const actorPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Autorova kartica",
    });
    const nestedPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: actorPageId,
      kind: "task",
      title: "Ugnježđena kartica",
    });

    const memberCanvas = await asMember.query(api.prostor.canvases.getAreaCanvas, {
      workspaceId: startupA,
      areaId: areaA1,
      kind: "note",
    });
    expect(memberCanvas.pages).toEqual([
      expect.objectContaining({ _id: actorPageId, canMove: true }),
    ]);
    await expect(
      asMember.mutation(api.prostor.canvases.moveAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        updates: [{ pageId: actorPageId, x: 120, y: 80 }],
      }),
    ).resolves.toBeNull();
    await expect(
      asActor.mutation(api.prostor.canvases.moveAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        updates: [{ pageId: nestedPageId, x: 120, y: 80 }],
      }),
    ).rejects.toThrow("kanvasa oblasti");

    await expect(
      asActor.mutation(api.prostor.canvases.moveAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        updates: [{ pageId: actorPageId, x: 120, y: 80 }],
      }),
    ).resolves.toBeNull();
    await asActor.mutation(api.prostor.canvases.moveAreaCanvasPages, {
      workspaceId: startupA,
      areaId: areaA1,
      updates: [{ pageId: actorPageId, x: 120, y: 80 }],
    });
    const movedLayouts = await t.run(async (ctx) => ({
      legacy: await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", actorPageId))
        .take(2),
      v2: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", actorPageId))
        .take(2),
    }));
    expect(movedLayouts.legacy).toEqual([
      expect.objectContaining({ pageId: actorPageId, x: 120, y: 80 }),
    ]);
    expect(movedLayouts.v2).toEqual([
      expect.objectContaining({
        workspaceId: startupA,
        areaId: areaA1,
        rootPageId: null,
        pageId: actorPageId,
        x: 120,
        y: 80,
        updatedByProfileId: actor.profileId,
      }),
    ]);

    await asActor.mutation(api.prostor.canvases.resizeAreaCanvasPage, {
      workspaceId: startupA,
      pageId: actorPageId,
      width: 520,
      height: 420,
    });
    const resizedLayouts = await t.run(async (ctx) => ({
      legacy: await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", actorPageId))
        .unique(),
      v2: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", actorPageId))
        .unique(),
    }));
    expect(resizedLayouts.legacy).toMatchObject({
      x: 120,
      y: 80,
      width: 520,
      height: 420,
    });
    expect(resizedLayouts.v2).toMatchObject({
      rootPageId: null,
      x: 120,
      y: 80,
      width: 520,
      height: 420,
      updatedByProfileId: actor.profileId,
    });

    await asActor.mutation(api.prostor.canvases.resetAreaCanvasPageSize, {
      workspaceId: startupA,
      pageId: actorPageId,
    });
    const resetLayouts = await t.run(async (ctx) => ({
      legacy: await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", actorPageId))
        .unique(),
      v2: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", actorPageId))
        .unique(),
    }));
    expect(resetLayouts.legacy).not.toHaveProperty("width");
    expect(resetLayouts.legacy).not.toHaveProperty("height");
    expect(resetLayouts.v2).not.toHaveProperty("width");
    expect(resetLayouts.v2).not.toHaveProperty("height");

    await asActor.mutation(api.prostor.canvases.saveAreaCanvasViewport, {
      workspaceId: startupA,
      areaId: areaA1,
      kind: "note",
      x: 15,
      y: 25,
      zoom: 1.2,
    });
    await asActor.mutation(api.prostor.canvases.saveAreaCanvasViewport, {
      workspaceId: startupA,
      areaId: areaA1,
      kind: "task",
      x: 35,
      y: 45,
      zoom: 1.4,
    });
    const viewports = await t.run(async (ctx) => ({
      legacy: await ctx.db
        .query("pageCanvases")
        .withIndex("by_ownerProfileId_and_areaId_and_kind", (q) =>
          q.eq("ownerProfileId", actor.profileId).eq("areaId", areaA1),
        )
        .collect(),
      v2: await ctx.db
        .query("pageCanvasViewports")
        .withIndex(
          "by_viewerProfileId_and_workspaceId_and_areaId_and_rootPageId",
          (q) =>
            q
              .eq("viewerProfileId", actor.profileId)
              .eq("workspaceId", startupA)
              .eq("areaId", areaA1)
              .eq("rootPageId", null),
        )
        .take(2),
    }));
    expect(viewports.legacy).toHaveLength(2);
    expect(viewports.legacy).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "note", x: 15, y: 25, zoom: 1.2 }),
        expect.objectContaining({ kind: "task", x: 35, y: 45, zoom: 1.4 }),
      ]),
    );
    expect(viewports.v2).toEqual([
      expect.objectContaining({
        rootPageId: null,
        x: 35,
        y: 45,
        zoom: 1.4,
      }),
    ]);
  });

  // PROSTOR K03 (D20): vezu na kanvasu pravi i uklanja svaki član (ranije:
  // „bar jedna svoja kartica" / „samo vezu koju ste napravili"); autorstvo se
  // i dalje beleži, a scope i tip ostaju zaštićeni.
  test("veze kanvasa čuvaju autorstvo, scope i bezbedno uklanjanje, a menja ih svaki član", async () => {
    const {
      t,
      actor,
      startupA,
      startupB,
      areaA1,
      asActor,
      asMember,
    } = await seedPagesSecurityWorkspace();
    const actorPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Autorova kartica",
    });
    const actorPeerId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Autorova druga kartica",
    });
    const memberPageId = await asMember.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Članova kartica",
    });
    const actorTaskId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "task",
      title: "Autorov task",
    });
    const nestedPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: actorPageId,
      kind: "task",
      title: "Dete",
    });
    const relationId = await asActor.mutation(api.prostor.areasV2.createRelation, {
      workspaceId: startupA,
      pageAId: actorPageId,
      pageBId: actorTaskId,
      label: "V2 relacija ostaje nezavisna",
    });

    const memberLegacyEdgeId = await asMember.mutation(
      api.prostor.canvases.connectAreaCanvasPages,
      {
        workspaceId: startupA,
        areaId: areaA1,
        source: actorPageId,
        target: actorPeerId,
      },
    );
    await asActor.mutation(api.prostor.canvases.disconnectAreaCanvasPages, {
      workspaceId: startupA,
      edgeIds: [memberLegacyEdgeId],
    });
    await expect(
      asActor.mutation(api.prostor.canvases.connectAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        source: actorPageId,
        target: nestedPageId,
      }),
    ).rejects.toThrow("kanvasa iste poslovne oblasti");
    await expect(
      asActor.mutation(api.prostor.canvases.connectAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        source: actorPageId,
        target: actorTaskId,
      }),
    ).rejects.toThrow("istog tipa");
    await expect(
      asActor.mutation(api.prostor.pages.connectCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        nodeAId: actorPageId,
        nodeBId: actorTaskId,
      }),
    ).rejects.toThrow("istog tipa");
    await expect(
      asActor.mutation(api.prostor.pages.connectCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        nodeAId: actorPageId,
        nodeBId: nestedPageId,
      }),
    ).rejects.toThrow("kanvasa iste oblasti");

    const edgeId = await asActor.mutation(
      api.prostor.canvases.connectAreaCanvasPages,
      {
        workspaceId: startupA,
        areaId: areaA1,
        source: actorPageId,
        target: memberPageId,
      },
    );
    const pairKey = [actorPageId, memberPageId].sort().join(":");
    const createdEdges = await t.run(async (ctx) => ({
      legacy: await ctx.db.get("pageEdges", edgeId),
      v2: await ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex("by_scope_active_pair", (q) =>
          q
            .eq("workspaceId", startupA)
            .eq("areaId", areaA1)
            .eq("rootPageId", null)
            .eq("archivedAt", null)
            .eq("pairKey", pairKey),
        )
        .take(2),
    }));
    expect(createdEdges.legacy).toMatchObject({
      authorProfileId: actor.profileId,
      archivedAt: null,
    });
    expect(createdEdges.v2).toEqual([
      expect.objectContaining({
        workspaceId: startupA,
        areaId: areaA1,
        rootPageId: null,
        nodeAId: actorPageId,
        nodeBId: memberPageId,
        pairKey,
        authorProfileId: actor.profileId,
        attribution: "author",
        archivedAt: null,
      }),
    ]);
    await expect(
      asActor.mutation(api.prostor.canvases.connectAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        source: actorPageId,
        target: memberPageId,
      }),
    ).resolves.toBe(edgeId);
    const idempotentV2Edges = await t.run((ctx) =>
      ctx.db
        .query("pageCanvasEdgesV2")
        .withIndex("by_scope_active_pair", (q) =>
          q
            .eq("workspaceId", startupA)
            .eq("areaId", areaA1)
            .eq("rootPageId", null)
            .eq("archivedAt", null)
            .eq("pairKey", pairKey),
        )
        .take(2),
    );
    expect(idempotentV2Edges).toHaveLength(1);

    await asMember.mutation(api.prostor.canvases.disconnectAreaCanvasPages, {
      workspaceId: startupA,
      edgeIds: [edgeId],
    });
    await expect(
      t.run((ctx) => ctx.db.get("pageEdges", edgeId)),
    ).resolves.toBeNull();
    const disconnectedState = await t.run(async (ctx) => ({
      relation: await ctx.db.get("pageRelations", relationId),
      v2Edges: await ctx.db
        .query("pageCanvasEdgesV2")
        .filter((q) => q.eq(q.field("pairKey"), pairKey))
        .collect(),
    }));
    expect(disconnectedState.relation).toMatchObject({
      _id: relationId,
      archivedAt: null,
    });
    expect(
      disconnectedState.v2Edges.filter((edge) => edge.archivedAt === null),
    ).toHaveLength(0);
    expect(
      disconnectedState.v2Edges.filter((edge) => edge.archivedAt !== null),
    ).toHaveLength(1);
    const afterArchive = await asActor.query(api.prostor.canvases.getAreaCanvas, {
      workspaceId: startupA,
      areaId: areaA1,
      kind: "note",
    });
    expect(afterArchive.edges).toHaveLength(0);

    const reconnectedEdgeId = await asActor.mutation(
      api.prostor.canvases.connectAreaCanvasPages,
      {
        workspaceId: startupA,
        areaId: areaA1,
        source: actorPageId,
        target: memberPageId,
      },
    );
    expect(reconnectedEdgeId).not.toBe(edgeId);
    const reconnectedV2Edges = await t.run((ctx) =>
      ctx.db
        .query("pageCanvasEdgesV2")
        .filter((q) => q.eq(q.field("pairKey"), pairKey))
        .collect(),
    );
    expect(
      reconnectedV2Edges.filter((edge) => edge.archivedAt === null),
    ).toHaveLength(1);
    expect(
      reconnectedV2Edges.filter((edge) => edge.archivedAt !== null),
    ).toHaveLength(1);

    const legacyEdgeId = await asActor.mutation(api.prostor.pages.connectCanvasPages, {
      workspaceId: startupA,
      areaId: areaA1,
      nodeAId: actorPageId,
      nodeBId: actorPeerId,
    });
    await asMember.mutation(api.prostor.pages.disconnectCanvasPages, {
      workspaceId: startupA,
      edgeId: legacyEdgeId,
    });
    await expect(
      t.run((ctx) => ctx.db.get("pageEdges", legacyEdgeId)),
    ).resolves.toBeNull();

    const taintedEdgeId = await t.run((ctx) =>
      ctx.db.insert("pageEdges", {
        workspaceId: startupB,
        areaId: areaA1,
        nodeAId: actorPageId,
        nodeBId: actorPeerId,
        pairKey: [actorPageId, actorPeerId].sort().join(":"),
        label: "Pogrešan tenant",
        authorProfileId: actor.profileId,
        archivedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const visibleCanvas = await asActor.query(api.prostor.canvases.getAreaCanvas, {
      workspaceId: startupA,
      areaId: areaA1,
      kind: "note",
    });
    expect(visibleCanvas.edges.map((edge) => edge._id)).toEqual([
      reconnectedEdgeId,
    ]);
    expect(visibleCanvas.edges.map((edge) => edge._id)).not.toContain(
      taintedEdgeId,
    );
  });

  test("legacy i aktivni Canvas API odbijaju tuđu oblast i cross-area vezu", async () => {
    const {
      t,
      startupA,
      startupB,
      areaA1,
      areaA2,
      areaB,
      asActor,
      asOutsider,
    } = await seedPagesSecurityWorkspace();
    await asOutsider.mutation(api.prostor.pages.create, {
      workspaceId: startupB,
      areaId: areaB,
      parentPageId: null,
      kind: "note",
      title: "Tajna drugog startupa",
      content: "Ne sme biti vidljivo.",
    });
    const taintedPageId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Interna A kartica",
    });
    const taintedPeerId = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Druga interna A kartica",
    });
    const taintedEdgeId = await t.run((ctx) =>
      ctx.db.insert("pageEdges", {
        workspaceId: startupA,
        areaId: areaB,
        nodeAId: taintedPageId,
        nodeBId: taintedPeerId,
        pairKey: [taintedPageId, taintedPeerId].sort().join(":"),
        label: "Legacy cross-tenant oznaka",
        archivedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );

    await expect(
      asActor.query(api.prostor.pages.listAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaB,
      }),
    ).rejects.toThrow("Oblast nije pronađena");
    await expect(
      asActor.query(api.prostor.canvases.getAreaCanvas, {
        workspaceId: startupA,
        areaId: areaB,
        kind: "note",
      }),
    ).rejects.toThrow("Oblast nije pronađena");
    const outsiderCanvas = await asOutsider.query(
      api.prostor.pages.listAreaCanvasPages,
      { workspaceId: startupB, areaId: areaB },
    );
    expect(outsiderCanvas.edges).toHaveLength(0);

    const pageA = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA1,
      parentPageId: null,
      kind: "note",
      title: "Oblast A",
    });
    const pageB = await asActor.mutation(api.prostor.pages.create, {
      workspaceId: startupA,
      areaId: areaA2,
      parentPageId: null,
      kind: "task",
      title: "Oblast B",
    });

    // PROSTOR K03: veze više nisu vlasničke, pa odbijanje dolazi od opsega.
    await expect(
      asActor.mutation(api.prostor.pages.connectCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        nodeAId: pageA,
        nodeBId: pageB,
      }),
    ).rejects.toThrow("kanvasa iste oblasti");
    await expect(
      asActor.mutation(api.prostor.canvases.connectAreaCanvasPages, {
        workspaceId: startupA,
        areaId: areaA1,
        source: pageA,
        target: pageB,
      }),
    ).rejects.toThrow("iste poslovne oblasti");

    const edges = await t.run((ctx) => ctx.db.query("pageEdges").take(2));
    expect(edges).toEqual([
      expect.objectContaining({
        _id: taintedEdgeId,
        workspaceId: startupA,
        areaId: areaB,
      }),
    ]);
  });

  test("legacy cross-area move delegates to the canonical sidecar transaction", async () => {
    const { t, actor, startupA, areaA1, areaA2, asActor } =
      await seedPagesSecurityWorkspace();
    const occupiedTarget = await asActor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: startupA,
      areaId: areaA2,
      rootPageId: null,
      kind: "task",
      title: "Zauzeto u cilju",
    });
    const root = await asActor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Legacy grana",
    });
    const child = await asActor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      kind: "note",
      title: "Legacy dete",
    });
    const peer = await asActor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Izvorni peer",
    });
    await asActor.mutation(api.prostor.areasV2.connectPages, {
      workspaceId: startupA,
      areaId: areaA1,
      rootPageId: null,
      sourcePageId: root.pageId,
      targetPageId: peer.pageId,
    });
    await asActor.mutation(api.prostor.areasV2.saveViewport, {
      workspaceId: startupA,
      areaId: areaA1,
      rootPageId: root.pageId,
      x: 12,
      y: 24,
      zoom: 1.2,
    });
    const legacyOnlyEdgeId = await t.run((ctx) => {
      const now = Date.now();
      return ctx.db.insert("pageEdges", {
        workspaceId: startupA,
        areaId: areaA1,
        nodeAId: root.pageId,
        nodeBId: child.pageId,
        pairKey: [root.pageId, child.pageId].sort().join(":"),
        label: "Legacy only",
        authorProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      asActor.mutation(api.prostor.pages.move, {
        workspaceId: startupA,
        pageId: root.pageId,
        areaId: areaA2,
        parentPageId: null,
        position: 77,
      }),
    ).resolves.toBe(root.pageId);

    const stored = await t.run(async (ctx) => ({
      root: await ctx.db.get("pages", root.pageId),
      child: await ctx.db.get("pages", child.pageId),
      rootPlacement: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", root.pageId))
        .unique(),
      occupiedPlacement: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) =>
          q.eq("pageId", occupiedTarget.pageId),
        )
        .unique(),
      childLegacyNode: await ctx.db
        .query("pageCanvasNodes")
        .withIndex("by_pageId", (q) => q.eq("pageId", child.pageId))
        .unique(),
      legacyOnlyEdge: await ctx.db.get("pageEdges", legacyOnlyEdgeId),
      viewport: await ctx.db
        .query("pageCanvasViewports")
        .withIndex("by_rootPageId", (q) =>
          q.eq("rootPageId", root.pageId),
        )
        .first(),
    }));
    expect(stored.root).toMatchObject({
      areaId: areaA2,
      parentPageId: null,
      position: 77,
    });
    expect(stored.child).toMatchObject({
      areaId: areaA2,
      parentPageId: root.pageId,
    });
    expect(stored.rootPlacement?.areaId).toBe(areaA2);
    expect(
      `${stored.rootPlacement?.x}:${stored.rootPlacement?.y}`,
    ).not.toBe(
      `${stored.occupiedPlacement?.x}:${stored.occupiedPlacement?.y}`,
    );
    expect(stored.childLegacyNode?.areaId).toBe(areaA2);
    expect(stored.legacyOnlyEdge?.archivedAt).toEqual(expect.any(Number));
    expect(stored.viewport?.areaId).toBe(areaA2);
  });

  test("legacy cross-area move rejects a nested destination atomically", async () => {
    const { t, startupA, areaA1, areaA2, asActor } =
      await seedPagesSecurityWorkspace();
    const source = await asActor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: startupA,
      areaId: areaA1,
      rootPageId: null,
      kind: "note",
      title: "Izvor",
    });
    const targetParent = await asActor.mutation(
      api.prostor.areasV2.createPage,
      {
        workspaceId: startupA,
        areaId: areaA2,
        rootPageId: null,
        kind: "task",
        title: "Ciljni roditelj",
      },
    );
    const before = await t.run(async (ctx) => ({
      page: await ctx.db.get("pages", source.pageId),
      placement: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", source.pageId))
        .unique(),
    }));

    await expect(
      asActor.mutation(api.prostor.pages.move, {
        workspaceId: startupA,
        pageId: source.pageId,
        areaId: areaA2,
        parentPageId: targetParent.pageId,
      }),
    ).rejects.toThrow("samo u koren oblasti");

    const after = await t.run(async (ctx) => ({
      page: await ctx.db.get("pages", source.pageId),
      placement: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", source.pageId))
        .unique(),
    }));
    expect(after).toEqual(before);
  });

  // PROSTOR K03 (D6): grana sa tuđom stranicom se seli; odbija se samo kad u
  // grani postoji zaključana stranica za koju premeštač nema pravo.
  test("cross-area move seli granu drugog autora, a odbija je dok je u njoj tuđa zaključana stranica", async () => {
    const { t, actor, member, startupA, areaA1, areaA2, asMember } =
      await seedPagesSecurityWorkspace();
    const { parentId, childId } = await t.run(async (ctx) => {
      const now = Date.now();
      const base = {
        workspaceId: startupA,
        areaId: areaA1,
        kind: "note" as const,
        searchText: "",
        revision: 0,
        position: 0,
        taskStatus: null,
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      const parentId = await ctx.db.insert("pages", {
        ...base,
        parentPageId: null,
        title: "Grana autora",
        createdByProfileId: actor.profileId,
        updatedByProfileId: actor.profileId,
      });
      const childId = await ctx.db.insert("pages", {
        ...base,
        parentPageId: parentId,
        title: "Dete drugog autora",
        createdByProfileId: actor.profileId,
        updatedByProfileId: actor.profileId,
        lockedAt: now,
        lockedByProfileId: actor.profileId,
      });
      return { parentId, childId };
    });

    // Member nije autor deteta ni menadžer (Actor je vlasnik startupa).
    await t.run((ctx) =>
      ctx.db.patch("pages", parentId, {
        createdByProfileId: member.profileId,
        updatedByProfileId: member.profileId,
      }),
    );
    await expect(
      asMember.mutation(api.prostor.pages.move, {
        workspaceId: startupA,
        pageId: parentId,
        areaId: areaA2,
        parentPageId: null,
      }),
    ).rejects.toThrow("Dete drugog autora");

    const persisted = await t.run(async (ctx) => ({
      parent: await ctx.db.get("pages", parentId),
      child: await ctx.db.get("pages", childId),
    }));
    expect(persisted.parent?.areaId).toBe(areaA1);
    expect(persisted.child?.areaId).toBe(areaA1);

    await t.run((ctx) =>
      ctx.db.patch("pages", childId, { lockedAt: null, lockedByProfileId: null }),
    );
    await asMember.mutation(api.prostor.pages.move, {
      workspaceId: startupA,
      pageId: parentId,
      areaId: areaA2,
      parentPageId: null,
    });
    const moved = await t.run(async (ctx) => ({
      parent: await ctx.db.get("pages", parentId),
      child: await ctx.db.get("pages", childId),
    }));
    expect(moved.parent?.areaId).toBe(areaA2);
    expect(moved.child).toMatchObject({ areaId: areaA2, parentPageId: parentId });
  });
});
