/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/expoPush.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import {
  belgradeMinutesOfDay,
  createNotification,
  isWithinQuietHours,
  type NotificationType,
} from "./lib/notifications";
import { CHANNEL_VERSION, resolveChannel } from "./lib/notificationChannels";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const mkPerson = async (name: string) => {
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

    const owner = await mkPerson("Owner");
    const member = await mkPerson("Member");
    const workspace = await insertStartup(ctx, {
      name: "Push startup",
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
    return { owner, member, workspace };
  });

  const asMember = t.withIdentity({ subject: `${ids.member.userId}|sesija-test` });
  return { t, asMember, ...ids };
}

type SeedCtx = Awaited<ReturnType<typeof seed>>["t"];

function insertToken(
  t: SeedCtx,
  profileId: Id<"profiles">,
  overrides: {
    token: string;
    platform?: "ios" | "android";
    channelVersion?: number;
    failureCount?: number;
  },
) {
  const now = Date.now();
  return t.run((ctx) =>
    ctx.db.insert("expoPushTokens", {
      profileId,
      token: overrides.token,
      platform: overrides.platform ?? "ios",
      deviceName: null,
      appVersion: "1.0.0",
      channelVersion: overrides.channelVersion ?? 1,
      lastSeenAt: now,
      failureCount: overrides.failureCount ?? 0,
      createdAt: now,
    }),
  );
}

/**
 * Podešavanja obaveštenja su PO PROFILU (`notificationSettings`), ne po tokenu —
 * pa se u testovima seje jednom po korisniku i važe za sve njegove uređaje.
 */
function setSettings(
  t: SeedCtx,
  profileId: Id<"profiles">,
  settings: {
    mutedTypes?: Array<NotificationType>;
    quietHoursStart?: number | null;
    quietHoursEnd?: number | null;
  },
) {
  return t.run((ctx) =>
    ctx.db.insert("notificationSettings", {
      profileId,
      mutedTypes: settings.mutedTypes ?? [],
      quietHoursStart: settings.quietHoursStart ?? null,
      quietHoursEnd: settings.quietHoursEnd ?? null,
      updatedAt: Date.now(),
    }),
  );
}

