/// <reference types="vite/client" />
/**
 * Tajne projekta (`projekatTajne`, `podesavanjaStore.postaviTajnu` i
 * `obrisiTajnu`): vrednost se šifruje pre upisa, nijedna javna funkcija ne
 * vraća ni tekst ni šifrat (samo „postavljeno: da/ne“), šifrat čita samo
 * interni `tajnaZaAkciju`, a osnivački projekat bez svoje tajne nasleđuje env.
 * Ključ za šifrovanje ovde je lažan (nije prava tajna).
 */
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { decryptCredentials } from "./lib/crypto";
import { procitajTajnu } from "./lib/podesavanjaAkcija";
import type { KljucTajne } from "./lib/podesavanjaPravila";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const KLJUC_ZA_SIFROVANJE = "ab".repeat(32);
/** 30 znakova, bez razmaka (važi za `meta_capi_token`: 20–512). */
const TAJNA = "EAATESTtajnaVrednost1234567890";
const ENV_TOKEN = "env-capi-token-1234567890abcdef";

beforeEach(() => {
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", KLJUC_ZA_SIFROVANJE);
  vi.stubEnv("META_CAPI_TOKEN", undefined);
  vi.stubEnv("NOVOSTI_REVALIDATE_SECRET", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const redovi = (s: Svet) => s.t.run(async (ctx) => await ctx.db.query("projekatTajne").collect());

const postavi = (
  s: Svet,
  ko: Id<"users">,
  workspaceId: Id<"workspaces">,
  vrednost: string,
  kljuc: KljucTajne = "meta_capi_token",
) => kao(s, ko).mutation(api.podesavanjaStore.postaviTajnu, { workspaceId, kljuc, vrednost });

const obrisi = (
  s: Svet,
  ko: Id<"users">,
  workspaceId: Id<"workspaces">,
  kljuc: KljucTajne = "meta_capi_token",
) => kao(s, ko).mutation(api.podesavanjaStore.obrisiTajnu, { workspaceId, kljuc });

const stanje = async (
  s: Svet,
  workspaceId: Id<"workspaces">,
  kljuc: KljucTajne = "meta_capi_token",
) => (await kao(s, s.jovan).query(api.podesavanjaStore.procitaj, { workspaceId })).tajne[kljuc];

/** Šta je pozivalac mogao da vidi iz greške: kod i sav tekst (poruka + podaci). */
async function ishod(poziv: Promise<unknown>): Promise<{ kod?: string; tekst: string } | null> {
  try {
    await poziv;
    return null;
  } catch (e) {
    const data = (e as { data?: { code?: string } }).data;
    return {
      kod: data?.code,
      tekst: `${e instanceof Error ? e.message : String(e)} ${JSON.stringify(data ?? null)}`,
    };
  }
}

/**
 * `ctx` akcije koji `procitajTajnu` koristi: samo `runQuery` (samo za
 * `tajnaZaAkciju`, jedini upit koji ta funkcija zove), nad istom bazom.
 */
function akcijskiCtx(s: Svet): Pick<ActionCtx, "runQuery"> {
  const runQuery = (
    ref: typeof internal.podesavanjaStore.tajnaZaAkciju,
    args: FunctionArgs<typeof internal.podesavanjaStore.tajnaZaAkciju>,
  ) => s.t.query(ref, args);
  return { runQuery } as unknown as Pick<ActionCtx, "runQuery">;
}

describe("upis tajne", () => {
  test("vrednost se šifruje pre upisa; red pamti ko ju je upisao", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);

    const rows = await redovi(s);
    expect(rows).toHaveLength(1);
    const red = rows[0];
    expect(red.workspaceId).toBe(s.wsA);
    expect(red.kljuc).toBe("meta_capi_token");
    expect(red.updatedBy).toBe(s.ana);
    expect(typeof red.updatedAt).toBe("number");

    expect(red.sifrovano).not.toBe(TAJNA);
    expect(red.sifrovano).not.toContain(TAJNA);
    expect(red.sifrovano.startsWith("v1:")).toBe(true);
    expect(await decryptCredentials(red.sifrovano)).toBe(TAJNA);
  });

  test("ponovni upis zamenjuje isti red novim šifratom i novim autorom", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);
    const prvi = (await redovi(s))[0];

    const nova = "EAAdrugaVrednost-0987654321xyz";
    await postavi(s, s.jovan, s.wsA, nova);
    const rows = await redovi(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(prvi._id);
    expect(rows[0].sifrovano).not.toBe(prvi.sifrovano);
    expect(rows[0].updatedBy).toBe(s.jovan);
    expect(await decryptCredentials(rows[0].sifrovano)).toBe(nova);

    // Ista vrednost dva puta daje različit šifrat (nasumičan IV).
    await postavi(s, s.jovan, s.wsA, nova);
    expect((await redovi(s))[0].sifrovano).not.toBe(rows[0].sifrovano);
  });

  test("razmaci oko vrednosti se skidaju pre šifrovanja", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, `  ${TAJNA}\n`);
    expect(await decryptCredentials((await redovi(s))[0].sifrovano)).toBe(TAJNA);
  });

  test("tajna jednog projekta ne ulazi u drugi", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);
    expect(await stanje(s, s.wsB)).toEqual({ postavljeno: false, izvor: "nema", updatedAt: null });
    expect(
      await s.t.query(internal.podesavanjaStore.tajnaZaAkciju, {
        workspaceId: s.wsB,
        kljuc: "meta_capi_token",
      }),
    ).toBeNull();

    // Isti ključ u drugom projektu je poseban red.
    await postavi(s, s.boban, s.wsB, "EAAbobanovaVrednost-1234567890");
    expect(await redovi(s)).toHaveLength(2);
    expect(await stanje(s, s.wsA)).toMatchObject({ postavljeno: true, izvor: "projekat" });
  });
});

