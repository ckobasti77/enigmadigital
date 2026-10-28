import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * FOKUS KARTICA — jedna po ekranu (UI Boost §4.1, §5.2)
 * ============================================================================
 *
 * Svaki ekran ima tačno jednu zonu u koju oko prvo sleti: najvažniji broj ili
 * najvažniji zadatak, i jedno dugme. Ovo je ta zona. Fokus je posao, nikad
 * nagrada (DESIGN.md „FocusCard").
 *
 * Ivica je 1 px, a senka tiha (`elev-1`). Boja modula ovde ne stoji (ULTRA
 * P1): ni na ivici, ni na natpisu, ni u sjaju — modul kaže „gde si", a fokus
 * nosi dugme u boji radnje.
 *
 * Dve kartice ove vrste na istom ekranu poništavaju jedna drugu — onda
 * nijedna nije fokus.
 */
export function FocusCard({
  eyebrow,
  title,
  children,
  action,
  aside,
  className,
}: {
  /** Natpis iznad naslova („Danas", „Sledeće"), u prigušenoj boji teksta. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  /** Broj, misija ili kratak sadržaj fokusa. */
  children?: ReactNode;
  /** Jedno dugme — po pravilu `primary`. */
  action?: ReactNode;
  /** Desna strana na širem ekranu (prstenovi, merač). Na telefonu ide ispod. */
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-line bg-card shadow-elev-1",
        className,
      )}
    >
      <div className="flex h-full flex-col gap-5 rounded-[calc(var(--radius)*1.4-1px)] p-5 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {eyebrow && (
            <p className="heading-caps text-meta font-medium text-text-muted">{eyebrow}</p>
          )}
          {title && (
            <h2 className="text-title font-bold text-foreground">{title}</h2>
          )}
          {children}
          {action && <div className="flex flex-wrap items-center gap-2 pt-1">{action}</div>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </section>
  );
}
