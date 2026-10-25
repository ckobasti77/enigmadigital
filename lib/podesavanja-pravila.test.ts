/**
 * Pravila podešavanja projekta (`convex/lib/podesavanjaPravila.ts`, plan C10
 * §1.2): ista pravila čuvaju mutaciju i formu, pa se ovde proverava i šta se
 * upisuje (normalizovana vrednost), ne samo da li prolazi.
 */
import { describe, expect, test } from "vitest";

import {
  MAKS_SAJTOVA,
  proveriBoju,
  proveriDomen,
  proveriIme,
  proveriKratkoIme,
  proveriModule,
  proveriMozakPolje,
  proveriSajt,
  proveriSajtove,
  proveriSliku,
} from "../convex/lib/podesavanjaPravila";
import { MODULI_PROJEKTA } from "../convex/lib/moduli";
import { PREDLOZI_BOJA, izvediBojuProjekta } from "./boja-projekta";
import { predloziSlug } from "./slug-predlog";

const vrednost = <T>(p: { ok: true; vrednost: T } | { ok: false; poruka: string }) =>
  p.ok ? p.vrednost : `GREŠKA: ${p.poruka}`;

describe("ime i kratko ime", () => {
  test("ime: 2–60 znakova posle trim-a", () => {
    expect(vrednost(proveriIme("  Enigma IT "))).toBe("Enigma IT");
    expect(proveriIme("E").ok).toBe(false);
    expect(proveriIme("   ").ok).toBe(false);
    expect(proveriIme("x".repeat(60)).ok).toBe(true);
    expect(proveriIme("x".repeat(61)).ok).toBe(false);
  });

  test("kratko ime: do 24 znaka, prazno briše", () => {
    expect(vrednost(proveriKratkoIme(" Enigma "))).toBe("Enigma");
    expect(vrednost(proveriKratkoIme(""))).toBeNull();
    expect(vrednost(proveriKratkoIme(null))).toBeNull();
    expect(proveriKratkoIme("x".repeat(25))).toEqual({
      ok: false,
      poruka: "Kratko ime može imati najviše 24 znaka.",
    });
  });
});

describe("boja", () => {
  test("#rrggbb, mala slova; prazno briše", () => {
    expect(vrednost(proveriBoju(" #22C55E "))).toBe("#22c55e");
    expect(vrednost(proveriBoju(""))).toBeNull();
    expect(vrednost(proveriBoju(null))).toBeNull();
  });

  test.each(["22c55e", "#2c5", "#22c55", "#22c55eff", "#gggggg", "rgb(1,2,3)"])(
    "odbija %s",
    (ulaz) => {
      expect(proveriBoju(ulaz)).toEqual({ ok: false, poruka: "Boja mora biti u obliku #rrggbb." });
    },
  );

  test("predlozi boja prolaze kontrast bez pomeranja", () => {
    for (const boja of PREDLOZI_BOJA) {
      expect(proveriBoju(boja).ok).toBe(true);
      expect(izvediBojuProjekta(boja)?.boja).toBe(boja);
    }
  });
});

describe("domen panela", () => {
  test("samo host: mala slova, bez završne tačke", () => {
    expect(vrednost(proveriDomen("Digital.EnigmaIT.rs"))).toBe("digital.enigmait.rs");
    expect(vrednost(proveriDomen("panel.primer.rs."))).toBe("panel.primer.rs");
    expect(vrednost(proveriDomen("xn--80ak6aa92e.xn--90a3ac"))).toBe("xn--80ak6aa92e.xn--90a3ac");
  });

  test.each([
    "https://panel.primer.rs",
    "panel.primer.rs/leadovi",
    "panel.primer.rs:3000",
    "ana@primer.rs",
    "panel primer.rs",
    "primer",
    "-panel.primer.rs",
    "panel-.primer.rs",
    "panel..primer.rs",
    "localhost",
    "panel.localhost",
    "127.0.0.1",
    "",
  ])("odbija %s", (ulaz) => {
    expect(proveriDomen(ulaz).ok).toBe(false);
  });

  test("predugačak domen se odbija", () => {
    const oznaka = "a".repeat(63);
    expect(proveriDomen(`${oznaka}.${oznaka}.${oznaka}.${oznaka}.rs`).ok).toBe(false);
  });
});

