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
