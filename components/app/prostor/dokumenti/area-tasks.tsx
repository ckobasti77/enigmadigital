"use client";

// Preneto iz Devotion apps/web/components/workspace/area/area-tasks.tsx (main @ c05c40f), SPAJANJE S10 (parkirano), ugrađeno u S12.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { CheckCircle2, LayoutGrid, Plus, Rows3 } from "lucide-react";
import {
  findStartupRow,
  locateStartupRow,
  rowFromStartupTask,
  STARTUP_TASK_STATUSES,
  type StartupTaskLike,
  type StartupTaskSection,
  type StartupTaskStatus,
} from "@/lib/prostor/startup-tasks";
import { STATUS_LABELS } from "@/lib/prostor/task-sort";
import type { WorkspaceMini } from "@/lib/prostor/task-row";

import type { TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStartupTaskCommands } from "@/components/app/prostor/zadaci/use-startup-task-commands";
import {
  buildTaskSections,
  TaskSectionsSkeleton,
  TaskSectionsView,
  tasksListName,
  useBoardAllowed,
  useLastReady,
  type TasksMode,
} from "@/components/app/prostor/zadaci/tasks-view";
import type { StartupWithAreas } from "@/lib/prostor/rute";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { cn } from "@/lib/utils";

import { AREA_TASKS_PAGE, shouldLoadMoreAreaTasks } from "@/lib/prostor/modeli/area-model";
import { useProjekatPaginatedQuery } from "@/components/app/prostor/podaci/projekat";
import { useProjekat, useProjekatQuery } from "@/components/app/projekat-provider";

/** Najviše zadataka za koje se odjednom traže izvršioci (`taskAssignees.listForTasks`). */
const ASSIGNEE_LOOKUP_MAX = 300;

/** Filter statusa: `null` = svi statusi. */
export type AreaTaskStatusFilter = StartupTaskStatus | null;

/**
 * Zadaci oblasti — kontejner (PROSTOR P12, K07 §5.5) nad `tasks.listForArea`:
 * isti red zadatka kao u Zadacima projekta (završi sa „Poništi", rok,
 * prioritet, status, „Dodaj u Moj dan", panel), lista i tabla. Filter statusa
 * je na serveru, pa se kraća strana učitava dalje (K07 R6).
 */
