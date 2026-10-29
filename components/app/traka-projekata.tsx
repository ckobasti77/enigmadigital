"use client";

import { useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode } from "react";
import { LayoutGrid, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BedzNaUglu } from "@/components/app/system/count-badge";
import { stilProjekta } from "@/lib/boja-projekta";
import { unreadPhrase } from "@/lib/prostor/web/opseg";
import { putanjaZaPrelazak } from "@/lib/rutiranje";
import { cn } from "@/lib/utils";
import { JaLink } from "./ja-link";
import {
  NOVI_PROJEKAT_HREF,
  NOVI_PROJEKAT_POSTOJI,
  SVI_PROJEKTI_HREF,
  ekranZaPrelazak,
} from "./nav-items";
import { useOpseg } from "./opseg-ljuske";
import {
  useJaNalog,
  useNeprocitano,
  useProjektiTrake,
  useStanjeProjekata,
  type JaNalog,
  type ProjekatTrake,
} from "./podaci-ljuske";
import { useEkranPutanja, useProjekatOpciono } from "./projekat-provider";
import { ProjekatZnak } from "./projekat-znak";
import { QuietBoundary } from "./quiet-boundary";
import { useIndikatorTrake } from "./use-indikator-trake";
import { UserMenu } from "./user-menu";

/**
 * ============================================================================
 * TRAKA PROJEKATA (SPAJANJE O8, P14; plan S07 §2.1)
 * ============================================================================
 *
 * Uska kolona levo od menija: gore „Ja“ (moj avatar i broj nepročitanog), pa
 * pločica po projektu (`ProjekatZnak`, tačka kad u projektu ima nepročitanog
 * ili posla koji čeka), „+“ za novi projekat (vlasnik platforme), „Svi
 * projekti“, a dole profil. Preuzima posao birača projekta: prelazak čuva
 * ekran (`putanjaZaPrelazak`), a tačka zamenjuje broj iz birača.
 *
 * Boja ovde ima jednu ulogu, identitet: crta uz izabranu pločicu je u boji
 * tog projekta (u „Ja“ neutralna). Modul i radnja se ne pojavljuju.
 *
 * Tastatura: traka je jedno mesto u redosledu Tab-a (izabrana pločica);
 * strelice gore i dole, Home i End šetaju kroz „Ja“ i projekte, Enter
 * otvara. Lista projekata klizi, a vrh i dno stoje.
 *
 * Postoji od `md` naviše (D12) i samo u hubu: panel domen je zaključan na
 * jedan projekat (D4), pa ga ljuska tamo ne montira.
 */

const PLOCICA =
  "relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-xl outline-none transition-colors hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-ring";

/** Ključ pločice „Ja“ u roving grupi i za indikator. */
const KLJUC_JA = "ja";

