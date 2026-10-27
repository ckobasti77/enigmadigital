---
name: Enigma Command Center
description: Radni sto, ne izveštaj — miran tamni panel na kom svetli samo ono što traži Jovana, a brojevi i statusi su tačni.
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
  action: "#58c4ff"
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
    fontFamily: "Aeonik, ui-sans-serif, system-ui, sans-serif"
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
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "0em"
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
    backgroundColor: "{colors.action}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.page}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.action}"
    rounded: "{rounded.lg}"
    padding: "0"
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
(„Design system"). Odluke iza ovog dokumenta su u `docs/ULTRA-PLAN.md` (§1 i
§3), a ciljni profil je `docs/ultra/dna-cilj.json`. Sve se vidi uživo na
`/sistem?ux=1` (samo u razvoju), a kontrasti se mere sa
`node scripts/contrast-check.mjs`.

Ovo je **cilj**. Kod ga sustiže u koracima: temelj (boja radnje, uloge
dugmeta, dodir, tipografija, kontrast, mono, meni za izbor, formati, rečnik)
u prvom runu, a novi ekrani i navigacija posle. Gde opis komponente kaže
„zatečeno", tako radi kod danas i to se menja kad dođe njegova faza.

## Overview

**Creative North Star: "Radni sto, ne izveštaj"**

Prethodni profil je bio kontrolna soba u kojoj svaki pult ima svoju lampicu, i
lampice su bile upaljene svuda. Cilj je miran radni sto: svetli samo ono što
traži Jovana. Otvoriš aplikaciju i odmah vidiš posao — sledeću firmu, prvi
upit, red koji čeka — a broju i statusu na ekranu možeš da veruješ.

Ovo je radna tabla koja se otvara deset puta dnevno, ne sajt koji se posećuje
jednom. Zato je sve što bi privlačilo pažnju bez razloga izbačeno: nema
ukrasnih gradijenata, nema beskonačnih animacija, nema kutije u kutiji, nema
lampice modula na svakoj pločici. Ono što ostaje nosi informaciju.
Gamifikacija je tiha i odrasla: nedeljni ciljevi i niz, bez crtanog filma.

**Key Characteristics:**
- Fokus ekrana je posao, nikad nagrada.
- Boja modula kaže gde si, i to samo na tri mesta; jedna boja radnje kaže šta
  da klikneš.
- Jedan fokus i jedno primarno dugme po pogledu.
- Jedan status po vezi; broj koji nije izmeren je „—" sa razlogom.
- Gusto i mirno: liste i tabele, kartica samo za ono što se pomera.
- Tačnost pobeđuje efekat: broj na ekranu je uvek broj iz podatka.

## Colors

Tamna teget osnova i boja sa tačno šest uloga: mesto, radnja, stanje,
kategorija, nagrada i identitet projekta. Boja bez jedne od njih se ne dodaje.

### MESTO (boja modula)
Svaki modul ima par: **ink** (L 0.76, C ≈ 0.15) i **strong** (L 0.70,
C ≈ 0.17). Boja modula kaže „gde si", a ne „šta da klikneš", i stoji **samo**
na tri mesta:

1. aktivna stavka bočne trake (pločica modula u punoj boji, tamna ikonica);
2. ikonica u zaglavlju ekrana;
3. aurora na vrhu strane (≤ 10 %, bez animacije).

Nikad na naslovu, broju (FocusCard, KpiTile, fokus kanala), natpisu pločice,
grafikonu, dugmetu, prekidaču ni sjaju.

- **Brend cijan — Kontrolna tabla** (`#58c4ff` / `#38bdf8`)
- **Zelena — Leadovi** (`#52cd86` / `#11bc6d`)
- **Limeta — Novosti** (`#a1c047` / `#8ead09`)
- **Roze — Instagram** (`#fa86b6` / `#ed6ba4`)
- **Plava — Facebook** (`#80b3fd` / `#5c9eff`)
- **Crvena — YouTube** (`#fe8a88` / `#f66c6d`)
- **Siva — Threads i Podešavanja** (`#b5bfc9` / `#9ba6b2`)
- **Narandžasta — Oglasi** (`#f59740` / `#e68101`)
- **Ljubičasta — Analitika** (`#c797fd` / `#b77ff2`)
- **Tirkiz — Atribucija** (`#0dcbc3` / `#08b6af`)
- **Indigo — OpenReply** (`#a5a7fe` / `#908ffe`)
- **Fuksija — Pravila** (`#e68cde` / `#d773d0`)

Komponenta nikad ne čita ove vrednosti. Čita `--mod`, `--mod-strong`,
`--mod-soft` (14 % u `--surface`, mešano u oklab), `--mod-line` (45 %) i
`--mod-glow` (35 %), odnosno klase `text-mod`, `bg-mod-strong`, `bg-mod-soft`,
`border-mod-line` — i to samo na tri dozvoljena mesta. Postavlja ih
`data-module` na koloni sadržaja i na `<html>`.

*Zatečeno u kodu, kao odstupanje koje temelj ispravlja:* `app/globals.css`
unutar `[data-module]` još preslikava `--primary` na `--mod-strong` i `--ring`
na `--mod`, a neaktivne stavke bočne trake su u tinti svog modula.

