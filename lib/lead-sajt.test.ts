/**
 * C17 — čista pravila forme sa sajta projekta (`convex/lib/leadSajt.ts`):
 * koji origin sme da šalje, koja stranica se pamti, koji mejl je „domen firme“
 * i šta šema tela propušta. HTTP ruta se proverava u `convex/lead-sajt.test.ts`.
 */
import { describe, expect, test } from "vitest";

import {
  LEAD_SAJT_MAX_BAJTOVA,
  LEAD_SAJT_POLJA,
  PORUKA_EMAIL_ILI_TELEFON,
  domenFirmeIzMejla,
  dozvoljenOrigin,
  ispravanHttpsOrigin,
  leadSajtSchema,
  stranicaNaSajtu,
} from "../convex/lib/leadSajt";

const SAJTOVI = ["scanme.rs"];

describe("ispravanHttpsOrigin", () => {
  test("prima samo čist https origin", () => {
    expect(ispravanHttpsOrigin("https://scanme.rs")).toBe("https://scanme.rs");
    expect(ispravanHttpsOrigin("https://www.scanme.rs")).toBe("https://www.scanme.rs");
    expect(ispravanHttpsOrigin("https://scanme.rs:8443")).toBe("https://scanme.rs:8443");
  });

  test("odbija null, http, putanju, korisnika i smeće", () => {
    expect(ispravanHttpsOrigin(null)).toBeNull();
    expect(ispravanHttpsOrigin("null")).toBeNull();
    expect(ispravanHttpsOrigin("")).toBeNull();
    expect(ispravanHttpsOrigin("http://scanme.rs")).toBeNull();
    expect(ispravanHttpsOrigin("https://scanme.rs/cene")).toBeNull();
    expect(ispravanHttpsOrigin("https://scanme.rs/")).toBeNull();
    expect(ispravanHttpsOrigin("https://korisnik:lozinka@scanme.rs")).toBeNull();
    expect(ispravanHttpsOrigin("ftp://scanme.rs")).toBeNull();
    expect(ispravanHttpsOrigin("nije url")).toBeNull();
  });
});

