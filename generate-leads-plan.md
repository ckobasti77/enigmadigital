# /generate-leads — plan ekosistema (skill + niše + filteri + mapa + detalj)

Stanje na dan 08.09.2026. Ovaj fajl je jedini izvor istine za promptove GL1–GL5
u `nocni-run/`. Svaki prompt navodi koje sekcije ovde čita. Ništa iz ovog fajla
se ne prepisuje u promptove — prompt kaže „vidi §N", ne ponavlja sadržaj.

Kontekst: Enigma IT (Jovan) prodaje izradu sajtova, webshop i oglase malim
firmama u Srbiji. Aplikacija: `enigmadigital` (Next 16 + Convex), produkcija
`digital.enigmait.rs`. Leadovi ulaze SAMO kroz staging uvoz (`leadImports` →
pregled → `applyImport`). Aplikacija NE skrejpuje. Skill radi na Jovanovoj
mašini i šalje rezultat u staging.

---

## 0. Pravila koja važe za svaki prompt (nasleđena, nisu preporuka)

1. Nikad 0 gde je vrednost nepoznata; nikad „nema podataka" gde je stigla nula.
2. Ocena leada se nikad ne skladišti — računa se pri čitanju (`scoreLead`).
3. Neuspela operacija ≠ prazan rezultat. Skill koji je pao i skill koji je
   našao 0 firmi su dva ishoda sa dve različite poruke.
4. Nepoznato ≠ poznato. Nepotvrđeno ≠ potvrđeno. Verovatnoća koju ne možemo
   da procenimo piše „nije moguće proceniti", nikad 50 %.
5. Nepoznato stanje nije dozvola da se nastavi pred nepovratnom akcijom.
6. Sirov telefon, email, ime osobe — **nikad** u `console.log`, URL, poruku
   greške, log fajl skilla. Za dijagnostiku: opis oblika, ne sadržaj.
7. Sve poruke ka korisniku: srpski, latinica. Kod i komentari: postojeći stil
   repoa (komentari na srpskom, identifikatori na engleskom gde već jesu).
8. Svaka nova tabela → `convex/lib/purgeMap.ts` (`EXTRA_TABLE_OWNERSHIP`), inače
   `npm run build` pada na `scripts/verify-purge-coverage.ts`.
9. `requireMembership(ctx)` vraća **pozivaočev** workspace i ne proverava
   argumente — svaka funkcija sa `workspaceId` argumentom mora da uporedi
   `membership.workspaceId !== args.workspaceId` → baci grešku.
10. Nova obavezna polja u šemi ruše deploy nad postojećim dokumentima → sve novo
    je `v.optional` sa komentarom `OPCIONO NAMERNO` i objašnjenjem šta znači
    odsustvo.
11. Ne crta se kontrola koja ne može da radi. Nema „Uskoro".
12. Tajne (ingest token, Places ključ) nikad u repo, nikad u chat, nikad u
    skill fajl, nikad u URL. Ključevi žive u env promenljivama na mašini i u
    Convex dashboardu.

---

## 1. Izmereno stanje repoa (na šta se gradi)

- `convex/schema.ts`: `leadCompanies` (3192), `leadPeople` (3257),
  `leadIdentities` (3289, `kind` = phone|email|instagram|facebook|website|threads,
  obavezni `lawfulBasis` + `sourceUrl`), `leadSignals` (3389), `leadIcpRules`
  (3446), `leadAssignments` (3514, ima `meetingAt`), `leadImports` (3598),
  `leadImportRows` (3633, `parsed` objekat sa fiksnim poljima + `sirovo`).
- `convex/leadImportStore.ts`: `parsedLeadRowValidator` (:45), `createImport`
  (:410, mutation, radi match + konflikte + suppression, upisuje staging),
  `applyImport` (:634, jedino mesto koje piše u `leadCompanies`),
  `ensureAssignment` (:589), `revertImport` (:1234).
- `convex/http.ts`: rute sa `pathPrefix` (`/r/`, `/ig-upload/`), webhook rute
  sa GET verifikacijom; limit javnih ruta u `convex/publicRouteLimit.ts`
  (`claimPublicRouteCall` :41, `ROUTE_WINDOW_MS`, kapovi po ruti).
- `convex/invitesStore.ts`: obrazac „sirov token se nikad ne upisuje, samo
  `sha256Hex` heš" (`./lib/metaAudienceHash`). Isti obrazac važi za ingest token.
- `convex/lib/leadNormalize.ts`: `LEAD_SIGNAL_KINDS` (:298) — već ima
  `nema_sajt`, `samo_instagram`, `samo_facebook`, `visok_broj_recenzija`.
- `convex/lib/leadScoring.ts`: `scoreLead(signals, rules, now)` (:188) → fit +
  intent odvojeno.
- `components/app/leadovi/leads-dashboard.tsx`: tabovi `leads|gaps|overdue|
  meetings|scoring` (:34, :100) preko `TabNav`/`TabPanel`.