describe("javne funkcije ne vraćaju ni tekst ni šifrat", () => {
  test("nijedan odgovor ne sadrži vrednost tajne", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    await postavi(s, s.ana, s.wsA, TAJNA);
    await postavi(s, s.ana, s.wsA, "novosti-secret-1234567890", "novosti_revalidate_secret");
    const sifrati = (await redovi(s)).map((r) => r.sifrovano);
    expect(sifrati).toHaveLength(2);

    const ws = { workspaceId: s.wsA };
    const odgovori: Record<string, unknown> = {
      procitaj: await kao(s, s.ana).query(api.podesavanjaStore.procitaj, ws),
      budzetProjekta: await kao(s, s.ana).query(api.podesavanjaStore.budzetProjekta, ws),
      mozak: await kao(s, s.ana).query(api.podesavanjaStore.mozak, ws),
      mojProjekat: await kao(s, s.ana).query(api.projekti.mojProjekat, { slug: "enigma-it" }),
      mojiProjekti: await kao(s, s.ana).query(api.projekti.mojiProjekti, {}),
      getCapiStats: await kao(s, s.ana).query(api.metaCapiStore.getCapiStats, ws),
      // Posmatraču su dostupni samo upiti bez vlasničkog nivoa.
      viewerMozak: await kao(s, s.viewer).query(api.podesavanjaStore.mozak, ws),
      viewerBudzet: await kao(s, s.viewer).query(api.podesavanjaStore.budzetProjekta, ws),
      viewerProjekat: await kao(s, s.viewer).query(api.projekti.mojProjekat, { slug: "enigma-it" }),
      viewerCapi: await kao(s, s.viewer).query(api.metaCapiStore.getCapiStats, ws),
    };

    for (const [ime, odgovor] of Object.entries(odgovori)) {
      const tekst = JSON.stringify(odgovor);
      expect(tekst, `${ime} je morao da vrati odgovor`).toBeTruthy();
      expect(tekst, `${ime} ne sme da sadrži tekst tajne`).not.toContain(TAJNA);
      expect(tekst, `${ime} ne sme da sadrži env token`).not.toContain(ENV_TOKEN);
      expect(tekst, `${ime} ne sme da sadrži tekst druge tajne`).not.toContain("novosti-secret");
      for (const sifrat of sifrati) {
        expect(tekst, `${ime} ne sme da sadrži šifrat`).not.toContain(sifrat);
      }
      // Ni oznaka formata šifrata ne sme da procuri.
      expect(tekst, `${ime} ne sme da sadrži šifrat`).not.toMatch(/v1:[0-9a-f]{20,}/);
    }
  });

  test("procitaj vraća za tajnu tačno postavljeno, izvor i updatedAt", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);
    const odgovor = await kao(s, s.ana).query(api.podesavanjaStore.procitaj, { workspaceId: s.wsA });

    const capi = odgovor.tajne.meta_capi_token;
    expect(Object.keys(capi).sort()).toEqual(["izvor", "postavljeno", "updatedAt"]);
    expect(capi.postavljeno).toBe(true);
    expect(capi.izvor).toBe("projekat");
    expect(capi.updatedAt).toBe((await redovi(s))[0].updatedAt);

    // Ostale dve tajne nisu postavljene (Puls nema ni env).
    expect(odgovor.tajne.novosti_revalidate_secret).toEqual({
      postavljeno: false,
      izvor: "nema",
      updatedAt: null,
    });
    expect(odgovor.tajne.puls_token).toEqual({ postavljeno: false, izvor: "nema", updatedAt: null });
    expect(Object.keys(odgovor.tajne).sort()).toEqual([
      "meta_capi_token",
      "novosti_revalidate_secret",
      "puls_token",
    ]);
  });
});

