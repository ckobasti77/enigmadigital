import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type Membership = {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  role: "owner" | "client_viewer";
};

/**
 * Resolve the signed-in user's workspace membership, or throw. Use in every
 * write / privileged read (`connections`, `sync`). Reads return `null` on
 * unauth (see `workspaces.currentContext`), but a mutation can't silently
 * no-op, so we throw a `ConvexError` the client can branch on.
 *
 * Accepts a `MutationCtx` too (it's structurally assignable to `QueryCtx`).
 */
export async function requireMembership(ctx: QueryCtx): Promise<Membership> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError({ code: "unauthorized" });
  }
  const membership = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (membership === null) {
    throw new ConvexError({ code: "forbidden" });
  }
  return {
    userId,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

/**
 * Membership in ONE named workspace, or throw.
 *
 * `requireMembership` answers "which workspace is mine" and a function that
 * then reads `args.workspaceId` instead of that answer trusts whatever the
 * caller sent — any signed-in user could read or write another workspace by
 * passing its id. Every function that takes a `workspaceId` from the client
 * checks it here: the caller must be a member of exactly that workspace.
 *
 * Same error shape as `requireMembership` (`unauthorized` / `forbidden`).
 */
export async function requireMembershipIn(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
): Promise<Membership> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError({ code: "unauthorized" });
  }
  // A user has a handful of memberships at most; the index narrows to them.
  const memberships = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(100);
  const membership = memberships.find((m) => m.workspaceId === workspaceId);
  if (membership === undefined) {
    throw new ConvexError({
      code: "forbidden",
      message: "Nemaš pristup ovom projektu.",
    });
  }
  return { userId, workspaceId, role: membership.role };
}

/**
 * The workspace a call is about: the one passed in (the caller must be a
 * member of it) or, when none is passed, the caller's own
 * (`requireMembership`). For functions whose `workspaceId` argument is
 * optional — leaving it out keeps today's behaviour, passing someone else's is
 * refused.
 */
export async function requireWorkspaceAccess(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces"> | undefined,
): Promise<Membership> {
  return workspaceId === undefined
    ? await requireMembership(ctx)
    : await requireMembershipIn(ctx, workspaceId);
}

/**
 * `requireWorkspaceAccess` for an action, which has no `ctx.db`: the signed-in
 * user comes from the auth token, the membership check runs in
 * `adActionsStore.resolveUserWorkspace`.
 */
export async function requireActionMembership(
  ctx: ActionCtx,
  workspaceId?: Id<"workspaces">,
): Promise<Membership> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError({ code: "unauthorized", message: "Niste prijavljeni." });
  }
  const resolved: {
    workspaceId: Id<"workspaces">;
    role: Membership["role"];
  } = await ctx.runQuery(internal.adActionsStore.resolveUserWorkspace, {
    userId,
    explicitWorkspaceId: workspaceId,
  });
  return { userId, workspaceId: resolved.workspaceId, role: resolved.role };
}

/**
 * Same as `requireMembership`, but refuses anyone who is not the workspace
 * owner.
 *
 * `requireMembership` answers "is this person in the workspace" and hands back
 * the role without ever looking at it — which meant `client_viewer`, a role
 * that exists in order to only look at things, could press "Prekini vezu" and
 * erase a workspace's entire YouTube dataset for good (P3). Irreversible and
 * workspace-wide is exactly the pair that needs the stricter check, so
 * disconnecting and purging go through here.
 *
 * The message is deliberately plain: the UI hides the button from anyone who
 * would hit this, so a person who sees it got here some other way.
 */
export async function requireOwner(ctx: QueryCtx): Promise<Membership> {
  const membership = await requireMembership(ctx);
  if (membership.role !== "owner") {
    throw new ConvexError({
      code: "forbidden",
      message: "Ovu radnju može da izvede samo vlasnik radnog prostora.",
    });
  }
  return membership;
}

/**
 * Obriši SVE što jednom `users` redu omogućava prijavu: `authAccounts` (i
 * `authVerificationCodes` vezane za svaki nalog), `authSessions` (i
 * `authRefreshTokens` vezane za svaku sesiju). `users` red se NE dira — o njemu
 * odlučuje pozivalac (Deo 2 ga briše jer je registracija poluispečena; Deo 3 ga
 * čuva jer `leadStageEvents.actorUserId` i istorija pokazuju na njega).
 *
 * Zašto i sesije/tokeni, a ne samo nalozi: brisanje `authAccounts` sprečava
 * NOVU prijavu, ali već izdata sesija/refresh token bi i dalje živeli do isteka.
 * Da bi „ne može više da uđe" bilo istina odmah, gase se i oni.
 *
 * Indeksi su iz `authTables` (@convex-dev/auth): `authAccounts.userIdAndProvider`
 * (`.eq("userId", …)` je validan prefiks), `authVerificationCodes.accountId`,
 * `authSessions.userId`, `authRefreshTokens.sessionId`.
 */
export async function deleteLoginMachinery(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const accounts = await ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
    .collect();
  for (const account of accounts) {
    const codes = await ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))
      .collect();
    for (const code of codes) await ctx.db.delete(code._id);
    await ctx.db.delete(account._id);
  }

  const sessions = await ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .collect();
  for (const session of sessions) {
    const tokens = await ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }
}
