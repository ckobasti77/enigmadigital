# Product

<!-- impeccable:product-schema 1 -->

> Izvor: `ui-boost-plan.md` §2 i `CLAUDE.md`. Napisano u B2 bez intervjua (faza
> radi bez čoveka), pa su stavke koje nisu doslovno iz ta dva izvora označene
> sa **(izvedeno)** i čekaju potvrdu. Dopunjeno odlukama od 27. 10. 2026.
> (`docs/ULTRA-PLAN.md` §1 i §3); one su ispod, u „Odluke 27. 10. 2026.".

## Platform

web

## Users

- **Jovan, vlasnik agencije Enigma IT** — jedini aktivan član radnog prostora.
  Otvara aplikaciju desetak puta dnevno, na ekranu 1920×1080 pri 125 %
  skaliranja (1536×695 CSS px, Chrome na Windowsu).
- Posao koji radi: zove male firme u Srbiji i vodi ih od prvog poziva do
  ponude, prati kanale agencije (Instagram, Facebook, YouTube, Threads,
  oglasi), čita analitiku sajta i objavljuje sadržaj.
- **Telefon je radni alat, ne retkost.** Jovan bira broj na mobilnom, i dok
  radi za računarom: na desktopu „Pozovi" ne otvara `tel:` link, nego
  pokazuje krupan broj, dugme Kopiraj i QR kod; na telefonu ostaje `tel:`
  link. Jovan redovno obilazi firme uživo, pa mu na telefonu treba mapa (U
  blizini, navigacija, kartica ishoda kao list odozdo).
