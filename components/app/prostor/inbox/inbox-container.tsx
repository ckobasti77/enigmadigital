"use client";

// Preneto iz Devotion apps/web/components/me/inbox/inbox-container.tsx (main @ c05c40f), SPAJANJE S17.
import { Component, useRef, useState, type ReactNode } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import {
  inboxFeedArgs,
  inboxMarkAllArgs,
  inboxMarkedMessage,
  inboxScopeKey,
  pendingIdeaVotes,
  type InboxScope,
  type InboxSegment,
} from "@/lib/prostor/inbox";

import { useQueryState, useQueryTolerant } from "@/components/app/prostor/podaci/ja";
import { useShortcuts } from "@/components/app/prostor/precice/precice-provider";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { INBOX_SHORTCUTS } from "@/lib/prostor/precice/registar";
import { accessErrorMessage } from "@/lib/prostor/web/greske";
import type { Today } from "@/lib/prostor/web/danas";
import { toast } from "@/lib/toast";

import { useOtvoriObavestenje } from "./notifications-panel";
import {
  InboxView,
  type InboxFeedState,
  type InboxItemModel,
  type InboxPendingModel,
  type InboxPendingState,
  type InboxProjekat,
} from "./inbox-view";

export type InboxContainerProps = {
  today: Today;
  /** Moji aktivni projekti, redom ljuske (čipovi opsega). */
  workspaces: ReadonlyArray<InboxProjekat>;
  /** Dijalog podešavanja obaveštenja (živi na ekranu). */
  onOpenSettings: () => void;
};

const PAGE_SIZE = 25;

type FeedArgs = { workspaceId?: Id<"workspaces"> | null; unreadOnly?: boolean };

/**
 * Inbox: `inbox.feed` (paginirano), `inbox.unreadCounts`, `inbox.pending` i
 * `inbox.markAllRead` — sve lično (moji projekti i lične poruke). Klik na red
 * označi pročitano pa otvara cilj (`useOtvoriObavestenje`, isto kao zvono i
 * toast). Greška feed-a i greška „Čeka tebe“ su odvojene: feed baca iz
 * `usePaginatedQuery`, pa ga hvata `FeedBoundary`, a „Čeka tebe“ ide kroz
 * `useQueryState`. „Pokušaj ponovo“ ponovo montira kontejner (nova pretplata).
 */
export function InboxContainer(props: InboxContainerProps) {
  const [attempt, setAttempt] = useState(0);
  // Kartica i opseg žive iznad ponovnog montiranja: „Pokušaj ponovo“ ih ne vraća na „Sve / Svi“.
  const [segment, setSegment] = useState<InboxSegment>("all");
  const [scope, setScope] = useState<InboxScope>({ kind: "all" });
  return (
    <InboxContent
      key={attempt}
      {...props}
      retry={() => setAttempt((value) => value + 1)}
      segment={segment}
      setSegment={setSegment}
      scope={scope}
      setScope={setScope}
    />
  );
}

