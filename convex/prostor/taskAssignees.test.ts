/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/taskAssignees.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_TASK_ASSIGNEES } from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seedAssigneeWorkspace(memberCount = 3) {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    // `role: "admin"` kroz `insertProfil` pravi vlasnika platforme (Enigmin
    // ekvivalent Devotion admina); samo patch profila to ne bi uradio.
    const createPerson = async (
      name: string,
      role: "admin" | "member" = "member",
    ) => {
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
    };

    const owner = await createPerson("Owner");
    const admin = await createPerson("Admin", "admin");
    const members = [];
    for (let index = 0; index < memberCount; index += 1) {
      members.push(await createPerson(`Clan${index + 1}`));
    }
    const workspaceId = await insertStartup(ctx, {
      name: "Assignee startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, admin, ...members]) {
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
      key: "assignee-area",
      label: "Assignee area",
      position: 0,
      createdAt: now,
    });
    return { owner, admin, members, workspaceId, areaId };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const asOwner = asPerson(seeded.owner);
  const taskPageId = await asOwner.mutation(api.prostor.pages.create, {
    workspaceId: seeded.workspaceId,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "task",
    title: "Zajednički zadatak",
  });

  return {
    t,
    ...seeded,
    asPerson,
    asOwner,
    taskPageId,
    ids: () =>
      asOwner
        .query(api.prostor.taskAssignees.listForTask, {
          workspaceId: seeded.workspaceId,
          taskPageId,
        })
        .then((rows) => rows.map((row) => row.profileId)),
  };
}

