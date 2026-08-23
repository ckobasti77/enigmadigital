/**
 * ============================================================================
 * GOOGLE ADS PISANJE — VALIDACIJE, GRANICE, ATOMIČAN MUTATE, DVOFAZNI POZIV (GA8)
 * ============================================================================
 *
 * PRAVILO KOJE MORA DA PREŽIVI:
 * Nijedan fajl BEZ "use node" ne sme da uvozi modul KOJI IMA "use node".
 *
 * Ovaj modul NEMA "use node" i u potpunosti je testabilan offline:
 *   1. `validateOnly` UVEK prvi — kroz funkciju `runGoogleAdsMutateWithValidateOnly`,
 *      koja prvo pošalje `validateOnly: true`, i tek ako to prođe, šalje pravi poziv.
 *   2. Sve se kreira `PAUSED` — builderi hardkoduju status; nema parametra da bude drugačije.
 *   3. Atomičan mutate sa privremenim ID-jevima (`customers/{id}/campaignBudgets/-1`,
 *      `campaigns/-2`, `adGroups/-3`, `adGroupAds/-4`) sa `partialFailure: false`.
 *   4. Ograda budžeta (`GOOGLE_ADS_MAX_DAILY_BUDGET` i `BUDGET_LIMIT_CURRENCY`)
 *      sa porukom potvrde o potrošnji do 2x dnevno i do 30.4x mesečno.
 *   5. Video kampanje su READ-ONLY u API-ju — kreiranje i izmena se strogo odbijaju.
 * ============================================================================
 */

import {
  normalizeCustomerId,
  unitsToMicros,
  extractGoogleAdsApiError,
} from "./googleAdsShared";

// ── Tipovi kanala i strategija ──────────────────────────────────────────────

export const GOOGLE_ADS_ALLOWED_CHANNEL_TYPES = [
  "SEARCH",
  "PERFORMANCE_MAX",
  "DISPLAY",
  "DISCOVERY",
  "DEMAND_GEN",
  "SHOPPING",
  "SMART",
  "HOTEL",
  "LOCAL",
  "MULTI_CHANNEL",
] as const;

export type GoogleAdsAllowedChannelType =
  (typeof GOOGLE_ADS_ALLOWED_CHANNEL_TYPES)[number];

export const GOOGLE_ADS_BIDDING_STRATEGIES = [
  "MAXIMIZE_CONVERSIONS",
  "MAXIMIZE_CONVERSION_VALUE",
  "TARGET_CPA",
  "TARGET_ROAS",
  "MAXIMIZE_CLICKS",
  "MANUAL_CPC",
  "TARGET_IMPRESSION_SHARE",
] as const;

// ── Ulazni oblici ────────────────────────────────────────────────────────────

export interface GoogleAdsCampaignCreateInput {
  name: string;
  channelType: string;
  dailyBudget: number; // u standardnim novčanim jedinicama (npr. EUR)
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"
  biddingStrategyType?: string;
  targetCpa?: number;
  targetRoas?: number;
}

export interface GoogleAdsAdGroupCreateInput {
  name: string;
  type?: string; // npr. "SEARCH_STANDARD"
  cpcBid?: number; // u standardnim novčanim jedinicama
}

export interface GoogleAdsAdCreateInput {
  name?: string;
  headlines: string[]; // min 3
  descriptions: string[]; // min 2
  finalUrls: string[]; // min 1
  path1?: string;
  path2?: string;
}

export interface GoogleAdsKeywordInput {
  text: string;
  matchType: "EXACT" | "PHRASE" | "BROAD";
  cpcBid?: number;
}

export interface GoogleAdsFullCampaignCreateInput {
  customerId: string;
  campaign: GoogleAdsCampaignCreateInput;
  adGroup?: GoogleAdsAdGroupCreateInput;
  ad?: GoogleAdsAdCreateInput;
  keywords?: GoogleAdsKeywordInput[];
}

// ── Validacije (bacaju Error na srpskom PRE mreže) ─────────────────────────

