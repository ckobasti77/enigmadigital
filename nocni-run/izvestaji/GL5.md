# GL5 — Skill `/generate-leads` (izvor u repou + globalna instalacija)

Datum: 08.09.2026. · Grana: `main` · Model: Opus, effort max

Tačke 1–4 iz prompta su urađene. `npm run typecheck`, `npm run verify:purge` i
novi `npm run verify:gl-skill` (132 provere) prolaze. `npm run lint` nad novim
folderom je čist.

Preduslov: `[GL1]` je na `main` (`e874b42`). GL2–GL4 nisu bili potrebni.

---

## 1. `tools/generate-leads/` u repou

```
tools/generate-leads/
  SKILL.md          uputstvo za Claude (frontmatter + tok + zabrane)
  README.md         instalacija, env, primer runa, značenje poruka, kako se čita uvoz
  install.ps1       globalna instalacija sa zamenom {{REPO_PATH}}
  .gitignore        out/
  run.mjs           CLI: proveri-env | discover | check-site | geocode | score | send | self-test
  lib/nise.mjs      10 niša (slug, upiti sr+en, šifre delatnosti, opis) + mapiranje teksta
  lib/skor.mjs      §6 verovatnoća telefona, čisto i testabilno
  lib/sajt.mjs      §3.8: čista `klasifikuj(odgovor)` + `proveriSajt(url)` sa SSRF zaštitom
  lib/places.mjs    Places Text Search (New), uzak FieldMask, dedup, filter po gradu
  lib/nominatim.mjs geokodiranje, 1 req/s, User-Agent iz env-a
  lib/ingest.mjs    POST na ingest + objašnjenje statusa
  lib/schema.mjs    ručno preslikana ingest šema, bez zavisnosti
  lib/env.mjs       provera promenljivih (imenuje ono što fali, nikad vrednost)
  lib/izlaz.mjs     out/<run-id>/ (atomsko pisanje), ispis
  lib/self-test.mjs 132 provere (§10.5)
```

Bez ijedne nove zavisnosti. Sve radi na čistom Node-u 20+ (`fetch` je ugrađen).
Jedini izuzetak je `self-test`, koji uvozi zod šemu iz
`convex/lib/generateLeadsIngest.ts` (Node 22 skida tipove sam, bez `tsx`).

**Komande i šta rade**

| Komanda | Šta radi | Šta traži iz env-a |
| --- | --- | --- |
| `proveri-env` | nabraja sve četiri promenljive, imenuje one koje fale | — |
| `discover` | Places Text Search po upitima niše, dedup po `place_id`, filter po gradu iz `formattedAddress`, upis `kandidati.json` | `GOOGLE_PLACES_API_KEY` |
| `check-site` | §3.8 za svaku firmu sa sajtom: 1 zahtev, 8 s, ≤ 3 redirekta, bez privatnih adresa | `ENIGMA_CONTACT_EMAIL` |
| `geocode` | Nominatim, ≤ 1 req/s, 1 pokušaj po adresi | `ENIGMA_CONTACT_EMAIL` |
| `score` | §6 nad dokazima iz `firme.json`, rangira ≤ 3 osobe | — |
| `send` | sklapa telo, validira lokalno, POST, rezime po §10.3 k. 6–7 | `ENIGMA_INGEST_URL`, `ENIGMA_INGEST_TOKEN` |
| `self-test` | §10.5, bez mreže i bez ključeva | — |

`kandidati.json` nosi samo `placeId`, `displayName`, `formattedAddress`,
`websiteUri` i briše se posle uspešnog slanja (§3, §O3).

## 2. Globalna instalacija

`tools/generate-leads/install.ps1` kopira `SKILL.md` u
`%USERPROFILE%\.claude\skills\generate-leads\SKILL.md` i u kopiji zameni
`{{REPO_PATH}}` apsolutnom putanjom repoa (kose crte, ne obrnute — putanja ide u
navodnike u komandnim linijama). Piše UTF-8 bez BOM-a (BOM u prvom redu razbija
frontmatter). Ako zamena ne uspe, skripta baca grešku umesto da instalira fajl
sa placeholderom.

