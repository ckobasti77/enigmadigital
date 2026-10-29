"use client";


// Preneto iz Devotion apps/web/components/workspace/canvases/task-checkpoint-flow-node.tsx (main @ c05c40f), SPAJANJE S14.
import {
  createContext,
  memo,
  useContext,
  useState,
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
  Check,
  Circle,
  LoaderCircle,
  Lock,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { CheckpointCommentsDialog } from "@/components/app/prostor/saradnja/checkpoint-comments-dialog";
import { MapStepPill } from "@/components/app/prostor/mape/map/map-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";

import canvasStyles from "@/components/app/prostor/mape/canvases/connected-canvas.module.css";
import { PerimeterResizeControl } from "@/components/app/prostor/mape/canvases/perimeter-resize-control";
import {
  taskCheckpointUsesExpandedSize,
  type TaskCheckpointSizePreset,
} from "@/lib/prostor/modeli/task-checkpoint-layout";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { CHECKPOINT_NODE_SIZE } from "@/lib/prostor/web/canvas-node-size";

export type TaskCheckpointFlowNodeData = {
  checkpointId: Id<"taskCheckpoints">;
  ordinal: number;
  text: string;
  completed: boolean;
  chainedToPrevious: boolean;
  locked: boolean;
  blockedByOrdinal: number | null;
  canEdit: boolean;
  canToggle: boolean;
  canMove: boolean;
  canResize: boolean;
  manuallySized: boolean;
  canDeleteDirectly: boolean;
};

export type TaskCheckpointFlowNode = Node<
  TaskCheckpointFlowNodeData,
  "taskCheckpoint"
>;

type TaskCheckpointNodeActions = {
  startResize: (checkpointId: Id<"taskCheckpoints">) => void;
  resize: (
    checkpointId: Id<"taskCheckpoints">,
    layout: ResizeParams,
  ) => void;
  setSizePreset: (
    checkpointId: Id<"taskCheckpoints">,
    preset: TaskCheckpointSizePreset,
  ) => void;
};

const TaskCheckpointNodeActionsContext =
  createContext<TaskCheckpointNodeActions | null>(null);

export function TaskCheckpointNodeActionsProvider({
  startResize,
  resize,
  setSizePreset,
  children,
}: TaskCheckpointNodeActions & { children: ReactNode }) {
  return (
    <TaskCheckpointNodeActionsContext.Provider
      value={{ startResize, resize, setSizePreset }}
    >
      {children}
    </TaskCheckpointNodeActionsContext.Provider>
  );
}

function stopCanvasEvent(event: SyntheticEvent) {
  event.stopPropagation();
}

/**
 * Korak zadatka na Mapi: mala pravougaona pilula na
 * orbitalnoj POZICIJI oko zadatka. Kvačica je uvek vidljiva; uređivanje,
 * veličina, komentari i brisanje (u Korpu, sa „Poništi") su iznad izabranog
 * koraka.
 */
export const TaskCheckpointFlowNodeCard = memo(
  function TaskCheckpointFlowNodeCard({
    id,
    data,
    selected,
    width,
    height,
  }: NodeProps<TaskCheckpointFlowNode>) {
    const nodeActions = useContext(TaskCheckpointNodeActionsContext);
    const setCompleted = useProjekatMutation(api.prostor.taskCheckpoints.setCompleted);
    const updateText = useProjekatMutation(api.prostor.taskCheckpoints.updateText);
    const archiveOwn = useProjekatMutation(api.prostor.taskCheckpoints.archiveOwn);
    const restoreOwn = useProjekatMutation(api.prostor.taskCheckpoints.restoreOwn);
    const [pending, setPending] = useState(false);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(data.text);
    const [threadOpen, setThreadOpen] = useState(false);
    const usesExpandedSize = taskCheckpointUsesExpandedSize({
      manuallySized: data.manuallySized,
      width,
      height,
    });

    async function saveText() {
      const text = draft.trim();
      if (!text || text === data.text) {
        setDraft(data.text);
        setEditing(false);
        return;
      }
      setPending(true);
      try {
        await updateText({ checkpointId: data.checkpointId, text });
        setEditing(false);
      } catch (error) {
        toast.error(
          accessErrorMessage(error, "Korak nije sačuvan."),
        );
      } finally {
        setPending(false);
      }
    }

    function archive() {
      void archiveOwn({ checkpointId: data.checkpointId })
        .then(() =>
          toast.success("Korak je obrisan.", {
            duration: 8_000,
            action: {
              label: "Poništi",
              onClick: () =>
                void restoreOwn({ checkpointId: data.checkpointId }).catch(
                  (error) =>
                    toast.error(
                      accessErrorMessage(error, "Korak nije vraćen."),
                    ),
                ),
            },
          }),
        )
        .catch((error) =>
          toast.error(
            accessErrorMessage(error, "Korak nije obrisan."),
          ),
        );
    }

    const toggleLabel = data.locked
      ? `Korak je zaključan dok se ne završi korak ${data.blockedByOrdinal}`
      : data.completed
        ? `Ponovo otvori korak: ${data.text}`
        : `Završi korak: ${data.text}`;

    return (
      <>
        <div
          className={cn(
            "relative h-full w-full",
            !data.canMove && "nodrag !cursor-default",
          )}
        >
          <MapStepPill
            eyebrow={
              data.locked
                ? `Korak ${data.ordinal} · čeka korak ${data.blockedByOrdinal}`
                : `Korak ${data.ordinal}`
            }
            text={data.text}
            completed={data.completed}
            selected={selected}
            toggle={
              <button
                type="button"
                className="nodrag nopan mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-line text-muted-foreground transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!data.canToggle || data.locked || pending}
                aria-label={toggleLabel}
                title={toggleLabel}
                onPointerDown={stopCanvasEvent}
                onClick={(event) => {
                  stopCanvasEvent(event);
                  setPending(true);
                  void setCompleted({
                    checkpointId: data.checkpointId,
                    completed: !data.completed,
                  })
                    .catch((error) =>
                      toast.error(
                        accessErrorMessage(error, "Status koraka nije promenjen."),
                      ),
                    )
                    .finally(() => setPending(false));
                }}
              >
                {pending ? (
                  <LoaderCircle
                    className="size-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : data.completed ? (
                  <Check className="size-3.5 text-success" aria-hidden="true" />
                ) : data.locked ? (
                  <Lock className="size-3.5" aria-hidden="true" />
                ) : (
                  <Circle className="size-3.5" aria-hidden="true" />
                )}
              </button>
            }
          >
            {editing ? (
              <div
                className="nodrag nopan nowheel mt-0.5"
                onPointerDown={stopCanvasEvent}
              >
                <Input
                  autoFocus
                  value={draft}
                  className="h-7 text-xs"
                  aria-label={`Tekst koraka: ${data.text}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      setDraft(data.text);
                      setEditing(false);
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                  onBlur={() => void saveText()}
                />
              </div>
            ) : undefined}
          </MapStepPill>

          <PerimeterResizeControl<TaskCheckpointFlowNode>
            nodeId={id}
            width={width ?? 140}
            height={height ?? 92}
            selected={selected}
            disabled={!data.canResize}
            shape="rounded"
            cornerRadius={8}
            minWidth={CHECKPOINT_NODE_SIZE.minWidth}
            minHeight={CHECKPOINT_NODE_SIZE.minHeight}
            maxWidth={CHECKPOINT_NODE_SIZE.maxWidth}
            maxHeight={CHECKPOINT_NODE_SIZE.maxHeight}
            ariaLabel={`Promeni veličinu koraka ${data.ordinal} povlačenjem ivice`}
            onResizeStart={() => {
              if (data.canResize) {
                nodeActions?.startResize(data.checkpointId);
              }
            }}
            onResizeEnd={(layout) => {
              if (data.canResize) {
                nodeActions?.resize(data.checkpointId, layout);
              }
            }}
          />

          <NodeToolbar
            isVisible={selected}
            position={Position.Top}
            offset={10}
            className="nodrag nokey nopan nowheel"
            onPointerDown={stopCanvasEvent}
            onClick={stopCanvasEvent}
            onDoubleClick={stopCanvasEvent}
          >
            <div className="flex items-center gap-0.5 rounded-lg border border-line bg-popover p-1 shadow-elev-2">
              {data.canEdit ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={
                    editing
                      ? `Otkaži izmenu: ${data.text}`
                      : `Uredi korak: ${data.text}`
                  }
                  title={editing ? "Otkaži izmenu" : "Uredi"}
                  onClick={() => {
                    setDraft(data.text);
                    setEditing((current) => !current);
                  }}
                >
                  {editing ? (
                    <X className="size-4" aria-hidden="true" />
                  ) : (
                    <Pencil className="size-4" aria-hidden="true" />
                  )}
                </Button>
              ) : null}
              {data.canResize ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label={`${usesExpandedSize ? "Skupi" : "Raširi"} korak ${data.ordinal}`}
                  title={usesExpandedSize ? "Skupi korak" : "Raširi korak"}
                  onClick={() =>
                    nodeActions?.setSizePreset(
                      data.checkpointId,
                      usesExpandedSize ? "compact" : "expanded",
                    )
                  }
                >
                  {usesExpandedSize ? (
                    <Minimize2 className="size-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="size-4" aria-hidden="true" />
                  )}
                </Button>
              ) : null}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`Komentari koraka: ${data.text}`}
                title="Komentari"
                onClick={() => setThreadOpen(true)}
              >
                <MessageSquareText className="size-4" aria-hidden="true" />
              </Button>
              {data.canDeleteDirectly ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 text-danger hover:text-danger"
                  aria-label={`Obriši korak: ${data.text}`}
                  title="Obriši korak"
                  onClick={archive}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          </NodeToolbar>

          <Handle
            id="left"
            type="source"
            position={Position.Left}
            className={canvasStyles.handle}
            aria-label="Leva tačka za povezivanje koraka"
          />
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            className={canvasStyles.handle}
            aria-label="Desna tačka za povezivanje koraka"
          />
        </div>

        <CheckpointCommentsDialog
          checkpointId={data.checkpointId}
          title={data.text}
          open={threadOpen}
          onOpenChange={setThreadOpen}
        />
      </>
    );
  },
);
