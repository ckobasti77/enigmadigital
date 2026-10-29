/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/inbox.ideaVote.test.ts (main @ c05c40f), SPAJANJE S06.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { INBOX_PENDING_CAP } from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup, ukloniClanstvo } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const BASE = 1_700_000_000_000;
const INCLUDE = ["idea_vote" as const];

/**
 * „Čeka tebe" → `idea_vote` (PROSTOR P22, K05). Startupi: A (ja + Ana), B (ja +
 * Ana), C (samo Ana), D (moje članstvo arhivirano), E (arhiviran startup u kome
 * sam član). Ideje piše Ana.
 */
async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (name: string, archived = false) => {
      const email = `${name.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email,
        role: "member",
        archivedAt: archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const me = await person("Jovan");
    const ana = await person("Ana");
    const gone = await person("Bivsi", true);

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
      return workspaceId;
    };
    return {
      me,
      ana,
      gone,
      a: await workspace("Cluck Rush", [
        { profileId: ana.profileId },
        { profileId: me.profileId },
        { profileId: gone.profileId },
      ]),
      b: await workspace("Scan Me", [
        { profileId: ana.profileId },
        { profileId: me.profileId },
      ]),
      c: await workspace("Tuđi", [{ profileId: ana.profileId }]),
      d: await workspace("Napušten", [
        { profileId: ana.profileId },
        { profileId: me.profileId, archived: true },
      ]),
      e: await workspace(
        "Arhiviran",
        [{ profileId: ana.profileId }, { profileId: me.profileId }],
        true,
      ),
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return { t, ...seeded, asMe: as(seeded.me), asAna: as(seeded.ana), as };
}

async function insertIdea(
  ctx: MutationCtx,
  options: {
    workspaceId: Id<"workspaces">;
    author: Id<"profiles">;
    title: string;
    stage?: "predlog" | "razmatra_se" | "odobreno" | "odbijeno";
    stageChangedAt?: number;
    archivedAt?: number | null;
    converted?: Id<"pages">;
  },
) {
  return await ctx.db.insert("ideaNodes", {
    workspaceId: options.workspaceId,
    authorProfileId: options.author,
    title: options.title,
    text: `${options.title} tekst`,
    searchText: options.title,
    x: 0,
    y: 0,
    color: "violet",
    convertedPageId: options.converted ?? null,
    convertedAt: options.converted === undefined ? null : BASE,
    ...(options.stage === undefined ? {} : { stage: options.stage }),
    ...(options.stageChangedAt === undefined
      ? {}
      : { stageChangedAt: options.stageChangedAt }),
    archivedAt: options.archivedAt ?? null,
    createdAt: BASE,
    updatedAt: BASE,
  });
}

async function vote(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  ideaId: Id<"ideaNodes">,
  profileId: Id<"profiles">,
  voteType: "up" | "down",
) {
  await ctx.db.insert("ideaVotes", {
    workspaceId,
    ideaId,
    profileId,
    voteType,
    createdAt: BASE,
  });
}

describe("inbox.pending › idea_vote", () => {
  test("bez include (stari klijenti) lista je prazna i kad ideja čeka glas", async () => {
    const s = await seed();
    await s.t.run((ctx) =>
      insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "Čeka",
        stage: "razmatra_se",
        stageChangedAt: BASE,
      }),
    );
    await expect(s.asMe.query(api.prostor.inbox.pending, {})).resolves.toEqual({
      items: [],
      truncated: false,
    });
    await expect(
      s.asMe.query(api.prostor.inbox.pending, { workspaceId: s.a }),
    ).resolves.toEqual({ items: [], truncated: false });
    await expect(
      s.asMe.query(api.prostor.inbox.pending, { include: [] }),
    ).resolves.toEqual({ items: [], truncated: false });
  });

  test("samo „Razmatra se” bez mog glasa, bez pretvorenih i obrisanih, najnovije prvo, kroz moje startupe", async () => {
    const s = await seed();
    const ids = await s.t.run(async (ctx) => {
      const page = await ctx.db.insert("pages", {
        workspaceId: s.a,
        areaId: await ctx.db.insert("areas", {
          workspaceId: s.a,
          key: "dev",
          label: "Dev",
          position: 0,
          createdAt: BASE,
        }),
        parentPageId: null,
        kind: "note",
        title: "Rezultat",
        searchText: "Rezultat",
        revision: 0,
        position: 0,
        taskStatus: null,
        taskPriority: null,
        assigneeProfileId: null,
        dueDate: null,
        taskSortAt: 0,
        completedAt: null,
        createdByProfileId: s.ana.profileId,
        updatedByProfileId: s.ana.profileId,
        archivedAt: null,
        createdAt: BASE,
        updatedAt: BASE,
      });
      const waitingA = await insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "Novi meni",
        stage: "razmatra_se",
        stageChangedAt: BASE + 1_000,
      });
      const waitingB = await insertIdea(ctx, {
        workspaceId: s.b,
        author: s.ana.profileId,
        title: "Nova boja",
        stage: "razmatra_se",
        stageChangedAt: BASE + 2_000,
      });
      const voted = await insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "Već glasao",
        stage: "razmatra_se",
        stageChangedAt: BASE + 3_000,
      });
      await vote(ctx, s.a, voted, s.me.profileId, "down");
      await insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "Predlog",
      });
      for (const stage of ["predlog", "odobreno", "odbijeno"] as const) {
        await insertIdea(ctx, {
          workspaceId: s.a,
          author: s.ana.profileId,
          title: stage,
          stage,
          stageChangedAt: BASE + 4_000,
        });
      }
      await insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "Pretvorena",
        stage: "razmatra_se",
        stageChangedAt: BASE + 5_000,
        converted: page,
      });
      await insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "U korpi",
        stage: "razmatra_se",
        stageChangedAt: BASE + 6_000,
        archivedAt: BASE + 6_000,
      });
      // Glasovi drugih se broje u stavci.
      await vote(ctx, s.a, waitingA, s.ana.profileId, "up");
      await vote(ctx, s.a, waitingA, s.gone.profileId, "down");
      return { waitingA, waitingB };
    });

    const result = await s.asMe.query(api.prostor.inbox.pending, { include: INCLUDE });
    expect(result.truncated).toBe(false);
    expect(result.items).toEqual([
      {
        kind: "idea_vote",
        ideaId: ids.waitingB,
        title: "Nova boja",
        authorName: "Ana",
        upvotes: 0,
        downvotes: 0,
        workspace: { _id: s.b, name: "Scan Me", logoUrl: null },
        createdAt: BASE + 2_000,
        targetType: "ideas",
        targetId: ids.waitingB,
      },
      {
        kind: "idea_vote",
        ideaId: ids.waitingA,
        title: "Novi meni",
        authorName: "Ana",
        upvotes: 1,
        downvotes: 1,
        workspace: { _id: s.a, name: "Cluck Rush", logoUrl: null },
        createdAt: BASE + 1_000,
        targetType: "ideas",
        targetId: ids.waitingA,
      },
    ]);

    // Opseg jednog startupa (Komandni centar).
    const onlyA = await s.asMe.query(api.prostor.inbox.pending, {
      workspaceId: s.a,
      include: INCLUDE,
    });
    expect(onlyA.items.map((item) => item.kind === "idea_vote" && item.ideaId)).toEqual([
      ids.waitingA,
    ]);

    // Moj glas skida stavku (svaki član glasa, P6).
    await s.asMe.mutation(api.prostor.ideas.vote, {
      workspaceId: s.a,
      ideaId: ids.waitingA,
      voteType: "up",
    });
    const afterVote = await s.asMe.query(api.prostor.inbox.pending, { include: INCLUDE });
    expect(afterVote.items.map((item) => item.kind === "idea_vote" && item.ideaId)).toEqual([
      ids.waitingB,
    ]);
  });

  test("ideje iz startupa bez članstva, napuštenog i arhiviranog se ne vraćaju", async () => {
    const s = await seed();
    await s.t.run(async (ctx) => {
      for (const workspaceId of [s.c, s.d, s.e]) {
        await insertIdea(ctx, {
          workspaceId,
          author: s.ana.profileId,
          title: "Van opsega",
          stage: "razmatra_se",
          stageChangedAt: BASE,
        });
      }
    });
    await expect(
      s.asMe.query(api.prostor.inbox.pending, { include: INCLUDE }),
    ).resolves.toEqual({ items: [], truncated: false });
    // Ana je aktivna u C, D i E — za nju su stavke tamo (ona je autor: i njoj
    // ideja čeka glas samo ako nije glasala).
    const ana = await s.asAna.query(api.prostor.inbox.pending, { include: INCLUDE });
    expect(new Set(ana.items.map((item) => item.workspace._id))).toEqual(
      new Set([s.c, s.d]),
    );

    for (const workspaceId of [s.c, s.d, s.e]) {
      await expect(
        s.asMe.query(api.prostor.inbox.pending, { workspaceId, include: INCLUDE }),
      ).rejects.toThrow();
    }
  });

  test("uklonjen član i arhiviran profil ne čitaju", async () => {
    const s = await seed();
    await s.t.run((ctx) =>
      insertIdea(ctx, {
        workspaceId: s.a,
        author: s.ana.profileId,
        title: "Čeka",
        stage: "razmatra_se",
        stageChangedAt: BASE,
      }),
    );
    // Arhiviran profil (Bivši je i dalje u članstvu A).
    await expect(
      s.as(s.gone).query(api.prostor.inbox.pending, { include: INCLUDE }),
    ).rejects.toThrow();
    await expect(
      s.as(s.gone).query(api.prostor.inbox.pending, { workspaceId: s.a, include: INCLUDE }),
    ).rejects.toThrow();
    // Uklonjen član: posle uklanjanja stavka nestaje.
    await s.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", s.me.userId).eq("workspaceId", s.a),
        )
        .first();
      // Pre uklanjanja red mora da postoji (isto kao raniji `membership!._id`).
      expect(membership).not.toBeNull();
      await ukloniClanstvo(ctx, membership?._id ?? null);
    });
    await expect(
      s.asMe.query(api.prostor.inbox.pending, { include: INCLUDE }),
    ).resolves.toEqual({ items: [], truncated: false });
    await expect(
      s.asMe.query(api.prostor.inbox.pending, { workspaceId: s.a, include: INCLUDE }),
    ).rejects.toThrow();
    await expect(
      convexTest(schema, modules).query(api.prostor.inbox.pending, { include: INCLUDE }),
    ).rejects.toThrow();
  });

  test("granica: najviše INBOX_PENDING_CAP stavki i truncated", async () => {
    const s = await seed();
    await s.t.run(async (ctx) => {
      for (let index = 0; index < INBOX_PENDING_CAP + 3; index += 1) {
        await insertIdea(ctx, {
          workspaceId: index % 2 === 0 ? s.a : s.b,
          author: s.ana.profileId,
          title: `Ideja ${index}`,
          stage: "razmatra_se",
          stageChangedAt: BASE + index,
        });
      }
    });
    const result = await s.asMe.query(api.prostor.inbox.pending, { include: INCLUDE });
    expect(result.truncated).toBe(true);
    expect(result.items).toHaveLength(INBOX_PENDING_CAP);
    expect(result.items[0]).toMatchObject({ title: `Ideja ${INBOX_PENDING_CAP + 2}` });
    const times = result.items.map((item) => item.createdAt);
    expect([...times].sort((x, y) => y - x)).toEqual(times);

    const few = await s.asMe.query(api.prostor.inbox.pending, {
      workspaceId: s.b,
      include: INCLUDE,
    });
    expect(few.truncated).toBe(false);
    expect(few.items).toHaveLength(Math.floor((INBOX_PENDING_CAP + 3) / 2));
  });
});
