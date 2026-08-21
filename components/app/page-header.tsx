"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { resolveScreen } from "./nav-items";
import { cn } from "@/lib/utils";

/**
 * Vitko zaglavlje strane — jedno za svih 19 ekrana, umesto pet ručno pisanih
 * varijanti.
 *
 * Identitet ekrana (sekcija / naziv) već nosi gornja traka, pa se ovde ne
 * ponavlja krupan H1: više vertikalnog prostora ide podacima, a prvo što oko
 * uhvati je ono zbog čega se ekran otvara, ne naslov koji već piše iznad.
 *
 * H1 ipak postoji — skriven za čitače ekrana (`sr-only`, dakle van toka i bez
 * uticaja na `gap` roditelja), da dokument ima tačno jedan naslov prvog reda.
 * Kada nema ni opisa ni akcija, vidljivi red se ne crta i ne troši razmak.
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
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
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
