// Preneto iz Devotion apps/web/components/map/map-model.ts (main @ c05c40f), SPAJANJE S14.
import { formatEditTime } from "..";

import {
  classifyDeadline,
  deadlineAriaLabel,
  deadlineLabel,
} from "../web/deadline";
import {
  PAGE_KIND_KEYS,
  PAGE_KIND_META,
  fileKindLabel,
  type PageFileCategory,
  type PageKind,
} from "../web/vrste-stranica";
import { TASK_STATUS_META, type TaskStatus } from "../web/projekat";

/**
 * Mapa (PROSTOR P15, plan K07 §7) — čista logika koju dele kanvas oblasti i
 * stranice, kanvas ideja, embed za telefon i izlog. Bez React-a i Convex-a.
 */

/** Vrsta kartice: stranica (četiri vrste) ili ideja. */
export type MapCardKind = PageKind | "idea";

/** Boje koje korisnik bira za ideju (isti union kao `ideaColorValidator`). */
export type MapCardColor = "neutral" | "violet" | "blue" | "green" | "amber" | "rose";

/** Ton statusa zadatka — boja tačke nosi samo status (DIZAJN-SMIRENJE §1). */
export type MapTaskTone = "done" | "blocked" | "progress" | "idle";

export type MapCardTask = {
  statusLabel: string;
  statusTone: MapTaskTone;
  due: { label: string; ariaLabel: string; overdue: boolean } | null;
  steps: { done: number; total: number } | null;
};

export type MapCardIdea = {
  stageLabel: string;
  up: number;
  down: number;
  myVote: "up" | "down" | null;
};

/** Sve što kartica crta — gotovi tekstovi, bez računanja u komponenti. */
export type MapCardContent = {
  kind: MapCardKind | null;
  kindLabel: string;
  title: string;
  snippet: string | null;
  /** „Ana · pre 2 dana" — ko i kad, jedan red. */
  byline: string | null;
  /** Broj podstranica („3", „9+"); `null` = nema ili nije poznato. */
  childCount: string | null;
  locked: boolean;
  task: MapCardTask | null;
  idea: MapCardIdea | null;
  color: MapCardColor | null;
};

export const MAP_UNTITLED = "Bez naslova";

/** Oznaka dok mapa ne prima točkić (K07 §7). */
export const MAP_INACTIVE_HINT = "Klikni u mapu za pomeranje · Ctrl + točkić za zum";

/** Natpis na cilju dok se kartica prevlači preko njega. */
export const MAP_NEST_PROMPT = "Pusti da ugnezdiš";

/** Najduži isečak koji kartica nosi (tri reda na najvećoj kartici). */
const SNIPPET_MAX = 280;

export function mapCardTitle(title: string | null | undefined): string {
  const trimmed = (title ?? "").trim();
  return trimmed.length > 0 ? trimmed : MAP_UNTITLED;
}

