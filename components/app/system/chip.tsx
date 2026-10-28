import type { ComponentType, ReactNode } from "react";
import type { CategorySlot } from "@/lib/signal-colors";
import {
  TEMPERATURE_CHIP_CLASS,
  TEMPERATURE_LABEL,
  normalizeTemperatura,
  type Temperatura,
} from "@/lib/temperature";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * ČIP — jedan oblik za signal, stanje, filter i temperaturu (A1 §3, B2)
 * ============================================================================
 *
 * Izmereno pre A1: 60+ različitih recepata klasa za isti mali okvir sa
 * tekstom. Ovde je jedan: `rounded-md`, ivica od jednog piksela, blaga
 * podloga, `text-meta` (12 px) ili `text-ui` (13 px), `font-medium`. Ton nosi
 * značenje, ne ukras (DESIGN.md „Chips"):
 *
 *   neutralno   `neutral` / `muted`
 *   stanje      `success` / `warning` / `danger` / `info`
 *   kategorija  `category` (slot 1, 2, 3, 5, 6) — vidi `lib/signal-colors.ts`
 *   nagrada     `xp` — zlatna, samo uz stvarno zarađen XP
 *
 * Boje modula nema (ULTRA P1): modul kaže „gde si", ne „šta je ovo".
 *
 * Sa `onClick` čip postaje dugme (`aria-pressed` = `active`), inače `span`;
 * uključen filter je u boji radnje, a na dodir je dugme visoko ≥ 44 px.
 * Broj uz natpis (`count`) je prigušen, da se čita kao imenilac a ne kao deo
 * natpisa.
 */
export type ChipTone =
  | "neutral"
  | "muted"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "xp";

const TONE: Record<ChipTone, string> = {
  neutral: "border-line bg-surface-raised text-foreground",
  muted: "border-line-soft bg-surface-raised/60 text-text-muted",
  success: "border-success-line bg-success-soft text-success",
  warning: "border-warning-line bg-warning-soft text-warning",
  danger: "border-danger-line bg-danger-soft text-danger",
  info: "border-info-line bg-info-soft text-info",
  xp: "border-xp-line bg-xp-soft text-xp",
};

const CATEGORY_TONE = "border-cat-line bg-cat-soft text-cat-ink";

const SIZE = {
  sm: "h-6 gap-1 px-2 text-meta",
  md: "h-7 gap-1.5 px-2.5 text-ui",
} as const;

export type ChipSize = keyof typeof SIZE;

export function Chip({
  tone = "neutral",
  category,
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
  /** Boja kategorije (signal, niša). Kad je zadata, nadjačava `tone`. */
  category?: CategorySlot | null;
  size?: ChipSize;
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
    category ? CATEGORY_TONE : TONE[tone],
    active && "border-radnja bg-radnja-soft ring-1 ring-radnja-line",
    onClick && "cursor-pointer hover:border-line-strong pointer-coarse:min-h-11",
    className,
  );
  const body = (
    <>
      {Icon && <Icon className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")} />}
      <span className="truncate">{children}</span>
      {count !== undefined && (
        <span className="tabular-nums text-text-muted">{count}</span>
      )}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        title={title}
        data-cat={category ?? undefined}
        className={classes}
      >
        {body}
      </button>
    );
  }
  return (
    <span title={title} data-cat={category ?? undefined} className={classes}>
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
  size?: ChipSize;
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
