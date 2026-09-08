# GL3 — Mapa leadova, MapLibre native slojevi

Datum: 08.09.2026. · Grana: `main` · Model: Fable, effort high

Tačke 1–5 su urađene (5 uključujući red „Bez koordinata" sa razlogom).
`npm run typecheck`, `npm run verify:purge` i `npm run build` prolaze;
`npx eslint` nad svim mojim fajlovima je čist.

Pre-flight: `git log` je pokazao `e874b42 … [GL1]` i `d7c8db4 … [GL2]` na
`main`. Pročitao sam `nocni-run/izvestaji/GL1.md` i `GL2.md`, plan §0, §2
(O4, O9), §8 i §9 (samo da znam šta GL4 dodaje), sve navedene fajlove i
`.claude/skills/motion-design/SKILL.md` (+ `director/context-adaptation.md`
za `prefers-reduced-motion`). three.js/GSAP skillove nisam čitao — oni su za
GL4.

CLAUDE.md traži `impeccable` design skill pre UI zadatka — **nije dostupan u
sesiji**; po istom pravilu koristio sam `frontend-design` smernice.

**CSP:** `next.config.ts` nema `headers()`, `proxy.ts` ne postavlja CSP,
`vercel.json`/`vercel.ts` ne postoje. Nema šta da se popravi — zahtevi ka
`basemaps.cartocdn.com`, `tiles.basemaps.cartocdn.com` i
`tiles.openfreemap.org` nisu blokirani konfiguracijom.

---

## 1. Backend (§8)

`convex/leadFiltersStore.ts`, nova sekcija „MAPA (GL3)":

- **`listLeadsForMap`** — isti argumenti kao `listLeadsFiltered`
  (`FILTER_ARGS`), isti helperi (`ucitajOsnovu`, `napraviTestove`,
  `prolaziSve`) — ništa nije kopirano. Vraća `tacke` (samo firme sa `lat` i
  `lng`), `bezKoordinata` (isti presek, bez koordinata),
  `saKoordinatamaUkupno` (ceo pregledani radni prostor — za prazno stanje),
  `ukupno`, `prekoracen`, `identitetiOdseceni`, `signaliOdseceni`,
  `pregledano`, `now`.
- **Fit skor pri čitanju** kroz `scoreLead` (§0 pravilo 2): pravila se čitaju
  jednom po pozivu; signali se čitaju JEDNIM indeksnim prolazom
  (`leadSignals.by_workspace`, granica 8000 → `signaliOdseceni`) i grupišu po
  firmi — upit po firmi bi za 2000 tačaka bio 2000 upita.
- Svaka tačka nosi: `companyId`, `naziv`, `grad`, `lat`, `lng`, `temperatura`
  (`null` = čovek nije odlučio), `fit` (procenat ili `null`), `fitRazlog`
  (`bez_pravila` | `bez_signala` | `null`), `fitBodovi`, `fitMax`, `faza`,
  `nisa` (naziv), `nisaSlug`, `imaSajt`, `poslednjiDodirAt`, `sastanakAt`.
- **`getLeadRow`** — jedan red u TAČNO obliku reda tabele
  (`hydrateLeadRowExtras`), za bočni panel. `null` kad firma nema dodelu.
- Obe funkcije idu kroz `proveriPristup` (`requireMembership` +
  `membership.workspaceId !== args.workspaceId`).

Nema nove tabele ni novog polja u šemi.

## 2. Zavisnost

`npm install maplibre-gl` → `maplibre-gl@6.8.0` (samo to; lockfile samo dodaje
22 tranzitivna paketa). CSS `maplibre-gl/dist/maplibre-gl.css` je uvezen u
`leads-map-canvas.tsx`, ne globalno.

## 3. Komponenta mape (§8)

Tri fajla umesto jednog, jer je MapLibre teška zavisnost koja ne sme na
server, a stanja ekrana ne smeju da čekaju na nju:

- **`components/app/leadovi/leads-map.tsx`** — javni `LeadsMap`
  (`mode="all"` | `mode="single"`), `dynamic(..., { ssr: false })` za canvas,
  četiri stanja, hover kartica, legenda, brojač, veza sa panelom.
- **`components/app/leadovi/leads-map-canvas.tsx`** — samo MapLibre: stil,
  izvori, slojevi, kamera, događaji. Izlaz su callback-ovi.
- **`components/app/leadovi/leads-map-panel.tsx`** — bočni panel.

Šta je urađeno, po tačkama plana:

- **Stil:** CARTO dark-matter → fallback OpenFreeMap positron. Mapa se pravi
  BEZ stila pa se `setStyle(url, { transformStyle })` zove ručno, jer
  `MapOptions` u 6.8 nema `transformStyle`. Neuspeh se detektuje: `error`
  događaj pre `style.load` (greške pločica, koje nose `tile`, se ignorišu jer
  nisu greška stila) ILI rok od 20 s → sledeći izvor → posle poslednjeg
  stanje (b) sa razlogom. WebGL koji ne može da se pokrene (konstruktor baca)
  je isto stanje (b), sa drugom porukom.
- **Slate override** (jedna funkcija za oba izvora): pozadina i kopno na
  `--bg-950/900`, voda tamnija od kopna, zgrade/parkovi `--bg-800`, putevi
  `--line`, granice `--text-muted`, natpisi `--text-muted`/`--text-secondary`
  sa halo `--bg-950`. Širine linija i redosled slojeva iz izvornog stila
  ostaju.
- **Tokeni:** `getComputedStyle(document.documentElement)` pri montiranju za
  `--temp-hot/warm/cold`, `--accent-400`, `--surface*`, `--line*`,
  `--text-*`, `--bg-*`. Nijedna heks vrednost nije upisana u kod; token koji
  ne postoji daje CSS `gray` (namerno ružno, da se rupa vidi).
- **GeoJSON source sa `cluster: true`** (radius 44, `clusterMaxZoom` 15) +
  drugi source za heksagone. Klasteri su native `circle` (`--surface-raised`
  sa `--accent-400` obrubom, `circle-pitch-alignment: viewport`) + `symbol` sa
  `point_count_abbreviated`. Font za broj se čita sa prvog symbol sloja
  učitanog stila (bold ako postoji) — CARTO i OpenFreeMap nemaju iste
  fontove na glyph serveru.
- **Heksagoni kao `fill-extrusion`:** poligon od 6 temena oko tačke,
  poluprečnik 13 px ekrana preračunat u metre za trenutni zoom i širinu
  (`156543·cos(lat)/2^zoom`); `fill-extrusion-height` = 20 m + fit/100 · 380 m;
  boja po temperaturi iz tokena, svetlija varijanta (30 % ka `--text-primary`)
  za `hover`/`selected` kroz `feature-state`. Heksagoni se crtaju SAMO za
  tačke koje trenutno nisu u klasteru: `querySourceFeatures` sa filterom
  `!has point_count`, osveženo kroz `requestAnimationFrame` na `move` i pri
  `sourcedata`. Firma bez merljivog fita dobija NAJNIŽI heksagon (20 m), ne
  srednji; kartica piše „bez pravila"/„bez signala", nikad 0 %.
- **Hover kartica:** naziv, grad · niša, čip temperature (isti tokeni kao u
  tabeli), Fit, faza (`StageChip`). Ulaz 120 ms fade + 4 px pri promeni
  FIRME (ne pri svakom pomeraju), reduced-motion samo fade; prevrće se na
  drugu stranu kursora uz desnu/donju ivicu.
- **Klik → bočni panel** (`leads-map-panel.tsx`): `LeadRowActions`,
  `LeadCallStrip`, `LeadExpandedRow` i dijalozi — SVE ponovo upotrebljeno.
  Panel klizi 16 px + fade (`DUR_UI`, `EASE_UI`), reduced-motion samo fade.
  Escape i X zatvaraju. Klik u prazno zatvara.
- **Dvoklik → profil** (`router.push`), sa `e.preventDefault()` da dvoklik ne
  zumira mapu ispod.
- **Klik na klaster** → `getClusterExpansionZoom` → `easeTo`.
- **Kamera:** `pitch 55`, `bearing −15`, Beograd (20.4573, 44.8125) kao
  početak; `fitBounds` (padding 56, `maxZoom` 15) kad se promeni SKUP tačaka,
  ne pri svakom renderu; `?firma=` iz URL-a centrira na zoom 15. Klik na
  heksagon NE pomera kameru (čovek već gleda tu tačku) — osim kad bi panel
  prekrio baš nju, tada `easeTo` sa desnim paddingom. Pri zatvaranju panela
  padding se vraća samo ako je bio postavljen. Svi pokreti kamere su 0 ms pod
  `prefers-reduced-motion`.
- **Atribucija** je vidljiva, `compact: false`, dole LEVO (desno je panel),
  sa `© OpenStreetMap contributors` uz atribuciju izvora stila.
- **`map.remove()`** pri odmontiranju; i rAF i rok se čiste.
- MapLibre kontrole i atribucija su prebojene na tokene kroz Tailwind
  `[&_.maplibregl-…]` varijante na kontejneru (ikonice su crni SVG u CSS-u
  biblioteke → `invert`).

**Četiri stanja, četiri različita izgleda:**

| Stanje | Kako izgleda |
| --- | --- |
| (a) učitava se | `Skeleton` preko cele površine + pilula „Učitavam firme…" / „Učitavam mapu…" sa spinnerom (`motion-safe`) |
| (b) stil nije mogao da se učita | puna površina `bg-surface`, ikona upozorenja u crvenom prstenu, naslov, RAZLOG (koji izvor, šta), dugme „Pokušaj ponovo" (pravi mapu od nule, od prvog izvora) |
| (c) nema firme sa koordinatama | kartica BEZ mape: `MapPinOff`, naslov + objašnjenje koje zavisi od uzroka (vidi dole), link „Prikaži ih u tabeli (N)" → `?koord=ne`, „Očisti filtere" kad ima filtera |
| (d) ima tačaka | mapa, legenda (temperature + „visina = fit skor"), brojač, chip „bez koordinata: N" |

Stanje (c) razlikuje tri uzroka jer traže tri različita poteza: presek je
prazan (nijedan lead ne odgovara filterima / nema dodeljenih leadova),
**nijedna firma u radnom prostoru nema koordinate** („skill još nije puštan"
— tačno slučaj koji će produkcija sada pokazati), ili firme sa koordinatama
postoje ali nisu u ovom preseku.

## 4. Tab „Mapa"

`map` u `Tab` union + `TabNav` (ikona `Map` iz lucide, odmah posle tabele).
Tab deli `useLeadFilters()` — `LeadFilterBar` je već bio zasebna komponenta
iz GL2, pa se crta iznad mape bez izvlačenja. Ispod trake: „N firmi na mapi"
+ chip **„bez koordinata: N · prikaži u tabeli"** (link na `/leadovi?<isti
filteri>&koord=ne`), + napomena kad radi rezervni izvor mape, + upozorenja
kad je nešto odsečeno (2000 dodela / 8000 signala / 8000 identiteta).

**Jezičak sada živi u URL-u** (`?tab=map`; tabela je podrazumevana i ne
upisuje se). To je bio uslov da `/leadovi?tab=map&firma=<id>` radi.

## 5. Mini mapa u profilu

`<LeadsMap mode="single" workspaceId company fit />` u jezičku „Firma i
poreklo", odmah ispod adrese: jedna tačka, bez klastera, zum dozvoljen
(scroll/dvoklik/prsti), pomeranje/rotacija/tastatura isključeni, dugme
**„Otvori na mapi"** → `/leadovi?tab=map&firma=<id>`, i natpis „koordinate:
Nominatim/ručno · fit N %".

Firma bez koordinata dobija red „Bez koordinata (…)" sa razlogom:

- nema `street` ni `city` → „firma nema zabeleženu adresu, pa nema šta da se
  geokodira";
- ima adresu i ima tragove skilla (`placeId`, `imaSajt` ili `sajtProverenAt`)
  → „skill je obradio firmu, ali Nominatim nije našao ovu adresu";
- ima adresu, bez tragova skilla → „skill /generate-leads nije puštan za ovu
  firmu".

## 6. URL hook, dijalozi, prošireni red

- `use-lead-filters.ts`: **`nav: { tab, firma }`** + **`setNav`**; ključevi
  nisu filteri (ne ulaze u preset ni u broj aktivnih grupa). `applyQuery(qs,
  navDelta?)` upisuje filtere i jezičak u JEDNOM `router.replace` — dva
  uzastopna bi drugi pregazio prvi (isti zastareli `searchParams`); zato niše
  „Prikaži firme" sada zove `applyQuery(..., { tab: null })`.
- **`lead-row-dialogs.tsx`** — `switch` sa šest dijaloga izvučen iz tabele u
  `LeadRowDialogs` + `LeadRowDialogState`, koristi ga i tabela i panel.
- `lead-expanded-row.tsx` — prop `stacked` (jedna kolona): prelomi `md:`/`xl:`
  gledaju širinu PROZORA, pa bi u panelu od 380 px nagurali četiri kolone.

## 7. Provera

- **Playwright** postoji kao MCP plugin, ali screenshot test nema smisla bez
  prijave i bez dev servera u noćnom runu — pa umesto toga:
  `npm run build` (verify:purge + `next build`) **prolazi** (dva puta, posle
  poslednje izmene ponovo). `typecheck` čist.
- Nijedan piksel nije viđen u browseru. Sve tvrdnje o izgledu su čitanje koda.

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

**A. Stanje (c) — skill još nije puštan, nijedna firma nema koordinate**

1. Otvori `digital.enigmait.rs/leadovi`. U traci jezičaka, odmah posle
   „Tabela leadova", stoji **Mapa**. Klikni.
2. Adresa postaje `…/leadovi?tab=map`. Iznad je ista traka filtera kao u
   tabeli (faze toka + „Filteri").
3. Ispod trake NE sme biti prazna mapa. Mora da stoji kartica sa ikonom
   precrtane čiode i naslovom **„Nijedna od N firmi nema koordinate"** i
   objašnjenjem da koordinate dodeljuje skill `/generate-leads` i da dok se
   ne pusti mapa nema šta da nacrta. Ispod: dugme **„Prikaži ih u tabeli
   (N)"**.
4. Klikni to dugme → otvara se tabela sa `?koord=ne` i chipom „bez
   koordinata" među aktivnim filterima. Broj redova = N.
5. Vrati se na Mapu, klikni „Filteri" → izaberi nešto što daje 0 pogodaka
   (npr. faza „Dobijen" ako je nema). Kartica menja naslov u **„Presek
   filtera je prazan"** sa dugmetom „Očisti filtere" — drugačija rečenica od
   tačke 3.
6. Otvori `…/leadovi?tab=map` direktno u novom tabu — mora da otvori Mapu, ne
   tabelu.

**B. Profil bez koordinata**

7. Otvori bilo koju firmu → jezičak **Firma i poreklo**.
8. Ispod reda sa adresom stoji red **„Bez koordinata (…)"** sa jednim od tri
   razloga iz tačke 5 izveštaja. Za firme iz starih XLSX uvoza očekivan je
   „skill /generate-leads nije puštan za ovu firmu"; za firmu bez grada i
   ulice „firma nema zabeleženu adresu…". Nema mape, nema dugmeta „Otvori
   na mapi".

**C. Stanje (d) — posle prvog skill uvoza sa koordinatama (GL5)**

9. Mapa → tamna mapa u bojama aplikacije, nagnuta (pitch 55), Beograd ako
   je uvoz bio beogradski; kontrole zuma gore levo, legenda desno od njih,
   atribucija „© CARTO, © OpenStreetMap contributors" dole levo VIDLJIVA.
10. Krugovi sa brojem = klasteri; klik zumira dok se ne raspadnu na
    heksagone. Visina heksagona prati Fit u tabeli (uporedi jednu firmu:
    visok Fit = visok stub). Boja = temperatura (uporedi sa čipom u tabeli).
11. Pređi mišem preko heksagona: kartica sa nazivom, gradom · nišom,
    temperaturom, Fit (procenat ILI „bez signala"/„bez pravila" — nikad 0 %)
    i fazom. Heksagon posvetli.
12. Klik → desno klizi panel: naziv (link na profil), grad, faza, red radnji
    (telefon / mejl / sastanak / ⋯), pa Kontakt / Signali / Dodir i plan /
    Beleška u jednoj koloni. Adresa dobija `&firma=<id>`. Escape ili X
    zatvara i skida `firma` iz adrese. Klik u prazno takođe zatvara.
13. Klik na telefon u panelu → ista traka „Pozvao si — kako je prošlo?" kao
    u tabeli. „Zakaži sastanak" otvara isti dijalog.
14. Dvoklik na heksagon → otvara profil firme (mapa se NE zumira pre toga).
15. Promeni filter (npr. temperatura „hot") — kamera se sama uklopi na novi
    presek; chip „bez koordinata: N" pored trake prati presek.
16. U profilu firme SA koordinatama (Firma i poreklo): mini mapa visine
    ~220 px sa jednim heksagonom, zum radi, prevlačenje ne; „Otvori na
    mapi" → `…/leadovi?tab=map&firma=<id>` otvara Mapu centriranu na tu
    firmu sa otvorenim panelom. Ako je firma van trenutnog preseka filtera,
    iznad mape stoji upozorenje „Firma iz linka nije u trenutnom preseku"
    sa „Očisti filtere".
17. **Stanje (b):** u DevTools → Network blokiraj `basemaps.cartocdn.com` i
    `tiles.openfreemap.org`, osveži Mapu → posle najviše 2×20 s crvena
    poruka „Mapa nije mogla da se učita" sa razlogom i dugmetom „Pokušaj
    ponovo". Blokiraj samo CARTO → mapa se učita sa OpenFreeMap-a i pored
    brojača piše „rezervni izvor mape (OpenFreeMap)"; izgled ostaje isti
    (slate override).
18. **Reduced motion:** uključi „smanji pokret" u OS-u → panel i kartica
    samo fade, kamera skače bez animacije.

---

## Odluke koje sam doneo sam (nisu iz prompta ni iz plana)

1. **Slate override se primenjuje i na CARTO, ne samo na OpenFreeMap.** Plan
   traži override samo za fallback; ali dark-matter je neutralno siv, a
   aplikacija plavo-slate — bez overridea bi mapa bila „ubačen widget". Isti
   override za oba izvora znači i da fallback izgleda IDENTIČNO.
2. **Mapa se konstruiše bez stila pa se stil učitava kroz `setStyle`.**
   `MapOptions` u MapLibre 6.8 nema `transformStyle`, a override mora pre
   prvog crtanja. Nema vizuelne razlike.
3. **Jezičak u URL-u (`?tab=`).** Prompt traži `?tab=map&firma=<id>` iz
   profila; da bi to radilo, a kopiran link ostao istinit, jezičak je
   preseljen iz `useState` u URL. Tabela je podrazumevana i ne upisuje se, pa
   svi stari linkovi rade isto. Nuspojava: `applyQuery` je dobio opcioni
   `navDelta` (jedan upis umesto dva).
4. **Heksagon konstantne širine u pikselima (13 px), a visina u metrima.**
   Plan kaže „poluprečnik zavisan od zooma" bez broja; piksel-konstantan
   poluprečnik je najčitljiviji. Posledica: na zoomu 17 stub od 400 m je
   ~330 px visok — to je istinita geometrija, ne bug.
5. **Firma bez merljivog fita = 20 m, a hover piše zašto.** Plan daje formulu
   0 → 20 m, 100 → 400 m, ne kaže šta je sa `null`. Srednja visina bi bila
   laž (§0 pravilo 1); najniža + tekst „bez signala"/„bez pravila" nije.
6. **Klik na heksagon ne pomera kameru; URL/`firma` pomera.** Plan ne kaže.
   Čovek koji je kliknuo već gleda tu tačku; pomeranje bi mu je oduzelo.
   Izuzetak: kad bi panel prekrio tačku.
7. **Klasteri kao native `circle` + `symbol`, ne DOM markeri.** Naslov posla
   je „native slojevi", a GL4 crta u istom WebGL kontekstu — DOM markeri bi
   plutali iznad three.js sloja. Cena: font za broj mora da postoji na glyph
   serveru stila, pa se čita iz stila.
8. **Signali za mapu se čitaju jednim prolazom sa granicom 8000**, po uzoru
   na identitete u GL2, sa `signaliOdseceni` i upozorenjem na ekranu. Plan
   kaže samo „fit skor računat pri čitanju".
9. **`sastanakAt` je na tački** iako ga GL3 ne crta — GL4 (§9, „beacon" za
   sastanke u narednih 7 dana) ga traži, a već je učitan sa dodelom.
10. **Razlog za „Bez koordinata" se izvodi iz tragova skilla** (`placeId`,
    `imaSajt`, `sajtProverenAt`) jer šema nema polje „geokodiranje pokušano,
    nije uspelo". Prompt traži da se bira „prema `koordinateIzvor` i
    postojanju adrese" — `koordinateIzvor` ne postoji kad koordinata nema,
    pa je ovo najbliža ISTINITA razlika između „nije puštan" i „Nominatim
    nije našao".
11. **`firma` van preseka ne otvara panel** — panel se otvara samo za
    `companyId` koji je među učitanim tačkama (poznato važeći id). Nevažeći
    string iz URL-a bi inače srušio `useQuery` validatorom. Umesto toga
    upozorenje sa „Očisti filtere"/„Skloni".
12. **Bez izlazne animacije panela** — odmontira se odmah. Po skillu izlaz je
    manje važan od ulaza, a stanje-mašina za odloženo odmontiranje nije
    vredna rizika u prvom prolazu.
13. **Atribucija dole levo**, ne podrazumevano dole desno — desno je panel.
14. **`fitBounds` samo kad se promeni SKUP id-jeva** (`idsKey`), ne pri
    svakom novom paketu iz Convexa — inače bi svaka promena faze u panelu
    vratila kameru.

## Poznati rizici i šta NIJE urađeno

- **Ništa nije provereno u browseru.** Noćni run nema dev server ni
  prijavu. MapLibre inicijalizacija, raspored slojeva, boje stila i
  ponašanje `fitBounds` sa pitch-om su pisani po tipovima i dokumentaciji
  (6.8.0), ne posmatrani. Najverovatnija mesta za doradu posle prvog
  gledanja: (1) `fill-outline-color` heuristika u slate overrideu, (2)
  osvetljenost `nova_firma` heksagona, (3) `invert` na kontrolama zuma.
- **Perf cilj „1000 tačaka ≥ 50 fps" nije izmeren.** Heksagoni se
  regenerišu na `move` (rAF); za 1000 vidljivih tačaka to je ~7000 temena po
  kadru — očekivano jeftino, ali nije mereno. Ako zapne: osvežavati samo na
  `moveend`.
- **Greška pločice pre učitavanja stila** se prepoznaje po polju `tile` na
  događaju; ako MapLibre 6.8 to polje ne prosleđuje za neki tip greške,
  prelazak na fallback bi se desio i kad stil radi (mapa i dalje radi, samo
  sa OpenFreeMap-a i sa natpisom „rezervni izvor").
- **Dva `easeTo` pri otvaranju iz URL-a** (efekat skupa tačaka + efekat
  izbora) idu na isto mesto; poslednji pobeđuje, nema vidljive posledice,
  ali nije elegantno.
- **`Date.now()` u `listLeadsForMap`** — isti obrazac kao `listLeadsFiltered`
  (Convex smernice ga ne preporučuju u upitima; `scoreLead` traži `now`).
- **Playwright screenshot test nije napravljen** (vidi §7 gore).
- **`npm run lint` nad celim repoom:** vidi red ispod (zatečene greške nisu
  moje; `npx eslint` nad mojim fajlovima je čist). Zatečena upozorenja u
  fajlovima koje sam dirao a nisu moja: `Doc` neiskorišćen u
  `convex/leadCrmStore.ts` (nisam ga dirao u ovoj rundi).
- **`npm run lint` nad celim repoom: 1287 grešaka i 21396 upozorenja** —
  identično GL2 (1287/21396), dakle nijedna nova; nijedna nije u fajlovima
  mape ni u `lead-row-dialogs.tsx`. Uglavnom `no-explicit-any` u
  `scripts/verify-gads-*.ts`.

## Dodati fajlovi

- `components/app/leadovi/leads-map.tsx`
- `components/app/leadovi/leads-map-canvas.tsx`
- `components/app/leadovi/leads-map-panel.tsx`
- `components/app/leadovi/lead-row-dialogs.tsx`
- `nocni-run/izvestaji/GL3.md`

## Izmenjeni fajlovi

- `convex/leadFiltersStore.ts` (`listLeadsForMap`, `getLeadRow`)
- `components/app/leadovi/use-lead-filters.ts` (`nav`, `setNav`,
  `applyQuery(qs, navDelta)`)
- `components/app/leadovi/leads-dashboard.tsx` (tab „Mapa", jezičak u URL-u)
- `components/app/leadovi/leads-table.tsx` (dijalozi kroz `LeadRowDialogs`)
- `components/app/leadovi/lead-expanded-row.tsx` (prop `stacked`)
- `components/app/leadovi/lead-detail.tsx` (mini mapa)
- `package.json`, `package-lock.json` (`maplibre-gl`)

`convex/_generated/api.d.ts` nije menjan — nove funkcije su u postojećem
modulu `leadFiltersStore`, koji je već registrovan.
