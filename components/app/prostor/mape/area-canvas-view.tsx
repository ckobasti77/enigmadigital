"use client";

// Preneto iz Devotion apps/web/components/workspace/area-canvas-view.tsx (main @ c05c40f), SPAJANJE S14.
import "./mapa-stil";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type ResizeParams,
  type Viewport,
} from "@xyflow/react";
import type { FunctionReturnType } from "convex/server";
import {
  Blocks,
  LayoutGrid,
  Plus,
  Redo2,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import {
  MAP_FRAME_CLASS,
  MapEmptyState,
  MapHistoryButtons,
  MapStatusBar,
} from "@/components/app/prostor/mape/map/map-chrome";
import {
  mapPageCard,
  planMapDrop,
  type MapDropNode,
} from "@/lib/prostor/modeli/map-model";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { nestedMessage } from "@/lib/prostor/modeli/area-model";
import { CanvasActionRail } from "@/components/app/prostor/mape/canvases/canvas-action-rail";
import {
  AreaFlowNodeCard,
  AreaNodeActionsProvider,
  type AreaFlowNode,
} from "@/components/app/prostor/mape/canvases/area-flow-node";
import {
  TASK_CHECKPOINT_SIZE_PRESETS,
  taskCheckpointOrdinal,
  taskCheckpointNodeId,
  taskCheckpointNodeMetrics,
  taskCheckpointOrbitPosition,
  type TaskCheckpointSizePreset,
} from "@/lib/prostor/modeli/task-checkpoint-layout";
import {
  TaskCheckpointFlowNodeCard,
  TaskCheckpointNodeActionsProvider,
  type TaskCheckpointFlowNode,
} from "@/components/app/prostor/mape/canvases/task-checkpoint-flow-node";
import styles from "@/components/app/prostor/mape/canvases/connected-canvas.module.css";
import { selectNestingDropTarget } from "@/lib/prostor/modeli/nesting-drop";
import {
  useCanvasNavigation,
  useMapActivation,
} from "@/components/app/prostor/mape/canvases/use-canvas-navigation";
import { PagePeek } from "@/components/app/prostor/mape/page-peek";
import { useMapaSamoPregled } from "@/components/app/prostor/mape/use-mapa-samo-pregled";
import { ThoughtEdge } from "@/components/app/prostor/mape/thoughts/thought-edge";
import {
  isEditableTarget,
  useWorkspaceHistory,
} from "@/components/app/prostor/zajednicko/istorija-radnji";
import { AREA_ICONS } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PAGE_NODE_SIZE } from "@/lib/prostor/web/canvas-node-size";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import {
  PAGE_KIND_KEYS,
  PAGE_KIND_META,
  pageKindMeta,
  type PageKind,
} from "@/lib/prostor/web/vrste-stranica";
import { cn } from "@/lib/utils";
import type { AreaKey } from "@/lib/prostor/web/projekat";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";

type AreaCanvasFilter = "all" | PageKind;
type CheckpointCanvasEndpoint =
  | { kind: "page"; id: Id<"pages"> }
  | { kind: "task_checkpoint"; id: Id<"taskCheckpoints"> };

export type AreaCanvasViewProps = {
  areaId: Id<"areas">;
  rootPageId: Id<"pages"> | null;
  canvasLabel: string;
  areaKey: string;
  /** Sve oblasti projekta — hrani „Premesti u oblast” akciju na karticama. */
  areas: Array<{ _id: Id<"areas">; label: string }>;
  filter: AreaCanvasFilter;
  onFilterChange: (filter: AreaCanvasFilter) => void;
  onOpenCanvas: (pageId: Id<"pages">) => void;
  onOpenDetails: (pageId: Id<"pages">) => void;
  onCreatePage: (kind: PageKind) => void;
  /**
   * „Pregled" zadatka otvara panel zadatka kad ga roditelj
   * nudi; bez njega i zadatak ide u fioku Pregled.
   */
  onOpenTask?: (pageId: Id<"pages">, title: string) => void;
  layout?: "standard" | "task-focus";
};

type AreaPageFlowEdgeData = {
  backendId: Id<"pageCanvasEdgesV2"> | Id<"pageRelations"> | null;
  kind: "canvas" | "relation";
  canDelete: boolean;
  canRequestDeletion: boolean;
};

type AreaCheckpointFlowEdgeData = {
  backendId: Id<"taskCheckpointCanvasEdges"> | null;
  kind: "checkpoint";
  sourceEndpoint: CheckpointCanvasEndpoint;
  targetEndpoint: CheckpointCanvasEndpoint;
  canDelete: boolean;
  canRequestDeletion: boolean;
};

type AreaFlowEdgeData =
  | AreaPageFlowEdgeData
  | AreaCheckpointFlowEdgeData;

type AreaFlowEdge = Edge<AreaFlowEdgeData, "default">;

type DeletedPageEdgeRecord = {
  edge: AreaFlowEdge;
  source: Id<"pages">;
  target: Id<"pages">;
  label: string | undefined;
  kind: "canvas" | "relation";
  currentId: Id<"pageCanvasEdgesV2"> | Id<"pageRelations">;
};

type DeletedCheckpointEdgeRecord = {
  edge: AreaFlowEdge;
  sourceEndpoint: CheckpointCanvasEndpoint;
  targetEndpoint: CheckpointCanvasEndpoint;
  kind: "checkpoint";
  currentId: Id<"taskCheckpointCanvasEdges">;
};

type DeletedEdgeRecord =
  | DeletedPageEdgeRecord
  | DeletedCheckpointEdgeRecord;

type CanvasFlowNode = AreaFlowNode | TaskCheckpointFlowNode;

type CheckpointResizeSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  manuallySized: boolean;
};

const NODE_TYPES = {
  areaPage: AreaFlowNodeCard,
  taskCheckpoint: TaskCheckpointFlowNodeCard,
};
const EDGE_TYPES = { default: ThoughtEdge };
/** `pages.childCounts` prima najviše 50 roditelja (granica servera). */
const CHILD_COUNT_PARENTS_MAX = 50;

function isTaskCheckpointNode(
  node: CanvasFlowNode,
): node is TaskCheckpointFlowNode {
  return node.type === "taskCheckpoint";
}

function edgeUiId(
  kind: "canvas" | "relation" | "checkpoint",
  backendId:
    | Id<"pageCanvasEdgesV2">
    | Id<"pageRelations">
    | Id<"taskCheckpointCanvasEdges">,
) {
  return `${kind}:${backendId}`;
}

function checkpointEndpointNodeId(endpoint: CheckpointCanvasEndpoint) {
  return endpoint.kind === "page"
    ? endpoint.id
    : taskCheckpointNodeId(endpoint.id);
}

function checkpointEndpointFromNode(
  node: CanvasFlowNode,
): CheckpointCanvasEndpoint {
  return isTaskCheckpointNode(node)
    ? {
        kind: "task_checkpoint",
        id: node.data.checkpointId,
      }
    : {
        kind: "page",
        id: node.id as Id<"pages">,
      };
}

function adaptEdgeHandles(
  edge: AreaFlowEdge,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): AreaFlowEdge {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  if (!source || !target) return edge;
  const sourceIsLeft = source.x <= target.x;
  return {
    ...edge,
    sourceHandle: sourceIsLeft ? "right" : "left",
    targetHandle: sourceIsLeft ? "left" : "right",
  };
}

