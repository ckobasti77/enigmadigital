/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/notifications.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup, ukloniClanstvo } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rok u lokalno podne, kao što ga upisuje `fromDateInputValue`. */
function noonOffsetDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

async function seedNotificationWorkspace(memberCount = 2) {
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
    const third = await createPerson("Third");
    const outsider = await createPerson("Outsider");

    const workspace = await insertStartup(ctx, {
      name: "Notify startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const roster = [owner, member, third].slice(0, memberCount);
    for (const person of roster) {
      await insertClanstvo(ctx, {
        workspaceId: workspace,
        profileId: person.profileId,
        addedByProfileId: owner.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    const area = await ctx.db.insert("areas", {
      workspaceId: workspace,
      key: "notify-area",
      label: "Notify area",
      position: 0,
      createdAt: now,
    });
    return { owner, member, third, outsider, workspace, area };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });

  const notificationsFor = (profileId: Id<"profiles">) =>
    t.run(async (ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
          q.eq("recipientProfileId", profileId).eq("workspaceId", seeded.workspace),
        )
        .collect(),
    );

  const allNotifications = () =>
    t.run(async (ctx) => ctx.db.query("notifications").collect());

  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asMember: asPerson(seeded.member),
    asThird: asPerson(seeded.third),
    asOutsider: asPerson(seeded.outsider),
    notificationsFor,
    allNotifications,
  };
}

describe("obaveštenja o zadacima", () => {
  test("dodela pri kreiranju obaveštava dodeljenog, ali ne i sebe", async () => {
    const { workspace, area, member, owner, asOwner, notificationsFor } =
      await seedNotificationWorkspace();

    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Priprema lansiranja",
      assigneeProfileId: member.profileId,
    });

    const memberRows = await notificationsFor(member.profileId);
    expect(memberRows).toHaveLength(1);
    expect(memberRows[0]).toMatchObject({
      type: "task_assigned",
      targetType: "page",
      targetId: taskId,
      readAt: null,
    });
    expect(memberRows[0].title).toContain("Priprema lansiranja");
    expect(memberRows[0].body).toBe("Dodelio/la: Owner");

    // Kreator sam sebe ne obaveštava.
    await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Sopstveni zadatak",
      assigneeProfileId: owner.profileId,
    });
    expect(await notificationsFor(owner.profileId)).toHaveLength(0);
  });

  test("promena statusa obaveštava dodeljenog i kreatora, blokada ima svoju poruku", async () => {
    const { workspace, area, member, owner, asOwner, asMember, notificationsFor } =
      await seedNotificationWorkspace();

    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Sa dodelom",
      assigneeProfileId: member.profileId,
    });

    // Kreator menja status → obaveštava dodeljenog.
    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "blocked",
    });
    const afterBlocked = await notificationsFor(member.profileId);
    const blocked = afterBlocked.find(
      (row) => row.type === "task_status_changed",
    );
    expect(blocked?.title).toContain("čeka — blokiran je");
    expect(blocked?.body).toContain("Proveri šta koči");

    // Dodeljeni menja status → kreator saznaje (grana koju su nove dozvole otvorile).
    await asMember.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "in_progress",
    });
    const ownerRows = await notificationsFor(owner.profileId);
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]).toMatchObject({ type: "task_status_changed" });
    expect(ownerRows[0].title).toContain("U toku");
  });

  test("nepromenjena izmena ne pravi obaveštenje", async () => {
    const { workspace, area, member, asOwner, allNotifications } =
      await seedNotificationWorkspace();

    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Bez promene",
      assigneeProfileId: member.profileId,
    });
    const before = (await allNotifications()).length;

    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "backlog",
    });
    expect((await allNotifications()).length).toBe(before);
  });

  test("preuzimanje nedodeljenog zadatka obaveštava kreatora", async () => {
    const { workspace, area, member, owner, asOwner, asMember, notificationsFor } =
      await seedNotificationWorkspace();

    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Slobodan zadatak",
    });
    await asMember.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      assigneeProfileId: member.profileId,
    });

    // Preuzimalac ne dobija obaveštenje o sopstvenoj radnji.
    expect(await notificationsFor(member.profileId)).toHaveLength(0);
    expect(await notificationsFor(owner.profileId)).toHaveLength(0);
  });
});

