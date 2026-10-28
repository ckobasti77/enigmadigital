"use client";

import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Check } from "lucide-react";
import { DUR_PROGRESS, EASE_UI, MOTION_QUERIES } from "@/lib/motion";
import { cn } from "@/lib/utils";

gsap.registerPlugin(useGSAP);

/**
 * ============================================================================
 * PRIMITIVI NAPRETKA — prsten, traka, segmentni merač (UI Boost §5.8)
 * ============================================================================
 *
 * Napredak je jedno od četiri mesta gde sistem dozvoljava gradijent: od
 * `--mod` ka `--mod-strong` (ili XP zlatna). Sve tri komponente čitaju iste
 * dve promenljive, `--from` i `--to`, koje postavlja ton.
 *
 * TAČNOST PRE POKRETA. Prvi kadar je uvek tačan — vrednost je u markupu, ne
 * stiže animacijom — i pri otvaranju ekrana se ništa od ovoga ne pomera.
 * Merač se pomeri samo kad se vrednost PROMENI dok je na ekranu (napredak je
 * upravo napravljen), za 400 ms, bez prebačaja. Pod reduced-motion i u
 * skrivenom tabu nova vrednost se upiše odmah.
 *
 * Boja nikad nije jedini nosilac: uz prsten i traku uvek stoji broj.
 */
export type ProgressTone =
  | "neutral"
  | "xp"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE: Record<ProgressTone, string> = {
  // Napredak bez boje mesta (ULTRA P1): tih, neutralan prelaz; zlatna je
  // samo nagrada, stanja su samo stanja.
  neutral: "[--from:var(--text-secondary)] [--to:var(--text-primary)]",
  xp: "[--from:var(--xp)] [--to:var(--xp-strong)]",
  success: "[--from:var(--success)] [--to:var(--success)]",
  warning: "[--from:var(--warning)] [--to:var(--warning)]",
  danger: "[--from:var(--danger)] [--to:var(--danger)]",
  info: "[--from:var(--info)] [--to:var(--info)]",
};

/** Udeo 0–1; nepoznato i negativno je 0, preko cilja je 1. */
function fraction(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, value / max));
}

/**
 * Jedan obrazac pokreta za sva tri merača. Prvi prolaz samo upiše stanje;
 * svaki sledeći pređe od ZATEČENE vrednosti (`overwrite: "auto"`), pa je
 * prelaz prekidiv kad stigne još svežiji podatak.
 */
function useProgressMotion(
  ref: RefObject<Element | null>,
  vars: gsap.TweenVars,
  key: number,
) {
  const mounted = useRef(false);
  const media = useRef<gsap.MatchMedia | null>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const first = !mounted.current;
      mounted.current = true;

      // `useGSAP` sa zavisnostima ne vraća kontekst između promena, pa bi se
      // slušaoci upita gomilali sa svakom novom vrednošću.
      media.current?.kill();
      const mm = gsap.matchMedia();
      media.current = mm;
      mm.add(MOTION_QUERIES, (ctx) => {
        const still = Boolean(ctx.conditions?.still);
        const hidden = document.visibilityState !== "visible";
        if (first || still || hidden) {
          gsap.set(el, vars);
          return;
        }
        gsap.to(el, {
          ...vars,
          duration: DUR_PROGRESS,
          ease: EASE_UI,
          overwrite: "auto",
        });
      });
    },
    { dependencies: [key], scope: ref },
  );
}

/**
 * Prsten napretka. `children` je sredina — broj ili procenat; bez njega
 * prsten ne kaže ništa što čovek koji ne vidi boju može da pročita.
 *
 * Svesni izuzetak od „samo transform i opacity": luk se pomera kroz
 * `stroke-dashoffset`. To je iscrtavanje jednog malog SVG-a, bez rasporeda, i
 * transformacijom se zaobljen luk sa gradijentom ne može dobiti. Isti razred
 * izuzetka kao visina u `Unfold`.
 */