const SERBIAN_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš karticu, pa još jednom Enter za njene radnje. Strelicama je pomeraš kada je pomeranje dozvoljeno.",
  "node.a11yDescription.keyboardDisabled":
    "Ova kartica se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) =>
    `Kartica je pomerena ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole mape",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Uklopi sve kartice",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "handle.ariaLabel": "Tačka za povezivanje kartica",
} as const;

export function AreaCanvasView(props: AreaCanvasViewProps) {
  const scopeKey = `${props.areaId}:${props.rootPageId ?? "root"}`;
  return (
    <ReactFlowProvider key={scopeKey}>
      <AreaCanvasBody {...props} />
    </ReactFlowProvider>
  );
}

function AreaCanvasBody({
  areaId,
  rootPageId,
  canvasLabel,
  areaKey,
  areas,
  filter,
  onFilterChange,
  onOpenCanvas,
  onOpenDetails,
  onCreatePage,
  onOpenTask,
  layout = "standard",
}: AreaCanvasViewProps) {
  const canvasData = useProjekatQuery(api.prostor.areasV2.getCanvas, {
    areaId,
    rootPageId,
  });

  if (canvasData === undefined) {
    return (
      <div role="status" aria-label="Učitavam mapu">
        <Skeleton
          className={cn(
            "rounded-lg",
            layout === "task-focus" ? "min-h-[28rem]" : "h-[min(72vh,52rem)] min-h-[32rem]",
          )}
          style={
            layout === "task-focus"
              ? { height: "clamp(28rem, calc(100dvh - 12rem), 56rem)" }
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <AreaCanvasReady
      key={`${areaId}:${rootPageId ?? "root"}`}
      areaId={areaId}
      rootPageId={rootPageId}
      canvasLabel={canvasLabel}
      areaKey={areaKey}
      areas={areas}
      filter={filter}
      onFilterChange={onFilterChange}
      canvasData={canvasData}
      onOpenCanvas={onOpenCanvas}
      onOpenDetails={onOpenDetails}
      onCreatePage={onCreatePage}
      onOpenTask={onOpenTask}
      layout={layout}
    />
  );
}

type CanvasData = FunctionReturnType<typeof api.prostor.areasV2.getCanvas>;

type AreaCanvasReadyProps = AreaCanvasViewProps & {
  canvasData: CanvasData;
};

function AreaCanvasReady({
  areaId,
  rootPageId,
  canvasLabel,
  areaKey,
  areas,
  filter,
  onFilterChange,
  canvasData,
  onOpenCanvas,
  onOpenDetails,
  onCreatePage,
  onOpenTask,
  layout = "standard",
}: AreaCanvasReadyProps) {
  const flowRef =
    useRef<ReactFlowInstance<CanvasFlowNode, AreaFlowEdge> | null>(null);
  const preDragPositionsRef = useRef(
    new Map<string, { x: number; y: number }>(),
  );
  const checkpointResizeStartRef = useRef(
    new Map<Id<"taskCheckpoints">, CheckpointResizeSnapshot>(),
  );
  const pointerDragActiveRef = useRef(false);
  const nestingTargetIdRef = useRef<string | null>(null);
  const viewportInitialized = useRef(false);
  const checkpointFitKeyRef = useRef("");
  // Sat za „pre N" na karticama: jednom po otvaranju Mape.
  const [now] = useState(() => Date.now());
  const [expandedTaskId, setExpandedTaskId] =
    useState<Id<"pages"> | null>(null);
  const [peekPageId, setPeekPageId] = useState<Id<"pages"> | null>(null);
  const movePages = useProjekatMutation(api.prostor.areasV2.movePages);
  const resizePage = useProjekatMutation(api.prostor.areasV2.resizePage);
  const resetPageSize = useProjekatMutation(api.prostor.areasV2.resetPageSize);
  const saveViewport = useProjekatMutation(api.prostor.areasV2.saveViewport);
  const connectPages = useProjekatMutation(api.prostor.areasV2.connectPages);
  const disconnectPages = useProjekatMutation(api.prostor.areasV2.disconnectPages);
  const requestNesting = useProjekatMutation(api.prostor.areasV2.requestNesting);
  const movePage = useProjekatMutation(api.prostor.areasV2.movePage);
  const createRelation = useProjekatMutation(api.prostor.areasV2.createRelation);
  const deleteRelation = useProjekatMutation(api.prostor.areasV2.deleteRelation);
  const connectCheckpointEdge = useProjekatMutation(
    api.prostor.taskCheckpointCanvasEdges.connect,
  );
  const disconnectCheckpointEdge = useProjekatMutation(
    api.prostor.taskCheckpointCanvasEdges.disconnect,
  );
  const saveCheckpointPlacement = useProjekatMutation(
    api.prostor.taskCheckpoints.saveCanvasPlacement,
  );
  const resetCheckpointCanvasSize = useProjekatMutation(
    api.prostor.taskCheckpoints.resetCanvasSize,
  );
  const { historyState, pushHistory, runHistory } = useWorkspaceHistory();
  // Na telefonu je Mapa samo pregled (bez prevlačenja, povezivanja i izmene veličine).
  const samoPregled = useMapaSamoPregled();

  const ownTaskPageId =
    canvasData.scope.pageKind === "task" && rootPageId !== null
      ? rootPageId
      : null;
  const visibleCheckpointTaskId = ownTaskPageId ?? expandedTaskId;
  // Broj podstranica na karticama (prvih 50 kartica; ostale bez broja).
  const childCountParentIds = useMemo(
    () =>
      canvasData.pages
        .slice(0, CHILD_COUNT_PARENTS_MAX)
        .map((page) => page._id),
    [canvasData.pages],
  );
  const childCountsKey = childCountParentIds.join(",");
  const childCountArgs = useMemo(
    () => ({
      areaId,
      parentPageIds: childCountsKey === ""
        ? []
        : (childCountsKey.split(",") as Id<"pages">[]),
    }),
    [areaId, childCountsKey],
  );
  const childCounts = useProjekatQueryTolerant(
    api.prostor.pages.childCounts,
    childCountArgs.parentPageIds.length === 0 ? "skip" : childCountArgs,
  );
  const childCountById = useMemo(
    () =>
      new Map(
        (childCounts ?? []).map((entry) => [entry.pageId, entry] as const),
      ),
    [childCounts],
  );
  // Koraci i broj podstranica su dopuna kartica: njihova greška ne obara Mapu.
  const taskCheckpoints = useProjekatQueryTolerant(
    api.prostor.taskCheckpoints.listForTask,
    visibleCheckpointTaskId === null
      ? "skip"
      : {
          taskPageId: visibleCheckpointTaskId,
          canvasRootPageId: rootPageId,
        },
  );

  const incomingNodes = useMemo<CanvasFlowNode[]>(() => {
    const acceptsKind = (kind: PageKind) =>
      filter === "all" || filter === kind;
    const pageNodes = canvasData.pages
      .filter((page) => acceptsKind(page.kind))
      .map<AreaFlowNode>((page) => {
        const card = mapPageCard(
          {
            ...page,
            creatorName: page.creator?.displayName ?? null,
          },
          now,
          childCountById.get(page._id) ?? null,
        );
        return {
          id: page._id,
          type: "areaPage",
          position: { x: page.x, y: page.y },
          width: page.width,
          height: page.height,
          style: { width: page.width, height: page.height },
          data: {
            card,
            kind: page.kind,
            checkpointTotal: page.checkpointTotal,
            checkpointsExpanded:
              ownTaskPageId === null &&
              expandedTaskId === page._id &&
              page.checkpointTotal > 0,
            canMove: page.canMove && !samoPregled,
            canResize: page.canResize && !samoPregled,
            canDetach: page.canDetach && !samoPregled,
            nestingTarget: false,
          },
          draggable: page.canMove && !samoPregled,
          connectable: !samoPregled,
          deletable: false,
          ariaLabel: `${card.kindLabel}: ${card.title}${card.locked ? ", zaključano" : ""}`,
        };
      });

    const visibleTaskNode = pageNodes.find(
      (node) => node.id === visibleCheckpointTaskId,
    );
    const checkpointNodes: TaskCheckpointFlowNode[] =
      visibleCheckpointTaskId === null ||
      taskCheckpoints === undefined ||
      (ownTaskPageId === null && visibleTaskNode === undefined)
          ? []
          : taskCheckpoints.map((checkpoint, index) => {
            const metrics = taskCheckpointNodeMetrics(checkpoint.text);
            const ordinal = taskCheckpointOrdinal(
              checkpoint.ordinal,
              index,
            );
            const width = checkpoint.placement?.width ?? metrics.width;
            const height = checkpoint.placement?.height ?? metrics.height;
            const manuallySized =
              checkpoint.placement?.width !== null &&
              checkpoint.placement?.width !== undefined &&
              checkpoint.placement?.height !== null &&
              checkpoint.placement?.height !== undefined;
            const taskNode = visibleTaskNode;
            const center =
              ownTaskPageId !== null || taskNode === undefined
                ? { x: 0, y: 0 }
                : {
                    x:
                      taskNode.position.x +
                      (taskNode.width ?? PAGE_NODE_SIZE.defaultWidth) / 2,
                    y:
                      taskNode.position.y +
                      (taskNode.height ?? PAGE_NODE_SIZE.defaultHeight) / 2,
                  };
            const defaultPosition = taskCheckpointOrbitPosition({
              index,
              center,
              node: metrics,
              exclusion:
                taskNode === undefined
                  ? { width: 176, height: 136 }
                  : {
                      width: taskNode.width ?? PAGE_NODE_SIZE.defaultWidth,
                      height: taskNode.height ?? PAGE_NODE_SIZE.defaultHeight,
                    },
            });
            return {
              id: taskCheckpointNodeId(checkpoint._id),
              type: "taskCheckpoint",
              position: checkpoint.placement
                ? {
                    x: checkpoint.placement.x,
                    y: checkpoint.placement.y,
                  }
                : defaultPosition,
              width,
              height,
              style: { width, height },
              data: {
                checkpointId: checkpoint._id,
                ordinal,
                text: checkpoint.text,
                completed: checkpoint.completed,
                chainedToPrevious: checkpoint.chainedToPrevious,
                locked: checkpoint.locked,
                blockedByOrdinal: checkpoint.blockedByOrdinal,
                canEdit: checkpoint.canEdit,
                canToggle: checkpoint.canToggle,
                canMove: checkpoint.canMove && !samoPregled,
                canResize: checkpoint.canMove && !samoPregled,
                manuallySized,
                canDeleteDirectly: checkpoint.canDeleteDirectly,
              },
              draggable: checkpoint.canMove && !samoPregled,
              connectable: !samoPregled,
              deletable: false,
              ariaLabel: `Korak ${ordinal}: ${checkpoint.text}. ${
                checkpoint.completed
                  ? "Završen"
                  : checkpoint.locked
                    ? `Zaključan dok se ne završi korak broj ${checkpoint.blockedByOrdinal}`
                    : "Otvoren"
              }.`,
            };
          });

    return [...pageNodes, ...checkpointNodes];
  }, [
    canvasData.pages,
    childCountById,
    expandedTaskId,
    filter,
    now,
    ownTaskPageId,
    samoPregled,
    taskCheckpoints,
    visibleCheckpointTaskId,
  ]);

  const incomingEdges = useMemo<AreaFlowEdge[]>(() => {
    const visibleNodeIds = new Set(incomingNodes.map((node) => node.id));
    const pageEdges = [...canvasData.edges, ...canvasData.relations]
      .filter(
        (edge) =>
          visibleNodeIds.has(edge.source) &&
          visibleNodeIds.has(edge.target),
      )
      .map<AreaFlowEdge>((edge) => ({
        id: edgeUiId(edge.kind, edge._id),
        source: edge.source,
        target: edge.target,
        type: "default",
        label: edge.label ?? undefined,
        interactionWidth: 22,
        deletable: edge.canDelete,
        data: {
          backendId: edge._id,
          kind: edge.kind,
          canDelete: edge.canDelete,
          canRequestDeletion: edge.canRequestDeletion,
        },
        style:
          edge.kind === "relation"
            ? { strokeDasharray: "7 6" }
            : undefined,
        ariaLabel: edge.label
          ? `${edge.kind === "relation" ? "Relacija" : "Veza"}: ${edge.label}`
          : edge.kind === "relation"
            ? "Relacija između beleške i zadatka"
            : "Veza između dve kartice iste vrste",
      }));
    const checkpointEdges = (canvasData.checkpointEdges ?? [])
      .map((edge) => ({
        edge,
        sourceNodeId: checkpointEndpointNodeId(edge.source),
        targetNodeId: checkpointEndpointNodeId(edge.target),
      }))
      .filter(
        ({ sourceNodeId, targetNodeId }) =>
          visibleNodeIds.has(sourceNodeId) &&
          visibleNodeIds.has(targetNodeId),
      )
      .map<AreaFlowEdge>(({ edge, sourceNodeId, targetNodeId }) => {
        const connectsPage = edge.source.kind !== edge.target.kind;
        return {
          id: edgeUiId("checkpoint", edge._id),
          source: sourceNodeId,
          target: targetNodeId,
          type: "default",
          interactionWidth: 22,
          deletable: edge.canDelete,
          data: {
            backendId: edge._id,
            kind: "checkpoint",
            sourceEndpoint: edge.source,
            targetEndpoint: edge.target,
            canDelete: edge.canDelete,
            canRequestDeletion: edge.canRequestDeletion,
          },
          style: connectsPage
            ? { strokeDasharray: "7 6" }
            : undefined,
          ariaLabel: connectsPage
            ? "Veza između koraka i kartice"
            : "Veza između dva koraka",
        };
      });
    return [...pageEdges, ...checkpointEdges];
  }, [
    canvasData.checkpointEdges,
    canvasData.edges,
    canvasData.relations,
    incomingNodes,
  ]);

  const [nodes, setNodes] = useState(incomingNodes);
  const nodesRef = useRef(nodes);
  const [edges, setEdges] = useState(incomingEdges);
  const [viewport, setViewport] = useState<Viewport>({
    x: canvasData.viewport.x,
    y: canvasData.viewport.y,
    zoom: canvasData.viewport.zoom,
  });
  const canvasNavigation = useCanvasNavigation();
  const {
    ref: mapRef,
    active: mapActive,
    handlers: mapActivationHandlers,
    deactivate: deactivateMap,
  } = useMapActivation();

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    if (
      visibleCheckpointTaskId === null ||
      taskCheckpoints === undefined ||
      taskCheckpoints.length === 0
    ) {
      checkpointFitKeyRef.current = "";
      return;
    }
    const fitKey = `${rootPageId ?? "root"}:${visibleCheckpointTaskId}:${taskCheckpoints.length}`;
    if (checkpointFitKeyRef.current === fitKey) return;
    checkpointFitKeyRef.current = fitKey;
    const timeout = window.setTimeout(() => {
      const instance = flowRef.current;
      if (!instance) return;
      const checkpointIds = new Set(
        taskCheckpoints.map(
          (checkpoint) => taskCheckpointNodeId(checkpoint._id),
        ),
      );
      const visibleNodes = instance
        .getNodes()
        .filter(
          (node) =>
            checkpointIds.has(node.id) ||
            node.id === visibleCheckpointTaskId,
        );
      if (visibleNodes.length === 0) return;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      void instance.fitView({
        nodes: visibleNodes,
        padding: 0.22,
        maxZoom: 1,
        duration: reduceMotion ? 0 : 260,
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [
    rootPageId,
    taskCheckpoints,
    visibleCheckpointTaskId,
  ]);

  const updateNestingTarget = useCallback((targetId: string | null) => {
    if (nestingTargetIdRef.current === targetId) return;
    nestingTargetIdRef.current = targetId;
    setNodes((current) =>
      current.map((node) => {
        if (isTaskCheckpointNode(node)) return node;
        const nestingTarget = node.id === targetId;
        return node.data.nestingTarget === nestingTarget
          ? node
          : {
              ...node,
              data: { ...node.data, nestingTarget },
            };
      }),
    );
  }, []);

  const detectNestingTarget = useCallback(
    (dragged: CanvasFlowNode, draggedNodes: CanvasFlowNode[]) => {
      if (isTaskCheckpointNode(dragged)) return null;
      const movableNodes = draggedNodes.filter(
        (node): node is AreaFlowNode =>
          !isTaskCheckpointNode(node) && node.data.canMove,
      );
      if (movableNodes.length !== 1 || movableNodes[0].id !== dragged.id) {
        return null;
      }
      const intersections =
        flowRef.current?.getIntersectingNodes(dragged, true) ?? [];
      const excludedIds = new Set(draggedNodes.map((node) => node.id));
      return selectNestingDropTarget(
        dragged,
        intersections.filter(
          (node): node is AreaFlowNode => !isTaskCheckpointNode(node),
        ),
        excludedIds,
      );
    },
    [],
  );

  useEffect(() => {
    // Keep live metadata in sync without discarding local selection.
    setNodes((current) => {
      const selected = new Set(
        current.filter((node) => node.selected).map((node) => node.id),
      );
      return incomingNodes.map((node): CanvasFlowNode => {
        if (isTaskCheckpointNode(node)) {
          return {
            ...node,
            selected: selected.has(node.id),
          };
        }
        return {
          ...node,
          selected: selected.has(node.id),
          data: {
            ...node.data,
            nestingTarget: nestingTargetIdRef.current === node.id,
          },
        };
      });
    });
  }, [incomingNodes]);

  useEffect(() => {
    // Keep edge selection local while Convex remains the source of truth.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selected = new Set(
        current.filter((edge) => edge.selected).map((edge) => edge.id),
      );
      return incomingEdges.map((edge) => ({
        ...edge,
        selected: selected.has(edge.id),
      }));
    });
  }, [incomingEdges]);

  useEffect(() => {
    const positions = new Map(
      nodes.map((node) => [node.id, node.position]),
    );
    // Re-anchor every curve to the nearest card sides while cards move.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) =>
      current.map((edge) => adaptEdgeHandles(edge, positions)),
    );
  }, [nodes]);

  const onInit = useCallback(
    (instance: ReactFlowInstance<CanvasFlowNode, AreaFlowEdge>) => {
      flowRef.current = instance;
      if (viewportInitialized.current) return;
      viewportInitialized.current = true;
      if (!canvasData.viewport.persisted && canvasData.pages.length > 0) {
        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.setTimeout(() => {
          void instance.fitView({
            padding: 0.24,
            maxZoom: 1,
            duration: reduceMotion ? 0 : 260,
          });
        }, 0);
      }
    },
    [canvasData.pages.length, canvasData.viewport.persisted],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<CanvasFlowNode>[]) => {
      const current = nodesRef.current;
      const next = applyNodeChanges(changes, current);
      nodesRef.current = next;
      setNodes(next);

      if (pointerDragActiveRef.current) return;
      const currentById = new Map(current.map((node) => [node.id, node]));
      const nextById = new Map(next.map((node) => [node.id, node]));
      const checkpointKeyboardMoves = changes.flatMap((change) => {
        if (change.type !== "position" || change.position === undefined) {
          return [];
        }
        const previous = currentById.get(change.id);
        const updated = nextById.get(change.id);
        if (
          !previous ||
          !updated ||
          !isTaskCheckpointNode(previous) ||
          !isTaskCheckpointNode(updated) ||
          !previous.data.canMove
        ) {
          return [];
        }
        return previous.position.x === updated.position.x &&
          previous.position.y === updated.position.y
          ? []
          : [
              {
                checkpointId: updated.data.checkpointId,
                x: Math.round(updated.position.x),
                y: Math.round(updated.position.y),
              },
            ];
      });
      for (const move of checkpointKeyboardMoves) {
        void saveCheckpointPlacement({
          checkpointId: move.checkpointId,
          canvasRootPageId: rootPageId,
          x: move.x,
          y: move.y,
        }).catch((error) =>
          toast.error(
            accessErrorMessage(error, "Pozicija koraka nije sačuvana."),
          ),
        );
      }
      const keyboardMoves = changes.flatMap((change) => {
        if (change.type !== "position" || change.position === undefined) {
          return [];
        }
        const previous = currentById.get(change.id);
        const updated = nextById.get(change.id);
        if (
          !previous ||
          !updated ||
          isTaskCheckpointNode(previous) ||
          isTaskCheckpointNode(updated) ||
          !previous.data.canMove
        ) {
          return [];
        }
        const before = {
          pageId: previous.id as Id<"pages">,
          x: Math.round(previous.position.x),
          y: Math.round(previous.position.y),
        };
        const after = {
          pageId: updated.id as Id<"pages">,
          x: Math.round(updated.position.x),
          y: Math.round(updated.position.y),
        };
        return before.x === after.x && before.y === after.y
          ? []
          : [{ before, after }];
      });
      if (keyboardMoves.length === 0) return;

      const before = keyboardMoves.map((move) => move.before);
      const after = keyboardMoves.map((move) => move.after);
      const beforeByPageId = new Map(
        before.map((move) => [move.pageId, move]),
      );
      const afterByPageId = new Map(
        after.map((move) => [move.pageId, move]),
      );
      void movePages({
        areaId,
        rootPageId,
        updates: after,
      })
        .then(() => {
          pushHistory({
            label:
              after.length === 1
                ? "pomeranje kartice tastaturom"
                : "pomeranje grupe tastaturom",
            undo: () =>
              movePages({
                areaId,
                rootPageId,
                updates: before,
              }),
            redo: () =>
              movePages({
                areaId,
                rootPageId,
                updates: after,
              }),
          });
        })
        .catch((error) => {
          setNodes((latest) =>
            latest.map((node) => {
              const expected = afterByPageId.get(
                node.id as Id<"pages">,
              );
              const previous = beforeByPageId.get(
                node.id as Id<"pages">,
              );
              if (
                !expected ||
                !previous ||
                Math.round(node.position.x) !== expected.x ||
                Math.round(node.position.y) !== expected.y
              ) {
                return node;
              }
              return {
                ...node,
                position: { x: previous.x, y: previous.y },
              };
            }),
          );
          toast.error(
            accessErrorMessage(error, "Pomeranje tastaturom nije sačuvano."),
          );
        });
    },
    [
      areaId,
      movePages,
      pushHistory,
      rootPageId,
      saveCheckpointPlacement,
    ],
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<AreaFlowEdge>[]) => {
      setEdges((current) => {
        const deletableIds = new Set(
          current
            .filter(
              (edge) =>
                edge.deletable &&
                (edge.data?.canDelete ||
                  edge.data?.canRequestDeletion),
            )
            .map((edge) => edge.id),
        );
        const safeChanges = changes.filter(
          (change) =>
            change.type !== "remove" || deletableIds.has(change.id),
        );
        return applyEdgeChanges(safeChanges, current);
      });
    },
    [],
  );

  const handleConnect = useCallback(
    async (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        connection.source === connection.target
      ) {
        return;
      }

      const sourceNode = nodes.find(
        (node) => node.id === connection.source,
      );
      const targetNode = nodes.find(
        (node) => node.id === connection.target,
      );
      if (!sourceNode || !targetNode) return;

      if (
        isTaskCheckpointNode(sourceNode) ||
        isTaskCheckpointNode(targetNode)
      ) {
        const sourceEndpoint = checkpointEndpointFromNode(sourceNode);
        const targetEndpoint = checkpointEndpointFromNode(targetNode);
        const alreadyConnected = edges.some(
          (edge) =>
            edge.data?.kind === "checkpoint" &&
            ((edge.source === connection.source &&
              edge.target === connection.target) ||
              (edge.source === connection.target &&
                edge.target === connection.source)),
        );
        if (alreadyConnected) {
          toast.info("Ove stavke su već povezane.");
          return;
        }
        const temporaryId =
          `pending:checkpoint:${connection.source}:${connection.target}:${Date.now()}`;
        const connectsPage = sourceEndpoint.kind !== targetEndpoint.kind;
        setEdges((current) =>
          addEdge(
            {
              ...connection,
              id: temporaryId,
              type: "default",
              deletable: false,
              data: {
                backendId: null,
                kind: "checkpoint",
                sourceEndpoint,
                targetEndpoint,
                canDelete: false,
                canRequestDeletion: false,
              },
              style: connectsPage
                ? { strokeDasharray: "7 6" }
                : undefined,
            },
            current,
          ),
        );

        try {
          let currentEdgeId = await connectCheckpointEdge({
            areaId,
            rootPageId,
            source: sourceEndpoint,
            target: targetEndpoint,
          });
          setEdges((current) =>
            current.map((edge) =>
              edge.id === temporaryId
                ? {
                    ...edge,
                    id: edgeUiId("checkpoint", currentEdgeId),
                    deletable: false,
                    data: {
                      backendId: currentEdgeId,
                      kind: "checkpoint",
                      sourceEndpoint,
                      targetEndpoint,
                      canDelete: false,
                      canRequestDeletion: false,
                    },
                  }
                : edge,
            ),
          );
          pushHistory({
            label: "povezivanje koraka",
            undo: () =>
              disconnectCheckpointEdge({
                areaId,
                rootPageId,
                edgeId: currentEdgeId,
              }),
            redo: async () => {
              currentEdgeId = await connectCheckpointEdge({
                areaId,
                rootPageId,
                source: sourceEndpoint,
                target: targetEndpoint,
              });
            },
          });
          toast.success(
            connectsPage
              ? "Korak i kartica su povezani."
              : "Koraci su povezani.",
          );
        } catch (error) {
          setEdges((current) =>
            current.filter((edge) => edge.id !== temporaryId),
          );
          toast.error(
            accessErrorMessage(error, "Veza koraka nije sačuvana."),
          );
        }
        return;
      }

      const sourcePageId = connection.source as Id<"pages">;
      const targetPageId = connection.target as Id<"pages">;
      // Obe kartice su na istom kanvasu, pa je puna linija (kanvas veza)
      // podrazumevana. Relacija ostaje za povezivanje kroz celu oblast i pravi
      // se iz detalja stranice.
      const edgeKind = "canvas" as const;
      const alreadyConnected = edges.some(
        (edge) =>
          edge.data?.kind === edgeKind &&
          ((edge.source === sourcePageId &&
            edge.target === targetPageId) ||
            (edge.source === targetPageId &&
              edge.target === sourcePageId)),
      );
      if (alreadyConnected) {
        toast.info("Ove kartice su već povezane.");
        return;
      }
      const temporaryId = `pending:${edgeKind}:${sourcePageId}:${targetPageId}:${Date.now()}`;
      setEdges((current) =>
        addEdge(
          {
            ...connection,
            id: temporaryId,
            type: "default",
            deletable: false,
            data: {
              backendId: null,
              kind: edgeKind,
              canDelete: false,
              canRequestDeletion: false,
            },
            style: undefined,
          },
          current,
        ),
      );

      try {
        if (edgeKind === "canvas") {
          let currentEdgeId = await connectPages({
            areaId,
            rootPageId,
            sourcePageId,
            targetPageId,
          });
          setEdges((current) =>
            current.map((edge) =>
              edge.id === temporaryId
                ? {
                    ...edge,
                    id: edgeUiId("canvas", currentEdgeId),
                    // Wait for getCanvas to return the authoritative permission.
                    deletable: false,
                    data: {
                      backendId: currentEdgeId,
                      kind: "canvas",
                      canDelete: false,
                      canRequestDeletion: false,
                    },
                  }
                : edge,
            ),
          );
          pushHistory({
            label: "povezivanje kartica",
            undo: () =>
              disconnectPages({
                areaId,
                rootPageId,
                edgeId: currentEdgeId,
              }),
            redo: async () => {
              currentEdgeId = await connectPages({
                areaId,
                rootPageId,
                sourcePageId,
                targetPageId,
              });
            },
          });
        } else {
          let currentRelationId = await createRelation({
            pageAId: sourcePageId,
            pageBId: targetPageId,
          });
          setEdges((current) =>
            current.map((edge) =>
              edge.id === temporaryId
                ? {
                    ...edge,
                    id: edgeUiId("relation", currentRelationId),
                    // Wait for getCanvas to return the authoritative permission.
                    deletable: false,
                    data: {
                      backendId: currentRelationId,
                      kind: "relation",
                      canDelete: false,
                      canRequestDeletion: false,
                    },
                  }
                : edge,
            ),
          );
          pushHistory({
            label: "povezivanje beleške i zadatka",
            undo: () =>
              deleteRelation({
                relationId: currentRelationId,
              }),
            redo: async () => {
              currentRelationId = await createRelation({
                pageAId: sourcePageId,
                pageBId: targetPageId,
              });
            },
          });
        }
        toast.success("Kartice su povezane.");
      } catch (error) {
        setEdges((current) =>
          current.filter((edge) => edge.id !== temporaryId),
        );
        toast.error(
          accessErrorMessage(error, "Veza nije sačuvana."),
        );
      }
    },
    [
      areaId,
      connectCheckpointEdge,
      connectPages,
      createRelation,
      deleteRelation,
      disconnectCheckpointEdge,
      disconnectPages,
      edges,
      nodes,
      pushHistory,
      rootPageId,
    ],
  );

  const handleEdgesDelete = useCallback(
    (deletedEdges: AreaFlowEdge[]) => {
      const records = deletedEdges.flatMap<DeletedEdgeRecord>((edge) => {
        const backendId = edge.data?.backendId;
        if (
          !backendId ||
          !edge.deletable ||
          !edge.data?.canDelete ||
          edge.id.startsWith("pending:")
        ) {
          return [];
        }
        if (edge.data.kind === "checkpoint") {
          return [
            {
              edge,
              sourceEndpoint: edge.data.sourceEndpoint,
              targetEndpoint: edge.data.targetEndpoint,
              kind: "checkpoint",
              currentId: backendId as Id<"taskCheckpointCanvasEdges">,
            },
          ];
        }
        return [
          {
            edge,
            source: edge.source as Id<"pages">,
            target: edge.target as Id<"pages">,
            label:
              typeof edge.label === "string" ? edge.label : undefined,
            kind: edge.data.kind,
            currentId: backendId as
              | Id<"pageCanvasEdgesV2">
              | Id<"pageRelations">,
          },
        ];
      });
      if (records.length === 0) return;

      void (async () => {
        const removed: DeletedEdgeRecord[] = [];
        const failed: AreaFlowEdge[] = [];

        for (const record of records) {
          try {
            if (record.kind === "checkpoint") {
              await disconnectCheckpointEdge({
                areaId,
                rootPageId,
                edgeId: record.currentId,
              });
            } else if (record.kind === "canvas") {
              await disconnectPages({
                areaId,
                rootPageId,
                edgeId: record.currentId as Id<"pageCanvasEdgesV2">,
              });
            } else {
              await deleteRelation({
                relationId: record.currentId as Id<"pageRelations">,
              });
            }
            removed.push(record);
          } catch {
            failed.push(record.edge);
          }
        }

        if (failed.length > 0) {
          setEdges((current) => {
            const currentIds = new Set(current.map((edge) => edge.id));
            return [
              ...current,
              ...failed.filter((edge) => !currentIds.has(edge.id)),
            ];
          });
          toast.error(
            failed.length === 1
              ? "Veza nije uklonjena."
              : "Neke veze nisu uklonjene.",
          );
        }

        if (removed.length === 0) return;
        pushHistory({
          label:
            removed.length === 1
              ? "uklanjanje veze kartica"
              : "uklanjanje veza kartica",
          undo: async () => {
            for (const record of removed) {
              if (record.kind === "checkpoint") {
                record.currentId = await connectCheckpointEdge({
                  areaId,
                  rootPageId,
                  source: record.sourceEndpoint,
                  target: record.targetEndpoint,
                });
              } else if (record.kind === "canvas") {
                record.currentId = await connectPages({
                  areaId,
                  rootPageId,
                  sourcePageId: record.source,
                  targetPageId: record.target,
                  label: record.label,
                });
              } else {
                record.currentId = await createRelation({
                  pageAId: record.source,
                  pageBId: record.target,
                  label: record.label,
                });
              }
            }
          },
          redo: async () => {
            for (const record of removed) {
              if (record.kind === "checkpoint") {
                await disconnectCheckpointEdge({
                  areaId,
                  rootPageId,
                  edgeId: record.currentId,
                });
              } else if (record.kind === "canvas") {
                await disconnectPages({
                  areaId,
                  rootPageId,
                  edgeId:
                    record.currentId as Id<"pageCanvasEdgesV2">,
                });
              } else {
                await deleteRelation({
                  relationId:
                    record.currentId as Id<"pageRelations">,
                });
              }
            }
          },
        });
      })();
    },
    [
      areaId,
      connectCheckpointEdge,
      connectPages,
      createRelation,
      deleteRelation,
      disconnectCheckpointEdge,
      disconnectPages,
      pushHistory,
      rootPageId,
    ],
  );

  const handleMoveEnd = useCallback(
    (_event: MouseEvent | TouchEvent | null, next: Viewport) => {
      setViewport(next);
      void saveViewport({
        areaId,
        rootPageId,
        x: Math.round(next.x),
        y: Math.round(next.y),
        zoom: Number(next.zoom.toFixed(2)),
      }).catch((error) => {
        toast.error(
          accessErrorMessage(error, "Prikaz mape nije sačuvan."),
        );
      });
    },
    [areaId, rootPageId, saveViewport],
  );

  const beginCheckpointResize = useCallback(
    (checkpointId: Id<"taskCheckpoints">) => {
      const node = nodesRef.current.find(
        (candidate): candidate is TaskCheckpointFlowNode =>
          isTaskCheckpointNode(candidate) &&
          candidate.data.checkpointId === checkpointId,
      );
      if (!node || !node.data.canResize) return;
      checkpointResizeStartRef.current.set(checkpointId, {
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? (Number(node.style?.width) || 164),
        height: node.height ?? (Number(node.style?.height) || 92),
        manuallySized: node.data.manuallySized,
      });
    },
    [],
  );

  const persistCheckpointResize = useCallback(
    (
      checkpointId: Id<"taskCheckpoints">,
      before: CheckpointResizeSnapshot,
      after: Omit<CheckpointResizeSnapshot, "manuallySized">,
      historyLabel: string,
    ) => {
      void saveCheckpointPlacement({
        checkpointId,
        canvasRootPageId: rootPageId,
        ...after,
      })
        .then(() => {
          pushHistory({
            label: historyLabel,
            undo: async () => {
              if (before.manuallySized) {
                await saveCheckpointPlacement({
                  checkpointId,
                  canvasRootPageId: rootPageId,
                  x: Math.round(before.x),
                  y: Math.round(before.y),
                  width: Math.round(before.width),
                  height: Math.round(before.height),
                });
                return;
              }
              await saveCheckpointPlacement({
                checkpointId,
                canvasRootPageId: rootPageId,
                x: Math.round(before.x),
                y: Math.round(before.y),
              });
              await resetCheckpointCanvasSize({
                checkpointId,
                canvasRootPageId: rootPageId,
              });
            },
            redo: () =>
              saveCheckpointPlacement({
                checkpointId,
                canvasRootPageId: rootPageId,
                ...after,
              }),
          });
        })
        .catch((error) => {
          setNodes((current) =>
            current.map((node) =>
              isTaskCheckpointNode(node) &&
              node.data.checkpointId === checkpointId
                ? {
                    ...node,
                    position: { x: before.x, y: before.y },
                    width: before.width,
                    height: before.height,
                    style: {
                      ...node.style,
                      width: before.width,
                      height: before.height,
                    },
                  }
                : node,
            ),
          );
          toast.error(
            accessErrorMessage(error, "Veličina koraka nije sačuvana."),
          );
        });
    },
    [
      pushHistory,
      resetCheckpointCanvasSize,
      rootPageId,
      saveCheckpointPlacement,
    ],
  );

  const resizeCheckpoint = useCallback(
    (
      checkpointId: Id<"taskCheckpoints">,
      layoutUpdate: ResizeParams,
    ) => {
      const before = checkpointResizeStartRef.current.get(checkpointId);
      checkpointResizeStartRef.current.delete(checkpointId);
      if (!before) return;
      persistCheckpointResize(
        checkpointId,
        before,
        {
          x: layoutUpdate.x,
          y: layoutUpdate.y,
          width: layoutUpdate.width,
          height: layoutUpdate.height,
        },
        "promena veličine koraka",
      );
    },
    [persistCheckpointResize],
  );

  const setCheckpointSizePreset = useCallback(
    (
      checkpointId: Id<"taskCheckpoints">,
      preset: TaskCheckpointSizePreset,
    ) => {
      const node = nodesRef.current.find(
        (candidate): candidate is TaskCheckpointFlowNode =>
          isTaskCheckpointNode(candidate) &&
          candidate.data.checkpointId === checkpointId,
      );
      if (!node || !node.data.canResize) return;
      const before: CheckpointResizeSnapshot = {
        x: node.position.x,
        y: node.position.y,
        width: node.width ?? (Number(node.style?.width) || 164),
        height: node.height ?? (Number(node.style?.height) || 92),
        manuallySized: node.data.manuallySized,
      };
      const dimensions = TASK_CHECKPOINT_SIZE_PRESETS[preset];
      if (
        Math.round(before.width) === dimensions.width &&
        Math.round(before.height) === dimensions.height
      ) {
        return;
      }
      persistCheckpointResize(
        checkpointId,
        before,
        {
          x: Math.round(before.x),
          y: Math.round(before.y),
          ...dimensions,
        },
        preset === "expanded"
          ? "proširivanje koraka"
          : "smanjivanje koraka",
      );
    },
    [persistCheckpointResize],
  );

  /**
   * Ugnežđavanje je odmah (PROSTOR P4): toast „„X” je ugnežđeno u „Y”." sa
   * „Poništi", a istorija Mape pamti korak. Poništi vraća karticu na ovu Mapu
   * na isto mesto (stranica: `requestNesting` sa x/y; vrh oblasti: `movePage`
   * pa `movePages`). Zaključan cilj odbija server (R6) — poruka ide u toast.
   */
  const nestPage = useCallback(
    async (
      childPageId: Id<"pages">,
      targetParentPageId: Id<"pages">,
      onFailure?: () => void,
    ) => {
      const child = canvasData.pages.find((page) => page._id === childPageId);
      const target = canvasData.pages.find(
        (page) => page._id === targetParentPageId,
      );
      const before = child
        ? { pageId: child._id, x: Math.round(child.x), y: Math.round(child.y) }
        : null;
      // Server pri selidbi arhivira veze kartice na ovoj Mapi (i veze koraka);
      // „Poništi" ih vraća. Relacije se ne diraju.
      const ownEdges = canvasData.edges.filter(
        (edge) => edge.source === childPageId || edge.target === childPageId,
      );
      const ownCheckpointEdges = (canvasData.checkpointEdges ?? []).filter(
        (edge) =>
          (edge.source.kind === "page" && edge.source.id === childPageId) ||
          (edge.target.kind === "page" && edge.target.id === childPageId),
      );
      // Jedno stanje za toast i istoriju Mape: dvostruko poništavanje je no-op.
      let nested = false;
      const nestAgain = async () => {
        await requestNesting({ childPageId, targetParentPageId });
        nested = true;
      };
      const returnHere = async () => {
        if (!nested) return;
        nested = false;
        if (rootPageId !== null) {
          await requestNesting({
            childPageId,
            targetParentPageId: rootPageId,
            ...(before ? { x: before.x, y: before.y } : {}),
          });
        } else {
          await movePage({
            pageId: childPageId,
            targetAreaId: areaId,
            targetParentPageId: null,
          });
          if (before) {
            await movePages({ areaId, rootPageId: null, updates: [before] });
          }
        }
        await Promise.allSettled([
          ...ownEdges.map((edge) =>
            connectPages({
              areaId,
              rootPageId,
              sourcePageId: edge.source,
              targetPageId: edge.target,
              ...(edge.label ? { label: edge.label } : {}),
            }),
          ),
          ...ownCheckpointEdges.map((edge) =>
            connectCheckpointEdge({
              areaId,
              rootPageId,
              source: edge.source,
              target: edge.target,
            }),
          ),
        ]);
      };
      try {
        await nestAgain();
        pushHistory({
          label: "ugnežđavanje kartice",
          undo: returnHere,
          redo: nestAgain,
        });
        toast.success(
          nestedMessage(child?.title ?? "", target?.title ?? ""),
          {
            duration: 8_000,
            action: {
              label: "Poništi",
              onClick: () =>
                void returnHere().catch((error: unknown) =>
                  toast.error(
                    accessErrorMessage(error, "Ugnežđavanje nije poništeno."),
                  ),
                ),
            },
          },
        );
      } catch (error) {
        onFailure?.();
        toast.error(accessErrorMessage(error, "Kartica nije ugnežđena."));
      }
    },
    [
      areaId,
      canvasData.checkpointEdges,
      canvasData.edges,
      canvasData.pages,
      connectCheckpointEdge,
      connectPages,
      movePage,
      movePages,
      pushHistory,
      requestNesting,
      rootPageId,
    ],
  );

  const toDropNode = (node: CanvasFlowNode): MapDropNode => ({
    id: node.id,
    isCheckpoint: isTaskCheckpointNode(node),
    canMove: node.data.canMove,
  });

  const isTaskFilter = filter === "task";
  const isNoteFilter = filter === "note";
  const CanvasIdentityIcon =
    AREA_ICONS[areaKey as AreaKey] || Blocks;
  const peekPage =
    peekPageId === null
      ? null
      : (canvasData.pages.find((page) => page._id === peekPageId) ?? null);

  return (
    <TaskCheckpointNodeActionsProvider
      startResize={beginCheckpointResize}
      resize={resizeCheckpoint}
      setSizePreset={setCheckpointSizePreset}
    >
      <AreaNodeActionsProvider
      areaId={areaId}
      areas={areas}
      nestingCandidates={canvasData.pages.map((page) => ({
        pageId: page._id,
        title: page.title,
        kind: page.kind,
      }))}
      openCanvas={onOpenCanvas}
      openDetails={onOpenDetails}
      peek={(pageId) => {
        const page = canvasData.pages.find(
          (candidate) => candidate._id === pageId,
        );
        if (page?.kind === "task" && onOpenTask) {
          onOpenTask(pageId, page.title);
          return;
        }
        setPeekPageId(pageId);
      }}
      nest={(pageId, target) => nestPage(pageId, target.pageId)}
      toggleCheckpoints={(pageId) => {
        const page = canvasData.pages.find(
          (candidate) => candidate._id === pageId,
        );
        if (page?.kind !== "task" || page.checkpointTotal === 0) return;
        setExpandedTaskId((current) =>
          current === pageId ? null : pageId,
        );
      }}
      resize={(pageId, layout) => {
        const previous = canvasData.pages.find(
          (page) => page._id === pageId,
        );
        if (!previous || !previous.canResize) return;
        const after = {
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
        };
        void resizePage({
          areaId,
          rootPageId,
          pageId,
          ...after,
        })
          .then(() => {
            pushHistory({
              label: `promena veličine ${previous.kind === "task" ? "zadatka" : "beleške"}`,
              undo: () =>
                resizePage({
                  areaId,
                  rootPageId,
                  pageId,
                  x: previous.x,
                  y: previous.y,
                  width: previous.width,
                  height: previous.height,
                }),
              redo: () =>
                resizePage({
                  areaId,
                  rootPageId,
                  pageId,
                  ...after,
                }),
            });
          })
          .catch((error) => {
            setNodes((current) =>
              current.map((node) =>
                node.id === pageId
                  ? {
                      ...node,
                      position: {
                        x: previous.x,
                        y: previous.y,
                      },
                      width: previous.width,
                      height: previous.height,
                      style: {
                        ...node.style,
                        width: previous.width,
                        height: previous.height,
                      },
                    }
                  : node,
              ),
            );
            toast.error(
              accessErrorMessage(error, "Veličina kartice nije sačuvana."),
            );
          });
      }}
      resetSize={(pageId) => {
        const previous = canvasData.pages.find(
          (page) => page._id === pageId,
        );
        if (!previous || !previous.canResize) return;
        void resetPageSize({
          areaId,
          rootPageId,
          pageId,
        })
          .then(() => {
            pushHistory({
              label: `vraćanje početne veličine ${previous.kind === "task" ? "zadatka" : "beleške"}`,
              undo: () =>
                resizePage({
                  areaId,
                  rootPageId,
                  pageId,
                  width: previous.width,
                  height: previous.height,
                }),
              redo: () =>
                resetPageSize({
                  areaId,
                  rootPageId,
                  pageId,
                }),
            });
            toast.success("Vraćena je početna veličina kartice.");
          })
          .catch((error) => {
            toast.error(
              accessErrorMessage(error, "Početna veličina nije vraćena."),
            );
          });
      }}
    >
        <div
        ref={mapRef}
        className={cn(
          styles.canvas,
          MAP_FRAME_CLASS,
          layout === "task-focus" ? "min-h-[28rem]" : "min-h-[32rem]",
          samoPregled && "!min-h-[24rem]",
        )}
        data-canvas-space-pan={canvasNavigation.spacePressed}
        data-canvas-zoom-modifier={canvasNavigation.zoomModifierPressed}
        data-map-active={mapActive}
        {...mapActivationHandlers}
        // AreaView does not provide a fixed-height parent. Keep a definite
        // containing-block height so React Flow's 100% height cannot collapse.
        style={{
          height: samoPregled
            ? "min(60dvh, 30rem)"
            : layout === "task-focus"
              ? "clamp(28rem, calc(100dvh - 12rem), 56rem)"
              : "min(72vh, 52rem)",
        }}
        onKeyDownCapture={(event) => {
          // React capture prolazi i kroz portale (fioka, meniji, dijalozi) i
          // kroz polja za tekst: tu prečice Mape ne važe.
          if (
            event.defaultPrevented ||
            !(event.target instanceof Node) ||
            !event.currentTarget.contains(event.target) ||
            isEditableTarget(event.target)
          ) {
            return;
          }
          const modifier = event.ctrlKey || event.metaKey;
          // Enter na izabranoj kartici vodi do njenih radnji (traka je portal
          // iza svih kartica u redosledu tabova).
          if (
            event.key === "Enter" &&
            !modifier &&
            event.target instanceof HTMLElement &&
            event.target.classList.contains("react-flow__node")
          ) {
            const nodeId = event.target.getAttribute("data-id");
            const node = nodes.find((candidate) => candidate.id === nodeId);
            if (node?.selected) {
              const toolbar = event.currentTarget.querySelector<HTMLElement>(
                `.react-flow__node-toolbar[data-id="${CSS.escape(node.id)}"] button:not(:disabled)`,
              );
              if (toolbar) {
                event.preventDefault();
                event.stopPropagation();
                toolbar.focus();
              }
            }
            return;
          }
          if (modifier && event.key.toLowerCase() === "a") {
            event.preventDefault();
            setNodes((current) =>
              current.map((node) => ({ ...node, selected: true })),
            );
          } else if (event.key === "Escape") {
            const hasSelection =
              nodes.some((node) => node.selected) ||
              edges.some((edge) => edge.selected);
            // Bez selekcije Esc putuje dalje do globalne navigacije „nazad”
            // (i gasi točkić Mape). Potrošen Esc se označava sa preventDefault
            // — to je ugovor koji globalni slušalac Mape stranice
            // (`PageMapView`) poštuje.
            if (!hasSelection) {
              deactivateMap();
              return;
            }
            event.preventDefault();
            setNodes((current) =>
              current.map((node) => ({ ...node, selected: false })),
            );
            setEdges((current) =>
              current.map((edge) => ({ ...edge, selected: false })),
            );
          }
        }}
      >
        <ReactFlow<CanvasFlowNode, AreaFlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          onInit={onInit}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={(connection) => void handleConnect(connection)}
          onNodeDragStart={(_event, _node, draggedNodes) => {
            pointerDragActiveRef.current = true;
            updateNestingTarget(null);
            preDragPositionsRef.current = new Map(
              draggedNodes
                .filter((dragged) => dragged.data.canMove)
                .map((dragged) => [
                  dragged.id,
                  {
                    x: dragged.position.x,
                    y: dragged.position.y,
                  },
                ]),
            );
          }}
          onNodeDrag={(_event, draggedNode, draggedNodes) => {
            const target = detectNestingTarget(
              draggedNode,
              draggedNodes,
            );
            updateNestingTarget(target?.id ?? null);
          }}
          onNodeDragStop={(_event, draggedNode, draggedNodes) => {
            window.setTimeout(() => {
              pointerDragActiveRef.current = false;
            }, 0);
            const nestingTarget = detectNestingTarget(
              draggedNode,
              draggedNodes,
            );
            updateNestingTarget(null);
            const plan = planMapDrop(
              toDropNode(draggedNode),
              draggedNodes.map(toDropNode),
              nestingTarget?.id ?? null,
            );
            if (plan.kind === "none") {
              preDragPositionsRef.current.clear();
              return;
            }
            if (plan.kind === "checkpoints") {
              const movedCheckpoints = draggedNodes.filter(
                (node): node is TaskCheckpointFlowNode =>
                  isTaskCheckpointNode(node) && plan.ids.includes(node.id),
              );
              preDragPositionsRef.current.clear();
              void Promise.all(
                movedCheckpoints.map((node) =>
                  saveCheckpointPlacement({
                    checkpointId: node.data.checkpointId,
                    canvasRootPageId: rootPageId,
                    x: Math.round(node.position.x),
                    y: Math.round(node.position.y),
                  }),
                ),
              ).catch((error) => {
                toast.error(
                  accessErrorMessage(error, "Pozicija koraka nije sačuvana."),
                );
              });
              return;
            }
            const movableNodes = draggedNodes.filter(
              (dragged): dragged is AreaFlowNode =>
                !isTaskCheckpointNode(dragged) && dragged.data.canMove,
            );
            const before = movableNodes.flatMap((dragged) => {
              const position = preDragPositionsRef.current.get(dragged.id);
              return position
                ? [
                    {
                      pageId: dragged.id as Id<"pages">,
                      x: Math.round(position.x),
                      y: Math.round(position.y),
                    },
                  ]
                : [];
            });
            const beforeByPageId = new Map(
              before.map((move) => [
                move.pageId,
                { x: move.x, y: move.y },
              ]),
            );
            const after = movableNodes.flatMap((dragged) =>
              beforeByPageId.has(dragged.id as Id<"pages">)
                ? [
                    {
                      pageId: dragged.id as Id<"pages">,
                      x: Math.round(dragged.position.x),
                      y: Math.round(dragged.position.y),
                    },
                  ]
                : [],
            );
            preDragPositionsRef.current.clear();
            const restorePreviousPositions = () => {
              setNodes((current) =>
                current.map((node) => {
                  const previous = beforeByPageId.get(
                    node.id as Id<"pages">,
                  );
                  return previous
                    ? { ...node, position: previous }
                    : node;
                }),
              );
            };
            if (plan.kind === "nest") {
              // Kartica se vraća na mesto dok server ne potvrdi: posle toga
              // nestaje sa ove Mape (živi upit), a u cilju se vidi broj.
              restorePreviousPositions();
              void nestPage(
                plan.childId as Id<"pages">,
                plan.targetId as Id<"pages">,
              );
              return;
            }
            const changed = after.some((move) => {
              const previous = beforeByPageId.get(move.pageId);
              return (
                previous?.x !== move.x || previous?.y !== move.y
              );
            });
            if (!changed) return;

            void movePages({
              areaId,
              rootPageId,
              updates: after,
            })
              .then(() => {
                pushHistory({
                  label:
                    after.length === 1
                      ? "pomeranje kartice"
                      : "pomeranje grupe kartica",
                  undo: () =>
                    movePages({
                      areaId,
                      rootPageId,
                      updates: before,
                    }),
                  redo: () =>
                    movePages({
                      areaId,
                      rootPageId,
                      updates: after,
                    }),
                });
              })
              .catch((error) => {
                restorePreviousPositions();
                toast.error(
                  accessErrorMessage(error, "Pozicija nije sačuvana."),
                );
              });
          }}
          onEdgesDelete={handleEdgesDelete}
          onMove={(_event, next) => setViewport(next)}
          onMoveEnd={handleMoveEnd}
          defaultViewport={viewport}
          minZoom={0.18}
          maxZoom={2.2}
          connectionMode={ConnectionMode.Loose}
          zoomOnDoubleClick={false}
          zoomOnScroll={false}
          panOnScroll={mapActive}
          preventScrolling={mapActive}
          panOnDrag={[1, 2]}
          panActivationKeyCode="Space"
          zoomActivationKeyCode={["Control", "Meta"]}
          noPanClassName={canvasNavigation.noPanClassName}
          noWheelClassName={canvasNavigation.noWheelClassName}
          selectionOnDrag={!samoPregled}
          selectionMode={SelectionMode.Partial}
          selectionKeyCode="Shift"
          multiSelectionKeyCode={["Control", "Meta"]}
          deleteKeyCode={["Backspace", "Delete"]}
          nodeDragThreshold={3}
          connectionDragThreshold={4}
          elevateNodesOnSelect
          elementsSelectable={!samoPregled}
          // Na telefonu dodir na kartici otvara pregled (traka radnji iznad
          // sićušne kartice bi izlazila van okvira mape).
          onNodeClick={
            samoPregled
              ? (event, node) => {
                  if (node.type !== "areaPage") return;
                  if (
                    event.target instanceof Element &&
                    event.target.closest("button, a, [role=button]") !== null
                  ) {
                    return;
                  }
                  setPeekPageId(node.id as Id<"pages">);
                }
              : undefined
          }
          nodesDraggable={!samoPregled}
          nodesConnectable={!samoPregled}
          nodesFocusable
          edgesFocusable
          fitViewOptions={{ padding: 0.24, maxZoom: 1 }}
          aria-label={`Mapa ${canvasLabel}: ${
            filter === "all" ? "sve kartice" : PAGE_KIND_META[filter].labelPlural
          }`}
          ariaLabelConfig={SERBIAN_ARIA_LABELS}
          colorMode="dark"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.15}
            color="color-mix(in oklab, var(--muted-foreground) 30%, transparent)"
          />
          <Controls
            position="bottom-left"
            showInteractive={false}
          />

          {samoPregled ? null : (
            <Panel position="top-left" className="m-3">
              <MapHistoryButtons
                undoCount={historyState.undoCount}
                redoCount={historyState.redoCount}
                busy={historyState.busy}
                onUndo={() => void runHistory("undo")}
                onRedo={() => void runHistory("redo")}
                undoIcon={<Undo2 className="size-4" aria-hidden="true" />}
                redoIcon={<Redo2 className="size-4" aria-hidden="true" />}
              />
            </Panel>
          )}

          <Panel position="top-right" className="m-3">
            <CanvasActionRail
              horizontal={samoPregled}
              ariaLabel={`Radnje na mapi ${canvasLabel}`}
              identity={{
                label: "Mapa",
                icon: CanvasIdentityIcon,
                count: nodes.length,
              }}
              sections={[
                {
                  id: "Novo",
                  items: samoPregled ? [] : PAGE_KIND_KEYS.map((kind) => ({
                    id: `new-${kind}`,
                    label: `Novo: ${PAGE_KIND_META[kind].label}`,
                    icon: PAGE_KIND_META[kind].icon,
                    onSelect: () => onCreatePage(kind),
                  })),
                },
                {
                  id: "Prikaz",
                  ariaLabel: "Vrste kartica na mapi",
                  variant: "switch",
                  items: [
                    {
                      id: "filter-all",
                      label: "Sve",
                      icon: LayoutGrid,
                      active: filter === "all",
                      onSelect: () => onFilterChange("all"),
                    },
                    ...PAGE_KIND_KEYS.map((kind) => ({
                      id: `filter-${kind}`,
                      label: PAGE_KIND_META[kind].label,
                      icon: PAGE_KIND_META[kind].icon,
                      active: filter === kind,
                      onSelect: () => onFilterChange(kind),
                    })),
                  ],
                },
              ]}
            />
          </Panel>

          <Panel position="bottom-center" className="!mb-3">
            <MapStatusBar zoom={viewport.zoom} active={mapActive} />
          </Panel>

          {canvasData.truncated ? (
            <Panel position="top-center" className="!mt-3">
              <p
                role="status"
                className="rounded-md border border-line bg-card px-2.5 py-1 text-xs text-muted-foreground"
              >
                Prikazan je deo kartica — na mapi ih je previše.
              </p>
            </Panel>
          ) : null}
        </ReactFlow>

        {nodes.length === 0 ? (
          <MapEmptyState
            icon={filter === "all" ? LayoutGrid : pageKindMeta(filter).icon}
            title={
              canvasData.truncated
                ? "Nema takvih kartica među učitanima."
                : filter === "all"
                  ? "Na mapi još nema kartica."
                  : isTaskFilter
                    ? "Na mapi nema zadataka."
                    : isNoteFilter
                      ? "Na mapi nema beležaka."
                      : "Na mapi nema kartica ove vrste."
            }
            description={
              canvasData.truncated
                ? "Probaj drugi filter."
                : filter === "all"
                  ? "Dodaj zadatak ili belešku da se pojavi na mapi."
                  : isTaskFilter
                    ? "Napravi zadatak da se pojavi na mapi."
                    : isNoteFilter
                      ? "Napravi belešku da se pojavi na mapi."
                      : "Prikaži sve kartice ili izaberi drugu vrstu."
            }
            actions={
              filter !== "all" && !isTaskFilter && !isNoteFilter ? (
                <Button variant="outline" onClick={() => onFilterChange("all")}>
                  Prikaži sve
                </Button>
              ) : (
                <>
                  {filter !== "note" ? (
                    <Button variant="secondary" onClick={() => onCreatePage("task")}>
                      <Plus className="size-4" aria-hidden="true" /> Novi zadatak
                    </Button>
                  ) : null}
                  {filter !== "task" ? (
                    <Button
                      variant={filter === "all" ? "outline" : "secondary"}
                      onClick={() => onCreatePage("note")}
                    >
                      <Plus className="size-4" aria-hidden="true" /> Nova beleška
                    </Button>
                  ) : null}
                  {filter !== "all" ? (
                    <Button variant="ghost" onClick={() => onFilterChange("all")}>
                      Prikaži sve
                    </Button>
                  ) : null}
                </>
              )
            }
          />
        ) : null}

        </div>
        {samoPregled ? (
          <p className="mt-2 text-meta text-text-muted">
            Mapa se uređuje na računaru.
          </p>
        ) : null}
        <PagePeek
          open={peekPage !== null}
          onOpenChange={(open) => {
            if (!open) setPeekPageId(null);
          }}
          page={
            peekPage === null
              ? null
              : {
                  _id: peekPage._id,
                  card: mapPageCard(
                    {
                      ...peekPage,
                      creatorName: peekPage.creator?.displayName ?? null,
                    },
                    now,
                    childCountById.get(peekPage._id) ?? null,
                  ),
                  text: peekPage.text,
                }
          }
          onOpen={(pageId) => {
            setPeekPageId(null);
            onOpenDetails(pageId);
          }}
        />
      </AreaNodeActionsProvider>
    </TaskCheckpointNodeActionsProvider>
  );
}