**Nije pokrenuta u ovom runu** (globalni folder je Jovanov). Tačna komanda:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\admin\Desktop\Web Dev Projects\enigmadigital\tools\generate-leads\install.ps1"
```

## 3. Tok u `SKILL.md` (§10.3) sa STOP tačkama

Frontmatter: `name: generate-leads`, `user-invocable: true`,
`argument-hint: "[grad] [niša] [broj] [ima|nema|svejedno]"`, opis na srpskom sa
okidačima „/generate-leads", „nađi leadove", „generiši leadove" (+ „nađi mi
frizere u Beogradu bez sajta", „pronađi firme bez sajta"). Provereno
`js-yaml`-om da se frontmatter parsira i da su okidači u opisu.

STOP tačke u fajlu:

1. `proveri-env` prijavi da promenljiva fali → **STOP**, traži se od korisnika.
2. Nepoznata niša → **STOP**, pita se za 2–3 Places upita (jedino pitanje koje
   skill sme da postavi), pa `--upiti "a,b,c"`.
3. Pad Placesa → **STOP** (nula kandidata iz pada nije „grad nema firmi").
4. Pre slanja → **STOP**: pregled rezimea (brojevi, ne sadržaj) i `--dry-run`.
5. Places presušio pre `broj` → šalje se ono što ima, `iscrpljen: true`,
   izričito se kaže „X od Y".

Podela posla skill ↔ Claude je tabela na vrhu `SKILL.md`. Zabrane su nabrojane
kao sedam tačaka: bez dopune iz opšteg znanja, bez izmišljanja firmi, bez
„zaokruživanja" broja do traženog, bez ponavljanja zahteva ka blokiranom izvoru,
bez sirovih telefona/mejlova/imena u izlazu, **bez instaliranja bilo čega**, bez
pisanja u aplikaciju mimo `send`.

Oblik `firme.json` (ono što Claude popunjava) je u `SKILL.md` kao komentarisan
JSON, sa `sourceUrl` za svaku vrednost i sa objektom `dokazi` od devet polja
koji je ulaz za §6.

## 4. Testovi — `npm run verify:gl-skill`

132 provere, sve prolaze, bez mreže i bez ključeva:

- **Skor (§6), 8 slučajeva:** PR zapis + mobilni = 70 (visoko); samo agregator =
  „nije moguće proceniti"; isti broj kao salon = 0 (nisko); DOO više osnivača +
  fiksni = 5 (nisko); IG bio ličnog profila + mobilni = 40; vlasnik bez telefona
  = ni broj ni „nije moguće proceniti"; svi dokazi = 95 (kap); mobilni + PR +
  dva izvora bez ijednog A-dokaza = „nije moguće proceniti". Uz svaki slučaj se
  proverava i da obrazloženje ima **tačno dve rečenice** i **nijednu cifru**
  (sirov broj se ne ponavlja). Plus rangiranje: vlasnik bez telefona ide ispred
  menadžera sa telefonom, najviše tri osobe, rang 1–3.
- **Niše:** 10 mapiranja slobodnog teksta („zubar" → `stomatoloske-ordinacije`),
  jedinstvenost slugova, stabilnost sluga pod `normalizeNicheSlug` iz Convexa,
  postojanje upita na oba jezika, šifara delatnosti i opisa, i da nepoznata niša
  vraća `null` (skill tada pita, ne izmišlja).
- **Šema:** 3 JSON primera kroz **obe** kopije. Primer 1 je pun zahtev sa svakim
  poljem šeme i svim vrednostima enuma (5 vrsta platformi, sva 3 `imaSajt`, svih
  5 `sajtStatus`); primeri 2 i 3 su telefon bez `telefonSourceUrl` i četvrta
  osoba. Poklapaju se **presuda, putanje polja i `code`** (`custom`, `too_big`),
  i granice 200/3/10.
- **Status sajta (§3.8):** 6 lažnih odgovora kroz čistu `klasifikuj()` — 200
  HTML, 200 sa parking potpisom, 302 → `instagram.com`, DNS greška, timeout,
  503 — plus dve provere razlike „nepoznato ≠ ne_radi" (greška mreže, 403) i
  dve provere pune putanje `proveriSajt` koje ne traže mrežu (privatna adresa,
  neispravna šema URL-a).

Namerno sam pokvario `MAX_PEOPLE_PER_ROW` u `lib/schema.mjs` (3 → 4) da bih
video da razilaženje šema stvarno pada: palo je 4 provere sa tačnim opisom
(„zod: pada, lib/schema.mjs: prolazi"), pa sam vratio vrednost.

Osim testova, prošao sam ceo lanac nad **izmišljenim** podacima: `score` →
`send --dry-run` → `payload.json`, pa sam to telo propustio kroz **pravu zod
šemu iz Convexa** — prolazi. Podaci su bili „Test Salon 1", „+381 60 000 0000",
`primer-nepostojeci.rs`; radni folder je posle obrisan.

---

## Odluke koje sam doneo sam (nisu iz prompta ni iz plana)

1. **Svaka komanda proverava samo promenljive koje joj trebaju**, a sve četiri
   proverava nova komanda `proveri-env` koju `SKILL.md` zove kao korak 0. Doslovno
   čitanje („svaka komanda proverava env") bi značilo da `self-test` i `score`
   staju bez Places ključa koji nikad neće zvati — a `self-test` mora da radi u
   noćnom runu, gde nema nijedne tajne.
2. **Alijasi grada idu kroz `--grad "Zemun|Beograd"`**, bez nove zastavice. Prvi
   je kanonski naziv (ide u upit i u telo), ostali se prihvataju u
   `formattedAddress`. Bez toga bi beogradske opštine ostale prazne, jer Places
   za njih često vraća adresu sa „Beograd".
3. **Nepoznata niša se rešava zastavicom `--upiti "a,b,c"`.** Plan kaže da skill
   pita čoveka; ovo je kanal kojim odgovor stiže do skripte, bez upisivanja u
   `lib/nise.mjs` usred runa.
4. **`dokazi` je objekat od devet polja** — jedno po dokazu iz §6. Plan definiše
   bodove, ne oblik ulaza. Ovako Claude odgovara na činjenična pitanja („da li
   broj stoji u APR zapisu te osobe"), a bodovanje ostaje u kodu.
5. **Bez ijednog dokaza grupe A nema broja**, čak i kad postoje B i C dokazi.
   §6 ima dva pravila koja se preklapaju („nema ni A ni B" i „ime uz broj bez
   ijednog A-dokaza"); uzeo sam strože. Posledica: mobilni broj sa sajta firme
   pored kog stoji nečije ime nije „verovatno njen" nego „nije moguće proceniti".
6. **Pod skora je 0 i to je tvrdnja, ne nepoznato.** −30 posle sabiranja postaje
   0 sa obrazloženjem „isti broj je prijavljen i kao broj firme". Razlika prema
   „nije moguće proceniti" je namerna i vidi se u aplikaciji (siv tekst vs.
   crvena traka).
7. **Slučaj „IG bio ličnog profila + mobilni" daje tačno 40 („srednje")**, a
   prompt ga zove „srednje-visoko". Pravilo iz §6 (+25 +15) ne može da da više
   bez A-dokaza od 45 poena. Zadržao sam pravilo i test tvrdi 40; ako je
   nameravano drugačije, menja se tabela bodova u §6, ne kod.
8. **Lista parking potpisa namerno NEMA golo „coming soon" ni „loopia"** — prvo
   stoji na živim sajtovima („nova kolekcija — coming soon"), drugo u podnožju
   sajtova hostovanih kod tog provajdera. Lažno „parkiran" čovek u pregledu
   uvoza ne može da razlikuje od istine, a nosi signal za prodaju.
9. **401/403/429 i 2xx bez HTML sadržaja su `nepoznato`, ne `ne_radi`.** §3.8
   nabraja DNS/timeout/5xx/404; blokada provere nije mrtav sajt (§3.5). Isto
   važi za grešku mreže sa naše mašine (`EAI_AGAIN`, `ENETUNREACH`), dok je
   `ENOTFOUND` stvarno `ne_radi`.
10. **`iscrpljen: true` se šalje samo kad je Places stvarno presušio I kad je
    nađeno manje od traženog.** Ako je posla ostalo (neobrađeni kandidati),
    `iscrpljen` je `false`, a razlika ide u `izvestaj.napomena` („Places nije
    iscrpljen, neobrađenih kandidata: N"). Lažno „iscrpljen" bi zatvorilo grad
    koji nije iscrpljen.
11. **Opis niše ne može da putuje kroz ingest** — zod šema iz GL1 nema polje za
    njega, a šemu ne smem da menjam iz ovog prompta. Zato `send` upisuje tekst u
    `out/<run-id>/nisa-opis.txt`, ispiše putanju i doda putokaz u
    `izvestaj.napomena` (vidi se iznad tabele u pregledu uvoza). Praktična
    posledica: opis nalepljen rukom dobija `opisAutor: "covek"`, ne `"claude"`.
    Šta bi trebalo promeniti opisano je u README-u.
12. **`verify:gl-skill` pokreće `self-test --strogo`.** Van repoa se poređenje sa
    zod šemom preskače uz jasnu poruku (nema `convex/`), ali u repou preskok je
    pad — inače bi test „prolazio" baš kad prestane da proverava ono najvažnije.
13. **`send` odbija da šalje pre `score`-a** kad neka osoba nema `rang`, sa
    porukom koja imenuje komandu. Bez toga bi validacija pala na putanji
    `redovi.0.osobe.0.rang` koja ne kaže šta je uzrok.
14. **„Bez kontakta" broji i sajt kao put do firme.** §10.3 k. 4 nabraja telefon,
    mejl i IG; firma sa živim sajtom ima kontakt formu i nije „bez kontakta".
15. **`CLOSED_PERMANENTLY` se odbacuje, privremeno zatvoreni ostaju**, i oba
    broja se ispisuju posle `discover`.
16. **`discover` skuplja `broj × 3` kandidata i staje na 3 strane po upitu.**
    Faktor je podesiv (`--faktor`), ali podrazumevano troši kvotu srazmerno
    traženom, jer veliki deo kandidata otpadne na filteru sajta.
17. **Šifre delatnosti u `lib/nise.mjs` su moje znanje Klasifikacije delatnosti
    (2010)**, upisane kao pomoć pri pretrazi CompanyWall-a — ne kao tvrdnja o
    konkretnoj firmi. Šifra koja ulazi u bazu prepisuje se iz CompanyWall zapisa
    te firme.

## Popravljeno u toku rada

**Pad razrešavanja imena je obarao celu komandu.** `check-site` nad domenom koji
ne postoji (`ENOTFOUND` iz `dns.lookup` u SSRF proveri) izletao je kao izuzetak
i rušio `check-site` za sve firme, umesto da za tu firmu postane `ne_radi`. To
je najčešći stvarni ishod u niši „firme bez sajta" i najgori mogući način da se
sazna. Sada se greška razrešavanja mapira kao i svaka druga (`ENOTFOUND` →
`ne_radi`), a dve nove provere u `self-test`-u (privatna adresa, neispravna
šema) drže tu putanju pod testom bez mreže.

## Šta NIJE urađeno i zašto

- **`discover` nije pokrenut nad stvarnim gradom.** Prompt to izričito
  zabranjuje (kvota i ključ su Jovanovi). Zbog toga **Places deo nije proveren
  na živom API-ju**: FieldMask, `pageSize: 20` + `nextPageToken`, oblik
  `places[].displayName.text` i `businessStatus` napisani su po dokumentaciji,
  ne po odgovoru.
- **`geocode` nije proveren na živom Nominatimu** — isti razlog (mrežni poziv ka
  tuđem servisu iz noćnog runa).
- **`send` nije poslao nijedan stvaran zahtev** — nema tokena. Provereno je da
  telo koje `send` sklopi prolazi kroz **pravu** zod šemu iz `convex/`, što je
  sve što se može dokazati bez tokena.
- **`install.ps1` nije pokrenut** (po prompt-u) i nije prošao PowerShell parser —
  sandbox u ovoj sesiji blokira i `[System.Management.Automation.Language.Parser]`
  i pokretanje `powershell -Command`. Pregledan je čitanjem.
- **`check-site` je na živoj mreži prošao samo DNS granu** (domen koji ne
  postoji → `ne_radi`). Grane „parking", „redirekcija na Instagram" i „200 HTML"
  proverene su samo kroz čistu `klasifikuj()`, nad lažnim odgovorima.

## Ručna provera na produkciji (`digital.enigmait.rs`)

**A. Instaliraj skill (jednom)**

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\admin\Desktop\Web Dev Projects\enigmadigital\tools\generate-leads\install.ps1"
```
Ispisuje putanju instaliranog fajla i putanju repoa. Otvori
`%USERPROFILE%\.claude\skills\generate-leads\SKILL.md` i proveri da u njemu
**nema** `{{REPO_PATH}}`, nego prava putanja.

