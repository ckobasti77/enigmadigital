/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/taskCheckpoints.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seedCheckpointWorkspace() {
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
    const assignee = await createPerson("Assignee");
    const member = await createPerson("Member");
    const workspaceId = await insertStartup(ctx, {
      name: "Checkpoint startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, assignee, member]) {
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
      key: "checkpoint-area",
      label: "Checkpoint area",
      position: 0,
      createdAt: now,
    });
    return { owner, assignee, member, workspaceId, areaId };
  });
  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asAssignee: asPerson(seeded.assignee),
    asMember: asPerson(seeded.member),
  };
}

describe("task checkpoint entiteti", () => {
  test("checkpoint API odbija beleške i ostaje isključivo u task scope-u", async () => {
    const { workspaceId, areaId, asOwner } =
      await seedCheckpointWorkspace();
    const noteId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "note",
      title: "Nije zadatak",
    });
    await expect(
      asOwner.query(api.prostor.taskCheckpoints.listForTask, {
        workspaceId,
        taskPageId: noteId,
      }),
    ).rejects.toThrow("nije zadatak");
  });

  test("pet checkpointa je live, nezavisno od revision-a editora i uz uloge", async () => {
    // PROSTOR P1 (namerna promena pravila): na otključanom zadatku korake
    // menja i završava svaki član; zaključan menjaju autor/vlasnik/admin, a
    // završava još i izvršilac (D5). Raspored koraka na Mapi menja svaki član.
    const {
      t,
      workspaceId,
      areaId,
      assignee,
      asOwner,
      asAssignee,
      asMember,
    } = await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Lansiranje",
      assigneeProfileId: assignee.profileId,
      checkpoints: Array.from({ length: 5 }, (_, index) => ({
        id: `cp-${index + 1}`,
        text: `Korak ${index + 1}`,
        completed: false,
      })),
    });

    let rows = await asMember.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => !row.completed)).toBe(true);
    expect(rows.map((row) => row.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]).toMatchObject({
      text: "Korak 1",
      canEdit: true,
      canToggle: true,
      canMove: true,
      canRequestDeletion: false,
    });

    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId: taskId });
    rows = await asMember.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0]).toMatchObject({
      canEdit: false,
      canToggle: false,
      canMove: true,
      canRequestDeletion: false,
    });
    await expect(
      asMember.mutation(api.prostor.taskCheckpoints.setCompleted, {
        workspaceId,
        checkpointId: rows[0]._id,
        completed: true,
      }),
    ).rejects.toThrow("zaključana");
    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[0]._id,
      completed: true,
    });
    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[0]._id,
      completed: true,
    });

    const pageAfterToggle = await t.run((ctx) =>
      ctx.db.get("pages", taskId),
    );
    expect(pageAfterToggle).toMatchObject({
      revision: 0,
      checkpointTotal: 5,
      checkpointCompleted: 1,
      checkpointRevision: 2,
    });
    const parentCanvas = await asOwner.query(api.prostor.areasV2.getCanvas, {
      workspaceId,
      areaId,
      rootPageId: null,
    });
    expect(
      parentCanvas.pages.find((page) => page._id === taskId),
    ).toMatchObject({
      checkpointTotal: 5,
      checkpointCompleted: 1,
    });

    await expect(
      asAssignee.mutation(api.prostor.taskCheckpoints.updateText, {
        workspaceId,
        checkpointId: rows[0]._id,
        text: "Tuđa izmena",
      }),
    ).rejects.toThrow("zaključana");
    await asOwner.mutation(api.prostor.taskCheckpoints.updateText, {
      workspaceId,
      checkpointId: rows[0]._id,
      text: "Potvrdi finalni plan",
    });
    await asMember.mutation(api.prostor.collaboration.addContribution, {
      workspaceId,
      target: { kind: "task_checkpoint", id: rows[0]._id },
      content: "Dodao sam proveru pristupačnosti.",
    });
    expect(
      await asOwner.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "task_checkpoint", id: rows[0]._id },
      }),
    ).toEqual([
      expect.objectContaining({
        content: "Dodao sam proveru pristupačnosti.",
      }),
    ]);

    await asOwner.mutation(api.prostor.taskCheckpoints.saveCanvasPlacement, {
      workspaceId,
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
      x: 321,
      y: -123,
    });
    rows = await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0].placement).toEqual({
      x: 321,
      y: -123,
      width: null,
      height: null,
    });

    await asOwner.mutation(api.prostor.taskCheckpoints.saveCanvasPlacement, {
      workspaceId,
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
      x: 321,
      y: -123,
      width: 360,
      height: 240,
    });
    await asOwner.mutation(api.prostor.taskCheckpoints.saveCanvasPlacement, {
      workspaceId,
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
      x: 400,
      y: 75,
    });
    rows = await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0].placement).toEqual({
      x: 400,
      y: 75,
      width: 360,
      height: 240,
    });
    await expect(
      asAssignee.mutation(api.prostor.taskCheckpoints.resetCanvasSize, {
        workspaceId,
        checkpointId: rows[0]._id,
        canvasRootPageId: null,
      }),
    ).resolves.toBeNull();
    await asOwner.mutation(api.prostor.taskCheckpoints.resetCanvasSize, {
      workspaceId,
      checkpointId: rows[0]._id,
      canvasRootPageId: null,
    });
    rows = await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
      canvasRootPageId: null,
    });
    expect(rows[0].placement).toEqual({
      x: 400,
      y: 75,
      width: null,
      height: null,
    });
    const persisted = await t.run(async (ctx) => {
      const checkpoint = await ctx.db.get("taskCheckpoints", rows[0]._id);
      const placements = await ctx.db
        .query("taskCheckpointCanvasPlacements")
        .withIndex("by_checkpointId_and_canvasRootPageId", (q) =>
          q
            .eq("checkpointId", rows[0]._id)
            .eq("canvasRootPageId", null),
        )
        .collect();
      return { checkpoint, placements };
    });
    expect(persisted.checkpoint).not.toBeNull();
    expect(persisted.placements).toHaveLength(1);
  });

  test("aktivni checkpointi imaju determinističan hronološki red i izvedene brojeve", async () => {
    const { t, workspaceId, areaId, owner, asOwner } =
      await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Hronologija",
      checkpoints: [],
    });
    const baseTime = Date.now() - 10_000;
    await t.run(async (ctx) => {
      for (const checkpoint of [
        { legacyId: "same-2", text: "Treći po poziciji", position: 2 },
        { legacyId: "same-0", text: "Prvi po poziciji", position: 0 },
        { legacyId: "same-1", text: "Drugi po poziciji", position: 1 },
      ]) {
        await ctx.db.insert("taskCheckpoints", {
          workspaceId,
          areaId,
          taskPageId: taskId,
          legacyId: checkpoint.legacyId,
          text: checkpoint.text,
          completed: false,
          position: checkpoint.position,
          createdByProfileId: owner.profileId,
          archivedAt: null,
          createdAt: baseTime,
          updatedAt: baseTime,
        });
      }
      await ctx.db.insert("taskCheckpoints", {
        workspaceId,
        areaId,
        taskPageId: taskId,
        legacyId: "older",
        text: "Najstariji",
        completed: false,
        position: 99,
        createdByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: baseTime - 1,
        updatedAt: baseTime,
      });
    });

    const rows = await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
    });
    expect(rows.map((row) => row.text)).toEqual([
      "Najstariji",
      "Prvi po poziciji",
      "Drugi po poziciji",
      "Treći po poziciji",
    ]);
    expect(rows.map((row) => row.ordinal)).toEqual([1, 2, 3, 4]);
  });

  // PROSTOR K03 (P4): stari `requestDeletion` koraka ga odmah arhivira (svaki
  // član, R2 nad zadatkom); „Poništi" i limit 100 ostaju.
  test("arhiviranje ima Undo, stari requestDeletion odmah arhivira, a limit ostaje 100", async () => {
    const { workspaceId, areaId, asOwner, asMember } =
      await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Arhiviranje",
      checkpoints: Array.from({ length: 100 }, (_, index) => ({
        id: `cp-${index}`,
        text: `Korak ${index}`,
        completed: false,
      })),
    });
    let rows = await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
    });
    const oldestCheckpointId = rows[0]._id;
    await expect(
      asOwner.mutation(api.prostor.taskCheckpoints.create, {
        workspaceId,
        taskPageId: taskId,
        text: "Višak",
      }),
    ).rejects.toThrow("najviše 100");

    await expect(
      asMember.mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId,
        target: { kind: "task_checkpoint", id: rows[0]._id },
      }),
    ).resolves.toBeNull();
    expect(
      await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
        workspaceId,
        taskPageId: taskId,
      }),
    ).toHaveLength(99);
    await asOwner.mutation(api.prostor.taskCheckpoints.restoreOwn, {
      workspaceId,
      checkpointId: rows[0]._id,
    });
    rows = await asOwner.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId,
      taskPageId: taskId,
    });
    expect(rows).toHaveLength(100);
    expect(rows.map((row) => row.ordinal)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    expect(rows[0]._id).toBe(oldestCheckpointId);
  });

  // „legacy backfill je idempotentan i verifikacija ne nalazi propuste“ se ne prenosi (plan S01 §1.4: migracije se ne prenose, P21).

  // PROSTOR K03 (D20, P3, P4): veze koraka pravi i uklanja svaki član, stari
  // `requestDeletion` ih uklanja odmah, a brisanje stranice (Korpa) ne dira
  // vezu — sakrivena je dok je stranica u Korpi i vraća se sa njom (D3).
  test("checkpoint veze pokrivaju checkpoint, task i note: menja ih svaki član, soft unlink i Korpa", async () => {
    const {
      t,
      workspaceId,
      areaId,
      asOwner,
      asAssignee,
      asMember,
    } = await seedCheckpointWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Izvorni zadatak",
      checkpoints: [
        { id: "source-a", text: "Prvi checkpoint", completed: false },
        { id: "source-b", text: "Drugi checkpoint", completed: false },
      ],
    });
    const targetTaskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "task",
      title: "Ciljni zadatak",
      checkpoints: [],
    });
    const noteId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId,
      areaId,
      parentPageId: null,
      kind: "note",
      title: "Ciljna beleška",
    });
    const checkpoints = await asOwner.query(
      api.prostor.taskCheckpoints.listForTask,
      {
        workspaceId,
        taskPageId: taskId,
        canvasRootPageId: null,
      },
    );
    const [checkpointA, checkpointB] = checkpoints;
    const checkpointEndpointA = {
      kind: "task_checkpoint" as const,
      id: checkpointA._id,
    };
    const checkpointEndpointB = {
      kind: "task_checkpoint" as const,
      id: checkpointB._id,
    };
    const taskEndpoint = {
      kind: "page" as const,
      id: targetTaskId,
    };
    const noteEndpoint = {
      kind: "page" as const,
      id: noteId,
    };
    const scope = { workspaceId, areaId, rootPageId: null };

    const memberEdgeId = await asMember.mutation(
      api.prostor.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointA,
        target: noteEndpoint,
      },
    );

    const checkpointPairId = await asOwner.mutation(
      api.prostor.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointA,
        target: checkpointEndpointB,
      },
    );
    expect(
      await asOwner.mutation(api.prostor.taskCheckpointCanvasEdges.connect, {
        ...scope,
        source: checkpointEndpointB,
        target: checkpointEndpointA,
      }),
    ).toBe(checkpointPairId);
    const checkpointTaskId = await asOwner.mutation(
      api.prostor.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointA,
        target: taskEndpoint,
      },
    );
    const checkpointNoteId = await asOwner.mutation(
      api.prostor.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointB,
        target: noteEndpoint,
      },
    );

    const canvas = await asOwner.query(api.prostor.areasV2.getCanvas, scope);
    expect(canvas.checkpointEdges).toHaveLength(4);
    expect(
      canvas.checkpointEdges.map((edge) => edge._id),
    ).toEqual(
      expect.arrayContaining([
        memberEdgeId,
        checkpointPairId,
        checkpointTaskId,
        checkpointNoteId,
      ]),
    );
    expect(
      canvas.checkpointEdges.every(
        (edge) => edge.canDelete && !edge.canRequestDeletion,
      ),
    ).toBe(true);

    await expect(
      asMember.mutation(api.prostor.taskCheckpointCanvasEdges.disconnect, {
        ...scope,
        edgeId: checkpointTaskId,
      }),
    ).resolves.toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", checkpointTaskId),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));

    await expect(
      asMember.mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId,
        target: {
          kind: "task_checkpoint_edge",
          id: checkpointNoteId,
        },
      }),
    ).resolves.toBeNull();
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", checkpointNoteId),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));

    await asOwner.mutation(api.prostor.taskCheckpoints.archiveOwn, {
      workspaceId,
      checkpointId: checkpointA._id,
    });
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", checkpointPairId),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: expect.any(Number) }));

    const edgeToArchivedPage = await asOwner.mutation(
      api.prostor.taskCheckpointCanvasEdges.connect,
      {
        ...scope,
        source: checkpointEndpointB,
        target: noteEndpoint,
      },
    );
    await asAssignee.mutation(api.prostor.pages.archive, { workspaceId, pageId: noteId });
    expect(
      await t.run((ctx) =>
        ctx.db.get("taskCheckpointCanvasEdges", edgeToArchivedPage),
      ),
    ).toEqual(expect.objectContaining({ archivedAt: null }));
    const hidden = await asOwner.query(api.prostor.areasV2.getCanvas, scope);
    expect(hidden.checkpointEdges.map((edge) => edge._id)).not.toContain(
      edgeToArchivedPage,
    );
    await asMember.mutation(api.prostor.trash.restore, {
      workspaceId,
      target: { kind: "page", id: noteId },
    });
    const visible = await asOwner.query(api.prostor.areasV2.getCanvas, scope);
    expect(visible.checkpointEdges.map((edge) => edge._id)).toContain(
      edgeToArchivedPage,
    );
  });
});

