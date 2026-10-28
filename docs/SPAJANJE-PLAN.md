# SPAJANJE — Enigma + Devotion u jednu internu aplikaciju (noćni run, 29. 10. 2026.)

> Izvor istine za ceo run. Svaki korak ga čita pre rada. Tehničke planove koraci pišu u
> `docs/spajanje/planovi/<ID>.md`; ovaj fajl se ne prepisuje. Odluke koje koraci donesu tokom noći
> idu u njihove sekcije u `docs/SPAJANJE-PROGRESS.md` (red **ODLUKE:**), ne ovde.

## 0. Šta pravimo, u jednoj rečenici
Jedna interna web aplikacija na `digital.enigmait.rs` u kojoj Jovan i njegov tim vode sve projekte (startupe i klijente): Enigmin marketing panel (leadovi, kanali, oglasi, analitika, automatizacija, novosti, napredak) i Devotionov radni prostor (dokumenti, zadaci, ideje, poruke, beleške, Moj dan, Inbox) — jedan nalog, jedan spisak projekata, jedna ljuska.

Danas su to dve aplikacije na istom stacku (Next.js 16, React 19, Convex, Convex Auth sa lozinkom, Tailwind 4, shadcn, lucide, GSAP). Dupli su im korisnici, projekti/startupi, članstva, pozivnice, obaveštenja, početni ekrani i pretraga. Posle runa Enigma repo i Enigmin Convex nose obe. Devotion ostaje netaknut u svom repou (telefon i stara produkcija) dok ne dođe run za telefon.

## 1. Odluke (Jovan, 28.–29. 10. 2026.)

| # | Odluka |
|---|---|
| O1 | Spajamo u jednu aplikaciju. **Domaćin je Enigma**: njen repo, njen Convex deployment i domen `digital.enigmait.rs` (tamo su Meta/Google veze, webhookovi i tokeni). |
| O2 | **Sada samo web.** Devotionova Expo aplikacija ostaje u svom repou i dolazi posebnim runom, kad web bude gotov. |
| O3 | **Ništa ne sme da nestane** ni iz Enigme ni iz Devotiona. Spaja se samo ono što postoji dvaput: nalozi i profili, projekti i startupi, članstva i pozivnice, obaveštenja, početni ekrani, pretraga. §6 je spisak svake Devotion funkcije i njenog novog mesta. |
| O4 | **Leadovi ostaju Enigmin sistem**, bez promene ponašanja. Devotion nema svoj model lidova. |
| O5 | Aplikacija je **interna** (Jovan i tim). Klijentski pogled (`client_viewer`) nije potreban u spojenoj verziji: ostaje u kodu, ali ne vidi radni deo. |
| O6 | Podaci na obe produkcije su probni. **Počinje se čisto**: Devotion podaci se ne prenose i ne piše se migracija podataka iz Devotiona. |
| O7 | Posle prijave otvara se **Danas iz svih projekata** (Moj dan + Čeka te + misije). Svi projekti su jedan klik dalje. |
| O8 | Između projekata se prelazi **trakom levo sa ikonicama**: „Ja“ + projekti. Pored trake je meni izabranog dela. |
| O9 | Član tima koji nije vlasnik **vidi sve module projekta**, kao urednik danas. Tokeni, podešavanja, članovi i pozivnice ostaju vlasniku. |
| O10 | **Jedna početna projekta**: gore za tebe, trijaža i čeka te; ispod brojke (poslovanje, kanali), puls tima i nedavne izmene. |
| O11 | Opus 5.5 je glavni model (planovi i teški koraci), Sonnet 5.5 za manje korake. Sonnet 5.5 i Haiku 5.5 su radnici unutar koraka. |
| O12 | **Ništa ne izlazi sa mašine**: lokalna grana `spajanje-run`, bez push-a, deploya i komandi nad bazama. |

