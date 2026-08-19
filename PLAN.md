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

---

## 9. YouTube modul

Jedini modul u command centeru koji i **čita** i **piše**: pored analitike kanala, on i odgovara ljudima u ime kanala. Zato ima svoju sekciju — pravila igre su drugačija nego kod GA4 ili IG insightsa.

### 9.1 Šta modul radi

Tri celine, jedan nalog i jedan kredencijal:

1. **Analitika kanala** (`convex/youtube.ts`, `youtubeStore.ts`, ekran `/youtube`) — dnevni pregledi, vreme gledanja, neto pratioci, prosečan procenat odgledanog, izvori saobraćaja i poslednjih 30 videa. Cron na 6h, isti lookback princip kao GA4 (YouTube naknadno koriguje brojke za nekoliko dana unazad).
2. **Motor za komentare** (`ytPoll.ts` → `ytIngest.ts` → `ytReply.ts`, ekran `/youtube/automatizacije`) — ključna reč u komentaru pokreće **javan odgovor** ispod tog komentara, **moderaciju** komentara, ili oboje. Svaki obrađen komentar završi kao red u `ytCommentLogs`, i onaj koji nije prošao — jer se ništa nije poklopilo ili jer je kvota potrošena.
3. **Ručne izmene kanala** (`ytMedia.ts` kao zajednički sloj, pa `ytVideos.ts`, `ytCaptions.ts`, `ytUpload.ts`; sve sa ekrana `/youtube`) — ono što operater uradi klikom, a ne automatizacija:

   | Radnja | Gde | Šta radi |
   |---|---|---|
   | **Slanje videa** | dugme „Pošalji video" u zaglavlju | resumable upload iz browsera, sa detekcijom Shorts-a |
   | **Izmena videa** | „Izmeni" na kartici videa | naslov, opis, tagovi, kategorija, privatnost |
   | **Brisanje videa** | unutar dijaloga za izmenu | nepovratno, uz punu potvrdu |
   | **Titlovi** | „Titlovi" na kartici videa | spisak, slanje, zamena, brisanje |
   | **Poslednje radnje** | panel na dnu `/youtube` | `ytMediaJobs` — šta je pokušano i kako se završilo |

   Svaka od njih ostavlja red u `ytMediaJobs`, i onda kad ne uspe. To je namerno: automatizacije se dešavaju stotinama puta nedeljno i njihov log je tok, a ove radnje se dešavaju retko, ručno, i greška je skupa — obrisan video se ne vraća. Panel „Poslednje radnje" je jedino mesto gde se posle vidi *zašto* nešto nije prošlo; rečenica koju akcija baci nestane sa dijalogom.

Ekran `/youtube/automatizacije` je namerno odvojena ruta, isto kao `/openreply/automatizacije`: analitika je ono što gledaš svaki dan, automatizacije su ono što podesiš jednom.

### 9.2 Zašto nema DM-a

**Najčešće pitanje, pa neka stoji napisano: YouTube nema privatne poruke.** Ugašene su septembra 2019. i nikad nisu vraćene — ne postoji API endpoint, ne postoji scope, ne postoji zaobilaznica. Sve što OpenReply radi kroz Instagram DM (link, dugmad, brzi odgovori, follow gate, naknadna poruka) na YouTube-u jednostavno **ne postoji kao kanal**.

Zato je ceo model drugačiji: jedina poruka koju automatizacija može da pošalje je **javna**, potpisana imenom kanala, vidljiva svakome ko otvori video. To se vidi i u editoru — pregled crta komentar sa avatarom i imenom kanala, ne DM balon — i u šemi: `ytAutomations` nema `dmMessage`, `buttons`, `quickReplies` ni `requireFollow`.

Druga posledica: pošto je odgovor javan, **moderacija je ravnopravna akcija**, a ne dodatak. Automatizacija sme da bude „samo moderacija" bez ijednog napisanog odgovora.

### 9.3 Zašto se polluje umesto webhook-a

