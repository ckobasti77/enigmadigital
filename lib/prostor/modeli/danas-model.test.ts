import { describe, expect, test } from "vitest";

import type { CekaProjekta, ZadatakZbira } from "../../hub-zbir";
import {
  CEKA_TE_DANAS,
  cekaTeDanas,
  cipoviDanas,
  izborProjekataCeka,
  MAKS_PROJEKATA_CEKA,
  misijeZaKarticu,
  napomenaIzostavljenih,
  PODNASLOV_MAKS,
  podnaslovDanas,
  podnaslovDelovi,
  sastavDanas,
  sazetakDana,
  stanjeNapretka,
  type ProjekatDanas,
} from "./danas-model";

const ZONE = "Europe/Belgrade";
// četvrtak 29. 10. 2026. 09:30 u Beogradu
const NOW = Date.UTC(2026, 9, 29, 8, 30);

function projekat(n: number, delimicno: Partial<ProjekatDanas> = {}): ProjekatDanas {
  return {
    workspaceId: `ws${n}`,
    slug: `p${n}`,
    ime: `Projekat ${String(n).padStart(2, "0")}`,
    arhiviran: false,
    redosled: n,
    ...delimicno,
  };
}

function zadatak(kljuc: string, hitnost: ZadatakZbira["hitnost"], broj = 1): ZadatakZbira {
  return { kljuc, naslov: kljuc, broj, hitnost, veza: "/leadovi", radnja: "Otvori", imenilac: null };
}

describe("izbor projekata za „Čeka te“", () => {
  test("prvih 20 koji nisu arhivirani, po redosledu pa po imenu", () => {
    const projekti = [
      projekat(3),
      projekat(1, { arhiviran: true }),
      projekat(2, { redosled: null, ime: "Bez redosleda" }),
      projekat(4, { redosled: 0 }),
    ];
    const { izabrani, ukupno } = izborProjekataCeka(projekti);
    expect(izabrani.map((p) => p.workspaceId)).toEqual(["ws4", "ws3", "ws2"]);
    expect(ukupno).toBe(3);
  });

  test("34 projekta: računa se 20 i piše napomena", () => {
    const projekti = Array.from({ length: 34 }, (_, i) => projekat(i + 1));
    const blok = cekaTeDanas(projekti, new Map());
    expect(blok.stanje).toBe("projekti");
    if (blok.stanje !== "projekti") return;
    expect(MAKS_PROJEKATA_CEKA).toBe(20);
    expect(blok.napomena).toBe("Uračunato 20 od 34 projekta.");
    expect(napomenaIzostavljenih(20, 25)).toBe("Uračunato 20 od 25 projekata.");
    expect(napomenaIzostavljenih(20, 21)).toBe("Uračunato 20 od 21 projekta.");
    expect(napomenaIzostavljenih(20, 20)).toBeNull();
  });

  test("0 projekata je posebno stanje, a nepoznat spisak se učitava", () => {
    expect(cekaTeDanas([], new Map()).stanje).toBe("bez_projekata");
    expect(cekaTeDanas([projekat(1, { arhiviran: true })], new Map()).stanje).toBe("bez_projekata");
    expect(cekaTeDanas(undefined, new Map()).stanje).toBe("ucitava");
  });

  test("zbir po projektima: hitnost pa broj, greška ide u „Bez podataka“", () => {
    const projekti = [projekat(1), projekat(2), projekat(3), projekat(4)];
    const ceka = new Map<string, CekaProjekta>([
      ["ws1", { stanje: "ok", ukupno: 2, zadaci: [zadatak("a", "niska"), zadatak("b", "srednja", 3)] }],
      // Projekat posmatrača: Enigmin posao ulazi kao i na hubu (E6).
      ["ws2", { stanje: "ok", ukupno: 1, zadaci: [zadatak("c", "visoka")] }],
      ["ws3", { stanje: "greska" }],
      ["ws4", { stanje: "ok", ukupno: 0, zadaci: [] }],
    ]);
    const blok = cekaTeDanas(projekti, ceka);
    if (blok.stanje !== "projekti") throw new Error("očekivan zbir");
    expect(blok.zbir.stavke.map((s) => s.zadatak.kljuc)).toEqual(["c", "b", "a"]);
    expect(blok.zbir.ukupno).toBe(3);
    expect(blok.zbir.projekata).toBe(2);
    expect(blok.zbir.bezPodataka.map((p) => p.workspaceId)).toEqual(["ws3"]);
    expect(blok.zbir.ucitava).toBe(false);
    expect(blok.napomena).toBeNull();
    expect(CEKA_TE_DANAS).toBe(3);
  });

  test("projekat koji još nije javio drži „učitava“", () => {
    const blok = cekaTeDanas([projekat(1), projekat(2)], new Map([["ws1", { stanje: "ucitava" } as CekaProjekta]]));
    if (blok.stanje !== "projekti") throw new Error("očekivan zbir");
    expect(blok.zbir.ucitava).toBe(true);
  });
});

