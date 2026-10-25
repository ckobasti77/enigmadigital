/**
 * Pravila podešavanja projekta (`convex/lib/podesavanjaPravila.ts`, plan C10
 * §1.2): ista pravila čuvaju mutaciju i formu, pa se ovde proverava i šta se
 * upisuje (normalizovana vrednost), ne samo da li prolazi.
 */
import { describe, expect, test } from "vitest";

import {
  BUDZET_PODRAZUMEVANO,
  MAKS_SAJTOVA,
  pozitivnaGranica,
  proveriAdresuNaSajtu,
  proveriBudzet,
  proveriKratkiLinkoviBaza,
  proveriPikselId,
  proveriPosiljalacIme,
  proveriTajnu,
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

describe("integracije sajta (C12)", () => {
  test("piksel: 10–20 cifara, prazno briše", () => {
    expect(vrednost(proveriPikselId(" 1234567890123 "))).toBe("1234567890123");
    expect(vrednost(proveriPikselId(""))).toBeNull();
    expect(vrednost(proveriPikselId(null))).toBeNull();
    for (const los of ["123456789", "1".repeat(21), "12345abc901", "1234 567890"]) {
      expect(proveriPikselId(los).ok, los).toBe(false);
    }
  });

  test("kratki linkovi: samo https origin na domenu ovog projekta", () => {
    const domeni = ["panel.primer.rs"];
    expect(vrednost(proveriKratkiLinkoviBaza("https://panel.primer.rs/", domeni))).toBe(
      "https://panel.primer.rs",
    );
    expect(vrednost(proveriKratkiLinkoviBaza("HTTPS://PANEL.PRIMER.RS", domeni))).toBe(
      "https://panel.primer.rs",
    );
    expect(vrednost(proveriKratkiLinkoviBaza("", domeni))).toBeNull();
    for (const los of [
      "http://panel.primer.rs",
      "https://tudji.rs",
      "https://panel.primer.rs/r",
      "https://panel.primer.rs?x=1",
      "https://panel.primer.rs#a",
      "https://user:pass@panel.primer.rs",
      "https://panel.primer.rs:8443",
      "javascript:alert(1)",
      "panel.primer.rs",
    ]) {
      expect(proveriKratkiLinkoviBaza(los, domeni).ok, los).toBe(false);
    }
    expect(proveriKratkiLinkoviBaza("https://panel.primer.rs", []).ok).toBe(false);
  });

  test("adresa na sajtu: https, host (bez www.) je praćen sajt projekta", () => {
    const sajtovi = ["primer.rs"];
    expect(vrednost(proveriAdresuNaSajtu("https://www.primer.rs/api/revalidate", sajtovi))).toBe(
      "https://www.primer.rs/api/revalidate",
    );
    expect(vrednost(proveriAdresuNaSajtu("https://primer.rs/api/puls?v=1", sajtovi))).toBe(
      "https://primer.rs/api/puls?v=1",
    );
    expect(vrednost(proveriAdresuNaSajtu(null, sajtovi))).toBeNull();
    for (const los of [
      "http://primer.rs/api",
      "https://tudji.rs/api",
      "https://user:x@primer.rs/api",
      "https://primer.rs/api#x",
      `https://primer.rs/${"a".repeat(200)}`,
    ]) {
      expect(proveriAdresuNaSajtu(los, sajtovi).ok, los.slice(0, 40)).toBe(false);
    }
  });

  test("ime pošiljaoca: 2–60 znakova, bez znakova koji lome zaglavlje", () => {
    expect(vrednost(proveriPosiljalacIme("  ScanMe tim "))).toBe("ScanMe tim");
    expect(vrednost(proveriPosiljalacIme(""))).toBeNull();
    for (const los of ["A", "x".repeat(61), "Ime <a@b.rs>", 'Ime "x"', "Ime\nBcc: a@b.rs"]) {
      expect(proveriPosiljalacIme(los).ok, los).toBe(false);
    }
  });
});

describe("budžetske granice (C12)", () => {
  test("prazno = bez vrednosti projekta; brojevi i tekst sa zarezom", () => {
    expect(vrednost(proveriBudzet({}))).toEqual({});
    expect(
      vrednost(
        proveriBudzet({ minimum: "10,5", maksimum: 900, valuta: " rsd ", metaMaksDnevno: "50" }),
      ),
    ).toEqual({ minimum: 10.5, maksimum: 900, valuta: "RSD", metaMaksDnevno: 50 });
    expect(vrednost(proveriBudzet({ minimum: null, googleMaksDnevno: "" }))).toEqual({});
  });

  test("granice se proveravaju nad onim što zaista važi", () => {
    expect(proveriBudzet({ minimum: 100, maksimum: 50 }).ok).toBe(false);
    // Bez maksimuma važi podrazumevanih 5.000, pa minimum 6.000 ne prolazi.
    expect(proveriBudzet({ minimum: 6000 }).ok).toBe(false);
    expect(proveriBudzet({ metaMaksDnevno: 6000 }).ok).toBe(false);
    expect(proveriBudzet({ maksimum: 100, googleMaksDnevno: 101 }).ok).toBe(false);
    expect(proveriBudzet({ maksimum: 100, googleMaksDnevno: 100 }).ok).toBe(true);
    for (const los of [0, -5, 100_001, "abc", Number.NaN]) {
      expect(proveriBudzet({ minimum: los }).ok, String(los)).toBe(false);
    }
    expect(proveriBudzet({ valuta: "EU" }).ok).toBe(false);
    expect(proveriBudzet({ valuta: "E1R" }).ok).toBe(false);
    expect(BUDZET_PODRAZUMEVANO).toEqual({ minimum: 5, maksimum: 5000, valuta: "EUR" });
  });

  test("granica iz env-a: prazno, 0 i neispravno nisu dozvola", () => {
    expect(pozitivnaGranica(undefined)).toBeNull();
    expect(pozitivnaGranica("   ")).toBeNull();
    expect(pozitivnaGranica("0")).toBeNull();
    expect(pozitivnaGranica("-3")).toBeNull();
    expect(pozitivnaGranica("x")).toBeNull();
    expect(pozitivnaGranica("50")).toBe(50);
  });
});

describe("tajne (C12)", () => {
  test("dužina po vrsti, bez razmaka; poruka ne citira vrednost", () => {
    expect(vrednost(proveriTajnu("meta_capi_token", ` ${"t".repeat(20)} `))).toBe("t".repeat(20));
    expect(proveriTajnu("meta_capi_token", "t".repeat(19)).ok).toBe(false);
    expect(proveriTajnu("meta_capi_token", "t".repeat(513)).ok).toBe(false);
    expect(proveriTajnu("novosti_revalidate_secret", "s".repeat(16)).ok).toBe(true);
    expect(proveriTajnu("puls_token", "s".repeat(15)).ok).toBe(false);
    expect(proveriTajnu("puls_token", "s".repeat(257)).ok).toBe(false);
    const sRazmakom = proveriTajnu("puls_token", "tajna sa razmakom 1234");
    expect(sRazmakom.ok).toBe(false);
    if (!sRazmakom.ok) expect(sRazmakom.poruka).not.toContain("razmakom");
  });
});
