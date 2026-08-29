# Enigma — profil firme za marketinške svrhe

Izvor: read-only pregled dva repoa na korisnikovom računaru (`~/mnt/enigmait`, `~/mnt/enigmadigital`), 29.08.2026.
Nijedan `.env`, service-account JSON ni token nije otvaran; ovde nema nijedne tajne vrednosti.

---

## 1. Identitet firme

| Stavka | Vrednost (kako stoji u kodu) |
|---|---|
| Brend na sajtu | **Enigma Digital** (metadata, footer, JSON-LD `Organization`) |
| Pravno/domensko ime | **Enigma IT** (tako se zove u `enigmadigital` README/PLAN) — domen `enigmait.rs` |
| Sajt | `enigmait.rs` (Next.js repo `enigmait`) |
| Interni alat | `digital.enigmait.rs` (Marketing Command Center, repo `enigmadigital`) |
| Email | `office@enigmait.rs` |
| Telefon | `+44 20 4577 1943` (UK broj u kontaktu i JSON-LD) |
| Lokacija | Nije navedena adresa. Pozicionira se kao **remote-first, „Evropa / prvo na daljinu"**, „partnerstva sa timovima širom EMEA regiona i Severne Amerike". Tržište u internim dokumentima: **Srbija** (lead mašina eksplicitno: Beograd, srpske firme). |
| Tim | U lead dokumentu: **3–4 osobe**, vlasnik/operater se zove **Jovan**. Na sajtu se obećava „posvećen tim od 3–6 specijalista" po projektu. |
| Društvene mreže | IG `@enigmadigital.studio`, TikTok `@enigmadigital.studio`, FB `/enigmadigital.studio` |
| Godine/osnivanje | **Nigde nije navedeno.** Nema „od 20XX", nema broja godina iskustva. |

**Važna rupa:** `app/(pages)/about/` postoji kao folder ali je **prazan** — About stranica nije napravljena. Nema priče o firmi, nema tima, nema godina, nema adrese. To je najveći nedostatak za marketing (E-E-A-T, poverenje, lokalni SEO).

---

## 2. Sajt `enigmait` — struktura i copy

### 2.1 Rute

```
/                        Hero + Timeline (proces) + Disciplines (6 usluga, 3D) + TechSection
/services                pregled svih usluga
/services/web-development
/services/ui-ux-design
/services/mobile-app-development
/services/seo-geo
/services/branding
/services/social-media
/projects                showcase 6 klijentskih sajtova (3D device scene, video kartice)
/contact                 forma + kontakt podaci
/brand                   javne brand smernice
/privacy  /terms  /politika-kolacica
/about                   PRAZNO — folder bez sadržaja
```

### 2.2 Hero (početna)

- **Headline:** „One line. Everything connected." (dve rečenice, reč-po-reč GSAP reveal; srpski prevod ide kroz `lib/i18n.ts`)
- **Lede:** „Product, engineering and design as one continuous system — not three vendors."
- **CTA:** „Start a project" (→ `/contact`) + „See our work" (→ `/projects`)
- Vizuelno: 3D logo-kocka (`hero-cube.glb`) koja se iscrtava jednom neprekidnom linijom, u petlji, na providnoj pozadini. Ceo hero je spec-iran u `HERO_SPEC.md` (R3F + custom GLSL shader, `TEXCOORD_0.x` kao normalizovana putanja).

**Value proposition u jednoj rečenici:** jedan tim koji drži strategiju, dizajn i inženjering kao jedan sistem — a ne tri dobavljača — i meri rezultat.

### 2.3 Sekcija „Šest disciplina. Jedan tim." (početna)

Kicker: „Pick a discipline" · Naslov: **„Six disciplines. One team."**
Lede: „Each one is a full squad - strategy, design and engineering in the same room. Start where you need it most."
Emituje `ItemList` JSON-LD sa šest `Service` nodova.

Slogani po disciplini (nav + disciplines):
- Web development — „Develop. Dominate. Scale." / „Razvijaj. Dominiraj. Skaliraj."
- UI | UX Design — „Intuitive experiences, beautiful interfaces."
- Mobile App Development — „From idea to App store."
- SEO & GEO — „Appear at top on Google & Chatbots." / „Budite pri vrhu na Google-u i u AI pretragama."
- Branding — „Instantly recognizable. Effortlessly remembered."
- Social Media — „Turning followers into fans." / „Pretvaramo pratioce u obožavaoce."