describe("obaveštenja o idejama", () => {
  async function seedIdea() {
    const context = await seedNotificationWorkspace();
    const ideaId = await context.asOwner.mutation(api.prostor.ideas.create, {
      workspaceId: context.workspace,
      title: "Nova ideja",
      text: "Opis ideje",
      color: "violet",
      x: 0,
      y: 0,
    });
    return { ...context, ideaId: ideaId as Id<"ideaNodes"> };
  }

  // PROSTOR P6: ideju pretvara autor, vlasnik platforme ili vlasnik projekta, i to u fazi
  // „Odobreno" — zato je ovde autor član, a pretvara je vlasnik projekta.
  test("konverzija ideje obaveštava autora i vodi na rezultat", async () => {
    const { workspace, area, member, asMember, asOwner, notificationsFor } =
      await seedNotificationWorkspace();
    const ideaId = await asMember.mutation(api.prostor.ideas.create, {
      workspaceId: workspace,
      title: "Nova ideja",
      text: "Opis ideje",
      color: "violet",
      x: 0,
      y: 0,
    });
    await asOwner.mutation(api.prostor.ideas.setStage, {
      workspaceId: workspace,
      ideaId,
      stage: "odobreno",
    });

    const pageId = await asOwner.mutation(api.prostor.ideas.convertToPage, {
      workspaceId: workspace,
      ideaId,
      areaId: area,
      kind: "task",
    });

    const rows = await notificationsFor(member.profileId);
    const converted = rows.find((row) => row.type === "idea_converted");
    expect(converted).toMatchObject({ targetType: "page", targetId: pageId });
    expect(converted?.title).toContain("pretvorena u zadatak");
    expect(converted?.body).toBe("Pretvorio/la: Owner");
  });

  test("autor koji glasa za svoju ideju ne dobija obaveštenje", async () => {
    const { workspace, ideaId, owner, asOwner, notificationsFor } =
      await seedIdea();

    await asOwner.mutation(api.prostor.ideas.vote, {
      workspaceId: workspace,
      ideaId,
      voteType: "up",
    });
    expect(await notificationsFor(owner.profileId)).toHaveLength(0);
  });
});

describe("obaveštenja o glasanju za brisanje", () => {
  // PROSTOR K03 (P3, P4): glasanje je ugašeno — stari `requestDeletion` odmah
  // šalje tuđu stranicu u Korpu i nikoga ne pita ni ne obaveštava.
  test("stari zahtev za brisanje ne pita tim ni ne javlja ishod; stranica je u Korpi", async () => {
    const {
      t,
      workspace,
      area,
      owner,
      member,
      third,
      asOwner,
      asMember,
      notificationsFor,
    } = await seedNotificationWorkspace(3);

    const pageId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "note",
      title: "Za brisanje",
    });
    await expect(
      asMember.mutation(api.prostor.collaboration.requestDeletion, {
        workspaceId: workspace,
        target: { kind: "page", id: pageId },
      }),
    ).resolves.toBeNull();

    for (const profileId of [owner.profileId, member.profileId, third.profileId]) {
      const rows = await notificationsFor(profileId);
      expect(
        rows.filter(
          (row) =>
            row.type === "vote_requested" || row.type === "request_resolved",
        ),
      ).toEqual([]);
    }
    expect(await t.run((ctx) => ctx.db.get("pages", pageId))).toMatchObject({
      trashState: "root",
      archivedByProfileId: member.profileId,
    });
  });
});

