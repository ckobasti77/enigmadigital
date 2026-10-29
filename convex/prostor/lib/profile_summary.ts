// Preneto iz Devotion packages/backend/convex/lib/profile_summary.ts (main @ c05c40f), SPAJANJE S03.
import { v } from "convex/values";

import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;

export const profileSummaryValidator = v.object({
  _id: v.id("profiles"),
  displayName: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

/** Minimalan profil za prikaz — ime i potpisan URL avatara, bez ostatka reda. */
export async function getProfileSummary(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
) {
  const profile = await ctx.db.get("profiles", profileId);
  if (profile === null) return null;
  const avatarUrl =
    profile.avatarStorageId === undefined
      ? null
      : await ctx.storage.getUrl(profile.avatarStorageId);
  return {
    _id: profile._id,
    displayName: profile.displayName,
    avatarUrl,
  };
}
