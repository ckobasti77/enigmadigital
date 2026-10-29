/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/puls.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { taskCompletedAt, nextCompletedAt } from "./lib/pages";
import { workDaysBetween } from "./puls";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fiksne granice: ponedeljak 00:00 UTC, da testovi ne zavise od zone. */
const WEEK_START = Date.UTC(2026, 4, 11);
const WEEK_END = WEEK_START + 7 * DAY_MS;
const PREV_WEEK_START = WEEK_START - 7 * DAY_MS;
const NOW = WEEK_START + 3 * DAY_MS;

/** Pun `pages` dokument za testiranje čistih pomoćnih funkcija bez baze. */
function fakePage(overrides: {
  taskStatus: Doc<"pages">["taskStatus"];
  updatedAt: number;
  completedAt?: number | null;
}): Doc<"pages"> {
  return {
    _id: "page-test" as Id<"pages">,
    _creationTime: 0,
    workspaceId: "startup-test" as Id<"workspaces">,
    areaId: "area-test" as Id<"areas">,
    parentPageId: null,
    kind: "task",
    title: "Test",
    searchText: "",
    revision: 1,
    position: 0,
    taskStatus: overrides.taskStatus,
    taskPriority: "medium",
    assigneeProfileId: null,
    dueDate: null,
    taskSortAt: 0,
    ...(overrides.completedAt === undefined
      ? {}
      : { completedAt: overrides.completedAt }),
    createdByProfileId: "profile-test" as Id<"profiles">,
    updatedByProfileId: "profile-test" as Id<"profiles">,
    archivedAt: null,
    createdAt: 0,
    updatedAt: overrides.updatedAt,
  };
}

type SeedTaskInput = {
  title: string;
  taskStatus?: "backlog" | "next" | "in_progress" | "blocked" | "done";
  assigneeProfileId?: Id<"profiles"> | null;
  dueDate?: number | null;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number | null;
  archivedAt?: number | null;
};

async function seedPulsWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = PREV_WEEK_START - 30 * DAY_MS;
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
    const former = await createPerson("Former");
    const outsider = await createPerson("Outsider");

    const workspace = await insertStartup(ctx, {
      name: "Puls startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, member]) {
      await insertClanstvo(ctx, {
        workspaceId: workspace,
        profileId: person.profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    // Član koji je izašao iz tima, ali mu je zadatak ostao.
    await insertClanstvo(ctx, {
      workspaceId: workspace,
      profileId: former.profileId,
      addedByProfileId: owner.profileId,
      archivedAt: now + DAY_MS,
      createdAt: now,
    });

    const devArea = await ctx.db.insert("areas", {
      workspaceId: workspace,
      key: "dev",
      label: "Dev",
      position: 0,
      createdAt: now,
    });
    const salesArea = await ctx.db.insert("areas", {
      workspaceId: workspace,
      key: "sales",
      label: "Sales",
      position: 1,
      createdAt: now,
    });

    return { owner, member, former, outsider, workspace, devArea, salesArea };
  });

  const insertTask = async (
    areaId: Id<"areas">,
    input: SeedTaskInput,
  ): Promise<Id<"pages">> =>
    t.run(async (ctx) => {
      const createdAt = input.createdAt ?? PREV_WEEK_START - 10 * DAY_MS;
      const updatedAt = input.updatedAt ?? createdAt;
      const dueDate = input.dueDate ?? null;
      return await ctx.db.insert("pages", {
        workspaceId: seeded.workspace,
        areaId,
        parentPageId: null,
        kind: "task",
        title: input.title,
        searchText: "",
        revision: 1,
        position: 0,
        taskStatus: input.taskStatus ?? "backlog",
        taskPriority: "medium",
        assigneeProfileId: input.assigneeProfileId ?? null,
        dueDate,
        taskSortAt: dueDate ?? 8_000_000_000_000_000 - updatedAt,
        ...(input.completedAt === undefined
          ? {}
          : { completedAt: input.completedAt }),
        createdByProfileId: seeded.owner.profileId,
        updatedByProfileId: seeded.owner.profileId,
        archivedAt: input.archivedAt ?? null,
        createdAt,
        updatedAt,
      });
    });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });

  const weekly = (overrides: Partial<Record<string, number>> = {}) =>
    asPerson(seeded.owner).query(api.prostor.puls.getWeekly, {
      workspaceId: seeded.workspace,
      prevWeekStart: PREV_WEEK_START,
      weekStart: WEEK_START,
      weekEnd: WEEK_END,
      now: NOW,
      ...overrides,
    });

  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asMember: asPerson(seeded.member),
    asOutsider: asPerson(seeded.outsider),
    insertTask,
    weekly,
  };
}

