# GL9 — Posle prvog obogaćivanja: nerazrešeni redovi, procena na postojeći telefon, PR pravilo, sajt obavezan

Datum: 09.09.2026. · Grana: `main` · Model: Opus, effort high · Sesija: nova

Sve četiri obavezne tačke (1, 2, 3, 4) su urađene, uključujući pun `--polja`
režim iz tačke 4. Provere: `npm run typecheck` prolazi bez grešaka,
`npm run verify:purge` prolazi (135 tabela), `npm run verify:gl-ingest` (sada 9
slučajeva) i `npm run verify:gl-skill` (sada **192** provere) prolaze. `npx eslint`
nad mojim fajlovima ne prijavljuje nijednu NOVU grešku ni upozorenje (zatečeno je
niže).

Pre-flight pročitano: `nocni-run/izvestaji/GL8.md`, `generate-leads-plan.md`
§3.4/§3.8/§4.4/§5/§6, `convex/leadImportStore.ts` (`applyImport`, `attachSkillData`,
`revertImport`, `setRowDecision`, `listImports`), `convex/schema.ts`
(`leadImports`/`leadImportRows`), `convex/http.ts` (ingest ruta),
`convex/lib/generateLeadsIngest.ts`, `components/app/leadovi/import-review-table.tsx`,
`imports-history.tsx`, `import-row-dialog.tsx`, `tools/generate-leads/`
(`run.mjs`, `lib/skor.mjs`, `lib/obogati.mjs`, `lib/schema.mjs`, `lib/tabela.mjs`,
`lib/self-test.mjs`, `SKILL.md`), `scripts/generate-leads-ingest-check.ts`.

---

## 1. Nerazrešeni redovi posle primene — urađeno

- **Novo polje po redu `leadImportRows.primenjenAt: v.optional(v.number())`**
  (`OPCIONO NAMERNO`; odsustvo = red još nije primenjen). `applyImport` ga upisuje
  za svaki red koji je stvarno primenio (i `nova_firma` i `spoji`).
- **Jezgro primene izvučeno u `applyRows(ctx, {…, samoNeprimenjeni})`**. Telo
  petlje je preneto bez izmene (aliasi `args`/`membership` da se ne dira ~500
  linija logike). `applyImport` zove `applyRows` sa `samoNeprimenjeni:false` pa
  postavlja status; **nova mutacija `applyRemainingRows`** zove ga sa
  `samoNeprimenjeni:true` (preskače redove koji već imaju `primenjenAt`), status
  ostaje „primenjen".
- **Dijalog „Primeni uvoz"**: kad ima nerazrešenih, tekst je sada „N redova je
  nerazrešeno i neće biti primenjeno; primenjuje se M rešenih", dugme potvrde je
  **„Primeni ostalih M"**, a otkazivanje **„Odustani i reši ih"**. Nema tihog
  preskakanja.
- **Na primenjenom uvozu redovi bez `primenjenAt` ostaju uređivi**: `setRowDecision`
  odbija samo redove koji već imaju `primenjenAt`; u pregledu se u modalu „Detalji"
  (jezičak „Trag") pojavljuje **izbornik za promenu odluke** za takve redove
  (dotad plumbovan `onDecisionChange` nije imao kontrolu — sada je ima). Iznad
  tabele je dugme **„Primeni preostale (N)"** kad ima rešenih neprimenjenih redova.
- **Istorija uvoza**: kolona „Preskočeno" je sada „Preskočeno / Nerazrešeno" sa
  oba broja (`listImports` vraća `nerazresenoCount` po uvozu); primenjen uvoz sa
  nerazrešenima dobija dugme **„Reši preostale (N)"** koje otvara pregled.
- **Filter „samo nerazrešeni"** dodat pored „samo sa sukobom" (GL8); postojeći
  brojač „nerazrešeno" je pretvoren u dugme-filter.
- **`revertImport`** poništava sve što je uvoz napravio bez obzira na krug:
  tolerancija od 10 s se sada računa od `red.primenjenAt` (ne od `importDoc.appliedAt`),
  pa firma napravljena u drugom krugu ne biva lažno proglašena „izmenjenom posle
  uvoza" i preskočena.

## 2. Procena telefona na postojeći broj — urađeno

- `attachSkillData` sada, pored ubacivanja novog telefona, **upisuje procenu na
  broj koji već postoji** na firmi (funkcija `obradiTelefonOsobe`): kad postoji
  `leadIdentities kind:"phone"` sa istim (normalizovanim) brojem, upisuje se
  `verovatnoca`/`nijeMoguceProceniti`, `verovatnocaObrazlozenje`,
  `verovatnocaIzvor:"skill"`, `verovatnocaAt`, i `personId` ako ga identitet nema.
  Poređenje ide preko `normalizePhoneRs` sa obe strane (broj iz prvog uvoza ima
  sirov `valueNormalized`).
- **Ljudska procena (`verovatnocaIzvor:"covek"`) se ne dira.** Skill procenu
  prepisuje samo ako je nova `verovatnocaAt` novija. Provenance red za svaku
  promenu (`fieldName:"verovatnoca"`, vrednost je broj/„nije moguće proceniti", ne
  sirov telefon).
- **Radi i za `discover`** (isti kod): kad je telefon osobe = broj firme koji je
  nova_firma grana upravo upisala, procena ide na taj identitet umesto da se izgubi.

## 3. Pravilo §6 za preduzetnike (PR) — urađeno

- `lib/skor.mjs`: `istiBrojKaoSalon` oduzima −25 **samo kad `pravniOblik !== "pr"`**.
  Za PR ne oduzima ništa, a druga rečenica obrazloženja glasi „Firma je
  preduzetnička radnja, pa je broj firme ujedno broj vlasnika." Tipičan PR (APR
  zapis + mobilni + PR + dva izvora) sada daje **45+15+10+5 = 75**; DOO sa istim
  dokazima ostaje 50.
