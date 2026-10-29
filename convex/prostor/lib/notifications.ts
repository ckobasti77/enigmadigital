// Preneto iz Devotion packages/backend/convex/lib/notifications.ts (main @ c05c40f), SPAJANJE S02.
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { clanstvoProfila } from "./auth";
import { zakaziDostavu } from "./dostava";
import type { WorkspacePageKind } from "./page_kinds";

/** Akuzativ vrste stranice — „pretvorena u belešku”. */
const PAGE_KIND_ACCUSATIVE: Record<WorkspacePageKind, string> = {
  note: "belešku",
  task: "zadatak",
  file: "fajl",
  table: "tabelu",
};

export type NotificationType =
  | "task_assigned"
  | "task_status_changed"
  | "task_due_soon"
  | "task_due_today"
  | "task_overdue"
  | "idea_voted"
  | "idea_converted"
  | "vote_requested"
  | "request_resolved"
  | "puls_ready"
  | "chat_message"
  | "chat_mention"
  | "chat_dm"
  | "comment_mention"
  | "comment_added";

export type NotificationTargetType =
  | "page"
  | "ideas"
  | "approvals"
  | "puls"
  | "chat"
  | "area";

/** Srpske oznake statusa; Convex kod ne uvozi iz app `lib/`. */
export const TASK_STATUS_LABELS = {
  backlog: "Neplanirano",
  next: "Sledeće",
  in_progress: "U toku",
  blocked: "Čeka",
  done: "Gotovo",
} as const;

export type TaskStatusKey = keyof typeof TASK_STATUS_LABELS;

export function formatNotificationDate(timestamp: number) {
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Belgrade",
  }).format(new Date(timestamp));
}

/** Beogradski kalendarski dan kao `YYYY-MM-DD` — osnova dedupe ključeva. */
export function belgradeDayKey(timestamp: number) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Belgrade",
  }).format(new Date(timestamp));
}

/**
 * Minuti od ponoći u Europe/Belgrade (0–1439) — osnova tihih sati. Zona i letnje
 * računanje vremena idu kroz `Intl`, ista tehnika kao `belgradeDayKey`.
 */
