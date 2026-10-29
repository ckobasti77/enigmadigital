"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { BedzNaUglu } from "@/components/app/system/count-badge";
import { cn } from "@/lib/utils";
import { JaLink } from "./ja-link";
import { useProjektiTrake, useStanjeProjekata } from "./podaci-ljuske";
import { ProjekatZnak } from "./projekat-znak";

/**
 * ============================================================================
 * ZVONO „ČEKA TE“ U „JA“ (SPAJANJE P15–P16, plan S07 §2.3)
 * ============================================================================
 *
 * Van projekta zvono sabira posao koji čeka u svim mojim projektima
 * (`projekti.stanjeProjekata`, isto pravilo kao zvono projekta), a panel kaže
 * gde: projekat po red, sa brojem i vezom na njegovu početnu, gde čeka i
 * ceo spisak. Broj koji nije stigao (budžet čitanja, više od dvadeset
 * projekata) piše se kao „—“, nikad kao nula. Kartica Inbox stiže sa
 * obaveštenjima radnog dela.
 */
export function ZvonoJa({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const stanja = useStanjeProjekata();
  const projekti = useProjektiTrake(null);

  if (stanja === undefined || projekti === undefined) {
    return <Skeleton className={cn("size-11 rounded-lg md:size-8", className)} />;
  }

  const redovi = projekti.map((p) => ({ projekat: p, ceka: stanja.get(p.workspaceId)?.ceka ?? null }));
  const ukupno = redovi.reduce((zbir, r) => zbir + (r.ceka ?? 0), 0);
  const nepoznato = redovi.some((r) => r.ceka === null);
  const saPoslom = redovi.filter((r) => (r.ceka ?? 0) > 0);
  const naziv =
    ukupno > 0
      ? `Čeka te: ${ukupno} ${ukupno === 1 ? "stavka" : "stavki"}${nepoznato ? " ili više" : ""}`
      : "Čeka te: nema ničega";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={naziv}
        title="Čeka te"
        className={cn(
          "hover-lift relative inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:text-foreground md:size-8 md:border md:border-line",
          ukupno > 0 && "text-foreground",
          className,
        )}
      >
        <Bell className="size-5 md:size-4" aria-hidden />
        <BedzNaUglu count={ukupno} tone="warning" ugao="ikonica" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[min(22rem,calc(100vw-2rem))] gap-0 p-0"
      >
        <div className="flex max-h-[70vh] flex-col">
          <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line-soft px-3 py-2.5">
            <p className="text-ui font-medium text-foreground">Čeka te</p>
            {nepoznato && (
              <span
                className="text-meta text-text-muted"
                title="Za bar jedan projekat broj nije stigao, pa je zbir donja granica."
              >
                najmanje toliko
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {saPoslom.length === 0 ? (
              <div className="px-3 py-5">
                <p className="text-ui text-foreground">Ništa ne čeka.</p>
                <p className="mt-1 text-meta leading-relaxed text-text-muted">
                  Provereno u svim tvojim projektima: uvozi, koraci i sastanci,
                  komentari i poruke bez odgovora i stanje integracija.
                  {nepoznato ? " Za neke projekte broj nije stigao, pa piše „—“." : ""}
                </p>
              </div>
            ) : null}
            <ul className="flex flex-col">
              {(saPoslom.length > 0 ? redovi.filter((r) => r.ceka !== 0) : redovi.filter((r) => r.ceka === null)).map(
                ({ projekat, ceka }) => (
                  <li key={projekat.workspaceId}>
                    <JaLink
                      href={`/${projekat.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex min-h-10 items-center gap-2.5 px-3 text-ui text-text-secondary transition-colors hover:bg-foreground/8 hover:text-foreground"
                    >
                      <ProjekatZnak projekat={projekat} velicina="sm" />
                      <span className="min-w-0 flex-1 truncate">{projekat.ime}</span>
                      <span
                        className="shrink-0 text-meta tabular-nums text-text-muted"
                        title={ceka === null ? "Broj nije dostupan" : undefined}
                      >
                        {ceka ?? "—"}
                      </span>
                    </JaLink>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
