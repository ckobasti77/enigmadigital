# SPAJANJE — napredak

Noćni run SPAJANJE: Enigma + Devotion u jednu internu aplikaciju. Plan: `docs/SPAJANJE-PLAN.md`. Pravila: `.nocni-run/spajanje/rules.md`. Snimak Devotiona: `.nocni-run/spajanje/tmp/devotion/` (mapa: `MAPA.md`). Svaki korak dopisuje svoju sekciju na kraj, sa svojim ODLUKAMA i BLOKADAMA.

## S01 - Arhitektura spajanja (plan)   (2026-10-29 01:25)
**Plan korak.** Plan je upisan u `docs/spajanje/planovi/S01.md`. Kod nije menjan.

## S02 — Temelj: paketi, deljena logika, šema, identitet, alat za prenos   (2026-10-29 01:55)
**Fajlovi:**
- `package.json`, `package-lock.json`: paketi P10.
- `lib/prostor/`: 26 modula, 26 testova i barel `index.ts`, preneti alatom iz `packages/shared/src`.
- `convex/prostor/schema.ts`: 51 tabela. `convex/schema.ts`: `...prostorTabele` odmah posle auth tabela i `workspaces.opis`. `convex/lib/purgeMap.ts`: 51 odluka u 7 grupa.
- `convex/prostor/lib/`:
  - adapter `auth.ts` i `permissions.ts`, `validators.ts`, `my_scope.ts`, `notifications.ts`;
  - `notificationChannels.ts`, `notificationSettingsCatalog.ts`, `notificationTarget.ts`, `page_kinds.ts`, `activity.ts`, `chat_channels.ts`, `day_key.ts`, `idea_stages.ts`, `chatPresence.ts`, `pagePresence.ts`, `pages.ts`;
  - novi `dostava.ts`, `ljudi.ts` (P9) i `radniDeo.ts` (P6, P26).
- `convex/prostor/profiles.ts`, `storage.ts` (avatar) i nov `projekat.ts`. `convex/projekti.ts`: jedan poziv u `kreirajProjekat`.
- Testovi:
  - `convex/prostor/testSvet.pomoc.ts`;
  - novi `identitet.test.ts`, `profiles.test.ts`, `projekat.test.ts`, `schema.test.ts`;
  - preneti `lib/permissions`, `lib/notificationTarget`, `lib/chatPresence`, `day-key-parity`, `idea-stages-parity`, `mentions-parity`, `activity-format-parity`, `notificationSettingsCatalog`, `pages.validator`.
- `scripts/verify-prostor-pristup.ts`, `lib/prostor-pristup-cuvar.ts` i test, unos `verify:prostor-pristup`.
- `convex/_generated/api.d.ts` (codegen).
- `.nocni-run/spajanje/alati/prenesi-backend.mjs` i `README.md`.

**Šta je urađeno:**
- Instalirani su tačni P10 paketi.
- Deljena logika je preneta u `lib/prostor/`. Alat je pri tome primenio tabelu preimenovanja (`startupId` → `workspaceId`, `startup` → `workspace`, `StartupMini` → `WorkspaceMini` …) i tekstove „startup“ → „projekat“.
- Šema radnog dela (51 tabela) je u Enigmi:
  - `startupAreas` je postala `areas`;
  - indeksi su preimenovani;
  - 20 tabela je dobilo indeks `by_workspaceId`;
  - `pages` je dobio `leadCompanyId` sa indeksom.
- `verify-purge-coverage` zna sve tabele: 196 aplikacionih + 7 auth.
- Adapter `requireClanProjekta` radi i u omotaču i van njega:
  - u omotaču proverava da dokument pripada projektu iz `ctx.projekat`;
  - van omotača proverava članstvo (bar urednik);
  - odbija `client_viewer`, arhiviran projekat i člana bez profila;
  - nad `members` koristi `.first()`;
  - menadžer je `owner` ili vlasnik platforme.
- Lični opseg čita `members.by_user`, sa granicom 50. Profil nastaje lenjo (`ensureCurrent`, `obezbediProfil`).
- `prostor/projekat.ts` nosi funkcije koje je radni deo dobijao iz Devotion `startups.ts`: oblasti, članove, opis i `pripremiRadniDeo`.
- `kreirajProjekat` sada pravi 4 podrazumevane oblasti i 5 kanala.
- Alat je isproban:
  - S02 grupa je preneta;
  - `--deljeno` je dao 0 RUČNO stavki;
  - `--suvo` za S03–S06 radi.

**Paritet:** temelj za redove 16 (oblasti, backend), 28 (opis i oblasti u podešavanjima, backend) i 34 (novi projekat sa oblastima i kanalima, backend). Ekrani nisu dirani.

**ODLUKE:**
1. **Imena indeksa.** Dva preimenovana indeksa prelaze Convexovu granicu od 64 znaka. Zato je `by_workspaceId_and_assigneeProfileId_and_taskStatus_and_archivedAt` postao `by_workspace_and_assigneeProfileId_and_taskStatus_and_archivedAt` (pages), a `by_workspaceId_and_parentAuthorProfileId_and_status_and_createdAt` postao `by_workspace_and_parentAuthorProfileId_and_status_and_createdAt` (pageNestingRequests). Alat (pravilo T7) isto radi u kodu S03–S06: kad ime pređe 64 znaka, gubi `Id`.
2. **Glob u testovima.** S01 je predvideo `import.meta.glob("../**/*.*s")`, ali iz `convex/prostor/` taj glob daje ključeve `./x.ts` za fajlove iste fascikle, pa ih `convex-test` ne nalazi. Zato je glob `/convex/**/*.*s` (koren projekta). Alat (T3) to već radi.
3. **`lib/pages.ts` ide u S02**, a ne u S03, jer ga uvozi `my_scope.ts` (`taskCompletedAt`). Fajl nema druge zavisnosti. `GRUPE` u alatu je ažurirana.
4. **`storage.ts` (avatar) je u S02** (S01 D5). S05 ga ne prenosi ponovo.
5. **Kanal oblasti zadržava ime** iz trenutka pravljenja kad se oblast preimenuje, kao u Devotionu (`updateArea` ne menja kanal). Test to proverava.
6. **`permissions.test.ts`:** tri provere `isManagerProfile` nisu prenete, jer funkcija ne postoji (zamena je `jeMenadzerProjekta`, S01 §3.2). Ista pravila (owner da, vlasnik platforme da, urednik i client_viewer ne) proverava `identitet.test.ts`. `actor()` u testu sada daje `membership.role` i izračunat `isManager`.
7. **Testovi iz `startups.test.ts › oblasti (K20)`** su u `projekat.test.ts`. Novi projekat pravi `projekti.kreirajProjekat`. „Ime, opis i logo menja samo admin“ je postalo „opis menja samo vlasnik projekta“, jer ime i logo menja Enigma. Testovi `isCurrentMember` (5) nisu preneti (S01 §1.4).
8. **`postaviOpis` je P! (`owner`).** Opis ima najviše 500 znakova, a `null` ili prazan string ga briše.
9. **`createArea` i `updateArea` beleže aktivnost** sa Devotion vrednostima `startup_updated` i `startup` (enum vrednosti ostaju, S01 D10).
10. **`dostava.zakaziDostavu` ništa ne zakazuje** do S06 (S01 D6). Do tada obaveštenje ostaje samo u Inboxu.
11. **`ensureCurrent`** prima samo `{ displayName? }`. `inviteCode` iz Devotiona se ne prenosi, jer pozivnice su Enigmine.
12. **`npm install` (npm 10.9.8) je iz lockfile-a skinuo polja `libc`** sa 10 dev binarnih paketa (`@rolldown/binding-linux-*`, `lightningcss-linux-*` pod `vite`). `npx npm@11 install` ih nije vratio. Polja služe samo za izbor glibc/musl paketa na Linuxu, a paketi su razvojni (vitest). Nije ništa vraćano, jer `git checkout` je zabranjen.
13. **Čuvar `verify:prostor-pristup` (P25)** je nov i ne menja postojeće čuvare. Pravila:
    - P1: projektni omotač nosi `uloga` (`urednik` ili `owner`);
    - P2: nema `// javno:`;
    - P3: nema `.unique()` nad `members`;
    - P4: nema `role === "admin"`;
    - P5: nema Devotion tabela.
14. **`npx convex codegen` u ovoj verziji CLI-ja šalje šemu na proveru dev deploymentu** (`start_push`). Prvi put je zato pala na predugo ime indeksa (vidi 1), a ništa nije postavljeno. To je jedina komanda koju pravila dozvoljavaju.

**Novi paketi:** `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/extension-list`, `@tiptap/extension-table` (svi 3.29.2), `@xyflow/react@12.11.2`, `web-push@3.6.7`, `read-excel-file@9.3.5`; dev `@types/web-push@3.6.4`.

**Testovi:**
- `lib/prostor`: 26 fajlova, 373 testa, svi prolaze.
- `convex/prostor`: 13 fajlova, 91 test.
  - Preneto je 9 Devotion fajlova (day-key-parity 32, permissions 16, notificationSettingsCatalog 6, pages.validator 3, idea-stages-parity 3, notificationTarget 2, activity-format-parity 2, mentions-parity 1, chatPresence 1).
  - Novi testovi:
    - `identitet.test.ts` (9): owner i urednik prolaze; client_viewer, stranac, arhiviran projekat, bez profila i dokument iz drugog projekta ne prolaze; vlasnik platforme; duplikat `members`; opseg 50; P9;
    - `profiles.test.ts` (5): `ensureCurrent` je idempotentan; početno ime; client_viewer dobija `null`;
    - `projekat.test.ts` (8): 4 iz K20; `pripremiRadniDeo` ne duplira; preimenovana oblast ostaje; client_viewer; `listForCurrent`;
    - `schema.test.ts` (3).
- `lib/prostor-pristup-cuvar.test.ts` (4).
- Ceo `npx vitest run`: 109 fajlova i 1636 testova, svi prolaze.

**Rezultat provere:**
- codegen prolazi;
- typecheck prolazi;
- lint: 0 grešaka (upozorenja su postojala i ranije);
- vitest prolazi (1636);
- pristup prolazi: 394 javne, od toga 379 omotačem i 15 `javno`, plus 32 direktna poziva na frontu;
- `verify-purge-coverage` prolazi (196);
- regresije prolaze (20 provera, uključujući `verify:prostor-pristup`).

**Za Jovana ujutru:**
- Posle deploya Convexa, novi projekat dobija oblasti Razvoj/Marketing/Prodaja/Ostalo i kanale.
- Postojeći projekti (Enigma IT) dobijaju oblasti tek kad web pozove `prostor.projekat.pripremiRadniDeo` (S09/S10).
- Lockfile je bez `libc` polja za 10 dev binarnih paketa (ODLUKA 12). Po želji, pusti `npm install` sa npm 11 na čistoj mašini.

## S03 — Backend: dokumenti, oblasti, saradnja, korpa, pretraga   (2026-10-29 02:25)
**Fajlovi:**
- `convex/prostor/` (moduli, preneti alatom pa ručno dovršeni): `areasV2.ts`, `pages.ts`, `collaboration.ts`, `comments.ts`, `history.ts`, `trash.ts`, `activity.ts`, `presence.ts`, `search.ts`, `dashboard.ts`, `canvasPlacement.ts`.
- `convex/prostor/lib/`: `collaboration.ts`, `history.ts`, `page_content.ts`, `page_creation.ts`, `page_relations.ts`, `comments.ts`, `trash.ts`, `profile_summary.ts`, `task_assignees.ts`, `task_checkpoints.ts`, `page_tables.ts`, `page_files.ts`, `task_checkpoint_canvas_edges.ts`; izmenjen adapter `auth.ts` (nova `profilKreatoraProjekta`).
- `convex/prostor/proveraOblasti.pomoc.ts`: read-only `verifyAreasV2` iz `areasV2Migrations.ts` (S01 D2).
- Testovi: preneti `areasV2.test.ts`, `canvasPlacement.test.ts`, `pages.test.ts`, `lib/task_checkpoint_canvas_edges.test.ts`; nov `dokumenti.test.ts`.
- `convex/_generated/api.d.ts` (codegen).
- `.nocni-run/spajanje/alati/README.md` (odeljak „Isprobano (S03)“).

**Šta je urađeno:**
- Alat je preneo 11 modula, 13 lib fajlova i 4 test fajla. Ostalo je 41 RUČNO stavka, i sve su zatvorene ručno.
- Polja projekta su prevedena: `archivedAt` → `arhiviran === true`, `createdByProfileId` → `vlasnikProjektaProfileId` / `profilKreatoraProjekta`.
- Upiti nad `startupMembers` prešli su na adapter: `search.pages` i `dashboard.getOverview` idu kroz `listMyActiveWorkspaces` (opseg 20, kao Devotion), a @pominjanje kroz `clanstvoProfila`.
- Svih 79 novih javnih funkcija (77 P i 2 L: `search.pages`, `dashboard.getOverview`) je na omotačima P8 sa `uloga: "urednik"`. `verify:pristup` pokazuje 473 / 458 / 15, tačno po planu S01 §7.
- Tri radnika (samo čitanje) su prošla sve izvezene funkcije. U areasV2, pages, trash, presence, activity, search, dashboard, collaboration, comments i history nije nađena nijedna rupa: svaki ID iz argumenta, i ugnežđen, proverava se za projekat pre čitanja ili upisa.
- Ponašanje je zadržano:
  - autosave sa `expectedRevision` i `KONFLIKT_IZMENA`;
  - zaključavanje (autor, vlasnik projekta, vlasnik platforme);
  - Korpa i vraćanje;
  - Istorija i „Vrati ovu verziju“;
  - @pominjanje samo članova projekta;
  - aktivnost;
  - prisustvo sa TTL od 45 s;
  - pretraga po projektu.

  Sve to dokazuje nov `dokumenti.test.ts`.

**Paritet:** backend za redove 16 (oblasti, opis oblasti), 17 (stablo stranica), 18 (autosave i konflikt), 19 (prisustvo, zaključavanje, podstranice, povezano), 20 (komentari sa @), 21 (istorija), 24 (Mapa oblasti i stranice, `areasV2`), 25 (Korpa: stranice; ideje i prilozi dobijaju module u S05), 26 (aktivnost) i 30 (pretraga stranica). Ekrani nisu dirani; UI dolazi u S10–S24.

**ODLUKE:**
1. **Test „automatic layout … migrated collisions“ je zadržan skraćen**, iako plan (S01 §1.4) kaže da se ne prenosi.
   - Raspored novih kartica i nalaz verifikatora (`issueCount` 1 posle sudara) ostaju.
   - Uklonjeni su samo koraci `backfillPlacements` (popravka i idempotentnost), jer migracije ne postoje (P21).
   - Konzervativnije je zadržati više provera nego ceo blok izbaciti.
   - „collision repair …“ i „backfill je idempotentan …“ nisu preneti, po planu.
   - Zato `areasV2` ima 25/27 blokova, a ne 24/27.
2. **Poruka pristupa u testovima:** `toThrow("Nemate pristup")` (4 mesta) je sada `toThrow("Nemaš pristup")`.
   - Devotion „Nemate pristup ovom startupu.“ je po S01 §3.8 postalo omotačevo „Nemaš pristup ovom projektu.“
   - Provera nije oslabljena, nego je promenjen samo tekst. Stranac i dalje šalje `workspaceId` projekta dokumenta.
3. **Vlasnik cilja komentara (oblast)** je profil kreatora projekta (`workspaces.createdBy`).
   - Ako ga nema, vrednost je `null`: niko ne moderira tuđe komentare oblasti, a odbijen komentar vidi samo autor.
   - Zamenski profil pozivaoca bi svakom članu dao moderaciju.
   - Za `areaBodies.ownerProfileId` (obavezno polje, prava ne daje) i za prikaz na mapi zamena je profil pozivaoca, po S01 §3.1.
4. **`search.pages` vraća `workspace` kao `WorkspaceMini`** (`_id`, ime, logo), a ne ceo `workspaces` red, koji nosi Enigmina podešavanja (`mozak`, `podesavanja`, `moduli`). Devotion web čita samo `workspace?.name`.
   - `dashboard.getOverview` isto vraća mini plus oblasti, sortirano po redosledu članstva, jer `workspaces` nema `updatedAt`.
   - `summary.startupCount` zadržava ime (D10).
5. **`verifyAreasV2` se zove preko `makeFunctionReference`** sa tipovima (`prostor/proveraOblasti.pomoc:verifyAreasV2`), jer `.pomoc` modul nije u `internal`.
   - Uzorci grešaka sada pišu `areas:` umesto `startupAreas:`. Testovi proveravaju samo broj nalaza.
6. **Poznato, nije menjano (Devotion ponašanje):**
   - „orakl postojanja“: tuđ živ dokument vraća „Stavka nije pronađena u ovom projektu.“, a nepostojeći „Stranica nije pronađena.“; to je S01 §9.11;
   - `activity.listForStartup`, `pages.get` i `dashboard` vraćaju cele profile (sa email-om) članova istog projekta;
   - `listContributionsPaginated` nema gornju granicu `numItems`.

   Ništa od toga ne prelazi granicu projekta.
7. **`pageFiles` upis ne postoji u S03.** Kad S05 prenese upload, upis mora da proveri da je projekat stranice jednak `workspaceId` fajla (napomena radnika).
8. `npx convex codegen --typecheck disable` je pušten jednom, da bi `api.d.ts` dobio `prostor/*` pre ručnih popravki. Završni `npx convex codegen` (sa typecheck-om) prolazi.

**Novi paketi:** nema.

**Testovi:**
- Preneto je 35 blokova:
  - `areasV2` 25 (od 27; vidi ODLUKU 1);
  - `pages` 8;
  - `canvasPlacement` 1;
  - `lib/task_checkpoint_canvas_edges` 1.
- Nov je `dokumenti.test.ts` sa 10 testova:
  - izolacija: dokument projekta A uz `workspaceId` B se odbija u 9 funkcija i ništa se ne upisuje;
  - klijent, stranac i neprijavljen ne ulaze;
  - `KONFLIKT_IZMENA`;
  - zaključavanje (3 dozvoljene uloge, kolega odbijen, `ZAKLJUCANO` za izmenu);
  - Korpa i vraćanje, sa praznom Korpom drugog projekta;
  - „Vrati ovu verziju“;
  - @pominjanje bez stranca;
  - aktivnost po projektu;
  - prisustvo TTL i odlazak;
  - pretraga po projektu i preko svih mojih projekata.
- `convex/prostor` sada ima 19 fajlova i 136 testova.
- Ceo `npx vitest run`: 114 fajlova i 1681 test, svi prolaze.

**Rezultat provere:**
- codegen prolazi;
- typecheck prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest prolazi (1681);
- pristup: 473 / 458 / 15, bez novih izuzetaka;
- `verify-purge-coverage` 196;
- regresije: 20 provera prolazi, uključujući `verify:prostor-pristup`.

**Za Jovana ujutru:**
- Ništa nije deployovano.
- Posle deploya, `areasV2`, `pages` i ostali moduli rade samo kroz `api.prostor.*` sa `workspaceId`. Web ih dobija u S08+.
- Odluči da li „orakl postojanja“ (ODLUKA 6) treba ujednačiti u jednu grešku.
- Odluči da li puni profili članova (email) u odgovorima ostaju.

## S04 — Backend: zadaci, lični zadaci, Moj dan, Puls tima   (2026-10-29 02:50)
**Fajlovi:**
- `convex/prostor/` (preneto alatom pa ručno dovršeno): `tasks.ts`, `taskCheckpoints.ts`, `taskAssignees.ts`, `taskCheckpointCanvasEdges.ts`, `personalTasks.ts`, `myDay.ts`, `puls.ts` (puls tima; Enigmin `convex/puls.ts` nije diran).
- `convex/prostor/lib/`:
  - nov `my_day.ts`;
  - izmenjen `task_assignees.ts`: `archiveAssignmentsForProfile` sa projektom čita indeks projekta;
  - izmenjen `radniDeo.ts`: nov `ukloniClanaIzRadnogDela` (D23).
- `convex/membersStore.ts`: jedan poziv `ukloniClanaIzRadnogDela` u `removeMember` (D23), pre brisanja članstva.
- Testovi:
  - preneti `tasks.test.ts`, `tasks.bulk.test.ts`, `taskAssignees.test.ts`, `taskCheckpoints.test.ts`, `personalTasks.test.ts`, `myDay.test.ts`, `puls.test.ts`;
  - nov `zadaci.test.ts`.
