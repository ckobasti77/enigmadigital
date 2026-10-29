"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/triage-block.tsx (main @ c05c40f), SPAJANJE S20.
import { useMemo, useRef, useState, type RefObject } from "react";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  ChevronDown,
  CircleDashed,
  Flame,
  type LucideIcon,
} from "lucide-react";
import { COMMAND_BLOCK_TEXT, rescheduleCandidates, type TaskRowModel } from "@/lib/prostor";

import type { TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import { STARTUP_FLIP_MAX_ROWS } from "@/components/app/prostor/zadaci/constants";
import { ProjekatLink } from "@/components/app/projekat-link";
import { FlipGroup } from "@/components/motion/flip-group";
import { Unfold } from "@/components/motion/unfold";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  buildZones,
  filterByMember,
  UNASSIGNED_KEY,
  zoneRowCount,
  type CommandCenterAssignee,
  type CommandCenterZone,
  type CommandCenterZoneId,
  type WorkloadFilter,
} from "@/lib/prostor/modeli/command-center-model";
import { sledecaGranicaZone, type LimitiPocetne } from "@/lib/prostor/modeli/pocetna-model";
import { hrefRute } from "@/lib/prostor/rute";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { Block, type BlockStatus, useBlockRetry } from "./blok";
import { useJaviBroj } from "./brojevi-zaglavlja";
import { RescheduleDialog, useReschedule } from "./reschedule-dialog";
import { CommandTaskRow, useCommandRows, useRegisterSections } from "./rows-context";
import { useTriageData, type TriageMember } from "./use-triage-data";

const SVI_ZADACI = hrefRute({ kind: "tasks" }, "");

const ZONE_META: Record<CommandCenterZoneId, { label: string; icon: LucideIcon; iconClass: string; emptyLabel: string }> = {
  gori: { label: "Gori", icon: Flame, iconClass: "text-danger", emptyLabel: "Nema zadataka." },
  zastarelo: { label: "Zastarelo", icon: CalendarX2, iconClass: "text-text-muted", emptyLabel: "Nema zadataka." },
  danas: { label: "Danas", icon: CalendarClock, iconClass: "text-text-muted", emptyLabel: "Nema zadataka." },
  nedelja: { label: "Ova nedelja", icon: CalendarDays, iconClass: "text-text-muted", emptyLabel: "Nema zadataka." },
  kasnije: { label: "Kasnije i bez roka", icon: CircleDashed, iconClass: "text-text-muted", emptyLabel: "Nema zadataka." },
};

/** Zone koje se skupljaju (i podrazumevano su skupljene). */
const COLLAPSIBLE: ReadonlySet<CommandCenterZoneId> = new Set(["zastarelo", "kasnije"]);
export const DEFAULT_OPEN_ZONES: ReadonlySet<CommandCenterZoneId> = new Set();

/** Vrednost izbora „Svi“ u filteru člana. */
const SVI = "svi";

export type TriageViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  now: number;
  zones: CommandCenterZone[];
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>;
  totalOpen: number;
  filteredTotal: number;
  hasMore: boolean;
  /** Članovi (i „Nedodeljeno" kad postoji) za izbor u zaglavlju. */
  filterOptions: ReadonlyArray<{ key: string; name: string }>;
  memberFilter: WorkloadFilter;
  onMemberFilter: (key: WorkloadFilter) => void;
  /** Zadaci sa prošlim rokom (i zastareli među njima) — broj na dugmetu „Sredi rokove". */
  overdueCount: number;
  onReschedule: () => void;
  rescheduleRef?: RefObject<HTMLButtonElement | null>;
  openZones: ReadonlySet<CommandCenterZoneId>;
  onToggleZone: (id: CommandCenterZoneId) => void;
  limiti: LimitiPocetne;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
};

