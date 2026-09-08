# GL8 — Skill režim `obogati`: postojeća tabela → dopuna → spajanje

Datum: 08.09.2026. · Grana: `main` · Model: Opus, effort high · Sesija: nova

Sve obavezno je urađeno: **1 (ucitaj --fajl), 3 (tok u SKILL.md), 4 (spajanje),
5 (testovi za ucitaj i zod)**. Od poželjnog: **2 (`--izvoz` u celini + `company_id`
u izvozu)** i **6 (README + SKILL.md)** su takođe urađeni. `npm run typecheck`,
`npm run verify:purge`, `npm run verify:gl-ingest` (sada 7 slučajeva) i
`npm run verify:gl-skill` (sada **178** provera, bilo 148) prolaze. `npx eslint`
nad mojim fajlovima = **0 grešaka** (zatečena upozorenja/greške koje nisu moje su
niže).

Pre-flight: pročitani `GL1.md` (odluke 3–6), `GL5.md`, `GL6.md`, `generate-leads-plan.md`
§3/§4/§5/§6/§10, `SKILL.md`, `run.mjs`, `lib/schema.mjs`, `convex/lib/generateLeadsIngest.ts`,
`convex/leadImportStore.ts` (`matchRowToExistingCompany`, `detectRowConflicts`,
`createImportCore`, `applyImport`, `attachSkillData`, `revertImport`) i
`convex/lib/leadImportParse.ts`.

---

## 1. `run.mjs ucitaj --fajl <xlsx|csv> [--list]` — urađeno

- Nova komanda `ucitaj` (`run.mjs`) sa dva ulaza: `--fajl` (tabela) i `--izvoz`
  (CSV iz aplikacije). Parser je u novom **`lib/tabela.mjs`**.
- **Bez nove zavisnosti.** XLSX se čita paketom `xlsx` koji **već postoji** u
  `package.json` repoa (`^0.18.5`, koristi ga `convex/lib/leadImportParse.ts`),
  i to **dinamičkim** uvozom (`await import("xlsx")`) samo u XLSX grani — CSV put
  i `self-test` ne zavise od njega. Nije napravljen `tools/generate-leads/package.json`
  (nije potreban: skill se uvek pokreće apsolutnom putanjom iz repoa, pa Node
  nalazi `node_modules` repoa; isto pravilo već koristi `self-test` za zod šemu).
