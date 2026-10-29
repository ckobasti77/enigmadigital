"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { LayoutGrid, Plus, Trophy, X } from "lucide-react";
import { Drawer } from "@/components/ui/drawer";
import { BedzNaUglu } from "@/components/app/system/count-badge";
import { unreadMessagesPhrase, unreadPhrase } from "@/lib/prostor/web/opseg";
import { cn } from "@/lib/utils";
import {
  NAPREDAK_HREF,
  NOVI_PROJEKAT_HREF,
  NOVI_PROJEKAT_POSTOJI,
  SVI_PROJEKTI_HREF,
  activeHref,
  donjaTraka,
  donjaTrakaHub,
  jaNavItems,
  korpaNavItem,
  navItems,
  podekraniRadnogDela,
  radSekcija,
  resolveModule,
  settingsNavItem,
  vidljiveSekcije,
  type CelijaDonjeTrake,
  type NavItem,
} from "./nav-items";
import { JaLink } from "./ja-link";
import { MOBILE_TAB, MOBILE_TAB_ICON } from "./mobile-tab";
import { ModuleTile } from "./module-tile";
import { NavBadge } from "./nav-badge";
import { NotificationsBell } from "./notifications-bell";
import { useOpseg } from "./opseg-ljuske";
import {
  useJaNalog,
  useNeprocitano,
  usePoslednjiProjekat,
  useProjektiTrake,
  useStanjeProjekata,
} from "./podaci-ljuske";
import {
  useEkranPutanja,
  useModulUkljucen,
  useProjekatOpciono,
} from "./projekat-provider";
import { ProjekatZnak } from "./projekat-znak";
import { QuietBoundary } from "./quiet-boundary";

/**
 * Događaj ljuske: otvori list „Više“ (dodir na znak opsega u zaglavlju na
 * telefonu, P15). Kontrole su daleko jedna od druge, pa dele poruku na
 * `window`, kao ⌘K.
 */
export const VISE_EVENT = "enigma:vise";

/**
 * Donja traka na telefonu (SPAJANJE P15, plan S07 §2.6). U hubu: Danas ·
 * Projekat · Zadaci · Poruke · Više, u oba opsega. Panel domen (jedan
 * projekat, D4) zadržava traku od pre spajanja.
 */
export function MobileNav() {
  const panel = useProjekatOpciono()?.rezim === "panel";
  return panel ? <DonjaTrakaPanela /> : <DonjaTrakaHuba />;
}

/**
 * ============================================================================
 * DONJA TRAKA PANELA NA TELEFONU (UI Boost §7.3)
 * ============================================================================
 *
 * Pet ćelija, nikad više i nikad vodoravno klizanje: tri ekrana koja se
 * otvaraju svaki dan, „Danas" (zvono, pod palcem) i „Više".
 *
 * „Više" otvara list sa SVIH trinaest modula kao obojenim pločicama, pa ništa
 * što je bilo u staroj traci od devet stavki nije dalje od dva dodira — a
 * Threads i Podešavanja, kojih tamo nije ni bilo, sada jesu. Kada si na
 * ekranu koji nije u traci, „Više" nosi boju njegovog modula: traka i tada
 * kaže gde si.
 */
