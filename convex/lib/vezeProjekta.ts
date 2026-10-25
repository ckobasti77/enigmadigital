import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Provider } from "./providers";
import type { VezaZaZdravlje } from "./zdravljeVeza";

/**
 * Veze jednog projekta sa poslednjim prolazom sinhronizacije — ulaz za
 * zdravlje veza (birač: `projekti.stanjeProjekata`; hub: `hubStore`).
 * Čita samo preko indeksa sa `workspaceId`; veza u prekidu se preskače.
 */
export const MAKS_VEZA = 50;
/** Koliko teksta poslednje greške prolaza ide na ekran. */
const GRESKA_MAKS = 140;

export type VezaProjekta = VezaZaZdravlje & {
  provider: Provider;
  /** Poslednja greška prolaza (skraćena), ako je poslednji prolaz pao. */
  greska: string | null;
};

export async function citajVezeProjekta(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
): Promise<VezaProjekta[]> {
  const veze = await ctx.db
    .query("connections")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId))
    .take(MAKS_VEZA);
  const out: VezaProjekta[] = [];
  for (const veza of veze) {
    if (veza.status === "disconnecting") continue;
    const prolaz = await ctx.db
      .query("syncRuns")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", veza.provider),
      )
      .order("desc")
      .first();
    const greska =
      prolaz?.status === "error" && prolaz.error ? prolaz.error.slice(0, GRESKA_MAKS) : null;
    out.push({
      provider: veza.provider,
      status: veza.status,
      expiresAt: veza.expiresAt,
      lastSyncAt: veza.lastSyncAt,
      poslednjiProlaz:
        prolaz === null
          ? null
          : { status: prolaz.status, startedAt: prolaz.startedAt, finishedAt: prolaz.finishedAt },
      greska,
    });
  }
  return out;
}
