# Enigma Command Center — Prompt Pack v1.0
## Svi zadaci V1 → V3, spremni za copy/paste u Claude Code

---

## Kako se koristi ovaj dokument

**Legenda moda rada:**
- **Plan** — pokreni u plan modu (Shift+Tab): agent prvo predloži plan, ti ga odobriš, pa tek onda piše kod. Za zadatke gde pogrešna arhitektura košta.
- **Auto** — auto-accept edits: pusti ga da radi sam do kraja. Za mehaničke, dobro definisane zadatke.
- **Plan → Auto** — plan mod za dogovor, pa auto-accept za izvršenje. Najčešća kombinacija ovde.

**Effort:** low / medium / high / xhigh — koliko model „razmišlja" pre odgovora. Viši effort = bolje rešenje za teške probleme, sporije i skuplje za trivijalne.

**Izbor modela — logika koju sam pratio:**
- **Sonnet 5** — mehanički i dobro definisani zadaci (scaffold, CRUD, poznati API pattern). Brz, jeftin, sasvim dovoljan kad je prompt precizan.
- **Opus 5** — integraciona logika sa zamkama (OAuth, token lifecycle, sync sa upsert/lookback logikom), gde greška boli tiho.
- **Fable 5** — arhitektonski temelji i UI koji mora da bude *tvoj* (dizajn sistem, Hook Battle, Overview) — zadaci gde je ukus i celina bitna koliko i korektnost.
- **Opus 4.8** — naveden kao jeftinija alternativa tamo gde može da zameni Opus 5 bez rizika.

**Jezik promptova:** tela promptova su na engleskom — za coding agente engleski daje precizniju terminologiju (imena API-ja, biblioteka, pattern-a) i najmanje dvosmislenosti. Tvoje follow-up poruke u sesiji slobodno piši na srpskom, agent to prati bez problema. Ako želiš, konvertujem ceo pack na srpski.

**UI stack pravila (važe za SVE UI zadatke, upisana i u CLAUDE.md preko P1):**
- **shadcn/ui** je baza za sve komponente — restilizovana kroz naše tokene, nikad default shadcn izgled.
- **GSAP** (`gsap` + `@gsap/react`, `useGSAP` hook) za sav netrivijalan motion — reveal, hover lift, tranzicije brojeva; uvek `prefers-reduced-motion` fallback.
- **`impeccable` skill** se poziva na početku svakog UI/dizajn zadatka, pre stilizovanja.

**Redosled:** P-brojevi su redosled izvršavanja. Z-zadaci su ručno klikanje (checklist, nije prompt). Svaki prompt je samostalan — računa na `CLAUDE.md` i `PLAN.md` u repou (pravi ih P1), pa ne moraš ništa da lepiš uz njega.

---

# FAZA 0 — ručni zadaci (pre prvog prompta)

### Z0.1 — Google Ads developer token (URADI DANAS — čeka se nedeljama)
ads.google.com → napravi Manager (MCC) nalog → API Center → Apply for Basic access.

### Z0.2 — Meta developer app
developers.facebook.com → Create App → tip **Business** → use case „Manage messaging and content on Instagram". Zapiši: Instagram App ID, Instagram App Secret, Facebook App Secret. Pošalji tester pozivnicu svom IG nalogu → **prihvati u IG aplikaciji**: Settings → Apps and websites → Tester invites.

### Z0.3 — GA4 service account
console.cloud.google.com → novi projekat → enable „Google Analytics Data API" → Service Account + JSON ključ → GA4 Admin → Property access management → dodaj service account email kao **Viewer**.

### Z0.4 — Resend
Nalog + verifikovan domen (koristi ga i OpenReply i Convex Auth).

