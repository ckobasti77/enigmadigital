# GL1 — Šema, ingest endpoint, niše backend, tokeni za uvoz

Model: **Opus** · Effort: **high** · Mode: **acceptEdits (implementacija, ne plan)** · Sesija: **nova**

Ti si u repou `enigmadigital` (Next 16 + Convex). Pročitaj PRVO, celo:
`generate-leads-plan.md` — sekcije **§0, §1, §2, §3 (posebno §3.8), §4, §5, §6** (§6 samo da
razumeš polja koja aplikacija prima; ne računaš skor). Zatim pročitaj
`CLAUDE.md` i `AGENTS.md`. Ne kreći u izmene dok nisi pročitao
`convex/leadImportStore.ts` (celo), `convex/schema.ts` (sekciju tabela
`lead*`), `convex/invitesStore.ts` (obrazac heširanog tokena),
`convex/publicRouteLimit.ts`, `convex/http.ts` (jednu `pathPrefix` rutu i
jednu POST webhook rutu), `convex/lib/purgeMap.ts` (`EXTRA_TABLE_OWNERSHIP`).

## Uradi, ovim redom

### 1. Pre-flight (10 minuta, ne više)
- `git status` mora biti čist na `main`. Ako nije, zapiši u izveštaj i nastavi
  bez diranja tuđih promena.
- Proveri sumnju na regresiju temperature: u `components/app/leadovi/leads-table.tsx`
  i u `convex/leadCrmStore.ts` (list query koje tabela koristi) proveri da
  `temperatura` firme zaista stiže do reda i da `TemperatureSelect` prikazuje
  vrednost iz baze, a ne podrazumevanu `nova_firma`. Ako nađeš bug — popravi
  ga kao zaseban komit pre ostalog (`fix(leadovi): temperatura u tabeli`).
  Ako nema buga, napiši u izveštaj tačno šta si proverio i zašto je ispravno.

### 2. Šema (§4.1–§4.3)
Sve iz §4.1, §4.2, §4.3, sa indeksima kako piše. Purge map za sve četiri nove
tabele. `tiktok` u `leadIdentities.kind` — pronađi SVAKO mesto u kodu koje
grana po `kind` (switch/Record) i dodaj `tiktok`, inače će tsc ili runtime
pasti na prvoj TikTok identifikaciji.

### 3. Validator i staging (§4.4)
- Proširi `parsedLeadRowValidator` i `leadImportRows.parsed` u šemi (ista
  polja, sve opciono).
- `createImport` refaktoriši u `createImportCore(ctx, args)` (interna
  funkcija, ne Convex funkcija) koju zovu i postojeća `createImport` mutacija i
  nova `createImportFromIngest` internalMutation. Ponašanje postojeće
  mutacije mora ostati identično — uporedi ulaz/izlaz pre i posle.
- `applyImport`: prenos novih polja tačno kako §4.4 kaže (koordinate,
  placeId, niša upsert po slugu, imaSajt, platforme → identities, osobe →
  leadPeople + telefon sa verovatnoćom, status sajta §3.8/§4.1). Signal
  `nema_sajt` samo za `imaSajt === "ne"`. Novi signali `sajt_ne_radi` i
  `sajt_bez_https` u `LEAD_SIGNAL_KINDS` + podrazumevana Fit pravila u
  `DEFAULT_ICP_RULES` + dugme „Dodaj nedostajuća podrazumevana pravila" u
  `scoring-rules-panel.tsx` (dodaje samo pravila čiji `signalKind` ne
  postoji u workspaceu; ako ništa ne fali, dugme se ne crta). `revertImport` mora da obriše i ono što je `applyImport`
  novo napravio (niša se NE briše — ostaje kao entitet, ali `nicheId` na
  firmama koje su obrisane nestaje sa firmom).
- `import-review-table.tsx`: nove kolone (niša, sajt — „ima · radi",
  „ima · ne radi", „nema", „nepoznato" —, koordinate ✓/—,
  osobe „Ime · 72 %", platforme). Stari redovi bez polja prikazuju „—", ne
  prazno i ne pucaju. Ne diraj postojeće ponašanje temperature/brisanja.

### 4. Ingest endpoint (§5)
Tačno po §5: ruta, Bearer → sha256 → `ingestTokens`, `claimPublicRouteCall`
sa `GENERATE_LEADS_HOURLY_CAP = 30`, zod šema u
`convex/lib/generateLeadsIngest.ts` (izvezi i TypeScript tip), 401/429/400/200
kako piše, `lastUsedAt`. Nikad ne loguj token, heš ni telo zahteva.

### 5. Settings → „Tokeni za uvoz (skill)" (§5)
Sekcija u `app/(app)/settings/page.tsx` (ili komponenta u
`components/app/settings/`). Token se prikazuje jednom. Samo `role: "owner"`
(`membersStore.ts` ima `owner` i `client_viewer`; proveri ulogu i u mutaciji,
ne samo u UI-ju). Opoziv sa potvrdom. Napomena: `claimPublicRouteCall` traži
`MutationCtx` — iz http akcije zovi `internal.publicRouteLimit.claimRouteCall`
ili ubaci limit u `createImportFromIngest` mutaciju.

### 6. Niše backend
`convex/nichesStore.ts`: `listNiches` (sa brojačima: firmi, sa/bez sajta,
hot/warm — računaj u query-ju preko indeksa `by_workspace_niche`, ne punim
skenom), `upsertNiche`, `updateNicheOpis` (postavlja `opisAutor: "covek"`),
`nichePlatforms` CRUD, `deleteNiche` (dozvoljeno samo kad nema firmi u njoj;
inače greška sa brojem firmi). UI za niše je GL2 — ovde samo backend.

### 7. Provera bez tajni
- Napiši `scripts/generate-leads-ingest-check.ts` (po uzoru na
  `scripts/lead-parse-check.ts`) koji validira tri JSON primera kroz zod
  šemu: validan, prazan `redovi`, red sa 4 osobe (mora pasti). Dodaj
  `verify:gl-ingest` u `package.json` i pokreni ga.
- Ručna provera za Jovana (u izveštaj): kako da napravi token, PowerShell
  `Invoke-RestMethod` primer sa `$env:ENIGMA_INGEST_TOKEN` (bez vrednosti) i
  jednim lažnim redom, i gde da vidi uvoz u „Uvoz" tabu.

## Kriterijum gotovosti
Sve iz tačaka 1–7. Ako nešto ne stigneš, tačke 2–4 su obavezne; 5–7 mogu u
izveštaj kao „nije urađeno" sa razlogom — ali ne sme da ostane pola
endpointa ili pola šeme.
