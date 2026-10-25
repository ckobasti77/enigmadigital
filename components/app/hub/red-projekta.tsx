"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { NAZIV_ULOGE } from "@/convex/lib/uloge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, formatSignedNumber, formatSyncAge } from "@/lib/format";
import {
  NAZIV_VEZE,
  RAZLOG_BROJKE,
  tekstVeze,
  type CekaProjekta,
  type RazlogBrojke,
} from "@/lib/hub-zbir";
import { cn } from "@/lib/utils";
import { useQueryZaProjekat } from "../projekat-provider";
import { ProjekatZnak } from "../projekat-znak";
import { QuietBoundary } from "../quiet-boundary";

/**
 * ============================================================================
 * RED PROJEKTA U HUBU „SVI PROJEKTI“ (C16, plan C15 §1–§2)
 * ============================================================================
 *
 * Jedan red = jedan projekat. Red sam zove svoja dva upita za SVOJ projekat
 * (`hubStore.pregledProjekta` i zvono `staMeCeka`), pa svaki projekat ima
 * svoju transakciju i svoju proveru članstva; pad jednog reda ne obara ekran.
 *
 * Ista struktura je red tabele na širem ekranu i kartica na telefonu: ćelije
 * nose svoj natpis (vidljiv na telefonu, za čitač ekrana na širem ekranu).
 * Ceo red je jedna veza na projekat (razvučena veza na imenu); jedino drugo
 * interaktivno mesto je tačka veza sa detaljima.
 *
 * Nepoznato je „—“ sa razlogom, nikad 0.
 */

export type Pregled = FunctionReturnType<typeof api.hubStore.pregledProjekta>;
type Brojka = Pregled["posete"];
type Veza = Pregled["veze"][number];

export type ProjekatReda = {
  workspaceId: Id<"workspaces">;
  slug: string;
  ime: string;
  boja: string | null;
  logoUrl: string | null;
  uloga: "owner" | "urednik" | "client_viewer";
  vrsta: "interni" | "klijent";
};

/** Kolone brojki — iste u zaglavlju i u redu (širina mreže je u `MREZA`). */
export const KOLONE = [
  { kljuc: "posete", naziv: "Posete" },
  { kljuc: "leadovi", naziv: "Novi leadovi" },
  { kljuc: "pratioci", naziv: "Pratioci" },
  { kljuc: "oglasi", naziv: "Oglasi" },
  { kljuc: "poruke", naziv: "Poruke · sada" },
  { kljuc: "ceka", naziv: "Čeka" },
] as const;

/** Mreža reda na širem ekranu: projekat + šest brojki. */
export const MREZA =
  "lg:grid lg:grid-cols-[minmax(15rem,1.7fr)_repeat(6,minmax(0,1fr))] lg:items-center lg:gap-x-4";

const ZDRAVLJE = {
  ok: { klasa: "bg-success", tekst: "Veze rade" },
  upozorenje: { klasa: "bg-warning", tekst: "Veze traže pažnju" },
  greska: { klasa: "bg-danger", tekst: "Veza ne radi ili uskoro prestaje" },
} as const;

const STANJE_VEZE = {
  ok: { klasa: "bg-success", tekst: "radi" },
  upozorenje: { klasa: "bg-warning", tekst: "traži pažnju" },
  greska: { klasa: "bg-danger", tekst: "ne radi" },
} as const;

export function RedProjekta({
  projekat,
  od,
  doDana,
  sada,
  pomerajMin,
  onCeka,
}: {
  projekat: ProjekatReda;
  od: string;
  doDana: string;
  /** Trenutak zaokružen na minut; `0` (server) = još se ne pita. */
  sada: number;
  pomerajMin: number;
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void;
}) {
  const href = `/${projekat.slug}`;
  return (
    <li
      className={cn(
        "group relative grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 transition-colors sm:grid-cols-3",
        "has-[a[data-red]:hover]:bg-surface-raised has-[a[data-red]:focus-visible]:bg-surface-raised",
        MREZA,
        "lg:gap-y-0 lg:py-3",
      )}
    >
      <QuietBoundary fallback={<GlavaBezPregleda projekat={projekat} href={href} />}>
        <SaPregledom projekat={projekat} href={href} od={od} doDana={doDana} sada={sada} />
      </QuietBoundary>
      <QuietBoundary fallback={<CekaGreska workspaceId={projekat.workspaceId} onCeka={onCeka} />}>
        <CekaCelija projekat={projekat} pomerajMin={pomerajMin} onCeka={onCeka} />
      </QuietBoundary>
    </li>
  );
}

// ── glava reda: znak, ime (veza na projekat), uloga, zdravlje ───────────────

