"use client";

import { useState } from "react";
import { ProjekatLink } from "@/components/app/projekat-link";
import { Bell, Clock3, EyeOff, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BedzNaUglu } from "@/components/app/system/count-badge";
import { Unfold } from "@/components/motion/unfold";
import { cn } from "@/lib/utils";
import { MOBILE_TAB, MOBILE_TAB_ICON } from "./mobile-tab";
import { useOpseg } from "./opseg-ljuske";
import { ZvonoJa } from "./zvono-ja";
import { QuietBoundary } from "./quiet-boundary";
import { useProjekat, useProjekatMutation, useProjekatOpciono } from "./projekat-provider";
import { NotificationSettingsDialog } from "./prostor/inbox/notification-settings-dialog";
import { ZvonoKartice, nazivZvona, useInboxZvona } from "./prostor/inbox/zvono-inbox";
import { NapraviZadatak } from "./prostor/zadaci/napravi-zadatak";
import { vezaIzCekaTe } from "@/lib/prostor/web/veze-zadatka";
import { useStaMeCeka, type StaMeCeka, type Zadatak } from "./use-sta-me-ceka";

/**
 * ============================================================================
 * ZVONO — jedino mesto koje kaže šta me čeka (A2 §2, plan §2 N)
 * ============================================================================
 *
 * Izmereno 9.9.2026: bočna navigacija ima 13 stavki i nijedan broj, zaglavlje
 * ima birač perioda, pretragu i Odjavu — a čeka sedam vrsta posla. Ovo je
 * mesto gde taj posao stoji, sa brojem, imeniocem i po jednim dugmetom.
 *
 * Panel ne slavi prazninu. Kada nema ničega, ne piše „sve je urađeno" i nema
 * zelene kvačice: piše šta je provereno i kada — prazan spisak je činjenica o
 * jednom preseku, ne vest da je posao gotov (plan §0, A1 §3).
 */

const HITNOST_NATPIS: Record<Zadatak["hitnost"], string> = {
  visoka: "Hitno",
  srednja: "Ovih dana",
  niska: "Kad stigne red",
};

const HITNOST_RED: Array<Zadatak["hitnost"]> = ["visoka", "srednja", "niska"];

/**
 * Dva oblika istog zvona, isti panel (UI Boost §7.2 i §7.3):
 *   `icon`  dugme u gornjoj traci (u hubu i na telefonu, SPAJANJE P15);
 *   `tab`   ćelija „Čeka te" u donjoj traci panela na telefonu — zvono je
 *           tamo pod palcem, a panel se otvara naviše.
 *
 * Natpis je „Čeka te“ (P15): „Danas“ je sada lični dan. U opsegu „Ja“ zvono
 * sabira posao koji čeka u svim mojim projektima (`ZvonoJa`).
 *
 * Dve kartice (P16, SPAJANJE S17): „Čeka te“ (ovaj panel, nepromenjen) i
 * „Inbox“ (obaveštenja radnog dela, lična). Broj na zvonu je zbir posla koji
 * čeka i nepročitanog Inboxa. Panel domen (D4) zadržava samo „Čeka te“.
 */
type Oblik = "icon" | "tab";

export function NotificationsBell({
  className,
  variant = "icon",
}: {
  className?: string;
  variant?: Oblik;
}) {
  const opseg = useOpseg();
  const panel = useProjekatOpciono()?.rezim === "panel";
  return (
    <QuietBoundary>
      {opseg === "ja" ? (
        <ZvonoJa className={className} />
      ) : (
        <Zvono className={className} variant={variant} saInboxom={!panel && variant === "icon"} />
      )}
    </QuietBoundary>
  );
}

