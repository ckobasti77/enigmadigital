/// <reference types="vite/client" />
/**
 * Veze zadatka sa Leadovima i kanalima (SPAJANJE P19, S23):
 * - zadatak nosi firmu i izvor (`pages.get`, lista zadataka, „zadaci firme“);
 * - firma iz drugog projekta je odbijena i ništa se ne upisuje;
 * - izvor vodi samo na ekran u projektu (bez spoljne adrese);
 * - posmatrač i stranac ne prave i ne čitaju zadatke firme;
 * - Leadovi bez veze rade isto kao pre: veza ne dira nijednu `lead*` tabelu,
 *   a profil firme vraća isto pre i posle zadatka.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import { cistaPutanja } from "./lib/veze";
import { insertProfil, kao } from "./testSvet.pomoc";

const modules = import.meta.glob("/convex/**/*.*s");

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

async function firmaU(ctx: MutationCtx, workspaceId: Id<"workspaces">, name: string) {
  return await ctx.db.insert("leadCompanies", {
    workspaceId,
    name,
    nameNormalized: name.toLowerCase(),
    origin: "import",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * A: ana owner, urednica urednik, viewer client_viewer; firma „Pekara“ sa
 * zaduženjem. B: boban owner; firma „Strana“. Stranac nije nigde.
 */
async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const ana = await osoba(ctx, "ana");
    const urednica = await osoba(ctx, "urednica");
    const viewer = await osoba(ctx, "viewer");
    const boban = await osoba(ctx, "boban");
    const stranac = await osoba(ctx, "stranac");
    const A = await ctx.db.insert("workspaces", { name: "A", slug: "a", vrsta: "klijent" });
    const B = await ctx.db.insert("workspaces", { name: "B", slug: "b", vrsta: "klijent" });
    await ctx.db.insert("members", { workspaceId: A, userId: ana.userId, role: "owner" });
    await ctx.db.insert("members", { workspaceId: A, userId: urednica.userId, role: "urednik" });
    await ctx.db.insert("members", { workspaceId: A, userId: viewer.userId, role: "client_viewer" });
    await ctx.db.insert("members", { workspaceId: B, userId: boban.userId, role: "owner" });
    const oblast = (workspaceId: Id<"workspaces">) =>
      ctx.db.insert("areas", { workspaceId, key: "prodaja", label: "Prodaja", position: 0, createdAt: Date.now() });
    const oblastA = await oblast(A);
    const oblastB = await oblast(B);
    const pekara = await firmaU(ctx, A, "Pekara Zora");
    const strana = await firmaU(ctx, B, "Strana firma");
    await ctx.db.insert("leadAssignments", {
      workspaceId: A,
      companyId: pekara,
      ownerUserId: ana.userId,
      stage: "u_radu",
      nextActionAt: Date.now() + 86_400_000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { ana, urednica, viewer, boban, stranac, A, B, oblastA, oblastB, pekara, strana };
  });
  return { t, ...s };
}

type S = Awaited<ReturnType<typeof svet>>;

function noviZaFirmu(s: S, userId: Id<"users">, polja: { title?: string; leadCompanyId?: Id<"leadCompanies">; dueDate?: number; taskStatus?: "done" | "next" } = {}) {
  return kao(s.t, userId).mutation(api.prostor.veze.noviZadatak, {
    workspaceId: s.A,
    areaId: s.oblastA,
    title: polja.title ?? "Pošalji ponudu",
    leadCompanyId: polja.leadCompanyId ?? s.pekara,
    ...(polja.dueDate === undefined ? {} : { dueDate: polja.dueDate }),
    ...(polja.taskStatus === undefined ? {} : { taskStatus: polja.taskStatus }),
  });
}

async function brojStranica(s: S) {
  return await s.t.run(async (ctx) => (await ctx.db.query("pages").collect()).length);
}

/** Svi redovi Leadova projekta A (firme, zaduženja, događaji, identiteti). */
async function snimakLeadova(s: S) {
  return await s.t.run(async (ctx) => ({
    firme: await ctx.db.query("leadCompanies").collect(),
    zaduzenja: await ctx.db.query("leadAssignments").collect(),
    dogadjaji: await ctx.db.query("leadStageEvents").collect(),
    identiteti: await ctx.db.query("leadIdentities").collect(),
  }));
}

describe("zadatak za firmu", () => {
  test("zadatak nosi vezu: get, lista zadataka i zadaci firme", async () => {
    const s = await svet();
    const pageId = await noviZaFirmu(s, s.urednica.userId, { dueDate: Date.now() + 2 * 86_400_000 });

    const ana = kao(s.t, s.ana.userId);
    const strana = await ana.query(api.prostor.pages.get, { workspaceId: s.A, pageId });
    expect(strana.kind).toBe("task");
    expect(strana.leadCompanyId).toBe(s.pekara);
    expect(strana.izvor).toBeUndefined();

    const lista = await ana.query(api.prostor.tasks.listForStartup, {
      workspaceId: s.A,
      paginationOpts: { numItems: 20, cursor: null },
    });
    expect(lista.page.find((z) => z._id === pageId)?.leadCompanyId).toBe(s.pekara);

    const firme = await ana.query(api.prostor.veze.zadaciFirme, { workspaceId: s.A, leadCompanyId: s.pekara });
    expect(firme.zadaci.map((z) => z._id)).toEqual([pageId]);
    expect(firme.odseceno).toBe(false);

    const ime = await ana.query(api.prostor.veze.firma, { workspaceId: s.A, leadCompanyId: s.pekara });
    expect(ime).toEqual({ _id: s.pekara, name: "Pekara Zora" });
  });

  test("firma iz drugog projekta je odbijena i ništa se ne upisuje", async () => {
    const s = await svet();
    const pre = await brojStranica(s);
    await odbijeno(noviZaFirmu(s, s.ana.userId, { leadCompanyId: s.strana }), "not_found", /Firma/);
    expect(await brojStranica(s)).toBe(pre);

    const ana = kao(s.t, s.ana.userId);
    await odbijeno(
      ana.query(api.prostor.veze.zadaciFirme, { workspaceId: s.A, leadCompanyId: s.strana }),
      "not_found",
    );
    // Ime tuđe firme ne curi: čip dobija `null`.
    expect(await ana.query(api.prostor.veze.firma, { workspaceId: s.A, leadCompanyId: s.strana })).toBeNull();
    // Firma A kroz projekat B (boban) je takođe tuđa.
    await odbijeno(
      kao(s.t, s.boban.userId).mutation(api.prostor.veze.noviZadatak, {
        workspaceId: s.B,
        areaId: s.oblastB,
        title: "Preuzmi tuđu firmu",
        leadCompanyId: s.pekara,
      }),
      "not_found",
    );
    expect(await brojStranica(s)).toBe(pre);
  });

  test("posmatrač i stranac ne prave ni ne čitaju zadatke firme", async () => {
    const s = await svet();
    await noviZaFirmu(s, s.ana.userId);
    const pre = await brojStranica(s);
    for (const userId of [s.viewer.userId, s.stranac.userId]) {
      const greska = await noviZaFirmu(s, userId).then(() => null, (e: unknown) => e);
      expect(greska).not.toBeNull();
      const citanje = await kao(s.t, userId)
        .query(api.prostor.veze.zadaciFirme, { workspaceId: s.A, leadCompanyId: s.pekara })
        .then(() => null, (e: unknown) => e);
      expect(citanje).not.toBeNull();
    }
    expect(await brojStranica(s)).toBe(pre);
  });

  test("zadaci firme: otvoreni po roku pa završeni; obrisan i nevezan ne ulaze", async () => {
    const s = await svet();
    const dan = 86_400_000;
    const kasnije = await noviZaFirmu(s, s.ana.userId, { title: "Kasnije", dueDate: Date.now() + 5 * dan });
    const gotov = await noviZaFirmu(s, s.ana.userId, { title: "Gotov", taskStatus: "done" });
    const uskoro = await noviZaFirmu(s, s.ana.userId, { title: "Uskoro", dueDate: Date.now() + dan });
    const obrisan = await noviZaFirmu(s, s.ana.userId, { title: "Obrisan" });
    const ana = kao(s.t, s.ana.userId);
    await ana.mutation(api.prostor.pages.archive, { workspaceId: s.A, pageId: obrisan });
    // Običan zadatak (bez veze) iz „Nova stranica“ ne pripada firmi.
    const obican = await ana.mutation(api.prostor.pages.create, {
      workspaceId: s.A,
      areaId: s.oblastA,
      parentPageId: null,
      kind: "task",
      title: "Običan",
    });

    const { zadaci } = await ana.query(api.prostor.veze.zadaciFirme, { workspaceId: s.A, leadCompanyId: s.pekara });
    expect(zadaci.map((z) => z._id)).toEqual([uskoro, kasnije, gotov]);
    const obicanRed = await ana.query(api.prostor.pages.get, { workspaceId: s.A, pageId: obican });
    expect(obicanRed.leadCompanyId).toBeUndefined();
  });

  test("obrisana firma: čip dobija null, zadatak ostaje", async () => {
    const s = await svet();
    const pageId = await noviZaFirmu(s, s.ana.userId);
    await s.t.run(async (ctx) => ctx.db.delete(s.pekara));
    const ana = kao(s.t, s.ana.userId);
    expect(await ana.query(api.prostor.veze.firma, { workspaceId: s.A, leadCompanyId: s.pekara })).toBeNull();
    const strana = await ana.query(api.prostor.pages.get, { workspaceId: s.A, pageId });
    expect(strana.leadCompanyId).toBe(s.pekara);
  });
});

describe("zadatak iz komentara i iz „Čeka te“", () => {
  test("izvor se čuva sa naslovom i putanjom ekrana", async () => {
    const s = await svet();
    const urednica = kao(s.t, s.urednica.userId);
    const pageId = await urednica.mutation(api.prostor.veze.noviZadatak, {
      workspaceId: s.A,
      areaId: s.oblastA,
      title: "Odgovori na komentar",
      instructions: "„Koliko košta šišanje?“",
      izvor: { vrsta: "komentar_ig", naslov: "  Komentar   @ana_frizer ", putanja: "/instagram/komentari" },
    });
    const strana = await urednica.query(api.prostor.pages.get, { workspaceId: s.A, pageId });
    expect(strana.izvor).toEqual({ vrsta: "komentar_ig", naslov: "Komentar @ana_frizer", putanja: "/instagram/komentari" });
    expect(strana.leadCompanyId).toBeUndefined();
    expect(strana.instructions).toBe("„Koliko košta šišanje?“");

    const izCekaTe = await urednica.mutation(api.prostor.veze.noviZadatak, {
      workspaceId: s.A,
      areaId: s.oblastA,
      title: "3 firme bez broja",
      izvor: { vrsta: "ceka_te", naslov: "3 firme bez broja", putanja: "/leadovi?tab=rupe" },
    });
    const cekaTe = await urednica.query(api.prostor.pages.get, { workspaceId: s.A, pageId: izCekaTe });
    expect(cekaTe.izvor?.putanja).toBe("/leadovi?tab=rupe");
  });

  test("izvor van projekta i zadatak bez veze su odbijeni", async () => {
    const s = await svet();
    const pre = await brojStranica(s);
    const ana = kao(s.t, s.ana.userId);
    for (const putanja of ["https://zlo.example", "//zlo.example/x", "javascript:alert(1)", "/a b", "/a\\b", ""]) {
      await odbijeno(
        ana.mutation(api.prostor.veze.noviZadatak, {
          workspaceId: s.A,
          areaId: s.oblastA,
          title: "Zadatak",
          izvor: { vrsta: "ceka_te", naslov: "Stavka", putanja },
        }),
        "invalid",
      );
    }
    await odbijeno(
      ana.mutation(api.prostor.veze.noviZadatak, {
        workspaceId: s.A,
        areaId: s.oblastA,
        title: "Zadatak",
        izvor: { vrsta: "ceka_te", naslov: "   ", putanja: "/leadovi" },
      }),
      "invalid",
    );
    await odbijeno(
      ana.mutation(api.prostor.veze.noviZadatak, { workspaceId: s.A, areaId: s.oblastA, title: "Bez veze" }),
      "invalid",
    );
    expect(await brojStranica(s)).toBe(pre);
  });

  test("cistaPutanja pušta samo putanju unutar aplikacije", () => {
    expect(cistaPutanja("/leadovi/abc?tab=zadaci")).toBe("/leadovi/abc?tab=zadaci");
    expect(cistaPutanja("  /instagram/komentari ")).toBe("/instagram/komentari");
    expect(cistaPutanja("leadovi")).toBeNull();
    expect(cistaPutanja("/" + "a".repeat(400))).toBeNull();
    expect(cistaPutanja("/a\tb")).toBeNull();
  });
});

describe("Leadovi bez veze rade isto kao pre", () => {
  test("zadatak za firmu ne menja nijedan red Leadova ni profil firme", async () => {
    const s = await svet();
    const ana = kao(s.t, s.ana.userId);
    const profilPre = await ana.query(api.leadDetailStore.getLeadDetail, { workspaceId: s.A, companyId: s.pekara });
    const crmPre = await ana.query(api.leadCrmStore.getLeadCrm, { workspaceId: s.A, companyId: s.pekara });
    const lead = await snimakLeadova(s);

    const pageId = await noviZaFirmu(s, s.ana.userId);
    await ana.mutation(api.prostor.tasks.updateMetadata, { workspaceId: s.A, pageId, status: "done" });
    await ana.mutation(api.prostor.pages.archive, { workspaceId: s.A, pageId });

    expect(await snimakLeadova(s)).toEqual(lead);
    expect(await ana.query(api.leadDetailStore.getLeadDetail, { workspaceId: s.A, companyId: s.pekara })).toEqual(profilPre);
    // `now` je sat upita, ne podatak firme.
    const crmPosle = await ana.query(api.leadCrmStore.getLeadCrm, { workspaceId: s.A, companyId: s.pekara });
    expect({ ...crmPosle, now: 0 }).toEqual({ ...crmPre, now: 0 });
  });

  test("firma bez zadataka ima prazan odeljak", async () => {
    const s = await svet();
    const druga = await s.t.run(async (ctx) => firmaU(ctx, s.A, "Bez zadataka"));
    await noviZaFirmu(s, s.ana.userId);
    const rez = await kao(s.t, s.ana.userId).query(api.prostor.veze.zadaciFirme, {
      workspaceId: s.A,
      leadCompanyId: druga,
    });
    expect(rez).toEqual({ zadaci: [], odseceno: false });
  });
});
