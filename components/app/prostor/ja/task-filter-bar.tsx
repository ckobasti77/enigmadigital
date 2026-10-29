"use client";

// Preneto iz Devotion apps/web/components/me/tasks/task-filter-bar.tsx (main @ c05c40f), SPAJANJE S16.
import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ChevronDown, ListFilter, Search, X } from "lucide-react";
import {
  activeFilterCount,
  clearTaskFilters,
  DUE_BUCKET_LABELS,
  hasActiveFilters,
  PERSONAL_FILTER_KEY,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_FILTER_DUE,
  TASK_FILTER_PRIORITIES,
  TASK_FILTER_STATUSES,
  TASK_GROUP_BY_OPTIONS,
  toggleFilterValue,
  type TaskFilters,
  type TaskGroupBy,
} from "@/lib/prostor";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CountBadge } from "@/components/app/system/count-badge";
import { cn } from "@/lib/utils";

import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import type { MyTasksWorkspace } from "@/components/app/prostor/ja/my-tasks-view";

type Option = { value: string; label: string; leading?: ReactNode };

function filterOptions(workspaces: ReadonlyArray<MyTasksWorkspace>) {
  return {
    workspace: [
      { value: PERSONAL_FILTER_KEY, label: "Lično", leading: <StartupChip workspace={null} size="xs" /> },
      ...workspaces.map((workspace) => ({
        value: workspace._id,
        label: workspace.name,
        leading: <StartupChip workspace={workspace} size="xs" />,
      })),
    ] satisfies Option[],
    status: TASK_FILTER_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })) satisfies Option[],
    priority: TASK_FILTER_PRIORITIES.map((priority) => ({
      value: priority,
      label: priority === "none" ? "Bez prioriteta" : PRIORITY_LABELS[priority],
    })) satisfies Option[],
    due: TASK_FILTER_DUE.map((bucket) => ({ value: bucket, label: DUE_BUCKET_LABELS[bucket] })) satisfies Option[],
  };
}

type Category = { id: "startup" | "status" | "priority" | "due"; label: string; values: string[]; options: Option[] };

function categories(filters: TaskFilters, workspaces: ReadonlyArray<MyTasksWorkspace>): Category[] {
  const options = filterOptions(workspaces);
  return [
    { id: "startup", label: "Projekat", values: filters.workspaceIds, options: options.workspace },
    { id: "status", label: "Status", values: filters.statuses, options: options.status },
    { id: "priority", label: "Prioritet", values: filters.priorities, options: options.priority },
    { id: "due", label: "Rok", values: filters.due, options: options.due },
  ];
}

function toggled(filters: TaskFilters, category: Category["id"], value: string): TaskFilters {
  switch (category) {
    case "startup":
      return { ...filters, workspaceIds: toggleFilterValue(filters.workspaceIds, value) };
    case "status":
      return { ...filters, statuses: toggleFilterValue(filters.statuses, value as TaskFilters["statuses"][number]) };
    case "priority":
      return { ...filters, priorities: toggleFilterValue(filters.priorities, value as TaskFilters["priorities"][number]) };
    case "due":
      return { ...filters, due: toggleFilterValue(filters.due, value as TaskFilters["due"][number]) };
  }
}

export type TaskFilterBarProps = {
  filters: TaskFilters;
  workspaces: ReadonlyArray<MyTasksWorkspace>;
  onChange: (filters: TaskFilters) => void;
  groupBy: TaskGroupBy;
  onGroupByChange: (groupBy: TaskGroupBy) => void;
  searchRef: RefObject<HTMLInputElement | null>;
};

/**
 * Traka filtera Mojih zadataka (plan K07 §1.3): pretraga, Projekat / Status /
 * Prioritet / Rok (meni sa čekiranjem, ostaje otvoren dok biraš), „Očisti
 * filtere", grupisanje i „Prikaži završene". Ispod `md` filteri su jedno
 * dugme „Filteri (n)" koje otvara fioku odozdo, a grupisanje je izbor.
 * Aktivan filter je neutralno istaknut (boja radnje nije stanje izbora).
 */