/**
 * Trijaža tima: zone Gori · Zastarelo · Danas · Ova nedelja · Kasnije, filter
 * člana i „Sredi rokove" (`secondary`, E14: primarna radnja ostaje jedna).
 * Zona nije kartica: naslov zone + redovi. Svaka zona prvo pokazuje 8 redova
 * (telefon 5), „Prikaži još" dodaje po 25 do 100 (E12); ostalo je na Zadacima.
 */
export function TriageView({
  status,
  onRetry,
  now,
  zones,
  assigneesByTaskId,
  totalOpen,
  filteredTotal,
  hasMore,
  filterOptions,
  memberFilter,
  onMemberFilter,
  overdueCount,
  onReschedule,
  rescheduleRef,
  openZones,
  onToggleZone,
  limiti,
  actions,
  selectedKey,
  activeKey,
  request,
}: TriageViewProps) {
  const filterName = memberFilter === null ? null : (filterOptions.find((option) => option.key === memberFilter)?.name ?? null);
  const scopeRef = useRef<HTMLDivElement>(null);
  // Potpis rasporeda: ključevi redova po zonama (kvačica i rok pomeraju red).
  const layoutKey = zones.map((zone) => `${zone.id}:${zone.rows.map((row) => row.key).join(",")}`).join("|");
  return (
    <Block
      id="cc-trijaza"
      title="Trijaža"
      count={formatNumber(filteredTotal)}
      status={status}
      errorText={COMMAND_BLOCK_TEXT.triageError}
      onRetry={onRetry}
      skeletonRows={5}
      action={
        <>
          {/* Tim bez otvorenih zadataka nema šta da filtrira (bez mrtve kontrole). */}
          {totalOpen > 0 ? (
            <Select
              label="Čiji zadaci"
              size="sm"
              value={memberFilter ?? SVI}
              onValueChange={(value) => onMemberFilter(value === SVI ? null : value)}
              options={[
                { value: SVI, label: "Svi" },
                ...filterOptions.map((option) => ({ value: option.key, label: option.name })),
              ]}
              className="w-36"
            />
          ) : null}
          {overdueCount > 0 ? (
            <Button ref={rescheduleRef} variant="secondary" size="sm" onClick={onReschedule}>
              <CalendarCheck aria-hidden="true" />
              Sredi rokove
              <span className="tabular-nums text-text-muted">· {formatNumber(overdueCount)}</span>
            </Button>
          ) : null}
        </>
      }
    >
      {totalOpen === 0 ? (
        <EmptyState size="section" title="Tim nema otvorenih zadataka." />
      ) : filteredTotal === 0 && memberFilter !== null ? (
        <EmptyState
          size="section"
          title={`${filterName ?? "Izabrani član"} nema otvorenih zadataka.`}
          action={
            <Button variant="ghost" size="sm" onClick={() => onMemberFilter(null)}>
              Prikaži sve
            </Button>
          }
        />
      ) : (
        <FlipGroup
          scope={scopeRef}
          layoutKey={layoutKey}
          resetKey={memberFilter ?? SVI}
          disabled={zoneRowCount(zones) > STARTUP_FLIP_MAX_ROWS}
        >
          <div ref={scopeRef} className="space-y-3">
            {zones.map((zone) => {
              // „Zastarelo" je izuzetak: bez zastarelih zadataka grupe nema.
              if (zone.id === "zastarelo" && zone.rows.length === 0) return null;
              return (
                <TriageZoneSection
                  key={zone.id}
                  zone={zone}
                  now={now}
                  assigneesByTaskId={assigneesByTaskId}
                  collapsed={COLLAPSIBLE.has(zone.id) && !openZones.has(zone.id)}
                  collapsible={COLLAPSIBLE.has(zone.id)}
                  onToggle={() => onToggleZone(zone.id)}
                  limiti={limiti}
                  actions={actions}
                  selectedKey={selectedKey}
                  activeKey={activeKey}
                  request={request}
                />
              );
            })}
            {hasMore ? (
              <p className="px-2 text-meta text-text-muted">Prikazano je prvih 150 zadataka po statusu.</p>
            ) : null}
          </div>
        </FlipGroup>
      )}
    </Block>
  );
}