**B. Promenljive okruženja**

1. `digital.enigmait.rs` → **Podešavanja** → jezičak **Pristup** → sekcija
   **„Tokeni za uvoz (skill)"** (vidi je samo vlasnik) → **Novi token** →
   **Kopiraj** (token se posle ne može ponovo videti).
2. PowerShell:
   ```powershell
   [Environment]::SetEnvironmentVariable("ENIGMA_INGEST_TOKEN", "<zalepi>", "User")
   [Environment]::SetEnvironmentVariable("ENIGMA_INGEST_URL", "https://<deployment>.convex.site/generate-leads/ingest", "User")
   [Environment]::SetEnvironmentVariable("ENIGMA_CONTACT_EMAIL", "<tvoj email>", "User")
   ```
   (`GOOGLE_PLACES_API_KEY` je već postavljen.) Otvori **novi** prozor.
3. ```
   node "C:/Users/admin/Desktop/Web Dev Projects/enigmadigital/tools/generate-leads/run.mjs" proveri-env
   ```
   Očekivano: četiri reda „postavljeno" i poruka da vrednosti nisu prikazane.

**C. Prvi run (troši Places kvotu — mali broj)**

U novoj Claude Code sesiji: `/generate-leads Beograd frizeri 3 nema`.

Očekivano redom: `discover` ispiše run-id i broj kandidata → Claude pročita
`kandidati.json` i popuni `firme.json` → `check-site`, `geocode`, `score`
ispišu brojeve → `send --dry-run` napravi `payload.json` → `send` ispiše
„Poslato X redova (traženo 3). Places poziva: N." i URL uvoza.

