import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import {
  jeVlasnikPlatforme,
  PORUKE,
  requireProjekat,
  type Korisnik,
  type Projekat,
} from "../../lib/projekat";

/**
 * ============================================================================
 * ADAPTER IDENTITETA RADNOG DELA (SPAJANJE, plan S01 §3.1)
 * ============================================================================
 *
 * Devotion je pitao `startups` / `startupMembers` / `profiles.role`. U Enigmi
 * je projekat `workspaces`, članstvo `members` (uloga po projektu), a globalni
 * „admin“ je vlasnik platforme (P7). Adapter zadržava Devotion imena tamo gde to
 * štedi izmene, a preneseni moduli ne čitaju `members` ni `workspaces` sami.
 *
 * Javne funkcije idu kroz omotače iz `convex/lib/projekat.ts` (P8):
 * - projektna (`projekat*`, `uloga: "urednik"`): `ctx.projekat` je proveren, pa
 *   `requireClanProjekta(ctx, doc.workspaceId)` ujedno proverava da dokument iz
 *   argumenta pripada TOM projektu;
 * - lična (`prijavljen*`): adapter sam proverava članstvo u projektu dokumenta
 *   (bar urednik).
 *
 * `client_viewer` nikad ne ulazi u radni deo (O5). Nad `members` nikad ne ide
 * `.unique()`: duplikat reda ne sme da zaključa člana (C19).
 * ============================================================================
 */

/** Običan kontekst ili kontekst koji je napravio omotač iz `lib/projekat.ts`. */
export type ReadCtx = (QueryCtx | MutationCtx) & {
  projekat?: Projekat;
  korisnik?: Korisnik;
};

/** Članstvo u radnom delu: nikad `client_viewer` (O5). */
export type Clanstvo = Doc<"members"> & { role: "owner" | "urednik" };

export type Actor = {
  profile: Doc<"profiles">;
  workspace: Doc<"workspaces">;
  membership: Clanstvo;
  /** `owner` ovog projekta ili vlasnik platforme (P7). */
  isManager: boolean;
};

export const PORUKE_PROSTORA = {
  nemaProfila: {
    code: "nema_profila",
    message: "Profil još nije spreman. Osveži stranicu.",
  },
  tudjiProjekat: {
    code: "not_found",
    message: "Stavka nije pronađena u ovom projektu.",
  },
  projekatNijeDostupan: { code: "not_found", message: "Projekat nije pronađen." },
  clanNijeUProjektu: {
    code: "forbidden",
    message: "Dodeljeni član mora pripadati ovom projektu.",
  },
  clanNijePronadjen: { code: "not_found", message: "Član tima nije pronađen." },
} as const;

function jeClanRadnogDela(clan: Doc<"members"> | null): clan is Clanstvo {
  return clan !== null && (clan.role === "owner" || clan.role === "urednik");
}

/** Prijavljen korisnik: iz omotača, inače iz sesije; ili `null`. */
async function korisnikIliNull(ctx: ReadCtx): Promise<Id<"users"> | null> {
  return ctx.projekat?.userId ?? ctx.korisnik?.userId ?? (await getAuthUserId(ctx));
}

async function profilPoKorisniku(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles"> | null> {
  return await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

/** Profil pozivaoca ili `null` (nije prijavljen, nema profil, deaktiviran). */
export async function getCurrentProfile(
  ctx: ReadCtx,
): Promise<Doc<"profiles"> | null> {
  const userId = await korisnikIliNull(ctx);
  if (userId === null) return null;
  const profile = await profilPoKorisniku(ctx, userId);
  return profile !== null && profile.archivedAt === null ? profile : null;
}

/** Profil pozivaoca; bez profila baca `nema_profila` (pravi ga `ensureCurrent`). */
export async function requireProfile(ctx: ReadCtx): Promise<Doc<"profiles">> {
  const userId = await korisnikIliNull(ctx);
  if (userId === null) throw new ConvexError(PORUKE.nijePrijavljen);
  return await requireProfilKorisnika(ctx, userId);
}

/** Profil zadatog korisnika (interne funkcije i akcije dobijaju `userId`). */
export async function requireProfilKorisnika(
  ctx: ReadCtx,
  userId: Id<"users">,
): Promise<Doc<"profiles">> {
  const profile = await profilPoKorisniku(ctx, userId);
  if (profile === null || profile.archivedAt !== null) {
    throw new ConvexError(PORUKE_PROSTORA.nemaProfila);
  }
  return profile;
}

/**
 * Zamena za Devotion `requireStartupMember`. Pozivalac je `owner`/`urednik` u
 * projektu `workspaceId`, projekat nije arhiviran, a pozivalac ima profil.
 */
export async function requireClanProjekta(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
): Promise<Actor> {
  let projekat: Projekat;
  if (ctx.projekat !== undefined) {
    // Omotač je već proverio članstvo i ulogu. Dokument iz argumenta mora biti
    // iz TOG projekta; tuđ projekat = „nije pronađeno“.
    if (ctx.projekat.workspaceId !== workspaceId) {
      throw new ConvexError(PORUKE_PROSTORA.tudjiProjekat);
    }
    projekat = ctx.projekat;
  } else {
    projekat = await requireProjekat(ctx, workspaceId, "urednik");
  }
  const workspace = await ctx.db.get(workspaceId);
  if (workspace === null || workspace.arhiviran === true) {
    throw new ConvexError(PORUKE_PROSTORA.projekatNijeDostupan);
  }
  const clan = await ctx.db
    .query("members")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", projekat.userId).eq("workspaceId", workspaceId),
    )
    .first();
  // Odbrana u dubinu: omotač sa `uloga: "urednik"` ovo već odbija.
  if (!jeClanRadnogDela(clan)) throw new ConvexError(PORUKE.urednik);
  const profile = await requireProfilKorisnika(ctx, projekat.userId);
  const isManager =
    clan.role === "owner" || (await jeVlasnikPlatforme(ctx, projekat.userId));
  return { profile, workspace, membership: clan, isManager };
}

