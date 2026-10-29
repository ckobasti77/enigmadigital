// Preneto iz Devotion packages/backend/convex/lib/validators.ts (main @ c05c40f), SPAJANJE S02.
import { v } from "convex/values";

export const roleValidator = v.union(
  v.literal("admin"),
  v.literal("member"),
);

export const areaKeyValidator = v.string();

export const pageKindValidator = v.union(
  v.literal("note"),
  v.literal("task"),
  v.literal("file"),
  v.literal("table"),
);

/** Kategorija priloga; izvodi se iz `contentType` na serveru. */
export const pageFileCategoryValidator = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("pdf"),
  v.literal("audio"),
  v.literal("sheet"),
  v.literal("document"),
);

/** Korpa: najviše stavki po strani `trash.list`. */
export const TRASH_PAGE_MAX = 50;
/** Korpa: brojevi segmenata se seku ovde („99+"). */
export const TRASH_COUNT_CAP = 99;
/** Korpa › Oporavljeno: najviše sačuvanih priloga po stavci u listi. */
export const TRASH_RECOVERED_CONTRIBUTIONS = 20;

/**
 * Korpa (PROSTOR P3): `root` je stavka koju je neko obrisao (vidi se u Korpi),
 * `descendant` je podstranica obrisana istim potezom (vraća se sa korenom).
 * Odsutno polje = nije u Korpi (aktivno ili arhivirano pre Korpe — D2).
 */
export const trashStateValidator = v.union(
  v.literal("root"),
  v.literal("descendant"),
);

/**
 * Sačuvana faza ideje (PROSTOR P6). Odsutno polje = `predlog`; „Postalo
 * zadatak" se ne čuva — izvodi se iz `convertedPageId` (`lib/idea_stages.ts`).
 */
export const ideaStageValidator = v.union(
  v.literal("predlog"),
  v.literal("razmatra_se"),
  v.literal("odobreno"),
  v.literal("odbijeno"),
);

/** „Čeka tebe" (`inbox.pending`, `idea_vote`): ideja čeka moj glas. */
export const inboxPendingIncludeValidator = v.literal("idea_vote");
/**
 * Glasova po ideji koje „Čeka tebe" broji (tim ima 10–15 ljudi, jedan glas po
 * profilu); preko granice broj staje.
 */
export const INBOX_IDEA_VOTE_COUNT_CAP = 200;

export const taskStatusValidator = v.union(
  v.literal("backlog"),
  v.literal("next"),
  v.literal("in_progress"),
  v.literal("blocked"),
  v.literal("done"),
);

export const taskPriorityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("urgent"),
);

export const notificationTypeValidator = v.union(
  v.literal("task_assigned"),
  v.literal("task_status_changed"),
  v.literal("task_due_soon"),
  v.literal("task_due_today"),
  v.literal("task_overdue"),
  v.literal("idea_voted"),
  v.literal("idea_converted"),
  v.literal("vote_requested"),
  v.literal("request_resolved"),
  v.literal("puls_ready"),
  // Chat (vidi docs/mobile/04-CHAT.md sekcija 6). Zvuci se mapiraju po tipu.
  v.literal("chat_message"),
  v.literal("chat_mention"),
  v.literal("chat_dm"),
  // Komentari (PROSTOR P5, K04): mapirani na postojeće kanale `mention` i `channel`.
  v.literal("comment_mention"),
  v.literal("comment_added"),
);

/**
 * Kuda vodi klik na obaveštenje. `chat` vodi na kanal (targetId je channelId),
 * `area` na oblast (targetId je areaId; do ekrana oblasti klijenti padaju na
 * Komandni centar), `ideas` na ideju kad nosi ideaId.
 */
export const notificationTargetTypeValidator = v.union(
  v.literal("page"),
  v.literal("ideas"),
  v.literal("approvals"),
  v.literal("puls"),
  v.literal("chat"),
  v.literal("area"),
);

/** Komentari: najviše pominjanja po komentaru (shared `MAX_COMMENT_MENTIONS`). */
export const MAX_COMMENT_MENTIONS = 20;
/** Komentari: najduži tekst jednog komentara. */
export const COMMENT_MAX_LENGTH = 20_000;
/** Komentari: broj u listama se seče ovde („20+"). */
export const COMMENT_COUNT_CAP = 20;
/** Komentari: najviše ciljeva u jednom `comments.countFor` pozivu. */
export const COMMENT_COUNT_TARGETS_MAX = 100;
/** Komentari: koliko traje „Poništi" posle uklanjanja. */
export const COMMENT_UNDO_MS = 8_000;
/** Komentari: najviše redova po strani `comments.list` (klijenti traže 20–50). */
export const COMMENT_PAGE_MAX = 100;