export function TrakaProjekata() {
  const projekat = useProjekatOpciono();
  const opseg = useOpseg();
  const tekuci = opseg === "projekat" ? (projekat?.slug ?? null) : null;
  const ekran = useEkranPutanja();
  const projekti = useProjektiTrake(tekuci);
  const nalog = useJaNalog();

  const listaRef = useRef<HTMLDivElement>(null);
  const aktivni = opseg === "ja" ? KLJUC_JA : tekuci;
  const kljucevi = [KLJUC_JA, ...(projekti ?? []).map((p) => p.slug)];
  const indikator = useIndikatorTrake(listaRef, aktivni, kljucevi.length);
  const [fokus, setFokus] = useState<string | null>(null);
  // Mesto u redosledu Tab-a je izabrana pločica; dok je fokus u traci, prati ga.
  const tabStop =
    fokus !== null && kljucevi.includes(fokus)
      ? fokus
      : aktivni !== null && kljucevi.includes(aktivni)
        ? aktivni
        : KLJUC_JA;

  function pomeriFokus(e: KeyboardEvent<HTMLElement>) {
    const stavka = (e.target as HTMLElement).closest<HTMLElement>("[data-traka-kljuc]");
    if (!stavka) return;
    const i = kljucevi.indexOf(stavka.dataset.trakaKljuc ?? "");
    if (i === -1) return;
    let j = i;
    if (e.key === "ArrowDown") j = Math.min(kljucevi.length - 1, i + 1);
    else if (e.key === "ArrowUp") j = Math.max(0, i - 1);
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = kljucevi.length - 1;
    else return;
    e.preventDefault();
    const kljuc = kljucevi[j];
    setFokus(kljuc);
    listaRef.current
      ?.querySelector<HTMLElement>(`[data-traka-kljuc="${CSS.escape(kljuc)}"] a`)
      ?.focus();
  }

  const aktivanProjekat = projekti?.find((p) => p.slug === tekuci) ?? null;

  return (
    <TooltipProvider delay={200}>
      <nav
        aria-label="Projekti"
        className="material material-edge-r fixed inset-y-0 left-0 z-40 hidden w-[var(--traka-width)] flex-col items-stretch md:flex"
      >
        <div
          ref={listaRef}
          onKeyDown={pomeriFokus}
          onBlur={(e) => {
            // Fokus je izašao iz trake: sledeći Tab staje na izabranu pločicu.
            if (!listaRef.current?.contains(e.relatedTarget as Node | null)) setFokus(null);
          }}
          className="scrollbar-thin relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden pb-2"
        >
          {/* Crta izabranog: identitet projekta, u „Ja“ neutralna. */}
          <span
            ref={indikator}
            aria-hidden
            data-projekat={aktivanProjekat ? "" : undefined}
            style={{ opacity: 0, ...(aktivanProjekat ? stilProjekta(aktivanProjekat.boja) : {}) }}
            className={cn(
              "pointer-events-none absolute left-0 top-0 h-5 w-[3px] rounded-r-full",
              aktivanProjekat ? "bg-projekat" : "bg-foreground",
            )}
          />

          <div className="flex h-[var(--chrome-height)] w-full shrink-0 items-center justify-center">
            <PlocicaJa
              nalog={nalog}
              aktivan={opseg === "ja"}
              tabIndex={tabStop === KLJUC_JA ? 0 : -1}
              onFocus={() => setFokus(KLJUC_JA)}
            />
          </div>

          <div aria-hidden className="mx-auto mb-2 h-px w-8 shrink-0 bg-line-soft" />

          {projekti === undefined ? (
            <div aria-hidden className="flex flex-col items-center gap-1">
              <Skeleton className="size-9 rounded-[10px]" />
              <Skeleton className="size-9 rounded-[10px]" />
            </div>
          ) : (
            <ul className="flex flex-col items-center gap-1">
              <QuietBoundary
                fallback={projekti.map((p) => (
                  <PlocicaProjekta
                    key={p.workspaceId}
                    projekat={p}
                    href={hrefPlocice(p, opseg, ekran)}
                    aktivan={p.slug === tekuci}
                    tabIndex={tabStop === p.slug ? 0 : -1}
                    onFocus={() => setFokus(p.slug)}
                    stanje={null}
                  />
                ))}
              >
                <PlociceSaStanjem
                  projekti={projekti}
                  render={(p, stanje) => (
                    <PlocicaProjekta
                      key={p.workspaceId}
                      projekat={p}
                      href={hrefPlocice(p, opseg, ekran)}
                      aktivan={p.slug === tekuci}
                      tabIndex={tabStop === p.slug ? 0 : -1}
                      onFocus={() => setFokus(p.slug)}
                      stanje={stanje}
                    />
                  )}
                />
              </QuietBoundary>
            </ul>
          )}

          <div className="mt-1 flex flex-col items-center gap-1">
            {nalog?.platformaVlasnik && NOVI_PROJEKAT_POSTOJI && (
              <Tip label="Novi projekat">
                <JaLink
                  href={NOVI_PROJEKAT_HREF}
                  aria-label="Novi projekat"
                  className={cn(PLOCICA, "text-text-muted hover:text-foreground")}
                >
                  <span className="grid size-9 place-items-center rounded-[10px] border border-dashed border-line-strong">
                    <Plus className="size-4" aria-hidden />
                  </span>
                </JaLink>
              </Tip>
            )}
            <Tip label="Svi projekti">
              <JaLink
                href={SVI_PROJEKTI_HREF}
                aria-label="Svi projekti"
                aria-current={ekran === SVI_PROJEKTI_HREF && opseg === "ja" ? "page" : undefined}
                className={cn(
                  PLOCICA,
                  "text-text-muted hover:text-foreground aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-foreground",
                )}
              >
                <LayoutGrid className="size-5" aria-hidden />
              </JaLink>
            </Tip>
          </div>
        </div>

        <div className="material-edge-t flex shrink-0 justify-center py-2">
          <UserMenu variant="traka" />
        </div>
      </nav>
    </TooltipProvider>
  );
}

/**
 * Kuda vodi pločica: iz projekta na isti ekran drugog projekta (C08, ekran sa
 * ID-jem pada na roditelja, isključen modul na početnu); iz „Ja“ na početnu
 * tog projekta, jer lični ekran („Moji zadaci“) nema parnjaka u projektu.
 */
