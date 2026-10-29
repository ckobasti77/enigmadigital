"use client";


// Preneto iz Devotion apps/web/components/me/chat/chat-hub-view.tsx (main @ c05c40f), SPAJANJE S15.
import { useRef, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { MessagesSquare, SquarePen } from "lucide-react";
import { hubIsEmpty, type HubGroup } from "@/lib/prostor/chat-hub";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { ARRIVE_Y, DUR_REDUCED, DUR_UI, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

import { HubList, type HubListState } from "@/components/app/prostor/poruke/hub-list";

gsap.registerPlugin(useGSAP);

/** Od ove širine lista i razgovor stoje jedno pored drugog (E10: `xl`). */
export const HUB_SPLIT_QUERY = "(min-width: 80rem)";

function visible(element: HTMLElement | null): HTMLElement | null {
  return element && element.getClientRects().length > 0 ? element : null;
}

/**
 * Kuda fokus posle dijaloga kad je element koji ga je otvorio sakriven (uzak
 * ekran prešao na razgovor ili nazad na listu): dugme zaglavlja razgovora,
 * pretraga razgovora, pa samo okno razgovora.
 */
export function hubFocusFallback(): HTMLElement | null {
  return (
    visible(document.querySelector<HTMLElement>("[data-hub-conversation] header button")) ??
    visible(document.querySelector<HTMLElement>("[data-hub-search]")) ??
    visible(document.querySelector<HTMLElement>("[data-hub-conversation]"))
  );
}

export type ChatHubViewProps = {
  now: number;
  meId: string;
  state: HubListState;
  groups: ReadonlyArray<HubGroup>;
  query: string;
  onQueryChange: (query: string) => void;
  onToggleGroup: (key: string) => void;
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
  onNewMessage: () => void;
  onNewGroup: () => void;
  /** Otvoren razgovor (`ConversationPane` ili njegovo stanje); `null` bez izbora. */
  conversation: ReactNode;
  searchRef?: RefObject<HTMLInputElement | null>;
};

/**
 * Poruke (K15, plan K07 §1.6): levo hub razgovora, desno razgovor. Dva panela
 * tek od `xl` (E10); ispod toga se vidi lista ILI razgovor, kao na telefonu.
 *
 * Pokret: promena otvorenog razgovora je događaj, ne ulazak ekrana. Na širokom
 * ekranu okno razgovora ulazi neprozirnošću uz `ARRIVE_Y` nagore; na uskom
 * lista ↔ razgovor ulazi bočno u smeru kretanja. Smanjen pokret: samo
 * neprozirnost. Prvo crtanje se ne animira.
 */
export function ChatHubView({
  now,
  meId,
  state,
  groups,
  query,
  onQueryChange,
  onToggleGroup,
  activeChannelId,
  onSelect,
  onNewMessage,
  onNewGroup,
  conversation,
  searchRef,
}: ChatHubViewProps) {
  const listPaneRef = useRef<HTMLDivElement>(null);
  const conversationPaneRef = useRef<HTMLDivElement>(null);
  const previousRef = useRef(activeChannelId);

  // Jedan efekat: vraćanje fokusa (uzak ekran) i ulaz okna pri promeni razgovora.
  useGSAP(
    () => {
      const previous = previousRef.current;
      previousRef.current = activeChannelId;
      if (previous === activeChannelId) return;
      const wide = window.matchMedia(HUB_SPLIT_QUERY).matches;
      // Uzak ekran, povratak na listu: lista ulazi s leve strane.
      const target = !wide && activeChannelId === null ? listPaneRef.current : conversationPaneRef.current;
      if (!target) return;
      const sideways = !wide && (previous === null || activeChannelId === null);
      const direction = activeChannelId === null ? -1 : 1;

      // Uzak ekran: element sa fokusom (red liste, „Nazad") upravo je sakriven.
      // Fokus ide u razgovor (prvo dugme zaglavlja), a pri povratku na red
      // razgovora koji je bio otvoren (ili na pretragu).
      const focused = document.activeElement;
      const lost =
        !(focused instanceof HTMLElement) ||
        focused === document.body ||
        !focused.isConnected ||
        focused.getClientRects().length === 0;
      if (!wide && lost) {
        if (activeChannelId === null) {
          const row = previous
            ? listPaneRef.current?.querySelector<HTMLElement>(`[data-channel-id="${CSS.escape(previous)}"]`)
            : null;
          const fallback = listPaneRef.current?.querySelector<HTMLElement>("input[type=search]");
          const next = row && row.getClientRects().length > 0 ? row : fallback;
          next?.focus({ preventScroll: true });
          next?.scrollIntoView({ block: "nearest" });
        } else {
          const pane = conversationPaneRef.current;
          (pane?.querySelector<HTMLElement>("header button") ?? pane)?.focus({ preventScroll: true });
        }
      }

      const mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        gsap.fromTo(
          target,
          still ? { opacity: 0 } : sideways ? { opacity: 0, x: direction * ARRIVE_Y } : { opacity: 0, y: ARRIVE_Y },
          {
            opacity: 1,
            ...(still ? {} : sideways ? { x: 0 } : { y: 0 }),
            duration: still ? DUR_REDUCED : DUR_UI,
            ease: still ? "none" : EASE_UI,
            clearProps: "opacity,transform",
            overwrite: "auto",
          },
        );
      });
    },
    // Svaka promena razgovora vraća prethodni tvin pre novog (nema gomilanja slušalaca).
    { dependencies: [activeChannelId], revertOnUpdate: true },
  );

  const selected = activeChannelId !== null;
  const empty = state.status === "ready" && hubIsEmpty(state.input);

  return (
    <div className="flex h-full min-h-0 overflow-x-clip">
      <div
        ref={listPaneRef}
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-r border-line xl:flex xl:w-80",
          selected ? "hidden" : "flex",
        )}
      >
        <div className="flex h-full min-h-0 flex-col">
          <HubList
            now={now}
            meId={meId}
            state={state}
            groups={groups}
            query={query}
            onQueryChange={onQueryChange}
            onToggleGroup={onToggleGroup}
            activeChannelId={activeChannelId}
            onSelect={onSelect}
            onNewMessage={onNewMessage}
            onNewGroup={onNewGroup}
            searchRef={searchRef}
          />
        </div>
      </div>

      <div
        ref={conversationPaneRef}
        tabIndex={-1}
        aria-label={selected ? "Otvoren razgovor" : undefined}
        role={selected ? "region" : undefined}
        data-hub-conversation=""
        className={cn("min-h-0 min-w-0 flex-1 flex-col outline-none", selected ? "flex" : "hidden xl:flex")}
      >
        <div className="flex h-full min-h-0 flex-col">
          {selected ? (
            conversation
          ) : state.status !== "ready" ? null : (
            <div className="flex h-full items-center justify-center p-6">
              {empty ? (
                <EmptyState
                  headingAs="h2"
                  icon={MessagesSquare}
                  title="Još nemaš razgovora"
                  description="Pošalji poruku nekome iz tima ili napravi grupu."
                  action={
                    <Button variant="outline" type="button" size="sm" onClick={onNewMessage}>
                      <SquarePen aria-hidden="true" />
                      Nova poruka
                    </Button>
                  }
                  className="max-w-md border-none bg-transparent"
                />
              ) : (
                <EmptyState
                  headingAs="h2"
                  icon={MessagesSquare}
                  title="Izaberi razgovor"
                  description="Otvori razgovor sa leve strane."
                  className="max-w-md border-none bg-transparent"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
