import type { ComponentType, ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * PRAZNO STANJE — nikad ne slavi prazninu (A1 §3, v2 u B2)
 * ============================================================================
 *
 * Izmereno 9.9.2026: „Nema zaostalih koraka!" sa zelenom kvačicom dok 178
 * firmi čeka prvi poziv. Prazna lista je činjenica o jednom preseku, ne
 * vest da je posao gotov — zato ovde nema uspešne ikonice ni uzvičnika.
 *
 * Tri dela, svaki radi jedan posao:
 *   - `title`    šta je prazno („Nema zaostalih koraka");
 *   - `children` šta to znači i šta je sledeće — obavezno kad posao postoji
 *                drugde („Leadovi bez planiranog koraka su u tabeli");
 *   - `action`   jedno dugme ili link ka tom sledećem koraku.
 *
 * Tri oblika:
 *
 *   `plain`    (podrazumevan) neutralan — lista je prazna, i to je sve. Bez
 *              `title` crta se jednoredna varijanta (ikonica + rečenica).
 *
 *   `mission`  „Misija za start" (UI Boost §5.7): ekran još nema podataka jer
 *              nešto nije urađeno, a to nešto je jedna jasna radnja. Ikonica u
 *              prstenu boje modula, jedno primarno dugme i, kad ih ima, koraci
 *              za pokretanje sa XP nagradom. NAMERNO nije podrazumevan: na
 *              Leadovima je boja modula zelena, pa bi „Nema zaostalih koraka"
 *              opet izgledalo kao proslava.
 *
 *   `line`     jedna linija umesto reda pločica kad su sve nule i nema
 *              istorije — nikad zid nula.
 */
export type EmptyStateStep = {
  label: string;
  /** XP za korak. Prosleđuje se samo kad Napredak stvarno dodeljuje XP. */
  xp?: number;
  done?: boolean;
};

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  size = "md",
  variant = "plain",
  steps,
  className,
  heading,
}: {
  icon: ComponentType<{ className?: string }>;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** `sm` unutar kartice ili tabele, `md` sekcija, `lg` ceo ekran. */
  size?: "sm" | "md" | "lg";
  variant?: "plain" | "mission" | "line";
  /** Samo u `mission`: šta treba uraditi da ekran oživi. */
  steps?: EmptyStateStep[];
  className?: string;
  /** Naslov kao pravi naslov strane (`h1`/`h2`), kad ekran nema drugi. */
  heading?: "h1" | "h2";
}) {
  const Naslov = heading ?? "p";
  if (variant === "line") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-line px-4 py-3",
          className,
        )}
      >
        <Icon className="size-4 shrink-0 text-text-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-ui text-text-muted">
          {title && <span className="font-medium text-foreground">{title}</span>}
          {title && children ? " " : null}
          {children}
        </p>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    );
  }

  const pad = size === "sm" ? "py-8" : size === "lg" ? "py-24" : "py-16";
  const mission = variant === "mission";

  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-6 text-center",
        pad,
        className,
      )}
    >
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full border",
          mission
            ? "border-mod-line bg-mod-soft text-mod ring-4 ring-mod-soft"
            : "border-line-soft text-text-muted",
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      {title ? (
        <>
          <Naslov
            className={cn(
              "mt-4 font-medium text-foreground",
              mission ? "text-title font-bold" : "text-copy",
            )}
          >
            {title}
          </Naslov>
          {children && (
            <p className="mt-1 max-w-md text-ui leading-relaxed text-text-muted">
              {children}
            </p>
          )}
        </>
      ) : (
        children && (
          <p className="mt-4 text-ui text-muted-foreground">{children}</p>
        )
      )}
      {mission && steps && steps.length > 0 && (
        <ol className="mt-5 w-full max-w-sm divide-y divide-line-soft text-left">
          {steps.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3 py-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-meta leading-none",
                  step.done
                    ? "border-mod-line bg-mod-soft text-mod"
                    : "border-line text-text-muted",
                )}
              >
                {step.done ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 text-ui",
                  step.done ? "text-text-muted line-through" : "text-foreground",
                )}
              >
                {step.label}
                {step.done && <span className="sr-only"> — urađeno</span>}
              </span>
              {step.xp !== undefined && (
                <span className="shrink-0 font-mono text-meta font-medium text-xp tabular-nums">
                  +{step.xp} XP
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {action && (
        <div
          className={cn(
            "flex flex-wrap items-center justify-center gap-2",
            mission ? "mt-5" : "mt-4",
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
