/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/prostor.authz.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup, ukloniClanstvo } from "./testSvet.pomoc";

/**
 * PROSTOR K23 (revizija dozvola): negativni slučajevi koje testovi K02–K06 nisu
 * pokrivali — otključavanje tuđe stranice, opis oblasti, „Poništi" komentara,
 * odlazak sa stranice, Istorija oblasti i ideje, „Oporavljeno" i pretraga
 * obrisanog. Svaki: nečlan (član drugog startupa), uklonjen član, arhiviran
 * profil i, gde ima smisla, drugi startup kroz tuđ `startupId`.
 */

const modules = import.meta.glob("/convex/**/*.*s");
const T0 = Date.UTC(2026, 9, 27, 10, 0);
const FIRST = { numItems: 20, cursor: null };

afterEach(() => {
  vi.useRealTimers();
});

const errorCode = (error: unknown) =>
  (error as { data?: { code?: string } }).data?.code;

async function seed() {
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const person = async (
      name: string,
      options: { role?: "admin" | "member"; archived?: boolean } = {},
    ) => {
      const userId = await ctx.db.insert("users", {
        name,
        email: `${name.toLowerCase()}@example.test`,
      });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: name,
        email: `${name.toLowerCase()}@example.test`,
        role: options.role ?? "member",
        archivedAt: options.archived ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const owner = await person("Owner");
    const admin = await person("Admin", { role: "admin" });
    const author = await person("Author");
    const member = await person("Member");
    const other = await person("Other");
    const outsider = await person("Outsider");
    const removed = await person("Removed");
    const archived = await person("Archived", { archived: true });
    const workspace = (name: string, createdBy: Id<"profiles">) =>
      insertStartup(ctx, {
        name,
        description: "",
        createdByProfileId: createdBy,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    const startupA = await workspace("Startup A", owner.profileId);
    const startupB = await workspace("Startup B", outsider.profileId);
    const join = (
      workspaceId: Id<"workspaces">,
      profileId: Id<"profiles">,
      archivedAt: number | null = null,
    ) =>
      insertClanstvo(ctx, {
        workspaceId,
        profileId,
        addedByProfileId: owner.profileId,
        archivedAt,
        createdAt: now,
      });
    for (const p of [owner, admin, author, member, other, archived]) {
      await join(startupA, p.profileId);
    }
    await join(startupA, removed.profileId, now);
    await join(startupB, outsider.profileId);
    const area = (workspaceId: Id<"workspaces">) =>
      ctx.db.insert("areas", {
        workspaceId,
        key: "dev",
        label: "Razvoj",
        position: 0,
        createdAt: now,
      });
    const areaA = await area(startupA);
    const areaB = await area(startupB);
    return {
      owner,
      admin,
      author,
      member,
      other,
      outsider,
      removed,
      archived,
      startupA,
      startupB,
      areaA,
      areaB,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const asAuthor = as(seeded.author);
  const pageId = await asAuthor.mutation(api.prostor.pages.create, {
    workspaceId: seeded.startupA,
    areaId: seeded.areaA,
    parentPageId: null,
    kind: "note",
    title: "Specifikacija",
    content: "<p>Telo</p>",
  });
  return {
    t,
    ...seeded,
    pageId,
    asOwner: as(seeded.owner),
    asAdmin: as(seeded.admin),
    asAuthor,
    asMember: as(seeded.member),
    asOther: as(seeded.other),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
    asArchived: as(seeded.archived),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

async function removeMember(s: Seeded, profileId: Id<"profiles">) {
  await s.t.run(async (ctx) => {
    const profile = await ctx.db.get("profiles", profileId);
    const membership = await ctx.db
      .query("members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", profile!.userId).eq("workspaceId", s.startupA),
      )
      .first();
    await ukloniClanstvo(ctx, membership?._id ?? null);
  });
}

describe("zaključavanje: tuđa stranica i spoljni pristupi", () => {
  test("član ne otključava tuđu zaključanu stranicu; nečlan, uklonjen i arhiviran ne zaključavaju ni ne otključavaju", async () => {
    const s = await seed();
    const locked = await s.asAuthor.mutation(api.prostor.pages.lock, {
      workspaceId: s.startupA,
      pageId: s.pageId,
    });

    const memberError = await s.asMember
      .mutation(api.prostor.pages.unlock, { workspaceId: s.startupA, pageId: s.pageId })
      .catch((error: unknown) => error);
    expect(errorCode(memberError)).toBe("NEMA_DOZVOLU");

    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(
        actor.mutation(api.prostor.pages.unlock, { workspaceId: s.startupA, pageId: s.pageId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        actor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.mutation(api.prostor.pages.unlock, { workspaceId: s.startupA, pageId: s.pageId }),
    ).rejects.toThrow("Profil još nije spreman");

    const page = await s.t.run((ctx) => ctx.db.get("pages", s.pageId));
    expect(page).toMatchObject({
      lockedAt: locked.lockedAt,
      lockedByProfileId: s.author.profileId,
    });
  });
});

describe("opis oblasti: čitanje i upis van startupa", () => {
  test("nečlan, uklonjen član, arhiviran profil i oblast drugog startupa ne čitaju ni ne menjaju opis", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.areasV2.updateAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaA,
      content: "<p>Opis tima</p>",
      expectedRevision: 0,
    });
    const read = (actor: Seeded["asMember"], workspaceId: Id<"workspaces">) =>
      actor.query(api.prostor.areasV2.getAreaBody, { workspaceId, areaId: s.areaA });

    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(read(actor, s.startupA)).rejects.toThrow(
        "Nemaš pristup ovom projektu.",
      );
    }
    await expect(read(s.asArchived, s.startupA)).rejects.toThrow("Profil još nije spreman");
    // Član startupa B ne dolazi do oblasti iz A ni kroz svoj startupId.
    await expect(read(s.asOutsider, s.startupB)).rejects.toThrow(
      "Oblast nije pronađena u ovom projektu.",
    );
    await expect(
      s.asOutsider.mutation(api.prostor.areasV2.updateAreaBody, {
        workspaceId: s.startupB,
        areaId: s.areaA,
        content: "Upad",
        expectedRevision: 1,
      }),
    ).rejects.toThrow("Oblast nije pronađena u ovom projektu.");

    const body = await s.asMember.query(api.prostor.areasV2.getAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaA,
    });
    expect(body).toMatchObject({ content: "<p>Opis tima</p>", revision: 1 });
  });
});

describe("komentari: „Poništi” van startupa", () => {
  test("nečlan, uklonjen član i arhiviran profil ne vraćaju uklonjen komentar ni u roku od 8 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const s = await seed();
    const commentId = await s.asOther.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "page", id: s.pageId },
      content: "Prolazan",
    });
    await s.asOther.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId });
    // convex-test 0.0.65 pomera zamrznut sat za 1 ms posle prvog upisa, pa
    // uklanjanje nije tačno u T0: poredi se sa stvarnim trenutkom uklanjanja.
    const removedAt = (
      await s.t.run((ctx) => ctx.db.get("contentContributions", commentId))
    )?.archivedAt;
    expect(removedAt).toEqual(expect.any(Number));
    // Autor komentara je uklonjen iz startupa odmah posle brisanja.
    await removeMember(s, s.other.profileId);

    vi.setSystemTime(T0 + 2_000);
    for (const actor of [s.asOutsider, s.asRemoved, s.asOther]) {
      await expect(
        actor.mutation(api.prostor.comments.restore, { workspaceId: s.startupA, commentId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.mutation(api.prostor.comments.restore, { workspaceId: s.startupA, commentId }),
    ).rejects.toThrow("Profil još nije spreman");

    const row = await s.t.run((ctx) =>
      ctx.db.get("contentContributions", commentId),
    );
    expect(row?.archivedAt).toBe(removedAt);
  });
});

