"use client";

import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  moduleNavItem,
  resolveModule,
  resolveScreen,
  type NavIcon,
} from "@/components/app/nav-items";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useEkranPutanja } from "../projekat-provider";
import { StanjeVezeRed } from "./stanje-veze";

/**
 * ============================================================================
 * ZAGLAVLJE STRANE — jedno za sve ekrane (A1 §3, v2 u B2)
 * ============================================================================
 *
 * Dva oblika, isti potpis:
 *
 * `plain` (podrazumevan — zatečeni izgled). Identitet ekrana nosi gornja
 * traka ljuske, pa se ovde ne ponavlja krupan H1: prvo što oko uhvati je
 * podatak. H1 postoji za čitače ekrana (`sr-only`), tačno jedan. Vidljivi red
 * — opis levo, radnje desno — crta se samo kad ima šta da se kaže ili uradi.
 *
 * `module` (UI Boost §5.1 — ekrani prelaze na njega kako se sele). Levo
 * pločica od 40 px sa ikonicom modula, naslov (20 px / 700) i JEDAN red
 * podnaslova; desno radnje, od kojih je jedna `primary`. Iza je aurora u boji
 * modula. Podnaslov se ne prelama: duže objašnjenje ide u `info`, koji se
 * otvara klikom (oblačić na hover ne postoji na telefonu).
 */
export function PageHeader({
  description,
  actions,
  className,
  variant = "plain",
  title,
  icon,
  info,
}: {
  /** Jedan red konteksta: šta ekran pokazuje. Opcion. */
  description?: ReactNode;
  /** Radnje uz ekran, poređane desno. Opcion. */
  actions?: ReactNode;
  className?: string;
  variant?: "plain" | "module";
  /** Naslov u `module` obliku; podrazumevano naziv ekrana iz navigacije. */
  title?: ReactNode;
  /** Ikonica u `module` obliku; podrazumevano ikonica modula. */
  icon?: NavIcon;
  /** Duže objašnjenje (kriterijumi, imenioci) — iza dugmeta „i". */
  info?: ReactNode;
}) {
  const pathname = useEkranPutanja();
  const screenTitle = resolveScreen(pathname)?.title;

  if (variant === "module") {
    const Icon = icon ?? moduleNavItem(resolveModule(pathname))?.icon;
    const heading = title ?? screenTitle;
    return (
      <div
        className={cn(
          "aurora flex flex-wrap items-center justify-between gap-x-6 gap-y-3",
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
          {Icon && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-mod-line bg-mod-soft text-mod">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            {heading && (
              <h1 className="truncate text-title font-bold text-foreground">
                {heading}
              </h1>
            )}
            {(description || info) && (
              <div className="flex items-center gap-1.5">
                {description && (
                  <p className="truncate text-ui text-text-muted">{description}</p>
                )}
                {info && (
                  <Popover>
                    <PopoverTrigger
                      aria-label="Više o ovom ekranu"
                      className="touch-target inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition-colors hover:text-mod"
                    >
                      <Info className="size-3.5" aria-hidden />
                    </PopoverTrigger>
                    <PopoverContent
                      align="start"
                      className="max-w-sm text-ui leading-relaxed text-muted-foreground"
                    >
                      {info}
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
        {/* Jedan red stanja veze (P3): samo kad veza ovog ekrana traži pažnju. */}
        <StanjeVezeRed className="basis-full" />
      </div>
    );
  }

  const hasVisibleRow = Boolean(description || actions);

  return (
    <>
      {screenTitle && <h1 className="sr-only">{screenTitle}</h1>}
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
      <StanjeVezeRed />
    </>
  );
}
