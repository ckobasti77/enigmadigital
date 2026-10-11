import { nicheSlot } from "@/lib/signal-colors";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * MONOGRAM FIRME (UI Boost §5.6)
 * ============================================================================
 *
 * Zaobljen kvadrat sa inicijalima, u boji niše. Daje redu tabele, kartici i
 * profilu prepoznatljiv oblik pre nego što se pročita naziv: firme iste niše
 * imaju istu boju, pa se grupa vidi bez čitanja.
 *
 * Boja je KATEGORIJA (`lib/signal-colors.ts`, heš niše na validiranu
 * paletu), nikad stanje ni temperatura — to nose ivica reda i čip.
 */
const SIZE = {
  sm: "size-5 rounded text-meta",
  md: "size-7 rounded-md text-meta",
  lg: "size-10 rounded-lg text-copy",
} as const;

/** Do dva slova: prva slova prve dve reči, ili prva dva slova jedine reči. */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? Array.from(words[0]).slice(0, 2).join("")
      : Array.from(words[0])[0] + Array.from(words[1])[0];
  return letters.toLocaleUpperCase("sr-Latn");
}

export function Monogram({
  name,
  seed,
  size = "md",
  className,
}: {
  /** Naziv firme — iz njega se izvode inicijali. */
  name: string;
  /** Niša; određuje boju. Bez nje boja se izvodi iz naziva. */
  seed?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-cat={nicheSlot(seed || name)}
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-cat-line bg-cat-soft font-bold leading-none text-cat-ink",
        SIZE[size],
        className,
      )}
    >
      {/* U 20 px staje jedno slovo na skali (12 px); dva bi se sudarila. */}
      {size === "sm" ? Array.from(initials(name))[0] : initials(name)}
    </span>
  );
}
