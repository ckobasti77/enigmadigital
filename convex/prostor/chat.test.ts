/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/chat.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const NO_CURSOR = { numItems: 50, cursor: null };

describe("chat schema", () => {
  test("kanali, poruke, reakcije, unread i pretraga rade preko svojih indeksa", async () => {
    const t = convexTest(schema, modules);

    const seed = await t.run(async (ctx) => {
      const now = Date.now();
      const makeProfile = async (name: string) => {
        const userId = await ctx.db.insert("users", {
          name,
          email: `${name}@example.test`,
        });
        return insertProfil(ctx, {
          userId,
          displayName: name,
          email: `${name}@example.test`,
          role: "member",
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      };
      const profileA = await makeProfile("a");
      const profileB = await makeProfile("b");

      const workspaceId = await insertStartup(ctx, {
        name: "Chat startup",
        description: "",
        createdByProfileId: profileA,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const areaId = await ctx.db.insert("areas", {
        workspaceId,
        key: "dev",
        label: "Dev",
        position: 0,
        createdAt: now,
      });

      const channelBase = {
        workspaceId,
        areaId: null,
        anchorType: null,
        anchorId: null,
        dmKey: null,
        isPrivate: false,
        lastMessageAt: now,
        lastMessagePreview: "",
        lastMessageAuthorId: null,
        messageCount: 0,
        createdByProfileId: profileA,
        archivedAt: null,
        createdAt: now,
      };

      const general = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "startup",
        name: "Opšte",
      });
      const areaChannel = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "area",
        areaId,
        name: "Dev",
      });
      const thread = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "thread",
        anchorType: "page",
        anchorId: "page_anchor_1",
        name: "Thread",
      });
      const dmKey = [profileA, profileB].sort().join(":");
      const dm = await ctx.db.insert("chatChannels", {
        ...channelBase,
        kind: "dm",
        isPrivate: true,
        dmKey,
        name: "DM",
      });

      await ctx.db.insert("chatMembers", {
        channelId: dm,
        profileId: profileB,
        workspaceId,
        role: "member",
        joinedAt: now,
        leftAt: null,
      });

      const messageBase = {
        workspaceId,
        authorProfileId: profileA,
        mentions: [profileB],
        kind: "text" as const,
        attachmentName: null,
        attachmentType: null,
        attachmentSize: null,
        voiceDurationMs: null,
        replyToMessageId: null,
        editedAt: null,
        createdAt: now,
      };
      const liveMessage = await ctx.db.insert("chatMessages", {
        ...messageBase,
        channelId: general,
        body: "Zdravo tim ananas",
        deletedAt: null,
      });
      await ctx.db.insert("chatMessages", {
        ...messageBase,
        channelId: general,
        body: "obrisana poruka",
        deletedAt: now,
      });

      await ctx.db.insert("chatReactions", {
        messageId: liveMessage,
        profileId: profileB,
        emoji: "👍",
        createdAt: now,
      });
      await ctx.db.insert("chatReads", {
        channelId: general,
        profileId: profileB,
        workspaceId,
        lastReadAt: 0,
        lastReadMessageId: null,
        unreadCount: 1,
        mentionCount: 1,
        notificationLevel: "mentions",
        updatedAt: now,
      });

      return {
        workspaceId,
        areaId,
        profileB,
        dmKey,
        general,
        areaChannel,
        thread,
        dm,
        liveMessage,
      };
    });

    await t.run(async (ctx) => {
      // Opšti kanal je jedinstven po (startup, kind) — osnov `startupChannel` helpera.
      const general = await ctx.db
        .query("chatChannels")
        .withIndex("by_workspace_and_kind", (q) =>
          q
            .eq("workspaceId", seed.workspaceId)
            .eq("kind", "startup")
            .eq("archivedAt", null),
        )
        .unique();
      expect(general?._id).toBe(seed.general);

      const areaChannel = await ctx.db
        .query("chatChannels")
        .withIndex("by_area", (q) =>
          q.eq("areaId", seed.areaId).eq("archivedAt", null),
        )
        .unique();
      expect(areaChannel?._id).toBe(seed.areaChannel);

      // by_anchor — lazy thread lookup (sendToAnchor / channelForAnchor).
      const thread = await ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", "page_anchor_1"),
        )
        .unique();
      expect(thread?._id).toBe(seed.thread);

      // by_startup_and_dmKey — openDirectMessage idempotentnost.
      const dm = await ctx.db
        .query("chatChannels")
        .withIndex("by_workspace_and_dmKey", (q) =>
          q.eq("workspaceId", seed.workspaceId).eq("dmKey", seed.dmKey),
        )
        .unique();
      expect(dm?._id).toBe(seed.dm);

      // Lista poruka uključuje tombstone; by_channel_active vraća samo žive.
      const all = await ctx.db
        .query("chatMessages")
        .withIndex("by_channel_and_createdAt", (q) =>
          q.eq("channelId", seed.general),
        )
        .collect();
      expect(all).toHaveLength(2);
      const active = await ctx.db
        .query("chatMessages")
        .withIndex("by_channel_active", (q) =>
          q.eq("channelId", seed.general).eq("deletedAt", null),
        )
        .collect();
      expect(active).toHaveLength(1);
      expect(active[0]._id).toBe(seed.liveMessage);

      // search_body — dokaz da search indeks (searchMessages) postoji i radi.
      const found = await ctx.db
        .query("chatMessages")
        .withSearchIndex("search_body", (q) =>
          q
            .search("body", "ananas")
            .eq("workspaceId", seed.workspaceId)
            .eq("channelId", seed.general)
            .eq("deletedAt", null),
        )
        .collect();
      expect(found).toHaveLength(1);
      expect(found[0]._id).toBe(seed.liveMessage);

      // toggleReaction lookup.
      const reaction = await ctx.db
        .query("chatReactions")
        .withIndex("by_message_and_profile_and_emoji", (q) =>
          q
            .eq("messageId", seed.liveMessage)
            .eq("profileId", seed.profileB)
            .eq("emoji", "👍"),
        )
        .unique();
      expect(reaction).not.toBeNull();

      // chatMembers by_profile_and_startup — skopirano skeniranje za listDirectMessages.
      const memberships = await ctx.db
        .query("chatMembers")
        .withIndex("by_profile_and_workspace", (q) =>
          q.eq("profileId", seed.profileB).eq("workspaceId", seed.workspaceId),
        )
        .collect();
      expect(memberships).toHaveLength(1);
      expect(memberships[0].channelId).toBe(seed.dm);

      // Nivo obaveštenja živi na chatReads (odluka D), uparuje se preko by_profile_and_startup.
      const reads = await ctx.db
        .query("chatReads")
        .withIndex("by_profile_and_workspace", (q) =>
          q.eq("profileId", seed.profileB).eq("workspaceId", seed.workspaceId),
        )
        .collect();
      expect(reads).toHaveLength(1);
      expect(reads[0].notificationLevel).toBe("mentions");
      expect(reads[0].unreadCount).toBe(1);
    });
  });

  test("sourceMessageId povezuje zadatak sa porukom iz koje je nastao", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        name: "a",
        email: "a@example.test",
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: "a",
        email: "a@example.test",
        role: "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const workspaceId = await insertStartup(ctx, {
        name: "S",
        description: "",
        createdByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      const areaId = await ctx.db.insert("areas", {
        workspaceId,
        key: "dev",
        label: "Dev",
        position: 0,
        createdAt: now,
      });
      const channelId = await ctx.db.insert("chatChannels", {
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
        createdByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
      });
      const messageId = await ctx.db.insert("chatMessages", {
        channelId,
        workspaceId,
        authorProfileId: profileId,
        body: "ideja za zadatak",
        mentions: [],
        kind: "text",
        attachmentName: null,
        attachmentType: null,
        attachmentSize: null,
        voiceDurationMs: null,
        replyToMessageId: null,
        editedAt: null,
        deletedAt: null,
        createdAt: now,
      });

      const pageId = await ctx.db.insert("pages", {
        workspaceId,
        areaId,
        parentPageId: null,
        kind: "task",
        title: "Zadatak iz poruke",
        searchText: "zadatak iz poruke",
        revision: 0,
        position: 0,
        taskStatus: "backlog",
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: now,
        sourceMessageId: messageId,
        createdByProfileId: profileId,
        updatedByProfileId: profileId,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      const page = await ctx.db.get("pages", pageId);
      expect(page?.sourceMessageId).toBe(messageId);
    });
  });
});

