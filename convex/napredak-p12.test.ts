/// <reference types="vite/client" />
/**
 * P12 (C16): napredak je jedan za korisnika preko svih projekata. XP, niz i
 * misije se izvode iz događaja SVIH projekata u kojima je korisnik član, a
 * nikad iz projekta u kome nije. Stari napredak po projektu se prenosi bez
 * gubitka (podešavanja, potvrde, misije prošlih dana; XP iz događaja).
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { danKljuc, dodajDane, lokalnoUEpohu } from "./lib/napredak";
import { kao, napraviSvet, type Svet } from "./projekatTest.pomoc";

const DODIR_XP = 10;
const POZOVI_XP = 60;

async function firma(s: Svet, ws: Id<"workspaces">, ime: string): Promise<Id<"leadCompanies">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("leadCompanies", {
      workspaceId: ws,
      name: ime,
      nameNormalized: ime.toLowerCase(),
      origin: "import",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

/** Poziv (dodir kanalom „poziv“) korisnika u projektu, u zadato vreme. */
async function poziv(
  s: Svet,
  ws: Id<"workspaces">,
  korisnik: Id<"users">,
  kad: number,
): Promise<void> {
  const companyId = await firma(s, ws, `Firma ${Math.random()}`);
  await s.t.run(async (ctx) => {
    await ctx.db.insert("leadStageEvents", {
      workspaceId: ws,
      companyId,
      kind: "dodir",
      toValue: "poziv",
      actorUserId: korisnik,
      occurredAt: kad,
    });
  });
}

function danas(): string {
  return danKljuc(Date.now());
}

/** Podne beogradskog dana — daleko od ponoći, da test ne zavisi od sata. */
function podne(dan: string): number {
  return lokalnoUEpohu(dan, 12);
}

async function ukupnoXp(s: Svet, korisnik: Id<"users">): Promise<number> {
  const st = await kao(s, korisnik).query(api.napredak.stanje, {});
  if (!st.ukljucen) throw new Error("napredak je isključen");
  return st.xp.ukupno;
}

