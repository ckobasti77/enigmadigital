// Preneto iz Devotion apps/web/components/workspace/trash/trash-model.test.ts (main @ c05c40f), SPAJANJE S21.
import { describe, expect, it } from "vitest";

import {
  FILE_PAGE_IN_TRASH,
  NO_RESTORE_RIGHT,
  focusKeyAfterRemoval,
  openTargetAfterRestore,
  restoreBlockReason,
  restoreTarget,
  RETURNS_TO_AREA_ROOT,
  trashCountLabel,
  trashItemKey,
  trashItemLocation,
  trashItemMeta,
  trashItemTitle,
  type TrashItem,
} from "./trash-model";

const NOW = Date.UTC(2026, 9, 26, 10, 0);
const DAY = 86_400_000;
const ana = { _id: "p1" as never, displayName: "Ana Petrović", avatarUrl: null };

const page: Extract<TrashItem, { kind: "page" }> = {
  kind: "page",
  pageId: "pg1" as never,
  title: "Specifikacija API",
  pageKind: "note",
  areaId: "a1" as never,
  areaLabel: "Razvoj",
  parentPageId: "pg0" as never,
  parentTitle: "Lansiranje",
  parentAvailable: true,
  descendantCount: 3,
  archivedAt: NOW - 2 * DAY,
  archivedBy: ana,
  canRestore: true,
};

const file: Extract<TrashItem, { kind: "file" }> = {
  kind: "file",
  fileId: "f1" as never,
  name: "ugovor.pdf",
  category: "document",
  size: 1200,
  pageId: "pg2" as never,
  pageTitle: "Pravno",
  pageAvailable: true,
  archivedAt: NOW - 5 * DAY,
  archivedBy: null,
  canRestore: true,
};

const idea: Extract<TrashItem, { kind: "idea" }> = {
  kind: "idea",
  ideaId: "i1" as never,
  title: "Referral",
  archivedAt: NOW,
  archivedBy: ana,
  canRestore: true,
};

describe("Korpa — red stavke (K08)", () => {
  it("stranica: podstranice, ko je obrisao i kad, mesto u oblasti", () => {
    expect(trashItemMeta(page, NOW, "UTC")).toBe("Sa 3 podstranice · Obrisao/la Ana Petrović · pre 2 dana");
    expect(trashItemLocation(page)).toBe("Razvoj › Lansiranje");
    expect(trashItemTitle(page)).toBe("Specifikacija API");
    expect(trashItemKey(page)).toBe("page:pg1");
  });

  it("stranica čiji je roditelj i dalje u Korpi kaže da se vraća na vrh oblasti", () => {
    const orphan = { ...page, descendantCount: 0, parentAvailable: false };
    expect(trashItemMeta(orphan, NOW, "UTC")).toBe(`Obrisao/la Ana Petrović · pre 2 dana · ${RETURNS_TO_AREA_ROOT}`);
    const root = { ...page, parentPageId: null, parentTitle: null, parentAvailable: false };
    expect(trashItemMeta(root, NOW, "UTC")).not.toContain(RETURNS_TO_AREA_ROOT);
    expect(trashItemLocation(root)).toBe("Razvoj");
  });

  it("prilog: ime, stranica i nepoznat brisač", () => {
    expect(trashItemTitle(file)).toBe("ugovor.pdf");
    expect(trashItemLocation(file)).toBe("na stranici „Pravno”");
    expect(trashItemMeta(file, NOW, "UTC")).toBe("Obrisano · pre 5 dana");
  });

  it("Vrati: prilog čija je stranica u Korpi ide prvi, pa pravo vraćanja", () => {
    expect(restoreBlockReason(page)).toBeNull();
    expect(restoreBlockReason({ ...file, pageAvailable: false, canRestore: false })).toBe(FILE_PAGE_IN_TRASH);
    expect(restoreBlockReason({ ...page, canRestore: false })).toBe(NO_RESTORE_RIGHT);
  });

  it("cilj vraćanja i otvaranja po vrsti", () => {
    expect(restoreTarget(page)).toEqual({ kind: "page", id: "pg1" });
    expect(restoreTarget(file)).toEqual({ kind: "file", id: "f1" });
    expect(restoreTarget(idea)).toEqual({ kind: "idea", id: "i1" });
    expect(openTargetAfterRestore(idea)).toEqual({ kind: "ideas", ideaId: "i1" });
    expect(openTargetAfterRestore(file)).toEqual({ kind: "page", pageId: "pg2" });
    expect(openTargetAfterRestore(page)).toEqual({ kind: "page", pageId: "pg1" });
  });

  it("Oporavljeno: vlasnik i broj tekstova sa srpskom množinom", () => {
    const recovered: Extract<TrashItem, { kind: "recovered" }> = {
      kind: "recovered",
      recoveredId: "r1" as never,
      title: "Stari plan",
      sourceKind: "page",
      createdAt: NOW,
      owner: ana,
      contributions: [
        { _id: "c1" as never, excerpt: "a", author: ana, createdAt: NOW },
        { _id: "c2" as never, excerpt: "b", author: null, createdAt: NOW },
      ],
      canDismiss: true,
    };
    expect(trashItemMeta(recovered, NOW)).toBe("Sačuvano za Ana Petrović · 2 teksta");
    expect(trashItemMeta({ ...recovered, owner: null, contributions: recovered.contributions.slice(0, 1) }, NOW)).toBe(
      "Sačuvano · 1 tekst",
    );
    expect(trashItemKey(recovered)).toBe("recovered:r1");
  });

  it("broj na kartici i fokus posle uklanjanja reda", () => {
    expect(trashCountLabel(undefined)).toBeNull();
    expect(trashCountLabel({ count: 0, capped: false })).toBeNull();
    expect(trashCountLabel({ count: 7, capped: false })).toBe("7");
    expect(trashCountLabel({ count: 99, capped: true })).toBe("99+");
    expect(focusKeyAfterRemoval(["a"], 0)).toBeNull();
    expect(focusKeyAfterRemoval(["a", "b", "c"], 1)).toBe("c");
    expect(focusKeyAfterRemoval(["a", "b", "c"], 2)).toBe("b");
  });
});
