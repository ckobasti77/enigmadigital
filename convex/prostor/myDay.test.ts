/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/myDay.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { pageTaskSortAt } from "./lib/pages";
import { MAX_MY_DAY_ENTRIES } from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const TODAY = "2026-10-25";
const YESTERDAY = "2026-10-24";
const WEEK_AGO = "2026-10-18"; // tačno 7 dana — poslednji dan prozora
const EIGHT_DAYS_AGO = "2026-10-17"; // van prozora
const TOMORROW = "2026-10-26";

type TaskStatus = "backlog" | "next" | "in_progress" | "blocked" | "done";

/**
 * Startupi: A (ja + Ana), B (samo ja), C (samo Ana), D (moje članstvo
 * arhivirano), E (arhiviran startup u kome sam član).
 */
async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (name: string) => {
      const email = `${name.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const me = await person("Jovan");
    const other = await person("Ana");

    const workspace = async (
      name: string,
      members: Array<{ profileId: Id<"profiles">; archived?: boolean }>,
      archived = false,
    ) => {
      const workspaceId = await insertStartup(ctx, {
        name,
        description: "",
        createdByProfileId: members[0].profileId,
        archivedAt: archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      for (const member of members) {
        await insertClanstvo(ctx, {
          workspaceId,
          profileId: member.profileId,
          addedByProfileId: members[0].profileId,
          archivedAt: member.archived === true ? now : null,
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

    return {
      me,
      other,
      a: await workspace("Cluck Rush", [{ profileId: me.profileId }, { profileId: other.profileId }]),
      b: await workspace("Scan Me", [{ profileId: me.profileId }]),
      c: await workspace("Tuđi", [{ profileId: other.profileId }]),
      d: await workspace("Napušten", [
        { profileId: other.profileId },
        { profileId: me.profileId, archived: true },
      ]),
      e: await workspace("Arhiviran", [{ profileId: me.profileId }], true),
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return { t, ...seeded, asMe: as(seeded.me), asOther: as(seeded.other) };
}

/** Zadatak upisan direktno, sa ogledalima na redovima izvršilaca. */
async function insertTask(
  ctx: MutationCtx,
  options: {
    scope: { workspaceId: Id<"workspaces">; areaId: Id<"areas"> };
    title: string;
    createdBy: Id<"profiles">;
    assignees?: Array<Id<"profiles">>;
    status?: TaskStatus;
    dueDate?: number | null;
    completedAt?: number | null;
    /** `updatedAt` redova izvršilaca (podrazumevano `now`). */
    assigneeUpdatedAt?: number;
    archivedAt?: number | null;
    now?: number;
  },
) {
  const now = options.now ?? Date.now();
  const status = options.status ?? "next";
  const dueDate = options.dueDate ?? null;
  const assignees = options.assignees ?? [];
  const taskSortAt = pageTaskSortAt(dueDate, now);
  const pageId = await ctx.db.insert("pages", {
    workspaceId: options.scope.workspaceId,
    areaId: options.scope.areaId,
    parentPageId: null,
    kind: "task",
    title: options.title,
    searchText: options.title,
    revision: 0,
    position: 0,
    taskStatus: status,
    taskPriority: "medium",
    assigneeProfileId: assignees[0] ?? null,
    dueDate,
    checkpointTotal: 0,
    checkpointCompleted: 0,
    taskSortAt,
    completedAt: status === "done" ? (options.completedAt ?? now) : null,
    createdByProfileId: options.createdBy,
    updatedByProfileId: options.createdBy,
    archivedAt: options.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  for (const profileId of assignees) {
    await ctx.db.insert("taskAssignees", {
      workspaceId: options.scope.workspaceId,
      taskPageId: pageId,
      profileId,
      taskStatus: status,
      taskSortAt,
      addedByProfileId: options.createdBy,
      archivedAt: null,
      createdAt: now,
      updatedAt: options.assigneeUpdatedAt ?? now,
    });
  }
  return pageId;
}

async function insertEntry(
  ctx: MutationCtx,
  options: {
    profileId: Id<"profiles">;
    dayKey: string;
    taskPageId?: Id<"pages">;
    personalTaskId?: Id<"personalTasks">;
    position?: number;
  },
) {
  const isTask = options.taskPageId !== undefined;
  return await ctx.db.insert("myDayEntries", {
    profileId: options.profileId,
    dayKey: options.dayKey,
    refKind: isTask ? "task" : "personal",
    taskPageId: options.taskPageId ?? null,
    personalTaskId: options.personalTaskId ?? null,
    refKey: isTask ? `task:${options.taskPageId}` : `personal:${options.personalTaskId}`,
    position: options.position ?? 1_024,
    createdAt: Date.now(),
  });
}

describe("myDay.overview", () => {
  test("zadaci iz dva startupa sa mini podacima, lični otvoreni i opseg startupa", async () => {
    const { t, asMe, me, other, a, b } = await seed();
    const ids = await t.run(async (ctx) => ({
      inA: await insertTask(ctx, {
        scope: a,
        title: "Lansiranje",
        createdBy: other.profileId,
        assignees: [me.profileId],
        status: "in_progress",
      }),
      inB: await insertTask(ctx, {
        scope: b,
        title: "Ponuda",
        createdBy: me.profileId,
        assignees: [me.profileId],
        status: "next",
      }),
      onlyOther: await insertTask(ctx, {
        scope: a,
        title: "Anin",
        createdBy: other.profileId,
        assignees: [other.profileId],
      }),
    }));
    const personalId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Teretana" });

    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.dayKey).toBe(TODAY);
    expect(overview.tasks.map((task) => task._id).sort()).toEqual(
      [ids.inA, ids.inB].sort(),
    );
    const inA = overview.tasks.find((task) => task._id === ids.inA)!;
    expect(inA).toMatchObject({
      title: "Lansiranje",
      taskStatus: "in_progress",
      isAssignee: true,
      isCreator: false,
      completedAt: null,
      checkpointTotal: 0,
      workspace: { _id: a.workspaceId, name: "Cluck Rush", logoUrl: null },
      area: { _id: a.areaId, key: "dev", label: "Cluck Rush dev" },
    });
    expect(overview.tasks.find((task) => task._id === ids.inB)?.isCreator).toBe(true);
    expect(Object.keys(inA).sort()).toEqual(
      [
        "_id",
        "area",
        "checkpointCompleted",
        "checkpointTotal",
        "completedAt",
        "createdAt",
        "createdByProfileId",
        "dueDate",
        "isAssignee",
        "isCreator",
        // PROSTOR P1: zaključavanje zadatka (polja se samo dodaju, P25).
        "isLocked",
        "lockedForViewer",
        "taskPriority",
        "taskSortAt",
        "taskStatus",
        "title",
        "updatedAt",
        "workspace",
      ].sort(),
    );
    expect(overview.personal.map((task) => task._id)).toEqual([personalId]);
    // Samo aktivni startupi u kojima sam aktivan član.
    expect(overview.workspaces.map((workspace) => workspace._id).sort()).toEqual(
      [a.workspaceId, b.workspaceId].sort(),
    );
    expect(overview.capped).toEqual({ tasks: false, personal: false, history: false });
  });

  test("startup sa arhiviranim članstvom, arhiviran i tuđ startup ne cure", async () => {
    const { t, asMe, me, other, c, d, e } = await seed();
    const leaked = await t.run(async (ctx) => {
      const inD = await insertTask(ctx, {
        scope: d,
        title: "Iz napuštenog",
        createdBy: other.profileId,
        assignees: [me.profileId],
      });
      const inE = await insertTask(ctx, {
        scope: e,
        title: "Iz arhiviranog",
        createdBy: me.profileId,
        assignees: [me.profileId],
      });
      // Ana me je (pogrešno) dodala na zadatak startupa u kome nisam.
      const inC = await insertTask(ctx, {
        scope: c,
        title: "Iz tuđeg",
        createdBy: other.profileId,
        assignees: [me.profileId],
      });
      const doneInD = await insertTask(ctx, {
        scope: d,
        title: "Završen u napuštenom",
        createdBy: other.profileId,
        assignees: [me.profileId],
        status: "done",
      });
      // Plan sa ranije, dok sam još bio član.
      for (const taskPageId of [inD, inE, inC]) {
        await insertEntry(ctx, { profileId: me.profileId, dayKey: TODAY, taskPageId });
        await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, taskPageId });
      }
      return [inD, inE, inC, doneInD];
    });

    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.tasks).toEqual([]);
    expect(overview.entries).toEqual([]);
    expect(overview.history).toEqual([]);
    expect(overview.workspaces.map((workspace) => workspace.name).sort()).toEqual([
      "Cluck Rush",
      "Scan Me",
    ]);
    const serialized = JSON.stringify(overview);
    for (const id of leaked) expect(serialized).not.toContain(id);
  });

  test("tuđ zadatak iz mog startupa ulazi samo kad ga planiram", async () => {
    const { t, asMe, other, a } = await seed();
    const pageId = await t.run(async (ctx) =>
      insertTask(ctx, {
        scope: a,
        title: "Anin zadatak",
        createdBy: other.profileId,
        assignees: [other.profileId],
      }),
    );
    expect(
      (await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 })).tasks,
    ).toEqual([]);

    await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TODAY,
      ref: { kind: "task", taskPageId: pageId },
    });
    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.tasks).toEqual([
      expect.objectContaining({ _id: pageId, isAssignee: false, isCreator: false }),
    ]);
    expect(overview.entries.map((entry) => entry.refKey)).toEqual([`task:${pageId}`]);
  });

  test("doneSince: završeni od početka dana, ne pre; dodela posle završetka ne važi", async () => {
    const { t, asMe, me, a } = await seed();
    const midnight = new Date("2026-10-25T00:00:00").getTime();
    const ids = await t.run(async (ctx) => {
      const doneToday = await insertTask(ctx, {
        scope: a,
        title: "Završen danas",
        createdBy: me.profileId,
        assignees: [me.profileId],
        status: "done",
        completedAt: midnight + 3_600_000,
        assigneeUpdatedAt: midnight + 3_600_000,
        now: midnight - 86_400_000,
      });
      const doneYesterday = await insertTask(ctx, {
        scope: a,
        title: "Završen juče",
        createdBy: me.profileId,
        assignees: [me.profileId],
        status: "done",
        completedAt: midnight - 3_600_000,
        assigneeUpdatedAt: midnight - 3_600_000,
        now: midnight - 86_400_000,
      });
      // Završen juče, a dodeljen meni danas (red izvršioca je svež).
      const assignedLater = await insertTask(ctx, {
        scope: a,
        title: "Dodeljen posle",
        createdBy: me.profileId,
        assignees: [me.profileId],
        status: "done",
        completedAt: midnight - 7_200_000,
        assigneeUpdatedAt: midnight + 7_200_000,
        now: midnight - 86_400_000,
      });
      const personalDoneToday = await ctx.db.insert("personalTasks", {
        profileId: me.profileId,
        title: "Lično danas",
        status: "done",
        priority: null,
        dueDate: null,
        sortAt: 1,
        completedAt: midnight + 60_000,
        archivedAt: null,
        createdAt: midnight - 86_400_000,
        updatedAt: midnight + 60_000,
      });
      const personalDoneYesterday = await ctx.db.insert("personalTasks", {
        profileId: me.profileId,
        title: "Lično juče",
        status: "done",
        priority: null,
        dueDate: null,
        sortAt: 2,
        completedAt: midnight - 60_000,
        archivedAt: null,
        createdAt: midnight - 86_400_000,
        updatedAt: midnight - 60_000,
      });
      return {
        doneToday,
        doneYesterday,
        assignedLater,
        personalDoneToday,
        personalDoneYesterday,
      };
    });

    const today = await asMe.query(api.prostor.myDay.overview, {
      dayKey: TODAY,
      doneSince: midnight,
    });
    expect(today.tasks.map((task) => task._id)).toEqual([ids.doneToday]);
    expect(today.tasks[0].completedAt).toBe(midnight + 3_600_000);
    expect(today.personal.map((task) => task._id)).toEqual([ids.personalDoneToday]);

    const sinceYesterday = await asMe.query(api.prostor.myDay.overview, {
      dayKey: YESTERDAY,
      doneSince: midnight - 86_400_000,
    });
    expect(sinceYesterday.tasks.map((task) => task._id).sort()).toEqual(
      [ids.doneToday, ids.doneYesterday, ids.assignedLater].sort(),
    );
    expect(sinceYesterday.personal.map((task) => task._id).sort()).toEqual(
      [ids.personalDoneToday, ids.personalDoneYesterday].sort(),
    );
  });

  test("zadatak završen kroz tasks.updateMetadata ulazi u „završeno od“", async () => {
    const { asMe, me, a } = await seed();
    const pageId = await asMe.mutation(api.prostor.pages.create, {
      workspaceId: a.workspaceId,
      areaId: a.areaId,
      parentPageId: null,
      kind: "task",
      title: "Pravim put",
      assigneeProfileIds: [me.profileId],
    });
    const before = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(before.tasks).toEqual([
      expect.objectContaining({ _id: pageId, taskStatus: "backlog", completedAt: null }),
    ]);

    await asMe.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: a.workspaceId,
      pageId,
      status: "done",
    });
    const after = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(after.tasks).toEqual([
      expect.objectContaining({ _id: pageId, taskStatus: "done" }),
    ]);
    expect(typeof after.tasks[0].completedAt).toBe("number");
  });

  test("arhiviran ili obrisan cilj se tiho preskače u planu i istoriji", async () => {
    const { t, asMe, me, a } = await seed();
    const personalId = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Lični za plan",
      addToMyDay: { dayKey: TODAY },
    });
    const ids = await t.run(async (ctx) => {
      const archivedPage = await insertTask(ctx, {
        scope: a,
        title: "Arhivirana stranica",
        createdBy: me.profileId,
        assignees: [me.profileId],
      });
      const deletedPage = await insertTask(ctx, {
        scope: a,
        title: "Obrisana",
        createdBy: me.profileId,
      });
      const kept = await insertTask(ctx, {
        scope: a,
        title: "Ostaje",
        createdBy: me.profileId,
      });
      for (const taskPageId of [archivedPage, deletedPage, kept]) {
        await insertEntry(ctx, { profileId: me.profileId, dayKey: TODAY, taskPageId });
        await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, taskPageId });
      }
      await insertEntry(ctx, {
        profileId: me.profileId,
        dayKey: YESTERDAY,
        personalTaskId: personalId,
      });
      await ctx.db.patch("pages", archivedPage, { archivedAt: Date.now() });
      await ctx.db.delete("pages", deletedPage);
      return { kept };
    });
    await asMe.mutation(api.prostor.personalTasks.archive, { personalTaskId: personalId });

    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.entries.map((entry) => entry.refKey)).toEqual([`task:${ids.kept}`]);
    expect(overview.history.map((entry) => entry.refKey)).toEqual([`task:${ids.kept}`]);
    expect(overview.tasks.map((task) => task._id)).toEqual([ids.kept]);
    expect(overview.personal).toEqual([]);
  });

  test("istorija: prethodnih 7 dana, najnoviji dan prvi, bez današnjeg i starijeg", async () => {
    const { t, asMe, me } = await seed();
    const ids = await t.run(async (ctx) => {
      const make = async (title: string) =>
        await ctx.db.insert("personalTasks", {
          profileId: me.profileId,
          title,
          status: "open",
          priority: null,
          dueDate: null,
          sortAt: 1,
          completedAt: null,
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        });
      const ids = {
        today: await make("danas"),
        yesterday: await make("juče"),
        weekAgo: await make("pre 7 dana"),
        eightDaysAgo: await make("pre 8 dana"),
        tomorrow: await make("sutra"),
      };
      await insertEntry(ctx, { profileId: me.profileId, dayKey: TODAY, personalTaskId: ids.today });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, personalTaskId: ids.yesterday });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: WEEK_AGO, personalTaskId: ids.weekAgo });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: EIGHT_DAYS_AGO, personalTaskId: ids.eightDaysAgo });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: TOMORROW, personalTaskId: ids.tomorrow });
      return ids;
    });
    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.entries.map((entry) => entry.personalTaskId)).toEqual([ids.today]);
    expect(overview.history.map((entry) => entry.dayKey)).toEqual([YESTERDAY, WEEK_AGO]);
    expect(overview.history.map((entry) => entry.personalTaskId)).toEqual([
      ids.yesterday,
      ids.weekAgo,
    ]);
  });

  test("loš dayKey ili doneSince i neprijavljen korisnik se odbijaju", async () => {
    const { t, asMe } = await seed();
    for (const dayKey of ["2026-02-30", "26-10-2026", "2026-10-25T00", ""]) {
      await expect(
        asMe.query(api.prostor.myDay.overview, { dayKey, doneSince: 0 }),
      ).rejects.toThrow("Neispravan dan.");
    }
    for (const doneSince of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      await expect(
        asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince }),
      ).rejects.toThrow("Početak dana nije ispravan.");
    }
    await expect(
      t.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 }),
    ).rejects.toThrow("Niste prijavljeni.");
  });
});

describe("myDay.plan i unplan", () => {
  test("plan je idempotentan za isti dan, a drugi dan je nova stavka", async () => {
    const { asMe } = await seed();
    const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Jednom" });
    const first = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TODAY,
      ref: { kind: "personal", personalTaskId },
    });
    const again = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TODAY,
      ref: { kind: "personal", personalTaskId },
    });
    expect(first.created).toBe(true);
    expect(again).toEqual({ entryId: first.entryId, created: false });
    const tomorrow = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TOMORROW,
      ref: { kind: "personal", personalTaskId },
    });
    expect(tomorrow.created).toBe(true);
    expect(tomorrow.entryId).not.toBe(first.entryId);

    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.entries).toHaveLength(1);
  });

  test(`${MAX_MY_DAY_ENTRIES + 1}. stavka istog dana se odbija`, async () => {
    const { t, asMe, me } = await seed();
    await t.run(async (ctx) => {
      for (let index = 0; index < MAX_MY_DAY_ENTRIES; index += 1) {
        const personalTaskId = await ctx.db.insert("personalTasks", {
          profileId: me.profileId,
          title: `Stavka ${index}`,
          status: "open",
          priority: null,
          dueDate: null,
          sortAt: index,
          completedAt: null,
          archivedAt: null,
          createdAt: index,
          updatedAt: index,
        });
        await insertEntry(ctx, {
          profileId: me.profileId,
          dayKey: TODAY,
          personalTaskId,
          position: (index + 1) * 1_024,
        });
      }
    });
    const extra = await asMe.mutation(api.prostor.personalTasks.create, { title: "Previše" });
    await expect(
      asMe.mutation(api.prostor.myDay.plan, {
        dayKey: TODAY,
        ref: { kind: "personal", personalTaskId: extra },
      }),
    ).rejects.toThrow("Moj dan može imati najviše 50 stavki.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, {
        title: "I brzi unos poštuje granicu",
        addToMyDay: { dayKey: TODAY },
      }),
    ).rejects.toThrow("Moj dan može imati najviše 50 stavki.");
    // Drugi dan ima svoju granicu.
    const other = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TOMORROW,
      ref: { kind: "personal", personalTaskId: extra },
    });
    expect(other.created).toBe(true);
  });

  test("zadatak iz tuđeg, napuštenog ili arhiviranog startupa se ponaša kao nepostojeći", async () => {
    const { t, asMe, me, other, c, d, e, a } = await seed();
    const ids = await t.run(async (ctx) => {
      const inC = await insertTask(ctx, { scope: c, title: "C", createdBy: other.profileId });
      const inD = await insertTask(ctx, {
        scope: d,
        title: "D",
        createdBy: other.profileId,
        assignees: [me.profileId],
      });
      const inE = await insertTask(ctx, { scope: e, title: "E", createdBy: me.profileId });
      const archived = await insertTask(ctx, {
        scope: a,
        title: "Arhiviran",
        createdBy: me.profileId,
        archivedAt: Date.now(),
      });
      const deleted = await insertTask(ctx, { scope: a, title: "Obrisan", createdBy: me.profileId });
      await ctx.db.delete("pages", deleted);
      const note = await ctx.db.insert("pages", {
        workspaceId: a.workspaceId,
        areaId: a.areaId,
        parentPageId: null,
        kind: "note",
        title: "Beleška",
        searchText: "",
        revision: 0,
        position: 0,
        taskStatus: null,
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: 0,
        createdByProfileId: me.profileId,
        updatedByProfileId: me.profileId,
        archivedAt: null,
        createdAt: 0,
        updatedAt: 0,
      });
      return [inC, inD, inE, archived, deleted, note];
    });
    for (const taskPageId of ids) {
      await expect(
        asMe.mutation(api.prostor.myDay.plan, { dayKey: TODAY, ref: { kind: "task", taskPageId } }),
      ).rejects.toThrow("Zadatak nije pronađen.");
    }
    const entries = await t.run(async (ctx) => await ctx.db.query("myDayEntries").collect());
    expect(entries).toEqual([]);
  });

  test("tuđ ili arhiviran lični zadatak se ne planira", async () => {
    const { asMe, asOther } = await seed();
    const anin = await asOther.mutation(api.prostor.personalTasks.create, { title: "Anin" });
    await expect(
      asMe.mutation(api.prostor.myDay.plan, {
        dayKey: TODAY,
        ref: { kind: "personal", personalTaskId: anin },
      }),
    ).rejects.toThrow("Lični zadatak nije pronađen.");
    const mine = await asMe.mutation(api.prostor.personalTasks.create, { title: "Moj" });
    await asMe.mutation(api.prostor.personalTasks.archive, { personalTaskId: mine });
    await expect(
      asMe.mutation(api.prostor.myDay.plan, {
        dayKey: TODAY,
        ref: { kind: "personal", personalTaskId: mine },
      }),
    ).rejects.toThrow("Lični zadatak nije pronađen.");
  });

  test("unplan vraća podatke za Poništi; tuđa stavka se ponaša kao nepostojeća", async () => {
    const { t, asMe, asOther } = await seed();
    const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Vrati me" });
    const { entryId } = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TODAY,
      ref: { kind: "personal", personalTaskId },
      position: 5_000,
    });

    await expect(asOther.mutation(api.prostor.myDay.unplan, { entryId })).rejects.toThrow(
      "Stavka plana nije pronađena.",
    );
    await expect(
      asOther.mutation(api.prostor.myDay.reorder, { dayKey: TODAY, entryIds: [entryId] }),
    ).rejects.toThrow("Stavka plana nije pronađena.");
    expect(await t.run(async (ctx) => await ctx.db.get("myDayEntries", entryId))).not.toBeNull();

    const removed = await asMe.mutation(api.prostor.myDay.unplan, { entryId });
    expect(removed).toEqual({
      dayKey: TODAY,
      refKey: `personal:${personalTaskId}`,
      ref: { kind: "personal", personalTaskId },
      position: 5_000,
    });
    await expect(asMe.mutation(api.prostor.myDay.unplan, { entryId })).rejects.toThrow(
      "Stavka plana nije pronađena.",
    );

    // Poništi: isti ref na isto mesto.
    await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: removed.dayKey,
      ref: removed.ref,
      position: removed.position,
    });
    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.entries).toEqual([
      expect.objectContaining({ refKey: removed.refKey, position: 5_000 }),
    ]);
  });
});

describe("myDay.reorder", () => {
  test("menja raspored unutar zauzetih pozicija; delimična lista ne dira ostale", async () => {
    const { asMe } = await seed();
    const plan = async (title: string) => {
      const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, { title });
      const { entryId } = await asMe.mutation(api.prostor.myDay.plan, {
        dayKey: TODAY,
        ref: { kind: "personal", personalTaskId },
      });
      return entryId;
    };
    const first = await plan("Prvi");
    const second = await plan("Drugi");
    const third = await plan("Treći");
    const order = async () =>
      (await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 })).entries.map(
        (entry) => entry._id,
      );
    expect(await order()).toEqual([first, second, third]);

    await asMe.mutation(api.prostor.myDay.reorder, { dayKey: TODAY, entryIds: [third, first, second] });
    expect(await order()).toEqual([third, first, second]);

    // Delimično: zamena prvog i drugog, treći (sada `second`) ostaje poslednji.
    await asMe.mutation(api.prostor.myDay.reorder, { dayKey: TODAY, entryIds: [first, third] });
    expect(await order()).toEqual([first, third, second]);

    await expect(
      asMe.mutation(api.prostor.myDay.reorder, { dayKey: TODAY, entryIds: [first, first] }),
    ).rejects.toThrow("Stavka se ponavlja u redosledu.");
  });

  test("stavke iz različitih dana se ne mešaju", async () => {
    const { asMe } = await seed();
    const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Dva dana" });
    const today = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TODAY,
      ref: { kind: "personal", personalTaskId },
    });
    const tomorrow = await asMe.mutation(api.prostor.myDay.plan, {
      dayKey: TOMORROW,
      ref: { kind: "personal", personalTaskId },
    });
    await expect(
      asMe.mutation(api.prostor.myDay.reorder, {
        dayKey: TODAY,
        entryIds: [today.entryId, tomorrow.entryId],
      }),
    ).rejects.toThrow("Sve stavke moraju biti iz istog dana.");
  });
});

describe("myDay.carryOver i clearOld", () => {
  test("otvorene stavke iz prozora prelaze u danas; završene, starije i tuđe ne", async () => {
    const { t, asMe, asOther, me, a } = await seed();
    const ids = await t.run(async (ctx) => {
      const openTask = await insertTask(ctx, {
        scope: a,
        title: "Otvoren zadatak",
        createdBy: me.profileId,
        assignees: [me.profileId],
      });
      const doneTask = await insertTask(ctx, {
        scope: a,
        title: "Završen zadatak",
        createdBy: me.profileId,
        assignees: [me.profileId],
        status: "done",
      });
      const personal = async (title: string, status: "open" | "done") =>
        await ctx.db.insert("personalTasks", {
          profileId: me.profileId,
          title,
          status,
          priority: null,
          dueDate: null,
          sortAt: 1,
          completedAt: status === "done" ? 1 : null,
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        });
      const openPersonal = await personal("Otvoren lični", "open");
      const donePersonal = await personal("Završen lični", "done");
      const oldPersonal = await personal("Star lični", "open");
      const alreadyToday = await personal("Već danas", "open");

      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, taskPageId: openTask });
      // Ista stavka i ranije — obe stare se brišu.
      await insertEntry(ctx, { profileId: me.profileId, dayKey: WEEK_AGO, taskPageId: openTask });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, taskPageId: doneTask });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, personalTaskId: openPersonal });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, personalTaskId: donePersonal });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: EIGHT_DAYS_AGO, personalTaskId: oldPersonal });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, personalTaskId: alreadyToday });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: TODAY, personalTaskId: alreadyToday });
      return { openTask, doneTask, openPersonal, donePersonal, oldPersonal, alreadyToday };
    });
    const anin = await asOther.mutation(api.prostor.personalTasks.create, {
      title: "Anin",
      addToMyDay: { dayKey: YESTERDAY },
    });

    const result = await asMe.mutation(api.prostor.myDay.carryOver, {
      dayKey: TODAY,
      refKeys: [
        `task:${ids.openTask}`,
        `task:${ids.doneTask}`,
        `personal:${ids.openPersonal}`,
        `personal:${ids.donePersonal}`,
        `personal:${ids.oldPersonal}`,
        `personal:${ids.alreadyToday}`,
        `personal:${anin}`,
        "personal:nije-id",
        "smece",
      ],
    });
    expect(result).toEqual({ moved: 3 });

    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: TODAY, doneSince: 0 });
    expect(overview.entries.map((entry) => entry.refKey).sort()).toEqual(
      [
        `personal:${ids.alreadyToday}`,
        `task:${ids.openTask}`,
        `personal:${ids.openPersonal}`,
      ].sort(),
    );
    // Ostaje samo ono što nije prebačeno (završeno); starije od 7 dana se ne vidi.
    expect(overview.history.map((entry) => entry.refKey).sort()).toEqual(
      [`task:${ids.doneTask}`, `personal:${ids.donePersonal}`].sort(),
    );
    const leftovers = await t.run(
      async (ctx) =>
        await ctx.db
          .query("myDayEntries")
          .withIndex("by_profile_day_position", (q) =>
            q.eq("profileId", me.profileId).eq("dayKey", EIGHT_DAYS_AGO),
          )
          .collect(),
    );
    expect(leftovers.map((entry) => entry.personalTaskId)).toEqual([ids.oldPersonal]);
    // Anina stavka je netaknuta.
    const anaEntries = await asOther.query(api.prostor.myDay.overview, {
      dayKey: TODAY,
      doneSince: 0,
    });
    expect(anaEntries.history.map((entry) => entry.refKey)).toEqual([`personal:${anin}`]);
  });

  test("clearOld briše samo moje stavke iz prozora (sve ili zadate)", async () => {
    const { t, asMe, asOther, me } = await seed();
    const make = async (title: string) =>
      await asMe.mutation(api.prostor.personalTasks.create, { title });
    const one = await make("Jedan");
    const two = await make("Dva");
    await t.run(async (ctx) => {
      await insertEntry(ctx, { profileId: me.profileId, dayKey: YESTERDAY, personalTaskId: one });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: WEEK_AGO, personalTaskId: two });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: EIGHT_DAYS_AGO, personalTaskId: one });
      await insertEntry(ctx, { profileId: me.profileId, dayKey: TODAY, personalTaskId: one });
    });
    const anin = await asOther.mutation(api.prostor.personalTasks.create, {
      title: "Anin",
      addToMyDay: { dayKey: YESTERDAY },
    });

    expect(
      await asMe.mutation(api.prostor.myDay.clearOld, {
        dayKey: TODAY,
        refKeys: [`personal:${two}`, `personal:${anin}`],
      }),
    ).toEqual({ removed: 1 });
    expect(await asMe.mutation(api.prostor.myDay.clearOld, { dayKey: TODAY })).toEqual({ removed: 1 });

    const rest = await t.run(async (ctx) => await ctx.db.query("myDayEntries").collect());
    expect(
      rest
        .filter((entry) => entry.profileId === me.profileId)
        .map((entry) => entry.dayKey)
        .sort(),
    ).toEqual([EIGHT_DAYS_AGO, TODAY]);
    expect(rest.filter((entry) => entry.profileId !== me.profileId)).toHaveLength(1);
  });
});
