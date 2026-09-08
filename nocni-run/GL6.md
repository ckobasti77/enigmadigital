# GL6 — Mapa ne crta (MapLibre worker), filter grada u skillu, sitne dorade

Model: **Opus** · Effort: **high** · Mode: **acceptEdits (implementacija)** · Sesija: **nova**

Ti si u repou `enigmadigital`. Pročitaj `nocni-run/izvestaji/GL3.md`, `GL4.md`
i `GL5.md` (odluke i rizici), pa `generate-leads-plan.md` §3 i §8. Ovo su
dorade posle prvog stvarnog runa skilla na produkciji — sve niže je IZMERENO,
ne pretpostavljeno.

## 1. Mapa: MapLibre worker nikad ne odgovara (najvažnije)

**Izmereno na `digital.enigmait.rs/leadovi?tab=map`:** stil, `tiles.json` i
sprite se učitaju (atribucija piše CARTO), ali nijedna pločica ni glif se ne
zatraže, `map.isStyleLoaded()` ostaje `false`, GeoJSON izvor `leadovi-tacke`
`loaded: false`, a `map.style.dispatcher.actors[0]` ima 16 nerazrešenih
zahteva — `sendAsync` ka workeru istekne. Isto i sa `?three=0`, bez ijedne
greške u konzoli. Platno je prazno.

**Uzrok:** `maplibre-gl@6.8.0` (ESM) worker URL izvodi iz `import.meta.url`
glavnog modula: `new URL("./maplibre-gl-worker.mjs", import.meta.url)`
(funkcija `Ji` u `dist/maplibre-gl.mjs`). U Next/Turbopack bundlu
`import.meta.url` pokazuje na `/_next/static/chunks/<chunk>.js`, pa worker
traži `/_next/static/chunks/maplibre-gl-worker.mjs` koji ne postoji. Worker
se pravi kroz Blob sa `import "<taj url>"`, pa 404 ostaje tih.

**Popravka (radi je ovako, ne drugačije):**
1. Skripta `scripts/copy-maplibre-worker.mjs` koja kopira
   `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` i
   `node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs` (worker ga uvozi
   relativno, `from "./maplibre-gl-shared.mjs"`) u `public/maplibre/`. Ne
   kopiraj `-dev` varijante. Skripta pada ako fajl ne postoji.
2. `package.json`: `"prebuild": "node scripts/copy-maplibre-worker.mjs"` i
   `"postinstall"` isto (da `next dev` posle `npm install` ima fajlove).
   `public/maplibre/` u `.gitignore` — generisan je, verzija prati
   `package-lock`. Proveri da Vercel build (`npm run build`) pokreće `prebuild`
   (npm ga pokreće automatski; potvrdi u `npm run build` lokalno).
3. U `components/app/leadovi/leads-map-canvas.tsx`, pre `new MapLibreMap(...)`:
   `setWorkerUrl("/maplibre/maplibre-gl-worker.mjs")` (izvoz iz
   `maplibre-gl`, `declare function setWorkerUrl(value: string): void` u
   `dist/maplibre-gl.d.ts`). Jednom po modulu, ne po instanci.
4. `next.config.ts`: `headers()` za `/maplibre/:path*` sa
   `Content-Type: text/javascript` ako Next ne servira `.mjs` ispravno
   (proveri `curl -I` na dev serveru pre nego što dodaš — ne dodaj ako nije
   potrebno).
5. Dodaj u `leads-map-canvas.tsx` detekciju mrtvog workera: ako posle 15 s od
   `setStyle` `map.isStyleLoaded()` još nije `true` a stil nije javio grešku,
   stanje (b) sa porukom „Mapa se nije učitala do kraja (worker ne odgovara)"
   i dugmetom „Pokušaj ponovo". Tiho prazno platno se ne sme ponoviti.

**Provera:** `npm run build` pa `npm run start`, otvori `/leadovi?tab=map`
prijavljen (ili `npm run dev`), i potvrdi u Network tabu da se traže
`/maplibre/maplibre-gl-worker.mjs`, `maplibre-gl-shared.mjs`,
`tiles-*.basemaps.cartocdn.com/.../*.mvt` i `.../fonts/.../*.pbf`. Ako ne
možeš da se prijaviš lokalno, napiši tačno to u izveštaj i ostavi Jovanu
korake za proveru na produkciji.

## 2. Mapa: paleta posle popravke

