// Preneto iz Devotion packages/backend/convex/lib/permissions.test.ts (main @ c05c40f), SPAJANJE S02.
import { describe, expect, test } from "vitest";

import type { Doc, Id } from "../../_generated/dataModel";
import {
  canArchivePage,
  canChangeChildren,
  canChangeTaskStatus,
  canConvertIdea,
  canEditArea,
  canEditComment,
  canEditIdea,
  canEditPage,
  canLayoutOnMap,
  canLockPage,
  canMovePage,
  canRemoveComment,
  canSetIdeaStage,
  canVoteIdea,
  ideaPermissions,
  isLockedForViewer,
  isManager,
  pagePermissions,
  type Actor,
} from "./permissions";

/**
 * Matrica dozvola (plan K01 §1.2) nad čistim funkcijama. Nečlan, uklonjen
 * član, `client_viewer` i arhiviran profil ovde ne stižu — njih zaustavlja
 * adapter `requireClanProjekta` (`convex/prostor/identitet.test.ts`).
 *
 * SPAJANJE: menadžer je `owner` projekta ili vlasnik platforme (P7), pa
 * Actor nosi izračunat `isManager`; Devotion „admin“ je ovde vlasnik
 * platforme koji je urednik u projektu.
 */

const STARTUP = "startup_a" as Id<"workspaces">;
const OTHER_STARTUP = "startup_b" as Id<"workspaces">;
const OWNER = "p_owner" as Id<"profiles">;
const ADMIN = "p_admin" as Id<"profiles">;
const AUTHOR = "p_author" as Id<"profiles">;
const MEMBER = "p_member" as Id<"profiles">;

function actor(
  profileId: Id<"profiles">,
  options: { role?: "admin" | "member"; workspaceId?: Id<"workspaces"> } = {},
): Actor {
  const owner = profileId === OWNER;
  return {
    profile: { _id: profileId, role: "member", archivedAt: null },
    workspace: { _id: options.workspaceId ?? STARTUP },
    membership: { role: owner ? "owner" : "urednik" },
    isManager: owner || options.role === "admin",
  } as unknown as Actor;
}

const ROLES = {
  member: actor(MEMBER),
  author: actor(AUTHOR),
  owner: actor(OWNER),
  admin: actor(ADMIN, { role: "admin" }),
};

function page(overrides: Partial<Doc<"pages">> = {}): Doc<"pages"> {
  return {
    _id: "page_1" as Id<"pages">,
    workspaceId: STARTUP,
    kind: "note",
    parentPageId: null,
    createdByProfileId: AUTHOR,
    lockedAt: null,
    ...overrides,
  } as Doc<"pages">;
}

function idea(overrides: Partial<Doc<"ideaNodes">> & { stage?: string } = {}) {
  return {
    _id: "idea_1" as Id<"ideaNodes">,
    workspaceId: STARTUP,
    authorProfileId: AUTHOR,
    archivedAt: null,
    convertedPageId: null,
    ...overrides,
  } as Doc<"ideaNodes"> & { stage?: string };
}

describe("uloge", () => {
  test("menadžer = vlasnik startupa ili admin", () => {
    expect(isManager(ROLES.owner)).toBe(true);
    expect(isManager(ROLES.admin)).toBe(true);
    expect(isManager(ROLES.author)).toBe(false);
    expect(isManager(ROLES.member)).toBe(false);
  });

  test("lista bez Actor-a: zaključano za gledaoca = ni autor ni menadžer", () => {
    const locked = page({ lockedAt: 1 });
    expect(isLockedForViewer(locked, { profileId: MEMBER, isManager: false })).toBe(true);
    expect(isLockedForViewer(locked, { profileId: AUTHOR, isManager: false })).toBe(false);
    expect(isLockedForViewer(locked, { profileId: MEMBER, isManager: true })).toBe(false);
    expect(isLockedForViewer(page(), { profileId: MEMBER, isManager: false })).toBe(false);
  });
});

