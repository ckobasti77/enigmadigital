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

/**
 * Podloga izabranog reda bočne trake. Deli je meni projekta (`app-sidebar`) i
 * meni „Ja“ (`meni-ja`), da boja mesta stoji u jednom fajlu (SPAJANJE S27).
 */
export const RED_TRAKE_IZABRAN = "bg-mod-soft text-foreground";

/** Crta uz levu ivicu trake: u kom si modulu. Ne meri se, pa preživi reflow. */
export function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute -left-2.5 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-mod"
    />
  );
}
