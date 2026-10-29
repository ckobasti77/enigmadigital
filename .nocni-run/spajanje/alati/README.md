# Alat za prenos Devotion backenda (`prenesi-backend.mjs`)

SPAJANJE, plan `docs/spajanje/planovi/S01.md` §4. Alat kopira fajlove iz snimka Devotiona u Enigmu i primenjuje mehanička pravila. Ono što nije mehaničko upisuje u izveštaj kao **RUČNO**. Posle alata korak uvek završava ručno i pušta provere.

## Pokretanje

```bash
# backend grupa koraka (moduli + lib + testovi iz GRUPE[korak])
node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S03            # piše fajlove
node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S03 --suvo     # samo izveštaj, ništa ne piše
node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S03 --samo pages,areasV2   # deo grupe
node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S03 --bez-testova
node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S03 --prepisi  # prepisuje postojeći cilj

# deljena logika: packages/shared/src → lib/prostor (S02)
node .nocni-run/spajanje/alati/prenesi-backend.mjs --korak S02 --deljeno
```

- **Izvor (samo čitanje):** `.nocni-run/spajanje/tmp/devotion/packages/backend/convex/` i `…/packages/shared/src/`.
- **Cilj:** modul `convex/prostor/<ime>.ts`, lib `convex/prostor/lib/<ime>.ts`, test `convex/prostor/<ime>.test.ts`, deljeno `lib/prostor/<ime>.ts`.
- **Postojeći cilj se ne prepisuje** bez `--prepisi`, da ručne izmene ne nestanu.
- **Izveštaj:** `.nocni-run/spajanje/tmp/prenos-<korak>[-deljeno].md` (broj izmena po pravilu, spisak RUČNO sa redom).
- Grupe po koraku (`GRUPE`) i klase funkcija (`KLASE`) su na vrhu alata; njih se menja kad korak doda modul.

## Pravila (redom)

| # | Pravilo | Primer |
|---|---|---|
| A · T2 | Testovi, seed: `ctx.db.insert("startups", ` → `insertStartup(ctx, `, `"startupMembers"` → `insertClanstvo(ctx, `, `"profiles"` → `insertProfil(ctx, `; jednoredni `patch("startupMembers", X, { archivedAt })` → `ukloniClanstvo(ctx, X)`; `patch("startups", X, { archivedAt: Y })` → `patch("workspaces", X, { arhiviran: (Y) !== null })`; dodaje uvoz iz `./testSvet.pomoc` | S01 §5.2 |
| A · T3 | Testovi, okruženje: identitet `` `${x}\|bilo-šta` `` i `subject: x` → `` `${x}\|sesija-test` ``; `import.meta.glob("./**/*.ts")` → `import.meta.glob("/convex/**/*.*s")`; `import schema from "./schema"` → `"../schema"`; `../../shared/src/` → `../../lib/prostor/`; u deljenim testovima `../../backend/convex/lib/` → `../../convex/prostor/lib/` | S01 §5.1 |
| A · T4 | Putanje: modul `./_generated/` → `../_generated/`, lib `../_generated/` → `../../_generated/`; `import schema from "./schema"` → `import { prostorTabele } from "./schema"` i `schema.tables.` → `prostorTabele.` | activity, inbox |
| B · T1 | Tekstovi za korisnika (`PORUKE_DEO`, `PORUKE_TACNO`): „startup“ → „projekat“, „vlasnik startupa ili admin“ → „vlasnik projekta“ | S01 §3.8 |
| B · T5 | `api.X.` / `internal.X.` → `api.prostor.X.` / `internal.prostor.X.` | `internal.inbox.markAllReadBatch` |
| B · T6 | String literali: `"startups"` → `"workspaces"`, `"startupAreas"` → `"areas"`, `"startupId"` → `"workspaceId"` | `v.id("startupAreas")`, `q.eq("startupId", …)` |
| B · T7 | Ime indeksa (`"by_…"`, `"search_…"`): `startup` → `workspace`; ime duže od 64 znaka gubi `Id` (`by_workspace_and_…`) | `"by_profile_and_startup"` |
| B · T8 | Identifikatori (tabela `IDENTIFIKATORI`) i ime polja u tipu (`Pick<T, "startup">`, `T["startup"]`) | `{ profile, startup }` → `{ profile, workspace }` |
| C · T9 | Registracije po `KLASE`: P → `projekatQuery/Mutation/Action` + `uloga: "urednik"` (P! → `"owner"`) i brisanje `workspaceId: v.id("workspaces")` iz `args` (omotač ga dodaje); L → `prijavljenQuery/Mutation`; I → `internal*`; sređuje uvoze `_generated/server` i dodaje `../lib/projekat` | S01 §3.5, §3.6 |
| T10 | Zaglavlje `// Preneto iz Devotion … (main @ c05c40f), SPAJANJE <korak>.` | — |