describe("stranica: izmena, status, deca, premeštanje, brisanje (R2–R7)", () => {
  const unlocked = page();
  const locked = page({ lockedAt: 1, lockedByProfileId: AUTHOR });

  test("otključanu menja svaki član", () => {
    for (const role of Object.values(ROLES)) {
      expect(canEditPage(role, unlocked)).toBe(true);
      expect(canChangeChildren(role, unlocked)).toBe(true);
      expect(canMovePage(role, unlocked, null, unlocked)).toBe(true);
      expect(canArchivePage(role, unlocked, null)).toBe(true);
    }
  });

  test("zaključanu menjaju samo autor, vlasnik i admin", () => {
    expect(canEditPage(ROLES.member, locked)).toBe(false);
    expect(canEditPage(ROLES.author, locked)).toBe(true);
    expect(canEditPage(ROLES.owner, locked)).toBe(true);
    expect(canEditPage(ROLES.admin, locked)).toBe(true);
    expect(canArchivePage(ROLES.member, locked, null)).toBe(false);
    expect(canMovePage(ROLES.member, locked, null, null)).toBe(false);
  });

  test("spisak dece zaključanog roditelja menjaju samo autor i menadžer (D4)", () => {
    const child = page({ _id: "page_2" as Id<"pages">, createdByProfileId: MEMBER });
    expect(canChangeChildren(ROLES.member, locked)).toBe(false);
    expect(canMovePage(ROLES.member, child, locked, null)).toBe(false);
    expect(canMovePage(ROLES.member, child, null, locked)).toBe(false);
    expect(canArchivePage(ROLES.member, child, locked)).toBe(false);
    expect(canMovePage(ROLES.owner, child, locked, null)).toBe(true);
    expect(canChangeChildren(ROLES.member, null)).toBe(true);
  });

  test("status zaključanog zadatka menja i izvršilac (D5)", () => {
    const task = page({ kind: "task", lockedAt: 1 });
    expect(canChangeTaskStatus(ROLES.member, task, false)).toBe(false);
    expect(canChangeTaskStatus(ROLES.member, task, true)).toBe(true);
    expect(canChangeTaskStatus(ROLES.admin, task, false)).toBe(true);
  });

  test("zaključavanje: autor, vlasnik, admin — ne običan član", () => {
    for (const target of [unlocked, locked]) {
      expect(canLockPage(ROLES.member, target)).toBe(false);
      expect(canLockPage(ROLES.author, target)).toBe(true);
      expect(canLockPage(ROLES.owner, target)).toBe(true);
      expect(canLockPage(ROLES.admin, target)).toBe(true);
    }
  });

  test("raspored na Mapi menja svaki član i na zaključanoj (D20)", () => {
    for (const role of Object.values(ROLES)) {
      expect(canLayoutOnMap(role)).toBe(true);
      expect(pagePermissions(role, locked, { parent: null, isAssignee: false }).canResize).toBe(true);
    }
  });

  test("drugi startup nema nikakvo pravo", () => {
    const foreign = actor(ADMIN, { role: "admin", workspaceId: OTHER_STARTUP });
    expect(canEditPage(foreign, unlocked)).toBe(false);
    expect(canLockPage(foreign, unlocked)).toBe(false);
    expect(canArchivePage(foreign, unlocked, null)).toBe(false);
    expect(canChangeTaskStatus(foreign, page({ kind: "task" }), true)).toBe(false);
    expect(canEditArea(foreign, { workspaceId: STARTUP })).toBe(false);
    expect(canEditIdea(foreign, idea())).toBe(false);
    expect(
      pagePermissions(foreign, unlocked, { parent: null, isAssignee: true }),
    ).toMatchObject({ canEdit: false, canComment: false, canResize: false });
  });
});

