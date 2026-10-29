/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/tasks.bulk.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { pageTaskSortAt } from "./lib/pages";
import { MAX_TASK_DUE_DATE } from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

/**
 * PROSTOR K06: „Sredi rokove” (`tasks.bulkReschedule` / `bulkRestoreSchedule`,
 * P10) i podaci oblasti (`tasks.listForArea`, `pages.recentForArea`, D19) —
 * uključujući negativne slučajeve (nečlan, uklonjen član, arhiviran profil,
 * drugi startup, zaključan zadatak).
 */

const modules = import.meta.glob("/convex/**/*.*s");
const MINUTE = 60_000;
// convex-test 0.0.65 ne pušta sat transakcije da ide unazad od poslednjeg upisa,
// pa lažno vreme mora biti posle pravog „sada” (seed upisuje pre
// `vi.setSystemTime`). Devotion je imao 26. 10. 2026, što je danas prošlost;
// T0 je zato fiksno u budućnosti (isti dan i sat, 2030). Asercije ne zavise
// od kalendarskog dana T0, samo od redosleda.
const T0 = Date.UTC(2030, 9, 26, 10, 0);
/** Lokalno podne 28. 10. 2026 (Beograd, CET) — kako klijent šalje rok. */
const OCT_28 = Date.UTC(2026, 9, 28, 11);
const OCT_30 = Date.UTC(2026, 9, 30, 11);
const OCT_01 = Date.UTC(2026, 9, 1, 10);

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
    const area = (workspaceId: Id<"workspaces">, key: string, position: number) =>
      ctx.db.insert("areas", {
        workspaceId,
        key,
        label: key === "dev" ? "Razvoj" : key,
        position,
        createdAt: now,
      });
    const devArea = await area(startupA, "dev", 0);
    const salesArea = await area(startupA, "sales", 1);
    const areaB = await area(startupB, "dev", 0);
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
      devArea,
      salesArea,
      areaB,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const s = {
    t,
    ...seeded,
    asOwner: as(seeded.owner),
    asAdmin: as(seeded.admin),
    asAuthor: as(seeded.author),
    asMember: as(seeded.member),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
    asArchived: as(seeded.archived),
  };
  return {
    ...s,
    /** Zadatak u oblasti „Razvoj” startupa A; autor je `author` ako ne piše drugačije. */
    task: (
      title: string,
      options: {
        dueDate?: number;
        assignees?: Array<Id<"profiles">>;
        area?: Id<"areas">;
        as?: typeof s.asAuthor;
      } = {},
    ) =>
      (options.as ?? s.asAuthor).mutation(api.prostor.pages.create, {
        workspaceId: seeded.startupA,
        areaId: options.area ?? seeded.devArea,
        parentPageId: null,
        kind: "task",
        title,
        ...(options.dueDate === undefined ? {} : { dueDate: options.dueDate }),
        ...(options.assignees === undefined
          ? {}
          : { assigneeProfileIds: options.assignees }),
      }),
    foreignTask: () =>
      s.asOutsider.mutation(api.prostor.pages.create, {
        workspaceId: seeded.startupB,
        areaId: seeded.areaB,
        parentPageId: null,
        kind: "task",
        title: "Tuđi zadatak",
        dueDate: OCT_01,
      }),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const pageOf = (s: Seeded, id: Id<"pages">) =>
  s.t.run((ctx) => ctx.db.get("pages", id));
const notificationCount = (s: Seeded) =>
  s.t.run(async (ctx) => (await ctx.db.query("notifications").collect()).length);
const rescheduleActivities = (s: Seeded) =>
  s.t.run(async (ctx) =>
    (
      await ctx.db
        .query("activities")
        .withIndex("by_workspaceId_and_createdAt", (q) =>
          q.eq("workspaceId", s.startupA),
        )
        .collect()
    ).filter((row) => row.action === "tasks_rescheduled"),
  );
const mirrorsOf = (s: Seeded, taskPageId: Id<"pages">) =>
  s.t.run(async (ctx) =>
    (await ctx.db.query("taskAssignees").collect()).filter(
      (row) => row.taskPageId === taskPageId && row.archivedAt === null,
    ),
  );

describe("tasks.bulkReschedule — novi rok", () => {
  test("član sređuje tuđe zadatke: rok, ogledala, jedna aktivnost, bez obaveštenja", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01, assignees: [s.member.profileId] });
    const b = await s.task("B", { dueDate: OCT_01 });
    const c = await s.task("C");
    const before = await Promise.all([a, b, c].map((id) => pageOf(s, id)));
    const notificationsBefore = await notificationCount(s);

    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a, b, c],
      dueDate: OCT_28,
    });

    expect(result.skipped).toEqual([]);
    expect(result.unchanged).toBe(0);
    expect(result.updated).toEqual([
      {
        taskPageId: a,
        previous: { dueDate: OCT_01, taskStatus: "backlog" },
        revision: before[0]!.revision + 1,
      },
      {
        taskPageId: b,
        previous: { dueDate: OCT_01, taskStatus: "backlog" },
        revision: before[1]!.revision + 1,
      },
      {
        taskPageId: c,
        previous: { dueDate: null, taskStatus: "backlog" },
        revision: before[2]!.revision + 1,
      },
    ]);
    for (const [index, id] of [a, b, c].entries()) {
      const page = await pageOf(s, id);
      expect(page).toMatchObject({
        dueDate: OCT_28,
        taskSortAt: OCT_28,
        taskStatus: "backlog",
        revision: before[index]!.revision + 1,
        updatedByProfileId: s.member.profileId,
      });
    }
    // Ogledalo izvršioca prati novi rok (inače „Moji zadaci” čita stari).
    expect(await mirrorsOf(s, a)).toEqual([
      expect.objectContaining({ profileId: s.member.profileId, taskSortAt: OCT_28 }),
    ]);

    const activities = await rescheduleActivities(s);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({
      actorProfileId: s.member.profileId,
      targetType: "startup",
      targetId: s.startupA,
      title: "Startup A",
      detail: "3 zadatka → 28. 10.",
    });
    expect(await notificationCount(s)).toBe(notificationsBefore);
  });

  test("dueDate: null briše rok; jedan zadatak vodi aktivnost na sebe", async () => {
    const s = await seed();
    const a = await s.task("Samo jedan", { dueDate: OCT_01 });
    const result = await s.asOwner.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a],
      dueDate: null,
    });
    expect(result.updated).toHaveLength(1);
    const page = (await pageOf(s, a))!;
    expect(page.dueDate).toBeNull();
    expect(page.taskSortAt).toBe(pageTaskSortAt(null, page.updatedAt));

    const [activity] = await rescheduleActivities(s);
    expect(activity).toMatchObject({
      targetType: "page",
      targetId: a,
      title: "Samo jedan",
      detail: "1 zadatak → bez roka",
    });
  });

  test("zadatak koji već ima traženi rok se ne menja i ne pravi aktivnost", async () => {
    const s = await seed();
    const a = await s.task("Isti rok", { dueDate: OCT_28 });
    const revision = (await pageOf(s, a))!.revision;
    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a],
      dueDate: OCT_28,
    });
    expect(result).toEqual({ updated: [], skipped: [], unchanged: 1 });
    expect((await pageOf(s, a))!.revision).toBe(revision);
    expect(await rescheduleActivities(s)).toEqual([]);
  });

  test("množina u aktivnosti: 2, 5 i 21 zadatak", async () => {
    const s = await seed();
    const ids: Array<Id<"pages">> = [];
    for (let i = 0; i < 21; i += 1) ids.push(await s.task(`Z${i}`, { dueDate: OCT_01 }));
    for (const count of [2, 5, 21]) {
      await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
        workspaceId: s.startupA,
        taskPageIds: ids.slice(0, count),
        // Svaki prolaz drugi rok, da zadaci stvarno menjaju vrednost.
        dueDate: count === 2 ? OCT_28 : count === 5 ? OCT_30 : Date.UTC(2026, 10, 2, 11),
      });
    }
    const details = (await rescheduleActivities(s)).map((row) => row.detail).sort();
    expect(details).toEqual([
      "2 zadatka → 28. 10.",
      "21 zadatak → 2. 11.",
      "5 zadataka → 30. 10.",
    ]);
  });
});

