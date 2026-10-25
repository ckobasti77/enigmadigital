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

## C05 — Prelazak 2: Threads, YouTube, OpenReply   (2026-10-25 01:32)
**Fajlovi:**
- backend (24 fajla grupe):
  - Threads: `convex/threads.ts`, `threadsStore.ts`, `threadsAutomations.ts`, `threadsFunnels.ts`, `threadsPublish.ts`, `threadsPublishStore.ts`, `threadsReplies.ts`, `threadsSearch.ts`;
  - YouTube: `convex/youtube.ts`, `youtubeStore.ts`, `ytAuth.ts`, `ytAutomationsApi.ts`, `ytCaptions.ts`, `ytComments.ts`, `ytMedia.ts`, `ytPlaylists.ts`, `ytThumbnails.ts`, `ytUpload.ts`, `ytVideos.ts`;
  - OpenReply: `convex/openreplyStore.ts`, `orAutomationsApi.ts`, `orEngine.ts`, `orProfileMenu.ts`, `orSend.ts`;
  - `convex/threadsUploadAccess.ts` nema javnih funkcija i nije menjan.
- front (28 fajlova u `components/app/`):
  - `threads/`: `threads-automations`, `threads-composer`, `threads-dashboard`, `threads-jobs-panel`, `threads-replies-moderation`, `threads-search`;
  - `youtube/`: `quota-widget`, `youtube-dashboard`, `yt-automation-editor-dialog`, `yt-automations-dashboard`, `yt-automations-list`, `yt-captions-panel`, `yt-comment-log-table`, `yt-media-jobs-panel`, `yt-thumbnail-dialog`, `yt-upload-dialog`, `yt-video-edit-dialog`;
  - `openreply/`: `automation-editor-dialog`, `automations-dashboard`, `automations-list`, `dm-log-table`, `openreply-dashboard`, `profile-menu-panel`;
  - zajedničke komponente, samo pozivi grupe C05: `instagram/inbox/chat-view` (3 × `orSend`), `instagram/inbox/inbox-settings-drawer` (4), `overview/overview-dashboard` (2 × `openreplyStore.daily`), `settings/connections-settings` (`orEngine` ×3, `youtubeStore.setupInfo`, `youtube.youtubeAuthorizeUrl`, `threadsStore.setupInfo`, `threads.threadsAuthorizeUrl`), `novosti/novosti-editor` (samo `threadsPublishStore.generateUploadUrl`).
- testovi: nov `convex/izolacija-c05.test.ts`; u `convex/pristup.test.ts` samo potpisi poziva.
- snimci: `docs/projekti/snimci/C05-threads-1440.png`, `C05-youtube-390.png`.

**Šta je urađeno:**
Obrađeno je svih 88 javnih funkcija grupe iz mape C02 §5.1. Njih 85 sada ide kroz omotače iz `convex/lib/projekat.ts`, a 3 ostaju sirove uz postojeću oznaku `// javno:` (`threads.completeOAuthFromCallback`, `youtube.completeOAuthFromCallback`, `threadsStore.getDeletionStatus`). Uloge su tačno po mapi:
- **`projekatQuery` (client_viewer), 30 funkcija:**
  - `threadsStore.setupInfo/accountOverview/followerHistory/mediaList/demographicsSummary`, `threadsAutomations.listAutomations/getAutomation/listAutomationLogs`, `threadsFunnels.*` (2), `threadsPublishStore.listJobs`, `threadsReplies.listRepliesForPost`, `threadsSearch.getSearchQuotaInfo`;
  - `youtubeStore.*` (4), `ytAutomationsApi.listAutomations/listCommentLogs/quotaStatus`, `ytMedia.mediaQuotaStatus/recentJobs`, `ytPlaylists.playlists`, `ytUpload.uploadStatus`;
  - `openreplyStore.campaigns/daily`, `orAutomationsApi.listAutomations/listDmLogs`, `orEngine.status`, `orProfileMenu.getProfileMenu`.
- **urednik (podrazumevano), 49 funkcija (24 mutacije, 25 akcija):**
  - Threads: `threadsAutomations` create/update/delete/toggle, `threadsPublish.publishingLimit/repostPost`, `threadsPublishStore.generateUploadUrl/registerUpload/createJob/cancelJob/retryJob`, `threadsReplies.replyToPost/hideReply/unhideReply/approvePendingReply/ignorePendingReply/deleteReply`, `threadsSearch.searchKeyword/lookupProfile`;
  - YouTube: `ytAuth.issueUploadToken`, `ytAutomationsApi` create/update/toggle/delete, `ytCaptions.*` (5), `ytComments.deleteComment`, `ytPlaylists.listPlaylists/addVideoToPlaylist`, `ytThumbnails.*` (2), `ytUpload.startUpload/finishUpload/failUpload`, `ytVideos.updateVideoMetadata`;
  - OpenReply: `orAutomationsApi` create/update/toggle/delete, `orProfileMenu.saveProfileMenu/publish/unpublish/fetchLiveProfile`, `orSend.*` (3).
- **`uloga: "owner"`, 6 funkcija:** `threads.threadsAuthorizeUrl`, `threadsPublish.deletePost`, `youtube.youtubeAuthorizeUrl`, `ytVideos.deleteVideo`, `orEngine.enable/disable`.

**Interne funkcije i pomoćni kod (pravilo 5, D6).** Interne funkcije koje su akcije zvale preko prenetog identiteta sada dobijaju prostor eksplicitno i više ne proveravaju članstvo:
- `ytMedia.loadMediaContext` prima `workspaceId`; pozivaoci `ytAuth`, `ytCaptions`, `ytComments`, `ytPlaylists`, `ytThumbnails`, `ytVideos` (×2) ga šalju iz `ctx.projekat`. Pomoćne funkcije `loadContext` (u `ytCaptions` i `ytPlaylists`), `runUploadCaption`, `runUpdateCaption` i `runSetThumbnail` primaju `workspaceId` kao parametar.
- `orSend.loadInboxSendContext` i `orProfileMenu.loadPublishContext` (preko pomoćne `loadToken`) primaju `workspaceId`.
- Obrisan je `threadsPublishStore.membershipForAction`, jer su mu svih 8 pozivalaca (`threadsPublish` ×3, `threadsReplies` ×5) prešli na `ctx.projekat`.
- `threads.ts`, `threadsSearch.ts` i `youtube.ts` više ne zovu `instagramStore.getMembership`. `threadsSearch.getSearchQuotaInfo` više nema sopstvenu logiku „prvo članstvo“.
- Interne funkcije koje su već primale `workspaceId` (`createOAuthState`, `getConnectionForWorkspace`, `ytMedia.startJob/finishJob` i ostale), HTTP akcije, webhook i cron nisu dirani. Provere dokumenta iz argumenta (posao objave, posao upload-a, automatizacija, log komentara, stavka menija) ostale su iste.

**Front.** Svaki poziv ovih funkcija ide kroz `useProjekatQuery/Mutation/Action`; nijedan ne šalje `workspaceId` ručno. Pozivi drugih grupa u istim fajlovima ostali su na sirovim hookovima: `connections.*` i `sync.*` (C07), `postsStore.*` u `novosti-editor` (C06). Tri efekta zovu akciju pri montiranju, pa čekaju `useProjekat().spreman` (obrazac iz C04): kvota u `threads-composer`, automatsko učitavanje titlova u `yt-captions-panel` i tiho učitavanje plejlista u `yt-video-edit-dialog`.

**Provera grep-om.** U 25 fajlova grupe nema nijednog od ovih imena: `requireMembership`, `requireOwner`, `requireWorkspaceAccess`, `requireMembershipIn`, `requireActionMembership`, `getMembership`, `membershipForAction`, `getAuthUserId`, `getWorkspaceForUser`. Nijedna javna funkcija grupe nema `workspaceId` u sopstvenim `args`. Na frontu nijedan poziv C05 funkcije ne ide kroz `useQuery/useMutation/useAction`. Čuvar broji 343 javne funkcije: omotačem 162 (C04: 77), sa proverom 168, javno 13, bez provere 0.

**Podela posla.** Pet radnika (Sonnet) je radilo po jedan modul, svaki na svojim fajlovima: Threads nalog, statistika, automatizacije, levak i pretraga; Threads objava i odgovori; YouTube nalog, statistika i automatizacije; YouTube media sloj; OpenReply. Zajedničke komponente `connections-settings` i `yt-comment-log-table` (pozivi dva modula), test izolacije, potpise u `pristup.test.ts` i razvojni prikaz radio sam ja. Svaki diff sam pročitao.

**Šta je iz grupe ostalo:** ništa od javnih funkcija ni poziva grupe. Svesno ostaje:
- `instagramStore.getMembership`, jer ga i dalje zove `gbp.ts` (C07 ga briše).
- Pozivi drugih grupa u zajedničkim fajlovima (`connections.*`, `sync.*` → C07; `postsStore.*` → C06).

**ODLUKE:**
- **Zajednički fajl sa pozivima dva modula** (`yt-comment-log-table`: `ytAutomationsApi.listCommentLogs` i `ytComments.deleteComment`) i `connections-settings` (tri modula) menjao sam ja, da dva radnika nikad ne diraju isti fajl.
- **Uloge po mapi menjaju ponašanje za ne-vlasnike.** Za Jovana kao vlasnika ništa se ne menja.
  - Povezivanje Threads i YouTube naloga, brisanje Threads objave i YouTube videa i uključivanje/isključivanje OpenReply motora sada traže `owner` (do sada svaki član).
  - Sve mutacije i akcije grupe traže urednika, pa ih `client_viewer` ne pokreće. U `chat-view` tihi `mark_seen` posmatraču pada u postojeći `.catch(() => {})`.
- **Redosled provera:** `threadsAuthorizeUrl` i `youtubeAuthorizeUrl` su ranije prvo proveravali env aplikacije, pa prijavu. Sada omotač prvo proverava prijavu, članstvo i ulogu (isto kao C04 za Instagram i Facebook).
- **Pretraga Threads-a:** `searchKeyword` i `lookupProfile` su neprijavljenom i nečlanu VRAĆALI `{ status: "error" }`; sada omotač baca grešku pre handlera. `threads-search.tsx` već ima `try/catch` oko oba poziva i grešku upisuje u rezultat, pa UI nije menjan. Član projekta ide istim putem kao ranije.
- **`setupInfo` (Threads i YouTube)** su ranije tražili samo prijavu ili prvo članstvo, a sada traže članstvo u projektu iz argumenta (CV), po mapi.
- **Fajl za YouTube titl i sličicu:** `requireActionMembership` pre `try { … } finally { obriši storageId }` (zakrpa iz C01) zamenio je omotač, koji proverava prijavu i članstvo pre handlera. `finally` ostaje, a test pokazuje da odbijen poziv ne briše fajl.
- **Test, ne kod:** `ytUpload.failUpload/finishUpload` za tuđ posao kroz sopstveni projekat tiho vraćaju `null` (`claimJob`), kao i pre C05. Test to proverava tako, umesto da očekuje grešku.
- **Razvojni prikaz:** svih pet ekrana grupe je već bilo registrovano u `app/dev-ux/[[...slug]]/page.tsx`. Fiksture nisu menjane. Lista OpenReply automatizacija je prazna jer za `orAutomationsApi.listAutomations` nikad nije postojala fikstura (od ranije).
- **Skill `impeccable` nije pozvan:** korak ne menja izgled ni tekst ekrana, samo hookove poziva.

**Novi paketi:** nema

**Testovi:**
- `convex/izolacija-c05.test.ts`, 18 testova. „Odbijeno“ znači da član samo projekta A dobija `forbidden` nad B. Po modulu:
  - **Threads nalog, statistika i levak:** 7 upita nad B odbijeno; `mediaList` u A vidi samo objave A, a Jovan (član oba) u B vidi B; povezivanje: B i urednik odbijeni, OAuth stanje ne nastaje.
  - **Threads automatizacije:** 3 upita i 4 mutacije nad B odbijeni; lista u A ne sadrži pravilo B; tuđe pravilo kroz A „nije pronađeno“ i ostaje netaknuto; posmatrač čita, ali ne menja.
  - **Threads pretraga:** kvota B i obe akcije nad B odbijene; kvota A broji samo pretrage A; posmatrač ne pretražuje.
  - **Threads objava:** spisak, 5 mutacija i 3 akcije nad B odbijeni; spisak u A ne sadrži posao B; otkazivanje tuđeg posla kroz A daje „nije pronađena“ i posao ostaje u redu; posmatrač ne objavljuje; brisanje objave odbija urednika.
  - **Threads odgovori:** upit, mutacija i 5 akcija nad B odbijeni, posao odgovora ne nastaje; posmatrač čita, ali ne odgovara i ne moderira.
  - **YouTube nalog i statistika:** 4 upita nad B odbijena; dani u A samo A, Jovan u B vidi B; povezivanje: B i urednik odbijeni, OAuth stanje ne nastaje.
  - **YouTube automatizacije:** 3 upita i 4 mutacije nad B odbijeni; lista u A samo A; tuđe pravilo kroz A ostaje netaknuto; posmatrač ne menja.
  - **YouTube media:** 4 upita, 5 mutacija i 11 akcija nad B odbijeni; odbijen poziv ne briše fajl iz storage-a; poslovi u A ne sadrže posao B; tuđ posao kroz A ostaje `pending`; posmatrač ne menja ni ne pokreće; brisanje videa odbija urednika.
  - **OpenReply:** 6 upita, 7 mutacija i 6 akcija nad B odbijeni; kampanje i automatizacije u A samo A; tuđa automatizacija kroz A „nije pronađena“ i ostaje netaknuta; posmatrač ne menja i ne šalje; motor odbija urednika.