- `generate-leads-plan.md` §6: isti tekst upisan uz stavku −25.
- `self-test`: slučaj „isti broj kao salon = nisko" zadržan ali sa
  `pravniOblik:"doo_vise_osnivaca"` (dokaz da za DOO −25 i dalje važi); dodat nov
  slučaj „PR + isti broj = 75".
- `score` dobio **`--ponovo`** — preračuna verovatnoće nad dokazima koji su već u
  `firme.json`, bez čitanja izvora, i ispiše podsetnik da se pošalje `send --sve`.

## 4. `imaSajt` obavezan u oba režima — urađeno (+ `--polja`)

- `SKILL.md` (oba toka): korak „postojanje sajta" je izričito **obavezan po firmi**;
  u `obogati` bez Placesa tri izvora su CompanyWall polje „sajt", 011info i web
  pretraga „naziv + grad" (WebSearch); rezultat `da`/`ne`/`nepoznato` +
  `imaSajtNapomena` koja imenuje proverene izvore.
- `send` **odbija slanje ako ijednoj firmi fali `imaSajt`** („imaSajt fali kod N
  firmi — vrati se na korak sajta ili pošalji sa `--dozvoli-bez-sajta`"). Zahtev
  važi za pun uvoz i za `--polja sajt`; kad `--polja` ne uključuje sajt, `imaSajt`
  se ne traži. Provera je čista funkcija `firmeBezImaSajt` (testirana u `self-test`).
- **Nov način rada `obogati --polja sajt`** (i podskup `sajt,osobe,platforme,
  koordinate`): `ucitaj --polja` beleži polja u `run.json`; Claude istražuje samo
  ta polja; `send` šalje samo njih (+ ključeve za spajanje) i poredi ulaz↔izlaz
  samo po njima (`promenjeneFirme(…, polja)`); `upit.polja` (novo opciono polje u
  zod šemi + `lib/schema.mjs`) putuje sa telom; `leadImports.polja` se čuva, a
  `attachSkillData` za takav uvoz dira samo ta polja (guard `diraj()`), nikad ne
  prepisuje ostatak praznim.

## 5. Provere — urađeno

- `typecheck` ✓, `verify:purge` ✓ (135 tabela), `verify:gl-ingest` ✓ (9 slučajeva,
  + `upit.polja` propuštanje i odbijanje nepoznatog polja), `verify:gl-skill` ✓
  (192 provere: PR slučaj, DOO slučaj, `--polja` razlika + zod parnost,
  `firmeBezImaSajt`).

---

## Odluke koje sam doneo sam (nisu doslovno u promptu)

1. **`applyRemainingRows` NE pomera `importDoc.appliedAt`.** Prvi krug ostaje
   referenca; svaki red nosi svoj `primenjenAt`, a `revertImport` toleranciju
   računa po redu. Alternativa (pomeranje `appliedAt`) bi pokvarila revert-toleranciju
   za redove iz prvog kruga.
2. **`revertImport` tolerancija je per-red (`r.primenjenAt`), ne per-uvoz.** Bez
   toga bi firme napravljene u drugom krugu bile preskočene pri poništavanju —
   prompt izričito traži da revert briše sve bez obzira na krug.
3. **Izbornik za promenu odluke** je dodat u modal „Detalji" (jezičak „Trag"),
   jer je `onDecisionChange` bio plumbovan ali bez ijedne kontrole — bez njega
   „Reši preostale" ne bi imalo čime da se reši. Konzervativno: samo za redove
   koji smeju da menjaju odluku (`canEditDecision`).
4. **`--polja` ne šalje `telefon` firme ni `nisa` po redu** kad grupa „osobe"
   nije izabrana. Cilj je da prolaz po jednom polju ne doda telefone/nišu izvan
   obima; ključevi za spajanje (naziv, grad, opština, ulica, `postojecaFirmaId`,
   CompanyWall, PIB) se uvek šalju.
5. **`score --ponovo` nema poseban efekat na sam izračun** (isti `oceniOsobe`),
   nego je samo-dokumentujuća zastavica sa dodatnim ispisom „preračunato bez
   čitanja izvora; pošalji `--sve`". Nije mrtvo dugme — pokreće preračun i vodi ka
   sledećem koraku.
