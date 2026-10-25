/// <reference types="vite/client" />
/**
 * Javni brend panel domena (`projekti.javniBrend`, plan C10 §2.2, E11):
 * radi bez prijave, ali vraća TAČNO ime, boju i logo, i to samo za host
 * mapiran na projekat koji nije arhiviran. Slug, ID, ikonica, sajtovi, mozak
 * i podešavanja nikad ne izlaze.
 */
import { describe, expect, test } from "vitest";

import { api } from "./_generated/api";
import { napraviSvet } from "./projekatTest.pomoc";

describe("javniBrend", () => {
  test("mapiran host: samo ime, boja i logo", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      const logo = await ctx.storage.store(new Blob(["logo"], { type: "image/png" }));
      const ikonica = await ctx.storage.store(new Blob(["ikonica"], { type: "image/png" }));
      await ctx.db.patch(s.wsB, {
        brend: { kratkoIme: "SM", boja: "#22c55e", logoStorageId: logo, faviconStorageId: ikonica },
        sajtovi: ["scanme.rs"],
        mozak: { ponuda: "QR meniji" },
        podesavanja: { pikselId: "1234567890" },
      });
      await ctx.db.insert("projekatDomeni", { host: "digital.scanme.rs", workspaceId: s.wsB, createdAt: 0 });
    });
    const brend = await s.t.query(api.projekti.javniBrend, { host: "Digital.ScanMe.rs:443" });
    expect(brend).not.toBeNull();
    expect(Object.keys(brend ?? {}).sort()).toEqual(["boja", "ime", "logoUrl"]);
    expect(brend).toMatchObject({ ime: "ScanMe", boja: "#22c55e" });
    expect(brend?.logoUrl).toMatch(/^https:\/\//);
    const tekst = JSON.stringify(brend);
    for (const tajno of ["scanme.rs\"", "QR meniji", "1234567890", "SM", s.wsB, "scanme\""]) {
      expect(tekst).not.toContain(tajno);
    }
  });

  test("projekat bez brenda: ime, a boja i logo su null", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("projekatDomeni", { host: "digital.enigmait.rs", workspaceId: s.wsA, createdAt: 0 });
    });
    expect(await s.t.query(api.projekti.javniBrend, { host: "digital.enigmait.rs" })).toEqual({
      ime: "Enigma IT",
      boja: null,
      logoUrl: null,
    });
  });

  test("nepoznat, lokalni, neispravan host i arhiviran projekat ne otkrivaju ništa", async () => {
    const s = await napraviSvet();
    await s.t.run(async (ctx) => {
      await ctx.db.insert("projekatDomeni", { host: "panel.klijent.rs", workspaceId: s.wsK, createdAt: 0 });
      await ctx.db.patch(s.wsK, { arhiviran: true });
    });
    for (const host of ["nepoznat.rs", "localhost:3000", "", "[::1]", "panel.klijent.rs"]) {
      expect(await s.t.query(api.projekti.javniBrend, { host })).toBeNull();
    }
  });
});