describe("sajtovi", () => {
  test("jedan sajt: skida www.", () => {
    expect(vrednost(proveriSajt("WWW.EnigmaIT.rs"))).toBe("enigmait.rs");
    expect(proveriSajt("https://enigmait.rs").ok).toBe(false);
  });

  test("spisak: bez duplikata, najviše 20", () => {
    expect(vrednost(proveriSajtove(["enigmait.rs", "www.enigmait.rs", "scanme.rs"]))).toEqual([
      "enigmait.rs",
      "scanme.rs",
    ]);
    const dvadeset = Array.from({ length: MAKS_SAJTOVA }, (_, i) => `sajt${i}.rs`);
    expect(proveriSajtove(dvadeset).ok).toBe(true);
    expect(proveriSajtove([...dvadeset, "jos.rs"]).ok).toBe(false);
    const los = proveriSajtove(["enigmait.rs", "nije sajt"]);
    expect(los.ok).toBe(false);
  });
});

describe("moduli", () => {
  test("null = svi; ceo skup se upisuje kao null", () => {
    expect(vrednost(proveriModule(null))).toBeNull();
    expect(vrednost(proveriModule([...MODULI_PROJEKTA]))).toBeNull();
  });

  test("redosled i duplikati ne menjaju zapis", () => {
    expect(vrednost(proveriModule(["analitika", "leadovi", "leadovi"]))).toEqual([
      "leadovi",
      "analitika",
    ]);
    expect(vrednost(proveriModule([]))).toEqual([]);
  });

  test("nepoznat modul i moduli koji se ne isključuju se odbijaju", () => {
    for (const los of ["nepoznat", "tabla", "sistem"]) {
      expect(proveriModule(["leadovi", los])).toEqual({ ok: false, poruka: "Nepoznat modul." });
    }
  });
});

describe("mozak", () => {
  test("do 4.000 znakova; prazno briše", () => {
    expect(vrednost(proveriMozakPolje("  ponuda "))).toBe("ponuda");
    expect(vrednost(proveriMozakPolje("   "))).toBeNull();
    expect(proveriMozakPolje("x".repeat(4000)).ok).toBe(true);
    expect(proveriMozakPolje("x".repeat(4001))).toEqual({
      ok: false,
      poruka: "Najviše 4.000 znakova.",
    });
  });
});

describe("slike brenda", () => {
  test("logo: PNG, JPG, WebP do 512 KB; bez SVG-a", () => {
    expect(proveriSliku("logo", { contentType: "image/png", size: 1000 }).ok).toBe(true);
    expect(proveriSliku("logo", { contentType: "image/webp", size: 512 * 1024 }).ok).toBe(true);
    expect(proveriSliku("logo", { contentType: "image/png", size: 512 * 1024 + 1 }).ok).toBe(false);
    expect(proveriSliku("logo", { contentType: "image/svg+xml", size: 100 }).ok).toBe(false);
    expect(proveriSliku("logo", { contentType: undefined, size: 100 }).ok).toBe(false);
    expect(proveriSliku("logo", { contentType: "image/png", size: 0 }).ok).toBe(false);
  });

  test("ikonica: PNG ili ICO do 128 KB", () => {
    expect(proveriSliku("favicon", { contentType: "image/x-icon", size: 4000 }).ok).toBe(true);
    expect(proveriSliku("favicon", { contentType: "image/vnd.microsoft.icon", size: 4000 }).ok).toBe(true);
    expect(proveriSliku("favicon", { contentType: "image/jpeg", size: 4000 }).ok).toBe(false);
    expect(proveriSliku("favicon", { contentType: "image/png", size: 128 * 1024 + 1 }).ok).toBe(false);
  });
});

describe("predlog adrese u čarobnjaku", () => {
  test.each([
    ["ScanMe", "scanme"],
    ["Enigma IT", "enigma-it"],
    ["Đorđe & Sinovi d.o.o.", "djordje-sinovi-d-o-o"],
    ["  Čačak — Šabac  ", "cacak-sabac"],
    ["!!!", ""],
  ])("%s → %s", (ime, slug) => {
    expect(predloziSlug(ime)).toBe(slug);
  });

  test("najviše 40 znakova, bez crtice na kraju", () => {
    const s = predloziSlug(`${"a".repeat(39)} b`);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});
