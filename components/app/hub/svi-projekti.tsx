"use client";

import Link from "next/link";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ChevronRight, FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { NAZIV_ULOGE } from "@/convex/lib/uloge";
import { formatNumber, pluralSr } from "@/lib/format";
import { zbirCekanja, type CekaProjekta } from "@/lib/hub-zbir";
import { cn } from "@/lib/utils";
import { DateRangePicker, useDateRange } from "../date-range-picker";
import { useSada } from "../napredak/use-napredak";
import { ProjekatZnak } from "../projekat-znak";
import { EmptyState } from "../system/empty-state";
import { NOVI_PROJEKAT_HREF, NOVI_PROJEKAT_POSTOJI } from "../nav-items";
import { UserMenu } from "../user-menu";
import { CekaTe } from "./ceka-te";
import { KOLONE, MREZA, RedProjekta, type ProjekatReda } from "./red-projekta";

/**
 * ============================================================================
 * HUB „SVI PROJEKTI“ (`/` van panela; C16, plan C15 §1)
 * ============================================================================
 *
 * Red po projektu (posete, novi leadovi, pratioci, oglasi, neodgovorene
 * poruke, broj posla) za izabrani period, tačka zdravlja veza i zbirno „šta
 * me čeka“ sa imenom projekta. Brojke se traže za najviše 20 projekata
 * (PROJEKTI-PLAN §11); ostali i arhivirani su obične veze.
 *
 * Hub je van projekta, pa veze vode eksplicitno na `/<slug>` (`next/link`),
 * a ne kroz `ProjekatLink`. Svaki red sam pita za svoj projekat
 * (`RedProjekta`), pa članstvo proverava server za svaki projekat posebno.
 */

/** Ista širina i iste ivice kao gornja traka ljuske projekta. */
const ROW = "mx-auto w-full max-w-[var(--content-max)] px-[var(--gutter)]";

/** Brojke se traže za najviše ovoliko projekata (PROJEKTI-PLAN §11). */
export const MAKS_PROJEKATA_HUBA = 20;

/** Isti pomeraj kao zvono (`use-sta-me-ceka.ts`), da broj bude isti. */
const POMERAJ_MIN = -new Date().getTimezoneOffset();

