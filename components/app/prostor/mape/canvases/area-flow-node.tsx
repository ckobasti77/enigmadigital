"use client";


// Preneto iz Devotion apps/web/components/workspace/canvases/area-flow-node.tsx (main @ c05c40f), SPAJANJE S14.
import {
  createContext,
  memo,
  useContext,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type Node,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import { ArrowUpRight, PanelRight, RotateCcw } from "lucide-react";

import { MapCard } from "@/components/app/prostor/mape/map/map-card";
import type { MapCardContent } from "@/lib/prostor/modeli/map-model";
import { Button } from "@/components/ui/button";
import {
  NestingTargetMenu,
  type NestingTargetOption,
} from "@/components/app/prostor/dokumenti/nesting-target-menu";
import { DetachPageButton } from "@/components/app/prostor/dokumenti/detach-page-button";
import {
  MoveToAreaMenu,
  type MoveToAreaOption,
} from "@/components/app/prostor/dokumenti/move-to-area-menu";
import type { Id } from "@/convex/_generated/dataModel";
import { PAGE_NODE_SIZE } from "@/lib/prostor/web/canvas-node-size";
import type { PageKind } from "@/lib/prostor/web/vrste-stranica";
import { cn } from "@/lib/utils";

import styles from "@/components/app/prostor/mape/canvases/connected-canvas.module.css";
import { PerimeterResizeControl } from "@/components/app/prostor/mape/canvases/perimeter-resize-control";

export type AreaCanvasNodeData = {
  /** Gotov sadržaj kartice (`mapPageCard`). */
  card: MapCardContent;
  kind: PageKind;
  checkpointTotal: number;
  checkpointsExpanded: boolean;
  canMove: boolean;
  canResize: boolean;
  canDetach: boolean;
  nestingTarget: boolean;
};

export type AreaFlowNode = Node<AreaCanvasNodeData, "areaPage">;

type AreaNodeActions = {
  areaId: Id<"areas">;
  areas: MoveToAreaOption[];
  nestingCandidates: NestingTargetOption[];
  openCanvas: (pageId: Id<"pages">) => void;
  openDetails: (pageId: Id<"pages">) => void;
  peek: (pageId: Id<"pages">) => void;
  nest: (pageId: Id<"pages">, target: NestingTargetOption) => Promise<void>;
  toggleCheckpoints: (pageId: Id<"pages">) => void;
  resize: (pageId: Id<"pages">, layout: ResizeParams) => void;
  resetSize: (pageId: Id<"pages">) => void;
};

const AreaNodeActionsContext = createContext<AreaNodeActions | null>(null);

function stopToolbarEventPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function AreaNodeActionsProvider({
  children,
  ...actions
}: AreaNodeActions & { children: ReactNode }) {
  return (
    <AreaNodeActionsContext.Provider value={actions}>
      {children}
    </AreaNodeActionsContext.Provider>
  );
}

const TOOLBAR_BUTTON = "h-8 gap-1.5 rounded-md px-2.5 text-xs";

/**
 * Kartica stranice na Mapi: pravougaona `MapCard`,
 * veličina povlačenjem ivice izabrane kartice, a radnje se pojavljuju iznad
 * nje (Enter na izabranoj kartici ih fokusira). Dupli klik otvara stranicu.
 */
export const AreaFlowNodeCard = memo(function AreaFlowNodeCard({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<AreaFlowNode>) {
  const actions = useContext(AreaNodeActionsContext);
  const pageId = id as Id<"pages">;
  const title = data.card.title;
  const hasCheckpoints = data.kind === "task" && data.checkpointTotal > 0;

  return (
    <div
      className={cn(
        "relative h-full w-full",
        !data.canMove && "nodrag !cursor-default",
      )}
      title="Dupli klik otvara stranicu"
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.openCanvas(pageId);
      }}
    >
      <MapCard
        {...data.card}
        selected={selected}
        nestingTarget={data.nestingTarget}
        stepsExpanded={data.checkpointsExpanded}
        onToggleSteps={
          hasCheckpoints && actions
            ? () => actions.toggleCheckpoints(pageId)
            : undefined
        }
      />

      <PerimeterResizeControl<AreaFlowNode>
        nodeId={id}
        width={width ?? PAGE_NODE_SIZE.defaultWidth}
        height={height ?? PAGE_NODE_SIZE.defaultHeight}
        selected={selected}
        disabled={!data.canResize}
        shape="rounded"
        cornerRadius={10}
        minWidth={PAGE_NODE_SIZE.minWidth}
        minHeight={PAGE_NODE_SIZE.minHeight}
        maxWidth={PAGE_NODE_SIZE.maxWidth}
        maxHeight={PAGE_NODE_SIZE.maxHeight}
        ariaLabel={`Promeni veličinu kartice ${title} povlačenjem ivice`}
        onResizeEnd={(layout) => {
          if (data.canResize) actions?.resize(pageId, layout);
        }}
      />

      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        offset={12}
        className="nodrag nokey nopan nowheel max-w-[calc(100vw-2rem)]"
        onPointerDown={stopToolbarEventPropagation}
        onMouseDown={stopToolbarEventPropagation}
        onTouchStart={stopToolbarEventPropagation}
        onKeyDown={stopToolbarEventPropagation}
        onClick={stopToolbarEventPropagation}
        onDoubleClick={stopToolbarEventPropagation}
      >
        <div className="nodrag flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-center gap-0.5 rounded-lg border border-line bg-popover p-1 shadow-elev-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={TOOLBAR_BUTTON}
            aria-label={`Pregled: ${title}`}
            onClick={() => actions?.peek(pageId)}
          >
            <PanelRight className="size-3.5" aria-hidden="true" /> Pregled
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={TOOLBAR_BUTTON}
            aria-label={`Otvori ${title}`}
            onClick={() => actions?.openDetails(pageId)}
          >
            <ArrowUpRight className="size-3.5" aria-hidden="true" /> Otvori
          </Button>
          {actions && data.canMove ? (
            <NestingTargetMenu
              childTitle={title}
              candidates={actions.nestingCandidates.filter(
                (candidate) => candidate.pageId !== pageId,
              )}
              onNest={(target) => actions.nest(pageId, target)}
              className={TOOLBAR_BUTTON}
              compact
            />
          ) : null}
          {actions && data.canDetach ? (
            <DetachPageButton
              pageId={pageId}
              title={title}
              compact
            />
          ) : null}
          {actions && data.canMove && actions.areas.length > 1 ? (
            <MoveToAreaMenu
              pageId={pageId}
              pageTitle={title}
              currentAreaId={actions.areaId}
              areas={actions.areas}
              className="border-0 shadow-none"
              compact
            />
          ) : null}
          {data.canResize ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={TOOLBAR_BUTTON}
              aria-label={`Vrati početnu veličinu za ${title}`}
              onClick={() => actions?.resetSize(pageId)}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" /> Početna veličina
            </Button>
          ) : null}
        </div>
      </NodeToolbar>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={styles.handle}
        aria-label="Leva tačka za povezivanje kartice"
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={styles.handle}
        aria-label="Desna tačka za povezivanje kartice"
      />
    </div>
  );
});
