// Preneto iz Devotion apps/web/lib/errors.test.ts (main @ c05c40f), SPAJANJE S08.
import { describe, expect, test } from "vitest";

import { accessErrorCode, accessErrorMessage, PORUKE_GRESAKA_PO_KODU } from "./greske";

const FALLBACK = "Proveri vezu i pokušaj ponovo.";

describe("accessErrorMessage", () => {
  test("ConvexError data.message ima prednost", () => {
    const error = Object.assign(new Error("[CONVEX M(x)] Server Error"), {
      data: { code: "INVITE_REQUIRED", message: "Pozivni kod nije ispravan." },
    });
    expect(accessErrorMessage(error, FALLBACK)).toBe("Pozivni kod nije ispravan.");
  });

  test("razvoj: poruka obične greške servera ostaje, bez prefiksa „Error:\"", () => {
    const error = new Error(
      "[CONVEX M(tasks:updateMetadata)] [Request ID: 1a2b] Server Error\nUncaught Error: Rok menja samo kreator zadatka.\n    at handler (../convex/tasks.ts:12:3)",
    );
    expect(accessErrorMessage(error, FALLBACK)).toBe("Rok menja samo kreator zadatka.");
  });

  test("razvoj: ConvexError bez data i dalje daje tekst", () => {
    const error = new Error("[CONVEX Q(x)] Uncaught ConvexError: Nemate pristup ovom projektu.");
    expect(accessErrorMessage(error, FALLBACK)).toBe("Nemate pristup ovom projektu.");
  });

  test("produkcija: skriven tekst servera → srpski rezervni tekst", () => {
    const error = new Error("[CONVEX M(tasks:updateMetadata)] [Request ID: 1a2b] Server Error");
    expect(accessErrorMessage(error, FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage(new Error("Called by client"), FALLBACK)).toBe(FALLBACK);
  });

  test("prazno i ne-Error → rezervni tekst", () => {
    expect(accessErrorMessage(new Error(""), FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage("niz", FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });
});

/** Greška kakvu klijent dobije od `ConvexError(data)`: sirova poruka skrivena, `data` ostaje. */
function convexGreska(data: Record<string, unknown>) {
  return Object.assign(new Error("[CONVEX M(x)] [Request ID: 1a2b] Server Error"), { data });
}

describe("accessErrorMessage: kodovi greške Enigme", () => {
  test("kod bez poruke daje kratku srpsku rečenicu", () => {
    const ocekivano: Record<string, string> = {
      unauthorized: "Prijava je istekla. Prijavi se ponovo.",
      forbidden: "Nemaš pristup ovom projektu.",
      not_found: "Stavka nije pronađena u ovom projektu.",
      nema_profila: "Profil još nije spreman. Osveži stranicu.",
      invalid: "Uneti podaci nisu ispravni.",
    };
    for (const [code, poruka] of Object.entries(ocekivano)) {
      expect(accessErrorMessage(convexGreska({ code }), FALLBACK)).toBe(poruka);
    }
  });

  test("Devotion kodovi bez poruke zadržavaju svoj tekst", () => {
    expect(accessErrorMessage(convexGreska({ code: "ZAKLJUCANO" }), FALLBACK)).toBe(
      "Stranica je zaključana. Menja je autor ili vlasnik projekta.",
    );
    expect(accessErrorMessage(convexGreska({ code: "NEMA_DOZVOLU" }), FALLBACK)).toBe(
      "Nemaš dozvolu za ovu radnju.",
    );
    expect(accessErrorMessage(convexGreska({ code: "KONFLIKT_IZMENA" }), FALLBACK)).toBe(
      "Neko iz tima je u međuvremenu izmenio ovu stranicu.",
    );
    expect(accessErrorMessage(convexGreska({ code: "STARI_TOK" }), FALLBACK)).toBe(
      "Ova radnja više ne postoji. Osveži stranicu i pokušaj ponovo.",
    );
  });

  test("poruka servera ima prednost nad porukom po kodu", () => {
    const error = convexGreska({
      code: "forbidden",
      message: "Ovu radnju može da izvede urednik ili vlasnik projekta.",
    });
    expect(accessErrorMessage(error, FALLBACK)).toBe(
      "Ovu radnju može da izvede urednik ili vlasnik projekta.",
    );
    const projekat = convexGreska({ code: "not_found", message: "Projekat nije pronađen." });
    expect(accessErrorMessage(projekat, FALLBACK)).toBe("Projekat nije pronađen.");
  });

  test("prazna poruka servera pada na poruku po kodu", () => {
    expect(accessErrorMessage(convexGreska({ code: "forbidden", message: "" }), FALLBACK)).toBe(
      "Nemaš pristup ovom projektu.",
    );
  });

  test("oznaka koda ispred poruke se skida", () => {
    const konflikt = convexGreska({
      code: "KONFLIKT_IZMENA",
      message: "KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.",
      currentRevision: 7,
    });
    expect(accessErrorMessage(konflikt, FALLBACK)).toBe(
      "Neko iz tima je u međuvremenu izmenio ovu stranicu.",
    );
    const briefing = convexGreska({
      code: "KONFLIKT_IZMENA",
      message: "KONFLIKT_IZMENA: Briefing je u međuvremenu izmenjen.",
    });
    expect(accessErrorMessage(briefing, FALLBACK)).toBe("Briefing je u međuvremenu izmenjen.");
    const razvoj = new Error("Uncaught Error: KONFLIKT_IZMENA: izmenjeno");
    expect(accessErrorMessage(razvoj, FALLBACK)).toBe("izmenjeno");
  });

  test("razvoj: tekst koji je sam kod daje poruku po kodu", () => {
    expect(accessErrorMessage(new Error("Uncaught Error: KONFLIKT_IZMENA"), FALLBACK)).toBe(
      "Neko iz tima je u međuvremenu izmenio ovu stranicu.",
    );
  });

  test("nepoznat kod bez poruke → rezervni tekst, nikad sirov kod", () => {
    expect(accessErrorMessage(convexGreska({ code: "nesto_nepoznato" }), FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage(convexGreska({ code: "constructor" }), FALLBACK)).toBe(FALLBACK);
    expect(accessErrorMessage(convexGreska({}), FALLBACK)).toBe(FALLBACK);
  });

  test("poruke po kodu su ljudske: bez snake_case reči i velikih slova", () => {
    const kodovi = Object.keys(PORUKE_GRESAKA_PO_KODU);
    expect(kodovi).toEqual(
      expect.arrayContaining([
        "unauthorized",
        "forbidden",
        "not_found",
        "nema_profila",
        "ZAKLJUCANO",
        "NEMA_DOZVOLU",
        "KONFLIKT_IZMENA",
        "STARI_TOK",
      ]),
    );
    for (const poruka of Object.values(PORUKE_GRESAKA_PO_KODU)) {
      expect(poruka).not.toMatch(/\b[A-Za-z]+_[A-Za-z_]+\b/);
      expect(poruka).not.toMatch(/\b[A-Z]{2,}\b/);
      expect(poruka).not.toMatch(/startup/i);
      expect(poruka.endsWith(".")).toBe(true);
    }
  });
});

describe("accessErrorCode", () => {
  test("vraća code iz ConvexError data", () => {
    expect(accessErrorCode(convexGreska({ code: "KONFLIKT_IZMENA" }))).toBe("KONFLIKT_IZMENA");
    expect(accessErrorCode(convexGreska({ code: "not_found", message: "x" }))).toBe("not_found");
  });

  test("bez koda ili ne-Error → undefined", () => {
    expect(accessErrorCode(convexGreska({ message: "x" }))).toBeUndefined();
    expect(accessErrorCode(convexGreska({ code: 7 }))).toBeUndefined();
    expect(accessErrorCode(new Error("običan tekst"))).toBeUndefined();
    expect(accessErrorCode("niz")).toBeUndefined();
  });
});
