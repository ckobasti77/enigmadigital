// Preneto iz Devotion apps/web/components/workspace/task-page/task-page-model.ts (main @ c05c40f), SPAJANJE S12.
/**
 * Čista logika zadatka na celu stranu (PROSTOR P14, plan K07 §5.7): koje osobine
 * gledalac sme da menja, koji poziv nosi promenu čipa i meni „…". Testovi:
 * `task-page-model.test.ts`.
 */
import { PERMISSION_REASONS, taskPermissions, type TaskPermissions } from "..";

import { conflictFromError } from "./page-autosave-model";
import { pageMenuKeys, type DocumentPermissions, type PageMenuKey } from "./page-document-model";
import { accessErrorMessage } from "../web/greske";

/**
 * Dozvole čipova, koraka i instrukcija iz `permissions` stranice (klijent ne
 * računa „autor" sam, R16): otključan zadatak menja svaki član; na zaključanom
 * menjaju autor, vlasnik i admin (`canEdit`), a izvršilac samo status i korake
 * (D5). Ostali dobijaju katanac sa razlogom. `canChangeStatus` (`pages.get`)
 * je istina servera za status — spisak izvršilaca koji klijent vidi može da
 * izostavi člana koga server ne prikazuje.
 */
export function taskPermissionsOf(
  permissions: Pick<DocumentPermissions, "isLocked" | "canEdit"> & { canChangeStatus?: boolean },
  isAssignee: boolean,
): TaskPermissions {
  const result = taskPermissions({
    kind: "task",
    isCreator: false,
    isAssignee,
    lockedForViewer: permissions.isLocked && !permissions.canEdit,
  });
  if (permissions.canChangeStatus === undefined || permissions.canChangeStatus === result.status.allowed) return result;
  return {
    ...result,
    status: permissions.canChangeStatus
      ? { allowed: true, reason: null }
      : { allowed: false, reason: PERMISSION_REASONS.lockedStatus },
  };
}

/** Poruka za grešku čuvanja zadatka: konflikt revizije dobija srpski tekst umesto koda sa servera. */
export const TASK_CONFLICT_MESSAGE = "Neko je u međuvremenu izmenio zadatak. Pokušaj ponovo za trenutak.";

export function taskSaveErrorMessage(error: unknown, fallback: string): string {
  return conflictFromError(error) !== null ? TASK_CONFLICT_MESSAGE : accessErrorMessage(error, fallback);
}

/** Meni „…" zadatka: kao stranica, ali bez „Prikaži na mapi" — zadatak nema mapu (P14). */
export function taskMenuKeys(
  permissions: DocumentPermissions,
  context: { otherAreas: number },
): PageMenuKey[] {
  return pageMenuKeys(permissions, { hasChildren: false, otherAreas: context.otherAreas });
}

/** Promena čipa kako je daje `TaskDetailLayout`. */
export type TaskChange = {
  status?: string;
  priority?: string;
  dueDate?: number | null;
  assigneeProfileIds?: string[];
  instructions?: string | null;
};

/**
 * Kojim putem ide promena čipa: ko sme da menja zadatak šalje je kroz
 * `areasV2.updatePage` sa revizijom (isti red kao naslov); izvršilac zaključanog
 * zadatka menja samo status, kroz `tasks.updateMetadata`; ostalo je odbijeno
 * (čip je već zaključan, server je ionako izvor istine).
 */
export type TaskChangeRoute = "update" | "status" | "denied";

export function taskChangeRoute(change: TaskChange, canEdit: boolean): TaskChangeRoute {
  if (canEdit) return "update";
  const touchesOnlyStatus =
    change.status !== undefined &&
    change.priority === undefined &&
    change.dueDate === undefined &&
    change.assigneeProfileIds === undefined &&
    change.instructions === undefined;
  return touchesOnlyStatus ? "status" : "denied";
}
