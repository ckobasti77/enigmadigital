/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/pages.collaboration.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { PAGE_PRESENCE_TTL_MS } from "./lib/pagePresence";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

/**
 * PROSTOR K02: dozvole tima (P1), zaključavanje, Istorija izmena (P2) i
 * prisustvo (P23) kroz javni API — uključujući negativne slučajeve (nečlan,
 * uklonjen član, arhiviran profil, drugi startup).
 */

const modules = import.meta.glob("/convex/**/*.*s");
const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 26, 10, 0);

afterEach(() => {
  vi.useRealTimers();
});

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
    for (const p of [owner, admin, author, member, archived]) {
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
    return {
      owner,
      admin,
      author,
      member,
      outsider,
      removed,
      archived,
      startupA,
      startupB,
      areaId,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const asAuthor = as(seeded.author);
  const pageId = await asAuthor.mutation(api.prostor.pages.create, {
    workspaceId: seeded.startupA,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "note",
    title: "Specifikacija",
    content: "<p>Prva verzija</p>",
  });
  return {
    t,
    ...seeded,
    pageId,
    asOwner: as(seeded.owner),
    asAdmin: as(seeded.admin),
    asAuthor,
    asMember: as(seeded.member),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
    asArchived: as(seeded.archived),
  };
}

async function revisionOf(
  t: Awaited<ReturnType<typeof seed>>["t"],
  pageId: Id<"pages">,
) {
  return (await t.run((ctx) => ctx.db.get("pages", pageId)))!.revision;
}

describe("uloge × izmena stranice (P1)", () => {
  test("član, vlasnik i admin menjaju tuđu stranicu; nečlan, uklonjen i arhiviran ne", async () => {
    const s = await seed();
    for (const [actor, title] of [
      [s.asMember, "Član menja"],
      [s.asOwner, "Vlasnik menja"],
      [s.asAdmin, "Admin menja"],
    ] as const) {
      await actor.mutation(api.prostor.pages.update, {
        workspaceId: s.startupA,
        pageId: s.pageId,
        title,
        expectedRevision: await revisionOf(s.t, s.pageId),
      });
    }
    const page = await s.asMember.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: s.pageId });
    expect(page.title).toBe("Admin menja");
    expect(page.permissions).toMatchObject({
      canEdit: true,
      canEditBody: true,
      canRequestDeletion: false,
      canLock: false,
      isLocked: false,
    });

    const revision = await revisionOf(s.t, s.pageId);
    await expect(
      s.asOutsider.mutation(api.prostor.pages.update, {
        workspaceId: s.startupA,
        pageId: s.pageId,
        title: "Upad",
        expectedRevision: revision,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asRemoved.mutation(api.prostor.pages.update, {
        workspaceId: s.startupA,
        pageId: s.pageId,
        title: "Upad",
        expectedRevision: revision,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asArchived.mutation(api.prostor.pages.update, {
        workspaceId: s.startupA,
        pageId: s.pageId,
        title: "Upad",
        expectedRevision: revision,
      }),
    ).rejects.toThrow("Profil još nije spreman. Osveži stranicu.");
    await expect(
      s.asOutsider.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: s.pageId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("opis oblasti menja svaki član, ne i nečlan", async () => {
    const s = await seed();
    const result = await s.asMember.mutation(api.prostor.areasV2.updateAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      content: "<p>Opis tima</p>",
      expectedRevision: 0,
    });
    expect(result.revision).toBe(1);
    const body = await s.asAuthor.query(api.prostor.areasV2.getAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaId,
    });
    expect(body).toMatchObject({
      label: "Razvoj",
      content: "<p>Opis tima</p>",
      revision: 1,
      lastEditor: expect.objectContaining({ displayName: "Member" }),
      permissions: { canEdit: true, canComment: true },
    });
    await expect(
      s.asOutsider.mutation(api.prostor.areasV2.updateAreaBody, {
        workspaceId: s.startupA,
        areaId: s.areaId,
        content: "Upad",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asMember.mutation(api.prostor.areasV2.updateAreaBody, {
        workspaceId: s.startupA,
        areaId: s.areaId,
        content: "Zastarelo",
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "KONFLIKT_IZMENA", currentRevision: 1 } });
  });

  test("misli ostaju vlasničke", async () => {
    const s = await seed();
    const nodeId = await s.asAuthor.mutation(api.prostor.thoughts.createNode, {
      workspaceId: s.startupA,
      title: "Lično",
      text: "Samo moje",
      x: 0,
      y: 0,
      color: "neutral",
    });
    await expect(
      s.asOwner.mutation(api.prostor.thoughts.updateNode, { nodeId, text: "Tuđe" }),
    ).rejects.toThrow("Misao nije pronađena.");
    await expect(
      s.asAdmin.mutation(api.prostor.thoughts.updateNode, { nodeId, text: "Tuđe" }),
    ).rejects.toThrow("Misao nije pronađena.");
  });
});

describe("zaključavanje (P1)", () => {
  test("autor, vlasnik i admin zaključavaju; član čita i komentariše", async () => {
    const s = await seed();
    await expect(
      s.asMember.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId }),
    ).rejects.toMatchObject({ data: { code: "NEMA_DOZVOLU" } });
    await expect(
      s.asOutsider.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");

    const locked = await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId });
    expect(locked.lockedByProfileId).toBe(s.author.profileId);
    // Idempotentno.
    expect(await s.asOwner.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId })).toEqual(locked);

    const asMemberView = await s.asMember.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: s.pageId });
    expect(asMemberView.permissions).toMatchObject({
      canEdit: false,
      canEditBody: false,
      canMove: false,
      canDeleteDirectly: false,
      canComment: true,
      isLocked: true,
      canLock: false,
      canUnlock: false,
    });
    expect(asMemberView.lockedBy?.displayName).toBe("Author");
    expect(asMemberView.lockedAt).toBe(locked.lockedAt);

    const revision = await revisionOf(s.t, s.pageId);
    await expect(
      s.asMember.mutation(api.prostor.pages.update, {
        workspaceId: s.startupA,
        pageId: s.pageId,
        content: "<p>Ne sme</p>",
        expectedRevision: revision,
      }),
    ).rejects.toMatchObject({ data: { code: "ZAKLJUCANO" } });
    await expect(
      s.asMember.mutation(api.prostor.areasV2.updatePage, {
        workspaceId: s.startupA,
        pageId: s.pageId,
        title: "Ne sme",
        expectedRevision: revision,
      }),
    ).rejects.toThrow("zaključana");
    // Komentar radi i na zaključanoj stranici.
    await s.asMember.mutation(api.prostor.collaboration.addContribution, {
      workspaceId: s.startupA,
      target: { kind: "page", id: s.pageId },
      content: "Predlog izmene",
    });
    // Vlasnik i admin menjaju zaključanu.
    await s.asOwner.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      title: "Vlasnik menja zaključanu",
      expectedRevision: revision,
    });
    expect(
      (await s.asAdmin.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: s.pageId })).permissions,
    ).toMatchObject({ canEdit: true, canUnlock: true });

    await s.asAdmin.mutation(api.prostor.pages.unlock, { workspaceId: s.startupA, pageId: s.pageId });
    await s.asMember.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "<p>Opet otključano</p>",
      expectedRevision: await revisionOf(s.t, s.pageId),
    });

    const actions = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("activities")
          .withIndex("by_workspaceId_and_createdAt", (q) =>
            q.eq("workspaceId", s.startupA),
          )
          .collect()
      ).map((row) => [row.action, row.title]),
    );
    expect(actions).toContainEqual(["page_locked", "Specifikacija"]);
    expect(actions).toContainEqual(["page_unlocked", "Vlasnik menja zaključanu"]);
    const feed = await s.asMember.query(api.prostor.activity.listPaginated, {
      workspaceId: s.startupA,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(feed.page.some((row) => row.action === "page_locked")).toBe(true);
  });

  test("kartica zaključane stranice na Mapi: raspored da, izmena ne (D20)", async () => {
    const s = await seed();
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId });
    const card = (
      await s.asMember.query(api.prostor.areasV2.getCanvas, {
        workspaceId: s.startupA,
        areaId: s.areaId,
        rootPageId: null,
      })
    ).pages.find((row) => row._id === s.pageId);
    expect(card).toMatchObject({ canEdit: false, isLocked: true, canMove: true, canResize: true });
  });

  test("zaključan zadatak: izvršilac menja status, ne i rok; liste nose lockedForViewer (D5)", async () => {
    const s = await seed();
    const taskId = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      parentPageId: null,
      kind: "task",
      title: "Zadatak",
    });
    await s.asAuthor.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId: s.startupA,
      taskPageId: taskId,
      profileIds: [s.member.profileId, s.owner.profileId],
    });
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: taskId });

    const lockedFor = async (who: typeof s.asMember) =>
      (
        await who.query(api.prostor.tasks.listEverywhere, { scope: "open", workspaceId: s.startupA })
      ).items.find((item) => item._id === taskId);
    expect(await lockedFor(s.asMember)).toMatchObject({ isLocked: true, lockedForViewer: true });
    expect(await lockedFor(s.asOwner)).toMatchObject({ isLocked: true, lockedForViewer: false });

    await s.asMember.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: taskId, status: "in_progress" });
    await expect(
      s.asMember.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: taskId, dueDate: null, priority: "high" }),
    ).rejects.toMatchObject({ data: { code: "ZAKLJUCANO" } });
    await expect(
      s.asAdmin.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: taskId, status: "done" }),
    ).resolves.not.toThrow();
  });
});

