# PROJEKTI — Enigma Digital za više projekata (noćni run, 24–25. 10. 2026)

> Izvor istine za ceo run. Svaki korak ga čita pre rada. Tehničke planove koraci pišu u
> `docs/projekti/planovi/<ID>.md`; ovaj fajl se ne prepisuje, ODLUKE koraka idu u `docs/PROJEKTI-PROGRESS.md`.
> Isti plan za čitanje (sa skicama) Jovan ima u dokumentu „Plan: više projekata u Enigma Digitalu“.

## 0. Šta pravimo, u jednoj rečenici
Enigma Digital postaje jedan panel za sve Jovanove projekte: hub sa biračem projekata gore levo i, po izboru, panel zaključan na jedan projekat na domenu tog projekta.

Danas kod već deli podatke po radnom prostoru (`workspaces`; 136 od 140 tabela ima `workspaceId`), ali korisnik može da bude član samo jednog prostora (`requireMembership` uzima `.first()`), front ne zna za izbor projekta, deo podešavanja je u env promenljivim, brend i nekoliko adresa su zakucani na Enigmu, a nekoliko javnih funkcija ne proverava pristup. Posle runa, na lokalnoj grani `projekti-run`, postoji kompletan multi-projekat: bezbednost, temelj pristupa, rute i domeni, birač, podešavanja i brend po projektu, kvote, leadovi po projektu, hub „Svi projekti“, Puls i prijem leadova sa sajta. Ništa nije pushovano ni deployovano.

## 1. Odluke (Jovan, 24. 10. 2026)

| # | Odluka |
|---|---|
| O1 | Jedna aplikacija za sve projekte. Hub je Jovanov glavni panel sa svim projektima; panel na domenu projekta dobija samo projekat za koji Jovan odluči, ne svaki. |
| O2 | Za sada se niko osim Jovana ne prijavljuje. Sve faze (0–5) idu u jedan run; način rada bira Claude. |
| O3 | ScanMe, i svaki sledeći projekat, dobija sve što ima Enigma: svi moduli. |
| O4 | Leadovi su odvojeni po projektu, uz predlog unakrsne prodaje između Jovanovih projekata. |
| O5 | `digital.enigmait.rs` ostaje panel samo za Enigmu; hub ide na poseban domen koji Jovan bira kasnije. |
| O6 | Modeli: Opus 5.5 glavni, Sonnet 5.5 za mehaničke prolaze, radnici (subagenti) Sonnet 5.5 i Haiku 5.5. |
| O7 | Bezbednosne rupe u javnim funkcijama se zatvaraju prve. |