export function ProgressRing({
  value,
  max = 100,
  size = 56,
  stroke = 6,
  tone = "neutral",
  label,
  children,
  className,
}: {
  value: number;
  max?: number;
  /** Prečnik u pikselima. */
  size?: number;
  stroke?: number;
  tone?: ProgressTone;
  /** Šta prsten meri — za čitač ekrana („Pozivi ove nedelje"). */
  label: string;
  children?: ReactNode;
  className?: string;
}) {
  const gradientId = useId();
  const arcRef = useRef<SVGCircleElement>(null);
  const f = fraction(value, max);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - f);
  // Markup nosi početnu vrednost; posle montiranja luk pomera GSAP. Da ga
  // React drži, svaka nova vrednost bi preskočila prelaz.
  const [initial] = useState({ offset, visible: f > 0 });

  useProgressMotion(
    arcRef,
    { strokeDashoffset: offset, opacity: f > 0 ? 1 : 0 },
    f,
  );

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        TONE[tone],
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--from)" }} />
            <stop offset="100%" style={{ stopColor: "var(--to)" }} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-raised"
        />
        <circle
          ref={arcRef}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{
            strokeDashoffset: initial.offset,
            opacity: initial.visible ? 1 : 0,
          }}
        />
      </svg>
      {children !== undefined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none tabular-nums">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Traka napretka. Sa `goal` postaje bullet traka: oznaka cilja stoji na svom
 * mestu i kad je traka kraća od nje ili je prešla.
 *
 * Punjenje je `translateX` nad trakom pune širine u okviru koji odseca —
 * čist transform, a zaobljen kraj ostaje zaobljen (sa `scaleX` bi se
 * spljoštio).
 */
export function ProgressBar({
  value,
  max = 100,
  goal,
  tone = "neutral",
  size = "md",
  label,
  showValue = false,
  format = String,
  className,
}: {
  value: number;
  max?: number;
  /** Cilj na istoj skali kao `value` — crta se kao oznaka. */
  goal?: number;
  tone?: ProgressTone;
  size?: "sm" | "md";
  /** Šta traka meri. Vidljivo uz `showValue`, inače samo za čitač ekrana. */
  label: string;
  /** Red iznad trake: natpis levo, „vrednost / cilj" desno. */
  showValue?: boolean;
  format?: (v: number) => string;
  className?: string;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const f = fraction(value, max);
  const shift = -(1 - f) * 100;
  const [initialShift] = useState(shift);

  useProgressMotion(fillRef, { x: 0, xPercent: shift }, f);

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", TONE[tone], className)}>
      {showValue && (
        <div className="flex items-baseline justify-between gap-3 text-meta">
          <span className="truncate text-text-muted">{label}</span>
          <span className="shrink-0 tabular-nums text-foreground">
            {format(value)}
            <span className="text-text-muted"> / {format(goal ?? max)}</span>
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(max, Math.max(0, value))}
        className="relative"
      >
        <div
          className={cn(
            "overflow-hidden rounded-full bg-surface-raised",
            size === "sm" ? "h-1.5" : "h-2",
          )}
        >
          <div
            ref={fillRef}
            className="h-full w-full rounded-full bg-[linear-gradient(90deg,var(--from),var(--to))]"
            style={{ transform: `translateX(${initialShift}%)` }}
          />
        </div>
        {goal !== undefined && goal > 0 && goal < max && (
          <span
            aria-hidden
            className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full bg-foreground"
            style={{ left: `${fraction(goal, max) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Segmentni merač: nekoliko uslova, svaki ispunjen ili ne („Spremnost
 * kanala": povezan · sinhronizuje · objava u 7 dana · nema neodgovorenih).
 * Za razliku od trake, ovde svaki segment ima ime — pa se odmah vidi ŠTA
 * fali, ne samo koliko.
 */
export function SegmentedMeter({
  segments,
  tone = "neutral",
  label,
  className,
}: {
  segments: Array<{ label: string; done: boolean; hint?: string }>;
  tone?: ProgressTone;
  /** Šta merač meri („Spremnost kanala"). */
  label: string;
  className?: string;
}) {
  const done = segments.filter((s) => s.done).length;
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", TONE[tone], className)}>
      <div className="flex items-baseline justify-between gap-3 text-meta">
        <span className="heading-caps truncate font-medium text-text-muted">
          {label}
        </span>
        <span className="shrink-0 tabular-nums text-foreground">
          {done}
          <span className="text-text-muted"> / {segments.length}</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={segments.length}
        aria-valuenow={done}
        className="flex gap-1"
      >
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              segment.done
                ? "bg-[linear-gradient(90deg,var(--from),var(--to))]"
                : "bg-surface-raised",
            )}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-meta">
        {segments.map((segment) => (
          <li
            key={segment.label}
            title={segment.hint}
            className={cn(
              "inline-flex items-center gap-1",
              segment.done ? "text-foreground" : "text-text-muted",
            )}
          >
            {segment.done ? (
              <Check className="size-3 text-(--from)" aria-hidden />
            ) : (
              <span
                aria-hidden
                className="size-1.5 rounded-full border border-line-control"
              />
            )}
            {segment.label}
            <span className="sr-only">
              {segment.done ? " — ispunjeno" : " — nije ispunjeno"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
