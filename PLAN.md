# Enigma IT — Marketing Command Center
## Arhitektura i plan gradnje · v1.0 · 15. avgust 2026.

---

## 1. Zaključane odluke

| Odluka | Izbor | Obrazloženje |
|---|---|---|
| Backend | **Convex** (baza + cron + auth + real-time) | Poznaješ ga; ugrađeni cron jobs brišu potrebu za posebnim workerom, Redis-om i Railway servisom za command center. Dashboard postaje real-time bez dodatnog koda. |
| Frontend | **Next.js + TypeScript + Tailwind 4** | Isti stack kao sajt; deliš dizajn tokene (slate/cijan/Aeonik). |
| UI komponente | **shadcn/ui** | Baza za sve komponente (Button, Dialog, Table, Tabs, Skeleton…), restilizovana kroz naše tokene — nikad default shadcn siva. |
| Motion | **GSAP** (`gsap` + `@gsap/react`, `useGSAP`) | Svrhovit motion: reveal, hover lift, tranzicije brojeva. Uvek poštuje `prefers-reduced-motion`. |
| Dizajn proces | **`impeccable` skill** | Svaki UI zadatak u Claude Code počinje pozivanjem impeccable design skilla pre stilizovanja. |
| Struktura | **Poseban repo/folder** (`enigma-command-center`), subdomena `app.enigma-...` | Odvojen deploy od sajta; jedan Next.js projekat + `convex/` folder. |
| Auth | **Convex Auth** (email magic link / OTP preko Resend-a) | Samo ti u V1; model Workspace/Member od starta, pa se klijenti kasnije dodaju bez prepravke. |
| OpenReply | Ostaje na svom stacku (Postgres + Redis + worker na Railway, web na Vercel) | To je njegov kod — ne diramo ga. Command center mu **čita bazu direktno** kroz Convex `"use node"` akciju sa read-only Postgres korisnikom. |

Ključni princip (već dogovoren): **srce sistema je sopstvena baza.** Cron akcije povlače metrike iz svih API-ja u Convex; dashboard čita isključivo iz Convexa. Dobijaš brzinu, otpornost na ćudljive API-je i istoriju koju platforme brišu.

---

## 2. Arhitektura sistema

```
                         ┌──────────────────────────────────────────┐
                         │        CONVEX (cloud backend)            │
                         │                                          │
  Vercel                 │  crons.ts ──▶ internal actions (sync)    │
┌─────────────────┐      │     │                                    │
│  Next.js app    │      │     ├─ syncGa4        (svakih 6h)        │
│  app.enigma-…   │◀────▶│     ├─ syncIgInsights (svakih 6h)        │
│                 │ real │     ├─ syncOpenReply  (svakih 1h)        │
│  - Dashboard    │ time │     ├─ syncMetaAds    (V2, svakih 3h)    │
│  - Convex Auth  │      │     └─ refreshTokens  (dnevno)           │
└─────────────────┘      │                                          │
                         │  tabele: workspaces, connections,        │
                         │  ga4Daily, igAccountDaily, igMediaStats, │
                         │  orCampaignStats, syncRuns, …            │
                         └───────┬──────────┬──────────┬────────────┘
                                 │          │          │
                    ┌────────────┘          │          └──────────────┐
                    ▼                       ▼                         ▼
             GA4 Data API           Meta Graph API              OpenReply Postgres
          (service account,      (IG insights; V2 i           (Railway, read-only
             read-only)           Marketing API)               user, pg preko TCP)

  ── odvojen sistem ──────────────────────────────────────────────────────────
  OpenReply: Vercel web (webhooks, OAuth) + Railway worker (DM queue) + Redis
```

Napomene na arhitekturu:

- **Convex akcije sa `"use node"`** imaju pun Node runtime (npm paketi, TCP konekcije), limit 10 min po akciji i 512 MB RAM — više nego dovoljno za sve sync poslove.
- **Nema workera za command center.** Jedini stalno živ proces u celom sistemu je OpenReply-ev worker, koji ionako mora postojati.
- Sve spoljne integracije su **pull** (cron povlači podatke). Jedina push tačka je OpenReply-ev Meta webhook, ali on je unutar OpenReply sistema — nas se ne tiče.

---

## 3. Model podataka (Convex šema)

Multi-tenant od prvog dana, iako si u V1 sam — trošak je minimalan (jedno `workspaceId` polje svuda), a štedi bolnu migraciju kasnije.