function TriageZoneSection({
  zone,
  now,
  assigneesByTaskId,
  collapsed,
  collapsible,
  onToggle,
  limiti,
  actions,
  selectedKey,
  activeKey,
  request,
}: {
  zone: CommandCenterZone;
  now: number;
  assigneesByTaskId: ReadonlyMap<string, ReadonlyArray<CommandCenterAssignee>>;
  collapsed: boolean;
  collapsible: boolean;
  onToggle: () => void;
  limiti: LimitiPocetne;
  actions: TaskRowActions;
  selectedKey: string | null;
  activeKey: string | null;
  request: RowRequest | null;
}) {
  const meta = ZONE_META[zone.id];
  const Icon = meta.icon;
  const count = zone.rows.length;
  const listId = `zona-${zone.id}-lista`;
  // Koliko puta je kliknuto „Prikaži još" (granica prati širinu ekrana).
  const [dodato, setDodato] = useState(0);
  const limit = Math.min(limiti.zona + dodato * limiti.zonaKorak, limiti.zonaMaks);
  const visible = zone.rows.slice(0, limit);
  const remaining = count - visible.length;
  const moze = limit < limiti.zonaMaks;
  const label = (
    <>
      <Icon className={cn("size-4 shrink-0", meta.iconClass)} aria-hidden="true" />
      <span>{meta.label}</span>
      <span className="font-normal tabular-nums">{formatNumber(count)}</span>
    </>
  );

  return (
    <div
      id={`zona-${zone.id}`}
      // Zona je i sama deo Flip-a: kad red pređe u drugu zonu, zona menja visinu zajedno sa redovima.
      data-flip-id={`zona:${zone.id}`}
      className="scroll-mt-4"
    >
      <h3 className="text-meta font-medium text-text-muted">
        {collapsible ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={listId}
            onClick={onToggle}
            className="flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            {label}
            <ChevronDown
              className={cn(
                "ml-auto size-4 transition-transform duration-(--duration-fast) ease-(--ease-ui) motion-reduce:transition-none",
                !collapsed && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="flex min-h-8 items-center gap-2 px-2">{label}</span>
        )}
      </h3>
      <Unfold open={!collapsed}>
        <div id={listId}>
          {count === 0 ? (
            <p className="px-2 py-1 text-ui text-text-muted">{meta.emptyLabel}</p>
          ) : (
            <ul data-section={zone.id} className="space-y-0.5">
              {visible.map((row: TaskRowModel) => (
                <li key={row.key} data-flip-id={row.key}>
                  <CommandTaskRow
                    row={row}
                    now={now}
                    assignees={assigneesByTaskId.get(row.id) ?? []}
                    actions={actions}
                    selected={selectedKey === row.key}
                    active={activeKey === row.key}
                    request={request?.key === row.key ? request : null}
                  />
                </li>
              ))}
              {remaining > 0 ? (
                <li>
                  {moze ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1"
                      onClick={() => setDodato((value) => value + 1)}
                    >
                      Prikaži još {formatNumber(Math.min(remaining, sledecaGranicaZone(limit, limiti) - limit))}
                    </Button>
                  ) : (
                    <Button
                      variant="link"
                      size="sm"
                      className="ml-1"
                      render={<ProjekatLink href={SVI_ZADACI} />}
                      nativeButton={false}
                    >
                      Još {formatNumber(remaining)} na Zadacima
                    </Button>
                  )}
                </li>
              ) : null}
            </ul>
          )}
        </div>
      </Unfold>
    </div>
  );
}

/**
 * Opcije filtera člana: članovi tima, pa „Nedodeljeno" kad ga ima. Isti skup
 * koristi blok Tim.
 */
export function filterOptionsOf(
  members: ReadonlyArray<TriageMember>,
  hasUnassigned: boolean,
): Array<{ key: string; name: string }> {
  const options = members.map((member) => ({ key: member.profileId, name: member.displayName }));
  return hasUnassigned ? [...options, { key: UNASSIGNED_KEY, name: "Nedodeljeno" }] : options;
}

