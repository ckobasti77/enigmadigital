/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/personalTasks.test.ts (main @ c05c40f), SPAJANJE S04.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  MAX_OPEN_PERSONAL_TASKS,
  MAX_PERSONAL_TASK_NOTES_LENGTH,
  MAX_PERSONAL_TASK_TITLE_LENGTH,
  PERSONAL_TASKS_LIST_MAX,
} from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup, ukloniClanstvo } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const NOT_FOUND = "Lični zadatak nije pronađen.";
const DAY = "2026-10-25";

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
    const workspace = await insertStartup(ctx, {
      name: "Cluck Rush",
      description: "",
      createdByProfileId: me.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const foreignStartup = await insertStartup(ctx, {
      name: "Tuđi startup",
      description: "",
      createdByProfileId: other.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const memberships = {
      me: await insertClanstvo(ctx, {
        workspaceId: workspace,
        profileId: me.profileId,
        addedByProfileId: me.profileId,
        archivedAt: null,
        createdAt: now,
      }),
    };
    await insertClanstvo(ctx, {
      workspaceId: workspace,
      profileId: other.profileId,
      addedByProfileId: me.profileId,
      archivedAt: null,
      createdAt: now,
    });
    await insertClanstvo(ctx, {
      workspaceId: foreignStartup,
      profileId: other.profileId,
      addedByProfileId: other.profileId,
      archivedAt: null,
      createdAt: now,
    });
    const area = await ctx.db.insert("areas", {
      workspaceId: workspace,
      key: "dev",
      label: "Dev notes",
      position: 0,
      createdAt: now,
    });
    const foreignArea = await ctx.db.insert("areas", {
      workspaceId: foreignStartup,
      key: "dev",
      label: "Dev notes",
      position: 0,
      createdAt: now,
    });
    return { me, other, workspace, foreignStartup, area, foreignArea, memberships };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return { t, ...seeded, asMe: as(seeded.me), asOther: as(seeded.other) };
}

/** Upisuje `count` ličnih zadataka direktno (za granice). */
async function seedPersonalTasks(
  t: ReturnType<typeof convexTest>,
  profileId: Id<"profiles">,
  count: number,
  overrides: { status?: "open" | "done"; archivedAt?: number | null } = {},
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("personalTasks", {
        profileId,
        title: `Zadatak ${index}`,
        status: overrides.status ?? "open",
        priority: null,
        dueDate: null,
        sortAt: 8_000_000_000_000_000 - (now + index),
        completedAt: overrides.status === "done" ? now : null,
        archivedAt: overrides.archivedAt ?? null,
        createdAt: now + index,
        updatedAt: now + index,
      });
    }
  });
}