**Predlozi (Claude, čekaju potvrdu).** Ovo su izbori koje sam napravio jer odgovor nije postojao. Run ih sledi, a izveštaj ih ponovo navodi.

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | Ime ostaje Enigmino („Enigma Command Center“); „Devotion“ se ne pojavljuje u UI-ju. | Domen i brend ostaju. | `app/layout.tsx` (bez promene) |
| P2 | **Samo tamna tema.** Devotionova svetla tema, prekidač i skripta teme se ne prenose. | Enigmino pravilo i čuvari kontrasta važe samo za tamno; obe aplikacije su tamne po DNK-u. | `app/globals.css` |
| P3 | **Enigmin dizajn sistem posle ULTRA1**: Aeonik, boja radnje cijan (`--radnja`), uloge dugmeta, 12 px minimum, 44 px na dodir, mono samo za ID, kod i kolone, `lib/format.ts`, `lib/recnik.ts`. Devotionovi ekrani dobijaju taj izgled. Njihova pravila mira ostaju za radni deo: jedan naslov ekrana, bez kartice u kartici, bez nadnaslova, gustina radnog alata (`docs/prostor/DIZAJN-SMIRENJE.md` iz snimka). Indigo i tonovi startupa nestaju; identitet projekta je `--projekat` / `brend.boja`. | Jedan izgled; Enigmin sistem ima čuvare. | `components/app/prostor/**`, `app/globals.css` |
| P4 | **Imenski prostor `prostor`.** Sve Devotion funkcije idu u `convex/prostor/` (`api.prostor.<modul>.<funkcija>`), pomoćni kod u `convex/prostor/lib/`, tabele u `convex/prostor/schema.ts` koje se šire u `convex/schema.ts`. Testovi su `convex/prostor/*.test.ts`. | Nema sudara imena (Enigma i Devotion imaju `auth`, `http`, `crons`, `puls`, `lib/notifications`…); radni deo ostaje odvojiv. | `convex/prostor/**` |
| P5 | **Projekat = startup.** `startups`, `startupMembers`, Devotion `invites` i `appState` se ne prenose. Svako `startupId: Id<"startups">` postaje `workspaceId: Id<"workspaces">`; lični redovi zadržavaju `\| null`. Indeksi `by_startupId…` postaju `by_workspaceId…`. `startupAreas` postaje `areas` (`areaId: Id<"areas">`). Opis startupa postaje novo opciono polje `workspaces.opis`. | Jedan model projekta; čist start dozvoljava pravo ime polja. | `convex/prostor/schema.ts`, `convex/schema.ts` |
| P6 | **Identitet.** Enigmin auth (`convex/auth.ts`: lozinka, kod na e-poštu, reset preko Resend-a) ostaje jedini. Devotion `profiles` ostaje (ime i avatar; na profil upućuje 64 polja) i pravi se lenjo za svakog korisnika: `prostor/profiles:ensureCurrent`, koji poziva `components/app/auth-gate.tsx`. Devotion bootstrap, kod osnivača, njegova politika lozinke i Devotion pozivnice se ne prenose. | Jedan nalog; Enigmin tok prijave se ne dira. | `convex/prostor/profiles.ts`, `auth-gate.tsx` |
| P7 | **Uloge.** `owner` projekta = Devotion „vlasnik startupa“ (upravljanje, otključavanje tuđe stranice…). `urednik` = član. `client_viewer` nema pristup radnom delu i ne pojavljuje se u spiskovima ljudi. Devotion globalni admin = Enigmin **vlasnik platforme** (`jeVlasnikPlatforme`): pravi projekte i postavlja lozinku članu. | Enigmin model uloga već postoji i čuvari ga znaju. | `convex/prostor/lib/auth.ts` |
| P8 | **Omotači.** Svaka javna `prostor` funkcija ide kroz Enigmin omotač: `projekatQuery`/`projekatMutation`/`projekatAction` sa `uloga: "urednik"` za projekat, ili `prijavljenQuery`/`prijavljenMutation` za lični nivo „Ja“. `verify:pristup` mora da prolazi bez novih `// javno:` izuzetaka. | Izolacija projekata (`scripts/verify-pristup.ts`). | `convex/prostor/**` |
| P9 | **Ljudi.** Spisak ljudi za poruke i dodeljivanje čine aktivni profili koji sa mnom dele bar jedan projekat kao `owner` ili `urednik`. Devotion je pokazivao sve profile. | Bez curenja klijenata i stranih projekata. | `convex/prostor/chat.ts` i dodela |
| P10 | **Paketi.** Novi paketi su dozvoljeni samo ovi, u tačnim verzijama iz Devotion lockfile-a: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/extension-list`, `@tiptap/extension-table` (svi `3.29.2`), `@xyflow/react@12.11.2`, `web-push@3.6.7` (+ dev `@types/web-push@3.6.4`), `read-excel-file@9.3.5`. `jsdom@30.0.1` je dozvoljen samo kao dev paket, ako ga prenesen test zaista traži. **Ne prenose se:** `@radix-ui/*`, `framer-motion` (zabranjen, `verify:pokret`), `sonner`, `@chenglou/pretext` (mrtav kod), `@convex-dev/migrations`. | Samo ono bez čega funkcija ne postoji. | `package.json` |
| P11 | **Primitivi.** Radix prelazi na Base UI: postojeći `components/ui/*` plus novi Base UI primitivi za kartice (tabs), kontekstni meni, avatar, traku za skrol, napredak i fioku. `asChild` postaje `render`. Toast prelazi na Base UI Toast sa API-jem kao sonner (`toast`, `toast.success`, `toast.error`, `toast.promise` ako se koristi) u `lib/toast.ts`; oko 390 poziva samo menja uvoz. | Jedna biblioteka primitiva; bez novog paketa. | `components/ui/*`, `lib/toast.ts` |
| P12 | **Pokret** ide kroz GSAP i Enigmin `lib/motion.ts` i `components/motion/*`. Devotionov rečnik pokreta (90/160/240/380 ms) se mapira na Enigmine `DUR_*`, sa granom za smanjen pokret. | Jedan rečnik pokreta. | `components/app/prostor/**` |
| P13 | **Rute (App Router).** Lični nivo: `/` (Danas), `/moji-zadaci`, `/inbox`, `/poruke`, `/beleske`. Hub „Svi projekti“ prelazi na `/projekti`. Projekat: `/[projekat]` (jedna početna, O10), `/[projekat]/zadaci`, `/ideje`, `/poruke`, `/dokumenti` i `/dokumenti/[oblastId]`, `/stranica/[stranicaId]`, `/korpa`, `/puls`, `/aktivnost`, `/beleske` (mapa beleški projekta). Nove putanje se rezervišu u `convex/lib/projekatSlug.ts`. Stari Devotion `?view=` linkovi se ne podržavaju. | Enigma koristi prave rute; čist start. | `app/(app)/**`, `projekatSlug.ts`, `proxy.ts` |
| P14 | **Ljuska (O8).** Traka levo (oko 72 px) nosi „Ja“ (avatar i broj nepročitanog), ikonice projekata (`ProjekatZnak`, tačka za nepročitano ili čeka te), „+“ za novi projekat (vlasnik platforme), „Svi projekti“, a dole profil. Pored trake je meni „Ja“ (Danas, Moji zadaci, Inbox, Poruke, Beleške) ili meni projekta, po grupama: **Rad** (Početna, Zadaci, Ideje, Poruke, Dokumenti sa stablom oblasti), **Prodaja** (Leadovi), **Sadržaj** (Novosti), **Kanali**, **Analitika**, **Automatizacija**; dole Korpa, Napredak, Podešavanja. Moduli se i dalje gase po projektu (Enigma `moduli`); radni deo je uvek uključen. Enigmin birač projekta u meniju se povlači, jer traka preuzima njegov posao. | Odluka O8 i obe navigacije bez gubitka. | `components/app/app-shell.tsx`, `app-sidebar.tsx`, `nav-items.ts` |
| P15 | **Telefon (web, 390 px):** nema trake. Donja traka je Danas · Projekat · Zadaci · Poruke · Više; Više nosi spisak projekata i sve module. Enigmino „Danas“ zvono na telefonu se preimenuje u „Čeka te“. | „Danas“ je sada lični dan. | `components/app/mobile-nav.tsx` |
| P16 | **Obaveštenja.** Zvono u zaglavlju ima dve kartice: **Čeka te** (Enigmini izračunati zadaci) i **Inbox** (Devotion obaveštenja: pominjanja, dodele, komentari, podsetnici), sa brojem nepročitanih. `/inbox` je ceo ekran. Web push radi za Inbox kad postoje VAPID promenljive; bez njih je isključen bez greške. | Jedno zvono, ništa izgubljeno. | `notifications-bell.tsx`, `convex/prostor/notifications.ts`, `public/sw.js` |
| P17 | **Danas (O7):** Moj dan (plan dana, brzi unos, prekoračeno · danas · u toku · završeno danas) + Čeka te iz svih projekata + kartica napretka (nivo, niz, misije) + kratko Inbox i poruke. | O7. | `app/(app)/page.tsx` |
| P18 | **Početna projekta (O10):** Za tebe · Trijaža (Sredi rokove, Zastarelo) · Čeka te (Enigma, za ovaj projekat) · brojke (Poslovanje, kanali) · Puls tima · Nedavne izmene. Enigmina kartica „Danas · misije“ seli se na Danas. | O10 i O7. | `app/(app)/[projekat]/page.tsx` |
| P19 | **Lid i zadatak.** Stranica-zadatak dobija opcionu vezu na firmu iz Leadova (`leadCompanyId`). Profil firme dobija odeljak „Zadaci“ i dugme „Novi zadatak“. Komentar bez odgovora i upozorenje iz Čeka te mogu da postanu zadatak. Logika Leadova se ne menja. | Jedina vrednost koja postoji tek kad su aplikacije zajedno. | `convex/prostor/*`, `components/app/leadovi/*` (samo dodatak) |
| P20 | **⌘K** je jedna paleta svuda, i u „Ja“. Nosi ekrane obe aplikacije, projekte, brzi unos, pretragu stranica, zadataka i ideja projekta i firme iz Leadova po imenu. Prečice su usklađene: `q` je brzi unos, `?` je pomoć. | Jedna pretraga. | `components/app/command-palette.tsx` |
| P21 | **Devotion migracije, glasanje o brisanju i zahtevi za ugnežđavanje.** Kod migracija se ne prenosi (čist start). Stare tabele koje Devotion kod i dalje čita (v1 mape, zahtevi, `recoveredContent`) prenose se samo ako ih preneseni kod zaista čita; S01 odlučuje po fajlu. | Čist start, bez mrtvog koda. | `convex/prostor/schema.ts` |
| P22 | **Telefon kasnije.** Expo kod i `app/embed/*` se ne prenose. Backend za Expo push ostaje; bez tokena ne šalje ništa. | O2. | — |
| P23 | **Razvojni prikaz.** Enigmin `?ux=1` dobija fiksture za `prostor/*` funkcije, pa se vide pravi kontejneri i ljuska. Devotionov `/izlog` se ne prenosi kao ruta; njegove fiksture su izvor podataka za nove fiksture. | Jedan razvojni prikaz koji proverava i povezivanje. | `app/dev-ux/**` |
| P24 | **Gde ide kod.** Čista logika i njeni testovi idu u `lib/prostor/`: Devotion `packages/shared` i `*-model.ts` iz weba. Testovi idu u `lib/**/*.test.ts`, jer se drugde ne puštaju. Komponente idu u `components/app/prostor/<oblast>/`. | Enigmine konvencije i vitest projekti. | — |
| P25 | Nove provere nose ime `verify:prostor-<oblast>`; `regresije` ih pušta same. | Isto kao `verify:ultra-*`. | `package.json`, `scripts/` |
| P26 | **Podrazumevane oblasti** (Devotion `AREA_DEFINITIONS`) i kanali poruka nastaju pri pravljenju projekta. Za postojeće projekte nastaju pri prvom otvaranju radnog dela, idempotentno. | Čist start i projekat Enigma IT koji već postoji. | `convex/projekti.ts` (`kreirajProjekat`), `convex/prostor/*` |
| P27 | Napredak (XP) se **ne vezuje** za radni deo u ovom runu. | Obim. | — |
| P28 | Vremenska zona ostaje Europe/Belgrade, kao u obe aplikacije. Ograničenja (Devotion `lib/validators.ts`) ostaju, osim opsega „moji projekti“, koji ide sa 20 na 50. | Više projekata nego startupa. | `convex/prostor/lib/*` |

## 2. Obim
**Radimo:**
- backend radnog dela u Enigmi;
- ljusku sa trakom;
- sve Devotion ekrane na webu;
- spojene Danas, početnu projekta, zvono i Inbox, ⌘K;
- vezu lid ↔ zadatak;
- prolaze: tekst, prazna stanja, telefon, dizajn sistem, performanse, pristupačnost;
- reviziju i izveštaj.

**Ne diramo:**
- tok prijave i OAuth putanje (`/api/auth/callback/*`);
- pravne strane;
- ponašanje Leadova, kanala, oglasa, pravila, OpenReply-a, Novosti, Napretka i puls sajta. Oni se samo sele u nov meni, a P19 i P20 samo dodaju;
- bilo šta što ide prema Meta ili Google API-ju;
- produkciju i baze;
- **Devotion repo** (`../notion-clone`): ne dira se i ne čita, nego samo snimak (§3);
- ScanMe repo;
- `marketing-brain/`, `nocni-run/`, `overnight/`, `_to_delete/`, `content/`, `tools/generate-leads/vendor/`.

## 3. Izvor: snimak Devotiona
Devotion `main` @ `c05c40f`, bez `apps/mobile`, nalazi se u `.nocni-run/spajanje/tmp/devotion/`. Snimak je samo za čitanje. Pregled sa svim važnim putanjama je `.nocni-run/spajanje/tmp/devotion/MAPA.md`.

Folder je u `.gitignore`, pa ga alat **Grep** ne vidi. Koristi Read sa tačnom putanjom, Glob, ili u terminalu `rg --no-ignore <izraz> .nocni-run/spajanje/tmp/devotion` (ili `Select-String`).

Gde je šta:
- **backend:** `packages/backend/convex/`. Ima 56 tabela + authTables, 39 modula, 271 javnu i 31 internu funkciju, 49 test fajlova (oko 490 testova).
- **deljena logika:** `packages/shared/src/`, 26 modula + 26 test fajlova.
- **web:** `apps/web/`, 392 fajla, oko 77,5 hiljada redova. Komponente su u `components/{me,workspace,collab,map,motion,shortcuts,ui}`, a tu su još `lib/`, `hooks/`, `public/sw.js` i `app/izlog/fixtures` (fiksture).
- **planovi i dizajn:** `docs/PROSTOR-PLAN.md`, `PROSTOR-REPORT.md`, `LICNO-PLAN.md`, `LICNO-REPORT.md`, `licno/DIZAJN-DNK.md`, `prostor/DIZAJN-SMIRENJE.md`.

## 4. Backend: šta gde ide

### 4.1 Tabele (56 + authTables)
| Domen | Tabele | Sudbina |
|---|---|---|
| Identitet | `appState`, `startups`, `startupMembers`, `invites` | **ne prenose se** (P5, P6). Zamena: `workspaces`, `members`, Enigmine `invites`. |
| Identitet | `profiles`, `avatarUploads` | prenose se. `profiles.userId` → `users`. `role` se više ne koristi za odluke (P7). |
| Oblasti | `startupAreas` | → `areas` sa `workspaceId` (P5). |
| Dokumenti | `pages` (vrste: beleška, zadatak, fajl, tabela), `pageBodies`, `areaBodies`, `pageCanvasPlacements`, `pageCanvasEdgesV2`, `pageCanvasViewports`, `pageRelations` | prenose se. |
| Dokumenti (stare) | `pageEntries`, `pageEdges`, `pageCanvasNodes`, `pageCanvases` | prenose se samo ako ih preneseni kod čita (P21). |
| Zadaci i lično | `taskCheckpoints`, `taskAssignees`, `taskCheckpointCanvasPlacements`, `taskCheckpointCanvasEdges`, `personalTasks`, `myDayEntries` | prenose se. |
| Ideje i beleške | `ideaCanvases`, `ideaNodes`, `ideaVotes`, `ideaEdges`, `thoughtCanvases`, `thoughtNodes`, `thoughtEdges` | prenose se. |
| Tabele i fajlovi | `pageTableColumns`, `pageTableRows`, `pageFiles`, `pageFileUploads` | prenose se. |
| Saradnja | `contentContributions` (komentari), `contentRevisions` (istorija), `activities`, `pagePresence` | prenose se. |
| Stari tokovi | `recoveredContent`, `deletionRequests`, `deletionBallots`, `nestingRequests`, `pageNestingRequests` | prenose se samo ako ih kod čita (P21). |
| Migracije | `areasMigrationIssues` | **ne prenosi se**. |
| Poruke | `chatChannels`, `chatMessages`, `chatMembers`, `chatReads`, `chatPresence`, `chatReactions` | prenose se. |
| Obaveštenja | `notifications`, `pushSubscriptions`, `expoPushTokens`, `notificationSettings` | prenose se. |
| AI | `aiProviders` | prenosi se (samo podešavanje; Devotion ne zove AI). |

Pravila:
- Svaka tabela sa projektom ima indeks koji počinje sa `workspaceId`.
- Svaka nova tabela ima odluku o brisanju u `convex/lib/purgeMap.ts` (`EXTRA_TABLE_OWNERSHIP`); `verify:purge` je deo builda.
- Postojeće Enigmine tabele dobijaju samo opciona polja (npr. `workspaces.opis`). `pages.leadCompanyId` (P19) je opciono polje nove `prostor` tabele.

### 4.2 Moduli (39 fajlova)
- **Prenose se u `convex/prostor/`:** `activity`, `aiProviders`, `areasV2`, `canvases`, `chat`, `collaboration`, `comments`, `dashboard`, `expoPush`, `expoPushTokens`, `history`, `ideas`, `inbox`, `myDay`, `notificationSettings`, `notifications`, `pageFiles`, `pageTables`, `pages`, `personalTasks`, `presence`, `profiles`, `puls` (puls tima; Enigmin `convex/puls.ts` je puls sajta i ostaje), `push`, `pushSubscriptions`, `pushTest`, `search`, `storage`, `taskAssignees`, `taskCheckpointCanvasEdges`, `taskCheckpoints`, `tasks`, `thoughts`, `trash`, kao i `canvasPlacement` i `lib/*`.
- **Zamenjuju se Enigminim:**
  - `auth.ts`, `auth.config.ts`, `http.ts`: ostaju Enigmini, bez ičeg novog.
  - `invites.ts`: Enigmin `invitesStore`; profil nastaje pri prihvatanju.
  - `startups.ts`: Enigmini `projekti.ts` i podešavanja. Novo je `convex/prostor/projekat.ts` (podrazumevane oblasti i kanali po P26, opis projekta).
- **Spajaju se:**
  - `crons.ts`: posao „podsetnici za rokove“ (6 h) ulazi u Enigmin `convex/crons.ts`.
  - `adminAuth.ts` postaje `prostor/adminAuth`, samo za vlasnika platforme. Interni `resetAdminPassword` se ne prenosi.
- **Ne prenose se:** `migrations.ts`, `areasV2Migrations.ts`, `convex.config.ts` (komponenta migrations), Devotion `schema.ts` (zamena je `convex/prostor/schema.ts`).

### 4.3 Identitet i dozvole
- `convex/prostor/lib/auth.ts` je **adapter**. Zadržava Devotion imena tamo gde to štedi izmene:
  - `requireProfile(ctx)` vraća profil pozivaoca.
  - `requireStartupMember(ctx, workspaceId)` postaje `requireClanProjekta`. Vraća `{ profile, workspace, membership }`, gde je `membership` Enigmin `members` red sa `role`. Odbija `client_viewer` i arhiviran projekat.
  - `isManager` je `owner` ili vlasnik platforme.
  - `requireAdmin` postaje `requireVlasnikPlatforme`.
- Javne funkcije idu kroz Enigmine omotače (P8). Omotač daje `ctx.projekat = { userId, workspaceId, uloga }`; adapter iz toga čita profil.
- Lični nivo („Ja“) čita moje projekte iz `members.by_user`, bez `client_viewer` i bez arhiviranih. Opseg je 50 (P28).
- Na klijentu: `useProjekatQuery/Mutation/Action` za projekat (sami ubacuju `workspaceId`). Za „Ja“ se koriste direktni `useQuery`/`useMutation`, uz upis u `DOZVOLJENI_DIREKTNI` u `scripts/verify-pristup.ts`.

### 4.4 Testovi
Devotion testovi se prenose uz izmene:
- seed ide redom `users → profiles → workspaces → members (role) → areas`;
- identitet je `t.withIdentity({ subject: \`${userId}|sesija-test\` })`, kao u Enigmi;
- `const modules = import.meta.glob("../**/*.*s")`, ili kako S01/S02 utvrde da `convex-test` nalazi `_generated`.

