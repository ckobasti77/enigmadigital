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
argument-hint: "[grad] [niša] [broj] [ima|nema|svejedno] | obogati <fajl> | oceni-sajtove --izvoz <csv> | oceni-sajt <url>"
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
   alata. Skripta radi na čistom Node-u 20+. Jedini izuzetak je Playwright
   Chromium za snimke ekrana pri oceni sajta — i njega NE instaliraš ti:
   `audit-site` stane sa uputstvom, a Jovan ga instalira jednom
   (`npx playwright install chromium`).
8. **Ne ocenjuj sajt koji nisi video.** Claudeov sud (rubrika ispod) se
   popunjava SAMO nad snimcima iz `out/<run>/sajt/<domen>/`. Bez snimka →
   `claude` ostaje prazan, a `greske` kaže zašto.
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
(`placeId`, `displayName`, `formattedAddress`). Sajt se od Placesa **ne
traži** (skuplji SKU, sajt-ocena-plan §4.5) — postojanje sajta utvrđuješ iz
tri druga izvora u koraku 3.

Ako komanda padne na Places grešci — **STANI**. Prazan rezultat i neuspela
pretraga nisu isto; ne nastavljaj sa nula kandidata kao da grad nema firmi.

### 3. Čitanje izvora (tvoj deo)

Pročitaj `out/<run-id>/kandidati.json`. Za svakog kandidata, **redom, dok ne
ispuniš `broj`**:

1. **Postojanje sajta — OBAVEZNO za SVAKU firmu.** „Nema sajt" je glavni
   prodajni signal Enigme, pa `imaSajt` mora da postoji za svaku firmu (`send`
   odbija slanje ako ijednoj fali). „Nema sajt" sme da se tvrdi tek kad SVA TRI
   izvora to potvrde: CompanyWall polje „sajt" **I** 011info/lokalni imenik
   nemaju sajt **I** web pretraga „naziv + grad" ne vraća sopstveni domen. Ako je bilo
   koji izvor nedostupan → `imaSajt: "nepoznato"` + `imaSajtNapomena` koji imenuje
   proverene i neproverene izvore. Nikad „ne" iz neznanja.
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

### 4b. Ocena sajta — OBAVEZNO kad je filter `ima` ili `svejedno`

