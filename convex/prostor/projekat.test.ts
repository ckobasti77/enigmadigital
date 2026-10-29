/// <reference types="vite/client" />
/**
 * Projekat u radnom delu (SPAJANJE S02, P26, plan S01 D4).
 *
 * Prva četiri testa su Devotion `startups.test.ts › oblasti startupa (PROSTOR
 * K20)`, prevedena na Enigmu: novi projekat pravi `projekti.kreirajProjekat`
 * (vlasnik platforme), oblasti su `prostor.projekat.*`, a „ime, opis i logo
 * menja samo admin“ je ovde „opis menja samo vlasnik projekta“ (ime i logo su
 * Enigmini, `projekti.azurirajProjekat` i `podesavanjaStore`).
 */
import { convexTest, type TestConvex } from "convex-test";
import { describe, expect, test } from "vitest";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { odbijeno } from "../projekatTest.pomoc";
import schema from "../schema";
import { kao } from "./testSvet.pomoc";

// Koren projekta: ključevi `/convex/...` (vidi `identitet.test.ts`).
const modules = import.meta.glob("/convex/**/*.*s");

async function svet() {
  const t = convexTest(schema, modules);
  const s = await t.run(async (ctx) => {
    const wsA = await ctx.db.insert("workspaces", { name: "Enigma IT", slug: "enigma-it" });
    const korisnik = (email: string) => ctx.db.insert("users", { email });
    const jovan = await korisnik("jovan@enigma.test");
    const clan = await korisnik("clan@enigma.test");
    const viewer = await korisnik("viewer@enigma.test");
    const stranac = await korisnik("stranac@enigma.test");
    await ctx.db.insert("members", { workspaceId: wsA, userId: jovan, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: clan, role: "urednik" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: viewer, role: "client_viewer" });
    return { wsA, jovan, clan, viewer, stranac };
  });
  // Profili za one koji ulaze u radni deo (inače ih pravi auth-gate).
  for (const userId of [s.jovan, s.clan, s.stranac]) {
    await kao(t, userId).mutation(api.prostor.profiles.ensureCurrent, {});
  }
  return { t, ...s };
}

async function oblasti(t: TestConvex<typeof schema>, workspaceId: Id<"workspaces">) {
  return await t.run((ctx) =>
    ctx.db
      .query("areas")
      .withIndex("by_workspaceId_and_position", (q) => q.eq("workspaceId", workspaceId))
      .take(20),
  );
}

async function kanali(t: TestConvex<typeof schema>, workspaceId: Id<"workspaces">) {
  return await t.run(async (ctx) =>
    (
      await ctx.db
        .query("chatChannels")
        .withIndex("by_workspace_and_lastMessageAt", (q) =>
          q.eq("workspaceId", workspaceId).eq("archivedAt", null),
        )
        .take(20)
    ).map((k) => [k.kind, k.name]),
  );
}

