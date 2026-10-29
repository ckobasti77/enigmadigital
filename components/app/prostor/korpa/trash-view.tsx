"use client";


// Preneto iz Devotion apps/web/components/workspace/trash/trash-view.tsx (main @ c05c40f), SPAJANJE S21.
import { useRef, type ReactNode, type RefObject } from "react";
import { History, Lightbulb, LoaderCircle, Paperclip, Trash2 } from "lucide-react";
import { TRASH_SEGMENTS, type TrashKind } from "@/lib/prostor/trash";

import { FLIP_MAX_ITEMS, FlipGroup } from "@/components/motion/flip-group";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { formatFileSize, PAGE_FILE_CATEGORY_LABELS, pageKindMeta } from "@/lib/prostor/web/vrste-stranica";

import {
  restoreBlockReason,
  TRASH_EMPTY_COPY,
  trashCountLabel,
  trashItemKey,
  trashItemLocation,
  trashItemMeta,
  trashItemTitle,
  type RecoveredTrashItem,
  type RestorableTrashItem,
  type TrashCounts,
  type TrashItem,
} from "@/lib/prostor/modeli/trash-model";

export type TrashListState =
  | { status: "loading" }
  | { status: "error"; onRetry: () => void }
  | {
      status: "ready";
      items: ReadonlyArray<TrashItem>;
      loadMore: { busy: boolean; onLoad: () => void } | null;
    };

export type TrashViewProps = {
  segment: TrashKind;
  onSegmentChange: (segment: TrashKind) => void;
  /** `undefined` dok se brojevi učitavaju ili kad ih nema (greška se tiho preskače). */
  counts: TrashCounts | undefined;
  children: ReactNode;
};

/**
 * Korpa startupa — prezentacija ekrana (PROSTOR P3, plan K07 §5.4): naslov i
 * podvučene kartice segmenata (Stranice · Ideje · Prilozi · Oporavljeno) sa
 * brojem; lista segmenta dolazi kao `children` (`TrashList`). Bez `useQuery`.
 */
