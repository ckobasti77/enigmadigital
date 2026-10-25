"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import {
  Check,
  ChevronsUpDown,
  LayoutGrid,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { stilProjekta } from "@/lib/boja-projekta";
import { fold } from "@/lib/pretraga";
import { putanjaZaPrelazak } from "@/lib/rutiranje";
import { cn } from "@/lib/utils";
import {
  NOVI_PROJEKAT_HREF,
  NOVI_PROJEKAT_POSTOJI,
  ekranZaPrelazak,
} from "./nav-items";
import { useSada } from "./napredak/use-napredak";
import { useEkranPutanja, useProjekat } from "./projekat-provider";
import { ProjekatLink } from "./projekat-link";
import { ProjekatZnak } from "./projekat-znak";
import { QuietBoundary } from "./quiet-boundary";

/**
 * ============================================================================
 * BIRAČ PROJEKTA (PROJEKTI-PLAN §7, plan C02 §8)
 * ============================================================================
 *
 * Gore levo u bočnoj traci, umesto natpisa „Enigma“: znak i ime projekta u
 * kome si. Klik otvara meni: projekti (znak, ime, tačka stanja veza, broj
 * „šta me čeka“, kvačica na tekućem), pa „Svi projekti“, „Novi projekat“
 * (samo vlasnik platforme, kad ekran postoji) i „Podešavanja projekta“.
 *
 * Promena projekta čuva ekran (`putanjaZaPrelazak`): sa Analitike Enigme na
 * Analitiku ScanMe-a; ekran sa ID-jem pada na roditelja, a modul koji cilj
 * nema uključen vodi na kontrolnu tablu.
 *
 * Režimi: u hubu je ovo dugme; u panelu (domen zaključan na jedan projekat)
 * stoji samo znak i ime, bez menija. Na telefonu je birač u gornjoj traci i
 * otvara list odozdo.
 *
 * Tastatura: strelice gore/dole i Home/End kroz stavke, Enter i razmak
 * biraju, Esc zatvara i vraća fokus na dugme. Od šest projekata naviše
 * meni ima pretragu (bez dijakritike, po imenu i adresi), koja dobija fokus
 * pri otvaranju.
 *
 * Statistika (tačka i broj) se čita tek dok je meni otvoren: dugme je ne
 * pokazuje, a upit čita veze i „šta me čeka“ svih projekata.
 *
 * Veze vode VAN tekućeg projekta (drugi projekat, hub `/`), pa idu kroz
 * `next/link`, ne kroz `ProjekatLink`.
 */

/** Od ovoliko projekata meni dobija pretragu. */
const PRETRAGA_OD = 6;

/** Isto kao `use-sta-me-ceka.ts`: minuti do lokalnog vremena. */
const POMERAJ_MIN = -new Date().getTimezoneOffset();

type Stavka = NonNullable<ReturnType<typeof useMojiProjekti>>[number];
type Stanje = {
  zdravlje: "ok" | "upozorenje" | "greska" | "bez_veza";
  ceka: number | null;
};

function useMojiProjekti() {
  return useQuery(api.projekti.mojiProjekti);
}

/** Stavka menija: ista visina i ista tinta kao meni korisnika. */
const STAVKA =
  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-ui text-text-secondary outline-none transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:bg-foreground/8 focus-visible:text-foreground";

// ── Ulazne tačke ─────────────────────────────────────────────────────────────

