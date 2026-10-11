# Plan B2 (plan korak runnera, 2026-10-11 18:07)

# B2 — Dizajn sistem 2.0: plan za odobrenje

Ništa nije menjano osim fajla plana (`~/.claude/plans/b2-dizajn-cozy-fern.md`). Tri stvari traže tvoju odluku pre koda: mešanje `-soft` tonova u `oklab` umesto `oklch` (§9.1), opt-in za PageHeader v2 i „Misiju za start" (§9.3–4), i to što su `--warning` i `--xp` praktično ista boja (§10).

## Kontekst
Aplikacija je monotona jer pravila dozvoljavaju jednu boju i ništa ne kaže gde si ni šta je bitno. B2 uvodi temelj: boju modula kao podatak i token, hijerarhiju (fokus, jedno primarno dugme), primitive napretka i živi vodič. Ekrani se ne sele (B6–B9), bočna traka se ne menja (B3).

Izmereno u kodu:
- **Pozivi:** `<KpiTile` 49 u 10 fajlova, `<StatTile` 23, `PageHeader` 30 fajlova, `<EmptyState` 44, `<Chip` 29. Prompt navodi 82 i 35; pristup kompatibilnosti je isti.
- **Dugmad:** 106 bez varijante, 175 `outline`, 130 `ghost`, 2 `secondary`.
- **Boja:** `text-primary` 50×, `bg-primary` 12×, `accent-400` 867× (tvrdi cijan, ostaje do B6–B9). Bočna traka čita samo `accent-400`, pa je `--primary` ne dira.
- **Toast sistem ne postoji.**
- **`contrast-check`** danas ne ume `oklch()` ni `color-mix(in oklch)` i ima 9 „padova" na razdelnicima (`line*`).

## 1. Skillovi
Svi su dostupni; `frontend-design` nije potreban.

- **Pokrenuto sada (samo čitanje):** `ui-ux-pro-max` (svih 5 komandi, bez `--persist`), `design-taste-frontend`, `motion-design`, `impeccable` (`context.mjs`, `init.md`, `document.md`, `colorize.md`), `design-dna` (šema).
- **Posle odobrenja (pišu fajlove):** `impeccable init` → `PRODUCT.md`; `impeccable colorize/bolder/typeset/layout` + `craft-floor.md` pre UI koda; `gsap-core`, `gsap-react`; `design-dna` → `dna-boost.json`; `impeccable document` → `DESIGN.md`; `impeccable detect.mjs` jednom na kraju.

**`ui-ux-pro-max --design-system`, kratak izlaz:** obrazac „Product Demo + Features"; stil „Dark Mode (OLED)", WCAG AAA; boje primary `#1E40AF`, secondary `#3B82F6`, CTA `#F59E0B`, pozadina `#F8FAFC`, tekst `#1E3A8A`; font Fira Code / Fira Sans; efekat „minimal glow (text-shadow 0 0 10px)"; anti-obrasci: svetla tema, sporo iscrtavanje.

