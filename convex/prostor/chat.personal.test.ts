/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/chat.personal.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { createNotification } from "./lib/notifications";
import { INBOX_MARK_ALL_BATCH } from "./lib/validators";
import schema from "../schema";
import {
  insertClanstvo,
  insertProfil,
  insertStartup,
  ukloniClanstvo,
} from "./testSvet.pomoc";

// Globalni chat (K06, plan K01 §3): lični DM i grupe sa `startupId: null`,
// hub svih razgovora, nepročitano po opsegu i lična obaveštenja. Postojeći
// chat u startupima pokriva `chat.test.ts` (bez izmena očekivanja).

const modules = import.meta.glob("/convex/**/*.*s");

const NO_CURSOR = { numItems: 50, cursor: null };
const BASE = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Ljudi: Jovan (vlasnik platforme), Ana, Marko, Vesna (deli projekat A sa
 * Jovanom), Stranac (aktivan, ali nema nijedan projekat — P9 ga ne pušta u
 * lične razgovore ni grupe), Bivši (arhiviran profil). Projekti: A „Cluck
 * Rush" (Jovan, Ana, Marko, Vesna), B „Scan Me" (Jovan, Ana), C „Tuđi" (Ana,
 * Marko — Jovan nije član), D „Napušten" (Ana + Jovanovo uklonjeno članstvo).
 * Svaki projekat ima opšti kanal.
 *
 * SPAJANJE P9: nov lični razgovor / nov član lične grupe traži bar jedan
 * zajednički projekat (obojica `owner`/`urednik`), pa je Vesna u A — inače bi
 * svaki test koji je dodaje pao na „Sa ovom osobom ne deliš nijedan projekat.".
 */
