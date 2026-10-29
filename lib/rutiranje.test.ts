import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import {
  EKRANI,
  GLOBALNE_PUTANJE,
  HUB_PUTANJE,
  JA_PUTANJE,
  MODULI_PROJEKTA,
  modulUkljucen,
  REZERVISANI_SLUGOVI,
  ekranIzPutanje,
  jeGlobalnaPutanja,
  jeIspravanSlug,
  jeJaPutanja,
  jeLokalniHost,
  normalizujHost,
  odluciRutu,
  prefiksProjekta,
  proveriSlugProjekta,
  putanjaEkrana,
  putanjaZaPrelazak,
  type EkranZaPrelazak,
} from "./rutiranje";
import {
  MODULE_KEYS,
  activeHref,
  donjaTraka,
  donjaTrakaHub,
  ekranZaPrelazak,
  navSections,
  radSekcija,
  resolveScreen,
  vidljiveSekcije,
  type ModuleKey,
} from "../components/app/nav-items";

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
    // SPAJANJE (plan S07 §1.6): u projektu je `/poruke` ekran projekta; link
    // „Ja“ ide kroz `JaLink`, ne kroz `putanjaEkrana`. Hub `/projekti` se ne dira.
    ["/poruke", "/enigma-it", "/enigma-it/poruke"],
    ["/zadaci?filter=moji", "/enigma-it", "/enigma-it/zadaci?filter=moji"],
    ["/projekti", "/enigma-it", "/projekti"],
  ])("%s u %s → %s", (ekran, prefiks, ocekivano) => {
    expect(putanjaEkrana(ekran, prefiks)).toBe(ocekivano);
  });
});

