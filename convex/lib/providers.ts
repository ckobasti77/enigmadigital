import { v } from "convex/values";

/**
 * The set of integrations the command center syncs from (PLAN.md §3).
 * Single source of truth — reused by the `connections` and `syncRuns` tables
 * and by every function that takes a provider argument.
 */
export const providerValidator = v.union(
  v.literal("ga4"),
  v.literal("meta_ig"),
  // Facebook Page (F5). A separate connection from `meta_ig` even though both
  // live in the same Meta app: the credential is a Page Access Token, which is
  // a different token for a different node.
  v.literal("meta_fb"),
  v.literal("meta_ads"),
  v.literal("google_ads"),
  v.literal("youtube"),
  v.literal("openreply"),
);

export type Provider =
  | "ga4"
  | "meta_ig"
  | "meta_fb"
  | "meta_ads"
  | "google_ads"
  | "youtube"
  | "openreply";

/** V1 providers that have a Settings entry point in M2. */
export const ALL_PROVIDERS: Provider[] = [
  "ga4",
  "meta_ig",
  "meta_fb",
  "meta_ads",
  "google_ads",
  "youtube",
  "openreply",
];