**Predlozi (Claude, čekaju potvrdu)** — run ih sledi, izveštaj ih ponovo navodi:

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | U kodu i tabelama ostaje `workspace`/`workspaceId`; u interfejsu, porukama i dokumentima kažemo „projekat“. | Nula preimenovanja 462 polja; manje rizika. | ceo kod |
| P2 | `workspaceId` je OBAVEZAN argument svake javne funkcije nad podacima projekta, bez prelaznog opcionog režima. | TypeScript tada hvata svako mesto koje zaboravi projekat; opcioni argument sa padom na Enigmu bi tiho mešao projekte. Cena: par minuta greške pri deployu (Convex pa odmah merge), a panel koristi samo Jovan. | `convex/lib/projekat.ts`, svi moduli |
| P3 | Vlasnik platforme = korisnik koji je `owner` u bar jednom internom projektu (danas samo Jovan). Bez nove tabele. | Nema migracije ni ručnog koraka. | `convex/lib/projekat.ts` |
| P4 | Osnivački projekat = najstariji red u `workspaces` (danas `enigma-it`). Samo on nasleđuje env vrednosti dok ih Jovan ne upiše u podešavanja. | Nema migracije, nema zakucanog sluga. | `convex/lib/podesavanja.ts` |
| P5 | Nepoznat domen = hub (prijava i članstvo i dalje važe). Mapa domen → projekat je u bazi i keš u proxy-ju 60 s; `localhost`, `127.0.0.1` i `*.localhost` su uvek hub, bez upita; greška upita = hub. `digital.enigmait.rs` se mapira u podešavanjima posle deploya. | Bez zakucanih domena; razvoj radi bez Convex-a. | `proxy.ts`, `lib/rutiranje.ts` |
| P6 | OAuth povratna adresa dolazi iz env `OAUTH_CALLBACK_ORIGIN` (Convex i Vercel), bez podrazumevane vrednosti u kodu. `oauthStates` čuva i adresu povratka, proverenu protiv domena projekta i huba. | Jedna registrovana adresa kod Meta/Google za sve projekte; nema open redirect-a. | `convex/lib/threadsShared.ts`, `convex/lib/gbpApi.ts`, OAuth akcije, `app/api/auth/callback/*` |
| P7 | Novi paketi: `convex-helpers` (runtime, MIT, od Convex-a) za omotače; dev: `vitest@4`, `convex-test`, `@edge-runtime/vm@5`. Ništa drugo bez ODLUKE. | Omotači sa ispravnim tipovima; testovi izolacije bez deploya. | `package.json` |
| P8 | Rezervisani slugovi: `api`, `_next`, `login`, `logout`, `privacy`, `cookies`, `pozivnica`, `deletion-status`, `r`, `dev-ux`, `novi`, `svi`, `hub`, `admin`, `static`, `public` i imena ekrana (`ads`, `analytics`, `atribucija`, `facebook`, `instagram`, `leadovi`, `napredak`, `novosti`, `openreply`, `rules`, `settings`, `threads`, `youtube`). | Stare adrese u hubu moraju da se preusmere, a projekat ne sme da se zove kao ekran. | `lib/rutiranje.ts`, `convex/projekti.ts` |
| P9 | Uloge po projektu: `owner`, `urednik` (nova), `client_viewer` (postojeće ime). | Tim i klijenti kasnije bez nove šeme. | `convex/schema.ts` |
| P10 | Boja projekta je nova, peta uloga boje (identitet): samo birač, logo, ekran prijave i tanka traka na vrhu ljuske. Moduli zadržavaju svoje boje. | Postojeći sistem boja ostaje čitljiv. | ljuska, `CLAUDE.md` § Design system |
| P11 | Zajedničke kvote imaju jedan globalni brojač (YouTube po Google Cloud projektu, Google Ads po developer tokenu, Meta procenat aplikacije) i pravednu rezervu po projektu. | Danas bi svaki projekat mislio da ima ceo budžet. | `convex/lib/*Quota.ts`, `metaRateLimit.ts` |
| P12 | Napredak je jedan za korisnika preko svih projekata (XP, niz, nivo), misije dana iz svih projekata. | Jovan radi sve projekte; jedan niz motiviše. | `convex/napredak.ts`, `convex/lib/napredak.ts` |
| P13 | Unakrsni leadovi samo između internih projekata: oznaka i dugme „Kopiraj u <projekat>“ sa poreklom, bez automatskog spajanja. | O4; podaci klijenata se nikad ne mešaju. | leadovi |
| P14 | ScanMe repo (scanme.rs) se u ovom runu NE dira. Panel strana je spremna, a `docs/projekti/SCANME-INTEGRACIJA.md` daje tačan ugovor i primer koda. | GA4 i piksel na javnom sajtu traže baner za kolačiće, a to je Jovanova odluka. | — |
| P15 | Mozak projekta: forma u podešavanjima (ponuda, ICP opis, ton, zabrane, skripte) i čitanje preko ingest tokena projekta za skillove. `marketing-brain/` ostaje fajl dok ga Jovan ne prenese. | Mali korak, koristan za generate-leads i sadržaj. | podešavanja, `convex/http.ts` |
| P16 | Ideje za klijente (odobravanje objava, mesečni izveštaj) nisu u ovom runu; uloge za njih postoje (P9). | O2: niko drugi se ne prijavljuje. | — |

