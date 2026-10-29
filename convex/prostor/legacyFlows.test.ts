/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/legacyFlows.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

/**
 * PROSTOR K03 (P4, P25): stari tokovi glasanja o brisanju i odobravanja
 * ugnežđavanja. Stare javne funkcije zadržavaju potpis i ne rade ništa štetno:
 * `requestDeletion` odmah uklanja (Korpa ili direktno), odluke daju STARI_TOK,
 * povlačenja samo zatvaraju stari zahtev, a pregledi više ne nude otvorene
 * zahteve kao radnje. Nijedna putanja ne pravi nov red u tabelama zahteva.
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
    const owner = await person("Owner");
    const author = await person("Author");
    const member = await person("Member");
    const outsider = await person("Outsider");
    const workspaceId = await insertStartup(ctx, {
      name: "Projekat",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const p of [owner, author, member]) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId: p.profileId,
        addedByProfileId: owner.profileId,
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
    return { owner, author, member, outsider, workspaceId, areaId };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...seeded,
    asOwner: as(seeded.owner),
    asAuthor: as(seeded.author),
    asMember: as(seeded.member),
    asOutsider: as(seeded.outsider),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const errorCode = (error: unknown) =>
  (error as { data?: { code?: string } }).data?.code;

/** Broj redova u četiri tabele starih tokova + obaveštenja o glasanju. */
async function legacyRowCounts(s: Seeded) {
  return await s.t.run(async (ctx) => ({
    deletionRequests: (await ctx.db.query("deletionRequests").collect()).length,
    deletionBallots: (await ctx.db.query("deletionBallots").collect()).length,
    pageNestingRequests: (await ctx.db.query("pageNestingRequests").collect())
      .length,
    nestingRequests: (await ctx.db.query("nestingRequests").collect()).length,
    voteNotifications: (await ctx.db.query("notifications").collect()).filter(
      (row) => row.type === "vote_requested" || row.type === "request_resolved",
    ).length,
  }));
}

const NO_LEGACY_ROWS = {
  deletionRequests: 0,
  deletionBallots: 0,
  pageNestingRequests: 0,
  nestingRequests: 0,
  voteNotifications: 0,
};

async function page(
  s: Seeded,
  title: string,
  kind: "note" | "task" = "note",
  rootPageId: Id<"pages"> | null = null,
) {
  return (
    await s.asAuthor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: s.workspaceId,
      areaId: s.areaId,
      rootPageId,
      kind,
      title,
    })
  ).pageId;
}

