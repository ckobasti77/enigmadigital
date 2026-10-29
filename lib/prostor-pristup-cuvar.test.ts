import { describe, expect, test } from "vitest";

import { proveriProstor } from "./prostor-pristup-cuvar";

const zaglavlje = `import { projekatQuery, prijavljenQuery } from "../lib/projekat";\n`;

function pravila(tekst: string, putanja = "prostor/x.ts") {
  return proveriProstor({ putanja, tekst }).map((n) => n.pravilo);
}

describe("čuvar pristupa radnog dela", () => {
  test("P1: projektni omotač mora da nosi uloga urednik ili owner", () => {
    expect(pravila(`${zaglavlje}export const a = projekatQuery({ uloga: "urednik", args: {}, handler: async () => null });`)).toEqual([]);
    expect(pravila(`${zaglavlje}export const a = projekatQuery({ uloga: "owner", args: {}, handler: async () => null });`)).toEqual([]);
    expect(pravila(`${zaglavlje}export const a = projekatQuery({ args: {}, handler: async () => null });`)).toEqual(["P1"]);
    expect(pravila(`${zaglavlje}export const a = projekatQuery({ uloga: "client_viewer", args: {}, handler: async () => null });`)).toEqual(["P1"]);
    // Lični omotač nema ulogu.
    expect(pravila(`${zaglavlje}export const a = prijavljenQuery({ args: {}, handler: async () => null });`)).toEqual([]);
    // Preimenovan uvoz se i dalje prepoznaje.
    expect(pravila(`import { projekatMutation as pm } from "../lib/projekat";\nexport const a = pm({ args: {}, handler: async () => null });`)).toEqual(["P1"]);
  });

  test("P2: nema `// javno:` u radnom delu", () => {
    expect(pravila(`// javno: probni razlog\nexport const a = 1;`)).toEqual(["P2"]);
  });

  test("P3: `.unique()` nad members pada, nad drugim tabelama ne", () => {
    expect(pravila(`async function f(ctx) { return await ctx.db.query("members").withIndex("by_user", (q) => q).unique(); }`)).toEqual(["P3"]);
    expect(pravila(`async function f(ctx) { return await ctx.db.query("members").withIndex("by_user", (q) => q).first(); }`)).toEqual([]);
    expect(pravila(`async function f(ctx) { return await ctx.db.query("profiles").withIndex("by_userId", (q) => q).unique(); }`)).toEqual([]);
  });

  test("P4 i P5: role admin i Devotion tabele", () => {
    expect(pravila(`const x = profile.role === "admin";`)).toEqual(["P4"]);
    expect(pravila(`const x = "admin" !== actor.profile.role;`)).toEqual(["P4"]);
    expect(pravila(`ctx.db.query("startupMembers");`)).toEqual(["P5"]);
    expect(pravila(`ctx.db.get("startups", id);`)).toEqual(["P5"]);
    expect(pravila(`const vrsta = "startup";`)).toEqual([]);
  });
});