6. **`--polja` slučaj u `self-test` koristi `invalid_value` za nepoznato polje**
   (zod v4), poklopljeno sa `lib/schema.mjs`; potvrđeno kroz obe kopije šeme.

## Poznati rizici i šta NIJE urađeno

- **Ništa nije provereno u browseru ni na živim podacima.** Nema tokena ni
  Jovanove tabele; `npx convex dev/deploy/env` su zabranjeni. Tvrdnje o UI-ju i o
  spajanju su čitanje koda + `self-test`/`verify` nad izmišljenim podacima.
- **README.md nije dopunjen za `--polja`** (prompt traži samo `SKILL.md` za tačku
  4). SKILL.md je izmenjen, pa skill kopiju treba reinstalirati (`install.ps1`).
- **`--polja` merge ostaje ne-destruktivan po dizajnu** — postojeća logika
  `applyImport` već samo dopunjuje prazna polja i osvežava stanje sajta ako je
  novije; `polja` dodatno sprečava kreiranje osoba/platformi izvan obima. Nije
  proveravano nad realnim spajanjem u browseru.
- **Zatečene lint stavke (nisu moje)**, u fajlovima koje sam dirao:
  `import-row-dialog.tsx` `react/no-unescaped-entities` (dve, postojale pre GL9,
  samo pomerene linije); `import-review-table.tsx` mrtvo `revert*` stanje (GL1);
  `imports-history.tsx` neiskorišćene ikone `Clock`/`ExternalLink`/`History`/
  `ShieldAlert` (postojale pre GL9); `leadImportStore.ts` neiskorišćeni
  `LEAD_SIGNAL_KINDS`/`MatchOn`/`SuppressionCheckResult` (GL1/GL6). Nisu dirane.

## Dodati fajlovi
- `nocni-run/izvestaji/GL9.md`

## Izmenjeni fajlovi
- `convex/schema.ts` (`leadImports.polja`, `leadImportRows.primenjenAt`)
- `convex/lib/generateLeadsIngest.ts` (`upit.polja`)
- `convex/leadImportStore.ts` (`applyRows` refaktor + `applyRemainingRows`,
  `primenjenAt`, procena na postojeći telefon, `polja` guard, `setRowDecision`
  guard, `revertImport` per-red tolerancija, `listImports.nerazresenoCount`)
- `convex/http.ts` (`polja` u ingest ruti)
- `components/app/leadovi/import-review-table.tsx` (Primeni preostale, filter
  „samo nerazrešeni", dijalog labeli, `canEditDecision`)
- `components/app/leadovi/imports-history.tsx` (kolona + „Reši preostale")
- `components/app/leadovi/import-row-dialog.tsx` (izbornik promene odluke)
- `scripts/generate-leads-ingest-check.ts` (+2 slučaja `upit.polja`)
- `tools/generate-leads/run.mjs` (`ucitaj --polja`, `score --ponovo`, `send`
  imaSajt guard + `--dozvoli-bez-sajta` + `--polja` + pomoć)
- `tools/generate-leads/lib/skor.mjs` (PR pravilo)
- `tools/generate-leads/lib/obogati.mjs` (`polja` u razlici, `firmeBezImaSajt`)
- `tools/generate-leads/lib/schema.mjs` (`upit.polja`)
- `tools/generate-leads/lib/self-test.mjs` (PR/DOO/`--polja`/`firmeBezImaSajt`)
- `tools/generate-leads/SKILL.md`, `generate-leads-plan.md` (§6 PR, imaSajt, `--polja`)

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

Preduslov: `[GL9]` je deploy-ovan (push → Vercel deploy-uje Next i Convex). Skill
kopiju reinstalirati (`install.ps1`) — `SKILL.md` je izmenjen.

1. **Nerazrešeni:** Istorija uvoza → obogati uvoz koji ima nerazrešene → „Reši
   preostale" → filter „samo nerazrešeni" → za svaki red „Detalji" → jezičak „Trag"
   → izbornik „Promeni odluku" (nova firma / dopuna / preskoči) → nazad na tabelu
   → dugme „Primeni preostale (N)". Broj u koloni „Preskočeno / Nerazrešeno" pada
   ka nuli; poništavanje uvoza (Poništi) briše i firme napravljene u drugom krugu.
2. **Procena na postojeći broj:**
   `node run.mjs score --run 2026-09-08-obogati-belgrade-salon-leads-100-companywall --ponovo`
   pa `send --run … --sve`. Otvori dopunjenu firmu → sekcija „Osobe/telefon":
   broj koji je već postojao sada nosi procenu (`verovatnocaIzvor: skill`). „Ima
   procenu telefona" u tabeli leadova raste znatno iznad 5.
3. **Sajt obavezan + `--polja`:**
   `/generate-leads obogati "<xlsx>" --nisa frizeri --polja sajt` → Claude popuni
   samo `imaSajt`/`sajtStatus` → pregled → Primeni. Očekivano posle: „neprovereno"
   ≈ 0, „nema sajt" ≫ 3. Ako pokušaš `send` a nekoj firmi fali `imaSajt`, komanda
   staje sa porukom „imaSajt fali kod N firmi".
