"use client";

// Preneto iz Devotion apps/web/components/me/tasks/my-tasks-view.tsx (main @ c05c40f), SPAJANJE S16.
import { useLayoutEffect, useRef, useState, type FocusEvent, type RefObject } from "react";
import { CheckSquare2, Plus, RefreshCw, SearchX } from "lucide-react";
import {
  clearTaskFilters,
  enterKey,
  openTasksPhrase,
  pageOfGroup,
  PERSONAL_FILTER_KEY,
  TASKS_GROUP_PAGE,
  type TaskFilters,
  type TaskGroupBy,
  type WorkspaceMini,
} from "@/lib/prostor";

import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { FlipGroup } from "@/components/motion/flip-group";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { RowRequest } from "@/lib/prostor/precice/lista-zadataka";
import { formatNumber } from "@/lib/format";

import { TaskSection } from "@/components/app/prostor/zadaci/section-header";
import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { TaskRow, type TaskRowActions } from "@/components/app/prostor/zadaci/task-row";
import { TASKS_FLIP_MAX_ROWS, type MyTasksModel } from "@/lib/prostor/modeli/my-tasks-model";
import { MyTasksSkeleton } from "@/components/app/prostor/ja/my-tasks-skeleton";
import { TaskFilterBar } from "@/components/app/prostor/ja/task-filter-bar";

export type MyTasksViewState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; model: MyTasksModel };

/** Projekat u filteru i zaglavlju grupe; `boja` je identitet projekta. */
export type MyTasksWorkspace = WorkspaceMini & { boja?: string | null };

export type MyTasksViewProps = {
  now: number;
  state: MyTasksViewState;
  workspaces: ReadonlyArray<MyTasksWorkspace>;
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (groupBy: TaskGroupBy) => void;
  actions?: TaskRowActions;
  onQuickAdd: () => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Opseg za Flip i prečice liste. */
  listRef?: RefObject<HTMLDivElement | null>;
  selectedKey?: string | null;
  /** Red čiji je panel otvoren. */
  activeKey?: string | null;
  request?: RowRequest | null;
  onListFocus?: (event: FocusEvent<HTMLElement>) => void;
  announcement?: string;
};

/**
 * Moji zadaci (K11, plan K07 §1.3): svi projekti + lično, filteri,
 * grupisanje, pretraga i „Prikaži završene". Radnje u redu su iste kao u
 * Moj dan; red otvara panel zadatka. Prezentacija: podaci i radnje kroz props.
 * Filteri žive u memoriji prikaza — adresa `/moji-zadaci` ostaje čista (D10).
 *
 * Promena filtera i grupisanja seli redove kroz `FlipGroup` (snimak pre
 * commit-a); kucanje u pretrazi je nov skup, bez pokreta. Lista se ne
 * animira pri učitavanju (radni ekran).
 */
