/**
 * TEST TIPOVA za hookove projekta. Ne izvršava se i ništa ga ne uvozi:
 * proverava ga `npm run typecheck`. Svaki `@ts-expect-error` mora da naiđe na
 * grešku; ako hook počne da prima pogrešan poziv, tsc javlja „Unused
 * '@ts-expect-error' directive“ i provera pada.
 */
import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useProjekatAction,
  useProjekatMutation,
  useProjekatQuery,
} from "./projekat-provider";

type W = Id<"workspaces">;

const upit = makeFunctionReference<"query", { workspaceId: W; od: string }, number>(
  "proba:upit",
);
const upitSamoProjekat = makeFunctionReference<"query", { workspaceId: W }, number>(
  "proba:upitSamoProjekat",
);
const upitOpcioni = makeFunctionReference<
  "query",
  { workspaceId: W; limit?: number },
  number
>("proba:upitOpcioni");
const upitBezProjekta = makeFunctionReference<"query", { od: string }, number>(
  "proba:upitBezProjekta",
);
const izmena = makeFunctionReference<"mutation", { workspaceId: W; ime: string }, null>(
  "proba:izmena",
);
const akcija = makeFunctionReference<"action", { workspaceId: W }, string>("proba:akcija");

export function useTipoviProba(drugi: W): void {
  const broj: number | undefined = useProjekatQuery(upit, { od: "2026-10-01" });
  void broj;
  useProjekatQuery(upit, "skip");
  useProjekatQuery(upitSamoProjekat);
  useProjekatQuery(upitOpcioni);
  useProjekatQuery(upitOpcioni, { limit: 5 });

  // @ts-expect-error workspaceId se nikad ne šalje ručno
  useProjekatQuery(upit, { od: "x", workspaceId: drugi });
  // @ts-expect-error funkcija bez projekta ne ide kroz hook projekta
  useProjekatQuery(upitBezProjekta, { od: "x" });
  // @ts-expect-error obavezan argument ne sme da se izostavi
  useProjekatQuery(upit, {});
  // @ts-expect-error ni ceo objekat argumenata
  useProjekatQuery(upit);

  const sacuvaj = useProjekatMutation(izmena);
  void sacuvaj({ ime: "a" });
  // @ts-expect-error workspaceId se nikad ne šalje ručno
  void sacuvaj({ ime: "a", workspaceId: drugi });

  const pokreni = useProjekatAction(akcija);
  const rezultat: Promise<string> = pokreni();
  void rezultat;
  // @ts-expect-error akcija bez projekta ne ide kroz hook projekta
  useProjekatAction(makeFunctionReference<"action", { x: number }, null>("proba:x"));
}