```ts
// convex/schema.ts — skica

workspaces: { name: string, slug: string }
members:    { workspaceId, userId, role: "owner" | "client_viewer" }

// Kredencijali po integraciji — tokeni AES-GCM enkriptovani,
// ključ u Convex environment varijabli (CREDENTIALS_ENCRYPTION_KEY)
connections: {
  workspaceId,
  provider: "ga4" | "meta_ig" | "meta_ads" | "google_ads" | "openreply",
  encryptedCredentials: string,   // token / service account JSON / conn string
  externalId: string,             // GA4 property ID, IG user ID, ad account ID…
  status: "active" | "error" | "expired",
  expiresAt?: number,             // za Meta long-lived tokene (60 dana)
  lastSyncAt?: number,
}

// GA4 — dnevni agregat + po kanalu/kampanji (za UTM atribuciju)
ga4Daily:        { workspaceId, date, sessions, activeUsers, newUsers,
                   conversions, engagementRate }
ga4TrafficDaily: { workspaceId, date, sessionSource, sessionMedium,
                   sessionCampaign, sessions, conversions }
                 // index: [workspaceId, date], [workspaceId, sessionCampaign]

// Instagram organski
igAccountDaily: { workspaceId, date, followersCount, reach,
                  profileViews, accountsEngaged }
igMediaStats:   { workspaceId, mediaId, mediaType, caption, permalink,
                  publishedAt, reach, likes, comments, saves, shares, views,
                  syncedAt }   // upsert po mediaId — čuva istoriju rasta

// OpenReply snapshot (izvor istine ostaje njegov Postgres)
orCampaignStats: { workspaceId, orCampaignId, name, keyword, active,
                   dmsSent, dmsFailed, linkClicks, ctr, syncedAt }
orDailyTotals:   { workspaceId, date, dmsSent, linkClicks }

// V2
adsInsightsDaily: { workspaceId, provider: "meta" | "google", date,
                    campaignId, campaignName, spend, impressions, clicks,
                    conversions, cpa, status }

// Operativa
syncRuns: { workspaceId, provider, startedAt, finishedAt?,
            status: "running" | "ok" | "error", error?, itemsWritten }
```

Strategija upisa: sync uvek radi **upsert po prirodnom ključu** (`date`, `mediaId`, `orCampaignId`) sa lookback prozorom (GA4 poslednja 3 dana, jer Google naknadno koriguje brojke; IG media poslednjih 30 objava). Retention: ne brišemo ništa — cela poenta je istorija.

---

## 4. Sync strategija po integraciji

**GA4** — `@google-analytics/data` (ili REST + `google-auth-library`) u node akciji. Service account sa Viewer pristupom na property. Cron na 6h: `runReport` za dnevne agregat metrike + izveštaj po `sessionSource/Medium/Campaign`. Kvote su ogromne za ovaj obim; nema token refresh problema (service account = trajni ključ). **Najlakša integracija — ide prva i njome se dokazuje ceo pipeline.**