// --- Chat (docs/mobile/04-CHAT.md) ---------------------------------------

/**
 * Vrsta chat kanala. `startup` je opšti kanal — tačno jedan po startupu,
 * implicitno članstvo, ne može da se napusti ni arhivira (sekcija 5b). `agent`
 * je AI sagovornik, po korisniku jedan (docs/mobile/06-AGENT.md).
 */
export const chatChannelKindValidator = v.union(
  v.literal("startup"),
  v.literal("area"),
  v.literal("custom"),
  v.literal("dm"),
  v.literal("thread"),
  v.literal("agent"),
);

/**
 * Entitet za koji je thread kanal zakačen (`kind === "thread"`). `message` je
 * diskusija otvorena iz same chat poruke — thread nasleđuje pristup od kanala
 * te poruke (04-CHAT.md 5c). Pronalaženje ide preko `chatChannels.by_anchor`.
 */
export const chatAnchorTypeValidator = v.union(
  v.literal("page"),
  v.literal("idea"),
  v.literal("thought"),
  v.literal("deletionRequest"),
  v.literal("message"),
);

export const chatMessageKindValidator = v.union(
  v.literal("text"),
  v.literal("file"),
  v.literal("voice"),
  v.literal("system"),
);

export const chatMemberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("member"),
);

/**
 * Nivo obaveštenja po kanalu, po profilu. Živi na `chatReads` (ne na
 * `chatMembers`) da bi radio i za implicitne startup/area kanale. Odsutan red
 * ili polje = `all`.
 */
export const chatNotificationLevelValidator = v.union(
  v.literal("all"),
  v.literal("mentions"),
  v.literal("none"),
);

export const checkpointItemValidator = v.object({
  id: v.string(),
  text: v.string(),
  completed: v.boolean(),
});

export const taskCheckpointCanvasEndpointValidator = v.union(
  v.object({
    kind: v.literal("page"),
    id: v.id("pages"),
  }),
  v.object({
    kind: v.literal("task_checkpoint"),
    id: v.id("taskCheckpoints"),
  }),
);

/** Statusi koje komandni centar smatra otvorenim poslom. */
export const OPEN_TASK_STATUSES = [
  "backlog",
  "next",
  "in_progress",
  "blocked",
] as const;

/**
 * Gornja granica čitanja po statusu u komandnom centru. Trijaža mora da prikaže
 * tačne brojeve, pa se čita bez paginacije — granica je zaštita, ne očekivanje.
 */
export const COMMAND_CENTER_STATUS_CAP = 150;

export const MAX_TASK_INSTRUCTIONS_LENGTH = 20_000;
export const MAX_TASK_ASSIGNEES = 10;
export const MAX_TASK_CHECKPOINTS = 100;
export const MAX_TASK_CHECKPOINT_ID_LENGTH = 128;
export const MAX_TASK_PAGE_SIZE = 100;
export const MAX_TABLE_COLUMNS = 64;
export const MAX_TABLE_ROWS = 5_000;
export const MAX_TABLE_CELL_LENGTH = 2_000;
export const MAX_TABLE_LABEL_LENGTH = 120;
/** Jedan uvoz šalje redove u serijama; mutacija ima transakcione limite. */
export const MAX_TABLE_IMPORT_BATCH = 200;
export const MAX_TABLE_PAGE_SIZE = 200;
export const MAX_TASK_DUE_DATE = 253_402_300_799_999;

// --- Chat limiti (docs/mobile/04-CHAT.md) --------------------------------
export const MAX_CHAT_MESSAGE_LENGTH = 10_000;
/** Denormalizovani pregled poslednje poruke u listi razgovora. */
export const CHAT_PREVIEW_LENGTH = 100;
/** Prozor u kome autor sme da izmeni poruku (04-CHAT.md 8, „~15 min"). */
export const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1_000;
export const MAX_CHAT_MENTIONS = 50;
/**
 * Koliko članova sme da ima custom kanal. Ista granica koju `startups.listMembers`
 * ionako nameće (`boundedLimit(…, 25, 50)`), pa piker ne može da ponudi više nego
 * što izvor daje. Uvoze je OBA klijenta (mobilni sheet i web dijalog) — konstanta
 * koju niko ne troši je mrtav export.
 */