describe("Istorija izmena (P2)", () => {
  test("bazna revizija, spajanje 10 min istog autora, nova za drugog autora", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const s = await seed();
    const list = async () =>
      (
        await s.asMember.query(api.prostor.history.list, {
          workspaceId: s.startupA,
          target: { kind: "page", id: s.pageId },
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page;

    vi.setSystemTime(T0 + MINUTE);
    await s.asMember.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "<p>Druga</p>",
      expectedRevision: 0,
    });
    let rows = await list();
    expect(rows.map((row) => [row.kind, row.author?.displayName ?? null, row.excerpt])).toEqual([
      ["edit", "Member", "Druga"],
      // Stranica još nije bila menjana, pa je autor zatečenog stanja poznat.
      ["baseline", "Author", "Prva verzija"],
    ]);

    vi.setSystemTime(T0 + 5 * MINUTE);
    await s.asMember.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "<p>Treća</p>",
      expectedRevision: 1,
    });
    rows = await list();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "edit", excerpt: "Treća", updatedAt: T0 + 5 * MINUTE });

    vi.setSystemTime(T0 + 16 * MINUTE);
    await s.asMember.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "<p>Četvrta</p>",
      expectedRevision: 2,
    });
    vi.setSystemTime(T0 + 17 * MINUTE);
    await s.asAuthor.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "<p>Peta</p>",
      expectedRevision: 3,
    });
    rows = await list();
    expect(rows.map((row) => [row.author?.displayName ?? null, row.excerpt])).toEqual([
      ["Author", "Peta"],
      ["Member", "Četvrta"],
      ["Member", "Treća"],
      ["Author", "Prva verzija"],
    ]);
    expect(rows.every((row) => row.canRestore)).toBe(true);
  });

  test("„Vrati ovu verziju“ pravi NOVU reviziju, podiže reviziju stranice i beleži aktivnost", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      title: "Nov naslov",
      content: "<p>Promenjeno</p>",
      expectedRevision: 0,
    });
    const rows = (
      await s.asAuthor.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: { kind: "page", id: s.pageId },
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page;
    const baseline = rows.find((row) => row.kind === "baseline")!;
    const detail = await s.asAuthor.query(api.prostor.history.get, { workspaceId: s.startupA, revisionId: baseline._id });
    expect(detail).toMatchObject({
      content: "<p>Prva verzija</p>",
      title: "Specifikacija",
      targetKind: "page",
      previousRevisionId: null,
    });
    const edit = await s.asAuthor.query(api.prostor.history.get, { workspaceId: s.startupA, revisionId: rows[0]._id });
    expect(edit.previousRevisionId).toBe(baseline._id);

    await expect(
      s.asAuthor.mutation(api.prostor.history.restore, {
        workspaceId: s.startupA,
        revisionId: baseline._id,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ data: { code: "KONFLIKT_IZMENA", currentRevision: 1 } });

    const restored = await s.asAuthor.mutation(api.prostor.history.restore, {
      workspaceId: s.startupA,
      revisionId: baseline._id,
      expectedRevision: 1,
    });
    expect(restored).toMatchObject({ changed: true, targetRevision: 2 });
    const page = await s.asMember.query(api.prostor.pages.get, { workspaceId: s.startupA, pageId: s.pageId });
    expect(page).toMatchObject({
      title: "Specifikacija",
      content: "<p>Prva verzija</p>",
      revision: 2,
    });
    const after = (
      await s.asAuthor.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: { kind: "page", id: s.pageId },
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page;
    expect(after.map((row) => row.kind)).toEqual(["restore", "edit", "baseline"]);
    expect(after[0]).toMatchObject({ restoredFromId: baseline._id, excerpt: "Prva verzija" });

    const activity = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("activities")
          .withIndex("by_workspaceId_and_createdAt", (q) =>
            q.eq("workspaceId", s.startupA),
          )
          .order("desc")
          .first()
      ),
    );
    expect(activity).toMatchObject({ action: "revision_restored", targetId: s.pageId });
  });

  test("zaključanu verziju vraća samo autor ili menadžer; nečlan i uklonjen ne vide istoriju", async () => {
    const s = await seed();
    await s.asAuthor.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "<p>Druga</p>",
      expectedRevision: 0,
    });
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId });
    const rows = (
      await s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: { kind: "page", id: s.pageId },
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page;
    expect(rows.every((row) => row.canRestore === false)).toBe(true);
    const baselineId = rows[rows.length - 1]._id;
    await expect(
      s.asMember.mutation(api.prostor.history.restore, { workspaceId: s.startupA, revisionId: baselineId, expectedRevision: 1 }),
    ).rejects.toMatchObject({ data: { code: "ZAKLJUCANO" } });
    await s.asOwner.mutation(api.prostor.history.restore, { workspaceId: s.startupA, revisionId: baselineId, expectedRevision: 1 });

    for (const outsider of [s.asOutsider, s.asRemoved]) {
      await expect(
        outsider.query(api.prostor.history.list, {
          workspaceId: s.startupA,
          target: { kind: "page", id: s.pageId },
          paginationOpts: { numItems: 20, cursor: null },
        }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        outsider.query(api.prostor.history.get, { workspaceId: s.startupA, revisionId: baselineId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        outsider.mutation(api.prostor.history.restore, { workspaceId: s.startupA, revisionId: baselineId, expectedRevision: 2 }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.query(api.prostor.history.get, { workspaceId: s.startupA, revisionId: baselineId }),
    ).rejects.toThrow("Profil još nije spreman. Osveži stranicu.");
    await expect(
      s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: { kind: "page", id: s.pageId },
        paginationOpts: { numItems: 51, cursor: null },
      }),
    ).rejects.toThrow("najviše 50");
  });

  test("instrukcije zadatka i opis oblasti idu u istoriju; vraćanje opisa", async () => {
    const s = await seed();
    const taskId = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      parentPageId: null,
      kind: "task",
      title: "Zadatak",
      instructions: "Stare instrukcije",
    });
    await s.asMember.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: s.startupA,
      pageId: taskId,
      instructions: "Nove instrukcije",
    });
    // Status nije sadržaj — ne pravi reviziju (P2: osobine idu u Aktivnost).
    await s.asMember.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: s.startupA,
      pageId: taskId,
      status: "in_progress",
    });
    const taskRows = (
      await s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: { kind: "page", id: taskId },
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page;
    expect(taskRows.map((row) => row.kind)).toEqual(["edit", "baseline"]);
    const editDetail = await s.asMember.query(api.prostor.history.get, { workspaceId: s.startupA, revisionId: taskRows[0]._id });
    expect(editDetail.instructions).toBe("Nove instrukcije");

    await s.asMember.mutation(api.prostor.areasV2.updateAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      content: "<p>Prvi opis</p>",
      expectedRevision: 0,
    });
    await s.asAuthor.mutation(api.prostor.areasV2.updateAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaId,
      content: "<p>Drugi opis</p>",
      expectedRevision: 1,
    });
    const areaRows = (
      await s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: { kind: "area", id: s.areaId },
        paginationOpts: { numItems: 20, cursor: null },
      })
    ).page;
    expect(areaRows.map((row) => [row.kind, row.excerpt])).toEqual([
      ["edit", "Drugi opis"],
      ["edit", "Prvi opis"],
      ["baseline", ""],
    ]);
    await s.asMember.mutation(api.prostor.history.restore, {
      workspaceId: s.startupA,
      revisionId: areaRows[1]._id,
      expectedRevision: 2,
    });
    const body = await s.asMember.query(api.prostor.areasV2.getAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaId,
    });
    expect(body).toMatchObject({ content: "<p>Prvi opis</p>", revision: 3 });
  });
});