export function AreaTasksContainer({
  workspace,
  profileId,
  areaId,
  onOpenPage,
  onCreateTask,
}: {
  workspace: StartupWithAreas;
  profileId: Id<"profiles">;
  areaId: Id<"areas">;
  /** Otvori stranicu zadatka (panel „Puni prikaz" i „Otvori"). */
  onOpenPage: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
}) {
  const today = useToday();
  const { uloga, platformaVlasnik } = useProjekat();
  const [statusFilter, setStatusFilter] = useState<AreaTaskStatusFilter>(null);
  const [chosenMode, setMode] = useState<TasksMode>("list");
  const boardAllowed = useBoardAllowed();
  const mode: TasksMode = boardAllowed ? chosenMode : "list";
  // Tabla je već podeljena po statusu: filter statusa važi samo za listu.
  const status = mode === "board" ? null : statusFilter;
  const { results, status: pageStatus, loadMore } = useProjekatPaginatedQuery(
    api.prostor.tasks.listForArea,
    status === null ? { areaId } : { areaId, status },
    { initialNumItems: AREA_TASKS_PAGE },
  );
  // Koliko redova lista želi (raste sa „Učitaj još"); kraća strana učitava dalje sama.
  const [wanted, setWanted] = useState(AREA_TASKS_PAGE);
  const filterKey = `${status ?? "svi"}`;
  const [wantedKey, setWantedKey] = useState(filterKey);
  if (wantedKey !== filterKey) {
    setWantedKey(filterKey);
    setWanted(AREA_TASKS_PAGE);
  }
  useEffect(() => {
    if (shouldLoadMoreAreaTasks({ status: pageStatus, loaded: results.length, wanted })) loadMore(AREA_TASKS_PAGE);
  }, [pageStatus, results.length, wanted, loadMore]);

  // Menadžer projekta (zaključan zadatak, `convex/prostor/lib/auth.ts`): vlasnik ili vlasnik platforme.
  const isManager = uloga === "owner" || platformaVlasnik;
  // Skup id-jeva se menja („Učitaj još", nov ili završen zadatak): do novog odgovora
  // važe poslednji izvršioci, da lista ne padne u skeleton (kao Zadaci projekta).
  const assigneeRows = useLastReady(
    useProjekatQuery(
      api.prostor.taskAssignees.listForTasks,
      results.length > 0
        ? { taskPageIds: results.slice(0, ASSIGNEE_LOOKUP_MAX).map((task) => task._id) }
        : "skip",
    ),
    filterKey,
  );
  const assigneesByTaskId = useMemo(
    () =>
      assigneeRows === undefined
        ? null
        : new Map(assigneeRows.map((row) => [row.taskPageId as string, row.assignees.map((a) => a.profileId as string)])),
    [assigneeRows],
  );
  const areaLabels = useMemo(
    () => new Map(workspace.areas.map((area) => [area._id as string, area.label] as const)),
    [workspace.areas],
  );
  const startupMini = useMemo<WorkspaceMini>(
    () => ({ _id: workspace._id, name: workspace.name, logoUrl: workspace.logoUrl }),
    [workspace._id, workspace.name, workspace.logoUrl],
  );

  // Panel zadatka: ime i znak projekta, nazivi oblasti (tekući projekat).
  const workspaces = useMemo(
    () => [
      {
        _id: workspace._id,
        name: workspace.name,
        logoUrl: workspace.logoUrl,
        areas: workspace.areas.map((area) => ({ _id: area._id, label: area.label })),
      },
    ],
    [workspace],
  );

  const scopeRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<StartupTaskSection[]>([]);
  const modeRef = useRef(mode);
  const commands = useStartupTaskCommands({
    today,
    profileId,
    workspaces,
    listRef: scopeRef,
    locate: (key) => locateStartupRow(tasksListName(modeRef.current), sectionsRef.current, key),
    getRow: (key) => findStartupRow(sectionsRef.current, key),
    // Flip radi `FlipGroup` u `TaskSectionsView` sam (snimak pre commit-a).
    flipCapture: () => {},
    onOpenInStartup: (_workspaceId, pageId) => onOpenPage(pageId),
    onOpenFull: onOpenPage,
  });

  const rows = useMemo(
    () =>
      (results as ReadonlyArray<StartupTaskLike>).map((task) =>
        rowFromStartupTask(task, {
          profileId,
          workspace: startupMini,
          areaLabels,
          assigneeIds: assigneesByTaskId?.get(task._id) ?? null,
          assumeAssignee: false,
          plannedKeys: commands.plannedKeys,
          isManager,
        }),
      ),
    [results, profileId, startupMini, areaLabels, assigneesByTaskId, commands.plannedKeys, isManager],
  );
  const sections = useMemo(
    () => buildTaskSections(rows, mode, commands.holds, commands.pending),
    [rows, mode, commands.holds, commands.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = sections;
    modeRef.current = mode;
  });

  const canLoadMore = pageStatus === "CanLoadMore" || pageStatus === "LoadingMore";
  // Dozvole reda zavise od izvršilaca: dok prvi put ne stignu, prikaz je u učitavanju.
  // Prazna strana uz „ima još" nije prazna lista — filter statusa još traži (R6).
  const loading =
    pageStatus === "LoadingFirstPage" ||
    (results.length > 0 && assigneeRows === undefined) ||
    (results.length === 0 && canLoadMore);

  return (
    <>
      <AreaTasksBody
        now={today.now}
        statusFilter={status}
        onStatusFilterChange={setStatusFilter}
        loading={loading}
        count={rows.length}
        mode={mode}
        onModeChange={setMode}
        sections={sections}
        actions={commands.actions}
        scopeRef={scopeRef}
        selectedKey={commands.selectedKey}
        activeKey={commands.activeKey}
        request={commands.request}
        onListFocus={commands.onListFocus}
        announcement={commands.announcement}
        onCreateTask={onCreateTask}
        resetKey={`${filterKey}:${mode}`}
        loadMore={
          canLoadMore && results.length >= wanted
            ? { busy: pageStatus === "LoadingMore", onLoad: () => setWanted((value) => value + AREA_TASKS_PAGE) }
            : canLoadMore
              ? { busy: true, onLoad: () => {} }
              : null
        }
      />
      {commands.panel}
    </>
  );
}