describe("stari requestDeletion: odmah, po vrsti cilja, bez zahteva", () => {
  test("svaka vrsta cilja se uklanja odmah, bez zahteva, listića i obaveštenja", async () => {
    const s = await seed();
    const note = await page(s, "Beleška");
    const peer = await page(s, "Susedna beleška");
    const task = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.workspaceId,
      areaId: s.areaId,
      parentPageId: null,
      kind: "task",
      title: "Zadatak",
      checkpoints: [{ id: "k1", text: "Korak", completed: false }],
    });
    const pageEdge = await s.asAuthor.mutation(api.prostor.areasV2.connectPages, {
      workspaceId: s.workspaceId,
      areaId: s.areaId,
      rootPageId: null,
      sourcePageId: note,
      targetPageId: peer,
    });
    const relation = await s.asAuthor.mutation(api.prostor.areasV2.createRelation, {
      workspaceId: s.workspaceId,
      pageAId: note,
      pageBId: task,
    });
    const [checkpoint] = await s.asAuthor.query(api.prostor.taskCheckpoints.listForTask, {
      workspaceId: s.workspaceId,
      taskPageId: task,
      canvasRootPageId: null,
    });
    const checkpointEdge = await s.asAuthor.mutation(
      api.prostor.taskCheckpointCanvasEdges.connect,
      {
        workspaceId: s.workspaceId,
        areaId: s.areaId,
        rootPageId: null,
        source: { kind: "task_checkpoint", id: checkpoint._id },
        target: { kind: "page", id: peer },
      },
    );
    const ideaA = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.workspaceId,
      title: "Ideja A",
      text: "Ideja A",
    });
    const ideaB = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.workspaceId,
      title: "Ideja B",
      text: "Ideja B",
    });
    const ideaEdge = await s.asAuthor.mutation(api.prostor.ideas.connect, {
      workspaceId: s.workspaceId,
      nodeAId: ideaA,
      nodeBId: ideaB,
    });
    const memberComment = await s.asMember.mutation(
      api.prostor.collaboration.addContribution,
      {
        workspaceId: s.workspaceId,
        target: { kind: "page", id: note },
        content: "Moj komentar",
      },
    );

    const remove = (
      target: FunctionArgs<typeof api.prostor.collaboration.requestDeletion>["target"],
    ) =>
      s.asMember.mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId: s.workspaceId,
        target,
      });
    for (const target of [
      { kind: "page_edge" as const, id: pageEdge },
      { kind: "page_relation" as const, id: relation },
      { kind: "task_checkpoint_edge" as const, id: checkpointEdge },
      { kind: "task_checkpoint" as const, id: checkpoint._id },
      { kind: "idea_edge" as const, id: ideaEdge },
      { kind: "contribution" as const, id: memberComment },
      { kind: "idea" as const, id: ideaA },
      { kind: "page" as const, id: note },
    ]) {
      await expect(remove(target)).resolves.toBeNull();
    }

    const state = await s.t.run(async (ctx) => ({
      pageEdge: await ctx.db.get("pageCanvasEdgesV2", pageEdge),
      relation: await ctx.db.get("pageRelations", relation),
      checkpointEdge: await ctx.db.get("taskCheckpointCanvasEdges", checkpointEdge),
      checkpoint: await ctx.db.get("taskCheckpoints", checkpoint._id),
      ideaEdge: await ctx.db.get("ideaEdges", ideaEdge),
      comment: await ctx.db.get("contentContributions", memberComment),
      idea: await ctx.db.get("ideaNodes", ideaA),
      note: await ctx.db.get("pages", note),
      task: await ctx.db.get("pages", task),
    }));
    expect(state.pageEdge?.archivedAt).toEqual(expect.any(Number));
    expect(state.relation?.archivedAt).toEqual(expect.any(Number));
    expect(state.checkpointEdge?.archivedAt).toEqual(expect.any(Number));
    expect(state.checkpoint?.archivedAt).toEqual(expect.any(Number));
    expect(state.task?.checkpointTotal).toBe(0);
    expect(state.ideaEdge?.archivedAt).toEqual(expect.any(Number));
    expect(state.comment?.archivedAt).toEqual(expect.any(Number));
    expect(state.idea).toMatchObject({ trashState: "root" });
    expect(state.note).toMatchObject({
      trashState: "root",
      archivedByProfileId: s.member.profileId,
    });
    expect(await legacyRowCounts(s)).toEqual(NO_LEGACY_ROWS);
  });

  test("tuđi komentar i telo stranice se ne brišu kroz stari zahtev; nečlan ništa", async () => {
    const s = await seed();
    const note = await page(s, "Beleška");
    const authorComment = await s.asAuthor.mutation(
      api.prostor.collaboration.addContribution,
      {
        workspaceId: s.workspaceId,
        target: { kind: "page", id: note },
        content: "Autorov komentar",
      },
    );
    const commentError = await s.asMember
      .mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId: s.workspaceId,
        target: { kind: "contribution", id: authorComment },
      })
      .catch((error: unknown) => error);
    expect(errorCode(commentError)).toBe("NEMA_DOZVOLU");
    // Vlasnik projekta (menadžer) sklanja tuđi komentar.
    await s.asOwner.mutation(api.prostor.collaboration.requestDeletion, {
      workspaceId: s.workspaceId,
      target: { kind: "contribution", id: authorComment },
    });
    await expect(
      s.asOutsider.mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId: s.workspaceId,
        target: { kind: "page", id: note },
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    expect((await s.t.run((ctx) => ctx.db.get("pages", note)))?.archivedAt).toBeNull();
    expect(await legacyRowCounts(s)).toEqual(NO_LEGACY_ROWS);
  });
});

