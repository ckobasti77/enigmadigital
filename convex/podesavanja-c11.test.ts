/// <reference types="vite/client" />
/**
 * Podešavanja projekta (`convex/podesavanjaStore.ts` i
 * `projekti.azurirajProjekat`, plan C10 §1): menja samo vlasnik projekta,
 * domene samo vlasnik platforme, vrstu samo vlasnik platforme (D7), a slika
 * brenda mora biti nova, ispravna i ničija (E12).
 */
import { afterEach, describe, expect, test, vi } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

afterEach(() => {
  vi.useRealTimers();
});

async function slika(s: Svet, tip: string, bajtova = 2000): Promise<Id<"_storage">> {
  return await s.t.run(async (ctx) =>
    ctx.storage.store(new Blob([new Uint8Array(bajtova)], { type: tip })),
  );
}

const projekat = (s: Svet, wsId: Id<"workspaces">) =>
  s.t.run(async (ctx) => await ctx.db.get(wsId));

describe("prava po ulogama", () => {
  test("vlasnik menja; urednik i posmatrač ne menjaju ništa", async () => {
    const s = await napraviSvet();
    const pre = await projekat(s, s.wsA);
    for (const ko of [s.urednica, s.viewer]) {
      const k = kao(s, ko);
      const ws = { workspaceId: s.wsA };
      await odbijeno(k.mutation(api.projekti.azurirajProjekat, { ...ws, ime: "Novo ime" }), "forbidden");
      await odbijeno(k.mutation(api.podesavanjaStore.sacuvajSajtove, { ...ws, sajtovi: ["x.rs"] }), "forbidden");
      await odbijeno(k.mutation(api.podesavanjaStore.sacuvajModule, { ...ws, moduli: ["leadovi"] }), "forbidden");
      await odbijeno(k.mutation(api.podesavanjaStore.sacuvajMozak, { ...ws, ponuda: "x" }), "forbidden");
      await odbijeno(k.mutation(api.podesavanjaStore.uploadUrlBrenda, ws), "forbidden");
      await odbijeno(
        k.mutation(api.podesavanjaStore.postaviSlikuBrenda, { ...ws, vrsta: "logo", storageId: null }),
        "forbidden",
      );
      await odbijeno(k.mutation(api.podesavanjaStore.dodajDomen, { ...ws, host: "panel.primer.rs" }), "forbidden");
      await odbijeno(k.query(api.podesavanjaStore.procitaj, ws), "forbidden");
    }
    expect(await projekat(s, s.wsA)).toEqual(pre);
  });

  test("urednik i posmatrač čitaju mozak; nečlan ne čita ni ne menja", async () => {
    const s = await napraviSvet();
    await kao(s, s.ana).mutation(api.podesavanjaStore.sacuvajMozak, {
      workspaceId: s.wsA,
      ponuda: "Sajt za 10 dana",
    });
    for (const ko of [s.urednica, s.viewer]) {
      expect(
        (await kao(s, ko).query(api.podesavanjaStore.mozak, { workspaceId: s.wsA })).ponuda,
      ).toBe("Sajt za 10 dana");
    }
    await odbijeno(kao(s, s.boban).query(api.podesavanjaStore.mozak, { workspaceId: s.wsA }), "forbidden");
    await odbijeno(
      kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajSajtove, { workspaceId: s.wsA, sajtovi: [] }),
      "forbidden",
    );
    await odbijeno(s.t.query(api.podesavanjaStore.mozak, { workspaceId: s.wsA }), "unauthorized");
  });

  test("vlasnik A ne menja B", async () => {
    const s = await napraviSvet();
    await odbijeno(
      kao(s, s.ana).mutation(api.podesavanjaStore.sacuvajModule, { workspaceId: s.wsB, moduli: [] }),
      "forbidden",
    );
    expect((await projekat(s, s.wsB))?.moduli).toBeUndefined();
  });
});

