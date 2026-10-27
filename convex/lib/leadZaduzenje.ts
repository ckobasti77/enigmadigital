import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { imaUlogu } from "./uloge";

/**
 * ============================================================================
 * ZADUŽENJE NOVE FIRME (ULTRA-PLAN §4, tačke 3 i 4; P8)
 * ============================================================================
 *
 * Tabela, Mapa i red poziva čitaju DODELE (`leadAssignments`), ne firme. Firma
 * bez zaduženja postoji u bazi, a ne vidi se nigde osim u „Bez vlasnika" —
 * tako je 32 od 210 sintetičkih firmi bilo nevidljivo. Zato svaki nastanak
 * firme (uvoz, upit, skill kroz uvoz, ručni unos, kopija iz drugog projekta)
 * ide kroz `osigurajZaduzenje`.
 *
 * Ko dobija zaduženje: član projekta koji je firmu napravio; kad takvog člana
 * nema (sistem, skill, bivši član), vlasnik projekta.
 */

/** Najviše članstava koje izbor vlasnika čita po projektu. */
const MAX_CLANOVA = 200;

/**
 * Član koji dobija zaduženje nove firme: `kreator` ako je urednik ili vlasnik
 * ovog projekta, inače prvi vlasnik projekta. `null` kad projekat nema
 * nijednog vlasnika ni kreatora koji je član (tada se zaduženje ne izmišlja).
 */
export async function vlasnikNoveFirme(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  kreator: Id<"users"> | undefined,
): Promise<Id<"users"> | null> {
  if (kreator !== undefined) {
    const clan = await ctx.db
      .query("members")
      .withIndex("by_user_workspace", (q) =>
        q.eq("userId", kreator).eq("workspaceId", workspaceId),
      )
      .first();
    if (clan !== null && imaUlogu(clan.role, "urednik")) return kreator;
  }
  const clanovi = await ctx.db
    .query("members")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .take(MAX_CLANOVA);
  return clanovi.find((c) => c.role === "owner")?.userId ?? null;
}

/**
 * Pravi zaduženje (faza „nov") i događaj „dodela" ako firma zaduženje nema.
 * Postojeće zaduženje se ne menja — poziv je bezbedno ponoviti.
 */
export async function osigurajZaduzenje(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    companyId: Id<"leadCompanies">;
    ownerUserId: Id<"users">;
    actorUserId: Id<"users">;
    now: number;
    napomena: string;
  },
): Promise<{ assignment: Doc<"leadAssignments">; created: boolean }> {
  const existing = await ctx.db
    .query("leadAssignments")
    .withIndex("by_workspace_company", (q) =>
      q.eq("workspaceId", args.workspaceId).eq("companyId", args.companyId),
    )
    .first();

  if (existing) {
    return { assignment: existing, created: false };
  }

  const assignmentId = await ctx.db.insert("leadAssignments", {
    workspaceId: args.workspaceId,
    companyId: args.companyId,
    ownerUserId: args.ownerUserId,
    stage: "nov",
    createdAt: args.now,
    updatedAt: args.now,
  });

  await ctx.db.insert("leadStageEvents", {
    workspaceId: args.workspaceId,
    companyId: args.companyId,
    kind: "dodela",
    fromValue: undefined,
    toValue: String(args.ownerUserId),
    actorUserId: args.actorUserId,
    note: args.napomena,
    occurredAt: args.now,
  });

  const assignment = (await ctx.db.get(assignmentId))!;
  return { assignment, created: true };
}

/**
 * Zaduženje za firmu koja upravo nastaje: vlasnik po `vlasnikNoveFirme`, a
 * autor događaja je onaj ko je firmu napravio (bez njega — sam vlasnik).
 * `null` kad projekat nema kome da je dodeli.
 */
export async function zaduziNovuFirmu(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    companyId: Id<"leadCompanies">;
    kreator: Id<"users"> | undefined;
    now: number;
    napomena: string;
  },
): Promise<{ assignment: Doc<"leadAssignments">; created: boolean } | null> {
  const ownerUserId = await vlasnikNoveFirme(ctx, args.workspaceId, args.kreator);
  if (ownerUserId === null) return null;
  return await osigurajZaduzenje(ctx, {
    workspaceId: args.workspaceId,
    companyId: args.companyId,
    ownerUserId,
    actorUserId: args.kreator ?? ownerUserId,
    now: args.now,
    napomena: args.napomena,
  });
}
