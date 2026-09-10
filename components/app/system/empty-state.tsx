import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * PRAZNO STANJE — nikad ne slavi prazninu (A1 §3, plan §0)
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
 * Bez `title` crta se jednoredna varijanta (ikonica + rečenica), koju
 * koriste ekrani kanala koji još nisu povezani.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  size = "md",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** `sm` unutar kartice ili tabele, `md` sekcija, `lg` ceo ekran. */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const pad = size === "sm" ? "py-8" : size === "lg" ? "py-24" : "py-16";
  return (
    <div
      className={cn(
        "flex flex-1 flex-col items-center justify-center px-6 text-center",
        pad,
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full border border-line-soft text-text-muted">
        <Icon className="size-5" aria-hidden />
      </div>
      {title ? (
        <>
          <p className="mt-4 text-copy font-medium text-foreground">{title}</p>
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
      {action && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      )}
    </div>
  );
}
