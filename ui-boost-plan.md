# Plan: UI/UX BOOST — boja, fokus, napredak (faze B0–B10)

Nadređeni plan za preradu izgleda i doživljaja cele aplikacije posle A1–A9.
Napisan 11.10.2026. posle pregleda koda i produkcije (`digital.enigmait.rs`,
prijavljen admin). Ekran na kom je meren: **1536×695 CSS px** — to je Jovanov
stvarni prikaz (1920×1080 na 125 % skaliranja, Chrome na Windowsu).

**Jovanov zahtev:** *„Monotono je i kad uđem nejasno mi je gde da gledam, kliknem
i čitam. Hoću boje, gamifikaciju i jasnoću — plus fikseve svega, ali primarno
UI/UX."*

**Šta ovaj plan zamenjuje:** sekciju „Design system" u `CLAUDE.md` (nova je u
§3.9), deo o boji u `app-ux-plan.md` §2 S i `leadovi-ux-plan.md` O5 (boja).
**Sve ostalo iz tih planova i dalje važi**: „šta me čeka", poštenje brojeva i
imenilaca, tastatura, temperatura leada, pravila za `convex/`.

---

## §0 Pravila (važe za svaki B prompt)

1. **Ništa se ne gubi.** Svaka postojeća radnja ostaje dostupna; ako se pomeri,
   izveštaj kaže gde je sada.
2. **Nema mrtvih kontrola. Nepoznato ≠ nula.** Kad podatka nema, piše „—" i
   razlog. Broj se nikad ne izmišlja.
3. Srpski, latinica, u celom UI-ju. **Nijedan „§" ni interna oznaka plana ili
   faze u tekstu koji korisnik vidi** (u komentarima koda sme).
4. Tokeni, nikad hex ni sirove Tailwind boje (`slate-*`, `cyan-*`…) u
   komponentama. Boja modula se čita isključivo kroz `var(--mod…)` (§3.4).
5. **Boja je informacija** (§3.1). Boja bez jedne od četiri uloge se ne dodaje.
6. **Jedan fokus i jedno primarno dugme po pogledu** (§4).
7. **Napredak (gamifikacija) se izvodi iz stvarnih radnji** u Convex-u. Nema
   događaja → nema XP-a. Nijedan izmišljen broj (§6).
8. Pokret: GSAP `useGSAP` unutar `gsap.matchMedia()` sa reduced-motion granom.
   **Tačnost pobeđuje pokret** — broj na ekranu nikad nije drugačiji od
   podatka; skriven tab ne animira.
9. Bez novih npm zavisnosti. GSAP, lucide, recharts, three i maplibre su već tu
   i dovoljni su za prstenove, trake, konfete i prelaze.
10. `convex/`: svaka nova tabela ide u `convex/lib/purgeMap.ts`
    `EXTRA_TABLE_OWNERSHIP`; svako novo polje je `v.optional` sa komentarom
    `OPCIONO NAMERNO`; svaka funkcija sa `workspaceId` proverava
    `membership.workspaceId !== args.workspaceId`. Pre Convex koda pročitaj
    `convex/_generated/ai/guidelines.md`.
11. **Referentni prikazi: 1536×695** (Jovan), 1440×900, 390×844. Fokus ekrana i
    njegovo primarno dugme moraju da stanu iznad preloma na 1536×695.
12. Posle svake faze snimi i pogledaj bar tri ekrana van opsega te faze.
13. **Skillovi su obavezni.** Svaki prompt na početku stvarno pokreće skillove
    iz svoje liste u §13, sa komandama i podešavanjima koja su tamo navedena.
    - `impeccable`, `ui-ux-pro-max`, `design-dna` i `design-taste-frontend` su
      instalirani u `.claude/skills/` ovog projekta.
    - `motion-design`, `gsap-*`, `marketing-psychology`, `onboarding` i
      `convex*` su već bili tu.
    - Ako neki ipak nije dostupan, zapiši to u izveštaj i nastavi sa
      `frontend-design`.
    - Kad se skill i ovaj plan ne slažu, pobeđuje plan (§13.2).
14. Next.js 16 nije Next iz tvog treninga: pre Next koda pogledaj
    `node_modules/next/dist/docs/` (vidi `AGENTS.md`).

---

## §1 Dijagnoza — izmereno 11.10.2026.

### 1.1 Zašto je monotono
- **Pravila prave monotoniju.** `CLAUDE.md` i komentar u `globals.css` kažu:
  „Cyan is strategic… never decorative", „no gradients-for-decoration, no
  glow-for-glow", „one accent". Rezultat: **svaki ekran je teget površina +
  beli tekst + jedna cijan boja**. Boja ne kaže ni gde si ni šta je bitno.
  Crvena i zelena postoje samo u sitnim deltama.
- **Isti šablon na svakom ekranu**: opisna rečenica → 4–10 istih KPI pločica →
  grafikon → tabela. Sve pločice imaju istu težinu, pa oko nema gde da sleti.
- **Dugmad bez pravila.** U kodu ima 417 `<Button>`: 106 bez varijante (puna
  cijan, dakle primarna), 171 `outline`, 130 `ghost`. Nigde ne piše koliko
  primarnih sme da bude na ekranu:
  - na Uvozu baner ima tri ista primarna „Nastavi pregled", jedno ispod
    drugog;
  - na profilu firme 8 dugmadi istog stila stoji u jednom redu, a nijedno nije
    primarno;
  - u tabeli leadova je 25 istih cijan dugmadi „Pozovi" — jedina boja na
    ekranu, ponovljena 25 puta, postaje šum umesto putokaza.
