import { describe, expect, test } from "vitest";

import { cistaPutanja } from "../../../convex/prostor/lib/veze";
import {
  adresaFirme,
  NASLOV_ZADATKA_MAX,
  opisVeze,
  skrati,
  vezaIzCekaTe,
  vezaIzKomentara,
  vezaZaFirmu,
} from "./veze-zadatka";

describe("veze novog zadatka (S23)", () => {
  test("komentar sa Instagrama: potpis sa @, odlomak u naslovu, ceo tekst u instrukcijama", () => {
    const tekst = "Koliko košta šišanje i farbanje za dugu kosu? Da li radite subotom posle 18h? Hvala unapred!";
    const v = vezaIzKomentara({ mreza: "instagram", autor: "ana_frizer", tekst });
    expect(v.naslov).toMatch(/^Odgovori @ana_frizer: „Koliko košta/);
    expect(v.naslov).toContain("…“");
    expect(v.instrukcije).toBe(`Komentar na Instagramu, @ana_frizer:\n„${tekst}“`);
    expect(v.izvor).toEqual({ vrsta: "komentar_ig", naslov: "@ana_frizer", putanja: "/instagram/komentari" });
    expect(cistaPutanja(v.izvor!.putanja)).toBe(v.izvor!.putanja);
  });

  test("komentar sa Facebooka bez teksta i bez imena", () => {
    const v = vezaIzKomentara({ mreza: "facebook", autor: "  ", tekst: "" });
    expect(v.naslov).toBe("Odgovori na komentar bez imena");
    expect(v.instrukcije).toBeUndefined();
    expect(v.izvor?.vrsta).toBe("komentar_fb");
    expect(v.izvor?.putanja).toBe("/facebook/komentari");
  });

  test("stavka „Čeka te“ zadržava naslov i putanju radnje; spoljna adresa se ne nudi", () => {
    expect(vezaIzCekaTe({ naslov: "3 firme bez broja", veza: "/leadovi?tab=rupe" })).toEqual({
      naslov: "3 firme bez broja",
      izvor: { vrsta: "ceka_te", naslov: "3 firme bez broja", putanja: "/leadovi?tab=rupe" },
    });
    expect(vezaIzCekaTe({ naslov: "Spolja", veza: "https://zlo.example" })).toBeNull();
    expect(vezaIzCekaTe({ naslov: "   ", veza: "/leadovi" })).toBeNull();
  });

  test("firma, opis veze i adresa profila", () => {
    const v = vezaZaFirmu({ id: "lc1", naziv: "Pekara Zora" });
    expect(opisVeze(v)).toBe("Zadatak za firmu Pekara Zora. Vidi se na profilu firme.");
    expect(adresaFirme("lc1")).toBe("/leadovi/lc1?tab=zadaci");
    expect(opisVeze(vezaIzKomentara({ mreza: "facebook", autor: "Marko", tekst: "Cena?" }))).toMatch(/^Komentar na Facebooku/);
    expect(opisVeze(vezaIzCekaTe({ naslov: "Uvoz čeka", veza: "/leadovi/uvoz" })!)).toMatch(/Čeka te/);
  });

  test("skrati: jedan red, granica sa „…“", () => {
    expect(skrati("  a   b \n c ", 10)).toBe("a b c");
    const dug = skrati("x".repeat(500), NASLOV_ZADATKA_MAX);
    expect(dug.length).toBe(NASLOV_ZADATKA_MAX);
    expect(dug.endsWith("…")).toBe(true);
  });
});
