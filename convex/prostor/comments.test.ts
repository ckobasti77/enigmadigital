/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/comments.test.ts (main @ c05c40f), SPAJANJE S05.

import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { MAX_COMMENT_MENTIONS } from "./lib/validators";
import schema from "../schema";
import { insertClanstvo, insertProfil, insertStartup, ukloniClanstvo } from "./testSvet.pomoc";

/**
 * PROSTOR K04: komentari (P5) i pominjanja — vidljivost, dozvole, obaveštenja,
 * aktivnost i brojevi, uključujući negativne slučajeve (nečlan, uklonjen član,
 * arhiviran profil, drugi startup).
 */

const modules = import.meta.glob("/convex/**/*.*s");
// Ponedeljak 10:00 u budućnosti: sat convex-testa ne ide unazad od poslednjeg upisa (seed koristi stvarno vreme).
const T0 = Date.UTC(2030, 9, 28, 10, 0);

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
    const assignee = await person("Assignee");
    const outsider = await person("Outsider");
    const removed = await person("Removed");
    const archived = await person("Archived", { archived: true });
    const startupA = await insertStartup(ctx, {
      name: "Startup A",
      description: "",
      createdByProfileId: owner.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const startupB = await insertStartup(ctx, {
      name: "Startup B",
      description: "",
      createdByProfileId: outsider.profileId,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });
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
    for (const p of [owner, admin, author, member, other, assignee, archived]) {
      await join(startupA, p.profileId);
    }
    await join(startupA, removed.profileId, now);
    await join(startupB, outsider.profileId);
    const areaId = await ctx.db.insert("areas", {
      workspaceId: startupA,
      key: "dev",
      label: "Razvoj",
      position: 0,
      createdAt: now,
    });
    return {
      owner,
      admin,
      author,
      member,
      other,
      assignee,
      outsider,
      removed,
      archived,
      startupA,
      startupB,
      areaId,
    };
  });
  const as = (person: { userId: Id<"users"> }) =>
    t.withIdentity({ subject: `${person.userId}|sesija-test` });
  const asAuthor = as(seeded.author);
  const pageId = await asAuthor.mutation(api.prostor.pages.create, {
    workspaceId: seeded.startupA,
    areaId: seeded.areaId,
    parentPageId: null,
    kind: "note",
    title: "Specifikacija",
    content: "<p>Telo stranice</p>",
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
    asAssignee: as(seeded.assignee),
    asOutsider: as(seeded.outsider),
    asRemoved: as(seeded.removed),
    asArchived: as(seeded.archived),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const pageTarget = (s: Seeded) => ({ kind: "page" as const, id: s.pageId });
const FIRST_PAGE = { numItems: 50, cursor: null };

function list(
  actor: Seeded["asMember"],
  workspaceId: Id<"workspaces">,
  target:
    | { kind: "page"; id: Id<"pages"> }
    | { kind: "idea"; id: Id<"ideaNodes"> }
    | { kind: "area"; id: Id<"areas"> }
    | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> },
) {
  return actor.query(api.prostor.comments.list, {
    workspaceId,
    target,
    paginationOpts: FIRST_PAGE,
  });
}

async function notificationsOf(s: Seeded, type?: Doc<"notifications">["type"]) {
  const rows = await s.t.run((ctx) => ctx.db.query("notifications").collect());
  return type === undefined ? rows : rows.filter((row) => row.type === type);
}

async function rawRow(
  s: Seeded,
  values: {
    targetKind: Doc<"contentContributions">["targetKind"];
    targetId: string;
    authorProfileId?: Id<"profiles">;
    attribution?: "author" | "legacy_neutral";
    content: string;
    sourceKind?: Doc<"contentContributions">["sourceKind"];
    moderationStatus?: Doc<"contentContributions">["moderationStatus"];
    archivedAt?: number | null;
    createdAt?: number;
  },
) {
  return await s.t.run((ctx) =>
    ctx.db.insert("contentContributions", {
      workspaceId: s.startupA,
      targetKind: values.targetKind,
      targetKey: `${values.targetKind}:${values.targetId}`,
      targetId: values.targetId,
      authorProfileId: values.authorProfileId,
      attribution: values.attribution ?? "author",
      content: values.content,
      sourceKind: values.sourceKind,
      moderationStatus: values.moderationStatus,
      archivedAt: values.archivedAt ?? null,
      createdAt: values.createdAt ?? Date.now(),
      updatedAt: values.createdAt ?? Date.now(),
    }),
  );
}

async function createTask(s: Seeded) {
  const taskId = await s.asAuthor.mutation(api.prostor.pages.create, {
    workspaceId: s.startupA,
    areaId: s.areaId,
    parentPageId: null,
    kind: "task",
    title: "Lansiranje",
    assigneeProfileId: s.assignee.profileId,
    checkpoints: [{ id: "cp-1", text: "Korak 1", completed: false }],
  });
  const rows = await s.asAuthor.query(api.prostor.taskCheckpoints.listForTask, {
    workspaceId: s.startupA,
    taskPageId: taskId,
    canvasRootPageId: null,
  });
  return { taskId, checkpointId: rows[0]._id };
}

describe("lista komentara: vidljivost", () => {
  test("komentar člana na tuđoj stranici je odmah vidljiv svim članovima, a telo stranice nije komentar", async () => {
    const s = await seed();
    // Telo stranice postoji kao prilog (`page_body`), ali nikad nije komentar.
    const bodies = await s.t.run((ctx) =>
      ctx.db
        .query("contentContributions")
        .withIndex("by_targetKey_and_archivedAt_and_createdAt", (q) =>
          q.eq("targetKey", `page:${s.pageId}`).eq("archivedAt", null),
        )
        .collect(),
    );
    const bodyId =
      bodies.find((row) => row.sourceKind === "page_body")?._id ??
      (await rawRow(s, {
        targetKind: "page",
        targetId: s.pageId,
        authorProfileId: s.author.profileId,
        content: "<p>Telo stranice</p>",
        sourceKind: "page_body",
        moderationStatus: "approved",
      }));

    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Prvi komentar",
    });

    for (const actor of [s.asAuthor, s.asMember, s.asOther, s.asOwner, s.asAdmin]) {
      const result = await list(actor, s.startupA, pageTarget(s));
      expect(result.page.map((row) => row._id)).toEqual([commentId]);
      expect(result.page[0]).toMatchObject({
        content: "Prvi komentar",
        origin: "comment",
        moderationStatus: "approved",
        edited: false,
        mentions: [],
        author: { _id: s.member.profileId, displayName: "Member" },
      });
      expect(result.page.map((row) => row._id)).not.toContain(bodyId);
    }
  });

  test("zatečeni prilozi: na čekanju i odobreni se vide, odbijeni samo autoru i vlasniku stavke, obrisani nikad", async () => {
    const s = await seed();
    const base = Date.now();
    const pending = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.member.profileId,
      content: "Na čekanju",
      moderationStatus: "pending",
      createdAt: base + 1,
    });
    const approved = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.member.profileId,
      content: "Odobren",
      moderationStatus: "approved",
      createdAt: base + 2,
    });
    const plain = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.member.profileId,
      content: "Bez statusa",
      createdAt: base + 3,
    });
    const rejected = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.member.profileId,
      content: "Odbijen",
      moderationStatus: "rejected",
      createdAt: base + 4,
    });
    const entry = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.other.profileId,
      content: "Stari unos",
      sourceKind: "page_entry",
      createdAt: base + 5,
    });
    const shared = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      attribution: "legacy_neutral",
      content: "Zajednički tekst",
      createdAt: base + 6,
    });
    const deleted = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.member.profileId,
      content: "Obrisan",
      archivedAt: base + 7,
      createdAt: base + 7,
    });

    const ids = async (actor: Seeded["asMember"]) =>
      (await list(actor, s.startupA, pageTarget(s))).page.map((row) => row._id);

    // Autor komentara i autor stranice vide i odbijeni; ostali ne.
    const everything = [pending, approved, plain, rejected, entry, shared];
    expect(await ids(s.asMember)).toEqual(everything);
    expect(await ids(s.asAuthor)).toEqual(everything);
    const withoutRejected = everything.filter((id) => id !== rejected);
    expect(await ids(s.asOther)).toEqual(withoutRejected);
    expect(await ids(s.asOwner)).toEqual(withoutRejected);
    expect(await ids(s.asAdmin)).toEqual(withoutRejected);
    expect(await ids(s.asMember)).not.toContain(deleted);

    const asOwnerView = (await list(s.asOwner, s.startupA, pageTarget(s))).page;
    const byId = new Map(asOwnerView.map((row) => [row._id, row]));
    expect(byId.get(entry)).toMatchObject({
      origin: "legacy_entry",
      author: { displayName: "Other" },
      // Vlasnik startupa uklanja tuđi komentar, ali ga ne menja.
      permissions: { canEdit: false, canRemove: true },
    });
    expect(byId.get(shared)).toMatchObject({
      origin: "legacy_shared",
      author: null,
      permissions: { canEdit: false, canRemove: true },
    });
    expect(byId.get(pending)?.moderationStatus).toBe("pending");
    expect(byId.get(plain)?.moderationStatus).toBe("approved");
    // Običan član ne uklanja zajednički tekst bez autora.
    const asOtherView = (await list(s.asOther, s.startupA, pageTarget(s))).page;
    expect(
      asOtherView.find((row) => row._id === shared)?.permissions,
    ).toEqual({ canEdit: false, canRemove: false });
  });

  test("lista je paginirana i rastuća po vremenu", async () => {
    const s = await seed();
    const created: Array<Id<"contentContributions">> = [];
    for (let index = 0; index < 5; index += 1) {
      created.push(
        await s.asMember.mutation(api.prostor.comments.add, {
          workspaceId: s.startupA,
          target: pageTarget(s),
          content: `Komentar ${index + 1}`,
        }),
      );
    }
    const seen: Array<Id<"contentContributions">> = [];
    let cursor: string | null = null;
    for (let step = 0; step < 6; step += 1) {
      const result: Awaited<ReturnType<typeof list>> = await s.asOwner.query(
        api.prostor.comments.list,
        {
          workspaceId: s.startupA,
          target: pageTarget(s),
          paginationOpts: { numItems: 2, cursor },
        },
      );
      seen.push(...result.page.map((row) => row._id));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(seen).toEqual(created);
  });

  test("komentari na ideji, opisu oblasti i koraku zadatka; telo ideje nije komentar", async () => {
    const s = await seed();
    const ideaId = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Ideja",
      text: "Tekst ideje",
    });
    await rawRow(s, {
      targetKind: "idea",
      targetId: ideaId,
      authorProfileId: s.author.profileId,
      content: "Tekst ideje",
      sourceKind: "idea_original",
      moderationStatus: "approved",
    });
    const { checkpointId } = await createTask(s);

    const onIdea = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "idea", id: ideaId },
      content: "Podržavam",
    });
    const onArea = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "area", id: s.areaId },
      content: "Dopuna opisa",
    });
    const onStep = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "task_checkpoint", id: checkpointId },
      content: "Pitanje o koraku",
    });

    expect(
      (await list(s.asOwner, s.startupA, { kind: "idea", id: ideaId })).page.map(
        (row) => row._id,
      ),
    ).toEqual([onIdea]);
    expect(
      (await list(s.asOwner, s.startupA, { kind: "area", id: s.areaId })).page.map(
        (row) => row._id,
      ),
    ).toEqual([onArea]);
    const step = await list(s.asOwner, s.startupA, {
      kind: "task_checkpoint",
      id: checkpointId,
    });
    expect(step.page.map((row) => row._id)).toEqual([onStep]);
    expect(step.page[0].targetKind).toBe("task_checkpoint");
  });

  test("stranica u Korpi nema komentare ni nove komentare", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Pre brisanja",
    });
    await s.asOther.mutation(api.prostor.pages.archive, { workspaceId: s.startupA, pageId: s.pageId });
    await expect(list(s.asMember, s.startupA, pageTarget(s))).rejects.toThrow(
      "Stranica nije pronađena",
    );
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "Posle brisanja",
      }),
    ).rejects.toThrow("Stranica nije pronađena");
  });
});

