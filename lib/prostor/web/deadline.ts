// Preneto iz Devotion apps/web/lib/deadline.ts (main @ c05c40f), SPAJANJE S12.
import { formatShortDate, type TaskPriority, type TaskStatus } from "./projekat";

export const DAY_MS = 86_400_000;

/** Poslednji dan koji još pripada zoni „Ova nedelja”. */
export const WEEK_ZONE_DAYS = 7;

export type DeadlineUrgency =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "none"
  | "done";

export type TriageZone = "gori" | "danas" | "nedelja" | "kasnije";

export type DeadlineClassification = {
  urgency: DeadlineUrgency;
  /** Razlika u kalendarskim danima: negativno = rok je prošao. `null` kad roka nema. */
  dayDiff: number | null;
};

export type DeadlineInput = {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  now: number;
};

export type TriageInput = {
  dueDate: number | null;
  taskStatus: TaskStatus | null;
  taskPriority: TaskPriority | null;
};

export type SortableTask = TriageInput & { taskSortAt?: number };

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export const TRIAGE_ZONE_ORDER: Array<TriageZone> = [
  "gori",
  "danas",
  "nedelja",
  "kasnije",
];

/**
 * Ponoć po lokalnoj zoni korisnika. Rokovi se čuvaju u lokalno podne
 * (`fromDateInputValue`), pa poređenje po danu — a ne po trenutku — sprečava da
 * zadatak sa današnjim rokom postane „kasni” već u 12:01.
 */
export function startOfLocalDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Razlika u kalendarskim danima; zaokruživanje čuva tačnost i u DST nedeljama. */
export function dueDayDiff(dueDate: number, now: number) {
  return Math.round(
    (startOfLocalDay(dueDate) - startOfLocalDay(now)) / DAY_MS,
  );
}

/** „1 dan”, „2 dana”, „21 dan” — srpska pluralizacija za čitače ekrana. */
export function daysWord(count: number) {
  const absolute = Math.abs(count);
  return absolute % 10 === 1 && absolute % 100 !== 11 ? "dan" : "dana";
}

export function classifyDeadline({
  dueDate,
  taskStatus,
  now,
}: DeadlineInput): DeadlineClassification {
  if (taskStatus === "done") {
    return {
      urgency: "done",
      dayDiff: dueDate === null ? null : dueDayDiff(dueDate, now),
    };
  }
  if (dueDate === null) return { urgency: "none", dayDiff: null };

  const dayDiff = dueDayDiff(dueDate, now);
  if (dayDiff < 0) return { urgency: "overdue", dayDiff };
  if (dayDiff === 0) return { urgency: "today", dayDiff };
  if (dayDiff === 1) return { urgency: "tomorrow", dayDiff };
  if (dayDiff <= WEEK_ZONE_DAYS) return { urgency: "week", dayDiff };
  return { urgency: "later", dayDiff };
}

/**
 * Kratka oznaka za skeniranje kolone — namerno kratka
 * („kasni 3 d”, „danas”, „D-3”), ne proza.
 */
export function deadlineLabel(
  classification: DeadlineClassification,
  dueDate: number | null,
) {
  switch (classification.urgency) {
    case "overdue":
      return `kasni ${Math.abs(classification.dayDiff ?? 0)} d`;
    case "today":
      return "danas";
    case "tomorrow":
      return "sutra";
    case "week":
      return `D-${classification.dayDiff}`;
    case "none":
      return "Bez roka";
    default:
      return formatShortDate(dueDate);
  }
}

/** Puna rečenica za čitače ekrana — nikad skraćenice. */
export function deadlineAriaLabel(
  classification: DeadlineClassification,
  dueDate: number | null,
) {
  const dayDiff = classification.dayDiff ?? 0;
  switch (classification.urgency) {
    case "overdue": {
      const late = Math.abs(dayDiff);
      return `Rok je prošao: kasni ${late} ${daysWord(late)}`;
    }
    case "today":
      return "Rok je danas";
    case "tomorrow":
      return "Rok je sutra";
    case "week":
      return `Rok je za ${dayDiff} ${daysWord(dayDiff)}`;
    case "later":
      return `Rok: ${formatShortDate(dueDate)}`;
    case "none":
      return "Bez roka";
    default:
      return dueDate === null
        ? "Završeno"
        : `Završeno, rok je bio ${formatShortDate(dueDate)}`;
  }
}

