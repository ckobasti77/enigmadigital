import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  customAction,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions";
import {
  action,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { imaUlogu, type Uloga } from "./uloge";

/**
 * ============================================================================
 * OMOTAČI PRISTUPA PO PROJEKTU (PROJEKTI-PLAN §5, plan C02 §2)
 * ============================================================================
 *
 * Svaka javna funkcija nad podacima projekta ide kroz jedan od ovih omotača:
 *
 *   projekatQuery / projekatMutation / projekatAction
 *     dodaju OBAVEZAN argument `workspaceId` (P2), proveravaju prijavu i
 *     članstvo u TAČNO tom projektu (indeks `by_user_workspace`) i daju
 *     `ctx.projekat = { userId, workspaceId, uloga }`. Proveren `workspaceId`
 *     stiže i u `args` handlera (isti broj, već proveren).
 *     Opcija `uloga` je minimalna uloga: upit podrazumeva `client_viewer`,
 *     mutacija i akcija `urednik`. `client_viewer` na mutaciji piše se
 *     eksplicitno i samo za lične redove pozivaoca (napredak, zvono).
 *
 *   prijavljenQuery / prijavljenMutation
 *     funkcije bez projekta (npr. spisak mojih projekata): samo prijava,
 *     `ctx.korisnik = { userId }`.
 *
 *   platformaQuery / platformaMutation
 *     samo vlasnik platforme (P3): `owner` u bar jednom internom projektu.
 *
 * Akcija nema `ctx.db`, pa članstvo proverava kroz interni upit
 * `projekti.clanstvoZaAkciju` sa eksplicitnim `userId`. Interne funkcije koje
 * akcija posle zove dobijaju `workspaceId` iz `ctx.projekat` i ne proveravaju
 * ponovo: granica poverenja je omotač.
 *
 * Omotač zna samo da je pozivalac član projekta. ID dokumenta iz argumenta
 * (firma, oglas, komentar) i dalje se proverava u handleru:
 * `doc.workspaceId !== ctx.projekat.workspaceId` → nije pronađen.
 * ============================================================================
 */

export type Projekat = {
  userId: Id<"users">;
  workspaceId: Id<"workspaces">;
  uloga: Uloga;
};

export type Korisnik = { userId: Id<"users"> };

export type ProjekatQueryCtx = QueryCtx & { projekat: Projekat };
export type ProjekatMutationCtx = MutationCtx & { projekat: Projekat };
export type ProjekatActionCtx = ActionCtx & { projekat: Projekat };

/** Greške omotača. Isti oblik kao dosadašnje (`code` + srpska poruka). */
export const PORUKE = {
  nijePrijavljen: { code: "unauthorized", message: "Niste prijavljeni." },
  nemaPristup: { code: "forbidden", message: "Nemaš pristup ovom projektu." },
  urednik: {
    code: "forbidden",
    message: "Ovu radnju može da izvede urednik ili vlasnik projekta.",
  },
  owner: {
    code: "forbidden",
    message: "Ovu radnju može da izvede samo vlasnik projekta.",
  },
  platforma: {
    code: "forbidden",
    message: "Ovu radnju može da izvede samo vlasnik platforme.",
  },
} as const;

/** Prijavljen korisnik ili `unauthorized`. */
export async function prijavljenKorisnik(
  ctx: QueryCtx | ActionCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new ConvexError(PORUKE.nijePrijavljen);
  return userId;
}

/**
 * Članstvo korisnika u TAČNO ovom projektu, sa bar `minimalna` ulogom; inače
 * baca `forbidden`. `.first()` a ne `.unique()`: duplikat reda u `members` ne
 * sme da zaključa vlasnika.
 */
export async function clanstvoKorisnika(
  ctx: QueryCtx,
  userId: Id<"users">,
  workspaceId: Id<"workspaces">,
  minimalna: Uloga,
): Promise<Projekat> {
  const clan = await ctx.db
    .query("members")
    .withIndex("by_user_workspace", (q) =>
      q.eq("userId", userId).eq("workspaceId", workspaceId),
    )
    .first();
  if (clan === null) throw new ConvexError(PORUKE.nemaPristup);
  if (!imaUlogu(clan.role, minimalna)) {
    throw new ConvexError(minimalna === "owner" ? PORUKE.owner : PORUKE.urednik);
  }
  return { userId, workspaceId, uloga: clan.role };
}

/**
 * Članstvo prijavljenog korisnika u projektu, za mesta van omotača (npr.
 * kopiranje u drugi projekat proverava i ciljni projekat).
 */
export async function requireProjekat(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  minimalna: Uloga = "client_viewer",
): Promise<Projekat> {
  const userId = await prijavljenKorisnik(ctx);
  return await clanstvoKorisnika(ctx, userId, workspaceId, minimalna);
}

/**
 * P3: vlasnik platforme je `owner` u bar jednom internom projektu (vrsta bez
 * vrednosti = interni). Bez nove tabele; danas je to samo Jovan.
 */
export async function jeVlasnikPlatforme(
  ctx: QueryCtx,
  userId: Id<"users">,
): Promise<boolean> {
  const clanstva = await ctx.db
    .query("members")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(100);
  for (const clan of clanstva) {
    if (clan.role !== "owner") continue;
    const ws = await ctx.db.get(clan.workspaceId);
    if (ws !== null && (ws.vrsta ?? "interni") === "interni") return true;
  }
  return false;
}

/** Dodatna opcija omotača projekta: minimalna uloga. */
type OpcijeUloge = { uloga?: Uloga };

export const projekatQuery = customQuery(query, {
  args: { workspaceId: v.id("workspaces") },
  input: async (ctx, { workspaceId }, opcije: OpcijeUloge) => {
    const userId = await prijavljenKorisnik(ctx);
    const projekat = await clanstvoKorisnika(
      ctx,
      userId,
      workspaceId,
      opcije?.uloga ?? "client_viewer",
    );
    return { ctx: { projekat }, args: { workspaceId } };
  },
});

export const projekatMutation = customMutation(mutation, {
  args: { workspaceId: v.id("workspaces") },
  input: async (ctx, { workspaceId }, opcije: OpcijeUloge) => {
    const userId = await prijavljenKorisnik(ctx);
    const projekat = await clanstvoKorisnika(
      ctx,
      userId,
      workspaceId,
      opcije?.uloga ?? "urednik",
    );
    return { ctx: { projekat }, args: { workspaceId } };
  },
});

export const projekatAction = customAction(action, {
  args: { workspaceId: v.id("workspaces") },
  input: async (ctx, { workspaceId }, opcije: OpcijeUloge) => {
    const userId = await prijavljenKorisnik(ctx);
    const projekat: Projekat = await ctx.runQuery(
      internal.projekti.clanstvoZaAkciju,
      { userId, workspaceId, minimalna: opcije?.uloga ?? "urednik" },
    );
    return { ctx: { projekat }, args: { workspaceId } };
  },
});

export const prijavljenQuery = customQuery(query, {
  args: {},
  input: async (ctx) => {
    const korisnik: Korisnik = { userId: await prijavljenKorisnik(ctx) };
    return { ctx: { korisnik }, args: {} };
  },
});

export const prijavljenMutation = customMutation(mutation, {
  args: {},
  input: async (ctx) => {
    const korisnik: Korisnik = { userId: await prijavljenKorisnik(ctx) };
    return { ctx: { korisnik }, args: {} };
  },
});

async function vlasnikPlatforme(ctx: QueryCtx): Promise<Korisnik> {
  const userId = await prijavljenKorisnik(ctx);
  if (!(await jeVlasnikPlatforme(ctx, userId))) {
    throw new ConvexError(PORUKE.platforma);
  }
  return { userId };
}

export const platformaQuery = customQuery(query, {
  args: {},
  input: async (ctx) => ({ ctx: { korisnik: await vlasnikPlatforme(ctx) }, args: {} }),
});

export const platformaMutation = customMutation(mutation, {
  args: {},
  input: async (ctx: MutationCtx) => ({
    ctx: { korisnik: await vlasnikPlatforme(ctx) },
    args: {},
  }),
});
