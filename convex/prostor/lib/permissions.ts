// Preneto iz Devotion packages/backend/convex/lib/permissions.ts (main @ c05c40f), SPAJANJE S02.
import { ConvexError, v, type Value } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { isManager, type Actor } from "./auth";

export { isManager, isOwner, type Actor } from "./auth";

/**
 * Dozvole tima (PROSTOR P1, plan K01 §1). JEDNO mesto koje odlučuje ko sme šta
 * u startupu — moduli ne porede `createdByProfileId` sami.
 *
 * - Član menja naslov, sadržaj i osobine svake stranice, zadatka, oblasti i
 *   ideje; premešta, briše u Korpu, vraća, komentariše i glasa.
 * - Autor stranice je još i zaključava/otključava.
 * - Vlasnik startupa i admin (menadžer) zaključavaju bilo koju stranicu, menjaju
 *   fazu bilo koje ideje i sklanjaju bilo koji komentar.
 * - Zaključana stranica: naslov, sadržaj, osobine, premeštanje, brisanje i
 *   spisak dece menjaju samo autor i menadžer; izvršilac i dalje menja status i
 *   završava korake; ostali čitaju i komentarišu.
 *
 * Funkcije su čiste (bez `ctx`): `actor` dolazi iz `requireClanProjekta`
 * (`./auth`), pa nečlan, `client_viewer` i arhiviran profil ovde nikad ne
 * stižu. Menadžer je `owner` projekta ili vlasnik platforme (P7). Svaka
 * funkcija vraća `false` kad stavka ne pripada projektu iz `actor`-a.
 */

type PageLike = Pick<
  Doc<"pages">,
  "workspaceId" | "createdByProfileId" | "lockedAt" | "kind"
>;
type IdeaLike = Pick<
  Doc<"ideaNodes">,
  "workspaceId" | "authorProfileId" | "archivedAt" | "convertedPageId"
> & { stage?: string | null };
type CommentLike = Pick<
  Doc<"contentContributions">,
  "workspaceId" | "authorProfileId" | "sourceKind"
>;

// --- Uloge -------------------------------------------------------------------

// `isManager` i `isOwner` su u adapteru (`./auth`). Devotion `isAdmin` i
// `isManagerProfile` čitali su `profiles.role`; liste kroz više projekata
// koriste `jeMenadzerProjekta` iz adaptera (S01 §3.2).

function inWorkspace(actor: Actor, item: { workspaceId: Id<"workspaces"> | null }) {
  return item.workspaceId === actor.workspace._id;
}

export function isPageLocked(page: Pick<Doc<"pages">, "lockedAt">): boolean {
  return page.lockedAt !== undefined && page.lockedAt !== null;
}

// --- Stranice i zadaci -------------------------------------------------------

/** R2: naslov, sadržaj, osobine, koraci, tabela, prilozi. */
export function canEditPage(actor: Actor, page: PageLike): boolean {
  if (!inWorkspace(actor, page)) return false;
  if (!isPageLocked(page)) return true;
  return (
    page.createdByProfileId === actor.profile._id || isManager(actor)
  );
}

/**
 * `!canEditPage` za liste bez `Actor`-a: zaključana, a gledalac nije autor ni
 * menadžer. Klijent iz ovoga gradi shared `taskPermissions`.
 */
export function isLockedForViewer(
  page: Pick<Doc<"pages">, "createdByProfileId" | "lockedAt">,
  viewer: { profileId: Id<"profiles">; isManager: boolean },
): boolean {
  return (
    isPageLocked(page) &&
    page.createdByProfileId !== viewer.profileId &&
    !viewer.isManager
  );
}

/** R3: status zadatka i završavanje koraka (izvršilac i na zaključanom). */
export function canChangeTaskStatus(
  actor: Actor,
  page: PageLike,
  isAssignee: boolean,
): boolean {
  if (!inWorkspace(actor, page)) return false;
  return canEditPage(actor, page) || isAssignee;
}

/** R6: spisak dece. `null` = koren oblasti (uvek dozvoljen članu). */
export function canChangeChildren(
  actor: Actor,
  parent: PageLike | null,
): boolean {
  return parent === null || canEditPage(actor, parent);
}

/** R5: promena roditelja ili oblasti — stranica i oba roditelja. */
export function canMovePage(
  actor: Actor,
  page: PageLike,
  from: PageLike | null,
  to: PageLike | null,
): boolean {
  return (
    canEditPage(actor, page) &&
    canChangeChildren(actor, from) &&
    canChangeChildren(actor, to)
  );
}

/** R7 bez provere zaključanih potomaka (to radi brisanje grane). */
export function canArchivePage(
  actor: Actor,
  page: PageLike,
  parent: PageLike | null,
): boolean {
  return canEditPage(actor, page) && canChangeChildren(actor, parent);
}

/** R9: zaključaj / otključaj. */
export function canLockPage(actor: Actor, page: PageLike): boolean {
  if (!inWorkspace(actor, page)) return false;
  return (
    page.createdByProfileId === actor.profile._id || isManager(actor)
  );
}

