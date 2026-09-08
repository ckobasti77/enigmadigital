# GL7 — Pinovi umesto heksagona (Google stil), klasteri, sloj efekata

Datum: 08.09.2026. · Grana: `main` · Model: Fable, effort high · Sesija: nova

Sve iz prompta je urađeno: **1 i 2 (obavezno)** u celini, **3 (obavezno bar
„snop se uklanja")** u celini (uklonjen snop + prsten/beacon prilagođeni tlu
ispod pina + kartica preleta iznad vrha pina), **4** u celini. `npm run
typecheck`, `npm run verify:purge` i `npm run build` (`Compiled successfully`)
prolaze; `npx eslint` nad svim mojim fajlovima = 0 grešaka, 0 upozorenja.

Pre-flight: pročitao sam `nocni-run/izvestaji/GL3.md`, `GL4.md`, `GL6.md`, sve
navedene fajlove (`leads-map-canvas.tsx`, `leads-map-three-layer.ts`,
`leads-map-geo.ts`, `leads-map.tsx` u celini) i `leads-map-fly.ts` (da vidim
da let ne zavisi od heksagona — ne zavisi). Pročitao sam
`.claude/skills/motion-design/SKILL.md` i `.claude/skills/threejs-materials/SKILL.md`.
CLAUDE.md traži `impeccable` skill pre UI zadatka — **nije dostupan u sesiji**;
po istom pravilu koristio sam `frontend-design` smernice i tokene iz
`globals.css`.

---

## 1. Pin umesto prizme — urađeno

- **Heksagoni uklonjeni.** `fill-extrusion` sloj `leadovi-heks`, izvor
  `leadovi-heks`, funkcije `heksagon()`, `osveziHeks` (regeneracija poligona na
  `move`), `bojaZa()`, i iz `leads-map-geo.ts` `heksPoluprecnikM`, `visinaZa`,
  `HEKS_PX`, `VISINA_MIN_M/MAX_M` — sve obrisano. „Visina = fit" više ne postoji.
- **Pin je `symbol` sloj sa slikom iz `map.addImage`.** Slika se crta u
  `<canvas>` pri `style.load` (`leads-map-pin.ts`), `pixelRatio: 2`, **ne PNG**.
  Oblik: Google kap — telo sa šiljkom dole (tangente iz šiljka na glavu = glatka
  kap), krug u glavi, tanka tamnija ivica tela. Layout:
  `icon-anchor: "bottom"`, `icon-pitch-alignment: "viewport"`,
  `icon-rotation-alignment: "viewport"` (billboard, uspravan na nagnutoj mapi),
  `icon-allow-overlap: true` + `icon-ignore-placement: true` (pin ne nestaje
  zbog suseda).
