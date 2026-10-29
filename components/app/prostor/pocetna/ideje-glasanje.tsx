"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/waiting-block.tsx (main @ c05c40f), SPAJANJE S20.
import { useEffect, useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "@/lib/toast";
import { pendingIdeaVotes } from "@/lib/prostor/inbox";

import { useProjekat, useProjekatMutation } from "@/components/app/projekat-provider";
import { ProjekatLink } from "@/components/app/projekat-link";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useQueryResult } from "@/components/app/prostor/podaci/ja";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import { hrefRute } from "@/lib/prostor/rute";
import { formatNumber } from "@/lib/format";

import { Block, type BlockStatus, useBlockRetry } from "./blok";

const BLOCK_ID = "cc-ideje";
const SVE_IDEJE = hrefRute({ kind: "ideas" }, "");

/** Greška bloka (Devotion tekst „Čeka tebe" pod novim naslovom, E7). */
const GRESKA = "Ideje nisu učitane.";

export type WaitingItem = {
  ideaId: string;
  title: string;
  authorName: string | null;
  upvotes: number;
  downvotes: number;
};

export type WaitingViewProps = {
  status: BlockStatus;
  onRetry: () => void;
  items: ReadonlyArray<WaitingItem>;
  /** Ukupno ideja koje čekaju glas (može biti više od prikazanih). */
  total: number;
  /** Koliko ideja blok pokazuje (5, na telefonu 3). */
  limit: number;
  /** Server je odsekao listu: broj uz naslov je „N+". */
  truncated?: boolean;
  /** Ideje čiji se glas upravo šalje (dugmad tih redova su neaktivna). */
  busyIds: ReadonlySet<string>;
  /** Poruka za čitač ekrana posle glasa. */
  announcement: string;
  onVote: (item: WaitingItem, voteType: "up" | "down") => void;
  onOpenIdea: (ideaId: string) => void;
};

/**
 * „Ideje za glasanje" (Devotion „Čeka tebe", plan S18 E7): ideje ovog projekta
 * u fazi „Razmatra se" za koje još nisam glasao, sa „Za" / „Protiv" u redu.
 * Posle glasa red nestaje, a fokus ide na ideju koja je preuzela njegovo mesto
 * (ili na blok).
 */