YouTube ima push notifikacije (PubSubHubbub na `pubsubhubbub.appspot.com`), ali one javljaju **isključivo nov ili izmenjen video na kanalu**. Za komentar ne postoji nikakav push — ni webhook, ni Pub/Sub, ništa. Jedini način da se sazna za nov komentar je pitati.

Zato `ytPoll.pollComments` na svakih 15 minuta čita `commentThreads.list` sa `allThreadsRelatedToChannelId` (jedan poziv pokriva ceo kanal; `videoId` bi tražio poziv po videu, a `search.list` košta 100 jedinica i **nikad se ne koristi za ovo**). Dedup radi tabela `ytProcessedComments` — poller svaki put ponovo vidi iste komentare, i to je jedino što sprečava da isti čovek dobije isti odgovor svakih 15 minuta.

Dve zaštite koje idu uz polling:
- **Starost komentara** — sve starije od 48h se preskače. Sprečava da prvo uključivanje motora odjednom odgovori na godine zaostalih komentara.
- **Sopstveni kanal** — komentar čiji je `authorChannelId` jednak `channelId` se preskače. To je jedina petlja koju motor ne sme da zatvori.

Poller ne piše u `syncRuns` (namerno): ti redovi su Sync Health widget za analitiku na 6h, a obilazak na 15 minuta bi ga zatrpao. Šta poller radi vidi se u logu komentara.

### 9.4 Kvota — cena i šta praktično znači

Data API v3 meri svaki poziv u „jedinicama" prema dnevnom budžetu projekta od **10 000**, koji se resetuje u **ponoć po pacifičkom vremenu** (kod nas 09:00, i leti i zimi).

| Poziv | Cena | Ko ga zove |
|---|---|---|
| `commentThreads.list` (strana do 100 komentara) | **1** | poller, na 15 min |
| `videos.list` (do 50 videa odjednom) | **1** | sync; izmena videa, pre pisanja |
| `playlists.list` | **1** | sloj za medije |
| `comments.insert` (jedan javan odgovor) | **50** | motor, po odgovoru |
| `comments.setModerationStatus` | **50** | motor, po moderaciji |
| `comments.delete` | **50** | motor i ručno brisanje |
| `videos.update` | **50** | izmena videa |
| `videos.delete` | **50** | brisanje videa |
| `thumbnails.set` | **50** | sloj za medije |
| `playlistItems.insert` | **50** | sloj za medije |
| `captions.list` | **50** | otvaranje panela sa titlovima |
| `captions.delete` | **50** | brisanje titla |
| `captions.insert` | **400** | slanje titla |
| `captions.update` | **450** | zamena titla |
| `videos.insert` (slanje videa) | **0** iz ovog budžeta | dugme „Pošalji video" |
| YouTube Analytics API (`reports.query`) | **0** iz ovog budžeta | sync na 6h |

Dve stavke u tabeli koštaju **0 iz ovog budžeta** i to nisu iste nule. Analytics API ima sopstveno ograničenje po korisniku, ne po jedinicama. `videos.insert` Google meri odvojeno i ne naplaćuje ga iz 10 000 — zato ima svoj brojač, `ytQuotaUsage.uploadsUsed`, i **svoj dnevni limit od 100 slanja koji je naš, ne Google-ov**. Postoji zbog jednog scenarija: petlje koja iznova šalje isti fajl. Zato se brojač knjiži *pre* slanja i vraća samo kada se ispostavi da resumable sesija nikad nije ni otvorena — brojač koji raste tek posle uspeha tu petlju ne bi zaustavio nijednom.

Šta to znači u brojkama:

- Sirovi plafon: 10 000 / 50 = **~200 automatskih odgovora dnevno**, i ni jedan više.
- Polling na 15 minuta troši ~96–192 jedinice dnevno (1–2 strane po obilasku) — zanemarljivo.
- Ali motor **ne radi protiv punih 10 000**. `QUOTA_RESERVE_FOR_SYNC` (2 000) je odvojen za analitiku, jer su brojke proizvod: ako motor potroši sve odgovarajući ljudima, sutrašnji sync ne može da se izvrši i dashboard pokazuje ustajale podatke do reseta. Efektivni plafon je `QUOTA_SOFT_LIMIT` = **8 000 jedinica**, odnosno **~160 odgovora dnevno** posle polling troška.
- Automatizacija koja radi i odgovor i moderaciju košta **100 jedinica po komentaru**, dakle prepolovi taj broj.

#### Dva plafona nad istim brojačem

Titl košta 400 jedinica. Deset titlova je 4 000 — pola dnevnog budžeta — i jedno popodne provedeno nad prevodima bi inače ostavilo motor za komentare bez ijedne jedinice, pa ljudi ispod videa ne bi dobili nikakav odgovor. Jedna nečija sesija montaže ne sme da ućutka kanal.

Zato **ručne izmene rade protiv nižeg plafona** nego motor, iako oba čitaju isti dnevni brojač:

| Plafon | Vrednost | Ko radi protiv njega |
|---|---|---|
| `QUOTA_DAILY_DEFAULT` | 10 000 | Google-ov budžet projekta |
| `QUOTA_SOFT_LIMIT` | **8 000** | motor za komentare (2 000 je rezerva za sync) |
| `QUOTA_MEDIA_LIMIT` | **6 000** | ručne izmene (još 2 000 je rezerva za komentare) |

Panel sa titlovima zato pre svakog klika piše koliko taj klik košta i koliko ostaje posle njega, i nikad ne citira brojku motora — obećao bi 2 000 jedinica koje medijima nisu dozvoljene.

Kvota se **rezerviše u ingestu**, ne u slanju: nalet od trideset komentara koji se poklope bi inače svaki prošao proveru koju nijedan još nije platio. Kada YouTube ipak vrati `quotaExceeded`, to je autoritativno (naš brojač ide po UTC danu, pravi reset je pacifički) i motor potroši ostatak dnevnog budžeta da ostatak reda stane umesto da pedeset puta ponovi isti osuđeni poziv.

Widget na vrhu ekrana sa automatizacijama pokazuje potrošnju u realnom vremenu, i kada je potrošena kaže kad se nastavlja.

### 9.5 Slanje videa — i zašto svaki ostaje privatan

**Ovo je ograničenje koje se ne može zaobići i mora da stoji napisano.** Google, doslovno iz dokumentacije za `videos.insert`:

> *All videos uploaded via the videos.insert endpoint from unverified API projects created after 28 July 2020 will be restricted to private viewing mode.*

Projekat `enigma-command-center` je napravljen posle tog datuma i nije prošao YouTube API Services audit. Znači: **svaki video poslat kroz ovu aplikaciju biće zaključan kao privatan.** To se ne menja ni iz aplikacije, ni iz YouTube Studija, ni ručno — skida se isključivo tako što projekat prođe audit (isti onaj iz §9.8, koji ionako treba za povećanje kvote).

Zato u kodu privatnost nije polje nego konstanta. `ytUpload.startUpload` sam sastavlja telo zahteva i u njemu je `privacyStatus: "private"`; browser ne šalje privatnost, nego dobija telo koje sme da pošalje. U dijalogu je polje zaključano i objašnjava zašto, a upozorenje stoji **iznad dugmeta, uvek vidljivo, ne u tooltipu**. Ponuditi opciju „javno" koja ne radi gore je nego je ne ponuditi: prvo je laž koja se otkrije tek posle dvadeset minuta slanja.

Dok odobrenje ne stigne, javna objava ide preko YouTube Studija — video je već na kanalu, samo privatan.

#### Kako fajl stiže do Google-a

Convex akcija nema ni vreme ni memoriju za fajl od nekoliko stotina megabajta, pa bajtovi **nikad ne ulaze u backend**:

```
browser → Convex    startUpload — knjiži dnevno slanje, otvara red u ytMediaJobs,
                    vraća tačno telo koje sme da se pošalje
browser → Convex    ytAuth.issueUploadToken — token od jednog sata, samo za upload
browser → YouTube   resumable sesija, pa fajl u parčadima od 8 MB
browser → Convex    finishUpload / failUpload — kako se završilo
```

Resumable protokol nije ukras: `POST` sa metapodacima otvara sesiju i vraća `Location` zaglavlje (bez njega se staje sa greškom — nema gde da se šalje), a fajl onda ide tamo u parčadima, svako sa `Content-Range`. Odgovor **308** znači „imam dotle, nastavi" i njegovo `Range` zaglavlje kaže dokle; **200/201** nosi gotov video sa `id`-jem. Prekinuta veza nije izgubljen posao — `PUT` sa `Content-Range: bytes */<ukupno>` pita dokle je stiglo i slanje se nastavlja odatle.

Tri stvari koje nisu očigledne, a lako se pogreše:

- **Media endpoint je drugi host.** Sve što nosi fajl ide na `www.googleapis.com/upload/youtube/v3`; isti put na običnom hostu vraća 404 bez nagoveštaja da je samo host pogrešan.
- **`Content-Length` se iz browsera ne postavlja** — to je zabranjeno zaglavlje koje `fetch` računa sam. Dokumentacija ga pominje jer je pisana za servere.
- **308 je inače kod za preusmerenje.** Browser ga ovde ne prati samo zato što odgovor nema `Location`; zbog toga `redirect` mora da ostane podrazumevani `follow` — `manual` bi vratio neprozirni odgovor bez `Range` zaglavlja, a `Range` je jedino što kaže dokle je fajl stigao.

#### Shorts

Ne postoji API za Shorts, ni polje koje video pretvara u Short. Short je **običan upload koji YouTube sam prekvalifikuje**, po dve osobine fajla: viši je nego širi, i traje najviše 3 minuta. Ništa što pošaljemo tu presudu ne menja.

Zato dijalog fajl samo **pročita** — `HTMLVideoElement` daje `videoWidth`, `videoHeight` i `duration` bez ijednog dodatnog paketa — i kaže šta će biti: „ovo će biti Short", ili „vertikalan je ali duži od 3 minuta, biće običan video". Fajl se ne dira. Kad browser ne ume da dekodira format, ekran to kaže umesto da nagađa.

### 9.6 Scope-ovi

```
https://www.googleapis.com/auth/youtube.readonly        — kanal, videi, komentari
https://www.googleapis.com/auth/yt-analytics.readonly   — izveštaji (pregledi, watch time, retencija)
https://www.googleapis.com/auth/youtube.force-ssl       — comments.insert, comments.setModerationStatus
```

**`youtube.force-ssl` je jedini scope koji dozvoljava pisanje.** Bez njega `comments.insert` i `comments.setModerationStatus` vraćaju 403 — i to je podmukla greška, jer analitika i čitanje komentara i dalje rade savršeno, pa deluje kao da je konekcija ispravna. Ako motor ume da pročita komentar ali ne i da odgovori, prvo proveri da li je refresh token izdat sa ovim scope-om. Dodavanje scope-a **traži nov refresh token** — postojeći ne dobija nova prava.

