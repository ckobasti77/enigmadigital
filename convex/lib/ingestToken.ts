import type { ActionCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { sha256Hex } from "./metaAudienceHash";

/**
 * Odgovor sa JSON telom i bez keširanja — ovo nikad ne sme da se servira iz
 * keša. Dodatna zaglavlja (CORS za `/projekti/lead`) idu kroz `zaglavlja`.
 */
export function ingestOdgovor(
  telo: unknown,
  status: number,
  zaglavlja: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...zaglavlja,
    },
  });
}

/**
 * Bearer token iz zaglavlja i njegov red (C17, plan C15 §6.1). Isti obrazac
 * kao rute uvoza u `http.ts`: „nema zaglavlja“, „nije Bearer“, „nepoznat“ i
 * „opozvan“ daju isti ishod (`null`), da pogađač ne sazna šta je pogodio.
 * Token se nikad ne loguje.
 */
export function tokenIzZaglavlja(request: Request): string | null {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  return token.length > 0 ? token : null;
}

export type NadjenToken = {
  tokenId: Id<"ingestTokens">;
  workspaceId: Id<"workspaces">;
  createdBy: Id<"users">;
  namena: "uvoz" | "sajt";
};

export async function nadjiToken(
  ctx: Pick<ActionCtx, "runQuery">,
  token: string,
): Promise<NadjenToken | null> {
  return await ctx.runQuery(internal.ingestTokensStore.findValidTokenByHash, {
    tokenHash: await sha256Hex(token),
  });
}