describe("dodavanje, izmena, uklanjanje", () => {
  test("autor menja svoj komentar, a tuđi ne menja niko — ni vlasnik ni admin", async () => {
    const s = await seed();
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Original",
    });
    for (const actor of [s.asOther, s.asAuthor, s.asOwner, s.asAdmin]) {
      const error = await actor
        .mutation(api.prostor.comments.update, { workspaceId: s.startupA, commentId, content: "Tuđa izmena" })
        .catch((e: unknown) => e);
      expect(errorCode(error)).toBe("NEMA_DOZVOLU");
    }
    await s.asMember.mutation(api.prostor.comments.update, {
      workspaceId: s.startupA,
      commentId,
      content: "Izmenjeno",
    });
    const [row] = (await list(s.asOwner, s.startupA, pageTarget(s))).page;
    expect(row).toMatchObject({ content: "Izmenjeno", edited: true });
  });

  test("prazan i predugačak tekst se odbijaju", async () => {
    const s = await seed();
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "   ",
      }),
    ).rejects.toThrow("ne može biti prazan");
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "<p></p>",
      }),
    ).rejects.toThrow("ne može biti prazan");
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "a".repeat(20_001),
      }),
    ).rejects.toThrow("najviše 20.000");
  });

  test("uklanjanje: autor svoj, vlasnik i admin tuđi, član tuđi ne; red se arhivira, ne briše", async () => {
    const s = await seed();
    const mine = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Moj",
    });
    const error = await s.asOther
      .mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId: mine })
      .catch((e: unknown) => e);
    expect(errorCode(error)).toBe("NEMA_DOZVOLU");
    // Autor stranice nije menadžer: tuđi komentar na svojoj stranici ne uklanja.
    const authorError = await s.asAuthor
      .mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId: mine })
      .catch((e: unknown) => e);
    expect(errorCode(authorError)).toBe("NEMA_DOZVOLU");

    const removed = await s.asOwner.mutation(api.prostor.comments.remove, {
      workspaceId: s.startupA,
      commentId: mine,
    });
    expect(removed.commentId).toBe(mine);
    expect(removed.undoUntil).toBeGreaterThan(Date.now() - 1);
    expect((await list(s.asMember, s.startupA, pageTarget(s))).page).toHaveLength(0);
    const row = await s.t.run((ctx) => ctx.db.get("contentContributions", mine));
    expect(row?.archivedAt).toEqual(expect.any(Number));
    expect(row?.content).toBe("Moj");

    const second = await s.asAdmin.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Adminov",
    });
    await s.asAdmin.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId: second });
    const third = await s.asOther.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Treći",
    });
    await s.asOther.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId: third });
  });

  test("telo stranice i ideje se ne uklanja ni ne menja kao komentar", async () => {
    const s = await seed();
    const body = await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.author.profileId,
      content: "<p>Telo</p>",
      sourceKind: "page_body",
      moderationStatus: "approved",
    });
    for (const actor of [s.asAuthor, s.asOwner, s.asAdmin]) {
      const removeError = await actor
        .mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId: body })
        .catch((e: unknown) => e);
      expect(errorCode(removeError)).toBe("NEMA_DOZVOLU");
      const updateError = await actor
        .mutation(api.prostor.comments.update, { workspaceId: s.startupA, commentId: body, content: "Nov" })
        .catch((e: unknown) => e);
      expect(errorCode(updateError)).toBe("NEMA_DOZVOLU");
    }
    const row = await s.t.run((ctx) => ctx.db.get("contentContributions", body));
    expect(row).toMatchObject({ archivedAt: null, content: "<p>Telo</p>" });
  });

  test("Poništi radi 8 s: autor i menadžer vraćaju, drugi član ne, posle roka niko", async () => {
    const s = await seed();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Prolazan",
    });

    await s.asMember.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId });
    vi.setSystemTime(T0 + 5_000);
    const other = await s.asOther
      .mutation(api.prostor.comments.restore, { workspaceId: s.startupA, commentId })
      .catch((e: unknown) => e);
    expect(errorCode(other)).toBe("NEMA_DOZVOLU");
    await s.asMember.mutation(api.prostor.comments.restore, { workspaceId: s.startupA, commentId });
    expect((await list(s.asOwner, s.startupA, pageTarget(s))).page).toHaveLength(1);

    // Vlasnik uklanja tuđi komentar i sam ga vraća u roku.
    vi.setSystemTime(T0 + 6_000);
    await s.asOwner.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId });
    vi.setSystemTime(T0 + 9_000);
    await s.asOwner.mutation(api.prostor.comments.restore, { workspaceId: s.startupA, commentId });
    expect((await list(s.asOwner, s.startupA, pageTarget(s))).page).toHaveLength(1);

    vi.setSystemTime(T0 + 20_000);
    await s.asMember.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId });
    vi.setSystemTime(T0 + 20_000 + 8_001);
    await expect(
      s.asMember.mutation(api.prostor.comments.restore, { workspaceId: s.startupA, commentId }),
    ).rejects.toThrow("Vreme za Undo je isteklo");
    expect((await list(s.asOwner, s.startupA, pageTarget(s))).page).toHaveLength(0);
  });

  test("zaključana stranica se i dalje komentariše", async () => {
    const s = await seed();
    await s.asAuthor.mutation(api.prostor.pages.lock, { workspaceId: s.startupA, pageId: s.pageId });
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Komentar na zaključanoj",
    });
    expect((await list(s.asOther, s.startupA, pageTarget(s))).page[0]._id).toBe(commentId);
  });
});

