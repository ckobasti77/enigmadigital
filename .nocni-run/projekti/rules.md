# Pravila noćnog runa PROJEKTI — važe za svaki korak

Radiš nenadzirano dok Jovan spava i niko ne može da ti odgovori na pitanje. Kad naiđeš na nejasnoću:
1. Izaberi najkonzervativniju opciju.
2. **Zapiši je** u svojoj sekciji u `docs/PROJEKTI-PROGRESS.md`, u redu **ODLUKE:** (šta si izabrao i zašto).
3. Nastavi.

Ne improvizuj tiho.

## Kontekst
Enigma Digital (u kodu „Enigma Command Center“) je Jovanov marketing panel: GA4, Instagram, Facebook, Threads, YouTube, Meta i Google oglasi, OpenReply DM automatizacija, leadovi i novosti, sa Convex-om kao bazom. Produkcija je `digital.enigmait.rs` i koristi je samo Jovan. Ovaj run pravi od njega panel za više projekata (Enigma IT, ScanMe, kasnije drugi): članstva u više projekata, omotači pristupa, rute `/[projekat]/…`, hub i paneli po domenu, birač projekta, podešavanja i brend po projektu, kvote, leadovi po projektu, hub „Svi projekti“, Puls i prijem leadova sa sajta. Cilj NIJE novi izgled modula, deploy, ni bilo šta u ScanMe repou.

Izvori istine:
- `docs/PROJEKTI-PLAN.md`: odluke (O1…), predlozi (P1…), obim, granice i koraci.
- `docs/projekti/planovi/<ID>.md`: tehnički planovi koje pišu plan koraci (C02, C10, C15).
- `docs/PROJEKTI-PROGRESS.md`: šta su prethodni koraci uradili, ODLUKE i BLOKADE.

## Obavezno pročitaj pre pisanja koda
1. `CLAUDE.md` i `AGENTS.md` (konvencije, dizajn sistem, UI pravila).
2. Next.js 16 nije verzija iz tvog znanja: za ono što menjaš (proxy, rewrites, dinamičke rute, `params`, `headers()`) pročitaj vodič u `node_modules/next/dist/docs/`.
3. Pre Convex koda: `convex/_generated/ai/guidelines.md`.
4. `docs/PROJEKTI-PLAN.md`, planove iz `docs/projekti/planovi/` koje tvoj korak pominje, i `docs/PROJEKTI-PROGRESS.md`.
5. Za UI: `PRODUCT.md` i `DESIGN.md`.

## Skillovi
- Pre svakog UI koda pozovi skill `impeccable` (u `.claude/skills/`); ako nije dostupan, `frontend-design`. Kad se savet skilla sudari sa `CLAUDE.md`, pobeđuje `CLAUDE.md`.
- Za Convex kod, ako postoje Convex skillovi u `.claude/skills/` ili `.agents/`, koristi ih; `guidelines.md` je uvek obavezan.

## Radnici (subagenti)
Glavne odluke i ključni kod (pristup, omotači, proxy, šema) radiš ti. Sitne, nezavisne poslove možeš dati radnicima preko alata `Agent`, paralelno kad su nezavisni:
- `model: "sonnet"`: prelazak jednog modula na omotače po receptu iz plana C02 (backend + pozivi na frontu), pregled ekrana, snimci, provera stringova, testovi po tvom opisu.
- `model: "haiku"`: najsitnije mehaničke provere (spisak fajlova, grep, prebrojavanje poziva).

Rezultat radnika uvek proveriš pre nego što ga prihvatiš (pročitaš diff, pustiš `npm run typecheck`). Dva radnika nikad ne menjaju isti fajl u isto vreme.