describe("prisustvo (P23)", () => {
  test("otkucaj, lista bez pozivaoca, odlazak i zaključana stranica", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const s = await seed();
    // convex-test 0.0.65: sat funkcije ne ide unazad od poslednjeg upisa, pa
    // posle seed-a (upisi u T0) sat pomeramo napred i brojimo od NOW.
    const NOW = T0 + 1_000;
    vi.setSystemTime(NOW);
    await s.asMember.mutation(api.prostor.presence.heartbeat, { workspaceId: s.startupA, pageId: s.pageId, editing: true });
    await s.asAuthor.mutation(api.prostor.presence.heartbeat, { workspaceId: s.startupA, pageId: s.pageId, editing: false });

    const seenByAuthor = await s.asAuthor.query(api.prostor.presence.listForPage, { workspaceId: s.startupA, pageId: s.pageId });
    expect(seenByAuthor).toEqual([
      expect.objectContaining({
        displayName: "Member",
        editing: true,
        expiresAt: NOW + PAGE_PRESENCE_TTL_MS,
      }),
    ]);
    // Drugi otkucaj ne pravi duplikat.
    vi.setSystemTime(NOW + 15_000);
    await s.asMember.mutation(api.prostor.presence.heartbeat, { workspaceId: s.startupA, pageId: s.pageId, editing: true });
    const again = await s.asAuthor.query(api.prostor.presence.listForPage, { workspaceId: s.startupA, pageId: s.pageId });
    expect(again).toHaveLength(1);
    expect(again[0].expiresAt).toBe(NOW + 15_000 + PAGE_PRESENCE_TTL_MS);

    await s.asMember.mutation(api.prostor.presence.leave, { workspaceId: s.startupA, pageId: s.pageId });
    expect(await s.asAuthor.query(api.prostor.presence.listForPage, { workspaceId: s.startupA, pageId: s.pageId })).toEqual([]);

    // Na zaključanoj stranici član je prisutan, ali ne „uređuje".
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId });
    await s.asMember.mutation(api.prostor.presence.heartbeat, { workspaceId: s.startupA, pageId: s.pageId, editing: true });
    expect(
      (await s.asAuthor.query(api.prostor.presence.listForPage, { workspaceId: s.startupA, pageId: s.pageId }))[0].editing,
    ).toBe(false);

    for (const outsider of [s.asOutsider, s.asRemoved]) {
      await expect(
        outsider.mutation(api.prostor.presence.heartbeat, { workspaceId: s.startupA, pageId: s.pageId, editing: false }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        outsider.query(api.prostor.presence.listForPage, { workspaceId: s.startupA, pageId: s.pageId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.mutation(api.prostor.presence.heartbeat, { workspaceId: s.startupA, pageId: s.pageId, editing: false }),
    ).rejects.toThrow("Profil još nije spreman. Osveži stranicu.");
  });
});