/** Jedan red teksta za isečak: bez praznih redova i višestrukih razmaka. */
export function mapCardSnippet(text: string | null | undefined): string | null {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length === 0) return null;
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX - 1).trimEnd()}…` : flat;
}

/** Najduži isečak koji server šalje za karticu Mape (`areasV2.ts › canvasPreview`). */
export const MAP_SERVER_PREVIEW_MAX = 480;

/**
 * Tekst kartice bez ponovljenog naslova: server za praznu stranicu šalje naslov
 * kao isečak (`canvasPreview` = uputstvo || sadržaj || naslov).
 */
export function mapPageText(title: string, text: string): string {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
  return normalize(text) === normalize(title) ? "" : text;
}

export function mapByline(
  name: string | null | undefined,
  at: number | null | undefined,
  now: number,
): string | null {
  const who = name?.trim() || null;
  const when = at === null || at === undefined ? null : formatEditTime(at, now);
  if (who && when) return `${who} · ${when}`;
  return who ?? when;
}

/** Broj podstranica sa servera (`pages.childCounts`, granica 9 → „9+"). */
export function mapChildCountLabel(
  entry: { count: number; capped: boolean } | null | undefined,
): string | null {
  if (!entry || entry.count <= 0) return null;
  return entry.capped ? `${entry.count}+` : String(entry.count);
}

export function mapTaskTone(status: TaskStatus | null): MapTaskTone {
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  if (status === "in_progress") return "progress";
  return "idle";
}

export type MapPageInput = {
  title: string;
  text: string;
  kind: PageKind;
  taskStatus: TaskStatus | null;
  dueDate: number | null;
  checkpointTotal: number;
  checkpointCompleted: number;
  fileCategory: PageFileCategory | null;
  updatedAt: number;
  isLocked?: boolean;
  creatorName: string | null;
};

/** Kartica stranice na Mapi: vrsta, naslov, isečak, ko i kad, zadatak. */
export function mapPageCard(
  page: MapPageInput,
  now: number,
  childCount: { count: number; capped: boolean } | null = null,
): MapCardContent {
  const isTask = page.kind === "task";
  const deadline = isTask
    ? classifyDeadline({ dueDate: page.dueDate, taskStatus: page.taskStatus, now })
    : null;
  return {
    kind: page.kind,
    kindLabel: page.kind === "file" ? fileKindLabel(page.fileCategory) : PAGE_KIND_META[page.kind].label,
    title: mapCardTitle(page.title),
    snippet: mapCardSnippet(mapPageText(page.title, page.text)),
    byline: mapByline(page.creatorName, page.updatedAt, now),
    childCount: mapChildCountLabel(childCount),
    locked: page.isLocked === true,
    task: isTask
      ? {
          statusLabel: TASK_STATUS_META[page.taskStatus ?? "backlog"].label,
          statusTone: mapTaskTone(page.taskStatus),
          due:
            deadline === null || page.dueDate === null
              ? null
              : {
                  label: deadlineLabel(deadline, page.dueDate),
                  ariaLabel: deadlineAriaLabel(deadline, page.dueDate),
                  overdue: deadline.urgency === "overdue",
                },
          steps:
            page.checkpointTotal > 0
              ? { done: page.checkpointCompleted, total: page.checkpointTotal }
              : null,
        }
      : null,
    idea: null,
    color: null,
  };
}

export type MapIdeaInput = {
  title: string | null;
  text: string;
  color: MapCardColor | null;
  authorName: string | null;
  createdAt: number;
  stageLabel: string;
  upvotes: number;
  downvotes: number;
  userVote: "up" | "down" | null;
};

/** Kartica ideje na Mapi ideja: faza, Za/Protiv, ko i kad. */
export function mapIdeaCard(idea: MapIdeaInput, now: number): MapCardContent {
  const title = (idea.title ?? "").trim();
  const text = idea.text.trim();
  return {
    kind: "idea",
    kindLabel: "Ideja",
    // Ideja bez naslova nosi prvi red teksta kao naslov (kao lista ideja).
    title: title.length > 0 ? title : mapCardTitle(text.split("\n")[0]),
    snippet: title.length > 0 ? mapCardSnippet(text) : null,
    byline: mapByline(idea.authorName, idea.createdAt, now),
    childCount: null,
    locked: false,
    task: null,
    idea: {
      stageLabel: idea.stageLabel,
      up: idea.upvotes,
      down: idea.downvotes,
      myVote: idea.userVote,
    },
    color: idea.color,
  };
}

/**
 * Embed (telefon) dobija samo `label` i `meta` iz `canvas-embed.tsx`, koji ovaj
 * korak ne sme da menja (E5). Za kartice stranica je `meta` tačno
 * `pageKindLabel(kind)`, pa se vrsta vraća iz natpisa; ostalo je `null`.
 */
export function mapKindFromLabel(label: string | undefined): PageKind | null {
  if (label === undefined) return null;
  return PAGE_KIND_KEYS.find((kind) => PAGE_KIND_META[kind].label === label) ?? null;
}

export function mapZoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)} %`;
}

// --- Aktivacija točkića -------------------------------------------------------

/**
 * Mapa je u stranici sa skrolom: dok je neaktivna, točkić pomera stranicu.
 * Klik ili fokus u mapi je aktivira (točkić pomera mapu); klik van, Esc ili
 * odlazak fokusa van je gasi. Ctrl/⌘ + točkić zumira uvek (xyflow
 * `zoomActivationKeyCode`).
 */
export type MapActivationEvent =
  | "pointer-inside"
  | "focus-inside"
  | "pointer-outside"
  | "focus-outside"
  | "escape"
  | "window-blur";

export function mapActivation(active: boolean, event: MapActivationEvent): boolean {
  switch (event) {
    case "pointer-inside":
    case "focus-inside":
      return true;
    case "pointer-outside":
    case "focus-outside":
    case "escape":
    case "window-blur":
      return false;
    default:
      return active;
  }
}

// --- Prevlačenje i ugnežđavanje --------------------------------------------------

export type MapDropNode = {
  id: string;
  /** Kartica koraka (zadatka) — pomera se, ali se ne ugnežđava. */
  isCheckpoint: boolean;
  canMove: boolean;
};

export type MapDropPlan =
  | { kind: "nest"; childId: string; targetId: string }
  | { kind: "move"; ids: string[] }
  | { kind: "checkpoints"; ids: string[] }
  | { kind: "none" };

/**
 * Šta se dešava kad se potez završi (P4: bez zahteva i odobrenja).
 * - jedna pokretna kartica čiji je centar u drugoj kartici → ugnežđavanje ODMAH,
 *   bez obzira čija je ciljna kartica (server proverava R5/R6 i zaključavanje);
 * - grupa ili potez bez cilja → samo novi raspored;
 * - korak zadatka → samo raspored koraka.
 * `targetId` je rezultat `selectNestingDropTarget` (centar u cilju, najveće preklapanje).
 */
export function planMapDrop(
  dragged: MapDropNode,
  draggedNodes: readonly MapDropNode[],
  targetId: string | null,
): MapDropPlan {
  if (dragged.isCheckpoint) {
    const ids = draggedNodes.filter((node) => node.isCheckpoint && node.canMove).map((node) => node.id);
    return ids.length > 0 ? { kind: "checkpoints", ids } : { kind: "none" };
  }
  const movable = draggedNodes.filter((node) => !node.isCheckpoint && node.canMove);
  if (movable.length === 0) return { kind: "none" };
  if (
    targetId !== null &&
    movable.length === 1 &&
    movable[0].id === dragged.id &&
    targetId !== dragged.id
  ) {
    return { kind: "nest", childId: dragged.id, targetId };
  }
  return { kind: "move", ids: movable.map((node) => node.id) };
}
