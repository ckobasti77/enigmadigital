"use client";

import { CountBadge } from "@/components/app/system/count-badge";
import { QuietBoundary } from "./quiet-boundary";
import { useStaMeCeka } from "./use-sta-me-ceka";

/**
 * ============================================================================
 * BEDŽ U NAVIGACIJI (A2 §3, plan §2 N)
 * ============================================================================
 *
 * „Broj na Leadovima, Podešavanjima i kanalima koji imaju posao. Bez bedža
 * znači nema posla — nikad 0." Pravilo o nuli sprovodi `CountBadge` (za 0 ne
 * crta ništa), a pravilo o tome ŠTA se broji sedi u
 * `convex/lib/notifications.ts`: broj VRSTA posla, ne zbir stavki. Zbir bi na
 * Leadovima dao „311" — broj koji uvek izgleda isto i ne pomaže nikome.
 *
 * Sopstvena granica po bedžu: navigacija mora da radi i kada upit padne
 * (nalog bez članstva, istekla sesija). Svi bedževi čitaju isti upit sa istim
 * argumentima, pa ih Convex klijent svodi na jednu pretplatu.
 */
export function NavBadge({ href, label }: { href: string; label: string }) {
  return (
    <QuietBoundary>
      <Bedz href={href} label={label} />
    </QuietBoundary>
  );
}

function Bedz({ href, label }: { href: string; label: string }) {
  const data = useStaMeCeka();
  const broj = data?.bedzevi[href];
  if (!broj) return null;

  const hitno = data?.zadaci.some(
    (z) => z.bedz === href && z.hitnost === "visoka",
  );

  return (
    <CountBadge
      count={broj}
      tone={hitno ? "danger" : "warning"}
      label={`${label}: ${broj} ${broj === 1 ? "stvar čeka" : "stvari čeka"}`}
    />
  );
}