describe("komentari: granica strane", () => {
  test("comments.list prima najviše 100 redova po strani", async () => {
    const s = await seed();
    const target = { kind: "page" as const, id: s.pageId };
    await s.asMember.mutation(api.prostor.comments.add, { workspaceId: s.startupA, target, content: "Prvi" });
    const full = await s.asMember.query(api.prostor.comments.list, {
      workspaceId: s.startupA,
      target,
      paginationOpts: { numItems: 100, cursor: null },
    });
    expect(full.page).toHaveLength(1);
    for (const numItems of [0, 101, 10_000]) {
      await expect(
        s.asMember.query(api.prostor.comments.list, {
          workspaceId: s.startupA,
          target,
          paginationOpts: { numItems, cursor: null },
        }),
      ).rejects.toThrow("najviše 100 komentara");
    }
  });
});

describe("prisustvo: odlazak van startupa", () => {
  test("nečlan, uklonjen član i arhiviran profil ne diraju tuđe prisustvo", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const s = await seed();
    await s.asMember.mutation(api.prostor.presence.heartbeat, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      editing: true,
    });
    for (const actor of [s.asOutsider, s.asRemoved]) {
      await expect(
        actor.mutation(api.prostor.presence.leave, { workspaceId: s.startupA, pageId: s.pageId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.mutation(api.prostor.presence.leave, { workspaceId: s.startupA, pageId: s.pageId }),
    ).rejects.toThrow("Profil još nije spreman");
    const present = await s.asAuthor.query(api.prostor.presence.listForPage, {
      workspaceId: s.startupA,
      pageId: s.pageId,
    });
    expect(present).toEqual([
      expect.objectContaining({ displayName: "Member", editing: true }),
    ]);
  });
});

describe("Istorija izmena oblasti i ideje", () => {
  test("nečlan i uklonjen član ne čitaju ni ne vraćaju; ideja u Korpi nema istoriju", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.areasV2.updateAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaA,
      content: "<p>Prvi opis</p>",
      expectedRevision: 0,
    });
    await s.asAuthor.mutation(api.prostor.areasV2.updateAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaA,
      content: "<p>Drugi opis</p>",
      expectedRevision: 1,
    });
    const ideaId = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Ideja",
      text: "Prvi tekst",
    });
    await s.asMember.mutation(api.prostor.ideas.update, {
      workspaceId: s.startupA,
      ideaId,
      title: "Ideja",
      text: "Drugi tekst",
      color: "neutral",
    });
    const areaTarget = { kind: "area" as const, id: s.areaA };
    const ideaTarget = { kind: "idea" as const, id: ideaId };
    const areaRows = (
      await s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: areaTarget,
        paginationOpts: FIRST,
      })
    ).page;
    const ideaRows = (
      await s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: ideaTarget,
        paginationOpts: FIRST,
      })
    ).page;
    expect(areaRows.length).toBeGreaterThan(1);
    expect(ideaRows.length).toBeGreaterThan(1);

    for (const actor of [s.asOutsider, s.asRemoved]) {
      for (const target of [areaTarget, ideaTarget]) {
        await expect(
          actor.query(api.prostor.history.list, { workspaceId: s.startupA, target, paginationOpts: FIRST }),
        ).rejects.toThrow("Nemaš pristup ovom projektu.");
      }
      await expect(
        actor.query(api.prostor.history.get, { workspaceId: s.startupA, revisionId: ideaRows[0]._id }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        actor.mutation(api.prostor.history.restore, {
          workspaceId: s.startupA,
          revisionId: areaRows[areaRows.length - 1]._id,
          expectedRevision: 2,
        }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        actor.mutation(api.prostor.history.restore, {
          workspaceId: s.startupA,
          revisionId: ideaRows[ideaRows.length - 1]._id,
        }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: areaTarget,
        paginationOpts: FIRST,
      }),
    ).rejects.toThrow("Profil još nije spreman");

    // Opis i ideja su nepromenjeni.
    const body = await s.asMember.query(api.prostor.areasV2.getAreaBody, {
      workspaceId: s.startupA,
      areaId: s.areaA,
    });
    expect(body.content).toBe("<p>Drugi opis</p>");
    const idea = await s.t.run((ctx) => ctx.db.get("ideaNodes", ideaId));
    expect(idea?.text).toBe("Drugi tekst");

    // Ideja u Korpi: istorija se ne čita i ne vraća dok je ideja ne vrati.
    await s.asMember.mutation(api.prostor.ideas.archive, {
      workspaceId: s.startupA,
      ideaId,
    });
    await expect(
      s.asMember.query(api.prostor.history.list, {
        workspaceId: s.startupA,
        target: ideaTarget,
        paginationOpts: FIRST,
      }),
    ).rejects.toThrow("Ideja nije pronađena.");
    await expect(
      s.asOwner.mutation(api.prostor.history.restore, {
        workspaceId: s.startupA,
        revisionId: ideaRows[ideaRows.length - 1]._id,
      }),
    ).rejects.toThrow("Ideja nije pronađena.");
  });
});