function isValidDateFormat(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

export function validateGoogleAdsCampaignInput(
  input: GoogleAdsCampaignCreateInput,
): void {
  if (!input.name || !input.name.trim()) {
    throw new Error("Naziv Google Ads kampanje ne sme biti prazan.");
  }

  const rawChannel = (input.channelType || "").trim().toUpperCase();
  if (!rawChannel) {
    throw new Error("Tip kanala Google Ads kampanje (channelType) je obavezan.");
  }

  // TVRDO PRAVILO: Video kampanje su READ-ONLY u API-ju
  if (rawChannel === "VIDEO" || rawChannel.includes("VIDEO")) {
    throw new Error(
      "Video kampanje su samo za čitanje (READ-ONLY) u Google Ads API-ju. Google Ads API ne dozvoljava programsko kreiranje niti izmenu Video kampanja. Molimo podesite Video kampanje direktno na Google Ads platformi.",
    );
  }

  if (
    !(GOOGLE_ADS_ALLOWED_CHANNEL_TYPES as readonly string[]).includes(rawChannel)
  ) {
    throw new Error(
      `Nepodržan tip kanala „${input.channelType}". Dozvoljeni: ${GOOGLE_ADS_ALLOWED_CHANNEL_TYPES.join(", ")}.`,
    );
  }

  if (
    input.dailyBudget === undefined ||
    input.dailyBudget === null ||
    !Number.isFinite(input.dailyBudget) ||
    input.dailyBudget <= 0
  ) {
    throw new Error("Dnevni budžet kampanje mora biti broj veći od 0.");
  }

  if (input.startDate && input.startDate.trim()) {
    if (!isValidDateFormat(input.startDate)) {
      throw new Error(
        `Neispravan format početnog datuma „${input.startDate}". Očekuje se "YYYY-MM-DD".`,
      );
    }
  }

  if (input.endDate && input.endDate.trim()) {
    if (!isValidDateFormat(input.endDate)) {
      throw new Error(
        `Neispravan format krajnjeg datuma „${input.endDate}". Očekuje se "YYYY-MM-DD".`,
      );
    }
  }

  if (
    input.startDate &&
    input.endDate &&
    isValidDateFormat(input.startDate) &&
    isValidDateFormat(input.endDate)
  ) {
    if (input.startDate.trim() > input.endDate.trim()) {
      throw new Error(
        `Početni datum (${input.startDate}) ne može biti nakon krajnjeg datuma (${input.endDate}).`,
      );
    }
  }
}

export function validateGoogleAdsAdGroupInput(
  input: GoogleAdsAdGroupCreateInput,
): void {
  if (!input.name || !input.name.trim()) {
    throw new Error("Naziv ad grupe ne sme biti prazan.");
  }
  if (input.cpcBid !== undefined && input.cpcBid !== null) {
    if (!Number.isFinite(input.cpcBid) || input.cpcBid <= 0) {
      throw new Error("CPC bid ad grupe mora biti broj veći od 0.");
    }
  }
}

export function validateGoogleAdsAdInput(input: GoogleAdsAdCreateInput): void {
  if (!input.headlines || !Array.isArray(input.headlines) || input.headlines.length < 3) {
    throw new Error(
      "Oglas (Responsive Search Ad) mora sadržati najmanje 3 naslova (headlines).",
    );
  }
  for (let i = 0; i < input.headlines.length; i++) {
    const h = input.headlines[i];
    if (!h || !h.trim()) {
      throw new Error(`Naslov #${i + 1} oglasa ne sme biti prazan.`);
    }
    if (h.trim().length > 30) {
      throw new Error(
        `Naslov #${i + 1} („${h.trim()}" — ${h.trim().length} znaka) prelazi maksimalnu dužinu od 30 znakova.`,
      );
    }
  }

  if (!input.descriptions || !Array.isArray(input.descriptions) || input.descriptions.length < 2) {
    throw new Error(
      "Oglas (Responsive Search Ad) mora sadržati najmanje 2 opisa (descriptions).",
    );
  }
  for (let i = 0; i < input.descriptions.length; i++) {
    const d = input.descriptions[i];
    if (!d || !d.trim()) {
      throw new Error(`Opis #${i + 1} oglasa ne sme biti prazan.`);
    }
    if (d.trim().length > 90) {
      throw new Error(
        `Opis #${i + 1} (${d.trim().length} znaka) prelazi maksimalnu dužinu od 90 znakova.`,
      );
    }
  }

  if (!input.finalUrls || !Array.isArray(input.finalUrls) || input.finalUrls.length === 0) {
    throw new Error("Oglas mora sadržati najmanje jedan odredišni URL (finalUrls).");
  }
  for (let i = 0; i < input.finalUrls.length; i++) {
    const u = input.finalUrls[i];
    if (!u || !u.trim() || !/^https?:\/\//i.test(u.trim())) {
      throw new Error(
        `Odredišni URL #${i + 1} (${u}) mora biti validan link koji počinje sa http:// ili https://.`,
      );
    }
  }
}

export function validateGoogleAdsFullCreateInput(
  input: GoogleAdsFullCampaignCreateInput,
): void {
  normalizeCustomerId(input.customerId);
  validateGoogleAdsCampaignInput(input.campaign);
  if (input.adGroup) {
    validateGoogleAdsAdGroupInput(input.adGroup);
  }
  if (input.ad) {
    if (!input.adGroup) {
      throw new Error(
        "Kreiranje oglasa zahteva definisanu ad grupu unutar istog toka.",
      );
    }
    validateGoogleAdsAdInput(input.ad);
  }
  if (input.keywords && input.keywords.length > 0) {
    if (!input.adGroup) {
      throw new Error(
        "Dodavanje ključnih reči zahteva definisanu ad grupu unutar istog toka.",
      );
    }
    for (const kw of input.keywords) {
      if (!kw.text || !kw.text.trim()) {
        throw new Error("Tekst ključne reči ne sme biti prazan.");
      }
      if (!["EXACT", "PHRASE", "BROAD"].includes(kw.matchType)) {
        throw new Error(
          `Nepoznat tip podudaranja za ključnu reč „${kw.text}": „${kw.matchType}". Dozvoljeni: EXACT, PHRASE, BROAD.`,
        );
      }
    }
  }
}

// ── Kapija budžeta za Google Ads kampanje ────────────────────────────────────

/**
 * Gornja granica dnevnog budžeta za nove Google Ads kampanje, u valuti granice
 * (BUDGET_LIMIT_CURRENCY). `null` znači da granica NIJE postavljena — a
 * odsustvo granice nije dozvola: kapija tada blokira kreiranje.
 */
export function getGoogleAdsMaxDailyBudget(): number | null {
  const raw = process.env.GOOGLE_ADS_MAX_DAILY_BUDGET;
  if (raw === undefined || raw.trim() === "") return null;
  const val = parseFloat(raw);
  if (!Number.isFinite(val) || val <= 0) return null;
  return val;
}

export interface GoogleAdsBudgetGateInput {
  /** Valuta izabranog naloga; "" kada nije poznata. */
  accountCurrency: string;
  /** Valuta u kojoj je izražena granica (BUDGET_LIMIT_CURRENCY). */
  limitCurrency: string;
  /** Gornja granica; `null` kada GOOGLE_ADS_MAX_DAILY_BUDGET nije postavljen. */
  maxDailyBudget: number | null;
  /** Donja granica (BUDGET_MIN). */
  minBudget: number;
  /** Dnevni budžet u valuti naloga (jedinice, ne mikrosi). */
  dailyBudget: number;
}

export interface GoogleAdsBudgetGateResult {
  ok: boolean;
  code?:
    | "currency_unknown"
    | "currency_mismatch"
    | "max_budget_unset"
    | "invalid_budget"
    | "below_min"
    | "budget_over_limit";
  message?: string;
  confirmationWarning?: string;
}

/**
 * Generiše obavezno upozorenje o Google potrošnji (2x dnevno, 30.4x mesečno).
 */
export function formatGoogleAdsBudgetConfirmation(
  dailyBudget: number,
  currency: string,
): string {
  const dailyMax = (dailyBudget * 2).toFixed(2);
  const monthlyMax = (dailyBudget * 30.4).toFixed(2);
  return `Važna napomena o potrošnji: Google u jednom danu može potrošiti do 2x dnevnog budžeta (do ${dailyMax} ${currency}), a mesečno do dnevni × 30.4 (do ${monthlyMax} ${currency}).`;
}

/**
 * Evaluira ograde budžeta pre slanja zahteva Google Ads API-ju.
 *
 * Pravila (B4):
 *   - Valuta naloga mora biti poznata; nepoznata valuta BLOKIRA.
 *   - Valuta naloga mora da se poklopi sa valutom granice (BUDGET_LIMIT_CURRENCY); nepoklapanje BLOKIRA.
 *   - Poređenje se vrši u jedinicama valute, nikada u mikrosima.
 *   - Odsustvo granice (maxDailyBudget === null) BLOKIRA.
 *   - Poruka potvrde OBAVEZNO sadrži upozorenje o 2x i × 30.4.
 */
export function evaluateGoogleAdsBudgetGate(
  input: GoogleAdsBudgetGateInput,
): GoogleAdsBudgetGateResult {
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
        "Kreiranje kampanja je isključeno jer GOOGLE_ADS_MAX_DAILY_BUDGET nije postavljen. Odsustvo granice nije dozvola — postavi gornju granicu dnevnog budžeta.",
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
      message: `Dnevni budžet (${input.dailyBudget} ${accountCurrency}) prelazi granicu od ${input.maxDailyBudget} ${limitCurrency} (GOOGLE_ADS_MAX_DAILY_BUDGET).`,
    };
  }

  return {
    ok: true,
    confirmationWarning: formatGoogleAdsBudgetConfirmation(
      input.dailyBudget,
      accountCurrency,
    ),
  };
}

