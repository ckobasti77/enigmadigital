# PROJEKTI — napredak

Noćni run PROJEKTI. Plan: `docs/PROJEKTI-PLAN.md`. Pravila: `.nocni-run/projekti/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

## C01 — Bezbednost: zakrpe javnih funkcija i čuvar pristupa   (2026-10-24 23:05)
**Fajlovi:**
- novi: `convex/lib/metaSignedRequest.ts`, `app/api/meta/_lib/prosledi.ts`, `lib/pristup-cuvar.ts`, `scripts/verify-pristup.ts`, `vitest.config.mts`, testovi `lib/pristup-cuvar.test.ts`, `convex/pristup.test.ts`, `convex/threadsBrisanje.test.ts`
- obrisan: `app/api/meta/_lib/verifySignedRequest.ts` (provera potpisa preseljena u Convex)
- izmenjeni: `convex/lib/auth.ts`, `convex/http.ts`, `convex/threadsStore.ts`, `convex/rules.ts`, `convex/rulesStore.ts`, `convex/googleAdsStore.ts`, `convex/metaAdsStore.ts`, `convex/metaAds.ts`, `convex/metaCapi.ts`, `convex/metaCapiStore.ts`, `convex/attribution.ts`, `convex/instagram.ts`, `convex/leadImportStore.ts`, `convex/leadInboundStore.ts`, `convex/leadSuppressionStore.ts`, `convex/ytCaptions.ts`, `convex/ytThumbnails.ts`, `convex/instagramPublishStore.ts`, `convex/threadsPublishStore.ts`, `convex/invitesStore.ts`, `convex/membersStore.ts`, `convex/postsPublic.ts`, `convex/facebook.ts`, `convex/gbp.ts`, `convex/threads.ts`, `convex/youtube.ts` (poslednjih šest samo oznake `// javno:`), `app/api/meta/data-deletion/route.ts`, `app/api/meta/deauthorize/route.ts`, `proxy.ts`, `package.json`, `package-lock.json`, `convex/_generated/api.d.ts` (codegen)

**Šta je urađeno:**
Threads deautorizacija i zahtev za brisanje više nemaju javnu mutaciju: `threadsStore.markExpiredByExternalId` i `triggerDataDeletionByExternalId` su `internalMutation`, a nove Convex HTTP akcije `POST /threads/deauthorize` i `POST /threads/data-deletion` (`convex/http.ts`) proveravaju Meta `signed_request` (HMAC-SHA256, `THREADS_APP_SECRET` iz Convex env-a, čista funkcija u `convex/lib/metaSignedRequest.ts`) i tek onda zovu internu mutaciju; Next rute samo prosleđuju sirovo telo i vraćaju Meta format (`{ url, confirmation_code }` / `{ success }`). `getDeletionStatus` ostaje javan uz `// javno:` i sada čita samo pravi ID iz `purgeRuns`.
Zakrpljeno sve iz tačke 1: `rules.manualEvaluateRules` (samo prijavljen vlasnik, samo pravila svog prostora; ranije je bez `workspaceId` prolazio kroz sva pravila svih prostora, za bilo koga), 7 čitanja u `googleAdsStore` (ranije: prosleđen `workspaceId` = nikakva provera), `seedGoogleAdsData`/`clearGoogleAdsSeeds` interne, `metaAdsStore.getAdById` (bez provere vraćao bilo čiji oglas), `metaCapi.triggerCapiDispatchAction`, `rulesStore.listRules`/`ensureTemplateRules`, `attribution.recordOpenReplyConversion`, `metaCapiStore.getCapiStats`. U `convex/lib/auth.ts` su tri nove provere: `requireMembershipIn(ctx, workspaceId)`, `requireWorkspaceAccess(ctx, workspaceId?)`, `requireActionMembership(ctx, workspaceId?)`.
Tačka 2 — pregledane su SVE javne funkcije u `convex/` (337; pet radnika je čitalo po grupama fajlova, svaki nalaz sam proverio u kodu pre ispravke). Dodatno zakrpljeno:
- `metaAds.getMetaAdsAuth` (koriste je 8 javnih akcija: publike, ToS, pregled oglasa, ciljanje, pikseli, procena isporuke): prosleđen `workspaceId` se uzimao BEZ prijave i dešifrovao tuđi Meta token → sada `requireActionMembership`. `getAdPreviewAction` proverava da je oglas iz tog prostora; `listAdPixelsAction` prima samo nalog oglasa tog prostora.
- `metaAdsStore`: `listAdInsights`, `pinBattle`/`listPinnedBattles`, `getAudienceTos`, `listAudiences` su čitali tuđe redove preko ID-a.
- leadovi: `leadImportStore.createImport` (uvoz u tuđi prostor), `listImportRows` (indeks po odluci vraćao redove tuđeg uvoza), `leadInboundStore.linkInboundToCompany` i `dismissInbound`, `leadSuppressionStore.addSuppression` (poredili su sa prostorom iz argumenta umesto sa pozivaočevim).
- `ytCaptions.uploadCaption`/`updateCaption`, `ytThumbnails.setThumbnail`: `finally` je brisao `storageId` i za neprijavljenog pozivaoca → prijava se proverava pre tog bloka.
- `instagramPublishStore`/`threadsPublishStore`: `createJob` prima samo fajl koji je ovaj projekat prijavio (ili koji već nosi njegov posao); `registerUpload` ne preuzima tuđ račun ni fajl koji već pripada poslu.
- `invitesStore.createInvite` više ne briše korisnika koji ima članstvo u drugom prostoru; `membersStore.removeMember` gasi prijavu tek kad meti ne ostane nijedno članstvo.
- `instagram.getOAuthConfig` traži prijavu. OAuth `completeOAuthFromCallback` (×5, štiti ih jednokratni `state`), registracija (`getInvite`, `pripremiRegistraciju`, `trebaSetup`, `pripremiAdminSetup`) i `postsPublic.*` označeni su `// javno: <razlog>`.
- Pregledano i u redu (prijava + čitanje/upis preko indeksa sa pozivaočevim prostorom ili provera `doc.workspaceId`): analytics, instagramStore/Inbox, igComments/fbComments (+Store), igMentions, facebook/Store, moderationLog, orAutomationsApi, orProfileMenu, orSend, orEngine, openreplyStore, threadsReplies/Automations/Search/Publish/Funnels, ytAutomationsApi, ytUpload, youtubeStore, ytPlaylists, ytVideos, ytMedia, ytComments, ytAuth, leadCrm/Scoring/Filters/Gaps/Detail/Landing/SiteAudits/GapFill/Export, nichesStore, ingestTokensStore, adActions/Store, metaSyncStore, connections, gbp/Store, sync, purge, ga4, napredak, notificationsStore, postsStore, publicRouteLimit, workspaces.
Tačka 3: `rules.ts` nema rezervnu adresu `https://app.enigma-it.com`; bez `NEXT_PUBLIC_APP_URL`/`APP_URL` mejl ide bez dugmeta i linka, a log to kaže.
Tačka 5: čuvar `npm run verify:pristup` (`scripts/verify-pristup.ts` + čista logika u `lib/pristup-cuvar.ts`, TypeScript AST, ne regex). Nad repoom: 337 javnih, 325 sa proverom, 12 označenih `// javno:`, 0 bez provere.

