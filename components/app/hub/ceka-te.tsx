"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, pluralSr } from "@/lib/format";
import { vezaUProjektu, type Hitnost, type Zbir } from "@/lib/hub-zbir";
import { cn } from "@/lib/utils";
import { resolveModule } from "../nav-items";

/**
 * ============================================================================
 * „ČEKA TE“ — zbirno „šta me čeka“ svih projekata (C16, plan C15 §1.4)
 * ============================================================================
 *
 * Fokus ekrana „Svi projekti“: posao iz svih projekata u jednom spisku, sa
 * imenom projekta (tekst, ne boja projekta). Stavka samo vodi u projekat;
 * odloži i sakrij ostaju u zvonu projekta, jer su to izmene projekta.
 *
 * Na širem ekranu je desna kolona, uvek otvorena; na telefonu je jedan red
 * na vrhu koji se otvara na dodir.
 */

const NAJVISE = 8;

const HITNOST: Record<Hitnost, { klasa: string; tekst: string }> = {
  visoka: { klasa: "bg-danger", tekst: "Hitno" },
  srednja: { klasa: "bg-warning", tekst: "Ovih dana" },
  niska: { klasa: "bg-text-muted/70", tekst: "Kad stigne red" },
};

function sazetak(zbir: Zbir): string {
  if (zbir.ukupno === 0) return "Nema posla na čekanju";
  return `${formatNumber(zbir.ukupno)} ${pluralSr(zbir.ukupno, "zadatak", "zadatka", "zadataka")} · ${formatNumber(zbir.projekata)} ${pluralSr(zbir.projekata, "projekat", "projekta", "projekata")}`;
}

export function CekaTe({
  zbir,
  className,
  najvise = NAJVISE,
}: {
  zbir: Zbir;
  className?: string;
  /** Stavki pre „Prikaži sve“ (hub 8, Danas 5). */
  najvise?: number;
}) {
  const [otvoreno, setOtvoreno] = useState(false);
  const [sve, setSve] = useState(false);
  const telo = useId();
  const prikazane = sve ? zbir.stavke : zbir.stavke.slice(0, najvise);
  const nista = !zbir.ucitava && zbir.stavke.length === 0;

  return (
    <section
      aria-label="Čeka te"
      className={cn("rounded-xl border border-line bg-card shadow-sm", className)}
    >
      {/* Telefon: jedan red koji otvara spisak. */}
      <button
        type="button"
        aria-expanded={otvoreno}
        aria-controls={telo}
        onClick={() => setOtvoreno((o) => !o)}
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
      >
        <span className="text-copy font-bold text-foreground">Čeka te</span>
        <span className="min-w-0 flex-1 truncate text-ui text-text-secondary">
          {zbir.ucitava && zbir.stavke.length === 0 ? "Sabiram…" : sazetak(zbir)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn("size-4 shrink-0 text-text-muted transition-transform", otvoreno && "rotate-180")}
        />
      </button>

      {/* Širi ekran: naslov kolone. */}
      <div className="hidden flex-col gap-0.5 border-b border-line px-4 py-3 lg:flex">
        <h2 className="text-copy font-bold text-foreground">
          Čeka te
        </h2>
        <p className="text-ui text-text-secondary">
          {zbir.ucitava && zbir.stavke.length === 0 ? "Sabiram posao iz projekata…" : sazetak(zbir)}
        </p>
      </div>

      <div id={telo} className={cn(otvoreno ? "block" : "hidden", "border-t border-line lg:block lg:border-t-0")}>
        {zbir.ucitava && zbir.stavke.length === 0 ? (
          <div className="flex flex-col gap-3 px-4 py-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : nista ? (
          <p className="px-4 py-4 text-ui text-text-secondary">
            Nijedan projekat trenutno nema posla na čekanju.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {prikazane.map(({ projekat, zadatak }) => (
              <li
                key={`${projekat.workspaceId}:${zadatak.kljuc}`}
                // Radnja nosi boju modula u koji vodi (isto kao zvono).
                data-module={resolveModule(zadatak.veza.split(/[?#]/)[0])}
                className="flex items-start gap-3 px-4 py-3"
              >
                <span
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", HITNOST[zadatak.hitnost].klasa)}
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-ui font-bold leading-snug text-foreground">{zadatak.naslov}</p>
                  <p className="truncate text-meta text-text-muted">
                    <span className="sr-only">{HITNOST[zadatak.hitnost].tekst} · </span>
                    {projekat.ime}
                    {zadatak.imenilac ? ` · ${zadatak.imenilac}` : ""}
                  </p>
                </div>
                <Link
                  href={vezaUProjektu(projekat.slug, zadatak.veza)}
                  className="touch-target inline-flex h-7 shrink-0 items-center rounded-md border border-mod-line bg-mod-soft px-2.5 text-meta text-mod transition-colors hover:border-mod focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {zadatak.radnja}
                  <span className="sr-only"> u projektu {projekat.ime}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {(zbir.stavke.length > najvise || zbir.bezPodataka.length > 0) && (
          <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
            {zbir.stavke.length > najvise && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="touch-target self-start"
                aria-expanded={sve}
                onClick={() => setSve((s) => !s)}
              >
                {sve ? "Prikaži manje" : `Prikaži sve (${formatNumber(zbir.stavke.length)})`}
              </Button>
            )}
            {zbir.bezPodataka.length > 0 && (
              <p className="text-meta text-text-muted">
                Bez podataka: {zbir.bezPodataka.map((p) => p.ime).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
