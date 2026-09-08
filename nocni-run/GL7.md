# GL7 — Pinovi umesto heksagona (Google Maps stil), klasteri, sloj efekata

Model: **Fable** · Effort: **high** · Mode: **acceptEdits (implementacija)** · Sesija: **nova**

Ti si u repou `enigmadigital`. Pročitaj `nocni-run/izvestaji/GL3.md`, `GL4.md`
i `GL6.md`, pa `components/app/leadovi/leads-map-canvas.tsx`,
`leads-map-three-layer.ts`, `leads-map-geo.ts`, `leads-map.tsx` (celo).
Pročitaj `.claude/skills/motion-design/SKILL.md` i
`.claude/skills/threejs-materials/SKILL.md`.

**Stanje na produkciji (viđeno):** mapa radi (GL6), tamna CARTO podloga sa
slate override-om, Beograd, tri firme kao sivo-plave heksagonalne prizme.
Jovanov sud: prizme ne izgledaju kao pinovi i nisu lepe. Hoće **pinove kao
na Google mapama — crvene, lepe.** To je zadatak. Sve ostalo (klasteri, hover,
klik, panel, letovi, three efekti) ostaje i mora da radi kao pre.

## Šta se menja

### 1. Pin umesto prizme
- Sloj `leadovi-heks` (`fill-extrusion`) i generisanje heksagona
  (`osveziHeks`, `heksagon()` u `leads-map-geo.ts`) se uklanjaju. Nema više
  „visina = fit"; legenda se menja u skladu sa tim.
- Pin je `symbol` sloj sa slikom iz `map.addImage` (crtano u `<canvas>` pri
  mountu, `pixelRatio: 2`, ne PNG fajl): Google oblik — kap sa šiljkom dole,
  beli krug u glavi, tanka tamnija ivica, meka senka na tlu (zasebna slika
  elipse ispod pina ili `icon-halo`, šta bolje izgleda). `icon-anchor:
  "bottom"`, `icon-pitch-alignment: "viewport"`, `icon-rotation-alignment:
  "viewport"` — pin stoji uspravno na nagnutoj mapi, kao u Googleu.
  `icon-allow-overlap: true` (pin ne sme da nestane zbog susednog).
- Boja tela pina: **crvena** (`--temp-hot` je #e04a3c — koristi nju ili
  Google crvenu #EA4335 kroz token; ako uvodiš novi token `--pin`, ide u
  `globals.css` uz komentar). Sva četiri stanja temperature dobijaju pin
  ISTOG oblika; temperatura se čita iz **kruga u glavi pina**: hot = crven
  krug u crvenom pinu (ceo pin „pun") sa svetlijom ivicom, warm = ćilibar
  krug, cold = plav krug, nova firma = beo krug. Legenda prikazuje četiri
  pina, ne četiri kvadratića.
- Veličina: osnovna ~34 px visine na zoomu 12+, blago rastuća sa zoomom
  (`interpolate` po zoomu), ne po fitu. Fit ostaje u hover kartici i panelu.
- Izabrani pin: veći (×1.25) i ispred ostalih (`symbol-sort-key`), sa
  svetlijim krugom; hover: blago uvećanje kroz `feature-state` ako je
  jeftino, inače samo kartica.

### 2. Klasteri u istom jeziku
- Klaster ostaje `circle` + `symbol` broj, ali u Google stilu: crven krug sa
  belim brojem, bela tanka ivica, tri veličine (2–9, 10–49, 50+). Boja
  klastera se ne meša sa temperaturom (klaster nema jednu temperaturu).
- Klik na klaster i dalje zumira (postojeće ponašanje).

### 3. three.js sloj (GL4) se prilagođava pinu
- Snop svetla za izabranu firmu se **uklanja** — pin sa senkom i uvećanjem
  je dovoljan, snop kroz pin izgleda pogrešno.
- Pulsirajući prsten za hot i beacon za sastanke ostaju na tlu, ispod pina,
  ali prsten mora biti tanji i manji od pina (poluprečnik ≈ širina pina), da
  ne nadjača sam pin.
- Kartica u preletu stoji iznad vrha pina (zameni „iznad heksagona").

### 4. Ostalo
- `mode="single"` (mini mapa u profilu): jedan pin, bez klastera — isti pin.
- `prefers-reduced-motion`, `?three=0`, stanja (a)–(d) iz GL3 — nepromenjeni.
- Slika pina se pravi jednom po stilu (`style.load` ih briše — dodaj ih
  ponovo posle `setStyle`, kao i izvore/slojeve).

## Provera
`npm run build`, pa lokalno ili na produkciji: na `/leadovi?tab=map` tri
crvena pina sa belim krugom stoje na svojim adresama uspravno pri pitch-u
55; zum unutra/napolje ih ne izobličava; klik otvara panel i pin se uveća;
`?firma=<id>` leti do pina; mini mapa u profilu ima isti pin. Screenshot
pre/posle nije moguć bez browsera — napiši tačno šta Jovan gleda.

## Kriterijum gotovosti
1 i 2 obavezno, 3 obavezno bar u delu „snop se uklanja". Ako pin sa
`icon-pitch-alignment: viewport` na pitch 55 izgleda loše (pin lebdi iznad
tačke zbog perspektive), probaj `map`-alignment sa manjim pitch-om (45) i
zapiši koji je bolji i zašto — odluka ostaje tvoja, ali obrazložena.