### Z0.5 — OpenReply deploy
Po `docs/setup.md` iz repoa (koraci su u PLAN.md, sekcija 5, „Korak 0.5"). Na kraju obavezno: `CREATE USER cc_reader WITH PASSWORD '...'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO cc_reader;` — to je konekcija za command center.

---

# FAZA V1 — read-only dashboard

---

### P1 — Scaffold + dizajn sistem + CLAUDE.md
**Model:** Fable 5 · **Effort:** high · **Mod:** Plan → Auto
**Zašto ovaj model:** temelj projekta i port tvog vizuelnog identiteta — sve kasnije nasleđuje ovo.

```
You are setting up a new project: Enigma Marketing Command Center — an internal
marketing analytics dashboard for Enigma IT (solo web dev agency, Serbia), later
a client-facing product. It aggregates GA4, Instagram insights, OpenReply
(self-hosted IG comment-to-DM tool) and later Meta/Google Ads into one dashboard.

The full architecture plan is in PLAN.md at the repo root — I will provide the
file; read it fully before proposing your plan.

TASK
1. Scaffold the project in the current empty folder `enigma-command-center`:
   - Next.js (latest, App Router, TypeScript, Tailwind v4), plus Convex
     (`npx convex dev` wiring, convex/ folder, ConvexProvider in the app).
   - shadcn/ui (`npx shadcn@latest init`) wired to our token layer — shadcn
     CSS variables must map to our design tokens so every component is
     on-brand by default, never the stock shadcn look.
   - GSAP for motion: `gsap` + `@gsap/react`; set up a small motion utility
     (useGSAP-based reveal + hover-lift helpers) with a
     prefers-reduced-motion guard.
2. Port the Enigma IT design system. Reference project lives at
   ../enigma-digital (read its tailwind.config.ts, app/globals.css, font setup).
   Rules: dark slate backgrounds as default; cyan accents used strategically
   (interactive elements and key metrics ONLY, never decorative); Aeonik font
   (var(--font-aeonik)) with optional uppercase tracking for headings; white
   surfaces for light contexts. Purposeful motion only: hover lift, subtle
   reveal transitions. Tone: engineered, confident, no agency-style ornament.
3. Create the design token layer: CSS custom properties + Tailwind theme
   (colors: bg/surface/border/text scales, accent-cyan scale; spacing and
   radius tokens; chart color tokens for later — pick 6 categorical colors that
   fit the brand and read on dark slate).
4. Create CLAUDE.md at repo root for future sessions. It must contain: one-line
   project purpose, stack (Next.js + Convex + Tailwind 4), folder conventions,
   design-system rules from point 2 (condensed), UI stack rules: shadcn/ui
   as the component base (restyled via our tokens, never default shadcn
   look), GSAP via useGSAP for all non-trivial motion (purposeful and
   subtle, prefers-reduced-motion respected), and "invoke the `impeccable`
   design skill at the start of every UI task, before styling"; coding rules: minimal
   surgical changes, no speculative abstractions, every change traceable to the
   task; commands (dev, convex dev, lint, typecheck); and the rule "read
   PLAN.md section referenced in the task before coding".
5. Basic layout shell only (no pages yet): root layout with fonts, dark theme,
   empty home route rendering a placeholder in the design language.

SUCCESS CRITERIA
- `npm run dev` + `npx convex dev` run clean; typecheck and lint pass.
- Placeholder page visibly matches the Enigma brand (slate + cyan + Aeonik).
- CLAUDE.md exists and is complete per point 4.

Do NOT build navigation, auth, or any dashboard pages yet. Do NOT touch
../enigma-digital — it is read-only reference.
```

---

### P2 — Convex Auth + app shell
**Model:** Opus 5 (alternativa: Opus 4.8) · **Effort:** high · **Mod:** Plan → Auto
**Zašto:** auth lifecycle ima tihe zamke (session, middleware, redirect petlje).

```
Read CLAUDE.md and PLAN.md sections 1 and 3 (decisions + data model).

TASK
1. Implement Convex Auth with email magic link via Resend (RESEND_API_KEY,
   EMAIL_FROM in env). Single user for now (me), but model it multi-tenant from
   day one: `workspaces`, `members` (role: "owner" | "client_viewer") tables per
   PLAN.md. On first login, auto-create workspace "Enigma IT" and owner
   membership.
2. Auth gating: unauthenticated → minimal login page (email input, brand
   styling, clear sent-state feedback). Authenticated → app shell.
3. App shell: left sidebar navigation — Overview, Analytics (GA4), Instagram,
   OpenReply, Settings — built on shadcn primitives per CLAUDE.md UI stack
   rules (invoke the `impeccable` skill before styling). Active state uses
   cyan accent. Each route renders a
   branded empty state ("Nije još povezano" style, one line, no clutter).
   Responsive: sidebar collapses to bottom/hamburger nav on mobile — I will
   check this dashboard from my phone daily.
4. Sign-out, and current-workspace context available to all pages.

SUCCESS CRITERIA
- Full loop works locally: enter email → receive link → land in shell → reload
  stays signed in → sign out works.
- No flash of protected content when logged out; no redirect loops.
- Typecheck + lint pass.

Keep it minimal — no profile pages, no invite flows (those come with clients).
```

---

### P3 — Šema, kriptovanje kredencijala, Settings, sync infrastruktura
**Model:** Opus 5 · **Effort:** xhigh · **Mod:** Plan → Auto
**Zašto:** ovde se odlučuje bezbednost tokena i oblik svih budućih podataka. Najosetljiviji zadatak u V1.

```
Read CLAUDE.md and PLAN.md section 3 (full Convex schema) and section 4.

TASK
1. Implement the complete Convex schema from PLAN.md section 3 (all V1 tables
   including syncRuns; skip V2 ad* tables for now). Add the indexes the queries
   will need (by workspace+date, by workspace+provider, etc.).
2. Credentials encryption: AES-256-GCM helper (encrypt/decrypt) using
   CREDENTIALS_ENCRYPTION_KEY env var (32-byte hex). Credentials are encrypted
   in mutations before write and decrypted ONLY inside "use node" actions at
   sync time. Plaintext credentials must never be returned by any query — a
   query may return provider, status, externalId, lastSyncAt, expiresAt only.
3. `connections` CRUD: internal mutations + a Settings page where I can add or
   update each integration's credentials:
   - GA4: property ID only — the service account JSON already lives in the
     Convex env var GA4_SERVICE_ACCOUNT_JSON (set via `npx convex env set`);
     the connection record just references it, no textarea needed
   - OpenReply: Postgres connection string (read-only user)
   - Instagram: placeholder card "connect later" (OAuth comes in P7)
   Show status per connection (active / error / expired) and last sync time.
4. Sync infrastructure: `syncRuns` write helpers (start/finish/fail with error
   message and itemsWritten); a generic `runSync` wrapper that every future
   sync action uses; "Sync Health" widget on Settings showing the last run per
   provider with status and error text if any.
5. Manual trigger: "Sync now" button per connection (wired to a no-op sync for
   now that just logs a successful run — real syncs come in P4+).

SUCCESS CRITERIA
- I can save GA4 + OpenReply credentials; they persist encrypted (verify in
  Convex dashboard that stored value is ciphertext); status displays correctly.
- Sync Health widget shows the no-op run after clicking Sync now.
- Typecheck + lint pass.

SECURITY NOTES
- Never log decrypted credentials or include them in error messages.
- Validate the service account JSON shape before saving; reject junk early.
```

---

### P4 — GA4 sync pipeline
**Model:** Opus 5 (alternativa: Opus 4.8) · **Effort:** high · **Mod:** Auto
**Zašto:** poznat API, ali upsert/lookback/backfill logika mora biti tačna — ona je šablon za sve ostale sync-ove.

```
Read CLAUDE.md, PLAN.md section 4 (GA4 strategy) and the sync infrastructure
from convex/ (runSync wrapper, syncRuns).

TASK
1. Build `syncGa4` as a "use node" internal action using googleapis /
   google-auth-library. JWT auth from the service account JSON stored in the
   Convex environment variable GA4_SERVICE_ACCOUNT_JSON (already set via
   `npx convex env set` — parse it with JSON.parse, never log it).
2. Two reports per run via GA4 Data API runReport:
   a) daily totals → ga4Daily: sessions, activeUsers, newUsers, conversions,
      engagementRate, by date
   b) traffic breakdown → ga4TrafficDaily: sessionSource, sessionMedium,
      sessionCampaign, sessions, conversions, by date
3. Upsert semantics: natural key [workspaceId, date] (and +source/medium/
   campaign for traffic table). Every run re-fetches the last 3 days (GA4
   restates recent data) plus any missing days.
4. Backfill: on first successful sync for a connection, pull the last 90 days
   (batch requests sensibly; respect API limits — they are generous, don't
   over-engineer).
5. Cron: register in convex/crons.ts every 6 hours. Wire the existing
   "Sync now" button to trigger this action for real.
6. All runs go through runSync → syncRuns (status, error, itemsWritten).

SUCCESS CRITERIA
- After one manual sync: ga4Daily has ~90 rows, ga4TrafficDaily populated,
  Sync Health shows ok with itemsWritten counts.
- Running sync twice in a row does not duplicate rows (upsert verified).
- A wrong property ID or bad key produces a clean error in syncRuns and
  status "error" on the connection — not an unhandled crash.
```

---

### P5 — Analytics (GA4) ekran
**Model:** Fable 5 · **Effort:** high · **Mod:** Plan → Auto
**Zašto:** prvi pravi dashboard ekran — postavlja vizuelni standard za sve ostale. Ukus je pola zadatka.

```
Read CLAUDE.md (design system rules!) and look at the ga4Daily /
ga4TrafficDaily data shape in convex/schema.ts. Invoke the `impeccable`
design skill before styling. Build on shadcn primitives (Card, Table, Tabs,
Skeleton) restyled via our tokens; use the GSAP motion utilities for section
reveals and animated number transitions on the stat tiles.

TASK
Build the Analytics page (GA4 data), the visual benchmark for every future
screen. Everything reads from Convex queries (real-time by default).

1. Header row: date-range selector (7d / 28d / 90d / custom) — this component
   will be reused on every screen, build it as a shared component with the
   range in the URL query param.
2. KPI stat tiles: Sessions, Active Users, Conversions, Engagement Rate.
   Each tile: big number (Aeonik), delta vs previous period of equal length
   (green/red, small arrow), subtle sparkline. Cyan reserved for the primary
   metric and interactive states only.
3. Main chart: sessions + conversions over time (line/area). Clean axes,
   no chart-junk, tooltip with exact values and date. Use a lightweight
   charting approach (recharts or visx) consistent with the token layer's
   chart colors; dark-theme native, no white chart backgrounds.
4. Traffic table: source/medium/campaign rows with sessions + conversions,
   sortable, top 20, with a small share-bar per row.
5. Empty and loading states in brand tone (skeletons, not spinners).

SUCCESS CRITERIA
- With real synced data the page reads clearly on desktop AND phone.
- Period deltas are correct (verify one by hand against raw table data).
- No layout shift when data loads; typecheck + lint pass.

Chart discipline: max 2 series on the main chart; direct labeling over
legends where possible; numbers formatted sr-Latn style where sensible.
```

---

### P6 — OpenReply reader (sync + ekran)
**Model:** Opus 5 · **Effort:** high · **Mod:** Plan → Auto
**Zašto:** konekcija na tuđu (OpenReply) šemu preko `pg` — mora biti defanzivno napisano da update OpenReply-a ne sruši tiho tvoje brojke.

```
Read CLAUDE.md, PLAN.md section 4 (OpenReply strategy). OpenReply is a
separate self-hosted app (github.com/diwenne/openreply) whose Postgres we
read directly with a read-only user. Its connection string is already stored
encrypted in `connections` (provider "openreply").

TASK
1. `syncOpenReply` as "use node" action using the `pg` npm package. Connect,
   read, disconnect — short-lived connection per run, statement_timeout set,
   SSL as required by Railway.
2. First, introspect the OpenReply schema (information_schema) in a THROWAWAY
   script or via a one-off action so we write SELECTs against real table/column
   names — its Prisma models cover campaigns, DM logs, tracked links/clicks.
   Then hardcode explicit column lists in the final queries (no SELECT *).
3. Pull per campaign: id, name, keyword(s), active flag, DMs sent, DMs failed,
   tracked link clicks → compute CTR. Upsert into orCampaignStats (key:
   orCampaignId). Pull daily totals (DMs sent, clicks per day, last 90 days)
   → orDailyTotals (key: workspaceId+date).
4. Defensive posture: if a query fails (schema drift after an OpenReply
   update), fail the run with a clear error in syncRuns — never write partial
   junk. Add a schemaVersion note in the error to speed up fixing.
5. Cron: hourly. Wire Sync now.
6. OpenReply page: campaign cards/table (name, keyword, active badge, DMs
   sent, clicks, CTR), daily trend chart (DMs vs clicks), reuse the shared
   date-range component and visual language from the Analytics page.

SUCCESS CRITERIA
- Numbers match what the OpenReply dashboard itself shows for the same
  campaign (spot-check one campaign).
- Sync twice → no duplicates. Kill the DB connection string → clean error
  state, page shows last good data with a stale-data notice.
```

---

### P7 — Instagram insights sync (OAuth + tokeni + podaci)
**Model:** Opus 5 · **Effort:** xhigh · **Mod:** Plan → Auto
**Zašto:** najzamkovitiji deo V1 — Meta OAuth, long-lived token lifecycle, insights endpoints sa verzijskim hirovima.

```
Read CLAUDE.md, PLAN.md section 4 (Instagram strategy). We use my existing
Meta app (type: Instagram API with Instagram Login — same app OpenReply uses).
My IG account is an app tester, so no App Review is needed. Env: INSTAGRAM_APP_ID,
INSTAGRAM_APP_SECRET, META_GRAPH_API_VERSION.

TASK
1. OAuth connect flow from Settings: authorize with scopes
   instagram_business_basic + instagram_business_manage_insights → exchange
   code → exchange for LONG-LIVED token (60 days) → store encrypted in
   `connections` (provider "meta_ig") with expiresAt and ig user id as
   externalId.
2. `refreshTokens` daily cron: refresh any long-lived token older than ~50
   days via the refresh endpoint; on failure set connection status "expired"
   (the UI already surfaces this).
3. `syncIgInsights` ("use node", cron every 6h + Sync now):
   a) account snapshot → igAccountDaily (key workspace+date): followers_count
      (from user fields), plus insights metrics: reach, profile_views,
      accounts_engaged (metric_type=total_value where required by the API
      version).
   b) media: fetch last 30 media (id, caption, media_type, permalink,
      timestamp, thumbnail) then per-media insights (reach, likes, comments,
      saved, shares, views as available per media type — handle REELS vs
      IMAGE/CAROUSEL metric differences gracefully, skipping unsupported
      metrics per type instead of failing).
   → upsert igMediaStats by mediaId (history of growth preserved via
     updated totals + syncedAt).
4. Be precise with the Graph API version from env; isolate all endpoint paths
   in one module so version bumps are a one-file change.

SUCCESS CRITERIA
- Settings shows my IG account connected with expiry date.
- After sync: igAccountDaily has today's row; igMediaStats has ~30 rows with
  non-null metrics appropriate to each media type.
- Token refresh path is testable (expose an internal action I can trigger
  manually) and failure marks the connection expired without crashing.
```

---

### P8 — Instagram ekran
**Model:** Sonnet 5 · **Effort:** medium · **Mod:** Auto
**Zašto:** vizuelni jezik i shared komponente već postoje (P5) — ovo je disciplinovana primena šablona.

```
Read CLAUDE.md; mirror the visual language of the Analytics page (P5) and
reuse its shared components (date-range, stat tiles, chart wrappers).
Follow the CLAUDE.md UI stack rules (shadcn base, GSAP motion, `impeccable`
skill first).

TASK — Instagram page:
1. KPI tiles: Followers (with growth delta), Reach, Profile Views, Accounts
   Engaged — deltas vs previous equal period from igAccountDaily.
2. Trend chart: followers growth + reach over the selected range.
3. Content grid: last 30 posts as cards (thumbnail, type badge REEL/POST/
   CAROUSEL, date) with reach, likes, comments, saves, shares; sortable by
   reach / saves / date; each card links to the IG permalink.
4. A "top content" strip: top 3 by reach in the period, visually elevated.

SUCCESS CRITERIA
- Works on mobile (grid collapses well); loading skeletons; empty state if
  not connected pointing to Settings.
- Sort order verified against raw data; typecheck + lint pass.
```

---

### P9 — UTM atribucija (kontent → klik → sesija → upit)
**Model:** Fable 5 · **Effort:** xhigh · **Mod:** Plan → Auto
**Zašto:** konceptualno najtvrđi V1 zadatak — spajanje tri izvora podataka u jednu priču koja mora biti istinita, i jasno pokazati gde je rupa u podacima.

```
Read CLAUDE.md, PLAN.md section 4 (UTM strategy). Goal: show the chain
content → OpenReply DM click → GA4 session → conversion, per campaign.

CONVENTION (also document it in README under "UTM konvencija"):
- utm_source=instagram
- utm_medium=openreply-dm | bio | story
- utm_campaign=<slug identical to the OpenReply campaign name, kebab-case>

TASK
1. Matching layer: Convex query joining orCampaignStats with ga4TrafficDaily
   on slug(orCampaign.name) == sessionCampaign (utm_source=instagram AND
   utm_medium=openreply-dm). Slugify identically on both sides; expose
   unmatched campaigns explicitly (see 3).
2. Attribution page (or section on Overview — propose in plan mode which fits
   better): per campaign row → DMs sent → link clicks (OpenReply CTR) →
   GA4 sessions → conversions, rendered as a compact funnel with drop-off
   percentages between stages.
3. Data honesty: when a campaign has clicks but zero GA4 sessions, badge it
   "UTM mismatch?" with a tooltip explaining the likely cause (link created
   without the convention). No silent zeros.
4. Totals row: how much of my site's instagram-sourced traffic and
   conversions is attributable to OpenReply campaigns vs bio/story.

SUCCESS CRITERIA
- For one real campaign with correctly tagged links, the full chain shows
  plausible, hand-verifiable numbers.
- A deliberately mis-tagged campaign shows the mismatch badge, not zeros.
```

---

### P10 — Overview ekran + production deploy
**Model:** Fable 5 · **Effort:** high · **Mod:** Plan → Auto
**Zašto:** ekran koji ćeš gledati svaki dan — sinteza svega; plus produkcija.

```
Read CLAUDE.md. All V1 data sources are live (GA4, Instagram, OpenReply, UTM).

TASK
1. Overview page — the daily cockpit, one screen, no scrolling walls:
   - Top strip: today/this-week pulse — sessions, IG reach, DMs sent, link
     clicks, conversions, each with delta vs previous period.
   - "Šta radi" panel: top campaign by attributed conversions, top IG post
     by reach this week.
   - Sync health summary (green/amber/red per integration, click → Settings).
   - Design: this is the screen that must feel like a command center —
     confident hierarchy, cyan only where a number deserves attention.
2. Production: Vercel project (subdomain app.enigma-*, I'll set DNS), Convex
   production deployment (`npx convex deploy`), env vars checklist printed
   for me (names only, no values), crons verified live, OAuth redirect URI
   for production added to the checklist (Meta app settings).
3. README: quickstart, env list, deploy steps, UTM konvencija section.

SUCCESS CRITERIA
- Production URL: login works, all four data sections render live data,
  crons appear in Convex prod dashboard.
- Lighthouse on Overview: no layout shift, sensible mobile score.
```

---

# FAZA V2 — Ads Command modul

### Z2.1 — Ručno: Marketing API app + System User token
Novi Meta app (use case sa Marketing API) → Business Manager → System User → generiši token sa `ads_read` (+ `ads_management` za komande) za tvoj ad account → token ne ističe. Development access je dovoljan za sopstvene naloge, bez App Review-a.

### Z2.2 — Ručno: vrednosti konverzija
Odluči: koliko vredi jedan upit (Lead) u proseku. Bez ovoga nema ROAS-a — do tada je CPA/CPL primarna metrika.

---

### P11 — Pixel + Conversions API na sajtu
**Model:** Opus 5 · **Effort:** high · **Mod:** Plan → Auto · **Repo: `enigma-digital` (sajt!), ne command center**

```
This task is in the enigma-digital repo (my agency site, Next.js). Goal:
Meta Pixel + Conversions API so Meta Ads can attribute Lead conversions —
prerequisite for ROAS/CPA in my command center.

TASK
1. Add Meta Pixel (via @next/third-parties or a minimal loader — propose in
   plan mode; no consent-management scope creep, but do not block rendering).
2. Fire standard events: PageView (all pages), Lead (contact form success —
   find the existing form submit path and hook the success state), with
   event_id for deduplication.
3. Server-side Conversions API mirror for the Lead event (same event_id →
   Meta deduplicates) from the form's server action/API route. Env:
   META_PIXEL_ID, META_CAPI_ACCESS_TOKEN.
4. Set the Lead value parameter from env (LEAD_VALUE_EUR) so ROAS math works.
5. Verify with Meta Events Manager test events; document the check in README.

Surgical changes only — touch the form flow and layout head, nothing else.
```

---

### P12 — Ads hijerarhija + insights sync (adaptivni tempo)
**Model:** Opus 5 · **Effort:** xhigh · **Mod:** Plan → Auto
**Zašto:** najsloženiji sync u projektu — hijerarhija, breakdowns, hourly za aktivne, 7-dnevni lookback, rate limit budžet.

```
Read CLAUDE.md, PLAN.md sections 7.2 and 7.3 (metrics list + full ad* schema).
Marketing API via System User token (stored encrypted, provider "meta_ads").

TASK
1. Add the V2 schema from PLAN.md 7.3 (adAccounts, adCampaigns, adSets, ads,
   adInsights, adActions) with indexes for the drill-down queries.
2. `syncAdsStructure` (every 3h): pull campaign → adset → ad hierarchy incl.
   status, budgets, creative id, thumbnail/preview URLs. Mark campaigns with
   spend in the last 48h as syncPriority "hot", else "cold".
3. `syncAdsInsights`:
   - hot campaigns: every 15 min, TODAY at ad level, hourly granularity where
     available, plus breakdowns (age, gender, publisher_platform/placement) as
     separate insight rows with a breakdownHash in the upsert key.
   - cold + all: every 6h daily-level, and ALWAYS re-upsert the last 7 days
     (attribution restatement).
   - metrics per PLAN.md 7.2 incl. video metrics (3s, thruplay, p25..p100)
     and quality/engagement/conversion rankings. Compute hookRate and
     holdRate at write time.
4. Rate-limit budget: batch requests, respect X-Business-Use-Case usage
   headers, back off cleanly; a single hot campaign must never starve the
   sync of others. Log call counts per run in syncRuns.
5. Wire into runSync/Sync Health like every other provider.

SUCCESS CRITERIA
- With one active campaign: adInsights fills within 15 min of a fresh
  metric appearing in Ads Manager (spot-check spend + impressions).
- Yesterday's rows visibly restate over subsequent days (log first-write vs
  current values for one day to prove lookback works).
- Double-run produces no duplicates across breakdown rows.
```

---

### P13 — Ads ekrani: Campaigns pregled + Ad drill-down
**Model:** Fable 5 · **Effort:** high · **Mod:** Plan → Auto

```
Read CLAUDE.md; reuse shared components. Data: ad* tables from P12.
Follow the CLAUDE.md UI stack rules (shadcn base, GSAP motion, `impeccable`
skill first).

TASK
1. Ads page: campaign table — status dot, name, objective, spend, results,
   CPA/ROAS (ROAS only when conversionValue > 0), CTR, frequency; sparkline
   of daily spend; sortable; date-range shared component. Row click →
   campaign detail.
2. Campaign detail: ad sets → ads hierarchy (collapsible), per-ad metrics
   with thumbnail previews. Per-ad drill-down panel:
   - core metrics + video funnel (impressions → 3s → thruplay with hook/hold
     rates as the headline numbers)
   - breakdown tabs: age×gender heat table, placement split, hourly pattern
     for hot campaigns
   - quality/engagement/conversion rankings as subtle badges.
3. Freshness indicator: "podaci od HH:MM" per campaign (hot: minutes ago).
4. Mobile: campaign list + per-ad key metrics must be fully usable on phone.

SUCCESS CRITERIA
- Numbers match Ads Manager for the same range (±attribution settling).
- Navigation depth: any ad reachable in ≤3 clicks; no dead ends.
```

---

### P14 — Hook Battle ekran
**Model:** Fable 5 · **Effort:** xhigh · **Mod:** Plan → Auto
**Zašto:** potpisni ekran proizvoda — poređenje kreativa mora biti i statistički pošteno i vizuelno ubistveno.

```
Read CLAUDE.md, PLAN.md section 7.4. This is the product's signature screen:
comparing creative versions (hooks) inside one ad set, side by side.
Invoke the `impeccable` design skill before styling; shadcn base, GSAP for
the leader highlight and metric transitions per CLAUDE.md UI stack rules.

TASK
1. Hook labeling: in the campaign detail, ads within an ad set can be given a
   hookLabel (inline edit, stored on `ads`). Unlabeled ads default to their
   ad name.
2. Hook Battle view (entry: from an ad set, "Uporedi hooks"):
   - one column per ad version: thumbnail/preview on top, then aligned rows:
     spend, impressions, HOOK RATE (hero metric, large), hold rate, CTR,
     CPA / ROAS, frequency
   - current leader highlighted (cyan border) — leader = best CPA if
     conversions exist for ≥2 versions, else best hook rate; state the
     criterion on screen
   - statistical honesty: per version show an evidence meter; below
     configurable thresholds (default 1,000 impressions / 50 clicks) show
     "rano za zaključak" and DO NOT crown a leader; small info popover
     explains why
   - retention strip: p25/p50/p75/p100 mini bars per version for video ads.
3. Battle summary line: plain-language verdict ("Hook B — cifra: 2.1×
   hook rate lidera prethodne nedelje, CPA 38% niži") generated from the data
   with simple rules, no LLM.
4. History: battles are just live views over adInsights — but persist chosen
   hookLabels and let me pin a "battle" (ad set + date range) for later
   reference (pinnedBattles table).

SUCCESS CRITERIA
- With a real ad set of ≥2 ads, the comparison is readable in 5 seconds and
  the leader logic + thresholds behave per spec.
- Below-threshold versions never show a winner badge; verified by test data.
```

---

### P15 — Komande: pause / resume / budget / duplicate + audit
**Model:** Opus 5 · **Effort:** xhigh · **Mod:** Plan (obavezno pregledaj plan!) → interaktivno, NE auto
**Zašto:** prvi write-pristup ka pravim parama. Interaktivni mod namerno — svaku odluku agenta ovde želiš da vidiš.

```
Read CLAUDE.md, PLAN.md sections 7.5 and 7.3 (adActions). First WRITE access
to live ad accounts — treat every design decision as safety-critical.

TASK
1. Server side: Convex mutations → "use node" actions calling Graph API POST:
   - pauseResume(targetType: campaign|adset|ad, targetId, desired status)
   - changeBudget(adset|campaign, newDailyBudget) with guardrails: min/max
     bounds from env (BUDGET_MIN_EUR, BUDGET_MAX_EUR), max ±50% change per
     single action, reject otherwise with explanation
   - duplicateAd(adId, { newName }) via the ad copies endpoint, created PAUSED
   Every action writes adActions first (status "pending"), then executes, then
   updates with apiResponse or error. Idempotency: refuse duplicate identical
   pending action.
2. UI: action buttons on campaign/adset/ad rows and in Hook Battle ("pauziraj
   gubitnika" / "podigni budžet lidera"). Every action → confirm dialog
   stating exactly what will happen ("Pauziraj ad 'Hook C — demo'? Trenutni
   spend danas: €12.40"). Optimistic status update + rollback on API error.
3. Audit trail page (Settings → Istorija akcija): who, what, when, params,
   API result. Read-only, filterable by target.
4. Kill switch: env flag ADS_WRITE_ENABLED — when false, all write actions
   return a clear "write disabled" error. Default false in prod until I flip.

SUCCESS CRITERIA
- On a TEST campaign: pause → visible in Ads Manager within seconds → resume
  works; budget change respects bounds (verify both rejection paths);
  duplicate creates a paused copy.
- adActions has a complete, accurate trail of everything above.
- With ADS_WRITE_ENABLED=false nothing mutates, UI communicates it.
```

---

# FAZA V3 — pravila, Google Ads, kreativne akcije

### P16 — Rules engine + notifikacije
**Model:** Opus 5 · **Effort:** xhigh · **Mod:** Plan → Auto (akcije pravila poštuju isti kill switch iz P15)

```
Read CLAUDE.md, PLAN.md V3 notes. Build the rules engine on top of P12 data
and P15 actions.

TASK
1. Schema: rules { workspaceId, name, enabled, scope (account/campaign/adset),
   condition: { metric, operator, value, windowDays, minImpressions },
   action: "notify" | "pause" | "pause_and_notify", cooldownHours,
   lastFiredAt }, ruleFirings { ruleId, targetId, firedAt, metricValue,
   actionTaken, notified }.
2. Evaluator cron (every 30 min): evaluate enabled rules over fresh
   adInsights aggregates; respect minImpressions (no decisions on noise),
   cooldown per target, and ADS_WRITE_ENABLED for pause actions (a rule
   wanting to pause while writes are disabled → notify-only + flag).
3. Notifications via Resend email: clear subject ("CPA alert: Kampanja X"),
   body with metric, threshold, window, action taken, deep link to the
   campaign screen. Digest guard: max 1 email per rule per cooldown.
4. Rules UI: list + editor (plain-language preview sentence: "Ako CPA > €15
   tokom 3 dana uz ≥1000 impresija → pauziraj i javi mi"), firing history.
5. Ship with two template rules pre-filled but disabled: CPA guard, spend
   spike guard.

SUCCESS CRITERIA
- Seed a rule against historical data where the condition is true → fires in
  next evaluator run, sends one email, records the firing, honors cooldown.
- minImpressions verifiably blocks firing on tiny samples.
```

---

### P17 — Google Ads integracija
**Model:** Opus 5 · **Effort:** xhigh · **Mod:** Plan → Auto
**Preduslov:** odobren developer token (Z0.1), OAuth refresh token za nalog.

```
Read CLAUDE.md, PLAN.md sections 4 and 7.2 (Google Ads notes). Developer
token is approved (Basic access). Use google-ads-api npm library (community,
GAQL-based) in "use node" actions.

TASK
1. Settings: Google Ads connection — developer token, OAuth client, refresh
   token flow (document the one-time refresh-token bootstrap in README),
   customer ID. Stored encrypted like all providers.
2. `syncGoogleAds` (every 3h + Sync now): GAQL queries at ad_group_ad level →
   reuse adInsightsDaily with provider "google": impressions, clicks, ctr,
   average_cpc, cost, conversions, conversions_value → ROAS, plus campaign
   level search_impression_share; quality_score per keyword into its own
   small table (gadsKeywordQuality).
3. Same 7-day lookback re-upsert (Google also restates conversions).
4. UI: Google campaigns appear in the existing Ads screens with a provider
   badge; drill-down shows the Google-specific metrics (impression share,
   quality score) in place of Meta-only ones. No write actions yet.

SUCCESS CRITERIA
- Spend/clicks/conversions match the Google Ads UI for the same range.
- Mixed provider list sorts and filters correctly; Meta screens unaffected.
```

---

### P18 — Kreativne akcije: „duplicate with new hook" iz dashboarda
**Model:** Fable 5 · **Effort:** high · **Mod:** Plan → interaktivno (write pristup)

```
Read CLAUDE.md, PLAN.md 7.4 point 5 and the P15 action layer.

TASK
1. From Hook Battle: "Nova verzija" on any ad → flow: duplicate the ad
   (existing duplicateAd), then update the copy's creative fields that the
   Marketing API allows editing on a fresh unpublished ad (primary text,
   headline; keep the same media initially — document clearly in UI what can
   and cannot be changed via API vs Ads Manager).
2. Pre-fill the editor with the source ad's text; I edit the hook; on save →
   copy created PAUSED with hookLabel set; battle view refreshes with the
   new column marked "čeka aktivaciju".
3. Guardrails: same kill switch + audit trail as P15; max N copies per ad set
   from env.

SUCCESS CRITERIA
- End-to-end on a test ad set: duplicate → edit hook text → paused copy
  visible in Ads Manager with new text → activating it in Ads Manager makes
  it appear live in the battle.
```

---

# Dodatak — višekratni servisni promptovi

### S1 — Code review pre spajanja veće izmene
**Model:** Fable 5 · **Effort:** xhigh · **Mod:** običan (bez edit-a)

```
Review the uncommitted changes (git diff) as a hostile senior reviewer.
Priorities in order: (1) credential/token leaks into logs, queries or client
bundles; (2) sync correctness — upsert keys, lookback windows, partial-write
risks; (3) write-action safety (guardrails, audit, kill switch); (4) schema
index coverage for new queries; (5) dead code my changes orphaned.
Report only real findings with file:line and a concrete failure scenario each.
No style nits. If something is fine, do not praise it — silence means fine.
```

### S2 — Debug sesija
**Model:** Opus 5 · **Effort:** high · **Mod:** interaktivno

```
Bug: [OPIS — šta si očekivao, šta se desilo, poruka greške].
Reproduce first: find the exact failing path before proposing any fix.
Check in order: syncRuns error text → Convex logs → the provider's raw API
response (add temporary logging if needed, remove it after). Propose the
minimal fix, apply it, verify by re-running the failing path, then clean up.
Do not refactor anything beyond the fix.
```

### S3 — Redovna dopuna (mali feature)
**Model:** Sonnet 5 · **Effort:** medium · **Mod:** Auto

```
Read CLAUDE.md. Small addition: [OPIS]. Follow existing patterns exactly —
find the closest existing analog (screen, sync, component) and mirror its
structure. Surgical scope; typecheck + lint must pass; update README only if
behavior visible to me changed.
```