async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      role: "admin" | "member" = "member",
      archived = false,
    ) => {
      const email = `${name.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email,
        role,
        archivedAt: archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const jovan = await person("Jovan", "admin");
    const ana = await person("Ana");
    const marko = await person("Marko");
    const vesna = await person("Vesna");
    const stranac = await person("Stranac");
    const bivsi = await person("Bivši", "member", true);

    const workspace = async (
      name: string,
      members: Array<{ profileId: Id<"profiles">; archived?: boolean }>,
    ) => {
      const workspaceId = await insertStartup(ctx, {
        name,
        description: "",
        createdByProfileId: members[0].profileId,
        archivedAt: null,
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
      const general = await ctx.db.insert("chatChannels", {
        workspaceId,
        kind: "startup",
        areaId: null,
        anchorType: null,
        anchorId: null,
        dmKey: null,
        name: "Opšte",
        isPrivate: false,
        lastMessageAt: now,
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: members[0].profileId,
        archivedAt: null,
        createdAt: now,
      });
      return { workspaceId, general };
    };

    return {
      jovan,
      ana,
      marko,
      vesna,
      stranac,
      bivsi,
      a: await workspace("Cluck Rush", [jovan, ana, marko, vesna]),
      b: await workspace("Scan Me", [jovan, ana]),
      c: await workspace("Tuđi", [ana, marko]),
      d: await workspace("Napušten", [
        ana,
        { profileId: jovan.profileId, archived: true },
      ]),
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...seeded,
    asJovan: as(seeded.jovan),
    asAna: as(seeded.ana),
    asMarko: as(seeded.marko),
    asVesna: as(seeded.vesna),
    asStranac: as(seeded.stranac),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;
type Caller = Seeded["asJovan"];

function messageIdOf(
  result:
    | { ok: true; messageId: Id<"chatMessages"> }
    | { ok: false; reason: string; message: string },
): Id<"chatMessages"> {
  if (!result.ok) throw new Error(`Poruka nije poslata: ${result.message}`);
  return result.messageId;
}

async function send(
  caller: Caller,
  channelId: Id<"chatChannels">,
  body: string,
  mentions?: Array<Id<"profiles">>,
) {
  return messageIdOf(
    await caller.mutation(api.prostor.chat.sendMessage, {
      channelId,
      body,
      ...(mentions === undefined ? {} : { mentions }),
    }),
  );
}

function notificationsFor(s: Seeded, profileId: Id<"profiles">) {
  return s.t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_createdAt", (q) =>
        q.eq("recipientProfileId", profileId),
      )
      .collect(),
  );
}

function readFor(
  s: Seeded,
  channelId: Id<"chatChannels">,
  profileId: Id<"profiles">,
) {
  return s.t.run((ctx) =>
    ctx.db
      .query("chatReads")
      .withIndex("by_channel_and_profile", (q) =>
        q.eq("channelId", channelId).eq("profileId", profileId),
      )
      .unique(),
  );
}

function membershipRows(s: Seeded, channelId: Id<"chatChannels">) {
  return s.t.run((ctx) =>
    ctx.db
      .query("chatMembers")
      .withIndex("by_channel_and_profile", (q) => q.eq("channelId", channelId))
      .collect(),
  );
}

function scheduledNames(s: Seeded) {
  return s.t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).map(
      (entry) => entry.name,
    ),
  );
}

/** Grupa „Tim": Jovan vlasnik + zadati članovi. */
function makeGroup(s: Seeded, members: Array<Id<"profiles">>, name = "Tim") {
  return s.asJovan.mutation(api.prostor.chat.createPersonalGroup, {
    name,
    memberProfileIds: members,
  });
}

describe("lični DM", () => {
  test("openPersonalDm je idempotentan, van startupa i odvojen od DM-a u startupu", async () => {
    const s = await seed();
    const dm1 = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const dm2 = await s.asAna.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.jovan.profileId,
    });
    const dm3 = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    expect(dm2).toBe(dm1);
    expect(dm3).toBe(dm1);

    const channel = await s.t.run((ctx) => ctx.db.get("chatChannels", dm1));
    expect(channel).toMatchObject({
      workspaceId: null,
      kind: "dm",
      isPrivate: true,
      dmKey: [s.jovan.profileId, s.ana.profileId].sort().join(":"),
      archivedAt: null,
    });
    const members = await membershipRows(s, dm1);
    expect(members.map((m) => m.profileId).sort()).toEqual(
      [s.jovan.profileId, s.ana.profileId].sort(),
    );
    expect(members.every((m) => m.workspaceId === null && m.leftAt === null)).toBe(
      true,
    );

    // O2: DM u startupu ostaje zaseban kanal.
    const startupDm = await s.asJovan.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.a.workspaceId,
      otherProfileId: s.ana.profileId,
    });
    expect(startupDm).not.toBe(dm1);
  });

  test("sebi, arhiviranom profilu i bez prijave se odbija", async () => {
    const s = await seed();
    await expect(
      s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
        otherProfileId: s.jovan.profileId,
      }),
    ).rejects.toThrow("Ne možeš otvoriti razgovor sa samim sobom.");
    await expect(
      s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
        otherProfileId: s.bivsi.profileId,
      }),
    ).rejects.toThrow("Član tima nije pronađen.");
    await expect(
      s.t.mutation(api.prostor.chat.openPersonalDm, { otherProfileId: s.ana.profileId }),
    ).rejects.toThrow("Niste prijavljeni.");
  });

  // Devotion: „radi i bez zajedničkog startupa (instanca je jedan tim)". Enigma
  // ima klijentske projekte, pa P9 traži zajednički projekat za nov razgovor.
  test("P9: bez zajedničkog projekta se razgovor ne otvara, sa zajedničkim radi", async () => {
    const s = await seed();
    const noShared = "Sa ovom osobom ne deliš nijedan projekat.";

    // Stranac je aktivan profil, ali ne deli nijedan projekat ni sa kim.
    await expect(
      s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
        otherProfileId: s.stranac.profileId,
      }),
    ).rejects.toThrow(noShared);
    await expect(
      s.asStranac.mutation(api.prostor.chat.openPersonalDm, {
        otherProfileId: s.jovan.profileId,
      }),
    ).rejects.toThrow(noShared);
    await expect(makeGroup(s, [s.ana.profileId, s.stranac.profileId])).rejects.toThrow(
      noShared,
    );
    // Ni novi član postojeće grupe ne sme da bude neko ko ne deli projekat.
    const groupId = await makeGroup(s, [s.ana.profileId]);
    await expect(
      s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
        channelId: groupId,
        memberProfileIds: [s.ana.profileId, s.stranac.profileId],
      }),
    ).rejects.toThrow(noShared);
    // Odbijanja ne ostavljaju trag: jedini lični kanal je grupa, a u njoj su
    // samo Jovan i Ana.
    const personalChannels = () =>
      s.t.run(async (ctx) =>
        (await ctx.db.query("chatChannels").collect()).filter(
          (channel) => channel.workspaceId === null,
        ),
      );
    expect((await personalChannels()).map((channel) => channel._id)).toEqual([groupId]);
    expect(
      (await membershipRows(s, groupId))
        .filter((m) => m.leftAt === null)
        .map((m) => m.profileId)
        .sort(),
    ).toEqual([s.jovan.profileId, s.ana.profileId].sort());

    // Vesna deli projekat A sa Jovanom: razgovor radi kao i pre P9.
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.vesna.profileId,
    });
    await send(s.asVesna, dm, "Zdravo Jovane");
    const page = await s.asJovan.query(api.prostor.chat.messages, {
      channelId: dm,
      paginationOpts: NO_CURSOR,
    });
    expect(page.page.map((m) => m.body)).toEqual(["Zdravo Jovane"]);
    expect(page.page[0].workspaceId).toBeNull();

    // P9 kapija je samo na otvaranju/dodavanju: kad Vesna napusti projekat A,
    // postojeći razgovor i dalje radi kroz članstvo u kanalu, a nov se ne otvara.
    await s.t.run(async (ctx) => {
      const row = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", s.vesna.userId).eq("workspaceId", s.a.workspaceId),
        )
        .unique();
      await ukloniClanstvo(ctx, row?._id ?? null);
    });
    await send(s.asVesna, dm, "Još sam tu");
    const after = await s.asJovan.query(api.prostor.chat.messages, {
      channelId: dm,
      paginationOpts: NO_CURSOR,
    });
    expect(after.page.map((m) => m.body).sort()).toEqual(["Još sam tu", "Zdravo Jovane"]);
    await expect(
      s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
        otherProfileId: s.vesna.profileId,
      }),
    ).rejects.toThrow(noShared);
  });
});

describe("lična grupa", () => {
  test("pravljenje: vlasnik, članovi, sistemska poruka bez obaveštenja", async () => {
    const s = await seed();
    const groupId = await makeGroup(
      s,
      [s.ana.profileId, s.vesna.profileId, s.ana.profileId],
      "  Vikend  ",
    );
    const channel = await s.t.run((ctx) => ctx.db.get("chatChannels", groupId));
    expect(channel).toMatchObject({
      workspaceId: null,
      kind: "custom",
      isPrivate: true,
      name: "Vikend",
    });
    const members = await membershipRows(s, groupId);
    expect(
      Object.fromEntries(members.map((m) => [m.profileId, m.role])),
    ).toEqual({
      [s.jovan.profileId]: "owner",
      [s.ana.profileId]: "member",
      [s.vesna.profileId]: "member",
    });

    const page = await s.asAna.query(api.prostor.chat.messages, {
      channelId: groupId,
      paginationOpts: NO_CURSOR,
    });
    expect(page.page.map((m) => [m.kind, m.body])).toEqual([
      ["system", "Jovan je napravio/la grupu"],
    ]);
    expect(await notificationsFor(s, s.ana.profileId)).toHaveLength(0);
    expect(await readFor(s, groupId, s.ana.profileId)).toBeNull();
  });

  test("granice: ime, bar jedan član, najviše 50, arhiviran profil", async () => {
    const s = await seed();
    await expect(makeGroup(s, [s.ana.profileId], "   ")).rejects.toThrow(
      "Naziv grupe je obavezno polje.",
    );
    await expect(makeGroup(s, [])).rejects.toThrow(
      "Grupi treba bar još jedan član.",
    );
    await expect(makeGroup(s, [s.jovan.profileId])).rejects.toThrow(
      "Grupi treba bar još jedan član.",
    );
    await expect(makeGroup(s, [s.bivsi.profileId])).rejects.toThrow(
      "Član tima nije pronađen.",
    );

    const extra = await s.t.run(async (ctx) => {
      const ids: Array<Id<"profiles">> = [];
      for (let index = 0; index < 50; index += 1) {
        const userId = await ctx.db.insert("users", { name: `p${index}` });
        const profileId = await insertProfil(ctx, {
          userId,
          displayName: `Osoba ${index}`,
          email: `p${index}@example.test`,
          role: "member",
          archivedAt: null,
          createdAt: BASE,
          updatedAt: BASE,
        });
        // P9: svi su u projektu A sa Jovanom, inače grupa od 50 ne bi prošla.
        await insertClanstvo(ctx, {
          workspaceId: s.a.workspaceId,
          profileId,
          archivedAt: null,
        });
        ids.push(profileId);
      }
      return ids;
    });
    await expect(makeGroup(s, extra)).rejects.toThrow(
      "Grupa može imati najviše 50 članova.",
    );
    const full = await makeGroup(s, extra.slice(0, 49));
    expect(
      (await membershipRows(s, full)).filter((m) => m.leftAt === null),
    ).toHaveLength(50);
  });

  test("updatePersonalGroup: ime, dodaj, ukloni, oživi; Poništi vraća staro", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId, s.marko.profileId]);
    await send(s.asJovan, groupId, "pre izmene");
    expect((await readFor(s, groupId, s.marko.profileId))?.unreadCount).toBe(1);

    // Vlasnik nije u spisku — svejedno ostaje (inače bi se zaključao napolju).
    const result = await s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
      channelId: groupId,
      name: "Novo ime",
      memberProfileIds: [s.ana.profileId, s.vesna.profileId],
    });
    expect(result.previousName).toBe("Tim");
    expect([...result.previousProfileIds].sort()).toEqual(
      [s.jovan.profileId, s.ana.profileId, s.marko.profileId].sort(),
    );
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);

    const channel = await s.t.run((ctx) => ctx.db.get("chatChannels", groupId));
    expect(channel?.name).toBe("Novo ime");
    const active = (await membershipRows(s, groupId)).filter(
      (m) => m.leftAt === null,
    );
    expect(
      Object.fromEntries(active.map((m) => [m.profileId, m.role])),
    ).toEqual({
      [s.jovan.profileId]: "owner",
      [s.ana.profileId]: "member",
      [s.vesna.profileId]: "member",
    });
    // Uklonjenom je nepročitano na nuli i više ne vidi razgovor.
    expect((await readFor(s, groupId, s.marko.profileId))?.unreadCount).toBe(0);
    await expect(
      s.asMarko.query(api.prostor.chat.messages, {
        channelId: groupId,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");

    // „Poništi" = isti poziv sa starim vrednostima; Marko dobija ISTI red nazad.
    const undo = await s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
      channelId: groupId,
      name: result.previousName,
      memberProfileIds: result.previousProfileIds,
    });
    expect(undo).toMatchObject({ previousName: "Novo ime", added: 1, removed: 1 });
    const rows = await membershipRows(s, groupId);
    expect(rows.filter((m) => m.profileId === s.marko.profileId)).toHaveLength(1);
    expect(
      rows
        .filter((m) => m.leftAt === null)
        .map((m) => m.profileId)
        .sort(),
    ).toEqual([s.jovan.profileId, s.ana.profileId, s.marko.profileId].sort());
    expect(
      (await s.t.run((ctx) => ctx.db.get("chatChannels", groupId)))?.name,
    ).toBe("Tim");

    // Sama izmena imena ne dira članove.
    const renamed = await s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
      channelId: groupId,
      name: "Samo ime",
    });
    expect(renamed).toMatchObject({ added: 0, removed: 0 });
  });

  test("updatePersonalGroup: ne-vlasnik, ne-član, DM, kanal tima i loš spisak se odbijaju", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId]);
    await expect(
      s.asAna.mutation(api.prostor.chat.updatePersonalGroup, {
        channelId: groupId,
        name: "Moje",
      }),
    ).rejects.toThrow("Podešavanja grupe menja samo njen vlasnik.");
    await expect(
      s.asMarko.mutation(api.prostor.chat.updatePersonalGroup, {
        channelId: groupId,
        name: "Upad",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");

    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await expect(
      s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, { channelId: dm, name: "x" }),
    ).rejects.toThrow("Ovo nije lična grupa.");

    const teamChannel = await s.asJovan.mutation(api.prostor.chat.createChannel, {
      workspaceId: s.a.workspaceId,
      name: "Tim kanal",
      isPrivate: true,
      memberProfileIds: [s.ana.profileId],
    });
    await expect(
      s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
        channelId: teamChannel,
        name: "x",
      }),
    ).rejects.toThrow("Ovo nije lična grupa.");

    await expect(
      s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
        channelId: groupId,
        memberProfileIds: [],
      }),
    ).rejects.toThrow("Grupi treba bar još jedan član.");
    await expect(
      s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
        channelId: groupId,
        memberProfileIds: [s.ana.profileId, s.bivsi.profileId],
      }),
    ).rejects.toThrow("Član tima nije pronađen.");
    // Ništa se nije promenilo.
    expect(
      (await membershipRows(s, groupId))
        .filter((m) => m.leftAt === null)
        .map((m) => m.profileId)
        .sort(),
    ).toEqual([s.jovan.profileId, s.ana.profileId].sort());
  });

  test("leavePersonalGroup: član izlazi, vlasništvo prelazi, poslednji arhivira", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [
      s.ana.profileId,
      s.marko.profileId,
      s.vesna.profileId,
    ]);
    // Redosled pridruživanja: Ana, Marko, Vesna (jednoznačno).
    await s.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("chatMembers")
        .withIndex("by_channel_and_profile", (q) => q.eq("channelId", groupId))
        .collect();
      const order = [s.ana.profileId, s.marko.profileId, s.vesna.profileId];
      for (const row of rows) {
        const index = order.indexOf(row.profileId);
        if (index >= 0) {
          await ctx.db.patch("chatMembers", row._id, { joinedAt: BASE + index });
        }
      }
    });

    // Vesna (član) odlazi sa nepročitanim.
    await send(s.asJovan, groupId, "ko je tu?");
    expect((await readFor(s, groupId, s.vesna.profileId))?.unreadCount).toBe(1);
    expect(
      await s.asVesna.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId }),
    ).toEqual({ archived: false });
    expect((await readFor(s, groupId, s.vesna.profileId))?.unreadCount).toBe(0);
    await expect(
      s.asVesna.query(api.prostor.chat.messages, {
        channelId: groupId,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    const page = await s.asJovan.query(api.prostor.chat.messages, {
      channelId: groupId,
      paginationOpts: NO_CURSOR,
    });
    expect(page.page[0]).toMatchObject({
      kind: "system",
      body: "Vesna je napustio/la grupu",
    });

    // Vlasnik odlazi → vlasništvo dobija najranije pridružena Ana.
    await s.asJovan.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId });
    const roles = async () =>
      Object.fromEntries(
        (await membershipRows(s, groupId))
          .filter((m) => m.leftAt === null)
          .map((m) => [m.profileId, m.role]),
      );
    expect(await roles()).toEqual({
      [s.ana.profileId]: "owner",
      [s.marko.profileId]: "member",
    });

    // Bivši vlasnik vraćen u grupu nije drugi vlasnik.
    await s.asAna.mutation(api.prostor.chat.updatePersonalGroup, {
      channelId: groupId,
      memberProfileIds: [s.marko.profileId, s.jovan.profileId],
    });
    expect(await roles()).toEqual({
      [s.ana.profileId]: "owner",
      [s.marko.profileId]: "member",
      [s.jovan.profileId]: "member",
    });

    await s.asAna.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId });
    expect((await roles())[s.marko.profileId]).toBe("owner");
    await s.asJovan.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId });
    expect(
      await s.asMarko.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId }),
    ).toEqual({ archived: true });
    const channel = await s.t.run((ctx) => ctx.db.get("chatChannels", groupId));
    expect(channel?.archivedAt).not.toBeNull();
    await expect(
      s.asMarko.query(api.prostor.chat.getChannel, { channelId: groupId }),
    ).rejects.toThrow("Razgovor nije pronađen.");
  });

  test("ponovo dodat član se pridružuje sada — ne preskače one koji su ostali", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId, s.marko.profileId]);
    // Ana je najranije pridružena, Marko posle nje.
    await s.t.run(async (ctx) => {
      const rows = await ctx.db
        .query("chatMembers")
        .withIndex("by_channel_and_profile", (q) => q.eq("channelId", groupId))
        .collect();
      for (const row of rows) {
        if (row.profileId === s.ana.profileId) {
          await ctx.db.patch("chatMembers", row._id, { joinedAt: BASE });
        }
        if (row.profileId === s.marko.profileId) {
          await ctx.db.patch("chatMembers", row._id, { joinedAt: BASE + 1 });
        }
      }
    });
    // Ana uklonjena pa vraćena: njen stari `joinedAt` više ne važi.
    await s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
      channelId: groupId,
      memberProfileIds: [s.marko.profileId],
    });
    await s.asJovan.mutation(api.prostor.chat.updatePersonalGroup, {
      channelId: groupId,
      memberProfileIds: [s.marko.profileId, s.ana.profileId],
    });
    await s.asJovan.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId });
    const owners = (await membershipRows(s, groupId)).filter(
      (m) => m.leftAt === null && m.role === "owner",
    );
    expect(owners.map((m) => m.profileId)).toEqual([s.marko.profileId]);
  });

  test("iz DM-a i kanala tima se ne izlazi kroz leavePersonalGroup", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await expect(
      s.asJovan.mutation(api.prostor.chat.leavePersonalGroup, { channelId: dm }),
    ).rejects.toThrow("Iz ličnog razgovora se ne izlazi.");
    await expect(
      s.asJovan.mutation(api.prostor.chat.leavePersonalGroup, { channelId: s.a.general }),
    ).rejects.toThrow("Ovo nije lična grupa.");
  });
});

describe("pristup ličnom razgovoru", () => {
  test("ne-član (i član zajedničkog projekta) je odbijen za čitanje, slanje, reakciju, upload…", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const messageId = await send(s.asJovan, dm, "samo za Anu");
    const denied = "Nemate pristup ovom razgovoru.";

    // Marko i Vesna dele projekat A sa oboje učesnika; Stranac ne deli nijedan
    // projekat. Nijedan od njih nije član razgovora, pa su svi odbijeni.
    for (const caller of [s.asMarko, s.asVesna, s.asStranac]) {
      await expect(
        caller.query(api.prostor.chat.messages, {
          channelId: dm,
          paginationOpts: NO_CURSOR,
        }),
      ).rejects.toThrow(denied);
      await expect(caller.query(api.prostor.chat.getChannel, { channelId: dm })).rejects.toThrow(
        denied,
      );
      await expect(
        caller.query(api.prostor.chat.channelMembers, { channelId: dm }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.sendMessage, { channelId: dm, body: "upad" }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.toggleReaction, { messageId, emoji: "👍" }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.generateUploadUrl, {
          channelId: dm,
          name: "slika.png",
          contentType: "image/png",
          size: 10,
        }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.markChannelRead, { channelId: dm }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.setPresence, { channelId: dm, present: true }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.setNotificationLevel, {
          channelId: dm,
          level: "none",
        }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.editMessage, { messageId, body: "izmena" }),
      ).rejects.toThrow(denied);
      await expect(
        caller.mutation(api.prostor.chat.deleteMessage, { messageId }),
      ).rejects.toThrow(denied);
    }
    await expect(
      s.t.query(api.prostor.chat.messages, { channelId: dm, paginationOpts: NO_CURSOR }),
    ).rejects.toThrow("Niste prijavljeni.");

    // Ništa od pokušaja nije ostavilo trag.
    const reactions = await s.t.run((ctx) =>
      ctx.db
        .query("chatReactions")
        .withIndex("by_message", (q) => q.eq("messageId", messageId))
        .collect(),
    );
    expect(reactions).toHaveLength(0);
    expect(
      (await s.t.run((ctx) => ctx.db.get("chatMessages", messageId)))?.body,
    ).toBe("samo za Anu");
  });

  test("član: reakcija, izmena, prilog i nivo obaveštenja rade", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const messageId = await send(s.asJovan, dm, "prva verzija");
    expect(
      await s.asAna.mutation(api.prostor.chat.toggleReaction, { messageId, emoji: "👍" }),
    ).toEqual({ reacted: true });
    await s.asJovan.mutation(api.prostor.chat.editMessage, {
      messageId,
      body: "druga verzija",
    });
    await s.asAna.mutation(api.prostor.chat.setNotificationLevel, {
      channelId: dm,
      level: "mentions",
    });

    const url = await s.asAna.mutation(api.prostor.chat.generateUploadUrl, {
      channelId: dm,
      name: "slika.png",
      contentType: "image/png",
      size: 5,
    });
    expect(typeof url).toBe("string");
    const storageId = await s.t.run((ctx) =>
      ctx.storage.store(new Blob(["12345"], { type: "image/png" })),
    );
    const attached = await s.asAna.mutation(api.prostor.chat.sendMessage, {
      channelId: dm,
      body: "",
      kind: "file",
      attachmentStorageId: storageId,
      attachmentName: "slika.png",
    });
    expect(attached.ok).toBe(true);

    const page = await s.asJovan.query(api.prostor.chat.messages, {
      channelId: dm,
      paginationOpts: NO_CURSOR,
    });
    // Veličina je serverska (5), ne iz argumenata; `convex-test` 0.0.65 pamti
    // `contentType` bloba u `_storage`, pa tip dolazi iz skladišta.
    expect(page.page[0]).toMatchObject({
      kind: "file",
      attachmentType: "image/png",
      attachmentSize: 5,
    });
    expect(page.page[0].attachmentUrl).not.toBeNull();
    expect(page.page[1]).toMatchObject({
      body: "druga verzija",
      reactions: [{ emoji: "👍", count: 1, mine: false }],
    });
    expect((await readFor(s, dm, s.ana.profileId))?.notificationLevel).toBe(
      "mentions",
    );
  });

  test("arhiviran profil više ne čita svoj lični razgovor", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await s.t.run((ctx) =>
      ctx.db.patch("profiles", s.ana.profileId, { archivedAt: BASE }),
    );
    await expect(
      s.asAna.query(api.prostor.chat.messages, { channelId: dm, paginationOpts: NO_CURSOR }),
    ).rejects.toThrow("Profil još nije spreman. Osveži stranicu.");
  });

  test("getChannel: opseg, startup i moja uloga", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId]);
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });

    const group = await s.asJovan.query(api.prostor.chat.getChannel, { channelId: groupId });
    expect(group).toMatchObject({
      _id: groupId,
      workspaceId: null,
      workspace: null,
      myRole: "owner",
      kind: "custom",
      name: "Tim",
    });
    expect(
      (await s.asAna.query(api.prostor.chat.getChannel, { channelId: groupId })).myRole,
    ).toBe("member");

    const direct = await s.asJovan.query(api.prostor.chat.getChannel, { channelId: dm });
    expect(direct.otherParticipant?.displayName).toBe("Ana");
    expect(direct.workspace).toBeNull();

    const general = await s.asJovan.query(api.prostor.chat.getChannel, {
      channelId: s.a.general,
    });
    expect(general.workspace).toEqual({
      _id: s.a.workspaceId,
      name: "Cluck Rush",
      logoUrl: null,
    });
    expect(general.myRole).toBeNull();
    await expect(
      s.asJovan.query(api.prostor.chat.getChannel, { channelId: s.c.general }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });
});

describe("granice ličnog opsega (D4)", () => {
  test("arhiviranje, članovi kanala tima i nit iz poruke se odbijaju", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId]);
    const messageId = await send(s.asAna, groupId, "poruka u grupi");

    await expect(
      s.asJovan.mutation(api.prostor.chat.archiveChannel, { channelId: groupId }),
    ).rejects.toThrow("Lični razgovor se ne arhivira — napusti grupu.");
    await expect(
      s.asJovan.mutation(api.prostor.chat.setChannelMembers, {
        channelId: groupId,
        memberProfileIds: [s.ana.profileId],
      }),
    ).rejects.toThrow("Za ličnu grupu koristi podešavanja grupe.");
    await expect(
      s.asJovan.mutation(api.prostor.chat.createChannel, { fromMessageId: messageId }),
    ).rejects.toThrow("Diskusije se otvaraju samo u kanalima projekta.");
    // Ne-član ne saznaje ni to — dobija odbijanje pristupa.
    await expect(
      s.asMarko.mutation(api.prostor.chat.archiveChannel, { channelId: groupId }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");

    // Nit startupa ne sme da se zakači za ličnu poruku.
    await expect(
      s.asJovan.mutation(api.prostor.chat.sendToAnchor, {
        workspaceId: s.a.workspaceId,
        anchorType: "message",
        anchorId: messageId,
        body: "curenje",
      }),
    ).rejects.toThrow("Diskusija nije pronađena.");
    expect(
      (await s.t.run((ctx) => ctx.db.get("chatChannels", groupId)))?.archivedAt,
    ).toBeNull();
  });

  test("administrator ne briše tuđu poruku u ličnom razgovoru; autor briše svoju", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const anaMessage = await send(s.asAna, dm, "Anina poruka");
    await expect(
      s.asJovan.mutation(api.prostor.chat.deleteMessage, { messageId: anaMessage }),
    ).rejects.toThrow("Poruku u ličnom razgovoru briše samo autor.");
    await s.asAna.mutation(api.prostor.chat.deleteMessage, { messageId: anaMessage });
    const page = await s.asJovan.query(api.prostor.chat.messages, {
      channelId: dm,
      paginationOpts: NO_CURSOR,
    });
    expect(page.page[0]).toMatchObject({ deleted: true, body: "" });

    // U startupu administrator i dalje briše tuđu poruku (ponašanje netaknuto).
    const teamMessage = await send(s.asAna, s.a.general, "u timu");
    await s.asJovan.mutation(api.prostor.chat.deleteMessage, { messageId: teamMessage });
  });
});

describe("poruke i nepročitano po opsegu", () => {
  test("unreadSummary: personal raste, byStartup bez null-a, total je zbir", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const groupId = await makeGroup(s, [s.ana.profileId]);
    await send(s.asJovan, dm, "jedan");
    await send(s.asJovan, dm, "dva");
    await send(s.asJovan, groupId, "hej Ana", [s.ana.profileId]);
    await send(s.asJovan, s.a.general, "tim");

    const summary = await s.asAna.query(api.prostor.chat.unreadSummary, {});
    expect(summary.personal).toEqual({ unreadCount: 3, mentionCount: 1 });
    expect(summary.byStartup).toEqual([
      { workspaceId: s.a.workspaceId, unreadCount: 1, mentionCount: 0 },
    ]);
    expect(summary.byStartup.every((entry) => entry.workspaceId !== null)).toBe(true);
    expect(summary.total).toEqual({ unreadCount: 4, mentionCount: 1 });

    await s.asAna.mutation(api.prostor.chat.markChannelRead, { channelId: dm });
    expect((await s.asAna.query(api.prostor.chat.unreadSummary, {})).personal).toEqual({
      unreadCount: 1,
      mentionCount: 1,
    });
    // Autor nema nepročitano za svoje poruke.
    expect((await s.asJovan.query(api.prostor.chat.unreadSummary, {})).personal).toEqual({
      unreadCount: 0,
      mentionCount: 0,
    });
  });

  test("byStartup i total ne broje napušten startup (D3)", async () => {
    const s = await seed();
    await s.t.run((ctx) =>
      ctx.db.insert("chatReads", {
        channelId: s.d.general,
        profileId: s.jovan.profileId,
        workspaceId: s.d.workspaceId,
        lastReadAt: 0,
        lastReadMessageId: null,
        unreadCount: 5,
        mentionCount: 2,
        updatedAt: BASE,
      }),
    );
    await send(s.asAna, s.b.general, "u B");
    const summary = await s.asJovan.query(api.prostor.chat.unreadSummary, {});
    expect(summary.byStartup).toEqual([
      { workspaceId: s.b.workspaceId, unreadCount: 1, mentionCount: 0 },
    ]);
    expect(summary.total).toEqual({ unreadCount: 1, mentionCount: 0 });
  });

  test("pominjanje: samo aktivni članovi razgovora", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await expect(
      send(s.asJovan, dm, "hej Marko", [s.marko.profileId]),
    ).rejects.toThrow("Možeš da pomeneš samo članove ovog razgovora.");

    const groupId = await makeGroup(s, [s.ana.profileId, s.vesna.profileId]);
    await s.t.run((ctx) =>
      ctx.db.patch("profiles", s.vesna.profileId, { archivedAt: BASE }),
    );
    await expect(
      send(s.asJovan, groupId, "hej Vesna", [s.vesna.profileId]),
    ).rejects.toThrow("Možeš da pomeneš samo članove ovog razgovora.");
    await send(s.asJovan, groupId, "hej Ana", [s.ana.profileId]);
  });
});

describe("lična obaveštenja i push", () => {
  test("DM, grupa i pominjanje prave obaveštenje sa startupId: null i zakazuju push", async () => {
    vi.useFakeTimers();
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const groupId = await makeGroup(s, [s.ana.profileId, s.marko.profileId], "Vikend");

    await send(s.asJovan, dm, "Zdravo Ana");
    await send(s.asJovan, groupId, "Ko ide?");
    await send(s.asJovan, groupId, "Ana, ti?", [s.ana.profileId]);

    const received = await notificationsFor(s, s.ana.profileId);
    expect(
      received.map((row) => ({
        workspaceId: row.workspaceId,
        type: row.type,
        title: row.title,
        body: row.body,
        targetType: row.targetType,
        targetId: row.targetId,
        actorProfileId: row.actorProfileId,
      })),
    ).toEqual([
      {
        workspaceId: null,
        type: "chat_dm",
        title: "Jovan",
        body: "Zdravo Ana",
        targetType: "chat",
        targetId: dm,
        actorProfileId: s.jovan.profileId,
      },
      {
        workspaceId: null,
        type: "chat_message",
        title: "Vikend",
        body: "Ko ide?",
        targetType: "chat",
        targetId: groupId,
        actorProfileId: s.jovan.profileId,
      },
      {
        workspaceId: null,
        type: "chat_mention",
        title: "Vikend",
        body: "Ana, ti?",
        targetType: "chat",
        targetId: groupId,
        actorProfileId: s.jovan.profileId,
      },
    ]);
    // Marko (član grupe) dobija dve poruke grupe; autor nijednu.
    expect(await notificationsFor(s, s.marko.profileId)).toHaveLength(2);
    expect(await notificationsFor(s, s.jovan.profileId)).toHaveLength(0);

    // Svako obaveštenje zakazuje obe grane dostave (web + Expo).
    const names = await scheduledNames(s);
    // Imena u `_scheduled_functions` su pune putanje (`prostor/…`).
    expect(names.filter((name) => name === "prostor/push:deliver")).toHaveLength(5);
    expect(names.filter((name) => name === "prostor/expoPush:deliver")).toHaveLength(5);
    // I ništa drugo se ne dostavlja: tačno dve grane po obaveštenju.
    expect(names.filter((name) => name.endsWith(":deliver"))).toHaveLength(10);
  });

  test("push payload nosi startupId: null, a bedž broji lično", async () => {
    vi.useFakeTimers();
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await send(s.asJovan, dm, "Zdravo Ana");
    const [notification] = await notificationsFor(s, s.ana.profileId);

    await s.t.run(async (ctx) => {
      await ctx.db.insert("pushSubscriptions", {
        profileId: s.ana.profileId,
        endpoint: "https://push.example.test/ana",
        p256dh: "p256dh",
        auth: "auth",
        failureCount: 0,
        lastSuccessAt: null,
        createdAt: BASE,
        updatedAt: BASE,
      });
      await ctx.db.insert("expoPushTokens", {
        profileId: s.ana.profileId,
        token: "ExponentPushToken[ana]",
        platform: "ios",
        deviceName: null,
        appVersion: "1.0.0",
        channelVersion: 1,
        lastSeenAt: BASE,
        failureCount: 0,
        createdAt: BASE,
      });
    });

    const web = await s.t.query(
      internal.prostor.pushSubscriptions.pushPayloadForNotification,
      { notificationId: notification._id },
    );
    expect(web).toMatchObject({
      workspaceId: null,
      targetType: "chat",
      targetId: dm,
      type: "chat_dm",
    });
    const native = await s.t.query(
      internal.prostor.expoPushTokens.expoPayloadForNotification,
      { notificationId: notification._id },
    );
    expect(native).toMatchObject({ workspaceId: null, targetId: dm });
    // 1 lično obaveštenje + 1 nepročitana lična poruka.
    expect(native?.badge).toBe(2);
  });

  test("prisutan primalac ćuti, ali nepročitano raste (isto pravilo kao u startupu)", async () => {
    vi.useFakeTimers();
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await s.asAna.mutation(api.prostor.chat.setPresence, { channelId: dm, present: true });
    await send(s.asJovan, dm, "vidiš uživo");
    expect(await notificationsFor(s, s.ana.profileId)).toHaveLength(0);
    expect((await readFor(s, dm, s.ana.profileId))?.unreadCount).toBe(1);
  });

  test("arhiviran profil ne dobija lična obaveštenja", async () => {
    vi.useFakeTimers();
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId, s.marko.profileId]);
    await s.t.run((ctx) =>
      ctx.db.patch("profiles", s.marko.profileId, { archivedAt: BASE }),
    );
    await send(s.asJovan, groupId, "samo aktivni");
    expect(await notificationsFor(s, s.marko.profileId)).toHaveLength(0);
    expect(await notificationsFor(s, s.ana.profileId)).toHaveLength(1);
  });

  test("bedž ikone prati opseg aplikacije (D3): napušten i arhiviran startup se ne broje", async () => {
    vi.useFakeTimers();
    const s = await seed();
    // Stari tragovi: nepročitano u napuštenom startupu (d) i u startupu koji se
    // arhivira (b) — aplikacija ih ne prikazuje, pa ni ikona ne sme da ih broji.
    await s.t.run(async (ctx) => {
      const stale = [
        { workspaceId: s.d.workspaceId, channelId: s.d.general, unreadCount: 5 },
        { workspaceId: s.b.workspaceId, channelId: s.b.general, unreadCount: 3 },
      ];
      for (const entry of stale) {
        await ctx.db.insert("chatReads", {
          channelId: entry.channelId,
          profileId: s.jovan.profileId,
          workspaceId: entry.workspaceId,
          lastReadAt: BASE,
          lastReadMessageId: null,
          unreadCount: entry.unreadCount,
          mentionCount: 0,
          updatedAt: BASE,
        });
        await ctx.db.insert("notifications", {
          recipientProfileId: s.jovan.profileId,
          workspaceId: entry.workspaceId,
          type: "chat_message",
          title: "#Opšte",
          targetType: "chat",
          targetId: entry.channelId,
          actorProfileId: s.ana.profileId,
          dedupeKey: null,
          readAt: null,
          createdAt: BASE,
        });
      }
      await ctx.db.patch("workspaces", s.b.workspaceId, { arhiviran: (BASE) !== null });
      await ctx.db.insert("expoPushTokens", {
        profileId: s.jovan.profileId,
        token: "ExponentPushToken[jovan]",
        platform: "android",
        deviceName: null,
        appVersion: "1.0.0",
        channelVersion: 1,
        lastSeenAt: BASE,
        failureCount: 0,
        createdAt: BASE,
      });
    });

    const dm = await s.asAna.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.jovan.profileId,
    });
    await send(s.asAna, dm, "Zdravo Jovane");
    const personal = (await notificationsFor(s, s.jovan.profileId)).filter(
      (row) => row.workspaceId === null,
    );
    expect(personal).toHaveLength(1);
    const native = await s.t.query(
      internal.prostor.expoPushTokens.expoPayloadForNotification,
      { notificationId: personal[0]._id },
    );
    // 1 lično obaveštenje + 1 nepročitana lična poruka; d i b se ne broje.
    expect(native?.badge).toBe(2);
  });

  test("obaveštenje bez startupa postoji samo za lične poruke", async () => {
    const s = await seed();
    await expect(
      s.t.run((ctx) =>
        createNotification(ctx, {
          recipientProfileId: s.ana.profileId,
          workspaceId: null,
          type: "task_assigned",
          title: "Zadatak",
          targetType: "page",
          targetId: null,
        }),
      ),
    ).rejects.toThrow("Obaveštenje bez projekta je samo za lične poruke.");
  });
});

describe("hub listConversations", () => {
  test("lično + moji startupi; tuđi startup, napušten startup i tuđi lični ne cure", async () => {
    vi.useFakeTimers();
    // Sat kreće od BASE i pre semena, da opšti kanali bez poruka budu najstariji.
    vi.setSystemTime(BASE);
    const s = await seed();
    let clock = BASE;
    const tick = () => {
      clock += 1_000;
      vi.setSystemTime(clock);
    };

    tick();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    tick();
    const groupId = await makeGroup(s, [s.ana.profileId, s.marko.profileId]);
    tick();
    // Tuđi lični razgovor (Ana ↔ Marko) i poruke u startupima van mog opsega.
    const foreignDm = await s.asAna.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.marko.profileId,
    });
    await send(s.asAna, foreignDm, "samo nas dvoje");
    tick();
    await send(s.asAna, s.c.general, "u C");
    tick();
    await send(s.asAna, s.d.general, "u D");
    tick();
    await send(s.asAna, s.b.general, "u B");
    tick();
    // DM u startupu A ostaje u grupi startupa (O2).
    const startupDm = await s.asAna.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.a.workspaceId,
      otherProfileId: s.jovan.profileId,
    });
    await send(s.asAna, startupDm, "u A, privatno");
    tick();
    await send(s.asAna, dm, "lično");
    tick();
    await send(s.asMarko, groupId, "grupa", [s.jovan.profileId]);

    const hub = await s.asJovan.query(api.prostor.chat.listConversations, {});
    expect(hub.capped).toBe(false);
    // Najsvežiji prvi: grupa, pa DM.
    expect(hub.personal.map((c) => c._id)).toEqual([groupId, dm]);
    expect(hub.personal.every((c) => c.workspaceId === null)).toBe(true);
    expect(hub.personal.map((c) => [c.unreadCount, c.mentionCount])).toEqual([
      [1, 1],
      [1, 0],
    ]);
    expect(hub.personal[1].otherParticipant?.displayName).toBe("Ana");

    // Samo A i B (C nije moj, D je napušten); A je svežiji (DM u A).
    expect(hub.workspaces.map((g) => g.workspace.name)).toEqual([
      "Cluck Rush",
      "Scan Me",
    ]);
    const [groupA, groupB] = hub.workspaces;
    expect(groupA.channels.map((c) => c._id)).toEqual([startupDm, s.a.general]);
    expect(groupA).toMatchObject({ unreadCount: 1, mentionCount: 0 });
    expect(groupB.channels.map((c) => c._id)).toEqual([s.b.general]);
    expect(groupB).toMatchObject({ unreadCount: 1, mentionCount: 0 });

    const everyId = [
      ...hub.personal.map((c) => c._id),
      ...hub.workspaces.flatMap((g) => g.channels.map((c) => c._id)),
    ];
    expect(everyId).not.toContain(foreignDm);
    expect(everyId).not.toContain(s.c.general);
    expect(everyId).not.toContain(s.d.general);

    // Stari per-startup upiti nikad ne vide lične kanale.
    const legacy = await s.asJovan.query(api.prostor.chat.listChannels, {
      workspaceId: s.a.workspaceId,
    });
    expect(legacy.map((c) => c._id)).not.toContain(dm);
    expect(legacy.map((c) => c._id)).not.toContain(groupId);
    expect(
      (
        await s.asJovan.query(api.prostor.chat.listDirectMessages, {
          workspaceId: s.a.workspaceId,
        })
      ).map((c) => c._id),
    ).toEqual([startupDm]);
  });

  test("napuštena grupa nestaje iz huba; bez prijave nema huba", async () => {
    const s = await seed();
    const groupId = await makeGroup(s, [s.ana.profileId]);
    expect(
      (await s.asAna.query(api.prostor.chat.listConversations, {})).personal.map((c) => c._id),
    ).toEqual([groupId]);
    await s.asAna.mutation(api.prostor.chat.leavePersonalGroup, { channelId: groupId });
    expect((await s.asAna.query(api.prostor.chat.listConversations, {})).personal).toEqual(
      [],
    );
    await expect(s.t.query(api.prostor.chat.listConversations, {})).rejects.toThrow(
      "Niste prijavljeni.",
    );
  });
});

describe("listPeople", () => {
  test("P9: aktivni ljudi sa kojima delim projekat, bez mene, sa zajedničkim projektima, bez e-pošte i uloge", async () => {
    const s = await seed();
    // Slučajevi koje P9 mora da isključi, pored Stranca (nema projekat) iz
    // semena: arhiviran profil koji je u A, gost (`client_viewer`) u A i osoba
    // čiji je jedini zajednički projekat arhiviran.
    const gost = await s.t.run(async (ctx) => {
      const person = async (name: string, archived = false) => {
        const userId = await ctx.db.insert("users", { name });
        const profileId = await insertProfil(ctx, {
          userId,
          displayName: name,
          email: `${name.toLowerCase()}@example.test`,
          role: "member",
          archivedAt: archived ? BASE : null,
          createdAt: BASE,
          updatedAt: BASE,
        });
        return { userId, profileId };
      };
      await insertClanstvo(ctx, {
        workspaceId: s.a.workspaceId,
        profileId: s.bivsi.profileId,
        archivedAt: null,
      });
      const posmatrac = await person("Gost");
      await ctx.db.insert("members", {
        workspaceId: s.a.workspaceId,
        userId: posmatrac.userId,
        role: "client_viewer",
      });
      const zatvoren = await insertStartup(ctx, {
        name: "Zatvoren",
        description: "",
        createdByProfileId: s.jovan.profileId,
        archivedAt: BASE,
        createdAt: BASE,
        updatedAt: BASE,
      });
      const arhivski = await person("Arhivski");
      await insertClanstvo(ctx, {
        workspaceId: zatvoren,
        profileId: arhivski.profileId,
        archivedAt: null,
      });
      return posmatrac;
    });

    const people = await s.asJovan.query(api.prostor.chat.listPeople, {});
    // Jovan je u A i B: Ana (A, B), Marko (A), Vesna (A). Bez Stranca, Gosta,
    // Arhivskog i Bivšeg, a Jovan sam sebe ne vidi.
    expect(people.map((p) => p.displayName)).toEqual(["Ana", "Marko", "Vesna"]);
    for (const person of people) {
      expect(Object.keys(person).sort()).toEqual([
        "_id",
        "avatarUrl",
        "displayName",
        "sharedStartupNames",
      ]);
    }
    expect(JSON.stringify(people)).not.toContain("@example.test");
    expect(
      Object.fromEntries(people.map((p) => [p.displayName, p.sharedStartupNames])),
    ).toEqual({
      // C nije moj, a članstvo u D mi je uklonjeno.
      Ana: ["Cluck Rush", "Scan Me"],
      Marko: ["Cluck Rush"],
      Vesna: ["Cluck Rush"],
    });
    expect(people.find((p) => p._id === s.bivsi.profileId)).toBeUndefined();
    expect(people.find((p) => p._id === s.stranac.profileId)).toBeUndefined();
    expect(people.find((p) => p._id === s.jovan.profileId)).toBeUndefined();

    // Isto pravilo iz drugog ugla: Marko je u A i C, pa vidi Anu u oba.
    const markoSees = await s.asMarko.query(api.prostor.chat.listPeople, {});
    expect(markoSees.map((p) => [p.displayName, p.sharedStartupNames])).toEqual([
      ["Ana", ["Cluck Rush", "Tuđi"]],
      ["Jovan", ["Cluck Rush"]],
      ["Vesna", ["Cluck Rush"]],
    ]);
    // Stranac nema projekat, a Gost je samo posmatrač: nikoga ne vide.
    expect(await s.asStranac.query(api.prostor.chat.listPeople, {})).toEqual([]);
    const asGost = s.t.withIdentity({ subject: `${gost.userId}|sesija-test` });
    expect(await asGost.query(api.prostor.chat.listPeople, {})).toEqual([]);
    await expect(s.t.query(api.prostor.chat.listPeople, {})).rejects.toThrow(
      "Niste prijavljeni.",
    );
  });
});

describe("pretraga ličnih razgovora", () => {
  test("searchMessages(null) vraća samo moje lične; startup pretraga ostaje po startupu", async () => {
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    const groupId = await makeGroup(s, [s.ana.profileId]);
    const foreignDm = await s.asAna.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.marko.profileId,
    });
    await send(s.asAna, dm, "ananas u DM-u");
    await send(s.asAna, groupId, "ananas u grupi");
    await send(s.asAna, foreignDm, "ananas tajna");
    await send(s.asAna, s.a.general, "ananas u timu");

    const personal = await s.asJovan.query(api.prostor.chat.searchMessages, {
      workspaceId: null,
      term: "ananas",
    });
    expect(personal.map((r) => r.body).sort()).toEqual([
      "ananas u DM-u",
      "ananas u grupi",
    ]);

    const onlyGroup = await s.asJovan.query(api.prostor.chat.searchMessages, {
      workspaceId: null,
      term: "ananas",
      channelId: groupId,
    });
    expect(onlyGroup.map((r) => [r.body, r.channelName])).toEqual([
      ["ananas u grupi", "Tim"],
    ]);

    const team = await s.asJovan.query(api.prostor.chat.searchMessages, {
      workspaceId: s.a.workspaceId,
      term: "ananas",
    });
    expect(team.map((r) => r.body)).toEqual(["ananas u timu"]);
  });
});

describe("Inbox vidi lična obaveštenja", () => {
  test("feed (startup: null), unreadCounts.personal i markAllRead po opsegu", async () => {
    vi.useFakeTimers();
    const s = await seed();
    const dm = await s.asJovan.mutation(api.prostor.chat.openPersonalDm, {
      otherProfileId: s.ana.profileId,
    });
    await send(s.asJovan, dm, "lično");
    await send(s.asJovan, s.a.general, "tim");

    const all = await s.asAna.query(api.prostor.inbox.feed, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    const personalItem = all.page.find((item) => item.targetId === dm);
    expect(personalItem).toMatchObject({
      workspaceId: null,
      workspace: null,
      type: "chat_dm",
      actor: { displayName: "Jovan" },
    });
    expect(all.page).toHaveLength(2);

    const onlyPersonal = await s.asAna.query(api.prostor.inbox.feed, {
      paginationOpts: { numItems: 20, cursor: null },
      workspaceId: null,
    });
    expect(onlyPersonal.page.map((item) => item.targetId)).toEqual([dm]);
    const onlyA = await s.asAna.query(api.prostor.inbox.feed, {
      paginationOpts: { numItems: 20, cursor: null },
      workspaceId: s.a.workspaceId,
    });
    expect(onlyA.page.map((item) => item.workspaceId)).toEqual([s.a.workspaceId]);

    const counts = await s.asAna.query(api.prostor.inbox.unreadCounts, {});
    expect(counts.personal).toEqual({ count: 1, capped: false });
    expect(counts.total).toEqual({ count: 2, capped: false });
    expect(counts.byStartup).toEqual([
      { workspaceId: s.a.workspaceId, count: 1, capped: false },
    ]);

    expect(
      await s.asAna.mutation(api.prostor.inbox.markAllRead, { workspaceId: null }),
    ).toEqual({ marked: 1, hasMore: false });
    const afterPersonal = await s.asAna.query(api.prostor.inbox.unreadCounts, {});
    expect(afterPersonal.personal.count).toBe(0);
    expect(afterPersonal.total.count).toBe(1);

    await send(s.asJovan, dm, "još jedno");
    expect(await s.asAna.mutation(api.prostor.inbox.markAllRead, {})).toEqual({
      marked: 2,
      hasMore: false,
    });
    expect((await s.asAna.query(api.prostor.inbox.unreadCounts, {})).total.count).toBe(0);
  });

  test("markAllRead({ startupId: null }) sa 250 ličnih: serija + zakazan nastavak, startup netaknut", async () => {
    vi.useFakeTimers();
    const s = await seed();
    await s.t.run(async (ctx) => {
      for (let index = 0; index < 250; index += 1) {
        await ctx.db.insert("notifications", {
          recipientProfileId: s.ana.profileId,
          workspaceId: null,
          type: "chat_dm",
          title: "Jovan",
          targetType: "chat",
          targetId: null,
          actorProfileId: s.jovan.profileId,
          dedupeKey: null,
          readAt: null,
          createdAt: BASE + index,
        });
      }
      await ctx.db.insert("notifications", {
        recipientProfileId: s.ana.profileId,
        workspaceId: s.a.workspaceId,
        type: "task_assigned",
        title: "Zadatak",
        targetType: "page",
        targetId: null,
        actorProfileId: null,
        dedupeKey: null,
        readAt: null,
        createdAt: BASE,
      });
    });

    expect(
      await s.asAna.mutation(api.prostor.inbox.markAllRead, { workspaceId: null }),
    ).toEqual({ marked: INBOX_MARK_ALL_BATCH, hasMore: true });
    expect(await scheduledNames(s)).toContain("prostor/inbox:markAllReadBatch");
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);

    const unread = await s.t.run((ctx) =>
      ctx.db
        .query("notifications")
        .withIndex("by_recipient_and_readAt", (q) =>
          q.eq("recipientProfileId", s.ana.profileId).eq("readAt", null),
        )
        .collect(),
    );
    expect(unread.map((row) => row.workspaceId)).toEqual([s.a.workspaceId]);
  });
});
