"use client";

// Preneto iz Devotion apps/web/components/me/task-panel/personal-task-panel-view.tsx (main @ c05c40f), SPAJANJE S12.
import { useId, useLayoutEffect, useRef, useState, type Ref } from "react";
import { ArrowRightLeft, Trash2 } from "lucide-react";
import type { TaskPriorityKey } from "@/lib/prostor";

import { AnimatedCheck } from "@/components/motion/animated-check";
import { ProjekatStavkeProvider, useProjekat, useProjekatMutation } from "@/components/app/projekat-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";

import { ProjekatCip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { DueMetaChip, PanelSection, PanelTitle, PlanToggle, PriorityChip } from "@/components/app/prostor/zadaci/panel/panel-parts";

/** Najviše znakova beleške (server `PERSONAL_TASK_NOTES_MAX`). */
export const PANEL_NOTES_MAX = 5_000;
/** Brojač se pojavljuje blizu granice (plan K07 §1.4: od 4 500). */
const NOTES_COUNTER_FROM = 4_500;

const ALLOWED = { allowed: true, reason: null } as const;

/** Projekat u koji se lični zadatak može prebaciti: znak, ime i oblasti. */
export type MoveTargetStartup = {
  _id: string;
  name: string;
  logoUrl: string | null;
  /** `workspaces.brend.boja` (identitet projekta); bez nje znak ima podrazumevanu boju. */
  boja?: string | null;
  areas: ReadonlyArray<{ _id: string; label: string }>;
};

export type PersonalTaskPanelChange = {
  title?: string;
  notes?: string | null;
  priority?: TaskPriorityKey | null;
  dueDate?: number | null;
};

export type PersonalTaskPanelViewProps = {
  now: number;
  task: {
    title: string;
    notes: string | null;
    status: "open" | "done";
    priority: TaskPriorityKey | null;
    dueDate: number | null;
  };
  planned: boolean;
  workspaces: ReadonlyArray<MoveTargetStartup>;
  /** Lični zadatak koji korak „Prebaci u projekat" prebacuje (`personalTasks.moveToStartup`). */
  personalTaskId: Id<"personalTasks">;
  onChange: (change: PersonalTaskPanelChange) => void;
  onToggleDone: (done: boolean) => void;
  onTogglePlan: () => void;
  /**
   * Zadatak je prebačen: ciljni projekat i nova stranica zadatka. Poziv ide u
   * koraku (projektna mutacija ciljnog projekta); zatvaranje panela i toast
   * su posao kontejnera. Greška ostaje u koraku.
   */
  onMoved: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
  onArchive: () => void;
  /** Izlog: korak prebacivanja već otvoren, sa izabranim projektom. */
  initialMove?: { workspaceId: string; areaId: string | null } | null;
  titleRef?: Ref<HTMLElement>;
};

/** Zaglavlje ličnog zadatka: „Lično", kvačica i naslov (uvek uređiv). */
export function PersonalTaskPanelHeader({
  task,
  onChange,
  onToggleDone,
  titleRef,
}: Pick<PersonalTaskPanelViewProps, "task" | "onChange" | "onToggleDone" | "titleRef">) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="flex items-center gap-1.5 text-meta text-muted-foreground">
        <ProjekatCip workspace={null} size="xs" />
        Lično
      </p>
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center">
          <AnimatedCheck checked={task.status === "done"} onCheckedChange={onToggleDone} label={`Završi: ${task.title}`} />
        </span>
        <div className="min-w-0 flex-1">
          <PanelTitle value={task.title} editable onCommit={(title) => onChange({ title })} titleRef={titleRef} />
        </div>
      </div>
    </div>
  );
}

/**
 * Panel ličnog zadatka (plan K07 §1.4): rok i prioritet, „Dodaj u Moj dan",
 * beleška (čuva na blur), „Prebaci u projekat" (korak u mestu) i „Obriši"
 * (arhiva sa „Poništi").
 */