**D. Uvoz u aplikaciji**

1. Otvori URL iz poslednje poruke (`/leadovi/uvoz?import=<id>`) — otvara baš taj
   uvoz.
2. Iznad tabele: upozorenja („Skill 1.0.0, filter sajta „nema", Places poziva:
   N", nedostupni izvori, „Grad je iscrpljen…" ako važi).
3. U tabeli: kolone **Niša**, **Sajt**, **Koord.**, **Osobe** (`Ime · 72 %` ili
   `Ime · bez procene`), **Platforme**.
4. Ako nešto nije u redu — skloni red ili ne primenjuj uvoz. Dok ne klikneš
   **Primeni**, u `leadCompanies` nema ničega.
5. Posle primene: Leadovi → firma → sekcije **Osobe** (traka + obrazloženje),
   **Platforme**, **Poreklo**; Leadovi → **Niše** → niša ima firme, a opis je
   prazan dok ne nalepiš tekst iz `out/<run-id>/nisa-opis.txt`.

**E. Čišćenje testa:** Istorija uvoza → **Poništi** (ako si primenio), pa
Podešavanja → Pristup → **Opozovi** token iz testa.

## Poznati rizici

- **Places nije pozvan nijednom.** Prva stvarna upotreba može da otkrije razliku
  u nazivima polja odgovora ili u paginaciji. Simptom bi bio „0 kandidata" uz
  uredan `pozivi: N` — poruka za taj slučaj postoji i predlaže proveru naziva
  grada/alijasa, ali ne bi pogodila pravi uzrok.