function hrefPlocice(p: ProjekatTrake, opseg: "ja" | "projekat", ekran: string): string {
  if (opseg === "ja") return `/${p.slug}`;
  return putanjaZaPrelazak({
    ekran,
    cilj: { slug: p.slug, moduli: p.moduli },
    ekranZa: ekranZaPrelazak,
  });
}

/** Oblačić sa nazivom desno od pločice. */
function Tip({ label, children }: { label: ReactNode; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function PlocicaJa({
  nalog,
  aktivan,
  tabIndex,
  onFocus,
}: {
  nalog: JaNalog | undefined;
  aktivan: boolean;
  tabIndex: number;
  onFocus: () => void;
}) {
  return (
    <div data-traka-kljuc={KLJUC_JA} className="relative">
      <Tip label="Ja · moj dan i moji zadaci">
        <JaLink
          href="/"
          tabIndex={tabIndex}
          onFocus={onFocus}
          aria-current={aktivan ? "true" : undefined}
          aria-label="Ja: moj dan, zadaci, inbox i poruke"
          className={cn(PLOCICA, "rounded-full")}
        >
          {nalog === undefined ? (
            <Skeleton className="size-9 rounded-full" />
          ) : (
            <Avatar
              size="lg"
              className={cn(
                "size-9 transition-shadow",
                aktivan && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
              )}
            >
              {nalog.avatarUrl && <AvatarImage src={nalog.avatarUrl} alt="" />}
              <AvatarFallback>{nalog.inicijali}</AvatarFallback>
            </Avatar>
          )}
          <QuietBoundary>
            <BedzJa />
          </QuietBoundary>
        </JaLink>
      </Tip>
    </div>
  );
}

/** Broj na „Ja“: nepročitan Inbox i nepročitane poruke iz svih projekata. */
function BedzJa() {
  const { bedzevi } = useNeprocitano();
  const broj = bedzevi.me ?? 0;
  if (broj <= 0) return null;
  return (
    <BedzNaUglu
      count={bedzevi.meCapped ? 100 : broj}
      tone="neutral"
      ugao="zupcanik"
      label={unreadPhrase(broj, bedzevi.meCapped)}
    />
  );
}

/**
 * Tačka po projektu: nepročitano (Inbox, poruke) ili posao koji čeka. Oba
 * upita mogu da padnu (nema profila, prekid), pa je ovo iza granice; bez
 * njih pločice stoje bez tačke.
 */
function PlociceSaStanjem({
  projekti,
  render,
}: {
  projekti: ProjekatTrake[];
  render: (p: ProjekatTrake, stanje: StanjePlocice) => ReactNode;
}) {
  const { bedzevi } = useNeprocitano();
  const stanja = useStanjeProjekata();
  return projekti.map((p) =>
    render(p, {
      neprocitano: bedzevi.startupDots[p.workspaceId] === true,
      ceka: stanja?.get(p.workspaceId)?.ceka ?? null,
    }),
  );
}

type StanjePlocice = { neprocitano: boolean; ceka: number | null } | null;

function PlocicaProjekta({
  projekat,
  href,
  aktivan,
  tabIndex,
  onFocus,
  stanje,
}: {
  projekat: ProjekatTrake;
  href: string;
  aktivan: boolean;
  tabIndex: number;
  onFocus: () => void;
  stanje: StanjePlocice;
}) {
  const ceka = stanje?.ceka ?? 0;
  const razlozi = [
    stanje?.neprocitano ? "ima nepročitano" : null,
    ceka > 0 ? `čeka te ${ceka}` : null,
  ].filter((r): r is string => r !== null);
  const tacka = razlozi.length > 0;
  const opis = tacka ? `${projekat.ime}, ${razlozi.join(", ")}` : projekat.ime;

  return (
    <li data-traka-kljuc={projekat.slug} className="relative">
      <Tip
        label={
          <>
            <span className="block font-medium">{projekat.ime}</span>
            {tacka && <span className="block">{razlozi.join(" · ")}</span>}
          </>
        }
      >
        <JaLink
          href={href}
          tabIndex={tabIndex}
          onFocus={onFocus}
          aria-current={aktivan ? "true" : undefined}
          aria-label={opis}
          data-projekat=""
          style={stilProjekta(projekat.boja)}
          className={PLOCICA}
        >
          <ProjekatZnak
            projekat={projekat}
            velicina="traka"
            className={cn(
              "transition-shadow",
              aktivan && "ring-2 ring-projekat ring-offset-2 ring-offset-background",
            )}
          />
          {tacka && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-foreground ring-2 ring-background"
            />
          )}
        </JaLink>
      </Tip>
    </li>
  );
}
