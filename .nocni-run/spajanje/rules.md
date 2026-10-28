# Pravila noćnog runa SPAJANJE — važe za svaki korak

Radiš nenadzirano i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/SPAJANJE-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto).
3. Nastavi.

Ne improvizuj tiho.

## Kontekst
Ovaj run spaja dve Jovanove interne aplikacije u jednu:
- **Enigma** (ovaj repo, „Enigma Command Center“): marketing panel sa projektima, leadovima, kanalima (Instagram, Facebook, Threads, YouTube), oglasima, analitikom, OpenReply-em, pravilima, novostima i napretkom. Produkcija je `digital.enigmait.rs`.
- **Devotion** (repo `../notion-clone`, ovde samo kao snimak): radni prostor tima sa dokumentima, zadacima, idejama, porukama, beleškama, Mojim danom i Inbox-om.

Domaćin je Enigma. Devotionov radni deo ulazi u nju kao imenski prostor `prostor`. Cilj je da ništa ne nestane: spajaju se samo duplikati, a svaka Devotion funkcija dobija mesto (`docs/SPAJANJE-PLAN.md` §6). Ovo je samo web; telefon dolazi kasnije.

## Izvori istine
- `docs/SPAJANJE-PLAN.md`: odluke O1–O12, predlozi P1–P28, mapa backenda (§4), mapa weba (§5), paritet (§6), koraci (§8).
- `docs/spajanje/planovi/<ID>.md`: tehnički planovi plan koraka (S01, S07, S18).
- `docs/SPAJANJE-PROGRESS.md`: šta su prethodni koraci uradili, njihove ODLUKE i BLOKADE.
- **Snimak Devotiona:** `.nocni-run/spajanje/tmp/devotion/` (main @ c05c40f, bez telefona), sa mapom `.nocni-run/spajanje/tmp/devotion/MAPA.md`.
  - Snimak je samo za čitanje. Kopiraš iz njega, ali ga ne menjaš.
  - Folder je u `.gitignore`, pa ga alat **Grep** može preskočiti. Koristi Read sa tačnom putanjom, Glob, ili u terminalu `rg --no-ignore "<izraz>" .nocni-run/spajanje/tmp/devotion` (u PowerShell-u i `Get-ChildItem -Recurse | Select-String`).
  - Pravi Devotion repo (`../notion-clone`) se ne čita i ne dira.

## Obavezno pročitaj pre pisanja koda
1. `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`: konvencije, dizajn sistem i UI pravila Enigme.
2. Next.js 16 nije verzija iz tvog znanja. Za ono što menjaš (rute, `params`, `searchParams`, `proxy.ts`, `useRouter`, `next/dynamic`) pročitaj vodič u `node_modules/next/dist/docs/`.
3. Pre Convex koda pročitaj `convex/_generated/ai/guidelines.md`.
4. Sekcije `docs/SPAJANJE-PLAN.md` koje tvoj korak pominje, planove iz `docs/spajanje/planovi/` koje pominje i `docs/SPAJANJE-PROGRESS.md`.
5. Za prenos: originalne fajlove iz snimka, uvek ceo fajl pre prenosa.

## Skillovi
- Pre UI koda pozovi skill `impeccable` (u `.claude/skills/`). Ako nije dostupan, koristi `frontend-design`. Dizajn skillovi (`ui-ux-pro-max`, `design-taste-frontend` sa raznovrsnošću 3, pokretom 3 i gustinom 7) su savet. Kad se savet sudari sa `CLAUDE.md` ili planom, pobeđuju oni.
- Za Convex kod koristi Convex skillove iz `.claude/skills/` ili `.agents/` ako postoje (npr. `convex-reviewer`, `convex-authz`, `convex-test`). `guidelines.md` je uvek obavezan.

## Radnici (subagenti)
Arhitekturu, adaptere, šemu, dozvole i ključne kontejnere radiš ti. Mehanički prenos grupe fajlova po receptu iz plana daj radnicima preko alata `Agent`, paralelno kad su poslovi nezavisni:
- `model: "sonnet"` za prenos grupe fajlova po receptu (uvozi, primitivi, tokeni, `api.prostor.*`, testovi), pregled ekrana i snimke.
- `model: "haiku"` za najsitnije provere: spiskove fajlova, grep, prebrojavanje.

Pre nego što prihvatiš rezultat radnika, pročitaj diff i pusti `npm run typecheck`. Dva radnika nikad ne menjaju isti fajl u isto vreme.