function Zvono({
  className,
  variant,
  saInboxom,
}: {
  className?: string;
  variant: Oblik;
  saInboxom: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [podesavanja, setPodesavanja] = useState(false);
  const data = useStaMeCeka();
  const inbox = useInboxZvona(saInboxom);

  if (data === undefined) {
    return variant === "tab" ? (
      <div className={cn(MOBILE_TAB, "cursor-default text-text-muted", className)}>
        <span className={MOBILE_TAB_ICON}>
          <Bell className="size-5" aria-hidden />
        </span>
        <span>Čeka te</span>
      </div>
    ) : (
      <Skeleton className={cn("size-11 rounded-lg md:size-8", className)} />
    );
  }

  // Broj na zvonu: posao koji čeka + nepročitan Inbox (P16).
  const ukupno = data.ukupno + (inbox?.broj ?? 0);
  const naziv = nazivZvona(data.ukupno, inbox);
  // Bez posla — bez bedža. Nikad „0" (A1 §3). Boja stanja važi samo za posao
  // koji čeka; samo nepročitan Inbox je neutralan broj.
  const bedz = (
    <BedzNaUglu
      count={inbox?.odseceno ? Math.max(ukupno, 100) : ukupno}
      tone={
        data.zadaci.some((z) => z.hitnost === "visoka")
          ? "danger"
          : data.ukupno > 0
            ? "warning"
            : "neutral"
      }
      ugao={variant === "tab" ? "tab" : "ikonica"}
    />
  );
  const panelCeka = (
    <Panel data={data} naslov={inbox === null} onNavigate={() => setOpen(false)} />
  );

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      {variant === "tab" ? (
        <PopoverTrigger
          aria-label={naziv}
          className={cn(
            MOBILE_TAB,
            // Natpis je istaknut samo dok je panel otvoren: da posla ima kaže
            // bedž, a „istaknuto" u ovoj traci znači „ovde si".
            open ? "text-foreground" : "text-text-muted",
            className,
          )}
        >
          <span className={cn(MOBILE_TAB_ICON, open && "bg-surface-raised")}>
            <Bell
              className={cn("size-5", ukupno > 0 && "text-foreground")}
              aria-hidden
            />
            {bedz}
          </span>
          <span>Čeka te</span>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger
          aria-label={naziv}
          title="Čeka te"
          className={cn(
            // Na telefonu (hub, P15) zvono je u zaglavlju: meta 44 px.
            "hover-lift relative inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:text-foreground md:size-8 md:border md:border-line",
            ukupno > 0 && "text-foreground",
            className,
          )}
        >
          <Bell className="size-5 md:size-4" aria-hidden />
          {bedz}
        </PopoverTrigger>
      )}

      <PopoverContent
        side={variant === "tab" ? "top" : "bottom"}
        align={variant === "tab" ? "center" : "end"}
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        {inbox === null ? (
          panelCeka
        ) : (
          <ZvonoKartice
            ceka={panelCeka}
            cekaBroj={data.ukupno}
            inbox={inbox}
            onZatvori={() => setOpen(false)}
            onPodesavanja={() => {
              setOpen(false);
              setPodesavanja(true);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
    {saInboxom && (
      <NotificationSettingsDialog open={podesavanja} onOpenChange={setPodesavanja} />
    )}
    </>
  );
}

function Panel({
  data,
  naslov,
  onNavigate,
}: {
  data: StaMeCeka;
  /** Bez kartica panel sam nosi naslov „Čeka te“; sa karticama ga nosi kartica. */
  naslov: boolean;
  onNavigate: () => void;
}) {
  const [prikaziSklonjene, setPrikaziSklonjene] = useState(false);

  const grupe = HITNOST_RED.map((hitnost) => ({
    hitnost,
    zadaci: data.zadaci.filter((z) => z.hitnost === hitnost),
  })).filter((g) => g.zadaci.length > 0);

  return (
    <div className="flex max-h-[70vh] flex-col">
      {(naslov || data.nepotpuno) && (
        <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line-soft px-3 py-2.5">
          {naslov && <p className="text-ui font-medium text-foreground">Čeka te</p>}
          {data.nepotpuno && (
            <span
              className="ml-auto text-meta text-text-muted"
              title="Bar jedan brojač je čitan sa granicom, pa je prikazan broj donja granica, a ne tačan broj."
            >
              najmanje toliko
            </span>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {grupe.length === 0 ? (
          <Prazno sklonjeno={data.sklonjeni.length} />
        ) : (
          grupe.map((grupa) => (
            <section key={grupa.hitnost}>
              <p className="heading-caps px-3 pb-1 pt-3 text-meta text-text-muted">
                {HITNOST_NATPIS[grupa.hitnost]}
              </p>
              <ul className="flex flex-col">
                {grupa.zadaci.map((zadatak) => (
                  <Stavka
                    key={zadatak.kljuc}
                    zadatak={zadatak}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </section>
          ))
        )}

        {data.sklonjeni.length > 0 && (
          <section className="border-t border-line-soft">
            <button
              type="button"
              onClick={() => setPrikaziSklonjene((v) => !v)}
              aria-expanded={prikaziSklonjene}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-meta text-text-muted transition-colors hover:text-foreground"
            >
              <span>Sklonjeno ({data.sklonjeni.length})</span>
              <span aria-hidden>{prikaziSklonjene ? "−" : "+"}</span>
            </button>
            {/* Prekidiv prelaz (A8 §1): drugi klik na pola razmotavanja vraća
                spisak odatle dokle je stigao, ne sa kraja. */}
            <Unfold open={prikaziSklonjene}>
              <ul className="flex flex-col pb-1">
                {data.sklonjeni.map((zadatak) => (
                  <Sklonjeno
                    key={zadatak.kljuc}
                    zadatak={zadatak}
                  />
                ))}
              </ul>
            </Unfold>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * Prazan panel bez slavlja: nabraja ŠTA je provereno, pa je jasno na šta se
 * praznina odnosi. „Nema ničega" bez toga je tvrdnja koju niko ne može da
 * proveri.
 */
function Prazno({ sklonjeno }: { sklonjeno: number }) {
  return (
    <div className="px-3 py-6">
      <p className="text-ui text-foreground">Ništa ne čeka.</p>
      <p className="mt-1 text-meta leading-relaxed text-text-muted">
        Provereno: uvozi u pregledu i nerazrešeni redovi, zaostali koraci i
        sastanci, firme bez broja i neocenjeni sajtovi, komentari i poruke bez
        odgovora, i stanje svake povezane integracije.
        {sklonjeno > 0
          ? ` ${sklonjeno} ${sklonjeno === 1 ? "stavka je sklonjena" : "stavki je sklonjeno"} — ispod.`
          : ""}
      </p>
    </div>
  );
}

function Stavka({
  zadatak,
  onNavigate,
}: {
  zadatak: Zadatak;
  onNavigate: () => void;
}) {
  const { spreman } = useProjekat();
  const odlozi = useProjekatMutation(api.notificationsStore.odloziZadatak);
  const sakrij = useProjekatMutation(api.notificationsStore.sakrijZadatak);
  const [radi, setRadi] = useState(false);
  // Optimističko stanje: stavka krene da se skuplja u istom kadru u kom je
  // dugme pritisnuto, ne posle povratka sa servera (A8 §1, odziv ≤ 100 ms).
  // Ako mutacija padne, vraća se i kaže zašto — obećanje se povlači naglas.
  const [sklanjam, setSklanjam] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const pokreni = async (posao: () => Promise<unknown>) => {
    if (!spreman || radi) return;
    setRadi(true);
    setSklanjam(true);
    setGreska(null);
    try {
      await posao();
    } catch (e) {
      setSklanjam(false);
      setGreska(e instanceof Error ? e.message : "Nije uspelo. Pokušaj ponovo.");
    } finally {
      setRadi(false);
    }
  };

  return (
    <li className="border-t border-line-soft/60 first:border-t-0">
      {/* Razmak je NA DETETU, ne na `Unfold`-u: `height: 0` sa `border-box`
          ne guta uspravan razmak, pa bi ostao trag od dvadesetak piksela. */}
      <Unfold open={!sklanjam}>
        <div className="px-3 py-2.5">
      <p className="text-ui font-medium leading-snug text-foreground">
        {zadatak.naslov}
      </p>
      {zadatak.imenilac && (
        <p className="mt-0.5 text-meta text-text-muted">
          {zadatak.odsecen ? "najmanje toliko · " : ""}
          {zadatak.imenilac}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* Radnja je neutralna: boja modula kaže gde si, ne šta da
            klikneš (CLAUDE.md, SPAJANJE S27). */}
        <Button
          render={<ProjekatLink href={zadatak.veza} onClick={onNavigate} />}
          nativeButton={false}
          variant="secondary"
          size="sm"
        >
          {zadatak.radnja}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={radi || !spreman}
          onClick={() =>
            void pokreni(() =>
              odlozi({ kljuc: zadatak.kljuc }),
            )
          }
          className="text-text-muted"
        >
          <Clock3 aria-hidden />
          Odloži 1 dan
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={radi || !spreman}
          onClick={() =>
            void pokreni(() =>
              sakrij({
                kljuc: zadatak.kljuc,
                broj: zadatak.broj,
              }),
            )
          }
          className="text-text-muted"
          title="Vraća se samo ako posao naraste."
        >
          <EyeOff aria-hidden />
          Sakrij
        </Button>
        {/* Posao koji čeka može da postane zadatak tima (S23); zvono se
            zatvara, a dijalog je u ljusci. */}
        <NapraviZadatak veza={vezaIzCekaTe(zadatak)} onPre={onNavigate} samoIkona />
      </div>
      {greska && (
        <p role="status" className="mt-1.5 text-meta text-danger">
          {greska}
        </p>
      )}
        </div>
      </Unfold>
    </li>
  );
}

function Sklonjeno({
  zadatak,
}: {
  zadatak: StaMeCeka["sklonjeni"][number];
}) {
  const { spreman } = useProjekat();
  const vrati = useProjekatMutation(api.notificationsStore.vratiZadatak);
  const [radi, setRadi] = useState(false);

  return (
    <li className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="min-w-0 truncate text-meta text-text-muted">
        {zadatak.naslov}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={radi || !spreman}
        onClick={() => {
          if (!spreman) return;
          setRadi(true);
          void vrati({ kljuc: zadatak.kljuc }).finally(() =>
            setRadi(false),
          );
        }}
        className="shrink-0 text-text-muted"
      >
        <RotateCcw aria-hidden />
        Vrati
      </Button>
    </li>
  );
}