describe("spisak izvršilaca zadatka", () => {
  test("kreator postavlja spisak, projekcija prati prvog", async () => {
    const { t, taskPageId, members, asOwner, ids, workspaceId } =
      await seedAssigneeWorkspace();

    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });
    expect(await ids()).toEqual([members[0].profileId, members[1].profileId]);
    expect(
      (await t.run((ctx) => ctx.db.get("pages", taskPageId)))
        ?.assigneeProfileId,
    ).toBe(members[0].profileId);

    // Skidanje prvog pomera projekciju na sledećeg u redu.
    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[1].profileId],
    });
    expect(
      (await t.run((ctx) => ctx.db.get("pages", taskPageId)))
        ?.assigneeProfileId,
    ).toBe(members[1].profileId);

    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [],
    });
    expect(
      (await t.run((ctx) => ctx.db.get("pages", taskPageId)))
        ?.assigneeProfileId,
    ).toBeNull();
  });

  test("svaki član sam sebe dodaje i skida; tuđe učešće na zaključanom menja samo autor, vlasnik i admin", async () => {
    // PROSTOR P1 (namerna promena pravila): ranije je tuđe učešće skidao samo
    // kreator; sada svaki član, osim na zaključanom zadatku.
    const { taskPageId, members, asPerson, asOwner, ids, workspaceId } =
      await seedAssigneeWorkspace();
    const asFirst = asPerson(members[0]);
    const asSecond = asPerson(members[1]);

    await asFirst.mutation(api.prostor.taskAssignees.join, { workspaceId, taskPageId });
    await asSecond.mutation(api.prostor.taskAssignees.join, { workspaceId, taskPageId });
    expect(await ids()).toEqual([members[0].profileId, members[1].profileId]);

    // Ponovno priključivanje ne pravi duplikat.
    await asFirst.mutation(api.prostor.taskAssignees.join, { workspaceId, taskPageId });
    expect(await ids()).toHaveLength(2);

    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId: taskPageId });
    await expect(
      asFirst.mutation(api.prostor.taskAssignees.remove, {
        workspaceId,
        taskPageId,
        profileId: members[1].profileId,
      }),
    ).rejects.toThrow("zaključana");

    // Sebe skida svako, i sa zaključanog zadatka.
    await asFirst.mutation(api.prostor.taskAssignees.leave, { workspaceId, taskPageId });
    expect(await ids()).toEqual([members[1].profileId]);

    await asOwner.mutation(api.prostor.pages.unlock, { workspaceId, pageId: taskPageId });
    await asFirst.mutation(api.prostor.taskAssignees.remove, {
      workspaceId,
      taskPageId,
      profileId: members[1].profileId,
    });
    expect(await ids()).toEqual([]);
  });

  test("spisak menja svaki član, zaključan samo autor, vlasnik i admin", async () => {
    // PROSTOR P1 (namerna promena pravila): ranije „samo autor zadatka".
    const { taskPageId, members, asPerson, asOwner, admin, ids, workspaceId } =
      await seedAssigneeWorkspace(MAX_TASK_ASSIGNEES + 1);

    await asPerson(members[0]).mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[1].profileId],
    });
    expect(await ids()).toEqual([members[1].profileId]);

    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId: taskPageId });
    await expect(
      asPerson(members[0]).mutation(api.prostor.taskAssignees.setAssignees, {
        workspaceId,
        taskPageId,
        profileIds: [members[0].profileId],
      }),
    ).rejects.toThrow("zaključana");
    await asPerson(admin).mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[2].profileId],
    });
    expect(await ids()).toEqual([members[2].profileId]);
  });

  test("preko granice izvršilaca mutacija pada", async () => {
    const { taskPageId, members, asOwner, workspaceId } = await seedAssigneeWorkspace(
      MAX_TASK_ASSIGNEES + 1,
    );

    await expect(
      asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
        workspaceId,
        taskPageId,
        profileIds: members.map((member) => member.profileId),
      }),
    ).rejects.toThrow(`najviše ${MAX_TASK_ASSIGNEES} izvršilaca`);
  });

  test("svaki izvršilac menja status i štiklira checkpointe, i na zaključanom zadatku", async () => {
    // PROSTOR P1 (namerna promena pravila): na otključanom zadatku korake
    // završava svaki član; na zaključanom samo autor, menadžer i izvršilac (D5).
    const { taskPageId, members, asPerson, asOwner, workspaceId } =
      await seedAssigneeWorkspace();
    const asSecond = asPerson(members[1]);

    const checkpointId = await asOwner.mutation(api.prostor.taskCheckpoints.create, {
      workspaceId,
      taskPageId,
      text: "Prvi korak",
    });
    await asOwner.mutation(api.prostor.pages.lock, { workspaceId, pageId: taskPageId });
    await expect(
      asSecond.mutation(api.prostor.taskCheckpoints.setCompleted, {
        workspaceId,
        checkpointId,
        completed: true,
      }),
    ).rejects.toThrow("zaključana");

    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    await asSecond.mutation(api.prostor.taskCheckpoints.setCompleted, {
      workspaceId,
      checkpointId,
      completed: true,
    });
    await expect(
      asSecond.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId,
        pageId: taskPageId,
        status: "in_progress",
      }),
    ).resolves.toBe(taskPageId);
  });

  test("„Moji zadaci” vide svi izvršioci, ne samo prvi", async () => {
    const { taskPageId, members, asPerson, asOwner, workspaceId } =
      await seedAssigneeWorkspace();

    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    for (const member of [members[0], members[1]]) {
      const mine = await asPerson(member).query(api.prostor.tasks.listMine, {});
      expect(mine.map((task) => task._id)).toContain(taskPageId);
    }
    expect(
      (await asPerson(members[2]).query(api.prostor.tasks.listMine, {})).map(
        (task) => task._id,
      ),
    ).not.toContain(taskPageId);
  });

  test("ogledala statusa i roka prate zadatak", async () => {
    const { t, taskPageId, members, asOwner, asPerson, workspaceId } =
      await seedAssigneeWorkspace();
    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });
    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId,
      pageId: taskPageId,
      status: "in_progress",
      dueDate: 1_900_000_000_000,
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("taskAssignees")
        .withIndex("by_task_active_created", (q) =>
          q.eq("taskPageId", taskPageId).eq("archivedAt", null),
        )
        .collect(),
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.taskStatus).toBe("in_progress");
      expect(row.taskSortAt).toBe(1_900_000_000_000);
    }

    // Filtriranje po statusu čita ista ogledala.
    const filtered = await asPerson(members[1]).query(api.prostor.tasks.listMine, {
      status: "in_progress",
    });
    expect(filtered.map((task) => task._id)).toContain(taskPageId);
  });

  test("uklanjanje člana iz startupa ga skida sa zadatka bez rušenja ostalih", async () => {
    // Enigma: člana uklanja vlasnik projekta kroz `membersStore.removeMember`
    // (Devotion: `startups.removeMember`), uz obavezan primalac leadova.
    const { taskPageId, members, owner, asOwner, workspaceId, ids } =
      await seedAssigneeWorkspace();
    await asOwner.mutation(api.prostor.taskAssignees.setAssignees, {
      workspaceId,
      taskPageId,
      profileIds: [members[0].profileId, members[1].profileId],
    });

    await asOwner.mutation(api.membersStore.removeMember, {
      workspaceId,
      userId: members[0].userId,
      preuzimaLeadoveUserId: owner.userId,
    });

    expect(await ids()).toEqual([members[1].profileId]);
  });

  // „arhiviranje profila ga skida sa svih zadataka“ se ne prenosi (plan S01 §1.4: nema globalne arhive profila, `profiles.archive` ne postoji).

  test("legacy zadatak bez join redova čita staru kolonu i sam se popravi", async () => {
    const { t, taskPageId, members, workspaceId, asOwner, asPerson, ids } =
      await seedAssigneeWorkspace();

    // Stanje pre migracije: skalarna kolona popunjena, join tabela prazna.
    await t.run(async (ctx) => {
      await ctx.db.patch("pages", taskPageId, {
        assigneeProfileId: members[0].profileId,
      });
    });
    expect(await ids()).toEqual([members[0].profileId]);

    // Priključivanje drugog člana ne sme da izgubi zatečenog izvršioca.
    await asPerson(members[1]).mutation(api.prostor.taskAssignees.join, { workspaceId, taskPageId });
    expect(await ids()).toEqual([members[0].profileId, members[1].profileId]);

    // Prvi upis je ujedno i popravka: join redovi sada postoje za oba člana.
    const rows = await t.run((ctx) =>
      ctx.db
        .query("taskAssignees")
        .withIndex("by_task_active_created", (q) =>
          q.eq("taskPageId", taskPageId).eq("archivedAt", null),
        )
        .collect(),
    );
    expect(rows.map((row) => row.profileId)).toEqual([
      members[0].profileId,
      members[1].profileId,
    ]);
    void asOwner;
  });

  // „verifier prijavljuje zadatke koji čekaju backfill“ se ne prenosi (plan S01 §1.4: migracije se ne prenose, P21).
});
