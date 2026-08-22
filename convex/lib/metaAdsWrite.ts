/**
 * ============================================================================
 * META ADS PISANJE — VALIDACIJE, GRANICE, BUILDERI, DVOFAZNI POZIV (MA8)
 * ============================================================================
 *
 * Ovo je jedini modul kroz koji prolazi kreiranje kampanja, ad setova i oglasa.
 * Sve je čisto i testabilno: nijedna funkcija ne dodiruje bazu, a jedina koja
 * dodiruje mrežu (`runCreateWithValidateOnly`) prima `fetchImpl` spolja, pa se
 * i ona pokreće u testu bez živog naloga.
 *
 * DVA PRAVILA KOJA OVAJ MODUL FIZIČKI SPROVODI:
 *   1. `validate_only` UVEK prvi — kroz jednu funkciju `runCreateWithValidateOnly`,
 *      koja prvo pošalje `execution_options=["validate_only"]`, i tek ako to
 *      prođe, šalje pravi poziv. Nijedan create ne može da je zaobiđe.
 *   2. Sve se kreira `PAUSED` — builderi hardkoduju status; nema parametra da
 *      bude drugačije.
 *
 * Validacije bacaju običan `Error` sa porukom na srpskom (isti obrazac kao
 * `validateLookalikeSpec` u metaAdsApi.ts). Akcijski sloj ih hvata i prepakuje
 * u `ConvexError`.
 * ============================================================================
 */

import { extractMetaAdsError } from "./metaAdsApi";

// ── Dozvoljeni skupovi (Meta Marketing API v25, ODAX) ───────────────────────

/** Outcome-driven ciljevi. App promocija je izostavljena — nemamo aplikaciju. */
export const CAMPAIGN_OBJECTIVES = [
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
  "OUTCOME_LEADS",
  "OUTCOME_SALES",
] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

/**
 * Članovi `special_ad_categories`. Prazan niz je validna vrednost (nijedna
 * kategorija); izostanak (undefined) NIJE — Meta traži da parametar postoji.
 */
export const SPECIAL_AD_CATEGORIES = [
  "HOUSING",
  "EMPLOYMENT",
  "CREDIT",
  "ISSUES_ELECTIONS_POLITICS",
  "ONLINE_GAMBLING_AND_GAMING",
  "FINANCIAL_PRODUCTS_SERVICES",
] as const;

export const BILLING_EVENTS = [
  "IMPRESSIONS",
  "LINK_CLICKS",
  "THRUPLAY",
  "POST_ENGAGEMENT",
] as const;
export type BillingEvent = (typeof BILLING_EVENTS)[number];

export const OPTIMIZATION_GOALS = [
  "REACH",
  "IMPRESSIONS",
  "LINK_CLICKS",
  "LANDING_PAGE_VIEWS",
  "POST_ENGAGEMENT",
  "THRUPLAY",
  "OFFSITE_CONVERSIONS",
  "VALUE",
  "LEAD_GENERATION",
  "QUALITY_LEAD",
] as const;
export type OptimizationGoal = (typeof OPTIMIZATION_GOALS)[number];

/** CTA tipovi koje UI nudi za link-kreativ. */
export const CALL_TO_ACTION_TYPES = [
  "LEARN_MORE",
  "SHOP_NOW",
  "SIGN_UP",
  "SUBSCRIBE",
  "BOOK_TRAVEL",
  "DOWNLOAD",
  "GET_OFFER",
  "CONTACT_US",
  "SEND_MESSAGE",
  "APPLY_NOW",
  "GET_QUOTE",
  "ORDER_NOW",
  "WATCH_MORE",
  "NO_BUTTON",
] as const;

/**
 * Kompatibilnost `billing_event → optimization_goal`.
 *
 * IMPRESSIONS naplata ide sa svim optimizacijama; ostale su uže. Ovo je
 * konzervativna kod-provera koja korisniku da jasnu poruku pre nego što ista
 * greška stigne iz Metinog validate_only-a.
 */