function Glava({
  projekat,
  href,
  tacka,
  razlog,
}: {
  projekat: ProjekatReda;
  href: string;
  tacka: ReactNode;
  razlog: ReactNode;
}) {
  return (
    <div className="col-span-full flex min-w-0 items-start gap-3 lg:col-span-1">
      <ProjekatZnak projekat={projekat} velicina="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={href}
            data-red=""
            className="min-w-0 truncate text-copy font-bold text-foreground outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {projekat.ime}
          </Link>
          {tacka}
        </div>
        <p className="truncate text-meta text-text-muted">
          {projekat.vrsta === "klijent" ? "Klijent · " : ""}
          {NAZIV_ULOGE[projekat.uloga]}
        </p>
        {razlog}
      </div>
    </div>
  );
}

function GlavaBezPregleda({ projekat, href }: { projekat: ProjekatReda; href: string }) {
  return (
    <>
      <Glava
        projekat={projekat}
        href={href}
        tacka={<span className="size-2 shrink-0 rounded-full bg-text-muted/60" aria-hidden />}
        razlog={<p className="text-meta text-text-secondary">Brojke trenutno nisu dostupne.</p>}
      />
      {KOLONE.slice(0, 5).map((k) => (
        <Celija key={k.kljuc} naziv={k.naziv}>
          <Nepoznato tekst="Brojke trenutno nisu dostupne" />
        </Celija>
      ))}
    </>
  );
}

function SaPregledom({
  projekat,
  href,
  od,
  doDana,
  sada,
}: {
  projekat: ProjekatReda;
  href: string;
  od: string;
  doDana: string;
  sada: number;
}) {
  const pregled = useQueryZaProjekat(
    projekat.workspaceId,
    api.hubStore.pregledProjekta,
    sada > 0 ? { od, do: doDana, sada } : "skip",
  );

  if (pregled === undefined) {
    return (
      <>
        <Glava
          projekat={projekat}
          href={href}
          tacka={<Skeleton className="size-2 rounded-full" />}
          razlog={null}
        />
        {KOLONE.slice(0, 5).map((k) => (
          <Celija key={k.kljuc} naziv={k.naziv}>
            <Skeleton className="h-4 w-12" />
          </Celija>
        ))}
      </>
    );
  }

  const najgora = pregled.veze.find((v) => v.stanje === "greska") ?? pregled.veze.find((v) => v.stanje === "upozorenje");
  const razlogTekst = najgora ? tekstVeze(najgora) : null;

  return (
    <>
      <Glava
        projekat={projekat}
        href={href}
        tacka={<DetaljiVeza projekat={projekat} pregled={pregled} sada={sada} />}
        razlog={
          razlogTekst ? (
            <p
              className={cn(
                "truncate text-meta",
                najgora?.stanje === "greska" ? "text-danger" : "text-warning",
              )}
            >
              {razlogTekst}
            </p>
          ) : pregled.zdravlje === "bez_veza" ? (
            <p className="truncate text-meta text-text-muted">Nema povezanih kanala</p>
          ) : null
        }
      />
      <Celija naziv="Posete">
        <Broj brojka={pregled.posete} />
      </Celija>
      <Celija naziv="Novi leadovi">
        <Broj brojka={pregled.noviLeadovi} />
        {pregled.upiti.vrednost !== null && pregled.upiti.vrednost > 0 && (
          <Pod>
            +{formatNumber(pregled.upiti.vrednost)}
            {pregled.upiti.vise ? "+" : ""} {pregled.upiti.vrednost === 1 ? "upit" : "upita"}
          </Pod>
        )}
      </Celija>
      <Celija naziv="Pratioci">
        <Broj
          brojka={pregled.pratioci}
          naslov={pregled.pratioci.kanali
            .map((k) => `${NAZIV_KANALA[k.kanal]}: ${k.vrednost === null ? "nema podataka" : formatNumber(k.vrednost)}`)
            .join(" · ")}
        />
        {pregled.pratioci.promena !== null && pregled.pratioci.promena !== 0 && (
          <Pod>{formatSignedNumber(pregled.pratioci.promena)} u periodu</Pod>
        )}
      </Celija>
      <Celija naziv="Oglasi">
        <Broj
          brojka={pregled.oglasi}
          format={(n) => formatCurrency(n, pregled.oglasi.valuta ?? undefined)}
        />
      </Celija>
      <Celija naziv="Poruke · sada">
        <Broj brojka={pregled.poruke} />
      </Celija>
    </>
  );
}

const NAZIV_KANALA: Record<"instagram" | "facebook" | "threads", string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  threads: "Threads",
};

// ── ćelije ───────────────────────────────────────────────────────────────────

function Celija({ naziv, children }: { naziv: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 lg:items-end lg:text-right">
      <span className="text-meta text-text-muted lg:sr-only">{naziv}</span>
      {children}
    </div>
  );
}

function Pod({ children }: { children: ReactNode }) {
  return <span className="truncate font-mono text-meta tabular-nums text-text-muted">{children}</span>;
}

function Nepoznato({ tekst }: { tekst: string }) {
  return (
    <span className="font-mono text-copy tabular-nums text-text-muted" title={tekst}>
      <span aria-hidden>—</span>
      <span className="sr-only">nepoznato: {tekst}</span>
    </span>
  );
}

