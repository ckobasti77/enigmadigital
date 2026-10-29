// Preneto iz Devotion apps/web/lib/workspace.ts (main @ c05c40f), SPAJANJE S08.
import { formatShortDateAt } from "../../format";

export const AREA_META = {
  dev: { label: "Razvoj", description: "Proizvod, kod i tehničke odluke", accent: "indigo" },
  marketing: { label: "Marketing", description: "Kampanje, sadržaj i pozicioniranje", accent: "violet" },
  sales: { label: "Prodaja", description: "Leadovi, ponude i razgovori", accent: "emerald" },
  other: { label: "Ostalo", description: "Sve što ne pripada drugim oblastima", accent: "amber" },
} as const;

export type AreaKey = keyof typeof AREA_META;

export const TASK_STATUS_META = {
  backlog: { label: "Neplanirano", shortLabel: "Neplanirano" },
  next: { label: "Sledeće", shortLabel: "Sledeće" },
  in_progress: { label: "U toku", shortLabel: "U toku" },
  blocked: { label: "Čeka", shortLabel: "Čeka" },
  done: { label: "Gotovo", shortLabel: "Gotovo" },
} as const;

export type TaskStatus = keyof typeof TASK_STATUS_META;

export const TASK_PRIORITY_META = {
  // Samo tokeni (PROSTOR P17): boja nosi hitnost, ne ukras.
  low: { label: "Nizak", dotClass: "bg-muted-foreground/40" },
  medium: { label: "Srednji", dotClass: "bg-muted-foreground" },
  high: { label: "Visok", dotClass: "bg-warning" },
  urgent: { label: "Hitno", dotClass: "bg-destructive" },
} as const;

export type TaskPriority = keyof typeof TASK_PRIORITY_META;

/** „1 zadatak”, „3 zadatka”, „7 zadataka” — srpska pluralizacija. */
export function tasksWord(count: number) {
  const absolute = Math.abs(count);
  const lastDigit = absolute % 10;
  const lastTwo = absolute % 100;
  if (lastDigit === 1 && lastTwo !== 11) return "zadatak";
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return "zadatka";
  }
  return "zadataka";
}

/**
 * Kratak datum roka („15. avg"). Izlaz ide kroz `lib/format.ts` (fiksni nazivi
 * meseca) i za svaki mesec je isti kao raniji `Intl.DateTimeFormat("sr-Latn-RS")`.
 */
export function formatShortDate(timestamp?: number | null) {
  if (!timestamp) return "Bez roka";
  return formatShortDateAt(timestamp);
}

export function toDateInputValue(timestamp?: number | null) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function fromDateInputValue(value: string) {
  if (!value) return undefined;
  return new Date(`${value}T12:00:00`).getTime();
}
