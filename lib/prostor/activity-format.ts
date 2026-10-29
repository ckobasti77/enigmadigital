// Preneto iz Devotion packages/shared/src/activity-format.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Aktivnost (PROSTOR P24) — srpske rečenice za „Nedavne izmene” i ekran
 * Aktivnost, iste na webu i telefonu. ČISTO: bez React-a i bez Convex tipova.
 *
 * Nove radnje (od PROSTOR runa) čuvaju `title` = naslov objekta (bez navodnika)
 * i, po potrebi, `detail`; rečenicu gradi ovde. Stare radnje (23) već čuvaju
 * gotovu rečenicu u `title`, pa ih ovaj modul samo potpisuje: „Ana · {title}”
 * (+ „ — {detail}”). Backend ne uvozi ovaj fajl; `activity-format-parity.test.ts`
 * čuva da spisak radnji ne odluta od šeme.
 */
import { subpagesLabel } from "./trash";

export type ActivityIcon =
  | "edit"
  | "create"
  | "move"
  | "trash"
  | "restore"
  | "lock"
  | "unlock"
  | "comment"
  | "idea"
  | "member"
  | "invite"
  | "history"
  | "calendar"
  | "other";

export type ActivityTone = "neutral" | "danger" | "success";

export type ActivityFormat = {
  sentence: string;
  icon: ActivityIcon;
  tone: ActivityTone;
};

export type ActivityItemLike = {
  action: string;
  title: string;
  detail?: string | null;
};

/** Ko je radio kad ime nije poznato (profil obrisan ili nije učitan). */
export const UNKNOWN_ACTIVITY_ACTOR = "Član tima";

/** Naslov objekta bez praznog stanja: „bez naslova”. */
function named(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : "bez naslova";
}

function quoted(title: string): string {
  return `„${named(title)}”`;
}

type Builder = (actor: string, item: ActivityItemLike) => string;

type ActionSpec = {
  icon: ActivityIcon;
  tone: ActivityTone;
  /** Odsutno = stara radnja: „{Ime} · {title}” (+ „ — {detail}”). */
  sentence?: Builder;
};

/** Stara radnja: gotova rečenica u `title`, potpisana imenom. */
const signed: Builder = (actor, item) => {
  const detail = item.detail?.trim();
  return detail
    ? `${actor} · ${item.title} — ${detail}`
    : `${actor} · ${item.title}`;
};

