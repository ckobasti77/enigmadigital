/// <reference types="vite/client" />
/**
 * Puls (C17): cron `puls.pokupiSve` pita sajt svakog projekta za brojke i čuva
 * red u `pulsSnimci`, a `puls.poslednji` ih daje kartici „Poslovanje“.
 *
 * Svet: A = „Enigma IT“ (enigma.rs), B = „ScanMe“ (scanme.rs), svaki sa svojom
 * adresom Pulsa i svojim tokenom. `fetch` je lažan i odgovara po hostu; nijedan
 * zahtev ne izlazi na mrežu.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  PULS_BRISANJE_PO_UPISU,
  PULS_ISTEK_MS,
  PULS_MAX_PROJEKATA,
  PULS_ZADRZAVANJE_MS,
} from "./lib/puls";
import { kao, napraviSvet, odbijeno, type Svet } from "./projekatTest.pomoc";

const DOMEN_A = "enigma.rs";
const DOMEN_B = "scanme.rs";
const ADRESA_A = `https://${DOMEN_A}/api/puls`;
const ADRESA_B = `https://${DOMEN_B}/api/puls`;
const TOKEN_A = "token-enigme-1234567890abcdef";
const TOKEN_B = "token-scanme-0987654321fedcba";

const SAT = 60 * 60 * 1000;
const DAN = 24 * SAT;

type Obrada = (url: string, init?: RequestInit) => Promise<Response>;

let fetchMock: ReturnType<typeof vi.fn<Obrada>>;
/** Odgovor po hostu; host bez odgovora je greška testa, ne mreže. */
let odgovori: Record<string, Obrada>;

const json = (telo: unknown, status = 200) => new Response(JSON.stringify(telo), { status });
const puls = (metrike: Record<string, number>, oznake?: Record<string, string>) =>
  json({ vreme: new Date().toISOString(), metrike, ...(oznake ? { oznake } : {}) });

