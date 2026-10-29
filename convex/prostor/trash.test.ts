/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/trash.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

/**
 * PROSTOR K03: Korpa (P3, P19) kroz javni API — brisanje grane, vraćanje na
 * isto mesto, roditelj i dalje u Korpi, zaključane stranice (D4, D6), ideje sa
 * vezama, prilozi, „Oporavljeno" i negativni slučajevi (nečlan, uklonjen član,
 * arhiviran profil, drugi startup).
 */

const modules = import.meta.glob("/convex/**/*.*s");
const PAGE = { numItems: 20, cursor: null };

async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      options: { role?: "admin" | "member"; archived?: boolean } = {},
    ) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: options.role ?? "member",
        archivedAt: options.archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await person("Owner");
    const admin = await person("Admin", { role: "admin" });
    const author = await person("Author");
    const member = await person("Member");
    const helper = await person("Helper");
    const outsider = await person("Outsider");
    const removed = await person("Removed");
    const archived = await person("Archived", { archived: true });
    const startupA = await insertStartup(ctx, {
      name: "Startup A",
      description: "",
      createdByProfileId: owner.profileId,
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
    const join = (
      workspaceId: Id<"workspaces">,
      profileId: Id<"profiles">,
      archivedAt: number | null = null,
    ) =>
      insertClanstvo(ctx, {
        workspaceId,
        profileId,
        addedByProfileId: owner.profileId,
        archivedAt,
        createdAt: now,
      });
    for (const p of [owner, admin, author, member, helper, archived]) {
      await join(startupA, p.profileId);
    }
    await join(startupA, removed.profileId, now);
    await join(startupB, outsider.profileId);
    const areaId = await ctx.db.insert("areas", {
      workspaceId: startupA,
      key: "dev",
      label: "Razvoj",
      position: 0,
      createdAt: now,
    });
    const areaB = await ctx.db.insert("areas", {
      workspaceId: startupB,
      key: "dev",
      label: "Razvoj B",
      position: 0,
      createdAt: now,
    });
    return {
      owner,
      admin,
      author,
      member,
      helper,
      outsider,
      removed,
      archived,
      startupA,
      startupB,
      areaId,
      areaB,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...seeded,
    asOwner: as(seeded.owner),
    asAdmin: as(seeded.admin),
    asAuthor: as(seeded.author),
    asMember: as(seeded.member),
    asHelper: as(seeded.helper),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
    asArchived: as(seeded.archived),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

/** Autorova grana: koren › dete (› unuk), sve kroz `areasV2.createPage`. */
async function authorBranch(s: Seeded, rootPageId: Id<"pages"> | null = null) {
  const make = (title: string, parent: Id<"pages"> | null) =>
    s.asAuthor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      rootPageId: parent,
      kind: "note",
      title,
    });
  const root = (await make("Specifikacija", rootPageId)).pageId;
  const child = (await make("Poglavlje", root)).pageId;
  const grandchild = (await make("Odeljak", child)).pageId;
  return { root, child, grandchild };
}

const getPage = (s: Seeded, pageId: Id<"pages">) =>
  s.t.run((ctx) => ctx.db.get("pages", pageId));

const placementOf = (s: Seeded, pageId: Id<"pages">) =>
  s.t.run((ctx) =>
    ctx.db
      .query("pageCanvasPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
      .unique(),
  );

function errorCode(error: unknown) {
  return (error as { data?: { code?: string } }).data?.code;
}

describe("Korpa: stranice", () => {
  test("član koji nije autor briše tuđu granu, drugi član je vraća na isto mesto sa istim podstablom", async () => {
    const s = await seed();
    const parent = (
      await s.asAuthor.mutation(api.prostor.areasV2.createPage, {
        workspaceId: s.startupA,
        areaId: s.areaId,
        rootPageId: null,
        kind: "note",
        title: "Projekat",
      })
    ).pageId;
    const { root, child, grandchild } = await authorBranch(s, parent);
    // Kontrolna podstranica van grane ne sme da ode u Korpu ni da se vrati.
    const sibling = (
      await s.asAuthor.mutation(api.prostor.areasV2.createPage, {
        workspaceId: s.startupA,
        areaId: s.areaId,
        rootPageId: parent,
        kind: "note",
        title: "Susedna",
      })
    ).pageId;
    const rootPlacement = await placementOf(s, root);

    await s.asMember.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: root });

    // Obrisana kartica ne zauzima mesto ni granicu roditeljevog kanvasa, a
    // raspored joj ostaje sačuvan.
    const parentScope = await s.t.run((ctx) =>
      ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_workspaceId_and_areaId_and_rootPageId", (q) =>
          q
            .eq("workspaceId", s.startupA)
            .eq("areaId", s.areaId)
            .eq("rootPageId", parent),
        )
        .collect(),
    );
    expect(parentScope.map((row) => row.pageId)).toEqual([sibling]);
    expect(await placementOf(s, root)).toMatchObject({
      x: rootPlacement?.x,
      y: rootPlacement?.y,
    });

    const trashed = await Promise.all(
      [root, child, grandchild, sibling].map((id) => getPage(s, id)),
    );
    expect(trashed[0]).toMatchObject({
      archivedAt: expect.any(Number),
      archivedByProfileId: s.member.profileId,
      trashState: "root",
      trashDescendantCount: 2,
      parentPageId: parent,
    });
    for (const descendant of trashed.slice(1, 3)) {
      expect(descendant).toMatchObject({
        archivedAt: trashed[0]!.archivedAt,
        trashState: "descendant",
        archivedWithPageId: root,
      });
    }
    expect(trashed[3]?.archivedAt).toBeNull();
    // Obrisano se ne vidi u listama ni kroz `pages.get`.
    await expect(s.asHelper.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: child })).rejects.toThrow(
      "Stranica nije pronađena.",
    );

    const list = await s.asHelper.query(api.prostor.trash.list, {
      workspaceId: s.startupA,
      kind: "page",
      paginationOpts: PAGE,
    });
    expect(list.page).toEqual([
      {
        kind: "page",
        pageId: root,
        title: "Specifikacija",
        pageKind: "note",
        areaId: s.areaId,
        areaLabel: "Razvoj",
        parentPageId: parent,
        parentTitle: "Projekat",
        parentAvailable: true,
        descendantCount: 2,
        archivedAt: trashed[0]!.archivedAt,
        archivedBy: expect.objectContaining({
          _id: s.member.profileId,
          displayName: "Member",
        }),
        canRestore: true,
      },
    ]);
    expect(
      await s.asHelper.query(api.prostor.trash.counts, { workspaceId: s.startupA }),
    ).toEqual({
      page: { count: 1, capped: false },
      idea: { count: 0, capped: false },
      file: { count: 0, capped: false },
      recovered: { count: 0, capped: false },
    });

    const result = await s.asHelper.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "page", id: root },
    });
    expect(result).toEqual({
      kind: "page",
      restoredCount: 3,
      movedToAreaRoot: false,
    });
    const restored = await Promise.all(
      [root, child, grandchild].map((id) => getPage(s, id)),
    );
    expect(restored.map((page) => page?.parentPageId)).toEqual([
      parent,
      root,
      child,
    ]);
    for (const page of restored) {
      expect(page?.archivedAt).toBeNull();
      expect(page?.trashState).toBeUndefined();
      expect(page?.archivedByProfileId).toBeUndefined();
      expect(page?.archivedWithPageId).toBeUndefined();
      expect(page?.trashDescendantCount).toBeUndefined();
    }
    expect(await placementOf(s, root)).toEqual(
      expect.objectContaining({
        rootPageId: parent,
        x: rootPlacement?.x,
        y: rootPlacement?.y,
      }),
    );
    expect(
      (
        await s.asHelper.query(api.prostor.trash.list, {
          workspaceId: s.startupA,
          kind: "page",
          paginationOpts: PAGE,
        })
      ).page,
    ).toEqual([]);
    await expect(
      s.asHelper.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: grandchild }),
    ).resolves.toMatchObject({ title: "Odeljak" });

    const activities = await s.t.run((ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_workspaceId_and_createdAt", (q) =>
          q.eq("workspaceId", s.startupA),
        )
        .collect(),
    );
    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "page_archived",
          actorProfileId: s.member.profileId,
          targetId: root,
          detail: "Sa 2 podstranice",
        }),
        expect.objectContaining({
          action: "page_restored",
          actorProfileId: s.helper.profileId,
          targetId: root,
          title: "Specifikacija",
          detail: "Sa 2 podstranice",
        }),
      ]),
    );
  });

  test("roditelj i dalje u Korpi → stranica se vraća na vrh oblasti, sa porukom", async () => {
    const s = await seed();
    const { root, child, grandchild } = await authorBranch(s);
    // Prvo dete sámo, pa roditelj — dva odvojena poteza.
    await s.asMember.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: child });
    await s.asMember.mutation(api.prostor.areasV2.archivePage, {
      workspaceId: s.startupA,
      pageId: root,
    });
    expect(await getPage(s, root)).toMatchObject({ trashDescendantCount: 0 });

    const list = await s.asMember.query(api.prostor.trash.list, {
      workspaceId: s.startupA,
      kind: "page",
      paginationOpts: PAGE,
    });
    // Najnovije obrisano prvo; dete pamti da mu roditelj više nije dostupan.
    expect(list.page.map((item) => item.kind === "page" && item.pageId)).toEqual([
      root,
      child,
    ]);
    expect(list.page[1]).toMatchObject({
      parentAvailable: false,
      parentTitle: "Specifikacija",
      descendantCount: 1,
    });

    const result = await s.asHelper.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "page", id: child },
    });
    expect(result).toEqual({
      kind: "page",
      restoredCount: 2,
      movedToAreaRoot: true,
    });
    expect(await getPage(s, child)).toMatchObject({
      archivedAt: null,
      parentPageId: null,
    });
    expect(await getPage(s, grandchild)).toMatchObject({
      archivedAt: null,
      parentPageId: child,
    });
    expect(await placementOf(s, child)).toMatchObject({ rootPageId: null });
    // Koren ostaje u Korpi i vraća se bez deteta koje je već vraćeno.
    expect(await getPage(s, root)).toMatchObject({ trashState: "root" });
    await expect(
      s.asHelper.mutation(api.prostor.trash.restore, {
        workspaceId: s.startupA,
        target: { kind: "page", id: root },
      }),
    ).resolves.toEqual({ kind: "page", restoredCount: 1, movedToAreaRoot: false });
    expect(await getPage(s, child)).toMatchObject({ parentPageId: null });
  });

  test("zaključana stranica: član je ne briše; ne briše ni granu ni dete zaključanog roditelja; autor i menadžer mogu", async () => {
    const s = await seed();
    const { root, child } = await authorBranch(s);
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: child });

    // Zaključana stranica u grani (D6).
    const branchError = await s.asMember
      .mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: root })
      .catch((error: unknown) => error);
    expect(errorCode(branchError)).toBe("ZAKLJUCANO");
    expect(String(branchError)).toContain("Poglavlje");
    // Sama zaključana stranica.
    const lockedError = await s.asMember
      .mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: child })
      .catch((error: unknown) => error);
    expect(errorCode(lockedError)).toBe("ZAKLJUCANO");
    // Dete zaključanog roditelja (R6 — spisak dece je zaključan).
    await s.asAuthor.mutation(api.prostor.pages.unlock, { workspaceId: s.startupA, pageId: child });
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: root });
    const underLocked = await s.asMember
      .mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: child })
      .catch((error: unknown) => error);
    expect(errorCode(underLocked)).toBe("ZAKLJUCANO");
    expect(String(underLocked)).toContain("Specifikacija");
    expect((await getPage(s, child))?.archivedAt).toBeNull();
    expect((await getPage(s, root))?.archivedAt).toBeNull();

    // Admin (menadžer) briše zaključanu granu; zaključanost ostaje posle vraćanja.
    await s.asAdmin.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: root });
    expect(await getPage(s, root)).toMatchObject({ trashState: "root" });
    await s.asMember.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "page", id: root },
    });
    expect(await getPage(s, root)).toMatchObject({
      archivedAt: null,
      lockedAt: expect.any(Number),
    });
  });

  test("vraćanje stavke koja nije u Korpi i ranije arhiviranog sadržaja se odbija", async () => {
    const s = await seed();
    const { root } = await authorBranch(s);
    await expect(
      s.asMember.mutation(api.prostor.trash.restore, { workspaceId: s.startupA, target: { kind: "page", id: root } }),
    ).rejects.toThrow("nije u Korpi");
    // D2: arhivirano pre Korpe (bez `trashState`) se ne prikazuje i ne vraća.
    await s.t.run((ctx) =>
      ctx.db.patch("pages", root, { archivedAt: Date.now() }),
    );
    expect(
      (
        await s.asMember.query(api.prostor.trash.list, {
          workspaceId: s.startupA,
          kind: "page",
          paginationOpts: PAGE,
        })
      ).page,
    ).toEqual([]);
    await expect(
      s.asMember.mutation(api.prostor.trash.restore, { workspaceId: s.startupA, target: { kind: "page", id: root } }),
    ).rejects.toThrow("nije u Korpi");
  });

  test("nečlan, uklonjen član, arhiviran profil i drugi startup ne vide Korpu i ne vraćaju", async () => {
    const s = await seed();
    const { root } = await authorBranch(s);
    await s.asMember.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: root });

    for (const [actor, message] of [
      [s.asOutsider, "Nemaš pristup ovom projektu."],
      [s.asRemoved, "Nemaš pristup ovom projektu."],
      [s.asArchived, "Profil još nije spreman"],
    ] as const) {
      await expect(
        actor.query(api.prostor.trash.list, {
          workspaceId: s.startupA,
          kind: "page",
          paginationOpts: PAGE,
        }),
      ).rejects.toThrow(message);
      await expect(
        actor.query(api.prostor.trash.counts, { workspaceId: s.startupA }),
      ).rejects.toThrow(message);
      await expect(
        actor.mutation(api.prostor.trash.restore, { workspaceId: s.startupA, target: { kind: "page", id: root } }),
      ).rejects.toThrow(message);
      await expect(
        actor.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: root }),
      ).rejects.toThrow();
    }
    // Član drugog startupa vidi samo svoju (praznu) Korpu.
    expect(
      (
        await s.asOutsider.query(api.prostor.trash.list, {
          workspaceId: s.startupB,
          kind: "page",
          paginationOpts: PAGE,
        })
      ).page,
    ).toEqual([]);
    expect((await getPage(s, root))?.trashState).toBe("root");
  });

  test("strana Korpe je ograničena", async () => {
    const s = await seed();
    await expect(
      s.asMember.query(api.prostor.trash.list, {
        workspaceId: s.startupA,
        kind: "page",
        paginationOpts: { numItems: 51, cursor: null },
      }),
    ).rejects.toThrow("najviše 50");
  });
});

