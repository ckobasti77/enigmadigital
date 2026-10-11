import type { FunctionReference, FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import { presetRange } from "@/lib/date-range";

/**
 * Zajednički delovi sintetičkih podataka razvojnog prikaza (`fixtures*.ts`).
 * Sve je izmišljeno i očigledno lažno; nikakvi stvarni podaci.
 */
export type R<Q extends FunctionReference<"query">> = FunctionReturnType<Q>;
export type Fixture = (args: Record<string, unknown>) => unknown;

export const WS = "ws_ux_test_000000000000000" as Id<"workspaces">;
export const USER = "user_ux_test_00000000000000" as Id<"users">;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const now = Date.now();
export const range = presetRange("28d", new Date());

/** Deterministični „slučajni" brojevi — isti snimak pre i posle. */
export function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** Tačno za upit nad tekućim periodom; prethodni period je prazan. */
export const tekuciPeriod = (args: Record<string, unknown>) =>
  typeof args.to === "string" && args.to >= range.from;
