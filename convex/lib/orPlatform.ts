/**
 * Pure helpers for the platform an OpenReply event belongs to (F5).
 * No Convex imports beyond the validator builder.
 *
 * Everything in the engine — automations, logs, conversations, dedup rows —
 * carries an OPTIONAL `platform`. Optional is the whole trick: every row
 * written before Facebook existed has none, and `resolvePlatform` reads that
 * absence as "instagram". No migration, and an automation nobody has touched
 * keeps firing on exactly the events it fired on yesterday.
 */

import { v } from "convex/values";

/** Where an event actually happened. An event is never "both". */
export type OrPlatform = "instagram" | "facebook";

/** What an automation listens to. An automation MAY be "both". */
export type AutomationPlatform = OrPlatform | "both";

export const orPlatformValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
);

export const automationPlatformValidator = v.union(
  v.literal("instagram"),
  v.literal("facebook"),
  v.literal("both"),
);

/** Undefined means "instagram" — the pre-Facebook default, everywhere. */
export function resolvePlatform(raw: string | undefined | null): OrPlatform {
  return raw === "facebook" ? "facebook" : "instagram";
}

/** Same rule for an automation, which may also say "both". */
export function resolveAutomationPlatform(
  raw: string | undefined | null,
): AutomationPlatform {
  if (raw === "facebook") return "facebook";
  if (raw === "both") return "both";
  return "instagram";
}

/**
 * Does this automation listen to events from this platform?
 *
 * Applied BEFORE the keyword matcher, never after: keywords do not depend on
 * the platform, so an automation that is not for this platform must never be
 * considered at all — otherwise the first Facebook-only automation in the list
 * would swallow an Instagram comment it happens to match.
 */
export function automationHandles(
  automationPlatform: string | undefined | null,
  event: OrPlatform,
): boolean {
  const resolved = resolveAutomationPlatform(automationPlatform);
  return resolved === "both" || resolved === event;
}

/** The provider whose `connections` row holds the token for this platform. */
export function platformProvider(platform: OrPlatform): "meta_ig" | "meta_fb" {
  return platform === "facebook" ? "meta_fb" : "meta_ig";
}

// ── Vocabulary ───────────────────────────────────────────────────────────────
//
// Written once here so the automation card, the log table and the editor all
// say the same words. An icon alone does not identify a platform (F5 §5), so
// every one of those places prints the label too.

export const PLATFORM_LABELS: Record<AutomationPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  both: "Instagram + Facebook",
};

/** Short form for a badge that sits next to other badges. */
export const PLATFORM_SHORT_LABELS: Record<AutomationPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  both: "IG + FB",
};