Ime je istorijsko („force SSL"), nema veze sa HTTPS-om; danas je to prosto YouTube-ov read-write scope.

### 9.7 Kako se dobija refresh token

Service account **ne radi** za YouTube (kanal pripada Google nalogu, ne projektu), pa mora OAuth sa korisničkim pristankom. Jednokratno, ~15 minuta:

1. **Google Cloud Console** → isti projekat kao GA4 → uključi **YouTube Data API v3** i **YouTube Analytics API**.
2. **OAuth consent screen** → tip *External*, dodaj sebe kao **Test user**. (U „Testing" režimu refresh token ističe posle 7 dana — za trajan token app mora biti *In production*; to je samo prekidač, ne traži verifikaciju dok su scope-ovi ograničeni na sopstveni nalog.)
3. **Credentials** → *Create OAuth client ID* → tip **Desktop app**. Zapiši Client ID i Client Secret.
4. Otvori consent URL u browseru, **ulogovan kao vlasnik kanala**:
   `https://accounts.google.com/o/oauth2/v2/auth?client_id=<ID>&redirect_uri=http://localhost&response_type=code&access_type=offline&prompt=consent&scope=<sva tri scope-a, razdvojena razmakom>`
   `access_type=offline` + `prompt=consent` su obavezni — bez njih Google vrati samo access token.
5. Google redirektuje na `http://localhost/?code=…`. Prekopiraj `code` i razmeni ga za token:
   `POST https://oauth2.googleapis.com/token` sa `code`, `client_id`, `client_secret`, `redirect_uri=http://localhost`, `grant_type=authorization_code`.
6. Iz odgovora uzmi `refresh_token` (počinje sa `1//`) i u Podešavanjima nalepi JSON:
   ```json
   { "clientId": "...", "clientSecret": "...", "refreshToken": "1//...", "channelId": "UC..." }
   ```
   `channelId` je 24 znaka i počinje sa `UC` — nađeš ga u YouTube Studio → Settings → Channel → Advanced.

Blob se u Convexu čuva enkriptovan (AES-GCM, `lib/crypto.ts`); access token se ne persistuje nego se vadi po pozivu i **nikad ne ulazi u log**. Ako refresh token prestane da važi (`invalid_grant`: povučen pristanak, rotirani kredencijali, ili 6 meseci nekorišćenja), jedini lek je ponovo povezati nalog.

### 9.8 Šta tek treba uraditi

- **Audit kod Google-a — sada rešava dve stvari, ne jednu.** Ista prijava (*YouTube API Services — Audit and Quota Extension Form*: opis aplikacije, snimak ekrana kako se podaci koriste, dokaz o poštovanju YouTube API Services ToS-a i brandinga) skida **i** granicu od 10 000 jedinica **i** prisilni privatni režim za sve poslate videe (§9.5). Traje nedeljama i nije formalnost.

  Redosled po prioritetu se promenio otkad postoji slanje videa. Kvota još nije usko grlo — 8 000 jedinica pokriva interni alat za jedan kanal. Privatni režim jeste: svaki video poslat odavde mora ručno da se objavi kroz Studio, što polovinu razloga za dugme „Pošalji video" poništava. Ako se slanje videa koristi ozbiljno, prijava ide odmah; ako se ne koristi, može da čeka.

  Do tada u kodu ništa ne treba menjati osim jedne konstante: kada audit prođe, `privacyStatus` u `ytUpload.startUpload` prestaje da bude konstanta i postaje polje u formi, a upozorenje iz `lib/ytUpload.ts` (`UPLOAD_PRIVATE_NOTICE`, `UPLOAD_PRIVACY_LOCK_REASON`) se briše zajedno sa zaključanim poljem.
- **Rad sa tuđim kanalima (klijenti).** Trenutni model je „jedan workspace, jedan kanal, ručno nalepljen refresh token" — to ne skalira na klijente. Za to treba: (a) pravi OAuth flow u aplikaciji sa `redirect_uri` na naš domen umesto ručne razmene koda, (b) **verifikacija OAuth consent screen-a** kod Google-a, jer su sva tri scope-a *sensitive/restricted* i bez verifikacije važi granica od 100 korisnika plus ekran upozorenja, (c) kvota **po projektu, ne po kanalu** — deset klijenata deli istih 10 000 jedinica, pa `ytQuotaUsage` mora da postane raspodela budžeta među workspace-ovima, a ne samo brojač, i (d) pravno: odgovaranje u ime klijenta na njegovom kanalu traži da to piše u ugovoru, jer je javno i potpisano njegovim imenom.
- **Moderacija „rejected" nema opoziv.** Editor na to jasno upozorava, ali vredi razmisliti o „suvom hodu": režim u kom automatizacija samo loguje šta bi uradila, bez pisanja. Za `heldForReview` rizik je mali, za `rejected` nije.
- **Titl videa u logu** dolazi iz `ytVideoStats` (Y2), pa komentar na videu koji sync još nije video ostaje bez naslova. Bezopasno, ali se vidi na ekranu.

---

## 10. Dizajn sistem — grafikoni (D3)

### 10.1 Paleta serija

`--chart-1..6` su zamenjeni validiranim vrednostima. Stara paleta je pala validaciju
kategoričkih paleta (`dataviz/scripts/validate_palette.js`, podloga `#131d31`, režim
`dark`) na dve provere:

```
[FAIL] Opseg svetline   van opsega: #38bdf8 L .754 · #a78bfa .709 · #34d399 .773
                                    #fbbf24 .837 · #fb7185 .719   (traži se .48–.67)
[FAIL] CVD separacija   najgori susedni par #a78bfa ↔ #38bdf8  ΔE 5.2 (deuteranopija)
```

Nova paleta prolazi svih šest, mereno istim validatorom:

```
#1c9dd6  cyan (brend) · #d95926  narandžasta · #199e70  zelena
#c98500  amber        · #d55181  magenta     · #9085e9  ljubičasta

[PASS] opseg svetline    svih 6 unutar L 0.48–0.67
[PASS] hroma             svih 6 >= 0.1
[PASS] CVD separacija    najgori susedni par #c98500 ↔ #199e70  ΔE 8.4 (protan)
[PASS] normalan vid      najgori susedni par #d55181 ↔ #c98500  ΔE 19.3
[PASS] kontrast          svih 6 preko 3:1 prema #131d31
```

**Nemam primedbu ni na jednu vrednost** — validator je pokrenut nezavisno i vratio
iste brojeve koje spec navodi. Vrednosti su prepisane doslovno.

`--accent-*` (`#38bdf8` i okolina) se **nije** menjao. Cyan ostaje boja interaktivnih
elemenata i ključnih metrika; `--chart-1` je zaseban, tamniji cyan za seriju. Zato KPI
pločica „Sesije" (accent) i linija „Sesije" na grafikonu (chart-1) namerno nisu iste
boje — to su dva različita sloja sistema.

### 10.2 Posledica po kontrast teksta

Nova paleta je tamnija za oko jedan korak, pa boja serije kao **boja teksta** više ne
prolazi AA za sitan tekst:

```
prema --card #131d31:   chart-2  4.33:1   chart-5  4.27:1   (AA traži 4.5:1)
prema --surface-raised: chart-2  3.96:1   chart-5  3.90:1
```

To je ionako bilo protiv pravila („tekst nosi tekstualne tokene, nikad boju serije"),
pa su bedževi u `/ads` koji su nosili `text-chart-*` prebačeni na `text-foreground`;
obojeni okvir i tačkica i dalje nose identitet.

**Ostaje za D4/D5:** `text-chart-1/80` i `text-chart-2/80` na sitnim ikonicama u
`youtube-videos-grid.tsx` i `instagram-content-grid.tsx`. To su dekorativne ikonice
uz metriku, nisu serije — tokeni grafikona tu uopšte ne pripadaju. Nije dirano jer je
D3 o grafikonima, ali sa tamnijom paletom te ikonice postaju mutne.

### 10.3 Zajednička vremenska serija

Četiri ekrana (`/analytics`, `/instagram`, `/openreply`, `/youtube`) imala su četiri
kopije istog grafikona — dva panela jedan ispod drugog, oko 250 linija svaka, sa
razlikom samo u imenima serija. D3 traži osam izmena na svakom od njih (ravna
ispuna, zaobljenje 4 px, razmak 2 px, direktne oznake, sortiran tooltip sa promenom,
i tri nova stanja). Osam izmena puta četiri kopije je osam prilika da se kopije
raziđu, pa je oblik izvučen u `components/app/timeline-chart.tsx`, a četiri fajla su
ostala kao tanka konfiguracija (~60 linija). Pravila iz D3 sada žive na jednom mestu.

Dva panela, nikad dve y-ose: mera gore kao površina, mera dole kao trake, zajednička
x-osa kroz `syncId`. Jedan tooltip za oba panela — kad pređeš mišem preko traka,
očitavanje se pojavi u gornjem panelu i nosi obe serije za taj dan.

### 10.4 Odluke koje spec nije propisao

Tri mesta gde je spec ostavio prostor, pa je izbor moj:

1. **„Promena u odnosu na prethodni period" u tooltipu = prethodni dan.** Nadzorne
   table računaju prethodni period samo kao zbir (za KPI pločice), ne po danu. Za
   tačku na dnevnoj vremenskoj seriji jedino poređenje koje zaista postoji u
   podacima je prethodni dan, pa je to prikazano. Kada je prethodni dan nula,
   procenat nema smisla i piše „—".
2. **Direktne oznake: prva, poslednja i ekstrem, ali sa gušenjem sudara.** Ako je
   ekstrem bliži od 56 px nekom kraju, njegova oznaka se preskače — kraj već nosi
   taj broj. Na panelu sa trakama obeležen je samo ekstrem: panel je visok 112 px i
   tri oznake se u njemu sudaraju.
3. **Stanje greške traži granicu greške.** Grafikoni do sada nisu imali nijednu.
   Dodat je `ChartErrorBoundary` (`components/app/chart-states.tsx`) oko svakog
   grafikona u četiri nadzorne table — inače bi stanje greške bio mrtav kod koji se
   nikad ne prikaže. Granica hvata samo iscrtavanje; logika podataka nije dirana.

### 10.5 Šta je pokazala provera u browseru

Validator proverava boju; raspored se vidi samo okom. Provera je išla preko
privremene rute `app/r/d3/` (obrisana posle) sa sintetičkim podacima: 28 dana,
90 dana, 7 dana, nivo, prazno, greška — na 1280 px i na 390 px. Pet stvari koje
se u kodu nisu videle:

1. **Oznaka na kraju linije sedi na samoj tački.** Vrednost tačno iznad krajnje
   tačke poklopi tačku. Rešenje: pomeraj od 7 px ka unutrašnjosti panela.
2. **A onda sedi na liniji.** Kada linija strmo pada u poslednju tačku, prostor
   iznad je već zauzet linijom. Sada strana bira sebe: ako linija ulazi odozgo,
   oznaka ide ispod. Ivica panela nadjačava taj izbor — bolje preko linije nego
   odsečeno.
3. **Fiksnih „najviše sedam datuma" na x-osi je previše za telefon.** Na 390 px
   se sedam datuma slepi u jednu crnu traku. Zamenjeno sa `preserveStartEnd` +
   `minTickGap`, pa se osa proređuje prema raspoloživoj širini; prvi i poslednji
   dan uvek ostaju.
4. **Osa i očitavanje su govorili različitim jedinicama.** YouTube panel je imao
   osu u minutima (25.000) a očitavanje u satima (333 h), za istu meru. Sada osa,
   direktna oznaka i očitavanje idu kroz isti formater.
5. **Opadajuće sortiranje očitavanja radi samo unutar iste jedinice.** Pregledi i
   minuti gledanja nisu uporedivi: sortiranje po sirovoj vrednosti stavi
   „333 h" iznad „7.475", što izgleda kao poredak a nije. Sortira se kada obe
   serije dele formater (GA4, Instagram, OpenReply); kada ne dele, redosled
   prati panele. **Ovo je odstupanje od slova specifikacije** („sortirano
   opadajuće po vrednosti") i moja je odluka, ne korisnikova.

Prostor iznad najviše marke je usput postao uslovan: okrugli podeoci obično već
ostave višak, pa se fiksnim množiocem panel bespotrebno praznio.
