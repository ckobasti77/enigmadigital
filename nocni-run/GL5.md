# GL5 — Skill `/generate-leads` (izvor u repou + globalna instalacija)

Model: **Opus** · Effort: **max** · Mode: **acceptEdits (implementacija)** · Sesija: **nova**

Ti si u repou `enigmadigital`. GL1 mora biti na `main` (`[GL1]` u
`git log`); bez njega → `NEUSPEH GL5: GL1 nije na main`. GL2–GL4 nisu
preduslov. Pročitaj `nocni-run/izvestaji/GL1.md` (odluke o endpointu i
šemi).

Pročitaj `generate-leads-plan.md` — sekcije **§0, §2, §3, §5, §6, §10, §11**.
Pročitaj `convex/lib/generateLeadsIngest.ts` (zod šema — skill mora da šalje
tačno taj oblik) i `convex/http.ts` deo za `/generate-leads/ingest`.
Pročitaj jedan postojeći skill iz `.claude/skills/` (npr. `prospecting` ili
`seo-local`) da vidiš format `SKILL.md` koji Claude Code očekuje.

## Šta pravi

### 1. `tools/generate-leads/` u repou
- `SKILL.md` — frontmatter (`name: generate-leads`, `description` na
  srpskom sa okidačima „/generate-leads", „nađi leadove", „generiši
  leadove"), pa uputstvo Claude-u po §10.2–§10.4. U fajlu piše šta Claude
  radi sam (čita stranice, izvlači imena/uloge/kontakte uz ime, IG handle) i
  šta prepušta skripti. **Eksplicitna zabrana**: dopunjavanje podataka iz
  opšteg znanja, izmišljanje firmi, „zaokruživanje" broja do traženog,
  ponavljanje zahteva ka blokiranom izvoru, štampanje sirovih telefona/
  emailova u izlazu. Skill ne sme da instalira ništa.
- `run.mjs` — CLI (Node 20+, bez zavisnosti van Node-a; `fetch` je ugrađen):
  - `node run.mjs discover --grad "Beograd" --nisa frizeri --broj 25 --sajt nema`
    → Places Text Search po upitima niše (§3.1, §10.3 k. 2), dedup po
    `place_id`, filtriranje po gradu iz `formattedAddress`, upisuje kandidate u
    `out/<run-id>/kandidati.json` (samo `placeId`, `displayName`,
    `formattedAddress`, `websiteUri` — privremeno, briše se na kraju runa).
  - `node run.mjs check-site --run <id>` → §3.8 za svaku firmu sa sajtom u
    `firme.json`: jedan zahtev, timeout 8 s, ≤ 3 redirecta, odbija privatne
    IP adrese i `localhost`, klasifikuje `radi|ne_radi|parkiran|
    preusmerava_na_drustvene|nepoznato`, `sajtHttps`, `sajtNapomena` bez
    ličnih podataka. Potpisi parking stranica u `lib/sajt.mjs`. Radi se
    UVEK, bez obzira na filter `ima|nema|svejedno`.
  - `node run.mjs geocode --run <id>` → Nominatim po §3.6 (User-Agent iz
    `ENIGMA_CONTACT_EMAIL`, ≤ 1 req/s, 1 pokušaj).
  - `node run.mjs score --run <id>` → §6 skor za svaku osobu iz
    `out/<run-id>/firme.json` koji Claude popunjava tokom čitanja; upisuje
    `verovatnoca`/`nijeMoguceProceniti`/`obrazlozenje` (dve rečenice generisane
    iz pravila, ne iz LLM-a — šablon po najjačem dokazu i najjačem kontra-dokazu).
  - `node run.mjs send --run <id> [--dry-run]` → sastavlja telo po zod šemi,
    validira lokalno (`lib/schema.mjs` — ručno preslikana šema; u `self-test`
    proveri da se poklapa sa `convex/lib/generateLeadsIngest.ts` tako što oba
    validiraju iste JSON primere), POST na `ENIGMA_INGEST_URL` sa Bearer iz
    `ENIGMA_INGEST_TOKEN`, ispisuje rezime po §10.3 k. 6–7. `--dry-run` piše
    `out/<run-id>/payload.json` i ne šalje.
  - `node run.mjs self-test` → §10.5.
  - Svaka komanda prvo proverava env (§10.1) i staje sa porukom koja imenuje
    promenljivu koja fali, bez vrednosti.
- `lib/nise.mjs` — 10 početnih niša sa slugom, Places upitima (sr + en),
  šiframa delatnosti, kratkim opisom niše (ovaj opis ide u `niches.opis` sa
  `opisAutor: "claude"` — napiši ih sada, 3–4 rečenice po niši, konkretno za
  Srbiju i za ono što Enigma prodaje).
- `lib/skor.mjs` — §6, čist, testabilan.
- `lib/places.mjs`, `lib/nominatim.mjs`, `lib/ingest.mjs`.
- `README.md` — instalacija, env, primer poziva, šta znači svaka poruka na
  kraju runa, kako se čita izveštaj u aplikaciji.
- `.gitignore` za `tools/generate-leads/out/`.

### 2. Globalna instalacija
`tools/generate-leads/install.ps1`: kopira `SKILL.md` u
`$env:USERPROFILE\.claude\skills\generate-leads\SKILL.md` i u kopiji
zamenjuje placeholder `{{REPO_PATH}}` apsolutnom putanjom repoa (da skill zna
gde je `run.mjs`). NE pokreći install.ps1 u ovom runu (globalni folder je
Jovanov) — samo ga napiši i u izveštaju daj tačnu komandu.

### 3. Tok u SKILL.md (§10.3), po koracima, sa STOP tačkama
- Parsiranje argumenata; nepoznata niša → skill traži od Jovana 2–3 Places
  upita (jedino pitanje koje skill sme da postavi).
- `discover` → Claude čita `kandidati.json`.
- Za svakog kandidata Claude: proverava sajt (§3.4 — tri izvora), otvara
  CompanyWall/APR, 011info (Beograd), sajt firme, javne profile; puni
  `firme.json` po §4.4 obliku sa `sourceUrl` za svaku vrednost. Ograničenja
  §3.5. Claude ne zove Places ponovo.
- `check-site` → `geocode` → `score` → Claude pregleda rezime (brojevi, ne
  sadržaj) → `send`. Filter `[ima|nema|svejedno]` je opcion; izostavljen =
  `svejedno`.
- Kad Places presuši pre `broj` → Claude to kaže i šalje ono što ima
  (`iscrpljen: true`).
- Kraj: ispis rezimea + URL uvoza. Brisanje `kandidati.json`.

### 4. Testovi
`self-test` mora proći: 8 skor slučajeva (uključi: PR zapis + mobilni =
visoko; samo agregator = „nije moguće proceniti"; isti broj kao salon =
nisko; DOO više osnivača + fiksni = nisko; IG bio ličnog profila + mobilni =
srednje-visoko), mapiranje 10 niša, validacija 3 JSON primera, i
klasifikacija statusa sajta nad 6 lažnih odgovora bez mreže (200 HTML, 200
sa parking potpisom, 302 → instagram.com, DNS greška, timeout, 503) —
`lib/sajt.mjs` mora da ima čistu funkciju `klasifikuj(odgovor)` odvojenu od
fetch-a. Dodaj
`verify:gl-skill` u `package.json` koji pokreće `self-test`.

### 5. Ne radi
- Ne pokreći `discover` nad stvarnim gradom (troši kvotu; token nije tvoj).
- Ne pravi Google Maps skrejper, ne koristi Puppeteer/Playwright za obilazak
  Placesa. Za CompanyWall/011info/sajtove skripta ne fetchuje HTML — to radi
  Claude u skillu kroz WebFetch, sa ograničenjima iz §3.5.

## Kriterijum gotovosti
1, 3, 4 obavezno; 2 obavezno (mali fajl). Ako zod šema iz GL1 i tvoja
`lib/schema.mjs` ne mogu da se usaglase, prilagodi `schema.mjs` — šema u
Convexu je izvor istine, ne menjaj je iz ovog prompta.
