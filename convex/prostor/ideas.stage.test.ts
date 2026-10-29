/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/ideas.stage.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

/**
 * PROSTOR P6 (K05): faze ideje, glasanje tima i „Pretvori" samo u fazi
 * „Odobreno". Startup A: Vlasnik (createdBy), Autor, Član, Admin (uloga admin,
 * član), Uklonjen (arhivirano članstvo), Arhiviran (arhiviran profil, član).
 * Van A: Stranac (vlasnik startupa B) i AdminVan (admin koji nije član A).
 */
async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      options: { role?: "admin" | "member"; archived?: boolean } = {},
    ) => {
      const email = `${name.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email,
        role: options.role ?? "member",
        archivedAt: options.archived === true ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await person("Vlasnik");
    const author = await person("Autor");
    const member = await person("Clan");
    const admin = await person("Admin", { role: "admin" });
    const removed = await person("Uklonjen");
    const archived = await person("Arhiviran", { archived: true });
    const stranger = await person("Stranac");
    const outsideAdmin = await person("AdminVan", { role: "admin" });

    const workspace = async (
      name: string,
      createdBy: Id<"profiles">,
      members: Array<{ profileId: Id<"profiles">; archived?: boolean }>,
    ) => {
      const workspaceId = await insertStartup(ctx, {
        name,
        description: "",
        createdByProfileId: createdBy,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      for (const entry of members) {
        await insertClanstvo(ctx, {
          workspaceId,
          profileId: entry.profileId,
          addedByProfileId: createdBy,
          archivedAt: entry.archived === true ? now : null,
          createdAt: now,
        });
      }
      const areaId = await ctx.db.insert("areas", {
        workspaceId,
        key: "dev",
        label: `${name} dev`,
        position: 0,
        createdAt: now,
      });
      return { workspaceId, areaId };
    };
    const a = await workspace("A", owner.profileId, [
      { profileId: owner.profileId },
      { profileId: author.profileId },
      { profileId: member.profileId },
      { profileId: admin.profileId },
      { profileId: removed.profileId, archived: true },
      { profileId: archived.profileId },
    ]);
    const b = await workspace("B", stranger.profileId, [
      { profileId: stranger.profileId },
    ]);
    return {
      owner,
      author,
      member,
      admin,
      removed,
      archived,
      stranger,
      outsideAdmin,
      a,
      b,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const createIdea = (
    who: { userId: Id<"users"> },
    workspaceId: Id<"workspaces">,
    title: string,
  ) =>
    as(who).mutation(api.prostor.ideas.create, {
      workspaceId,
      title,
      text: `${title} tekst`,
    });
  return {
    t,
    ...s,
    as,
    createIdea,
    asOwner: as(s.owner),
    asAuthor: as(s.author),
    asMember: as(s.member),
    asAdmin: as(s.admin),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function stageActivities(s: Seeded) {
  const rows = await s.t.run((ctx) =>
    ctx.db
      .query("activities")
      .withIndex("by_workspaceId_and_createdAt", (q) =>
        q.eq("workspaceId", s.a.workspaceId),
      )
      .collect(),
  );
  return rows.filter((row) => row.action === "idea_stage_changed");
}

/** Svi pristupi koji uvek moraju da padnu (nečlan, uklonjen, arhiviran, admin van startupa). */
function outsiders(s: Seeded) {
  return [
    { label: "nečlan", client: s.as(s.stranger) },
    { label: "uklonjen član", client: s.as(s.removed) },
    { label: "arhiviran profil", client: s.as(s.archived) },
    { label: "admin van startupa", client: s.as(s.outsideAdmin) },
  ];
}

describe("ideas.setStage", () => {
  test("autor, vlasnik i admin menjaju fazu, član ne; ista faza ne pravi upis", async () => {
    const s = await seed();
    const ideaId = await s.createIdea(s.author, s.a.workspaceId, "Ideja");

    await expect(
      s.asMember.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId,
        stage: "razmatra_se",
      }),
    ).rejects.toThrow(/NEMA_DOZVOLU.*Fazu ideje menja autor ili vlasnik projekta\./);

    await expect(
      s.asAuthor.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId,
        stage: "razmatra_se",
      }),
    ).resolves.toEqual({ stage: "razmatra_se", previousStage: "predlog" });
    const afterAuthor = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(afterAuthor).toMatchObject({
      stage: "razmatra_se",
      stageChangedByProfileId: s.author.profileId,
    });
    expect(typeof afterAuthor?.stageChangedAt).toBe("number");

    await expect(
      s.asOwner.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId,
        stage: "odobreno",
      }),
    ).resolves.toEqual({ stage: "odobreno", previousStage: "razmatra_se" });
    await expect(
      s.asAdmin.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId,
        stage: "odbijeno",
      }),
    ).resolves.toEqual({ stage: "odbijeno", previousStage: "odobreno" });
    const afterAdmin = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(afterAdmin?.stageChangedByProfileId).toBe(s.admin.profileId);

    // Ista faza: bez upisa i bez nove aktivnosti.
    await expect(
      s.asAuthor.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId,
        stage: "odbijeno",
      }),
    ).resolves.toEqual({ stage: "odbijeno", previousStage: "odbijeno" });
    const unchanged = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(unchanged?.stageChangedAt).toBe(afterAdmin?.stageChangedAt);

    const activities = await stageActivities(s);
    expect(activities.map((row) => [row.actorProfileId, row.detail])).toEqual([
      [s.author.profileId, "Razmatra se"],
      [s.owner.profileId, "Odobreno"],
      [s.admin.profileId, "Odbijeno"],
    ]);
    expect(activities.every((row) => row.title === "Ideja")).toBe(true);
    expect(
      activities.every((row) => row.targetType === "idea" && row.targetId === ideaId),
    ).toBe(true);

    // Faza ne šalje obaveštenja.
    const notifications = await s.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notifications).toHaveLength(0);
  });

  test("pretvorena ideja, spoljni pristupi i drugi startup se odbijaju bez izmene", async () => {
    const s = await seed();
    const ideaId = await s.createIdea(s.author, s.a.workspaceId, "Ideja");
    const foreignIdea = await s.createIdea(s.stranger, s.b.workspaceId, "Tuđa");

    for (const { label, client } of outsiders(s)) {
      await expect(
        client.mutation(api.prostor.ideas.setStage, {
          workspaceId: s.a.workspaceId,
          ideaId,
          stage: "odobreno",
        }),
        label,
      ).rejects.toThrow();
    }
    // Ideja iz drugog startupa kroz moj startup, i obrnuto.
    await expect(
      s.asOwner.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId: foreignIdea,
        stage: "odobreno",
      }),
    ).rejects.toThrow(/Ideja nije pronađena/);
    await expect(
      s.as(s.stranger).mutation(api.prostor.ideas.setStage, {
        workspaceId: s.b.workspaceId,
        ideaId,
        stage: "odobreno",
      }),
    ).rejects.toThrow(/Ideja nije pronađena/);

    const untouched = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(untouched?.stage).toBeUndefined();
    expect(await stageActivities(s)).toHaveLength(0);

    // Posle konverzije faza se više ne menja (D17), ni za menadžera.
    await s.asAuthor.mutation(api.prostor.ideas.setStage, {
      workspaceId: s.a.workspaceId,
      ideaId,
      stage: "odobreno",
    });
    await s.asAuthor.mutation(api.prostor.ideas.convertToPage, {
      workspaceId: s.a.workspaceId,
      ideaId,
      areaId: s.a.areaId,
      kind: "note",
    });
    await expect(
      s.asOwner.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId,
        stage: "odbijeno",
      }),
    ).rejects.toThrow(/Ideja je već pretvorena\./);
  });
});

describe("ideas.vote", () => {
  test("svaki član glasa za tuđu ideju, a autor dobija obaveštenje kad glasa drugi", async () => {
    const s = await seed();
    const ideaId = await s.createIdea(s.author, s.a.workspaceId, "Ideja");
    const vote = (
      client: Seeded["asMember"],
      voteType: "up" | "down",
    ) =>
      client.mutation(api.prostor.ideas.vote, {
        workspaceId: s.a.workspaceId,
        ideaId,
        voteType,
      });

    await expect(vote(s.asMember, "down")).resolves.toEqual({ action: "created" });
    await expect(vote(s.asOwner, "up")).resolves.toEqual({ action: "created" });
    await expect(vote(s.asAdmin, "down")).resolves.toEqual({ action: "created" });
    await expect(vote(s.asMember, "up")).resolves.toEqual({ action: "updated" });
    // Isti glas ponovo ga skida (ponašanje ostaje).
    await expect(vote(s.asAdmin, "down")).resolves.toEqual({ action: "removed" });
    // Autor je pri pravljenju već dao „za"; isti glas ga skida.
    await expect(vote(s.asAuthor, "up")).resolves.toEqual({ action: "removed" });

    const listed = await s.asMember.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    const node = listed.nodes.find((item) => item._id === ideaId)!;
    expect(node).toMatchObject({ upvotes: 2, downvotes: 0, myVote: "up", userVote: "up" });

    const notifications = await s.t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
          q.eq("recipientProfileId", s.author.profileId).eq("workspaceId", s.a.workspaceId),
        )
        .collect(),
    );
    const voted = notifications.filter((row) => row.type === "idea_voted");
    expect(voted.length).toBeGreaterThan(0);
    expect(
      voted.every(
        (row) =>
          row.targetType === "ideas" &&
          row.targetId === ideaId &&
          row.actorProfileId !== s.author.profileId,
      ),
    ).toBe(true);
    expect(new Set(voted.map((row) => row.actorProfileId))).toEqual(
      new Set([s.member.profileId, s.owner.profileId, s.admin.profileId]),
    );
    // Niko drugi ne dobija obaveštenje o glasu.
    const others = await s.t.run((ctx) => ctx.db.query("notifications").collect());
    expect(
      others.every((row) => row.recipientProfileId === s.author.profileId),
    ).toBe(true);
  });

  test("pretvorena i obrisana ideja se ne glasaju; spoljni pristupi padaju", async () => {
    const s = await seed();
    const ideaId = await s.createIdea(s.author, s.a.workspaceId, "Ideja");
    for (const { label, client } of outsiders(s)) {
      await expect(
        client.mutation(api.prostor.ideas.vote, {
          workspaceId: s.a.workspaceId,
          ideaId,
          voteType: "up",
        }),
        label,
      ).rejects.toThrow();
    }

    await s.asAuthor.mutation(api.prostor.ideas.setStage, {
      workspaceId: s.a.workspaceId,
      ideaId,
      stage: "odobreno",
    });
    await s.asAuthor.mutation(api.prostor.ideas.convertToPage, {
      workspaceId: s.a.workspaceId,
      ideaId,
      areaId: s.a.areaId,
      kind: "task",
    });
    await expect(
      s.asMember.mutation(api.prostor.ideas.vote, {
        workspaceId: s.a.workspaceId,
        ideaId,
        voteType: "up",
      }),
    ).rejects.toThrow(/Ideja je već pretvorena\./);

    const trashed = await s.createIdea(s.author, s.a.workspaceId, "U korpi");
    await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.a.workspaceId,
      ideaId: trashed,
    });
    await expect(
      s.asMember.mutation(api.prostor.ideas.vote, {
        workspaceId: s.a.workspaceId,
        ideaId: trashed,
        voteType: "up",
      }),
    ).rejects.toThrow(/Ideja nije pronađena/);

    const votes = await s.t.run((ctx) =>
      ctx.db
        .query("ideaVotes")
        .withIndex("by_ideaId", (q) => q.eq("ideaId", ideaId))
        .collect(),
    );
    expect(votes.map((row) => row.profileId)).toEqual([s.author.profileId]);
  });
});

describe("ideas.convertToPage", () => {
  test("samo u fazi Odobreno i samo autor, vlasnik ili admin; glasovi više ne odlučuju", async () => {
    const s = await seed();
    const ideaId = await s.createIdea(s.author, s.a.workspaceId, "Ideja");
    const convert = (client: Seeded["asMember"], id: Id<"ideaNodes">) =>
      client.mutation(api.prostor.ideas.convertToPage, {
        workspaceId: s.a.workspaceId,
        ideaId: id,
        areaId: s.a.areaId,
        kind: "task",
      });

    // Predlog i Razmatra se — ni autor ne pretvara.
    await expect(convert(s.asAuthor, ideaId)).rejects.toThrow(
      /Ideja mora biti u fazi „Odobreno”\./,
    );
    await s.asAuthor.mutation(api.prostor.ideas.setStage, {
      workspaceId: s.a.workspaceId,
      ideaId,
      stage: "razmatra_se",
    });
    await expect(convert(s.asOwner, ideaId)).rejects.toThrow(
      /Ideja mora biti u fazi „Odobreno”\./,
    );
    await s.asAuthor.mutation(api.prostor.ideas.setStage, {
      workspaceId: s.a.workspaceId,
      ideaId,
      stage: "odobreno",
    });
    // Član koji nije autor ni menadžer ne pretvara ni odobrenu ideju.
    await expect(convert(s.asMember, ideaId)).rejects.toThrow(
      /Ideju pretvara njen autor ili vlasnik projekta\./,
    );
    for (const { label, client } of outsiders(s)) {
      await expect(convert(client, ideaId), label).rejects.toThrow();
    }

    // Više „protiv" nego „za" više ne blokira (stari uslov je ukinut).
    for (const client of [s.asMember, s.asAdmin, s.asOwner]) {
      await client.mutation(api.prostor.ideas.vote, {
        workspaceId: s.a.workspaceId,
        ideaId,
        voteType: "down",
      });
    }
    const pageId = await convert(s.asAuthor, ideaId);
    const converted = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(converted?.convertedPageId).toBe(pageId);
    await expect(convert(s.asAuthor, ideaId)).rejects.toThrow(/Ideja je već pretvorena\./);

    // Vlasnik i admin pretvaraju tuđu odobrenu ideju.
    for (const client of [s.asOwner, s.asAdmin]) {
      const other = await s.createIdea(s.author, s.a.workspaceId, "Druga");
      await s.asAuthor.mutation(api.prostor.ideas.setStage, {
        workspaceId: s.a.workspaceId,
        ideaId: other,
        stage: "odobreno",
      });
      await expect(convert(client, other)).resolves.toBeTruthy();
    }

    // Pretvorena ideja se prikazuje kao „Postalo zadatak" i niko je više ne menja.
    const listed = await s.asOwner.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    const node = listed.nodes.find((item) => item._id === ideaId)!;
    expect(node).toMatchObject({
      stage: "postalo_zadatak",
      storedStage: "odobreno",
      isApproved: false,
      permissions: {
        canEdit: true,
        canVote: false,
        canSetStage: false,
        canConvert: false,
        canArchive: true,
        canComment: true,
      },
    });
  });
});

describe("ideas.list", () => {
  test("faza, glasovi, broj komentara i dozvole po gledaocu; stari zahtevi su prazni", async () => {
    const s = await seed();
    const first = await s.createIdea(s.author, s.a.workspaceId, "Prva");
    const second = await s.createIdea(s.author, s.a.workspaceId, "Druga");
    await s.asMember.mutation(api.prostor.ideas.connect, {
      workspaceId: s.a.workspaceId,
      nodeAId: first,
      nodeBId: second,
    });
    for (const content of ["Prvi komentar", "Drugi komentar"]) {
      await s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.a.workspaceId,
        target: { kind: "idea", id: first },
        content,
      });
    }
    await s.asAuthor.mutation(api.prostor.ideas.setStage, {
      workspaceId: s.a.workspaceId,
      ideaId: second,
      stage: "odobreno",
    });

    const asMember = await s.asMember.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    expect(asMember.viewer).toEqual({
      profileId: s.member.profileId,
      isManager: false,
    });
    const memberFirst = asMember.nodes.find((node) => node._id === first)!;
    expect(memberFirst).toMatchObject({
      stage: "predlog",
      storedStage: "predlog",
      stageChangedAt: null,
      upvotes: 1,
      downvotes: 0,
      myVote: null,
      commentCount: 2,
      commentCountCapped: false,
      contributionCount: 2,
      isApproved: false,
      permissions: {
        canEdit: true,
        canVote: true,
        canSetStage: false,
        canConvert: false,
        canArchive: true,
        canComment: true,
      },
      // Stara polja (P25): stari zahtevi se više ne čitaju.
      canEdit: true,
      canDeleteDirectly: true,
      canRequestDeletion: false,
      pendingDeletionRequest: null,
      nestingRequestId: null,
      nestingModerationStatus: null,
      canModerateNesting: false,
    });
    const memberSecond = asMember.nodes.find((node) => node._id === second)!;
    expect(memberSecond).toMatchObject({
      stage: "odobreno",
      isApproved: true,
      commentCount: 0,
      permissions: { canSetStage: false, canConvert: false },
    });
    expect(typeof memberSecond.stageChangedAt).toBe("number");
    expect(asMember.edges).toEqual([
      expect.objectContaining({
        canEdit: true,
        canDeleteDirectly: true,
        canRequestDeletion: false,
      }),
    ]);

    const asAuthor = await s.asAuthor.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    expect(asAuthor.nodes.find((node) => node._id === first)).toMatchObject({
      myVote: "up",
      permissions: { canSetStage: true, canConvert: false },
    });
    expect(asAuthor.nodes.find((node) => node._id === second)).toMatchObject({
      permissions: { canSetStage: true, canConvert: true },
    });

    const asOwner = await s.asOwner.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    expect(asOwner.viewer.isManager).toBe(true);
    expect(asOwner.nodes.find((node) => node._id === second)).toMatchObject({
      permissions: { canSetStage: true, canConvert: true },
    });
    const asAdmin = await s.asAdmin.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    expect(asAdmin.viewer.isManager).toBe(true);

    for (const { label, client } of outsiders(s)) {
      await expect(
        client.query(api.prostor.ideas.list, { workspaceId: s.a.workspaceId }),
        label,
      ).rejects.toThrow();
    }
  });

  test("broj komentara staje na 20 („20+”)", async () => {
    const s = await seed();
    const ideaId = await s.createIdea(s.author, s.a.workspaceId, "Ideja");
    for (let index = 0; index < 21; index += 1) {
      await s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.a.workspaceId,
        target: { kind: "idea", id: ideaId },
        content: `Komentar ${index}`,
      });
    }
    const listed = await s.asAuthor.query(api.prostor.ideas.list, {
      workspaceId: s.a.workspaceId,
    });
    expect(listed.nodes[0]).toMatchObject({
      commentCount: 20,
      commentCountCapped: true,
    });
  });
});
