// Preneto iz Devotion apps/web/lib/note-link.test.ts (main @ c05c40f), SPAJANJE S10.
import { describe, expect, test } from "vitest";

import { normalizeNoteLinkHref } from "./note-link";

describe("adresa linka u belešci", () => {
  test("bez sheme dobija https", () => {
    expect(normalizeNoteLinkHref("primer.rs")).toBe("https://primer.rs/");
    expect(normalizeNoteLinkHref("www.primer.rs/cenovnik")).toBe(
      "https://www.primer.rs/cenovnik",
    );
  });

  test("postojeća shema se ne menja, host se normalizuje", () => {
    expect(normalizeNoteLinkHref("HTTPS://Primer.RS/Put")).toBe(
      "https://primer.rs/Put",
    );
    expect(normalizeNoteLinkHref("http://localhost:3000/x")).toBe(
      "http://localhost:3000/x",
    );
  });

  test("tekst sa @ postaje mailto", () => {
    expect(normalizeNoteLinkHref("ana@primer.rs")).toBe("mailto:ana@primer.rs");
    expect(normalizeNoteLinkHref("mailto:ana@primer.rs")).toBe(
      "mailto:ana@primer.rs",
    );
  });

  test("okolni razmaci i prazan unos", () => {
    expect(normalizeNoteLinkHref("  primer.rs  ")).toBe("https://primer.rs/");
    expect(normalizeNoteLinkHref("   ")).toBeNull();
    expect(normalizeNoteLinkHref("")).toBeNull();
  });

  test("izvršne i nepodržane sheme se odbijaju", () => {
    expect(normalizeNoteLinkHref("javascript:alert(1)")).toBeNull();
    expect(normalizeNoteLinkHref("JavaScript:alert(1)")).toBeNull();
    expect(normalizeNoteLinkHref("data:text/html,<b>x</b>")).toBeNull();
    expect(normalizeNoteLinkHref("file:///C:/tajna.txt")).toBeNull();
  });

  test("kontrolni znaci ne mogu da sakriju shemu", () => {
    expect(normalizeNoteLinkHref("java\nscript:alert(1)")).toBeNull();
    expect(normalizeNoteLinkHref("\tjavascript:alert(1)")).toBeNull();
  });

  test("putanja bez domena nije adresa", () => {
    expect(normalizeNoteLinkHref("/tim/stranica")).toBeNull();
    expect(normalizeNoteLinkHref("cenovnik")).toBeNull();
  });

  test("nepotpune adrese", () => {
    expect(normalizeNoteLinkHref("https://")).toBeNull();
    expect(normalizeNoteLinkHref("mailto:")).toBeNull();
    expect(normalizeNoteLinkHref("tel:")).toBeNull();
  });

  test("razmak u putanji se kodira umesto da obori unos", () => {
    expect(normalizeNoteLinkHref("primer.rs/moj dokument")).toBe(
      "https://primer.rs/moj%20dokument",
    );
  });
});
