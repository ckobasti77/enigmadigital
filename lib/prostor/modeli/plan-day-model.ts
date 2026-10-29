// Preneto iz Devotion apps/web/components/me/plan-day/plan-day-model.ts (main @ c05c40f), SPAJANJE S19.
/**
 * „Isplaniraj dan" (plan K07 §2) — predlozi i „Preneto od ranije" iz istog
 * `myDay.overview`, kroz shared funkcije (`planSuggestions`,
 * `carryOverCandidates`). Pravila su od K12 u `@devotion/shared`
 * (`my-day-plan.ts`), da ih telefon deli; ovde ostaju isti izvozi.
 */
export {
  buildPlanDay,
  groupSuggestions,
  MY_DAY_MAX_ENTRIES,
  PLAN_SUGGESTIONS_LIMIT,
  type PlanDayCarryRow,
  type PlanDayModel,
  type PlanDaySuggestionRow,
} from "../my-day-plan";