### 2.4 Proces (5 faza, sekcija Timeline)

1. IDEJA & ANALIZA · 2. PLANIRANJE & DIZAJN · 3. RAZVOJ & IMPLEMENTACIJA · 4. TESTIRANJE & OPTIMIZACIJA · 5. LAUNCH & PODRŠKA

### 2.5 Sekcija „Izazovi" (`constants/challenges.ts`)

Promenljiva očekivanja korisnika · Jača tržišna konkurencija · Balans troškova i vrednosti · Izazovi fizičkih lokacija (offline↔online) · Monetizacija korisničke pažnje.

---

## 3. Usluge — pozicioniranje po servisu

Svih šest stranica ima **identičnu strukturu**: hero (eyebrow / naslov / lede / 2 CTA) → 4 statistike → 6 „capabilities" → 5 procesnih koraka sa deliverable-om → 4 diferencijatora → „Šta dobijate" (6 stavki + tech chips) → 6–8 FAQ (i FAQPage JSON-LD) → finalni CTA → SEO meta.

**Cene: NIGDE nema iznosa.** Cena se pominje samo u FAQ-u, i to načelno:
- Web: „timovi kreću od fleksibilnih retainera sa transparentnim nedeljnim metrikama brzine"
- Branding: „počinju definisanim sprintom ili mesečnim retainer-om"
- Social: „angažmani se definišu mesečno prema broju kanala, obimu sadržaja i podršci za paid media"
- SEO: „kvartalni roadmap, mesečno izveštavanje, kontinuirani optimizacioni sprintovi"

Model prodaje = **retainer / sprint**, ne fiksna cena po projektu. Nema paketa, nema pricing stranice.

### 3.1 Izrada web sajtova (`/services/web-development`)

- Eyebrow: „Inženjerska izvrsnost" · Naslov: **„Web platforme projektovane za rast i otpornost"**
- Lede: od marketing sajtova koji konvertuju do kompleksnih SaaS tokova; performanse, observability i skalabilnost od prvog sprinta.
- **Obećane brojke:** `<2s` prvi prikaz · `99.9%` SLO dostupnosti · `4 ned.` do MVP lansiranja · `+40%` prosečan rast konverzije
- Opseg: marketing platforme (composable CMS), SaaS arhitektura, edge/serverless, performanse i observability, CI/CD automatizacija, bezbedne data integracije
- Diferencijatori: „Građeno za rast", „Održivo od prvog sprinta", „Performanse ugrađene", „Remote-first, usklađeno kroz vremenske zone"
- Stack chips: Next.js, React, TypeScript, Tailwind, Node.js, GraphQL, PostgreSQL, Playwright, Vercel
- CTA: „Pokrenite izradu" · Final: „Recite nam šta gradite — vraćamo se sa planom, timom i rokom **u roku od 48 sati**."

### 3.2 UI/UX dizajn

- Eyebrow „Dizajn sistemi" · **„Interfejsi koji svuda deluju prirodno"**
- Brojke: `+30%` vreme na zadatku · `-25%` stopa grešaka · `+18` NPS poena · `AA` pristupačnost
- Isporuke: research izveštaji i service blueprint-i, Figma biblioteke sa tokenima, anotirani tokovi, **WCAG 2.2 AA** provere, motion smernice sa reduced-motion, governance model
- Stack: Figma, FigJam, Framer, Storybook, Miro, Maze, Lottie
- CTA: „Zatražite dizajn radionicu"

### 3.3 Izrada mobilnih aplikacija

- Eyebrow „Mobilni proizvod" · **„Native iskustva projektovana za zadržavanje korisnika"**
- Brojke: `8 ned.` do prodavnice · `60 fps` · `99.5%` sesija bez pada · `4.8` prosečan rast ocene
- Radi i cross-platform (React Native, Flutter, Expo) i native (Swift, Kotlin); vodi store submission, feature flagove, fazne rollout-e, ASO i review management
- CTA: „Isplanirajte aplikaciju"

### 3.4 SEO i GEO

