/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/thoughts.notes.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const first = { numItems: 50, cursor: null };

/**
 * Beleške u „Ja" (PROSTOR P7, K05). Startupi: A (ja, Ana, Admin), B (ja), C
 * (samo Ana), D (moje članstvo arhivirano), E (arhiviran startup, ja član).
 * Beleške iz D i E su upisane pre nego što sam izgubio pristup.
 */
async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      options: { role?: "admin" | "member"; archived?: boolean } = {},
    ) => {
      const email = `${name.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email,
        role: options.role ?? "member",
        archivedAt: options.archived === true ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const me = await person("Jovan");
    const ana = await person("Ana");
    const admin = await person("Admin", { role: "admin" });
    const gone = await person("Bivsi", { archived: true });

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
      await ctx.db.insert("areas", {
        workspaceId,
        key: "dev",
        label: `${name} dev`,
        position: 0,
        createdAt: now,
      });
      return workspaceId;
    };
    const a = await workspace("Cluck Rush", [
      { profileId: me.profileId },
      { profileId: ana.profileId },
      { profileId: admin.profileId },
      { profileId: gone.profileId },
    ]);
    const b = await workspace("Scan Me", [{ profileId: me.profileId }]);
    const c = await workspace("Tuđi", [{ profileId: ana.profileId }]);
    const d = await workspace("Napušten", [
      { profileId: ana.profileId },
      { profileId: me.profileId, archived: true },
    ]);
    const e = await workspace("Arhiviran", [{ profileId: me.profileId }], true);

    const insertNote = async (
      workspaceId: Id<"workspaces"> | null,
      owner: Id<"profiles">,
      title: string,
    ) =>
      await ctx.db.insert("thoughtNodes", {
        workspaceId,
        ownerProfileId: owner,
        title,
        text: `${title} tekst`,
        searchText: `${title}\n${title} tekst`,
        x: 0,
        y: 0,
        color: "neutral",
        conversionCount: 0,
        lastConvertedPageId: null,
        lastConvertedAt: null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    return {
      me,
      ana,
      admin,
      gone,
      a,
      b,
      c,
      d,
      e,
      leftNote: await insertNote(d, me.profileId, "Napuštena beleška"),
      archivedStartupNote: await insertNote(e, me.profileId, "Arhivirana beleška"),
      anaPersonal: await insertNote(null, ana.profileId, "Anina lična"),
      anaInA: await insertNote(a, ana.profileId, "Anina u startupu"),
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  return {
    t,
    ...s,
    as,
    asMe: as(s.me),
    asAna: as(s.ana),
    asAdmin: as(s.admin),
    asGone: as(s.gone),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const idsOf = (page: ReadonlyArray<{ _id: Id<"thoughtNodes"> }>) =>
  page.map((item) => item._id).sort();

async function canvasesOf(s: Seeded, owner: Id<"profiles">) {
  return await s.t.run((ctx) =>
    ctx.db
      .query("thoughtCanvases")
      .collect()
      .then((rows) => rows.filter((row) => row.ownerProfileId === owner)),
  );
}

describe("Beleške: lična beleška", () => {
  test("lična beleška nastaje bez Mape i vidi je samo vlasnik", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      text: "Lična ideja za vikend\nDrugi red",
    });
    const inA = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      title: "Plan lansiranja",
      text: "Šta radimo prvo",
    });

    const doc = await s.t.run((ctx) => ctx.db.get("thoughtNodes", personal));
    expect(doc).toMatchObject({
      workspaceId: null,
      ownerProfileId: s.me.profileId,
      title: "Lična ideja za vikend",
      x: 0,
      y: 0,
      color: "neutral",
      archivedAt: null,
    });
    // Mapa postoji samo po startupu: lična beleška je ne pravi.
    const canvases = await canvasesOf(s, s.me.profileId);
    expect(canvases.map((row) => row.workspaceId)).toEqual([s.a]);

    // Sve moje: lične + aktivni startupi, bez napuštenog i arhiviranog.
    const all = await s.asMe.query(api.prostor.thoughts.listMine, { paginationOpts: first });
    expect(idsOf(all.page)).toEqual([personal, inA].sort());
    expect(all.page.find((item) => item._id === personal)).toMatchObject({
      workspaceId: null,
      workspace: null,
      title: "Lična ideja za vikend",
      parentThoughtId: null,
      isParent: false,
      conversionCount: 0,
      lastConvertedIdeaId: null,
    });
    expect(all.page.find((item) => item._id === inA)?.workspace).toEqual({
      _id: s.a,
      name: "Cluck Rush",
      logoUrl: null,
    });

    // Filter: lično / jedan startup.
    const personalOnly = await s.asMe.query(api.prostor.thoughts.listMine, {
      workspaceId: null,
      paginationOpts: first,
    });
    expect(idsOf(personalOnly.page)).toEqual([personal]);
    const onlyA = await s.asMe.query(api.prostor.thoughts.listMine, {
      workspaceId: s.a,
      paginationOpts: first,
    });
    expect(idsOf(onlyA.page)).toEqual([inA]);
    for (const workspaceId of [s.c, s.d, s.e]) {
      await expect(
        s.asMe.query(api.prostor.thoughts.listMine, { workspaceId, paginationOpts: first }),
      ).rejects.toThrow();
    }

    // Tuđe beleške nikad — ni admin ne vidi moje.
    const ana = await s.asAna.query(api.prostor.thoughts.listMine, { paginationOpts: first });
    expect(idsOf(ana.page)).toEqual([s.anaPersonal, s.anaInA].sort());
    const admin = await s.asAdmin.query(api.prostor.thoughts.listMine, { paginationOpts: first });
    expect(admin.page).toEqual([]);

    // Mapa startupa ne prikazuje lične beleške.
    const map = await s.asMe.query(api.prostor.thoughts.listNodes, {
      workspaceId: s.a,
      paginationOpts: first,
    });
    expect(idsOf(map.page)).toEqual([inA]);
    expect(map.page[0].workspaceId).toBe(s.a);

    // Arhiviran profil i neprijavljen ne čitaju i ne pišu.
    await expect(
      s.asGone.query(api.prostor.thoughts.listMine, { paginationOpts: first }),
    ).rejects.toThrow();
    await expect(
      s.asGone.mutation(api.prostor.thoughts.createNote, { workspaceId: null, text: "x" }),
    ).rejects.toThrow();
    await expect(
      s.t.query(api.prostor.thoughts.listMine, { paginationOpts: first }),
    ).rejects.toThrow();
    // Ne pravi se beleška u startupu gde nisam aktivan član.
    for (const workspaceId of [s.c, s.d, s.e]) {
      await expect(
        s.asMe.mutation(api.prostor.thoughts.createNote, { workspaceId, text: "Ne" }),
      ).rejects.toThrow();
    }
  });

  test("izmena, arhiva i vraćanje lične beleške rade samo vlasniku", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      title: "Lično",
      text: "Prvi tekst",
    });

    for (const client of [s.asAna, s.asAdmin, s.asGone]) {
      await expect(
        client.mutation(api.prostor.thoughts.updateNode, { nodeId: personal, text: "Tuđe" }),
      ).rejects.toThrow();
      await expect(
        client.mutation(api.prostor.thoughts.archiveNodes, { nodeIds: [personal] }),
      ).rejects.toThrow();
    }

    await s.asMe.mutation(api.prostor.thoughts.updateNode, {
      nodeId: personal,
      title: "Lično, izmenjeno",
      text: "Drugi tekst",
    });
    const updated = await s.t.run((ctx) => ctx.db.get("thoughtNodes", personal));
    expect(updated).toMatchObject({
      title: "Lično, izmenjeno",
      text: "Drugi tekst",
      searchText: "Lično, izmenjeno\nDrugi tekst",
      workspaceId: null,
    });

    await s.asMe.mutation(api.prostor.thoughts.archiveNodes, { nodeIds: [personal] });
    const archived = await s.asMe.query(api.prostor.thoughts.listMine, {
      workspaceId: null,
      paginationOpts: first,
    });
    expect(archived.page).toEqual([]);
    await expect(
      s.asAna.mutation(api.prostor.thoughts.restoreNodes, { nodeIds: [personal] }),
    ).rejects.toThrow();
    await s.asMe.mutation(api.prostor.thoughts.restoreNodes, { nodeIds: [personal] });
    const restored = await s.asMe.query(api.prostor.thoughts.listMine, {
      workspaceId: null,
      paginationOpts: first,
    });
    expect(idsOf(restored.page)).toEqual([personal]);

    // Beleška iz startupa koji sam napustio se ne menja.
    await expect(
      s.asMe.mutation(api.prostor.thoughts.updateNode, { nodeId: s.leftNote, text: "Ne" }),
    ).rejects.toThrow();
  });

  test("podbeleška i Mapa: slobodno mesto, roditelj iz istog opsega", async () => {
    const s = await seed();
    const one = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      title: "",
      text: "Prva na Mapi",
    });
    const two = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      text: "Druga na Mapi",
    });
    const [oneDoc, twoDoc] = await s.t.run(async (ctx) => [
      await ctx.db.get("thoughtNodes", one),
      await ctx.db.get("thoughtNodes", two),
    ]);
    expect(oneDoc?.title).toBe("Prva na Mapi");
    expect(oneDoc?.x !== twoDoc?.x || oneDoc?.y !== twoDoc?.y).toBe(true);
    expect((await canvasesOf(s, s.me.profileId)).length).toBe(1);

    const child = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      text: "Pod prvom",
      parentThoughtId: one,
    });
    const childDoc = await s.t.run((ctx) => ctx.db.get("thoughtNodes", child));
    expect(childDoc?.parentThoughtId).toBe(one);
    const listed = await s.asMe.query(api.prostor.thoughts.listMine, {
      workspaceId: s.a,
      paginationOpts: first,
    });
    expect(listed.page.find((item) => item._id === child)?.parentThoughtId).toBe(one);

    const personalParent = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      text: "Lični roditelj",
    });
    await expect(
      s.asMe.mutation(api.prostor.thoughts.createNote, {
        workspaceId: null,
        text: "Lično dete",
        parentThoughtId: personalParent,
      }),
    ).resolves.toBeTruthy();
    // Roditelj iz drugog opsega ili tuđ roditelj → greška.
    await expect(
      s.asMe.mutation(api.prostor.thoughts.createNote, {
        workspaceId: s.a,
        text: "Mešano",
        parentThoughtId: personalParent,
      }),
    ).rejects.toThrow(/Misao nije pronađena/);
    await expect(
      s.asMe.mutation(api.prostor.thoughts.createNote, {
        workspaceId: null,
        text: "Tuđe",
        parentThoughtId: s.anaPersonal,
      }),
    ).rejects.toThrow(/Misao nije pronađena/);
  });
});

describe("Beleške: pretraga", () => {
  test("searchMine nalazi samo moje beleške iz dozvoljenog opsega; pretraga startupa ne vidi lične", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      title: "Tajni recept",
      text: "samo za mene",
    });
    const inA = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      title: "Recept za tim",
      text: "u startupu",
    });

    const all = await s.asMe.query(api.prostor.thoughts.searchMine, { query: "recept" });
    expect(all.map((item) => item._id).sort()).toEqual([personal, inA].sort());
    expect(all.find((item) => item._id === personal)?.workspaceId).toBeNull();
    const personalOnly = await s.asMe.query(api.prostor.thoughts.searchMine, {
      query: "recept",
      workspaceId: null,
    });
    expect(personalOnly.map((item) => item._id)).toEqual([personal]);
    const onlyA = await s.asMe.query(api.prostor.thoughts.searchMine, {
      query: "recept",
      workspaceId: s.a,
    });
    expect(onlyA.map((item) => item._id)).toEqual([inA]);
    // Napuštena i arhivirana beleška startupa se ne nalaze.
    expect(
      await s.asMe.query(api.prostor.thoughts.searchMine, { query: "beleška" }),
    ).toEqual([]);
    // Tuđe nikad, ni adminu.
    expect(await s.asAna.query(api.prostor.thoughts.searchMine, { query: "recept" })).toEqual([]);
    expect(await s.asAdmin.query(api.prostor.thoughts.searchMine, { query: "recept" })).toEqual([]);
    await expect(
      s.asMe.query(api.prostor.thoughts.searchMine, { query: "recept", workspaceId: s.c }),
    ).rejects.toThrow();

    // Pretraga startupa: lična beleška se ne pojavljuje.
    const startupSearch = await s.asMe.query(api.prostor.search.ideasAndThoughts, {
      workspaceId: s.a,
      query: "recept",
    });
    expect(startupSearch.thoughts.map((item) => item._id)).toEqual([inA]);
    expect(startupSearch.thoughts[0].workspaceId).toBe(s.a);
  });
});

describe("Beleške: Pošalji u projekat", () => {
  test("lična i startup beleška postaju ideje (Predlog) u startupu gde sam član", async () => {
    const s = await seed();
    const personalOne = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      title: "Lična 1",
      text: "Prva",
    });
    const personalTwo = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      title: "Lična 2",
      text: "Druga",
    });
    const fromA = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      title: "Iz A",
      text: "Treća",
    });

    // Već postojeća ideja na (0, 0) ciljnog startupa.
    const existingIdea = await s.asMe.mutation(api.prostor.ideas.create, {
      workspaceId: s.b,
      title: "Postojeća",
      text: "Na početku kanvasa",
      x: 0,
      y: 0,
    });

    // Redosled izbora: druga pa prva.
    const personalResult = await s.asMe.mutation(api.prostor.thoughts.convertToIdeas, {
      workspaceId: s.b,
      nodeIds: [personalTwo, personalOne],
    });
    expect(personalResult.ideaIds).toHaveLength(2);
    const ideas = await s.t.run(async (ctx) =>
      Promise.all(personalResult.ideaIds.map((id) => ctx.db.get("ideaNodes", id))),
    );
    expect(ideas.map((idea) => idea?.title)).toEqual(["Lična 2", "Lična 1"]);
    for (const idea of ideas) {
      expect(idea).toMatchObject({
        workspaceId: s.b,
        authorProfileId: s.me.profileId,
        convertedPageId: null,
        archivedAt: null,
      });
      expect(idea?.stage).toBeUndefined();
    }
    const note = await s.t.run((ctx) => ctx.db.get("thoughtNodes", personalOne));
    expect(note).toMatchObject({ workspaceId: null, conversionCount: 1 });
    expect(note?.lastConvertedIdeaId).toBe(personalResult.ideaIds[1]);

    // Druga serija iz iste lične beleške ne pada na prvu ni na postojeću ideju.
    const again = await s.asMe.mutation(api.prostor.thoughts.convertToIdeas, {
      workspaceId: s.b,
      nodeIds: [personalOne],
    });
    const positions = await s.t.run(async (ctx) =>
      Promise.all(
        [existingIdea, ...personalResult.ideaIds, ...again.ideaIds].map(
          async (id) => {
            const idea = await ctx.db.get("ideaNodes", id);
            return `${idea?.x}:${idea?.y}`;
          },
        ),
      ),
    );
    expect(new Set(positions).size).toBe(positions.length);

    const bList = await s.asMe.query(api.prostor.ideas.list, { workspaceId: s.b });
    expect(bList.nodes.map((node) => node.stage)).toEqual([
      "predlog",
      "predlog",
      "predlog",
      "predlog",
    ]);

    // Beleška iz startupa A ide u startup B.
    const crossResult = await s.asMe.mutation(api.prostor.thoughts.convertToIdeas, {
      workspaceId: s.b,
      nodeIds: [fromA],
    });
    const crossIdea = await s.t.run((ctx) =>
      ctx.db.get("ideaNodes", crossResult.ideaIds[0]),
    );
    expect(crossIdea?.workspaceId).toBe(s.b);
  });

  test("cilj gde nisam član, tuđa i napuštena beleška i mešan izbor se odbijaju bez izmena", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      text: "Lična",
    });
    const fromA = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      text: "Iz A",
    });
    const attempts: Array<{ workspaceId: Id<"workspaces">; nodeIds: Id<"thoughtNodes">[] }> = [
      { workspaceId: s.c, nodeIds: [personal] },
      { workspaceId: s.d, nodeIds: [personal] },
      { workspaceId: s.e, nodeIds: [fromA] },
      { workspaceId: s.b, nodeIds: [s.anaPersonal] },
      { workspaceId: s.a, nodeIds: [s.anaInA] },
      { workspaceId: s.b, nodeIds: [s.leftNote] },
      { workspaceId: s.b, nodeIds: [s.archivedStartupNote] },
      { workspaceId: s.b, nodeIds: [personal, fromA] },
    ];
    for (const attempt of attempts) {
      await expect(
        s.asMe.mutation(api.prostor.thoughts.convertToIdeas, attempt),
      ).rejects.toThrow();
    }
    // Admin ne šalje tuđu belešku.
    await expect(
      s.asAdmin.mutation(api.prostor.thoughts.convertToIdeas, {
        workspaceId: s.a,
        nodeIds: [s.anaInA],
      }),
    ).rejects.toThrow();

    const ideas = await s.t.run((ctx) => ctx.db.query("ideaNodes").collect());
    expect(ideas).toEqual([]);
    // Stranica iz beleške i dalje ide preko ideje (K01 D10).
    await expect(
      s.asMe.mutation(api.prostor.thoughts.convertToPages, {
        workspaceId: s.a,
        nodeIds: [fromA],
        targetAreaId: (await s.t.run((ctx) =>
          ctx.db
            .query("areas")
            .withIndex("by_workspaceId_and_position", (q) => q.eq("workspaceId", s.a))
            .first(),
        ))!._id,
        targetParentPageId: null,
        layoutMode: "separate",
        pageKind: "note",
      }),
    ).rejects.toThrow(/Misli se prvo šalju u Ideje/);
  });

  test("stari klijent (isti startup) i dalje prenosi veze među izabranim mislima", async () => {
    const s = await seed();
    const one = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      text: "Jedan",
    });
    const two = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      text: "Dva",
    });
    await s.asMe.mutation(api.prostor.thoughts.createEdge, {
      workspaceId: s.a,
      nodeAId: one,
      nodeBId: two,
      label: "vodi ka",
    });
    const result = await s.asMe.mutation(api.prostor.thoughts.convertToIdeas, {
      workspaceId: s.a,
      nodeIds: [one, two],
    });
    expect(result.createdEdgeCount).toBe(1);
    const edges = await s.t.run((ctx) => ctx.db.query("ideaEdges").collect());
    expect(edges).toEqual([
      expect.objectContaining({ workspaceId: s.a, label: "vodi ka" }),
    ]);
  });
});

describe("Beleške: jedna beleška (getNote)", () => {
  test("vlasnik čita lične i startup beleške, svi ostali dobijaju null", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      text: "Lična za detalj",
    });
    const inA = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: s.a,
      title: "Plan",
      text: "Tekst u startupu",
    });

    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: personal })).toMatchObject({
      _id: personal,
      workspaceId: null,
      workspace: null,
      title: "Lična za detalj",
      text: "Lična za detalj",
    });
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: inA })).toMatchObject({
      _id: inA,
      workspaceId: s.a,
      workspace: { _id: s.a, name: "Cluck Rush", logoUrl: null },
    });

    // Tuđa beleška (ni admin, ni član istog startupa) ne postoji za drugoga.
    expect(await s.asAna.query(api.prostor.thoughts.getNote, { nodeId: personal })).toBeNull();
    expect(await s.asAna.query(api.prostor.thoughts.getNote, { nodeId: inA })).toBeNull();
    expect(await s.asAdmin.query(api.prostor.thoughts.getNote, { nodeId: personal })).toBeNull();
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: s.anaPersonal })).toBeNull();
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: s.anaInA })).toBeNull();
  });

  test("arhivirana beleška, napušten i arhiviran startup, arhiviran profil i neprijavljen", async () => {
    const s = await seed();
    const personal = await s.asMe.mutation(api.prostor.thoughts.createNote, {
      workspaceId: null,
      text: "Biće u arhivi",
    });
    await s.asMe.mutation(api.prostor.thoughts.archiveNodes, { nodeIds: [personal] });
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: personal })).toBeNull();
    await s.asMe.mutation(api.prostor.thoughts.restoreNodes, { nodeIds: [personal] });
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: personal })).not.toBeNull();

    // Beleške iz startupa koji sam napustio ili koji je arhiviran se ne vide.
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: s.leftNote })).toBeNull();
    expect(await s.asMe.query(api.prostor.thoughts.getNote, { nodeId: s.archivedStartupNote })).toBeNull();

    await expect(s.asGone.query(api.prostor.thoughts.getNote, { nodeId: personal })).rejects.toThrow();
    await expect(s.t.query(api.prostor.thoughts.getNote, { nodeId: personal })).rejects.toThrow();
  });
});
