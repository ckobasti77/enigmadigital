import assert from "node:assert/strict";
import {
  validateCampaignInput,
  validateAdSetInput,
  validateAdInput,
  validateThreadsPlacement,
  isObjectiveAllowedForThreads,
  evaluateCreateBudgetGate,
  getMetaAdsMaxDailyBudget,
  buildCampaignParams,
  buildAdSetParams,
  buildAdParams,
  buildCreativeObject,
  runCreateWithValidateOnly,
  type CampaignCreateInput,
  type AdSetCreateInput,
  type AdCreateInput,
  type CreateFetchImpl,
} from "../convex/lib/metaAdsWrite";
import { isKnownPlacement } from "../convex/lib/metaAdsApi";

// ── Fiksture ─────────────────────────────────────────────────────────────────

const validCampaign: CampaignCreateInput = {
  name: "Test kampanja",
  objective: "OUTCOME_TRAFFIC",
  specialAdCategories: [],
};

const validAdSet: AdSetCreateInput = {
  name: "Test ad set",
  dailyBudget: 20,
  billingEvent: "IMPRESSIONS",
  optimizationGoal: "LINK_CLICKS",
  targeting: { geo_locations: { countries: ["RS"] } },
};

const validAdExistingPost: AdCreateInput = {
  name: "Test oglas",
  creative: { kind: "existing_post", objectStoryId: "123456_7890" },
  adSetCreatedInThisFlow: true,
};

const START_TIME = "2026-08-22T10:00:00+0000";

// ── Lažni fetch za funnel ────────────────────────────────────────────────────

function fakeResponse(ok: boolean, jsonObj: unknown): Response {
  return {
    ok,
    json: async () => jsonObj,
  } as unknown as Response;
}