const BILLING_OPTIMIZATION_COMPAT: Record<BillingEvent, readonly OptimizationGoal[]> = {
  IMPRESSIONS: OPTIMIZATION_GOALS,
  LINK_CLICKS: ["LINK_CLICKS", "LANDING_PAGE_VIEWS"],
  THRUPLAY: ["THRUPLAY"],
  POST_ENGAGEMENT: ["POST_ENGAGEMENT"],
};

/** Optimizacije koje TRAŽE piksel + custom_event_type u promoted_object. */
const REQUIRES_PIXEL: readonly OptimizationGoal[] = [
  "OFFSITE_CONVERSIONS",
  "VALUE",
  "QUALITY_LEAD",
];

/** Optimizacije koje TRAŽE page_id u promoted_object (instant forme). */
const REQUIRES_PAGE: readonly OptimizationGoal[] = ["LEAD_GENERATION"];

/** Cilj koji zahteva promoted_object bilo koje vrste. */
export function isConversionOptimizationGoal(goal: string): boolean {
  return (
    (REQUIRES_PIXEL as readonly string[]).includes(goal) ||
    (REQUIRES_PAGE as readonly string[]).includes(goal)
  );
}

/** Optimizacije dozvoljene za dati billing_event (za UI i validaciju). */
export function allowedOptimizationGoalsForBilling(
  billingEvent: string,
): readonly OptimizationGoal[] {
  return BILLING_OPTIMIZATION_COMPAT[billingEvent as BillingEvent] ?? [];
}

// ── Ulazni oblici ────────────────────────────────────────────────────────────

export interface CampaignCreateInput {
  name: string;
  objective: string;
  /** Mora biti niz (prazan je ok). undefined baca — izostanak nije dozvola. */
  specialAdCategories: string[] | undefined;
}

export interface PromotedObjectInput {
  pixelId?: string;
  customEventType?: string;
  pageId?: string;
}

export interface AdSetCreateInput {
  name: string;
  /** U valuti naloga (ne u centima); daily XOR lifetime, nikad oba, nikad nijedan. */
  dailyBudget?: number;
  lifetimeBudget?: number;
  billingEvent: string;
  optimizationGoal: string;
  /** Mora imati bar `geo_locations`. */
  targeting?: Record<string, unknown>;
  promotedObject?: PromotedObjectInput;
  /** ISO string; obavezan kada je zadat lifetimeBudget. */
  endTime?: string;
}

export type AdCreativeInput =
  | { kind: "existing_post"; objectStoryId: string }
  | {
      kind: "link";
      pageId: string;
      instagramActorId?: string;
      link: string;
      message: string;
      name?: string;
      description?: string;
      imageHash?: string;
      picture?: string;
      callToActionType?: string;
    };

export interface AdCreateInput {
  name: string;
  creative: AdCreativeInput;
  /**
   * Orkestrator postavlja `true` jer je oglas zakačen na ad set koji je upravo
   * napravio. Standalone poziv sa `false` se odbija — pravilo „ad set koji smo
   * mi kreirali".
   */
  adSetCreatedInThisFlow: boolean;
}

// ── Validacije (bacaju Error na srpskom, PRE mreže) ─────────────────────────

export function validateCampaignInput(input: CampaignCreateInput): void {
  if (!input.name || !input.name.trim()) {
    throw new Error("Naziv kampanje ne sme biti prazan.");
  }
  if (!(CAMPAIGN_OBJECTIVES as readonly string[]).includes(input.objective)) {
    throw new Error(
      `Nepoznat cilj kampanje „${input.objective}". Dozvoljeni ciljevi: ${CAMPAIGN_OBJECTIVES.join(", ")}.`,
    );
  }
  // special_ad_categories je OBAVEZAN parametar; prazan niz je validan, izostanak nije.
  if (input.specialAdCategories === undefined || !Array.isArray(input.specialAdCategories)) {
    throw new Error(
      "special_ad_categories je obavezan parametar (prazan niz je validna vrednost, izostanak nije). Ako kampanja ne spada ni u jednu posebnu kategoriju, prosledi prazan niz.",
    );
  }
  for (const cat of input.specialAdCategories) {
    if (!(SPECIAL_AD_CATEGORIES as readonly string[]).includes(cat)) {
      throw new Error(
        `Nepoznata posebna kategorija oglasa „${cat}". Dozvoljene: ${SPECIAL_AD_CATEGORIES.join(", ")}.`,
      );
    }
  }
}

