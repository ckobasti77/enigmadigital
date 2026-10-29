// Preneto iz Devotion packages/shared/src/trash.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import {
  formatTrashAge,
  RESTORED_TO_AREA_ROOT,
  restoredMessage,
  subpagesLabel,
  TRASH_SEGMENTS,
  trashMetaLabel,
} from "./trash";

const BG = "Europe/Belgrade";
// 26. oktobar 2026, 15:00 po Beogradu.
const NOW = Date.UTC(2026, 9, 26, 14, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("Korpa: segmenti", () => {
  test("četiri segmenta u stalnom redosledu", () => {
    expect(TRASH_SEGMENTS.map((segment) => segment.label)).toEqual([
      "Stranice",
      "Ideje",
      "Prilozi",
      "Oporavljeno",
    ]);
  });
});

describe("Korpa: starost i red stavke", () => {
  test("upravo, minuti, danas, juče, pre N dana, datum", () => {
    expect(formatTrashAge(NOW - 10_000, NOW, BG)).toBe("upravo");
    expect(formatTrashAge(NOW - 7 * 60_000, NOW, BG)).toBe("pre 7 min");
    expect(formatTrashAge(NOW - 3 * HOUR, NOW, BG)).toBe("danas u 12:00");
    expect(formatTrashAge(NOW - DAY, NOW, BG)).toBe("juče");
    expect(formatTrashAge(NOW - 3 * DAY, NOW, BG)).toBe("pre 3 dana");
    expect(formatTrashAge(NOW - 21 * DAY, NOW, BG)).toBe("pre 21 dan");
    expect(formatTrashAge(NOW - 45 * DAY, NOW, BG)).not.toMatch(/^pre/);
  });

  test("ko je obrisao, i kad ime nije poznato", () => {
    expect(
      trashMetaLabel({ archivedAt: NOW - 3 * DAY, archivedByName: "Ana" }, NOW, BG),
    ).toBe("Obrisao/la Ana · pre 3 dana");
    expect(
      trashMetaLabel({ archivedAt: NOW - 30_000, archivedByName: null }, NOW, BG),
    ).toBe("Obrisano · upravo");
  });
});

describe("Korpa: poruka posle vraćanja", () => {
  test("jednina i množina podstranica", () => {
    expect(subpagesLabel(1)).toBe("1 podstranica");
    expect(subpagesLabel(3)).toBe("3 podstranice");
    expect(subpagesLabel(7)).toBe("7 podstranica");
    expect(subpagesLabel(12)).toBe("12 podstranica");
    expect(subpagesLabel(22)).toBe("22 podstranice");
  });

  test("stranica sa podstranicama, bez njih, ideja i prilog", () => {
    expect(
      restoredMessage({
        kind: "page",
        title: "Plan",
        restoredCount: 5,
        movedToAreaRoot: false,
      }),
    ).toBe("Vraćeno: „Plan” i 4 podstranice.");
    expect(
      restoredMessage({
        kind: "page",
        title: "Plan",
        restoredCount: 1,
        movedToAreaRoot: false,
      }),
    ).toBe("Vraćeno: „Plan”.");
    expect(
      restoredMessage({ kind: "page", restoredCount: 2, movedToAreaRoot: false }),
    ).toBe("Vraćeno i 1 podstranica.");
    expect(
      restoredMessage({
        kind: "idea",
        title: "Brži onboarding",
        restoredCount: 1,
        movedToAreaRoot: false,
      }),
    ).toBe("Vraćena ideja „Brži onboarding”.");
    expect(
      restoredMessage({ kind: "file", restoredCount: 1, movedToAreaRoot: false }),
    ).toBe("Vraćen prilog.");
  });

  test("roditelj i dalje u Korpi dodaje objašnjenje", () => {
    expect(
      restoredMessage({
        kind: "page",
        title: "Poglavlje",
        restoredCount: 1,
        movedToAreaRoot: true,
      }),
    ).toBe(`Vraćeno: „Poglavlje”. ${RESTORED_TO_AREA_ROOT}`);
  });
});
