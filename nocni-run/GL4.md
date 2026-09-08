# GL4 — three.js sloj na mapi + GSAP letovi kamere

Model: **Fable** · Effort: **max** · Mode: **acceptEdits (implementacija)** · Sesija: **ISTA kao GL3** (`--continue`)

Nastavljaš u sesiji u kojoj si upravo napravio mapu (GL3). Ako ova sesija
nema kontekst GL3 (ne sećaš se `leads-map.tsx` koji si napisao), pročitaj
`nocni-run/izvestaji/GL3.md` i `components/app/leadovi/leads-map.tsx` celo
pre ičega. Ako GL3 nije komitovan na `main` (`git log -3` bez `[GL3]`) →
`NEUSPEH GL4: GL3 nije na main`.

Pročitaj `generate-leads-plan.md` **§9** i **§2 O9**. Pročitaj
`convex/schema.ts` polja `leadAssignments.meetingAt` (za beacon sastanaka).

U `.claude/skills/` postoje skillovi za three.js i GSAP. PRE koda pročitaj
ove SKILL.md fajlove (celo, uključujući `references/` ako postoje):
`threejs-fundamentals`, `threejs-geometry` (InstancedMesh), `threejs-materials`
(additive blending, transparentnost), `threejs-animation`,
`threejs-interaction`, `gsap-core` (matchMedia + prefers-reduced-motion),
`gsap-timeline`, `gsap-performance`, `motion-design`. Ne čitaj
`threejs-shaders`, `threejs-postprocessing`, `threejs-loaders`,
`gsap-scrolltrigger`, `gsap-plugins` — nisu za ovaj zadatak. Ako skill i
plan kažu različito, plan pobeđuje; zapiši razliku u izveštaj.

Ovo je sloj ukusa preko tačne mape. Pravilo: svaki efekat nosi informaciju
(hot, izabrano, sastanak uskoro) ili ga nema. Ništa ne sme da uspori native
mapu ni da promeni njeno ponašanje.

## Uradi, ovim redom

### 1. Zavisnost
`npm install three` (i `@types/three` ako tsc traži). GSAP već postoji —
proveri verziju u `package.json` i koristi `gsap.to`, ne plugine koji traže
registraciju/licencu.

### 2. Custom layer (§9)
`components/app/leadovi/leads-map-three-layer.ts`: implementira MapLibre
`CustomLayerInterface` (`onAdd`, `render`, `onRemove`), deli WebGL kontekst
mape (`renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(),
context: gl })`, `autoClear = false`, `resetState()` posle render-a). Kamera
iz `matrix` argumenta. Pozicioniranje preko `maplibregl.MercatorCoordinate`.

Elementi:
- hot firme: prsten na tlu koji pulsira (skala 1→1,6, opacity 0,6→0) na 2,4 s
  petlji; pulsevi razmaknuti nasumičnom fazom da ne trepću uglas,
- izabrana firma: vertikalni snop (tanak cilindar, additive blending) visine
  ≈ 2× heksagona,
- sastanak u narednih 7 dana: spor „beacon" (mala sfera koja se diže i
  bledi svakih 4 s).
Podaci dolaze iz iste `listLeadsForMap` liste (dodaj `meetingAt` u nju ako
fali). Sloj se osvežava kad se lista promeni (dispose starih meshova).

### 3. GSAP letovi (§9)
- `flyToLead(id)`: `gsap.to` nad `{lng, lat, zoom, pitch, bearing}` uz
  `map.jumpTo` na svakom `onUpdate`; 1,4 s, `power3.inOut`; prekida se ako
  korisnik povuče mapu (listener na `dragstart` → `kill()`).
- Izbor firme iz panela / iz tabele („Prikaži na mapi" akcija u
  `lead-row-actions` — dodaj je, vodi na `?tab=map&firma=<id>`) → let.
- „Preleti hot firme": dugme iznad mape, ide redom po hot firmama u preseku
  sa pauzom 2 s, otvara karticu svake, zaustavlja se na klik bilo gde ili na
  Esc. Ako nema hot firmi u preseku → dugme onemogućeno sa tooltipom
  „nema hot firmi u ovom preseku" (nula nije dugme).

### 4. Isključivanje i čišćenje (§9)
- `prefers-reduced-motion`: bez letova (jumpTo odmah), bez pulsa, bez
  beacona; snop izabrane firme ostaje (statičan).
- Bez WebGL2 (`canvas.getContext("webgl2")` null) → sloj se ne dodaje;
  konzola dobija JEDNU `console.info` poruku bez ličnih podataka.
- `onRemove`: dispose svih geometrija, materijala, renderer-a. Proveri da
  prelazak tab Mapa → Tabela → Mapa dva puta ne curi (broj WebGL konteksta u
  devtools ostaje 1).

### 5. Perf
Napravi `scripts/leads-map-three-check.ts`? Ne — three.js bez browsera nema
smisla. Umesto toga u izveštaj napiši kako Jovan meri: Chrome devtools →
Performance → 10 s snimanja nad mapom sa svim tačkama; cilj ≤ 4 ms po frejmu
za three sloj. Ako u kodu vidiš očigledan trošak (novi `Mesh` po frejmu,
`new Vector3` u petlji), ukloni ga sada — instanciraj geometrije jednom,
koristi `InstancedMesh` za prstenove.

### 6. Ne diraj
Klastere, hover, klik, stanja (a)–(d) iz GL3. Ako moraš da promeniš
`leads-map.tsx`, promena je samo montiranje/demontiranje sloja i prosleđivanje
izabrane firme.

## Kriterijum gotovosti
1–4 obavezno, 5 delimično (instanciranje). Ako sloj ne može stabilno da deli
kontekst sa MapLibre-om (crni ekran, z-fighting koji ne umeš da rešiš u
razumnom vremenu), sloj se NE montira po defaultu — ostavi ga iza zastavice
`?three=1` i napiši tačno šta ne radi. Native mapa mora ostati ispravna.