export function validateAdSetInput(input: AdSetCreateInput): void {
  if (!input.name || !input.name.trim()) {
    throw new Error("Naziv ad seta ne sme biti prazan.");
  }

  const hasDaily =
    input.dailyBudget !== undefined && input.dailyBudget !== null;
  const hasLifetime =
    input.lifetimeBudget !== undefined && input.lifetimeBudget !== null;

  if (hasDaily && hasLifetime) {
    throw new Error(
      "Ad set mora imati ILI dnevni (daily_budget) ILI ukupni (lifetime_budget) budžet, nikada oba istovremeno.",
    );
  }
  if (!hasDaily && !hasLifetime) {
    throw new Error(
      "Ad set mora imati budžet: zadaj dnevni (daily_budget) ili ukupni (lifetime_budget).",
    );
  }
  const budgetVal = hasDaily ? input.dailyBudget! : input.lifetimeBudget!;
  if (!Number.isFinite(budgetVal) || budgetVal <= 0) {
    throw new Error("Budžet ad seta mora biti broj veći od 0.");
  }
  if (hasLifetime && (!input.endTime || !input.endTime.trim())) {
    throw new Error(
      "Kada je zadat ukupni budžet (lifetime_budget), obavezno je i vreme završetka (end_time).",
    );
  }

  if (!(BILLING_EVENTS as readonly string[]).includes(input.billingEvent)) {
    throw new Error(
      `Nepoznat događaj naplate (billing_event) „${input.billingEvent}". Dozvoljeni: ${BILLING_EVENTS.join(", ")}.`,
    );
  }
  if (!(OPTIMIZATION_GOALS as readonly string[]).includes(input.optimizationGoal)) {
    throw new Error(
      `Nepoznat cilj optimizacije (optimization_goal) „${input.optimizationGoal}". Dozvoljeni: ${OPTIMIZATION_GOALS.join(", ")}.`,
    );
  }
  const allowedGoals = allowedOptimizationGoalsForBilling(input.billingEvent);
  if (!(allowedGoals as readonly string[]).includes(input.optimizationGoal)) {
    throw new Error(
      `Naplata „${input.billingEvent}" nije kompatibilna sa optimizacijom „${input.optimizationGoal}". Za ovu naplatu dozvoljene optimizacije: ${allowedGoals.join(", ") || "(nijedna)"}.`,
    );
  }

  const geo =
    input.targeting && typeof input.targeting === "object"
      ? (input.targeting as Record<string, unknown>).geo_locations
      : undefined;
  const hasGeo =
    geo !== undefined &&
    geo !== null &&
    (typeof geo !== "object" || Object.keys(geo as object).length > 0);
  if (!hasGeo) {
    throw new Error(
      "Ciljanje (targeting) mora sadržati bar geografske lokacije (geo_locations).",
    );
  }

  if (isConversionOptimizationGoal(input.optimizationGoal)) {
    const po = input.promotedObject;
    if (!po) {
      throw new Error(
        `Optimizacija „${input.optimizationGoal}" je konverziona i zahteva promoted_object. Izaberi piksel i događaj konverzije (ili stranicu za lidove).`,
      );
    }
    if ((REQUIRES_PIXEL as readonly string[]).includes(input.optimizationGoal)) {
      if (!po.pixelId || !po.pixelId.trim()) {
        throw new Error(
          `Optimizacija „${input.optimizationGoal}" zahteva izabran piksel (pixel_id) u promoted_object.`,
        );
      }
      if (!po.customEventType || !po.customEventType.trim()) {
        throw new Error(
          `Optimizacija „${input.optimizationGoal}" zahteva događaj konverzije (custom_event_type) u promoted_object.`,
        );
      }
    }
    if (
      (REQUIRES_PAGE as readonly string[]).includes(input.optimizationGoal) &&
      (!po.pageId || !po.pageId.trim())
    ) {
      throw new Error(
        `Optimizacija „${input.optimizationGoal}" zahteva Facebook stranicu (page_id) u promoted_object.`,
      );
    }
  }
}