function insertNotification(
  t: SeedCtx,
  args: {
    recipientProfileId: Id<"profiles">;
    workspaceId: Id<"workspaces">;
    type: NotificationType;
  },
) {
  return t.run((ctx) =>
    ctx.db.insert("notifications", {
      recipientProfileId: args.recipientProfileId,
      workspaceId: args.workspaceId,
      type: args.type,
      title: "Naslov",
      targetType: "chat",
      targetId: null,
      actorProfileId: null,
      dedupeKey: null,
      readAt: null,
      createdAt: Date.now(),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("quiet-hours pomoćnici", () => {
  test("isWithinQuietHours rukuje prelaskom preko ponoći i praznim prozorom", () => {
    // 22:00–08:00 (prelazi ponoć)
    expect(isWithinQuietHours(1320, 480, 1380)).toBe(true); // 23:00
    expect(isWithinQuietHours(1320, 480, 60)).toBe(true); // 01:00
    expect(isWithinQuietHours(1320, 480, 600)).toBe(false); // 10:00
    // 09:00–17:00 (isti dan)
    expect(isWithinQuietHours(540, 1020, 600)).toBe(true);
    expect(isWithinQuietHours(540, 1020, 1200)).toBe(false);
    // null granice ili prazan prozor = neaktivno
    expect(isWithinQuietHours(null, 480, 60)).toBe(false);
    expect(isWithinQuietHours(480, 480, 480)).toBe(false);
  });

  test("belgradeMinutesOfDay je u opsegu 0–1439", () => {
    const minute = belgradeMinutesOfDay(Date.now());
    expect(minute).toBeGreaterThanOrEqual(0);
    expect(minute).toBeLessThan(1440);
  });
});

describe("resolveChannel katalog", () => {
  test("override: request_resolved i task_due_soon su `active` i ne probijaju tihe sate", () => {
    const resolved = resolveChannel("request_resolved", CHANNEL_VERSION);
    expect(resolved.interruptionLevel).toBe("active");
    expect(resolved.breaksQuietHours).toBe(false);
    // I dalje deli `vote` kanal/zvuk sa vote_requested.
    expect(resolved.soundBase).toBe("vote");
    expect(resolved.channelId).toBe(`vote_v${CHANNEL_VERSION}`);

    const dueSoon = resolveChannel("task_due_soon", CHANNEL_VERSION);
    expect(dueSoon.interruptionLevel).toBe("active");
    expect(dueSoon.breaksQuietHours).toBe(false);
    expect(dueSoon.soundBase).toBe("deadline");
  });

  test("tipovi bez override-a zadržavaju timeSensitive + probijanje tihih sati", () => {
    for (const type of [
      "chat_mention",
      "task_due_today",
      "task_overdue",
      "vote_requested",
    ] as const) {
      const r = resolveChannel(type, CHANNEL_VERSION);
      expect(r.interruptionLevel).toBe("timeSensitive");
      expect(r.breaksQuietHours).toBe(true);
    }
  });

  test("kanalska poruka ima zvuk i `active` nivo na iOS-u (paritet sa Androidom)", () => {
    const r = resolveChannel("chat_message", CHANNEL_VERSION);
    expect(r.interruptionLevel).toBe("active");
    expect(r.soundBase).toBe("channel");
    expect(r.importance).toBe("default");
  });
});

describe("registracija tokena", () => {
  test("save radi upsert po tokenu; remove briše samo svoj token", async () => {
    const { t, asMember } = await seed();
    const first = await asMember.mutation(api.prostor.expoPushTokens.save, {
      token: "ExponentPushToken[a]",
      platform: "ios",
      deviceName: "iPhone",
      appVersion: "1.0.0",
      channelVersion: 1,
    });
    const second = await asMember.mutation(api.prostor.expoPushTokens.save, {
      token: "ExponentPushToken[a]",
      platform: "ios",
      deviceName: "iPhone 15",
      appVersion: "1.1.0",
      channelVersion: 1,
    });
    expect(first).toBe(second);

    const rows = await t.run((ctx) =>
      ctx.db.query("expoPushTokens").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].deviceName).toBe("iPhone 15");
    expect(rows[0].appVersion).toBe("1.1.0");

    await asMember.mutation(api.prostor.expoPushTokens.remove, {
      token: "ExponentPushToken[a]",
    });
    expect(
      (await t.run((ctx) => ctx.db.query("expoPushTokens").collect())).length,
    ).toBe(0);
  });

  test("save NE dira podešavanja — ona žive po profilu, ne po tokenu", async () => {
    const { t, asMember, member } = await seed();
    await setSettings(t, member.profileId, {
      mutedTypes: ["chat_message"],
      quietHoursStart: 1320,
      quietHoursEnd: 480,
    });

    // Prijava uređaja ne sme da resetuje korisnikova podešavanja.
    await asMember.mutation(api.prostor.expoPushTokens.save, {
      token: "ExponentPushToken[ios]",
      platform: "ios",
      deviceName: "novo ime",
      appVersion: "2.0.0",
      channelVersion: 1,
    });

    const settings = await asMember.query(api.prostor.notificationSettings.get, {});
    expect(settings.mutedTypes).toContain("chat_message");
    expect(settings.quietHoursStart).toBe(1320);
    expect(settings.quietHoursEnd).toBe(480);
    // Token ne nosi kopiju podešavanja.
    const rows = await t.run((ctx) =>
      ctx.db.query("notificationSettings").collect(),
    );
    expect(rows).toHaveLength(1);
  });
});

describe("notificationSettings", () => {
  test("update upsertuje jedan red po profilu i dedupuje tipove", async () => {
    const { t, asMember } = await seed();
    await asMember.mutation(api.prostor.notificationSettings.update, {
      mutedTypes: ["chat_message", "chat_message", "idea_voted"],
      quietHoursStart: 1320,
      quietHoursEnd: 480,
    });
    // Drugi poziv menja isti red, ne pravi novi.
    await asMember.mutation(api.prostor.notificationSettings.update, {
      mutedTypes: ["puls_ready"],
      quietHoursStart: null,
      quietHoursEnd: null,
    });

    const rows = await t.run((ctx) =>
      ctx.db.query("notificationSettings").collect(),
    );
    expect(rows).toHaveLength(1);

    const settings = await asMember.query(api.prostor.notificationSettings.get, {});
    expect(settings.mutedTypes).toEqual(["puls_ready"]);
    expect(settings.quietHoursStart).toBeNull();
    expect(settings.quietHoursEnd).toBeNull();
  });

  test("get vraća podrazumevano stanje kad red ne postoji", async () => {
    const { asMember } = await seed();
    const settings = await asMember.query(api.prostor.notificationSettings.get, {});
    expect(settings.mutedTypes).toEqual([]);
    expect(settings.quietHoursStart).toBeNull();
    expect(settings.quietHoursEnd).toBeNull();
  });

  test("update odbija nepotpun prozor tihih sati", async () => {
    const { asMember } = await seed();
    await expect(
      asMember.mutation(api.prostor.notificationSettings.update, {
        mutedTypes: [],
        quietHoursStart: 1320,
        quietHoursEnd: null,
      }),
    ).rejects.toThrow();
  });
});

describe("recordDeliveryResults", () => {
  test("gone briše, failed se gomila do praga, sent resetuje", async () => {
    const { t, member } = await seed();
    const goneId = await insertToken(t, member.profileId, { token: "gone" });
    const flakyId = await insertToken(t, member.profileId, { token: "flaky" });
    const healingId = await insertToken(t, member.profileId, {
      token: "healing",
      failureCount: 3,
    });

    await t.mutation(internal.prostor.expoPushTokens.recordDeliveryResults, {
      results: [
        { tokenId: goneId, outcome: "gone" },
        { tokenId: flakyId, outcome: "failed" },
        { tokenId: healingId, outcome: "sent" },
      ],
    });

    const afterFirst = await t.run((ctx) =>
      ctx.db.query("expoPushTokens").collect(),
    );
    expect(afterFirst.find((r) => r.token === "gone")).toBeUndefined();
    expect(afterFirst.find((r) => r.token === "flaky")?.failureCount).toBe(1);
    expect(afterFirst.find((r) => r.token === "healing")?.failureCount).toBe(0);

    // Peti neuspeh gasi token.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await t.mutation(internal.prostor.expoPushTokens.recordDeliveryResults, {
        results: [{ tokenId: flakyId, outcome: "failed" }],
      });
    }
    const flaky = await t.run((ctx) =>
      ctx.db
        .query("expoPushTokens")
        .withIndex("by_token", (q) => q.eq("token", "flaky"))
        .unique(),
    );
    expect(flaky).toBeNull();
  });
});

