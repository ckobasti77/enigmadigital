# GL3 — Mapa leadova, MapLibre native slojevi

Model: **Fable** · Effort: **high** · Mode: **acceptEdits (implementacija)** · Sesija: **nova** (GL4 nastavlja OVU sesiju)

Ti si u repou `enigmadigital`. GL1 i GL2 su na `main` (proveri `git log -5`
za `[GL1]` i `[GL2]`; ako GL1 fali → `NEUSPEH GL3: GL1 nije na main`; ako
samo GL2 fali, nastavi ali bez deljenja URL filtera — zapiši u izveštaj).
Pročitaj `nocni-run/izvestaji/GL1.md` i `GL2.md`.

Pročitaj `generate-leads-plan.md` — sekcije **§0, §2 (O4, O9), §8**, i §9
samo da znaš šta GL4 dodaje (ne implementiraj ga). Pročitaj
`components/app/leadovi/leads-dashboard.tsx`, `use-lead-filters.ts`,
`lead-row-actions.tsx`, `lead-expanded-row.tsx`, `app/globals.css` (tokeni
`--temp-*`), `convex/lib/leadScoring.ts` (`scoreLead`),
`convex/leadScoringStore.ts` (kako se pravila čitaju za skor),
`app/(app)/leadovi/[companyId]/lead-detail-page-client.tsx`.

U `.claude/skills/` postoji `motion-design` — pročitaj ga pre koda (za
tranzicije kartice/panela i za `prefers-reduced-motion`). three.js/GSAP
skillove NE čitaj u ovom promptu — oni su za GL4 koji nastavlja ovu sesiju.

Ovo je vizuelni posao. Ukus je deo zadatka: tamna mapa mora da izgleda kao deo
aplikacije (isti tokeni boja, isti radijusi, ista tipografija kartica), ne kao
ubačen widget. Ali ništa lepo ne sme da bude lažno: visina = fit skor iz
`scoreLead`, boja = temperatura iz baze, klaster broj = stvaran broj.

## Uradi, ovim redom

### 1. Backend
`listLeadsForMap` query (§8) — samo firme sa `lat` i `lng`, primenjuje iste
filtere kao `listLeadsFiltered` (deli helper, ne kopiraj). Vraća i
`bezKoordinata: number` za isti presek filtera. Fit skor računaj pri čitanju
kroz `scoreLead` sa aktivnim pravilima (jednom učitanim, ne po firmi).

### 2. Zavisnost
`npm install maplibre-gl` (samo to). CSS `maplibre-gl/dist/maplibre-gl.css`
uvezi u komponentu, ne globalno.

### 3. Komponenta `components/app/leadovi/leads-map.tsx`
Po §8, sve tačke: dynamic import bez SSR, Carto dark-matter stil (fallback
OpenFreeMap positron sa tamnim override-om ako stil ne učita — detektuj
`error` event, ne pretpostavljaj), GeoJSON source sa klasterima, heksagoni
kao `fill-extrusion` (visina 20–400 m po fit skoru, boja iz `--temp-*` tokena
pročitanih `getComputedStyle` pri mountu), hover kartica, klik → bočni panel
sa `lead-row-actions` (ponovna upotreba), dvoklik → profil, `fitBounds` na
presek, Beograd kao podrazumevani centar, pitch 55 / bearing −15, atribucija
vidljiva, `map.remove()` na unmount.

Stanja koja moraju postojati i biti različita: (a) učitava se, (b) stil nije
mogao da se učita (poruka + dugme „Pokušaj ponovo"), (c) nema nijedne firme sa
koordinatama u preseku (poruka koja kaže zašto + link `?koord=ne`), (d) ima
tačaka. Nijedno ne sme da liči na drugo.

### 4. Tab „Mapa"
`map` u `Tab` union + `TabNav`. Tab deli `useLeadFilters()` sa tabelom — ista
traka filtera iznad mape (izvuci traku u zasebnu komponentu ako je GL2 ostavio
u tabeli). Chip „bez koordinata: N" pored trake.

### 5. Mini mapa u profilu
`<LeadsMap mode="single" companyId=… />` u profilu firme: jedna tačka, bez
klastera, zoom dozvoljen, dugme „Otvori na mapi" → `/leadovi?tab=map&firma=<id>`
(dodaj `tab` i `firma` u URL hook ako nema; `firma` centrira i otvara panel).
Firma bez koordinata: umesto mape kratak red „Bez koordinata (Nominatim nije
našao adresu / skill nije puštan)" — bira se prema `koordinateIzvor` i
postojanju adrese, ne nasumično.

### 6. Provera
- Playwright je dostupan u repou? Ako jeste, napravi screenshot test koji
  otvara `/leadovi?tab=map` u dev serveru sa test workspaceom nije moguće bez
  prijave — zato umesto toga: `npm run build` mora da prođe (MapLibre + dynamic
  import često puca tek u buildu). Ako `next build` traži env koji nema
  lokalno, zapiši i preskoči, ali `typecheck` je obavezan.
- U izveštaj: tačan spisak koraka za ručnu proveru na produkciji (tab Mapa sa
  0 firmi sa koordinatama — jer skill još nije puštan — mora da pokaže stanje
  (c), ne praznu mapu; profil bez koordinata mora da pokaže red iz tačke 5).

## Kriterijum gotovosti
1–4 obavezno. 5 poželjno. Ako mapa ne može da se učita zbog CSP-a ili
`next.config.ts` ograničenja (proveri `headers()`/CSP pre nego što kreneš),
popravi konfiguraciju — dozvoli samo domene koje plan navodi.
