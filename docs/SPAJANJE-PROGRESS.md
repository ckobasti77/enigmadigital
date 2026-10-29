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