- **Filter grada radi nad `formattedAddress` kao tekstom.** Grad koji Places
  piše drugačije (skraćeno, drugim pismom) obara sve kandidate. Zaobilazak je
  `--grad "A|B"`, ali to treba znati.
- **Plafon od 30 uvoza na sat je po radnom prostoru** (GL1). Ponovljeno slanje
  istog `payload.json` troši isti brojač.
- **Nominatim traži 1 zahtev u sekundi**, pa `geocode` nad 25 firmi traje ~30 s i
  izgleda kao da je stao. To je namerno; skraćivanje razmaka krši uslove.
- **`out/` sadrži lične podatke** (imena, telefoni, adrese). Ignorisan je u
  gitu, ali se ne kopira i ne lepi u chat.
- **Node ispisuje `MODULE_TYPELESS_PACKAGE_JSON` upozorenje** kad `self-test`
  učita `.ts` šemu. Bezopasno je (Node objašnjava da fajl parsira kao ESM), ide
  na stderr i ne utiče na izlazni kod. Nisam gasio zastavicom
  `--disable-warning` jer ta zastavica ne postoji na svim Node 20 izdanjima, a
  README obećava Node 20+.
- **Skor zavisi od poštenja `dokaza`.** Ako Claude označi `brojUAprZapisuOsobe`
  bez pokrića, dobiće se 70 % za broj koji je nasumičan. `SKILL.md` to zabranjuje
  izričito, ali kod to ne može da proveri — jedina odbrana je `sourceUrl` uz
  svaku vrednost i ljudski pregled pre primene.
- **`npm run lint` ima 1287 grešaka i 21396 upozorenja u celom repou** — sve
  zatečene (uglavnom `no-explicit-any` u `scripts/verify-gads-*.ts`), nijedna u
  `tools/generate-leads/`, koji je čist.

## Dodati fajlovi

- `tools/generate-leads/SKILL.md`
- `tools/generate-leads/README.md`
- `tools/generate-leads/install.ps1`
- `tools/generate-leads/.gitignore`
- `tools/generate-leads/run.mjs`
- `tools/generate-leads/lib/nise.mjs`
- `tools/generate-leads/lib/skor.mjs`
- `tools/generate-leads/lib/sajt.mjs`
- `tools/generate-leads/lib/places.mjs`
- `tools/generate-leads/lib/nominatim.mjs`
- `tools/generate-leads/lib/ingest.mjs`
- `tools/generate-leads/lib/schema.mjs`
- `tools/generate-leads/lib/env.mjs`
- `tools/generate-leads/lib/izlaz.mjs`
- `tools/generate-leads/lib/self-test.mjs`
- `nocni-run/izvestaji/GL5.md`

## Izmenjeni fajlovi

- `package.json` (`verify:gl-skill`)