function InboxContent({
  today,
  workspaces,
  onOpenSettings,
  retry,
  segment,
  setSegment,
  scope,
  setScope,
}: InboxContainerProps & {
  retry: () => void;
  segment: InboxSegment;
  setSegment: (segment: InboxSegment) => void;
  scope: InboxScope;
  setScope: (scope: InboxScope) => void;
}) {
  const [markingAll, setMarkingAll] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const counts = useQueryTolerant(api.prostor.inbox.unreadCounts, {}) ?? null;
  // „Čeka tebe“: ideje u fazi „Razmatra se“ bez mog glasa.
  const pendingQuery = useQueryState(api.prostor.inbox.pending, { include: ["idea_vote"] });
  const markRead = useMutation(api.prostor.notifications.markRead);
  const markAllRead = useMutation(api.prostor.inbox.markAllRead);
  const otvori = useOtvoriObavestenje();

  // Čip koji više ne postoji (napušten projekat) vraća prikaz na „Svi“.
  const effectiveScope: InboxScope =
    scope.kind === "startup" && !workspaces.some((workspace) => workspace._id === scope.workspaceId)
      ? { kind: "all" }
      : scope;

  const pending: InboxPendingState =
    pendingQuery.status === "loading"
      ? { status: "loading" }
      : pendingQuery.status === "error"
        ? { status: "error", retry }
        : {
            status: "ready",
            // Stare vrste (glasanje o brisanju, ugnežđavanje) se ne crtaju.
            items: pendingIdeaVotes(pendingQuery.data.items as ReadonlyArray<InboxPendingModel>),
            truncated: pendingQuery.data.truncated,
          };

  // Prečice: 1/2/3 menjaju karticu, j/k pomeraju fokus kroz redove.
  useShortcuts(Object.values(INBOX_SHORTCUTS), (id) => {
    if (id === INBOX_SHORTCUTS.all.id) setSegment("all");
    else if (id === INBOX_SHORTCUTS.unread.id) setSegment("unread");
    else if (id === INBOX_SHORTCUTS.pending.id) setSegment("pending");
    else if (id === INBOX_SHORTCUTS.next.id || id === INBOX_SHORTCUTS.prev.id) {
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]") ?? []);
      if (rows.length === 0) return false;
      // Fokus na pomoćnom dugmetu reda („Označi kao pročitano“) računa se kao taj red.
      const active = document.activeElement as HTMLElement | null;
      const holder = active?.closest("li");
      const current = rows.findIndex(
        (row) => row === active || (holder !== null && holder !== undefined && holder.contains(row)),
      );
      const step = id === INBOX_SHORTCUTS.next.id ? 1 : -1;
      const next =
        current === -1 ? (step === 1 ? 0 : rows.length - 1) : Math.min(rows.length - 1, Math.max(0, current + step));
      rows[next]?.focus();
    }
  });

  const open = (item: InboxItemModel) =>
    otvori({ ...item, _id: item._id as Id<"notifications"> });

  /** Najava se prvo isprazni, da čitač ekrana ponovi isti tekst. */
  const announce = (message: string) => {
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(message), 50);
  };

  const markOne = (item: InboxItemModel) => {
    // Dugme i (u „Nepročitano“) ceo red nestaju: fokus ide na sledeći red, ili na prethodni.
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-inbox-row]") ?? []);
    const index = rows.findIndex((row) => row.closest("li")?.contains(document.activeElement));
    const neighbour = index === -1 ? null : (rows[index + 1] ?? rows[index - 1] ?? null);
    void markRead({ notificationId: item._id as Id<"notifications"> })
      .then(() => {
        announce("Označeno kao pročitano.");
        if (neighbour?.isConnected) neighbour.focus();
      })
      .catch((error: unknown) => toast.error(accessErrorMessage(error, "Označavanje nije uspelo.")));
  };

  const openPending = (item: InboxPendingModel) =>
    otvori({
      // „Čeka tebe“ nije obaveštenje: nema šta da se označi.
      workspaceId: item.workspace._id,
      targetType: item.targetType,
      targetId: item.targetId,
    });

  const markAll = async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const result = await markAllRead(inboxMarkAllArgs(effectiveScope) as { workspaceId?: Id<"workspaces"> | null });
      const message = inboxMarkedMessage(result);
      toast.success(message);
      announce(message);
    } catch (error) {
      toast.error(accessErrorMessage(error, "Označavanje nije uspelo."));
    } finally {
      setMarkingAll(false);
    }
  };

  const renderView = (feed: InboxFeedState) => (
    <InboxView
      now={today.now}
      segment={segment}
      onSegmentChange={setSegment}
      scope={effectiveScope}
      onScopeChange={setScope}
      workspaces={workspaces}
      counts={counts}
      feed={feed}
      pending={pending}
      onOpen={open}
      onMarkRead={markOne}
      onOpenPending={openPending}
      onMarkAllRead={() => void markAll()}
      markingAll={markingAll}
      onOpenSettings={onOpenSettings}
      announcement={announcement}
      listRef={listRef}
    />
  );

  return (
    <FeedBoundary retry={retry} render={renderView} resetKey={`${segment}|${inboxScopeKey(effectiveScope)}`}>
      <FeedBridge args={inboxFeedArgs(effectiveScope, segment) as FeedArgs} render={renderView} />
    </FeedBoundary>
  );
}

/** Pretplata na feed; stanje daje prikazu (bacanje greške hvata `FeedBoundary`). */
function FeedBridge({ args, render }: { args: FeedArgs; render: (feed: InboxFeedState) => ReactNode }) {
  const { results, status, loadMore } = usePaginatedQuery(api.prostor.inbox.feed, args, {
    initialNumItems: PAGE_SIZE,
  });
  const feed: InboxFeedState =
    status === "LoadingFirstPage"
      ? { status: "loading" }
      : {
          status: "ready",
          items: results as ReadonlyArray<InboxItemModel>,
          canLoadMore: status === "CanLoadMore",
          loadingMore: status === "LoadingMore",
          onLoadMore: () => loadMore(PAGE_SIZE),
        };
  return <>{render(feed)}</>;
}

/**
 * `usePaginatedQuery` baca grešku servera tokom crtanja. Granica je ovde, oko
 * samo feed-a, da zaglavlje, kartice i „Čeka tebe“ ostanu živi i da greška
 * feed-a bude odvojena od greške „Čeka tebe“.
 */
class FeedBoundary extends Component<
  {
    children: ReactNode;
    retry: () => void;
    render: (feed: InboxFeedState) => ReactNode;
    /** Promena kartice ili opsega je nova pretplata: greška starog filtera ne važi. */
    resetKey: string;
  },
  { failed: boolean }
> {
  state = { failed: false };

  componentDidUpdate(previous: { resetKey: string }) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.render({ status: "error", retry: this.props.retry });
    return this.props.children;
  }
}