describe("lanac checkpointa", () => {
  async function seedChainedTask(checkpointCount = 3) {
    const context = await seedCheckpointWorkspace();
    const taskId = await context.asOwner.mutation(api.prostor.pages.create, {
      workspaceId: context.workspaceId,
      areaId: context.areaId,
      parentPageId: null,
      kind: "task",
      title: "Sekvencijalni zadatak",
      assigneeProfileId: context.assignee.profileId,
      checkpoints: Array.from({ length: checkpointCount }, (_, index) => ({
        id: `cp-${index + 1}`,
        text: `Korak ${index + 1}`,
        completed: false,
      })),
    });
    const list = () =>
      context.asOwner.query(api.prostor.taskCheckpoints.listForTask, {
        workspaceId: context.workspaceId,
        taskPageId: taskId,
      });
    return { ...context, taskId, list };
  }

  test("nevezani koraci se štikliraju bilo kojim redom", async () => {
    const { asAssignee, list, workspaceId } = await seedChainedTask();
    const rows = await list();

    expect(rows.every((row) => !row.chainedToPrevious && !row.locked)).toBe(
      true,
    );
    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[2]._id,
      completed: true,
    });
    expect((await list())[2].completed).toBe(true);
  });

  test("vezan korak je zaključan dok prethodni nije završen", async () => {
    const { taskId, asOwner, asAssignee, list, workspaceId } = await seedChainedTask();
    expect(
      await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
        workspaceId,
        taskPageId: taskId,
        chained: true,
      }),
    ).toBe(2);

    let rows = await list();
    expect(rows.map((row) => row.chainedToPrevious)).toEqual([
      false,
      true,
      true,
    ]);
    expect(rows.map((row) => row.locked)).toEqual([false, true, true]);
    expect(rows[1].blockedByOrdinal).toBe(1);

    await expect(
      asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
        workspaceId,
        checkpointId: rows[1]._id,
        completed: true,
      }),
    ).rejects.toThrow("Korak #2 je zaključan dok se ne završi korak #1.");

    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[0]._id,
      completed: true,
    });
    rows = await list();
    expect(rows.map((row) => row.locked)).toEqual([false, false, true]);

    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[1]._id,
      completed: true,
    });
    expect((await list()).map((row) => row.locked)).toEqual([
      false,
      false,
      false,
    ]);
  });

  test("završen prefiks se ne može razbiti otvaranjem ranijeg koraka", async () => {
    const { taskId, asOwner, asAssignee, list, workspaceId } = await seedChainedTask();
    await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
      workspaceId,
      taskPageId: taskId,
      chained: true,
    });
    const rows = await list();
    for (const row of rows.slice(0, 2)) {
      await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
        workspaceId,
        checkpointId: row._id,
        completed: true,
      });
    }

    await expect(
      asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
        workspaceId,
        checkpointId: rows[0]._id,
        completed: false,
      }),
    ).rejects.toThrow(
      "Korak #1 se ne može ponovo otvoriti dok je vezani korak #2 završen.",
    );

    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[1]._id,
      completed: false,
    });
    await asAssignee.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId: rows[0]._id,
      completed: false,
    });
    expect((await list()).every((row) => !row.completed)).toBe(true);
  });

  test("razvezivanje jednog koraka otključava samo njega", async () => {
    const { taskId, asOwner, list, workspaceId } = await seedChainedTask();
    await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
      workspaceId,
      taskPageId: taskId,
      chained: true,
    });
    const rows = await list();

    await asOwner.mutation(api.prostor.taskCheckpoints.setChainedToPrevious, {
      workspaceId,
      checkpointId: rows[1]._id,
      chained: false,
    });
    expect((await list()).map((row) => row.locked)).toEqual([
      false,
      false,
      true,
    ]);
  });

  test("prvi korak ne može biti vezan, a lanac zaključanog zadatka menja samo autor", async () => {
    // PROSTOR P1 (namerna promena pravila): lanac otključanog zadatka menja
    // svaki član; zaključanog samo autor, vlasnik i admin.
    const { taskId, asOwner, asAssignee, list, workspaceId } = await seedChainedTask();
    const rows = await list();
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId: taskId });

    await expect(
      asOwner.mutation(api.prostor.taskCheckpoints.setChainedToPrevious, {
        workspaceId,
        checkpointId: rows[0]._id,
        chained: true,
      }),
    ).rejects.toThrow("Prvi korak nema prethodni korak");
    await expect(
      asAssignee.mutation(api.prostor.taskCheckpoints.setChainedToPrevious, {
        workspaceId,
        checkpointId: rows[1]._id,
        chained: true,
      }),
    ).rejects.toThrow("zaključana");
    await expect(
      asAssignee.mutation(api.prostor.taskCheckpoints.setAllChained, {
        workspaceId,
        taskPageId: taskId,
        chained: true,
      }),
    ).rejects.toThrow("zaključana");
    await asOwner.mutation(api.prostor.pages.unlock, { workspaceId, pageId: taskId });
    await asAssignee.mutation(api.prostor.taskCheckpoints.setChainedToPrevious, {
      workspaceId,
      checkpointId: rows[1]._id,
      chained: true,
    });
    expect((await list())[1].chainedToPrevious).toBe(true);

    await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
      workspaceId,
      taskPageId: taskId,
      chained: true,
    });
    expect((await list())[0].chainedToPrevious).toBe(false);
  });

  test("novi korak nasleđuje lanac poslednjeg", async () => {
    const { taskId, asOwner, list, workspaceId } = await seedChainedTask(2);
    await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
      workspaceId,
      taskPageId: taskId,
      chained: true,
    });
    await asOwner.mutation(api.prostor.taskCheckpoints.create, {
      workspaceId,
      taskPageId: taskId,
      text: "Korak 3",
    });
    expect((await list()).map((row) => row.chainedToPrevious)).toEqual([
      false,
      true,
      true,
    ]);

    await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
      workspaceId,
      taskPageId: taskId,
      chained: false,
    });
    await asOwner.mutation(api.prostor.taskCheckpoints.create, {
      workspaceId,
      taskPageId: taskId,
      text: "Korak 4",
    });
    expect((await list()).map((row) => row.chainedToPrevious)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  test("brisanje koraka prelinkuje lanac na preostale korake", async () => {
    const { taskId, asOwner, list, workspaceId } = await seedChainedTask();
    await asOwner.mutation(api.prostor.taskCheckpoints.setAllChained, {
      workspaceId,
      taskPageId: taskId,
      chained: true,
    });
    const rows = await list();

    // Prvi korak odlazi; drugi postaje prvi i time gubi katanac, iako mu je
    // zastavica i dalje uključena.
    await asOwner.mutation(api.prostor.taskCheckpoints.archiveOwn, {
      workspaceId,
      checkpointId: rows[0]._id,
    });
    const remaining = await list();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((row) => row.ordinal)).toEqual([1, 2]);
    expect(remaining.map((row) => row.chainedToPrevious)).toEqual([
      false,
      true,
    ]);
    expect(remaining.map((row) => row.locked)).toEqual([false, true]);
  });
});