export function WaitingView({
  status,
  onRetry,
  items,
  total,
  limit,
  truncated = false,
  busyIds,
  announcement,
  onVote,
  onOpenIdea,
}: WaitingViewProps) {
  const listRef = useRef<HTMLUListElement>(null);
  // Za koju ideju je glas poslat i na kom mestu je bila: kad red nestane, fokus ide na isto mesto.
  const voted = useRef<{ ideaId: string; index: number } | null>(null);
  useEffect(() => {
    const last = voted.current;
    if (last === null || items.some((item) => item.ideaId === last.ideaId)) return;
    voted.current = null;
    const titles = listRef.current?.querySelectorAll<HTMLElement>("[data-waiting-title]");
    const next = titles && titles.length > 0 ? titles[Math.min(last.index, titles.length - 1)] : null;
    (next ?? document.getElementById(BLOCK_ID))?.focus({ preventScroll: true });
  }, [items]);

  const shown = items.slice(0, limit);
  return (
    <Block
      id={BLOCK_ID}
      title="Ideje za glasanje"
      count={truncated ? `${formatNumber(total)}+` : formatNumber(total)}
      status={status}
      errorText={GRESKA}
      onRetry={onRetry}
      skeletonRows={2}
    >
      {shown.length === 0 ? (
        <EmptyState size="section" title="Nema ideja koje čekaju tvoj glas." />
      ) : (
        <>
          <ul ref={listRef} className="space-y-0.5">
            {shown.map((item, index) => {
              const busy = busyIds.has(item.ideaId);
              const vote = (voteType: "up" | "down") => {
                if (busy) return;
                voted.current = { ideaId: item.ideaId, index };
                onVote(item, voteType);
              };
              return (
                <li
                  key={item.ideaId}
                  className="rounded-lg px-2 py-1 transition-colors duration-(--duration-fast) ease-(--ease-ui) focus-within:bg-surface-raised hover:bg-surface-raised"
                >
                  <button
                    type="button"
                    data-waiting-title
                    onClick={() => onOpenIdea(item.ideaId)}
                    className="block w-full min-w-0 cursor-pointer rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="line-clamp-2 text-ui font-medium text-foreground">{item.title}</span>
                    <span className="block truncate text-meta text-text-muted">
                      {item.authorName ?? "Član tima"}
                      {item.upvotes + item.downvotes > 0
                        ? ` · ${formatNumber(item.upvotes)} za · ${formatNumber(item.downvotes)} protiv`
                        : ""}
                    </span>
                  </button>
                  <div className="mt-0.5 flex gap-2 pb-1">
                    {/* aria-disabled, ne disabled: fokus ostaje na dugmetu dok glas stiže ili ne uspe. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-disabled={busy}
                      aria-busy={busy || undefined}
                      className="aria-disabled:cursor-not-allowed"
                      aria-label={`Glasaj za: ${item.title}`}
                      onClick={() => vote("up")}
                    >
                      <ThumbsUp aria-hidden="true" />
                      Za
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-disabled={busy}
                      aria-busy={busy || undefined}
                      className="aria-disabled:cursor-not-allowed"
                      aria-label={`Glasaj protiv: ${item.title}`}
                      onClick={() => vote("down")}
                    >
                      <ThumbsDown aria-hidden="true" />
                      Protiv
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <Button
            variant="link"
            size="sm"
            className="mt-1 px-2"
            render={<ProjekatLink href={SVE_IDEJE} />}
            nativeButton={false}
          >
            Sve ideje
          </Button>
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </Block>
  );
}

/**
 * Kontejner „Ideje za glasanje": `inbox.pending` za ovaj projekat (UZ
 * `include: ["idea_vote"]`, bez toga je lista prazna; lična funkcija sa
 * izričitim projektom) + `ideas.vote` (projektna). Glas skida red reaktivno.
 */
export function WaitingBlock({ limit }: { limit: number }) {
  const retry = useBlockRetry();
  const { workspaceId } = useProjekat();
  const { idi } = useProstorNavigacija();
  const result = useQueryResult(
    api.prostor.inbox.pending,
    workspaceId === null ? "skip" : { workspaceId, include: ["idea_vote"] },
  );
  const vote = useProjekatMutation(api.prostor.ideas.vote);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");

  const items: WaitingItem[] =
    result.data === undefined
      ? []
      : pendingIdeaVotes(result.data.items).map((item) => ({
          ideaId: item.ideaId,
          title: item.title,
          authorName: item.authorName,
          upvotes: item.upvotes,
          downvotes: item.downvotes,
        }));

  const setBusy = (ideaId: string, busy: boolean) =>
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(ideaId);
      else next.delete(ideaId);
      return next;
    });

  const onVote = (item: WaitingItem, voteType: "up" | "down") => {
    setBusy(item.ideaId, true);
    vote({ ideaId: item.ideaId as Id<"ideaNodes">, voteType })
      // Isti tekst dvaput ne menja živi region: naizmenični razmak ga ponovo najavljuje.
      .then(() => setAnnouncement((previous) => (previous === "Glas je sačuvan." ? "Glas je sačuvan. " : "Glas je sačuvan.")))
      // Greška ide samo kroz toast (on je već živi region), ne i kroz najavu bloka.
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Glas nije sačuvan.")))
      .finally(() => setBusy(item.ideaId, false));
  };

  return (
    <WaitingView
      status={result.failed ? "error" : result.data === undefined ? "loading" : "ready"}
      onRetry={retry}
      items={items}
      total={items.length}
      limit={limit}
      truncated={result.data?.truncated ?? false}
      busyIds={busyIds}
      announcement={announcement}
      onVote={onVote}
      onOpenIdea={(ideaId) => idi({ kind: "ideas", ideaId: ideaId as Id<"ideaNodes"> })}
    />
  );
}
