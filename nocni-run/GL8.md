# GL8 — Skill režim `obogati`: postojeća tabela → dopuna → spajanje u aplikaciji

Model: **Opus** · Effort: **high** · Mode: **acceptEdits (implementacija)** · Sesija: **nova**

Ti si u repou `enigmadigital`. Pročitaj `nocni-run/izvestaji/GL1.md` (odluke
3–6 o `createImportCore`, `attachSkillData`, spajanju), `GL5.md` i `GL6.md`
(skill), pa `generate-leads-plan.md` §3, §4.4, §5, §6, §10. Pročitaj celo
`tools/generate-leads/SKILL.md`, `run.mjs`, `lib/schema.mjs`, `lib/places.mjs`,
`convex/lib/generateLeadsIngest.ts`, i `convex/leadImportStore.ts` funkcije
`matchRowToExistingCompany`, `detectRowConflicts`, `createImportCore`,
`applyImport` (+ `attachSkillData`). Pročitaj i `convex/lib/leadImportParse.ts`
(kako se XLSX kolone mapiraju u `ParsedLeadRow` — ista logika treba skillu).

## Zašto
Jovan ima tabelu od 100 frizerskih/kozmetičkih salona u Beogradu
(`Belgrade_Salon_Leads_100_companywall.xlsx`, 79 već uvezeno u aplikaciju).
Kolone: `#`, `Ime_Salona`, `Lokacija`, `Telefon` (100/100), `Ime_osobe`
(67/100), `Pozicija` (67/100), `Ocena` (tekst „4,8 (120 recenzija)"),
`Napomena_za_prodaju`, `Izvor_podataka` (deo CompanyWall URL-ovi, deo tekst).
List „Svi lidovi (100)" ima naslov u redu 1 i zaglavlje u redu 2; ostali
listovi su podskupovi (batchevi) — čitaš SAMO prvi list. Nema PIB-a, mejla,
sajta, koordinata, statusa sajta, verovatnoće telefona, platformi.

Skill danas kreće samo od Placesa. Treba drugi ulaz: postojeći redovi
(tabela ili CSV izvoz iz aplikacije), pa isti tok dopune, pa slanje —
aplikacija ih spoji sa postojećim firmama.

## Uradi, ovim redom

### 1. `run.mjs ucitaj --fajl <putanja.xlsx|.csv> [--list "Svi lidovi (100)"]`
- Bez novih zavisnosti ako je moguće: CSV ručno; za XLSX koristi
  `xlsx`/`exceljs` samo ako već postoji u `package.json` repoa (proveri) —
  inače dodaj **jednu** zavisnost u `tools/generate-leads/package.json`
  (skill ima svoj `package.json`? ako nema, napravi ga sa `"type":"module"` i
  tom jednom zavisnošću; `install.ps1` tada radi i `npm install` u tom
  folderu). Zapiši odluku.
- Detekcija zaglavlja: prvi red koji ima ≥ 4 popunjene ćelije od kojih je
  jedna „Ime"/„Naziv"/„Telefon" (kao `leadImportParse.ts` — prenesi to
  pravilo, ne izmišljaj drugo). Mapiranje kolona po istim sinonimima kao
  aplikacija (`Ime_Salona`→`nazivFirme`, `Lokacija`→`ulica`/`opstina`/`grad`
  razdvajanje po zarezu, `Telefon`, `Ime_osobe`+`Pozicija`→ osoba sa
  `ulogaIzvor: "tabela"`, `Ocena`→`ocena {vrednost, brojRecenzija}` regexom,
  `Napomena_za_prodaju`→`napomena`, `Izvor_podataka`→ `companyWallUrl` ako
  je URL sa companywall, inače u `izvori[]`).
- Rezultat: `out/<run-id>/firme.json` u ISTOM obliku koji Claude popunjava u
  `discover` toku, sa poljem `poreklo: "tabela"` po firmi i `sourceUrl` za
  vrednosti iz tabele = `tabela:<naziv fajla>#<red>` (aplikacija to prikazuje
  kao poreklo „iz tabele"). Run-id: `<datum>-obogati-<naziv fajla bez ext>`.
- Ispis: broj redova, koliko ima osobu, koliko ima CompanyWall link, koliko
  ima telefon, upozorenje za redove bez naziva (preskaču se, sa brojem reda).

### 2. `run.mjs ucitaj --izvoz <csv iz aplikacije>`
Isti izlaz, ali iz „Izvezi CSV" (`convex/leadExportStore.ts` — proveri koje
kolone izvozi; ako nema `companyId`/`companyWallUrl`, dodaj ih u izvoz kao
prve kolone). Kad postoji `companyId`, ide u red kao `postojecaFirmaId` —
ingest ga prosleđuje, `matchRowToExistingCompany` ga koristi kao ključ #0
(ispred PIB-a), sa proverom da firma pripada tom workspaceu.

