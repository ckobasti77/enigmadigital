# Product

<!-- impeccable:product-schema 1 -->

> Izvor: `ui-boost-plan.md` §2 i `CLAUDE.md`. Napisano u B2 bez intervjua (faza
> radi bez čoveka), pa su stavke koje nisu doslovno iz ta dva izvora označene
> sa **(izvedeno)** i čekaju potvrdu.

## Platform

web

## Users

- **Jovan, vlasnik agencije Enigma IT** — jedini aktivan član radnog prostora.
  Otvara aplikaciju desetak puta dnevno, na ekranu 1920×1080 pri 125 %
  skaliranja (1536×695 CSS px, Chrome na Windowsu), ređe na telefonu.
- Posao koji radi: zove male firme u Srbiji i vodi ih od prvog poziva do
  ponude, prati kanale agencije (Instagram, Facebook, YouTube, Threads,
  oglasi), čita analitiku sajta i objavljuje sadržaj.
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

Radna tabla koja vodi kroz dan, a ne izveštaj koji se čita: „šta me čeka",
misije dana i napredak izvode se iz stvarnih radnji u bazi. Broj na ekranu
nikad nije izmišljen, a nepoznato nije nula.

## Operating Context

- Radni dan agencije, računato po zoni Europe/Belgrade; vikend nije radni dan.
- Glavni radni ekran su Leadovi (pozivi, ishodi, sledeći korak, sastanci,
  uvoz iz tabele, mapa za obilazak).
- Podaci stižu sinhronizacijom sa spoljnih servisa; deo kanala je često prazan
  ili nepovezan.
- Referentni prikazi: 1536×695, 1440×900, 390×844.

## Capabilities and Constraints

- Sve radnje koje postoje ostaju dostupne; ništa se ne gubi pri preradi
  izgleda.
- Nema mrtvih kontrola. Kad podatka nema, piše „—" i razlog.
- Napredak (XP, nivoi, misije, niz, dostignuća) se izvodi isključivo iz
  događaja u Convex-u i može da se isključi po korisniku.
- Jezik interfejsa: srpski, latinica. Interne oznake plana i faza se ne
  pojavljuju u tekstu koji korisnik vidi.
- Stek: Next.js 16, React 19, Convex, Tailwind CSS 4, shadcn/ui (`base-nova`),
  GSAP, Recharts. Bez novih npm zavisnosti.
- Neodlučeno: da li i kada aplikacija postaje dostupna klijentima, i šta oni
  tada vide.

## Brand Commitments

- Ime: Enigma Command Center; modul napretka se u interfejsu zove „Napredak".
- Pismo: Aeonik, svuda.
- Tamna tema je jedina tema strane.
- Ton: inženjerski precizan, odrasao; gamifikacija bez crtanog filma.
- Ikonice: samo lucide, bez emodžija.

## Evidence on Hand

- Produkcija: `digital.enigmait.rs`.
- Razvojni prikaz svih glavnih ekrana nad sintetičkim podacima:
  `/<ruta>?ux=1` (`app/dev-ux`), snimci u `nocni-run/ux/`.
- Živi vodič sistema: `/sistem?ux=1`.
- Izmereni kontrasti: `node scripts/contrast-check.mjs`.
- Nema svedočenja klijenata, studija slučaja ni javnih brojki; ne izmišljati
  ih.

## Product Principles

1. Boja je informacija: kaže gde si, u kom je stanju stvar, kojoj kategoriji
   pripada ili šta si zaradio.
2. Jedan fokus i jedna glavna radnja po pogledu.
3. Manje teksta, više signala.
4. Tačnost pobeđuje efekat: broj na ekranu je uvek broj iz podatka.
5. Svaka radnja ostavi trag napretka, a napredak nikad ne blokira posao.

## Accessibility & Inclusion

- WCAG AA: tekst ≥ 4,5:1, kontrole i ikonice ≥ 3:1 (meri skripta).
- Boja nikad nije jedini nosilac značenja; uz nju ide ikonica, broj ili tekst.
- `prefers-reduced-motion`: bez pomeranja i proslava, brojevi tačni odmah.
- Dodirne mete na telefonu ≥ 44 px.
- Cela aplikacija je upotrebljiva tastaturom.
