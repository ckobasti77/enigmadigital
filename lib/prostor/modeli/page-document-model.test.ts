// Preneto iz Devotion apps/web/components/workspace/page/page-document-model.test.ts (main @ c05c40f), SPAJANJE S10.
import { describe, expect, it } from "vitest";

import {
  countLabel,
  documentAccess,
  documentMetaLine,
  lastEditLabel,
  lockView,
  pageMenuKeys,
  restoreBlockedReason,
  subpageMeta,
  trashedMessage,
  type DocumentPermissions,
} from "./page-document-model";

const NOW = new Date("2026-10-24T09:30:00").getTime();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

/** `permissions` iz `pages.get` za člana koji nije autor (P1): otključana stranica. */
const memberUnlocked: DocumentPermissions = {
  canEdit: true,
  canMove: true,
  canDetach: false,
  canArchive: true,
  canLock: false,
  canUnlock: false,
  canComment: true,
  canRestoreRevision: true,
  isLocked: false,
};
/** Isti član, zaključana tuđa stranica: samo čita i komentariše. */
const memberLocked: DocumentPermissions = {
  ...memberUnlocked,
  canEdit: false,
  canMove: false,
  canArchive: false,
  canRestoreRevision: false,
  isLocked: true,
};
/** Autor (ili vlasnik/admin) zaključane stranice: menja i otključava. */
const authorLocked: DocumentPermissions = {
  ...memberUnlocked,
  canDetach: true,
  canUnlock: true,
  isLocked: true,
};

describe("dokument tima — šta gledalac sme (iz permissions)", () => {
  it("član koji nije autor dobija editor otključane stranice", () => {
    expect(documentAccess(memberUnlocked)).toEqual({
      editable: true,
      canComment: true,
      canCreateChild: true,
      lock: "unlocked",
    });
  });

  it("zaključana tuđa stranica: samo čitanje i komentar", () => {
    expect(documentAccess(memberLocked)).toEqual({
      editable: false,
      canComment: true,
      canCreateChild: false,
      lock: "locked-readonly",
    });
  });

  it("autor, vlasnik i admin menjaju i zaključanu", () => {
    expect(lockView(authorLocked)).toBe("locked-editable");
    expect(documentAccess(authorLocked).editable).toBe(true);
  });
});

describe("meni „…”", () => {
  it("član: bez zaključavanja; Mapa samo uz podstranice; premeštanje uz druge oblasti", () => {
    expect(pageMenuKeys(memberUnlocked, { hasChildren: false, otherAreas: 3 })).toEqual([
      "comments",
      "history",
      "move",
      "discussion",
      "archive",
    ]);
    expect(pageMenuKeys(memberUnlocked, { hasChildren: true, otherAreas: 0 })).toEqual([
      "comments",
      "history",
      "map",
      "discussion",
      "archive",
    ]);
  });

  it("zaključana tuđa: nema menjanja, premeštanja ni brisanja", () => {
    expect(pageMenuKeys(memberLocked, { hasChildren: true, otherAreas: 3 })).toEqual([
      "comments",
      "history",
      "map",
      "discussion",
    ]);
  });

  it("autor zaključane: Otključaj, Odvoji", () => {
    expect(pageMenuKeys(authorLocked, { hasChildren: false, otherAreas: 1 })).toEqual([
      "comments",
      "history",
      "unlock",
      "move",
      "detach",
      "discussion",
      "archive",
    ]);
    expect(pageMenuKeys({ ...authorLocked, isLocked: false, canUnlock: false, canLock: true }, { hasChildren: false, otherAreas: 0 })).toContain("lock");
  });
});

describe("tekstovi", () => {
  it("poslednja izmena, meta red i red podstranice", () => {
    expect(lastEditLabel("Marko Ilić", NOW - 5 * MIN, NOW)).toBe("Marko Ilić · pre 5 min");
    expect(lastEditLabel(null, NOW - 30_000, NOW)).toBe("Član tima · upravo");
    expect(documentMetaLine({ authorName: "Ana Petrović", editorName: "Marko", updatedAt: NOW - 5 * MIN, now: NOW })).toBe(
      "Ana Petrović · izmenio/la Marko pre 5 min",
    );
    expect(subpageMeta({ kind: "note", editorName: "Ana", updatedAt: NOW - 2 * DAY }, NOW)).toBe("Beleška · Ana · čet 22. okt");
    expect(subpageMeta({ kind: "table", editorName: null, updatedAt: NOW - 3 * MIN }, NOW)).toBe("Tabela · pre 3 min");
  });

  it("brojevi, Korpa i vraćanje verzije", () => {
    expect(countLabel(null)).toBeNull();
    expect(countLabel({ count: 4, capped: false })).toBe("4");
    expect(countLabel({ count: 20, capped: true })).toBe("20+");
    expect(trashedMessage("Plan lansiranja")).toBe("„Plan lansiranja” je u Korpi.");
    expect(restoreBlockedReason({ canRestoreRevision: false, saveState: "saved" })).toBe("Stranica je zaključana.");
    expect(restoreBlockedReason({ canRestoreRevision: true, saveState: "dirty" })).toBe(
      "Sačekaj da se tvoje izmene sačuvaju.",
    );
    expect(restoreBlockedReason({ canRestoreRevision: true, saveState: "saved" })).toBeNull();
  });
});