## 2. Obim
**Radimo:** bezbednost javnih funkcija; više članstava po korisniku; omotači pristupa za sve javne Convex funkcije; rute `/[projekat]/…`, hub i paneli po domenu; birač projekta; podešavanja, brend i domeni po projektu; env vrednosti projekta u bazi; OAuth povratak na panel; globalne kvote; pozivnice i uloge po projektu; ICP šabloni (Web agencija, QR za lokale); hub „Svi projekti“, zdravlje veza, napredak preko projekata; unakrsni leadovi; Puls; prijem leadova sa sajta; uputstvo za ScanMe.

**Ne diramo:** ScanMe repo; produkciju (deploy, env, Convex prod ni dev push); tok prijave lozinkom i kodom (osim generalizacije pozivnica); pravne strane (`privacy`, `cookies`, `deletion-status`) osim imena projekta gde ga prikazuju; postojeće OAuth povratne putanje (`/api/auth/callback/*` ostaju iste); Meta/Google konzole; `marketing-brain/` (samo čitanje); stari runovi (`nocni-run/`, `overnight/`), `_to_delete/`, `content/`, tajni fajlovi u korenu (`*.json` ključevi, `env.personal.txt`, `.env*`).

## 3. Pojmovi
- **Projekat** = red u `workspaces` (P1).
- **Hub** = režim bez zaključanog projekta: `/` je „Svi projekti“, projekti su na `/<slug>/…`, birač je vidljiv.
- **Panel** = domen zaključan na jedan projekat: `/leadovi` interno ide na `/<slug>/leadovi`; bez birača; brend projekta.
- **Vlasnik platforme** (P3), **osnivački projekat** (P4), **interni** i **klijentski** projekat (`workspaces.vrsta`).

## 4. Model podataka (Convex)
Sve nove kolone su opcione (postojeći redovi ostaju validni bez migracije).
- `workspaces` += `vrsta?: "interni" | "klijent"` (bez vrednosti = interni), `brend?: { kratkoIme?, boja? (#rrggbb), logoStorageId?, faviconStorageId? }`, `sajtovi?: string[]`, `podesavanja?: { pikselId?, budzet?: {...}, novostiRevalidateUrl?, kratkiLinkoviBaza?, posiljalacIme?, pulsUrl?, vremenskaZona?, valuta? }`, `moduli?: string[]` (bez vrednosti = svi), `mozak?: { ponuda?, icpOpis?, ton?, zabrane?, skripte? }`, `arhiviran?`, `redosled?`, `createdBy?`.
- `members`: uloga += `"urednik"`; indeks `by_user_workspace` [`userId`, `workspaceId`].
- `projekatDomeni`: `{ host (mala slova, bez porta), workspaceId, createdAt }`, indeksi `by_host`, `by_workspace`; jedan host = jedan projekat.
- `projekatTajne`: `{ workspaceId, kljuc ("meta_capi_token" | "novosti_revalidate_secret" | "puls_token"), sifrovano, updatedAt }`, indeks `by_workspace_kljuc`; šifruje `convex/lib/crypto.ts`; upit vraća samo „postavljeno“.
- `globalneKvote`: `{ kljuc ("youtube" | "google_ads" | "meta_app"), datum, ... }` (C10 plan precizira polja).
- `pulsSnimci`: `{ workspaceId, at, metrike: Record<string, number>, oznake?, greska? }`, indeks `by_workspace_at`.
- `oauthStates` += `povratak?: string`.
- Svaka nova tabela sa `workspaceId` mora u mapu brisanja (`convex/lib/purgeMap.ts`) ili u izuzetke koje `scripts/verify-purge-coverage.ts` traži, sa razlogom; `npm run build` to proverava.

## 5. Pristup (bezbednost)
- **Omotači** u `convex/lib/projekat.ts` (preko `convex-helpers` `customQuery`/`customMutation`/`customAction`):
  - `projekatQuery`, `projekatMutation`, `projekatAction`: dodaju argument `workspaceId: v.id("workspaces")`, proveravaju prijavu i članstvo (indeks `by_user_workspace`), daju `ctx.projekat = { userId, workspaceId, uloga }`. Opcija minimalne uloge (`"urednik"` za izmene, `"owner"` za veze, brisanje, članove i podešavanja). `client_viewer` nikad ne menja podatke.
  - Akcije proveravaju članstvo kroz interni upit (`ctx.runQuery`), pa dalje rade sa `ctx.projekat`.
  - `prijavljenQuery`/`prijavljenMutation` za funkcije bez projekta (npr. spisak mojih projekata); `platformaMutation` za vlasnika platforme (npr. novi projekat).
