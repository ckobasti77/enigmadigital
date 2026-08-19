"use client";

import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Četiri vrste povratne informacije, i nijedna peta.
 *
 *   stanje      — nešto upravo teče (sinhronizacija, slanje videa)
 *   zavrsetak   — potvrda da je uspelo
 *   upozorenje  — pre nego što nastane problem (kvota pri kraju)
 *   greska      — šta je pošlo naopako i šta sad
 *
 * Boja nikad ne nosi značenje sama: svaka vrsta ima svoju ikonicu, a tekst
 * kaže isto što i boja. Tako poruka radi i u sivim tonovima, i za oko koje
 * crvenu i zelenu vidi kao istu boju.
 */
export type FeedbackTone = "progress" | "success" | "warning" | "danger";

const TONE: Record<
  FeedbackTone,
  { icon: typeof CheckCircle2; ring: string; ink: string; spin?: boolean }
> = {
  progress: {
    icon: LoaderCircle,
    ring: "border-accent-400/30 bg-accent-400/10",
    ink: "text-accent-400",
    spin: true,
  },
  success: {
    icon: CheckCircle2,
    ring: "border-success/30 bg-success/10",
    ink: "text-success",
  },
  warning: {
    icon: AlertTriangle,
    ring: "border-warning/30 bg-warning/10",
    ink: "text-warning",
  },
  danger: {
    icon: AlertCircle,
    ring: "border-danger/30 bg-danger/10",
    ink: "text-danger",
  },
};

/**
 * Poruka u toku rada: ista kutija za sve četiri vrste, pa operater uči jedno
 * mesto na koje gleda umesto četiri različita oblika.
 *
 * Greška i upozorenje idu kao `alert` (čitač ekrana ih prekida i pročita),
 * stanje i završetak kao `status` (sačekaju pauzu) — jer nešto što je uspelo
 * ne prekida čoveka usred rečenice.
 */
export function FeedbackNote({
  tone,
  title,
  children,
  action,
  className,
}: {
  tone: FeedbackTone;
  /** Jedna rečenica: šta se desilo. */
  title: ReactNode;
  /** Šta sad — samo kada postoji sledeći potez. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { icon: Icon, ring, ink, spin } = TONE[tone];
  const assertive = tone === "danger" || tone === "warning";

  return (
    <div
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm",
        ring,
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          ink,
          spin && "motion-safe:animate-spin",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium", ink)}>{title}</p>
        {children && (
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Ista četiri tona, ali u jednom redu — za podnožje kartice ili traku pored
 * dugmeta, gde cela kutija ne staje. Ikonica ostaje, jer pravilo o boji važi
 * i kada nema mesta.
 */
export function FeedbackLine({
  tone,
  children,
  className,
}: {
  tone: FeedbackTone;
  children: ReactNode;
  className?: string;
}) {
  const { icon: Icon, ink, spin } = TONE[tone];
  const assertive = tone === "danger" || tone === "warning";

  return (
    <span
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
      className={cn("inline-flex items-center gap-1.5 text-xs", ink, className)}
    >
      <Icon
        className={cn("size-3.5 shrink-0", spin && "motion-safe:animate-spin")}
        aria-hidden
      />
      <span className="font-medium">{children}</span>
    </span>
  );
}
