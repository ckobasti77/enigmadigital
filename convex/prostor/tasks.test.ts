/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/tasks.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { pageTaskSortAt } from "./lib/pages";
import {
  MAX_TASK_CHECKPOINT_ID_LENGTH,
  MAX_TASK_CHECKPOINTS,
  MAX_TASK_DUE_DATE,
  MAX_TASK_INSTRUCTIONS_LENGTH,
  MAX_TASK_PAGE_SIZE,
  TASKS_EVERYWHERE_MAX,
} from "./lib/validators";
import schema from "../schema";
import {
  insertClanstvo,
  insertProfil,
  insertStartup,
  ukloniClanstvo,
} from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seedTaskWorkspace() {
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
    const outsider = await createPerson("Outsider");
    const workspace = await insertStartup(ctx, {
      name: "Task startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const foreignStartup = await insertStartup(ctx, {
      name: "Foreign startup",
      description: "",
      createdByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const profileId of [owner.profileId, member.profileId]) {
      await insertClanstvo(ctx, {
        workspaceId: workspace,
        profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await insertClanstvo(ctx, {
      workspaceId: foreignStartup,
      profileId: outsider.profileId,
      addedByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
    });
    const area = await ctx.db.insert("areas", {
      workspaceId: workspace,
      key: "task-area",
      label: "Task area",
      position: 0,
      createdAt: now,
    });
    const foreignArea = await ctx.db.insert("areas", {
      workspaceId: foreignStartup,
      key: "foreign-area",
      label: "Foreign area",
      position: 0,
      createdAt: now,
    });
    return {
      owner,
      member,
      outsider,
      workspace,
      foreignStartup,
      area,
      foreignArea,
    };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });

  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asMember: asPerson(seeded.member),
    asOutsider: asPerson(seeded.outsider),
  };
}

describe("task metadata ugovori", () => {
  test("kreiranje normalizuje metadata i list upiti poštuju povratne ugovore", async () => {
    const { t, workspace, area, member, asOwner, asMember } =
      await seedTaskWorkspace();
    const dueDate = Date.UTC(2030, 0, 2, 12);
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "  Priprema lansiranja  ",
      assigneeProfileId: member.profileId,
      dueDate,
      instructions: "  Pripremi plan.\nSačuvaj detalje.  ",
      checkpoints: [
        {
          id: "  cp-plan  ",
          text: "  Napiši plan  ",
          completed: false,
        },
      ],
    });

    const page = await asOwner.query(api.prostor.pages.get, { workspaceId: workspace, pageId: taskId });
    expect(page).toMatchObject({
      _id: taskId,
      title: "Priprema lansiranja",
      taskStatus: "backlog",
      taskPriority: "medium",
      assigneeProfileId: member.profileId,
      dueDate,
      instructions: "Pripremi plan.\nSačuvaj detalje.",
      checkpoints: [
        { id: "cp-plan", text: "Napiši plan", completed: false },
      ],
    });

    const v2State = await t.run(async (ctx) => {
      const storedPage = await ctx.db.get("pages", taskId);
      const placements = await ctx.db
        .query("pageCanvasPlacements")
        .withIndex("by_pageId", (q) => q.eq("pageId", taskId))
        .collect();
      return { storedPage, placements };
    });
    expect(v2State.storedPage).toMatchObject({
      treeRevision: 0,
      canvasPreview: "Pripremi plan.\nSačuvaj detalje.",
    });
    expect(v2State.placements).toEqual([
      expect.objectContaining({
        workspaceId: workspace,
        areaId: area,
        rootPageId: null,
        pageId: taskId,
      }),
    ]);

    const startupTasks = await asOwner.query(api.prostor.tasks.listForStartup, {
      workspaceId: workspace,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(startupTasks.page).toEqual([
      expect.objectContaining({
        _id: taskId,
        searchText: "",
        instructions: "Pripremi plan.\nSačuvaj detalje.",
      }),
    ]);

    const memberTasks = await asMember.query(api.prostor.tasks.listMine, {});
    expect(memberTasks).toEqual([
      expect.objectContaining({
        _id: taskId,
        workspace: expect.objectContaining({ _id: workspace }),
        area: expect.objectContaining({ _id: area }),
      }),
    ]);
  });

  test("kreator menja task metadata, a null vrednosti ih čiste", async () => {
    const {
      t,
      workspace,
      area,
      member,
      outsider,
      asOwner,
      asMember,
    } = await seedTaskWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Autorski task",
    });
    const noteId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "note",
      title: "Beleška",
    });

    // PROSTOR P1 (namerna promena pravila): status menja svaki član, a na
    // zaključanom zadatku samo autor, vlasnik, admin i izvršilac.
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId: workspace, pageId: taskId });
    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        status: "done",
      }),
    ).rejects.toThrow("zaključana");
    await asOwner.mutation(api.prostor.pages.unlock, { workspaceId: workspace, pageId: taskId });
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: noteId,
        status: "done",
      }),
    ).rejects.toThrow("nije task");
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        assigneeProfileId: outsider.profileId,
      }),
    ).rejects.toThrow("mora pripadati ovom projektu");

    const dueDate = Date.UTC(2031, 3, 5, 12);
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        status: "in_progress",
        priority: "urgent",
        assigneeProfileId: member.profileId,
        dueDate,
        instructions: "  Jasna instrukcija  ",
        checkpoints: [
          { id: "  cp-1 ", text: "  Prvi korak ", completed: true },
        ],
      }),
    ).resolves.toBe(taskId);

    let stored = await t.run((ctx) => ctx.db.get("pages", taskId));
    expect(stored).toMatchObject({
      taskStatus: "in_progress",
      taskPriority: "urgent",
      assigneeProfileId: member.profileId,
      dueDate,
      instructions: "Jasna instrukcija",
      checkpoints: [{ id: "cp-1", text: "Prvi korak", completed: true }],
      revision: 1,
      canvasPreview: "Jasna instrukcija",
    });

    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      assigneeProfileId: null,
      dueDate: null,
      instructions: null,
      checkpoints: null,
    });
    stored = await t.run((ctx) => ctx.db.get("pages", taskId));
    expect(stored).toMatchObject({
      assigneeProfileId: null,
      dueDate: null,
    });
    expect(stored?.instructions).toBeUndefined();
    expect(stored?.checkpoints).toEqual([]);
    expect(stored).toMatchObject({
      revision: 2,
      canvasPreview: "Autorski task",
      checkpointTotal: 0,
      checkpointCompleted: 0,
    });

    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "in_progress",
      assigneeProfileId: null,
      dueDate: null,
      instructions: null,
      checkpoints: null,
    });
    const unchanged = await t.run((ctx) => ctx.db.get("pages", taskId));
    expect(unchanged?.revision).toBe(2);
  });

  test("granice instrukcija i checkpointa važe na kreiranju i izmeni", async () => {
    const { t, workspace, area, asOwner } = await seedTaskWorkspace();
    const exactCheckpoints = Array.from(
      { length: MAX_TASK_CHECKPOINTS },
      (_, index) => ({
        id: `cp-${index}`,
        text: `Korak ${index}`,
        completed: false,
      }),
    );
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Granični task",
      instructions: "i".repeat(MAX_TASK_INSTRUCTIONS_LENGTH),
      checkpoints: exactCheckpoints,
    });
    const emptyInstructionsTaskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Task bez instrukcije",
      instructions: "   ",
      checkpoints: [],
    });
    const emptyInstructionsTask = await t.run((ctx) =>
      ctx.db.get("pages", emptyInstructionsTaskId),
    );
    expect(emptyInstructionsTask?.instructions).toBeUndefined();
    expect(emptyInstructionsTask?.checkpoints).toEqual([]);

    await expect(
      asOwner.mutation(api.prostor.pages.create, {
        workspaceId: workspace,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title: "Preduga instrukcija",
        instructions: "i".repeat(MAX_TASK_INSTRUCTIONS_LENGTH + 1),
      }),
    ).rejects.toThrow("Instrukcije mogu imati najviše");
    await expect(
      asOwner.mutation(api.prostor.pages.create, {
        workspaceId: workspace,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title: "Previše checkpointa",
        checkpoints: [
          ...exactCheckpoints,
          { id: "previše", text: "Višak", completed: false },
        ],
      }),
    ).rejects.toThrow("najviše 100 checkpointa");

    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        checkpoints: [
          {
            id: "i".repeat(MAX_TASK_CHECKPOINT_ID_LENGTH),
            text: "t".repeat(10_000),
            completed: false,
          },
        ],
      }),
    ).resolves.toBe(taskId);

    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        instructions: "i".repeat(MAX_TASK_INSTRUCTIONS_LENGTH + 1),
      }),
    ).rejects.toThrow("Instrukcije mogu imati najviše");
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        checkpoints: [
          ...exactCheckpoints,
          { id: "previše", text: "Višak", completed: false },
        ],
      }),
    ).rejects.toThrow("najviše 100 checkpointa");
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        checkpoints: [
          {
            id: "i".repeat(MAX_TASK_CHECKPOINT_ID_LENGTH + 1),
            text: "Validan tekst",
            completed: false,
          },
        ],
      }),
    ).rejects.toThrow("ID checkpointa može imati najviše");
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        checkpoints: [
          { id: "isti", text: "Prvi", completed: false },
          { id: " isti ", text: "Drugi", completed: false },
        ],
      }),
    ).rejects.toThrow("moraju biti jedinstveni");
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        checkpoints: [{ id: "  ", text: "Tekst", completed: false }],
      }),
    ).rejects.toThrow("ID checkpointa je obavezno");
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        checkpoints: [{ id: "cp-empty", text: "  ", completed: false }],
      }),
    ).rejects.toThrow("Tekst checkpointa je obavezno");
  });

  test("rok i list filteri odbijaju nejasne ili prevelike argumente", async () => {
    const {
      workspace,
      area,
      member,
      outsider,
      asOwner,
    } = await seedTaskWorkspace();
    const dueDate = Date.UTC(2032, 5, 10, 12);
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Filtrirani task",
      taskStatus: "next",
      assigneeProfileId: member.profileId,
      dueDate,
    });

    const byDueDate = await asOwner.query(api.prostor.tasks.listForStartup, {
      workspaceId: workspace,
      dueStart: dueDate - 1,
      dueEnd: dueDate + 1,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(byDueDate.page.map((page) => page._id)).toEqual([taskId]);
    const byStatus = await asOwner.query(api.prostor.tasks.listForStartup, {
      workspaceId: workspace,
      status: "next",
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(byStatus.page.map((page) => page._id)).toEqual([taskId]);
    const byAssignee = await asOwner.query(api.prostor.tasks.listForStartup, {
      workspaceId: workspace,
      assigneeProfileId: member.profileId,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(byAssignee.page.map((page) => page._id)).toEqual([taskId]);

    await expect(
      asOwner.query(api.prostor.tasks.listForStartup, {
        workspaceId: workspace,
        dueStart: dueDate - 1,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("početak i kraj");
    await expect(
      asOwner.query(api.prostor.tasks.listForStartup, {
        workspaceId: workspace,
        dueStart: dueDate,
        dueEnd: dueDate,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("mora biti pre kraja");
    await expect(
      asOwner.query(api.prostor.tasks.listForStartup, {
        workspaceId: workspace,
        dueStart: dueDate - 1,
        dueEnd: dueDate + 1,
        status: "next",
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("ne kombinuje");
    await expect(
      asOwner.query(api.prostor.tasks.listForStartup, {
        workspaceId: workspace,
        assigneeProfileId: outsider.profileId,
        paginationOpts: { numItems: 100, cursor: null },
      }),
    ).rejects.toThrow("mora pripadati ovom projektu");
    await expect(
      asOwner.query(api.prostor.tasks.listForStartup, {
        workspaceId: workspace,
        paginationOpts: { numItems: MAX_TASK_PAGE_SIZE + 1, cursor: null },
      }),
    ).rejects.toThrow("između 1 i 100");

    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId: taskId,
        dueDate: MAX_TASK_DUE_DATE,
      }),
    ).resolves.toBe(taskId);
    for (const invalidDueDate of [
      -1,
      1.5,
      MAX_TASK_DUE_DATE + 1,
      Number.NaN,
    ]) {
      await expect(
        asOwner.mutation(api.prostor.tasks.updateMetadata, {
          workspaceId: workspace,
          pageId: taskId,
          dueDate: invalidDueDate,
        }),
      ).rejects.toThrow("Rok nije ispravan");
    }
  });

  test("task metadata se ne mogu poslati belešci", async () => {
    const { workspace, area, asOwner } = await seedTaskWorkspace();
    await expect(
      asOwner.mutation(api.prostor.pages.create, {
        workspaceId: workspace,
        areaId: area,
        parentPageId: null,
        kind: "note",
        title: "Beleška sa task podacima",
        instructions: "",
      }),
    ).rejects.toThrow("samo task stranici");
  });
});

describe("komandni centar", () => {
  test("vraća sav otvoren posao startupa, bez završenog i arhiviranog", async () => {
    const { t, workspace, foreignStartup, area, foreignArea, owner, asOwner, asOutsider } =
      await seedTaskWorkspace();

    const openStatuses = ["backlog", "next", "in_progress", "blocked"] as const;
    const openIds: Array<Id<"pages">> = [];
    for (const status of openStatuses) {
      const pageId = await asOwner.mutation(api.prostor.pages.create, {
        workspaceId: workspace,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title: `Otvoren ${status}`,
      });
      if (status !== "backlog") {
        await asOwner.mutation(api.prostor.tasks.updateMetadata, { workspaceId: workspace, pageId, status });
      }
      openIds.push(pageId);
    }

    const doneId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Završen",
    });
    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: doneId,
      status: "done",
    });

    const archivedId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Arhiviran",
    });
    await asOwner.mutation(api.prostor.areasV2.archivePage, {
      workspaceId: workspace,
      pageId: archivedId,
    });

    await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "note",
      title: "Beleška nije zadatak",
    });

    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("pages", {
        workspaceId: foreignStartup,
        areaId: foreignArea,
        parentPageId: null,
        kind: "task",
        title: "Tuđi zadatak",
        searchText: "",
        revision: 1,
        position: 0,
        taskStatus: "next",
        taskPriority: "medium",
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        createdByProfileId: owner.profileId,
        updatedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    });

    const overview = await asOwner.query(api.prostor.tasks.commandCenter, {
      workspaceId: workspace,
    });

    expect(overview.hasMore).toBe(false);
    expect(new Set(overview.tasks.map((task) => task._id))).toEqual(
      new Set(openIds),
    );
    for (const task of overview.tasks) {
      expect(task.kind).toBe("task");
      expect(task.searchText).toBe("");
    }

    await expect(
      asOutsider.query(api.prostor.tasks.commandCenter, { workspaceId: workspace }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });
});

describe("dozvole za brze akcije", () => {
  async function seedAssignedTask() {
    const context = await seedTaskWorkspace();
    const pageId = await context.asOwner.mutation(api.prostor.pages.create, {
      workspaceId: context.workspace,
      areaId: context.area,
      parentPageId: null,
      kind: "task",
      title: "Zadatak sa dodelom",
      assigneeProfileId: context.member.profileId,
    });
    return { ...context, pageId };
  }

  test("zaključan zadatak: izvršilac menja status, ali ne i ostale podatke", async () => {
    // PROSTOR P1 (namerna promena pravila): ranije je ovo važilo za svaki
    // zadatak; sada samo za zaključan (D5), a otključan menja svaki član.
    const { workspace, pageId, asOwner, asMember } = await seedAssignedTask();
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId: workspace, pageId });

    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        status: "in_progress",
      }),
    ).resolves.toBe(pageId);

    for (const patch of [
      { priority: "urgent" as const },
      { dueDate: Date.UTC(2032, 0, 5, 12) },
      { instructions: "Menjam instrukcije" },
      { checkpoints: [{ id: "cp", text: "Korak", completed: false }] },
    ]) {
      await expect(
        asMember.mutation(api.prostor.tasks.updateMetadata, { workspaceId: workspace, pageId, ...patch }),
      ).rejects.toThrow("zaključana");
    }

    await asOwner.mutation(api.prostor.pages.unlock, { workspaceId: workspace, pageId });
    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        priority: "urgent",
        dueDate: Date.UTC(2032, 0, 5, 12),
        instructions: "Menjam instrukcije",
      }),
    ).resolves.toBe(pageId);
  });

  test("zaključan zadatak: član ne menja tuđe učešće, ali se sam priključuje", async () => {
    // PROSTOR P1 (namerna promena pravila): tuđe učešće na otključanom
    // zadatku menja svaki član; na zaključanom samo autor, vlasnik i admin.
    const { workspace, pageId, owner, member, asOwner, asMember } =
      await seedAssignedTask();
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId: workspace, pageId });

    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        assigneeProfileIds: [owner.profileId],
      }),
    ).rejects.toThrow("zaključana");

    // Sebe može da doda i kad zadatak već ima izvršioca.
    const current = await asMember.query(api.prostor.taskAssignees.listForTask, {
      workspaceId: workspace,
      taskPageId: pageId,
    });
    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        assigneeProfileIds: [
          ...current.map((row) => row.profileId),
          member.profileId,
        ],
      }),
    ).resolves.toBe(pageId);
    expect(
      (
        await asMember.query(api.prostor.taskAssignees.listForTask, {
          workspaceId: workspace,
          taskPageId: pageId,
        })
      ).map((row) => row.profileId),
    ).toContain(member.profileId);

    // Autor i dalje sme sve, i na zaključanom.
    await expect(
      asOwner.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        assigneeProfileId: owner.profileId,
      }),
    ).resolves.toBe(pageId);

    await asOwner.mutation(api.prostor.pages.unlock, { workspaceId: workspace, pageId });
    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        assigneeProfileIds: [member.profileId],
      }),
    ).resolves.toBe(pageId);
  });

  test("nedodeljen zadatak član preuzima na sebe i to ostaje u istoriji", async () => {
    const { t, workspace, area, member, owner, asOwner, asMember } =
      await seedTaskWorkspace();
    const pageId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Nedodeljen zadatak",
    });

    // PROSTOR P1 (namerna promena pravila): tuđe učešće na zaključanom
    // zadatku menjaju samo autor, vlasnik i admin.
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId: workspace, pageId });
    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        assigneeProfileId: owner.profileId,
      }),
    ).rejects.toThrow("zaključana");

    await expect(
      asMember.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: workspace,
        pageId,
        assigneeProfileId: member.profileId,
      }),
    ).resolves.toBe(pageId);

    const { assignee, detail } = await t.run(async (ctx) => {
      const page = await ctx.db.get("pages", pageId);
      const activities = await ctx.db
        .query("activities")
        .withIndex("by_workspaceId_and_createdAt", (q) =>
          q.eq("workspaceId", workspace),
        )
        .order("desc")
        .take(1);
      return {
        assignee: page?.assigneeProfileId ?? null,
        detail: activities[0]?.detail ?? null,
      };
    });

    expect(assignee).toBe(member.profileId);
    expect(detail).toBe("Preuzeo/la: Member");
  });
});