describe("tasks.bulkReschedule — Završi", () => {
  test("završava zadatke: status, completedAt, ogledala, prethodni status, bez obaveštenja", async () => {
    const s = await seed();
    const a = await s.task("A", { assignees: [s.member.profileId] });
    const b = await s.task("B");
    await s.asAuthor.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: b, status: "in_progress" });
    const notificationsBefore = await notificationCount(s);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);

    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a, b],
      complete: true,
    });

    expect(result.skipped).toEqual([]);
    expect(result.updated.map((row) => row.previous.taskStatus)).toEqual([
      "backlog",
      "in_progress",
    ]);
    for (const id of [a, b]) {
      expect(await pageOf(s, id)).toMatchObject({
        taskStatus: "done",
        completedAt: T0,
        updatedByProfileId: s.member.profileId,
      });
    }
    expect(await mirrorsOf(s, a)).toEqual([
      expect.objectContaining({ taskStatus: "done" }),
    ]);
    const [activity] = await rescheduleActivities(s);
    expect(activity).toMatchObject({ detail: "2 zadatka → završeno" });
    expect(await notificationCount(s)).toBe(notificationsBefore);
  });

  test("već završen zadatak je „unchanged”", async () => {
    const s = await seed();
    const a = await s.task("Gotov");
    await s.asAuthor.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: a, status: "done" });
    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a],
      complete: true,
    });
    expect(result).toEqual({ updated: [], skipped: [], unchanged: 1 });
  });
});