describe("napredak preko projekata (P12)", () => {
  test("napredak sabira dva projekta", async () => {
    const s = await napraviSvet();
    const juce = dodajDane(danas(), -1);
    await poziv(s, s.wsA, s.jovan, podne(juce));
    await poziv(s, s.wsB, s.jovan, podne(juce));

    await kao(s, s.jovan).mutation(api.napredak.zamrzniDan, {});
    expect(await ukupnoXp(s, s.jovan)).toBe(2 * DODIR_XP);

    // Jedan lični red sidra, bez projekta.
    const redovi = await s.t.run(async (ctx) => ctx.db.query("napredakDan").collect());
    expect(redovi).toHaveLength(1);
    expect(redovi[0].workspaceId).toBeUndefined();
    expect(redovi[0].obim).toBe("korisnik");
    expect(redovi[0].dan).toBe(danas());
  });

  test("korisnik ne dobija XP iz projekta u kome nije član", async () => {
    const s = await napraviSvet();
    const juce = dodajDane(danas(), -1);
    await poziv(s, s.wsA, s.ana, podne(juce));
    // Događaj sa Aninim ID-jem u B (u kome nije član) se ne sme brojati.
    await poziv(s, s.wsB, s.ana, podne(juce));

    await kao(s, s.ana).mutation(api.napredak.zamrzniDan, {});
    expect(await ukupnoXp(s, s.ana)).toBe(DODIR_XP);

    // Ni Bobanov rad u B ne ulazi u Anin zbir, ni njen u njegov.
    await poziv(s, s.wsB, s.boban, podne(juce));
    await kao(s, s.boban).mutation(api.napredak.zamrzniDan, {});
    expect(await ukupnoXp(s, s.boban)).toBe(DODIR_XP);
    expect(await ukupnoXp(s, s.ana)).toBe(DODIR_XP);
  });

  test("posmatrač nema misija; misija nosi projekat iz čijeg je posla", async () => {
    const s = await napraviSvet();
    // ScanMe ima kanal za objavu, a nikad nije objavio → misija „Objavi“.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("connections", {
        workspaceId: s.wsB,
        provider: "meta_ig",
        encryptedCredentials: "x",
        status: "active",
      });
      await ctx.db.insert("connections", {
        workspaceId: s.wsA,
        provider: "meta_ig",
        encryptedCredentials: "x",
        status: "active",
      });
    });

    await kao(s, s.jovan).mutation(api.napredak.zamrzniDan, {});
    const st = await kao(s, s.jovan).query(api.napredak.stanje, {});
    if (!st.ukljucen) throw new Error("isključen");
    const objavi = st.misije.find((m) => m.kljuc === "objavi");
    expect(objavi).toBeDefined();
    expect(["enigma-it", "scanme"]).toContain(objavi?.projekat?.slug ?? "");
    // Jedna misija po oblasti, iako oba projekta imaju isti posao.
    expect(st.misije.filter((m) => m.kljuc === "objavi")).toHaveLength(1);

    // Posmatrač u A nema posla koji misija može da zada.
    await kao(s, s.viewer).mutation(api.napredak.zamrzniDan, {});
    const pregled = await kao(s, s.viewer).query(api.napredak.stanje, {});
    if (!pregled.ukljucen) throw new Error("isključen");
    expect(pregled.misije).toEqual([]);
  });

  test("prelazak: stari napredak po projektu se prenosi bez gubitka", async () => {
    const s = await napraviSvet();
    const dan = danas();
    const juce = dodajDane(dan, -1);
    // Stanje pre C16: red sidra u A od juče sa misijom „pozovi 1“, lična
    // podešavanja i viđene proslave — sve vezano za projekat A.
    await s.t.run(async (ctx) => {
      await ctx.db.insert("napredakDan", {
        workspaceId: s.wsA,
        userId: s.jovan,
        dan: juce,
        misije: [{ kljuc: "pozovi", cilj: 1, xp: POZOVI_XP, oblast: "pozivi", veza: "/leadovi" }],
        zamrznutoAt: podne(juce),
        prvi: true,
      });
      await ctx.db.insert("napredakPodesavanja", {
        workspaceId: s.wsA,
        userId: s.jovan,
        ukljucen: true,
        vikendNePrekida: false,
        ciljPozivi: 40,
        updatedAt: 1,
      });
      await ctx.db.insert("napredakPotvrde", {
        workspaceId: s.wsA,
        userId: s.jovan,
        opseg: "trajno",
        kljuc: "nivo",
        vrednost: 3,
        potvrdjenoAt: 1,
      });
      await ctx.db.insert("napredakPotvrde", {
        workspaceId: s.wsA,
        userId: s.jovan,
        opseg: "trajno",
        kljuc: "dostignuce:prvi_poziv",
        potvrdjenoAt: 1,
      });
    });
    await poziv(s, s.wsA, s.jovan, podne(juce));

    // Pre prelaska upit već vidi stara podešavanja (isti red koji se prenosi).
    const pre = await kao(s, s.jovan).query(api.napredak.stanje, {});
    expect(pre.podesavanja.ciljPozivi).toBe(40);

    const prvi = await kao(s, s.jovan).mutation(api.napredak.zamrzniDan, {});
    expect(prvi.novo).toBe(true);
    const drugi = await kao(s, s.jovan).mutation(api.napredak.zamrzniDan, {});
    expect(drugi.novo).toBe(false);

    // XP jučerašnjeg dana: poziv + završena prenesena misija, kao i pre C16.
    expect(await ukupnoXp(s, s.jovan)).toBe(DODIR_XP + POZOVI_XP);

    const st = await kao(s, s.jovan).query(api.napredak.stanje, {});
    expect(st.podesavanja).toMatchObject({ ciljPozivi: 40, vikendNePrekida: false });

    const { licni, stari } = await s.t.run(async (ctx) => {
      const potvrde = await ctx.db.query("napredakPotvrde").collect();
      const dani = await ctx.db.query("napredakDan").collect();
      const podesavanja = await ctx.db.query("napredakPodesavanja").collect();
      return {
        licni: {
          potvrde: potvrde.filter((r) => r.obim === "korisnik"),
          dani: dani.filter((r) => r.obim === "korisnik"),
          podesavanja: podesavanja.filter((r) => r.obim === "korisnik"),
        },
        stari: {
          potvrde: potvrde.filter((r) => r.workspaceId === s.wsA).length,
          dani: dani.filter((r) => r.workspaceId === s.wsA).length,
          podesavanja: podesavanja.filter((r) => r.workspaceId === s.wsA).length,
        },
      };
    });
    // Stari redovi su netaknuti.
    expect(stari).toEqual({ potvrde: 2, dani: 1, podesavanja: 1 });
    // Potvrde prenete: nivo 3 i dostignuće se ne slave ponovo.
    expect(licni.potvrde.map((p) => [p.kljuc, p.vrednost ?? null]).sort()).toEqual(
      [
        ["dostignuce:prvi_poziv", null],
        ["nivo", 3],
      ].sort(),
    );
    expect(licni.podesavanja).toHaveLength(1);
    // Jučerašnji dan sa misijom je prenet, a današnje sidro nosi zbir.
    const jucerasnji = licni.dani.find((d) => d.dan === juce);
    expect(jucerasnji?.misije?.map((m) => m.kljuc)).toEqual(["pozovi"]);
    const sidro = licni.dani.find((d) => d.dan === dan);
    expect(sidro?.osnova).toBeDefined();
    expect(sidro?.prvi).toBe(false);
  });

  test("podešavanje pre prvog dana ne briše stare ciljeve", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("napredakPodesavanja", {
        workspaceId: s.wsB,
        userId: s.jovan,
        ciljPozivi: 50,
        ciljSastanci: 7,
        updatedAt: 5,
      });
    });
    const posle = await kao(s, s.jovan).mutation(api.napredak.podesi, { ciljObjave: 4 });
    expect(posle).toMatchObject({ ciljPozivi: 50, ciljSastanci: 7, ciljObjave: 4 });
  });
});