describe("Korpa: ideje", () => {
  test("član briše tuđu ideju sa vezama u Korpu; vraćanje vraća i veze čiji je drugi kraj živ", async () => {
    const s = await seed();
    const create = (title: string) =>
      s.asAuthor.mutation(api.prostor.ideas.create, {
        workspaceId: s.startupA,
        title,
        text: title,
      });
    const idea = await create("Glavna ideja");
    const peer = await create("Susedna ideja");
    const gone = await create("Ideja koja odlazi");
    const peerEdge = await s.asAuthor.mutation(api.prostor.ideas.connect, {
      workspaceId: s.startupA,
      nodeAId: idea,
      nodeBId: peer,
    });
    const goneEdge = await s.asAuthor.mutation(api.prostor.ideas.connect, {
      workspaceId: s.startupA,
      nodeAId: idea,
      nodeBId: gone,
    });

    const archived = await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.startupA,
      ideaId: idea,
    });
    expect(archived).toMatchObject({ ideaId: idea, recoveredId: null });
    const edges = await s.t.run(async (ctx) => [
      await ctx.db.get("ideaEdges", peerEdge),
      await ctx.db.get("ideaEdges", goneEdge),
    ]);
    expect(edges.every((edge) => edge?.archivedAt !== null)).toBe(true);
    // Drugi kraj druge veze odlazi zasebno — njegova veza se ne vraća.
    await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.startupA,
      ideaId: gone,
    });

    const list = await s.asHelper.query(api.prostor.trash.list, {
      workspaceId: s.startupA,
      kind: "idea",
      paginationOpts: PAGE,
    });
    expect(list.page.map((item) => item.kind === "idea" && item.title)).toEqual([
      "Ideja koja odlazi",
      "Glavna ideja",
    ]);
    expect(list.page[1]).toMatchObject({
      archivedBy: expect.objectContaining({ _id: s.member.profileId }),
      canRestore: true,
    });

    await s.asHelper.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "idea", id: idea },
    });
    const after = await s.t.run(async (ctx) => ({
      idea: await ctx.db.get("ideaNodes", idea),
      peerEdge: await ctx.db.get("ideaEdges", peerEdge),
      goneEdge: await ctx.db.get("ideaEdges", goneEdge),
    }));
    expect(after.idea?.archivedAt).toBeNull();
    expect(after.idea?.trashState).toBeUndefined();
    expect(after.peerEdge?.archivedAt).toBeNull();
    expect(after.goneEdge?.archivedAt).not.toBeNull();
    const listed = await s.asHelper.query(api.prostor.ideas.list, {
      workspaceId: s.startupA,
    });
    expect(listed.edges.map((edge) => edge._id)).toEqual([peerEdge]);

    const activities = await s.t.run((ctx) =>
      ctx.db
        .query("activities")
        .withIndex("by_workspaceId_and_createdAt", (q) =>
          q.eq("workspaceId", s.startupA),
        )
        .collect(),
    );
    expect(activities.map((row) => row.action)).toEqual(
      expect.arrayContaining(["idea_archived", "idea_restored"]),
    );
  });

  test("veza dve obrisane ideje se vraća bez obzira na redosled vraćanja", async () => {
    const s = await seed();
    const create = (title: string) =>
      s.asAuthor.mutation(api.prostor.ideas.create, {
        workspaceId: s.startupA,
        title,
        text: title,
      });
    const x = await create("X");
    const y = await create("Y");
    const edgeId = await s.asAuthor.mutation(api.prostor.ideas.connect, {
      workspaceId: s.startupA,
      nodeAId: x,
      nodeBId: y,
    });
    // Obe u Korpu (X pa Y), pa vraćanje istim redom: X bi ranije „zaboravio" vezu.
    for (const id of [x, y]) {
      await s.asMember.mutation(api.prostor.ideas.archive, {
        workspaceId: s.startupA,
        ideaId: id,
      });
    }
    for (const id of [x, y]) {
      await s.asMember.mutation(api.prostor.trash.restore, {
        workspaceId: s.startupA,
        target: { kind: "idea", id },
      });
    }
    expect(
      (await s.t.run((ctx) => ctx.db.get("ideaEdges", edgeId)))?.archivedAt,
    ).toBeNull();
  });

  test("ideja čiji je roditelj u međuvremenu obrisan vraća se na vrh, na istom mestu", async () => {
    const s = await seed();
    const parent = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Roditelj",
      text: "Roditelj",
      x: 100,
      y: 50,
    });
    const child = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Dete",
      text: "Dete",
      x: 160,
      y: 90,
    });
    await s.asAuthor.mutation(api.prostor.collaboration.requestNesting, {
      workspaceId: s.startupA,
      childIdeaId: child,
      parentIdeaId: parent,
    });
    await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.startupA,
      ideaId: child,
    });
    await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.startupA,
      ideaId: parent,
    });
    await s.asMember.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "idea", id: child },
    });
    const restored = await s.t.run((ctx) => ctx.db.get("ideaNodes", child));
    expect(restored?.parentIdeaId).toBeUndefined();
    expect(restored).toMatchObject({ x: 160, y: 90, archivedAt: null });
  });

  test("ideju iz drugog startupa ne vraća ni ne briše niko spolja", async () => {
    const s = await seed();
    const idea = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Tajna",
      text: "Tajna",
    });
    await expect(
      s.asOutsider.mutation(api.prostor.ideas.archive, {
        workspaceId: s.startupA,
        ideaId: idea,
      }),
    ).rejects.toThrow("Nemaš pristup");
    await expect(
      s.asOutsider.mutation(api.prostor.ideas.archive, {
        workspaceId: s.startupB,
        ideaId: idea,
      }),
    ).rejects.toThrow("Ideja nije pronađena.");
    await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.startupA,
      ideaId: idea,
    });
    await expect(
      s.asOutsider.mutation(api.prostor.trash.restore, { workspaceId: s.startupA, target: { kind: "idea", id: idea } }),
    ).rejects.toThrow("Nemaš pristup");
    await expect(
      s.asRemoved.mutation(api.prostor.ideas.restoreOwn, {
        workspaceId: s.startupA,
        ideaId: idea,
      }),
    ).rejects.toThrow("Nemaš pristup");
    // „Poništi" (stari restoreOwn) radi svaki član, ne samo autor.
    await expect(
      s.asHelper.mutation(api.prostor.ideas.restoreOwn, {
        workspaceId: s.startupA,
        ideaId: idea,
      }),
    ).resolves.toBe(idea);
  });
});

