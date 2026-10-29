"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/idea-parts.tsx (main @ c05c40f), SPAJANJE S13.
import { ArrowUpRight, MessageSquare, MoreHorizontal, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import {
  IDEA_CONVERTED_REASON,
  IDEA_STAGE_LABELS,
  type IdeaStage,
  type IdeaStoredStage,
} from "@/lib/prostor/idea-stages";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Id } from "@/convex/_generated/dataModel";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { ideaCommentCount, ideaDropTargets, ideaTitle, voteButtonLabel, type IdeaModel, type IdeaVote } from "@/lib/prostor/modeli/ideas-model";

/** Vidljivo dugme naslova ideje (kartica na tabli ili red liste) — za vraćanje fokusa. */
export function ideaTitleElement(ideaId: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-idea-title="${CSS.escape(ideaId)}"]`));
  return candidates.find((element) => element.offsetParent !== null) ?? null;
}

/** Radnje nad idejom koje dele kartica, red liste i detalj (prezentacija zove, kontejner radi). */
export type IdeaActions = {
  onOpen: (ideaId: Id<"ideaNodes">) => void;
  onVote: (idea: IdeaModel, vote: IdeaVote) => void;
  onSetStage: (idea: IdeaModel, stage: IdeaStoredStage) => void;
  onConvert: (idea: IdeaModel) => void;
  onArchive: (idea: IdeaModel) => void;
};

/**
 * Za / Protiv (PROSTOR P6: svaki član glasa, glas je signal). Moj glas je
 * neutralno istaknut (podloga kontrole, puna ikonica) + `aria-pressed`; boja
 * radnje nije stanje izbora. Broj se menja odmah (optimistično), bez
 * kotrljanja. Pretvorena ideja se više ne glasa (dugmad onemogućena uz razlog).
 */
export function IdeaVoteButtons({
  idea,
  onVote,
  size = "sm",
  className,
}: {
  idea: Pick<IdeaModel, "title" | "text" | "upvotes" | "downvotes" | "myVote" | "permissions">;
  onVote: (vote: IdeaVote) => void;
  size?: "sm" | "md";
  className?: string;
}) {
  const disabled = !idea.permissions.canVote;
  const title = ideaTitle(idea);
  const button = cn(
    "inline-flex items-center gap-1 rounded-md border border-line px-2 text-meta font-medium tabular-nums text-text-secondary transition-colors hover:bg-surface-control-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:border-line-soft disabled:text-text-muted aria-pressed:border-line-control aria-pressed:bg-surface-control aria-pressed:text-foreground aria-pressed:[&_svg]:fill-current",
    size === "sm" ? "h-7 pointer-coarse:h-11 pointer-coarse:min-w-11 justify-center" : "h-9 px-3 text-ui pointer-coarse:h-11 pointer-coarse:min-w-11 justify-center",
  );
  return (
    <div role="group" aria-label={`Glasovi za „${title}”`} className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        className={button}
        aria-pressed={idea.myVote === "up"}
        aria-label={voteButtonLabel("up", idea.upvotes)}
        title={disabled ? IDEA_CONVERTED_REASON : "Za"}
        disabled={disabled}
        onClick={() => onVote("up")}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
        <span>{formatNumber(idea.upvotes)}</span>
        {size === "md" ? <span>Za</span> : null}
      </button>
      <button
        type="button"
        className={button}
        aria-pressed={idea.myVote === "down"}
        aria-label={voteButtonLabel("down", idea.downvotes)}
        title={disabled ? IDEA_CONVERTED_REASON : "Protiv"}
        disabled={disabled}
        onClick={() => onVote("down")}
      >
        <ThumbsDown className="size-3.5" aria-hidden="true" />
        <span>{formatNumber(idea.downvotes)}</span>
        {size === "md" ? <span>Protiv</span> : null}
      </button>
    </div>
  );
}

/** Faza kao mirna oznaka (bez boje — boja nije status ideje, PROSTOR P17). */
export function IdeaStageBadge({ stage, className }: { stage: IdeaStage; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-md border border-line px-2 text-meta font-medium text-text-secondary",
        stage === "odobreno" && "text-foreground",
        className,
      )}
    >
      {IDEA_STAGE_LABELS[stage]}
    </span>
  );
}

export function IdeaCommentCount({ idea, className }: { idea: Pick<IdeaModel, "commentCount" | "commentCountCapped">; className?: string }) {
  const label = ideaCommentCount(idea);
  return (
    <span className={cn("inline-flex items-center gap-1 text-meta tabular-nums text-text-muted", className)}>
      <MessageSquare className="size-3.5" aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{`Komentari: ${label}`}</span>
    </span>
  );
}

/**
 * Meni „…" kartice i reda: Otvori · Premesti u fazu (samo uz `canSetStage`,
 * ciljevi iz `stageTargets`) · Pretvori (samo uz `canConvert`) · Obriši.
 * Alternativa prevlačenju za tastaturu (K07 §5.9).
 */
export function IdeaMenu({ idea, actions, className }: { idea: IdeaModel; actions: IdeaActions; className?: string }) {
  const targets = ideaDropTargets(idea);
  const title = ideaTitle(idea);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-8 shrink-0 text-text-muted", className)}
            aria-label={`Radnje za „${title}”`}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => actions.onOpen(idea._id)}>
          <ArrowUpRight aria-hidden="true" /> Otvori
        </DropdownMenuItem>
        {targets.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-meta font-medium text-text-muted">Premesti u fazu</DropdownMenuLabel>
              {targets.map((stage) => (
                <DropdownMenuItem
                  key={stage}
                  onClick={() => {
                    actions.onSetStage(idea, stage);
                    // Kartica se premešta u drugu kolonu (nov element): fokus ide za njom.
                    window.setTimeout(() => ideaTitleElement(idea._id)?.focus(), 80);
                  }}
                >
                  <span className="pl-6">{IDEA_STAGE_LABELS[stage]}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
        {idea.permissions.canConvert ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onConvert(idea)}>
              <Sparkles aria-hidden="true" /> Pretvori u zadatak ili belešku
            </DropdownMenuItem>
          </>
        ) : null}
        {idea.permissions.canArchive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => actions.onArchive(idea)}>
              <Trash2 aria-hidden="true" /> Obriši
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
