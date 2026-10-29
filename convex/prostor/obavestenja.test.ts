/// <reference types="vite/client" />
// SPAJANJE S06: dostava obaveštenja (web push, Expo) i podsetnici za rokove.
// Ništa ne izlazi napolje: `web-push` je zamenjen, a `fetch` baca ako ga iko pozove.

import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { createNotification } from "./lib/notifications";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const webpush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(async () => ({ statusCode: 201 })),
}));
vi.mock("web-push", () => ({ default: webpush }));

const modules = import.meta.glob("/convex/**/*.*s");
type Svet = TestConvex<typeof schema>;
const DAY_MS = 24 * 60 * 60 * 1000;

const fetchSpy = vi.fn(async () => {
  throw new Error("Test ne sme da zove spoljni servis.");
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", fetchSpy);
  webpush.setVapidDetails.mockClear();
  webpush.sendNotification.mockClear();
  fetchSpy.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Vlasnik i član jednog projekta; član ima jednu web pretplatu. */
async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const osoba = async (ime: string) => {
      const email = `${ime.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name: ime, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: ime,
        email,
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await osoba("Vlasnik");
    const member = await osoba("Clan");
    const workspace = await insertStartup(ctx, {
      name: "Obaveštenja",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await insertClanstvo(ctx, {
      workspaceId: workspace,
      profileId: member.profileId,
      archivedAt: null,
    });
    const subscription = await ctx.db.insert("pushSubscriptions", {
      profileId: member.profileId,
      endpoint: "https://push.example.test/pretplata-1",
      p256dh: "kljuc",
      auth: "tajna",
      failureCount: 0,
      lastSuccessAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const notificationId = await createNotification(ctx, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "task_assigned",
      title: "Dodeljen ti je zadatak",
      targetType: "page",
      targetId: null,
      actorProfileId: owner.profileId,
    });
    if (notificationId === null) throw new Error("seed: obaveštenje nije nastalo");
    return { owner, member, workspace, subscription, notificationId };
  });
  return { t, ...s };
}

describe("dostava obaveštenja", () => {
  test("createNotification zakazuje web i Expo dostavu; bez VAPID_* web push se tiho preskače", async () => {
    const s = await seed();
    const zakazano = await s.t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => f.name),
    );
    expect(zakazano.sort()).toEqual(["prostor/expoPush:deliver", "prostor/push:deliver"]);

    const rezultat = await s.t.action(internal.prostor.push.deliver, {
      notificationId: s.notificationId,
    });
    expect(rezultat).toEqual({
      sent: 0,
      removed: 0,
      skipped: "VAPID ključevi nisu postavljeni",
    });
    // I zakazani poslovi prolaze bez greške i bez slanja.
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(webpush.setVapidDetails).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("bez VAPID_SUBJECT se ne šalje (sve tri promenljive su obavezne)", async () => {
    const s = await seed();
    vi.stubEnv("VAPID_PUBLIC_KEY", "javni-test");
    vi.stubEnv("VAPID_PRIVATE_KEY", "privatni-test");
    const rezultat = await s.t.action(internal.prostor.push.deliver, {
      notificationId: s.notificationId,
    });
    expect(rezultat.skipped).toBe("VAPID ključevi nisu postavljeni");
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test("sa sve tri VAPID promenljive dostava ide kroz web-push (zamenjen u testu)", async () => {
    const s = await seed();
    vi.stubEnv("VAPID_PUBLIC_KEY", "javni-test");
    vi.stubEnv("VAPID_PRIVATE_KEY", "privatni-test");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.test");
    const rezultat = await s.t.action(internal.prostor.push.deliver, {
      notificationId: s.notificationId,
    });
    expect(rezultat).toEqual({ sent: 1, removed: 0, skipped: null });
    expect(webpush.setVapidDetails).toHaveBeenCalledWith(
      "mailto:test@example.test",
      "javni-test",
      "privatni-test",
    );
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const [pretplata, poruka] = webpush.sendNotification.mock.calls[0] as unknown as [
      { endpoint: string },
      string,
    ];
    expect(pretplata.endpoint).toBe("https://push.example.test/pretplata-1");
    expect(JSON.parse(poruka)).toMatchObject({
      title: "Dodeljen ti je zadatak",
      workspaceId: s.workspace,
      notificationId: s.notificationId,
    });
    const red = await s.t.run((ctx) => ctx.db.get("pushSubscriptions", s.subscription));
    expect(red?.lastSuccessAt).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("Expo push spava: bez tokena ne šalje ništa, ni probno slanje", async () => {
    const s = await seed();
    const rezultat = await s.t.action(internal.prostor.expoPush.deliver, {
      notificationId: s.notificationId,
    });
    expect(rezultat.skipped).toBe("nema pretplaćenih uređaja");
    expect(rezultat.sent).toBe(0);
    const proba = await s.t.action(internal.prostor.pushTest.sendTest, {
      profileId: s.member.profileId,
    });
    expect(proba.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("podsetnici za rokove (cron, plan S01 D11)", () => {
  /** Projekat sa oblašću; vlasnik je `owner`. */
  async function projekat(
    t: Svet,
    ownerProfileId: Id<"profiles">,
    ime: string,
  ) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const workspace = await insertStartup(ctx, {
        name: ime,
        description: "",
        createdByProfileId: ownerProfileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const area = await ctx.db.insert("areas", {
        workspaceId: workspace,
        key: "rokovi",
        label: "Rokovi",
        position: 0,
        createdAt: now,
      });
      return { workspace, area };
    });
  }

  async function vlasnik(t: Svet) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", { name: "Vlasnik", email: "v@example.test" });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: "Vlasnik",
        email: "v@example.test",
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    });
  }

  /** Nedodeljen zadatak sa rokom pre tri dana: podsetnik ide onome ko ga je otvorio. */
  async function zadatak(
    t: Svet,
    userId: Id<"users">,
    p: { workspace: Id<"workspaces">; area: Id<"areas"> },
    title: string,
  ) {
    return (await t
      .withIdentity({ subject: `${userId}|sesija-test` })
      .mutation(api.prostor.pages.create, {
        workspaceId: p.workspace,
        areaId: p.area,
        parentPageId: null,
        kind: "task",
        title,
        dueDate: Date.now() - 3 * DAY_MS,
      })) as Id<"pages">;
  }

  const podsetnici = (t: Svet, profileId: Id<"profiles">) =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
            q.eq("recipientProfileId", profileId),
          )
          .collect()
      ).filter((row) => row.type === "task_overdue"),
    );

  test("150 zadataka sa rokom dobija podsetnik i niko nije odsečen", async () => {
    const t = convexTest(schema, modules);
    const ja = await vlasnik(t);
    const p = await projekat(t, ja.profileId, "Mnogo rokova");
    const zadaci = new Set<string>();
    for (let i = 0; i < 150; i++) {
      zadaci.add(await zadatak(t, ja.userId, p, `Zadatak ${i + 1}`));
    }

    const prvi = await t.mutation(internal.prostor.notifications.remindDueTasks, {});
    expect(prvi.zakazano).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const redovi = await podsetnici(t, ja.profileId);
    expect(redovi).toHaveLength(150);
    expect(new Set(redovi.map((r) => r.targetId))).toEqual(zadaci);

    // Drugi prolaz ne pravi duplikate (dedupe ključ nosi dan roka).
    await t.mutation(internal.prostor.notifications.remindDueTasks, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await podsetnici(t, ja.profileId)).toHaveLength(150);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("prolazi kroz više od 50 projekata; arhiviran projekat se preskače", async () => {
    const t = convexTest(schema, modules);
    const ja = await vlasnik(t);
    const ocekivano = new Set<string>();
    for (let i = 0; i < 52; i++) {
      const p = await projekat(t, ja.profileId, `Projekat ${i + 1}`);
      ocekivano.add(await zadatak(t, ja.userId, p, `Rok ${i + 1}`));
    }
    const arhiviran = await projekat(t, ja.profileId, "Arhiviran");
    const zaboravljen = await zadatak(t, ja.userId, arhiviran, "U arhivi");
    await t.run((ctx) => ctx.db.patch("workspaces", arhiviran.workspace, { arhiviran: true }));

    await t.mutation(internal.prostor.notifications.remindDueTasks, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const redovi = await podsetnici(t, ja.profileId);
    expect(new Set(redovi.map((r) => r.targetId))).toEqual(ocekivano);
    expect(redovi.some((r) => r.targetId === zaboravljen)).toBe(false);
  });
});