// ── Builderi atomičnih Mutate Payload-a (B2, B3) ─────────────────────────────

export interface GoogleAdsMutatePayload {
  mutateOperations: Array<Record<string, unknown>>;
  partialFailure: false;
  validateOnly?: boolean;
}

/**
 * Gradi atomičan mutate payload za Google Ads API sa privremenim negativnim ID-jevima.
 *
 * Pravila:
 *   - B2: Kampanja, ad grupa, oglas — SVI sa statusom "PAUSED". Nema parametra da bude drugačije.
 *   - B3: Negativni resource name-ovi unutar JEDNOG mutate poziva:
 *         `customers/{customerId}/campaignBudgets/-1`
 *         `customers/{customerId}/campaigns/-2`
 *         `customers/{customerId}/adGroups/-3`
 *   - partialFailure je OBAVEZNO false.
 */
export function buildGoogleAdsCampaignMutatePayload(
  input: GoogleAdsFullCampaignCreateInput,
): GoogleAdsMutatePayload {
  validateGoogleAdsFullCreateInput(input);

  const cleanCustomerId = normalizeCustomerId(input.customerId);
  const budgetTempResource = `customers/${cleanCustomerId}/campaignBudgets/-1`;
  const campaignTempResource = `customers/${cleanCustomerId}/campaigns/-2`;
  const adGroupTempResource = `customers/${cleanCustomerId}/adGroups/-3`;

  const operations: Array<Record<string, unknown>> = [];

  // 1. Campaign Budget Operation (Temp ID -1)
  const amountMicros = unitsToMicros(input.campaign.dailyBudget);
  operations.push({
    campaignBudgetOperation: {
      create: {
        resourceName: budgetTempResource,
        name: `${input.campaign.name} (Budžet)`,
        amountMicros: String(amountMicros),
        deliveryMethod: "STANDARD",
        explicitlyShared: false,
      },
    },
  });

  // 2. Campaign Operation (Temp ID -2) — UVEK status: "PAUSED"
  const campaignCreateObj: Record<string, unknown> = {
    resourceName: campaignTempResource,
    name: input.campaign.name.trim(),
    status: "PAUSED",
    advertisingChannelType: input.campaign.channelType.trim().toUpperCase(),
    campaignBudget: budgetTempResource,
  };

  if (input.campaign.startDate && input.campaign.startDate.trim()) {
    campaignCreateObj.startDate = input.campaign.startDate.trim();
  }
  if (input.campaign.endDate && input.campaign.endDate.trim()) {
    campaignCreateObj.endDate = input.campaign.endDate.trim();
  }

  if (input.campaign.biddingStrategyType && input.campaign.biddingStrategyType.trim()) {
    campaignCreateObj.biddingStrategyType = input.campaign.biddingStrategyType.trim();
  }

  operations.push({
    campaignOperation: {
      create: campaignCreateObj,
    },
  });

  // 3. Ad Group Operation (Temp ID -3) — UVEK status: "PAUSED"
  if (input.adGroup) {
    const adGroupCreateObj: Record<string, unknown> = {
      resourceName: adGroupTempResource,
      name: input.adGroup.name.trim(),
      campaign: campaignTempResource,
      status: "PAUSED",
      type: input.adGroup.type ? input.adGroup.type.trim() : "SEARCH_STANDARD",
    };

    if (input.adGroup.cpcBid !== undefined && input.adGroup.cpcBid !== null) {
      adGroupCreateObj.cpcBidMicros = String(unitsToMicros(input.adGroup.cpcBid));
    }

    operations.push({
      adGroupOperation: {
        create: adGroupCreateObj,
      },
    });

    // 4. Ad Group Ad Operation — UVEK status: "PAUSED"
    if (input.ad) {
      const adCreateObj: Record<string, unknown> = {
        adGroup: adGroupTempResource,
        status: "PAUSED",
        ad: {
          responsiveSearchAd: {
            headlines: input.ad.headlines.map((h) => ({ text: h.trim() })),
            descriptions: input.ad.descriptions.map((d) => ({ text: d.trim() })),
            ...(input.ad.path1 && input.ad.path1.trim() ? { path1: input.ad.path1.trim() } : {}),
            ...(input.ad.path2 && input.ad.path2.trim() ? { path2: input.ad.path2.trim() } : {}),
          },
          finalUrls: input.ad.finalUrls.map((u) => u.trim()),
          ...(input.ad.name && input.ad.name.trim() ? { name: input.ad.name.trim() } : {}),
        },
      };

      operations.push({
        adGroupAdOperation: {
          create: adCreateObj,
        },
      });
    }

    // 5. Ad Group Criteria (Keywords) — UVEK status: "PAUSED"
    if (input.keywords && Array.isArray(input.keywords)) {
      for (const kw of input.keywords) {
        operations.push({
          adGroupCriterionOperation: {
            create: {
              adGroup: adGroupTempResource,
              status: "PAUSED",
              keyword: {
                text: kw.text.trim(),
                matchType: kw.matchType,
              },
              ...(kw.cpcBid !== undefined && kw.cpcBid !== null
                ? { cpcBidMicros: String(unitsToMicros(kw.cpcBid)) }
                : {}),
            },
          },
        });
      }
    }
  }

  return {
    mutateOperations: operations,
    partialFailure: false,
  };
}