## Apsolutne zabrane
- **Git:** NE radi `git push`, `git commit`, `git reset`, `git clean`, `git checkout`, `git switch`, `git stash`, `git rebase`, `git merge`, `git worktree`. Runner sam pravi commit posle koraka. `git status`, `git diff` i `git log` su dozvoljeni.
- **Produkcija i deploy:** NE radi `npx convex deploy`, `npx convex dev`, `npx convex env`, `npx convex run`, `npx convex import/export/data/logs`, `npm run deploy:convex`, `npm run convex:dev`, `vercel` ni ništa sa `--prod`. Ništa nad produkcionom ni dev bazom, nalozima i plaćanjima. **Dozvoljeno:** `npx convex codegen` (samo generiše tipove lokalno).
- **Tajne:** NE otvaraj i ne čitaj `.env*`, `env.personal.txt`, `client_secret_*.json`, `enigma-command-center-*.json`, `.threads-probe-token*`. NE postavljaj env varijable i NE upisuj tajne ni ključeve u kod, testove ili dokumente. Nove env promenljive samo imenuješ (kod ih čita, izveštaj kaže šta Jovan postavlja).
- **Van obima:** ScanMe repo (`../scanme`) se ne dira ni ne čita. Tok prijave lozinkom i kodom ostaje isti (osim generalizacije pozivnica iz plana). Pravne strane (`app/privacy`, `app/cookies`, `app/deletion-status`) menjaš samo ako ime projekta mora da se prikaže. Putanje OAuth povratka (`/api/auth/callback/*`) ostaju iste. Ne diraj `marketing-brain/` (samo čitanje), `nocni-run/`, `overnight/`, `_to_delete/`, `content/`, `tools/generate-leads/vendor/`.
- **Paketi:** samo ovi novi (plan P7): `convex-helpers`, a za razvoj `vitest@4`, `convex-test`, `@edge-runtime/vm@5`. Svaki drugi samo uz ODLUKU sa licencom (MIT/Apache) i razlogom, i samo ako bez njega korak ne može.
- **Disciplina:**
  - NE „popravljaj“ susedni kod koji nema veze sa zadatkom i ne briši tuđi kod.
  - NE gasi, ne preskači i ne briši testove ni assertion-e da bi provera prošla. `scripts/verify-*.ts` i `*-check.ts` smeš da menjaš samo kad se putanja fajla koji proveravaju promenila (npr. selidba pod `[projekat]`), nikad da bi proveru oslabio.
  - NE ostavljaj pokrenut dev server ni druge procese na kraju koraka.
  - Privremene fajlove drži u `.nocni-run/projekti/tmp/`. Ne briši fajlove van njega osim kad to zadatak traži.

## Konvencije repoa
- **Projekat vs radni prostor (P1):** u kodu i tabelama ostaje `workspace`/`workspaceId`; u interfejsu, porukama, komentarima za korisnika i dokumentima piše se „projekat“. Reč „workspace“ i „radni prostor“ ne pojavljuju se u UI-ju.
- **Izolacija je pravilo broj jedan:** svaka javna funkcija nad podacima projekta ide kroz omotač iz `convex/lib/projekat.ts` (posle C03). Podatke projekta čitaš samo preko indeksa sa `workspaceId`; javna funkcija nikad ne prolazi kroz sve prostore (`ctx.db.query("workspaces").collect()` i slično su dozvoljeni samo u internim funkcijama i cron-u).
- **Convex:** objektna sintaksa sa `args` validatorima (i `returns` gde ga modul već koristi), indeksi umesto `.filter()`, `"use node"` samo u fajlovima akcija kojima treba Node. `convex/_generated/` je generisan: ne menjaj ga rukom, pusti `npx convex codegen`.
- **Folderi:** `app/` samo rute i layouti; `components/app/` komponente aplikacije; `components/ui/` shadcn primitivi (samo kroz tokene); `lib/` čiste pomoćne funkcije; `convex/` backend.
- **Dizajn sistem (`CLAUDE.md` § Design system):** tamna tema je jedina; boja ima tačno uloge iz `CLAUDE.md`, plus nova peta uloga „identitet projekta“ (P10) samo za birač, logo, ekran prijave i tanku traku ljuske; komponente čitaju `var(--mod*)` i tokene, nikad hex ni sirovu Tailwind paletu; jedan `primary` po ekranu; GSAP za pokret uz granu za smanjen pokret; ikonice samo lucide (stroke 1.75); Aeonik; brojevi `font-mono tabular-nums`.
- **Tekst u UI-ju:** srpski, latinica, kratko i konkretno. Kad podatka nema, piše „—“ i razlog, nikad izmišljena nula. Interne oznake (C01, P3, §…) se ne pojavljuju u tekstu koji korisnik vidi.
- **Referentni prikazi:** 1536×695 (Jovanov ekran), 1440×900, 390×844; fokus i `primary` dugme ekrana staju iznad pregiba na 1536×695.
- **Testovi:** `npx vitest run`. Convex testovi su `convex/**/*.test.ts` sa `convex-test` (okruženje `edge-runtime`), čiste funkcije u `lib/**/*.test.ts` (okruženje `node`), po uzoru na testove koje napravi C01/C03.

