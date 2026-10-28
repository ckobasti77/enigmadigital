/**
 * Rečnik UI pojmova (ULTRA O15, plan T08 §9.1): vrednosti su ljudske, sirova
 * vrednost nikad ne izlazi na ekran, prečica zavisi od platforme.
 */
import { describe, expect, test } from "vitest";

import {
  CILJ_KAMPANJE,
  DOGADJAJ_KONVERZIJE,
  GA4,
  IZVOR_SIGNALA,
  NAZIV_KANALA,
  NIVO_OGLASA,
  PLASMAN,
  POJAM,
  POZIV_NA_RADNJU,
  STATUS_KAMPANJE,
  VRSTA_FB_OBJAVE,
  VRSTA_OBJAVE,
  jeApple,
  naziv,
  oznakaPrecice,
  type Recnik,
} from "./recnik";
import { ZARGON } from "./recnik-cuvar";

const MAPE: Record<string, Recnik> = {
  VRSTA_OBJAVE,
  VRSTA_FB_OBJAVE,
  STATUS_KAMPANJE,
  CILJ_KAMPANJE,
  NIVO_OGLASA,
  DOGADJAJ_KONVERZIJE,
  POZIV_NA_RADNJU,
  PLASMAN,
  IZVOR_SIGNALA,
  POJAM,
  NAZIV_KANALA,
  ...Object.fromEntries(Object.entries(GA4).map(([k, v]) => [`GA4.${k}`, v])),
};

describe("vrednosti rečnika", () => {
  test("nijedna nije SCREAMING_SNAKE, snake_case ni žargon", () => {
    for (const [ime, mapa] of Object.entries(MAPE)) {
      for (const [kljuc, v] of Object.entries(mapa)) {
        const gde = `${ime}.${kljuc} = ${v}`;
        expect(v, gde).not.toMatch(/\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b/);
        expect(v, gde).not.toMatch(/\b[a-z]+_[a-z0-9_]+\b/);
        for (const z of ZARGON) expect(v.includes(z), `${gde} sadrži „${z}"`).toBe(false);
      }
    }
  });

  test("naziv() nikad ne vraća ključ API-ja", () => {
    for (const [ime, mapa] of Object.entries(MAPE)) {
      if (ime === "NAZIV_KANALA" || ime === "POJAM") continue;
      for (const kljuc of Object.keys(mapa)) {
        // Brojevi i imena proizvoda koja su ista u ključu i nazivu ne postoje.
        expect(naziv(mapa, kljuc), `${ime}.${kljuc}`).not.toBe(kljuc);
      }
    }
  });

  test("nepoznata vrednost dobija rezervu, ne sirov ključ", () => {
    expect(naziv(STATUS_KAMPANJE, "NEW_STATUS_2027")).toBe("Ostalo");
    expect(naziv(VRSTA_FB_OBJAVE, "nesto_novo", "Objava")).toBe("Objava");
    expect(naziv(GA4.delatnost, undefined, "—")).toBe("—");
    expect(naziv(GA4.delatnost, "", "—")).toBe("—");
  });

  test("poređenje ne zavisi od veličine slova (FB šalje mala slova)", () => {
    expect(naziv(VRSTA_FB_OBJAVE, "added_photos")).toBe("Slika");
    expect(naziv(VRSTA_FB_OBJAVE, "mobile_status_update")).toBe("Status");
    expect(naziv(NIVO_OGLASA, "ADSET")).toBe("Grupa oglasa");
  });

  test("primeri iz plana", () => {
    expect(naziv(VRSTA_OBJAVE, "TEXT_POST")).toBe("Tekst");
    expect(naziv(VRSTA_OBJAVE, "CAROUSEL_ALBUM")).toBe("Album");
    expect(naziv(STATUS_KAMPANJE, "ACTIVE")).toBe("Aktivna");
    expect(naziv(GA4.cuvanjePodataka, "FOURTEEN_MONTHS")).toBe("14 meseci");
    expect(naziv(GA4.nacinBrojanja, "ONCE_PER_EVENT")).toBe("Jednom po događaju");
    expect(naziv(GA4.delatnost, "BEAUTY_AND_FITNESS")).toBe("Lepota i fitnes");
    expect(naziv(DOGADJAJ_KONVERZIJE, "Lead")).toBe("Upit");
  });

  test("CILJ_KAMPANJE pokriva sve ključeve tri zatečene mape", () => {
    const zateceni = [
      "OUTCOME_LEADS", "LEADS", "OUTCOME_SALES", "SALES", "OUTCOME_TRAFFIC", "TRAFFIC",
      "OUTCOME_AWARENESS", "AWARENESS", "OUTCOME_ENGAGEMENT", "ENGAGEMENT",
      "OUTCOME_APP_PROMOTION", "APP_PROMOTION", "SEARCH", "PERFORMANCE_MAX",
    ];
    for (const k of zateceni) expect(Object.keys(CILJ_KAMPANJE), k).toContain(k);
    // Ime proizvoda se ne prevodi.
    expect(naziv(CILJ_KAMPANJE, "PERFORMANCE_MAX")).toBe("Performance Max");
  });

  test("nazivi kanala: imena proizvoda ostaju", () => {
    expect(NAZIV_KANALA.meta_ads).toBe("Meta Ads");
    expect(NAZIV_KANALA.google_ads).toBe("Google Ads");
    expect(NAZIV_KANALA.ga4).toBe("GA4");
  });
});

describe("oznaka prečice", () => {
  test("Windows i Linux pišu Ctrl, Mac ⌘", () => {
    expect(oznakaPrecice("Win32", "K")).toBe("Ctrl K");
    expect(oznakaPrecice("Windows", "K")).toBe("Ctrl K");
    expect(oznakaPrecice("Linux x86_64", "K")).toBe("Ctrl K");
    expect(oznakaPrecice("MacIntel", "K")).toBe("⌘K");
    expect(oznakaPrecice("macOS", "Enter")).toBe("⌘ Enter");
    expect(oznakaPrecice("Win32", "Enter")).toBe("Ctrl Enter");
  });

  test("bez platforme (server, hidratacija) je Ctrl", () => {
    expect(oznakaPrecice(undefined, "K")).toBe("Ctrl K");
    expect(jeApple(undefined)).toBe(false);
    expect(jeApple("iPhone")).toBe(true);
  });
});
