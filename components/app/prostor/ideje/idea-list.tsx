"use client";

// Preneto iz Devotion apps/web/components/workspace/ideas/idea-list.tsx (main @ c05c40f), SPAJANJE S13.
import { useRef } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { FLIP_MAX_ITEMS, FlipGroup } from "@/components/motion/flip-group";
import { ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

import { IdeaCommentCount, IdeaMenu, IdeaStageBadge, IdeaVoteButtons, type IdeaActions } from "@/components/app/prostor/ideje/idea-parts";
import {
  ariaSortOf,
  ideaAgeLabel,
  IDEA_LIST_COLUMNS,
  ideaTitle,
  sortIdeas,
  type IdeaModel,
  type IdeaSort,
  type IdeaSortKey,
} from "@/lib/prostor/modeli/ideas-model";

/**
 * Lista ideja (PROSTOR P16, K07 §5.9): tabela Ideja · Autor · Glasovi · Faza ·
 * Komentari · Starost; podrazumevano najnovije prvo, klik na zaglavlje
 * sortira (`aria-sort`). Ispod `md` tabela postaje lista (DIZAJN-SMIRENJE
 * §5.3). Promena reda (glas, faza) putuje kroz Flip.
 */
export function IdeaList({
  ideas,
  now,
  actions,
  sort,
  onSortChange,
  activeIdeaId,
  resetKey,
}: {
  ideas: ReadonlyArray<IdeaModel>;
  now: number;
  actions: IdeaActions;
  sort: IdeaSort;
  onSortChange: (key: IdeaSortKey) => void;
  activeIdeaId: Id<"ideaNodes"> | null;
  resetKey: string;
}) {
  const tableRef = useRef<HTMLTableSectionElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const rows = sortIdeas(ideas, sort);
  const layoutKey = rows.map((idea) => idea._id).join("|");
  const flipOff = rows.length > FLIP_MAX_ITEMS;

  return (
    <>
      <table className="w-full border-separate border-spacing-0 text-left text-ui max-xl:hidden">
        <caption className="sr-only">Ideje</caption>
        <thead className="text-meta font-medium text-text-muted [&_th]:border-b [&_th]:border-line">
          <tr>
            {IDEA_LIST_COLUMNS.map((column) => (
              <th
                key={column.key}
                scope="col"
                aria-sort={ariaSortOf(sort, column.key)}
                className={cn(
                  "h-9 px-2 font-medium",
                  column.key === "ideja" && "w-[40%]",
                  (column.key === "komentari" || column.key === "starost") && "text-right",
                )}
              >
                <SortButton label={column.label} active={sort.key === column.key} direction={sort.direction} onClick={() => onSortChange(column.key)} alignEnd={column.key === "komentari" || column.key === "starost"} />
              </th>
            ))}
            <th scope="col" className="h-9 w-10 px-2">
              <span className="sr-only">Radnje</span>
            </th>
          </tr>
        </thead>
        <tbody ref={tableRef}>
          <FlipGroup scope={tableRef} layoutKey={layoutKey} resetKey={`${resetKey}|${sort.key}:${sort.direction}`} disabled={flipOff}>
            {rows.map((idea) => {
              const title = ideaTitle(idea);
              return (
                <tr
                  key={idea._id}
                  data-flip-id={idea._id}
                 
                  aria-current={idea._id === activeIdeaId ? "true" : undefined}
                  className="group/row h-10 transition-colors hover:bg-surface-control-hover aria-[current=true]:bg-surface-raised [&>td]:border-b [&>td]:border-line-soft"
                >
                  <td className="max-w-0 px-2 py-1.5">
                    <button
                      type="button"
                      data-idea-title={idea._id}
                      onClick={() => actions.onOpen(idea._id)}
                      className="block w-full min-w-0 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="block truncate font-medium">{title}</span>
                      {idea.title?.trim() ? (
                        <span className="block truncate text-meta text-text-muted">{idea.text}</span>
                      ) : null}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <span className="flex items-center gap-2 text-meta text-text-secondary">
                      <ProfileAvatar profile={idea.author ?? { displayName: "Član tima", avatarUrl: null }} className="size-6" />
                      <span className="max-w-32 truncate">{idea.author?.displayName ?? "Član tima"}</span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <IdeaVoteButtons idea={idea} onVote={(vote) => actions.onVote(idea, vote)} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <IdeaStageBadge stage={idea.stage} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    <IdeaCommentCount idea={idea} />
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right text-meta tabular-nums text-text-muted">
                    {ideaAgeLabel(idea.createdAt, now)}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {/* Radnja reda: vidi se na prelaz ili fokus reda, na dodir uvek. */}
                    <IdeaMenu
                      idea={idea}
                      actions={actions}
                      className="opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                    />
                  </td>
                </tr>
              );
            })}
          </FlipGroup>
        </tbody>
      </table>

      {/* Ispod `xl`: red sa naslovom, meta redom i glasovima. */}
      <ul ref={listRef} className="space-y-0.5 xl:hidden" aria-label="Ideje">
        <FlipGroup scope={listRef} layoutKey={layoutKey} resetKey={`${resetKey}|${sort.key}:${sort.direction}`} disabled={flipOff}>
          {rows.map((idea) => (
            <li
              key={idea._id}
              data-flip-id={idea._id}
             
              className={cn(
                "rounded-lg px-2 py-2 hover:bg-surface-control-hover",
                idea._id === activeIdeaId && "bg-surface-raised",
              )}
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  data-idea-title={idea._id}
                  onClick={() => actions.onOpen(idea._id)}
                  className="min-w-0 flex-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block truncate text-ui font-medium">{ideaTitle(idea)}</span>
                  <span className="mt-0.5 block truncate text-meta text-text-muted">
                    {`${idea.author?.displayName ?? "Član tima"} · ${ideaAgeLabel(idea.createdAt, now)}`}
                  </span>
                </button>
                <IdeaMenu idea={idea} actions={actions} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <IdeaVoteButtons idea={idea} onVote={(vote) => actions.onVote(idea, vote)} />
                <IdeaStageBadge stage={idea.stage} />
                <IdeaCommentCount idea={idea} />
              </div>
            </li>
          ))}
        </FlipGroup>
      </ul>
    </>
  );
}

function SortButton({
  label,
  active,
  direction,
  onClick,
  alignEnd,
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  alignEnd?: boolean;
}) {
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-1 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
        active && "text-foreground",
        alignEnd && "flex-row-reverse",
      )}
    >
      {label}
      {active ? <Icon className="size-3.5" aria-hidden="true" /> : null}
    </button>
  );
}
