import { describe, expect, test } from "vitest";

import { convexPreskace, proveriPristup, type IzvorniFajl } from "./pristup-cuvar";

const SERVER = `import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";\n`;

function fajl(putanja: string, tekst: string): IzvorniFajl {
  return { putanja, tekst };
}

function imenaPalih(fajlovi: IzvorniFajl[]): string[] {
  return proveriPristup(fajlovi).pale.map((p) => p.ime);
}

describe("čuvar pristupa (strogi, od C07)", () => {
  test("pada na javnoj funkciji bez provere", () => {
    const r = proveriPristup([
      fajl(
        "foo.ts",
        SERVER +
          `export const procitaj = query({
  args: {},
  handler: async (ctx) => ctx.db.query("leadCompanies").take(10),
});`,
      ),
    ]);
    expect(r.pale).toHaveLength(1);
    expect(r.pale[0]).toMatchObject({ ime: "procitaj", vrsta: "query", linija: 2 });
  });

  test("prolazi sa `// javno: <razlog>` u liniji iznad", () => {
    const r = proveriPristup([
      fajl(
        "foo.ts",
        SERVER +
          `// javno: javni blog čita samo objavljene postove
export const objave = query({ args: {}, handler: async () => [] });`,
      ),
    ]);
    expect(r.pale).toEqual([]);
    expect(r.javne[0]).toMatchObject({
      ime: "objave",
      obrazlozenje: "javni blog čita samo objavljene postove",
    });
  });

  test("`// javno:` bez razloga ili dve linije iznad ne važi", () => {
    expect(
      imenaPalih([
        fajl(
          "foo.ts",
          SERVER +
            `// javno:
export const a = query({ args: {}, handler: async () => null });

// javno: razlog postoji, ali nije u liniji tačno iznad
/** dokumentacija između */
export const b = query({ args: {}, handler: async () => null });`,
        ),
      ]),
    ).toEqual(["a", "b"]);
  });

  test("ime provere u komentaru ili stringu nije provera", () => {
    expect(
      imenaPalih([
        fajl(
          "foo.ts",
          SERVER +
            `export const lazno = mutation({
  args: {},
  handler: async () => {
    // proveriClanstvo(ctx) ovde nikad nije pozvan
    return "getAuthUserId";
  },
});`,
        ),
      ]),
    ).toEqual(["lazno"]);
  });

  // Ulazi tri testa ispod su isti kao u čuvaru iz C01, koji je priznavao
  // proveru po imenu (nekadašnji requireMembership / requireMembershipIn,
  // ovde neutralno ime `proveriClanstvo`, i getAuthUserId). Od C07 ime provere
  // više ne važi kao provera: sirova registracija pada (plan C02 §9).

  test("ime provere u telu više ne važi: sirova registracija pada", () => {
    const r = proveriPristup([
      fajl(
        "foo.ts",
        SERVER +
          `import { proveriClanstvo, proveriClanstvoU } from "./lib/auth";
import { getAuthUserId } from "@convex-dev/auth/server";
export const a = query({ args: {}, handler: async (ctx) => (await proveriClanstvo(ctx)).workspaceId });
export const b = action({ args: {}, handler: async (ctx) => { await getAuthUserId(ctx); } });
export const c = mutation({ args: {}, handler: async (ctx, a) => { await proveriClanstvoU(ctx, a.w); } });`,
      ),
    ]);
    expect(r.omotacem).toEqual([]);
    expect(r.pale.map((p) => [p.ime, p.vrsta])).toEqual([
      ["a", "query"],
      ["b", "action"],
      ["c", "mutation"],
    ]);
    expect(r.pale[0].razlog).toMatch(/omotača/);
  });

  test("pomoćna funkcija iz istog fajla ili uvezena ne spasava sirovu registraciju", () => {
    expect(
      imenaPalih([
        fajl(
          "lib/kontekst.ts",
          `import { proveriClanstvo } from "./auth";
export async function mojProstor(ctx: unknown) {
  return (await proveriClanstvo(ctx)).workspaceId;
}`,
        ),
        fajl(
          "foo.ts",
          SERVER +
            `import { mojProstor } from "./lib/kontekst";
const lokalna = async (ctx: unknown) => mojProstor(ctx);
export const a = query({ args: {}, handler: async (ctx) => lokalna(ctx) });
export const b = query({ args: {}, handler: async (ctx) => mojProstor(ctx) });`,
        ),
      ]),
    ).toEqual(["a", "b"]);
  });

  test("poziv interne funkcije koja proverava ne spasava sirovu registraciju", () => {
    const fajlovi = [
      fajl(
        "store.ts",
        SERVER +
          `import { proveriClanstvo } from "./lib/auth";
export const kontekst = internalQuery({ args: {}, handler: async (ctx) => proveriClanstvo(ctx) });
export const posao = internalMutation({ args: {}, handler: async (ctx) => {
  await ctx.scheduler.runAfter(0, internal.store.kontekst, {});
} });`,
      ),
      fajl(
        "akcije.ts",
        SERVER +
          `export const dobra = action({ args: {}, handler: async (ctx) => {
  await ctx.runQuery(internal.store.kontekst, {});
} });
export const losa = action({ args: {}, handler: async (ctx) => {
  await ctx.runMutation(internal.store.posao, {});
} });`,
      ),
    ];
    expect(imenaPalih(fajlovi)).toEqual(["dobra", "losa"]);
  });

  test("interne funkcije i pomoćne funkcije se ne proveravaju", () => {
    expect(
      proveriPristup([
        fajl(
          "foo.ts",
          SERVER +
            `export const unutra = internalQuery({ args: {}, handler: async () => null });
export async function pomoc() { return 1; }`,
        ),
      ]),
    ).toEqual({ omotacem: [], javne: [], pale: [] });
  });

  test("prepoznaje preimenovan uvoz registracije", () => {
    expect(
      imenaPalih([
        fajl(
          "foo.ts",
          `import { query as javniUpit } from "./_generated/server";
export const skriveno = javniUpit({ args: {}, handler: async () => null });`,
        ),
      ]),
    ).toEqual(["skriveno"]);
  });

  test("funkcija napravljena omotačem iz lib/projekat.ts je javna i proverena", () => {
    const r = proveriPristup([
      fajl("lib/projekat.ts", SERVER + "export const projekatQuery = 1;"),
      fajl(
        "leadovi.ts",
        `import { projekatQuery, projekatMutation as izmena, platformaMutation } from "./lib/projekat";
export const spisak = projekatQuery({ args: {}, handler: async () => [] });
export const sacuvaj = izmena({ uloga: "owner", args: {}, handler: async () => null });
export const novi = platformaMutation({ args: {}, handler: async () => null });`,
      ),
    ]);
    expect(r.pale).toEqual([]);
    expect(r.omotacem.map((f) => [f.ime, f.vrsta])).toEqual([
      ["spisak", "query"],
      ["sacuvaj", "mutation"],
      ["novi", "mutation"],
    ]);
  });

  test("isto ime uvezeno iz drugog fajla nije omotač", () => {
    expect(
      imenaPalih([
        fajl("lib/drugo.ts", "export const projekatQuery = (x: unknown) => x;"),
        fajl(
          "foo.ts",
          SERVER +
            `import { projekatQuery } from "./lib/drugo";
export const lazno = projekatQuery({ args: {}, handler: async () => null });
export const sirovo = query({ args: {}, handler: async () => null });`,
        ),
      ]),
    ).toEqual(["sirovo"]);
  });

  test("fajlovi koje Convex ne deployuje (više tačaka u imenu) se preskaču", () => {
    expect(convexPreskace("projekatProba.pomoc.ts")).toBe(true);
    expect(convexPreskace("pristup.test.ts")).toBe(true);
    expect(convexPreskace("lib/projekat.ts")).toBe(false);
    expect(convexPreskace("projekti.ts")).toBe(false);
  });

  test("omotač (i preimenovan) i `// javno: <razlog>` prolaze, sirova funkcija pored njih pada", () => {
    const r = proveriPristup([
      fajl("lib/projekat.ts", SERVER + "export const projekatQuery = 1;"),
      fajl(
        "veze.ts",
        SERVER +
          `import { projekatAction as akcija, prijavljenQuery, platformaQuery } from "./lib/projekat";
export const sinhronizuj = akcija({ uloga: "owner", args: {}, handler: async () => null });
export const moji = prijavljenQuery({ args: {}, handler: async () => [] });
export const zdravlje = platformaQuery({ args: {}, handler: async () => [] });
// javno: OAuth povratak; projekat nosi potpisano stanje
export const povratak = action({ args: {}, handler: async () => null });
export const zaboravljena = mutation({ args: {}, handler: async () => null });`,
      ),
    ]);
    expect(r.omotacem.map((f) => [f.ime, f.vrsta, f.omotac])).toEqual([
      ["sinhronizuj", "action", "projekatAction"],
      ["moji", "query", "prijavljenQuery"],
      ["zdravlje", "query", "platformaQuery"],
    ]);
    expect(r.javne.map((f) => f.ime)).toEqual(["povratak"]);
    expect(r.pale.map((f) => f.ime)).toEqual(["zaboravljena"]);
  });
});