describe("tasks.bulkReschedule — ulaz", () => {
  test("najviše 50 zadataka: 50 prolazi, 51 se odbija bez izmena", async () => {
    const s = await seed();
    const ids: Array<Id<"pages">> = [];
    for (let i = 0; i < 50; i += 1) ids.push(await s.task(`Z${i}`, { dueDate: OCT_01 }));

    await expect(
      s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
        workspaceId: s.startupA,
        taskPageIds: [...ids, ids[0]!],
        dueDate: OCT_28,
      }),
    ).rejects.toThrow("najviše 50 zadataka");
    expect((await pageOf(s, ids[0]!))!.dueDate).toBe(OCT_01);

    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: ids,
      dueDate: OCT_28,
    });
    expect(result.updated).toHaveLength(50);
    expect(await rescheduleActivities(s)).toHaveLength(1);
  });

  test("prazna lista, duplikat i neispravna kombinacija se odbijaju", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01 });
    const call = (args: {
      taskPageIds: Array<Id<"pages">>;
      dueDate?: number | null;
      complete?: boolean;
    }) =>
      s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
        workspaceId: s.startupA,
        ...args,
      });

    await expect(call({ taskPageIds: [], dueDate: OCT_28 })).rejects.toThrow(
      "Izaberi bar jedan zadatak.",
    );
    await expect(call({ taskPageIds: [a, a], dueDate: OCT_28 })).rejects.toThrow(
      "Isti zadatak je naveden više puta.",
    );
    await expect(call({ taskPageIds: [a] })).rejects.toThrow(
      "Navedi novi rok ili završetak.",
    );
    await expect(call({ taskPageIds: [a], complete: false })).rejects.toThrow(
      "Navedi novi rok ili završetak.",
    );
    await expect(
      call({ taskPageIds: [a], dueDate: OCT_28, complete: true }),
    ).rejects.toThrow("Rok i završetak se ne menjaju zajedno.");
    await expect(call({ taskPageIds: [a], dueDate: -1 })).rejects.toThrow(
      "Rok nije ispravan.",
    );
    await expect(
      call({ taskPageIds: [a], dueDate: MAX_TASK_DUE_DATE + 1 }),
    ).rejects.toThrow("Rok nije ispravan.");
    // Ništa od ovoga nije ostavilo trag.
    expect((await pageOf(s, a))!.dueDate).toBe(OCT_01);
    expect(await rescheduleActivities(s)).toEqual([]);
  });
});

