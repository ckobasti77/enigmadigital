// SPAJANJE S17: kuda vodi obaveštenje (klik u Inboxu, zvonu i toastu, link iz
// push poruke kroz `/otvori`) i da li `public/sw.js` pravi istu adresu.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

import { notificationDestination } from "../../../convex/prostor/lib/notificationTarget";
import {
  adresaObavestenja,
  adresaOtvori,
  adresaZaOtvori,
  citajOtvori,
  odredisteObavestenja,
  rutaObavestenja,
  type CiljObavestenja,
} from "./obavestenja";

const WS = "wsenigma0001";
const SLUGOVI: Record<string, string> = { [WS]: "enigma-it" };
const slugZa = (id: string) => SLUGOVI[id] ?? null;

const uProjektu = (targetType: string, targetId: string | null): CiljObavestenja => ({
  workspaceId: WS,
  targetType,
  targetId,
});

describe("adresaObavestenja: mapa vrsta (plan S07 §10 S17)", () => {
  test.each([
    ["page", "pages0001", "/enigma-it/stranica/pages0001"],
    ["chat", "chat0001", "/enigma-it/poruke?kanal=chat0001"],
    ["chat", null, "/enigma-it/poruke"],
    ["ideas", "idea0001", "/enigma-it/ideje?ideja=idea0001"],
    ["ideas", null, "/enigma-it/ideje"],
    ["area", "areas0001", "/enigma-it/dokumenti/areas0001?tab=pregled"],
    ["puls", "1760918400000", "/enigma-it/puls?nedelja=1760918400000"],
    ["puls", "nije-broj", "/enigma-it/puls"],
    ["approvals", null, "/enigma-it/korpa"],
    ["today", null, "/enigma-it"],
    ["nepoznato", "x", "/enigma-it"],
    // Nedosledan cilj (stranica ili oblast bez ID-ja) pada na početnu, ne na prazan ekran.
    ["page", null, "/enigma-it"],
    ["area", null, "/enigma-it"],
  ])("%s / %s → %s", (vrsta, cilj, ocekivano) => {
    expect(adresaObavestenja(uProjektu(vrsta, cilj), slugZa)).toBe(ocekivano);
  });

  test("lična poruka vodi u lične Poruke, bez projekta", () => {
    const cilj = { workspaceId: null, targetType: "chat", targetId: "chat0009" };
    expect(adresaObavestenja(cilj, slugZa)).toBe("/poruke?kanal=chat0009");
    expect(adresaObavestenja({ ...cilj, targetId: null }, slugZa)).toBe("/poruke");
  });

  test("lično obaveštenje druge vrste nema odredište", () => {
    const cilj = { workspaceId: null, targetType: "page", targetId: "pages0001" };
    expect(odredisteObavestenja(cilj)).toEqual({ kind: "nista" });
    expect(adresaObavestenja(cilj, slugZa)).toBeNull();
  });

  test("projekat koji nije moj nema adresu (ne otkriva se da li postoji)", () => {
    const cilj = { workspaceId: "wstudji00001", targetType: "page", targetId: "pages0001" };
    expect(adresaObavestenja(cilj, slugZa)).toBeNull();
  });

  test("ruta za destinaciju prati backend `notificationDestination`", () => {
    expect(rutaObavestenja(notificationDestination("page", "p1", WS))).toEqual({
      kind: "page",
      pageId: "p1",
    });
    expect(rutaObavestenja(notificationDestination("approvals", null, WS))).toEqual({ kind: "trash" });
    expect(rutaObavestenja(notificationDestination("puls", "123", WS))).toEqual({
      kind: "puls",
      weekStart: 123,
    });
  });
});

describe("/otvori", () => {
  test("adresa i čitanje su povratni put", () => {
    for (const cilj of [
      uProjektu("page", "pages0001"),
      uProjektu("puls", "1760918400000"),
      uProjektu("approvals", null),
      { workspaceId: null, targetType: "chat", targetId: "chat0009" },
    ]) {
      const adresa = adresaOtvori(cilj);
      expect(adresa.startsWith("/otvori?")).toBe(true);
      expect(citajOtvori(new URL(adresa, "http://x").searchParams)).toEqual(cilj);
    }
  });

  test("prazne vrednosti se ne pišu; bez ičega je samo /otvori", () => {
    expect(adresaOtvori({ workspaceId: WS, targetType: "approvals", targetId: null })).toBe(
      `/otvori?projekat=${WS}&vrsta=approvals`,
    );
    expect(adresaOtvori({})).toBe("/otvori");
  });

  test("konačna adresa: moj projekat, lična poruka, tuđ projekat, bez ičega", () => {
    const upit = (s: string) => new URLSearchParams(s);
    expect(adresaZaOtvori(upit(`projekat=${WS}&vrsta=ideas&cilj=idea0001`), slugZa)).toBe(
      "/enigma-it/ideje?ideja=idea0001",
    );
    expect(adresaZaOtvori(upit(`projekat=${WS}`), slugZa)).toBe("/enigma-it");
    expect(adresaZaOtvori(upit("vrsta=chat&cilj=chat0009"), slugZa)).toBe("/poruke?kanal=chat0009");
    expect(adresaZaOtvori(upit("projekat=wstudji00001&vrsta=page&cilj=p1"), slugZa)).toBe("/");
    expect(adresaZaOtvori(upit(""), slugZa)).toBe("/inbox");
    // Razmaci su isto što i prazno.
    expect(adresaZaOtvori(upit(`projekat=${WS}&vrsta=%20&cilj=`), slugZa)).toBe("/enigma-it");
  });
});

describe("public/sw.js pravi istu adresu kao adresaOtvori", () => {
  const izvor = readFileSync(fileURLToPath(new URL("../../../public/sw.js", import.meta.url)), "utf8");
  const telo = izvor.match(/function targetUrl\(data\) \{[\s\S]*?\n\}/)?.[0];

  test("radnik ima funkciju targetUrl i ne registruje se sam", () => {
    expect(telo).toBeDefined();
    expect(izvor).not.toMatch(/serviceWorker\.register/);
    // Radnik ne kešira i ne presreće mrežu.
    expect(izvor).not.toMatch(/addEventListener\("fetch"/);
  });

  test.each([
    { workspaceId: WS, targetType: "page", targetId: "pages0001" },
    { workspaceId: WS, targetType: "chat", targetId: null },
    { workspaceId: WS, targetType: "puls", targetId: "1760918400000" },
    { workspaceId: WS, targetType: "approvals", targetId: null },
    { workspaceId: null, targetType: "chat", targetId: "chat0009" },
    { workspaceId: null, targetType: null, targetId: null },
  ])("%o", (data) => {
    const targetUrl = new Function(`${telo}; return targetUrl;`)() as (d: unknown) => string;
    expect(targetUrl(data)).toBe(
      adresaOtvori({
        workspaceId: data.workspaceId,
        targetType: data.targetType ?? undefined,
        targetId: data.targetId,
      }),
    );
  });
});