### RADNJA (jedna boja primarne radnje)
**Jedna boja primarne radnje u celoj aplikaciji:** brend cijan `--accent-400`
(`#58c4ff`) sa tamnim tekstom `#091120`, na svakom ekranu ista. `primary` više
ne čita `--mod-strong`. Boju radnje nose: primarno dugme, dugme-veza, uključen
prekidač (`Switch`) i okvir fokusa. Nije boja stanja ni nagrade.

### STANJE
- **Uspeh** (`#34d399`), **Upozorenje** (`#fbbf24`), **Greška** (`#fb7185`),
  **Info** (`#5db2f7`). Svako ima `-soft` podlogu (14 %) i `-line` ivicu
  (45 %).
- **Crvena** je samo greška i kašnjenje. **Žuta** je upozorenje. Ništa od toga
  nije oznaka „vruć lead".
- **Interes leada** (visok, srednji, nizak) zamenjuje Hot/Warm/Cold u kasnijem
  runu. Interes nije boja ivice reda. *Zatečeno:* tokeni temperature (nova
  `#7b8eb0`, hladno `#1c9dd6`, toplo `#c98500`, vruće `#f0604f`,
  `lib/temperature.ts`) i dalje boje pinove mape.

### KATEGORIJA
Validirana paleta `--chart-1..6` za serije grafikona, čipove signala,
monograme niša i sparklinije. Mapiranje je na jednom mestu,
`lib/signal-colors.ts`: sajt → 2, reputacija → 6, zakazivanje → 3, društvene
mreže → 5, nova firma → 1, ostalo neutralno. Tekst čipa je posvetljena
varijanta (`--chart-N-ink`, L 0.80). Grafikon nikad nije u boji modula.

### NAGRADA
XP zlatna (`#fac131` → `#f3a504`), niz (`#ff772f` → `#f84e3a`), rangovi
(bronza `#c48961`, srebro `#bbc5d1`, zlato `#f3c443`, platina `#abdbde`,
dijamant `#60ccfc`) i retkost dostignuća. Na radnim ekranima zlatna se pali
samo u trenutku nagrade (nov nivo, dostignuće, zbir na kraju ture); na strani
Napredak nosi XP, nivo i dostignuća.

### IDENTITET PROJEKTA
Kaže *čiji* je ekran, nikad gde si u njemu. Dolazi iz podatka
(`workspaces.brend.boja`) kroz `lib/boja-projekta.ts`; element koji je
postavlja nosi `data-projekat` i čita `--projekat`, `--projekat-tekst`,
`--projekat-soft`. Stoji samo na biraču projekta, znaku projekta
(`ProjekatZnak`), traci od 2 px na vrhu ljuske i ekranu prijave.

### Neutral
- **Strana** (`#070d19`), **kartica** (`#131d31`), **podignuto** (`#18253a`).
- **Tekst** (`#f3f7ff`), sekundarni (75 %), prigušeni (80 % tišeg tona).
- **Linije**: razdelnik `--line` (28 %), granica kontrole `--line-control`
  (60 %, ≥ 3:1).

### Named Rules
**Pravilo šest uloga.** Mesto, radnja, stanje, kategorija, nagrada, identitet.
Ako boja nema jednu od njih, ne dodaje se.

**Pravilo jedne radnje.** Postoji jedna boja primarne radnje, ista na svakom
ekranu. Boja modula se nikad ne klikće.

**Pravilo tri mesta.** Boja modula: aktivna stavka bočne trake, ikonica
zaglavlja, aurora. Nigde drugde.

**Pravilo zlatne.** Zlatna je samo nagrada. Nijedan modul ni kategorija je ne
koristi; čipovi i monogrami zato preskaču amber (slot 4).

**Pravilo dva nosioca.** Boja nikad nije jedini nosilac značenja: delta ima
strelicu, prsten ima broj, stanje ima ikonicu ili tekst.

**Pravilo tokena.** U komponentama nema heksa ni sirovih Tailwind boja
(`slate-*`, `cyan-*`).

## Typography

**Display Font:** Aeonik (uz ui-sans-serif, system-ui)
**Body Font:** Aeonik
**Mono Font:** ui-monospace, SF Mono, Menlo, Consolas — samo ID, kod i
brojčane kolone tabela

**Character:** Jedno pismo u tri težine (300 / 400 / 700); hijerarhiju nose
veličina i težina, ne drugo pismo. Brojevi su Aeonik sa `tabular-nums`, pa se
kolone poravnavaju i brojač ne pomera susede.

### Hierarchy
- **Display** (700, 32–56 px fluidno, 1.05): samo ekran prijave.
- **Hero** (700, 40 px, 1.05, Aeonik `tabular-nums`): jedini fokus broj
  ekrana, u boji teksta (ne modula).
- **Headline / metric** (700, 28 px, 1.1): brojka na pločici.
- **Title** (700, 20 px, 1.25): naslov ekrana, kartice i sekcije.
- **Body / copy** (400, 15 px, 1.5): tekst, naziv firme u redu.
- **UI** (400, 13 px, 1.45): ćelije tabele, kontrole, opisi.
- **Label / meta** (400, 12 px, 1.35): natpisi, čipovi, ose grafikona. Natpis
  grupe je verzal sa razmakom 0.12em, u prigušenoj boji teksta.

### Named Rules
**Pravilo jednog reda.** Podnaslov ekrana je jedan red, do 90 znakova. Duže
objašnjenje ide iza dugmeta „i".

