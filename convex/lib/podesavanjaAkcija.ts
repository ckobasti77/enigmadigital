import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { decryptCredentials } from "./crypto";
import { tajnaIzEnva, type PodesavanjaProjekta } from "./podesavanja";
import type { KljucTajne } from "./podesavanjaPravila";

/**
 * Podešavanja projekta za akcije (nemaju `ctx.db`), plan C10 §4.2. Isto
 * pravilo kao `podesavanjaProjekta`: vrednost projekta, env samo za osnivački
 * projekat, inače „nije podešeno“.
 */
export async function podesavanjaZaAkciju(
  ctx: Pick<ActionCtx, "runQuery">,
  workspaceId: Id<"workspaces">,
): Promise<PodesavanjaProjekta> {
  return await ctx.runQuery(internal.podesavanjaStore.zaAkciju, { workspaceId });
}

/**
 * Tekst tajne projekta, samo u memoriji akcije. Interni upit vraća šifrat (ili
 * „uzmi iz env-a“ za osnivački projekat bez svoje tajne); dešifruje se ovde.
 * `null` = tajna nije podešena. Vrednost se nikad ne loguje.
 */
export async function procitajTajnu(
  ctx: Pick<ActionCtx, "runQuery">,
  workspaceId: Id<"workspaces">,
  kljuc: KljucTajne,
): Promise<string | null> {
  const red: { sifrovano: string } | { izEnva: true } | null = await ctx.runQuery(
    internal.podesavanjaStore.tajnaZaAkciju,
    { workspaceId, kljuc },
  );
  if (red === null) return null;
  if ("izEnva" in red) return tajnaIzEnva(kljuc);
  try {
    return await decryptCredentials(red.sifrovano);
  } catch {
    console.error(`Tajna „${kljuc}“ projekta ne može da se dešifruje; upiši je ponovo u Podešavanjima.`);
    return null;
  }
}