export function validateAdInput(input: AdCreateInput): void {
  if (!input.name || !input.name.trim()) {
    throw new Error("Naziv oglasa ne sme biti prazan.");
  }
  if (input.adSetCreatedInThisFlow !== true) {
    throw new Error(
      "Oglas se može kreirati samo unutar ad seta koji je ovaj čarobnjak upravo napravio.",
    );
  }

  const c = input.creative;
  if (!c || typeof c !== "object") {
    throw new Error(
      "Oglas mora imati kreativ sa validnim object_story_spec ili object_story_id.",
    );
  }
  if (c.kind === "existing_post") {
    if (!c.objectStoryId || !c.objectStoryId.trim()) {
      throw new Error(
        "Za promociju postojeće objave neophodan je object_story_id (u obliku <page_id>_<post_id>).",
      );
    }
    if (!c.objectStoryId.includes("_")) {
      throw new Error(
        `object_story_id „${c.objectStoryId}" nije u očekivanom obliku <page_id>_<post_id>.`,
      );
    }
  } else if (c.kind === "link") {
    if (!c.pageId || !c.pageId.trim()) {
      throw new Error("Link-kreativ mora imati Facebook stranicu (page_id).");
    }
    if (!c.link || !c.link.trim()) {
      throw new Error("Link-kreativ mora imati odredišni link.");
    }
    if (!/^https?:\/\//i.test(c.link.trim())) {
      throw new Error("Odredišni link mora počinjati sa http:// ili https://.");
    }
    if (!c.message || !c.message.trim()) {
      throw new Error("Link-kreativ mora imati primarni tekst (message).");
    }
    if (
      c.callToActionType &&
      !(CALL_TO_ACTION_TYPES as readonly string[]).includes(c.callToActionType)
    ) {
      throw new Error(
        `Nepoznat tip dugmeta (call_to_action) „${c.callToActionType}". Dozvoljeni: ${CALL_TO_ACTION_TYPES.join(", ")}.`,
      );
    }
  } else {
    throw new Error(
      "Oglas mora imati kreativ sa validnim object_story_spec ili object_story_id.",
    );
  }
}

// ── Kapija budžeta za NOVE kampanje ─────────────────────────────────────────

/**
 * Gornja granica dnevnog budžeta za nove kampanje, u valuti granice
 * (BUDGET_LIMIT_CURRENCY). `null` znači da granica NIJE postavljena — a
 * odsustvo granice nije dozvola: kapija tada blokira kreiranje.
 */
export function getMetaAdsMaxDailyBudget(): number | null {
  const raw = process.env.META_ADS_MAX_DAILY_BUDGET;
  if (raw === undefined || raw.trim() === "") return null;
  const val = parseFloat(raw);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val;
}

export interface CreateBudgetGateInput {
  /** Valuta izabranog naloga; "" kada nije poznata. */
  accountCurrency: string;
  /** Valuta u kojoj je izražena granica (BUDGET_LIMIT_CURRENCY). */
  limitCurrency: string;
  /** Gornja granica; `null` kada META_ADS_MAX_DAILY_BUDGET nije postavljen. */
  maxDailyBudget: number | null;
  /** Donja granica (BUDGET_MIN). */
  minBudget: number;
  /** Dnevni budžet ad seta u valuti naloga. */
  dailyBudget: number;
}

export interface CreateBudgetGateResult {
  ok: boolean;
  code?:
    | "currency_unknown"
    | "currency_mismatch"
    | "max_budget_unset"
    | "invalid_budget"
    | "below_min"
    | "budget_over_limit";
  message?: string;
}

/**
 * Redosled je namerno: prvo valuta (bez nje brojevi nemaju značenje), pa
 * postojanje granice (odsustvo blokira), pa iznos.
 */