describe("tasks.bulkReschedule — pristup", () => {
  test("nečlan, uklonjen član i arhiviran profil ne menjaju ništa", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01 });
    const args = { workspaceId: s.startupA, taskPageIds: [a], dueDate: OCT_28 };
    await expect(s.asOutsider.mutation(api.prostor.tasks.bulkReschedule, args)).rejects.toThrow(
      "Nemaš pristup ovom projektu.",
    );
    await expect(s.asRemoved.mutation(api.prostor.tasks.bulkReschedule, args)).rejects.toThrow(
      "Nemaš pristup ovom projektu.",
    );
    await expect(s.asArchived.mutation(api.prostor.tasks.bulkReschedule, args)).rejects.toThrow(
      "Profil još nije spreman",
    );
    const restoreArgs = {
      workspaceId: s.startupA,
      items: [
        {
          taskPageId: a,
          dueDate: null,
          taskStatus: "backlog" as const,
          expectedRevision: 0,
        },
      ],
    };
    await expect(
      s.asOutsider.mutation(api.prostor.tasks.bulkRestoreSchedule, restoreArgs),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asRemoved.mutation(api.prostor.tasks.bulkRestoreSchedule, restoreArgs),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asArchived.mutation(api.prostor.tasks.bulkRestoreSchedule, restoreArgs),
    ).rejects.toThrow("Profil još nije spreman");
    expect((await pageOf(s, a))!.dueDate).toBe(OCT_01);
    expect(await rescheduleActivities(s)).toEqual([]);
  });

  test("tuđ startup: član B ne dira A, a zadatak iz B u listi A je preskočen", async () => {
    const s = await seed();
    const mine = await s.task("Moj", { dueDate: OCT_01 });
    const foreign = await s.foreignTask();

    // Vlasnik startupa B ne sme da menja zadatak iz A.
    await expect(
      s.asOutsider.mutation(api.prostor.tasks.bulkReschedule, {
        workspaceId: s.startupA,
        taskPageIds: [mine],
        dueDate: OCT_28,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");

    // Mešani startupi: svoj prolazi, tuđ se preskače i ostaje netaknut.
    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [mine, foreign],
      dueDate: OCT_28,
    });
    expect(result.updated.map((row) => row.taskPageId)).toEqual([mine]);
    expect(result.skipped).toEqual([
      { taskPageId: foreign, reason: "drugi_startup" },
    ]);
    expect(await pageOf(s, foreign)).toMatchObject({ dueDate: OCT_01, revision: 0 });

    // Isto važi za „Poništi”.
    const restore = await s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
      workspaceId: s.startupA,
      items: [
        {
          taskPageId: foreign,
          dueDate: null,
          taskStatus: "backlog",
          expectedRevision: 0,
        },
      ],
    });
    expect(restore).toEqual({
      restored: 0,
      revisions: [],
      skipped: [{ taskPageId: foreign, reason: "drugi_startup" }],
      unchanged: 0,
    });
    expect((await pageOf(s, foreign))!.dueDate).toBe(OCT_01);
  });

  test("obrisan, arhiviran i netaskovni id se preskaču sa razlogom", async () => {
    const s = await seed();
    const live = await s.task("Živ", { dueDate: OCT_01 });
    const trashed = await s.task("U Korpi", { dueDate: OCT_01 });
    await s.asAuthor.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: trashed });
    const gone = await s.task("Nestao", { dueDate: OCT_01 });
    await s.t.run((ctx) => ctx.db.delete("pages", gone));
    const note = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.devArea,
      parentPageId: null,
      kind: "note",
      title: "Beleška",
    });
    // Zadatak čiji je roditelj u Korpi nije vidljiv.
    const parent = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.devArea,
      parentPageId: null,
      kind: "note",
      title: "Roditelj",
    });
    const child = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.devArea,
      parentPageId: parent,
      kind: "task",
      title: "Dete",
      dueDate: OCT_01,
    });
    await s.t.run((ctx) => ctx.db.patch("pages", parent, { archivedAt: T0 }));

    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [live, trashed, gone, note, child],
      dueDate: OCT_28,
    });
    expect(result.updated.map((row) => row.taskPageId)).toEqual([live]);
    expect(result.skipped).toEqual([
      { taskPageId: trashed, reason: "nije_pronadjen" },
      { taskPageId: gone, reason: "nije_pronadjen" },
      { taskPageId: note, reason: "nije_zadatak" },
      { taskPageId: child, reason: "nije_pronadjen" },
    ]);
    expect((await pageOf(s, trashed))!.dueDate).toBe(OCT_01);
  });
});

