# GL4 — three.js sloj na mapi + GSAP letovi kamere

Datum: 08.09.2026. · Grana: `main` · Model: Fable, effort max · Sesija: ista kao GL3

Tačke 1–4 su urađene u celini, tačka 5 delimično (instanciranje, bez
merenja — vidi §5). `npm run typecheck`, `npm run verify:purge` i
`npm run build` prolaze; `npx eslint` nad svim mojim fajlovima je čist.

Pre-flight: `git log -3` → `112771e … [GL3]` na vrhu. Sesija JE nastavak GL3
(`leads-map.tsx`, `leads-map-canvas.tsx` i `leads-map-panel.tsx` su moji iz
prethodnog koraka), pa nije bilo potrebe za ponovnim čitanjem izveštaja.
Pročitao sam plan §9 i §2 O9, `leadAssignments.meetingAt` u šemi (već je bio
na tački kao `sastanakAt` iz GL3) i osam navedenih skillova (`threejs-*` ×5,
`gsap-core`, `gsap-timeline`, `gsap-performance`; `motion-design` iz GL3).
Nijedan od tih skillova nema `references/` folder u repou. Isključene skillove
nisam čitao.

**Sloj je montiran PO DEFAULTU**, ne iza `?three=1`. Nisam mogao da posmatram
deljenje konteksta (nema browsera u noćnom runu), ali sloj prati MapLibre-ov
zvanični obrazac „Add a 3D model using three.js" (isti renderer nad
`map.getCanvas()` + `context: gl`, `autoClear = false`, `resetState()` pre
render-a, kamera iz `defaultProjectionData.mainMatrix`) bez odstupanja —
nema razloga da se pretpostavi nestabilnost. Za nuždu postoji **`?three=0`**
(gasi sloj bez deploya); vidi odluku 1.

---

## 1. Zavisnost

`npm install three @types/three` → `three@0.185.1`, `@types/three@0.185.4`
(`three` ne nosi sopstvene tipove, pa je `@types/three` bio nužan — tsc bez
njega ne zna ni `import * as THREE`). GSAP je `^3.15.0`, koristi se samo
`gsap.to` iz jezgra — nijedan plugin, ništa što traži registraciju.

## 2. Custom layer (§9) — `components/app/leadovi/leads-map-three-layer.ts`

Klasa `LeadsThreeLayer implements CustomLayerInterface` (`type: "custom"`,
`renderingMode: "3d"` — deli dubinski bafer sa `fill-extrusion` heksagonima,
pa heksagon zaklanja donji deo snopa koji prolazi kroz njega).

- **`onAdd(map, gl)`**: `new THREE.WebGLRenderer({ canvas: map.getCanvas(),
  context: gl })`, `autoClear = false`; `setSize` se NIKAD ne zove (menjao
  bi dimenzije canvasa mape). Viewport se u svakom `render` uzima iz
  `gl.drawingBufferWidth/Height`, jer mapa sama menja veličinu canvasa a
  three to bez `setSize` ne prati.
- **`render(gl, opt)`**: `camera.projectionMatrix = mainMatrix ·
  modelMatrix`, gde je `modelMatrix = T(ishodište) · S(s, −s, s) · Rx(90°)`
  (`s` = metar u mercator jedinicama na širini ishodišta,
  `MercatorCoordinate.meterInMercatorCoordinateUnits`). Scena je u METRIMA
  oko centroida tačaka, Y nagore; položaj svake tačke se računa iz njenih
  sopstvenih mercator koordinata, pa je tačan i daleko od ishodišta (greška
  skale kod firme 200 km dalje utiče samo na visinu efekta, ne na položaj).
  Posle `renderer.resetState()` + `render` se traži `map.triggerRepaint()`
  SAMO dok nešto stvarno pulsira (i nikad pod reduced-motion).
- **`onRemove`**: dispose instanci, tri geometrije, tri materijala i
  renderer-a (`renderer.dispose()`, NE `forceContextLoss` — kontekst je
  mapin).

Elementi (svaki nosi informaciju, ili ga nema):

| Element | Kad | Geometrija | Animacija |
| --- | --- | --- | --- |
| prsten na tlu | `temperatura === "hot"` | `InstancedMesh` od jednog `RingGeometry(0,72, 1, 40)` u ravni tla, 0,6 m iznad | skala 1 → 1,6 × (1,15 poluprečnika heksagona), alfa 0,6 → 0 (kvadratno), petlja 2,4 s, **nasumična faza po firmi** |
| snop | izabrana firma (panel) | otvoren `CylinderGeometry`, visina = **2 × visina heksagona**, poluprečnik 0,38 × heksagona | statičan + sporo „disanje" opacity 0,36 ± 0,1 na 3 s |
| beacon | `sastanakAt` u narednih 7 dana i u budućnosti | `InstancedMesh` od `SphereGeometry(1, 12, 8)` | diže se sa vrha heksagona za 3 poluprečnika, bledi, petlja 4 s, nasumična faza |

