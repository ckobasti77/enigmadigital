// Preneto iz Devotion apps/web/components/workspace/task-page/task-page-model.test.ts (main @ c05c40f), SPAJANJE S12.
import { describe, expect, it } from "vitest";

import type { DocumentPermissions } from "./page-document-model";

import { TASK_CONFLICT_MESSAGE, taskChangeRoute, taskMenuKeys, taskPermissionsOf, taskSaveErrorMessage } from "./task-page-model";

const OPEN: DocumentPermissions = {
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

describe("taskPermissionsOf", () => {
  it("otključan zadatak menja svaki član, i ne-izvršilac (P1)", () => {
    const permissions = taskPermissionsOf(OPEN, false);
    for (const key of ["status", "priority", "due", "instructions", "checkpoints"] as const) {
      expect(permissions[key].allowed).toBe(true);
    }
    expect(permissions.assignees.selfOnly).toBe(false);
  });

  it("zaključan zadatak: autor, vlasnik i admin (canEdit) menjaju sve", () => {
    const permissions = taskPermissionsOf({ canEdit: true, isLocked: true }, false);
    expect(permissions.priority.allowed).toBe(true);
    expect(permissions.assignees.selfOnly).toBe(false);
  });

  it("zaključan zadatak: izvršilac menja samo status, ostali čipovi su sa razlogom (D5)", () => {
    const permissions = taskPermissionsOf({ canEdit: false, isLocked: true }, true);
    expect(permissions.status.allowed).toBe(true);
    expect(permissions.priority.allowed).toBe(false);
    expect(permissions.priority.reason).toMatch(/zaključan/i);
    expect(permissions.due.allowed).toBe(false);
    expect(permissions.instructions.allowed).toBe(false);
    expect(permissions.checkpoints.allowed).toBe(false);
    expect(permissions.assignees.selfOnly).toBe(true);
  });

  it("zaključan zadatak: član koji nije izvršilac ne menja ni status", () => {
    const permissions = taskPermissionsOf({ canEdit: false, isLocked: true }, false);
    expect(permissions.status.allowed).toBe(false);
    expect(permissions.status.reason).toBeTruthy();
  });
});

describe("taskPermissionsOf — istina servera za status", () => {
  it("canChangeStatus sa servera nadjačava spisak izvršilaca koji klijent vidi", () => {
    const locked = { canEdit: false, isLocked: true };
    // Server kaže da sme (izvršilac koga spisak ne prikazuje).
    expect(taskPermissionsOf({ ...locked, canChangeStatus: true }, false).status.allowed).toBe(true);
    // Server kaže da ne sme, iako klijent misli da je izvršilac.
    const denied = taskPermissionsOf({ ...locked, canChangeStatus: false }, true).status;
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBeTruthy();
  });

  it("bez canChangeStatus važi pravilo iz spiska izvršilaca", () => {
    expect(taskPermissionsOf({ canEdit: false, isLocked: true }, true).status.allowed).toBe(true);
  });
});

describe("taskSaveErrorMessage", () => {
  it("konflikt revizije dobija srpski tekst, ne kod sa servera", () => {
    const error = Object.assign(new Error("KONFLIKT_IZMENA"), {
      data: { code: "KONFLIKT_IZMENA", message: "KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.", currentRevision: 7 },
    });
    expect(taskSaveErrorMessage(error, "Izmena nije sačuvana.")).toBe(TASK_CONFLICT_MESSAGE);
  });

  it("ostale greške idu kroz accessErrorMessage sa rezervnim tekstom", () => {
    expect(taskSaveErrorMessage(new Error("Server Error"), "Izmena nije sačuvana.")).toBe("Izmena nije sačuvana.");
    expect(taskSaveErrorMessage("nešto", "Izmena nije sačuvana.")).toBe("Izmena nije sačuvana.");
  });
});

describe("taskChangeRoute", () => {
  it("ko sme da menja zadatak šalje sve kroz updatePage sa revizijom", () => {
    expect(taskChangeRoute({ priority: "high" }, true)).toBe("update");
    expect(taskChangeRoute({ status: "done" }, true)).toBe("update");
    expect(taskChangeRoute({ assigneeProfileIds: ["a"] }, true)).toBe("update");
  });

  it("izvršilac zaključanog zadatka menja samo status, kroz updateMetadata", () => {
    expect(taskChangeRoute({ status: "in_progress" }, false)).toBe("status");
  });

  it("sve ostalo na zaključanom zadatku je odbijeno", () => {
    expect(taskChangeRoute({ priority: "low" }, false)).toBe("denied");
    expect(taskChangeRoute({ dueDate: null }, false)).toBe("denied");
    expect(taskChangeRoute({ assigneeProfileIds: [] }, false)).toBe("denied");
    expect(taskChangeRoute({ instructions: "x" }, false)).toBe("denied");
    expect(taskChangeRoute({ status: "done", priority: "low" }, false)).toBe("denied");
    expect(taskChangeRoute({}, false)).toBe("denied");
  });
});

describe("taskMenuKeys", () => {
  it("zadatak nema mapu: nema 'Prikaži na mapi' ni kad ima podstranice", () => {
    expect(taskMenuKeys(OPEN, { otherAreas: 2 })).not.toContain("map");
  });

  it("redosled kao na stranici: komentari, istorija, zaključaj, premesti, diskusija, obriši", () => {
    expect(taskMenuKeys({ ...OPEN, canLock: true }, { otherAreas: 1 })).toEqual([
      "comments",
      "history",
      "lock",
      "move",
      "discussion",
      "archive",
    ]);
  });

  it("zaključan zadatak koji gledalac sme da otključa nudi 'unlock'; bez prava nema ni arhiviranja", () => {
    expect(taskMenuKeys({ ...OPEN, canUnlock: true, isLocked: true }, { otherAreas: 0 })).toContain("unlock");
    expect(taskMenuKeys({ ...OPEN, canArchive: false, canMove: false }, { otherAreas: 3 })).toEqual([
      "comments",
      "history",
      "discussion",
    ]);
  });
});
