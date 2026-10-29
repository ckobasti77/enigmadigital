/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/pages.test.ts (main @ c05c40f), SPAJANJE S03.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

type Ctx = Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0];

/** Ubaci člana + startup sa dve oblasti; vrati id-jeve i `subject` za identitet. */
async function seedWorkspace(ctx: Ctx) {
  const t0 = 1_000_000;
  const userId = await ctx.db.insert("users", {});
  const profileId = await insertProfil(ctx, {
    userId,
    displayName: "Test",
    email: "test@example.com",
    role: "admin",
    archivedAt: null,
    createdAt: t0,
    updatedAt: t0,
  });
  const workspaceId = await insertStartup(ctx, {
    name: "Acme",
    description: "",
    createdByProfileId: profileId,
    archivedAt: null,
    createdAt: t0,
    updatedAt: t0,
  });
  await insertClanstvo(ctx, {
    workspaceId,
    profileId,
    addedByProfileId: profileId,
    archivedAt: null,
    createdAt: t0,
  });
  const dev = await ctx.db.insert("areas", {
    workspaceId,
    key: "dev",
    label: "Dev notes",
    position: 0,
    createdAt: t0,
  });
  const marketing = await ctx.db.insert("areas", {
    workspaceId,
    key: "marketing",
    label: "Marketing notes",
    position: 1,
    createdAt: t0,
  });
  return { userId, profileId, workspaceId, dev, marketing };
}

/** Kompletan `pages` dokument sa svim obaveznim poljima (opciona izostavljena). */
async function insertPage(
  ctx: Ctx,
  args: {
    workspaceId: Id<"workspaces">;
    areaId: Id<"areas">;
    profileId: Id<"profiles">;
    title: string;
    updatedAt: number;
    parentPageId?: Id<"pages"> | null;
    kind?: "note" | "task" | "file" | "table";
    archivedAt?: number | null;
    position?: number;
  },
) {
  return await ctx.db.insert("pages", {
    workspaceId: args.workspaceId,
    areaId: args.areaId,
    parentPageId: args.parentPageId ?? null,
    kind: args.kind ?? "note",
    title: args.title,
    searchText: "",
    revision: 0,
    position: args.position ?? 0,
    taskStatus: null,
    taskPriority: null,
    assigneeProfileId: null,
    dueDate: null,
    taskSortAt: 0,
    createdByProfileId: args.profileId,
    updatedByProfileId: args.profileId,
    archivedAt: args.archivedAt ?? null,
    createdAt: args.updatedAt,
    updatedAt: args.updatedAt,
  });
}

describe("pages.areaTopLevelCounts", () => {
  test("broji samo ne-arhivirane stranice na vrhu oblasti", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run(async (ctx) => {
      const s = await seedWorkspace(ctx);
      const top1 = await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Vrh 1",
        updatedAt: 10,
      });
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Vrh 2",
        updatedAt: 20,
      });
      // Ugnježdena (ima roditelja) — ne broji se na vrhu.
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Dete",
        updatedAt: 30,
        parentPageId: top1,
      });
      // Arhivirana na vrhu — ne broji se.
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Obrisana",
        updatedAt: 40,
        archivedAt: 41,
      });
      return s;
    });

    const counts = await t
      .withIdentity({ subject: `${seed.userId}|sesija-test` })
      .query(api.prostor.pages.areaTopLevelCounts, { workspaceId: seed.workspaceId });

    const byArea = new Map(counts.map((entry) => [entry.areaId, entry]));
    expect(byArea.get(seed.dev)).toMatchObject({ count: 2, capped: false });
    expect(byArea.get(seed.marketing)).toMatchObject({ count: 0, capped: false });
  });

  test("odbija korisnika koji nije član startupa", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run((ctx) => seedWorkspace(ctx));
    const outsiderId = await t.run((ctx) => ctx.db.insert("users", {}));

    await expect(
      t
        .withIdentity({ subject: `${outsiderId}|sesija-test` })
        .query(api.prostor.pages.areaTopLevelCounts, { workspaceId: seed.workspaceId }),
    ).rejects.toThrow();
  });
});

