/// <reference types="vite/client" />
// SPAJANJE S03 (nov test): dokumenti radnog dela u Enigmi — izolacija po
// projektu (P8, O5) i ponašanje koje korak mora da zadrži: autosave sa
// `expectedRevision` i `KONFLIKT_IZMENA`, zaključavanje (autor, vlasnik
// projekta, vlasnik platforme), Korpa i vraćanje, Istorija i „Vrati ovu
// verziju“, komentari sa @pominjanjem, aktivnost, prisustvo (TTL) i pretraga
// po projektu. Devotion testovi istih modula koji zovu ideje, beleške ili
// zadatke prelaze u S05 (S01 D9).
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { PAGE_PRESENCE_TTL_MS } from "./lib/pagePresence";
import { insertClanstvo, insertProfil, insertStartup, kao } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

async function seed() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const now = Date.now();
    const osoba = async (ime: string, admin = false) => {
      const email = `${ime.toLowerCase()}@example.test`;
      const userId = await ctx.db.insert("users", { name: ime, email });
      const profileId = await insertProfil(ctx, {
        userId,
        displayName: ime,
        email,
        role: admin ? "admin" : "member",
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, profileId };
    };
    const vlasnik = await osoba("Vlasnik");
    const autor = await osoba("Autor");
    const kolega = await osoba("Kolega");
    const platforma = await osoba("Platforma", true);
    const dvojni = await osoba("Dvojni");
    const stranac = await osoba("Stranac");
    const projekat = (name: string, kreator: Id<"profiles">) =>
      insertStartup(ctx, {
        name,
        description: "",
        createdByProfileId: kreator,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    const a = await projekat("Projekat A", vlasnik.profileId);
    const b = await projekat("Projekat B", stranac.profileId);
    for (const clan of [autor, kolega, platforma, dvojni]) {
      await insertClanstvo(ctx, {
        workspaceId: a,
        profileId: clan.profileId,
        archivedAt: null,
      });
    }
    await insertClanstvo(ctx, { workspaceId: b, profileId: dvojni.profileId, archivedAt: null });
    // Klijent (client_viewer) u A: bez profila, kao u Enigmi (D16).
    const klijentId = await ctx.db.insert("users", { name: "Klijent", email: "klijent@example.test" });
    await ctx.db.insert("members", { workspaceId: a, userId: klijentId, role: "client_viewer" });
    const oblast = (workspaceId: Id<"workspaces">, key: string) =>
      ctx.db.insert("areas", { workspaceId, key, label: key, position: 0, createdAt: now });
    return {
      vlasnik,
      autor,
      kolega,
      platforma,
      dvojni,
      stranac,
      klijentId,
      a,
      b,
      oblastA: await oblast(a, "razvoj"),
      oblastB: await oblast(b, "razvoj"),
    };
  });
  const stranica = await kao(t, s.autor.userId).mutation(api.prostor.pages.create, {
    workspaceId: s.a,
    areaId: s.oblastA,
    parentPageId: null,
    kind: "note",
    title: "Plan lansiranja",
    content: "<p>Prva verzija</p>",
  });
  return { t, ...s, stranica };
}