- `convex/pristup.test.ts`: menjani su samo potpisi poziva (`ytCaptions.uploadCaption/updateCaption`, `ytThumbnails.setThumbnail`, `threadsPublishStore.registerUpload` dobijaju `workspaceId`). Tvrdnje su iste.

**Rezultat provere:**
- Automatske provere su prošle:
  - codegen ✓, typecheck ✓;
  - lint ✓ (0 grešaka; broj upozorenja u svakom izmenjenom fajlu isti kao u HEAD);
  - `npx vitest run` ✓ (120/120);
  - `verify-pristup` ✓ (0 bez provere), `regresije.mjs` ✓ (14/14), `npm run build` ✓.
- Razvojni prikaz (Playwright, 1440×900 i 390×844):
  - 9 ekrana vraća 200, bez grešaka i upozorenja u konzoli: `/threads` (i četiri jezička: objavljivanje, moderacija, automatizacije, pretraga), `/youtube` (i dijalog „Izmeni video“ sa automatskim učitavanjem plejlista), `/youtube/automatizacije`, `/openreply`, `/openreply/automatizacije`, `/settings`, `/`, `/instagram/inbox`, `/novosti`;
  - snimci `/threads` (1440) i `/youtube` (390) pokazuju da podaci stižu kroz nove hookove;
  - dev server je ugašen, a privremeni fajlovi Playwright-a obrisani.

**Za Jovana ujutru:**
- Posle deploya (zajedno sa ostatkom runa) proveri da sve radi kao pre:
  - Threads: pregled, objava (kvota se učita), otkazivanje posla, sakrij i odgovori na odgovor, automatizacije, pretraga;
  - YouTube: pregled, „Izmeni video“ (plejliste), titlovi, sličica, slanje videa, automatizacije i log komentara;
  - OpenReply: kampanje, automatizacije, ledolomci i meni (sačuvaj i objavi), slanje poruke iz Instagram inboxa.
- Podešavanja → Threads/YouTube „Poveži“ i OpenReply uključi/isključi. To sada može samo vlasnik projekta.

## C06 — Prelazak 3: leadovi, novosti, napredak, obaveštenja   (2026-10-25 02:20)
**Fajlovi:**
- backend (17 fajlova grupe i šema):
  - leadovi: `convex/leadCrmStore.ts`, `leadDetailStore.ts`, `leadExportStore.ts`, `leadFiltersStore.ts`, `leadGapFillStore.ts`, `leadGapsStore.ts`, `leadImportStore.ts`, `leadInboundStore.ts`, `leadLandingStore.ts`, `leadScoringStore.ts`, `leadSiteAuditsStore.ts`, `leadSuppressionStore.ts`;
  - `convex/nichesStore.ts`, `ingestTokensStore.ts`, `postsStore.ts`, `napredak.ts`, `notificationsStore.ts`;
  - `convex/schema.ts`: indeks `notificationState.by_user_workspace_kljuc`;
  - `convex/postsPublic.ts` nije menjan (ostaje javan uz `// javno:`).
- front (41 fajl):
  - `components/app/leadovi/`: `call-mode`, `gaps-panel`, `import-dashboard`, `import-file-picker`, `import-review-table`, `import-row-dialog`, `imports-history`, `lead-action-bar`, `lead-call-strip`, `lead-detail`, `lead-expanded-row`, `lead-export-dialog`, `lead-filter-bar`, `lead-gap-fill-dialog`, `lead-quick-dialogs`, `lead-row-actions`, `lead-row-dialogs`, `lead-state-chip`, `leads-dashboard`, `leads-map-panel`, `leads-map`, `leads-table`, `leads-today`, `meetings-panel`, `niches-panel`, `overdue-panel`, `phone-confidence-dialog`, `scoring-rules-panel`, `site-audit-panel`, `use-zovi-sada`;
  - `app/(app)/leadovi/[companyId]/lead-detail-page-client.tsx`;
  - `components/app/novosti/`: `novosti-dashboard`, `novosti-editor` (samo pozivi `postsStore`), `publish-readiness-panel`;
  - `components/app/napredak/`: `use-napredak`, `napredak-feedback`, `napredak-screen`;
  - zvono i blok „Šta me čeka“: `components/app/notifications-bell.tsx`, `components/app/use-sta-me-ceka.ts`;
  - `components/app/settings/`: `ingest-tokens-panel`, `napredak-settings`.
- testovi: nov `convex/izolacija-c06.test.ts`.
- snimci: `docs/projekti/snimci/C06-profil-1440.png`, `C06-leadovi-390.png`, `C06-zvono-1440.png`.

**Šta je urađeno:**
Obrađeno je svih 87 javnih funkcija grupe iz mape C02 §5.1. Njih 85 sada ide kroz omotače iz `convex/lib/projekat.ts`, a 2 ostaju sirove uz postojeću oznaku `// javno:` (`postsPublic.listPublished`, `postsPublic.getPublishedBySlug`). Uloge su tačno po mapi:
- **`projekatQuery` (client_viewer), 30 funkcija:**
  - `leadCrmStore.listMeetings/getLeadCrm/listByOwner/listByStage/listOverdue`, `leadDetailStore.getLeadDetail`;
  - `leadFiltersStore.listLeadsFiltered/countLeadsByFacet/listLeadsForMap/getLeadRow/listPresets`, `leadGapsStore.*` (2), `leadScoringStore.scoreCompany/scoreCompanies/listIcpRules/missingDefaultIcpRules`, `leadSiteAuditsStore.listSiteAudits`;
  - `leadImportStore.getImport/listImportRows/listImports`, `leadInboundStore.listInbound/getInbound`, `leadSuppressionStore.listSuppression`;
  - `nichesStore.listNiches`, `leadLandingStore.listLandingsForCompany/landingStatus`;
  - `napredak.stanje/profil`, `notificationsStore.staMeCeka`.
- **`projekatQuery` sa `uloga: "urednik"`, 1 funkcija:** `leadExportStore.exportLeads` (izvoz celog spiska kontakata).
- **urednik (podrazumevano), 45 mutacija:**
  - `leadCrmStore` (9), `leadDetailStore.setPhoneConfidence`, `leadGapFillStore.fillGap`;
  - `leadFiltersStore.savePreset/deletePreset`, `leadScoringStore` (5);
  - `leadImportStore` (9), `leadInboundStore.linkInboundToCompany/dismissInbound`, `leadSuppressionStore.addSuppression/removeSuppression`;
  - `nichesStore` (5), `leadLandingStore.createLanding/markLandingSent/archiveLanding`;
  - `postsStore.create/updateDraft/saveRevision/archive/publish/unpublish`.
- **Mutacije nad ličnim redovima sa `uloga: "client_viewer"`, 6 funkcija:** `napredak.podesi/potvrdi/zamrzniDan`, `notificationsStore.odloziZadatak/sakrijZadatak/vratiZadatak`.
- **`uloga: "owner"`, 3 funkcije:** `ingestTokensStore.listIngestTokens/createIngestToken/revokeIngestToken`.

**Posebno u C06 (plan §5.1 i §5.2):**
- **Zvono po projektu.** Šema dobija indeks `notificationState.by_user_workspace_kljuc`. `nadjiStanje` traži red po (korisnik, projekat, ključ), a ne više samo po (korisnik, ključ). Tako odlaganje ili sakrivanje u jednom projektu više ne prepisuje isti ključ u drugom (rupa zapisana u C01). `ucitajStanja` čita preko istog indeksa umesto `by_user` + filtera.
- **Ciljni član** u `leadCrmStore.assignLead` i `leadGapFillStore.fillGap` (grana „bez vlasnika“) čita se preko `members.by_user_workspace`, umesto `by_user`.
- `leadFiltersStore.proveriPristup` je obrisan, jer su mu svih pet pozivalaca prešli na omotač.
- Interne funkcije (`createImportFromIngest`, `recordInbound`, `findValidTokenByHash`, `markTokenUsed`, `pruneRevisions`, `nastaviZakljucavanje`), HTTP akcije i ingest nisu dirani. Provere dokumenta iz argumenta (firma, uvoz, red uvoza, prijem, landing, pravilo, preset, niša, token, objava) ostale su iste.
- Poruke grešaka u dirnutim funkcijama: „radni prostor“ → „projekat“.

**Front.** Svaki poziv ovih funkcija ide kroz `useProjekatQuery/Mutation`. Nijedan poziv ne šalje `workspaceId` ručno. `postsPublic.listPublished` ostaje direktan `useQuery` sa `workspaceSlug: useProjekat().slug` (§5.4). `useWorkspace()` je uklonjen iz svih fajlova grupe (§5.3, kolona uW). Ostali su samo potrošači iz C07: `app-sidebar`, `command-focus`, `invites-panel`, `members-panel`, `user-menu`, `workspace-provider`.
- `workspaceId` se više ne prosleđuje kroz props: uklonjen je iz props-a ~35 komponenti leadova, iz `LeadDialogBase` i iz hookova `useZoviSada()`, `useNisaZa()` i `useStagePick()`.
  - Ostaje samo u uslovu učitavanja na vrhu (`!spreman || workspaceId === null`) u `leads-dashboard`, `import-dashboard` i `lead-detail-page-client`.
  - U novostima ostaje kao ključ lokalnih nacrta i polje `PostItem`.
- Efekti koji sami zovu mutaciju (`napredak-feedback`: `zamrzniDan`, `potvrdi`) čekaju `useProjekat().spreman`, po obrascu iz C04. Dugmad zvona i podešavanja napretka su onemogućena dok `!spreman`.

**Provera grep-om.** U 17 backend fajlova grupe nema nijednog od ovih imena: `requireMembership`, `requireOwner`, `requireWorkspaceAccess`, `requireMembershipIn`, `requireActionMembership`, `getMembership`, `membershipForAction`, `getAuthUserId`, `getWorkspaceForUser`, `withIndex("by_user"`. Izuzetak su dva komentara u `leadImportStore.ts` koji opisuju interni ingest. Nijedna javna funkcija grupe nema `workspaceId` u sopstvenim `args`. Na frontu nijedan poziv C06 funkcije ne ide kroz `useQuery/useMutation/useAction`. Čuvar broji 343 javne funkcije: omotačem 247 (C05: 162), sa proverom 83, javno 13, bez provere 0.

**Podela posla.** Četiri radnika (Sonnet) su paralelno radila po jedan modul, backend i front, svaki na svojim fajlovima:
- CRM, detalj, izvoz i dopuna;
- uvoz, prijem i lista zabrane;
- filteri, rupe i ocenjivanje;
- niše, landing strane, ocene sajta, ingest tokeni i novosti.

Zajednički fajlovi sa pozivima više modula dodeljeni su tačno jednom radniku. Peti radnik je posle toga, sekvencijalno, očistio mrtve `workspaceId` props. Napredak, zvono, šemu i test radio sam ja. Svaki diff sam pročitao.

**Šta je iz grupe ostalo:** ništa od javnih funkcija ni poziva grupe. Svesno ostaje:
- `notificationState` indeksi `by_user_kljuc` i `by_user` više nemaju čitaoca, ali nisu obrisani (vidi ODLUKE).
- Komponente `components/app/system/*` nemaju pozive C06 funkcija. Kartica igrača čita napredak kroz `NapredakIzvor` → `useNapredakPretplata` (prebačeno), pa tu nije bilo šta da se menja.

**ODLUKE:**
- **Mrtvi `workspaceId` props su uklonjeni, a nisu ostavljeni.** Posle prelaska na `useProjekat*` hookove prop više nema svrhu i ostavio bi 26 novih lint upozorenja. Radnici su ga u paralelnom delu namerno ostavljali, da se ne sudare na zajedničkim tipovima. Jedan radnik ga je posle uklonio celim lancem, uz typecheck kao vodič. Broj lint nalaza u svakom izmenjenom fajlu jednak je HEAD-u.
- **Dugme za izvoz je sakriveno posmatraču** (`leads-table.tsx`, jedan uslov). `exportLeads` po mapi traži urednika. Upit se pokreće tek kad se dijalog otvori, i posmatraču bi bacio grešku koju `useQuery` diže u granicu i tako ruši tabelu. Isti obrazac već ima `ingest-tokens-panel` (spisak tokena se crta samo vlasniku).
- **Stari indeksi zvona ostaju.** Plan kaže: „`by_user_kljuc` ostaje dok ga nešto čita“. Posle C06 ga ne čita niko, isto kao ni `by_user`. Najkonzervativnije je da se ne brišu u ovom koraku, jer je brisanje indeksa promena pri deployu bez koristi za izolaciju. C07 („pokupi ostatke“) ili C19 mogu da ih obrišu.
- **`ucitajStanja` je prešao na novi indeks**, iako plan pominje samo `nadjiStanje`. Pravilo runa je da se podaci projekta čitaju preko indeksa sa `workspaceId`. Filter po prostoru u petlji ostao je kao odbrana.
- **Uloge po mapi menjaju ponašanje za ne-vlasnike.** Za Jovana kao vlasnika ništa se ne menja.
  - Sve mutacije leadova, niša, landing strana i novosti sada traže urednika. Do sada je mogao svaki član, pa i `client_viewer`. Front ih hvata postojećim `try/catch` i ispisuje poruku omotača.
  - Izvoz kontakata traži urednika.
  - Ingest tokeni: neowner dobija poruku omotača („…samo vlasnik projekta.“) umesto golog `forbidden`. Šifra je ista.
  - Napredak i zvono rade i posmatraču, ali samo nad sopstvenim redovima u projektu u kome je član.