function DonjaTrakaPanela() {
  const pathname = useEkranPutanja();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeHref(pathname);
  // Isključen modul projekta nema ćeliju; mesto mu popuni sledeća stavka.
  const ukljucen = useModulUkljucen();
  const mobileBarItems = donjaTraka(ukljucen);
  const inBar = mobileBarItems.some((item) => item.href === active);

  // List postoji samo na telefonu: ako se prozor raširi dok je otvoren,
  // zatvara se, da modalna zamka fokusa ne ostane iza nevidljivog lista.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (wide.matches) setMoreOpen(false);
    };
    wide.addEventListener("change", close);
    return () => wide.removeEventListener("change", close);
  }, []);

  return (
    <>
      <nav
        aria-label="Glavna navigacija"
        className="material material-edge-t edge-fade-t fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {mobileBarItems.map((item) => {
          const isActive = item.href === active;
          const Icon = item.icon;
          return (
            <ProjekatLink
              key={item.href}
              href={item.href}
              data-module={item.module}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                MOBILE_TAB,
                isActive ? "text-foreground" : "text-text-muted",
              )}
            >
              {isActive && <ActiveMark />}
              <span
                className={cn(
                  MOBILE_TAB_ICON,
                  "text-mod",
                  isActive && "bg-mod-soft",
                )}
              >
                <Icon className="size-5" />
                {/* Ista pravila kao u bočnoj traci: bez posla — bez bedža. */}
                <NavBadge
                  href={item.href}
                  label={item.label}
                  ugao="tab"
                />
              </span>
              <span className="max-w-full truncate px-1">
                {item.short ?? item.label}
              </span>
            </ProjekatLink>
          );
        })}

        {/* Ćelija postoji i kad zvono ćuti (upit pao), da mreža ostane pet. */}
        <div className="flex">
          <NotificationsBell variant="tab" />
        </div>

        <button
          type="button"
          data-module={inBar ? undefined : resolveModule(pathname)}
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            MOBILE_TAB,
            inBar && !moreOpen ? "text-text-muted" : "text-foreground",
          )}
        >
          {!inBar && <ActiveMark />}
          <span
            className={cn(
              MOBILE_TAB_ICON,
              !inBar && "bg-mod-soft text-mod",
              inBar && moreOpen && "bg-surface-raised",
            )}
          >
            <LayoutGrid className="size-5" aria-hidden />
          </span>
          <span>Više</span>
        </button>
      </nav>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} active={active} />
    </>
  );
}

/** Crta na vrhu aktivne ćelije, u boji njenog modula. */
function ActiveMark() {
  return (
    <span aria-hidden className="absolute top-0 h-0.5 w-6 rounded-full bg-mod" />
  );
}

/**
 * List „Više": svi moduli u mreži od tri kolone. Postojeći `Dialog` primitiv
 * (fokus-zamka, `Esc`, zatamnjenje) prikačen za dno ekrana. Prelaz je CSS, ne
 * keyframe — kreće od zatečene vrednosti, pa je prekidiv, a pod
 * `prefers-reduced-motion` globalno pravilo ga svede na neprozirnost.
 */
