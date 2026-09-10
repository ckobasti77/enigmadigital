"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import { Bell, Clock3, EyeOff, RotateCcw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CountBadge } from "@/components/app/system/count-badge";
import { Unfold } from "@/components/motion/unfold";
import { cn } from "@/lib/utils";
import { QuietBoundary } from "./quiet-boundary";
import { useWorkspace } from "./workspace-provider";
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

export function NotificationsBell({ className }: { className?: string }) {
  return (
    <QuietBoundary>
      <Zvono className={className} />
    </QuietBoundary>
  );
}

function Zvono({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const data = useStaMeCeka();

  if (data === undefined) {
    return <Skeleton className={cn("size-8 rounded-lg", className)} />;
  }

  const ukupno = data.ukupno;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={
          ukupno > 0
            ? `Šta me čeka: ${ukupno} ${ukupno === 1 ? "stavka" : "stavki"}`
            : "Šta me čeka: nema ničega"
        }
        title="Šta me čeka"
        className={cn(
          "hover-lift relative inline-flex size-8 items-center justify-center rounded-lg border border-line text-text-muted transition-colors hover:text-foreground",
          ukupno > 0 && "text-foreground",
          className,
        )}
      >
        <Bell className="size-4" aria-hidden />
        {/* Bez posla — bez bedža. Nikad „0" (A1 §3). */}
        <CountBadge
          count={ukupno}
          tone={data.zadaci.some((z) => z.hitnost === "visoka") ? "danger" : "warning"}
          className="absolute -right-1.5 -top-1.5 h-4 min-w-4 px-1 text-[10px]"
        />
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <Panel data={data} onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function Panel({
  data,
  onNavigate,
}: {
  data: StaMeCeka;
  onNavigate: () => void;
}) {
  const { workspace } = useWorkspace();
  const workspaceId = workspace?.id as Id<"workspaces"> | undefined;
  const [prikaziSklonjene, setPrikaziSklonjene] = useState(false);

  const grupe = HITNOST_RED.map((hitnost) => ({
    hitnost,
    zadaci: data.zadaci.filter((z) => z.hitnost === hitnost),
  })).filter((g) => g.zadaci.length > 0);

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line-soft px-3 py-2.5">
        <p className="text-ui font-medium text-foreground">Šta me čeka</p>
        {data.nepotpuno && (
          <span
            className="text-meta text-text-muted"
            title="Bar jedan brojač je čitan sa granicom, pa je prikazan broj donja granica, a ne tačan broj."
          >
            najmanje toliko
          </span>
        )}
      </div>

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
                    workspaceId={workspaceId}
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
                    workspaceId={workspaceId}
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
  workspaceId,
  onNavigate,
}: {
  zadatak: Zadatak;
  workspaceId: Id<"workspaces"> | undefined;
  onNavigate: () => void;
}) {
  const odlozi = useMutation(api.notificationsStore.odloziZadatak);
  const sakrij = useMutation(api.notificationsStore.sakrijZadatak);
  const [radi, setRadi] = useState(false);
  // Optimističko stanje: stavka krene da se skuplja u istom kadru u kom je
  // dugme pritisnuto, ne posle povratka sa servera (A8 §1, odziv ≤ 100 ms).
  // Ako mutacija padne, vraća se i kaže zašto — obećanje se povlači naglas.
  const [sklanjam, setSklanjam] = useState(false);
  const [greska, setGreska] = useState<string | null>(null);

  const pokreni = async (posao: () => Promise<unknown>) => {
    if (!workspaceId || radi) return;
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
        <Link
          href={zadatak.veza}
          onClick={onNavigate}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-accent-400/40 bg-accent-400/10 px-2.5 text-meta font-medium text-accent-400 transition-colors hover:border-accent-400/60"
        >
          {zadatak.radnja}
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          disabled={radi || !workspaceId}
          onClick={() =>
            void pokreni(() =>
              odlozi({ workspaceId: workspaceId!, kljuc: zadatak.kljuc }),
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
          disabled={radi || !workspaceId}
          onClick={() =>
            void pokreni(() =>
              sakrij({
                workspaceId: workspaceId!,
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
  workspaceId,
}: {
  zadatak: StaMeCeka["sklonjeni"][number];
  workspaceId: Id<"workspaces"> | undefined;
}) {
  const vrati = useMutation(api.notificationsStore.vratiZadatak);
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
        disabled={radi || !workspaceId}
        onClick={() => {
          if (!workspaceId) return;
          setRadi(true);
          void vrati({ workspaceId, kljuc: zadatak.kljuc }).finally(() =>
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
