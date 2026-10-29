"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/idea-card.tsx (main @ c05c40f), SPAJANJE S13.
import type { DragEvent, MouseEvent } from "react";

import { cn } from "@/lib/utils";

import { IdeaCommentCount, IdeaMenu, IdeaVoteButtons, type IdeaActions } from "@/components/app/prostor/ideje/idea-parts";
import { ideaAuthorLine, ideaTitle, type IdeaModel } from "@/lib/prostor/modeli/ideas-model";

export type IdeaCardDrag = {
  draggable: boolean;
  dragging: boolean;
  onDragStart: (idea: IdeaModel) => void;
  onDragEnd: () => void;
};

/**
 * Kartica ideje na tabli (K07 §5.9): naslov (2 reda), isečak (2 reda),
 * „Autor · starost", Za/Protiv i broj komentara, meni „…". Klik bilo gde na
 * kartici otvara detalj; naslov je dugme za tastaturu (`data-idea-open` hvata
 * kretanje strelicama po tabli). Prevlači se cela kartica, samo kome je
 * dozvoljeno menjanje faze.
 */
export function IdeaCard({
  idea,
  now,
  actions,
  active = false,
  drag,
  className,
}: {
  idea: IdeaModel;
  now: number;
  actions: IdeaActions;
  /** Detalj ove ideje je otvoren. */
  active?: boolean;
  drag?: IdeaCardDrag;
  className?: string;
}) {
  const title = ideaTitle(idea);
  // Bez naslova je tekst već naslov kartice — isečak se ne ponavlja.
  const snippet = idea.title?.trim() ? idea.text.trim() : "";

  function openFromCard(event: MouseEvent<HTMLElement>) {
    // Klik iz portala (meni „…") putuje kroz React stablo — nije klik na karticu.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, [role='menuitem']")) return;
    actions.onOpen(idea._id);
  }

  return (
    <article
      data-flip-id={idea._id}
      aria-labelledby={`idea-title-${idea._id}`}
      draggable={drag?.draggable || undefined}
      onDragStart={
        drag?.draggable
          ? (event: DragEvent<HTMLElement>) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", idea._id);
              drag.onDragStart(idea);
            }
          : undefined
      }
      onDragEnd={drag?.draggable ? () => drag.onDragEnd() : undefined}
      onClick={openFromCard}
      className={cn(
        "group/card relative cursor-pointer rounded-lg border border-line bg-card p-3 shadow-elev-1 transition-colors hover:border-line-control",
        "has-[[data-idea-open]:focus-visible]:ring-2 has-[[data-idea-open]:focus-visible]:ring-ring",
        // Otvoren detalj je izbor, ne radnja: neutralno, bez boje radnje.
        active && "border-line-control bg-surface-raised",
        // Kartica koja se prevlači ostaje na mestu kao obris (prazno mesto, ne providan tekst).
        drag?.dragging && "border-dashed bg-transparent shadow-none [&>*]:invisible",
        className,
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          id={`idea-title-${idea._id}`}
          data-idea-open
          data-idea-title={idea._id}
          onClick={() => actions.onOpen(idea._id)}
          className="min-w-0 flex-1 py-0.5 text-left text-ui font-medium text-foreground outline-none"
        >
          <span className="line-clamp-2 [overflow-wrap:anywhere]">{title}</span>
        </button>
        <IdeaMenu idea={idea} actions={actions} className="-mr-1.5 -mt-1" />
      </div>
      {snippet ? (
        <p className="mt-1 line-clamp-2 text-meta text-text-secondary [overflow-wrap:anywhere]">{snippet}</p>
      ) : null}
      <p className="mt-1.5 truncate text-meta text-text-muted">{ideaAuthorLine(idea, now)}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <IdeaVoteButtons idea={idea} onVote={(vote) => actions.onVote(idea, vote)} />
        <IdeaCommentCount idea={idea} />
      </div>
    </article>
  );
}