**Instagram insights** — koristi **isti Meta app koji praviš za OpenReply** (tip „Instagram API with Instagram Login"). U OAuth scope dodaješ `instagram_business_manage_insights` pored messaging scope-ova. Pošto si vlasnik/tester app-a i povezuješ sopstveni nalog, **App Review ti ne treba** (isto pravilo kao za OpenReply self-hosting). Long-lived token traje 60 dana → dnevni cron `refreshTokens` ga obnavlja pre isteka. Cron na 6h povlači: account insights (`reach`, `profile_views`, `accounts_engaged`, `followers_count`) i insights poslednjih ~30 media objekata. Facebook Page metrike su odvojena priča (traže Facebook Login for Business + `pages_read_engagement`) — ostavljamo za kasnije, IG je primarni kanal.

**OpenReply** — Convex node akcija sa `pg` paketom se konektuje na Railway Postgres **public proxy URL** koristeći posebnog **read-only korisnika** (`CREATE USER cc_reader … GRANT SELECT`). Čita kampanje, DM logove, tracked link klikove; upsert u `orCampaignStats`/`orDailyTotals`. Cron na 1h (jeftin upit, a podaci su „živi"). Ovo je i osnova za kasnije „utapanje" OpenReply dashboarda u command center.

**Meta Ads (V2)** — Marketing API sa **development pristupom**: za sopstveni ad nalog (System User token iz Business Manager-a — ne ističe) čitaš kampanje/potrošnju bez App Review-a. Akcije (pauza, budžet) su `POST` na iste objekte. Napomena: Meta preporučuje odvojen app za Marketing API use case — praviš drugi app kad dođe V2, isto bez review-a za sopstvene naloge.

**Google Ads (V3)** — developer token se traži kroz API Center u **Manager (MCC) nalogu**; Basic access prolazi kroz ručno odobrenje koje ume da traje nedeljama. Zato: **prijavu podnosiš odmah** (korak 0), gradiš ostalo dok odobrenje sazreva.

**UTM atribucija** — konvencija: `utm_source=instagram`, `utm_medium=openreply-dm` (ili `bio`, `story`), `utm_campaign=<slug identičan imenu OpenReply kampanje>`. OpenReply tracked linkovi dobijaju ove parametre pri kreiranju kampanje. Dashboard onda spaja: `orCampaignStats.name` ↔ `ga4TrafficDaily.sessionCampaign` → **kontent → DM klik → GA4 sesija → konverzija (upit)**, bez ikakvog dodatnog koda na sajtu (contact forma već treba da bude GA4 event).

---

## 5. Setup API pristupa — redosled i šta gde klikćeš

Poređano tako da dugotrajne stvari krenu prve:

**Korak 0 — odmah, pre bilo kakvog koda (ukupno ~1h klikanja):**

1. **Google Ads developer token**: napravi Manager (MCC) nalog na ads.google.com ako ga nemaš → API Center → Apply for Basic access. Ovo čeka odobrenje nedeljama — zato ide danas.
2. **Meta developer app** (služi i OpenReply i IG insights): developers.facebook.com → Create App → tip Business → use case „Manage messaging and content on Instagram". Zapiši Instagram App ID/Secret + Facebook App Secret. Pošalji tester pozivnicu svom IG nalogu i **prihvati je u IG aplikaciji** (Settings → Apps and websites → Tester invites) — poznata zamka.
3. **GA4 service account**: console.cloud.google.com → novi projekat → uključi „Google Analytics Data API" → Service accounts → kreiraj + JSON ključ → u GA4 Admin → Property access → dodaj service account email kao **Viewer**. Gotovo za 15 minuta.
4. **Resend**: nalog + verifikovan domen (treba i OpenReply-u i Convex Auth-u).

**Korak 0.5 — OpenReply deploy (poseban kolosek, ~pola dana):**
Railway (Postgres + Redis + worker: build `npm run db:generate`, start `npm run worker`) → Vercel (web, sve env varijable; `ENCRYPTION_KEY` **identičan** na obe strane) → migracija baze sa lokalne mašine preko public URL-a → Meta webhook (`/api/webhook`, subscribe na `comments`) → OAuth redirect (`/api/instagram/callback`) → privacy/terms/data-deletion stranice → **app na Live** (bez Live ne stižu pravi komentari) → test: komentar sa ključnom reči → DM. Na kraju: `CREATE USER cc_reader` sa `GRANT SELECT` za command center.

---

## 6. Redosled gradnje V1

Svaki milestone ima jasan „gotovo kada" kriterijum:

**M1 — Scaffold (pola dana).** `create-next-app` + `npx convex dev` u novom folderu `enigma-command-center`. Port dizajn tokena sa sajta (slate pozadine, cijan akcenti, Aeonik, tw config). Convex Auth sa magic linkom. App shell: sidebar navigacija (Overview / Analytics / Instagram / OpenReply / Settings), prazna stanja u tvom vizuelnom jeziku. *Gotovo kada: login radi i vidiš prazan dashboard na localhost-u.*

**M2 — Temelj podataka (pola dana).** Convex šema iz sekcije 3, crypto helper (AES-GCM), `connections` CRUD u Settings ekranu (unos GA4 property ID + service account JSON, itd.), `syncRuns` logika + Sync Health widget (poslednji sync po integraciji, status, greška). *Gotovo kada: kredencijali se čuvaju enkriptovano i vide u Settings.*

**M3 — GA4 pipeline (1 dan).** `syncGa4` node akcija + cron na 6h + ručno „Sync now" dugme. Backfill poslednjih 90 dana. Dashboard: kartice (sesije, korisnici, konverzije, trend vs prethodni period) + linijski grafikon + tabela izvora saobraćaja. *Gotovo kada: pravi GA4 brojevi stoje na ekranu i sami se osvežavaju.*

**M4 — OpenReply reader (pola dana; posle koraka 0.5).** `syncOpenReply` sa `pg` + read-only konekcijom, cron na 1h. Ekran: kampanje sa DM/klik/CTR brojkama, dnevni trend. *Gotovo kada: OpenReply kampanja koju vidiš u njegovom dashboardu ima iste brojke u tvom.*

**M5 — IG insights (1 dan).** OAuth flow za povezivanje IG naloga (ili ručni unos long-lived tokena za start), `syncIgInsights` + `refreshTokens` cron. Ekran: followers/reach/profile views trend + grid objava sortiran po reach/saves. *Gotovo kada: vidiš metrike po objavi za poslednjih 30 objava.*

**M6 — UTM atribucija (pola dana).** Konvencija dokumentovana u README; view koji spaja OpenReply kampanje sa GA4 `sessionCampaign` podacima: kontent → klikovi → sesije → konverzije. *Gotovo kada: za jednu pravu kampanju vidiš ceo lanac.*

**M7 — Overview + deploy (pola dana).** Overview ekran: najbitnije sa sve tri integracije na jednom ekranu („sve metrike na jednom mestu" — cilj V1). Vercel deploy na `app.enigma-…` subdomenu, Convex production deployment, cron radi u produkciji. *Gotovo kada: otvoriš telefon, ulogueš se, vidiš sve.*

Ukupno: **~4–5 radnih dana** čistog rada za V1, plus OpenReply setup kolosek.

**V2 = Ads Command modul** — detaljna spec u sekciji 8. **V3:** rules engine (`ako CPA > X → pauziraj + notifikacija`), Google Ads integracija kad token bude odobren, kreativne akcije (dupliraj ad sa novim hook-om iz dashboarda).

---

## 7. Ads Command modul (V2) — „most advanced" spec

Cilj: kad objaviš reklamu, u command centeru **odmah** vidiš kako diše — po verziji kreative, po hook-u, po publici — i odatle je gasiš, skaliraš i porediš, bez ulaska u Ads Manager.

### 7.1 Dve realnosti koje dizajn mora da poštuje

1. **„Odmah" znači ~15 minuta, ne sekunde.** Meta Insights API osvežava brojke sa malim kašnjenjem. Rešenje: **adaptivni sync** — kampanje sa aktivnom potrošnjom sinhronizujemo na 15 min, pauzirane/stare na 6h. Za tebe je efekat „live": objavi reklamu, do prve kafe imaš impresije, CTR i CPM na svom ekranu.
2. **ROAS ne postoji dok ga ne napraviš.** ROAS = vrednost konverzija ÷ potrošnja. Da bi API uopšte vratio ROAS/CPA, sajt (tvoj i klijentski) mora imati **Meta Pixel + Conversions API** sa definisanim eventima (`Lead`, `Contact`, `Purchase`) i — za ROAS — **dodeljenom vrednošću** konverzije (za servisni biznis: prosečna vrednost upita/ugovora). Ovo je preduslov-zadatak u V2, ne opcija. Isto važi za Google Ads (conversion tracking + vrednosti). Dok vrednosti nisu definisane, dashboard prikazuje CPA/CPL kao primarnu metriku, ROAS čim je uključiš.

### 7.2 Šta se povlači (Meta Marketing API, nivo **ad-a**, ne kampanje)

Puna hijerarhija `campaign → adset → ad → creative` plus insights na najnižem nivou, jer se tu vidi koji hook radi:

- **Osnovne:** spend, impressions, reach, frequency, clicks, unique CTR, CPC, CPM, CPP
- **Konverzione:** rezultati po optimization goal-u, CPA/CPL, purchase/lead value → **ROAS**, cost per unique action
- **Kreativne (za hook testiranje):** video 3s/ThruPlay views → **hook rate** (3s views ÷ impressions) i **hold rate** (ThruPlay ÷ 3s), video retention kriva (25/50/75/95/100%), outbound CTR, engagement po ad-u
- **Breakdowns:** age, gender, placement (feed/reels/stories), platform (FB/IG), device, hourly — svaki red u bazi nosi dimenzije, pa dashboard može da odgovori „ova verzija radi kod žena 25–34 na Reels, ona druga nigde"
- **Kvalitativne:** quality ranking, engagement rate ranking, conversion rate ranking (Metina ocena vs konkurencija)

Google Ads ekvivalent (V3, kroz GAQL): impressions, clicks, CTR, avg CPC, conversions, conversion value → ROAS, search impression share, quality score po keyword-u.

### 7.3 Prošireni model podataka

```ts
adAccounts:  { workspaceId, provider, externalId, name, currency }
adCampaigns: { workspaceId, accountId, externalId, name, objective,
               status, dailyBudget, syncPriority: "hot" | "cold" }
adSets:      { workspaceId, campaignId, externalId, name, status,
               targetingSummary, dailyBudget }
ads:         { workspaceId, adSetId, externalId, name, status,
               creativeId, hookLabel?,   // ručna oznaka verzije hook-a
               thumbnailUrl, previewUrl }

adInsights:  { workspaceId, adId, date, hour?,        // hourly za "hot"
               breakdown?: { age?, gender?, placement?, platform? },
               spend, impressions, reach, frequency, clicks, ctr, cpc, cpm,
               video3s, thruplay, videoP25, videoP50, videoP75, videoP100,
               results, costPerResult, conversionValue, roas,
               qualityRanking?, engagementRanking?, conversionRanking? }
             // upsert ključ: [adId, date, hour, breakdownHash]
             // lookback 7 dana — atribucija se sleže danima unazad

adActions:   { workspaceId, userId, targetType, targetId,
               action: "pause" | "resume" | "budget_change" | "duplicate",
               params, executedAt, apiResponse }   // audit trail svake komande
```

Napomena uz `adInsights` lookback: Meta pripisuje konverzije unazad (7-day click atribucija), pa se jučerašnji ROAS menja još danima. Sync zato uvek re-upsertuje poslednjih 7 dana — brojke ti se same „slegnu" kao u Ads Manageru, ali ostaju na tvom ekranu.

### 7.4 Hook testing workflow (srce modula)

1. U Ads Manageru (ili kasnije iz command centera — V3 akcija „duplicate with new creative") postaviš **jedan ad set = jedna publika, više ads = više hook verzija**.
2. Command center automatski grupiše ads unutar ad seta i nudi da svakoj verziji daš `hookLabel` („Hook A — bol", „Hook B — cifra", „Hook C — demo").
3. **Hook Battle ekran:** verzije jedna pored druge — hook rate, hold rate, CTR, CPA/ROAS, potrošnja — sa označenim liderom i statističkim upozorenjem dok je uzorak mali („< 1.000 impresija po verziji — rano za zaključak").
4. Komande na klik: **pauziraj gubitnika, podigni budžet pobedniku** (uz confirm dijalog; svaka akcija u `adActions` audit log).
5. V3: pravilo „posle 3 dana i ≥ X impresija, auto-pauziraj verzije sa CPA > 1.5× lidera + pošalji mi notifikaciju".

### 7.5 Komande (write API)

V2 startuje sa tri bezbedne, visokovredne akcije: `pause/resume` (campaign/adset/ad), `budget_change` (daily budget, sa min/max ogradama), `duplicate ad`. Sve idu kroz Convex mutation → node akcija → Graph API `POST`, sa confirm dijalogom u UI i audit logom. Kompleksno kreiranje kampanja od nule ostaje u Ads Manageru — tu je on i dalje bolji alat; command center preuzima ono što radiš svaki dan.

### 7.6 Redosled gradnje V2 (~4–5 dana)

1. **Preduslov:** Pixel + Conversions API eventi na sajtu, vrednosti konverzija definisane (pola dana + odluka o vrednostima).
2. Drugi Meta app (Marketing API use case) + System User token iz Business Manager-a (ne ističe) — development access, bez App Review-a za sopstvene naloge.
3. Sync hijerarhije + `adInsights` sa adaptivnim tempom (hot 15 min / cold 6h) i 7-dnevnim lookback-om.
4. Ekrani: Campaigns pregled → Ad drill-down sa breakdowns → **Hook Battle**.
5. Komande (pause/budget/duplicate) + audit log.

---

## 8. Rizici i zamke

- **Meta token istekne (60 dana)** → `refreshTokens` cron obnavlja na ~50 dana; `connections.status = "expired"` + upozorenje na dashboardu ako refresh padne.
- **GA4 naknadne korekcije podataka** → lookback upsert od 3 dana rešava.
- **OpenReply šema se promeni pri update-u** → sync čita kroz eksplicitne SELECT upite sa fiksnim kolonama; `syncRuns` hvata grešku i dashboard je prikaže umesto tihe laži.
- **Railway public Postgres URL izložen** → read-only korisnik + jak password + connection string enkriptovan u Convexu. Opciono kasnije: OpenReply API endpoint umesto direktnog DB pristupa.
- **Convex lock-in** → prihvaćen svesno; šema je prenosiva na SQL ako ikad zatreba.
- **Google Ads odobrenje kasni** → zato je u koraku 0; V1 i V2 ne zavise od njega.
- **Marketing API rate limit na development pristupu** → niži nego standard tier, ali za jedan-dva ad naloga sa 15-min sync-om sasvim dovoljan; adaptivni tempo (hot/cold) drži potrošnju poziva niskom. Ako dodaš više klijenata, tražiš standard access.
- **Mali uzorci u hook testovima** → dashboard eksplicitno označava „rano za zaključak" ispod praga impresija, da lepe cifre na malom uzorku ne donose pogrešne odluke.