describe("env tajna samo za osnivački projekat", () => {
  test("Enigma bez svoje tajne nasleđuje env, ScanMe ne", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    expect(await stanje(s, s.wsA)).toEqual({ postavljeno: true, izvor: "env", updatedAt: null });
    expect(await stanje(s, s.wsB)).toEqual({ postavljeno: false, izvor: "nema", updatedAt: null });
    // Klijentski projekat čita svoj vlasnik (Jovan nije njegov član).
    const klijentski = await kao(s, s.klijent).query(api.podesavanjaStore.procitaj, { workspaceId: s.wsK });
    expect(klijentski.tajne.meta_capi_token).toEqual({ postavljeno: false, izvor: "nema", updatedAt: null });
  });

  test("bez env-a ni Enigma nema tajnu", async () => {
    const s = await napraviSvet();
    expect(await stanje(s, s.wsA)).toEqual({ postavljeno: false, izvor: "nema", updatedAt: null });
    vi.stubEnv("META_CAPI_TOKEN", "   ");
    expect(await stanje(s, s.wsA)).toMatchObject({ postavljeno: false, izvor: "nema" });
  });

  test("tajna projekta pobeđuje env, a posle brisanja Enigma se vraća na env", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    await postavi(s, s.ana, s.wsA, TAJNA);
    expect(await stanje(s, s.wsA)).toMatchObject({ postavljeno: true, izvor: "projekat" });

    await obrisi(s, s.ana, s.wsA);
    expect(await redovi(s)).toEqual([]);
    expect(await stanje(s, s.wsA)).toEqual({ postavljeno: true, izvor: "env", updatedAt: null });
  });

  test("brisanje tajne ScanMe-a vraća „nema“, a ponovno brisanje ne pada", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    await postavi(s, s.boban, s.wsB, TAJNA);
    expect(await stanje(s, s.wsB)).toMatchObject({ postavljeno: true, izvor: "projekat" });

    await obrisi(s, s.boban, s.wsB);
    expect(await redovi(s)).toEqual([]);
    expect(await stanje(s, s.wsB)).toEqual({ postavljeno: false, izvor: "nema", updatedAt: null });

    await obrisi(s, s.boban, s.wsB);
    expect(await stanje(s, s.wsB)).toMatchObject({ izvor: "nema" });
  });

  test("brisanje jedne tajne ne dira drugu ni tuđi projekat", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);
    await postavi(s, s.ana, s.wsA, "novosti-secret-1234567890", "novosti_revalidate_secret");
    await postavi(s, s.boban, s.wsB, TAJNA);
    await obrisi(s, s.ana, s.wsA);

    const preostalo = await redovi(s);
    expect(preostalo.map((r) => [r.workspaceId, r.kljuc]).sort()).toEqual(
      [
        [s.wsA, "novosti_revalidate_secret"],
        [s.wsB, "meta_capi_token"],
      ].sort(),
    );
  });
});

