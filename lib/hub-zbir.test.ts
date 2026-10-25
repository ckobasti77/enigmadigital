import { describe, expect, test } from "vitest";
import {
  tekstVeze,
  vezaUProjektu,
  zbirCekanja,
  type CekaProjekta,
  type ZadatakZbira,
} from "./hub-zbir";

const enigma = { workspaceId: "a", slug: "enigma-it", ime: "Enigma IT" };
const scanme = { workspaceId: "b", slug: "scanme", ime: "ScanMe" };
const klijent = { workspaceId: "k", slug: "klijent-doo", ime: "Klijent d.o.o." };

function zadatak(kljuc: string, hitnost: ZadatakZbira["hitnost"], broj: number): ZadatakZbira {
  return { kljuc, naslov: kljuc, broj, hitnost, veza: "/leadovi", radnja: "Otvori", imenilac: null };
}

describe("zbirno „šta me čeka“ u hubu", () => {
  test("spaja tri projekta, poređano po hitnosti, pa broju, pa projektu", () => {
    const ceka = new Map<string, CekaProjekta>([
      ["a", { stanje: "ok", ukupno: 2, zadaci: [zadatak("komentari", "srednja", 7), zadatak("zaostali", "visoka", 4)] }],
      ["b", { stanje: "ok", ukupno: 2, zadaci: [zadatak("uvoz", "visoka", 1), zadatak("telefoni", "niska", 9)] }],
      ["k", { stanje: "ok", ukupno: 0, zadaci: [] }],
    ]);
    const z = zbirCekanja([enigma, scanme, klijent], ceka);
    expect(z.stavke.map((s) => `${s.projekat.slug}:${s.zadatak.kljuc}`)).toEqual([
      "enigma-it:zaostali",
      "scanme:uvoz",
      "enigma-it:komentari",
      "scanme:telefoni",
    ]);
    expect(z.ukupno).toBe(4);
    expect(z.projekata).toBe(2);
    expect(z.bezPodataka).toEqual([]);
    expect(z.ucitava).toBe(false);
  });

  test("projekat sa greškom se izostavlja i prijavljuje; neučitan znači „učitava“", () => {
    const ceka = new Map<string, CekaProjekta>([
      ["a", { stanje: "ok", ukupno: 1, zadaci: [zadatak("x", "niska", 1)] }],
      ["b", { stanje: "greska" }],
    ]);
    const z = zbirCekanja([enigma, scanme, klijent], ceka);
    expect(z.stavke).toHaveLength(1);
    expect(z.bezPodataka).toEqual([scanme]);
    expect(z.ucitava).toBe(true);
  });

  test("veza zadatka vodi u projekat", () => {
    expect(vezaUProjektu("scanme", "/leadovi?tab=overdue")).toBe("/scanme/leadovi?tab=overdue");
    expect(vezaUProjektu("scanme", "/")).toBe("/scanme");
    expect(vezaUProjektu("scanme", "loše")).toBe("/scanme");
  });
});

describe("tekst zdravlja veze", () => {
  test("razlozi daju jednu rečenicu; ispravna veza nema teksta", () => {
    expect(tekstVeze({ provider: "meta_ig", razlog: null })).toBeNull();
    expect(tekstVeze({ provider: "meta_ig", razlog: "token_istice", za: 9 })).toBe(
      "Instagram: pristup ističe za 9 dana",
    );
    expect(tekstVeze({ provider: "meta_ig", razlog: "token_istice", za: 1 })).toBe(
      "Instagram: pristup ističe za 1 dan",
    );
    expect(tekstVeze({ provider: "ga4", razlog: "stari_podaci", za: 30 })).toBe(
      "GA4: bez novih podataka 30 h",
    );
    expect(tekstVeze({ provider: "ga4", razlog: "stari_podaci", za: 80 })).toBe(
      "GA4: bez novih podataka 3 dana",
    );
    expect(tekstVeze({ provider: "youtube", razlog: "pao_prolaz" })).toBe(
      "YouTube: poslednja sinhronizacija nije uspela",
    );
    expect(tekstVeze({ provider: "threads", razlog: "token_istekao" })).toBe(
      "Threads: pristup je istekao, poveži ponovo",
    );
  });
});