beforeEach(() => {
  vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", "ab".repeat(32));
  odgovori = {
    [DOMEN_A]: async () => puls({ porudzbine: 10 }),
    [DOMEN_B]: async () => puls({ upiti: 3 }),
  };
  fetchMock = vi.fn<Obrada>(async (url, init) => {
    const obrada = odgovori[new URL(url).host];
    if (obrada === undefined) throw new Error(`neočekivan host u testu: ${url}`);
    return await obrada(url, init);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Sajt, adresa Pulsa i token projekta, kako ih upisuje vlasnik u Podešavanjima. */
async function podesiPuls(
  s: Svet,
  ko: Id<"users">,
  workspaceId: Id<"workspaces">,
  domen: string,
  token: string,
) {
  const vlasnik = kao(s, ko);
  await vlasnik.mutation(api.podesavanjaStore.sacuvajSajtove, { workspaceId, sajtovi: [domen] });
  await vlasnik.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
    workspaceId,
    pulsUrl: `https://${domen}/api/puls`,
  });
  await vlasnik.mutation(api.podesavanjaStore.postaviTajnu, {
    workspaceId,
    kljuc: "puls_token",
    vrednost: token,
  });
}

/** Oba projekta potpuno podešena. */
async function podesiOba(s: Svet) {
  await podesiPuls(s, s.ana, s.wsA, DOMEN_A, TOKEN_A);
  await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
}

const pokupi = (s: Svet) => s.t.action(internal.puls.pokupiSve, {});

const redovi = (s: Svet, workspaceId: Id<"workspaces">) =>
  s.t.run(async (ctx) =>
    ctx.db
      .query("pulsSnimci")
      .withIndex("by_workspace_at", (q) => q.eq("workspaceId", workspaceId))
      .collect(),
  );

type NoviRed = Omit<Doc<"pulsSnimci">, "_id" | "_creationTime" | "workspaceId">;
const dodajRed = (s: Svet, workspaceId: Id<"workspaces">, red: NoviRed) =>
  s.t.run(async (ctx) => ctx.db.insert("pulsSnimci", { workspaceId, ...red }));

/** Pozivi `fetch`-a prema jednom hostu (redosled među projektima nije garantovan). */
function pozivi(host: string) {
  return fetchMock.mock.calls.filter(([url]) => new URL(url).host === host);
}

const zaglavlja = (init?: RequestInit) => (init?.headers ?? {}) as Record<string, string>;

describe("cron: jedan projekat ne ruši ostale", () => {
  test("oba projekta ispravna: po jedan red sa brojkama, vremenom i trajanjem", async () => {
    const s = await napraviSvet();
    await podesiOba(s);
    odgovori[DOMEN_A] = async () => puls({ porudzbine: 10, prihod: 1500.5 }, { porudzbine: "Porudžbine" });

    await pokupi(s);

    const [a] = await redovi(s, s.wsA);
    const [b] = await redovi(s, s.wsB);
    expect(await redovi(s, s.wsA)).toHaveLength(1);
    expect(await redovi(s, s.wsB)).toHaveLength(1);
    expect(a.metrike).toEqual({ porudzbine: 10, prihod: 1500.5 });
    expect(a.oznake).toEqual({ porudzbine: "Porudžbine" });
    expect(a.greska).toBeUndefined();
    expect(typeof a.vreme).toBe("number");
    expect(a.trajanjeMs).toBeGreaterThanOrEqual(0);
    expect(b.metrike).toEqual({ upiti: 3 });
    expect(b.oznake).toBeUndefined();
  });

  test.each([
    ["odgovor nije JSON", () => Promise.resolve(new Response("<html>502</html>")), "nije_json"],
    ["mrežna greška", () => Promise.reject(new TypeError("fetch failed")), "mreza"],
    ["JSON bez metrika", () => Promise.resolve(json({ vreme: new Date().toISOString() })), "los_format"],
  ] as const)("A: %s, B ipak dobija svoj red", async (_opis, obrada, kod) => {
    const s = await napraviSvet();
    await podesiOba(s);
    odgovori[DOMEN_A] = obrada;

    await pokupi(s);

    const a = await redovi(s, s.wsA);
    expect(a).toHaveLength(1);
    expect(a[0].greska?.kod).toBe(kod);
    expect(a[0].metrike).toBeUndefined();
    expect(a[0].vreme).toBeUndefined();

    const b = await redovi(s, s.wsB);
    expect(b).toHaveLength(1);
    expect(b[0].greska).toBeUndefined();
    expect(b[0].metrike).toEqual({ upiti: 3 });
  });

  test("brava cron-a se vraća i posle greške, sledeći prolaz radi", async () => {
    const s = await napraviSvet();
    await podesiOba(s);
    odgovori[DOMEN_A] = () => Promise.resolve(new Response("nije json"));

    await pokupi(s);
    const brave = await s.t.run(async (ctx) => await ctx.db.query("cronLocks").collect());
    expect(brave.map((b) => b.name)).toEqual(["puls:sync"]);
    expect(brave[0].expiresAt).toBeLessThanOrEqual(Date.now());

    odgovori[DOMEN_A] = async () => puls({ porudzbine: 11 });
    await pokupi(s);
    const a = await redovi(s, s.wsA);
    expect(a).toHaveLength(2);
    expect(a.filter((r) => r.metrike !== undefined)).toHaveLength(1);
  });

  test("zauzeta brava: prolaz se preskače, bez poziva i bez redova", async () => {
    const s = await napraviSvet();
    await podesiOba(s);
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("cronLocks", {
        name: "puls:sync",
        startedAt: sada,
        expiresAt: sada + 10 * 60 * 1000,
      });
    });

    await pokupi(s);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await redovi(s, s.wsA)).toHaveLength(0);
    expect(await redovi(s, s.wsB)).toHaveLength(0);
  });
});

