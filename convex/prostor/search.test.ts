/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/search.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { expect, test } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

/**
 * Startup sa dva člana (Alice, Bob). Čvorovi se prave kroz prave mutacije, pa
 * ovi testovi usput pokrivaju i to da upisne mutacije popunjavaju `searchText`.
 */
async function seedTwoMemberStartup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
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
    const alice = await createPerson("Alice");
    const bob = await createPerson("Bob");
    const workspaceId = await insertStartup(ctx, {
      name: "Search startup",
      description: "",
      createdByProfileId: alice.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    for (const profileId of [alice.profileId, bob.profileId]) {
      await insertClanstvo(ctx, {
        workspaceId,
        profileId,
        addedByProfileId: alice.profileId,
        archivedAt: null,
        createdAt: now,
      });
    }
    return { alice, bob, workspaceId };
  });
  return {
    t,
    workspaceId: ids.workspaceId,
    asAlice: t.withIdentity({ subject: `${ids.alice.userId}|sesija-test` }),
    asBob: t.withIdentity({ subject: `${ids.bob.userId}|sesija-test` }),
  };
}

test("misli su privatne: član ne vidi tuđe misli u pretrazi", async () => {
  const { workspaceId, asAlice, asBob } = await seedTwoMemberStartup();

  await asAlice.mutation(api.prostor.thoughts.createNode, {
    workspaceId,
    title: "Alfa",
    text: "tajna beleška",
    x: 0,
    y: 0,
    color: "neutral",
  });

  // Bob traži isti pojam — Aličina privatna misao NE sme da se pojavi.
  const bob = await asBob.query(api.prostor.search.ideasAndThoughts, {
    workspaceId,
    query: "alfa",
  });
  expect(bob.thoughts).toHaveLength(0);

  // Alice vidi svoju misao.
  const alice = await asAlice.query(api.prostor.search.ideasAndThoughts, {
    workspaceId,
    query: "alfa",
  });
  expect(alice.thoughts).toHaveLength(1);
  expect(alice.thoughts[0]?.title).toBe("Alfa");
});

test("ideje su zajedničke: član vidi tuđe ideje u pretrazi", async () => {
  const { workspaceId, asAlice, asBob } = await seedTwoMemberStartup();

  await asBob.mutation(api.prostor.ideas.create, {
    workspaceId,
    title: "Beta",
    text: "zajednička ideja",
  });

  // Alice vidi Bobovu ideju — ideje su startup-wide.
  const alice = await asAlice.query(api.prostor.search.ideasAndThoughts, {
    workspaceId,
    query: "beta",
  });
  expect(alice.ideas).toHaveLength(1);
  expect(alice.ideas[0]?.title).toBe("Beta");
});

test("pogodak samo po naslovu radi (searchText = title + text)", async () => {
  const { workspaceId, asAlice } = await seedTwoMemberStartup();

  // Pojam „gamma" postoji samo u naslovu, ne u tekstu — dokaz da indeks pokriva
  // i naslov (opcija A: denormalizovan searchText), ne samo `text`.
  await asAlice.mutation(api.prostor.thoughts.createNode, {
    workspaceId,
    title: "Gamma",
    text: "nepovezan sadržaj",
    x: 0,
    y: 0,
    color: "neutral",
  });

  const result = await asAlice.query(api.prostor.search.ideasAndThoughts, {
    workspaceId,
    query: "gamma",
  });
  expect(result.thoughts).toHaveLength(1);
});

test("kratak upit (< 2 znaka) ne vraća ništa", async () => {
  const { workspaceId, asAlice } = await seedTwoMemberStartup();
  await asAlice.mutation(api.prostor.ideas.create, {
    workspaceId,
    title: "Alfa",
    text: "x",
  });
  const result = await asAlice.query(api.prostor.search.ideasAndThoughts, {
    workspaceId,
    query: "a",
  });
  expect(result.ideas).toHaveLength(0);
  expect(result.thoughts).toHaveLength(0);
});

test("nečlan ne može da pretražuje tuđi startup", async () => {
  const { t, workspaceId } = await seedTwoMemberStartup();
  const outsider = await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: "Out",
      email: "out@example.test",
    });
    await insertProfil(ctx, {
      userId,
      displayName: "Out",
      email: "out@example.test",
      role: "member",
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    return { userId };
  });
  const asOutsider = t.withIdentity({
    subject: `${outsider.userId}|sesija-test`,
  });
  await expect(
    asOutsider.query(api.prostor.search.ideasAndThoughts, { workspaceId, query: "alfa" }),
  ).rejects.toThrow();
});
