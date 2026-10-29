// Preneto iz Devotion apps/web/lib/motion/rail-indicator.ts (main @ c05c40f), SPAJANJE S08.
/**
 * Geometrija indikatora trake — ČISTO (vitest). Indikator je apsolutno
 * pozicioniran u kontejneru (`position: relative`), pa mu treba okvir
 * izabrane stavke u koordinatama kontejnera, uz skrol kontejnera.
 */

export type Rect = { left: number; top: number; width: number; height: number };
export type Frame = { x: number; y: number; width: number; height: number };

export function frameWithin(
  container: Rect,
  item: Rect,
  scroll: { left: number; top: number } = { left: 0, top: 0 },
): Frame {
  return {
    x: item.left - container.left + scroll.left,
    y: item.top - container.top + scroll.top,
    width: item.width,
    height: item.height,
  };
}

/** Da li se okviri razlikuju više od pola piksela (izbegava prazne tween-ove). */
export function framesDiffer(a: Frame | null, b: Frame): boolean {
  if (!a) return true;
  return (
    Math.abs(a.x - b.x) > 0.5 ||
    Math.abs(a.y - b.y) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  );
}
