"use client";

// Preneto iz Devotion apps/web/components/workspace/task-checkpoint-list.tsx (main @ c05c40f), SPAJANJE S12.
import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  Circle,
  Link2,
  Link2Off,
  LoaderCircle,
  Lock,
  MessageSquareText,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { PERMISSION_REASONS } from "@/lib/prostor/task-row";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckpointCommentsDialog } from "@/components/app/prostor/saradnja/checkpoint-comments-dialog";
import { orderTaskCheckpointsForEditor } from "@/lib/prostor/modeli/task-checkpoint-order";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { cn } from "@/lib/utils";
import { useProjekatQueryResult } from "@/components/app/prostor/podaci/projekat";
import { useProjekatMutation } from "@/components/app/projekat-provider";

/**
 * Radnje reda (ghost ikonice) se vide na prelaz mišem ili fokus u redu; na
 * dodir su uvek tu. Otvoren meni drži dugme vidljivim (`aria-expanded`).
 */
const RADNJA_REDA =
  "md:pointer-fine:opacity-0 md:pointer-fine:group-hover/korak:opacity-100 md:pointer-fine:group-focus-within/korak:opacity-100 aria-expanded:opacity-100";

export type TaskCheckpointDraft = {
  id: string;
  text: string;
  completed: boolean;
};