- `components/app/leadovi/leads-table.tsx`: filter je samo `filterMode`
  `stage|overdue` (:227). Nema URL stanja, nema brojača po filteru, nema preseta.
- `components/app/leadovi/lead-chips.tsx`: `ContactLink` (:109) — polazna tačka
  za `LinkChip`.
- `app/(app)/leadovi/[companyId]/lead-detail-page-client.tsx`: profil firme.
- `app/(app)/settings/page.tsx`: jedino mesto za „Tokeni za uvoz".
- `package.json`: već ima `gsap`, `zod`, `lucide-react`. NEMA `maplibre-gl`,
  `three`, `nuqs`.
- `.claude/skills/` u repou sadrži marketing/convex skillove; globalni skillovi
  žive u `%USERPROFILE%\.claude\skills\`.
- `google-business-istrazivanje.md` §7: Places API pravila o čuvanju (vidi §3).

---

## 2. Odluke (zatvorene, ne otvaraju se u promptovima)

- **O1 — Sajt prvo, skill poslednji.** Skill bez ingest endpointa i bez prikaza
  nema gde da piše. Redosled: šema+endpoint → filteri/niše/detalj → mapa
  native → mapa three.js → skill.
- **O2 — Skill piše u staging, ne u `leadCompanies`.** `POST /generate-leads/
  ingest` pravi `leadImports` sa `status: "u_pregledu"` i redove kroz istu
  logiku kao `createImport` (match, konflikti, suppression). Čovek pregleda i
  primenjuje. „Odmah upisuje" znači: odmah je u aplikaciji, u staging tabu,
  spreman za pregled — ne znači da zaobilazi pregled.
- **O3 — Places API samo za otkrivanje.** Vidi §3. Trajno se čuva samo
  `placeId`. Sve što ulazi u bazu ima `sourceUrl` koji NIJE Google.
- **O4 — Koordinate iz Nominatima (OSM)**, ne iz Placesa. Adresa (iz APR/
  CompanyWall/011info/sajta) → Nominatim → lat/lng, `koordinateIzvor:
  "nominatim"`. Atribucija „© OpenStreetMap contributors" obavezna na mapi.
- **O5 — Verovatnoća telefona je pravilo, ne LLM osećaj.** Skill računa po §6,
  aplikacija samo prikazuje broj + obrazloženje. Aplikacija ne poziva LLM.
- **O6 — Telefon nađen samo u IG biou SE uvozi**, kao `leadIdentities`
  `kind: "phone"`, `sourceUrl` = URL IG profila, `verovatnoca` po §6 (obično
  nisko), `lawfulBasis: "legitimni interes — javno objavljen poslovni kontakt"`.
  Čovek ga vidi sa obrazloženjem i sam odlučuje da li zove.
- **O7 — Niša = tab na stranici Leadovi**, ne poseban ekran. Niša je entitet
  (`niches`) sa platformama (`nichePlatforms`) i opisom. Firma ima najviše
  jednu nišu (`leadCompanies.nicheId`).
- **O8 — Filteri žive u URL-u** (`?nisa=...&grad=...&sajt=ne&temp=hot`), sa
  brojem pogodaka na svakoj opciji, i deljivi su kopiranjem linka. Preseti su
  imenovani URL-ovi u tabeli `leadFilterPresets` (deli ih ceo workspace).
- **O9 — Mapa u dva koraka:** MapLibre native slojevi (GL3) pa three.js sloj +
  GSAP letovi (GL4). GL4 ne sme da pokvari GL3 — three.js sloj je dodatak koji
  se gasi ako WebGL2 nije dostupan ili je `prefers-reduced-motion`.
- **O10 — Skill staje kad grad presuši.** `/generate-leads Beograd frizeri 25
  nema` koji nađe 18 firmi izveštava „18 od 25 — Beograd iscrpljen za ovaj
  upit" i NE dopunjava iz drugih gradova ni izmišljenim firmama.
- **O11 — Bez skrejpera Google Mapsa.** Zabranjen ToS-om, lomljiv, i lom liči
  na prazan rezultat (krši pravilo 3).
- **O12 — `tiktok` ulazi u `leadIdentities.kind`.** Threads ostaje.

---

## 3. Places API — šta smemo, šta ne (pravna granica, ne tehnička)

Iz `google-business-istrazivanje.md` §7 i Maps Platform uslova: **`place_id` sme
da se čuva zauvek; naziv, telefon, sajt, ocena, koordinate iz Placesa — ne sme
da se skladišti kao sopstvena baza.** Ovo je moje čitanje uslova, ne pravni
savet; ako Jovan želi labaviju verziju, to je njegova odluka i menja se samo u
skillu, ne u aplikaciji.

Zato skill koristi Places ovako:

1. **Text Search (New)** sa `FieldMask: places.id,places.displayName,
   places.formattedAddress,places.websiteUri,places.businessStatus` — samo za
   pronalaženje kandidata. Rezultat živi u memoriji tog runa.
2. Za svakog kandidata skill **sam potvrđuje** podatke iz primarnih izvora:
   - sajt firme (ako `websiteUri` postoji, otvara ga i čita kontakt, IG,
     FB, TikTok, ime vlasnika) — `sourceUrl` = stranica sajta,
   - CompanyWall / APR pretraga po nazivu + gradu → PIB, MB, šifra
     delatnosti, ime osnivača/direktora, adresa, telefon — `sourceUrl` =
     CompanyWall stranica,
   - 011info (Beograd) / lokalni imenik → telefon, adresa — `sourceUrl` =
     ta stranica,
   - Instagram/Facebook/TikTok javni profil → bio, telefon u biou, link u
     biou — `sourceUrl` = URL profila.
3. U staging ide: sve iz koraka 2 + `placeId`. `websiteUri` iz Placesa se ne
   prepisuje kao vrednost; ako sajt postoji, skill ga je posetio i `sajt` je
   URL koji je sam potvrdio (isti string, ali izvor je sajt, ne Google).
4. **„Nema websajt"** znači: Places nema `websiteUri` **I** CompanyWall/011info
   nemaju sajt **I** web pretraga „naziv + grad" ne vraća sopstveni domen.
   Ako je bilo koji od tri izvora nedostupan (greška, blokada), `imaSajt:
   "nepoznato"` sa napomenom koji izvor nije proveren — ne „ne".
5. Skill ne otvara više od **3 stranice po firmi po izvoru** i ne zaobilazi
   blokade (CAPTCHA, 403). Blokiran izvor → napomena „izvor X nedostupan",
   red ostaje sa manje podataka. Nikad retry-petlja.
6. Nominatim: `User-Agent: EnigmaGenerateLeads/1.0 (kontakt email iz env)`,
   ≤ 1 zahtev/s, ≤ 1 pokušaj po adresi. Bez rezultata → firma bez koordinata,
   `koordinateIzvor` prazno, na mapi se broji u „bez koordinata: N".
7. Places poziv koji padne (403, kvota, mreža) → skill staje sa porukom koja
   navodi status, ne nastavlja bez otkrivanja.
8. **Status sajta se proverava UVEK**, za svaku firmu, bez obzira na filter
   (`ima|nema|svejedno`). Filter samo bira koje firme ulaze; status je
   podatak koji svaka firma nosi. Provera (u `run.mjs`, ne Claude):
   - `imaSajt`: `da` (potvrđen URL), `ne` (§3.4 — sva tri izvora
     potvrđuju odsustvo), `nepoznato` (neki izvor nedostupan).
   - `sajtStatus` (samo kad `imaSajt === "da"`): jedan `HEAD`/`GET` sa
     timeoutom 8 s, prati do 3 redirecta, User-Agent kao za Nominatim:
     - `radi` — 2xx/3xx sa HTML sadržajem,
     - `ne_radi` — DNS greška, timeout, 5xx, 404 na korenu,
     - `parkiran` — 2xx ali telo je registrar/parking stranica (lista
       potpisa u `lib/sajt.mjs`: „domain is for sale", „parked", „Loopia",
       „GoDaddy", „ovaj domen je registrovan" itd. — ručno održavana),
     - `preusmerava_na_drustvene` — konačni URL je instagram/facebook/
       linktree/tiktok domen,
     - `nepoznato` — provera nije uspela iz razloga koji nije sajt (npr.
       nema mreže) — različito od `ne_radi`.
   - `sajtHttps`: `true|false` — da li konačni URL ide preko HTTPS-a; `false`
     je signal (Enigma prodaje sajtove).
   - `sajtProverenAt`: vreme provere.
   - `sajtNapomena`: jedna rečenica („302 → instagram.com/…", „timeout
     posle 8 s"), bez ličnih podataka.
   Jedan pokušaj po sajtu. Bez retry-petlje. Nikad se ne prati redirect na
   `localhost`/privatne IP adrese (SSRF zaštita i za Convex action kasnije).

Trošak: Text Search (New) Pro/Enterprise polje — par stotina poziva mesečno
staje u besplatni mesečni kredit Pay-as-you-go plana. Skill ispisuje broj
Places poziva na kraju svakog runa.

---

## 4. Šema — dopune (GL1)

Sve novo je `v.optional` sa `OPCIONO NAMERNO` komentarom.

### 4.1 `leadCompanies` +
- `lat`, `lng`: `v.optional(v.number())`
- `koordinateIzvor`: `v.optional(v.union("nominatim","rucno"))`
- `koordinateAt`: `v.optional(v.number())`
- `placeId`: `v.optional(v.string())` — jedino Places polje koje se čuva
- `nicheId`: `v.optional(v.id("niches"))`
- `imaSajt`: `v.optional(v.union("da","ne","nepoznato"))` + `imaSajtNapomena`
  (`v.optional(v.string())`, npr. „011info nedostupan") — odsustvo = nije
  proveravano
- `sajtStatus`: `v.optional(v.union("radi","ne_radi","parkiran",
  "preusmerava_na_drustvene","nepoznato"))`, `sajtHttps: v.optional(v.boolean())`,
  `sajtProverenAt: v.optional(v.number())`, `sajtNapomena: v.optional(v.string())`
  — §3.8; odsustvo = nikad proveravano (različito od `nepoznato`)
- `platforme` se NE dodaje ovde — platforme su `leadIdentities` (`instagram`,
  `facebook`, `tiktok`, `website`)
- indeks `by_workspace_niche` (`workspaceId`, `nicheId`)

### 4.2 `leadIdentities` +
- `kind` union + `"tiktok"`
- `verovatnoca`: `v.optional(v.number())` — 0–100, samo za `kind: "phone"`
  kad postoji `personId`; odsustvo = nije procenjivano
- `verovatnocaObrazlozenje`: `v.optional(v.string())` — dve rečenice (§6)
- `verovatnocaIzvor`: `v.optional(v.union("skill","covek"))`
- `verovatnocaAt`: `v.optional(v.number())`
- `nijeMoguceProceniti`: `v.optional(v.boolean())` — `true` = skill je pokušao
  i odustao; različito od odsustva (nije ni pokušano)

### 4.3 Nove tabele
- **`niches`**: `workspaceId`, `slug` (normalizovan, jedinstven po workspaceu),
  `naziv`, `opis` (`v.optional(v.string())`), `opisAutor`
  (`v.optional(v.union("claude","covek"))`), `opisAt`, `opisModel`
  (`v.optional(v.string())`), `sifreDelatnosti` (`v.optional(v.array(v.string()))`),
  `createdBy`, `createdAt`, `updatedAt`. Indeks `by_workspace_slug`.
- **`nichePlatforms`**: `workspaceId`, `nicheId`, `platforma`
  (`instagram|facebook|tiktok|google_maps|011info|companywall|drugo`), `url`
  (`v.optional`), `napomena` (`v.optional`), `redosled`, `createdAt`. Indeks
  `by_niche`.
- **`ingestTokens`**: `workspaceId`, `tokenHash` (SHA-256 hex, isti obrazac kao
  `invites`), `naziv`, `createdBy`, `createdAt`, `lastUsedAt` (`v.optional`),
  `revokedAt` (`v.optional`). Indeks `by_hash`, `by_workspace`.
- **`leadFilterPresets`**: `workspaceId`, `naziv`, `query` (string, sirovi
  search deo URL-a bez `?`), `createdBy`, `createdAt`. Indeks `by_workspace`.
- Sve četiri → `EXTRA_TABLE_OWNERSHIP` u `purgeMap.ts` sa dispozicijom po
  uzoru na `invites` (workspace-owned, briše se pri purge-u workspacea).

### 4.4 `leadImportRows.parsed` + / `parsedLeadRowValidator` +
Sva polja opciona:
- `placeId: string`
- `nisa: string` (slug)
- `imaSajt: "da"|"ne"|"nepoznato"`, `imaSajtNapomena: string`
- `sajtStatus`, `sajtHttps`, `sajtProverenAt`, `sajtNapomena` (kao §4.1)
- `koordinate: { lat, lng, izvor: "nominatim" }`
- `platforme: Array<{ vrsta: "instagram"|"facebook"|"tiktok"|"website"|
  "threads", url: string, sourceUrl: string }>`
- `osobe: Array<{ ime: string, uloga: string, ulogaIzvor: string,
  telefon?: string, telefonSourceUrl?: string, verovatnoca?: number,
  nijeMoguceProceniti?: boolean, obrazlozenje?: string, rang: 1|2|3 }>` —
  najviše 3, već rangirane od skilla
- `izvestajSkilla: string` — kratak tekst po firmi („nađeno na: sajt,
  CompanyWall; 011info nedostupan")

`applyImport` prenosi: koordinate → `leadCompanies.lat/lng/koordinateIzvor/
koordinateAt`; `placeId`, `nicheId` (slug → `niches` upsert po slugu),
`imaSajt` + `sajtStatus/sajtHttps/sajtProverenAt/sajtNapomena`; `platforme` →
`leadIdentities` po vrsti; `osobe` → `leadPeople`
(role preko postojećeg `mapRole`, `roleConfidence` = `potvrdjeno` samo ako je
`ulogaIzvor` CompanyWall/APR, inače `verovatno`) + telefon osobe →
`leadIdentities` `kind: "phone"` sa `personId` + `verovatnoca*`. Signali: `nema_sajt`
kad je `imaSajt === "ne"` (ne kad je `nepoznato`), `samo_instagram`/`samo_facebook`
po platformama, i dva NOVA signala u `LEAD_SIGNAL_KINDS` (`leadNormalize.ts`):
`sajt_ne_radi` (za `ne_radi` i `parkiran`) i `sajt_bez_https` (za
`sajtHttps === false`). Oba dobijaju podrazumevano Fit pravilo u
`DEFAULT_ICP_RULES` (`leadScoringStore.ts`) sa obrazloženjem — mrtav sajt je
skoro jednako dobar lead kao nikakav sajt. Postojeći workspace koji je već
seedovao pravila NE dobija automatski nova — ekran „Pravila ocenjivanja" mora
da ponudi „Dodaj nedostajuća podrazumevana pravila" (samo ona koja fale, po
`signalKind`).

Staging tabela (`import-review-table.tsx`) prikazuje nove kolone: niša, ima
sajt, koordinate (✓/—), osobe (ime + %), platforme (LinkChip). Ne sme da
pukne za stare redove bez tih polja.

---

## 5. Ingest endpoint (GL1)

- Ruta: `POST /generate-leads/ingest` u `convex/http.ts`.
- Auth: `Authorization: Bearer <token>` → `sha256Hex` → `ingestTokens.by_hash`,
  `revokedAt === undefined`. Nema tokena/pogrešan → 401 sa telom
  `{ greska: "neispravan token" }`, bez detalja. Ne loguje token ni heš.
- Limit: `claimPublicRouteCall` sa novim kapom `GENERATE_LEADS_HOURLY_CAP = 30`
  po workspaceu; preko → 429.
- Telo (zod šema u `convex/lib/generateLeadsIngest.ts`):
  ```
  { verzija: 1,
    upit: { grad, nisa, brojTrazen, filterSajt: "ima"|"nema"|"svejedno" },
    izvor: { skill: "generate-leads", verzijaSkilla, pokrenutAt },
    redovi: ParsedLeadRow[] (≤ 200),
    izvestaj: { nadjeno, trazeno, iscrpljen: boolean, placesPozivi,
                nedostupniIzvori: string[], napomena?: string } }
  ```
  Neuspela validacija → 400 sa listom polja (bez vrednosti).
- Obrada: `internalMutation createImportFromIngest` koji deli jezgro sa
  `createImport` (refaktor u `createImportCore(ctx, { workspaceId, uploadedBy,
  fileName, rows, ... })`). `uploadedBy` = `createdBy` tokena. `fileName` =
  `generate-leads · <grad> · <niša> · <datum>`. `warnings` dobija
  `izvestaj.nedostupniIzvori` i „iscrpljen: nađeno X od Y" ako važi.
- Odgovor 200: `{ importId, rowsCount, url: "https://digital.enigmait.rs/
  leadovi/uvoz?import=<id>" }`. Skill to ispisuje na kraju.
- `ingestTokens.lastUsedAt` se ažurira.
- **Settings → „Tokeni za uvoz (skill)"**: lista (naziv, napravljen, poslednji
  put korišćen, opozovi), dugme „Novi token" → modal koji token prikazuje
  **jednom** sa dugmetom Kopiraj i tekstom gde ide (`ENIGMA_INGEST_TOKEN` u
  user env). Posle zatvaranja se ne može ponovo videti. Samo `role: "owner"`
  (uloge u `membersStore.ts` su `owner` i `client_viewer`; `client_viewer`
  sekciju ne vidi).