Tek kad worker radi vidi se paleta. Slate override (GL3) stavlja pozadinu na
`--bg-950` (#070d19), kopno `--bg-900` (#0b1221), parkove `--bg-800`, vodu
`--bg-950`, puteve na `--line` (28 % alfa). Razlika između kopna i vode je
~4 jedinice po kanalu — na većini ekrana nevidljivo. Podesi override tako da
je na zoomu 12–15 jasno šta je voda (Sava/Dunav), šta kopno, gde su glavni
putevi: voda ≥ 8 % svetline tamnija od kopna, glavni putevi bez alfe
(`mix(--line, --text-muted, 0.4)` ili slično kroz postojeći `mix`), natpisi
mesta čitljivi. Tokeni ostaju izvor — ne uvodi nove hex vrednosti.

Boja „Nova firma" heksagona je `mix(--text-muted, --surface-raised, 0.55)` —
skoro ista kao tlo. Sve tri firme iz prvog runa su „Nova firma" i ne vide
se. Nova firma mora da bude vidljiva tačka (svetlija od kopna bar koliko i
natpisi), a da i dalje ne liči ni na jednu temperaturu.

## 3. Skill: filter grada odbacio 168 od 172 kandidata

**Izmereno** u `tools/generate-leads/out/2026-09-08-beograd-frizerski-saloni/run.json`:
`places.kandidata: 4, vanGrada: 168, iscrpljeno: true`. Filter u
`lib/places.mjs` (:155) traži `uprosti(formattedAddress)` da sadrži grad, a
`uprosti` briše sve što nije `a-z0-9` — pa ćirilično „Београд" i englesko
„Belgrade" (Places bez `languageCode` vraća jedno od ta dva) nikad ne prođu.
Posledica: „grad iscrpljen" je bio lažan, a Places kvota potrošena na 15
poziva za 4 kandidata.

Popravka:
- U Places telo dodaj `languageCode: "sr-Latn"` i `regionCode: "RS"`.
- `uprosti` transliteruje ćirilicu (ћ→c, ђ→dj, љ→lj, њ→nj, џ→dz, ostalo 1:1)
  pre brisanja.
- `lib/nise.mjs` ili nov `lib/gradovi.mjs`: ugrađeni alijasi za gradove
  (Beograd: belgrade, београд; Novi Sad: нови сад; Niš: nis, ниш; Kragujevac;
  Subotica; Zrenjanin; Pančevo; Čačak; Kraljevo; Novi Pazar) + beogradske
  opštine kao pripadajuće Beogradu (Zemun, Novi Beograd, Zvezdara, Vračar,
  Voždovac, Palilula, Čukarica, Rakovica, Stari Grad, Savski venac, Grocka,
  Surčin, Obrenovac, Lazarevac, Mladenovac, Sopot, Barajevo). `--grad "A|B"`
  ostaje kao dopuna.
- Kad `vanGrada` pređe 50 % pregledanih, `discover` ispiše upozorenje sa
  prva tri odbačena `formattedAddress` oblika (adresa firme, bez imena) da
  čovek vidi zašto — to bi nam danas uštedelo sat.
- `self-test`: 6 adresa (latinica, ćirilica, engleski, opština bez reči
  Beograd, drugi grad, prazno) kroz filter.

## 4. Skill: ostalo iz prvog runa
- `ENIGMA_INGEST_URL` u `README.md`, `lib/env.mjs` i poruci 404 u
  `lib/ingest.mjs`: Convex deployment u EU regionu ima host
  `<deployment>.eu-west-1.convex.site` — bez regiona vraća 404. Napiši oba
  oblika i kako se nalazi pravi (Convex dashboard → Settings → URL & Deploy
  Key → HTTP Actions URL).
- Opis niše kroz ingest: dodaj u zod šemu (`convex/lib/generateLeadsIngest.ts`)
  opciono `nisaOpis: string` (≤ 1200 znakova) u `upit`; `createImportFromIngest`
  ga prosleđuje, a `applyImport` pri upsertu niše upisuje `opis` +
  `opisAutor: "claude"` + `opisModel` SAMO ako niša nema opis (postojeći
  opis čoveka se ne prepisuje). `lib/schema.mjs` i `send` šalju ga iz
  `nisa-opis.txt`. Napomena „ingest ga ne prenosi" nestaje.
- `discover` pokrenut dva puta istog dana u isti `out/<run-id>/` je
  prepisao `run.json` i `kandidati.json` preko runa koji je imao gotov
  `firme.json`. Run-id dobija sufiks vremena (`-1216`) ili `discover` odbija
  da piše u folder u kome već postoji `firme.json` bez `--force`.

## 5. Aplikacija: `LEAD_OUTCOME_CODES` u browseru
Konzola na produkciji: 14× „Convex functions should not be imported in the
browser" — `components/app/leadovi/lead-quick-dialogs.tsx:9` uvozi
`LEAD_OUTCOME_CODES` (vrednost, ne tip) iz `@/convex/leadCrmStore`, što vuče
ceo modul u bundle. Premesti `LEAD_OUTCOME_CODES` (i `LEAD_OUTCOME_VALIDATOR`
ako je uz njega) u `convex/lib/leadOutcomes.ts`, uvozi ga odatle u
`leadCrmStore.ts` i u komponenti. Svi ostali uvozi iz `@/convex/*Store` u
`components/` i `app/` su `import type` — proveri grep-om da tako i ostane.

## Kriterijum gotovosti
1 obavezno (bez njega mapa ne postoji). 3 obavezno (bez njega skill laže
„iscrpljen"). 2, 4, 5 poželjno; što ne stigneš — u izveštaj sa razlogom.
Izveštaj ima odeljak „kako se proverava na produkciji" za mapu i za skill
(drugi run: `/generate-leads Beograd frizeri 5 nema` treba da nađe ≥ 5 uz
`vanGrada` < 30 %).
