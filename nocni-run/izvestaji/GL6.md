# GL6 — Mapa ne crta (MapLibre worker), filter grada u skillu, sitne dorade

Datum: 08.09.2026. · Grana: `main` · Model: Opus, effort high · Sesija: nova

Sve iz prompta je urađeno: **1 i 3 (obavezno)** u celini, **2, 4, 5 (poželjno)**
takođe u celini. `npm run typecheck`, `npm run verify:purge`,
`npm run verify:gl-ingest`, `npm run verify:gl-skill` (sada **148** provera) i
`npm run build` prolaze. `npx eslint` nad svim mojim izmenjenim TS/TSX fajlovima
= **0 grešaka** (4 zatečena upozorenja koja nisu moja — vidi „Poznati rizici").

Pre-flight: pročitao sam `nocni-run/izvestaji/GL3.md`, `GL4.md`, `GL5.md` i
`generate-leads-plan.md` §3, §8 (i §4, §5, §10 za kontekst). CLAUDE.md traži
`impeccable` skill pre UI zadatka — **nije dostupan u sesiji**; palete i stanja
mape su rađena po `frontend-design` smernicama i po tokenima iz `globals.css`.

---

## 1. Mapa: MapLibre worker (najvažnije) — **urađeno**

Uzrok tačno kako je prompt izmerio: `maplibre-gl@6.8` izvodi worker URL iz
`import.meta.url`, koji u Next/Turbopack bundlu pokazuje na
`/_next/static/chunks/…`, pa worker traži `…/maplibre-gl-worker.mjs` koji ne
postoji; Blob `import` proguta 404, platno ostane prazno bez greške.

Urađeno tačno po receptu iz prompta:

1. **`scripts/copy-maplibre-worker.mjs`** kopira `maplibre-gl-worker.mjs` i
   `maplibre-gl-shared.mjs` (worker ga uvozi relativno) iz
   `node_modules/maplibre-gl/dist/` u `public/maplibre/`. Ne kopira `-dev`
   varijante. **Pada** ako izvorni fajl ne postoji.
2. **`package.json`**: `"prebuild"` i `"postinstall"` pokreću tu skriptu.
   `public/maplibre/` je u **`.gitignore`** (generisan, prati `package-lock`).
   Potvrđeno da `npm run build` pokreće `prebuild` (obrisao sam `public/maplibre`
   pre builda — build ga je ponovo napravio).
3. **`leads-map-canvas.tsx`**: `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")`
   jednom po modulu (`namestiWorker()`), pre prvog `new MapLibreMap(...)`.
4. **`next.config.ts` headers — NIJE dodato, i to je namerno.** Prompt kaže
   „proveri `curl -I` pre nego što dodaš — ne dodaj ako nije potrebno".
   Pokrenuo sam `npm run build` + `npm run start` i uradio `curl -I`:
   ```
   /maplibre/maplibre-gl-worker.mjs → 200, Content-Type: application/javascript; charset=UTF-8
   /maplibre/maplibre-gl-shared.mjs → 200, Content-Type: application/javascript; charset=UTF-8
   ```
   `application/javascript` je važeći JS MIME za module-import, pa worker Blob
   `import` prolazi. Header override bi bio suvišan.
5. **Watchdog mrtvog workera (§1.5):** ako 15 s posle `setStyle`
   `map.isStyleLoaded()` još nije `true` a stil nije javio grešku → stanje (b)
   sa porukom „Mapa se nije učitala do kraja (worker ne odgovara)." i dugmetom
   „Pokušaj ponovo" (postojeća `GreskaMape`). Odvojeno od postojećeg roka od
   20 s (koji hvata stil koji uopšte ne stigne). Tiho prazno platno se ne može
   ponoviti.

**Ograničenje provere:** worker fix je proveren do nivoa da se fajlovi serviraju
sa ispravnim MIME-om i da build/start rade. **Nisam mogao da se prijavim na
lokalnu mapu** (noćni run nema sesiju), pa Network-tab dokaz (zahtevi ka
`…worker.mjs`, `…shared.mjs`, `*.mvt`, `*.pbf`) ostaje za Jovana — koraci su u
odeljku „Ručna provera na produkciji".

## 2. Mapa: paleta posle popravke — **urađeno (nije viđeno u browseru)**

`slateOverride` u `leads-map-canvas.tsx`, samo tokeni (nijedna nova heks
vrednost):

- **voda** = `--bg-950` (najtamnije); **kopno** = `mix(--surface, --surface-raised, 0.5)`.
  Razlika u HSL svetlini ≈ 8,3 % (ranije `bg-950` vs `bg-900` ≈ 2 %), pa se
  Sava/Dunav vide na zoomu 12–15. Parkovi/zgrade = `--surface-raised` (najsvetliji
  blok).
- **glavni putevi** (`motorway|trunk|primary|major` u id-u sloja) =
  `mix(--line, --text-muted, 0.4)` — **opaque** (moj `mix` odbacuje alfu i vraća
  `rgb(...)`), pa se vide; sporedni ostaju na prigušenom `--line`.
- **natpisi mesta** = `--text-primary` sa halom 1.2 — čitljivi.
- **„Nova firma" heksagon** = `mix(--text-muted, --text-primary, 0.15)` (ranije
  `mix(--text-muted, --surface-raised, 0.55)` — pretamno, „skoro kao tlo"). Sada
  je svetla neutralna (plavo-siva) tačka: svetlija od kopna kao i natpisi, a ne
  liči ni na jednu temperaturu. Legenda u `leads-map.tsx` dobila isti recept.

**Nije viđeno u browseru** (ista prepreka kao §1). Vrednosti svetline su
izračunate iz heks tokena; Jovan neka pogleda na zoomu 12–15 i, ako treba,
nudge-uje tokene — sve ide kroz `mix()`, bez novih heks vrednosti.

## 3. Skill: filter grada (obavezno) — **urađeno i testirano**

- `lib/places.mjs`: `languageCode: "sr-Latn"` + `regionCode: "RS"` u Places
  telu. `uprosti` sada **transliteruje ćirilicu** (ђ/љ/њ/џ → digrafi, ostalo
  1:1 na latinicu bez dijakritika) pre brisanja, pa „Београд", „Belgrade" i
  „Beograd" daju isti ključ.
- **`lib/gradovi.mjs`** (nov): `alijasiGrada(unos)` → kanonski naziv + ugrađeni
  alijasi. „Beograd" prihvata „Belgrade" i sve **beogradske opštine** u adresi;
  opština uneta kao grad (`Zemun`…) je kanonska ali prihvata i „Beograd"; „Niš"
  prihvata „Nis"/„Nish"; ostali gradovi iz spiska. `--grad "A|B"` ostaje kao
  **dopuna** (ručni alijasi se dodaju ugrađenima).
- `otkrijKandidate` vraća `pregledano` i `primeriVanGrada`; `discover` kad
  `vanGrada` pređe **50 %** pregledanih ispiše upozorenje + **prva tri odbačena
  oblika adrese** (samo adresa, bez imena — dozvoljeno §0/6).
- Filter je izdvojen u čiste `prihvatljiviGradovi` + `uGradu` (isti kod u
  otkrivanju i u testu — ne piše se dvaput).
- `self-test`: novih **12 provera** filtera grada (6 oblika adrese: latinica,
  ćirilica, engleski egzonim, opština bez reči „Beograd", drugi grad, prazno +
  provere kanonizacije Zemun/Niš/ћirilica i nepoznatog grada).

## 4. Skill: ostalo iz prvog runa — **urađeno**

- **`ENIGMA_INGEST_URL` (EU region):** u `lib/env.mjs` (`gde`), poruci 404 u
  `lib/ingest.mjs` i `README.md` sada piše oba oblika
  (`<deployment>.convex.site` i `<deployment>.eu-west-1.convex.site`) i kako se
  nalazi pravi (Convex dashboard → Settings → URL & Deploy Key → HTTP Actions
  URL).
- **Opis niše kroz ingest:** zod (`convex/lib/generateLeadsIngest.ts`) i
  ručna kopija (`tools/.../lib/schema.mjs`) dobile opciono `upit.nisaOpis`
  (`string`, ≤ 1200). `createImportFromIngest` ga prosleđuje, čuva se na
  `leadImports.nisaOpis` (`v.optional`, OPCIONO NAMERNO), a `applyImport` ga
  pri `upsertNicheBySlug` upisuje kao `opis` + `opisAutor: "claude"` +
  `opisModel` **samo ako niša nema opis** (opis čoveka se ne prepisuje — i pri
  `insert` i pri postojećoj niši bez opisa). `send` šalje `nisaOpis` iz
  `stanje.nisa.opis` (slice 1200); napomena „ingest ga ne prenosi" zamenjena.
  `self-test` proverava polje kroz obe kopije (+ granica 1200 → `too_big`).
- **Run-id kolizija:** `discover` odbija da piše u folder u kome već postoji
  **popunjen** `firme.json` bez `--force` (poruka nudi `--force` ili
  `--run <nov-id>`). Prazan `firme.json` (posle prvog discovera) i dalje prolazi.

## 5. Aplikacija: `LEAD_OUTCOME_CODES` u browseru — **urađeno**

`LEAD_OUTCOME_CODES`, `LEAD_OUTCOME_VALIDATOR`, `LeadOutcome`, `isLeadOutcome`
preseljeni u **`convex/lib/leadOutcomes.ts`** (uvozi samo `convex/values`,
bezbedno u browseru). `leadCrmStore.ts` ih re-eksportuje (postojeći Convex uvozi
rade). `lead-quick-dialogs.tsx` sada uvozi **vrednost** `LEAD_OUTCOME_CODES` iz
`@/convex/lib/leadOutcomes`. Grep potvrđuje: svi ostali uvozi iz `@/convex/*Store`
u `components/` i `app/` su `import type` (ostaju takvi). Time nestaje 14×
„Convex functions should not be imported in the browser".

---

## Odluke koje sam doneo sam (nisu doslovno u promptu)

1. **`next.config.ts` headers nisu dodati** — `curl -I` pokazuje ispravan MIME
   (`application/javascript`), pa header nije potreban (prompt §1.4 to izričito
   dozvoljava).
2. **Watchdog je 15 s i vraća se u postojeću `GreskaMape`** (stanje (b)), a ne
   nova komponenta — poruka i „Pokušaj ponovo" već postoje. Ako mreža stvarno
   traje > 15 s a stil bi ipak stigao, poruka se pojavi ranije; 15 s je
   promptova granica, a normalan učitava za 1–3 s.
3. **Kopno = `mix(--surface, --surface-raised, 0.5)`**, ne čist token — samo
   tako voda (`--bg-950`) ima ≥ 8 % svetline ispod kopna a da se ne uvodi nova
   heks vrednost. Parkovi/zgrade su `--surface-raised` (svetliji od kopna za
   ~1,4 %; footprint zgrada nose i `--line-soft` obris).
4. **„Nova firma" = `mix(--text-muted, --text-primary, 0.15)`** — svetla
   neutralna tačka; nisam uveo poseban token jer „Nova firma" ni u tabeli nema
   boju.
5. **Glavni putevi po id-u sloja** (`motorway|trunk|primary|major`) — CARTO i
   OpenFreeMap tako imenuju klase; nisam mogao da učitam živi stil (mreža u
   sandboxu), pa je detekcija po tim substringovima moja procena. Ako neki
   glavni put ostane prigušen, dodaje se još jedan substring.
6. **Ćirilica se NE navodi kao alijas grada** — `uprosti` je transliteruje, pa
   bi bila suvišna; navedeni su samo egzonimi (Belgrade, Nis, Nish) i opštine.
7. **Run-id kolizija = odbijanje bez `--force`** (konzervativnija opcija od
   automatskog sufiksa vremena — manje magije, čovek svesno bira).
8. **`opisModel` = `"Claude (generate-leads skill)"`** (konstanta u
   `leadImportStore.ts`) — skill ne šalje ID modela, a šema traži string.

## Šta NIJE urađeno / ograničenja

- **Ništa na mapi nije viđeno u browseru** (nema lokalne prijave u noćnom runu).
  Worker fix, paleta i watchdog su pisani po tipovima, dokumentaciji (6.8) i
  `curl` proveri MIME-a — ne po pikselu. Provera je ostavljena Jovanu (dole).
- **`discover`/`send` nisu pozvani na živim servisima** (Places kvota i token su
  Jovanovi — plan §11). Filter grada je proveren `self-test`-om nad izmišljenim
  adresama, ne nad živim Places odgovorom; naziv polja odgovora (`formattedAddress`,
  `businessStatus`) je po dokumentaciji.
- **Opis niše kroz ingest nije proveren end-to-end** (nema tokena/uvoza). Zod i
  ručna kopija se slažu u `self-test`-u; put kroz `applyImport` je pisan, ne
  izvršen nad bazom.
- **`SKILL.md` je izmenjen** (napomena o opisu niše) — instalirana kopija u
  `%USERPROFILE%\.claude\skills\` mora da se **reinstalira** (`install.ps1`) da
  bi izmena stigla.

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

### A. Mapa crta (najvažnije)

1. Push (ovaj commit) → Vercel build pokreće `prebuild` → `public/maplibre/`
   se generiše na serveru. Otvori `digital.enigmait.rs/leadovi?tab=map`
   prijavljen, posle prvog uvoza sa koordinatama (GL5).
2. DevTools → **Network**, osveži. Mora da se zatraže (200):
   `/maplibre/maplibre-gl-worker.mjs`, `/maplibre/maplibre-gl-shared.mjs`,
   `*.basemaps.cartocdn.com/.../*.mvt` (pločice) i `.../fonts/.../*.pbf`
   (glifovi). Platno više **nije prazno**.
3. DevTools → Console: `map` više nije nem — nema tihog praznog platna.
4. **Watchdog:** u Network blokiraj i CARTO i OpenFreeMap **glifove/pločice**
   tako da worker ne dobije odgovor → posle 15 s crvena poruka „Mapa se nije
   učitala do kraja (worker ne odgovara)." + „Pokušaj ponovo".

### B. Paleta (zoom 12–15, Beograd)

5. Jasno se razlikuju **voda** (Sava/Dunav, najtamnije), **kopno** i **glavni
   putevi** (svetle linije, bez providnosti). Natpisi mesta su čitljivi.
6. **„Nova firma"** firme (sve tri iz prvog runa) su vidljive **svetle
   neutralne** tačke — ne stapaju se sa tlom i ne liče na temperaturu.

### C. Skill: drugi run (kad Jovan pokrene)

7. `/generate-leads Beograd frizeri 5 nema` → očekivano **≥ 5** firmi uz
   `vanGrada` **< 30 %** (ranije 168/172). Ako filter i dalje odbacuje mnogo,
   `discover` sada ispiše prva tri odbačena oblika adrese — odatle se vidi zašto.
8. Ćirilica/egzonim: `/generate-leads Niš zubar 5 svejedno` treba da radi (adrese
   „Ниш"/„Nis"/„Niš" prolaze).
9. Opština: `/generate-leads Zemun frizeri 5 nema` — kanonski „Zemun", ali
   prihvata i adrese sa „Beograd".
10. **Opis niše:** posle **Primeni**, Leadovi → Niše → niša ima opis sa
    autorstvom „Claude". Ako niša već ima ručni opis, on ostaje netaknut.
11. **Ishodi u konzoli:** na `/leadovi` više nema „Convex functions should not
    be imported in the browser" (bilo 14×).

---

## Dodati fajlovi
- `scripts/copy-maplibre-worker.mjs`
- `tools/generate-leads/lib/gradovi.mjs`
- `convex/lib/leadOutcomes.ts`
- `nocni-run/izvestaji/GL6.md`

## Izmenjeni fajlovi
- `components/app/leadovi/leads-map-canvas.tsx` (setWorkerUrl, watchdog, paleta,
  „Nova firma" boja)
- `components/app/leadovi/leads-map.tsx` (legenda „Nova firma")
- `components/app/leadovi/lead-quick-dialogs.tsx` (uvoz `LEAD_OUTCOME_CODES` iz
  lib modula)
- `convex/lib/leadOutcomes.ts` (nov), `convex/leadCrmStore.ts` (re-eksport)
- `convex/lib/generateLeadsIngest.ts` (`upit.nisaOpis`), `convex/http.ts`
  (prosleđivanje), `convex/leadImportStore.ts` (`nisaOpis` kroz core +
  `upsertNicheBySlug` opis), `convex/schema.ts` (`leadImports.nisaOpis`)
- `tools/generate-leads/lib/places.mjs` (`sr-Latn`, transliteracija, `uGradu`,
  `pregledano`/`primeriVanGrada`)
- `tools/generate-leads/run.mjs` (`alijasiGrada`, upozorenje, run-id guard,
  `nisaOpis`)
- `tools/generate-leads/lib/env.mjs`, `lib/ingest.mjs`, `lib/schema.mjs`,
  `lib/self-test.mjs`, `README.md`, `SKILL.md`
- `package.json` (`prebuild`, `postinstall`), `.gitignore` (`/public/maplibre/`)

## Poznati rizici
- **Mapa nije viđena u browseru** — najverovatnija mesta za doradu posle prvog
  gledanja: (1) tačan skup id-ova „glavnih puteva" po stilu, (2) svetlina kopna
  (ako izgleda kao svetla ploča, spustiti `mix` faktor), (3) da li `isStyleLoaded()`
  postane `true` na vreme na sporoj mreži (watchdog bi mogao da javi grešku pre
  vremena — 15 s je granica iz prompta).
- **Places filter nije proveren na živom API-ju** — transliteracija i alijasi su
  logika, ne posmatranje odgovora.
- **`npm run lint` nad celim repoom** ima zatečene greške/upozorenja (uglavnom
  `no-explicit-any` u `scripts/verify-gads-*.ts`) — nijedna nije moja. `npx
  eslint` nad mojim fajlovima = 0 grešaka; 4 zatečena upozorenja (`Doc` u
  `leadCrmStore.ts`; `LEAD_SIGNAL_KINDS`, `MatchOn`, `SuppressionCheckResult` u
  `leadImportStore.ts`) postoje i pre ovog runa i nisu dirana.
