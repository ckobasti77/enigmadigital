# SPAJANJE S09: dopune lib/rutiranje.test.ts po planu S07 §1.6 (uče nove putanje, ništa se ne briše).
import sys
p = 'lib/rutiranje.test.ts'
s = open(p, encoding='utf-8').read()


def rep(a, b):
    global s
    if a not in s:
        sys.exit('NEMA: ' + a[:80])
    s = s.replace(a, b, 1)


rep('''import {
  EKRANI,
  GLOBALNE_PUTANJE,
  MODULI_PROJEKTA,''', '''import {
  EKRANI,
  GLOBALNE_PUTANJE,
  HUB_PUTANJE,
  JA_PUTANJE,
  MODULI_PROJEKTA,''')
rep('''  jeIspravanSlug,
  jeLokalniHost,''', '''  jeIspravanSlug,
  jeJaPutanja,
  jeLokalniHost,''')
rep('''import {
  MODULE_KEYS,
  donjaTraka,
  ekranZaPrelazak,
  navSections,
  vidljiveSekcije,
  type ModuleKey,
} from "../components/app/nav-items";''', '''import {
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
} from "../components/app/nav-items";''')

rep('''    ["/enigma-it", "/enigma-it", "/enigma-it"],
  ])("%s u %s → %s", (ekran, prefiks, ocekivano) => {''', '''    ["/enigma-it", "/enigma-it", "/enigma-it"],
    // SPAJANJE (plan S07 §1.6): u projektu je `/poruke` ekran projekta; link
    // „Ja“ ide kroz `JaLink`, ne kroz `putanjaEkrana`. Hub `/projekti` se ne dira.
    ["/poruke", "/enigma-it", "/enigma-it/poruke"],
    ["/zadaci?filter=moji", "/enigma-it", "/enigma-it/zadaci?filter=moji"],
    ["/projekti", "/enigma-it", "/projekti"],
  ])("%s u %s → %s", (ekran, prefiks, ocekivano) => {''')

rep('''"dev-ux", "novi", "svi", "hub", "admin", "static", "public", ...EKRANI]) {''',
    '''"dev-ux", "novi", "svi", "hub", "admin", "static", "public", "projekti", "otvori", "moji-zadaci", "inbox", ...EKRANI]) {''')

rep('''  test("svaka ruta najvišeg nivoa u app/ je globalna putanja ili rezervisana", () => {''', '''  test("svaki folder ličnog nivoa (app/(app)/(ja)/) je putanja „Ja“ ili huba (SPAJANJE)", () => {
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

  test("svaka ruta najvišeg nivoa u app/ je globalna putanja ili rezervisana", () => {''')

rep('''  test("7. hub: / ostaje „Svi projekti“", () => {''', '''  test("7. hub: / ostaje Danas (dalje)", () => {''')

rep('''  test("svaki ekran je stara adresa u hubu i put pod projekat u panelu", () => {
    for (const ekran of EKRANI) {
      expect(hub(`/${ekran}`, "scanme"), ekran).toEqual({ tip: "redirect", putanja: `/scanme/${ekran}` });
      expect(panel(`/${ekran}`), ekran).toEqual({ tip: "rewrite", putanja: `/enigma-it/${ekran}` });
    }
  });''', '''  test("17. hub: /poruke je „Ja“ (dalje), ne stara adresa ekrana (D3)", () => {
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
  });''')

rep('''    expect(prelaz("/instagram/objave/1789")).toBe("/scanme/instagram");
  });''', '''    expect(prelaz("/instagram/objave/1789")).toBe("/scanme/instagram");
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
  });''')

rep('''    const leadoviAnalitika = vidljiveSekcije(samo(["leadovi", "analitika"]));
    const stavke = leadoviAnalitika.flatMap((s) => s.items.map((i) => i.module));
    expect(stavke).toEqual(["tabla", "leadovi", "analitika"]);
    expect(leadoviAnalitika.map((s) => s.title)).not.toContain("Kanali");
    expect(leadoviAnalitika.map((s) => s.title)).not.toContain("Automatizacija");
  });''', '''    const leadoviAnalitika = vidljiveSekcije(samo(["leadovi", "analitika"]));
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
  });''')

rep('''  test("donja traka uvek ima tri ćelije; mesto isključenog popuni sledeći modul", () => {''', '''  test("donja traka u hubu (P15, D9): pet ćelija, opseg Ja, opseg projekta, bez projekata", () => {
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

  test("donja traka uvek ima tri ćelije; mesto isključenog popuni sledeći modul", () => {''')
open(p, 'w', encoding='utf-8').write(s)
print('ok')