export const MAX_CHAT_CHANNEL_MEMBERS = 50;
/** Gornja granica čitanja u listama — zaštita, ne očekivanje. */
export const CHAT_CHANNELS_CAP = 200;
export const CHAT_UNREAD_SUMMARY_CAP = 500;
export const CHAT_SEARCH_CAP = 50;
/** Koliko primalaca dobija unread/notifikaciju po poruci pre batch obrasca. */
export const CHAT_RECIPIENTS_CAP = 200;

// --- Lični nivo „Ja" (docs/LICNO-PLAN.md §4.1–4.3, plan K01 §2.0) ---------
export const MAX_PERSONAL_TASK_TITLE_LENGTH = 200;
export const MAX_PERSONAL_TASK_NOTES_LENGTH = 5_000;
export const MAX_OPEN_PERSONAL_TASKS = 500;
/** Gornja granica `personalTasks.list`; podrazumevano 100. */
export const PERSONAL_TASKS_LIST_MAX = 300;
/** Koliko završenih ličnih zadataka `list({ status: "all" })` dodaje uz otvorene. */
export const PERSONAL_TASKS_LIST_DONE_IN_ALL = 50;
/** Stavki plana po danu. */
export const MAX_MY_DAY_ENTRIES = 50;
/** Prozor „Preneto od ranije": prethodnih N dana pre `dayKey`. */
export const MY_DAY_CARRY_OVER_DAYS = 7;
export const MY_DAY_HISTORY_CAP = 50;
/** Granice čitanja po statusu u `myDay.overview` — zaštita, ne očekivanje. */
export const MY_DAY_STATUS_CAPS = {
  in_progress: 25,
  blocked: 25,
  next: 30,
  backlog: 40,
} as const;
export const MY_DAY_DONE_CAP = 20;
export const MY_DAY_PERSONAL_OPEN_CAP = 80;
/** Razmak pozicija u planu dana; nova stavka ide na kraj (+1024). */
export const MY_DAY_POSITION_STEP = 1_024;
/** Aktivni projekti koje lični nivo čita (P28: 50 umesto Devotionovih 20). */
export const MY_SCOPE_WORKSPACE_CAP = 50;
/** Gornja granica `tasks.listEverywhere`; podrazumevano 100. */
export const TASKS_EVERYWHERE_MAX = 200;
export const TASKS_EVERYWHERE_STATUS_CAP = 60;
/** „Sredi rokove”: najviše zadataka u jednoj mutaciji (PROSTOR P10). */
export const BULK_RESCHEDULE_MAX = 50;
/** „Nedavne izmene u oblasti” (`pages.recentForArea`): podrazumevano i najviše. */
export const RECENT_AREA_PAGES_DEFAULT = 10;
export const RECENT_AREA_PAGES_MAX = 20;
/** Koliko završenih `listEverywhere({ scope: "all" })` dodaje uz otvorene. */
export const TASKS_EVERYWHERE_DONE_IN_ALL = 50;

// --- Globalni Inbox (`inbox.ts`, plan K01 §2.0 / §2.4) --------------------
/** Najviše nepročitanih koje `inbox.unreadCounts` skenira; preko toga `capped`. */
export const INBOX_UNREAD_SCAN_CAP = 300;
/** Obaveštenja po transakciji u `inbox.markAllRead` / `markAllReadBatch`. */
export const INBOX_MARK_ALL_BATCH = 200;
/** Stavki po izvoru u `inbox.pending` („Čeka tebe"). */
export const INBOX_PENDING_CAP = 30;
/**
 * Koliko glasačkih listića `inbox.pending` pregleda dok skupi `INBOX_PENDING_CAP`
 * važećih: listić ostaje `pending` i kad se zahtev odbije ili povuče, pa bi
 * zastareli listići inače mogli da potisnu otvoreno glasanje.
 */
export const INBOX_PENDING_BALLOT_SCAN_CAP = 100;
export const INBOX_FEED_PAGE_DEFAULT = 20;
export const INBOX_FEED_PAGE_MAX = 50;