describe("pristup: nečlan, uklonjen član, arhiviran profil, drugi startup", () => {
  test("niko osim aktivnog člana ne čita, ne dodaje, ne menja ni ne uklanja", async () => {
    const s = await seed();
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Samo za tim",
    });
    const ideaId = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Ideja",
      text: "Tekst",
    });

    // Arhiviran profil: nalog je deaktiviran posle prijave.
    await s.t.run((ctx) =>
      ctx.db.patch("profiles", s.other.profileId, { archivedAt: Date.now() }),
    );

    for (const actor of [s.asOutsider, s.asRemoved, s.asOther]) {
      await expect(list(actor, s.startupA, pageTarget(s))).rejects.toThrow();
      await expect(
        list(actor, s.startupA, { kind: "idea", id: ideaId }),
      ).rejects.toThrow();
      await expect(
        list(actor, s.startupA, { kind: "area", id: s.areaId }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.prostor.comments.add, {
          workspaceId: s.startupA,
          target: pageTarget(s),
          content: "Upad",
        }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.prostor.comments.update, { workspaceId: s.startupA, commentId, content: "Upad" }),
      ).rejects.toThrow();
      await expect(
        actor.mutation(api.prostor.comments.remove, { workspaceId: s.startupA, commentId }),
      ).rejects.toThrow();
      await expect(
        actor.query(api.prostor.comments.countFor, {
          workspaceId: s.startupA,
          targets: [pageTarget(s)],
        }),
      ).rejects.toThrow();
    }
    // Ništa nije promenjeno.
    const row = await s.t.run((ctx) => ctx.db.get("contentContributions", commentId));
    expect(row).toMatchObject({ content: "Samo za tim", archivedAt: null });
  });

  test("uklonjen član više ne čita ni svoj raniji komentar", async () => {
    const s = await seed();
    await s.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", s.member.userId).eq("workspaceId", s.startupA),
        )
        .first();
      await ukloniClanstvo(ctx, membership?._id ?? null);
    });
    await expect(list(s.asMember, s.startupA, pageTarget(s))).rejects.toThrow(
      "Nemaš pristup",
    );
  });
});

