"use client";

import type { ReactElement, ReactNode, Ref } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CountBadge, BedzNaUglu } from "@/components/app/system/count-badge";
import { unreadMessagesPhrase, unreadPhrase } from "@/lib/prostor/web/opseg";
import { cn } from "@/lib/utils";
import { JaLink } from "./ja-link";
import { ActiveBar, ModuleTile, RED_TRAKE_IZABRAN } from "./module-tile";
import { activeJaHref, jaNavItems, type NavItem } from "./nav-items";
import {
  useBrojeviJa,
  useJaNalog,
  useNeprocitano,
  useProjektiTrake,
} from "./podaci-ljuske";
import { useEkranPutanja } from "./projekat-provider";
import { ProjekatZnak } from "./projekat-znak";
import { QuietBoundary } from "./quiet-boundary";

/**
 * ============================================================================
 * MENI „JA“ (SPAJANJE P14, plan S07 §2.1; port Devotion `me-sidebar`)
 * ============================================================================
 *
 * Pored trake projekata, kad nijedan projekat nije izabran: moj profil, pet
 * ličnih ekrana (Danas, Moji zadaci, Inbox, Poruke, Beleške) sa brojevima, i
 * kratak spisak projekata sa brojem mojih otvorenih zadataka u svakom (klik
 * vodi na početnu projekta).
 *
 * Isti oblik kao meni projekta: ista širina, ista šina (64 px, pamti je
 * `AppShell`), isti redovi i ista boja mesta (Kontrolna tabla, D5). Broj je
 * informacija, ne uzbuna: neutralan bedž, a bez posla bedža nema.
 */
export function MeniJa({
  rail,
  onToggleRail,
  ref,
}: {
  rail: boolean;
  onToggleRail: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const ekran = useEkranPutanja();
  const aktivan = activeJaHref(ekran);
  const nalog = useJaNalog();

  return (
    <TooltipProvider delay={200}>
      <aside
        ref={ref}
        data-module="tabla"
        className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col md:left-[var(--traka-width)] md:flex"
      >
        <div
          className={cn(
            "flex h-[var(--chrome-height)] shrink-0 items-center",
            rail ? "justify-center gap-0.5 px-1" : "gap-2.5 pl-3 pr-2.5",
          )}
        >
          {!rail && (
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              {nalog === undefined ? (
                <>
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-24" />
                </>
              ) : (
                <>
                  <Avatar size="sm" className="size-7">
                    {nalog.avatarUrl && <AvatarImage src={nalog.avatarUrl} alt="" />}
                    <AvatarFallback>{nalog.inicijali}</AvatarFallback>
                  </Avatar>
                  <span data-nav-fade className="flex min-w-0 flex-col">
                    <span className="truncate text-ui font-medium text-foreground">{nalog.ime}</span>
                    <span className="truncate text-meta text-text-muted">Moj prostor</span>
                  </span>
                </>
              )}
            </div>
          )}
          <Tip
            label={rail ? "Proširi bočnu traku" : "Skupi bočnu traku"}
            side={rail ? "right" : "bottom"}
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onToggleRail}
                aria-expanded={!rail}
                aria-controls="meni-ja-nav"
                aria-label={rail ? "Proširi bočnu traku" : "Skupi bočnu traku"}
                className="shrink-0 text-text-muted hover:text-foreground"
              />
            }
          >
            {rail ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Tip>
        </div>

        <nav
          id="meni-ja-nav"
          aria-label="Moj prostor"
          className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-2.5 pb-2 pt-1"
        >
          <ul className="flex flex-col gap-px">
            {jaNavItems.map((item) => (
              <RedJa key={item.href} item={item} aktivan={aktivan === item.href} rail={rail} />
            ))}
          </ul>

          {!rail && (
            <section aria-labelledby="meni-ja-projekti" className="mt-4 flex min-h-0 flex-col">
              <h2
                id="meni-ja-projekti"
                data-nav-fade
                className="heading-caps flex h-4 items-center pl-[9px] text-micro text-text-muted"
              >
                Projekti
              </h2>
              <QuietBoundary fallback={<SpisakProjekata otvoreno={null} />}>
                <SpisakSaBrojem />
              </QuietBoundary>
            </section>
          )}
        </nav>
      </aside>
    </TooltipProvider>
  );
}