/**
 * Zadatak pripada tačno jednoj zoni. Precedenca je namerna: prekoračen rok,
 * hitan prioritet i blokada su ista vrsta problema — svi traže pažnju danas.
 */
export function classifyTriageZone(
  task: TriageInput,
  now: number,
): TriageZone | null {
  if (task.taskStatus === "done") return null;

  const { urgency } = classifyDeadline({
    dueDate: task.dueDate,
    taskStatus: task.taskStatus,
    now,
  });

  if (
    urgency === "overdue" ||
    task.taskPriority === "urgent" ||
    task.taskStatus === "blocked"
  ) {
    return "gori";
  }
  if (urgency === "today") return "danas";
  if (urgency === "tomorrow" || urgency === "week") return "nedelja";
  return "kasnije";
}

/** Unutar zone „Gori”: prvo prekoračeni rokovi, pa hitno, pa blokirano. */
export function goriRank(task: TriageInput, now: number) {
  const { urgency } = classifyDeadline({
    dueDate: task.dueDate,
    taskStatus: task.taskStatus,
    now,
  });
  if (urgency === "overdue") return 0;
  if (task.taskPriority === "urgent") return 1;
  return 2;
}

function priorityWeight(priority: TaskPriority | null) {
  return priority === null ? PRIORITY_WEIGHT.medium : PRIORITY_WEIGHT[priority];
}

function compareDueDate(a: SortableTask, b: SortableTask) {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate - b.dueDate;
}

function compareFallback(a: SortableTask, b: SortableTask) {
  const byDueDate = compareDueDate(a, b);
  if (byDueDate !== 0) return byDueDate;

  const byPriority = priorityWeight(b.taskPriority) - priorityWeight(a.taskPriority);
  if (byPriority !== 0) return byPriority;

  return (a.taskSortAt ?? 0) - (b.taskSortAt ?? 0);
}

export function compareInZone(zone: TriageZone, now: number) {
  return (a: SortableTask, b: SortableTask) => {
    if (zone !== "gori") return compareFallback(a, b);

    const byRank = goriRank(a, now) - goriRank(b, now);
    if (byRank !== 0) return byRank;

    // Najdublje prekoračen rok ide prvi.
    if (a.dueDate !== null && b.dueDate !== null) {
      const aDiff = dueDayDiff(a.dueDate, now);
      const bDiff = dueDayDiff(b.dueDate, now);
      if (aDiff < 0 && bDiff < 0 && aDiff !== bDiff) return aDiff - bDiff;
    }

    return compareFallback(a, b);
  };
}

export type ZoneBuckets<T> = Record<TriageZone, Array<T>>;

/** Razvrstava i sortira zadatke po zonama — jedan prolaz, jedan izvor istine. */
export function bucketTasksByZone<T extends SortableTask>(
  tasks: Array<T>,
  now: number,
): ZoneBuckets<T> {
  const buckets: ZoneBuckets<T> = {
    gori: [],
    danas: [],
    nedelja: [],
    kasnije: [],
  };

  for (const task of tasks) {
    const zone = classifyTriageZone(task, now);
    if (zone !== null) buckets[zone].push(task);
  }

  for (const zone of TRIAGE_ZONE_ORDER) {
    buckets[zone].sort(compareInZone(zone, now));
  }

  return buckets;
}

/** Broj zadataka kojima je rok prošao (bez završenih). */
export function countOverdue(tasks: Array<TriageInput>, now: number) {
  return tasks.filter(
    (task) =>
      classifyDeadline({
        dueDate: task.dueDate,
        taskStatus: task.taskStatus,
        now,
      }).urgency === "overdue",
  ).length;
}

/** Trenutak sledeće lokalne ponoći — za preklasifikaciju zona bez osvežavanja. */
export function nextLocalMidnight(now: number) {
  const date = new Date(startOfLocalDay(now));
  date.setDate(date.getDate() + 1);
  return date.getTime();
}
