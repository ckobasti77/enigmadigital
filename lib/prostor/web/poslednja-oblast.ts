// Preneto iz Devotion apps/web/lib/me/last-area.ts (main @ c05c40f), SPAJANJE S10.
/**
 * Lokalno pamćenje brzog unosa (P8): poslednje odredište i poslednja oblast
 * po startupu. Ključevi i pravila su u `@devotion/shared` (`quick-add.ts`);
 * ovde je samo pristup `localStorage`-u (privatni režim / pun disk = ništa).
 */
import {
  lastAreaKey,
  parseStoredDestination,
  QUICK_ADD_LAST_DESTINATION_KEY,
  serializeDestination,
  type QuickAddDestination,
  type StoredDestination,
} from "../quick-add";

function read(key: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Skladište nedostupno — pamćenje je pogodnost, ne uslov.
  }
}

export function readStoredDestination(): StoredDestination | null {
  return parseStoredDestination(read(QUICK_ADD_LAST_DESTINATION_KEY));
}

export function readLastArea(workspaceId: string): string | null {
  return read(lastAreaKey(workspaceId));
}

/** Zapamti izbor posle uspešnog unosa (odredište + oblast tog startupa). */
export function rememberDestination(destination: QuickAddDestination) {
  write(QUICK_ADD_LAST_DESTINATION_KEY, serializeDestination(destination));
  if (destination.kind === "startup" && destination.areaId !== null) {
    write(lastAreaKey(destination.workspaceId), destination.areaId);
  }
}

/** Zapamti oblast startupa posle novog zadatka iz „Nova stranica" (K17) — isti ključ kao brzi unos. */
export function rememberLastArea(workspaceId: string, areaId: string | null | undefined) {
  if (areaId) write(lastAreaKey(workspaceId), areaId);
}
