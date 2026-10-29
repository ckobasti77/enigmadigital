"use client";

// Preneto iz Devotion apps/web/components/me/quick-add/quick-add-container.tsx (main @ c05c40f), SPAJANJE S16.
import { useMemo } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { toast } from "@/lib/toast";
import {
  quickAddCall,
  quickAddNoteCall,
  quickAddNoteSuccessMessage,
  quickAddSuccessMessage,
  type QuickAddDraft,
  type QuickAddKind,
  type QuickAddNoteDraft,
} from "@/lib/prostor/quick-add";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { readLastArea, readStoredDestination, rememberDestination } from "@/lib/prostor/web/poslednja-oblast";
import type { Today } from "@/lib/prostor/web/danas";

import { QuickAddDialog, type QuickAddStartupOption } from "@/components/app/prostor/ja/brzi-unos/quick-add-dialog";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import {
  PoProjektu,
  PROJEKAT_NIJE_SPREMAN,
  usePrijaviRadnje,
  useRegistarPoProjektu,
  type RegistarPoProjektu,
} from "@/components/app/prostor/podaci/po-projektu";

export type QuickAddContainerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  today: Today;
  profileId: Id<"profiles">;
  workspaces: ReadonlyArray<{
    _id: Id<"workspaces">;
    name: string;
    logoUrl: string | null;
    boja?: string | null;
    areas: ReadonlyArray<{ _id: Id<"areas">; label: string }>;
  }>;
  preset?: { workspaceId: Id<"workspaces">; areaId?: Id<"areas"> | null } | null;
  /** Početna vrsta unosa; iz Beleški se otvara kao Beleška. */
  initialKind?: QuickAddKind;
};

/** Toast „Poništi" traje 8 s (plan K07 E6). */
const UNDO_MS = 8_000;

type CreatePageArgs = Omit<FunctionArgs<typeof api.prostor.pages.create>, "workspaceId">;

/** Projektne radnje brzog unosa (D14): nov zadatak i „Poništi" u projektu odredišta. */
type RadnjeOdredista = {
  createPage: (args: CreatePageArgs) => Promise<Id<"pages">>;
  archivePage: (args: { pageId: Id<"pages"> }) => Promise<unknown>;
};

/** Prijavljivač ispod `ProjekatStavkeProvider`-a projekta odredišta. */
function RadnjeOdredistaProjekta({
  workspaceId,
  registar,
}: {
  workspaceId: Id<"workspaces">;
  registar: RegistarPoProjektu<RadnjeOdredista>;
}) {
  const createPage = useProjekatMutation(api.prostor.pages.create);
  const archivePage = useProjekatMutation(api.prostor.areasV2.archivePage);
  const radnje = useMemo<RadnjeOdredista>(() => ({ createPage, archivePage }), [createPage, archivePage]);
  usePrijaviRadnje(registar, workspaceId, radnje);
  return null;
}

/**
 * Brzi unos — tanak kontejner (plan K07 E16): lični zadatak kroz
 * `personalTasks.create({ addToMyDay })` („Poništi" = `personalTasks.archive`),
 * zadatak u projektu kroz `pages.create` (task, backlog, ja izvršilac) pa
 * `myDay.plan` ako je čekirano („Poništi" = `areasV2.archivePage`).
 *
 * Odredište se bira u dijalogu, pa za svaki moj projekat stoji
 * `ProjekatStavkeProvider` sa prijavljivačem (`PoProjektu`, D14): zadatak se
 * pravi mutacijom projekta odredišta, bez ručnog `workspaceId`-a.
 *
 * Toast ima jednu radnju (`lib/toast`): „Poništi". Devotion je uz nju nudio i
 * „Otvori"; zadatak se otvara iz Mojih zadataka ili projekta (ODLUKA S16).
 */
