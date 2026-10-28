import { cn } from "@/lib/utils";
import type { NavIcon } from "./nav-items";

/**
 * Pločica sa ikonicom modula — isti znak u bočnoj traci, listu „Više" na
 * telefonu i komandnoj paleti (UI Boost §7).
 *
 * Boju ne prima: čita `--mod*` sa najbližeg `data-module`, pa je pozivalac
 * postavlja atributom na red, a ne klasom na pločicu. Boja modula stoji samo
 * na AKTIVNOJ pločici (puna, sa tamnom ikonicom); mirna pločica je neutralna
 * (ULTRA P1: boja mesta samo na aktivnoj stavci, ikonici zaglavlja i auri).
 */
const SIZE = {
  sm: { box: "size-[26px] rounded-md", icon: "size-4" },
  lg: { box: "size-11 rounded-xl", icon: "size-5" },
} as const;

export function ModuleTile({
  icon: Icon,
  active = false,
  size = "sm",
  className,
}: {
  icon: NavIcon;
  active?: boolean;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center transition-colors",
        s.box,
        active ? "bg-mod-strong text-text-inverse" : "bg-surface-raised text-text-secondary",
        className,
      )}
    >
      <Icon className={s.icon} />
    </span>
  );
}