Boje: `--temp-hot` (prsten), `--accent-400` (snop), `--warning` (beacon —
ista boja kojom tabela boji „sastanak uskoro"). Sve pročitano iz CSS-a pri
montiranju kroz `citajTokene()` iz GL3 (dodat `warning`), ništa nije
upisano heks vrednošću (rezervne `0x…` u `cssBoja` se koriste samo ako
`THREE.Color` ne ume da parsira CSS string — što se sa tokenima iz
`globals.css` ne dešava).

Aditivno mešanje, `depthWrite: false`, `MeshBasicMaterial` (nema svetla —
efekti su sjaj, ne osvetljeni objekti). Alfa po instanci nema u three-u, pa
se kodira JAČINOM boje instance: sa aditivnim mešanjem crno ne dodaje
ništa. Snop bledi ka vrhu kroz vertex boje (1 dole → 0 gore) — bez teksture
i bez šejdera.

**Podaci**: iz iste `listLeadsForMap` liste (`sastanakAt` je GL3 već
stavio na tačku, pa upit nije diran). `threeTacke()` u canvasu pretvara
`MapPoint[]` u `{ companyId, lng, lat, visinaM, hot, sastanakUskoro }`.
Promena liste → `setData` → stare instance se uklanjaju i dispose-uju, nove
se prave; geometrije i materijali ostaju isti primerci. Sloj crta samo tačke
koje TRENUTNO nisu u klasteru — isti skup koji GL3 crta kao heksagone
(`setVidljive` iz `osveziHeks`); prsten pod klasterom bi bio šum.

Sloj se pravi u `style.load` posle heksagona (iznad njih u redosledu
slojeva), uklanja se pre svakog `setStyle` (fallback izvora) i pre
`map.remove()` — `removeLayer` → `onRemove`.

## 3. GSAP letovi (§9) — `components/app/leadovi/leads-map-fly.ts`

- **`letiDoTacke(map, cilj, { reducedMotion })`**: `gsap.to` nad jednim
  napretkom `t`, 1,4 s, `power3.inOut`; na svakom `onUpdate` `map.jumpTo`
  sa linearnom interpolacijom lng/lat/pitch, najkraćim putem po azimutu i
  zoomom koji u sredini leta „padne" do 3 nivoa zavisno od udaljenosti u
  pikselima (300 px → 0, 2400 px → 3) — dug let izgleda kao let, ne kao
  klizanje. Poslednji kadar upisuje tačan cilj. **`dragstart` → `kill()`**
  (i spoljni `kill`). Vraća `{ kill, gotov: Promise<"stigao" | "prekinut"> }`.
  Pod `prefers-reduced-motion` → `jumpTo` odmah.
- U canvasu je JEDAN ulaz `letiDo()` koji ubija prethodni let pre novog, a
  `fitBounds`/`easeTo` iz GL3 ubijaju aktivan let pre nego što krenu — dve
  animacije se nikad ne otimaju za kameru.
- **Izbor firme koji NIJE klik na mapu** (URL `?firma=`, profil „Otvori na
  mapi", tabela „Prikaži na mapi") sada leti umesto GL3 `easeTo`. Klik na
  heksagon i dalje ne pomera kameru (GL3 pravilo).
- **„Prikaži na mapi" u `lead-row-actions.tsx`** (meni ⋯ u redu tabele):
  link na `/leadovi?tab=map&firma=<id>`. Firma bez koordinata dobija
  onemogućenu stavku „Nema koordinata za mapu" — nula nije dugme.
- **„Preleti hot firme"** — dugme desno u redu ispod trake filtera
  (`leads-map.tsx`): ide po hot firmama u preseku **po fitu opadajuće, pa po
  nazivu**, let do svake (isti `letiDo`), pa kartica te firme iznad
  heksagona (isti `HoverKartica` iz GL3), pauza 2 s, sledeća. Zaustavlja se
  na klik BILO GDE (`pointerdown` sa `capture` na dokumentu), Esc,
  prevlačenje mape, dugme „Zaustavi prelet", promenu jezička. Bez hot firmi
  u preseku dugme je `disabled` sa `title="nema hot firmi u ovom preseku"`,
  a i dok stil nije učitan. Dok prelet traje, hover sa miša ne prepisuje
  karticu obilaska.

## 4. Isključivanje i čišćenje (§9)

- **`prefers-reduced-motion`**: letovi su skokovi (`jumpTo`), prsten i
  beacon se ne crtaju, snop ostaje statičan (bez disanja). Promena
  podešavanja usred sesije se prenosi na sloj (`matchMedia` `change` →
  `setReducedMotion`) bez ponovnog učitavanja.
- **Bez WebGL2**: `map.getCanvas().getContext("webgl2")` — na canvasu koji
  već ima webgl2 kontekst vraća taj isti; `null` znači da mapa radi na nečem
  drugom → sloj se ne montira, jedna `console.info` poruka bez ličnih
  podataka. (MapLibre 6 sam traži WebGL2, pa je ovo dvostruko dno.)
- **Čišćenje**: `ukloniThree()` pre `map.remove()` i pre svakog `setStyle`;
  `onRemove` dispose-uje sve; `letRef.current?.kill()` i `matchMedia`
  listener u cleanupu efekta. Prelazak Mapa → Tabela → Mapa pravi novu mapu
  i nov sloj svaki put, stari su oslobođeni — **broj WebGL konteksta u
  devtools treba da ostane 1** (korak 14 u proveri).

## 5. Perf

Nema skripte — three.js bez browsera nema smisla. U kodu: geometrije i
materijali se prave JEDNOM u konstruktoru; prstenovi i beaconi su
`InstancedMesh` (jedan draw call svaki); po kadru nema ni jedne alokacije
(`dummy: Object3D`, `boja: Color`, dve `Matrix4` se ponovo koriste; indeks
izabrane firme se računa pri promeni, ne `findIndex` po kadru). Repaint se
traži samo dok je bar jedan prsten/beacon vidljiv ili snop diše.

**Kako Jovan meri** (cilj ≤ 4 ms po kadru za three sloj):

1. Chrome → `digital.enigmait.rs/leadovi?tab=map` sa svim tačkama (bez
   filtera), zumiraj tako da se vide heksagoni, bar jedna hot firma.
2. DevTools → **Performance** → ⚙ „CPU: 4× slowdown" (simulira integrisanu
   grafiku) → Record → 10 s bez pomeranja miša → Stop.