describe("pominjanja", () => {
  test("server zadržava samo aktivne članove startupa, bez autora komentara", async () => {
    const s = await seed();
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "<p>Pogledajte</p>",
      mentionProfileIds: [
        s.other.profileId, // aktivan član ✓
        s.member.profileId, // autor komentara ✗
        s.outsider.profileId, // član drugog startupa ✗
        s.removed.profileId, // uklonjen član ✗
        s.archived.profileId, // arhiviran profil ✗
        s.assignee.profileId, // aktivan član ✓
      ],
    });
    const row = await s.t.run((ctx) => ctx.db.get("contentContributions", commentId));
    expect(row?.mentionProfileIds).toEqual([
      s.other.profileId,
      s.assignee.profileId,
    ]);
    const [shown] = (await list(s.asOwner, s.startupA, pageTarget(s))).page;
    expect(shown.mentions.map((m) => m.displayName)).toEqual([
      "Other",
      "Assignee",
    ]);
  });

  test("isti član dvaput i više od 20 pominjanja su greška klijenta", async () => {
    const s = await seed();
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "Dupli",
        mentionProfileIds: [s.other.profileId, s.other.profileId],
      }),
    ).rejects.toThrow("više puta");

    const many = await s.t.run(async (ctx) => {
      const ids: Array<Id<"profiles">> = [];
      for (let index = 0; index <= MAX_COMMENT_MENTIONS; index += 1) {
        const userId = await ctx.db.insert("users", {
          name: `Gost ${index}`,
          email: `gost${index}@example.test`,
        });
        ids.push(
          await insertProfil(ctx, {
            userId,
            displayName: `Gost ${index}`,
            email: `gost${index}@example.test`,
            role: "member",
            archivedAt: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        );
      }
      return ids;
    });
    expect(many).toHaveLength(MAX_COMMENT_MENTIONS + 1);
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "Previše",
        mentionProfileIds: many,
      }),
    ).rejects.toThrow("najviše 20");
    // Tačno 20 prolazi (nečlanovi se tiho odbacuju).
    await expect(
      s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: "Tačno dvadeset",
        mentionProfileIds: many.slice(0, MAX_COMMENT_MENTIONS),
      }),
    ).resolves.toBeDefined();
  });

  test("izmena odbijenog komentara ne obaveštava nove pomenute (ne mogu da ga vide)", async () => {
    const s = await seed();
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Prvo",
    });
    await s.t.run((ctx) =>
      ctx.db.patch("contentContributions", commentId, {
        moderationStatus: "rejected",
      }),
    );
    await s.asMember.mutation(api.prostor.comments.update, {
      workspaceId: s.startupA,
      commentId,
      content: "Drugo",
      mentionProfileIds: [s.other.profileId],
    });
    // Pominjanje je sačuvano, ali niko nije obavešten.
    const row = await s.t.run((ctx) => ctx.db.get("contentContributions", commentId));
    expect(row?.mentionProfileIds).toEqual([s.other.profileId]);
    expect(await notificationsOf(s, "comment_mention")).toHaveLength(0);
  });

  test("izmena obaveštava samo novo pomenute, a pominjanja se mogu skinuti", async () => {
    const s = await seed();
    const commentId = await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Prvo",
      mentionProfileIds: [s.other.profileId],
    });
    expect(await notificationsOf(s, "comment_mention")).toHaveLength(1);

    await s.asMember.mutation(api.prostor.comments.update, {
      workspaceId: s.startupA,
      commentId,
      content: "Drugo",
      mentionProfileIds: [s.other.profileId, s.assignee.profileId],
    });
    const mentions = await notificationsOf(s, "comment_mention");
    expect(mentions.map((row) => row.recipientProfileId).sort()).toEqual(
      [s.other.profileId, s.assignee.profileId].sort(),
    );

    // Bez liste pominjanja ostaju kakva jesu; prazna lista ih skida.
    await s.asMember.mutation(api.prostor.comments.update, {
      workspaceId: s.startupA,
      commentId,
      content: "Treće",
    });
    let row = await s.t.run((ctx) => ctx.db.get("contentContributions", commentId));
    expect(row?.mentionProfileIds).toHaveLength(2);
    await s.asMember.mutation(api.prostor.comments.update, {
      workspaceId: s.startupA,
      commentId,
      content: "Četvrto",
      mentionProfileIds: [],
    });
    row = await s.t.run((ctx) => ctx.db.get("contentContributions", commentId));
    expect(row?.mentionProfileIds).toBeUndefined();
    expect(await notificationsOf(s, "comment_mention")).toHaveLength(2);
  });
});