- **Javne bez prijave** samo uz komentar `// javno: <razlog>` u liniji iznad definicije: `postsPublic.*`, `invitesStore.getInvite`, `threadsStore.getDeletionStatus`, `projekti.razresiDomen`, pomoćne funkcije registracije.
- **Čuvar** `scripts/verify-pristup.ts` (provera runa, pokreće se kao `node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts`, plus npm skripta `verify:pristup`): pada kad javna `query`/`mutation`/`action` nije napravljena omotačem i nema `// javno:`. C01 pravi blažu verziju (prihvata i postojeće provere prijave), C07 je pooštrava.
- Interne funkcije, HTTP akcije (webhook-ovi) i cron ostaju: prostor nose eksplicitno ili ga nalaze po ID-ju naloga.
- `requireMembership`, `requireOwner` i `workspaces.currentContext` (logika „prvo članstvo“) nestaju do kraja C07.

## 6. Rute i domeni
- **Struktura:** sve stranice iz `app/(app)/` sele se u `app/(app)/[projekat]/…`; `app/(app)/[projekat]/page.tsx` je kontrolna tabla projekta; `app/(app)/page.tsx` postaje „Svi projekti“ (hub); `app/(app)/novi/page.tsx` je čarobnjak. `login`, `privacy`, `cookies`, `pozivnica`, `deletion-status`, `dev-ux`, `api` ostaju globalni.
- **Odluka rutiranja** je čista funkcija u `lib/rutiranje.ts` sa testovima; `proxy.ts` je samo primenjuje:
  1. Globalne putanje se ne diraju: `/api/*`, `/_next/*`, `/login`, `/privacy`, `/cookies`, `/pozivnica/*`, `/deletion-status`, `/r/*`, `/dev-ux/*`, statički fajlovi.
  2. Panel domen (slug S): `/` → rewrite `/S`; `/X…` → rewrite `/S/X…`; `/S` ili `/S/…` → redirect na putanju bez `/S` (kanonski oblik).
  3. Hub: `/` ostaje; prvi segment je ime ekrana (P8) → redirect na `/<projekat iz kolačića ep_projekat>/…`, a bez kolačića na `/`; ostalo prolazi, a layout `[projekat]` proverava članstvo (nije član ili ne postoji → 404).
  4. `localhost`, `127.0.0.1`, `*.localhost` = hub bez upita; greška upita = hub (P5).
- **Mapa domena:** `projekatDomeni`; javni upit `projekti.razresiDomen({ host })` → `{ slug } | null`; proxy ga kešira 60 s po hostu.
- Proxy prosleđuje zaglavlja `x-panel-rezim` (`hub` | `panel`) i `x-panel-projekat` (slug) koja čita server layout.
- **Ostaje kako jeste:** preusmerenje neprijavljenih na `/login` (sa `ig_code`), izuzeci u `config.matcher`, `?ux=1` razvojni prikaz (radi i sa prefiksom projekta), `/r/:slug` prepisivanje u `next.config.ts`.
- **Front:** `usePathname()` u hubu vidi `/<slug>/…`, u panelu `/…`. Pomoćnici `useEkranPutanja()` (putanja bez sluga) i `useProjekatHref()` / `<ProjekatLink>` važe za sve interne linkove i `router.push`/`replace`; aktivna stavka navigacije radi u oba režima.
- **Prijava je po domenu** (kolačić po hostu). Ekran prijave na panel domenu pokazuje brend projekta.