describe("pages.recentForStartup", () => {
  test("vraća ne-arhivirane stranice sortirane po updatedAt opadajuće", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run(async (ctx) => {
      const s = await seedWorkspace(ctx);
      await insertPage(ctx, { workspaceId: s.workspaceId, areaId: s.dev, profileId: s.profileId, title: "Staro", updatedAt: 100 });
      await insertPage(ctx, { workspaceId: s.workspaceId, areaId: s.dev, profileId: s.profileId, title: "Novo", updatedAt: 300 });
      await insertPage(ctx, { workspaceId: s.workspaceId, areaId: s.marketing, profileId: s.profileId, title: "Srednje", updatedAt: 200 });
      await insertPage(ctx, { workspaceId: s.workspaceId, areaId: s.dev, profileId: s.profileId, title: "Arhivirano", updatedAt: 999, archivedAt: 999 });
      return s;
    });

    const recent = await t
      .withIdentity({ subject: `${seed.userId}|sesija-test` })
      .query(api.prostor.pages.recentForStartup, { workspaceId: seed.workspaceId });

    expect(recent.map((page) => page.title)).toEqual(["Novo", "Srednje", "Staro"]);
  });

  test("poštuje limit (najskorije prvo)", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run(async (ctx) => {
      const s = await seedWorkspace(ctx);
      for (let i = 0; i < 5; i += 1) {
        await insertPage(ctx, {
          workspaceId: s.workspaceId,
          areaId: s.dev,
          profileId: s.profileId,
          title: `P${i}`,
          updatedAt: 100 + i * 10,
        });
      }
      return s;
    });

    const recent = await t
      .withIdentity({ subject: `${seed.userId}|sesija-test` })
      .query(api.prostor.pages.recentForStartup, { workspaceId: seed.workspaceId, limit: 2 });

    expect(recent.map((page) => page.title)).toEqual(["P4", "P3"]);
  });
});

describe("pages.get posle kreiranja", () => {
  // Kvar K-B (lanac 7): `pages.get` vraća `{ ...page }`, a Convex returns
  // validator ODBIJA svako polje koje ne nabroji. Tabela i prilog-oblačić
  // dobijaju denormalizovana polja odmah pri kreiranju (tableRowCount/
  // tableColumnCount, fileCount), pa je „sveža stranica bez sadržaja" tačan
  // repro pada „Server Error". convex-test sprovodi returns validatore.
  async function createAndGet(kind: "note" | "task" | "file" | "table") {
    const t = convexTest(schema, modules);
    const seed = await t.run((ctx) => seedWorkspace(ctx));
    const asMember = t.withIdentity({ subject: `${seed.userId}|sesija-test` });
    const pageId = await asMember.mutation(api.prostor.pages.create, {
      workspaceId: seed.workspaceId,
      areaId: seed.dev,
      parentPageId: null,
      kind,
      title: `Sveže (${kind})`,
    });
    return await asMember.query(api.prostor.pages.get, {
      workspaceId: seed.workspaceId,
      pageId,
    });
  }

  test("sveža tabela (samo naslov) se čita bez greške", async () => {
    const page = await createAndGet("table");
    expect(page).toMatchObject({
      kind: "table",
      title: "Sveže (table)",
      tableRowCount: 1,
      tableColumnCount: 1,
      content: "",
      assignees: [],
    });
  });

  test("svež prilog-oblačić (samo naslov) se čita bez greške", async () => {
    const page = await createAndGet("file");
    expect(page).toMatchObject({ kind: "file", fileCount: 0, content: "" });
  });

  test("sveža beleška i zadatak se čitaju bez greške", async () => {
    expect(await createAndGet("note")).toMatchObject({ kind: "note" });
    expect(await createAndGet("task")).toMatchObject({
      kind: "task",
      taskStatus: "backlog",
      taskPriority: "medium",
    });
  });
});

describe("pages.listChildren", () => {
  test("kind filtrira samo traženu vrstu na nivou", async () => {
    const t = convexTest(schema, modules);
    const seed = await t.run(async (ctx) => {
      const s = await seedWorkspace(ctx);
      const beleska = await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Beleška u korenu",
        updatedAt: 10,
        kind: "note",
      });
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Zadatak u korenu",
        updatedAt: 20,
        kind: "task",
      });
      // Zadatak DUBLJE u stablu — filter važi za nivo, ne za celu oblast.
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Ugnježden zadatak",
        updatedAt: 30,
        kind: "task",
        parentPageId: beleska,
      });
      // Arhiviran zadatak u korenu — filter ga ne sme vratiti.
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.dev,
        profileId: s.profileId,
        title: "Obrisan zadatak",
        updatedAt: 40,
        kind: "task",
        archivedAt: 41,
      });
      // Zadatak u DRUGOJ oblasti — opseg ostaje oblast iz argumenta.
      await insertPage(ctx, {
        workspaceId: s.workspaceId,
        areaId: s.marketing,
        profileId: s.profileId,
        title: "Tuđa oblast",
        updatedAt: 50,
        kind: "task",
      });
      return s;
    });

    const asMember = t.withIdentity({ subject: `${seed.userId}|sesija-test` });
    const filtered = await asMember.query(api.prostor.pages.listChildren, {
      workspaceId: seed.workspaceId,
      areaId: seed.dev,
      parentPageId: null,
      kind: "task",
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(filtered.page.map((page) => page.title)).toEqual(["Zadatak u korenu"]);

    // Bez `kind` isti nivo vraća obe vrste — filter je jedina razlika.
    const all = await asMember.query(api.prostor.pages.listChildren, {
      workspaceId: seed.workspaceId,
      areaId: seed.dev,
      parentPageId: null,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(all.page.map((page) => page.title).sort()).toEqual([
      "Beleška u korenu",
      "Zadatak u korenu",
    ]);
  });
});
