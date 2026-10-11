---
name: Enigma Command Center
description: Kontrolna soba koja te vodi — tamna radna tabla u kojoj boja kaže gde si, a napredak se vidi.
colors:
  page: "#070d19"
  section: "#0b1221"
  surface: "#131d31"
  surface-raised: "#18253a"
  text-primary: "#f3f7ff"
  text-secondary: "rgba(193, 211, 245, 0.75)"
  text-muted: "rgba(152, 174, 214, 0.8)"
  text-inverse: "#091120"
  line: "rgba(96, 128, 180, 0.28)"
  line-control: "rgba(136, 170, 224, 0.6)"
  mod-tabla: "oklch(0.7812 0.1295 235.77)"
  mod-tabla-strong: "oklch(0.754 0.139 232.7)"
  mod-leadovi: "oklch(0.76 0.15 155)"
  mod-leadovi-strong: "oklch(0.6997 0.1703 154.9)"
  mod-novosti: "oklch(0.76 0.15 122)"
  mod-novosti-strong: "oklch(0.6992 0.1672 121.7)"
  mod-instagram: "oklch(0.76 0.15 355)"
  mod-instagram-strong: "oklch(0.701 0.171 354.9)"
  mod-facebook: "oklch(0.76 0.121 258)"
  mod-facebook-strong: "oklch(0.7 0.158 258)"
  mod-youtube: "oklch(0.76 0.141 22)"
  mod-youtube-strong: "oklch(0.7 0.17 22.1)"
  mod-threads: "oklch(0.8 0.018 248)"
  mod-threads-strong: "oklch(0.72 0.021 250.5)"
  mod-oglasi: "oklch(0.76 0.15 60)"
  mod-oglasi-strong: "oklch(0.7 0.164 59.94)"
  mod-analitika: "oklch(0.76 0.15 305)"
  mod-analitika-strong: "oklch(0.699 0.17 304.9)"
  mod-atribucija: "oklch(0.76 0.13 190)"
  mod-atribucija-strong: "oklch(0.7008 0.1202 189.89)"
  mod-openreply: "oklch(0.76 0.125 282)"
  mod-openreply-strong: "oklch(0.7 0.16 281.9)"
  mod-pravila: "oklch(0.76 0.15 330)"
  mod-pravila-strong: "oklch(0.7 0.169 329.8)"
  mod-sistem: "oklch(0.8 0.018 248)"
  mod-sistem-strong: "oklch(0.72 0.021 250.5)"
  success: "#34d399"
  warning: "#fbbf24"
  danger: "#fb7185"
  info: "oklch(0.739 0.13 245.4)"
  chart-1: "#1c9dd6"
  chart-2: "#d95926"
  chart-3: "#199e70"
  chart-4: "#c98500"
  chart-5: "#d55181"
  chart-6: "#9085e9"
  xp: "oklch(0.84 0.16 85)"
  xp-strong: "oklch(0.7787 0.1638 74.89)"
  streak: "oklch(0.72 0.184 44.8)"
  streak-hot: "oklch(0.66 0.21 30.2)"
  tier-bronze: "oklch(0.68 0.091 54.7)"
  tier-silver: "oklch(0.819 0.02 252.9)"
  tier-gold: "oklch(0.84 0.15 88.1)"
  tier-platinum: "oklch(0.859 0.05 201)"
  tier-diamond: "oklch(0.801 0.12 230)"
typography:
  display:
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2rem, 1.5rem + 2.5vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.022em"
  hero:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "2.5rem"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.022em"
  headline:
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  ui:
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0.005em"
  label:
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "0.01em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  gutter: "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.mod-leadovi-strong}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.mod-leadovi}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.page}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  chip:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "28px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  kpi-tile:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
    height: "160px"
---

# Design System: Enigma Command Center