export function evaluateCreateBudgetGate(
  input: CreateBudgetGateInput,
): CreateBudgetGateResult {
  const accountCurrency = (input.accountCurrency || "").trim().toUpperCase();
  const limitCurrency = (input.limitCurrency || "").trim().toUpperCase();

  if (!accountCurrency) {
    return {
      ok: false,
      code: "currency_unknown",
      message:
        "Valuta naloga nije poznata, pa granice budžeta ne mogu da se provere. Pokreni sinhronizaciju naloga pa pokušaj ponovo.",
    };
  }
  if (accountCurrency !== limitCurrency) {
    return {
      ok: false,
      code: "currency_mismatch",
      message: `Granica budžeta je zadata u ${limitCurrency}, a nalog radi u ${accountCurrency}. Podesi granicu u valuti naloga; konverzija po kursu se ne radi.`,
    };
  }
  if (input.maxDailyBudget === null) {
    return {
      ok: false,
      code: "max_budget_unset",
      message:
        "Kreiranje kampanja je isključeno jer META_ADS_MAX_DAILY_BUDGET nije postavljen. Odsustvo granice nije dozvola — postavi gornju granicu dnevnog budžeta.",
    };
  }
  if (!Number.isFinite(input.dailyBudget) || input.dailyBudget <= 0) {
    return {
      ok: false,
      code: "invalid_budget",
      message: "Dnevni budžet mora biti broj veći od 0.",
    };
  }
  if (input.dailyBudget < input.minBudget) {
    return {
      ok: false,
      code: "below_min",
      message: `Dnevni budžet (${input.dailyBudget} ${accountCurrency}) je ispod minimuma od ${input.minBudget} ${accountCurrency} (BUDGET_MIN).`,
    };
  }
  if (input.dailyBudget > input.maxDailyBudget) {
    return {
      ok: false,
      code: "budget_over_limit",
      message: `Dnevni budžet (${input.dailyBudget} ${accountCurrency}) prelazi granicu od ${input.maxDailyBudget} ${limitCurrency} (META_ADS_MAX_DAILY_BUDGET).`,
    };
  }
  return { ok: true };
}

// ── Builderi payload-a (UVEK status PAUSED) ─────────────────────────────────

/** Meta očekuje budžet u centima. */
function toBudgetCents(amount: number): string {
  return String(Math.round(amount * 100));
}

/**
 * Parametri za POST /act_/campaigns. Status je hardkodovan na PAUSED — nema
 * načina da ga pozivalac promeni.
 */
export function buildCampaignParams(input: CampaignCreateInput): URLSearchParams {
  const params = new URLSearchParams();
  params.set("name", input.name.trim());
  params.set("objective", input.objective);
  params.set(
    "special_ad_categories",
    JSON.stringify(input.specialAdCategories ?? []),
  );
  params.set("buying_type", "AUCTION");
  params.set("status", "PAUSED");
  return params;
}

/**
 * Parametri za POST /act_/adsets. Budžet ide na ad set (ABO). Status PAUSED.
 * `startTimeIso` prosleđuje akcijski sloj (deterministički za testove).
 */
export function buildAdSetParams(
  input: AdSetCreateInput,
  campaignId: string,
  startTimeIso: string,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("name", input.name.trim());
  params.set("campaign_id", campaignId);

  if (input.dailyBudget !== undefined && input.dailyBudget !== null) {
    params.set("daily_budget", toBudgetCents(input.dailyBudget));
  } else if (input.lifetimeBudget !== undefined && input.lifetimeBudget !== null) {
    params.set("lifetime_budget", toBudgetCents(input.lifetimeBudget));
  }

  params.set("billing_event", input.billingEvent);
  params.set("optimization_goal", input.optimizationGoal);
  params.set("bid_strategy", "LOWEST_COST_WITHOUT_CAP");
  params.set("targeting", JSON.stringify(input.targeting ?? {}));
  params.set("start_time", startTimeIso);
  if (input.endTime && input.endTime.trim()) {
    params.set("end_time", input.endTime.trim());
  }

  if (input.promotedObject) {
    const po: Record<string, string> = {};
    if (input.promotedObject.pixelId) po.pixel_id = input.promotedObject.pixelId;
    if (input.promotedObject.customEventType)
      po.custom_event_type = input.promotedObject.customEventType;
    if (input.promotedObject.pageId) po.page_id = input.promotedObject.pageId;
    if (Object.keys(po).length > 0) {
      params.set("promoted_object", JSON.stringify(po));
    }
  }

  params.set("status", "PAUSED");
  return params;
}