- Eyebrow „Vidljivost" · **„Budite vidljivi tamo gde vas publika traži"**
- **GEO = optimizacija za AI pretrage** (strukturirani odgovori, schema markup) uz klasičan tehnički SEO — to je glavni diferencijator ove stranice
- Brojke: `30%` cilj rasta saobraćaja · `90d` ritam roadmap-a · `50+` optimizovanih strana · `12` podržanih tržišta
- Rani signali obećani za 6–12 nedelja; radi i strategiju i implementaciju, hreflang / višejezično, lokalne listinge
- Stack: Search Console, Ahrefs, Screaming Frog, GA4, Looker Studio, Schema.org
- CTA: „Zatražite SEO audit" → „tehnički izveštaj i 90-dnevni roadmap"

### 3.5 Brending

- Eyebrow „Identitet brenda" · **„Brendovi koji deluju usklađeno od piksela do ambalaže"**
- Brojke: `4 ned.` brend sprint · `20+` launch asset-a · `95%` usklađenost stakeholder-a · `3x` rast prepoznatljivosti
- 2–3 kreativna pravca za logo, naming i verbalni identitet, brand book, enablement sesije
- Stack: Figma, Illustrator, After Effects, Notion, Frontify
- CTA: „Pokrenite brend sprint" (4–6 nedelja)

### 3.6 Društvene mreže

- Eyebrow „Zajednica i sadržaj" · **„Neka svaka tačka kontakta zasluži pažnju"**
- Brojke: `5x` rast angažovanja · `24h` rok za kreativu · `12` kampanja po kvartalu · `2x` rast pratilaca
- Obim: 3–7 objava nedeljno + stories/shorts; community management, moderacija, approval workflow; **paid social** (kreativa, targeting, optimizacija); creator partnerstva
- Platforme: TikTok, Instagram, LinkedIn, YouTube, X + nove
- Stack: TikTok, Instagram, LinkedIn, YouTube, Meta Ads, CapCut, Buffer
- CTA: „Pokrenite kampanju"

### 3.7 Pregled `/services`

„Modularni skup usluga napravljen za isporuku rezultata" · brojke: `30+` isporučenih lansiranja, `8 wks` prosečna isporuka, `98%` zadržavanje klijenata. CTA „Definišite svoj stack".

---

## 4. Projekti / showcase

Šest **pravih klijentskih sajtova**, sa live URL-ovima. Fajl `constants/projects.ts` eksplicitno kaže: **namerno bez metrika**, jer nema pristup analitici tih sajtova — „procenat bi bio broj koji niko ne može da proveri". Prikazuje se samo opseg posla + živa adresa.

| Projekat | URL | Industrija | Opseg |
|---|---|---|---|
| Studio Lady Gaga | ladygagastudio.rs | Lepota i nega (frizerski salon, Šabac) | Sajt + web-shop + galerija pre/posle + upit za termin |
| ABLux Travel | abluxtravel.com | Turizam / verski turizam | Sajt, katalog aranžmana, SR+EN, forma za upit |
| Global Beo Mobil Trend | gbmt.rs | Video nadzor + iskopni radovi | Sajt, stranica po delatnosti, kontakt |
| The Original Way | the-original-way.vercel.app | Moda / e-commerce | Web-shop, katalog i korpa, SR+EN, light/dark |
| Fides Gradnja | fidesgradnja.vercel.app | Građevinarstvo i nekretnine | Sajt, galerija radova, ponuda nekretnina |
| Digist | digist.vercel.app | Digitalni marketing (za hotele/restorane/kafiće) | Sajt na engleskom, usluge, tim, kontakt |

Stranica `/projects`: „Radovi otvoreni za proveru"; brojke = 6 projekata uživo, 2 web-shopa sa naplatom, „100% adresa vodi na živ sajt". Koraci: Razgovor i plan → Dizajn i izrada → Lansiranje i podrška.

**Ciljne industrije koje se vide iz portfolija:** lokalne uslužne firme u Srbiji (saloni, agencije, građevina, tehničke usluge) + mali e-commerce. To se **ne poklapa** sa copy-jem usluga, koji cilja SaaS/product timove i „EMEA & North America". To je najveći raskorak u pozicioniranju.

---

## 5. Kontakt forma i put leada

