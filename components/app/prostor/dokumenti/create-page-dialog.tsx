"use client";

// Preneto iz Devotion apps/web/components/workspace/create-page-dialog.tsx (main @ c05c40f), SPAJANJE S10.
import { useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { toast } from "@/lib/toast";

import { RichTextEditor } from "@/components/app/prostor/editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PAGE_KIND_META, type PageKind } from "@/lib/prostor/web/vrste-stranica";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { defaultTaskDraft, taskCreateFields, type TaskCreateDraft } from "@/lib/prostor";
import { readLastArea, rememberLastArea } from "@/lib/prostor/web/poslednja-oblast";
import { opisVeze } from "@/lib/prostor/web/veze-zadatka";
import { TaskQuickCreate } from "@/components/app/prostor/zadaci/task-quick-create";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useProjekatMutation, useProjekatQuery } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";

/**
 * Vrste koje dijalog pravi (redosled kao Devotion `PAGE_KIND_KEYS`). Zaglavlje
 * oblasti čita isti spisak („Nova stranica“).
 */
export const VRSTE_NOVE_STRANICE: ReadonlyArray<PageKind> = ["note", "task", "table", "file"];

/** Tabela i fajlovi se pune na samoj stranici, odmah posle kreiranja. */
const POSLE_KREIRANJA: Partial<Record<PageKind, string>> = {
  table: "Posle kreiranja dodaješ kolone i redove ili uvoziš Excel ili CSV.",
  file: "Posle kreiranja prevlačiš ili biraš fajlove na stranici.",
};

const TITLE_PLACEHOLDER: Record<PageKind, string> = {
  note: "Naslov beleške…",
  task: "Šta treba uraditi?",
  file: "Naziv stranice sa fajlovima…",
  table: "Naziv tabele…",
};

/**
 * Nova stranica (PROSTOR P4, K07 §5.4): naslov, oblast i telo beleške. Pod
 * stranicom (`target.parentPageId`) ugnežđuje se odmah ili čeka odobrenje
 * autora roditelja; uspeh ima „Poništi“ (Korpa).
 *
 * Zadatak (brzo pravljenje, K17): naslov prvi i Enter pravi zadatak; status,
 * prioritet, rok, izvršioci i oblast su čipovi sa podrazumevanim vrednostima
 * (`defaultTaskDraft`: oblast zadata → poslednja u projektu → prva), a
 * instrukcije i koraci su iza „Više opcija“. Zadatak se ne otvara sam: pojavi
 * se u listi, a sledeći kreće od iste oblasti.
 *
 * Zadatak sa vezom (S23, `target.veza`): sa profila firme, iz komentara bez
 * odgovora ili iz stavke „Čeka te“. Dijalog tada pravi samo zadatak
 * (`prostor.veze.noviZadatak`), sa predloženim naslovom i instrukcijama.
 */