**Pravilo skale.** Skala je 12 / 13 / 15 / 20 / 28, plus `text-hero` (40)
samo za jedan fokus broj ekrana. Ništa ispod 12 px — ni ose grafikona, ni SVG
tekst koji se smanjuje kroz `viewBox`, ni bedž broja. Ništa nije 11, 14, 16,
18 ni 24 px.

**Pravilo verzala.** Verzal samo za natpise grupa; nikad za naslov, broj ni
dugme.

**Pravilo mono.** `font-mono` samo za ID, kod i brojčane kolone tabela.
Brojevi u fokusu, na pločicama i u tekstu su Aeonik sa `tabular-nums`. Reči,
datumi u rečenici i natpisi nikad nisu mono.

**Pravilo punog tona.** Na tekstu nema providnosti (`text-*/NN`, `opacity-*`);
koriste se puni tokeni (`text-secondary`, `text-muted`).

## Layout

Sadržaj je u koloni širine najviše 80rem sa razmakom od 1.5rem, pored fiksne
bočne trake od 15rem (4rem kad je skupljena u šinu ikonica) i ispod lepljive
gornje trake od 3.5rem. Ispod 768 px sve pada u jednu kolonu, bez vodoravnog
klizanja.

**Gustina.** Radni ekrani su gusti (gustina 7 od 10): liste i tabele sa
redovima od 36 do 40 px. Kartica samo za ono što se pomera (fokus, firma,
objava); sekundarne grupe se odvajaju razdelnikom i razmakom, ne kutijom. Nema
kutije u kutiji ni debele leve ivice — ivica je 1 px.

**Hijerarhija.** Jedan fokus po ekranu (na kanalu traka od tri imenovana
broja); ostalo ispod preloma. Fokus ekrana i njegovo primarno dugme moraju da
stanu iznad preloma na 1536×695, što je vlasnikov stvarni prikaz. Referentni
prikazi su još 1440×900 i 390×844.

**Dodir.** Dodirne mete su najmanje 44 px na uređajima sa grubim pokazivačem
(`pointer: coarse`). To je osobina primitiva, ne nešto što se dodaje ručno:
Button (sve veličine), jezičci (Tabs / ToggleGroup), okidač menija za izbor,
Switch i Checkbox (bar zona dodira), Chip sa `onClick` i naslovni link
kartice (`WorkCard`). Na desktopu se veličine ne menjaju. *Zatečeno:* klasa
`.touch-target` dodata ručno na 84 mesta.

## Elevation & Depth

Hibrid: površine se penju u svetlini (strana → kartica → podignuto), a senka
dodaje odvajanje u četiri koraka. Hrom (bočna i gornja traka) je translucentan
materijal sa svetlom ivicom.

### Shadow Vocabulary
- **elev-1** (`0 1px 2px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.2)`): kartice i pločice.
- **elev-2** (`0 4px 10px rgba(0,0,0,.34), 0 12px 32px rgba(0,0,0,.3)`): meniji, popoveri, toast.
- **elev-3** (`0 8px 20px rgba(0,0,0,.42), 0 32px 72px rgba(0,0,0,.5)`): dijalozi i fioke.
- **shadow-reward** (`inset 0 1px 0 var(--material-edge), 0 10px 30px -14px` sa `--xp-glow`): nagrade.
- **shadow-mod** (isto, sa `--mod-glow`) — *zatečeno*: fokus kartica i
  primarno dugme na hover. Sjaj nikad nije u boji modula, pa ovaj token izlazi
  sa dugmadi i fokus kartice u temelju.

### Named Rules
**Pravilo oreola.** Sjaj je obojena senka sa pomerajem. Oreol `0 0 Npx` ne
postoji.

**Pravilo četiri dozvole.** Gradijent i sjaj samo za: napredak (prsten, traka,
merač), fokus karticu, nagrade i auroru na vrhu strane (≤ 10 %, bez
animacije). Nikad na tekstu, redovima tabele ni proizvoljnim karticama, i
nikad u boji modula osim aurore.

## Shapes

Zaobljeni pravougaonici: 6 px čip, 8–10 px dugme i polje, 14 px kartica i
dijalog. Pune pilule su samo delta, bedž sa brojem i status. Ivica je uvek
1 px. Posebni oblici nose značenje i ne mešaju se: monogram firme je zaobljen
kvadrat, dostignuće krug, nivo heksagon, napredak prsten. Ikonice su lucide,
jedne debljine linije (1.75), u veličinama 16 / 20 / 24; emodžija nema.

## Components

### Buttons
- **Uloge:** svako dugme nosi ulogu i `data-variant`. Uloge `default` nema —
  dugme bez uloge je greška koju hvata provera u kodu.
  - **Primary (primarno):** puna boja radnje, tamni tekst. **Jedno po pogledu**
    (ekran, dijalog, fokus kartica). Napredak ga nikad ne nosi.
  - **Secondary (sporedno):** neutralna podloga (`--surface-raised`), tekst u
    boji teksta, bez boje modula — prateće radnje.
  - **Outline (obris):** neutralno; alati i filteri.
  - **Ghost (tiho):** radnje u redu tabele (ikonice koje se pokažu na hover ili
    fokus reda).
  - **Destructive (opasno):** tinta greške; uvek uz potvrdu.
  - **Link (veza):** tekst u boji radnje.
