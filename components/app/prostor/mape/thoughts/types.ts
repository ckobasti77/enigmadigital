// Preneto iz Devotion apps/web/components/workspace/thoughts/types.ts (main @ c05c40f), SPAJANJE S14.
import type { Node } from "@xyflow/react";

import type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtSidebarDragRequest,
} from "@/components/app/prostor/ja/brzi-unos/thought-sharing";
import type { ProfileWithAvatar, StartupWithAreas } from "@/lib/prostor/rute";
import type { Id } from "@/convex/_generated/dataModel";

export type ThoughtNodeColor =
  | "neutral"
  | "violet"
  | "blue"
  | "green"
  | "amber"
  | "rose";

export type ThoughtNodeData = {
  title: string | null;
  text: string;
  color: ThoughtNodeColor;
  isParent?: boolean;
  parentThoughtId?: Id<"thoughtNodes">;
  conversionCount: number;
  lastConvertedIdeaId: Id<"ideaNodes"> | null;
  lastConvertedPageId: Id<"pages"> | null;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: number;
};

export type ThoughtFlowNode = Node<ThoughtNodeData, "thought">;

export type ThoughtEditorValue = {
  title: string;
  text: string;
  color: ThoughtNodeColor;
};

export type ThoughtsCanvasViewProps = {
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenIdeas: () => void;
  onRequestDestination?: (request: ThoughtDestinationRequest) => void;
  onBeginSidebarDrag?: (request: ThoughtSidebarDragRequest) => void;
};

export type {
  ThoughtDestination,
  ThoughtDestinationRequest,
  ThoughtSidebarDragRequest,
};