| Skill | Prihvatam | Odbijam i zašto |
|---|---|---|
| ui-ux-pro-max | pre-delivery listu; `cursor-pointer`; hover bez pomeranja rasporeda; vidljiv fokus; dugme onemogućeno dok radi (`loading`); beskonačna animacija samo za spiner; boja nije jedini nosilac (pilula ima strelicu, prsten ima broj); bullet/gauge sa brojem i procentom → `ProgressBar goal`; shadcn semantičke promenljive i klase (`bg-mod-soft`, ne `var()` omotač) | Fira fontove (Aeonik ostaje); svetlu pozadinu i paletu; landing obrazac; sjaj na tekstu (§3.8); crveno→žuto→zeleno na meraču; `.dark` varijantu (jedna tema). `--domain chart "goal progress"` je vratio samo linijski grafikon; korisno je dao tek upit „gauge bullet" |
| design-taste-frontend | podešavanja **4 / 4 / 6**; kartica samo kad elevacija nosi hijerarhiju; obojena tiha senka; bez čisto crne; bez gradijenta u tekstu; sva stanja komponente; bez tri iste kartice u redu (`MissionCard featured` = 2fr/1fr/1fr); mono brojke; bez emodžija; grid umesto flex računa | Framer Motion → GSAP; Phosphor/Radix → lucide; zabranu fonta → Aeonik; „najviše jedan akcenat" i „bez ljubičaste" → boje modula imaju ulogu; beskonačne mikro-animacije i stagger pri učitavanju; svetli bento (`#f9fafb`, radijus 2.5rem) |
| motion-design | „Corporate" za UI, „Playful" samo za nagrade; ulaz duži od izlaza (toast 250/180); važna promena nikad samo neprozirnost; pravilo 1/3; tri sloja pokreta samo za nagradu | Corporate 200–400 ms i krivu (.2,0,0,1) → ostaju 150–200 ms i `--ease-ui`; modal 300–400 ms → 200 ms; „uvek tri sloja" za običan UI |
| impeccable | režim „Operate"; boja kao uloga; jedna tura pregleda, jedna potvrda | intervju u `init`: sesija nema alat za pitanja, pa `PRODUCT.md` ide iz §2 plana i `CLAUDE.md`, a izvedene činjenice su označene; „Restrained" → „Committed" za mesto i nagradu (§13.2) |
| design-dna | tri dimenzije, sva polja; efekti kojih nema dobijaju `enabled: false` | — (izvor je kod i plan, ne referentne slike) |

## 2. Tokeni (`app/globals.css`)
OKLCH je izvor istine; hex je provera (izračunato, sRGB).

### 2.1 Moduli
Kontrast inka je na strani / kartici / raised.

| ključ | ink `--mod-<k>` | hex | strong `--mod-<k>-strong` | hex | kontrast inka | tamni tekst na strong |
|---|---|---|---|---|---|---|
| tabla | `oklch(0.7812 0.1295 235.77)` | `#58c4ff` | `oklch(0.754 0.139 232.7)` | `#38bdf8` | 9,94 / 8,61 / 7,87 | 8,81 |
| leadovi | `oklch(0.76 0.15 155)` | `#52cd86` | `oklch(0.6997 0.1703 154.9)` | `#11bc6d` | 9,62 / 8,33 / 7,62 | 7,58 |
| novosti | `oklch(0.76 0.15 122)` | `#a1c047` | `oklch(0.6992 0.1672 121.7)` | `#8ead09` | 9,36 / 8,10 / 7,41 | 7,31 |
| instagram | `oklch(0.76 0.15 355)` | `#fa86b6` | `oklch(0.701 0.171 354.9)` | `#ed6ba4` | 8,44 / 7,31 / 6,68 | 6,51 |
| facebook | `oklch(0.76 0.121 258)` | `#80b3fd` | `oklch(0.7 0.158 258)` | `#5c9eff` | 9,03 / 7,82 / 7,15 | 7,00 |
| youtube | `oklch(0.76 0.141 22)` | `#fe8a88` | `oklch(0.7 0.17 22.1)` | `#f66c6d` | 8,53 / 7,38 / 6,75 | 6,55 |
| threads | `oklch(0.80 0.018 248)` | `#b5bfc9` | `oklch(0.72 0.021 250.5)` | `#9ba6b2` | 10,42 / 9,03 / 8,25 | 7,63 |
| oglasi | `oklch(0.76 0.15 60)` | `#f59740` | `oklch(0.7 0.164 59.94)` | `#e68101` | 8,72 / 7,55 / 6,90 | 6,75 |
| analitika | `oklch(0.76 0.15 305)` | `#c797fd` | `oklch(0.699 0.17 304.9)` | `#b77ff2` | 8,57 / 7,43 / 6,79 | 6,59 |
| atribucija | `oklch(0.76 0.13 190)` | `#0dcbc3` | `oklch(0.7008 0.1202 189.89)` | `#08b6af` | 9,56 / 8,28 / 7,57 | 7,48 |
| openreply | `oklch(0.76 0.125 282)` | `#a5a7fe` | `oklch(0.7 0.16 281.9)` | `#908ffe` | 8,82 / 7,64 / 6,98 | 6,78 |
| pravila | `oklch(0.76 0.15 330)` | `#e68cde` | `oklch(0.7 0.169 329.8)` | `#d773d0` | 8,47 / 7,33 / 6,71 | 6,52 |
| sistem | kao threads | `#b5bfc9` | kao threads | `#9ba6b2` | 10,42 / 9,03 / 8,25 | 7,63 |