describe("pomoćne funkcije Pulsa", () => {
  test("workDaysBetween preskače vikend", () => {
    // Ponedeljak → petak istog dana u 4 radna dana.
    const monday = Date.UTC(2026, 4, 11, 9);
    expect(workDaysBetween(monday, monday + 4 * DAY_MS)).toBe(4);
    // Petak → sledeći ponedeljak: subota i nedelja se ne računaju.
    const friday = Date.UTC(2026, 4, 15, 9);
    expect(workDaysBetween(friday, friday + 3 * DAY_MS)).toBe(1);
    expect(workDaysBetween(monday, monday)).toBe(0);
    expect(workDaysBetween(monday + DAY_MS, monday)).toBe(0);
  });

  test("taskCompletedAt pada na updatedAt za stare zapise", () => {
    expect(taskCompletedAt(fakePage({ taskStatus: "done", updatedAt: 1_000 }))).toBe(
      1_000,
    );
    expect(
      taskCompletedAt(
        fakePage({ taskStatus: "done", updatedAt: 1_000, completedAt: 500 }),
      ),
    ).toBe(500);
    expect(
      taskCompletedAt(fakePage({ taskStatus: "in_progress", updatedAt: 1_000 })),
    ).toBeNull();
  });

  test("nextCompletedAt pečati ulaz, čuva postojeće i briše na izlazu", () => {
    const open = fakePage({ taskStatus: "in_progress", updatedAt: 10 });
    const done = fakePage({
      taskStatus: "done",
      updatedAt: 99,
      completedAt: 42,
    });
    expect(nextCompletedAt(open, "done", 777)).toBe(777);
    expect(nextCompletedAt(done, "done", 777)).toBe(42);
    expect(nextCompletedAt(done, "in_progress", 777)).toBeNull();
    expect(nextCompletedAt(open, "backlog", 777)).toBeNull();
  });
});

describe("completedAt kroz mutacije", () => {
  test("tasks.updateMetadata pečati završetak i briše ga na ponovnom otvaranju", async () => {
    const { t, workspace, devArea, asOwner } = await seedPulsWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: devArea,
      parentPageId: null,
      kind: "task",
      title: "Ciklus statusa",
    });

    const read = () =>
      t.run(async (ctx) => (await ctx.db.get("pages", taskId))?.completedAt ?? null);

    expect(await read()).toBeNull();

    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "done",
    });
    const stamped = await read();
    expect(stamped).not.toBeNull();

    // Izmena završenog zadatka ne pomera trenutak završetka.
    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      priority: "urgent",
    });
    expect(await read()).toBe(stamped);

    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "in_progress",
    });
    expect(await read()).toBeNull();
  });

  test("areasV2.updatePage prati isto pravilo", async () => {
    const { t, workspace, devArea, asOwner } = await seedPulsWorkspace();
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: devArea,
      parentPageId: null,
      kind: "task",
      title: "Preko editora",
    });
    const page = await t.run(async (ctx) => ctx.db.get("pages", taskId));

    await asOwner.mutation(api.prostor.areasV2.updatePage, {
      workspaceId: workspace,
      pageId: taskId,
      expectedRevision: page!.revision,
      taskStatus: "done",
    });
    expect(
      await t.run(async (ctx) => (await ctx.db.get("pages", taskId))?.completedAt),
    ).not.toBeNull();
  });
});