3. U „Main" traci: kadrovi su `requestAnimationFrame` → `Map._render`.
   Klikni jedan → Bottom-Up → filtriraj `leads-map-three-layer` (ili
   `LeadsThreeLayer.render`). Self time tog poziva = trošak sloja. Ponovi na
   tri kadra, uzmi najveći.
4. Za GPU: „GPU" traka u istom snimku; three sloj su 1–3 draw call-a posle
   MapLibre-ovih.
5. Za merenje bez sloja: isti test sa `?three=0` — razlika u prosečnom FPS
   je cena sloja.

## 6. Ne diraj — šta JESAM dirao u GL3 fajlovima

- `leads-map-canvas.tsx`: montiranje/demontiranje sloja, prosleđivanje
  izabrane firme i vidljivog skupa, let umesto `easeTo` u ne-klik granama,
  prelet, `warning` token, i tri geometrijska pomoćnika premeštena u
  `leads-map-geo.ts` (da ih three sloj deli — prsten mora da obuhvata BAŠ
  heksagon koji čovek vidi). Klasteri, hover, klik, fallback stila i sva
  četiri stanja rade kao u GL3.
- `leads-map.tsx`: samo dugme preleta + dva propa ka canvasu.
- `lead-row-actions.tsx`: samo nova stavka menija.

## 7. Skill vs plan — gde je plan pobedio

- `threejs-fundamentals` traži sopstveni `requestAnimationFrame` loop,
  `renderer.setSize` i `setPixelRatio`. Plan traži deljen kontekst i kameru
  iz MapLibre-a → nema sopstvene petlje (crta se kad mapa crta,
  `triggerRepaint` traži sledeći kadar), nema `setSize` (menjao bi mapin
  canvas), nema `setPixelRatio` (viewport iz bafera).
- `threejs-materials` preporučuje `MeshStandardMaterial` za „realistične"
  površine. Efekti su sjaj bez svetla, pa `MeshBasicMaterial` + aditivno —
  jeftinije i tačnije za ovu namenu.
