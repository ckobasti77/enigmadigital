# GL1 — Šema, ingest endpoint, niše backend, tokeni za uvoz

Datum: 08.09.2026. · Grana: `main` · Model: Opus, effort high

Sve iz tačaka 1–7 je urađeno. `npm run typecheck`, `npm run verify:purge` i
novi `npm run verify:gl-ingest` prolaze.

---

## 1. Pre-flight

**`git status` je bio čist na `main`** (poslednji komit `78afce1`). Ništa tuđe
nije dirano.

**Sumnja na regresiju temperature — NEMA BUGA.** Šta sam tačno proverio:

| Karika | Nalaz |
| --- | --- |
| `convex/leadCrmStore.ts` `listByStage` (:1322) i `listOverdue` (:1403) | Svaki red vraća `company` kao CEO `Doc<"leadCompanies">` iz `ctx.db.get(assignment.companyId)`. Nema `pick`-a polja, pa `temperatura` stiže kakva jeste. |
| `components/app/leadovi/lead-urgency.ts:32` `LeadRowItem` | `company: Doc<"leadCompanies"> \| null` — tip ne odseca `temperatura`. |
| `components/app/leadovi/leads-table.tsx:785` | `value={company.temperatura}` — čita se sa firme, ne iz lokalnog stanja. |
| `components/app/leadovi/lead-chips.tsx:80` `TemperatureSelect` | `const temp = value ?? "nova_firma"` — fallback se okida SAMO kad polje stvarno ne postoji. |

Fallback na `nova_firma` je ispravan, ne bug: po šemi (`schema.ts`,
`leadCompanies.temperatura`) polje je `v.optional`, a njegovo odsustvo znači
„čovek još nije odlučio" — što je tačno ono što `nova_firma` i znači. Vreme
promene (`temperaturaPromenjenaAt`) se pri uvozu upisuje samo kad je
temperatura stvarno izabrana, pa red bez odluke ne dobija lažan trenutak
odlučivanja. Zaseban komit nije bio potreban.

## 2. Šema (§4.1–§4.3)

`convex/schema.ts`:

- **`leadCompanies` +** `lat`, `lng`, `koordinateIzvor`, `koordinateAt`,
  `placeId`, `nicheId`, `imaSajt`, `imaSajtNapomena`, `sajtStatus`,
  `sajtHttps`, `sajtProverenAt`, `sajtNapomena`; novi indeks
  `by_workspace_niche` (`workspaceId`, `nicheId`).
- **`leadIdentities` +** `"tiktok"` u `kind`; `verovatnoca`,
  `verovatnocaObrazlozenje`, `verovatnocaIzvor`, `verovatnocaAt`,
  `nijeMoguceProceniti`.
- **`leadSignals.kind` +** `sajt_ne_radi`, `sajt_bez_https`.
- **Četiri nove tabele:** `niches` (`by_workspace`, `by_workspace_slug`),
  `nichePlatforms` (`by_workspace`, `by_niche`), `ingestTokens` (`by_hash`,
  `by_workspace`), `leadFilterPresets` (`by_workspace`).

Svako novo polje je `v.optional` sa `OPCIONO NAMERNO` komentarom koji kaže šta
znači odsustvo.

**`tiktok` — sva mesta koja granaju po `kind`.** Prošao sam kroz sve:
`leadCrmStore.ts:1173`, `leadGapsStore.ts:134/138/263/268`,
`leadExportStore.ts:240–246`, `lead-detail.tsx:141/170/176`,
`leadInboundStore.ts:463` — sve su `=== "phone"` / `=== "website"` poređenja
i nijedno ne puca. Dva mesta su morala da se dopune:

- `components/app/leadovi/lead-labels.ts` — `IDENTITY_KIND_LABELS.tiktok`
  („TikTok") i `LEAD_SIGNAL_LABELS` za oba nova signala. `LEAD_SIGNAL_LABELS`
  je `Record<LeadSignalKind, string>`, pa je **tsc sam oborio build** dok nisam
  dodao natpise — to je i bio dokaz da su mesta pronađena.
- `components/app/leadovi/lead-identities-panel.tsx` — `getKindIcon` je dobio
  `case "tiktok"` (`lucide-react` nema brend ikonice, pa je nota nacrtana ručno,
  isto kao postojeći `InstagramIcon`/`FacebookIcon`).

## 3. Validator i staging (§4.4)

- `parsedLeadRowValidator` i `leadImportRows.parsed` prošireni istim skupom
  polja (`placeId`, `nisa`, `imaSajt*`, `sajt*`, `koordinate`, `platforme`,
  `osobe`, `izvestajSkilla`), sve opciono. Isti skup dodat i u interfejs
  `ParsedLeadRow` (`convex/lib/leadImportParse.ts`).
- **`createImportCore(ctx, args)`** — obična funkcija, ne Convex funkcija. Zovu
  je i postojeća `createImport` mutacija i nova `createImportFromIngest`
  internalMutation. Ponašanje postojeće mutacije je nepromenjeno: isti
  argumenti, isti povratni oblik `{ importId, rowsCount }`, isti redosled
  koraka (match → sukobi → suppression → odluka → upis). Jedina razlika je što
  `uploadedBy` sada stiže kao argument umesto da se čita iz `requireMembership`
  unutar jezgra — a `createImport` mu prosleđuje tačno `membership.userId`.
- **`applyImport`** prenosi sve po §4.4: koordinate → `lat/lng/koordinateIzvor/
  koordinateAt`, `placeId`, niša (upsert po slugu), `imaSajt` +
  `sajtStatus/sajtHttps/sajtProverenAt/sajtNapomena`, platforme →
  `leadIdentities` po vrsti, osobe → `leadPeople` (`roleConfidence:
  "potvrdjeno"` samo kad `ulogaIzvor` sadrži CompanyWall/APR) + telefon osobe →
  `leadIdentities` sa `personId` i `verovatnoca*`.
- **Signali:** `nema_sajt` isključivo za `imaSajt === "ne"`; `sajt_ne_radi` za
  `ne_radi` i `parkiran`; `sajt_bez_https` za `sajtHttps === false`. Za
  `imaSajt: "nepoznato"` se NE upisuje ništa.
- **`DEFAULT_ICP_RULES`** dobio dva Fit pravila sa obrazloženjem: „Sajt ne radi
  ili je parkiran" (težina 28) i „Sajt bez HTTPS-a" (12). Ukupno 14 (8 fit + 6
  intent); brojevi u `scoring-rules-panel.tsx` su usklađeni.
- **„Dodaj nedostajuća podrazumevana pravila"** — novi query
  `missingDefaultIcpRules` + mutacija `addMissingDefaultIcpRules`
  (`leadScoringStore.ts`) i dugme `MissingDefaultsButton` u
  `scoring-rules-panel.tsx`. Poređenje je po `signalKind`, ne po nazivu (čovek
  sme da preimenuje pravilo). Dugme se ne crta kad ništa ne fali ni dok se
  upit učitava.
- **`revertImport`** briše i ono što je `applyImport` novo napravio. Postojeća
  petlja već briše SVE identitete, osobe i signale kreirane firme, pa nove
  osobe/platforme/telefoni padaju pod nju. **Popravio sam i staru rupu:**
  provenance se brisao samo za `entityId === company._id`, pa su redovi porekla
  za osobe i telefone ostajali kao siročad. Sa GL1 ih po firmi ima do tri puta
  više, pa se sada briše poreklo za firmu **i** za sve njene obrisane osobe i
  identitete. Niša se NE briše — ostaje kao entitet; `nicheId` nestaje sa
  firmom.
- **`import-review-table.tsx`** — pet novih kolona (Niša, Sajt, Koord., Osobe,
  Platforme). Sajt piše „ima · radi", „ima · ne radi", „ima · parkiran",
  „ima · vodi na mrežu", „nema", „nepoznato", a red bez podatka „—".
  Koordinate su ✓/— (broj geografske širine u tabeli nikome ništa ne znači;
  pun par je u `title`). Osobe su „Ime · 72 %" ili „Ime · bez procene" (nikad
  „0 %"). Ponašanje temperature i brisanja redova nije dirano.

## 4. Ingest endpoint (§5)

`POST /generate-leads/ingest` u `convex/http.ts` (Route 7):

1. `Authorization: Bearer <token>` → `sha256Hex` → `ingestTokens.by_hash`,
   `revokedAt === undefined`. **401** `{ greska: "neispravan token" }` za sva
   četiri slučaja („nema zaglavlja", „nije Bearer", „nepoznat", „opozvan") —
   razlika bi pogađaču potvrdila šta je pogodio.
2. `claimPublicRouteCall` preko `internal.publicRouteLimit.claimRouteCall`
   (http akcija nema `MutationCtx`), ruta `"generate-leads"`, novi
   `GENERATE_LEADS_HOURLY_CAP = 30` u `publicRouteLimit.ts`. Preko → **429**.
3. Zod šema u `convex/lib/generateLeadsIngest.ts`; izvezen i TS tip
   (`GenerateLeadsIngestBody`, `GenerateLeadsIngestRow`). Neispravno →
   **400** sa listom putanja polja (`redovi.0.osobe.0.telefonSourceUrl:
   custom`), **bez ijedne vrednosti iz tela**.
4. **200** `{ importId, rowsCount, url }`, `ingestTokens.lastUsedAt` se
   ažurira.

Token, heš i telo se nigde ne loguju. Uvoz nastaje sa `status: "u_pregledu"` —
skill ne piše u `leadCompanies`.

## 5. Settings → „Tokeni za uvoz (skill)"

`components/app/settings/ingest-tokens-panel.tsx`, ubačen u tab „Pristup"
(`app/(app)/settings/page.tsx`). Spisak (naziv, status, napravljen, poslednji
put korišćen, napravio, opozovi), dugme „Novi token" → modal koji token
prikazuje **jednom** sa dugmetom Kopiraj i PowerShell primerom gde ide.
Opoziv ide kroz dijalog potvrde.

`convex/ingestTokensStore.ts`: `createIngestToken`, `listIngestTokens`,
`revokeIngestToken` — **sve tri kroz `requireOwner`**, ne samo kroz UI.
`client_viewer` sekciju ne vidi i poziv mimo ekrana mu ne prolazi. Interni put
za rutu: `findValidTokenByHash` (internalQuery) i `markTokenUsed`
(internalMutation).

## 6. Niše backend

`convex/nichesStore.ts`: `listNiches` (brojači firmi / sa sajtom / bez sajta /
sajt nepoznato / hot / warm — svaki preko indeksa `by_workspace_niche`, bez
punog skena), `upsertNiche`, `updateNicheOpis` (postavlja `opisAutor:
"covek"`), `upsertNichePlatform`, `deleteNichePlatform`, `deleteNiche`
(odbija kad niša ima firme, sa tačnim brojem u poruci). UI je GL2.

## 7. Provera bez tajni

`scripts/generate-leads-ingest-check.ts` + `npm run verify:gl-ingest`. Pet
slučajeva, svi prolaze:

```
✓ 1. Validan zahtev sa jednim punim redom -> 200, redova: 1
✓ 2. Prazan `redovi` -> 400, polja: redovi: too_small
✓ 3. Red sa cetiri osobe (granica je tri) -> 400, polja: redovi.0.osobe: too_big
✓ 4. Osoba sa procenom I sa `nijeMoguceProceniti` -> 400, polja: redovi.0.osobe.0.verovatnoca: custom
✓ 5. Telefon osobe bez `telefonSourceUrl` -> 400, polja: redovi.0.osobe.0.telefonSourceUrl: custom
```

Slučajevi 4 i 5 nisu bili traženi — dodao sam ih jer su iste cene i čuvaju dva
pravila koja se inače otkriju tek na živim podacima.

Svi test podaci su očigledno lažni („Test Salon 1", „+381 60 000 0000",
`primer-nepostojeci.rs`).

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

**A. Napraviti token**

1. `digital.enigmait.rs` → Podešavanja → jezičak **Pristup**.
2. Skroluj do **„Tokeni za uvoz (skill)"** (sekcija se vidi samo vlasniku).
3. Upiši naziv (npr. `Jovanov laptop`) → **Novi token**.
4. U modalu klikni **Kopiraj**. Token se posle zatvaranja **ne može ponovo
   videti**.
5. Na svojoj mašini, PowerShell:
   ```powershell
   [Environment]::SetEnvironmentVariable("ENIGMA_INGEST_TOKEN", "<zalepi token>", "User")
   ```
   Otvori NOVI PowerShell prozor da promenljiva postoji.

**B. 401 bez tokena** (`<deployment>` je Convex deployment iz dashboarda):

```powershell
$url = "https://<deployment>.convex.site/generate-leads/ingest"
try { Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json" -Body "{}" }
catch { $_.Exception.Response.StatusCode.value__ }   # ocekivano: 401
```

**C. 400 sa tokenom i praznim `redovi`:**

```powershell
$h = @{ Authorization = "Bearer $env:ENIGMA_INGEST_TOKEN" }
$telo = @{
  verzija = 1
  upit    = @{ grad = "Beograd"; nisa = "frizerski-saloni"; brojTrazen = 3; filterSajt = "nema" }
  izvor   = @{ skill = "generate-leads"; verzijaSkilla = "1.0.0"; pokrenutAt = 1757000000000 }
  redovi  = @()
  izvestaj = @{ nadjeno = 0; trazeno = 3; iscrpljen = $true; placesPozivi = 0; nedostupniIzvori = @() }
} | ConvertTo-Json -Depth 8
try { Invoke-RestMethod -Uri $url -Method Post -Headers $h -ContentType "application/json" -Body $telo }
catch { $_.Exception.Response.StatusCode.value__ }   # ocekivano: 400
```

**D. 200 sa jednim lažnim redom** — isti `$telo`, samo `redovi`:

```powershell
$red = @{
  nazivFirme = "Test Salon 1"
  grad       = "Beograd"
  telefon    = "+381 60 000 0000"
  izvori     = @("rucni test")
  derivedSignals = @()
  nisa       = "frizerski-saloni"
  imaSajt    = "ne"
  imaSajtNapomena = "rucni test, nijedan izvor nije proveravan"
}
```
Umetni `redovi = @($red)`, `izvestaj.nadjeno = 1`, pošalji. Odgovor je
`{ importId, rowsCount = 1, url }`.

**E. Videti uvoz:** otvori `url` iz odgovora — vodi na
`digital.enigmait.rs/leadovi/uvoz?import=<id>` i odmah otvara baš taj uvoz
(dodao sam čitanje `?import=` u `ImportDashboard`; ranije je taj parametar
otvarao prazan ekran „Novi uvoz"). Alternativno: Leadovi → **Uvoz** →
**Istorija uvoza** → klikni red `generate-leads · Beograd · frizerski-saloni · <datum>`.
Videćeš pet novih kolona i, iznad tabele, upozorenja („Izvor nedostupan…",
„Grad je iscrpljen…", „Skill 1.0.0, filter sajta…").

**F. Očisti test:** u pregledu tog uvoza skloni red pa ga NE primenjuj, ili
primeni pa poništi (Istorija uvoza → Poništi). Token iz testa možeš opozvati.

---

## Odluke koje sam doneo sam (nisu iz prompta ni iz plana)

1. **`leadFilterPresets` je u `TABLE_OWNERSHIP`, ne u `EXTRA_TABLE_OWNERSHIP`.**
   Prompt traži sve četiri tabele u `EXTRA`, ali `leadFilterPresets` počinje
   prefiksom `lead`, pa je `ProviderPrefixedTable` (potpun `Record`) i tsc
   obara build ako je nema u `TABLE_OWNERSHIP`, a `verify-purge-coverage`
   prijavljuje suvišan ključ ako je u obe. Dispozicija je `excluded` sa
   razlogom, po uzoru na `invites`/`rules` — kao i za ostale tri.
2. **Sve četiri tabele su `excluded`, ne `purgedBy: ["leads"]`.** Plan kaže „po
   uzoru na `invites`", a `invites` je izuzet: to su sopstveni podaci, ne
   podaci preuzeti od providera. Praktična posledica: `leads` purge obriše
   firme, a niše ostanu kao entiteti sa nula firmi — što je i pravilo iz §7.3
   („niša se NE briše").
3. **Ingest sam sintetizuje `sirovo`** (Naziv firme, Grad, Ulica, Telefon,
   E-mail, Sajt, PIB, Izveštaj skilla). Ekran za pregled crta kolone baš iz
   `sirovo`; bez toga bi uvoz iz skilla otvorio poruku „Ovaj uvoz nema
   zapamćene kolone iz fajla", što je tačno za XLSX a besmisleno za JSON.
   Alternativa je bila menjati to prazno stanje — ovo je manja promena.
4. **`headerRowIndex: -1` i `sheetsChosen: []` za ingest**, pa `sourceRowIndex`
   ispada 1, 2, 3… (redni broj u poslatoj listi). Lažan „Sheet1" bi tvrdio da
   fajl postoji. Zbog toga sam sakrio red „List: … · zaglavlje u redu N" kad
   `sheetsChosen` je prazan — inače bi pisalo „zaglavlje u redu 0".
5. **`attachSkillData` je jedna funkcija za obe grane** (`nova_firma` i
   `spoji`), sa proverama postojanja protiv baze. Plan ne kaže šta se dešava sa
   novim podacima pri spajanju; alternativa („samo za nove firme") značila bi
   da spajanje tiho izgubi platforme, osobe i procene telefona.
6. **Pri spajanju se stanje sajta PREPISUJE ako je provera novija**
   (`sajtProverenAt >= postojeći`), dok se sva ostala polja samo dopunjuju ako
   su prazna. Stanje sajta je opažanje sa datumom, ne trajna činjenica — sajt
   koji je juče radio danas može biti mrtav.
7. **`roleConfidence: "potvrdjeno"`** se dodeljuje kad `ulogaIzvor` sadrži
   „companywall" ili „apr" (bez dijakritika, case-insensitive). Plan kaže
   „CompanyWall/APR", ali ne i kako se to tačno prepoznaje u slobodnom tekstu.
8. **Težine novih Fit pravila (28 i 12) su moja procena.** Plan traži pravila i
   obrazloženje, ne brojeve. 28 je tik ispod „Nema sajt" (30), 12 tik ispod
   „Novootvorena firma" (10) po redu veličine — oba se mogu prekalibrisati sa
   ekrana bez deploy-a.
9. **`nema_sajt` se ne upisuje za `imaSajt: "nepoznato"`**, a ni signali sajta
   kad polja uopšte nema. Ovo je čitanje §0 pravila 4 („nepoznato ≠ poznato"),
   ne doslovan tekst plana.
10. **Prazan `redovi` daje 400, ne 200 sa praznim uvozom.** Plan §5 to traži
    izričito za test, ali sam pravilo upisao i u zod šemu (`min(1)`) —
    posledica je da uvoz sa nula firmi nikad ne pravi red u istoriji; skill to
    ispisuje kao „0 od N, grad iscrpljen".
11. **Dodao sam `?import=<id>` čitanje u `ImportDashboard`** (+ `Suspense`
    granicu na `/leadovi/uvoz`). Plan §5 obećava taj URL skillu, a ekran ga
    ranije nije čitao — link bi otvarao prazan „Novi uvoz".
12. **Popravio sam brisanje provenance redova u `revertImport`** (vidi tačku
    3). To je stara rupa koju GL1 uvećava, a ne nova funkcija.

## Poznati rizici i šta NIJE urađeno

- **Ništa nije provereno u browseru ni na živim podacima.** Nema tokena, nema
  Places kvote, a `npx convex dev`/`deploy` su zabranjeni u noćnom runu. Sve
  tvrdnje o UI-ju su čitanje koda, ne posmatranje ekrana.
- **`npx convex codegen` sam pokrenuo jednom** (da `_generated/api.d.ts` zna za
  `nichesStore` i `ingestTokensStore`). Ta komanda kontaktira dev deployment
  radi provere tipova („Uploading functions to Convex") — nije `deploy`, nije
  `dev`, nije `env`, i ne dira produkciju, ali to zapisujem jer nije bilo
  izričito dozvoljeno.
- **`import-row-dialog.tsx` (modal „Detalji") ne prikazuje nova polja.** Čita
  polja po imenu i nema generičku petlju, pa ne puca — ali niša, koordinate,
  osobe sa procenom i platforme se u njemu ne vide. Prompt je tražio kolone u
  tabeli; modal je posao za GL2 (§7.4 ionako traži te sekcije u profilu firme).
- **`leadFilterPresets` je samo tabela.** Nijedna funkcija je ne čita ni ne
  piše — to je GL2 (§7.1).
- **Migracija postojećih firmi ne postoji i ne treba.** Sva nova polja su
  opciona; stare firme prosto nemaju `imaSajt`, što se svuda čita kao „nikad
  proveravano".
- **`normalizeNicheSlug` seče slug na 64 znaka.** Dve različite niše sa istih
  prvih 64 znaka bi se spojile — u praksi nemoguće za nazive niša, ali je
  granica tu.
- **Plafon od 30/sat je po radnom prostoru, ne po tokenu.** Dva tokena dele isti
  brojač. To je namerno (plan §5 kaže „po workspaceu"), ali znači da opozivanje
  jednog tokena ne oslobađa kvotu koju je potrošio.
- **`npm run lint` ima 1288 grešaka i 21396 upozorenja u celom repou** — sve
  zatečene, uglavnom `no-explicit-any` u `scripts/verify-gads-*.ts`. Nad mojim
  fajlovima lint je čist (jednu grešku koju sam uneo — nezaštićen navodnik u
  JSX-u u `ingest-tokens-panel.tsx` — sam popravio). Zatečena upozorenja u
  fajlovima koje sam dirao a nisu moja: `LEAD_SIGNAL_KINDS`/`MatchOn`/
  `SuppressionCheckResult` neiskorišćeni u `leadImportStore.ts`, mrtvo stanje
  `revert*` u `import-review-table.tsx`, `FileSpreadsheet` u
  `import-dashboard.tsx`, `AlertTriangle` u `lead-identities-panel.tsx`.

## Dodati fajlovi

- `convex/lib/generateLeadsIngest.ts`
- `convex/ingestTokensStore.ts`
- `convex/nichesStore.ts`
- `components/app/settings/ingest-tokens-panel.tsx`
- `scripts/generate-leads-ingest-check.ts`
- `nocni-run/izvestaji/GL1.md`

## Izmenjeni fajlovi

- `convex/schema.ts`
- `convex/leadImportStore.ts`
- `convex/leadScoringStore.ts`
- `convex/lib/leadNormalize.ts`
- `convex/lib/leadImportParse.ts`
- `convex/lib/purgeMap.ts`
- `convex/publicRouteLimit.ts`
- `convex/http.ts`
- `convex/_generated/api.d.ts` (generisan)
- `components/app/leadovi/import-review-table.tsx`
- `components/app/leadovi/import-dashboard.tsx`
- `components/app/leadovi/scoring-rules-panel.tsx`
- `components/app/leadovi/lead-labels.ts`
- `components/app/leadovi/lead-identities-panel.tsx`
- `app/(app)/settings/page.tsx`
- `app/(app)/leadovi/uvoz/page.tsx`
- `package.json`