Testovi deljene logike i modela weba idu u `lib/prostor/**`. Nijedan test se ne briše da bi provera prošla. Test koji meri nešto što spajanje namerno menja (npr. `startupId`) se prepravlja, a promena se upisuje u ODLUKE.

## 5. Web: šta gde ide

### 5.1 Rute
| Devotion `?view=` | Nova ruta | Kontejner u snimku (`apps/web/components/…`) |
|---|---|---|
| `me-today` | `/` = Danas (P17) | `me/my-day/my-day-container` |
| `me-tasks` | `/moji-zadaci` | `me/tasks/my-tasks-container` |
| `me-inbox` | `/inbox` + kartica u zvonu (P16) | `me/inbox/inbox-container` |
| `me-chat` | `/poruke` (`?kanal=`) | `me/chat/chat-hub-container` |
| `me-notes` | `/beleske` | `me/notes/notes-container` |
| `today` (Komandni centar) | `/[projekat]` (P18) | `workspace/command-center-view` |
| `tasks` (`filter`, `osoba`) | `/[projekat]/zadaci` | `workspace/tasks-view` |
| `ideas` (`ideaId`) | `/[projekat]/ideje` (`?ideja=`) | `workspace/ideas/ideas-view` |
| `chat` (`channelId`) | `/[projekat]/poruke` (`?kanal=`) | `workspace/chat-view` |
| `thoughts` | `/[projekat]/beleske` | `thoughts/thoughts-canvas-view` |
| `puls` (`week`) | `/[projekat]/puls` | `workspace/puls-view` |
| `activity` | `/[projekat]/aktivnost` | `workspace/activity-view` |
| `trash` (`vrsta`) | `/[projekat]/korpa` | `trash/trash-container` |
| `settings` (`tab`) | `/[projekat]/settings` + kartice Oblasti, Lozinke, AI; Tim i pozivnice = Enigmin Pristup | `workspace/settings/settings-container` |
| `area` (`areaId`, `tab`) | `/[projekat]/dokumenti/[oblastId]` (`?tab=pregled\|zadaci\|dokumenti\|mapa`) | `workspace/area/area-view` |
| `page` (`pageId`, `tab=mapa`) | `/[projekat]/stranica/[stranicaId]` (`?tab=mapa`) | `workspace/page/page-route-view` |
| (Enigmin hub `/`) | `/projekti` | `components/app/hub/svi-projekti.tsx` |