- `proxy.ts` ne dira — ruta je na Convex `.site` domenu, ne na Next-u.
- Test: `curl`/PowerShell bez tokena → 401; sa tokenom i praznim `redovi` →
  400; sa 1 validnim redom → 200 i uvoz vidljiv u „Uvoz" tabu.

---

## 6. Verovatnoća da je telefon baš od te osobe (skill računa, app prikazuje)

Skor kreće od 0 i sabira dokaze; kapira se na 95 (nikad 100 — nismo zvali).
Ako nema nijednog dokaza iz grupe A ni B, rezultat je **„nije moguće
proceniti"** (`nijeMoguceProceniti: true`, bez broja).

**A — Vezanost broja za osobu (najjače)**
- +45 broj stoji u CompanyWall/APR zapisu preduzetnika (PR) čije je ime = osoba
- +35 broj je na sajtu/profilu odmah uz ime osobe („Marija, vlasnica: 06x…")
- +25 broj je u IG/FB/TikTok biou profila koji nosi lično ime osobe (ne ime
  salona)
- +15 broj je u biou profila salona, a osoba je jedina navedena osoba

**B — Vrsta broja**
- +15 mobilni prefiks (06x) — lični brojevi su skoro uvek mobilni
- −20 fiksni (011, 021, 0xx bez 6) — verovatno linija lokala
- −25 isti broj se pojavljuje kao broj salona na Placesu/011info/sajtu
  (to je linija salona, ne osobe)

**C — Kontekst**
- +10 pravni oblik PR (preduzetnik) — vlasnik i firma su ista osoba
- −10 DOO sa više osnivača
- −15 broj nađen samo na agregatoru (imenik trećih strana bez imena)
- +5 broj potvrđen na dva nezavisna izvora sa istim imenom

**Ime uz broj bez ijednog A-dokaza** → „nije moguće proceniti".

Obrazloženje: tačno dve rečenice, prva kaže najjači dokaz, druga najjači
kontra-dokaz ili „nema kontra-dokaza". Primer: „Broj je u APR zapisu
preduzetnika na ime Marija Jović. Isti broj nije prijavljen kao broj salona."
Sirov broj se u obrazloženju ne ponavlja.

Rangiranje 3 osobe: vlasnik/osnivač > direktor > menadžer; unutar iste uloge
veća verovatnoća telefona. Osoba bez telefona ulazi ako je vlasnik (ime je
vredno za cold call preko centrale).

Aplikacija prikazuje: traku 0–100 (crvena < 40, žuta 40–69, zelena ≥ 70),
broj, „nije moguće proceniti" kao siv tekst, obrazloženje ispod. Čovek može da
prepravi (`verovatnocaIzvor: "covek"`) — mutacija `setPhoneConfidence` sa
obaveznim obrazloženjem.

---

## 7. Filteri, LinkChip, tab Niše, profil (GL2)

### 7.1 Filteri (leads-table)
- Stanje u URL-u (`useSearchParams` + `router.replace`, bez `nuqs`). Ključevi:
  `faza`, `zaostali`, `temp`, `nisa`, `grad`, `sajt` (vrednosti: `ima`,
  `nema`, `nepoznato`, `ne_radi`, `parkiran`, `drustvene`, `bez_https` —
  poslednje četiri su podskup od `ima`), `platforma`,
  `koord` (`da|ne`), `tel` (`>=70` itd. — minimalna verovatnoća), `dodir`
  (`7d|30d|nikad`), `q` (tekst po nazivu). Više vrednosti = `,`.
- Traka iznad tabele: chipovi po grupama, svaki sa brojem pogodaka u trenutnom
  preseku (`countLeadsByFacet` query koji vraća brojače za sve fasete odjednom,
  ograničen na 2000 firmi po workspaceu — preko toga piše „>2000, suzi").
- Nula NIJE dugme (postojeće pravilo :177) — chip sa 0 je onemogućen sa
  tooltipom „nema pogodaka u ovom preseku".
- „Sačuvaj preset" → `leadFilterPresets` (naziv + trenutni query), lista
  preseta kao chipovi, brisanje sa potvrdom. Preset je link, ne kopija stanja.
- Filteri se dele sa tabom Mapa (isti URL).
- Backend: `listLeadsFiltered` query sa paginacijom; svaki filter se primenjuje
  server-side, ne u browseru nad 200 učitanih.

### 7.2 LinkChip (`components/app/link-chip.tsx`)
- Props: `vrsta` (`website|instagram|facebook|tiktok|threads|google_maps|
  companywall|011info|phone|email`), `href`, `label?`, `size`.
- Ikona po vrsti (lucide), skraćen domen/handle kao tekst, otvara u novom tabu
  sa `rel="noopener noreferrer"`, desni klik/ikonica „kopiraj". Za `phone`
  `tel:` link + kopiraj; za `email` `mailto:`.
- Zamenjuje `ContactLink` svuda gde se koristi (tabela, prošireni red, profil,
  staging tabela, niše). `ContactLink` se briše kad više nema poziva.

### 7.3 Tab „Niše"
- Lista niša: naziv, broj firmi, broj sa sajtom / bez, broj hot/warm, platforme
  kao LinkChip red, opis (skraćen).
- Klik → panel: opis sa bedžom „Claude · <datum>" ako je `opisAutor ===
  "claude"` ili „<ime> · <datum>" ako čovek; uređivanje opisa (postaje
  `covek`); platforme CRUD (platforma, URL, napomena, redosled); šifre
  delatnosti; dugme „Prikaži firme" → tabela sa `?nisa=<slug>`.
- „Nova niša" ručno (naziv + slug automatski). Skill pravi nišu sam pri prvom
  ingestu ako slug ne postoji (upsert u `applyImport`, opis piše skill).
- Nema AI generisanja iz aplikacije. Aplikacija ne poziva nikakav LLM.

### 7.4 Profil firme (lead-detail) boost
- Sekcija „Osobe": do 3 osobe, uloga + izvor uloge, telefon kao LinkChip +
  traka verovatnoće + obrazloženje, dugme „Ispravi procenu".
- Sekcija „Platforme": LinkChip red (sajt, IG, FB, TikTok, Threads, Google
  Maps link iz `placeId` = `https://www.google.com/maps/place/?q=place_id:<id>`,
  CompanyWall).
- Sekcija „Poreklo": izvori po polju iz `leadFieldProvenance` + `izvestajSkilla`.
- Mini mapa se dodaje u GL3 (ne ovde).
- „Ima sajt: ne (proveren: Places, CompanyWall, pretraga)" / „nepoznato —
  011info nedostupan".
- Kad sajt postoji: red „Sajt: radi · HTTPS · proveren 8. 9." ili „Sajt:
  ne radi (timeout posle 8 s) · proveren 8. 9." — status kao mali bedž iste
  boje-logike kao temperatura (radi = neutralno, ne_radi/parkiran = signal
  za prodaju, ne „greška"). Isti bedž i u tabeli pored LinkChipa sajta i u
  proširenom redu. Nikad proveravano → bez bedža, ne „nepoznato".

---

## 8. Mapa — native slojevi (GL3, Fable)

- Nova zavisnost: `maplibre-gl` (+ `@types` nije potreban, paket nosi tipove).
  Komponenta `components/app/leadovi/leads-map.tsx`, učitava se `dynamic(...,
  { ssr: false })`.
- Tab „Mapa" u `leads-dashboard.tsx`. Deli URL filtere sa tabelom.
- Stil: tamni. Prvo `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/
  style.json` (besplatno uz atribuciju „© CARTO, © OpenStreetMap contributors").
  Ako se u praksi pokaže nestabilno, alternativa je OpenFreeMap
  (`https://tiles.openfreemap.org/styles/positron`) sa tamnim override-om
  paint svojstava. Nema Mapbox naloga, nema ključa.
- Podaci: `listLeadsForMap` query → samo firme sa `lat/lng`, polja: id, naziv,
  temperatura, fit skor (računat pri čitanju preko `scoreLead`), faza, niša,
  imaSajt, poslednji dodir. Firme bez koordinata se broje i prikazuju kao chip
  „bez koordinata: N → prikaži u tabeli" (link na `?koord=ne`).
- Slojevi: GeoJSON source sa `cluster: true`; cluster krugovi sa brojem;
  pojedinačne tačke kao `fill-extrusion` heksagoni (poligon generisan oko
  tačke, poluprečnik zavisan od zooma) — visina = fit skor (0 → 20 m, 100 →
  400 m), boja = temperatura (`--temp-*` tokeni iz `globals.css`, čitani iz
  CSS-a pri mountu, ne hardkodovani).
- Interakcija: hover → kartica (naziv, niša, temperatura, fit, faza); klik →
  bočni panel sa istim radnjama kao prošireni red (`lead-row-actions.tsx`,
  ponovo upotrebljen, ne kopiran); dvoklik → profil.
- Kamera: `pitch: 55`, `bearing: -15`, start na presek filtriranih tačaka
  (`fitBounds`), Beograd kao podrazumevani centar kad nema tačaka.
- Mini mapa u profilu firme: ista komponenta u `mode="single"`, bez klastera,
  bez interakcije osim zooma, sa dugmetom „Otvori na mapi".
- Prazna stanja: nema koordinata ni za jednu → poruka koja kaže zašto (skill
  još nije puštan / Nominatim nije našao), ne prazna mapa.
- Performanse: 1000 tačaka bez pada ispod 50 fps na integrisanoj grafici;
  stil se učitava jednom; unmount čisti mapu (`map.remove()`).
- Atribucija vidljiva, ne skrivena.

---

## 9. Mapa — three.js sloj + GSAP (GL4, Fable, ista sesija kao GL3)

- Nova zavisnost: `three`. GSAP već postoji.
- `CustomLayerInterface` u MapLibre-u: three.js scena sinhronizovana sa
  MapLibre kamerom (matrica iz `render(gl, matrix)`), koristi isti WebGL
  kontekst — ne drugi canvas preko mape.
- Šta crta: za `hot` firme pulsirajući prsten na tlu; za izabranu firmu
  vertikalni snop svetla; za firme sa sastankom u narednih 7 dana blagi
  „beacon". Ništa što ne nosi informaciju.
- GSAP: letovi kamere (`flyTo` interpolacija preko `gsap.to` nad
  `{center, zoom, pitch, bearing}`) pri izboru firme iz panela/tabele, i
  „obilazak" — dugme „Preleti hot firme" koje ide redom sa pauzom 2 s,
  zaustavlja se na klik.
- Isključivanje: ako `prefers-reduced-motion` → bez letova (skok) i bez
  pulsa; ako `WebGL2` nije dostupan → sloj se ne montira, native mapa radi.
  Sloj se uklanja pri unmountu (`dispose()` geometrija i materijala).
- Ne sme da izmeni ponašanje GL3 (klasteri, hover, klik) — samo dodaje.
- Perf budžet: three.js sloj ≤ 4 ms po frejmu sa 500 tačaka.

---

## 10. Skill `/generate-leads` (GL5)

### 10.1 Gde živi
- Izvor u repou: `tools/generate-leads/` (`SKILL.md`, `run.mjs`, `lib/*.mjs`,
  `README.md`). Verzionisan.
- Globalna instalacija: prompt kopira `SKILL.md` u
  `%USERPROFILE%\.claude\skills\generate-leads\SKILL.md`, a `SKILL.md`
  poziva skripte preko apsolutne putanje repoa (upisane pri instalaciji).
  Bez tajni u fajlu.
- Env na mašini (user-level): `GOOGLE_PLACES_API_KEY` (već postavljen),
  `ENIGMA_INGEST_TOKEN` (iz Settings → Tokeni za uvoz),
  `ENIGMA_INGEST_URL` (`https://<deployment>.convex.site/generate-leads/ingest`),
  `ENIGMA_CONTACT_EMAIL` (za Nominatim User-Agent). Skill pri startu proverava
  da sve četiri postoje i staje sa jasnom porukom ako ne — ne štampa vrednosti.

### 10.2 Poziv
`/generate-leads [grad] [niša] [broj] [ima|nema|svejedno]`
- `grad` — jedan grad ili opština („Beograd", „Novi Sad", „Zemun").
- `niša` — slobodan tekst; skill ga mapira na slug (`frizerski-saloni`) i na
  listu Places upita na srpskom i engleskom („frizerski salon", „hair salon",
  „frizer") — mapiranje je u `lib/nise.mjs`, ručno održavano, sa 10 početnih
  niša (frizeri, kozmetički saloni, turističke agencije, stomatolozi, teretane,
  restorani, auto-servisi, cvećare, pekare, butici). Nepoznata niša → skill
  pita za 2–3 Places upita, ne izmišlja.
- `broj` — cilj, 1–50.
- filter sajta — `ima`, `nema` ili `svejedno` (podrazumevano `svejedno` kad
  se izostavi). Filter bira KOJE firme ulaze; status sajta (§3.8) se
  proverava za sve, uvek. `nema` ostaje najkorisniji za prodaju sajtova, ali
  `ima` + `sajtStatus: ne_radi/parkiran/bez HTTPS-a` je druga žila.

### 10.3 Tok
1. Provera env + `--dry-run` zastavica (piše JSON u `tools/generate-leads/out/
   <datum>-<grad>-<nisa>.json` umesto POST-a).
2. Places Text Search po upitima niše, paginacija dok ne nakupi kandidata ili
   Places ne vrati kraj. Dedup po `place_id`. Kandidati koji nisu u traženom
   gradu (po `formattedAddress`) se odbacuju.
3. Za svakog kandidata, redom, dok ne ispuni `broj`:
   - postojanje sajta (§3.4) → filter `ima|nema|svejedno` odlučuje da li
     kandidat ulazi; `nepoznato` ulazi samo kod `svejedno`,
   - status sajta (§3.8, `run.mjs check-site`) za svaku firmu koja ima sajt,
   - CompanyWall/APR (PIB, MB, delatnost, osobe, telefon, adresa),
   - 011info ako je Beograd,
   - sajt firme (ako postoji): kontakt, IG/FB/TikTok linkovi, imena,
   - društveni profili: bio, telefon, link,
   - verovatnoća telefona po §6, rangiranje 3 osobe,
   - Nominatim geokodiranje adrese,
   - suppression se NE proverava ovde (radi ga `createImport`).
4. Kandidata koji posle svega nema ni telefon ni email ni IG — skill zadržava
   (ime + adresa + koordinate su i dalje lead za obilazak), ali označava
   `izvestajSkilla: "bez kontakta"`.
5. Kad Places iscrpi rezultate pre `broj` → staje, `iscrpljen: true`.
6. POST na ingest. Ispisuje: „Poslato X redova (traženo Y). Places poziva: N.
   Nedostupni izvori: … Otvori: <url>". Nikad sirove telefone/emailove u
   izlazu — samo brojeve („telefona: 14, sa procenom: 9").
7. Ako ingest vrati ≠ 200 → čuva JSON lokalno kao u `--dry-run` i ispisuje
   status + putanju, da run ne propadne.

### 10.4 Podela posla skill ↔ Claude
`run.mjs` radi deterministički deo (Places, Nominatim, HTTP fetch, POST,
skor po §6). Claude u skillu radi čitanje stranica (izvlačenje imena, uloge,
telefona uz ime, IG handle-a iz HTML-a) i puni ulaz za skor. Skill fajl
eksplicitno zabranjuje Claude-u da dopunjava podatke „iz opšteg znanja".

### 10.5 Testovi
- `node tools/generate-leads/run.mjs --self-test`: skor po §6 nad 8
  fiksnih slučajeva (uključujući „nije moguće proceniti"), mapiranje niša,
  validacija JSON-a prema istoj zod šemi kao endpoint (šema se deli preko
  `tools/generate-leads/lib/schema.mjs` generisane iz `convex/lib/
  generateLeadsIngest.ts` — ili se uvozi direktno ako tsx radi).
- Dry-run nad `Beograd frizeri 3 nema` se pokreće ručno, ne u noćnom runu
  (troši Places kvotu i zahteva njegov token).

---

## 11. Šta noćni run NE radi
- Ne pokreće skill nad stvarnim gradom (token + kvota su Jovanovi).
- Ne dira `ADMIN_SETUP_CODE`, invite tok, PZ4 (već na produkciji: b6767f6,
  ae45b06, dc61158).
- Ne uvodi `nuqs`, Mapbox, react-map-gl, Google Maps JS API.
- Ne skrejpuje iz aplikacije.

## 12. Otvoreno posle runa (Jovan odlučuje)
- Labavije čitanje Places uslova (§3) — samo u skillu.
- Overpass (OSM) kao drugi izvor otkrivanja kad Places presuši — nije u GL5.
- Automatsko geokodiranje postojećih firmi bez koordinata iz aplikacije
  (Convex action → Nominatim, 1 req/s, ručno dugme „Dopuni koordinate").