export function belgradeMinutesOfDay(timestamp: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Belgrade",
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Da li je `minute` (minuti od ponoći) unutar tihih sati `[start, end)`. Rukuje
 * prelaskom preko ponoći (npr. 22:00→08:00). `null` granice ili prazan prozor
 * (start === end) znače da tihi sati nisu aktivni.
 */
export function isWithinQuietHours(
  start: number | null,
  end: number | null,
  minute: number,
) {
  if (start === null || end === null || start === end) return false;
  return start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
}

// Copy živi na jednom mestu da bi ton bio isti u aplikaciji i u push obaveštenju.
export const notificationCopy = {
  taskAssigned: (taskTitle: string, actorName: string) => ({
    title: `Dodeljen ti je zadatak: „${taskTitle}”`,
    body: `Dodelio/la: ${actorName}`,
  }),
  taskJoined: (taskTitle: string, memberName: string) => ({
    title: `${memberName} se priključio/la zadatku „${taskTitle}”`,
    body: "Sada radite zajedno na ovom zadatku.",
  }),
  taskStatusChanged: (
    taskTitle: string,
    status: TaskStatusKey,
    actorName: string,
  ) =>
    status === "blocked"
      ? {
          title: `Zadatak „${taskTitle}” čeka — blokiran je`,
          body: `${actorName} je označio/la blokadu. Proveri šta koči.`,
        }
      : {
          title: `Zadatak „${taskTitle}” je sada: ${TASK_STATUS_LABELS[status]}`,
          body: `${actorName} je promenio/la status.`,
        },
  taskDueSoon: (taskTitle: string, dueDate: number) => ({
    title: `Zadatak „${taskTitle}” ističe sutra`,
    body: `Rok: ${formatNotificationDate(dueDate)}`,
  }),
  taskDueToday: (taskTitle: string, dueDate: number) => ({
    title: `Zadatak „${taskTitle}” ističe danas`,
    body: `Rok: ${formatNotificationDate(dueDate)}`,
  }),
  taskOverdue: (taskTitle: string, dueDate: number) => ({
    title: `Zadatak „${taskTitle}” je probio rok`,
    body: `Rok je bio ${formatNotificationDate(dueDate)}.`,
  }),
  ideaVoted: (ideaTitle: string, actorName: string, voteType: "up" | "down") =>
    voteType === "up"
      ? { title: `${actorName} je podržao/la tvoju ideju „${ideaTitle}”` }
      : { title: `${actorName} je glasao/la protiv ideje „${ideaTitle}”` },
  ideaConverted: (
    ideaTitle: string,
    kind: WorkspacePageKind,
    actorName: string,
  ) => ({
    title: `Tvoja ideja „${ideaTitle}” je pretvorena u ${PAGE_KIND_ACCUSATIVE[kind]}`,
    body: `Pretvorio/la: ${actorName}`,
  }),
  deletionVoteRequested: (targetTitle: string, actorName: string) => ({
    title: `Potreban je tvoj glas: brisanje „${targetTitle}”`,
    body: `Zahtev podneo/la: ${actorName}`,
  }),
  nestingVoteRequested: (
    childTitle: string,
    parentTitle: string,
    actorName: string,
  ) => ({
    title: "Zahtev za ugnježđavanje čeka tvoju odluku",
    body: `„${childTitle}” → „${parentTitle}” (${actorName})`,
  }),
  requestResolved: (
    targetTitle: string,
    approved: boolean,
    actorName: string,
  ) => ({
    title: `Tvoj zahtev je ${approved ? "odobren" : "odbijen"}: „${targetTitle}”`,
    body: `Odlučio/la: ${actorName}`,
  }),
  pulsReady: (startupName: string) => ({
    title: "Stigao je Puls za prošlu nedelju",
    body: `Pregled protekle nedelje za ${startupName}.`,
  }),
  // Komentari (PROSTOR P5): `excerpt` je običan tekst komentara, već skraćen.
  commentMention: (actorName: string, itemTitle: string, excerpt: string) => ({
    title: `${actorName} te je pomenuo/la u komentaru: „${itemTitle}”`,
    ...(excerpt === "" ? {} : { body: excerpt }),
  }),
  commentAdded: (actorName: string, itemTitle: string, excerpt: string) => ({
    title: `${actorName} je komentarisao/la „${itemTitle}”`,
    ...(excerpt === "" ? {} : { body: excerpt }),
  }),
};

export type CreateNotificationInput = {
  recipientProfileId: Id<"profiles">;
  /**
   * `null` = lično obaveštenje (poruka iz ličnog razgovora, van startupa).
   * Pozivalac je tada već proverio članstvo u razgovoru (`chat.ts`).
   */
  workspaceId: Id<"workspaces"> | null;
  type: NotificationType;
  title: string;
  body?: string;
  targetType: NotificationTargetType;
  targetId: string | null;
  actorProfileId?: Id<"profiles"> | null;
  dedupeKey?: string;
};

/**
 * Jedini put kojim obaveštenje ulazi u sistem. Svi guard-ovi su ovde da bi
 * pozivi na mestima događaja ostali jednolinijski, i da nijedno pravilo ne
 * može da se zaobiđe zaboravljanjem provere.
 */
export async function createNotification(
  ctx: MutationCtx,
  value: CreateNotificationInput,
): Promise<Id<"notifications"> | null> {
  const actorProfileId = value.actorProfileId ?? null;

  // Bez startupa postoji samo obaveštenje o poruci iz ličnog razgovora (članstvo
  // je proverio `chat.ts`). Sve drugo bi tiho zaobišlo proveru članstva ispod.
  if (value.workspaceId === null && value.targetType !== "chat") {
    throw new Error("Obaveštenje bez projekta je samo za lične poruke.");
  }

  // Nikad ne obaveštavamo nekoga o njegovoj sopstvenoj radnji.
  if (actorProfileId !== null && actorProfileId === value.recipientProfileId) {
    return null;
  }

  const recipient = await ctx.db.get("profiles", value.recipientProfileId);
  if (recipient === null || recipient.archivedAt !== null) return null;

  // Uklonjen član i `client_viewer` ne dobijaju obaveštenja za taj projekat.
  // Lično obaveštenje nema projekat — članstvo u razgovoru je proverio pozivalac.
  const workspaceId = value.workspaceId;
  if (workspaceId !== null) {
    const membership = await clanstvoProfila(ctx, workspaceId, value.recipientProfileId);
    if (membership === null) return null;
  }

  if (value.dedupeKey !== undefined) {
    const existing = await ctx.db
      .query("notifications")
      .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", value.dedupeKey!))
      .first();
    if (existing !== null) return null;
  }

  const notificationId = await ctx.db.insert("notifications", {
    recipientProfileId: value.recipientProfileId,
    workspaceId: value.workspaceId,
    type: value.type,
    title: value.title,
    ...(value.body === undefined ? {} : { body: value.body }),
    targetType: value.targetType,
    targetId: value.targetId,
    actorProfileId,
    dedupeKey: value.dedupeKey ?? null,
    readAt: null,
    createdAt: Date.now(),
  });

  // Push ide van transakcije: mreža ne sme da blokira ni da obori upis.
  //
  // Dve nezavisne grane iz iste tačke (posle svih guard-ova i posle upisa reda):
  //   push.deliver     → web (VAPID, desktop browser)
  //   expoPush.deliver → native (Expo, Android + iOS telefon)
  // Isti korisnik može imati oba uređaja; obe dostave rade paralelno. Odvojeni
  // `runAfter` jobovi znače da pad jedne grane ne dira drugu, a oba nasleđuju
  // ista pravila potiskivanja odavde (docs/mobile/03-NOTIFIKACIJE.md sekcija 2).
  // SPAJANJE: dostavu zakazuje `zakaziDostavu` (S01 D6); S06 je uključuje.
  await zakaziDostavu(ctx, notificationId);

  return notificationId;
}

async function actorName(ctx: MutationCtx, actorProfileId: Id<"profiles">) {
  const actor = await ctx.db.get("profiles", actorProfileId);
  return actor?.displayName ?? "Član tima";
}

/**
 * Obaveštava zainteresovane o promeni na zadatku. Deljeno između
 * `tasks.updateMetadata` i `areasV2.updatePage` da bi pravila bila identična
 * bez obzira kojim putem je promena došla.
 */
export async function notifyTaskStakeholders(
  ctx: MutationCtx,
  args: {
    page: Doc<"pages">;
    /** Ko je upravo dodat na zadatak; prazno kad se spisak nije menjao. */
    addedAssigneeProfileIds?: Array<Id<"profiles">>;
    /** Ceo spisak posle izmene — primaoci obaveštenja o statusu. */
    assigneeProfileIdsAfterChange: Array<Id<"profiles">>;
    nextTaskStatus: TaskStatusKey | null;
    actorProfileId: Id<"profiles">;
  },
) {
  const { page, actorProfileId } = args;
  if (page.kind !== "task") return;

  const name = await actorName(ctx, actorProfileId);
  const statusChanged = args.nextTaskStatus !== page.taskStatus;

  for (const recipientProfileId of args.addedAssigneeProfileIds ?? []) {
    const copy = notificationCopy.taskAssigned(page.title, name);
    await createNotification(ctx, {
      recipientProfileId,
      workspaceId: page.workspaceId,
      type: "task_assigned",
      title: copy.title,
      body: copy.body,
      targetType: "page",
      targetId: page._id,
      actorProfileId,
    });
  }

  if (statusChanged && args.nextTaskStatus !== null) {
    const copy = notificationCopy.taskStatusChanged(
      page.title,
      args.nextTaskStatus,
      name,
    );
    // Zadatak prate svi kojima je dodeljen i onaj koji ga je otvorio.
    const recipients = new Set<Id<"profiles">>(
      args.assigneeProfileIdsAfterChange,
    );
    recipients.add(page.createdByProfileId);

    for (const recipientProfileId of recipients) {
      await createNotification(ctx, {
        recipientProfileId,
        workspaceId: page.workspaceId,
        type: "task_status_changed",
        title: copy.title,
        body: copy.body,
        targetType: "page",
        targetId: page._id,
        actorProfileId,
      });
    }
  }
}