/** Vlasnik projekta ili vlasnik platforme (P7). */
export function isManager(actor: Actor): boolean {
  return actor.isManager;
}

/** `owner` ovog projekta. */
export function isOwner(actor: Actor): boolean {
  return actor.membership.role === "owner";
}

/** Zamena za Devotion `requireAdmin`: vlasnik platforme sa profilom (P7). */
export async function requireVlasnikPlatforme(
  ctx: ReadCtx,
): Promise<Doc<"profiles">> {
  const userId = await korisnikIliNull(ctx);
  if (userId === null) throw new ConvexError(PORUKE.nijePrijavljen);
  if (!(await jeVlasnikPlatforme(ctx, userId))) {
    throw new ConvexError(PORUKE.platforma);
  }
  return await requireProfilKorisnika(ctx, userId);
}

/** Ciljani profil postoji i nije deaktiviran. */
export async function requireActiveProfile(
  ctx: ReadCtx,
  profileId: Id<"profiles">,
): Promise<Doc<"profiles">> {
  const profile = await ctx.db.get(profileId);
  if (profile === null || profile.archivedAt !== null) {
    throw new ConvexError(PORUKE_PROSTORA.clanNijePronadjen);
  }
  return profile;
}

/** Članstvo profila (`owner`/`urednik`) u projektu, ili `null`. */
export async function clanstvoProfila(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  profileId: Id<"profiles">,
): Promise<Clanstvo | null> {
  const profile = await ctx.db.get(profileId);
  if (profile === null || profile.archivedAt !== null) return null;
  const clan = await ctx.db
    .query("members")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", profile.userId).eq("workspaceId", workspaceId),
    )
    .first();
  return jeClanRadnogDela(clan) ? clan : null;
}

/** Zamena za `requireProfileInStartup`: profil je aktivan član projekta. */
export async function requireProfilUProjektu(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  profileId: Id<"profiles">,
): Promise<Doc<"profiles">> {
  const profile = await requireActiveProfile(ctx, profileId);
  if ((await clanstvoProfila(ctx, workspaceId, profileId)) === null) {
    throw new ConvexError(PORUKE_PROSTORA.clanNijeUProjektu);
  }
  return profile;
}

/** Menadžer projekta za liste kroz više projekata (zamena za `isManagerProfile`). */
export async function jeMenadzerProjekta(
  ctx: ReadCtx,
  workspaceId: Id<"workspaces">,
  profileId: Id<"profiles">,
): Promise<boolean> {
  const clan = await clanstvoProfila(ctx, workspaceId, profileId);
  if (clan === null) return false;
  if (clan.role === "owner") return true;
  return await jeVlasnikPlatforme(ctx, clan.userId);
}

/**
 * Profil kreatora projekta (`workspaces.createdBy`), ako ga ima; inače
 * `fallback`. Devotion je ovde koristio `startups.createdByProfileId`.
 */
export async function vlasnikProjektaProfileId(
  ctx: ReadCtx,
  workspace: Doc<"workspaces">,
  fallback: Id<"profiles">,
): Promise<Id<"profiles">> {
  if (workspace.createdBy === undefined) return fallback;
  const profile = await profilPoKorisniku(ctx, workspace.createdBy);
  return profile?._id ?? fallback;
}