describe("obaveštenja", () => {
  test("pominjanje daje comment_mention samo aktivnom članu; autor stranice dobija comment_added", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "<p>Šta misliš, <span>@Other</span>?</p>",
      mentionProfileIds: [
        s.other.profileId,
        s.outsider.profileId,
        s.removed.profileId,
      ],
    });

    const mentions = await notificationsOf(s, "comment_mention");
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({
      recipientProfileId: s.other.profileId,
      workspaceId: s.startupA,
      targetType: "page",
      targetId: s.pageId,
      actorProfileId: s.member.profileId,
      title: "Member te je pomenuo/la u komentaru: „Specifikacija”",
      body: "Šta misliš, @Other?",
      readAt: null,
    });

    const added = await notificationsOf(s, "comment_added");
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      recipientProfileId: s.author.profileId,
      targetType: "page",
      targetId: s.pageId,
      title: "Member je komentarisao/la „Specifikacija”",
    });
    // Autor komentara, nečlan i uklonjen član ne dobijaju ništa.
    const all = await notificationsOf(s);
    for (const profileId of [
      s.member.profileId,
      s.outsider.profileId,
      s.removed.profileId,
      s.owner.profileId,
    ]) {
      expect(all.some((row) => row.recipientProfileId === profileId)).toBe(
        false,
      );
    }
  });

  test("autor stranice koji je pomenut dobija samo comment_mention, ne i comment_added", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Autore, pogledaj",
      mentionProfileIds: [s.author.profileId],
    });
    expect(
      (await notificationsOf(s, "comment_mention")).map(
        (row) => row.recipientProfileId,
      ),
    ).toEqual([s.author.profileId]);
    expect(await notificationsOf(s, "comment_added")).toHaveLength(0);
  });

  test("autor komentara ne dobija obaveštenje za svoj komentar na svojoj stranici", async () => {
    const s = await seed();
    await s.asAuthor.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Beleška za sebe",
      mentionProfileIds: [s.author.profileId],
    });
    expect(await notificationsOf(s)).toHaveLength(0);
  });

  test("zadatak: komentar obaveštava autora i izvršioce; korak vodi na zadatak", async () => {
    const s = await seed();
    const { taskId, checkpointId } = await createTask(s);

    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "page", id: taskId },
      content: "Komentar na zadatku",
    });
    expect(
      (await notificationsOf(s, "comment_added"))
        .map((row) => row.recipientProfileId)
        .sort(),
    ).toEqual([s.author.profileId, s.assignee.profileId].sort());

    await s.asAssignee.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "task_checkpoint", id: checkpointId },
      content: "Komentar na koraku",
      mentionProfileIds: [s.other.profileId],
    });
    const stepNotices = (await notificationsOf(s)).filter(
      (row) => row.body === "Komentar na koraku",
    );
    expect(
      stepNotices.map((row) => [row.type, row.recipientProfileId]).sort(),
    ).toEqual(
      [
        ["comment_added", s.author.profileId],
        ["comment_mention", s.other.profileId],
      ].sort(),
    );
    // Izvršilac koji komentariše ne dobija svoje; korak vodi na stranicu zadatka.
    expect(stepNotices.every((row) => row.targetId === taskId)).toBe(true);
    expect(stepNotices.every((row) => row.targetType === "page")).toBe(true);
  });

  test("ideja: autor dobija comment_added koji vodi na ideju", async () => {
    const s = await seed();
    const ideaId = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Nova ideja",
      text: "Tekst",
    });
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "idea", id: ideaId },
      content: "Dobra ideja",
    });
    const [notice] = await notificationsOf(s, "comment_added");
    expect(notice).toMatchObject({
      recipientProfileId: s.author.profileId,
      targetType: "ideas",
      targetId: ideaId,
      title: "Member je komentarisao/la „Nova ideja”",
    });
  });

  test("opis oblasti: komentar ne budi nikoga osim pomenutih, a pominjanje vodi na oblast", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "area", id: s.areaId },
      content: "Bez pominjanja",
    });
    expect(await notificationsOf(s)).toHaveLength(0);

    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "area", id: s.areaId },
      content: "Sa pominjanjem",
      mentionProfileIds: [s.owner.profileId],
    });
    const all = await notificationsOf(s);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({
      type: "comment_mention",
      recipientProfileId: s.owner.profileId,
      targetType: "area",
      targetId: s.areaId,
      title: "Member te je pomenuo/la u komentaru: „Razvoj”",
    });
  });

  test("uklonjen član ne dobija obaveštenje čak ni kao autor stranice", async () => {
    const s = await seed();
    await s.t.run(async (ctx) => {
      const membership = await ctx.db
        .query("members")
        .withIndex("by_user_workspace", (q) =>
          q.eq("userId", s.author.userId).eq("workspaceId", s.startupA),
        )
        .first();
      await ukloniClanstvo(ctx, membership?._id ?? null);
    });
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Autor je otišao",
    });
    expect(await notificationsOf(s)).toHaveLength(0);
  });
});

