import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/*
 * Pristup po projektu više ne ide ovuda: pomoćne funkcije „prvo članstvo“
 * (C01–C06) zamenili su omotači iz `./projekat.ts` (PROJEKTI-PLAN §5, C07).
 * Ovde je ostalo samo gašenje prijave jednog naloga.
 */

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