describe("sajtovi, moduli, mozak", () => {
  test("upisuje se normalizovano; prazno briše", async () => {
    const s = await napraviSvet();
    const k = kao(s, s.ana);
    const ws = { workspaceId: s.wsA };
    await k.mutation(api.podesavanjaStore.sacuvajSajtove, {
      ...ws,
      sajtovi: ["WWW.EnigmaIT.rs", "enigmait.rs", "digital.enigmait.rs"],
    });
    expect((await projekat(s, s.wsA))?.sajtovi).toEqual(["enigmait.rs", "digital.enigmait.rs"]);
    expect((await k.query(api.projekti.mojProjekat, { slug: "enigma-it" }))?.sajtovi).toEqual([
      "enigmait.rs",
      "digital.enigmait.rs",
    ]);
    await odbijeno(
      k.mutation(api.podesavanjaStore.sacuvajSajtove, { ...ws, sajtovi: ["https://x.rs"] }),
      "invalid",
    );
    await k.mutation(api.podesavanjaStore.sacuvajSajtove, { ...ws, sajtovi: [] });
    expect((await projekat(s, s.wsA))?.sajtovi).toBeUndefined();

    await k.mutation(api.podesavanjaStore.sacuvajModule, { ...ws, moduli: ["analitika", "leadovi"] });
    expect((await projekat(s, s.wsA))?.moduli).toEqual(["leadovi", "analitika"]);
    await odbijeno(k.mutation(api.podesavanjaStore.sacuvajModule, { ...ws, moduli: ["tabla"] }), "invalid");
    await k.mutation(api.podesavanjaStore.sacuvajModule, { ...ws, moduli: null });
    expect((await projekat(s, s.wsA))?.moduli).toBeUndefined();

    await k.mutation(api.podesavanjaStore.sacuvajMozak, { ...ws, ponuda: " Ponuda ", ton: "Kratko" });
    await k.mutation(api.podesavanjaStore.sacuvajMozak, { ...ws, ton: null });
    expect((await projekat(s, s.wsA))?.mozak).toEqual({ ponuda: "Ponuda" });
    await odbijeno(
      k.mutation(api.podesavanjaStore.sacuvajMozak, { ...ws, skripte: "x".repeat(4001) }),
      "invalid",
    );
    await k.mutation(api.podesavanjaStore.sacuvajMozak, { ...ws, ponuda: "" });
    expect((await projekat(s, s.wsA))?.mozak).toBeUndefined();
  });

  test("procitaj vraća sajtove, module, mozak i domene vlasniku", async () => {
    const s = await napraviSvet();
    const odgovor = await kao(s, s.ana).query(api.podesavanjaStore.procitaj, { workspaceId: s.wsA });
    expect(odgovor).toEqual({
      sajtovi: [],
      moduli: null,
      mozak: { ponuda: null, icpOpis: null, ton: null, zabrane: null, skripte: null },
      domeni: [],
    });
  });
});

describe("vrsta projekta (D7)", () => {
  test("vlasnik projekta koji nije vlasnik platforme ne menja vrstu", async () => {
    const s = await napraviSvet();
    await odbijeno(
      kao(s, s.klijent).mutation(api.projekti.azurirajProjekat, { workspaceId: s.wsK, vrsta: "interni" }),
      "forbidden",
    );
    expect((await projekat(s, s.wsK))?.vrsta).toBe("klijent");
    // Ostala polja vlasnik klijentskog projekta i dalje menja.
    await kao(s, s.klijent).mutation(api.projekti.azurirajProjekat, {
      workspaceId: s.wsK,
      kratkoIme: "Klijent",
      boja: "#A78BFA",
    });
    expect((await projekat(s, s.wsK))?.brend).toEqual({ kratkoIme: "Klijent", boja: "#a78bfa" });
  });
});

describe("domeni panela", () => {
  test("samo vlasnik platforme; host je jedinstven u celoj bazi", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    await ana.mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsA, host: "Digital.EnigmaIT.rs" });
    const domeni = (await ana.query(api.podesavanjaStore.procitaj, { workspaceId: s.wsA })).domeni;
    expect(domeni.map((d) => [d.host, d.primarni])).toEqual([["digital.enigmait.rs", true]]);
    expect(await s.t.query(api.projekti.razresiDomen, { host: "digital.enigmait.rs" })).toEqual({
      slug: "enigma-it",
    });

    await odbijeno(
      ana.mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsA, host: "digital.enigmait.rs" }),
      "conflict",
      /već dodat/,
    );
    await odbijeno(
      kao(s, s.boban).mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsB, host: "digital.enigmait.rs" }),
      "conflict",
      /drugom projektu/,
    );
    await odbijeno(
      ana.mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsA, host: "https://x.rs" }),
      "invalid",
    );
    // Vlasnik klijentskog projekta nije vlasnik platforme.
    await odbijeno(
      kao(s, s.klijent).mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsK, host: "panel.klijent.rs" }),
      "forbidden",
      /vlasnik platforme/,
    );
    // Tuđ domen se ne uklanja kroz svoj projekat.
    await odbijeno(
      kao(s, s.boban).mutation(api.podesavanjaStore.ukloniDomen, { workspaceId: s.wsB, domenId: domeni[0].domenId }),
      "not_found",
    );
    await ana.mutation(api.podesavanjaStore.ukloniDomen, { workspaceId: s.wsA, domenId: domeni[0].domenId });
    expect(await s.t.query(api.projekti.razresiDomen, { host: "digital.enigmait.rs" })).toBeNull();
  });

  test("najviše 5 domena po projektu", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    for (let i = 0; i < 5; i++) {
      await ana.mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsA, host: `p${i}.enigmait.rs` });
    }
    await odbijeno(
      ana.mutation(api.podesavanjaStore.dodajDomen, { workspaceId: s.wsA, host: "p5.enigmait.rs" }),
      "invalid",
      /najviše 5/,
    );
  });
});