/** Oblačić sa nazivom oko kontrole koja ima samo ikonicu. */
function Tip({
  label,
  side,
  render,
  children,
}: {
  label: string;
  side: "right" | "bottom" | "top";
  render: ReactElement;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={render}>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function RedJa({ item, aktivan, rail }: { item: NavItem; aktivan: boolean; rail: boolean }) {
  const klase = cn(
    "group relative flex items-center gap-2.5 rounded-lg pl-[9px] pr-2 text-ui font-medium transition-colors",
    rail ? "h-9" : "h-[30px]",
    aktivan
      ? RED_TRAKE_IZABRAN
      : "text-text-secondary hover:bg-sidebar-accent/60 hover:text-foreground",
  );
  const sadrzaj = (
    <>
      {aktivan && <ActiveBar />}
      <ModuleTile icon={item.icon} active={aktivan} />
      <span data-nav-fade className={rail ? "sr-only" : "min-w-0 flex-1 truncate"}>
        {item.label}
      </span>
      <QuietBoundary>
        <BrojJa href={item.href} rail={rail} />
      </QuietBoundary>
    </>
  );
  return (
    <li>
      {rail ? (
        <Tip
          label={item.label}
          side="right"
          render={
            <JaLink href={item.href} aria-current={aktivan ? "page" : undefined} className={klase} />
          }
        >
          {sadrzaj}
        </Tip>
      ) : (
        <JaLink href={item.href} aria-current={aktivan ? "page" : undefined} className={klase}>
          {sadrzaj}
        </JaLink>
      )}
    </li>
  );
}

/**
 * Broj uz stavku: Danas (otvoreno za danas), Inbox i Poruke (nepročitano).
 * Moji zadaci i Beleške nemaju broj, kao u Devotionu.
 */
function BrojJa({ href, rail }: { href: string; rail: boolean }) {
  if (href === "/") return <BrojDanas rail={rail} />;
  if (href === "/inbox" || href === "/poruke") return <BrojNeprocitanog href={href} rail={rail} />;
  return null;
}

function BrojDanas({ rail }: { rail: boolean }) {
  const brojevi = useBrojeviJa();
  const broj = brojevi?.danas ?? 0;
  const opis = brojevi?.odseceno
    ? "više od 99 za danas"
    : `${broj} za danas`;
  return rail ? (
    <BedzNaUglu count={broj} tone="neutral" ugao="sina" label={opis} />
  ) : (
    <CountBadge count={broj} tone="neutral" label={opis} />
  );
}

function BrojNeprocitanog({ href, rail }: { href: "/inbox" | "/poruke"; rail: boolean }) {
  const { inbox, poruke } = useNeprocitano();
  const inboxBroj = inbox?.count ?? 0;
  const broj = href === "/inbox" ? inboxBroj : (poruke ?? 0);
  const odseceno = href === "/inbox" && inbox?.capped === true;
  const opis =
    href === "/inbox" ? unreadPhrase(broj, odseceno) : unreadMessagesPhrase(broj);
  const prikaz = odseceno ? 100 : broj;
  return rail ? (
    <BedzNaUglu count={prikaz} tone="neutral" ugao="sina" label={opis} />
  ) : (
    <CountBadge count={prikaz} tone="neutral" label={opis} />
  );
}

function SpisakSaBrojem() {
  const brojevi = useBrojeviJa();
  return <SpisakProjekata otvoreno={brojevi === undefined ? undefined : brojevi.otvorenoPoProjektu} />;
}

/**
 * Projekti sa brojem mojih otvorenih dodeljenih zadataka. `otvoreno`:
 * `undefined` dok se čita, `null` kad broj nije dostupan (tada se ne piše).
 */
function SpisakProjekata({ otvoreno }: { otvoreno: Record<string, number> | null | undefined }) {
  const projekti = useProjektiTrake(null);
  if (projekti === undefined) {
    return (
      <div aria-hidden className="flex flex-col gap-1 px-2 pt-1.5">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }
  if (projekti.length === 0) {
    return <p className="px-[9px] pt-1.5 text-meta text-text-muted">Nisi član nijednog projekta.</p>;
  }
  return (
    <ul className="flex flex-col gap-px pt-1">
      {projekti.map((p) => {
        const broj = otvoreno?.[p.workspaceId] ?? (otvoreno ? 0 : null);
        return (
          <li key={p.workspaceId}>
            <JaLink
              href={`/${p.slug}`}
              aria-label={
                broj === null ? p.ime : `${p.ime}, moji otvoreni zadaci: ${broj}`
              }
              className="flex h-[30px] items-center gap-2.5 rounded-lg pl-[9px] pr-2 text-ui text-text-secondary transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
            >
              <ProjekatZnak projekat={p} velicina="sm" />
              <span className="min-w-0 flex-1 truncate">{p.ime}</span>
              {broj !== null && broj > 0 && (
                <span aria-hidden className="shrink-0 text-meta tabular-nums text-text-muted">
                  {broj}
                </span>
              )}
            </JaLink>
          </li>
        );
      })}
    </ul>
  );
}
