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
import { PAGE_KIND_META, type PageKind } from "@/lib/prostor/web/vrste-stranica";
import type { CreatePageTarget, StartupWithAreas } from "@/lib/prostor/rute";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { useProjekatMutation } from "@/components/app/projekat-provider";
import { useProjekatQueryTolerant } from "@/components/app/prostor/podaci/projekat";

/**
 * Vrste koje dijalog već pravi. Tabela i fajl dobijaju svoja polja (uvoz,
 * prilozi) sa modulima tabela i priloga, a zadatak sa brzim unosom zadataka;
 * dotle se ne nude, da u izboru ne stoji vrsta koja se ne može otvoriti.
 * Zaglavlje oblasti čita isti spisak („Nova stranica“).
 */
export const VRSTE_NOVE_STRANICE: ReadonlyArray<PageKind> = ["note"];

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
 */
export function CreatePageDialog({
  open,
  onOpenChange,
  workspace,
  target,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: StartupWithAreas;
  target?: CreatePageTarget;
  onCreated: (pageId: Id<"pages">) => void;
}) {
  const createPage = useProjekatMutation(api.prostor.areasV2.createPage);
  const archivePage = useProjekatMutation(api.prostor.areasV2.archivePage);
  // Tolerantno: pokvaren roditelj ne sme da sruši dijalog za kreiranje.
  const targetParent = useProjekatQueryTolerant(
    api.prostor.pages.get,
    open && target?.parentPageId ? { pageId: target.parentPageId } : "skip",
  );
  const fallbackAreaId = workspace.areas[0]?._id;
  const kind: PageKind =
    target?.initialKind && VRSTE_NOVE_STRANICE.includes(target.initialKind)
      ? target.initialKind
      : "note";
  const [title, setTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [areaId, setAreaId] = useState<Id<"areas"> | undefined>(target?.areaId ?? fallbackAreaId);
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
        ? `${PAGE_KIND_META[kind].label} je kreirana u oblasti i čeka odobrenje autora ciljne stranice.`
        : `${PAGE_KIND_META[kind].label} je kreirana.`,
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
    try {
      const result = await createPage({
        areaId,
        rootPageId: target?.parentPageId ?? null,
        kind,
        title: title.trim(),
        content: kind === "note" ? noteContent : "",
      });
      showCreatedToast(result.pageId, result.nestingStatus === "pending");
      onOpenChange(false);
      onCreated(result.pageId);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Stranica nije kreirana."));
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
            <DialogTitle>Nova stranica</DialogTitle>
            <DialogDescription>
              {target?.parentPageId
                ? targetParent && !targetParent.permissions.canEdit
                  ? "Stranica nastaje na vrhu oblasti."
                  : "Biće ugnežđena unutar izabrane stranice."
                : `Dodaješ sadržaj u ${selectedArea?.label ?? "oblast"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
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
                onValueChange={(value) => setAreaId(value as Id<"areas">)}
                disabled={Boolean(target?.areaId)}
                options={workspace.areas.map((area) => ({ value: area._id, label: area.label }))}
                className="w-full"
              />
            </div>
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
              Kreiraj
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