- **Pristup po tačnom članstvu.** Stari `requireMembership` poredio je samo sa PRVIM članstvom, pa je član dva projekta bio odbijen u drugom. Sada radi u oba (test).
- **`novosti-dashboard`:** grana „projekat nije izabran“ (`workspaceId === null` posle `spreman`) ostala je radi sužavanja tipa. U praksi se ne dešava. Tekst nije menjan.
- **Razvojni prikaz:** fiksture nisu menjane. Profil firme ima fiksturu samo za `lc_ux_test_002` (od ranije, `LEAD_PROFIL_ID`). `lc_ux_test_001` crta skelet, jer upiti nemaju odgovor.
- **Skill `impeccable` nije pozvan:** korak ne menja izgled ni tekst ekrana, samo hookove poziva. Izuzetak je jedno sakriveno dugme za posmatrača.

**Novi paketi:** nema

**Testovi:**
- `convex/izolacija-c06.test.ts`, 22 testa. „Odbijeno“ znači da član samo projekta A dobija `forbidden` nad B. Po modulu:
  - **CRM, detalj, izvoz, dopuna:**
    - 7 upita i 11 mutacija nad B su odbijeni; u B ne nastaje dodela ni događaj, a zabrana i temperatura ostaju iste;
    - tuđa firma kroz A „nije pronađena“;
    - posmatrač čita, ali ne menja i ne izvozi;
    - dodela vlasniku koji je član samo B pada („nije član ovog projekta“), a članu oba projekta prolazi;
    - član oba projekta radi u B.
  - **Uvoz, prijem, zabrana:**
    - 6 upita i 13 mutacija nad B su odbijeni; status uvoza, reda i prijema u B, kao i zabrana, ostaju isti;
    - u A se vide samo uvozi A, a redovi tuđeg uvoza su prazni;
    - odustajanje od tuđeg uvoza kroz A „nije pronađen“;
    - posmatrač ne menja.
  - **Filteri, rupe, ocenjivanje:**
    - 11 upita i 7 mutacija nad B su odbijeni; preset i pravilo B ostaju;
    - u A samo preseti i pravila A;
    - tuđ preset kroz A je odbijen, a tuđa firma u oceni „nije pronađena“;
    - posmatrač čita, ali ne menja.
  - **Niše, landing strane, ocene sajta:**
    - 4 upita i 8 mutacija nad B su odbijeni; niša, platforma i landing u B ostaju;
    - u A samo niše A;
    - tuđa niša kroz A je odbijena;
    - posmatrač ne menja.
  - **Ingest tokeni:**
    - B je odbijen;
    - urednik i posmatrač ne vide, ne prave i ne opozivaju tokene („samo vlasnik projekta“);
    - vlasnik u A vidi samo token A;
    - tuđ token kroz A se ne opoziva.
  - **Novosti:**
    - 6 mutacija nad B je odbijeno;
    - tuđa objava kroz A „nije pronađena“ i ostaje ista;
    - posmatrač ne piše, a urednik piše samo u A.
  - **Napredak:**
    - 2 upita i 3 mutacije nad B su odbijeni i ne nastaje red;
    - posmatrač podešava svoj napredak;
    - Jovan isključi napredak u A, a u B ostaje uključen.
  - **Zvono:**
    - upit i 3 mutacije nad B su odbijeni;
    - **odlaganje u B pa sakrivanje istog ključa u A daju dva reda, i B ostaje odložen, a ne sakriven**. Sa starim indeksom `by_user_kljuc` ovaj test pada.
    - „Vrati“ u A briše samo red A;
    - posmatrač sklanja stavke u svom zvonu.
- `convex/pristup.test.ts`: nije menjan. `createImport`, `addSuppression` i `listImportRows` su već slali `workspaceId`; tvrdnje prolaze.

**Rezultat provere:**
- Automatske provere su prošle:
  - codegen ✓, typecheck ✓;
  - lint ✓ (0 grešaka; broj nalaza u svakom izmenjenom fajlu isti kao u HEAD);
  - `npx vitest run` ✓ (142/142);
  - `verify-pristup` ✓ (0 bez provere), `regresije.mjs` ✓ (14/14), `npm run build` ✓.
- Razvojni prikaz (Playwright, 1440×900 i 390×844):
  - 15 adresa vraća 200, sa ispravnim naslovom i bez grešaka i upozorenja u konzoli: `/leadovi` (Danas) i jezičci `leads`, `map`, `gaps`, `overdue`, `meetings`, `scoring`, `niche`, zatim `/leadovi/uvoz`, profil `/leadovi/lc_ux_test_002`, `/novosti`, `/napredak` (i `?prazno=1`), `/settings`, `/` sa zvonom;
  - jedini nalaz konzole su spoljne pločice mape (`ERR_NAME_NOT_RESOLVED`), od ranije;
  - zvono crta zadatke, a „Odloži 1 dan“ prolazi kroz `useProjekatMutation` bez greške;
  - snimci profila (1440), tabele (390) i zvona (1440) pokazuju da podaci stižu kroz nove hookove;
  - dev server je ugašen, a privremeni fajlovi Playwright-a obrisani.

**Za Jovana ujutru:**
- Posle deploya (zajedno sa ostatkom runa) proveri da sve radi kao pre:
  - Leadovi: Danas, tabela (filteri, preseti, izvoz), mapa, rupe i dopuna, zaostali, sastanci, profil firme (temperatura, faza, ishod, sastanak, dodela), režim poziva;
  - uvoz iz tabele (pregled, odluke po redu, primena, odustajanje), niše, pravila ocenjivanja;
  - novosti: nacrt, izmena, objava i povlačenje;
  - Napredak: kartica igrača, ekran i podešavanja;
  - zvono: odloži, sakrij, vrati;
  - Podešavanja → ingest tokeni.
- Convex deploy dodaje indeks `notificationState.by_user_workspace_kljuc` (mala tabela, bez čekanja).
- Ako budeš imao urednika ili klijenta-posmatrača: posmatrač više ne menja leadove ni novosti i ne vidi dugme za izvoz kontakata. Napredak i zvono i dalje podešava sam.

## C07 — Prelazak 4: oglasi, pravila, veze, članovi; strogi čuvar   (2026-10-25 02:55)
**Fajlovi:**
- backend (18 fajlova grupe i dva obrisana):
  - oglasi: `convex/adActions.ts`, `adActionsStore.ts`, `metaAds.ts`, `metaAdsStore.ts`, `metaCapi.ts`, `metaCapiStore.ts`, `googleAdsStore.ts`;
  - pravila: `convex/rules.ts`, `rulesStore.ts`;
  - veze i ostalo: `convex/connections.ts`, `sync.ts`, `purge.ts`, `gbp.ts`, `gbpStore.ts`, `publicRouteLimit.ts`, `webhookHealth.ts`;
  - članovi i pozivnice: `convex/membersStore.ts`, `invitesStore.ts`;
  - „prvo članstvo“: `convex/lib/auth.ts` (ostao samo `deleteLoginMachinery`), `convex/instagramStore.ts` (obrisan `getMembership`);
  - **obrisani:** `convex/workspaces.ts` (`currentContext`, `getWorkspaceForUser`), `components/app/workspace-provider.tsx`;
  - `convex/_generated/api.d.ts` (codegen).
- front (51 fajl):
  - `components/app/ads/`: `ad-action-dialog`, `ad-drilldown-panel`, `ad-preview-dialog`, `ads-dashboard`, `audiences-view`, `campaign-detail`, `capi-section`, `create-custom-audience-dialog`, `create-lookalike-audience-dialog`, `hook-battle-view`, `hook-label-editor`, `new-campaign-wizard`, `new-hook-version-dialog`, `targeting-search-dialog`, `use-account-currency`;
  - `components/app/rules/`: `rule-editor-dialog`, `rule-firings-table`, `rules-dashboard`, `rules-list`;
  - `components/app/settings/`: `action-audit-log`, `connections-settings`, `invites-panel`, `members-panel`, `purge-state`, `sync-health`, `sync-schedule`, `webhook-health`;
  - samo `connections.list` / `sync.*`: `analytics/` (7 ekrana), `attribution/attribution-dashboard`, `instagram/{comments-moderation,instagram-dashboard,instagram-demographics,publish-composer}`, `openreply/openreply-dashboard`, `overview/overview-dashboard`, `youtube/{youtube-dashboard,yt-automations-dashboard}`, `sync-status`, `system/channel-focus`;
  - ljuska bez `useWorkspace`: `app-shell`, `app-sidebar`, `user-menu`, `overview/command-focus`; komentar u `projekat-provider`;
  - razvojni prikaz: `app/dev-ux/fixtures.ts` (obrisana fikstura `currentContext`).
- čuvar: `lib/pristup-cuvar.ts` (samo strogo pravilo; blaga verzija iz C01 ukinuta), nov `lib/front-cuvar.ts`, `scripts/verify-pristup.ts`.
- testovi: novi `convex/izolacija-c07.test.ts`, `izolacija-c07-meta.test.ts`, `izolacija-c07-akcije.test.ts`, `izolacija-c07-pravila.test.ts`, `izolacija-c07-veze.test.ts`, `lib/front-cuvar.test.ts`; izmenjeni `lib/pristup-cuvar.test.ts`, `convex/pristup.test.ts` (samo potpisi poziva).
- snimci: `docs/projekti/snimci/C07-pristup-1440.png`, `C07-oglasi-1440.png`, `C07-meni-390.png`.

**Šta je urađeno:**
Obrađene su sve 88 javnih funkcija grupe iz mape C02 §5.1: 82 sada idu kroz omotače, 5 ostaju javne uz postojeću oznaku `// javno:` (`gbp.completeOAuthFromCallback` i četiri funkcije registracije u `invitesStore`, tok menja C13), a `workspaces.currentContext` je obrisan. Uloge su tačno po mapi:
- **`projekatQuery` (client_viewer), 42 funkcije:** `adActionsStore.*` (4), `metaAdsStore` (18 upita), `metaCapiStore.getCapiStats`, `googleAdsStore.*` (8), `rulesStore.listRules/getRule/listRuleFirings`, `connections.list`, `gbpStore.*` (2), `sync.freshness/health`, `purge.status`, `publicRouteLimit.routeUsageStatus`, `membersStore.listMembers`.
- **urednik (podrazumevano), 11 funkcija:** `metaAds.checkAudienceTosAction/syncAudiencesAction/getAdPreviewAction/searchTargetingAction/listAdPixelsAction/getDeliveryEstimateAction`, `metaAdsStore.setHookLabel/pinBattle/unpinBattle`, `rulesStore.ensureTemplateRules`, `connections.syncNow`.
- **`uloga: "owner"`, 28 funkcija:** `adActions.*` (10), `metaAds.createCustomAudienceAction/createLookalikeAudienceAction`, `metaCapi.triggerCapiDispatchAction`, `rules.manualEvaluateRules`, `rulesStore.createRule/updateRule/deleteRule/toggleRule`, `connections.save/remove`, `gbp.gbpAuthorizeUrl/checkGbpAccess`, `purge.retry`, `membersStore.removeMember`, `invitesStore.listInvites/createInvite/revokeInvite/deleteInvite`.
- **`platformaQuery`, 1 funkcija:** `webhookHealth.status` (stanje cele platforme, D1).

**„Prvo članstvo“ je uklonjeno (plan §5.2).** Obrisani su `requireMembership`, `requireOwner`, `requireMembershipIn`, `requireWorkspaceAccess`, `requireActionMembership` (`lib/auth.ts`), `workspaces.currentContext` i `getWorkspaceForUser` (ceo fajl), `instagramStore.getMembership`, `adActionsStore.resolveUserWorkspace` i ručna provera vlasnika u `resolveGoogleAdsAuth`. Pomoćne funkcije akcija (`resolveAuthAndToken`, `resolveGoogleAdsAuth`, `getMetaAdsAuth`) više ne proveravaju članstvo, nego dobijaju projekat iz `ctx.projekat` (D6). Interni `connections.authorizeForSync` umesto `userId` prima `workspaceId` i samo poredi vezu sa projektom. `grep withIndex("by_user"` nad `members` nalazi samo `auth.ts`, `invitesStore.ts`, `membersStore.ts`, `lib/projekat.ts` i `projekti.ts` (provera iz plana §5.2).

**Front.** Svaki poziv ovih funkcija ide kroz `useProjekatQuery/Mutation/Action`. `WorkspaceProvider` i `useWorkspace` su obrisani, a `AppShell` više ne montira provider. Kartica u bočnoj traci i fokus kontrolne table čitaju `useProjekat()`, meni korisnika čita `projekti.ja` (radi i bez projekta) i ime projekta iz providera, a `useIsWorkspaceOwner` čita `useProjekat().uloga`. `ensureTemplateRules` se zove samo za urednika i vlasnika, i tek kad je projekat učitan. Efekat pregleda oglasa koji sam zove akciju čeka `spreman`.

**Strogi čuvar.** `verify-pristup.ts` sada pada za svaku javnu `query`/`mutation`/`action` koja nije napravljena omotačem (`projekat*`, `prijavljen*`, `platforma*`) niti ima `// javno: <razlog>`. Ime provere u telu (nekadašnje pomoćne funkcije članstva, `getAuthUserId`) više ne važi; blaga verzija čuvara iz C01, koja je priznavala proveru po imenu, ukinuta je zajedno sa listom tih imena. Nad repoom: **342 javne funkcije (omotačem 329, javno 13, bez omotača 0)**, tačno broj iz plana (337 − 1 + 6). Nov **front čuvar** (`lib/front-cuvar.ts`, pokreće ga ista skripta) AST-om traži `useQuery/useMutation/useAction/usePaginatedQuery(api.…)` i `client.query/mutation/action(api.…)` u `app/`, `components/` i `lib/`, i pada za svaku funkciju van spiska funkcija bez projekta. Spisak je u skripti, sa razlogom za svaku stavku (16 stavki: `projekti.mojiProjekti/mojProjekat/ja/kreirajProjekat`, četiri funkcije pozivnica i prijave, `postsPublic.listPublished`, `webhookHealth.status`, pet OAuth povrataka, `threadsStore.getDeletionStatus`). Skripta proverava i da je svaka stavka zaista javna funkcija bez projekta, pa funkcija projekta ne može tiho da uđe na spisak. Nad repoom: 15 direktnih poziva, svi sa spiska.