describe("aktivnost i stari API", () => {
  test("comment_created beleži naslov stavke i isečak", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "<p>Ovo je komentar</p><p>u dva reda</p>",
    });
    const ideaId = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Ideja",
      text: "Tekst",
    });
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: { kind: "idea", id: ideaId },
      content: "Za ideju",
    });
    const rows = (
      await s.t.run((ctx) => ctx.db.query("activities").collect())
    ).filter((row) => row.action === "comment_created");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      workspaceId: s.startupA,
      actorProfileId: s.member.profileId,
      targetType: "page",
      targetId: s.pageId,
      title: "Specifikacija",
      detail: "Ovo je komentar u dva reda",
    });
    expect(rows[1]).toMatchObject({
      targetType: "idea",
      targetId: ideaId,
      title: "Ideja",
      detail: "Za ideju",
    });
  });

  test("collaboration.addContribution ide istim tokom (odmah vidljiv, obaveštenje, pominjanje)", async () => {
    const s = await seed();
    const id = await s.asMember.mutation(api.prostor.collaboration.addContribution, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Preko starog API-ja",
      mentionProfileIds: [s.other.profileId],
    });
    const old = await s.asOwner.query(api.prostor.collaboration.listContributions, {
      workspaceId: s.startupA,
      target: pageTarget(s),
    });
    expect(old).toEqual([
      expect.objectContaining({
        _id: id,
        moderationStatus: "approved",
        canEdit: false,
        canDeleteDirectly: true,
        canRequestDeletion: false,
        mentionProfileIds: [s.other.profileId],
      }),
    ]);
    expect(await notificationsOf(s, "comment_mention")).toHaveLength(1);
    expect(await notificationsOf(s, "comment_added")).toHaveLength(1);
    const asOther = await s.asOther.query(api.prostor.collaboration.listContributions, {
      workspaceId: s.startupA,
      target: pageTarget(s),
    });
    expect(asOther[0]).toMatchObject({
      canEdit: false,
      canDeleteDirectly: false,
      canRequestDeletion: false,
    });
  });

  test("pages.addEntry/deleteEntry: unos je komentar, uklanjanje ne briše red unosa", async () => {
    const s = await seed();
    const entryId = await s.asMember.mutation(api.prostor.pages.addEntry, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      content: "Unos",
    });
    expect(
      (await list(s.asOwner, s.startupA, pageTarget(s))).page.map((row) => row.origin),
    ).toEqual(["legacy_entry"]);
    expect(await notificationsOf(s, "comment_added")).toHaveLength(1);

    const error = await s.asOther
      .mutation(api.prostor.pages.deleteEntry, { workspaceId: s.startupA, pageId: s.pageId, entryId })
      .catch((e: unknown) => e);
    expect(errorCode(error)).toBe("NEMA_DOZVOLU");

    await s.asOwner.mutation(api.prostor.pages.deleteEntry, {
      workspaceId: s.startupA,
      pageId: s.pageId,
      entryId,
    });
    expect((await list(s.asMember, s.startupA, pageTarget(s))).page).toHaveLength(0);
    const entry = await s.t.run((ctx) => ctx.db.get("pageEntries", entryId));
    expect(entry).toMatchObject({ content: "Unos" });
  });
});