describe("zaglavlje", () => {
  test("sažetak: množina i izostavljanje nule", () => {
    expect(sazetakDana({ overdue: 1, today: 0 })).toBe("1 kasni");
    expect(sazetakDana({ overdue: 2, today: 3 })).toBe("2 kasne, 3 za danas");
    expect(sazetakDana({ overdue: 5, today: 0 })).toBe("5 kasni");
    expect(sazetakDana({ overdue: 0, today: 0 })).toBeNull();
  });

  test("podnaslov: pozdrav, dan i brojevi; prazan dan i učitavanje", () => {
    expect(podnaslovDanas({ ime: "Jovan", now: NOW, counts: { overdue: 2, today: 3 }, zone: ZONE })).toBe(
      "Zdravo, Jovan · četvrtak 29. oktobar · 2 kasne, 3 za danas",
    );
    expect(podnaslovDanas({ ime: "Jovan", now: NOW, counts: { overdue: 0, today: 0 }, zone: ZONE })).toBe(
      "Zdravo, Jovan · četvrtak 29. oktobar · Ništa ne gori.",
    );
    expect(podnaslovDanas({ ime: null, now: NOW, counts: null, zone: ZONE })).toBe("četvrtak 29. oktobar");
  });

  test("podnaslov u delovima: pozdrav odvojeno (telefon ga sakriva)", () => {
    expect(podnaslovDelovi({ ime: "Jovan", now: NOW, counts: { overdue: 1, today: 0 }, zone: ZONE })).toEqual({
      pozdrav: "Zdravo, Jovan",
      dan: "četvrtak 29. oktobar",
      sazetak: "1 kasni",
      ostatak: "četvrtak 29. oktobar · 1 kasni",
    });
    expect(podnaslovDelovi({ ime: null, now: NOW, counts: null, zone: ZONE }).pozdrav).toBeNull();
  });

  test("podnaslov nikad nije duži od 90 znakova: predugo ime gubi pozdrav", () => {
    const ime = "A".repeat(80);
    const tekst = podnaslovDanas({ ime, now: NOW, counts: { overdue: 12, today: 30 }, zone: ZONE });
    expect(tekst.length).toBeLessThanOrEqual(PODNASLOV_MAKS);
    expect(tekst).toBe("četvrtak 29. oktobar · 12 kasni, 30 za danas");
  });
});

describe("sastav desne kolone", () => {
  test("redosled blokova; skriven napredak ispada", () => {
    expect(sastavDanas("spremno")).toEqual(["cekaTe", "napredak", "inbox", "poruke", "ideje"]);
    expect(sastavDanas("ucitava")).toEqual(["cekaTe", "napredak", "inbox", "poruke", "ideje"]);
    expect(sastavDanas("skriveno")).toEqual(["cekaTe", "inbox", "poruke", "ideje"]);
  });

  test("stanje kartice napretka: isključen, pao i zastoj se ne crtaju", () => {
    expect(stanjeNapretka({ stanje: undefined, pao: false, zastoj: false })).toBe("ucitava");
    expect(stanjeNapretka({ stanje: undefined, pao: true, zastoj: false })).toBe("skriveno");
    expect(stanjeNapretka({ stanje: { ukljucen: false }, pao: false, zastoj: false })).toBe("skriveno");
    expect(stanjeNapretka({ stanje: { ukljucen: true, spremno: false }, pao: false, zastoj: false })).toBe("sabira");
    expect(stanjeNapretka({ stanje: { ukljucen: true, spremno: false }, pao: false, zastoj: true })).toBe("skriveno");
    expect(stanjeNapretka({ stanje: { ukljucen: true, spremno: true }, pao: false, zastoj: false })).toBe("spremno");
  });

  test("čipovi ispod xl: samo brojevi veći od nule, nepoznato se ne crta", () => {
    const cipovi = cipoviDanas({
      cekaTe: { broj: 13 },
      inbox: { broj: 30, vise: true },
      poruke: { broj: 0 },
      ideje: { broj: null },
    });
    expect(cipovi).toEqual([
      { kljuc: "cekaTe", naziv: "Čeka te", broj: 13, vise: false },
      { kljuc: "inbox", naziv: "Inbox", broj: 30, vise: true },
    ]);
  });
});

describe("misije u kartici", () => {
  test("do dve nezavršene, redom; brojač završenih", () => {
    const misije = [
      { kljuc: "a", zavrsena: true },
      { kljuc: "b", zavrsena: false },
      { kljuc: "c", zavrsena: false },
      { kljuc: "d", zavrsena: false },
    ];
    const { prikazane, zavrsenih, ukupno } = misijeZaKarticu(misije);
    expect(prikazane.map((m) => m.kljuc)).toEqual(["b", "c"]);
    expect(zavrsenih).toBe(1);
    expect(ukupno).toBe(4);
    expect(misijeZaKarticu([]).prikazane).toEqual([]);
  });
});
