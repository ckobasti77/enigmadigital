// Preneto iz Devotion packages/shared/src/revisions.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  formatEditTime,
  htmlToPlainText,
  REVISION_KIND_LABELS,
  revisionMeta,
  UNKNOWN_REVISION_AUTHOR,
} from "./revisions";

const BG = "Europe/Belgrade";
// 26. oktobar 2026, 15:00 po Beogradu (CET, posle prelaska na zimsko vreme).
const NOW = Date.UTC(2026, 9, 26, 14, 0);

describe("vreme izmene", () => {
  test("upravo, minuti, danas, juče, datum", () => {
    expect(formatEditTime(NOW - 20_000, NOW, BG)).toBe("upravo");
    expect(formatEditTime(NOW - 5 * 60_000, NOW, BG)).toBe("pre 5 min");
    expect(formatEditTime(NOW - 59 * 60_000, NOW, BG)).toBe("pre 59 min");
    expect(formatEditTime(NOW - 3 * 3_600_000, NOW, BG)).toBe("danas u 12:00");
    expect(formatEditTime(NOW - 24 * 3_600_000, NOW, BG)).toBe("juče u 15:00");
    expect(formatEditTime(Date.UTC(2026, 9, 12, 10), NOW, BG)).not.toMatch(/^pre|danas|juče/);
  });
});

describe("red revizije", () => {
  test("obična izmena nema oznaku, bazna i vraćena imaju", () => {
    expect(
      revisionMeta({ kind: "edit", authorName: "Ana", updatedAt: NOW - 5 * 60_000 }, NOW, BG),
    ).toEqual({ title: "Ana · pre 5 min", badge: null });
    expect(
      revisionMeta({ kind: "baseline", authorName: null, updatedAt: NOW - 30_000 }, NOW, BG),
    ).toEqual({
      title: `${UNKNOWN_REVISION_AUTHOR} · upravo`,
      badge: REVISION_KIND_LABELS.baseline,
    });
    expect(
      revisionMeta({ kind: "restore", authorName: "Marko", updatedAt: NOW }, NOW, BG).badge,
    ).toBe("Vraćena verzija");
  });
});

describe("HTML u tekst", () => {
  test("pasusi, liste, prelomi i entiteti", () => {
    expect(
      htmlToPlainText(
        "<h2>Plan</h2><p>Prvi&nbsp;red<br>drugi</p><ul><li>A &amp; B</li><li>&lt;C&gt;</li></ul>",
      ),
    ).toBe("Plan\nPrvi red\ndrugi\nA & B\n<C>");
    expect(htmlToPlainText("")).toBe("");
    expect(htmlToPlainText("<p></p><p></p><p></p><p>kraj</p>")).toBe("kraj");
  });
});