describe("greške jednog poziva", () => {
  test.each([500, 404, 204])("HTTP %i je „http“ sa porukom „HTTP %i“", async (status) => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    odgovori[DOMEN_B] = async () => new Response(status === 204 ? null : "greška servera", { status });

    await pokupi(s);

    const [b] = await redovi(s, s.wsB);
    expect(b.greska).toEqual({ kod: "http", poruka: `HTTP ${status}` });
    expect(b.metrike).toBeUndefined();
  });

  test.each([301, 302, 307, 308])(
    "preusmerenje %i se ne prati: jedan poziv, `redirect: manual`",
    async (status) => {
      const s = await napraviSvet();
      await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
      odgovori[DOMEN_B] = async () =>
        new Response(null, { status, headers: { Location: "https://tudj.example/puls" } });

      await pokupi(s);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(ADRESA_B);
      expect(init?.redirect).toBe("manual");
      expect(init?.method).toBe("GET");
      const [b] = await redovi(s, s.wsB);
      expect(b.greska?.kod).toBe("preusmerenje");
      expect(b.greska?.poruka).not.toContain("example");
    },
  );

  test("odgovor veći od 64 KB je „prevelik“", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    odgovori[DOMEN_B] = async () =>
      json({ vreme: new Date().toISOString(), metrike: { upiti: 1 }, dopuna: "x".repeat(70_000) });

    await pokupi(s);

    const [b] = await redovi(s, s.wsB);
    expect(b.greska?.kod).toBe("prevelik");
    expect(b.metrike).toBeUndefined();
  });

  test("odgovor od tačno 64 KB još prolazi", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    const vreme = new Date().toISOString();
    const osnova = JSON.stringify({ vreme, metrike: { upiti: 5 }, dopuna: "" }).length;
    const telo = JSON.stringify({
      vreme,
      metrike: { upiti: 5 },
      dopuna: "x".repeat(64 * 1024 - osnova),
    });
    expect(telo.length).toBe(64 * 1024);
    odgovori[DOMEN_B] = async () => new Response(telo, { status: 200 });

    await pokupi(s);

    const [b] = await redovi(s, s.wsB);
    expect(b.greska).toBeUndefined();
    expect(b.metrike).toEqual({ upiti: 5 });
  });

  test("sajt koji ne odgovara: posle 10 s prekid i red „istek“", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);

    // Pravih 10 s ne čekamo: svaki tajmer od PULS_ISTEK_MS ističe odmah, a
    // ostali (convex-test) idu kroz pravi setTimeout nepromenjeni.
    const pravi = globalThis.setTimeout;
    const trazeno: number[] = [];
    vi.stubGlobal("setTimeout", (fn: () => void, ms?: number, ...args: unknown[]) => {
      trazeno.push(ms ?? 0);
      return pravi(fn, ms === PULS_ISTEK_MS ? 0 : ms, ...args);
    });

    let prekinut = false;
    odgovori[DOMEN_B] = (_url, init) =>
      new Promise<Response>((_resolve, odbij) => {
        const prekini = () => {
          prekinut = true;
          odbij(Object.assign(new Error("aborted"), { name: "AbortError" }));
        };
        if (init?.signal?.aborted) prekini();
        else init?.signal?.addEventListener("abort", prekini, { once: true });
      });

    await pokupi(s);

    expect(PULS_ISTEK_MS).toBe(10_000);
    expect(trazeno).toContain(PULS_ISTEK_MS);
    expect(prekinut).toBe(true);
    const [b] = await redovi(s, s.wsB);
    expect(b.greska?.kod).toBe("istek");
    expect(b.greska?.poruka).toContain("10 sekundi");
    expect(b.metrike).toBeUndefined();
  });

  test("mrežna greška ne prenosi poruku izuzetka (adresu, delove odgovora)", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    odgovori[DOMEN_B] = () =>
      Promise.reject(new TypeError(`connect ECONNREFUSED ${ADRESA_B}?kljuc=TAJNA-IZ-IZUZETKA`));

    await pokupi(s);

    const [b] = await redovi(s, s.wsB);
    expect(b.greska?.kod).toBe("mreza");
    expect(JSON.stringify(b)).not.toContain("TAJNA-IZ-IZUZETKA");
    expect(JSON.stringify(b)).not.toContain("ECONNREFUSED");
  });
});

describe("adresa Pulsa mora da ostane na sajtu projekta", () => {
  test("posle izmene sajtova adresa više ne važi: red „adresa_van_sajta“, bez poziva", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    // Vlasnik je posle čuvanja adrese zamenio sajtove.
    await s.t.run(async (ctx) => ctx.db.patch(s.wsB, { sajtovi: ["drugi-sajt.rs"] }));

    await pokupi(s);

    expect(fetchMock).not.toHaveBeenCalled();
    const b = await redovi(s, s.wsB);
    expect(b).toHaveLength(1);
    expect(b[0].greska?.kod).toBe("adresa_van_sajta");
    expect(b[0].metrike).toBeUndefined();
    expect(b[0].trajanjeMs).toBeUndefined();
  });

  test("uklonjeni svi sajtovi: isto, ni tada se ne zove stara adresa", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    await s.t.run(async (ctx) => ctx.db.patch(s.wsB, { sajtovi: undefined }));

    await pokupi(s);

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await redovi(s, s.wsB))[0].greska?.kod).toBe("adresa_van_sajta");
  });

  test("sačuvana adresa na tuđem hostu ne prolazi ni kroz Podešavanja", async () => {
    const s = await napraviSvet();
    await kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajSajtove, {
      workspaceId: s.wsB,
      sajtovi: [DOMEN_B],
    });
    await odbijeno(
      kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        workspaceId: s.wsB,
        pulsUrl: ADRESA_A,
      }),
      "invalid",
    );
    await odbijeno(
      kao(s, s.boban).mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        workspaceId: s.wsB,
        pulsUrl: `http://${DOMEN_B}/api/puls`,
      }),
      "invalid",
    );
  });

  test("adresa sa „www.“ na sajtu projekta prolazi i zove se tačno ta adresa", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    await boban.mutation(api.podesavanjaStore.sacuvajSajtove, {
      workspaceId: s.wsB,
      sajtovi: [DOMEN_B],
    });
    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pulsUrl: `https://www.${DOMEN_B}/api/puls`,
    });
    await boban.mutation(api.podesavanjaStore.postaviTajnu, {
      workspaceId: s.wsB,
      kljuc: "puls_token",
      vrednost: TOKEN_B,
    });
    odgovori["www.scanme.rs"] = async () => puls({ upiti: 8 });

    await pokupi(s);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://www.${DOMEN_B}/api/puls`);
    expect((await redovi(s, s.wsB))[0].metrike).toEqual({ upiti: 8 });
  });
});