describe("putanjaEkrana sa periodom (P4)", () => {
  const sedam = { range: "7d" } as const;
  test.each([
    ["/instagram", "/enigma-it", "/enigma-it/instagram?range=7d"],
    ["/instagram", "", "/instagram?range=7d"],
    ["/", "/enigma-it", "/enigma-it?range=7d"],
    ["/", "", "/?range=7d"],
    ["/analytics/sticanje?tab=x", "", "/analytics/sticanje?tab=x&range=7d"],
    ["/ads?campaignId=1#detalj", "/scanme", "/scanme/ads?campaignId=1&range=7d#detalj"],
    ["/ads#detalj", "", "/ads?range=7d#detalj"],
    ["/enigma-it/instagram", "/enigma-it", "/enigma-it/instagram?range=7d"],
  ])("%s u „%s“ → %s", (ekran, prefiks, ocekivano) => {
    expect(putanjaEkrana(ekran, prefiks, sedam)).toBe(ocekivano);
  });

  test("adresa koja već nosi period ostaje ista", () => {
    for (const ekran of ["/ads?range=90d", "/ads?from=2026-10-01&to=2026-10-15", "/ads?x=1&to=2026-10-15"]) {
      expect(putanjaEkrana(ekran, "", sedam)).toBe(ekran);
      expect(putanjaEkrana(ekran, "/scanme", sedam)).toBe(`/scanme${ekran}`);
    }
  });

  test("prilagođen raspon ide kao from/to", () => {
    expect(putanjaEkrana("/instagram", "", { from: "2026-10-01", to: "2026-10-15" })).toBe(
      "/instagram?from=2026-10-01&to=2026-10-15",
    );
  });

  test("podrazumevanih 28 d se ne piše, kao ni u adresi birača", () => {
    expect(putanjaEkrana("/instagram", "/enigma-it", { range: "28d" })).toBe("/enigma-it/instagram");
  });

  test("bez perioda je ponašanje isto kao ranije", () => {
    for (const [ekran, prefiks] of [["/leadovi?tab=overdue#red", "/scanme"], ["/", ""], ["/ads", "/x"]]) {
      expect(putanjaEkrana(ekran, prefiks, null)).toBe(putanjaEkrana(ekran, prefiks));
      expect(putanjaEkrana(ekran, prefiks, undefined)).toBe(putanjaEkrana(ekran, prefiks));
    }
  });

  test("globalne, spoljne putanje, sidra i hub se ne diraju", () => {
    for (const ekran of ["/login", "/privacy", "/r/abc", "/novi", "https://enigmait.rs/x", "//cdn.example.com/x", "#sadrzaj", "/logo.png"]) {
      expect(putanjaEkrana(ekran, "/enigma-it", sedam)).toBe(ekran);
      expect(putanjaEkrana(ekran, "", sedam)).toBe(ekran);
    }
  });

  test("povratni put ekrana ostaje isti i sa periodom", () => {
    const prefiks = prefiksProjekta("scanme", "hub");
    const adresa = putanjaEkrana("/instagram", prefiks, sedam);
    const [putanja] = adresa.split("?");
    expect(ekranIzPutanje(putanja, prefiks)).toBe("/instagram");
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
    for (const slug of ["login", "logout", "privacy", "cookies", "pozivnica", "deletion-status", "dev-ux", "novi", "svi", "hub", "admin", "static", "public", "projekti", "otvori", "moji-zadaci", "inbox", ...EKRANI]) {
      expect(REZERVISANI_SLUGOVI.has(slug), slug).toBe(true);
      expect(jeIspravanSlug(slug), slug).toBe(false);
    }
  });

  test("svaki ekran aplikacije je rezervisano ime", () => {
    const dir = fileURLToPath(new URL("../app/(app)/[projekat]/", import.meta.url));
    const ekrani = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("("))
      .map((d) => d.name)
      .sort();
    expect(ekrani).toEqual([...EKRANI].sort());
  });

  test("svaki folder ličnog nivoa (app/(app)/(ja)/) je putanja „Ja“ ili huba (SPAJANJE)", () => {
    const dir = fileURLToPath(new URL("../app/(app)/(ja)/", import.meta.url));
    const dozvoljene = new Set<string>([...JA_PUTANJE, ...HUB_PUTANJE]);
    const folderi = readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(folderi.length).toBeGreaterThan(0);
    for (const folder of folderi) expect(dozvoljene.has(folder), folder).toBe(true);
    // Svaka putanja „Ja“ ima svoju stranu.
    for (const ja of JA_PUTANJE) expect(folderi, ja).toContain(ja);
  });

  test("app/(app)/ nema strana van (ja) i [projekat] (hub se ne vraća na /)", () => {
    const dir = fileURLToPath(new URL("../app/(app)/", import.meta.url));
    const ulazi = readdirSync(dir, { withFileTypes: true });
    expect(ulazi.filter((d) => d.isFile()).map((d) => d.name)).toEqual(["layout.tsx"]);
    expect(ulazi.filter((d) => d.isDirectory()).map((d) => d.name).sort()).toEqual(["(ja)", "[projekat]"]);
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

describe("odluciRutu (ulaz: proxy, plan C02 §7.2)", () => {
  const panel = (pathname: string, search = "") =>
    odluciRutu({ pathname, search, panelSlug: "enigma-it", kolacicProjekat: undefined });
  const hub = (pathname: string, kolacic?: string, search = "") =>
    odluciRutu({ pathname, search, panelSlug: null, kolacicProjekat: kolacic });

  test("1. panel: / → rewrite na kontrolnu tablu projekta", () => {
    expect(panel("/")).toEqual({ tip: "rewrite", putanja: "/enigma-it" });
  });

  test("2. panel: /leadovi → rewrite, upit ostaje", () => {
    expect(panel("/leadovi", "?tab=map")).toEqual({ tip: "rewrite", putanja: "/enigma-it/leadovi?tab=map" });
    expect(panel("/leadovi/uvoz")).toEqual({ tip: "rewrite", putanja: "/enigma-it/leadovi/uvoz" });
  });

  test("3. panel: /<slug>/leadovi → redirect na kanonski oblik", () => {
    expect(panel("/enigma-it/leadovi")).toEqual({ tip: "redirect", putanja: "/leadovi" });
    expect(panel("/enigma-it/leadovi", "?tab=x")).toEqual({ tip: "redirect", putanja: "/leadovi?tab=x" });
  });

  test("4. panel: /<slug> → redirect na /", () => {
    expect(panel("/enigma-it")).toEqual({ tip: "redirect", putanja: "/" });
    expect(panel("/enigma-it", "?ig_code=a")).toEqual({ tip: "redirect", putanja: "/?ig_code=a" });
  });

  test("5. panel: prijava je globalna", () => {
    expect(panel("/login")).toEqual({ tip: "dalje" });
  });

  test("6. panel: tuđ projekat ide pod ovaj (pa 404), ne na drugi projekat", () => {
    expect(panel("/scanme/leadovi")).toEqual({ tip: "rewrite", putanja: "/enigma-it/scanme/leadovi" });
    // Prefiks koji samo počinje imenom projekta nije taj projekat.
    expect(panel("/enigma-itx")).toEqual({ tip: "rewrite", putanja: "/enigma-it/enigma-itx" });
  });

  test("7. hub: / ostaje Danas (dalje)", () => {
    expect(hub("/")).toEqual({ tip: "dalje" });
    expect(hub("/", "scanme")).toEqual({ tip: "dalje" });
  });

  test("8. hub: stara adresa sa kolačićem → poslednji projekat", () => {
    expect(hub("/leadovi", "scanme", "?tab=x")).toEqual({ tip: "redirect", putanja: "/scanme/leadovi?tab=x" });
    expect(hub("/analytics/uzivo", "enigma-it")).toEqual({ tip: "redirect", putanja: "/enigma-it/analytics/uzivo" });
  });

  test("9. hub: stara adresa bez kolačića → /", () => {
    expect(hub("/leadovi")).toEqual({ tip: "redirect", putanja: "/" });
  });

  test("10. hub: OAuth povratak bez kolačića čuva upit (ig_code)", () => {
    expect(hub("/settings", undefined, "?ig_code=abc")).toEqual({ tip: "redirect", putanja: "/?ig_code=abc" });
  });

  test("11. hub: neispravan ili rezervisan kolačić se ne koristi", () => {
    for (const kolacic of ["login", "A B", "", "leadovi", "../x"]) {
      expect(hub("/leadovi", kolacic), kolacic).toEqual({ tip: "redirect", putanja: "/" });
    }
  });

  test("12. hub: /<slug>/… prolazi (članstvo proverava layout)", () => {
    expect(hub("/scanme/leadovi")).toEqual({ tip: "dalje" });
    expect(hub("/enigma-it")).toEqual({ tip: "dalje" });
    expect(hub("/nepostoji/leadovi", "scanme")).toEqual({ tip: "dalje" });
  });

  test("13. hub: putanje huba van projekta prolaze", () => {
    expect(hub("/novi")).toEqual({ tip: "dalje" });
  });

  test("14. localhost je hub: odluka dobija panelSlug null", () => {
    // Razrešavač domena lokalni host ni ne pita (lib/panel-domen.test.ts).
    expect(hub("/enigma-it")).toEqual({ tip: "dalje" });
  });

  test("15. globalne putanje se ne diraju ni u panelu ni u hubu", () => {
    for (const p of ["/api/x", "/_next/x", "/r/x", "/pozivnica/t", "/deletion-status", "/privacy", "/cookies", "/dev-ux/x", "/logo.png", "/login"]) {
      expect(panel(p), p).toEqual({ tip: "dalje" });
      expect(hub(p, "scanme"), p).toEqual({ tip: "dalje" });
    }
  });

  test("16. greška upita domena = hub: stara adresa ide na projekat iz kolačića", () => {
    expect(hub("/leadovi", "enigma-it")).toEqual({ tip: "redirect", putanja: "/enigma-it/leadovi" });
  });

  test("17. hub: /poruke je „Ja“ (dalje), ne stara adresa ekrana (D3)", () => {
    expect(hub("/poruke", "scanme")).toEqual({ tip: "dalje" });
  });

  test("18. hub: /beleske?x=1 je „Ja“ (dalje)", () => {
    expect(hub("/beleske", "scanme", "?x=1")).toEqual({ tip: "dalje" });
  });

  test("19. hub: /moji-zadaci, /inbox, /projekti, /otvori prolaze", () => {
    for (const p of ["/moji-zadaci", "/inbox", "/projekti", "/otvori"]) {
      expect(hub(p, "scanme"), p).toEqual({ tip: "dalje" });
    }
  });

  test("20. hub: /zadaci sa kolačićem → /<slug>/zadaci", () => {
    expect(hub("/zadaci", "scanme")).toEqual({ tip: "redirect", putanja: "/scanme/zadaci" });
    expect(hub("/stranica/pagesux0001", "enigma-it", "?tab=mapa")).toEqual({
      tip: "redirect",
      putanja: "/enigma-it/stranica/pagesux0001?tab=mapa",
    });
  });

  test("21. hub: stari hub /svi i /hub → /projekti, upit ostaje", () => {
    expect(hub("/svi")).toEqual({ tip: "redirect", putanja: "/projekti" });
    expect(hub("/hub", "scanme", "?range=7d")).toEqual({ tip: "redirect", putanja: "/projekti?range=7d" });
  });

  test("22. panel: /poruke → rewrite /S/poruke (projektni čet)", () => {
    expect(panel("/poruke")).toEqual({ tip: "rewrite", putanja: "/enigma-it/poruke" });
  });

  test("23. panel: /moji-zadaci → rewrite /S/moji-zadaci (panel nema „Ja“, D4)", () => {
    expect(panel("/moji-zadaci")).toEqual({ tip: "rewrite", putanja: "/enigma-it/moji-zadaci" });
  });

  test("jeJaPutanja: / i putanje „Ja“, ne ekrani projekta", () => {
    for (const p of ["/", "/moji-zadaci", "/inbox", "/poruke", "/beleske", "/otvori"]) {
      expect(jeJaPutanja(p), p).toBe(true);
    }
    for (const p of ["/zadaci", "/leadovi", "/enigma-it/poruke", "/projekti"]) {
      expect(jeJaPutanja(p), p).toBe(false);
    }
  });

  test("svaki ekran je stara adresa u hubu i put pod projekat u panelu", () => {
    // Ekran koji je i „Ja“ (`poruke`, `beleske`) u hubu prolazi kao „Ja“
    // (testovi 17 i 18); u panelu je i on pod projektom.
    const ja: ReadonlySet<string> = new Set<string>(JA_PUTANJE);
    for (const ekran of EKRANI) {
      if (ja.has(ekran)) {
        expect(hub(`/${ekran}`, "scanme"), ekran).toEqual({ tip: "dalje" });
      } else {
        expect(hub(`/${ekran}`, "scanme"), ekran).toEqual({ tip: "redirect", putanja: `/scanme/${ekran}` });
      }
      expect(panel(`/${ekran}`), ekran).toEqual({ tip: "rewrite", putanja: `/enigma-it/${ekran}` });
    }
  });
});

describe("putanjaZaPrelazak (promena projekta čuva ekran, plan C02 §8.4)", () => {
  const scanme = { slug: "scanme", moduli: null };
  const prelaz = (ekran: string, cilj: { slug: string; moduli: string[] | null } = scanme) =>
    putanjaZaPrelazak({ ekran, cilj, ekranZa: ekranZaPrelazak });

  test("čuva ekran i podekran", () => {
    expect(prelaz("/analytics")).toBe("/scanme/analytics");
    expect(prelaz("/analytics/sticanje")).toBe("/scanme/analytics/sticanje");
    expect(prelaz("/leadovi/uvoz")).toBe("/scanme/leadovi/uvoz");
    expect(prelaz("/settings")).toBe("/scanme/settings");
  });

  test("kontrolna tabla je koren projekta, bez završne kose crte", () => {
    expect(prelaz("/")).toBe("/scanme");
  });

  test("skida upit i heš", () => {
    expect(prelaz("/leadovi?rezim=poziv&firma=abc#x")).toBe("/scanme/leadovi");
    expect(prelaz("/analytics#vrh")).toBe("/scanme/analytics");
  });

  test("ekran sa ID-jem iz drugog projekta pada na roditelja", () => {
    expect(prelaz("/leadovi/k5abc123")).toBe("/scanme/leadovi");
    expect(prelaz("/instagram/objave/1789")).toBe("/scanme/instagram");
    // Radni deo (SPAJANJE): stranica i oblast padaju na Dokumente.
    expect(prelaz("/stranica/pagesux0001")).toBe("/scanme/dokumenti");
    expect(prelaz("/dokumenti/areasux0001?tab=mapa")).toBe("/scanme/dokumenti");
  });

  test("radni deo čuva ekran, bez upita (SPAJANJE)", () => {
    expect(prelaz("/zadaci?filter=moji")).toBe("/scanme/zadaci");
    expect(prelaz("/puls?nedelja=1")).toBe("/scanme/puls");
    expect(prelaz("/korpa")).toBe("/scanme/korpa");
    // Radni deo je uvek uključen, i u projektu bez ijednog modula.
    expect(prelaz("/ideje", { slug: "klijent-doo", moduli: [] })).toBe("/klijent-doo/ideje");
  });

  test("nepoznat ekran vodi na kontrolnu tablu", () => {
    expect(prelaz("/nepostoji/nesto")).toBe("/scanme");
  });

  test("isključen modul vodi na kontrolnu tablu; tabla i podešavanja su uvek tu", () => {
    const samoLeadovi = { slug: "klijent-doo", moduli: ["leadovi"] };
    expect(prelaz("/analytics", samoLeadovi)).toBe("/klijent-doo");
    expect(prelaz("/instagram/objave/1789", samoLeadovi)).toBe("/klijent-doo");
    expect(prelaz("/leadovi/uvoz", samoLeadovi)).toBe("/klijent-doo/leadovi/uvoz");
    expect(prelaz("/settings", samoLeadovi)).toBe("/klijent-doo/settings");
    expect(prelaz("/napredak", samoLeadovi)).toBe("/klijent-doo/napredak");
    expect(prelaz("/", { slug: "klijent-doo", moduli: [] })).toBe("/klijent-doo");
  });

  test("rešavač se samo zove; pravilo modula ne zavisi od navigacije", () => {
    const pozvano: string[] = [];
    const ekranZa = (p: string): EkranZaPrelazak | undefined => {
      pozvano.push(p);
      return { href: "/x", modul: "oglasi" };
    };
    expect(putanjaZaPrelazak({ ekran: "/x?y=1", cilj: { slug: "b", moduli: ["oglasi"] }, ekranZa })).toBe("/b/x");
    expect(putanjaZaPrelazak({ ekran: "/x", cilj: { slug: "b", moduli: ["leadovi"] }, ekranZa })).toBe("/b");
    expect(pozvano).toEqual(["/x", "/x"]);
  });
});

describe("moduli projekta (C11)", () => {
  test("ključevi za isključivanje = moduli navigacije bez table i podešavanja", () => {
    expect([...MODULI_PROJEKTA].sort()).toEqual(
      MODULE_KEYS.filter((k) => k !== "tabla" && k !== "sistem").sort(),
    );
  });

  test("bez vrednosti su svi uključeni; tabla i podešavanja uvek", () => {
    expect(modulUkljucen(null, "oglasi")).toBe(true);
    expect(modulUkljucen(undefined, "oglasi")).toBe(true);
    expect(modulUkljucen(["leadovi"], "oglasi")).toBe(false);
    expect(modulUkljucen(["leadovi"], "leadovi")).toBe(true);
    expect(modulUkljucen([], "tabla")).toBe(true);
    expect(modulUkljucen([], "sistem")).toBe(true);
  });

  test("bočna traka: isključen modul nestaje, prazna grupa nestaje cela", () => {
    const samo = (lista: ModuleKey[]) => (m: ModuleKey) => modulUkljucen(lista, m);
    expect(vidljiveSekcije(() => true)).toEqual(navSections);
    const leadoviAnalitika = vidljiveSekcije(samo(["leadovi", "analitika"]));
    // SPAJANJE (plan S07 §1.6): grupa Rad je uvek prva i puna; posle nje samo
    // uključeni Enigmini moduli.
    expect(leadoviAnalitika[0]).toEqual(radSekcija);
    const enigmine = leadoviAnalitika.slice(1).flatMap((s) => s.items.map((i) => i.module));
    expect(enigmine).toEqual(["leadovi", "analitika"]);
    expect(leadoviAnalitika.map((s) => s.title)).not.toContain("Kanali");
    expect(leadoviAnalitika.map((s) => s.title)).not.toContain("Automatizacija");
    expect(leadoviAnalitika.map((s) => s.title)).not.toContain("Sadržaj");
    expect(leadoviAnalitika.map((s) => s.title)).toContain("Prodaja");
  });

  test("radni deo: uvek uključen, posmatrač od njega vidi samo Početnu (D7)", () => {
    expect(navSections[0]).toBe(radSekcija);
    expect(radSekcija.items.every((i) => i.module === "tabla")).toBe(true);
    const nista = vidljiveSekcije((m) => modulUkljucen([], m));
    expect(nista.map((s) => s.title)).toEqual(["Rad"]);
    expect(nista[0].items.map((i) => i.href)).toEqual(radSekcija.items.map((i) => i.href));
    const posmatrac = vidljiveSekcije(() => true, { radniDeo: false });
    expect(posmatrac[0].items.map((i) => i.href)).toEqual(["/"]);
    expect(posmatrac.slice(1)).toEqual(navSections.slice(1));
  });

  test("aktivna stavka: podekrani radnog dela padaju na roditelja", () => {
    expect(activeHref("/zadaci")).toBe("/zadaci");
    expect(activeHref("/puls")).toBe("/");
    expect(activeHref("/aktivnost")).toBe("/");
    expect(activeHref("/stranica/pagesux0001")).toBe("/dokumenti");
    expect(activeHref("/dokumenti/areasux0001")).toBe("/dokumenti");
    expect(activeHref("/korpa")).toBeUndefined();
  });

  test("ekran po opsegu: „/“ je Početna u projektu, a Danas u „Ja“", () => {
    expect(resolveScreen("/")?.title).toBe("Početna");
    expect(resolveScreen("/", "ja")?.title).toBe("Danas");
    expect(resolveScreen("/poruke")?.section).toBe("Rad");
    expect(resolveScreen("/poruke", "ja")?.section).toBe("Ja");
    expect(resolveScreen("/novi", "ja")?.parent?.href).toBe("/projekti");
    expect(resolveScreen("/stranica/x")?.parent?.href).toBe("/dokumenti");
    expect(resolveScreen("/korpa")?.parent).toBeUndefined();
  });

  test("donja traka u hubu (P15, D9): pet ćelija, opseg Ja, opseg projekta, bez projekata", () => {
    const ja = donjaTrakaHub({ opseg: "ja", slugTekuci: null, slugPoslednji: "scanme" });
    expect(ja.map((c) => c.kljuc)).toEqual(["danas", "projekat", "zadaci", "poruke", "vise"]);
    expect(ja.map((c) => c.href)).toEqual(["/", "/scanme", "/moji-zadaci", "/poruke", null]);
    expect(ja[1].slug).toBe("scanme");

    const projekat = donjaTrakaHub({ opseg: "projekat", slugTekuci: "enigma-it", slugPoslednji: "scanme" });
    expect(projekat.map((c) => c.href)).toEqual([
      "/",
      "/enigma-it",
      "/enigma-it/zadaci",
      "/enigma-it/poruke",
      null,
    ]);

    const bez = donjaTrakaHub({ opseg: "ja", slugTekuci: null, slugPoslednji: null });
    expect(bez).toHaveLength(5);
    expect(bez[1]).toMatchObject({ kljuc: "projekat", href: "/projekti", slug: null });
  });

  test("donja traka uvek ima tri ćelije; mesto isključenog popuni sledeći modul", () => {
    expect(donjaTraka(() => true).map((i) => i.href)).toEqual(["/", "/leadovi", "/instagram"]);
    const bezInstagrama = donjaTraka((m) => modulUkljucen(["leadovi", "novosti"], m));
    expect(bezInstagrama.map((i) => i.href)).toEqual(["/", "/leadovi", "/novosti"]);
    const samoTabla = donjaTraka((m) => modulUkljucen([], m));
    expect(samoTabla.map((i) => i.href)).toEqual(["/"]);
  });
});