/** Bočna traka (širi ekran). */
export function ProjekatBirac({ rail }: { rail: boolean }) {
  const p = useProjekat();
  const [otvoren, setOtvoren] = useState(false);

  if (!p.spreman || p.ime === null) return <ZnakSkeleton rail={rail} />;

  const projekat = { ime: p.ime, boja: p.brend.boja, logoUrl: p.brend.logoUrl };

  // Panel: domen je zaključan na jedan projekat — znak i ime, bez menija.
  if (p.rezim === "panel") {
    return rail ? (
      <Tooltip>
        <TooltipTrigger
          render={<span className="flex size-8 items-center justify-center" />}
        >
          <ProjekatZnak projekat={projekat} oznaka />
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {p.ime}
        </TooltipContent>
      </Tooltip>
    ) : (
      <p className="flex h-9 min-w-0 flex-1 items-center gap-2.5 pl-[10px]">
        <ProjekatZnak projekat={projekat} />
        <span className="min-w-0 truncate text-ui font-medium text-foreground">{p.ime}</span>
      </p>
    );
  }

  const dugme = (
    <PopoverTrigger
      aria-label={`${p.ime} — promeni projekat`}
      className={cn(
        "flex h-9 min-w-0 cursor-pointer items-center rounded-lg transition-colors hover:bg-sidebar-accent/60 aria-expanded:bg-sidebar-accent/60",
        rail ? "w-8 justify-center" : "flex-1 gap-2.5 pl-[10px] pr-1.5",
      )}
    >
      <ProjekatZnak projekat={projekat} />
      {!rail && (
        <>
          <span className="min-w-0 flex-1 truncate text-left text-ui font-medium text-foreground">
            {p.ime}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-text-muted" />
        </>
      )}
    </PopoverTrigger>
  );

  return (
    <Popover open={otvoren} onOpenChange={setOtvoren}>
      {rail ? (
        <Tooltip>
          <TooltipTrigger render={dugme} />
          <TooltipContent side="right" sideOffset={8}>
            {p.ime}
          </TooltipContent>
        </Tooltip>
      ) : (
        dugme
      )}
      <PopoverContent
        side={rail ? "right" : "bottom"}
        align="start"
        sideOffset={rail ? 10 : 6}
        aria-label="Izbor projekta"
        initialFocus={prviFokus}
        className="w-[18.5rem] gap-0 p-1.5"
      >
        <MeniProjekata zatvori={() => setOtvoren(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** Gornja traka na telefonu (bočne trake tamo nema). */
export function ProjekatBiracMobilni({ className }: { className?: string }) {
  const p = useProjekat();
  const [otvoren, setOtvoren] = useState(false);

  // List postoji samo na telefonu: ako se prozor raširi dok je otvoren,
  // zatvara se, da modalna zamka fokusa ne ostane iza nevidljivog lista.
  useEffect(() => {
    const siroko = window.matchMedia("(min-width: 768px)");
    const zatvori = () => {
      if (siroko.matches) setOtvoren(false);
    };
    siroko.addEventListener("change", zatvori);
    return () => siroko.removeEventListener("change", zatvori);
  }, []);

  if (!p.spreman || p.ime === null) {
    return <Skeleton className={cn("size-7 shrink-0 rounded-md", className)} />;
  }
  const projekat = { ime: p.ime, boja: p.brend.boja, logoUrl: p.brend.logoUrl };

  if (p.rezim === "panel") {
    return (
      <span className={cn("flex shrink-0 items-center", className)}>
        <ProjekatZnak projekat={projekat} velicina="md" oznaka />
      </span>
    );
  }

  return (
    <DialogPrimitive.Root open={otvoren} onOpenChange={setOtvoren}>
      <DialogPrimitive.Trigger
        aria-label={`${p.ime} — promeni projekat`}
        className={cn(
          "-ml-1.5 flex h-11 shrink-0 cursor-pointer items-center gap-0.5 rounded-lg px-1.5 transition-colors active:bg-surface-raised aria-expanded:bg-surface-raised",
          className,
        )}
      >
        <ProjekatZnak projekat={projekat} velicina="md" />
        <ChevronsUpDown aria-hidden className="size-3.5 text-text-muted" />
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-surface-overlay backdrop-blur-sm md:hidden",
            "transition-opacity duration-(--duration-base) ease-(--ease-ui)",
            "data-closed:opacity-0 data-open:opacity-100 data-starting-style:opacity-0",
          )}
        />
        <DialogPrimitive.Popup
          initialFocus={prviFokus}
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
              Projekti
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Zatvori"
              className="flex size-11 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:text-foreground"
            >
              <X className="size-5" aria-hidden />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-2 pb-3">
            <MeniProjekata zatvori={() => setOtvoren(false)} siroko />
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Prvi fokus pri otvaranju: pretraga ako je ima, inače prva stavka. */
function prviFokus(): HTMLElement | null {
  const meni = document.querySelector<HTMLElement>("[data-projekat-meni]");
  return meni?.querySelector<HTMLElement>('input, [role="menuitem"]') ?? meni;
}

function ZnakSkeleton({ rail }: { rail: boolean }) {
  return (
    <div
      aria-hidden
      className={cn("flex h-9 items-center gap-2.5", rail ? "w-8 justify-center" : "flex-1 pl-[10px]")}
    >
      <Skeleton className="size-6 rounded-md" />
      {!rail && <Skeleton className="h-3.5 w-24" />}
    </div>
  );
}

// ── Meni (isti sadržaj u popoveru i u listu na telefonu) ────────────────────

/**
 * Strelice, Home/End i razmak nad stavkama menija. Stavke se traže u DOM-u,
 * pa redosled uvek prati ono što se vidi (posle pretrage, posle greške).
 */
function tastatura(e: KeyboardEvent<HTMLDivElement>) {
  const koren = e.currentTarget;
  const stavke = Array.from(koren.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  if (stavke.length === 0) return;
  const pretraga = koren.querySelector<HTMLInputElement>("input");
  const aktivni = document.activeElement;
  const i = stavke.indexOf(aktivni as HTMLElement);
  const n = stavke.length;

  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      stavke[i === -1 ? 0 : (i + 1) % n].focus();
      break;
    case "ArrowUp":
      e.preventDefault();
      if (i <= 0 && pretraga) pretraga.focus();
      else stavke[i === -1 ? n - 1 : (i - 1 + n) % n].focus();
      break;
    case "Home":
    case "End":
      if (aktivni === pretraga) return;
      e.preventDefault();
      stavke[e.key === "Home" ? 0 : n - 1].focus();
      break;
    case " ":
      if (i === -1) return;
      e.preventDefault();
      stavke[i].click();
      break;
  }
}

function MeniProjekata({ zatvori, siroko = false }: { zatvori: () => void; siroko?: boolean }) {
  return (
    <div data-projekat-meni="" onKeyDown={tastatura} className="flex flex-col">
      <QuietBoundary
        fallback={
          <TeloMenija projekti={null} zatvori={zatvori} siroko={siroko} />
        }
      >
        <MeniSaSpiskom zatvori={zatvori} siroko={siroko} />
      </QuietBoundary>
    </div>
  );
}

function MeniSaSpiskom({ zatvori, siroko }: { zatvori: () => void; siroko: boolean }) {
  const projekti = useMojiProjekti();
  const { slug: tekuci } = useProjekat();
  // Arhiviran projekat nije za brzu promenu (ostaje u „Svi projekti“);
  // tekući se vidi i kad je arhiviran, da kvačica uvek ima gde da stoji.
  const aktivni = useMemo(
    () => projekti?.filter((p) => !p.arhiviran || p.slug === tekuci),
    [projekti, tekuci],
  );
  return <TeloMenija projekti={aktivni} zatvori={zatvori} siroko={siroko} />;
}

/**
 * `projekti`: `undefined` dok se čita, `null` kad spisak nije stigao (greška).
 * Prečice ispod spiska rade i tada: one ne zavise od spiska.
 */
function TeloMenija({
  projekti,
  zatvori,
  siroko,
}: {
  projekti: Stavka[] | undefined | null;
  zatvori: () => void;
  siroko: boolean;
}) {
  const { platformaVlasnik } = useProjekat();
  const [upit, setUpit] = useState("");
  const pretraga = (projekti?.length ?? 0) >= PRETRAGA_OD;
  const vidljivi = useMemo(() => {
    const q = fold(upit.trim());
    if (!projekti) return projekti;
    return q ? projekti.filter((p) => fold(`${p.ime} ${p.slug}`).includes(q)) : projekti;
  }, [projekti, upit]);

  const visina = siroko ? "min-h-11" : "h-9";

  return (
    <>
      {pretraga && (
        <div className="focus-inset relative mb-1 shrink-0 rounded-md">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted"
          />
          <input
            type="search"
            value={upit}
            onChange={(e) => setUpit(e.target.value)}
            aria-label="Pronađi projekat"
            placeholder="Pronađi projekat…"
            className={cn(
              "w-full min-w-0 rounded-md bg-transparent pl-8 pr-2 text-ui text-foreground outline-none placeholder:text-text-muted",
              siroko ? "h-11" : "h-9",
            )}
          />
        </div>
      )}

      <div role="menu" aria-label="Projekti" className="flex flex-col">
        <div role="group" aria-labelledby="projekat-meni-naslov">
          {/* U listu na telefonu isti naslov već nosi zaglavlje lista. */}
          <p
            id="projekat-meni-naslov"
            className={
              siroko ? "sr-only" : "heading-caps px-2 pb-1 pt-1.5 text-micro text-text-muted"
            }
          >
            Projekti
          </p>
          {vidljivi === null ? (
            <p className="px-2 py-2 text-ui text-text-muted">
              Spisak projekata trenutno nije dostupan.
            </p>
          ) : vidljivi === undefined ? (
            <div aria-hidden className="flex flex-col gap-1 px-2 py-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
            </div>
          ) : vidljivi.length === 0 ? (
            <p className="px-2 py-2 text-ui text-text-muted">
              Nema projekta za „{upit.trim()}“.
            </p>
          ) : (
            <div className="flex max-h-80 flex-col gap-px overflow-y-auto">
              <QuietBoundary
                fallback={
                  <Redovi projekti={vidljivi} stanja={null} zatvori={zatvori} visina={visina} siroko={siroko} />
                }
              >
                <RedoviSaStanjem projekti={vidljivi} zatvori={zatvori} visina={visina} siroko={siroko} />
              </QuietBoundary>
            </div>
          )}
        </div>

        <div role="separator" className="-mx-1.5 my-1 h-px bg-line-soft" />

        <div role="group" aria-label="Prečice">
          <Link
            href="/"
            role="menuitem"
            tabIndex={-1}
            onClick={zatvori}
            className={cn(STAVKA, visina)}
          >
            <LayoutGrid aria-hidden className="size-4 shrink-0 text-text-muted" />
            Svi projekti
          </Link>
          {platformaVlasnik && NOVI_PROJEKAT_POSTOJI && (
            <Link
              href={NOVI_PROJEKAT_HREF}
              role="menuitem"
              tabIndex={-1}
              onClick={zatvori}
              className={cn(STAVKA, visina)}
            >
              <Plus aria-hidden className="size-4 shrink-0 text-text-muted" />
              Novi projekat
            </Link>
          )}
          <ProjekatLink
            href="/settings"
            role="menuitem"
            tabIndex={-1}
            onClick={zatvori}
            className={cn(STAVKA, visina)}
          >
            <Settings aria-hidden className="size-4 shrink-0 text-text-muted" />
            Podešavanja projekta
          </ProjekatLink>
        </div>
      </div>
    </>
  );
}

function RedoviSaStanjem(props: {
  projekti: Stavka[];
  zatvori: () => void;
  visina: string;
  siroko: boolean;
}) {
  // Vreme sa tačnošću od minuta (upit ne čita sat); `0` dok sat ne krene.
  const sada = useSada();
  const odgovor = useQuery(
    api.projekti.stanjeProjekata,
    sada > 0 ? { sada, pomerajMin: POMERAJ_MIN } : "skip",
  );
  const stanja = useMemo(
    () =>
      odgovor === undefined
        ? undefined
        : new Map<Id<"workspaces">, Stanje>(odgovor.map((s) => [s.workspaceId, s])),
    [odgovor],
  );
  return <Redovi {...props} stanja={stanja} />;
}

/**
 * `stanja`: `undefined` dok se čita, `null` kad upit nije uspeo. Projekat bez
 * stanja (spisak duži od dvadeset) crta se kao nepoznat: siva tačka i „—“.
 */
function Redovi({
  projekti,
  stanja,
  zatvori,
  visina,
  siroko,
}: {
  projekti: Stavka[];
  stanja: Map<Id<"workspaces">, Stanje> | undefined | null;
  zatvori: () => void;
  visina: string;
  siroko: boolean;
}) {
  const { slug: tekuci } = useProjekat();
  const ekran = useEkranPutanja();

  return projekti.map((p) => {
    const aktivan = p.slug === tekuci;
    const stanje = stanja === undefined ? undefined : (stanja?.get(p.workspaceId) ?? null);
    const sadrzaj: ReactNode = (
      <>
        <ProjekatZnak projekat={p} velicina={siroko ? "md" : "sm"} />
        <span className="min-w-0 flex-1 truncate">{p.ime}</span>
        <TackaVeza stanje={stanje} />
        <BrojCeka stanje={stanje} />
        <Check
          aria-hidden
          className={cn("size-4 shrink-0", aktivan ? "text-foreground" : "invisible")}
        />
      </>
    );
    const klase = cn(STAVKA, visina, aktivan && "bg-projekat-soft text-foreground");

    // Tekući projekat samo zatvara meni: prelazak na isti projekat bi
    // bez razloga obrisao upit adrese.
    return aktivan ? (
      <button
        key={p.workspaceId}
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-current="true"
        onClick={zatvori}
        data-projekat=""
        style={stilProjekta(p.boja)}
        className={klase}
      >
        {sadrzaj}
      </button>
    ) : (
      <Link
        key={p.workspaceId}
        role="menuitem"
        tabIndex={-1}
        href={putanjaZaPrelazak({
          ekran,
          cilj: { slug: p.slug, moduli: p.moduli },
          ekranZa: ekranZaPrelazak,
        })}
        onClick={zatvori}
        className={klase}
      >
        {sadrzaj}
      </Link>
    );
  });
}

const ZDRAVLJE = {
  ok: { klasa: "bg-success", tekst: "Veze rade" },
  upozorenje: { klasa: "bg-warning", tekst: "Veze traže pažnju" },
  greska: { klasa: "bg-danger", tekst: "Veza je u grešci" },
} as const;

/** Tačka stanja veza; bez veza nema tačke. Tekst je u oblačiću i za čitač ekrana. */
function TackaVeza({ stanje }: { stanje: Stanje | null | undefined }) {
  const z = stanje?.zdravlje;
  const opis =
    stanje === undefined
      ? "Stanje veza se učitava"
      : stanje === null
        ? "Stanje veza nije poznato"
        : z === "bez_veza"
          ? "Nema povezanih kanala"
          : ZDRAVLJE[z as keyof typeof ZDRAVLJE].tekst;
  const klasa =
    stanje === undefined || stanje === null
      ? "bg-text-muted/60"
      : z === "bez_veza"
        ? null
        : ZDRAVLJE[z as keyof typeof ZDRAVLJE].klasa;
  return (
    <span title={opis} className="flex size-4 shrink-0 items-center justify-center">
      {klasa && <span aria-hidden className={cn("size-2 rounded-full", klasa)} />}
      <span className="sr-only">{opis}</span>
    </span>
  );
}

/** Broj „šta me čeka“; „—“ kad broj nije poznat, nikad izmišljena nula. */
function BrojCeka({ stanje }: { stanje: Stanje | null | undefined }) {
  const broj = stanje?.ceka ?? null;
  const opis =
    stanje === undefined
      ? "Broj se učitava"
      : broj === null
        ? "Broj zadataka nije dostupan"
        : `Čeka: ${broj}`;
  return (
    <span
      title={opis}
      className="w-6 shrink-0 text-right font-mono text-meta tabular-nums text-text-muted"
    >
      <span aria-hidden>{broj ?? "—"}</span>
      <span className="sr-only">{opis}</span>
    </span>
  );
}

// ── ⌘K: projekti za „Prebaci na …“ ──────────────────────────────────────────

export type ProjekatZaPrelazak = {
  workspaceId: Id<"workspaces">;
  ime: string;
  boja: string | null;
  logoUrl: string | null;
  href: string;
};

/**
 * Projekti osim tekućeg, sa adresom istog ekrana u njima. Komandna paleta
 * ga montira samo dok je otvorena, u hubu, iza granice greške: pad spiska
 * ne sme da obori paletu.
 */
export function ProjektiZaPaletu({
  onProjekti,
}: {
  onProjekti: (projekti: ProjekatZaPrelazak[]) => void;
}) {
  const projekti = useMojiProjekti();
  const { slug: tekuci } = useProjekat();
  const ekran = useEkranPutanja();
  const poslednji = useRef<string>("");

  useEffect(() => {
    if (projekti === undefined) return;
    const lista = projekti
      .filter((p) => p.slug !== tekuci && !p.arhiviran)
      .map((p) => ({
        workspaceId: p.workspaceId,
        ime: p.ime,
        boja: p.boja,
        logoUrl: p.logoUrl,
        href: putanjaZaPrelazak({
          ekran,
          cilj: { slug: p.slug, moduli: p.moduli },
          ekranZa: ekranZaPrelazak,
        }),
      }));
    const kljuc = JSON.stringify(lista);
    if (kljuc === poslednji.current) return;
    poslednji.current = kljuc;
    onProjekti(lista);
  }, [projekti, tekuci, ekran, onProjekti]);

  return null;
}
