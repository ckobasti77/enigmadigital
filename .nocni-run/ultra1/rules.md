# Pravila noćnog runa ULTRA1 — važe za svaki korak

Radiš nenadzirano dok Jovan spava, i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/ULTRA1-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto).
3. Nastavi.

Ne improvizuj tiho.

## Kontekst
Enigma Digital (u kodu „Enigma Command Center“) je Jovanov marketing panel: GA4, Instagram, Facebook, Threads, YouTube, Meta i Google oglasi, OpenReply, leadovi i novosti, sa Convex-om kao bazom. Produkcija je `digital.enigmait.rs` i koristi je samo Jovan. Panel je višeprojektni, sa rutama `/[projekat]/…`.

Ovaj run je prvi od četiri u UI/UX ultra boost planu: **„Istina i temelj“**.
- U0: odluke ulaze u dokumente.
- U1: ispravke podataka u Leadovima.
- U2: jedan status veze i pošteni brojevi.
- U3: temelj sistema dizajna (boja radnje, dugmad, dodir, tipografija, kontrast, mono, meni za izbor, formati, rečnik).

Cilj NIJE da se prave novi ekrani i nova navigacija (Danas, Zajednica, Objave, hub Automatizacija, kartica ishoda, red rada). Cilj nije ni deploy, niti bilo šta u ScanMe repou.

Izvori istine:
- `docs/ULTRA-PLAN.md`: odluke (O1…O21), predlozi (P1…P8), obim, ciljni DNK, sadržaj faza i koraci.
- `docs/ultra/planovi/<ID>.md`: tehnički planovi koje pišu plan koraci (T03, T08).
- `docs/ULTRA1-PROGRESS.md`: šta su prethodni koraci uradili, ODLUKE i BLOKADE.
- `docs/ultra/REVIZIJA.md` i `docs/ultra/revizija/*.md`: dokazi iz revizije, sa putanjama i redovima koda. Redovi koda su od 27. 10. i mogu da se pomere, pa uvek proveri u kodu. Brojevi su iz sintetičkih podataka, a valuta je po O16.

## Obavezno pročitaj pre pisanja koda
1. `CLAUDE.md` i `AGENTS.md`: konvencije, dizajn sistem, UI pravila. Posle T01 `CLAUDE.md` i `DESIGN.md` nose nova pravila iz `docs/ULTRA-PLAN.md` §3.
2. Next.js 16 nije verzija iz tvog znanja. Za ono što menjaš (proxy, rute, `params`, `searchParams`, `useRouter`) pročitaj vodič u `node_modules/next/dist/docs/`.
3. Pre Convex koda pročitaj `convex/_generated/ai/guidelines.md`.
4. Pročitaj `docs/ULTRA-PLAN.md` (sekcije koje tvoj korak pominje), planove iz `docs/ultra/planovi/` koje korak pominje i `docs/ULTRA1-PROGRESS.md`.
5. Za UI pročitaj `PRODUCT.md` i `DESIGN.md`.

## Skillovi
- Pre svakog UI koda pozovi skill `impeccable` (u `.claude/skills/`); ako nije dostupan, koristi `frontend-design`. Dizajn skillovi (`ui-ux-pro-max`, `design-taste-frontend` sa raznovrsnošću 4, pokretom 3 i gustinom 7) su savet. Kad se savet skilla sudari sa `CLAUDE.md` ili `docs/ULTRA-PLAN.md`, pobeđuju oni.
- Za Convex kod koristi Convex skillove ako postoje u `.claude/skills/` ili `.agents/`; `guidelines.md` je uvek obavezan.

## Radnici (subagenti)
Glavne odluke i ključni kod (status veze, rečnik mera, primitivi, šema, mutacije) radiš ti. Sitne, nezavisne poslove možeš dati radnicima preko alata `Agent`, paralelno kad su nezavisni:
- `model: "sonnet"`: prelazak grupe fajlova po receptu iz plana (npr. zamena `text-[10px]` ili `variant="default"` u određenim fajlovima), pregled ekrana, snimci, provera stringova, testovi po tvom opisu.
- `model: "haiku"`: najsitnije mehaničke provere (spisak fajlova, grep, prebrojavanje).

