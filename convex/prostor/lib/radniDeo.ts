import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { PORUKE_PROSTORA } from "./auth";
import { ensureAreaChannel, ensureGeneralChannel } from "./chat_channels";
import { archiveAssignmentsForProfile } from "./task_assignees";
import { AREA_DEFINITIONS, cleanRequiredText, normalizeEmail } from "./validators";

/**
 * Profil i radni deo projekta (SPAJANJE, P6 i P26, plan S01 §3.4).
 *
 * Enigmin auth je jedini nalog; Devotion profil (ime, avatar) nastaje lenjo,
 * kad korisnik prvi put uđe u radni deo (`profiles.ensureCurrent` iz
 * auth-gate) ili kad napravi projekat. Tok prijave se ne dira (D15).
 */

const NAJVISE_CLANSTAVA = 100;

/**
 * Profil korisnika; pravi ga ako ne postoji, a korisnik ima bar jedno
 * `owner`/`urednik` članstvo (O5, D16). Deaktiviran profil vraća `null`.
 * Idempotentno: provera i upis su u istoj transakciji, pa dva paralelna poziva
 * ne prave dva profila (OCC ponavlja drugi).
 */
export async function obezbediProfil(
  ctx: { db: MutationCtx["db"] },
  userId: Id<"users">,
  displayName?: string,
): Promise<Doc<"profiles"> | null> {
  const postoji = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  if (postoji !== null) return postoji.archivedAt === null ? postoji : null;

  const clanstva = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(NAJVISE_CLANSTAVA);
  if (!clanstva.some((c) => c.role === "owner" || c.role === "urednik")) return null;

  const user = await ctx.db.get(userId);
  if (user === null || !user.email) {
    throw new ConvexError({ code: "invalid", message: "Nalogu nedostaje adresa e-pošte." });
  }
  const email = normalizeEmail(user.email);
  const ime = cleanRequiredText(displayName ?? user.name ?? email.split("@")[0], "Ime", 80);
  const now = Date.now();
  const profileId = await ctx.db.insert("profiles", {
    userId,
    displayName: ime,
    email,
    role: "member",
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const profil = await ctx.db.get(profileId);
  if (profil === null) throw new ConvexError({ code: "invalid", message: "Profil nije sačuvan." });
  return profil;
}

/**
 * P26: podrazumevane oblasti (`AREA_DEFINITIONS`: Razvoj, Marketing, Prodaja,
 * Ostalo), opšti kanal i kanal za svaku oblast. Idempotentno: oblast se traži
 * po ključu (`areas.by_workspaceId_and_key`), kanali kroz `ensure*Channel`, pa
 * preimenovana podrazumevana oblast ostaje preimenovana.
 */
export async function obezbediRadniDeoProjekta(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; userId: Id<"users">; now: number },
): Promise<void> {
  const profil = await obezbediProfil(ctx, args.userId);
  if (profil === null) throw new ConvexError(PORUKE_PROSTORA.nemaProfila);
  await ensureGeneralChannel(ctx, {
    workspaceId: args.workspaceId,
    createdByProfileId: profil._id,
    createdAt: args.now,
  });
  for (const definicija of AREA_DEFINITIONS) {
    const postoji = await ctx.db
      .query("areas")
      .withIndex("by_workspaceId_and_key", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("key", definicija.key),
      )
      .first();
    const areaId =
      postoji?._id ??
      (await ctx.db.insert("areas", {
        workspaceId: args.workspaceId,
        key: definicija.key,
        label: definicija.label,
        position: definicija.position,
        createdAt: args.now,
      }));
    await ensureAreaChannel(ctx, {
      workspaceId: args.workspaceId,
      areaId,
      name: postoji?.label ?? definicija.label,
      createdByProfileId: profil._id,
      createdAt: args.now,
    });
  }
}

/** Najviše zadataka sa kojih se član skida u jednoj transakciji (Devotion 250). */
const NAJVISE_ZADATAKA_PRI_UKLANJANJU = 250;

/** Najviše otvorenih listića koje uklanjanje pregleda (Devotion 200). */
const NAJVISE_LISTICA_PRI_UKLANJANJU = 200;

/**
 * D23: član uklonjen iz projekta (`membersStore.removeMember`) skida se sa
 * svojih zadataka u tom projektu; ostali izvršioci ostaju, a projekcija na
 * stranici se preračunava. Korisnik bez profila nije ni ulazio u radni deo.
 * Preko granice baca grešku i uklanjanje se ne izvodi, kao u Devotionu.
 *
 * SPAJANJE S06: kao Devotion `startups.removeMember`, njegov otvoren listić u
 * starom zahtevu za brisanje tog projekta postaje „izuzet” i zahtev broji
 * jednog glasača manje. Zahtev se time ne izvršava (glasanje je ugašeno, P4).
 */
export async function ukloniClanaIzRadnogDela(
  ctx: MutationCtx,
  args: { workspaceId: Id<"workspaces">; userId: Id<"users">; now: number },
): Promise<number> {
  const profil = await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .first();
  if (profil === null) return 0;
  const skinuto = await archiveAssignmentsForProfile(ctx, {
    profileId: profil._id,
    workspaceId: args.workspaceId,
    now: args.now,
    limit: NAJVISE_ZADATAKA_PRI_UKLANJANJU,
  });
  const listici = await ctx.db
    .query("deletionBallots")
    .withIndex("by_profileId_and_vote_and_createdAt", (q) =>
      q.eq("profileId", profil._id).eq("vote", "pending"),
    )
    .take(NAJVISE_LISTICA_PRI_UKLANJANJU);
  for (const listic of listici) {
    if (listic.workspaceId !== args.workspaceId) continue;
    const zahtev = await ctx.db.get("deletionRequests", listic.requestId);
    if (zahtev === null || zahtev.status !== "pending") continue;
    await ctx.db.patch("deletionBallots", listic._id, {
      vote: "excused",
      updatedAt: args.now,
    });
    await ctx.db.patch("deletionRequests", zahtev._id, {
      eligibleCount: Math.max(0, zahtev.eligibleCount - 1),
      updatedAt: args.now,
    });
  }
  return skinuto;
}