/** Sastavlja `creative` objekat (object_story_id ili object_story_spec). */
export function buildCreativeObject(creative: AdCreativeInput): Record<string, unknown> {
  if (creative.kind === "existing_post") {
    return { object_story_id: creative.objectStoryId.trim() };
  }
  const linkData: Record<string, unknown> = {
    link: creative.link.trim(),
    message: creative.message.trim(),
  };
  if (creative.name && creative.name.trim()) linkData.name = creative.name.trim();
  if (creative.description && creative.description.trim())
    linkData.description = creative.description.trim();
  if (creative.imageHash && creative.imageHash.trim())
    linkData.image_hash = creative.imageHash.trim();
  if (creative.picture && creative.picture.trim())
    linkData.picture = creative.picture.trim();
  if (creative.callToActionType && creative.callToActionType.trim()) {
    linkData.call_to_action = {
      type: creative.callToActionType.trim(),
      value: { link: creative.link.trim() },
    };
  }

  const spec: Record<string, unknown> = {
    page_id: creative.pageId.trim(),
    link_data: linkData,
  };
  if (creative.instagramActorId && creative.instagramActorId.trim()) {
    spec.instagram_actor_id = creative.instagramActorId.trim();
  }
  return { object_story_spec: spec };
}

/**
 * Parametri za POST /act_/ads. Status PAUSED. Kreativ je inline (object_story_id
 * ili object_story_spec), pa je ceo oglas jedan auditovani objekat „create_ad".
 */
export function buildAdParams(input: AdCreateInput, adSetId: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("name", input.name.trim());
  params.set("adset_id", adSetId);
  params.set("creative", JSON.stringify(buildCreativeObject(input.creative)));
  params.set("status", "PAUSED");
  return params;
}

// ── Jedini put ka Meti: validate_only pa pravi poziv ────────────────────────

export type CreateFetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface CreateCallResult {
  id?: string;
  [key: string]: unknown;
}

export interface ValidateOnlyResult {
  ok: boolean;
  error?: string;
}

/**
 * Samo `validate_only` — ništa se ne kreira. NE baca na neuspeh validacije nego
 * vraća `{ ok:false, error }`, jer je namenjena suvom prolazu za REZIME u UI-ju.
 * `body` mora sadržati `access_token`.
 */
export async function runValidateOnly(
  fetchImpl: CreateFetchImpl,
  url: string,
  body: URLSearchParams,
): Promise<ValidateOnlyResult> {
  const validateBody = new URLSearchParams(body);
  validateBody.set("execution_options", JSON.stringify(["validate_only"]));

  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: validateBody.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: unknown;
    [key: string]: unknown;
  };
  if (!res.ok || json.error) {
    return { ok: false, error: extractMetaAdsError(json.error ?? json) };
  }
  return { ok: true };
}

/**
 * Šalje create zahtev DVA puta: prvo `validate_only`, pa tek ako to prođe —
 * pravi poziv. Ako validate_only vrati grešku, pravi poziv se NE šalje i baca
 * se Error sa Metinom porukom.
 *
 * `body` mora već da sadrži `access_token` i sve parametre. Jedina tačka kroz
 * koju ide svaki create — zato se validate_only ne može zaobići zaboravom.
 */
export async function runCreateWithValidateOnly(
  fetchImpl: CreateFetchImpl,
  url: string,
  body: URLSearchParams,
): Promise<CreateCallResult> {
  // 1. VALIDATE ONLY — ništa se ne kreira.
  const validation = await runValidateOnly(fetchImpl, url, body);
  if (!validation.ok) {
    throw new Error(`Provera (validate_only) nije prošla: ${validation.error}`);
  }

  // 2. PRAVI POZIV — tek pošto je provera prošla.
  const createRes = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const createJson = (await createRes.json().catch(() => ({}))) as CreateCallResult & {
    error?: unknown;
  };
  if (!createRes.ok || createJson.error) {
    throw new Error(
      `Kreiranje nije uspelo: ${extractMetaAdsError(createJson.error ?? createJson)}`,
    );
  }
  return createJson;
}
