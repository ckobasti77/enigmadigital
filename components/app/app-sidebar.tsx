"use client";

import { Fragment, type ReactElement, type ReactNode, type Ref } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Unfold } from "@/components/motion/unfold";
import { cn } from "@/lib/utils";
import {
  NAPREDAK_HREF,
  activeChannelTab,
  activeHref,
  navChildrenFor,
  navSections,
  screenExists,
  settingsNavItem,
  type NavItem,
} from "./nav-items";
import { ModuleTile } from "./module-tile";
import { NavBadge } from "./nav-badge";
import { PlayerCard, initialsOf } from "./system/player-card";
import {
  napredakZaKarticu,
  useNapredak,
  useSada,
} from "./napredak/use-napredak";
import { useEkranPutanja, useProjekat } from "./projekat-provider";
import { ProjekatBirac } from "./projekat-birac";

/**
 * ============================================================================
 * BOČNA TRAKA v2 (UI Boost §7.1)
 * ============================================================================
 *
 * Svaka stavka nosi `data-module`, pa pločica i aktivno stanje čitaju `--mod*`
 * SVOG modula — ikonica je u svojoj boji i kad stavka nije aktivna. Boja ovde
 * ima jednu ulogu: mesto.
 *
 * Dva znaka, dva pitanja:
 *   crta uz levu ivicu + puna pločica   u kom si modulu
 *   pilula u tinti modula               na kom si tačno ekranu
 * Kod stavke bez podekrana to je isti red; kod modula sa podekranima pilulu
 * nosi podstavka, pa na ekranu nikad nisu dve.
 *
 * Podstavke se vide samo za aktivni modul, u dve kolone: sa njima u jednoj
 * koloni traka ne staje u 695 px visine, a to je vlasnikov stvarni ekran.
 *
 * Šina (64 px): pločice stoje na istom mestu kao u punoj traci, nestaju samo
 * natpisi. Naziv tada daje oblačić, a čitaču ekrana natpis koji ostaje u
 * stablu. Izbor pamti `AppShell`.
 */

/** Bedž preko gornjeg desnog ugla pločice, u šini. */
const RAIL_BADGE = "absolute left-[26px] top-0 h-4 min-w-4 px-1 text-[10px]";

