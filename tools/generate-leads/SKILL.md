---
name: generate-leads
description: >
  Pravi listu leadova (malih firmi u Srbiji) po gradu i niši i šalje je u Enigma
  Command Center na pregled. Koristi kad korisnik kaže „/generate-leads",
  „nađi leadove", „generiši leadove", „nađi mi frizere u Beogradu bez sajta",
  „pronađi firme bez sajta", „napravi listu firmi za obilazak". Kandidate
  otkriva preko Google Places, svaki podatak potvrđuje sa sajta firme,
  CompanyWall/APR-a, 011info-a i javnih profila, računa verovatnoću da telefon
  pripada baš toj osobi i šalje uvoz u staging — čovek pregleda i primenjuje.
user-invocable: true
argument-hint: "[grad] [niša] [broj] [ima|nema|svejedno]"
metadata:
  version: 1.0.0
  repo: enigmadigital
---

# /generate-leads

Izvor: `{{REPO_PATH}}/tools/generate-leads/`. Sve komande ispod pokreći baš tom
apsolutnom putanjom, bez obzira gde je trenutni radni folder.

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" <komanda> [opcije]
```

## Šta radi skripta, a šta ti

| Deterministički deo — `run.mjs` | Tvoj deo — čitanje stranica |
| --- | --- |
| Places Text Search (otkrivanje kandidata) | otvaranje sajta firme, CompanyWall/APR-a, 011info-a, javnih profila |
| provera statusa sajta (HTTP, timeout, parking, SSRF) | izvlačenje imena, uloge, telefona **uz ime**, mejla, IG/FB/TikTok handle-a |
| geokodiranje adrese (Nominatim) | procena koji je izvor primaran i upis `sourceUrl` za svaku vrednost |
| verovatnoća telefona po pravilu (plan §6) | upis **dokaza** na osnovu kojih se ta verovatnoća računa |
| validacija tela i slanje u aplikaciju | pregled rezimea pre slanja |

Ti ne zoveš Places (skripta to radi jednom, u koraku 1) i ne računaš procenu
telefona sam (skripta je računa iz dokaza koje si upisao).

## Zabranjeno — bez izuzetka

1. **Ne dopunjuj podatke iz opšteg znanja.** Ako na stranici ne piše telefon,
   telefona nema. Ime vlasnika koje „znaš" a nisi video na stranici ne postoji.
   Svaka vrednost u `firme.json` mora da ima `sourceUrl` stranice sa koje je
   prepisana.
2. **Ne izmišljaj firme.** Nijedan red ne sme da nastane bez `placeId` iz
   `kandidati.json` ili bez stranice koju si stvarno otvorio.
3. **Ne „zaokružuj" broj do traženog.** Traženo 25, našao 18 → šalješ 18 i
   kažeš „18 od 25". Dopunjavanje iz drugog grada ili slabijim pogocima je
   falsifikat liste.
4. **Ne ponavljaj zahtev ka blokiranom izvoru.** CAPTCHA, 403, „previše
   zahteva" → taj izvor je nedostupan za tu firmu, upiši ga u
   `nedostupniIzvori` i idi dalje. Bez retry-petlje, bez zaobilaženja blokade.
5. **Ne štampaj sirove telefone, mejlove ni imena osoba u odgovoru korisniku.**
   Izlaz su brojevi i statusi („telefona: 14, sa procenom: 9"). Podaci se vide u
   aplikaciji, gde im je mesto.
6. **Ne instaliraj ništa.** Bez `npm install`, bez novih paketa, bez globalnih
   alata. Skripta radi na čistom Node-u 20+.
7. **Ne piši u aplikaciju mimo `send`.** Skill nikad ne dira `leadCompanies` —
   uvoz ide u staging i čovek ga primenjuje.

## Tok

### 0. Provera okruženja

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" proveri-env
```

Ako neka promenljiva fali, komanda je imenuje. **STANI** i traži od korisnika da
je postavi (poruka sadrži tačnu PowerShell komandu). Ne nagađaj vrednosti i ne
ispisuj vrednosti onih koje postoje.

### 1. Argumenti

`/generate-leads [grad] [niša] [broj] [ima|nema|svejedno]`

