"use client";

// Preneto iz Devotion apps/web/components/connection-banner.tsx (main @ c05c40f), SPAJANJE S09.
import { useEffect, useState } from "react";
import { useConvexConnectionState } from "convex/react";
import { WifiOff } from "lucide-react";

/**
 * Pukla veza ka Convexu NE baca grešku — upiti samo večno „učitavaju“, pa je
 * jedini pošten signal ova traka (server greške idu kroz granice grešaka, ne
 * ovuda). Kratak prag guši treptaj pri prvom povezivanju i mikro-prekidima.
 * Ovo je veza pregledača sa serverom; stanje veza ka kanalima (Instagram,
 * YouTube…) je zaseban status.
 */
const SHOW_DELAY_MS = 3_000;

export function VezaTraka() {
  const connection = useConvexConnectionState();
  const disconnected = !connection.isWebSocketConnected;
  // `armed` se pali tek posle praga; render kapija je `disconnected && armed`,
  // pa povratak veze skida traku bez setState-a u telu efekta (lint pravilo).
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!disconnected) return;
    const id = window.setTimeout(() => setArmed(true), SHOW_DELAY_MS);
    return () => {
      window.clearTimeout(id);
      setArmed(false);
    };
  }, [disconnected]);

  if (!disconnected || !armed) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-2">
      <span
        role="status"
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-warning-line bg-surface-raised px-4 py-2 text-meta font-medium text-foreground shadow-elev-3"
      >
        <WifiOff className="size-4 shrink-0 text-warning" aria-hidden="true" />
        Veza sa serverom je prekinuta. Pokušavam ponovo…
      </span>
    </div>
  );
}

export const ConnectionBanner = VezaTraka;
