import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { Provider } from "./providers";
import type { VezaZaZdravlje } from "./zdravljeVeza";
import type { RedStatusa } from "./statusVeze";
import { serverPodesen } from "./serverPodesen";

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

/** Koliko poslednjih prolaza se čita da bi se našao poslednji uspeh (kao zvono). */
const PROLAZA_ZA_USPEH = 40;

/**
 * Ulaz za jedan status veze (`statusVeze.ts`): tačka u gornjoj traci, kanali,
 * Podešavanja i zvono čitaju baš ovo. Za razliku od `citajVezeProjekta`:
 *   - veza u prekidu se VRAĆA (status kaže „brisanje u toku", ne ćuti);
 *   - poslednji USPEH se traži u paketu od 40 prolaza, pa „ne sinhronizuje
 *     se 3 dana" meri starost podataka, ne starost poslednjeg pada;
 *   - `poslednjiPodatak` je najnoviji `metaSyncJobs.lastDataAt` provajdera
 *     (mali ciljani prolazi upisuju podatke bez reda u `syncRuns`);
 *   - `serverPodesen` kaže da li server ima ono bez čega veza ne radi.
 */
export async function citajUlazeStatusa(
  ctx: Pick<QueryCtx, "db">,
  workspaceId: Id<"workspaces">,
): Promise<RedStatusa[]> {
  const veze = await ctx.db
    .query("connections")
    .withIndex("by_workspace_provider", (q) => q.eq("workspaceId", workspaceId))
    .take(MAKS_VEZA);

  const poslednjiPodatak = new Map<string, number>();
  const poslovi = await ctx.db
    .query("metaSyncJobs")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(200);
  for (const posao of poslovi) {
    if (posao.lastDataAt === undefined) continue;
    const dosad = poslednjiPodatak.get(posao.provider) ?? 0;
    if (posao.lastDataAt > dosad) poslednjiPodatak.set(posao.provider, posao.lastDataAt);
  }

  const out: RedStatusa[] = [];
  for (const veza of veze) {
    const prolazi = await ctx.db
      .query("syncRuns")
      .withIndex("by_workspace_provider", (q) =>
        q.eq("workspaceId", workspaceId).eq("provider", veza.provider),
      )
      .order("desc")
      .take(PROLAZA_ZA_USPEH);
    const prolaz = prolazi.length > 0 ? prolazi[0] : null;
    const uspeh = prolazi.find((r) => r.status === "ok");
    out.push({
      provider: veza.provider,
      status: veza.status,
      expiresAt: veza.expiresAt ?? null,
      lastSyncAt: veza.lastSyncAt ?? null,
      poslednjiProlaz:
        prolaz === null
          ? null
          : {
              status: prolaz.status,
              startedAt: prolaz.startedAt,
              finishedAt: prolaz.finishedAt ?? null,
            },
      poslednjiPodatak: poslednjiPodatak.get(veza.provider) ?? null,
      // Stranica povezana trajnim tokenom sistemskog korisnika ne zavisi od
      // Meta aplikacije na serveru: nema šta da se osvežava (`authMode`).
      serverPodesen:
        veza.provider === "meta_fb" && veza.authMode === "system_user"
          ? null
          : serverPodesen(veza.provider),
      poslednjiUspeh: uspeh?.finishedAt ?? veza.lastSyncAt ?? null,
    });
  }
  return out;
}
