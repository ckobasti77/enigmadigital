// Preneto iz Devotion packages/backend/convex/myDay.ts (main @ c05c40f), SPAJANJE S04.
import { v } from "convex/values";
import { type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { requireProfile } from "./lib/auth";
import { assertDayKey, shiftDayKey } from "./lib/day_key";
import {
  appendPlanEntry,
  getOwnedPersonalTask,
  getPlannableTask,
  type MyDayRef,
  parseRefKey,
  refKeyOf,
  refOfEntry,
  requireOwnedPersonalTask,
  requirePlannableTask,
} from "./lib/my_day";
import {
  type AreaMini,
  listMyActiveWorkspaces,
  type PersonalTaskItem,
  type TaskItem,
  toPersonalTaskItem,
  toTaskItem,
} from "./lib/my_scope";
import {
  MAX_MY_DAY_ENTRIES,
  MAX_TASK_DUE_DATE,
  MY_DAY_CARRY_OVER_DAYS,
  MY_DAY_DONE_CAP,
  MY_DAY_HISTORY_CAP,
  MY_DAY_PERSONAL_OPEN_CAP,
  MY_DAY_STATUS_CAPS,
  personalTaskItemValidator,
  workspaceMiniValidator,
  taskItemValidator,
} from "./lib/validators";
import { prijavljenMutation, prijavljenQuery } from "../lib/projekat";

/*
 * Moj dan (docs/LICNO-PLAN.md §4.2, plan K01 §2.2): plan dana i jedna
 * reaktivna slika „šta danas" kroz sve startupe i lične zadatke. Upit ne čita
 * sat — klijent šalje `dayKey` (lokalni dan uređaja) i `doneSince` (lokalna
 * ponoć). Grupisanje u sekcije radi klijent kroz `@devotion/shared`.
 */

const myDayRefValidator = v.union(
  v.object({ kind: v.literal("task"), taskPageId: v.id("pages") }),
  v.object({ kind: v.literal("personal"), personalTaskId: v.id("personalTasks") }),
);

const myDayEntryValidator = v.object({
  _id: v.id("myDayEntries"),
  dayKey: v.string(),
  refKind: v.union(v.literal("task"), v.literal("personal")),
  refKey: v.string(),
  taskPageId: v.union(v.id("pages"), v.null()),
  personalTaskId: v.union(v.id("personalTasks"), v.null()),
  position: v.number(),
  createdAt: v.number(),
});

const ENTRY_NOT_FOUND = "Stavka plana nije pronađena.";
const MAX_REF_KEYS = MAX_MY_DAY_ENTRIES;

function toEntryItem(entry: Doc<"myDayEntries">) {
  return {
    _id: entry._id,
    dayKey: entry.dayKey,
    refKind: entry.refKind,
    refKey: entry.refKey,
    taskPageId: entry.taskPageId,
    personalTaskId: entry.personalTaskId,
    position: entry.position,
    createdAt: entry.createdAt,
  };
}

function assertDoneSince(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > MAX_TASK_DUE_DATE) {
    throw new Error("Početak dana nije ispravan.");
  }
  return value;
}

function assertRefKeys(refKeys: string[]) {
  if (refKeys.length > MAX_REF_KEYS) {
    throw new Error(`Najviše ${MAX_REF_KEYS} stavki odjednom.`);
  }
  return [...new Set(refKeys)];
}