describe("izolacija po projektu", () => {
  test("dokument iz drugog projekta se odbija i ništa se ne upisuje", async () => {
    const s = await seed();
    const dvojni = kao(s.t, s.dvojni.userId);
    const uB = { workspaceId: s.b };
    const tudje = /nije pronađena u ovom projektu/;

    await expect(
      dvojni.query(api.prostor.pages.get, { ...uB, pageId: s.stranica }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.mutation(api.prostor.pages.update, {
        ...uB,
        pageId: s.stranica,
        content: "<p>Upad</p>",
        expectedRevision: 0,
      }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.mutation(api.prostor.pages.lock, { ...uB, pageId: s.stranica }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.mutation(api.prostor.pages.archive, { ...uB, pageId: s.stranica }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.mutation(api.prostor.comments.add, {
        ...uB,
        target: { kind: "page", id: s.stranica },
        content: "Komentar spolja",
      }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.query(api.prostor.history.list, {
        ...uB,
        target: { kind: "page", id: s.stranica },
        paginationOpts: { numItems: 10, cursor: null },
      }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.mutation(api.prostor.presence.heartbeat, {
        ...uB,
        pageId: s.stranica,
        editing: true,
      }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.query(api.prostor.areasV2.getCanvas, {
        ...uB,
        areaId: s.oblastA,
        rootPageId: null,
      }),
    ).rejects.toThrow(tudje);
    await expect(
      dvojni.mutation(api.prostor.pages.create, {
        ...uB,
        areaId: s.oblastA,
        parentPageId: null,
        kind: "note",
        title: "Podmetnuta",
      }),
    ).rejects.toThrow(tudje);

    const stanje = await s.t.run(async (ctx) => ({
      stranica: await ctx.db.get("pages", s.stranica),
      komentari: (await ctx.db.query("contentContributions").collect()).filter(
        (red) => red.sourceKind !== "page_body",
      ),
      prisustvo: await ctx.db.query("pagePresence").collect(),
      straniceUB: await ctx.db
        .query("pages")
        .withIndex("by_workspaceId_and_archivedAt_and_updatedAt", (q) =>
          q.eq("workspaceId", s.b),
        )
        .collect(),
    }));
    expect(stanje.stranica).toMatchObject({ revision: 0, archivedAt: null });
    expect(stanje.stranica?.lockedAt ?? null).toBeNull();
    expect(stanje.komentari).toEqual([]);
    expect(stanje.prisustvo).toEqual([]);
    expect(stanje.straniceUB).toEqual([]);

    // Isti član u svom projektu radi normalno.
    await expect(
      dvojni.query(api.prostor.pages.get, { workspaceId: s.a, pageId: s.stranica }),
    ).resolves.toMatchObject({ title: "Plan lansiranja" });
  });

  test("klijent i stranac ne ulaze u radni deo", async () => {
    const s = await seed();
    const args = { workspaceId: s.a, pageId: s.stranica };
    await expect(
      kao(s.t, s.klijentId).query(api.prostor.pages.get, args),
    ).rejects.toThrow("urednik ili vlasnik projekta");
    await expect(
      kao(s.t, s.klijentId).query(api.prostor.trash.counts, { workspaceId: s.a }),
    ).rejects.toThrow("urednik ili vlasnik projekta");
    await expect(
      kao(s.t, s.stranac.userId).query(api.prostor.pages.get, args),
    ).rejects.toThrow("Nemaš pristup ovom projektu");
    await expect(
      s.t.query(api.prostor.pages.get, args),
    ).rejects.toThrow("Niste prijavljeni");
  });
});

describe("dokumenti", () => {
  test("autosave sa expectedRevision: zastarela revizija daje KONFLIKT_IZMENA", async () => {
    const s = await seed();
    const autor = kao(s.t, s.autor.userId);
    const prvo = await autor.mutation(api.prostor.pages.update, {
      workspaceId: s.a,
      pageId: s.stranica,
      content: "<p>Druga verzija</p>",
      expectedRevision: 0,
    });
    expect(prvo.revision).toBe(1);
    await expect(
      kao(s.t, s.kolega.userId).mutation(api.prostor.pages.update, {
        workspaceId: s.a,
        pageId: s.stranica,
        content: "<p>Kolegina verzija</p>",
        expectedRevision: 0,
      }),
    ).rejects.toThrow("KONFLIKT_IZMENA");
    const posle = await autor.query(api.prostor.pages.get, {
      workspaceId: s.a,
      pageId: s.stranica,
    });
    expect(posle).toMatchObject({ revision: 1, content: "<p>Druga verzija</p>" });
  });

  test("zaključava autor, vlasnik projekta i vlasnik platforme; ostali ne", async () => {
    const s = await seed();
    const args = { workspaceId: s.a, pageId: s.stranica };
    await expect(
      kao(s.t, s.kolega.userId).mutation(api.prostor.pages.lock, args),
    ).rejects.toThrow("NEMA_DOZVOLU");
    for (const ko of [s.autor, s.vlasnik, s.platforma]) {
      const zakljucano = await kao(s.t, ko.userId).mutation(api.prostor.pages.lock, args);
      expect(zakljucano.lockedByProfileId).toBe(ko.profileId);
      // Zaključanu stranicu kolega ne menja.
      await expect(
        kao(s.t, s.kolega.userId).mutation(api.prostor.pages.update, {
          ...args,
          content: "<p>Kolega</p>",
          expectedRevision: 0,
        }),
      ).rejects.toThrow("ZAKLJUCANO");
      await kao(s.t, ko.userId).mutation(api.prostor.pages.unlock, args);
    }
    await expect(
      kao(s.t, s.kolega.userId).mutation(api.prostor.pages.update, {
        ...args,
        content: "<p>Kolega posle otključavanja</p>",
        expectedRevision: 0,
      }),
    ).resolves.toMatchObject({ revision: 1 });
  });

  test("Korpa: obrisana stranica je u Korpi, a Vrati je vraća", async () => {
    const s = await seed();
    const autor = kao(s.t, s.autor.userId);
    await autor.mutation(api.prostor.pages.archive, { workspaceId: s.a, pageId: s.stranica });
    const korpa = await autor.query(api.prostor.trash.list, {
      workspaceId: s.a,
      kind: "page",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(
      korpa.page.map((stavka) => (stavka.kind === "page" ? stavka.pageId : null)),
    ).toEqual([s.stranica]);
    // Korpa drugog projekta je prazna.
    const korpaB = await kao(s.t, s.dvojni.userId).query(api.prostor.trash.list, {
      workspaceId: s.b,
      kind: "page",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(korpaB.page).toEqual([]);

    await autor.mutation(api.prostor.trash.restore, {
      workspaceId: s.a,
      target: { kind: "page", id: s.stranica },
    });
    expect(
      await autor.query(api.prostor.pages.get, { workspaceId: s.a, pageId: s.stranica }),
    ).toMatchObject({ archivedAt: null, title: "Plan lansiranja" });
  });

  test("Istorija: „Vrati ovu verziju“ vraća prvu verziju", async () => {
    const s = await seed();
    const autor = kao(s.t, s.autor.userId);
    await autor.mutation(api.prostor.pages.update, {
      workspaceId: s.a,
      pageId: s.stranica,
      content: "<p>Druga verzija</p>",
      expectedRevision: 0,
    });
    const istorija = await autor.query(api.prostor.history.list, {
      workspaceId: s.a,
      target: { kind: "page", id: s.stranica },
      paginationOpts: { numItems: 10, cursor: null },
    });
    const prva = istorija.page.find((r) => r.kind === "baseline");
    expect(prva).toBeDefined();
    expect(prva?.canRestore).toBe(true);
    const vraceno = await autor.mutation(api.prostor.history.restore, {
      workspaceId: s.a,
      revisionId: prva!._id,
      expectedRevision: 1,
    });
    expect(vraceno).toMatchObject({ changed: true, targetRevision: 2 });
    expect(
      await autor.query(api.prostor.pages.get, { workspaceId: s.a, pageId: s.stranica }),
    ).toMatchObject({ content: "<p>Prva verzija</p>", revision: 2 });
  });

  test("komentar sa @pominjanjem budi samo članove projekta", async () => {
    const s = await seed();
    await kao(s.t, s.kolega.userId).mutation(api.prostor.comments.add, {
      workspaceId: s.a,
      target: { kind: "page", id: s.stranica },
      content: "Pogledaj ovo",
      mentionProfileIds: [s.vlasnik.profileId, s.stranac.profileId],
    });
    const obavestenja = await s.t.run((ctx) => ctx.db.query("notifications").collect());
    const pominjanja = obavestenja.filter((o) => o.type === "comment_mention");
    expect(pominjanja.map((o) => o.recipientProfileId)).toEqual([s.vlasnik.profileId]);
    expect(pominjanja[0]).toMatchObject({ workspaceId: s.a, actorProfileId: s.kolega.profileId });
    expect(obavestenja.some((o) => o.recipientProfileId === s.stranac.profileId)).toBe(false);

    const komentari = await kao(s.t, s.autor.userId).query(api.prostor.comments.list, {
      workspaceId: s.a,
      target: { kind: "page", id: s.stranica },
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(komentari.page).toHaveLength(1);
  });

  test("aktivnost beleži nastanak i zaključavanje stranice", async () => {
    const s = await seed();
    await kao(s.t, s.vlasnik.userId).mutation(api.prostor.pages.lock, {
      workspaceId: s.a,
      pageId: s.stranica,
    });
    const aktivnost = await kao(s.t, s.kolega.userId).query(api.prostor.activity.listForStartup, {
      workspaceId: s.a,
    });
    expect(aktivnost.map((a) => a.action)).toEqual(
      expect.arrayContaining(["page_created", "page_locked"]),
    );
    const aktivnostB = await kao(s.t, s.dvojni.userId).query(api.prostor.activity.listForStartup, {
      workspaceId: s.b,
    });
    expect(aktivnostB).toEqual([]);
  });

  test("prisustvo ističe posle TTL-a i nestaje odlaskom", async () => {
    const s = await seed();
    const args = { workspaceId: s.a, pageId: s.stranica };
    await kao(s.t, s.kolega.userId).mutation(api.prostor.presence.heartbeat, {
      ...args,
      editing: true,
    });
    const prisutni = await kao(s.t, s.autor.userId).query(api.prostor.presence.listForPage, args);
    expect(prisutni).toHaveLength(1);
    expect(prisutni[0]).toMatchObject({ profileId: s.kolega.profileId, editing: true });
    expect(prisutni[0].expiresAt - prisutni[0].updatedAt).toBe(PAGE_PRESENCE_TTL_MS);

    await kao(s.t, s.kolega.userId).mutation(api.prostor.presence.leave, args);
    expect(
      await kao(s.t, s.autor.userId).query(api.prostor.presence.listForPage, args),
    ).toEqual([]);
  });

  test("pretraga vidi samo projekte u kojima je član urednik ili vlasnik", async () => {
    const s = await seed();
    const uA = await kao(s.t, s.kolega.userId).query(api.prostor.search.pages, {
      query: "lansiranja",
      workspaceId: s.a,
    });
    expect(uA.map((p) => p._id)).toEqual([s.stranica]);
    expect(uA[0].workspace).toEqual({ _id: s.a, name: "Projekat A", logoUrl: null });

    const sviMoji = await kao(s.t, s.kolega.userId).query(api.prostor.search.pages, {
      query: "lansiranja",
    });
    expect(sviMoji.map((p) => p._id)).toEqual([s.stranica]);

    const stranac = await kao(s.t, s.stranac.userId).query(api.prostor.search.pages, {
      query: "lansiranja",
    });
    expect(stranac).toEqual([]);
    await expect(
      kao(s.t, s.stranac.userId).query(api.prostor.search.pages, {
        query: "lansiranja",
        workspaceId: s.a,
      }),
    ).rejects.toThrow("Nemaš pristup ovom projektu");
  });
});