Uz to: ink na sopstvenom `--mod-soft` ≥ 5,88; strong kao tekst (`text-primary`) ≥ 5,31 na najsvetlijoj površini.

### 2.2 Izvedeni tokeni i pravila
```css
:root { /* rezerva van modula */ --mod: var(--mod-tabla); --mod-strong: var(--mod-tabla-strong); /* + izvedeni */ }
[data-module] {
  --mod-soft: color-mix(in oklab, var(--mod) 14%, var(--surface));
  --mod-line: color-mix(in oklch, var(--mod) 45%, transparent);
  --mod-glow: color-mix(in oklch, var(--mod) 35%, transparent);
  --primary: var(--mod-strong); --ring: var(--mod); --focus-ring-strong: var(--mod);
}
[data-module="leadovi"] { --mod: var(--mod-leadovi); --mod-strong: var(--mod-leadovi-strong); }  /* × 13 */
```
Izvedeni tokeni stoje na `[data-module]`, ne na `:root`: promenljiva sa `var()` se razrešava tamo gde je deklarisana, pa bi sa korena nasledila cijan.

### 2.3 Stanje, kategorija, napredak
| Token | Vrednost | hex | Kontrast (kartica) |
|---|---|---|---|
| `--info` | `oklch(0.74 0.13 245)` | `#5db2f7` | 7,38 |
| `--{success,warning,danger,info}-soft` | `color-mix(in oklab, X 14%, var(--surface))` | `#1a333f` / `#2e3239` / `#312a3d` / `#1d2f49` | tekst stanja na njoj: 6,84 / 7,69 / 5,12 / 5,90 |
| `--{…}-line` | `color-mix(in oklch, X 45%, transparent)` | — | ukras |
| `--chart-{1,2,3,5,6}-ink` | `oklch(0.801 0.117 234.5)` / `(0.799 0.117 40.1)` / `(0.799 0.127 163.2)` / `(0.8 0.121 1.1)` / `(0.801 0.104 286.9)` | `#6acafe` / `#fea383` / `#64d7a6` / `#fe9cb9` / `#b9b4fe` | na podlozi čipa (18 % u oklab): 7,22 / 7,01 / 7,54 / 6,97 / 6,95 |
| `--xp` / `--xp-strong` | `oklch(0.84 0.16 85)` / `oklch(0.7787 0.1638 74.89)` | `#fac131` / `#f3a504` | 10,21 / 8,17; tamni tekst na `--xp` 11,45 |
| `--xp-soft`, `--xp-line` | isti obrazac | `#2e3239` | XP tekst na njoj 7,77 |
| `--streak` / `--streak-hot` | `oklch(0.72 0.184 44.8)` / `oklch(0.66 0.21 30.2)` | `#ff772f` / `#f84e3a` | 6,36 / 4,92 (hot samo kao ikonica) |
| `--tier-bronze/silver/gold/platinum/diamond` | `oklch(0.68 0.091 54.7)` / `(0.819 0.02 252.9)` / `(0.84 0.15 88.1)` / `(0.859 0.05 201)` / `(0.801 0.12 230)` | `#c48961` / `#bbc5d1` / `#f3c443` / `#abdbde` / `#60ccfc` | ≥ 5,69 |
| `--rarity-common/rare/epic/legendary` | `var(--temp-nova)` / `var(--info)` / `var(--mod-analitika)` / `var(--xp)` | slate / `#5db2f7` / `#c797fd` / `#fac131` | ≥ 5,08 |

`[data-cat="N"]` (N = 1, 2, 3, 5, 6) postavlja `--cat`, `--cat-ink`, `--cat-soft` (18 %) i `--cat-line` (45 %). Isti mehanizam kao moduli; koriste ga čip i monogram.