Rezultat radnika uvek proveriš pre nego što ga prihvatiš: pročitaš diff i pustiš `npm run typecheck`. Dva radnika nikad ne menjaju isti fajl u isto vreme.

## Apsolutne zabrane
- **Git:** NE radi `git push`, `git commit`, `git reset`, `git clean`, `git checkout`, `git switch`, `git stash`, `git rebase`, `git merge` ni `git worktree`. Runner sam pravi commit posle koraka. Dozvoljeni su `git status`, `git diff` i `git log`.
- **Produkcija i deploy:**
  - NE radi `npx convex deploy`, `npx convex dev`, `npx convex env`, `npx convex run` ni `npx convex import/export/data/logs`.
  - NE radi `npm run deploy:convex`, `npm run convex:dev`, `vercel` ni ništa sa `--prod`.
  - Ništa nad produkcionom ni dev bazom, nalozima za oglase i plaćanjima. Nijedan poziv prema Meta, Google ili drugom spoljnom API-ju.
  - **Dozvoljeno:** `npx convex codegen`, jer samo lokalno generiše tipove.
- **Tajne:** NE otvaraj i ne čitaj `.env*`, `env.personal.txt`, `client_secret_*.json`, `enigma-command-center-*.json` ni `.threads-probe-token*`. NE postavljaj env varijable i NE upisuj tajne ni ključeve u kod, testove ili dokumente.
- **Van obima:**
  - Ne dira se i ne čita ScanMe repo (`../scanme`).
  - Tok prijave ostaje isti.
  - Putanje OAuth povratka (`/api/auth/callback/*`) ostaju iste.
  - Pravne strane (`app/privacy`, `app/cookies`, `app/deletion-status`) se ne menjaju.
  - Ne diraš `marketing-brain/`, `nocni-run/`, `overnight/`, `_to_delete/`, `content/` ni `tools/generate-leads/vendor/`.
  - Novi ekrani i nova navigacija su za kasnije runove (`docs/ULTRA-PLAN.md` §2 i §10).
- **Podaci:** šema sme da dobije samo opciona polja (`v.optional`) i nove indekse. Postojeća polja se ne brišu i ne preimenuju. Migracija postojećih zapisa se piše kao interna funkcija koju Jovan pušta ujutru; run je NE pokreće (P8).
- **Paketi:** NE uvodi nove npm pakete. Ako bez paketa nešto stvarno ne može, napravi ostatak i upiši BLOKADU.
- **Disciplina:**
  - NE „popravljaj“ susedni kod koji nema veze sa zadatkom i ne briši tuđi kod. Izuzetak je kad je zamena (npr. `text-[10px]` → `text-xs`) upravo zadatak tvog koraka.
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla. Postojeće `scripts/verify-*.ts` i `*-check.ts` menjaš samo kad tvoja izmena legitimno menja ono što proveravaju (npr. nova uloga dugmeta), i nikad da bi ih oslabio. Svaku takvu izmenu upiši u ODLUKE.
  - NE ostavljaj pokrenut dev server ni druge procese na kraju koraka.
  - Privremene fajlove drži u `.nocni-run/ultra1/tmp/`. Ne briši fajlove van njega osim kad to zadatak traži.

## Konvencije repoa
- **Projekat vs radni prostor:** u kodu i tabelama ostaje `workspace` i `workspaceId`. U interfejsu, porukama i dokumentima piše se „projekat“.
- **Izolacija:** svaka javna Convex funkcija nad podacima projekta ide kroz omotač iz `convex/lib/projekat.ts`. Podaci se čitaju preko indeksa sa `workspaceId`. Provera `pristup` mora da prolazi.
- **Convex:** objektna sintaksa sa `args` validatorima (i `returns` gde ga modul već koristi). Koriste se indeksi, ne `.filter()`. `"use node"` ide samo u akcije kojima treba Node. `convex/_generated/` se ne menja rukom, nego kroz `npx convex codegen`.
- **Folderi:** `app/` drži samo rute i layoute. `components/ui/` su primitivi (samo kroz tokene). `components/app/` su komponente aplikacije, `lib/` čiste pomoćne funkcije, `convex/` backend.
- **Dizajn sistem:** važi `CLAUDE.md` (posle T01 usklađen sa `docs/ULTRA-PLAN.md` §3).
  - Komponente čitaju tokene iz `app/globals.css`, nikad hex ni sirovu Tailwind paletu.
  - Tamna tema je jedina.
  - Ikonice su samo lucide (stroke 1.75), bez emodžija.
  - Pokret ide kroz GSAP (`useGSAP` u `gsap.matchMedia()`, sa granom za smanjen pokret).
  - Pismo je Aeonik.
