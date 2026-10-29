import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/**
 * Dostava obaveštenja van transakcije (web push i Expo push), plan S01 D6.
 *
 * `createNotification` je jedini put kojim obaveštenje ulazi u sistem i zove
 * ovu funkciju posle upisa reda. Moduli `push` i `expoPush` stižu tek u S06,
 * pa do tada obaveštenje ostaje samo u Inboxu: referenca na modul koji ne
 * postoji bi oborila typecheck, a u produkciji i sam upis. S06 ovde zakazuje
 * `internal.prostor.push.deliver` i `internal.prostor.expoPush.deliver` (svaki
 * svojim `runAfter(0, …)`, da pad jedne grane ne dira drugu) i dodaje test.
 */
export async function zakaziDostavu(
  ctx: MutationCtx,
  notificationId: Id<"notifications">,
): Promise<void> {
  void ctx;
  void notificationId;
}
