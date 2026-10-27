import { describe, expect, test } from "vitest";
import { META_METRIC_CATALOG } from "../convex/lib/metaAdsCatalog";
import { GOOGLE_ADS_METRIC_CATALOG } from "../convex/lib/googleAdsCatalog";
import {
  MERE,
  dobraPromena,
  mera,
  veceJeBolje,
  type KljucMere,
} from "./mere";

describe("smer mera", () => {
  test("trošak i cena su `manje`: rast nije dobra vest", () => {
    const trosak: KljucMere[] = [
      "potrosnja",
      "cena_po_rezultatu",
      "cena_po_kliku",
      "cena_1000_prikaza",
      "cena_po_kljucnom_dogadjaju",
    ];
    for (const k of trosak) {
      expect(mera(k).smer).toBe("manje");
      expect(veceJeBolje(k)).toBe(false);
      expect(dobraPromena(k, 0.2)).toBe(false);
      expect(dobraPromena(k, -0.2)).toBe(true);
    }
  });

  test("rast rezultata i sesija je dobar", () => {
    expect(dobraPromena("rezultati", 0.2)).toBe(true);
    expect(dobraPromena("sesije", -0.1)).toBe(false);
    expect(veceJeBolje("sesije")).toBe(true);
  });

  test("neutralna mera i promena oko nule nemaju ocenu", () => {
    expect(dobraPromena("udeo_sesija", 0.3)).toBeNull();
    expect(dobraPromena("korisnici_uzivo", -0.3)).toBeNull();
    expect(veceJeBolje("udeo_sesija")).toBe(false);
    expect(dobraPromena("potrosnja", 0)).toBeNull();
    expect(dobraPromena("sesije", Number.NaN)).toBeNull();
  });
});

describe("zapis mere", () => {
  test("svaka mera ima naziv, kratko, definiciju i bar jedan izvor", () => {
    for (const [kljuc, m] of Object.entries(MERE)) {
      expect(m.kljuc).toBe(kljuc);
      expect(m.naziv.trim().length).toBeGreaterThan(0);
      expect(m.kratko.trim().length).toBeGreaterThan(0);
      expect(m.definicija.trim().length).toBeGreaterThan(0);
      expect(m.definicija.trim().endsWith(".")).toBe(true);
      expect(m.izvor.length).toBeGreaterThan(0);
    }
  });

  test("akronim ne ulazi u naziv (stoji u oblačiću)", () => {
    for (const m of Object.values(MERE)) {
      const akronim = "akronim" in m ? m.akronim : undefined;
      if (akronim) expect(m.naziv).not.toContain(akronim);
    }
  });

  test("ROAS i frekvencija su broj, ne procenat", () => {
    expect(mera("povracaj").format).toBe("broj");
    expect(mera("frekvencija").format).toBe("broj");
  });
});

/**
 * Smer se slaže sa katalozima platformi. Preslikavanje je malo i ručno:
 * katalog zna platformu, rečnik zna pojam.
 */
describe("slaganje sa katalozima", () => {
  const META: Array<[KljucMere, string]> = [
    ["potrosnja", "spend"],
    ["cena_po_kliku", "cpc"],
    ["cena_1000_prikaza", "cpm"],
    ["prikazi", "impressions"],
    ["doseg", "reach"],
    ["klikovi", "clicks"],
    ["frekvencija", "frequency"],
    ["stopa_klikova", "ctr"],
    ["zadrzavanje_3s", "hookRate"],
    ["gledanje_do_kraja", "holdRate"],
    ["povracaj", "roas"],
    ["cena_po_rezultatu", "costPerResult"],
    ["rezultati", "results"],
  ];
  const GOOGLE: Array<[KljucMere, string]> = [
    ["prikazi", "impressions"],
    ["klikovi", "clicks"],
    ["konverzije", "conversions"],
    ["potrosnja", "cost_micros"],
    ["stopa_klikova", "ctr"],
    ["cena_po_kliku", "average_cpc"],
    ["cena_1000_prikaza", "average_cpm"],
    ["cena_po_rezultatu", "cost_per_conversion"],
    ["povracaj", "conversions_value_per_cost"],
    ["udeo_u_pretrazi", "search_impression_share"],
    ["ocena_kvaliteta", "quality_score"],
  ];

  test.each(META)("Meta: %s ↔ %s", (kljuc, katalog) => {
    const def = META_METRIC_CATALOG[katalog];
    expect(def).toBeDefined();
    expect(veceJeBolje(kljuc)).toBe(def.higherIsBetter);
  });

  test.each(GOOGLE)("Google: %s ↔ %s", (kljuc, katalog) => {
    const def = GOOGLE_ADS_METRIC_CATALOG[katalog];
    expect(def).toBeDefined();
    expect(veceJeBolje(kljuc)).toBe(def.higherIsBetter);
  });
});