**Podela posla.** Pet radnika (Sonnet) je radilo paralelno, svaki na svojim fajlovima: Meta oglasi i CAPI (backend); akcije nad oglasima i Google oglasi (backend); pravila (backend i front); veze, sinhronizacija, brisanje, GBP i brojač ruta (backend i pozivi u 21 zajedničkom ekranu); zatim front oglasa. Članove, pozivnice, `webhookHealth`, uklanjanje „prvog članstva“ i `WorkspaceProvider`-a, čuvare, `pristup.test.ts` i test `izolacija-c07.test.ts` radio sam ja. Svaki diff sam pročitao.

**Šta je ostalo:** ništa od javnih funkcija ni poziva grupa C04–C07. Svesno ostaje:
- `notificationState` indeksi `by_user_kljuc` i `by_user` (bez čitaoca od C06); vidi ODLUKE.
- Ime `useIsWorkspaceOwner` (koristi ga `connections-settings`); menja se samo telo.

**ODLUKE:**
- **Test izolacije je u pet fajlova, ne u jednom.** Plan (§9) imenuje `izolacija-c07.test.ts`. Radnici su paralelno pisali po jedan fajl po modulu (`izolacija-c07-{meta,akcije,pravila,veze}.test.ts`), a `izolacija-c07.test.ts` pokriva članove, pozivnice i `webhookHealth`. Spajanje bi bilo mehaničko premeštanje bez nove provere, uz rizik sudara imena pomoćnih funkcija.
- **Blaga verzija čuvara iz C01 je ukinuta, a ne ostavljena kao opcija.** Plan (§9, C07) traži da ime provere više ne važi kao provera, a prihvatanje traži da `requireMembership` ostane samo u istorijskim komentarima; lista imena blagog režima bi bila živ kod sa tim imenom. Tri testa iz C01 koja su proveravala prihvatanje provere po imenu (direktno u telu, kroz pomoćnu funkciju, kroz poziv interne provere) zadržala su iste ulaze, ali sada tvrde suprotno: sirova registracija pada. To je pooštrenje koje korak traži, ne slabljenje provere. U ulazima je ime nekadašnje pomoćne funkcije zamenjeno neutralnim `proveriClanstvo` (strogom čuvaru ime je svejedno). Polje `proverene` je uklonjeno iz rezultata, jer je u strogom pravilu uvek prazno; jedna tvrdnja oblika rezultata (`toEqual({ omotacem, javne, pale })`) je zato kraća za to polje.
- **Grep iz prihvatanja** (`requireMembership|currentContext|useWorkspace` u `convex app components lib`) posle ovog koraka nalazi samo četiri istorijska komentara: `leadImportStore.ts` ×2, `projekti.ts` i jedan u `lib/pristup-cuvar.test.ts` (objašnjava odakle potiču ulazi testova).
- **Spisak dozvoljenih direktnih poziva** je u `scripts/verify-pristup.ts` (kako traži zadatak), a logika i test su u `lib/front-cuvar.ts`. Dodat je `projekti.kreirajProjekat` (plan §5.4; funkcija postoji od C03). `projekti.stanjeProjekata` dodaje C09, kad funkcija bude postojala. Front čuvar proverava i serverske rute (`ConvexHttpClient`), pa su pet OAuth povrataka i `getDeletionStatus` na spisku sa razlogom.
- **`webhookHealth.status` je `platformaQuery`**, pa bi ostalim članovima upit pao i srušio karticu veza. `WebhookSignatureNote` zato šalje upit samo kad je `useProjekat().platformaVlasnik`; ostalima ne crta ništa.
- **Panel pozivnica se crta samo vlasniku** (`invites-panel.tsx`, isti obrazac kao tokeni ispod njega iz C06): `listInvites` po mapi traži vlasnika, a upit koji padne ruši ekran posmatraču i uredniku. Spisak članova i dalje vidi svaki član (CV); dugme „Ukloni“ ostaje, a ne-vlasnik dobija poruku omotača.
- **Dugmad koja ne-vlasniku sada ne prolaze nisu sakrivena** (oglasi, pravila, publike, CAPI, uklanjanje člana), kao i u C04–C06: UI logika je van recepta, a danas urednika ni posmatrača nema. Greške hvataju postojeći `try/catch` blokovi. Jedini dodat `catch` je na dugmetu „Učitaj šablone“ u praznom stanju pravila (ranije je vraćao neuhvaćeno odbijanje).
- **Tekst u dirnutim fajlovima, P1:** „radni prostor“ → „projekat“ u porukama dirnutih funkcija, u opisu i dijalogu sekcije „Članovi“, i rezervni naslov kartice u bočnoj traci („Radni prostor“ → „Projekat“, vidi se samo dok se projekat učitava).
- **`members-panel` opis „Uklanjanje briše prijavu tog naloga“** nije tačan za člana više projekata (prijava se gasi tek kad ne ostane nijedno članstvo, od C03). Nisam ga prepravljao: to je tekst ekrana, a tok članova i pozivnica menja C13.
- **Stari indeksi zvona (`notificationState.by_user_kljuc`, `by_user`) nisu obrisani.** C06 ih je ostavio „za C07 ili C19“. Nisu ostatak prelaska na omotače, a brisanje indeksa je promena pri deployu bez koristi za izolaciju; najkonzervativnije je ostaviti ih za C19.
- **`metaAds.getAdPreviewAction`** zove javni `metaAdsStore.getAdById` sa `workspaceId` (plan §4.1, pravilo 11). Oglas iz drugog projekta sada daje `forbidden` umesto „Oglas nije pronađen.“; oba su odbijanje.
- **Redosled provera:** u svim prebačenim akcijama (GBP povezivanje, akcije oglasa) prijava, članstvo i uloga se proveravaju pre provere env-a i prekidača `ADS_WRITE_ENABLED`. Nečlan i ne-vlasnik dobijaju `forbidden` pre poruke „pisanje je isključeno“ ili „čeka konfiguraciju“.
- **Uloge po mapi menjaju ponašanje za ne-vlasnike.** Za Jovana kao vlasnika ništa se ne menja. Do sada je svaki član mogao da: pravi, menja, uključuje i briše pravila; pokreće Meta akcije pisanja (samo Google su tražile vlasnika); pravi publike i pokreće CAPI; proverava GBP pristup; uklanja članove i pravi, vidi, povlači i briše pozivnice. Sve to sada traži vlasnika. `client_viewer` više ne pokreće `syncNow`, `ensureTemplateRules`, oznake i prikačene bitke oglasa ni čitajuće Meta akcije.
- **Skill `impeccable` nije pozvan:** korak ne menja izgled ekrana. Izmene na frontu su hookovi poziva, jedna sekcija koja se ne-vlasniku ne crta (isti obrazac kao postojeća) i reči „radni prostor“ → „projekat“.

**Novi paketi:** nema

**Testovi:**
- `convex/izolacija-c07.test.ts` (6): **članovi** — član A ne čita ni ne uklanja članove B (B ostaje), u A vidi samo članove A, Jovan u B vidi B; posmatrač čita, urednik i posmatrač ne uklanjaju; član samo B se ne uklanja kroz A, a uklanjanje Jovana iz A ne dira njegovo članstvo u B. **Pozivnice** — 4 funkcije nad B odbijene, tuđa pozivnica kroz A se ne povlači i ne briše; urednik i posmatrač ne vide i ne prave pozivnice; vlasnik pravi u A, spisak A nema B. **Webhook** — čita samo vlasnik platforme; neprijavljen, vlasnik samo klijentskog projekta, urednik, posmatrač i stranac su odbijeni.
- `convex/izolacija-c07-meta.test.ts` (6): 19 upita, 3 mutacije i 9 akcija nad B odbijeni; neprijavljen i stranac ne prolaze; u A samo podaci A, Jovan u B vidi B; tuđ oglas kroz A je zabranjen ili prazan, a B ostaje; posmatrač čita, ali ne menja i ne pokreće; publike i CAPI okidač traže vlasnika.
- `convex/izolacija-c07-akcije.test.ts` (11): akcije nad oglasima — 4 upita i 10 akcija nad B odbijeni, urednik i posmatrač ne pokreću nijednu od 10, bez prijave sve pada, dnevnik i statistika u A samo A, vlasnik A prolazi omotač i staje na „nije povezano“; Google oglasi — 8 upita nad B odbijeno, posmatrač čita, A vidi samo svoje redove u 4 tabele.
- `convex/izolacija-c07-pravila.test.ts` (6): 3 upita, 5 mutacija i akcija nad B odbijeni i pravilo B ostaje; tuđe pravilo kroz A se ne otkriva i ne menja; posmatrač ne učitava šablone; urednik učitava šablone, ali ne piše pravila; vlasnik radi sve u A; neprijavljen i stranac ne ulaze.
- `convex/izolacija-c07-veze.test.ts` (13): veze, sinhronizacija, brisanje, GBP i brojač ruta — B odbijen za sve; u A samo A, Jovan u B vidi B; `remove`, `retry` i `syncNow` kroz pogrešan projekat ne diraju B; posmatrač ne pokreće `syncNow`; `save`, `remove`, `retry`, `gbpAuthorizeUrl` i `checkGbpAccess` odbijaju urednika; GBP OAuth stanje ne nastaje za B ni za urednika.
- `lib/pristup-cuvar.test.ts` (13): tri testa iz C01 sa istim ulazima sada tvrde strogo pravilo — ime provere u telu, pomoćna funkcija (iz istog fajla ili uvezena) ni poziv interne provere ne spasavaju sirovu registraciju; nov test: omotač (i preimenovan, sa izvornim imenom omotača) i `// javno:` prolaze, a sirova funkcija pored njih pada. Ostali testovi iz C01 i C03 su nepromenjeni.
- `lib/front-cuvar.test.ts` (5): direktan poziv funkcije projekta pada, a sa spiska prolazi sa razlogom; prepoznaju se `useMutation`, `useAction`, `usePaginatedQuery`, poziv u više redova i `as`; serverske rute (`client.action/mutation`); `useProjekat*`, generička implementacija, komentar i string nisu direktan poziv; spisak sme da sadrži samo javne funkcije bez projekta (funkcija projekta, nepostojeća i stavka bez razloga padaju).
- `convex/pristup.test.ts`: menjani su samo potpisi poziva (`workspaceId: s.wsA` umesto izostavljenog ili opcionog). Tvrdnje su iste.

**Rezultat provere:**
- codegen ✓, typecheck ✓;
- lint ✓ (0 grešaka; broj nalaza u svakom od 77 izmenjenih fajlova isti kao u HEAD, novi fajlovi bez nalaza);
- `npx --no-install vitest run` ✓ (190/190, 15 fajlova);
- `verify-pristup` ✓ (342 javne: omotačem 329, javno 13, bez omotača 0; front: 15 direktnih poziva, svi sa spiska);
- `regresije.mjs` ✓ (14/14), `npm run build` ✓.
- Razvojni prikaz (Playwright, 1440×900 i 390×844): `/settings` (Integracije i Pristup), `/ads`, `/rules` i `/` sa otvorenim menijem korisnika crtaju podatke kroz nove hookove, bez grešaka i upozorenja u konzoli. Meni korisnika pokazuje ime, adresu i projekat „Enigma IT“. Dev server je ugašen, a privremeni fajlovi Playwright-a obrisani.

**Za Jovana ujutru:**
- Posle deploya (zajedno sa ostatkom runa) proveri da sve radi kao pre:
  - Oglasi: pregled, detalj kampanje, pauza/budžet/dupliranje, nova kampanja, nova verzija hooka, publike, CAPI;
  - Pravila: spisak, novo pravilo, izmena, uključi/isključi, „Pokreni proveru sad“;
  - Podešavanja: veze („Sinhronizuj“, „Prekini vezu“, ponovni pokušaj brisanja), „Istorija akcija“, „Pristup“ (članovi, pozivnice), napomena o webhook-u na Instagram/Facebook kartici;
  - meni korisnika i kartica u bočnoj traci.
- Ako budeš imao urednika ili klijenta-posmatrača: oglase, pravila, publike, CAPI, veze, članove i pozivnice sada menja samo vlasnik projekta; urednik i posmatrač ne vide sekciju pozivnica. Napomenu o webhook-u vidi samo vlasnik platforme.