describe("tasks.bulkReschedule — zaključan zadatak (R19, D5)", () => {
  async function lockedSeed() {
    const s = await seed();
    const open = await s.task("Otključan", { dueDate: OCT_01 });
    const locked = await s.task("Zaključan", {
      dueDate: OCT_01,
      assignees: [s.member.profileId],
    });
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: locked });
    return { s, open, locked };
  }

  test("član ne menja rok zaključanog zadatka, ostali u istoj seriji prolaze", async () => {
    const { s, open, locked } = await lockedSeed();
    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [locked, open],
      dueDate: OCT_28,
    });
    expect(result.updated.map((row) => row.taskPageId)).toEqual([open]);
    expect(result.skipped).toEqual([{ taskPageId: locked, reason: "zakljucan" }]);
    expect((await pageOf(s, locked))!.dueDate).toBe(OCT_01);
    // Aktivnost broji samo ono što je stvarno izmenjeno.
    expect(await rescheduleActivities(s)).toEqual([
      expect.objectContaining({ targetType: "page", targetId: open }),
    ]);
  });

  test("autor, vlasnik i admin menjaju rok zaključanog zadatka", async () => {
    for (const who of ["asAuthor", "asOwner", "asAdmin"] as const) {
      const { s, locked } = await lockedSeed();
      const result = await s[who].mutation(api.prostor.tasks.bulkReschedule, {
        workspaceId: s.startupA,
        taskPageIds: [locked],
        dueDate: OCT_28,
      });
      expect(result.updated, who).toHaveLength(1);
      expect((await pageOf(s, locked))!.dueDate, who).toBe(OCT_28);
    }
  });

  test("„Završi”: izvršilac zaključanog zadatka ga završava, drugi član ne", async () => {
    const { s, locked } = await lockedSeed();
    // Član koji nije izvršilac (owner nije dodeljen, ali je menadžer — uzmi author→member razliku):
    const stranger = await s.task("Tuđi zaključan", { dueDate: OCT_01 });
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: stranger });

    const result = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [locked, stranger],
      complete: true,
    });
    expect(result.updated.map((row) => row.taskPageId)).toEqual([locked]);
    expect(result.skipped).toEqual([{ taskPageId: stranger, reason: "zakljucan" }]);
    expect((await pageOf(s, locked))!.taskStatus).toBe("done");
    expect((await pageOf(s, stranger))!.taskStatus).toBe("backlog");
  });
});