describe("getWeekly", () => {
  test("rezime, trend i zapelo se računaju po granicama nedelje", async () => {
    const context = await seedPulsWorkspace();
    const { devArea, salesArea, member, former, insertTask, weekly } = context;

    // Završeno ove nedelje (2) i prošle (1).
    await insertTask(devArea, {
      title: "Završen ove nedelje",
      taskStatus: "done",
      completedAt: WEEK_START + DAY_MS,
      assigneeProfileId: member.profileId,
    });
    await insertTask(salesArea, {
      title: "Još jedan ove nedelje",
      taskStatus: "done",
      completedAt: WEEK_START + 2 * DAY_MS,
      assigneeProfileId: null,
    });
    await insertTask(devArea, {
      title: "Završen prošle nedelje",
      taskStatus: "done",
      completedAt: PREV_WEEK_START + DAY_MS,
      assigneeProfileId: member.profileId,
    });

    // Kreirano: 1 ove, 2 prošle nedelje.
    await insertTask(devArea, {
      title: "Novi ove nedelje",
      createdAt: WEEK_START + DAY_MS,
      updatedAt: WEEK_START + DAY_MS,
      assigneeProfileId: member.profileId,
    });
    await insertTask(devArea, {
      title: "Novi prošle A",
      createdAt: PREV_WEEK_START + DAY_MS,
      updatedAt: PREV_WEEK_START + DAY_MS,
    });
    await insertTask(devArea, {
      title: "Novi prošle B",
      createdAt: PREV_WEEK_START + 2 * DAY_MS,
      updatedAt: PREV_WEEK_START + 2 * DAY_MS,
    });

    // Prekoračen rok, još otvoren.
    await insertTask(devArea, {
      title: "Kasni",
      dueDate: WEEK_START - 2 * DAY_MS,
      assigneeProfileId: member.profileId,
    });

    // Zapelo: u toku 5 radnih dana bez izmene, i blokirano 3 dana.
    await insertTask(devArea, {
      title: "Stoji u toku",
      taskStatus: "in_progress",
      updatedAt: NOW - 7 * DAY_MS,
      assigneeProfileId: member.profileId,
    });
    await insertTask(devArea, {
      title: "Blokiran dugo",
      taskStatus: "blocked",
      updatedAt: NOW - 3 * DAY_MS,
      assigneeProfileId: former.profileId,
    });
    // Nije zapelo: blokiran juče.
    await insertTask(devArea, {
      title: "Blokiran juče",
      taskStatus: "blocked",
      updatedAt: NOW - DAY_MS,
    });
    // Arhiviran zadatak se ne računa nigde.
    await insertTask(devArea, {
      title: "Arhiviran",
      taskStatus: "done",
      completedAt: WEEK_START + DAY_MS,
      archivedAt: WEEK_START + 2 * DAY_MS,
    });

    const result = await weekly();

    expect(result.summary.completed).toEqual({ current: 2, previous: 1 });
    expect(result.summary.created).toEqual({ current: 1, previous: 2 });
    expect(result.summary.overdueOpen.current).toBe(1);
    expect(result.summary.stuck).toEqual({ current: 2, previous: null });

    const stuckTitles = result.stuckTasks.map((task) => task.title);
    expect(stuckTitles).toEqual(["Stoji u toku", "Blokiran dugo"]);
    expect(result.stuckTasks[0].lastTouchedAt).toBeLessThan(
      result.stuckTasks[1].lastTouchedAt,
    );

    // Bivši član je označen, ali njegov rad se vidi.
    const formerRow = result.members.find(
      (row) => row.profileId === former.profileId,
    );
    expect(formerRow?.isArchived).toBe(true);
    const memberRow = result.members.find(
      (row) => row.profileId === member.profileId,
    );
    expect(memberRow?.completedThisWeek).toBe(1);
    expect(memberRow?.overdueCount).toBe(1);
    expect(memberRow?.isArchived).toBe(false);

    // Nedodeljeni završen zadatak ide u svoj red.
    expect(result.unassigned.completedThisWeek).toBe(1);

    const dev = result.areas.find((area) => area.key === "dev");
    expect(dev?.completedThisWeek).toBe(1);
    const sales = result.areas.find((area) => area.key === "sales");
    expect(sales?.completedThisWeek).toBe(1);

    expect(result.truncated).toBe(false);
    expect(result.range).toEqual({ weekStart: WEEK_START, weekEnd: WEEK_END });
  });

  test("stari zapisi bez completedAt računaju se po updatedAt", async () => {
    const { devArea, insertTask, weekly } = await seedPulsWorkspace();

    // Zapis kakav postoji pre backfill migracije: nema `completedAt`.
    await insertTask(devArea, {
      title: "Legacy završen ove nedelje",
      taskStatus: "done",
      updatedAt: WEEK_START + DAY_MS,
    });
    await insertTask(devArea, {
      title: "Legacy završen prošle nedelje",
      taskStatus: "done",
      updatedAt: PREV_WEEK_START + DAY_MS,
    });

    expect((await weekly()).summary.completed).toEqual({
      current: 1,
      previous: 1,
    });
  });

  test("ideje se mere po nedelji nastanka, glasa i konverzije", async () => {
    const { t, workspace, devArea, owner, member, weekly } =
      await seedPulsWorkspace();

    await t.run(async (ctx) => {
      const insertIdea = async (
        title: string,
        createdAt: number,
        convertedAt: number | null,
      ) =>
        ctx.db.insert("ideaNodes", {
          workspaceId: workspace,
          authorProfileId: owner.profileId,
          title,
          text: title,
          searchText: `${title}\n${title}`,
          x: 0,
          y: 0,
          color: "violet",
          convertedPageId: null,
          convertedAt,
          archivedAt: null,
          createdAt,
          updatedAt: Math.max(createdAt, convertedAt ?? createdAt),
        });

      const thisWeek = await insertIdea("Ove nedelje", WEEK_START + DAY_MS, null);
      await insertIdea("Prošle nedelje", PREV_WEEK_START + DAY_MS, null);
      await insertIdea(
        "Pretvorena ove nedelje",
        PREV_WEEK_START + DAY_MS,
        WEEK_START + 2 * DAY_MS,
      );

      await ctx.db.insert("ideaVotes", {
        workspaceId: workspace,
        ideaId: thisWeek,
        profileId: member.profileId,
        voteType: "up",
        createdAt: WEEK_START + DAY_MS,
      });
      await ctx.db.insert("ideaVotes", {
        workspaceId: workspace,
        ideaId: thisWeek,
        profileId: owner.profileId,
        voteType: "up",
        createdAt: PREV_WEEK_START + DAY_MS,
      });
    });

    const result = await weekly();
    expect(result.ideas.created).toEqual({ current: 1, previous: 2 });
    expect(result.ideas.votes).toEqual({ current: 1, previous: 1 });
    expect(result.ideas.converted).toEqual({ current: 1, previous: 0 });
    expect(devArea).toBeDefined();
  });

  test("prazna nedelja vraća nule, a aktivni članovi ostaju u listi", async () => {
    const { weekly, owner, member } = await seedPulsWorkspace();
    const result = await weekly();

    expect(result.summary.completed).toEqual({ current: 0, previous: 0 });
    expect(result.summary.created).toEqual({ current: 0, previous: 0 });
    expect(result.stuckTasks).toEqual([]);
    expect(result.ideas.created).toEqual({ current: 0, previous: 0 });

    // Slobodan kapacitet je informacija, pa članovi bez rada ostaju vidljivi.
    expect(new Set(result.members.map((row) => row.profileId))).toEqual(
      new Set([owner.profileId, member.profileId]),
    );
    expect(
      result.members.every(
        (row) => row.completedThisWeek === 0 && row.openCount === 0,
      ),
    ).toBe(true);
    expect(result.unassigned).toEqual({
      completedThisWeek: 0,
      openCount: 0,
      overdueCount: 0,
    });
  });

  test("odbija neispravne granice, buduće nedelje i tuđi startup", async () => {
    const { workspace, weekly, asOutsider } = await seedPulsWorkspace();

    await expect(weekly({ weekEnd: WEEK_START - DAY_MS })).rejects.toThrow(
      "Granice nedelje nisu ispravne.",
    );
    await expect(weekly({ weekEnd: WEEK_START + 30 * DAY_MS })).rejects.toThrow(
      "Raspon nedelje je preveliki.",
    );
    await expect(weekly({ now: WEEK_START - 5 * DAY_MS })).rejects.toThrow(
      "Puls za buduće nedelje još ne postoji.",
    );
    await expect(
      asOutsider.query(api.prostor.puls.getWeekly, {
        workspaceId: workspace,
        prevWeekStart: PREV_WEEK_START,
        weekStart: WEEK_START,
        weekEnd: WEEK_END,
        now: NOW,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });
});

describe("nedeljna Puls notifikacija", () => {
  test("javlja svakom aktivnom članu, i to jednom po nedelji", async () => {
    const { t, owner, member, former } = await seedPulsWorkspace();

    const first = await t.mutation(
      internal.prostor.puls.sendWeeklyPulsNotifications,
      {},
    );
    expect(first.notified).toBe(2);

    const rows = await t.run(async (ctx) =>
      ctx.db.query("notifications").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.type === "puls_ready")).toBe(true);
    expect(rows.every((row) => row.targetType === "puls")).toBe(true);
    expect(rows.every((row) => row.actorProfileId === null)).toBe(true);
    expect(new Set(rows.map((row) => row.recipientProfileId))).toEqual(
      new Set([owner.profileId, member.profileId]),
    );
    // Uklonjen član ne dobija Puls.
    expect(
      rows.some((row) => row.recipientProfileId === former.profileId),
    ).toBe(false);

    // Ponovno pokretanje ne pravi duplikate.
    const second = await t.mutation(
      internal.prostor.puls.sendWeeklyPulsNotifications,
      {},
    );
    expect(second.notified).toBe(0);
    expect(
      (await t.run(async (ctx) => ctx.db.query("notifications").collect())).length,
    ).toBe(2);
  });
});
