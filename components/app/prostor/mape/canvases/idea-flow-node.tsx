"use client";


// Preneto iz Devotion apps/web/components/workspace/canvases/idea-flow-node.tsx (main @ c05c40f), SPAJANJE S14.
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
import {
  ArrowRight,
  FolderInput,
  GitBranchPlus,
  Pencil,
  RotateCcw,
  Trash2,
  Ungroup,
} from "lucide-react";

import { MapCard } from "@/components/app/prostor/mape/map/map-card";
import type { MapCardContent } from "@/lib/prostor/modeli/map-model";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import type { BojaMape } from "@/lib/prostor/web/boja-mape";

import styles from "@/components/app/prostor/mape/canvases/connected-canvas.module.css";
import { PerimeterResizeControl } from "@/components/app/prostor/mape/canvases/perimeter-resize-control";

export type IdeaCanvasColor = BojaMape;

export type IdeaCanvasNodeData = {
  /** Gotov sadržaj kartice (`mapIdeaCard`). */
  card: MapCardContent;
  canEdit: boolean;
  canResize: boolean;
  canDetach: boolean;
  /** Ideja u fazi „Odobreno" koja još nije pretvorena. */
  canConvert: boolean;
  /** Druga ideja se upravo prevlači preko ove. */
  nestingTarget: boolean;
};

export type IdeaFlowNode = Node<IdeaCanvasNodeData, "idea">;

type IdeaNodeActions = {
  vote: (ideaId: Id<"ideaNodes">, voteType: "up" | "down") => void;
  convert: (ideaId: Id<"ideaNodes">) => void;
  branch: (ideaId: Id<"ideaNodes">) => void;
  edit: (ideaId: Id<"ideaNodes">) => void;
  resize: (ideaId: Id<"ideaNodes">, layout: ResizeParams) => void;
  resetSize: (ideaId: Id<"ideaNodes">) => void;
  nest: (ideaId: Id<"ideaNodes">) => void;
  detach: (ideaId: Id<"ideaNodes">) => void;
  remove: (ideaId: Id<"ideaNodes">) => void;
};

const IdeaNodeActionsContext = createContext<IdeaNodeActions | null>(null);

export function IdeaNodeActionsProvider({
  actions,
  children,
}: {
  actions: IdeaNodeActions;
  children: ReactNode;
}) {
  return (
    <IdeaNodeActionsContext.Provider value={actions}>
      {children}
    </IdeaNodeActionsContext.Provider>
  );
}

const TOOLBAR_BUTTON = "h-8 gap-1.5 rounded-md px-2.5 text-xs";

function stopToolbarEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Ideja na Mapi ideja: ista pravougaona `MapCard` kao
 * stranice, sa fazom i Za/Protiv. Bez statusa zahteva i glasanja o brisanju —
 * „Obriši" šalje ideju u Korpu.
 */
export const IdeaFlowNodeCard = memo(function IdeaFlowNodeCard({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<IdeaFlowNode>) {
  const actions = useContext(IdeaNodeActionsContext);
  const ideaId = id as Id<"ideaNodes">;

  return (
    <div className="relative h-full w-full">
      <MapCard
        {...data.card}
        selected={selected}
        nestingTarget={data.nestingTarget}
        onVote={actions ? (vote) => actions.vote(ideaId, vote) : undefined}
      />

      <PerimeterResizeControl<IdeaFlowNode>
        nodeId={id}
        width={width ?? 264}
        height={height ?? 196}
        selected={selected}
        disabled={!data.canResize}
        shape="rounded"
        cornerRadius={10}
        minWidth={264}
        minHeight={196}
        maxWidth={720}
        maxHeight={1000}
        ariaLabel={`Promeni veličinu ideje ${data.card.title} povlačenjem ivice`}
        onResizeEnd={(layout) => actions?.resize(ideaId, layout)}
      />

      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        offset={12}
        className="nodrag nokey nopan nowheel max-w-[calc(100vw-2rem)]"
        onPointerDown={stopToolbarEvent}
        onMouseDown={stopToolbarEvent}
        onTouchStart={stopToolbarEvent}
        onKeyDown={stopToolbarEvent}
        onClick={stopToolbarEvent}
        onDoubleClick={stopToolbarEvent}
      >
        <div className="nodrag flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-popover p-1 shadow-elev-2">
          {data.canEdit ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={TOOLBAR_BUTTON}
                onClick={() => actions?.edit(ideaId)}
              >
                <Pencil className="size-3.5" aria-hidden="true" /> Uredi
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label="Vrati početnu veličinu ideje"
                title="Vrati početnu veličinu"
                onClick={() => actions?.resetSize(ideaId)}
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={TOOLBAR_BUTTON}
                onClick={() => actions?.branch(ideaId)}
              >
                <GitBranchPlus className="size-3.5" aria-hidden="true" /> Grana
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={TOOLBAR_BUTTON}
                onClick={() => actions?.nest(ideaId)}
              >
                <FolderInput className="size-3.5" aria-hidden="true" /> Ugnezdi u…
              </Button>
            </>
          ) : null}
          {data.canDetach ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={TOOLBAR_BUTTON}
              onClick={() => actions?.detach(ideaId)}
            >
              <Ungroup className="size-3.5" aria-hidden="true" /> Odvoji
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={`${TOOLBAR_BUTTON} text-danger hover:text-danger`}
            onClick={() => actions?.remove(ideaId)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" /> Obriši
          </Button>
          {data.canConvert ? (
            <Button variant="secondary"
              type="button"
              size="sm"
              className={TOOLBAR_BUTTON}
              onClick={() => actions?.convert(ideaId)}
            >
              Pretvori <ArrowRight className="size-3.5" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </NodeToolbar>

      <Handle
        id="left"
        type="source"
        position={Position.Left}
        className={styles.handle}
      />
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        className={styles.handle}
      />
    </div>
  );
});
