/// <reference types="vite/client" />
/**
 * Omotači pristupa iz `lib/projekat.ts` (PROJEKTI-PLAN §5, plan C02 §2):
 * prijava, članstvo u TAČNO tom projektu, minimalna uloga, vlasnik platforme.
 * Probne funkcije su u `projekatProba.pomoc.ts` (ne deployuju se).
 */
import { makeFunctionReference, type FunctionType } from "convex/server";
import { describe, expect, test } from "vitest";

import type { Id } from "./_generated/dataModel";
import { kao, napraviPravilo, napraviSvet, odbijeno } from "./projekatTest.pomoc";

function proba<T extends FunctionType>(ime: string) {
  return makeFunctionReference<T>(`projekatProba.pomoc:${ime}`);
}

const upit = proba<"query">("probniUpit");
const upitUrednik = proba<"query">("probniUpitUrednik");
const izmena = proba<"mutation">("probnaIzmena");
const izmenaVlasnik = proba<"mutation">("probnaIzmenaVlasnik");
const licna = proba<"mutation">("probnaLicna");
const akcija = proba<"action">("probnaAkcija");
const akcijaVlasnik = proba<"action">("probnaAkcijaVlasnik");
const prijavljen = proba<"query">("probnoPrijavljen");
const prijavljenaIzmena = proba<"mutation">("probnaPrijavljenaIzmena");
const platforma = proba<"query">("probnaPlatforma");
const platformaIzmena = proba<"mutation">("probnaPlatformaIzmena");

const NEMA_PRISTUP = /Nemaš pristup ovom projektu/;
const TREBA_UREDNIK = /urednik ili vlasnik/;
const TREBA_VLASNIK = /samo vlasnik projekta/;

