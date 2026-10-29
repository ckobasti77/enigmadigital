"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { BedzNaUglu } from "@/components/app/system/count-badge";
import { cn } from "@/lib/utils";
import { JaLink } from "./ja-link";
import { useProjektiTrake, useStanjeProjekata, type ProjekatTrake } from "./podaci-ljuske";
import { ProjekatZnak } from "./projekat-znak";
import { NotificationSettingsDialog } from "./prostor/lenji-dijalozi";
import { ZvonoKartice, nazivZvona, useInboxZvona } from "./prostor/inbox/zvono-inbox";

/**
 * ============================================================================
 * ZVONO „ČEKA TE“ U „JA“ (SPAJANJE P15–P16, plan S07 §2.3)
 * ============================================================================
 *
 * Van projekta zvono sabira posao koji čeka u svim mojim projektima
 * (`projekti.stanjeProjekata`, isto pravilo kao zvono projekta), a panel kaže
 * gde: projekat po red, sa brojem i vezom na njegovu početnu, gde čeka i
 * ceo spisak. Broj koji nije stigao (budžet čitanja, više od dvadeset
 * projekata) piše se kao „—“, nikad kao nula.
 *
 * Druga kartica je Inbox (P16, SPAJANJE S17): obaveštenja radnog dela iz
 * svih mojih projekata i ličnih poruka. Broj na zvonu je zbir oba.
 */
export function ZvonoJa({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [podesavanja, setPodesavanja] = useState(false);
  const stanja = useStanjeProjekata();
  const projekti = useProjektiTrake(null);
  const inbox = useInboxZvona(true);

  if (stanja === undefined || projekti === undefined) {
    return <Skeleton className={cn("size-11 rounded-lg md:size-8", className)} />;
  }

  const redovi = projekti.map((p) => ({ projekat: p, ceka: stanja.get(p.workspaceId)?.ceka ?? null }));
  const ukupno = redovi.reduce((zbir, r) => zbir + (r.ceka ?? 0), 0);
  const nepoznato = redovi.some((r) => r.ceka === null);
  const naziv = nazivZvona(ukupno, inbox, nepoznato);
  // Broj na zvonu: posao koji čeka + nepročitan Inbox (P16). Žuto samo kad
  // nešto čeka; samo nepročitan Inbox je neutralan broj.
  const broj = ukupno + (inbox?.broj ?? 0);

  const panelCeka = (
    <CekaTeJa
      redovi={redovi}
      nepoznato={nepoznato}
      naslov={inbox === null}
      onNavigate={() => setOpen(false)}
    />
  );

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          aria-label={naziv}
          title="Čeka te"
          className={cn(
            "hover-lift relative inline-flex size-11 cursor-pointer items-center justify-center rounded-lg text-text-muted transition-colors hover:text-foreground md:size-8 md:border md:border-line",
            broj > 0 && "text-foreground",
            className,
          )}
        >
          <Bell className="size-5 md:size-4" aria-hidden />
          <BedzNaUglu
            count={inbox?.odseceno ? Math.max(broj, 100) : broj}
            tone={ukupno > 0 ? "warning" : "neutral"}
            ugao="ikonica"
          />
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          // Oblačić je dijalog za čitač ekrana; bez imena bi bio samo „dijalog“ (S28).
          aria-label="Čeka te"
          className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0"
        >
          {inbox === null ? (
            panelCeka
          ) : (
            <ZvonoKartice
              ceka={panelCeka}
              cekaBroj={ukupno}
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
      <NotificationSettingsDialog open={podesavanja} onOpenChange={setPodesavanja} />
    </>
  );
}

/** „Čeka te“ po projektu (kakvo je bilo pre kartica). */
function CekaTeJa({
  redovi,
  nepoznato,
  naslov,
  onNavigate,
}: {
  redovi: Array<{ projekat: ProjekatTrake; ceka: number | null }>;
  nepoznato: boolean;
  /** Bez kartica panel sam nosi naslov „Čeka te“; sa karticama ga nosi kartica. */
  naslov: boolean;
  onNavigate: () => void;
}) {
  const saPoslom = redovi.filter((r) => (r.ceka ?? 0) > 0);
  return (
    <div className="flex max-h-[70vh] flex-col">
      {(naslov || nepoznato) && (
        <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line-soft px-3 py-2.5">
          {naslov && <p className="text-ui font-medium text-foreground">Čeka te</p>}
          {nepoznato && (
            <span
              className="ml-auto text-meta text-text-muted"
              title="Za bar jedan projekat broj nije stigao, pa je zbir donja granica."
            >
              najmanje toliko
            </span>
          )}
        </div>
      )}
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
                  onClick={onNavigate}
                  className="flex min-h-10 items-center gap-2.5 px-3 text-ui text-text-secondary transition-colors hover:bg-foreground/8 hover:text-foreground pointer-coarse:min-h-11"
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
  );
}
