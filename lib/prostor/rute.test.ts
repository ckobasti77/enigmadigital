// SPAJANJE S08: rute radnog dela (plan S07 §4.1). Primenljivi slučajevi iz
// Devotion `apps/web/components/workspace/workspace-route.test.ts` (main @ c05c40f)
// su preneti po smislu; parsiranje `?view=…&startupId=…` se ne prenosi (P13).
import { describe, expect, test } from "vitest";

import type { Id } from "../../convex/_generated/dataModel";
import {
  ekranRute,
  hrefRute,
  hrefUProjektu,
  jaHref,
  jeJaRuta,
  karticaPodesavanja,
  opsegRute,
  pageArchiveFallbackRoute,
  pageBackRoute,
  rutaIzEkrana,
  rutaIzJa,
  rutaPosleProjekta,
  withPageTab,
  type JaRuta,
  type ProjektnaRuta,
} from "./rute";

const oblast = "k57areaaaaaaaaaaaaaaaaaaaa" as Id<"areas">;
const druga = "k57areabbbbbbbbbbbbbbbbbbbb" as Id<"areas">;
const stranica = "k57pageaaaaaaaaaaaaaaaaaaaa" as Id<"pages">;
const roditelj = "k57pagebbbbbbbbbbbbbbbbbbbb" as Id<"pages">;
const kanal = "k57chanaaaaaaaaaaaaaaaaaaaa" as Id<"chatChannels">;
const ideja = "k57ideaaaaaaaaaaaaaaaaaaaaa" as Id<"ideaNodes">;
const osoba = "k57profaaaaaaaaaaaaaaaaaaaa" as Id<"profiles">;

/** Sve vrste rute projekta, sa parametrima i bez njih. */
const PROJEKTNE: ProjektnaRuta[] = [
  { kind: "today" },
  { kind: "thoughts" },
  { kind: "activity" },
  { kind: "ideas" },
  { kind: "ideas", ideaId: ideja },
  { kind: "tasks" },
  { kind: "tasks", filter: "moji" },
  { kind: "tasks", profileId: osoba },
  { kind: "trash" },
  { kind: "trash", segment: "idea" },
  { kind: "trash", segment: "file" },
  { kind: "trash", segment: "recovered" },
  { kind: "settings" },
  { kind: "settings", tab: "oblasti" },
  { kind: "settings", tab: "ai" },
  { kind: "chat" },
  { kind: "chat", channelId: kanal },
  { kind: "puls" },
  { kind: "puls", weekStart: 1_761_000_000_000 },
  { kind: "area", areaId: oblast },
  { kind: "area", areaId: oblast, tab: "mapa" },
  { kind: "area", areaId: oblast, tab: "dokumenti" },
  { kind: "page", pageId: stranica },
  { kind: "page", pageId: stranica, tab: "mapa" },
];

const JA: JaRuta[] = [
  { kind: "me-today" },
  { kind: "me-tasks" },
  { kind: "me-inbox" },
  { kind: "me-chat" },
  { kind: "me-chat", channelId: kanal },
  { kind: "me-notes" },
];

function podeli(adresa: string): [string, string] {
  const i = adresa.indexOf("?");
  return i === -1 ? [adresa, ""] : [adresa.slice(0, i), adresa.slice(i)];
}

describe("ruta → adresa → ruta (povratni put)", () => {
  test("svaka ruta projekta se vraća ista", () => {
    for (const ruta of PROJEKTNE) {
      const [putanja, upit] = podeli(ekranRute(ruta));
      expect(rutaIzEkrana(putanja, upit), JSON.stringify(ruta)).toEqual(ruta);
    }
  });

  test("svaka ruta „Ja“ se vraća ista", () => {
    for (const ruta of JA) {
      const [putanja, upit] = podeli(jaHref(ruta));
      expect(rutaIzJa(putanja, upit), JSON.stringify(ruta)).toEqual(ruta);
    }
  });

  test("povratni put radi i kroz prefiks projekta u hubu", () => {
    for (const ruta of PROJEKTNE) {
      const adresa = hrefUProjektu("enigma-it", ruta);
      expect(adresa.startsWith("/enigma-it")).toBe(true);
      const [putanja, upit] = podeli(adresa);
      const bezPrefiksa = putanja === "/enigma-it" ? "/" : putanja.slice("/enigma-it".length);
      expect(rutaIzEkrana(bezPrefiksa, upit)).toEqual(ruta);
    }
  });
});