## 7. Front: projekat u ljusci
- `ProjekatProvider` zamenjuje `WorkspaceProvider`: slug iz rute → `projekti.mojProjekat({ slug })` → `{ workspace, uloga, brend, moduli, rezim }`.
- Hookovi `useProjekat()`, `useProjekatQuery`, `useProjekatMutation`, `useProjekatAction` sami ubacuju `workspaceId`; tipovi ne dozvoljavaju pozivaocu da ga izostavi ili pošalje drugi.
- Do C08 provider uzima prvi projekat korisnika kad slug ne postoji (samo na frontu, nikad u backendu); od C08 slug je uvek tu i taj rezervni put se briše.
- **Birač projekta** u bočnoj traci umesto teksta „Enigma“: pretraga, logo (ili inicijal u boji projekta), tačka stanja veza (zelena, žuta, crvena), broj „šta me čeka“, pa „Svi projekti“, „Novi projekat“, „Podešavanja projekta“. Promena projekta čuva ekran (`/enigma-it/analytics` → `/scanme/analytics`); ako modul nije uključen, ide na kontrolnu tablu. Ctrl+K paleta ima „Prebaci na <projekat>“. U panelu nema birača, samo logo i ime. Na telefonu birač je u gornjoj traci.
- **Zaštita od pogrešnog naloga:** dijalozi objave (Instagram, Threads, YouTube), poruka (OpenReply, inbox), oglasa i budžeta pokazuju logo projekta i nalog („Objavljuješ kao …“); potvrda nosi ime projekta.
- **Boja projekta** (P10): `--projekat` i izvedene nijanse iz `brend.boja`; tekst na njoj mora da prođe `node scripts/contrast-check.mjs` (ako ne prolazi, automatski tamni ili svetli tekst).

## 8. Podešavanja projekta
- **Sekcije** u `/[projekat]/settings`: Projekat (ime, kratko ime, slug samo za čitanje, boja, logo, favicon, vrsta), Domeni (panel domeni; samo vlasnik platforme), Sajtovi (praćeni domeni), Integracije sajta (Meta piksel, CAPI token, novosti: revalidate URL i tajna, baza kratkih linkova, Puls URL i token), Budžetske granice, Moduli (podrazumevano svi), Mozak projekta (P15), Članovi i pozivnice (postojeće, po projektu).
- **Env → podešavanja:**

| Danas (env) | Postaje |
|---|---|
| `TRACKED_DOMAINS` | `workspaces.sajtovi` |
| `META_PIXEL_ID` | `podesavanja.pikselId` |
| `META_CAPI_TOKEN` | `projekatTajne` „meta_capi_token“ |
| `META_ADS_MAX_DAILY_BUDGET`, `GOOGLE_ADS_MAX_DAILY_BUDGET`, `BUDGET_MIN(_EUR)`, `BUDGET_MAX(_EUR)`, `BUDGET_LIMIT_CURRENCY` | `podesavanja.budzet` |
| `NOVOSTI_REVALIDATE_URL`, `NOVOSTI_REVALIDATE_SECRET` | `podesavanja.novostiRevalidateUrl` + tajna |
| `OR_SHORT_LINK_BASE_URL` | `podesavanja.kratkiLinkoviBaza` |
| `EMAIL_FROM` (ime) | `podesavanja.posiljalacIme` (adresa ostaje globalna) |

- **Čitanje:** jedna funkcija (npr. `podesavanjaProjekta(ctx, workspaceId)`) vraća vrednost projekta; ako je nema i projekat je osnivački (P4), env; inače „nije podešeno“ (funkcija to jasno prikazuje, ne pada i ne uzima tuđu vrednost).
- **Ostaju globalni:** ključevi aplikacija (Meta, Instagram, Threads, YouTube, Google Business), `GOOGLE_ADS_DEVELOPER_TOKEN`, `RESEND_API_KEY`, `CREDENTIALS_ENCRYPTION_KEY`, `LINK_HASH_SALT`, webhook tokeni, `ALLOWED_EMAILS`, `ADMIN_SETUP_CODE`.
- **OAuth** (P6): sva mesta koja grade `redirect_uri` čitaju `OAUTH_CALLBACK_ORIGIN`; nedostaje → jasna greška u podešavanjima, ne pad stranice.
- **Pozivnice:** rade za svaki projekat (bez `WORKSPACE_SLUG`); link ide na primarni panel domen projekta ili na adresu sa koje je pozivnica napravljena; postojeći korisnik prihvata pozivnicu posle prijave i dobija dodatno članstvo.