function MoreSheet({
  open,
  onOpenChange,
  active,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: string | undefined;
}) {
  const ukljucen = useModulUkljucen();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm md:hidden",
            "transition-opacity duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:opacity-0 data-open:opacity-100 data-starting-style:opacity-0",
          )}
        />
        <DialogPrimitive.Popup
          data-slot="more-sheet"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-xl border-t border-line bg-surface-raised pb-[env(safe-area-inset-bottom)] shadow-elev-3 outline-hidden md:hidden",
            "transition-[transform,opacity] duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:translate-y-full data-closed:opacity-0",
            "data-open:translate-y-0 data-open:opacity-100",
            "data-starting-style:translate-y-full data-starting-style:opacity-0",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 pl-4 pr-1.5 pt-1.5">
            <DialogPrimitive.Title className="text-copy font-medium text-foreground">
              Svi moduli
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Zatvori"
              className="flex size-11 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <ul className="grid min-h-0 grid-cols-3 gap-1 overflow-y-auto px-3 pb-4">
            {navItems.filter((item) => ukljucen(item.module)).map((item) => {
              const isActive = item.href === active;
              return (
                <li key={item.href} data-module={item.module}>
                  <ProjekatLink
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center text-meta transition-colors",
                      isActive
                        ? "bg-mod-soft font-medium text-foreground"
                        : "text-text-secondary active:bg-surface",
                    )}
                  >
                    <span className="relative">
                      <ModuleTile
                        icon={item.icon}
                        size="lg"
                        active={isActive}
                      />
                      <NavBadge
                        href={item.href}
                        label={item.label}
                        ugao="ikonica"
                      />
                    </span>
                    <span className="max-w-full truncate">{item.label}</span>
                  </ProjekatLink>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ── Hub (SPAJANJE P15) ──────────────────────────────────────────────────────

/** Koja ćelija je „ovde si“: Danas i Moji zadaci u „Ja“, Projekat u projektu… */
function aktivnaCelija(
  opseg: "ja" | "projekat",
  ekran: string,
): CelijaDonjeTrake["kljuc"] {
  const prvi = ekran.split("/").filter(Boolean)[0] ?? "";
  if (opseg === "ja") {
    if (ekran === "/") return "danas";
    if (prvi === "moji-zadaci") return "zadaci";
    if (prvi === "poruke") return "poruke";
    return "vise";
  }
  if (ekran === "/") return "projekat";
  if (prvi === "zadaci") return "zadaci";
  if (prvi === "poruke") return "poruke";
  return "vise";
}

/**
 * ============================================================================
 * DONJA TRAKA U HUBU (SPAJANJE P15, plan S07 D9)
 * ============================================================================
 *
 * Telefon nema traku projekata ni meni, pa pet ćelija nosi ono što se radi
 * svaki dan: Danas, Projekat (tekući, u „Ja“ poslednji), Zadaci i Poruke (u
 * opsegu u kome si), i „Više“ sa spiskom projekata, ličnim ekranima, radnim
 * delom i svim modulima. Zvono „Čeka te“ je u zaglavlju.
 */
function DonjaTrakaHuba() {
  const opseg = useOpseg();
  const projekat = useProjekatOpciono();
  const ekran = useEkranPutanja();
  const poslednji = usePoslednjiProjekat();
  const slugTekuci = opseg === "projekat" ? (projekat?.slug ?? null) : null;
  const celije = donjaTrakaHub({ opseg, slugTekuci, slugPoslednji: poslednji });
  const aktivna = aktivnaCelija(opseg, ekran);
  const projekti = useProjektiTrake(slugTekuci);
  const [vise, setVise] = useState(false);

  // Dodir na znak opsega u zaglavlju otvara isti list.
  useEffect(() => {
    const otvori = () => setVise(true);
    window.addEventListener(VISE_EVENT, otvori);
    return () => window.removeEventListener(VISE_EVENT, otvori);
  }, []);

  // List postoji samo na telefonu: ako se prozor raširi dok je otvoren,
  // zatvara se, da modalna zamka fokusa ne ostane iza nevidljivog lista.
  useEffect(() => {
    const siroko = window.matchMedia("(min-width: 768px)");
    const zatvori = () => {
      if (siroko.matches) setVise(false);
    };
    siroko.addEventListener("change", zatvori);
    return () => siroko.removeEventListener("change", zatvori);
  }, []);

  return (
    <>
      <nav
        aria-label="Glavna navigacija"
        data-module="tabla"
        className="material material-edge-t edge-fade-t fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {celije.map((celija) => {
          const ovde = celija.kljuc === aktivna;
          if (celija.href === null) {
            return (
              <button
                key={celija.kljuc}
                type="button"
                onClick={() => setVise(true)}
                aria-haspopup="dialog"
                aria-expanded={vise}
                className={cn(MOBILE_TAB, ovde || vise ? "text-foreground" : "text-text-muted")}
              >
                {ovde && <ActiveMark />}
                <span className={cn(MOBILE_TAB_ICON, (ovde || vise) && "bg-mod-soft")}>
                  <LayoutGrid className="size-5" aria-hidden />
                </span>
                <span>{celija.label}</span>
              </button>
            );
          }
          const Icon = celija.icon;
          const znak =
            celija.kljuc === "projekat" && celija.slug
              ? (projekti?.find((p) => p.slug === celija.slug) ??
                (projekat?.slug === celija.slug && projekat.ime !== null
                  ? { ime: projekat.ime, boja: projekat.brend.boja, logoUrl: projekat.brend.logoUrl }
                  : null))
              : null;
          return (
            <JaLink
              key={celija.kljuc}
              href={celija.href}
              aria-current={ovde ? "page" : undefined}
              className={cn(MOBILE_TAB, ovde ? "text-foreground" : "text-text-muted")}
            >
              {ovde && <ActiveMark />}
              <span className={cn(MOBILE_TAB_ICON, ovde && "bg-mod-soft")}>
                {znak ? (
                  <ProjekatZnak projekat={znak} velicina="sm" />
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
                {celija.kljuc === "poruke" && (
                  <QuietBoundary>
                    <BedzPoruka opseg={opseg} workspaceId={projekat?.workspaceId ?? null} />
                  </QuietBoundary>
                )}
              </span>
              <span className="max-w-full truncate px-1">{celija.label}</span>
            </JaLink>
          );
        })}
      </nav>

      <ListVise open={vise} onOpenChange={setVise} />
    </>
  );
}

/** Nepročitane poruke: u „Ja“ sve, u projektu samo tog projekta. */
function BedzPoruka({
  opseg,
  workspaceId,
}: {
  opseg: "ja" | "projekat";
  workspaceId: string | null;
}) {
  const { poruke, porukePoProjektu } = useNeprocitano();
  const broj =
    opseg === "ja" || workspaceId === null
      ? (poruke ?? 0)
      : (porukePoProjektu[workspaceId] ?? 0);
  if (broj <= 0) return null;
  return (
    <BedzNaUglu count={broj} tone="neutral" ugao="tab" label={unreadMessagesPhrase(broj)} />
  );
}

/**
 * ============================================================================
 * LIST „VIŠE“ (SPAJANJE P15, plan S07 §2.2)
 * ============================================================================
 *
 * Fioka odozdo: projekti (red znakova, „Svi projekti“, „+“), lični ekrani
 * kojih nema u traci (Inbox, Beleške), a u projektu još i radni deo (Ideje,
 * Dokumenti, Beleške, Puls tima, Aktivnost), pločice Enigminih modula po
 * grupama i dno: Korpa, Napredak, Podešavanja. Ništa iz menija nije dalje
 * od dva dodira.
 */
function ListVise({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const opseg = useOpseg();
  const projekat = useProjekatOpciono();
  const uProjektu = opseg === "projekat" && projekat !== null;
  const zatvori = () => onOpenChange(false);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} strana="dole" title="Projekti i ekrani">
      <div className="flex flex-col gap-5">
        <Odeljak naslov="Projekti">
          <ProjektiURedu zatvori={zatvori} />
        </Odeljak>

        <Odeljak naslov="Ja">
          <MrezaStavki>
            {jaNavItems
              .filter((i) => i.href === "/inbox" || i.href === "/beleske")
              .map((item) => (
                <StavkaLista key={item.href} item={item} ja zatvori={zatvori} />
              ))}
          </MrezaStavki>
        </Odeljak>

        {uProjektu && <OdeljciProjekta zatvori={zatvori} />}
      </div>
    </Drawer>
  );
}

