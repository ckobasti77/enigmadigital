/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/inbox.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  INBOX_MARK_ALL_BATCH,
  INBOX_PENDING_CAP,
  INBOX_UNREAD_SCAN_CAP,
} from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

/** Osnova vremena: stavke se razlikuju za po jednu sekundu, pa je redosled jednoznačan. */
const BASE = 1_700_000_000_000;
const first = { numItems: 20, cursor: null };

afterEach(() => {
  vi.useRealTimers();
});

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
      a: await workspace("Cluck Rush", [
        { profileId: me.profileId },
        { profileId: other.profileId },
      ]),
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

async function insertNotification(
  ctx: MutationCtx,
  options: {
    recipient: Id<"profiles">;
    workspaceId: Id<"workspaces">;
    title: string;
    createdAt: number;
    read?: boolean;
    actor?: Id<"profiles"> | null;
  },
) {
  return await ctx.db.insert("notifications", {
    recipientProfileId: options.recipient,
    workspaceId: options.workspaceId,
    type: "task_assigned",
    title: options.title,
    targetType: "page",
    targetId: null,
    actorProfileId: options.actor ?? null,
    dedupeKey: null,
    readAt: options.read === true ? options.createdAt + 1 : null,
    createdAt: options.createdAt,
  });
}

/** Ne-zadatak stranica (beleška) za zahteve za ugnežđavanje. */
async function insertNote(
  ctx: MutationCtx,
  options: {
    scope: { workspaceId: Id<"workspaces">; areaId: Id<"areas"> };
    title: string;
    createdBy: Id<"profiles">;
    archivedAt?: number | null;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("pages", {
    workspaceId: options.scope.workspaceId,
    areaId: options.scope.areaId,
    parentPageId: null,
    kind: "note",
    title: options.title,
    searchText: options.title,
    revision: 0,
    position: 0,
    taskStatus: null,
    taskPriority: null,
    assigneeProfileId: null,
    dueDate: null,
    taskSortAt: 0,
    createdByProfileId: options.createdBy,
    updatedByProfileId: options.createdBy,
    archivedAt: options.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertIdea(
  ctx: MutationCtx,
  options: {
    workspaceId: Id<"workspaces">;
    author: Id<"profiles">;
    title: string | null;
    text?: string;
    archivedAt?: number | null;
  },
) {
  const now = Date.now();
  return await ctx.db.insert("ideaNodes", {
    workspaceId: options.workspaceId,
    authorProfileId: options.author,
    title: options.title,
    text: options.text ?? "",
    x: 0,
    y: 0,
    color: "violet",
    convertedPageId: null,
    convertedAt: null,
    archivedAt: options.archivedAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

async function insertDeletion(
  ctx: MutationCtx,
  options: {
    workspaceId: Id<"workspaces">;
    requester: Id<"profiles">;
    voter: Id<"profiles">;
    title: string;
    createdAt: number;
    status?: "pending" | "approved" | "rejected" | "withdrawn" | "cancelled";
    vote?: "pending" | "approve" | "reject" | "excused";
  },
) {
  const requestId = await ctx.db.insert("deletionRequests", {
    workspaceId: options.workspaceId,
    targetKind: "page",
    targetId: `page-${options.title}`,
    targetTitle: options.title,
    requesterProfileId: options.requester,
    status: options.status ?? "pending",
    eligibleCount: 2,
    approveCount: 1,
    rejectCount: 0,
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    resolvedAt: null,
  });
  const ballotId = await ctx.db.insert("deletionBallots", {
    requestId,
    workspaceId: options.workspaceId,
    profileId: options.voter,
    vote: options.vote ?? "pending",
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
  });
  return { requestId, ballotId };
}

async function insertPageNesting(
  ctx: MutationCtx,
  options: {
    scope: { workspaceId: Id<"workspaces">; areaId: Id<"areas"> };
    childPageId: Id<"pages">;
    parentPageId: Id<"pages">;
    requester: Id<"profiles">;
    parentAuthor: Id<"profiles">;
    createdAt: number;
    status?: "pending" | "approved" | "rejected" | "withdrawn" | "cancelled";
  },
) {
  return await ctx.db.insert("pageNestingRequests", {
    workspaceId: options.scope.workspaceId,
    areaId: options.scope.areaId,
    childPageId: options.childPageId,
    sourceParentPageId: null,
    targetParentPageId: options.parentPageId,
    requesterProfileId: options.requester,
    parentAuthorProfileId: options.parentAuthor,
    expectedTreeRevision: 0,
    status: options.status ?? "pending",
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    resolvedAt: null,
  });
}

async function insertIdeaNesting(
  ctx: MutationCtx,
  options: {
    workspaceId: Id<"workspaces">;
    childIdeaId: Id<"ideaNodes">;
    parentIdeaId: Id<"ideaNodes">;
    requester: Id<"profiles">;
    parentAuthor: Id<"profiles">;
    createdAt: number;
    status?: "pending" | "approved" | "rejected" | "withdrawn" | "cancelled";
  },
) {
  return await ctx.db.insert("nestingRequests", {
    workspaceId: options.workspaceId,
    childIdeaId: options.childIdeaId,
    parentIdeaId: options.parentIdeaId,
    requesterProfileId: options.requester,
    parentAuthorProfileId: options.parentAuthor,
    status: options.status ?? "pending",
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    resolvedAt: null,
  });
}

describe("inbox.feed", () => {
  test("vraća obaveštenja iz oba startupa, najnovije prvo, sa mini podacima startupa", async () => {
    const { t, me, other, a, b, asMe } = await seed();
    await t.run(async (ctx) => {
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: a.workspaceId,
        title: "A najstarije",
        createdAt: BASE,
      });
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: b.workspaceId,
        title: "B srednje",
        createdAt: BASE + 1_000,
        actor: other.profileId,
      });
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: a.workspaceId,
        title: "A najnovije",
        createdAt: BASE + 2_000,
      });
    });

    const result = await asMe.query(api.prostor.inbox.feed, { paginationOpts: first });

    expect(result.page.map((item) => item.title)).toEqual([
      "A najnovije",
      "B srednje",
      "A najstarije",
    ]);
    expect(result.page[0].workspace).toEqual({
      _id: a.workspaceId,
      name: "Cluck Rush",
      logoUrl: null,
    });
    expect(result.page[1].workspace).toEqual({
      _id: b.workspaceId,
      name: "Scan Me",
      logoUrl: null,
    });
    expect(result.page[1].actor).toMatchObject({
      _id: other.profileId,
      displayName: "Ana",
    });
    expect(result.isDone).toBe(true);
  });

  test("stavka nosi tačan skup polja", async () => {
    const { t, me, a, asMe } = await seed();
    await t.run(async (ctx) => {
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: a.workspaceId,
        title: "Samo jedna",
        createdAt: BASE,
      });
    });

    const [item] = (await asMe.query(api.prostor.inbox.feed, { paginationOpts: first }))
      .page;

    expect(Object.keys(item).sort()).toEqual(
      [
        "_creationTime",
        "_id",
        "actor",
        "actorProfileId",
        "createdAt",
        "dedupeKey",
        "readAt",
        "recipientProfileId",
        "workspace",
        "workspaceId",
        "targetId",
        "targetType",
        "title",
        "type",
      ].sort(),
    );
  });

  test("ne vraća startup sa arhiviranim članstvom, arhiviran startup ni tuđa obaveštenja", async () => {
    const { t, me, other, a, c, d, e, asMe, asOther } = await seed();
    await t.run(async (ctx) => {
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: a.workspaceId,
        title: "Moje A",
        createdAt: BASE,
      });
      // Obaveštenje je ostalo od ranije, ali više nisam aktivan član ili je startup arhiviran.
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: d.workspaceId,
        title: "Moje D (napušten)",
        createdAt: BASE + 1_000,
      });
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: e.workspaceId,
        title: "Moje E (arhiviran)",
        createdAt: BASE + 2_000,
      });
      await insertNotification(ctx, {
        recipient: other.profileId,
        workspaceId: a.workspaceId,
        title: "Anino A",
        createdAt: BASE + 3_000,
      });
      await insertNotification(ctx, {
        recipient: other.profileId,
        workspaceId: c.workspaceId,
        title: "Anino C",
        createdAt: BASE + 4_000,
      });
    });

    const mine = await asMe.query(api.prostor.inbox.feed, { paginationOpts: first });
    expect(mine.page.map((item) => item.title)).toEqual(["Moje A"]);
    expect(
      mine.page.every((item) => item.recipientProfileId === me.profileId),
    ).toBe(true);

    const theirs = await asOther.query(api.prostor.inbox.feed, {
      paginationOpts: first,
    });
    expect(theirs.page.map((item) => item.title)).toEqual([
      "Anino C",
      "Anino A",
    ]);
  });

  test("unreadOnly vraća samo nepročitano, i uz filter po startupu", async () => {
    const { t, me, a, b, asMe } = await seed();
    await t.run(async (ctx) => {
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: a.workspaceId,
        title: "A pročitano",
        createdAt: BASE,
        read: true,
      });
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: a.workspaceId,
        title: "A nepročitano",
        createdAt: BASE + 1_000,
      });
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: b.workspaceId,
        title: "B nepročitano",
        createdAt: BASE + 2_000,
      });
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: b.workspaceId,
        title: "B pročitano",
        createdAt: BASE + 3_000,
        read: true,
      });
    });

    const unread = await asMe.query(api.prostor.inbox.feed, {
      paginationOpts: first,
      unreadOnly: true,
    });
    expect(unread.page.map((item) => item.title)).toEqual([
      "B nepročitano",
      "A nepročitano",
    ]);

    const unreadInA = await asMe.query(api.prostor.inbox.feed, {
      paginationOpts: first,
      unreadOnly: true,
      workspaceId: a.workspaceId,
    });
    expect(unreadInA.page.map((item) => item.title)).toEqual([
      "A nepročitano",
    ]);

    const everythingInB = await asMe.query(api.prostor.inbox.feed, {
      paginationOpts: first,
      workspaceId: b.workspaceId,
    });
    expect(everythingInB.page.map((item) => item.title)).toEqual([
      "B pročitano",
      "B nepročitano",
    ]);
  });

  test("startupId bez članstva, sa arhiviranim članstvom ili arhiviran startup → greška", async () => {
    const { t, me, c, d, e, asMe } = await seed();
    await t.run(async (ctx) => {
      for (const workspace of [c, d, e]) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: workspace.workspaceId,
          title: "Ne sme da procuri",
          createdAt: BASE,
        });
      }
    });

    await expect(
      asMe.query(api.prostor.inbox.feed, {
        paginationOpts: first,
        workspaceId: c.workspaceId,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      asMe.query(api.prostor.inbox.feed, {
        paginationOpts: first,
        workspaceId: d.workspaceId,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      asMe.query(api.prostor.inbox.feed, {
        paginationOpts: first,
        workspaceId: e.workspaceId,
      }),
    ).rejects.toThrow("Projekat nije pronađen.");
  });

  test("stranice: bez duplikata i izgubljenih stavki; numItems preko granice → greška", async () => {
    const { t, me, a, b, asMe } = await seed();
    await t.run(async (ctx) => {
      for (let index = 0; index < 5; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: index % 2 === 0 ? a.workspaceId : b.workspaceId,
          title: `Stavka ${index}`,
          createdAt: BASE + index * 1_000,
        });
      }
    });

    type FeedPage = {
      page: Array<{ title: string }>;
      isDone: boolean;
      continueCursor: string;
    };
    const fetchPage = (cursor: string | null): Promise<FeedPage> =>
      asMe.query(api.prostor.inbox.feed, { paginationOpts: { numItems: 2, cursor } });

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard += 1) {
      const result: FeedPage = await fetchPage(cursor);
      seen.push(...result.page.map((item) => item.title));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(seen).toEqual([
      "Stavka 4",
      "Stavka 3",
      "Stavka 2",
      "Stavka 1",
      "Stavka 0",
    ]);

    await expect(
      asMe.query(api.prostor.inbox.feed, {
        paginationOpts: { numItems: 51, cursor: null },
      }),
    ).rejects.toThrow("Limit mora biti ceo broj između 1 i 50.");
  });

  test("neprijavljen → greška", async () => {
    const { t } = await seed();
    await expect(
      t.query(api.prostor.inbox.feed, { paginationOpts: first }),
    ).rejects.toThrow("Niste prijavljeni.");
  });
});

