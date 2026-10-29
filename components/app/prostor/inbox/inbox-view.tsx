"use client";

// Preneto iz Devotion apps/web/components/me/inbox/inbox-view.tsx (main @ c05c40f), SPAJANJE S17.
import { useId, useRef, type ReactNode, type RefObject } from "react";
import {
  ArrowRight,
  BellRing,
  Check,
  CheckCheck,
  GitMerge,
  Hourglass,
  Inbox,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import {
  formatInboxTime,
  groupInboxByDay,
  INBOX_SEGMENTS,
  inboxCountLabel,
  inboxEmptyCopy,
  inboxPendingFor,
  inboxUnreadFor,
  inboxUnreadWord,
  pendingIsVote,
  pendingKey,
  pendingTitle,
  type InboxCounts,
  type InboxScope,
  type InboxSegment,
  type PendingItemLike,
} from "@/lib/prostor";

import { PageHeader } from "@/components/app/page-header";
import { CountBadge } from "@/components/app/system/count-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { LOUD_TYPES, TYPE_ICON } from "./notifications-panel";
import { EmptyState, ProfileAvatar } from "@/components/app/prostor/zajednicko/radni-ui";
import { ProjekatCip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { InboxSkeleton } from "./inbox-skeleton";

/** Projekat na čipu opsega i u redu: ime, znak i boja (identitet projekta). */
export type InboxProjekat = { _id: string; name: string; logoUrl: string | null; boja: string | null };

/** Stavka feed-a (`inbox.feed`) onoliko koliko prikaz čita. */
export type InboxItemModel = {
  _id: string;
  type: string;
  title: string;
  body?: string;
  targetType: string;
  targetId: string | null;
  readAt: number | null;
  createdAt: number;
  /** `null` = lično obaveštenje (poruka iz ličnog razgovora). */
  workspaceId: string | null;
  workspace: { _id: string; name: string; logoUrl: string | null } | null;
  actor: { displayName: string; avatarUrl: string | null } | null;
};

/** Stavka „Čeka tebe“ (`inbox.pending`) onoliko koliko prikaz čita. */
export type InboxPendingModel = PendingItemLike & {
  workspace: { _id: string; name: string; logoUrl: string | null };
  createdAt: number;
  targetType: string;
  targetId: string;
};

export type InboxFeedState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | {
      status: "ready";
      items: ReadonlyArray<InboxItemModel>;
      canLoadMore: boolean;
      loadingMore: boolean;
      onLoadMore: () => void;
    };

export type InboxPendingState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; items: ReadonlyArray<InboxPendingModel>; truncated: boolean };

export type InboxViewProps = {
  now: number;
  segment: InboxSegment;
  onSegmentChange: (segment: InboxSegment) => void;
  scope: InboxScope;
  onScopeChange: (scope: InboxScope) => void;
  workspaces: ReadonlyArray<InboxProjekat>;
  /** `null` dok brojači ne stignu (ili upit padne) — brojevi se tada ne prikazuju. */
  counts: InboxCounts | null;
  feed: InboxFeedState;
  pending: InboxPendingState;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
  onOpenPending: (item: InboxPendingModel) => void;
  onMarkAllRead: () => void;
  markingAll: boolean;
  onOpenSettings: () => void;
  /** Najava za čitač ekrana (npr. „Označeno kao pročitano: 3.“). */
  announcement?: string;
  listRef?: RefObject<HTMLDivElement | null>;
};

/** Čip opsega: izbor je neutralno istaknut (boja radnje nije stanje izbora). */
const chipClass = (active: boolean) =>
  cn(
    "relative inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-ui font-medium transition-colors duration-(--duration-fast) ease-(--ease-ui) outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
    active
      ? "border-line-strong bg-surface-control-hover text-foreground"
      : "border-line bg-surface text-text-secondary hover:bg-surface-control hover:text-foreground",
  );

/**
 * Inbox (paritet red 5): obaveštenja iz svih mojih projekata i ličnih poruka
 * na jednom mestu — kartice Sve · Nepročitano · Čeka tebe, čipovi opsega
 * (Svi · Lično · projekti) i grupe Danas · Juče · Ranije. Prezentacija:
 * podaci i radnje kroz props. Klik na red označava pročitano pa otvara cilj
 * (to radi kontejner). Radni ekran: bez pokreta pri učitavanju.
 */
export function InboxView({
  now,
  segment,
  onSegmentChange,
  scope,
  onScopeChange,
  workspaces,
  counts,
  feed,
  pending,
  onOpen,
  onMarkRead,
  onOpenPending,
  onMarkAllRead,
  markingAll,
  onOpenSettings,
  announcement = "",
  listRef,
}: InboxViewProps) {
  const ownListRef = useRef<HTMLDivElement>(null);
  const scopeRef = listRef ?? ownListRef;

  const scoped = counts ? inboxUnreadFor(counts, scope) : null;
  const total = counts?.total ?? null;
  const pendingScoped = pending.status === "ready" ? inboxPendingFor(pending.items, scope) : null;
  const pendingAll = pending.status === "ready" ? pending.items.length : null;
  const tabId = useId();
  const boje = new Map(workspaces.map((w) => [w._id, w.boja] as const));

  const opis =
    total === null
      ? "Obaveštenja iz svih projekata i ličnih poruka"
      : total.count === 0
        ? "Sve je pročitano · svi projekti i lične poruke"
        : `${inboxCountLabel(total.count, total.capped)} ${inboxUnreadWord(total.count)} · svi projekti i lične poruke`;

  return (
    <div className="flex w-full flex-col gap-5">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <PageHeader
        variant="module"
        title="Inbox"
        description={opis}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onMarkAllRead}
              // U „Čeka tebe“ se vide samo odluke, pa masovno označavanje obaveštenja tu ne važi.
              disabled={markingAll || segment === "pending" || scoped === null || scoped.count === 0}
              aria-label="Označi sve kao pročitano"
              title="Označi sve kao pročitano"
            >
              <CheckCheck aria-hidden="true" />
              <span className="hidden sm:inline">Označi sve kao pročitano</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              aria-label="Podešavanja obaveštenja"
              title="Podešavanja obaveštenja"
            >
              <SlidersHorizontal aria-hidden="true" />
            </Button>
          </>
        }
      />

      <Tabs
        ref={scopeRef as RefObject<HTMLDivElement>}
        value={segment}
        onValueChange={(value) => onSegmentChange(value as InboxSegment)}
        className="gap-0"
      >
        <TabsList aria-label="Prikaz Inboxa">
          {INBOX_SEGMENTS.map(({ key, label }) => {
            const count =
              key === "unread"
                ? scoped
                : key === "pending"
                  ? pendingScoped
                    ? { count: pendingScoped.length, capped: false }
                    : null
                  : null;
            return (
              <TabsTrigger key={key} value={key} id={`${tabId}-${key}`}>
                {label}
                {count !== null && count.count > 0 ? (
                  <CountBadge
                    count={count.capped ? 100 : count.count}
                    label={`${inboxCountLabel(count.count, count.capped)} ${key === "unread" ? inboxUnreadWord(count.count) : "za tvoju odluku"}`}
                  />
                ) : null}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {workspaces.length > 0 ? (
          <div
            role="group"
            aria-label="Opseg obaveštenja"
            className="scrollbar-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 py-1"
          >
            <ScopeChip
              active={scope.kind === "all"}
              onClick={() => onScopeChange({ kind: "all" })}
              unread={total}
              pendingCount={pendingAll}
              segment={segment}
            >
              Svi
            </ScopeChip>
            <ScopeChip
              active={scope.kind === "personal"}
              onClick={() => onScopeChange({ kind: "personal" })}
              unread={counts?.personal ?? null}
              pendingCount={0}
              segment={segment}
              leading={<ProjekatCip workspace={null} size="xs" />}
            >
              Lično
            </ScopeChip>
            {workspaces.map((workspace) => {
              const workspaceScope: InboxScope = { kind: "startup", workspaceId: workspace._id };
              return (
                <ScopeChip
                  key={workspace._id}
                  active={scope.kind === "startup" && scope.workspaceId === workspace._id}
                  onClick={() => onScopeChange(workspaceScope)}
                  unread={counts ? inboxUnreadFor(counts, workspaceScope) : null}
                  pendingCount={
                    pending.status === "ready" ? inboxPendingFor(pending.items, workspaceScope).length : null
                  }
                  segment={segment}
                  leading={<ProjekatCip workspace={workspace} size="xs" />}
                >
                  <span className="max-w-32 truncate">{workspace.name}</span>
                </ScopeChip>
              );
            })}
          </div>
        ) : null}

        {INBOX_SEGMENTS.map(({ key }) => (
          <TabsContent key={key} value={key} aria-labelledby={`${tabId}-${key}`} className="mt-4">
            {segment === key ? (
              key === "pending" ? (
                <PendingPanel state={pending} scope={scope} segment={segment} now={now} boje={boje} onOpen={onOpenPending} />
              ) : (
                <FeedPanel
                  state={feed}
                  scope={scope}
                  segment={segment}
                  now={now}
                  boje={boje}
                  onOpen={onOpen}
                  onMarkRead={onMarkRead}
                />
              )
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ScopeChip({
  active,
  onClick,
  unread,
  pendingCount,
  segment,
  leading,
  children,
}: {
  active: boolean;
  onClick: () => void;
  unread: { count: number; capped: boolean } | null;
  pendingCount: number | null;
  segment: InboxSegment;
  leading?: ReactNode;
  children: ReactNode;
}) {
  // Broj na čipu prati karticu: „Čeka tebe“ broji odluke, ostalo nepročitano.
  const shown =
    segment === "pending" ? (pendingCount === null ? null : { count: pendingCount, capped: false }) : unread;
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={chipClass(active)}>
      {leading}
      {children}
      {shown !== null && shown.count > 0 ? (
        <span className="text-meta tabular-nums text-text-muted">
          {inboxCountLabel(shown.count, shown.capped)}
          <span className="sr-only">
            {" "}
            {segment === "pending" ? "za tvoju odluku" : inboxUnreadWord(shown.count)}
          </span>
        </span>
      ) : null}
    </button>
  );
}

type Boje = ReadonlyMap<string, string | null>;

function FeedPanel({
  state,
  scope,
  segment,
  now,
  boje,
  onOpen,
  onMarkRead,
}: {
  state: InboxFeedState;
  scope: InboxScope;
  segment: InboxSegment;
  now: number;
  boje: Boje;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
}) {
  if (state.status === "loading") return <InboxSkeleton />;
  if (state.status === "error") {
    return <InboxError title="Inbox se ne može učitati." retry={state.retry} />;
  }
  if (state.items.length === 0) {
    const copy = inboxEmptyCopy(segment, scope);
    // Backend filtrira stavke POSLE paginacije: strana može doći prazna, a da ima još.
    const more = state.canLoadMore || state.loadingMore;
    return (
      <EmptyState
        headingAs="h2"
        icon={segment === "unread" ? Check : Inbox}
        title={more ? "Na ovoj strani nema ničega." : copy.title}
        description={more ? "Ostalo može biti dalje u istoriji." : copy.description}
        action={
          more ? (
            <Button type="button" variant="outline" disabled={state.loadingMore} onClick={state.onLoadMore}>
              {state.loadingMore ? "Učitavam…" : "Učitaj još"}
            </Button>
          ) : undefined
        }
      />
    );
  }
  const groups = groupInboxByDay(state.items, now);
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <InboxGroup key={group.key} title={group.title} count={group.items.length}>
          {group.items.map((item) => (
            <li key={item._id}>
              <InboxRow item={item} now={now} boja={boje.get(item.workspaceId ?? "") ?? null} onOpen={onOpen} onMarkRead={onMarkRead} />
            </li>
          ))}
        </InboxGroup>
      ))}
      {state.canLoadMore || state.loadingMore ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={state.loadingMore}
          onClick={state.onLoadMore}
        >
          {state.loadingMore ? "Učitavam…" : "Učitaj još"}
        </Button>
      ) : null}
    </div>
  );
}

function InboxGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="heading-caps px-2 pb-1 text-meta text-text-muted">
        {title}
        <span className="sr-only">, {formatNumber(count)}</span>
      </h2>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/** Znak reda: avatar autora, a bez autora ikonica vrste (kašnjenje je crveno). */
export function ZnakObavestenja({
  item,
  className,
}: {
  item: Pick<InboxItemModel, "type" | "actor">;
  className?: string;
}) {
  if (item.actor !== null) return <ProfileAvatar profile={item.actor} className={cn("size-8", className)} />;
  const Icon = TYPE_ICON[item.type] ?? BellRing;
  const loud = LOUD_TYPES.has(item.type);
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full",
        loud ? "bg-danger-soft text-danger" : "bg-surface-raised text-text-secondary",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

function InboxRow({
  item,
  now,
  boja,
  onOpen,
  onMarkRead,
}: {
  item: InboxItemModel;
  now: number;
  boja: string | null;
  onOpen: (item: InboxItemModel) => void;
  onMarkRead: (item: InboxItemModel) => void;
}) {
  const unread = item.readAt === null;
  const time = formatInboxTime(item.createdAt, now);
  const place = item.workspace === null ? "Lično" : item.workspace.name;

  return (
    <div className="group/row relative flex items-start rounded-lg transition-colors duration-(--duration-fast) hover:bg-surface-control focus-within:bg-surface-control">
      <button
        type="button"
        data-inbox-row
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-2 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ZnakObavestenja item={item} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-ui leading-5 [overflow-wrap:anywhere]",
              unread ? "font-medium text-foreground" : "text-text-secondary",
            )}
          >
            {unread ? <span className="sr-only">Nepročitano. </span> : null}
            {item.title}
          </span>
          {item.body ? (
            <span className="mt-0.5 line-clamp-2 block text-meta leading-5 text-text-muted [overflow-wrap:anywhere]">
              {item.body}
            </span>
          ) : null}
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-meta text-text-muted">
            <ProjekatCip
              workspace={item.workspace === null ? null : { ...item.workspace, boja }}
              size="xs"
            />
            <span className="min-w-0 truncate">{place}</span>
            <span aria-hidden="true">·</span>
            <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 tabular-nums">
              {time}
            </time>
          </span>
        </span>
        {unread ? <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-foreground" /> : null}
      </button>
      {unread ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Označi kao pročitano: ${item.title}`}
          title="Označi kao pročitano"
          onClick={() => onMarkRead(item)}
          className="mr-1 mt-2 shrink-0 text-text-muted md:pointer-fine:opacity-0 md:pointer-fine:group-hover/row:opacity-100 md:pointer-fine:group-focus-within/row:opacity-100"
        >
          <Check aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

function PendingPanel({
  state,
  scope,
  segment,
  now,
  boje,
  onOpen,
}: {
  state: InboxPendingState;
  scope: InboxScope;
  segment: InboxSegment;
  now: number;
  boje: Boje;
  onOpen: (item: InboxPendingModel) => void;
}) {
  if (state.status === "loading") return <InboxSkeleton />;
  if (state.status === "error") {
    return <InboxError title="„Čeka tebe“ se ne može učitati." retry={state.retry} />;
  }
  const items = inboxPendingFor(state.items, scope);
  if (items.length === 0) {
    const copy = inboxEmptyCopy(segment, scope);
    return <EmptyState headingAs="h2" icon={Hourglass} title={copy.title} description={copy.description} />;
  }
  return (
    <div className="space-y-3">
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={pendingKey(item)}>
            <PendingRow item={item} now={now} boja={boje.get(item.workspace._id) ?? null} onOpen={onOpen} />
          </li>
        ))}
      </ul>
      {state.truncated ? (
        <p className="px-2 text-meta text-text-muted">
          Prikazane su najnovije. Ostale ideje za glasanje su u Idejama svakog projekta.
        </p>
      ) : null}
    </div>
  );
}

function PendingRow({
  item,
  now,
  boja,
  onOpen,
}: {
  item: InboxPendingModel;
  now: number;
  boja: string | null;
  onOpen: (item: InboxPendingModel) => void;
}) {
  // Ideja čeka glas („Glasaj“); stare vrste ostaju prepoznate.
  const vote = pendingIsVote(item);
  const Icon = item.kind === "idea_vote" ? Lightbulb : vote ? ShieldCheck : GitMerge;
  const title = pendingTitle(item);
  return (
    <div className="flex items-start gap-3 rounded-lg px-2 py-2.5">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-text-secondary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-medium leading-5 text-foreground [overflow-wrap:anywhere]">{title}</span>
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-meta text-text-muted">
          <ProjekatCip workspace={{ ...item.workspace, boja }} size="xs" />
          <span className="min-w-0 truncate">{item.workspace.name}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(item.createdAt).toISOString()} className="shrink-0 tabular-nums">
            {formatInboxTime(item.createdAt, now)}
          </time>
        </span>
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-inbox-row
        className="shrink-0"
        onClick={() => onOpen(item)}
        aria-label={`${vote ? "Glasaj" : "Pogledaj"}: ${title}`}
      >
        {vote ? "Glasaj" : "Pogledaj"}
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  );
}

function InboxError({ title, retry }: { title: string; retry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-1 px-6 py-10 text-center">
      <TriangleAlert className="mb-2 size-5 text-danger" aria-hidden="true" />
      <p className="text-ui font-medium text-foreground">{title}</p>
      <p className="max-w-sm text-meta leading-5 text-text-muted">Proveri vezu i pokušaj ponovo.</p>
      <Button type="button" variant="outline" className="mt-3" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Pokušaj ponovo
      </Button>
    </div>
  );
}