export function QuickAddContainer({
  open,
  onOpenChange,
  today,
  profileId,
  workspaces,
  preset,
  initialKind,
}: QuickAddContainerProps) {
  const createPersonal = useMutation(api.prostor.personalTasks.create);
  const archivePersonal = useMutation(api.prostor.personalTasks.archive);
  const odredista = useRegistarPoProjektu<RadnjeOdredista>();
  const plan = useMutation(api.prostor.myDay.plan);
  const createNote = useMutation(api.prostor.thoughts.createNote);
  const archiveNotes = useMutation(api.prostor.thoughts.archiveNodes);

  const options = useMemo<QuickAddStartupOption[]>(
    () =>
      workspaces.map((workspace) => ({
        _id: workspace._id,
        name: workspace.name,
        logoUrl: workspace.logoUrl,
        boja: workspace.boja ?? null,
        areas: workspace.areas.map((area) => ({ _id: area._id, label: area.label })),
      })),
    [workspaces],
  );
  const projekti = useMemo(() => workspaces.map((workspace) => workspace._id), [workspaces]);

  const submit = async (draft: QuickAddDraft) => {
    const call = quickAddCall(draft, { profileId, dayKey: today.dayKey });
    if (call.fn === "invalid") throw new Error(call.reason ?? "Unesi naslov zadatka.");
    const message = quickAddSuccessMessage(draft.destination, options);
    try {
      if (call.fn === "personalTasks.create") {
        const personalTaskId = await createPersonal(call.args);
        rememberDestination(draft.destination);
        toast.success(message, {
          duration: UNDO_MS,
          action: {
            label: "Poništi",
            onClick: () => {
              void archivePersonal({ personalTaskId })
                .then(() => toast.info("Unos je poništen."))
                .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
            },
          },
        });
        return;
      }
      const radnje = odredista.uzmi(call.args.workspaceId);
      if (!radnje) throw new Error(PROJEKAT_NIJE_SPREMAN);
      // Id-jevi su prošli kroz deljen nacrt kao stringovi; potiču iz `projekat.listForCurrent`.
      const { workspaceId: _projekat, ...args } = call.args;
      void _projekat;
      const pageId = await radnje.createPage({
        ...args,
        areaId: call.args.areaId as Id<"areas">,
        assigneeProfileIds: [profileId],
      });
      rememberDestination(draft.destination);
      if (call.planDayKey !== null) {
        try {
          await plan({ dayKey: call.planDayKey, ref: { kind: "task", taskPageId: pageId } });
        } catch (error) {
          toast.error(accessErrorMessage(error, "Plan nije sačuvan."));
        }
      }
      toast.success(message, {
        duration: UNDO_MS,
        action: {
          label: "Poništi",
          onClick: () => {
            void radnje
              .archivePage({ pageId })
              .then(() => toast.info("Unos je poništen."))
              .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
          },
        },
      });
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Zadatak nije dodat. Pokušaj ponovo."));
    }
  };

  /** Beleška (P7, K18): thoughts.createNote; „Poništi" arhivira, „Otvori" vodi u Beleške. */
  const submitNote = async (draft: QuickAddNoteDraft) => {
    const call = quickAddNoteCall(draft);
    if (call.fn === "invalid") throw new Error(call.reason ?? "Unesi tekst beleške.");
    const message = quickAddNoteSuccessMessage(draft.destination, options);
    try {
      const noteId = await createNote({
        workspaceId: call.args.workspaceId as Id<"workspaces"> | null,
        text: call.args.text,
      });
      toast.success(message, {
        duration: UNDO_MS,
        action: {
          label: "Poništi",
          onClick: () => {
            void archiveNotes({ nodeIds: [noteId] })
              .then(() => toast.info("Unos je poništen."))
              .catch((error: unknown) => toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")));
          },
        },
      });
    } catch (error) {
      throw new Error(accessErrorMessage(error, "Beleška nije sačuvana. Pokušaj ponovo."));
    }
  };

  return (
    <>
      <PoProjektu workspaceIds={projekti}>
        {(workspaceId) => <RadnjeOdredistaProjekta workspaceId={workspaceId} registar={odredista} />}
      </PoProjektu>
      <QuickAddDialog
      open={open}
      onOpenChange={onOpenChange}
      now={today.now}
      workspaces={options}
      preset={preset}
      readStored={readStoredDestination}
      rememberedArea={readLastArea}
      onSubmit={submit}
      onSubmitNote={submitNote}
      initialKind={initialKind}
    />
    </>
  );
}