describe("personalTasks: pravljenje i lista", () => {
  test("create → list i get vraćaju očišćen zadatak sa tačnim poljima", async () => {
    const { asMe } = await seed();
    const dueDate = new Date("2026-10-27T12:00:00").getTime();
    const id = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "  Kupi mleko  ",
      notes: "  dve litre  ",
      priority: "high",
      dueDate,
    });

    const listed = await asMe.query(api.prostor.personalTasks.list, {});
    expect(listed.capped).toBe(false);
    expect(listed.items).toHaveLength(1);
    const item = listed.items[0];
    expect(item).toMatchObject({
      _id: id,
      title: "Kupi mleko",
      notes: "dve litre",
      status: "open",
      priority: "high",
      dueDate,
      sortAt: dueDate,
      completedAt: null,
    });
    // Klijent nikad ne vidi vlasnika, arhivu ni trag prebacivanja.
    expect(Object.keys(item).sort()).toEqual(
      [
        "_id",
        "completedAt",
        "createdAt",
        "dueDate",
        "notes",
        "priority",
        "sortAt",
        "status",
        "title",
        "updatedAt",
      ].sort(),
    );
    expect(await asMe.query(api.prostor.personalTasks.get, { personalTaskId: id })).toEqual(
      item,
    );
  });

  test("bez roka: sortAt = 8e15 − createdAt, prazna beleška se ne čuva", async () => {
    const { t, asMe } = await seed();
    const id = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Bez roka",
      notes: "   ",
    });
    const doc = await t.run(async (ctx) => await ctx.db.get("personalTasks", id));
    expect(doc).not.toBeNull();
    expect(doc!.sortAt).toBe(8_000_000_000_000_000 - doc!.createdAt);
    expect(doc!.priority).toBeNull();
    expect(doc!.dueDate).toBeNull();
    expect("notes" in doc!).toBe(false);
  });

  test("granice naslova, beleške i roka", async () => {
    const { asMe } = await seed();
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, {
        title: "x".repeat(MAX_PERSONAL_TASK_TITLE_LENGTH + 1),
      }),
    ).rejects.toThrow("Naslov može imati najviše 200 znakova.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, { title: "   " }),
    ).rejects.toThrow("Naslov je obavezno polje.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, {
        title: "Beleška",
        notes: "x".repeat(MAX_PERSONAL_TASK_NOTES_LENGTH + 1),
      }),
    ).rejects.toThrow("Beleška može imati najviše 5000 znakova.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, { title: "Rok", dueDate: -1 }),
    ).rejects.toThrow("Rok nije ispravan.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, { title: "Rok", dueDate: 1.5 }),
    ).rejects.toThrow("Rok nije ispravan.");

    await asMe.mutation(api.prostor.personalTasks.create, {
      title: "x".repeat(MAX_PERSONAL_TASK_TITLE_LENGTH),
      notes: "y".repeat(MAX_PERSONAL_TASK_NOTES_LENGTH),
    });
    const { items } = await asMe.query(api.prostor.personalTasks.list, {});
    expect(items).toHaveLength(1);
    await expect(
      asMe.query(api.prostor.personalTasks.list, { limit: PERSONAL_TASKS_LIST_MAX + 1 }),
    ).rejects.toThrow("Limit mora biti ceo broj između 1 i 300.");
  });

  test("addToMyDay pravi stavku plana; loš dan poništava ceo upis", async () => {
    const { t, asMe, me } = await seed();
    const id = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Za danas",
      addToMyDay: { dayKey: DAY },
    });
    const entries = await t.run(
      async (ctx) =>
        await ctx.db
          .query("myDayEntries")
          .withIndex("by_profile_day_position", (q) =>
            q.eq("profileId", me.profileId).eq("dayKey", DAY),
          )
          .collect(),
    );
    expect(entries).toEqual([
      expect.objectContaining({
        refKind: "personal",
        personalTaskId: id,
        taskPageId: null,
        refKey: `personal:${id}`,
      }),
    ]);

    await expect(
      asMe.mutation(api.prostor.personalTasks.create, {
        title: "Loš dan",
        addToMyDay: { dayKey: "2026-02-30" },
      }),
    ).rejects.toThrow("Neispravan dan.");
    const { items } = await asMe.query(api.prostor.personalTasks.list, {});
    expect(items.map((item) => item.title)).toEqual(["Za danas"]);
  });

  test("neprijavljen korisnik ne vidi i ne pravi ništa", async () => {
    const { t } = await seed();
    await expect(t.query(api.prostor.personalTasks.list, {})).rejects.toThrow(
      "Niste prijavljeni.",
    );
    await expect(
      t.mutation(api.prostor.personalTasks.create, { title: "Anonimno" }),
    ).rejects.toThrow("Niste prijavljeni.");
  });
});

describe("personalTasks: samo vlasnik", () => {
  test("tuđ id se ponaša isto kao nepostojeći, a tuđa lista je prazna", async () => {
    const { t, asMe, asOther, workspace, area } = await seed();
    const foreign = await asOther.mutation(api.prostor.personalTasks.create, {
      title: "Anin zadatak",
    });
    const deleted = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Obrisan",
    });
    await t.run(async (ctx) => await ctx.db.delete("personalTasks", deleted));

    expect((await asMe.query(api.prostor.personalTasks.list, { status: "all" })).items).toEqual(
      [],
    );
    for (const personalTaskId of [foreign, deleted]) {
      expect(await asMe.query(api.prostor.personalTasks.get, { personalTaskId })).toBeNull();
      await expect(
        asMe.mutation(api.prostor.personalTasks.update, { personalTaskId, title: "Moje" }),
      ).rejects.toThrow(NOT_FOUND);
      await expect(
        asMe.mutation(api.prostor.personalTasks.setStatus, { personalTaskId, status: "done" }),
      ).rejects.toThrow(NOT_FOUND);
      await expect(
        asMe.mutation(api.prostor.personalTasks.archive, { personalTaskId }),
      ).rejects.toThrow(NOT_FOUND);
      await expect(
        asMe.mutation(api.prostor.personalTasks.restore, { personalTaskId }),
      ).rejects.toThrow(NOT_FOUND);
      await expect(
        asMe.mutation(api.prostor.personalTasks.moveToStartup, {
          personalTaskId,
          workspaceId: workspace,
          areaId: area,
        }),
      ).rejects.toThrow(NOT_FOUND);
    }

    // Anin zadatak je netaknut.
    const ana = await asOther.query(api.prostor.personalTasks.get, { personalTaskId: foreign });
    expect(ana).toMatchObject({ title: "Anin zadatak", status: "open" });
    expect(
      await t.run(async (ctx) => await ctx.db.get("personalTasks", foreign)),
    ).toMatchObject({ archivedAt: null });
  });
});

