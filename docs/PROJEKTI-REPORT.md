# PROJEKTI — završni izveštaj noćnog runa (24–25. 10. 2026)

Grana `projekti-run`, lokalno. Ništa nije pushovano ni deployovano. Plan: `docs/PROJEKTI-PLAN.md`. Detalji po koraku: `docs/PROJEKTI-PROGRESS.md`.

## 0. Ukratko

- Panel radi za više projekata. Svaka javna Convex funkcija (372) ide kroz omotač koji proverava članstvo u tačno tom projektu, ili ima oznaku `// javno:` sa razlogom (15). Čuvar to proverava pri svakoj proveri.
- Gotovo je sve iz plana: rute `/<projekat>/…`, hub „Svi projekti“, panel po domenu, birač projekta, podešavanja i brend po projektu, env vrednosti u bazi, OAuth povratak na pravi projekat, zajedničke kvote, pozivnice i uloge, šabloni leadova, unakrsni leadovi, Puls, forma sa sajta, uputstvo za ScanMe.
- Testova pre runa nije bilo. Sada ih ima 947 u 52 fajla i svi prolaze. Prolaze i typecheck, lint, build i 14 starih regresionih provera.
- Run nije video pravu prijavu ni pravu bazu. Sve je provereno testovima i kroz razvojni prikaz sa lažnim podacima.
- Dve BLOKADE traže tvoju odluku (YouTube token za urednika, isti YouTube kanal u dva projekta). Pre deploya obavezno postavi `OAUTH_CALLBACK_ORIGIN` u Convex prod; bez nje nijedan kanal ne može da se poveže.
- Deploy ima par minuta greške (stari front, nov backend). Zato ide Convex pa odmah merge i push.

## 1. Kako da pregledaš granu

```bash
git log --oneline main..projekti-run        # 21 commit: zatečene izmene, start, C01–C19, (C20 posle ovog koraka)
git diff --stat main...projekti-run         # 586 fajlova, +55.059 / −9.253 (do C19)
```

- Prvi commit na grani (`9c3406c chore: zatečene lokalne izmene pre noćnog runa`) nosi tvoje necommitovane izmene od pre runa. Pogledaj ga posebno.
- `main` je predak grane, pa je merge fast-forward.
- Paketi: dodati su `convex-helpers` i (dev) `vitest`, `convex-test`, `@edge-runtime/vm`. `npm install` sa npm 10.9.8 puca na poznatoj grešci; radi `npx npm@11 install`.

Lokalno:

1. `npx convex dev` — dev baza dobija novu šemu (tabele `projekatDomeni`, `projekatTajne`, `globalneKvote`, `pulsSnimci`, `projekatUploadi` i nove indekse) i sve funkcije. Ovo menja dev deployment.
2. `npm run dev` i prijavi se.
3. Šta da otvoriš prvo:
   - `/` → hub „Svi projekti“ (localhost je uvek hub);
   - klik na Enigma IT → `/enigma-it`, pa birač gore levo;
   - `/enigma-it/settings?tab=projekat` (boja, logo, domeni, sajtovi, moduli) i `?tab=sajt` (piksel, CAPI, novosti, Puls);
   - `/novi` (čarobnjak);
   - profil jedne firme u Leadovima (oznake „Postoji u projektu …“).
4. Bez prijave i baze: `npx next dev -p 3105` pa `http://localhost:3105/?ux=1&rezim=hub`, `/enigma-it/…?ux=1`, `/scanme/…?ux=1`. Dodaci: `&uloga=urednik|client_viewer`, `&projekata=1|22`, `&panel=scanme`, `/pozivnica-ux?ux=1&stanje=nov|postojeci|prijavljen|druga`, `/login?ux=1&panel=scanme`.

U dev bazi postoje dva reda sa slugom `enigma-it` (C19). Osnivački projekat je najstariji red; pogledaj koji je to pre nego što poveruješ podešavanjima.

## 2. Šta je urađeno, po oblasti

