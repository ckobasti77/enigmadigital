/// <reference types="vite/client" />
/**
 * Zadaci i lični nivo posle spajanja (SPAJANJE S04, plan S01 §5.4):
 * - lični nivo („Ja“: Moj dan, Moji zadaci) vidi samo projekte u kojima je
 *   pozivalac `owner` ili `urednik`, bez `client_viewer` i arhiviranih (O5);
 * - opseg „moji projekti“ je 50 (P28);
 * - projektna funkcija ne dira dokument drugog projekta;
 * - uklonjen član se skida sa zadataka samo tog projekta (D23).
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import { insertProfil, kao } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

const DAN = "2026-10-29";

async function osoba(ctx: MutationCtx, ime: string) {
  const email = `${ime}@enigma.test`;
  const userId = await ctx.db.insert("users", { email, name: ime });
  const now = Date.now();
  const profileId = await insertProfil(ctx, {
    userId,
    displayName: ime,
    email,
    role: "member",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  return { userId, profileId };
}

async function projekat(ctx: MutationCtx, ime: string) {
  // „klijent“: owner ovde nije vlasnik platforme, pa nema prečice kroz P7.
  const workspaceId = await ctx.db.insert("workspaces", {
    name: ime,
    slug: ime.toLowerCase(),
    vrsta: "klijent",
  });
  const areaId = await ctx.db.insert("areas", {
    workspaceId,
    key: "dev",
    label: "Razvoj",
    position: 0,
    createdAt: Date.now(),
  });
  return { workspaceId, areaId };
}

/**
 * Ja: owner u A, urednik u B, client_viewer u C (bio urednik), urednik u
 * arhiviranom D. Kolega: urednik u A, owner u B, C i D. U svakom projektu je
 * jedan zadatak dodeljen meni; C i D postaju nedostupni tek posle dodele.
 */
async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const ja = await osoba(ctx, "ja");
    const kolega = await osoba(ctx, "kolega");
    const A = await projekat(ctx, "A");
    const B = await projekat(ctx, "B");
    const C = await projekat(ctx, "C");
    const D = await projekat(ctx, "D");
    const clan = (
      workspaceId: Id<"workspaces">,
      userId: Id<"users">,
      role: "owner" | "urednik" | "client_viewer",
    ) => ctx.db.insert("members", { workspaceId, userId, role });
    await clan(A.workspaceId, ja.userId, "owner");
    await clan(A.workspaceId, kolega.userId, "urednik");
    await clan(B.workspaceId, ja.userId, "urednik");
    await clan(B.workspaceId, kolega.userId, "owner");
    const jaUC = await clan(C.workspaceId, ja.userId, "urednik");
    await clan(C.workspaceId, kolega.userId, "owner");
    await clan(D.workspaceId, ja.userId, "urednik");
    await clan(D.workspaceId, kolega.userId, "owner");
    return { ja, kolega, A, B, C, D, jaUC };
  });

  const zadatak = async (p: { workspaceId: Id<"workspaces">; areaId: Id<"areas"> }, naslov: string) =>
    await kao(t, s.kolega.userId).mutation(api.prostor.pages.create, {
      workspaceId: p.workspaceId,
      areaId: p.areaId,
      parentPageId: null,
      kind: "task",
      title: naslov,
      assigneeProfileIds: [s.ja.profileId],
    });
  const tA = await zadatak(s.A, "Zadatak A");
  const tB = await zadatak(s.B, "Zadatak B");
  const tC = await zadatak(s.C, "Zadatak C");
  const tD = await zadatak(s.D, "Zadatak D");

  await t.run(async (ctx) => {
    await ctx.db.patch(s.jaUC, { role: "client_viewer" });
    await ctx.db.patch(s.D.workspaceId, { arhiviran: true });
  });
  return { t, ...s, tA, tB, tC, tD, ja_: kao(t, s.ja.userId) };
}