describe("inbox.unreadCounts", () => {
  test("broji po startupu, bez napuštenih, arhiviranih i tuđih", async () => {
    const { t, me, other, a, b, c, d, e, asMe, asOther } = await seed();
    await t.run(async (ctx) => {
      const rows: Array<[Id<"profiles">, Id<"workspaces">, number, boolean]> = [
        [me.profileId, a.workspaceId, 3, false],
        [me.profileId, a.workspaceId, 2, true], // pročitano se ne broji
        [me.profileId, b.workspaceId, 1, false],
        [me.profileId, d.workspaceId, 4, false], // napušten
        [me.profileId, e.workspaceId, 5, false], // arhiviran
        [other.profileId, a.workspaceId, 7, false], // tuđe
        [other.profileId, c.workspaceId, 2, false],
      ];
      let offset = 0;
      for (const [recipient, workspaceId, count, read] of rows) {
        for (let index = 0; index < count; index += 1) {
          await insertNotification(ctx, {
            recipient,
            workspaceId,
            title: `n${offset}`,
            createdAt: BASE + offset * 1_000,
            read,
          });
          offset += 1;
        }
      }
    });

    const counts = await asMe.query(api.prostor.inbox.unreadCounts, {});
    expect(counts.total).toEqual({ count: 4, capped: false });
    expect(counts.personal).toEqual({ count: 0, capped: false });
    expect(
      Object.fromEntries(
        counts.byStartup.map((entry) => [entry.workspaceId, entry.count]),
      ),
    ).toEqual({ [a.workspaceId]: 3, [b.workspaceId]: 1 });
    expect(counts.byStartup.every((entry) => !entry.capped)).toBe(true);

    const theirs = await asOther.query(api.prostor.inbox.unreadCounts, {});
    expect(theirs.total.count).toBe(7 + 2);
  });

  test("bez obaveštenja: nule i prazan spisak", async () => {
    const { asMe } = await seed();
    const counts = await asMe.query(api.prostor.inbox.unreadCounts, {});
    expect(counts).toEqual({
      total: { count: 0, capped: false },
      byStartup: [],
      personal: { count: 0, capped: false },
    });
  });

  test("granica skeniranja: svi brojači su capped", async () => {
    const { t, me, a, asMe } = await seed();
    await t.run(async (ctx) => {
      for (let index = 0; index < INBOX_UNREAD_SCAN_CAP + 5; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: a.workspaceId,
          title: `n${index}`,
          createdAt: BASE + index,
        });
      }
    });

    const counts = await asMe.query(api.prostor.inbox.unreadCounts, {});
    expect(counts.total).toEqual({
      count: INBOX_UNREAD_SCAN_CAP,
      capped: true,
    });
    expect(counts.byStartup).toEqual([
      { workspaceId: a.workspaceId, count: INBOX_UNREAD_SCAN_CAP, capped: true },
    ]);
    expect(counts.personal.capped).toBe(true);
  });

  test("neprijavljen → greška", async () => {
    const { t } = await seed();
    await expect(t.query(api.prostor.inbox.unreadCounts, {})).rejects.toThrow(
      "Niste prijavljeni.",
    );
  });
});