/**
 * Gradi payload za promenu statusa (pauziranje / aktiviranje) Google Ads kampanje.
 * Video kampanje se odbijaju sa objašnjenjem.
 */
export function buildGoogleAdsCampaignStatusMutatePayload(
  customerId: string,
  campaignId: string,
  desiredStatus: "ACTIVE" | "PAUSED",
  advertisingChannelType?: string,
): GoogleAdsMutatePayload {
  const cleanCustomerId = normalizeCustomerId(customerId);
  const cleanCampaignId = campaignId.trim().replace(/^customers\/\d+\/campaigns\//, "");

  if (
    advertisingChannelType &&
    (advertisingChannelType.toUpperCase() === "VIDEO" ||
      advertisingChannelType.toUpperCase().includes("VIDEO"))
  ) {
    throw new Error(
      "Video kampanje su samo za čitanje (READ-ONLY) u Google Ads API-ju. Izmena statusa Video kampanja nije podržana kroz API.",
    );
  }

  const gadsStatus = desiredStatus === "ACTIVE" ? "ENABLED" : "PAUSED";
  const resourceName = `customers/${cleanCustomerId}/campaigns/${cleanCampaignId}`;

  return {
    mutateOperations: [
      {
        campaignOperation: {
          update: {
            resourceName,
            status: gadsStatus,
          },
          updateMask: "status",
        },
      },
    ],
    partialFailure: false,
  };
}

/**
 * Gradi payload za promenu budžeta postojeće Google Ads kampanje.
 */
export function buildGoogleAdsBudgetChangeMutatePayload(
  customerId: string,
  budgetId: string,
  newDailyBudget: number,
): GoogleAdsMutatePayload {
  const cleanCustomerId = normalizeCustomerId(customerId);
  const cleanBudgetId = budgetId.trim().replace(/^customers\/\d+\/campaignBudgets\//, "");

  if (!Number.isFinite(newDailyBudget) || newDailyBudget <= 0) {
    throw new Error("Novi dnevni budžet mora biti broj veći od 0.");
  }

  const amountMicros = unitsToMicros(newDailyBudget);
  const resourceName = `customers/${cleanCustomerId}/campaignBudgets/${cleanBudgetId}`;

  return {
    mutateOperations: [
      {
        campaignBudgetOperation: {
          update: {
            resourceName,
            amountMicros: String(amountMicros),
          },
          updateMask: "amount_micros",
        },
      },
    ],
    partialFailure: false,
  };
}

// ── Jedini put ka Google Ads API-ju: validateOnly pa pravi poziv (B1) ────────

export type GoogleAdsFetchImpl = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface GoogleAdsMutateResult {
  mutateOperationResponses?: Array<Record<string, unknown>>;
  results?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface GoogleAdsValidateOnlyResult {
  ok: boolean;
  error?: string;
}

/**
 * Suvi prolaz sa `validateOnly: true` — ništa se ne kreira i ništa se ne menja.
 * Vraća `{ ok: false, error }` umesto bacanja greške kako bi UI mogao prikazati detaljan rezime.
 */
export async function runGoogleAdsValidateOnly(
  fetchImpl: GoogleAdsFetchImpl,
  url: string,
  headers: Record<string, string>,
  payload: GoogleAdsMutatePayload,
): Promise<GoogleAdsValidateOnlyResult> {
  const validatePayload = {
    ...payload,
    validateOnly: true,
    partialFailure: false,
  };

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(validatePayload),
  });

  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = {};
  }

  if (!res.ok || json.error) {
    return {
      ok: false,
      error: extractGoogleAdsApiError(text, res.status),
    };
  }
  return { ok: true };
}