async function seedChatWorkspace() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const makePerson = async (name: string, role: "admin" | "member") => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name}@example.test`,
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email: `${name}@example.test`,
        role,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };

    const owner = await makePerson("Owner", "admin");
    const member = await makePerson("Member", "member");
    const bystander = await makePerson("Bystander", "member");
    const outsider = await makePerson("Outsider", "member");

    const workspaceId = await insertStartup(ctx, {
      name: "Chat startup",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const person of [owner, member, bystander]) {
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
      key: "dev",
      label: "Dev",
      position: 0,
      createdAt: now,
    });
    // Opšti kanal u produkciji pravi migracija; ovde ga sejemo ručno.
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
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
    });

    return { now, owner, member, bystander, outsider, workspaceId, areaId, general };
  });

  const asPerson = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });

  return {
    t,
    ...seeded,
    asOwner: asPerson(seeded.owner),
    asMember: asPerson(seeded.member),
    asBystander: asPerson(seeded.bystander),
    asOutsider: asPerson(seeded.outsider),
  };
}

type ChatWorkspace = Awaited<ReturnType<typeof seedChatWorkspace>>;

/**
 * Id uspešno poslate poruke. Od faze P3 `sendMessage` vraća UNIJU: odbijen prilog
 * se vraća umesto da se baci, jer bi `throw` poništio i `storage.delete` odbijenog
 * bloba (isti razlog koji `pageFiles.attach` već nosi). Testovima kojima treba
 * samo id ovo je jedina promena.
 */
function messageIdOf(
  result:
    | { ok: true; messageId: Id<"chatMessages"> }
    | { ok: false; reason: string; message: string },
): Id<"chatMessages"> {
  if (!result.ok) throw new Error(`Poruka nije poslata: ${result.message}`);
  return result.messageId;
}

function readFor(
  s: ChatWorkspace,
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

describe("chat funkcije", () => {
  test("unread raste za primaoca, autor ostaje na nuli, čitanje nulira", async () => {
    const s = await seedChatWorkspace();
    for (const body of ["prva", "druga", "treća"]) {
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body,
      });
    }

    expect((await readFor(s, s.general, s.member.profileId))?.unreadCount).toBe(3);
    // Autor nikad ne dobija unread za svoju poruku.
    expect(await readFor(s, s.general, s.owner.profileId)).toBeNull();

    await s.asMember.mutation(api.prostor.chat.markChannelRead, { channelId: s.general });
    const cleared = await readFor(s, s.general, s.member.profileId);
    expect(cleared?.unreadCount).toBe(0);
    expect(cleared?.mentionCount).toBe(0);
  });

  test("pominjanje diže mentionCount", async () => {
    const s = await seedChatWorkspace();
    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "hej Member",
      mentions: [s.member.profileId],
    });
    const read = await readFor(s, s.general, s.member.profileId);
    expect(read?.unreadCount).toBe(1);
    expect(read?.mentionCount).toBe(1);
  });

  test("outsider ne vidi listu niti šalje u startup", async () => {
    const s = await seedChatWorkspace();
    await expect(
      s.asOutsider.query(api.prostor.chat.listChannels, { workspaceId: s.workspaceId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      s.asOutsider.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "upad",
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("DM je idempotentan i zatvoren za nečlana razgovora", async () => {
    const s = await seedChatWorkspace();
    const dm1 = await s.asOwner.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.workspaceId,
      otherProfileId: s.member.profileId,
    });
    const dm2 = await s.asMember.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.workspaceId,
      otherProfileId: s.owner.profileId,
    });
    expect(dm1).toBe(dm2);

    // Bystander je član startupa ali ne i DM-a → pada na channel-nivo dozvole.
    await expect(
      s.asBystander.query(api.prostor.chat.messages, {
        channelId: dm1,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
  });

  test("lazy thread nastaje pri prvoj poruci i idempotentan je", async () => {
    const s = await seedChatWorkspace();
    const pageId = await s.t.run((ctx) =>
      ctx.db.insert("pages", {
        workspaceId: s.workspaceId,
        areaId: s.areaId,
        parentPageId: null,
        kind: "task",
        title: "Zadatak",
        searchText: "zadatak",
        revision: 0,
        position: 0,
        taskStatus: "backlog",
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: s.now,
        createdByProfileId: s.owner.profileId,
        updatedByProfileId: s.owner.profileId,
        archivedAt: null,
        createdAt: s.now,
        updatedAt: s.now,
      }),
    );

    const before = await s.asOwner.query(api.prostor.chat.channelForAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(before).toBeNull();

    await s.asOwner.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
      body: "prvo pitanje",
    });
    await s.asMember.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
      body: "drugo pitanje",
    });

    const after = await s.asOwner.query(api.prostor.chat.channelForAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(after).not.toBeNull();

    const threads = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", pageId),
        )
        .collect(),
    );
    expect(threads).toHaveLength(1);
  });

  test("createChannel od poruke pravi message-thread, idempotentno", async () => {
    const s = await seedChatWorkspace();
    const messageId = messageIdOf(
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "vredna poruka",
      }),
    );
    const threadId = await s.asMember.mutation(api.prostor.chat.createChannel, {
      fromMessageId: messageId,
    });
    const channel = await s.t.run((ctx) => ctx.db.get("chatChannels", threadId));
    expect(channel?.kind).toBe("thread");
    expect(channel?.anchorType).toBe("message");

    const again = await s.asOwner.mutation(api.prostor.chat.createChannel, {
      fromMessageId: messageId,
    });
    expect(again).toBe(threadId);
  });

  test("soft delete: telo se ne vraća, tombstone ostaje", async () => {
    const s = await seedChatWorkspace();
    const messageId = messageIdOf(
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "obriši me",
      }),
    );
    await s.asOwner.mutation(api.prostor.chat.deleteMessage, { messageId });

    const page = await s.asOwner.query(api.prostor.chat.messages, {
      channelId: s.general,
      paginationOpts: NO_CURSOR,
    });
    const item = page.page.find((m) => m._id === messageId);
    expect(item?.deleted).toBe(true);
    expect(item?.body).toBe("");

    const active = await s.t.run((ctx) =>
      ctx.db
        .query("chatMessages")
        .withIndex("by_channel_active", (q) =>
          q.eq("channelId", s.general).eq("deletedAt", null),
        )
        .collect(),
    );
    expect(active.some((m) => m._id === messageId)).toBe(false);
  });

  test("izmenu radi samo autor; reakcija se prebacuje", async () => {
    const s = await seedChatWorkspace();
    const messageId = messageIdOf(
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "original",
      }),
    );
    await expect(
      s.asMember.mutation(api.prostor.chat.editMessage, {
        messageId,
        body: "podmetnuto",
      }),
    ).rejects.toThrow("Možete izmeniti samo svoju poruku.");

    await s.asOwner.mutation(api.prostor.chat.editMessage, {
      messageId,
      body: "izmenjeno",
    });
    const edited = await s.t.run((ctx) => ctx.db.get("chatMessages", messageId));
    expect(edited?.body).toBe("izmenjeno");
    expect(edited?.editedAt).not.toBeNull();

    const first = await s.asMember.mutation(api.prostor.chat.toggleReaction, {
      messageId,
      emoji: "👍",
    });
    expect(first.reacted).toBe(true);
    const second = await s.asMember.mutation(api.prostor.chat.toggleReaction, {
      messageId,
      emoji: "👍",
    });
    expect(second.reacted).toBe(false);
  });

  test("opšti kanal se ne arhivira; samo admin pravi custom kanal", async () => {
    const s = await seedChatWorkspace();
    await expect(
      s.asOwner.mutation(api.prostor.chat.archiveChannel, { channelId: s.general }),
    ).rejects.toThrow("Opšti kanal se ne može arhivirati.");
    await expect(
      s.asMember.mutation(api.prostor.chat.createChannel, {
        workspaceId: s.workspaceId,
        name: "Random",
        isPrivate: false,
      }),
    ).rejects.toThrow("Ovu radnju može da izvede samo vlasnik platforme.");

    const customId = await s.asOwner.mutation(api.prostor.chat.createChannel, {
      workspaceId: s.workspaceId,
      name: "Random",
      isPrivate: false,
      memberProfileIds: [s.member.profileId],
    });
    const custom = await s.t.run((ctx) => ctx.db.get("chatChannels", customId));
    expect(custom?.kind).toBe("custom");

    const memberChannels = await s.asMember.query(api.prostor.chat.listChannels, {
      workspaceId: s.workspaceId,
    });
    expect(memberChannels.some((c) => c._id === customId)).toBe(true);
  });

  test("setChannelMembers: dodaje, uklanja, oživljava red i čuva vlasnika", async () => {
    const s = await seedChatWorkspace();
    const channelId = await s.asOwner.mutation(api.prostor.chat.createChannel, {
      workspaceId: s.workspaceId,
      name: "Privatno",
      isPrivate: true,
    });

    // Dodavanje dvoje: vlasnik + 2 = 3 aktivna člana.
    const first = await s.asOwner.mutation(api.prostor.chat.setChannelMembers, {
      channelId,
      memberProfileIds: [s.member.profileId, s.bystander.profileId],
    });
    expect(first.previousProfileIds).toEqual([s.owner.profileId]);
    expect(first.added).toBe(2);
    expect(first.removed).toBe(0);
    expect(
      await s.asOwner.query(api.prostor.chat.channelMembers, { channelId }),
    ).toHaveLength(3);
    // Dodat član sada zaista čita kanal (dozvola, ne samo red u tabeli).
    await s.asMember.query(api.prostor.chat.messages, {
      channelId,
      paginationOpts: NO_CURSOR,
    });

    // Uklanjanje: vlasnik je izostavljen iz spiska, ali OSTAJE član.
    const second = await s.asOwner.mutation(api.prostor.chat.setChannelMembers, {
      channelId,
      memberProfileIds: [s.bystander.profileId],
    });
    expect(second.removed).toBe(1);
    const afterRemove = await s.asOwner.query(api.prostor.chat.channelMembers, {
      channelId,
    });
    expect(afterRemove.map((row) => row.profile._id).sort()).toEqual(
      [s.owner.profileId, s.bystander.profileId].sort(),
    );
    await expect(
      s.asMember.query(api.prostor.chat.messages, {
        channelId,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");

    // Ponovno dodavanje: pristup se vraća, a red je i dalje TAČNO JEDAN za taj
    // par (dokaz da je `leftAt: null` patch, a ne nov insert).
    await s.asOwner.mutation(api.prostor.chat.setChannelMembers, {
      channelId,
      memberProfileIds: [s.member.profileId, s.bystander.profileId],
    });
    await s.asMember.query(api.prostor.chat.messages, {
      channelId,
      paginationOpts: NO_CURSOR,
    });
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("chatMembers")
        .withIndex("by_channel_and_profile", (q) =>
          q.eq("channelId", channelId).eq("profileId", s.member.profileId),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1);
  });

  test("setChannelMembers: ne-admin, izvedeno članstvo i tuđi profil se odbijaju", async () => {
    const s = await seedChatWorkspace();
    const channelId = await s.asOwner.mutation(api.prostor.chat.createChannel, {
      workspaceId: s.workspaceId,
      name: "Privatno",
      isPrivate: true,
    });

    await expect(
      s.asMember.mutation(api.prostor.chat.setChannelMembers, {
        channelId,
        memberProfileIds: [s.bystander.profileId],
      }),
    ).rejects.toThrow("Ovu radnju može da izvede samo vlasnik platforme.");

    // Opšti kanal ima IZVEDENO članstvo — ručna lista bi ga razišla sa pristupom.
    await expect(
      s.asOwner.mutation(api.prostor.chat.setChannelMembers, {
        channelId: s.general,
        memberProfileIds: [s.member.profileId],
      }),
    ).rejects.toThrow("Članovi se biraju samo za kanale tima.");

    await expect(
      s.asOwner.mutation(api.prostor.chat.setChannelMembers, {
        channelId,
        memberProfileIds: [s.outsider.profileId],
      }),
    ).rejects.toThrow("Dodeljeni član mora pripadati ovom projektu.");
  });

  test("thread nad mišlju je vidljiv samo vlasniku misli", async () => {
    const s = await seedChatWorkspace();
    const thoughtId = await s.t.run((ctx) =>
      ctx.db.insert("thoughtNodes", {
        workspaceId: s.workspaceId,
        ownerProfileId: s.member.profileId,
        title: null,
        text: "privatna misao",
        searchText: "privatna misao",
        x: 0,
        y: 0,
        color: "neutral",
        conversionCount: 0,
        lastConvertedPageId: null,
        lastConvertedAt: null,
        archivedAt: null,
        createdAt: s.now,
        updatedAt: s.now,
      }),
    );

    // Vlasnik (member) sme da otvori diskusiju.
    await s.asMember.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "thought",
      anchorId: thoughtId,
      body: "beleška uz misao",
    });
    // Drugi član startupa (owner) ne nasleđuje pristup tuđoj misli.
    await expect(
      s.asOwner.mutation(api.prostor.chat.sendToAnchor, {
        workspaceId: s.workspaceId,
        anchorType: "thought",
        anchorId: thoughtId,
        body: "tuđe",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
  });

  test("generateUploadUrl: član kanala dobija URL, autsajder odbijen", async () => {
    const s = await seedChatWorkspace();
    const url = await s.asMember.mutation(api.prostor.chat.generateUploadUrl, {
      channelId: s.general,
      name: "slika.png",
      contentType: "image/png",
      size: 1024,
    });
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
    await expect(
      s.asOutsider.mutation(api.prostor.chat.generateUploadUrl, {
        channelId: s.general,
        name: "slika.png",
        contentType: "image/png",
        size: 1024,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("generateUploadUrl: prevelik i nepodržan fajl ne stignu do storage-a", async () => {
    const s = await seedChatWorkspace();
    // 60 MB slike je preko granice za sve osim videa (`maxPageFileBytesFor`).
    await expect(
      s.asMember.mutation(api.prostor.chat.generateUploadUrl, {
        channelId: s.general,
        name: "ogromna.png",
        contentType: "image/png",
        size: 60 * 1024 * 1024,
      }),
    ).rejects.toThrow("Prilog može imati najviše 50 MB.");
    await expect(
      s.asMember.mutation(api.prostor.chat.generateUploadUrl, {
        channelId: s.general,
        name: "virus.exe",
        contentType: "application/x-msdownload",
        size: 2,
      }),
    ).rejects.toThrow("Ovaj tip fajla nije podržan");
  });
});

// Sedam ciljanih scenarija iz docs/mobile/zadaci/1-3-testovi.md. Svaki stoji sam
// i eksplicitno tvrdi svoju granicu; poziva se na iste helpere (seedChatWorkspace,
// readFor) kao blok iznad.
describe("Z1.3 — sedam scenarija iz specifikacije", () => {
  const TASK_FIELDS = (s: ChatWorkspace, title: string) => ({
    workspaceId: s.workspaceId,
    areaId: s.areaId,
    parentPageId: null,
    kind: "task" as const,
    title,
    searchText: title.toLowerCase(),
    revision: 0,
    position: 0,
    taskStatus: "backlog" as const,
    taskPriority: null,
    assigneeProfileId: null,
    dueDate: null,
    taskSortAt: s.now,
    createdByProfileId: s.owner.profileId,
    updatedByProfileId: s.owner.profileId,
    archivedAt: null,
    createdAt: s.now,
    updatedAt: s.now,
  });

  test("1 — član startupa ne čita niti piše u tuđi DM", async () => {
    const s = await seedChatWorkspace();
    const dmId = await s.asOwner.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.workspaceId,
      otherProfileId: s.member.profileId,
    });
    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: dmId,
      body: "privatno",
    });

    // Bystander je punopravan član startupa, ali ne i DM-a → channel-nivo dozvole.
    await expect(
      s.asBystander.query(api.prostor.chat.messages, {
        channelId: dmId,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    await expect(
      s.asBystander.mutation(api.prostor.chat.sendMessage, {
        channelId: dmId,
        body: "upad",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");

    // Oba sagovornika i dalje čitaju svoj razgovor.
    const ownerView = await s.asOwner.query(api.prostor.chat.messages, {
      channelId: dmId,
      paginationOpts: NO_CURSOR,
    });
    const memberView = await s.asMember.query(api.prostor.chat.messages, {
      channelId: dmId,
      paginationOpts: NO_CURSOR,
    });
    expect(ownerView.page).toHaveLength(1);
    expect(memberView.page).toHaveLength(1);
  });

  test("2 — thread nasleđuje dozvole entiteta (outsider ne vidi task, član ne vidi tuđu misao)", async () => {
    const s = await seedChatWorkspace();

    // 2a — startup-granica: outsider ne vidi zadatak, pa ni diskusiju o njemu.
    const pageId = await s.t.run((ctx) =>
      ctx.db.insert("pages", TASK_FIELDS(s, "Zadatak")),
    );
    await s.asOwner.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
      body: "prvo pitanje",
    });
    const pageThread = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", pageId),
        )
        .unique(),
    );
    if (pageThread === null) throw new Error("Task-thread nije napravljen.");
    await expect(
      s.asOutsider.query(api.prostor.chat.messages, {
        channelId: pageThread._id,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");

    // 2b — vlasnička granica: misao je privatna svom vlasniku; owner (admin) je ne nasleđuje.
    const thoughtId = await s.t.run((ctx) =>
      ctx.db.insert("thoughtNodes", {
        workspaceId: s.workspaceId,
        ownerProfileId: s.member.profileId,
        title: null,
        text: "privatna misao",
        searchText: "privatna misao",
        x: 0,
        y: 0,
        color: "neutral",
        conversionCount: 0,
        lastConvertedPageId: null,
        lastConvertedAt: null,
        archivedAt: null,
        createdAt: s.now,
        updatedAt: s.now,
      }),
    );
    await s.asMember.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "thought",
      anchorId: thoughtId,
      body: "beleška uz misao",
    });
    const thoughtThread = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "thought").eq("anchorId", thoughtId),
        )
        .unique(),
    );
    if (thoughtThread === null) {
      throw new Error("Thread nad mišlju nije napravljen.");
    }
    // Pisanje u diskusiju tuđe misli — odbijeno i za admina.
    await expect(
      s.asOwner.mutation(api.prostor.chat.sendToAnchor, {
        workspaceId: s.workspaceId,
        anchorType: "thought",
        anchorId: thoughtId,
        body: "tuđe",
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    // Čitanje diskusije tuđe misli — takođe odbijeno.
    await expect(
      s.asOwner.query(api.prostor.chat.messages, {
        channelId: thoughtThread._id,
        paginationOpts: NO_CURSOR,
      }),
    ).rejects.toThrow("Nemate pristup ovom razgovoru.");
    // Vlasnik misli sme da čita svoju diskusiju.
    const ownerReads = await s.asMember.query(api.prostor.chat.messages, {
      channelId: thoughtThread._id,
      paginationOpts: NO_CURSOR,
    });
    expect(ownerReads.page.length).toBeGreaterThan(0);
  });

  test("3 — unread ne raste autoru, primaocima raste inkrementalno", async () => {
    const s = await seedChatWorkspace();
    for (const body of ["prva", "druga", "treća"]) {
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body,
      });
    }
    expect((await readFor(s, s.general, s.member.profileId))?.unreadCount).toBe(3);
    expect(
      (await readFor(s, s.general, s.bystander.profileId))?.unreadCount,
    ).toBe(3);
    // Autoru se chatReads red uopšte ne pravi (tvrdnja jača od „0").
    expect(await readFor(s, s.general, s.owner.profileId)).toBeNull();
  });

  test("4 — markChannelRead nulira unreadCount i mentionCount i pomera lastRead", async () => {
    const s = await seedChatWorkspace();
    const messageId = messageIdOf(
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "hej Member",
        mentions: [s.member.profileId],
      }),
    );
    const before = await readFor(s, s.general, s.member.profileId);
    expect(before?.unreadCount).toBe(1);
    expect(before?.mentionCount).toBe(1);

    await s.asMember.mutation(api.prostor.chat.markChannelRead, {
      channelId: s.general,
    });
    const after = await readFor(s, s.general, s.member.profileId);
    expect(after?.unreadCount).toBe(0);
    expect(after?.mentionCount).toBe(0);
    expect(after?.lastReadMessageId).toBe(messageId);
    expect(after?.lastReadAt ?? 0).toBeGreaterThan(0);
  });

  test("5 — openDirectMessage vraća isti kanal bez obzira ko prvi pozove", async () => {
    const s = await seedChatWorkspace();
    const dm1 = await s.asOwner.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.workspaceId,
      otherProfileId: s.member.profileId,
    });
    const dm2 = await s.asMember.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.workspaceId,
      otherProfileId: s.owner.profileId,
    });
    expect(dm1).toBe(dm2);

    const dmKey = [s.owner.profileId, s.member.profileId].sort().join(":");
    const rows = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_workspace_and_dmKey", (q) =>
          q.eq("workspaceId", s.workspaceId).eq("dmKey", dmKey),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1);

    // Granični slučaji: DM sa samim sobom i nečlan startupa.
    await expect(
      s.asOwner.mutation(api.prostor.chat.openDirectMessage, {
        workspaceId: s.workspaceId,
        otherProfileId: s.owner.profileId,
      }),
    ).rejects.toThrow("Ne možete otvoriti razgovor sa samim sobom.");
    await expect(
      s.asOutsider.mutation(api.prostor.chat.openDirectMessage, {
        workspaceId: s.workspaceId,
        otherProfileId: s.member.profileId,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });

  test("6 — lazy thread nastaje tek pri prvoj poruci, tačno jednom", async () => {
    const s = await seedChatWorkspace();
    const pageId = await s.t.run((ctx) =>
      ctx.db.insert("pages", TASK_FIELDS(s, "Zadatak")),
    );

    const before = await s.asOwner.query(api.prostor.chat.channelForAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(before).toBeNull();

    await s.asOwner.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
      body: "prvo",
    });
    await s.asMember.mutation(api.prostor.chat.sendToAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
      body: "drugo",
    });

    const after = await s.asOwner.query(api.prostor.chat.channelForAnchor, {
      workspaceId: s.workspaceId,
      anchorType: "page",
      anchorId: pageId,
    });
    expect(after).not.toBeNull();

    const threads = await s.t.run((ctx) =>
      ctx.db
        .query("chatChannels")
        .withIndex("by_anchor", (q) =>
          q.eq("anchorType", "page").eq("anchorId", pageId),
        )
        .collect(),
    );
    expect(threads).toHaveLength(1);
  });

  test("7 — opšti kanal: implicitno članstvo i zabrana arhiviranja", async () => {
    const s = await seedChatWorkspace();

    // Opšti kanal nema nijedan chatMembers red — članstvo je implicitno.
    const generalMembers = await s.t.run((ctx) =>
      ctx.db
        .query("chatMembers")
        .withIndex("by_channel", (q) =>
          q.eq("channelId", s.general).eq("leftAt", null),
        )
        .collect(),
    );
    expect(generalMembers).toHaveLength(0);

    // Član bez chatMembers reda vidi kanal u listi i sme da piše.
    const channels = await s.asMember.query(api.prostor.chat.listChannels, {
      workspaceId: s.workspaceId,
    });
    expect(channels.some((c) => c._id === s.general)).toBe(true);
    await expect(
      s.asMember.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "svima",
      }),
    ).resolves.toBeDefined();

    // Implicitni primaoci: ostali članovi startupa dobijaju unread.
    expect((await readFor(s, s.general, s.owner.profileId))?.unreadCount).toBe(1);
    expect(
      (await readFor(s, s.general, s.bystander.profileId))?.unreadCount,
    ).toBe(1);

    // Ne arhivira se — ni admin.
    await expect(
      s.asOwner.mutation(api.prostor.chat.archiveChannel, { channelId: s.general }),
    ).rejects.toThrow("Opšti kanal se ne može arhivirati.");

    // Kontrola: admin sme da arhivira običan (custom) kanal.
    const customId = await s.asOwner.mutation(api.prostor.chat.createChannel, {
      workspaceId: s.workspaceId,
      name: "Random",
      isPrivate: false,
    });
    await expect(
      s.asOwner.mutation(api.prostor.chat.archiveChannel, { channelId: customId }),
    ).resolves.toBeNull();
  });
});

/**
 * Obaveštenja o porukama (lanac 5, §1). Ranije je `dedupeKey` bio kanta od jednog
 * kalendarskog minuta, pa je od rafala poruka zvonila samo prva — ovi testovi
 * zakivaju da svaka poruka zvoni, i da postoji tačno jedan izuzetak.
 */
function notificationsFor(s: ChatWorkspace, profileId: Id<"profiles">) {
  return s.t.run((ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_recipient_and_workspace_and_createdAt", (q) =>
        q.eq("recipientProfileId", profileId).eq("workspaceId", s.workspaceId),
      )
      .collect(),
  );
}

describe("chat obaveštenja", () => {
  test("rafal poruka daje po jedno obaveštenje za svaku", async () => {
    const s = await seedChatWorkspace();
    for (const body of ["1", "2", "3", "4", "5"]) {
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body,
      });
    }

    const received = await notificationsFor(s, s.member.profileId);
    expect(received).toHaveLength(5);
    // Ključ je po PORUCI: pet različitih ključeva, nijedan po minutu.
    expect(new Set(received.map((row) => row.dedupeKey)).size).toBe(5);
    // Autor nikad ne dobija obaveštenje o svojoj poruci.
    expect(await notificationsFor(s, s.owner.profileId)).toHaveLength(0);
  });

  test("prisutan primalac (gleda kanal, na dnu) ne dobija obaveštenja, ali unread ostaje tačan", async () => {
    const s = await seedChatWorkspace();
    await s.asMember.mutation(api.prostor.chat.setPresence, {
      channelId: s.general,
      present: true,
    });

    for (const body of ["a", "b", "c"]) {
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body,
      });
    }

    expect(await notificationsFor(s, s.member.profileId)).toHaveLength(0);
    // Prisustvo gasi SAMO obaveštenje — badge mora da ostane tačan i ako
    // `markChannelRead` sa klijenta padne.
    expect((await readFor(s, s.general, s.member.profileId))?.unreadCount).toBe(3);
    // Prisustvo je po kanalu i po korisniku: drugi član i dalje dobija svoje.
    expect(await notificationsFor(s, s.bystander.profileId)).toHaveLength(3);
  });

  test("pominjanje prisutnog primaoca takođe ćuti — video ga je uživo", async () => {
    const s = await seedChatWorkspace();
    await s.asMember.mutation(api.prostor.chat.setPresence, {
      channelId: s.general,
      present: true,
    });
    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "@Member pogledaj ovo",
      mentions: [s.member.profileId],
    });
    expect(await notificationsFor(s, s.member.profileId)).toHaveLength(0);
  });

  test("istekao žig prisustva ponovo pušta obaveštenja", async () => {
    const s = await seedChatWorkspace();
    await s.asMember.mutation(api.prostor.chat.setPresence, {
      channelId: s.general,
      present: true,
    });
    // Simulacija ugašenog ekrana / pukle mreže: otkucaj više ne stiže.
    await s.t.run(async (ctx) => {
      const row = await ctx.db
        .query("chatPresence")
        .withIndex("by_channel_and_profile", (q) =>
          q.eq("channelId", s.general).eq("profileId", s.member.profileId),
        )
        .unique();
      if (row === null) throw new Error("Red prisustva nije napravljen.");
      await ctx.db.patch("chatPresence", row._id, { expiresAt: Date.now() - 1 });
    });

    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "posle isteka",
    });
    expect(await notificationsFor(s, s.member.profileId)).toHaveLength(1);
  });

  test("eksplicitno gašenje prisustva (skrol gore, blur) odmah vraća obaveštenja", async () => {
    const s = await seedChatWorkspace();
    await s.asMember.mutation(api.prostor.chat.setPresence, {
      channelId: s.general,
      present: true,
    });
    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "dok gleda",
    });
    await s.asMember.mutation(api.prostor.chat.setPresence, {
      channelId: s.general,
      present: false,
    });
    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "pošto je skrolovao gore",
    });

    const received = await notificationsFor(s, s.member.profileId);
    expect(received).toHaveLength(1);
    expect(received[0].body).toBe("pošto je skrolovao gore");
  });

  test("prisustvo u DRUGOM kanalu ne gasi obaveštenja iz ovog", async () => {
    const s = await seedChatWorkspace();
    // DM je najjeftiniji „drugi kanal" kome primalac sigurno ima pristup.
    const other = await s.asOwner.mutation(api.prostor.chat.openDirectMessage, {
      workspaceId: s.workspaceId,
      otherProfileId: s.member.profileId,
    });
    await s.asMember.mutation(api.prostor.chat.setPresence, {
      channelId: other,
      present: true,
    });
    await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "iz opšteg",
    });
    expect(await notificationsFor(s, s.member.profileId)).toHaveLength(1);
  });
});

describe("chat prilozi", () => {
  test("odbijen prilog se VRAĆA, a blob se briše (nema siročeta)", async () => {
    const s = await seedChatWorkspace();
    const storageId = await s.t.run((ctx) =>
      ctx.storage.store(new Blob(["MZ"], { type: "application/x-msdownload" })),
    );
    const result = await s.asOwner.mutation(api.prostor.chat.sendMessage, {
      channelId: s.general,
      body: "",
      kind: "file",
      attachmentStorageId: storageId,
      attachmentName: "virus.exe",
      // Klijent laže da je slika — server mu ne veruje.
      attachmentType: "image/png",
      attachmentSize: 2,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Nepodržan prilog je prošao.");
    expect(result.reason).toBe("unsupported");
    expect(result.message).toContain("Ovaj tip fajla nije podržan");
    // Suština izmene: `throw` bi poništio i brisanje, pa bi blob ostao zauvek.
    expect(
      await s.t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).toBeNull();
    // Poruka se NE upisuje.
    const page = await s.asOwner.query(api.prostor.chat.messages, {
      channelId: s.general,
      paginationOpts: NO_CURSOR,
    });
    expect(page.page).toHaveLength(0);
  });

  test("odbijanje ne briše blob koji je već zakačen negde drugde", async () => {
    const s = await seedChatWorkspace();
    const storageId = await s.t.run((ctx) =>
      ctx.storage.store(new Blob(["12345"], { type: "image/png" })),
    );
    // Blob je legitimno zakačen za prvu poruku…
    const first = messageIdOf(
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "",
        kind: "file",
        attachmentStorageId: storageId,
        attachmentName: "snimak.png",
      }),
    );
    expect(first).toBeDefined();

    // …a drugi poziv laže ime da bi ga naterao u granu koja briše.
    await expect(
      s.asMember.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "",
        kind: "file",
        attachmentStorageId: storageId,
        attachmentName: "virus.exe",
      }),
    ).rejects.toThrow("Ovaj fajl je već zakačen.");
    expect(
      await s.t.run((ctx) => ctx.db.system.get("_storage", storageId)),
    ).not.toBeNull();
  });

  test("prihvaćen prilog dobija tip i veličinu iz metapodataka, ne iz argumenata", async () => {
    const s = await seedChatWorkspace();
    const storageId = await s.t.run((ctx) =>
      ctx.storage.store(new Blob(["12345"], { type: "image/png" })),
    );
    const messageId = messageIdOf(
      await s.asOwner.mutation(api.prostor.chat.sendMessage, {
        channelId: s.general,
        body: "",
        kind: "file",
        attachmentStorageId: storageId,
        attachmentName: "snimak-2026-08-12-14-03-51.png",
        // Klijent laže i o tipu i o veličini; oba se moraju pregaziti serverskim.
        // Tip koji klijent šalje namerno se razlikuje od tipa bloba ("image/png").
        attachmentType: "application/pdf",
        attachmentSize: 999_999,
      }),
    );
    const message = await s.t.run((ctx) =>
      ctx.db.get("chatMessages", messageId),
    );
    expect(message?.attachmentSize).toBe(5);
    // `convex-test` 0.0.65 pamti `contentType` bloba u `_storage` metapodacima,
    // pa server upisuje "image/png" iz skladišta. Poenta testa: upisana vrednost
    // NIJE ona iz argumenata ("application/pdf").
    expect(message?.attachmentType).toBe("image/png");
    expect(message?.attachmentType).not.toBe("application/pdf");
  });
});
