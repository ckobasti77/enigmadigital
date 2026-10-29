"use client";

// Preneto iz Devotion apps/web/components/workspace/tasks-view.tsx (main @ c05c40f), SPAJANJE S12.
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { CalendarCheck, CheckCircle2, LayoutGrid, Plus, Rows3, UserSearch } from "lucide-react";
import {
  applyStartupHolds,
  boardColumns,
  findStartupRow,
  locateStartupRow,
  rowFromStartupTask,
  type StartupTaskHold,
  type StartupTaskLike,
  type StartupTaskSection,
  type StartupTaskStatus,
} from "@/lib/prostor/startup-tasks";
import { rescheduleCandidates } from "@/lib/prostor/command-center";
import { STATUS_LABELS } from "@/lib/prostor/task-sort";
import type { WorkspaceMini, TaskRowModel } from "@/lib/prostor/task-row";

import { TaskRow, type TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import type { TaskPanelProps } from "@/components/app/prostor/zadaci/panel/task-panel";
import { FlipGroup } from "@/components/motion/flip-group";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/app/prostor/zadaci/constants";
import { useStartupTaskCommands } from "@/components/app/prostor/zadaci/use-startup-task-commands";
import { RescheduleDialog, useReschedule } from "@/components/app/prostor/pocetna/reschedule-dialog";
import type { ProfileWithAvatar, StartupWithAreas, TasksFilter } from "@/lib/prostor/rute";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import type { Today } from "@/lib/prostor/web/danas";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tasksWord } from "@/lib/prostor/web/projekat";
import { useProjekat, useProjekatQuery } from "@/components/app/projekat-provider";
import { useProjekatPaginatedQuery } from "@/components/app/prostor/podaci/projekat";

/** Izbor filtera: „svi", „moji" ili id člana (PROSTOR P11). */
export type TasksFilterValue = TasksFilter | Id<"profiles">;

type TasksViewProps = {
  workspace: StartupWithAreas;
  profile: ProfileWithAvatar;
  today: Today;
  workspaces: TaskPanelProps["workspaces"];
  filter: TasksFilterValue;
  onFilterChange: (filter: TasksFilterValue) => void;
  onOpenPage: (pageId: Id<"pages">) => void;
  onOpenFull: (pageId: Id<"pages">) => void;
  onCreateTask: () => void;
};

/** Najviše zadataka za koje se odjednom traže izvršioci (`taskAssignees.listForTasks`). */
const ASSIGNEE_LOOKUP_MAX = 300;

/**
 * Poslednja učitana vrednost za isti `scope` (izvedeno stanje, bez efekta).
 * Promena filtera briše zapamćeno, da redovi ne dobiju izvršioce drugog skupa.
 */
export function useLastReady<T>(value: T | undefined, scope: string): T | undefined {
  const [last, setLast] = useState<{ scope: string; value: T | undefined }>({ scope, value });
  if (last.scope !== scope) {
    setLast({ scope, value });
  } else if (value !== undefined && value !== last.value) {
    setLast({ scope, value });
  }
  return value ?? (last.scope === scope ? last.value : undefined);
}

/** Tabla ima smisla tek od `md` (K07 §5.3); ispod toga Zadaci su lista. */
const BOARD_QUERY = "(min-width: 48rem)";