describe("stare odluke i povlačenja", () => {
  async function legacyRows(s: Seeded) {
    const child = await page(s, "Dete");
    const parent = await page(s, "Roditelj");
    const ideaChild = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.workspaceId,
      title: "Dete ideja",
      text: "Dete ideja",
    });
    const ideaParent = await s.asMember.mutation(api.prostor.ideas.create, {
      workspaceId: s.workspaceId,
      title: "Roditelj ideja",
      text: "Roditelj ideja",
    });
    return await s.t.run(async (ctx) => {
      const now = Date.now();
      const deletionId = await ctx.db.insert("deletionRequests", {
        workspaceId: s.workspaceId,
        targetKind: "page",
        targetId: parent,
        targetTitle: "Roditelj",
        requesterProfileId: s.author.profileId,
        status: "pending",
        eligibleCount: 3,
        approveCount: 1,
        rejectCount: 0,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      });
      const ballotId = await ctx.db.insert("deletionBallots", {
        requestId: deletionId,
        workspaceId: s.workspaceId,
        profileId: s.member.profileId,
        vote: "pending",
        createdAt: now,
        updatedAt: now,
      });
      const pageNestingId = await ctx.db.insert("pageNestingRequests", {
        workspaceId: s.workspaceId,
        areaId: s.areaId,
        childPageId: child,
        sourceParentPageId: null,
        targetParentPageId: parent,
        requesterProfileId: s.author.profileId,
        parentAuthorProfileId: s.member.profileId,
        expectedTreeRevision: 0,
        proposedX: 0,
        proposedY: 0,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      });
      const ideaNestingId = await ctx.db.insert("nestingRequests", {
        workspaceId: s.workspaceId,
        childIdeaId: ideaChild,
        parentIdeaId: ideaParent,
        requesterProfileId: s.author.profileId,
        parentAuthorProfileId: s.member.profileId,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      });
      return {
        child,
        parent,
        deletionId,
        ballotId,
        pageNestingId,
        ideaNestingId,
      };
    });
  }

  test("voteOnDeletion, approveNesting i resolveNesting daju STARI_TOK i ne diraju ništa", async () => {
    const s = await seed();
    const rows = await legacyRows(s);
    const errors = await Promise.all([
      s.asMember
        .mutation(api.prostor.collaboration.voteOnDeletion, {
          workspaceId: s.workspaceId,
          requestId: rows.deletionId,
          vote: "approve",
        })
        .catch((error: unknown) => error),
      s.asMember
        .mutation(api.prostor.areasV2.approveNesting, {
          workspaceId: s.workspaceId,
          requestId: rows.pageNestingId,
        })
        .catch((error: unknown) => error),
      s.asMember
        .mutation(api.prostor.collaboration.resolveNesting, {
          workspaceId: s.workspaceId,
          requestId: rows.ideaNestingId,
          approve: true,
        })
        .catch((error: unknown) => error),
    ]);
    expect(errors.map(errorCode)).toEqual(["STARI_TOK", "STARI_TOK", "STARI_TOK"]);
    expect(String(errors[0])).toContain("Korpu");
    const state = await s.t.run(async (ctx) => ({
      deletion: await ctx.db.get("deletionRequests", rows.deletionId),
      ballot: await ctx.db.get("deletionBallots", rows.ballotId),
      pageNesting: await ctx.db.get("pageNestingRequests", rows.pageNestingId),
      ideaNesting: await ctx.db.get("nestingRequests", rows.ideaNestingId),
      parent: await ctx.db.get("pages", rows.parent),
      child: await ctx.db.get("pages", rows.child),
    }));
    expect(state.deletion).toMatchObject({ status: "pending", approveCount: 1 });
    expect(state.ballot?.vote).toBe("pending");
    expect(state.pageNesting?.status).toBe("pending");
    expect(state.ideaNesting?.status).toBe("pending");
    expect(state.parent?.archivedAt).toBeNull();
    expect(state.child?.parentPageId).toBeNull();
    // Nečlan i dalje dobija grešku članstva, ne STARI_TOK.
    await expect(
      s.asOutsider.mutation(api.prostor.collaboration.voteOnDeletion, {
        workspaceId: s.workspaceId,
        requestId: rows.deletionId,
        vote: "reject",
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("withdrawDeletion, withdrawNesting i rejectNesting samo zatvaraju stari zahtev", async () => {
    const s = await seed();
    const rows = await legacyRows(s);
    await s.asAuthor.mutation(api.prostor.collaboration.withdrawDeletion, {
      workspaceId: s.workspaceId,
      requestId: rows.deletionId,
    });
    await expect(
      s.asAuthor.mutation(api.prostor.areasV2.withdrawNesting, {
        workspaceId: s.workspaceId,
        requestId: rows.pageNestingId,
      }),
    ).resolves.toEqual({ status: "withdrawn" });
    const state = await s.t.run(async (ctx) => ({
      deletion: await ctx.db.get("deletionRequests", rows.deletionId),
      pageNesting: await ctx.db.get("pageNestingRequests", rows.pageNestingId),
      parent: await ctx.db.get("pages", rows.parent),
      child: await ctx.db.get("pages", rows.child),
    }));
    expect(state.deletion?.status).toBe("withdrawn");
    expect(state.pageNesting?.status).toBe("withdrawn");
    expect(state.parent?.archivedAt).toBeNull();
    expect(state.child?.parentPageId).toBeNull();

    const second = await legacyRows(s);
    await expect(
      s.asMember.mutation(api.prostor.areasV2.rejectNesting, {
        workspaceId: s.workspaceId,
        requestId: second.pageNestingId,
      }),
    ).resolves.toEqual({ status: "rejected" });
    expect(
      (await s.t.run((ctx) => ctx.db.get("pages", second.child)))?.parentPageId,
    ).toBeNull();
  });

  test("overview, listNestingInbox, ghosts i inbox.pending ne nude otvorene stare zahteve", async () => {
    const s = await seed();
    const rows = await legacyRows(s);
    const overview = await s.asMember.query(api.prostor.collaboration.overview, {
      workspaceId: s.workspaceId,
    });
    expect(overview).toMatchObject({
      pendingCount: 0,
      requestsForVote: [],
      nestingForMe: [],
      myRequests: { deletion: [], nesting: [] },
    });
    const authorOverview = await s.asAuthor.query(api.prostor.collaboration.overview, {
      workspaceId: s.workspaceId,
    });
    expect(authorOverview.myRequests).toEqual({ deletion: [], nesting: [] });
    for (const actor of [s.asMember, s.asAuthor]) {
      expect(
        await actor.query(api.prostor.areasV2.listNestingInbox, {
          workspaceId: s.workspaceId,
        }),
      ).toEqual({ incoming: [], outgoing: [], truncated: false });
      expect(await actor.query(api.prostor.inbox.pending, {})).toEqual({
        items: [],
        truncated: false,
      });
    }
    const canvas = await s.asMember.query(api.prostor.areasV2.getCanvas, {
      workspaceId: s.workspaceId,
      areaId: s.areaId,
      rootPageId: rows.parent,
    });
    expect(canvas.ghosts).toEqual([]);
    await expect(
      s.asOutsider.query(api.prostor.collaboration.overview, { workspaceId: s.workspaceId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asOutsider.query(api.prostor.areasV2.listNestingInbox, { workspaceId: s.workspaceId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("uklanjanje člana ne izvršava stari zahtev za brisanje", async () => {
    const s = await seed();
    const rows = await legacyRows(s);
    // Enigma: člana uklanja vlasnik projekta kroz `membersStore.removeMember`
    // (Devotion: `startups.removeMember` koji je zvao admin), uz obavezan
    // primalac leadova.
    // Svi ostali su „za"; ranije bi uklanjanje poslednjeg glasača izvršilo brisanje.
    await s.t.run((ctx) =>
      ctx.db.patch("deletionRequests", rows.deletionId, {
        eligibleCount: 2,
        approveCount: 1,
      }),
    );
    await s.asOwner.mutation(api.membersStore.removeMember, {
      workspaceId: s.workspaceId,
      userId: s.member.userId,
      preuzimaLeadoveUserId: s.owner.userId,
    });
    const state = await s.t.run(async (ctx) => ({
      membership: await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", s.member.userId).eq("workspaceId", s.workspaceId),
        )
        .first(),
      deletion: await ctx.db.get("deletionRequests", rows.deletionId),
      ballot: await ctx.db.get("deletionBallots", rows.ballotId),
      parent: await ctx.db.get("pages", rows.parent),
    }));
    // Član je zaista uklonjen (bez ovoga bi ostale provere bile prazne).
    expect(state.membership).toBeNull();
    // SPAJANJE S06: `ukloniClanaIzRadnogDela` (poziva ga `removeMember`) izuzima
    // listić kao Devotion `startups.removeMember`; zahtev se ne izvršava.
    expect(state.ballot?.vote).toBe("excused");
    expect(state.deletion).toMatchObject({ status: "pending", eligibleCount: 1 });
    expect(state.parent?.archivedAt).toBeNull();
  });
});

describe("nijedna putanja ne pravi nov zahtev ni glasanje", () => {
  test("ugnežđavanje, premeštanje, odvajanje i brisanje tuđih stavki kroz sve stare putanje", async () => {
    const s = await seed();
    const memberRoot = (
      await s.asMember.mutation(api.prostor.areasV2.createPage, {
        workspaceId: s.workspaceId,
        areaId: s.areaId,
        rootPageId: null,
        kind: "note",
        title: "Članov koren",
      })
    ).pageId;
    // Kreiranje pod tuđim korenom (ranije: zahtev).
    const created = await s.asAuthor.mutation(api.prostor.areasV2.createPage, {
      workspaceId: s.workspaceId,
      areaId: s.areaId,
      rootPageId: memberRoot,
      kind: "task",
      title: "Pod tuđim",
    });
    expect(created).toMatchObject({ nestingStatus: "none", requestId: null });
    const viaPages = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.workspaceId,
      areaId: s.areaId,
      parentPageId: memberRoot,
      kind: "note",
      title: "Kroz pages.create",
    });
    const loose = await page(s, "Slobodna");
    await expect(
      s.asAuthor.mutation(api.prostor.areasV2.requestNesting, {
        workspaceId: s.workspaceId,
        childPageId: loose,
        targetParentPageId: memberRoot,
      }),
    ).resolves.toEqual({ nestingStatus: "none", requestId: null });
    await s.asAuthor.mutation(api.prostor.areasV2.detachPage, {
      workspaceId: s.workspaceId,
      pageId: loose,
    });
    await expect(
      s.asAuthor.mutation(api.prostor.areasV2.movePage, {
        workspaceId: s.workspaceId,
        pageId: loose,
        targetAreaId: s.areaId,
        targetParentPageId: memberRoot,
      }),
    ).resolves.toEqual({ nestingStatus: "none", requestId: null });
    await s.asAuthor.mutation(api.prostor.pages.move, {
      workspaceId: s.workspaceId,
      pageId: viaPages,
      areaId: s.areaId,
      parentPageId: null,
    });
    const ideaChild = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.workspaceId,
      title: "Ideja dete",
      text: "Ideja dete",
    });
    const ideaParent = await s.asMember.mutation(api.prostor.ideas.create, {
      workspaceId: s.workspaceId,
      title: "Ideja roditelj",
      text: "Ideja roditelj",
    });
    await s.asAuthor.mutation(api.prostor.collaboration.requestNesting, {
      workspaceId: s.workspaceId,
      childIdeaId: ideaChild,
      parentIdeaId: ideaParent,
    });
    await s.asAuthor.mutation(api.prostor.ideas.updatePositions, {
      workspaceId: s.workspaceId,
      updates: [{ id: ideaChild, x: 40, y: 40 }],
    });
    await s.asMember.mutation(api.prostor.collaboration.detachIdea, {
      workspaceId: s.workspaceId,
      ideaId: ideaChild,
    });
    await s.asAuthor.mutation(api.prostor.areasV2.archivePage, {
      workspaceId: s.workspaceId,
      pageId: memberRoot,
    });
    await s.asAuthor.mutation(api.prostor.ideas.archive, {
      workspaceId: s.workspaceId,
      ideaId: ideaParent,
    });

    expect(await legacyRowCounts(s)).toEqual(NO_LEGACY_ROWS);
    expect(
      await s.t.run((ctx) => ctx.db.get("pages", created.pageId)),
    ).toMatchObject({ trashState: "descendant", archivedWithPageId: memberRoot });
  });
});
