/// <reference types="vite/client" />
/**
 * API projekata (`convex/projekti.ts`, plan C02 §3): spisak i izbor
 * projekta, razrešavanje domena, novi projekat (P8) i osnovni podaci.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { kao, napraviSvet, odbijeno } from "./projekatTest.pomoc";

describe("mojiProjekti", () => {
  test("vraća samo moje projekte, redom članstva", async () => {
    const s = await napraviSvet();
    const jovanovi = await kao(s, s.jovan).query(api.projekti.mojiProjekti, {});
    expect(jovanovi.map((p) => [p.slug, p.uloga, p.vrsta])).toEqual([
      ["enigma-it", "owner", "interni"],
      ["scanme", "owner", "interni"],
    ]);
    expect((await kao(s, s.ana).query(api.projekti.mojiProjekti, {})).map((p) => p.slug)).toEqual([
      "enigma-it",
    ]);
    const klijentovi = await kao(s, s.klijent).query(api.projekti.mojiProjekti, {});
    expect(klijentovi.map((p) => [p.slug, p.vrsta])).toEqual([["klijent-doo", "klijent"]]);
    expect(await kao(s, s.stranac).query(api.projekti.mojiProjekti, {})).toEqual([]);
    await odbijeno(s.t.query(api.projekti.mojiProjekti, {}), "unauthorized");
  });
});

describe("mojProjekat", () => {
  test("član dobija projekat; tuđ i nepostojeći slug daju isto: null", async () => {
    const s = await napraviSvet();
    const enigma = await kao(s, s.ana).query(api.projekti.mojProjekat, { slug: "enigma-it" });
    expect(enigma).toMatchObject({
      workspaceId: s.wsA,
      slug: "enigma-it",
      ime: "Enigma IT",
      uloga: "owner",
      vrsta: "interni",
      moduli: null,
      platformaVlasnik: true,
      korisnik: { id: s.ana, email: "ana@enigma.test" },
    });
    expect(await kao(s, s.ana).query(api.projekti.mojProjekat, { slug: "scanme" })).toBeNull();
    expect(await kao(s, s.ana).query(api.projekti.mojProjekat, { slug: "nepostoji" })).toBeNull();
    expect(
      (await kao(s, s.urednica).query(api.projekti.mojProjekat, { slug: "enigma-it" }))?.uloga,
    ).toBe("urednik");
    expect(
      (await kao(s, s.klijent).query(api.projekti.mojProjekat, { slug: "klijent-doo" }))
        ?.platformaVlasnik,
    ).toBe(false);
    await odbijeno(s.t.query(api.projekti.mojProjekat, { slug: "enigma-it" }), "unauthorized");
  });

  test("dupli slug iz istorije: svako dobija red u kome je član", async () => {
    const s = await napraviSvet();
    const duplikat = await s.t.run(async (ctx) => {
      const ws = await ctx.db.insert("workspaces", { name: "ScanMe (duplikat)", slug: "scanme" });
      await ctx.db.insert("members", { workspaceId: ws, userId: s.ana, role: "owner" });
      return ws;
    });
    expect(
      (await kao(s, s.ana).query(api.projekti.mojProjekat, { slug: "scanme" }))?.workspaceId,
    ).toBe(duplikat);
    expect(
      (await kao(s, s.boban).query(api.projekti.mojProjekat, { slug: "scanme" }))?.workspaceId,
    ).toBe(s.wsB);
  });
});

describe("ja", () => {
  test("korisnik bez projekta i oznaka vlasnika platforme", async () => {
    const s = await napraviSvet();
    expect(await kao(s, s.jovan).query(api.projekti.ja, {})).toEqual({
      id: s.jovan,
      email: "jovan@enigma.test",
      ime: null,
      platformaVlasnik: true,
    });
    expect((await kao(s, s.stranac).query(api.projekti.ja, {})).platformaVlasnik).toBe(false);
  });
});

describe("razresiDomen", () => {
  test("radi bez prijave i normalizuje host", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("projekatDomeni", {
        host: "digital.enigmait.rs",
        workspaceId: s.wsA,
        createdAt: 0,
      });
    });
    const razresi = (host: string) => s.t.query(api.projekti.razresiDomen, { host });
    expect(await razresi("digital.enigmait.rs")).toEqual({ slug: "enigma-it" });
    expect(await razresi("Digital.EnigmaIT.rs:443")).toEqual({ slug: "enigma-it" });
    expect(await razresi("digital.enigmait.rs.")).toEqual({ slug: "enigma-it" });
    expect(await razresi("nepoznat.rs")).toBeNull();
    expect(await razresi("")).toBeNull();
    expect(await razresi("[::1]:3000")).toBeNull();
    expect(await razresi("loš host.rs")).toBeNull();
  });

  test("arhiviran projekat nije panel", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("projekatDomeni", { host: "digital.scanme.rs", workspaceId: s.wsB, createdAt: 0 });
      await ctx.db.patch(s.wsB, { arhiviran: true });
    });
    expect(await s.t.query(api.projekti.razresiDomen, { host: "digital.scanme.rs" })).toBeNull();
  });
});

describe("kreirajProjekat", () => {
  test("vlasnik platforme pravi projekat i postaje njegov owner", async () => {
    const s = await napraviSvet();
    const jovan = kao(s, s.jovan);
    const rez = await jovan.mutation(api.projekti.kreirajProjekat, {
      ime: "  Novi Projekat ",
      slug: " Novi-Projekat ",
    });
    expect(rez.slug).toBe("novi-projekat");
    const red = await s.t.run(async (ctx) => ctx.db.get(rez.workspaceId));
    expect(red).toMatchObject({
      name: "Novi Projekat",
      slug: "novi-projekat",
      vrsta: "interni",
      createdBy: s.jovan,
      redosled: 2,
    });
    const projekat = await jovan.query(api.projekti.mojProjekat, { slug: "novi-projekat" });
    expect(projekat?.uloga).toBe("owner");
    // Niko drugi ne postaje član.
    expect(await kao(s, s.ana).query(api.projekti.mojProjekat, { slug: "novi-projekat" })).toBeNull();
  });

  test("odbija rezervisan, neispravan i zauzet slug", async () => {
    const s = await napraviSvet();
    const jovan = kao(s, s.jovan);
    const napravi = (slug: string) =>
      jovan.mutation(api.projekti.kreirajProjekat, { ime: "Probni projekat", slug });
    for (const slug of ["leadovi", "settings", "login", "api", "novi", "dev-ux", "svi", "_next"]) {
      await odbijeno(napravi(slug), "invalid", slug === "_next" ? /mala slova/ : /rezervisana/);
    }
    // „r“ (kratki linkovi) je rezervisan, ali pada već na dužini.
    await odbijeno(napravi("r"), "invalid");
    for (const slug of ["a", "-pocetak", "kraj-", "dve--crte", "razmak u imenu", "ćirilica", "a_b"]) {
      await odbijeno(napravi(slug), "invalid", /mala slova/);
    }
    await odbijeno(napravi("scanme"), "conflict", /zauzeta/);
    await odbijeno(
      jovan.mutation(api.projekti.kreirajProjekat, { ime: "X", slug: "kratko-ime" }),
      "invalid",
      /od 2 do 60/,
    );
    const broj = await s.t.run(async (ctx) => (await ctx.db.query("workspaces").collect()).length);
    expect(broj).toBe(3);
  });

  test("samo vlasnik platforme", async () => {
    const s = await napraviSvet();
    const arg = { ime: "Tuđi projekat", slug: "tudji" };
    for (const userId of [s.klijent, s.urednica, s.viewer, s.stranac]) {
      await odbijeno(kao(s, userId).mutation(api.projekti.kreirajProjekat, arg), "forbidden");
    }
    await odbijeno(s.t.mutation(api.projekti.kreirajProjekat, arg), "unauthorized");
  });
});

describe("azurirajProjekat", () => {
  test("vlasnik menja ime, kratko ime i boju; slug ostaje", async () => {
    const s = await napraviSvet();
    const ana = kao(s, s.ana);
    await ana.mutation(api.projekti.azurirajProjekat, {
      workspaceId: s.wsA,
      ime: "Enigma IT d.o.o.",
      kratkoIme: "Enigma",
      boja: "#22C55E",
    });
    let red = await s.t.run(async (ctx) => ctx.db.get(s.wsA));
    expect(red).toMatchObject({
      name: "Enigma IT d.o.o.",
      slug: "enigma-it",
      brend: { kratkoIme: "Enigma", boja: "#22c55e" },
    });
    await ana.mutation(api.projekti.azurirajProjekat, { workspaceId: s.wsA, kratkoIme: null });
    red = await s.t.run(async (ctx) => ctx.db.get(s.wsA));
    expect(red?.brend).toEqual({ boja: "#22c55e" });
    await odbijeno(
      ana.mutation(api.projekti.azurirajProjekat, { workspaceId: s.wsA, boja: "zeleno" }),
      "invalid",
      /#rrggbb/,
    );
  });

  test("urednik, posmatrač i nečlan ne menjaju projekat", async () => {
    const s = await napraviSvet();
    const arg = { workspaceId: s.wsA, ime: "Preotet" };
    await odbijeno(kao(s, s.urednica).mutation(api.projekti.azurirajProjekat, arg), "forbidden");
    await odbijeno(kao(s, s.viewer).mutation(api.projekti.azurirajProjekat, arg), "forbidden");
    await odbijeno(kao(s, s.boban).mutation(api.projekti.azurirajProjekat, arg), "forbidden");
    expect((await s.t.run(async (ctx) => ctx.db.get(s.wsA)))?.name).toBe("Enigma IT");
  });

  test("vrstu menja samo vlasnik platforme (P3 ne sme da se zaobiđe)", async () => {
    const s = await napraviSvet();
    await odbijeno(
      kao(s, s.klijent).mutation(api.projekti.azurirajProjekat, {
        workspaceId: s.wsK,
        vrsta: "interni",
      }),
      "forbidden",
      /vlasnik platforme/,
    );
    expect((await s.t.run(async (ctx) => ctx.db.get(s.wsK)))?.vrsta).toBe("klijent");
    expect((await kao(s, s.klijent).query(api.projekti.ja, {})).platformaVlasnik).toBe(false);

    await kao(s, s.jovan).mutation(api.projekti.azurirajProjekat, {
      workspaceId: s.wsB,
      vrsta: "klijent",
    });
    expect((await s.t.run(async (ctx) => ctx.db.get(s.wsB)))?.vrsta).toBe("klijent");
  });
});

describe("stanjeProjekata (birač projekta)", () => {
  const SAT = 60 * 60 * 1000;

  test("samo moji projekti, redom članstva; broj je isti kao u zvonu", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const jovan = await kao(s, s.jovan).query(api.projekti.stanjeProjekata, { sada });
    expect(jovan.map((p) => p.workspaceId)).toEqual([s.wsA, s.wsB]);
    expect(jovan.map((p) => p.zdravlje)).toEqual(["bez_veza", "bez_veza"]);
    for (const p of jovan) {
      const zvono = await kao(s, s.jovan).query(api.notificationsStore.staMeCeka, {
        workspaceId: p.workspaceId,
      });
      expect(p.ceka).toBe(zvono.ukupno);
    }
    expect(
      (await kao(s, s.ana).query(api.projekti.stanjeProjekata, { sada })).map((p) => p.workspaceId),
    ).toEqual([s.wsA]);
    expect(
      (await kao(s, s.klijent).query(api.projekti.stanjeProjekata, { sada })).map((p) => p.workspaceId),
    ).toEqual([s.wsK]);
    expect(await kao(s, s.stranac).query(api.projekti.stanjeProjekata, { sada })).toEqual([]);
    await odbijeno(s.t.query(api.projekti.stanjeProjekata, { sada }), "unauthorized");
  });

  test("pravila zdravlja po projektu: najgora veza pobeđuje, veza u prekidu se ne broji", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      const veza = (
        workspaceId: typeof s.wsA,
        provider: "ga4" | "meta_ig" | "youtube",
        polja: { status: "active" | "error" | "expired" | "disconnecting"; expiresAt?: number; lastSyncAt?: number },
      ) => ctx.db.insert("connections", { workspaceId, provider, encryptedCredentials: "x", ...polja });
      // A: jedna zdrava veza sa svežim prolazom, jedna u grešci.
      await veza(s.wsA, "ga4", { status: "active", lastSyncAt: sada - SAT });
      await ctx.db.insert("syncRuns", {
        workspaceId: s.wsA,
        provider: "ga4",
        startedAt: sada - SAT - 1000,
        finishedAt: sada - SAT,
        status: "ok",
        itemsWritten: 3,
      });
      await veza(s.wsA, "meta_ig", { status: "error" });
      // B: token ističe za 3 dana, a jedna veza je u prekidu.
      await veza(s.wsB, "youtube", { status: "active", expiresAt: sada + 3 * 24 * SAT });
      await veza(s.wsB, "ga4", { status: "disconnecting" });
      // K: samo veza u prekidu.
      await veza(s.wsK, "ga4", { status: "disconnecting" });
    });

    const jovan = await kao(s, s.jovan).query(api.projekti.stanjeProjekata, { sada });
    expect(jovan.map((p) => [p.workspaceId, p.zdravlje])).toEqual([
      [s.wsA, "greska"],
      [s.wsB, "upozorenje"],
    ]);
    const klijent = await kao(s, s.klijent).query(api.projekti.stanjeProjekata, { sada });
    expect(klijent[0]?.zdravlje).toBe("bez_veza");
    // Integracija u grešci je i zadatak u zvonu: broj prati isto pravilo.
    const zvonoA = await kao(s, s.jovan).query(api.notificationsStore.staMeCeka, {
      workspaceId: s.wsA,
    });
    expect(jovan[0]?.ceka).toBe(zvonoA.ukupno);
    expect(zvonoA.ukupno).toBeGreaterThan(0);
  });

  test("preko 20 projekata: stanje za prvih 20, broj se ne računa (null)", async () => {
    const s = await napraviSvet();
    const korisnik = await s.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "mnogo@enigma.test" });
      for (let i = 0; i < 21; i++) {
        const ws = await ctx.db.insert("workspaces", { name: `Projekat ${i}`, slug: `projekat-${i}` });
        await ctx.db.insert("members", { workspaceId: ws, userId, role: "owner" });
      }
      return userId;
    });
    const stanja = await kao(s, korisnik).query(api.projekti.stanjeProjekata, { sada: Date.now() });
    expect(stanja).toHaveLength(20);
    expect(stanja.every((p) => p.ceka === null)).toBe(true);
    expect(stanja.every((p) => p.zdravlje === "bez_veza")).toBe(true);

    // Sa tačno 20 broj se računa.
    const dvadeset = await s.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "dvadeset@enigma.test" });
      for (let i = 0; i < 20; i++) {
        const ws = await ctx.db.insert("workspaces", { name: `Drugi ${i}`, slug: `drugi-${i}` });
        await ctx.db.insert("members", { workspaceId: ws, userId, role: "owner" });
      }
      return userId;
    });
    const sa20 = await kao(s, dvadeset).query(api.projekti.stanjeProjekata, { sada: Date.now() });
    expect(sa20).toHaveLength(20);
    expect(sa20.every((p) => typeof p.ceka === "number")).toBe(true);
  });

  test("projekat koji prekorači svoj deo budžeta čitanja dobija „—“ (null), ostali broj", async () => {
    // Sa 20 projekata svaki ima 24.000 / 20 = 1.200 dokumenata za „šta me
    // čeka“; zvono čita do 1.500 telefona, pa ih veliki projekat ima 1.300.
    const s = await napraviSvet();
    const { korisnik, veliki } = await s.t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "budzet@enigma.test" });
      const prostori = [];
      for (let i = 0; i < 20; i++) {
        const ws = await ctx.db.insert("workspaces", { name: `Budžet ${i}`, slug: `budzet-${i}` });
        await ctx.db.insert("members", { workspaceId: ws, userId, role: "owner" });
        prostori.push(ws);
      }
      const ws = prostori[0];
      const firma = await ctx.db.insert("leadCompanies", {
        workspaceId: ws,
        createdAt: 1,
        updatedAt: 1,
        name: "Velika firma",
        nameNormalized: "velika firma",
        origin: "import",
      });
      for (let i = 0; i < 1300; i++) {
        await ctx.db.insert("leadIdentities", {
          workspaceId: ws,
          companyId: firma,
          kind: "phone",
          value: `+3816000${String(i).padStart(5, "0")}`,
          lawfulBasis: "test",
          sourceUrl: "https://example.test",
        });
      }
      return { korisnik: userId, veliki: ws };
    });
    const stanja = await kao(s, korisnik).query(api.projekti.stanjeProjekata, { sada: Date.now() });
    expect(stanja).toHaveLength(20);
    expect(stanja.find((p) => p.workspaceId === veliki)?.ceka).toBeNull();
    expect(
      stanja.filter((p) => p.workspaceId !== veliki).every((p) => typeof p.ceka === "number"),
    ).toBe(true);
  });
});
