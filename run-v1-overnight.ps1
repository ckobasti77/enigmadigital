# ============================================================
# ENIGMA COMMAND CENTER — nocni lanac P6..P10 (+ review posle svakog)
# Pokretanje:  powershell -NoProfile -ExecutionPolicy Bypass -File .\run-v1-overnight.ps1
# Logovi:      logs\overnight\*.log   |  Markeri: *.done (rerun preskace gotove korake)
# ============================================================
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force -Path 'logs\overnight' | Out-Null

$Builder  = 'opus'    # model za gradnju (promeni po zelji: opus / sonnet / fable)
$Reviewer = 'opus'    # model za review

function Invoke-ClaudeStep {
  param([string]$Name, [string]$Model, [string]$Prompt)
  $done = "logs\overnight\$Name.done"
  if (Test-Path $done) { Write-Host ">>> $Name vec gotov, preskacem" -ForegroundColor DarkGray; return }
  Write-Host "`n=== $Name ($Model) ===" -ForegroundColor Cyan
  $log = "logs\overnight\$Name.log"
  $Prompt | claude -p --model $Model --dangerously-skip-permissions *>&1 | Tee-Object -FilePath $log
  if ($LASTEXITCODE -ne 0) { throw "$Name PUKAO - vidi $log" }
  New-Item -ItemType File -Path $done | Out-Null
}

function Commit-Step { param([string]$Msg)
  git add -A 2>$null
  git commit -m $Msg 2>$null | Out-Null
  Write-Host ">>> commit: $Msg" -ForegroundColor Green
}

$ReviewTemplate = @'
Review ALL uncommitted changes (git diff HEAD + untracked files) as a hostile
senior reviewer, then FIX what you find yourself. Priorities in order:
(1) credential/token leaks into logs, queries or client bundles;
(2) sync correctness - upsert keys, lookback windows, partial-write risks;
(3) schema index coverage for every new query;
(4) broken empty/pending states when a provider is not configured;
(5) dead code the changes orphaned.
After fixes: npx tsc --noEmit, lint and next build MUST pass. Do not refactor
beyond fixes. Finish with a one-paragraph summary of what you changed.
'@

# ---------------- P6: OpenReply sync + ekran ----------------
$P6 = @'
Read CLAUDE.md and PLAN.md section 4 (OpenReply strategy). OpenReply is a
separate self-hosted app whose Railway Postgres we will read with the pg npm
package using a read-only user. IMPORTANT CONTEXT: OpenReply is NOT deployed
yet - the connection string env/setting does not exist. Build everything
code-complete so that entering the connection string later is the ONLY
remaining step.

TASK
1. `syncOpenReply` as a "use node" internal action using pg: short-lived
   connection, statement_timeout, SSL. Read campaigns (id, name, keywords,
   active, DMs sent/failed, tracked link clicks -> CTR) into orCampaignStats
   (upsert by orCampaignId) and daily totals (last 90 days) into orDailyTotals
   (upsert by workspaceId+date). Column lists explicit - no SELECT *. Write
   the SELECTs against the OpenReply open-source schema
   (github.com/diwenne/openreply - Prisma models for campaigns, DM logs,
   tracked links); isolate all SQL in one module with a clear comment that
   column names must be re-verified against the live DB on first real sync.
2. Defensive: connection string missing -> connection status "pending" and
   sync is a clean no-op with a syncRuns entry status "error" message
   "OpenReply nije povezan"; query failure -> fail the whole run, no partial
   writes.
3. Settings: OpenReply card accepts the Postgres connection string (encrypted
   like other credentials), shows status, Sync now button. Hourly cron.
4. OpenReply page mirroring the Analytics page visual language (shared
   date-range, tiles, chart wrappers; impeccable skill first if doing any new
   styling): campaign cards/table (name, keyword, active badge, DMs, clicks,
   CTR), daily trend chart DMs vs clicks, branded "nije povezano" empty state
   pointing to Settings.
VERIFICATION (no live DB): seed temporary synthetic rows via a throwaway
internal mutation, verify the page desktop+mobile renders correctly, verify
double-upsert produces no duplicates, then DELETE the seed data and the
throwaway file. typecheck + lint + next build must pass.
'@

# ---------------- P7: Instagram insights (OAuth + sync) ----------------
$P7 = @'
Read CLAUDE.md and PLAN.md section 4 (Instagram strategy). IMPORTANT CONTEXT:
the Meta app is NOT created yet - INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET /
META_GRAPH_API_VERSION env vars do not exist. Build everything code-complete
so that setting those env vars later is the ONLY remaining step.

TASK
1. OAuth connect flow from Settings (Instagram API with Instagram Login):
   scopes instagram_business_basic + instagram_business_manage_insights,
   code -> short-lived -> LONG-LIVED token exchange (60 days), store
   encrypted in connections (provider "meta_ig", externalId = IG user id,
   expiresAt). If env vars are missing, the Settings card shows status
   "ceka Meta app - dodaj INSTAGRAM_APP_ID/SECRET u env" instead of the
   connect button. All Graph API endpoint paths in ONE module, version from
   META_GRAPH_API_VERSION with default v25.0.
2. `refreshTokens` daily cron: refresh long-lived tokens older than ~50 days;
   failure -> connection status "expired". Expose an internal action for
   manual trigger.