export function TrashView({ segment, onSegmentChange, counts, children }: TrashViewProps) {
  return (
    <div className="flex w-full max-w-5xl flex-col gap-6 pb-8">
      <PageHeader
        variant="module"
        title="Korpa"
        description="Obrisane stranice, ideje i prilozi; ovde ih tim može vratiti."
      />
      <Tabs value={segment} onValueChange={(value) => onSegmentChange(value as TrashKind)}>
        <TabsList variant="line" aria-label="Vrsta obrisanog" className="w-full justify-start">
          {TRASH_SEGMENTS.map((item) => {
            const count = trashCountLabel(counts?.[item.kind]);
            return (
              <TabsTrigger key={item.kind} value={item.kind} data-trash-tab={item.kind}>
                {item.label}
                {count ? (
                  <span className="font-normal tabular-nums text-text-muted">{count}</span>
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        <TabsContent value={segment} className="mt-4">
          {children}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export type TrashListProps = {
  segment: TrashKind;
  state: TrashListState;
  now: number;
  /** Ključ stavke čije vraćanje/uklanjanje upravo traje. */
  busyKey: string | null;
  onRestore: (item: RestorableTrashItem, index: number) => void;
  onDismiss: (item: RecoveredTrashItem, index: number) => void;
  listRef?: RefObject<HTMLUListElement | null>;
  /** Najava za čitač ekrana (vraćeno, uklonjeno). */
  announcement?: string;
};

/** Učitavanje Korpe: pet redova visine pravog reda. */
export function TrashSkeleton() {
  return (
    <div role="status" aria-label="Učitavanje Korpe" className="space-y-1">
      {[0, 1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

/** Lista jednog segmenta Korpe: učitavanje, greška, prazno, redovi i „Učitaj još". */
export function TrashList({
  segment,
  state,
  now,
  busyKey,
  onRestore,
  onDismiss,
  listRef,
  announcement = "",
}: TrashListProps) {
  const ownRef = useRef<HTMLUListElement>(null);
  const scope = listRef ?? ownRef;
  return (
    <>
      {state.status === "loading" ? (
        <TrashSkeleton />
      ) : state.status === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2 text-ui"
        >
          <p>Korpa nije učitana.</p>
          <Button variant="outline" size="sm" onClick={state.onRetry}>
            Pokušaj ponovo
          </Button>
        </div>
      ) : state.items.length === 0 && state.loadMore === null ? (
        <EmptyState
          icon={segment === "recovered" ? History : Trash2}
          title={TRASH_EMPTY_COPY[segment].title}
          description={TRASH_EMPTY_COPY[segment].description}
          headingAs="h2"
        />
      ) : (
        <>
          {/* Strana posle filtera servera ume da bude prazna dok ih ima još (K07 R6). */}
          {/* Vraćanje iz Korpe (K07 §8): kad server skine red, susedi zatvaraju
              prazninu kroz Flip (`snappy`); nov segment je nov skup, bez Flip-a. */}
          <FlipGroup
            scope={scope}
            layoutKey={state.items.map(trashItemKey).join("|")}
            resetKey={segment}
            disabled={state.items.length > FLIP_MAX_ITEMS}
          >
            <ul ref={scope} className="space-y-0.5" aria-label="Obrisane stavke">
              {state.items.map((item, index) => (
                <TrashRow
                  key={trashItemKey(item)}
                  item={item}
                  index={index}
                  now={now}
                  busy={busyKey === trashItemKey(item)}
                  onRestore={onRestore}
                  onDismiss={onDismiss}
                />
              ))}
            </ul>
          </FlipGroup>
          {state.loadMore ? (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" disabled={state.loadMore.busy} onClick={state.loadMore.onLoad}>
                {state.loadMore.busy ? <LoaderCircle className="animate-spin" /> : null}
                {state.loadMore.busy ? "Učitavam…" : "Učitaj još"}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </>
  );
}

function TrashRow({
  item,
  index,
  now,
  busy,
  onRestore,
  onDismiss,
}: {
  item: TrashItem;
  index: number;
  now: number;
  busy: boolean;
  onRestore: (item: RestorableTrashItem, index: number) => void;
  onDismiss: (item: RecoveredTrashItem, index: number) => void;
}) {
  const title = trashItemTitle(item);
  const place = trashItemLocation(item);
  const location =
    item.kind === "file"
      ? `${PAGE_FILE_CATEGORY_LABELS[item.category]} · ${formatFileSize(item.size)} · ${place}`
      : place;
  const Icon =
    item.kind === "page"
      ? pageKindMeta(item.pageKind).icon
      : item.kind === "idea"
        ? Lightbulb
        : item.kind === "file"
          ? Paperclip
          : History;
  const blocked = item.kind === "recovered" ? null : restoreBlockReason(item);

  return (
    <li
      data-trash-key={trashItemKey(item)}
      data-flip-id={trashItemKey(item)}
      className="flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-raised"
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <p className="min-w-0 truncate text-ui font-medium">{title}</p>
          {location ? <span className="min-w-0 truncate text-meta text-text-muted">{location}</span> : null}
        </div>
        <p className="mt-0.5 text-meta leading-5 text-text-muted">{trashItemMeta(item, now)}</p>
        {blocked ? <p className="text-meta leading-5 text-text-muted">{blocked}</p> : null}
        {item.kind === "recovered" && item.contributions.length > 0 ? (
          <ul className="mt-1.5 space-y-1 border-l border-line pl-3">
            {item.contributions.slice(0, 3).map((contribution) => (
              <li key={contribution._id} className="line-clamp-2 text-meta leading-5">
                <span className="font-medium">{contribution.author?.displayName ?? "Raniji tekst tima"}:</span>{" "}
                <span className="text-text-muted">{contribution.excerpt}</span>
              </li>
            ))}
            {item.contributions.length > 3 ? (
              <li className="text-meta text-text-muted">+{item.contributions.length - 3}</li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {item.kind === "recovered" ? (
        item.canDismiss ? (
          <Button
            variant="ghost"
            size="sm"
            data-trash-action
            disabled={busy}
            aria-label={`Ukloni „${title}” iz Oporavljenog`}
            onClick={() => onDismiss(item, index)}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : null}
            Ukloni
          </Button>
        ) : null
      ) : (
        <Button
          variant="outline"
          size="sm"
          data-trash-action
          disabled={busy || blocked !== null}
          aria-label={`Vrati „${title}”`}
          onClick={() => onRestore(item, index)}
        >
          {busy ? <LoaderCircle className="animate-spin" /> : null}
          Vrati
        </Button>
      )}
    </li>
  );
}
