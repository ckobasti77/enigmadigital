// Preneto iz Devotion apps/web/components/workspace/thought-sharing.ts (main @ c05c40f), SPAJANJE S16.
import type { Id } from "@/convex/_generated/dataModel";

/** A page-tree location that can receive a team-visible copy of private thoughts. */
export type ThoughtDestination = {
  areaId: Id<"areas">;
  parentPageId: Id<"pages"> | null;
  label: string;
};

/**
 * The canvas owns conversion state. Workspace chrome only chooses a destination
 * and completes (or cancels) this request; it never creates a page itself.
 */
export type ThoughtDestinationRequest = {
  nodeIds: ReadonlyArray<Id<"thoughtNodes">>;
  label?: string;
  complete: (destination: ThoughtDestination) => void;
  cancel?: () => void;
};

export type ThoughtSidebarDragPointer = PointerEvent | MouseEvent | TouchEvent;

export const THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT =
  "thought-sidebar-drag-release";

export type ThoughtSidebarDragReleaseDetail = {
  sessionId: string;
  x: number;
  y: number;
  pointerId: number | null;
  source: "mouse" | "pointer" | "touch";
  touchId: number | null;
};

export type ThoughtSidebarDragRequest = ThoughtDestinationRequest & {
  sessionId: string;
  pointerEvent: ThoughtSidebarDragPointer;
};

export type ThoughtDropTarget = ThoughtDestination & {
  kind: "area" | "page";
  pageId: Id<"pages"> | null;
};