export function TaskCheckpointDraftList({
  items,
  onChange,
}: {
  items: TaskCheckpointDraft[];
  onChange: (items: TaskCheckpointDraft[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  function add() {
    const text = draft.trim();
    if (!text || items.length >= 100) return;
    onChange([
      ...items,
      {
        id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        completed: false,
      },
    ]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          aria-label="Novi korak"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Dodaj korak…"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={add}
          disabled={!draft.trim() || items.length >= 100}
        >
          <Plus className="size-4" /> Dodaj
        </Button>
      </div>
      {items.length > 0 ? (
        <div className="space-y-0.5">
          {items.map((item) => (
            <div
              key={item.id}
              className="group/korak flex items-center gap-2 rounded-lg px-2 py-0.5 transition-colors hover:bg-surface-control"
            >
              <button
                type="button"
                className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-control-hover hover:text-foreground pointer-coarse:size-11"
                aria-label={
                  item.completed
                    ? `Označi korak kao otvoren: ${item.text}`
                    : `Označi korak kao završen: ${item.text}`
                }
                title={item.completed ? "Ponovo otvori" : "Označi kao završeno"}
                onClick={() =>
                  onChange(
                    items.map((current) =>
                      current.id === item.id
                        ? { ...current, completed: !current.completed }
                        : current,
                    ),
                  )
                }
              >
                {item.completed ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" />
                )}
              </button>
              {editingId === item.id ? (
                <Input
                  autoFocus
                  value={editingText}
                  className="h-8 flex-1"
                  onChange={(event) => setEditingText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditingId(null);
                    if (event.key === "Enter" && editingText.trim()) {
                      onChange(
                        items.map((current) =>
                          current.id === item.id
                            ? { ...current, text: editingText.trim() }
                            : current,
                        ),
                      );
                      setEditingId(null);
                    }
                  }}
                />
              ) : (
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-sm font-medium",
                    item.completed && "text-muted-foreground line-through",
                  )}
                >
                  {item.text}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-9 text-muted-foreground", RADNJA_REDA)}
                aria-label={`Uredi korak: ${item.text}`}
                title="Uredi korak"
                onClick={() => {
                  if (editingId === item.id) {
                    if (editingText.trim()) {
                      onChange(
                        items.map((current) =>
                          current.id === item.id
                            ? { ...current, text: editingText.trim() }
                            : current,
                        ),
                      );
                    }
                    setEditingId(null);
                    return;
                  }
                  setEditingId(item.id);
                  setEditingText(item.text);
                }}
              >
                {editingId === item.id ? (
                  <Check className="size-3.5" />
                ) : (
                  <Pencil className="size-3.5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-9 text-muted-foreground", RADNJA_REDA)}
                aria-label={`Ukloni korak: ${item.text}`}
                title="Ukloni korak"
                onClick={() =>
                  onChange(items.filter((current) => current.id !== item.id))
                }
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type CheckpointListProps = {
  taskPageId: Id<"pages">;
  canCreate: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * Koraci zadatka (panel i puna strana). Pad upita ima svoje stanje („Pokušaj
 * ponovo" ponovo montira pretplatu) i ne obara stranu ni panel.
 */
export function TaskCheckpointList(props: CheckpointListProps) {
  const [attempt, setAttempt] = useState(0);
  return <TaskCheckpointListBody key={attempt} {...props} onRetry={() => setAttempt((value) => value + 1)} />;
}

/** Selektori za fokus posle izmene i brisanja (red nestaje ili se menja, fokus ne sme na `body`). */
const stepMenuSelector = (id: string) => `[data-step-menu="${id}"]`;
const stepToggleSelector = (id: string) => `[data-step-toggle="${id}"]`;
const NEW_STEP_SELECTOR = "[data-step-new]";

function TaskCheckpointListBody({
  taskPageId,
  canCreate,
  compact = false,
  className,
  onRetry,
}: CheckpointListProps & { onRetry: () => void }) {
  const { data: checkpoints, failed } = useProjekatQueryResult(api.prostor.taskCheckpoints.listForTask, { taskPageId });
  const createCheckpoint = useProjekatMutation(api.prostor.taskCheckpoints.create);
  const updateText = useProjekatMutation(api.prostor.taskCheckpoints.updateText);
  const setCompleted = useProjekatMutation(api.prostor.taskCheckpoints.setCompleted);
  const setChained = useProjekatMutation(api.prostor.taskCheckpoints.setChainedToPrevious);
  const setAllChained = useProjekatMutation(api.prostor.taskCheckpoints.setAllChained);
  const archiveOwn = useProjekatMutation(api.prostor.taskCheckpoints.archiveOwn);
  const restoreOwn = useProjekatMutation(api.prostor.taskCheckpoints.restoreOwn);
  const [draft, setDraft] = useState("");
  // Upisi u toku, po koraku (jedan korak ne gasi "čuvam" drugog).
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const markPending = (id: string, on: boolean) =>
    setPending((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const createBusy = useRef(false);
  const reasonBase = useId();
  const [editingId, setEditingId] =
    useState<Id<"taskCheckpoints"> | null>(null);
  const [editingText, setEditingText] = useState("");
  const [thread, setThread] = useState<{
    id: Id<"taskCheckpoints">;
    title: string;
  } | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  // Fokus koji se vraća posle sledećeg renderovanja (polje u izmeni se demontira).
  const focusAfterRender = useRef<string | null>(null);
  // Radnja menija koja sama postavlja fokus (izmena, brisanje): izvršava se pošto se meni
  // zatvori, umesto da meni vrati fokus na dugme „…" (ili ga zadrži u zamci menija).
  const afterMenuClose = useRef<(() => void) | null>(null);

  useEffect(() => {
    const selector = focusAfterRender.current;
    if (selector === null) return;
    focusAfterRender.current = null;
    sectionRef.current?.querySelector<HTMLElement>(selector)?.focus();
  });

  if (failed) {
    return (
      <div role="alert" className={cn("flex flex-wrap items-center gap-3 text-sm", className)}>
        <p className="text-muted-foreground">Koraci nisu učitani.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Pokušaj ponovo
        </Button>
      </div>
    );
  }

  if (checkpoints === undefined) {
    return (
      <div role="status" aria-label="Učitavanje koraka" className={cn("space-y-2", className)}>
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    );
  }

  const completedCount = checkpoints.filter((item) => item.completed).length;
  const orderedCheckpoints = orderTaskCheckpointsForEditor(checkpoints);
  const chainedCount = checkpoints.filter(
    (item) => item.chainedToPrevious,
  ).length;
  const allChained = checkpoints.length > 1 && chainedCount === checkpoints.length - 1;

  function focusFocusableAfter(selector: string) {
    focusAfterRender.current = selector;
  }

  async function add() {
    const text = draft.trim();
    if (!text || !canCreate || checkpoints!.length >= 100 || createBusy.current) return;
    createBusy.current = true;
    markPending("create", true);
    try {
      await createCheckpoint({ taskPageId, text });
      setDraft("");
      toast.success("Korak je dodat.");
    } catch (error) {
      toast.error(accessErrorMessage(error, "Korak nije dodat."));
    } finally {
      createBusy.current = false;
      markPending("create", false);
    }
  }

  /** Čuva izmenjen tekst koraka (Enter ili dugme); polje ostaje otvoreno dok upis ne uspe. */
  function saveEdit(id: Id<"taskCheckpoints">) {
    const text = editingText.trim();
    if (!text || pending.has(id)) return;
    markPending(id, true);
    void updateText({ checkpointId: id, text })
      .then(() => finishEdit(id))
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Korak nije sačuvan.")))
      .finally(() => markPending(id, false));
  }

  function finishEdit(id: Id<"taskCheckpoints">) {
    setEditingId(null);
    focusFocusableAfter(stepMenuSelector(id));
  }

  function remove(checkpoint: { _id: Id<"taskCheckpoints"> }, index: number) {
    // Fokus ide na sledeći korak (ili prethodni, ili na novo polje): red koji ga drži nestaje.
    const neighbour = orderedCheckpoints[index + 1] ?? orderedCheckpoints[index - 1];
    const next = neighbour ? stepToggleSelector(neighbour.checkpoint._id) : canCreate ? NEW_STEP_SELECTOR : null;
    afterMenuClose.current = () => {
      if (next !== null) sectionRef.current?.querySelector<HTMLElement>(next)?.focus();
    };
    void archiveOwn({ checkpointId: checkpoint._id })
      .then(({ undoUntil }) => {
        toast.success("Korak je obrisan.", {
          duration: Math.max(2_000, undoUntil - Date.now()),
          action: {
            label: "Poništi",
            onClick: () =>
              void restoreOwn({ checkpointId: checkpoint._id }).catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Korak nije vraćen.")),
              ),
          },
        });
      })
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Korak nije obrisan.")));
  }

  return (
    <div ref={sectionRef} className={cn("space-y-3", className)}>
      {checkpoints.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">
              {completedCount}/{checkpoints.length} završeno
            </span>
            <Progress
              label="Napredak koraka"
              ton="success"
              size="sm"
              value={completedCount}
              max={checkpoints.length}
              className="w-24"
            />
          </div>
          {canCreate && checkpoints.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
              title={
                allChained
                  ? "Razveži sve korake — svaki se može završiti nezavisno"
                  : "Poveži sve korake — svaki čeka da se prethodni završi"
              }
              onClick={() => {
                void setAllChained({ taskPageId, chained: !allChained })
                  .then(() =>
                    toast.success(
                      allChained
                        ? "Koraci su razvezani."
                        : "Koraci su povezani u redosled.",
                    ),
                  )
                  .catch((error: unknown) =>
                    toast.error(accessErrorMessage(error, "Redosled nije promenjen.")),
                  );
              }}
            >
              {allChained ? (
                <Link2Off className="size-3.5" aria-hidden="true" />
              ) : (
                <Link2 className="size-3.5" aria-hidden="true" />
              )}
              {allChained ? "Razveži sve" : "Poveži sve"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {canCreate ? (
        <div className="flex gap-2">
          <Input
            data-step-new=""
            value={draft}
            placeholder="Dodaj korak…"
            aria-label="Novi korak"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!draft.trim() || checkpoints.length >= 100}
            // Dok upis traje, dugme ostaje u fokusu (aria-disabled), a klik se ignoriše.
            aria-disabled={pending.has("create") || undefined}
            onClick={() => void add()}
          >
            {pending.has("create") ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="size-4" aria-hidden="true" />
            )}
            Dodaj
          </Button>
        </div>
      ) : null}

      {checkpoints.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nema koraka.</p>
      ) : (
        <div className={cn("space-y-1.5", compact && "space-y-1")}>
          {orderedCheckpoints.map(({ checkpoint, ordinal }, displayIndex) => {
            const canChain = checkpoint.canEdit && ordinal > 1;
            const hasMenu = checkpoint.canEdit || checkpoint.canDeleteDirectly;
            // Zašto kvačica ne radi: razlog je na samom dugmetu (aria-describedby), a dodir ga javlja toastom.
            const toggleBlocked = checkpoint.locked || !checkpoint.canToggle;
            const toggleReason = checkpoint.locked
              ? `Zaključano dok se ne završi korak #${checkpoint.blockedByOrdinal}.`
              : !checkpoint.canToggle
                ? PERMISSION_REASONS.checkpoints
                : null;
            return (
              <div key={checkpoint._id} className="space-y-1">
                {checkpoint.chainedToPrevious && displayIndex > 0 ? (
                  <p className="flex items-center gap-1.5 pl-4 text-meta tabular-nums text-muted-foreground">
                    <span className="h-3 w-px bg-border" aria-hidden="true" />
                    <Link2 className="size-3" aria-hidden="true" />
                    vezano za #{ordinal - 1}
                  </p>
                ) : null}
                <article
                  aria-label={`Korak broj ${ordinal}: ${checkpoint.text}${
                    checkpoint.completed ? ". Završen" : ""
                  }${
                    checkpoint.locked
                      ? `. Zaključan dok se ne završi korak broj ${checkpoint.blockedByOrdinal}`
                      : ""
                  }`}
                  className={cn(
                    "group/korak rounded-lg px-2 py-0.5 transition-colors hover:bg-surface-control",
                    checkpoint.locked && "text-muted-foreground",
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="grid h-6 min-w-6 shrink-0 place-items-center text-meta tabular-nums text-muted-foreground">
                      #{ordinal}
                    </span>
                    <button
                      type="button"
                      data-step-toggle={checkpoint._id}
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface-control-hover pointer-coarse:size-11",
                        toggleBlocked && "cursor-not-allowed opacity-60 hover:bg-transparent",
                      )}
                      // Dok upis traje dugme ostaje u fokusu (aria-disabled), a klik se ignoriše.
                      aria-disabled={toggleBlocked || pending.has(checkpoint._id) || undefined}
                      aria-describedby={toggleReason ? `${reasonBase}-${checkpoint._id}` : undefined}
                      aria-label={
                        checkpoint.completed
                          ? `Ponovo otvori korak broj ${ordinal}: ${checkpoint.text}`
                          : `Završi korak broj ${ordinal}: ${checkpoint.text}`
                      }
                      title={toggleReason ?? (checkpoint.completed ? "Ponovo otvori" : "Označi kao završeno")}
                      onClick={() => {
                        if (toggleBlocked) {
                          if (toggleReason) toast.info(toggleReason);
                          return;
                        }
                        if (pending.has(checkpoint._id)) return;
                        markPending(checkpoint._id, true);
                        void setCompleted({
                          checkpointId: checkpoint._id,
                          completed: !checkpoint.completed,
                        })
                          .catch((error: unknown) =>
                            toast.error(accessErrorMessage(error, "Status nije promenjen.")),
                          )
                          .finally(() => markPending(checkpoint._id, false));
                      }}
                    >
                      {pending.has(checkpoint._id) ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      ) : checkpoint.completed ? (
                        <Check className="size-4 text-success" aria-hidden="true" />
                      ) : checkpoint.locked ? (
                        <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </button>
                    {toggleReason ? (
                      <span id={`${reasonBase}-${checkpoint._id}`} className="sr-only">
                        {toggleReason}
                      </span>
                    ) : null}
                    {editingId === checkpoint._id ? (
                      <>
                        <Input
                          data-step-edit=""
                          // Esc vraća staru vrednost; panel se ne zatvara.
                          data-escape-local="true"
                          value={editingText}
                          aria-label={`Tekst koraka broj ${ordinal}`}
                          className="h-9 min-w-0 flex-1"
                          onChange={(event) => setEditingText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              finishEdit(checkpoint._id);
                            }
                            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              saveEdit(checkpoint._id);
                            }
                          }}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0"
                          aria-label="Sačuvaj korak"
                          aria-disabled={!editingText.trim() || pending.has(checkpoint._id) || undefined}
                          onClick={() => saveEdit(checkpoint._id)}
                        >
                          <Check className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-muted-foreground"
                          aria-label="Otkaži izmenu"
                          onClick={() => finishEdit(checkpoint._id)}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <p
                          className={cn(
                            "min-w-0 flex-1 break-words text-sm",
                            checkpoint.completed &&
                              "text-muted-foreground line-through",
                          )}
                        >
                          {checkpoint.text}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn("size-9 shrink-0 text-muted-foreground", RADNJA_REDA)}
                          aria-label={`Komentari koraka: ${checkpoint.text}`}
                          title="Komentari"
                          onClick={() =>
                            setThread({
                              id: checkpoint._id,
                              title: checkpoint.text,
                            })
                          }
                        >
                          <MessageSquareText className="size-3.5" aria-hidden="true" />
                        </Button>
                      </>
                    )}
                    {hasMenu && editingId !== checkpoint._id ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              data-step-menu={checkpoint._id}
                              className={cn("size-9 shrink-0 text-muted-foreground", RADNJA_REDA)}
                              aria-label={`Radnje koraka broj ${ordinal}: ${checkpoint.text}`}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" aria-hidden="true" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="w-52"
                          finalFocus={() => {
                            const run = afterMenuClose.current;
                            if (run === null) return true;
                            afterMenuClose.current = null;
                            run();
                            return false;
                          }}
                        >
                          {checkpoint.canEdit ? (
                            <DropdownMenuItem
                              onClick={() => {
                                // Polje se montira pri izboru; fokus mu daje tek zatvaranje menija.
                                afterMenuClose.current = () => {
                                  const focusInput = () => {
                                    const input = sectionRef.current?.querySelector<HTMLInputElement>("[data-step-edit]");
                                    input?.focus();
                                    input?.select();
                                    return input !== null && input !== undefined;
                                  };
                                  if (!focusInput()) window.requestAnimationFrame(focusInput);
                                };
                                setEditingId(checkpoint._id);
                                setEditingText(checkpoint.text);
                              }}
                            >
                              <Pencil aria-hidden="true" />
                              Uredi korak
                            </DropdownMenuItem>
                          ) : null}
                          {canChain ? (
                            <DropdownMenuItem
                              onClick={() => {
                                void setChained({
                                  checkpointId: checkpoint._id,
                                  chained: !checkpoint.chainedToPrevious,
                                }).catch((error: unknown) =>
                                  toast.error(accessErrorMessage(error, "Veza nije promenjena.")),
                                );
                              }}
                            >
                              {checkpoint.chainedToPrevious ? (
                                <Link2Off aria-hidden="true" />
                              ) : (
                                <Link2 aria-hidden="true" />
                              )}
                              {checkpoint.chainedToPrevious
                                ? `Razveži od koraka #${ordinal - 1}`
                                : `Veži za korak #${ordinal - 1}`}
                            </DropdownMenuItem>
                          ) : null}
                          {checkpoint.canDeleteDirectly ? (
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => remove(checkpoint, displayIndex)}
                            >
                              <Trash2 aria-hidden="true" />
                              Obriši korak
                            </DropdownMenuItem>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      )}

      <CheckpointCommentsDialog
        checkpointId={thread?.id ?? null}
        title={thread?.title ?? ""}
        open={thread !== null}
        onOpenChange={(open) => {
          if (!open) setThread(null);
        }}
      />
    </div>
  );
}
