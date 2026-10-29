"use client";

// Preneto iz Devotion apps/web/components/me/my-day/my-day-side.tsx (main @ c05c40f), SPAJANJE S19.
import { useId, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { formatDayRelative } from "@/lib/prostor";

import { CekaTe } from "@/components/app/hub/ceka-te";
import { CountBadge } from "@/components/app/system/count-badge";
import { JaLink } from "@/components/app/ja-link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import { StartupChip } from "@/components/app/prostor/zajednicko/projekat-cip";
import { NapredakKartica } from "@/components/app/prostor/danas/napredak-kartica";
import {
  CEKA_TE_DANAS,
  cipoviDanas,
  IDEJA_DANAS,
  IDEJA_DANAS_TELEFON,
  sastavDanas,
  type BlokDanas,
  type CekaTeDanas,
  type StanjeNapretka,
} from "@/lib/prostor/modeli/danas-model";
import { blockCount, type SideBlock, type SideChat, type SideInbox, type SidePending } from "@/lib/prostor/modeli/side-model";

export type MyDayStranaProps = {
  now: number;
  cekaTe: CekaTeDanas;
  napredak: StanjeNapretka;
  inbox: SideBlock<SideInbox>;
  chat: SideBlock<SideChat>;
  pending: SideBlock<SidePending>;
  onOpenInbox: () => void;
  onOpenChat: () => void;
  /** „Ideje za glasanje": ideja u svom projektu (detalj na tabli Ideja). */
  onOpenPending: (item: { workspaceId: string; ideaId: string }) => void;
};

/** Sidra blokova (čipovi ispod `xl` vode na njih). */
const SIDRO: Record<BlokDanas, string> = {
  cekaTe: "danas-ceka-te",
  napredak: "danas-napredak-blok",
  inbox: "danas-inbox",
  poruke: "danas-poruke",
  ideje: "danas-ideje",
};

/**
 * Desna kolona ekrana Danas (plan S18 §1.1): Čeka te iz svih projekata,
 * napredak, Inbox ukratko, nepročitane poruke i ideje za glasanje. Ispod
 * `xl` ista kolona ide ispod Moj dan. Sekcije nisu kartice: odvaja ih
 * razdelnik (jedina kartica je „Čeka te", isti prikaz kao na hubu). Blok
 * čiji upit padne se tiho skriva (Devotion D15); Napredak se ne crta kad je
 * isključen ili ne radi.
 */
export function MyDayStrana({
  now,
  cekaTe,
  napredak,
  inbox,
  chat,
  pending,
  onOpenInbox,
  onOpenChat,
  onOpenPending,
}: MyDayStranaProps) {
  const blokovi = sastavDanas(napredak);
  return (
    <aside aria-label="Sažetak dana" className="flex min-w-0 flex-col gap-5">
      {blokovi.map((blok) => {
        switch (blok) {
          case "cekaTe":
            return (
              <div key={blok} id={SIDRO.cekaTe} className="scroll-mt-24">
                <CekaTeBlok cekaTe={cekaTe} />
              </div>
            );
          case "napredak":
            return (
              <div key={blok} id={SIDRO.napredak} className="scroll-mt-24 border-t border-line pt-4">
                <NapredakKartica stanje={napredak} />
              </div>
            );
          case "inbox":
            return inbox.status === "hidden" ? null : (
              <Blok
                key={blok}
                id={SIDRO.inbox}
                naslov="Inbox"
                broj={blockCount(inbox, (data) => data.unread)}
                vise={inbox.status === "ready" && inbox.data.capped}
                opisBroja="nepročitanih obaveštenja"
                radnja="Otvori"
                onRadnja={onOpenInbox}
              >
                {inbox.status === "loading" ? (
                  <BlokSkeleton />
                ) : inbox.data.items.length === 0 ? (
                  <Prazno>Nema nepročitanih obaveštenja.</Prazno>
                ) : (
                  <ul className="flex flex-col">
                    {inbox.data.items.map((item) => (
                      <li key={item.id}>
                        <RedDugme onClick={onOpenInbox}>
                          <StartupChip workspace={item.workspace} size="xs" className="mt-0.5" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="line-clamp-2 text-ui text-foreground">{item.title}</span>
                            <span className="text-meta text-text-muted">
                              {item.workspace ? item.workspace.name : "Lično"} · {formatDayRelative(item.createdAt, now)}
                            </span>
                          </span>
                        </RedDugme>
                      </li>
                    ))}
                  </ul>
                )}
              </Blok>
            );
          case "poruke":
            return chat.status === "hidden" ? null : (
              <Blok
                key={blok}
                id={SIDRO.poruke}
                naslov="Poruke"
                broj={blockCount(chat, (data) => data.total)}
                opisBroja="nepročitanih poruka"
                radnja="Otvori"
                onRadnja={onOpenChat}
              >
                {chat.status === "loading" ? (
                  <BlokSkeleton redova={2} />
                ) : chat.data.total === 0 ? (
                  <Prazno>Sve poruke su pročitane.</Prazno>
                ) : (
                  <ul className="flex flex-col">
                    {chat.data.personal > 0 ? (
                      <RedPoruka workspace={null} naziv="Lično" neprocitano={chat.data.personal} onClick={onOpenChat} />
                    ) : null}
                    {chat.data.byStartup.map((entry) => (
                      <RedPoruka
                        key={entry.workspace._id}
                        workspace={entry.workspace}
                        naziv={entry.workspace.name}
                        neprocitano={entry.unread}
                        onClick={onOpenChat}
                      />
                    ))}
                  </ul>
                )}
              </Blok>
            );
          case "ideje":
            return pending.status === "hidden" ? null : (
              <Blok
                key={blok}
                id={SIDRO.ideje}
                naslov="Ideje za glasanje"
                broj={blockCount(pending, (data) => data.items.length)}
                vise={pending.status === "ready" && pending.data.truncated}
                opisBroja="ideja čeka tvoj glas"
                radnja="Inbox"
                onRadnja={onOpenInbox}
              >
                {pending.status === "loading" ? (
                  <BlokSkeleton redova={2} />
                ) : pending.data.items.length === 0 ? (
                  <Prazno>Niko ne čeka tvoj glas.</Prazno>
                ) : (
                  <ul className="flex flex-col">
                    {pending.data.items.slice(0, IDEJA_DANAS).map((item, index) => (
                      // Četvrta ideja je samo na širem ekranu (telefon: tri).
                      <li key={item.key} className={cn(index >= IDEJA_DANAS_TELEFON && "max-md:hidden")}>
                        <RedDugme onClick={() => onOpenPending({ workspaceId: item.workspace._id, ideaId: item.ideaId })}>
                          <StartupChip workspace={item.workspace} size="xs" className="mt-0.5" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="line-clamp-2 text-ui text-foreground">{item.title}</span>
                            <span className="text-meta text-text-muted">{item.workspace.name}</span>
                          </span>
                        </RedDugme>
                      </li>
                    ))}
                  </ul>
                )}
              </Blok>
            );
        }
      })}
    </aside>
  );
}

/** „Čeka te" iz svih projekata: postojeći prikaz huba + stanja Danas (plan S18 §1.5). */
function CekaTeBlok({ cekaTe }: { cekaTe: CekaTeDanas }) {
  if (cekaTe.stanje === "ucitava") {
    return (
      <section aria-label="Čeka te" aria-busy="true" className="flex flex-col gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <h2 className="text-copy font-bold text-foreground">Čeka te</h2>
        <BlokSkeleton />
      </section>
    );
  }
  if (cekaTe.stanje === "bez_projekata") {
    return (
      <section aria-labelledby="danas-ceka-te-naslov" className="flex flex-col gap-1 rounded-xl border border-line bg-card px-4 py-3">
        <h2 id="danas-ceka-te-naslov" className="text-copy font-bold text-foreground">
          Čeka te
        </h2>
        <p className="text-ui text-text-secondary">Nisi ni u jednom projektu.</p>
        <Button variant="link" size="sm" className="self-start px-0" nativeButton={false} render={<JaLink href="/projekti" />}>
          Svi projekti
        </Button>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <CekaTe zbir={cekaTe.zbir} najvise={CEKA_TE_DANAS} />
      {cekaTe.napomena ? (
        <p className="flex flex-wrap items-center gap-x-2 px-1 text-meta text-text-muted">
          {cekaTe.napomena}
          <JaLink href="/projekti" className="font-medium text-radnja underline-offset-2 hover:underline">
            Svi projekti
          </JaLink>
        </p>
      ) : null}
    </div>
  );
}

function Blok({
  id,
  naslov,
  broj,
  vise = false,
  opisBroja,
  radnja,
  onRadnja,
  children,
}: {
  id: string;
  naslov: string;
  broj: number | null;
  /** Izvor je odsečen: broj je donja granica („30+"). */
  vise?: boolean;
  /** Za čitač ekrana: „12 nepročitanih obaveštenja". */
  opisBroja: string;
  radnja: string;
  onRadnja: () => void;
  children: ReactNode;
}) {
  const naslovId = useId();
  return (
    <section id={id} aria-labelledby={naslovId} className="flex scroll-mt-24 flex-col gap-1.5 border-t border-line pt-4">
      <div className="flex min-h-8 items-center gap-2">
        <h2 id={naslovId} className="text-copy font-bold text-foreground">
          {naslov}
        </h2>
        {broj !== null && broj > 0 ? (
          vise ? (
            // Odsečen izvor: broj je donja granica, pa piše „30+" (CountBadge ume samo „99+").
            <span
              title={`${formatNumber(broj)}+ ${opisBroja}`}
              className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-surface-raised px-1.5 text-meta font-semibold leading-none tabular-nums text-foreground ring-1 ring-line"
            >
              <span aria-hidden>{formatNumber(broj)}+</span>
              <span className="sr-only">
                {formatNumber(broj)}+ {opisBroja}
              </span>
            </span>
          ) : (
            <CountBadge count={broj} label={`${formatNumber(broj)} ${opisBroja}`} />
          )
        ) : null}
        <Button variant="link" size="sm" className="ml-auto px-1" onClick={onRadnja} aria-label={`${radnja}: ${naslov}`}>
          {radnja}
          <ArrowRight data-icon="inline-end" aria-hidden />
        </Button>
      </div>
      {children}
    </section>
  );
}

function RedDugme({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-10 w-full min-w-0 items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
    >
      {children}
    </button>
  );
}

function RedPoruka({
  workspace,
  naziv,
  neprocitano,
  onClick,
}: {
  workspace: { name: string; logoUrl: string | null; boja?: string | null } | null;
  naziv: string;
  neprocitano: number;
  onClick: () => void;
}) {
  return (
    <li>
      <RedDugme onClick={onClick}>
        <StartupChip workspace={workspace} size="xs" className="mt-0.5" />
        <span className="min-w-0 flex-1 truncate text-ui text-foreground">{naziv}</span>
        <CountBadge count={neprocitano} label={`${formatNumber(neprocitano)} nepročitanih`} />
      </RedDugme>
    </li>
  );
}

function Prazno({ children }: { children: ReactNode }) {
  return <p className="px-1.5 py-1 text-ui text-text-muted">{children}</p>;
}

function BlokSkeleton({ redova = 3 }: { redova?: number }) {
  return (
    <div role="status" className="flex flex-col gap-2 px-1.5 py-1">
      <span className="sr-only">Učitavanje…</span>
      {Array.from({ length: redova }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", index % 2 === 0 ? "w-full" : "w-2/3")} />
      ))}
    </div>
  );
}

/**
 * Ispod `xl` (plan S18 D7): jedna traka sažetih čipova sa sidrima na blokove
 * ispod Moj dan. Čip se vidi samo kad ima nešto (> 0); nepoznat broj ili blok
 * koji je pao se ne crta.
 */
export function SazetakCipovi({
  cekaTe,
  inbox,
  chat,
  pending,
}: Pick<MyDayStranaProps, "cekaTe" | "inbox" | "chat" | "pending">) {
  const cipovi = cipoviDanas({
    cekaTe: { broj: cekaTe.stanje === "projekti" && !cekaTe.zbir.ucitava ? cekaTe.zbir.ukupno : null },
    inbox: { broj: blockCount(inbox, (data) => data.unread), vise: inbox.status === "ready" && inbox.data.capped },
    poruke: { broj: blockCount(chat, (data) => data.total) },
    ideje: { broj: blockCount(pending, (data) => data.items.length), vise: pending.status === "ready" && pending.data.truncated },
  });
  if (cipovi.length === 0) return null;
  const sidro: Record<(typeof cipovi)[number]["kljuc"], string> = {
    cekaTe: SIDRO.cekaTe,
    inbox: SIDRO.inbox,
    poruke: SIDRO.poruke,
    ideje: SIDRO.ideje,
  };
  return (
    <nav aria-label="Sažetak dana" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:hidden">
      {cipovi.map((cip) => (
        <a
          key={cip.kljuc}
          href={`#${sidro[cip.kljuc]}`}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface-control px-3 text-ui text-foreground transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        >
          {cip.naziv}
          <span className="font-semibold tabular-nums">
            {cip.broj > 99 ? "99+" : formatNumber(cip.broj)}
            {cip.vise && cip.broj <= 99 ? "+" : ""}
          </span>
        </a>
      ))}
    </nav>
  );
}