Za svaku firmu sa `sajtStatus: "radi"` (posle `check-site`):

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" audit-site --run <run-id>
```

Skripta radi tri stvari po firmi i upisuje `sajtOcena` u `firme.json`:
Lighthouse preko PageSpeed Insights (mobile + desktop), otiske tehnologija
(CMS, e-commerce, alat za zakazivanje…) i snimke ekrana
(`out/<run-id>/sajt/<domen>/pocetna.desktop.jpg`, `pocetna.mobile.jpg`,
`pocetna.tekst.txt`). Greške po firmi idu u `sajtOcena.greske` i ne ruše run.
Ako komanda stane sa porukom o Playwright Chromiumu — **STANI** i prenesi
uputstvo Jovanu (`npx playwright install chromium`, jednom); ili pokreni sa
`--samo lighthouse,tehnologije` pa ocenu bez Claudeovog suda.

**STOP pre tvog dela:** ispiši koliko sajtova ima snimke i procenu trajanja
(≈ 1–2 min po sajtu). Pitaj da li da kreneš.

**Tvoj deo — Claudeova rubrika (sajt-ocena-plan §3, doslovno).** Za svaki
sajt gledaš `pocetna.desktop.jpg`, `pocetna.mobile.jpg` i `pocetna.tekst.txt`
(po potrebi i `kontakt.*`, `ponuda.*` ako postoje), pa popunjavaš
`sajtOcena.claude`:

1. **Prvi utisak (1–5)** — da li izgleda kao sajt koji se održava; jedna
   rečenica sa konkretnim detaljem sa snimka.
2. **Jasnoća ponude (1–5)** — može li posetilac za 5 sekundi da kaže šta
   firma nudi i gde je.
3. **Put do kontakta/zakazivanja/kupovine (1–5)** + `klikovaDoKontakta` —
   koliko klikova od početne do telefona/forme/termina/korpe.
4. **Mobilna upotrebljivost (1–5)** — sa mobilnog snimka: preklapanja,
   sitan tekst, meni, dugmad.
5. **Ažurnost (1–5)** — godina u podnožju, poslednja vest/objava, prazne
   stranice, „u izradi".

Zatim `glavneMane` (≤3, svaka jedna rečenica, svaka vidljiva na snimku),
`prilikaZaEnigmu` (jedna rečenica: šta bi Enigma prodala i zašto baš to),
`preporucenaPonuda` (`nov_sajt` | `redizajn` | `webshop` | `zakazivanje` |
`seo` | `brzina` | `nista`). **Zabrane:** ocenjivanje bez snimka; opšte fraze
bez detalja („sajt je zastareo"); ocena 3 kao podrazumevana (svaka ocena mora
imati razlog).

Oblik u `firme.json`:

```jsonc
"sajtOcena": {
  // … ovo je skripta već upisala: url, auditedAt, verzijaSkilla, lighthouse, tehnologije, cms, snimci, greske
  "claude": {
    "model": "<tačan naziv modela kojim radiš, npr. Claude Opus 4.1>",
    "ocene": {
      "prviUtisak":            { "ocena": 2, "obrazlozenje": "Naslovna slika je razvučena i sa vodenim žigom stock servisa." },
      "jasnocaPonude":         { "ocena": 4, "obrazlozenje": "Prvi ekran kaže „frizerski salon, Vračar" i ima cenovnik." },
      "putDoKontakta":         { "ocena": 2, "obrazlozenje": "Telefon je samo na dnu stranice Kontakt, dva klika od početne." },
      "mobilnaUpotrebljivost": { "ocena": 3, "obrazlozenje": "Meni radi, ali dugme „Zakaži" preklapa tekst na 390 px." },
      "azurnost":              { "ocena": 1, "obrazlozenje": "Podnožje nosi © 2019, poslednja vest je iz 2020." }
    },
    "klikovaDoKontakta": 2,
    "glavneMane": ["Telefon nije vidljiv na početnoj.", "Slike stock servisa sa vodenim žigom.", "Podnožje © 2019."],
    "prilikaZaEnigmu": "Redizajn sa telefonom u zaglavlju i formom za termin, jer salon živi od zakazivanja a sajt ga ne nudi.",
    "preporucenaPonuda": "redizajn"
  }
}
```

Ukupnu ocenu (0–100) ne upisuješ — aplikacija je računa pri čitanju.

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
se ne čuvaju). Ako redovi nose `sajtOcena`, `send` prvo šalje snimke (≤ 2 po
firmi, `POST /generate-leads/snimak`) pa telo; snimak koji ne prođe ne ruši
slanje — ocena ide bez slike, `greske` to kaže, a Claudeov sud se tada NE
šalje (bez snimka nema suda).

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
- Ako postoji `out/<run-id>/nisa-opis.txt`: „Opis niše putuje sa uvozom i
  upisuje se pri „Primeni" — samo ako niša još nema opis. Kopija je u tom fajlu."

## Obogaćivanje postojeće tabele (režim „obogati")

Drugi ulaz: umesto da tražiš nove firme preko Placesa, kreni od tabele koju
Jovan već ima (XLSX/CSV) ili od „Izvezi CSV" iz same aplikacije, dopuni svaki
red kao u `discover` toku, i pošalji — aplikacija spaja dopunu sa postojećim
firmama.

**Okidači:** „/generate-leads obogati <fajl>", „obogati postojeće leadove",
„dopuni tabelu".

**Places se u ovom režimu NE zove.** Trošak Places kvote je nula. Potrebne su
samo `ENIGMA_INGEST_URL`, `ENIGMA_INGEST_TOKEN` i `ENIGMA_CONTACT_EMAIL`
(za `check-site`/`geocode`). `GOOGLE_PLACES_API_KEY` nije potreban.

### Tok

1. **`proveri-env`** (kao korak 0 gore).
2. **Učitaj tabelu:**
   ```
   node "{{REPO_PATH}}/tools/generate-leads/run.mjs" ucitaj --fajl "<putanja.xlsx|.csv>" --nisa <niša> [--list "Svi lidovi (100)"]
   ```
   Ili izvoz iz aplikacije (nosi `company_id`, pa se spaja baš sa tom firmom):
   ```
   node "{{REPO_PATH}}/tools/generate-leads/run.mjs" ucitaj --izvoz "<izvoz.csv>" --nisa <niša>
   ```
   Čita SAMO prvi list XLSX-a (ostali listovi su batchevi); `--list` bira tačan.
   Pravi `out/<run-id>/firme.json` (isti oblik kao `discover`) i njegov snimak
   `firme.ulaz.json`. Run-id: `<datum>-obogati-<naziv fajla>`.
3. **STOP — rezime tabele.** Komanda ispiše koliko ima redova, sa osobom, sa
   CompanyWall linkom, sa telefonom, i koji su redovi bez naziva preskočeni.
   **Reci Jovanu koliko će trajati pre nego što kreneš:** 100 firmi znači ~100
   otvaranja CompanyWall-a + ~60 provera sajta i traje osetno. Ako je tabela
   velika, radi u serijama: `ucitaj … --od 1 --do 25` (svaka serija je svoj
   run-id). Pitaj da li da nastaviš.
4. **Za svaku firmu uradi ISTO što i u `discover` toku** (§3: sajt sa tri
   izvora, CompanyWall/APR, 011info, sajt firme, profili), sa dva dodatka:
   - **Postojanje sajta je OBAVEZNO po firmi** (kao u §3.1). Bez Placesa, tri
     izvora su: **CompanyWall polje „sajt", 011info, web pretraga „naziv + grad"
     (WebSearch)**. Rezultat: `imaSajt` = `da`/`ne`/`nepoznato` + `imaSajtNapomena`
     koja imenuje proverene izvore. `send` odbija slanje ako ijednoj firmi fali
     `imaSajt` (osim uz `--dozvoli-bez-sajta`).
   - **Proveri vrednosti iz tabele** (telefon, osoba, uloga) i upiši `dokazi`
     za njih kao za svaku drugu vrednost.
   - **Ne briši ništa iz tabele.** Ako izvor kaže drugačije, obe vrednosti idu
     dalje: nova kao primarna, stara u `napomena` sa „tabela je imala: …".
     Aplikacija to prikaže kao sukob.
5. **`check-site` → `audit-site` (obavezno kad je `sajt` u `--polja` ili bez
   `--polja`; Claudeova rubrika iz §4b) → `geocode` → `score`** (kao gore).
6. **Slanje:**
   ```
   node "{{REPO_PATH}}/tools/generate-leads/run.mjs" send --run <run-id> [--dry-run]
   ```
   U ovom režimu `send` šalje SAMO redove koji imaju bar jednu NOVU ili
   PROMENJENU vrednost u odnosu na `firme.ulaz.json`. Red bez promene se
   preskače i broji („bez promene: N"). Zastavica `--sve` šalje sve.

### Brzi prolaz: samo neka polja (`--polja`)

Kad treba da se za sto firmi popuni SAMO jedno-dva polja (npr. `imaSajt`), a ne
da se sve istražuje iz početka, `ucitaj` prima `--polja`:

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" ucitaj --fajl "<tabela.xlsx>" --nisa <niša> --polja sajt
```

- Dozvoljena polja: `sajt`, `osobe`, `platforme`, `koordinate`, `sajtOcena`
  (podskup, zarezom razdvojeno: `--polja sajt,osobe`). `sajtOcena` = samo
  ocena sajta (`check-site` → `audit-site` → rubrika → `send`).
- Claude istražuje **SAMO ta polja** po firmi; ostalo se ne dira.
- `send` šalje samo ta polja (+ ključeve za spajanje) i poredi ulaz↔izlaz samo
  po njima; aplikacija pri „Primeni" dira samo ta polja i ne prepisuje ostatak
  praznim.
- Kad `--polja` uključuje `sajt`, `imaSajt` je i dalje obavezan; kad ne uključuje,
  `imaSajt` se ne traži (nije ni predmet tog prolaza).

### Šta Jovan vidi u pregledu uvoza

Uvoz se zove `generate-leads · obogati · <naziv fajla> · <datum>`. Svaki red
nosi bedž **„+N polja"** (šta dopuna donosi) i, ako postoji, **„N sukoba"**.
Iznad tabele je filter **„samo sa sukobom"** — tako se 100 redova pregleda za
pet minuta. Sukob nastaje kad se ista osoba vraća sa drugom ulogom ili drugim
telefonom, ili kad sajt prelazi „nema" → „ima". Ništa ne ulazi u bazu dok Jovan
ne klikne **Primeni**; postojeće firme se dopunjuju, ne prepisuju.

## Ocena sajtova mimo lead-mašine

**`/generate-leads oceni-sajtove [--izvoz <csv>] [--od --do]`** — samo ocena
za firme koje u aplikaciji već imaju sajt. Jovan izveze CSV (Leadovi → Izvezi
CSV, sa filterom `?sajt=ima`), pa:

```
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" oceni-sajtove --izvoz "<izvoz.csv>" [--od 1 --do 25]
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" check-site --run <run-id>
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" audit-site --run <run-id>
# STOP → rubrika §4b za svaki sajt sa snimcima
node "{{REPO_PATH}}/tools/generate-leads/run.mjs" send --run <run-id>
```

Šalje se kao `obogati` sa `polja: ["sajt", "sajtOcena"]` — spaja se po
`company_id` i dira SAMO sajt i ocenu. Pre `audit-site` reci koliko sajtova
ima i procenu trajanja (~30–60 s po sajtu za skriptu + 1–2 min po sajtu za
rubriku).

**`/generate-leads oceni-sajt <url> [--firma <companyId>]`** — jedan sajt, bez
slanja: izveštaj u terminalu (kvalitet, Lighthouse, tehnologije, sud ako je
popunjen) i fajlovi u `out/oceni-sajt/<domen>/`. Sa `--firma` se posle
rubrike šalje za tu firmu: `send --run "oceni-sajt/<domen>" --sve`.

## Greške i šta znače

| Poruka | Značenje |
| --- | --- |
| `Nedostaju promenljive okruženja: …` | Postavi ih i otvori NOVI PowerShell prozor. Ne nastavljaj. |
| `Snimci nisu mogući: …Chromium…` | Jovan jednom pokreće `npx playwright install chromium` iz repoa. Do tada `audit-site --samo lighthouse,tehnologije`. |
| `PSI mobile: HTTP 429` u `greske` | PageSpeed kvota/rafal — ocena ide bez tog dela; ne ponavljaj poziv u petlji. |
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
  Playwright se koristi SAMO za snimke sajta same firme pri oceni sajta.
- Sajt se ne ocenjuje bez snimka; HTML i tekst stranice ostaju na mašini
  (`out/`), u aplikaciju idu samo brojevi, imena tehnologija, rečenice suda i
  dva snimka.
- Telefon nađen samo u Instagram biou SE uvozi, sa izvorom i (obično niskom)
  procenom — čovek odlučuje da li zove.