describe("expoPush.deliver", () => {
  test("preskače utišan tip, bez mrežnog poziva", async () => {
    const { t, member, workspace } = await seed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await insertToken(t, member.profileId, { token: "tok" });
    await setSettings(t, member.profileId, { mutedTypes: ["chat_message"] });
    const notificationId = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_message",
    });

    const result = await t.action(internal.prostor.expoPush.deliver, {
      notificationId,
    });
    expect(result.skipped).toBe("utišan tip");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("poštuje tihe sate, ali ih probojni tipovi preskaču", async () => {
    const { t, member, workspace } = await seed();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ status: "ok", id: "r1" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Prozor koji sigurno obuhvata trenutni minut (uz bafer preko ponoći).
    const nowMinute = belgradeMinutesOfDay(Date.now());
    const quietStart = (nowMinute + 1439) % 1440;
    const quietEnd = (nowMinute + 2) % 1440;
    await insertToken(t, member.profileId, { token: "tok" });
    await setSettings(t, member.profileId, {
      quietHoursStart: quietStart,
      quietHoursEnd: quietEnd,
    });

    // chat_message nije probojan → tihi sati ga zaustave.
    const quietNotification = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_message",
    });
    const quietResult = await t.action(internal.prostor.expoPush.deliver, {
      notificationId: quietNotification,
    });
    expect(quietResult.sent).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();

    // chat_mention JESTE probojan → prolazi kroz tihe sate.
    const mentionNotification = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_mention",
    });
    const mentionResult = await t.action(internal.prostor.expoPush.deliver, {
      notificationId: mentionNotification,
    });
    expect(mentionResult.sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("uspeh šalje, DeviceNotRegistered briše mrtav token", async () => {
    const { t, member, workspace } = await seed();
    // Redosled odgovara redosledu upisa (by_profileId → _creationTime).
    await insertToken(t, member.profileId, { token: "live" });
    await insertToken(t, member.profileId, { token: "dead" });

    const fetchMock = vi.fn(async () =>
      jsonResponse({
        data: [
          { status: "ok", id: "1" },
          {
            status: "error",
            message: "not registered",
            details: { error: "DeviceNotRegistered" },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const notificationId = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_dm",
    });
    const result = await t.action(internal.prostor.expoPush.deliver, {
      notificationId,
    });

    expect(result.sent).toBe(1);
    expect(result.removed).toBe(1);
    const rows = await t.run((ctx) =>
      ctx.db.query("expoPushTokens").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe("live");
  });

  test("HTTP 429 ne broji kao kvar tokena", async () => {
    const { t, member, workspace } = await seed();
    await insertToken(t, member.profileId, { token: "tok" });
    const fetchMock = vi.fn(async () => new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    const notificationId = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_dm",
    });
    const result = await t.action(internal.prostor.expoPush.deliver, {
      notificationId,
    });

    expect(result.sent).toBe(0);
    expect(result.rateLimited).toBe(1);
    const rows = await t.run((ctx) =>
      ctx.db.query("expoPushTokens").collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].failureCount).toBe(0);
  });

  test("bez tokena se tiho preskoči", async () => {
    const { t, member, workspace } = await seed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const notificationId = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_dm",
    });
    const result = await t.action(internal.prostor.expoPush.deliver, {
      notificationId,
    });
    expect(result.skipped).toBe("nema pretplaćenih uređaja");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("iOS payload nosi .wav zvuk i tačan interruptionLevel", async () => {
    const { t, member, workspace } = await seed();
    let sent: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string);
      return jsonResponse({ data: [{ status: "ok", id: "r1" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await insertToken(t, member.profileId, { token: "tok", platform: "ios" });
    const notificationId = await insertNotification(t, {
      recipientProfileId: member.profileId,
      workspaceId: workspace,
      type: "chat_message",
    });
    const result = await t.action(internal.prostor.expoPush.deliver, {
      notificationId,
    });

    expect(result.sent).toBe(1);
    // `.wav` (ne `.caf`), zvuk kanala `channel`, i `active` (paritet sa Androidom).
    expect(sent[0].sound).toBe("channel.wav");
    expect(sent[0].interruptionLevel).toBe("active");
    // iOS ne šalje channelId — zvuk stiže kroz payload, ne kroz OS kanal.
    expect(sent[0].channelId).toBeUndefined();
  });

  test("komentari: pominjanje zvoni kao @ i probija tihe sate, komentar kao poruka u kanalu i ne probija", async () => {
    // PROSTOR P5: novi tipovi koriste POSTOJEĆE kanale i zvukove (bez novih ID-jeva).
    const { t, member, workspace } = await seed();
    const sent: Array<Array<Record<string, unknown>>> = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(init.body as string));
      return jsonResponse({ data: [{ status: "ok", id: "r1" }] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const nowMinute = belgradeMinutesOfDay(Date.now());
    await insertToken(t, member.profileId, { token: "tok", platform: "ios" });
    await setSettings(t, member.profileId, {
      quietHoursStart: (nowMinute + 1439) % 1440,
      quietHoursEnd: (nowMinute + 2) % 1440,
    });

    const added = await t.action(internal.prostor.expoPush.deliver, {
      notificationId: await insertNotification(t, {
        recipientProfileId: member.profileId,
        workspaceId: workspace,
        type: "comment_added",
      }),
    });
    expect(added.sent).toBe(0); // tihi sati
    expect(fetchMock).not.toHaveBeenCalled();

    const mention = await t.action(internal.prostor.expoPush.deliver, {
      notificationId: await insertNotification(t, {
        recipientProfileId: member.profileId,
        workspaceId: workspace,
        type: "comment_mention",
      }),
    });
    expect(mention.sent).toBe(1);
    expect(sent[0][0].sound).toBe("mention.wav");
    expect(sent[0][0].interruptionLevel).toBe("timeSensitive");

    expect(resolveChannel("comment_added", CHANNEL_VERSION)).toMatchObject({
      channelId: `channel_v${CHANNEL_VERSION}`,
      soundBase: "channel",
      breaksQuietHours: false,
    });
    expect(resolveChannel("comment_mention", CHANNEL_VERSION)).toMatchObject({
      channelId: `mention_v${CHANNEL_VERSION}`,
      soundBase: "mention",
      breaksQuietHours: true,
    });
  });

  test("komentari: utišan tip se preskače bez mrežnog poziva", async () => {
    const { t, member, workspace } = await seed();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await insertToken(t, member.profileId, { token: "tok" });
    await setSettings(t, member.profileId, {
      mutedTypes: ["comment_added", "comment_mention"],
    });
    for (const type of ["comment_added", "comment_mention"] as const) {
      const result = await t.action(internal.prostor.expoPush.deliver, {
        notificationId: await insertNotification(t, {
          recipientProfileId: member.profileId,
          workspaceId: workspace,
          type,
        }),
      });
      expect(result.skipped).toBe("utišan tip");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("request_resolved i task_due_soon ne probijaju tihe sate", async () => {
    const { t, member, workspace } = await seed();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [{ status: "ok", id: "r1" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    // Prozor koji sigurno obuhvata trenutni minut (uz bafer preko ponoći).
    const nowMinute = belgradeMinutesOfDay(Date.now());
    const quietStart = (nowMinute + 1439) % 1440;
    const quietEnd = (nowMinute + 2) % 1440;
    await insertToken(t, member.profileId, { token: "tok" });
    await setSettings(t, member.profileId, {
      quietHoursStart: quietStart,
      quietHoursEnd: quietEnd,
    });

    for (const type of ["request_resolved", "task_due_soon"] as const) {
      const notificationId = await insertNotification(t, {
        recipientProfileId: member.profileId,
        workspaceId: workspace,
        type,
      });
      const result = await t.action(internal.prostor.expoPush.deliver, {
        notificationId,
      });
      expect(result.sent).toBe(0);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("paralelna dostava", () => {
  test("createNotification zakazuje i web (push) i Expo (expoPush)", async () => {
    const { t, owner, member, workspace } = await seed();

    await t.run(async (ctx) => {
      await createNotification(ctx, {
        recipientProfileId: member.profileId,
        workspaceId: workspace,
        type: "chat_dm",
        title: "Hej",
        targetType: "chat",
        targetId: null,
        actorProfileId: owner.profileId,
      });
    });

    const scheduled = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );
    const names = scheduled.map((f) => f.name);
    expect(scheduled).toHaveLength(2);
    // Obe grane zakazane iz iste tačke — web push netaknut, Expo dodat pored.
    expect(names.some((n) => n.includes("expoPush"))).toBe(true);
    expect(
      names.some((n) => n.includes("push") && !n.includes("expoPush")),
    ).toBe(true);
  });
});