- **Detekcija zaglavlja** po pravilu iz prompta: prvi red (u prvih 15) sa ≥ 4
  popunjene ćelije od kojih je bar jedna „Ime/Naziv/Telefon". Naslovni red iznad
  (kao „Svi lidovi (100)") se tako preskoči sam.
- **Mapiranje kolona je preneto iz `leadImportParse.ts`** (isti sinonimi
  `Ime_Salona`→naziv, `Lokacija`→ulica/opština/grad po zarezu + beogradske
  opštine, `Telefon`, `Ime_osobe`+`Pozicija`→osoba sa `ulogaIzvor: "tabela"`,
  `Ocena` regexom, `Napomena_za_prodaju`→napomena, `Izvor_podataka`→CompanyWall
  URL ili u `izvori`).
- Izlaz: `out/<run-id>/firme.json` u ISTOM obliku kao `discover`, sa `poreklo:
  "tabela"` i `sourceUrl` = `tabela:<naziv fajla>#<red>` po firmi (marker je i
  prvi element `izvori`, jer aplikacija poreklo firme čita iz `izvori[0]`).
  Run-id: `<datum>-obogati-<naziv fajla bez ext>`.
- Ispis: broj redova, koliko ima osobu / CompanyWall link / telefon, i
  upozorenje za redove bez naziva (preskaču se, sa brojevima redova).

## 2. `run.mjs ucitaj --izvoz <csv iz aplikacije>` — urađeno

- Isti parser čita kanonski CSV izvoza (`naziv_firme`, `telefon`, `ocena_*`…),
  a **`company_id`** kolonu mapira na `postojecaFirmaId`.
- **Izvoz aplikacije dobio `company_id` kao PRVU kolonu** (`convex/lib/leadExport.ts`
  + `leadExportStore.ts`). `companywall_url` je već bio u izvozu (nije dupliran).
- Kad red ima `postojecaFirmaId`, ide u ingest kao takav; `matchRowToExistingCompany`
  ga koristi kao **ključ #0** (ispred PIB-a), uz `ctx.db.normalizeId` +
  proveru da firma pripada tom radnom prostoru (§0 pravilo 9). Novi `matchedBy:
  "postojeca_firma"`.

## 3. Tok obogaćivanja u `SKILL.md` — urađeno

- Nova sekcija „Obogaćivanje postojeće tabele (režim „obogati")": okidači,
  `proveri-env` (Places se NE zove u ovom režimu — kvota nula), `ucitaj`, pa
  Claude za svaku firmu radi ISTO što i u `discover` toku uz dva dodatka
  (proverava vrednosti iz tabele i upisuje `dokazi`; ne briše ništa iz tabele —
  obe vrednosti idu dalje, aplikacija prikaže kao sukob), pa
  `check-site`→`geocode`→`score`→`send`.
- `send` u ovom režimu šalje **samo redove sa promenom** u odnosu na
  `firme.ulaz.json` (snimak posle `ucitaj`); red bez promene se broji („bez
  promene: N"); `--sve` šalje sve. Poređenje je u novom **`lib/obogati.mjs`**.
- STOP tačke: posle `ucitaj` Claude ispiše rezime tabele i, pre nego što krene,
  kaže trajanje/kvotu; `--od N --do M` za rad u serijama (svaka serija svoj
  run-id sufiks `-N-M`).
- `upit` u telu nosi `rezim: "obogati"` i `izvorFajl` (nova opciona polja u zod
  šemi i u `lib/schema.mjs`); `fileName` uvoza gradi HTTP ruta kao
  `generate-leads · obogati · <naziv fajla> · <datum>`.

## 4. Aplikacija — spajanje — urađeno

- **`matchRowToExistingCompany`**: novi ključ #0 `postojecaFirmaId` (vidi 2).
  Ostalo nepromenjeno.
- **`detectRowConflicts`** pokriva i nova polja: osoba istog (normalizovanog)
  imena a druge uloge → `osobaUloga`; telefon te osobe koji se razlikuje →
  `osobaTelefon`; `imaSajt` koji prelazi `ne`→`da` → `imaSajt`. Svaki sukob nosi
  `izvor` = `sourceUrl` nove vrednosti (`ulogaIzvor` / `telefonSourceUrl` /
  `sajt`). Nova osoba NIJE sukob — to je dopuna.
- **`attachSkillData` pri spajanju**: osoba koja već postoji (isto normalizovano
  ime) se **ne duplira** — dobija `roleConfidence: "potvrdjeno"` ako novi izvor
  (APR/CompanyWall) to opravdava (poznata uloga se ne gazi, popravlja se samo
  „nepoznato"), i telefon sa `verovatnoca*` **ako ga još nema**.
  `leadFieldProvenance` dobija red za svaku promenu (uloga) i za svaki upisan
  telefon.
- **Pregled uvoza (`import-review-table.tsx`)**: za `rezim: "obogati"` red nosi
  bedž **„+N polja"** (koliko dopuna donosi) i **„N sukoba"**; iznad tabele je
  dugme-filter **„samo sa sukobom"**. Za klasičan uvoz se ništa ne menja.
- **`revertImport`**: proveren — **ne briše firmu koja je postojala pre**.
  Spojeni redovi imaju `matchedCompanyId`, ne `createdCompanyId`, pa petlja
  poništavanja (`if (r.createdCompanyId)`) na njih uopšte ne dira firmu. Bug iz
  prompta (brisanje cele postojeće firme pri poništavanju spojenog uvoza)
  **ne postoji**, pa nije bilo šta da se popravlja. Ograničenje je niže u
  „Poznati rizici".

## 5. Testovi — urađeno

- `self-test` (`lib/self-test.mjs`, +30 provera → 178): učitavanje matrice kao
  Jovanove tabele (naslov u redu 1, zaglavlje u redu 2), mapiranje kolona,
  `Ocena` regex („4,8 (120 recenzija)" → {4.8, 120}, „4.8" → samo vrednost,
  prazno → undefined), `poreklo`/`sourceUrl`, red bez naziva se preskače i broji,
  `company_id`→`postojecaFirmaId`, end-to-end nad CSV fixture-om, razlika
  ulaz/izlaz („samo promenjeni"), i zod poklapanje sa novim poljima (`rezim`,
  `izvorFajl`, `postojecaFirmaId`) kroz **obe** kopije šeme. Fixture:
  `tools/generate-leads/test/uzorak.csv` (5 lažnih redova).
- `scripts/generate-leads-ingest-check.ts` (+2 slučaja): `rezim: "obogati"` sa
  `postojecaFirmaId` (zod propušta — 200) i nepoznat `rezim` (400,
  `upit.rezim: invalid_value`). Provera da ID pripada radnom prostoru je u
  mutaciji i ne može bez baze — opisana kao ručni korak (vidi „Ručna provera").

## 6. README + SKILL.md — urađeno

Odeljak „Obogaćivanje postojeće tabele" u oba fajla: komanda, šta se šalje, šta
se vidi u pregledu, rad u serijama, koliko traje.

---

## Odluke koje sam doneo sam (nisu doslovno u promptu)

1. **`ucitaj` NE dodaje novu zavisnost i ne pravi `tools/.../package.json`.**
   Prompt dozvoljava dodavanje jedne zavisnosti ako `xlsx`/`exceljs` ne postoji
   — ali `xlsx` postoji u repou, pa je konzervativnije koristiti njega
   (dinamički uvoz). Nedostatak: `ucitaj --fajl *.xlsx` radi samo kad se skill
   pokreće iz repoa; CSV put radi svuda. Zaobilazak za tuđu mašinu: sačuvati
   XLSX kao CSV. (Poruka greške to kaže.)
2. **Parser je PREPISAN u JS (`lib/tabela.mjs`), nije uvezen iz
   `leadImportParse.ts`.** Prompt kaže „prenesi to pravilo, ne izmišljaj drugo" —
   preneo sam pravila (sinonimi, `Lokacija`, `Ocena`), ali `leadImportParse.ts`
   se ne može uvesti u `run.mjs` jer ima relativne `.ts` uvoze bez ekstenzije
   koje Node (skidanje tipova) ne razrešava. `self-test` drži oba pod istim
   primerima da se ne raziđu.
3. **`Ocena` daje `{vrednost, brojRecenzija}` bez skale**, kako prompt izričito
   traži u §1 — to odstupa od `parseRating` u aplikaciji (koja ne vraća vrednost
   bez skale). U režimu „obogati" te vrednosti ionako proverava Claude pre
   slanja. Skala se upisuje samo kad je eksplicitna u tekstu („4,8/5").
4. **`company_id` je dodat kao prva kanonska kolona izvoza; `companywall_url`
   NIJE dupliran** (već je bio u izvozu). Prompt traži „companyId/companyWallUrl
   kao prve kolone" — druga kolona već postoji, pa bi je duplo dodavanje
   pokvarilo. Obavezni deo (companyId u izvozu) je ispunjen.
5. **„+N polja" je približna mera** (broj popunjenih grupa polja koje red nosi:
   niša, sajt, koordinate, osobe, platforme, telefon, e-mail, PIB, MB, šifra,
   ocena), ne tačan dijf prema bazi u trenutku pregleda. Tačan spisak je u
   „Detalji". Cilj bedža je brz pregled 100 redova, a to postiže i ovako.
6. **`revertImport` nije proširen da poništi ono što je SPAJANJE dodalo.**
   Prompt traži samo uslovnu popravku („ako briše celu firmu … popravljaš"), a
   to se ne dešava. Pun „merge-undo" bi tražio marker po entitetu (šta je baš
   ovaj uvoz dodao postojećoj firmi) i veliki, u noćnom runu neproverljiv upis;
   konzervativno sam ga ostavio za kasnije (vidi rizike).
7. **`upit.grad` u režimu „obogati" je najčešći grad iz tabele** (`--grad`
   preglašava). Ako nijedan red nema grad, `ucitaj` staje i traži `--grad` — ne
   izmišlja centar.
8. **`--nisa` je obavezan za `ucitaj`** (tabela nema nišu, a `upit.nisa` je
   obavezno polje šeme). Per-red `nisa` se postavlja kao u `discover`; pri
   spajanju `applyImport` dodeljuje nišu samo firmi koja je nema.

## Poznati rizici i šta NIJE urađeno

- **Ništa nije provereno u browseru ni na živim podacima.** Nema tokena, nema
  Jovanove tabele; `npx convex dev/deploy/env` su zabranjeni. Tvrdnje o UI-ju i
  o spajanju su čitanje koda + `self-test`/`verify` nad izmišljenim podacima.
  Sam sam pokrenuo `ucitaj`/`send --dry-run` nad **CSV fixture-om sa lažnim
  podacima** (radni folder posle obrisan) — telo prolazi i lib i zod šemu.
- **`--place-id` zastavica (Places Text Search po firmi radi `placeId`) NIJE
  implementirana.** Prompt je stavlja kao podrazumevano isključenu opciju; da ne
  bih crtao „mrtvu" kontrolu (rep pravilo), režim „obogati" jednostavno ne zove
  Places. Ako zatreba, to je zaseban, mali dodatak.
- **`revertImport` za spojene firme ne vraća dopunu unazad** (dodate osobe,
  telefone, signale, provenance). NE briše postojeću firmu (to je i tražena
  garancija), ali dopuna ostaje. Poništavanje spojenog „obogati" uvoza zato
  vraća samo firme koje je taj uvoz NOVO napravio.
- **`import-row-dialog.tsx` (modal „Detalji") ne prikazuje `postojecaFirmaId`
  ni nove sukobe posebno** — čita polja po imenu i ne puca; sukobi se ionako
  vide u tabeli i kao „nerazrešeno". Prompt je tražio kolone/bedževe u tabeli.
- **`npm run lint` nad celim repoom** ima zatečene greške/upozorenja (GL1 ih je
  izmerio ~1288 grešaka). Nad mojim fajlovima `npx eslint` = 0 grešaka. Zatečeno
  a NIJE moje, u fajlovima koje sam dirao: `import-row-dialog.tsx:515,549`
  (`react/no-unescaped-entities`, postoje pre GL8), `import-review-table.tsx`
  mrtvo `revert*` stanje (GL1), `leadImportStore.ts` neiskorišćeni
  `LEAD_SIGNAL_KINDS`/`MatchOn`/`SuppressionCheckResult` (GL1/GL6). Nisam ih
  dirao (nisu moji).

## Dodati fajlovi
- `tools/generate-leads/lib/tabela.mjs`
- `tools/generate-leads/lib/obogati.mjs`
- `tools/generate-leads/test/uzorak.csv`
- `nocni-run/izvestaji/GL8.md`

## Izmenjeni fajlovi
- `convex/schema.ts` (`leadImports.rezim`/`izvorFajl`, `leadImportRows.parsed.postojecaFirmaId`, `matchedBy` += `postojeca_firma`)
- `convex/lib/generateLeadsIngest.ts` (`upit.rezim`/`izvorFajl`, `postojecaFirmaId`)
- `convex/leadImportStore.ts` (ključ #0, sukobi, `createImportCore`/`createImportFromIngest` args, `attachSkillData` dedup+dopuna)
- `convex/http.ts` (rezim/izvorFajl u ruti + `fileName`)
- `convex/lib/leadExport.ts`, `convex/leadExportStore.ts` (`company_id` kolona)
- `convex/lib/leadImportParse.ts` (`ParsedLeadRow.postojecaFirmaId`)
- `components/app/leadovi/import-review-table.tsx` (obogati bedževi + filter sukoba)
- `components/app/leadovi/import-row-dialog.tsx` (`MATCHED_BY_LABELS` += `postojeca_firma`)
- `scripts/generate-leads-ingest-check.ts` (+2 slučaja), `scripts/lead-export-check.ts` (broj kolona)
- `tools/generate-leads/run.mjs` (`ucitaj`, `send` obogati grana, pomoć)
- `tools/generate-leads/lib/schema.mjs`, `lib/self-test.mjs`, `SKILL.md`, `README.md`

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

Preduslov: `[GL8]` je deploy-ovan (push → Vercel deploy-uje Next i Convex);
`ENIGMA_INGEST_*` i `ENIGMA_CONTACT_EMAIL` postavljeni (GL5 „Ručna provera").
Skill kopiju reinstalirati (`install.ps1`) — `SKILL.md` je izmenjen.

**A. Prvi test na Jovanovoj tabeli (bez Places kvote):**

```
node "C:/Users/admin/Desktop/Web Dev Projects/enigmadigital/tools/generate-leads/run.mjs" ucitaj --fajl "C:/putanja/Belgrade_Salon_Leads_100_companywall.xlsx" --nisa frizeri --od 1 --do 10
```
ili u Claude Code sesiji: `/generate-leads obogati "C:/putanja/Belgrade_Salon_Leads_100_companywall.xlsx" --od 1 --do 10`.
Očekivano: „Firmi u fajlu: 100 · ova serija: 10 (redovi 1–10)", brojači osoba/
CompanyWall/telefona, run-id `…-obogati-belgrade_salon_leads_100_companywall-1-10`.

**B.** Claude dopuni tih 10 firmi (proveri telefon/osobu iz tabele, upiši dokaze),
pa `check-site` → `geocode` → `score` → `send --run <run-id>`. `send` šalje samo
promenjene; ispiše „bez promene: N" za nepromenjene. `--sve` šalje sve.

**C. Pregled uvoza:** otvori URL iz `send` odgovora (`/leadovi/uvoz?import=<id>`).
Naziv uvoza: `generate-leads · obogati · Belgrade_Salon_Leads_100_companywall.xlsx · <datum>`.
Svaki red ima bedž **„+N polja"**; redovi sa sukobom imaju **„N sukoba"**. Iznad
tabele klikni **„samo sa sukobom"** — ostaju samo redovi koje treba presuditi
(npr. osoba sa drugom ulogom, sajt „nema"→„ima").

**D. Primeni** → 79 već uvezenih se DOPUNJUJE (ne duplira): osoba istog imena
dobija veći `roleConfidence`/telefon, ne novu osobu. Otvori firmu → sekcije
Osobe/Platforme/Poreklo pokazuju dopunu; „Poreklo" nosi `tabela:<fajl>#<red>`.

**E. Izvoz → obogaćivanje kruga:** Leadovi → Izvoz → „Izvezi CSV". Prva kolona
je `company_id`. Taj CSV se može vratiti: `ucitaj --izvoz "<izvoz.csv>" --nisa
frizeri` — spaja se po `company_id` (ključ #0), pa dopuna ide baš na te firme.

**F. Čišćenje testa:** Istorija uvoza → Poništi (vraća samo NOVO napravljene
firme; postojeće dopunjene ostaju — vidi rizike).