Izvor istine za vrednosti je `app/globals.css`; ovaj fajl opisuje kako se
primenjuju. Uži skup pravila koji važi za svaki zadatak stoji u `CLAUDE.md`
(„Design system"). Sve se vidi uživo na `/sistem?ux=1` (samo u razvoju), a
kontrasti se mere sa `node scripts/contrast-check.mjs`.

## Overview

**Creative North Star: "Kontrolna soba koja te vodi"**

Otvoriš aplikaciju i za tri sekunde znaš gde si, šta je najvažnije, šta
sledeće da klikneš i koliko si napredovao. Soba je i dalje inženjerski
precizna, tamna i gusta, ali je svetlo upaljeno: svaki modul ima svoju
lampicu, napredak svetli, a zlatna se pali samo kad je nešto zarađeno.

Ovo je radna tabla koja se otvara deset puta dnevno, ne sajt koji se
posećuje jednom. Zato je sve što bi privlačilo pažnju bez razloga izbačeno:
nema ukrasnih gradijenata, nema beskonačnih animacija, nema kutije u kutiji.
Ono što ostaje nosi informaciju. Gamifikacija je za odrasle: prstenovi, niz
i nivoi, bez crtanog filma.

**Key Characteristics:**
- Boja kaže gde si: trinaest modula, trinaest boja iste svetline i hrome.
- Jedan fokus i jedno primarno dugme po pogledu.
- Manje teksta, više signala: čip, pilula, prsten, monogram.
- Svaka radnja ostavi trag napretka; napredak nikad ne blokira posao.
- Tačnost pobeđuje efekat: broj na ekranu je uvek broj iz podatka.

## Colors

Tamna teget osnova i boja sa tačno četiri uloge. Boja bez jedne od njih se ne
dodaje.

### Primary — MESTO (boja modula)
Svaki modul ima par: **ink** (L 0.76, C ≈ 0.15) za ikonice, tekst-akcenat,
linije i okvir fokusa, i **strong** (L 0.70, C ≈ 0.17) za punu podlogu
primarnog dugmeta i bedža, uvek sa tamnim tekstom `#091120`.

- **Brend cijan — Kontrolna tabla** (`#58c4ff` / `#38bdf8`)
- **Zelena — Leadovi** (`#52cd86` / `#11bc6d`): „pozovi", rast
- **Limeta — Novosti** (`#a1c047` / `#8ead09`)
- **Roze — Instagram** (`#fa86b6` / `#ed6ba4`)
- **Plava — Facebook** (`#80b3fd` / `#5c9eff`)
- **Crvena — YouTube** (`#fe8a88` / `#f66c6d`)
- **Siva — Threads i Podešavanja** (`#b5bfc9` / `#9ba6b2`)
- **Narandžasta — Oglasi** (`#f59740` / `#e68101`): potrošnja
- **Ljubičasta — Analitika** (`#c797fd` / `#b77ff2`): uvid
- **Tirkiz — Atribucija** (`#0dcbc3` / `#08b6af`): veze
- **Indigo — OpenReply** (`#a5a7fe` / `#908ffe`)
- **Fuksija — Pravila** (`#e68cde` / `#d773d0`)

Komponenta nikad ne čita ove vrednosti. Čita `--mod`, `--mod-strong`,
`--mod-soft` (14 % u `--surface`, mešano u oklab), `--mod-line` (45 %) i
`--mod-glow` (35 %), odnosno klase `text-mod`, `bg-mod-strong`, `bg-mod-soft`,
`border-mod-line`. Postavlja ih `data-module` na koloni sadržaja i na
`<html>`, pa boju nasleđuju i dijalozi, meniji i toastovi. Unutar modula
`--primary` je strong, a `--ring` i okvir fokusa su ink.

### Secondary — STANJE
- **Uspeh** (`#34d399`), **Upozorenje** (`#fbbf24`), **Greška** (`#fb7185`),
  **Info** (`#5db2f7`). Svako ima `-soft` podlogu (14 %) i `-line` ivicu
  (45 %).
- **Temperatura leada**: nova `#7b8eb0`, hladno `#1c9dd6`, toplo `#c98500`,
  vruće `#f0604f` — ista na mapi, u tabeli i u profilu (`lib/temperature.ts`).

### Tertiary — KATEGORIJA i NAGRADA
- **Kategorija**: validirana paleta `--chart-1..6` za serije grafikona,
  čipove signala i monograme niša. Mapiranje je na jednom mestu,
  `lib/signal-colors.ts`: sajt → 2, reputacija → 6, zakazivanje → 3, društvene
  mreže → 5, nova firma → 1, ostalo neutralno. Tekst čipa je posvetljena
  varijanta (`--chart-N-ink`, L 0.80).
- **Nagrada**: XP zlatna (`#fac131` → `#f3a504`), niz (`#ff772f` →
  `#f84e3a`), rangovi (bronza `#c48961`, srebro `#bbc5d1`, zlato `#f3c443`,
  platina `#abdbde`, dijamant `#60ccfc`) i retkost dostignuća.

### Neutral
- **Strana** (`#070d19`), **kartica** (`#131d31`), **podignuto** (`#18253a`).
- **Tekst** (`#f3f7ff`), sekundarni (75 %), prigušeni (80 % tišeg tona).
- **Linije**: razdelnik `--line` (28 %), granica kontrole `--line-control`
  (60 %, ≥ 3:1).

### Named Rules
**Pravilo četiri uloge.** Mesto, stanje, kategorija, nagrada. Ako boja nema
jednu od njih, ne dodaje se.

**Pravilo zlatne.** Zlatna je samo nagrada. Nijedan modul ni kategorija je ne
koristi; čipovi i monogrami zato preskaču amber (slot 4).

**Pravilo dva nosioca.** Boja nikad nije jedini nosilac značenja: delta ima
strelicu, prsten ima broj, stanje ima ikonicu ili tekst.

**Pravilo tokena.** U komponentama nema heksa ni sirovih Tailwind boja
(`slate-*`, `cyan-*`).

## Typography

**Display Font:** Aeonik (uz ui-sans-serif, system-ui)
**Body Font:** Aeonik
**Label/Mono Font:** ui-monospace, SF Mono, Menlo, Consolas — za metričke brojke

**Character:** Jedno pismo u tri težine (300 / 400 / 700); hijerarhiju nose
veličina i težina, ne drugo pismo. Brojke su mono i tabularne, pa se kolone
poravnavaju i brojač ne pomera susede.

### Hierarchy
- **Display** (700, 32–56 px fluidno, 1.05): samo ekran prijave.
- **Hero** (700, 40 px, 1.05, mono): jedini fokus broj ekrana, u boji modula.
- **Headline / metric** (700, 28 px, 1.1): brojka na pločici.
- **Title** (700, 20 px, 1.25): naslov ekrana, kartice i sekcije.
- **Body / copy** (400, 15 px, 1.5): tekst, naziv firme u redu.
- **UI** (400, 13 px, 1.45): ćelije tabele, kontrole, opisi.
- **Label / meta** (400, 12 px, 1.35): natpisi, čipovi, ose. Natpis sekcije
  je verzal sa razmakom 0.12em.

### Named Rules
**Pravilo jednog reda.** Podnaslov ekrana je jedan red, do 90 znakova. Duže
objašnjenje ide iza dugmeta „i".

**Pravilo skale.** Ništa nije 11, 14, 16, 18 ni 24 px; stok Tailwind koraci su
preslikani na skalu.

## Layout

Sadržaj je u koloni širine najviše 80rem sa razmakom od 1.5rem, pored fiksne
bočne trake od 15rem i ispod lepljive gornje trake od 4rem. Mreže pločica idu
od 2 do 5 kolona. Komandni centar je asimetričan: prva nezavršena misija je
široka (2fr) i nosi primarno dugme, druge dve su uže (1fr). Ispod 768 px sve
pada u jednu kolonu, bez vodoravnog klizanja.

Sekundarne grupe se odvajaju razdelnikom i razmakom, ne kutijom. Fokus ekrana
i njegovo primarno dugme moraju da stanu iznad preloma na 1536×695, što je
vlasnikov stvarni prikaz. Referentni prikazi su još 1440×900 i 390×844.
Dodirne mete na telefonu su najmanje 44 px (`.touch-target`).

## Elevation & Depth

Hibrid: površine se penju u svetlini (strana → kartica → podignuto), a senka
dodaje odvajanje u četiri koraka. Hrom (bočna i gornja traka) je translucentan
materijal sa svetlom ivicom.

### Shadow Vocabulary
- **elev-1** (`0 1px 2px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.2)`): kartice i pločice.
- **elev-2** (`0 4px 10px rgba(0,0,0,.34), 0 12px 32px rgba(0,0,0,.3)`): meniji, popoveri, toast.
- **elev-3** (`0 8px 20px rgba(0,0,0,.42), 0 32px 72px rgba(0,0,0,.5)`): dijalozi i fioke.
- **shadow-mod** (`inset 0 1px 0 var(--material-edge), 0 10px 30px -14px var(--mod-glow)`): fokus kartica i primarno dugme na hover.
- **shadow-reward** (isto, sa `--xp-glow`): nagrade.

### Named Rules
**Pravilo oreola.** Sjaj je obojena senka sa pomerajem. Oreol `0 0 Npx` ne
postoji.

**Pravilo četiri dozvole.** Gradijent i sjaj samo za: napredak (prsten, traka,
merač), fokus karticu, nagrade i auroru na vrhu strane (≤ 10 %, bez
animacije). Nikad na tekstu, redovima tabele ni proizvoljnim karticama.

## Shapes

Zaobljeni pravougaonici: 6 px čip, 8–10 px dugme i polje, 14 px kartica i
dijalog. Pune pilule su samo delta, bedž sa brojem i status. Ivica je uvek
1 px. Posebni oblici nose značenje i ne mešaju se: monogram firme je zaobljen
kvadrat, dostignuće krug, nivo heksagon, napredak prsten. Ikonice su lucide,
jedne debljine linije (1.75), u veličinama 16 / 20 / 24; emodžija nema.

## Components

### Buttons
- **Shape:** visina 28–32 px, radijus 8–10 px; svako dugme nosi `data-variant`.
- **Primary:** puna `--mod-strong`, tamni tekst. **Jedno po pogledu** (ekran, dijalog, fokus kartica).
- **Secondary:** `--mod-soft` podloga, `--mod` tekst, `--mod-line` ivica — prateće radnje.
- **Outline / Ghost:** neutralno; alati i filteri, odnosno radnje u redu tabele (ikonice koje se pokažu na hover ili fokus reda).
- **Destructive:** tinta greške; uvek uz potvrdu.
- **Default:** zatečeno puno dugme; boju modula dobija kroz `--primary`. Ekrani ga zamenjuju sa primary ili secondary kako se sele.
- **Hover / Focus:** hover posvetljuje podlogu (nikad ne potamnjuje — tamni tekst bi pao ispod 4,5:1), primarno dobija `shadow-mod`. Fokus je okvir od 2 px u ink boji modula sa odmakom 2 px. Pritisak utisne dugme na 0,97 za 100 ms.
- **Loading:** `loading` onemogući dugme i doda spiner.

### Chips
- **Style:** radijus 6 px, ivica 1 px, 12 ili 13 px. Ton je uloga: `module`, stanje (`success` / `warning` / `danger` / `info`), `category` (slot palete) ili `xp`.
- **State:** sa `onClick` je dugme (`aria-pressed`); uključen filter ima ivicu u boji modula.
- **Overflow:** `ChipOverflow` — čip stane ceo ili ga nema; višak je „+N" sa spiskom u oblačiću.

### Cards / Containers
- **Corner Style:** 14 px.
- **Background:** `--surface`; podignuto `--surface-raised`.
- **Shadow Strategy:** `elev-1`; obojena senka samo na fokus kartici.
- **Border:** prsten `--line`; klikabilna kartica na hover dobija `--mod-line` i podigne se 2 px.
- **Internal Padding:** 16–20 px.
- Kartica samo kad elevacija nosi hijerarhiju: fokus, misija, firma, objava.

### Inputs / Fields
- **Style:** tamna podloga, granica `--line-control`, radijus 8 px.
- **Focus:** ivica i prsten u boji modula.
- **Error / Disabled:** ivica greške sa prstenom 20 %; onemogućeno na 50 %.

### Navigation
Bočna traka sa grupama i podstavkama, gornja traka (naslov, period, ⌘K,
zvono) i donja traka na telefonu. Svaka stavka u `nav-items.ts` nosi `module`;
ruta tako određuje boju cele strane.

### PageHeader
`plain` (podrazumevan): opis levo, radnje desno. `module`: pločica 40 px sa
ikonicom modula, naslov 20 / 700, jedan red podnaslova, radnje desno, aurora
iza.

### FocusCard
Jedna po ekranu: ivica od 1 px u gradijentu `--mod` → `--mod-strong` →
providno, `shadow-mod`, natpis u boji modula, sadržaj i jedno dugme.

### KpiTile
Tri veličine: `hero` (40 px, broj u boji modula), `default` (28 px),
`compact` (20 px, bez linije). Delta je pilula: strelica je smer, boja je
ocena (`higherIsBetter={false}` za CPA i potrošnju). Sparklinija je u boji
modula i preko dana bez merenja ide isprekidano. Sa `href` je cela pločica
link. Kad mere nema: „—" i razlog.

### EmptyState
`plain` ne slavi prazninu. `mission` („Misija za start") je za ekran koji još
nema podataka: prsten u boji modula, jedno primarno dugme, koraci sa XP-om.
`line` zamenjuje red pločica kad su sve nule.

### Progress i nagrade
`ProgressRing`, `ProgressBar` (sa oznakom cilja), `SegmentedMeter`, `XpBar`,
`LevelBadge`, `StreakFlame`, `AchievementBadge`, `MissionCard`, `RewardToast`,
`CelebrationBurst`. Uz svaki merač stoji broj. Pri otvaranju ekrana se ništa
ne pomera; merač se pomeri kad se vrednost promeni.

### Motion
GSAP `useGSAP` unutar `gsap.matchMedia()` sa granom za reduced-motion.
„Corporate" za ceo UI: `--ease-ui` (`cubic-bezier(.2,.8,.2,1)`), 100 ms
pritisak, 150–200 ms sve što se pojavi. „Playful" samo za nagradu:
`--ease-reward` (`cubic-bezier(.34,1.56,.64,1)`), do 600 ms; čestice do
900 ms; nov nivo do 1,2 s. Toast: ulaz 250 ms, izlaz 180 ms.

## Do's and Don'ts

### Do:
- **Do** čitaj boju mesta isključivo kroz `--mod*` (`text-mod`, `bg-mod-soft`, `border-mod-line`).
- **Do** stavi tačno jedno `primary` dugme po pogledu; ostalo je `secondary`, `outline` ili `ghost`.
- **Do** daj svakom ekranu jednu fokus zonu: broj od 40 px ili karticu misije.
- **Do** uz boju uvek stavi ikonicu, broj ili tekst.
- **Do** piši „—" i razlog kad podatka nema.
- **Do** izmeri kontrast: tekst ≥ 4,5:1, kontrole i grafika ≥ 3:1.
- **Do** animiraj samo `transform` i `opacity`, najviše 1–2 elementa po prikazu.

### Don't:
- **Don't** piši heks ni sirove Tailwind boje u komponentama.
- **Don't** koristi zlatnu za bilo šta osim nagrade.
- **Don't** stavljaj gradijent ili sjaj na tekst, redove tabele ili proizvoljne kartice.
- **Don't** pravi oreol (`0 0 Npx`) ni kutiju u kutiji.
- **Don't** animiraj sekcije radnog ekrana pri učitavanju, i ne uvodi beskonačne animacije osim spinera.
- **Don't** koristi prebačaj van nagrade.
- **Don't** slavi prazninu: prazna lista nije vest da je posao gotov.
- **Don't** prikazuj XP bez događaja u bazi, ni broj koji nije iz podatka.
- **Don't** ostavljaj interne oznake plana u tekstu koji korisnik vidi.
