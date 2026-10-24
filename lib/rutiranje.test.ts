import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  EKRANI,
  GLOBALNE_PUTANJE,
  REZERVISANI_SLUGOVI,
  ekranIzPutanje,
  jeGlobalnaPutanja,
  jeIspravanSlug,
  jeLokalniHost,
  normalizujHost,
  prefiksProjekta,
  proveriSlugProjekta,
  putanjaEkrana,
} from "./rutiranje";

describe("putanjaEkrana (izlaz: adresa linka)", () => {
  test.each([
    ["/leadovi", "/enigma-it", "/enigma-it/leadovi"],
    ["/", "/enigma-it", "/enigma-it"],
    ["/?tab=x", "/enigma-it", "/enigma-it?tab=x"],
    ["/leadovi?tab=overdue#red", "/scanme", "/scanme/leadovi?tab=overdue#red"],
    ["/leadovi/uvoz?import=imp_1", "/scanme", "/scanme/leadovi/uvoz?import=imp_1"],
    ["/leadovi", "", "/leadovi"],
    ["/privacy", "/enigma-it", "/privacy"],
    ["/login", "/enigma-it", "/login"],
    ["/r/abc", "/enigma-it", "/r/abc"],
    ["/novi", "/enigma-it", "/novi"],
    ["/logo.png", "/enigma-it", "/logo.png"],
    ["https://enigmait.rs/x", "/enigma-it", "https://enigmait.rs/x"],
    ["//cdn.example.com/x", "/enigma-it", "//cdn.example.com/x"],
    ["#sadrzaj", "/enigma-it", "#sadrzaj"],
    ["/enigma-it/leadovi", "/enigma-it", "/enigma-it/leadovi"],
    ["/enigma-it", "/enigma-it", "/enigma-it"],
  ])("%s u %s → %s", (ekran, prefiks, ocekivano) => {
    expect(putanjaEkrana(ekran, prefiks)).toBe(ocekivano);
  });
});

describe("ekranIzPutanje (izlaz: navigacija)", () => {
  test.each([
    ["/enigma-it/leadovi/uvoz", "/enigma-it", "/leadovi/uvoz"],
    ["/enigma-it", "/enigma-it", "/"],
    ["/enigma-it/", "/enigma-it", "/"],
    ["/leadovi", "", "/leadovi"],
    ["/", "", "/"],
    ["/scanme/leadovi", "/enigma-it", "/scanme/leadovi"],
    ["/enigma-itx/leadovi", "/enigma-it", "/enigma-itx/leadovi"],
  ])("%s sa prefiksom %s → %s", (pathname, prefiks, ocekivano) => {
    expect(ekranIzPutanje(pathname, prefiks)).toBe(ocekivano);
  });

  test("povratni put: ekran → link → ekran", () => {
    for (const ekran of ["/", "/leadovi", "/instagram/objave/123", "/analytics/uzivo"]) {
      const prefiks = prefiksProjekta("scanme", "hub");
      expect(ekranIzPutanje(putanjaEkrana(ekran, prefiks), prefiks)).toBe(ekran);
    }
  });
});

describe("prefiks i globalne putanje", () => {
  test("hub ima prefiks, panel nema", () => {
    expect(prefiksProjekta("enigma-it", "hub")).toBe("/enigma-it");
    expect(prefiksProjekta("enigma-it", "panel")).toBe("");
  });

  test("globalne putanje i fajlovi", () => {
    for (const p of ["/api/x", "/_next/static/a.js", "/login", "/privacy", "/cookies", "/pozivnica/t", "/deletion-status", "/r/x", "/dev-ux/leadovi", "/favicon.ico", "/assets/a.png"]) {
      expect(jeGlobalnaPutanja(p), p).toBe(true);
    }
    for (const p of ["/", "/leadovi", "/enigma-it/leadovi", "/novi"]) {
      expect(jeGlobalnaPutanja(p), p).toBe(false);
    }
  });
});

describe("pravila adrese projekta (P8)", () => {
  test("ispravne adrese", () => {
    for (const slug of ["enigma-it", "scanme", "ab", "klijent-doo-2", "a".repeat(40)]) {
      expect(proveriSlugProjekta(slug), slug).toEqual({ ok: true });
    }
  });

  test("neispravan oblik", () => {
    for (const slug of ["", "a", "a".repeat(41), "-a", "a-", "a--b", "Velika", "a b", "a_b", "č-x", "a.b"]) {
      expect(jeIspravanSlug(slug), slug).toBe(false);
    }
  });

  test("rezervisana imena: globalne putanje, hub, ekrani", () => {
    for (const slug of ["login", "logout", "privacy", "cookies", "pozivnica", "deletion-status", "dev-ux", "novi", "svi", "hub", "admin", "static", "public", ...EKRANI]) {
      expect(REZERVISANI_SLUGOVI.has(slug), slug).toBe(true);
      expect(jeIspravanSlug(slug), slug).toBe(false);
    }
  });

  test("svaki ekran aplikacije je rezervisano ime", () => {
    // Do C08 ekrani su direktno u app/(app); C08 ovde menja putanju na app/(app)/[projekat].
    const dir = fileURLToPath(new URL("../app/(app)/", import.meta.url));
    const ekrani = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
      .map((d) => d.name)
      .sort();
    expect(ekrani).toEqual([...EKRANI].sort());
  });

  test("svaka ruta najvišeg nivoa u app/ je globalna putanja ili rezervisana", () => {
    const dir = fileURLToPath(new URL("../app/", import.meta.url));
    const rute = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("(") && !d.name.startsWith("["))
      .map((d) => d.name);
    for (const ruta of rute) {
      expect(REZERVISANI_SLUGOVI.has(ruta), ruta).toBe(true);
    }
    for (const g of GLOBALNE_PUTANJE) expect(REZERVISANI_SLUGOVI.has(g)).toBe(true);
  });
});

describe("host (P5)", () => {
  test.each([
    ["digital.enigmait.rs", "digital.enigmait.rs"],
    ["Digital.EnigmaIT.rs:443", "digital.enigmait.rs"],
    ["digital.enigmait.rs.", "digital.enigmait.rs"],
    ["  localhost:3105 ", "localhost"],
    ["", null],
    [null, null],
    ["[::1]:3000", null],
    ["loš host.rs", null],
  ])("%s → %s", (ulaz, ocekivano) => {
    expect(normalizujHost(ulaz)).toBe(ocekivano);
  });

  test("lokalni hostovi su uvek hub", () => {
    expect(jeLokalniHost("localhost")).toBe(true);
    expect(jeLokalniHost("127.0.0.1")).toBe(true);
    expect(jeLokalniHost("enigma.localhost")).toBe(true);
    expect(jeLokalniHost("digital.enigmait.rs")).toBe(false);
  });
});