- Kasnije: klijenti agencije, kao čitaoci svojih brojeva. **(izvedeno iz
  `CLAUDE.md`: „later client-facing"; obim nije odlučen)**

## Product Purpose

Enigma Command Center je jedna tabla koja spaja GA4, Instagram uvide,
OpenReply, Meta i Google oglase i bazu leadova, sa Convex-om kao sistemom
zapisa. Uspeh znači da korisnik za tri sekunde po otvaranju zna:

1. gde je;
2. šta je najvažnije na tom ekranu;
3. šta sledeće da klikne;
4. koliko je napredovao.

## Positioning

**Radni sto, ne izveštaj.** Aplikacija prelazi iz izveštaja organizovanog po
alatima u miran radni sto: na vrhu je posao (sledeća firma, prvi upit, red
koji čeka), a svetli samo ono što traži Jovana. Brojevima i statusima se
veruje: isti broj ima istu vrednost na svakom ekranu, jedna veza ima jedan
status, broj na ekranu nikad nije izmišljen, a nepoznato nije nula nego „—" sa
razlogom.

## Operating Context

- Radni dan agencije, računato po zoni Europe/Belgrade; vikend nije radni dan.
- Glavni radni ekran su Leadovi (pozivi, ishodi, sledeći korak, sastanci,
  uvoz iz tabele, mapa za obilazak).
- Pozivi se biraju sa mobilnog: računar pokazuje broj (krupno, Kopiraj, QR),
  telefon zove. Posle poziva aplikacija pita „Kako je prošlo?".
- Teren: Jovan obilazi firme uživo, pa mapa na telefonu (U blizini,
  navigacija, kartica ishoda kao list odozdo) ima prednost pred sređivanjem
  tabele.
- Podaci stižu sinhronizacijom sa spoljnih servisa; deo kanala je često prazan
  ili nepovezan.
- Referentni prikazi: 1536×695, 1440×900, 390×844.

## Capabilities and Constraints

- Sve radnje koje postoje ostaju dostupne; ništa se ne gubi pri preradi
  izgleda.
- Nema mrtvih kontrola. Kad podatka nema, piše „—" i razlog.
- **Valuta:** sve je u evrima, bez preračuna, jer nalozi za oglase rade u
  evrima. Aplikacija i dalje piše valutu koju izvor javi. Ako izvor ikad javi
  drugu valutu, iznos ostaje u toj valuti uz upozorenje i nikad ne dobija
  znak €.
- Napredak (XP, nivoi, ciljevi, niz, dostignuća) se izvodi isključivo iz
  događaja u Convex-u i može da se isključi po korisniku. Podrazumevano je
  tih: na radnim ekranima samo nedeljni ciljevi i niz.
- Jezik interfejsa: srpski, latinica. Mere imaju srpski naziv, a akronim stoji
  u oblačiću. Interne oznake plana i faza, sirovi API nazivi i imena env
  promenljivih se ne pojavljuju u tekstu koji korisnik vidi.
- Stek: Next.js 16, React 19, Convex, Tailwind CSS 4, shadcn/ui (`base-nova`),
  GSAP, Recharts. Bez novih npm zavisnosti.
- Neodlučeno: da li i kada aplikacija postaje dostupna klijentima, i šta oni
  tada vide.

## Brand Commitments

- Ime: Enigma Command Center; modul napretka se u interfejsu zove „Napredak".
- Pismo: Aeonik, svuda.
- Tamna tema je jedina tema strane.
- Ton: inženjerski precizan, odrasao; gamifikacija tiha, bez crtanog filma.
- Ikonice: samo lucide, bez emodžija.

## Evidence on Hand

- Produkcija: `digital.enigmait.rs`.
- Razvojni prikaz svih glavnih ekrana nad sintetičkim podacima:
  `/<ruta>?ux=1` (`app/dev-ux`), snimci u `nocni-run/ux/`.
- Živi vodič sistema: `/sistem?ux=1`.
- Izmereni kontrasti: `node scripts/contrast-check.mjs`.
- Revizija od 27. 10. 2026. (62 ekrana, 116 merenja): `docs/ultra/REVIZIJA.md`.
- Nema svedočenja klijenata, studija slučaja ni javnih brojki; ne izmišljati
  ih.

## Product Principles

1. Boja je informacija: kaže gde si, šta da klikneš, u kom je stanju stvar,
   kojoj kategoriji pripada, šta si zaradio ili čiji je projekat.
2. **Jedna boja radnje.** Primarna radnja ima jednu boju u celoj aplikaciji;
   boja modula kaže „gde si", a ne „šta da klikneš".
3. Jedan fokus i jedna glavna radnja po pogledu; fokus je posao, nikad
   nagrada.
4. Manje teksta, više signala.
5. Tačnost pobeđuje efekat: broj na ekranu je uvek broj iz podatka, a jedna
   veza ima jedan status.
6. **Tih napredak.** Na radnim ekranima su samo nedeljni ciljevi i niz; XP,
   nivo i dostignuća su na strani Napredak. Napredak nikad ne nosi primarno
   dugme i nikad ne blokira posao.

## Accessibility & Inclusion

- WCAG AA: tekst ≥ 4,5:1, kontrole i ikonice ≥ 3:1 (meri skripta).
- Boja nikad nije jedini nosilac značenja; uz nju ide ikonica, broj ili tekst.
- `prefers-reduced-motion`: bez pomeranja i proslava, brojevi tačni odmah.
- Dodirne mete ≥ 44 px na uređajima sa grubim pokazivačem (`pointer: coarse`),
  ugrađeno u primitive.
- Ništa ispod 12 px.
- Cela aplikacija je upotrebljiva tastaturom.

## Odluke 27. 10. 2026.

Jovanove odluke (izvor: `docs/ULTRA-PLAN.md` §1). Faza u zagradi kaže kada se
sprovode; O18–O20 su donete po preporuci.

- **O1** — Početni ekran je „Danas": posao i puls posla. (U9)
- **O2** — Gamifikacija je Tiha: na radnim ekranima samo nedeljni ciljevi i niz; XP, nivo i dostignuća na strani Napredak, bez XP čipova i XP poruke posle radnje; Napredak nikad ne nosi primarno dugme. (U9)
- **O3** — Arhitektura „srednji put": kanali ostaju za mere platforme; poslovi preko kanala dobijaju dom — Zajednica, Objave, Analitika sa tri jezička, jedan ekran Automatizacije. (U10–U15)
- **O4** — Ponuda je zapis: faza, iznos, datum slanja, rok i podsetnik. (U6)
- **O5** — Jedna boja primarne radnje u celoj aplikaciji; boja modula kaže „gde si", a ne „šta da klikneš". (U3)
- **O6** — Broj se bira na mobilnom: na desktopu „Pozovi" pokazuje krupan broj, Kopiraj i QR kod; na telefonu ostaje `tel:` link. (U4)
- **O7** — Faza se nikad ne menja sama: posle Pozovi, Kopiraj ili QR aplikacija pita „Kako je prošlo?" i predlaže fazu, a Jovan potvrđuje Enterom ili menja. (U4)
- **O8** — Posle „Nije se javio" idu 3 pokušaja (+1, +3, +7 radnih dana), pa „Odložen 60 dana". (U5)
- **O9** — Interes (visok, srednji, nizak) zamenjuje Hot/Warm/Cold, izvodi se iz ishoda, uz ručnu izmenu koja važi do sledećeg ishoda. (U4)
- **O10** — Jovan obilazi firme uživo, pa mapa na telefonu (U blizini, navigacija, kartica ishoda kao list odozdo) ide pre sređivanja tabele. (U7)
- **O11** — Razgovori žive u Zajednici: jedan red za sve kanale, sa vezom ka firmi. (U12)
- **O12** — Objave: kalendar i jedan kompozer. (U13)
- **O13** — Upit se broji iz oba izvora, razdvojeno: pozivi iz GA4, forme i poruke iz baze. (U14)
- **O14** — Postoji jedan ekran „Automatizacije"; OpenReply ostaje samo ime motora. (U15)
- **O15** — Jezik mera: srpski naziv, akronim u oblačiću („Cena po rezultatu", oblačić „CPA"). (U3)
- **O16** — Valuta: sve u evrima, bez preračuna; piše se valuta koju izvor javi, a druga valuta ostaje u svojoj valuti uz upozorenje, nikad sa znakom €. (U2)
- **O17** — Na vrhu svakog kanala tri broja iste veličine: Pratioci, Doseg (ili prava mera kanala, npr. YouTube Pregledi) i Upiti, svaki sa natpisom i periodom; bez veze upita stoji „—" sa razlogom. (U11)
- **O18** — Threads pretraga se sakriva dok Meta ne odobri pretragu drugih naloga; YouTube dugme glasi „Otpremi kao privatan" (sporedno), upozorenje je prvi red dijaloga. (U11)
- **O19** — Nova automatizacija počinje u probi i samo beleži šta bi uradila; „Uživo" uključuje Jovan. (U15)
- **O20** — Novosti izlaze iz bočne trake i vide se kao traka u kalendaru Objava, sa svojim uređivačem. (U13)
- **O21** — Snimanje razgovora i prepis govora u tekst su van ovog plana (zaseban projekat). (—)
