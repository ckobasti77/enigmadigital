"use client";


// Preneto iz Devotion apps/web/components/workspace/chat/message-list.tsx (main @ c05c40f), SPAJANJE S15.
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePaginatedQuery } from "convex/react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ChevronDown, LoaderCircle, MessagesSquare } from "lucide-react";

import { CountBadge } from "@/components/app/system/count-badge";
import { MessageRow } from "@/components/app/prostor/poruke/message-row";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import type { ProfileWithAvatar } from "@/lib/prostor/rute";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import {
  formatDaySeparator,
  sameDay,
  shouldGroupWithPrevious,
  type ChatChannel,
  type ChatMember,
  type ChatMessage,
} from "@/lib/prostor/web/chat";
import { ARRIVE_Y, DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";

gsap.registerPlugin(useGSAP);

/**
 * Optimistička poruka iz kompozitora ima id iz `crypto.randomUUID()` (sa
 * crticama); Convex id-jevi crtice nemaju.
 */
function isOptimisticMessageId(id: string): boolean {
  return id.includes("-");
}

export function MessageList({
  channel,
  profile,
  members,
  onReply,
  onAtBottomChange,
  scrollToBottomSignal = 0,
  preview,
  animateArrivals = false,
}: {
  channel: ChatChannel;
  profile: ProfileWithAvatar;
  members: ChatMember[] | undefined;
  onReply: (message: ChatMessage) => void;
  /**
   * „Korisnik gleda dno" — prijavljuje se samo kad se BOOLEAN promeni, ne na svaki
   * `onScroll`. Roditelj od toga pravi prisustvo (`use-chat-presence.ts`): jedini
   * slučaj u kome nova poruka ne pravi obaveštenje.
   */
  onAtBottomChange?: (atBottom: boolean) => void;
  /**
   * Broj koji roditelj uveća kad korisnik POŠALJE poruku. Bitna je samo promena,
   * ne vrednost — skok na dno tako ne čeka da poruka obiđe server.
   */
  scrollToBottomSignal?: number;
  /**
   * Izlog: statične poruke (najnovija PRVA, kao `chat.messages`) umesto
   * pretplate. U aplikaciji se ne prosleđuje.
   */
  preview?: ChatMessage[];
  /** Nova poruka na dnu ulazi kratkim pomakom nagore; prvo punjenje i starije ne. */
  animateArrivals?: boolean;
}) {
  const live = usePaginatedQuery(
    api.prostor.chat.messages,
    preview ? "skip" : { channelId: channel._id },
    { initialNumItems: 30 },
  );
  const results = preview ?? live.results;
  const status = preview ? "Exhausted" : live.status;
  const loadMore = live.loadMore;
  const logRef = useRef<HTMLDivElement>(null);
  const arrivalIdRef = useRef<string | null>(null);
  /** Prva strana je stigla pre ovog rendera (prazan razgovor je „učitan"). */
  const arrivalLoadedRef = useRef(false);

  /**
   * Ulaz nove poruke: samo poslednji red u logu (poruka koja je STIGLA posle
   * prvog punjenja) ulazi neprozirnošću i kratkim pomakom nagore. Prvo punjenje
   * i „Učitaj starije" ne menjaju najnoviju poruku, pa ne okidaju ništa; zamena
   * optimističke poruke serverskom nije nova poruka. Smanjen pokret: samo
   * neprozirnost. Skriven tab se ne animira.
   */
  useGSAP(
    () => {
      const newest = results[0];
      const previousId = arrivalIdRef.current;
      const wasLoaded = arrivalLoadedRef.current;
      arrivalIdRef.current = newest?._id ?? null;
      arrivalLoadedRef.current = status !== "LoadingFirstPage";
      if (!animateArrivals || !newest || newest._id === previousId) return;
      // Prvo punjenje nije „nova poruka"; prva poruka u praznom razgovoru jeste.
      if (previousId === null && !wasLoaded) return;
      if (previousId !== null && !isOptimisticMessageId(newest._id) && isOptimisticMessageId(previousId)) return;
      if (document.visibilityState !== "visible") return;
      const row = logRef.current?.lastElementChild;
      if (!(row instanceof HTMLElement)) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        gsap.fromTo(
          row,
          still ? { opacity: 0 } : { opacity: 0, y: ARRIVE_Y },
          {
            opacity: 1,
            ...(still ? {} : { y: 0 }),
            duration: still ? DUR_REDUCED : DUR_UI,
            ease: still ? "none" : EASE_UI,
            clearProps: "opacity,transform",
          },
        );
      });
    },
    { dependencies: [results, status, animateArrivals] },
  );

  // Backend vraća najnovije prvo; chat se čita odozdo, pa render obrćemo
  // (najstarije gore, najnovije dole) i „starije" učitavamo skrolom nagore.
  const ordered = useMemo(() => [...results].reverse(), [results]);
  // Citirana poruka odgovora — razrešava se iz već učitanog prozora.
  const byId = useMemo(
    () => new Map(results.map((message) => [message._id, message])),
    [results],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const nearBottomRef = useRef(true);
  const loadingOlderRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const newestIdRef = useRef<string | null>(null);
  const firstSignalRef = useRef(true);
  /** Koliko je TUĐIH poruka stiglo dok korisnik nije gledao dno. */
  const [newCount, setNewCount] = useState(0);
  const [showJump, setShowJump] = useState(false);

  /**
   * `nearBottomRef` je namerno ref (čita se iz efekata koji se ne smeju vezivati na
   * svaki skrol), pa se promena prijavljuje roditelju kroz ovu jednu tačku — i to
   * SAMO kad se boolean stvarno promeni, ne na svaki `onScroll`.
   */
  const reportAtBottom = useCallback(
    (next: boolean) => {
      if (nearBottomRef.current === next) return;
      nearBottomRef.current = next;
      onAtBottomChange?.(next);
    },
    [onAtBottomChange],
  );

  // Prvo montiranje: lista starta na dnu, pa i prisustvo mora da krene odatle.
  useEffect(() => {
    onAtBottomChange?.(nearBottomRef.current);
  }, [onAtBottomChange]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    reportAtBottom(true);
    setNewCount(0);
    setShowJump(false);
  }, [reportAtBottom]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    reportAtBottom(distanceFromBottom < 120);
    setShowJump(distanceFromBottom > 240);
    // Vratio se na dno = video je sve; brojač nema više šta da broji.
    if (nearBottomRef.current) setNewCount(0);
    if (
      el.scrollTop < 120 &&
      status === "CanLoadMore" &&
      !loadingOlderRef.current
    ) {
      loadingOlderRef.current = true;
      prevScrollHeightRef.current = el.scrollHeight;
      prevScrollTopRef.current = el.scrollTop;
      loadMore(30);
    }
  }

  // Očuvanje pozicije skrola: starije poruke ne smeju da „skoče" prikaz, a nova
  // poruka drži dno ako korisnik već gleda dno.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingOlderRef.current) {
      el.scrollTop =
        prevScrollTopRef.current +
        (el.scrollHeight - prevScrollHeightRef.current);
      loadingOlderRef.current = false;
      return;
    }
    if (!didInitialScrollRef.current && ordered.length > 0) {
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
      return;
    }
    if (nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [ordered.length]);

  /**
   * Slanje poruke uvek vraća na dno. Bez ovoga korisnik napiše poruku dok čita
   * stariji deo razgovora, poruka ode — a on je ne vidi i deluje kao da nije
   * poslata.
   */
  useEffect(() => {
    if (firstSignalRef.current) {
      firstSignalRef.current = false;
      return;
    }
    scrollToBottom();
  }, [scrollToBottomSignal, scrollToBottom]);

  /**
   * Nove poruke dok korisnik čita gore. `results[0]` je najnovija (backend vraća
   * najnovije prvo), pa se promena vrha poredi sa zapamćenim id-jem — reakcije i
   * izmene menjaju `results` bez nove poruke i ne smeju da broje.
   */
  useEffect(() => {
    const newest = results[0];
    if (!newest) return;

    const previousId = newestIdRef.current;
    newestIdRef.current = newest._id;

    if (previousId === null) return; // prvo punjenje
    if (newest._id === previousId) return; // nema nove poruke

    if (newest.authorProfileId === profile._id) {
      scrollToBottom();
      return;
    }
    if (nearBottomRef.current) return; // već gleda dno

    const index = results.findIndex((message) => message._id === previousId);
    setNewCount((count) => count + (index === -1 ? 1 : index));
  }, [results, profile._id, scrollToBottom]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5"
      >
        {status === "LoadingFirstPage" ? (
          <div className="space-y-4">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="flex gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="Još niko nije pisao"
              description="Napiši prvu poruku."
              className="max-w-md border-none bg-transparent"
            />
          </div>
        ) : (
          <div
            ref={logRef}
            className="mx-auto flex w-full max-w-3xl flex-col"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label="Poruke"
          >
            {status === "CanLoadMore" || status === "LoadingMore" ? (
              <div className="flex justify-center py-2">
                {status === "LoadingMore" ? (
                  <LoaderCircle className="size-4 animate-spin text-text-secondary" aria-hidden="true" />
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-meta text-text-secondary"
                    onClick={() => loadMore(30)}
                  >
                    Učitaj starije
                  </Button>
                )}
              </div>
            ) : null}

            {ordered.map((message, index) => {
              const previous = ordered[index - 1];
              const showDay =
                index === 0 || !sameDay(message.createdAt, previous.createdAt);
              const grouped =
                !showDay && shouldGroupWithPrevious(message, previous);
              return (
                <Fragment key={message._id}>
                  {showDay ? (
                    <DaySeparator timestamp={message.createdAt} />
                  ) : null}
                  <MessageRow
                    message={message}
                    grouped={grouped}
                    profile={profile}
                    members={members}
                    repliedTo={
                      message.replyToMessageId
                        ? (byId.get(message.replyToMessageId) ?? null)
                        : null
                    }
                    onReply={onReply}
                  />
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Dugme se vidi i kad korisnik nije daleko od dna, samo ako ima novih
          poruka — brojač bez dugmeta koje ga nosi nema smisla. */}
      {showJump || newCount > 0 ? (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={
            newCount > 0
              ? `${newCount} ${newCount === 1 ? "nova poruka" : "novih poruka"}, skoči na dno`
              : "Skoči na najnovije poruke"
          }
          className="absolute bottom-4 right-4 grid size-11 place-items-center rounded-full border border-line-soft bg-card text-foreground shadow-lg transition-colors hover:bg-surface-control-hover"
        >
          <ChevronDown className="size-5" aria-hidden="true" />
          <CountBadge
            count={newCount}
            tone="neutral"
            className="absolute -right-1.5 -top-1.5 border-2 border-background"
          />
        </button>
      ) : null}
    </div>
  );
}

function DaySeparator({ timestamp }: { timestamp: number }) {
  return (
    <div className="my-3 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      <span className="px-1 text-meta font-medium text-text-muted">
        {formatDaySeparator(timestamp)}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