### 2.4 Pravila iz §4.4–§4.5 koja postaju tokeni
| Pravilo | Token / uslužna klasa |
|---|---|
| fokus broj 40 px | `--text-hero: 2.5rem` (1,05 / −0,022em / 700) → `text-hero` |
| nagrada do 600 ms, prebačaj samo za nagrade | `--duration-reward: 600ms`, `--ease-reward: cubic-bezier(.34,1.56,.64,1)`; u `lib/motion.ts`: `DUR_REWARD`, `EASE_REWARD`, `DUR_TOAST_IN .25`, `DUR_TOAST_OUT .18`, `DUR_MISSION .35`, `DUR_LEVEL_UP 1.2`, `DUR_BURST .9`; pod reduced-motion `--duration-reward: 150ms` |
| senka obojena i tiha, nikad oreol | `--shadow-mod: inset 0 1px 0 var(--material-edge), 0 10px 30px -14px var(--mod-glow)` → `shadow-mod`; `--shadow-reward` isto sa `--xp` |
| aurora ≤ 10 %, bez animacije | `.aurora` (`::before`, `radial-gradient`, 10 % `--mod`); gasi se pod `prefers-contrast: more` |
| jedna debljina ikonice 1.75 | `--icon-stroke: 1.75` + `.lucide { stroke-width: var(--icon-stroke) }` |
| dodirna meta ≥ 44 px | `--touch-min: 2.75rem` + `.touch-target` (`@media (pointer: coarse)`); samo u novim komponentama, ljuska je B3 |
| klase umesto `var()` | `@theme inline`: `--color-mod`, `-strong`, `-soft`, `-line`, `-glow`, `--color-info`, `--color-*-soft/-line`, `--color-xp*`, `--color-streak*`, `--color-tier-*`, `--color-rarity-*`, `--color-cat*` |

Stagger ostaje na postojećih 300 ms (strože od 400 ms iz §4.4).

## 3. Kako `data-module` stiže do portala
1. **`nav-items.ts`:** `MODULE_KEYS`, `ModuleKey`, polje `module` na svih 13 stavki i 17 `EXTRA_SCREENS` (`/analytics/oglasi` → `analitika`, `/ads/*` → `oglasi`, `/leadovi/uvoz` → `leadovi`…), `resolveModule(pathname)` (nepoznata ruta → `tabla`).
2. **`AppShell`:** `data-module={modul}` na koloni sadržaja (zaglavlje + `<main>`, tačno pri prvom iscrtavanju) i efekat koji upisuje `document.documentElement.dataset.module` i briše ga pri odmontiranju.
3. **Portali:** dijalog, popover, meni, tooltip i fioka se portaluju u `<body>`, dakle ispod `<html data-module>`, i nasleđuju `--mod*`, `--primary`, `--ring`. Budući toast isto.
4. **Ugnježden `data-module` radi** (vodič; u B3 svaka stavka bočne trake).

Dokaz posle koda: Playwright sonda koja za svaku rutu ispiše `html[data-module]` i izračunat `--primary` unutar otvorenog dijaloga.