export function PersonalTaskPanelView({
  now,
  task,
  planned,
  workspaces,
  personalTaskId,
  onChange,
  onTogglePlan,
  onMoved,
  onArchive,
  initialMove = null,
}: PersonalTaskPanelViewProps) {
  const [moving, setMoving] = useState(initialMove !== null);
  // Posle „Otkaži" fokus se vraća na „Prebaci u projekat" (dugme je bilo sklonjeno).
  const moveButtonRef = useRef<HTMLButtonElement>(null);
  const refocusMove = useRef(false);
  useLayoutEffect(() => {
    if (!refocusMove.current || moving) return;
    refocusMove.current = false;
    moveButtonRef.current?.focus({ preventScroll: true });
  }, [moving]);
  const moveBlocked =
    task.status === "done"
      ? "Završen zadatak se ne prebacuje u projekat."
      : workspaces.length === 0
        ? "Još nisi ni u jednom projektu."
        : null;
  const moveReasonId = useId();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <DueMetaChip value={task.dueDate} now={now} perm={ALLOWED} onChange={(dueDate) => onChange({ dueDate })} />
        <PriorityChip value={task.priority} perm={ALLOWED} allowNone onChange={(priority) => onChange({ priority })} />
        <PlanToggle planned={planned} onToggle={onTogglePlan} />
      </div>

      <NotesSection value={task.notes} onSave={(notes) => onChange({ notes })} />

      {moving ? (
        <MoveToStartupStep
          title={task.title}
          personalTaskId={personalTaskId}
          workspaces={workspaces}
          initial={initialMove}
          onCancel={() => {
            refocusMove.current = true;
            setMoving(false);
          }}
          onMoved={onMoved}
        />
      ) : (
        <div className="space-y-2 border-t border-line pt-4">
          <div className="flex flex-wrap gap-2">
            {/* E15: onemogućeno je `aria-disabled` sa vidljivim razlogom, ne `disabled`. */}
            <Button
              ref={moveButtonRef}
              type="button"
              variant="outline"
              size="lg"
              className="rounded-full px-3 aria-disabled:cursor-not-allowed aria-disabled:text-muted-foreground"
              aria-disabled={moveBlocked ? true : undefined}
              aria-describedby={moveBlocked ? moveReasonId : undefined}
              onClick={() => {
                if (!moveBlocked) setMoving(true);
              }}
            >
              <ArrowRightLeft aria-hidden="true" />
              Prebaci u projekat
            </Button>
            <Button type="button" variant="destructive" size="lg" className="rounded-full px-3" onClick={onArchive}>
              <Trash2 aria-hidden="true" />
              Obriši
            </Button>
          </div>
          {moveBlocked ? (
            <p id={moveReasonId} className="text-meta text-muted-foreground">
              {moveBlocked}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function NotesSection({ value, onSave }: { value: string | null; onSave: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!focused) setDraft(value ?? "");
  }
  return (
    <PanelSection
      title="Beleška"
      aside={
        draft.length >= NOTES_COUNTER_FROM ? (
          <span className="text-meta tabular-nums text-muted-foreground">
            {draft.length}/{PANEL_NOTES_MAX}
          </span>
        ) : null
      }
    >
      <Textarea
        value={draft}
        maxLength={PANEL_NOTES_MAX}
        aria-label="Beleška"
        placeholder="Dodaj belešku…"
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          setFocused(false);
          const next = draft.trim() ? draft : null;
          if ((next ?? null) !== (value ?? null)) onSave(next);
        }}
        className="min-h-28 leading-6"
      />
    </PanelSection>
  );
}

/**
 * „Prebaci u projekat" (D12): projekat → oblast → potvrda. Bez „Poništi":
 * zadatak postaje stranica u projektu i dodeljuje se tebi.
 *
 * `personalTasks.moveToStartup` je projektna mutacija CILJNOG projekta (onog
 * koji korisnik bira ovde), pa dugme „Prebaci" živi ispod
 * `ProjekatStavkeProvider`-a izabranog projekta (S07 D14).
 */
export function MoveToStartupStep({
  title,
  personalTaskId,
  workspaces,
  initial,
  onCancel,
  onMoved,
}: {
  title: string;
  personalTaskId: Id<"personalTasks">;
  workspaces: ReadonlyArray<MoveTargetStartup>;
  initial: { workspaceId: string; areaId: string | null } | null;
  onCancel: () => void;
  onMoved: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
}) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(initial?.workspaceId ?? null);
  const workspace = workspaces.find((item) => item._id === workspaceId) ?? null;
  const [areaId, setAreaId] = useState<string | null>(initial?.areaId ?? workspace?.areas[0]?._id ?? null);
  const area = workspace?.areas.find((item) => item._id === areaId) ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();
  // Dugme koje je otvorilo korak nestaje: fokus ide na prvi izbor.
  const fieldsRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    fieldsRef.current?.querySelector<HTMLElement>('[data-slot="select-trigger"]')?.focus({ preventScroll: true });
  }, []);

  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t border-line pt-4">
      <h3 id={headingId} className="text-ui font-semibold text-foreground">
        Prebaci u projekat
      </h3>
      <div ref={fieldsRef} className="grid gap-3 sm:grid-cols-2">
        <Select<string>
          label="Projekat"
          showLabel
          value={workspaceId}
          onValueChange={(next) => {
            setWorkspaceId(next);
            setAreaId(workspaces.find((item) => item._id === next)?.areas[0]?._id ?? null);
            setError(null);
          }}
          options={workspaces.map((item) => ({ value: item._id, label: item.name }))}
          placeholder="Izaberi projekat"
          disabled={busy}
          renderOption={(option) => {
            const item = workspaces.find((candidate) => candidate._id === option.value);
            return (
              <span className="flex min-w-0 items-center gap-2">
                {item ? <ProjekatCip workspace={item} size="xs" /> : null}
                <span className="min-w-0 truncate">{option.label}</span>
              </span>
            );
          }}
        />
        <Select<string>
          label="Oblast"
          showLabel
          value={areaId}
          onValueChange={(next) => {
            setAreaId(next);
            setError(null);
          }}
          options={(workspace?.areas ?? []).map((item) => ({ value: item._id, label: item.label }))}
          placeholder="Izaberi oblast"
          disabled={busy || !workspace || workspace.areas.length === 0}
        />
      </div>
      {workspace && workspace.areas.length === 0 ? (
        <p role="status" className="text-ui leading-6 text-muted-foreground">
          Ovaj projekat još nema oblasti — dodaj ih u projektu.
        </p>
      ) : null}
      {workspace && area ? (
        <p className="text-ui leading-6 text-muted-foreground">
          Zadatak „{title}“ prelazi u {workspace.name} · {area.label} i dodeljuje se tebi. Ovo ne može da se poništi.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-ui text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Otkaži
        </Button>
        {workspace && area ? (
          <ProjekatStavkeProvider workspaceId={workspace._id as Id<"workspaces">}>
            <MoveSubmit
              personalTaskId={personalTaskId}
              workspaceId={workspace._id as Id<"workspaces">}
              areaId={area._id as Id<"areas">}
              busy={busy}
              onStart={() => {
                setBusy(true);
                setError(null);
              }}
              onFail={(message) => {
                setError(message);
                setBusy(false);
              }}
              onMoved={onMoved}
            />
          </ProjekatStavkeProvider>
        ) : (
          <Button type="button" variant="primary" disabled>
            <ArrowRightLeft aria-hidden="true" />
            Prebaci
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * Dugme „Prebaci": zove `personalTasks.moveToStartup` nad projektom koji
 * `ProjekatStavkeProvider` iznad njega nosi, pa `workspaceId` ne ide u argumente.
 * Na uspeh busy ostaje uključen (kontejner zatvara panel); na grešku ostaje u koraku.
 */
function MoveSubmit({
  personalTaskId,
  workspaceId,
  areaId,
  busy,
  onStart,
  onFail,
  onMoved,
}: {
  personalTaskId: Id<"personalTasks">;
  workspaceId: Id<"workspaces">;
  areaId: Id<"areas">;
  busy: boolean;
  onStart: () => void;
  onFail: (message: string) => void;
  onMoved: (workspaceId: Id<"workspaces">, pageId: Id<"pages">) => void;
}) {
  const { spreman } = useProjekat();
  const move = useProjekatMutation(api.prostor.personalTasks.moveToStartup);
  const submit = async () => {
    if (busy) return;
    onStart();
    try {
      const { pageId } = await move({ personalTaskId, areaId });
      onMoved(workspaceId, pageId);
    } catch (cause) {
      onFail(accessErrorMessage(cause, "Zadatak nije prebačen. Pokušaj ponovo."));
    }
  };
  return (
    <Button type="button" variant="primary" loading={busy} disabled={!spreman} onClick={() => void submit()}>
      {busy ? null : <ArrowRightLeft aria-hidden="true" />}
      Prebaci
    </Button>
  );
}
