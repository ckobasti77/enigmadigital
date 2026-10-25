/// <reference types="vite/client" />
/**
 * Zajednički svet za testove izolacije projekata (plan C02 §9). Dve tačke u
 * imenu: Convex ovaj fajl ne deployuje, a testovi (C03–C07) ga uvoze.
 */
import { convexTest, type TestConvex } from "convex-test";
import { expect } from "vitest";

import type { Id } from "./_generated/dataModel";
import schema from "./schema";

export const modules = import.meta.glob("./**/*.*s");

export type Svet = {
  t: TestConvex<typeof schema>;
  /** „Enigma IT“, interni. */
  wsA: Id<"workspaces">;
  /** „ScanMe“, interni. */
  wsB: Id<"workspaces">;
  /** „Klijent d.o.o.“, klijentski. */
  wsK: Id<"workspaces">;
  /** owner u A. */
  ana: Id<"users">;
  /** owner u B. */
  boban: Id<"users">;
  /** urednik u A. */
  urednica: Id<"users">;
  /** client_viewer u A. */
  viewer: Id<"users">;
  /** owner i u A i u B (dva članstva, kao Jovan posle runa). */
  jovan: Id<"users">;
  /** owner samo klijentskog projekta K — nije vlasnik platforme. */
  klijent: Id<"users">;
  /** Bez ijednog članstva. */
  stranac: Id<"users">;
};

export async function napraviSvet(): Promise<Svet> {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const wsA = await ctx.db.insert("workspaces", { name: "Enigma IT", slug: "enigma-it" });
    const wsB = await ctx.db.insert("workspaces", { name: "ScanMe", slug: "scanme" });
    const wsK = await ctx.db.insert("workspaces", {
      name: "Klijent d.o.o.",
      slug: "klijent-doo",
      vrsta: "klijent",
    });
    const korisnik = (email: string) => ctx.db.insert("users", { email });
    const ana = await korisnik("ana@enigma.test");
    const boban = await korisnik("boban@scanme.test");
    const urednica = await korisnik("urednica@enigma.test");
    const viewer = await korisnik("pregled@enigma.test");
    const jovan = await korisnik("jovan@enigma.test");
    const klijent = await korisnik("vlasnik@klijent.test");
    const stranac = await korisnik("stranac@niko.test");
    await ctx.db.insert("members", { workspaceId: wsA, userId: ana, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsB, userId: boban, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: urednica, role: "urednik" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: viewer, role: "client_viewer" });
    await ctx.db.insert("members", { workspaceId: wsA, userId: jovan, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsB, userId: jovan, role: "owner" });
    await ctx.db.insert("members", { workspaceId: wsK, userId: klijent, role: "owner" });
    return { wsA, wsB, wsK, ana, boban, urednica, viewer, jovan, klijent, stranac };
  });
  return { t, ...ids };
}

/** Isti oblik identiteta kao Convex Auth (`<userId>|<sesija>`). */
export function kao(s: Svet, userId: Id<"users">) {
  return s.t.withIdentity({ subject: `${userId}|sesija-test` });
}

/** Poziv mora da padne sa ConvexError kodom (i, ako je dat, porukom). */
export async function odbijeno(
  poziv: Promise<unknown>,
  kod: "unauthorized" | "forbidden" | "invalid" | "conflict" | "not_found",
  poruka?: RegExp,
): Promise<void> {
  const greska = await poziv.then(
    () => null,
    (e: unknown) => e,
  );
  expect(greska, "poziv je morao da padne").not.toBeNull();
  const podaci = (greska as { data?: { code?: string; message?: string } }).data;
  const tekst = greska instanceof Error ? greska.message : String(greska);
  expect(podaci?.code ?? tekst).toContain(kod);
  if (poruka) expect(podaci?.message ?? tekst).toMatch(poruka);
}

/** Pravilo oglasa kao probni red podataka projekta. */
export async function napraviPravilo(
  s: Svet,
  workspaceId: Id<"workspaces">,
  name: string,
): Promise<Id<"rules">> {
  return await s.t.run(async (ctx) =>
    ctx.db.insert("rules", {
      workspaceId,
      name,
      scope: "campaign",
      condition: { metric: "cpa", operator: "gt", value: 1, windowDays: 3, minImpressions: 0 },
      action: "notify",
      cooldownHours: 24,
      enabled: false,
    }),
  );
}