/** Kontejner Trijaže: tri pretplate, zone sa redovima, „Sredi rokove". */
export function TriageBlock({
  memberFilter,
  onMemberFilter,
}: {
  memberFilter: WorkloadFilter;
  onMemberFilter: (key: WorkloadFilter) => void;
}) {
  const retry = useBlockRetry();
  const data = useTriageData();
  const rowsContext = useCommandRows();
  const { now, profileId, isManager, workspace, commands, limiti } = rowsContext;
  const [openZones, setOpenZones] = useState<ReadonlySet<CommandCenterZoneId>>(DEFAULT_OPEN_ZONES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const rescheduleRef = useRef<HTMLButtonElement>(null);
  // Flip radi `FlipGroup` sam (snimak pre commit-a), pa „Sredi rokove" ne snima ništa.
  const { busy, apply } = useReschedule({ now, beforeApply: () => {} });

  const ready = data.status === "ready" ? data : null;
  const tasks = ready?.tasks;
  const assigneeMap = ready?.assigneesByTaskId;
  const visibleTasks = useMemo(
    () => (tasks === undefined ? [] : filterByMember(tasks, memberFilter, assigneeMap ?? new Map())),
    [tasks, memberFilter, assigneeMap],
  );
  const zones = useMemo<CommandCenterZone[]>(
    () =>
      ready === null
        ? []
        : buildZones(visibleTasks, {
            now,
            profileId,
            workspace,
            areaLabels: rowsContext.areaLabels,
            assigneesByTaskId: ready.assigneesByTaskId,
            plannedKeys: commands.plannedKeys,
            holds: commands.holds,
            pending: commands.pending,
            isManager,
          }),
    [ready, visibleTasks, now, profileId, isManager, workspace, rowsContext.areaLabels, commands.plannedKeys, commands.holds, commands.pending],
  );
  useRegisterSections("trijaza", zones);
  useJaviBroj("otvorenihUTimu", ready === null ? undefined : ready.tasks.length);

  // „Sredi rokove" radi nad onim što je na ekranu: uz filter člana samo njegovi zadaci (isto kao na telefonu).
  const candidates = useMemo(() => rescheduleCandidates(visibleTasks, now), [visibleTasks, now]);
  // Kad se lista isprazni dijalog se zatvara i ne sme sam da iskoči kad prekoračenih opet bude.
  if (dialogOpen && ready !== null && candidates.length === 0) setDialogOpen(false);
  const hasUnassigned = useMemo(
    () => (tasks ?? []).some((task) => (assigneeMap?.get(task._id) ?? []).length === 0),
    [tasks, assigneeMap],
  );
  const emptyMap = useMemo(() => new Map<string, CommandCenterAssignee[]>(), []);

  return (
    <>
      <TriageView
        status={data.status}
        onRetry={retry}
        now={now}
        zones={zones}
        assigneesByTaskId={assigneeMap ?? emptyMap}
        totalOpen={tasks?.length ?? 0}
        filteredTotal={visibleTasks.length}
        hasMore={ready?.hasMore ?? false}
        filterOptions={filterOptionsOf(ready?.members ?? [], hasUnassigned)}
        memberFilter={memberFilter}
        onMemberFilter={onMemberFilter}
        overdueCount={candidates.length}
        onReschedule={() => setDialogOpen(true)}
        rescheduleRef={rescheduleRef}
        openZones={openZones}
        onToggleZone={(id) =>
          setOpenZones((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        limiti={limiti}
        actions={commands.actions}
        selectedKey={commands.selectedKey}
        activeKey={commands.activeKey}
        request={commands.request}
      />
      <RescheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        candidates={candidates}
        busy={busy}
        returnFocusRef={rescheduleRef}
        fallbackFocusId="cc-trijaza"
        onApply={(target, ids) => {
          void apply(target, ids);
        }}
      />
    </>
  );
}