Navigacija:
- Devotion `navigateRoute`, `workspaceRouteHref` i oko 140 povratnih poziva `onOpenPage` dobijaju jedan čist modul `lib/prostor/rute.ts` (objekat rute → href) i jednu kuku `useProstorNavigacija()` (Next router + `useProjekatHref`).
- Linkovi idu kroz `ProjekatLink` ili nov link za „Ja“; dozvoljene fajlove upisati u `lib/linkovi-cuvar.test.ts`.
- Čuvar napuštanja nesačuvanog teksta (2 s, „Ostani / Napusti“) ostaje.

### 5.2 Ljuska
Po P14 i P15. Ljuska ima dva opsega: „Ja“ (rute bez projekta) i projekat. Nijedna ruta nije bez ljuske, osim prijave, pozivnice i pravnih strana. Profil (ime, avatar, obaveštenja, push) je u meniju korisnika.

### 5.3 Podaci na klijentu
Devotion ima tri kuke koje ne bacaju grešku: `useQueryTolerant` (23), `useQueryResult` (19) i `useQueryState` (24). Postaju projektne varijante na `useProjekat*`, plus nova `useProjekatPaginatedQuery` (Devotion ima 19 `usePaginatedQuery`). Obrazac kontejner → prikaz → model ostaje: kontejneri čitaju podatke, prikazi su prezentacioni, a modeli su čiste funkcije u `lib/prostor/`. Optimistične izmene (19) ostaju.