describe("oblasti projekta (Devotion K20)", () => {
  test("novi projekat dobija oblasti Razvoj · Marketing · Prodaja · Ostalo sa starim ključevima", async () => {
    const s = await svet();
    const { workspaceId } = await kao(s.t, s.jovan).mutation(api.projekti.kreirajProjekat, {
      ime: "Novi",
      slug: "novi-projekat",
    });
    const nove = await oblasti(s.t, workspaceId);
    expect(nove.map((area) => [area.key, area.label, area.position])).toEqual([
      ["dev", "Razvoj", 0],
      ["marketing", "Marketing", 1],
      ["sales", "Prodaja", 2],
      ["other", "Ostalo", 3],
    ]);
    // Opšti kanal i po jedan kanal za svaku oblast (P26).
    expect((await kanali(s.t, workspaceId)).sort()).toEqual(
      [
        ["area", "Marketing"],
        ["area", "Ostalo"],
        ["area", "Prodaja"],
        ["area", "Razvoj"],
        ["startup", "Opšte"],
      ].sort(),
    );
  });

  test("pravljenje novog projekta ne dira oblasti postojećeg", async () => {
    const s = await svet();
    await s.t.run((ctx) =>
      ctx.db.insert("areas", {
        workspaceId: s.wsA,
        key: "dev",
        label: "Development",
        position: 0,
        createdAt: Date.now(),
      }),
    );
    await kao(s.t, s.jovan).mutation(api.projekti.kreirajProjekat, {
      ime: "Drugi",
      slug: "drugi-projekat",
    });
    expect((await oblasti(s.t, s.wsA)).map((area) => area.label)).toEqual(["Development"]);
  });

  test("svaki član preimenuje, dodaje i preuređuje oblasti; nečlan i client_viewer ne mogu", async () => {
    const s = await svet();
    const clan = kao(s.t, s.clan);
    const ws = { workspaceId: s.wsA };
    const first = await clan.mutation(api.prostor.projekat.createArea, { ...ws, label: "Podrška" });
    const second = await clan.mutation(api.prostor.projekat.createArea, { ...ws, label: "Finansije" });
    await clan.mutation(api.prostor.projekat.updateArea, {
      ...ws,
      areaId: first,
      label: "Korisnička podrška",
    });
    await clan.mutation(api.prostor.projekat.reorderAreas, {
      ...ws,
      orderedAreaIds: [second, first],
    });
    const detail = await clan.query(api.prostor.projekat.get, ws);
    expect(detail.areas.map((area) => area.label)).toEqual(["Finansije", "Korisnička podrška"]);
    await expect(
      kao(s.t, s.stranac).mutation(api.prostor.projekat.updateArea, { ...ws, areaId: first, label: "X" }),
    ).rejects.toThrow();
    await expect(
      kao(s.t, s.stranac).mutation(api.prostor.projekat.createArea, { ...ws, label: "X" }),
    ).rejects.toThrow();
    await odbijeno(
      kao(s.t, s.viewer).mutation(api.prostor.projekat.createArea, { ...ws, label: "X" }),
      "forbidden",
    );
    await expect(
      clan.mutation(api.prostor.projekat.updateArea, { ...ws, areaId: first, label: "   " }),
    ).rejects.toThrow(/obavezno/);
    // Nova oblast odmah ima kanal (ime kanala je naziv pri pravljenju, kao u Devotionu).
    expect(await kanali(s.t, s.wsA)).toContainEqual(["area", "Podrška"]);
  });

  test("opis projekta menja samo vlasnik projekta", async () => {
    const s = await svet();
    const ws = { workspaceId: s.wsA };
    await odbijeno(
      kao(s.t, s.clan).mutation(api.prostor.projekat.postaviOpis, { ...ws, opis: "Novi opis" }),
      "forbidden",
      /samo vlasnik projekta/,
    );
    await kao(s.t, s.jovan).mutation(api.prostor.projekat.postaviOpis, { ...ws, opis: "  Novi opis " });
    expect((await kao(s.t, s.clan).query(api.prostor.projekat.get, ws)).description).toBe("Novi opis");
    await kao(s.t, s.jovan).mutation(api.prostor.projekat.postaviOpis, { ...ws, opis: null });
    expect((await kao(s.t, s.clan).query(api.prostor.projekat.get, ws)).description).toBe("");
  });
});

describe("pripremiRadniDeo (P26)", () => {
  test("postojeći projekat dobija oblasti i kanale; drugi poziv ništa ne duplira", async () => {
    const s = await svet();
    const clan = kao(s.t, s.clan);
    await clan.mutation(api.prostor.projekat.pripremiRadniDeo, { workspaceId: s.wsA });
    await clan.mutation(api.prostor.projekat.pripremiRadniDeo, { workspaceId: s.wsA });
    expect((await oblasti(s.t, s.wsA)).map((a) => a.key)).toEqual(["dev", "marketing", "sales", "other"]);
    expect(await kanali(s.t, s.wsA)).toHaveLength(5);
  });

  test("preimenovana podrazumevana oblast ostaje preimenovana", async () => {
    const s = await svet();
    const clan = kao(s.t, s.clan);
    await clan.mutation(api.prostor.projekat.pripremiRadniDeo, { workspaceId: s.wsA });
    const [razvoj] = await oblasti(s.t, s.wsA);
    await clan.mutation(api.prostor.projekat.updateArea, {
      workspaceId: s.wsA,
      areaId: razvoj._id,
      label: "Inženjering",
    });
    await clan.mutation(api.prostor.projekat.pripremiRadniDeo, { workspaceId: s.wsA });
    const posle = await oblasti(s.t, s.wsA);
    expect(posle).toHaveLength(4);
    expect(posle[0].label).toBe("Inženjering");
  });

  test("client_viewer ne priprema radni deo", async () => {
    const s = await svet();
    await odbijeno(
      kao(s.t, s.viewer).mutation(api.prostor.projekat.pripremiRadniDeo, { workspaceId: s.wsA }),
      "forbidden",
    );
    expect(await oblasti(s.t, s.wsA)).toHaveLength(0);
  });
});

describe("moji projekti sa oblastima", () => {
  test("listForCurrent: bez client_viewer projekata, sa ulogom i oblastima", async () => {
    const s = await svet();
    await kao(s.t, s.clan).mutation(api.prostor.projekat.pripremiRadniDeo, { workspaceId: s.wsA });
    const strana = await kao(s.t, s.clan).query(api.prostor.projekat.listForCurrent, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(strana.page.map((p) => [p.name, p.uloga, p.isManager, p.areas.length])).toEqual([
      ["Enigma IT", "urednik", false, 4],
    ]);
    const zaViewera = await kao(s.t, s.viewer).query(api.prostor.projekat.listForCurrent, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(zaViewera.page).toEqual([]);
  });
});
