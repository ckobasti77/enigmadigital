"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { resolveScreen } from "@/components/app/nav-items";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * ZAGLAVLJE STRANE — jedno za sve ekrane (A1 §3)
 * ============================================================================
 *
 * Identitet ekrana (sekcija / naziv) nosi gornja traka ljuske, pa se ovde ne
 * ponavlja krupan H1: prvo što oko uhvati je podatak, ne naslov koji već
 * piše iznad. H1 ipak postoji za čitače ekrana (`sr-only`), tačno jedan.
 *
 * Vidljivi red — opis levo, radnje desno — crta se samo kad ima šta da se
 * kaže ili uradi; inače ne troši razmak. Opis je JEDNA rečenica u `text-ui`;
 * ekran koji nema šta da kaže u jednoj rečenici ne kaže ništa (plan O5:
 * vrh stranice se skraćuje, ne opisuje).
 */
export function PageHeader({
  description,
  actions,
  className,
}: {
  /** Jedan red konteksta: šta ekran pokazuje. Opcion. */
  description?: ReactNode;
  /** Radnje uz ekran, poređane desno. Opcion. */
  actions?: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const title = resolveScreen(pathname)?.title;
  const hasVisibleRow = Boolean(description || actions);

  return (
    <>
      {title && <h1 className="sr-only">{title}</h1>}
      {hasVisibleRow && (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-x-6 gap-y-3",
            className,
          )}
        >
          {description ? (
            <p className="max-w-2xl text-ui leading-relaxed text-text-muted">
              {description}
            </p>
          ) : (
            <span aria-hidden />
          )}
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}
    </>
  );
}