- `gsap-core` preporučuje `gsap.matchMedia()` za reduced-motion. Let ne
  animira DOM i ne treba mu revert konteksta, pa se `window.matchMedia`
  čita direktno; ponašanje je isto (skok umesto leta). `gsap-timeline`
  („koristi timeline umesto delay-a"): prelet nije timeline nego async
  petlja sa otkazivom pauzom, jer se pauza prekida klikom/Esc-om/drag-om i
  prepliće sa događajima mape — timeline bi to samo zakomplikovao.
- `motion-design` tabela stavlja 1,4 s u „dramatic reveal"; plan izričito
  traži 1,4 s za let → plan.

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

Dok skill (GL5) nije puštan, mapa je u stanju (c) i **ništa iz GL4 se ne
vidi** — sloj se montira tek kad ima tačaka. Do tada se može proveriti samo:

1. Leadovi → tabela → ⋯ u bilo kom redu → stavka **„Nema koordinata za
   mapu"** je siva i ne radi ništa (firma bez koordinata).

Posle prvog uvoza sa koordinatama:

2. Mapa → zumiraj do heksagona. **Hot firma** (crven heksagon) ima crven
   prsten na tlu koji se širi i bledi na 2,4 s; dve hot firme jedna do
   druge NE pulsiraju uglas.
3. Firma sa **sastankom u narednih 7 dana** (zakaži jedan kroz panel ili
   tabelu) ima žutu tačkicu koja se diže sa vrha heksagona i bledi svakih
   4 s. Otkaži sastanak → nestaje pri sledećem paketu podataka.
4. Klikni heksagon → panel desno + **plav snop** iz heksagona, dvostruko
   viši od njega, koji lagano diše. Zatvori panel → snop nestaje.
5. Odzumiraj dok se tačke ne skupe u klaster → prstenovi/beaconi tih tačaka
   NESTAJU (crtaju se samo tačke koje nisu u klasteru).
6. Tabela → ⋯ → **„Prikaži na mapi"** → otvara Mapu i kamera LETI do firme
   (1,4 s, zoom se u sredini leta malo spusti pa vrati) i otvara panel.
   Tokom leta povuci mapu → let staje odmah.
7. Profil firme sa koordinatama → **„Otvori na mapi"** → isto kao 6.
8. Mapa → dugme **„Preleti hot firme (N)"** desno ispod trake filtera.
   Klik → kamera leti do prve hot firme, kartica firme se pojavljuje
   iznad heksagona, 2 s pauza, let do sledeće… Dugme za to vreme piše
   „Zaustavi prelet".
9. Tokom preleta: klik bilo gde na stranici → prelet staje, kartica
   nestaje. Ponovi sa Esc. Ponovi sa prevlačenjem mape. Klik na „Zaustavi
   prelet" → staje i NE kreće nov prelet.
10. Filtriraj presek bez hot firmi (npr. temperatura „cold") → dugme je
    sivo; pređi mišem → tooltip „nema hot firmi u ovom preseku".
11. **Reduced motion** (OS podešavanje „smanji pokret"): prstenovi i
    beaconi nestaju, snop ostaje statičan, „Prikaži na mapi" SKAČE na firmu
    umesto da leti, prelet skače od firme do firme sa pauzama.
12. Otvori `…/leadovi?tab=map&three=0` → mapa radi identično, bez
    prstenova/snopa/beacona (izlaz za nuždu).
13. DevTools → Console: nema grešaka three-a ni MapLibre-a pri učitavanju,
    zumiranju, otvaranju panela. Ako WebGL2 nije dostupan (ne bi trebalo),
    jedina poruka je `[leads-map] three.js sloj preskočen…`.
14. **Curenje konteksta**: DevTools → Console → ukucaj
    `document.querySelectorAll("canvas").length` → 1. Prebaci Tabela →
    Mapa → Tabela → Mapa (dva puta), ponovi → i dalje 1, bez upozorenja
    „Too many active WebGL contexts" u konzoli.
15. Perf po §5 gore.

---

## Odluke koje sam doneo sam (nisu iz prompta ni iz plana)

1. **Sloj je montiran po defaultu, sa `?three=0` kao izlazom** — a ne iza
   `?three=1`. Prompt vezuje sakrivanje za slučaj „ne može stabilno da deli
   kontekst"; to nisam mogao da posmatram, ali obrazac je doslovno
   MapLibre-ov zvanični. Ako se u praksi vidi crn ekran ili treperenje,
   Jovan ga gasi parametrom odmah, a ja u sledećoj rundi obrćem podrazumevano.
2. **Efekti samo za tačke van klastera**, sinhrono sa heksagonima GL3
   (`setVidljive`). Plan to ne kaže; prsten ispod klaster-kruga ne nosi
   informaciju koju čovek može da pročita.
3. **Alfa po instanci kodirana jačinom boje** (aditivno mešanje: crno =
   ništa) umesto custom šejdera — `threejs-shaders` je van opsega, a ovo je
   jeftinije od `InstancedBufferGeometry` sa sopstvenim atributom.
4. **Snop diše** (opacity ± 0,1 na 3 s) kad pokret nije smanjen; plan kaže
   samo „vertikalni snop svetla". Ambijentni sloj po motion-design skillu;
   ne nosi informaciju, ali ni ne laže. Pod reduced-motion je statičan, kako
   prompt traži.
5. **Prelet ide po fitu opadajuće, pa po nazivu.** Plan kaže „redom" bez
   redosleda; najizglednije prvo je jedini redosled koji nešto znači.
6. **Kartica u preletu stoji iznad vrha heksagona** (28 px iznad projekcije
   tačke) — položaj je moj.
7. **Klik na dugme „Zaustavi prelet" je izuzet iz `pointerdown` listenera**
   (`data-tura-stop`) — inače bi listener ugasio prelet PRE klika, React bi
   dugme prekrojio u „Preleti", i isti klik bi pokrenuo nov prelet.
   Otkriveno u samopregledu, ne u browseru.
8. **Zoom „pad" u sredini leta** (do 3 nivoa po udaljenosti) — plan kaže
   samo „gsap.to nad {center, zoom, pitch, bearing}"; bez pada je dug let
   ravno klizanje.
9. **Sloj ne postoji u `mode="single"`** (mini mapa u profilu). Profil već
   piše temperaturu i sastanak; pulsiranje na profilu bi bilo ukras.
10. **Dugme preleta je onemogućeno i dok stil nije učitan** — let nad
    mapom koja se još učitava nema šta da pokaže.
11. **`three` i `@types/three`** — prompt dozvoljava `@types/three` „ako tsc
    traži"; tražio je (paket nema tipove).

## Poznati rizici i šta NIJE urađeno

- **Ništa nije viđeno u browseru.** Deljenje GL konteksta, redosled
  crtanja, dubinski test snopa kroz heksagon, boje po tokenima i 60 fps su
  pisani po MapLibre/three tipovima i zvaničnom primeru. Najverovatnija
  mesta za doradu posle prvog gledanja: (1) `PRSTEN_VISINA_M` 0,6 m — ako
  prsten treperi sa tlom (z-fighting), podići na 1–2 m; (2) veličina
  beacona (`BEACON_POLUPRECNIK` 0,32 × heksagona); (3) intenzitet snopa.
- **Perf nije izmeren** (§5). Očekivano ≪ 4 ms: tri draw call-a, ≤ N
  instanci, bez alokacija.
- **Kontinuirani repaint dok nešto pulsira**: dok je bar jedna hot firma ili
  beacon vidljiva, mapa se crta ~60×/s (to je cena svake animacije u custom
  sloju). Pod reduced-motion i kad su svi u klasteru — ne. Ako to greje
  laptop, sledeći korak je `triggerRepaint` na 30 fps (svaki drugi kadar).
- **`style.load` bez `onRemove` pri `map.remove()`**: MapLibre ne garantuje
  `onRemove` kad se cela mapa ruši, zato se sloj uklanja ručno pre toga.
  Ako `removeLayer` baci (stil već srušen), resursi umiru sa kontekstom —
  bez curenja između montiranja, ali to je pretpostavka, ne merenje.
- **`getContext("webgl2")` provera** je dvostruko dno: MapLibre 6 ne radi
  bez WebGL2, pa se grana „preskočen" u praksi ne dešava.
- **`npm run lint` nad celim repoom: 1287 grešaka i 21396 upozorenja** —
  identično GL2 i GL3, nijedna nova, nijedna u mojim fajlovima.

## Dodati fajlovi

- `components/app/leadovi/leads-map-three-layer.ts`
- `components/app/leadovi/leads-map-fly.ts`
- `components/app/leadovi/leads-map-geo.ts`
- `nocni-run/izvestaji/GL4.md`

## Izmenjeni fajlovi

- `components/app/leadovi/leads-map-canvas.tsx` (sloj, let, prelet,
  `warning` token, geometrija iz `leads-map-geo.ts`)
- `components/app/leadovi/leads-map.tsx` (dugme „Preleti hot firme", propovi)
- `components/app/leadovi/lead-row-actions.tsx` („Prikaži na mapi")
- `package.json`, `package-lock.json` (`three`, `@types/three`)

Convex nije diran (`sastanakAt` je na tački od GL3).