## 4. Fajlovi
- **Menjam:** `CLAUDE.md` (samo sekcija „Design system", tekst iz §3.9 doslovno), `app/globals.css`, `components/app/nav-items.ts`, `components/app/app-shell.tsx`, `components/ui/button.tsx`, `components/app/system/{kpi-tile,page-header,chip,empty-state}.tsx`, `lib/motion.ts`, `scripts/{contrast-check.mjs,ux-snapshots.mjs,motion-check.ts}`.
- **Novi:** `lib/signal-colors.ts`; `components/app/system/{focus-card,monogram,chip-overflow,progress,reward-badges,mission-card,reward-toast,celebration-burst}.tsx`; `app/dev-ux/sistem/{page.tsx,vodic.tsx,force-states.ts}`; `PRODUCT.md`, `DESIGN.md` (+ prateći fajl koji `impeccable document` propiše), `nocni-run/ux/dna-boost.json`, `nocni-run/ux/kontrast-b2.md`, `nocni-run/izvestaji/B2.md`.
- **Ne diram:** `convex/`, `app-sidebar.tsx`, `mobile-nav.tsx`, nijedan poziv `KpiTile`/`StatTile`/`PageHeader`/`EmptyState`/`Chip`.

## 5. Komponente i API
Sve čitaju samo tokene, imaju stanja (učitavanje, prazno, hover, fokus, onemogućeno) i granu za reduced-motion preko `MOTION_QUERIES`.

- **Button:** `variant: default | primary | secondary | outline | ghost | destructive | link`; novo `loading?: boolean` (spiner `Loader2`, `aria-busy`, onemogućeno). `primary` je `bg-mod-strong`, tamni tekst, `shadow-mod` na hover. `secondary` je `bg-mod-soft text-mod border-mod-line`. Svako dugme nosi `data-variant=<varijanta>`.
- **PageHeader:** postojeće `description?, actions?, className?` + `variant?: "plain" | "module"` (podrazumevano `plain` = današnji izgled), `title?` (inače iz `resolveScreen`), `icon?` (inače ikonica modula), `info?` (duže objašnjenje u oblačiću). `module`: pločica 40 px, naslov 20/700, jedan red podnaslova, aurora.
- **FocusCard:** `eyebrow?, title?, children, action?, aside?, className?`; ivica 1 px u gradijentu `--mod` → `--mod-strong` → providno, `shadow-mod`.
- **KpiTile:** postojeći props + `size?: "hero" | "default" | "compact"` (`default`), `icon?`, `higherIsBetter?: boolean` (`true`), `href?`.
  - Delta je pilula na `-soft` podlozi: strelica pokazuje smer, boja dobro/loše.
  - Sparklinija je u `--mod` sa gradijentom površine; rupa se premošćuje isprekidanom tihom linijom, usamljena tačka ostaje tačka.
  - `primary` sada boji broj u `--mod`.
  - **StatTile:** isti potpis + `href?`, ikonica u `--mod-soft` pločici. `KpiTileSkeleton({ size? })`.
- **Chip:** `tone` dobija `info | module | xp`; `accent` postaje boja modula; novo `category?: 1|2|3|5|6`.
- **ChipOverflow:** `items: { key, label, category?, tone?, title? }[]`, `size?`, `className?`. Meri širinu; ceo čip ili ništa, višak u „+N" sa spiskom u `title`.
- **`lib/signal-colors.ts`:** `CategorySlot`, `SignalCategory`, `SIGNAL_CATEGORY: Record<LeadSignalKind, SignalCategory>` (iscrpno po tipu), `signalSlot(kind)`, `nicheSlot(seed)`. Sajt (8 vrsta) → 2; zakazivanje (`sajt_bez_zakazivanja`, `koristi_third_party_booking`) → 3; `visok_broj_recenzija` → 6; `samo_facebook/instagram` → 5; `novootvorena_firma` → 1; ostalo → neutralno.
- **Monogram:** `name, seed?, size?: "sm" | "md" | "lg"` (20 / 28 / 40 px); inicijali, boja po `nicheSlot`.
- **EmptyState:** postojeće + `variant?: "plain" | "mission" | "line"` (`plain`), `steps?: { label, xp?, done? }[]`. `mission`: prsten u boji modula, jedno primarno dugme, koraci sa „+50 XP". `line`: jedna linija „Još nema podataka za ovaj period".
- **ProgressRing:** `value, max?, size? (56), stroke? (6), tone?, label, children?`.
- **ProgressBar:** `value, max?, goal?, tone?, size?, label, showValue?`.
- **SegmentedMeter:** `segments: { label, done, hint? }[], tone?, label`.
  - Za sva tri: `tone: module | xp | success | warning | danger | info`, `role="progressbar"` i broj uz boju.
- **XpBar:** `xp, from, to, level?, compact?` („1.240 / 1.500 XP").
- **LevelBadge:** `level, tier, rank?, size?`.
- **StreakFlame:** `days, state?: active | at-risk | idle, size?`.
- **AchievementBadge:** `icon, title, description?, rarity, locked?, unlockedAt?, size?`.
- **MissionCard:** `title, icon?, value, max, xp, done?, featured?, action?`. Prelaz u „Završeno" se animira samo kad se `done` promeni dok je kartica na ekranu.
- **RewardToast:** `title, xp?, icon?, tone?: xp | achievement | level, duration?, onDismiss`. Ulaz 250 ms, izlaz 180 ms; +XP 2,5 s, ostalo 4 s.
- **RewardToastViewport:** `children` (najviše 3, `aria-live="polite"`).
- **CelebrationBurst:** `trigger: number, tone?: xp | module, count? (14)`. GSAP čestice do 900 ms, `pointer-events: none`, pod reduced-motion ništa; ne pali se pri montiranju.

Nijedan primitiv se ne animira sam pri otvaranju. Prsten i traka se pomere samo kad se vrednost promeni.

## 6. Živi vodič — `/sistem?ux=1`
`app/dev-ux/sistem/page.tsx` (404 u produkciji) + `vodic.tsx`. Stoji van `AppShell`-a, ima `<main>` i birač modula koji postavlja `data-module` i na `<html>`.

Sekcije:
- tokeni (moduli, stanja, kategorije, napredak, tipografija, pokret);
- mreža 13 modula × 7 varijanti dugmeta × mirno / hover / fokus / onemogućeno / učitava;
- pločice u tri veličine (sa deltom, bez nje, „—", `href`, rupe u sparkliniji);
- čipovi signala, `ChipOverflow`, monogrami;
- PageHeader v2 i FocusCard;
- prazna stanja (tri varijante);
- napredak u akciji (dugmad koja pomeraju vrednost, završavaju misiju, pale toast i prasak);
- proba portala (dijalog, popover, tooltip).

Hover i fokus u mreži: `force-states.ts` u vodiču klonira `:hover` / `:focus-visible` pravila u `[data-force]`, pa nema dupliranja klasa u primitivu. Ako to ne proradi sa ugnježdenim CSS-om, kolone postaju „uživo", a stanja dokazuje Playwright sonda.

`scripts/ux-snapshots.mjs` dobija ekran `{ ime: "sistem", putanja: "/sistem", samoB: true }`.

## 7. `scripts/contrast-check.mjs`
- Čita `oklch()` i `color-mix(in oklch | oklab | srgb)`, uključujući `transparent`; izvedene tokene računa iz samog `[data-module]` pravila.
- Novi parovi:
  - ink modula × 3 površine (39);
  - tamni tekst na strong (13);
  - ink na `--mod-soft` (13);
  - strong kao tekst × 3 (39);
  - XP × 3, tamni tekst na XP, XP na `--xp-soft`;
  - tekst čipa kategorije na svojoj podlozi (5);
  - stanje na svojoj `-soft` (4) i `--info` × 3;
  - niz, rang i retkost kao grafika (3:1).
- `line-soft`, `line`, `line-strong` i `--mod-line` postaju informativni redovi i ne broje se u pad. Komentar u skripti to već kaže za razdelnike.
- `node scripts/contrast-check.mjs --strogo --out nocni-run/ux/kontrast-b2.md` mora da izađe sa 0.
- Pretvarač proveravam prema pregledaču (izračunata boja za tri tokena).

## 8. Redosled rada
1. `impeccable init` → `PRODUCT.md`; učitam `gsap-core`, `gsap-react`, `impeccable` reference i `craft-floor.md`.
2. `CLAUDE.md` sekcija.
3. `globals.css` + `lib/motion.ts` + `contrast-check.mjs`; kontrast mora proći pre komponenti.
4. `nav-items.ts` + `AppShell`.
5. Button, Chip, `signal-colors`, ChipOverflow, Monogram.
6. KpiTile, PageHeader, FocusCard, EmptyState.
7. Primitivi napretka, pa bedževi, MissionCard, RewardToast, CelebrationBurst.
8. Vodič + stavka u snimcima; `motion-check.ts` (paritet novih tokena; `EASE_REWARD` uvoze samo nagradne komponente).
9. `typecheck`, `lint`, `verify:pokret`, `verify:brojevi`, kontrast.
10. Snimci `--faza b2` (ceo skup, zbog poređenja sa `b1-log.json`). Gledam vodič, Kontrolnu tablu, Leadove, Instagram i Podešavanja na 1536×695 i 390×844; jedna tura popravki, jedna potvrda.
11. `design-dna` → `dna-boost.json`; `impeccable document` → `DESIGN.md`; pre-delivery lista nad vodičem; `impeccable detect.mjs`.
12. `npm run build` jednom (nova ruta i tokeni idu na produkciju), izveštaj, commit `feat(ux): dizajn sistem 2.0 - boje modula, hijerarhija, primitivi napretka [B2]`. Push radi runner.

## 9. Odluke koje su moje (precrtaj koju nećeš)
1. **`-soft` se meša u `oklab`, ne u `oklch`.** U `oklch` nijansa rotira: `--warning-soft` ispadne tirkizno `#0f364c`, a podloga Oglasa ljubičasto `#2d2b4b`. U `oklab` su `#2e3239` i `#2f2e38`. `-line` i `-glow` ostaju `oklch`.
2. **`--focus-ring-strong` prati modul**, uz `--primary` i `--ring`. Vidljivi okvir fokusa čita baš taj token.
3. **PageHeader v2 je `variant="module"`, podrazumevano `plain`.** Automatski bi presekao postojeće opise duže od jednog reda i duplirao naslov iz gornje trake do B3.
4. **„Misija za start" je `variant="mission"`.** Na Leadovima je boja modula zelena, pa bi svako postojeće prazno stanje izgledalo kao proslava.
5. **`default` dugme ostaje** i preko `--primary` dobija boju modula. Hover posvetljuje umesto `/80`, jer sa `/80` tamni tekst pada na 4,47 za Instagram, YouTube i Pravila.
6. **Monogrami i signali bez `chart-4`** (amber je preblizu zlatnoj).
7. **`LevelBadge` prima `tier` spolja**; preslikavanje nivoa u rang je B4.
8. **Vodič je van `AppShell`-a**, kao statički segment pored `[[...slug]]`.
9. **Tabla ink je `oklch(0.7812 0.1295 235.77)`**, jer je vrednost iz plana 0,2 % van sRGB-a. Facebook i OpenReply ink daju hex za jedinicu različit od tabele (`#80b3fd`, `#a5a7fe`).
10. **`.lucide { stroke-width: 1.75 }` važi globalno**; pre toga grep za namerno drugačije debljine.
11. **Van `AppShell`-a `--primary` ostaje cijan** (prijava, pozivnica i privatnost se ne menjaju).
12. **RewardToast je prezentacioni**; hook `useNapredakFeedback` je B5.

## 10. Rizici
- **`--primary` menja boju odmah na svim ekranima:** 106 dugmadi, 50 `text-primary`, prekidači i checkbox-ovi. Na Podešavanjima i Threads-u postaju sivi; ako „uključeno" ne čita, prijavljujem u izveštaju sa snimkom.
- **Prelazno stanje:** 867 `accent-400` ostaje cijan pored boje modula do B6–B9.
- **`--warning` (`#fbbf24`) i `--xp` (`#fac131`) su ista boja** (ΔE 0,6), a plan traži da zlatna bude samo nagrada. Tokene ne menjam; razliku nose ikonica i natpis „XP". Treba tvoja odluka.
- **Bliske nijanse:** `--info` je blizu Facebook plave i cijana table (ΔE 3,6 / 4,6); leadovi ≈ `--success` (ΔE 2,6, namerno po planu).
- **ProgressRing animira `stroke-dashoffset`**, što nije `transform`/`opacity`. Dokumentovan izuzetak, kao `Unfold` i `Materialize`; pri otvaranju se ne animira.
- **`force-states.ts`** zavisi od CSSOM-a za ugnježdena pravila; rezerva je u §6.
- **Zaglavljen `next dev`** blokira snimke; važi pravilo iz `_zajednicki-rep.md` (taskkill, inače `NEUSPEH`).
- **`impeccable detect`** će prijaviti prebačaj u `--ease-reward`; nameran je.
- **`ChipOverflow`** koristi `ResizeObserver` po redu; trošak u tabeli od 25 redova meri B7.

## 11. Provera
- `npm run typecheck`; `npm run lint` (0 novih poruka); `verify:pokret`, `verify:brojevi`.
- `contrast-check --strogo` = 0 padova.
- Grep: 0 hex i 0 sirovih Tailwind boja u novim fajlovima.
- `b2-log.json`: 0 grešaka u konzoli, preliv isti ili manji nego u `b1`.
- Sonda: `data-module` po ruti i u portalu.
- `npm run build`.
- `PRODUCT.md`, `DESIGN.md` i `dna-boost.json` postoje i slažu se sa §2.