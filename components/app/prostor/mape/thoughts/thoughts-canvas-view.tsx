"use client";


// Preneto iz Devotion apps/web/components/workspace/thoughts/thoughts-canvas-view.tsx (main @ c05c40f), SPAJANJE S14.
import "../mapa-stil";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { useMutation } from "convex/react";
import {
  Archive,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Crown,
  Edit3,
  Expand,
  FileInput,
  Focus,
  History,
  Link2,
  LoaderCircle,
  MousePointer2,
  Plus,
  Redo2,
  Send,
  Sparkles,
  Trash2,
  Ungroup,
  Undo2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { Badge } from "@/components/ui/badge";
import {
  MAP_FRAME_CLASS,
  MapEmptyState,
  MapHistoryButtons,
} from "@/components/app/prostor/mape/map/map-chrome";
import { Button } from "@/components/ui/button";
import { CanvasActionRail } from "@/components/app/prostor/mape/canvases/canvas-action-rail";
import {
  useCanvasNavigation,
  useMapActivation,
} from "@/components/app/prostor/mape/canvases/use-canvas-navigation";
import { MAP_INACTIVE_HINT } from "@/lib/prostor/modeli/map-model";
import {
  THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
  type ThoughtSidebarDragPointer,
  type ThoughtSidebarDragReleaseDetail,
} from "@/components/app/prostor/ja/brzi-unos/thought-sharing";
import {
  ITEM_SIZE_DIMENSIONS,
  type ItemSizePreset,
} from "@/components/app/prostor/mape/workspace-item-dialog";
import { useWorkspaceHistory } from "@/components/app/prostor/zajednicko/istorija-radnji";
import { usePrecica } from "@/components/app/use-precica";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { ThoughtConversionDialog } from "@/components/app/prostor/mape/thoughts/thought-conversion-dialog";
import { EdgeEditorDialog, ThoughtEditorDialog } from "@/components/app/prostor/mape/thoughts/thought-editor-dialog";
import { ThoughtEdge, ThoughtEdgeActionsProvider } from "@/components/app/prostor/mape/thoughts/thought-edge";
import { isThoughtDescendant } from "@/lib/prostor/modeli/thought-hierarchy";
import { ThoughtNode, ThoughtNodeActionsProvider } from "@/components/app/prostor/mape/thoughts/thought-node";
import styles from "@/components/app/prostor/mape/thoughts/thoughts-canvas.module.css";
import type {
  ThoughtDestinationRequest,
  ThoughtEditorValue,
  ThoughtFlowNode,
  ThoughtNodeColor,
  ThoughtsCanvasViewProps,
} from "@/components/app/prostor/mape/thoughts/types";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";
import {
  useProjekatKlijent,
  useProjekatPaginatedQuery,
} from "@/components/app/prostor/podaci/projekat";
import { BOJA_MAPE_SLOT } from "@/lib/prostor/web/boja-mape";

type ThoughtFlowEdge = Edge<Record<string, never>, "default" | "smoothstep">;
type ThoughtNodeDoc = Doc<"thoughtNodes">;
type ThoughtEdgeDoc = Doc<"thoughtEdges">;

type NodeEditorState =
  | {
      mode: "create";
      position: { x: number; y: number };
      connectFrom?: Id<"thoughtNodes">;
    }
  | { mode: "edit"; nodeId: Id<"thoughtNodes"> }
  | null;

type ContextTarget =
  | { kind: "pane"; position: { x: number; y: number } }
  | { kind: "node"; nodeId: Id<"thoughtNodes"> }
  | { kind: "edge"; edgeId: Id<"thoughtEdges"> };

type ConversionState = {
  nodeIds: Id<"thoughtNodes">[];
} | null;

const NODE_TYPES = { thought: ThoughtNode };
const EDGE_TYPES = { default: ThoughtEdge };

/**
 * Boja beleške je kategorija (`--chart-1..6`, isti slotovi kao na karticama);
 * neutralna nema boju kategorije pa na mini-mapi ide prigušenim tekstom.
 */
function miniMapColor(color: ThoughtNodeColor) {
  const slot = BOJA_MAPE_SLOT[color];
  return slot === null ? "var(--text-muted)" : `var(--chart-${slot})`;
}

const SERBIAN_ARIA_LABELS = {
  "node.a11yDescription.default":
    "Pritisni Enter ili Space da izabereš misao. Strelicama je pomeraš.",
  "node.a11yDescription.keyboardDisabled": "Ova misao se ne može pomerati tastaturom.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `Misao je pomerena ${direction}. Nova pozicija je ${Math.round(x)}, ${Math.round(y)}.`,
  "edge.a11yDescription.default": "Pritisni Enter ili Space da izabereš vezu.",
  "controls.ariaLabel": "Kontrole mape",
  "controls.zoomIn.ariaLabel": "Uvećaj prikaz",
  "controls.zoomOut.ariaLabel": "Umanji prikaz",
  "controls.fitView.ariaLabel": "Prikaži sve misli",
  "controls.interactive.ariaLabel": "Uključi ili isključi interakciju",
  "minimap.ariaLabel": "Minimapa misli",
  "handle.ariaLabel": "Tačka za povezivanje misli",
} as const;

function toFlowNode(
  doc: ThoughtNodeDoc,
  founder: { displayName: string; avatarUrl: string | null },
): ThoughtFlowNode {
  const width = doc.width ?? (doc.isParent ? 240 : 232);
  const height = doc.height ?? 160;
  return {
    id: doc._id,
    type: "thought",
    position: { x: doc.x, y: doc.y },
    data: {
      title: doc.title,
      text: doc.text,
      color: doc.color,
      isParent: doc.isParent ?? false,
      parentThoughtId: doc.parentThoughtId,
      conversionCount: doc.conversionCount,
      lastConvertedIdeaId: doc.lastConvertedIdeaId ?? null,
      lastConvertedPageId: doc.lastConvertedPageId,
      authorName: founder.displayName,
      authorAvatarUrl: founder.avatarUrl,
      createdAt: doc.createdAt,
    },
    parentId: doc.parentThoughtId,
    expandParent: doc.parentThoughtId !== undefined,
    style: { width, height },
    width,
    height,
    ariaLabel: `${doc.isParent ? "Glavna misao" : "Misao"}: ${doc.title ?? ""}. ${doc.text}`,
  };
}

function thoughtsParentsFirst(docs: ThoughtNodeDoc[]) {
  const byId = new Map(docs.map((doc) => [doc._id, doc]));
  const ordered: ThoughtNodeDoc[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (doc: ThoughtNodeDoc) => {
    if (visited.has(doc._id) || visiting.has(doc._id)) return;
    visiting.add(doc._id);
    const parent =
      doc.parentThoughtId === undefined
        ? undefined
        : byId.get(doc.parentThoughtId);
    if (parent) visit(parent);
    visiting.delete(doc._id);
    visited.add(doc._id);
    ordered.push(doc);
  };
  docs.forEach(visit);
  return ordered;
}

function toFlowEdge(doc: ThoughtEdgeDoc): ThoughtFlowEdge {
  return {
    id: doc._id,
    type: "default",
    source: doc.nodeAId,
    target: doc.nodeBId,
    label: doc.label ?? undefined,
    ariaLabel: doc.label ? `Veza: ${doc.label}` : "Veza između dve misli",
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 8,
    interactionWidth: 22,
    reconnectable: true,
  };
}

function mergeDocs<T extends { _id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item._id, item]));
  incoming.forEach((item) => merged.set(item._id, item));
  return Array.from(merged.values());
}