export function CreatePageDialog({
  open,
  onOpenChange,
  workspace,
  profileId,
  target,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: StartupWithAreas;
  /** Prijavljen član: podrazumevani izvršilac novog zadatka. */
  profileId: Id<"profiles"> | null;
  target?: CreatePageTarget;
  onCreated: (pageId: Id<"pages">) => void;
}) {
  const { now } = useToday();
  const createPage = useProjekatMutation(api.prostor.areasV2.createPage);
  const noviZadatak = useProjekatMutation(api.prostor.veze.noviZadatak);
  const veza = target?.veza;
  const archivePage = useProjekatMutation(api.prostor.areasV2.archivePage);
  // Tolerantno: pokvaren roditelj ne sme da sruši dijalog za kreiranje.
  const targetParent = useProjekatQueryTolerant(
    api.prostor.pages.get,
    open && target?.parentPageId ? { pageId: target.parentPageId } : "skip",
  );
  const fallbackAreaId = workspace.areas[0]?._id;
  const [kind, setKind] = useState<PageKind>(
    veza
      ? "task"
      : target?.initialKind && VRSTE_NOVE_STRANICE.includes(target.initialKind)
        ? target.initialKind
        : "note",
  );
  // Članovi za čip „Izvršioci“ (samo dok je dijalog otvoren).
  const members = useProjekatQuery(api.prostor.projekat.listMembers, open ? { limit: 50 } : "skip");
  const [taskDraft, setTaskDraft] = useState<TaskCreateDraft>(() => {
    const draft = defaultTaskDraft({
      profileId: profileId ?? "",
      areas: workspace.areas,
      presetAreaId: target?.areaId ?? null,
      rememberedAreaId: readLastArea(workspace._id),
    });
    const saVezom = veza?.instrukcije ? { ...draft, instructions: veza.instrukcije } : draft;
    return profileId ? saVezom : { ...saVezom, assigneeProfileIds: [] };
  });
  // Predložene instrukcije (tekst komentara) se vide odmah, ne iza „Više opcija“.
  const [moreOpen, setMoreOpen] = useState(Boolean(veza?.instrukcije));
  // Oblast koju je korisnik sam izabrao se ne pregazi pri promeni vrste.
  const [areaTouched, setAreaTouched] = useState(false);
  const [title, setTitle] = useState(veza?.naslov ?? "");
  const [noteContent, setNoteContent] = useState("");
  const [areaId, setAreaId] = useState<Id<"areas"> | undefined>(
    target?.areaId ??
      (kind === "task" ? ((taskDraft.areaId as Id<"areas"> | null) ?? fallbackAreaId) : fallbackAreaId),
  );
  const [submitting, setSubmitting] = useState(false);

  const selectedArea = useMemo(
    () => workspace.areas.find((area) => area._id === areaId),
    [areaId, workspace.areas],
  );
  const KindIcon = PAGE_KIND_META[kind].icon;

  /** Toast uspeha sa „Poništi“ — kreiranje je izmena u bazi, pa ima put nazad. */
  function showCreatedToast(pageId: Id<"pages">, pending: boolean) {
    toast.success(
      pending
        ? "Stranica je kreirana u oblasti i čeka odobrenje autora ciljne stranice."
        : kind === "task"
          ? "Zadatak je napravljen."
          : "Stranica je kreirana.",
      {
        duration: 8_000,
        action: {
          label: "Poništi",
          onClick: () => {
            void archivePage({ pageId })
              .then(() => toast.info("Kreiranje je poništeno."))
              .catch((error: unknown) =>
                toast.error(accessErrorMessage(error, "Poništavanje nije uspelo.")),
              );
          },
        },
      },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!areaId || title.trim().length === 0 || submitting) return;
    setSubmitting(true);
    if (veza) {
      try {
        const pageId = await noviZadatak({
          areaId,
          title: title.trim(),
          ...taskFieldsForCreate(taskDraft),
          ...(veza.firma ? { leadCompanyId: veza.firma.id as Id<"leadCompanies"> } : {}),
          ...(veza.izvor ? { izvor: veza.izvor } : {}),
        });
        showCreatedToast(pageId, false);
        onOpenChange(false);
        rememberLastArea(workspace._id, areaId);
      } catch (error) {
        toast.error(accessErrorMessage(error, "Zadatak nije napravljen."));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    try {
      const result = await createPage({
        areaId,
        rootPageId: target?.parentPageId ?? null,
        kind,
        title: title.trim(),
        content: kind === "note" ? noteContent : "",
        ...(kind === "task" ? taskFieldsForCreate(taskDraft) : {}),
      });
      showCreatedToast(result.pageId, result.nestingStatus === "pending");
      onOpenChange(false);
      if (kind === "task") {
        // Sledeći zadatak u ovom projektu kreće od iste oblasti (kao brzi unos).
        rememberLastArea(workspace._id, areaId);
      } else {
        onCreated(result.pageId);
      }
    } catch (error) {
      toast.error(accessErrorMessage(error, kind === "task" ? "Zadatak nije napravljen." : "Stranica nije kreirana."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Dok traje kreiranje, zatvaranje bi ostavilo posao bez nadzora.
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogPopup className="flex max-h-[min(90dvh,56rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={submit}>
          <DialogHeader className="border-b border-line-soft px-5 py-5 pr-14 sm:px-6 sm:pr-16">
            <DialogTitle>{kind === "task" ? "Novi zadatak" : "Nova stranica"}</DialogTitle>
            <DialogDescription>
              {veza
                ? opisVeze(veza)
                : target?.parentPageId
                ? targetParent && !targetParent.permissions.canEdit
                  ? "Stranica nastaje na vrhu oblasti."
                  : "Biće ugnežđena unutar izabrane stranice."
                : `Dodaješ sadržaj u ${selectedArea?.label ?? "oblast"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            {veza ? null : (
            <div className="rounded-lg border border-line bg-card p-0.5">
              <ToggleGroup
                value={[kind]}
                onValueChange={(value) => {
                  const next = value[0] as PageKind | undefined;
                  if (!next) return;
                  setKind(next);
                  // „Zadatak“: oblast po pravilu brzog pravljenja (zadata → poslednja
                  // u projektu → prva), ako je korisnik nije sam menjao.
                  if (next === "task" && !target?.areaId && !areaTouched && taskDraft.areaId) {
                    setAreaId(taskDraft.areaId as Id<"areas">);
                  }
                }}
                spacing={0}
                aria-label="Vrsta stranice"
                className="grid w-full grid-cols-2 sm:grid-cols-4"
              >
                {VRSTE_NOVE_STRANICE.map((value) => {
                  const Icon = PAGE_KIND_META[value].icon;
                  return (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="cursor-pointer rounded-md! text-text-secondary data-pressed:bg-surface-control-hover data-pressed:text-foreground"
                    >
                      <Icon aria-hidden="true" />
                      {PAGE_KIND_META[value].label}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
            </div>
            )}
            {kind === "task" ? (
              <TaskQuickCreate
                now={now}
                profileId={profileId ?? ""}
                title={title}
                onTitleChange={setTitle}
                draft={{ ...taskDraft, areaId: areaId ?? null }}
                onDraftChange={(patch) => {
                  if (patch.areaId !== undefined && patch.areaId !== null) {
                    setAreaTouched(true);
                    setAreaId(patch.areaId as Id<"areas">);
                  }
                  setTaskDraft((current) => ({ ...current, ...patch }));
                }}
                areas={workspace.areas}
                areaLocked={Boolean(target?.areaId)}
                members={members?.map(({ profile }) => ({
                  _id: profile._id,
                  displayName: profile.displayName,
                  avatarUrl: profile.avatarUrl,
                }))}
                moreOpen={moreOpen}
                onMoreOpenChange={setMoreOpen}
                onDenied={(reason) => toast.info(reason)}
                disabled={submitting}
              />
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="new-page-title">Naslov</Label>
                  <Input
                    id="new-page-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={TITLE_PLACEHOLDER[kind]}
                    maxLength={200}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-page-area">Oblast</Label>
                  <Select
                    id="new-page-area"
                    label="Oblast"
                    value={areaId ?? null}
                    onValueChange={(value) => {
                      setAreaTouched(true);
                      setAreaId(value as Id<"areas">);
                    }}
                    disabled={Boolean(target?.areaId)}
                    options={workspace.areas.map((area) => ({ value: area._id, label: area.label }))}
                    className="w-full"
                  />
                </div>
              </>
            )}
            {kind === "note" ? (
              <div className="space-y-2">
                <Label>Sadržaj beleške</Label>
                <div className="min-h-[16rem] rounded-xl border border-line-soft bg-card p-3">
                  <RichTextEditor
                    content={noteContent}
                    documentKey="new-note-dialog"
                    placeholder="Zapiši detalje beleške ovde…"
                    onChange={({ html }) => setNoteContent(html)}
                  />
                </div>
              </div>
            ) : POSLE_KREIRANJA[kind] ? (
              <p className="text-ui text-text-secondary">{POSLE_KREIRANJA[kind]}</p>
            ) : null}
          </div>
          <DialogFooter className="shrink-0 border-t border-line-soft px-5 py-4 sm:px-6">
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => onOpenChange(false)}>
              Otkaži
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={submitting || !areaId || title.trim().length === 0}
            >
              {submitting ? <LoaderCircle className="animate-spin" /> : <KindIcon className="size-4" />}
              {kind === "task" ? "Napravi zadatak" : "Kreiraj"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

/** Polja zadatka za `areasV2.createPage` (`taskCreateFields`; ID-jevi su iz `projekat.listMembers`). */
function taskFieldsForCreate(draft: TaskCreateDraft) {
  const { assigneeProfileIds, ...fields } = taskCreateFields(draft);
  return {
    ...fields,
    ...(assigneeProfileIds ? { assigneeProfileIds: assigneeProfileIds as Array<Id<"profiles">> } : {}),
  };
}