describe("tasks.bulkRestoreSchedule — Poništi", () => {
  test("vraća prethodne rokove i statuse, ogledala i completedAt", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01, assignees: [s.member.profileId] });
    const b = await s.task("B");
    await s.asAuthor.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: b, status: "in_progress" });

    const moved = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a, b],
      dueDate: OCT_28,
    });
    const done = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a, b],
      complete: true,
    });
    expect((await pageOf(s, b))!.taskStatus).toBe("done");

    // Poništi redom unazad: prvo „Završi”, pa novi rok.
    const undoDone = await s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
      workspaceId: s.startupA,
      items: done.updated.map((row) => ({
        taskPageId: row.taskPageId,
        ...row.previous,
        expectedRevision: row.revision,
      })),
    });
    expect(undoDone).toEqual({
      restored: 2,
      revisions: done.updated.map((row) => ({
        taskPageId: row.taskPageId,
        revision: row.revision + 1,
      })),
      skipped: [],
      unchanged: 0,
    });
    expect(await pageOf(s, b)).toMatchObject({
      taskStatus: "in_progress",
      completedAt: null,
      dueDate: OCT_28,
    });
    expect(await mirrorsOf(s, a)).toEqual([
      expect.objectContaining({ taskStatus: "backlog", taskSortAt: OCT_28 }),
    ]);

    const undoMove = await s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
      workspaceId: s.startupA,
      items: moved.updated.map((row) => ({
        taskPageId: row.taskPageId,
        ...row.previous,
        // Ulančano „Poništi”: revizija je porasla (Završi + Poništi završi),
        // pa klijent koristi onu koju je vratilo prvo poništavanje.
        expectedRevision: undoDone.revisions.find(
          (entry) => entry.taskPageId === row.taskPageId,
        )!.revision,
      })),
    });
    expect(undoMove.restored).toBe(2);
    expect(undoMove.skipped).toEqual([]);
    expect(await pageOf(s, a)).toMatchObject({ dueDate: OCT_01, taskSortAt: OCT_01 });
    expect(await mirrorsOf(s, a)).toEqual([
      expect.objectContaining({ taskSortAt: OCT_01 }),
    ]);
    const b2 = (await pageOf(s, b))!;
    expect(b2.dueDate).toBeNull();
    expect(b2.taskSortAt).toBe(pageTaskSortAt(null, b2.updatedAt));

    // Poništavanja ostavljaju po jednu aktivnost, bez obaveštenja.
    const details = (await rescheduleActivities(s)).map((row) => row.detail);
    expect(details.filter((d) => d?.startsWith("vraćeno"))).toEqual([
      "vraćeno 2 zadatka",
      "vraćeno 2 zadatka",
    ]);
  });

  test("izmenjen zadatak se preskače, tuđa izmena ostaje", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01 });
    const b = await s.task("B", { dueDate: OCT_01 });
    const moved = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a, b],
      dueDate: OCT_28,
    });
    // Neko drugi menja A posle grupne izmene.
    await s.asOwner.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: a, dueDate: OCT_30 });

    const undo = await s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
      workspaceId: s.startupA,
      items: moved.updated.map((row) => ({
        taskPageId: row.taskPageId,
        ...row.previous,
        expectedRevision: row.revision,
      })),
    });
    expect(undo).toMatchObject({
      restored: 1,
      skipped: [{ taskPageId: a, reason: "izmenjen" }],
      unchanged: 0,
    });
    expect(undo.revisions.map((entry) => entry.taskPageId)).toEqual([b]);
    expect((await pageOf(s, a))!.dueDate).toBe(OCT_30);
    expect((await pageOf(s, b))!.dueDate).toBe(OCT_01);
  });

  test("zadatak koji već ima tražene vrednosti se broji kao unchanged", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01 });
    const b = await s.task("B", { dueDate: OCT_01 });
    const moved = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a],
      dueDate: OCT_28,
    });
    const revision = (id: Id<"pages">) =>
      pageOf(s, id).then((page) => page!.revision);
    const undo = await s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
      workspaceId: s.startupA,
      items: [
        // b nikad nije pomeran: već je na traženom roku i statusu.
        {
          taskPageId: b,
          dueDate: OCT_01,
          taskStatus: "backlog",
          expectedRevision: await revision(b),
        },
        {
          taskPageId: a,
          ...moved.updated[0]!.previous,
          expectedRevision: moved.updated[0]!.revision,
        },
      ],
    });
    // Zbir stavki je uvek ceo ulaz: restored + skipped + unchanged = 2.
    expect(undo).toMatchObject({ restored: 1, skipped: [], unchanged: 1 });
    expect(undo.revisions).toEqual([
      { taskPageId: a, revision: await revision(a) },
    ]);
    // Neizmenjen zadatak ne dobija reviziju.
    expect(await revision(b)).toBe(0);
  });

  test("zadatak zaključan posle grupne izmene se ne vraća članu", async () => {
    const s = await seed();
    const a = await s.task("A", { dueDate: OCT_01 });
    const moved = await s.asMember.mutation(api.prostor.tasks.bulkReschedule, {
      workspaceId: s.startupA,
      taskPageIds: [a],
      dueDate: OCT_28,
    });
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: a });
    const undo = await s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
      workspaceId: s.startupA,
      items: [
        {
          taskPageId: a,
          dueDate: OCT_01,
          taskStatus: "backlog",
          expectedRevision: moved.updated[0]!.revision,
        },
      ],
    });
    expect(undo).toEqual({
      restored: 0,
      revisions: [],
      skipped: [{ taskPageId: a, reason: "zakljucan" }],
      unchanged: 0,
    });
    expect((await pageOf(s, a))!.dueDate).toBe(OCT_28);
  });

  test("granice ulaza: prazno, 51 i duplikat", async () => {
    const s = await seed();
    const a = await s.task("A");
    const item = {
      taskPageId: a,
      dueDate: null,
      taskStatus: "backlog" as const,
      expectedRevision: 0,
    };
    const call = (items: Array<typeof item>) =>
      s.asMember.mutation(api.prostor.tasks.bulkRestoreSchedule, {
        workspaceId: s.startupA,
        items,
      });
    await expect(call([])).rejects.toThrow("Izaberi bar jedan zadatak.");
    await expect(call([item, item])).rejects.toThrow(
      "Isti zadatak je naveden više puta.",
    );
    await expect(call(Array.from({ length: 51 }, () => item))).rejects.toThrow(
      "najviše 50 zadataka",
    );
  });
});