function selectedThoughtIds(nodes: ThoughtFlowNode[]) {
  return nodes.filter((node) => node.selected).map((node) => node.id as Id<"thoughtNodes">);
}

function clientPoint(event: MouseEvent | TouchEvent) {
  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

function sidebarDragReleaseDetail(
  event: MouseEvent | TouchEvent,
  sessionId: string,
): ThoughtSidebarDragReleaseDetail | null {
  if ("touches" in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch
      ? {
          sessionId,
          x: touch.clientX,
          y: touch.clientY,
          pointerId: null,
          source: "touch",
          touchId: touch.identifier,
        }
      : null;
  }
  const pointer = event as MouseEvent | PointerEvent;
  if ("pointerId" in pointer) {
    return {
      sessionId,
      x: pointer.clientX,
      y: pointer.clientY,
      pointerId: pointer.pointerId,
      source: "pointer",
      touchId: null,
    };
  }
  return {
    sessionId,
    x: pointer.clientX,
    y: pointer.clientY,
    pointerId: null,
    source: "mouse",
    touchId: null,
  };
}

function isTextEntry(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"),
  );
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

export function ThoughtsCanvasView(props: ThoughtsCanvasViewProps) {
  return (
    <ReactFlowProvider key={props.workspace._id}>
      <ThoughtsCanvasBody {...props} />
    </ReactFlowProvider>
  );
}

function ThoughtsCanvasBody({
  workspace,
  profile,
  onOpenPage,
  onOpenIdeas,
  onBeginSidebarDrag,
}: ThoughtsCanvasViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<ReactFlowInstance<ThoughtFlowNode, ThoughtFlowEdge> | null>(null);
  const viewportReadyRef = useRef(false);
  const preDragPositionsRef = useRef(new Map<string, { x: number; y: number }>());
  const preDragViewportRef = useRef<Viewport | null>(null);
  const sidebarDragStartedRef = useRef(false);
  const sidebarDragTerminatedRef = useRef(false);
  const sidebarDragSessionIdRef = useRef<string | null>(null);
  const sidebarDragInputRef = useRef<ThoughtSidebarDragReleaseDetail | null>(null);
  const canvasNavigation = useCanvasNavigation();
  // Točkić skroluje stranicu dok se ne klikne u mapu (isto kao Mapa oblasti i
  // ideja); zum je Ctrl/⌘ + točkić ili dugmići.
  const {
    ref: mapRef,
    active: mapActive,
    handlers: mapActivationHandlers,
  } = useMapActivation();
  const setWrapper = useCallback(
    (element: HTMLDivElement | null) => {
      wrapperRef.current = element;
      mapRef.current = element;
    },
    [mapRef],
  );
  const reducedMotion = useReducedMotion();
  const projekatKlijent = useProjekatKlijent();
  const duplicateShortcut = usePrecica("D");
  const canvas = useProjekatQuery(api.prostor.thoughts.getCanvas);
  const nodePagination = useProjekatPaginatedQuery(
    api.prostor.thoughts.listNodes,
    {},
    { initialNumItems: 100 },
  );
  const edgePagination = useProjekatPaginatedQuery(
    api.prostor.thoughts.listEdges,
    {},
    { initialNumItems: 200 },
  );

  const saveViewport = useProjekatMutation(api.prostor.thoughts.saveViewport);
  const createNode = useProjekatMutation(api.prostor.thoughts.createNode);
  const updateNode = useMutation(api.prostor.thoughts.updateNode);
  const moveNodes = useMutation(api.prostor.thoughts.moveNodes);
  const updateNodeLayout = useMutation(api.prostor.thoughts.updateNodeLayout);
  const resetNodeLayoutSize = useMutation(api.prostor.thoughts.resetNodeLayoutSize);
  const nestNode = useMutation(api.prostor.thoughts.nestNode);
  const detachNode = useMutation(api.prostor.thoughts.detachNode);
  const duplicateNodes = useMutation(api.prostor.thoughts.duplicateNodes);
  const archiveNodes = useMutation(api.prostor.thoughts.archiveNodes);
  const restoreNodes = useMutation(api.prostor.thoughts.restoreNodes);
  const createEdge = useProjekatMutation(api.prostor.thoughts.createEdge);
  const updateEdge = useMutation(api.prostor.thoughts.updateEdge);
  const archiveEdges = useMutation(api.prostor.thoughts.archiveEdges);
  const restoreEdges = useMutation(api.prostor.thoughts.restoreEdges);
  const toggleNodeParent = useMutation(api.prostor.thoughts.toggleNodeParent);

  const [nodes, setNodes] = useState<ThoughtFlowNode[]>([]);
  const [edges, setEdges] = useState<ThoughtFlowEdge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<
    ThoughtFlowNode,
    ThoughtFlowEdge
  > | null>(null);
  const [supplementalNodes, setSupplementalNodes] = useState<ThoughtNodeDoc[]>([]);
  const [supplementalEdges, setSupplementalEdges] = useState<ThoughtEdgeDoc[]>([]);
  const [connectedNodeIds, setConnectedNodeIds] = useState<ReadonlySet<string>>(new Set());
  const [editor, setEditor] = useState<NodeEditorState>(null);
  const [edgeEditorId, setEdgeEditorId] = useState<Id<"thoughtEdges"> | null>(null);
  const [editorPending, setEditorPending] = useState(false);
  const [contextTarget, setContextTarget] = useState<ContextTarget>({
    kind: "pane",
    position: { x: 0, y: 0 },
  });
  const [contextOpen, setContextOpen] = useState(false);
  const [conversion, setConversion] = useState<ConversionState>(null);
  const { historyState, pushHistory, runHistory } = useWorkspaceHistory();
  const [sidebarDragActive, setSidebarDragActive] = useState(false);

  useEffect(() => {
    // A release outside the browser can end the sidebar layer without giving
    // React Flow its drag-stop event. A release listener runs before D3's end
    // handler, so clear only on the next task: D3 first gets a chance to enter
    // the canceled branch and restore the original positions.
    function scheduleTerminatedSidebarDragCleanup(
      event: PointerEvent | MouseEvent | TouchEvent,
    ) {
      const tracked = sidebarDragInputRef.current;
      if (tracked === null) return;
      const matches = tracked.source === "touch"
        ? event instanceof TouchEvent && tracked.touchId !== null &&
          Array.from(event.changedTouches).some((touch) => touch.identifier === tracked.touchId)
        : tracked.source === "pointer"
          ? event instanceof PointerEvent && event.pointerId === tracked.pointerId
          : event instanceof MouseEvent && !(event instanceof PointerEvent);
      if (!matches) return;
      const sessionId = tracked.sessionId;
      window.setTimeout(() => {
        if (
          !sidebarDragStartedRef.current &&
          sidebarDragInputRef.current?.sessionId === sessionId
        ) {
          sidebarDragTerminatedRef.current = false;
          sidebarDragInputRef.current = null;
        }
      }, 0);
    }

    window.addEventListener("pointerup", scheduleTerminatedSidebarDragCleanup, true);
    window.addEventListener("mouseup", scheduleTerminatedSidebarDragCleanup, true);
    window.addEventListener("touchend", scheduleTerminatedSidebarDragCleanup, true);
    window.addEventListener("touchcancel", scheduleTerminatedSidebarDragCleanup, true);
    return () => {
      window.removeEventListener("pointerup", scheduleTerminatedSidebarDragCleanup, true);
      window.removeEventListener("mouseup", scheduleTerminatedSidebarDragCleanup, true);
      window.removeEventListener("touchend", scheduleTerminatedSidebarDragCleanup, true);
      window.removeEventListener("touchcancel", scheduleTerminatedSidebarDragCleanup, true);
    };
  }, []);

  const nodeDocs = useMemo(
    () => mergeDocs(nodePagination.results, supplementalNodes),
    [nodePagination.results, supplementalNodes],
  );
  const edgeDocs = useMemo(
    () => mergeDocs(edgePagination.results, supplementalEdges),
    [edgePagination.results, supplementalEdges],
  );
  const nodeDocsById = useMemo(
    () => new Map(nodeDocs.map((node) => [node._id, node])),
    [nodeDocs],
  );
  const edgeDocsById = useMemo(
    () => new Map(edgeDocs.map((edge) => [edge._id, edge])),
    [edgeDocs],
  );

  useEffect(() => {
    // The Convex subscription is the source of truth; React Flow needs its own
    // mutable selection/drag state, so reconcile the external snapshot here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNodes((current) => {
      const selection = new Set(current.filter((node) => node.selected).map((node) => node.id));
      const ids = new Set(nodeDocs.map((doc) => doc._id));
      return thoughtsParentsFirst(nodeDocs).map((rawDoc) => {
        const doc =
          rawDoc.parentThoughtId !== undefined &&
          !ids.has(rawDoc.parentThoughtId)
            ? { ...rawDoc, parentThoughtId: undefined }
            : rawDoc;
        return { ...toFlowNode(doc, profile), selected: selection.has(doc._id) };
      });
    });
  }, [nodeDocs, profile]);

  useEffect(() => {
    // See the node reconciliation above. Edge selection remains client-local.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEdges((current) => {
      const selection = new Set(current.filter((edge) => edge.selected).map((edge) => edge.id));
      return edgeDocs.map((doc) => ({ ...toFlowEdge(doc), selected: selection.has(doc._id) }));
    });
  }, [edgeDocs]);

  useEffect(() => {
    if (canvas === undefined || !flowInstance || viewportReadyRef.current) return;
    viewportReadyRef.current = true;
    if (canvas) {
      void flowInstance.setViewport(
        { x: canvas.x, y: canvas.y, zoom: canvas.zoom },
        { duration: reducedMotion ? 0 : 240 },
      );
    } else if (nodeDocs.length > 0) {
      void flowInstance.fitView({
        padding: 0.24,
        duration: reducedMotion ? 0 : 320,
        maxZoom: 1.1,
      });
    }
  }, [canvas, flowInstance, nodeDocs.length, reducedMotion]);

  const openEditor = useCallback((nodeId: Id<"thoughtNodes">) => {
    setEditor({ mode: "edit", nodeId });
  }, []);

  const makeDestinationRequest = useCallback((nodeIds: Id<"thoughtNodes">[]) => {
    const uniqueIds = Array.from(new Set(nodeIds)).slice(0, 50);
    const first = uniqueIds[0] ? nodeDocsById.get(uniqueIds[0]) : null;
    const label =
      uniqueIds.length === 1
        ? first?.title ?? first?.text.split(/\r?\n/)[0]?.slice(0, 60) ?? "Jedna misao"
        : `${uniqueIds.length} misli`;
    const request: ThoughtDestinationRequest = {
      nodeIds: uniqueIds,
      label,
      complete: () => setConversion({ nodeIds: uniqueIds }),
      cancel: () => undefined,
    };
    return request;
  }, [nodeDocsById]);

  const requestIdeaConversion = useCallback((nodeIds: Id<"thoughtNodes">[]) => {
    if (nodeIds.length === 0) return;
    if (nodeIds.length > 50) {
      toast.error("Odaberi najviše 50 misli za slanje u Ideje.");
      return;
    }
    setConversion({ nodeIds: Array.from(new Set(nodeIds)) });
  }, []);

  const duplicateSelection = useCallback(async (nodeIds: Id<"thoughtNodes">[]) => {
    if (nodeIds.length === 0) return;
    if (nodeIds.length > 50) {
      toast.error("Možeš odjednom da dupliraš najviše 50 misli.");
      return;
    }
    try {
      const duplicatedIds = await duplicateNodes({
        nodeIds,
        offsetX: 38,
        offsetY: 38,
      });
      pushHistory({
        label: nodeIds.length === 1 ? "dupliranje misli" : "dupliranje misli",
        undo: () => archiveNodes({ nodeIds: duplicatedIds }),
        redo: () => restoreNodes({ nodeIds: duplicatedIds }),
      });
      toast.success(nodeIds.length === 1 ? "Misao je duplirana." : `${nodeIds.length} misli je duplirano.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Misli nisu duplirane.");
    }
  }, [archiveNodes, duplicateNodes, pushHistory, restoreNodes]);

  const archiveSelection = useCallback(async (
    nodeIds: Id<"thoughtNodes">[],
    edgeIds: Id<"thoughtEdges">[],
  ) => {
    if (nodeIds.length + edgeIds.length === 0) return;
    if (nodeIds.length > 50 || edgeIds.length > 50) {
      toast.error("Arhiviraj najviše 50 misli i 50 veza odjednom.");
      return;
    }
    try {
      if (edgeIds.length) await archiveEdges({ edgeIds });
      if (nodeIds.length) await archiveNodes({ nodeIds });
      setSupplementalNodes((current) => current.filter((node) => !nodeIds.includes(node._id)));
      setSupplementalEdges((current) => current.filter((edge) => !edgeIds.includes(edge._id)));
      pushHistory({
        label: nodeIds.length ? "arhiviranje misli" : "arhiviranje veze",
        undo: async () => {
          if (nodeIds.length) await restoreNodes({ nodeIds });
          if (edgeIds.length) await restoreEdges({ edgeIds });
        },
        redo: async () => {
          if (edgeIds.length) await archiveEdges({ edgeIds });
          if (nodeIds.length) await archiveNodes({ nodeIds });
        },
      });
      toast.success(nodeIds.length ? "Misao je sklonjena u arhivu." : "Veza je arhivirana.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Izbor nije arhiviran.");
    }
  }, [archiveEdges, archiveNodes, pushHistory, restoreEdges, restoreNodes]);

  const selectConnected = useCallback(async (nodeId: Id<"thoughtNodes">) => {
    try {
      const result: {
        nodes: ThoughtNodeDoc[];
        edges: ThoughtEdgeDoc[];
        truncated: boolean;
      } = await projekatKlijent.query(api.prostor.thoughts.getConnectedGroup, {
        nodeId,
        limit: 200,
      });
      const ids = new Set<string>(result.nodes.map((node) => node._id));
      setSupplementalNodes((current) => mergeDocs(current, result.nodes));
      setSupplementalEdges((current) => mergeDocs(current, result.edges));
      setConnectedNodeIds(ids);
      setNodes((current) => {
        const merged = new Map(current.map((node) => [node.id, node]));
        result.nodes.forEach((doc) => merged.set(doc._id, toFlowNode(doc, profile)));
        return Array.from(merged.values()).map((node) => ({ ...node, selected: ids.has(node.id) }));
      });
      if (result.truncated) {
        toast.warning("Prikazano je prvih 200 povezanih misli. Ova mreža je veća.");
      } else {
        toast.success(ids.size === 1 ? "Ova misao još nema veze." : `Izabrano je ${ids.size} povezanih misli.`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Povezane misli nisu učitane.");
    }
  }, [profile, projekatKlijent]);

  const edgeReconnectSuccessfulRef = useRef(false);

  const toggleParent = useCallback(async (nodeId: Id<"thoughtNodes">) => {
    const previous = nodeDocsById.get(nodeId);
    if (!previous) return;
    try {
      const isParent = await toggleNodeParent({ nodeId });
      pushHistory({
        label: isParent ? "postavljanje glavne misli" : "uklanjanje glavne misli",
        undo: () => toggleNodeParent({ nodeId, isParent: previous.isParent }),
        redo: () => toggleNodeParent({ nodeId, isParent }),
      });
      toast.success(
        isParent
          ? "Misao je postavljena kao glavna."
          : "Status glavne misli je uklonjen.",
      );
    } catch {
      toast.error("Glavna misao nije izmenjena.");
    }
  }, [nodeDocsById, pushHistory, toggleNodeParent]);

  const onReconnectStart = useCallback(() => {
    edgeReconnectSuccessfulRef.current = false;
  }, []);

  const onReconnect = useCallback(async (oldEdge: ThoughtFlowEdge, newConnection: Connection) => {
    edgeReconnectSuccessfulRef.current = true;
    if (!newConnection.source || !newConnection.target || newConnection.source === newConnection.target) return;
    try {
      await updateEdge({
        edgeId: oldEdge.id as Id<"thoughtEdges">,
        nodeAId: newConnection.source as Id<"thoughtNodes">,
        nodeBId: newConnection.target as Id<"thoughtNodes">,
      });
      pushHistory({
        label: "prevezivanje misli",
        undo: () => updateEdge({
          edgeId: oldEdge.id as Id<"thoughtEdges">,
          nodeAId: oldEdge.source as Id<"thoughtNodes">,
          nodeBId: oldEdge.target as Id<"thoughtNodes">,
        }),
        redo: () => updateEdge({
          edgeId: oldEdge.id as Id<"thoughtEdges">,
          nodeAId: newConnection.source as Id<"thoughtNodes">,
          nodeBId: newConnection.target as Id<"thoughtNodes">,
        }),
      });
      toast.success("Veza je premeštena.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veza nije promenjena.");
    }
  }, [pushHistory, updateEdge]);

  const onReconnectEnd = useCallback(async (_event: MouseEvent | TouchEvent, edge: ThoughtFlowEdge) => {
    if (!edgeReconnectSuccessfulRef.current) {
      try {
        await archiveEdges({ edgeIds: [edge.id as Id<"thoughtEdges">] });
        pushHistory({
          label: "prekid veze",
          undo: () => restoreEdges({ edgeIds: [edge.id as Id<"thoughtEdges">] }),
          redo: () => archiveEdges({ edgeIds: [edge.id as Id<"thoughtEdges">] }),
        });
        toast.success("Veza je prekinuta.");
      } catch {
        toast.error("Veza nije mogla da se prekine.");
      }
    }
    edgeReconnectSuccessfulRef.current = false;
  }, [archiveEdges, pushHistory, restoreEdges]);

  const onConnect = useCallback(async (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const duplicate = edges.some((edge) =>
      (edge.source === connection.source && edge.target === connection.target) ||
      (edge.source === connection.target && edge.target === connection.source),
    );
    if (duplicate) {
      toast.info("Ove misli su već povezane.");
      return;
    }
    try {
      const edgeId = await createEdge({
        nodeAId: connection.source as Id<"thoughtNodes">,
        nodeBId: connection.target as Id<"thoughtNodes">,
      });
      pushHistory({
        label: "povezivanje misli",
        undo: () => archiveEdges({ edgeIds: [edgeId] }),
        redo: () => restoreEdges({ edgeIds: [edgeId] }),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veza nije kreirana.");
    }
  }, [archiveEdges, createEdge, edges, pushHistory, restoreEdges]);

  const onNodesChange = useCallback((changes: NodeChange<ThoughtFlowNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<ThoughtFlowEdge>[]) => {
    setEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  const onNodeDragStart = useCallback((
    _event: MouseEvent | TouchEvent,
    _node: ThoughtFlowNode,
    draggedNodes: ThoughtFlowNode[],
  ) => {
    preDragPositionsRef.current = new Map(
      draggedNodes.map((dragged) => [dragged.id, { ...dragged.position }]),
    );
    preDragViewportRef.current = flowRef.current?.getViewport() ?? null;
    sidebarDragStartedRef.current = false;
    sidebarDragTerminatedRef.current = false;
    sidebarDragSessionIdRef.current = null;
    sidebarDragInputRef.current = null;
    setSidebarDragActive(false);
  }, []);

  const restorePreDragPositions = useCallback(() => {
    const positions = preDragPositionsRef.current;
    setNodes((current) => current.map((node) => {
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    }));
  }, []);

  const restorePreDragViewport = useCallback(() => {
    const viewport = preDragViewportRef.current;
    if (viewport !== null) {
      void flowRef.current?.setViewport(viewport, { duration: 0 });
    }
  }, []);

  const onNodeDrag = useCallback((
    event: MouseEvent | TouchEvent,
    _node: ThoughtFlowNode,
    draggedNodes: ThoughtFlowNode[],
  ) => {
    if (sidebarDragTerminatedRef.current) {
      restorePreDragPositions();
      restorePreDragViewport();
      return;
    }
    if (sidebarDragStartedRef.current) {
      restorePreDragPositions();
      restorePreDragViewport();
      return;
    }
    if (!onBeginSidebarDrag || !wrapperRef.current) return;
    const point = clientPoint(event);
    if (!point || point.x >= wrapperRef.current.getBoundingClientRect().left) return;

    const nodeIds = draggedNodes.map((node) => node.id as Id<"thoughtNodes">);
    if (nodeIds.length > 50) {
      restorePreDragPositions();
      toast.error("U bočni meni možeš odjednom da pošalješ najviše 50 misli.");
      return;
    }
    sidebarDragStartedRef.current = true;
    setSidebarDragActive(true);
    restorePreDragPositions();
    restorePreDragViewport();
    const sessionId = window.crypto.randomUUID();
    sidebarDragSessionIdRef.current = sessionId;
    sidebarDragInputRef.current = sidebarDragReleaseDetail(event, sessionId);
    const destinationRequest = makeDestinationRequest(nodeIds);
    const settleExternalDrag = () => {
      restorePreDragPositions();
      restorePreDragViewport();
      if (sidebarDragSessionIdRef.current !== sessionId) return;
      sidebarDragStartedRef.current = false;
      sidebarDragTerminatedRef.current = true;
      sidebarDragSessionIdRef.current = null;
      setSidebarDragActive(false);
    };
    onBeginSidebarDrag({
      ...destinationRequest,
      sessionId,
      complete: (destination) => {
        settleExternalDrag();
        destinationRequest.complete(destination);
      },
      cancel: () => {
        settleExternalDrag();
        destinationRequest.cancel?.();
      },
      pointerEvent: event as ThoughtSidebarDragPointer,
    });
  }, [
    makeDestinationRequest,
    onBeginSidebarDrag,
    restorePreDragPositions,
    restorePreDragViewport,
  ]);

  const onNodeDragStop = useCallback(async (
    event: MouseEvent | TouchEvent,
    _node: ThoughtFlowNode,
    draggedNodes: ThoughtFlowNode[],
  ) => {
    if (sidebarDragStartedRef.current || sidebarDragTerminatedRef.current) {
      const shouldDispatchRelease =
        sidebarDragStartedRef.current && !sidebarDragTerminatedRef.current;
      const sessionId = sidebarDragSessionIdRef.current;
      const releaseDetail = !shouldDispatchRelease || sessionId === null
        ? null
        : sidebarDragReleaseDetail(event, sessionId);
      restorePreDragPositions();
      restorePreDragViewport();
      sidebarDragStartedRef.current = false;
      sidebarDragTerminatedRef.current = false;
      sidebarDragSessionIdRef.current = null;
      sidebarDragInputRef.current = null;
      setSidebarDragActive(false);
      if (releaseDetail !== null) {
        window.queueMicrotask(() => {
          window.dispatchEvent(new CustomEvent<ThoughtSidebarDragReleaseDetail>(
            THOUGHT_SIDEBAR_DRAG_RELEASE_EVENT,
            { detail: releaseDetail },
          ));
        });
      }
      return;
    }
    if (draggedNodes.length > 50) {
      restorePreDragPositions();
      toast.error("Pomeraj najviše 50 izabranih misli odjednom.");
      return;
    }
    const before = draggedNodes
      .map((node) => {
        const position = preDragPositionsRef.current.get(node.id);
        return position ? { nodeId: node.id as Id<"thoughtNodes">, ...position } : null;
      })
      .filter((move): move is { nodeId: Id<"thoughtNodes">; x: number; y: number } => Boolean(move));
    const after = draggedNodes.map((node) => ({
      nodeId: node.id as Id<"thoughtNodes">,
      x: node.position.x,
      y: node.position.y,
    }));
    const changed = after.some((move, index) =>
      move.x !== before[index]?.x || move.y !== before[index]?.y,
    );
    if (!changed) return;

    try {
      await moveNodes({ moves: after });
      if (draggedNodes.length === 1) {
        const child = draggedNodes[0];
        const parent = flowRef.current
          ?.getIntersectingNodes(child)
          .find(
            (candidate) =>
              candidate.id !== child.id &&
              !isThoughtDescendant(
                candidate.id as Id<"thoughtNodes">,
                child.id as Id<"thoughtNodes">,
                nodeDocsById,
              ),
          );
        if (parent) {
          await nestNode({
            childNodeId: child.id as Id<"thoughtNodes">,
            parentNodeId: parent.id as Id<"thoughtNodes">,
          });
          toast.success("Misao je ugnježđena u glavnu misao.");
        }
      }
      pushHistory({
        label: draggedNodes.length === 1 ? "pomeranje misli" : "pomeranje misli",
        undo: () => moveNodes({ moves: before }),
        redo: () => moveNodes({ moves: after }),
      });
    } catch (error) {
      restorePreDragPositions();
      toast.error(error instanceof Error ? error.message : "Pozicija nije sačuvana.");
    }
  }, [
    moveNodes,
    nestNode,
    nodeDocsById,
    pushHistory,
    restorePreDragPositions,
    restorePreDragViewport,
  ]);

  const openNewThought = useCallback((position?: { x: number; y: number }) => {
    let nextPosition = position;
    if (!nextPosition && wrapperRef.current && flowRef.current) {
      const bounds = wrapperRef.current.getBoundingClientRect();
      nextPosition = flowRef.current.screenToFlowPosition({
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      });
    }
    setEditor({ mode: "create", position: nextPosition ?? { x: 0, y: 0 } });
  }, []);

  const openRelatedThought = useCallback((nodeId: Id<"thoughtNodes">) => {
    const node = nodeDocsById.get(nodeId);
    if (!node) return;
    setEditor({
      mode: "create",
      position: { x: node.x + 290, y: node.y + 48 },
      connectFrom: nodeId,
    });
  }, [nodeDocsById]);

  async function submitEditor(value: ThoughtEditorValue) {
    if (!editor) return;
    setEditorPending(true);
    try {
      if (editor.mode === "create") {
        const nodeId = await createNode({
          text: value.text,
          x: editor.position.x,
          y: editor.position.y,
          color: value.color,
          title: value.title,
        });
        let edgeId: Id<"thoughtEdges"> | null = null;
        if (editor.connectFrom) {
          try {
            edgeId = await createEdge({
              nodeAId: editor.connectFrom,
              nodeBId: nodeId,
            });
          } catch (error) {
            // Keep the compound UI action atomic even though the backend exposes
            // node and edge creation separately.
            await archiveNodes({ nodeIds: [nodeId] });
            throw error;
          }
        }
        const createdEdgeId = edgeId;
        pushHistory({
          label: editor.connectFrom ? "dodavanje povezane misli" : "dodavanje misli",
          undo: async () => {
            if (createdEdgeId) await archiveEdges({ edgeIds: [createdEdgeId] });
            await archiveNodes({ nodeIds: [nodeId] });
          },
          redo: async () => {
            await restoreNodes({ nodeIds: [nodeId] });
            if (createdEdgeId) await restoreEdges({ edgeIds: [createdEdgeId] });
          },
        });
        toast.success(editor.connectFrom ? "Povezana misao je dodata." : "Misao je dodata.");
      } else {
        const previous = nodeDocsById.get(editor.nodeId);
        if (!previous) throw new Error("Misao više nije dostupna.");
        const next = { title: value.title, text: value.text, color: value.color };
        await updateNode({ nodeId: editor.nodeId, ...next });
        pushHistory({
          label: "uređivanje misli",
          undo: () => updateNode({
            nodeId: editor.nodeId,
            title: previous.title ?? "Bez naslova",
            text: previous.text,
            color: previous.color,
          }),
          redo: () => updateNode({ nodeId: editor.nodeId, ...next }),
        });
        toast.success("Misao je sačuvana.");
      }
      setEditor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Misao nije sačuvana.");
    } finally {
      setEditorPending(false);
    }
  }

  async function submitEdgeLabel(label: string) {
    if (!edgeEditorId) return;
    const previous = edgeDocsById.get(edgeEditorId);
    if (!previous) return;
    setEditorPending(true);
    try {
      const nextLabel = label || null;
      await updateEdge({ edgeId: edgeEditorId, label: nextLabel });
      pushHistory({
        label: "naziv veze",
        undo: () => updateEdge({ edgeId: edgeEditorId, label: previous.label }),
        redo: () => updateEdge({ edgeId: edgeEditorId, label: nextLabel }),
      });
      setEdgeEditorId(null);
      toast.success(nextLabel ? "Naziv veze je sačuvan." : "Naziv veze je uklonjen.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Veza nije izmenjena.");
    } finally {
      setEditorPending(false);
    }
  }

  const invokeKeyboardContextMenu = useCallback(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const node = nodes.find((item) => item.selected);
    const selector = node ? `.react-flow__node[data-id="${CSS.escape(node.id)}"]` : null;
    const anchor = selector ? wrapper.querySelector<HTMLElement>(selector) : wrapper;
    if (!anchor) return;
    const bounds = anchor.getBoundingClientRect();
    anchor.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: bounds.left + Math.min(bounds.width / 2, 120),
      clientY: bounds.top + Math.min(bounds.height / 2, 70),
    }));
  }, [nodes]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (isTextEntry(event.target)) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setNodes((current) => current.map((node) => ({ ...node, selected: true })));
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      void duplicateSelection(selectedThoughtIds(nodes));
      return;
    }
    if (event.shiftKey && event.key === "F10") {
      event.preventDefault();
      invokeKeyboardContextMenu();
      return;
    }
    if (event.key === "Escape") {
      setNodes((current) =>
        current.map((node) => ({ ...node, selected: false })),
      );
      setEdges((current) =>
        current.map((edge) => ({ ...edge, selected: false })),
      );
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      void archiveSelection(
        selectedThoughtIds(nodes),
        edges.filter((edge) => edge.selected).map((edge) => edge.id as Id<"thoughtEdges">),
      );
    }
  }, [archiveSelection, duplicateSelection, edges, invokeKeyboardContextMenu, nodes]);

  const selectedNodeIds = useMemo(() => selectedThoughtIds(nodes), [nodes]);
  const selectedEdgeIds = useMemo(
    () => edges.filter((edge) => edge.selected).map((edge) => edge.id as Id<"thoughtEdges">),
    [edges],
  );
  const selectedCount = selectedNodeIds.length + selectedEdgeIds.length;
  const editingNode = editor?.mode === "edit" ? nodeDocsById.get(editor.nodeId) : null;
  const editingEdge = edgeEditorId ? edgeDocsById.get(edgeEditorId) : null;
  const conversionNodes = conversion
    ? conversion.nodeIds.flatMap((nodeId) => {
        const node = nodeDocsById.get(nodeId);
        return node ? [node] : [];
      })
    : [];
  const firstName = profile.displayName.trim().split(/\s+/)[0] || profile.displayName;
  const canLoadNodes = nodePagination.status === "CanLoadMore" || nodePagination.status === "LoadingMore";
  const canLoadEdges = edgePagination.status === "CanLoadMore" || edgePagination.status === "LoadingMore";
  const loadingFirstPage = nodePagination.status === "LoadingFirstPage";

  const persistThoughtSize = useCallback(
    (
      nodeId: Id<"thoughtNodes">,
      layout: { x: number; y: number; width?: number; height?: number },
    ) => {
      if (layout.width === undefined || layout.height === undefined) {
        return resetNodeLayoutSize({ nodeId });
      }
      return updateNodeLayout({
        nodeId,
        x: layout.x,
        y: layout.y,
        width: layout.width,
        height: layout.height,
      });
    },
    [resetNodeLayoutSize, updateNodeLayout],
  );

  const resizeThought = useCallback(async (
    nodeId: Id<"thoughtNodes">,
    layout: { x: number; y: number; width: number; height: number },
  ) => {
    const previous = nodeDocsById.get(nodeId);
    const previousNode = nodes.find((node) => node.id === nodeId);
    if (!previous || !previousNode) return;
    const before = {
      x: previous.x,
      y: previous.y,
      width: previous.width,
      height: previous.height,
    };
    const after = {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    };
    try {
      await persistThoughtSize(nodeId, after);
      pushHistory({
        label: "promena veličine misli",
        undo: () => persistThoughtSize(nodeId, before),
        redo: () => persistThoughtSize(nodeId, after),
      });
    } catch (error) {
      setNodes((current) =>
        current.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position: { ...previousNode.position },
                width: previousNode.width,
                height: previousNode.height,
                style: { ...previousNode.style },
              }
            : node,
        ),
      );
      toast.error(error instanceof Error ? error.message : "Veličina nije sačuvana.");
    }
  }, [nodeDocsById, nodes, persistThoughtSize, pushHistory]);

  const resetThoughtSize = useCallback(async (nodeId: Id<"thoughtNodes">) => {
    const previous = nodeDocsById.get(nodeId);
    if (!previous) return;
    const before = {
      x: previous.x,
      y: previous.y,
      width: previous.width,
      height: previous.height,
    };
    if (before.width === undefined && before.height === undefined) return;
    try {
      await resetNodeLayoutSize({ nodeId });
      pushHistory({
        label: "vraćanje početne veličine misli",
        undo: () => persistThoughtSize(nodeId, before),
        redo: () => resetNodeLayoutSize({ nodeId }),
      });
      toast.success("Vraćena je početna veličina misli.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Početna veličina nije vraćena.",
      );
    }
  }, [nodeDocsById, persistThoughtSize, pushHistory, resetNodeLayoutSize]);

  const nodeActions = useMemo(() => ({
    connectedNodeIds,
    edit: openEditor,
    toggleParent,
    send: requestIdeaConversion,
    openIdeas: onOpenIdeas,
    openPage: onOpenPage,
    resize: (
      nodeId: Id<"thoughtNodes">,
      layout: { x: number; y: number; width: number; height: number },
    ) => void resizeThought(nodeId, layout),
    resetSize: (nodeId: Id<"thoughtNodes">) => void resetThoughtSize(nodeId),
  }), [
    connectedNodeIds,
    onOpenIdeas,
    onOpenPage,
    openEditor,
    requestIdeaConversion,
    resetThoughtSize,
    resizeThought,
    toggleParent,
  ]);

  const edgeActions = useMemo(() => ({
    editLabel: (edgeId: string) => setEdgeEditorId(edgeId as Id<"thoughtEdges">),
    archiveEdge: (edgeId: string) => void archiveSelection([], [edgeId as Id<"thoughtEdges">]),
  }), [archiveSelection]);

  return (
    <ThoughtNodeActionsProvider actions={nodeActions}>
      <ThoughtEdgeActionsProvider actions={edgeActions}>
        <ContextMenu open={contextOpen} onOpenChange={setContextOpen}>
        <ContextMenuTrigger
          render={
            <div
              ref={setWrapper}
              className={cn(styles.canvas, MAP_FRAME_CLASS)}
              data-map-active={mapActive}
              {...mapActivationHandlers}
              data-canvas-space-pan={canvasNavigation.spacePressed}
              data-canvas-zoom-modifier={canvasNavigation.zoomModifierPressed}
              tabIndex={0}
              role="application"
              aria-label={`Mapa beleški za ${workspace.name}`}
              onKeyDownCapture={handleKeyDown}
              onContextMenu={(event) => {
                // Desni taster je u `panOnDrag`, pa xyflow ne poziva
                // `onPaneContextMenu`; cilj menija na praznom platnu (i pri
                // pozivu tastaturom na okviru) postavlja se ovde. Čvor i veza
                // su svoj cilj već postavili.
                const target = event.target;
                const onPane =
                  target === event.currentTarget ||
                  (target instanceof HTMLElement && target.classList.contains("react-flow__pane"));
                if (!onPane) return;
                const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
                setContextTarget({ kind: "pane", position });
              }}
            />
          }
        >
          <ReactFlow<ThoughtFlowNode, ThoughtFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            reconnectRadius={25}
            onInit={(instance) => {
              flowRef.current = instance;
              setFlowInstance(instance);
            }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={(connection) => void onConnect(connection)}
            onReconnectStart={onReconnectStart}
            onReconnect={(oldEdge, newConnection) => void onReconnect(oldEdge, newConnection)}
            onReconnectEnd={(event, edge) => void onReconnectEnd(event, edge)}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={(event, node, draggedNodes) => void onNodeDragStop(event, node, draggedNodes)}
            onNodeClick={(event, node) => {
              if (event.ctrlKey || event.metaKey || event.shiftKey) return;
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  "button, a, input, textarea, select, .react-flow__handle, .react-flow__resize-control",
                )
              ) {
                return;
              }
              openEditor(node.id as Id<"thoughtNodes">);
            }}
            onNodeDoubleClick={(_event, node) => openEditor(node.id as Id<"thoughtNodes">)}
            onEdgeDoubleClick={(_event, edge) => setEdgeEditorId(edge.id as Id<"thoughtEdges">)}
            onNodeContextMenu={(_event, node) => {
              setContextTarget({ kind: "node", nodeId: node.id as Id<"thoughtNodes"> });
              if (!node.selected) {
                setNodes((current) => current.map((item) => ({ ...item, selected: item.id === node.id })));
                setEdges((current) => current.map((edge) => ({ ...edge, selected: false })));
              }
            }}
            onEdgeContextMenu={(_event, edge) => {
              setContextTarget({ kind: "edge", edgeId: edge.id as Id<"thoughtEdges"> });
              if (!edge.selected) {
                setEdges((current) => current.map((item) => ({ ...item, selected: item.id === edge.id })));
                setNodes((current) => current.map((node) => ({ ...node, selected: false })));
              }
            }}
            onDoubleClick={(event) => {
              const target = event.target as HTMLElement;
              if (!target.classList.contains("react-flow__pane")) return;
              const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
              if (position) openNewThought(position);
            }}
            onMoveEnd={(_event, viewport: Viewport) => {
              if (!viewportReadyRef.current || sidebarDragStartedRef.current) return;
              void saveViewport({
                x: viewport.x,
                y: viewport.y,
                zoom: viewport.zoom,
              }).catch(() => toast.error("Pozicija mape nije sačuvana."));
            }}
            colorMode="dark"
            minZoom={0.18}
            maxZoom={2.2}
            zoomOnScroll={false}
            panOnScroll={mapActive}
            preventScrolling={mapActive}
            panOnDrag={[1, 2]}
            panActivationKeyCode="Space"
            zoomActivationKeyCode={["Control", "Meta"]}
            noPanClassName={canvasNavigation.noPanClassName}
            noWheelClassName={canvasNavigation.noWheelClassName}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            selectionKeyCode="Shift"
            multiSelectionKeyCode={["Control", "Meta", "Shift"]}
            deleteKeyCode={null}
            nodeDragThreshold={3}
            connectionDragThreshold={4}
            autoPanOnNodeDrag={!sidebarDragActive}
            elevateNodesOnSelect
            fitViewOptions={{ padding: 0.24, maxZoom: 1.1, duration: reducedMotion ? 0 : 320 }}
            ariaLabelConfig={SERBIAN_ARIA_LABELS}
            proOptions={{ hideAttribution: true }}
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
              aria-label="Kontrole mape"
            />
            <MiniMap
              position="bottom-right"
              pannable
              zoomable
              nodeStrokeWidth={2}
              nodeColor={(node) => miniMapColor((node.data?.color as ThoughtNodeColor) ?? "neutral")}
              aria-label="Minimapa misli"
            />

            <Panel position="top-left" className="!m-3 sm:!m-4">
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

            <Panel position="top-right" className="!m-3 sm:!m-4">
              <CanvasActionRail
                ariaLabel={`Akcije mape beleški za ${firstName}`}
                identity={{
                  label: "Beleške",
                  icon: Sparkles,
                  count: nodes.length,
                }}
                sections={[
                  {
                    id: "Kreiranje",
                    items: [
                      {
                        id: "new-thought",
                        label: "Nova misao",
                        icon: Plus,
                        onSelect: () => openNewThought(),
                      },
                    ],
                  },
                ]}
              />
            </Panel>

            {(selectedCount > 0 || canLoadNodes || canLoadEdges) ? (
              <Panel position="top-center" className="!m-3 sm:!m-4">
                <div className="flex max-w-[calc(100vw-2rem)] flex-wrap items-center justify-end gap-1 rounded-lg border border-line bg-card p-1">
                  {selectedCount > 0 ? (
                    <>
                      <Badge ton="neutral" className="mx-1">{selectedCount} izabrano</Badge>
                      {selectedNodeIds.length > 0 ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label="Pošalji izabrane misli u Ideje"
                          onClick={() => requestIdeaConversion(selectedNodeIds)}
                        >
                          <Send /> <span className="hidden lg:inline">U Ideje</span>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Arhiviraj izbor"
                        onClick={() => void archiveSelection(selectedNodeIds, selectedEdgeIds)}
                      >
                        <Archive className="size-3.5" />
                      </Button>
                    </>
                  ) : null}
                  {canLoadNodes ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Učitaj još misli"
                      disabled={nodePagination.status === "LoadingMore"}
                      onClick={() => nodePagination.loadMore(100)}
                    >
                      {nodePagination.status === "LoadingMore" ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}
                      <span className="hidden sm:inline">Još misli</span>
                    </Button>
                  ) : null}
                  {canLoadEdges ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label="Učitaj još veza"
                      disabled={edgePagination.status === "LoadingMore"}
                      onClick={() => edgePagination.loadMore(200)}
                    >
                      {edgePagination.status === "LoadingMore" ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                      <span className="hidden sm:inline">Još veza</span>
                    </Button>
                  ) : null}
                </div>
              </Panel>
            ) : null}

            <Panel position="bottom-center" className="!mb-4 hidden md:block">
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 whitespace-nowrap rounded-md border border-line bg-card px-2 py-0.5 text-xs leading-5 text-muted-foreground">
                <span className="inline-flex items-center gap-1"><MousePointer2 className="size-3" aria-hidden="true" /> Prevuci za izbor</span>
                <span aria-hidden="true">·</span>
                <span>dupli klik dodaje</span>
                <span aria-hidden="true">·</span>
                <span>{duplicateShortcut} duplira</span>
                {mapActive ? null : (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{MAP_INACTIVE_HINT}</span>
                  </>
                )}
              </div>
            </Panel>
          </ReactFlow>

          {loadingFirstPage ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" role="status">
              <span className="rounded-lg border border-line bg-card px-4 py-3 text-sm text-muted-foreground">
                Učitavam mapu beleški…
              </span>
            </div>
          ) : nodes.length === 0 ? (
            <MapEmptyState
              icon={Sparkles}
              title="Još nema misli."
              description={`Vidiš ih samo ti u projektu „${workspace.name}”.`}
              actions={
                <Button variant="secondary" type="button" onClick={() => openNewThought()}>
                  <Plus /> Dodaj prvu misao
                </Button>
              }
            />
          ) : null}
        </ContextMenuTrigger>

        <ContextMenuContent className="min-w-52">
          {contextTarget.kind === "node" ? (
            <>
              <ContextMenuItem onClick={() => openEditor(contextTarget.nodeId)}>
                <Edit3 /> Uredi
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void toggleParent(contextTarget.nodeId)}>
                <Crown /> {nodeDocsById.get(contextTarget.nodeId)?.isParent ? "Ukloni status glavne misli" : "Postavi kao glavnu misao"}
              </ContextMenuItem>
              <ContextMenuItem onClick={() => openRelatedThought(contextTarget.nodeId)}>
                <Link2 /> Nova povezana misao
              </ContextMenuItem>
              {nodeDocsById.get(contextTarget.nodeId)?.parentThoughtId ? (
                <ContextMenuItem
                  onClick={() =>
                    void detachNode({ nodeId: contextTarget.nodeId })
                      .then(() => toast.success("Misao je izvučena iz grupe."))
                      .catch((error) =>
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Misao nije izvučena.",
                        ),
                      )
                  }
                >
                  <Ungroup /> Izvuci iz grupe
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem onClick={() => void selectConnected(contextTarget.nodeId)}>
                <Focus /> Izaberi povezane
              </ContextMenuItem>
              {(() => {
                // Na kartici je samo status („Poslato u Ideje"); otvaranje je ovde i u traci (K21).
                const doc = nodeDocsById.get(contextTarget.nodeId);
                if (!doc || doc.conversionCount === 0) return null;
                if (doc.lastConvertedIdeaId) {
                  return (
                    <ContextMenuItem onClick={() => onOpenIdeas()}>
                      <ExternalLink /> Otvori u Idejama
                    </ContextMenuItem>
                  );
                }
                const pageId = doc.lastConvertedPageId;
                return pageId ? (
                  <ContextMenuItem onClick={() => onOpenPage(pageId)}>
                    <ExternalLink /> Otvori stranicu
                  </ContextMenuItem>
                ) : null;
              })()}
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={() => void duplicateSelection(selectedNodeIds.includes(contextTarget.nodeId) ? selectedNodeIds : [contextTarget.nodeId])}
              >
                <Copy /> Dupliraj
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => requestIdeaConversion(selectedNodeIds.includes(contextTarget.nodeId) ? selectedNodeIds : [contextTarget.nodeId])}
              >
                <FileInput /> Pošalji u Ideje
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                variant="destructive"
                onClick={() => void archiveSelection(
                  selectedNodeIds.includes(contextTarget.nodeId) ? selectedNodeIds : [contextTarget.nodeId],
                  [],
                )}
              >
                <Trash2 /> Arhiviraj
              </ContextMenuItem>
            </>
          ) : contextTarget.kind === "edge" ? (
            <>
              <ContextMenuItem onClick={() => setEdgeEditorId(contextTarget.edgeId)}>
                <Edit3 /> Uredi naziv veze
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onClick={() => void archiveSelection([], [contextTarget.edgeId])}
              >
                <Trash2 /> Arhiviraj vezu
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem onClick={() => openNewThought(contextTarget.position)}>
                <Plus /> Nova misao ovde
              </ContextMenuItem>
              <ContextMenuItem
                disabled={nodes.length === 0}
                onClick={() => void flowRef.current?.fitView({ padding: 0.24, duration: reducedMotion ? 0 : 320, maxZoom: 1.1 })}
              >
                <Expand /> Prikaži sve
              </ContextMenuItem>
              <ContextMenuItem
                disabled={nodes.length === 0}
                onClick={() => setNodes((current) => current.map((node) => ({ ...node, selected: true })))}
              >
                <Check /> Izaberi sve
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={historyState.undoCount === 0}
                onClick={() => void runHistory("undo")}
              >
                <History /> Poništi poslednju promenu
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {editor ? (
        <ThoughtEditorDialog
          open
          mode={editor.mode}
          connected={editor.mode === "create" && Boolean(editor.connectFrom)}
          initialValue={editingNode ? {
            title: editingNode.title ?? "",
            text: editingNode.text,
            color: editingNode.color,
          } : undefined}
          pending={editorPending}
          sizePreset={
            editingNode
              ? editingNode.width && editingNode.width >= 480
                ? "large"
                : editingNode.width && editingNode.width >= 330
                  ? "standard"
                  : "compact"
              : undefined
          }
          onSizePresetChange={
            editingNode
              ? (preset: ItemSizePreset) => {
                  const dimensions = ITEM_SIZE_DIMENSIONS[preset];
                  void resizeThought(editingNode._id, {
                    x: editingNode.x,
                    y: editingNode.y,
                    ...dimensions,
                  });
                }
              : undefined
          }
          onSizeReset={
            editingNode
              ? () => void resetThoughtSize(editingNode._id)
              : undefined
          }
          onOpenChange={(open) => !open && !editorPending && setEditor(null)}
          onSubmit={submitEditor}
        />
      ) : null}
      {edgeEditorId ? (
        <EdgeEditorDialog
          open
          initialLabel={editingEdge?.label ?? ""}
          pending={editorPending}
          onOpenChange={(open) => !open && !editorPending && setEdgeEditorId(null)}
          onSubmit={submitEdgeLabel}
        />
      ) : null}
      {conversion ? (
        <ThoughtConversionDialog
          open
          workspace={workspace}
          nodes={conversionNodes}
          onOpenChange={(open) => !open && setConversion(null)}
          onConverted={(ideaIds) => {
            setConversion(null);
            toast.success(
              ideaIds.length === 1
                ? "Ideja je kreirana. Originalna misao je ostala privatna."
                : `${ideaIds.length} ideje su kreirane. Originalne misli su ostale privatne.`,
              {
                action: { label: "Otvori Ideje", onClick: onOpenIdeas },
              },
            );
          }}
        />
      ) : null}
      </ThoughtEdgeActionsProvider>
    </ThoughtNodeActionsProvider>
  );
}
