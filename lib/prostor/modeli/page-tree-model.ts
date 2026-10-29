// Preneto iz Devotion apps/web/components/workspace/page-tree-model.ts (main @ c05c40f), SPAJANJE S10.
/** Čista logika stabla stranica u meniju startupa (PROSTOR P11, K08). */

/**
 * Meni startupa pokazuje najviše ovoliko stranica po nivou (PROSTOR P11);
 * ostatak je iza „Prikaži još" (oblast ili stranica-roditelj).
 */
export const PAGE_TREE_VISIBLE = 7;

/** „Prikaži još (N)" — „N+" kad server ima još neučitanih. */
export function showMoreLabel(hidden: number, more: boolean): string {
  if (hidden === 0) return "Prikaži još";
  return `Prikaži još (${hidden}${more ? "+" : ""})`;
}

/**
 * Prevlačenje u stablu (PROSTOR P1, K02 R5): svaki član pomera stranicu,
 * osim zaključane — nju autor, vlasnik startupa ili admin. Server je izvor
 * istine (D6, R6); ovo samo ne nudi potez koji bi sigurno bio odbijen.
 */
export function canDragPage(
  page: { lockedAt?: number | null; createdByProfileId: string },
  viewer: { profileId: string; canManage: boolean },
): boolean {
  if (page.lockedAt === undefined || page.lockedAt === null) return true;
  return viewer.canManage || page.createdByProfileId === viewer.profileId;
}