describe("Korpa › Oporavljeno: uklonjen član i arhiviran profil", () => {
  test("ne vide ni ne uklanjaju — ni sopstveni sačuvan sadržaj posle uklanjanja", async () => {
    const s = await seed();
    const recoveredId = await s.t.run((ctx) =>
      ctx.db.insert("recoveredContent", {
        workspaceId: s.startupA,
        title: "Sačuvan tekst",
        sourceKind: "page",
        sourceTargetId: s.pageId,
        createdByProfileId: s.member.profileId,
        archivedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    await removeMember(s, s.member.profileId);
    for (const actor of [s.asMember, s.asRemoved, s.asOutsider]) {
      await expect(
        actor.query(api.prostor.trash.list, {
          workspaceId: s.startupA,
          kind: "recovered",
          paginationOpts: FIRST,
        }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
      await expect(
        actor.mutation(api.prostor.trash.dismissRecovered, { workspaceId: s.startupA, recoveredId }),
      ).rejects.toThrow("Nemaš pristup ovom projektu.");
    }
    await expect(
      s.asArchived.mutation(api.prostor.trash.dismissRecovered, { workspaceId: s.startupA, recoveredId }),
    ).rejects.toThrow("Profil još nije spreman");
    const row = await s.t.run((ctx) => ctx.db.get("recoveredContent", recoveredId));
    expect(row?.archivedAt).toBeNull();
  });
});

describe("pretraga i Korpa (P21)", () => {
  test("stranica u Korpi se ne vraća u pretrazi, a posle „Vrati” opet se vraća", async () => {
    const s = await seed();
    const secretId = await s.asAuthor.mutation(api.prostor.pages.create, {
      workspaceId: s.startupA,
      areaId: s.areaA,
      parentPageId: null,
      kind: "note",
      title: "Tajni plan lansiranja",
      content: "<p>Detalji</p>",
    });
    const search = () =>
      s.asMember.query(api.prostor.search.pages, {
        query: "Tajni plan",
        workspaceId: s.startupA,
      });
    expect((await search()).map((row) => row._id)).toContain(secretId);

    await s.asMember.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: secretId });
    expect((await search()).map((row) => row._id)).not.toContain(secretId);

    await s.asOther.mutation(api.prostor.trash.restore, {
      workspaceId: s.startupA,
      target: { kind: "page", id: secretId },
    });
    expect((await search()).map((row) => row._id)).toContain(secretId);
    // Nečlan ne pretražuje startup.
    await expect(
      s.asOutsider.query(api.prostor.search.pages, {
        query: "Tajni plan",
        workspaceId: s.startupA,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu.");
  });
});