- `convex/_generated/api.d.ts` (codegen).
- `.nocni-run/spajanje/alati/README.md` (odeljak „Isprobano (S04)“).

**Šta je urađeno:**
- Alat je preneo 7 modula, `lib/my_day` i 7 test fajlova. Ostala je 21 RUČNO stavka, i sve su zatvorene ručno. Četiri radnika (Sonnet) su dovršila test fajlove, svaki svoje. Diff i provere su pregledani pre prihvatanja.
- Projektne funkcije su na `projekatQuery/Mutation` sa `uloga: "urednik"`:
  - `tasks` (osim `listMine` i `listEverywhere`);
  - `taskCheckpoints`, `taskAssignees`, `taskCheckpointCanvasEdges`;
  - `personalTasks.moveToStartup`;
  - `puls.getWeekly`.
- Lične funkcije su na `prijavljen*`: `tasks.listMine`, `tasks.listEverywhere`, `personalTasks.*` i `myDay.*`.
- `verify:pristup` pokazuje **514 / 499 / 15**, tačno po S01 §7, bez novih izuzetaka.
- Lični nivo čita moje projekte kroz `listMyActiveWorkspaces`:
  - čita `members.by_user`;
  - preskače `client_viewer` i arhivirane projekte;
  - opseg je 50.
- Provera članstva u `tasks.listMine` i `lib/my_day.getPlannableTask` više ne čita `startupMembers`. Sada pita `clanstvoProfila` (owner/urednik, `.first()`). `listMine` vraća `workspace` kao mini (`_id`, ime, logo), a ne ceo `workspaces` red.
- Puls tima čita ljude kroz `aktivniClanoviProjekta` (P9: owner/urednik sa profilom, bez duplikata).
- `sendWeeklyPulsNotifications` ostaje nepozvana (Devotion P9, nema crona) i prolazi kroz projekte koji nisu arhivirani.
- Zadržano je sledeće:
  - status, prioritet, rok, izvršioci, koraci (lanac, Undo 8 s, mapa) i instrukcije sa istorijom;
  - „Sredi rokove“ (`bulkReschedule` / `bulkRestoreSchedule` sa revizijom);
  - „Zastarelo“ (podaci iz `commandCenter`, logika u `lib/prostor/stale.ts`);
  - lični zadaci i „Premesti u projekat“ (plan dana prati zadatak);
  - Moj dan: plan, redosled, prenos nezavršenog (`carryOver`) i čišćenje starog (`clearOld`);
  - nedeljni puls tima.
- D23: član kog vlasnik ukloni iz projekta skida se sa zadataka tog projekta. Zadaci drugih projekata ostaju, i to proverava test.

**Paritet:** backend za redove:
- 1 (Moj dan);
- 3 (Moji zadaci);
- 4 (lični zadaci, „Premesti u projekat“);
- 10 (Trijaža: Sredi rokove, Zastarelo; `commandCenter`);
- 11 (zadaci tima: lista, osoba, radnje);
- 12 (zadatak: status, prioritet, rok, izvršioci, koraci, instrukcije);
- 27 (puls nedelje).

Ekrani nisu dirani; UI dolazi u S12, S16, S19 i S20.

**ODLUKE:**
1. **`archiveAssignmentsForProfile` sa projektom čita `by_workspace_profile_active_sort`.**
   - Devotion je čitao `by_profile_active_sort` (`take(limit + 1)`) pa filtrirao po projektu. Član mnogih projekata bi zato pri uklanjanju iz jednog tiho ostao na delu zadataka tog projekta.
   - Granica (250) i greška preko nje ostaju.
   - Funkcija je iz S03, ali je njen jedini pozivalac D23 iz ovog koraka.
2. **D23 ide kroz `ukloniClanaIzRadnogDela(ctx, { workspaceId, userId, now })`** u `radniDeo.ts`.
   - Poziva se u `membersStore.removeMember`, pre brisanja `members` redova.
   - Korisnik bez profila se preskače.
   - Preko 250 zadataka `removeMember` pada sa Devotion porukom („Prvo ih preraspodelite.“), kao Devotion `startups.removeMember`.
3. **`puls.getWeekly.startupCreatedAt`** zadržava ime (D10). Vrednost je `workspace._creationTime`, jer `workspaces` nema `createdAt`.
4. **`sendWeeklyPulsNotifications`:**
   - `workspaces` nema indeks po arhivi, pa funkcija ide prolazom (`for await`) i staje na 200 projekata koji nisu arhivirani, kao Devotion granica;
   - funkciju ništa ne poziva (Devotion P9).
5. **Ugovorne vrednosti ostaju (D10):** razlog preskakanja `"drugi_startup"` u „Sredi rokove“ i `targetType: "startup"` u aktivnosti.
6. **Test „uklanjanje člana … skida ga sa zadatka“** sada zove `membersStore.removeMember` kao vlasnik projekta (`userId`, `preuzimaLeadoveUserId`). Devotion `startups.removeMember` ne postoji, a u Enigmi člana uklanja vlasnik projekta, ne admin (plan S01 §1.4).
7. **Seed u `taskAssignees.test`:** admin se pravi kroz `insertProfil` sa `role: "admin"`, pa je vlasnik platforme. Devotion je radio `patch` posle upisa, što u Enigmi ne bi dalo prava.
8. **Seed `tasks.test › seedEverywhere`:** projekat „Napušten“ sada briše `owner` red kreatora (`ukloniClanstvo`). `insertStartup` kreatoru daje članstvo, a Devotion ga nije davao.
9. **T0 u `tasks.bulk.test`:**
   - `Date.UTC(2026, 9, 26, 10, 0)` je danas prošlost.
   - convex-test 0.0.65 ne pušta sat transakcije unazad od poslednjeg upisa, a seed piše pravim satom. Zato su 3 testa padala.
   - T0 je sada `Date.UTC(2030, 9, 26, 10, 0)`: isti dan i sat, fiksno u budućnosti. Asercije zavise samo od redosleda.
10. **Očekivani tekstovi u testovima.** Provera nije oslabljena, promenjen je samo tekst:
    - „Nemate pristup ovom startupu.“ → „Nemaš pristup ovom projektu.“;
    - „mora pripadati ovom startupu“ → „… projektu“;
    - „deaktiviran“ → „Profil još nije spreman“ (deaktiviran profil adapter tretira kao „nema profila“, S02);
    - „Oblast nije pronađena u ovom startupu.“ i poruke za „Premesti u projekat“ preveo je alat (S01 §3.8);
    - u `myDay.test` spisak ključeva stavke sadrži `workspace` umesto `startup`.
11. **Nisu preneta 3 bloka, po planu S01 §1.4.** Na njihovom mestu je jednoredni komentar:
    - `taskAssignees` „arhiviranje profila …“: nema globalne arhive profila;
    - `taskAssignees` „verifier … čekaju backfill“: migracije se ne prenose (P21);
    - `taskCheckpoints` „legacy backfill je idempotentan …“: migracije se ne prenose (P21).

**Novi paketi:** nema.

**Testovi:**
- Preneto je **99 blokova**, tačno po S01 §5.4:
  - tasks 14, tasks.bulk 23;
  - taskAssignees 9 od 11, taskCheckpoints 12 od 13;
  - personalTasks 13, myDay 17, puls 11.
- Nov je `zadaci.test.ts` sa 9 testova:
  - lični nivo (Moj dan, `listEverywhere`, `listMine`) vidi samo projekte u kojima sam `owner`/`urednik`. Projekat u kome sam client_viewer i arhiviran projekat ne ulaze ni kroz filter ni kroz plan dana;
  - projektni ekrani (`commandCenter`, `puls.getWeekly`) projekta u kome sam client_viewer su zatvoreni;
  - puls tima ne pokazuje client_viewer kao člana (P9);
  - 51 projekat daje 50, najnovije članstvo prvo;
  - izolacija:
    - zadatak drugog projekta se odbija u `updateMetadata`, `taskCheckpoints.create/listForTask` i `taskAssignees.leave`;
    - `listForTasks` ga preskače;
    - „Sredi rokove“ ga preskače kao `drugi_startup`;
    - ništa se ne upisuje;
  - stranac i client_viewer ne ulaze;
  - „Premesti u projekat“ ne ide u projekat u kome sam client_viewer, ni u oblast drugog projekta;
  - D23: uklanjanje iz A skida člana sa zadatka u A, a zadatak u B ostaje.
- Paritet sa `lib/prostor`: ovi moduli nemaju Devotion parity test. Zajedničku logiku (`day_key`) već pokriva `day-key-parity.test.ts` (S02).
- `convex/prostor` sada ima 26 fajlova i 244 testa.
- Ceo `npx vitest run`: 122 fajla i 1789 testova, svi prolaze.

**Rezultat provere:**
- codegen prolazi;
- typecheck prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest prolazi (1789);
- pristup: 514 / 499 / 15, bez novih izuzetaka;
- `verify:purge` 196 (nema novih tabela);
- regresije: 20 provera prolazi, uključujući `verify:prostor-pristup`.

**Za Jovana ujutru:**
- Ništa nije deployovano.
- Posle deploya, uklanjanje člana u Pristupu ga skida i sa zadataka tog projekta. Ako član ima više od 250 aktivnih zadataka u projektu, uklanjanje pada dok se zadaci ne preraspodele (Devotion pravilo).
- Deaktiviran profil u radnom delu dobija poruku „Profil još nije spreman. Osveži stranicu.“ (adapter iz S02), a ne posebnu poruku o deaktivaciji. Odluči da li treba posebna poruka.

## S05 — Backend: ideje, beleške, mape, tabele, fajlovi, AI   (2026-10-29 03:17)
**Fajlovi:**
- `convex/prostor/` (preneto alatom pa ručno dovršeno): `ideas.ts`, `thoughts.ts`, `canvases.ts`, `pageTables.ts`, `pageFiles.ts`, `aiProviders.ts`.
- `convex/prostor/lib/otpremanje.ts` (nov): `tudjiBlob`, pravilo „čiji je blob“ za priloge i avatar.
- `convex/prostor/storage.ts` (S02, avatar): `setAvatar` dobio istu proveru bloba.
- Testovi:
  - preneti `ideas`, `ideas.stage`, `thoughts.notes`, `pageFiles`, `pageTables`, `aiProviders`, `collaboration`, `comments`, `moves`, `pages.collaboration`, `pages.security`, `prostor.authz`, `search`, `trash`, `trash.nodelete` (`*.test.ts`);
  - nov `sadrzaj.test.ts`.
- `convex/_generated/api.d.ts` (codegen).
- `.nocni-run/spajanje/alati/README.md` (odeljak „Isprobano (S05)“).

**Šta je urađeno:**
- Alat je preneo 6 modula i 15 test fajlova. Ostalo je 6 RUČNO stavki, sve zatvorene. Moduli su posle alata imali 0 grešaka typecheck-a, a testovi 368 (skoro sve „nedostaje `workspaceId`“).
- Pet radnika (Sonnet) je dovršilo testove, svaki svoje fajlove. Module nisu menjali. Diff, broj blokova i broj `expect(` su pregledani pre prihvatanja.
- Svih 71 novih javnih funkcija je na omotačima P8:
  - `ideas` (15), `canvases` (8) i `pageTables` (10) su P;
  - `pageFiles` (7) je P;
  - `thoughts` ima 9 P i 17 L;
  - `aiProviders` (5) je P!.
- `verify:pristup` pokazuje **585 / 570 / 15**, tačno po S01 §7, bez novih izuzetaka.
- `aiProviders` (D14): omotač traži `owner` projekta, a handler još i vlasnika platforme (Devotion `profile.role === "admin"`). Ključ ne izlazi iz javnih funkcija (`toPublic`). Čitaju ga samo `getDefaultProviderWithKey` i `getWithKey`, obe interne. AI se nigde ne poziva.
- Otpremanje radi kroz svoje tabele: `pageFileUploads` za priloge, `avatarUploads` za avatar. Enigmin `projekatUploadi` nije menjan, samo se čita.
- „Pošalji u projekat“ (`thoughts.convertToIdeas`) prima beleške iz drugog mog projekta: izvor se proverava bez `ctx.projekat` (ODLUKA 2).
- Zadržano je sledeće:
  - ideje: faze (predlog, razmatra se, odobreno, odbijeno), glasanje, „Postalo zadatak“ (`convertToPage`);
  - beleške: lične (`workspaceId: null`) i projektne, „Pošalji u projekat“, pretraga mojih (`searchMine`);
  - mape: položaji, veze, viewport, ugnežđavanje (`thoughts`, `ideas`, v1 `canvases`);
  - tabele: kolone, redovi, ograničenja, uvoz;
  - prilozi: otpremanje sa dozvolom, uklanjanje u Korpu (blob ostaje), čišćenje beleške;
  - avatar.

**Paritet:** backend za redove:
- 7 (Beleške: moje misli iz svih projekata, „Pošalji u projekat“, pretraga mojih);
- 8 (Mapa beleški projekta);
- 9 (avatar: provera bloba; ostatak profila je iz S02);
- 13 (Ideje: faze, glasanje, „Postalo zadatak“);
- 14 (Mapa ideja);
- 22 (Stranica-tabela: kolone, redovi, uvoz);
- 23 (Stranica-fajl i prilozi);
- 24 (v1 API mape `canvases`, D3; Mapa oblasti je `areasV2` iz S03);
- 25 (Korpa: ideje i prilozi; stranice su iz S03);
- 29 (AI provajderi po projektu, backend za karticu „AI“ iz S21).

Ekrani nisu dirani.

**ODLUKE:**
1. **Tuđ blob se ne prima i ne briše (`lib/otpremanje.ts`).**
   - Devotion `attach` je u granama odbijanja (istekla dozvola, nepodržan tip, preveliki fajl, limit) brisao blob iz argumenta. Proveravao je samo da blob nije već prilog. Član je tako mogao da podmetne ID loga projekta, slike objave ili tuđeg avatara i da ga obriše.
   - Isto važi za `setAvatar`: sledeća promena avatara briše prethodni blob.
   - Zato se blob prihvata samo ako je nastao posle dozvole (`_creationTime ≥ dozvola._creationTime`) i ako ga ne drži niko drugi: prilog, avatar drugog profila, prilog poruke, red u `projekatUploadi`, logo ili ikonica projekta, fajl IG/Threads objave.
   - Inače se baca „Fajl nije pronađen. Pošalji ga ponovo.“ („Slika nije pronađena …“ za avatar), a blob se ne dira. Ovo je Enigmino pravilo iz C19 (rok i vlasništvo), primenjeno bez izmene `projekatUploadi`.
   - S06 treba da ga primeni i na otpremanje u četu, ako ono briše blob.
2. **`convertToIdeas` proverava izvor bez `ctx.projekat`.**
   - Omotač proverava CILJ. Adapter bi zato belešku iz drugog mog projekta odbio sa „Stavka nije pronađena u ovom projektu.“, a Devotion to dozvoljava (test „fromA → B“).
   - Izvor se sada proverava kao na ličnom nivou: `requireProjekat(…, "urednik")`, uz kontekst `{ ...ctx, projekat: undefined }`.
   - Autor koji je u izvoru postao client_viewer ne može da pošalje belešku (nov test).
3. **AI gate:** `requireStartupAdmin` posle adaptera traži `jeVlasnikPlatforme` i baca `ConvexError(PORUKE.platforma)` („Ovu radnju može da izvede samo vlasnik platforme.“).
   - Urednik pada već na omotaču („samo vlasnik projekta“). Zato je 5 provera `toThrow("administratorski")` u `aiProviders.test` postalo „samo vlasnik projekta“.
   - Radnik je u postojeći test dodao osobu „owner, a nije vlasnik platforme“ i 5 provera „samo vlasnik platforme“. Novih blokova nema.
4. **Nisu preneti blokovi, po planu S01 §1.4:** samo `pages.security › „legacy body backfill ne duplira canonical ni raniji bodyId zapis“` (migracije, P21), sa jednorednim komentarom. Zato `pages.security` ima 16 od 17 blokova i 87 od 91 `expect(`; tačno 4 su bila u tom bloku.
5. **Očekivani tekstovi u testovima.** Provera nije oslabljena, promenjen je samo tekst:
   - „Nemate pristup“ → „Nemaš pristup“ (comments 2, moves 3, trash 4);
   - „deaktiviran“ → „Profil još nije spreman. Osveži stranicu.“ (pages.collaboration 3, trash 1, prostor.authz 6), jer adapter deaktiviran profil tretira kao „nema profila“ (S02);
   - „Fazu ideje menja autor, vlasnik startupa ili admin.“ i „Ideju pretvara njen autor, vlasnik startupa ili admin.“ → „… autor ili vlasnik projekta.“ (`lib/idea_stages`, S02);
   - `aiProviders` „pristup“ → „Nemaš pristup“.
6. **Sat u testovima** (convex-test 0.0.65 ne pušta sat transakcije unazad od poslednjeg upisa, kao S04 ODLUKA 9):
   - `comments`: `T0` je `Date.UTC(2030, 9, 28, 10, 0)`, isti dan u nedelji i isti sat, umesto `Date.UTC(2026, 9, 26, 10, 0)`. „Poništi radi 8 s“ je inače padao.
   - `pages.collaboration › prisustvo`: `vi.setSystemTime(T0 + 1000)` posle seed-a, a `expiresAt` se računa od toga.
   - `prostor.authz`: `archivedAt` komentara se poredi sa vrednošću pročitanom odmah posle `comments.remove`, umesto sa `T0`. Transakcija sa zamrznutim satom pada na `T0 + 1`. Provera „vraćanje ne menja `archivedAt`“ ostaje, uz jednu proveru više.
7. **Seed:** upiti nad `startupMembers` (comments ×2, prostor.authz ×1) idu nad `members.by_user_workspace` sa `.first()` pa `ukloniClanstvo`. `ideas.test` zove verifikator kroz `makeFunctionReference("prostor/proveraOblasti.pomoc:verifyAreasV2")`, kao `areasV2.test` (S03).
8. **Kozmetika:** alat ostavlja `args: { }` kad briše jedini `workspaceId`. U S05 modulima je to `args: {}`, a S03 moduli nisu dirani. Nekorišćen uvoz `query` u `thoughts.ts` je uklonjen (lint).

**Novi paketi:** nema.

**Testovi:**
- Preneto je **157 blokova**, tačno po S01 §5.4:
  - ideas 2, ideas.stage 7, thoughts.notes 9;
  - pageFiles 14, pageTables 11, aiProviders 12;
  - collaboration 10, comments 29, moves 7, pages.collaboration 11;
  - pages.security 16 od 17, prostor.authz 8, search 5;
  - trash 13, trash.nodelete 3.
- Broj `expect(` je jednak Devotionu u 12 fajlova. Veći je u `aiProviders` (ODLUKA 3) i `prostor.authz` (ODLUKA 6), a manji u `pages.security` (ODLUKA 4).
- Nov je `sadrzaj.test.ts` sa 7 testova:
  - ključ AI provajdera nije ni u jednom odgovoru javnih funkcija (`list`, `create`, `update`, `setDefault`, `remove`). Spisak javnih funkcija modula je ugovor, pa nova javna funkcija obara test. Greška ne nosi ključ, a interna `getWithKey` ga vraća;
  - AI: urednik, owner koji nije vlasnik platforme i client_viewer su odbijeni, i ništa se ne upisuje;
  - izolacija: ideja, tabela, prilog, AI provajder, misao i oblast projekta A se odbijaju pod projektom B (ideas ×3, pageTables ×2, pageFiles ×2, aiProviders ×2, thoughts.createEdge, canvases), i ništa se ne upisuje;
  - client_viewer ne ulazi ni u projektne funkcije (ideas, thoughts, pageTables, pageFiles, canvases) ni u lične sa projektom (`createNote`, `listMine`);
  - prilog odbija blob stariji od dozvole, logo projekta i tuđ avatar, a sva tri bloba ostaju;
  - avatar odbija stari i prijavljen Enigmin fajl, a sopstvena promena briše samo svoj prethodni blob;
  - „Pošalji u projekat“ iz A u B radi; cilj u kome sam client_viewer i izvor u kome je autor postao client_viewer se odbijaju.