## C08 — Rute /[projekat], hub i paneli po domenu   (2026-10-25 02:45)
**Fajlovi:**
- selidba (`mv`, bez `git mv`): `app/(app)/{ads,analytics,atribucija,facebook,instagram,leadovi,napredak,novosti,openreply,rules,settings,threads,youtube}/**` i `app/(app)/page.tsx` → `app/(app)/[projekat]/…` (sadržaj strana nepromenjen);
- novi: `app/(app)/[projekat]/layout.tsx`, `app/(app)/page.tsx` (hub „Svi projekti“), `components/app/auth-gate.tsx`, `components/app/hub/svi-projekti.tsx`, `components/app/projekat-nedostupan.tsx`, `lib/panel-domen.ts`, testovi `lib/panel-domen.test.ts` i `lib/linkovi-cuvar.test.ts`;
- izmenjeni: `proxy.ts`, `lib/rutiranje.ts`, `lib/rutiranje.test.ts`, `app/(app)/layout.tsx`, `components/app/app-shell.tsx`, `components/app/projekat-provider.tsx`, `components/app/user-menu.tsx`, `components/app/{app-sidebar,mobile-nav,section-nav,command-palette}.tsx`, `components/app/system/page-header.tsx`, `components/app/leadovi/{leads-map,leads-table,import-row-dialog}.tsx`, `app/dev-ux/[[...slug]]/page.tsx`, `app/dev-ux/fixtures.ts`, `app/dev-ux/fixtures-kanali.ts`, `app/dev-ux/fake-convex.ts`, `convex/projekti.ts` (samo dva komentara), `scripts/napredak-check.ts`, `scripts/notifications-check.ts`, `scripts/b10-provera.mjs` (samo putanje);
- `next/link` → `ProjekatLink` (samo uvoz i JSX) u 52 fajla:
  - `components/app/ads/{ads-dashboard,new-campaign-wizard}`, `analytics/` (7 ekrana), `attribution/attribution-dashboard`;
  - `facebook/{facebook-dashboard,fb-comments-moderation}`, `instagram/{comments-moderation,instagram-content-grid,instagram-dashboard,instagram-demographics,publish-composer,post-detail/post-detail-container,post-detail/post-detail-header}`;
  - `leadovi/{call-mode,import-review-table,lead-detail,lead-expanded-row,lead-row-actions,leads-dashboard,leads-map-panel,leads-map,leads-table,leads-today,work-card}`, `napredak/napredak-screen`, `openreply/{automations-dashboard,openreply-dashboard,profile-menu-panel}`;
  - `overview/{command-focus,overview-dashboard,performance-highlights,sync-health-widget,today-block,unconnected-tile}`, `settings/data-and-access`, `system/{kpi-tile,player-card}`, `threads/threads-dashboard`, `youtube/{youtube-dashboard,yt-automations-dashboard}`;
  - `app-sidebar`, `mobile-nav`, `notifications-bell`, `section-nav`, `sync-status` i `app/(app)/[projekat]/leadovi/[companyId]/lead-detail-page-client.tsx`.

  Uz `app-shell` i `user-menu` (ručno) to su 54 fajla iz plana.
- snimci: `docs/projekti/snimci/C08-{kontrolna-enigma,leadovi-enigma,kontrolna-scanme,leadovi-scanme,svi-projekti,nedostupan}-{1440,390}.png`.

**Šta je urađeno:**
- **Rute.** Ekrani projekta su pod `app/(app)/[projekat]/`. Server layout `[projekat]` proverava oblik sluga (`notFound()`), čita `x-panel-rezim` (u panelu i `x-panel-projekat`, kao odbranu) i montira `ProjekatProvider slug rezim` → `AppShell`. `app/(app)/layout.tsx` je samo `AuthGate`, izdvojen iz `AppShell`-a: `ig_code` se parkira i na hubu, a neprijavljen ide na `/login`. `app/(app)/page.tsx` je hub „Svi projekti“: spisak projekata (monogram, ime, uloga) sa vezama na `/<slug>`, gornja traka sa natpisom i menijem korisnika, prazno stanje „Nisi član nijednog projekta.“
- **Odluka rutiranja** je čista funkcija `odluciRutu` u `lib/rutiranje.ts`:
  - globalne putanje se ne diraju;
  - panel: `/S…` → redirect na kanonski oblik, ostalo → rewrite na `/S…` (upit ostaje);
  - hub: `/` ostaje; stara adresa ekrana → `/<ep_projekat>/…` ili `/` (upit ostaje, pa i `ig_code`); kolačić mora da prođe `jeIspravanSlug`; ostalo prolazi do layout-a.
- **Proxy** primenjuje odluku posle postojeće provere prijave. Dev blok `?ux=1` je i dalje prvi; matcher, komentari, `/login` za prijavljene, `ig_code` i `/r/:slug` su bez izmene.
  - Domen razrešava `lib/panel-domen.ts` (`napraviRazresivac`): lokalni i neispravan host = hub bez upita; odgovor i `null` se pamte 60 s; greška ili istek posle 1,5 s = hub sa kešom 10 s; najviše 500 unosa (briše se najstariji); paralelni zahtevi za isti host dele jedan upit.
  - Zaglavlja `x-panel-rezim`/`x-panel-projekat` se postavljaju na svaki zahtev koji prođe proveru prijave i uvek se prepisuju, pa ih klijent ne može podmetnuti.
- **Provider** više nema privremeni izvor (`mojiProjekti[0]`): slug i režim su obavezni. `mojProjekat` → `null` (ne postoji ili nije član) crta „Projekat nije dostupan“: u hubu dugme „Svi projekti“, u panelu „Odjavi se“. U hubu, tek posle potvrde članstva, postavlja `ep_projekat=<slug>; Path=/; Max-Age=31536000; SameSite=Lax[; Secure]`.
- **Front u oba režima.** Svi interni linkovi idu kroz `ProjekatLink`. `router.push` profila firme (tabela, mapa) i ⌘K idu kroz `useProjekatHref`. `useEkranPutanja()` čitaju: boja modula, mrvica, podekrani, aktivna stavka bočne i donje trake, traka podekrana, naslov u `PageHeader`-u i „trenutni ekran“ u ⌘K. `date-range-picker`, `use-lead-filters` i `page-transition` namerno ostaju na punom `usePathname()` (plan §7.8).
- **Razvojni prikaz sa prefiksom:** `/enigma-it/leadovi?ux=1` i `/scanme/leadovi?ux=1` su hub, adresa bez prefiksa je panel „Enigma IT“ (D10), a `/?ux=1&rezim=hub` je „Svi projekti“. Upiti sa `workspaceId` projekta ScanMe dobijaju prazan nalog. Bez `workspaceId` ostaje Enigma, pa skripte sa `resolveFixture(…, {})` rade bez izmene.

**ODLUKE:**
- **Meni korisnika radi i van projekta** (`useProjekatOpciono()`, nov izvoz providera). Na hubu prikazuje samo nalog i „Odjava“. Ime projekta, svežina podataka, „Napredak“ i „Podešavanja“ su po projektu, pa se tamo ne crtaju (veza bi bez projekta vodila na staru adresu).
- **`projekat-nedostupan.tsx` sme da koristi `next/link`** (izuzetak sa razlogom u `lib/linkovi-cuvar.test.ts`): dugme „Svi projekti“ vodi VAN projekta na `/`, a kroz `ProjekatLink` bi `/` postao kontrolna tabla istog, nedostupnog projekta.
- **Lokalni host se proverava u razrešavaču**, ne posebno u proxy-ju: `razresiPanel(host)` sam normalizuje host i za lokalni vraća `null` bez upita (test „localhost bez poziva“ je na razrešavaču). Dodato je i deljenje upita u letu za paralelne zahteve jedne strane, kojeg nije bilo u planu; sinhrona greška upita ne zaglavljuje host (test).
- **Razvojni prikaz: prefiks je svaki prvi segment koji nije ime ekrana**, ne samo projekti iz fiksture. Zato `/nepostoji?ux=1` crta „Projekat nije dostupan“, kao prava aplikacija. `&panel=<slug>` simulira panel drugog projekta.
- **ScanMe u razvojnom prikazu je postojeći „prazan nalog“** (putanja `?prazno=1` u `resolveFixture`): nizovi su prazni i kanali nepovezani, ali zbirni objekti (npr. brojke baze leadova) ostaju iz fiksture Enigme, isto kao danas sa `?prazno=1`. Poseban skup fikstura za ScanMe je van obima koraka.
- **Živi vodič `/sistem?ux=1`** sada stoji u lažnom Convex-u i `ProjekatProvider`-u (panel „Enigma IT“). Pločice, kartica igrača i `PageHeader` prave adresu kroz projekat, pa bi bez providera vodič pao.
- **Hub i „Projekat nije dostupan“ nose `data-module="tabla"`**, kao prijava i pravne strane. Nisu modul, ali B10 §10.1 traži boju mesta na svakoj ruti, a bez nje je `scripts/b10-provera.mjs --samo rute` padao. Monogram projekta na hubu je neutralan; boja projekta (P10) je posao C09.
- **`import-row-dialog.tsx`**: dve veze „Otvori profil firme“ su obični `<a target="_blank">` i nisu bile na spisku plana. Dobile su `useProjekatHref`; inače bi u hubu nova kartica išla preko kolačića umesto direktno u projekat.
- **`projekti.razresiDomen` nije dodat u `DOZVOLJENI_DIREKTNI`**: proxy je serverski kod van `app/`, `components/` i `lib/` koje front čuvar čita, a poziv ide kroz `fetchQuery` (javna funkcija sa `// javno:`).
- **Panel i putanje huba:** po pravilu 2 iz §6 i `/novi` na panel domenu ide pod projekat (`/enigma-it/novi` → 404). Panel nema hub.
- **Redosled u proxy-ju:** domen se razrešava pre provere prijave (kao u planu §7.3), pa i neprijavljen zahtev koristi keš domena. Preusmerenja prijave su nepromenjena.
- **Napredak nema aktivnu stavku u bočnoj traci**, ni u hubu ni u panelu: to je dodatni ekran (`EXTRA_SCREENS`), ne stavka trake. Isto je i na adresi bez prefiksa, kao pre C08.
- **Kompozer objave i detalj objave su dodati u razvojni prikaz**, jer prihvatanje traži da se svaki ekran iz `nav-items.ts` otvori pod oba projekta, a ta dva tamo nisu postojala ni pre C08. Kompozer je ranije izostavljen jer lažni klijent sve akcije razrešava kao `undefined`, a red sa dnevnom dozvolom tada pada. Sada `action()` u `fake-convex.ts` vraća fiksturu sa imenom akcije kad postoji (inače i dalje `undefined`, pa se drugi ekrani ne menjaju). Dodata je jedna fikstura, `instagramPublish.publishingLimit` (povezan: 3 od 100; prazan nalog: nije povezan). Detalj objave je dinamička ruta `instagram/objave/<id>`, kao profil firme; bez sintetičkih podataka crta učitavanje.
- **`scripts/b10-provera.mjs`** (nije u `regresije.mjs`): putanja ekrana sada preskače segment `[projekat]`, a „u ljusci“ su strane pod `(app)/[projekat]`. Nalaz: `--samo rute` nad razvojnim prikazom PROLAZI (ruta bez `data-module` 0, neslaganje 0, ikonice 0); hub `/` je u tabeli „van ljuske“, boja `tabla`.
- **Python je pri izmenama upisao CRLF.** Svi izmenjeni fajlovi su vraćeni na LF (repo ima `eol=lf`), pa diff nosi samo stvarne izmene.
- **Skill `impeccable` je pozvan pre UI koda** (hub i prazno stanje projekta): režim Operate, postojeći tokeni i komponente (`EmptyState`, `Button`, `Skeleton`), bez novog vizuelnog jezika.

**Novi paketi:** nema

**Testovi:**
- `lib/rutiranje.test.ts`: `odluciRutu` za svih 16 redova iz plana §7.2 i svaki ekran u oba režima:
  - panel: `/`, `/leadovi`, `/<slug>/leadovi` → redirect, `/<slug>` → `/`, `/login`, tuđ slug;
  - hub: `/`, stara adresa sa kolačićem i bez njega, OAuth upit `ig_code`, neispravan i rezervisan kolačić, `/<slug>/…`, `/novi`;
  - localhost, globalne putanje u oba režima, greška upita = hub.

  Test „svaki ekran je rezervisano ime“ čita `app/(app)/[projekat]/` (promenjena samo putanja).
- `lib/panel-domen.test.ts` (10): lokalni i neispravni hostovi bez upita; normalizacija; keš 60 s i istek; `null` se pamti; greška = hub sa kešom 10 s; sinhrona greška; istek posle 1,5 s; deljenje upita u letu; više od 500 unosa briše najstariji; ponovo upisan host postaje najnoviji.
- `lib/linkovi-cuvar.test.ts` (5): `next/link` samo u `projekat-link.tsx`, `projekat-nedostupan.tsx` i `components/app/hub/**`; `usePathname(` samo u provideru i tri dozvoljena fajla (komentari se ne broje); spiskovi izuzetaka ne sadrže nepostojeći fajl; provera same provere.
- `scripts/napredak-check.ts`, `scripts/notifications-check.ts`: samo nova putanja strana (`app/(app)/[projekat]/…`).

**Rezultat provere:**
- codegen ✓ (bez promena u `_generated`), typecheck ✓, lint ✓ (0 grešaka; novi i ručno menjani fajlovi bez upozorenja);
- `npx vitest run` ✓ (222/222, 17 fajlova);
- `verify-pristup` ✓ (342 javne: omotačem 329, javno 13, bez omotača 0; front: 15 direktnih poziva, svi sa spiska);
- `regresije.mjs` ✓ (14/14); `npm run build` ✓ (sve strane projekta su `/[projekat]/…`, `/` je hub).
- Razvojni prikaz (Playwright skripta, 1440×900):
  - svaki od 32 ekrana iz `nav-items.ts` pod `/enigma-it/…`, `/scanme/…` i bez prefiksa (96 adresa; detalj objave kao `/instagram/objave/ux_objava_1`), plus profil firme u oba projekta: 98 adresa, sve 200, bez grešaka u konzoli, 0 palih;
  - sve veze u bočnoj traci nose pravi prefiks; aktivna stavka i mrvica odgovaraju ekranu (osim Napretka, vidi ODLUKE);
  - meni korisnika: na hubu samo „Odjava“, u projektu `/scanme/napredak` i `/scanme/settings`; mrvica podekrana vodi na `/scanme/leadovi`;
  - kolačić `ep_projekat=scanme` (Lax, `/`) posle ulaska u ScanMe.

  Dev server je ugašen i port 3105 je slobodan. Ugašen je i Playwright MCP ove sesije (koji `claude.exe` sam podiže iz `--mcp-config`; u koraku nije korišćen). Stablo procesa sesije na kraju sadrži samo ljusku same provere; nijedan `next dev`, skripta, Chromium ni MCP server nije ostao.