describe("neispravna vrednost", () => {
  test("prekratka, sa razmakom ili predugačka: „invalid“, bez citiranja vrednosti i bez upisa", async () => {
    const s = await napraviSvet();
    const vrednosti = [
      "kratka-tajna", // 12 < 20
      "AAAAAAAAAA BBBBBBBBBBBBBBB", // razmak u sredini
      "tab\tUnutra-vrednost-1234567890",
      "T".repeat(513), // > 512
    ];
    for (const vrednost of vrednosti) {
      const r = await ishod(postavi(s, s.ana, s.wsA, vrednost));
      expect(r, `„${vrednost.slice(0, 12)}…“ je morala da bude odbijena`).not.toBeNull();
      expect(r?.kod).toBe("invalid");
      expect(r?.tekst).not.toContain(vrednost);
      expect(r?.tekst).not.toContain("kratka-tajna");
    }
    // Prazna vrednost je takođe odbijena.
    await odbijeno(postavi(s, s.ana, s.wsA, "   "), "invalid");
    expect(await redovi(s)).toEqual([]);
  });

  test("dužina zavisi od vrste tajne", async () => {
    const s = await napraviSvet();
    await odbijeno(postavi(s, s.ana, s.wsA, "x".repeat(15), "novosti_revalidate_secret"), "invalid");
    await postavi(s, s.ana, s.wsA, "x".repeat(16), "novosti_revalidate_secret");
    await odbijeno(postavi(s, s.ana, s.wsA, "x".repeat(19), "meta_capi_token"), "invalid");
    await postavi(s, s.ana, s.wsA, "x".repeat(20), "meta_capi_token");
    expect((await redovi(s)).map((r) => r.kljuc).sort()).toEqual([
      "meta_capi_token",
      "novosti_revalidate_secret",
    ]);
  });

  test("neispravna vrednost ne briše već postavljenu tajnu", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);
    const pre = (await redovi(s))[0];
    await odbijeno(postavi(s, s.ana, s.wsA, "kratko"), "invalid");
    expect((await redovi(s))[0]).toEqual(pre);
  });

  test("bez ključa za šifrovanje ništa se ne upisuje, a greška ne citira vrednost", async () => {
    const s = await napraviSvet();
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", undefined);
    const r = await ishod(postavi(s, s.ana, s.wsA, TAJNA));
    expect(r).not.toBeNull();
    expect(r?.tekst).not.toContain(TAJNA);
    expect(await redovi(s)).toEqual([]);
  });
});

describe("prava", () => {
  test("urednik, posmatrač i nečlan: „forbidden“ i ništa se ne menja", async () => {
    const s = await napraviSvet();
    await postavi(s, s.ana, s.wsA, TAJNA);
    const pre = await redovi(s);
    const ws = { workspaceId: s.wsA };

    for (const ko of [s.urednica, s.viewer, s.boban, s.stranac]) {
      await odbijeno(postavi(s, ko, s.wsA, "EAAnapadacVrednost-1234567890"), "forbidden");
      await odbijeno(obrisi(s, ko, s.wsA), "forbidden");
      await odbijeno(kao(s, ko).query(api.podesavanjaStore.procitaj, ws), "forbidden");
    }
    expect(await redovi(s)).toEqual(pre);
  });

  test("vlasnik jednog projekta ne upisuje tajnu u drugi", async () => {
    const s = await napraviSvet();
    await odbijeno(postavi(s, s.ana, s.wsB, TAJNA), "forbidden");
    await odbijeno(obrisi(s, s.ana, s.wsB), "forbidden");
    expect(await redovi(s)).toEqual([]);
  });

  test("bez prijave: „unauthorized“", async () => {
    const s = await napraviSvet();
    await odbijeno(
      s.t.mutation(api.podesavanjaStore.postaviTajnu, {
        workspaceId: s.wsA,
        kljuc: "meta_capi_token",
        vrednost: TAJNA,
      }),
      "unauthorized",
    );
    await odbijeno(
      s.t.mutation(api.podesavanjaStore.obrisiTajnu, { workspaceId: s.wsA, kljuc: "meta_capi_token" }),
      "unauthorized",
    );
    await odbijeno(s.t.query(api.podesavanjaStore.procitaj, { workspaceId: s.wsA }), "unauthorized");
    expect(await redovi(s)).toEqual([]);
  });
});