export function TaskFilterBar({ filters, workspaces, onChange, groupBy, onGroupByChange, searchRef }: TaskFilterBarProps) {
  const groups = categories(filters, workspaces);
  const count = activeFilterCount(filters);
  const showDoneId = useId();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
        <SearchField
          value={filters.query}
          onChange={(query) => onChange({ ...filters, query })}
          inputRef={searchRef}
        />
        <div className="hidden flex-wrap items-center gap-1.5 md:flex">
          {groups.map((category) => (
            <FilterMenu
              key={category.id}
              category={category}
              onToggle={(value) => onChange(toggled(filters, category.id, value))}
            />
          ))}
          {hasActiveFilters(filters) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange(clearTaskFilters(filters));
                // Dugme nestaje: fokus na pretragu.
                searchRef.current?.focus();
              }}
            >
              <X aria-hidden="true" />
              Očisti filtere
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 md:hidden">
          <FilterSheet groups={groups} count={count} filters={filters} onChange={onChange} />
          <Select
            label="Grupiši"
            value={groupBy}
            onValueChange={(value) => onGroupByChange(value)}
            options={TASK_GROUP_BY_OPTIONS.map((option) => ({ value: option.value, label: `Grupiši: ${option.label}` }))}
            className="flex-1"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <GroupByToggle value={groupBy} onChange={onGroupByChange} />
        <label
          htmlFor={showDoneId}
          className="ml-auto flex min-h-9 cursor-pointer items-center gap-2 text-ui text-text-secondary pointer-coarse:min-h-11"
        >
          <Switch
            id={showDoneId}
            checked={filters.showDone}
            onCheckedChange={(showDone) => onChange({ ...filters, showDone })}
          />
          Prikaži završene
        </label>
      </div>
    </div>
  );
}

/** Grupisanje kao radio grupa (WAI-ARIA): jedno Tab mesto, strelice i Home/End biraju. */
function GroupByToggle({ value, onChange }: { value: TaskGroupBy; onChange: (value: TaskGroupBy) => void }) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TASK_GROUP_BY_OPTIONS.length - 1;
    const next =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % TASK_GROUP_BY_OPTIONS.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + TASK_GROUP_BY_OPTIONS.length) % TASK_GROUP_BY_OPTIONS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(TASK_GROUP_BY_OPTIONS[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="hidden items-center gap-2 md:flex">
      <span id={labelId} className="text-meta text-text-muted">
        Grupiši
      </span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5"
      >
        {TASK_GROUP_BY_OPTIONS.map((option, index) => {
          const checked = value === option.value;
          return (
            <button
              key={option.value}
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
                "inline-flex h-8 cursor-pointer items-center rounded-md px-2.5 text-ui font-medium text-text-muted outline-none transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                checked && "bg-surface-raised text-foreground shadow-elev-1",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  return (
    <div className="relative min-w-0 md:w-72">
      <label htmlFor={id} className="sr-only">
        Pretraži zadatke
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          // Prvi Esc briše upit, drugi izlazi iz polja (prečice liste opet rade).
          if (value) onChange("");
          else event.currentTarget.blur();
        }}
        placeholder="Pretraži zadatke…"
        className="h-9 pl-8 pr-10 pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Obriši pretragu"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            className="size-7 text-text-muted"
          >
            <X aria-hidden="true" />
          </Button>
        ) : (
          <span aria-hidden="true" className="mr-1 hidden md:pointer-fine:inline-flex">
            <Kbd>/</Kbd>
          </span>
        )}
      </span>
    </div>
  );
}

function FilterMenu({ category, onToggle }: { category: Category; onToggle: (value: string) => void }) {
  const active = category.values.length;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={active > 0 ? `${category.label}, izabrano: ${active}` : category.label}
            className={cn(active > 0 && "border-line-strong bg-surface-control-hover text-foreground")}
          />
        }
      >
        {category.label}
        <CountBadge count={active} />
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{category.label}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {category.options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={category.values.includes(option.value)}
            onCheckedChange={() => onToggle(option.value)}
            className="gap-2"
          >
            {option.leading}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterSheet({
  groups,
  count,
  filters,
  onChange,
}: {
  groups: Category[];
  count: number;
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Filteri, aktivno: ${count}` : "Filteri"}
      >
        <ListFilter aria-hidden="true" />
        Filteri
        <CountBadge count={count} />
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        strana="dole"
        title="Filteri"
        description="Izbor važi odmah."
        footer={
          hasActiveFilters(filters) ? (
            <Button type="button" variant="ghost" onClick={() => onChange(clearTaskFilters(filters))}>
              <X aria-hidden="true" />
              Očisti filtere
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-5">
          {groups.map((category) => (
            <fieldset key={category.id} className="space-y-1.5">
              <legend className="text-meta font-medium text-text-muted">{category.label}</legend>
              <div className="flex flex-wrap gap-1.5">
                {category.options.map((option) => {
                  const checked = category.values.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => onChange(toggled(filters, category.id, option.value))}
                      className={cn(
                        "inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-ui transition-colors duration-(--duration-fast) ease-(--ease-ui) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        checked
                          ? "border-line-strong bg-surface-control-hover text-foreground"
                          : "border-line bg-surface text-text-secondary",
                      )}
                    >
                      {option.leading}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </Drawer>
    </>
  );
}
