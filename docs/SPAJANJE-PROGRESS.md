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