### 5.4 Primitivi (P11)
| Devotion (Radix/svoje) | Enigma |
|---|---|
| `button` (Slot, 112 fajlova) | `components/ui/button`; `variant` je obavezan. Devotion `default` postaje `primary` ili `secondary` po značenju. |
| `dropdown-menu` (26) | Enigmin `dropdown-menu`. `onSelect` postaje `onClick`; meni ostaje otvoren uz `closeOnClick={false}`. |
| `dialog` (19), `sheet` (3), `motion-dialog`, `drawer` | Enigmin `dialog` / `system/side-drawer` ili nov Base UI Drawer. GSAP izlaz ide preko Base UI stanja, ne preko `forceMount`. |
| `tabs` (9), `scroll-area`, `progress`, `avatar`, `kbd`, `badge` | novi `components/ui/*` na Base UI (ili čist element za kbd i badge) |
| `select` (9), `tooltip` (9), `popover`, `label`, `input`, `textarea`, `checkbox`, `switch`, `skeleton` | Enigmini |
| `@radix-ui/react-context-menu` (dve mape) | nov `components/ui/context-menu.tsx` (Base UI ContextMenu) |
| `date-picker` (svoj) | port na Enigmin popover + `lib/format.ts` |
| `sonner` (70 fajlova) | `lib/toast.ts` (Base UI Toast), jedan `Toaster` u ljusci |

