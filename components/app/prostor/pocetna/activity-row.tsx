"use client";

// Preneto iz Devotion apps/web/components/workspace/command-center/activity-row.tsx (main @ c05c40f), SPAJANJE S20.
import {
  Calendar,
  Circle,
  History,
  Lightbulb,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  MoveRight,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import {
  activityTarget,
  formatActivity,
  formatEditTime,
  type ActivityIcon,
  type ActivityTarget,
  type ActivityTone,
} from "@/lib/prostor";

import type { Id } from "@/convex/_generated/dataModel";
import type { ProstorRuta } from "@/lib/prostor/rute";
import { cn } from "@/lib/utils";

const ICONS: Record<ActivityIcon, LucideIcon> = {
  edit: Pencil,
  create: Plus,
  move: MoveRight,
  trash: Trash2,
  restore: RotateCcw,
  lock: Lock,
  unlock: LockOpen,
  comment: MessageSquare,
  idea: Lightbulb,
  member: UserRound,
  invite: Mail,
  history: History,
  calendar: Calendar,
  other: Circle,
};

const TONE_CLASS: Record<ActivityTone, string> = {
  neutral: "text-text-muted",
  danger: "text-danger",
  success: "text-success",
};

/** Jedan unos aktivnosti, već formatiran (`formatActivity`). */
export type ActivityEntry = {
  id: string;
  sentence: string;
  icon: ActivityIcon;
  tone: ActivityTone;
  /** „pre 5 min", „danas u 14:05" (`formatEditTime`). */
  time: string;
  target: ActivityTarget;
};

type ActivityItem = Parameters<typeof activityTarget>[0] & {
  _id: string;
  createdAt: number;
  actor: { displayName: string } | null;
} & Parameters<typeof formatActivity>[0];

/** Red iz `activity.listPaginated` → unos za prikaz (početna i ekran Aktivnost dele isto). */
export function activityEntryOf(item: ActivityItem, now: number): ActivityEntry {
  const format = formatActivity(item, item.actor?.displayName ?? null);
  return {
    id: item._id,
    sentence: format.sentence,
    icon: format.icon,
    tone: format.tone,
    time: formatEditTime(item.createdAt, now),
    target: activityTarget(item),
  };
}

/** Kuda vodi unos (stranica, ideja, oblast); `null` za unos bez odredišta. */
export function rutaAktivnosti(target: ActivityTarget): ProstorRuta | null {
  if (target.kind === "page") return { kind: "page", pageId: target.pageId as Id<"pages"> };
  if (target.kind === "idea") return { kind: "ideas", ideaId: target.ideaId as Id<"ideaNodes"> };
  if (target.kind === "area") return { kind: "area", areaId: target.areaId as Id<"areas"> };
  return null;
}

/**
 * Red aktivnosti: ikonica vrste, rečenica (do dva reda) i vreme. Unos koji vodi
 * negde (stranica, ideja, oblast) je dugme, ostali su obični redovi.
 */
export function ActivityRow({
  entry,
  onOpen,
}: {
  entry: ActivityEntry;
  onOpen: (target: ActivityTarget) => void;
}) {
  const Icon = ICONS[entry.icon];
  const content = (
    <>
      <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[entry.tone])} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-ui text-foreground">{entry.sentence}</span>
        <span className="block text-meta text-text-muted">{entry.time}</span>
      </span>
    </>
  );
  const className = "flex min-h-10 w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left";
  if (entry.target.kind === "none") return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={() => onOpen(entry.target)}
      className={cn(
        className,
        "cursor-pointer transition-colors duration-(--duration-fast) ease-(--ease-ui) hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11",
      )}
    >
      {content}
    </button>
  );
}