describe("inbox.markAllRead", () => {
  const unreadFor = (
    t: Awaited<ReturnType<typeof seed>>["t"],
    profileId: Id<"profiles">,
  ) =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("notifications")
          .withIndex("by_recipient_and_readAt", (q) =>
            q.eq("recipientProfileId", profileId).eq("readAt", null),
          )
          .collect()
      ).length,
    );

  const scheduledNames = (t: Awaited<ReturnType<typeof seed>>["t"]) =>
    t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).map(
        (entry) => entry.name,
      ),
    );

  test("250 obaveštenja: prva serija 200, ostatak kroz scheduler", async () => {
    vi.useFakeTimers();
    const { t, me, other, a, b, d, asMe } = await seed();
    await t.run(async (ctx) => {
      for (let index = 0; index < 150; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: a.workspaceId,
          title: `A${index}`,
          createdAt: BASE + index,
        });
      }
      for (let index = 0; index < 90; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: b.workspaceId,
          title: `B${index}`,
          createdAt: BASE + 1_000 + index,
        });
      }
      // Iz startupa koji više nije u opsegu: pročita se, da brojač ne ostane zaglavljen.
      for (let index = 0; index < 10; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: d.workspaceId,
          title: `D${index}`,
          createdAt: BASE + 2_000 + index,
        });
      }
      await insertNotification(ctx, {
        recipient: other.profileId,
        workspaceId: a.workspaceId,
        title: "Tuđe",
        createdAt: BASE,
      });
    });
    expect(await unreadFor(t, me.profileId)).toBe(250);

    const result = await asMe.mutation(api.prostor.inbox.markAllRead, {});

    expect(result).toEqual({ marked: INBOX_MARK_ALL_BATCH, hasMore: true });
    expect(await unreadFor(t, me.profileId)).toBe(50);
    expect(await scheduledNames(t)).toEqual(["prostor/inbox:markAllReadBatch"]);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await unreadFor(t, me.profileId)).toBe(0);
    // Tuđa obaveštenja nisu dirnuta.
    expect(await unreadFor(t, other.profileId)).toBe(1);
    const counts = await asMe.query(api.prostor.inbox.unreadCounts, {});
    expect(counts.total.count).toBe(0);
  });

  test("manje od jedne serije: ništa se ne zakazuje", async () => {
    const { t, me, a, asMe } = await seed();
    await t.run(async (ctx) => {
      for (let index = 0; index < 3; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: a.workspaceId,
          title: `n${index}`,
          createdAt: BASE + index,
        });
      }
    });

    expect(await asMe.mutation(api.prostor.inbox.markAllRead, {})).toEqual({
      marked: 3,
      hasMore: false,
    });
    expect(await scheduledNames(t)).toEqual([]);
    expect(await asMe.mutation(api.prostor.inbox.markAllRead, {})).toEqual({
      marked: 0,
      hasMore: false,
    });
  });

  test("sa startupId čita samo taj startup", async () => {
    const { t, me, a, b, asMe } = await seed();
    await t.run(async (ctx) => {
      for (let index = 0; index < 3; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: a.workspaceId,
          title: `A${index}`,
          createdAt: BASE + index,
        });
      }
      for (let index = 0; index < 2; index += 1) {
        await insertNotification(ctx, {
          recipient: me.profileId,
          workspaceId: b.workspaceId,
          title: `B${index}`,
          createdAt: BASE + 1_000 + index,
        });
      }
    });

    expect(
      await asMe.mutation(api.prostor.inbox.markAllRead, { workspaceId: a.workspaceId }),
    ).toEqual({ marked: 3, hasMore: false });

    const counts = await asMe.query(api.prostor.inbox.unreadCounts, {});
    expect(counts.byStartup).toEqual([
      { workspaceId: b.workspaceId, count: 2, capped: false },
    ]);
  });

  test("startupId bez članstva → greška i ništa se ne menja", async () => {
    const { t, me, other, c, d, asMe } = await seed();
    await t.run(async (ctx) => {
      await insertNotification(ctx, {
        recipient: me.profileId,
        workspaceId: d.workspaceId,
        title: "Ostaje nepročitano",
        createdAt: BASE,
      });
      await insertNotification(ctx, {
        recipient: other.profileId,
        workspaceId: c.workspaceId,
        title: "Tuđe",
        createdAt: BASE,
      });
    });

    await expect(
      asMe.mutation(api.prostor.inbox.markAllRead, { workspaceId: c.workspaceId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    await expect(
      asMe.mutation(api.prostor.inbox.markAllRead, { workspaceId: d.workspaceId }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
    expect(await unreadFor(t, me.profileId)).toBe(1);
    expect(await unreadFor(t, other.profileId)).toBe(1);
  });

  test("neprijavljen → greška", async () => {
    const { t } = await seed();
    await expect(t.mutation(api.prostor.inbox.markAllRead, {})).rejects.toThrow(
      "Niste prijavljeni.",
    );
  });
});

describe("inbox.pending", () => {
  // PROSTOR K03 (P4, P22): glasanja o brisanju i zahtevi za ugnežđavanje su
  // ugašeni — stari otvoreni zahtevi se više ne nude kao „Čeka tebe" ni kad
  // čekaju baš mene. Nove stavke (`idea_vote`) dodaje K05.
  test("stari izvori (glasanja i oba zahteva) se više ne vraćaju, ni moji", async () => {
    const { t, me, other, a, b, asMe } = await seed();
    await t.run(async (ctx) => {
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: other.profileId,
        voter: me.profileId,
        title: "Stara beleška",
        createdAt: BASE,
      });

      const child = await insertNote(ctx, {
        scope: b,
        title: "Dete",
        createdBy: other.profileId,
      });
      const parent = await insertNote(ctx, {
        scope: b,
        title: "Roditelj",
        createdBy: me.profileId,
      });
      await insertPageNesting(ctx, {
        scope: b,
        childPageId: child,
        parentPageId: parent,
        requester: other.profileId,
        parentAuthor: me.profileId,
        createdAt: BASE + 2_000,
      });

      const childIdea = await insertIdea(ctx, {
        workspaceId: a.workspaceId,
        author: other.profileId,
        title: null,
        text: "Ideja samo sa tekstom",
      });
      const parentIdea = await insertIdea(ctx, {
        workspaceId: a.workspaceId,
        author: me.profileId,
        title: "Ideja roditelj",
      });
      await insertIdeaNesting(ctx, {
        workspaceId: a.workspaceId,
        childIdeaId: childIdea,
        parentIdeaId: parentIdea,
        requester: other.profileId,
        parentAuthor: me.profileId,
        createdAt: BASE + 1_000,
      });

      // Tuđe: Ana je glasač i autor roditelja — meni se ne prikazuje.
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: me.profileId,
        voter: other.profileId,
        title: "Anino glasanje",
        createdAt: BASE + 3_000,
      });
      const mineChild = await insertNote(ctx, {
        scope: a,
        title: "Moje dete",
        createdBy: me.profileId,
      });
      const anaParent = await insertNote(ctx, {
        scope: a,
        title: "Anin roditelj",
        createdBy: other.profileId,
      });
      await insertPageNesting(ctx, {
        scope: a,
        childPageId: mineChild,
        parentPageId: anaParent,
        requester: me.profileId,
        parentAuthor: other.profileId,
        createdAt: BASE + 4_000,
      });
      await insertIdeaNesting(ctx, {
        workspaceId: a.workspaceId,
        childIdeaId: parentIdea,
        parentIdeaId: childIdea,
        requester: me.profileId,
        parentAuthor: other.profileId,
        createdAt: BASE + 5_000,
      });

    });

    expect(await asMe.query(api.prostor.inbox.pending, {})).toEqual({ items: [], truncated: false });
  });

  test("ni otvoreni ni odlučeni stari zahtevi i listići ne prave stavke", async () => {
    const { t, me, other, a, asMe } = await seed();
    await t.run(async (ctx) => {
      // Moj glas je već dat.
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: other.profileId,
        voter: me.profileId,
        title: "Već glasano",
        createdAt: BASE,
        vote: "approve",
      });
      // Listić je ostao `pending`, ali je zahtev odbijen ili povučen.
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: other.profileId,
        voter: me.profileId,
        title: "Odbijeno",
        createdAt: BASE + 1_000,
        status: "rejected",
      });
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: other.profileId,
        voter: me.profileId,
        title: "Povučeno",
        createdAt: BASE + 2_000,
        status: "withdrawn",
      });
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: other.profileId,
        voter: me.profileId,
        title: "Otvoreno",
        createdAt: BASE + 3_000,
      });

      const child = await insertNote(ctx, {
        scope: a,
        title: "Dete",
        createdBy: other.profileId,
      });
      const parent = await insertNote(ctx, {
        scope: a,
        title: "Roditelj",
        createdBy: me.profileId,
      });
      for (const status of ["approved", "rejected", "withdrawn", "cancelled"] as const) {
        await insertPageNesting(ctx, {
          scope: a,
          childPageId: child,
          parentPageId: parent,
          requester: other.profileId,
          parentAuthor: me.profileId,
          createdAt: BASE + 4_000,
          status,
        });
        await insertIdeaNesting(ctx, {
          workspaceId: a.workspaceId,
          childIdeaId: await insertIdea(ctx, {
            workspaceId: a.workspaceId,
            author: other.profileId,
            title: `Ideja ${status}`,
          }),
          parentIdeaId: await insertIdea(ctx, {
            workspaceId: a.workspaceId,
            author: me.profileId,
            title: `Roditelj ${status}`,
          }),
          requester: other.profileId,
          parentAuthor: me.profileId,
          createdAt: BASE + 5_000,
          status,
        });
      }
    });

    expect(await asMe.query(api.prostor.inbox.pending, {})).toEqual({ items: [], truncated: false });
  });

  test("stari zahtevi iz startupa bez članstva, napuštenog i arhiviranog se ne vraćaju", async () => {
    const { t, me, other, a, c, d, e, asMe } = await seed();
    await t.run(async (ctx) => {
      await insertDeletion(ctx, {
        workspaceId: a.workspaceId,
        requester: other.profileId,
        voter: me.profileId,
        title: "Vidi se",
        createdAt: BASE,
      });
      for (const [workspace, label] of [
        [c, "C"],
        [d, "D"],
        [e, "E"],
      ] as const) {
        await insertDeletion(ctx, {
          workspaceId: workspace.workspaceId,
          requester: other.profileId,
          voter: me.profileId,
          title: `Glasanje ${label}`,
          createdAt: BASE + 1_000,
        });
        const child = await insertNote(ctx, {
          scope: workspace,
          title: `Dete ${label}`,
          createdBy: other.profileId,
        });
        const parent = await insertNote(ctx, {
          scope: workspace,
          title: `Roditelj ${label}`,
          createdBy: me.profileId,
        });
        await insertPageNesting(ctx, {
          scope: workspace,
          childPageId: child,
          parentPageId: parent,
          requester: other.profileId,
          parentAuthor: me.profileId,
          createdAt: BASE + 2_000,
        });
        await insertIdeaNesting(ctx, {
          workspaceId: workspace.workspaceId,
          childIdeaId: await insertIdea(ctx, {
            workspaceId: workspace.workspaceId,
            author: other.profileId,
            title: `Ideja dete ${label}`,
          }),
          parentIdeaId: await insertIdea(ctx, {
            workspaceId: workspace.workspaceId,
            author: me.profileId,
            title: `Ideja roditelj ${label}`,
          }),
          requester: other.profileId,
          parentAuthor: me.profileId,
          createdAt: BASE + 3_000,
        });
      }
    });

    expect(await asMe.query(api.prostor.inbox.pending, {})).toEqual({ items: [], truncated: false });
  });

  test("stari zahtevi sa živim ili arhiviranim detetom se ne vraćaju", async () => {
    const { t, me, other, a, asMe } = await seed();
    await t.run(async (ctx) => {
      const parent = await insertNote(ctx, {
        scope: a,
        title: "Roditelj",
        createdBy: me.profileId,
      });
      const archivedChild = await insertNote(ctx, {
        scope: a,
        title: "Arhivirano dete",
        createdBy: other.profileId,
        archivedAt: BASE,
      });
      await insertPageNesting(ctx, {
        scope: a,
        childPageId: archivedChild,
        parentPageId: parent,
        requester: other.profileId,
        parentAuthor: me.profileId,
        createdAt: BASE,
      });
      const liveChild = await insertNote(ctx, {
        scope: a,
        title: "Živo dete",
        createdBy: other.profileId,
      });
      await insertPageNesting(ctx, {
        scope: a,
        childPageId: liveChild,
        parentPageId: parent,
        requester: other.profileId,
        parentAuthor: me.profileId,
        createdAt: BASE + 1_000,
      });

      const archivedIdea = await insertIdea(ctx, {
        workspaceId: a.workspaceId,
        author: other.profileId,
        title: "Arhivirana ideja",
        archivedAt: BASE,
      });
      const ideaParent = await insertIdea(ctx, {
        workspaceId: a.workspaceId,
        author: me.profileId,
        title: "Ideja roditelj",
      });
      await insertIdeaNesting(ctx, {
        workspaceId: a.workspaceId,
        childIdeaId: archivedIdea,
        parentIdeaId: ideaParent,
        requester: other.profileId,
        parentAuthor: me.profileId,
        createdAt: BASE + 2_000,
      });
    });

    expect(await asMe.query(api.prostor.inbox.pending, {})).toEqual({ items: [], truncated: false });
  });

  test("ni više od INBOX_PENDING_CAP starih zahteva ne pravi stavke ni truncated", async () => {
    const { t, me, other, a, asMe } = await seed();
    await t.run(async (ctx) => {
      const parent = await insertNote(ctx, {
        scope: a,
        title: "Roditelj",
        createdBy: me.profileId,
      });
      for (let index = 0; index < INBOX_PENDING_CAP + 1; index += 1) {
        const child = await insertNote(ctx, {
          scope: a,
          title: `Dete ${index}`,
          createdBy: other.profileId,
        });
        await insertPageNesting(ctx, {
          scope: a,
          childPageId: child,
          parentPageId: parent,
          requester: other.profileId,
          parentAuthor: me.profileId,
          createdAt: BASE + index,
        });
      }
    });

    expect(await asMe.query(api.prostor.inbox.pending, {})).toEqual({ items: [], truncated: false });
  });

  test("bez stavki: prazan spisak", async () => {
    const { asMe } = await seed();
    expect(await asMe.query(api.prostor.inbox.pending, {})).toEqual({
      items: [],
      truncated: false,
    });
  });

  test("neprijavljen → greška", async () => {
    const { t } = await seed();
    await expect(t.query(api.prostor.inbox.pending, {})).rejects.toThrow(
      "Niste prijavljeni.",
    );
  });
});