`data-[state=…]` postaje `data-[open]` / `data-[closed]`, jer ga `verify:pokret` hvata.

### 5.5 Tokeni, slova, pokret
- Devotion tokeni prelaze na Enigmine iste uloge (S07 daje tačnu mapu):
  - `background`, `card`, `popover`, `muted`, `accent`, `border`, `input`, `ring` → ista uloga u Enigmi;
  - `primary` (indigo) → `--radnja`;
  - `success`, `warning`, `info`, `destructive` → Enigmine boje stanja;
  - tonovi startupa → `--projekat`;
  - `--shadow-desk` → senka plutajućeg sloja.
- Geist postaje Aeonik; mono je Enigmin.
- Globalna Devotion pravila (`*` ivice, fokus, 44 px, smanjen pokret, `.app-canvas` mreža) se **ne** prenose. Enigma ih već ima ili ih ne želi.

### 5.6 Editor i mape
- **Tiptap editor:** `components/app/prostor/editor/`, učitava se sa `next/dynamic` (`ssr: false`) samo na ekranima stranice. Ekstenzije su iste (StarterKit, TaskList, TaskItem, Placeholder, TableKit, čvor fajla), a sadržaj ostaje HTML.
- **Stilovi `.tiptap`** (oko 300 redova) idu u poseban CSS na Enigmine tokene.
- **Mape (`@xyflow/react`):** učitavaju se dinamički, samo na kartici „Mapa“. `style.css` se uvozi samo u mapi, a hex boje iz mapa postaju tokeni.

### 5.7 Razvojni prikaz (P23)
Svaki korak sa ekranima:
- dodaje `app/dev-ux/fixtures-prostor-<oblast>.ts` za upite koje njegovi ekrani zovu, uključujući `PRAZNO`;
- dodaje strane u `PAGES` i segment u `EKRANI` gde treba;
- snima `?ux=1` na 1536 × 695 i 390 × 844.

Fiksture se prave po uzoru na Devotion `apps/web/app/izlog/fixtures/*`.