**Za Jovana ujutru:**
- **Do mapiranja domena `digital.enigmait.rs` radi kao hub.** `/` je „Svi projekti“, a stare adrese (`/leadovi`, OAuth povratak na `/settings`) vode na poslednji otvoren projekat (kolačić), odnosno na `/` dok ga nema. Domen se mapira u podešavanjima projekta (ekran pravi C11); do tada nema UI-ja za `projekatDomeni`.
- Posle deploya proveri: hub `/` → klik na projekat → `/enigma-it`; `/leadovi` vodi na `/enigma-it/leadovi`; aktivna stavka, mrvica i podekrani; ⌘K skok na ekran; profil firme iz tabele i mape; tuđ ili nepostojeći slug (`/nepostoji`) daje „Projekat nije dostupan“.
- Posle mapiranja domena: `/` je kontrolna tabla Enigme, `/leadovi` ostaje `/leadovi`, a `/enigma-it/leadovi` vodi na `/leadovi`. Proveri i odjavu i prijavu na panel domenu, kao i povezivanje jednog kanala (tačan povratak na `/settings` pravog projekta je posao C12).

## C09 — Birač projekta i ljuska   (2026-10-25 03:53)
**Fajlovi:**
- novi: `components/app/projekat-birac.tsx` (birač u bočnoj traci i na telefonu, sadržaj za ⌘K), `components/app/projekat-znak.tsx` (logo ili inicijali u boji projekta), `components/app/objavljujes-kao.tsx` (red „Objavljuješ kao …“ + `usePotvrdaProjekta`), `lib/boja-projekta.ts`, `lib/pretraga.ts` (`fold`, izdvojen iz ⌘K), `convex/lib/zdravljeVeza.ts`; testovi `lib/boja-projekta.test.ts`, `lib/zdravlje-veza.test.ts`;
- ljuska: `components/app/app-sidebar.tsx`, `app-shell.tsx` (traka od 2 px, birač na telefonu), `command-palette.tsx`, `nav-items.ts` (`ekranZaPrelazak`, `NOVI_PROJEKAT_POSTOJI`), `quiet-boundary.tsx` (opcioni `fallback`), `confirm-dialog.tsx` (opcioni red `kao`);
- backend: `convex/projekti.ts` (`stanjeProjekata`, interni `cekaProjekta`), `convex/notificationsStore.ts` (izdvojen `izracunajStaMeCeka`), `convex/adActionsStore.ts` (`getTargetContext` vraća i nalog i provajdera), `convex/metaAds.ts` (`getMetaAdsAuth` uzima samo Meta nalog), `convex/_generated/api.d.ts` (codegen);
- dijalozi (20 fajlova): `ads/{ad-action-dialog,new-campaign-wizard,new-hook-version-dialog,create-custom-audience-dialog,create-lookalike-audience-dialog}`, `instagram/{publish-composer,comment-thread,mention-card,inbox/chat-view,inbox/inbox-settings-drawer}`, `facebook/fb-comment-thread`, `threads/{threads-composer,threads-replies-moderation}`, `youtube/{yt-upload-dialog,yt-video-edit-dialog,yt-thumbnail-dialog,yt-captions-panel}`, `openreply/{automation-editor-dialog,profile-menu-panel}`, `novosti/publish-readiness-panel`;
- čuvar: `lib/objavljujes-kao-cuvar.test.ts` (svaki dijalog sa spiska plana ima red i potvrdu sa imenom projekta);
- ostalo: `app/globals.css` (tokeni `--projekat*`), `CLAUDE.md` (peta uloga boje), `lib/rutiranje.ts` (`putanjaZaPrelazak`), `lib/rutiranje.test.ts`, `lib/linkovi-cuvar.test.ts` (izuzetak za birač), `scripts/verify-pristup.ts` (`projekti.stanjeProjekata` na spisku), `convex/projekti.test.ts`, fiksture `app/dev-ux/fixtures{,-util,-projekti,-oglasi}.ts`;
- snimci: `docs/projekti/snimci/C09-birac-{zatvoren,otvoren}-{1440,390}.png`, `C09-panel-1440.png`, `C09-cmdk-prebaci-1440.png`, `C09-objava-threads-1440.png`.

**Šta je urađeno:**
- **Birač projekta** (plan C02 §8) zamenjuje natpis „Enigma / Command“ gore levo: znak projekta (logo ili inicijali u boji projekta), ime i `ChevronsUpDown`. Meni ima projekte (znak, ime, tačka stanja veza, broj „šta me čeka“, kvačica i `aria-current` na tekućem), pa „Svi projekti“, „Novi projekat“ (vlasnik platforme, kad postoji `/novi`) i „Podešavanja projekta“. Od 6 projekata ima pretragu bez dijakritike. Tastatura: Enter/razmak otvara i bira, strelice, Home/End, Esc zatvara i vraća fokus na dugme (provereno u pregledaču). U šini je samo znak sa oblačićem, a meni se otvara udesno; na telefonu je dugme od 44 px levo od mrvice i otvara list odozdo (redovi 44 px). U panelu nema menija: znak i ime (na telefonu samo znak sa `aria-label`).
- **Promena projekta čuva ekran**: `putanjaZaPrelazak` skida upit i heš, ekran sa ID-jem (`/instagram/objave/<id>`, `/leadovi/<id>`) svodi na roditelja, a modul koji cilj nema uključen vodi na kontrolnu tablu (`tabla` i `sistem` su uvek uključeni).
- **⌘K** u hubu ima sekciju „Projekti“ sa „Prebaci na <projekat>“ za svaki projekat osim tekućeg (ikonica `ArrowRightLeft`, znak projekta, desno „Projekat“); Enter vodi na isti ekran u tom projektu. U panelu sekcije nema.
- **Boja projekta (P10)**: `--projekat`, `--projekat-tekst`, `--projekat-soft` (`[data-projekat]` računa nijansu na elementu). `izvediBojuProjekta` bira tamni ili svetli tekst (≥ 4,5:1) i drži boju ≥ 3:1 prema strani, pomerajući svetlinu u OKLab-u na stranu manjeg pomaka. Boja se vidi samo na biraču, znaku projekta, traci od 2 px na vrhu ljuske (u oba režima) i u redu „Objavljuješ kao …“. `node scripts/contrast-check.mjs --strogo` prolazi. U `CLAUDE.md` je dopisan pasus o petoj ulozi.
- **`projekti.stanjeProjekata`** (`prijavljenQuery`, vreme od klijenta): za najviše 20 članstava daje zdravlje veza (čista funkcija `convex/lib/zdravljeVeza.ts`) i `ceka` iz istog pomoćnika kao zvono (`izracunajStaMeCeka`, izdvojen bez promene ponašanja `staMeCeka`). Svaki projekat računa „šta me čeka“ kroz `ctx.runQuery` sa svojim delom budžeta čitanja (`transactionLimits`), pa projekat koji ga prekorači dobija „—“ umesto da obori ceo upit. Birač čita statistiku tek dok je meni otvoren.
- **„Objavljuješ kao …“**: svaki dijalog koji objavljuje, šalje ili troši novac pokazuje znak projekta, nalog i ime projekta tik iznad potvrde, a potvrda nosi sufiks „· <kratko ime ili ime projekta>“ (npr. „Potvrdi i objavi · Enigma IT“). Nalog se čita iz veze projekta (`accountHandle`, ime stranice, naziv kanala). Kod oglasa red pokazuje nalog nad kojim radnja zaista ide: akcija nad kampanjom/setom/oglasom i nova verzija hooka — nalog cilja (`getTargetContext` sada vraća i `accountName` i `provider`); nova kampanja — nalog izabran u čarobnjaku; publike — prvi Meta nalog oglasa projekta, isti red, isti indeks i isti provajder kojim ga bira `getMetaAdsAuth`.
- **Razvojni prikaz**: treći projekat „Klijent d.o.o.“ (`WS_KLIJENT`, klijentski, moduli leadovi/novosti/analitika, ljubičasta), fikstura `stanjeProjekata` (Enigma: greška veze i broj iz zvona; ScanMe: bez veza, 0; klijent: veze rade, broj „—“).

**ODLUKE:**
- **Inicijali iz punog imena, ne iz `kratkoIme ?? ime`.** Tekst plana (§8.1) kaže `kratkoIme ?? ime`, ali sve tri skice u istom planu pokazuju inicijale punog imena (`[EI]`, `[SM]`, `[KD]`); sa kratkim imenom „Enigma“ znak bi bio „EN“. Jedna reč sa velikim slovom u sredini daje oba („ScanMe“ → „SM“). Kratko ime se koristi samo kao sufiks na potvrdi.
- **Prag isticanja tokena je 14 dana, ne 7.** Plan kaže „7 dana“ i „pragovi isti kao `lib/token-expiry.ts`“; tamo je 14 dana. Uzet je postojeći prag (jedno pravilo u aplikaciji); test proverava jednakost konstanti. Convex ne uvozi `lib/` aplikacije (`@/` putanje), pa su pragovi preslikani u `convex/lib/zdravljeVeza.ts`, a test čuva jednakost.
- **Zdravlje veza:** pad prolaza se ne računa ako je posle njega stiglo nešto svežije (isto pravilo kao zvono); prolaz u toku kraći od 15 min i veza bez ijednog prolaza nisu upozorenje; veza u prekidu (`disconnecting`) se ne broji.
- **Preko 20 projekata** `stanjeProjekata` vraća stanje veza za prvih 20, a `ceka: null` za sve (plan: „preko 20 → null“); projekat bez reda birač crta kao nepoznat (siva tačka, „—“).
- **Budžet čitanja po projektu** (24.000 dokumenata i 2.400 opsega indeksa, deljeno na broj projekata) nije bio u planu: bez njega bi nekoliko velikih projekata prešlo granicu transakcije (32.000) i oborilo ceo upit. Test pravi projekat od 1.300 telefona među 20 i proverava da samo on dobije „—“.
- **Arhiviran projekat nije u biraču ni u ⌘K** (ostaje u „Svi projekti“); tekući se vidi i kad je arhiviran. Plan to ne pominje.
- **Tekući projekat u meniju samo zatvara meni** (dugme, `aria-current`), ne vodi ponovo na isti ekran (to bi obrisalo upit adrese).
- **Uloge:** popover base-ui je `dialog` (sa pretragom i `role="menu"` unutra), pa dugme ima `aria-haspopup="dialog"`, ne `"menu"` kao u skici: meni sa poljem za pretragu ne može biti čist `role="menu"`.
- **Šina:** zaglavlje šine (64 px) ima znak projekta (32 px) i dugme za proširenje (20 × 28 px) jedno pored drugog. Izmereno na 1536×695: navigacija u šini i dalje staje bez klizača (538/538 px).
- **„Novi projekat“** se ne vidi dok C11 ne postavi `NOVI_PROJEKAT_POSTOJI = true` u `nav-items.ts` (D19); uslov za vlasnika platforme je već u kodu.
- **`next/link` u biraču** (izuzetak sa razlogom u `lib/linkovi-cuvar.test.ts`): veze vode na drugi projekat i na hub `/`, a `ProjekatLink` bi im dodao prefiks tekućeg projekta.
- **⌘K čita spisak projekata samo dok je otvoren, u hubu, iza `QuietBoundary`** (pad spiska ne obara paletu); zato je `QuietBoundary` dobio opcioni `fallback`, a birač piše „Spisak projekata trenutno nije dostupan.“ uz prečice koje i dalje rade.
- **Sajt (novosti):** red kaže „Objavljuješ na sajtu · <projekat>“ bez domena, jer `mojProjekat` ne vraća `sajtovi` (podešavanja sajtova su posao C11). Red i sufiks su u `publish-readiness-panel.tsx`, gde je dugme „Objavi post“ (plan je naveo `novosti-editor.tsx`, koji to dugme nema).
- **Instagram i Threads objava:** red stoji i na strani kompozera (uz dugme koje otvara potvrdu) i u samom dijalogu potvrde, preko novog opcionog polja `kao` u `ConfirmDialog`-u.
- **Javni odgovori:** `post-comments-panel.tsx` i `fb-post-comments-panel.tsx` nisu menjani, jer formu za odgovor crtaju `comment-thread.tsx` i `fb-comment-thread.tsx`, gde red već stoji (bez dupliranja). OpenReply automatizacija pokazuje red za Instagram, Facebook ili oba, prema izabranoj platformi.
- **Radnja prati dugme:** „Zakazuješ“ kad je zakazivanje uključeno, „Brišeš“ u potvrdi brisanja YouTube videa, „Otpremaš“ za upload; kod oglasa „Pauziraš / Pokrećeš / Menjaš budžet / Dupliraš / Praviš“. Natpisi potvrde su zadržani (samo su dobili sufiks), stanja učitavanja („Šaljem…“) nisu menjana.
- **Radnici:** tri radnika (Sonnet) su ugradili red u dijaloge po grupama (objava; odgovori i poruke; oglasi). Svaki diff sam pročitao; posle njih sam premestio red za novosti u panel sa dugmetom, dodao red u dijaloge potvrde i tačan nalog u sve dijaloge oglasa.
- **`getMetaAdsAuth` sada uzima samo Meta nalog** (`provider: "meta_ads"`). Ranije je za publike uzimao prvi nalog oglasa projekta bilo kog provajdera, pa bi projekat sa Google i Meta nalogom mogao da pošalje Meta poziv sa Google nalogom. Svi ostali pozivi `getAccounts` u Meta kodu već filtriraju provajdera; ova jedna linija je deo zaštite od pogrešnog naloga koju korak traži, a za projekat sa samo Meta nalogom (danas Enigma) ponašanje je isto. Dijalozi publika pokazuju isti nalog (prvi Meta nalog istim indeksom), a čuvar to proverava.
- **Razvojni prikaz, dve ispravke fikstura nađene pri proveri:** Facebook veza je ime stranice imala u `accountHandle`, a pravi kod ga čuva u `externalIdAlt` (`facebookStore.ts`), pa je red pokazivao „—“; fikstura je ispravljena (komponenta je bila tačna). Panel titlova je pucao jer lažni klijent za akciju `ytCaptions.listCaptions` bez fiksture vraća `undefined`; dodata je fikstura (video bez titlova).