**Polja** (`ContactForm.tsx` + `actions.ts`):
- `name` (obavezno), `email` (obavezno), `company` (opciono), `message` (obavezno)
- `interests` — pilule „Šta vas zanima?": Opšte · Website · Mobilna aplikacija · Dizajn · Branding · SEO i GEO · Društvene mreže
- `responseStyle` — select (način/stil odgovora)

**Gde ide lead:**
1. **Email preko SMTP-a** (nodemailer; Gmail SMTP, `CONTACT_EMAIL_TO`, fallback adresa je lična Gmail adresa). Reply-To = email pošiljaoca.
2. **Meta Conversions API** — server-side `Lead` event sa `eventId` (UUID), opciona vrednost `LEAD_VALUE_EUR`, uz IP/User-Agent/referer i `_fbp`/`_fbc` kolačiće.
3. **Meta Pixel u browseru** — `fbq('track','Lead')` sa **istim `eventID`** → Meta dedupe browser+server.

Nema CRM-a, nema baze — lead živi u inboxu. (Command center ima `leadInbound` tabele, ali sajt u njih **ne piše** direktno.)

**Obećanja na `/contact`:** „Odgovor u roku od 12 sati" · „Uvodni poziv od 30 minuta" · „Plan i tim u roku od 48 sati". Headline: „Pošaljite brief. Mi dovodimo tim."

---

## 6. Jezik, ton, vizuelni identitet

**Jezik:** dvojezično SR/EN, **srpski je default** (`DEFAULT_LOCALE = "sr"`, latinica). Prevod radi runtime DOM walker (`LanguageProvider` + `lib/i18n.ts`, `[en, sr]` parovi), a ne i18n rute. Sav copy usluga je pisan na srpskom; hero i sekcija disciplina su pisani na engleskom pa se prevode. Cookie `enigma-language`, 180 dana.

**Brand smernice** (`constants/brand-guidelines.ts`, javne na `/brand`):
- *Narativ:* „Enigma Digital postoji da ambicioznim timovima pomogne da složene ciljeve rasta pretvore u merljive product pobede… manje agencijskog ukrasa, više inženjerski oblikovanih ishoda."
- *Glas:* samouverena toplina, senior product ekspertiza + „join-the-trenches" mentalitet; jasno, bez žargona, tvrdnje potkrepljene rezultatima.
- *Boje:* cijan akcenti, duboke slate pozadine, bele površine. **Akcent je strateški, ne dekorativan.**
- *Tipografija:* Aeonik (light/regular/bold + italici) kao osnova; Deltha i Broken Console samo za hero i motion; Microgramma i terminal-grotesque takođe prisutni.
- *Motion:* svrhovit — hover lift, timeline reveal, suptilan parallax; uvek `prefers-reduced-motion`.
- *Case study struktura:* prvo ishodi, pa izazov → pristup → merljiv uticaj.
- *Voice checklist:* „Da li prikazuje merljiv napredak? Da li zvuči kao senior partner, ne kao dobavljač? Postoji li jasan sledeći korak?"

**Tokeni:** `--background` dark `#070d19`, light `#eee6d8`, plus treća „alt mood" tema (`#0a0f0a` sa zelenim akcentom `rgba(0,255,65,…)`). Akcent cijan `rgba(88,196,255,…)`. Postoje tema (light/dark), „mood" prekidač i language switcher.

**Tehnički vibe sajta:** Next.js 16 + React 19 + R3F/Three.js + GSAP + Lenis + Tailwind 4 + shadcn. 3D logo kocka, 3D discipline stage, 3D device scene za projekte, video showcase, dot-field pozadina, liquid-glass dugmad. Sajt sam po sebi je demo sposobnosti.

---

## 7. Analitika i merenje na sajtu

- **GA4** preko `@next/third-parties/google` (`NEXT_PUBLIC_GA_ID`), učitava se **tek posle „analytics" pristanka**.
- **Meta Pixel** (`next/script`, `afterInteractive`), učitava se **tek posle „marketing" pristanka**. Event: `PageView` na svim stranicama, `Lead` na uspešnoj kontakt formi.
- **Meta CAPI** (server): `Lead` iz server akcije, deljeni `eventId` sa Pixelom → dedupe. Opciona vrednost konverzije `LEAD_VALUE_EUR`, test kod za Events Manager.
- **Shortlink dedupe:** `digital.enigmait.rs/r/<slug>` redirektuje na sajt sa `?eid=<id>`; inline skripta u `<head>` uhvati `eid`, skloni ga iz URL-a i preda Pixelu kao `eventID` — isti event id koji je server već poslao. To spaja OpenReply DM klik sa PageView-om.
- **Cookie consent** sa granularnim kategorijama (`ConsentProvider`, `CONSENT_DEFAULT_SCRIPT`, stranica `/politika-kolacica`).
- **SEO:** JSON-LD `Organization`, `ContactPage`, `ItemList` (discipline i projekti), `FAQPage` po servisu (generisan iz istog objekta iz kog se renderuje vidljivi FAQ — parnost po konstrukciji).