export function AppSidebar({
  rail,
  onToggleRail,
  ref,
}: {
  rail: boolean;
  onToggleRail: () => void;
  ref?: Ref<HTMLElement>;
}) {
  const pathname = useEkranPutanja();
  // Najduže poklapanje bira modul: „/instagram/objave/<id>" pada na
  // „/instagram", nikad bez oznake.
  const activeParent = activeHref(pathname);

  return (
    <TooltipProvider delay={200}>
      <aside
        ref={ref}
        className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col md:flex"
      >
        <div
          className={cn(
            "flex h-[var(--chrome-height)] shrink-0 items-center",
            rail ? "justify-center gap-0.5 px-1" : "gap-1 px-2.5",
          )}
        >
          {/* Čiji je ovo ekran: birač projekta (u panelu samo znak i ime). */}
          <ProjekatBirac rail={rail} />
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
                aria-controls="app-sidebar-nav"
                aria-label={rail ? "Proširi bočnu traku" : "Skupi bočnu traku"}
                className={cn("shrink-0 text-text-muted hover:text-foreground", rail && "w-5")}
              />
            }
          >
            {rail ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Tip>
        </div>

        <nav
          id="app-sidebar-nav"
          aria-label="Glavna navigacija"
          className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-2.5 pb-1 pt-1"
        >
          {navSections.map((section, index) => (
            <div
              key={section.title}
              role="group"
              aria-label={section.title}
              className={cn(!rail && index > 0 && "mt-1.5")}
            >
              {rail ? (
                index > 0 && (
                  <div aria-hidden className="mx-2 my-2 h-px bg-line-soft" />
                )
              ) : (
                <p
                  aria-hidden
                  data-nav-fade
                  className="heading-caps flex h-4 items-center pl-[9px] text-micro text-text-muted"
                >
                  {section.title}
                </p>
              )}
              <ul className="flex flex-col gap-px">
                {section.items.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    active={activeParent === item.href}
                    rail={rail}
                  />
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <SidebarFooter
          rail={rail}
          settingsActive={activeParent === settingsNavItem.href}
        />
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

/** Crta uz levu ivicu trake: u kom si modulu. Ne meri se, pa preživi reflow. */
function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute -left-2.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-mod"
    />
  );
}

function NavRow({
  item,
  pathname,
  active,
  rail,
}: {
  item: NavItem;
  pathname: string;
  active: boolean;
  rail: boolean;
}) {
  const tabs = navChildrenFor(item.href);
  // Jedan jedini podekran nije izbor, pa se ne crta kao podstavka.
  const children = tabs && tabs.length > 1 ? tabs : undefined;
  const activeChild =
    active && children ? activeChannelTab(pathname, children) : undefined;
  // Pilula stoji na tačnom ekranu: na samom redu kad nema podstavki (ili su u
  // šini sakrivene), inače na podstavci.
  const filled = active && (!children || rail);

  const rowClass = cn(
    "group relative flex items-center gap-2.5 rounded-lg pl-[9px] pr-2 text-ui font-medium transition-colors",
    rail ? "h-9" : "h-[30px]",
    filled
      ? "bg-mod-soft text-foreground"
      : active
        ? "text-foreground"
        : "text-text-secondary hover:bg-sidebar-accent/60 hover:text-foreground",
  );
  const current = active
    ? activeChild && activeChild !== item.href
      ? "true"
      : "page"
    : undefined;

  const content = (
    <>
      {active && <ActiveBar />}
      <ModuleTile icon={item.icon} active={active} />
      <span
        data-nav-fade
        className={rail ? "sr-only" : "min-w-0 flex-1 truncate"}
      >
        {item.label}
      </span>
      <NavBadge
        href={item.href}
        label={item.label}
        className={rail ? RAIL_BADGE : undefined}
      />
    </>
  );

  return (
    <li data-module={item.module}>
      {rail ? (
        <Tip
          label={item.label}
          side="right"
          render={
            <ProjekatLink href={item.href} aria-current={current} className={rowClass} />
          }
        >
          {content}
        </Tip>
      ) : (
        <ProjekatLink href={item.href} aria-current={current} className={rowClass}>
          {content}
        </ProjekatLink>
      )}

      {children && !rail && (
        <Unfold open={active}>
          <ul
            data-nav-fade
            aria-label={`${item.label}: podekrani`}
            className="grid grid-cols-2 gap-x-1 gap-y-px pb-1.5 pl-[9px] pt-1"
          >
            {children.map((tab, i) => {
              const selected = tab.href === activeChild;
              // Grupe podekrana (Analitika) deli tanka linija, ne natpis:
              // natpis po grupi bi traku vratio preko visine ekrana.
              const newGroup = i > 0 && tab.group !== children[i - 1].group;
              return (
                <Fragment key={tab.href}>
                  {newGroup && (
                    <li
                      aria-hidden
                      className="col-span-2 mx-2 my-0.5 h-px bg-line-soft"
                    />
                  )}
                  <li className="min-w-0">
                    <ProjekatLink
                      href={tab.href}
                      aria-current={selected ? "page" : undefined}
                      title={tab.label}
                      className={cn(
                        "flex h-6 items-center rounded-md px-2 text-ui transition-colors",
                        selected
                          ? "bg-mod-soft font-medium text-mod"
                          : "text-text-secondary hover:bg-sidebar-accent/60 hover:text-foreground",
                      )}
                    >
                      <span className="truncate">{tab.label}</span>
                    </ProjekatLink>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </Unfold>
      )}
    </li>
  );
}

/**
 * Dno: čiji su ovo podaci (kartica igrača) i zupčanik Podešavanja. U jednom
 * redu, jer je visina ono čega na ovom ekranu nema.
 */
function SidebarFooter({
  rail,
  settingsActive,
}: {
  rail: boolean;
  settingsActive: boolean;
}) {
  const { ime, korisnik, spreman } = useProjekat();
  const napredak = useNapredak();
  const sada = useSada();
  const item = settingsNavItem;

  return (
    <div
      className={cn(
        "material-edge-t flex shrink-0 items-center gap-1 px-2 py-1.5",
        rail && "flex-col",
      )}
    >
      <PlayerCard
        loading={!spreman}
        rail={rail}
        initials={initialsOf(korisnik?.ime ?? korisnik?.email ?? ime)}
        title={ime ?? "Projekat"}
        subtitle={korisnik?.email ?? undefined}
        progress={napredakZaKarticu(napredak, sada)}
        href={screenExists(NAPREDAK_HREF) ? NAPREDAK_HREF : undefined}
        className={rail ? "w-11" : "flex-1"}
      />
      <span data-module={item.module} className="shrink-0">
        <Tip
          label={item.label}
          side={rail ? "right" : "top"}
          render={
            <ProjekatLink
              href={item.href}
              aria-label={item.label}
              aria-current={settingsActive ? "page" : undefined}
              className={cn(
                "relative flex size-9 items-center justify-center rounded-lg transition-colors",
                settingsActive
                  ? "bg-mod-soft"
                  : "hover:bg-sidebar-accent/60",
              )}
            />
          }
        >
          <ModuleTile icon={item.icon} active={settingsActive} />
          <NavBadge
            href={item.href}
            label={item.label}
            className="absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]"
          />
        </Tip>
      </span>
    </div>
  );
}