describe("adrese (P13)", () => {
  test("Ja nikad nema prefiks projekta", () => {
    expect(JA.map((r) => hrefRute(r, "/enigma-it"))).toEqual([
      "/",
      "/moji-zadaci",
      "/inbox",
      "/poruke",
      `/poruke?kanal=${kanal}`,
      "/beleske",
    ]);
  });

  test("projekat: prefiks u hubu, bez prefiksa u panelu", () => {
    expect(hrefRute({ kind: "today" }, "/enigma-it")).toBe("/enigma-it");
    expect(hrefRute({ kind: "today" }, "")).toBe("/");
    expect(hrefRute({ kind: "tasks", filter: "moji" }, "/enigma-it")).toBe(
      "/enigma-it/zadaci?filter=moji",
    );
    expect(hrefRute({ kind: "tasks", filter: "moji" }, "")).toBe("/zadaci?filter=moji");
    expect(hrefRute({ kind: "chat", channelId: kanal }, "")).toBe(`/poruke?kanal=${kanal}`);
    expect(hrefRute({ kind: "thoughts" }, "/scanme")).toBe("/scanme/beleske");
  });

  test("tačna imena putanja i parametara", () => {
    expect(ekranRute({ kind: "ideas", ideaId: ideja })).toBe(`/ideje?ideja=${ideja}`);
    expect(ekranRute({ kind: "puls", weekStart: 5 })).toBe("/puls?nedelja=5");
    expect(ekranRute({ kind: "activity" })).toBe("/aktivnost");
    expect(ekranRute({ kind: "trash", segment: "file" })).toBe("/korpa?vrsta=file");
    expect(ekranRute({ kind: "settings", tab: "lozinke" })).toBe("/settings?tab=lozinke");
    expect(ekranRute({ kind: "area", areaId: oblast, tab: "zadaci" })).toBe(
      `/dokumenti/${oblast}?tab=zadaci`,
    );
    expect(ekranRute({ kind: "page", pageId: stranica, tab: "mapa" })).toBe(
      `/stranica/${stranica}?tab=mapa`,
    );
  });

  test("Zadaci: „Svi“ se ne piše, osoba ima prednost nad filterom", () => {
    expect(ekranRute({ kind: "tasks", filter: "svi" })).toBe("/zadaci");
    expect(ekranRute({ kind: "tasks", filter: "moji", profileId: osoba })).toBe(
      `/zadaci?osoba=${osoba}`,
    );
  });

  test("Korpa: Stranice su podrazumevane i ne pišu se", () => {
    expect(ekranRute({ kind: "trash", segment: "page" })).toBe("/korpa");
  });
});

describe("čitanje adrese: nepoznato je podrazumevano (Devotion K07 E13)", () => {
  test("Zadaci: nepoznat filter = Svi; osoba ima prednost", () => {
    expect(rutaIzEkrana("/zadaci", "?filter=nesto")).toEqual({ kind: "tasks" });
    expect(rutaIzEkrana("/zadaci", `?filter=moji&osoba=${osoba}`)).toEqual({
      kind: "tasks",
      profileId: osoba,
    });
  });

  test("prazan parametar je kao da ga nema", () => {
    expect(rutaIzEkrana("/ideje", "?ideja=")).toEqual({ kind: "ideas" });
    expect(rutaIzEkrana("/poruke", "?kanal=%20")).toEqual({ kind: "chat" });
    expect(rutaIzJa("/poruke", "?kanal=")).toEqual({ kind: "me-chat" });
  });

  test("Korpa, Podešavanja, oblast i stranica: nepoznata kartica pada na podrazumevanu", () => {
    expect(rutaIzEkrana("/korpa", "?vrsta=sve")).toEqual({ kind: "trash" });
    expect(rutaIzEkrana("/settings", "?tab=integracije")).toEqual({ kind: "settings" });
    expect(rutaIzEkrana(`/dokumenti/${oblast}`, "?tab=nesto")).toEqual({
      kind: "area",
      areaId: oblast,
    });
    expect(rutaIzEkrana(`/stranica/${stranica}`, "?tab=dokument")).toEqual({
      kind: "page",
      pageId: stranica,
    });
  });

  test("Puls: nedelja mora biti pozitivan broj", () => {
    expect(rutaIzEkrana("/puls", "?nedelja=abc")).toEqual({ kind: "puls" });
    expect(rutaIzEkrana("/puls", "?nedelja=-4")).toEqual({ kind: "puls" });
  });

  test("ekrani van radnog dela i nepotpune adrese nisu ruta", () => {
    expect(rutaIzEkrana("/leadovi")).toBeNull();
    expect(rutaIzEkrana("/dokumenti")).toBeNull();
    expect(rutaIzEkrana("/stranica")).toBeNull();
    expect(rutaIzEkrana(`/dokumenti/${oblast}/visak`)).toBeNull();
    expect(rutaIzJa("/projekti")).toBeNull();
    expect(rutaIzJa("/moji-zadaci/x")).toBeNull();
  });

  test("ID u putanji ide kroz kodiranje u oba smera", () => {
    const cudan = "a b/c" as Id<"pages">;
    const adresa = ekranRute({ kind: "page", pageId: cudan });
    expect(adresa).toBe("/stranica/a%20b%2Fc");
    expect(rutaIzEkrana(adresa)).toEqual({ kind: "page", pageId: cudan });
  });
});