export const overview = prijavljenQuery({
  args: { dayKey: v.string(), doneSince: v.number() },
  returns: v.object({
    dayKey: v.string(),
    /** Dodeljeni otvoreni ∪ planirani (bilo koji status) ∪ završeni od `doneSince`. */
    tasks: v.array(taskItemValidator),
    /** Otvoreni ∪ završeni od `doneSince` ∪ planirani. */
    personal: v.array(personalTaskItemValidator),
    /** Plan za `dayKey`, po poziciji. */
    entries: v.array(myDayEntryValidator),
    /** Plan za `[dayKey − 7, dayKey)`, najnoviji dan prvi. */
    history: v.array(myDayEntryValidator),
    /** Aktivni startupi (opseg ličnog nivoa). */
    workspaces: v.array(workspaceMiniValidator),
    capped: v.object({
      tasks: v.boolean(),
      personal: v.boolean(),
      history: v.boolean(),
    }),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const dayKey = assertDayKey(args.dayKey);
    const doneSince = assertDoneSince(args.doneSince);
    const workspaces = await listMyActiveWorkspaces(ctx, profile._id);
    const areaCache = new Map<Id<"areas">, AreaMini | null>();
    const scope = { profileId: profile._id, workspaces, areaCache };

    const tasks = new Map<Id<"pages">, TaskItem>();
    const capped = { tasks: false, personal: false, history: false };

    // 1. Moji otvoreni dodeljeni zadaci, po statusu (svaki sa svojom granicom).
    for (const [status, cap] of Object.entries(MY_DAY_STATUS_CAPS) as Array<
      [keyof typeof MY_DAY_STATUS_CAPS, number]
    >) {
      const rows = await ctx.db
        .query("taskAssignees")
        .withIndex("by_profile_status_active_sort", (q) =>
          q.eq("profileId", profile._id).eq("taskStatus", status).eq("archivedAt", null),
        )
        .order("asc")
        .take(cap);
      if (rows.length === cap) capped.tasks = true;
      for (const row of rows) {
        // Startup van opsega se preskače pre čitanja stranice.
        if (!workspaces.has(row.workspaceId) || tasks.has(row.taskPageId)) continue;
        const item = await toTaskItem(ctx, await ctx.db.get("pages", row.taskPageId), {
          ...scope,
          isAssignee: true,
        });
        if (item !== null) tasks.set(item._id, item);
      }
    }

    // 2. Završeni od `doneSince`. Red izvršioca se osvežava pri promeni statusa,
    // pa `updatedAt ≥ doneSince` je nužan uslov; stvarni trenutak završetka
    // (`completedAt`) odlučuje — izbacuje dodelu posle završetka.
    const doneRows = await ctx.db
      .query("taskAssignees")
      .withIndex("by_profile_status_active_updated", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("taskStatus", "done")
          .eq("archivedAt", null)
          .gte("updatedAt", doneSince),
      )
      .order("desc")
      .take(MY_DAY_DONE_CAP);
    if (doneRows.length === MY_DAY_DONE_CAP) capped.tasks = true;
    for (const row of doneRows) {
      if (!workspaces.has(row.workspaceId) || tasks.has(row.taskPageId)) continue;
      const item = await toTaskItem(ctx, await ctx.db.get("pages", row.taskPageId), {
        ...scope,
        isAssignee: true,
      });
      if (item !== null && item.completedAt !== null && item.completedAt >= doneSince) {
        tasks.set(item._id, item);
      }
    }

    // 3. Lični: otvoreni i završeni od `doneSince`.
    const personal = new Map<Id<"personalTasks">, PersonalTaskItem>();
    const openPersonal = await ctx.db
      .query("personalTasks")
      .withIndex("by_profile_status_archived_sort", (q) =>
        q.eq("profileId", profile._id).eq("status", "open").eq("archivedAt", null),
      )
      .order("asc")
      .take(MY_DAY_PERSONAL_OPEN_CAP);
    if (openPersonal.length === MY_DAY_PERSONAL_OPEN_CAP) capped.personal = true;
    const donePersonal = await ctx.db
      .query("personalTasks")
      .withIndex("by_profile_status_archived_completed", (q) =>
        q
          .eq("profileId", profile._id)
          .eq("status", "done")
          .eq("archivedAt", null)
          .gte("completedAt", doneSince),
      )
      .order("desc")
      .take(MY_DAY_DONE_CAP);
    if (donePersonal.length === MY_DAY_DONE_CAP) capped.personal = true;
    for (const doc of [...openPersonal, ...donePersonal]) {
      personal.set(doc._id, toPersonalTaskItem(doc));
    }

    // 4. Plan za dan i prethodnih 7 dana.
    const dayEntries = await ctx.db
      .query("myDayEntries")
      .withIndex("by_profile_day_position", (q) =>
        q.eq("profileId", profile._id).eq("dayKey", dayKey),
      )
      .order("asc")
      .take(MAX_MY_DAY_ENTRIES);
    const historyEntries = await ctx.db
      .query("myDayEntries")
      .withIndex("by_profile_day_position", (q) =>
        q
          .eq("profileId", profile._id)
          .gte("dayKey", shiftDayKey(dayKey, -MY_DAY_CARRY_OVER_DAYS))
          .lt("dayKey", dayKey),
      )
      .order("desc")
      .take(MY_DAY_HISTORY_CAP);
    if (historyEntries.length === MY_DAY_HISTORY_CAP) capped.history = true;

    // 5. Ciljevi plana koji nisu već učitani. Stavka čiji cilj više nije
    // dostupan (obrisan, arhiviran, startup van opsega, tuđ) se tiho izbacuje.
    const missingTasks = new Map<Id<"pages">, boolean>();
    const missingPersonal = new Map<Id<"personalTasks">, boolean>();
    const isResolvable = async (entry: Doc<"myDayEntries">) => {
      let ref: MyDayRef;
      try {
        ref = refOfEntry(entry);
      } catch {
        return false;
      }
      if (ref.kind === "task") {
        if (tasks.has(ref.taskPageId)) return true;
        const known = missingTasks.get(ref.taskPageId);
        if (known !== undefined) return known;
        const page = await ctx.db.get("pages", ref.taskPageId);
        // `isAssignee` se proverava tek za stranicu koja prođe opseg.
        const item = await toTaskItem(ctx, page, scope);
        if (item !== null) tasks.set(item._id, item);
        missingTasks.set(ref.taskPageId, item !== null);
        return item !== null;
      }
      if (personal.has(ref.personalTaskId)) return true;
      const known = missingPersonal.get(ref.personalTaskId);
      if (known !== undefined) return known;
      const doc = await getOwnedPersonalTask(ctx, ref.personalTaskId, profile._id);
      if (doc !== null) personal.set(doc._id, toPersonalTaskItem(doc));
      missingPersonal.set(ref.personalTaskId, doc !== null);
      return doc !== null;
    };
    const entries = [];
    for (const entry of dayEntries) {
      if (await isResolvable(entry)) entries.push(toEntryItem(entry));
    }
    const history = [];
    for (const entry of historyEntries) {
      if (await isResolvable(entry)) history.push(toEntryItem(entry));
    }

    return {
      dayKey,
      tasks: [...tasks.values()],
      personal: [...personal.values()],
      entries,
      history,
      workspaces: [...workspaces.values()],
      capped,
    };
  },
});

export const plan = prijavljenMutation({
  args: {
    dayKey: v.string(),
    ref: myDayRefValidator,
    position: v.optional(v.number()),
  },
  returns: v.object({ entryId: v.id("myDayEntries"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const dayKey = assertDayKey(args.dayKey);
    if (args.ref.kind === "task") {
      await requirePlannableTask(ctx, args.ref.taskPageId, profile._id);
    } else {
      await requireOwnedPersonalTask(ctx, args.ref.personalTaskId, profile._id);
    }
    return await appendPlanEntry(ctx, {
      profileId: profile._id,
      dayKey,
      ref: args.ref,
      position: args.position,
      now: Date.now(),
    });
  },
});

/** Vraća sve što „Poništi" treba da stavku vrati na isto mesto. */
export const unplan = prijavljenMutation({
  args: { entryId: v.id("myDayEntries") },
  returns: v.object({
    dayKey: v.string(),
    refKey: v.string(),
    ref: myDayRefValidator,
    position: v.number(),
  }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const entry = await ctx.db.get("myDayEntries", args.entryId);
    if (entry === null || entry.profileId !== profile._id) {
      throw new Error(ENTRY_NOT_FOUND);
    }
    const ref = refOfEntry(entry);
    await ctx.db.delete("myDayEntries", entry._id);
    return {
      dayKey: entry.dayKey,
      refKey: entry.refKey,
      ref,
      position: entry.position,
    };
  },
});

/**
 * Novi redosled stavki jednog dana. Stavke zadržavaju SKUP pozicija koje već
 * zauzimaju, samo im se menja raspored — delimična lista (npr. klijent koji
 * još nije video stavku dodatu sa drugog uređaja) ne meša ostale stavke.
 */
export const reorder = prijavljenMutation({
  args: { dayKey: v.string(), entryIds: v.array(v.id("myDayEntries")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const dayKey = assertDayKey(args.dayKey);
    if (args.entryIds.length > MAX_MY_DAY_ENTRIES) {
      throw new Error(`Moj dan može imati najviše ${MAX_MY_DAY_ENTRIES} stavki.`);
    }
    if (new Set(args.entryIds).size !== args.entryIds.length) {
      throw new Error("Stavka se ponavlja u redosledu.");
    }
    const entries: Doc<"myDayEntries">[] = [];
    for (const entryId of args.entryIds) {
      const entry = await ctx.db.get("myDayEntries", entryId);
      if (entry === null || entry.profileId !== profile._id) {
        throw new Error(ENTRY_NOT_FOUND);
      }
      if (entry.dayKey !== dayKey) {
        throw new Error("Sve stavke moraju biti iz istog dana.");
      }
      entries.push(entry);
    }
    const slots = entries.map((entry) => entry.position).sort((a, b) => a - b);
    for (const [index, entry] of entries.entries()) {
      if (entry.position === slots[index]) continue;
      await ctx.db.patch("myDayEntries", entry._id, { position: slots[index] });
    }
    return null;
  },
});

async function isOpenTarget(
  ctx: MutationCtx,
  ref: MyDayRef,
  profileId: Id<"profiles">,
) {
  if (ref.kind === "task") {
    const page = await getPlannableTask(ctx, ref.taskPageId, profileId);
    return page !== null && page.taskStatus !== "done";
  }
  const task = await getOwnedPersonalTask(ctx, ref.personalTaskId, profileId);
  return task !== null && task.status === "open";
}

/**
 * „Vrati u danas": izabrane stavke iz prethodnih 7 dana prelaze u plan za
 * `dayKey` (stare stavke se brišu). Preskače se ref bez stare stavke u
 * prozoru i ref čiji cilj više nije otvoren ili dostupan.
 */
export const carryOver = prijavljenMutation({
  args: { dayKey: v.string(), refKeys: v.array(v.string()) },
  returns: v.object({ moved: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const dayKey = assertDayKey(args.dayKey);
    const fromDayKey = shiftDayKey(dayKey, -MY_DAY_CARRY_OVER_DAYS);
    const now = Date.now();
    let moved = 0;
    for (const refKey of assertRefKeys(args.refKeys)) {
      const ref = parseRefKey(ctx, refKey);
      if (ref === null || refKeyOf(ref) !== refKey) continue;
      const old = await ctx.db
        .query("myDayEntries")
        .withIndex("by_profile_ref", (q) =>
          q
            .eq("profileId", profile._id)
            .eq("refKey", refKey)
            .gte("dayKey", fromDayKey)
            .lt("dayKey", dayKey),
        )
        .take(MY_DAY_CARRY_OVER_DAYS);
      if (old.length === 0) continue;
      if (!(await isOpenTarget(ctx, ref, profile._id))) continue;
      await appendPlanEntry(ctx, { profileId: profile._id, dayKey, ref, now });
      for (const entry of old) await ctx.db.delete("myDayEntries", entry._id);
      moved += 1;
    }
    return { moved };
  },
});

/**
 * „Skloni": briše moje stavke iz prethodnih 7 dana (sve, ili samo zadate
 * `refKeys`). Plan za `dayKey` i stariji dani se ne diraju.
 */
export const clearOld = prijavljenMutation({
  args: { dayKey: v.string(), refKeys: v.optional(v.array(v.string())) },
  returns: v.object({ removed: v.number() }),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const dayKey = assertDayKey(args.dayKey);
    const only =
      args.refKeys === undefined ? null : new Set(assertRefKeys(args.refKeys));
    const entries = await ctx.db
      .query("myDayEntries")
      .withIndex("by_profile_day_position", (q) =>
        q
          .eq("profileId", profile._id)
          .gte("dayKey", shiftDayKey(dayKey, -MY_DAY_CARRY_OVER_DAYS))
          .lt("dayKey", dayKey),
      )
      .take(MY_DAY_HISTORY_CAP * 2);
    let removed = 0;
    for (const entry of entries) {
      if (only !== null && !only.has(entry.refKey)) continue;
      await ctx.db.delete("myDayEntries", entry._id);
      removed += 1;
    }
    return { removed };
  },
});