Izmene nad identifikatorima i stringovima idu kroz TypeScript AST, pa se ne diraju komentari, enum vrednosti (`"startup"` vrsta kanala, `startup_created`) ni tekst šablona.

### Tabela preimenovanja (važi i za `lib/prostor` i, kasnije, za web)

`startupId(s)` → `workspaceId(s)`, `startup(s)` → `workspace(s)`, `requireStartupMember` → `requireClanProjekta`, `requireProfileInStartup` → `requireProfilUProjektu`, `requireAdmin` → `requireVlasnikPlatforme`, `isStartupManager` → `isManager`, `isStartupOwner` → `isOwner`, `inStartup` → `inWorkspace`, `listMyActiveStartups` → `listMyActiveWorkspaces`, `startupMiniOf` → `workspaceMiniOf`, `startupMiniValidator` → `workspaceMiniValidator`, `StartupMini` → `WorkspaceMini`, `MY_SCOPE_STARTUP_CAP` → `MY_SCOPE_WORKSPACE_CAP`, `startupAreaDocumentValidator` → `areaDocumentValidator`.

**Ne preimenuju se** imena izvezenih funkcija (`listForStartup`, `moveToStartup`, …) ni camelCase imena sa `Startup` (`countOpenByStartup`): ugovor sa webom ostaje 1:1 (S01 D10).

### Klasa funkcije (`KLASE`)

Podrazumevana klasa modula i izuzeci po imenu funkcije. Nova funkcija ili nov modul: dodaj red u `KLASE` pre pokretanja. Ako P funkcija ima opcioni ili `null` `workspaceId`, alat je ne dira i upisuje RUČNO (to je L funkcija).

## Šta ostaje ručno (izveštaj ga navodi)

- upiti nad `"startupMembers"` → `clanstvoProfila`, `aktivniClanoviProjekta`, `listMyActiveWorkspaces` (`convex/prostor/lib/auth.ts`, `ljudi.ts`, `my_scope.ts`); `"appState"` i Devotion `"invites"` se uklanjaju;
- polja projekta: `archivedAt` → `arhiviran === true`, `description` → `opis ?? ""`, `logoStorageId` → `brend?.logoStorageId`, `createdByProfileId` → `vlasnikProjektaProfileId`;
- čitanje `profile.role` (P7: `isManager`, `jeVlasnikPlatforme`, `requireVlasnikPlatforme`); `getAuthUserId` van adaptera;
- `startupDocumentValidator` → `workspaceMiniValidator`; pozivi `migrations`/`areasV2Migrations` (S01 §5.3);
- lična akcija (nema `prijavljenAction`), `process.env`, uvoz Devotion `./auth`;
- testovi: dodati `workspaceId` u pozive P funkcija koje ga ranije nisu primale (typecheck to javlja), seed u više redova, `role: "admin"` scenariji (sada vlasnik platforme kroz `insertProfil`).

## Posle alata, obavezno

```bash
npx convex codegen
npm run typecheck
npx vitest run convex/prostor
node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
npm run verify:prostor-pristup
```

## Isprobano (S02)

- `--korak S02`: 2 modula (`profiles`, `storage`), 16 lib fajlova, 9 test fajlova; `profiles.ts` je posle alata prepisan ručno (D22).
- `--korak S02 --deljeno`: 26 modula, 26 testova i `index.ts` u `lib/prostor/`; 0 RUČNO stavki, testovi prolaze.
- `--suvo` za S03–S06 radi bez greške (izveštaji pokazuju RUČNO stavke za te korake).

## Isprobano (S03)