- **grad** — jedan grad ili opština („Beograd", „Novi Sad", „Zemun"). Za
  beogradske opštine Places često vraća adresu sa „Beograd", pa prosledi
  `--grad "Zemun|Beograd"` (prvi je kanonski naziv, ostali se prihvataju u
  adresi).
- **niša** — slobodan tekst. Skripta je mapira na slug preko `lib/nise.mjs`
  (10 niša: frizeri, kozmetički saloni, turističke agencije, stomatolozi,
  teretane, restorani, auto-servisi, cvećare, pekare, butici).
- **broj** — cilj, 1–50.
- **filter sajta** — `ima`, `nema` ili `svejedno`. **Izostavljen = `svejedno`.**
  Filter bira koje firme ULAZE; status sajta se proverava za sve, uvek.

Ako `discover` kaže da niša nije poznata: **STANI i pitaj korisnika za 2–3
Places upita** (srpski + engleski), pa ih prosledi kao `--upiti "a,b,c"`. To je
jedino pitanje koje ovaj skill sme da postavi. Ne pogađaj upite — pogrešan upit
troši tuđu Places kvotu na pogrešne firme.

### 2. Otkrivanje kandidata

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" discover --grad "Beograd" --nisa frizeri --broj 25 --sajt nema
```

Ispisuje `run-id` i pravi `out/<run-id>/kandidati.json`
(`placeId`, `displayName`, `formattedAddress`, `websiteUri`).

Ako komanda padne na Places grešci — **STANI**. Prazan rezultat i neuspela
pretraga nisu isto; ne nastavljaj sa nula kandidata kao da grad nema firmi.

### 3. Čitanje izvora (tvoj deo)

Pročitaj `out/<run-id>/kandidati.json`. Za svakog kandidata, **redom, dok ne
ispuniš `broj`**:

1. **Postojanje sajta.** „Nema sajt" sme da se tvrdi tek kad SVA TRI izvora to
   potvrde: Places nema `websiteUri` **I** CompanyWall/011info nemaju sajt **I**
   web pretraga „naziv + grad" ne vraća sopstveni domen. Ako je bilo koji izvor
   nedostupan → `imaSajt: "nepoznato"` + `imaSajtNapomena` koji imenuje izvor
   koji nije proveren. Nikad „ne" iz neznanja.
2. **Filter.** `nema` → uzimaš samo `imaSajt: "ne"`. `ima` → samo `"da"`.
   `svejedno` → sve, uključujući `"nepoznato"`. (`nepoznato` ulazi SAMO kod
   `svejedno`.)
3. **CompanyWall / APR** po nazivu + gradu: PIB, matični broj, šifra
   delatnosti, ime osnivača/direktora, pravni oblik (PR / DOO), adresa,
   telefon. `sourceUrl` = ta CompanyWall stranica.
4. **011info** (samo Beograd) ili lokalni imenik: telefon, adresa.
5. **Sajt firme** (ako postoji): kontakt stranica, imena i uloge, telefon uz
   ime, mejl, linkovi ka IG/FB/TikTok.
6. **Javni profili** (IG/FB/TikTok): bio, telefon u biou, link u biou, da li
   profil nosi lično ime osobe ili ime firme.

**Ograničenja (plan §3.5):** najviše **3 stranice po firmi po izvoru**. Blokadu
(CAPTCHA, 403) ne zaobilaziš — upišeš `nedostupniIzvori` i ideš dalje. Ne zoveš
Places ponovo.

Kandidata koji posle svega nema ni telefon, ni mejl, ni profil, ni sajt —
**zadržavaš** (ime + adresa + koordinate su lead za obilazak) i upisuješ
`izvestajSkilla: "bez kontakta"`.

Rezultat upisuješ u `out/<run-id>/firme.json` — lista objekata:

```jsonc
{
  "placeId": "ChIJ…",                  // iz kandidati.json
  "nazivFirme": "Salon Primer",
  "ulica": "Neka ulica 1",
  "opstina": "Vračar",
  "grad": "Beograd",
  "telefon": "+381 11 …",              // broj FIRME (ne osobe)
  "telefonNapomena": "sa kontakt stranice",
  "email": "kontakt@primer.rs",
  "sajt": "https://primer.rs",         // URL koji si SAM otvorio
  "ocena": { "vrednost": 4.7, "skala": 5, "brojRecenzija": 128, "izvor": "…" },
  "companyWallUrl": "https://…",
  "companyWallTacnost": "tacno",       // "tacno" | "priblizno"
  "pib": "…", "maticniBroj": "…", "sifraDelatnosti": "9602",
  "napomena": "…",
  "izvori": ["https://primer.rs/kontakt", "https://companywall.rs/…"],
  "nedostupniIzvori": ["011info"],     // ostaje lokalno, ide u zbirni izveštaj
  "imaSajt": "ne",                     // "da" | "ne" | "nepoznato"
  "imaSajtNapomena": "Places, CompanyWall i pretraga bez sopstvenog domena",
  "platforme": [
    { "vrsta": "instagram", "url": "https://instagram.com/…", "sourceUrl": "https://primer.rs/kontakt" }
  ],
  "osobe": [
    {
      "ime": "Ime Prezime",
      "uloga": "vlasnik",
      "ulogaIzvor": "CompanyWall (osnivač)",   // CompanyWall/APR => potvrđeno
      "telefon": "+381 6…",
      "telefonSourceUrl": "https://companywall.rs/…",
      "dokazi": {
        "brojUAprZapisuOsobe": true,
        "brojUzImeNaSajtu": false,
        "brojUBiouLicnogProfila": false,
        "brojUBiouSalonaJedinaOsoba": false,
        "vrstaBroja": "mobilni",               // "mobilni" | "fiksni" | "nepoznato"
        "istiBrojKaoSalon": false,
        "pravniOblik": "pr",                   // "pr" | "doo_vise_osnivaca" | "nepoznato"
        "samoNaAgregatoru": false,
        "dvaNezavisnaIzvora": true
      }
    }
  ],
  "izvestajSkilla": "nađeno na: sajt, CompanyWall; 011info nedostupan"
}
```

**`dokazi` su ono što si video, ne ono što misliš.** Verovatnoću računa skripta
po pravilu iz plana §6; tvoj posao je da tačno odgovoriš na devet pitanja iz
`dokazi`. Ako nijedan dokaz ne vezuje broj za IME osobe (prva četiri polja),
rezultat će biti „nije moguće proceniti" — i to je ispravan ishod, ne propust.

`platforme[].sourceUrl` je stranica NA KOJOJ si našao link (npr. kontakt
stranica sajta), a `url` je sam profil. Za profil nađen pretragom, `sourceUrl`
je URL samog profila.

### 4. Provera sajta, koordinate, procena

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" check-site --run <run-id>
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" geocode   --run <run-id>
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" score     --run <run-id>
```

- `check-site` proverava SVAKU firmu koja ima upisan `sajt`, bez obzira na
  filter, i upisuje `sajtStatus`, `sajtHttps`, `sajtProverenAt`, `sajtNapomena`.
- `geocode` traži koordinate za firme sa ulicom (Nominatim, 1 zahtev u sekundi
  — komanda traje ~1 s po firmi). Bez ulice ne traži: centar grada nije
  koordinata firme.
- `score` računa verovatnoću i rangira najviše 3 osobe po firmi.

### 5. Pregled pre slanja — **STOP**

Pogledaj rezime koji ispisuju `check-site`, `geocode` i `score`: **brojeve, ne
sadržaj**. Ako nešto očigledno ne valja (npr. 0 firmi sa koordinatama, svi
sajtovi „nepoznato"), reci to korisniku pre slanja.

Provera bez slanja:

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" send --run <run-id> --dry-run
```

### 6. Slanje

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" send --run <run-id>
```

Ispisuje: „Poslato X redova (traženo Y). Places poziva: N. Nedostupni izvori: …"
i URL uvoza. Posle uspešnog slanja skripta briše `kandidati.json` (Places podaci
se ne čuvaju).

Ako aplikacija vrati status koji nije 200, telo ostaje u
`out/<run-id>/payload.json` i slanje se ponavlja bez ijednog novog Places
poziva. Run tada NIJE propao — reci šta je vraćeno i gde je JSON.

### 7. Šta kažeš korisniku na kraju

- „Poslato **X** od **Y** traženih." Ako je X < Y i Places je iscrpljen, dodaj:
  „**<grad>** je iscrpljen za ovaj upit — nije dopunjavano iz drugih gradova."
- „Telefona: N, sa procenom: M." (nikad sami brojevi telefona)
- „Nedostupni izvori: …" ili „svi izvori dostupni"
- „Places poziva: N"
- Link ka uvozu: `https://digital.enigmait.rs/leadovi/uvoz?import=<id>`
- Ako postoji `out/<run-id>/nisa-opis.txt`: „Opis niše je predložen u tom
  fajlu — ingest ga ne prenosi, nalepi ga u Leadovi → Niše → Opis."

## Greške i šta znače

| Poruka | Značenje |
| --- | --- |
| `Nedostaju promenljive okruženja: …` | Postavi ih i otvori NOVI PowerShell prozor. Ne nastavljaj. |
| `Places nije odgovorio kako treba` | Ključ, kvota ili mreža. Run je stao namerno — nula kandidata iz pada nije „grad nema firmi". |
| `0 kandidata` | Places je odgovorio, ali nijedna adresa nije u tom gradu. Proveri naziv grada ili dodaj alijas. |
| `Telo ne odgovara ingest šemi` | Popravi polja u `firme.json` po navedenim putanjama. Vrednosti se namerno ne prikazuju. |
| `401` sa ingesta | Token nije prihvaćen. Novi token: Podešavanja → Pristup → Tokeni za uvoz. |
| `429` sa ingesta | 30 uvoza na sat po radnom prostoru. Sačekaj pun sat i pošalji iz sačuvanog JSON-a. |

## Granice koje se ne pomeraju

- Places se koristi **samo za otkrivanje**; trajno se čuva jedino `placeId`.
  Sve što ulazi u bazu ima `sourceUrl` koji nije Google.
- Koordinate su iz Nominatima (OpenStreetMap), nikad iz Placesa. Na mapi stoji
  atribucija „© OpenStreetMap contributors".
- Nema skrejpera Google Mapsa, nema Puppeteera/Playwrighta za obilazak Placesa.
- Telefon nađen samo u Instagram biou SE uvozi, sa izvorom i (obično niskom)
  procenom — čovek odlučuje da li zove.
