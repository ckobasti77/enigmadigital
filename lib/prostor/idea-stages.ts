// Preneto iz Devotion packages/shared/src/idea-stages.ts (main @ c05c40f), SPAJANJE S02.
/**
 * Faze ideje (PROSTOR P6) — ČISTA logika za prikaz koju dele web i telefon:
 * nazivi, redosled kolona table, izvedena faza i ko sme da menja fazu ili da
 * pretvori ideju. Server ima svoju kopiju (`packages/backend/convex/lib/
 * idea_stages.ts`) i on odlučuje; ovo samo crta isto što server dozvoljava.
 *
 * Sačuvana faza: `predlog · razmatra_se · odobreno · odbijeno` (odsutno =
 * `predlog`). „Postalo zadatak" se ne čuva — izvodi se iz `convertedPageId` i
 * ima prednost nad svakom sačuvanom fazom. Postojeći glasovi su samo signal:
 * autorov „protiv" ne znači „Odbijeno".
 */

export type IdeaStoredStage = "predlog" | "razmatra_se" | "odobreno" | "odbijeno";
export type IdeaStage = IdeaStoredStage | "postalo_zadatak";

/** Redosled prikaza (lista, filter, tabla). */
export const IDEA_STAGE_ORDER: readonly IdeaStage[] = [
  "predlog",
  "razmatra_se",
  "odobreno",
  "postalo_zadatak",
  "odbijeno",
];

export const IDEA_STAGE_LABELS: Record<IdeaStage, string> = {
  predlog: "Predlog",
  razmatra_se: "Razmatra se",
  odobreno: "Odobreno",
  postalo_zadatak: "Postalo zadatak",
  odbijeno: "Odbijeno",
};

/** Kolone table; „Odbijeno" je skupljena kolona ispod (nije u ovom nizu). */
export const IDEA_BOARD_COLUMNS: readonly IdeaStage[] = [
  "predlog",
  "razmatra_se",
  "odobreno",
  "postalo_zadatak",
];

/** Faze koje se biraju rukom (`ideas.setStage`). */
export const IDEA_STORED_STAGES: readonly IdeaStoredStage[] = [
  "predlog",
  "razmatra_se",
  "odobreno",
  "odbijeno",
];

export const IDEA_STAGE_CHANGE_REASON = "Fazu ideje menja autor ili vlasnik projekta.";
export const IDEA_CONVERT_REASON = "Ideju pretvara njen autor ili vlasnik projekta.";
export const IDEA_CONVERT_STAGE_REASON = "Ideja mora biti u fazi „Odobreno”.";
export const IDEA_CONVERTED_REASON = "Ideja je već pretvorena.";

type StageLike = { stage?: IdeaStoredStage | null; convertedPageId: string | null };

/** Prikazana faza: pretvorena ideja je uvek „Postalo zadatak". */
export function ideaDisplayStage(idea: StageLike): IdeaStage {
  if (idea.convertedPageId !== null) return "postalo_zadatak";
  return idea.stage ?? "predlog";
}

/** U koje faze ideja sme da pređe rukom; pretvorena — nijedna. */
export function stageTargets(from: IdeaStage): IdeaStoredStage[] {
  if (from === "postalo_zadatak") return [];
  return IDEA_STORED_STAGES.filter((stage) => stage !== from);
}

/** Grupe po prikazanoj fazi; svaka grupa čuva ulazni redosled. */
export function groupIdeasByStage<T extends StageLike>(
  ideas: readonly T[],
): Record<IdeaStage, T[]> {
  const groups: Record<IdeaStage, T[]> = {
    predlog: [],
    razmatra_se: [],
    odobreno: [],
    postalo_zadatak: [],
    odbijeno: [],
  };
  for (const idea of ideas) groups[ideaDisplayStage(idea)].push(idea);
  return groups;
}

export type IdeaStagePerm = { allowed: true } | { allowed: false; reason: string };

/**
 * Ko sme da menja fazu i da pretvori ideju (za prikaz; server odlučuje):
 * autor ili menadžer (vlasnik startupa / admin), dok ideja nije pretvorena;
 * „Pretvori" još i samo u fazi „Odobreno".
 */
export function ideaStagePermissions(input: {
  isAuthor: boolean;
  isManager: boolean;
  stage?: IdeaStoredStage | null;
  convertedPageId: string | null;
}): { setStage: IdeaStagePerm; convert: IdeaStagePerm } {
  if (input.convertedPageId !== null) {
    const done: IdeaStagePerm = { allowed: false, reason: IDEA_CONVERTED_REASON };
    return { setStage: done, convert: done };
  }
  const responsible = input.isAuthor || input.isManager;
  const setStage: IdeaStagePerm = responsible
    ? { allowed: true }
    : { allowed: false, reason: IDEA_STAGE_CHANGE_REASON };
  const convert: IdeaStagePerm = !responsible
    ? { allowed: false, reason: IDEA_CONVERT_REASON }
    : (input.stage ?? "predlog") !== "odobreno"
      ? { allowed: false, reason: IDEA_CONVERT_STAGE_REASON }
      : { allowed: true };
  return { setStage, convert };
}
