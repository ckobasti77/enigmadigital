# GL9 — Posle prvog obogaćivanja: nerazrešeni redovi, procena na postojeći telefon, PR pravilo, sajt obavezan

Model: **Opus** · Effort: **high** · Mode: **acceptEdits (implementacija)** · Sesija: **nova**

Ti si u repou `enigmadigital`. Pročitaj `nocni-run/izvestaji/GL8.md` (celo),
`generate-leads-plan.md` §3.4, §3.8, §6, pa `convex/leadImportStore.ts`
(`applyImport`, `attachSkillData` :1038, `revertImport`, `setRowDecision`),
`components/app/leadovi/import-review-table.tsx`, `imports-history.tsx`,
`tools/generate-leads/lib/skor.mjs`, `lib/obogati.mjs`, `run.mjs` (`send`,
`check-site`), `SKILL.md` odeljak „obogati".

## Šta je izmereno na produkciji posle prvog `obogati` runa (100 firmi)

Uvoz `generate-leads · obogati · Belgrade_Salon_Leads_100_companywall.xlsx`,
status Primenjen. Pregled: **100 redova · 87 već u bazi · 41 nerazrešeno ·
sukobi 23**. Rezultat u tabeli leadova: 83 firme (bilo 82), **„ima procenu
telefona": 5**, **Sajt: ima 0 · nema 3 · neprovereno 80**, koordinate 45,
niša 62 (bez niše 21), Instagram 12.

U `out/<run>/firme.json`: 100 firmi, **`imaSajt` odsutan kod svih 100**,
`sajtStatus` prazan; 69 sa osobom, 67 sa `dokazi`; verovatnoće: **50 % ×46**,
15 % ×15, 70 % ×3. Kod skoro svih osoba `dokazi` = `brojUAprZapisuOsobe: true`
+ `istiBrojKaoSalon: true` + `pravniOblik: "pr"` + mobilni → 45 − 25 + 15 + 10
+ 5 = 50. `telefonSourceUrl` je CompanyWall stranica preduzetnika — dokazi su
UTEMELJENI, ali pravilo je pogrešno za PR (vidi 3).

Iz toga četiri stvari, redom:

### 1. Nerazrešeni redovi posle primene
`applyImport` preskače `decision: "nerazreseno"` (:1356) i broji ih u
`unresolvedSkippedCount`, ali (a) dugme „Primeni uvoz" ne upozorava da će 41
red biti preskočen, (b) istorija piše „Preskočeno 0", (c) posle primene ti
redovi se više ne mogu ni rešiti ni primeniti — 41 firma je ostala bez dopune.

Uradi:
- Pre primene, ako ima nerazrešenih: dijalog „N redova je nerazrešeno i neće
  biti primenjeno. Primeni ostalih M / Odustani i reši ih". Nema tihog
  preskakanja.
- Po redu novo polje `primenjenAt: v.optional(v.number())` (`OPCIONO NAMERNO`;
  odsustvo = nije primenjen). `applyImport` ga upisuje za svaki red koji je
  stvarno primenio.
- Na primenjenom uvozu redovi bez `primenjenAt` ostaju uređivi
  (`setRowDecision` dozvoljen), i postoji dugme **„Primeni preostale (N)"**
  koje primenjuje samo rešene redove bez `primenjenAt` (isti kod kao
  `applyImport`, izvučen u `applyRows(ctx, importId, samoNeprimenjeni)`).
  `revertImport` briše sve što je uvoz napravio bez obzira na to u koliko
  krugova je primenjen.
- Istorija uvoza: kolona „Preskočeno" postaje „Preskočeno / Nerazrešeno" sa
  oba broja; red sa nerazrešenim posle primene ima dugme „Reši preostale".
- Filter „samo sa sukobom" (GL8) dobija i „samo nerazrešeni".

### 2. Procena telefona na postojeći broj
`attachSkillData` pri `spoji` dodaje telefon sa `verovatnoca*` samo „ako ga
još nema" (:1187). Kod 87 spojenih firmi broj VEĆ POSTOJI (isti broj iz
prvog uvoza tabele), pa procena nije upisana nigde — zato „ima procenu: 5".

Uradi: kad postojeći `leadIdentities` `kind: "phone"` ima isti
`valueNormalized` kao telefon osobe iz reda, a nema `verovatnoca` niti
`nijeMoguceProceniti` — upiši `verovatnoca`, `verovatnocaObrazlozenje`,
`verovatnocaIzvor: "skill"`, `verovatnocaAt`, i `personId` ako ga identitet
nema (a osoba je pronađena/napravljena). Ako identitet već ima procenu od
čoveka (`verovatnocaIzvor: "covek"`) — ne diraj. Ako ima procenu od skilla —
prepiši samo ako je nova `verovatnocaAt` novija. Provenance red za svaku
promenu. Ovo mora da radi i za rezim `discover` (isti kod).

