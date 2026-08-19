"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { ChartNoAxesColumn, RotateCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Četiri stanja koja svaki grafikon mora da ima, i sva četiri treba da izgledaju
 * namerno:
 *
 *   učitavanje  skelet u obliku grafikona — mreža, linija, trake. Sivi
 *               pravougaonik ne nagoveštava šta stiže, pa se dolazak podataka
 *               oseti kao skok umesto kao popunjavanje.
 *   prazno      objašnjava ZAŠTO je prazno. „Nema podataka" je konstatacija;
 *               čovek koji je gleda i dalje ne zna da li nešto treba da uradi.
 *   greška      šta se desilo i šta korisnik može da uradi povodom toga.
 *   podaci      sam grafikon.
 */

// ── skelet ───────────────────────────────────────────────────────────────────

/**
 * Silueta grafikona: recesivna mreža plus oblik marke koja tu stoji. Crta se
 * kroz `preserveAspectRatio="none"` da bi se rastegla na bilo koju širinu, pa
 * potezi nose `vectorEffect` kako se ne bi zadebljali sa njom.
 */
export function ChartShapeSkeleton({
  variant,
  className,
}: {
  variant: "area" | "bars";
  className?: string;
}) {
  return (
    <div className={cn("animate-pulse", className)}>
      <svg
        viewBox="0 0 300 100"
        preserveAspectRatio="none"
        className="size-full text-foreground"
        aria-hidden
      >
        {[25, 50, 75].map((y) => (
          <line
            key={y}
            x1={0}
            x2={300}
            y1={y}
            y2={y}
            stroke="var(--color-chart-grid)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {variant === "area" ? (
          <>
            <path
              d={`${SKELETON_LINE} L300,100 L0,100 Z`}
              fill="currentColor"
              fillOpacity={0.05}
            />
            <path
              d={SKELETON_LINE}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.14}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : (
          SKELETON_BARS.map((h, i) => (
            <rect
              key={i}
              x={i * 20 + 4}
              y={100 - h}
              width={12}
              height={h}
              rx={2}
              fill="currentColor"
              fillOpacity={0.09}
            />
          ))
        )}
      </svg>
    </div>
  );
}

const SKELETON_LINE =
  "M0,72 C24,68 40,44 64,46 C88,48 104,78 128,74 C152,70 168,30 192,34 C216,38 232,58 256,52 C280,46 292,30 300,26";

const SKELETON_BARS = [38, 52, 30, 61, 45, 70, 41, 56, 34, 64, 48, 72, 39, 58, 50];

// ── prazno ───────────────────────────────────────────────────────────────────

/**
 * `reason` odgovara na „zašto je prazno", a ne na „šta se prikazuje". Razlika
 * je između „nema podataka" i „sinhronizacija još nije stigla do ovog perioda".
 */
export function ChartEmpty({
  reason,
  className,
}: {
  reason: ReactNode;
  className?: string;
}) {
  return (
    <ChartNotice
      className={className}
      icon={<ChartNoAxesColumn className="size-4" />}
      title="Nema šta da se iscrta"
    >
      {reason}
    </ChartNotice>
  );
}

// ── greška ───────────────────────────────────────────────────────────────────

export function ChartError({
  onRetry,
  className,
}: {
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <ChartNotice
      className={className}
      tone="danger"
      icon={<TriangleAlert className="size-4" />}
      title="Grafikon nije mogao da se iscrta"
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RotateCw aria-hidden />
            Pokušaj ponovo
          </Button>
        ) : null
      }
    >
      Podaci za ovaj period su stigli u obliku koji grafikon ne ume da prikaže.
      Pokušaj ponovo; ako se ponovi, suzi period ili pokreni sinhronizaciju u
      Podešavanjima.
    </ChartNotice>
  );
}

function ChartNotice({
  icon,
  title,
  children,
  action,
  tone = "muted",
  className,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "muted" | "danger";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-full border",
          tone === "danger"
            ? "border-danger/40 text-danger"
            : "border-line-soft text-text-muted",
        )}
        aria-hidden
      >
        {icon}
      </div>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-text-muted">{children}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

// ── granica greške ───────────────────────────────────────────────────────────

type BoundaryProps = { children: ReactNode; className?: string };
type BoundaryState = { failed: boolean };

/**
 * Bez ove granice stanje greške bi bilo mrtav kod: greška u iscrtavanju sruši
 * ceo ekran, ne samo karticu u kojoj je nastala. Hvata isključivo iscrtavanje —
 * podaci i upiti nisu dirani.
 */
export class ChartErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Greška pri iscrtavanju grafikona", error, info);
  }

  private reset = () => this.setState({ failed: false });

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        className={cn(
          "overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10",
          this.props.className,
        )}
      >
        <ChartError onRetry={this.reset} />
      </div>
    );
  }
}