describe("personalTasks: status, izmena, arhiva", () => {
  test("done ↔ open pomera completedAt i liste po statusu", async () => {
    const { asMe } = await seed();
    const id = await asMe.mutation(api.prostor.personalTasks.create, { title: "Trening" });
    await asMe.mutation(api.prostor.personalTasks.create, { title: "Otvoren" });

    expect(
      await asMe.mutation(api.prostor.personalTasks.setStatus, {
        personalTaskId: id,
        status: "done",
      }),
    ).toEqual({ previousStatus: "open" });
    const done = await asMe.query(api.prostor.personalTasks.get, { personalTaskId: id });
    expect(done?.status).toBe("done");
    expect(typeof done?.completedAt).toBe("number");

    const open = await asMe.query(api.prostor.personalTasks.list, { status: "open" });
    expect(open.items.map((item) => item.title)).toEqual(["Otvoren"]);
    const doneList = await asMe.query(api.prostor.personalTasks.list, { status: "done" });
    expect(doneList.items.map((item) => item.title)).toEqual(["Trening"]);
    const all = await asMe.query(api.prostor.personalTasks.list, { status: "all" });
    expect(all.items.map((item) => item.title)).toEqual(["Otvoren", "Trening"]);

    // Isti status je no-op.
    expect(
      await asMe.mutation(api.prostor.personalTasks.setStatus, {
        personalTaskId: id,
        status: "done",
      }),
    ).toEqual({ previousStatus: "done" });

    await asMe.mutation(api.prostor.personalTasks.setStatus, {
      personalTaskId: id,
      status: "open",
    });
    expect(
      await asMe.query(api.prostor.personalTasks.get, { personalTaskId: id }),
    ).toMatchObject({ status: "open", completedAt: null });
  });

  test("update menja polja, null briše belešku i rok, rok preračunava sortAt", async () => {
    const { t, asMe } = await seed();
    const id = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Plan",
      notes: "beleška",
    });
    const dueDate = new Date("2026-11-02T12:00:00").getTime();
    await asMe.mutation(api.prostor.personalTasks.update, {
      personalTaskId: id,
      title: "  Plan puta  ",
      priority: "urgent",
      dueDate,
    });
    expect(await asMe.query(api.prostor.personalTasks.get, { personalTaskId: id })).toMatchObject(
      { title: "Plan puta", priority: "urgent", dueDate, sortAt: dueDate, notes: "beleška" },
    );

    await asMe.mutation(api.prostor.personalTasks.update, {
      personalTaskId: id,
      notes: null,
      dueDate: null,
      priority: null,
    });
    const doc = await t.run(async (ctx) => await ctx.db.get("personalTasks", id));
    expect("notes" in doc!).toBe(false);
    expect(doc).toMatchObject({
      dueDate: null,
      priority: null,
      sortAt: 8_000_000_000_000_000 - doc!.createdAt,
    });

    await expect(
      asMe.mutation(api.prostor.personalTasks.update, { personalTaskId: id, title: " " }),
    ).rejects.toThrow("Naslov je obavezno polje.");
  });

  test("archive skriva zadatak, restore ga vraća; arhiviran se ne menja", async () => {
    const { asMe } = await seed();
    const id = await asMe.mutation(api.prostor.personalTasks.create, { title: "Obriši me" });
    await asMe.mutation(api.prostor.personalTasks.archive, { personalTaskId: id });
    expect((await asMe.query(api.prostor.personalTasks.list, {})).items).toEqual([]);
    expect(await asMe.query(api.prostor.personalTasks.get, { personalTaskId: id })).toBeNull();
    await expect(
      asMe.mutation(api.prostor.personalTasks.update, { personalTaskId: id, title: "Ne" }),
    ).rejects.toThrow(NOT_FOUND);
    await expect(
      asMe.mutation(api.prostor.personalTasks.archive, { personalTaskId: id }),
    ).rejects.toThrow(NOT_FOUND);

    await asMe.mutation(api.prostor.personalTasks.restore, { personalTaskId: id });
    expect((await asMe.query(api.prostor.personalTasks.list, {})).items).toEqual([
      expect.objectContaining({ _id: id, title: "Obriši me" }),
    ]);
  });

  test(`granica ${MAX_OPEN_PERSONAL_TASKS} otvorenih važi za create, restore i setStatus(open)`, async () => {
    const { t, asMe, me } = await seed();
    const archivedId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Arhiviran" });
    await asMe.mutation(api.prostor.personalTasks.archive, { personalTaskId: archivedId });
    const doneId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Završen" });
    await asMe.mutation(api.prostor.personalTasks.setStatus, {
      personalTaskId: doneId,
      status: "done",
    });
    // Arhivirani i završeni se ne broje.
    await seedPersonalTasks(t, me.profileId, 20, { archivedAt: Date.now() });
    await seedPersonalTasks(t, me.profileId, MAX_OPEN_PERSONAL_TASKS - 1);
    await asMe.mutation(api.prostor.personalTasks.create, { title: "Poslednji koji staje" });

    const limitMessage = "Možeš imati najviše 500 otvorenih ličnih zadataka.";
    await expect(
      asMe.mutation(api.prostor.personalTasks.create, { title: "Previše" }),
    ).rejects.toThrow(limitMessage);
    await expect(
      asMe.mutation(api.prostor.personalTasks.restore, { personalTaskId: archivedId }),
    ).rejects.toThrow(limitMessage);
    await expect(
      asMe.mutation(api.prostor.personalTasks.setStatus, { personalTaskId: doneId, status: "open" }),
    ).rejects.toThrow(limitMessage);

    const list = await asMe.query(api.prostor.personalTasks.list, { limit: PERSONAL_TASKS_LIST_MAX });
    expect(list.items).toHaveLength(PERSONAL_TASKS_LIST_MAX);
    expect(list.capped).toBe(true);
  });
});