- `--korak S03`: 11 modula, 13 lib fajlova, 4 test fajla; 41 RUČNO stavka (23 poziva migracija u `areasV2.test.ts`, polja projekta, `startupMembers` u `search`, `dashboard` i `lib/comments`). Posle alata typecheck je imao 69 grešaka, sve u tim stavkama.
- `proveraOblasti.pomoc.ts` alat ne pravi: sastavljen je iz `areasV2Migrations.ts` (31–57, 82–159, 721–1131) uz ista preimenovanja (S01 D2, §5.3).
- Novo u adapteru: `profilKreatoraProjekta` (vlasnik cilja komentara bez zamenskog profila).

## Isprobano (S04)

- `--korak S04`: 7 modula, 1 lib fajl (`my_day`), 7 test fajlova; 21 RUČNO stavka (`startupDocumentValidator` u `tasks.listMine`, `startupMembers` u `tasks`, `puls` ×2 i `lib/my_day`, `archivedAt` projekta, tri bloka testova koji zovu migracije i `startups.removeMember`).
- Posle alata typecheck modula je imao 28 grešaka (sve u RUČNO stavkama); testovi oko 460, skoro sve „nedostaje `workspaceId`“ u pozivima P funkcija koje ga ranije nisu primale.
- `ctx.db.patch("profiles", id, { role: "admin" })` posle `insertProfil` alat ne hvata: takav profil NIJE vlasnik platforme. Seed mora da napravi profil kroz `insertProfil` sa `role: "admin"`.
- Devotion kreator startupa nije bio automatski član; `insertStartup` kreatoru daje `owner` red, pa se „napustio projekat“ radi sa `ukloniClanstvo` nad tim redom.

## Isprobano (S05)

- `--korak S05`: 6 modula (`ideas`, `thoughts`, `canvases`, `pageTables`, `pageFiles`, `aiProviders`), 0 lib fajlova, 15 test fajlova; 6 RUČNO stavki (`profile.role` u `aiProviders`, dva poziva migracija u testovima, tri upita nad `startupMembers` u testovima).
- Posle alata moduli su imali 0 grešaka typecheck-a; testovi 368 (skoro sve „nedostaje `workspaceId`“).
- Alat ne vidi da P funkcija sme da čita dokument iz DRUGOG projekta (`thoughts.convertToIdeas`: izvor je lična beleška ili beleška drugog mog projekta, cilj je `ctx.projekat`). Takvo mesto mora da proveri izvor bez `ctx.projekat` (`{ ...ctx, projekat: undefined }`), inače adapter odbija sa „Stavka nije pronađena u ovom projektu.“
- Alat ostavlja `args: { }` kad obriše jedini `workspaceId` (kozmetika).

## Isprobano (S06)

- `--korak S06`: 10 modula (`chat`, `notifications`, `inbox`, `notificationSettings`, `pushSubscriptions`, `push`, `expoPush`, `expoPushTokens`, `pushTest`, `adminAuth`), 0 lib fajlova, 10 test fajlova; 27 RUČNO stavki (`startupMembers` u `chat` ×2, `expoPushTokens`, `adminAuth` i dva testa; `profile.role` u `chat` ×7; `process.env` u `push`/`expoPush`/`pushTest`; uvoz Devotion `./auth` u `adminAuth`; `startups.removeMember` u `legacyFlows.test`).
- Posle alata `npx convex codegen` pada dok `adminAuth.ts` uvozi Devotion `./auth` (esbuild ne nalazi modul); prvo popraviti uvoz, pa `codegen --typecheck disable`.
- Testovi su posle alata imali samo 41 grešku typecheck-a (5 fajlova); većina padova je bila u ponašanju (P9, imena zakazanih poslova `prostor/<modul>:<fn>`, `contentType` u `_storage`).
- `adminAuth.ts` i `remindDueTasks` su prepisani ručno po S01 §3.6d i §3.6e; `lib/lozinka.ts` je nov (D13).

---

# Alat za prenos Devotion ekrana (`prenesi-ekran.mjs`, S08)

SPAJANJE, plan `docs/spajanje/planovi/S07.md` §9 i §10. Alat kopira web fajlove iz snimka (`.nocni-run/spajanje/tmp/devotion/apps/web/`) u Enigmu i primenjuje mehanička pravila (E1–E13). Ono što nije mehaničko upisuje kao **RUČNO**, sa brojem reda. Posle alata korak uvek ručno dovršava fajlove i pušta provere.