describe("tajnaZaAkciju (interno)", () => {
  const zaAkciju = (s: Svet, workspaceId: Id<"workspaces">, kljuc: KljucTajne = "meta_capi_token") =>
    s.t.query(internal.podesavanjaStore.tajnaZaAkciju, { workspaceId, kljuc });

  test("postavljena tajna: šifrat, nikad tekst", async () => {
    const s = await napraviSvet();
    await postavi(s, s.boban, s.wsB, TAJNA);
    const odgovor = await zaAkciju(s, s.wsB);
    expect(odgovor).toEqual({ sifrovano: (await redovi(s))[0].sifrovano });
    expect(JSON.stringify(odgovor)).not.toContain(TAJNA);
  });

  test("osnivački projekat bez svog reda: „uzmi iz env-a“; drugi projekat: null", async () => {
    const s = await napraviSvet();
    expect(await zaAkciju(s, s.wsA)).toEqual({ izEnva: true });
    expect(await zaAkciju(s, s.wsB)).toBeNull();
    expect(await zaAkciju(s, s.wsK)).toBeNull();
    expect(await zaAkciju(s, s.wsB, "novosti_revalidate_secret")).toBeNull();
  });

  test("osnivački projekat sa svojim redom dobija šifrat, a ne „izEnva“", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    await postavi(s, s.ana, s.wsA, TAJNA);
    expect(await zaAkciju(s, s.wsA)).toEqual({ sifrovano: (await redovi(s))[0].sifrovano });
  });
});

describe("procitajTajnu (kako je koristi akcija)", () => {
  test("tajna projekta se dešifruje u memoriji akcije", async () => {
    const s = await napraviSvet();
    await postavi(s, s.boban, s.wsB, TAJNA);
    expect(await procitajTajnu(akcijskiCtx(s), s.wsB, "meta_capi_token")).toBe(TAJNA);
  });

  test("Enigma bez svoje tajne dobija env, ScanMe nikad Enigmin token", async () => {
    const s = await napraviSvet();
    const ctx = akcijskiCtx(s);
    expect(await procitajTajnu(ctx, s.wsA, "meta_capi_token")).toBeNull();

    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    expect(await procitajTajnu(ctx, s.wsA, "meta_capi_token")).toBe(ENV_TOKEN);
    expect(await procitajTajnu(ctx, s.wsB, "meta_capi_token")).toBeNull();
    expect(await procitajTajnu(ctx, s.wsK, "meta_capi_token")).toBeNull();

    // Puls token nema env, pa ga ni osnivački projekat ne nasleđuje.
    expect(await procitajTajnu(ctx, s.wsA, "puls_token")).toBeNull();
  });

  test("sopstvena tajna Enigme pobeđuje env", async () => {
    const s = await napraviSvet();
    vi.stubEnv("META_CAPI_TOKEN", ENV_TOKEN);
    await postavi(s, s.ana, s.wsA, TAJNA);
    expect(await procitajTajnu(akcijskiCtx(s), s.wsA, "meta_capi_token")).toBe(TAJNA);
  });

  test("šifrat koji ne može da se dešifruje daje null, a ne grešku", async () => {
    const s = await napraviSvet();
    const greske = vi.spyOn(console, "error").mockImplementation(() => {});
    await postavi(s, s.boban, s.wsB, TAJNA);
    const ctx = akcijskiCtx(s);

    // Promenjen ključ za šifrovanje.
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "cd".repeat(32));
    expect(await procitajTajnu(ctx, s.wsB, "meta_capi_token")).toBeNull();

    // Oštećen red.
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", KLJUC_ZA_SIFROVANJE);
    const [red] = await redovi(s);
    await s.t.run(async (c) => {
      await c.db.patch(red._id, { sifrovano: "v1:00ff" });
    });
    expect(await procitajTajnu(ctx, s.wsB, "meta_capi_token")).toBeNull();

    expect(greske).toHaveBeenCalled();
    expect(JSON.stringify(greske.mock.calls)).not.toContain(TAJNA);
  });
});
