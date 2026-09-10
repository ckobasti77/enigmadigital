import type { ComponentType, ReactNode } from "react";
import {
  TEMPERATURE_CHIP_CLASS,
  TEMPERATURE_LABEL,
  normalizeTemperatura,
  type Temperatura,
} from "@/lib/temperature";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * ČIP — jedan oblik za signal, stanje, filter i temperaturu (A1 §3)
 * ============================================================================
 *
 * Izmereno pre A1: 60+ različitih recepata klasa za isti mali okvir sa
 * tekstom. Ovde je jedan: `rounded-md`, ivica od jednog piksela, blaga
 * podloga, `text-meta` (12 px) ili `text-ui` (13 px), `font-medium`. Ton nosi
 * značenje, ne ukras — neutralan je podrazumevan, cijan samo za ono što je
 * interaktivno ili ključno.
 *
 * Sa `onClick` čip postaje dugme (`aria-pressed` = `active`), inače `span`.
 * Broj uz natpis (`count`) je tabularan i prigušen, da se čita kao imenilac
 * a ne kao deo natpisa.
 */
export type ChipTone =
  | "neutral"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "danger";

const TONE: Record<ChipTone, string> = {
  neutral: "border-line bg-surface-raised text-foreground",
  muted: "border-line-soft bg-surface-raised/60 text-text-muted",
  accent: "border-accent-400/40 bg-accent-400/10 text-accent-400",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
};

const SIZE = {
  sm: "h-6 gap-1 px-2 text-meta",
  md: "h-7 gap-1.5 px-2.5 text-ui",
} as const;

export function Chip({
  tone = "neutral",
  size = "md",
  icon: Icon,
  count,
  active = false,
  onClick,
  title,
  className,
  children,
}: {
  tone?: ChipTone;
  size?: keyof typeof SIZE;
  icon?: ComponentType<{ className?: string }>;
  /** Broj uz natpis — imenilac, tabularan, prigušen. */
  count?: number;
  /** Uključen filter / izabrano stanje. */
  active?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border font-medium leading-none transition-colors",
    SIZE[size],
    TONE[tone],
    active && "border-accent-400/60 ring-1 ring-accent-400/40",
    onClick && "cursor-pointer hover:border-line-strong",
    className,
  );
  const body = (
    <>
      {Icon && <Icon className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")} />}
      <span className="truncate">{children}</span>
      {count !== undefined && (
        <span className="font-mono tabular-nums text-text-muted">{count}</span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick} title={title} className={classes}>
        {body}
      </button>
    );
  }
  return (
    <span title={title} className={classes}>
      {body}
    </span>
  );
}

/**
 * Temperatura kao čip — ista boja kao pin na mapi i kao ivica reda, iz istog
 * izvora (`lib/temperature.ts`). Nova firma je neutralan slate, ne „bez boje".
 */
export function TemperatureChip({
  temperatura,
  size = "md",
  className,
}: {
  temperatura: Temperatura | string | null | undefined;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const t = normalizeTemperatura(temperatura);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap rounded-md border font-medium leading-none",
        SIZE[size],
        TEMPERATURE_CHIP_CLASS[t],
        className,
      )}
    >
      {TEMPERATURE_LABEL[t]}
    </span>
  );
}
