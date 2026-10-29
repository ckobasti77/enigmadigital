"use client";


// Preneto iz Devotion apps/web/components/workspace/thoughts/thought-node.tsx (main @ c05c40f), SPAJANJE S14.
import { createContext, useContext, type ReactNode, type SyntheticEvent } from "react";
import {
  Handle,
  NodeToolbar,
  Position,
  type NodeProps,
  type ResizeParams,
} from "@xyflow/react";
import {
  Crown,
  ExternalLink,
  Pencil,
  RotateCcw,
  Send,
} from "lucide-react";

import { MapCard } from "@/components/app/prostor/mape/map/map-card";
import { mapCardSnippet, mapCardTitle } from "@/lib/prostor/modeli/map-model";
import { Button } from "@/components/ui/button";
import { formatShortDateAt } from "@/lib/format";
import canvasStyles from "@/components/app/prostor/mape/canvases/connected-canvas.module.css";
import { PerimeterResizeControl } from "@/components/app/prostor/mape/canvases/perimeter-resize-control";
import type { Id } from "@/convex/_generated/dataModel";

import type { ThoughtFlowNode } from "@/components/app/prostor/mape/thoughts/types";

type ThoughtNodeActions = {
  connectedNodeIds: ReadonlySet<string>;
  edit: (nodeId: Id<"thoughtNodes">) => void;
  toggleParent: (nodeId: Id<"thoughtNodes">) => void;
  send: (nodeIds: Id<"thoughtNodes">[]) => void;
  openIdeas: () => void;
  openPage: (pageId: Id<"pages">) => void;
  resize: (nodeId: Id<"thoughtNodes">, layout: ResizeParams) => void;
  resetSize: (nodeId: Id<"thoughtNodes">) => void;
};

const ThoughtNodeActionsContext = createContext<ThoughtNodeActions | null>(null);

export function ThoughtNodeActionsProvider({
  actions,
  children,
}: {
  actions: ThoughtNodeActions;
  children: ReactNode;
}) {
  return (
    <ThoughtNodeActionsContext.Provider value={actions}>
      {children}
    </ThoughtNodeActionsContext.Provider>
  );
}

/** Klik/točkić/dvoklik u traci ne pomera i ne zumira mapu (isto kao čvor ideje). */
function stopToolbarEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Misao na Mapi beleški — ista pravougaona `MapCard` kao ostale Mape (bez
 * organskog oblika, orbita i kružnog teksta).
 * Status slanja je u redu „ko · kad", a otvaranje ideje/stranice u traci
 * radnji izabrane kartice.
 */
export function ThoughtNode({
  id,
  data,
  selected,
  width,
  height,
}: NodeProps<ThoughtFlowNode>) {
  const actions = useContext(ThoughtNodeActionsContext);
  const nodeId = id as Id<"thoughtNodes">;
  const isParent = data.isParent ?? false;
  const title = mapCardTitle(data.title);
  const conversionLabel = data.lastConvertedIdeaId
    ? "Poslato u Ideje"
    : data.lastConvertedPageId
      ? "Pretvoreno"
      : "Privatno";
  const conversion = `${conversionLabel}${data.conversionCount > 1 ? ` ${data.conversionCount}×` : ""}`;
  const byline = `${data.authorName} · ${formatShortDateAt(data.createdAt)} · ${conversion}`;
  const convertedIdea = data.conversionCount > 0 && data.lastConvertedIdeaId !== null;
  const convertedPageId = data.conversionCount > 0 ? data.lastConvertedPageId : null;

  return (
    // Dostupan naziv nosi sam čvor (`ariaLabel` u `thoughts-canvas-view.tsx`).
    <article
      className="relative h-full w-full"
      onDoubleClick={(event) => {
        event.stopPropagation();
        actions?.edit(nodeId);
      }}
    >
      <MapCard
        kind={null}
        kindLabel={isParent ? "Glavna misao" : "Misao"}
        title={title}
        snippet={mapCardSnippet(data.text)}
        byline={byline}
        childCount={null}
        locked={false}
        task={null}
        idea={null}
        color={data.color}
        selected={selected}
      />

      <PerimeterResizeControl<ThoughtFlowNode>
        nodeId={id}
        width={width ?? 240}
        height={height ?? 160}
        selected={selected}
        shape="rounded"
        cornerRadius={10}
        minWidth={240}
        minHeight={160}
        maxWidth={720}
        maxHeight={1_000}
        ariaLabel={`Promeni veličinu misli ${title} povlačenjem ivice`}
        onResizeEnd={(layout) => actions?.resize(nodeId, layout)}
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
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={isParent ? "size-11 bg-surface-control-hover text-foreground sm:size-8" : "size-11 sm:size-8"}
            aria-pressed={isParent}
            aria-label={isParent ? "Ukloni status glavne misli" : "Postavi kao glavnu misao"}
            onClick={() => actions?.toggleParent(nodeId)}
          >
            <Crown className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 sm:size-8"
            aria-label="Uredi misao"
            onClick={() => actions?.edit(nodeId)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 sm:size-8"
            aria-label="Vrati početnu veličinu misli"
            onClick={() => actions?.resetSize(nodeId)}
          >
            <RotateCcw className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-11 sm:size-8"
            aria-label="Pošalji misao u Ideje"
            onClick={() => actions?.send([nodeId])}
          >
            <Send className="size-3.5" />
          </Button>
          {convertedIdea ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11 gap-1.5 rounded-md px-2.5 text-xs sm:h-8"
              onClick={() => actions?.openIdeas()}
            >
              Otvori u Idejama <ExternalLink className="size-3" aria-hidden="true" />
            </Button>
          ) : convertedPageId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-11 gap-1.5 rounded-md px-2.5 text-xs sm:h-8"
              onClick={() => actions?.openPage(convertedPageId)}
            >
              Otvori stranicu <ExternalLink className="size-3" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </NodeToolbar>

      <Handle
        type="target"
        position={Position.Left}
        className={canvasStyles.handle}
      />
      <Handle
        type="source"
        position={Position.Right}
        className={canvasStyles.handle}
      />
    </article>
  );
}
