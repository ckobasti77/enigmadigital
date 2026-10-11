import { cn } from "@/lib/utils";
import type { NavIcon } from "./nav-items";

/**
 * Pločica sa ikonicom modula — isti znak u bočnoj traci, listu „Više" na
 * telefonu i komandnoj paleti (UI Boost §7).
 *
 * Boju ne prima: čita `--mod*` sa najbližeg `data-module`, pa je pozivalac
 * postavlja atributom na red, a ne klasom na pločicu. Mirna pločica je tinta
 * modula sa ikonicom u njegovoj boji; aktivna je puna, sa tamnom ikonicom —
 * razlika je u obliku, ne samo u nijansi.
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
        active ? "bg-mod-strong text-text-inverse" : "bg-mod-soft text-mod",
        className,
      )}
    >
      <Icon className={s.icon} />
    </span>
  );
}