describe("dozvoljenOrigin", () => {
  test("host sa sajtova projekta prolazi, sa www i bez", () => {
    expect(dozvoljenOrigin("https://scanme.rs", SAJTOVI)).toBe("https://scanme.rs");
    expect(dozvoljenOrigin("https://www.scanme.rs", SAJTOVI)).toBe("https://www.scanme.rs");
  });

  test("port se ne računa u host", () => {
    expect(dozvoljenOrigin("https://scanme.rs:8443", SAJTOVI)).toBe("https://scanme.rs:8443");
  });

  test("više sajtova: važi svaki", () => {
    const sajtovi = ["scanme.rs", "scanme.app"];
    expect(dozvoljenOrigin("https://scanme.app", sajtovi)).toBe("https://scanme.app");
    expect(dozvoljenOrigin("https://scanme.com", sajtovi)).toBeNull();
  });

  test("http, putanja i null su odbijeni", () => {
    expect(dozvoljenOrigin("http://scanme.rs", SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin("https://scanme.rs/cene", SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin(null, SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin("null", SAJTOVI)).toBeNull();
  });

  test("tuđ host, podsajt i lažnjaci nisu na spisku", () => {
    expect(dozvoljenOrigin("https://evil.example", SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin("https://app.scanme.rs", SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin("https://scanme.rs.evil.example", SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin("https://notscanme.rs", SAJTOVI)).toBeNull();
    expect(dozvoljenOrigin("https://evil.example", [])).toBeNull();
  });

  test("bez sajtova projekta ništa ne prolazi", () => {
    expect(dozvoljenOrigin("https://scanme.rs", [])).toBeNull();
  });
});

describe("stranicaNaSajtu", () => {
  test("stranica na sajtu projekta se pamti u celini", () => {
    expect(stranicaNaSajtu("https://scanme.rs/cene?paket=pro", SAJTOVI)).toBe(
      "https://scanme.rs/cene?paket=pro",
    );
    expect(stranicaNaSajtu("https://www.scanme.rs/", SAJTOVI)).toBe("https://www.scanme.rs/");
  });

  test("bez vrednosti, http, tuđ host, podsajt i smeće: null", () => {
    expect(stranicaNaSajtu(undefined, SAJTOVI)).toBeNull();
    expect(stranicaNaSajtu("http://scanme.rs/cene", SAJTOVI)).toBeNull();
    expect(stranicaNaSajtu("https://evil.example/scanme.rs", SAJTOVI)).toBeNull();
    expect(stranicaNaSajtu("https://blog.scanme.rs/", SAJTOVI)).toBeNull();
    expect(stranicaNaSajtu("nije url", SAJTOVI)).toBeNull();
    expect(stranicaNaSajtu("https://scanme.rs/", [])).toBeNull();
  });
});

describe("domenFirmeIzMejla", () => {
  test("firmin domen se vraća malim slovima", () => {
    expect(domenFirmeIzMejla("pera@firma.rs")).toBe("firma.rs");
    expect(domenFirmeIzMejla("Pera@FIRMA.RS")).toBe("firma.rs");
  });

  test("besplatni i ISP domeni nisu domen firme", () => {
    expect(domenFirmeIzMejla("pera@gmail.com")).toBeUndefined();
    expect(domenFirmeIzMejla("pera@Gmail.com")).toBeUndefined();
    expect(domenFirmeIzMejla("pera@yahoo.com")).toBeUndefined();
    expect(domenFirmeIzMejla("pera@eunet.rs")).toBeUndefined();
  });

  test("bez mejla ili bez domena: undefined", () => {
    expect(domenFirmeIzMejla(undefined)).toBeUndefined();
    expect(domenFirmeIzMejla("bez-at")).toBeUndefined();
    expect(domenFirmeIzMejla("pera@")).toBeUndefined();
  });
});

describe("leadSajtSchema", () => {
  test("najveće telo je 16 KiB", () => {
    expect(LEAD_SAJT_MAX_BAJTOVA).toBe(16384);
  });

  test("mejl se skraćuje i svodi na mala slova", () => {
    const r = leadSajtSchema.parse({ email: "  Mika@Firma.RS  " });
    expect(r.email).toBe("mika@firma.rs");
  });

  test("neispravan mejl i mejl koji nije tekst se odbijaju", () => {
    expect(leadSajtSchema.safeParse({ email: "nije-mejl" }).success).toBe(false);
    expect(leadSajtSchema.safeParse({ email: 12345 }).success).toBe(false);
  });

  test("treba email ili telefon, poruka greške je tačna", () => {
    for (const telo of [{}, { ime: "Pera" }, { poruka: "Zdravo" }]) {
      const r = leadSajtSchema.safeParse(telo);
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.map((i) => i.message)).toContain(PORUKA_EMAIL_ILI_TELEFON);
      }
    }
    expect(leadSajtSchema.safeParse({ telefon: "064 123 4567" }).success).toBe(true);
    expect(leadSajtSchema.safeParse({ email: "a@firma.rs" }).success).toBe(true);
  });

  test("eventId: 7 znakova pada, 8 prolazi, 64 prolazi, 65 pada", () => {
    const sa = (eventId: string) => leadSajtSchema.safeParse({ email: "a@firma.rs", eventId });
    expect(sa("abcdefg").success).toBe(false);
    expect(sa("abcdefgh").success).toBe(true);
    expect(sa("a".repeat(64)).success).toBe(true);
    expect(sa("a".repeat(65)).success).toBe(false);
    expect(sa("lead_12-AB").success).toBe(true);
    expect(sa("lead 1234").success).toBe(false);
    expect(sa("lead.1234").success).toBe(false);
  });

  test("klijent.ip prima IPv4 i IPv6, odbija sve ostalo", () => {
    const sa = (ip: string) => leadSajtSchema.safeParse({ email: "a@firma.rs", klijent: { ip } });
    expect(sa("203.0.113.7").success).toBe(true);
    expect(sa("2001:db8::1").success).toBe(true);
    expect(sa("abc").success).toBe(false);
    expect(sa("999.1.1.1").success).toBe(false);
    expect(sa("203.0.113.7, 10.0.0.1").success).toBe(false);
    expect(sa("").success).toBe(false);
  });

  test("nepoznato polje se odbija, i u utm i u klijent", () => {
    expect(leadSajtSchema.safeParse({ email: "a@firma.rs", nepoznato: 1 }).success).toBe(false);
    expect(leadSajtSchema.safeParse({ email: "a@firma.rs", workspaceId: "x" }).success).toBe(false);
    expect(
      leadSajtSchema.safeParse({ email: "a@firma.rs", utm: { source: "ig", drugo: "x" } }).success,
    ).toBe(false);
    expect(
      leadSajtSchema.safeParse({ email: "a@firma.rs", klijent: { ime: "x" } }).success,
    ).toBe(false);
  });

  test("stranica mora biti https adresa", () => {
    const sa = (stranica: string) => leadSajtSchema.safeParse({ email: "a@firma.rs", stranica });
    expect(sa("https://scanme.rs/cene").success).toBe(true);
    expect(sa("http://scanme.rs/cene").success).toBe(false);
    expect(sa("nije url").success).toBe(false);
  });

  test("saglasnost traži pravi boolean", () => {
    const sa = (saglasnost: unknown) => leadSajtSchema.safeParse({ email: "a@firma.rs", saglasnost });
    expect(sa({ marketing: true }).success).toBe(true);
    expect(sa({ marketing: false }).success).toBe(true);
    expect(sa({ marketing: "da" }).success).toBe(false);
    expect(sa({}).success).toBe(false);
  });

  test("granice dužine: prazno ime, predugačka poruka", () => {
    expect(leadSajtSchema.safeParse({ email: "a@firma.rs", ime: "   " }).success).toBe(false);
    expect(leadSajtSchema.safeParse({ email: "a@firma.rs", poruka: "x".repeat(2000) }).success).toBe(true);
    expect(leadSajtSchema.safeParse({ email: "a@firma.rs", poruka: "x".repeat(2001) }).success).toBe(false);
  });

  test("svako polje iz LEAD_SAJT_POLJA šema poznaje", () => {
    const sve = {
      ime: "Pera Perić",
      email: "pera@firma.rs",
      telefon: "064 123 4567",
      firma: "Pera doo",
      poruka: "Treba mi QR meni",
      stranica: "https://scanme.rs/cene",
      utm: { source: "ig", medium: "bio", campaign: "jesen", term: "qr", content: "a" },
      eventId: "lead-12345678",
      klijent: { ip: "203.0.113.7", userAgent: "Mozilla/5.0", fbp: "fb.1.1.2", fbc: "fb.1.1.abc" },
      saglasnost: { marketing: true },
    };
    expect(Object.keys(sve).sort()).toEqual([...LEAD_SAJT_POLJA].sort());
    expect(leadSajtSchema.safeParse(sve).success).toBe(true);
  });
});
