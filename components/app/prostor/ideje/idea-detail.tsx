"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/idea-detail.tsx (main @ c05c40f), SPAJANJE S13.
import { useId, type ReactNode } from "react";
import { ArrowUpRight, History, Lightbulb, MoreHorizontal, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  IDEA_CONVERTED_REASON,
  IDEA_STAGE_CHANGE_REASON,
  IDEA_STAGE_LABELS,
  IDEA_STORED_STAGES,
  type IdeaStoredStage,
} from "@/lib/prostor";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { IdeaStageBadge, IdeaVoteButtons, type IdeaActions } from "@/components/app/prostor/ideje/idea-parts";
import {
  convertHint,
  IDEA_TEXT_MAX,
  IDEA_TITLE_MAX,
  ideaAuthorLine,
  ideaSaveStateText,
  ideaTitle,
  type IdeaModel,
  type IdeaSaveState,
} from "@/lib/prostor/modeli/ideas-model";

/**
 * Zaglavlje fioke: faza kao oznaka, Istorija izmena i „…" (Obriši). Diskusiju
 * u Porukama donosi modul poruka; do tada meni nudi samo radnje koje rade.
 */
export function IdeaDetailHeader({
  idea,
  onOpenHistory,
  onArchive,
}: {
  idea: IdeaModel;
  onOpenHistory: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <IdeaStageBadge stage={idea.stage} />
      <span className="flex-1" />
      <Button type="button" variant="ghost" size="sm" onClick={onOpenHistory}>
        <History aria-hidden="true" /> Istorija
      </Button>
      {idea.permissions.canArchive ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Još radnji za ideju" />}
          >
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={onArchive}>
              <Trash2 aria-hidden="true" /> Obriši
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/**
 * Detalj ideje (PROSTOR P16, K07 §5.9) — prezentacija: naslov i tekst menja
 * svaki član (čuva se sam), autor, Za/Protiv, faza (izbor samo kome je
 * dozvoljeno, inače razlog), „Pretvori u zadatak ili belešku" (samo u fazi
 * „Odobreno" i samo kome je dozvoljeno) i Komentari (`comments`).
 */
export function IdeaDetail({
  idea,
  now,
  draft,
  saveState,
  saveError,
  onDraftChange,
  onDraftBlur,
  onRetrySave,
  actions,
  onOpenConverted,
  comments,
}: {
  idea: IdeaModel;
  now: number;
  draft: { title: string; text: string };
  saveState: IdeaSaveState;
  saveError: string | null;
  onDraftChange: (patch: Partial<{ title: string; text: string }>) => void;
  onDraftBlur: () => void;
  onRetrySave: () => void;
  actions: Pick<IdeaActions, "onVote" | "onSetStage" | "onConvert">;
  onOpenConverted: (pageId: Id<"pages">) => void;
  comments: ReactNode;
}) {
  const titleId = useId();
  const textId = useId();
  const stageId = useId();
  const editable = idea.permissions.canEdit;
  const convert = convertHint(idea);
  const problem = saveState === "error" || saveState === "invalid";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor={titleId} className="sr-only">
          Naslov ideje
        </label>
        <input
          id={titleId}
          value={draft.title}
          readOnly={!editable}
          maxLength={IDEA_TITLE_MAX}
          placeholder="Naslov ideje"
          aria-invalid={saveState === "invalid" && !draft.title.trim() ? true : undefined}
          onChange={(event) => onDraftChange({ title: event.target.value })}
          onBlur={onDraftBlur}
          className="-mx-1 w-[calc(100%+0.5rem)] rounded-md bg-transparent px-1 py-0.5 text-title text-foreground outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-ring"
        />
        <label htmlFor={textId} className="sr-only">
          Tekst ideje
        </label>
        <Textarea
          id={textId}
          value={draft.text}
          readOnly={!editable}
          maxLength={IDEA_TEXT_MAX}
          placeholder="Šta predlažeš i zašto?"
          aria-invalid={saveState === "invalid" && !draft.text.trim() ? true : undefined}
          onChange={(event) => onDraftChange({ text: event.target.value })}
          onBlur={onDraftBlur}
          className="field-sizing-content max-h-[50vh] min-h-20 resize-none border-transparent bg-transparent px-1 text-copy shadow-none hover:border-line focus-visible:border-ring"
        />
        <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1 text-meta text-text-muted">
          <span>{ideaAuthorLine(idea, now)}</span>
          {saveState !== "saved" ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={cn(problem && "text-danger")}>{ideaSaveStateText(saveState, saveError)}</span>
            </>
          ) : null}
          {saveState === "error" ? (
            <Button type="button" variant="link" size="sm" className="h-6 px-0 text-meta" onClick={onRetrySave}>
              <RefreshCw aria-hidden="true" /> Pokušaj ponovo
            </Button>
          ) : null}
          {/* Čitaču ekrana se najavljuje samo problem, ne svako čuvanje. */}
          <span role="alert" className="sr-only">
            {problem ? ideaSaveStateText(saveState, saveError) : ""}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 text-ui">
        <dt className="pt-2 text-meta text-text-muted">Glasovi</dt>
        <dd>
          <IdeaVoteButtons idea={idea} size="md" onVote={(vote) => actions.onVote(idea, vote)} />
        </dd>
        <dt className="pt-2 text-meta text-text-muted">
          {idea.permissions.canSetStage ? <label htmlFor={stageId}>Faza</label> : "Faza"}
        </dt>
        <dd>
          {idea.permissions.canSetStage ? (
            <Select<IdeaStoredStage>
              id={stageId}
              label="Faza"
              value={idea.storedStage}
              onValueChange={(stage) => actions.onSetStage(idea, stage)}
              options={IDEA_STORED_STAGES.map((stage) => ({ value: stage, label: IDEA_STAGE_LABELS[stage] }))}
              className="w-48"
            />
          ) : (
            <div className="space-y-1 pt-1.5">
              <p>{IDEA_STAGE_LABELS[idea.stage]}</p>
              <p className="text-meta text-text-muted">
                {idea.convertedPageId !== null ? IDEA_CONVERTED_REASON : IDEA_STAGE_CHANGE_REASON}
              </p>
            </div>
          )}
        </dd>
        {idea.convertedPageId !== null ? (
          <>
            <dt className="pt-1.5 text-meta text-text-muted">Rezultat</dt>
            <dd>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0 py-1"
                onClick={() => onOpenConverted(idea.convertedPageId as Id<"pages">)}
              >
                {IDEA_STAGE_LABELS.postalo_zadatak} <ArrowUpRight aria-hidden="true" />
              </Button>
            </dd>
          </>
        ) : null}
      </dl>

      {convert.kind === "button" ? (
        <Button variant="secondary" type="button" onClick={() => actions.onConvert(idea)}>
          <Sparkles aria-hidden="true" /> Pretvori u zadatak ili belešku
        </Button>
      ) : convert.kind === "hint" ? (
        <p className="text-meta text-text-muted">{convert.text}</p>
      ) : null}

      {comments}
    </div>
  );
}

export function IdeaDetailSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje ideje" className="space-y-4">
      <Skeleton className="h-7 w-3/4" />
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-9 w-48" />
    </div>
  );
}

/** Lista ideja nije stigla (greška servera ili veze). */
export function IdeaDetailError({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-line px-6 py-8 text-center">
      <h2 className="text-ui font-semibold">Ideja nije učitana.</h2>
      <Button type="button" variant="outline" className="mt-4" onClick={retry}>
        <RefreshCw aria-hidden="true" /> Pokušaj ponovo
      </Button>
    </div>
  );
}

/** Ideja ne postoji u ovom projektu (obrisana u Korpu ili tuđ link). */
export function IdeaDetailMissing({ onOpenTrash, onClose }: { onOpenTrash: () => void; onClose: () => void }) {
  return (
    <EmptyState
      icon={Lightbulb}
      headingAs="h2"
      title="Ideja više nije ovde."
      description="Možda je u Korpi ili pripada drugom projektu."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" onClick={onOpenTrash}>
            Otvori Korpu
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Zatvori
          </Button>
        </div>
      }
    />
  );
}

/** Naslov fioke za čitač ekrana. */
export function ideaDrawerTitle(idea: IdeaModel | null): string {
  return idea ? ideaTitle(idea) : "Ideja";
}
