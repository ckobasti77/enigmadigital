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
  v.literal("threads"),
);

export type Provider =
  | "ga4"
  | "meta_ig"
  | "meta_fb"
  | "meta_ads"
  | "google_ads"
  | "youtube"
  | "openreply"
  | "threads";

/** V1 providers that have a Settings entry point in M2. */
export const ALL_PROVIDERS: Provider[] = [
  "ga4",
  "meta_ig",
  "meta_fb",
  "meta_ads",
  "google_ads",
  "youtube",
  "openreply",
  "threads",
];

/**
 * The lifecycle of one `connections` row.
 *
 * `disconnecting` was added in P3 and is the reason this union lives here
 * rather than being typed out at each use site: the row is no longer deleted at
 * the moment somebody presses "Prekini vezu". The credentials are destroyed and
 * the erasure begins, but the row itself stays — it is the only thing left that
 * says this workspace still holds provider data, and every query that reports
 * connection state has to be able to say so. Four copies of the union in four
 * files is how one of them ends up not being able to.
 */
export const connectionStatusValidator = v.union(
  v.literal("active"),
  v.literal("error"),
  v.literal("expired"),
  v.literal("disconnecting"),
);

export type ConnectionStatus =
  | "active"
  | "error"
  | "expired"
  | "disconnecting";
