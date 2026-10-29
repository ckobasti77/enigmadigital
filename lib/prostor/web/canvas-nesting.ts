// Preneto iz Devotion apps/web/lib/canvas-nesting.ts (main @ c05c40f), SPAJANJE S14.
/**
 * Apsolutne vs relativne koordinate ugnježdenih čvorova (kanvas ideja i misli).
 *
 * **Zašto ovaj modul postoji.** Baza čuva poziciju ugnježdenog čvora **relativno u
 * odnosu na roditelja** (`ideaNodes.parentIdeaId`, `thoughtNodes.parentThoughtId`).
 * Desktop taj oblik nikad ne prevodi: koristi xyflow `parentId`, pa je i
 * `node.position` koji dobije iz `onNodeDragStop` već relativan
 * (`ideas-canvas-view.tsx:209` i `:965–969`).
 *
 * Mobilni embed graf crta **ravno** — bez `parentId`, sa apsolutnim pozicijama —
 * jer bi parent/child grafika tražila poseban redosled čvorova, a `thoughts.listNodes`
 * pagira po `updatedAt`, ne po hijerarhiji. Zato embed mora sam da prevodi:
 * apsolutno za crtanje, relativno za upis.
 *
 * **Zamka koju modul zatvara.** Ako se `node.position` iz `onNodeDragStop` prosledi
 * pravo u `updatePositions`/`moveNodes`, svaki ugnježden čvor dobije poziciju
 * uvećanu za offset roditelja. Greška je tiha: čvor „odskoči" tek na sledeći render
 * i to najčešće vidi neko drugi. Nema tipa koji to razlikuje — zato test, a ne oprez.
 *
 * Modul je čist TS (nula uvoza) da može i iz embeda i iz testa.
 */

/** Minimum koji obe vrste čvora imaju; `parentId === null` je koren. */
export type NestedNode = {
  id: string;
  x: number;
  y: number;
  parentId: string | null;
};

export type NestedPoint = { x: number; y: number };

/**
 * Zaštita od ciklusa u lancu roditelja. Podaci ne bi smeli da ga naprave, ali
 * jedan pokvaren red ne sme da zamrzne ceo kanvas u beskonačnoj petlji.
 */
function walkParents(
  node: NestedNode,
  byId: Map<string, NestedNode>,
  visit: (ancestor: NestedNode) => void,
): void {
  const seen = new Set<string>([node.id]);
  let parentId = node.parentId;
  while (parentId !== null && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (parent === undefined) break;
    visit(parent);
    parentId = parent.parentId;
  }
}

/** Apsolutna pozicija svakog čvora = njegova + zbir celog lanca roditelja. */
export function absolutePositions(
  nodes: readonly NestedNode[],
): Map<string, NestedPoint> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result = new Map<string, NestedPoint>();
  for (const node of nodes) {
    let x = node.x;
    let y = node.y;
    walkParents(node, byId, (ancestor) => {
      x += ancestor.x;
      y += ancestor.y;
    });
    result.set(node.id, { x, y });
  }
  return result;
}

/**
 * Inverz: apsolutna pozicija sa platna → ono što ide u bazu.
 *
 * `absoluteById` je snimak pozicija **od pre poteza** (roditelj se u istom potezu
 * mogao i sam pomeriti — tada `movedById` nosi i njegovu novu apsolutnu poziciju,
 * pa se odbija ta, a ne stara).
 */
export function toStoredPosition(
  nodeId: string,
  absolute: NestedPoint,
  nodes: readonly NestedNode[],
  absoluteById: Map<string, NestedPoint>,
  movedById?: Map<string, NestedPoint>,
): NestedPoint {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const node = byId.get(nodeId);
  if (node === undefined || node.parentId === null) return absolute;
  const parentId = node.parentId;
  const parentAbsolute =
    movedById?.get(parentId) ?? absoluteById.get(parentId) ?? null;
  if (parentAbsolute === null) return absolute;
  return { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y };
}

/**
 * Prevodi ceo potez odjednom — ono što embed zove na `onNodeDragStop`.
 *
 * Vraća SAMO čvorove kojima se upisana (relativna) pozicija stvarno promenila.
 * Ugnježden čvor koji je povučen ZAJEDNO sa roditeljem se tako sam izostavlja:
 * oba su se pomerila za isti pomeraj, pa im je međusobni odnos ostao isti i u bazi
 * nema šta da se menja.
 */
export function storedMovesFor(
  moves: readonly { id: string; x: number; y: number }[],
  nodes: readonly NestedNode[],
): Array<{ id: string; x: number; y: number }> {
  const absoluteById = absolutePositions(nodes);
  const movedById = new Map<string, NestedPoint>(
    moves.map((move) => [move.id, { x: move.x, y: move.y }]),
  );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const result: Array<{ id: string; x: number; y: number }> = [];
  for (const move of moves) {
    const node = byId.get(move.id);
    if (node === undefined) continue;
    const stored = toStoredPosition(
      move.id,
      { x: move.x, y: move.y },
      nodes,
      absoluteById,
      movedById,
    );
    const x = Math.round(stored.x);
    const y = Math.round(stored.y);
    if (x === Math.round(node.x) && y === Math.round(node.y)) continue;
    result.push({ id: move.id, x, y });
  }
  return result;
}