describe("lični nivo: samo projekti u kojima sam owner ili urednik", () => {
  test("Moj dan, Moji zadaci i listMine ne vide client_viewer ni arhiviran projekat", async () => {
    const s = await svet();
    const dozvoljeni = [s.A.workspaceId, s.B.workspaceId].sort();

    const dan = await s.ja_.query(api.prostor.myDay.overview, { dayKey: DAN, doneSince: 0 });
    expect(dan.workspaces.map((w) => w._id).sort()).toEqual(dozvoljeni);
    expect(dan.tasks.map((z) => z._id).sort()).toEqual([s.tA, s.tB].sort());

    const svuda = await s.ja_.query(api.prostor.tasks.listEverywhere, { scope: "all" });
    expect(svuda.items.map((z) => z._id).sort()).toEqual([s.tA, s.tB].sort());
    for (const z of svuda.items) expect(dozvoljeni).toContain(z.workspace._id);

    const moji = await s.ja_.query(api.prostor.tasks.listMine, {});
    expect(moji.map((z) => z._id).sort()).toEqual([s.tA, s.tB].sort());
    for (const z of moji) expect(dozvoljeni).toContain(z.workspace._id);
  });

  test("filter projekta i plan dana odbijaju client_viewer i arhiviran projekat", async () => {
    const s = await svet();
    await odbijeno(
      s.ja_.query(api.prostor.tasks.listEverywhere, { scope: "open", workspaceId: s.C.workspaceId }),
      "forbidden",
      /urednik ili vlasnik projekta/,
    );
    await odbijeno(
      s.ja_.query(api.prostor.tasks.listEverywhere, { scope: "open", workspaceId: s.D.workspaceId }),
      "not_found",
      /Projekat nije pronađen/,
    );
    for (const taskPageId of [s.tC, s.tD]) {
      await expect(
        s.ja_.mutation(api.prostor.myDay.plan, { dayKey: DAN, ref: { kind: "task", taskPageId } }),
      ).rejects.toThrow("Zadatak nije pronađen.");
    }
    // Dostupan zadatak ulazi u plan, nedostupni ne ostavljaju trag.
    await s.ja_.mutation(api.prostor.myDay.plan, { dayKey: DAN, ref: { kind: "task", taskPageId: s.tA } });
    const dan = await s.ja_.query(api.prostor.myDay.overview, { dayKey: DAN, doneSince: 0 });
    expect(dan.entries.map((e) => e.taskPageId)).toEqual([s.tA]);
  });

  test("projektni ekrani projekta u kome sam client_viewer su zatvoreni", async () => {
    const s = await svet();
    await odbijeno(
      s.ja_.query(api.prostor.tasks.commandCenter, { workspaceId: s.C.workspaceId }),
      "forbidden",
    );
    await odbijeno(
      s.ja_.query(api.prostor.puls.getWeekly, {
        workspaceId: s.C.workspaceId,
        prevWeekStart: 0,
        weekStart: 1,
        weekEnd: 2,
        now: 2,
      }),
      "forbidden",
    );
  });

  test("puls tima: client_viewer nije na spisku ljudi (P9)", async () => {
    const s = await svet();
    const sada = Date.now();
    const nedelja = 7 * 24 * 60 * 60 * 1000;
    const puls = await kao(s.t, s.kolega.userId).query(api.prostor.puls.getWeekly, {
      workspaceId: s.C.workspaceId,
      prevWeekStart: sada - 2 * nedelja,
      weekStart: sada - nedelja,
      weekEnd: sada + 1,
      now: sada,
    });
    const aktivni = puls.members.filter((m) => !m.isArchived).map((m) => m.profileId);
    expect(aktivni).toEqual([s.kolega.profileId]);
    // Zadatak mu je ostao dodeljen iz vremena kad je bio urednik: vidi se kao
    // učešće bivšeg člana, ne kao član tima.
    expect(puls.members.find((m) => m.profileId === s.ja.profileId)?.isArchived).toBe(true);
  });

  test("opseg „moji projekti“ je 50 i kad sam član u 51 projektu", async () => {
    const t = convexTest(schema, modules);
    const ja = await t.run(async (ctx) => {
      const ja = await osoba(ctx, "ja");
      for (let i = 0; i < 51; i++) {
        const { workspaceId } = await projekat(ctx, `P${i}`);
        await ctx.db.insert("members", { workspaceId, userId: ja.userId, role: "urednik" });
      }
      return ja;
    });
    const dan = await kao(t, ja.userId).query(api.prostor.myDay.overview, { dayKey: DAN, doneSince: 0 });
    expect(dan.workspaces).toHaveLength(50);
    // Najnovije članstvo je prvo: poslednji projekat je u opsegu, prvi nije.
    expect(dan.workspaces.map((w) => w.name)).toContain("P50");
    expect(dan.workspaces.map((w) => w.name)).not.toContain("P0");
  });
});