| Oblast | Šta | Koraci | Snimci (`docs/projekti/snimci/`) |
|---|---|---|---|
| Bezbednost | Zakrpe javnih funkcija koje nisu proveravale pristup (pravila, Google oglasi, Meta token, leadovi, uploadi); Threads brisanje i deautorizacija samo uz Meta potpis; čuvar pristupa (AST) u `npm run verify:pristup` | C01, C07 | C07-pristup-1440 |
| Temelj | Šema (opciona polja, `members.by_user_workspace`, nove tabele), omotači `projekat*`/`prijavljen*`/`platforma*` u `convex/lib/projekat.ts`, API `convex/projekti.ts`, `ProjekatProvider` i hookovi | C02, C03 | — |
| Prelazak modula | Svih 337 starih javnih funkcija prešlo na omotače; front zove samo kroz `useProjekat*`; „prvo članstvo“ (`requireMembership`, `currentContext`, `WorkspaceProvider`) obrisano; strogi čuvar fronta i backenda | C04–C07 | C04-*, C05-*, C06-*, C07-* |
| Rute i domeni | `app/(app)/[projekat]/…`, hub na `/`, panel po domenu (`projekatDomeni`, keš 60 s u `proxy.ts`), `odluciRutu` kao čista funkcija, stare adrese preusmeravaju | C08 | C08-* |
| Ljuska | Birač projekta (pretraga, tačka zdravlja, broj „čeka“), prelazak čuva ekran, ⌘K „Prebaci na …“, boja projekta kao peta uloga, red „Objavljuješ kao … · projekat“ u 20 dijaloga | C09 | C09-*, C20-birac-1440 |
| Podešavanja i brend | Jezičci Projekat i Mozak, logo i favicon, domeni panela, sajtovi, moduli (isključen modul nestaje iz navigacije), prijava sa brendom po domenu, naslov i ikonica po projektu, čarobnjak `/novi` | C10, C11 | C11-*, C20-podesavanja-projekat-1440, C20-carobnjak-390 |
| Env u bazi i OAuth | `podesavanjaProjekta` (vrednost projekta, pa env samo za osnivački), tajne šifrovane u `projekatTajne`, jezičak „Sajt i oglasi“, OAuth `redirect_uri` iz `OAUTH_CALLBACK_ORIGIN` i povratak na panel projekta, isti nalog u dva projekta (IG/FB/Threads odbijeni, ostali upozorenje) | C12 | C12-*, C20-sajt-i-oglasi-390 |
| Kvote, pozivnice, uloge | `globalneKvote` (YouTube, Google Ads, Meta) sa rezervom po projektu, cron projekat po projekat; pozivnice po projektu sa ulogom, „Prihvati poziv u …“; `useMoze`/`<SamoZa>` u UI-ju | C13 | C13-* |
| Leadovi po projektu | Šabloni „Web agencija“, „QR za lokale“, „Prazno“; signal `ciljna_nisa`; mozak projekta preko `GET /projekti/mozak` | C14 | C14-* |
| Hub | „Svi projekti“ sa redom po projektu i „Čeka te“, zdravlje veza po provajderu, napredak preko svih projekata (P12) sa lenjim prelaskom | C15, C16 | C16-*, C20-svi-projekti-1440/390, C20-kontrolna-tabla-1440 |
| Veze među projektima | Unakrsni leadovi („Postoji u / Odgovara projektu“, „Kopiraj u …“), Puls (cron 15 min, kartica „Poslovanje“), `POST /projekti/lead` (forma sa sajta, CAPI „Lead“), `docs/projekti/SCANME-INTEGRACIJA.md` | C17 | C17-*, C20-profil-unakrsno-1440 |
| Prolaz | Prazna stanja, 44 px na dodir, redosled Taba, naslovi, „radni prostor“ → „projekat“ u prikazu | C18 | C18-* |
| Revizija | 8 pregleda celog diff-a; 13 srednjih i 10 niskih nalaza popravljeno (fajlovi kao dokaz vlasništva, `ig_code` CSRF, webhook-ovi i opoziv u dva projekta, mejl pravila, cron pravila…) | C19 | — |
| Izveštaj | Ovaj fajl, provere, 8 završnih snimaka | C20 | C20-* |

## 3. Šta nije urađeno ili je delimično