describe("Korpa: prilozi i Oporavljeno", () => {
  async function fileFixture(s: Seeded) {
    const pageId = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      parentPageId: null,
      kind: "file",
      title: "Ugovori",
    });
    const { token } = await s.asAuthor.mutation(
      api.prostor.pageFiles.generateUploadUrl,
      { workspaceId: s.startupA, pageId },
    );
    const storageId = await s.t.run((ctx) =>
      ctx.storage.store(new Blob(["pdf"], { type: "application/pdf" })),
    );
    const attached = await s.asAuthor.mutation(api.prostor.pageFiles.attach, {
      workspaceId: s.startupA,
      pageId,
      storageId,
      token,
      name: "ugovor.pdf",
    });
    if (!attached.ok) throw new Error(attached.message);
    return { pageId, fileId: attached.fileId, storageId };
  }

  test("prilog stranice u Korpi ne može da se vrati dok se stranica ne vrati", async () => {
    const s = await seed();
    const { pageId, fileId, storageId } = await fileFixture(s);
    await s.asMember.mutation(api.prostor.pageFiles.remove, { workspaceId: s.startupA, fileId });
    await s.asMember.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId });

    const list = await s.asHelper.query(api.prostor.trash.list, {
      workspaceId: s.startupA,
      kind: "file",
      paginationOpts: PAGE,
    });
    expect(list.page).toEqual([
      expect.objectContaining({
        kind: "file",
        fileId,
        pageId,
        pageTitle: "Ugovori",
        pageAvailable: false,
        canRestore: false,
        category: "pdf",
      }),
    ]);
    await expect(
      s.asHelper.mutation(api.prostor.trash.restore, { workspaceId: s.startupA, target: { kind: "file", id: fileId } }),
    ).rejects.toThrow("prvo vrati nju");

    await s.asHelper.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "page", id: pageId },
    });
    await s.asHelper.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "file", id: fileId },
    });
    expect(
      (await s.asAuthor.query(api.prostor.pageFiles.list, { workspaceId: s.startupA, pageId })).map((f) => f._id),
    ).toEqual([fileId]);
    expect(
      await s.t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).not.toBeNull();
  });

  test("prilog zaključane stranice uklanja i vraća samo autor, vlasnik i admin", async () => {
    const s = await seed();
    const { pageId, fileId } = await fileFixture(s);
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId });
    const error = await s.asMember
      .mutation(api.prostor.pageFiles.remove, { workspaceId: s.startupA, fileId })
      .catch((e: unknown) => e);
    expect(errorCode(error)).toBe("ZAKLJUCANO");
    await s.asOwner.mutation(api.prostor.pageFiles.remove, { workspaceId: s.startupA, fileId });
    const list = await s.asMember.query(api.prostor.trash.list, {
      workspaceId: s.startupA,
      kind: "file",
      paginationOpts: PAGE,
    });
    expect(list.page[0]).toMatchObject({ pageAvailable: true, canRestore: false });
    const restoreError = await s.asMember
      .mutation(api.prostor.trash.restore, { workspaceId: s.startupA, target: { kind: "file", id: fileId } })
      .catch((e: unknown) => e);
    expect(errorCode(restoreError)).toBe("ZAKLJUCANO");
    await s.asAuthor.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "file", id: fileId },
    });
  });

  test("Oporavljeno: vidi ga svaki član, uklanja onaj za koga je sačuvano ili menadžer", async () => {
    const s = await seed();
    const recoveredId = await s.t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("recoveredContent", {
        workspaceId: s.startupA,
        title: "Sačuvan sadržaj iz „Stari plan”",
        sourceKind: "page",
        sourceTargetId: "stari",
        createdByProfileId: s.author.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("contentContributions", {
        workspaceId: s.startupA,
        targetKind: "recovered",
        targetKey: `recovered:${id}`,
        targetId: id,
        authorProfileId: s.author.profileId,
        attribution: "author",
        content: "<p>Moj <strong>raniji</strong> tekst</p>",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const list = await s.asMember.query(api.prostor.trash.list, {
      workspaceId: s.startupA,
      kind: "recovered",
      paginationOpts: PAGE,
    });
    expect(list.page).toEqual([
      expect.objectContaining({
        kind: "recovered",
        recoveredId,
        sourceKind: "page",
        owner: expect.objectContaining({ _id: s.author.profileId }),
        contributions: [
          expect.objectContaining({ excerpt: "Moj raniji tekst" }),
        ],
        canDismiss: false,
      }),
    ]);
    const memberError = await s.asMember
      .mutation(api.prostor.trash.dismissRecovered, { workspaceId: s.startupA, recoveredId })
      .catch((e: unknown) => e);
    expect(errorCode(memberError)).toBe("NEMA_DOZVOLU");
    await expect(
      s.asOutsider.mutation(api.prostor.trash.dismissRecovered, { workspaceId: s.startupA, recoveredId }),
    ).rejects.toThrow("Nemaš pristup");
    await s.asOwner.mutation(api.prostor.trash.dismissRecovered, { workspaceId: s.startupA, recoveredId });
    expect(
      (await s.t.run((ctx) => ctx.db.get("recoveredContent", recoveredId)))
        ?.archivedAt,
    ).toEqual(expect.any(Number));
    expect(
      (
        await s.asMember.query(api.prostor.trash.counts, { workspaceId: s.startupA })
      ).recovered,
    ).toEqual({ count: 0, capped: false });
  });
});
