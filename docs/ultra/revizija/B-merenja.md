# B — Deterministički dokazi (detektor + pregledač + merenja) — revizija

> **Napomena za noćne runove (27. 10. 2026.):** ovo je revizija napravljena pre ULTRA runova. Putanje `ED/…` znače koren ovog repoa; `AUDIT/…` i snimci `nocni-run/ux/bx-*.jpg` nisu u repou. Brojevi su iz sintetičkih podataka razvojnog prikaza (`?ux=1`). Valuta: pravi nalozi za oglase rade u evrima (odluka O16 u `docs/ULTRA-PLAN.md`); tvrdnje o nalogu „u dinarima“ potiču iz probnih podataka. Odluke, obim i redosled važe iz `docs/ULTRA-PLAN.md`, a ne iz pitanja i preporuka u ovom izveštaju.


Recenzent **B** (impeccable *critique*, „Assessment B: Detector + Browser Evidence"), 2026-10-27. Rađeno nezavisno; A-izveštaji nisu čitani. Ovo su **brojevi, ne utisci** — presude „stvarno / lažno" su date posle otvaranja koda za uzorak svakog pravila.

## 0. Obim i metod

- **Kod:** `ED/components/app` + `ED/app` (359 fajlova koje detektor skenira). ED je samo čitan.
- **Aplikacija:** `http://localhost:3105` sa `?ux=1` (sintetički podaci razvojnog prikaza; „Test Salon N" nije nalaz). Server nisam pokretao ni gasio.
- **Pregledač:** bezglavi Chromium (Playwright), DPR 1, tamna šema, `reducedMotion: reduce`, `locale sr-RS` — isto kao `scripts/ux-snapshots.mjs`. Na 390×844: `isMobile + hasTouch`; **izmereno da `(pointer: coarse)` i `(hover: none)` važe**, pa su pravila `.touch-target` aktivna i brojevi odgovaraju pravom telefonu.
- **Ekrani:** spisak B-faze iz `ED/scripts/ux-snapshots.mjs` (putanja, `prazno`, `klik`) — 62 stavke, 116 merenja (60 na 1536, 56 na 390). Dva merenja `podesavanja-napredak` (klik) završila su na strani prijave i zamenjena su direktnom adresom (§8). Obični ekrani na oba prikaza (i podekrani koje snimak radi samo na 1536); stanja posle klika/ljuske na prikazu koji snimak predviđa. **Preskočeno:** `sistem` i `napredak-nov-nivo` (oba na `/sistem` — živi vodič dizajn sistema, samo za razvoj, nije Jovanov ekran) i `prijava` (`/login`, van projekta).
- **Postupak po ekranu:** `goto` (networkidle) → `main` → sakrij `nextjs-portal` → 1,5 s → klikovi iz spiska → prođi celu stranu skrolom (ScrollTrigger otkrivanja) → vrh → 0,6 s → merenja na `scrollY = 0` → axe-core.
- **Definicije:**
  - *Interaktivno* = `a[href], button, input (ne hidden), select, textarea, [role=button|tab|link|menuitem*|option|switch|checkbox|radio], [tabindex]≠-1`, vidljivo (`checkVisibility` sa providnošću, ≥2×2 px, nije `sr-only` po `clip-path: inset(50%)`, nije u `[inert]`/`[aria-hidden=true]`).
  - *Mala meta* = omogućena i vidljiva, širina **ili** visina < 44 px (390) / < 24 px (1536); linkovi u rečenici odvojeno („i"). Na 1536 dodatno: koliko pada i uz **izuzetak razmaka WCAG 2.5.8** (krug 24 px oko centra ne seče drugu metu).
  - *Tekst < 12 px* = vidljivi tekstualni čvorovi; za SVG se veličina množi razmerom `getScreenCTM()`.
  - *Boje* = računate `color` (tekst) i `background-color` (sve vidljive kutije, alfa > 0), normalizovane kroz canvas u RGBA; broje se različite.
  - *Primary iznad preloma* = vidljivi `[data-variant="primary"]` u prvom ekranu. Iz `components/ui/button.tsx`: `primary` = `bg-mod-strong text-text-inverse` (+ `shadow-mod` na hover); `default` = `bg-primary text-primary-foreground`, a unutar modula je `--primary` = strong, pa „default" izgleda isto kao primary. *Puni CTA* = interaktivni element sa neprozirnom zasićenom podlogom i tamnim tekstom (hvata i `variant="default"` i `buttonVariants` na linkovima). Napomena: `data-variant="default"` sam po sebi nije pouzdan znak (birač perioda 7 d / 28 d / 90 d nosi `default`, a izgleda neutralno).
  - *Izbora iznad preloma* = vidljivi interaktivni elementi u prvom ekranu (main / ljuska).
- **axe-core 4.14.0** (instaliran u `AUDIT/b-tools`, ubrizgan `addScriptTag({path})`), oznake `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` (2.1/2.2 obeleženi u tabeli), samo prekršaji; „nepotpuno" prijavljeno odvojeno.

## 1. CLI detektor — `detect.mjs --json`

Komanda (cwd `AUDIT/b-tools`, pa se konfiguracija iz cwd ne primenjuje; `ED/DESIGN.md` i `ED/.impeccable/design.json` detektor učitava sam po meti):
`node IMP/scripts/detect.mjs --json ED/components/app ED/app` → izlaz **2** (ima nalaza), 1,6 s, skenirano 359 fajlova (315 `.tsx`, 43 `.ts`, 1 `.css` = `app/globals.css`). Veličina nije bila problem, pa nije deljeno po modulima. Sirovi izlaz: `AUDIT/b-tools/detect-cli.json`; sve lokacije po fajlu: `AUDIT/b-tools/cli-locations.md`.

**100 nalaza, samo 3 pravila** (nijedan nema `advisory: true`; `design-system-font-size` nosi `severity: advisory`, ali ulazi u izlazni kod).

| pravilo | nalaza | fajlova | najgore lokacije | presuda |
|---|---|---|---|---|
| `design-system-font-size` | **88** (52× 11 px, 35× 10 px, 1× 9 px) | 28 | `settings/ga4-configuration.tsx` 16 (216, 281–327, 411, 430, 468, 520, 571, 604) · `instagram/instagram-stories.tsx` 11 (213–390) · `leadovi/import-review-table.tsx` 9 (218–272, 1291–1328) · `analytics/ads-timeseries-chart.tsx` 5 · `instagram/inbox/chat-view.tsx` 5 · `ads/create-lookalike-audience-dialog.tsx` 4 · `instagram/inbox/conversation-list.tsx` 4 · `settings/connections-settings.tsx` 4 | **stvarno** — 0 lažnih u uzorku 41/88 |
| `side-tab` | **10** | 3 | `leadovi/leads-table.tsx` 804, 900, 922, 960, 1196, 1238 · `leadovi/import-review-table.tsx` 1247, 1275, 1358 · `leadovi/work-card.tsx` 229 | 2 lažna, 7 namernih semantičkih ivica, 1 pravi „tell" |
| `bounce-easing` | **2** | 1 | `app/globals.css` 279 (`--ease-momentum` 0.34,1.42,0.64,1), 292 (`--ease-reward` 0.34,1.56,0.64,1) | namerno i ograničeno; nizak prioritet |

Po modulu (`design-system-font-size`): instagram 29 · settings 21 · analytics 15 · leadovi 10 · ads 8 · ljuska 5 (`app-sidebar.tsx` 64, 369 · `mobile-nav.tsx` 212 · `mobile-tab.ts` 14 · `notifications-bell.tsx` 97).

### 1.1 Presuda po pravilu (otvoren kod za uzorak svakog pravila)

- **`design-system-font-size` — stvarno.** Svih 41 proverenih su doslovne klase `text-[11px]` / `text-[10px]` / `text-[9px]`. DESIGN.md: najmanji korak je Label/meta 12 px, „**Pravilo skale.** Ništa nije 11, 14, 16, 18 ni 24 px"; `globals.css` (komentar iznad `@theme`) tvrdi „Ništa u aplikaciji više nije 11 … px" — **netačno**: 88 doslovnih klasa to zaobilazi (`text-micro` je 12 px, pa nije krivac). Isti bedž broja `h-4 min-w-4 px-1 text-[10px]` je kopiran na **5 mesta** (`notifications-bell.tsx:97`, `mobile-tab.ts:14`, `mobile-nav.tsx:212`, `app-sidebar.tsx:64` i `:369`). U Podešavanjima (`ga4-configuration.tsx`) 10 px mono nosi sirova imena API vrednosti — `(GOOGLE_ANALYTICS_STANDARD)`, `(ONCE_PER_EVENT)`, `(ONCE_PER_SESSION)` (pregledač ih vidi, §2).
- **`side-tab` — mešovito.** `leads-table.tsx:1196` (zaglavlje) i `:1238` (skeleton) su `border-l-4 border-l-transparent` = poravnanje → **lažno**. `leads-table.tsx:804/900/922/960` i `import-review-table.tsx:1247/1275/1358` su ivice hitnosti/temperature/statusa reda (`rowEdge`: overdue → danger, meeting → warning, hot/warm/cold) — **semantika, ne ukras**, ali i dalje krše DESIGN.md „Ivica je uvek 1 px" i nose 5 stanja samo bojom (provera „Pravila dva nosioca" je posao za A). `work-card.tsx:229` — `<article class="rounded-xl border border-l-4 …">` je **tačno onaj „tell"** (zaobljena kartica + debela leva traka); pregledač ga nalazi 12× na Leadovi/Danas (§2).
- **`bounce-easing` — namerno.** `--ease-momentum` koristi samo `instagram/carousel-swiper.tsx:197` (posle bacanja), `EASE_REWARD` samo `system/reward-toast.tsx:127`, `level-up-banner.tsx:122`, `mission-card.tsx:83`. Dokumentovano u `globals.css` i `lib/motion.ts`. Nije lažno po pravilu, ali je svesna odluka; `mission-card` je na Kontrolnoj tabli, pa se prebačaj vidi pri svakom završetku misije.

### 1.2 Slepe tačke CLI-ja i dodatne determinističke provere

- **Promaklo detektoru:** 14× `fontSize: 11` u `tick` svojstvu Recharts osa u 6 fajlova (`timeline-chart.tsx:197/208/286/298`, `analytics/device-chart.tsx:88/95`, `ads/hourly-chart.tsx:92/98`, `instagram/follows-chart.tsx:103/112`, `instagram/breakdown-chart.tsx:111/122`, `threads/threads-follows-chart.tsx:130/139`). Regex vidi samo klase; merenje u pregledaču potvrđuje 11 px `<tspan>` na osama (Kontrolna tabla, Facebook, Instagram…). Ukupno ispod 12 px u izvoru: **≥ 102 mesta**.
- **Tokeni boja — čisto:** 0 heks literala u `components/app` i `app` (`.tsx`, van `dev-ux`); sirove Tailwind boje (`slate-*`, `cyan-*`…) samo u `app/deletion-status/page.tsx` (12, javna strana van projekta). „Pravilo tokena" se poštuje.
- **Dugmad vs dodirne mete (uzrok §7-1):** 536 upotreba `<Button`; `size="sm"` (28 px) 409×, `size="xs"` (24 px) 65×, `icon-xs` 11×, `icon-sm` 18×. `.touch-target` (min 44 px pod `pointer: coarse`) se pojavljuje 84× u 28 fajlova i **nije deo `buttonVariants`** (`components/ui/button.tsx`), pa većina dugmadi na telefonu ostaje 24–32 px.
- **Debele ivice:** `border-l-[2-9]` 13× u komponentama (DESIGN.md: „Ivica je uvek 1 px").

## 2. Ubrizgavanje detektora u pregledač

**Tok (sve uspelo, ništa preskočeno):**
1. Aplikacija: `http://localhost:3105` (200; 3106 nije odgovarao, koordinator potvrdio 3105). Bezglavi Chromium (Playwright), 1536×695, DPR 1, tamna šema, `reducedMotion: reduce`, `sr-RS`.
2. **Preflight mutacije:** postavljen `document.title` i dodat `<script>` (inline, upisuje `window.__impPreflight`) → **OK na 5/5** strana (odgovori nemaju CSP zaglavlje).
3. **Live server:** `node IMP/scripts/live-server.mjs --background` pokrenut sa cwd `AUDIT/b-tools` (njegovo stanje `.impeccable/live/server.json` ostaje u AUDIT, ne u ED) → `{"pid":6646,"port":8400}`; `/detect.js` 200 (390 381 B), `/health` ok. **Način gašenja:** `node IMP/scripts/live-server.mjs stop --keep-inject` iz `AUDIT/b-tools` (`--keep-inject` da `live-inject.mjs` ne dira nijedan HTML ulaz) → „Stopped live server on port 8400", port zatvoren, proces nestao.
4. Na svakoj strani: skrol na vrh → `page.addScriptTag({url:"http://localhost:8400/detect.js"})` → 3 s → konzolne poruke detektora + strukturisani `window.impeccableDetect()`; snimci sa slojem: `AUDIT/shots/B/inject-<ekran>-1536.jpg`.
5. Ograda: moj drugi, strukturisani poziv je išao posle iscrtanog sloja, pa je dao lažne `text-occlusion` pogotke na sopstvenim „✦" natpisima detektora (1/1/0/4/6) — izbačeni. **Merodavni su brojevi iz konzole** (auto-sken pre sloja). Sirovo: `AUDIT/b-tools/inject-results.json`.

**Nalazi iz konzole (`[impeccable] N anti-patterns found`):**

| strana | ukupno | ai-color-palette | nested-cards | side-tab | cramped-padding | undersized-ui-text | line-length | tiny-text | radial-spotlight-glow | first-viewport-column-overflow | dark-glow |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 38 | 28 | 6 | – | 1 | 2 | – | – | 1 | 1 | – |
| `/leadovi` | 39 | 14 | – | 12 | 9 | 2 | 1 | – | 1 | 1 | – |
| `/instagram` | 19 | 14 | 1 | – | – | 2 | – | – | 1 | – | 1 |
| `/analytics` | 91 | 88 | 1 | – | – | 2 | – | – | 1 | 1 | – |
| `/settings` | 68 | 18 | 27 | – | 4 | 6 | 9 | 4 | – | 1 | – |
| **ukupno** | **255** | 162 | 35 | 12 | 14 | 14 | 10 | 4 | 4 | 4 | 1 |

**Presuda po pravilu:**
- `ai-color-palette` (162) — pali na ljubičastu/cijan/fuksiju modula (Analitika `#c797fd`, Atribucija, OpenReply, Pravila) u bočnoj traci na svakoj strani i na celoj Analitici (88, jer je modul ljubičast); broji `svg` **i svaki `path`** posebno → naduvano. Po dizajnu (boja = mesto), dakle **nije greška za popravku**, ali je činjenica: paleta „neon na teget" je ono što detektor prepoznaje kao generički tamni dashboard — ulaz za A-ovu presudu specifičnosti.
- `nested-cards` (35) — **Podešavanja 27 su stvarni**: svaka integraciona sekcija (`#integracija-ga4`, `-meta_ig`, `-meta_fb`, `-threads`, `-meta_ads`, `-google_ads`, `-youtube`) je `rounded-xl` kartica sa uokvirenim `rounded-lg` kutijama i tabelama unutra (DESIGN.md: „nema kutije u kutiji", „Sekundarne grupe se odvajaju razdelnikom i razmakom, ne kutijom"). Kontrolna tabla 6 = 5 verovatno stvarnih (tri kartice misija `group/card` na y≈283 i dva bloka u donjem delu, y≈1592 i 1729) + 1 lažni. Pogodak u gornjoj traci (985,11; 154×34) na `/`, `/instagram` i `/analytics` je segmentni birač 7 d / 28 d / 90 d → **lažno** (3×). Stvarnih ukupno ≈ 32.
- `side-tab` (12) — kartice „Upiti sa sajta" / „Zovi sada" (`WorkCard` iz `work-card.tsx:229`, koji koriste i `overdue-panel`, `meetings-panel`, `gaps-panel`) sa 4 px obojenom levom ivicom i radijusom 14 px → **stvarno** (i protiv „Ivica je uvek 1 px").
- `cramped-padding` (14) — čipovi (`system/chip.tsx`: `h-6`/`h-7`, `items-center`, `leading-none`), npr. „+190 XP danas", i link-dugme `h-8` → **lažno** (fiksna visina centrira sadržaj); omotači tabela `overflow-x-auto rounded-lg` → **lažno** (uobičajeno).
- `undersized-ui-text` (14) — bedž „10" na zvonu (10 px) na **svakoj** strani + skrivena kopija u donjoj traci → **stvarno**; GA4 `(GOOGLE_ANALYTICS_STANDARD)` / `(ONCE_PER_EVENT)` u 10 px mono → **stvarno** (i sirov API žargon).
- `tiny-text` (4, Podešavanja) — 10–11 px telo teksta u GA4/Threads/YouTube integracijama (`p.font-mono.text-[11px]`, `span.text-[10px]`) → **stvarno**.
- `line-length` (10) — Leadovi `p.min-w-56.flex-1` ~157 znakova/red; Podešavanja do ~197 znakova/red (`p.text-xs.leading-relaxed` širok 1182 px) → **stvarno** (čitljivost).
- `radial-spotlight-glow` (4) — `.aurora-top` (boja modula 10 %) → **lažno u odnosu na projekat** (DESIGN.md dozvoljava auroru ≤ 10 %).
- `first-viewport-column-overflow` (4) — kolona sadržaja je 191–668 % visine ekrana naspram bočne trake → nije greška rasporeda, nego signal **dužine strane** (Podešavanja 6,7 ekrana).
- `dark-glow` (1) — Instagram fokus kartica (gradijent + obojena senka) → dozvoljeno („fokus kartica") → po dizajnu.

## 3. Merenja — 1536×695 (Jovanov ekran) — 60 ekrana

| ekran | visina px (× ekrana) | interakt. vidljivih | male mete <24 (pada i uz razmak) | tekst <12px (čvorova) | veličine fonta | boje teksta / pozadine | primary iznad preloma (filled) | izbora iznad preloma (main/ljuska) | h1 vid/DOM · h2 | preliv | greške konz. | axe pravila/čvorova |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kontrolna-tabla | 2006 (2.89) | 47 | 7 (0) | 21 | 10/11/12/13/15/20/28 | 13 / 30 | 1 (1) | 29 (6/23) | 1/1 · 5 | — | 0 | 2/13 |
| leadovi | 1412 (2.03) | 77 | 13 (0) | 2 | 10/12/13/15/20 | 14 / 27 | 1 (1) | 47 (28/19) | 0/1 · 6 | — | 0 | 1/4 |
| leadovi-tabela | 2659 (3.83) | 217 | 50 (0) | 2 | 10/12/13/15 | 20 / 44 | 1 (1) | 70 (51/19) | 0/1 · 0 | — | 0 | 3/61 |
| leadovi-zaostali | 695 (1) | 37 | 3 (0) | 2 | 10/12/13/15/20 | 11 / 25 | 0 (0) | 37 (18/19) | 0/1 · 1 | — | 0 | 1/4 |
| leadovi-rupe | 695 (1) | 45 | 6 (0) | 2 | 10/12/13/15/20/28 | 12 / 28 | 0 (0) | 45 (26/19) | 0/1 · 1 | — | 0 | 1/4 |
| leadovi-sastanci | 695 (1) | 38 | 3 (0) | 2 | 10/12/13/15/20 | 12 / 27 | 0 (0) | 38 (19/19) | 0/1 · 2 | — | 0 | 1/4 |
| leadovi-mapa | 984 (1.42) | 53 | 2+2i (0) | 2 | 10/12/13 | 10 / 30 | 0 (0) | 51 (32/19) | 0/1 · 0 | — | 0 | 2/15 |
| uvoz | 789 (1.14) | 32 | 2 (0) | 2 | 10/12/13/20 | 9 / 21 | 1 (1) | 32 (12/20) | 1/1 · 2 | — | 0 | 1/4 |
| uvoz-pregled | 6203 (8.93) | 233 | 18 (0) | 58 | 10/11/12/13/15/20 | 17 / 32 | 1 (1) | 27 (7/20) | 1/1 · 1 | — | 0 | 3/74 |
| uvoz-istorija | 1287 (1.85) | 59 | 6 (0) | 2 | 10/12/13/20 | 12 / 26 | 1 (1) | 34 (14/20) | 1/1 · 2 | — | 0 | 2/13 |
| instagram | 861 (1.24) | 33 | 0 (0) | 21 | 10/11/12/13/20/28/40 | 9 / 21 | 1 (1) | 33 (4/29) | 1/1 · 0 | — | 0 | 1/7 |
| openreply | 1235 (1.78) | 35 | 7 (0) | 23 | 10/11/12/13/15/20/28 | 11 / 25 | 1 (1) | 27 (2/25) | 1/1 · 0 | — | 0 | 1/7 |
| novosti | 695 (1) | 29 | 1 (0) | 2 | 10/12/13/15/20 | 9 / 25 | 1 (1) | 29 (10/19) | 1/1 · 3 | — | 0 | 1/4 |
| novosti-prazno | 695 (1) | 21 | 1 (0) | 2 | 10/12/13/20 | 7 / 19 | 1 (1) | 21 (2/19) | 1/1 · 0 | — | 0 | 1/4 |
| analitika | 1649 (2.37) | 44 | 4 (0) | 17 | 10/11/12/13/20/40 | 10 / 23 | 1 (1) | 40 (10/30) | 1/1 · 0 | — | 0 | 1/7 |
| atribucija | 1308 (1.88) | 31 | 7 (0) | 2 | 10/12/13/15/20/28 | 10 / 24 | 1 (1) | 25 (2/23) | 1/1 · 0 | — | 0 | 2/8 |
| facebook | 3134 (4.51) | 56 | 7 (0) | 23 | 10/11/12/13/15/20/28/40 | 12 / 29 | 1 (1) | 27 (2/25) | 1/1 · 2 | — | 0 | 1/7 |
| threads | 3848 (5.54) | 48 | 13 (0) | 26 | 10/11/12/13/15/20/28/40 | 13 / 26 | 1 (0) | 31 (8/23) | 1/1 · 7 | — | 0 | 1/7 |
| youtube | 3439 (4.95) | 63 | 9+2i (0) | 23 | 10/11/12/13/15/20/28/40 | 13 / 38 | 1 (1) | 27 (2/25) | 1/1 · 3 | — | 0 | 1/7 |
| oglasi | 1259 (1.81) | 52 | 7 (0) | 21 | 10/11/12/13/20/28/40 | 13 / 29 | 1 (1) | 32 (7/25) | 1/1 · 0 | — | 0 | 4/25 |
| leadovi-profil | 1436 (2.07) | 35 | 2 (0) | 2 | 10/12/13/15/28 | 10 / 27 | 1 (1) | 35 (16/19) | 1/1 · 1 | — | 0 | 2/7 |
| pravila | 695 (1) | 29 | 2 (0) | 2 | 10/12/13/15/20 | 10 / 28 | 1 (1) | 29 (10/19) | 1/1 · 0 | — | 0 | 1/4 |
| podesavanja | 4729 (6.8) | 55 | 3+1i (0) | 38 | 10/11/12/13/15/20/40 | 12 / 32 | 1 (0) | 34 (15/19) | 1/1 · 12 | — | 0 | 2/12 |
| ljuska-sina ᴸ | 901 (1.3) | 33 | 1 (0) | 22 | 10/11/12/13/20/28/40 | 9 / 21 | 1 (1) | 33 (4/29) | 1/1 · 0 | — | 0 | 1/6 |
| ljuska-paleta ᴸ | 1412 (2.03) | 38 | 0 (0) | 2 | 10/12/13/15/20 | 14 / 29 | 0 (0) | 14 (0/14) | 0/1 · 6 | — | 0 | 0/0 |
| ljuska-meni ᴸ | 1412 (2.03) | 80 | 13 (0) | 2 | 10/12/13/15/20 | 16 / 27 | 1 (1) | 50 (28/22) | 0/1 · 6 | — | 0 | 1/4 |
| napredak | 1206 (1.74) | 22 | 2 (0) | 2 | 10/12/13/15/20/40 | 12 / 28 | 1 (1) | 22 (2/20) | 1/1 · 6 | — | 0 | 1/4 |
| napredak-prazno | 1085 (1.56) | 21 | 2 (0) | 2 | 10/12/13/15/20/40 | 10 / 24 | 0 (0) | 21 (1/20) | 1/1 · 6 | — | 0 | 1/4 |
| napredak-paleta ᴸ | 1206 (1.74) | 38 | 0 (0) | 2 | 10/12/13/15/20/40 | 13 / 30 | 0 (0) | 14 (0/14) | 1/1 · 6 | — | 0 | 0/0 |
| napredak-pad | 695 (1) | 21 | 2 (0) | 2 | 10/12/13/20 | 9 / 19 | 0 (0) | 21 (1/20) | 1/1 · 0 | — | 1* | 1/4 |
| ljuska-pad-napretka ᴸ | 1396 (2.01) | 77 | 13 (0) | 2 | 10/12/13/15/20 | 13 / 26 | 1 (1) | 47 (28/19) | 0/1 · 6 | — | 1* | 1/4 |
| leadovi-poziv | 695 (1) | 29 | 2 (0) | 2 | 10/12/13/15/20/28 | 11 / 24 | 1 (1) | 29 (10/19) | 0/1 · 1 | — | 0 | 1/4 |
| leadovi-poziv-tok | 695 (1) | 33 | 4 (0) | 2 | 10/12/13/15/20/28 | 12 / 26 | 1 (1) | 33 (14/19) | 0/1 · 1 | — | 0 | 1/4 |
| kontrolna-tabla-prazno | 1888 (2.72) | 44 | 12 (0) | 2 | 10/12/13/15/20/28 | 14 / 26 | 1 (1) | 33 (10/23) | 1/1 · 5 | — | 0 | 2/12 |
| leadovi-tabela-kolone | 2659 (3.83) | 217 | 50 (0) | 2 | 10/12/13/15 | 20 / 44 | 1 (1) | 70 (51/19) | 0/1 · 0 | — | 0 | 3/61 |
| leadovi-profil-radnje | 1436 (2.07) | 40 | 2 (0) | 2 | 10/12/13/15/28 | 10 / 27 | 1 (1) | 40 (16/24) | 1/1 · 1 | — | 0 | 2/7 |
| uvoz-nereseno | 3373 (4.85) | 75 | 3 (0) | 43 | 10/11/12/13/15/20 | 17 / 32 | 1 (1) | 27 (7/20) | 1/1 · 1 | — | 0 | 2/21 |
| leadovi-mapa-panel | 984 (1.42) | 70 | 7+2i (5) | 2 | 10/12/13/15 | 11 / 35 | 0 (0) | 58 (39/19) | 0/1 · 0 | — | 0 | 2/15 |
| instagram-prazno | 695 (1) | 30 | 0 (0) | 2 | 10/12/13/20 | 10 / 20 | 1 (1) | 30 (1/29) | 1/1 · 0 | — | 0 | 1/7 |
| analitika-prazno | 695 (1) | 31 | 0 (0) | 2 | 10/12/13/20 | 9 / 20 | 1 (1) | 31 (1/30) | 1/1 · 0 | — | 0 | 1/7 |
| facebook-prazno | 695 (1) | 26 | 0 (0) | 2 | 10/12/13/20 | 9 / 20 | 1 (1) | 26 (1/25) | 1/1 · 0 | — | 0 | 1/7 |
| threads-prazno | 695 (1) | 24 | 0 (0) | 2 | 10/12/13/20 | 10 / 20 | 1 (0) | 24 (1/23) | 1/1 · 0 | — | 0 | 1/7 |
| youtube-prazno | 913 (1.31) | 28 | 0+2i (0) | 2 | 10/12/13/15/20 | 9 / 21 | 1 (1) | 26 (1/25) | 1/1 · 1 | — | 0 | 1/7 |
| oglasi-prazno | 695 (1) | 27 | 1 (0) | 2 | 10/12/13/20 | 9 / 20 | 1 (1) | 27 (2/25) | 1/1 · 0 | — | 0 | 1/7 |
| instagram-komentari | 751 (1.08) | 33 | 2 (0) | 2 | 10/12/13/20 | 10 / 21 | 0 (0) | 33 (7/26) | 1/1 · 0 | — | 0 | 1/4 |
| facebook-komentari | 695 (1) | 47 | 9 (0) | 2 | 10/12/13/20 | 10 / 21 | 0 (0) | 47 (25/22) | 1/1 · 0 | — | 0 | 1/4 |
| youtube-automatizacije | 1077 (1.55) | 37 | 2+2i (0) | 2 | 10/12/13/20 | 11 / 23 | 1 (1) | 32 (10/22) | 1/1 · 0 | — | 0 | 2/8 |
| oglasi-nova-kampanja | 876 (1.26) | 40 | 2 (0) | 2 | 10/12/13/20 | 9 / 22 | 0 (0) | 31 (9/22) | 1/1 · 2 | — | 0 | 2/5 |
| oglasi-publike | 1038 (1.49) | 32 | 1 (0) | 9 | 10/11/12/13/15/20/28 | 12 / 25 | 1 (1) | 32 (10/22) | 1/1 · 0 | — | 0 | 2/7 |
| analitika-sticanje | 2161 (3.11) | 37 | 5 (0) | 2 | 10/12/13/20/28 | 10 / 29 | 0 (0) | 31 (0/31) | 1/1 · 0 | — | 0 | 1/7 |
| analitika-oglasi | 1297 (1.87) | 40 | 8 (0) | 7 | 10/11/12/13/13.5/20/28 | 10 / 27 | 0 (0) | 31 (0/31) | 1/1 · 0 | — | 0 | 1/7 |
| analitika-sadrzaj | 2786 (4.01) | 45 | 15 (0) | 13 | 10/12/13/20/28 | 10 / 26 | 0 (0) | 36 (5/31) | 1/1 · 0 | — | 0 | 1/7 |
| analitika-posetioci | 2095 (3.01) | 38 | 5 (0) | 38 | 10/11/12/13/15/20/28 | 10 / 53 | 0 (0) | 32 (1/31) | 1/1 · 0 | — | 0 | 1/7 |
| analitika-uzivo | 1019 (1.47) | 28 | 1 (0) | 8 | 10/12/13/20/56 | 11 / 26 | 0 (0) | 28 (1/27) | 1/1 · 0 | — | 0 | 1/4 |
| analitika-retencija | 1494 (2.15) | 27 | 1 (0) | 52 | 10/11/12/13/15/20/28 | 11 / 52 | 0 (0) | 27 (0/27) | 1/1 · 0 | — | 0 | 1/4 |
| openreply-automatizacije | 718 (1.03) | 26 | 1 (0) | 2 | 10/12/13/20 | 11 / 21 | 1 (1) | 26 (4/22) | 1/1 · 0 | — | 0 | 1/4 |
| pravila-istorija | 695 (1) | 23 | 0 (0) | 2 | 10/12/13/15/20 | 9 / 24 | 1 (1) | 23 (4/19) | 1/1 · 0 | — | 0 | 1/4 |
| openreply-prazno | 695 (1) | 26 | 0 (0) | 2 | 10/12/13/15/20/28 | 9 / 20 | 1 (1) | 26 (1/25) | 1/1 · 0 | — | 0 | 1/7 |
| threads-objavi | 1888 (2.72) | 47 | 6 (0) | 3 | 10/11/12/13/20 | 13 / 26 | 0 (0) | 34 (11/23) | 1/1 · 0 | — | 0 | 1/7 |
| podesavanja-napredak-direkt | 695 (1) | 33 | 2 (0) | 2 | 10/12/13/20 | 8 / 22 | 1 (0) | 33 (14/19) | 1/1 · 0 | — | 0 | 1/4 |

Medijana visine: 1085 px (1.56 ekrana); najviše: uvoz-pregled 6203, podesavanja 4729, threads 3848, youtube 3439, uvoz-nereseno 3373.
Male mete ukupno: 347 (medijana 2 po ekranu); padaju i uz izuzetak razmaka: 5.
Tekst <12px: 548 čvorova na 60/60 ekrana.
Ekrana bez primarnog iznad preloma: 19; sa 2+ primarna: nijedan; sa 2+ „punih" CTA: nijedan.
Izbora iznad preloma: medijana 31 (main 7); najviše: leadovi-tabela 70, leadovi-tabela-kolone 70, leadovi-mapa-panel 58, leadovi-mapa 51, ljuska-meni 50.
Vidljivih h1 ≠ 1: leadovi (0/1), leadovi-tabela (0/1), leadovi-zaostali (0/1), leadovi-rupe (0/1), leadovi-sastanci (0/1), leadovi-mapa (0/1), ljuska-paleta (0/1), ljuska-meni (0/1), ljuska-pad-napretka (0/1), leadovi-poziv (0/1), leadovi-poziv-tok (0/1), leadovi-tabela-kolone (0/1), leadovi-mapa-panel (0/1).
Vodoravni preliv dokumenta: nijedan; elemenata koji probijaju ivicu bez preliva: nijedan.
Greške u konzoli: napredak-pad (1, očekivano), ljuska-pad-napretka (1, očekivano).
Fiksni hrom iznad preloma (gore/dole px): 56/0, 96/0, 0/0.

Legenda: ᴸ = stanje ljuske/preklopa; „male mete" = broj (+i = linkovi u rečenici); na 1536 u zagradi koliko pada i uz izuzetak razmaka WCAG 2.5.8; „primary iznad preloma (filled)" = `[data-variant=primary]` u prvom ekranu (u zagradi računato „puno" CTA dugme); „izbora iznad preloma" = svi vidljivi interaktivni elementi u prvom ekranu (main/ljuska); h1 vid/DOM · broj vidljivih h2; preliv = vodoravni preliv dokumenta; greške = konzola (* = očekivano); axe = pravila/čvorova.

## 4. Merenja — 390×844 (telefon) — 56 ekrana

| ekran | visina px (× ekrana) | interakt. vidljivih | male mete <44 | tekst <12px (čvorova) | veličine fonta | boje teksta / pozadine | primary iznad preloma (filled) | izbora iznad preloma (main/ljuska) | h1 vid/DOM · h2 | preliv | greške konz. | axe pravila/čvorova |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kontrolna-tabla | 3598 (4.26) | 35 | 15 | 11 | 10/11/12/13/15/20/28 | 13 / 23 | 1 (1) | 14 (3/11) | 1/1 · 5 | — | 0 | 2/8 |
| leadovi | 3291 (3.9) | 65 | 34 | 2 | 10/12/13/15/20 | 13 / 15 | 1 (1) | 21 (14/7) | 0/1 · 6 | — | 0 | 1/2 |
| leadovi-tabela | 5941 (7.04) | 237 | 223 | 2 | 10/12/13/15 | 19 / 24 | 0 (0) | 33 (26/7) | 0/1 · 0 | — | 0 | 2/79 |
| leadovi-zaostali | 914 (1.08) | 25 | 11 | 2 | 10/12/13/15/20 | 9 / 12 | 0 (0) | 22 (15/7) | 0/1 · 1 | — | 0 | 1/2 |
| leadovi-rupe | 1833 (2.17) | 33 | 14 | 2 | 10/12/13/15/20/28 | 10 / 15 | 0 (0) | 20 (13/7) | 0/1 · 1 | — | 0 | 1/2 |
| leadovi-sastanci | 940 (1.11) | 26 | 11 | 2 | 10/12/13/15/20 | 10 / 14 | 0 (0) | 23 (16/7) | 0/1 · 2 | — | 0 | 1/2 |
| leadovi-mapa | 1501 (1.78) | 41 | 25+2i | 2 | 10/12/13 | 8 / 17 | 0 (0) | 34 (27/7) | 0/1 · 0 | — | 0 | 2/13 |
| uvoz | 1286 (1.52) | 19 | 1 | 2 | 10/12/13/20 | 7 / 9 | 1 (1) | 16 (9/7) | 1/1 · 2 | — | 0 | 1/2 |
| uvoz-pregled | 6791 (8.05) | 220 | 210 | 58 | 10/11/12/13/15/20 | 15 / 20 | 1 (1) | 14 (7/7) | 1/1 · 1 | — | 0 | 3/72 |
| uvoz-istorija | 2215 (2.62) | 46 | 28 | 2 | 10/12/13/20 | 10 / 14 | 1 (1) | 16 (9/7) | 1/1 · 2 | — | 0 | 1/2 |
| instagram | 1344 (1.59) | 21 | 3 | 11 | 10/11/12/13/20/28/40 | 9 / 9 | 1 (1) | 18 (2/16) | 1/1 · 0 | — | 0 | 1/2 |
| openreply | 1867 (2.21) | 20 | 5 | 13 | 10/11/12/13/15/20/28 | 10 / 10 | 1 (1) | 14 (1/13) | 1/1 · 0 | — | 0 | 1/2 |
| novosti | 1284 (1.52) | 17 | 3 | 2 | 10/12/13/15/20 | 8 / 14 | 1 (1) | 15 (8/7) | 1/1 · 3 | — | 0 | 1/2 |
| novosti-prazno | 844 (1) | 9 | 1 | 2 | 10/12/13/20 | 6 / 7 | 1 (1) | 9 (2/7) | 1/1 · 0 | — | 0 | 1/2 |
| analitika | 2615 (3.1) | 31 | 12 | 11 | 10/11/12/13/20/40 | 10 / 10 | 1 (1) | 23 (9/14) | 1/1 · 0 | — | 0 | 1/2 |
| atribucija | 2112 (2.5) | 19 | 8 | 2 | 10/12/13/15/20/28 | 10 / 13 | 1 (1) | 12 (1/11) | 1/1 · 0 | — | 0 | 3/4 |
| facebook | 6374 (7.55) | 44 | 29 | 13 | 10/11/12/13/15/20/28/40 | 12 / 17 | 1 (1) | 14 (1/13) | 1/1 · 2 | — | 0 | 1/2 |
| threads | 7548 (8.94) | 36 | 18 | 19 | 10/11/12/13/15/20/28/40 | 13 / 14 | 1 (0) | 15 (4/11) | 1/1 · 7 | — | 0 | 2/3 |
| youtube | 6565 (7.78) | 51 | 34+2i | 13 | 10/11/12/13/15/20/28/40 | 13 / 24 | 1 (1) | 14 (1/13) | 1/1 · 3 | — | 0 | 2/3 |
| oglasi | 1895 (2.25) | 40 | 19 | 10 | 10/11/12/13/20/28/40 | 13 / 18 | 1 (1) | 16 (3/13) | 1/1 · 0 | — | 0 | 3/18 |
| leadovi-profil | 1984 (2.35) | 23 | 3 | 2 | 10/12/13/15/28 | 9 / 15 | 1 (1) | 20 (13/7) | 1/1 · 1 | — | 0 | 2/5 |
| pravila | 1074 (1.27) | 17 | 4 | 2 | 10/12/13/15/20 | 9 / 16 | 1 (1) | 15 (8/7) | 1/1 · 0 | — | 0 | 1/2 |
| podesavanja | 8847 (10.48) | 43 | 26+1i | 38 | 10/11/12/13/15/20/40 | 11 / 27 | 1 (0) | 15 (8/7) | 1/1 · 12 | — | 0 | 3/12 |
| ljuska-paleta ᴸ | 3291 (3.9) | 37 | 36 | 2 | 10/12/13/15/20 | 14 / 28 | 0 (0) | 17 (0/17) | 0/1 · 6 | — | 0 | 0/0 |
| ljuska-meni ᴸ | 3291 (3.9) | 68 | 37 | 2 | 10/12/13/15/20 | 15 / 16 | 1 (1) | 24 (14/10) | 0/1 · 6 | — | 0 | 1/2 |
| ljuska-vise ᴸ | 2615 (3.1) | 14 | 0 | 13 | 10/11/12/13/15/20/40 | 11 / 22 | 0 (0) | 14 (0/14) | 1/1 · 1 | — | 0 | 0/0 |
| ljuska-danas ᴸ | 3291 (3.9) | 95 | 64 | 2 | 10/12/13/15/20 | 14 / 16 | 1 (1) | 39 (14/25) | 0/1 · 6 | — | 0 | 1/2 |
| napredak | 3307 (3.92) | 9 | 1 | 2 | 10/12/13/15/20/40 | 10 / 16 | 1 (1) | 9 (2/7) | 1/1 · 6 | — | 0 | 1/2 |
| napredak-prazno | 2928 (3.47) | 8 | 0 | 2 | 10/12/13/15/20/40 | 8 / 12 | 0 (0) | 8 (1/7) | 1/1 · 6 | — | 0 | 1/2 |
| napredak-pad | 844 (1) | 8 | 0 | 2 | 10/12/13/20 | 7 / 7 | 0 (0) | 8 (1/7) | 1/1 · 0 | — | 1* | 1/2 |
| leadovi-poziv | 1150 (1.36) | 17 | 2 | 2 | 10/12/13/15/20/28 | 10 / 12 | 1 (1) | 16 (9/7) | 0/1 · 1 | — | 0 | 1/2 |
| leadovi-poziv-tok | 1236 (1.46) | 21 | 4 | 2 | 10/12/13/15/20/28 | 11 / 13 | 1 (1) | 16 (9/7) | 0/1 · 1 | — | 0 | 1/2 |
| kontrolna-tabla-prazno | 3123 (3.7) | 32 | 12 | 2 | 10/12/13/15/20/28 | 14 / 18 | 1 (1) | 15 (4/11) | 1/1 · 5 | — | 0 | 2/7 |
| uvoz-nereseno | 3985 (4.72) | 62 | 51 | 43 | 10/11/12/13/15/20 | 15 / 20 | 1 (1) | 14 (7/7) | 1/1 · 1 | — | 0 | 2/19 |
| leadovi-mapa-panel | 1501 (1.78) | 58 | 40+2i | 2 | 10/12/13/15 | 10 / 23 | 0 (0) | 36 (29/7) | 0/1 · 0 | — | 0 | 2/13 |
| instagram-prazno | 851 (1.01) | 18 | 1 | 2 | 10/12/13/20 | 10 / 8 | 1 (1) | 17 (1/16) | 1/1 · 0 | — | 0 | 1/2 |
| analitika-prazno | 844 (1) | 19 | 1 | 2 | 10/12/13/20 | 10 / 8 | 1 (1) | 15 (1/14) | 1/1 · 0 | — | 0 | 1/2 |
| facebook-prazno | 851 (1.01) | 14 | 1 | 2 | 10/12/13/20 | 9 / 8 | 1 (1) | 14 (1/13) | 1/1 · 0 | — | 0 | 1/2 |
| threads-prazno | 844 (1) | 12 | 1 | 2 | 10/12/13/20 | 10 / 8 | 1 (0) | 12 (1/11) | 1/1 · 0 | — | 0 | 1/2 |
| youtube-prazno | 1204 (1.43) | 16 | 1+2i | 2 | 10/12/13/15/20 | 9 / 9 | 1 (1) | 14 (1/13) | 1/1 · 1 | — | 0 | 1/2 |
| oglasi-prazno | 912 (1.08) | 15 | 1 | 2 | 10/12/13/20 | 9 / 8 | 1 (1) | 15 (2/13) | 1/1 · 0 | — | 0 | 1/2 |
| instagram-komentari | 970 (1.15) | 19 | 6 | 2 | 10/12/13/20 | 7 / 8 | 0 (0) | 14 (7/7) | 1/1 · 0 | DA +58 | 0 | 1/2 |
| facebook-komentari | 994 (1.18) | 34 | 24 | 2 | 10/12/13/20 | 7 / 8 | 0 (0) | 32 (23/9) | 1/1 · 0 | — | 0 | 1/2 |
| youtube-automatizacije | 1677 (1.99) | 24 | 10+2i | 2 | 10/12/13/20 | 9 / 12 | 1 (1) | 16 (7/9) | 1/1 · 0 | — | 0 | 2/6 |
| oglasi-nova-kampanja | 1201 (1.42) | 27 | 16 | 2 | 10/12/13/20 | 7 / 10 | 0 (0) | 18 (9/9) | 1/1 · 2 | — | 0 | 2/3 |
| oglasi-publike | 2173 (2.57) | 19 | 10 | 9 | 10/11/12/13/15/20/28 | 10 / 14 | 1 (1) | 13 (4/9) | 1/1 · 0 | — | 0 | 3/7 |
| analitika-sticanje | 2991 (3.54) | 23 | 4 | 2 | 10/12/13/20/28 | 10 / 15 | 0 (0) | 15 (0/15) | 1/1 · 0 | — | 0 | 1/2 |
| analitika-oglasi | 2084 (2.47) | 25 | 7 | 20 | 7/10/11/12/13/20/28 | 10 / 13 | 0 (0) | 16 (0/16) | 1/1 · 0 | — | 0 | 1/2 |
| analitika-sadrzaj | 3273 (3.88) | 30 | 14 | 13 | 10/12/13/20/28 | 10 / 11 | 0 (0) | 16 (0/16) | 1/1 · 0 | — | 0 | 1/2 |
| analitika-posetioci | 2927 (3.47) | 23 | 4 | 28 | 10/11/12/13/15/20/28 | 10 / 38 | 0 (0) | 16 (0/16) | 1/1 · 0 | — | 0 | 2/3 |
| analitika-uzivo | 1656 (1.96) | 15 | 1 | 8 | 10/12/13/20/34 | 8 / 15 | 0 (0) | 11 (1/10) | 1/1 · 0 | — | 0 | 1/2 |
| analitika-retencija | 2109 (2.5) | 12 | 0 | 62 | 7/10/11/12/13/20/28 | 8 / 39 | 0 (0) | 12 (0/12) | 1/1 · 0 | — | 0 | 2/3 |
| openreply-automatizacije | 878 (1.04) | 13 | 1 | 2 | 10/12/13/20 | 8 / 9 | 1 (1) | 13 (4/9) | 1/1 · 0 | — | 0 | 1/2 |
| pravila-istorija | 844 (1) | 11 | 2 | 2 | 10/12/13/15/20 | 8 / 12 | 1 (1) | 11 (4/7) | 1/1 · 0 | — | 0 | 1/2 |
| openreply-prazno | 907 (1.07) | 14 | 1 | 2 | 10/12/13/15/20/28 | 9 / 8 | 1 (1) | 14 (1/13) | 1/1 · 0 | — | 0 | 1/2 |
| podesavanja-napredak-direkt | 930 (1.1) | 21 | 5 | 2 | 10/12/13/20 | 7 / 10 | 1 (0) | 17 (10/7) | 1/1 · 0 | — | 0 | 1/2 |

Medijana visine: 1867 px (2.21 ekrana); najviše: podesavanja 8847, threads 7548, uvoz-pregled 6791, youtube 6565, facebook 6374.
Male mete ukupno: 1095 (medijana 7 po ekranu).
Tekst <12px: 469 čvorova na 56/56 ekrana.
Ekrana bez primarnog iznad preloma: 19; sa 2+ primarna: nijedan; sa 2+ „punih" CTA: nijedan.
Izbora iznad preloma: medijana 15 (main 4); najviše: ljuska-danas 39, leadovi-mapa-panel 36, leadovi-mapa 34, leadovi-tabela 33, facebook-komentari 32.
Vidljivih h1 ≠ 1: leadovi (0/1), leadovi-tabela (0/1), leadovi-zaostali (0/1), leadovi-rupe (0/1), leadovi-sastanci (0/1), leadovi-mapa (0/1), ljuska-paleta (0/1), ljuska-meni (0/1), ljuska-danas (0/1), leadovi-poziv (0/1), leadovi-poziv-tok (0/1), leadovi-mapa-panel (0/1).
Vodoravni preliv dokumenta: instagram-komentari (scrollWidth 448; div.pointer-events-none.fixed (+58px); div.group/toggle-group.flex (+58px)); elemenata koji probijaju ivicu bez preliva: nijedan.
Greške u konzoli: napredak-pad (1, očekivano).
Fiksni hrom iznad preloma (gore/dole px): 147/57, 56/57, 192/57, 0/0, 101/0, 101/57.

### Raspodela, primeri i ponavljanja

**Raspodela veličina fonta** (vidljivi tekstualni čvorovi, svi ekrani):

- 1536x695: 10px 188 (1.8%) · 11px 360 (3.5%) · 12px 6125 (59.2%) · 13px 3154 (30.5%) · 13.5px 13 (0.1%) · 15px 265 (2.6%) · 20px 142 (1.4%) · 28px 84 (0.8%) · 40px 13 (0.1%) · 56px 1 (0.0%) — ukupno 10345
- 390x844: 7px 23 (0.3%) · 10px 181 (2.2%) · 11px 265 (3.2%) · 12px 5372 (65.0%) · 13px 1968 (23.8%) · 15px 208 (2.5%) · 20px 151 (1.8%) · 28px 79 (1.0%) · 34px 1 (0.0%) · 40px 12 (0.1%) — ukupno 8260

Najčešći oblici teksta <12px: 10px "…" <span> (62 ekrana); 11px "…" <span> (12 ekrana); 11px "…" <tspan svg> (11 ekrana); 7px "…" <text svg> (2 ekrana); 11px "…" <th> (1 ekrana); 10px "…" <div> (1 ekrana)

Boje teksta po ekranu: min 6, max 20 (leadovi-tabela); boje pozadine: min 7, max 53 (analitika-posetioci).

**Najčešće male mete** (oznaka · veličina · na koliko ekrana):

- 1536x695: button "Više o ovom ekranu" 20x20 (18 ekr., 18×); a "Test Salon 2" 274x23 (8 ekr., 11×); a "Test Salon 3" 326x23 (7 ekr., 7×); a "Test Salon 7" 326x23 (7 ekr., 7×); a "Test Salon 10" 274x23 (6 ekr., 6×); a "Test Salon 6" 326x23 (6 ekr., 6×); a "Test Salon 12" 326x23 (6 ekr., 6×); a "Analitika" 49x19 (6 ekr., 6×); a "Test Salon 14" 274x23 (5 ekr., 5×); a "Test Salon 22" 274x23 (5 ekr., 5×); button "prikaži i prazne (3)" 102x16 (4 ekr., 4×); button "prikaži i prazne (4)" 102x16 (4 ekr., 4×); a "Leadovi" 45x19 (4 ekr., 4×); button "Sesije" 97x16 (4 ekr., 4×)
- 390x844: a[secondary] "Uvoz leadova" 121x28 (9 ekr., 9×); button[outline] "Podešavanja leadova" 36x28 (9 ekr., 9×); a "Test Salon 2" 213x23 (7 ekr., 10×); a "Test Salon 3" 265x23 (6 ekr., 6×); a "Test Salon 7" 265x23 (6 ekr., 6×); a[role=button][secondary] "Pozovi" 72x28 (5 ekr., 30×); button[secondary] "Zabeleži ishod" 119x28 (5 ekr., 11×); button "Sesije" 52x24 (5 ekr., 6×); a "Test Salon 10" 213x23 (5 ekr., 5×); a "Test Salon 6" 265x23 (5 ekr., 5×); a "Test Salon 12" 265x23 (5 ekr., 5×); a[role=button][secondary] "Otvori" 70x28 (4 ekr., 10×); button "Korisnici" 66x24 (4 ekr., 5×); a "Test Salon 14" 213x23 (4 ekr., 4×)

**Primeri malih meta — 3 po ekranu** (oznaka · širina×visina):

**1536x695** (prag 24 px):
- kontrolna-tabla (7): button "Više o ovom ekranu" 20x20; a "Napredak" 71x16; a "Levak" 47x16
- leadovi (13): button "Vidi sve (40)" 87x16; a "Test Salon 2" 274x23; a "Test Salon 10" 274x23
- leadovi-tabela (50): button "prikaži i prazne (3)" 102x16; button "prikaži i prazne (4)" 102x16; button "Prikaži" 36x16
- leadovi-zaostali (3): a "Test Salon 2" 326x23; a "Test Salon 7" 326x23; a "Test Salon 12" 326x23
- leadovi-rupe (6): a "Test Salon 3" 326x23; a "Test Salon 7" 326x23; a "Test Salon 11" 326x23
- leadovi-sastanci (3): a "Test Salon 3" 326x23; a "Test Salon 6" 326x23; a "Test Salon 9" 326x23
- leadovi-mapa (2): button "prikaži i prazne (3)" 102x16; button "prikaži i prazne (4)" 102x16
- uvoz (2): a "Leadovi" 45x19; button "Više o ovom ekranu" 20x20
- uvoz-pregled (18): a "Leadovi" 45x19; button "Više o ovom ekranu" 20x20; button "nerazrešeno: 41" 119x22
- uvoz-istorija (6): a "Leadovi" 45x19; button "Više o ovom ekranu" 20x20; button "Upozorenja parsera (3)" 162x22
- openreply (7): button "Naziv kampanje" 251x16; button "Ključna reč" 113x16; button "Status" 127x16
- novosti (1): button "Više o ovom ekranu" 20x20
- novosti-prazno (1): button "Više o ovom ekranu" 20x20
- analitika (4): button "Izvor / medij" 393x16; button "Kampanja" 211x16; button "Sesije" 97x16
- atribucija (7): button "" 14x20; button "Kampanja i slug" 371x16; button "1. DM poruke" 117x16
- facebook (7): a "Otvori" 49x16; a "Otvori" 49x16; a "Otvori" 49x16
- threads (13): a "Otvori na Threads" 113x16; a "Otvori na Threads" 113x16; a "Otvori na Threads" 113x16
- youtube (9): button "Izvor" 359x16; button "Pregledi" 179x16; button "Vreme gledanja" 284x16
- oglasi (7): button "Više o ovom ekranu" 20x20; button "Kampanja" 73x16; button "Potrošnja" 69x16
- leadovi-profil (2): a "Nazad na leadove" 117x16; button "google_maps (potvrđeno)" 177x22
- pravila (2): span[role=switch] "Pravilo Zaustavi kad CPA pređe cilj: akt" 36x20; span[role=switch] "Pravilo Upozori na skok potrošnje: isklj" 36x20
- podesavanja (3): button "Više o ovom ekranu" 20x20; button "Napredno: Ručno podešavanje kredencijala" 522x16; a "myaccount.google.com/permissions" 216x16
- ljuska-sina (1): button[ghost] "Proširi bočnu traku" 20x28
- ljuska-meni (13): button "Vidi sve (40)" 87x16; a "Test Salon 2" 274x23; a "Test Salon 10" 274x23
- napredak (2): a "Kontrolna tabla" 88x19; button "Više o ovom ekranu" 20x20
- napredak-prazno (2): a "Kontrolna tabla" 88x19; button "Više o ovom ekranu" 20x20
- napredak-pad (2): a "Kontrolna tabla" 88x19; button "Više o ovom ekranu" 20x20
- ljuska-pad-napretka (13): button "Vidi sve (40)" 87x16; a "Test Salon 2" 274x23; a "Test Salon 10" 274x23
- leadovi-poziv (2): a "Profil firme" 80x19; a "Sajt" 40x19
- leadovi-poziv-tok (4): a "Profil firme" 80x19; a "Sajt" 40x19; a "Test Salon 10" 236x19
- kontrolna-tabla-prazno (12): button "Više o ovom ekranu" 20x20; a "Napredak" 71x16; a "GA4 nije povezan" 118x19
- leadovi-tabela-kolone (50): button "prikaži i prazne (3)" 102x16; button "prikaži i prazne (4)" 102x16; button "Sakrij ih" 42x16
- leadovi-profil-radnje (2): a "Nazad na leadove" 117x16; button "google_maps (potvrđeno)" 177x22
- uvoz-nereseno (3): a "Leadovi" 45x19; button "Više o ovom ekranu" 20x20; button "samo nerazrešeni (41)" 154x22
- leadovi-mapa-panel (7): button "prikaži i prazne (3)" 102x16; button "prikaži i prazne (4)" 102x16; a "Test Salon 2" 278x23
- oglasi-prazno (1): button "Više o ovom ekranu" 20x20
- instagram-komentari (2): a "Instagram" 59x19; button "Više o ovom ekranu" 20x20
- facebook-komentari (9): a "Facebook" 58x19; button "Više o ovom ekranu" 20x20; span[role=checkbox] "Izaberi sve prikazane komentare" 16x16
- youtube-automatizacije (2): a "YouTube" 52x19; button "Više o ovom ekranu" 20x20
- oglasi-nova-kampanja (2): a "Oglasi" 36x19; button "Više o ovom ekranu" 20x20
- oglasi-publike (1): a "Oglasi" 36x19
- analitika-sticanje (5): a "Analitika" 49x19; button "Izvor / medijum" 384x16; button "Novi korisnici" 155x16
- analitika-oglasi (8): a "Analitika" 49x19; button "Kampanja" 242x16; button "Potrošnja" 119x16
- analitika-sadrzaj (15): a "Analitika" 49x19; button "Putanja stranice" 359x16; button "Prikazi" 98x16
- analitika-posetioci (5): a "Analitika" 49x19; button "Država" 316x16; button "Korisnici" 165x16
- analitika-uzivo (1): a "Analitika" 49x19
- analitika-retencija (1): a "Analitika" 49x19
- openreply-automatizacije (1): a "OpenReply" 64x19
- threads-objavi (6): span[role=switch] "" 36x20; span[role=switch] "" 36x20; span[role=switch] "" 36x20
- podesavanja-napredak-direkt (2): span[role=switch] "" 36x20; span[role=switch] "" 36x20
- bez malih meta: instagram, ljuska-paleta, napredak-paleta, instagram-prazno, analitika-prazno, facebook-prazno, threads-prazno, youtube-prazno, pravila-istorija, openreply-prazno
**390x844** (prag 44 px):
- kontrolna-tabla (15): a "Napredak" 71x16; a[role=button][primary] "Odgovori" 96x32; button "Sesije" 52x24
- leadovi (34): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; button "Vidi sve (40)" 87x16
- leadovi-tabela (223): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; input "Pretraga po nazivu firme" 316x32
- leadovi-zaostali (11): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; a "Test Salon 2" 265x23
- leadovi-rupe (14): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; a "Test Salon 3" 265x23
- leadovi-sastanci (11): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; a "Test Salon 3" 265x23
- leadovi-mapa (25): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; input "Pretraga po nazivu firme" 316x32
- uvoz (1): button[outline] "Pretraži računar" 112x28
- uvoz-pregled (210): button[outline] "Započni novi uvoz" 138x28; button[outline] "Nazad" 82x28; button[primary] "Primeni preostale (2)" 172x32
- uvoz-istorija (28): button "Upozorenja parsera (3)" 162x22; button[outline] "Nastavi pregled" 129x32; button[outline] "Odustani od uvoza" 146x32
- instagram (3): a[role=button][primary] "Nova objava" 115x32; a[role=button][secondary] "Otvori podešavanja" 132x28; select "Broj pratilaca Doseg Pregledi sadržaja U" 184x36
- openreply (5): a[role=button][primary] "Otvori automatizacije" 165x32; button "Naziv kampanje" 172x16; button "Poslati DM" 74x16
- novosti (3): button[primary] "Novi post" 99x32; input "Pretraga postova" 320x32; select "Filter po kategoriji" 173x32
- novosti-prazno (1): button[primary] "Novi post" 99x32
- analitika (12): a[role=button][primary] "Pogledaj uživo" 127x32; button "Sesije" 52x24; button "Korisnici" 66x24
- atribucija (8): a[role=button][primary] "Otvori automatizacije" 165x32; button "" 14x20; button "Kampanja i slug" 277x16
- facebook (29): a[role=button][primary] "Odgovori na komentare" 182x32; button "Sakrij obrisane 1" 139x28; a "Pogledaj na Facebook-u" 310x30
- threads (18): button[primary] "Objavi" 80x32; a "Otvori na Threads" 113x16; a "Otvori na Threads" 113x16
- youtube (34): button[primary] "Pošalji video" 116x32; button "Izvor" 123x16; button "Pregledi" 60x16
- oglasi (19): a[role=button][primary] "Nova kampanja" 134x32; button "Test set — Žene 25–44, Beograd (3 v)" 278x28; button "Sve platforme (6)" 111x40
- leadovi-profil (3): a "Nazad na leadove" 117x16; button "google_maps (potvrđeno)" 177x22; select "Temperatura leada" 100x28
- pravila (4): button[outline] "Pokreni proveru sad" 160x32; button[primary] "Novo pravilo" 116x32; span[role=switch] "Pravilo Zaustavi kad CPA pređe cilj: akt" 36x20
- podesavanja (26): a[role=button][primary] "Stanje sinhronizacije" 160x32; button[ghost] "Izmeni" 59x28; button[outline] "Sinhronizuj" 101x28
- ljuska-paleta (36): button[role=option] "3 upita sa sajta čekaju Otvori upite" 344x38; button[role=option] "3 zaostala koraka Zovi" 344x38; button[role=option] "Uvoz čeka pregled (3) Otvori pregled" 344x38
- ljuska-meni (37): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; button "Vidi sve (40)" 87x16
- ljuska-danas (64): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; button "Vidi sve (40)" 87x16
- napredak (1): a[role=button][primary] "Odgovori" 89x28
- leadovi-poziv (2): a "Profil firme" 80x19; a "Sajt" 40x19
- leadovi-poziv-tok (4): a "Profil firme" 80x19; a "Sajt" 40x19; a "Test Salon 10" 160x19
- kontrolna-tabla-prazno (12): a "Napredak" 71x16; a[role=button][outline] "Poveži u Podešavanjima" 173x28; a "GA4 nije povezan" 118x19
- uvoz-nereseno (51): button[outline] "Započni novi uvoz" 138x28; button[outline] "Nazad" 82x28; button[primary] "Primeni preostale (2)" 172x32
- leadovi-mapa-panel (40): a[secondary] "Uvoz leadova" 121x28; button[outline] "Podešavanja leadova" 36x28; input "Pretraga po nazivu firme" 316x32
- instagram-prazno (1): a[role=button][primary] "Poveži Instagram" 122x32
- analitika-prazno (1): a[role=button][primary] "Poveži GA4" 90x32
- facebook-prazno (1): a[role=button][primary] "Poveži Facebook" 121x32
- threads-prazno (1): a[role=button][primary] "Poveži Threads" 111x32
- youtube-prazno (1): a[role=button][primary] "Poveži YouTube" 115x32
- oglasi-prazno (1): a[role=button][primary] "Poveži nalog" 96x32
- instagram-komentari (6): button[default] "Neodgovoreni 3" 109x28; button[default] "Svi 12" 53x28; button[default] "Sakriveni 1" 80x28
- facebook-komentari (24): button[default] "Neodgovoreni 3" 109x28; button[default] "Svi 6" 46x28; button[default] "Sakriveni 1" 80x28
- youtube-automatizacije (10): button[primary] "Nova automatizacija" 154x28; button[role=switch] "Aktivno" 81x30; button[outline] "Izmeni" 75x28
- oglasi-nova-kampanja (16): select "Test Salon — Meta nalog (RSD)" 300x36; input "npr. Leto 2026 — Saobraćaj" 300x32; button "Saobraćaj" 81x30
- oglasi-publike (10): button[outline] "Osveži publike" 125x28; button[outline] "Istraži ciljanje" 119x28; button[primary] "Nova prilagođena publika" 184x28
- analitika-sticanje (4): button "Izvor / medijum" 164x16; button "Novi korisnici" 87x16; button "Ukupno korisnika" 109x16
- analitika-oglasi (7): button "Kampanja" 162x16; button "Potrošnja" 79x16; button "Klikovi" 50x16
- analitika-sadrzaj (14): button "Putanja stranice" 196x16; button "Prikazi" 51x16; button "Korisnici" 62x16
- analitika-posetioci (4): button "Država" 127x16; button "Korisnici" 62x16; button "Sesije" 48x16
- analitika-uzivo (1): button[outline] "Osveži" 83x28
- openreply-automatizacije (1): button[primary] "Nova automatizacija" 154x28
- pravila-istorija (2): button[outline] "Pokreni proveru sad" 160x32; button[primary] "Novo pravilo" 116x32
- openreply-prazno (1): a[role=button][primary] "Otvori automatizacije" 165x32
- podesavanja-napredak-direkt (5): span[role=switch] "" 36x20; input "25" 342x32; input "3" 342x32
- bez malih meta: ljuska-vise, napredak-prazno, napredak-pad, analitika-retencija

## 5. axe-core 4.14 — WCAG 2.0/2.1 A+AA i 2.2 AA (sve stranice, oba prikaza)

| pravilo | uticaj | WCAG | stranica (od 116) | čvorova | najgore stranice |
|---|---|---|---|---|---|
| label-content-name-mismatch | serious | wcag21a wcag253 | 112 | 548 | leadovi-tabela@M (52), leadovi-tabela@D (32), leadovi-tabela-kolone@D (32), oglasi@D (13) |
| color-contrast | serious | wcag2aa wcag143 | 28 | 251 | leadovi-tabela@D (27), leadovi-tabela@M (27), leadovi-tabela-kolone@D (27), uvoz-pregled@D (20) |
| scrollable-region-focusable | serious | wcag2a wcag211 wcag213 | 7 | 9 | podesavanja@M (2), oglasi-publike@M (2), atribucija@M (1), threads@M (1) |
| select-name | critical | wcag2a wcag412 | 2 | 100 | uvoz-pregled@D (50), uvoz-pregled@M (50) |
| aria-prohibited-attr | serious | wcag2a wcag412 | 2 | 12 | oglasi@D (6), oglasi@M (6) |
| nested-interactive | serious | wcag2a wcag412 | 2 | 8 | oglasi@D (4), oglasi@M (4) |
| target-size | serious | wcag22aa wcag258 | 2 | 4 | leadovi-tabela@D (2), leadovi-tabela-kolone@D (2) |
| button-name | critical | wcag2a wcag412 | 2 | 2 | atribucija@D (1), atribucija@M (1) |

Nepotpuno (axe nije mogao da odluči): color-contrast 116 čvorova, aria-prohibited-attr 3 čvorova, link-in-text-block 4 čvorova, aria-hidden-focus 8 čvorova, aria-valid-attr-value 4 čvorova

Primeri po pravilu:
- **color-contrast** — Elements must meet minimum color contrast ratio thresholds
  - kontrolna-tabla: `li:nth-child(1) > .border-success-line.bg-success-soft.text-success > .truncate > .font-normal.text-text-muted` — <span class="font-normal text-text-muted"> · uspešno · pre 2 h</span> — Fix any of the following: Element has insufficient color contrast of 4.33 (foreground color: #7f95b8, background color: #1a333f, font size: 9.8pt (13px), font weight: normal). Expected contrast ratio 
  - kontrolna-tabla: `li:nth-child(2) > .border-success-line.bg-success-soft.text-success > .truncate > .font-normal.text-text-muted` — <span class="font-normal text-text-muted"> · uspešno · pre 2 h</span> — Fix any of the following: Element has insufficient color contrast of 4.33 (foreground color: #7f95b8, background color: #1a333f, font size: 9.8pt (13px), font weight: normal). Expected contrast ratio 
  - kontrolna-tabla: `li:nth-child(1) > .border-success-line.bg-success-soft.text-success > .truncate > .font-normal.text-text-muted` — <span class="font-normal text-text-muted"> · uspešno · pre 2 h</span> — Fix any of the following: Element has insufficient color contrast of 4.33 (foreground color: #7f95b8, background color: #1a333f, font size: 9.8pt (13px), font weight: normal). Expected contrast ratio 
- **label-content-name-mismatch** — Elements must have their visible text as part of their accessible name
  - kontrolna-tabla: `.h-12` — <a aria-label="Napredak: Operativac, nivo 7" class="flex h-12 min-w-0 items-center gap-2.5 rounded-lg px-2 flex-1 cursor — Fix any of the following: Text inside the element is not included in the accessible name
  - kontrolna-tabla: `#base-ui-_r_3_` — <a aria-label="Podešavanja" class="relative flex size-9 items-center justify-center rounded-lg transition-colors hover:b — Fix any of the following: Text inside the element is not included in the accessible name
  - kontrolna-tabla: `#base-ui-_r_g_` — <button type="button" tabindex="0" aria-haspopup="menu" id="base-ui-_r_g_" data-slot="dropdown-menu-trigge..." aria-labe — Fix any of the following: Text inside the element is not included in the accessible name
- **target-size** — All touch targets must be 24px large, or leave sufficient space
  - leadovi-tabela: `button[title="Sortiraj po: Sledeći korak"]` — <button type="button" title="Sortiraj po: Sledeći korak" aria-pressed="false" class="inline-flex cursor-pointer items-ce — Fix any of the following: Target has insufficient size (73.3px by 16.2px, should be at least 24px by 24px) Target has insufficient space to its closest neighbors. Safe clickable space has a diameter o
  - leadovi-tabela: `button[title="Sortiraj po poslednjem dodiru"]` — <button type="button" title="Sortiraj po poslednjem dodiru" aria-pressed="false" class="inline-flex cursor-pointer items — Fix any of the following: Target has insufficient size (28.2px by 16.2px, should be at least 24px by 24px) Target has insufficient space to its closest neighbors. Safe clickable space has a diameter o
  - leadovi-tabela-kolone: `button[title="Sortiraj po: Sledeći korak"]` — <button type="button" title="Sortiraj po: Sledeći korak" aria-pressed="false" class="inline-flex cursor-pointer items-ce — Fix any of the following: Target has insufficient size (73.3px by 16.2px, should be at least 24px by 24px) Target has insufficient space to its closest neighbors. Safe clickable space has a diameter o
- **select-name** — Select element must have an accessible name
  - uvoz-pregled: `.group\/row.hover\:bg-\[var\(--row-hover-bg\)\]:nth-child(1) > .shadow-\[-8px_0_12px_-6px_rgba\(0\,0\,0\,0\.55\)\,-1px_0_0_0_var\(--line\)\,` — <select class="w-full rounded-md border px-2 py-1 text-xs font-medium outline-none transition-colors cursor-pointer bord — Fix any of the following: Element does not have an implicit (wrapped) <label> Element does not have an explicit <label> aria-label attribute does not exist or is empty aria-labelledby attribute does n
  - uvoz-pregled: `.group\/row.hover\:bg-\[var\(--row-hover-bg\)\]:nth-child(2) > .shadow-\[-8px_0_12px_-6px_rgba\(0\,0\,0\,0\.55\)\,-1px_0_0_0_var\(--line\)\,` — <select class="w-full rounded-md border px-2 py-1 text-xs outline-none transition-colors cursor-pointer border-[var(--te — Fix any of the following: Element does not have an implicit (wrapped) <label> Element does not have an explicit <label> aria-label attribute does not exist or is empty aria-labelledby attribute does n
  - uvoz-pregled: `.group\/row.hover\:bg-\[var\(--row-hover-bg\)\]:nth-child(1) > .shadow-\[-8px_0_12px_-6px_rgba\(0\,0\,0\,0\.55\)\,-1px_0_0_0_var\(--line\)\,` — <select class="w-full rounded-md border px-2 py-1 text-xs font-medium outline-none transition-colors cursor-pointer bord — Fix any of the following: Element does not have an implicit (wrapped) <label> Element does not have an explicit <label> aria-label attribute does not exist or is empty aria-labelledby attribute does n
- **button-name** — Buttons must have discernible text
  - atribucija: `#base-ui-_r_1l_` — <button type="button" id="base-ui-_r_1l_" data-base-ui-tooltip-trigger="" data-slot="tooltip-trigger"> — Fix any of the following: Element does not have inner text that is visible to screen readers aria-label attribute does not exist or is empty aria-labelledby attribute does not exist, references elemen
  - atribucija: `#base-ui-_r_o_` — <button type="button" id="base-ui-_r_o_" data-base-ui-tooltip-trigger="" data-slot="tooltip-trigger"> — Fix any of the following: Element does not have inner text that is visible to screen readers aria-label attribute does not exist or is empty aria-labelledby attribute does not exist, references elemen
- **scrollable-region-focusable** — Scrollable region must have keyboard access
  - atribucija: `.gap-4.flex-col > .group\/card.text-card-foreground[data-size="default"] > .overflow-x-auto > .overflow-x-auto.w-full[data-slot="table-conta` — <div data-slot="table-container" class="relative w-full overflow-x-auto"> — Fix any of the following: Element should have focusable content Element should be focusable
  - threads: `.max-h-64` — <div class="overflow-x-auto max-h-64 overflow-y-auto"> — Fix any of the following: Element should have focusable content Element should be focusable
  - youtube: `.border-line.rounded-xl.overflow-hidden > .overflow-x-auto.w-full[data-slot="table-container"]` — <div data-slot="table-container" class="relative w-full overflow-x-auto"> — Fix any of the following: Element should have focusable content Element should be focusable
- **aria-prohibited-attr** — Elements must only use permitted ARIA attributes
  - oglasi: `.hover\:bg-surface-raised\/50:nth-child(1) > .py-3\.5.pl-5 > .items-start.gap-2\.5 > .bg-success.size-2[aria-label="Status: ACTIVE"]` — <span class="mt-1 size-2 rounded-full shrink-0 bg-success" aria-label="Status: ACTIVE"></span> — Fix all of the following: aria-label attribute cannot be used on "span" elements with no valid role attribute.
  - oglasi: `.hover\:bg-surface-raised\/50:nth-child(2) > .py-3\.5.pl-5 > .items-start.gap-2\.5 > .bg-success.size-2[aria-label="Status: ACTIVE"]` — <span class="mt-1 size-2 rounded-full shrink-0 bg-success" aria-label="Status: ACTIVE"></span> — Fix all of the following: aria-label attribute cannot be used on "span" elements with no valid role attribute.
  - oglasi: `.hover\:bg-surface-raised\/50:nth-child(1) > .py-3\.5.pl-5 > .items-start.gap-2\.5 > .bg-success.size-2[aria-label="Status: ACTIVE"]` — <span class="mt-1 size-2 rounded-full shrink-0 bg-success" aria-label="Status: ACTIVE"></span> — Fix all of the following: aria-label attribute cannot be used on "span" elements with no valid role attribute.
- **nested-interactive** — Interactive controls must not be nested
  - oglasi: `.hover\:bg-surface-raised\/50:nth-child(1)` — <tr data-slot="table-row" class="border-b has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted group cursor-poin — Fix any of the following: Element has focusable descendants. Move them outside of the element, or remove them.
  - oglasi: `.hover\:bg-surface-raised\/50:nth-child(3)` — <tr data-slot="table-row" class="border-b has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted group cursor-poin — Fix any of the following: Element has focusable descendants. Move them outside of the element, or remove them.
  - oglasi: `.hover\:bg-surface-raised\/50:nth-child(1)` — <tr data-slot="table-row" class="border-b has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted group cursor-poin — Fix any of the following: Element has focusable descendants. Move them outside of the element, or remove them.

Neuspela merenja: podesavanja-napredak@1536x695: klik na jezičak vodi na stranu prijave (router.replace gubi ?ux=1); izmereno direktnom adresom kao podesavanja-napredak-direkt; podesavanja-napredak@390x844: klik na jezičak vodi na stranu prijave (router.replace gubi ?ux=1); izmereno direktnom adresom kao podesavanja-napredak-direkt

## 6. `scripts/contrast-check.mjs`

Pokrenut bez `--out` (samo stdout, ništa se ne upisuje u ED): `node ED/scripts/contrast-check.mjs` → izlaz 0, **„Pada: 0 od 212 (uz 22 informativnih redova)"**. Pun izlaz: `AUDIT/b-tools/contrast-check.md`.

- Najtesnije prolaze: `temp-nova` tekst na `surface-raised` 4,64:1 · `temp-hot` 4,76 · `text-on-light-muted` na svetloj 4,91 · `line-control` granica na `surface-raised` 3,28 (prag 3) · `text-muted` na `surface-raised` 4,93 · `temp-cold`/`temp-warm` 5,01 · `danger` na `danger-soft` 5,12.
- Informativni redovi (ne ulaze u pad): ivice modula `mod-*-line` na kartici **2,48–2,89:1**, `line` 1,41–1,45, `line-strong` 2,45–2,50. Ako ivica u boji modula sama nosi stanje (npr. „uključen filter ima ivicu u boji modula", ivica sekundarnog dugmeta), to je ispod 3:1 iz WCAG 1.4.11.
- **Slepa tačka skripta:** meri parove tokena, ne kompozicije. Ne vidi (a) `opacity-*` nad prigušenim tekstom, (b) prigušeni tekst na `-soft` podlogama stanja, (c) tekst preko gradijenta/aurore. Zato skript kaže 0/212, a axe na istim ekranima nalazi stvarne padove (§5, §7-3).

## 7. Deset najvažnijih determinističkih problema (rangirano)

Rang = težina × doseg × koliko često Jovan to vidi (1536×695 svaki dan, telefon retko ali „na terenu"). Svaka stavka je izmerena, ne procenjena.

**1. [P1] Dodirne mete na telefonu — 56 % svih meta je ispod 44 px (pravilo iz DESIGN.md je prekršeno).**
- Dokaz: na 390×844 je **1095 od 1946** vidljivih omogućenih interaktivnih elemenata (56,3 %) uže ili niže od 44 px; medijana 7 po ekranu (male / omogućene): Leadovi: `leadovi` 34/65, `leadovi-tabela` **223/236**, `leadovi-mapa-panel` 40/57, `ljuska-danas` 64/95, `uvoz-pregled` **210/220**, `uvoz-nereseno` 51/61; kanali: `youtube` 34/51, `facebook` 29/44, `podesavanja` 26/43, `facebook-komentari` 24/34.
- Glavne radnje glavnog ekrana: „Pozovi" **72×28** (30× na 5 ekrana), „Zabeleži ishod" 119×28, „Zabeleži dodir" 117×28, „Otvori" 70×28, naziv firme (link) 213–265×**23**, „Uvoz leadova" 121×28 i „Podešavanja leadova" **36×28** (9 ekrana), primarno „Odgovori" na Kontrolnoj tabli 96×32, stavke ⌘K 344×38, filteri komentara „Svi 12" 53×28.
- Uzrok u kodu: `components/ui/button.tsx` — visine 24/28/32 px (`xs` 65×, `sm` 409× od 536 upotreba `<Button`); `.touch-target` (44 px pod `pointer: coarse`, `globals.css:965`) je ručno dodat samo 84× u 28 fajlova i **nije u `buttonVariants`**. DESIGN.md: „Dodirne mete na telefonu su najmanje 44 px".
- Popravka: `touch-target` u bazu `buttonVariants` (i u `Chip` sa `onClick`, naslovni link `WorkCard`, `select`/`input` visine 32) — jedna izmena pokriva većinu od 1095.

**2. [P2] Tekst ispod 12 px na svakom ekranu (0 od 116 merenja bez njega).**
- Dokaz: 1536 — **548 od 10 345** vidljivih tekstualnih čvorova (5,3 %) na 60/60 ekrana; 390 — 469 od 8 260 (5,7 %) na 56/56. Van skale se koriste samo **10 i 11 px** (+ **7 px** SVG teksta na telefonu: `analitika-oglasi`, `analitika-retencija`, jer se grafikon smanjuje kroz `viewBox`); skala je 12/13/15/20/28/40.
- Najgori: `uvoz-pregled` 58 („već postoji u bazi" 11 px ×56, `import-review-table.tsx:1291–1328`), `analitika-retencija` 52/62 (kohorte „Ned N" 10 px), `uvoz-nereseno` 43, `podesavanja` 38 (GA4 „ID:", „Naziv propertije", sirovi `(ONCE_PER_EVENT)` 10 px), `analitika-posetioci` 38, `threads` 26; ose grafikona 11 px na Tabli, kanalima i Analitici; bedževi broja „10" (zvono) i „1" (Podešavanja) 10 px na **svakom** ekranu.
- Izvor: 88 doslovnih `text-[9|10|11px]` u 28 fajlova (CLI) + 14× `tick={{ fontSize: 11 }}` u 6 Recharts fajlova (CLI ih ne vidi) + isti bedž `h-4 min-w-4 px-1 text-[10px]` kopiran na 5 mesta. DESIGN.md „Pravilo skale"; komentar u `globals.css` („Ništa … nije 11 px") je netačan.

**3. [P2] Kontrast pada u 251 pogotku (28 merenja, 12 različitih ekrana), a `contrast-check.mjs` kaže 0/212 — skript meri tokene, ne kompozicije.**
- Dokaz (axe `color-contrast`, WCAG 1.4.3 AA, 28/116 merenja): `leadovi-tabela` 27, `uvoz-pregled` 20, `uvoz-nereseno` 17, `leadovi-mapa`(+panel) 11, `uvoz-istorija` 9, `podesavanja` 8, `youtube-automatizacije` 4, `oglasi-publike` 3, `kontrolna-tabla` 2…
- Obrasci: `opacity-80` na mono brojevima u čipovima filtera leadova „(94)" **3,69:1**; prigušeni tekst na `-soft` podlogama stanja („· uspešno · pre 2 h" na Tabli, „Šta je sledeće" u profilu) **4,33:1**; tekst temperature na sopstvenoj podlozi (uvoz) 4,01–4,12:1; tekst outline dugmeta na `input/30` 3,87–4,17:1 (uvoz-istorija, nova kampanja, podešavanja); `text-text-muted/60` „read-only" (Oglasi) **2,77:1**; „Isključeno"/„Autor" (YouTube automatizacije) 3,2–3,4:1; `text-text-muted/80` 10 px ID-jevi (publike) 3,69:1. Još 116 čvorova axe nije mogao da odluči (aurora/gradijenti).
- Popravka: zabrana alfa/`opacity-*` na tekstu (koristiti `text-secondary`), a u `contrast-check.mjs` dodati parove `text-muted` × svaka `-soft`, `temp-*` × `temp-*-bg`, tekst outline dugmeta × njegova podloga.

**4. [P1 na telefonu] Lepljiva gornja traka pokriva do 30 % ekrana telefona.**
- Dokaz: izmerena visina lepljivog `<header class="material … sticky top-0">` na 390: **192 px** na 16 ekrana (Instagram, Facebook, YouTube, Oglasi, OpenReply, Analitika + podekrani Sticanje/Oglasi/Sadržaj/Posetioci, prazne varijante), **147 px** na 5 (Kontrolna tabla, Atribucija, Threads + prazne), **101 px** na 8 podekrana (komentari, automatizacije, nova kampanja, publike, Uživo, Retencija); plus donja traka 57 px → **249 od 844 px (29,5 %) stalno zauzeto** na kanalima (Leadovi: 56+57 = 13 %). Proba: na `/` traka je 147 px i ostaje 147 px posle skrola od 600 px.
- Uzrok: birač perioda („7 dana · 28 dana · 90 dana · Prilagođeno · 30.09.–27.10.") se u lepljivoj traci prelama u 2–3 reda.
- Popravka: ispod 768 px period kao jedna kompaktna kontrola („28 d ▾") ili van lepljive trake.

**5. [P2] Fokus i primarno dugme van prvog ekrana; strane od 5–10 ekrana.**
- DESIGN.md: „Fokus ekrana i njegovo primarno dugme moraju da stanu iznad preloma na 1536×695". Prekršeno: `oglasi-nova-kampanja` (primarno na y = **816**), `threads-objavi` (y = **1458**). Bez ijednog primarnog u prvom ekranu još 17 ekrana (Leadovi zaostali/rupe/sastanci/mapa(+panel), 6 podekrana Analitike, Instagram/Facebook komentari, napredak-prazno/pad, preklopi). Na telefonu `leadovi-tabela` gubi „Započni režim poziva" iz prvog ekrana. Pozitivno: **nijedan** ekran nema 2+ primarna.
- Dužina (1536): `uvoz-pregled` 6203 px (8,9 ekrana), `podesavanja` **4729 (6,8)**, `threads` 3848 (5,5), `youtube` 3439 (4,9), `uvoz-nereseno` 3373, `facebook` 3134 (4,5); telefon: `podesavanja` **8847 (10,5)**, `threads` 7548 (8,9), `uvoz-pregled` 6791, `youtube` 6565, `facebook` 6374. Medijana 1085 px (1,56) na 1536 i 1867 px (2,21) na 390.

**6. [P2] Previše izbora u prvom ekranu, a većinu nosi ljuska.**
- Dokaz (1536, vidljivi interaktivni u prvih 695 px): medijana **31**, od toga samo **7 u `main`** (ljuska 19 na Leadovima, 25–31 na ekranima sa biračem perioda u gornjoj traci). Najviše: `leadovi-tabela` **70** (51 u main), `leadovi-mapa-panel` 58, `leadovi-mapa` 51, `ljuska-meni` 50, `leadovi` 47, `facebook-komentari` 47. Podekrani Analitike: 27–36 izbora, od toga **0–5 u main** (Sticanje, Oglasi, Retencija: 0) — prvi ekran je hrom plus neinteraktivno zaglavlje. Telefon: medijana 15 (main 4).

**7. [P2] „Label in Name" (WCAG 2.5.3, A) na 112 od 116 merenja — 548 pogodaka.**
- Ljuska na svakom ekranu: meni korisnika `aria-label="Meni korisnika: …"` uz vidljive inicijale (`user-menu.tsx:68`, 89 merenja), link „Podešavanja" sa bedžom „1" (58), kartica napretka `aria-label="Napredak: Operativac, nivo 7"` (`system/player-card.tsx:120`, 55), „Komandna paleta" uz vidljivo „⌘K" (`app-shell.tsx:402`, 35), birač perioda `aria-label="7 dana"` uz vidljivo „7 d" (`date-range-picker.tsx:65`, 23). Ekrani: KPI pločice `"{label} — otvori detalj"` (`system/kpi-tile.tsx:229`), dugmad ocene u tabeli leadova „Fit (profil kupca): …" / „Intent …" uz vidljiv broj (`leadovi-tabela@390` 52).
- Posledica: glasovna kontrola („klikni 7 d") ne pogađa. Popravka: ime počinje vidljivim tekstom ili se `aria-label` izbaci tamo gde je vidljiv tekst dovoljan.

**8. [P2] Neimenovani `<select>` u pregledu uvoza (axe *critical*, WCAG 4.1.2 A).**
- Dokaz: **50 po strani** na `uvoz-pregled` (oba prikaza) — temperatura po redu, `leadovi/import-review-table.tsx:1362` i `:1387`, bez `<label>`, `aria-label`, `id`. Čitač ekrana kaže samo „combobox". Popravka: `aria-label={\`Temperatura: ${naziv}\`}`.

**9. [P2] ARIA greške u Oglasima i Atribuciji.**
- `ads/campaigns-table.tsx:419` i `ads/campaign-detail.tsx:320`: `<span aria-label={\`Status: ${row.status}\`}>` — zabranjen `aria-label` na `span` (6 po prikazu) i **sirov API status** („ACTIVE") kao tekst; redovi tabele kampanja su klikabilni `<tr>` sa fokusabilnim dugmadima unutra (`nested-interactive`, 4). `attribution/funnel-table.tsx:118`: `<TooltipTrigger>` sa samo `aria-hidden` ikonicom → dugme bez imena (*critical*, 2 na strani). `scrollable-region-focusable` na 7 merenja (tabele u `overflow-x-auto` na telefonu: podešavanja, oglasi-publike, atribucija, threads, youtube) — vodoravni klizač nedostupan tastaturi.

**10. [P3] Kutija u kutiji i debela leva ivica — protiv sopstvenog DESIGN.md.**
- Dokaz: pregledač — `nested-cards` **27 na Podešavanjima** (svaka integraciona sekcija: `rounded-xl` kartica sa `rounded-lg` uokvirenim kutijama i tabelama), 5 na Kontrolnoj tabli; `side-tab` **12** na Leadovi/Danas (`WorkCard`, `work-card.tsx:229`, isti i u panelima Zaostali/Sastanci/Rupe) + ivice redova u `leads-table.tsx:804/900/922/960`; u kodu 13× `border-l-[2-9]`. DESIGN.md: „nema kutije u kutiji", „Sekundarne grupe se odvajaju razdelnikom i razmakom, ne kutijom", „Ivica je uvek 1 px".

**Ostali deterministički nalazi (ispod praga top 10):**
- Jedini **vodoravni preliv** u 116 merenja: `instagram-komentari` na 390 (+58 px; segmentni filter `group/toggle-group` „Neodgovoreni / Svi / Sakriveni").
- **Dužina reda:** Leadovi `p.min-w-56.flex-1` ~157 znakova; Podešavanja do ~197 (`p.text-xs.leading-relaxed`, 1182 px širok).
- **Vidljivi h1 = 0** na 13 merenja na 1536 (sve Leadovi kartice, režim poziva, preklopi): h1 „Leadovi" je samo `sr-only`; naslov strane nosi traka jezičaka.
- **Boje po ekranu** (posle normalizacije): medijana 11 boja teksta i 26 boja pozadine na 1536; najviše `leadovi-tabela` 20 boja teksta, `analitika-posetioci` 53 i `analitika-retencija` 52 pozadine (toplotne mape).
- **Jezičci Podešavanja** brišu ceo upit adrese (`settings/page.tsx:144`) — vidi §8.
- **Prebačaj nagrade** (`--ease-reward`) živi na Kontrolnoj tabli kroz `mission-card.tsx:83`; namerno, nizak prioritet.

## 8. Šta nije uspelo, ograde i napomena za ostale recenzente

- **Snimak `bx-podesavanja-napredak-{1536x695,390x844}.jpg` je strana PRIJAVE, ne Podešavanja → Napredak.** Dokaz: `nocni-run/ux/bx-log.json` beleži naslov „Prijava · Enigma Digital", visinu tačno jednog ekrana i `[CONVEX FATAL ERROR] Couldn't parse deployment name placeholder`; moje merenje isto. Uzrok je u kodu: `app/(app)/[projekat]/settings/page.tsx:144` — `router.replace(\`${ka("/settings")}?tab=${sledeci}\`)` **prepisuje ceo upit**, pa klik na bilo koji jezičak Podešavanja gubi `?ux=1` (razvojni prikaz → prava ruta → prijava). U produkciji isti red briše svaki drugi parametar adrese (npr. povratne parametre OAuth povezivanja). Stanje „Napredak" sam izmerio direktnom adresom `/settings?tab=napredak&ux=1` (`podesavanja-napredak-direkt`); neispravni zapisi su izbačeni iz tabela.
- **Detektor u pregledaču:** sve prošlo (preflight 5/5, ubrizgavanje 5/5, server ugašen). Jedina ograda: moj drugi, strukturisani poziv posle iscrtanog sloja dao je lažne `text-occlusion` pogotke na sopstvenim natpisima — izbačeni (§2).
- **Merenje:** sve stavke izmerene; klikovi iz spiska svi pogođeni. Ograde: (a) „vidljivo" je računato na celoj strani (meta van ekrana u kliznoj traci se broji); (b) moja provera izuzetka razmaka (2.5.8) je pojednostavljena — axe `target-size` daje 4 pogotka (dugmad za sortiranje u zaglavlju tabele leadova 73×16 i 28×16, na `leadovi-tabela` i `-kolone`), moja aproksimacija 5 (`leadovi-mapa-panel`) i 0 na tabeli; istina je između, a ukupno je malo — na desktopu je problem gustina, ne 2.5.8; (c) broj boja je posle normalizacije u 8-bitni RGBA (nijanse koje se razlikuju u jednom bitu broje se odvojeno); (d) `label-content-name-mismatch` je strogo pravilo — deo pogodaka su brojevi u pločicama, ali glavni slučajevi su pravi (vidi §7-5); (e) sintetički podaci: dužine strana zavise od količine fiksnih podataka.
- **Prvo pokretanje merenja** sam prekinuo posle 23 strane (otkriven artefakt: `sr-only` veza „Preskoči na sadržaj" brojana je kao vidljiva meta 24×16) i ponovio ga u celini sa ispravkom; tabele su iz drugog, celog prolaza.
- Ništa nije pisano u ED; app server nije diran; mreža samo localhost i npm registar (axe-core).

## 9. Artefakti i reprodukcija (sve u `AUDIT/`)

- `b-tools/detect-cli.json` — sirov izlaz CLI detektora (100 nalaza); `b-tools/cli-locations.md` — sve lokacije po pravilu i fajlu.
- `b-tools/inject.cjs` + `b-tools/inject-results.json` — ubrizgavanje `detect.js` (konzola + strukturisani nalazi); `shots/B/inject-<ekran>-1536.jpg` — 5 snimaka sa slojem detektora; `b-tools/live-server-start.json` (port 8400, pid 6646; ugašen).
- `b-tools/measure.cjs` — merenja + axe po ekranu (`node measure.cjs [--only a,b] [--vp 1536x695] [--out f.jsonl]`); `b-tools/measure-results.jsonl` (116 zapisa) i `b-tools/extra.jsonl` (Podešavanja → Napredak, direktno).
- `b-tools/aggregate.cjs` → `b-tools/aggregate.md` (tabele) i `b-tools/axe-summary.json` (svi primeri čvorova po pravilu).
- `b-tools/contrast-check.md` — izlaz `scripts/contrast-check.mjs` (0/212).
- `b-tools/node_modules/axe-core` 4.14.0.