export type AreaTasksBodyProps = {
  now: number;
  statusFilter: AreaTaskStatusFilter;
  onStatusFilterChange: (status: AreaTaskStatusFilter) => void;
  loading: boolean;
  count: number;
  mode: TasksMode;
  onModeChange: (mode: TasksMode) => void;
  sections: StartupTaskSection[];
  actions: TaskRowActions;
  scopeRef: RefObject<HTMLDivElement | null>;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
  announcement: string;
  onCreateTask: () => void;
  loadMore: { busy: boolean; onLoad: () => void } | null;
  /** Nov skup (filter, prikaz): raspored se menja odmah, bez Flip-a. */
  resetKey: string;
};

const STATUS_OPTIONS: ReadonlyArray<{ value: AreaTaskStatusFilter; label: string }> = [
  { value: null, label: "Svi" },
  ...STARTUP_TASK_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
];

/** Zadaci oblasti — prezentacija: čipovi statusa (lista), Lista · Tabla, isti red zadatka. */
export function AreaTasksBody({
  now,
  statusFilter,
  onStatusFilterChange,
  loading,
  count,
  mode,
  onModeChange,
  sections,
  actions,
  scopeRef,
  selectedKey,
  activeKey,
  request,
  onListFocus,
  announcement,
  onCreateTask,
  loadMore,
  resetKey,
}: AreaTasksBodyProps) {
  const empty =
    statusFilter === null ? (
      <EmptyState
        icon={CheckCircle2}
        headingAs="h2"
        title="Oblast nema zadataka."
        description="Napravi prvi zadatak da bi se ovde pojavio."
        action={
          <Button variant="secondary" onClick={onCreateTask}>
            <Plus aria-hidden="true" /> Novi zadatak
          </Button>
        }
      />
    ) : (
      <EmptyState
        size="section"
        title="Nema rezultata za ovaj filter."
        action={
          <Button variant="outline" size="sm" onClick={() => onStatusFilterChange(null)}>
            Poništi filter
          </Button>
        }
      />
    );

  return (
    <Tabs value={mode} onValueChange={(value) => onModeChange(value as TasksMode)} className="gap-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {mode === "list" ? (
          <StatusChips value={statusFilter} onChange={onStatusFilterChange} />
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCreateTask}>
            <Plus aria-hidden="true" /> Novi zadatak
          </Button>
          {/* Ispod `md` postoji samo Lista (K07 §5.3), pa nema ni prekidača. */}
          <TabsList variant="pill" aria-label="Prikaz zadataka" className="max-md:hidden">
            <TabsTrigger value="list">
              <Rows3 aria-hidden="true" /> Lista
            </TabsTrigger>
            <TabsTrigger value="board">
              <LayoutGrid aria-hidden="true" /> Tabla
            </TabsTrigger>
          </TabsList>
        </div>
      </div>
      {loading ? (
        <TaskSectionsSkeleton />
      ) : (
        <TaskSectionsView
          now={now}
          sections={sections}
          count={count}
          actions={actions}
          scopeRef={scopeRef}
          selectedKey={selectedKey}
          activeKey={activeKey}
          request={request}
          onListFocus={onListFocus}
          resetKey={resetKey}
          empty={empty}
        />
      )}
      {loadMore && !loading ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" disabled={loadMore.busy} onClick={loadMore.onLoad}>
            {loadMore.busy ? "Učitavam…" : "Učitaj još zadataka"}
          </Button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Tabs>
  );
}

/** Čipovi statusa — radio grupa (jedan Tab stop, strelice biraju). */
function StatusChips({
  value,
  onChange,
}: {
  value: AreaTaskStatusFilter;
  onChange: (value: AreaTaskStatusFilter) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = Math.max(
    0,
    STATUS_OPTIONS.findIndex((option) => option.value === value),
  );
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = STATUS_OPTIONS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % STATUS_OPTIONS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + STATUS_OPTIONS.length) % STATUS_OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(STATUS_OPTIONS[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Status zadataka" className="flex flex-wrap items-center gap-1">
      {STATUS_OPTIONS.map((option, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={option.value ?? "svi"}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-8 cursor-pointer items-center rounded-md border px-2.5 text-ui text-text-muted outline-none transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-control-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
              checked ? "border-line bg-surface-control-hover font-medium text-foreground" : "border-transparent",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