- **Shape:** visina 28–32 px na desktopu, radijus 8–10 px; pod
  `pointer: coarse` najmanje 44 px, u samom primitivu.
- **Hover / Focus:** hover posvetljuje podlogu (nikad ne potamnjuje — tamni
  tekst bi pao ispod 4,5:1). Fokus je okvir od 2 px u boji radnje sa odmakom
  2 px. Pritisak utisne dugme na 0,97 za 100 ms.
- **Loading:** `loading` onemogući dugme i doda spiner.
- *Zatečeno:* `default` (oko 77 punih dugmadi) i `secondary` u tinti modula;
  ukidaju se u temelju.

### Chips
- **Style:** radijus 6 px, ivica 1 px, 12 ili 13 px. Ton je uloga: stanje
  (`success` / `warning` / `danger` / `info`), `category` (slot palete) ili
  `xp` (samo nagrada). Ton `module` (*zatečeno*) izlazi: boja modula nije na
  čipovima.
- **State:** sa `onClick` je dugme (`aria-pressed`, 44 px na dodir); uključen
  filter je označen u boji radnje i tekstom, ne samo bojom.
- **Overflow:** `ChipOverflow` — čip stane ceo ili ga nema; višak je „+N" sa
  spiskom u oblačiću.
- **Bedž broja:** jedna komponenta od 12 px (ne `text-[10px]`).

### Cards / Containers
- **Corner Style:** 14 px.
- **Background:** `--surface`; podignuto `--surface-raised`.
- **Shadow Strategy:** `elev-1`; tiha senka i na fokus kartici, ne u boji
  modula.
- **Border:** prsten `--line`; klikabilna kartica na hover dobija
  `--line-control` i podigne se 2 px.
- **Internal Padding:** 16–20 px.
- Kartica samo za ono što se pomera: fokus, firma, objava.

### Inputs / Fields
- **Style:** tamna podloga, granica `--line-control`, radijus 8 px.
- **Focus:** ivica i prsten u boji radnje.
- **Error / Disabled:** ivica greške sa prstenom 20 %; onemogućeno na 50 %.
- **Meni za izbor:** jedna komponenta `components/ui/select.tsx` (nad
  `@base-ui/react`), uvek sa natpisom ili `aria-label`; nema izvornih
  `<select>`. Prilagođen period ima srpski format i prečice „ovaj mesec" i
  „prošli mesec".

### Status veze
Jedna izvedena funkcija daje jedan status po vezi, i nju čitaju tačka u gornjoj
traci, zaglavlje kanala, Podešavanja → Integracije, zdravlje sinhronizacije i
zvono:

- **Radi** — povezano, poslednji prolaz uspeo, token ne ističe za 7 dana,
  podaci mlađi od 24 h.
- **Traži pažnju** — istekao ili uskoro ističe token, poslednji prolaz pao,
  podaci stariji od 24 h, ili server nije podešen. Uvek uz razlog i jednu
  radnju.
- **Nije povezano** — nije kvar.