### 5.8 Čuvari i šta znače za prenos
| Provera | Šta traži od prenesenog koda |
|---|---|
| `verify:pristup` | Na serveru P8. Na klijentu `useProjekat*`, ili direktan poziv upisan u `DOZVOLJENI_DIREKTNI` (§4.3). |
| `verify:ultra-tipografija` | Ništa ispod 12 px (Devotion `text-[0.625rem]` i `text-[0.6875rem]` → 12 px). Mono samo za ID, kod i kolone (plafon 254). |
| `verify:ultra-kontrast` | Bez sirove palete i bez providnosti na tekstu. |
| `verify:ultra-dugmad` | `variant` je obavezan. Radni deo ne koristi boje modula (plafon 654). |
| `verify:ultra-format` | Bez `toLocaleString`/`Intl` u `components/` i `app/`; sve ide kroz `lib/format.ts`. |
| `verify:ultra-recnik` | Bez sirovih `snake_case`/`ALLCAPS` stringova na ekranu; nazivi idu kroz `lib/recnik.ts`. |
| `verify:pokret` | Bez `framer-motion` i bez Radix `data-[state=…]`. |
| `lib/linkovi-cuvar.test.ts` | `next/link` i `usePathname` samo u dozvoljenim fajlovima. |
| `lib/rutiranje.test.ts` | Folderi ekrana = `EKRANI`; moduli u `nav-items.ts` = `MODULI_PROJEKTA` + uvek uključeni. |
| `verify:purge` | Svaka tabela ima odluku o brisanju. |

Čuvar se menja samo da bi naučio novu legitimnu putanju ili fajl (spisak dozvoljenih), **nikad** da bi oslabio pravilo. Svaka izmena čuvara ide u ODLUKE.

## 6. Paritet: Devotion funkcija → novo mesto
Revizija (S29) proverava svaki red: postoji, radi u razvojnom prikazu, ima test gde ga je Devotion imao.

| # | Devotion funkcija | Novo mesto | Korak |
|---|---|---|---|
| 1 | Moj dan: plan dana, „Isplaniraj“, prenos nezavršenog, sekcije, završeno danas | `/` Danas | S19 |
| 2 | Brzi unos (`q`) sa odredištem i rokom | ljuska + ⌘K | S16, S24 |
| 3 | Moji zadaci (svi projekti + lični), grupe, filteri | `/moji-zadaci` | S16 |
| 4 | Lični zadaci i „Premesti u projekat“ | `/moji-zadaci` | S16 |
| 5 | Inbox: obaveštenja iz svih projekata, nepročitano, Čeka tebe (ideje za glasanje) | `/inbox` + zvono | S17 |
| 6 | Poruke: lični DM, grupe, kanali svih projekata, reakcije, prisustvo, pretraga poruka | `/poruke` | S15 |
| 7 | Beleške: moje misli iz svih projekata, „Pošalji u projekat“ | `/beleske` | S16 |
| 8 | Mapa beleški projekta | `/[projekat]/beleske` | S14 |
| 9 | Profil: ime, avatar; podešavanja obaveštenja, tiho vreme, web push | meni korisnika | S09, S17 |
| 10 | Komandni centar: Za tebe, Trijaža (Sredi rokove, Zastarelo), Čeka tebe, Tim, Nedavne izmene, Puls | `/[projekat]` | S20 |
| 11 | Zadaci tima: lista, moji/osoba, brzo pravljenje, radnje u redu, panel zadatka | `/[projekat]/zadaci` | S12 |
| 12 | Zadatak na celu stranu: status, prioritet, rok, izvršioci, koraci, instrukcije, povezano, komentari, istorija | `/[projekat]/stranica/[id]` | S12 |
| 13 | Ideje: tabla po fazama, lista, detalj, glasanje, faze, „Postalo zadatak“ | `/[projekat]/ideje` | S13 |
| 14 | Mapa ideja | `/[projekat]/ideje` (Mapa) | S14 |
| 15 | Poruke projekta: kanali po oblasti, poruke, reakcije | `/[projekat]/poruke` | S15 |
| 16 | Oblasti: podrazumevane i nove, preuređivanje, preimenovanje, opis oblasti | meni projekta + `/[projekat]/dokumenti/[id]` | S10 |
| 17 | Stablo stranica: neograničeno ugnežđavanje, prevlačenje, nova stranica | meni projekta | S10 |
| 18 | Stranica: Tiptap (naslovi, liste zadataka, tabele, fajlovi), autosave, konflikt „Učitaj najnoviju / Prepiši“ | `/[projekat]/stranica/[id]` | S10 |
| 19 | Prisustvo „X uređuje“, zaključavanje, podstranice, povezano | stranica | S11 |
| 20 | Komentari sa @pominjanjem | stranica, oblast, ideja | S11 |
| 21 | Istorija izmena sa „Vrati ovu verziju“ | stranica, oblast, zadatak | S11 |
| 22 | Stranica-tabela: kolone, redovi, uvoz CSV/XLSX | stranica | S11 |
| 23 | Stranica-fajl, prilozi, pregled fajla | stranica | S11 |
| 24 | Mapa oblasti i stranice (kartice, veze, ugnežđavanje prevlačenjem) | kartica „Mapa“ | S14 |
| 25 | Korpa: stranice, ideje, prilozi; vraćanje; po vrsti | `/[projekat]/korpa` | S21 |
| 26 | Aktivnost projekta | `/[projekat]/aktivnost` | S20 |
| 27 | Puls nedelje (završeno, novo, prekoračeno, zapelo; po oblasti i članu) | `/[projekat]/puls` + kartica | S20 |
| 28 | Podešavanja startupa: opšte (ime, opis, logo), oblasti, tim, pozivnice, lozinke | `/[projekat]/settings` | S21, S22 |
| 29 | AI provajderi po projektu | `/[projekat]/settings` (AI) | S21 |
| 30 | Pretraga (⌘K) stranica i zadataka | ⌘K | S24 |
| 31 | Podsetnici za rokove (cron na 6 h) | `convex/crons.ts` | S06 |
| 32 | Web push obaveštenja | zvono, podešavanja | S17 |
| 33 | Prečice na tastaturi (`q`, `?`, `j`/`k`/`x`…) | ljuska | S24 |
| 34 | Novi startup sa podrazumevanim oblastima i kanalima | `/novi` (projekat) | S22 |
| 35 | Pozivnica u tim | Enigmin Pristup + profil | S22 |