export function MyTasksView({
  now,
  state,
  workspaces,
  filters,
  onFiltersChange,
  groupBy,
  onGroupByChange,
  actions,
  onQuickAdd,
  searchRef,
  listRef,
  selectedKey = null,
  activeKey = null,
  request = null,
  onListFocus,
  announcement = "",
}: MyTasksViewProps) {
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;
  // „Prikaži još N" po grupi; nov izbor filtera/grupisanja kreće od 100.
  const pagingKey = enterKey("", filters, groupBy) + filters.query;
  const [paging, setPaging] = useState<{ key: string; shown: Record<string, number> }>({ key: pagingKey, shown: {} });
  const shown = paging.key === pagingKey ? paging.shown : {};
  const startupById = new Map(workspaces.map((workspace) => [workspace._id, workspace] as const));

  const model = state.status === "ready" ? state.model : null;
  // „Prikaži još" može da nestane sa fokusom: fokus ide na prvi novi red.
  const focusKey = useRef<string | null>(null);
  // Bez niza zavisnosti: posle commit-a koji je prikazao nove redove.
  useLayoutEffect(() => {
    const key = focusKey.current;
    if (key === null) return;
    focusKey.current = null;
    scopeRef.current
      ?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(key)}"] [data-row-focus]`)
      ?.focus({ preventScroll: true });
  });
  const cappedNote = model?.capped ? (
    <p className="px-2 text-meta text-text-muted">
      Prikazano je prvih {formatNumber(model.loadedCount)}. Suzi filter za ostatak.
    </p>
  ) : null;
  // Potpis rasporeda: ključevi redova po grupama (kvačica, rok, filter pomeraju red).
  const layoutKey = (model?.groups ?? [])
    .map((group) => `${group.key}:${group.rows.map((row) => row.key).join(",")}`)
    .join("|");

  return (
    <div className="flex w-full flex-col gap-5 pb-16">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <PageHeader
        variant="module"
        title="Moji zadaci"
        description={`Svi projekti i lično${model ? ` · ${openTasksPhrase(model.openCount)}` : ""}`}
        actions={
          <Button variant="primary" type="button" onClick={onQuickAdd}>
            <Plus aria-hidden="true" />
            Brzi unos
            <span aria-hidden="true" className="ml-1 hidden md:pointer-fine:inline-flex">
              <Kbd>Q</Kbd>
            </span>
          </Button>
        }
      />

      <TaskFilterBar
        filters={filters}
        workspaces={workspaces}
        onChange={onFiltersChange}
        groupBy={groupBy}
        onGroupByChange={onGroupByChange}
        searchRef={searchRef}
      />

      <FlipGroup
        scope={scopeRef}
        layoutKey={layoutKey}
        resetKey={filters.query}
        disabled={(model?.visibleCount ?? 0) > TASKS_FLIP_MAX_ROWS}
      >
        <div ref={scopeRef} onFocus={onListFocus} className="space-y-5">
          {state.status === "loading" ? (
            <MyTasksSkeleton />
          ) : state.status === "error" ? (
            <EmptyState
              headingAs="h2"
              icon={RefreshCw}
              title="Zadaci se ne mogu učitati."
              description="Proveri vezu i pokušaj ponovo."
              action={
                <Button type="button" variant="outline" onClick={state.retry}>
                  <RefreshCw aria-hidden="true" />
                  Pokušaj ponovo
                </Button>
              }
            />
          ) : !state.model.hasAny ? (
            <EmptyState
              headingAs="h2"
              icon={CheckSquare2}
              title="Nemaš otvorenih zadataka."
              description="Kad ti neko dodeli zadatak ili dodaš lični, biće ovde."
              action={
                <Button type="button" variant="outline" onClick={onQuickAdd}>
                  <Plus aria-hidden="true" />
                  Brzi unos
                </Button>
              }
            />
          ) : state.model.visibleCount === 0 ? (
            <>
              <EmptyState
                headingAs="h2"
                icon={SearchX}
                title="Nijedan zadatak ne odgovara filterima."
                description="Promeni ili očisti filtere."
                action={
                  <Button type="button" variant="outline" onClick={() => onFiltersChange(clearTaskFilters(filters))}>
                    Očisti filtere
                  </Button>
                }
              />
              {cappedNote}
            </>
          ) : (
            <>
              <div
                aria-hidden="true"
                className="hidden items-center gap-2 border-b border-line px-2 pb-1.5 text-meta font-medium text-text-muted xl:flex"
              >
                {/* Iste širine kao red: kvačica 32 · naslov · (projekat 144) · oblast 120 · status 96 · rok 104 · prioritet 88 · radnje 100. */}
                <span className="w-8 shrink-0" />
                <span className="flex flex-1 items-center gap-3">
                  <span className="flex-1">Zadatak</span>
                  <span className="flex shrink-0">
                    {groupBy === "startup" ? null : <span className="w-[9rem]">Projekat</span>}
                    <span className="w-[120px]">Oblast</span>
                    {groupBy === "status" ? null : <span className="w-24">Status</span>}
                    <span className="w-[104px]">Rok</span>
                    <span className="w-[88px]">Prioritet</span>
                  </span>
                </span>
                <span className="w-[100px] shrink-0" />
              </div>
              {state.model.groups.map((group) => {
                const limit = shown[group.key] ?? TASKS_GROUP_PAGE;
                const { visible, remaining } = pageOfGroup(group.rows, limit);
                const workspace =
                  groupBy === "startup"
                    ? group.key === PERSONAL_FILTER_KEY
                      ? null
                      : (startupById.get(group.key) ?? group.rows[0]?.workspace ?? null)
                    : undefined;
                return (
                  <TaskSection
                    key={group.key}
                    title={group.title}
                    count={group.rows.length}
                    tone={group.key === "overdue" ? "danger" : "default"}
                    leading={workspace !== undefined ? <StartupChip workspace={workspace} size="sm" /> : undefined}
                  >
                    <ul data-section={group.key} className="space-y-0.5">
                      {visible.map((row) => (
                        <li key={row.key} data-flip-id={row.key}>
                          <TaskRow
                            row={row}
                            now={now}
                            actions={actions}
                            canOpen
                            columns
                            showStartup={groupBy !== "startup"}
                            showStatus={groupBy !== "status"}
                            selected={selectedKey === row.key}
                            active={activeKey === row.key}
                            request={request?.key === row.key ? request : null}
                          />
                        </li>
                      ))}
                    </ul>
                    {remaining > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-1"
                        onClick={() => {
                          setPaging({ key: pagingKey, shown: { ...shown, [group.key]: limit + TASKS_GROUP_PAGE } });
                          focusKey.current = group.rows[limit]?.key ?? null;
                        }}
                      >
                        Prikaži još {formatNumber(Math.min(remaining, TASKS_GROUP_PAGE))}
                      </Button>
                    ) : null}
                  </TaskSection>
                );
              })}
              {cappedNote}
            </>
          )}
        </div>
      </FlipGroup>
    </div>
  );
}