async function runTests() {
  console.log("Pokrećem testove za Meta PISANJE (MA8)...");

  // ── Test 1: ad set sa OBA budžeta → greška pre mreže ──────────────────────
  console.log("\n[Test 1] Ad set sa oba budžeta baca pre mreže:");
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        dailyBudget: 20,
        lifetimeBudget: 500,
      }),
    /ILI dnevni.*ILI ukupni|nikada oba/i,
    "Ad set sa daily_budget i lifetime_budget mora baciti grešku",
  );
  // A nijedan budžet takođe baca.
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        dailyBudget: undefined,
        lifetimeBudget: undefined,
      }),
    /mora imati budžet/i,
    "Ad set bez ijednog budžeta mora baciti grešku",
  );
  assert.doesNotThrow(
    () => validateAdSetInput(validAdSet),
    "Validan ad set sa samo dnevnim budžetom mora proći",
  );
  console.log("  ✓ Oba budžeta → greška; nijedan → greška; jedan → prolazi");

  // ── Test 2: kampanja bez special_ad_categories → greška ───────────────────
  console.log("\n[Test 2] Kampanja bez special_ad_categories baca:");
  assert.throws(
    () =>
      validateCampaignInput({
        name: "Bez kategorija",
        objective: "OUTCOME_TRAFFIC",
        specialAdCategories: undefined,
      }),
    /special_ad_categories je obavezan/i,
    "Izostanak special_ad_categories (undefined) mora baciti grešku",
  );
  assert.doesNotThrow(
    () => validateCampaignInput(validCampaign),
    "Prazan niz special_ad_categories je validan",
  );
  // Nepoznat cilj takođe baca.
  assert.throws(
    () => validateCampaignInput({ ...validCampaign, objective: "CONVERSIONS" }),
    /Nepoznat cilj kampanje/i,
    "Cilj van dozvoljenog skupa mora baciti grešku",
  );
  console.log("  ✓ undefined kategorije → greška; [] → prolazi; loš cilj → greška");

  // ── Test 3: META_ADS_MAX_DAILY_BUDGET nepostavljen → blokirano ─────────────
  console.log("\n[Test 3] Nepostavljen META_ADS_MAX_DAILY_BUDGET blokira kreiranje:");
  const prevEnv = process.env.META_ADS_MAX_DAILY_BUDGET;
  delete process.env.META_ADS_MAX_DAILY_BUDGET;
  assert.strictEqual(
    getMetaAdsMaxDailyBudget(),
    null,
    "getMetaAdsMaxDailyBudget() mora vratiti null kada env nije postavljen",
  );
  const gateUnset = evaluateCreateBudgetGate({
    accountCurrency: "EUR",
    limitCurrency: "EUR",
    maxDailyBudget: getMetaAdsMaxDailyBudget(),
    minBudget: 5,
    dailyBudget: 20,
  });
  assert.strictEqual(gateUnset.ok, false, "Bez granice kreiranje mora biti blokirano");
  assert.strictEqual(gateUnset.code, "max_budget_unset", "Kod mora biti max_budget_unset");
  // Prazan string i nevalidne vrednosti se takođe čitaju kao null.
  process.env.META_ADS_MAX_DAILY_BUDGET = "   ";
  assert.strictEqual(getMetaAdsMaxDailyBudget(), null, "Prazan string → null");
  process.env.META_ADS_MAX_DAILY_BUDGET = "0";
  assert.strictEqual(getMetaAdsMaxDailyBudget(), null, "0 → null (odsustvo granice nije dozvola)");
  process.env.META_ADS_MAX_DAILY_BUDGET = "50";
  assert.strictEqual(getMetaAdsMaxDailyBudget(), 50, "Validna vrednost → broj");
  if (prevEnv === undefined) delete process.env.META_ADS_MAX_DAILY_BUDGET;
  else process.env.META_ADS_MAX_DAILY_BUDGET = prevEnv;
  console.log("  ✓ Nepostavljen/prazan/0 → null → blokirano; validan → broj");

  // ── Test 4: budžet iznad granice → blokirano ──────────────────────────────
  console.log("\n[Test 4] Budžet iznad granice blokira:");
  const gateOver = evaluateCreateBudgetGate({
    accountCurrency: "EUR",
    limitCurrency: "EUR",
    maxDailyBudget: 50,
    minBudget: 5,
    dailyBudget: 200,
  });
  assert.strictEqual(gateOver.ok, false);
  assert.strictEqual(gateOver.code, "budget_over_limit");
  const gateOk = evaluateCreateBudgetGate({
    accountCurrency: "EUR",
    limitCurrency: "EUR",
    maxDailyBudget: 50,
    minBudget: 5,
    dailyBudget: 20,
  });
  assert.strictEqual(gateOk.ok, true, "Budžet u granicama mora proći");
  console.log("  ✓ 200 > 50 → blokirano; 20 ≤ 50 → prolazi");

  // ── Test 5: valuta naloga nepoznata / nepoklapanje → blokirano ────────────
  console.log("\n[Test 5] Valuta blokira:");
  const gateUnknownCur = evaluateCreateBudgetGate({
    accountCurrency: "",
    limitCurrency: "EUR",
    maxDailyBudget: 50,
    minBudget: 5,
    dailyBudget: 20,
  });
  assert.strictEqual(gateUnknownCur.ok, false);
  assert.strictEqual(gateUnknownCur.code, "currency_unknown");
  const gateMismatch = evaluateCreateBudgetGate({
    accountCurrency: "RSD",
    limitCurrency: "EUR",
    maxDailyBudget: 50,
    minBudget: 5,
    dailyBudget: 20,
  });
  assert.strictEqual(gateMismatch.ok, false);
  assert.strictEqual(gateMismatch.code, "currency_mismatch");
  console.log("  ✓ '' → currency_unknown; RSD≠EUR → currency_mismatch (bez konverzije)");

  // ── Test 6: svaki kreirani objekat je PAUSED, nikad ACTIVE ────────────────
  console.log("\n[Test 6] Builderi UVEK postavljaju status=PAUSED:");
  const campParams = buildCampaignParams(validCampaign);
  assert.strictEqual(campParams.get("status"), "PAUSED", "Kampanja mora biti PAUSED");
  const adSetParams = buildAdSetParams(validAdSet, "camp_1", START_TIME);
  assert.strictEqual(adSetParams.get("status"), "PAUSED", "Ad set mora biti PAUSED");
  const adParams = buildAdParams(validAdExistingPost, "adset_1");
  assert.strictEqual(adParams.get("status"), "PAUSED", "Oglas mora biti PAUSED");
  for (const p of [campParams, adSetParams, adParams]) {
    assert.notStrictEqual(p.get("status"), "ACTIVE", "Nijedan objekat ne sme biti ACTIVE");
  }
  // Ad set nosi budžet u centima i ciljanje.
  assert.strictEqual(adSetParams.get("daily_budget"), "2000", "20 → 2000 centi");
  assert.ok(adSetParams.get("targeting")?.includes("geo_locations"));
  // Kampanja nosi special_ad_categories kao JSON niz i objective.
  assert.strictEqual(campParams.get("special_ad_categories"), "[]");
  assert.strictEqual(campParams.get("objective"), "OUTCOME_TRAFFIC");
  console.log("  ✓ Kampanja/ad set/oglas → PAUSED; budžet u centima; nikad ACTIVE");

  // ── Test 7: billing × optimization kompatibilnost ─────────────────────────
  console.log("\n[Test 7] Kompatibilnost naplate i optimizacije:");
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        billingEvent: "THRUPLAY",
        optimizationGoal: "LINK_CLICKS",
      }),
    /nije kompatibilna/i,
    "THRUPLAY + LINK_CLICKS mora baciti grešku",
  );
  assert.doesNotThrow(
    () =>
      validateAdSetInput({
        ...validAdSet,
        billingEvent: "THRUPLAY",
        optimizationGoal: "THRUPLAY",
      }),
    "THRUPLAY + THRUPLAY mora proći",
  );
  // Konverziona optimizacija bez promoted_object baca; sa pikselom prolazi.
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        billingEvent: "IMPRESSIONS",
        optimizationGoal: "OFFSITE_CONVERSIONS",
      }),
    /promoted_object/i,
    "Konverziona optimizacija bez promoted_object mora baciti grešku",
  );
  assert.doesNotThrow(
    () =>
      validateAdSetInput({
        ...validAdSet,
        billingEvent: "IMPRESSIONS",
        optimizationGoal: "OFFSITE_CONVERSIONS",
        promotedObject: { pixelId: "999", customEventType: "PURCHASE" },
      }),
    "Konverziona optimizacija sa pikselom + događajem mora proći",
  );
  console.log("  ✓ Nekompatibilan par baca; konverzija traži piksel + događaj");

  // ── Test 8: kreativ — object_story_id prolazi, ništa → greška ─────────────
  console.log("\n[Test 8] Validacija kreativa:");
  assert.doesNotThrow(
    () => validateAdInput(validAdExistingPost),
    "Validan object_story_id mora proći",
  );
  assert.throws(
    () =>
      validateAdInput({
        name: "Oglas",
        // @ts-expect-error namerno nevalidan kreativ (ni spec ni story-id)
        creative: { kind: "none" },
        adSetCreatedInThisFlow: true,
      }),
    /object_story_spec ili object_story_id/i,
    "Kreativ bez spec-a i story-id-a mora baciti grešku",
  );
  // Oglas van našeg ad seta se odbija.
  assert.throws(
    () => validateAdInput({ ...validAdExistingPost, adSetCreatedInThisFlow: false }),
    /ad seta koji je ovaj čarobnjak upravo napravio/i,
    "Oglas van ad seta koji smo kreirali mora biti odbijen",
  );
  // Link-kreativ bez http linka baca.
  assert.throws(
    () =>
      validateAdInput({
        name: "Oglas",
        creative: { kind: "link", pageId: "1", link: "example.rs", message: "tekst" },
        adSetCreatedInThisFlow: true,
      }),
    /http/i,
    "Link bez http(s) mora baciti grešku",
  );
  console.log("  ✓ object_story_id prolazi; prazan kreativ i tuđ ad set → greška");

  // ── Test 9: funnel — validate_only PRVI, pravi poziv se ne šalje ako padne ─
  console.log("\n[Test 9] runCreateWithValidateOnly: validate_only prvi, ne zaobilazi se:");
  {
    // 9a. validate_only padne → pravi poziv se NE šalje.
    const calls: string[] = [];
    const failingValidate: CreateFetchImpl = async (_url, init) => {
      const body = String(init?.body ?? "");
      calls.push(body);
      // Prvi (validate_only) poziv vraća grešku.
      return fakeResponse(false, { error: { message: "Neispravan objective" } });
    };
    await assert.rejects(
      () =>
        runCreateWithValidateOnly(
          failingValidate,
          "https://graph.facebook.com/v25.0/act_1/campaigns",
          new URLSearchParams({ name: "x", access_token: "t" }),
        ),
      /validate_only/i,
      "Pad validate_only-a mora baciti grešku",
    );
    assert.strictEqual(calls.length, 1, "Pravi poziv se NE sme poslati kada validate_only padne");
    assert.ok(
      calls[0].includes("execution_options"),
      "Jedini poziv mora biti validate_only (nosi execution_options)",
    );
  }
  {
    // 9b. validate_only prođe → pravi poziv se šalje bez execution_options → vraća id.
    const calls: string[] = [];
    let n = 0;
    const okFetch: CreateFetchImpl = async (_url, init) => {
      const body = String(init?.body ?? "");
      calls.push(body);
      n += 1;
      if (n === 1) return fakeResponse(true, { success: true }); // validate_only
      return fakeResponse(true, { id: "camp_123" }); // pravi poziv
    };
    const res = await runCreateWithValidateOnly(
      okFetch,
      "https://graph.facebook.com/v25.0/act_1/campaigns",
      new URLSearchParams({ name: "x", access_token: "t" }),
    );
    assert.strictEqual(res.id, "camp_123", "Pravi poziv mora vratiti id");
    assert.strictEqual(calls.length, 2, "Mora biti tačno dva poziva: validate_only pa pravi");
    assert.ok(calls[0].includes("execution_options"), "Prvi poziv je validate_only");
    assert.ok(!calls[1].includes("execution_options"), "Drugi (pravi) poziv nema execution_options");
  }
  console.log("  ✓ Pad provere → nema pravog poziva; prolaz → validate pa pravi (id)");

  // ── Test 10: Threads placement pravila u targeting-u ─────────────────────
  console.log("\n[Test 10] Threads placement pravila (§10.1):");
  // 10a. threads_positions prima ISKLJUČIVO ["threads_stream"]
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
          threads_positions: ["stream"], // loša pozicija
        },
      }),
    /Jedina dozvoljena vrednost za threads_positions je \["threads_stream"\]/i,
    "threads_positions van threads_stream mora baciti grešku",
  );
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
          threads_positions: [], // prazan niz
        },
      }),
    /threads_positions ne sme biti prazan niz/i,
    "Prazan threads_positions mora baciti grešku",
  );
  // 10b. Threads se NE kupuje sam: bez instagrama baca
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["threads"], // samo threads
          threads_positions: ["threads_stream"],
        },
      }),
    /Threads placement se ne može kupiti samostalno.*instagram.*mora/i,
    "Kupovina Threads placement-a bez Instagrama mora baciti grešku",
  );
  // 10c. Bez instagram stream pozicije baca
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["story"], // nema stream
          threads_positions: ["threads_stream"],
        },
      }),
    /instagram_positions mora sadržati „stream”/i,
    "Instagram bez stream pozicije uz Threads mora baciti grešku",
  );
  // 10d. Ispravna kombinacija prolazi
  assert.doesNotThrow(
    () =>
      validateAdSetInput({
        ...validAdSet,
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
          threads_positions: ["threads_stream"],
        },
      }),
    "Ispravan Threads placement mora proći validaciju",
  );
  console.log("  ✓ threads_positions=['threads_stream'] jedino dozvoljeno; Threads bez IG ili IG stream-a odbijen");

  // ── Test 11: effective_threads_positions je READ-ONLY ────────────────────
  console.log("\n[Test 11] effective_threads_positions je read-only:");
  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        targeting: {
          geo_locations: { countries: ["RS"] },
          effective_threads_positions: ["threads_stream"],
        },
      }),
    /effective_threads_positions.*read-only/i,
    "Slanje effective_threads_positions u ad set inputu mora baciti grešku",
  );
  // buildAdSetParams nikada ne šalje effective_threads_positions
  const threadsAdSetParams = buildAdSetParams(
    {
      ...validAdSet,
      targeting: {
        geo_locations: { countries: ["RS"] },
        publisher_platforms: ["instagram", "threads"],
        instagram_positions: ["stream"],
        threads_positions: ["threads_stream"],
        effective_threads_positions: ["threads_stream"],
      },
    },
    "camp_123",
    START_TIME,
  );
  const targetingJson = JSON.parse(threadsAdSetParams.get("targeting")!);
  assert.strictEqual(
    targetingJson.effective_threads_positions,
    undefined,
    "buildAdSetParams mora ukloniti effective_threads_positions pre serijalizacije",
  );
  console.log("  ✓ effective_threads_positions se odbija u validaciji i čisti pre slanja ka Meti");

  // ── Test 12: identitet oglasa i zabrana postojećeg posta ──────────────────
  console.log("\n[Test 12] Identitet oglasa i zabrana postojećeg posta (§10.1):");
  // 12a. threads_user_id se upisuje u object_story_spec kao autor
  const creativeObj = buildCreativeObject({
    kind: "link",
    pageId: "fb_page_1",
    instagramActorId: "ig_actor_1",
    threadsUserId: "threads_user_123",
    link: "https://example.rs",
    message: "Promo tekst",
    callToActionType: "LEARN_MORE",
  });
  const spec = (creativeObj as { object_story_spec: Record<string, unknown> }).object_story_spec;
  assert.strictEqual(
    spec.threads_user_id,
    "threads_user_123",
    "threads_user_id mora biti postavljen u object_story_spec kao autor",
  );
  assert.strictEqual(spec.page_id, "fb_page_1");
  assert.strictEqual(spec.instagram_actor_id, "ig_actor_1");

  // 12b. object_story_id se NE MOŽE koristiti za Threads oglas
  assert.throws(
    () =>
      validateAdInput({
        name: "Threads oglas iz posta",
        creative: { kind: "existing_post", objectStoryId: "123_456" },
        adSetCreatedInThisFlow: true,
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
          threads_positions: ["threads_stream"],
        },
      }),
    /Threads oglas se ne može napraviti iz postojeće objave/i,
    "Promocija postojećeg posta za Threads placement mora biti odbijena sa jasnom porukom",
  );
  assert.throws(
    () =>
      validateThreadsPlacement(
        "OUTCOME_TRAFFIC",
        {
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
        },
        { kind: "existing_post", objectStoryId: "123_456" },
      ),
    /Threads oglas se ne može napraviti iz postojeće objave/i,
    "validateThreadsPlacement mora odbiti existing_post uz threads placement",
  );
  console.log("  ✓ threads_user_id postavljen u object_story_spec; existing_post uz Threads odbijen");

  // ── Test 13: validacija cilja kampanje uz Threads placement ──────────────
  console.log("\n[Test 13] Validacija cilja kampanje za Threads (§10.1):");
  // Dozvoljeni ciljevi: OUTCOME_AWARENESS, OUTCOME_TRAFFIC, OUTCOME_SALES, OUTCOME_APP_PROMOTION
  assert.ok(isObjectiveAllowedForThreads("OUTCOME_AWARENESS"));
  assert.ok(isObjectiveAllowedForThreads("OUTCOME_TRAFFIC"));
  assert.ok(isObjectiveAllowedForThreads("OUTCOME_SALES"));
  assert.ok(isObjectiveAllowedForThreads("OUTCOME_APP_PROMOTION"));
  // Nedozvoljeni: OUTCOME_ENGAGEMENT, OUTCOME_LEADS
  assert.ok(!isObjectiveAllowedForThreads("OUTCOME_ENGAGEMENT"));
  assert.ok(!isObjectiveAllowedForThreads("OUTCOME_LEADS"));

  assert.throws(
    () =>
      validateAdSetInput({
        ...validAdSet,
        campaignObjective: "OUTCOME_ENGAGEMENT",
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
          threads_positions: ["threads_stream"],
        },
      }),
    /Threads placement nije podržan za cilj kampanje „OUTCOME_ENGAGEMENT”/i,
    "Nedozvoljen cilj kampanje uz Threads placement mora baciti grešku",
  );
  assert.doesNotThrow(
    () =>
      validateAdSetInput({
        ...validAdSet,
        campaignObjective: "OUTCOME_TRAFFIC",
        targeting: {
          geo_locations: { countries: ["RS"] },
          publisher_platforms: ["instagram", "threads"],
          instagram_positions: ["stream"],
          threads_positions: ["threads_stream"],
        },
      }),
    "Dozvoljen cilj kampanje (OUTCOME_TRAFFIC) uz Threads placement mora proći",
  );
  console.log("  ✓ OUTCOME_AWARENESS/TRAFFIC/SALES/APP_PROMOTION prolaze; OUTCOME_ENGAGEMENT/LEADS odbijeni");

  // ── Test 14: prepoznavanje poznatih placement-a (isKnownPlacement) ────────
  console.log("\n[Test 14] Prepoznavanje poznatih placement-a:");
  assert.ok(isKnownPlacement("threads", "threads_stream"), "threads::threads_stream je poznat");
  assert.ok(isKnownPlacement("instagram", "stream"), "instagram::stream je poznat");
  assert.ok(isKnownPlacement("facebook", "feed"), "facebook::feed je poznat");
  assert.ok(!isKnownPlacement("threads", "unknown_pos"), "threads::unknown_pos je nepoznat");
  assert.ok(!isKnownPlacement("tiktok", "feed"), "tiktok je nepoznata platforma");
  console.log("  ✓ threads_stream i standardni placementi prepoznati; nepoznati prijavljuju false za console.warn");

  console.log("\n✅ SVI TESTOVI ZA META PISANJE I THREADS PLACEMENT SU USPEŠNO PROŠLI!\n");
}

runTests().catch((err) => {
  console.error("❌ Greška pri pokretanju testova:", err);
  process.exit(1);
});