**ODLUKE:**
- Tajna za Meta potpis je samo `THREADS_APP_SECRET` (kao stara Next provera), bez pada na `META_APP_SECRET`. Bez tajne svaki zahtev dobija 401.
- Convex putanje su `/threads/deauthorize` i `/threads/data-deletion` (pored postojećeg `/threads/webhook`). Convex vraća samo `confirmation_code`; `url` stranice statusa dodaje Next ruta jer zna domen aplikacije (osnova adrese ostala ista: `NEXT_PUBLIC_APP_URL` → origin zahteva → `digital.enigmait.rs`; domeni po projektu su C12).
- Next ruta čita `NEXT_PUBLIC_CONVEX_SITE_URL`, a ako ga nema, izvodi `.convex.site` iz `CONVEX_URL`/`NEXT_PUBLIC_CONVEX_URL` (isti obrazac kao `lib/ig-media.ts`), da nepostavljen env ne ugasi brisanje.
- `proxy.ts`: `/api/meta/data-deletion` i `/api/meta/deauthorize` izuzeti iz auth preusmerenja (u oba matcher-a). Meta zove bez sesije, pa ih je proxy dosad slao na `/login` — ti pozivi u produkciji verovatno nikad nisu stigli do rute. Bezbednost je sada potpis u Convex-u. Putanje OAuth povratka nisu dirane.
- Obrisan `app/api/meta/_lib/verifySignedRequest.ts`: posle selidbe je mrtav kod i druga kopija provere potpisa koja bi se razišla sa prvom.
- `manualEvaluateRules`: „vlasnik" = uloga `owner` u tom prostoru (`client_viewer` dobija `forbidden`). `workspaceId` ostaje opcion (front šalje `{}`); tuđe pravilo preko `ruleId` se tiho ne procenjuje (rezultat 0), bez greške. Interni `getEvaluationContext` sada traži da `ruleId` pripada prosleđenom prostoru.
- `seedGoogleAdsData`/`clearGoogleAdsSeeds`: interne, a `workspaceId` je postao obavezan (interna funkcija nema prijavu na koju bi pala). UI ni skripte ih ne zovu — sa fronta ništa nije uklonjeno.
- Opcioni `workspaceId` argumenti ostali su opcioni (bez njega: pozivaočev prostor, kao do sada); obaveznim ih čini prelazak na omotače (P2, C03+). Nove provere upoređuju sa SVIM članstvima pozivaoca (`requireMembershipIn`), ne sa prvim; indeks `by_user_workspace` pre C03 ne postoji, pa se čita `by_user` (`take(100)`).
- `getAdById` za nepostojeći oglas traži prijavu pa vraća `null` (neprijavljenom ne otkriva postoji li oglas).
- Redosled `NEXT_PUBLIC_APP_URL` pa `APP_URL` ostao je isti.
- Čuvar (blaža verzija) prihvata `requireMembership`, `requireOwner`, `requireMembershipIn`, `requireWorkspaceAccess`, `requireActionMembership`, `getAuthUserId`, `getUserIdentity`, `resolveUserWorkspace` — direktno, kroz pomoćnu funkciju (isti fajl ili uvezena) ili jednim skokom preko `api.x.y`/`internal.x.y` do Convex funkcije čije telo SAMO proverava; lanci zakazivanja se ne prate. Oznaka mora biti u liniji TAČNO iznad `export const`. Broji `query`/`mutation`/`action` iz `_generated/server` (i preimenovane uvoze); izvozi `convexAuth` iz `auth.ts` (signIn/signOut/store) nisu `query(...)` i ne broje se — to je biblioteka.
- `npm install` (npm 10.9.8) puca na poznatoj grešci arborista („Cannot read properties of null (reading 'edgesOut')"); paketi su instalirani sa `npx npm@11 install -D …`. Lockfile je zato malo preuređen (hoisting `accepts`, `postcss`…); `esbuild`, `next build` i `convex codegen` rade.
- Fajlovi za objavu: `createJob` traži račun o uploadu ovog projekta (oba composera ga uvek pišu odmah posle slanja); fajl koji već nosi posao ovog projekta je dozvoljen, da bi dupli klik i dalje dobio postojeću poruku „Ista objava je već poslata…".
- `createInvite`: korisnik sa članstvom u DRUGOM prostoru dobija istu `conflict` poruku kao aktivan član (ne briše se). Ostalo (uklonjen član / zaglavljena registracija u ovom prostoru) radi isto; za Jovana se ništa ne menja.
- NISU zakrpljeni (nisu curenje danas ili traže novu tabelu, a nove tabele su u C01 zabranjene) — ostaje kasnijim koracima:
  - `_storage` ID-jevi bez evidencije vlasnika: `postsStore.updateDraft` (`coverStorageId`, `ogImageStorageId`) i `ytCaptions`/`ytThumbnails` (prijavljen član koji zna tuđ ID fajla i dalje može da ga pročita ili obriše). Treba tabela računa o uploadu po projektu (C02/C03). Rizik je nizak: ID fajla je nepogodiv.
  - `notificationsStore.nadjiStanje` traži red po `(userId, kljuc)` bez prostora — korisniku u dva projekta odlaganje u jednom prepisuje drugo (nije curenje; C06).
  - `webhookHealth.status` svakom članu pokazuje stanje webhook potpisa cele platforme (nije podatak projekta; C07 → `platformaQuery`).
  - Mnoge funkcije porede `args.workspaceId` sa PRVIM članstvom (`requireMembership`): bezbedno, ali odbiće drugi projekat — prelazak na omotače (C03–C07).
  - `auth.ts` (`afterUserCreatedOrUpdated`, `isEmailAllowed`) uvek koristi prostor `enigma-it` (C13, pozivnice po projektu). Poruka `createInvite` i dalje otkriva da adresa ima nalog (samo vlasniku prostora).

**Novi paketi:** `vitest@4.1.12` — MIT; `convex-test@0.0.65` — Apache-2.0; `@edge-runtime/vm@5.0.0` — MIT (sva tri dev, plan P7)

**Testovi:**
- `lib/pristup-cuvar.test.ts` (node, 9): čuvar pada na funkciji bez provere, prolazi sa `// javno: <razlog>`, pada na `// javno:` bez razloga i na oznaci koja nije tačno iznad, ne prihvata ime provere u komentaru/stringu, prihvata pomoćnu funkciju (lokalnu i uvezenu) i jedan skok do interne funkcije sa proverom (ali ne lanac zakazivanja), ignoriše interne, hvata preimenovan uvoz `query`.
- `convex/pristup.test.ts` (edge-runtime + convex-test, 10): neprijavljen poziv svih funkcija iz tačke 1 (+ `getOAuthConfig`) pada sa `unauthorized` i ništa ne upisuje; YouTube titl/sličica ne brišu fajl bez prijave; član A dobija `forbidden` nad B za pravila (lista, šabloni, ručno pokretanje), 7 Google čitanja, `getAdById`, CAPI statistiku i okidač, atribuciju, uvoz leadova i listu zabrane; tuđi `ruleId`, uvidi tuđeg oglasa i redovi tuđeg uvoza vraćaju prazno; `client_viewer` ne pokreće pravila; sopstveni prostor radi kao ranije; tuđ račun uploada (IG i Threads) se ne preuzima; Threads brisanje/deautorizacija i Google seed su interne, `getDeletionStatus` javna.
- `convex/threadsBrisanje.test.ts` (edge-runtime, 7): čista provera potpisa (ispravan, pogrešna tajna, izmenjen sadržaj, drugi algoritam, loš format; izvlačenje iz form/JSON/multipart tela); HTTP akcije: bez potpisa i sa lažnim potpisom → 401 i veza netaknuta, ispravan → brisanje pokrenuto i `confirmation_code` = ID iz `purgeRuns`, bez tajne u env-u → 401, deautorizacija samo sa ispravnim potpisom.

**Rezultat provere:** codegen ✓, typecheck ✓, lint ✓ (0 grešaka, samo stara upozorenja), `npx vitest run` ✓ (26/26), `verify-pristup` ✓ (0 bez provere), `regresije.mjs` ✓ (14/14), `verify:ig-publish` ✓, `npm run build` ✓.

**Za Jovana ujutru:**
- Posle deploya: u Meta App Dashboard (Threads) „Data Deletion Request" i „Deauthorize" i dalje idu na `https://digital.enigmait.rs/api/meta/data-deletion` i `/api/meta/deauthorize` — pošalji test zahtev; brisanje mora vratiti `{ url, confirmation_code }`. Proveri da su u Vercel-u postavljeni `NEXT_PUBLIC_CONVEX_SITE_URL` (ili bar `CONVEX_URL`), a u Convex env-u `THREADS_APP_SECRET`.
- Convex env: `APP_URL` ili `NEXT_PUBLIC_APP_URL` (npr. `https://digital.enigmait.rs`) — bez njega mejl pravila stiže bez linka (Convex log to kaže).
- Ručno: Pravila → „Pokreni proveru" (radi samo vlasniku); objava na Instagram i Threads sa slikom; YouTube titl i sličica; pozivnica novog člana — sve mora raditi kao pre.

## C02 - Arhitektura projekata (plan)   (2026-10-24 23:52)
**Plan korak.** Plan je upisan u `docs/projekti/planovi/C02.md`. Kod nije menjan.

## C03 — Temelj: šema, omotači, API projekata, testovi   (2026-10-25 00:20)
**Fajlovi:**
- novi: `convex/lib/projekat.ts` (omotači), `convex/lib/uloge.ts`, `convex/lib/projekatPolja.ts`, `convex/lib/projekatSlug.ts`, `convex/projekti.ts`, `lib/rutiranje.ts`, `components/app/projekat-provider.tsx`, `components/app/projekat-link.tsx`, `components/app/projekat-hooks.tipovi.ts` (test tipova), `app/dev-ux/fixtures-projekti.ts`, testovi `convex/projekat.test.ts`, `convex/projekti.test.ts`, `lib/rutiranje.test.ts`, pomoćni fajlovi koji se ne deployuju `convex/projekatTest.pomoc.ts` i `convex/projekatProba.pomoc.ts`
- izmenjeni: `convex/schema.ts`, `convex/lib/purgeMap.ts`, `convex/lib/auth.ts`, `convex/membersStore.ts`, `convex/instagramStore.ts`, `convex/facebook.ts`, `convex/gbp.ts`, `convex/instagram.ts`, `convex/threads.ts`, `convex/threadsSearch.ts`, `convex/youtube.ts` (samo tip uloge), `lib/pristup-cuvar.ts`, `lib/pristup-cuvar.test.ts`, `scripts/verify-pristup.ts`, `app/(app)/layout.tsx`, `app/dev-ux/[[...slug]]/page.tsx`, `app/dev-ux/fixtures.ts`, `app/dev-ux/fixtures-util.ts`, `components/app/settings/members-panel.tsx`, `components/app/workspace-provider.tsx`, `package.json`, `package-lock.json`, `convex/_generated/api.d.ts` (codegen)

**Šta je urađeno:**
- **Šema** (plan C02 §1):
  - `workspaces` dobija opciona polja `vrsta`, `brend`, `sajtovi`, `podesavanja`, `moduli`, `mozak`, `arhiviran`, `redosled`, `createdBy`;
  - `members.role` dobija `urednik`, a `members` indeks `by_user_workspace`;
  - nove tabele `projekatDomeni` (`by_host`, `by_workspace`) i `projekatTajne` (`by_workspace_kljuc`);
  - `oauthStates.povratak`.

  Obe nove tabele su u `EXTRA_TABLE_OWNERSHIP` sa razlogom. Provera pokrivenosti brisanja prolazi (142 tabele).
- **Omotači** u `convex/lib/projekat.ts` (convex-helpers `customQuery/Mutation/Action`):
  - `projekatQuery`/`projekatMutation`/`projekatAction` dodaju obavezan `workspaceId`, proveravaju članstvo u tačno tom projektu i minimalnu ulogu (opcija `uloga`; upit podrazumeva `client_viewer`, mutacija i akcija `urednik`), daju `ctx.projekat` i prosleđuju proveren `workspaceId` u `args`;
  - akcija proverava članstvo kroz interni `projekti.clanstvoZaAkciju`;
  - uz to: `prijavljenQuery/Mutation`, `platformaQuery/Mutation` (P3), `requireProjekat`, `jeVlasnikPlatforme` i srpske poruke grešaka.
- **API** `convex/projekti.ts`:
  - `mojiProjekti`;
  - `mojProjekat({ slug })`: tuđ i nepostojeći slug daju isto, `null`; dupli slug iz istorije bira red u kome je pozivalac član;
  - `ja`;
  - `razresiDomen({ host })`: jedina nova javna funkcija bez prijave, sa `// javno:`;
  - `kreirajProjekat`: vlasnik platforme, pravila P8, kreator postaje `owner`;
  - `azurirajProjekat`: owner; vrstu menja samo vlasnik platforme.
- **Front:**
  - `ProjekatProvider` je u `app/(app)/layout.tsx`. Do C08 privremeni izvor je `mojiProjekti[0]` (isti red kao `requireMembership().first()`); upiti čekaju sesiju.
  - Hookovi `useProjekat` i `useProjekatQuery/Mutation/Action` sami ubacuju `workspaceId`; tipovi ga ne dozvoljavaju u argumentima.
  - `useEkranPutanja`, `useProjekatHref` i `<ProjekatLink>` do C08 nemaju efekta (prefiks je prazan).
  - Čiste funkcije putanja su u `lib/rutiranje.ts`. `WorkspaceProvider` ostaje.
  - Razvojni prikaz zna nove upite (projekti Enigma IT i ScanMe).
- **Čuvar:** funkcija napravljena omotačem iz `lib/projekat.ts` broji se kao javna i proverena („omotačem“). Fajlovi sa više tačaka u imenu se preskaču, kao kod Convex-a. Nad repoom: 343 javne (omotačem 5, sa proverom 325, javno 13, bez provere 0).

**ODLUKE:**
- **Odluke iz plana C02** (C02 nije menjao fajlove, pa ih ovde upisuje C03):
  - D1: `platformaQuery` dodat (za `webhookHealth`).
  - D2: `rezim` ne vraća `mojProjekat`; daje ga server layout iz `x-panel-rezim` (C08).
  - D3: omotač prosleđuje proveren `workspaceId` i u `args`.
  - D4: podrazumevane uloge su `client_viewer` za upit i `urednik` za mutaciju i akciju; `uloga: "client_viewer"` na mutaciji samo za lične redove.
  - D5: pravila sluga su u `convex/lib/projekatSlug.ts`, a `lib/rutiranje.ts` ih izvozi.
  - D6: interne funkcije koje zove akcija ne proveravaju članstvo ponovo.
  - D7: vrstu projekta menja samo vlasnik platforme.
  - D8: članstvo u `[projekat]` proverava klijentski provider; server proverava samo oblik sluga.
  - D9: kolačić `ep_projekat` postavlja klijent posle potvrde članstva.
  - D10: razvojni prikaz bez prefiksa = panel Enigma IT.
  - D11: `owner` traže pisanje nad oglasima, pravila oglasa, publike, CAPI okidač i brisanje YouTube videa i Threads objave.
  - D12: rupa sa `_storage` ID-jevima ostaje za C19 (specifikacija u planu §10.3).
  - D13: indeksi se imenuju po konvenciji repoa.
  - D14: članstvo se čita sa `.first()`.
  - D15: probne funkcije su u `*.pomoc.ts`.
  - D16: `ProjekatLink` zamenjuje `next/link` (C08).
  - D17: napredak je po projektu do C16.
  - D18: dodat `projekti.ja`.
  - D19: „Novi projekat“ u biraču je iza zastavice dok C11 ne napravi `/novi`.
- `convex-helpers@0.1.129` ima licencu **Apache-2.0** (P7 je pretpostavio MIT); pravila runa dozvoljavaju Apache. Instalirano sa `npx npm@11 install`, jer npm 10 ima poznatu grešku (kao u C01).
- Opcija `uloga` radi kroz „dodatne argumente“ convex-helpers-a (treći parametar `input`). Rezervni plan sa posebnim graditeljima nije bio potreban.
- Omotač ne blokira arhiviran projekat; to odlučuje C11. `razresiDomen` za arhiviran projekat vraća `null` (hub).
- Tipovi hookova koriste `Record<string, never> extends …` umesto `{} extends …` (lint pravilo za prazan objekat). Ponašanje je isto: argumenti se smeju izostaviti samo kad su svi opcioni.
- Razvojni prikaz: u praznom nalogu (`?prazno=1`) spisak projekata ostaje pun, jer je prazno stanje kanala, a ne nalog bez projekta. ScanMe u fiksturi ima boju `#22c55e` kao podatak, ne kao CSS.
- Test `lib/rutiranje.test.ts` proverava da je svaki direktorijum u `app/(app)/` ime iz `EKRANI`. **C08 menja putanju na `app/(app)/[projekat]/`** (dozvoljeno, jer se menja samo putanja).
- Slug „r“ je rezervisan, ali pada već na proveri dužine (minimum 2). Ishod je isti, poruka je druga.
- Indeks `by_user` na `members` ostaje (registracija, P3, „preostala članstva“).

**Novi paketi:** `convex-helpers@0.1.129` — Apache-2.0 (runtime, P7)

**Testovi:**
- `convex/projekat.test.ts` (10):
  - neprijavljen poziv pada na svakom omotaču; `workspaceId` je obavezan; nečlan dobija `forbidden`;
  - član A ne čita, ne menja i ne pokreće u B, a u A vidi samo podatke A; korisnik sa dva članstva radi u oba;
  - `client_viewer` čita, ali ne menja i ne pokreće (osim eksplicitne lične mutacije); urednik ne prolazi `owner`; vlasnik prolazi sve;
  - `prijavljen*` radi bez projekta; `platforma*` samo za `owner` internog projekta (ne za vlasnika samo klijentskog).
- `convex/projekti.test.ts` (12):
  - `mojiProjekti`: samo moji, redom članstva, sa vrstom;
  - `mojProjekat`: tuđ i nepostojeći slug → `null`, uloga, vlasnik platforme, dupli slug;
  - `ja`;
  - `razresiDomen`: bez prijave, velika slova, port, završna tačka, nepoznat host, loš host, arhiviran projekat;
  - `kreirajProjekat`: kreator postaje owner; odbija rezervisan, neispravan i zauzet slug i prekratko ime; samo vlasnik platforme;
  - `azurirajProjekat`: ime, kratko ime i boja; brisanje sa `null`; loša boja; samo owner; vrstu menja samo vlasnik platforme.
- `lib/rutiranje.test.ts`: `putanjaEkrana`, `ekranIzPutanje` (i povratni put), globalne putanje, pravila sluga, da su svaki ekran i svaka ruta u `app/` rezervisani, `normalizujHost`, lokalni hostovi.
- `lib/pristup-cuvar.test.ts` (+3): omotač je javna i proverena funkcija (i kad je preimenovan); isto ime iz drugog fajla nije omotač; fajlovi sa više tačaka se preskaču. Postojeći test je proširen poljem `omotacem`.
- `components/app/projekat-hooks.tipovi.ts`: `@ts-expect-error` kad se `workspaceId` pošalje ručno, kad funkcija nema projekat i kad obavezan argument fali. Provereno je da tsc pada kad očekivana greška izostane.

**Rezultat provere:**
- codegen ✓, typecheck ✓, lint ✓ (0 grešaka; novi fajlovi bez upozorenja);
- `npx vitest run` ✓ (91/91);
- `verify-pristup` ✓ (0 bez provere), `verify-purge-coverage` ✓, `regresije.mjs` ✓ (14/14), `npm run build` ✓;
- razvojni prikaz: `/`, `/leadovi`, `/settings`, `/napredak?prazno=1` i `/analytics` sa `?ux=1` vraćaju 200, konzola pregledača je bez grešaka, dev server je ugašen.

**Za Jovana ujutru:**
- Ništa vidljivo se nije promenilo. Posle deploya (zajedno sa ostatkom runa) prijava i svi ekrani treba da rade kao pre; provider bira tvoj jedini projekat.
- Convex deploy dodaje indeks `members.by_user_workspace` (mala tabela, bez čekanja).

## C04 — Prelazak 1: analitika, atribucija, Instagram, Facebook   (2026-10-25 00:51)
**Fajlovi:**
- backend: 19 fajlova grupe i jedan red u `convex/orSend.ts`:
  - `convex/analytics.ts`, `ga4.ts`, `attribution.ts`;
  - `instagram.ts`, `instagramStore.ts`, `instagramInbox.ts`, `instagramInboxStore.ts`, `instagramPublish.ts`, `instagramPublishStore.ts`;
  - `igComments.ts`, `igCommentsStore.ts`, `igMentions.ts`, `igMentionsStore.ts`;
  - `facebook.ts`, `facebookStore.ts`, `fbComments.ts`, `fbCommentsStore.ts`;
  - `moderationLog.ts`, `metaSyncStore.ts`;
  - `convex/orSend.ts`: samo poziv `markSeen` (plan C02 §4.1, pravilo 11).
- front (32 fajla u `components/app/`):
  - `analytics/`: `acquisition-dashboard`, `ads-performance-dashboard`, `analytics-dashboard`, `audience-dashboard`, `content-dashboard`, `realtime-dashboard`, `retention-dashboard`;
  - `attribution/attribution-dashboard`;
  - `facebook/`: `facebook-dashboard`, `fb-comment-thread`, `fb-comments-moderation`, `fb-post-comments-panel`;
  - `instagram/`: `comment-thread`, `comments-moderation`, `instagram-dashboard`, `instagram-demographics`, `instagram-stories`, `mention-card`, `metric-explorer`, `post-comments-panel`, `publish-composer`, `publish-jobs-panel`;
  - `instagram/inbox/`: `chat-view`, `conversation-list`, `inbox-view`;
  - `instagram/post-detail/post-detail-container`;
  - `overview/overview-dashboard`, `rate-limit-banner`;
  - `settings/`: `connections-settings`, `ga4-configuration`, `moderation-audit-log`, `sync-schedule`.
- testovi: nov `convex/izolacija-c04.test.ts`; u `convex/pristup.test.ts` samo potpisi poziva.
- razvojni prikaz: `app/dev-ux/[[...slug]]/page.tsx` (tri podekrana Instagrama).
- snimci: `docs/projekti/snimci/C04-analytics-1440.png`, `C04-instagram-390.png`.

**Šta je urađeno:**
Obrađene su sve 74 javne funkcije grupe iz mape C02 §5.1. Njih 72 sada ide kroz omotače iz `convex/lib/projekat.ts`. Ostale 2 (`instagram.completeOAuthFromCallback` i `facebook.completeOAuthFromCallback`) ostaju sirove, uz postojeću oznaku `// javno:`. Uloge su tačno po mapi:
- **`projekatQuery` (client_viewer), 38 funkcija:**
  - `analytics.*` (15), `attribution.report`, `instagramStore.*` (6);
  - `instagramInboxStore.listConversations/getConversation/listMessages`, `instagramPublishStore.listJobs`;
  - `igCommentsStore.listThreads/filterCounts`, `igMentionsStore.listMentions`;
  - `facebookStore.*` (4), `fbCommentsStore.listThreads/filterCounts`;
  - `moderationLog.listModerationLogs`, `metaSyncStore.rateLimit/jobStatus`.
- **urednik (podrazumevano), 26 funkcija:**
  - `ga4.refreshRealtime/refreshGa4Config`, `attribution.recordOpenReplyConversion`, `instagram.pollStoriesManual`;
  - `instagramInbox.syncConversations`, `instagramInboxStore.markSeen`;
  - `instagramPublish.publishingLimit`, `instagramPublishStore.generateUploadUrl/registerUpload/createJob/cancelJob/retryJob`;
  - `igComments.*` (6), `igMentions.replyToMention`, `fbComments.*` (7).
- **`uloga: "owner"`, 8 funkcija:** `instagram.getOAuthConfig/getOAuthUrl/completeOAuth` i `facebook.getOAuthUrl/listPages/selectPage/connectWithSystemUserToken/refreshTokenNow`.

**Interne funkcije i pomoćni kod.** Interne funkcije koje su akcije zvale preko prenetog identiteta sada dobijaju prostor eksplicitno i više ne proveravaju članstvo (D6):
- `igCommentsStore.loadModerationContext` i `fbCommentsStore.loadModerationContext` primaju `workspaceId` i `userId`;
- `instagramInbox.loadSyncContext` prima `workspaceId`;
- `igMentionsStore.getMentionForReply` je već primao `workspaceId` i proveravao vlasništvo, pa nije menjan.

Obrisani su `instagramPublishStore.membershipForAction` i pomoćne `requireWorkspace`/`requireOwnerWorkspace` u `facebook.ts`, jer im nije ostao nijedan pozivalac. `ga4.ts`, `facebook.ts` i `instagram.ts` više ne zovu `workspaces.getWorkspaceForUser` ni `instagramStore.getMembership`. `orSend.sendSenderAction` sada u `markSeen` šalje `workspaceId: context.workspaceId`. Provere dokumenta iz argumenta (posao objave, komentar, spominjanje, medij) ostale su iste.

**Front.** Svaki poziv ovih funkcija ide kroz `useProjekatQuery/Mutation/Action`. Pozivi drugih grupa u istim fajlovima ostali su na `useQuery`/`useAction`: `connections.list`, `sync.health` i `publicRouteLimit.*` (C07), `openreplyStore.*` i `orSend.*` (C05).

**Provera grep-om.** U 19 fajlova grupe nema nijednog od ovih imena: `requireMembership`, `requireOwner`, `requireWorkspaceAccess`, `requireMembershipIn`, `requireActionMembership`, `getMembership`, `getWorkspaceForUser`, `membershipForAction`, `getAuthUserId`. Nijedan poziv grupe na frontu ne ide kroz sirov hook. Čuvar broji 343 javne funkcije: omotačem 77, sa proverom 253, javno 13, bez provere 0.

**Podela posla.** Pet radnika je radilo po jedan modul, svaki na svojim fajlovima: analitika; Instagram nalog i sadržaj; inbox i objava; komentari i spominjanja; Facebook. Atribuciju, dnevnik moderacije, metaSync, zajedničke ekrane (`instagram-dashboard`, `overview-dashboard`, `connections-settings`) i testove radio sam ja. Svaki diff sam pročitao.

**Šta je iz grupe ostalo (svesno):**
- `workspaces.getWorkspaceForUser` više nema pozivaoca. Po planu (§5.2) ga briše C07, zajedno sa `currentContext`.
- `instagramStore.getMembership` ostaje, jer ga zovu `threads.ts`, `threadsSearch.ts`, `youtube.ts` (C05) i `gbp.ts` (C07).
- Fajlovi `chat-view`, `publish-composer`, `comments-moderation`, `instagram-dashboard`, `overview-dashboard`, `connections-settings` i analitički ekrani i dalje imaju pozive drugih grupa:
  - `orSend.*` i `openreplyStore.daily` prelaze u C05;
  - `connections.*`, `sync.*` i `publicRouteLimit.*` prelaze u C07.

**ODLUKE:**
- **`connections-settings.tsx` čeka projekat pre poziva pri učitavanju.** `useProjekatAction` odbija poziv dok `workspaceId` nije stigao. Tri efekta zovu akciju čim se kartica montira:
  - provera Meta podešavanja (Instagram);
  - rezervni put OAuth koda (Instagram, `ig_code` u adresi ili u `localStorage`);
  - automatsko otvaranje birača Facebook stranice.

  Rezervni put bi pročitao i obrisao kod pre nego što je projekat poznat, pa bi se kod izgubio. Zato sva tri efekta počinju sa `if (!spreman) return;` (iz `useProjekat()`) i imaju `spreman` u zavisnostima. Ništa drugo u fajlu nije menjano.
- **Uloge po mapi menjaju ponašanje za ne-vlasnike.** Za Jovana kao vlasnika ništa se ne menja.
  - Facebook `listPages`, `selectPage`, `refreshTokenNow` i Instagram `getOAuthUrl`, `completeOAuth` ranije je mogao da pozove svaki član. Sada traže `owner` (mapa: O). Urednik koji klikne „Osveži token“ dobija poruku omotača.
  - `getOAuthConfig` (owner) ne-vlasniku tiho vraća „nije podešeno“, jer kartica hvata grešku.
  - `refreshRealtime`, `refreshGa4Config`, `publishingLimit`, `markSeen` i `syncConversations` traže urednika, pa ih `client_viewer` ne pokreće.
  - Na ekranu „Uživo“ automatsko osvežavanje hvata grešku tiho. Ručno „Osveži“ nema `catch` (od ranije), pa bi kod posmatrača ostavilo neuhvaćenu grešku u konzoli. UI logiku nisam menjao: to je van recepta, a danas posmatrača nema.
- **Redosled provera:** `instagram.getOAuthUrl` i `facebook.getOAuthUrl` su ranije prvo proveravali env aplikacije, pa tek onda prijavu. Sada omotač prvo proverava prijavu i članstvo. Neprijavljen pozivalac zato dobija „Niste prijavljeni.“ umesto poruke o nepodešenoj Meta aplikaciji.
- **`attribution.recordOpenReplyConversion`:** opcioni `workspaceId` je uklonjen iz sopstvenih argumenata (recept §4.1, tačka 2), a omotač ga traži kao obavezan. Test iz C01 ga je već slao, pa njegov poziv nije menjan.
- **Razvojni prikaz:**
  - `/instagram/inbox`, `/instagram/publika` i `/instagram/stories` nisu bili registrovani u `app/dev-ux/[[...slug]]/page.tsx` (sa `?ux=1` su davali 404 i pre C04). Dodao sam ih da bi ekrani grupe mogli da se otvore. Bez sintetičkih podataka crtaju učitavanje i prazna stanja; fiksture nisu menjane.
  - `/instagram/objavi` sam i dalje ostavio van, iz razloga koji je zapisao B8: akcija kvote ne radi nad lažnim Convex-om.
  - `/instagram/objave/[mediaId]` je dinamička ruta, a harness je ne podržava.
- **Testovi izolacije** su u jednom fajlu, `convex/izolacija-c04.test.ts` (plan C02 §9), sa po jednim `describe` za svaki modul. Za funkcije koje zovu Metu ili Google proverava se samo odbijanje u omotaču, jer ono dolazi pre bilo kakvog mrežnog poziva. Pozitivan put sa pravom vezom ne može da se testira bez mreže.

**Novi paketi:** nema

**Testovi:**
- `convex/izolacija-c04.test.ts`, 11 testova. „Odbijeno“ ovde znači da član samo projekta A dobija `forbidden` nad B. Po modulu:
  - **Analitika:**
    - svih 15 upita i 2 akcije nad B su odbijeni;
    - u A se vide samo redovi A, a Jovan (član oba) u B vidi B;
    - `client_viewer` čita, ali ne pokreće osvežavanje.
  - **Atribucija:**
    - odbijeni su izveštaj B i upis konverzije u B;
    - posmatrač ne može da upiše konverziju, i ništa se ne upisuje;
    - urednik upisuje u A.
  - **Instagram nalog:**
    - 6 upita i 4 akcije nad B su odbijeni, i ne nastaje OAuth stanje;
    - povezivanje (3 akcije) odbija urednika, a osvežavanje priča odbija posmatrača;
    - urednik prolazi omotač i dobija poruku „nije povezan“.
  - **Inbox:**
    - 3 upita, `markSeen` i sinhronizacija nad B su odbijeni;
    - posmatrač ništa ne menja;
    - `markSeen` u A ne dira isti razgovor u B.
  - **Objava:**
    - spisak, 5 mutacija i kvota nad B su odbijeni;
    - posmatrač ništa ne menja;
    - tuđ posao preko sopstvenog projekta daje „nije pronađena“ i ostaje netaknut;
    - spisak u A ne sadrži posao B.
  - **Komentari i spominjanja:**
    - 3 upita i 7 akcija nad B su odbijeni;
    - posmatrač ne moderira;
    - u A se ne vide komentari B;
    - bez veze moderacija ne stiže do Mete i ništa se ne menja.
  - **Facebook:**
    - nad B je odbijeno 6 upita, 5 akcija vlasnika i 7 akcija moderacije;
    - posmatrač ne moderira, a u A se ne vide komentari B;
    - urednik ne može da menja vezu stranice.
  - **Dnevnik moderacije i metaSync:**
    - nad B su odbijeni;
    - posmatrač u A vidi samo zapise i poslove A.
- `convex/pristup.test.ts`: menjani su samo potpisi poziva (`getOAuthConfig` i `registerUpload` dobijaju `workspaceId`). Tvrdnje su iste.

**Rezultat provere:**
- Automatske provere su prošle:
  - codegen ✓, typecheck ✓;
  - lint ✓ (0 grešaka; izmenjeni fajlovi bez upozorenja);
  - `npx vitest run` ✓ (102/102);
  - `verify-pristup` ✓ (0 bez provere), `regresije.mjs` ✓ (14/14), `npm run build` ✓.
- Razvojni prikaz (Playwright, 1440×900):
  - 17 ekrana grupe vraća 200, sa ispravnim naslovom i bez grešaka u konzoli: `/`, `/analytics` i 7 podekrana, `/atribucija`, `/instagram`, `/instagram/{komentari,inbox,publika,stories}`, `/facebook`, `/facebook/komentari`, `/settings`;
  - jedino upozorenje je Recharts „width(-1)“ na `/analytics/posetioci`, od ranije (prvi prikaz grafikona);
  - snimci `/analytics` (1440) i `/instagram` (390) pokazuju da podaci stižu kroz nove hookove;
  - dev server je ugašen.

**Za Jovana ujutru:**
- Posle deploya (zajedno sa ostatkom runa) proveri da sve radi kao pre:
  - Analitika, i na „Uživo“ dugme „Osveži“;
  - Atribucija;
  - Instagram: u komentarima sakrij i odgovori, u inboxu otvori razgovor, objavi sliku, osveži priče;
  - Facebook: komentari i „Osveži token“.
- Podešavanja → Instagram/Facebook „Poveži“ i birač stranice. Kartica sada čeka da se projekat učita pre provere podešavanja. Ako dugme na trenutak kasni, to je očekivano.
- Ako budeš imao urednika ili klijenta-posmatrača: povezivanje naloga, osvežavanje tokena i izbor Facebook stranice sada može samo vlasnik projekta.