/** „Sa 3 podstranice” (backend) → broj; bez broja → `null`. */
function subpageCount(detail: string | null | undefined): number | null {
  const match = detail?.match(/\d+/);
  if (!match) return null;
  const count = Number(match[0]);
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

/**
 * Sve radnje iz `activities.action` (32). Redosled prati šemu: prvo 23 stare,
 * pa nove po koracima runa.
 */
const ACTIONS = {
  // --- Stare (gotova rečenica u `title`) -----------------------------------
  startup_created: { icon: "create", tone: "success" },
  startup_updated: { icon: "edit", tone: "neutral" },
  startup_archived: { icon: "trash", tone: "danger" },
  member_added: { icon: "member", tone: "success" },
  member_removed: { icon: "member", tone: "danger" },
  invite_created: { icon: "invite", tone: "neutral" },
  invite_claimed: { icon: "invite", tone: "success" },
  invite_revoked: { icon: "invite", tone: "danger" },
  page_created: { icon: "create", tone: "success" },
  page_updated: { icon: "edit", tone: "neutral" },
  page_moved: { icon: "move", tone: "neutral" },
  page_archived: { icon: "trash", tone: "danger" },
  task_updated: { icon: "edit", tone: "neutral" },
  contribution_created: { icon: "comment", tone: "neutral" },
  contribution_updated: { icon: "edit", tone: "neutral" },
  deletion_requested: { icon: "trash", tone: "danger" },
  deletion_voted: { icon: "trash", tone: "neutral" },
  deletion_resolved: { icon: "trash", tone: "neutral" },
  nesting_requested: { icon: "move", tone: "neutral" },
  nesting_resolved: { icon: "move", tone: "neutral" },
  content_recovered: { icon: "restore", tone: "success" },
  content_soft_deleted: { icon: "trash", tone: "danger" },
  member_password_changed: { icon: "member", tone: "neutral" },
  // --- Nove (naslov objekta u `title`) -------------------------------------
  page_locked: {
    icon: "lock",
    tone: "neutral",
    sentence: (actor, item) => `${actor} je zaključao/la ${quoted(item.title)}`,
  },
  page_unlocked: {
    icon: "unlock",
    tone: "neutral",
    sentence: (actor, item) => `${actor} je otključao/la ${quoted(item.title)}`,
  },
  revision_restored: {
    icon: "history",
    tone: "neutral",
    sentence: (actor, item) =>
      `${actor} je vratio/la raniju verziju ${quoted(item.title)}`,
  },
  page_restored: {
    icon: "restore",
    tone: "success",
    sentence: (actor, item) => {
      const count = subpageCount(item.detail);
      const tail = count === null ? "" : ` i ${subpagesLabel(count)}`;
      return `${actor} je vratio/la ${quoted(item.title)} iz Korpe${tail}`;
    },
  },
  idea_archived: {
    icon: "trash",
    tone: "danger",
    sentence: (actor, item) =>
      `${actor} je obrisao/la ideju ${quoted(item.title)}`,
  },
  idea_restored: {
    icon: "restore",
    tone: "success",
    sentence: (actor, item) =>
      `${actor} je vratio/la ideju ${quoted(item.title)} iz Korpe`,
  },
  comment_created: {
    icon: "comment",
    tone: "neutral",
    sentence: (actor, item) =>
      `${actor} je komentarisao/la ${quoted(item.title)}`,
  },
  idea_stage_changed: {
    icon: "idea",
    tone: "neutral",
    sentence: (actor, item) => {
      const stage = item.detail?.trim();
      return stage
        ? `${actor} je premestio/la ideju ${quoted(item.title)} u fazu ${stage}`
        : `${actor} je promenio/la fazu ideje ${quoted(item.title)}`;
    },
  },
  tasks_rescheduled: {
    icon: "calendar",
    tone: "neutral",
    sentence: (actor, item) => {
      const detail = item.detail?.trim();
      return detail
        ? `${actor} je sredio/la rokove: ${detail}`
        : `${actor} je sredio/la rokove`;
    },
  },
} satisfies Record<string, ActionSpec>;

export type KnownActivityAction = keyof typeof ACTIONS;

/** Svaka radnja koju ovaj modul zna; backend test je poredi sa šemom. */
export const ACTIVITY_ACTIONS = Object.keys(ACTIONS) as KnownActivityAction[];

/**
 * Rečenica, ikonica i ton jednog unosa aktivnosti. Nepoznata radnja (npr. iz
 * novijeg backenda) pada na „{Ime} · {title}”; bez imena je „Član tima”.
 */
export function formatActivity(
  item: ActivityItemLike,
  actorName: string | null,
): ActivityFormat {
  const actor = actorName?.trim() ? actorName.trim() : UNKNOWN_ACTIVITY_ACTOR;
  // `hasOwnProperty`, ne `in`: „toString” iz prototipa nije radnja.
  const spec: ActionSpec | undefined = Object.prototype.hasOwnProperty.call(
    ACTIONS,
    item.action,
  )
    ? ACTIONS[item.action as KnownActivityAction]
    : undefined;
  if (spec === undefined) {
    return { sentence: signed(actor, item), icon: "other", tone: "neutral" };
  }
  return {
    sentence: (spec.sentence ?? signed)(actor, item),
    icon: spec.icon,
    tone: spec.tone,
  };
}

export type ActivityTarget =
  | { kind: "page"; pageId: string }
  | { kind: "idea"; ideaId: string }
  | { kind: "area"; areaId: string }
  | { kind: "none" };

/** Gde unos vodi na klik; sve ostalo (startup, profil, poziv…) ne vodi nigde. */
export function activityTarget(item: {
  targetType: string;
  targetId: string;
}): ActivityTarget {
  switch (item.targetType) {
    case "page":
      return { kind: "page", pageId: item.targetId };
    case "idea":
      return { kind: "idea", ideaId: item.targetId };
    case "area":
      return { kind: "area", areaId: item.targetId };
    default:
      return { kind: "none" };
  }
}