## 9. Kvote (P11)
- `globalneKvote` po ključu i danu: `youtube` (10.000 jedinica i 100 uploada dnevno po Google Cloud projektu, `convex/lib/ytQuota.ts`), `google_ads` (operacije developer tokena po nivou iz `GOOGLE_ADS_ACCESS_LEVEL`: Explorer 2.880, Basic 15.000; `convex/lib/googleAdsQuota.ts`), `meta_app` (procenat aplikacije iz zaglavlja; `convex/lib/metaRateLimit.ts`).
- Potrošnja se upisuje globalno i po projektu; kapija gleda globalni ostatak i rezervu po projektu (ostatak podeljen na aktivne projekte sa tom vezom, uz postojeću rezervu za sinhronizaciju).
- Cron poslovi koji prolaze kroz sve projekte rade jedan projekat za drugim, bez preklapanja (postojeće `withCronLock`).

## 10. Leadovi po projektu
- Leadovi, niše, ICP pravila i ingest tokeni su već po prostoru i ostaju odvojeni (O4).
- **Šabloni** ICP-a i niša: „Web agencija“ (sadašnja pravila iz `convex/leadScoringStore.ts`) i „QR za lokale“ (ScanMe: kafići, restorani, hoteli, saloni, auto saloni, izlagači na sajmovima; signali koje sistem već ume, plus najviše 3 nova sa jasnim izvorom podataka). Novi projekat bira šablon ili kreće prazan.
- `tools/generate-leads`: radi po projektu preko ingest tokena tog projekta; README to objašnjava. U runu se ništa od toga ne pokreće.
- **Unakrsna prodaja** (P13): kad firma iz jednog internog projekta postoji ili odgovara drugom internom projektu (isti domen, telefon, ili ime i grad), profil firme pokazuje oznaku i dugme „Kopiraj u <projekat>“; kopija nosi poreklo.

## 11. Hub i veze među projektima
- **„Svi projekti“** (`/` u hubu): red po projektu (logo, ime, posete, novi leadovi, pratioci, potrošnja oglasa, neodgovorene poruke za izabrani period) i zbirno „šta me čeka“ sa oznakom projekta; najviše 20 projekata, samo agregati preko indeksa. Nepoznato je „—“, nikad 0.
- **Zdravlje veza:** po projektu i vezi poslednja sinhronizacija, greške, istek tokena, kvote.
- **Napredak** (P12): XP, niz i nivo preko svih projekata korisnika; misije dana iz svih projekata.
- **Puls:** projekat sa `podesavanja.pulsUrl` i tajnom „puls_token“; cron na 15 minuta šalje `GET` sa `Authorization: Bearer <token>` i čita `{ "vreme": "<ISO>", "metrike": { "<kljuc>": <broj> }, "oznake"?: { "<kljuc>": "<naziv>" } }` (najviše 20 metrika, odgovor do 64 KB, istek 10 s); čuva u `pulsSnimci`; kontrolna tabla projekta ima karticu „Poslovanje“.
- **Leadovi sa sajta:** `POST <CONVEX_SITE_URL>/projekti/lead` sa `Authorization: Bearer <ingest token projekta>` i telom `{ ime?, email?, telefon?, firma?, poruka?, stranica?, utm?, eventId? }`; upis u `leadInbound` (izvor „website“) projekta kome pripada token i CAPI „Lead“ na piksel tog projekta (deduplikacija po `eventId`); ograničenje učestalosti po tokenu; CORS samo za `sajtovi` projekta.
- **`docs/projekti/SCANME-INTEGRACIJA.md`:** tačan ugovor za ScanMe repo (forma → `/projekti/lead`, Puls endpoint koji ScanMe izlaže, env promenljive, primer koda). ScanMe repo se ne dira (P14).

