// Preneto iz Devotion apps/web/lib/canvas-node-size.ts (main @ c05c40f), SPAJANJE S14.
/**
 * Granice veličine kartice STRANICE na kanvasu (oblast i stranica) — jedan izvor za
 * desktop kanvas (`components/workspace/canvases/area-flow-node.tsx`) i za mobilni
 * embed (`app/embed/canvas/[kind]/[id]/embed-node.tsx`).
 *
 * MORAJU da prate `packages/backend/convex/areasV2.ts:85–88` (`MIN_WIDTH`,
 * `MIN_HEIGHT`, `MAX_WIDTH`, `MAX_HEIGHT`) — server je merodavan i sam klampuje
 * (`resizePage`), pa je najgori ishod raskoraka da se kartica „vrati" na serversku
 * vrednost. Web ne uvozi backend module (te konstante nisu ni izvezene), pa je
 * sinhronizacija ovaj komentar + test T7 iz `docs/mobile/lanac4/planovi/faza-k2.md`.
 *
 * Podrazumevana veličina je iz `packages/backend/convex/canvasPlacement.ts:4–5`
 * (`DEFAULT_CANVAS_NODE_WIDTH` / `DEFAULT_CANVAS_NODE_HEIGHT`) — na nju vraća
 * `areasV2.resetPageSize`.
 *
 * Čvorovi ideja i misli imaju DRUGE granice (`idea-flow-node.tsx`,
 * `thought-node.tsx`) i ulaze ovde tek u K5.
 */
export const PAGE_NODE_SIZE = {
  minWidth: 240,
  minHeight: 168,
  maxWidth: 720,
  maxHeight: 1_000,
  defaultWidth: 288,
  defaultHeight: 196,
} as const;

/**
 * Granice oblačića KORAKA zadatka na kanvasu (SPAJANJE S14): iste kao
 * `taskCheckpoints.saveCanvasPlacement` (140–520 × 92–600). Devotion ih je
 * držao inline u čvoru i u kopiji za telefon; telefon u Enigmi još ne postoji,
 * pa je ovo jedini izvor i čvor ga čita.
 */
export const CHECKPOINT_NODE_SIZE = {
  minWidth: 140,
  minHeight: 92,
  maxWidth: 520,
  maxHeight: 600,
} as const;