/** R11: pozicija i veličina kartice na Mapi (raspored nije sadržaj). */
export function canLayoutOnMap(actor: Actor): boolean {
  // U Enigmi uklonjen član nema red u `members`; adapter pušta samo owner/urednik.
  return actor.membership.role === "owner" || actor.membership.role === "urednik";
}

/** R12: komentar (i na zaključanoj stranici). */
export function canComment(actor: Actor): boolean {
  return actor.membership.role === "owner" || actor.membership.role === "urednik";
}

// --- Oblasti i ideje ---------------------------------------------------------

/** R15: naziv i opis oblasti. */
export function canEditArea(
  actor: Actor,
  area: Pick<Doc<"areas">, "workspaceId">,
): boolean {
  return inWorkspace(actor, area);
}

/** R16: naslov, tekst i boja ideje. */
export function canEditIdea(actor: Actor, idea: IdeaLike): boolean {
  return inWorkspace(actor, idea) && idea.archivedAt === null;
}

export function canArchiveIdea(actor: Actor, idea: IdeaLike): boolean {
  return canEditIdea(actor, idea);
}

export function canVoteIdea(actor: Actor, idea: IdeaLike): boolean {
  return canEditIdea(actor, idea) && idea.convertedPageId === null;
}

/** R17: faza ideje — autor ili menadžer, dok ideja nije postala zadatak. */
export function canSetIdeaStage(actor: Actor, idea: IdeaLike): boolean {
  return (
    canEditIdea(actor, idea) &&
    idea.convertedPageId === null &&
    (idea.authorProfileId === actor.profile._id || isManager(actor))
  );
}

/** R17: „Pretvori" samo u fazi Odobreno. */
export function canConvertIdea(actor: Actor, idea: IdeaLike): boolean {
  return canSetIdeaStage(actor, idea) && idea.stage === "odobreno";
}

// --- Komentari ---------------------------------------------------------------

function isBodySource(row: CommentLike) {
  return row.sourceKind === "page_body" || row.sourceKind === "idea_original";
}

/** R13: komentar menja samo njegov autor. */
export function canEditComment(actor: Actor, row: CommentLike): boolean {
  return (
    inWorkspace(actor, row) &&
    !isBodySource(row) &&
    row.authorProfileId === actor.profile._id
  );
}

/** R14: ukloni/vrati — autor komentara ili menadžer. */
export function canRemoveComment(actor: Actor, row: CommentLike): boolean {
  if (!inWorkspace(actor, row) || isBodySource(row)) return false;
  return row.authorProfileId === actor.profile._id || isManager(actor);
}

// --- Objekti za klijente (P25: stara polja ostaju, nova se dodaju) ----------

export const pagePermissionsValidator = v.object({
  canEdit: v.boolean(),
  canEditBody: v.boolean(),
  canMove: v.boolean(),
  canResize: v.boolean(),
  canDetach: v.boolean(),
  canDeleteDirectly: v.boolean(),
  canRequestDeletion: v.boolean(),
  canArchive: v.boolean(),
  canChangeStatus: v.boolean(),
  canLock: v.boolean(),
  canUnlock: v.boolean(),
  canComment: v.boolean(),
  canRestoreRevision: v.boolean(),
  isLocked: v.boolean(),
});

export type PagePermissions = {
  canEdit: boolean;
  canEditBody: boolean;
  canMove: boolean;
  canResize: boolean;
  canDetach: boolean;
  canDeleteDirectly: boolean;
  /** Glasanje o brisanju više ne postoji (P4); polje ostaje zbog starih klijenata. */
  canRequestDeletion: boolean;
  canArchive: boolean;
  canChangeStatus: boolean;
  canLock: boolean;
  canUnlock: boolean;
  canComment: boolean;
  canRestoreRevision: boolean;
  isLocked: boolean;
};

export function pagePermissions(
  actor: Actor,
  page: PageLike & { parentPageId: Id<"pages"> | null },
  extra: { parent: PageLike | null; isAssignee: boolean },
): PagePermissions {
  const edit = canEditPage(actor, page);
  const canMove = edit && canChangeChildren(actor, extra.parent);
  const canArchive = canArchivePage(actor, page, extra.parent);
  const lockRights = canLockPage(actor, page);
  const locked = isPageLocked(page);
  return {
    canEdit: edit,
    canEditBody: edit,
    canMove,
    canResize: inWorkspace(actor, page) && canLayoutOnMap(actor),
    canDetach: page.parentPageId !== null && canMove,
    canDeleteDirectly: canArchive,
    canRequestDeletion: false,
    canArchive,
    canChangeStatus:
      page.kind === "task"
        ? canChangeTaskStatus(actor, page, extra.isAssignee)
        : edit,
    canLock: lockRights && !locked,
    canUnlock: lockRights && locked,
    canComment: inWorkspace(actor, page) && canComment(actor),
    canRestoreRevision: edit,
    isLocked: locked,
  };
}

