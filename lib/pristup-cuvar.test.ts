import { describe, expect, test } from "vitest";

import { proveriPristup, type IzvorniFajl } from "./pristup-cuvar";

const SERVER = `import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";\n`;

function fajl(putanja: string, tekst: string): IzvorniFajl {
  return { putanja, tekst };
}

function imenaPalih(fajlovi: IzvorniFajl[]): string[] {
  return proveriPristup(fajlovi).pale.map((p) => p.ime);
}

describe("čuvar pristupa", () => {
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
    // requireMembership(ctx) ovde nikad nije pozvan
    return "getAuthUserId";
  },
});`,
        ),
      ]),
    ).toEqual(["lazno"]);
  });

  test("prihvata postojeće provere direktno u telu", () => {
    const r = proveriPristup([
      fajl(
        "foo.ts",
        SERVER +
          `import { requireMembership, requireMembershipIn } from "./lib/auth";
import { getAuthUserId } from "@convex-dev/auth/server";
export const a = query({ args: {}, handler: async (ctx) => (await requireMembership(ctx)).workspaceId });
export const b = action({ args: {}, handler: async (ctx) => { await getAuthUserId(ctx); } });
export const c = mutation({ args: {}, handler: async (ctx, a) => { await requireMembershipIn(ctx, a.w); } });`,
      ),
    ]);
    expect(r.pale).toEqual([]);
    expect(r.proverene.map((f) => f.ime)).toEqual(["a", "b", "c"]);
  });

  test("prihvata pomoćnu funkciju iz istog fajla i uvezenu iz drugog", () => {
    const r = proveriPristup([
      fajl(
        "lib/kontekst.ts",
        `import { requireMembership } from "./auth";
export async function mojProstor(ctx: unknown) {
  return (await requireMembership(ctx)).workspaceId;
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
    ]);
    expect(r.pale).toEqual([]);
  });

  test("poziv interne funkcije koja proverava se računa, zakazivanje lanca ne", () => {
    const fajlovi = [
      fajl(
        "store.ts",
        SERVER +
          `import { requireMembership } from "./lib/auth";
export const kontekst = internalQuery({ args: {}, handler: async (ctx) => requireMembership(ctx) });
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
    expect(imenaPalih(fajlovi)).toEqual(["losa"]);
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
    ).toEqual({ proverene: [], javne: [], pale: [] });
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
});