### 3. Pravilo §6 za preduzetnike (PR)
Za `pravniOblik: "pr"` firma i osoba su ista pravna ličnost — broj u
CompanyWall zapisu preduzetnika JESTE broj firme, pa `istiBrojKaoSalon` ne
sme da oduzima 25. Trenutno svaki PR sa mobilnim završava na tačno 50 %, a
obrazloženje kaže „verovatnije linija firme nego lični" — što je za
preduzetnika besmisleno.

Uradi u `lib/skor.mjs` i u `generate-leads-plan.md` §6 (isti tekst na oba
mesta):
- `istiBrojKaoSalon` oduzima 25 samo kad `pravniOblik !== "pr"`; za PR daje 0
  i obrazloženje kaže „Firma je preduzetnička radnja, pa je broj firme ujedno
  broj vlasnika."
- Rezultat za tipičan PR (APR zapis + mobilni + PR + dva izvora) postaje
  45+15+10+5 = 75. Za DOO sa istim dokazima ostaje 50.
- `self-test`: slučaj „isti broj kao salon = nisko" ostaje ali sa
  `pravniOblik: "doo"`; novi slučaj PR + isti broj = 75. Ažuriraj očekivanja.
- `score` dobija `--ponovo` koji preračuna verovatnoće u postojećem
  `firme.json` bez ponovnog čitanja izvora (dokazi su već tu), da se ovih 100
  ne istražuje iz početka.

### 4. `imaSajt` je obavezan u oba režima
U `obogati` runu Claude nije uradio §3.4 ni za jednu firmu: `imaSajt` fali
kod svih 100, `check-site` nije imao šta da proveri. „Nema sajt" je glavni
prodajni signal Enigme i ne sme da ostane neproveren.

Uradi:
- `SKILL.md` (oba toka): korak „postojanje sajta" je obavezan po firmi, sa
  tri izvora — u `obogati` bez Placesa: CompanyWall polje sajt, 011info,
  web pretraga „naziv + grad" (WebSearch). Rezultat `da`/`ne`/`nepoznato` +
  `imaSajtNapomena` koja imenuje proverene izvore.
- `send` odbija slanje ako neka firma nema `imaSajt` („imaSajt fali kod N
  firmi — vrati se na korak sajta ili pošalji sa `--dozvoli-bez-sajta`").
  Isto u `self-test`.
- Nov način rada `obogati --polja sajt` (i uopšte `--polja
  sajt,osobe,platforme,koordinate` — podskup): Claude istražuje SAMO ta polja,
  `send` šalje samo njih (ostalo se ne dira), `firme.ulaz.json` poređenje
  ograničeno na ta polja. Cilj: ovih 100 firmi dobija `imaSajt` + `sajtStatus`
  za ~15 minuta, ne za sat.
- `send` u režimu `obogati` uz `--polja` postavlja `upit.polja` (novo
  opciono polje u zod šemi + `lib/schema.mjs`), a `attachSkillData` za takav
  uvoz dira samo ta polja — nikad ne prepisuje ostatak praznim.

### 5. Provera
`typecheck`, `verify:purge`, `verify:gl-ingest` (+ slučaj `upit.polja`),
`verify:gl-skill` (PR slučaj, `--ponovo`, `--polja`, odbijanje bez `imaSajt`).
Izveštaj sa koracima za Jovana:
1. Istorija uvoza → obogati uvoz → „Reši preostale" → filter „samo
   nerazrešeni" → rešiti 41 red → „Primeni preostale".
2. `node run.mjs score --run 2026-09-08-obogati-belgrade-salon-leads-100-companywall --ponovo`
   pa `send --run … --sve` (samo procene; potvrdi da `attachSkillData` iz 2
   upiše procenu na postojeće brojeve).
3. `/generate-leads obogati "<xlsx>" --nisa frizeri --polja sajt` → pregled →
   Primeni. Očekivano posle: „neprovereno" ≈ 0, „nema sajt" ≫ 3.

## Kriterijum gotovosti
1, 2, 3, 4 sve obavezno — svaka tačka zasebno rešava nešto što je već
izmereno kao gubitak podataka. Ako 4 (`--polja`) ne stigneš do kraja,
uradi bar obavezan `imaSajt` + odbijanje u `send`, i to zapiši.
