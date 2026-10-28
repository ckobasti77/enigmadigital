"use client";

import { useSyncExternalStore } from "react";
import { oznakaPrecice } from "@/lib/recnik";

/**
 * Oznaka prečice za ovaj računar: „Ctrl K" na Windowsu i Linuxu, „⌘K" na
 * Macu. Na serveru i pri hidrataciji daje „Ctrl …" (Jovanov računar), pa
 * HTML sa servera i prvi crtež u pregledaču uvek budu isti; Mac dobije „⌘"
 * odmah posle hidratacije. Sama prečica se ne menja (`metaKey || ctrlKey`).
 */
const ne = () => () => {};

function platforma(): string {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || nav.platform || nav.userAgent;
}

export function usePrecica(taster: string): string {
  return useSyncExternalStore(
    ne,
    () => oznakaPrecice(platforma(), taster),
    () => oznakaPrecice(undefined, taster),
  );
}