describe("cron podsetnici za rokove", () => {
  async function seedDueTasks() {
    const context = await seedNotificationWorkspace();
    const { workspace, area, member, asOwner } = context;

    const create = async (title: string, dueDate: number | null, assign: boolean) =>
      (await asOwner.mutation(api.prostor.pages.create, {
        workspaceId: workspace,
        areaId: area,
        parentPageId: null,
        kind: "task",
        title,
        ...(assign ? { assigneeProfileId: member.profileId } : {}),
        ...(dueDate === null ? {} : { dueDate }),
      })) as Id<"pages">;

    const dueToday = await create("Danas ističe", noonOffsetDays(0), true);
    const dueTomorrow = await create("Sutra ističe", noonOffsetDays(1), true);
    const overdue = await create("Probio rok", noonOffsetDays(-3), true);
    const noDate = await create("Bez roka", null, true);
    const unassigned = await create("Nedodeljen danas", noonOffsetDays(0), false);
    const finished = await create("Završen danas", noonOffsetDays(0), true);
    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: finished,
      status: "done",
    });

    return { ...context, dueToday, dueTomorrow, overdue, noDate, unassigned, finished };
  }

  function reminderTypesByTask(rows: Array<Doc<"notifications">>) {
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.targetId !== null && row.dedupeKey !== null) {
        map.set(row.targetId, row.type);
      }
    }
    return map;
  }

  test("javlja samo za današnje, sutrašnje i prekoračene rokove", async () => {
    const {
      t,
      workspace,
      member,
      owner,
      dueToday,
      dueTomorrow,
      overdue,
      noDate,
      unassigned,
      finished,
      notificationsFor,
    } = await seedDueTasks();

    // Enigma (S01 D11): cron raspoređuje po projektu; ovde zovemo posao jednog projekta.
    const result = await t.mutation(
      internal.prostor.notifications.remindDueTasksForWorkspace,
      { workspaceId: workspace, cursor: null, now: Date.now() },
    );
    expect(result.created).toBeGreaterThan(0);

    const byTask = reminderTypesByTask(await notificationsFor(member.profileId));
    expect(byTask.get(dueToday)).toBe("task_due_today");
    expect(byTask.get(dueTomorrow)).toBe("task_due_soon");
    expect(byTask.get(overdue)).toBe("task_overdue");
    expect(byTask.has(noDate)).toBe(false);
    expect(byTask.has(finished)).toBe(false);

    // Nedodeljen zadatak podseća onoga koji ga je otvorio.
    const ownerByTask = reminderTypesByTask(
      await notificationsFor(owner.profileId),
    );
    expect(ownerByTask.get(unassigned)).toBe("task_due_today");
  });

  test("ponovno pokretanje ne pravi duplikate, a promena roka ponovo naoruža podsetnik", async () => {
    const { t, workspace, dueToday, allNotifications } = await seedDueTasks();
    // Enigma (S01 D11): cron raspoređuje po projektu; ovde zovemo posao jednog projekta.
    const remind = () =>
      t.mutation(internal.prostor.notifications.remindDueTasksForWorkspace, {
        workspaceId: workspace,
        cursor: null,
        now: Date.now(),
      });

    await remind();
    const afterFirst = (await allNotifications()).length;

    const second = await remind();
    expect(second.created).toBe(0);
    expect((await allNotifications()).length).toBe(afterFirst);

    // Novi rok = novi dedupe ključ, pa podsetnik sme ponovo.
    await t.run(async (ctx) => {
      const newDue = Date.now() - 2 * DAY_MS;
      await ctx.db.patch("pages", dueToday, {
        dueDate: newDue,
        taskSortAt: newDue,
      });
    });
    const third = await remind();
    expect(third.created).toBe(1);
  });
});

