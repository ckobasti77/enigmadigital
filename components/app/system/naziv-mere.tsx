"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { mera as meraIzRecnika, type KljucMere } from "@/lib/mere";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * NAZIV MERE — srpski naziv, akronim u oblačiću (ULTRA O15, plan T08 §9.2)
 * ============================================================================
 *
 * Natpis je uvek srpski naziv iz `lib/mere.ts` („Cena po rezultatu"); akronim
 * („CPA") i definicija su u oblačiću. Oblačić je `Popover`, ne `title`, jer
 * `title` ne radi na dodir ni tastaturom:
 *
 *   - miš: otvara se na hover posle 300 ms;
 *   - dodir i tastatura: klik / Enter na natpis; Esc zatvara.
 *
 * Okidač izgleda kao tekst (tačkasto podvučen) i ne menja visinu reda; na
 * dodir dobija nevidljivo proširenje mete.
 *
 * U linku ili dugmetu (pločica sa `href`, zaglavlje koje sortira) natpis se
 * ne crta kao okidač — ugnežđena interakcija je greška (axe
 * `nested-interactive`). Tamo stoji običan tekst, a pored njega, van linka,
 * sestrinski `InfoMere`.
 */

function Oblacic({ mera }: { mera: KljucMere }) {
  const m = meraIzRecnika(mera);
  return (
    <PopoverContent side="top" className="max-w-xs text-ui leading-relaxed">
      <p>
        {m.akronim && (
          <>
            <span className="font-semibold text-foreground">{m.akronim}</span>
            <span className="text-text-muted"> · </span>
          </>
        )}
        <span className="text-text-secondary">{m.definicija}</span>
      </p>
    </PopoverContent>
  );
}

export function NazivMere({
  mera,
  kratko = false,
  tekst: zadat,
  className,
}: {
  mera: KljucMere;
  /** Kratak naziv za uske pločice. */
  kratko?: boolean;
  /** Natpis ekrana kad je uži od naziva mere („Prihod od oglasa"); srpski, bez akronima. */
  tekst?: ReactNode;
  className?: string;
}) {
  const m = meraIzRecnika(mera);
  const tekst = zadat ?? (kratko ? m.kratko : m.naziv);
  if (!m.akronim && !m.definicija) {
    return <span className={className}>{tekst}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        className={cn(
          "relative inline cursor-help rounded-sm text-left underline decoration-text-muted decoration-dotted underline-offset-4 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring",
          // Na dodir: veća meta bez promene visine reda (pravilo 44 px iz
          // globals.css ovde ne važi, jer je ovo tekst u redu). Red teksta
          // je ~19 px, pa 2 × 14 px proširenja daje 47 px (≥ 44).
          "pointer-coarse:min-h-0 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3.5 pointer-coarse:after:content-['']",
          className,
        )}
      >
        {tekst}
      </PopoverTrigger>
      <Oblacic mera={mera} />
    </Popover>
  );
}

/** Samo ikonica „i" sa istim oblačićem — za natpis unutar linka ili dugmeta. */
export function InfoMere({ mera, className }: { mera: KljucMere; className?: string }) {
  const m = meraIzRecnika(mera);
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={300}
        aria-label={`${m.naziv}: objašnjenje`}
        className={cn(
          "touch-target inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-sm text-text-muted outline-none transition-colors duration-(--duration-fast) hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Info className="size-3.5" strokeWidth={1.75} aria-hidden />
      </PopoverTrigger>
      <Oblacic mera={mera} />
    </Popover>
  );
}