/** Zadatak dodeljen jednom profilu, upisan direktno sa ogledalima izvršioca. */
async function insertAssignedTask(
  ctx: MutationCtx,
  options: {
    workspaceId: Id<"workspaces">;
    areaId: Id<"areas">;
    title: string;
    createdBy: Id<"profiles">;
    assignee: Id<"profiles">;
    status?: "backlog" | "next" | "in_progress" | "blocked" | "done";
    dueDate?: number | null;
    completedAt?: number;
    archivedAt?: number | null;
  },
) {
  const now = Date.now();
  const status = options.status ?? "next";
  const dueDate = options.dueDate ?? null;
  const taskSortAt = pageTaskSortAt(dueDate, now);
  const completedAt = status === "done" ? (options.completedAt ?? now) : null;
  const pageId = await ctx.db.insert("pages", {
    workspaceId: options.workspaceId,
    areaId: options.areaId,
    parentPageId: null,
    kind: "task",
    title: options.title,
    searchText: options.title,
    revision: 0,
    position: 0,
    taskStatus: status,
    taskPriority: "medium",
    assigneeProfileId: options.assignee,
    dueDate,
    taskSortAt,
    completedAt,
    createdByProfileId: options.createdBy,
    updatedByProfileId: options.createdBy,
    archivedAt: options.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("taskAssignees", {
    workspaceId: options.workspaceId,
    taskPageId: pageId,
    profileId: options.assignee,
    taskStatus: status,
    taskSortAt,
    addedByProfileId: options.createdBy,
    archivedAt: null,
    createdAt: now,
    updatedAt: completedAt ?? now,
  });
  return pageId;
}

describe("zadaci svuda (listEverywhere)", () => {
  async function seedEverywhere() {
    const seeded = await seedTaskWorkspace();
    const extra = await seeded.t.run(async (ctx) => {
      const now = Date.now();
      const startupWith = async (
        name: string,
        options: { membershipArchived?: boolean; startupArchived?: boolean } = {},
      ) => {
        const workspaceId = await insertStartup(ctx, {
          name,
          description: "",
          createdByProfileId: seeded.member.profileId,
          archivedAt: options.startupArchived === true ? now : null,
          createdAt: now,
          updatedAt: now,
        });
        const membershipId = await insertClanstvo(ctx, {
          workspaceId,
          profileId: seeded.member.profileId,
          addedByProfileId: seeded.member.profileId,
          archivedAt: null,
          createdAt: now,
        });
        // Devotion: kreator startupa nije automatski član, pa je „napušten“
        // bio samo arhivirano članstvo. U Enigmi kreator dobija `owner` red
        // iz `insertStartup`, pa se napuštanje radi brisanjem tog reda.
        if (options.membershipArchived === true) {
          await ukloniClanstvo(ctx, membershipId);
        }
        const areaId = await ctx.db.insert("areas", {
          workspaceId,
          key: "sales",
          label: `${name} prodaja`,
          position: 0,
          createdAt: now,
        });
        return { workspaceId, areaId };
      };
      return {
        second: await startupWith("Drugi startup"),
        left: await startupWith("Napušten", { membershipArchived: true }),
        archived: await startupWith("Arhiviran", { startupArchived: true }),
      };
    });
    return { ...seeded, ...extra };
  }

  test("open/done/all kroz dva startupa sa mini startupom i oblašću", async () => {
    const { t, workspace, area, owner, member, second, asMember } = await seedEverywhere();
    const soon = Date.UTC(2030, 0, 2, 12);
    const later = Date.UTC(2030, 0, 9, 12);
    const ids = await t.run(async (ctx) => ({
      later: await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Kasnije",
        createdBy: owner.profileId,
        assignee: member.profileId,
        status: "in_progress",
        dueDate: later,
      }),
      soon: await insertAssignedTask(ctx, {
        ...second,
        title: "Uskoro",
        createdBy: member.profileId,
        assignee: member.profileId,
        status: "blocked",
        dueDate: soon,
      }),
      noDue: await insertAssignedTask(ctx, {
        ...second,
        title: "Bez roka",
        createdBy: member.profileId,
        assignee: member.profileId,
        status: "backlog",
      }),
      doneOld: await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Završen ranije",
        createdBy: owner.profileId,
        assignee: member.profileId,
        status: "done",
        completedAt: Date.UTC(2026, 9, 1),
      }),
      doneNew: await insertAssignedTask(ctx, {
        ...second,
        title: "Završen skoro",
        createdBy: member.profileId,
        assignee: member.profileId,
        status: "done",
        completedAt: Date.UTC(2026, 9, 20),
      }),
      ownerOnly: await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Tuđi",
        createdBy: owner.profileId,
        assignee: owner.profileId,
      }),
    }));

    const open = await asMember.query(api.prostor.tasks.listEverywhere, { scope: "open" });
    expect(open.capped).toBe(false);
    expect(open.items.map((item) => item._id)).toEqual([ids.soon, ids.later, ids.noDue]);
    expect(open.items[0]).toMatchObject({
      title: "Uskoro",
      taskStatus: "blocked",
      isAssignee: true,
      isCreator: true,
      completedAt: null,
      workspace: { _id: second.workspaceId, name: "Drugi startup", logoUrl: null },
      area: { _id: second.areaId, key: "sales", label: "Drugi startup prodaja" },
    });
    expect(open.items[1]).toMatchObject({
      isCreator: false,
      workspace: { _id: workspace, name: "Task startup", logoUrl: null },
      area: { _id: area, key: "task-area", label: "Task area" },
    });

    const done = await asMember.query(api.prostor.tasks.listEverywhere, { scope: "done" });
    expect(done.items.map((item) => item._id)).toEqual([ids.doneNew, ids.doneOld]);
    expect(done.items[0].completedAt).toBe(Date.UTC(2026, 9, 20));

    const all = await asMember.query(api.prostor.tasks.listEverywhere, { scope: "all" });
    expect(all.items.map((item) => item._id)).toEqual([
      ids.soon,
      ids.later,
      ids.noDue,
      ids.doneNew,
      ids.doneOld,
    ]);
    expect(JSON.stringify(all)).not.toContain(ids.ownerOnly);
  });

  test("filter startupId vraća samo taj startup; bez članstva se odbija", async () => {
    const { t, workspace, area, owner, member, second, foreignStartup, left, asMember } =
      await seedEverywhere();
    const ids = await t.run(async (ctx) => ({
      inFirst: await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Prvi",
        createdBy: owner.profileId,
        assignee: member.profileId,
      }),
      inSecond: await insertAssignedTask(ctx, {
        ...second,
        title: "Drugi",
        createdBy: member.profileId,
        assignee: member.profileId,
      }),
      doneInSecond: await insertAssignedTask(ctx, {
        ...second,
        title: "Drugi završen",
        createdBy: member.profileId,
        assignee: member.profileId,
        status: "done",
      }),
      doneInFirst: await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Prvi završen",
        createdBy: owner.profileId,
        assignee: member.profileId,
        status: "done",
      }),
    }));

    const filtered = await asMember.query(api.prostor.tasks.listEverywhere, {
      scope: "all",
      workspaceId: second.workspaceId,
    });
    expect(filtered.items.map((item) => item._id)).toEqual([
      ids.inSecond,
      ids.doneInSecond,
    ]);
    const serialized = JSON.stringify(filtered);
    expect(serialized).not.toContain(ids.inFirst);
    expect(serialized).not.toContain(ids.doneInFirst);

    await expect(
      asMember.query(api.prostor.tasks.listEverywhere, {
        scope: "open",
        workspaceId: foreignStartup,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      asMember.query(api.prostor.tasks.listEverywhere, {
        scope: "open",
        workspaceId: left.workspaceId,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      t.query(api.prostor.tasks.listEverywhere, { scope: "open" }),
    ).rejects.toThrow("Niste prijavljeni.");
  });

  test("napušten i arhiviran startup, arhivirana stranica i skinuto učešće su isključeni", async () => {
    const { t, workspace, area, owner, member, left, archived, asMember } =
      await seedEverywhere();
    const hidden = await t.run(async (ctx) => {
      const inLeft = await insertAssignedTask(ctx, {
        ...left,
        title: "U napuštenom",
        createdBy: member.profileId,
        assignee: member.profileId,
      });
      const doneInLeft = await insertAssignedTask(ctx, {
        ...left,
        title: "Završen u napuštenom",
        createdBy: member.profileId,
        assignee: member.profileId,
        status: "done",
      });
      const inArchived = await insertAssignedTask(ctx, {
        ...archived,
        title: "U arhiviranom",
        createdBy: member.profileId,
        assignee: member.profileId,
      });
      const archivedPage = await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Arhivirana stranica",
        createdBy: owner.profileId,
        assignee: member.profileId,
        archivedAt: Date.now(),
      });
      const unassigned = await insertAssignedTask(ctx, {
        workspaceId: workspace,
        areaId: area,
        title: "Skinut sa zadatka",
        createdBy: owner.profileId,
        assignee: member.profileId,
      });
      const row = await ctx.db
        .query("taskAssignees")
        .withIndex("by_task_and_profile", (q) =>
          q.eq("taskPageId", unassigned).eq("profileId", member.profileId),
        )
        .unique();
      await ctx.db.patch("taskAssignees", row!._id, { archivedAt: Date.now() });
      return [inLeft, doneInLeft, inArchived, archivedPage, unassigned];
    });

    const all = await asMember.query(api.prostor.tasks.listEverywhere, { scope: "all" });
    expect(all.items).toEqual([]);
    for (const id of hidden) expect(JSON.stringify(all)).not.toContain(id);
  });

  test("limit: najviše 200; odsečena lista je capped", async () => {
    const { t, workspace, area, owner, member, asMember } = await seedEverywhere();
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index += 1) {
        await insertAssignedTask(ctx, {
          workspaceId: workspace,
          areaId: area,
          title: `Zadatak ${index}`,
          createdBy: owner.profileId,
          assignee: member.profileId,
          dueDate: Date.UTC(2030, 0, 1 + index, 12),
        });
      }
    });
    const limited = await asMember.query(api.prostor.tasks.listEverywhere, {
      scope: "open",
      limit: 3,
    });
    expect(limited.items.map((item) => item.title)).toEqual([
      "Zadatak 0",
      "Zadatak 1",
      "Zadatak 2",
    ]);
    expect(limited.capped).toBe(true);

    await expect(
      asMember.query(api.prostor.tasks.listEverywhere, {
        scope: "open",
        limit: TASKS_EVERYWHERE_MAX + 1,
      }),
    ).rejects.toThrow("Limit mora biti ceo broj između 1 i 200.");
    await expect(
      asMember.query(api.prostor.tasks.listEverywhere, { scope: "open", limit: 0 }),
    ).rejects.toThrow("Limit mora biti ceo broj između 1 i 200.");
  });

  test("zadatak napravljen i završen kroz postojeće mutacije prelazi iz open u done", async () => {
    const { workspace, area, member, asOwner, asMember } = await seedEverywhere();
    const pageId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Kroz pravi put",
      assigneeProfileIds: [member.profileId],
    });
    const open = await asMember.query(api.prostor.tasks.listEverywhere, { scope: "open" });
    expect(open.items.map((item) => item._id)).toEqual([pageId]);

    await asMember.mutation(api.prostor.tasks.updateMetadata, { workspaceId: workspace, pageId, status: "done" });
    expect(
      (await asMember.query(api.prostor.tasks.listEverywhere, { scope: "open" })).items,
    ).toEqual([]);
    const done = await asMember.query(api.prostor.tasks.listEverywhere, { scope: "done" });
    expect(done.items).toEqual([
      expect.objectContaining({ _id: pageId, taskStatus: "done", isAssignee: true }),
    ]);
    // Postojeći `listMine` i dalje radi kao pre.
    expect(await asMember.query(api.prostor.tasks.listMine, { status: "done" })).toEqual([
      expect.objectContaining({ _id: pageId }),
    ]);
  });
});
