"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import {
  EyeOff,
  Inbox,
  Search,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Reveal } from "@/components/motion/reveal";
import { CountUp } from "@/components/motion/count-up";
import { EmptyState } from "@/components/app/empty-state";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FeedbackNote } from "@/components/app/feedback";
import { formatNumber } from "@/lib/format";
import { CommentThread, convexMessage } from "./comment-thread";

type Filter = "unanswered" | "all" | "hidden" | "deleted";

/**
 * "Neodgovoreni" is first and it is the default, because it is the reason the
 * screen gets opened. Everything else is a way of looking back at work already
 * done, and belongs after the work that is waiting.
 */
const FILTERS: { value: Filter; label: string }[] = [
  { value: "unanswered", label: "Neodgovoreni" },
  { value: "all", label: "Svi" },
  { value: "hidden", label: "Sakriveni" },
  { value: "deleted", label: "Obrisani" },
];

const EMPTY_COPY: Record<Filter, { icon: typeof Inbox; text: string }> = {
  unanswered: {
    icon: Inbox,
    text: "Nema neodgovorenih komentara. Sve što je stiglo je obrađeno.",
  },
  all: {
    icon: Inbox,
    text: "Još nema komentara. Pojaviće se ovde čim neko napiše prvi, i pri sledećoj sinhronizaciji za starije objave.",
  },
  hidden: {
    icon: EyeOff,
    text: "Nijedan komentar nije sakriven.",
  },
  deleted: {
    icon: Trash2,
    text: "Nijedan komentar nije obrisan.",
  },
};

/** Serbian counting: 1 komentar, 2–4 komentara, 5+ komentara. */
function commentsWord(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return "komentar";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return "komentara";
  }
  return "komentara";
}