## Pokretanje

```bash
node .nocni-run/spajanje/alati/prenesi-ekran.mjs --korak S10                 # piše fajlove svog koraka
node .nocni-run/spajanje/alati/prenesi-ekran.mjs --korak S10 --suvo          # samo izveštaj
node .nocni-run/spajanje/alati/prenesi-ekran.mjs --korak S10 --samo components/workspace/page/page-route-view
node .nocni-run/spajanje/alati/prenesi-ekran.mjs --korak S10 --prepisi       # prepisuje postojeći cilj
node .nocni-run/spajanje/alati/prenesi-ekran.mjs --korak S21 --samo components/workspace/trash/trash-model --izlaz tmp   # proba u tmp/proba-ekran
node .nocni-run/spajanje/alati/prenesi-ekran.mjs --pokrivenost               # svaki fajl snimka ima korak ili je u NE_PRENOSI
```

- `--samo` prima putanju modula u snimku bez nastavka (ili sa njim); test fajl istog modula ide uz njega.
- **Izveštaj:** `.nocni-run/spajanje/tmp/prenos-ekran-<korak>[-proba].md`.
- **Izlazni kod 1** kad fajl uvozi nešto zabranjeno (`framer-motion`, `@radix-ui/*` osim kontekstnog menija, temu, Geist).

## Gde ide koji fajl

- `FAJLOVI`: pojedinačni fajlovi (izvor bez nastavka → cilj bez nastavka i korak).
- `FASCIKLE`: cele fascikle snimka (npr. `components/workspace/area/` → `components/app/prostor/dokumenti/`, S10). Čist `.ts` fajl koji ima svoj `.test.ts` ide u `lib/prostor/modeli/` (P24), osim kuka (`use-*`).
- `UI`: Devotion primitiv → Enigmin (korak „ZAMENA“: uvoz se preusmerava, fajl se ne prenosi). Birač datuma se prenosi u S12.
- `PO_IMENU`: modul koji ide na više mesta (`workspace-error-boundary`: kuke u `podaci/ja`, granica u `zajednicko/granica-greske`; barel `components/motion`).
- `NE_PRENOSI`: svesno se ne prenose (ljuska, tema, prijava, Devotion pokret koji Enigma ima, `circular-text-layout`…).

Cilj pod `lib/` dobija RELATIVNE uvoze (vitest nema `@/`).

## Pravila (redom prolaza)