// --- Globalni chat (`chat.ts`, plan K01 §2.0 / §3) -------------------------
/** Najviše kanala u `chat.listConversations`; preko toga ostaju najsvežiji i `capped`. */
export const CHAT_HUB_CHANNELS_CAP = 300;
/**
 * Ukupan budžet eksplicitnih članstava (lični + svi startupi) koje hub čita —
 * da broj startupa ne množi čitanje bez granice.
 */
export const CHAT_HUB_MEMBERSHIPS_CAP = 400;
/** Lična članstva koja hub i brojači čitaju (deo budžeta iznad). */
export const CHAT_PERSONAL_MEMBERSHIPS_CAP = 200;
/** `chat.listPeople`: profila po ulozi (admin / member). */
export const CHAT_PEOPLE_CAP = 100;

export const personalTaskStatusValidator = v.union(
  v.literal("open"),
  v.literal("done"),
);

/** Mini podaci projekta za liste ličnog nivoa (čip projekta). */
export const workspaceMiniValidator = v.object({
  _id: v.id("workspaces"),
  name: v.string(),
  logoUrl: v.union(v.string(), v.null()),
});

export const areaMiniValidator = v.object({
  _id: v.id("areas"),
  key: v.string(),
  label: v.string(),
});

/**
 * Lični zadatak kako ga vide klijenti. Pravi se NABRAJANJEM polja
 * (`toPersonalTaskItem`), nikad spread-om dokumenta — `returns` validator
 * odbija višak (`archivedAt`, `movedToPageId`, `profileId`).
 */
