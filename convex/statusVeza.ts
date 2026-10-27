import { v } from "convex/values";
import { projekatQuery } from "./lib/projekat";
import { connectionStatusValidator, providerValidator } from "./lib/providers";
import { citajUlazeStatusa } from "./lib/vezeProjekta";
import type { RedStatusa } from "./lib/statusVeze";

const redValidator = v.object({
  provider: providerValidator,
  status: connectionStatusValidator,
  expiresAt: v.union(v.number(), v.null()),
  lastSyncAt: v.union(v.number(), v.null()),
  poslednjiProlaz: v.union(
    v.object({
      status: v.union(v.literal("running"), v.literal("ok"), v.literal("error")),
      startedAt: v.number(),
      finishedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  poslednjiPodatak: v.union(v.number(), v.null()),
  serverPodesen: v.union(v.boolean(), v.null()),
  poslednjiUspeh: v.union(v.number(), v.null()),
});

/**
 * Činjenice iz kojih se izvodi jedan status svake veze projekta (P3). Upit ne
 * čita sat: status, „podaci od …" i rokovi se računaju na ekranu, istom
 * funkcijom (`statusVeze`) kojom zvono računa na serveru, pa se broj u tački i
 * rečenica u zvonu ne razilaze ni kad vreme prođe bez promene u bazi.
 *
 * Vidi ga svaki član projekta: tačka stanja stoji u ljusci svakog ekrana.
 */
export const lista = projekatQuery({
  args: {},
  returns: v.array(redValidator),
  handler: async (ctx): Promise<RedStatusa[]> => {
    return await citajUlazeStatusa(ctx, ctx.projekat.workspaceId);
  },
});