## Vizuelna provera (koraci koji menjaju UI)
- **Sa Playwright MCP-om:**
  1. Pusti `npx next dev -p 3105` u pozadini (bez Convex-a; razvojni prikaz koristi lažni Convex iz `app/dev-ux/fake-convex.ts`).
  2. Otvori ekrane kroz razvojni prikaz: `http://localhost:3105/<ruta>?ux=1` (posle C08: `http://localhost:3105/enigma-it/<ruta>?ux=1` i `…/scanme/<ruta>?ux=1`). Proveri na 390 × 844 i 1440 × 900 (fokus i na 1536 × 695). Tema je samo tamna.
  3. Snimci idu u `docs/projekti/snimci/<ID>-*.png`.
  4. Na kraju UGASI dev server.
- Može i postojeća skripta `node scripts/ux-snapshots.mjs` (sama diže `next dev` na 3105 i gasi ga).
- **Ekrani iza prijave** se proveravaju samo kroz razvojni prikaz: UI pravi kao komponente kojima podaci stižu kroz props ili hookove koje lažni Convex ume da posluži, i dodaj fiksture (bar dva projekta: „Enigma IT“ i „ScanMe“). Prava prijava i prava baza se u runu ne vide; to ide u „Za Jovana ujutru“.
- **Bez Playwright-a:** upiši to u progress i osloni se na testove.

## Definicija završenog koraka
Korak nije gotov dok ne prođu:

    npx convex codegen                (ako si menjao convex/)
    npm run typecheck
    npm run lint
    npx vitest run
    node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts
    node .nocni-run/projekti/regresije.mjs

Runner posle tebe ponovo pušta provere i `npm run build`; ako padnu, vratiće ti grešku u istoj sesiji. Provera ili test koji su padali i PRE runa (`.nocni-run/projekti/baseline.txt`) nisu tvoja odgovornost, ali ih ne kvari dodatno.

Ako nešto realno ne može (ograničenje platforme, fali podatak, traži Jovanovu odluku), napravi ostatak i upiši `BLOKADA:` sa tačnim razlogom. Blokada je ispravan ishod, hak nije.

## Na kraju SVAKOG koraka dopiši u `docs/PROJEKTI-PROGRESS.md`
```
## <ID> — <naslov>   (<datum vreme>)
**Fajlovi:** lista dodatih/izmenjenih
**Šta je urađeno:** 3–8 rečenica
**ODLUKE:** svaka nejasnoća koju si sam rešio i zašto
**Novi paketi:** ime@verzija — licenca (ili „nema“)
**Testovi:** koje si napisao/menjao i šta pokrivaju
**Rezultat provere:** typecheck, lint, test, pristup, regresije — prošlo ili ne
**BLOKADA:** samo ako postoji, sa tačnom porukom
**Za Jovana ujutru:** šta da proveri ručno
```
Dopisuješ na kraj i ne brišeš tuđe sekcije.