describe("brojevi komentara", () => {
  test("countFor broji komentare, preskače tela i odbijene, seče na 20", async () => {
    const s = await seed();
    const ideaId = await s.asAuthor.mutation(api.prostor.ideas.create, {
      workspaceId: s.startupA,
      title: "Ideja",
      text: "Tekst",
    });
    await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.author.profileId,
      content: "<p>Telo</p>",
      sourceKind: "page_body",
      moderationStatus: "approved",
    });
    await rawRow(s, {
      targetKind: "page",
      targetId: s.pageId,
      authorProfileId: s.member.profileId,
      content: "Odbijen",
      moderationStatus: "rejected",
    });
    for (let index = 0; index < 3; index += 1) {
      await s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: { kind: "idea", id: ideaId },
        content: `Komentar ${index}`,
      });
    }
    for (let index = 0; index < 22; index += 1) {
      await s.asMember.mutation(api.prostor.comments.add, {
        workspaceId: s.startupA,
        target: pageTarget(s),
        content: `Komentar ${index}`,
      });
    }

    const counts = await s.asOwner.query(api.prostor.comments.countFor, {
      workspaceId: s.startupA,
      targets: [
        pageTarget(s),
        { kind: "idea", id: ideaId },
        { kind: "area", id: s.areaId },
      ],
    });
    expect(counts).toEqual([
      { targetKind: "page", targetId: s.pageId, count: 20, capped: true },
      { targetKind: "idea", targetId: ideaId, count: 3, capped: false },
      { targetKind: "area", targetId: s.areaId, count: 0, capped: false },
    ]);
  });

  test("countFor ne broji redove iz drugog startupa i odbija previše ciljeva", async () => {
    const s = await seed();
    await s.asMember.mutation(api.prostor.comments.add, {
      workspaceId: s.startupA,
      target: pageTarget(s),
      content: "Komentar",
    });
    // Isti ključ cilja, ali red pripada drugom startupu — ne računa se.
    await s.t.run((ctx) =>
      ctx.db.insert("contentContributions", {
        workspaceId: s.startupB,
        targetKind: "page",
        targetKey: `page:${s.pageId}`,
        targetId: s.pageId,
        authorProfileId: s.outsider.profileId,
        attribution: "author",
        content: "Tuđ red",
        moderationStatus: "approved",
        archivedAt: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const [one] = await s.asOwner.query(api.prostor.comments.countFor, {
      workspaceId: s.startupA,
      targets: [pageTarget(s)],
    });
    expect(one.count).toBe(1);
    // Član drugog startupa ne čita brojeve startupa A.
    await expect(
      s.asOutsider.query(api.prostor.comments.countFor, {
        workspaceId: s.startupA,
        targets: [pageTarget(s)],
      }),
    ).rejects.toThrow("Nemaš pristup");

    await expect(
      s.asOwner.query(api.prostor.comments.countFor, {
        workspaceId: s.startupA,
        targets: Array.from({ length: 101 }, () => pageTarget(s)),
      }),
    ).rejects.toThrow("Najviše 100");
  });
});