**Novi paketi:** nema

**Testovi:**
- `lib/boja-projekta.test.ts` (9): heks vrednosti teksta jednake tokenima iz `globals.css`; neispravan hex → `null`; svetla boja ostaje sa tamnim tekstom; srednje tamna dobija svetli tekst; pretamna se posvetli; boja kod koje nijedan tekst ne prolazi se pomeri; mreža od 216 boja — svaka prolazi oba uslova; `stilProjekta` daje tokene; inicijali.
- `lib/zdravlje-veza.test.ts` (6): pragovi jednaki frontu; bez veza; ok i veza bez prolaza; greška (status, pao prolaz, prevaziđen pad); upozorenje (token, zaglavljen prolaz, stari podaci; kratak prolaz u toku je ok); najgora veza pobeđuje.
- `lib/rutiranje.test.ts` (+7): `putanjaZaPrelazak` čuva ekran i podekran, koren projekta, skida upit i heš, ID pada na roditelja, nepoznat ekran → tabla, isključen modul → tabla (tabla, podešavanja i napredak uvek), rešavač se samo zove.
- `lib/objavljujes-kao-cuvar.test.ts` (25): svih 20 fajlova sa spiska plana (§8.6, novosti kroz panel spremnosti) imaju `<ObjavljujesKao kanal=…>`, `usePotvrdaProjekta()` i `potvrda(…)`; dva panela komentara crtaju formu kroz komponentu sa spiska; dijalozi potvrde Instagram i Threads objave nose red; dijalozi oglasa prosleđuju tačan nalog (cilj, izabran nalog, prvi Meta nalog istim indeksom i provajderom kao akcija, što proverava i `getMetaAdsAuth`).
- `convex/projekti.test.ts` (+4): `stanjeProjekata` samo za moje projekte, redom članstva, broj jednak zvonu, neprijavljen odbijen; pravila zdravlja nad bazom (greška, upozorenje, prekid se ne broji); preko 20 → 20 redova i `ceka: null`, sa tačno 20 broj postoji; prekoračen deo budžeta → samo taj projekat „—“.

**Rezultat provere:**
- codegen ✓, typecheck ✓, lint ✓ (0 grešaka; broj upozorenja u svakom izmenjenom fajlu isti kao u HEAD, novi fajlovi bez upozorenja);
- `npx --no-install vitest run` ✓ (273/273, 20 fajlova);
- `verify-pristup` ✓ (343 javne: omotačem 330, javno 13, bez omotača 0; front: 17 direktnih poziva, svi sa spiska);
- `regresije.mjs` ✓ (14/14), `npm run build` ✓, `node scripts/contrast-check.mjs --strogo` ✓.
- Dijalozi u pregledaču (Playwright, `/enigma-it/…?ux=1`), pročitan red i potvrda iz DOM-a:
  - Instagram objava: „Objavljuješ kao @test.salon · Enigma IT“ (strana kompozera); Threads: dijalog potvrde („Potvrdi i objavi · Enigma“) i odgovor u moderaciji („Odgovaraš kao @test.salon“, „Pošalji odgovor · Enigma“);
  - YouTube: upload („Otpremaš kao Test Salon kanal“, „Pošalji na YouTube · Enigma“), izmena videa („Sačuvaj izmene · Enigma“), brisanje („Brišeš kao …“, „Obriši video zauvek · Enigma“), sličica („Postavi · Enigma“), titlovi („Pošalji titl za 400 jedinica · Enigma“);
  - Facebook odgovor („Odgovaraš kao Test Salon stranica“, „Pošalji · Enigma“); OpenReply nova automatizacija („Šalješ kao @test.salon“, „Napravi automatizaciju · Enigma“); ledolomci i meni iz inbox-a („Sačuvaj i objavi na Instagram · Enigma“); novosti („Objavljuješ na sajtu · Enigma IT“, „Objavi post · Enigma“);
  - oglasi: pauza, aktivacija, promena budžeta, „Pauziraj gubitnika“ i nova verzija hooka („… na nalogu Test Salon — Meta nalog · Enigma IT“), obe publike („Praviš na nalogu Test Salon — Meta nalog“, „Kreiraj publiku / Kreiraj Lookalike · Enigma“).
- Razvojni prikaz (Playwright): hub `/enigma-it/leadovi?ux=1` na 1440×900, 1536×695 (i šina) i 390×844, panel `/leadovi?ux=1` (1440 i 390), ⌘K na `/enigma-it/analytics?ux=1`, potvrda objave na Threads-u, kompozer Instagram objave; ScanMe traka i znak u zelenoj boji projekta. Konzola bez grešaka i upozorenja. Dev server je ugašen, port 3105 slobodan, Playwright otpaci iz `docs/projekti/snimci/` obrisani.

**BLOKADA (samo vizuelna provera, ne prihvatanje):** pet površina sa spiska nisu mogle da se otvore u razvojnom prikazu, jer za njih nema sintetičkih podataka (ekran ostaje na učitavanju ili praznom stanju): odgovor na Instagram komentar (`comment-thread.tsx`), odgovor na spominjanje (`mention-card.tsx`), poruka u razgovoru inbox-a (`chat-view.tsx`), meni profila na ekranu OpenReply automatizacija (`profile-menu-panel.tsx`) i treći korak čarobnjaka nove kampanje (`new-campaign-wizard.tsx`, traži popunjena prva dva koraka). Red i potvrda su u kodu svih pet (čuvar `lib/objavljujes-kao-cuvar.test.ts`, typecheck), ali ih niko nije video na ekranu; pravljenje fikstura za komentare, spominjanja, razgovore i meni je van obima ovog koraka.

**Za Jovana ujutru:**
- Posle deploya u hubu: klik na „Enigma IT“ gore levo → meni sa projektima; prebaci na ScanMe sa Analitike (treba da ostaneš na Analitici), probaj tastaturom (Enter, strelice, Esc). Ctrl+K → „Prebaci na ScanMe“.
- Tačka i broj u meniju dolaze iz pravih veza i zvona: proveri da Enigma pokazuje istu brojku kao zvono i da je tačka crvena ili žuta samo kad nešto zaista ne radi.
- Otvori po jedan dijalog: nova Instagram objava (potvrda), Threads objava, YouTube upload, odgovor na komentar, poruka u inbox-u, pauza kampanje i promena budžeta — svaki treba da kaže „… kao <nalog> · Enigma IT“, a potvrda „… · Enigma IT“. Dijalozi oglasa pokazuju nalog nad kojim radnja ide. Ručno pogledaj i pet površina iz BLOKADE (odgovor na IG komentar i spominjanje, poruka u inbox razgovoru, meni profila, treći korak nove kampanje).
- Na panel domenu (kad ga mapiraš) gore levo treba da stoji samo znak i ime, bez menija.

## C10 - Plan: podešavanja, brend, env, OAuth, kvote   (2026-10-25 04:39)
**Plan korak.** Plan je upisan u `docs/projekti/planovi/C10.md`. Kod nije menjan.

## C11 — Podešavanja i brend projekta, čarobnjak   (2026-10-25 05:25)
**Fajlovi:**
- backend:
  - novi: `convex/podesavanjaStore.ts`, `convex/lib/podesavanjaPravila.ts`, `convex/lib/moduli.ts`, `convex/lib/sabloniLeadova.ts`;
  - izmenjeni: `convex/projekti.ts` (`javniBrend`, `proveriSlug`, `sajtovi` u `mojProjekat`, pravila polja iz `podesavanjaPravila`), `convex/lib/projekatPolja.ts` (`sajtovi` u odgovoru), `convex/schema.ts` (indeksi `workspaces.by_logo` i `by_favicon`), `convex/_generated/api.d.ts` (codegen).
- front:
  - novi: `components/app/settings/{projekat-panel,mozak-panel,izbor-boje,slika-brenda}.tsx`, `components/app/hub/novi-projekat.tsx`, `app/(app)/novi/page.tsx`, `app/login/login-client.tsx` (dosadašnji sadržaj `app/login/page.tsx`, premešten bez izmene osim imena komponente i propa `brend`), `lib/slug-predlog.ts`;
  - izmenjeni: `app/login/page.tsx` (sada serverska strana sa brendom i `generateMetadata`), `app/(app)/[projekat]/layout.tsx` (`generateMetadata`), `app/(app)/[projekat]/settings/page.tsx` (`?tab=`, jezičci Projekat i Mozak), `app/(app)/[projekat]/{napredak,novosti,rules}/page.tsx` (samo naslov), `components/app/system/brand-moment.tsx`, `components/app/projekat-znak.tsx` (veličina `lg`), `components/app/projekat-provider.tsx` (`vrsta`, `sajtovi`, `useModulUkljucen`), `components/app/nav-items.ts` (`NOVI_PROJEKAT_POSTOJI = true`, `vidljiveSekcije`, `donjaTraka`), `components/app/{app-shell,app-sidebar,mobile-nav,command-palette,projekat-birac}.tsx`, `components/app/hub/svi-projekti.tsx`, `lib/rutiranje.ts`, `lib/boja-projekta.ts` (`PREDLOZI_BOJA`);
  - razvojni prikaz: `app/dev-ux/[[...slug]]/page.tsx` (`/novi`, prijava sa `&panel=`), `app/dev-ux/fixtures-projekti.ts`, `app/dev-ux/fake-convex.ts`.
- čuvar: `scripts/verify-pristup.ts` (`projekti.javniBrend` i `projekti.proveriSlug` na spisku, sa razlogom).
- testovi: novi `convex/podesavanja-c11.test.ts`, `convex/javni-brend.test.ts`, `lib/podesavanja-pravila.test.ts`; dopunjeni `convex/projekti.test.ts`, `lib/rutiranje.test.ts`; `convex/projekatTest.pomoc.ts` (`odbijeno` prima i `not_found`).
- snimci: `docs/projekti/snimci/C11-podesavanja-projekat-{1440,1536,390}.png`, `C11-podesavanja-mozak-{1440,1536}.png`, `C11-carobnjak-korak1-{1440,390}.png`, `C11-carobnjak-korak2-1440.png`, `C11-carobnjak-kanali-1440.png`, `C11-prijava-panel-scanme-1440.png`, `C11-hub-novi-projekat-1440.png`.

**Šta je urađeno:**
- **Podešavanja** imaju jezičak u adresi (`?tab=`). Bez parametra se otvara „Integracije“, jer OAuth povratak i `ig_code` traže karticu veza. Birač projekta vodi na `?tab=projekat`. Novi jezičci:
  - **Projekat**: Identitet (ime, kratko ime, boja sa šest predloga i poljem `#rrggbb`, vrsta; jedno `primary` „Sačuvaj izmene“), Znak projekta (pregled znaka i trake, logo, ikonica; čuvaju se odmah), Domeni panela (samo vlasnik platforme), Sajtovi, Moduli (prekidač po modulu, „Uključi sve“). Urednik i posmatrač vide iste podatke kao tekst, a prekidači su im onemogućeni.
  - **Mozak**: pet polja (ponuda, kome prodajemo, ton, šta ne govorimo, skripte), do 4.000 znakova, lepljiva traka sa „Sačuvaj“; ostale uloge samo čitaju.
- **Backend** (`convex/podesavanjaStore.ts`):
  - `procitaj` (owner), `mozak` (svaki član);
  - `uploadUrlBrenda`, `postaviSlikuBrenda`, `sacuvajSajtove`, `sacuvajModule`, `sacuvajMozak` (owner);
  - `dodajDomen`/`ukloniDomen` (owner koji je i vlasnik platforme).

  Pravila polja su čiste funkcije u `convex/lib/podesavanjaPravila.ts`, ista na frontu i u mutaciji; `azurirajProjekat` i `kreirajProjekat` ih sada koriste (poruke su iste).
- **Logo i ikonica** idu kroz Convex storage:
  - logo: PNG/JPG/WebP do 512 KB; ikonica: PNG/ICO do 128 KB; SVG nije dozvoljen;
  - server prihvata samo fajl otpremljen u poslednjih 10 min koji nije logo ni ikonica nijednog projekta (provera preko indeksa), a stari fajl briše posle zamene;
  - klijent unapred proverava i dimenzije (logo ≥ 64 px, ikonica kvadratna 32–512 px).

  Birač, ⌘K, panel i „Objavljuješ kao …“ prikazuju logo bez izmene, jer `ProjekatZnak` već crta `logoUrl`.
