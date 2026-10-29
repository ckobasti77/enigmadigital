"use client";


// Preneto iz Devotion apps/web/components/workspace/thoughts/thought-edge.tsx (main @ c05c40f), SPAJANJE S14.
import { createContext, useContext, type ReactNode } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { Pencil, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMapaSamoPregled } from "@/components/app/prostor/mape/use-mapa-samo-pregled";

type ThoughtEdgeActions = {
  editLabel: (edgeId: string) => void;
  archiveEdge: (edgeId: string) => void;
};

const ThoughtEdgeActionsContext = createContext<ThoughtEdgeActions | null>(null);

export function ThoughtEdgeActionsProvider({
  actions,
  children,
}: {
  actions: ThoughtEdgeActions;
  children: ReactNode;
}) {
  return (
    <ThoughtEdgeActionsContext.Provider value={actions}>
      {children}
    </ThoughtEdgeActionsContext.Provider>
  );
}

export function ThoughtEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
}: EdgeProps) {
  const actions = useContext(ThoughtEdgeActionsContext);
  // Na telefonu je mapa samo pregled: bez radnji na vezi, a veza bez naziva
  // bez oznake (prazna „Veza“ bi pokrivala kartice).
  const samoPregled = useMapaSamoPregled();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  if (samoPregled && !label) {
    return <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />;
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan group z-10 flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-surface-control-hover"
          onDoubleClick={(e) => {
            e.stopPropagation();
            actions?.editLabel(id);
          }}
        >
          {label ? (
            <span className="max-w-[120px] truncate text-foreground">{String(label)}</span>
          ) : (
            <span className="text-text-muted group-hover:text-muted-foreground">
              Veza
            </span>
          )}

          {actions && !samoPregled ? (
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5 rounded-full hover:bg-surface-control-hover"
                aria-label="Uredi naziv veze"
                title="Uredi naziv veze"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.editLabel(id);
                }}
              >
                <Pencil className="size-2.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-5 rounded-full text-danger hover:bg-surface-control-hover hover:text-danger"
                aria-label="Prekini vezu"
                title="Prekini vezu"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.archiveEdge(id);
                }}
              >
                <Scissors className="size-2.5" />
              </Button>
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
