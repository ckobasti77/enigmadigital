"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/startup-task-panel-view.tsx (main @ c05c40f), SPAJANJE S12.
import { useState, type ReactNode, type Ref } from "react";
import { CircleDot, LogIn, LogOut, Users } from "lucide-react";
import { STATUS_LABELS, type TaskPermissions, type TaskPriorityKey, type TaskStatusKey, type WorkspaceMini } from "@/lib/prostor";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";

import { MetaChip } from "@/components/app/prostor/zadaci/meta-chip";
import { ProjekatCip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { PanelSection, PanelTitle } from "@/components/app/prostor/zadaci/panel/panel-parts";

export type StartupTaskStatus = Exclude<TaskStatusKey, "open">;

export const STARTUP_STATUSES: ReadonlyArray<StartupTaskStatus> = ["backlog", "next", "in_progress", "blocked", "done"];

/** Najviše izvršilaca (isto kao `MAX_TASK_ASSIGNEES` na serveru). */
export const PANEL_MAX_ASSIGNEES = 10;

/** Najviše znakova instrukcija (server `MAX_TASK_INSTRUCTIONS_LENGTH`). */
export const PANEL_INSTRUCTIONS_MAX = 20_000;

export type PanelPerson = { _id: string; displayName: string; avatarUrl: string | null };

export type StartupTaskPanelChange = {
  status?: StartupTaskStatus;
  priority?: TaskPriorityKey;
  dueDate?: number | null;
  assigneeProfileIds?: string[];
  instructions?: string | null;
};

/** Podaci zadatka koje prikazuju zaglavlje panela i raspored (`TaskDetailLayout`). */
export type StartupTaskView = {
  title: string;
  status: StartupTaskStatus;
  priority: TaskPriorityKey | null;
  dueDate: number | null;
  instructions: string | null;
  /** `boja` je `workspaces.brend.boja` (identitet projekta); bez nje znak ima podrazumevanu boju. */
  workspace: WorkspaceMini & { boja?: string | null };
  areaLabel: string | null;
};

export type StartupTaskPanelHeaderProps = {
  task: StartupTaskView;
  /** Naslov menja svaki član kad zadatak nije zaključan (`pages.update`). */
  canEditTitle: boolean;
  onRename: (title: string) => void;
  titleRef?: Ref<HTMLElement>;
};

/** Zaglavlje panela zadatka u projektu: čip projekta · oblast, pa naslov. */
export function StartupTaskPanelHeader({ task, canEditTitle, onRename, titleRef }: StartupTaskPanelHeaderProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex min-w-0 items-center gap-1.5 text-meta text-muted-foreground">
        <ProjekatCip workspace={task.workspace} size="xs" />
        <span className="truncate">
          {task.workspace.name}
          {task.areaLabel ? ` · ${task.areaLabel}` : ""}
        </span>
      </p>
      <PanelTitle value={task.title} editable={canEditTitle} onCommit={onRename} titleRef={titleRef} />
    </div>
  );
}