describe("tasks.listForArea", () => {
  test("zadaci oblasti, najnovije izmenjeni prvi, sa filterom po statusu", async () => {
    const s = await seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const first = await s.task("Prvi");
    vi.setSystemTime(T0 + MINUTE);
    const second = await s.task("Drugi");
    vi.setSystemTime(T0 + 2 * MINUTE);
    const third = await s.task("Treći");
    await s.task("Druga oblast", { area: s.salesArea });
    const note = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.devArea,
      parentPageId: null,
      kind: "note",
      title: "Beleška nije zadatak",
    });
    vi.setSystemTime(T0 + 3 * MINUTE);
    await s.asAuthor.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.startupA, pageId: first, status: "in_progress" });

    const list = (status?: "in_progress") =>
      s.asMember.query(api.prostor.tasks.listForArea, {
        workspaceId: s.startupA,
        areaId: s.devArea,
        ...(status === undefined ? {} : { status }),
        paginationOpts: { numItems: 20, cursor: null },
      });
    const all = await list();
    expect(all.page.map((row) => row._id)).toEqual([first, third, second]);
    expect(all.page.some((row) => row._id === note)).toBe(false);
    expect((await list("in_progress")).page.map((row) => row._id)).toEqual([first]);

    // Obrisan zadatak ne ulazi.
    await s.asAuthor.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: second });
    expect((await list()).page.map((row) => row._id)).toEqual([first, third]);
  });

  test("nečlan, uklonjen član, arhiviran profil i oblast iz drugog startupa", async () => {
    const s = await seed();
    const args = {
      workspaceId: s.startupA,
      areaId: s.devArea,
      paginationOpts: { numItems: 20, cursor: null },
    };
    await expect(s.asOutsider.query(api.prostor.tasks.listForArea, args)).rejects.toThrow(
      "Nemaš pristup ovom projektu.",
    );
    await expect(s.asRemoved.query(api.prostor.tasks.listForArea, args)).rejects.toThrow(
      "Nemaš pristup ovom projektu.",
    );
    await expect(s.asArchived.query(api.prostor.tasks.listForArea, args)).rejects.toThrow(
      "Profil još nije spreman",
    );
    await expect(
      s.asMember.query(api.prostor.tasks.listForArea, { ...args, areaId: s.areaB }),
    ).rejects.toThrow("Oblast nije pronađena u ovom projektu.");
    await expect(
      s.asMember.query(api.prostor.tasks.listForArea, {
        ...args,
        paginationOpts: { numItems: 101, cursor: null },
      }),
    ).rejects.toThrow("Limit mora biti ceo broj");
  });
});