- **Boja tela = crvena `--temp-hot`** (bez novog tokena — vidi odluku 1). Sva
  četiri stanja imaju ISTI oblik; temperatura se čita iz **kruga u glavi**:
  hot = crven krug u crvenom telu („pun") sa belom (svetlom) ivicom, warm =
  ćilibar, cold = plav, nova firma = beo. Senka je zasebna slika (`pin-senka`).
- **Veličina:** `icon-size` `interpolate` po zoomu (0,85 na z10 → 1,15 na z17),
  bazna slika ~39 px prirodne visine → ~33–45 px na ekranu. Nije po fitu.
- **Izabran pin:** veći (×1,25) i u prvom planu (`symbol-sort-key`), sa
  **svetlijim krugom** — kroz posebnu sliku `pin-sel-*` (uvećanje pečeno u
  sliku, vidi odluku 2). Fit ostaje u hover kartici i panelu.
- **Legenda** (`leads-map.tsx`): četiri **pina** (mali SVG: crveno telo + krug
  boje temperature), ne četiri kvadratića; red „visina = fit skor" uklonjen.

## 2. Klasteri u istom jeziku — urađeno

`leadovi-klaster` (circle) + `leadovi-klaster-broj` (symbol): **crven krug**
(`--temp-hot`, ne meša se sa temperaturom), **bela tanka ivica**
(`circle-stroke-color = --text-primary`, širina 2), **beo broj**, **tri
veličine** poluprečnika `["step", point_count, 16, 10, 20, 50, 26]` (2–9 /
10–49 / 50+). Klik na klaster i dalje zumira (`getClusterExpansionZoom` →
`easeTo`, nepromenjeno).

## 3. three.js sloj prilagođen pinu — urađeno

- **Snop svetla za izabranu firmu UKLONJEN** (`azurirajSnop`, `geoSnop`,
  `matSnop`, `izabrana`/`izabranaIdx`, `setIzabrana`, `SNOP_*` konstante — sve
  obrisano; sloj više ne zna za izbor).
- **Prsten (hot) i beacon (sastanak) ostaju na tlu, ispod pina.** Sloj se
  UMEĆE ispod sloja pina (`map.addLayer(sloj, L_PIN)`), pa efekti stoje na tlu,
  a ne preko pina. Prsten je **tanji i manji**: geometrija `RingGeometry(0.82,
  1)` (uža traka), poluprečnik vezan za **širinu pina** (`pinSirinaM`, ≈ 0,8..1,12
  × širine glave), da ne nadjača pin. Beacon se sada diže **sa tla** (y = 0), a
  ne sa vrha (nepostojećeg) heksagona.
- **Kartica u preletu** stoji iznad vrha pina (offset `px.y - 44` umesto `-28`
  „iznad heksagona").

## 4. Ostalo — urađeno

- `mode="single"` (mini mapa u profilu): jedan pin (+ senka), bez klastera —
  ista slika pina.
- `prefers-reduced-motion`, `?three=0`, stanja (a)–(d) iz GL3 — nedirani (isti
  kod, samo heksagon → pin).
- **Slika pina se pravi ponovo posle svakog `setStyle`** (`dodajPinSlike` u
  `style.load`, pre slojeva; `hasImage` čuva od dvostrukog dodavanja) — stil
  briše slike, izvore i slojeve, svi se dodaju iznova (GL7 §4).

---

## Provera

- `npm run build` → **`Compiled successfully`**. `typecheck` i `verify:purge`
  čisti. `npx eslint` nad mojim fajlovima čist.
- **Sam pin (najrizičniji, „lepe") je viđen u browseru** — ne kroz aplikaciju
  (noćni run nema prijavu ni podatke sa koordinatama), nego kroz zaseban
  `<canvas>` koji izvršava ISTU logiku crtanja (`crtajPin`/`crtajSenku`) sa
  pravim heks vrednostima tokena, na boji mape. Snimak potvrđuje: čista Google
  kap, temperatura u krugu glave (hot crven-u-crvenom sa belim prstenom, warm
  ćilibar, cold plav, nova beo), izabrana varijanta veća sa svetlijim krugom,
  klaster crven sa belom ivicom i belim brojem u tri veličine. Slika je
  čitljiva i na stvarnoj veličini.
- **MapLibre integracija nije viđena** (sidrenje `anchor: bottom` na pitch 55,
  redosled slojeva, učitavanje slika, `setData` izbora) — pisana po tipovima i
  dokumentaciji, ne posmatrana u živoj mapi. Koraci za Jovana su dole.

### Šta Jovan gleda (pre/posle)

- **Pre (GL6):** tri sivo-plave heksagonalne prizme; visina je bila fit skor,
  boja temperatura; nisu ličile na pinove.
- **Posle (GL7):** tri **crvena pina kao na Google mapama** na istim adresama,
  uspravna na nagnutoj mapi (pitch 55). Krug u glavi nosi temperaturu; sve prizme
  su nestale. Legenda pokazuje četiri pina. Klik uvećava pin i otvara panel;
  hot firma ima tanak crven prsten na tlu ispod pina.

---

## Kriterijum gotovosti — `viewport` vs `map` poravnanje

Zadržao sam **`icon-pitch-alignment: "viewport"`** na pitch 55 (nisam prešao na
`map`/pitch 45). Obrazloženje: viewport poravnanje je billboard — tačno kako
Google crta pin: uspravan prema ekranu na svakom nagibu. Uz `icon-anchor:
"bottom"`, sidro (dno slike = šiljak) se stavlja na PROJEKTOVANU 2D tačku
koordinate, pa pin ne „lebdi": njegov šiljak JESTE projekcija tačke, a telo
raste naviše u prostoru ekrana. `map` poravnanje bi pin položilo u ravan tla
(izobličen na nagibu), što je suprotno od Google izgleda. Ako se u praksi ipak
vidi da pin deluje otkačeno od tačke, izlaz je promeniti dve `*-alignment` na
`"map"` i spustiti `PITCH` na 45 u `leads-map-canvas.tsx` — jedna reč po
svojstvu, bez druge izmene.

---

## Odluke koje sam doneo sam (nisu doslovno u promptu)

1. **Telo pina = postojeći `--temp-hot`, bez novog `--pin` tokena.** Prompt
   dozvoljava sve tri opcije; konzervativnija je (bez izmene `globals.css`,
   `#e04a3c` je već „Google-crvena" klasa). Za hot firmu krug u glavi je isti
   `--temp-hot` (pin „pun"), a razlikuje ga svetla bela ivica.
2. **Uvećanje izabranog pina (×1,25) je PEČENO u sliku (`pin-sel-*`), a
   `icon-size` ostaje samo po zoomu.** Alternativa je bila jedan `icon-size`
   izraz koji spaja zoom i podatak (`interpolate` po zoomu sa `case` po
   `izabran` u svakoj tački). Taj oblik neke verzije/stilovi odbace pri
   validaciji; pošto ne mogu da posmatram grešku, uzeo sam siguran put:
   `icon-size` je čist zoom izraz, a izbor menja `icon-image` na veću/svetliju
   sliku + `symbol-sort-key` u prvi plan.
3. **Izbor ide kroz PODATKE (`izabran`/`icon` na tački + `setData`), ne
   `feature-state`.** `icon-image`, `icon-size` i `symbol-sort-key` su layout
   svojstva koja ne primaju `feature-state`; jedini pouzdan put je nova
   `setData` pri promeni izbora (jeftino za ovaj obim; klaster izvor se ionako
   ponovo računa).
4. **Senka je zasebna slika `pin-senka`, poravnata sa TLOM**
   (`icon-pitch-alignment: map`), meka i suptilna. Prompt nudi „zasebna elipsa
   ili `icon-halo`"; `icon` nema halo (to je samo za tekst), pa elipsa. Na
   najtamnijim površinama (voda) je jedva vidljiva — to je u redu (tamna senka
   na tamnoj mapi), pin i dalje ima svoju tanku ivicu.
5. **Hover = samo kartica, bez uvećanja.** Uvećanje na hover bi tražilo
   `feature-state` u layout svojstvu (v. odluku 3). Prompt izričito dozvoljava
   „inače samo kartica".
6. **three sloj se UMEĆE ispod sloja pina** (`addLayer(sloj, L_PIN)`), ne na
   vrh kao ranije. Ranije je bio na vrhu jer je heksagon dubinski zaklanjao
   snop; snopa nema, a prsten mora ispod pina.
7. **Beacon se diže sa tla (y = 0)**, jer nema više „vrha heksagona" sa koga bi
   polazio; ostaje mala sfera ispod/oko pina koja se diže i bledi.
8. **`mix`/`parseColor` izdvojeni u `leads-map-color.ts`** (+ `withAlpha` za
   senku), da ih dele i MapLibre sloj i crtanje pina — bez dupliranja iste
   funkcije u dva fajla.
9. **Klaster ima tri veličine (16/20/26), bez ranijeg 4. koraka (200+ → 30).**
   Prompt traži baš tri veličine (2–9, 10–49, 50+).
10. **Offset kartice preleta je 44 px** (procena visine pina × icon-size na
    fokus zumu) — položaj je moj, kao i ranijih 28 px za heksagon.

---

## Dodati fajlovi

- `components/app/leadovi/leads-map-pin.ts` (crtanje slika pina + senke,
  `dodajPinSlike`, `pinIme`)
- `components/app/leadovi/leads-map-color.ts` (`mix`, `withAlpha`, preseljeno iz
  canvasa)
- `nocni-run/izvestaji/GL7.md`

## Izmenjeni fajlovi

- `components/app/leadovi/leads-map-canvas.tsx` — pin/senka/klaster slojevi
  umesto heksagona; `kolekcijaTacaka(tacke, selectedId)` sa `izabran`/`icon`;
  `osveziVidljive` (samo skup za three sloj); `dodajPinSlike` u `style.load`;
  three umetnut ispod pina; interakcija na `L_PIN`; izbor kroz `setData`;
  `mix` uvezen iz `leads-map-color`; trimovan `Tokeni`.
- `components/app/leadovi/leads-map-geo.ts` — `PIN`, `PIN_SIRINA_PX`,
  `pinSirinaM` umesto `HEKS_PX`/`heksPoluprecnikM`/`visinaZa`/`VISINA_*`.
- `components/app/leadovi/leads-map-three-layer.ts` — snop uklonjen; prsten
  tanji + vezan za širinu pina; beacon sa tla; `ThreeTacka` bez `visinaM`;
  `ThreeTokeni` bez `accent`.
- `components/app/leadovi/leads-map.tsx` — legenda: četiri pina (`PinIkonica`),
  bez reda „visina = fit".

Convex nije diran (nema nove tabele ni polja; `verify:purge` = 135 tabela, bez
promene). `convex/_generated` nije diran.

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

Posle push-a (Vercel build) i posle prvog uvoza sa koordinatama (GL5):

1. `…/leadovi?tab=map`, prijavljen. Umesto sivo-plavih prizmi stoje **tri
   crvena pina** na svojim adresama. DevTools → Network: `*.mvt`/`*.pbf` se
   učitavaju; platno nije prazno.
2. **Uspravnost:** pin stoji uspravno pri pitch-u 55; nagni/rotiraj mapu
   (desni klik + prevlačenje) — pin ostaje billboard, šiljak na adresi, ne
   izobličava se. Zumiraj unutra/napolje — pin blago raste sa zoomom, ostaje
   oštar (crtan na 2×).
3. **Temperatura iz kruga:** uporedi sa čipom u tabeli — hot = crven pin sa
   crvenim krugom i belim prstenom, warm = ćilibar krug, cold = plav, nova =
   beo. Legenda desno gore pokazuje ta četiri pina.
4. **Klik na pin** → panel desno, pin se **uveća** i dođe u prvi plan, krug mu
   posvetli; Escape/X/klik u prazno zatvara i vraća veličinu.
5. **Hot firma:** tanak crven prsten na tlu ISPOD pina koji pulsira (2,4 s);
   ne nadjačava pin. **NEMA snopa** kroz pin.
6. **Sastanak u narednih 7 dana** (zakaži kroz panel): žuti beacon se diže sa
   tla ispod pina i bledi (4 s). Otkaži → nestaje pri sledećem paketu.
7. **Klasteri:** odzumiraj dok se pinovi ne skupe → crveni krugovi sa belim
   brojem i belom ivicom, tri veličine; klik zumira dok se ne raspadnu na
   pinove.
8. **`?firma=<id>`** iz linka/profila/tabele → kamera **leti** do pina (1,4 s),
   pin je izabran (veći, u prvom planu), panel otvoren.
9. **Prelet hot firmi:** dugme „Preleti hot firme (N)" → let od pina do pina,
   kartica firme iznad vrha pina, pauza 2 s; klik/Esc/prevlačenje prekida.
10. **Mini mapa u profilu** (Firma i poreklo): jedan isti pin (+ senka), bez
    klastera; „Otvori na mapi" vodi na Mapu centriranu na tu firmu.
11. **Reduced motion** (OS „smanji pokret"): prsten i beacon se ne crtaju; pin,
    senka, klaster i izbor rade; letovi su skokovi.
12. **`?three=0`** → mapa radi identično bez prstena/beacona (izlaz za nuždu).

---

## Dorada posle prve isporuke (zahtev korisnika)

Posle prvog pregleda Jovan je tražio dve izmene — obe urađene:

1. **CELO telo pina nosi temperaturu** (ne više „telo uvek crveno, temperatura
   u krugu"). Sada: hot = crveno, warm = ćilibar, cold = plavo, nova firma =
   neutralan slate (`mix(--text-muted, --bg-950, 0.15)`, bez temperature). U
   glavi je **beli „prozor"** (krug) na svakom pinu, sa tankom tamnijom ivicom
   da se čita i na svetlom (nova) telu. Izabran = blago svetlije telo + ×1,25.
   Klaster ostaje **crven** (Google stil, ne meša se sa temperaturom — kao i
   pre). Legenda (`PinIkonica`) prati: četiri pina obojena po temperaturi.
2. **Panel (bočni „tab") svetluca u boji temperature** firme na koju je čovek
   kliknuo — ivica u tinti temperature + meki sjaj čija jačina (`--sjaj`)
   **pulsira** (GSAP `sine.inOut`, `yoyo`, `repeat: -1`, 1,15 s). Boja:
   `--temp-hot/warm/cold`, a za novu firmu `--text-muted`. Pod
   `prefers-reduced-motion` sjaj je **statičan** (bez pulsa). `--temp-hot` red i
   crveni pin se poklapaju, pa panel i pin „drže istu boju".

Vizuelno provereno istim zasebnim `<canvas>` renderom (v. Provera): pinovi po
temperaturi sa belim prozorom + četiri panela sa obojenim sjajem. Izmenjeni su
`leads-map-pin.ts` (telo po temperaturi, beli prozor), `leads-map-canvas.tsx`
(`pinBojeIz` — telo po temperaturi, nova = slate), `leads-map.tsx`
(`PinIkonica` + prosleđivanje `temperatura` panelu) i `leads-map-panel.tsx`
(svetlucanje). `typecheck`/`build`/`eslint` čisti.

## Dorada 2 — ponašanje kamere (zahtev korisnika)

Tri izmene kamere u `leads-map-canvas.tsx`:

1. **Početno iz ptičije perspektive** — `POCETNI_PITCH = 0` (odozgo), umesto
   ranijeg nagiba 55. Mapa se otvara ravno, gledana pravo nadole.
2. **Srednji klik (točkić) + vučenje = nagib** — nov handler nad canvasom:
   `mousedown` sa `button === 1` počinje, vučenje NAGORE povećava nagib
   (do `maxPitch` 68), NADOLE ga spljošti; `setPitch` direktno. `preventDefault`
   na srednji `mousedown`/`auxclick` gasi Chrome auto-scroll. Listeneri se
   uredno skidaju u cleanup-u (`odjaviPitch`). Kamera-pokreti (`fitBounds`, let
   do firme, prelet) sada **čuvaju trenutni nagib** (`map.getPitch()`), pa se
   korisnikov ugao ne poništava. Kompas u kontrolama (`visualizePitch`) i dalje
   služi kao „vrati na ptičiju" (reset nagiba na 0).
3. **Sever fiksiran na gore, bez rotacije** — `BEARING = 0`, `dragRotate: false`,
   `pitchWithRotate: false`, `map.touchZoomRotate.disableRotation()` (sada za
   OBA moda, ne samo mini-mapu). Svi kamera-pokreti drže `bearing: 0`.

`typecheck`/`build`/`eslint` čisti. Nije viđeno u živoj mapi (nema prijave);
`setPitch`/`disableRotation`/`dragRotate:false` su standardni MapLibre API.
**Provera na produkciji:** mapa se otvara ravno (odozgo); srednji klik +
vučenje gore/dole naginje/spljošti; levo dugme i dalje pomera, točkić zumira;
desni klik i dva prsta **ne rotiraju** mapu (sever ostaje na gore); klik na
kompas vraća na ptičiju perspektivu.

## Poznati rizici i šta NIJE urađeno

- **MapLibre integracija nije viđena u živoj mapi** (nema prijave/podataka u
  noćnom runu). Najverovatnija mesta za doradu posle prvog gledanja:
  (1) tačna visina/veličina pina na ekranu (`icon-size` stepenice) — lako se
  nudge-uje; (2) vidljivost senke na tamnoj podlozi (ako se ne vidi ili smeta,
  `icon-opacity`/`crtajSenku` alfa, ili se sloj `L_SENKA` ukloni); (3)
  poravnanje na pitch 55 (v. „Kriterijum gotovosti" — rezervni put je `map` +
  pitch 45). Sam OBLIK pina je proveren zasebnim renderom (v. Provera).
- **`icon-pitch-alignment: viewport` + `anchor: bottom`:** ako na velikom
  pitch-u pin ipak deluje otkačeno, promeni obe `*-alignment` na `map` i
  `PITCH` na 45. Odluka zabeležena.
- **Zasebna slika senke** dodaje jedan symbol sloj i jednu sliku; ako je na
  produkciji ružna/nevidljiva, uklanjanje je brisanje `L_SENKA` sloja i
  `PIN_SENKA_IME` iz `dodajPinSlike`.
- **`npm run lint` nad celim repoom** ima zatečene greške/upozorenja koje nisu
  moje (uglavnom `no-explicit-any` u `scripts/verify-gads-*.ts`); `npx eslint`
  nad mojim šest fajlova = 0/0.