describe("opseg", () => {
  test("me-* je lični nivo, sve ostalo projekat", () => {
    for (const r of JA) {
      expect(jeJaRuta(r)).toBe(true);
      expect(opsegRute(r)).toBe("ja");
    }
    for (const r of PROJEKTNE) {
      expect(jeJaRuta(r)).toBe(false);
      expect(opsegRute(r)).toBe("projekat");
    }
  });
});

describe("Podešavanja: Devotion kartice → Enigmine", () => {
  test("opšte je Projekat, tim i pozivnice su Pristup, nepoznato nema karticu", () => {
    expect(karticaPodesavanja("opste")).toBe("projekat");
    expect(karticaPodesavanja("tim")).toBe("pristup");
    expect(karticaPodesavanja("pozivnice")).toBe("pristup");
    expect(karticaPodesavanja("oblasti")).toBe("oblasti");
    expect(karticaPodesavanja("lozinke")).toBe("lozinke");
    expect(karticaPodesavanja("nesto")).toBeUndefined();
    expect(karticaPodesavanja(null)).toBeUndefined();
  });
});

describe("prelazak u drugi projekat (Devotion workspaceRouteAfterStartupSwitch)", () => {
  test("iz „Ja“ se u projekat ulazi kroz početnu", () => {
    for (const r of JA) expect(rutaPosleProjekta(r)).toEqual({ kind: "today" });
  });

  test("čuva ekran, ali ne i ono što pripada starom projektu", () => {
    expect(rutaPosleProjekta({ kind: "chat", channelId: kanal })).toEqual({ kind: "chat" });
    expect(rutaPosleProjekta({ kind: "tasks", profileId: osoba })).toEqual({ kind: "tasks" });
    expect(rutaPosleProjekta({ kind: "tasks", filter: "moji" })).toEqual({
      kind: "tasks",
      filter: "moji",
    });
    expect(rutaPosleProjekta({ kind: "ideas", ideaId: ideja })).toEqual({ kind: "ideas" });
    expect(rutaPosleProjekta({ kind: "settings", tab: "oblasti" })).toEqual({
      kind: "settings",
      tab: "oblasti",
    });
    expect(rutaPosleProjekta({ kind: "trash", segment: "idea" })).toEqual({
      kind: "trash",
      segment: "idea",
    });
    expect(rutaPosleProjekta({ kind: "thoughts" })).toEqual({ kind: "thoughts" });
  });

  test("oblast, stranica, puls i aktivnost vode na početnu", () => {
    for (const r of [
      { kind: "area", areaId: oblast },
      { kind: "page", pageId: stranica },
      { kind: "puls" },
      { kind: "activity" },
    ] as ProjektnaRuta[]) {
      expect(rutaPosleProjekta(r)).toEqual({ kind: "today" });
    }
  });
});

describe("pomoćne rute stranice", () => {
  test("posle arhiviranja: roditeljska stranica, a bez nje oblast", () => {
    expect(pageArchiveFallbackRoute({ areaId: oblast, parentPageId: roditelj })).toEqual({
      kind: "page",
      pageId: roditelj,
    });
    expect(pageArchiveFallbackRoute({ areaId: oblast, parentPageId: null })).toEqual({
      kind: "area",
      areaId: oblast,
    });
  });

  test("nazad ide jedan nivo hijerarhije", () => {
    expect(pageBackRoute({ areaId: oblast, parentPageId: roditelj })).toEqual({
      kind: "page",
      pageId: roditelj,
    });
    expect(pageBackRoute({ areaId: oblast, parentPageId: null })).toEqual({
      kind: "area",
      areaId: oblast,
    });
  });

  test("razrešena stranica zadržava Mapu samo za istu stranicu", () => {
    expect(
      withPageTab({ kind: "page", pageId: stranica }, { kind: "page", pageId: stranica, tab: "mapa" }),
    ).toEqual({ kind: "page", pageId: stranica, tab: "mapa" });
    expect(
      withPageTab({ kind: "page", pageId: roditelj }, { kind: "page", pageId: stranica, tab: "mapa" }),
    ).toEqual({ kind: "page", pageId: roditelj });
    expect(withPageTab(null, { kind: "page", pageId: stranica, tab: "mapa" })).toBeNull();
  });

  test("razrešena oblast zadržava karticu samo za istu oblast", () => {
    expect(
      withPageTab({ kind: "area", areaId: oblast }, { kind: "area", areaId: oblast, tab: "mapa" }),
    ).toEqual({ kind: "area", areaId: oblast, tab: "mapa" });
    expect(
      withPageTab({ kind: "area", areaId: druga }, { kind: "area", areaId: oblast, tab: "mapa" }),
    ).toEqual({ kind: "area", areaId: druga });
  });
});