describe("ugovori notifikacionog API-ja", () => {
  test("brojač, čitanje i „označi sve” rade samo za svog primaoca", async () => {
    const { workspace, area, member, asOwner, asMember, asOutsider } =
      await seedNotificationWorkspace();

    await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Prvi",
      assigneeProfileId: member.profileId,
    });
    await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Drugi",
      assigneeProfileId: member.profileId,
    });

    expect(
      await asMember.query(api.prostor.notifications.unreadCount, { workspaceId: workspace }),
    ).toEqual({ count: 2, capped: false });
    expect(
      await asOwner.query(api.prostor.notifications.unreadCount, { workspaceId: workspace }),
    ).toEqual({ count: 0, capped: false });

    const page = await asMember.query(api.prostor.notifications.list, {
      workspaceId: workspace,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(2);
    expect(page.page[0].createdAt).toBeGreaterThanOrEqual(page.page[1].createdAt);
    expect(page.page[0].actor?.displayName).toBe("Owner");

    // Tuđe obaveštenje ne može da se označi kao pročitano.
    await expect(
      asOwner.mutation(api.prostor.notifications.markRead, {
        notificationId: page.page[0]._id,
      }),
    ).rejects.toThrow("Obaveštenje nije pronađeno.");

    await asMember.mutation(api.prostor.notifications.markRead, {
      notificationId: page.page[0]._id,
    });
    expect(
      await asMember.query(api.prostor.notifications.unreadCount, { workspaceId: workspace }),
    ).toEqual({ count: 1, capped: false });

    await asMember.mutation(api.prostor.notifications.markAllRead, { workspaceId: workspace });
    expect(
      await asMember.query(api.prostor.notifications.unreadCount, { workspaceId: workspace }),
    ).toEqual({ count: 0, capped: false });

    await expect(
      asOutsider.query(api.prostor.notifications.unreadCount, { workspaceId: workspace }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("uklonjen član ne dobija nova obaveštenja", async () => {
    const { t, workspace, area, member, asOwner, notificationsFor } =
      await seedNotificationWorkspace();

    // Zadatak je dodeljen dok je član još u startupu.
    const taskId = await asOwner.mutation(api.prostor.pages.create, {
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Pre uklanjanja",
      assigneeProfileId: member.profileId,
    });
    expect(await notificationsFor(member.profileId)).toHaveLength(1);

    await t.run(async (ctx) => {
      // Enigma: članstvo je `members` red (`.first()`, nikad `.unique()`).
      const membership = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", member.userId).eq("workspaceId", workspace),
        )
        .first();
      await ukloniClanstvo(ctx, membership?._id ?? null);
    });

    // Promena statusa bi normalno obavestila dodeljenog, ali on više nije član.
    await asOwner.mutation(api.prostor.tasks.updateMetadata, {
      workspaceId: workspace,
      pageId: taskId,
      status: "in_progress",
    });
    expect(await notificationsFor(member.profileId)).toHaveLength(1);
  });
});

describe("pretplate za push", () => {
  test("ista pretplata se osvežava, a briše samo svom vlasniku", async () => {
    const { t, asMember, asOwner, member } = await seedNotificationWorkspace();
    const endpoint = "https://push.example.test/subscription-1";

    await asMember.mutation(api.prostor.pushSubscriptions.save, {
      endpoint,
      p256dh: "kljuc-1",
      auth: "tajna-1",
      userAgent: "Test/1.0",
    });
    await asMember.mutation(api.prostor.pushSubscriptions.save, {
      endpoint,
      p256dh: "kljuc-2",
      auth: "tajna-2",
    });

    const rows = await t.run(async (ctx) =>
      ctx.db.query("pushSubscriptions").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profileId: member.profileId,
      p256dh: "kljuc-2",
      failureCount: 0,
    });

    expect(
      await asMember.query(api.prostor.pushSubscriptions.isRegistered, { endpoint }),
    ).toBe(true);
    expect(
      await asOwner.query(api.prostor.pushSubscriptions.isRegistered, { endpoint }),
    ).toBe(false);

    // Tuđa pretplata ostaje netaknuta.
    await asOwner.mutation(api.prostor.pushSubscriptions.remove, { endpoint });
    expect(
      (await t.run(async (ctx) => ctx.db.query("pushSubscriptions").collect()))
        .length,
    ).toBe(1);

    await asMember.mutation(api.prostor.pushSubscriptions.remove, { endpoint });
    expect(
      (await t.run(async (ctx) => ctx.db.query("pushSubscriptions").collect()))
        .length,
    ).toBe(0);
  });

  test("mrtva pretplata se briše, a neuspesi se gomilaju do praga", async () => {
    const { t, asMember } = await seedNotificationWorkspace();
    const goneEndpoint = "https://push.example.test/gone";
    const flakyEndpoint = "https://push.example.test/flaky";

    const goneId = await asMember.mutation(api.prostor.pushSubscriptions.save, {
      endpoint: goneEndpoint,
      p256dh: "k",
      auth: "a",
    });
    const flakyId = await asMember.mutation(api.prostor.pushSubscriptions.save, {
      endpoint: flakyEndpoint,
      p256dh: "k",
      auth: "a",
    });

    await t.mutation(internal.prostor.pushSubscriptions.recordDeliveryResults, {
      results: [
        { subscriptionId: goneId, outcome: "gone" },
        { subscriptionId: flakyId, outcome: "failed" },
      ],
    });

    const afterFirst = await t.run(async (ctx) =>
      ctx.db.query("pushSubscriptions").collect(),
    );
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0].failureCount).toBe(1);

    // Peti neuspeh gasi pretplatu.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await t.mutation(internal.prostor.pushSubscriptions.recordDeliveryResults, {
        results: [{ subscriptionId: flakyId, outcome: "failed" }],
      });
    }
    expect(
      (await t.run(async (ctx) => ctx.db.query("pushSubscriptions").collect()))
        .length,
    ).toBe(0);
  });
});