- `convex/prostor` sada ima 42 fajla i 409 testova.
- Ceo `npx vitest run`: 138 fajlova i 1954 testa, svi prolaze.

**Rezultat provere:**
- codegen prolazi;
- typecheck prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest prolazi (1954);
- pristup: 585 / 570 / 15, bez novih izuzetaka;
- `verify-purge-coverage` 196 (nema novih tabela);
- regresije: 20 provera prolazi, uključujući `verify:prostor-pristup` (62 fajla).

**Za Jovana ujutru:**
- Ništa nije deployovano.
- `aiProviders.apiKey` je u bazi nešifrovan (D14, kao u Devotionu). Predlog: šifrovati ga kroz `convex/lib/crypto.ts` pre nego što kartica „AI“ (S21) ode u produkciju.
- AI provajdere vodi samo vlasnik projekta koji je i vlasnik platforme. Odluči da li vlasnik klijentskog projekta treba da ih vodi sam.
- Prilog ili avatar čiji je blob nastao pre dozvole sada se odbija (ODLUKA 1). Normalan tok (dozvola → otpremanje → `attach`) ne pogađa. Ako web nekad otprema pre nego što uzme dozvolu, to mora da obrne.

## S06 — Backend: poruke, obaveštenja, push, podsetnici, lozinke   (2026-10-29 03:55)
**Fajlovi:**
- `convex/prostor/` (preneto alatom pa ručno dovršeno): `chat.ts`, `notifications.ts`, `inbox.ts`, `notificationSettings.ts`, `pushSubscriptions.ts`, `push.ts` (`"use node"`), `expoPush.ts`, `expoPushTokens.ts`, `pushTest.ts`; `adminAuth.ts` prepisan po S01 §3.6d.
- `convex/prostor/lib/`:
  - nov `lozinka.ts` (D13);
  - `dostava.ts`: `zakaziDostavu` sada zakazuje `push.deliver` i `expoPush.deliver` (D6);
  - `ljudi.ts`: nova `delimProjekatSa` (P9);
  - `radniDeo.ts`: `ukloniClanaIzRadnogDela` izuzima i listić starog glasanja (ODLUKA 11).
- `convex/crons.ts`: posao „podsetnici za rokove“ (6 h). Ostalih 30 poslova nije dirano.
- Testovi:
  - preneti `chat`, `chat.personal`, `chat.validator`, `inbox`, `inbox.ideaVote`, `notifications`, `expoPush`, `adminAuth`, `crons`, `legacyFlows` (`*.test.ts`);
  - novi `obavestenja.test.ts` i `poruke.test.ts`; novi blokovi u `adminAuth.test.ts`.
- `convex/_generated/api.d.ts` (codegen).
- `.nocni-run/spajanje/alati/README.md` (odeljak „Isprobano (S06)“).

**Šta je urađeno:**
- Alat je preneo 10 modula i 10 test fajlova, sa 27 RUČNO stavki. Sve su zatvorene ručno. Tri radnika (Sonnet) su dovršila po jednu grupu testova (chat.personal; chat, inbox, inbox.ideaVote; notifications, legacyFlows). Module nisu menjali. Diff, broj blokova i broj `expect(` su pregledani pre prihvatanja, a jedna izmena radnika je vraćena (ODLUKA 11).
- Sve nove javne funkcije su na omotačima P8, tačno po S01 §3.5:
  - `chat`: 6 P (`listChannels`, `channelForAnchor`, `listDirectMessages`, `listFollowedThreads`, `sendToAnchor`, `openDirectMessage`) i 22 L;
  - `notifications`: 4 P (`list`, `latest`, `unreadCount`, `markAllRead`) i L `markRead`;
  - `inbox`, `notificationSettings`, `pushSubscriptions`, `expoPushTokens`: sve L;
  - `adminAuth.adminSetPassword`: P! (akcija); `pushTest.sendTest` je interna (D12).
- `verify:pristup` pokazuje **632 / 617 / 15**, tačno po S01 §7, bez novih izuzetaka.
- Poruke:
  - kanali po oblasti, opšti kanal, lični DM i grupe, članstvo, pročitano, prisustvo, reakcije, niti i pretraga rade kao u Devotionu;
  - primaoci kanala projekta idu kroz `aktivniClanoviProjekta` (owner/urednik sa profilom), pa client_viewer ne dobija ni poruke ni obaveštenja;
  - `listPeople` ide kroz `ljudiSaKojimaDelim` (P9);
  - Devotion „admin“ (`profile.role`, 4 mesta) je vlasnik platforme (`jeVlasnikPlatforme`).
- Obaveštenja:
  - `createNotification` ostaje jedini put; posle upisa zakazuje web i Expo dostavu;
  - web push šalje samo kad postoje sve tri `VAPID_*` promenljive, inače vraća `skipped` bez slanja (test);
  - Expo push ostaje uspavan: bez sačuvanog tokena ništa ne šalje (test);
  - Inbox (feed, nepročitano, „Čeka tebe“) i bedž za telefon čitaju moje projekte kroz `listMyActiveWorkspaces` (Enigmino članstvo, bez client_viewer i arhiviranih).
- `adminSetPassword`: omotač traži vlasnika projekta, a interna autorizacija i vlasnika platforme. Meta mora biti owner/urednik tog projekta. Pravila lozinke su Enigmina (8–128), a sesije mete se gase. Devotion `resetAdminPassword` nije prenet.
- Podsetnici za rokove su fan-out po projektu, sa kursorom i bez odsecanja (D11). Cron je u `convex/crons.ts`.

**Zbir backenda prema S01 §1 (kraj S02–S06):**
- Tabele: **51** u `convex/prostor/schema.ts`; `verify:purge` 196 aplikacionih (+7 auth).
- Moduli: **37** u `convex/prostor/`, to jest 36 Devotion modula (sa `canvasPlacement`) plus `projekat.ts` sa 6 funkcija iz `startups.ts` i 2 nove. Ne prenose se `migrations`, `areasV2Migrations`, `invites` ni `startups` (zamenjuje ih Enigma).
- Lib: **35** fajlova u `convex/prostor/lib/` (30 Devotion + `dostava`, `radniDeo`, `ljudi`, `lozinka`, `otpremanje`); `access_errors` i `onboarding` nisu preneti (D21).
- Javne funkcije: **253** nove (632 − 379), sve kroz omotač, 0 novih `// javno:`.
- Interne funkcije: **19**, to jest 17 prenetih iz Devotiona, nova `remindDueTasksForWorkspace` i `pushTest.sendTest` (bila javna, D12). Uz njih je `verifyAreasV2` u `.pomoc` fajlu, samo za testove.
- Testovi: preneto **474** bloka (473 po S01 §5.4, plus 1 iz S03 ODLUKE 1); `convex/prostor` ima 54 fajla i 570 testova; deljena logika `lib/prostor` ima 26 fajlova i 373 testa.

**Env promenljive koje push traži (samo imena):**
- Convex: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (sve tri obavezne za web push), `EXPO_ACCESS_TOKEN` (opciono, za Expo; telefon dolazi kasnije).
- Web: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (pretplata iz browsera, S17).

**Paritet:**
- 31 (podsetnici za rokove, cron 6 h): urađeno, sa testom.
- Backend za redove:
  - 5 (Inbox: obaveštenja iz svih projekata, nepročitano, „Čeka tebe“);
  - 6 i 15 (poruke: lični DM, grupe, kanali projekta, reakcije, prisustvo, pretraga);
  - 9 (podešavanja obaveštenja, tiho vreme, pretplata za web push);
  - 28 (lozinka člana);
  - 32 (web push).
- Ekrani nisu dirani: S15 (poruke), S17 (zvono, Inbox, push), S21/S22 (lozinke). Enigmino zvono nije dirano.

**ODLUKE:**
1. **P9 važi i za započinjanje razgovora, ne samo za spisak.**
   - `openPersonalDm`, `createPersonalGroup` i NOVI članovi u `updatePersonalGroup` traže da pozivalac i druga osoba dele bar jedan aktivan projekat kao owner/urednik (`lib/ljudi.delimProjekatSa`). Inače: „Sa ovom osobom ne deliš nijedan projekat.“
   - Devotion je dozvoljavao razgovor sa bilo kim („instanca je jedan tim“). U Enigmi bi poznat ID profila zaobišao spisak ljudi i otvorio razgovor sa strancem ili klijentom.
   - Postojeći razgovori i grupe rade dalje kroz članstvo u razgovoru. `openPersonalDm` ka osobi sa kojom više ne delim projekat odbija i kad DM već postoji; razgovor ostaje dostupan iz spiska razgovora.
   - Test „radi i bez zajedničkog startupa (instanca je jedan tim)“ je postao „P9: bez zajedničkog projekta se razgovor ne otvara, sa zajedničkim radi“. U seed-u chat.personal Vesna je dodata u projekat A, a dodat je „Stranac“ bez projekta (detalji u 13).
2. **Admin u četu je vlasnik platforme** (`jeVlasnikPlatforme(profile.userId)`): nov kanal tima (`createChannel`), članovi kanala (`setChannelMembers`), arhiviranje kanala i brisanje tuđe poruke. Vlasnik projekta to ne može, kao ni Devotion vlasnik startupa. Tekst „Poruku može obrisati samo autor ili administrator.“ je postao „… autor ili vlasnik platforme.“.
3. **Prilog poruke: pravilo „čiji je blob“ iz S05 (ODLUKA 1).** `requireUnattachedBlob` sada zove `tudjiBlob` (prilog stranice, prilog poruke, tuđ avatar, Enigmin upload, logo, fajl objave) i radi i kad prilog prolazi, ne samo pre brisanja. Inače bi odbijen prilog sa podmetnutim ID-jem velikog Enigminog fajla (npr. YouTube videa) obrisao taj fajl, a prihvaćen bi tuđ fajl dobio adresu u poruci. Čet nema tabelu dozvola, pa se rok dozvole ne proverava. Poruka ostaje Devotionova: „Ovaj fajl je već zakačen.“
4. **Web push traži sve tri `VAPID_*` promenljive.** Devotion je bez `VAPID_SUBJECT` slao sa izmišljenom adresom `mailto:admin@example.com`; ovde se tada ne šalje ništa (`skipped`).
5. **`zakaziDostavu` uvek zakazuje obe grane** (Devotion paritet; test `expoPush › paralelna dostava` očekuje 2). Provera promenljivih je u `push.deliver`, a provera tokena u `expoPush.deliver`; bez njih obe vraćaju `skipped` i ništa ne izlazi.
6. **Podsetnici: 40 zadataka po transakciji, ne 100 (S01 §3.6e).** Svaki primalac zakazuje dve dostave, a mutacija sme najviše 1.000 zakazanih poslova: 100 × 10 izvršilaca × 2 bi to probilo, a 40 × 10 × 2 = 800 ne. Projekti idu po 50 na strani. `workspaces` nema indeks po arhivi, pa strana čita sve projekte i preskače arhivirane; posao projekta ponovo proverava arhivu. Nastavci nose isti `now`.
7. **Testovi starog `remindDueTasks` zovu `remindDueTasksForWorkspace`** (vraća `{ created, scanned }` kao Devotion), pa `created` asercije ostaju doslovne. Ceo cron (fan-out, 150 zadataka, 52 projekta, arhiviran projekat) proverava nov `obavestenja.test.ts`.
8. **„Čeka tebe“ kroz sve projekte čita najviše 20 projekata** (S01 §9.1: 20 × 31 ideja, kao Devotion). Više od 20 daje `truncated: true`, umesto tihog odsecanja. Feed i nepročitano ostaju na opsegu 50 (P28).
9. **`adminAuth`:**
   - meta mora biti owner/urednik projekta iz kog se radnja pokreće („Dodeljeni član mora pripadati ovom projektu.“); Devotion je bio globalan;
   - `recordPasswordChange` piše aktivnost u svaki projekat gde je meta owner/urednik (`members.by_user`, bez duplikata, najviše 50); arhiviran projekat se ne preskače, jer ni Devotion nije gledao arhivu startupa;
   - `normalizeEmail` dolazi iz Enigminog `convex/auth.ts`, a pravila lozinke iz `lib/lozinka.ts` (paritet sa `lib/password-rules.ts` proverava test);
   - u testu „ne-admin je odbijen“ tekst „administratorski“ je postao „samo vlasnik platforme“.
10. **`pushTest.sendTest` i `expoPushTokens.myTokensForTest` primaju `profileId`** (D12). `computeBadge` čita moje projekte kroz `listMyActiveWorkspaces`, pa bedž ne broji ni projekat u kome sam client_viewer.
11. **Uklanjanje člana izuzima njegov listić starog glasanja.**
    - Radnik je u `legacyFlows › uklanjanje člana …` promenio očekivano (`"excused"` → `"pending"`, `eligibleCount` 1 → 2), jer `membersStore.removeMember` to nije radio. To je slabljenje provere, pa je vraćeno na Devotion vrednosti.
    - `ukloniClanaIzRadnogDela` (D23) sada radi i ono što je radio Devotion `startups.removeMember`: otvoren listić tog člana u tom projektu postaje `excused`, a zahtev broji glasača manje. Zahtev se ne izvršava.
    - Aktivnost `member_removed` se ne beleži, jer helper ne zna ko uklanja.
12. **`crons.test`:** Enigmin `crons.ts` ima i svoje poslove, pa test ne traži „samo jedan posao“, nego tačno jedan posao radnog dela, sa imenom `prostor/notifications:remindDueTasks`, i nijedan `prostor/puls:` (S01 §9.6).
13. **Izmene u prenetim testovima** (provere nisu oslabljene, samo usklađene):
    - imena zakazanih poslova su puna putanja (`prostor/inbox:markAllReadBatch`, `prostor/push:deliver`, `prostor/expoPush:deliver`); chat.personal dodatno proverava da 5 obaveštenja zakazuje tačno 10 dostava;
    - convex-test 0.0.65 pamti `contentType` bloba: očekivan tip priloga je `image/png`, a u `chat.test` argument sada „laže“ sa `application/pdf` (+1 provera da upisani tip nije iz argumenta);
    - `startupMembers` u seed-u (inbox.ideaVote, notifications) → `members.by_user_workspace` + `.first()` + `ukloniClanstvo`, uz proveru da red postoji;
    - `workspaceId` je dodat u pozive P funkcija (notifications ×7, legacyFlows ×12); `api.collaboration` → `api.prostor.collaboration` u jednoj tipskoj referenci;
    - legacyFlows: člana uklanja vlasnik projekta kroz `membersStore.removeMember` (S01 §1.4), uz proveru da je članstvo obrisano; „Nemate pristup“ → „Nemaš pristup ovom projektu.“ (×4);
    - inbox: očekivani ključ stavke `"startup"` → `"workspace"` (alat ga nije preimenovao);
    - chat.personal: arhiviran profil → „Profil još nije spreman. Osveži stranicu.“; 50 generisanih profila u testu granica grupe su članovi projekta A; `listPeople` očekivanja su izvedena iz P9, sa dodatnim slučajevima (arhiviran profil, client_viewer, samo arhiviran zajednički projekat, stranac).
14. **Ime polja `sharedStartupNames` u `listPeople` ostaje** (D10, ugovor sa webom).

**Novi paketi:** nema (`web-push` je instaliran u S02).

**Testovi:**
- Preneto je **144 bloka**, tačno po S01 §5.4: chat 32, chat.personal 31, chat.validator 3, inbox 23, inbox.ideaVote 5, notifications 13, expoPush 21, adminAuth 6, crons 3, legacyFlows 7. Broj `expect(` nije manji ni u jednom fajlu (chat 113→114, chat.personal 162→176, inbox.ideaVote 21→22, crons 5→6, legacyFlows 46→47, ostali isti).
- Novi testovi (17):
  - `adminAuth.test.ts` +5:
    - vlasnik projekta koji nije vlasnik platforme i urednik su odbijeni, i ništa se ne menja;
    - meta mora biti član projekta;
    - pravila lozinke su Enigmina (7 znakova pada, lozinka bez znaka pada);
    - vlasnik platforme menja lozinku: nov heš, sesija mete obrisana, aktivnost u A, B i klijentskom projektu, bez lozinke;
    - `lib/lozinka.ts` = `lib/password-rules.ts` na 12 uzoraka.
  - `obavestenja.test.ts` (6):
    - `createNotification` zakazuje obe dostave, a bez `VAPID_*` push se tiho preskače;
    - bez `VAPID_SUBJECT` se ne šalje; sa sve tri ide kroz zamenjen `web-push`;
    - Expo bez tokena ne šalje, ni probno slanje;
    - **150 zadataka dobija podsetnik i niko nije odsečen**, a drugi prolaz ne duplira;
    - 52 projekta prolaze kroz dve strane, a arhiviran se preskače;
    - `fetch` baca ako ga iko pozove i nijednom nije pozvan.
  - `poruke.test.ts` (6):
    - `listPeople` je bez client_viewer-a i stranca;
    - DM i grupa sa strancem ili client_viewer-om se odbijaju i ništa ne upisuju;
    - poruka u opštem kanalu ne obaveštava client_viewer-a, a on je ne čita;
    - kanal tima pravi i arhivira samo vlasnik platforme;
    - tuđu poruku briše vlasnik platforme, ne vlasnica projekta;
    - „Čeka tebe“ sa 20 projekata nije, a sa 21 jeste `truncated`.
  - Cron je registrovan (`crons.test`).
- `convex/prostor` sada ima 54 fajla i 570 testova.
- Ceo `npx vitest run`: 150 fajlova i 2115 testova, svi prolaze.

**Rezultat provere:**
- codegen prolazi;
- typecheck prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest prolazi (2115);
- pristup: 632 / 617 / 15, bez novih izuzetaka;
- `verify-purge-coverage` 196 (nema novih tabela);
- regresije: 20 provera prolazi, uključujući `verify:prostor-pristup` i `verify:ultra-recnik` (R9).