describe("objekat permissions stranice (P25)", () => {
  test("stara polja ostaju, nova se dodaju; glasanje o brisanju je isključeno", () => {
    const child = page({ parentPageId: "page_0" as Id<"pages"> });
    const parent = page({ _id: "page_0" as Id<"pages"> });
    expect(
      pagePermissions(ROLES.member, child, { parent, isAssignee: false }),
    ).toEqual({
      canEdit: true,
      canEditBody: true,
      canMove: true,
      canResize: true,
      canDetach: true,
      canDeleteDirectly: true,
      canRequestDeletion: false,
      canArchive: true,
      canChangeStatus: true,
      canLock: false,
      canUnlock: false,
      canComment: true,
      canRestoreRevision: true,
      isLocked: false,
    });
  });

  test("zaključana: član čita i komentariše, autor otključava", () => {
    const locked = page({ kind: "task", lockedAt: 5 });
    expect(
      pagePermissions(ROLES.member, locked, { parent: null, isAssignee: true }),
    ).toMatchObject({
      canEdit: false,
      canEditBody: false,
      canMove: false,
      canDeleteDirectly: false,
      canArchive: false,
      canChangeStatus: true,
      canLock: false,
      canUnlock: false,
      canComment: true,
      canRestoreRevision: false,
      isLocked: true,
    });
    expect(
      pagePermissions(ROLES.author, locked, { parent: null, isAssignee: false }),
    ).toMatchObject({ canEdit: true, canLock: false, canUnlock: true });
  });
});

describe("oblast i ideja (R15–R17)", () => {
  test("opis oblasti menja svaki član", () => {
    for (const role of Object.values(ROLES)) {
      expect(canEditArea(role, { workspaceId: STARTUP })).toBe(true);
    }
  });

  test("tekst i glas: svaki član; faza i konverzija: autor ili menadžer", () => {
    const proposal = idea();
    const approved = idea({ stage: "odobreno" });
    expect(canEditIdea(ROLES.member, proposal)).toBe(true);
    expect(canVoteIdea(ROLES.member, proposal)).toBe(true);
    expect(canSetIdeaStage(ROLES.member, proposal)).toBe(false);
    expect(canSetIdeaStage(ROLES.author, proposal)).toBe(true);
    expect(canSetIdeaStage(ROLES.owner, proposal)).toBe(true);
    expect(canSetIdeaStage(ROLES.admin, proposal)).toBe(true);
    expect(canConvertIdea(ROLES.author, proposal)).toBe(false);
    expect(canConvertIdea(ROLES.author, approved)).toBe(true);
    expect(canConvertIdea(ROLES.member, approved)).toBe(false);
  });

  test("arhivirana i pretvorena ideja", () => {
    expect(canEditIdea(ROLES.member, idea({ archivedAt: 1 }))).toBe(false);
    const converted = idea({ convertedPageId: "page_9" as Id<"pages">, stage: "odobreno" });
    expect(canVoteIdea(ROLES.member, converted)).toBe(false);
    expect(canSetIdeaStage(ROLES.author, converted)).toBe(false);
    expect(ideaPermissions(ROLES.member, idea())).toEqual({
      canEdit: true,
      canVote: true,
      canSetStage: false,
      canConvert: false,
      canArchive: true,
      canComment: true,
    });
  });
});

describe("komentar (R13–R14)", () => {
  const comment = {
    workspaceId: STARTUP,
    authorProfileId: MEMBER,
    sourceKind: undefined,
  } as Doc<"contentContributions">;

  test("izmena samo autor, uklanjanje autor ili menadžer", () => {
    expect(canEditComment(ROLES.member, comment)).toBe(true);
    expect(canEditComment(ROLES.owner, comment)).toBe(false);
    expect(canRemoveComment(ROLES.author, comment)).toBe(false);
    expect(canRemoveComment(ROLES.owner, comment)).toBe(true);
    expect(canRemoveComment(ROLES.admin, comment)).toBe(true);
  });

  test("telo stranice i ideje nije komentar", () => {
    for (const sourceKind of ["page_body", "idea_original"] as const) {
      const body = { ...comment, sourceKind } as Doc<"contentContributions">;
      expect(canEditComment(ROLES.member, body)).toBe(false);
      expect(canRemoveComment(ROLES.admin, body)).toBe(false);
    }
  });
});