export const personalTaskItemValidator = v.object({
  _id: v.id("personalTasks"),
  title: v.string(),
  notes: v.union(v.string(), v.null()),
  status: personalTaskStatusValidator,
  priority: v.union(taskPriorityValidator, v.null()),
  dueDate: v.union(v.number(), v.null()),
  sortAt: v.number(),
  completedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/** Startup zadatak u listama ličnog nivoa (Moj dan, Moji zadaci svuda). */
export const taskItemValidator = v.object({
  _id: v.id("pages"),
  title: v.string(),
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  dueDate: v.union(v.number(), v.null()),
  taskSortAt: v.number(),
  /** `taskCompletedAt(page)` — null dok zadatak nije završen. */
  completedAt: v.union(v.number(), v.null()),
  checkpointTotal: v.number(),
  checkpointCompleted: v.number(),
  createdByProfileId: v.id("profiles"),
  isCreator: v.boolean(),
  isAssignee: v.boolean(),
  /** PROSTOR P1: zadatak je zaključan. Opciono zbog starih fixture-a. */
  isLocked: v.optional(v.boolean()),
  /** Zaključan, a gledalac nije autor, vlasnik startupa ni admin. */
  lockedForViewer: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
  workspace: workspaceMiniValidator,
  area: v.union(areaMiniValidator, v.null()),
});

export type TaskCheckpointInput = {
  id: string;
  text: string;
  completed: boolean;
};

export function normalizeTaskInstructions(
  value: string | null | undefined,
) {
  if (value === undefined || value === null) return undefined;
  if (value.length > MAX_TASK_INSTRUCTIONS_LENGTH) {
    throw new Error(
      `Instrukcije mogu imati najviše ${MAX_TASK_INSTRUCTIONS_LENGTH} znakova.`,
    );
  }
  const cleaned = value.trim();
  return cleaned.length === 0 ? undefined : cleaned;
}

export function normalizeTaskCheckpoints(
  value: Array<TaskCheckpointInput> | null | undefined,
) {
  if (value === undefined || value === null) return undefined;
  if (value.length > MAX_TASK_CHECKPOINTS) {
    throw new Error(
      `Zadatak može imati najviše ${MAX_TASK_CHECKPOINTS} checkpointa.`,
    );
  }

  const ids = new Set<string>();
  return value.map((checkpoint) => {
    if (checkpoint.id.length > MAX_TASK_CHECKPOINT_ID_LENGTH) {
      throw new Error(
        `ID checkpointa može imati najviše ${MAX_TASK_CHECKPOINT_ID_LENGTH} znakova.`,
      );
    }
    const id = checkpoint.id.trim();
    const text = checkpoint.text.trim();
    if (id.length === 0) throw new Error("ID checkpointa je obavezno polje.");
    if (text.length === 0) {
      throw new Error("Tekst checkpointa je obavezno polje.");
    }
    if (ids.has(id)) {
      throw new Error("ID-jevi checkpointa moraju biti jedinstveni.");
    }
    ids.add(id);
    return { id, text, completed: checkpoint.completed };
  });
}

export function validateTaskDueDate(
  value: number | null | undefined,
) {
  if (value === undefined || value === null) return value;
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_TASK_DUE_DATE
  ) {
    throw new Error("Rok nije ispravan.");
  }
  return value;
}

export const pageSummaryValidator = v.object({
  _id: v.id("pages"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  areaId: v.id("areas"),
  parentPageId: v.union(v.id("pages"), v.null()),
  kind: pageKindValidator,
  title: v.string(),
  searchText: v.string(),
  revision: v.number(),
  position: v.number(),
  taskStatus: v.union(taskStatusValidator, v.null()),
  taskPriority: v.union(taskPriorityValidator, v.null()),
  assigneeProfileId: v.union(v.id("profiles"), v.null()),
  dueDate: v.union(v.number(), v.null()),
  instructions: v.optional(v.string()),
  checkpoints: v.optional(v.array(checkpointItemValidator)),
  checkpointTotal: v.optional(v.number()),
  checkpointCompleted: v.optional(v.number()),
  checkpointRevision: v.optional(v.number()),
  taskSortAt: v.number(),
  completedAt: v.optional(v.union(v.number(), v.null())),
  createdByProfileId: v.id("profiles"),
  updatedByProfileId: v.id("profiles"),
  /** PROSTOR P1; `summarizePage` uvek šalje broj ili `null`. */
  lockedAt: v.optional(v.union(v.number(), v.null())),
  archivedAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * CEO `pages` dokument — za funkcije koje vraćaju `{ ...page }` umesto sažetka
 * (`pages.get`). Mora da nosi SVAKO polje iz `schema.ts`, jer Convex returns
 * validator odbija višak i obara ceo ekran, i to tek kad se novo polje prvi put
 * upiše u bazu (npr. `tableColumnCount` posle prve tabele). Poklapanje sa šemom
 * čuva `pages.validator.test.ts`.
 *
 * `pageSummaryValidator` je namerno uži i ostaje takav: njega prati
 * `summarizePage`, koji polja bira nabrajanjem, pa mu višak iz šeme ne može doći.
 */
export const pageDocumentValidator = pageSummaryValidator.extend({
  treeRevision: v.optional(v.number()),
  canvasPreview: v.optional(v.string()),
  fileCount: v.optional(v.number()),
  filePreviewStorageId: v.optional(v.id("_storage")),
  filePrimaryCategory: v.optional(pageFileCategoryValidator),
  tableRowCount: v.optional(v.number()),
  tableColumnCount: v.optional(v.number()),
  sourceMessageId: v.optional(v.id("chatMessages")),
  /** P19 (S23): firma iz Leadova. */
  leadCompanyId: v.optional(v.id("leadCompanies")),
  lockedByProfileId: v.optional(v.union(v.id("profiles"), v.null())),
  archivedByProfileId: v.optional(v.id("profiles")),
  trashState: v.optional(trashStateValidator),
  archivedWithPageId: v.optional(v.id("pages")),
  trashDescendantCount: v.optional(v.number()),
});

export const areaDocumentValidator = v.object({
  _id: v.id("areas"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  key: v.string(),
  label: v.string(),
  position: v.number(),
  createdAt: v.number(),
});

export const AREA_DEFINITIONS = [
  { key: "dev", label: "Razvoj", position: 0 },
  { key: "marketing", label: "Marketing", position: 1 },
  { key: "sales", label: "Prodaja", position: 2 },
  { key: "other", label: "Ostalo", position: 3 },
] as const;

export function boundedLimit(value: number | undefined, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`Limit mora biti ceo broj između 1 i ${max}.`);
  }
  return value;
}

export function cleanRequiredText(value: string, label: string, maxLength: number) {
  const cleaned = value.trim();
  if (cleaned.length === 0) throw new Error(`${label} je obavezno polje.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned;
}

export function cleanOptionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${label} može imati najviše ${maxLength} znakova.`);
  }
  return cleaned;
}

export function normalizeEmail(email: string) {
  const normalized = email.trim().toLocaleLowerCase("en-US");
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new Error("Unesite ispravnu email adresu.");
  }
  return normalized;
}
