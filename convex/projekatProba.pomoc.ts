/**
 * Probne funkcije za testove omotača (plan C02, D15). Dve tačke u imenu:
 * Convex ih ne deployuje i nisu u `api`; testovi ih zovu preko
 * `makeFunctionReference("projekatProba.pomoc:<ime>")`.
 */
import { v } from "convex/values";
import {
  platformaMutation,
  platformaQuery,
  prijavljenMutation,
  prijavljenQuery,
  projekatAction,
  projekatMutation,
  projekatQuery,
} from "./lib/projekat";

/** Čita podatke projekta preko indeksa sa `workspaceId`. */
export const probniUpit = projekatQuery({
  args: {},
  handler: async (ctx, args) => {
    const pravila = await ctx.db
      .query("rules")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", ctx.projekat.workspaceId))
      .take(50);
    return {
      projekat: ctx.projekat,
      workspaceIdIzArgs: args.workspaceId,
      pravila: pravila.map((p) => p.name),
    };
  },
});

/** Upit koji traži bar urednika. */
export const probniUpitUrednik = projekatQuery({
  uloga: "urednik",
  args: {},
  handler: async (ctx) => ctx.projekat.uloga,
});

/** Mutacija sa podrazumevanom ulogom (urednik). */
export const probnaIzmena = projekatMutation({
  args: { ime: v.string() },
  handler: async (ctx, { ime }) =>
    await ctx.db.insert("rules", {
      workspaceId: ctx.projekat.workspaceId,
      name: ime,
      scope: "campaign",
      condition: { metric: "cpa", operator: "gt", value: 1, windowDays: 3, minImpressions: 0 },
      action: "notify",
      cooldownHours: 24,
      enabled: false,
    }),
});

export const probnaIzmenaVlasnik = projekatMutation({
  uloga: "owner",
  args: {},
  handler: async (ctx) => ctx.projekat.uloga,
});

/** Lični red pozivaoca: eksplicitno dozvoljeno i posmatraču. */
export const probnaLicna = projekatMutation({
  uloga: "client_viewer",
  args: {},
  handler: async (ctx) => ctx.projekat.uloga,
});

export const probnaAkcija = projekatAction({
  args: { poruka: v.string() },
  handler: async (ctx, args) => ({
    projekat: ctx.projekat,
    poruka: args.poruka,
    workspaceIdIzArgs: args.workspaceId,
  }),
});

export const probnaAkcijaVlasnik = projekatAction({
  uloga: "owner",
  args: {},
  handler: async (ctx) => ctx.projekat.uloga,
});

export const probnoPrijavljen = prijavljenQuery({
  args: {},
  handler: async (ctx) => ctx.korisnik.userId,
});

export const probnaPrijavljenaIzmena = prijavljenMutation({
  args: {},
  handler: async (ctx) => ctx.korisnik.userId,
});

export const probnaPlatforma = platformaQuery({
  args: {},
  handler: async (ctx) => ctx.korisnik.userId,
});

export const probnaPlatformaIzmena = platformaMutation({
  args: {},
  handler: async (ctx) => ctx.korisnik.userId,
});
