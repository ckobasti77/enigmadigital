# A2 — Kontrolna tabla, ljuska, Napredak (gamifikacija), Novosti, Podešavanja, Sistem, Prijava — revizija

> **Napomena za noćne runove (27. 10. 2026.):** ovo je revizija napravljena pre ULTRA runova. Putanje `ED/…` znače koren ovog repoa; `AUDIT/…` i snimci `nocni-run/ux/bx-*.jpg` nisu u repou. Brojevi su iz sintetičkih podataka razvojnog prikaza (`?ux=1`). Valuta: pravi nalozi za oglase rade u evrima (odluka O16 u `docs/ULTRA-PLAN.md`); tvrdnje o nalogu „u dinarima“ potiču iz probnih podataka. Odluke, obim i redosled važe iz `docs/ULTRA-PLAN.md`, a ne iz pitanja i preporuka u ovom izveštaju.


Snimci: `ED/nocni-run/ux/bx-*` (glavni) i moji u `AUDIT/shots/A2/`: `x-zvono-otvoreno.jpg`, `x-meni-otvoren.jpg`,
`x-period-otvoren.jpg`, `x-nov-nivo.jpg`, `x-podesavanja-napredak.jpg`, `x-tabla-bez-napretka.jpg`, `x-period-7d-pa-analitika.jpg`,
plus isečci (`kt-vp.jpg` = prvi ekran table, `ktm-vp.jpg`, `ljuska-m-4.jpg`, `side-sub.jpg`, `top-a.jpg`/`top-b.jpg` = vrh 19 ekrana
za poređenje navigacije, `set-*.jpg`, `setm-a.jpg`, `nap*.jpg`, `sis-*.jpg`).
Napomena o snimcima: `bx-podesavanja-napredak-*` je zapravo strana prijave (CONVEX FATAL ERROR u logu), a `bx-napredak-nov-nivo-*` je
`/sistem` bez klika; zamenjeni su sa `x-podesavanja-napredak.jpg` i `x-nov-nivo.jpg`. Delte KPI pločica na snimcima ne postoje jer
razvojni prikaz nema prethodni period; kod ih računa (`overview-dashboard.tsx`, `deltaPct`), pa to NIJE nalaz.

## 0. Presuda specifičnosti

Delovi su autorski i dobri: boja mesta za 13 modula, „Šta me čeka" kao jedan izvor posla (zvono, bedževi, ⌘K, tabla) i poštenje
brojeva („—" sa razlogom, „najmanje toliko"). Ali kompozicija početnog ekrana je zamenljiva: „pozdrav + nivo + XP + prstenovi + tri
misije + KPI pločice + grafikon + top liste + zdravlje sinhronizacije" je generički „gamified dashboard" koji bi stajao u bilo kom
CRM-u. Ekran ne zna da je ovo agencija jednog čoveka koja živi od poziva: primarno dugme početne je „Odgovori na 3 komentara", a
„Započni režim poziva" na početnoj ne postoji. Podešavanja i Sistem su inženjerski temeljni, ali organizovani po implementaciji,
ne po Jovanovom poslu.

## 1. Nielsen