**Za Jovana ujutru:**
- Ništa nije deployovano. Posle deploya Convexa cron „podsetnici za rokove“ kreće na 6 h. Prvi prolaz šalje podsetnike za sve otvorene zadatke sa rokom u poslednjih 14 dana i sledećih 48 h (Devotion prozor).
- Web push radi tek kad se u Convexu postave `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` i `VAPID_SUBJECT`, a na webu `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (S17). Bez njih obaveštenja ostaju u Inboxu, bez greške.
- Odluči da li razgovor sme da se započne samo sa ljudima iz zajedničkog projekta (ODLUKA 1) ili sa svima, kao u Devotionu.
- Odluči da li vlasnik projekta treba da pravi i arhivira kanale tima i briše tuđe poruke (sada to radi samo vlasnik platforme, ODLUKA 2).
- Postavljanje lozinke članu gasi sve njegove sesije i radi samo za člana projekta iz kog se pokreće.

## S07 - Plan: ljuska, rute i prevod ekrana   (2026-10-29 04:29)
**Plan korak.** Plan je upisan u `docs/spajanje/planovi/S07.md`. Kod nije menjan.

## S08 — Temelj weba: primitivi, toast, pokret, kuke, alat za ekrane   (2026-10-29 05:10)
**Fajlovi:**
- `components/ui/`:
  - novi Base UI primitivi `tabs.tsx`, `context-menu.tsx`, `avatar.tsx`, `scroll-area.tsx`, `progress.tsx`, `drawer.tsx`;
  - jednostavni elementi `kbd.tsx`, `badge.tsx`;
  - izmenjen `dialog.tsx`: Radix atribut stanja → CSS prelaz na Base UI stanjima.
- `lib/toast.ts` (+ `lib/toast.test.ts`) i `components/app/toaster.tsx`.
- `components/app/app-shell.tsx`: `ShortcutProvider`, `CuvarNapustanjaProvider` i `Toaster` montirani u `ShellFrame`.
- `components/motion/animated-check.tsx`, `flip-group.tsx`.
- `components/app/prostor/`:
  - `podaci/{projekat,ja,tipovi}.ts`;
  - `zajednicko/{granica-greske.tsx,use-danas.ts,use-debounced-callback.ts}`;
  - `precice/{precice-provider.tsx,pomoc-dijalog.tsx,use-precice-liste.ts}`;
  - `cuvar-napustanja.tsx`, `use-prostor-navigacija.ts`;
  - `editor/editor.css`, `mape/mape.css`.
- `components/app/ja-link.tsx`.
- `lib/prostor/`:
  - `rute.ts` (+ test);
  - `web/{greske,danas,projekat,vrste-stranica,flip-snapshot,indikator-trake,cuvar-napustanja}.ts` (+ testovi za greske, projekat, flip-snapshot, indikator-trake i cuvar-napustanja);
  - `precice/{registar,lista-zadataka}.ts` (+ testovi).
- `app/dev-ux/fixtures-prostor-osnova.ts` (registrovan u `fixtures.ts`), `app/dev-ux/sistem/vodic-prostor.tsx` (montiran u `vodic.tsx`).
- Čuvari:
  - `lib/front-cuvar.ts` (+ test);
  - `lib/linkovi-cuvar.test.ts` (`ja-link.tsx`);
  - `scripts/motion-check.ts` (sekcija 13).
- Alat:
  - `.nocni-run/spajanje/alati/prenesi-ekran.mjs`;
  - `README.md` (odeljak „Alat za prenos Devotion ekrana“).
- Ostalo:
  - `docs/spajanje/planovi/S07.md`: jedna rečenica (ODLUKA 1);
  - `.gitignore`: logovi Playwright-a u `docs/spajanje/snimci/` (ODLUKA 2);
  - snimci `docs/spajanje/snimci/S08-{primitivi-1536,primitivi-390,toast-1536,fioka-1536}.png`.

**Šta je urađeno:**
- **Primitivi (plan S07 §5).** Napisani su po stilu postojećih `components/ui/*`, na tokenima. Mesta i dodir:
  - kartice `line` i `pill` nose `data-active` i 44 px na dodir;
  - kontekstni meni koristi iste stavke kao `dropdown-menu` (`onClick`, `closeOnClick`);
  - fioka ima Devotion API (`title`, `header`, `footer`, `width`, `initialFocus`, `returnFocusFallback`, `onExited`) i stranu „desno“ ili „dole“, sa prevlačenjem.
- **Toast.** Base UI Toast sa jednim globalnim menadžerom i API-jem kao sonner (`toast`, `success`, `error`, `info`, `warning`, `dismiss`, `action`, `duration`, `id`, `description`). Mesto je dole u sredini, najviše 3. Pokret je CSS prelaz.
- **Pokret.**
  - Kvačica i FLIP su preneti na GSAP (`useGSAP`/`matchMedia`, `DUR_UI`/`EASE_UI`, grana za smanjen pokret).
  - Ostatak Devotion pokreta se ne prenosi, jer Enigma ima zamene: `Unfold`, `CountUp`, `ProgressRing`, `PageTransition`, Base UI prelazi.
- **Kuke za podatke.**
  - `useProjekatQueryTolerant/Result/State`, `useProjekatPaginatedQuery`, `useProjekatQueries`, `useProjekatKlijent` i `useProjekatMutationOptimisticno` sami ubacuju `workspaceId`.
  - Ja varijante (`useQueryTolerant/Result/State`) čuvar fronta sada vidi kao direktan poziv.
  - Granica greške prikazuje ljudsku poruku iz `lib/prostor/web/greske.ts`.
- **Navigacija.**
  - `lib/prostor/rute.ts` čuva Devotion objekat rute (D18) i pretvara ga u prave rute P13, u oba smera.
  - `useProstorNavigacija()` vodi u tekući ili drugi projekat i pita čuvara napuštanja (2 s, „Ostani / Napusti“), koji hvata i klik na interni link.
  - `JaLink` je link nivoa „Ja“.
- **Ostalo.**
  - CSS editora i mapa je na tokenima; još ga ništa ne uvozi.
  - Osnovne fiksture: profil, 6 ljudi, 3 projekta, 4 oblasti, nepročitano i Moj dan.
  - Alat za ekrane mapira svaki fajl snimka na korak i cilj (`--pokrivenost`), primenjuje E1–E13 i probno je pušten u `tmp`.
  - Prečice su prenete (registar, lista zadataka, provider bez globalnog `?` do S24).

**Paritet:** temelj za redove 2 i 33 (registar prečica i provider), 18 (čuvar napuštanja, CSS editora), 24, 14 i 8 (CSS mapa, kontekstni meni), 25 (fixture osnova). Ekrani radnog dela nisu preneti, a rute ne postoje (S09).

**ODLUKE:**
1. **`docs/spajanje/planovi/S07.md` je imao doslovnu klasu sa `--font-geist-*`.** Tailwind 4 skenira i `docs/`, pa je napravio pravilo `font-family: var(--font-geist-*)`. Sav CSS je zato pucao: `/sistem?ux=1` je davao 500, a i `npm run build` bi pao. Rečenica u planu (§6.2) je preformulisana bez te klase; smisao je isti.
2. **Playwright MCP piše `console-*.log` i `page-*.yml` u `docs/spajanje/snimci/`.** Kad strana padne, log nosi tekst greške, Tailwind ga skenira i greška se sama ponavlja. `.gitignore` sada ima `docs/spajanje/snimci/*.log` i `*.yml` (Tailwind poštuje ignore), a postojeći logovi su premešteni u `.nocni-run/spajanje/tmp/playwright/`. Posle brisanja izvora `next dev` mora da se restartuje, jer pamti kandidate klasa.
3. **`components/ui/dialog.tsx` je imao Radix `data-[state=open]:animate-in`.** Base UI to nikad ne postavlja, pa ulaz i izlaz nisu radili. Sada je tu CSS prelaz (`data-starting-style`/`data-ending-style`, `--duration-base`), po D17. Svi Enigmini dijalozi sada blago uđu i izađu (200 ms); ništa drugo se ne menja.
4. **Čuvar fronta (D15) je pojačan, ne oslabljen.**
   - `HOOKOVI` sada uključuje `useQueryTolerant`, `useQueryResult` i `useQueryState`.
   - `useQueries` sa `query: api.x.y` u objektu je direktan poziv.
   - Test pokriva oba slučaja.
   - `verify:pristup` i dalje pokazuje 632/617/15 i nema novih ključeva u `DOZVOLJENI_DIREKTNI`, jer ih S08 ne zove.
5. **Čuvar linkova:** `NEXT_LINK_DOZVOLJEN` je naučio `components/app/ja-link.tsx` (nova legitimna putanja).
6. **`verify:pokret`:** dodata je sekcija 13 (pojačanje). Ona proverava:
   - `ui/dialog`, `ui/drawer` i `toaster` imaju CSS prelaz sa ulazom i izlazom, bez `animate-in` i bez Radix atributa;
   - novi primitivi nemaju Radix atribut stanja;
   - kvačica i FLIP imaju granu za smanjen pokret i Enigmin rečnik.
7. **Čuvar napuštanja ne hvata dugme Nazad u pregledaču.** Next ruter sam obrađuje `popstate`, a vraćanje adrese bi se sa njim posvađalo. Hvata se `idi()` i svaki klik na interni link; za zatvaranje kartice ostaje `beforeunload` iz autosave-a (S10). Plan S07 §4.3 je predviđao i `popstate`.
8. **Kvačica (`AnimatedCheck`) nema Devotion prebačaj („bouncy“):** završen zadatak nije nagrada (P27). Boja je boja radnje, kao `Checkbox` i `Switch` u stanju „uključeno“.
9. **Ime provider-a prečica je ostalo `ShortcutProvider`** (plan je pominjao `PrecicePrividerProstor`). Globalno `?` je isključeno dok ga S24 ne uključi (`pomocNaUpitnik`), zbog sudara sa lokalnim `?` u tabeli Leadova. Otvorene stavke (`[data-open]` dijalog, meni, listbox) gase prečice.
10. **Radnici su doneli sledeće odluke; pregledane su i prihvaćene:**
    - `greske.ts` skida prefiks `KONFLIKT_IZMENA:` iz poruke backenda i dodaje kod `invalid`;
    - `vrste-stranica.ts` hex i sirovu paletu menja `--chart-N` tokenima;
    - `formatShortDate` ide kroz `lib/format.ts` (`formatShortDateAt`), sa testom jednakosti;
    - `formatFileSize` ostaje sa tačkom („1.5 MB“), a S11 bira `formatDecimal` kad ekran počne da ga koristi;
    - `mape.css` i `editor.css` koriste lokalne alijase za `--font-mono` i `--radius-lg`, jer ih `@theme inline` ne emituje kao CSS promenljive. Okvir izbora na mapi je `color-mix(--radnja 10 %, transparent)`, jer je `--radnja-soft` neproziran.
11. **Fiksture:**
    - `fakeId` daje ID bez donje crte (`areasux0001`), jer stranice dinamičkih ruta (S07 §1.1) odbijaju ID koji nije `[a-z0-9]{10,}`;
    - lažni tim ima izmišljena imena i `@primer.test` adrese, ne Devotion ljude;
    - `PROFILI[0]` je prijavljen korisnik.
12. **`radni-ui.tsx` i `projekat-cip.tsx` (plan §10, S08) nisu preneti.** Traže `ProjekatZnak` i ručno prilagođavanje ljuske, pa idu u S09. Alat ih zna pod korakom S08: `--korak S08` ih prenosi, a ostale S08 ciljeve preskače jer već postoje.
13. **Alat:**
    - isproban i celim korakom: `--korak S21 --izlaz tmp` prenosi 10 fajlova (29 RUČNO, izlazni kod 0). Taj prolaz je otkrio da je pravilo fascikle pobeđivalo `NE_PRENOSI` (`team-tab`, `invites-tab`), pa je ispravljeno;
    - zamenjeni primitivi i Devotion pokret imaju korak „ZAMENA“ (uvoz se preusmerava, fajl se nikad ne prenosi);
    - čist `.ts` sa svojim testom ide u `lib/prostor/modeli/`;
    - Radix kontekstni meni nije greška alata nego preusmerenje.

**Novi paketi:** nema.

**Testovi:** 91 nov test, svi prolaze.

| Fajl | Testova | Napomena |
|---|---|---|
| `lib/toast.test.ts` | 8 | |
| `lib/prostor/rute.test.ts` | 23 | povratni put svih ruta, prefiks u hubu i panelu, nepoznato = podrazumevano, prelaz projekta, pomoćne rute |
| `lib/prostor/web/cuvar-napustanja.test.ts` | 9 | |
| `lib/front-cuvar.test.ts` | +1 | |
| `lib/prostor/precice/*` | 25 | preneto 25 od 25, `expect(` 94/94 |
| `lib/prostor/web/greske.test.ts` | 15 | 5 prenetih + 10 novih |
| `lib/prostor/web/projekat.test.ts` | 3 | 1 + 2 |
| `flip-snapshot` i `indikator-trake` | 4 + 3 | preneti |

Ceo `npx vitest run`: 159 fajlova, 2206 testova.

**Rezultat provere:**
- codegen nije potreban (`convex/` nije menjan);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2206);
- pristup: 632 / 617 / 15, front bez padova;
- regresije: prolaze (20; ultra 5, prostor 1), uključujući `verify:pokret` sa novom sekcijom 13;
- `npm run build`: prolazi.

**Vizuelna provera:** `/sistem?ux=1` na 1536 × 695 i 390 × 844 (Playwright MCP). Kartice, kontekstni meni (desni klik), avatar, taster, oznake, traka za skrol, napredak, toast sa radnjom i opisom, desna fioka i fioka odozdo rade. Konzola je bez grešaka i upozorenja. Dev server je ugašen.

**Za Jovana ujutru:**
- Enigmini dijalozi sada imaju blag ulaz i izlaz (ODLUKA 3). Proveri da ti se sviđa.
- Dugme Nazad u pregledaču ne pita „Ostani / Napusti“ (ODLUKA 7). Odluči da li je to prihvatljivo.
- Ništa nije deployovano.

## S09 — Ljuska: traka, meni „Ja“, meni projekta, rute, profil   (2026-10-29 05:58)
**Fajlovi:**
- Rute `app/(app)/`:
  - `layout.tsx` (atribut `data-traka` iz režima, iznad kapije prijave);
  - nova grupa `(ja)/`: `layout.tsx` (ljuska „Ja“), `page.tsx` (Danas), `moji-zadaci`, `inbox`, `poruke`, `beleske`, `otvori`; preseljeni `projekti/page.tsx` (bio `app/(app)/page.tsx`) i `novi/page.tsx`;
  - `[projekat]/`: novi `zadaci`, `ideje`, `poruke`, `dokumenti`, `dokumenti/[oblastId]`, `stranica/[stranicaId]`, `korpa`, `puls`, `aktivnost`, `beleske`.
- Ljuska `components/app/`:
  - novi: `traka-projekata.tsx`, `meni-ja.tsx`, `opseg-ljuske.tsx`, `podaci-ljuske.ts`, `use-indikator-trake.ts`, `zvono-ja.tsx`;
  - izmenjeni: `app-shell.tsx`, `app-sidebar.tsx`, `nav-items.ts`, `mobile-nav.tsx`, `notifications-bell.tsx`, `command-palette.tsx`, `user-menu.tsx`, `auth-gate.tsx`, `projekat-provider.tsx`, `projekat-birac.tsx` (povučen, ostaje samo `ProjektiZaPaletu`), `projekat-znak.tsx` (veličina `traka`), `projekat-nedostupan.tsx`, `system/page-header.tsx`, `hub/svi-projekti.tsx`, `hub/novi-projekat.tsx`, `napredak/napredak-feedback.tsx`.
- `components/app/prostor/`: `ekran-uskoro.tsx`, `otvori.tsx`, `priprema-radnog-dela.tsx`, `profil/profil-dijalog.tsx`, `dokumenti/stablo-oblasti.tsx` (mesto za S10), `zajednicko/{radni-ui,projekat-cip,veza-traka}.tsx` (radnik).
- `lib/`: `rutiranje.ts` (+ test), `prostor/web/opseg.ts` (+ test, radnik), `prostor/web/oblik-id.ts` (+ test), `dugmad-cuvar.ts`, `linkovi-cuvar.test.ts`.
- Ostalo: `convex/lib/projekatSlug.ts`, `proxy.ts` (samo komentar), `app/globals.css` (širina trake), `app/dev-ux/[[...slug]]/page.tsx`, `app/dev-ux/fixtures-prostor-osnova.ts`, `scripts/verify-pristup.ts`, `scripts/ux-snapshots.mjs`.
- Alati `.nocni-run/spajanje/alati/s09-*.py` (jednokratne izmene), snimci `docs/spajanje/snimci/S09-ljuska-{ja-1536,projekat-1536,390}.png`.

**Šta je urađeno:**
- **Traka projekata** (72 px, od `md`, samo u hubu): „Ja“ (moj avatar i bedž nepročitanog Inboxa i poruka), pločica po projektu (`ProjekatZnak`, tačka kad ima nepročitanog ili posla koji čeka), „+“ (vlasnik platforme), „Svi projekti“ i profil dole. Crta izabranog je u boji projekta (u „Ja“ neutralna) i klizi GSAP-om (`DUR_UI`, `EASE_UI`, grana za smanjen pokret); položaj se pamti van komponente, pa klizi i kad se ljuska montira iznova. Tastatura: jedno mesto u Tab redu, strelice, Home i End.
- **Meni „Ja“**: profil, Danas (broj otvorenog za danas iz Moj dan), Moji zadaci, Inbox i Poruke (nepročitano), Beleške i spisak projekata sa brojem mojih otvorenih zadataka. **Meni projekta** po grupama P14: Rad (Početna sa podstavkama Pregled, Puls tima i Aktivnost; Zadaci, Ideje, Poruke, Dokumenti sa mestom za stablo, Beleške), Prodaja, Sadržaj, Kanali, Analitika, Automatizacija; podnožje Korpa, Napredak, Podešavanja. Enigmini moduli rade na starim putanjama, samo u novom rasporedu.
- **Rute**: sve putanje iz plana S07 §1.1 postoje; ekrani kasnijih koraka crtaju `EkranUskoro`. `/` je Danas, hub je na `/projekti` (`/svi` i `/hub` preusmeravaju tamo), `/otvori` razrešava ID projekta u adresu. `/poruke` i `/beleske` su na najvišem nivou „Ja“, a u projektu ekrani projekta.
- **Profil**: kapija prijave jednom zove `ensureCurrent` (ime iz naloga), a meni korisnika ima „Profil“ (ime i slika; port Devotion dijaloga).
- **Telefon** (P15): u hubu donja traka Danas · Projekat · Zadaci · Poruke · Više, a „Više“ je fioka odozdo sa projektima, ličnim ekranima, radnim delom, modulima po grupama i dnom (Korpa, Napredak, Podešavanja). Zvono „Čeka te“ je u zaglavlju (44 px). Panel ima traku kao pre spajanja, sa natpisom „Čeka te“.
- **⌘K**: radi u oba opsega; novi ekrani radnog dela i lični ekrani su u spisku (iz `nav-items.ts`).
- **Ostalo**: zvono u „Ja“ sabira „čeka te“ svih projekata (`stanjeProjekata`), sa spiskom po projektu; `PripremaRadnogDela` zove `pripremiRadniDeo` jednom po projektu i sesiji (P26); `ProjekatStavkeProvider` (D14) je spreman za S12/S16/S19; traka prekinute veze (`VezaTraka`) je u ljusci.

**Paritet:** red 9 (profil: ime i avatar u meniju korisnika; obaveštenja i push ostaju S17). Rute za redove 1, 3, 5, 6, 7, 8, 10–17, 25–27 postoje kao `EkranUskoro`; sadržaj donose koraci iz §6. Redovi 16–17 imaju mesto u meniju (`StabloOblasti`) za S10.

**ODLUKE:**
1. **Traka koristi `JaLink`, ne `next/link`.** `JaLink` već prima `/`, „Ja“ i `/<slug>/…`, pa `traka-projekata.tsx` ne ide u `NEXT_LINK_DOZVOLJEN` (plan je to predviđao). `projekat-birac.tsx` više ne koristi `next/link`, pa je njegov unos iz čuvara linkova uklonjen (pojačanje).
2. **Čuvar dugmadi:** `components/app/meni-ja.tsx` je dodat u `DOZVOLJENA_BOJA_MODULA`. Meni „Ja“ je isto mesto boje modula kao bočna traka (aktivna stavka i crtica); bez toga plafon 654 bi bio 656. Plafon nije podignut.
3. **`lib/rutiranje.test.ts` (plan S07 §1.6):** testovi 17–23, `jeJaPutanja`, folderi `(ja)` i „nema strana van `(ja)` i `[projekat]`“, prelazak radnog dela, aktivna stavka, ekran po opsegu i `donjaTrakaHub`. Promenjeni: test 7 je preimenovan (isto očekivanje); „svaki ekran je stara adresa u hubu“ za `poruke` i `beleske` sada očekuje „dalje“ (D3), a u panelu i dalje rewrite; „bočna traka: isključen modul…“ proverava da je Rad prvi i pun, a zatim samo uključene Enigmine module (plus „Sadržaj“ nestaje, „Prodaja“ ostaje). Nijedna provera nije obrisana.
4. **Posmatrač (`client_viewer`) od grupe Rad vidi samo Početnu**, bez Puls tima, Aktivnosti i Korpe. D7 kaže „krije celu grupu Rad“, ali tada bi posmatrač izgubio Početnu (Enigminu kontrolnu tablu), a ništa iz Enigme ne sme da nestane. Dok uloga nije poznata, meni je pun (vlasniku bi grupa treptala pri prelasku).
5. **`/korpa` nema roditelja u mrvici**; stranica (`/stranica/<id>`) pripada Dokumentima (mrvica, aktivna stavka i prelazak u drugi projekat). `EKRANI_SA_ID` je dobio samo `/stranica`: `/dokumenti/<id>` već pada na `/dokumenti` jer je to stavka menija.
6. **Puls tima i Aktivnost su podstavke Početne samo u meniju** (`navChildrenFor`), ne u traci sa jezičcima (`channelTabs`). Inače bi početna dobila jezičke, a `/puls` ne bi (pravilo „/“ hvata samo „/“).
7. **Natpis „Početna“** (P14) zamenjuje „Kontrolna tabla“ u meniju i mrvici; ekran je do S20 i dalje Enigmina kontrolna tabla. Kratki natpis „Tabla“ za donju traku panela je nestao, pa ćelija piše „Početna“.
8. **Iz „Ja“ pločica projekta vodi na početnu projekta**, a iz projekta na isti ekran drugog projekta (`putanjaZaPrelazak`). Lični ekran nema parnjaka u projektu (`/poruke` u „Ja“ nije `/<slug>/poruke`).
9. **`donjaTrakaHub` nema parametar `ukljucen`**: Zadaci i Poruke su radni deo, uvek uključen. Projekat iz „Ja“ je poslednji iz kolačića `ep_projekat` (čita se na klijentu).
10. **Meni korisnika** zadržava Napredak i Podešavanja (već su i u podnožju menija), dodata je stavka „Profil“, a „Obaveštenja“ nema do S17 (bez mrtve kontrole). Na `md+` meni je samo na dnu trake; u panelu ostaje u zaglavlju (nema trake).
11. **Zvono u „Ja“** sabira `ceka` iz `stanjeProjekata` (isto pravilo kao zvono projekta); nepoznat broj je „—“ i „najmanje toliko“. Kartica Inbox je S17. Natpis je „Čeka te“ i u zvonu projekta (P15); `scripts/ux-snapshots.mjs` je naučio novi `aria-label` („Čeka te“), a „kontrolna-tabla“ snima `/enigma-it` (plan S07 §8.3).
12. **`readRail`**: bez sačuvanog izbora meni je u šini na `md`–`lg` (D12).
13. **Napredak u „Ja“:** `useNapredakFeedback` je spreman bez projekta (napredak je lični, P12), pa zamrzavanje dana i nagrade rade i na Danas.
14. **`PageHeader` u „Ja“** ne crta red stanja veze (veze su projektne), a ikonicu uzima iz stavke ekrana (`stavkaEkrana`). Ekrani radnog dela dobijaju ikonicu svoje stavke, a Enigmini moduli, kao i do sada, ikonicu modula.
15. **Hub i čarobnjak u ljusci:** `SviProjekti` i `NoviProjekat` dobili su prop `uLjusci` (bez sopstvenog zaglavlja i `<main>`); veze „Svi projekti“ u čarobnjaku i na „Projekat nije dostupan“ vode na `/projekti`.
16. **Razvojni prikaz:** `PROFIL_JA` sada ima sliku (lažni SVG). `/<ekran>/<id>` za `dokumenti` i `stranica` rade kao dinamične rute. Ispravan ID iz fikstura: oblast `areasux0001`, stranica `pagesux0001`. Panel u razvojnom prikazu dobija isti `data-traka="ne"` kao prava aplikacija.
17. **Zastareli `.next/types` i `.next/dev/types`** (pokazivali su na obrisane `app/(app)/page.tsx` i `novi/page.tsx`) premešteni su u `.nocni-run/spajanje/tmp/next-types-stari/`, jer je `tsc` padao na njima; Next ih pravi iznova.
18. **Radnik** je preneo `radni-ui`, `projekat-cip`, `opseg` i `veza-traka`; pregledano i prihvaćeno. Njegove odluke: `RailBadges.startupDots` i `RailStartup` zadržavaju Devotion ime (koristi ih test); `ProjekatCip` crta `ProjekatZnak` (tonovi startupa nestaju); status „blokirano“ je upozorenje, ne crvena (crvena je samo za greške i kašnjenje); `ScreenHeader` nema Devotion `data-workspace-enter` (radni ekrani se ne animiraju pri učitavanju).

**Novi paketi:** nema.

**Testovi:** 26 novih ili dopunjenih, svi prolaze.
- `lib/rutiranje.test.ts`: +15 (§1.6, vidi ODLUKU 3).
- `lib/prostor/web/opseg.test.ts`: 7 prenetih (bedževi trake, smer, množina).
- `lib/prostor/web/oblik-id.test.ts`: 2.
- Ceo `npx vitest run`: 161 fajl, 2233 testa.

**Rezultat provere:**
- codegen: prošao (`convex/lib/projekatSlug.ts` je izmenjen);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2233);
- pristup: 632 / 617 / 15, front 49 direktnih poziva, svi sa spiska;
- regresije: prolaze („Sve provere prolaze“);
- `npm run build`: prolazi.

**Vizuelna provera** (Playwright, `next dev -p 3117`, ugašen na kraju):
- Pregledano na 1536 × 695 i 390 × 844: `/moji-zadaci`, `/projekti`, `/`, `/enigma-it`, `/enigma-it/zadaci`, panel `/zadaci` i posmatrač (`&uloga=client_viewer`).
- Rade: fioka „Više“ u oba opsega, ⌘K u „Ja“ (projekti, misije i lični ekrani), dijalog profila i tastatura u traci.
- U konzoli nema grešaka ni upozorenja; poruke „useProjekat mora…“ nema.
- Next razvojni znak (dole levo) u dev-u pokriva profil u traci; u produkciji ga nema, a za snimke je sklonjen.

**Za Jovana ujutru:**
- `digital.enigmait.rs` ne sme biti u domenima panela (Podešavanja → Projekat → Domeni). Inače nema trake ni Danas.
- Pre deploya proveri da nijedan postojeći projekat nema adresu koja je sada rezervisana: `zadaci`, `ideje`, `poruke`, `dokumenti`, `stranica`, `korpa`, `puls`, `aktivnost`, `beleske`, `projekti`, `moji-zadaci`, `inbox`, `otvori`.
- Posmatrač vidi samo Početnu iz grupe Rad (ODLUKA 4). Potvrdi.
- Kartica Napredak u podnožju menija je uska, pa zvanje može da se skrati („Opera…“).
- Ništa nije deployovano.

## S10 — Dokumenti 1: oblasti, stablo, stranica, editor   (2026-10-29 07:20)
**Fajlovi:**
- Rute `app/(app)/[projekat]/`: `dokumenti/page.tsx`, `dokumenti/[oblastId]/page.tsx`, `stranica/[stranicaId]/page.tsx` (umesto `EkranUskoro`; `params` se čeka, klijentski kontejner je u `<Suspense>`).
- `components/app/prostor/dokumenti/` (preneto alatom pa ručno dovršeno): `area-view`, `area-header`, `area-overview(-container)`, `area-documents(-container)`, `use-area-body`, `create-page-dialog`, `create-area-dialog`, `move-to-area-menu`, `nesting-target-menu`, `detach-page-button`, `page-route-view`, `page-document-view`, `page-document`, `page-document-actions`, `page-side-column`, `subpages-list`, `use-page-autosave`, `stablo-oblasti` (popunjeno mesto iz S09); novi `dokumenti-kontekst.tsx` i `ekrani.tsx`.
- `components/app/prostor/editor/`: `rich-text-editor.tsx`, `note-file-node.tsx`, `link-dijalog.tsx` (preneti); novi `index.tsx` (`next/dynamic`, `ssr: false`), `editor-skeleton.tsx`, `prilozi-kontekst.ts`.
- `components/app/prostor/saradnja/` (rano iz grupe S11): `conflict-dialog.tsx`, `use-live-now.ts`, `lock.tsx`, `presence-indicator.tsx`.
- `components/app/prostor/zajednicko/istorija-radnji.tsx`.
- `lib/prostor/modeli/` (+ testovi): `area-model`, `page-autosave-model`, `page-document-model`, `page-entry-text`, `page-tree-model`; rano: `collab-model` (S11), `task-instructions-draft` (S12).
- `lib/prostor/web/`: `note-link.ts` (+ test), `poslednja-oblast.ts`; `lib/prostor/rute.ts` (tipovi podataka ekrana); nov `lib/prostor/uredjivac-lenj.test.ts`.
- Izmenjeni: `components/app/app-shell.tsx` (`DokumentiProvider` u opsegu projekta), `app/globals.css` (`@source not "../docs";`), `package.json` i `package-lock.json` (`overrides` za Tiptap, ODLUKA 2).
- Razvojni prikaz: nov `app/dev-ux/fixtures-prostor-dokumenti.ts`, registrovan u `fixtures.ts`; `fixtures-prostor-osnova.ts` izvozi `PROJEKTI`.
- Snimci `docs/spajanje/snimci/S10-{oblast-1536,stranica-1536,stranica-390,stablo-1536}.png`.
- Odloženo (samo za čitanje u kasnijim koracima): `.nocni-run/spajanje/tmp/s10-odlozeno/` (`area-tasks.tsx` i pun izlaz alata za `create-page-dialog`, `page-document-view`, `rich-text-editor`); izveštaji alata `.nocni-run/spajanje/tmp/prenos-ekran-S10*.md`.

**Šta je urađeno:**
- **Oblast** (`/dokumenti/<id>?tab=`): zaglavlje na Enigminom `PageHeader`-u (ikonica mesta, naziv sa preimenovanjem u mestu, „N stranica · N zadataka“, jedina primarna radnja „Nova stranica“) i kartice Pregled · Zadaci · Dokumenti. Pregled ima opis oblasti sa autosave-om, revizijom i konfliktom i Nedavne izmene. Dokumenti imaju stablo-tabelu sa filterom vrste, razvijanjem, prevlačenjem (ugnežđavanje), menijem reda i „Poništi“. Kartica iz adrese ima prednost, pa zapamćena po oblasti.
- **Stranica** (`/stranica/<id>`): dokument tima sa putanjom, naslovom, Tiptap uređivačem (iste ekstenzije i HTML kao Devotion: StarterKit, liste zadataka, tabele, blok priloga, linkovi), stanjem čuvanja, bočnom kolonom (autor, izmena, zaključano), podstranicama i menijem „…“ (premesti u oblast, odvoji, obriši u Korpu sa „Poništi“). Autosave je 650 ms sa `expectedRevision`; konflikt otvara dijalog „Kopiraj moju verziju · Učitaj najnoviju · Prepiši“; Ctrl/⌘ + S čuva odmah.
- **Uređivač** je samo iza `editor/index.tsx` (`next/dynamic`, `ssr: false`, kostur iste visine). `editor.css` (S08) uvozi sam uređivač, pa je u buildu zaseban komad. Nov test čuva da Tiptap ne uđe nigde drugde.
- **Stablo** pod „Dokumenti“ u meniju projekta: oblasti (prevlačenje menja redosled), stranice po nivou (lenjo, 7 po nivou uz „Prikaži još“), neograničeno ugnežđavanje, prevlačenje stranice na stranicu ili oblast (`areasV2.movePage`, sa zahtevom za odobrenje kad treba), „+“ na oblasti i stranici i „Nova oblast“ na dnu. Tekuća oblast i preci otvorene stranice se sami razviju.
- **`DokumentiProvider`** (ljuska, samo opseg projekta) deli projekat sa oblastima i profil, po jedan dijalog „Nova stranica“ i „Nova oblast“ i fokus na naslov upravo napravljene stranice. Stanje čuvanja stranice i opisa oblasti ide čuvaru napuštanja ljuske; `beforeunload` ostaje.
- **`/dokumenti`** je spisak oblasti; sa jednom oblašću vodi pravo na nju. Posmatrač na sve tri rute vidi „Dokumenti nisu dostupni.“
- `@source not "../docs";` je dodat u `app/globals.css` (napomena iz nadzora).

**Paritet:**
- Red 16 (oblasti): podrazumevane i nove, preuređivanje (stablo), preimenovanje (zaglavlje oblasti), opis oblasti — gotovo. Komentari i istorija opisa oblasti su S11.
- Red 17 (stablo): neograničeno ugnežđavanje, prevlačenje, nova stranica — gotovo. Rok zadatka u stablu dolazi sa S12.
- Red 18 (stranica): Tiptap (naslovi, liste zadataka, tabele, prikaz priloga), autosave, konflikt „Učitaj najnoviju / Prepiši“ — gotovo. Otpremanje priloga i uvoz tabele iz fajla u uređivaču su S11; stranice vrste tabela i fajl do S11 pokazuju prazno stanje.

**ODLUKE:**
1. **`@source not "../docs";`** stoji odmah ispod `@import "tailwindcss";` (podrška je proverena u `tailwindcss/dist/lib.js`, 4.3.3). `/sistem?ux=1` je posle izmene otvoren u pregledaču i ima stilove (pozadina, Aeonik, boja radnje); `npm run build` prolazi, a CSS komad ima sve klase ekrana.
2. **Tiptap je imao dve kopije `@tiptap/core`.** Instalacija iz S02 je za zavisnosti `starter-kit`-a uzela 3.32.1 (sa svojim `core` 3.32.1), a Devotion lockfile ih ima na 3.29.2 (P10 traži tačne verzije iz njega). Komande StarterKit-a zato nisu imale tipove (`toggleBold` …), a u pregledaču bi radila dva jezgra. `package.json` je dobio `overrides` koji sve `@tiptap/*` iz Devotion lockfile-a drže na 3.29.2. Nov paket nije uveden, a u `package-lock.json` su promenjeni samo `@tiptap` unosi (provereno razlikom prema HEAD-u). Usput je `npm dedupe` podigao i nepovezane pakete (google-gax, zod …), pa je lockfile vraćen na HEAD i izmena urađena uže. Ugnežđeni `@tiptap` unosi su ručno uklonjeni iz lockfile-a, jer npm 10 ne primenjuje `overrides` na postojeće unose.
3. **Rano preneto iz kasnijih koraka**, alatom sa `--korak S11/S12 --samo`: `conflict-dialog`, `collab-model` (+ test), `use-live-now`, `lock`, `presence-indicator` (S11) i `task-instructions-draft` (+ test, S12). Bez knjige revizija nema autosave-a, a bez dijaloga nema konflikta, a S10 traži oba. S11 i S12 ih nalaze gotove (alat ne prepisuje bez `--prepisi`). U `collab-model` je putanja `convex/lib/pagePresence` ispravljena na `convex/prostor/lib/pagePresence`, a tekst zaključavanja „autor, vlasnik projekta i admin“ je postao „autor i vlasnik projekta“ (admin nije Enigmina uloga).
4. **Šta S10 svesno ne crta, bez mrtvih kontrola:**
   - kartica Zadaci oblasti pokazuje prazno stanje (broj u kartici je pravi, iz `tasks.listForArea`). `area-tasks.tsx` je preneto, ali parkirano u `tmp/s10-odlozeno/`, jer traži `TaskPanel` i `TaskRow` iz S12;
   - Mapa nije u redu kartica; `?tab=mapa` na oblasti i stranici daje prazno stanje sa putem nazad (S14). Stranica vrste „zadatak“ daje prazno stanje sa „Otvori oblast“ (S12);
   - na stranici su komentari, istorija, prisustvo, dugme zaključavanja, „Povezano“ i diskusija prazna mesta (S11, S15). Meni „…“ nudi samo radnje koje već rade (`RADNJE_MENIJA`);
   - dijalog „Nova stranica“ pravi samo belešku (`VRSTE_NOVE_STRANICE`), jer forme tabele, fajlova i zadatka traže module S11 i S12. Zaglavlje oblasti zato nema izbor vrste;
   - uređivač nema otpremanje priloga ni „Uvezi tabelu (CSV/XLSX)“ (S11), ali blok priloga ostaje, pa prilozi u HTML-u ne nestaju pri čuvanju. Kontekst priloga je izdvojen u `editor/prilozi-kontekst.ts`: stranica ga puni iz `pageFiles.list`, a pregled otvara fajl u novoj kartici dok S11 ne donese pregledač;
   - stablo nema rok zadatka (S12) ni preimenovanje oblasti u meniju; preimenovanje je u zaglavlju oblasti, kao i u Devotionu;
   - `istorija-radnji.tsx`, `nesting-target-menu` i `detach-page-button` su preneti, ali ih koriste tek mape (S14).
5. **Stablo se vidi uvek pod „Dokumenti“**, ne samo kad je stavka aktivna (Devotion i crtež plana §2.1). Oblasti su zatvorene, osim tekuće i oblasti i predaka otvorene stranice (`pages.get` i `getBreadcrumbs`, iste pretplate kao ekran stranice). Izabran čvor je neutralan (`bg-sidebar-accent`), jer red „Dokumenti“ već nosi boju mesta; dve pilule bi bile dupla oznaka.
6. **Zaglavlje oblasti je Enigmin `PageHeader`** (ikonica mesta, naslov, opis, radnje), a ne sopstveni crtež: tako boja mesta ostaje u `page-header.tsx` i nijedan čuvar ne dobija nov izuzetak („čuvari prolaze bez novih izuzetaka“). Naziv se preimenuje poljem u naslovu (`h1`), olovka „Preimenuj oblast“ je u radnjama, a greška naziva zamenjuje opis. Nijedan fajl čuvara (`lib/*-cuvar*`, `scripts/verify-*`, `lib/rutiranje.test.ts`, `lib/linkovi-cuvar.test.ts`) nije menjan; plafon boje modula je i dalje 654/654.
7. **Dijalog konflikta:** „Prepiši“ je primarno, „Učitaj najnoviju“ obris, a početni fokus je na „Kopiraj moju verziju“ (Devotion). Traka „Nije sačuvano …“ je u tonu upozorenja, ne greške, jer tekst još nije izgubljen.
8. **Tipovi** `CreatePageTarget`, `ProfileWithAvatar`, `StartupWithAreas` (= `prostor.projekat.get`) i `StartupMember` su u `lib/prostor/rute.ts`, gde alat preusmerava Devotion `workspace/types`.
9. **Fiksture:** stranica za razvojni prikaz je `pagesux0101` (`STRANICA_UX`), a ne `pagesux0001` kako je S09 nagovestio, jer su stranice 1–3 zadaci u fiksturi Moj dan. Oblast je `areasux0001` (`OBLAST_UX`). Mutacije koje vraćaju vrednost (`updatePage`, `createPage`, `movePage` …) imaju fiksture, pa autosave u razvojnom prikazu stiže do „Sačuvano“.
10. **Razvojni prikaz:** navigacija unutar aplikacije gubi `?ux=1` i vodi na prijavu (važi za sve ekrane), pa su snimci pravljeni direktnim adresama.
11. **Zastareli `.next/dev/types`** (dev server ugašen usred pisanja) premešten je u `.nocni-run/spajanje/tmp/next-types-stari-s10/`, jer je `tsc` padao na njemu (kao S09, ODLUKA 17).
12. **Vitest:** dva cela prolaza su imala 40+ „Test timed out in 5000ms“ u `convex/` testovima (svaki prolazi sam, a `convex/` nije menjan). Treći prolaz je 2307/2307 za 25 s. Opterećenje je bilo prolazno (verovatno skeniranje posle `npm install`), pa konfiguracija nije menjana.

**Novi paketi:** nema. `overrides` u `package.json` drži postojeće Tiptap zavisnosti na 3.29.2 iz Devotion lockfile-a (ODLUKA 2).

**Testovi:** 74 nova, svi prolaze.

| Fajl | Testova | Napomena |
|---|---|---|
| `lib/prostor/modeli/area-model.test.ts` | 17 | preneto |
| `lib/prostor/modeli/page-autosave-model.test.ts` | 10 | preneto |
| `lib/prostor/modeli/page-document-model.test.ts` | 8 | preneto |
| `lib/prostor/modeli/page-entry-text.test.ts` | 3 | preneto |
| `lib/prostor/modeli/page-tree-model.test.ts` | 3 | preneto |
| `lib/prostor/modeli/collab-model.test.ts` | 15 | preneto (S11, rano) |
| `lib/prostor/modeli/task-instructions-draft.test.ts` | 6 | preneto (S12, rano) |
| `lib/prostor/web/note-link.test.ts` | 9 | preneto |
| `lib/prostor/uredjivac-lenj.test.ts` | 3 | nov čuvar: Tiptap samo iza dinamičkog ulaza |

Ceo `npx vitest run`: 170 fajlova, 2307 testova.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije menjan);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2307);
- pristup: 632 / 617 / 15, front 50 direktnih poziva, svi sa spiska;
- regresije: prolaze (20; ultra 5, prostor 1);
- `npm run build`: prolazi.

**Vizuelna provera** (Playwright, `next dev -p 3117`, ugašen na kraju): oblast (Pregled, Dokumenti i prazno stanje sa `&prazno=1`), stranica sa uređivačem na 1536 × 695 i 390 × 844, stablo sa tri nivoa, `/dokumenti`, dijalog „Nova stranica“ (lenj uređivač), posmatrač i `/sistem?ux=1`. Kucanje u naslov prolazi kroz autosave do „Sačuvano“. U konzoli nema grešaka ni upozorenja. Dijalog konflikta nije viđen u pregledaču, jer lažni Convex ne vraća konflikt; pokriva ga test modela.

**Prihvatanje (dokaz):**
- „Otvara se oblast sa karticama“: `/enigma-it/dokumenti/areasux0001?ux=1` crta zaglavlje i kartice Pregled · Zadaci · Dokumenti; Pregled i Dokumenti su viđeni sa podacima, a Dokumenti i u praznom stanju (`&prazno=1`). Snimak `S10-oblast-1536.png`.
- „Stranica sa editorom“: `/enigma-it/stranica/pagesux0101?ux=1` crta Tiptap uređivač sa alatnom trakom; kucanje u naslov stiže do „Sačuvano“. Snimci `S10-stranica-1536.png` i `S10-stranica-390.png`.
- „Stablo prikazuje ugnežđene stranice“: na `/enigma-it/stranica/pagesux0102?ux=1` merenje DOM-a u pregledaču daje četiri nivoa: oblast „Razvoj“ (1) → „Lansiranje sajta“ (2) → „Endpointi za plaćanje“ (3) → „Webhook tok“ (4, izabrana, `aria-current="page"`) i „Cene provizija po kartici“ (4). Ručno razvijanje oblasti „Marketing“ učitava njene stranice („Plan objava za novembar“, „Kampanja za otvaranje“). Snimak `S10-stablo-1536.png`. Konzola tekuće strane je bez grešaka.
- „Preneseni modeli imaju testove; čuvari prolaze bez novih izuzetaka“: 8 prenetih modela ima testove (74 nova testa), a nijedan fajl čuvara nije menjan (ODLUKA 6).
- „Provere prolaze; sekcija S10 je u progress-u“: typecheck, lint, `npx --no-install vitest run` (2307), pristup i regresije prolaze; ovo je ta sekcija.

**Za Jovana ujutru:**
- Otvori stranicu, piši i proveri da posle pauze piše „Sačuvano“. U drugoj kartici izmeni istu stranicu i proveri dijalog „Učitaj najnoviju / Prepiši“.
- Prevuci stranicu u stablu na drugu stranicu i na drugu oblast; prevuci oblast da promeniš redosled.
- `package.json` sada ima `overrides` za Tiptap (ODLUKA 2): posle povlačenja izmena pusti `npm ci`.
- Ništa nije deployovano.

## S11 — Dokumenti 2: komentari, istorija, prisustvo, zaključavanje, prilozi, tabele   (2026-10-29 08:05)
**Fajlovi:**
- `components/app/prostor/saradnja/` (preneto alatom pa ručno dovršeno): `comments-section`, `comment-list`, `comment-composer`, `revision-history`, `revision-history-drawer`, `use-page-presence`, `page-relations`, `checkpoint-comments-dialog`. Rano iz S10 (nije dirano): `conflict-dialog`, `lock`, `presence-indicator`, `use-live-now`.
- `components/app/prostor/prilozi/` (preneto): `file-viewer-dialog`, `note-attachments`, `page-files-panel`.
- `components/app/prostor/tabele/` (preneto): `page-table-panel`, `table-import-dialog`, `note-table-import-dialog`; nov `pregled-matrice.tsx` (zajednički pregled prvih redova za oba uvoza).
- `lib/prostor/`: nov `ogranicenja.ts` (granice tabela i priloga, preuzete iz `convex/prostor/lib/*`).
- `lib/prostor/web/` (preneto): `csv.ts` (+ test), `page-files.ts` (+ test), `table-file.ts`, `media-convert.ts`; novi `otkucaj-prisustva.ts` (+ test) i `table-file.test.ts`.
- Izmenjeni: `dokumenti/page-document-view.tsx` (sve iz S11 ugrađeno, `RelationsContainer`), `dokumenti/area-overview-container.tsx` i `area-view.tsx` (komentari i istorija opisa oblasti), `dokumenti/create-page-dialog.tsx` (vrste Tabela i Fajlovi), `editor/rich-text-editor.tsx` („Uvezi tabelu (CSV/XLSX)"), `editor/prilozi-kontekst.ts` (`AttachedPageFile` iz `lib/prostor/web/page-files`).
- Razvojni prikaz: `app/dev-ux/fixtures-prostor-dokumenti.ts` (dopuna: komentari, istorija, prisustvo, prilozi, tabela, Povezano, zaključavanje; `TABELA_UX`, `FAJL_UX`). Fiksture je pisao radnik (Sonnet); diff i typecheck pregledani pre prihvatanja.
- Snimci `docs/spajanje/snimci/S11-{komentari-1536,istorija-1536,tabela-1536,fajl-1536,stranica-390}.png`.
- Pomoćne skripte izmena: `.nocni-run/spajanje/tmp/s11-skripte/`; izveštaj alata `.nocni-run/spajanje/tmp/prenos-ekran-S11.md` (26 fajlova, 29 RUČNO, sve zatvorene).

**Šta je urađeno:**
- **Komentari sa @pominjanjem** na stranici i u Pregledu oblasti: lista (najstariji gore, „Učitaj još"), unos koji raste do 8 redova, `@` otvara listu članova projekta (strelice, Enter/Tab, Esc), Ctrl/⌘ + Enter šalje, izmena u mestu, „Ukloni" sa „Poništi" dok traje rok servera. Pominjanje se crta kroz `parseCommentSegments` (nikad HTML). Nov komentar ulazi kratkim pomakom (GSAP `useGSAP` u `gsap.matchMedia()`, grana za smanjen pokret samo neprozirnost); prvo punjenje i „Učitaj još" se ne animiraju.
- **Istorija izmena** u fioci s desna (stranica i opis oblasti): verzije po danu, oznake „Trenutna", „Vraćena verzija", „Zatečeno stanje", pregled verzije (beleška kroz uređivač samo za čitanje, iza `editor/index.tsx`), „Vrati ovu verziju" uz potvrdu; konflikt otvara isti dijalog kao čuvanje.
- **Prisustvo „X uređuje"**: otkucaj odmah i na 15 s (`PAGE_PRESENCE_REFRESH_MS`); sakrivena kartica zaustavlja sat (nema otkucaja ni ticanja), povratak šalje odmah. Ritam je u čistom `lib/prostor/web/otkucaj-prisustva.ts` sa testom.
- **Zaključavanje**: „Zaključaj/Otključaj" u bočnoj koloni i meniju „…" (`pages.lock/unlock`), traka „Zaključano…" za čitaoca.
- **Povezano** u bočnoj koloni (`areasV2.listRelations/createRelation/deleteRelation`), **podstranice** iz S10 ostaju.
- **Stranica-fajl i prilozi**: panel fajlova (prevlačenje, izbor, granice, preimenovanje, uklanjanje u Korpu sa „Poništi"), pregledač (slika, video, zvuk, PDF, ostalo sa „Preuzmi"), otpremanje priloga u telo beleške (traka, prevlačenje, lepljenje) i pregled bloka priloga.
- **Stranica-tabela**: kolone (preimenuj, pomeri, obriši uz potvrdu), redovi (dodaj ispod, obriši uz potvrdu), ćelije u mestu, uvoz iz Excel-a ili CSV-a sa pregledom i serijama; „Uvezi tabelu (CSV/XLSX)" u uređivaču beleške. `read-excel-file` se učitava tek pri izboru fajla.
- Dijalog „Nova stranica" i zaglavlje oblasti sada nude Belešku, Tabelu i Fajlove (zadatak čeka S12).

**Paritet:**
- Red 19 (prisustvo, zaključavanje, podstranice, povezano): gotovo.
- Red 20 (komentari sa @): stranica i oblast gotovo; ideja dobija isti `CommentsSection` u S13. `checkpoint-comments-dialog` je spreman za korake zadatka (S12).
- Red 21 (istorija sa „Vrati ovu verziju"): stranica i opis oblasti gotovo; zadatak u S12 (ista fioka).
- Red 22 (stranica-tabela: kolone, redovi, uvoz CSV/XLSX): gotovo.
- Red 23 (stranica-fajl, prilozi, pregled fajla): gotovo.
- Red 18 (dopuna iz S10): otpremanje priloga i uvoz tabele u uređivaču sada rade.

**ODLUKE:**
1. **Granice su u `lib/prostor/ogranicenja.ts`**, kao ponovni izvoz iz `convex/prostor/lib/validators.ts` i `page_files.ts`, pa se web i server ne mogu razići. `lib/prostor/web/page-files.ts` (Devotion je imao svoje kopije brojeva) sada čita iste vrednosti. Tabela u belešci (100 × 20) je web pravilo iz Devotiona i stoji u istom fajlu. Granica tela beleške (80.000, `page_creation.ts`) nije izvezena na serveru, pa `note-table-import-dialog` zadržava svoju sigurnosnu granicu 78.000; backend nije menjan.
2. **Dijalog „Nova stranica" ne prenosi Devotion forme za tabelu i fajlove** (ručne kolone, uvoz i izbor fajlova pre kreiranja, sa naknadnim brisanjem „ljuske" ako upis padne). Tabela i Fajlovi se prave prazni, stranica se odmah otvara, a uvoz i otpremanje su prvo dugme na njoj (isti moduli, isti `importRows`/`attach`). Funkcija ne nestaje, a ne pravi se druga kopija istog toka; dijalog to kaže jednom rečenicom. Toast posle kreiranja je „Stranica je kreirana." (Devotion „Fajl je kreirana" je bio u pogrešnom rodu).
3. **Brisanje kolone i reda traži potvrdu** (`ConfirmDialog`), jer UI nema vraćanje (red je meko obrisan na serveru, ali nema „Poništi"). Devotion je brisao odmah. Uklanjanje fajla ide u Korpu, pa umesto potvrde nudi „Poništi" (`trash.restore`, isti obrazac kao Korpa stranice u S10).
4. **Boja radnje nije stanje izbora:** izmena ćelije, prevlačenje fajla i „+" ivice tabele su neutralni (`surface-control*`, `line-strong`, `ring`), a pominjanje u komentaru je neutralan čip (`bg-surface-control`, podebljano), ne `text-primary`. Primarna je samo potvrda u dijalogu („Vrati verziju", „Uvezi", „Ubaci tabelu"), kao „Prepiši" u S10.
5. **Radnje reda** (fajl, Povezano, komentar) su `ghost` ikonice koje se vide na prelaz ili fokus, a na dodir uvek (`pointer-coarse:opacity-100`). U redu fajla je ikonica „Otvori pregled" uklonjena, jer ime fajla otvara pregled (`title="Otvori pregled"`), a meta je „Slika · 2 KB" umesto „Fajl · Slika · 2 KB".
6. **Prisustvo:** Devotion je slao otkucaj iz `setInterval`-a koji je radio i dok je kartica sakrivena (samo je preskakao slanje). Sada sat staje kad je kartica sakrivena, kako korak traži; `presence.leave` na `pagehide` i odlasku ostaje.
7. **Pregled verzije beleške** je umotan u `NoteAttachmentsProvider` stranice, pa blok priloga u staroj verziji pokazuje fajl umesto „Fajl nije dostupan" (Devotion je fioku crtao van provajdera).
8. **`checkpoint-comments-dialog` nema `workspaceId` prop** (kuke projekta ga ne traže); `MotionDialog` → `Dialog` sa `DialogClose`. Ime profila čita kroz `useQueryTolerant(api.prostor.profiles.getCurrent)` (L funkcija), pa front ima 51 direktan poziv (bio 50), svi sa spiska, bez novog izuzetka.
9. **`NoteAttachmentsContext` se ne definiše dvaput:** `prilozi/note-attachments.tsx` puni kontekst iz `editor/prilozi-kontekst.ts` (S10), a `AttachedPageFile` ima jedan izvor (`lib/prostor/web/page-files.ts`).
10. **Fiksture:** stranica 103 (tabela) više nije zaključana; zaključana je 104 („Kontrolna lista pre objave", autor Milica), da bi se u prikazu video slučaj „samo za čitanje". `SADRZAJ_PLACANJA` dobio blok priloga (`pageFilesux0105`). Adrese: `/enigma-it/stranica/pagesux0101?ux=1` (beleška), `pagesux0103` (tabela), `pagesux0107` (fajlovi), `pagesux0104` (zaključana), oblast `/enigma-it/dokumenti/areasux0001?ux=1`.
11. Preneti fajlovi iz snimka su imali mešane CRLF/LF krajeve redova (`file-viewer-dialog`, `page-relations`, `page-table-panel`); svi S11 fajlovi su LF.
12. Nijedan fajl čuvara nije menjan. Nov čuvar u `lib/prostor/web/table-file.test.ts` traži da se `read-excel-file` uvozi samo dinamički i samo u `table-file.ts`.

**Novi paketi:** nema (`read-excel-file@9.3.5` je iz S02).

**Testovi:** 37 novih, svi prolaze.

| Fajl | Testova | Napomena |
|---|---|---|
| `lib/prostor/web/csv.test.ts` | 10 | preneto |
| `lib/prostor/web/page-files.test.ts` | 12 | preneto |
| `lib/prostor/web/otkucaj-prisustva.test.ts` | 6 | nov: 15 s, sakrivena kartica ne šalje, povratak šalje odmah, nema duplog sata, gašenje |
| `lib/prostor/web/table-file.test.ts` | 9 | nov: CSV bez Excel čitača, Tiptap tabela, procena dužine, padež „red/reda/redova", granice = server, lenj `read-excel-file` |

`collab-model` (15 testova) je prenet u S10. Ceo `npx vitest run`: 174 fajla, 2344 testa.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije menjan);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2344);
- pristup: prolazi, front 51 direktan poziv, svi sa spiska;
- regresije: prolaze (20; ultra 5, prostor 1); plafon boje modula 654/654, `font-mono` 254/254;
- `npm run build` (sa `verify:purge`): prolazi.

**Vizuelna provera** (Playwright, `next dev -p 3117`, ugašen na kraju):
- Stranica (1536 × 695): „Marko uređuje", „Komentari 4", „Istorija", „Zaključaj", Povezano 2, blok priloga u telu.
- Komentari: `@Ma` otvara listu, Enter ubacuje „@Marko Proba", Ctrl + Enter šalje i prazni polje.
- Istorija: lista po danima, pregled verzije, potvrda i toast „Vraćena je verzija od juče u 01:52.".
- Tabela: izmena ćelije u mestu, uvoz CSV-a (pregled, „Uvezi", toast „Uvezeno: 3 reda.").
- Fajlovi: lista, radnje na prelaz, pregledač slike.
- Zaključana stranica: samo za čitanje, bez dugmeta.
- Oblast: Komentari 2 i „Istorija izmena".
- 390 × 844: Povezano i komentari jedno ispod drugog, bez horizontalnog skrola.
- Jedina greška u konzoli (Base UI `nativeButton` na „Preuzmi" kao `<a>`) je popravljena i ponovo proverena.
- Dijalog konflikta i pravo otpremanje fajla nisu viđeni, jer lažni Convex nema skladište ni konflikt.

**Dopuna provere** (drugi prolaz, isti `next dev -p 3117`, ugašen na kraju):
- Otpremanje na stranici-fajl: lažni Convex nema skladište, pa je u stranici `fetch` ka lažnoj adresi za slanje vraćao `{ storageId }`. Izbor dva fajla (PDF i PNG) poslao je oba POST-a sa tačnim `Content-Type`, `attach` je prošao, a toast je javio uspeh. Tekst toasta za više fajlova je usput ispravljen u „Dodato fajlova: 2." (Devotion „Dodato je 2 fajlova" je bio gramatički pogrešan).
- Otpremanje u telo beleške: izbor fajla kroz dugme priloga u traci uređivača ubacio je nov blok priloga (blokova 1 → 2), a autosave je stigao do „Sačuvano". Nov blok piše „Fajl nije dostupan." samo zato što lažni `pageFiles.list` ne vraća nov fajl; pravi Convex osvežava spisak sam.
- Istorija opisa oblasti: izbor starije verzije, „Vrati ovu verziju", potvrda; dijalog se zatvorio, fioka se vratila na spisak i stigao je toast „Vraćena je verzija od …".
- Konzola tokom drugog prolaza: 0 grešaka, 0 upozorenja.
- Van obima prihvatanja i nevidljivo u razvojnom prikazu: dijalog konflikta (lažni Convex nikad ne vraća `KONFLIKT_IZMENA`; pokriva ga test modela iz S10) i stvarno skladište fajlova. To je u „Za Jovana ujutru"; nije BLOKADA, jer nijedna stavka prihvatanja od toga ne zavisi.
- Pojašnjenje uz „čuvari": nijedan postojeći fajl čuvara (`scripts/verify-*`, `lib/*-cuvar*`, `lib/rutiranje.test.ts`, `lib/linkovi-cuvar.test.ts`, `scripts/verify-pristup.ts`) nije menjan. Nov je test u `lib/prostor/web/table-file.test.ts` koji čuva lenji uvoz `read-excel-file` (ODLUKA 12); on ništa postojeće ne slabi.

**Prihvatanje (dokaz):**
- „Na stranici rade komentari sa pominjanjem, istorija sa vraćanjem, oznaka „uređuje", zaključavanje, prilozi i tabela": vizuelna provera iznad i snimci `S11-komentari-1536.png`, `S11-istorija-1536.png`, `S11-tabela-1536.png`, `S11-fajl-1536.png`, `S11-stranica-390.png`.
- „Čuvari prolaze; preneseni modeli imaju testove": pristup i regresije prolaze bez novih izuzetaka; preneti `csv` i `page-files` imaju svoje testove, a ritam prisustva i uvoz tabele nove (37).
- „Provere prolaze; sekcija S11 je u progress-u": ovo je ta sekcija.

**Za Jovana ujutru:**
- Otvori stranicu u dve kartice istog naloga ili sa dva člana: u drugoj treba da piše „<Ime> uređuje" dok kucaš, i da nestane oko 45 s pošto sakriješ prvu karticu.
- Pošalji komentar sa @pominjanjem i proveri da pomenuti dobija obaveštenje (backend iz S03/S06).
- Otpremi pravi fajl (slika, PDF, video) na stranicu-fajl i u belešku; uvezi pravi `.xlsx` u tabelu.
- Vrati stariju verziju beleške i opisa oblasti.
- Ništa nije deployovano.

## S12 — Zadaci: zadaci tima, zadatak, panel, koraci, rokovi   (2026-10-29 08:55)
**Fajlovi:**
- Ruta `app/(app)/[projekat]/zadaci/page.tsx` (umesto `EkranUskoro`; klijentski kontejner u `<Suspense>`).
- `components/app/prostor/zadaci/` (preneto alatom pa ručno dovršeno): `tasks-view`, `task-row`, `use-startup-task-commands`, `use-move-focus`, `constants`, `task-quick-create`, `task-meta-chips`, `task-checkpoint-list`, `task-page-view`, `use-task-instructions`, `assignee-stack`, `deadline-badge`, `due-chip`, `meta-chip`, `priority-dot`, `section-header`; nov `ekrani.tsx` (`ZadaciEkran`).
- `components/app/prostor/zadaci/panel/` (deljen sa S16, S19, S20): `task-panel`, `startup-task-panel-view`, `personal-task-panel-view`, `panel-parts`, `task-detail-layout`, `task-panel-states`, `use-plan-toggle`, `use-title-flight`.
- `components/app/prostor/zajednicko/birac-datuma.tsx` (srpski birač datuma, port `ui/date-picker`).
- Rano iz kasnijih koraka (alat, `--samo`): `components/app/prostor/danas/use-completion-queue.ts` (S19), `components/app/prostor/pocetna/reschedule-dialog.tsx` („Sredi rokove“, S20), `lib/prostor/modeli/task-checkpoint-layout.ts` (+ test, S14).
- `components/app/prostor/dokumenti/`: nov `area-tasks.tsx` (S10 ga je parkirao u `tmp/s10-odlozeno/`); izmenjeni `area-view.tsx` (kartica Zadaci), `page-route-view.tsx` i `ekrani.tsx` (`/stranica/<id>` crta zadatak), `create-page-dialog.tsx` (vrsta Zadatak, brzo pravljenje), `dokumenti-kontekst.tsx` (`profileId` za dijalog).
- `lib/prostor/modeli/` (+ testovi): `command-center-model`, `task-page-model`, `comments-focus`, `task-checkpoint-order`, `task-checkpoint-layout`; `lib/prostor/web/deadline.ts` (+ test).
- `components/ui/popover.tsx`: `PopoverContent` prima `anchor` (prosleđuje ga Base UI Positioner-u; zamena za Radix `PopoverAnchor`).
- Čuvar: `scripts/verify-pristup.ts` (`DOZVOLJENI_DIREKTNI` +7, ODLUKA 12).
- Razvojni prikaz: nov `app/dev-ux/fixtures-prostor-zadaci.ts`, registrovan u `app/dev-ux/fixtures.ts`.
- Snimci `docs/spajanje/snimci/S12-{zadaci-1536,zadatak-1536,panel-1536,zadaci-390,zadaci-prazno-1536,sredi-rokove-1536}.png`.
- Pomoćne skripte izmena: `.nocni-run/spajanje/tmp/s12-skripte/`; izveštaji alata `.nocni-run/spajanje/tmp/prenos-ekran-S12.md` (37 fajlova, 61 RUČNO, sve zatvorene) i `prenos-ekran-S12-rano-{S14,S19,S20}.md`.

**Šta je urađeno:**
- **Zadaci tima** (`/zadaci`, `?filter=moji`, `?osoba=<profil>`): Enigmin `PageHeader` (ikonica mesta, „N zadataka“, jedina primarna radnja „Novi zadatak“), filter Svi · Moji (radio grupa, strelice) i „Osoba“ (Enigmin `Select`), Lista · Tabla (od `md`), kolone Oblast · Status · Rok · Prioritet. Filter je u adresi i menja se bez novog unosa u istoriji; nepoznata osoba pada na „Svi“.
- **Red zadatka** (deljen, 40 px na `md+`, dva reda na telefonu): kvačica sa precrtom (GSAP `useGSAP` u `gsap.matchMedia()`, `DUR_UI`/`EASE_UI`, grana za smanjen pokret) i zadržavanjem reda ≈ 0,74 s pre selidbe, „Poništi“ 8 s; Moj dan, rok (birač), „…“ (Otvori, Završi, Moj dan, Priključi se, Status, Rok, Prioritet); zabranjena radnja je zaključana sa razlogom. Prečice liste iz S08 (`j`/`k`/strelice, `x`, Enter, `d`, `p`, `t`) i optimistične izmene (`tasks.updateMetadata` kroz `useProjekatMutationOptimisticno`, `myDay.plan/unplan` direktno) su zadržane; Flip radi `FlipGroup`.
- **Panel zadatka** (desna fioka 28rem, na telefonu ceo ekran): znak projekta i oblast, naslov u mestu sa letom naslova iz reda (jedini autorski pokret panela), čipovi Status · Prioritet · Rok · Izvršioci, Moj dan, „Puni prikaz“, Koraci, Instrukcije i Komentari (S11). Lični zadatak ima svoj prikaz (beleška, „Prebaci u projekat“, obriši sa „Poništi“) za S16/S19.
- **Zadatak na celu stranu** (`/stranica/<id>` vrste „zadatak“): isti raspored kao panel u okviru stranice iz S10/S11 (putanja, čuvanje, „uređuje“, komentari, istorija sa „Vrati ovu verziju“, zaključavanje, konflikt, Povezano, podstranice), čuvar napuštanja ljuske i Ctrl/⌘ + S.
- **Koraci**: lanac i „Poveži sve“, napredak (`ui/progress`), završavanje, izmena, brisanje sa „Poništi“, komentari koraka (`checkpoint-comments-dialog` iz S11).
- **Brzo pravljenje**: dijalog „Nova stranica“ ima vrstu Zadatak (`TaskQuickCreate`: naslov prvi, Enter pravi; čipovi sa podrazumevanim vrednostima, instrukcije i koraci iza „Više opcija“; sledeći zadatak kreće od iste oblasti). Otvara ga „Novi zadatak“ na Zadacima i u Zadacima oblasti, a zaglavlje oblasti ga nudi u „Nova stranica“.
- **Srpski birač datuma**: prečice (Danas, Sutra, Vikend, Sledeće nedelje, Bez roka) i kalendar sa srpskim mesecima; tastatura strelice, PgUp/PgDn, Home/End, Enter; izabran dan je neutralan, ne boja radnje.
- **„Sredi rokove“** (ODLUKA 10): dugme „Sredi rokove · N“ na Zadacima kad među prikazanim ima otvorenih sa prošlim rokom; dijalog (Danas · Sutra · Sledeće nedelje · Bez roka · Završi) sa „Poništi“ (`tasks.bulkReschedule` / `bulkRestoreSchedule`).
- **Zadaci oblasti** (S10 kartica): isti red, Lista · Tabla, čipovi statusa i „Novi zadatak“.

**Paritet:**
- Red 11 (zadaci tima: lista, moji/osoba, brzo pravljenje, radnje u redu, panel zadatka): gotovo.
- Red 12 (zadatak na celu stranu: status, prioritet, rok, izvršioci, koraci, instrukcije, povezano, komentari, istorija): gotovo.
- Dopuna reda 16 (kartica Zadaci oblasti) i reda 17 (zadaci u stablu kao stranice oblasti).
- Red 10: „Sredi rokove“ je spreman i radi na Zadacima; Trijaža i ostatak Komandnog centra su S20.

**ODLUKE:**
1. **Rano preneto iz kasnijih koraka** (alat sa `--samo`, S14/S19/S20 ih nalaze gotove jer alat ne prepisuje): `use-completion-queue` (S19, red završavanja sa zadržavanjem), `task-checkpoint-layout` (+ test, S14; `task-checkpoint-order` ga uvozi) i `reschedule-dialog` (S20, ODLUKA 10). U `use-completion-queue` je Devotion `RowHold` iz `my-day-model` zamenjen istim tipom `CompletionHold<TaskRowModel>` iz `lib/prostor`, pa S12 ne uvozi model Danas.
2. **Trajanje zadržavanja reda posle kvačice ostaje ≈ 0,74 s** (`HOLD_DONE_MS = 740`, Devotion trajanje „bouncy“ kvačice), iako Enigmina kvačica nema prebačaj (`DUR_UI`): pauza služi da se vidi šta je završeno i da „Poništi“ stigne pre selidbe. Vraćanje u otvoreno je `DUR_UI`. Devotion `SPRING`/`DURATION` se u `components/` ne uvoze (plan §6.3).
3. **Menadžer projekta** (zaključan zadatak, dozvole reda) je `uloga === "owner" || platformaVlasnik`, isto kao `isManager` na serveru (`convex/prostor/lib/auth.ts`). Devotion je čitao `createdByProfileId` startupa i globalnu ulogu `admin`.
4. **Flip:** Devotion `useFlip().capture()` pre izmene zamenjen je Enigminim `FlipGroup` (snimak pre commit-a, ključ rasporeda po sekcijama, `resetKey` = filter i prikaz, iznad 80 redova bez Flip-a). `flipCapture` u komandama je zato prazna funkcija. Ulaz liste pri učitavanju (`useEnter`) je uklonjen: radni ekrani ne animiraju sekcije pri učitavanju (CLAUDE.md).
5. **Gustina:** red liste je 40 px na `md+` (Devotion 44), redovi koraka takođe ≈ 40 px; tabla je `min-w-[60rem]`, pa na 1536 staje bez klizanja.
6. **Novi zadatak se ne otvara sam** (Devotion): pojavi se u listi, toast „Zadatak je napravljen.“ nudi „Poništi“. Devotion je nudio i „Otvori“ kao drugu radnju toasta; `lib/toast` ima jednu radnju, pa je zadržano „Poništi“ (put nazad za izmenu u bazi). Oblast se pamti za sledeći zadatak (`rememberLastArea`).
7. **Meni „…“ zadatka na celoj strani** nudi samo radnje koje već rade (isti `RADNJE_MENIJA` kao stranica u S10/S11). „Diskusija u Porukama“ (`EntityDiscussionPanel`) dolazi sa porukama (S15); upit `chat.channelForAnchor` se zato ne zove.
8. **Panel za ekrane „Ja“:** `TaskPanelTarget` za zadatak projekta prima opcioni `workspaceId`; kad ga ima, panel se umotava u `ProjekatStavkeProvider` (D14), pa S16/S19 samo prosleđuju projekat stavke. Na ekranu projekta ga nema.
9. **„Prebaci u projekat“ (lični zadatak)** je projektna mutacija ciljnog projekta: dugme „Prebaci“ je u koraku, pod `ProjekatStavkeProvider`-om izabranog projekta (`useProjekatMutation`), bez novog izuzetka u čuvaru. Prikaz zato prima `personalTaskId` i `onMoved` umesto Devotion `onMove`. Lični panel se na ekranu projekta ne otvara (lični zadaci nisu u listama projekta); vidi se tek u S16.
10. **„Sredi rokove“ na ekranu Zadaci.** Zadatak koraka ga traži, a plan (§6 red 10, §10) ga stavlja u Trijažu Komandnog centra (S20). Dijalog i `useReschedule` su preneti rano, a na Zadacima stoji dugme „Sredi rokove · N“ samo kad među prikazanim (uz filter) ima otvorenih sa prošlim rokom. Lista kandidata je iz učitane strane (do 50 + „Učitaj još“); S20 koristi isti dijalog u Trijaži.
11. **Boje stanja** (radnik, prihvaćeno): tačka prioriteta je žuta za „Hitno“ i neutralna za „Visok“ (crvena je samo kašnjenje i greška); „kasni“ je crven, rok danas upozorenje, ostali rokovi neutralni. Izabran dan u biraču i otvoren čip su neutralni (ne boja radnje). „Dodaj u Moj dan“ u panelu je `outline`/`secondary` sa `aria-pressed`, bez boje radnje.
12. **Čuvar pristupa:** `DOZVOLJENI_DIREKTNI` dobio je tačno ključeve S12 iz plana §3.2: `prostor.myDay.plan`, `myDay.unplan`, `personalTasks.get`, `update`, `setStatus`, `archive`, `restore` (sve L funkcije, `proveriSpisak` to potvrđuje). Nijedno pravilo nije oslabljeno.
13. **`components/ui/popover.tsx`:** `PopoverContent` prima `anchor` i prosleđuje ga Positioner-u (zamena za Radix `PopoverAnchor` kod birača otvorenog prečicom `d`). Ostali pozivaoci se ne menjaju.
14. **Precrt naslova** je širok koliko tekst (Devotion ga je u kolonama crtao preko cele kolone).
15. **Fiksture:** zadaci 200–210 (`ZADATAK_UX` = `pagesux0200`) plus zadatak 106 iz dokumenata; zadaci su i stranice oblasti, pa fikstura dopunjuje `pages.get`, putanju, stablo i broj na vrhu i ostalo prepušta dokumentima. `?osoba=profilesux0003` je Marko.
16. **Vizuelna provera:** Next razvojni znak je sklonjen samo za snimke (`nextjs-portal`), kao u S09. Navigacija unutar aplikacije gubi `?ux=1` (S10), pa su panel → „Puni prikaz“ i filteri provereni direktnim adresama.

**Novi paketi:** nema.

**Testovi:** 47 novih (svi preneti), svi prolaze.

| Fajl | Testova |
|---|---|
| `lib/prostor/modeli/command-center-model.test.ts` | 7 |
| `lib/prostor/modeli/task-page-model.test.ts` | 14 |
| `lib/prostor/modeli/comments-focus.test.ts` | 4 |
| `lib/prostor/modeli/task-checkpoint-order.test.ts` | 3 |
| `lib/prostor/modeli/task-checkpoint-layout.test.ts` | 5 (rano, S14) |
| `lib/prostor/web/deadline.test.ts` | 14 |

`task-instructions-draft` (6) je prenet u S10. Modeli reda, filtera, sortiranja, pravljenja i zastarelog (`lib/prostor/task-row`, `task-filters`, `task-sort`, `task-create`, `stale`) imaju testove od S02. Ceo `npx vitest run`: 180 fajlova, 2391 test.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije menjan);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2391);
- pristup: 632 / 617 / 15, front 62 direktna poziva, svi sa spiska;
- regresije: prolaze (20; ultra 5, prostor 1); boja modula 654/654, `font-mono` 254/254;
- `npm run build`: prolazi.

**Vizuelna provera** (Playwright, `next dev -p 3117`, ugašen na kraju):
- 1536 × 695: lista (Svi, Moji = 4, Osoba Marko = 4), tabla (5 kolona bez klizanja), kvačica (zadržavanje, precrt, toast „Završeno: …“ sa „Poništi“), birač roka u redu (prečice, kalendar, „Sutra“ → toast „Rok je promenjen.“, fokus se vraća na dugme), panel, zadatak na celu stranu (stablo pokazuje zadatke), Zadaci oblasti, dijalog „Novi zadatak“ (Enter pravi, toast „Zadatak je napravljen.“), „Sredi rokove“ (toast „Sređeno: 1 zadatak → sutra.“), prazno stanje (`&prazno=1`).
- 390 × 844: lista u dva reda bez vodoravnog klizanja, panel preko celog ekrana.
- Konzola: 0 grešaka i 0 upozorenja na svim ekranima.

**Za Jovana ujutru:**
- Na pravim podacima otvori Zadatke, završi zadatak kvačicom i proveri da red sačeka pa pređe; „Poništi“ ga vraća.
- „Sredi rokove“ je na ekranu Zadaci (ODLUKA 10), a u S20 dolazi i u Trijažu na početnoj projekta. Potvrdi da ti odgovara i ovde.
- Novi zadatak se ne otvara sam i toast nema „Otvori“ (ODLUKA 6).
- Boje: „Hitno“ je žuto, a crveno je samo kašnjenje (ODLUKA 11).
- Ništa nije deployovano.

## S13 — Ideje: tabla, lista, detalj, faze, glasanje   (2026-10-29 09:15)
**Fajlovi:**
- Ruta `app/(app)/[projekat]/ideje/page.tsx` (umesto `EkranUskoro`; klijentski kontejner u `<Suspense>`).
- `components/app/prostor/ideje/` (preneto alatom pa ručno dovršeno): `ideas-view`, `ideas-screen`, `idea-board`, `idea-card`, `idea-list`, `idea-parts`, `idea-detail`, `idea-detail-drawer`, `idea-dialogs`; nov `ekrani.tsx` (`IdejeEkran`).
- `lib/prostor/modeli/ideas-model.ts` (+ `ideas-model.test.ts`, preneto).
- Razvojni prikaz: nov `app/dev-ux/fixtures-prostor-ideje.ts` (registrovan u `app/dev-ux/fixtures.ts`); `app/dev-ux/fake-convex.ts` javlja promenu upitima posle mutacije sa fiksturom (ODLUKA 7).
- Snimci `docs/spajanje/snimci/S13-{ideje-tabla-1536,ideje-lista-1536,ideja-detalj-1536,ideje-390}.png`.
- Pomoćne skripte izmena: `.nocni-run/spajanje/tmp/s13-*.py`; izlaz alata `.nocni-run/spajanje/tmp/prenos-ekran-S13-log.txt` (11 fajlova, 25 RUČNO, sve zatvorene).

**Šta je urađeno:**
- **Ideje** (`/ideje`, `?ideja=<id>`): Enigmin `PageHeader` (ikonica mesta, „N ideja“, jedina primarna radnja „Nova ideja“), pretraga (Esc briše, broj rezultata se najavljuje) i prekidač Tabla · Lista · Mapa koji se pamti lokalno.
- **Tabla po fazama**: Predlog · Razmatra se · Odobreno · Postalo zadatak, a Odbijeno je skupljena uska kolona koja se otvara klikom. Kartica se prevlači samo kome je dozvoljena promena faze, i samo u dozvoljene kolone; promena faze putuje kroz `FlipGroup`. Strelice idu kroz kartice po kolonama, Enter otvara detalj. Ispod `md` tabla je lista grupisana po fazi (Odbijeno se rasklapa kroz `Unfold`).
- **Lista**: tabela Ideja · Autor · Glasovi · Faza · Komentari · Starost, sortiranje klikom na zaglavlje (`aria-sort`), meni reda se vidi na prelaz ili fokus; ispod `xl` red u dva reda.
- **Glas i faza**: optimistično (`useProjekatMutationOptimisticno` za `ideas.vote` i `ideas.setStage`, ključ keša `ideas.list` sa `workspaceId`); faza i iz menija „…“ (Premesti u fazu), iz izbora u detalju i prevlačenjem, sa toastom „Ideja je u fazi …“ i „Poništi“ 8 s.
- **Detalj** u desnoj fioci: naslov i tekst se čuvaju sami (1 s i na blur), autor, Za/Protiv, faza, „Pretvori u zadatak ili belešku“ (samo u fazi Odobreno i samo kome je dozvoljeno), Istorija izmena (fioka iz S11) i Komentari sa @pominjanjem (`CommentsSection`, cilj `idea`, S11). Obriši ide u Korpu sa „Poništi“; ideja koje nema nudi „Otvori Korpu“.
- **„Postalo zadatak“** vodi na stranicu zadatka (`/stranica/<id>`, S12): veza „Postalo zadatak“ u detalju i „Otvori“ u toastu posle pretvaranja.
- Kartica **Mapa** pokazuje „Mapa ideja stiže uskoro.“ (S14); „Ugnezdi u…“ (`IdeaNestDialog`) je prenet i čeka mapu.

**Paritet:**
- Red 13 (Ideje: tabla po fazama, lista, detalj, glasanje, faze, „Postalo zadatak“): gotovo.
- Red 20 (komentari sa @): dopunjeno za ideju (isti `CommentsSection`).
- Red 21 (istorija): ideja koristi istu fioku istorije.
- Red 14 (Mapa ideja): nije, S14; kartica Mapa ima prazno stanje sa putem nazad.

**ODLUKE:**
1. **„Diskusija u Porukama“ nije u meniju detalja** (`chat.channelForAnchor`, `EntityDiscussionPanel`): dolazi sa porukama (S15), isto kao S12 ODLUKA 7. Meni „…“ detalja nudi samo Obriši, a kad brisanje nije dozvoljeno, menija nema. Plan S07 §8 je fiksturi ideja pripisao i `chat.channelForAnchor`; nije dodata jer je ekran ne zove.
2. **Mapa i ugnežđavanje čekaju S14.** Kontejner ne uvozi `ideas-canvas-view` ni `collaboration.requestNesting`; `IdeaNestDialog` i `CreateTarget` (roditelj, položaj) ostaju za S14. Dijalog „Nova ideja“ već ume naslov „Nova grana ideje“.
3. **Pokret:** Devotion `useEnter` (ulaz kartica pri učitavanju i promeni prikaza) nije prenet — radni ekrani se ne animiraju pri učitavanju (CLAUDE.md), kao S12 ODLUKA 4. `NumberRoll` (kotrljanje broja glasova) je zamenjen običnim brojem (`formatNumber`, `tabular-nums`): glas nije nagrada, a ekran ima već Flip. `Collapse` → Enigmin `Unfold`. `data-motion-enter` oznake su uklonjene (niko ih ne čita).
4. **Boja radnje nije stanje izbora** (kao S11 ODLUKA 4 i S12 ODLUKA 11): moj glas je podloga kontrole + puna ikonica (bez `radnja-soft` i `text-primary`), otvorena kartica i red su `surface-raised` sa neutralnom ivicom, cilj prevlačenja je neutralan isprekidan obris, izbor vrste u „Pretvori“ je neutralan. Kolone table nemaju podlogu (nema kutije u kutiji); kartice su `bg-card` + `shadow-elev-1`. Kartica koja se prevlači ostaje kao prazan obris umesto providnog teksta (pravilo punog tona). Onemogućen glas (pretvorena ideja) je prigušen tokenima, ne `opacity`.
5. **Dugmad:** „Nova ideja“ u zaglavlju je jedina primarna radnja ekrana; u praznom stanju je `outline`. U dijalozima je primarna samo potvrda („Dodaj ideju“, „Pretvori“, „Ugnezdi“), kao S11 ODLUKA 4. „Pretvori u zadatak ili belešku“ u detalju je `secondary`.
6. **`window.confirm` „Odbaciti nesačuvanu ideju?“** je zamenjen Enigminim `ConfirmDialog` („Odbaci“), jer `confirm-dialog.tsx` izričito odbija `window.confirm`. `MotionDialog` → `Dialog`/`DialogPopup`, a Devotion `Select` delovi → Enigmin `Select` (sa `label`; faza u detalju ima natpis kroz `id`).
7. **Lažni Convex (`app/dev-ux/fake-convex.ts`) sada javlja `onUpdate` posle mutacije koja ima fiksturu.** Bez toga se glas i faza u razvojnom prikazu nisu menjali (lažni klijent nema keš ni pretplate, a prihvatanje traži da se glas i faza menjaju). Mutacija bez fiksture (`undefined`) ništa ne budi, pa mutacija iz efekta ne može da zavrti krug; provereno na Zadacima i Danas (konzola čista, nema stalnog crtanja). Fikstura ideja drži glas, fazu i brisanje u stanju modula; osvežavanje strane ga vraća. Optimistični put proverava test modela (`applyIdeaVote`, `applyIdeaStage`).
8. **Adresa:** otvaranje i zatvaranje detalja menja `?ideja=` bez novog unosa u istoriji (Devotion `replace: true`). Neispravan ID u adresi se ignoriše (`jeOblikId`).
9. **Model:** brojevi u tekstu („3 ideje“, „Za: 3 glasa“, broj komentara) idu kroz `formatNumber`; `Intl.Collator` za sortiranje ostaje u `lib/prostor/modeli` (poređenje, ne prikaz; čuvar formata dozvoljava `Intl` u `lib`). Ključ lokalnog skladišta prikaza ostaje `devotion:ideje:prikaz`, kao ostali preneti ključevi (`devotion:oblast:*`, `devotion:quick-add:*`). Test modela je prenet bez izmene (21 test, 103 `expect(`, isto kao Devotion); RUČNO 80 („admin“ u testu) je samo naziv uloge u pozivu deljenog pravila, pa nije menjan.
10. **Base UI:** natpis „Premesti u fazu“ u meniju je umotan u `DropdownMenuGroup` (Base UI baca grešku za `Menu.GroupLabel` van grupe; viđeno u pregledaču i popravljeno).
11. Nijedan fajl čuvara nije menjan. Front i dalje ima 62 direktna poziva, svi sa spiska.

**Novi paketi:** nema.

**Testovi:** 21 nov (preneto), svi prolaze.

| Fajl | Testova | Napomena |
|---|---|---|
| `lib/prostor/modeli/ideas-model.test.ts` | 21 | preneto; `expect(` 103/103 |

Ceo `npx vitest run`: 181 fajl, 2412 testova.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije menjan);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2412);
- pristup: 632 / 617 / 15, front 62 direktna poziva, svi sa spiska;
- regresije: prolaze (20; ultra 5, prostor 1).

**Vizuelna provera** (Playwright, `next dev -p 3117`, ugašen na kraju):
- 1536 × 695: tabla (4 kolone + skupljeno Odbijeno, otvaranje Odbijenog), glas Za na kartici (2 → 3, `aria-pressed`), faza kroz meni „…“ (kartica prelazi iz Predlog u Odobreno, toast sa „Poništi“), lista sa sortiranjem po starosti, detalj sa komentarima (`?ideja=ideaNodesux0002`), faza iz izbora u detalju (pojavi se „Pretvori u zadatak ili belešku“), „Postalo zadatak“ (`ideaNodesux0010`) traži `/enigma-it/stranica/pagesux0200` (zadatak iz S12; prijava se pojavi samo zato što navigacija gubi `?ux=1`, S10 ODLUKA 10), prazno stanje (`&prazno=1`), dijalog „Nova ideja“ sa potvrdom „Odbaci“.
- 390 × 844: tabla kao lista po fazama, bez vodoravnog klizanja.
- Konzola: 0 grešaka i 0 upozorenja posle popravke iz ODLUKE 10.
- Next razvojni znak je sklonjen samo za snimke (`nextjs-portal`).

**Prihvatanje (dokaz):**
- „Tabla, lista i detalj rade u razvojnom prikazu; glas i faza se menjaju“: vizuelna provera iznad i snimci `S13-ideje-tabla-1536.png` (posle promene faze, toast vidljiv), `S13-ideje-lista-1536.png`, `S13-ideja-detalj-1536.png`, `S13-ideje-390.png`.
- „Čuvari prolaze“: pristup i regresije prolaze, nijedan fajl čuvara nije menjan.
- „Provere prolaze; sekcija S13 je u progress-u“: ovo je ta sekcija.

**Za Jovana ujutru:**
- Na pravim podacima glasaj i promeni fazu ideje (meni „…“, prevlačenje na tabli, izbor u detalju) i proveri „Poništi“.
- Pretvori odobrenu ideju u zadatak i otvori ga iz toasta i iz detalja („Postalo zadatak“).
- Razvojni prikaz sada osvežava upite posle mutacije sa fiksturom (ODLUKA 7); ako neki stari ekran u `?ux=1` počne drugačije da se ponaša, to je razlog.
- Ništa nije deployovano.

## S14 — Mape: oblast, stranica, ideje, beleške   (2026-10-29 10:01)
**Fajlovi:**
- `components/app/prostor/mape/` (preneto alatom pa ručno dovršeno): `area-canvas-view`, `ideas-canvas-view`, `page-map-view` (iz `page-workspace-view`), `page-peek`, `workspace-item-dialog`, `thought-sidebar-drag`; `canvases/` (`area-flow-node`, `idea-flow-node`, `task-checkpoint-flow-node`, `canvas-action-rail`, `perimeter-resize-control`, `use-canvas-navigation` + tri CSS modula); `map/` (`map-card` + CSS modul, `map-chrome`); `thoughts/` (`thoughts-canvas-view`, `thought-node`, `thought-edge`, `thought-editor-dialog`, `thought-conversion-dialog`, `types`, `index` + CSS modul).
- Novi u `mape/`: `index.tsx` (dinamički ulaz: `MapaOblasti`, `MapaStranice`, `MapaIdeja`, `MapaBeleski`, svaka u svojoj istoriji radnji), `mapa-stil.ts` (xyflow `style.css` + `mape.css`), `mapa-kostur.tsx`, `ekrani.tsx` (`BeleskeEkran`).
- Rano iz S16 (alat, `--samo`): `components/app/prostor/ja/brzi-unos/thought-sharing.ts` (samo tipovi; traže ga `thoughts/types.ts` i `thought-sidebar-drag`).
- `lib/prostor/modeli/` (+ testovi): `map-model`, `nesting-drop`, `perimeter-resize-geometry`, `thought-hierarchy`. `lib/prostor/web/`: `canvas-nesting` (+ test), `canvas-node-size` (+ test, dobio `CHECKPOINT_NODE_SIZE`), nov `boja-mape.ts`. Nov čuvar `lib/prostor/mape-lenje.test.ts`.
- Izmenjeni: `dokumenti/area-view.tsx` (kartica Mapa + panel zadatka sa mape), `dokumenti/page-route-view.tsx` i `dokumenti/ekrani.tsx` (`?tab=mapa` crta `MapaStranice`), `dokumenti/page-document-view.tsx` („Prikaži na mapi“ u meniju „…“ i u podstranicama), `ideje/ideas-view.tsx` (`MapaIdeja`, „Ugnezdi u…“), `ideje/ideas-screen.tsx` (mesto `map`), `app/(app)/[projekat]/beleske/page.tsx` (umesto `EkranUskoro`).
- Čuvari: `lib/front-cuvar.ts` (+ test), `scripts/verify-pristup.ts` (ODLUKA 8).
- Razvojni prikaz: nov `app/dev-ux/fixtures-prostor-mape.ts` (radnik), registrovan u `app/dev-ux/fixtures.ts`; `fixtures-prostor-ideje.ts` dobio raspored mape, veze i ugnežđenu ideju.
- Snimci `docs/spajanje/snimci/S14-{mapa-oblasti-1536,mapa-ideja-1536,mapa-beleski-1536,mapa-390}.png`.
- Pomoćno: recept radnika `.nocni-run/spajanje/tmp/s14/brief-radnik.md`; izveštaj alata `.nocni-run/spajanje/tmp/prenos-ekran-S14.md` (40 fajlova, 130 RUČNO, sve zatvorene); dodatni snimci provere u `.nocni-run/spajanje/tmp/s14/`.

**Šta je urađeno:**
- **Mapa oblasti** (`/dokumenti/<id>?tab=mapa`, nova kartica „Mapa“): kartice stranica i zadataka (`MapCard`), veze i relacije, koraci zadatka oko kartice, promena veličine povlačenjem ivice, traka radnji desno (filter vrste, „Nova …“), Poništi · Ponovi, „Pregled“ u fioci, a za zadatak panel zadatka iz S12. Prevlačenje kartice na drugu je ugnežđavanje (natpis „Pusti da ugnezdiš“, toast sa „Poništi“).
- **Mapa stranice** (`/stranica/<id>?tab=mapa`): ista mapa za podstranice, sa „Nazad na stranicu“ (i Esc). Dokument nudi „Prikaži na mapi“ u meniju „…“ i u podstranicama kad stranica ima decu.
- **Mapa ideja** (kartica Mapa u Idejama): ideje po položaju, grupe (ugnežđene ideje), veze sa natpisom, glas i faza na kartici, kontekstni meni (Otvori, Nova grana, Ugnezdi u…, Izaberi povezane, Dupliraj, Obriši), „Nova ideja ovde“ i „Ugnezdi u…“ kroz dijalog iz S13.
- **Mapa beleški** (`/<projekat>/beleske`): misli, niti sa natpisom, glavna misao, boje, dupli klik dodaje misao, „Pošalji u Ideje“, dupliranje, arhiviranje, mini-mapa, kontekstni meni na misli, niti i platnu. Ekran ima zaglavlje „Beleške“; posmatrač vidi „Beleške nisu dostupne.“
- **Lenjo učitavanje:** mape su samo iza `mape/index.tsx` (`next/dynamic`, `ssr: false`); xyflow stil uvozi samo `mapa-stil.ts`, a nju četiri pogleda. Nov test čuva oba pravila.
- **Točkić** skroluje stranicu dok se ne klikne u mapu; zum je Ctrl/⌘ + točkić ili dugmići (`useMapActivation`), na sve četiri mape.
- Kontekstni meni je Base UI (`components/ui/context-menu`, S08); tema je samo tamna (`colorMode="dark"`), hex i Devotion tokeni su prepisani na Enigmine.

**Paritet:**
- Red 8 (Mapa beleški projekta): gotovo.
- Red 14 (Mapa ideja): gotovo; dopunjuje red 13 iz S13.
- Red 24 (Mapa oblasti i stranice: kartice, veze, ugnežđavanje prevlačenjem): gotovo.
- Red 7 (Beleške „Ja“) i prevlačenje misli u stablo menija ostaju za S16 (ODLUKA 6).

**ODLUKE:**
1. **Boja beleške i ideje je kategorija** (`lib/prostor/web/boja-mape.ts`): `data-cat` iz validirane palete `--chart-1..6`, kao čipovi signala. `amber` ide na narandžastu (slot 2), jer je slot 4 rezervisan (blizu zlatne nagrade), pa je natpis „Ćilibar“ postao „Narandžasta“. Neutralna nema boju kategorije (`--text-muted`).
2. **Boja radnje nije stanje izbora** (kao S11–S13): izabrana veličina, aktivna stavka trake, cilj ugnežđavanja i izabrana boja su neutralni (`surface-control-hover`, `line-strong`); boja radnje ostaje za vezu u nastanku i ručku pod mišem. Na mapama nema primarnog dugmeta (primarno je u zaglavlju ekrana); u dijalozima je primarna samo potvrda. „Blokirano“ na kartici zadatka je upozorenje, „u toku“ info (S09).
3. **Istorija radnji** (Poništi · Ponovi, Ctrl/⌘ + Z/Y) važi dok je mapa otvorena: `WorkspaceHistoryProvider` je oko svake mape u `mape/index.tsx`, a ne oko cele ljuske kao u Devotionu. Globalni Ctrl/⌘ + Z bi presretao sve Enigmine ekrane, a mape su jedine koje ga pune. Posledica: istorija se ne pamti kad se napusti mapa.
4. **Visina mape:** sve četiri mape su `h-[min(72vh,52rem)] min-h-[32rem]` (kao Devotion mapa oblasti). Devotion je mapu ideja i beleški crtao preko celog ekrana, a ovde su u toku strane, pa im je visina morala da se zada.
5. **Mapa beleški dobila je aktivaciju točkića** (Devotion je tamo imao `preventScrolling` podrazumevano): korak traži isto ponašanje na mapama. Radnik je dodao i `onContextMenu` na omotač, jer xyflow ne zove `onPaneContextMenu` kad je desni taster u `panOnDrag` (meni platna je inače koristio zastareli cilj).
6. **`thought-sidebar-drag.tsx` je preneto, ali nije montirano:** u Devotionu `c05c40f` nijedan pozivalac ne prosleđuje `onBeginSidebarDrag` ni `onRequestDestination` (sloj se nikad ne pali), pa paritet ne gubi ništa. `thought-sharing.ts` je rano preneto iz S16 (samo tipovi).
7. **`canvas-node-size.test`:** dva testa poređenja sa kopijom za telefon (`apps/mobile`) nisu preneta, jer telefona u Enigmi još nema (jednoredni komentar umesto njih). Test granica koraka zadatka je zadržan: granice (140–520 × 92–600) su sada `CHECKPOINT_NODE_SIZE` u `lib/prostor/web/canvas-node-size.ts`, a čvor koraka ih čita (bile su inline). Fajl ima 4 od 6 testova i 13 od 16 `expect(`.
8. **Čuvari:**
   - `scripts/verify-pristup.ts`: `DOZVOLJENI_DIREKTNI` dobio je tačno 13 ključeva S14 iz plana S07 §3.2 (`thoughts.archiveEdges` … `updateNodeLayout`, sve L, `proveriSpisak` to potvrđuje). Front sada ima 75 direktnih poziva (bilo 62), svi sa spiska.
   - `lib/front-cuvar.ts`: `.query(api…)` nad rezultatom `useProjekatKlijent()` (kuka S08 iz plana §3.1, sama ubacuje `workspaceId`) više nije direktan poziv; `useConvex().query` i svaki drugi klijent i dalje jesu. Test to pokazuje u oba smera. Bez ovoga planirana kuka nije mogla da se koristi (`getConnectedGroup`).
9. **Radnici** (tri mape i fiksture, Sonnet; diff, typecheck i lint pregledani): prop `workspaceId` je skinut sa `AreaCanvasView`, `IdeasCanvasView`, `PagePeek`, čvora koraka i akcija kartice (kuke ga ubacuju); `key` mape ideja je `workspaceId` iz `useProjekat()`; mini-mapa beleški boji po `--chart-N`; ugrađen `<style>` iz Devotion mape beleški (neispravni `:global` selektori) je uklonjen; Badge `variant` → `ton`; prečica dupliranja je `usePrecica("D")`. Fiksture: `areasV2.requestNesting` i `ideas.connect` nemaju fiksturu (u prikazu ostaju lokalno), početni pogled mape ideja je pomeren da Poništi · Ponovi ne prekriva prvu karticu.
10. **CRLF:** nova fikstura je stigla sa CRLF krajevima; svi S14 fajlovi su LF, kao ostale fiksture.
11. **Razvojni prikaz:** klik na karticu oblasti menja adresu i gubi `?ux=1` (S10 ODLUKA 10), pa je mapa oblasti otvarana direktnom adresom `?tab=mapa`; na Idejama je prekidač lokalan, pa je tamo lenjo učitavanje provereno klikom.

**Novi paketi:** nema (`@xyflow/react@12.11.2` je iz S02).

**Testovi:** 50 novih, svi prolaze.

| Fajl | Testova | Napomena |
|---|---|---|
| `lib/prostor/modeli/map-model.test.ts` | 18 | preneto; `expect(` 51/51 |
| `lib/prostor/modeli/nesting-drop.test.ts` | 6 | preneto; 6/6 |
| `lib/prostor/modeli/perimeter-resize-geometry.test.ts` | 4 | preneto; 12/12 |
| `lib/prostor/modeli/thought-hierarchy.test.ts` | 3 | preneto; 6/6 |
| `lib/prostor/web/canvas-nesting.test.ts` | 9 | preneto; 13/13 |
| `lib/prostor/web/canvas-node-size.test.ts` | 4 | preneto 4 od 6 (ODLUKA 7); 13/16 |
| `lib/prostor/mape-lenje.test.ts` | 5 | nov čuvar: xyflow samo u `mape/`, stil samo u `mapa-stil.ts`, van `mape/` samo ulaz, ekran i kostur; ulaz dinamički bez SSR-a |
| `lib/front-cuvar.test.ts` | +1 | klijent projekta nije direktan poziv, `useConvex` jeste |

`task-checkpoint-layout` (5) je prenet rano u S12. Ceo `npx vitest run`: 188 fajlova, 2462 testa.

**Rezultat provere:**
- codegen: nije potreban (`convex/` nije menjan);
- typecheck: prolazi;
- lint: 0 grešaka (1209 upozorenja, kao i ranije);
- vitest: prolazi (2462);
- pristup: prolazi, front 75 direktnih poziva, svi sa spiska;
- regresije: prolaze (20; ultra 5, prostor 1); boja modula 654/654, `font-mono` 254/254.

**Vizuelna provera** (Playwright, `next dev -p 3117`, ugašen na kraju):
- Mapa oblasti (1536 × 695): 8 kartica i 4 veze; prevlačenje kartice je pomera (1080, 240 → 1159, 319); prevlačenje kartice preko druge pokazuje „Pusti da ugnezdiš“ i daje toast „… je ugnežđeno u …“ sa „Poništi“; povlačenje od ručke do ručke dodaje vezu (4 → 5); točkić nad neaktivnom mapom skroluje stranu (zum ostaje 69 %), Ctrl + točkić zumira (69 → 91 %).
- Mapa stranice: „Mapa · Endpointi za plaćanje“ sa 2 podstranice i relacijom; dokument ima „Prikaži na mapi“.
- Mapa ideja: 13 ideja, 3 veze, grupa sa ugnežđenom idejom; desni klik na ideju daje meni, a „Ugnezdi u…“ otvara dijalog.
- Mapa beleški: 8 misli i 4 niti; desni klik na misao daje meni misli, na prazno platno meni platna („Nova misao ovde“ otvara dijalog); prevlačenje misli je pomera.
- 390 × 844: mapa oblasti bez vodoravnog skrola, uklopljena na 20 %.
- Konzola na tekućim stranama: 0 grešaka i 0 upozorenja (greška istorije radnji i upozorenje „parent container needs a width and a height“ su viđeni i popravljeni, ODLUKE 3 i 4).

**Prihvatanje (dokaz):**
- „Sve tri vrste mapa se otvaraju u razvojnom prikazu; prevlačenje, veze i kontekstni meni rade“: vizuelna provera iznad i snimci `S14-mapa-oblasti-1536.png`, `S14-mapa-ideja-1536.png`, `S14-mapa-beleski-1536.png`, `S14-mapa-390.png`.
- „Glavni ekran oblasti ne učitava xyflow dok se ne otvori Mapa“: u mreži, `/enigma-it/dokumenti/areasux0001?ux=1&tab=pregled` učitava 85 JS fajlova i nijedan nema xyflow kod (traženo `react-flow__pane` u sadržaju svakog fajla); ista oblast sa karticom Mapa dodaje `area-canvas-view` i `node_modules_…` (744 KB, xyflow). Na Idejama klik na Mapa dovlači 3 nova komada (85 → 88). Statički to čuva `lib/prostor/mape-lenje.test.ts`.
- „Provere prolaze; sekcija S14 je u progress-u“: ovo je ta sekcija.

**Za Jovana ujutru:**
- Na pravim podacima otvori Mapu oblasti: prevuci karticu, poveži dve kartice, prevuci karticu preko druge (ugnežđavanje) i proveri „Poništi“; Ctrl/⌘ + Z poništava poslednju radnju na mapi.
- Na Idejama (Mapa) napravi vezu između ideja i ugnezdi ideju; na `/<projekat>/beleske` dodaj misao duplim klikom, poveži dve i pošalji jednu u Ideje.
- Istorija radnji važi samo dok je mapa otvorena (ODLUKA 3). Potvrdi da ti to odgovara.
- „Ćilibar“ je sada „Narandžasta“ (ODLUKA 1).
- Ništa nije deployovano.