function Odeljak({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="heading-caps text-micro text-text-muted">{naslov}</h3>
      {children}
    </section>
  );
}

function MrezaStavki({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-3 gap-1">{children}</ul>;
}

/** Pločica u listu: ikonica modula i naziv, 84 px visine (dodir ≥ 44 px). */
function StavkaLista({
  item,
  ja = false,
  zatvori,
  label,
}: {
  item: NavItem;
  ja?: boolean;
  zatvori: () => void;
  label?: string;
}) {
  const Veza = ja ? JaLink : ProjekatLink;
  return (
    <li data-module={item.module}>
      <Veza
        href={item.href}
        onClick={zatvori}
        className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-xl px-1 py-2 text-center text-meta text-text-secondary transition-colors active:bg-surface"
      >
        <span className="relative">
          <ModuleTile icon={item.icon} size="lg" />
          {ja && item.href === "/inbox" && (
            <QuietBoundary>
              <BedzInbox />
            </QuietBoundary>
          )}
          {!ja && <NavBadge href={item.href} label={item.label} ugao="ikonica" />}
        </span>
        <span className="max-w-full truncate">{label ?? item.label}</span>
      </Veza>
    </li>
  );
}

function BedzInbox() {
  const { inbox } = useNeprocitano();
  const broj = inbox?.count ?? 0;
  if (broj <= 0) return null;
  return (
    <BedzNaUglu
      count={inbox?.capped ? 100 : broj}
      tone="neutral"
      ugao="ikonica"
      label={unreadPhrase(broj, inbox?.capped)}
    />
  );
}

/** Red znakova projekata, pa „Svi projekti“ i „+“ (vlasnik platforme). */
function ProjektiURedu({ zatvori }: { zatvori: () => void }) {
  const projekat = useProjekatOpciono();
  const opseg = useOpseg();
  const tekuci = opseg === "projekat" ? (projekat?.slug ?? null) : null;
  const projekti = useProjektiTrake(tekuci);
  const nalog = useJaNalog();
  return (
    <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {projekti?.map((p) => (
        <li key={p.workspaceId} className="shrink-0">
          <JaLink
            href={`/${p.slug}`}
            onClick={zatvori}
            aria-current={p.slug === tekuci ? "true" : undefined}
            className="flex w-[4.5rem] flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-meta text-text-secondary transition-colors active:bg-surface aria-[current=true]:text-foreground"
          >
            <span className="relative">
              <ProjekatZnak projekat={p} velicina="traka" />
              <QuietBoundary>
                <TackaProjekta workspaceId={p.workspaceId} />
              </QuietBoundary>
            </span>
            <span className="max-w-full truncate">{p.ime}</span>
          </JaLink>
        </li>
      ))}
      <li className="shrink-0">
        <JaLink
          href={SVI_PROJEKTI_HREF}
          onClick={zatvori}
          className="flex w-[4.5rem] flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-meta text-text-secondary transition-colors active:bg-surface"
        >
          <span className="grid size-9 place-items-center rounded-[10px] bg-surface text-text-muted ring-1 ring-line">
            <LayoutGrid className="size-4" aria-hidden />
          </span>
          <span className="max-w-full truncate">Svi projekti</span>
        </JaLink>
      </li>
      {nalog?.platformaVlasnik && NOVI_PROJEKAT_POSTOJI && (
        <li className="shrink-0">
          <JaLink
            href={NOVI_PROJEKAT_HREF}
            onClick={zatvori}
            className="flex w-[4.5rem] flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-meta text-text-secondary transition-colors active:bg-surface"
          >
            <span className="grid size-9 place-items-center rounded-[10px] border border-dashed border-line-strong text-text-muted">
              <Plus className="size-4" aria-hidden />
            </span>
            <span className="max-w-full truncate">Novi projekat</span>
          </JaLink>
        </li>
      )}
    </ul>
  );
}

/** Tačka na znaku: u projektu ima nepročitanog ili posla koji čeka. */
function TackaProjekta({ workspaceId }: { workspaceId: string }) {
  const { bedzevi } = useNeprocitano();
  const stanja = useStanjeProjekata();
  const ceka = stanja?.get(workspaceId)?.ceka ?? 0;
  if (!bedzevi.startupDots[workspaceId] && ceka <= 0) return null;
  return (
    <span
      aria-hidden
      className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-foreground ring-2 ring-surface-raised"
    />
  );
}

/** Radni deo, moduli po grupama i dno (Korpa, Napredak, Podešavanja). */
function OdeljciProjekta({ zatvori }: { zatvori: () => void }) {
  const projekat = useProjekatOpciono();
  const ukljucen = useModulUkljucen();
  const radniDeo = projekat?.uloga !== "client_viewer";
  // Grupa Rad se crta posebno: bez Početne, Zadataka i Poruka, koji su u traci.
  const sekcije = vidljiveSekcije(ukljucen, { radniDeo }).filter(
    (s) => s.title !== radSekcija.title,
  );
  const rad = radSekcija.items.filter(
    (i) => i.href !== "/" && i.href !== "/zadaci" && i.href !== "/poruke",
  );

  return (
    <>
      {radniDeo && (
        <Odeljak naslov="Rad">
          <MrezaStavki>
            {[...rad, ...podekraniRadnogDela].map((item) => (
              <StavkaLista key={item.href} item={item} zatvori={zatvori} />
            ))}
          </MrezaStavki>
        </Odeljak>
      )}

      {sekcije.map((sekcija) => (
        <Odeljak key={sekcija.title} naslov={sekcija.title}>
          <MrezaStavki>
            {sekcija.items.map((item) => (
              <StavkaLista key={item.href} item={item} zatvori={zatvori} />
            ))}
          </MrezaStavki>
        </Odeljak>
      ))}

      <div className="flex flex-wrap gap-1 border-t border-line pt-3">
        {radniDeo && <DnoVeza item={korpaNavItem} zatvori={zatvori} />}
        <DnoVeza
          item={{ ...korpaNavItem, label: "Napredak", href: NAPREDAK_HREF, icon: Trophy }}
          zatvori={zatvori}
        />
        <DnoVeza item={settingsNavItem} zatvori={zatvori} />
      </div>
    </>
  );
}

function DnoVeza({ item, zatvori }: { item: NavItem; zatvori: () => void }) {
  const Icon = item.icon;
  return (
    <ProjekatLink
      href={item.href}
      onClick={zatvori}
      data-module={item.module}
      className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-ui text-text-secondary transition-colors active:bg-surface"
    >
      <Icon className="size-4 text-text-muted" aria-hidden />
      {item.label}
    </ProjekatLink>
  );
}