describe("slika brenda (E12)", () => {
  test("logo se postavlja, zamena briše stari fajl, null uklanja", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const prvi = await slika(s, "image/png");
    await ana.mutation(api.podesavanjaStore.postaviSlikuBrenda, { workspaceId: s.wsA, vrsta: "logo", storageId: prvi });
    expect((await projekat(s, s.wsA))?.brend?.logoStorageId).toBe(prvi);
    const p = await ana.query(api.projekti.mojProjekat, { slug: "enigma-it" });
    expect(p?.logoUrl).toMatch(/^https:\/\//);

    const drugi = await slika(s, "image/webp", 3000);
    await ana.mutation(api.podesavanjaStore.postaviSlikuBrenda, { workspaceId: s.wsA, vrsta: "logo", storageId: drugi });
    expect(await s.t.run(async (ctx) => await ctx.db.system.get("_storage", prvi))).toBeNull();

    await ana.mutation(api.podesavanjaStore.postaviSlikuBrenda, { workspaceId: s.wsA, vrsta: "logo", storageId: null });
    expect((await projekat(s, s.wsA))?.brend?.logoStorageId).toBeUndefined();
    expect(await s.t.run(async (ctx) => await ctx.db.system.get("_storage", drugi))).toBeNull();
  });

  test("pogrešan tip ili veličina se odbija i fajl ostaje (možda nije naš)", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    const svg = await slika(s, "image/svg+xml");
    await odbijeno(
      ana.mutation(api.podesavanjaStore.postaviSlikuBrenda, { workspaceId: s.wsA, vrsta: "logo", storageId: svg }),
      "invalid",
      /PNG, JPG ili WebP/,
    );
    const velikaIkonica = await slika(s, "image/png", 128 * 1024 + 1);
    await odbijeno(
      ana.mutation(api.podesavanjaStore.postaviSlikuBrenda, {
        workspaceId: s.wsA,
        vrsta: "favicon",
        storageId: velikaIkonica,
      }),
      "invalid",
      /128 KB/,
    );
    expect(await s.t.run(async (ctx) => await ctx.db.system.get("_storage", svg))).not.toBeNull();
    expect((await projekat(s, s.wsA))?.brend).toBeUndefined();
  });

  test("star fajl i fajl tuđeg brenda se odbijaju", async () => {
    // Samo sat: convex-test sam koristi tajmere.
    vi.useFakeTimers({ toFake: ["Date"] });
    const s = await napraviSvet();
    const star = await slika(s, "image/png");
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    await odbijeno(
      kao(s, s.ana).mutation(api.podesavanjaStore.postaviSlikuBrenda, {
        workspaceId: s.wsA,
        vrsta: "logo",
        storageId: star,
      }),
      "invalid",
      /isteklo/,
    );

    const bobanov = await slika(s, "image/png");
    await kao(s, s.boban).mutation(api.podesavanjaStore.postaviSlikuBrenda, {
      workspaceId: s.wsB,
      vrsta: "logo",
      storageId: bobanov,
    });
    // Ana zna ID Bobanovog loga: ne može da ga uzme (pa zamenom obriše).
    await odbijeno(
      kao(s, s.ana).mutation(api.podesavanjaStore.postaviSlikuBrenda, {
        workspaceId: s.wsA,
        vrsta: "logo",
        storageId: bobanov,
      }),
      "invalid",
      /već u upotrebi/,
    );
    // Ni sopstveni logo ne može da bude i ikonica (zamena jednog bi obrisala drugi).
    await odbijeno(
      kao(s, s.boban).mutation(api.podesavanjaStore.postaviSlikuBrenda, {
        workspaceId: s.wsB,
        vrsta: "favicon",
        storageId: bobanov,
      }),
      "invalid",
      /već u upotrebi/,
    );
    expect((await projekat(s, s.wsB))?.brend?.logoStorageId).toBe(bobanov);
  });
});
