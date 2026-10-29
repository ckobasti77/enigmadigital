import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

/**
 * Dostava obaveštenja van transakcije (web push i Expo push), plan S01 D6.
 *
 * `createNotification` je jedini put kojim obaveštenje ulazi u sistem i zove
 * ovu funkciju posle upisa reda. Mreža ne sme da blokira ni da obori upis, pa
 * dostava ide kroz zakazane akcije. Dve nezavisne grane iz iste tačke:
 *   push.deliver     → web (VAPID); bez `VAPID_*` promenljivih se tiho preskače
 *   expoPush.deliver → telefon (Expo); bez sačuvanih tokena ne šalje ništa (P22)
 * Odvojeni `runAfter` poslovi znače da pad jedne grane ne dira drugu.
 */
export async function zakaziDostavu(
  ctx: MutationCtx,
  notificationId: Id<"notifications">,
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.prostor.push.deliver, { notificationId });
  await ctx.scheduler.runAfter(0, internal.prostor.expoPush.deliver, { notificationId });
}