## Apsolutne zabrane
- **Git:** NE radi `git push`, `commit`, `reset`, `clean`, `checkout`, `switch`, `stash`, `rebase`, `merge` ni `worktree`. Runner sam pravi commit posle koraka. Dozvoljeni su `git status`, `git diff` i `git log`.
- **Produkcija i deploy:**
  - NE radi `npx convex deploy`, `npx convex dev`, `npx convex env`, `npx convex run`, `npx convex import/export/data/logs`, `npm run deploy:convex`, `npm run convex:dev`, `vercel`, niti bilo šta sa `--prod`.
  - Ništa nad produkcionom ni dev bazom, nalozima za oglase i plaćanjima. Nijedan poziv prema Meta, Google ili drugom spoljnom API-ju.
  - Dozvoljeno je samo `npx convex codegen` (lokalno generiše tipove).
- **Tajne:**
  - NE otvaraj i ne čitaj `.env*` (ni u snimku), `env.personal.txt`, `client_secret_*.json`, `enigma-command-center-*.json` ni `.threads-probe-token*`.
  - NE postavljaj env promenljive i NE upisuj tajne ni ključeve u kod, testove ili dokumente.
  - Nove promenljive (npr. VAPID) samo navedi po imenu u izveštaju.
- **Van obima:**
  - ScanMe repo (`../scanme`) i Devotion repo (`../notion-clone`).
  - Tok prijave i OAuth povratak (`/api/auth/callback/*`), pravne strane (`app/privacy`, `app/cookies`, `app/deletion-status`).
  - Ponašanje Leadova, kanala, oglasa, pravila, OpenReply-a, Novosti, Napretka i puls sajta. Oni se samo sele u nov meni, a P19 i P20 im samo dodaju.
  - Folderi `marketing-brain/`, `nocni-run/`, `overnight/`, `_to_delete/`, `content/` i `tools/generate-leads/vendor/`.
- **Podaci:**
  - Nove `prostor` tabele su dozvoljene, po planu §4.1.
  - Postojeće Enigmine tabele dobijaju samo opciona polja (`v.optional`) i nove indekse. Ništa se ne briše i ne preimenuje.
  - Migracija podataka iz Devotiona se ne piše (O6).
  - Interna funkcija koju Jovan pušta ujutru je dozvoljena; run je NE pokreće.
- **Paketi:** Dozvoljeni su samo paketi iz P10, u tačnim verzijama: `npm install --save-exact <paket>@<verzija>`. Paket van P10 ne uvodiš. Ako bez njega nešto stvarno ne može, napravi ostatak i upiši BLOKADU.
- **Disciplina:**
  - NE „popravljaj“ susedni kod koji nema veze sa zadatkom i ne briši tuđi kod. Izuzetak je kad je zamena (prebacivanje Enigminog ekrana u nov meni, preseljenje huba na `/projekti`) upravo zadatak tvog koraka.
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla.
  - Čuvare (`scripts/verify-*.ts`, `lib/*-cuvar*`, `lib/rutiranje.test.ts`, `lib/linkovi-cuvar.test.ts`, `scripts/verify-pristup.ts`) menjaš samo da bi naučili novu legitimnu putanju ili fajl, nikad da bi oslabili pravilo. Svaku takvu izmenu upiši u ODLUKE.
  - NE ostavljaj pokrenut dev server ni druge procese na kraju koraka.
  - Privremeni fajlovi idu u `.nocni-run/spajanje/tmp/`. Ne briši fajlove van njega, osim kad to zadatak traži.
  - Alati za prenos (codemod skripte) idu u `.nocni-run/spajanje/alati/`.

## Konvencije
- **Projekat:** u kodu i tabelama piše se `workspace` i `workspaceId`. U interfejsu, porukama i dokumentima piše se „projekat“, nikad „startup“ ni „radni prostor“.
- **Gde ide nov kod:**
  - `convex/prostor/<modul>.ts` i `convex/prostor/lib/*.ts`, sa testovima `convex/prostor/*.test.ts`;
  - `lib/prostor/**` za čistu logiku, sa testovima `lib/prostor/**/*.test.ts`;
  - `components/app/prostor/<oblast>/**` za komponente;
  - rute u `app/(app)/**`.
- **Izolacija:**
  - Svaka javna `prostor` funkcija ide kroz omotač iz `convex/lib/projekat.ts`. Projektne idu kroz `projekatQuery/Mutation/Action` sa `uloga: "urednik"`, a lične kroz `prijavljenQuery/Mutation`.
  - Dokument iz argumenta se uvek proverava: `doc.workspaceId === ctx.projekat.workspaceId`.
  - `client_viewer` nema pristup radnom delu.
  - Podaci se čitaju preko indeksa sa `workspaceId`. Provera `pristup` mora da prolazi.
- **Convex:**
  - Objektna sintaksa sa `args` validatorima (i `returns` gde ga modul ima). Indeksi, ne `.filter()`.
  - `"use node"` ide samo u akcije kojima treba Node (`web-push`).
  - `convex/_generated/` se ne menja rukom, nego kroz `npx convex codegen`.
  - Svaka nova tabela ima odluku u `convex/lib/purgeMap.ts`.
