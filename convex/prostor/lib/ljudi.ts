import type { Doc, Id } from "../../_generated/dataModel";
import { clanstvoProfila, type Clanstvo, type ReadCtx } from "./auth";
import { listMyActiveWorkspaces, type WorkspaceMini } from "./my_scope";
import { CHAT_PEOPLE_CAP } from "./validators";

/**
 * Ljudi u radnom delu (SPAJANJE, P9, plan S01 §3.3). Devotion je pokazivao sve
 * profile; ovde su to samo ljudi sa kojima pozivalac deli projekat kao `owner`
 * ili `urednik`. `client_viewer` se nikad ne pojavljuje (O5), a duplikat reda u
 * `members` se broji jednom (C19).
 */

export type ClanProjekta = { membership: Clanstvo; profile: Doc<"profiles"> };

/**
 * Članovi projekta za dodelu, pominjanje i kanal: `owner`/`urednik` sa aktivnim
 * profilom, bez duplikata po korisniku. Ko još nema profil (nije otvorio radni
 * deo) se preskače.
 */
export async function aktivniClanoviProjekta(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  limit: number,
): Promise<ClanProjekta[]> {
  const redovi = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(limit * 2);
  const out: ClanProjekta[] = [];
  const videni = new Set<Id<"users">>();
  for (const red of redovi) {
    if (red.role === "client_viewer" || videni.has(red.userId)) continue;
    videni.add(red.userId);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", red.userId))
      .first();
    if (profile === null || profile.archivedAt !== null) continue;
    out.push({ membership: red as Clanstvo, profile });
    if (out.length === limit) break;
  }
  return out;
}

/**
 * P9: aktivni profili koji sa pozivaocem dele bar jedan projekat kao
 * `owner`/`urednik`, bez njega samog, sortirani po imenu. `zajedno` su
 * zajednički projekti (podnaslov „Zajedno: A, B“).
 */
export async function ljudiSaKojimaDelim(
  ctx: ReadCtx,
  profile: Doc<"profiles">,
  cap: number = CHAT_PEOPLE_CAP,
): Promise<Array<{ profile: Doc<"profiles">; zajedno: WorkspaceMini[] }>> {
  const projekti = await listMyActiveWorkspaces(ctx, profile._id);
  const poProfilu = new Map<Id<"profiles">, { profile: Doc<"profiles">; zajedno: WorkspaceMini[] }>();
  for (const [workspaceId, mini] of projekti) {
    for (const clan of await aktivniClanoviProjekta(ctx, workspaceId, cap)) {
      if (clan.profile._id === profile._id) continue;
      const postoji = poProfilu.get(clan.profile._id);
      if (postoji !== undefined) postoji.zajedno.push(mini);
      else if (poProfilu.size < cap) poProfilu.set(clan.profile._id, { profile: clan.profile, zajedno: [mini] });
    }
  }
  return [...poProfilu.values()].sort((a, b) =>
    a.profile.displayName.localeCompare(b.profile.displayName, "sr-Latn"),
  );
}

/**
 * P9: da li pozivalac deli bar jedan aktivan projekat sa drugim profilom (oba
 * `owner`/`urednik`). Važi za nov lični razgovor i novog člana lične grupe, da
 * spisak ljudi ne bi mogao da se zaobiđe poznatim ID-jem profila.
 */
export async function delimProjekatSa(
  ctx: ReadCtx,
  profile: Doc<"profiles">,
  drugiProfileId: Id<"profiles">,
): Promise<boolean> {
  const projekti = await listMyActiveWorkspaces(ctx, profile._id);
  for (const workspaceId of projekti.keys()) {
    if ((await clanstvoProfila(ctx, workspaceId, drugiProfileId)) !== null) return true;
  }
  return false;
}
