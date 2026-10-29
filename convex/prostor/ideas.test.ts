/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/ideas.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  DEFAULT_CANVAS_NODE_HEIGHT,
  DEFAULT_CANVAS_NODE_WIDTH,
} from "./canvasPlacement";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

// Read-only verifikator iz `proveraOblasti.pomoc.ts` (S01 D2, §5.3): Convex ga
// ne deployuje, pa nije u `internal`; test ga zove po imenu modula.
type VerifierStage =
  | "areas"
  | "pages"
  | "placements"
  | "placement_rows"
  | "edges"
  | "viewports"
  | "relations"
  | "requests";
const verifyAreasV2 = makeFunctionReference<
  "query",
  { stage: VerifierStage; cursor: string | null; limit?: number },
  {
    stage: VerifierStage;
    continueCursor: string;
    isDone: boolean;
    scanned: number;
    issueCount: number;
    issueSamples: string[];
  }
>("prostor/proveraOblasti.pomoc:verifyAreasV2");

async function seedIdeasConversionWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const createPerson = async (
      name: string,
      archivedAt: number | null = null,
    ) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: "member",
        archivedAt,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };

    const actor = await createPerson("Actor");
    const author = await createPerson("Author");
    const activeAssignee = await createPerson("ActiveAssignee");
    const archivedMembershipAssignee = await createPerson(
      "ArchivedMembership",
    );
    const archivedProfileAssignee = await createPerson(
      "ArchivedProfile",
      now,
    );
    const foreignAssignee = await createPerson("ForeignAssignee");

    const workspace = await insertStartup(ctx, {
      name: "Ideas startup",
      description: "",
      createdByProfileId: actor.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const foreignStartup = await insertStartup(ctx, {
      name: "Foreign startup",
      description: "",
      createdByProfileId: foreignAssignee.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    for (const profileId of [
      actor.profileId,
      author.profileId,
      activeAssignee.profileId,
      archivedProfileAssignee.profileId,
    ]) {
      await insertClanstvo(ctx, {
        workspaceId: workspace,
        profileId,
        addedByProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    await insertClanstvo(ctx, {
      workspaceId: workspace,
      profileId: archivedMembershipAssignee.profileId,
      addedByProfileId: actor.profileId,
      archivedAt: now,
      createdAt: now,
    });
    await insertClanstvo(ctx, {
      workspaceId: foreignStartup,
      profileId: foreignAssignee.profileId,
      addedByProfileId: foreignAssignee.profileId,
      archivedAt: null,
      createdAt: now,
    });

    const area = await ctx.db.insert("areas", {
      workspaceId: workspace,
      key: "ideas-area",
      label: "Ideas area",
      position: 0,
      createdAt: now,
    });

    // PROSTOR P6: „odobrena" ideja je u fazi „Odobreno" (glasovi su samo
    // signal); `actor` je vlasnik startupa, pa sme da je pretvori.
    const createApprovedIdea = async (
      title: string,
      text: string,
    ) => {
      return await ctx.db.insert("ideaNodes", {
        workspaceId: workspace,
        authorProfileId: author.profileId,
        title,
        text,
        searchText: `${title}\n${text}`,
        x: 0,
        y: 0,
        color: "violet",
        convertedPageId: null,
        convertedAt: null,
        stage: "odobreno",
        stageChangedAt: now,
        stageChangedByProfileId: actor.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    };

    const taskIdea = await createApprovedIdea(
      "Task idea",
      "Task source\nSecond line",
    );
    const noteIdea = await createApprovedIdea("Note idea", "Note source");
    const foreignAssigneeIdea = await createApprovedIdea(
      "Foreign assignee",
      "Must stay an idea",
    );
    const archivedMembershipIdea = await createApprovedIdea(
      "Archived membership",
      "Must stay an idea",
    );
    const archivedProfileIdea = await createApprovedIdea(
      "Archived profile",
      "Must stay an idea",
    );
    const noteMetadataIdea = await createApprovedIdea(
      "Note metadata",
      "Must stay an idea",
    );

    return {
      actor,
      author,
      activeAssignee,
      archivedMembershipAssignee,
      archivedProfileAssignee,
      foreignAssignee,
      workspace,
      area,
      taskIdea,
      noteIdea,
      foreignAssigneeIdea,
      archivedMembershipIdea,
      archivedProfileIdea,
      noteMetadataIdea,
    };
  });

  return {
    t,
    ...seeded,
    asActor: t.withIdentity({
      subject: `${seeded.actor.userId}|sesija-test`,
    }),
  };
}

function boxesOverlap(
  first: { x: number; y: number },
  second: { x: number; y: number },
) {
  return !(
    first.x + DEFAULT_CANVAS_NODE_WIDTH <= second.x ||
    second.x + DEFAULT_CANVAS_NODE_WIDTH <= first.x ||
    first.y + DEFAULT_CANVAS_NODE_HEIGHT <= second.y ||
    second.y + DEFAULT_CANVAS_NODE_HEIGHT <= first.y
  );
}

describe("Ideas conversion integrity", () => {
  test("conversion creates verifier-clean V2 pages with attribution and distinct placements", async () => {
    const {
      t,
      author,
      activeAssignee,
      workspace,
      area,
      taskIdea,
      noteIdea,
      asActor,
    } = await seedIdeasConversionWorkspace();

    const taskPageId = await asActor.mutation(api.prostor.ideas.convertToPage, {
      workspaceId: workspace,
      ideaId: taskIdea,
      areaId: area,
      kind: "task",
      assigneeProfileId: activeAssignee.profileId,
    });
    const notePageId = await asActor.mutation(api.prostor.ideas.convertToPage, {
      workspaceId: workspace,
      ideaId: noteIdea,
      areaId: area,
      kind: "note",
    });

    const state = await t.run(async (ctx) => {
      const [taskPage, notePage, taskIdeaRow, noteIdeaRow] =
        await Promise.all([
          ctx.db.get("pages", taskPageId),
          ctx.db.get("pages", notePageId),
          ctx.db.get("ideaNodes", taskIdea),
          ctx.db.get("ideaNodes", noteIdea),
        ]);
      const readSidecars = async (
        pageId: Id<"pages">,
        ideaId: Id<"ideaNodes">,
      ) => ({
        body: await ctx.db
          .query("pageBodies")
          .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
          .unique(),
        placement: await ctx.db
          .query("pageCanvasPlacements")
          .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
          .unique(),
        legacyPlacement: await ctx.db
          .query("pageCanvasNodes")
          .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
          .unique(),
        entries: await ctx.db
          .query("pageEntries")
          .withIndex("by_pageId_and_position", (q) => q.eq("pageId", pageId))
          .take(2),
        contribution: await ctx.db
          .query("contentContributions")
          .withIndex("by_sourceKind_and_sourceId", (q) =>
            q
              .eq("sourceKind", "page_entry")
              .eq("sourceId", `idea:${ideaId}`),
          )
          .unique(),
      });
      return {
        taskPage,
        notePage,
        taskIdeaRow,
        noteIdeaRow,
        task: await readSidecars(taskPageId, taskIdea),
        note: await readSidecars(notePageId, noteIdea),
      };
    });

    expect(state.taskPage).toMatchObject({
      _id: taskPageId,
      treeRevision: 0,
      canvasPreview: "Task source\nSecond line",
      revision: 0,
      taskStatus: "backlog",
      taskPriority: "medium",
      assigneeProfileId: activeAssignee.profileId,
      dueDate: null,
    });
    expect(state.notePage).toMatchObject({
      _id: notePageId,
      treeRevision: 0,
      canvasPreview: "Note source",
      revision: 0,
      taskStatus: null,
      taskPriority: null,
      assigneeProfileId: null,
      dueDate: null,
    });
    expect(state.notePage?.instructions).toBeUndefined();
    expect(state.notePage?.checkpoints).toBeUndefined();
    expect(state.task.body?.content).toBe(
      "<p>Task source<br/>Second line</p>",
    );
    expect(state.note.body?.content).toBe("<p>Note source</p>");
    expect(state.task.entries).toEqual([
      expect.objectContaining({
        pageId: taskPageId,
        authorProfileId: author.profileId,
        content: "<p>Task source<br/>Second line</p>",
      }),
    ]);
    expect(state.task.contribution).toMatchObject({
      workspaceId: workspace,
      targetKind: "page",
      targetId: taskPageId,
      authorProfileId: author.profileId,
      sourceKind: "page_entry",
      sourceId: `idea:${taskIdea}`,
    });
    expect(state.taskIdeaRow?.convertedPageId).toBe(taskPageId);
    expect(state.noteIdeaRow?.convertedPageId).toBe(notePageId);

    expect(state.task.placement).toMatchObject({
      workspaceId: workspace,
      areaId: area,
      rootPageId: null,
      pageId: taskPageId,
    });
    expect(state.note.placement).toMatchObject({
      workspaceId: workspace,
      areaId: area,
      rootPageId: null,
      pageId: notePageId,
    });
    expect(state.task.legacyPlacement).toMatchObject({
      pageId: taskPageId,
      x: state.task.placement?.x,
      y: state.task.placement?.y,
    });
    expect(state.note.legacyPlacement).toMatchObject({
      pageId: notePageId,
      x: state.note.placement?.x,
      y: state.note.placement?.y,
    });
    expect(
      boxesOverlap(state.task.placement!, state.note.placement!),
    ).toBe(false);

    for (const stage of [
      "pages",
      "placements",
      "placement_rows",
    ] as const) {
      const verification = await t.query(verifyAreasV2, {
        stage,
        cursor: null,
        limit: 100,
      });
      expect(verification).toMatchObject({
        isDone: true,
        issueCount: 0,
      });
    }
  });

  test("conversion rejects foreign or archived assignees and task metadata on notes atomically", async () => {
    const {
      t,
      activeAssignee,
      archivedMembershipAssignee,
      archivedProfileAssignee,
      foreignAssignee,
      workspace,
      area,
      foreignAssigneeIdea,
      archivedMembershipIdea,
      archivedProfileIdea,
      noteMetadataIdea,
      asActor,
    } = await seedIdeasConversionWorkspace();

    const invalidAssignments: Array<{
      ideaId: Id<"ideaNodes">;
      assigneeProfileId: Id<"profiles">;
    }> = [
      {
        ideaId: foreignAssigneeIdea,
        assigneeProfileId: foreignAssignee.profileId,
      },
      {
        ideaId: archivedMembershipIdea,
        assigneeProfileId: archivedMembershipAssignee.profileId,
      },
      {
        ideaId: archivedProfileIdea,
        assigneeProfileId: archivedProfileAssignee.profileId,
      },
    ];

    for (const assignment of invalidAssignments) {
      await expect(
        asActor.mutation(api.prostor.ideas.convertToPage, {
          workspaceId: workspace,
          ideaId: assignment.ideaId,
          areaId: area,
          kind: "task",
          assigneeProfileId: assignment.assigneeProfileId,
        }),
      ).rejects.toThrow();
    }
    await expect(
      asActor.mutation(api.prostor.ideas.convertToPage, {
        workspaceId: workspace,
        ideaId: noteMetadataIdea,
        areaId: area,
        kind: "note",
        assigneeProfileId: activeAssignee.profileId,
      }),
    ).rejects.toThrow(/Task podaci/);

    const unchanged = await t.run(async (ctx) => ({
      ideas: await Promise.all(
        [
          foreignAssigneeIdea,
          archivedMembershipIdea,
          archivedProfileIdea,
          noteMetadataIdea,
        ].map((ideaId) => ctx.db.get("ideaNodes", ideaId)),
      ),
      pages: await ctx.db
        .query("pages")
        .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
          q.eq("workspaceId", workspace).eq("archivedAt", null),
        )
        .take(10),
      placements: await ctx.db
        .query("pageCanvasPlacements")
        .withIndex(
          "by_workspaceId_and_areaId_and_rootPageId",
          (q) =>
            q
              .eq("workspaceId", workspace)
              .eq("areaId", area)
              .eq("rootPageId", null),
        )
        .take(10),
    }));
    expect(
      unchanged.ideas.every(
        (idea) =>
          idea?.convertedPageId === null && idea.convertedAt === null,
      ),
    ).toBe(true);
    expect(unchanged.pages).toHaveLength(0);
    expect(unchanged.placements).toHaveLength(0);
  });
});