3. `syncIgInsights` ("use node", 6h cron + Sync now): account snapshot ->
   igAccountDaily (followers_count, reach, profile_views, accounts_engaged);
   last 30 media with per-media insights -> igMediaStats upsert by mediaId,
   handling REELS vs IMAGE/CAROUSEL metric differences by skipping
   unsupported metrics per type, never failing the run because of one media.
4. All runs through runSync/syncRuns like other providers.
VERIFICATION (no live API): unit-verify the media-metric mapping with a small
table-driven test or assertion script; seed synthetic igAccountDaily +
igMediaStats rows, confirm schema and indexes support the queries the P8
screen will need, then remove seed + throwaway files. typecheck + lint +
next build must pass.
'@

# ---------------- P8: Instagram ekran ----------------
$P8 = @'
Read CLAUDE.md; mirror the Analytics page (P5) and reuse its shared
components (date-range, stat tiles, chart wrappers). Follow CLAUDE.md UI
stack rules (shadcn base, GSAP motion, impeccable skill before styling).

TASK - Instagram page:
1. KPI tiles: Followers (growth delta), Reach, Profile Views, Accounts
   Engaged - deltas vs previous equal period from igAccountDaily.
2. Trend chart: followers growth + reach over selected range.
3. Content grid: last 30 posts as cards (thumbnail placeholder if no URL,
   type badge REEL/POST/CAROUSEL, date) with reach, likes, comments, saves,
   shares; sortable by reach/saves/date; permalink links.
4. "Top content" strip: top 3 by reach, visually elevated.
5. Empty state when not connected -> points to Settings ("ceka Meta app").
VERIFICATION: seed synthetic data (script pattern from previous steps),
verify desktop + 375px mobile, sorting correctness against raw data, then
clean up seeds. typecheck + lint + next build must pass.
'@

# ---------------- P9: UTM atribucija ----------------
$P9 = @'
Read CLAUDE.md and PLAN.md section 4 (UTM strategy). Goal: the chain
content -> OpenReply DM click -> GA4 session -> conversion, per campaign.

CONVENTION (document in README under "UTM konvencija"):
utm_source=instagram; utm_medium=openreply-dm | bio | story;
utm_campaign=<kebab-case slug identical to the OpenReply campaign name>.

TASK
1. Matching layer: Convex query joining orCampaignStats with ga4TrafficDaily
   on slug(orCampaign.name) == sessionCampaign where source=instagram and
   medium=openreply-dm. Identical slugify on both sides.
2. Attribution page: per campaign row DMs -> link clicks (CTR) -> GA4
   sessions -> conversions as a compact funnel with drop-off percentages.
3. Data honesty: campaign with clicks but zero GA4 sessions gets a "UTM
   mismatch?" badge with tooltip; no silent zeros.
4. Totals row: instagram-sourced traffic and conversions attributable to
   OpenReply campaigns vs bio/story.
VERIFICATION: seed one matching campaign, one mismatched campaign and
matching ga4TrafficDaily rows; verify funnel numbers by hand match the seeds
and the mismatch badge appears; clean up seeds. typecheck + lint + build.
'@

# ---------------- P10: Overview + finalna provera ----------------
$P10 = @'
Read CLAUDE.md. Production is ALREADY live at https://digital.enigmait.rs
(Vercel + Convex prod) - do NOT create deployments and do NOT run convex
deploy; a git push handles it. This step is the Overview screen + final prod
hygiene.

TASK
1. Overview page - the daily cockpit, one screen: top strip (sessions, IG
   reach, DMs sent, link clicks, conversions - each with delta vs previous
   period; sources not yet connected render as compact "ceka konekciju"
   tiles, not zeros); "Sta radi" panel (top campaign by attributed
   conversions, top IG post by reach); sync health summary (green/amber/red
   per integration, click -> Settings). Confident hierarchy, cyan only where
   a number deserves attention; impeccable skill before styling.
2. README: quickstart, full env list (dev + prod, Convex vs Vercel), deploy
   flow (push -> Vercel -> convex deploy via CONVEX_DEPLOY_KEY), UTM
   konvencija section, and a "Sledece ruke" checklist: OpenReply deploy +
   conn string; Meta app env + IG connect; GA4 property ID in prod Settings.
3. Final sweep: every page has loading skeleton + branded empty state; no
   console errors; mobile nav reachable on all pages.
VERIFICATION: seed-check Overview with synthetic data then clean up;
typecheck + lint + next build must pass.
'@

$steps = @(
  @{ Name='P6-openreply'; Prompt=$P6;  Msg='P6: OpenReply sync + screen (connection pending)' },
  @{ Name='P7-instagram'; Prompt=$P7;  Msg='P7: IG OAuth + insights sync (awaiting Meta app)' },
  @{ Name='P8-ig-screen'; Prompt=$P8;  Msg='P8: Instagram screen' },
  @{ Name='P9-utm';       Prompt=$P9;  Msg='P9: UTM attribution' },
  @{ Name='P10-overview'; Prompt=$P10; Msg='P10: Overview + prod hygiene' }
)

foreach ($s in $steps) {
  Invoke-ClaudeStep -Name $s.Name -Model $Builder -Prompt $s.Prompt
  Invoke-ClaudeStep -Name "$($s.Name)-review" -Model $Reviewer -Prompt $ReviewTemplate
  Commit-Step $s.Msg
}

Write-Host "`n=== PUSH na GitHub (okida Vercel deploy) ===" -ForegroundColor Cyan
git push origin master
Write-Host "`nSVI KORACI GOTOVI. Logovi: logs\overnight\  |  Laku noc." -ForegroundColor Green