| # | Heuristika | Ocena | Ključni problem |
|---|---|---|---|
| 1 | Vidljivost stanja sistema | 2 | Instagram ne sinhronizuje 3 dana, a gornja traka ima zelenu tačku i meni kaže „Sinhronizovano pre 2 h"; Podešavanja kažu „8 / 8 povezano i aktivno ✓ Instagram". Period se tiho vraća na 28 d pri prelasku ekrana. |
| 2 | Podudarnost sa stvarnim svetom | 2 | „OAuthException 190", „FOURTEEN_MONTHS", „INSTAGRAM_APP_ID … u Convex environment varijable", „Mozak", „četiri kapije", „provera humanizera", „Beleška (note)", „⌘K" na Windowsu, „Danas" sa tri značenja, vojnička zvanja umesto imena. |
| 3 | Kontrola i sloboda | 3 | Esc svuda, Odloži/Sakrij/Vrati u zvonu, Napredak se gasi; ali prekidač Napretka je sve-ili-ništa i Odloži/Sakrij ne postoje na tabli. |
| 4 | Doslednost i standardi | 1 | Četiri modela druge ravni navigacije (§6), druga ravan menja mesto kad se traka skupi, dva oblika zaglavlja, tri stila KPI-ja na jednoj strani, `default` dugme izgleda kao `primary`, „Oglasi" dvaput u bočnoj traci. |
| 5 | Prevencija grešaka | 2 | Period se resetuje (pogrešna poređenja brojeva između table i modula); spisak nacrta Novosti živi u `localStorage`; 8 trajno otvorenih „Prekini vezu" zona. |
| 6 | Prepoznavanje umesto pamćenja | 2 | „još 7 u zvonu" je tekst, ne kontrola; bedž „9" nema par na Leadovima; podekrani su levo ili gore zavisno od šine; Napredak nema mesto na telefonu u „Više". |
| 7 | Fleksibilnost i efikasnost | 2 | ⌘K je dobar, ali ne traži firme (ni po imenu ni po broju za uzvratni poziv); do poziva sa table 2 klika; nema prečica na tabli. |
| 8 | Estetika i minimalizam | 2 | Zanat je visok, ali tabla je 2,9 visine ekrana kopija četiri modula, Podešavanja 6,8 (telefon 10,5), polovina prvog ekrana table je XP. |
| 9 | Prepoznavanje i oporavak od grešaka | 2 | Sirove poruke provajdera i uputstva za programera; pad Napretka kaže „Osveži stranu" bez dugmeta; dobro: „Reši: …" u Podešavanjima, poruke prijave. |
| 10 | Pomoć i dokumentacija | 3 | „i" uz svako zaglavlje, prazna stanja sa koracima, prazno zvono kaže šta je provereno; nema pretražive pomoći. |
| | **Ukupno** | **21 / 40** | Opseg 20–27 („prihvatljivo, potrebne značajne popravke"), donji kraj zbog doslednosti i stanja. |

## 2. Kognitivno opterećenje

| Ekran | Pada (od 8) | Koje stavke |
|---|---|---|
| Kontrolna tabla `/` | **6** (visoko) | jedan fokus (dva fokalna sistema: misije i „Šta me čeka"), grupisanje u ≤4 (4 + 6 + 4 + 8 stavki u nizu), vizuelna hijerarhija (najveći element je nivo/misija, ne hitan posao), minimalni izbori, radna memorija (brojevi na istoj strani su 28 d, 7 d, 24 h, mesec, nedelja, dan i „stanje", bez oznake), postepeno otkrivanje (pregledi 4 modula uvek rašireni) |
| Ljuska | **3** (umereno) | minimalni izbori (gornja traka 8 kontrola na ekranima sa periodom), radna memorija (gde je druga ravan zavisi od šine; period se gubi), doslednost obrazaca (traka jezičaka vs podstavke vs čipovi) |
| Napredak `/napredak` | **3** | grupisanje (23 dostignuća), postepeno otkrivanje (svih 23 uvek), hijerarhija (najveći broj je XP, ne nedeljni posao) |
| Podešavanja `/settings` | **5** (visoko) | jedan fokus („8/8 ✓" protivreči kartici i listi ispod), grupisanje (dnevnici, lične preference i znanje u „Podešavanjima"), minimalni izbori (8 jezičaka; kartica sa 3–4 radnje uključujući destruktivnu), postepeno otkrivanje (GA4 Admin detalji, raspored i kvote uvek otvoreni), radna memorija (stanje Instagrama na 4 mesta sa 4 vrednosti) |
| Novosti `/novosti` | **1** | radna memorija (šta fali nacrtu do objave vidi se tek u uređivaču) |
| Sistem `/sistem` | **2** | grupisanje (455 dugmadi), postepeno otkrivanje |
| Prijava | **0** | — |

Tačke odluke sa više od 4 opcije:
- gornja traka na ekranu sa periodom: 7 d · 28 d · 90 d · prilagođeno · ⌘K · zvono · tačka · avatar = 8;
- tabla, „Prikaži na grafikonu": 8 metrika; „Poslovanje": 6 brojeva; prvi ekran: 3 dugmeta misija + 3 dugmeta liste + „Napredak →";
- zvono: 10 stavki × 3 radnje (otvori, Odloži 1 dan, Sakrij);
- ⌘K bez upita: „Radnje" = 3 zadatka + 4 radnje + skupljanje trake, pa „Misije dana", „Nedavno", „Ekrani" (13+);
- bočna traka: 12 modula + 7 podstavki Analitike (2 kolone); Instagram 6 podstavki;
- „Više" list na telefonu: 13 pločica;
- Podešavanja: 8 jezičaka; na Integracijama 8 kartica × (Izmeni, Sinhronizuj, Prekini vezu, Osveži token…);
- Napredak: 23 dostignuća.

## 3. Emocionalno putovanje (vrh, kraj, doline)

- **Vrh:** Režim poziva i zlatna „Završeno" misija, mirna traka novog nivoa (`x-nov-nivo.jpg`), toplotna mapa sa legendom. Prazno
  zvono koje kaže šta je provereno daje mir.
- **Kraj:** dan nema zatvaranje. Nema „danas: 12 poziva, 2 sastanka, 1 ponuda"; poslednje na tabli je crven čip „Instagram ·
  greška" i mono tekst „Token je istekao (OAuthException 190).", a misija „Odgovori na 3 komentara" može da stoji na 1/3 ceo dan
  jer se odgovor iz Instagram aplikacije ne broji.
- **Doline:** (1) svako otvaranje počinje pola ekrana o XP-u pre posla; (2) zelena tačka a crveni čip — kome verovati;
  (3) „Podešavanja" kao zid od 4.700 px sa crvenim „Prekini vezu" okvirima; (4) nacrt Novosti sa laptopa ne postoji na telefonu;
  (5) period koji sam izabrao nestane kad kliknem pločicu; (6) na telefonu „Danas" panel pluta sa vrha sa dugmićima od 24 px.

## 4. Šta valja i treba zadržati

1. **Jedan izvor posla** (`use-sta-me-ceka.ts` → zvono, tabla, bedževi, ⌘K): hitnost, imenilac, Odloži/Sakrij/Vrati, „najmanje
   toliko", prazno stanje bez slavlja. To treba da postane srce početnog ekrana, ne sporedni spisak ispod misija.
2. **Boja mesta i mrvica sa tačkom**: orijentacija radi u bočnoj traci, šini, „Više" listu i portalima (`data-module` na `<html>`).
3. **Otpornost**: `QuietBoundary`, ljuska preživi pad Napretka (`bx-ljuska-pad-napretka`), a tabla tada prelazi na `FokusZadatak`.
   Uzgred: tabla bez Napretka (`x-tabla-bez-napretka.jpg`) je već bolji početni ekran od trenutnog: hitan posao je fokus, 4 stavke
   i red kanala staju iznad preloma.
4. **⌘K kao radni alat** (zadaci, radnje, misije, nedavno; Ctrl+K radi; strelice/Enter/Esc) i jezičci sa pravom tastaturom
   (`tab-nav.tsx`, strelice + automatska aktivacija). Proširiti, ne menjati.

## 5. Po ekranu

### Kontrolna tabla — `/` — snimci: `bx-kontrolna-tabla-{1536x695,390x844}`, `bx-kontrolna-tabla-prazno-*`, `A2/kt-vp.jpg`, `A2/kt-rest-00/01.jpg`, `A2/ktm-vp.jpg`, `A2/x-tabla-bez-napretka.jpg`, `A2/x-zvono-otvoreno.jpg`

- **Posao ekrana:** za 3 s posle otvaranja (10× dnevno) reći: šta me sada čeka i čime počinjem (najčešće: zovi), da li nešto gori
  (upit čeka, sastanak, pala veza) i kako posao stoji (upiti, ponude, prihod; kanali u trendu). **Obavlja delimično:** iznad preloma
  je 318 px kartice o napretku (~50 % površine ispod gornje trake) i 2,5 reda posla; poslovnih brojeva 0, brojeva kanala 0,
  dugmeta za pozive 0 (misija poziva je završena).

**Odgovor na pitanje 1 (čemu služi početni ekran).** Za jednog vlasnika koji zove firme početni ekran je **prijemno sanduče dana +
puls posla**, ne izveštaj i ne igra. Treba da (1) istakne JEDAN sledeći korak iz „Šta me čeka" sa jedinim primarnim dugmetom,
(2) pokaže ceo radni spisak sa Odloži/Sakrij, (3) drži poziv na jedan klik („Pozivi danas 3/5 · Nastavi pozive"), (4) pokaže
Poslovanje (upiti, ponude, prihod) i sastanke danas sa satom, (5) kanale tek ispod preloma kao 4 pločice sa deltom koje vode u
modul. Sve ostalo se seli (vidi „Ciljni kanvas" i §8/1). Trenutna tabla taj posao ne obavlja: primarno je misija „Odgovori"
(+30 XP, hitnost „srednja"), dok su ispod tri stavke „Hitno".

UI:
- [P1] Fokus kartica nosi pozdrav, bedž nivoa, zvanje, niz, „+190 XP danas", tri prstena i tri misije; dve misije su „Završeno" i
  u punoj veličini sa zlatnim ivicama zauzimaju 2/3 reda misija — gotov posao na najboljem mestu ekrana — `kt-vp.jpg`, y 157–475;
  `command-focus.tsx` `FokusNapredak` — Ciljno: fokus = „Sledeći korak" (jedan zadatak, ~100 px, jedino primarno dugme); prstenovi
  kao bullet trake u desnoj koloni; završene misije nestaju sa table (ostaju na `/napredak`).
- [P1] Poslovanje (upiti 7 d, otvorene ponude, prihod meseca, klijenti) je najvažniji vlasnički podatak, a stoji na y≈930–1050,
  ispod 4 pločice kanala, 15 px bez hijerarhije — `kt-rest-00.jpg`; `overview-dashboard.tsx:268` — Ciljno: desna kolona iznad preloma,
  3–4 broja sa promenom.
- [P2] Tri vizuelna jezika za istu vrstu podatka: 4 kartice sa sparkline, red od 4 broja sa razdelnicima („Ključni događaji ·
  Korisnici · Klikovi na linkove · Pratioci"), „Poslovanje" sa „+1 za 24 h" — `kt-rest-00.jpg` — Ciljno: jedan `KpiTile compact` stil.
- [P2] Prstenovi na tabli nemaju vidljivu oznaku perioda („Pozivi od 25 · 24 %"; „Ova nedelja" postoji samo u `aria-label`), dok
  Leadovi pišu „nedelja 6/25", a Napredak „OVA NEDELJA" — `command-focus.tsx:163–193` — Ciljno: natpis „Ova nedelja" iznad traka.
- [P2] Prazno stanje: 5 puta „GA4 nije povezan" i 6 puta „Poveži u Podešavanjima" na jednoj strani — `ktp-rest-00.jpg` — Ciljno:
  jedan red „Nije povezano: GA4, Instagram → Poveži" na vrhu sekcije Kanali; pločice nepovezanih kanala se ne crtaju.
- [P3] Bez Napretka fokus kartica je 170 px za dva reda teksta, desna polovina prazna — `x-tabla-bez-napretka.jpg`.
- [P3] Dugme misije je u boji strane (cijan), dugmad liste u boji odredišta (zelena) — dva pravila boje radnje u istom bloku
  (`command-focus.tsx` vs `today-block.tsx:101`).

UX:
- [P1] Primarno dugme nosi prva nezavršena misija (`command-focus.tsx:127`, `264–272`); misije se biraju pri prvom otvaranju dana
  i zamrzavaju (plan §6.4, `convex/lib/napredak.ts` `izaberiMisije`), a lista je živa — pa primarno može da stoji na „srednjoj"
  stavci dok su „Hitno" ispod — Ciljno: primarno uvek nosi prvi zadatak iz „Šta me čeka" (logika već postoji u `FokusZadatak`).
- [P1] Nema dugmeta za pozive kad je misija poziva gotova; Leadovi istovremeno kažu „3/5 poziva · još 2 do dnevnog tempa" — 2 klika
  do posla 10 puta dnevno — Ciljno: stalni red „Pozivi danas 3/5 [Nastavi pozive]" (`REZIM_POZIVA_HREF`).
- [P1] Period se ne prenosi: `ProjekatLink` → `putanjaEkrana` (`lib/rutiranje.ts:92`) ne nosi `?range`, a `proxy.ts` ga ne pamti.
  Izabereš 7 d na tabli, klikneš pločicu „Instagram doseg" → Instagram je na 28 d i broj se ne slaže. Info tekst table tvrdi „Period se
  bira u gornjoj traci i važi na svim ekranima" (`app/(app)/[projekat]/page.tsx:20`) — netačno. Proba helperom: `/?range=7d` + klik
  u bočnoj traci izgubio je ceo query (`x-period-7d-pa-analitika.jpg`) — Ciljno: §8/5.
- [P2] Birač perioda je u gornjoj traci, a ništa iznad preloma ne zavisi od njega (misije = dan, prstenovi = nedelja, Poslovanje =
  7 d / mesec / 24 h, „Leadovi bez poziva" = stanje); na telefonu zauzima svoj red (~90 px) iznad pozdrava — `ktm-vp.jpg` — Ciljno:
  birač samo u zaglavlju sekcije Kanali.
- [P2] „još 7 u zvonu" je `<span>` (`today-block.tsx:87–91`); Odloži/Sakrij postoje samo u zvonu — ista lista, dva ponašanja.
  Otvoreno zvono na tabli ponavlja iste tri stavke koje su već na strani (`x-zvono-otvoreno.jpg`).
- [P2] Misije su po korisniku preko svih projekata: na tabli „Enigma IT" stoji „Reši 5 nerazrešenih redova · ScanMe"
  (`napredak-ikone.ts:162`), a van huba takva misija nema odredište (`odredisteMisije` vraća `null`) — tuđ posao bez dugmeta.
- [P2] Sirova greška provajdera na dnu: „Instagram: Token je istekao (OAuthException 190)." — `kt-rest-01.jpg`.
- [P2] „Leadovi bez poziva 178" (stanje baze) u redu sa sesijama, dosegom i DM-ovima (protok u periodu), bez oznake razlike.

Nema smisla:
- Ispod preloma tabla je kopija četiri modula: grafikon „Prikaži na grafikonu" sa 8 GA4 metrika je isti `SessionsChart` kao na
  Analitici (`overview-dashboard.tsx:277–281`); „Ključni događaji / Korisnici" = Analitika, „Pratioci na Instagramu 2.555" = fokus
  broj Instagrama, „Klikovi na linkove" = OpenReply, „Šta radi" = Atribucija + Instagram top sadržaj. Ukupno 2.006 px (2,9 ekrana),
  telefon 3.598 px.
- Prazno stanje: „Danas nema misija. Misija nastaje samo kad posao postoji: … zaostali koraci, nerešeni redovi uvoza…", a odmah
  ispod „3 zaostala koraka — Hitno" i „Uvoz čeka pregled (3) — Hitno" (`ktp-vp.jpg`). Uzrok je strukturni (zamrznut dan vs živa
  lista) i može se desiti i na produkciji kad posao nastane posle prvog otvaranja dana.
- Tri dnevna cilja za pozive u isto vreme: misija „Pozovi 3 firme" = Završeno (cilj `min(5, zoviSada)` zamrznut ujutru,
  `convex/lib/napredak.ts:675`), dnevni tempo Leadova 3/5 (nedeljni cilj / 5, `leads-today.tsx:654`), nedeljni prsten 6/25.
- Zelena tačka i „Sinhronizovano pre 2 h" na vrhu, crveni čip „Instagram · greška · pre 3 d" na dnu iste strane.

Ciljni kanvas 1536×695 (kolona sadržaja 1.232 px):
```
● Danas                                                     [Ctrl K] [zvono 10] [◐ 1 veza ne radi] [JM]
Dobar dan, Jovan · utorak 27.10.                                          niz 4 · nivo 7  (13 px, tiho)
┌──────────────── 2/3 ≈ 800 px ──────────────────────────┐┌──────────── 1/3 ≈ 410 px ────────────────┐
│ SLEDEĆI KORAK                             (FocusCard)  ││ POZIVI DANAS   3 / 5  ▮▮▮▯▯               │
│ ⚠ 3 upita sa sajta čekaju · najstariji 1 dan           ││ nedelja 6 / 25 ▮▮▯▯▯  [Nastavi pozive →]   │
│ Pekara Klas: „Treba nam sajt sa porudžbinama…"         │├──────────────────────────────────────────┤
│                            [Otvori upite →] PRIMARNO   ││ SASTANCI  danas 14:00 Salon X [→]         │
├────────────────────────────────────────────────────────┤│ nedelja 1 / 3 · objave 0 / 2              │
│ ŠTA ME ČEKA · 9                   Hitno 3 · 4 · 2      │├──────────────────────────────────────────┤
│ ⚠ 3 zaostala koraka · rok prošao       [Zovi →]    ⋯   ││ POSLOVANJE · sa sajta · pre 7 min         │
│ ⚠ 1 sastanak bez ishoda                [Otvori →]  ⋯   ││ Upiti 7 d   18  ▲3                         │
│ ⚠ Instagram: veza pala pre 3 d         [Reši →]    ⋯   ││ Otvorene ponude  7                         │
│ ◷ Uvoz čeka pregled (3) · 34 d         [Otvori →]  ⋯   ││ Prihod oktobar  12.480 €  ▲650             │
│ ◷ 178 firmi nikad nije zvano           [Pozovi →]  ⋯   ││ Klijenti 42 · Održavanje 23                │
│ Prikaži još 3 ▾          (⋯ = Odloži 1 dan / Sakrij)   │└──────────────────────────────────────────┘
└────────────────────────────────────────────────────────┘
ispod preloma: KANALI [28 d ▾ — jedini birač perioda] · 4 pločice sa deltom → modul. Kraj strane.
```
Seli se: grafikon i red od 4 broja → Analitika/OpenReply/Instagram (već su tamo); „Šta radi" → Atribucija i Instagram „Top sadržaj";
čipovi sinhronizacije → zvono i Podešavanja → Veze; misije → `/napredak` i ⌘K (ili ukinute, §8/2); prstenovi → desna kolona.
390×844: gornja traka „● Danas"; kartica „Sledeći korak" sa dugmetom 44 px; „Šta me čeka" 5 redova po 56 px (⋯ otvara donji list
Odloži/Sakrij); „Pozivi danas 3/5 [Nastavi]" + sastanci danas + 3 broja Poslovanja; bez reda perioda.

### Ljuska — sve rute (bočna traka, šina, gornja traka, mrvica + zaglavlje, ⌘K, zvono, sinhronizacija, meni, period, donja traka, „Više", „Danas") — snimci: `bx-ljuska-{sina,paleta,meni,vise,danas,pad-napretka}-*`, `A2/x-zvono-otvoreno.jpg`, `A2/x-meni-otvoren.jpg`, `A2/x-period-otvoren.jpg`, `A2/side-sub.jpg`, `A2/top-a.jpg`, `A2/top-b.jpg`, `A2/ljuska-m-4.jpg`

- **Posao:** gde sam, kuda mogu, da li nešto ne radi, nalog. **Obavlja delimično:** „gde sam" radi (boja, mrvica, aktivna crta),
  „kuda" je nedosledno (4 modela, §6), „da li nešto ne radi" je kontradiktorno.

**Odgovor na pitanje 3 (doslednost ljuske).** Grupe bočne trake su razumne (Radni sto / Kanali / Analitika / Automatizacija), osim
što su Novosti u „Radni sto" (retka radnja) i što „Oglasi" postoje dvaput. Netačno ili nedosledno: druga ravan menja mesto prema
stanju trake; mrvica pokazuje podekran samo za subrute, ne za `?tab=` jezičke; na korenu modula mrvica i H1 kažu isto; statusna
tačka nikad ne pokazuje kvar; period se ne prenosi; na telefonu „Danas" i „Više" su dva različita obrasca prekrivanja. Pun spisak
razlika između modula je u §6.

UI:
- [P1] Podstavke u bočnoj traci u **dve kolone** redova od 24 px (`app-sidebar.tsx:269–308`, `grid-cols-2`, `h-6`): Analitika se čita
  cik-cak „Pregled | Uživo / Sticanje | Sadržaj / Posetioci | Oglasi / Retencija" (`side-sub.jpg`); Tab redosled ide levo-desno-levo.
  Kolone su uvedene da traka stane u 695 px — simptom, ne rešenje — Ciljno: bez podstavki u traci; druga ravan uvek u traci jezičaka.
- [P1] Druga ravan menja mesto: proširena traka → podstavke levo; šina ili telefon → `SectionNav` gore (`app-shell.tsx:340–349`).
  Isti ekran Instagrama ima jezičke gore u `bx-ljuska-sina` i nema ih u `bx-instagram` — prostorna memorija se ruši pri svakom
  skupljanju trake.
- [P2] Na korenu modula mrvica i H1 su isti („● Kontrolna tabla" u traci, „Kontrolna tabla" 70 px niže; isto na 12 modula) —
  Ciljno: mrvica samo od druge ravni („Instagram / Komentari"), na korenu samo tačka + ime projekta ili ništa.
- [P2] „⌘K" je natpis i na Windowsu (`app-shell.tsx:407–409`), a Jovan je na Chrome/Windows (Ctrl+K radi) — Ciljno: natpis po
  platformi („Ctrl K").
- [P2] Bedž „9" na Leadovima broji VRSTE posla (`nav-badge.tsx`, `convex/lib/notifications.ts:562` `bedzeviOd`), ne stvari; ne
  može se upariti ni sa jednim brojem na Leadovima (Upiti 3, Zovi sada 40, Rupe 39, Zaostali 3, Sastanci 2). Zvono 10 = 9 + 1
  (zupčanik) — Ciljno: bedž = broj „Hitno" stavki (ili tačka bez broja), uz `title` koji ih nabraja.
- [P2] Kartica igrača zamenjuje identitet: dno trake piše „Operativac" umesto imena; ime i email samo u meniju avatara.
- [P2] Popover „Prilagođen period": nativna polja datuma prikazuju „09/30/202" — godina odsečena, američki redosled
  (`x-period-otvoren.jpg`; `date-range-picker.tsx:170–210`, `w-64` sa dve kolone) — Ciljno: polja jedno ispod drugog ili `w-80`,
  `lang="sr-Latn"` na input, prečice „ovaj mesec / prošli mesec".
- [P2] Telefon: „Danas" (zvono) je popover sa vrha-sredine, 358 px, margine 25/5 px, dugmad 28 px (veza) i 24 px („Odloži 1 dan",
  „Sakrij") (`notifications-bell.tsx:139–144`, `304–344`; `ljuska-m-4.jpg`); „Više" je donji list — dva obrasca u istoj traci.
- [P3] „Više" list nema nazive grupa, ponavlja tri stavke iz trake i nema Napredak (`mobile-nav.tsx` `MoreSheet` čita samo `navItems`).

UX:
- [P1] Statusna tačka „NIKAD nije crvena" po dizajnu (`sync-status.tsx:18–33`, ton je `ok` čim postoji bilo koji prolaz,
  `82–86`): zelena = uspeh po ulozi boje, `aria-label` „Sinhronizovano pre 2 h. Otvori podešavanja." dok Instagram ne radi 3 dana.
  Isti kvar je u isto vreme: crveni „1" na zupčaniku, „Hitno" u zvonu, crveni čip na tabli, „✓ aktivno" u Podešavanjima — Ciljno:
  §8/4.
- [P1] ⌘K ne traži podatke — samo ekrane, radnje, zadatke, misije (`command-palette.tsx`, nijedan upit nad firmama). Scenario
  hladnog pozivara: uzvratni poziv sa 064… — gde je ta firma? Pretraga tabele Leadova je, po natpisu i `aria-label`, „po nazivu
  firme" (`lead-filter-bar.tsx:662`) i 2 klika daleko — Ciljno: sekcija „Firme" u ⌘K po nazivu i broju telefona (Convex `searchIndex`, bez
  nove zavisnosti).
- [P2] Na telefonu Napredak nije u „Više", a na `/napredak` „Više" postaje aktivno (`mobile-nav.tsx`, `!inBar && <ActiveMark/>`) —
  aktivno mesto koje ne sadrži ekran.
- [P2] „Danas" znači tri stvari: ćelija zvona na telefonu, prvi jezičak Leadova, fokus Leadova „Danas 3/5 poziva"; panel zvona se zove
  „Šta me čeka".
- [P2] Dva oblika zaglavlja: Leadovi `plain` (bez naslova, prvo traka jezičaka), svi ostali ekrani (~30) `module`
  (`grep variant="module"`).
- [P2] Gornja traka ima period na ekranima čiji fokus broj ne zavisi od njega (Instagram „Pratioci 2.555 — trenutno stanje naloga").

Nema smisla:
- Radnja kao jezičak + isto dugme u zaglavlju: Instagram „Nova objava" (podstavka/jezičak i primarno dugme, `bx-ljuska-sina`),
  Analitika jezičak „Uživo" i primarno „Pogledaj uživo", Facebook jezičak „Komentari" i primarno „Odgovori na komentare".
- „Oglasi" su u istoj bočnoj traci dve stvari: modul Oglasi (Meta/Google kampanje) i podstavka Analitika → „Oglasi" („Plaćeni oglasi
  (Google Ads)").
- Ista stvar, dva naziva: podstavka „Inbox" → mrvica i H1 „Poruke (Inbox)"; „Komentari" → „Moderacija komentara"; „Uživo" →
  „Uživo (poslednjih 30 minuta)"; „Publika" → „Publika i demografija".

Ciljni kanvas 1536×695:
```
┌ 240 ─────────────┐┌ 56: ● Instagram / Komentari     [7 d|28 d|90 d ▾]* [Ctrl K] [zvono 4] [◐ veze] [JM] ┐
│ EI Enigma IT  ⇤  ││ [ikon] Instagram · jedan red podnaslova                         [+ Nova objava]      │
│ RADNI STO        ││ Pregled  Publika  Priče  Inbox  Komentari 3      ← jezičci UVEK ovde, isti izgled   │
│  ▣ Danas         ││ ───────────────────────────────────────────────────────────────────────────────── │
│  ▣ Leadovi    3  ││  sadržaj ekrana                                                                    │
│ KANALI           ││                                                                                    │
│  ▣ Instagram ... ││   * period samo na ekranima koji ga koriste; pamti se i prenosi                    │
│ ANALITIKA …      ││                                                                                    │
│ AUTOMATIZACIJA … ││                                                                                    │
│ ──────────────── ││                                                                                    │
│ JM Jovan · 7 🔥4 ⚙││                                                                                   │
└──────────────────┘└────────────────────────────────────────────────────────────────────────────────────┘
```
390×844: gornja traka „[EI] ● Instagram / Komentari [🔍] [JM]"; ispod nje traka jezičaka (klizi); donja traka
„Danas · Leadovi · Pozovi · Instagram · Više" (Danas = početni ekran sa spiskom, pa zasebna ćelija zvona nije potrebna; „Više" sa
grupama i Napretkom). Zvono ostaje u gornjoj traci na desktopu.

### Napredak i gamifikacija — `/napredak` + XP/misije/niz/prstenovi kroz aplikaciju — snimci: `bx-napredak-{1536x695,390x844}`, `bx-napredak-prazno-*`, `bx-napredak-pad-*`, `bx-napredak-paleta-1536x695`, `A2/x-nov-nivo.jpg`, `A2/x-podesavanja-napredak.jpg`, `A2/nap-vp.jpg`, `A2/napp-rest.jpg`

- **Posao:** lični pregled — koliko sam radio ove nedelje, niz, nivo, rekordi. **Obavlja da**, kao profil. Problem nije ova strana,
  nego to što gamifikacija sedi na radnim ekranima i nosi fokus i primarna dugmad.

**Odgovor na pitanje 2 (gde pomaže, gde se takmiči, preporuka).**
- *Pomaže:* nedeljni ciljevi (pozivi/sastanci/objave) su pravi poslovni ciljevi; niz daje ritam radnim danima; Režim poziva sa
  sesijom i kombom; mapa aktivnosti; retke nagrade (nov nivo, dostignuće).
- *Takmiči se sa poslom:* (1) misije dana su zamrznut podskup „Šta me čeka" (isti izvori) prikazan dvaput, drugačijim redosledom
  (hitnost + raznovrsnost + heš datuma, ujutru) i nose primarno dugme table; (2) misija „komentari" broji samo radnje u aplikaciji
  (`igModerationLogs`/`fbModerationLogs`, plan §6.2) — odgovor iz Instagram aplikacije na telefonu je ne zatvara; (3) čip „+25 XP" uz
  „Pozovi" na svakoj kartici Zovi sada (`leads-today.tsx:371–379`) — isti broj na svakoj firmi, ne pomaže izbor, a zlatna je najsjajnija
  boja kartice; (4) „+190 XP danas" na tabli i na Leadovima; (5) XP toast je jedini toast u aplikaciji (`components/ui` nema toast,
  `napredak-feedback.tsx`): svaka radnja pali „+10/+15 XP" 2,5 s — nagrada je glasnija od potvrde posla; (6) tri različita dnevna
  cilja za pozive.
- *Preporuka:* **stanjiti i preurediti, ne ukinuti.** Zadržati: nedeljne ciljeve (kao trake, na tabli u desnoj koloni i na
  `/napredak`, izmenjive na licu mesta), niz (jedan mali znak), nivo/XP/dostignuća/rekorde samo na `/napredak` i u kartici igrača,
  traku novog nivoa i toast dostignuća. Ukloniti sa radnih površina: XP čipove na karticama i koracima, „+XP danas" čipove, toast po
  radnji (zameniti brojačem koji se tiho menja u kartici igrača i zbirom „+75 XP u ovoj sesiji" na kraju Režima poziva). Misije:
  zameniti „Planom dana" = prve tri stavke iz „Šta me čeka", uživo, bez zamrzavanja; nijedna ne nosi primarno dugme (§8/2).
  Podešavanje: tri stanja „Pun / Tih / Isključen", podrazumevano „Tih".

UI:
- [P2] 23 dostignuća u tri kolone, u praznom nalogu 23 siva katanca (`napp-rest.jpg`) — Ciljno: otključana + „Sledeća 3" sa trakom,
  ostalo iza „Sva dostignuća (23)".
- [P2] Najveći broj ekrana je „1.370 / 1.540 XP" (40 px, zlatno), ne nedeljni posao — Ciljno: fokus „Ova nedelja" (tri trake sa
  oznakom cilja i „prošle nedelje N"), XP u jednom redu.
- [P2] Prekidači u Podešavanja → Napredak su u sivoj boji modula `sistem`: „Uključeno" izgleda kao isključeno; „Sačuvaj ciljeve"
  sivo (`x-podesavanja-napredak.jpg`).
- [P3] Mapa aktivnosti: oznake samo Pon/Sre/Pet; „Najjači dan: 210 XP" i „Najviše XP u danu 210 XP" jedno do drugog.
- [P3] Prsten „Sastanci" je cijan (boja table, `MODUL_PRSTENA`), a sastanci žive u Leadovima; „Objave" roze (Instagram) a broje i
  Threads.

UX:
- [P1] Primarno dugme radnog ekrana nosi misija (vidi Kontrolnu tablu) — gamifikacija određuje prioritet posla.
- [P1] Misija koju ne možeš da završiš: „Odgovori na 3 komentara" se zatvara samo radnjom iz aplikacije; ostaje 1/3 i ostaje primarno
  dugme table ceo dan.
- [P2] „Aktivnih dana: 42 od 84" — imenilac broji vikende (12 × 7), iako „vikend nije radni dan" i „Vikend ne prekida niz" je
  podrazumevano uključeno: 50 % umesto ~70 % (42/60). Pogrešan imenilac, protiv pravila poštenja brojeva.
- [P2] Nedeljni ciljevi se menjaju u Podešavanja → Napredak, a prikazuju na tabli, `/napredak` i Leadovima (tempo); nijedan prsten
  nema „Promeni cilj".
- [P2] Jedan prekidač „Prikazuj XP i proslave" za sve (`napredak-settings.tsx`): nema srednjeg režima; podešavanje je lično i „isto
  za sve tvoje projekte", a živi u podešavanjima projekta.
- [P2] Pad upita: „Napredak trenutno nije dostupan … Osveži stranu" bez dugmeta (`bx-napredak-pad`).
- [P3] Zvanja Regrut → Enigma su vojnička; bezopasno, ali u traci zamenjuju ime vlasnika.

Nema smisla:
- Misije i „Šta me čeka" su isti posao u dva spiska sa različitim brojevima i redosledom, na istom ekranu.
- Misija „Pozovi 3 firme" je Završeno dok je dnevni tempo 3/5.
- Na `/napredak` misije su iste kao na tabli, sa još jednim „Odgovori" primarnim — treći put ista lista (tabla, Napredak, ⌘K „Misije dana").

Ciljni kanvas 1536×695:
```
● Kontrolna tabla / Napredak                                                       [Ctrl K] [zvono] [JM]
[trofej] Napredak · iz onoga što je stvarno urađeno                                    [Podesi ciljeve]
┌ OVA NEDELJA (fokus) ───────────────────────────────────────────────────────────────────────────────┐
│ Pozivi    6 / 25  ▮▮▯▯▯▯▯▯▯▯ |cilj   prošle nedelje 22                                               │
│ Sastanci  1 / 3   ▮▮▮▯▯▯▯▯▯▯ |cilj   prošle nedelje 2                                                │
│ Objave    0 / 2   ▯▯▯▯▯▯▯▯▯▯ |cilj   prošle nedelje 1                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
Niz 4 radna dana · Nivo 7 Operativac ▮▮▮▮▮▮▮▯▯ 1.370 / 1.540 XP · danas +190
┌ Aktivnost · 12 nedelja (5 radnih redova) ───────────────┐┌ Lični rekordi (4) ───────────────────────┐
│ …toplotna mapa…  Aktivnih radnih dana 42 / 60           ││ …                                         │
└─────────────────────────────────────────────────────────┘└───────────────────────────────────────────┘
Dostignuća 4 / 23: [4 otključana]  Sledeća: Na liniji 3/10 · Detektiv 9/25 · Moderator 22/50   [Sva →]
```
390×844: „Ova nedelja" tri trake → red niz/nivo → mapa → dostignuća (sklopljena).

### Novosti — `/novosti` — snimci: `bx-novosti-{1536x695,390x844}`, `bx-novosti-prazno-*`, `A2/nov-vp.jpg`, `A2/novm.jpg`

- **Posao:** napisati, proveriti i objaviti članak na sajtu agencije; videti šta je u nacrtu i šta je živo. **Obavlja delimično:**
  tabla je pregledna i staje u jedan ekran, ali nacrti se vide samo na uređaju na kom su pravljeni, a kartica ne kaže šta fali do objave.

UI:
- [P2] Kartica nacrta ne pokazuje stanje kapija: „Test nacrt 2: tekst koji čeka kapije" izgleda isto kao svež nacrt — Ciljno: red
  „Kapije 2/4 · fali: ALT, podnaslov" na kartici; kolona „Spremno za objavu".
- [P2] Kolona „Arhiva" je trećina širine za jednu stavku — Ciljno: „Arhiva (1)" kao filter/veza ispod objavljenih.
- [P3] Nativni `<select>` „Sve kategorije" (39 nativnih selecta u aplikaciji; `components/ui` nema Select) i tri reda meta podataka iste
  težine (slug, tip, datum).

UX:
- [P1] Spisak nacrta je u `localStorage` (`novosti-dashboard.tsx:23–51`: „Spisak nacrta se pamti na ovom uređaju; objavljeni postovi
  stižu iz baze"), iako se sadržaj nacrta upisuje u Convex (`postsStore.create/updateDraft`, `novosti-editor.tsx:158–162`). Nacrt sa
  laptopa ne postoji na telefonu; brisanje podataka pregledača ga sakriva zauvek, iako je u bazi — Ciljno: nacrti iz Convex upita.
- [P2] Žargon: „četiri kapije", „provera humanizera", „Beleška (note)", „Tekst (article)" — Ciljno: „Pre objave: dokaz, prirodan ton,
  opis slike, podnaslov"; „Beleška" / „Članak".
- [P2] IA: Novosti su u „Radni sto" uz tablu i Leadove, a koriste se retko; dnevni posao su pozivi i kanali.

Nema smisla: nacrt postoji u bazi, a do njega nema puta sa drugog uređaja. „Novi post" (Novosti) / „Nova objava" (Instagram) /
„Objavi" (Threads) / „Pošalji video" (YouTube) — četiri glagola za istu nameru.

Ciljni kanvas 1536×695:
```
[ikon] Novosti · članci za enigmait.rs        [Pretraži…] [Kategorija ▾]               [+ Novi članak]
┌ NACRTI 3 ──────────────────────┐┌ SPREMNO ZA OBJAVU 1 ─────────┐┌ OBJAVLJENO 2 · poslednjih 30 d ─────┐
│ Test nacrt 2 · Članak          ││ … · Kapije 4/4   [Objavi]   ││ Test članak 1 · 24.10.  ↗ na sajtu   │
│ Kapije 2/4 · fali ALT, podnas. ││                              ││ Test beleška 2 · 15.10. ↗            │
│ izmenjeno pre 4 d              ││                              ││ Arhiva (1) ▸                          │
└────────────────────────────────┘└──────────────────────────────┘└───────────────────────────────────────┘
```
390×844: segmentirani prekidač „Nacrti 3 · Spremno 1 · Objavljeno 2" + lista; „+ Novi članak" u zaglavlju.

### Podešavanja — `/settings` — snimci: `bx-podesavanja-{1536x695,390x844}` (isečeno u `A2/set-*.jpg`, `A2/setm-a.jpg`), `A2/x-podesavanja-napredak.jpg`

- **Posao:** povezati i održavati izvore podataka, podesiti projekat i pristup. **Obavlja delimično:** sve postoji, ali je
  organizovano po implementaciji; Integracije su 4.729 px (telefon 8.847 px), a fokus kaže suprotno od kartica ispod.

**Odgovor na pitanje 4 (mentalni model).** Nije po Jovanovom modelu. Osam jezičaka meša šest vrsta stvari: podešavanja projekta
(Projekat, Sajt i oglasi), veze i zdravlje (Integracije), dnevnike (Istorija akcija = komande na Meta Ads; Moderacija = ko je obrisao
komentar), lične preference (Napredak — „važe samo za tvoj nalog … isto za sve tvoje projekte"), tim (Pristup) i znanje (Mozak —
ponuda, kupac, ton, skripte). Dnevnici i znanje nisu podešavanja; lične preference nisu podešavanja projekta. Ograničenja budžeta
oglasa su u „Sajt i oglasi", a čuvari CPA/potrošnje u Pravilima; osvežavanje Novosti je ovde, a ne u Novostima; Leadovi, nasuprot
tome, imaju svoja podešavanja u modulu („Podešavanja leadova: niše i ocenjivanje"). Šta se seli — vidi Ciljni kanvas.

UI:
- [P1] Fokus „8 / 8" i „Povezano i aktivno ✓ Instagram" dok kartica Instagrama kaže „Čeka Meta app — dodaj INSTAGRAM_APP_ID/SECRET u
  env", „Stanje sinhronizacije" kaže „Greška — Token je istekao (OAuthException 190)", a raspored „Preskočeno: token je istekao
  (test)" — četiri stanja jedne veze na jednoj strani (`set-vp.jpg`, `set-02.jpg`, `set-03.jpg`). Kod: `activeCount` broji
  `status === "active"`, ne zdravlje sinhronizacije (`connections-settings.tsx:3040–3056`); pilula „Čeka Meta app" pobeđuje stvarno
  stanje veze kad env nije podešen (`:935–955`).
- [P2] Fokus broj i primarno dugme su u sivoj boji modula `sistem` (`text-mod` = #b5bfc9; dugme #9ba6b2): „8 / 8" i „Stanje
  sinhronizacije" izgledaju kao onemogućeni.
- [P2] „Prekini vezu" je trajno otvoren crveni blok u svakoj od 8 kartica — Ciljno: u „⋯" meniju ili u dnu detalja veze, uz potvrdu.
- [P2] GA4 kartica izlistava Admin API: „14 meseci (FOURTEEN_MONTHS)", „(ONCE_PER_EVENT)", „Standardni (GOOGLE_ANALYTICS_STANDARD)",
  „BEAUTY_AND_FITNESS", tokovi, veze ka Google Ads; na telefonu se tabele seku na ivici (`setm-a.jpg`).
- [P2] Telefon: od 8 jezičaka vide se 3, stranica 10,5 visina ekrana.
- [P2] 13 dugmadi bez varijante (puna boja, izgled primarnog) samo u `connections-settings.tsx`.

UX:
- [P1] Mentalni model (gore).
- [P2] Uputstva za programera u vlasničkom UI-ju: „unesi INSTAGRAM_APP_ID i INSTAGRAM_APP_SECRET u Convex environment varijable",
  „OAUTH_CALLBACK_ORIGIN" — poruka bez radnje za vlasnika — Ciljno: „Instagram nije podešen na serveru. [Kopiraj uputstvo za
  programera]".
- [P2] Primarno „Stanje sinhronizacije ↓" skroluje istu stranu (B10 odluka 3); kad Instagram pada, ne piše „Reši: Instagram" jer veza
  formalno nije `error` — Ciljno: „radi" = povezano I poslednji prolaz uspeo; tada primarno postaje „Reši: Instagram".
- [P3] „Mozak" ne kaže šta je unutra; „Istorija akcija" ne kaže da su to samo Meta Ads komande.

Nema smisla: jedna veza, četiri stanja; „Sve je aktivno ✓" iznad „Greška"; Napredak (lično, za sve projekte) u podešavanjima jednog
projekta.

Ciljni kanvas 1536×695:
```
[zupčanik] Podešavanja · Enigma IT
Opšte   Veze 1⚠   Sajt i praćenje   Tim i pristup   Ponuda i glas            ← 5 jezičaka (bilo 8)
┌ VEZE: 7 radi · 1 traži pažnju ─────────────────────────────────────────────── [Reši: Instagram] ┐
│ [GA4 ✓ pre 2 h] [Instagram ⚠ token istekao 3 d · Poveži ponovo] [Facebook ✓] [Threads ✓]         │
│ [Meta Ads ✓]    [Google Ads ✓ · kvota 31 %]                     [YouTube ✓]  [OpenReply ✓]       │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
Stanje sinhronizacije ▸ (raspored, kvote — sklopljeno)     Šta se čuva i kako se opoziva ▸
klik na pločicu → bočni panel: kredencijali, GA4 konfiguracija (sklopljeno), Sinhronizuj, ⋯ Prekini vezu
```
Seli se: Istorija akcija → Oglasi (jezičak „Istorija"); Moderacija → Instagram/Facebook Komentari (filter „Istorija moderacije");
Napredak → avatar meni „Moja podešavanja" (režim Napretka, vikend) i `/napredak` (ciljevi, na licu mesta); granice budžeta oglasa →
Pravila („Globalni čuvar budžeta"); osvežavanje Novosti → Novosti; Mozak → „Ponuda i glas" (skripte i u Režimu poziva).
390×844: lista 8 veza (tačka stanja + ime + poslednji prolaz), dodir → ceo ekran detalja; 5 jezičaka staju bez klizanja ako su kratki.

### Sistem (živi vodič) — `/sistem` — snimci: `bx-sistem-{1536x695,390x844}` (`A2/sis-00…07.jpg`), `A2/x-nov-nivo.jpg`

- **Posao:** izvor istine za doslednost UI-ja. **Obavlja delimično:** tokeni, boje modula, tipografija i primitivi napretka su
  odlični i tačni (B10: 79/79 tokena); ali vodič ne pokriva obrasce u kojima nedoslednost stvarno živi, a na dva mesta uči pogrešno.

UI/UX:
- [P1] Nema pokrivenosti za: `TabNav`/`SectionNav`, bočnu/gornju/donju traku, `DataTable`, polja (`Input`, `Switch`, nativni select),
  `SideDrawer`, grafikone i stanja grafikona, `FeedbackLine/Note`, učitavanje/grešku — `grep` u `app/dev-ux/sistem/*.tsx`: 0 pogodaka.
  Upravo tu su razlike iz §6 (4 modela navigacije, select vs čipovi, 2 oblika zaglavlja).
- [P1] Varijanta `default` izgleda kao `primary` (`components/ui/button.tsx`: puna `bg-primary` = boja modula) ali se ne meri kao
  primarna; 77 dugmadi u `components/app` i `app` renderuje se kao puno dugme bez `data-variant="primary"` (13 u
  `connections-settings.tsx`, 6 u `lead-quick-dialogs.tsx`, 5 u `lead-row-actions.tsx`…), pa „jedno primarno iznad preloma" prolazi
  meru, a ne oko. Vodič ga prikazuje kao red „default" identičan „primary".
- [P2] Vodič krši sopstveno pravilo: primer „Zaglavlje strane i fokus kartica" ima „Započni režim poziva" kao primarno i u zaglavlju i
  u fokus kartici (dva primarna u pogledu), i to za zaglavlje Leadova koje u aplikaciji ne postoji (Leadovi koriste `plain`)
  (`vodic-komponente.tsx:318–363`, `sis-05.jpg`).
- [P2] Matrica 13 modula × 7 varijanti × 5 stanja (455 dugmadi, ~3.000 px), iako na vrhu postoji birač modula koji prebojava celu stranu.
- [P2] Siva primarna (Threads, Podešavanja) se u vodiču vide skoro isto kao kolona „onemogućeno" — problem je vidljiv i nerešen.
- [P3] Pokret prikazuje izračunate vrednosti pod tekućom preferencijom (`--duration-reward .15s` umesto 600 ms pod reduced-motion);
  `--info` ispisan kao `lab(...)`, ostali hex; primer „Misija za start" nudi „+50 XP" za korake kojih nema u `PRAVILA_XP`.

Ciljni kanvas 1536×695:
```
┌ Sadržaj 220 px ─────────────┐┌ [Modul ▾] (jedan birač boje) ─────────────────────────────────────────┐
│ Osnove: tokeni, tip, pokret ││ OBRAZAC: Traka jezičaka                                                  │
│ Ljuska: traka, šina, telefon││  živi primer · pravilo u 2 reda · „koristi: 14 ekrana" · ✕ ne raditi     │
│ Navigacija: jezičci, mrvica ││ OBRAZAC: Dugmad — 6 varijanti × 5 stanja u JEDNOM modulu (default ukinut) │
│ Zaglavlje i fokus           ││ …                                                                        │
│ Podaci: pločica, tabela, graf│                                                                          │
│ Forme · Prekrivači · Stanja ││                                                                          │
│ Napredak · Kanvasi ekrana   ││                                                                          │
└─────────────────────────────┘└──────────────────────────────────────────────────────────────────────────┘
```
390×844: sadržaj kao padajući izbor na vrhu, obrasci jedan ispod drugog. Plus „Kanvasi": 4 šablona strane (Radni spisak, Pregled kanala,
Izveštaj, Podešavanja) sa merama iznad preloma.

### Prijava — `/login` — snimci: `bx-prijava-{1536x695,390x844}` (`A2/prijava.jpg`)

- **Posao:** brz i siguran ulaz. **Obavlja da**, uz zbunjujuće prazno stanje.
- UI: [P2] Primeri u poljima liče na unete vrednosti: „ti@enigmait.rs" i „••••••••••" kao placeholder lozinke, a dugme je prigušeno
  (onemogućeno dok su polja prazna) — izgleda kao da je pregledač popunio polja, a dugme ne radi — Ciljno: bez placeholdera lozinke,
  email primer „ime@firma.rs" vidno prigušen, dugme uvek aktivno, provera pri slanju (poruke greške su već dobre).
- UI: [P3] Podnaslov „Email i lozinka." ne dodaje ništa; „COMMAND CENTER" na engleskom ispod imena.
- UX: [P3] Nema „Zapamti me" / informacije koliko traje sesija (Jovan otvara 10× dnevno).
- Nema smisla: —.
- Ciljni kanvas: isti raspored (brend + kartica), polja sa natpisima iznad, jedno aktivno „Prijavi se", „Zaboravio sam lozinku" kao veza.
  390×844: isto, kartica preko cele širine sa 16 px ivicom.

## 6. Međumodulni nalazi

**Svi modeli navigacije (pitanje 3), sa dokazom:**
1. **Subrute + podstavke levo (2 kolone) dok je traka proširena / `SectionNav` gore u šini i na telefonu:** Analitika (7, grupe
   „Svakodnevno/Detaljno" levo samo kao linija), Instagram (6), Facebook (2), YouTube (2), OpenReply (2), Oglasi (2) —
   `nav-items.ts` `channelTabs`, `app-shell.tsx:340–349`, `app-sidebar.tsx:269–308`.
2. **In-page `TabNav` preko `?tab=`** (mrvica ga ne pokazuje, bočna traka ne zna za njega): Leadovi (Danas | LEADOVI Tabela, Mapa |
   POSAO Rupe 39, Zaostali 3, Sastanci 2 — sa natpisima grupa u traci), Threads (5 jezičaka sa ikonicama: Pregled i analitika,
   Objavljivanje, Moderacija odgovora, Automatizacije (OpenReply), Pretraga i otkrivanje), Podešavanja (8 sa ikonicama), Pravila
   (Čuvari (2) | Istorija okidanja (1)), OpenReply → Automatizacije (Ledolomci i meni | DM log), YouTube → Automatizacije (… | Log
   komentara), Uvoz (… | Istorija uvoza), profil firme (Istorija, Kontakti, Firma i poreklo, Sajt, Landing, Rupe u podacima).
3. **Čipovi-brojači iznad jezičaka koji ponavljaju iste brojeve:** Pravila „Pravila 2 · Aktivna 1 · Okidanja u istoriji 1" iznad
   „Čuvari (2) | Istorija okidanja (1)" (`A2/pravila-ist-vp.jpg`); modul se zove „Pravila", jezičak „Čuvari".
4. **Subruta bez jezička, samo dugmetom:** `/leadovi/uvoz` („Uvoz leadova"), `/ads/nova-kampanja`, `/instagram/objave/<id>`,
   `/napredak` (kartica igrača, meni avatara, ⌘K; nije u bočnoj traci ni u „Više").
5. **Radnja kao jezičak:** Instagram „Nova objava" (jezičak + primarno dugme), Threads „Objavljivanje" (jezičak) + „Objavi" (primarno).
6. **Isto ime, različita mesta:** „Automatizacije" = OpenReply subruta, YouTube subruta, Threads `?tab` „Automatizacije (OpenReply)",
   pa modul Pravila u grupi „Automatizacija"; „Moderacija/Komentari" = Instagram subruta „Komentari" (H1 „Moderacija komentara"),
   Facebook subruta, Threads `?tab` „Moderacija odgovora", YouTube „Log komentara" pod Automatizacijama, Podešavanja → „Moderacija"
   (dnevnik); „Oglasi" = modul i podstavka Analitike; „Podešavanja" = globalna i „Podešavanja leadova"; „Danas" = tri značenja.
7. **Mrvica:** subrute „Modul / Podekran" sa dugim naslovom („Uživo (poslednjih 30 minuta)", „Poruke (Inbox)") koji se razlikuje od
   kratkog natpisa jezička; `?tab` jezičci samo „Modul".
8. **Zaglavlje:** Leadovi `plain` (bez naslova), ostali `module`.
9. **Brojači u jezičcima:** pilula (Leadovi „39"), „(2)" u zagradi (Pravila), `TabBadge` (profil firme).
10. **Biranje metrike grafikona:** čipovi „Prikaži na grafikonu" (Analitika, tabla) naspram nativnog `<select>` „Metrika: Broj
    pratilaca" (Instagram).

**Ciljno pravilo (jedno):** modul = stavka bočne trake bez podstavki; svaki ekran modula ima istu traku jezičaka ispod zaglavlja, uvek
na istom mestu, bez obzira na šinu; svi jezičci su subrute (mrvica „Modul / Jezičak", isti naziv kao jezičak); `?tab=` samo za filtere
unutar ekrana; radnje (Nova objava, Novo pravilo, Nova kampanja, Uvoz) su dugmad, nikad jezičci; brojač u jezičku je uvek pilula.
Threads se svodi na subrute (Pregled, Objave, Komentari, Automatizacije, Pretraga) kao Instagram; „Moderacija" svuda „Komentari".

**Ostalo:**
- **Stanje veza na 7 mesta, 4 vrednosti:** tačka (zelena), meni („Sinhronizovano"), zupčanik (crveni „1"), zvono („Hitno"), dno table
  (crveni čip), Podešavanja (✓ aktivno / Čeka Meta app / Greška), fokus kanala („Spremnost kanala 1/4"). Treba jedan izvedeni status po
  vezi (Radi / Traži pažnju / Nije povezano) koji svi čitaju.
- **Dupli „danas" sloj:** tabla (misije, prstenovi, XP, niz) i Leadovi · Danas („Danas 3/5 poziva", „+190 XP danas", niz) pokazuju isti
  napredak dvaput; 9 od 10 stavki zvona vodi u Leadove.
- **Podešavanja modula su nedosledno smeštena:** Leadovi u modulu; budžet oglasa, osvežavanje Novosti, Puls i dnevnici u globalnim
  Podešavanjima.
- **Period:** globalan po tvrdnji, lokalan po ponašanju (svaki link ga gubi); na istoj strani brojevi imaju 5 različitih perioda bez oznake.
- **Formati brojeva:** „izmereno 1820.00" (Pravila, tačka) uz „12.480" i „1.370" drugde — sve kroz `lib/format`.
- **39 nativnih `<select>`** pored prilagođenih menija; `components/ui` nema Select, Tabs, Sheet, Toast.
- **IA za moj obim:** Kontrolna tabla → „Danas" (Radni sto, prva); Novosti → Kanali (kao „Sajt · Novosti") ako se koriste ređe od
  nedeljno; Napredak ostaje uz početni (kartica igrača, avatar, ⌘K, plus u „Više" na telefonu); Podešavanja = projekat + veze + tim,
  lično ide u avatar meni; Sistem ostaje van navigacije (razvojni).

## 7. Persone

- **Alex (power user):** (1) ⌘K ne nalazi „Pekara Klas" niti broj 064 111 2233; (2) „Započni režim poziva" je u ⌘K tek 4. stavka (posle
  3 zadatka), na tabli ga nema; nema tastera 1–9 za stavke „Šta me čeka"; (3) period se resetuje na svakom prelasku, mora da ga bira
  ponovo; (4) natpis „⌘K" na Windowsu; (5) podstavke cik-cak u dve kolone od 24 px; (6) XP toast posle svake radnje, 2,5 s, dole desno,
  preko sadržaja dok radi.
- **Sam (tastatura/čitač):** (1) tačka statusa izgovara „Sinhronizovano pre 2 h" dok Instagram ne radi 3 dana; (2) „još 7 u zvonu" nije
  kontrola; (3) prekidači „Uključeno" u sivoj — stanje samo položajem i rečju; (4) dugmad 24–28 px u panelu zvona na telefonu;
  (5) nativni datum sa odsečenom godinom „09/30/202"; (6) redosled Tab-a kroz podstavke ide levo-desno-levo; (7) šina je samo ikonice
  (oblačić postoji, ali naziv grupe nestaje).
- **„Jovan za stolom" (1536×695, 10 otvaranja dnevno):** otvori → pola ekrana XP-a, zvanje i prstenovi → primarno je „Odgovori na
  komentare" → da bi zvao, ide Leadovi → Započni režim poziva (2 klika × 10 = 20 klikova dnevno + skeniranje); prihod, ponude i upiti su
  ispod preloma; brojevi na strani imaju pet perioda bez oznake; na dnu „OAuthException 190"; zelena tačka kaže da je sve u redu.
- **„Jovan na terenu" (390×844, jedna ruka):** (1) prvi ekran: red perioda (~90 px) + zaglavlje + pozdrav + jedna misija; „Šta me
  čeka" počinje na ~1.070 px; (2) „Danas" panel pluta sa vrha iako je ćelija dole, dugmad 24–28 px; (3) nema „sastanci danas sa satom",
  samo „1 sastanak danas"; (4) Napredak nije u „Više"; (5) Podešavanja 8.800 px, tabele GA4 se seku; (6) nacrt Novosti sa laptopa ne
  postoji; (7) na telefonu je pozivanje najprirodnije (`tel:`), a Režim poziva nema svoju ćeliju u donjoj traci.

## 8. Veliki predlozi

1. **Kontrolna tabla → „Danas" (zadatak prvo).** Šta: dvokolonski kanvas iz §5 (Sledeći korak + ceo „Šta me čeka" levo; Pozivi danas,
   Sastanci, Poslovanje desno; Kanali ispod preloma). Zašto: početni ekran mora da vodi u posao; danas 50 % prvog ekrana je XP, a poslovni
   brojevi i dugme za poziv nisu iznad preloma. Rizik: Jovan je u prošlom prolazu tražio gamifikaciju („hoću boje, gamifikaciju"); ublaženo
   time što ona ostaje na `/napredak` i kao tihi red. Veličina: **M** (`command-focus.tsx`, `today-block.tsx`, `overview-dashboard.tsx`,
   `poslovanje-kartica.tsx`, `page.tsx`). Gubi se/seli: grafikon i red od 4 broja → već postoje u Analitici/OpenReply/Instagramu; „Šta
   radi" → Atribucija i Instagram; čipovi sinhronizacije → zvono i Podešavanja; misije → `/napredak` + ⌘K ili §8/2; birač perioda → zaglavlje
   sekcije Kanali.
2. **Jedan spisak posla umesto misija + spiska.** Šta: „Plan dana" = prve tri stavke „Šta me čeka", uživo; XP za čišćenje stavki (bez
   zamrzavanja i bez misija koje broje samo radnje iz aplikacije); dnevni cilj poziva = dnevni tempo (jedan broj). Zašto: dve liste istog
   posla sa različitim redosledom i brojevima; misija nosi primarno dugme; tri dnevna cilja za pozive. Rizik: menja se backend Napretka
   (`convex/lib/napredak.ts`: generator misija, niz „bar jedna misija ILI 3 događaja", `verify:napredak` 145 provera), streak definicija.
   Veličina: **M**. Gubi se: dnevni bonus +100 XP za tri misije (može ostati kao „sve hitno očišćeno danas").
3. **Jedan model navigacije.** Šta: pravilo iz §6 — bočna traka samo moduli, druga ravan uvek kao traka jezičaka ispod zaglavlja (subrute,
   mrvica „Modul / Jezičak"), radnje su dugmad; Threads na subrute; „Moderacija" → „Komentari"; Analitika „Oglasi" → „Google Ads".
   Zašto: 4 modela + promena mesta sa šinom; traka danas staje u 695 px samo zahvaljujući 2 kolone od 24 px. Rizik: naučene putanje,
   duboke veze (`?tab=` → preusmeriti na subrute). Veličina: **M–L** (`nav-items.ts`, `app-sidebar.tsx`, `app-shell.tsx`, `section-nav.tsx`,
   `tab-nav.tsx`, Threads/Leadovi/Pravila/Podešavanja stranice). Gubi se: ništa; podstavke iz trake postaju jezičci.
4. **Jedan status veze.** Šta: izvedeni status po vezi „Radi / Traži pažnju / Nije povezano" (radi = povezano I poslednji prolaz uspeo);
   tačka u gornjoj traci postaje „◐ 1 veza ne radi" (žuto, broj, klik → zvono filtrirano na veze) i zelena je samo kad sve radi; Podešavanja
   broje „radi"; env poruke idu u „uputstvo za programera". Zašto: 7 mesta, 4 vrednosti, zelena laže. Rizik: mali. Veličina: **S–M**
   (`sync-status.tsx`, `connections-settings.tsx`, `sync-health-widget.tsx`, `convex/lib/notifications.ts`).
5. **Lepljiv period.** Šta: izbor perioda se pamti (lokalno, `try/catch`) i `ProjekatLink` ga dodaje na ekrane sa `range: true`; birač se
   prikazuje samo gde period menja sadržaj; svaka sekcija sa drugačijim periodom nosi oznaku („7 d", „oktobar"). Zašto: tvrdnja „važi na
   svim ekranima" je netačna i daje neuporedive brojeve. Veličina: **S**.
6. **Podešavanja po mentalnom modelu.** Šta: 5 jezičaka (Opšte, Veze, Sajt i praćenje, Tim i pristup, Ponuda i glas); veze kao pločice
   sa bočnim panelom; dnevnici i lične preference izlaze (spisak u §5). Zašto: 6 vrsta stvari u 8 jezičaka, 4.729 px. Veličina: **M**.
7. **⌘K pretražuje firme** po nazivu i broju (Convex `searchIndex`, bez npm), natpis „Ctrl K". Veličina: **M**.
8. **Novosti iz baze** (nacrti iz Convex upita, `localStorage` samo za nesačuvan unos) + stanje kapija na kartici. Veličina: **S–M**.
9. **Sistem kao pravi izvor istine:** pokriti navigaciju, ljusku, tabele, forme, prekrivače, stanja i kanvase ekrana; ukinuti `default`
   varijantu (77 mesta → `primary`/`secondary`/`outline` po ulozi) uz ESLint pravilo „Button mora imati variant"; ispraviti primer sa dva
   primarna. Veličina: **M**.

## 9. Pitanja za Jovana

1. **Šta je početni ekran?** (a) „Danas": hitan posao + puls posla, gamifikacija tiho (**preporuka**); (b) aplikacija se otvara direktno
   na Leadovi · Danas (pozivi), a tabla postaje „Pregled"; (c) zadržati komandni centar sa misijama kakav je.
2. **Koliko gamifikacije na radnim ekranima?** (a) pun, kao sada; (b) „Tih": ciljevi i niz na radnim ekranima, XP/nivo/dostignuća samo na
   `/napredak`, bez XP čipova i toasta po radnji (**preporuka**); (c) isključen podrazumevano.
3. **Misije dana:** (a) zamrznute ujutru, kao sada; (b) „Plan dana" uživo iz „Šta me čeka" (**preporuka**); (c) ukinuti, ostaju samo nedeljni
   ciljevi.
4. **Druga ravan navigacije:** (a) jezičci uvek ispod zaglavlja, bočna traka samo moduli (**preporuka**); (b) podstavke uvek u bočnoj traci
   (u šini kao meni na hover); (c) ostaviti oba.
5. **Period:** (a) jedan lepljiv period za celu aplikaciju (**preporuka**); (b) svaki ekran svoj period; (c) kao sada.
6. **Gde žive dnevnici i lična podešavanja?** (a) dnevnici u svoje module, lično u avatar meni (**preporuka**); (b) ostaju u Podešavanjima,
   ali u grupama.
7. **Donja traka na telefonu:** (a) Danas · Leadovi · Pozovi (režim poziva) · Instagram · Više (**preporuka**); (b) kao sada (Tabla ·
   Leadovi · Instagram · Danas-zvono · Više).
8. **Novosti u bočnoj traci:** koliko često ih koristiš? (a) ređe od nedeljno → Kanali kao „Sajt · Novosti" (**preporuka**); (b) češće →
   ostaju u „Radni sto".

## 10. Sitnice (P3)

- „Email i lozinka." podnaslov na prijavi; „COMMAND CENTER" na engleskom.
- `DESIGN.md` kaže da ⌘K ima „Radnje / Nedavno / Ekrani"; kod ima i „Projekti" i „Misije dana".
- U ⌘K „Radnje" stoje zadaci iz zvona, stalne radnje i „Skupi ili proširi bočnu traku" zajedno; svi zadaci imaju istu ikonicu Leadova.
- „nerazrešen" (misije) vs „nerešen" (zvono, dostignuće „Čist uvoz") — ista reč, dva oblika.
- „Prihod ovog meseca (€)" i „Upiti (7 d)": valuta i period u zagradi labele, dva obrasca.
- Kad su sve tri prikazane stavke „Hitno" crvene, crvena prestaje da razlikuje.
- Čipovi sinhronizacije na tabli ponavljaju „uspešno" za svaki izvor; dovoljno je prikazati samo kvar.
- Traka novog nivoa kaže samo „Nivo 7 · Operativac" — nivo ništa ne otključava, pa je proslava bez sadržaja (`x-nov-nivo.jpg`).
- `Napredak →` u fokus kartici i „Napredak" u meniju avatara i u ⌘K — tri ulaza, nijedan u „Više".
- Sidebar natpis grupe „RADNI STO" za tri stavke od kojih je jedna retka (Novosti).
- `--info` u vodiču ispisan kao `lab(...)`.
- „Kontrolna tabla" (traka) / „Tabla" (telefon) / „Komandni centar" (plan, komentari koda) — tri imena za isti ekran.
- Mapa aktivnosti: oznake dana samo za Pon/Sre/Pet.
- Panel zvona nema broj u naslovu „Šta me čeka" (broj je samo u `aria-label` okidača).