- **Mnogo sitnog i tihog teksta**: opisna rečenica na vrhu svakog ekrana i
  objašnjenja kriterijuma ispod naslova („ima telefon · procena ≥ 40 % · nikad
  dodirnut · Fit ≥ prosek (29 %)"), sve 12–13 px u prigušenoj boji.
- **Prazni kanali dominiraju.** Facebook, YouTube, Threads i Oglasi su uglavnom
  nule i „Nema šta da se iscrta". Ekran pun nula deluje mrtvo i ne kaže šta da
  uradiš.
- **Nigde nema osećaja napretka.** Aplikacija beleži pozive, ishode, sastanke,
  uvoze i objave, a nikad ne kaže „danas si uradio X, fali ti Y".

### 1.2 Zašto je nejasno gde gledam, kliknem i čitam
- **Bočna traka** ima oko 30 redova: Analitika (7 podstavki) i Instagram su
  otvoreni i kad nisi tamo. Na 695 px visine traka dobija sopstveni klizač.
  Sve ikonice su iste sive, a grupe u sitnim verzalima.
- **Gornja traka** ima šest stvari iste težine: birač perioda, opseg,
  pretragu, zvono, zeleni čip sinhronizacije i Odjavu.
- **Iznad preloma na 1536×695**: na Kontrolnoj tabli staje samo blok „Danas" i
  red pločica. Leadovi „Danas" počinju sa šest pločica brojeva pre ijedne
  radnje.
- **Windows hrom**: klasični klizači sa ▲▼ strelicama u bočnoj traci, ⌘K
  paleti, panelu zvona i **u svakoj traci tabova** (F1). Na Macu se to ne vidi,
  a kod Jovana izgleda pokvareno.

### 1.3 Leadovi (glavni radni ekran)
- Tabela: kolona **Firma je široka oko 80 px** („Hair…", „D Fr…", „Ko T…").
  Najvažniji podatak je najviše odsečen. Čipovi „Zašto" su presečeni na pola
  reči.
- Kolone sa istom vrednošću u 100 % redova na produkciji: Vlasnik („Ti"),
  Stanje („Nov · Nova firma"), Sledeći korak („Prvi poziv"), Intent („I –").
- Profil firme: 8 dugmadi istog stila, nijedno primarno. Čip „§2.5 & §9.1"
  stoji u naslovu istorije.

### 1.4 A9 nije na produkciji
`git status` pokazuje nekomitovane izmene iz A9 od 10.9. (CountUp, filter
`bezProcene`, tasteri `p/i/s`, kolona Vlasnik, period u zaglavlju, A7).
Produkcija ih nema.

---

## §2 Vizija — „Kontrolna soba koja te vodi"

**Teza:** otvoriš aplikaciju i za tri sekunde znaš:
1. **gde si** — boja modula je na ikonici, zaglavlju, aktivnom tabu i
   primarnom dugmetu;
2. **šta je najvažnije** — jedan fokus po ekranu, krupno;
3. **šta sledeće da klikneš** — jedno primarno dugme;
4. **koliko si napredovao** — misije dana, niz, XP, nivo i nedeljni prstenovi.

**Ton:** i dalje inženjerski precizno (Linear, Raycast), ali soba je osvetljena.
Svaki modul ima svoj signal, napredak svetli, a nagrade su zlatne. Gamifikacija
je za odrasle (Apple Fitness prstenovi, Duolingo niz), nikako crtani film.

**Pet pravila koja se vide na svakom ekranu:**
1. Boja kaže gde si.
2. Jedan fokus po ekranu.
3. Jedno primarno dugme.
4. Manje teksta, više signala.
5. Svaka radnja ostavi trag napretka.

---

## §3 Boje 2.0

### 3.1 Četiri uloge boje (i nijedna druga)
| Uloga | Šta | Izvor tokena | Primer |
|---|---|---|---|
| **Mesto** | boja modula: gde si | `--mod-*` (§3.2) | zelena ikonica i dugme „Pozovi" na Leadovima |
| **Stanje** | uspeh, upozorenje, greška, info + temperatura leada | `--success/--warning/--danger/--info`, `--temp-*` | crveni čip „Istekao prozor" |
| **Kategorija** | serije grafikona, čipovi signala, monogrami niša | validirana `--chart-1..6` | narandžasti čip „nema sajt" |
| **Napredak i nagrada** | XP, niz, nivoi, dostignuća | `--xp`, `--streak`, `--tier-*`, `--rarity-*` | zlatna XP traka |

### 3.2 Boje modula
OKLCH, ista svetlina i hroma, pa sve deluju kao jedna porodica.
- `ink` služi za ikonice, tekst-akcenat i linije (L 0.76, C ≈ 0.15).
- `strong` je puna podloga primarnog dugmeta i bedža, uvek sa tamnim tekstom
  `--text-inverse` (L 0.70, C ≈ 0.17).
- Izmereni kontrasti: ink na `surface-raised` ≥ 6,7:1; tamni tekst na strong
  ≥ 6,5:1.

| Modul | ključ | ink (OKLCH) | ink hex | strong hex | zašto ta boja |
|---|---|---|---|---|---|
| Kontrolna tabla | `tabla` | `oklch(0.781 0.13 235.8)` | `#58c4ff` | `#38bdf8` | brend cijan, ostaje |
| Leadovi | `leadovi` | `oklch(0.76 0.15 155)` | `#52cd86` | `#11bc6d` | zelena = „pozovi", rast |
| Novosti | `novosti` | `oklch(0.76 0.15 122)` | `#a1c047` | `#8ead09` | limeta = novo, sveže |
| Instagram | `instagram` | `oklch(0.76 0.15 355)` | `#fa86b6` | `#ed6ba4` | brend roze |
| Facebook | `facebook` | `oklch(0.76 0.121 258)` | `#80b3fe` | `#5c9eff` | brend plava |
| YouTube | `youtube` | `oklch(0.76 0.141 22)` | `#fe8a88` | `#f66c6d` | brend crvena |
| Threads | `threads` | `oklch(0.80 0.018 248)` | `#b5bfc9` | `#9ba6b2` | brend je monohromatski |
| Oglasi | `oglasi` | `oklch(0.76 0.15 60)` | `#f59740` | `#e68101` | narandžasta = potrošnja |
| Analitika | `analitika` | `oklch(0.76 0.15 305)` | `#c797fd` | `#b77ff2` | ljubičasta = uvid |
| Atribucija | `atribucija` | `oklch(0.76 0.13 190)` | `#0dcbc3` | `#08b6af` | tirkiz = veze |
| OpenReply | `openreply` | `oklch(0.76 0.125 282)` | `#a5a7ff` | `#908ffe` | indigo = automatizacija poruka |
| Pravila | `pravila` | `oklch(0.76 0.15 330)` | `#e68cde` | `#d773d0` | fuksija = čuvari |
| Podešavanja | `sistem` | `oklch(0.80 0.018 248)` | `#b5bfc9` | `#9ba6b2` | neutralno |

`strong` je ista nijansa na L 0.70 i C 0.17, ili na najvišoj hromi koja staje u
sRGB gamut. Izvor istine je `globals.css` u OKLCH; hex je tu samo za proveru.
`leadovi` je skoro ista nijansa kao `--success`, i to namerno: na Leadovima su
„uspeh" i „pozovi" isto osećanje. Stanje se uvek nosi i ikonicom ili tekstom,
nikad samo bojom.

### 3.3 Redosled u bočnoj traci (susedne boje se razlikuju)
cijan · zelena · limeta / roze · plava · crvena · siva · narandžasta /
ljubičasta · tirkiz / indigo · fuksija / siva (§7.1).

### 3.4 Mehanizam
- `components/app/nav-items.ts`: svaka stavka i svaki `EXTRA_SCREENS` ekran
  dobija polje `module`.
- `AppShell` postavlja `data-module="<ključ>"` na omotač sadržaja **i na
  `<html>`**, da i portali (dijalozi, popoveri, toast) nasleđuju boju.
- `globals.css` za svaki modul definiše `--mod-<ključ>` i `--mod-<ključ>-strong`,
  a pravilo `[data-module="<ključ>"]` postavlja:
  - `--mod: var(--mod-<ključ>)`, `--mod-strong: var(--mod-<ključ>-strong)`
  - `--mod-soft: color-mix(in oklch, var(--mod) 14%, var(--surface))`
  - `--mod-line: color-mix(in oklch, var(--mod) 45%, transparent)`
  - `--mod-glow: color-mix(in oklch, var(--mod) 35%, transparent)`
- Unutar modula `--primary` = `var(--mod-strong)` i `--ring` = `var(--mod)`,
  pa shadcn komponente nasleđuju same.
- Komponente čitaju SAMO `--mod*`. Bočna traka čita `--mod-<ključ>` svake
  stavke, pa je svaka ikonica u svojoj boji i kad nije aktivna.

### 3.5 Stanje
`--success`, `--warning` i `--danger` ostaju. Dodaje se `--info`
(`oklch(0.74 0.13 245)`, ≈ `#5db2f7`). Svako stanje dobija `-soft` (podloga 14 %)
i `-line` (45 %). Temperatura leada (`lib/temperature.ts`) i pravilo Fit/Intent
„više = jače" se ne menjaju.

### 3.6 Kategorija
Čipovi signala, monogrami niša i serije grafikona koriste validiranu
kategorijalnu paletu `--chart-1..6` (vidi komentar u `globals.css`). Mapiranje je
na jednom mestu, `lib/signal-colors.ts`:
| Vrsta signala | Boja |
|---|---|
| sajt (nema, loš, spor, bez HTTPS-a, ne radi) | `chart-2` narandžasta |
| reputacija i recenzije | `chart-6` ljubičasta |
| zakazivanje i tuđi sistem | `chart-3` zelena |
| društvene mreže (samo Instagram/Facebook) | `chart-5` magenta |
| nova ili novootvorena firma | `chart-1` cijan |
| ostalo | neutralno |

Za čip: podloga `color-mix(in oklch, var(--chart-N) 18%, var(--surface))`,
ivica 45 %, a tekst je posvetljena varijanta koja prolazi 4,5:1 (meri se u
`scripts/contrast-check.mjs`). Serija 1 grafikona sme biti boja modula **samo
ako** prolazi validator kategorijalne palete; inače ostaje `chart-1`.

### 3.7 Napredak i nagrada
| Token | Vrednost | Upotreba |
|---|---|---|
| `--xp` | `#fac131` | XP traka, „+15 XP", nagrada misije |
| `--xp-strong` | `#f3a504` | kraj gradijenta XP trake |
| `--streak` → `--streak-hot` | `#ff772f` → `#f84e3a` | plamen niza |
| `--tier-bronze/silver/gold/platinum/diamond` | `#c48961` / `#bbc5d1` / `#f3c443` / `#abdbde` / `#60ccfc` | bedž nivoa |
| `--rarity-common/rare/epic/legendary` | slate / `#5db2f7` / `#c797fd` / `#fac131` | dostignuća |

**Zlatna je rezervisana za nagradu.** Nijedan modul, stanje ni kategorija ne
koristi zlatnu, pa „zlatno = zaradio sam" postaje naučen signal.

### 3.8 Gradijent i sjaj — dozvoljeno samo ovde
1. **Napredak**: prstenovi, trake i merači (`--mod` → `--mod-strong`, ili XP).
2. **Fokus kartica** ekrana: ivica od 1 px u gradijentu + `--mod-glow` senka.
3. **Nagrade**: XP, nivo, dostignuće, proslava.
4. **Aurora** na vrhu strane: `radial-gradient` u boji modula, jačine najviše
   10 %, bez animacije.

Nikad na tekstu, redovima tabele, proizvoljnim karticama ni pozadini celog
ekrana.

### 3.9 Nova sekcija „Design system" za `CLAUDE.md`
B2 zamenjuje celu sekciju `## Design system` u `CLAUDE.md` ovim tekstom,
doslovno. Ostalo u `CLAUDE.md` se ne menja.

```md
## Design system (UI Boost — ui-boost-plan.md §3–§5)

- Dark slate stays the only page theme (`bg-background` = `#070d19`). Surfaces step up: `bg-card` → `bg-surface-raised`.
- **Color is information, with exactly four roles:** (1) PLACE — every module has its own color (`--mod-*`, activated by `data-module` on the route; sidebar icons always in their module color); (2) STATE — success / warning / danger / info + lead temperature; (3) CATEGORY — chart series, signal chips, niche monograms, only from the validated `--chart-1..6` palette via `lib/signal-colors.ts`; (4) PROGRESS & REWARD — XP gold, streak orange, level tiers, achievement rarity. A color without one of these roles is not added. Gold is reserved for rewards.
- Components read `var(--mod)`, `--mod-strong`, `--mod-soft`, `--mod-line`, `--mod-glow` — never a module's raw value, never hex, never the raw Tailwind palette (`slate-*`, `cyan-*`, …).
- **One focus and one `primary` button per view** (solid module color, dark text, `data-variant="primary"`). Everything else: `secondary` (module tint), `outline`, `ghost`. Row actions in tables are `ghost` icons revealed on row hover/focus.
- Gradients and glow ONLY for: progress (rings, bars, meters), the screen's focus card, rewards (XP, level, achievement, celebration), and the top-of-page aurora (≤ 10 % module color). Never on text, table rows, or arbitrary cards.
- Aeonik everywhere; scale 12 / 13 / 15 / 20 / 28 plus `text-hero` (40) for the single focus number of a screen. `font-mono` + `tabular-nums` for metric numerals. Page subtitles are one line (≤ 90 chars).
- Motion: GSAP `useGSAP` inside `gsap.matchMedia()` with a reduced-motion branch. Personality: "Corporate" for UI (150–200 ms, `--ease-ui`), "Playful" only for rewards (up to 600 ms; level-up up to 1.2 s; `--duration-reward`, `--ease-reward` — overshoot ONLY for rewards). At most 1–2 animated elements per view; work screens never animate their sections on load. Animate only `transform`/`opacity`. Accuracy beats motion: a number on screen never differs from the data; a hidden tab gets no animation.
- Cards only where elevation carries hierarchy (focus, mission, company, post); secondary groups use dividers and spacing. Shadows are tinted and quiet, never a neon halo. Icons: lucide only, one stroke width (1.75), no emoji. Touch targets ≥ 44 px on mobile.
- Design skills for UI work live in `.claude/skills/`: `impeccable` first, plus `ui-ux-pro-max`, `design-dna` (`nocni-run/ux/dna-boost.json`), `design-taste-frontend` (DESIGN_VARIANCE 4, MOTION_INTENSITY 4, VISUAL_DENSITY 6; GSAP instead of Framer, lucide instead of Phosphor), `motion-design`, `gsap-*`. When a skill conflicts with this file, this file wins.
- Gamification ("Napredak") is derived from real Convex events only — no XP without an event, no invented numbers. It can be switched off per user.
- Reference viewports: 1536×695 (the owner's real screen), 1440×900, 390×844. A screen's focus and its primary button must fit above the fold at 1536×695.
- No internal plan references (`§…`, phase IDs) in user-visible text.
```

---

## §4 Hijerarhija: fokus, dugmad, tekst

### 4.1 Fokus po ekranu
Svaki ekran ima tačno jednu **Fokus** zonu: najvažniji broj ili najvažniji
zadatak, krupno (`text-hero` 40 px ili kartica sa misijom), u boji modula i sa
jednim dugmetom. Sve ostalo je sekundarno, manje i tiše. Fokus za svaki ekran
je u tabeli u §8.

### 4.2 Dugmad i njihove uloge
| Varijanta | Izgled | Pravilo |
|---|---|---|
| `primary` | puna `--mod-strong`, tamni tekst, `--mod-glow` senka na hover, `data-variant="primary"` | **jedno po pogledu** (ekran, dijalog, fokus kartica) |
| `secondary` | `--mod-soft` podloga, `--mod` tekst, `--mod-line` ivica | prateće radnje |
| `outline` | neutralno, kao danas | alati i filteri |
| `ghost` | bez podloge | radnje u redu tabele, ikonice |
| `destructive` | danger | brisanje, uvek uz potvrdu |

Radnje u redovima tabele su `ghost` ikonice koje se pokažu na hover ili fokus
reda. Puno dugme ima samo red u fokusu tastature, odnosno prvi predlog.

### 4.3 Tekst
- Podnaslov ispod naslova ekrana: **najviše jedan red, do 90 znakova**. Duže
  objašnjenje ide u „i" oblačić.
- Objašnjenja kriterijuma („ima telefon · procena ≥ 40 % …") postaju čipovi
  ili oblačić, ne red sitnog teksta.
- Natpisi sekcija (eyebrow) su u boji modula, verzal, 12 px.
- Nova veličina `--text-hero: 2.5rem` (40 px, 700, tracking −0.022em) služi
  samo za fokus broj.

### 4.4 Pokret (iz `motion-design` i `ui-ux-pro-max`)
- **Ličnost pokreta**: „Corporate" za ceo UI (potpisna kriva je postojeća
  `--ease-ui`, 150–200 ms). „Playful" se koristi samo za nagrade.
- **Najviše 1–2 animirana elementa po prikazu.** `ui-ux-pro-max` to vodi kao
  grešku visoke težine („Excessive Motion"). `Reveal` danas stoji na 126 mesta
  i animira skoro svaku sekciju; sa radnih ekrana se skida, a animiraju se samo
  fokus i nagrade. Ekran se otvara u zadatak, ne u koreografiju.
- **Trajanja**:
  - pritisak 100 ms, hover ispod 100 ms;
  - panel i meni 150–200 ms;
  - toast: ulaz 250 ms, izlaz 180 ms (ulaz je uvek duži od izlaza);
  - završena misija 300–400 ms: skala sa blagim prebačajem, kvačica koja se
    iscrta i mali prasak;
  - novi nivo do 1,2 s.
- **Važna promena stanja nikad nije samo promena neprozirnosti** — uz nju ide
  pomeraj ili skala.
- **Pravilo 1/3**: najviše trećina elemenata je u pokretu odjednom, a stagger
  ukupno traje najviše 400 ms.
- Animiraju se samo `transform` i `opacity`. Brojevi se kotrljaju preko
  `gsap.quickTo`, sa `gsap.utils.snap` na preciznost cilja.
- Nagrada ima tri sloja pokreta: glavni (bedž ili kartica), prateći (XP traka
  i broj) i ambijentalni (čestice).

### 4.5 Raspored i materijal (iz `design-taste-frontend` i `ui-ux-pro-max`)
- **Komandni centar je asimetrična bento mreža od 12 kolona**, a ne red od tri
  iste kartice. Prva nezavršena misija je široka (2fr) i nosi primarno dugme;
  druge dve su uže (1fr).
- **Kartica samo kad elevacija nosi hijerarhiju** (fokus, misija, firma,
  objava). Sekundarne grupe se odvajaju razdelnicima i razmakom, ne kutijama;
  „kutija u kutiji" je deo današnje monotonije.
- **Sjaj nikad kao neonski oreol** (`0 0 Npx`). Senka je obojena i tiha
  (`0 10px 30px -14px var(--mod-glow)`), uz unutrašnju svetlu ivicu
  `inset 0 1px 0 rgba(255,255,255,.06)`.
- **Ikonice**: samo lucide (već je instaliran), jedna debljina linije u celoj
  aplikaciji (1.75), veličine 16/20/24, bez emodžija.
- **Telefon**: svaka dodirna meta je najmanje 44×44 px.
- **Svaka nova komponenta ima sva stanja**: učitavanje (skeleton iste
  veličine), prazno, greška, hover, fokus, aktivno, onemogućeno.

---

## §5 Sistem komponenti 2.0
Sve u `components/app/system/` i sve čita tokene iz §3.

1. **PageHeader v2.** Levo pločica od 40 px sa ikonicom modula (`--mod-soft`
   podloga, `--mod` ikonica), naslov (20 px/700) i jedan red podnaslova. Desno
   jedno `primary` i po potrebi `secondary` ili `outline`. Iza je aurora
   (§3.8). Mrvica ostaje u gornjoj traci.
2. **FocusCard.** Ivica od 1 px u gradijentu (`--mod` → `--mod-strong` →
   providno) i `--mod-glow` senka. Sadrži broj ili misiju i jedno dugme.
3. **KpiTile v2**, u veličinama `hero | default | compact`:
   - ikonica u `--mod-soft` pločici, a broj u `hero` veličini ima 40 px;
   - delta je **obojena pilula** (`▲ 12 %` na `--success-soft`, `▼` na
     `--danger-soft`, neutralno sivo), uz prop `higherIsBetter` jer je za CPA i
     potrošnju pad dobar;
   - sparklinija je u `--mod` sa gradijentom površine i **otporna na rupe**
     (F4);
   - cela pločica je klikabilna kad postoji detalj (`href`), sa strelicom na
     hover;
   - postojeći pozivi (82 `KpiTile` i 35 `StatTile`) rade bez izmene poziva.
4. **Button** sa varijantama iz §4.2. `primary` čita `--mod-strong`.
5. **Chip v2 + `lib/signal-colors.ts`** po §3.6. „Zašto" čipovi se nikad ne
   seku na pola reči; višak ide u „+N".
6. **Monogram firme**: zaobljen kvadrat od 28 px sa inicijalima, u boji niše
   (deterministički heš na `chart-*`). Koristi se u tabeli, kartici i profilu.
7. **EmptyState v2 = „Misija za start".** Kad ekran nema podataka: ikonica u
   pločici sa prstenom u boji modula, naslov, jedna rečenica, **jedno primarno
   dugme** i po potrebi spisak koraka za pokretanje sa XP nagradom („Poveži
   Facebook stranicu · +50 XP"). Kad su SVE pločice 0 i nema istorije, red
   pločica se skuplja u jednu liniju „Još nema podataka za ovaj period" + Misija
   za start. Nikad zid nula.
8. **Primitivi napretka**:
   - `ProgressRing` (SVG, zaobljen kraj, gradijent), `ProgressBar`,
     `SegmentedMeter`;
   - `XpBar` (zlatna, „1.240 / 1.500 XP"), `LevelBadge` (štit ili heksagon u
     boji ranga, sa brojem), `StreakFlame` (plamen + broj, i stanje „u
     opasnosti"), `AchievementBadge` (zaključan ili otključan, retkost);
   - `MissionCard`, `RewardToast` (+XP), `CelebrationBurst` (GSAP čestice do
     900 ms, `pointer-events: none`, a pod reduced-motion ništa).
9. **TabNav / SectionNav.** Aktivna podvlaka je u `--mod`, nema vertikalnog
   klizača (F1). Na uskom prikazu tabovi klize horizontalno, sa senkom na ivici.
10. **Klizači** su globalno tanki (F2).
11. **Pokret.** Novi tokeni `--duration-reward: 600ms` i
    `--ease-reward: cubic-bezier(.34,1.56,.64,1)` (prebačaj samo za nagrade).
    Klikabilna kartica se na hover podigne i dobije ivicu `--mod-line`.
12. **Živi vodič**: ruta `sistem` u `app/dev-ux` (samo dev). Prikazuje sve
    tokene, svih 13 modula, sva dugmad u svakom modulu sa stanjima, pločice,
    čipove, primitive napretka i prazna stanja. Snimak vodiča se pravi u svakoj
    fazi.

---

## §6 Napredak (gamifikacija)

U UI-ju se zove **„Napredak"**. Ime je jasno i nije detinjasto.

### 6.1 Principi
- **Izvedeno, ne izmišljeno**: XP se računa iz postojećih događaja u Convex-u.
  Nema događaja → nema XP-a.
- **Protiv „farmanja"**: kape po radnji, firmi i danu. Ponovljeno menjanje
  istog stanja ne daje XP.
- **Lično, ne takmičarsko**, jer radni prostor ima jednog aktivnog člana. Ako
  ikad bude dva ili više članova sa radnjama, dodaje se nedeljna tabela tima
  koja se može isključiti.
- **Može da se isključi**: Podešavanja → Napredak → „Prikazuj XP i proslave".
  Kad je isključeno, nema XP-a, niza ni proslava. Merači kvaliteta ostaju jer
  su korisni.
- **Nikad ne blokira posao**: proslava traje najviše 1,2 s, zatvara se klikom
  ili Esc, a pod reduced-motion je statična.
- Vreme se računa po **Europe/Belgrade** (`lib/belgrade-time.ts`).

### 6.2 Izvori XP-a
Popisano u B4 nad stvarnom šemom (11.10.2026). Polja označena **novo** su
`v.optional` i upisuju se od B4; stari redovi bez autora daju 0 XP. Vrednosti i
kape žive na jednom mestu: `PRAVILA_XP` u `convex/lib/napredak.ts`.
| Događaj | Izvor (tabela · uslov · autor · vreme) | XP | Kapa |
|---|---|---|---|
| Dodir (poziv ili kontakt) | `leadStageEvents` `kind:"dodir"`, osim kanala `beleska` · `actorUserId` · `occurredAt` | 10 | 1 po firmi dnevno |
| Ishod zabeležen | `leadStageEvents` `kind:"ishod"` · `actorUserId` · `occurredAt` | 15 | 1 po firmi dnevno |
| Sledeći korak postavljen | `leadStageEvents` `kind:"sledeci_korak"` · `actorUserId` · `occurredAt` | 5 | 1 po firmi dnevno |
| Sastanak dogovoren | `leadStageEvents` `kind:"sastanak"` sa `toValue` (bez `toValue` = otkazan; otkazan istog dana = 0) | 50 | 1 po firmi dnevno |
| Faza → `poslata_ponuda` | `leadStageEvents` `kind:"faza"`, `toValue` | 40 | 1 po firmi |
| Faza → `dobijen` | `leadStageEvents` `kind:"faza"`, `toValue` | 250 | 1 po firmi |
| Uvoz primenjen | `leadImports` `status:"primenjen"` · `appliedBy` (**novo**; za stare `uploadedBy`) · `appliedAt` | 20 | — |
| Rešen nerazrešen red uvoza | `leadImportRows` · `resolvedBy` (**novo**) · `resolvedAt` (**novo**) | 3 | 100 dnevno |
| Objava objavljena (IG/Threads) | `igPublishJobs` / `threadsPublishJobs` `status:"published"`, Threads bez `replyToId` · `createdBy` · `publishedAt` | 30 | — |
| Članak objavljen (Novosti) | `posts` `status:"published"` · `publishedBy` (**novo**) · `firstPublishedAt` (**novo**) | 60 | 1 po članku |
| Moderacija ili odgovor | `igModerationLogs` / `fbModerationLogs` `status:"done"`, radnje `reply`, `hide`, `delete` · `userId` · `createdAt`; i Threads odgovor čoveka (`replyToId`) | 5 | 20 dnevno, 1 po komentaru |
| Radnja na oglasima | `adActions` `status:"success"` · `userId` · `executedAt` | 10 | 10 dnevno |
| Pravilo napravljeno | `rules` · `createdBy` (**novo**) · `_creationTime` | 20 | 1 po pravilu |
| Dopuna telefona | `leadIdentities` `kind:"phone"` · `createdBy` (**novo**) · `createdAt`. Nema svoj XP; broji se za misiju `dopuni` i „Detektiva" | 0 | — |
| Misija završena | izvedeno | 30–80 | 3 dnevno |
| Sve tri misije završene | izvedeno | +100 (dnevni bonus) | 1 dnevno |

Upis više od jednog beogradskog dana posle samog događaja ne donosi XP (dodir i
ishod smeju da se unesu unazad). „Poziv" za prsten i misiju je dodir kanalom
`poziv` ili ishod `nije_se_javio`.

### 6.3 Nivoi
Za prelaz sa nivoa n na n+1 treba `100 + 40·(n−1)` XP. To znači oko 2.340 XP do
nivoa 10, 8.740 do nivoa 20 i 19.140 do nivoa 30. Formula je na JEDNOM mestu
(`convex/lib/napredak.ts`) i pokrivena je testom.
- **Zvanja**: 1–2 Regrut · 3–4 Kadet · 5–7 Operativac · 8–10 Agent ·
  11–14 Specijalac · 15–19 Strateg · 20–24 Komandant · 25–29 General ·
  30+ Enigma.
- **Rang** (boja bedža): 1–4 bronza, 5–10 srebro, 11–19 zlato, 20–29 platina,
  30+ dijamant.

### 6.4 Dnevne misije (tri dnevno)
Bira ih generator iz **živog stanja**, iz istih izvora kao „šta me čeka"
(`convex/lib/notifications.ts`). Misija se pravi samo kad posao postoji.
| Ključ | Misija | Cilj | XP |
|---|---|---|---|
| `pozovi` | „Pozovi N firmi iz Zovi sada" | min(5, dostupno) | 60 |
| `ishodi` | „Zabeleži ishod za svaki današnji poziv" | broj današnjih dodira (najmanje 3) | 40 |
| `uvoz_redovi` | „Reši N nerazrešenih redova" | min(10, nerešeno) | 50 |
| `uvoz_pregled` | „Završi pregled zaglavljenog uvoza" | 1 | 50 |
| `zaostali` | „Očisti N zaostalih koraka" | min(3, zaostalo) | 50 |
| `dopuni` | „Dopuni telefon za N firmi" | 3 | 40 |
| `komentari` | „Odgovori na N komentara" | min(3, bez odgovora) | 30 |
| `objavi` | „Objavi nešto ove nedelje" | 1 (ako nije bilo objave 7 dana) | 60 |
| `sastanak` | „Zakaži sastanak" | 1 (ako je nedelja ispod cilja) | 80 |

- Misije dana se **zamrzavaju pri prvom otvaranju dana** u tabeli `napredakDan`
  (korisnik, datum, [{ključ, cilj, xp}]). Napredak se izvodi uživo iz događaja
  tog dana, pa misija ne nestaje kad je završiš.
- Izbor ide po hitnosti (kao u zvonu), pa po raznovrsnosti (najviše jedna
  misija po oblasti), deterministički po datumu.
- Kad su sve tri gotove: „Dnevni bonus +100 XP" i proslava.

### 6.5 Niz (streak)
Dan se računa ako je završena bar jedna misija ILI ako ima bar tri XP
događaja. Podešavanje „Vikend ne prekida niz" je podrazumevano UKLJUČENO, jer
agencija radi radnim danima. Posle 17 h, ako današnji dan još nije uračunat,
niz prelazi u stanje „u opasnosti".

### 6.6 Nedeljni ciljevi: tri prstena
Pozivi (zeleni, podrazumevano 25), Sastanci (cijan, 3) i Objave (roze, 2).
Menjaju se u Podešavanja → Napredak (tabela `napredakPodesavanja`). Uz svaki
prsten uvek stoje broj i procenat; boja nije jedini nosilac informacije. U
gustim prikazima umesto prstena ide bullet traka sa oznakom cilja.

### 6.7 Dostignuća
Izvedena su; vreme otključavanja je vreme događaja koji ga je otključao.
- Prvi kontakt
- Na liniji (10 dodira u danu)
- Maratonac (100 / 500 / 1000 dodira)
- Zakazano! (prvi sastanak)
- Pun kalendar (5 sastanaka u nedelji)
- Ponuda poslata
- **Zatvarač** (prvi `dobijen`, legendarno)
- Uvek ishod (7 dana zaredom svaki dodir ima ishod)
- Bez zaostataka (7 dana 0 zaostalih)
- Čist uvoz (0 nerešenih redova u svim uvozima)
- Detektiv (25 dopuna)
- Glas brenda (10 objava)
- Moderator (50 moderacija)
- Niz 7 / 30 / 100
- Nivo 10 / 20 / 30
- Savršena nedelja (sva tri prstena puna)
- Čuvar budžeta (prvo aktivno pravilo)

### 6.8 Merači koji uče (napredak kao putokaz)
- **Leadovi → Kvalitet baze** (%): telefon, procena broja, ocenjen sajt i niša.
  Merač kaže „+X % kad dopuniš Y", a dugme otvara tačan filter.
- **Kanali → Spremnost kanala** (segmentni merač): povezan · sinhronizuje ·
  objava u poslednjih 7 dana · nema neodgovorenih komentara.
- **Uvoz → Čistoća uvoza**: rešeni redovi / svi redovi.
- **Podešavanja → Integracije**: N od M povezano.

### 6.9 Trenuci povratne informacije
- Toast `+15 XP · Ishod zabeležen` dole desno, zlatan, sa brojem koji se
  kotrlja. Pali ga jedan hook, `useNapredakFeedback()`, koji prati promenu
  `napredak.stanje` (Convex je reaktivan), a ne svaka mutacija posebno. +XP
  toast se sam zatvara posle 2,5 s, ostali posle 4 s; u steku su najviše 3.
- Završena misija: kartica se okrene u „Završeno ✓" uz mali zlatni prasak.
- Novi nivo: traka sa vrha (bedž + zvanje) i konfete od 1,2 s. Nije modal.
- Novo dostignuće: toast sa bedžom.
- U Režimu poziva: kombo „3 zaredom!" (§8).
- Već viđene proslave pamti `napredakPotvrde`, pa se ne ponavljaju posle
  osvežavanja.

### 6.10 Oblik backenda
- **`convex/lib/napredak.ts`** sadrži čiste funkcije, bez Convex zavisnosti:
  pravila XP-a, kape, kriva nivoa, generator misija, niz i dostignuća.
- **Test**: `scripts/napredak-check.ts` → `npm run verify:napredak`, nad
  sintetičkim događajima (kape, ponoć po Beogradu, vikend, kriva, misije,
  dostignuća).
- **`convex/napredak.ts`**:
  - `stanje({workspaceId})` vraća XP, nivo, sledeći prag, niz, misije dana sa
    napretkom, nedeljne prstenove i poslednje događaje;
  - `profil({workspaceId})` vraća dostignuća, lične rekorde i mapu aktivnosti
    za 12 nedelja;
  - mutacije `podesi`, `potvrdi` i zamrzavanje dana.
- **Tabele**: `napredakDan`, `napredakPodesavanja`, `napredakPotvrde`. Sve idu u
  purge mapu i proveravaju članstvo.
- **Indeks**: `leadStageEvents.by_workspace_actor_time` =
  `["workspaceId","actorUserId","occurredAt"]`, za upite po opsegu datuma.

---

## §7 Navigacija i ljuska

### 7.1 Bočna traka v2
Novosti se sele, a Leadovi idu gore jer su svakodnevni posao.
- **RADNI STO**: Kontrolna tabla · Leadovi · Novosti
- **KANALI**: Instagram · Facebook · YouTube · Threads · Oglasi
- **ANALITIKA**: Analitika · Atribucija
- **AUTOMATIZACIJA**: OpenReply · Pravila
- **Dno**: Podešavanja (zupčanik) i **kartica igrača** (inicijali, zvanje i
  nivo, XP traka, plamen niza). Klik na karticu vodi na `/napredak`.

Pravila:
- Svaka ikonica je u svojoj boji modula, u pločici od 26 px. Aktivna stavka je
  pilula u `--mod-soft` sa levim indikatorom u `--mod`.
- **Podstavke se vide samo za aktivni modul** (Analitika, Instagram); ostali su
  zatvoreni. Traka nema klizač na 1536×695.
- Bedževi „šta me čeka" ostaju (`NavBadge`).
- Traka se skuplja u šinu ikonica od 64 px, a izbor se pamti po korisniku
  (`localStorage`, uz `try/catch`).

### 7.2 Gornja traka v2
Mrvica sa tačkom u boji modula · kompaktan birač perioda (samo na ekranima koji
rade sa periodom) · ⌘K · zvono · **meni korisnika** (inicijali; unutra su Odjava,
Podešavanja i Napredak). Status sinhronizacije postaje **tačka u boji stanja**
sa oblačićem, umesto dugačkog zelenog čipa; detalj je u zvonu.

### 7.3 Telefon
Donja traka ima **4 stavke + „Više"**: Tabla · Leadovi · Instagram · Danas
(zvono) · Više. „Više" otvara list sa svim modulima kao obojenim pločicama u
mreži od 3 kolone. Najviše 5 ćelija i bez horizontalnog klizanja.

### 7.4 ⌘K paleta v2
Obojene ikonice modula i sekcije **Radnje** („Započni režim poziva", „Uvezi
leadove", „Nova objava"…), **Ekrani**, **Misije dana** i **Nedavno**.

---

## §8 Ekrani — fokus i šta se menja

| Ekran | Fokus (jedan) | Primarno dugme | Ključne izmene |
|---|---|---|---|
| **Kontrolna tabla** → „Komandni centar" | kartica „Danas": pozdrav, zvanje i nivo, niz, 3 misije | radnja prve nezavršene misije | Desno su nedeljni prstenovi. Ispod „Šta me čeka" (3 stavke, obojene po hitnosti) i 4 pločice-kanala u bojama kanala (GA4 sesije ljubičasto, IG doseg roze, DM indigo, Leadovi zeleno), sa klikom u modul. Zatim grafikon, „Šta radi" i zdravlje sinhronizacije kao čipovi. |
| **Leadovi · Danas** → „tabla zadataka" | traka „Danas: 2/10 poziva · +40 XP · niz 4" | „Započni režim poziva" | Zovi sada kartice: monogram, temperatura na levoj ivici, Fit prsten, obojeni čipovi signala i čip „+25 XP". Merač Kvalitet baze. Šest brojeva postaje kompaktan red čipova sa imeniocem. |
| **Režim poziva** (novo, fokus prikaz) | jedna firma: ime, zašto, telefon | „Pozovi" | Posle poziva idu brzi ishodi (Nije se javio · Zainteresovan · Nije zainteresovan · Zakazan sastanak → dijalog), pa sledeća firma. Kombo i XP. Esc izlazi. Sve ide kroz POSTOJEĆE mutacije. |
| **Leadovi · Tabela** | — (radna površina) | „Uvoz leadova" ostaje gore desno kao secondary | Firma ima bar 220 px (monogram, naziv, a ispod grad i niša). Kolone sa istom vrednošću u ≥ 90 % redova se same sakrivaju. Stanje je čip sa menijem (O2). Čipovi su obojeni. Radnje u redu su ghost ikonice na hover ili fokus; puno dugme ima samo aktivni red. |
| **Profil firme** | „Šta je sledeće" + Pozovi | „Pozovi" | Dva secondary dugmeta (Zabeleži ishod, Zakaži), ostalo pod „Još radnji ▾". Aura temperature u zaglavlju, Fit kao prsten, bez § čipova. |
| **Uvoz** | koraci (stepper u boji) + Čistoća uvoza | „Nastavi pregled" najstarijeg uvoza | Za zastarele uvoze dugme „Odustani od svih starijih od 30 dana (N)", uz potvrdu. |
| **Analitika** (+6 podekrana) | Sesije: hero pločica + veliki grafikon u ljubičastoj | — | Izvori saobraćaja sa ikonicom izvora i trakom u boji modula. Podekrani su SectionNav tabovi. |
| **Atribucija** | levak DM → klik → sesija → konverzija kao stepenasti vizual | — | Između koraka levka piše procenat prelaza. UTM integritet kao merač. |
| **Instagram** (+podekrani) | Pratioci + Spremnost kanala | „Nova objava" | Obrisane objave su podrazumevano skrivene. Mreža objava ima obojene bedževe angažmana. |
| **Facebook / YouTube / Threads** | Spremnost kanala; prazno → Misija za start | po kanalu („Pošalji video", „Objavi") | Bez zida nula (§5.7). |
| **Oglasi** | Potrošnja, sa valutom | „Nova kampanja" | Prazno → Misija za start. |
| **OpenReply** | levak DM → klik | — | Ispravljen CTR (F6). |
| **Pravila** | kartice čuvara sa prekidačem | „Novo pravilo" | Evaluator se ne animira (F7). Istorija je vremenska osa. |
| **Novosti** | tabla po statusu (nacrt amber, objavljeno zeleno, arhiva sivo) | „Novi post" | Bez § u opisu. |
| **Podešavanja** | Integracije N/M | — | Integracije kao pločice u brend boji sa zdravljem. Nova sekcija „Napredak". Šire na velikom ekranu. |
| **/napredak** (novo) | nivo + XP traka | — | Misije, niz, prstenovi, dostignuća (mreža zaključanih i otključanih), lični rekordi i mapa aktivnosti za 12 nedelja. Mapa je jednobojna sekvencijalna skala u zlatnoj, sa legendom i brojem u oblačiću, pa je čitljiva i daltonistima. |
| **Prijava** | brend trenutak | „Prijavi se" | Aurora i display tip; tok se ne menja. |

---

## §9 Fiksevi (izmereno 11.10.2026.)

| # | Šta | Gde | Dokaz |
|---|---|---|---|
| F0 | A9 nekomitovan od 10.9. (CountUp, `bezProcene`, `p/i/s`, Vlasnik, period, A7) | `git status` | 19 izmenjenih i 5 novih fajlova |
| F1 | Svaka traka tabova ima vertikalni klizač sa ▲▼ (Windows): `overflow-x-auto` bez `overflow-y-hidden` | `components/app/tab-nav.tsx:134`, `section-nav.tsx:93` | Leadovi, Uvoz, Pravila, Podešavanja, Threads, profil firme |
| F2 | Klasični Windows klizači u bočnoj traci, ⌘K i zvonu; nema globalnog stila | `app/globals.css` | snimci |
| F3 | Oznaka vrednosti „0" na prvoj i poslednjoj tački grafikona preklapa datume na x-osi | `components/app/timeline-chart.tsx` (`renderAreaLabel`) | Kontrolna tabla, Analitika |
| F4 | Sparklinije sa rupama izgledaju pokvareno (tačkice i crtice): dani sa `undefined` seku liniju na segmente od jedne tačke | `components/app/system/kpi-tile.tsx` (segmenti oko r. 242–283) + izvor serije | Analitika: Korisnici, Angažovane sesije, Stopa angažovanja, Pregledi |
| F5 | Y-osa ponavlja oznake („2, 1, 1") kod malih celobrojnih opsega | `timeline-chart.tsx` (`areaTicks`) | OpenReply, Threads |
| F6 | „Prosečan CTR 142,5 %": `ctr = linkClicks / dmsSent` prelazi 100 % kad klikovi nisu jedinstveni ili ne dolaze samo iz DM-a | `lib/metrics.ts:222`, `openreply-dashboard.tsx` | OpenReply |
| F7 | „Cron evaluator" je konstanta 30 provučena kroz CountUp čiji `format` ne zaokružuje, pa se tokom animacije vidi „Svakih 19.814826m". „Aktivna pravila 0" je uvek zeleno | `components/app/rules/rules-dashboard.tsx:156–186` | Pravila |
| F8 | CountUp: međuvrednosti nisu zaokružene na preciznost cilja; u skrivenom tabu (rAF stoji) brojevi ostaju 0 ili međuvrednost | `components/motion/count-up*.ts(x)` | tab u pozadini 15 s pokazuje 0 |
| F9 | Interne oznake plana u UI tekstu: „(§2, §4, §11)", „§2.5 & §9.1", „§2.3 & §8 Pravila obrade", „(§6.1, tačno 19 kolona)", Threads (§10.2, §9, §5.4, §8, §6, §2.1) | `app/(app)/novosti/page.tsx`, `lead-timeline.tsx:134`, `lead-identities-panel.tsx:92`, `lead-export-dialog.tsx`, `lead-gap-fill-dialog.tsx`, `components/app/threads/*` | grep `§` |
| F10 | Kolona Firma oko 80 px, čipovi „Zašto" presečeni, konstantne kolone | `leads-table.tsx`, `lead-columns.ts` | Tabela (radi B7) |
| F11 | Oglasi: „0,00" bez valute | `components/app/ads/*` | Oglasi |
| F12 | Podešavanja GA4: „Vremenska zona UTC", a Analitika piše „Europe/Belgrade"; „Naziv propertije (Nije postavljen)", „Valuta Nije definisana". Proveri izvor; ako Admin API ne vraća podatak, prikaži „—" i razlog | `components/app/settings/*` | Podešavanja |
| F13 | Analitika: KPI „Sesije 12", a tabela izvora kaže „14 sesija". Objasni imenilac ili ispravi zbir | `components/app/analytics/*` | Analitika |
| F14 | Instagram „Top sadržaj" rangira obrisane objave (#1, #3) — sakrij ih podrazumevano. Prazni tamni pravougaonici u uglovima kartice bez slike | `components/app/instagram/*` | Instagram |
| F15 | ⌘K: okvir fokusa polja je odsečen na vrhu | `command-palette.tsx` | snimak |
| F16 | Mrvica je nedosledna: „PREGLED / Analitika" naspram „ANALITIKA / Uživo" | `nav-items.ts` | (radi B3) |
| F17 | Novosti su u grupi „Kanali", a to je CMS | `nav-items.ts` | (rešava §7.1, B3) |
| F18 | Telefon: donja traka ima 9 ćelija sa horizontalnim klizanjem | `mobile-nav.tsx` | (rešava §7.3, B3) |
| F19 | `tsconfig.json` (`include: **/*.tsx`, `exclude` samo `node_modules`, `overnight`) i ESLint obuhvataju `.claude/worktrees/**`: dve zastarele kopije aplikacije (~284 MB, grane `claude/leadovi-css-tokens-238e44` i `claude/novosti-ui-ux-redesign-3e90b9`, obe već u `main`, 0 commitova ispred). Typecheck i lint ih proveravaju | `tsconfig.json`, `eslint.config.mjs`, `git worktree list` | (radi B0) |

---

## §10 Kriterijum gotovosti (mera, ne osećaj)

1. Svaka ruta postavlja `data-module`, a bočna traka ima ikonice u bojama
   modula. `grep` ne nalazi hex ni sirove Tailwind boje u `components/`, osim
   obrazloženih izuzetaka zapisanih u izveštaju.
2. Na svakom glavnom ekranu je tačno **jedno** `[data-variant="primary"]` iznad
   preloma na 1536×695 (meri se skriptom nad DOM-om razvojnog prikaza).
3. `node scripts/contrast-check.mjs` prolazi i za nove tokene: tekst ≥ 4,5:1,
   kontrole i ikonice ≥ 3:1.
4. Nijedna traka tabova nema vertikalni klizač. Bočna traka staje u 695 px bez
   klizača (van Analitike).
5. `npm run verify:napredak` prolazi. XP je determinističan, nema XP-a bez
   događaja, a isključen Napredak ne prikazuje ništa od XP-a.
6. Postoje snimci svih glavnih ekrana na 1536×695, 1440×900 i 390×844, sa 0
   elemenata koji probijaju širinu i 0 grešaka u konzoli.
7. Prolaze `npm run typecheck`, `npm run lint` (za svoje izmene), svi `verify:*`
   i `npm run build`.
8. Pod reduced motion nema proslava ni pomeranja, a brojevi su tačni odmah.
9. `grep -rn "§"` u stringovima koje korisnik vidi daje 0 pogodaka.
10. Na 390 px donja traka ima najviše 5 ćelija i nema horizontalnog klizanja.
11. Pre-delivery lista iz `ui-ux-pro-max` prolazi za svaki glavni ekran:
    - `cursor-pointer` na svemu što je klikabilno;
    - hover ne pomera raspored;
    - fokus se vidi;
    - reduced-motion se poštuje;
    - nema emodžija kao ikonica;
    - nema vodoravnog klizanja na 375, 768, 1024, 1440 i 1536×695.
12. Nijedan radni ekran ne animira sekcije pri učitavanju. Pri otvaranju se
    pomeraju najviše 2 elementa (fokus i eventualna nagrada).

---

## §11 Faze → promptovi (Opus 5.5)

Promptovi su u `nocni-run/B0.md` … `nocni-run/B10.md`. Pušta ih runner
`nocni-run/run-boost.ps1` (opis ispod tabele), a mogu i ručno, jedan po jedan,
u Claude Code-u.

| # | Prompt | Šta radi | Model | Effort | Mod | Sesija | Zavisi od |
|---|---|---|---|---|---|---|---|
| B0 | Priprema: A9 + vizuelna petlja | komituje A9; F19; snimci i razvojni prikaz za SVE ekrane; 1536×695 | Sonnet 5.5 | high | auto | nova | — |
| B1 | Fiksevi | F1–F9, F11–F15, uz dokaz za svaki | Opus 5.5 | high | goal | nova | B0 |
| B2 | Dizajn sistem 2.0 | boje modula, tokeni, komponente, živi vodič, novi `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `dna-boost.json` | Opus 5.5 | max | plan | nova | B0 |
| B3 | Ljuska | bočna traka, gornja traka, telefon, ⌘K | Opus 5.5 | xhigh | auto | nova | B2 |
| B4 | Napredak — backend | XP, nivoi, misije, niz, ciljevi, dostignuća, test | Opus 5.5 | xhigh | plan | nova | B0 |
| B5 | Napredak — UI | kartica igrača, nagrade, `/napredak`, podešavanja | Opus 5.5 | xhigh | auto | **ista kao B4** | B3, B4 |
| B6 | Komandni centar + Leadovi Danas + Režim poziva | dva glavna ekrana + fokus prikaz za pozive | Opus 5.5 | max | auto | nova | B5 |
| B7 | Leadovi: Tabela, Profil, Uvoz, Mapa | F10 + ostatak Leadova | Opus 5.5 | xhigh | auto | **ista kao B6** | B6 |
| B8 | Kanali | Instagram, Facebook, YouTube, Threads, Oglasi, Novosti | Opus 5.5 | high | auto | nova | B3 |
| B9 | Analitika i ostalo | Analitika, Atribucija, OpenReply, Pravila, Podešavanja, Prijava | Opus 5.5 | high | auto | **ista kao B8** | B8 |
| B10 | Završna provera i polish | svih 12 tačaka iz §10, uz dokaz | Opus 5.5 | xhigh | goal | nova | B7, B9 |

Runner ih pušta redom: B0 → B10. Ako faza padne, zavisne faze se preskaču, a
ostale idu dalje.

**Runner (`nocni-run/run-boost.ps1`)**
- **Pokretanje** iz korena repoa:
  `powershell -ExecutionPolicy Bypass -File .\nocni-run\run-boost.ps1`.
  Opcije su u zaglavlju skripte.
- **Mod:**
  - **auto** — `--permission-mode auto`.
  - **plan** — prvi poziv ide u `--permission-mode plan` i samo piše plan
    (čuva se u `nocni-run/planovi/<ID>-plan.md`). Drugi poziv u istoj sesiji
    ga sprovodi u auto modu. Sa `-CekajPlan` runner pre izvršenja čeka tvoje
    odobrenje.
  - **goal** — tekst prompta počinje sa `/goal`. Ako faza ne završi, runner
    nastavlja istu sesiju kratkim `/goal` uslovom.
- **Sesija:** nova = `--session-id <novi uuid>`; ista = `--resume <id faze>`.
- **Posle faze:**
  - uspešna faza (commit `[ID]` uz liniju `GOTOVO` ili izveštaj) → runner
    pushuje;
  - neuspela faza → izmene idu u `git stash`, njeni commitovi na granu
    `boost-neuspeh/<ID>-…`, main se vraća na stanje pre faze, a zavisne faze
    se preskaču. Ništa nedovršeno ne ide na produkciju.
- **Prekidi:** limit pretplate → runner čeka reset i nastavlja istu sesiju;
  greška API-ja → do 3 nova pokušaja; istekla prijava ili limit koji se
  resetuje tek za više od 10 h → run staje uz jasnu poruku.
- **Ponovno pokretanje** iste komande nastavlja gde je stalo: urađene faze se
  preskaču, a prekinuta faza nastavlja svoju sesiju (`-Ispocetka` = sve
  iznova).
- **Zabrane u fazama:** runner odbija `git push`, `git reset --hard`,
  `git clean`, brisanje grana i worktree-ova i `convex deploy/dev/env/run`.
- **Logovi i rezime** su u `nocni-run/logs/boost/` (`REZIME-BOOST.md`,
  `stanje.json`).

---

## §12 Rep — završni koraci svakog B prompta (ovim redom)

1. `npm run typecheck` mora proći bez grešaka. Ako ne prolazi, popravi i
   ponovi.
2. Ako je diran `convex/`: `npm run verify:purge`. Uz to pokreni `verify:*`
   skripte koje pokrivaju dirani deo (`verify:brojevi`, `verify:pokret`,
   `verify:obavestenja`, `verify:leads-ui`, `verify:uvoz`, `verify:napredak`).
3. `npm run lint`: popravi ono što si ti uneo. Postojeće tuđe greške ne diraj,
   ali ih navedi u izveštaju.
4. **Snimci**: `node scripts/ux-snapshots.mjs --faza b<N>`. Ako `next dev` već
   radi, dodaj `--bez-servera --port <port>`; za zaglavljen server važi pravilo
   iz `nocni-run/_zajednicki-rep.md`. **Pogledaj snimke** (Read na .jpg) za
   1536×695 i 390×844. Popravi sve što vidiš u jednoj turi, pa potvrdi jednom.
   Bez beskonačnog doterivanja.
5. **Izveštaj** `nocni-run/izvestaji/B<N>.md` sadrži:
   - šta je urađeno, po sekcijama plana;
   - šta NIJE urađeno i zašto;
   - odluke koje si sam doneo;
   - fajlove koje si dirao;
   - kako Jovan proverava na `digital.enigmait.rs`, klik po klik;
   - rizike.
   Bez tajni i ličnih podataka.
6. `git add -A`, pa `git commit` sa porukom po obrascu iz prompta, na srpskom
   bez dijakritika. Na kraju poruke ide `Co-Authored-By: Claude
   <noreply@anthropic.com>`. Tajne (`.env*`, `client_secret*`, JSON ključevi,
   `env.personal.txt`, `.threads-probe-token`) su u `.gitignore`; ako bi
   ipak ušle u commit, prekini i javi.
7. **Push.** Kad faze pušta `nocni-run/run-boost.ps1`, push radi runner posle
   uspešne faze, a ti ga NE radiš. Kad radiš ručno: `git push origin main`.
   Ako push padne: `git pull --rebase origin main`, typecheck, pa ponovo push.
   Nikad `--force`.
8. Poslednja linija izlaza: `GOTOVO B<N>: <hash>` ili
   `NEUSPEH B<N>: <razlog u jednoj rečenici>`.

---

## §13 Skillovi — šta, gde i kako

### 13.1 Po fazi
| Faza | Skillovi i komande |
|---|---|
| B0 | Provera da su svi skillovi dostupni (spisak iz `.claude/skills/`) i da `ui-ux-pro-max` skripta radi (`python`). Bez dizajna. |
| B1 | `impeccable` `harden` i `clarify` · `gsap-utils` (`snap`) i `gsap-react` za F8 · `ui-ux-pro-max` `--domain chart` za F3–F5 |
| B2 | `impeccable` `init` (PRODUCT.md) → `colorize`, `bolder`, `typeset`, `layout` → `document` (DESIGN.md) · `ui-ux-pro-max` `--design-system`, `--domain ux "animation accessibility"`, `--stack shadcn` · `design-dna` (`nocni-run/ux/dna-boost.json`) · `design-taste-frontend` (podešavanja iz 13.2) · `motion-design` (§4.4) · `gsap-core`, `gsap-react` |
| B3 | `impeccable` `layout`, `colorize`, `adapt` · `ui-ux-pro-max` `--domain ux "navigation"` (dodir 44 px, z-index skala) · `design-taste-frontend` · `motion-design` · `gsap-react`, `gsap-timeline` |
| B4 | `convex`, `convex-design` · `marketing-psychology` (goal gradient, „endowed progress", umeren strah od gubitka niza) · `onboarding` (aha trenutak za Misiju za start) |
| B5 | `impeccable` `delight`, `animate` · `motion-design` (uspeh, novi nivo, tri sloja pokreta) · `gsap-timeline`, `gsap-performance`, `gsap-utils`, `gsap-react` · `ui-ux-pro-max` (toast, heatmap) |
| B6 | `impeccable` `shape` (Režim poziva, pre koda) → `bolder`, `layout`, `delight`, `clarify` · `ui-ux-pro-max` `--domain product "analytics dashboard"` i `--domain chart "goal progress"` · `design-dna` · `design-taste-frontend` (bento, §4.5) · `motion-design` · `gsap-timeline` · `marketing-psychology` |
| B7 | `impeccable` `layout`, `distill`, `clarify` · `ui-ux-pro-max` `--domain ux "table"` (red 36 px, lepljivo zaglavlje) · `design-taste-frontend` · `gsap-react` |
| B8 | `impeccable` `colorize`, `onboard`, `distill`, `clarify` · `onboarding` · `ui-ux-pro-max` `--domain chart` · `design-dna` |
| B9 | `impeccable` `colorize`, `typeset`, `clarify` · `ui-ux-pro-max` `--domain chart "funnel conversion"` i `"trend"` · `design-dna` |
| B10 | `impeccable` `audit` → `critique` → `polish` · `ui-ux-pro-max` pre-delivery lista · `design-taste-frontend` pre-flight (§10 skilla) · `design-dna` (UI naspram `dna-boost.json`) · `motion-design` lista kvaliteta · `gsap-performance` |

### 13.2 Kad se skill i plan ne slažu, pobeđuje plan
- **`design-taste-frontend`**:
  - Podešavanja za ovaj projekat: **DESIGN_VARIANCE 4, MOTION_INTENSITY 4,
    VISUAL_DENSITY 6**. To je radna aplikacija koja se otvara deset puta
    dnevno, pa nema „perpetual" animacija, osim tačke statusa uživo.
  - Framer Motion se zamenjuje GSAP-om (pravilo iz `CLAUDE.md`).
  - Phosphor i Radix ikonice se zamenjuju lucide-om, jer novih paketa nema.
  - „Najviše jedan akcenat" i „bez ljubičaste" ne važe za boje modula.
    Korisnik je izričito tražio raznovrsne boje, a skill sam kaže da korisnik
    uvek ima prednost. Boje modula imaju ulogu iz §3.1, pa nisu ukras.
  - Ostaje zabrana neonskog sjaja, gradijenta u tekstu i čisto crne.
- **`ui-ux-pro-max`**:
  - `--design-system` vraća generičke predloge (npr. Fira fontove, svetlu
    pozadinu). Koristi ga za proveru, UX i chart smernice i pre-delivery
    listu. Font ostaje Aeonik, a tema tamna.
  - Ne pokreći `--persist`, jer je izvor istine ovaj plan + `DESIGN.md`.
- **`impeccable`**:
  - `init` piše `PRODUCT.md` iz §2 ovog plana i `CLAUDE.md`.
  - `document` posle B2 piše `DESIGN.md` iz novog sistema.
  - Pravilo za radne ekrane („Restrained") je ovde svesno pomereno na
    „Committed" za boje mesta i nagrade (§3), jer to traži brief.
- **`design-dna`**: B2 piše `nocni-run/ux/dna-boost.json` u tri dimenzije
  (design_system / design_style / visual_effects), iz §3–§6. Svaka kasnija
  faza ga čita, a B10 meri UI prema njemu.
- **`motion-design`**: ličnost „Corporate" za UI, „Playful" samo za nagrade
  (§4.4).
