"use client";

import Link from "next/link";
import { ArrowRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Monogram } from "@/components/app/system/monogram";
import { ROW_EDGE_CLASS, type RowEdge } from "./lead-urgency";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * JEZIK KARTICA RADNOG REDA (A4 §2, v2 u B6)
 * ============================================================================
 *
 * A3 je za jezičak „Danas" napravio oblik koji radi: sekcija sa naslovom,
 * ispisanim kriterijumom i brojem, pa mreža kartica — svaka kartica nosi ime
 * firme, jedan red konteksta, „zašto" i JEDNU primarnu radnju. Radni redovi
 * („Rupe u podacima", „Zaostali", „Sastanci") su do A4 imali tri različita
 * oblika: široku tabelu od sedam kolona, drugu tabelu od šest, i listu redova
 * u karticama po grupama.
 *
 * Ovde su `Traka`/`Kartica` iz `leads-today.tsx` izvučene u jedan vlasnik
 * oblika, pa sva četiri ekrana govore isti jezik. Nijedan panel ne crta svoju
 * varijantu kartice — ako oblik treba da se promeni, menja se ovde.
 *
 * Zašto je to i popravka, ne samo urednost: tabela od sedam kolona u „Rupama
 * u podacima" je na 1568 px sekla poslednje kolone („Evidentirano", „Akcija")
 * iza `overflow-x-auto` — podatak je bio na ekranu, ali nedohvatljiv bez
 * vodoravnog klizanja koje se ne vidi. Kartica se prelama, pa preliva nema ni
 * na jednoj širini.
 *
 * v2 (UI Boost §4.3, §5.6): kriterijum sekcije više nije red sitnog teksta
 * nego oblačić iza „i" (otvara se klikom, pa radi i na telefonu); kartica ume
 * da nosi monogram firme u boji niše i jedan mali merač desno (Fit prsten).
 * Oba su opciona — panel koji ih ne prosledi izgleda kao i do sada.
 */

/** Jedna sekcija radnog reda: naslov, kriterijum, broj, radnje, mreža kartica. */
export function WorkSection({
  naslov,
  icon: Icon,
  kriterijum,
  ukupno,
  najmanje,
  vidiSve,
  dodatniLink,
  loading,
  prazno,
  praznoAkcija,
  tone = "neutral",
  children,
}: {
  naslov: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Uslov ulaska u red — bez njega broj nema imenilac. Delovi su razdvojeni sa „ · ". */
  kriterijum: string;
  /** `undefined` = broj se ne zna (ne crta se); nikad 0 kao „ne znamo". */
  ukupno: number | undefined;
  /** Broj je donja granica (upit je odsečen) — ispisuje se kao „≥ N". */
  najmanje?: boolean;
  vidiSve?: { label: string; onClick: () => void };
  dodatniLink?: { label: string; onClick: () => void };
  loading: boolean;
  /** Rečenica „šta nedostaje i šta to rešava". Nikad kvačica. */
  prazno?: ReactNode;
  praznoAkcija?: { label: string; onClick: () => void };
  /** Bojio naslov sekcije samo kad je sekcija razlog za uzbunu. */
  tone?: "neutral" | "warning" | "danger";
  children?: ReactNode;
}) {
  const uslovi = kriterijum
    .split(" · ")
    .map((u) => u.trim())
    .filter(Boolean);

  return (
    <section aria-label={naslov} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2
          className={cn(
            "inline-flex items-center gap-2 text-title font-bold",
            tone === "danger"
              ? "text-danger"
              : tone === "warning"
                ? "text-warning"
                : "text-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              tone === "danger"
                ? "text-danger"
                : tone === "warning"
                  ? "text-warning"
                  : "text-mod",
            )}
            aria-hidden
          />
          {naslov}
          {ukupno !== undefined && (
            <span className="font-mono text-ui font-medium tabular-nums text-text-muted">
              {najmanje ? "≥ " : ""}
              {ukupno}
            </span>
          )}
        </h2>
        {uslovi.length > 0 && (
          <Popover>
            <PopoverTrigger
              aria-label={`Ko ulazi u „${naslov}”`}
              className="touch-target inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:text-mod"
            >
              <Info className="size-3.5" aria-hidden />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64">
              <p className="text-meta font-medium text-text-muted">
                U ovaj red ulazi firma koja:
              </p>
              <ul className="flex flex-col gap-1 text-ui text-foreground">
                {uslovi.map((uslov) => (
                  <li key={uslov} className="flex gap-2">
                    <span
                      aria-hidden
                      className="mt-2 size-1 shrink-0 rounded-full bg-mod"
                    />
                    {uslov}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <span className="ml-auto flex items-center gap-3">
          {dodatniLink && (
            <button
              type="button"
              onClick={dodatniLink.onClick}
              className="cursor-pointer text-meta text-text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              {dodatniLink.label}
            </button>
          )}
          {vidiSve && (
            <button
              type="button"
              onClick={vidiSve.onClick}
              className="inline-flex cursor-pointer items-center gap-1 text-meta font-medium text-mod underline-offset-2 hover:underline"
            >
              {vidiSve.label}
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          )}
        </span>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : prazno ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-ui text-text-muted">
          <p className="min-w-56 flex-1">{prazno}</p>
          {praznoAkcija && (
            <Button
              variant="outline"
              size="sm"
              onClick={praznoAkcija.onClick}
              className="shrink-0"
            >
              {praznoAkcija.label}
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
      )}
    </section>
  );
}

/**
 * Jedna stavka radnog reda. Leva ivica je hitnost ili temperatura
 * (`lead-urgency.ts`), naziv firme je najteži element, „zašto" je red čipova
 * ili jedna rečenica razloga, a dole stoji TAČNO jedna glavna radnja (plus
 * opciono tiha sporedna).
 */
export function WorkCard({
  edge,
  href,
  name,
  meta,
  monogram,
  aside,
  zasto,
  primary,
  secondary,
  children,
  className,
}: {
  edge: RowEdge;
  /** Profil firme; kartica bez linka (npr. firma bez dodele) prosleđuje `null`. */
  href: string | null;
  name: string;
  meta: string;
  /** Monogram firme; `seed` je niša (boja kategorije), bez nje boja ide iz naziva. */
  monogram?: { seed?: string | null };
  /** Mali merač gore desno (Fit prsten). */
  aside?: ReactNode;
  zasto: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-l-4 border-line bg-card px-4 py-3 shadow-card",
        edge ? ROW_EDGE_CLASS[edge] : "border-l-line-strong",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {monogram && <Monogram name={name} seed={monogram.seed} className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="block truncate text-copy font-bold text-foreground underline-offset-2 transition-colors hover:text-mod hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="block truncate text-copy font-bold text-foreground">
              {name}
            </span>
          )}
          <p className="truncate text-meta text-text-muted">{meta || "—"}</p>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{zasto}</div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        {primary ?? <span className="text-meta text-text-muted">—</span>}
        {secondary}
      </div>
      {children}
    </article>
  );
}
