// Preneto iz Devotion packages/shared/src/trash.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Korpa (PROSTOR P3) — tekstovi za segmente, red stavke i poruku posle
 * vraćanja, isti na webu i telefonu. ČISTO: bez React-a i bez Convex tipova.
 * Rok „30 dana" se ne pominje — trajnog brisanja i čišćenja Korpe nema.
 */
import { dayDiff, daysWord, formatClock, formatDayRelative } from "./dates";

export type TrashKind = "page" | "idea" | "file" | "recovered";

export const TRASH_SEGMENTS: ReadonlyArray<{ kind: TrashKind; label: string }> = [
  { kind: "page", label: "Stranice" },
  { kind: "idea", label: "Ideje" },
  { kind: "file", label: "Prilozi" },
  { kind: "recovered", label: "Oporavljeno" },
];

const MINUTE_MS = 60_000;
/** Do ovoliko dana piše se „pre N dana", posle toga datum. */
const RELATIVE_DAYS_MAX = 30;

/** „upravo", „pre 5 min", „danas u 14:05", „juče", „pre 3 dana", „12. okt". */
export function formatTrashAge(ms: number, nowMs: number, zone?: string): string {
  const diff = nowMs - ms;
  if (diff < MINUTE_MS) return "upravo";
  if (diff < 60 * MINUTE_MS) return `pre ${Math.floor(diff / MINUTE_MS)} min`;
  const days = -dayDiff(ms, nowMs, zone);
  if (days <= 0) return `danas u ${formatClock(ms, zone)}`;
  if (days === 1) return "juče";
  if (days <= RELATIVE_DAYS_MAX) return `pre ${days} ${daysWord(days)}`;
  return formatDayRelative(ms, nowMs, zone);
}

/** Red stavke: „Obrisao/la Ana · pre 3 dana" (bez imena: „Obrisano · …"). */
export function trashMetaLabel(
  item: { archivedAt: number; archivedByName: string | null },
  nowMs: number,
  zone?: string,
): string {
  const who =
    item.archivedByName === null ? "Obrisano" : `Obrisao/la ${item.archivedByName}`;
  return `${who} · ${formatTrashAge(item.archivedAt, nowMs, zone)}`;
}

/** „1 podstranica" · „3 podstranice" · „7 podstranica". */
export function subpagesLabel(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? "podstranice"
      : "podstranica";
  return `${count} ${noun}`;
}

export const RESTORED_TO_AREA_ROOT =
  "Roditelj je i dalje u Korpi — vraćeno na vrh oblasti.";

/** Poruka posle „Vrati" (toast na webu, potvrda na telefonu). */
export function restoredMessage(result: {
  kind: "page" | "idea" | "file";
  title?: string | null;
  restoredCount: number;
  movedToAreaRoot: boolean;
}): string {
  const quoted = result.title ? ` „${result.title}”` : "";
  let message: string;
  if (result.kind === "page") {
    const subpages = Math.max(0, result.restoredCount - 1);
    const rest = subpages > 0 ? ` i ${subpagesLabel(subpages)}` : "";
    message = quoted ? `Vraćeno:${quoted}${rest}.` : `Vraćeno${rest}.`;
  } else if (result.kind === "idea") {
    message = `Vraćena ideja${quoted}.`;
  } else {
    message = `Vraćen prilog${quoted}.`;
  }
  return result.movedToAreaRoot ? `${message} ${RESTORED_TO_AREA_ROOT}` : message;
}
