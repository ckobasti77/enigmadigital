// Preneto iz Devotion packages/backend/convex/lib/idea_stages.ts (main @ c05c40f), SPAJANJE S02.
import type { Doc } from "../../_generated/dataModel";

/**
 * Faze ideje (PROSTOR P6, plan K01 §8.1). Backend kopija dela shared
 * `packages/shared/src/idea-stages.ts` (backend ne uvozi `@devotion/shared`);
 * `idea-stages-parity.test.ts` čuva da se ne raziđu.
 *
 * Sačuvano `stage` (odsutno = `predlog`); „Postalo zadatak" se izvodi iz
 * `convertedPageId` i ima prednost nad svakom sačuvanom fazom.
 */
export type IdeaStoredStage = NonNullable<Doc<"ideaNodes">["stage"]>;
export type IdeaStage = IdeaStoredStage | "postalo_zadatak";

export const IDEA_STAGE_LABELS: Record<IdeaStage, string> = {
  predlog: "Predlog",
  razmatra_se: "Razmatra se",
  odobreno: "Odobreno",
  postalo_zadatak: "Postalo zadatak",
  odbijeno: "Odbijeno",
};

/** Poruke grešaka — isti tekst kao shared razlozi (`IDEA_*_REASON`). */
export const IDEA_STAGE_CHANGE_MESSAGE =
  "Fazu ideje menja autor ili vlasnik projekta.";
export const IDEA_CONVERT_MESSAGE =
  "Ideju pretvara njen autor ili vlasnik projekta.";
export const IDEA_CONVERT_STAGE_MESSAGE = "Ideja mora biti u fazi „Odobreno”.";
export const IDEA_CONVERTED_MESSAGE = "Ideja je već pretvorena.";

export function ideaStoredStage(idea: {
  stage?: IdeaStoredStage | null;
}): IdeaStoredStage {
  return idea.stage ?? "predlog";
}

export function ideaDisplayStage(idea: {
  stage?: IdeaStoredStage | null;
  convertedPageId: string | null;
}): IdeaStage {
  return idea.convertedPageId !== null
    ? "postalo_zadatak"
    : ideaStoredStage(idea);
}
