import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ChartEmpty } from "@/components/app/chart-states";
import { cn } from "@/lib/utils";

/**
 * Jedan okvir za grafikone koji nisu `TimelineChart`: ista kartica
 * (`ring-line shadow-card`), isti header (naslov + opis levo, legenda/kontrola
 * desno), isto prazno stanje kroz `ChartEmpty`. Ranije je svaki grafikon crtao
 * svoj header i svoje prazno (dva stila kartice, ručne poruke) — ovo ih spaja.
 *
 * `TimelineChart` zadržava sopstveni okvir (etalon), ali deli iste konvencije.
 */
export function ChartCard({
  title,
  description,
  legend,
  footNote,
  empty,
  bodyClassName,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Desni slot: legenda (≥2 serije) ili kontrola. Jedna serija — bez legende. */
  legend?: ReactNode;
  /** Obavezna fusnota (npr. privatnost, vremenska zona) — ispod tela, uz ivicu. */
  footNote?: ReactNode;
  /** Kada je prazno: razlog ZAŠTO, ne samo „nema podataka". */
  empty?: ReactNode;
  bodyClassName?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("gap-0 py-0 shadow-card ring-line", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-text-muted">
              {description}
            </p>
          )}
        </div>
        {legend && <div className="shrink-0">{legend}</div>}
      </div>

      {empty ? (
        <ChartEmpty reason={empty} />
      ) : (
        <>
          <div className={cn("px-5 pb-5", bodyClassName)}>{children}</div>
          {footNote && (
            <div className="border-t border-line-soft px-5 py-2.5 text-micro text-text-muted">
              {footNote}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * Legenda: tačkica nosi identitet (boja serije), tekst je tekstualni token —
 * nikad boja serije na tekstu. Obavezna za ≥2 serije.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: readonly { color: string; label: string }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs",
        className,
      )}
    >
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: it.color }}
            aria-hidden
          />
          <span className="font-medium text-foreground">{it.label}</span>
        </span>
      ))}
    </div>
  );
}
