import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * BEDŽ SA BROJEM — koliko posla čeka (A1 §3, plan §2 N)
 * ============================================================================
 *
 * Pravilo iz plana: „bez bedža = nema posla — nikad 0". Zato za `count` ≤ 0
 * komponenta ne crta ništa; pozivalac ne mora da proverava.
 *
 * Boja nosi hitnost: `neutral` je broj, `warning` je posao koji čeka,
 * `danger` je posao koji kasni, `accent` je „novo". Tekst je u boji na blagoj
 * podlozi (AA), nikad beo na punoj crvenoj — to pada ispod 3:1.
 */
export type CountBadgeTone = "neutral" | "accent" | "warning" | "danger";

const TONE: Record<CountBadgeTone, string> = {
  neutral: "bg-surface-raised text-foreground ring-1 ring-line",
  accent: "bg-accent-400/15 text-accent-400",
  warning: "bg-warning/15 text-warning",
  danger: "bg-danger/15 text-danger",
};

export function CountBadge({
  count,
  tone = "neutral",
  max = 99,
  label,
  className,
}: {
  count: number | undefined | null;
  tone?: CountBadgeTone;
  /** Iznad ovoga piše „99+". */
  max?: number;
  /** Šta broj znači, za čitač ekrana i `title` („3 sastanka danas"). */
  label?: string;
  className?: string;
}) {
  if (!count || count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 font-mono text-meta font-semibold leading-none tabular-nums",
        TONE[tone],
        className,
      )}
    >
      {text}
    </span>
  );
}