**Ne prenosi se sada:**
- telefon (Expo) i `app/embed/*` (P22);
- Devotion prijava, bootstrap i pozivnice: zamenjuje ih Enigmin tok (P6);
- svetla tema (P2);
- `/izlog` kao ruta (P23);
- Devotion migracije (P21);
- `framer-motion` i `pretext` (mrtav kod).

## 7. Tehnika i granice
- **Nov kod ide u:**
  - `convex/prostor/**`
  - `lib/prostor/**`
  - `components/app/prostor/**`
  - rute u `app/(app)/**`
  - `app/dev-ux/fixtures-prostor-*.ts`
  - `scripts/verify-prostor-*.ts`
  - alati za prenos u `.nocni-run/spajanje/alati/`
- **Paketi:** samo P10.
- **Enigmine postojeće tabele:** samo opciona polja i novi indeksi. Ništa se ne briše i ne preimenuje.
- **Provere:** sve zelene na kraju svakog koraka.
- **Ne dirati:** §2.

## 8. Koraci
Tačne vrednosti su u `.nocni-run/spajanje/steps.json`, a promptovi u `.nocni-run/spajanje/prompts/<ID>.md`.

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| S01 | Arhitektura spajanja (plan) | Opus | max | plan | nova |
| S02 | Temelj: paketi, deljena logika, šema, identitet, alat za prenos | Opus | xhigh | goal | ista S01 |
| S03 | Backend: dokumenti, oblasti, saradnja, korpa, pretraga | Opus | xhigh | goal | nova |
| S04 | Backend: zadaci, lični zadaci, Moj dan, Puls tima | Opus | xhigh | goal | nova |
| S05 | Backend: ideje, beleške, mape, tabele, fajlovi, AI | Opus | xhigh | goal | nova |
| S06 | Backend: poruke, obaveštenja, push, podsetnici, lozinke | Opus | xhigh | goal | nova |
| S07 | Plan: ljuska, rute i prevod ekrana | Opus | high | plan | nova |
| S08 | Temelj weba: primitivi, toast, pokret, kuke, alat za ekrane | Opus | xhigh | goal | ista S07 |
| S09 | Ljuska: traka, meni „Ja“, meni projekta, rute, profil | Opus | xhigh | goal | nova |
| S10 | Dokumenti 1: oblasti, stablo, stranica, editor | Opus | xhigh | goal | nova |
| S11 | Dokumenti 2: komentari, istorija, prisustvo, zaključavanje, prilozi, tabele | Opus | xhigh | goal | nova |
| S12 | Zadaci: zadaci tima, zadatak, panel, koraci, rokovi | Opus | xhigh | goal | nova |
| S13 | Ideje: tabla, lista, detalj, faze, glasanje | Opus | high | goal | nova |
| S14 | Mape: oblast, stranica, ideje, beleške | Opus | xhigh | goal | nova |
| S15 | Poruke: kanali projekta, lične poruke, grupe | Opus | xhigh | goal | nova |
| S16 | Ja: Moji zadaci, Beleške, brzi unos | Opus | xhigh | goal | nova |
| S17 | Zvono, Inbox, obaveštenja, web push | Opus | xhigh | goal | nova |
| S18 | Plan: Danas i početna projekta | Opus | high | plan | nova |
| S19 | Danas iz svih projekata | Opus | xhigh | goal | ista S18 |
| S20 | Početna projekta, Puls tima, Aktivnost | Opus | xhigh | goal | nova |
| S21 | Korpa, podešavanja projekta, profil | Sonnet | high | goal | nova |
| S22 | Svi projekti, novi projekat, pozivnice za tim | Sonnet | high | goal | nova |
| S23 | Veze: lid ↔ zadatak, komentar i upozorenje → zadatak | Opus | xhigh | goal | nova |
| S24 | ⌘K i prečice | Opus | high | goal | nova |
| S25 | Tekst, rečnik, prazna stanja, greške | Sonnet | high | goal | nova |
| S26 | Telefon (390) | Opus | high | goal | nova |
| S27 | Dizajn sistem: čuvari, tokeni, pokret | Opus | xhigh | goal | nova |
| S28 | Performanse i pristupačnost | Opus | xhigh | goal | nova |
| S29 | Revizija: paritet, dozvole, regresije | Opus | max | goal | nova |
| S30 | Završni izveštaj, merenje, snimci | Opus | high | auto | nova |

## 9. Kraj runa
- `docs/SPAJANJE-REPORT.md` navodi:
  - šta je urađeno i šta nije;
  - BLOKADE;
  - paritet (§6) sa ishodom po redu;
  - šta Jovan ručno proverava;
  - deploy redom: Convex, pa front; VAPID promenljive; preusmerenje `notionofstartups.vercel.app`.
- Snimci glavnih ekrana su u `docs/spajanje/snimci/`.
- Merenje istim alatom kao ULTRA1 je u `docs/spajanje/merenja/`.