| Prolaz | Pravilo | Šta radi |
|---|---|---|
| JSX | E11 | `DialogContent` → `DialogPopup`; `onSelect` → `onClick` na stavkama menija (uz `preventDefault` dodaje `closeOnClick={false}` + RUČNO); `forceMount` se briše + RUČNO; `asChild` sa jednim JSX detetom → `render={<dete …/>}` (deca deteta ostaju unutra) |
| JSX | E13 | `<Button>` bez `variant` ili sa `variant="default"` → `variant="secondary"` + RUČNO (jedna primarna radnja po ekranu) |
| podaci | E5 | `api.x.y` → `api.prostor.x.y`; zamene S01 §8.1.4 (`startups.listMembers` → `prostor.projekat.listMembers` …); funkcija koje nema u `convex/prostor` → RUČNO |
| podaci | E6 | Klasa funkcije se čita iz `convex/prostor/<modul>.ts` (`projekat*` = P, `prijavljen*`/`platforma*` = L). P: `useQuery` → `useProjekatQuery`, `useMutation` → `useProjekatMutation`, `useAction` → `useProjekatAction`, `usePaginatedQuery` → `useProjekatPaginatedQuery`, `useQueryTolerant/Result/State` → `useProjekat…`; iz objekta argumenata se briše `startupId`/`workspaceId` (prazan objekat → bez argumenta); uvozi se dodaju. L: ostaje direktno (ključ mora na `DOZVOLJENI_DIREKTNI`). RUČNO: `.withOptimisticUpdate`, `useConvex()`, `useQueries`, P poziv u cilju `ja/`, `danas/`, `inbox/` (D14) |
| listovi | E7 | identifikatori po tabeli iz `prenesi-backend.mjs` (`startupId` → `workspaceId`, `startup` → `workspace` …); literali `"startups"` → `"workspaces"`, `"startupAreas"` → `"areas"` |
| listovi | E8 | tekst za korisnika: „startup“ → „projekat“ u svim padežima (JSX tekst, `title`/`aria-label`/`placeholder`/`alt`/`label`, `toast(…)`, rečenice u vrednostima) |
| listovi | E12 | klase: `text-[0.625rem]`/`[0.6875rem]`/`[10px]`/`[11px]` → `text-meta`, `border-border` → `border-line`, `border-input` → `border-line-control`, `shadow-desk` → `shadow-elev-3`, `bg-secondary` → `bg-surface-raised`, `bg-accent` → `bg-surface-control-hover`, `text-destructive` → `text-danger`, `bg-primary/10` → `bg-radnja-soft`; `data-[state=open|closed|checked|active]:` → Base UI atributi; `font-mono` se briše + RUČNO; RUČNO za `text-primary`, ton startupa, `bg-thread`, pun čip stanja, providnost teksta, `opacity-NN`, sirovu paletu |
| uvozi | E2–E4, E9, E10 | uvozi komponenti po mapi; `@devotion/shared` → `@/lib/prostor`; `sonner` → `@/lib/toast`; primitivi → Enigmini; `@radix-ui/react-context-menu` → `@/components/ui/context-menu`; `TooltipProvider` se briše (Enigmin je u korenu); nekorišćeni uvozi iz `convex/react` se brišu |
| — | E1 | zaglavlje `// Preneto iz Devotion apps/web/<put> (main @ c05c40f), SPAJANJE <korak>.` (posle `"use client"`) |

## RUČNO (izveštaj ga navodi po redu)

Navigacija (`window.history`, `navigateRoute`, `next/link`, `useRouter`, `useSearchParams`), `Intl`/`toLocale*`, uloge (`profile.role`, `createdByProfileId`), Devotion pokret (`DURATION`, `SPRING`, `springTween`, `useEnter`, `usePress`, `useLayerMotion`, `@/lib/motion`), znak `⌘`, `Doc<"startups">`, optimistične izmene, `useConvex()`, `forceMount`, Radix `ContextMenu.*`, hex boje, prop `workspaceId` koji kuke projekta više ne traže, CSS fajlovi (tokeni, ≥ 12 px).

## Posle alata, obavezno

```bash
npm run typecheck
npm run lint
npx vitest run lib/prostor
node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
node .nocni-run/spajanje/regresije.mjs
```

## Isprobano (S08)

- `--pokrivenost`: svih 281 fajl iz `components/` plus `lib/` i `hooks/` ima korak ili je u `NE_PRENOSI` (S08 26, S09 4, S10 38, S11 26, S12 37, S13 11, S14 40, S15 19, S16 15, S17 6, S19 15, S20 17, S21 10, S24 1, ZAMENA 25).
- `--korak S17 --samo components/me/inbox/inbox-skeleton --izlaz tmp`: E1, E10 (uvoz `Skeleton`), 0 RUČNO.
- `--korak S21 --samo components/workspace/trash/trash-model,components/workspace/trash/trash-container --izlaz tmp`: model i test u `lib/prostor/modeli/` sa relativnim uvozima; kontejner je dobio `useProjekatQueryTolerant(api.prostor.trash.counts)`, `useProjekatPaginatedQuery(api.prostor.trash.list, { kind })`, `useProjekatMutation(…)`, `@/lib/toast`, `@/lib/prostor/web/greske`, a `startupId` je postao `workspaceId`; 2 RUČNO (prop `workspaceId` koji kuke više ne traže).
- `--suvo` za S09–S24 prolazi bez greške alata; RUČNO stavki po koraku od 2 (S24) do 142 (S14, mape).
- Ceo korak `--korak S21 --izlaz tmp`: 10 fajlova (Korpa i Podešavanja; `team-tab` i `invites-tab` se preskaču jer su u `NE_PRENOSI`), 29 RUČNO stavki, izlazni kod 0. Ovaj prolaz je otkrio da je fascikla pobeđivala `NE_PRENOSI`; ispravljeno je u `poslovi()`.