describe("bez adrese ili tokena nema poziva ni reda", () => {
  test("adresa postoji, token nije postavljen", async () => {
    const s = await napraviSvet();
    const boban = kao(s, s.boban);
    await boban.mutation(api.podesavanjaStore.sacuvajSajtove, { workspaceId: s.wsB, sajtovi: [DOMEN_B] });
    await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsB,
      pulsUrl: ADRESA_B,
    });

    await pokupi(s);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await redovi(s, s.wsB)).toHaveLength(0);
  });

  test("token postoji, adresa nije podešena", async () => {
    const s = await napraviSvet();
    await kao(s, s.boban).mutation(api.podesavanjaStore.postaviTajnu, {
      workspaceId: s.wsB,
      kljuc: "puls_token",
      vrednost: TOKEN_B,
    });

    await pokupi(s);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await redovi(s, s.wsB)).toHaveLength(0);
  });

  test("obrisan token zaustavlja pozive tog projekta, drugi projekat radi dalje", async () => {
    const s = await napraviSvet();
    await podesiOba(s);
    await kao(s, s.boban).mutation(api.podesavanjaStore.obrisiTajnu, {
      workspaceId: s.wsB,
      kljuc: "puls_token",
    });

    await pokupi(s);

    expect(pozivi(DOMEN_B)).toHaveLength(0);
    expect(await redovi(s, s.wsB)).toHaveLength(0);
    expect(pozivi(DOMEN_A)).toHaveLength(1);
    expect(await redovi(s, s.wsA)).toHaveLength(1);
  });

  test("projekat bez Pulsa se ne obilazi; arhiviran projekat sa adresom takođe ne", async () => {
    const s = await napraviSvet();
    await podesiOba(s);
    await s.t.run(async (ctx) => ctx.db.patch(s.wsB, { arhiviran: true }));

    expect(await s.t.query(internal.puls.projektiSaPulsom, {})).toEqual([s.wsA]);

    await pokupi(s);

    expect(pozivi(DOMEN_B)).toHaveLength(0);
    expect(await redovi(s, s.wsB)).toHaveLength(0);
    // Klijentski projekat nikad nije podesio Puls: ni poziva ni reda.
    expect(await redovi(s, s.wsK)).toHaveLength(0);
  });

  test("jedan prolaz obilazi najviše PULS_MAX_PROJEKATA projekata", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < PULS_MAX_PROJEKATA + 5; i++) {
        await ctx.db.insert("workspaces", {
          name: `Projekat ${i}`,
          slug: `projekat-${i}`,
          podesavanja: { pulsUrl: `https://p${i}.example.rs/puls` },
        });
      }
    });

    const spisak = await s.t.query(internal.puls.projektiSaPulsom, {});
    expect(spisak).toHaveLength(PULS_MAX_PROJEKATA);
  });
});

