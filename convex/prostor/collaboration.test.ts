/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/collaboration.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seedWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    async function createPerson(
      name: string,
      role: "admin" | "member",
    ) {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    }
    const author = await createPerson("Autor", "member");
    const member = await createPerson("Član", "member");
    const admin = await createPerson("Admin", "admin");
    const workspaceId = await insertStartup(ctx, {
      name: "Test startup",
      description: "",
      createdByProfileId: admin.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [author, member, admin]) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId: person.profileId,
        addedByProfileId: admin.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    return { workspaceId, author, member, admin };
  });
  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...seeded,
    asAuthor: asPerson(seeded.author),
    asMember: asPerson(seeded.member),
    asAdmin: asPerson(seeded.admin),
  };
}

describe("demokratske Canvas dozvole", () => {
  test("naslovi ideje i privatne misli ne mogu biti prazni", async () => {
    const { workspaceId, asAuthor } = await seedWorkspace();
    await expect(
      asAuthor.mutation(api.prostor.ideas.create, {
        workspaceId,
        title: "   ",
        text: "Tekst ideje",
      }),
    ).rejects.toThrow("Naslov ideje");
    await expect(
      asAuthor.mutation(api.prostor.thoughts.createNode, {
        workspaceId,
        title: "",
        text: "Privatni tekst",
        x: 0,
        y: 0,
        color: "violet",
      }),
    ).rejects.toThrow("Naslov misli");
  });

  test("komentar člana na ideji je odmah vidljiv, a stara moderacija radi samo za stare klijente", async () => {
    // PROSTOR P5 (namerna promena pravila): komentar na ideji više ne čeka
    // odobrenje i izmena ga ne vraća u „na čekanju". `moderateContribution`
    // ostaje za stare klijente: autor ideje i dalje može da odbije, a "odbijen"
    // vide samo autor komentara i autor ideje.
    const { workspaceId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Moderacija",
      text: "Originalna ideja",
    });

    expect(
      await asAuthor.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).toHaveLength(0);

    const textId = await asMember.mutation(
      api.prostor.collaboration.addContribution,
      {
        workspaceId,
        target: { kind: "idea", id: ideaId },
        content: "Predlog člana",
      },
    );
    expect(
      await asAdmin.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "approved",
        content: "Predlog člana",
      }),
    ]);
    await expect(
      asMember.mutation(api.prostor.collaboration.moderateContribution, {
        workspaceId,
        contributionId: textId,
        decision: "approve",
      }),
    ).rejects.toThrow("Samo osnivač");

    await asAuthor.mutation(api.prostor.collaboration.moderateContribution, {
      workspaceId,
      contributionId: textId,
      decision: "reject",
    });
    expect(
      await asAdmin.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).toHaveLength(0);
    expect(
      await asMember.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "rejected",
      }),
    ]);

    // Izmena odbijenog komentara ga ne vraća u „na čekanju".
    await asMember.mutation(api.prostor.collaboration.updateContribution, {
      workspaceId,
      contributionId: textId,
      content: "Dorađen predlog člana",
    });
    expect(
      await asMember.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "rejected",
        content: "Dorađen predlog člana",
      }),
    ]);

    await asAuthor.mutation(api.prostor.collaboration.moderateContribution, {
      workspaceId,
      contributionId: textId,
      decision: "approve",
    });
    expect(
      await asAdmin.query(api.prostor.collaboration.listContributions, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).toEqual([
      expect.objectContaining({
        _id: textId,
        moderationStatus: "approved",
      }),
    ]);
  });

  test("tim menja tekst, veličinu i poziciju tuđe ideje i briše je u Korpu; izmena teksta ide u Istoriju", async () => {
    // PROSTOR P1/P3/P6 (namerna promena pravila): ranije je sadržaj i veličinu
    // menjao samo autor (K02), a tuđu ideju brisalo jednoglasno glasanje (K03).
    const { t, workspaceId, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Autorska ideja",
      text: "Autorska ideja",
      x: 10,
      y: 20,
    });

    await asMember.mutation(api.prostor.ideas.update, {
      workspaceId,
      ideaId,
      title: "Tuđa izmena",
      text: "Tuđa izmena",
      color: "rose",
    });
    const history = await asAuthor.query(api.prostor.history.list, {
      workspaceId,
      target: { kind: "idea", id: ideaId },
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page.map((row) => [row.kind, row.title])).toEqual([
      ["edit", "Tuđa izmena"],
      ["baseline", "Autorska ideja"],
    ]);
    await asMember.mutation(api.prostor.ideas.updateLayout, {
      workspaceId,
      ideaId,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
    });
    await asMember.mutation(api.prostor.ideas.updatePositions, {
      workspaceId,
      updates: [{ id: ideaId, x: 999, y: 999 }],
    });
    const moved = await t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(moved?.x).toBe(999);
    expect(moved?.y).toBe(999);
    const archived = await asAdmin.mutation(api.prostor.ideas.archive, {
      workspaceId,
      ideaId,
    });
    expect(archived).toMatchObject({ ideaId, recoveredId: null });
    expect(await t.run((ctx) => ctx.db.get("ideaNodes", ideaId))).toMatchObject({
      archivedAt: expect.any(Number),
      trashState: "root",
    });
  });

  // PROSTOR K03 (P4): ugnežđavanje pod tuđu ideju je odmah, `resolveNesting`
  // je STARI_TOK, izvlači svaki član, a ciklus se i dalje odbija.
  test("ugnežđavanje ideje je direktno, resolveNesting je STARI_TOK, izvlači svaki član i ciklus se odbija", async () => {
    const { t, workspaceId, author, member, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const childIdeaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Dete",
      text: "Dete",
      x: 300,
      y: 220,
    });
    const parentIdeaId = await asMember.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Parent",
      text: "Parent",
      x: 100,
      y: 100,
    });
    const requested = await asAuthor.mutation(
      api.prostor.collaboration.requestNesting,
      { workspaceId, childIdeaId, parentIdeaId },
    );
    expect(requested).toEqual({ status: "approved", requestId: null });
    expect(
      await t.run((ctx) => ctx.db.get("ideaNodes", childIdeaId)),
    ).toMatchObject({ parentIdeaId, x: 200, y: 120 });
    expect(
      await t.run((ctx) => ctx.db.query("nestingRequests").collect()),
    ).toEqual([]);
    await expect(
      asMember.mutation(api.prostor.collaboration.requestNesting, {
        workspaceId,
        childIdeaId: parentIdeaId,
        parentIdeaId: childIdeaId,
      }),
    ).rejects.toThrow("kružnu hijerarhiju");

    // Stari otvoreni zahtev: odluka je ugašena, red ostaje kakav jeste.
    const legacyRequestId = await t.run((ctx) =>
      ctx.db.insert("nestingRequests", {
        workspaceId,
        childIdeaId,
        parentIdeaId,
        requesterProfileId: author.profileId,
        parentAuthorProfileId: member.profileId,
        proposedX: 5,
        proposedY: 5,
        status: "pending",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        resolvedAt: null,
      }),
    );
    const legacyError = await asMember
      .mutation(api.prostor.collaboration.resolveNesting, {
        workspaceId,
        requestId: legacyRequestId,
        approve: true,
      })
      .catch((error: unknown) => error);
    expect(String(legacyError)).toContain("Zahtevi za ugnežđavanje više ne postoje");
    expect((legacyError as { data?: { code?: string } }).data?.code).toBe(
      "STARI_TOK",
    );
    expect(
      await t.run((ctx) => ctx.db.get("nestingRequests", legacyRequestId)),
    ).toMatchObject({ status: "pending" });

    // Prvo izvlačenje (admin nije autor ni deteta ni roditelja) zatvara stari
    // zahtev koji UI prikazuje kao ugnežđavanje; drugo izvlači stvarno dete.
    await asAdmin.mutation(api.prostor.collaboration.detachIdea, {
      workspaceId,
      ideaId: childIdeaId,
    });
    expect(
      await t.run((ctx) => ctx.db.get("nestingRequests", legacyRequestId)),
    ).toMatchObject({ status: "cancelled" });
    await asAdmin.mutation(api.prostor.collaboration.detachIdea, {
      workspaceId,
      ideaId: childIdeaId,
    });
    const detached = await t.run((ctx) => ctx.db.get("ideaNodes", childIdeaId));
    expect(detached?.parentIdeaId).toBeUndefined();
    expect(detached).toMatchObject({ x: 300, y: 220 });

    const first = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Prva",
      text: "Prva",
    });
    const second = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Druga",
      text: "Druga",
    });
    await asAuthor.mutation(api.prostor.collaboration.requestNesting, {
      workspaceId,
      childIdeaId: first,
      parentIdeaId: second,
    });
    await expect(
      asAuthor.mutation(api.prostor.collaboration.requestNesting, {
        workspaceId,
        childIdeaId: second,
        parentIdeaId: first,
      }),
    ).rejects.toThrow("kružnu hijerarhiju");
  });

  // PROSTOR K03 (P3, P4): stari `requestDeletion` tuđe ideje je odmah šalje u
  // Korpu (bez zahteva i listića), `voteOnDeletion` je STARI_TOK, a svaki član
  // je vraća iz Korpe.
  test("stari requestDeletion tuđe ideje je šalje u Korpu odmah; voteOnDeletion je STARI_TOK", async () => {
    const { t, workspaceId, author, member, asAuthor, asMember, asAdmin } =
      await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Za timsko glasanje",
      text: "Za timsko glasanje",
    });
    await expect(
      asMember.mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId,
        target: { kind: "idea", id: ideaId },
      }),
    ).resolves.toBeNull();
    expect(await t.run((ctx) => ctx.db.get("ideaNodes", ideaId))).toMatchObject({
      archivedAt: expect.any(Number),
      archivedByProfileId: member.profileId,
      trashState: "root",
    });
    expect(
      await t.run((ctx) => ctx.db.query("deletionRequests").collect()),
    ).toEqual([]);
    expect(
      await t.run((ctx) => ctx.db.query("deletionBallots").collect()),
    ).toEqual([]);

    // Stari otvoreni zahtev sa listićem: glas se više ne upisuje.
    const legacy = await t.run(async (ctx) => {
      const now = Date.now();
      const requestId = await ctx.db.insert("deletionRequests", {
        workspaceId,
        targetKind: "idea",
        targetId: ideaId,
        targetTitle: "Za timsko glasanje",
        requesterProfileId: member.profileId,
        status: "pending",
        eligibleCount: 3,
        approveCount: 1,
        rejectCount: 0,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      });
      const ballotId = await ctx.db.insert("deletionBallots", {
        requestId,
        workspaceId,
        profileId: author.profileId,
        vote: "pending",
        createdAt: now,
        updatedAt: now,
      });
      return { requestId, ballotId };
    });
    const voteError = await asAuthor
      .mutation(api.prostor.collaboration.voteOnDeletion, {
        workspaceId,
        requestId: legacy.requestId,
        vote: "approve",
      })
      .catch((error: unknown) => error);
    expect(String(voteError)).toContain("Glasanje o brisanju više ne postoji");
    expect((voteError as { data?: { code?: string } }).data?.code).toBe(
      "STARI_TOK",
    );
    expect(
      await t.run((ctx) => ctx.db.get("deletionBallots", legacy.ballotId)),
    ).toMatchObject({ vote: "pending" });
    expect(
      await t.run((ctx) => ctx.db.get("deletionRequests", legacy.requestId)),
    ).toMatchObject({ status: "pending", approveCount: 1 });

    await asAdmin.mutation(api.prostor.trash.restore, {
      workspaceId,
      target: { kind: "idea", id: ideaId },
    });
    expect(await t.run((ctx) => ctx.db.get("ideaNodes", ideaId))).toMatchObject({
      archivedAt: null,
    });
  });

  // PROSTOR K03 (D3): brisanje ideje više ne pravi „Oporavljeno" — tuđi
  // komentari ostaju uz ideju i vraćaju se sa njom; dete se i dalje izvlači.
  test("brisanje kontejnera ideje izvlači dete, a tuđi komentari ostaju uz ideju u Korpi", async () => {
    const { t, workspaceId, asAuthor, asMember } = await seedWorkspace();
    const parentIdeaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Kontejner",
      text: "Osnovni sadržaj",
      x: 100,
      y: 100,
    });
    const childIdeaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Ugnježđeno dete",
      text: "Ugnježđeno dete",
      x: 340,
      y: 260,
    });
    await asAuthor.mutation(api.prostor.collaboration.requestNesting, {
      workspaceId,
      childIdeaId,
      parentIdeaId,
    });
    const foreignContributionId = await asMember.mutation(
      api.prostor.collaboration.addContribution,
      {
        workspaceId,
        target: { kind: "idea", id: parentIdeaId },
        content: "Tuđi doprinos koji mora ostati sačuvan",
      },
    );

    const result = await asAuthor.mutation(api.prostor.ideas.archive, {
      workspaceId,
      ideaId: parentIdeaId,
    });
    expect(result.recoveredId).toBeNull();
    const state = await t.run(async (ctx) => ({
      child: await ctx.db.get("ideaNodes", childIdeaId),
      foreignContribution: await ctx.db.get(
        "contentContributions",
        foreignContributionId,
      ),
      recovered: await ctx.db.query("recoveredContent").collect(),
    }));
    expect(state.child?.archivedAt).toBeNull();
    expect(state.child?.parentIdeaId).toBeUndefined();
    expect(state.child).toMatchObject({ x: 340, y: 260 });
    expect(state.foreignContribution).toMatchObject({
      archivedAt: null,
      targetKind: "idea",
      targetId: parentIdeaId,
    });
    expect(state.recovered).toEqual([]);

    await asMember.mutation(api.prostor.trash.restore, {
      workspaceId,
      target: { kind: "idea", id: parentIdeaId },
    });
    const contributions = await asMember.query(
      api.prostor.collaboration.listContributions,
      { workspaceId, target: { kind: "idea", id: parentIdeaId } },
    );
    expect(contributions.map((row) => row._id)).toContain(
      foreignContributionId,
    );
  });

  test("admin ne vidi privatne misli drugog člana", async () => {
    const { workspaceId, asAuthor, asAdmin } = await seedWorkspace();
    await asAuthor.mutation(api.prostor.thoughts.createNode, {
      workspaceId,
      title: "Privatno",
      text: "Samo autor",
      x: 0,
      y: 0,
      color: "violet",
    });
    const adminThoughts = await asAdmin.query(api.prostor.thoughts.listNodes, {
      workspaceId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(adminThoughts.page).toHaveLength(0);
  });

  test("resize privatne misli ostaje kompatibilan sa paginiranim listNodes odgovorom", async () => {
    const { workspaceId, asAuthor } = await seedWorkspace();
    const nodeId = await asAuthor.mutation(api.prostor.thoughts.createNode, {
      workspaceId,
      title: "Resize misao",
      text: "Sadrzaj koji mora ostati dostupan posle promene velicine.",
      x: 20,
      y: 30,
      color: "green",
    });

    await asAuthor.mutation(api.prostor.thoughts.updateNodeLayout, {
      nodeId,
      x: 24,
      y: 36,
      width: 520,
      height: 420,
    });

    const thoughts = await asAuthor.query(api.prostor.thoughts.listNodes, {
      workspaceId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(thoughts.page).toEqual([
      expect.objectContaining({
        _id: nodeId,
        x: 24,
        y: 36,
        width: 520,
        height: 420,
      }),
    ]);

    await asAuthor.mutation(api.prostor.thoughts.resetNodeLayoutSize, { nodeId });
    const resetThoughts = await asAuthor.query(api.prostor.thoughts.listNodes, {
      workspaceId,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(resetThoughts.page[0]).not.toHaveProperty("width");
    expect(resetThoughts.page[0]).not.toHaveProperty("height");
  });

  test("resize ideje se vraca kroz zajednicki canvas odgovor", async () => {
    const { workspaceId, asAuthor } = await seedWorkspace();
    const ideaId = await asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId,
      title: "Resize ideja",
      text: "Ideja sa sacuvanim dimenzijama.",
      x: 40,
      y: 60,
    });

    await asAuthor.mutation(api.prostor.ideas.updateLayout, {
      workspaceId,
      ideaId,
      x: 48,
      y: 72,
      width: 520,
      height: 420,
    });

    const ideas = await asAuthor.query(api.prostor.ideas.list, { workspaceId });
    expect(ideas.nodes).toContainEqual(
      expect.objectContaining({
        _id: ideaId,
        x: 48,
        y: 72,
        width: 520,
        height: 420,
      }),
    );

    await asAuthor.mutation(api.prostor.ideas.resetLayoutSize, {
      workspaceId,
      ideaId,
    });
    const resetIdeas = await asAuthor.query(api.prostor.ideas.list, { workspaceId });
    const resetIdea = resetIdeas.nodes.find((idea) => idea._id === ideaId);
    expect(resetIdea).not.toHaveProperty("width");
    expect(resetIdea).not.toHaveProperty("height");
  });

  test("resize beleske ili zadatka se vraca kroz area canvas odgovor", async () => {
    const { t, workspaceId, author, asAuthor } = await seedWorkspace();
    const { areaId, pageId } = await t.run(async (ctx) => {
      const now = Date.now();
      const areaId = await ctx.db.insert("areas", {
        workspaceId,
        key: "dev",
        label: "Dev notes",
        position: 0,
        createdAt: now,
      });
      const pageId = await ctx.db.insert("pages", {
        workspaceId,
        areaId,
        parentPageId: null,
        kind: "note",
        title: "Resize beleska",
        searchText: "resize beleska",
        revision: 1,
        position: 0,
        taskStatus: null,
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        createdByProfileId: author.profileId,
        updatedByProfileId: author.profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { areaId, pageId };
    });

    await asAuthor.mutation(api.prostor.canvases.resizeAreaCanvasPage, {
      workspaceId,
      pageId,
      width: 520,
      height: 420,
    });

    const canvas = await asAuthor.query(api.prostor.canvases.getAreaCanvas, {
      workspaceId,
      areaId,
      kind: "note",
    });
    expect(canvas.pages).toContainEqual(
      expect.objectContaining({
        _id: pageId,
        width: 520,
        height: 420,
      }),
    );

    await asAuthor.mutation(api.prostor.canvases.resetAreaCanvasPageSize, {
      workspaceId,
      pageId,
    });
    const resetCanvas = await asAuthor.query(api.prostor.canvases.getAreaCanvas, {
      workspaceId,
      areaId,
      kind: "note",
    });
    expect(resetCanvas.pages).toContainEqual(
      expect.objectContaining({
        _id: pageId,
        width: 288,
        height: 196,
      }),
    );
    expect(
      await asAuthor.query(api.prostor.canvases.getPageCanvasSize, {
        workspaceId,
        pageId,
      }),
    ).toEqual({});
  });
});