export type IdeaPermissions = {
  canEdit: boolean;
  canVote: boolean;
  canSetStage: boolean;
  canConvert: boolean;
  canArchive: boolean;
  canComment: boolean;
};

export function ideaPermissions(actor: Actor, idea: IdeaLike): IdeaPermissions {
  return {
    canEdit: canEditIdea(actor, idea),
    canVote: canVoteIdea(actor, idea),
    canSetStage: canSetIdeaStage(actor, idea),
    canConvert: canConvertIdea(actor, idea),
    canArchive: canArchiveIdea(actor, idea),
    canComment: inWorkspace(actor, idea) && canComment(actor),
  };
}

export function commentPermissions(
  actor: Actor,
  row: CommentLike,
): { canEdit: boolean; canRemove: boolean } {
  return {
    canEdit: canEditComment(actor, row),
    canRemove: canRemoveComment(actor, row),
  };
}

// --- Greške (ConvexError: u produkciji se poruka običnog Error-a skriva) ----

export type PermissionErrorCode =
  | "ZAKLJUCANO"
  | "NEMA_DOZVOLU"
  | "STARI_TOK"
  | "KONFLIKT_IZMENA";

export const LOCKED_PAGE_MESSAGE =
  "Stranica je zaključana. Menja je autor ili vlasnik projekta.";
export const CONFLICT_MESSAGE =
  "KONFLIKT_IZMENA: Neko iz tima je u međuvremenu izmenio ovu stranicu.";

export function permissionError(
  code: PermissionErrorCode,
  message: string,
  extra: Record<string, Value> = {},
) {
  return new ConvexError({ ...extra, code, message });
}

export function assertCanEditPage(actor: Actor, page: PageLike): void {
  if (!inWorkspace(actor, page)) {
    throw permissionError("NEMA_DOZVOLU", "Stranica nije pronađena.");
  }
  if (!canEditPage(actor, page)) {
    throw permissionError("ZAKLJUCANO", LOCKED_PAGE_MESSAGE);
  }
}

export function assertCanChangeChildren(
  actor: Actor,
  parent: (PageLike & { title: string }) | null,
): void {
  if (parent === null || canChangeChildren(actor, parent)) return;
  throw permissionError(
    "ZAKLJUCANO",
    `„${parent.title}” je zaključana — podstranice menja autor ili vlasnik projekta.`,
  );
}

/**
 * R5: premeštanje/ugnežđavanje/odvajanje. Stranica po R2, a stari i novi
 * roditelj po R6 (zaključan roditelj čuva spisak svoje dece — D4).
 */
export function assertCanMovePage(
  actor: Actor,
  page: PageLike & { title: string },
  from: (PageLike & { title: string }) | null,
  to: (PageLike & { title: string }) | null,
): void {
  assertCanEditPage(actor, page);
  assertCanChangeChildren(actor, from);
  assertCanChangeChildren(actor, to);
}

/** R7 bez zaključanih potomaka (njih proverava `lib/trash`, D6). */
export function assertCanArchivePage(
  actor: Actor,
  page: PageLike & { title: string },
  parent: (PageLike & { title: string }) | null,
): void {
  assertCanEditPage(actor, page);
  assertCanChangeChildren(actor, parent);
}

/** D6: zaključana stranica u grani koja se briše ili seli u drugu oblast. */
export function assertCanTouchLockedBranch(
  actor: Actor,
  branch: ReadonlyArray<PageLike & { title: string }>,
): void {
  for (const page of branch) {
    if (canEditPage(actor, page)) continue;
    throw permissionError(
      "ZAKLJUCANO",
      `„${page.title}” je zaključana — granu sa njom menja autor ili vlasnik projekta.`,
    );
  }
}

/** R20: „Oporavljeno" uklanja onaj za koga je sačuvano ili menadžer. */
export function canDismissRecovered(
  actor: Actor,
  recovered: Pick<Doc<"recoveredContent">, "workspaceId" | "createdByProfileId">,
): boolean {
  if (!inWorkspace(actor, recovered)) return false;
  return (
    recovered.createdByProfileId === actor.profile._id ||
    isManager(actor)
  );
}

export const LEGACY_DELETION_VOTE_MESSAGE =
  "Glasanje o brisanju više ne postoji. Obrisano ide u Korpu, odakle ga svako može vratiti.";
export const LEGACY_NESTING_MESSAGE =
  "Zahtevi za ugnežđavanje više ne postoje — premesti stranicu direktno.";

/**
 * Konflikt revizije (P23). Poruka zadržava stari prefiks `KONFLIKT_IZMENA:`, pa
 * je prepoznaju i stari klijenti (`String(error).includes(...)`); novi čitaju
 * `data.code` i `data.currentRevision`.
 */
export function conflictError(
  current: {
    revision: number;
    updatedByProfileId: Id<"profiles"> | null;
    updatedAt: number;
  },
  message: string = CONFLICT_MESSAGE,
) {
  return permissionError("KONFLIKT_IZMENA", message, {
    currentRevision: current.revision,
    updatedByProfileId: current.updatedByProfileId,
    updatedAt: current.updatedAt,
  });
}