describe("personalTasks.moveToStartup", () => {
  test("pravi task stranicu sa mnom kao izvršiocem i prepisuje plan", async () => {
    const { t, asMe, me, workspace, area } = await seed();
    const dueDate = new Date("2026-10-30T12:00:00").getTime();
    const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Ponuda za klijenta",
      notes: "Cena i rok isporuke.",
      priority: "high",
      dueDate,
      addToMyDay: { dayKey: DAY },
    });

    const { pageId } = await asMe.mutation(api.prostor.personalTasks.moveToStartup, {
      personalTaskId,
      workspaceId: workspace,
      areaId: area,
    });

    const page = await asMe.query(api.prostor.pages.get, { workspaceId: workspace, pageId });
    expect(page).toMatchObject({
      _id: pageId,
      workspaceId: workspace,
      areaId: area,
      parentPageId: null,
      kind: "task",
      title: "Ponuda za klijenta",
      taskStatus: "backlog",
      taskPriority: "high",
      dueDate,
      instructions: "Cena i rok isporuke.",
      assigneeProfileId: me.profileId,
      createdByProfileId: me.profileId,
    });

    const state = await t.run(async (ctx) => {
      const personal = await ctx.db.get("personalTasks", personalTaskId);
      const assignees = await ctx.db
        .query("taskAssignees")
        .withIndex("by_task_and_profile", (q) => q.eq("taskPageId", pageId))
        .collect();
      const entries = await ctx.db
        .query("myDayEntries")
        .withIndex("by_profile_day_position", (q) =>
          q.eq("profileId", me.profileId).eq("dayKey", DAY),
        )
        .collect();
      const notifications = await ctx.db.query("notifications").collect();
      return { personal, assignees, entries, notifications };
    });
    expect(state.personal).toMatchObject({ movedToPageId: pageId });
    expect(typeof state.personal?.archivedAt).toBe("number");
    expect(state.assignees).toEqual([
      expect.objectContaining({
        profileId: me.profileId,
        workspaceId: workspace,
        archivedAt: null,
        taskStatus: "backlog",
      }),
    ]);
    expect(state.entries).toEqual([
      expect.objectContaining({
        refKind: "task",
        taskPageId: pageId,
        personalTaskId: null,
        refKey: `task:${pageId}`,
      }),
    ]);
    // Sebi se ne šalje obaveštenje o dodeli.
    expect(state.notifications).toEqual([]);

    // Prebačen zadatak nestaje iz ličnih i ne može da se vrati.
    expect((await asMe.query(api.prostor.personalTasks.list, { status: "all" })).items).toEqual(
      [],
    );
    await expect(
      asMe.mutation(api.prostor.personalTasks.restore, { personalTaskId }),
    ).rejects.toThrow("Zadatak je prebačen u projekat i ne može da se vrati.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.moveToStartup, {
        personalTaskId,
        workspaceId: workspace,
        areaId: area,
      }),
    ).rejects.toThrow(NOT_FOUND);

    // Moj dan sada vidi stranicu umesto ličnog zadatka.
    const overview = await asMe.query(api.prostor.myDay.overview, { dayKey: DAY, doneSince: 0 });
    expect(overview.entries.map((entry) => entry.refKey)).toEqual([`task:${pageId}`]);
    expect(overview.tasks.map((task) => task._id)).toEqual([pageId]);
    expect(overview.personal).toEqual([]);
  });

  test("bez prioriteta i beleške: medium, bez instrukcija", async () => {
    const { asMe, workspace, area } = await seed();
    const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Kratko",
    });
    const { pageId } = await asMe.mutation(api.prostor.personalTasks.moveToStartup, {
      personalTaskId,
      workspaceId: workspace,
      areaId: area,
    });
    const page = await asMe.query(api.prostor.pages.get, { workspaceId: workspace, pageId });
    expect(page).toMatchObject({ taskPriority: "medium", dueDate: null });
    expect(page?.instructions).toBeUndefined();
  });

  test("startup bez članstva, oblast drugog startupa i završen zadatak se odbijaju", async () => {
    const { t, asMe, workspace, foreignStartup, foreignArea, area, memberships } =
      await seed();
    const personalTaskId = await asMe.mutation(api.prostor.personalTasks.create, {
      title: "Ostaje lični",
    });

    await expect(
      asMe.mutation(api.prostor.personalTasks.moveToStartup, {
        personalTaskId,
        workspaceId: foreignStartup,
        areaId: foreignArea,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      asMe.mutation(api.prostor.personalTasks.moveToStartup, {
        personalTaskId,
        workspaceId: workspace,
        areaId: foreignArea,
      }),
    ).rejects.toThrow("Oblast nije pronađena u ovom projektu.");

    const doneId = await asMe.mutation(api.prostor.personalTasks.create, { title: "Gotovo" });
    await asMe.mutation(api.prostor.personalTasks.setStatus, {
      personalTaskId: doneId,
      status: "done",
    });
    await expect(
      asMe.mutation(api.prostor.personalTasks.moveToStartup, {
        personalTaskId: doneId,
        workspaceId: workspace,
        areaId: area,
      }),
    ).rejects.toThrow("Završen zadatak se ne prebacuje u projekat.");

    // Posle uklanjanja iz tima ni sopstveni startup više ne prima zadatak.
    await t.run(async (ctx) => {
      await ukloniClanstvo(ctx, memberships.me);
    });
    await expect(
      asMe.mutation(api.prostor.personalTasks.moveToStartup, {
        personalTaskId,
        workspaceId: workspace,
        areaId: area,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");

    // Odbijen pokušaj ne dira lični zadatak i ne pravi stranicu.
    expect(
      await asMe.query(api.prostor.personalTasks.get, { personalTaskId }),
    ).toMatchObject({ status: "open" });
    const pages = await t.run(async (ctx) => await ctx.db.query("pages").collect());
    expect(pages).toEqual([]);
  });
});
