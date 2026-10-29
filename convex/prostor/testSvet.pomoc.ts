/// <reference types="vite/client" />
/**
 * Seed za testove radnog dela (SPAJANJE, plan S01 §5.2). Dve tačke u imenu:
 * Convex ovaj fajl ne deployuje, a `verify:pristup` ga preskače.
 *
 * Devotion testovi su punili `startups` / `startupMembers` / `profiles.role`.
 * Alat za prenos te upise menja pozivima ispod, pa test ostaje skoro isti, a
 * redosled je `users → profiles → workspaces → members → areas`:
 * - Devotion `startups` red postaje projekat vrste „klijent“: kreator je
 *   `owner`, ali NIJE vlasnik platforme (Devotion: vlasnik ≠ admin).
 * - `role: "admin"` u profilu postaje vlasnik platforme: `owner` u arhiviranom
 *   internom projektu (P3 ne gleda `arhiviran`, a „Ja“ spiskovi ga preskaču).
 * - Član sa `archivedAt` je uklonjen član: u Enigmi nema red u `members`.
 */
import type { TestConvex } from "convex-test";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type schema from "../schema";

let brojac = 0;

/** Identitet kao Convex Auth (`<userId>|<sesija>`). */
export function kao(t: TestConvex<typeof schema>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|sesija-test` });
}

/** Devotion `profiles` red; `role: "admin"` korisnika čini vlasnikom platforme. */
export async function insertProfil(
  ctx: MutationCtx,
  red: Omit<Doc<"profiles">, "_id" | "_creationTime">,
): Promise<Id<"profiles">> {
  const profileId = await ctx.db.insert("profiles", red);
  if (red.role === "admin") {
    const workspaceId = await ctx.db.insert("workspaces", {
      name: "Platforma (test)",
      slug: `platforma-${++brojac}`,
      arhiviran: true,
    });
    await ctx.db.insert("members", { workspaceId, userId: red.userId, role: "owner" });
  }
  return profileId;
}

/** Devotion `startups` red → projekat vrste „klijent“ + `owner` članstvo kreatora. */
export async function insertStartup(
  ctx: MutationCtx,
  red: {
    name: string;
    description: string;
    logoStorageId?: Id<"_storage">;
    createdByProfileId: Id<"profiles">;
    archivedAt: number | null;
    createdAt: number;
    updatedAt: number;
  },
): Promise<Id<"workspaces">> {
  const kreator = await ctx.db.get(red.createdByProfileId);
  if (kreator === null) throw new Error("insertStartup: kreator ne postoji");
  const workspaceId = await ctx.db.insert("workspaces", {
    name: red.name,
    slug: `projekat-${++brojac}`,
    vrsta: "klijent",
    opis: red.description,
    arhiviran: red.archivedAt !== null,
    createdBy: kreator.userId,
    ...(red.logoStorageId === undefined ? {} : { brend: { logoStorageId: red.logoStorageId } }),
  });
  await ctx.db.insert("members", { workspaceId, userId: kreator.userId, role: "owner" });
  return workspaceId;
}

/**
 * Devotion `startupMembers` red → `members` urednik. `archivedAt !== null` je
 * uklonjen član (nema reda, vraća `null`); postojeći red (kreator) vraća svoj id.
 */
export async function insertClanstvo(
  ctx: MutationCtx,
  red: {
    workspaceId: Id<"workspaces">;
    profileId: Id<"profiles">;
    addedByProfileId?: Id<"profiles">;
    archivedAt: number | null;
    createdAt?: number;
  },
): Promise<Id<"members"> | null> {
  if (red.archivedAt !== null) return null;
  const profil = await ctx.db.get(red.profileId);
  if (profil === null) throw new Error("insertClanstvo: profil ne postoji");
  const postoji = await ctx.db
    .query("members")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", profil.userId).eq("workspaceId", red.workspaceId),
    )
    .first();
  if (postoji !== null) return postoji._id;
  return await ctx.db.insert("members", {
    workspaceId: red.workspaceId,
    userId: profil.userId,
    role: "urednik",
  });
}

/** Uklanjanje člana (Devotion `archivedAt` na članstvu): red se briše. */
export async function ukloniClanstvo(
  ctx: MutationCtx,
  membershipId: Id<"members"> | null,
): Promise<void> {
  if (membershipId !== null) await ctx.db.delete(membershipId);
}