## 12. Tehnika i granice
- **Stek:** Next.js 16 (NIJE Next iz tvog znanja: pre koda pročitaj odgovarajući vodič u `node_modules/next/dist/docs/` — proxy, rewrites, dinamičke rute, `params` kao Promise), React 19, Convex 1.44 (pre Convex koda `convex/_generated/ai/guidelines.md`), Tailwind 4, shadcn `base-nova`, GSAP, Recharts.
- **Paketi:** samo P7.
- **Testovi:** `npx vitest run`. Convex testovi sa `convex-test` u `edge-runtime` okruženju, čiste funkcije (rutiranje, podešavanja, kvote) u `node` okruženju; konfiguracija u `vitest.config.mts`.
- **Razvojni prikaz:** `/<ruta>?ux=1` (`app/dev-ux`, `fake-convex.ts`, fiksture) radi bez Convex-a i bez prijave; svaka nova površina dobija fiksture sa bar dva projekta („Enigma IT“ i „ScanMe“).
- **Ne dirati:** vidi §2.

## 13. Koraci
Tačne vrednosti su u `.nocni-run/projekti/steps.json`, promptovi u `.nocni-run/projekti/prompts/<ID>.md`.

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| C01 | Bezbednost: zakrpe javnih funkcija i čuvar pristupa | Opus 5.5 | xhigh | goal | nova |
| C02 | Arhitektura projekata (plan) | Opus 5.5 | max | plan | nova |
| C03 | Temelj: šema, omotači, API projekata, testovi | Opus 5.5 | xhigh | goal | ista (C02) |
| C04 | Prelazak 1: analitika, atribucija, Instagram, Facebook | Opus 5.5 | xhigh | goal | nova |
| C05 | Prelazak 2: Threads, YouTube, OpenReply | Opus 5.5 | xhigh | goal | nova |
| C06 | Prelazak 3: leadovi, novosti, napredak, obaveštenja | Opus 5.5 | xhigh | goal | nova |
| C07 | Prelazak 4: oglasi, pravila, veze, članovi; strogi čuvar | Opus 5.5 | xhigh | goal | nova |
| C08 | Rute /[projekat], hub i paneli po domenu | Opus 5.5 | xhigh | goal | nova |
| C09 | Birač projekta i ljuska | Opus 5.5 | xhigh | goal | nova |
| C10 | Plan: podešavanja, brend, env, OAuth, kvote | Opus 5.5 | high | plan | nova |
| C11 | Podešavanja i brend projekta, čarobnjak | Opus 5.5 | xhigh | goal | ista (C10) |
| C12 | Env u podešavanja, tajne, OAuth povratak | Opus 5.5 | xhigh | goal | nova |
| C13 | Globalne kvote, pozivnice i uloge | Opus 5.5 | xhigh | goal | nova |
| C14 | Leadovi po projektu: ICP šabloni, ScanMe, mozak | Opus 5.5 | high | goal | nova |
| C15 | Plan: hub i veze među projektima | Opus 5.5 | high | plan | nova |
| C16 | Hub „Svi projekti“, zdravlje veza, napredak | Opus 5.5 | xhigh | goal | ista (C15) |
| C17 | Unakrsni leadovi, Puls, leadovi sa sajta, ScanMe uputstvo | Opus 5.5 | xhigh | goal | nova |
| C18 | Prolaz: prazna stanja, telefon, pristupačnost | Sonnet 5.5 | high | goal | nova |
| C19 | Revizija: izolacija, bezbednost, regresije | Opus 5.5 | max | goal | nova |
| C20 | Završni izveštaj | Opus 5.5 | high | auto | nova |

## 14. Kraj runa
- `docs/PROJEKTI-REPORT.md`: šta je urađeno, šta nije, BLOKADE, šta Jovan ručno proverava, deploy koraci.
- Snimci glavnih novih površina u `docs/projekti/snimci/`.
- **Deploy (radi Jovan, ne run):** izvoz baze → env `OAUTH_CALLBACK_ORIGIN=https://digital.enigmait.rs` u Convex i Vercel → `npm run deploy:convex` → odmah merge `projekti-run` u `main` i push (P2: par minuta greške dok Vercel ne završi) → u hubu: Podešavanja projekta Enigma IT → Domeni → `digital.enigmait.rs` → novi projekat ScanMe (šablon „QR za lokale“) → Vercel domeni (hub, po želji `digital.scanme.rs`) i CNAME → povezivanje ScanMe naloga.