describe("token: svaki projekat šalje samo svoj i nigde se ne pamti", () => {
  test("Authorization je „Bearer“ + token tog projekta, tuđi token ne ide na tuđ sajt", async () => {
    const s = await napraviSvet();
    await podesiOba(s);

    await pokupi(s);

    const zaA = pozivi(DOMEN_A);
    const zaB = pozivi(DOMEN_B);
    expect(zaA).toHaveLength(1);
    expect(zaB).toHaveLength(1);
    expect(zaglavlja(zaA[0][1]).Authorization).toBe(`Bearer ${TOKEN_A}`);
    expect(zaglavlja(zaB[0][1]).Authorization).toBe(`Bearer ${TOKEN_B}`);
    for (const [url, init] of fetchMock.mock.calls) {
      // Token nije ni u adresi, ni u telu; GET nema telo.
      expect(url).not.toContain(TOKEN_A);
      expect(url).not.toContain(TOKEN_B);
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(zaglavlja(init).Accept).toBe("application/json");
    }
  });

  test("ni jedan red ne sadrži token, ni kad sajt vrati token u telu odgovora", async () => {
    const s = await napraviSvet();
    await podesiOba(s);
    const dnevnik = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
    ];

    // Prolaz 1: A odjekuje zaglavlje u telu (nije JSON), B je ispravan.
    odgovori[DOMEN_A] = async (_url, init) =>
      new Response(`Authorization: ${zaglavlja(init).Authorization}`, { status: 200 });
    await pokupi(s);
    // Prolaz 2: A vraća grešku sa tokenom u telu, B baca izuzetak sa tokenom.
    odgovori[DOMEN_A] = async (_url, init) =>
      new Response(zaglavlja(init).Authorization, { status: 500 });
    odgovori[DOMEN_B] = async (_url, init) =>
      Promise.reject(new TypeError(`odbijeno: ${zaglavlja(init).Authorization}`));
    await pokupi(s);

    const sviRedovi = [...(await redovi(s, s.wsA)), ...(await redovi(s, s.wsB))];
    expect(sviRedovi).toHaveLength(4);
    const tekst = JSON.stringify(sviRedovi);
    expect(tekst).not.toContain(TOKEN_A);
    expect(tekst).not.toContain(TOKEN_B);
    expect(sviRedovi.map((r) => r.greska?.kod ?? "ok").sort()).toEqual(["http", "mreza", "nije_json", "ok"]);

    const ispisano = JSON.stringify(dnevnik.flatMap((d) => d.mock.calls));
    expect(ispisano).not.toContain(TOKEN_A);
    expect(ispisano).not.toContain(TOKEN_B);
  });

  test("token drugog projekta nije dostupan: A bez svog tokena ne šalje ništa, ni B-ov", async () => {
    const s = await napraviSvet();
    await podesiPuls(s, s.boban, s.wsB, DOMEN_B, TOKEN_B);
    const ana = kao(s, s.ana);
    await ana.mutation(api.podesavanjaStore.sacuvajSajtove, { workspaceId: s.wsA, sajtovi: [DOMEN_A] });
    await ana.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
      workspaceId: s.wsA,
      pulsUrl: ADRESA_A,
    });

    await pokupi(s);

    expect(pozivi(DOMEN_A)).toHaveLength(0);
    expect(pozivi(DOMEN_B)).toHaveLength(1);
    expect(zaglavlja(pozivi(DOMEN_B)[0][1]).Authorization).toBe(`Bearer ${TOKEN_B}`);
  });
});

describe("zadržavanje: redovi stariji od 90 dana se brišu pri upisu", () => {
  const upisi = (s: Svet, workspaceId: Id<"workspaces">) =>
    s.t.mutation(internal.puls.upisiSnimak, {
      workspaceId,
      at: Date.now(),
      metrike: { upiti: 1 },
    });

  test("stari redovi nestaju, noviji ostaju, upisan red je tu", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const star = await dodajRed(s, s.wsB, { at: sada - PULS_ZADRZAVANJE_MS - DAN, metrike: { upiti: 1 } });
    const josStar = await dodajRed(s, s.wsB, { at: sada - 200 * DAN, greska: { kod: "http", poruka: "HTTP 500" } });
    const skoroStar = await dodajRed(s, s.wsB, { at: sada - PULS_ZADRZAVANJE_MS + DAN, metrike: { upiti: 2 } });
    const juce = await dodajRed(s, s.wsB, { at: sada - DAN, metrike: { upiti: 3 } });

    const novi = await upisi(s, s.wsB);

    const ostali = (await redovi(s, s.wsB)).map((r) => r._id);
    expect(ostali).toHaveLength(3);
    expect(ostali).toEqual(expect.arrayContaining([skoroStar, juce, novi]));
    expect(ostali).not.toContain(star);
    expect(ostali).not.toContain(josStar);
  });

  test("jedan upis briše najviše 50 starih redova, sledeći dovršava", async () => {
    const s = await napraviSvet();
    expect(PULS_BRISANJE_PO_UPISU).toBe(50);
    const sada = Date.now();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) {
        await ctx.db.insert("pulsSnimci", {
          workspaceId: s.wsB,
          at: sada - PULS_ZADRZAVANJE_MS - (i + 1) * SAT,
          metrike: { upiti: i },
        });
      }
    });

    await upisi(s, s.wsB);
    // 60 starih − 50 obrisanih + 1 novi.
    expect(await redovi(s, s.wsB)).toHaveLength(11);

    await upisi(s, s.wsB);
    // Preostalih 10 starih je otišlo, ostala su dva nova.
    const ostali = await redovi(s, s.wsB);
    expect(ostali).toHaveLength(2);
    expect(ostali.every((r) => r.at > sada - PULS_ZADRZAVANJE_MS)).toBe(true);
  });

  test("čišćenje ne dira redove drugog projekta", async () => {
    const s = await napraviSvet();
    const sada = Date.now();
    const tudjiStari = await dodajRed(s, s.wsA, {
      at: sada - PULS_ZADRZAVANJE_MS - 30 * DAN,
      metrike: { porudzbine: 1 },
    });

    await upisi(s, s.wsB);

    expect((await redovi(s, s.wsA)).map((r) => r._id)).toEqual([tudjiStari]);
  });

  test("redovi na samoj granici od 90 dana se ne brišu preranim zaokruživanjem", async () => {
    const s = await napraviSvet();
    // Jedan sat unutar prozora: ostaje i posle upisa.
    const unutar = await dodajRed(s, s.wsB, {
      at: Date.now() - PULS_ZADRZAVANJE_MS + SAT,
      metrike: { upiti: 1 },
    });

    await upisi(s, s.wsB);

    expect((await redovi(s, s.wsB)).map((r) => r._id)).toContain(unutar);
  });
});