export function CommentsModeration() {
  const [filter, setFilter] = useState<Filter>("unanswered");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());

  const connections = useQuery(api.connections.list);
  const counts = useQuery(api.igCommentsStore.filterCounts);
  const threads = useQuery(api.igCommentsStore.listThreads, {
    filter,
    search: search.trim() || undefined,
  });

  const igConnected =
    connections === undefined ||
    connections.some((c) => c.provider === "meta_ig");

  const visibleIds = useMemo(
    () =>
      new Set(
        (threads ?? [])
          .filter((t) => t.deletedAt === undefined)
          .map((t) => t.commentId),
      ),
    [threads],
  );

  // A comment that leaves the list — answered, hidden, deleted — must not stay
  // selected behind the scenes, or the next bulk action reaches for something
  // that is no longer on screen. Narrowed here at read time rather than pruned
  // in an effect: the stale ids in `selection` are simply never used, and
  // ticking a box does not have to wait for a second render to take effect.
  const selected = useMemo(
    () => new Set([...selection].filter((id) => visibleIds.has(id))),
    [selection, visibleIds],
  );

  const toggle = (commentId: string, on: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (on) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  };

  const allSelected = visibleIds.size > 0 && selected.size === visibleIds.size;

  if (!igConnected) {
    return (
      <EmptyState icon={Unplug}>
        Instagram još nije povezan.{" "}
        <Link
          href="/settings"
          className="text-accent-400 underline-offset-4 hover:underline"
        >
          Poveži ga u podešavanjima
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Reveal>
        <FilterBar
          filter={filter}
          onFilterChange={(next) => {
            setFilter(next);
            setSelection(new Set());
          }}
          search={search}
          onSearchChange={setSearch}
          counts={counts}
        />
      </Reveal>

      <Reveal delay={0.05} className="flex flex-1 flex-col">
        <Card className="flex flex-1 flex-col gap-0 p-0 shadow-card">
          <SelectionBar
            selection={selected}
            allSelected={allSelected}
            onSelectAll={(on) =>
              setSelection(on ? new Set(visibleIds) : new Set())
            }
            selectableCount={visibleIds.size}
          />

          {threads === undefined ? (
            <CommentListSkeleton />
          ) : threads.length === 0 ? (
            <EmptyState icon={EMPTY_COPY[filter].icon}>
              {EMPTY_COPY[filter].text}
            </EmptyState>
          ) : (
            <div className="flex flex-col divide-y divide-line-soft px-4">
              {threads.map((thread) => (
                <CommentThread
                  key={thread._id}
                  thread={thread}
                  showPost
                  selected={selected.has(thread.commentId)}
                  onSelectedChange={(on) => toggle(thread.commentId, on)}
                />
              ))}
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}

function FilterBar({
  filter,
  onFilterChange,
  search,
  onSearchChange,
  counts,
}: {
  filter: Filter;
  onFilterChange: (next: Filter) => void;
  search: string;
  onSearchChange: (next: string) => void;
  counts: { all: number; unanswered: number; hidden: number; deleted: number } | undefined;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <ToggleGroup
        value={[filter]}
        onValueChange={(value) => {
          const next = value[0] as Filter | undefined;
          if (next) onFilterChange(next);
        }}
        spacing={0}
        aria-label="Filter komentara"
        className="w-fit rounded-lg border border-line bg-card p-0.5"
      >
        {FILTERS.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            size="sm"
            className="rounded-md! gap-1.5 px-3 text-text-secondary aria-pressed:text-accent-400 data-pressed:text-accent-400"
          >
            {option.label}
            {counts && (
              <CountUp
                value={counts[option.value]}
                format={formatNumber}
                className="font-mono text-micro text-text-muted"
              />
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="relative w-full sm:w-64">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Pretraži po tekstu ili nalogu"
          aria-label="Pretraga komentara"
          className="pl-8"
        />
        {search.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Obriši pretragu"
            onClick={() => onSearchChange("")}
            className="absolute top-1/2 right-1 -translate-y-1/2 text-text-muted"
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The bulk row. It only exists while something is selected — a permanently
 * visible bar of destructive buttons is a permanent invitation to press one.
 */
function SelectionBar({
  selection,
  allSelected,
  onSelectAll,
  selectableCount,
}: {
  selection: Set<string>;
  allSelected: boolean;
  onSelectAll: (on: boolean) => void;
  selectableCount: number;
}) {
  const bulkHide = useAction(api.igComments.bulkSetHidden);
  const bulkDelete = useAction(api.igComments.bulkDelete);

  const [pending, setPending] = useState<"hide" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{
    tone: "success" | "warning" | "danger";
    title: string;
    detail?: string;
  } | null>(null);

  const ids = [...selection];
  const count = ids.length;

  if (selectableCount === 0) return null;

  const report = (
    result: { succeeded: number; failed: number; firstError: string | null },
    verb: string,
  ) => {
    if (result.failed === 0) {
      setNote({
        tone: "success",
        title: `${verb} ${formatNumber(result.succeeded)} ${commentsWord(result.succeeded)}.`,
      });
      return;
    }
    setNote({
      tone: result.succeeded > 0 ? "warning" : "danger",
      title: `${verb} ${formatNumber(result.succeeded)} od ${formatNumber(
        result.succeeded + result.failed,
      )}.`,
      detail: result.firstError ?? undefined,
    });
  };

  const runHide = async () => {
    setBusy(true);
    try {
      const result = await bulkHide({ commentIds: ids, hidden: true });
      report(result, "Sakriveno");
      setPending(null);
      onSelectAll(false);
    } catch (err) {
      setNote({
        tone: "danger",
        title: convexMessage(err, "Grupno sakrivanje nije uspelo."),
      });
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    setBusy(true);
    try {
      const result = await bulkDelete({
        commentIds: ids,
        // The dialog names the risk for the whole selection at once; without
        // this the backend refuses any automation reply inside it.
        acknowledgeAutomation: true,
      });
      report(result, "Obrisano");
      setPending(null);
      onSelectAll(false);
    } catch (err) {
      setNote({
        tone: "danger",
        title: convexMessage(err, "Grupno brisanje nije uspelo."),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
          <Checkbox
            checked={allSelected}
            indeterminate={count > 0 && !allSelected}
            onCheckedChange={(on) => onSelectAll(on)}
            aria-label="Izaberi sve prikazane komentare"
          />
          <span>
            {count === 0
              ? "Izaberi sve"
              : `Izabrano ${formatNumber(count)} ${commentsWord(count)}`}
          </span>
        </label>

        {count > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPending("hide")}
            >
              <EyeOff data-icon="inline-start" />
              Sakrij
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPending("delete")}
              className="text-danger hover:text-danger"
            >
              <Trash2 data-icon="inline-start" />
              Obriši
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onSelectAll(false)}
              className="text-text-muted"
            >
              Poništi izbor
            </Button>
          </div>
        )}
      </div>

      {note && (
        <FeedbackNote
          tone={note.tone}
          title={note.title}
          action={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Zatvori poruku"
              onClick={() => setNote(null)}
            >
              <X />
            </Button>
          }
        >
          {note.detail}
        </FeedbackNote>
      )}

      <ConfirmDialog
        open={pending === "hide"}
        onOpenChange={(open) => !open && setPending(null)}
        tone="accent"
        title={`Sakrij ${formatNumber(count)} ${commentsWord(count)}?`}
        confirmLabel="Sakrij"
        busyLabel="Sakrivam…"
        busy={busy}
        onConfirm={() => void runHide()}
        description="Sakriveni komentari ostaju na Instagramu, ali ih vidi samo njihov autor. Svaki se može vratiti pojedinačno."
      />

      <ConfirmDialog
        open={pending === "delete"}
        onOpenChange={(open) => !open && setPending(null)}
        title={`Obriši ${formatNumber(count)} ${commentsWord(count)}?`}
        confirmLabel="Obriši"
        busyLabel="Brišem…"
        busy={busy}
        onConfirm={() => void runDelete()}
        description={
          <>
            Brisanje je trajno. Komentari nestaju sa Instagrama i ne mogu da se
            vrate. Ako je među njima odgovor koji je poslala automatizacija,
            biće obrisan i on — sama automatizacija nastavlja da radi.
          </>
        }
      />
    </div>
  );
}

function CommentListSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-line-soft px-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 py-4">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3.5 w-full max-w-md" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CommentsModerationSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-8 w-64" />
      </div>
      <Card className="flex-1 p-0 shadow-card">
        <CommentListSkeleton />
      </Card>
    </div>
  );
}