- **Ništa nije viđeno sa pravom prijavom ni pravom bazom.** Pravila runa zabranjuju `convex dev`/`deploy`. Sve što zavisi od Mete, Google-a, Resend-a i prave sesije provereno je samo testovima sa lažnim odgovorima.
- **Dve BLOKADE iz C19** (odeljak 4) nisu rešene.
- **Napredak:** nema „doprinosa po projektu“ (`profil.poProjektu`), jer događaji ne nose projekat. Napomena o webhook greškama nije u hubu, ostala je na kartici Integracije (C16).
- **Viđeno samo u kodu, ne na ekranu:** red „Objavljuješ kao …“ u odgovoru na IG komentar, odgovoru na spominjanje, poruci u inbox razgovoru, meniju profila OpenReply-a i trećem koraku nove kampanje (nema fikstura, C09); prazan hub sa 0 projekata (C18); traka „Povezivanje kanala nije podešeno“ (C12).
- **Uloge u UI-ju, nepokriveno (C13):** `analytics/realtime-dashboard.tsx`, `notifications-bell.tsx`, `napredak/*`, `hub/novi-projekat.tsx` i dugmad u `ga4-configuration.tsx`. Backend ih i dalje štiti; posmatrač samo vidi dugme koje ne radi. Danas nema posmatrača.
- **Dugme 44 px na dodir** imaju samo nove površine i zajedničke trake jezičaka. Tabela leadova i analitika nisu prođene (C18).
- **Razvojni prikaz ScanMe-a** je „prazan nalog“ sa delom Enigminih zbirnih brojki, ne pravi skup podataka (C08).
- **Svesno ostavljeno:** stari indeksi zvona `notificationState.by_user_kljuc` i `by_user` (bez čitaoca); ime `useIsWorkspaceOwner`; ručni upis `connections.save` za OAuth kanale bez provere tokena (C19 #26); ostali niski nalazi C19 #27–#38 sa razlogom u progress-u.
- **Van obima po planu:** ScanMe repo (P14), prenos `marketing-brain/` u Mozak (P15), ideje za klijente (P16), izbor domena huba (O5), deploy.
- **`tools/generate-leads/lib/nise.mjs`** nema nove niše `kafici`, `hoteli`, `auto-saloni`, `izlagaci-na-sajmovima`; skill za njih pita za upite (C14).

## 4. BLOKADE (traže tebe)

1. **YouTube upload token (srednje, C19).** `ytAuth.issueUploadToken` daje uredniku pun Google token kanala na sat vremena. Urednik tako može da obriše video mimo provere vlasnika i da troši kvotu mimo brojača. Prava popravka: backend otvara resumable sesiju i pregledaču vraća samo adresu za bajtove. To menja tok slanja videa i mora se probati uživo sa Google-om (CORS). Do tada ulogu urednika u projektu sa YouTube-om daj samo nekome kome veruješ sa tim kanalom.
2. **Isti YouTube kanal u dva projekta (srednje, C19).** Danas je dozvoljen uz upozorenje (E3). Automatizacije komentara u oba projekta bi odgovarale dvaput. Izaberi: (a) odbijati ga kao Instagram, Facebook i Threads (jedna linija u `ODBIJA_DRUGDE` u `convex/lib/vezaDrugde.ts` i ispravka testa C12), ili (b) zadržati i automatizacije uključivati samo u jednom projektu.
3. **Pre deploya, ručno (nije blokada koda, ali bez toga deploy ide pogrešno):** u Convex prod `workspaces` prvi red po vremenu mora biti Enigma IT. On nasleđuje sve env vrednosti (P4).

## 5. ODLUKE koje traže stav

Predlozi iz plana (run ih je sledio):

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| P1 | U kodu `workspace`, u UI-ju „projekat“ | ceo kod | sve |
| P2 | `workspaceId` obavezan u svakoj javnoj funkciji projekta; par minuta greške pri deployu | `convex/lib/projekat.ts`, svi moduli | C03–C07 |
| P3 | Vlasnik platforme = `owner` u bar jednom internom projektu. Posledica: klijent koga pozoveš kao vlasnika INTERNOG projekta može da pravi projekte i domene | `convex/lib/projekat.ts` | C03, C19 |
| P4 | Osnivački projekat = najstariji red u `workspaces`; samo on nasleđuje env | `convex/lib/podesavanja.ts` | C12 |
| P5 | Nepoznat domen = hub; keš 60 s; localhost uvek hub | `proxy.ts`, `lib/panel-domen.ts`, `lib/rutiranje.ts` | C08 |
| P6 | Jedna OAuth povratna adresa iz `OAUTH_CALLBACK_ORIGIN`; povratak proveren protiv domena projekta | `convex/lib/oauthPovratak.ts`, callback rute | C12 |
| P7 | Paketi: `convex-helpers` (licenca je Apache-2.0, ne MIT), `vitest`, `convex-test`, `@edge-runtime/vm` | `package.json` | C01, C03 |
| P8 | Rezervisani slugovi i imena ekrana | `convex/lib/projekatSlug.ts` | C03, C08 |
| P9 | Uloge `owner`, `urednik`, `client_viewer` | `convex/schema.ts`, `convex/lib/uloge.ts` | C03, C13 |
| P10 | Boja projekta kao peta uloga boje (birač, znak, traka 2 px, prijava) | `lib/boja-projekta.ts`, `globals.css`, `CLAUDE.md` | C09 |
| P11 | Globalne kvote sa rezervom po projektu | `convex/lib/globalneKvote.ts`, `convex/globalneKvoteStore.ts` | C13 |
| P12 | Jedan napredak za korisnika preko svih projekata | `convex/napredak.ts` | C16 |
| P13 | Unakrsni leadovi samo među internim projektima, kopija sa poreklom | `convex/leadUnakrsnoStore.ts` | C17 |
| P14 | ScanMe repo netaknut; ugovor u `SCANME-INTEGRACIJA.md` | — | C17 |
| P15 | Mozak projekta u podešavanjima; `marketing-brain/` ostaje fajl | `convex/podesavanjaStore.ts`, `convex/http.ts` | C11, C14 |
| P16 | Ideje za klijente nisu u runu | — | — |

Odluke koje je run doneo sam (izbor onih koje menjaju ponašanje ili traže tvoj sud; ostale su u progress-u):

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| R1 | Meta potpis za Threads brisanje čita samo `THREADS_APP_SECRET`; bez njega 401 | `convex/http.ts`, `convex/lib/metaSignedRequest.ts` | C01 |
| R2 | Uloge po mapi: veze, oglasi, pravila, publike, CAPI, članovi, pozivnice, brisanje videa i objave traže vlasnika; posmatrač ništa ne menja | omotači u svim modulima | C04–C07 |
| R3 | Meni korisnika radi i van projekta; hub nema Napredak ni Podešavanja u meniju | `components/app/user-menu.tsx` | C08 |
| R4 | Inicijali znaka iz punog imena („EI“, „SM“), ne iz kratkog imena | `lib/boja-projekta.ts` | C09 |
| R5 | Prag isticanja tokena 14 dana (ne 7), isti kao `lib/token-expiry.ts`; crveno ≤ 2 dana | `convex/lib/zdravljeVeza.ts` | C09, C16 |
| R6 | Arhiviran projekat nije u biraču ni u ⌘K, ostaje u „Svi projekti“ | `components/app/projekat-birac.tsx` | C09 |
| R7 | E3: isti Instagram, Facebook stranica i Threads u dva projekta se odbijaju; YouTube, Meta i Google oglasi i GA4 dobijaju upozorenje | `convex/lib/vezaDrugde.ts` | C12 |
| R8 | Facebook OAuth bira prvu stranicu koja nije povezana drugde, ne `pages[0]` | `convex/facebook.ts` | C12 |
| R9 | E5: granice budžeta 5 / 5.000 EUR za svaki projekat; bez gornje granice nove kampanje pravljenje je isključeno | `convex/lib/podesavanja.ts` | C12 |
| R10 | Kratki linkovi bez vrednosti projekta idu nepraćeni (bez pada na domen) | `convex/lib/podesavanja.ts` | C12 |
| R11 | E9: nova env `HUB_HOSTS` za domen huba | Convex env | C12 |
| R12 | E18: YouTube brojači po pacifičkom danu; na dan deploya kreću od nule | `convex/lib/globalneKvote.ts` | C13 |
| R13 | Google Ads akcija pisanja rezerviše 2 operacije; sinhronizacija 22 pa ispravka | `convex/googleAds.ts`, `convex/adActions.ts` | C13 |
| R14 | Pozivnice napravljene pre deploya daju ulogu urednik (na `main`-u je nov nalog bio owner) | `convex/auth.ts`, `convex/invitesStore.ts` | C13 |
| R15 | Posmatraču sakriveni Integracije, Sajt i oglasi i Pristup; urednik vidi „Sinhronizuj“ | `app/(app)/[projekat]/settings/page.tsx` | C13 |
| R16 | Težine šablona „QR za lokale“ su procena; `kafici` je zasebna niša | `convex/lib/sabloniLeadova.ts` (menjaš i na ekranu) | C14 |
| R17 | Šablon se primenjuje samo dok projekat nema nijedno pravilo; novi projekat kreće „Prazno“, Enigma ostaje „Web agencija“ | `convex/leadScoringStore.ts` | C14 |
| R18 | Meta kvota u detaljima veze koristi pragove kapije 80/95 %, ne 90 % iz plana | `convex/lib/zdravljeVeza.ts` | C16 |
| R19 | Misija se meri ličnim brojačima svih projekata (poziv u Enigmi napreduje misiju iz ScanMe-a) | `convex/napredak.ts` | C16 |
| R20 | Ponovni upit osobe čiji je raniji upit već firma ne ide u „Upiti sa sajta“; zabranjen kontakt ostaje zabranjen i posle skidanja sa liste (postojeće pravilo čekaonice). Reci ako upit sa sajta treba uvek da stigne | `convex/leadInboundStore.ts` | C17 |
| R21 | Ključ metrike Pulsa ne sme da počne sa `_` (Convex ograničenje) | `convex/lib/puls.ts` | C17 |
| R22 | Fajl (slika posta, titl, sličica, objava) mora biti prijavljen u istom projektu u roku od 10 min; lokalni nacrt novosti sa slikom od pre deploya traži ponovno otpremanje | `convex/lib/projekatUploadi.ts` | C19 |
| R23 | Rezervni tok `?ig_code=` je ugašen (bio je CSRF i na `main`-u); Instagram se povezuje samo dugmetom „Poveži“ | `convex/instagram.ts`, `connections-settings.tsx` | C19 |
| R24 | „Prekini vezu“ za Facebook, YouTube i Google Business preskače opoziv dozvole kad drugi projekat ima isti provajder; poruka daje link za ručno uklanjanje | `convex/purge.ts`, `convex/lib/revokeAccess.ts` | C19 |
| R25 | `ALLOWED_EMAILS` u mejlu pravila važi samo za osnivački projekat | `convex/rules.ts`, `convex/podesavanjaStore.ts` | C19 |
| R26 | `ensureTemplateRules` ostaje urednik (šabloni nastaju isključeni) | `convex/rulesStore.ts` | C19 |

## 6. Deploy, tačnim redom (radi Jovan)

0. **Provera pre deploya.** Convex dashboard (prod) → Data → `workspaces`, poređano po `_creationTime`: prvi red mora biti Enigma IT, i tvoj red u `members` mora da pokazuje na njega.
1. **Izvoz baze.**
   ```bash
   npx convex export --prod --path ./backup-pre-projekti.zip
   ```
2. **Env.**

   | Promenljiva | Convex (prod) | Vercel | Napomena |
   |---|---|---|---|
   | `OAUTH_CALLBACK_ORIGIN` | **obavezno** `https://digital.enigmait.rs` | ne treba (kod je čita samo u Convex-u, E8) | Bez nje nema povezivanja kanala; postojeće veze rade |
   | `THREADS_APP_SECRET` | proveri da postoji | — | Bez nje Meta brisanje i deautorizacija dobijaju 401 |
   | `TRACKED_DOMAINS` | `enigmait.rs,digital.enigmait.rs` | — | Ranije zakucano; ili upiši oba sajta u Podešavanja → Projekat (odjednom) |
   | `NOVOSTI_REVALIDATE_URL` | `https://www.enigmait.rs/api/revalidate` | — | Zakucana rezerva je obrisana |
   | `HUB_HOSTS` | kad izabereš domen huba | — | Više hostova zarezom, prvi je kanonski |
   | `APP_URL` / `NEXT_PUBLIC_APP_URL` | po želji | — | Rezerva za link u mejlu pravila dok domen nije mapiran |
   | `NEXT_PUBLIC_CONVEX_SITE_URL` (ili `CONVEX_URL`) | — | proveri da postoji | Ruta Meta brisanja prosleđuje u Convex |

   ```bash
   npx convex env set OAUTH_CALLBACK_ORIGIN https://digital.enigmait.rs --prod
   ```
   Postojeći env (`META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_CAPI_TEST_EVENT_CODE`, `OR_SHORT_LINK_BASE_URL`, `NOVOSTI_REVALIDATE_SECRET`, `BUDGET_*`, `*_MAX_DAILY_BUDGET`, `EMAIL_FROM`) i dalje radi, ali samo za Enigma IT. Kad ga upišeš u podešavanja Enigme, env se može obrisati. `NEXT_PUBLIC_SITE_URL` kod više ne čita.
3. **Convex deploy** sa grane `projekti-run`:
   ```bash
   git switch projekti-run
   npx npm@11 install
   npm run deploy:convex
   ```
   Dodaje tabele `projekatDomeni`, `projekatTajne`, `globalneKvote`, `pulsSnimci`, `projekatUploadi`, nekoliko indeksa i cron poslove „puls“ i čišćenje kvota. Migracije nema.
4. **Odmah merge i push** (P2: stari front zove funkcije bez `workspaceId` dok Vercel ne završi; par minuta greške je očekivano):
   ```bash
   git switch main
   git merge --ff-only projekti-run
   git push origin main
   ```
5. **Mapiranje domena.** Do ovog koraka `digital.enigmait.rs` radi kao hub. Otvori `https://digital.enigmait.rs/enigma-it/settings?tab=projekat` → Domeni panela → dodaj `digital.enigmait.rs`. Za najviše minut `/` je kontrolna tabla Enigme. Tu upiši i sajtove `enigmait.rs`, `digital.enigmait.rs`.
6. **Novi projekat ScanMe.** Na hubu (pre mapiranja na `digital.enigmait.rs`, ili posle na domenu huba / localhost-u) → „Novi projekat“: ime ScanMe, adresa `scanme`, vrsta Interni, boja i logo, šablon „QR za lokale“.
7. **Vercel domeni i CNAME.** U Vercel projektu dodaj domen huba (ti biraš, O5) i po želji `digital.scanme.rs`; kod DNS-a CNAME na adresu koju Vercel pokaže. Zatim: domen huba u Convex `HUB_HOSTS`; `digital.scanme.rs` u ScanMe → Podešavanja → Projekat → Domeni panela. Prijava je po domenu (kolačić po hostu), pa se na svakom domenu prijavljuješ posebno.
8. **Povezivanje ScanMe naloga.** ScanMe → Podešavanja → Integracije → „Poveži“ po kanalu. Povratak stiže preko `digital.enigmait.rs/api/auth/callback/*` i vraća te na podešavanja ScanMe-a. Isti Instagram nalog, Facebook stranica ili Threads nalog koji je već u Enigmi biće odbijen; isti YouTube kanal prolazi uz upozorenje (BLOKADA 2).
9. **ScanMe repo** po `docs/projekti/SCANME-INTEGRACIJA.md`:
   - u panelu ScanMe-a: Projekat → Sajtovi `scanme.rs`; Sajt i oglasi → Meta piksel, CAPI token, Puls `https://scanme.rs/api/puls` i token za Puls; Pristup → nov token namene „Forma na sajtu“;
   - u ScanMe repou: env iz §6, forma iz §3 (sa servera), Puls iz §5;
   - provera: `curl`/PowerShell iz §7 (prvo 200, ponovo `duplikat: true`, tuđ `Origin` 403). GA4 i piksel na javnom sajtu traže baner za kolačiće; to je tvoja odluka (P14).

## 7. Šta ručno proveravaš

Run nije video pravu prijavu ni pravu bazu. Redom po važnosti:

1. **Prijava na `digital.enigmait.rs`** posle deploya: hub → Enigma IT; stare adrese (`/leadovi`) vode u projekat; posle mapiranja `/` je kontrolna tabla, `/enigma-it/leadovi` vodi na `/leadovi`. Odjava i prijava na panel domenu (prijava pokazuje znak i ime projekta).
2. **Enigma ne gubi ništa:** Podešavanja → Sajt i oglasi kažu „iz okruženja servera“ za piksel, kratke linkove i osvežavanje; CAPI i dalje šalje; link u Threads objavi se pakuje u `/r/`; novosti se osvežavaju na sajtu; mejl pravila stiže sa linkom.
3. **Povezivanje jednog kanala** u Enigmi (npr. Threads „Poveži“): povratak na Podešavanja istog projekta. Bez `OAUTH_CALLBACK_ORIGIN` kartica pokazuje traku „Povezivanje kanala nije podešeno“.
4. **Napredak posle deploya:** prvo otvaranje prenosi stare redove; XP, nivo, niz i dostignuća moraju biti isti kao pre (zapiši ih pre deploya).
5. **Fajlovi:** novosti (naslovna slika), YouTube sličica i titl, Instagram i Threads objava sa slikom, jedan generate-leads run sa ocenom sajta. Poruka „nije pronađen… otpremi ponovo“ znači da fajl nije prošao novu prijavu.
6. **Meta brisanje i deautorizacija** (Threads): test zahtev iz Meta App Dashboard-a vraća `{ url, confirmation_code }`.
7. **Svakodnevni posao kao pre:** Analitika (i „Uživo“ → Osveži), Instagram komentari i inbox, Facebook komentari, Threads objava i moderacija, YouTube izmena videa i upload, OpenReply automatizacije i meni, Leadovi (Danas, tabela, mapa, profil, uvoz, režim poziva), Oglasi (pauza, budžet, nova kampanja), Pravila („Pokreni proveru“), zvono.
8. **Kvote:** YouTube kartica pokazuje „Potrošeno X od R“; Google Ads kapija sada stvarno broji, pa ako sinhronizacija bude odložena, razlog stoji u kartici i u „Stanje sinhronizacije“.
9. **ScanMe izolacija:** posle pravljenja ScanMe je prazan („—“ sa razlogom), nijedan Enigmin podatak se ne vidi; birač čuva ekran pri prelasku; ⌘K „Prebaci na ScanMe“.
10. **Šablon „QR za lokale“:** u ScanMe → Leadovi → Ocenjivanje 13 pravila, u Nišama 7 ciljnih; pregledaj težine.
11. **Pozivnica:** u ScanMe napravi pozivnicu sa ulogom „Pregled“ za probnu adresu i registruj se — nalog vidi samo ScanMe i nijedno dugme za izmenu. Promeni ulogu probnog člana u Pristupu.
12. **Forma sa sajta i Puls:** `curl` iz uputstva; upit se pojavi u Leadovi → Danas → „Upiti sa sajta“ i u zvonu (posle probe ga odbaci). Puls za 15 min puni „Poslovanje“ na kontrolnoj tabli.
13. **Unakrsni leadovi:** firma iz Enigme čija je niša ciljna u ScanMe-u pokazuje „Odgovara projektu ScanMe“ i „Kopiraj u ScanMe“.
14. **Površine koje niko nije video:** red „Objavljuješ kao …“ u odgovoru na IG komentar i spominjanje, u poruci inbox razgovora, u meniju profila OpenReply-a i u trećem koraku nove kampanje.
15. **„Prekini vezu“** za Facebook/YouTube/Google Business dok drugi projekat ima istu vrstu veze: kartica kaže da je opoziv preskočen.
16. **Telefon:** hub, čarobnjak, Podešavanja → Projekat / Sajt i oglasi / Pristup, prijava na panel domenu — bez klizanja u stranu, dugmad pogodna palcem.

## 8. Brojevi

| Mera | Pre runa (`main`) | Posle runa |
|---|---|---|
| Testovi (`npx vitest run`) | 0 (vitest nije postojao) | 947 u 52 fajla, svi prolaze |
| Javne Convex funkcije | 337, bez čuvara | 372: omotačem 357, `// javno:` 15, bez omotača 0 |
| `// javno:` izuzeci | — | 15: 5 OAuth povrataka, 4 registracija/pozivnica, `oauthPovratak.procitaj`, 2 `postsPublic`, `projekti.razresiDomen`, `projekti.javniBrend`, `threadsStore.getDeletionStatus` |
| Direktni pozivi Convex-a na frontu | — | 32, svi sa spiska funkcija bez projekta (0 nedozvoljenih) |
| Tabele u proveri brisanja | 140 | 145 (+ 7 auth) |
| Lint | 0 grešaka, 1.210 upozorenja | 0 grešaka, 1.210 upozorenja |
| Izmena koda (do C19) | — | 586 fajlova, +55.059 / −9.253 |

**Trajanje.** Run je počeo 24. 10. u 22:30:08, C19 je završen 25. 10. u 12:40:31 po lokalnom satu. U noći je sat vraćen sa 03:00 na 02:00, pa je stvarno trajanje do kraja C19 **15 h 10 min** (lokalna razlika 14 h 10 min + 60 min). Jedini korak koji je prešao promenu je C07: `state.json` kaže „−14 min“, stvarno je **46 min** (00:21:26Z–01:07:06Z). Ostali koraci su tačni u `state.json`; najduži su C19 (99 min), C13 (75), C09 (74) i C16 (71). Runner je do C20 zabeležio oko 450 USD.

## 9. Rezultat provera (C20, 25. 10. oko 12:42)

| Provera | Komanda | Rezultat |
|---|---|---|
| codegen | `npx convex codegen` | ✓ (bez izmena u `_generated`) |
| typecheck | `npm run typecheck` | ✓ |
| lint | `npm run lint` | ✓ 0 grešaka (1.210 starih upozorenja) |
| testovi | `npx --no-install vitest run` | ✓ 947/947, 52 fajla |
| čuvar pristupa | `node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts` | ✓ 372 javne, 0 bez omotača; front 32/32 sa spiska |
| regresije | `node .nocni-run/projekti/regresije.mjs` | ✓ 14/14 |
| kontrast | `node scripts/contrast-check.mjs --strogo` | ✓ |
| build | `npm run build` (uključuje `verify:purge`) | ✓ 145 tabela pokriveno, build uspešan |
| snimci | Playwright, razvojni prikaz na 3105 | ✓ 8 snimaka, svi status 200, konzola čista, bez vodoravnog klizača |

U C20 nijedna provera nije pala, pa kod nije menjan.

Završni snimci (`docs/projekti/snimci/`): `C20-svi-projekti-1440.png`, `C20-svi-projekti-390.png`, `C20-birac-1440.png`, `C20-podesavanja-projekat-1440.png`, `C20-sajt-i-oglasi-390.png`, `C20-carobnjak-390.png`, `C20-kontrolna-tabla-1440.png` (misija iz ScanMe-a na kartici igrača), `C20-profil-unakrsno-1440.png`.

## 10. Zatečeno (nije od runa, nađeno usput, nije menjano)

- OTP kod se piše u log kad nema `RESEND_API_KEY` (`convex/auth.ts`; tok prijave run ne dira).
- Na par mesta se sirov `err.message` loguje posle poziva sa tokenom u adresi.
- `x-forwarded-for` se uzima doslovno.
- AES-GCM šifrat nije vezan za red (može se premestiti između redova u bazi).
- IG/FB interne mutacije osvežavanja tokena i Facebook sinhronizacija prepisuju status veze u prekidu (C19 #34).
- Petlje u `convex/metaSync.ts` nemaju `try/catch` po vezi; greška jednog naloga odlaže ostale do sledećeg prolaza (C19 #35).
- Convex Auth 0.0.95 pri osvežavanju tokena pretvara preusmerenje iz proxy-ja u 200; osvežavanje strane rešava (C19 #36).
- Ekran „Uživo“: ručno „Osveži“ nema `catch` (C04).
- Recharts upozorenje `width(-1)` na `/analytics/posetioci` pri prvom crtanju (C04).
- Razvojni prikaz: OpenReply automatizacije nemaju fiksturu (C05); pločice mape ne učitavaju se bez mreže (C06).
- `npm install` sa npm 10.9.8 puca („Cannot read properties of null (reading 'edgesOut')“); radi `npx npm@11 install` (C01).
- Dev baza ima dva reda `enigma-it` (C19).
- `npx convex codegen` je povremeno padao na mreži (`provision.convex.dev` timeout), ne na kodu; ponovni pokušaj prolazi (C12).

Zatečeno i ipak popravljeno, jer je u više projekata postalo opasno: Meta brisanje je išlo na `/login` (C01), `ig_code` CSRF (C19), kraj sinhronizacije vraćao je vezu iz prekida (C19), webhook-ovi su uzimali prvi red veze (C19).