describe("kartica „Poslovanje“: puls.poslednji", () => {
  const citaj = (s: Svet, ko: Id<"users">, workspaceId: Id<"workspaces">, sada = Date.now()) =>
    kao(s, ko).query(api.puls.poslednji, { workspaceId, sada });

  describe("ko sme da čita", () => {
    test("nepoznat korisnik i član samo drugog projekta su odbijeni", async () => {
      const s = await napraviSvet();
      await dodajRed(s, s.wsA, { at: Date.now() - SAT, metrike: { porudzbine: 10 } });

      await odbijeno(citaj(s, s.stranac, s.wsA), "forbidden");
      await odbijeno(citaj(s, s.boban, s.wsA), "forbidden");
      await odbijeno(citaj(s, s.klijent, s.wsA), "forbidden");
    });

    test("bez prijave je „unauthorized“", async () => {
      const s = await napraviSvet();
      await odbijeno(s.t.query(api.puls.poslednji, { workspaceId: s.wsA, sada: Date.now() }), "unauthorized");
    });

    test("čitalac projekta (client_viewer) i urednik vide brojke", async () => {
      const s = await napraviSvet();
      await dodajRed(s, s.wsA, { at: Date.now() - SAT, metrike: { porudzbine: 10 } });

      for (const ko of [s.viewer, s.urednica, s.ana]) {
        const r = await citaj(s, ko, s.wsA);
        expect(r.poslednji?.metrike).toEqual([
          { kljuc: "porudzbine", naziv: "porudzbine", vrednost: 10, promena24h: null },
        ]);
      }
    });

    test("član dva projekta vidi svaki zasebno, brojke se ne mešaju", async () => {
      const s = await napraviSvet();
      await dodajRed(s, s.wsA, { at: Date.now() - SAT, metrike: { porudzbine: 10 } });
      await dodajRed(s, s.wsB, { at: Date.now() - SAT, metrike: { upiti: 3 } });

      const a = await citaj(s, s.jovan, s.wsA);
      const b = await citaj(s, s.jovan, s.wsB);
      expect(a.poslednji?.metrike.map((m) => m.kljuc)).toEqual(["porudzbine"]);
      expect(b.poslednji?.metrike.map((m) => m.kljuc)).toEqual(["upiti"]);
      // Boban čita samo svoj projekat i ne vidi Enigmine redove.
      const bobanovi = await citaj(s, s.boban, s.wsB);
      expect(JSON.stringify(bobanovi)).not.toContain("porudzbine");
    });
  });

  describe("šta je podešeno", () => {
    test("zastavice prate adresu i token redom", async () => {
      const s = await napraviSvet();
      const boban = kao(s, s.boban);
      expect((await citaj(s, s.boban, s.wsB)).podeseno).toEqual({ adresa: false, token: false });

      await boban.mutation(api.podesavanjaStore.sacuvajSajtove, { workspaceId: s.wsB, sajtovi: [DOMEN_B] });
      await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        workspaceId: s.wsB,
        pulsUrl: ADRESA_B,
      });
      expect((await citaj(s, s.boban, s.wsB)).podeseno).toEqual({ adresa: true, token: false });

      await boban.mutation(api.podesavanjaStore.postaviTajnu, {
        workspaceId: s.wsB,
        kljuc: "puls_token",
        vrednost: TOKEN_B,
      });
      const puno = await citaj(s, s.boban, s.wsB);
      expect(puno.podeseno).toEqual({ adresa: true, token: true });
      // Tekst ni šifrat tajne ne izlaze iz upita.
      expect(JSON.stringify(puno)).not.toContain(TOKEN_B);

      await boban.mutation(api.podesavanjaStore.obrisiTajnu, { workspaceId: s.wsB, kljuc: "puls_token" });
      await boban.mutation(api.podesavanjaStore.sacuvajIntegracijeSajta, {
        workspaceId: s.wsB,
        pulsUrl: null,
      });
      expect((await citaj(s, s.boban, s.wsB)).podeseno).toEqual({ adresa: false, token: false });
    });

    test("bez ijednog reda: prazna kartica, bez greške i bez „zastao“", async () => {
      const s = await napraviSvet();
      expect(await citaj(s, s.ana, s.wsA)).toEqual({
        podeseno: { adresa: false, token: false },
        poslednji: null,
        greska: null,
        zastao: false,
      });
    });
  });

  describe("brojke i promena za 24 h", () => {
    test("promena je razlika prema redu starom bar 24 h, a ne prema najbližem ranijem", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      const novi = sada - SAT;
      // 25 h pre najnovijeg: ovo je referenca. 23 h pre: prekratko, ne računa se.
      await dodajRed(s, s.wsA, {
        at: novi - 25 * SAT,
        metrike: { porudzbine: 10, poseta: 100, staro: 7 },
      });
      await dodajRed(s, s.wsA, { at: novi - 23 * SAT, metrike: { porudzbine: 12, poseta: 95 } });
      await dodajRed(s, s.wsA, {
        at: novi,
        vreme: novi - 1000,
        metrike: { porudzbine: 15, poseta: 90, nova: 4 },
        oznake: { porudzbine: "Porudžbine", nova: "Novo" },
      });

      const r = await citaj(s, s.ana, s.wsA, sada);

      expect(r.poslednji?.at).toBe(novi);
      expect(r.poslednji?.vreme).toBe(novi - 1000);
      // Convex čuva ključeve zapisa po abecedi, pa redosled ne pretpostavljamo.
      expect(r.poslednji?.metrike).toHaveLength(3);
      expect(r.poslednji?.metrike).toEqual(
        expect.arrayContaining([
          { kljuc: "porudzbine", naziv: "Porudžbine", vrednost: 15, promena24h: 5 },
          { kljuc: "poseta", naziv: "poseta", vrednost: 90, promena24h: -10 },
          // Metrike nije bilo pre 24 h: promena je nepoznata, ne „celih 4“.
          { kljuc: "nova", naziv: "Novo", vrednost: 4, promena24h: null },
        ]),
      );
    });

    test("bez reda starog 24 h nema promene ni za jednu metriku", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 10 * SAT, metrike: { porudzbine: 12 } });
      await dodajRed(s, s.wsA, { at: sada - SAT, metrike: { porudzbine: 15 } });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.poslednji?.metrike).toEqual([
        { kljuc: "porudzbine", naziv: "porudzbine", vrednost: 15, promena24h: null },
      ]);
    });

    test("red sa greškom između nije referenca: uzima se uspešan red od pre 24 h", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 40 * SAT, metrike: { porudzbine: 5 } });
      await dodajRed(s, s.wsA, {
        at: sada - 30 * SAT,
        greska: { kod: "http", poruka: "HTTP 500" },
      });
      await dodajRed(s, s.wsA, { at: sada - SAT, metrike: { porudzbine: 9 } });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.poslednji?.metrike[0]).toMatchObject({ vrednost: 9, promena24h: 4 });
    });

    test("naziv je oznaka sajta, a bez nje sâm ključ", async () => {
      const s = await napraviSvet();
      await dodajRed(s, s.wsA, {
        at: Date.now() - SAT,
        metrike: { a: 1, b: 2 },
        oznake: { b: "Be" },
      });
      const r = await citaj(s, s.ana, s.wsA);
      expect(r.poslednji?.metrike.map((m) => m.naziv).sort()).toEqual(["Be", "a"]);
    });

    test("poslednji uspeh je najnoviji red sa brojkama, ne najnoviji red", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 3 * SAT, metrike: { porudzbine: 5 } });
      await dodajRed(s, s.wsA, { at: sada - SAT, greska: { kod: "istek", poruka: "Puls nije odgovorio." } });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.poslednji?.at).toBe(sada - 3 * SAT);
      expect(r.poslednji?.metrike[0].vrednost).toBe(5);
      expect(r.greska).toMatchObject({ kod: "istek", uzastopno: 1, od: sada - SAT });
    });
  });

  describe("greške u nizu", () => {
    test("dve poslednje greške: broji se niz, `od` je početak niza, kod je najnovije greške", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 4 * SAT, metrike: { porudzbine: 5 } });
      const starijaGreska = sada - 2 * SAT;
      await dodajRed(s, s.wsA, { at: starijaGreska, greska: { kod: "http", poruka: "HTTP 500" } });
      await dodajRed(s, s.wsA, { at: sada - SAT, greska: { kod: "istek", poruka: "Puls nije odgovorio za 10 sekundi." } });

      const r = await citaj(s, s.ana, s.wsA, sada);

      expect(r.greska).toEqual({
        kod: "istek",
        poruka: "Puls nije odgovorio za 10 sekundi.",
        od: starijaGreska,
        uzastopno: 2,
      });
      // Poslednji uspeh je stariji od sat vremena: kartica je „zastala“.
      expect(r.poslednji?.at).toBe(sada - 4 * SAT);
      expect(r.zastao).toBe(true);
    });

    test("uspešan prolaz posle greške prekida niz: nema greške na kartici", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 3 * SAT, greska: { kod: "http", poruka: "HTTP 500" } });
      await dodajRed(s, s.wsA, { at: sada - 2 * SAT, greska: { kod: "http", poruka: "HTTP 500" } });
      await dodajRed(s, s.wsA, { at: sada - 60_000, metrike: { porudzbine: 7 } });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.greska).toBeNull();
      expect(r.zastao).toBe(false);
      expect(r.poslednji?.metrike[0].vrednost).toBe(7);
    });

    test("niz se računa od najnovijeg unazad: greška, uspeh, pa greška je niz od jedne", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 3 * SAT, greska: { kod: "mreza", poruka: "stara" } });
      await dodajRed(s, s.wsA, { at: sada - 2 * SAT, metrike: { porudzbine: 7 } });
      await dodajRed(s, s.wsA, { at: sada - SAT / 2, greska: { kod: "http", poruka: "HTTP 503" } });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.greska).toMatchObject({ kod: "http", uzastopno: 1, od: sada - SAT / 2 });
    });

    test("samo greške, nijedan uspeh: nema brojki, a kartica je „zastala“", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 2 * SAT, greska: { kod: "nije_json", poruka: "Odgovor nije ispravan JSON." } });
      await dodajRed(s, s.wsA, { at: sada - SAT, greska: { kod: "nije_json", poruka: "Odgovor nije ispravan JSON." } });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.poslednji).toBeNull();
      expect(r.greska).toMatchObject({ kod: "nije_json", uzastopno: 2, od: sada - 2 * SAT });
      expect(r.zastao).toBe(true);
    });
  });

  describe("zastarelo i zastalo", () => {
    test("„zastareo“ gleda `vreme` iz odgovora (sajt vraća staru brojku), „zastao“ gleda naš poziv", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, {
        at: sada - 60_000,
        vreme: sada - 30 * SAT,
        metrike: { porudzbine: 7 },
      });

      const r = await citaj(s, s.ana, s.wsA, sada);
      expect(r.poslednji?.zastareo).toBe(true);
      expect(r.zastao).toBe(false);
    });

    test("bez `vreme` zastarelost se računa od našeg poziva", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - 25 * SAT, metrike: { porudzbine: 7 } });
      expect((await citaj(s, s.ana, s.wsA, sada)).poslednji?.zastareo).toBe(true);

      const s2 = await napraviSvet();
      await dodajRed(s2, s2.wsA, { at: sada - 23 * SAT, metrike: { porudzbine: 7 } });
      expect((await citaj(s2, s2.ana, s2.wsA, sada)).poslednji?.zastareo).toBe(false);
    });

    test("„zastao“ prelazi na true tek posle sat vremena od poslednjeg uspeha", async () => {
      const s = await napraviSvet();
      const sada = Date.now();
      await dodajRed(s, s.wsA, { at: sada - SAT, metrike: { porudzbine: 7 } });
      expect((await citaj(s, s.ana, s.wsA, sada)).zastao).toBe(false);
      expect((await citaj(s, s.ana, s.wsA, sada + 1)).zastao).toBe(true);
    });
  });
});