- **Prijava po domenu**: `app/login/page.tsx` je serverska strana. Na panel domenu (`x-panel-rezim: panel` iz proxy-ja) zove javni `projekti.javniBrend({ host })`, koji vraća samo ime, boju i logo, i to samo za mapiran host koji nije arhiviran; istek je 1,5 s, a kvar daje podrazumevan izgled. `BrandMoment` tada crta znak i ime projekta, a aurora prelazi u boju projekta. Naslov je „Prijava · <projekat>“, ikonica je logo.
- **Naslov i favicon po projektu**: `generateMetadata` u layout-u `[projekat]` (sesija iz `convexAuthNextjsToken`, `mojProjekat`, istek 1,5 s) daje šablon „%s · <projekat>“, podrazumevano „<projekat> · Enigma Digital“, i ikonicu (favicon ili logo).
- **Moduli**: isključen modul nestaje iz bočne trake (prazna grupa nestaje cela), iz liste „Više“ i iz ⌘K (ekrani, radnje, nedavno), a donja traka popunjava njegovu ćeliju sledećim uključenim modulom. `ModulCuvar` u ljusci preusmerava rutu isključenog modula na kontrolnu tablu. `modulUkljucen` je jedna funkcija (`convex/lib/moduli.ts`) koju koristi i `putanjaZaPrelazak`.
- **Čarobnjak `/novi`** (samo vlasnik platforme; ostali vide „Nove projekte pravi vlasnik platforme.“):
  1. Osnovno: ime, adresa predložena iz imena i proverena uživo kroz `projekti.proveriSlug`, vrsta. Projekat nastaje odmah.
  2. Izgled: boja i logo, uz „Preskoči“.
  3. Spremnost kanala: 8 kanala sa stanjem iz `connections.list`, „Otvori projekat“ i „Poveži kanale“ (→ podešavanja).

  Novi projekat je odmah (reaktivno) u biraču i na hubu. Hub ima dugme „Novi projekat“ za vlasnika platforme, a `NOVI_PROJEKAT_POSTOJI = true` pali stavku u biraču (D19).

**ODLUKE:**
- **Odluke iz plana C10** (C10 nije menjao fajlove, pa ih ovde upisuje C11; pun tekst je u `docs/projekti/planovi/C10.md` §0.2):
  - E1: vrstu projekta menja samo vlasnik platforme, i u UI-ju (D7).
  - E2: C11 pali `NOVI_PROJEKAT_POSTOJI` (D19).
  - E3: isti spoljni nalog u dva projekta: Instagram, Facebook stranica i Threads se odbijaju, ostali kanali dobijaju upozorenje; posao C12.
  - E4: osnivački projekat je najstariji red u `workspaces`.
  - E5: granice izmene budžeta (5 / 5.000 / EUR) važe za svaki projekat; gornja granica nove kampanje bez vrednosti znači da je pravljenje isključeno.
  - E6: ime pošiljaoca bez vrednosti je ime projekta (osnivački: iz `EMAIL_FROM`); OTP mejlovi se ne menjaju.
  - E7: `META_CAPI_TEST_EVENT_CODE` važi samo za osnivački projekat.
  - E8: `OAUTH_CALLBACK_ORIGIN` čita samo Convex.
  - E9: nova env promenljiva `HUB_HOSTS` (Convex).
  - E10: povratak OAuth-a sa klijenta je samo origin; putanju gradi server.
  - E11: javni brend vraća samo ime, boju i logo, samo za mapiran host; na prijavi je ikonica logo.
  - E12: logo i ikonica bez SVG-a; fajl mora biti nov (10 min) i ničiji.
  - E13: `?tab=` u podešavanjima, podrazumevano „Integracije“.
  - E14: pozvan korisnik dobija članstvo i ulogu iz pozivnice (C13); korisnik iz `ALLOWED_EMAILS` bez pozivnice nema projekat.
  - E15: bootstrap admina ide u osnivački projekat; `WORKSPACE_SLUG` se briše (C13).
  - E16: pozivnica nosi ulogu; `membersStore.promeniUlogu` (C13).
  - E17: Meta procenat aplikacije se ne deli na projekte.
  - E18: YouTube brojači po pacifičkom danu (C13).
  - E19: moduli su izgled, ne pravo pristupa; backend ne zabranjuje podatke isključenog modula.
  - E20: ključevi modula su u `convex/lib/moduli.ts`, a test čuva jednakost sa `MODULE_KEYS`.
- **Indeksi `workspaces.by_logo` i `by_favicon`** nisu bili u planu. Provera „fajl nije brend drugog projekta“ u javnoj mutaciji ne sme da prolazi kroz sve projekte (pravilo runa), a Convex ume da indeksira ugnežđena polja.
- **Odbijen fajl brenda se ne briše**, jer možda nije naš (svako ko zna ID može da ga pošalje). Fajl koji klijent otpremi, a server odbije, ostaje bez vlasnika; to je retko, jer klijent iste uslove proverava unapred.
- **Isti fajl ne može biti i logo i ikonica**, ni u istom projektu: zamena jednog bi obrisala drugi.
- **Logo i ikonica se čuvaju odmah**, van „Sačuvaj izmene“: otpremanje je radnja, a forma ima jedno `primary` dugme na ekranu.
- **Raspored jezička Projekat**: Identitet i Znak projekta su u dve kolone, ime i kratko ime u jednom redu, a adresa je napomena ispod imena.
  - Prva verzija (sve u jednoj koloni) spuštala je „Sačuvaj izmene“ ispod pregiba na 1536 × 695; sada staje (snimak `C11-podesavanja-projekat-1536.png`).
  - Brojač kratkog imena je „6/24“ umesto `CharCount`-a, koji pri granici od 24 znaka stalno upozorava.
- **Mozak**: pet polja ne mogu da stanu iznad pregiba, pa je traka sa „Sačuvaj“ lepljiva uz dno (na telefonu iznad donje navigacije).
- **Postojeći jezičci (Integracije, Pristup, Istorija, Moderacija, Napredak) i dalje se prikazuju svim ulogama.** Sakrivanje po ulogama je posao C13; nove sekcije C11 već poštuju uloge (menja samo vlasnik, domene samo vlasnik platforme).
- **`procitaj` vraća domene i vlasniku projekta koji nije vlasnik platforme**, jer sopstveni domeni nisu tajna. UI crta sekciju Domeni samo vlasniku platforme, a backend samo njemu dozvoljava izmenu.
- **Serverski Convex poziv u `generateMetadata`** (layout `[projekat]` i prijava): D8 kaže da aplikacija nema serverske Convex pozive za članstvo. Ovde se poziv koristi samo za naslov i ikonicu, sa sesijom korisnika i istekom 1,5 s, a svaki kvar daje podrazumevani naslov. Članstvo i dalje proverava provider.
- **Naslovi strana**: „Napredak“, „Novosti i članci“ i „Pravila i zaštita budžeta“ više nemaju „· Enigma Command Center“; sufiks daje šablon projekta. Root naslov (hub) ostaje „Enigma Command Center“, a čarobnjak je „Novi projekat · Enigma Digital“.
- **Čarobnjak**:
  - projekat nastaje posle prvog koraka (logo traži projekat, a prekid ne gubi rad);
  - korak „Leadovi“ se ne prikazuje dok je „Prazno“ jedini šablon (`SABLONI_LEADOVA`), pa čarobnjak danas ima 3 koraka; kad C14 doda šablone, korak se sam pojavi;
  - iz čarobnjaka se kanali ne povezuju (OAuth vodi na podešavanja), a spremnost broji samo kanale sa spiska.
- **⌘K**: ekrani, radnje i „Nedavno“ isključenog modula se ne nude. Zadaci iz zvona i misije ostaju, jer nose posao koji čeka.
- **Predlozi boja** (`PREDLOZI_BOJA`, 6): bez žute i zlatne (nagrada) i bez crvene (greška); svaka prolazi kontrast bez pomeranja (test).
- **Hub „Svi projekti“**: monogrami ostaju neutralni (izgled huba je posao C16); dodato je samo dugme „Novi projekat“.
- **Razvojni prikaz**:
  - lažni klijent sada i za mutaciju vraća fiksturu sa njenim imenom kad postoji (do sada `undefined`);
  - jedina takva fikstura je `projekti.kreirajProjekat`, koja „pravi“ ScanMe, pa se koraci 2 i 3 vide nad pravim oblikom podataka;
  - prijava na panel domenu se simulira sa `/login?ux=1&panel=<slug>`.
- **Prettier**: pri jednoj popravci slučajno je preformatirao `components/app/hub/svi-projekti.tsx` (repo nema prettier konfiguraciju). Fajl je vraćen na HEAD (`git show`, samo čitanje), a izmena ponovo upisana ručno, pa diff nosi samo stvarnu izmenu.

**Novi paketi:** nema

**Testovi:**
- `lib/podesavanja-pravila.test.ts` (node):
  - ime i kratko ime;
  - boja: normalizacija, 6 loših oblika, predlozi prolaze kontrast;
  - domen: velika slova, završna tačka, punycode; 13 loših unosa (protokol, putanja, port, `@`, razmak, bez TLD-a, crtice, `..`, lokalni hostovi, prazno); duži od 253 znaka;
  - sajtovi: `www.`, duplikati, 20 prolazi a 21 ne, loš unos;
  - moduli: `null` = svi, ceo skup → `null`, redosled i duplikati; `tabla`, `sistem` i nepoznat se odbijaju;
  - mozak: 4.000 prolazi, 4.001 ne;
  - slike: tipovi, granice veličine, SVG, prazan fajl;
  - predlog adrese: dijakritika, „Đ“, crtice, 40 znakova.
- `convex/podesavanja-c11.test.ts` (edge-runtime):
  - urednik i posmatrač dobijaju `forbidden` za svih 8 izmena i za `procitaj`, a projekat ostaje isti;
  - mozak čitaju svi članovi, a nečlan i neprijavljen ne; vlasnik A ne menja B;
  - sajtovi, moduli i mozak se upisuju normalizovano i brišu praznim; `mojProjekat` vraća sajtove;
  - vlasnik klijentskog projekta ne menja vrstu (D7), ali menja brend;
  - domeni: samo vlasnik platforme, host jedinstven u celoj bazi („već dodat“ / „drugom projektu“), najviše 5, tuđ domen se ne uklanja, razrešavanje domena prati upis i brisanje;
  - slike: postavljanje, zamena briše stari fajl, `null` uklanja; SVG i prevelika ikonica se odbijaju (fajl ostaje); star fajl (11 min) se odbija; tuđ logo i sopstveni logo kao ikonica se odbijaju.
- `convex/javni-brend.test.ts`:
  - radi bez prijave, a ključevi odgovora su tačno `ime`, `boja`, `logoUrl`;
  - u odgovoru nema sluga, ID-a, kratkog imena, sajtova, mozga ni podešavanja;
  - projekat bez brenda daje `null` boju i logo;
  - nepoznat, lokalni i neispravan host i arhiviran projekat daju `null`.
- `convex/projekti.test.ts` (+2): `proveriSlug` (slobodan, normalizacija, zauzet, rezervisan, neispravan; vlasnik klijentskog projekta i neprijavljen se odbijaju); napravljen projekat je odmah u `mojiProjekti` kao `owner`.
- `lib/rutiranje.test.ts` (+4): `MODULI_PROJEKTA` = `MODULE_KEYS` bez table i podešavanja; `modulUkljucen`; bočna traka bez isključenih modula i praznih grupa; donja traka uvek ima tri ćelije (popuna), a sa samo kontrolnom tablom jednu.

**Rezultat provere:**
- codegen ✓, typecheck ✓;
- lint ✓: 0 grešaka; u izmenjenim i novim fajlovima jedino je staro upozorenje `adminLozinkaGreska` u premeštenom kodu prijave;
- `npx vitest run` ✓ (332/332, 23 fajla);
- `verify-pristup` ✓ (354 javne: omotačem 340, javno 14, bez omotača 0; front: 21 direktan poziv, svi sa spiska);
- `regresije.mjs` ✓ (14/14); `npm run build` ✓ (uključuje proveru pokrivenosti brisanja; `/novi` i `/login` su dinamičke).
- Razvojni prikaz (Playwright, 1440×900, 1536×695, 390×844):
  - podešavanja → Projekat: izbor boje menja pregled i pali „Sačuvaj izmene“; Mozak; prijava na panel domenu ScanMe;
  - čarobnjak: korak 1 sa predlogom adrese „djordjevic-pekara“ i proverom „Slobodna“, korak 2, korak 3; hub sa dugmetom „Novi projekat“;
  - u projektu „Klijent d.o.o.“ bočna traka ima samo tablu, leadove, novosti i analitiku, a `/klijent-doo/instagram` preusmerava na kontrolnu tablu.

  Konzola je bez grešaka i upozorenja; jedno upozorenje Base UI o dugmetu kao linku je nađeno i ispravljeno (`nativeButton={false}`). Dev server je ugašen (port 3105 slobodan), a otpaci Playwright-a iz `docs/projekti/snimci/` obrisani.

**Za Jovana ujutru:**
- Convex deploy dodaje indekse `workspaces.by_logo` i `by_favicon` (mala tabela, bez čekanja).
- Posle deploya, Podešavanja projekta Enigma IT → Projekat:
  - promeni boju i sačuvaj: traka na vrhu i birač treba da promene boju;
  - otpremi logo i ikonicu: pojave se u biraču i kao ikonica kartice pregledača;
  - dodaj domen `digital.enigmait.rs` (i u Vercel, ako već nije);
  - upiši sajtove `enigmait.rs` i `digital.enigmait.rs`.
- Odjavi se na mapiranom panel domenu: prijava treba da pokaže znak i ime projekta. U hubu ostaje „Enigma / Command Center“.
- Hub → „Novi projekat“: napravi ScanMe (adresa `scanme`), boja, logo. Projekat se odmah pojavi u biraču i na hubu.
- Isključi jedan modul u nekom projektu: nestaje iz bočne trake, donje trake i ⌘K, a njegova adresa vodi na kontrolnu tablu.
- Mozak projekta: upiši ponudu i kupca (čitaće ih skillovi posle C14).
