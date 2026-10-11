import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * FOKUS KARTICA — jedna po ekranu (UI Boost §4.1, §5.2)
 * ============================================================================
 *
 * Svaki ekran ima tačno jednu zonu u koju oko prvo sleti: najvažniji broj ili
 * najvažniji zadatak, i jedno dugme. Ovo je ta zona. Zato sme ono što nijedna
 * druga kartica ne sme: ivicu od jednog piksela u gradijentu boje modula i
 * obojenu senku ispod sebe.
 *
 * Ivica je omotač sa `p-px` i gradijentom kao podlogom, a ne `border-image`
 * (koji ne poštuje zaobljenje). Senka je `shadow-mod`: sa pomerajem i tiha,
 * nikad oreol.
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
  /** Natpis iznad naslova, u boji modula („Danas", „Sledeće"). */
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
        "rounded-xl bg-[linear-gradient(135deg,var(--mod),var(--mod-strong)_38%,transparent_78%)] p-px shadow-mod",
        className,
      )}
    >
      <div className="flex h-full flex-col gap-5 rounded-[calc(var(--radius)*1.4-1px)] bg-card p-5 md:flex-row md:items-center md:justify-between md:gap-8">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {eyebrow && (
            <p className="heading-caps text-meta font-medium text-mod">{eyebrow}</p>
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