describe("izolacija projektnih funkcija zadataka", () => {
  test("dokument drugog projekta se odbija i ništa se ne upisuje", async () => {
    const s = await svet();
    const uA = { workspaceId: s.A.workspaceId };

    await odbijeno(
      s.ja_.mutation(api.prostor.tasks.updateMetadata, { ...uA, pageId: s.tB, priority: "urgent" }),
      "not_found",
      /Stavka nije pronađena u ovom projektu/,
    );
    await odbijeno(
      s.ja_.mutation(api.prostor.taskCheckpoints.create, { ...uA, taskPageId: s.tB, text: "Korak" }),
      "not_found",
    );
    await odbijeno(s.ja_.mutation(api.prostor.taskAssignees.leave, { ...uA, taskPageId: s.tB }), "not_found");
    await odbijeno(
      s.ja_.query(api.prostor.taskCheckpoints.listForTask, { ...uA, taskPageId: s.tB }),
      "not_found",
    );

    // Spisak izvršilaca za više zadataka tiho preskače tuđ zadatak.
    const spiskovi = await s.ja_.query(api.prostor.taskAssignees.listForTasks, {
      ...uA,
      taskPageIds: [s.tA, s.tB],
    });
    expect(spiskovi.map((r) => r.taskPageId)).toEqual([s.tA]);

    // „Sredi rokove“ preskače zadatak drugog projekta.
    const grupno = await s.ja_.mutation(api.prostor.tasks.bulkReschedule, {
      ...uA,
      taskPageIds: [s.tA, s.tB],
      complete: true,
    });
    expect(grupno.updated.map((u) => u.taskPageId)).toEqual([s.tA]);
    expect(grupno.skipped).toEqual([{ taskPageId: s.tB, reason: "drugi_startup" }]);

    const posle = await s.t.run(async (ctx) => ({
      b: await ctx.db.get(s.tB),
      koraci: await ctx.db
        .query("taskCheckpoints")
        .withIndex("by_taskPageId_and_archivedAt_and_position", (q) => q.eq("taskPageId", s.tB))
        .collect(),
    }));
    expect(posle.b?.taskPriority).not.toBe("urgent");
    expect(posle.b?.taskStatus).not.toBe("done");
    expect(posle.koraci).toEqual([]);
  });

  test("stranac i client_viewer ne ulaze u zadatke projekta", async () => {
    const s = await svet();
    const stranac = await s.t.run((ctx) => osoba(ctx, "stranac"));
    await odbijeno(
      kao(s.t, stranac.userId).query(api.prostor.tasks.commandCenter, { workspaceId: s.A.workspaceId }),
      "forbidden",
      /Nemaš pristup ovom projektu/,
    );
    await odbijeno(
      s.ja_.mutation(api.prostor.tasks.updateMetadata, {
        workspaceId: s.C.workspaceId,
        pageId: s.tC,
        status: "done",
      }),
      "forbidden",
    );
  });

  test("„Premesti u projekat“ ne ide u projekat u kome sam client_viewer", async () => {
    const s = await svet();
    const licni = await s.ja_.mutation(api.prostor.personalTasks.create, { title: "Moje" });
    await odbijeno(
      s.ja_.mutation(api.prostor.personalTasks.moveToStartup, {
        workspaceId: s.C.workspaceId,
        personalTaskId: licni,
        areaId: s.C.areaId,
      }),
      "forbidden",
    );
    // Oblast drugog projekta uz moj projekat se takođe odbija.
    await expect(
      s.ja_.mutation(api.prostor.personalTasks.moveToStartup, {
        workspaceId: s.A.workspaceId,
        personalTaskId: licni,
        areaId: s.B.areaId,
      }),
    ).rejects.toThrow();
    const zadatak = await s.ja_.query(api.prostor.personalTasks.get, { personalTaskId: licni });
    expect(zadatak?.status).toBe("open");

    // U svoj projekat prelazi i postaje zadatak sa mnom kao izvršiocem.
    const { pageId } = await s.ja_.mutation(api.prostor.personalTasks.moveToStartup, {
      workspaceId: s.A.workspaceId,
      personalTaskId: licni,
      areaId: s.A.areaId,
    });
    const svuda = await s.ja_.query(api.prostor.tasks.listEverywhere, {
      scope: "open",
      workspaceId: s.A.workspaceId,
    });
    expect(svuda.items.map((z) => z._id)).toContain(pageId);
  });
});

describe("uklanjanje člana iz projekta (D23)", () => {
  test("skida ga sa zadataka tog projekta, a zadaci drugog projekta ostaju", async () => {
    const s = await svet();
    const kolega_ = kao(s.t, s.kolega.userId);
    // Ja (owner A, urednik B) dodeljujem kolegi po zadatak u A i u B.
    for (const [p, taskPageId] of [
      [s.A, s.tA],
      [s.B, s.tB],
    ] as const) {
      await s.ja_.mutation(api.prostor.taskAssignees.setAssignees, {
        workspaceId: p.workspaceId,
        taskPageId,
        profileIds: [s.ja.profileId, s.kolega.profileId],
      });
    }

    await s.ja_.mutation(api.membersStore.removeMember, {
      workspaceId: s.A.workspaceId,
      userId: s.kolega.userId,
      preuzimaLeadoveUserId: s.ja.userId,
    });

    const izvrsioci = async (workspaceId: Id<"workspaces">, taskPageId: Id<"pages">) =>
      (await s.ja_.query(api.prostor.taskAssignees.listForTask, { workspaceId, taskPageId })).map(
        (r) => r.profileId,
      );
    expect(await izvrsioci(s.A.workspaceId, s.tA)).toEqual([s.ja.profileId]);
    expect(await izvrsioci(s.B.workspaceId, s.tB)).toEqual([s.ja.profileId, s.kolega.profileId]);

    // Projekcija na stranici prati preostalog izvršioca; kolega u B i dalje radi.
    const a = await s.t.run((ctx) => ctx.db.get(s.tA));
    expect(a?.assigneeProfileId).toBe(s.ja.profileId);
    const kolegini = await kolega_.query(api.prostor.tasks.listEverywhere, { scope: "open" });
    expect(kolegini.items.map((z) => z._id)).toEqual([s.tB]);
  });
});