Tačka u gornjoj traci je zelena samo kad sve povezane veze rade, inače žuta sa
brojem („1 veza traži pažnju") i vodi na popravku; nepovezan kanal ne boji
tačku. Pogođeni ekran nosi traku upozorenja na vrhu, sa jednom radnjom.
Poruke su ljudske („Instagram je odjavljen pre 3 dana · Poveži ponovo"), a
tehnički kod (npr. OAuth greška) stoji samo u detaljima u Podešavanjima.
Uz fokus broj kanala piše „podaci od …" kad je sinhronizacija starija od 24 h.

### Brojevi i valuta
- Nula se prikazuje samo kad je izmerena nula; inače „—" i razlog (npr.
  „Google ne meri frekvenciju").
- Smer „bolje je" (`vise`, `manje`, `neutralno`) dolazi iz rečnika mera
  `lib/mere.ts`; rast troška i cene nije zelen.
- **Valuta:** sve je u evrima, bez preračuna. Aplikacija piše valutu koju
  izvor javi. Ako izvor ikad javi drugu valutu, iznos ostaje u toj valuti uz
  upozorenje („Nalog radi u RSD; aplikacija ne preračunava.") i nikad ne dobija
  znak €. Znak € se nikad ne upisuje u kod.

### Navigation (zatečeno)
Svaka stavka u `nav-items.ts` nosi `module`; ruta tako određuje boju mesta.

- **Bočna traka.** Grupe Radni sto / Kanali / Analitika / Automatizacija;
  Podešavanja su zupčanik na dnu, uz karticu igrača. Ikonica je u pločici od
  26 px (`ModuleTile`): puna boja modula sa tamnom ikonicom samo kad je modul
  aktivan; neaktivne stavke su neutralne (*zatečeno:* tinta modula u miru).
  Podstavke se vide samo za aktivni modul, u dve kolone.
- **Šina ikonica** (4rem). Pločice ostaju na istom mestu, nestaju natpisi;
  naziv daje oblačić. Izbor se pamti na uređaju.
- **Gornja traka.** Mrvica („modul / podekran"), kompaktan birač perioda
  („28 d ▾" na telefonu, u jednom redu), ⌘K (na Windowsu natpis „Ctrl K"),
  zvono, tačka statusa veza, meni korisnika iza inicijala.
- **Period** se pamti po projektu (podrazumevano 28 dana) i prenosi u
  linkovima na ekrane koji ga koriste. Sekcija sa drugim okvirom ga piše u
  naslovu („Danas", „Ovaj mesec").
- **Telefon.** Donja traka ima tačno pet ćelija i ne kliza. „Više" otvara list
  sa svim modulima. Mete su najmanje 44 px.
- **⌘K.** Sekcije Radnje / Nedavno / Ekrani.
- **Aurora** je podloga kolone sadržaja (`.aurora-top`), pa je ima svaki ekran.
- **Slojevi:** gornja traka 30 · bočna i donja traka 40 · sve što se otvara
  preko strane 50.

### Navigacija (cilj za kasnije runove — sprovodi se u fazi U10)
*Ovo nije posao ovog runa; zapisano je da se ništa novo ne napravi suprotno
tome.*

**Arhitektura je „srednji put" (O3).** Kanali (Instagram, Facebook, YouTube,
Threads, Oglasi) ostaju kao stranice za mere same platforme. Poslovi koji idu
preko svih kanala dobijaju svoj dom: **Zajednica** (razgovori sa svih kanala u
jednom redu, sa vezom ka firmi), **Objave** (kalendar i jedan kompozer; Novosti
su traka u tom kalendaru), **Analitika** sa tri jezička i jedan ekran
**Automatizacije** (OpenReply ostaje samo ime motora). Početni ekran je
**Danas**: posao i puls posla.

**Pravila navigacije:**
- Svaki modul je jedna stavka bočne trake; bočna traka nema podstavke.
- Svaki ekran modula ima istu traku jezičaka ispod zaglavlja, na istom mestu,
  bez obzira na to da li je bočna traka skupljena.
- Svaki jezičak je svoja adresa, a mrvica piše „Modul / Jezičak" istim rečima
  kao jezičak. Natpis jezička i naslov ekrana su isti; jedno mesto po stvari.
- Radnje (Nova objava, Novo pravilo, Uvoz) su dugmad, nikad jezičci.
- Period se pamti i prenosi, a birač stoji samo tamo gde menja sadržaj.
- ⌘K traži i firme, po imenu i po broju telefona.
- Na telefonu: Danas · Leadovi · Pozovi · Zajednica · Više.

### PageHeader
`plain` (podrazumevan): opis levo, radnje desno. `module`: pločica 40 px sa
ikonicom u boji modula (jedno od tri mesta boje mesta), naslov 20 / 700 u boji
teksta, jedan red podnaslova, radnje desno, aurora iza.

### FocusCard
Jedna po ekranu. Fokus je posao (sledeća firma, prvi upit, red koji čeka),
nikad nagrada. Ivica od 1 px i tiha senka, natpis u prigušenoj boji teksta,
sadržaj i jedno primarno dugme u boji radnje. *Zatečeno:* ivica u gradijentu
modula, `shadow-mod`, natpis u boji modula.

### KpiTile
Tri veličine: `hero` (40 px), `default` (28 px), `compact` (20 px, bez
linije). Broj je u boji teksta, Aeonik sa `tabular-nums` — nikad u boji
modula ni mono. Natpis je srpski naziv mere iz `lib/mere.ts`, a akronim je u
oblačiću. Delta je pilula: strelica je smer, boja je ocena po smeru iz
rečnika mera. Sparklinija je u boji serije iz palete i preko dana bez merenja
ide isprekidano. Sa `href` je cela pločica link. Kad mere nema: „—" i razlog.

### EmptyState
`plain` ne slavi prazninu. `mission` („Misija za start") je za ekran koji još
nema podataka: jedno primarno dugme i koraci do njega, bez XP-a uz korake.
`line` zamenjuje red pločica kad su sve nule.

### Progress i nagrade
`ProgressRing`, `ProgressBar` (sa oznakom cilja), `SegmentedMeter`, `XpBar`,
`LevelBadge`, `StreakFlame`, `AchievementBadge`, `MissionCard`, `RewardToast`,
`CelebrationBurst`. Uz svaki merač stoji broj. Pri otvaranju ekrana se ništa
ne pomera; merač se pomeri kad se vrednost promeni.

### Gamifikacija: Tiha
- **Na radnim ekranima** ostaju samo nedeljni ciljevi (tanke trake) i niz kao
  mali znak. Nema XP čipova na radnim karticama, nema „+XP danas", nema XP
  poruke posle svake radnje.
- **XP, nivo i dostignuća** su na strani Napredak. Režim poziva zadržava turu,
  kombo za razgovore i zbir XP-a na kraju ture.
- **Napredak nikad ne nosi primarno dugme** — ni misija, ni kartica, ni toast.
- Sve se izvodi iz stvarnih događaja u Convex-u (nema XP-a bez događaja) i
  može da se isključi po korisniku.
- Proslava (prasak, prebačaj) samo za nov nivo i dostignuće.

*Zatečeno do faze U9:* kartica igrača sa XP trakom na dnu bočne trake, toast
„+N XP · radnja" posle radnji, misije sa primarnim dugmetom na tabli i na
strani Napredak, čip „+25 XP" uz „Pozovi".

### Napredak (ekran, kartica, nagrade)
- **Mesto.** `/napredak` je u modulu Kontrolne table. Zlatna ostaje nagrada i
  na tom ekranu: XP broj i traka, bedž, završen cilj, mapa.
- **Ekran.** Fokus je „Ova nedelja" (nedeljni ciljevi), uz nivo i XP. Nijedan
  element ne nosi primarno dugme. Dostignuća, rekordi i mapa su bez kartica.
- **Dostignuće.** Zaključano je sivo, sa uslovom i „Zaključano · 3 / 10";
  otključano je u boji retkosti, sa datumom.
- **Mapa aktivnosti.** 12 nedelja, jednobojna zlatna skala u pet koraka;
  broj je u oblačiću dana i u redu ispod, legenda kaže koliki je najjači dan.
- **`LevelUpBanner`.** Nov nivo: traka ispod gornje trake, nije modal. Bedž
  uđe sa prebačajem, tekst za njim, prasak iz bedža — ukupno do 1,2 s.
  Zatvara se sama posle 4 s, klikom ili na Esc.

### Kontrolna tabla, Leadovi · Danas i Režim poziva
- **Kontrolna tabla** (*zatečeno*; postaje „Danas" u kasnijem runu). Fokus je
  posao, ne nagrada: prvi zadatak iz „Šta me čeka". XP i misije sa primarnim
  dugmetom nisu na tabli.
- **„Šta me čeka".** Tri reda sa razdelnicima, bez kutije. Pločica levo je
  hitnost (stanje), dugme desno je sporedno (ne u boji modula u koji vodi).
- **Pločice kanala.** `KpiTile` sa `href`; pločica ne nosi boju modula, broj
  je beo. Nepovezan kanal je isprekidana pločica sa „—" koja vodi u
  Podešavanja.
- **Leadovi · Danas.** Fokus je traka „Danas X / Y poziva" (prsten i niz) sa
  jedinim primarnim dugmetom „Započni režim poziva". Y je dnevni tempo:
  nedeljni cilj poziva podeljen na pet radnih dana. Pored je merač **Kvalitet
  baze** — bez kutije. Brojevi preseka su jedan red čipova sa „od toga".
- **Kartica radnog reda.** Monogram u boji niše, čipovi signala u boji
  kategorije, „Pozovi" bez XP čipa. Interes nije boja leve ivice. Kriterijum
  reda je oblačić iza „i", ne red sitnog teksta.
- **Pozovi.** Na telefonu je `tel:` link. Na desktopu „Pozovi" pokazuje
  krupan broj, dugme Kopiraj i QR kod (kasniji run).
- **Režim poziva** (`/leadovi?rezim=poziv`). Fokus prikaz umesto jezičaka:
  jedna firma u fokus kartici (naziv 28 px, zašto je na spisku, telefon,
  poslednji kontakt), „Pozovi" je primarno. Ishodi su uvek vidljivi; posle
  poziva prelaze iz `outline` u `secondary`, a „Pozovi" u `outline`. Desno je
  sesija: brojači, kombo (boja niza), dnevnik i zbir XP-a na kraju ture.
  Jedini pokret je kartica koja doklizi kad dođe sledeća firma (200 ms,
  `--ease-ui`). Tasteri: `P`, `1–4`, `N`, `Esc`; uz dugmad stoje kao `kbd`,
  na telefonu ne.

### Leadovi: tabela, profil, uvoz, mapa
- **Tabela.** Redovi od 36 do 40 px. Širine kolona su podatak
  (`LEAD_COLUMN_WIDTH`), ne klase: „Firma" ima bar 220 px (monogram u boji
  niše, naziv 15 px / 700, ispod grad · niša). „Zašto" su čipovi u boji
  kategorije koji se ne seku (`ChipOverflow`, najviše tri, ostatak „+N").
  Kolona čija je vrednost ista u ≥ 90 % redova se sama sakriva, uz napomenu
  iznad tabele i dugme koje je vraća; „Firma" i „Akcije" se ne sakrivaju.
  Radnje u redu su ghost ikonice vidljive na hover ili fokus; puno dugme nosi
  samo aktivni red. Od 1536 px zaglavlje se lepi ispod gornje trake.
- **Filteri.** Svaka od četiri uvek vidljive grupe ima svoju boju iz
  kategorijalne palete (tačka uz naziv grupe).
- **Profil firme.** Monogram, Fit i Intent kao prstenovi. Fokus je „Šta je
  sledeće" sa jednim primarnim („Pozovi"), dva prateća („Zabeleži ishod",
  „Zakaži sastanak") i „Još radnji". Uz prikazan korak stoji „Urađeno".
  Istorija je osa: linija, tačka u boji vrste događaja, tekst bez okvira.
- **Uvoz.** Koraci: urađeno zeleno sa kvačicom, tekuće u boji radnje sa
  brojem, sledeće sivo. Fokus početne strane je spisak uvoza koji čekaju
  pregled — primarno „Nastavi pregled" ima samo najstariji.
- **Mapa.** Panel izabrane firme ima ivicu i tihu senku — bez pulsa i bez
  oreola. Na telefonu mapa (U blizini, navigacija, kartica ishoda kao list
  odozdo) dolazi pre sređivanja tabele (kasniji run).
- **`TabNav`.** Aktivni jezičak: tekst u boji teksta i podvlaka u boji
  radnje; 44 px na dodir.

### Kanali: Instagram, Facebook, YouTube, Threads, Oglasi, Novosti
- **Zaglavlje** je `PageHeader` u `module` obliku: ikonica u boji kanala,
  jedan red podnaslova (≤ 90 znakova), duže objašnjenje iza „i". Primarno
  dugme zavisi od stanja („Nova objava", „Odgovori na komentare", …) i u boji
  je radnje. Ispod zaglavlja je jedan red stanja veze kad veza traži pažnju
  („Veza istekla pre 3 dana · podaci od 24. okt · Poveži ponovo").
- **Fokus** je `ChannelFocus`: glavni broj kanala u boji teksta (40 px,
  Aeonik `tabular-nums`). Merač **Spremnost kanala**
  (`lib/channel-readiness.ts`) je samo za ciljeve (objava u 7 dana, komentari
  odgovoreni); „Povezan" nije njegov segment, jer to kaže status veze.
- **Cilj (kasniji run):** na vrhu kanala tri broja iste veličine — Pratioci
  (stanje danas, uz promenu za period), Doseg i Upiti (zbir za period), sa
  natpisom šta je i za koji period; kanal bez dosega pokazuje svoju meru pod
  pravim imenom (YouTube: Pregledi). Dok upiti nisu povezani sa kanalom, stoji
  „—" sa razlogom.
- **Oglasi.** Fokus je Potrošnja sa valutom koju nalog javi, u bento redu sa
  Rezultatima, Cenom po rezultatu i ROAS-om ili CTR-om — nazivi iz
  `lib/mere.ts`, akronimi u oblačiću. Za potrošnju i cenu po rezultatu pad je dobra vest.
- **Prazan kanal.** Nepovezan: Misija za start sa koracima i dugmetom
  „Poveži …". Povezan bez ijednog broja: linija „Još nema podataka za ovaj
  period" — nikad red nula. Bez XP-a uz korake.
- **Mreže objava.** `EngagementBadge` na kartici: interakcije po prikazu,
  zeleno kad je bar petinu iznad medijane prikazanih objava, prigušeno kad je
  bar petinu ispod; strelica i tekst za čitač nose isto. Razreda nema ispod
  četiri izmerene objave. Obrisane objave su podrazumevano skrivene.
- **YouTube.** Dugme za otpremanje glasi „Otpremi kao privatan" (sporedno), a
  upozorenje je prvi red dijaloga (kasniji run). **Threads** pretraga je
  sakrivena dok Meta ne odobri pretragu drugih naloga (kasniji run).
- **Novosti.** Nacrti se čitaju iz baze; kartica nacrta piše šta fali do
  objave („Fali: opis slike, podnaslov"). Kartica je ceo post i otvara
  uređivač.

### Analitika, Atribucija, OpenReply, Pravila, Podešavanja, Prijava
- **Analitika.** Fokus su Sesije: `KpiTile` `hero` levo, veliki grafikon
  desno, iz validirane palete (`--chart-6`), ne u boji modula. Ostale mere su
  `compact` pločice. Izvori saobraćaja imaju `SourceIcon` uz naziv i traku
  udela iz palete. Primarno dugme „Pogledaj uživo" crta se samo kad je GA4
  povezan.
- **Levak** je `FunnelSteps`: traka po koraku, širine srazmerne najvećem
  koraku, iz palete (ne u boji modula). Između koraka piše prelaz — procenat
  kad je korak podskup prethodnog, a ODNOS („0,32 klikova po poruci") kad
  nije (`ratioOnly`).
- **Atribucija.** Fokus kartica: levak DM → klik → GA4 sesija → konverzija,
  desno UTM integritet kao `ProgressBar`.
- **OpenReply.** Fokus je levak DM → klik. Dugme fokusa: „Otvori
  automatizacije". (Cilj za kasniji run: jedan ekran Automatizacije; nova
  automatizacija počinje u probi i samo beleži šta bi uradila, „Uživo"
  uključuje Jovan.)
- **Pravila.** Jedno ime: „Pravilo" (ne „čuvar", ne „Guard"). Kartica: štit
  (precrtan kad je isključeno), uslov kao rečenica, `Switch` u boji radnje sa
  stanjem ispisanim rečju, vrednost prema pragu, poslednje okidanje; izmena i
  brisanje su ghost ikonice. Šabloni se ne upisuju sami; pravilo koje pauzira
  uključuje se tek posle probe. Natpis „Čuva samo Meta oglase". Istorija je
  vremenska osa: tačka u boji stanja (pauza = upozorenje, obaveštenje = info),
  tekst bez okvira, „Vrati kampanju" i „Otvori".
- **Podešavanja.** Cela širina kolone. Fokus je zbir statusa veza: „7 radi ·
  1 traži pažnju · Reši: Instagram", sa jednim dugmetom koje vodi na prvu vezu
  koja traži pažnju. Pločica integracije ne nosi boju brenda na dugmetu;
  stanje nosi `StatusPill` sa istim rečima kao svuda. „Prekini vezu" je u
  meniju „⋯", uz potvrdu. Umesto imena env promenljivih stoji ljudska
  rečenica („Instagram nije podešen na serveru") i „Kopiraj uputstvo za
  programera". Jezičci menjaju samo svoj parametar adrese.
- **Prijava i pozivnica.** `BrandMoment`: ime proizvoda u `text-display` i
  aurora u brend cijanu (≤ 10 %, bez animacije) iznad kartice. H1 je naslov
  koraka u kartici. Dugme za slanje forme je `primary`. Ekrani van ljuske
  (prijava, pozivnica, javne strane) sami nose `data-module="tabla"`.

### Motion
GSAP `useGSAP` unutar `gsap.matchMedia()` sa granom za reduced-motion.
„Corporate" za ceo UI: `--ease-ui` (`cubic-bezier(.2,.8,.2,1)`), 100 ms
pritisak, 150–200 ms sve što se pojavi. „Playful" samo za nagradu:
`--ease-reward` (`cubic-bezier(.34,1.56,.64,1)`), do 600 ms; čestice do
900 ms; nov nivo do 1,2 s. Toast: ulaz 250 ms, izlaz 180 ms. Podešavanje
ukusa: pokret 3 od 10.

- Radni ekrani se ne otkrivaju pri skrolu i ne animiraju sekcije pri
  učitavanju.
- Proslava samo za nov nivo i dostignuće.
- Pri otvaranju ekrana pomeraju se najviše dva elementa: okvir strane (prelaz
  rute, 200 ms) i fokus broj. `CountUp` pri prvom prikazu STOJI; odbrojava
  samo kad pozivalac zada `from`. Svež podatak i dalje prelazi od stare do
  nove vrednosti.
- `prefers-reduced-motion`: vrednost odmah, bez pomeraja i proslave. Skriven
  tab ne dobija animaciju.

### Jezik
- Srpski svuda, latinica, rečenični oblik u naslovima (ne Title Case). Kratko
  i konkretno; glagol na dugmetu kaže šta će se desiti.
- **Mere:** srpski naziv, akronim u oblačiću koji radi i na dodir („Cena po
  rezultatu", oblačić „CPA"). Nazive daje `lib/mere.ts`, ostale UI pojmove
  `lib/recnik.ts` (npr. Ad set → Grupa oglasa, Cooldown → Pauza za istu
  osobu).
- **Bez sirovih naziva:** nema API vrednosti (FOURTEEN_MONTHS, „Status:
  ACTIVE"), tehničkih kodova grešaka, imena env promenljivih ni internih
  oznaka plana u tekstu koji korisnik vidi.
- **Formati** (sve kroz `lib/format.ts`): datum „27. 10. 2026.", kratko
  „27. okt"; vreme „17:41"; trajanje „42 s", „1 min 1 s"; procenat „53,8 %"
  (tvrdi razmak); hiljade tačkom („12.480").
- Kad podatka nema: „—" i razlog, nikad izmišljena nula.

## Do's and Don'ts

### Do:
- **Do** stavi tačno jedno `primary` dugme po pogledu, u boji radnje; ostalo je `secondary`, `outline`, `ghost`, `destructive` ili `link`.
- **Do** daj svakom dugmetu ulogu; `default` ne postoji.
- **Do** drži boju modula na tri mesta: aktivna stavka bočne trake, ikonica zaglavlja, aurora.
- **Do** daj svakom ekranu jednu fokus zonu, i neka to bude posao.
- **Do** piši brojeve u Aeoniku sa `tabular-nums`; mono samo za ID, kod i brojčane kolone tabela.
- **Do** čitaj status veze iz jedne funkcije i piši ga istim rečima svuda (Radi · Traži pažnju · Nije povezano), uz razlog i jednu radnju.
- **Do** piši „—" i razlog kad podatka nema; valutu piši onakvu kakvu izvor javi.
- **Do** uz boju uvek stavi ikonicu, broj ili tekst.
- **Do** izmeri kontrast: tekst ≥ 4,5:1, kontrole i grafika ≥ 3:1.
- **Do** ostavi dodirnu metu od 44 px primitivu (`pointer: coarse`).
- **Do** animiraj samo `transform` i `opacity`, najviše 1–2 elementa po prikazu.

### Don't:
- **Don't** stavljaj boju modula na dugme, prekidač, broj, naslov, natpis pločice, grafikon ni sjaj.
- **Don't** piši heks ni sirove Tailwind boje u komponentama.
- **Don't** koristi zlatnu za bilo šta osim nagrade.
- **Don't** stavljaj XP čip na radnu karticu, XP poruku posle svake radnje, ni primarno dugme na Napredak.
- **Don't** piši tekst manji od 12 px, providan tekst ni verzal van natpisa grupe.
- **Don't** piši reči, datume u rečenici ni natpise u mono pismu.
- **Don't** stavljaj gradijent ili sjaj na tekst, redove tabele ili proizvoljne kartice.
- **Don't** pravi oreol (`0 0 Npx`), kutiju u kutiji ni debelu levu ivicu.
- **Don't** animiraj sekcije radnog ekrana pri učitavanju ni pri skrolu, i ne uvodi beskonačne animacije osim spinera.
- **Don't** koristi prebačaj van nagrade.
- **Don't** slavi prazninu: prazna lista nije vest da je posao gotov.
- **Don't** prikazuj XP bez događaja u bazi, ni broj koji nije iz podatka; nula nije zamena za „nema podatka".
- **Don't** upisuj znak € u kod niti preračunavaj valutu.
- **Don't** ostavljaj sirove API nazive, imena env promenljivih ni interne oznake plana u tekstu koji korisnik vidi.