function Broj({
  brojka,
  format = formatNumber,
  naslov,
}: {
  brojka: Brojka;
  format?: (n: number) => string;
  naslov?: string;
}) {
  if (brojka.vrednost === null) {
    return <Nepoznato tekst={RAZLOG_BROJKE[(brojka.razlog ?? "nema_podataka") as RazlogBrojke]} />;
  }
  return (
    <span
      className="font-mono text-copy tabular-nums text-foreground"
      title={naslov || (brojka.vise ? "najmanje toliko" : undefined)}
    >
      {format(brojka.vrednost)}
      {brojka.vise ? "+" : ""}
    </span>
  );
}

// ── „šta me čeka“ projekta ───────────────────────────────────────────────────

function CekaCelija({
  projekat,
  pomerajMin,
  onCeka,
}: {
  projekat: ProjekatReda;
  pomerajMin: number;
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void;
}) {
  const staMeCeka = useQueryZaProjekat(projekat.workspaceId, api.notificationsStore.staMeCeka, {
    pomerajMin,
  });
  const ws = projekat.workspaceId;
  useEffect(() => {
    onCeka(
      ws,
      staMeCeka === undefined
        ? { stanje: "ucitava" }
        : { stanje: "ok", ukupno: staMeCeka.ukupno, zadaci: staMeCeka.zadaci },
    );
  }, [ws, staMeCeka, onCeka]);

  return (
    <Celija naziv="Čeka">
      {staMeCeka === undefined ? (
        <Skeleton className="h-4 w-8" />
      ) : (
        <span
          className={cn(
            "font-mono text-copy tabular-nums",
            staMeCeka.ukupno > 0 ? "text-foreground" : "text-text-muted",
          )}
          title={staMeCeka.nepotpuno ? "najmanje toliko" : undefined}
        >
          {formatNumber(staMeCeka.ukupno)}
        </span>
      )}
    </Celija>
  );
}

function CekaGreska({
  workspaceId,
  onCeka,
}: {
  workspaceId: string;
  onCeka: (workspaceId: string, stanje: CekaProjekta) => void;
}) {
  useEffect(() => {
    onCeka(workspaceId, { stanje: "greska" });
  }, [workspaceId, onCeka]);
  return (
    <Celija naziv="Čeka">
      <Nepoznato tekst="Spisak posla trenutno nije dostupan" />
    </Celija>
  );
}

// ── zdravlje veza: tačka i detalji ──────────────────────────────────────────

function DetaljiVeza({
  projekat,
  pregled,
  sada,
}: {
  projekat: ProjekatReda;
  pregled: Pregled;
  sada: number;
}) {
  if (pregled.zdravlje === "bez_veza") return null;
  const z = ZDRAVLJE[pregled.zdravlje];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${z.tekst}. Detalji veza projekta ${projekat.ime}`}
        title={z.tekst}
        className="relative z-10 -m-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring max-lg:size-11 max-lg:-m-3.5"
      >
        <span className={cn("size-2 rounded-full", z.klasa)} aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 border border-line p-0">
        <div className="border-b border-line px-4 py-3">
          <p className="text-ui font-bold text-foreground">Veze · {projekat.ime}</p>
          <p className="text-meta text-text-muted">{z.tekst}</p>
        </div>
        <ul className="divide-y divide-line">
          {pregled.veze.map((veza) => (
            <RedVeze key={veza.provider} veza={veza} sada={sada} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function RedVeze({ veza, sada }: { veza: Veza; sada: number }) {
  const s = STANJE_VEZE[veza.stanje];
  const razlog = tekstVeze(veza);
  return (
    <li className="flex flex-col gap-1 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", s.klasa)} aria-hidden />
        <span className="flex-1 text-ui text-foreground">{NAZIV_VEZE[veza.provider] ?? veza.provider}</span>
        <span className="text-meta text-text-muted">{s.tekst}</span>
      </div>
      {razlog && <p className="pl-4 text-meta text-text-secondary">{razlog.replace(/^[^:]+: /, "")}</p>}
      <p className="pl-4 text-meta text-text-muted">
        {veza.lastSyncAt !== null ? `Sinhronizovano ${formatSyncAge(veza.lastSyncAt, sada)}` : "Još nije sinhronizovano"}
        {veza.kvota && (
          <>
            {" · "}
            <span className="whitespace-nowrap font-mono tabular-nums">
              {veza.kvota.vrsta === "procenat"
                ? `kvota aplikacije ${formatNumber(veza.kvota.potroseno)} %`
                : `kvota ${formatNumber(veza.kvota.potroseno)} / ${formatNumber(veza.kvota.granica)}`}
            </span>
          </>
        )}
      </p>
      {veza.greska && (
        <p className="pl-4 text-meta text-text-muted" title={veza.greska}>
          <span className="line-clamp-2">{veza.greska}</span>
        </p>
      )}
    </li>
  );
}