### 3. Tok obogaćivanja u `SKILL.md`
`/generate-leads obogati <fajl>` (ili „obogati postojeće leadove",
„dopuni tabelu"):
- `proveri-env` (bez Places ključa — Places se u ovom režimu ne zove, osim
  uz `--place-id` zastavicu: 1 Text Search po firmi samo da nađe `placeId`;
  podrazumevano isključeno; ispisuje se cena u pozivima pre nego što krene).
- `ucitaj` → Claude za svaku firmu radi ISTO što i u `discover` toku
  (§3.4 sajt sa tri izvora, CompanyWall/APR, 011info, sajt firme, profili),
  ali sa dva dodatka: **proverava** vrednosti iz tabele (telefon, osoba,
  uloga) i upisuje `dokazi` za njih kao za svaku drugu; i **ne briše** ništa
  iz tabele — ako izvor kaže drugačije, obe vrednosti idu dalje (nova kao
  primarna, stara u `napomena` sa „tabela je imala: …"), aplikacija to
  prikaže kao sukob.
- `check-site` → `geocode` → `score` → `send`.
- `send` u ovom režimu šalje SAMO redove koji imaju bar jednu NOVU ili
  PROMENJENU vrednost u odnosu na ulaz (poredi `firme.json` posle dopune sa
  snimkom posle `ucitaj`, koji se čuva kao `firme.ulaz.json`). Red bez
  promene se preskače i broji („bez promene: N"). Zastavica `--sve` šalje
  sve.
- `upit` u telu: `{ grad: <iz tabele, najčešći>, nisa: <slug iz
  --nisa ili pitanje>, brojTrazen: <broj redova>, filterSajt: "svejedno",
  rezim: "obogati", izvorFajl: <naziv fajla> }`. `rezim` i `izvorFajl` su
  nova opciona polja u zod šemi (`convex/lib/generateLeadsIngest.ts`) i u
  `lib/schema.mjs`. `fileName` uvoza: `generate-leads · obogati ·
  <naziv fajla> · <datum>`.
- STOP tačke kao u GL5, plus: posle `ucitaj` Claude ispiše rezime tabele i
  pita da li da nastavi (100 firmi = ~100 CompanyWall + ~60 sajt poziva —
  trajanje i kvota se kažu unapred). Dozvoljeno `--od 1 --do 25` za rad u
  serijama; svaka serija je svoj run-id sufiks.

### 4. Aplikacija — spajanje
- `matchRowToExistingCompany`: novi ključ #0 `postojecaFirmaId` (vidi 2).
  Ostalo nepromenjeno (CompanyWall URL, PIB, domen, naziv+grad, telefon).
- `detectRowConflicts` mora da pokrije i nova polja: osoba sa istim imenom a
  drugom ulogom, telefon osobe koji se razlikuje, `imaSajt` koji prelazi
  `ne`→`da`. Sukob nosi `izvor` = `sourceUrl` nove vrednosti.
- `attachSkillData` pri `spoji`: ostaje pravilo iz GL1 (prazno se dopuni,
  sajt se prepiše ako je provera novija, ostalo ne) — plus: osoba koja već
  postoji (isto normalizovano ime) se NE duplira; dobija `roleConfidence`
  višu ako novi izvor to opravdava, i telefon sa `verovatnoca*` ako ga nema.
  `leadFieldProvenance` dobija red za svako novo/promenjeno polje.
- Pregled uvoza (`import-review-table.tsx`): za `rezim: "obogati"` red
  prikazuje šta je NOVO (bedž „+3 polja") i šta je SUKOB, da se 100 redova
  pregleda za pet minuta, ne za sat. Filter „samo sa sukobom" iznad tabele.
- `revertImport` za spojene firme: vraća SAMO ono što je ovaj uvoz dodao
  (provenance red zna) — ne briše firmu koja je postojala pre. Proveri da
  postojeća logika to već radi; ako briše celu firmu pri poništavanju
  spojenog uvoza, to je bug koji popravljaš sada.

### 5. Testovi
- `self-test`: `ucitaj` nad malim izmišljenim XLSX/CSV (napravi ga u
  `tools/generate-leads/test/`, 5 redova, lažni podaci, sa naslovom u redu
  1 i zaglavljem u redu 2 kao Jovanova tabela); mapiranje kolona; `Ocena`
  regex („4,8 (120 recenzija)", „4.8", prazno); razlika ulaz/izlaz za
  „samo promenjeni"; zod poklapanje sa novim poljima.
- `scripts/generate-leads-ingest-check.ts`: slučaj `rezim: "obogati"` sa
  `postojecaFirmaId` (validan) i sa tuđim id-jem (mora pasti u mutaciji —
  opiši kako se to ručno proverava, jer skripta nema bazu).

### 6. README + SKILL.md
Odeljak „Obogaćivanje postojeće tabele": komanda, šta se šalje, šta se
vidi u pregledu, kako se radi u serijama, koliko traje.

## Kriterijum gotovosti
1, 3, 4 obavezno. 2 obavezno bar u delu `companyId` u CSV izvozu (ceo `--izvoz`
može u izveštaj ako ne stigneš). 5 obavezno za `ucitaj` i zod. Izveštaj
ima korake za Jovana: `/generate-leads obogati "<putanja do xlsx>" --od 1
--do 10` kao prvi test, pa gde da gleda sukobe.
