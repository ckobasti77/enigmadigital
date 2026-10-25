import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { RezultatRezervacije } from "../globalneKvoteStore";

/**
 * YouTube izmene iz akcija (titlovi, sličice, plejliste, video, ručno brisanje
 * komentara). Akcija nema `db`, pa rezervacija ide kroz jednu internu mutaciju
 * koja u istoj transakciji knjiži deo projekta i zajednički brojač svih
 * projekata (`globalneKvoteStore.rezervisi`).
 *
 * Redosled je uvek isti: `rezervisiIzmenu` PRE poziva API-ja, `vratiIzmenu`
 * samo kad zahtev nije ni stigao do Google-a (status 0: DNS, TLS, prekinuta
 * veza). Svaki odgovor Google-a, i neuspešan, troši jedinice.
 */
export async function rezervisiIzmenu(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  trosak: number,
): Promise<RezultatRezervacije> {
  return await ctx.runMutation(internal.globalneKvoteStore.rezervisi, {
    kljuc: "youtube",
    klasa: "izmene",
    workspaceId,
    trosak,
  });
}

/** Vrati rezervisane jedinice poziva koji nije stigao do Google-a. */
export async function vratiIzmenu(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  trosak: number,
): Promise<void> {
  if (trosak <= 0) return;
  await ctx.runMutation(internal.globalneKvoteStore.vrati, {
    kljuc: "youtube",
    klasa: "izmene",
    workspaceId,
    trosak,
  });
}