- **Tekst u UI-ju:** srpski, latinica, kratko i konkretno, u rečeničnom obliku. Kad podatka nema, piše „—“ i razlog, nikad izmišljena nula. Interne oznake (T01, U2, O5, P3, §…) se ne pojavljuju u tekstu koji korisnik vidi. Mere imaju srpski naziv, a akronim stoji u oblačiću (O15).
- **Referentni prikazi:** 1536×695 (Jovanov ekran), 1440×900 i 390×844. Fokus i primarno dugme staju iznad preloma na 1536×695.
- **Testovi:** `npx vitest run`. Convex testovi su `convex/**/*.test.ts` sa `convex-test` (okruženje `edge-runtime`), a čiste funkcije su u `lib/**/*.test.ts` (okruženje `node`), po uzoru na postojeće.
- **Nove provere (P6):** skripta u `scripts/` i unos `verify:ultra-<oblast>` u `package.json`. Provera `regresije` sama pokreće sve `verify:ultra-*`. Nova provera mora da prolazi na kraju koraka koji je uvodi.

## Vizuelna provera (koraci koji menjaju UI)
- **Sa Playwright MCP-om:**
  1. Pusti `npx next dev -p 3117` u pozadini. Port je 3117 jer na računaru može da radi i drugi projekat na 3105; ne koristi druge portove. Ide bez Convex-a: razvojni prikaz koristi lažni Convex iz `app/dev-ux/fake-convex.ts`, sa fiksturama `app/dev-ux/fixtures-*.ts`.
  2. Otvori ekrane kao `http://localhost:3117/<ruta>?ux=1`; proxy ga prepisuje na `/dev-ux/<ruta>`. Prazna stanja se vide sa `&prazno=1`. Primeri ruta: `/`, `/leadovi`, `/leadovi?tab=leads`, `/instagram`, `/facebook`, `/threads`, `/youtube`, `/ads`, `/analytics`, `/rules`, `/settings`, `/novosti`, `/sistem`.
  3. Proveri na 390 × 844 i 1536 × 695 (po potrebi i 1440 × 900). Tema je samo tamna.
  4. Snimci idu u `docs/ultra/snimci/<ID>-*.png`.
  5. Na kraju UGASI dev server.
- Može i postojeća skripta `node scripts/ux-snapshots.mjs --faza b-<id> --port 3117 --samo <ekrani>`. Ona sama diže `next dev` na zadatom portu, gasi ga i snima u `nocni-run/ux/` (to je u `.gitignore`).
- **Ekrani iza prijave** se proveravaju samo kroz razvojni prikaz. Svako novo stanje (npr. istekla veza, nalog u drugoj valuti, proba pravila) dobija fiksturu da bi se videlo. Prava prijava i prava baza se u runu ne vide; to ide u „Za Jovana ujutru“.
- **Bez Playwright-a:** upiši to u progress i osloni se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođu:

    npx convex codegen                (ako si menjao convex/)
    npm run typecheck
    npm run lint
    npx vitest run
    node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
    node .nocni-run/ultra1/regresije.mjs

Runner posle tebe ponovo pušta provere i `npm run build`; ako padnu, vratiće ti grešku u istoj sesiji. Provera ili test koji su padali i PRE runa (`.nocni-run/ultra1/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak, traži Jovanovu odluku), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, a hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/ULTRA1-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** nema (ili BLOKADA)
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Rezultat provere:** typecheck, lint, test, pristup, regresije — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