function subscribeBoardQuery(onChange: () => void) {
  const media = window.matchMedia(BOARD_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useBoardAllowed(): boolean {
  return useSyncExternalStore(
    subscribeBoardQuery,
    () => window.matchMedia(BOARD_QUERY).matches,
    () => true,
  );
}

export type TasksMode = "list" | "board";

/** Liste zadržavanja: lista (`list:all`) i tabla (`board:<status>`). */
const LIST = "list";
const BOARD = "board";

/** Sekcije za prikaz (sa zadržanim redovima) — ČISTO, deli ga i izlog. */
export function buildTaskSections(
  rows: ReadonlyArray<TaskRowModel>,
  mode: TasksMode,
  holds: ReadonlyMap<string, StartupTaskHold>,
  pending: ReadonlyMap<string, boolean>,
): StartupTaskSection[] {
  return mode === "list"
    ? applyStartupHolds(LIST, [{ id: "all", rows: [...rows] }], holds, pending)
    : applyStartupHolds(BOARD, boardColumns(rows), holds, pending);
}

export function tasksListName(mode: TasksMode) {
  return mode === "list" ? LIST : BOARD;
}

/**
 * Zadaci startupa — kontejner (PROSTOR P11, K08; red zadatka iz LICNO K17).
 * Svi zadaci tima, filter Svi · Moji · osoba (podrazumevano Svi). Lista i
 * tabla dele red zadatka: završi sa „Poništi", rok, prioritet, status (tabla
 * se tako i prevlači), „Dodaj u Moj dan"; klik otvara panel zadatka.
 */
export function TasksView({
  workspace,
  profile,
  today,
  workspaces,
  filter,
  onFilterChange,
  onOpenPage,
  onOpenFull,
  onCreateTask,
}: TasksViewProps) {
  const { uloga, platformaVlasnik } = useProjekat();
  const members = useProjekatQuery(api.prostor.projekat.listMembers, { limit: 50 });
  const personFilter = filter !== "svi" && filter !== "moji";
  // Osoba iz URL-a mora biti član ovog startupa: nevažeći id (ručno uređen
  // link, uklonjen član) bi oborio upit, pa se čeka spisak i pada na „Svi".
  const personKnown = !personFilter || (members?.some((member) => member.profile._id === filter) ?? false);
  useEffect(() => {
    if (personFilter && members !== undefined && !personKnown) onFilterChange("svi");
  }, [personFilter, members, personKnown, onFilterChange]);
  const assigneeProfileId = filter === "svi" ? undefined : filter === "moji" ? profile._id : filter;
  const { results, status: tasksStatus, loadMore } = useProjekatPaginatedQuery(
    api.prostor.tasks.listForStartup,
    !personKnown
      ? "skip"
      : assigneeProfileId === undefined
        ? {}
        : { assigneeProfileId },
    { initialNumItems: 50 },
  );
  const [chosenMode, setMode] = useState<TasksMode>("list");
  const boardAllowed = useBoardAllowed();
  const mode: TasksMode = boardAllowed ? chosenMode : "list";
  // Menadžer projekta (zaključan zadatak, `convex/prostor/lib/auth.ts`): vlasnik ili vlasnik platforme.
  const isManager = uloga === "owner" || platformaVlasnik;
  // „Moji" već znaju da sam izvršilac; za ostale filtere dozvole reda traže spisak izvršilaca.
  const needsAssignees = filter !== "moji";
  const assigneeRows = useLastReady(
    useProjekatQuery(
      api.prostor.taskAssignees.listForTasks,
      needsAssignees && results.length > 0
        ? { taskPageIds: results.slice(0, ASSIGNEE_LOOKUP_MAX).map((task) => task._id) }
        : "skip",
    ),
    filter,
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

  const scopeRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<StartupTaskSection[]>([]);
  const modeRef = useRef(mode);
  // Flip radi `FlipGroup` sam (snimak pre commit-a), pa komande ne snimaju ništa.
  const flipCapture = () => {};
  const commands = useStartupTaskCommands({
    today,
    profileId: profile._id,
    workspaces,
    listRef: scopeRef,
    locate: (key) => locateStartupRow(tasksListName(modeRef.current), sectionsRef.current, key),
    getRow: (key) => findStartupRow(sectionsRef.current, key),
    flipCapture,
    onOpenInStartup: (_startupId, pageId) => onOpenPage(pageId),
    onOpenFull,
  });

  const rows = useMemo(
    () =>
      (results as ReadonlyArray<StartupTaskLike>).map((task) =>
        rowFromStartupTask(task, {
          profileId: profile._id,
          workspace: startupMini,
          areaLabels,
          assigneeIds: needsAssignees ? (assigneesByTaskId?.get(task._id) ?? null) : null,
          // Filter „Moji" je već lista mojih zadataka (učešće kroz `taskAssignees`).
          assumeAssignee: !needsAssignees,
          plannedKeys: commands.plannedKeys,
          isManager,
        }),
      ),
    [results, profile._id, startupMini, areaLabels, commands.plannedKeys, needsAssignees, assigneesByTaskId, isManager],
  );
  const sections = useMemo(
    () => buildTaskSections(rows, mode, commands.holds, commands.pending),
    [rows, mode, commands.holds, commands.pending],
  );
  useLayoutEffect(() => {
    sectionsRef.current = sections;
    modeRef.current = mode;
  });

  // Dozvole zavise od izvršilaca: dok prvi put ne stignu, prikaz je u učitavanju.
  const loading =
    !personKnown ||
    tasksStatus === "LoadingFirstPage" ||
    members === undefined ||
    (needsAssignees && results.length > 0 && assigneeRows === undefined);
  const memberOptions = useMemo(
    () => (members ?? []).map((member) => ({ id: member.profile._id, name: member.profile.displayName })),
    [members],
  );

  // „Sredi rokove": otvoreni zadaci sa prošlim rokom među onima na ekranu (filter važi).
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  const { busy: rescheduleBusy, apply: applyReschedule } = useReschedule({ now: today.now, beforeApply: flipCapture });
  const candidates = useMemo(
    () => rescheduleCandidates(results as ReadonlyArray<StartupTaskLike>, today.now),
    [results, today.now],
  );
  // Kad se lista isprazni dijalog se zatvara i ne sme sam da iskoči kad prekoračenih opet bude.
  if (rescheduleOpen && !loading && candidates.length === 0) setRescheduleOpen(false);

  return (
    <>
      <TasksBody
        now={today.now}
        filter={{ value: filter, members: memberOptions, onChange: onFilterChange }}
        resetKey={`${filter}:${mode}`}
        reschedule={
          loading || candidates.length === 0
            ? null
            : { count: candidates.length, onOpen: () => setRescheduleOpen(true) }
        }
        rescheduleRef={rescheduleRef}
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
        loadMore={
          tasksStatus === "CanLoadMore" || tasksStatus === "LoadingMore"
            ? { busy: tasksStatus === "LoadingMore", onLoad: () => loadMore(50) }
            : null
        }
      />
      {commands.panel}
      <RescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        candidates={candidates}
        busy={rescheduleBusy}
        returnFocusRef={rescheduleRef}
        fallbackFocusId="zadaci-prikaz"
        onApply={(target, ids) => {
          void applyReschedule(target, ids);
        }}
      />
    </>
  );
}

export type TasksFilterProps = {
  value: TasksFilterValue;
  /** Članovi startupa za izbor osobe. */
  members: ReadonlyArray<{ id: Id<"profiles">; name: string }>;
  onChange: (value: TasksFilterValue) => void;
};

export type TasksBodyProps = {
  now: number;
  filter: TasksFilterProps;
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
  /** „Sredi rokove" (zadaci sa prošlim rokom); `null` kad ih nema. */
  reschedule?: { count: number; onOpen: () => void } | null;
  /** Dugme „Sredi rokove": fokus mu se vraća posle dijaloga. */
  rescheduleRef?: RefObject<HTMLButtonElement | null>;
};

/** Vrednost izbora „Osoba" kad nije izabran član. */
const NO_PERSON = "svi";

const SCOPE_OPTIONS = [
  { value: "svi", label: "Svi" },
  { value: "moji", label: "Moji" },
] as const;

function TasksFilterBar({ filter }: { filter: TasksFilterProps }) {
  const person = filter.value === "svi" || filter.value === "moji" ? NO_PERSON : filter.value;
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const checkedIndex = SCOPE_OPTIONS.findIndex((option) => option.value === filter.value);
  // Radio grupa (WAI-ARIA): jedan Tab stop, strelice i Home/End biraju.
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = SCOPE_OPTIONS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % SCOPE_OPTIONS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    filter.onChange(SCOPE_OPTIONS[next].value);
    optionRefs.current[next]?.focus();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Čiji zadaci"
        aria-describedby={checkedIndex === -1 ? "zadaci-osoba-izabrana" : undefined}
        className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
      >
        {SCOPE_OPTIONS.map((option, index) => {
          const checked = option.value === filter.value;
          return (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || (checkedIndex === -1 && index === 0) ? 0 : -1}
              onClick={() => filter.onChange(option.value)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "inline-flex h-8 cursor-pointer items-center rounded-md px-2.5 text-ui font-medium text-text-muted outline-none transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
                checked && "bg-surface-raised text-foreground shadow-elev-1",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {checkedIndex === -1 ? (
        <span id="zadaci-osoba-izabrana" className="sr-only">
          Izabrana je osoba u polju Osoba.
        </span>
      ) : null}
      <Select
        label="Osoba"
        value={person}
        onValueChange={(value) => filter.onChange(value === NO_PERSON ? "svi" : (value as Id<"profiles">))}
        options={[
          { value: NO_PERSON, label: "Osoba: svi" },
          ...filter.members.map((member) => ({ value: member.id as string, label: member.name })),
        ]}
        className="w-48"
      />
    </div>
  );
}

function TasksEmpty({ filter, onCreateTask }: { filter: TasksFilterProps; onCreateTask: () => void }) {
  if (filter.value === "svi") {
    return (
      <EmptyState
        icon={CheckCircle2}
        headingAs="h2"
        title="Još nema zadataka u ovom projektu."
        action={
          <Button variant="secondary" onClick={onCreateTask}>
            <Plus /> Novi zadatak
          </Button>
        }
      />
    );
  }
  const name =
    filter.value === "moji"
      ? null
      : (filter.members.find((member) => member.id === filter.value)?.name ?? "Ovaj član");
  return (
    <EmptyState
      icon={UserSearch}
      headingAs="h2"
      title={name === null ? "Nemaš zadataka u ovom projektu." : `${name} nema zadataka ovde.`}
      action={
        <Button variant="outline" onClick={() => filter.onChange("svi")}>
          Prikaži sve
        </Button>
      }
    />
  );
}

/** Zadaci startupa — prezentacija (lista i tabla, filter), podaci kroz props. */
export function TasksBody({
  now,
  filter,
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
  reschedule = null,
  rescheduleRef,
}: TasksBodyProps) {
  return (
    <div className="flex w-full flex-col gap-5 pb-16">
      <PageHeader
        variant="module"
        title="Zadaci"
        description={
          loading ? "Zadaci tima." : `${formatNumber(count)}${loadMore ? "+" : ""} ${tasksWord(count)}`
        }
        actions={
          <Button variant="primary" onClick={onCreateTask}>
            <Plus aria-hidden="true" /> Novi zadatak
          </Button>
        }
      />

      <Tabs value={mode} onValueChange={(value) => onModeChange(value as TasksMode)} className="gap-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TasksFilterBar filter={filter} />
          <div className="flex flex-wrap items-center gap-2">
            {reschedule ? (
              <Button ref={rescheduleRef} variant="outline" onClick={reschedule.onOpen}>
                <CalendarCheck aria-hidden="true" />
                Sredi rokove
                <span className="tabular-nums text-text-muted">· {formatNumber(reschedule.count)}</span>
              </Button>
            ) : null}
            {/* Ispod `md` postoji samo Lista (K07 §5.3), pa nema ni prekidača. */}
            <TabsList id="zadaci-prikaz" variant="pill" aria-label="Prikaz zadataka" className="max-md:hidden">
              <TabsTrigger value="list">
                <Rows3 /> Lista
              </TabsTrigger>
              <TabsTrigger value="board">
                <LayoutGrid /> Tabla
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        {loading ? (
          <TaskSectionsSkeleton />
        ) : (
          <TaskSectionsView
            now={now}
            actions={actions}
            selectedKey={selectedKey}
            activeKey={activeKey}
            request={request}
            sections={sections}
            count={count}
            scopeRef={scopeRef}
            onListFocus={onListFocus}
            resetKey={resetKey}
            empty={<TasksEmpty filter={filter} onCreateTask={onCreateTask} />}
          />
        )}
      </Tabs>
      {loadMore && !loading ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadMore.busy} onClick={loadMore.onLoad}>
            {loadMore.busy ? "Učitavam…" : "Učitaj još zadataka"}
          </Button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** Učitavanje liste zadataka: pet redova iste visine kao red. */
export function TaskSectionsSkeleton() {
  return (
    <div role="status" className="space-y-1" aria-label="Učitavanje zadataka">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-14 w-full rounded-lg md:h-10" />
      ))}
    </div>
  );
}

/**
 * Lista i tabla zadataka (sadržaj `Tabs` sa vrednostima `list` / `board`) —
 * isti red zadatka u Zadacima startupa i u Zadacima oblasti (PROSTOR P12).
 * Roditelj drži `Tabs` i prekidač prikaza.
 */
export function TaskSectionsView({
  now,
  sections,
  count,
  actions,
  scopeRef,
  selectedKey,
  activeKey,
  request,
  onListFocus,
  empty,
  resetKey = "",
}: {
  now: number;
  sections: StartupTaskSection[];
  count: number;
  actions: TaskRowActions;
  scopeRef: RefObject<HTMLDivElement | null>;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
  onListFocus: (event: FocusEvent<HTMLElement>) => void;
  /** Prazna lista (isti tekst za listu i tablu). */
  empty: ReactNode;
  /** Nov skup (filter, prikaz): raspored se menja odmah, bez Flip-a. */
  resetKey?: string;
}) {
  const rowProps = { now, actions, selectedKey, activeKey, request };
  // Potpis rasporeda: ključevi redova po sekcijama (kvačica, rok i status pomeraju red).
  const layoutKey = sections
    .map((section) => `${section.id}:${section.rows.map((row) => row.key).join(",")}`)
    .join("|");
  return (
    <FlipGroup scope={scopeRef} layoutKey={layoutKey} resetKey={resetKey} disabled={count > STARTUP_FLIP_MAX_ROWS}>
      <div ref={scopeRef} onFocus={onListFocus}>
        <TabsContent value="list">
          {count === 0 ? (
            empty
          ) : (
            <div>
              <div
                aria-hidden="true"
                className="hidden items-center gap-2 border-b border-line px-2 pb-1.5 text-meta font-medium text-text-muted xl:flex"
              >
                {/* Iste širine kao red: kvačica 32 · naslov · oblast 120 · status 96 · rok 104 · prioritet 88 · radnje 100. */}
                <span className="w-8 shrink-0" />
                <span className="flex flex-1 items-center gap-3">
                  <span className="flex-1">Zadatak</span>
                  <span className="flex shrink-0">
                    <span className="w-[120px]">Oblast</span>
                    <span className="w-24">Status</span>
                    <span className="w-[104px]">Rok</span>
                    <span className="w-[88px]">Prioritet</span>
                  </span>
                </span>
                <span className="w-[100px] shrink-0" />
              </div>
              <ul data-section="all" className="mt-1 space-y-0.5">
                {(sections[0]?.rows ?? []).map((row) => (
                  <li key={row.key} data-flip-id={row.key}>
                    <TaskRow
                      row={row}
                      now={now}
                      actions={actions}
                      canOpen
                      columns
                      showStartup={false}
                      selected={selectedKey === row.key}
                      active={activeKey === row.key}
                      request={request?.key === row.key ? request : null}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>
        <TabsContent value="board">
          {count === 0 ? (
            empty
          ) : (
            // `relative`: apsolutni elementi u kolonama (sr-only brojač) ostaju u skroleru, ne šire stranu.
            <div className="relative overflow-x-auto pb-4">
              <div className="grid min-w-[60rem] grid-cols-5 gap-3">
                {sections.map((column) => (
                  <BoardColumn key={column.id} status={column.id as StartupTaskStatus} rows={column.rows} {...rowProps} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </div>
    </FlipGroup>
  );
}

function BoardColumn({
  status,
  rows,
  now,
  actions,
  selectedKey,
  activeKey,
  request,
}: {
  status: StartupTaskStatus;
  rows: TaskRowModel[];
  now: number;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
}) {
  const headingId = `tabla-${status}`;
  return (
    <section aria-labelledby={headingId} className="rounded-lg border border-line-soft p-2.5">
      <header className="mb-2 flex items-baseline gap-2 px-1 py-1">
        <h2 id={headingId} className="text-ui font-semibold text-foreground">
          {STATUS_LABELS[status]}
        </h2>
        <span className="text-ui tabular-nums text-text-muted">
          {formatNumber(rows.length)}
          <span className="sr-only"> {tasksWord(rows.length)}</span>
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="min-h-40 px-1 text-meta text-text-muted">Nema zadataka.</p>
      ) : (
        <ul data-section={status} className="min-h-40 space-y-2">
          {rows.map((row) => (
            <li key={row.key} data-flip-id={row.key}>
              <TaskRow
                row={row}
                now={now}
                actions={actions}
                canOpen
                variant="card"
                showStartup={false}
                selected={selectedKey === row.key}
                active={activeKey === row.key}
                request={request?.key === row.key ? request : null}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