/**
 * Šalje mutate zahtev DVA puta (B1):
 *   1. `validateOnly: true` — pre-flight provera na samom Google Ads API-ju.
 *   2. Ako provera padne, pravi poziv se NIKADA ne šalje i baca se greška sa Google-ovim opisom.
 *   3. Tek ako validateOnly prođe, šalje se pravi poziv sa `validateOnly: false`.
 *
 * Ovo je JEDINI levak kroz koji prolazi bilo koje pisanje u Google Ads.
 */
export async function runGoogleAdsMutateWithValidateOnly(
  fetchImpl: GoogleAdsFetchImpl,
  url: string,
  headers: Record<string, string>,
  payload: GoogleAdsMutatePayload,
): Promise<GoogleAdsMutateResult> {
  // 1. VALIDATE ONLY UVEK PRVI
  const validation = await runGoogleAdsValidateOnly(fetchImpl, url, headers, payload);
  if (!validation.ok) {
    throw new Error(`Provera (validate_only) nije prošla: ${validation.error}`);
  }

  // 2. PRAVI POZIV — tek pošto je provera prošla
  const livePayload = {
    ...payload,
    validateOnly: false,
    partialFailure: false,
  };

  const liveRes = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(livePayload),
  });

  const liveText = await liveRes.text();
  let liveJson: any = {};
  try {
    liveJson = JSON.parse(liveText);
  } catch {
    liveJson = {};
  }

  if (!liveRes.ok || liveJson.error) {
    throw new Error(
      `Kreiranje / izmena u Google Ads nije uspela: ${extractGoogleAdsApiError(liveText, liveRes.status)}`,
    );
  }

  return liveJson;
}