export function SviProjekti() {
  const projekti = useQuery(api.projekti.mojiProjekti);
  const ja = useQuery(api.projekti.ja);
  const praviProjekte = NOVI_PROJEKAT_POSTOJI && ja?.platformaVlasnik === true;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="material edge-fade-b sticky top-0 z-30 shrink-0">
        <div className={cn(ROW, "flex h-[var(--chrome-height)] items-center gap-3")}>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            Svi projekti
          </h1>
          {praviProjekte && (
            <Button
              variant="secondary"
              size="sm"
              nativeButton={false}
              render={<Link href={NOVI_PROJEKAT_HREF} />}
              className="touch-target"
            >
              <Plus aria-hidden />
              Novi projekat
            </Button>
          )}
          <UserMenu />
        </div>
      </header>

      <main
        id="sadrzaj"
        tabIndex={-1}
        className={cn(ROW, "flex flex-1 flex-col gap-5 py-6 outline-none")}
      >
        {projekti === undefined ? (
          <SpisakSkeleton />
        ) : projekti.length === 0 ? (
          <EmptyState icon={FolderOpen} size="lg" title="Nisi član nijednog projekta." />
        ) : (
          <Suspense fallback={<SpisakSkeleton />}>
            <Portfolio projekti={projekti} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

type Stavka = NonNullable<ReturnType<typeof useQuery<typeof api.projekti.mojiProjekti>>>[number];

function poRedosledu(a: Stavka, b: Stavka): number {
  const ra = a.redosled ?? Number.POSITIVE_INFINITY;
  const rb = b.redosled ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.ime.localeCompare(b.ime, "sr-Latn");
}

function Portfolio({ projekti }: { projekti: readonly Stavka[] }) {
  const { range } = useDateRange();
  const sada = useSada();

  const { aktivni, ostali, arhivirani } = useMemo(() => {
    const neArhivirani = projekti.filter((p) => !p.arhiviran).sort(poRedosledu);
    return {
      aktivni: neArhivirani.slice(0, MAKS_PROJEKATA_HUBA),
      ostali: neArhivirani.slice(MAKS_PROJEKATA_HUBA),
      arhivirani: projekti.filter((p) => p.arhiviran).sort(poRedosledu),
    };
  }, [projekti]);

  const [ceka, setCeka] = useState<ReadonlyMap<string, CekaProjekta>>(new Map());
  const javiCeka = useCallback((ws: string, stanje: CekaProjekta) => {
    setCeka((pre) => {
      const sledeca = new Map(pre);
      sledeca.set(ws, stanje);
      return sledeca;
    });
  }, []);
  const zbir = useMemo(
    () =>
      zbirCekanja(
        aktivni.map((p) => ({ workspaceId: p.workspaceId, slug: p.slug, ime: p.ime })),
        ceka,
      ),
    [aktivni, ceka],
  );

  const ukupnoAktivnih = aktivni.length + ostali.length;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-ui text-text-secondary">
          <span className="font-mono tabular-nums text-foreground">{formatNumber(ukupnoAktivnih)}</span>{" "}
          {pluralSr(ukupnoAktivnih, "projekat", "projekta", "projekata")}
          {/* Period piše birač pored; ovde bi bio ponovljen. */}
        </p>
        <DateRangePicker />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <CekaTe
          zbir={zbir}
          className="min-w-0 lg:sticky lg:top-[calc(var(--chrome-height)+1.5rem)] lg:order-2"
        />

        <section aria-label="Projekti" className="flex min-w-0 flex-col gap-4 lg:order-1">
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <div
              aria-hidden
              className={cn(
                "hidden border-b border-line px-4 py-2 text-meta text-text-muted",
                MREZA,
              )}
            >
              <span>Projekat</span>
              {KOLONE.map((k) => (
                <span key={k.kljuc} className="text-right">
                  {k.naziv}
                </span>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {aktivni.map((p) => (
                <RedProjekta
                  key={p.workspaceId}
                  projekat={p as ProjekatReda}
                  od={range.from}
                  doDana={range.to}
                  sada={sada}
                  pomerajMin={POMERAJ_MIN}
                  onCeka={javiCeka}
                />
              ))}
            </ul>
          </div>

          {ostali.length > 0 && (
            <SpisakVeza
              naslov={`Prikazano ${formatNumber(MAKS_PROJEKATA_HUBA)} od ${formatNumber(ukupnoAktivnih)}. Ostali projekti:`}
              projekti={ostali}
              otvoren
            />
          )}
          {arhivirani.length > 0 && (
            <SpisakVeza
              naslov={`Arhivirani (${formatNumber(arhivirani.length)})`}
              projekti={arhivirani}
            />
          )}
        </section>
      </div>
    </>
  );
}

/** Projekti bez brojki: preko granice od 20 i arhivirani. */
function SpisakVeza({
  naslov,
  projekti,
  otvoren = false,
}: {
  naslov: string;
  projekti: readonly Stavka[];
  otvoren?: boolean;
}) {
  return (
    <details open={otvoren} className="group/spisak rounded-xl border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-ui text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 text-text-muted transition-transform group-open/spisak:rotate-90"
        />
        {naslov}
      </summary>
      <ul className="grid gap-x-4 border-t border-line px-2 py-2 sm:grid-cols-2 xl:grid-cols-3">
        {projekti.map((p) => (
          <li key={p.workspaceId}>
            <Link
              href={`/${p.slug}`}
              className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ProjekatZnak projekat={p} velicina="sm" />
              <span className="min-w-0 flex-1 truncate text-ui text-foreground">{p.ime}</span>
              <span className="shrink-0 text-meta text-text-muted">{NAZIV_ULOGE[p.uloga]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SpisakSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <Skeleton className="h-5 w-56" />
      <div className="divide-y divide-line rounded-xl border border-line bg-card">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="hidden h-4 w-48 lg:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