---

# DEO B — `enigmadigital` (Enigma Command Center)

## 8. Šta je projekat

**Enigma Command Center** — interna marketinška kontrolna tabla za Enigma IT, kasnije namenjena i klijentima. Produkcija: **https://digital.enigmait.rs**.

Cilj: sve metrike i sve operacije nad kanalima na jednom ekranu, sa **sopstvenom bazom kao sistemom evidencije** — cron akcije povlače podatke iz svih API-ja u Convex, dashboard čita isključivo iz Convexa. Motiv: brzina, otpornost na ćudljive API-je i **istorija koju platforme brišu**.

Stack: Next.js 16 (App Router, React 19, TS) · **Convex 1.44** (baza + cron + auth + real-time) · Tailwind 4 (`@theme inline`, bez `tailwind.config`) · shadcn/ui (`base-nova`, `@base-ui/react`) · GSAP · Recharts/D3. Deploy: Vercel + `npx convex deploy` kroz build.

Multi-tenant od prvog dana: `workspaces` + `members` (`owner` | `client_viewer`), `workspaceId` na svakoj tabeli. Kredencijali AES-256-GCM enkriptovani u `connections`.

Jezik aplikacije: **srpski, latinica** (rute su srpske: `/leadovi`, `/atribucija`, `/objavi`, `/publike`, `/uvoz`, `/automatizacije`).

## 9. Ekrani (rute)

```
/                        Overview — sve integracije na jednom ekranu
/analytics               GA4 pregled
  /uzivo /sticanje /sadrzaj /posetioci /oglasi /retencija
/atribucija              UTM lanac: sadržaj → DM klik → sesija → konverzija
/instagram               pregled
  /publika /stories /inbox /komentari /objavi (nova objava) /objave/[mediaId]
/facebook                pregled  ·  /facebook/komentari
/threads                 pregled
/youtube                 pregled  ·  /youtube/automatizacije
/ads                     Meta/Google Ads  ·  /ads/publike  ·  /ads/nova-kampanja
/leadovi                 CRM lista  ·  /leadovi/[companyId]  ·  /leadovi/uvoz
/openreply               pregled  ·  /openreply/automatizacije
/rules                   pravila i zaštita budžeta
/settings                integracije (povezivanje naloga)
/login, /privacy, /cookies, /deletion-status
```

## 10. Integracije — šta je TAČNO implementirano po platformi

`connections.provider` (iz `convex/lib/providers.ts`):
`ga4` · `meta_ig` · `meta_fb` · `meta_ads` · `google_ads` · `youtube` · `openreply` · `threads` · `leads` · `google_business`

