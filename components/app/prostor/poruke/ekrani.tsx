"use client";

import type { ReactNode } from "react";
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Lock, MessagesSquare } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { useMoze, useProjekat } from "@/components/app/projekat-provider";
import { useDokumenti } from "@/components/app/prostor/dokumenti/dokumenti-kontekst";
import { useProstorNavigacija } from "@/components/app/prostor/use-prostor-navigacija";
import { WorkspaceErrorBoundary } from "@/components/app/prostor/zajednicko/granica-greske";
import { EmptyState } from "@/components/app/prostor/zajednicko/radni-ui";
import { useToday } from "@/components/app/prostor/zajednicko/use-danas";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ProjektnaRuta } from "@/lib/prostor/rute";
import { jeOblikId } from "@/lib/prostor/web/oblik-id";

import { ChatHubContainer } from "./chat-hub-container";
import { ChatHubSkeleton } from "./chat-hub-skeleton";
import { ChatView } from "./chat-view";

/**
 * ============================================================================
 * EKRANI PORUKA (SPAJANJE S15, plan S07 §1.1, §10 S15)
 * ============================================================================
 *
 * `/poruke` (opseg „Ja“): hub svih razgovora — lični DM, lične grupe i kanali
 * svih mojih projekata (`chat.listConversations`). Kanal projekta se otvara u
 * mestu, a „Otvori u projektu“ vodi na `/<projekat>/poruke?kanal=…`.
 *
 * `/<projekat>/poruke`: kanali tog projekta (Opšte, oblasti, kanali tima,
 * diskusije) i direktne poruke tima (`chat.listChannels`).
 *
 * Izabran razgovor je u adresi (`?kanal=`): izbor dodaje unos u istoriju (na
 * telefonu „Nazad“ pregledača vraća na spisak), a „Nazad na razgovore“ ga
 * menja. Okvir ima visinu ekrana, pa spisak i razgovor klize svaki za sebe, a
 * polje za poruku stoji dole.
 */

/** Okvir dva okna: visina ostatka ekrana ispod zaglavlja (telefon: iznad donje trake). */
function OkvirPoruka({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-[26rem] flex-col overflow-hidden rounded-xl border border-line bg-card md:h-[calc(100dvh-11.5rem)]">
      {children}
    </div>
  );
}

function kanalIzAdrese(vrednost: string | null): Id<"chatChannels"> | null {
  return vrednost && jeOblikId(vrednost) ? (vrednost as Id<"chatChannels">) : null;
}

// --- „Ja“ ---------------------------------------------------------------------

export function PorukeJaEkran() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        title="Poruke"
        description="Lične poruke, grupe i kanali svih tvojih projekata."
      />
      <WorkspaceErrorBoundary title="Poruke nisu učitane." className="min-h-[20rem]">
        <PorukeJaSadrzaj />
      </WorkspaceErrorBoundary>
    </div>
  );
}

function PorukeJaSadrzaj() {
  const parametri = useSearchParams();
  const kanal = kanalIzAdrese(parametri.get("kanal"));
  const today = useToday();
  const profil = useQuery(api.prostor.profiles.getCurrent);
  const { idi } = useProstorNavigacija();

  const izaberi = useCallback(
    (channelId: Id<"chatChannels">) => idi({ kind: "me-chat", channelId }),
    [idi],
  );
  const nazad = useCallback(() => idi({ kind: "me-chat" }, { zameni: true }), [idi]);
  const uProjekat = useCallback(
    (
      workspaceId: Id<"workspaces">,
      cilj: { pageId: Id<"pages"> } | { route: ProjektnaRuta },
    ) => {
      const ruta: ProjektnaRuta = "pageId" in cilj ? { kind: "page", pageId: cilj.pageId } : cilj.route;
      idi(ruta, { projekat: workspaceId });
    },
    [idi],
  );

  if (profil === undefined) {
    return (
      <OkvirPoruka>
        <ChatHubSkeleton />
      </OkvirPoruka>
    );
  }
  if (profil === null) {
    return (
      <EmptyState
        icon={MessagesSquare}
        headingAs="h2"
        title="Poruke još nisu spremne."
        description="Profil tima se pravi pri prvom ulasku. Osveži stranicu."
      />
    );
  }
  return (
    <OkvirPoruka>
      <ChatHubContainer
        today={today}
        profile={profil}
        channelId={kanal}
        onSelectChannel={izaberi}
        onBackToList={nazad}
        onOpenInStartup={uProjekat}
      />
    </OkvirPoruka>
  );
}

// --- Projekat -----------------------------------------------------------------

export function PorukeProjektaEkran() {
  return (
    <div className="flex w-full flex-1 flex-col gap-6">
      <PageHeader
        variant="module"
        title="Poruke"
        description="Kanali oblasti, diskusije i direktne poruke tima."
      />
      <WorkspaceErrorBoundary title="Poruke nisu učitane." className="min-h-[20rem]">
        <PorukeProjektaSadrzaj />
      </WorkspaceErrorBoundary>
    </div>
  );
}

function PorukeProjektaSadrzaj() {
  const { uloga } = useProjekat();
  const sme = useMoze("urednik");
  const { projekat, profil } = useDokumenti();
  const parametri = useSearchParams();
  const kanal = kanalIzAdrese(parametri.get("kanal"));
  const { idi } = useProstorNavigacija();

  const izaberi = useCallback(
    (channelId: Id<"chatChannels">) => idi({ kind: "chat", channelId }),
    [idi],
  );
  const nazad = useCallback(() => idi({ kind: "chat" }, { zameni: true }), [idi]);
  const otvoriStranicu = useCallback(
    (pageId: Id<"pages">) => idi({ kind: "page", pageId }),
    [idi],
  );

  if (uloga !== null && !sme) {
    return (
      <EmptyState
        icon={Lock}
        headingAs="h2"
        title="Poruke nisu dostupne."
        description="Tvoja uloga u ovom projektu vidi samo brojeve."
      />
    );
  }
  if (!projekat || !profil) {
    return (
      <OkvirPoruka>
        <ChatHubSkeleton />
      </OkvirPoruka>
    );
  }
  return (
    <OkvirPoruka>
      <ChatView
        key={projekat._id}
        workspace={projekat}
        profile={profil}
        channelId={kanal ?? undefined}
        onSelectChannel={izaberi}
        onOpenList={nazad}
        onOpenPage={otvoriStranicu}
      />
    </OkvirPoruka>
  );
}
