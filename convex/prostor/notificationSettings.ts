// Preneto iz Devotion packages/backend/convex/notificationSettings.ts (main @ c05c40f), SPAJANJE S06.
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

import { requireProfile } from "./lib/auth";
import { ALL_SETTINGS_TYPES } from "./lib/notificationSettingsCatalog";
import { notificationTypeValidator } from "./lib/validators";
import { prijavljenMutation, prijavljenQuery } from "../lib/projekat";

/**
 * Podešavanja obaveštenja PO PROFILU (docs/mobile/03-NOTIFIKACIJE.md sekcija 7).
 * Jedan izvor istine koji čita i web (`push.ts`) i native (`expoPush.ts`)
 * dostava, pa isključen tip važi svuda — na svakom uređaju i browseru.
 *
 * Tihi sati se ovde samo ČUVAJU; primenjuju se na serveru u trenutku dostave
 * (akcija čita sat, upit ne sme). `mention` i `deadline` ih probijaju — to je
 * namerno i sprovedeno u obe grane preko `typeBreaksQuietHours`.
 */

const MINUTES_IN_DAY = 1_440;

/** Gornja granica dužine `mutedTypes` — svih poznatih tipova nema više od ovoga. */
const MAX_MUTED_TYPES = 32;

const settingsValidator = v.object({
  mutedTypes: v.array(notificationTypeValidator),
  quietHoursStart: v.union(v.number(), v.null()),
  quietHoursEnd: v.union(v.number(), v.null()),
});

function validateQuietMinute(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value >= MINUTES_IN_DAY) {
    throw new Error(`${label} mora biti minut u danu (0–1439).`);
  }
  return value;
}

/**
 * Podešavanja profila, ili podrazumevano stanje (ništa utišano, bez tihih sati)
 * kad red još ne postoji. Deljeno između javnog `get` upita i internih upita
 * dostave da bi obe grane videle isto.
 */
export async function readSettings(
  ctx: QueryCtx,
  profileId: Id<"profiles">,
): Promise<{
  mutedTypes: Array<(typeof ALL_SETTINGS_TYPES)[number]>;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}> {
  const row = await ctx.db
    .query("notificationSettings")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .unique();
  if (row === null) {
    return { mutedTypes: [], quietHoursStart: null, quietHoursEnd: null };
  }
  return {
    mutedTypes: row.mutedTypes,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
  };
}

/** Tekuća podešavanja prijavljenog korisnika (za ekran/dijalog podešavanja). */
export const get = prijavljenQuery({
  args: {},
  returns: settingsValidator,
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return await readSettings(ctx, profile._id);
  },
});

/**
 * Upisuje podešavanja prijavljenog korisnika (upsert po profilu). Tihi sati su
 * prozor: ili oba kraja postavljena, ili oba prazna. Primenjuje se odmah na sve
 * uređaje jer obe grane dostave čitaju ovaj isti red.
 */
export const update = prijavljenMutation({
  args: {
    mutedTypes: v.array(notificationTypeValidator),
    quietHoursStart: v.union(v.number(), v.null()),
    quietHoursEnd: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);

    if (args.mutedTypes.length > MAX_MUTED_TYPES) {
      throw new Error("Previše utišanih tipova.");
    }
    const mutedTypes = [...new Set(args.mutedTypes)];

    if ((args.quietHoursStart === null) !== (args.quietHoursEnd === null)) {
      throw new Error("Tihi sati moraju imati i početak i kraj.");
    }
    const quietHoursStart =
      args.quietHoursStart === null
        ? null
        : validateQuietMinute(args.quietHoursStart, "Početak tihih sati");
    const quietHoursEnd =
      args.quietHoursEnd === null
        ? null
        : validateQuietMinute(args.quietHoursEnd, "Kraj tihih sati");

    const existing = await ctx.db
      .query("notificationSettings")
      .withIndex("by_profileId", (q) => q.eq("profileId", profile._id))
      .unique();

    const now = Date.now();
    if (existing === null) {
      await ctx.db.insert("notificationSettings", {
        profileId: profile._id,
        mutedTypes,
        quietHoursStart,
        quietHoursEnd,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch("notificationSettings", existing._id, {
        mutedTypes,
        quietHoursStart,
        quietHoursEnd,
        updatedAt: now,
      });
    }
    return null;
  },
});
