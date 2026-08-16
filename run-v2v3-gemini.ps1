# ============================================================
# ENIGMA COMMAND CENTER — V2+V3 lanac za GEMINI CLI (G7..G14)
# Pokretanje:  powershell -NoProfile -ExecutionPolicy Bypass -File .\run-v2v3-gemini.ps1
# Logovi:      logs\gemini-v2v3\*.log  |  Markeri: *.done (rerun preskace gotove korake)
#
# PREDUSLOVI (jednom):
#   npm install -g @google/gemini-cli
#   gemini            # prvi put -> login kroz browser (Google nalog), pa izadji sa /quit
#   gemini -m gemini-3.7-flash -p "reci ok"   # test da model radi; ako javi nepoznat model,
#                                             # pusti samo `gemini -p "reci ok"` i u $Model
#                                             # upisi model koji ti `gemini /about` prikaze
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path 'logs\gemini-v2v3' | Out-Null

$Model = 'gemini-3.7-flash'

function Invoke-GeminiStep {
  param([string]$Name, [string]$Prompt)
  $done = "logs\gemini-v2v3\$Name.done"
  if (Test-Path $done) { Write-Host ">>> $Name vec gotov, preskacem" -ForegroundColor DarkGray; return }
  Write-Host "`n=== $Name ($Model) ===" -ForegroundColor Cyan
  $log = "logs\gemini-v2v3\$Name.log"
  $Prompt | gemini -y -m $Model -p "Execute the task described in the input above. Follow it exactly and completely." *>&1 | Tee-Object -FilePath $log
  if ($LASTEXITCODE -ne 0) { throw "$Name PUKAO - vidi $log" }
  New-Item -ItemType File -Path $done | Out-Null
}

function Commit-Step { param([string]$Msg)
  git add -A 2>$null
  git commit -m $Msg 2>$null | Out-Null
  Write-Host ">>> commit: $Msg" -ForegroundColor Green
}

# Review posle svakog koraka — S1 sablon prilagodjen Gemini-ju
$Review = @'
Act as a hostile senior reviewer of ALL uncommitted changes in this repo (git diff HEAD + untracked files). Read CLAUDE.md first. You are reviewing code written by another AI in the PREVIOUS step.
Priorities in order: (1) credential/token leaks into logs, error messages, client bundles or query results; (2) sync correctness — upsert keys incl. breakdownHash, lookback windows, partial-write risks, cron overlap; (3) write-action safety — ADS_WRITE_ENABLED kill switch honored everywhere, budget guardrails, audit trail completeness, idempotency; (4) schema index coverage for every new query — no full-table scans; (5) broken empty/pending states when credentials/env are missing; (6) dead code orphaned by the changes.
FIX what you find yourself — do not just report. Do NOT refactor beyond fixes.
After fixes: npx tsc --noEmit && npm run lint && npm run build must ALL pass — run them and show output.
Finish with a numbered list: issue, severity, file, what you changed.
'@