| Platforma | Čitanje metrika | Pisanje / akcije | Objavljivanje | Scheduling | DM |
|---|---|---|---|---|---|
| **GA4** | Da — dnevni agregat, saobraćaj po source/medium/campaign, realtime, kohorte, katalog metrika, kvota guard | ne | ne | — | — |
| **Instagram** (`meta_ig`) | Da — account daily, metrike, demografija, media stats + breakdowns, stories, mentions | **Da** — odgovor na komentar, sakrivanje, brisanje, bulk, uključivanje/isključivanje komentara, moderation log | **Da** — IMAGE / REEL / STORY / CAROUSEL | **Da** (cron 1 min) | **Da** — Inbox (konverzacije, poruke) + slanje kroz OpenReply motor |
| **Facebook Page** (`meta_fb`) | Da — page daily, objave | **Da** — odgovor na komentar, hide, delete, like komentara i objave, bulk | **ne** | — | Page messages (kroz OpenReply sloj) |
| **Threads** | Da — objave + insights, account daily/totals, klikovi po URL-u, snapshot pratilaca, demografija, odgovori, mentions, keyword search | **Da** — hide/unhide odgovora, odobravanje odgovora, automatizacije (reply / mention / keyword trigger) | **Da** — TEXT / IMAGE / VIDEO / CAROUSEL (do 20), anketa, quote, geo-gating, topic tag, spoiler, ghost post, cross-share na IG Story | **Da** (cron 1 min) | **Ne postoji** — Threads nema DM |
| **YouTube** | Da — dnevni totali, video stats, izvori saobraćaja, plejliste | **Da** — javan odgovor na komentar, moderacija, brisanje; izmena videa (naslov/opis/tagovi/kategorija), brisanje videa, titlovi (upload/zamena/brisanje), thumbnail | **Da** — resumable upload iz browsera; **ali svaki video ostaje PRIVATAN** dok projekat ne prođe Google audit | — (poll komentara na 15 min) | **Ne postoji** — YouTube je ugasio DM 2019. |
| **Meta Ads** | Da — hijerarhija account→campaign→adset→ad→creative, insights sa breakdown-ovima, hook/hold rate, video retention, quality rankings, CAPI eventi, publike | **Da** — pause/resume, promena budžeta, dupliranje; sve kroz audit log `adActions` | — | — | — |
| **Google Ads** | Da — kampanje, keyword quality, konverzione akcije, budžeti, search terms, geo/device/hourly/age/gender view, asset views | Delimično (`googleAdsWrite.ts`) | — | — | — |
| **OpenReply** | Da — kampanje, DM logovi, tracked linkovi i klikovi, konverzacije, inbound poruke, postbacks, profile menus | **Da** — motor za automatizacije: ključna reč u komentaru → DM, dugmad, brzi odgovori, follow gate, naknadna poruka | — | — | **Da — jezgro proizvoda** (IG + FB Page DM) |
| **Google Business** | Skelet — `gbAccessState` prati ishod poziva; pristup API-ju **još nije odobren** (profil mlađi od 60 dana) | planirano: odgovaranje na recenzije | van obima | — | — |

Sve integracije su **pull** (cron), sa upsertom po prirodnom ključu i lookback prozorom (GA4 3 dana, Meta Ads 7 dana zbog naknadne atribucije).

**Cron ritam (izvod iz `convex/crons.ts`):** GA4 6h · Instagram pun sync 6h + metrike/demografija dnevno + stories 30 min + „head check" 2 min · Facebook 6h · Threads dnevno + mentions 15 min · Meta Ads struktura 3h, „hot" insights **15 min**, svi insights 6h · Google Ads 3h · YouTube 6h + poll komentara 15 min · publish scheduler (IG i Threads) **svaki minut** · refresh tokena dnevno · pravila na 30 min · ingest inbound leadova 15 min.

## 11. Publishing / scheduling pipeline — format posta

Postoji, i to za **dve platforme: Instagram i Threads** (+ YouTube upload kao zaseban tok).

Tok je isti za obe: browser upload fajla u Convex storage → `createJob` → red u `igPublishJobs` / `threadsPublishJobs` → cron na 1 minut uzima ono što je dospelo → Meta preuzima bajtove sa javne rute `/ig-upload/<storageId>` odn. `/threads-upload/<storageId>` (autorizacija = postojanje reda u `*PublishFiles`) → container → publish → `published`.

Status mašina: `draft → queued → uploading → publishing → processing → published | failed | canceled`, sa `runToken` fence tokenom, `claimedAt` i `publishStartedAt` kao bravom protiv dvostruke objave. Fajlovi se brišu posle objave, sweep siročića na 24h.

**Šta job prima:**

*Instagram* — `kind`: IMAGE | REEL | STORY | CAROUSEL; `caption` (nikad za STORY); `shareToFeed` (samo REEL); `storageIds[]` + `mediaUrls[]` + `contentTypes[]` (redosled = redosled slajdova); `userTags[]` (username + x/y); `locationId`; `altText`; `audioName`; `trialGraduationStrategy`; `scheduledFor` (epoch ms, birač radi u Europe/Belgrade).