describe("omotači projekta", () => {
  test("neprijavljen poziv pada na svakom omotaču", async () => {
    const s = await napraviSvet();
    const ws = { workspaceId: s.wsA };
    await odbijeno(s.t.query(upit, ws), "unauthorized");
    await odbijeno(s.t.mutation(izmena, { ...ws, ime: "x" }), "unauthorized");
    await odbijeno(s.t.action(akcija, { ...ws, poruka: "x" }), "unauthorized");
    await odbijeno(s.t.query(prijavljen, {}), "unauthorized");
    await odbijeno(s.t.mutation(prijavljenaIzmena, {}), "unauthorized");
    await odbijeno(s.t.query(platforma, {}), "unauthorized");
    await odbijeno(s.t.mutation(platformaIzmena, {}), "unauthorized");
  });

  test("workspaceId je obavezan argument", async () => {
    const s = await napraviSvet();
    await expect(kao(s, s.ana).query(upit, {})).rejects.toThrow(/workspaceId/);
  });

  test("korisnik bez članstva u projektu dobija forbidden", async () => {
    const s = await napraviSvet();
    await odbijeno(kao(s, s.stranac).query(upit, { workspaceId: s.wsA }), "forbidden", NEMA_PRISTUP);
    await odbijeno(
      kao(s, s.stranac).action(akcija, { workspaceId: s.wsA, poruka: "x" }),
      "forbidden",
      NEMA_PRISTUP,
    );
  });

  test("član A ne čita i ne menja B; u A vidi samo podatke A", async () => {
    const s = await napraviSvet();
    await napraviPravilo(s, s.wsA, "pravilo A");
    await napraviPravilo(s, s.wsB, "pravilo B");

    const uA = await kao(s, s.ana).query(upit, { workspaceId: s.wsA });
    expect(uA.pravila).toEqual(["pravilo A"]);
    expect(uA.projekat).toEqual({ userId: s.ana, workspaceId: s.wsA, uloga: "owner" });
    expect(uA.workspaceIdIzArgs).toBe(s.wsA);

    await odbijeno(kao(s, s.ana).query(upit, { workspaceId: s.wsB }), "forbidden", NEMA_PRISTUP);
    await odbijeno(
      kao(s, s.ana).mutation(izmena, { workspaceId: s.wsB, ime: "upad" }),
      "forbidden",
      NEMA_PRISTUP,
    );
    await odbijeno(
      kao(s, s.ana).action(akcija, { workspaceId: s.wsB, poruka: "x" }),
      "forbidden",
      NEMA_PRISTUP,
    );
    const imenaB = await s.t.run(async (ctx) =>
      (
        await ctx.db
          .query("rules")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", s.wsB))
          .collect()
      ).map((r) => r.name),
    );
    expect(imenaB).toEqual(["pravilo B"]);
  });

  test("korisnik sa dva članstva radi u oba projekta, svaki sa svojim podacima", async () => {
    const s = await napraviSvet();
    await napraviPravilo(s, s.wsA, "pravilo A");
    await napraviPravilo(s, s.wsB, "pravilo B");
    const jovan = kao(s, s.jovan);
    expect((await jovan.query(upit, { workspaceId: s.wsA })).pravila).toEqual(["pravilo A"]);
    expect((await jovan.query(upit, { workspaceId: s.wsB })).pravila).toEqual(["pravilo B"]);
    const id: Id<"rules"> = await jovan.mutation(izmena, { workspaceId: s.wsB, ime: "novo u B" });
    const red = await s.t.run(async (ctx) => ctx.db.get(id));
    expect(red?.workspaceId).toBe(s.wsB);
  });

  test("client_viewer čita, ali ne menja i ne pokreće akcije", async () => {
    const s = await napraviSvet();
    const pregled = kao(s, s.viewer);
    const ws = { workspaceId: s.wsA };
    expect((await pregled.query(upit, ws)).projekat.uloga).toBe("client_viewer");
    await odbijeno(pregled.query(upitUrednik, ws), "forbidden", TREBA_UREDNIK);
    await odbijeno(pregled.mutation(izmena, { ...ws, ime: "x" }), "forbidden", TREBA_UREDNIK);
    await odbijeno(pregled.mutation(izmenaVlasnik, ws), "forbidden", TREBA_VLASNIK);
    await odbijeno(pregled.action(akcija, { ...ws, poruka: "x" }), "forbidden", TREBA_UREDNIK);
    await odbijeno(pregled.action(akcijaVlasnik, ws), "forbidden", TREBA_VLASNIK);
    const brojPravila = await s.t.run(async (ctx) => (await ctx.db.query("rules").collect()).length);
    expect(brojPravila).toBe(0);
    // Lični red pozivaoca je eksplicitno dozvoljen i posmatraču.
    expect(await pregled.mutation(licna, ws)).toBe("client_viewer");
  });

  test("urednik menja i pokreće akcije, ali ne ono što traži vlasnika", async () => {
    const s = await napraviSvet();
    const urednica = kao(s, s.urednica);
    const ws = { workspaceId: s.wsA };
    expect(await urednica.query(upitUrednik, ws)).toBe("urednik");
    await urednica.mutation(izmena, { ...ws, ime: "urednikovo" });
    const rez = await urednica.action(akcija, { ...ws, poruka: "zdravo" });
    expect(rez).toEqual({
      projekat: { userId: s.urednica, workspaceId: s.wsA, uloga: "urednik" },
      poruka: "zdravo",
      workspaceIdIzArgs: s.wsA,
    });
    await odbijeno(urednica.mutation(izmenaVlasnik, ws), "forbidden", TREBA_VLASNIK);
    await odbijeno(urednica.action(akcijaVlasnik, ws), "forbidden", TREBA_VLASNIK);
  });

  test("vlasnik projekta prolazi sve nivoe", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const ws = { workspaceId: s.wsA };
    expect(await ana.mutation(izmenaVlasnik, ws)).toBe("owner");
    expect(await ana.action(akcijaVlasnik, ws)).toBe("owner");
    expect(await ana.mutation(licna, ws)).toBe("owner");
  });

  test("prijavljen omotač ne traži projekat", async () => {
    const s = await napraviSvet();
    expect(await kao(s, s.stranac).query(prijavljen, {})).toBe(s.stranac);
    expect(await kao(s, s.viewer).mutation(prijavljenaIzmena, {})).toBe(s.viewer);
  });

  test("vlasnik platforme = owner internog projekta (P3)", async () => {
    const s = await napraviSvet();
    expect(await kao(s, s.ana).query(platforma, {})).toBe(s.ana);
    expect(await kao(s, s.jovan).mutation(platformaIzmena, {})).toBe(s.jovan);
    // owner samo klijentskog projekta, urednik i posmatrač nisu vlasnici platforme
    for (const userId of [s.klijent, s.urednica, s.viewer, s.stranac]) {
      await odbijeno(kao(s, userId).query(platforma, {}), "forbidden", /vlasnik platforme/);
      await odbijeno(kao(s, userId).mutation(platformaIzmena, {}), "forbidden", /vlasnik platforme/);
    }
  });
});