# ---------------- G7 (P12): Meta Ads hijerarhija + insights sync ----------------
$G7 = @'
CONTEXT — read these files FIRST, before writing any code:
1. CLAUDE.md; 2. PLAN.md sections 7.2 and 7.3 (metrics list + full ad* schema); 3. convex/schema.ts; 4. convex/ga4.ts, convex/openreply.ts + openreplyStore.ts, convex/instagram.ts + instagramStore.ts — you MUST mirror these patterns exactly: runSync wrapper (convex/lib/runSync), syncRuns logging, encrypted credentials (convex/lib/crypto), separate *Store.ts mutation file, endpoint paths isolated in one convex/lib/*Api.ts module, cron fan-out, "Sync now" wiring in convex/connections.ts, Settings provider card.

FACTS:
- Meta Marketing API via System User token, provider "meta_ads", token stored encrypted in connections. THE TOKEN DOES NOT EXIST YET — build code-complete so that pasting the token in Settings later is the ONLY remaining step. Settings card shows status "Čeka System User token" until then. Missing token -> clean no-op sync with syncRuns error "Meta Ads nije povezan".
- UI strings in Serbian (latinica). No new dependencies.

TASK:
1. Add the V2 schema from PLAN.md 7.3: adAccounts, adCampaigns, adSets, ads, adInsights, adActions — with indexes for drill-down queries (by account/campaign/adset/ad + date, and adInsights upsert key incl. breakdownHash).
2. syncAdsStructure (cron every 3h): campaign -> adset -> ad hierarchy incl. status, budgets, creative id, thumbnail/preview URLs. Mark campaigns with spend in last 48h syncPriority "hot", else "cold".
3. syncAdsInsights: hot campaigns every 15 min — TODAY at ad level, hourly granularity where available, breakdowns (age, gender, publisher_platform/placement) as separate rows with breakdownHash in the upsert key; cold + all every 6h daily-level, ALWAYS re-upserting the last 7 days (attribution restatement). Metrics per PLAN.md 7.2 incl. video metrics (3s, thruplay, p25..p100) and quality/engagement/conversion rankings. Compute hookRate and holdRate at write time.
4. Rate-limit budget: batch requests, respect X-Business-Use-Case usage headers, back off cleanly; one hot campaign must never starve others. Log call counts per run in syncRuns.
5. All Graph API endpoint paths in ONE module convex/lib/metaAdsApi.ts, version from META_GRAPH_API_VERSION default v25.0. If unsure of an API field name, add a TODO comment — NEVER invent fields.

FORBIDDEN: touching GA4/OpenReply/Instagram sync logic; new dependencies; deploy commands.
VERIFICATION: seed synthetic ad hierarchy + insights rows incl. two breakdown rows with same date but different breakdownHash; double-run upsert -> no duplicates; delete seeds + throwaway files. npx tsc --noEmit && npm run lint && npm run build must pass. List files + one-paragraph summary.
'@

# ---------------- G8 (P13): Ads ekrani ----------------
$G8 = @'
CONTEXT — read FIRST: CLAUDE.md; all existing pages and shared components (analytics, instagram, openreply patterns); the ad* tables and queries from the previous step.
Stack: shadcn/ui, GSAP, dark slate brand, cyan #22D3EE sparingly, Serbian UI strings.

TASK — new page /ads (add nav item "Ads" following existing pattern):
1. Campaign table: status dot, name, objective, spend, results, CPA/ROAS (ROAS ONLY when conversionValue > 0), CTR, frequency; sparkline of daily spend; sortable; shared date-range. Row click -> campaign detail.
2. Campaign detail: ad sets -> ads hierarchy (collapsible), per-ad metrics with thumbnail previews. Per-ad drill-down panel: core metrics + video funnel (impressions -> 3s -> thruplay with hook/hold rates as headline numbers); breakdown tabs: age×gender heat table, placement split, hourly pattern for hot campaigns; quality/engagement/conversion rankings as subtle badges.
3. Freshness indicator per campaign: "podaci od HH:MM" (hot: minutes ago).
4. Mobile 375px: campaign list + per-ad key metrics fully usable.
5. Empty state when meta_ads not connected -> points to Settings ("Čeka System User token").

FORBIDDEN: modifying sync logic (read-only queries in the *Store.ts file allowed); new dependencies; changing shared component APIs.
VERIFICATION: seed synthetic hierarchy + insights (incl. one hot campaign with hourly rows and one with conversionValue=0 to prove ROAS hides); verify sorting + drill-down depth (any ad reachable in <=3 clicks); desktop + 375px; clean up seeds. npx tsc --noEmit && npm run lint && npm run build must pass. List files + summary.
'@

# ---------------- G9 (P14): Hook Battle ----------------
$G9 = @'
CONTEXT — read FIRST: CLAUDE.md; PLAN.md section 7.4; the /ads pages and ad* queries from previous steps.
This is the product's signature screen: comparing creative versions (hooks) inside one ad set, side by side. Visual quality bar is HIGH. Serbian UI strings.

TASK:
1. Hook labeling: in campaign detail, ads within an ad set get an editable hookLabel (inline edit, stored on ads table). Unlabeled ads default to ad name.
2. Hook Battle view (entry from an ad set: "Uporedi hooks"): one column per ad version — thumbnail on top, then ALIGNED rows: spend, impressions, HOOK RATE (hero metric, large), hold rate, CTR, CPA/ROAS, frequency. Current leader highlighted with cyan border — leader = best CPA if conversions exist for >=2 versions, else best hook rate; state the criterion on screen.
3. Statistical honesty: per version an evidence meter; below thresholds (default 1000 impressions / 50 clicks, configurable via env or settings) show "rano za zaključak" and DO NOT crown a leader; info popover explains why.
4. Retention strip: p25/p50/p75/p100 mini bars per version for video ads.
5. Battle summary line: plain-language verdict from simple rules (no LLM), e.g. "Hook B: 2.1× hook rate lidera prošle nedelje, CPA 38% niži".
6. pinnedBattles table: persist hookLabels; allow pinning a battle (ad set + date range) for later reference.

FORBIDDEN: touching sync logic; new dependencies.
VERIFICATION: seed an ad set with 3 versions — one above thresholds and winning on CPA, one above thresholds losing, one BELOW thresholds (must show "rano za zaključak" and never a winner badge); verify leader logic both branches (with and without conversions); desktop + 375px; clean up seeds. npx tsc --noEmit && npm run lint && npm run build must pass. List files + summary.
'@

# ---------------- G10 (P15): Write komande + audit + kill switch ----------------
$G10 = @'
CONTEXT — read FIRST: CLAUDE.md; PLAN.md sections 7.5 and 7.3 (adActions); convex/lib/metaAdsApi.ts and the meta_ads connection pattern.
FIRST WRITE ACCESS to live ad accounts — every design decision is safety-critical. No live token exists yet, so NO live calls are possible; build code-complete with the kill switch OFF by default.

TASK:
1. Server side: Convex "use node" actions calling Graph API POST:
   - pauseResume(targetType campaign|adset|ad, targetId, desiredStatus)
   - changeBudget(campaign|adset, newDailyBudget) with guardrails: bounds from env BUDGET_MIN_EUR / BUDGET_MAX_EUR, max ±50% change per single action, reject otherwise with a clear Serbian explanation
   - duplicateAd(adId, { newName }) via the ad copies endpoint, created PAUSED
   Every action writes adActions FIRST (status "pending"), then executes, then updates with apiResponse or error. Idempotency: refuse a duplicate identical pending action.
2. Kill switch: env ADS_WRITE_ENABLED — when not exactly "true", ALL write actions return a clear "Pisanje je isključeno (ADS_WRITE_ENABLED)" error BEFORE touching adActions or the API. Fail closed if env missing.
3. UI: action buttons on campaign/adset/ad rows and in Hook Battle ("Pauziraj gubitnika" / "Podigni budžet lidera"). Every action -> confirm dialog stating exactly what will happen incl. current spend today. Optimistic status update + rollback on API error.
4. Audit trail page (Settings -> Istorija akcija): who, what, when, params, API result. Read-only, filterable by target.

FORBIDDEN: any code path that can execute a write when ADS_WRITE_ENABLED is unset; new dependencies; touching other providers.
VERIFICATION: with ADS_WRITE_ENABLED unset, invoke each action via a throwaway script -> all refuse BEFORE any adActions row is created except an optional "blocked" audit entry (choose one behavior and document it); guardrail rejection paths (below min, above max, >±50%) each verifiably reject with correct message; idempotency check refuses duplicate pending; clean up throwaways. npx tsc --noEmit && npm run lint && npm run build must pass. List files + summary.
'@

# ---------------- G11 (P16): Rules engine + notifikacije ----------------
$G11 = @'
CONTEXT — read FIRST: CLAUDE.md; PLAN.md V3 notes; the adInsights aggregates and the P15 action layer (pauseResume + ADS_WRITE_ENABLED kill switch); convex/auth.ts Resend usage for email sending pattern.

TASK:
1. Schema: rules { workspaceId, name, enabled, scope (account|campaign|adset), condition { metric, operator, value, windowDays, minImpressions }, action "notify"|"pause"|"pause_and_notify", cooldownHours, lastFiredAt }, ruleFirings { ruleId, targetId, firedAt, metricValue, actionTaken, notified } — with indexes for the evaluator and history queries.
2. Evaluator cron (every 30 min): evaluate enabled rules over fresh adInsights aggregates; respect minImpressions (no decisions on noise), cooldown per target, and ADS_WRITE_ENABLED for pause actions (a rule wanting to pause while writes are disabled -> notify-only + flagged in the firing record).
3. Notifications via Resend email: subject like "CPA alert: Kampanja X", body with metric, threshold, window, action taken, deep link to the campaign screen. Max 1 email per rule per cooldown.
4. Rules UI (new page or Settings section, follow nav conventions): list + editor with plain-language preview sentence ("Ako CPA > €15 tokom 3 dana uz ≥1000 impresija → pauziraj i javi mi"), firing history.
5. Ship two template rules pre-filled but DISABLED: CPA guard, spend spike guard.

FORBIDDEN: bypassing the kill switch; new dependencies; touching sync logic.
VERIFICATION: seed historical adInsights where one rule's condition is true and another is true but below minImpressions -> run evaluator via throwaway trigger: first fires exactly once (records firing, honors cooldown on second run), second NEVER fires; email send path executed with RESEND_API_KEY missing -> logs cleanly, no crash; clean up seeds. npx tsc --noEmit && npm run lint && npm run build must pass. List files + summary.
'@

# ---------------- G12 (P17): Google Ads read integracija ----------------
$G12 = @'
CONTEXT — read FIRST: CLAUDE.md; PLAN.md sections 4 and 7.2 (Google Ads notes); the meta_ads sync + Settings card patterns.
FACTS: Google Ads developer token Basic Access is PENDING approval and no OAuth refresh token exists yet — build code-complete so entering credentials later is the ONLY remaining step (card status "Čeka Google Ads odobrenje"). Use the google-ads-api npm library (this ONE new dependency is explicitly allowed) in "use node" actions. GAQL-based.

TASK:
1. Settings: Google Ads connection card — developer token, OAuth client id/secret, refresh token, customer ID; all stored encrypted like other providers. Document the one-time refresh-token bootstrap step-by-step in README.
2. syncGoogleAds (cron every 3h + Sync now): GAQL at ad_group_ad level -> write into adInsights with provider "google": impressions, clicks, ctr, average_cpc, cost, conversions, conversions_value -> ROAS; campaign-level search_impression_share; quality_score per keyword into new small table gadsKeywordQuality (with index).
3. Same 7-day lookback re-upsert (Google restates conversions too).
4. UI: Google campaigns appear in the existing /ads screens with a provider badge; drill-down shows impression share + quality score in place of Meta-only metrics. NO write actions for Google.

FORBIDDEN: write actions; touching Meta sync; other new dependencies beyond google-ads-api.
VERIFICATION: seed synthetic "google" provider rows -> mixed provider list sorts/filters correctly and Meta screens are unaffected; missing credentials -> clean pending state everywhere; clean up seeds. npx tsc --noEmit && npm run lint && npm run build must pass. List files + summary.
'@

# ---------------- G13 (P18): Duplicate with new hook ----------------
$G13 = @'
CONTEXT — read FIRST: CLAUDE.md; PLAN.md 7.4 point 5; the P15 action layer (duplicateAd, kill switch, audit) and the Hook Battle screen.

TASK:
1. From Hook Battle: "Nova verzija" on any ad -> flow: duplicateAd (existing action), then update the copy's creative fields the Marketing API allows editing on a fresh unpublished ad (primary text, headline; same media initially). Document clearly IN THE UI what can and cannot be changed via API vs Ads Manager.
2. Editor pre-filled with source ad's text; user edits the hook; on save -> copy created PAUSED with hookLabel set; battle view refreshes with the new column marked "čeka aktivaciju".
3. Guardrails: same ADS_WRITE_ENABLED kill switch + adActions audit trail as P15; max N copies per ad set from env (MAX_HOOK_COPIES, default 5, fail closed if exceeded).

FORBIDDEN: bypassing kill switch/audit; new dependencies; touching sync.
VERIFICATION: with kill switch off, the whole flow refuses cleanly at the first step with a clear message; seed-based UI check that the new column renders with "čeka aktivaciju"; max-copies guardrail verifiably rejects; clean up seeds/throwaways. npx tsc --noEmit && npm run lint && npm run build must pass. List files + summary.
'@

# ---------------- G14: finalni neprijateljski review celog V2+V3 ----------------
$G14 = @'
Act as a hostile senior reviewer of ALL changes since the commit tagged as the start of V2 (git log will show V1 commits; everything after "P9+P10" commits is in scope) plus uncommitted work. Read CLAUDE.md first.
Priorities: (1) any path where a write action (pause/budget/duplicate/rule-pause) can execute with ADS_WRITE_ENABLED unset or not exactly "true" — this is CRITICAL severity; (2) credential/token leaks into logs, client bundles, query results — Marketing API and Google Ads tokens must never reach the client decrypted; (3) upsert correctness incl. breakdownHash and 7-day lookbacks for BOTH providers; (4) cron overlap and rate-limit behavior (15min hot vs 3h structure vs 6h cold vs 30min rules); (5) index coverage for every new query (ad* tables, rules, ruleFirings, gadsKeywordQuality, pinnedBattles); (6) empty/pending states for meta_ads and google without credentials on every screen incl. Hook Battle and Rules; (7) statistical-honesty thresholds in Hook Battle cannot be bypassed; (8) Serbian UI consistency and dead code.
FIX everything you find yourself. After fixes: npx tsc --noEmit && npm run lint && npm run build must ALL pass — show output.
Finish with a numbered list: issue, severity, file, fix.
'@

$steps = @(
  @{ Name='G7-meta-ads-sync';  Prompt=$G7;  Msg='P12: Meta Ads hierarchy + insights sync (awaiting System User token)' },
  @{ Name='G8-ads-screens';    Prompt=$G8;  Msg='P13: Ads screens - campaigns + drill-down' },
  @{ Name='G9-hook-battle';    Prompt=$G9;  Msg='P14: Hook Battle screen' },
  @{ Name='G10-write-actions'; Prompt=$G10; Msg='P15: write actions + audit + kill switch (default OFF)' },
  @{ Name='G11-rules-engine';  Prompt=$G11; Msg='P16: rules engine + notifications' },
  @{ Name='G12-google-ads';    Prompt=$G12; Msg='P17: Google Ads read integration (awaiting approval)' },
  @{ Name='G13-new-hook';      Prompt=$G13; Msg='P18: duplicate-with-new-hook flow' }
)

foreach ($s in $steps) {
  Invoke-GeminiStep -Name $s.Name -Prompt $s.Prompt
  Invoke-GeminiStep -Name "$($s.Name)-review" -Prompt $Review
  Commit-Step $s.Msg
}

Invoke-GeminiStep -Name 'G14-final-review' -Prompt $G14
Commit-Step 'V2+V3 hardening pass (G14)'

Write-Host "`nSVE GOTOVO. Logovi: logs\gemini-v2v3\" -ForegroundColor Green
Write-Host "NE pushujem automatski - pregledaj pa: git push origin master" -ForegroundColor Yellow