*Threads* — `mediaType`: TEXT | IMAGE | VIDEO | CAROUSEL (2–20); `text` (do 500 karaktera, meri se u UTF-8 bajtovima); `storageIds[]`/`mediaUrls[]`/`contentTypes[]`; `replyToId`; `replyControl` (everyone / accounts_you_follow / mentioned_only / parent_post_author_only / followers_only); `allowlistedCountryCodes[]` (geo-gating ISO 3166-1); `altText`; `linkAttachment` (samo text-only); `quotePostId`; `topicTag`; `isSpoilerMedia`; `isGhostPost`; `enableReplyApprovals`; `crossreshareToIg` (+ dark mode); `locationId`; `pollAttachment` (2–4 opcije, samo uz tekst); `scheduledFor`.

Threads nema nativno zakazivanje u API-ju — zakazivanje je rešeno u sistemu (cron + rate-limit guard). Facebook Page **nema** publishing.

## 12. Istraživački dokumenti — zaključci

### `lead-masina-istrazivanje.md` (LM1–LM13)

Kontekst: Enigma IT prodaje digitalne usluge; tržište Srbija; tim 3–4 osobe, svi vide leadove.

- **Dva toka:** *Inbound* (komentari, DM, mentions, klikovi na `/r/` linkove, forme — podaci već u bazi, pravno najčistije, vizuelno se izdvajaju kao topliji) i *Outbound* (isključivo **uvoz tabele** koju Jovan sam napravi).
- **Aplikacija NE skrejpuje ništa** — ista Meta aplikacija drži IG, FB, Threads i Marketing API i za Enigmu i za klijente; automatizovano prikupljanje bi rizikovalo ban koji gasi sve.
- **Model:** lead = firma (`leadCompanies`), u njoj ljudi (`leadPeople`), svaki kontakt zaseban red (`leadIdentities`), **poreklo po POLJU** (`leadFieldProvenance`) i svaki opažaj kao događaj (`leadSignals`). Sukobljene tvrdnje se čuvaju obe i prikazuju kao sukob.
- **Dedupe redosled:** PIB → CompanyWall URL → domen → normalizovan naziv + grad → telefon.
- **Ocenjivanje = dve ose, nikad jedan broj:** *Fit* (koliko liči na našeg kupca) × *Intent* (koliko je sada u tržištu), prikaz 2×2 matrica. **Ocena se ne čuva** — računa se pri čitanju, uz obavezno „zašto".
- **Najjači fit signal:** firma koristi third-party booking (Setmore, Dikidi) — već je odlučila da joj treba digitalno i plaća tuđe rešenje. Zatim: nema sajt, samo FB/IG, 100+ recenzija sa dobrom ocenom, novootvorena firma.
- **Realni test-set:** `Belgrade_Salon_Leads_100_companywall.xlsx` — 100 beogradskih frizerskih i kozmetičkih salona bez sajta. Pet zamki uvoza (duplirani sheetovi, zaglavlje u 2. redu, redovi-razdelnici „BATCH 1", rečenica u koloni telefon, četiri različite skale ocene u jednoj koloni).
- **Kanonski CSV format** za scraping definisan (19 kolona, nepoznato = prazna ćelija, ocena razložena na vrednost/skalu/broj recenzija/izvor).
- **Landing tracker = najjači signal:** prodajni tok je „pozovem salon → uradio sam vam besplatnu stranicu → pogledajte je danas". Ako svaka besplatna stranica ide iza praćenog `/r/` linka, dobija se „X je otvorio stranicu 3 puta, poslednji put pre 20 minuta" → to je čovek kog zoveš odmah.
- **Pravno (ZZPL/GDPR):** `lawfulBasis` i `sourceUrl` po identitetu, brisanje po OSOBI (ne samo po workspace-u), opt-out u svakoj poruci, obaveštavanje u roku od 30 dana kad podaci nisu uzeti od same osobe.
- **v1 ne šalje poruke iz sistema** — gradi se lista „ne diraj" i evidencija, slanje ostaje ručno dok tok ne bude dokazan.

### `google-business-istrazivanje.md`

- **GBP API ne služi za pronalaženje tuđih firmi** — radi samo nad profilima koje tvoj nalog poseduje. **Ne rešava lead mašinu.** Rešava nešto drugo: „Enigma vodi i Google profil klijenta" iz iste kontrolne table.
- Q&A API mrtav (03.11.2025), Business Calls mrtav (2023), v4 `reportInsights` mrtav, statistika po local postu mrtva. Recenzije i objave žive **samo** u starom v4.9.
- **Odluka o obimu (27.08.2026):** U obimu → recenzije (čitanje + odgovaranje), Performance API (8 od 12 metrika + mesečne ključne reči), nalog i lokacija (samo čitanje), Voice of Merchant status. Van obima → **Places API u celini** (služi samo lead generaciji preko Google-a — ne radi se), Pub/Sub notifikacije, Local Posts, Media API, Place Actions, izmena podataka lokacije, pozivnice, verifikacije.
- Metrike koje ulaze: impresije desktop/mobile × search/maps, `WEBSITE_CLICKS`, `CALL_CLICKS`, `BUSINESS_DIRECTION_REQUESTS`, `BUSINESS_CONVERSATIONS`.
- **Blokada:** Google profil Enigme **nije star 60 dana**, pa se pristup API-ju još ne može ni zatražiti; kvota stoji na 0 QPM.
- Pravilo integracije: **nula i nedostupnost ne smeju da izgledaju isto.**

### `threads-api-istrazivanje.md` (stanje 24.08.2026)

- **Moguće u punom obimu:** objavljivanje svega (tekst, slika, video, carousel do 20, anketa, GIF, quote, repost, odgovor, geo-gating, lokacija, topic tag, spoiler, ghost post, dugački prilog do 10.000 karaktera, cross-share na IG Story); čitanje sopstvenog sadržaja i niti; metrike po objavi i nalogu + demografija pratilaca; moderacija (hide, reply control, reply approvals, brisanje); webhooks; Threads kao placement za Meta oglase sa merenjem kroz Pixel i CAPI.
- **Nije moguće:** DM na Threads-u (ne postoji kao feature — OpenReply za Threads može samo javne odgovore); boost postojeće objave kao oglasa; Threads placement bez Instagram placementa; `impressions`/`reach`/`saves`/video metrike (postoji samo `views`, druga definicija); istorija pratilaca (`followers_count` je samo trenutno stanje); **nativno zakazivanje** (rešeno kod nas cronom); veza organskog Threads-a sa Ads nalogom.
- App Review nije potreban za sopstveni nalog; tri permisije su osakaćene i sa sopstvenim nalogom. Dokument nosi i dodatak sa **empirijski dokazanim imenima polja** (probe od 25.08.2026) — koja polja sigurno postoje, koja ne postoje i nikad ne smeju ući u `fields`.

## 13. Šta se iz svega ovoga vidi kao marketinška slika

1. **Dva lica.** Sajt govori jezikom senior product partnera za SaaS/scale-up timove („EMEA & North America", SLO, observability, dizajn sistemi). Stvarni portfolio i lead mašina su lokalne srpske uslužne firme (saloni, agencije, građevina). Poruka i tržište se razilaze.
2. **Dokaz umesto tvrdnji na projektima, tvrdnje bez dokaza na uslugama.** `/projects` namerno odbija da izmisli metriku; stranice usluga su pune brojki (`+40%`, `5x`, `99.9%`) koje nemaju izvor. To je nekonzistentno sa sopstvenim voice checklistom („da li prikazuje merljiv napredak").
3. **Nema About stranice, nema adrese, nema godina, nema tima, nema cena.** Za lokalnog kupca u Srbiji to su četiri najveće prepreke poverenju.
4. **Ozbiljna tehnička prednost koja se nigde ne prodaje.** Command center (Convex, 100+ tabela, 9 povezanih platformi, publishing i scheduling za IG i Threads, motor za komentare/DM, rules engine za zaštitu budžeta oglasa, CAPI, atribucija do konverzije) je proizvod koji većina agencija u regionu nema. Na sajtu se ne pominje nijednom.
5. **OpenReply + `/r/` shortlink + CAPI dedupe je gotov, merljiv akvizicioni kanal** — od komentara na IG-u, preko DM-a, do GA4 sesije i `Lead` eventa na sajtu, sa jednim `eventID`. To je priča koja se može prodati kao usluga („Društvene mreže" + „SEO/GEO" već postoje kao stranice, ali bez ovog dokaza).
6. **Lead mašina je disciplinovana i pravno svesna** (poreklo po polju, fit×intent bez jednog broja, lista „ne diraj", opt-out, brisanje po osobi) — to je diferencijator prema tipičnom „kupili smo bazu" pristupu.