/** Čip statusa sa menijem (panel, puna strana zadatka, brzo pravljenje). */
export function StatusChip({
  value,
  perm,
  onChange,
  onDenied,
}: {
  value: StartupTaskStatus;
  perm: TaskPermissions["status"];
  onChange: (status: StartupTaskStatus) => void;
  onDenied?: (reason: string) => void;
}) {
  return (
    <MetaChip label="Status" value={STATUS_LABELS[value]} icon={CircleDot} perm={perm} onDenied={onDenied}>
      {(trigger) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={value} onValueChange={(status: string) => onChange(status as StartupTaskStatus)}>
                {STARTUP_STATUSES.map((status) => (
                  <DropdownMenuRadioItem key={status} value={status} closeOnClick>
                    {STATUS_LABELS[status]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MetaChip>
  );
}

/** Čip izvršilaca: svaki član bira članove; na zaključanom zadatku samo „Priključi se" / „Napusti zadatak". */
export function AssigneesChip({
  assignees,
  members,
  selfOnly,
  reason,
  isSelfAssigned,
  onChange,
  onJoin,
  onLeave,
}: {
  assignees: PanelPerson[];
  members: PanelPerson[] | undefined | "error";
  selfOnly: boolean;
  reason: string | null;
  isSelfAssigned: boolean;
  onChange: (profileIds: string[]) => void;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const value = assignees.length === 0 ? "Niko" : String(assignees.length);
  const selected = assignees.map((person) => person._id);
  const atLimit = selected.length >= PANEL_MAX_ASSIGNEES;
  return (
    <MetaChip label="Izvršioci" value={value} icon={Users} perm={{ allowed: true, reason: null }}>
      {(trigger) => (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent align="start" className="max-h-80 w-[min(18rem,calc(100vw-2rem))] overflow-y-auto">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Izvršioci</DropdownMenuLabel>
              {selfOnly ? (
                <>
                  {assignees.length === 0 ? (
                    <p className="px-2 py-1.5 text-ui text-muted-foreground">Niko još nije dodeljen.</p>
                  ) : (
                    assignees.map((person) => (
                      <div key={person._id} className="flex items-center gap-2 px-2 py-1.5 text-ui">
                        <ProfileAvatar profile={person} className="size-6" />
                        <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                      </div>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <p className="px-2 py-1 text-meta text-muted-foreground">{reason}</p>
                  <DropdownMenuItem onClick={isSelfAssigned ? onLeave : onJoin}>
                    {isSelfAssigned ? <LogOut aria-hidden="true" /> : <LogIn aria-hidden="true" />}
                    {isSelfAssigned ? "Napusti zadatak" : "Priključi se"}
                  </DropdownMenuItem>
                </>
              ) : members === undefined ? (
                <p role="status" className="px-2 py-1.5 text-ui text-muted-foreground">
                  Učitavanje članova…
                </p>
              ) : members === "error" ? (
                <p role="alert" className="px-2 py-1.5 text-ui text-danger">
                  Članovi nisu učitani. Zatvori i ponovo otvori ovaj prikaz.
                </p>
              ) : (
                members.map((person) => {
                  const checked = selected.includes(person._id);
                  return (
                    <DropdownMenuCheckboxItem
                      key={person._id}
                      checked={checked}
                      disabled={!checked && atLimit}
                      closeOnClick={false}
                      onCheckedChange={() =>
                        onChange(checked ? selected.filter((id) => id !== person._id) : [...selected, person._id])
                      }
                      className="gap-2"
                    >
                      <ProfileAvatar profile={person} className="size-6" />
                      <span className="min-w-0 flex-1 truncate">{person.displayName}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </MetaChip>
  );
}

/** Stanje čuvanja instrukcija (strana ga prati kroz `task-instructions-draft`, panel ga ne prikazuje). */
export type InstructionsSaveState = "saved" | "dirty" | "saving" | "error";

const INSTRUCTIONS_STATE_TEXT: Record<Exclude<InstructionsSaveState, "saved">, string> = {
  saving: "Čuvam instrukcije…",
  dirty: "Instrukcije imaju nesačuvane izmene.",
  error: "Instrukcije nisu sačuvane.",
};

/**
 * Instrukcije zadatka — kontrolisano polje koje dele panel i puna strana. Menja
 * ga svaki član dok zadatak nije zaključan (P1); inače je tekst sa bravom i
 * razlogom. Čuvanje na blur (`onCommit`); `saveState` je samo za pun prikaz.
 */
export function InstructionsSection({
  value,
  onValueChange,
  onFocus,
  onCommit,
  editable,
  lockedReason,
  onDenied,
  saveState,
  onRetry,
  aside,
  headingAs,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onFocus?: () => void;
  onCommit: () => void;
  editable: boolean;
  lockedReason: string | null;
  onDenied: (reason: string) => void;
  saveState?: InstructionsSaveState;
  onRetry?: () => void;
  /** Radnja uz naslov sekcije (npr. „Istorija izmena"). */
  aside?: ReactNode;
  headingAs?: "h2" | "h3";
}) {
  const near = value.length >= PANEL_INSTRUCTIONS_MAX - 500;
  const state = saveState && saveState !== "saved" ? saveState : null;

  return (
    <PanelSection
      title="Instrukcije"
      as={headingAs}
      lockedReason={lockedReason}
      onDenied={onDenied}
      aside={
        <span className="flex items-center gap-2">
          {editable && near ? (
            <span className="text-meta tabular-nums text-muted-foreground">
              {value.length}/{PANEL_INSTRUCTIONS_MAX}
            </span>
          ) : null}
          {aside}
        </span>
      }
    >
      {editable ? (
        <Textarea
          value={value}
          maxLength={PANEL_INSTRUCTIONS_MAX}
          aria-label="Instrukcije zadatka"
          placeholder="Dodaj instrukcije…"
          onFocus={onFocus}
          onChange={(event) => onValueChange(event.target.value)}
          onBlur={onCommit}
          className="min-h-24 leading-6"
        />
      ) : value ? (
        <p className="whitespace-pre-wrap break-words text-ui leading-6 text-foreground">{value}</p>
      ) : (
        <p className="text-ui text-muted-foreground">Nema instrukcija.</p>
      )}
      {saveState !== undefined ? (
        <div className="flex items-center justify-between gap-3 text-meta text-muted-foreground">
          <span className={state === "error" ? "text-danger" : undefined}>{state ? INSTRUCTIONS_STATE_TEXT[state] : ""}</span>
          {/* Najavljuje se samo greška (kao „Sačuvano" u zaglavlju dokumenta), ne svaka pauza u kucanju. */}
          <span role="status" className="sr-only">
            {state === "error" ? INSTRUCTIONS_STATE_TEXT.error : ""}
          </span>
          {state === "error" && onRetry ? (
            <Button type="button" variant="ghost" size="sm" className="text-meta" onClick={onRetry}>
              Pokušaj ponovo
            </Button>
          ) : null}
        </div>
      ) : null}
    </PanelSection>
  );
}

/**
 * Instrukcije u panelu: lokalni nacrt koji prati server dok polje nije u
 * fokusu; blur čuva (`tasks.updateMetadata` bez revizije).
 */
export function PanelInstructions({
  value,
  editable,
  lockedReason,
  onDenied,
  onSave,
}: {
  value: string | null;
  editable: boolean;
  lockedReason: string | null;
  onDenied: (reason: string) => void;
  onSave: (value: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setDraft(value ?? "");
  }
  return (
    <InstructionsSection
      value={draft}
      onValueChange={setDraft}
      onFocus={() => setFocused(true)}
      onCommit={() => {
        setFocused(false);
        const next = draft.trim() ? draft : null;
        if ((next ?? null) !== (value ?? null)) onSave(next);
      }}
      editable={editable}
      lockedReason={lockedReason}
      onDenied={onDenied}
    />
  );
}