- **Dizajn sistem (P3):**
  - Važi `CLAUDE.md`: tokeni iz `app/globals.css` (nikad hex ni sirova paleta), samo tamna tema, Aeonik.
  - Ikonice su samo lucide (stroke 1.75), bez emodžija.
  - Pokret ide kroz GSAP (`useGSAP` u `gsap.matchMedia()`, sa granom za smanjen pokret).
  - Uloga dugmeta (`variant`) je obavezna; ništa ispod 12 px; 44 px na dodir.
  - Datumi i brojevi idu kroz `lib/format.ts`, a nazivi kroz `lib/recnik.ts`.
  - Primitivi su Base UI (`components/ui/*`), nikad Radix.
- **Tekst u UI-ju:**
  - Srpski, latinica, kratko i konkretno, u rečeničnom obliku.
  - Kad podatka nema, piše „—“ i razlog.
  - Interne oznake (S01, P3, O7, §…) se ne pojavljuju u tekstu koji korisnik vidi.
  - Devotion tekstovi se prenose, ali „startup“ postaje „projekat“.
- **Referentni prikazi:** 1536 × 695 (Jovanov ekran), 1440 × 900 i 390 × 844.
- **Testovi:**
  - `npx vitest run` pušta dva projekta: `convex/**/*.test.ts` (edge-runtime, `convex-test`) i `lib/**/*.test.ts` (node).
  - Test van ta dva mesta se ne pušta, pa preneseni testovi idu tamo.
  - Identitet u Convex testovima je `${userId}|sesija-test`.
- **Nove provere (P25):** skripta `scripts/verify-prostor-<oblast>.ts` i unos `verify:prostor-<oblast>` u `package.json`. Provera `regresije` ih pušta sama. Nova provera mora da prolazi na kraju koraka koji je uvodi.

## Vizuelna provera (koraci koji menjaju UI)
- **Sa Playwright MCP-om:**
  1. Pusti `npx next dev -p 3117` u pozadini. Ne koristi druge portove. Razvojni prikaz radi bez Convex-a, kroz lažni Convex iz `app/dev-ux/fake-convex.ts` i fiksture `app/dev-ux/fixtures-*.ts`; za `prostor` su to `fixtures-prostor-*.ts`.
  2. Otvori ekrane kao `http://localhost:3117/<ruta>?ux=1`. Proxy ih prepisuje na `/dev-ux/<ruta>`. Prazna stanja se vide sa `&prazno=1`.
     - Rute „Ja“: `/`, `/moji-zadaci`, `/inbox`, `/poruke`, `/beleske`, `/projekti`.
     - Rute projekta: `/<slug>`, `/<slug>/zadaci`, `/<slug>/ideje`, `/<slug>/poruke`, `/<slug>/dokumenti/<id>`, `/<slug>/stranica/<id>`, `/<slug>/korpa`, `/<slug>/puls`, `/<slug>/aktivnost`, `/<slug>/beleske`, `/<slug>/settings`.
     - Slug i ID-jevi su iz fikstura.
  3. Proveri na 1536 × 695 i 390 × 844. Tema je samo tamna.
  4. Snimci idu u `docs/spajanje/snimci/<ID>-*.png`.
  5. Na kraju UGASI dev server.
- **Ekrani iza prijave** se vide samo kroz razvojni prikaz. Svako novo stanje dobija fiksturu. Prava prijava i prava baza se u runu ne vide; to ide u „Za Jovana ujutru“.
- **Bez Playwright-a:** upiši to u progress i osloni se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođe:

    npx convex codegen                (ako si menjao convex/)
    npm run typecheck
    npm run lint
    npx vitest run
    node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
    node .nocni-run/spajanje/regresije.mjs

Runner posle tebe ponovo pušta provere i `npm run build` (sa `verify:purge`); ako padnu, vratiće ti grešku u istoj sesiji. Provera ili test koji su padali i PRE runa (`.nocni-run/spajanje/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak, traži Jovanovu odluku), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, a hak nije. Kad korak zavisi od ranijeg koji je pao, uradi minimum potreban za svoj deo (po planu) ili upiši BLOKADU; ne pretpostavljaj tiho da prethodni korak postoji.

## Na kraju SVAKOG koraka dopiši u `docs/SPAJANJE-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih (grupisano po folderu)
**Šta je urađeno:** 3–8 rečenica
**Paritet:** redovi iz plana §6 koje je korak pokrio i u kom stanju
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** nema (ili koji iz P10)
**Testovi:** preneseni i novi, šta pokrivaju, koliko ih je
**Rezultat provere:** codegen, typecheck, lint, test, pristup, regresije — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