describe("pages.recentForArea", () => {
  test("poslednje izmenjene stranice svih vrsta, sa imenom ko je menjao", async () => {
    const s = await seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const note = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.devArea,
      parentPageId: null,
      kind: "note",
      title: "Beleška",
    });
    vi.setSystemTime(T0 + MINUTE);
    const task = await s.task("Zadatak");
    // Tabela: kopija beleške kao druga vrsta, da spajanje četiri vrste bude pokriveno.
    vi.setSystemTime(T0 + 2 * MINUTE);
    const table = await s.t.run(async (ctx) => {
      const { _id, _creationTime, ...doc } = (await ctx.db.get("pages", note))!;
      void _id;
      void _creationTime;
      return await ctx.db.insert("pages", {
        ...doc,
        kind: "table",
        title: "Tabela",
        updatedAt: T0 + 2 * MINUTE,
        updatedByProfileId: s.owner.profileId,
      });
    });
    await s.task("Druga oblast", { area: s.salesArea });
    vi.setSystemTime(T0 + 3 * MINUTE);
    await s.asOwner.mutation(api.prostor.pages.update, {
      workspaceId: s.startupA,
      pageId: note,
      title: "Beleška (izmenjena)",
      expectedRevision: 0,
    });

    const rows = await s.asMember.query(api.prostor.pages.recentForArea, {
      workspaceId: s.startupA,
      areaId: s.devArea,
    });
    expect(rows.map((row) => row._id)).toEqual([note, table, task]);
    expect(rows[0]).toMatchObject({
      title: "Beleška (izmenjena)",
      updatedBy: { _id: s.owner.profileId, displayName: "Owner", avatarUrl: null },
    });
    expect(rows[2]).toMatchObject({
      kind: "task",
      updatedBy: { displayName: "Author" },
    });

    const limited = await s.asMember.query(api.prostor.pages.recentForArea, {
      workspaceId: s.startupA,
      areaId: s.devArea,
      limit: 2,
    });
    expect(limited.map((row) => row._id)).toEqual([note, table]);

    // Obrisana stranica ne ulazi.
    await s.asAuthor.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: task });
    const afterTrash = await s.asMember.query(api.prostor.pages.recentForArea, {
      workspaceId: s.startupA,
      areaId: s.devArea,
    });
    expect(afterTrash.map((row) => row._id)).toEqual([note, table]);
  });

  test("limit je 1–20; nečlan, uklonjen član, arhiviran profil i tuđa oblast ne čitaju", async () => {
    const s = await seed();
    const args = { workspaceId: s.startupA, areaId: s.devArea };
    await expect(
      s.asMember.query(api.prostor.pages.recentForArea, { ...args, limit: 21 }),
    ).rejects.toThrow("Limit mora biti ceo broj");
    await expect(
      s.asMember.query(api.prostor.pages.recentForArea, { ...args, limit: 0 }),
    ).rejects.toThrow("Limit mora biti ceo broj");
    await expect(s.asOutsider.query(api.prostor.pages.recentForArea, args)).rejects.toThrow(
      "Nemaš pristup ovom projektu.",
    );
    await expect(s.asRemoved.query(api.prostor.pages.recentForArea, args)).rejects.toThrow(
      "Nemaš pristup ovom projektu.",
    );
    await expect(s.asArchived.query(api.prostor.pages.recentForArea, args)).rejects.toThrow(
      "Profil još nije spreman",
    );
    await expect(
      s.asMember.query(api.prostor.pages.recentForArea, { ...args, areaId: s.areaB }),
    ).rejects.toThrow("Oblast nije pronađena u ovom projektu.");
  });
});
