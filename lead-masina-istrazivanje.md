# Lead mašina — istraživanje, model i pravila

Referentni dokument za faze LM1–LM13. Piše se jednom, čita se u delovima.
Svaki prompt za Gemini navodi TAČNE linije koje treba pročitati.

Kontekst: Enigma IT (Jovan) prodaje digitalne usluge — izradu sajtova, webshop,
oglase. Poslednji klijenti: turistička agencija, frizerski salon sa webshopom,
prodavac garderobe onlajn. Tržište: Srbija. Tim: 3–4 osobe, svi vide leadove.

---

## 0. Obavezna pravila (važe za SVAKI prompt iz ove serije)

Ista pravila po kojima je građena Threads integracija. Nisu preporuka.

1. **Nikad ne upisuj 0 tamo gde je vrednost nepoznata**, i nikad ne prikazuj
   „nema podataka" tamo gde je stigla prava nula.
2. **Ne čuvaj izvedenu vrednost ni stopu** — čuvaj brojilac i imenilac, računaj
   pri čitanju. Ocena leada se NIKADA ne skladišti kao broj.
3. **Neuspela operacija ne sme da izgleda kao prazan rezultat.** Uvoz koji je
   pao i uvoz bez redova su dva različita ishoda.
4. **Nepoznat uzrok se ne sme prikazati kao poznat.** Nepotvrđen podatak se ne
   sme prikazati kao potvrđen.
5. **Nepoznato stanje nije dozvola da se nastavi** — posebno pred nepovratnom
   akcijom (brisanje, slanje poruke, spajanje dva zapisa).
6. Sirov `email`, telefon ili ime osobe **nikada** u `console.log`, URL ni
   poruku greške. Za dijagnostiku oblika koristi opis strukture, ne sadržaj.
7. Sve poruke ka korisniku: **srpski, latinica**.
8. Svaka nova tabela se registruje u `convex/lib/purgeMap.ts`
   (`TABLE_OWNERSHIP` + odgovarajući `*_STEPS`), inače `npm run build` pada.

---

## 1. Dve mašine, jedna baza

Leadovi ulaze kroz dva potpuno različita toka. Dele iste tabele, ali se
razlikuju po izvoru, pravnom osnovu i načinu ocenjivanja.

**A — Inbound.** Ljudi koji su već dodirnuli naše kanale: komentari, DM-ovi,
mention-i, klikovi na `/r/` linkove, popunjene forme. Podaci već postoje u bazi
(Instagram, Facebook, YouTube, Threads). Pravno najčistije — sami su došli.

**B — Outbound.** Firme koje ne znaju za nas. Ulaze isključivo kroz **uvoz
tabele** koju Jovan sam napravi. Aplikacija NE skrejpuje ništa — vidi §10.

Inbound leadovi se u listi **vizuelno izdvajaju** (oznaka „prvi izvor"), jer su
po definiciji topliji od bilo kog uvezenog reda.

---

## 2. Model podataka

Lead nije red u tabeli. Lead je firma, a u njoj ljudi.

### 2.1 `leadCompanies` — firma

Jedan red = jedna firma. Nosi: naziv, normalizovan naziv (za dedupe), PIB,
matični broj, šifru delatnosti, sajt, domen, ulicu, opštinu, grad, CompanyWall
URL, izvor prvog upisa, datum.

### 2.2 `leadPeople` — osoba unutar firme

Jedan red = jedna osoba, vezana za firmu. Nosi: ime, ulogu (vlasnik / direktor /
menadžer / nepoznato), i pouzdanost te uloge.

**Osoba bez firme ne postoji.** Ako uvoz da osobu bez firme, to je greška uvoza,
ne novi entitet.

### 2.3 `leadIdentities` — svaki kontakt zasebno

Jedan red = jedan telefon, email, IG handle, FB stranica. NIKADA više kontakata
u jednom polju. Svaki nosi: tip, vrednost, da li je verifikovan, i **poreklo**.

### 2.4 `leadFieldProvenance` — poreklo po POLJU, ne po redu

Ovo je razlika između baze koja vredi i baze koja za pola godine postane smeće.

Svako polje nosi: koja vrednost, iz kog izvora, kog datuma, sa kojom
pouzdanošću, i da li ju je čovek potvrdio.

Zašto: u stvarnoj tabeli (§5) red 61 „Pro Team Borča" ima u koloni `Ime_osobe`
vrednost **Adaleta Krasnić**, a u napomeni istog reda piše **„Vlasnik: Ana
Krasnić"**. Dve tvrdnje, isti red, iz istog fajla. Bez porekla poslednji upis
tiho pobeđuje i niko nikad ne sazna da je pogrešio.

Pravilo: **sukobljene tvrdnje se ČUVAJU obe i prikazuju kao sukob.** Spajanje
nikada ne briše tuđu tvrdnju.

### 2.5 `leadSignals` — svaki opažaj kao događaj

Jedan red = jedna opažena činjenica, sa datumom i izvorom. Primeri: „nema sajt",
„koristi Setmore", „samo Facebook", „133 recenzije", „kliknuo /r/ link",
„otvorio besplatnu stranicu", „komentarisao objavu".

Signali se NE sabiraju u broj koji se čuva. Ocena se računa pri čitanju (§4).

---

## 3. Dedupe — ključevi po jačini

Ista firma se pojavljuje kao „Pekara Sunce", „PEKARA SUNCE DOO",
`pekarasunce.rs`, `@pekara_sunce`. Bez strategije spajanja baza je smeće u
drugoj nedelji.

Redosled ključeva, od najjačeg:

1. **PIB** — zvaničan, jedinstven
2. **CompanyWall URL** — stabilan, jedinstven; u Jovanovim tabelama je NAJČEŠĆI
   dostupan ključ jer PIB-a nema
3. **Domen sajta** (normalizovan, bez `www.`)
4. **Normalizovan naziv + grad**
5. **Telefon** (normalizovan na +381 oblik)

Spajanje mora da **čuva obe tvrdnje** (§2.4), ne da prepiše jednu drugom.
Ponovni uvoz iste tabele za mesec dana MORA da spoji, ne da napravi duplikate.

---

## 4. Ocenjivanje — dve ose, nikad jedan broj

**Fit** — koliko firma liči na našeg kupca: branša, veličina, lokacija, ima li
sajt, troši li već na digitalno.

**Intent** — koliko je firma SADA u tržištu: kliknula link, otvorila besplatnu
stranicu, pitala cenu, upravo se otvorila.

Salon bez sajta ima **visok fit, nulti intent** — dobar je, ali nema razloga da
zove danas. Neko ko je poslao DM „koliko košta" ima **visok intent, možda nizak
fit**. Spojeni u jedan broj, oba su izgubljena.

Prikaz je matrica 2×2. Gore-desno se zove danas.

**Ocena se NE ČUVA.** Čuvaju se signali i težine; ocena i objašnjenje se računaju
pri čitanju. Uz svaku ocenu ide **„zašto"** — spisak signala koji su je napravili.
Broj bez objašnjenja je beskoristan posle nedelju dana.

### 4.1 Signali koji za Enigma IT znače fit

Izvedeno iz stvarnih klijenata i iz tabele u §5:

- nema sajt
- **koristi third-party booking (Setmore, Dikidi)** — najjači signal u celom
  skupu: firma je već odlučila da joj treba digitalno i plaća tuđe rešenje
- samo Facebook / samo Instagram, bez sajta
- visok broj recenzija (100+) uz dobru ocenu — posao radi, ima novca
- novootvorena firma

---

## 5. Stvarna tabela — mapiranje i zamke

Analizirana: `Belgrade_Salon_Leads_100_companywall.xlsx`, 100 beogradskih
frizerskih i kozmetičkih salona bez sajta. Pravi fajl, ne primer.

### 5.1 Pet zamki koje MORA da razreši uvoznik

1. **Isti leadovi dva puta.** Sheet „Svi lidovi (100)" je master, a Batch 1–4
   ponavljaju iste redove. Naivan uvoz napravi ~250 redova umesto 100.
2. **Zaglavlje nije u prvom redu.** Red 1 je naslov; zaglavlje je u redu 2.
3. **Redovi-razdelnici unutar podataka** — „BATCH 1 — Lidovi 1-15 (top
   kvalitet)" sa popunjenom samo prvom ćelijom. Parser koji ih ne prepozna
   napravi lead koji se zove „BATCH 1".
4. **U koloni Telefon piše rečenica** — `Proveriti na 011info`. To je NEPOZNATO
   zapisano kao podatak. Mora ući kao prazan telefon + zadatak (§9.2), nikada
   kao string u polju telefona.
5. **Ocena je četiri skale u jednoj koloni** — `5.0 (Google, 53 rec.)`,
   `9.7/10 (SrediMe, 133 rec.)`, `Na 011info`, `468 FB lajkova`. Kao jedan broj,
   salon sa 9.4/10 izgleda bolji od salona sa 5.0/5 — a bolji je drugi.

### 5.2 Mapiranje kolona

| Kolona u fajlu | Postaje |
|---|---|
| `Ime_Salona` | naziv firme + normalizovan naziv za dedupe |
| `Lokacija` | ulica, opština, grad + oznaka „traži proveru" kad piše `(proveriti adresu)` |
| `Telefon` | identitet tipa `phone` **ili prazno + zadatak** — nikada rečenica |
| `Ime_osobe` + `Pozicija` | osoba u firmi, sa ulogom i pouzdanošću |
| `Ocena` | **vrednost + skala (5 ili 10) + broj recenzija + izvor**, sve odvojeno |
| `Napomena_za_prodaju` | i tekst i **razloženi signali** (nema_sajt, koristi_setmore, samo_facebook, visok_broj_recenzija) |
| `Izvor_podataka` | lista izvora + CompanyWall URL + **tačnost podudaranja** |

`Na 011info` i `468 FB lajkova` NISU ocene — to je „ocena nepoznata" plus jedan
drugi signal. Ne pretvarati ih u broj.

`Izvor_podataka` ponegde piše **„CompanyWall (aproks.)"** — skrejper sam kaže da
podudaranje nije sigurno. To je podatak o pouzdanosti koji se sada gubi u tekstu;
postaje polje: podudaranje `tacno` / `priblizno`.

---

## 6. Kanonski CSV format za scraping

Jovan pušta Claude-a da po njegovim uputstvima traži firme (branša + lokacija +
broj + filter tipa „nemaju sajt") na Google Mapama, pa ih dopunjava sa APR-a i
CompanyWall-a. Format izlaza je do sada bio proizvoljan.

Ovo je format koji uvoz očekuje. Neuredni fajlovi i dalje MORAJU da prolaze
(§5), ali ovaj je brz put.

### 6.1 Kolone, tačno ovim redom

```
naziv_firme,ulica,opstina,grad,telefon,email,sajt,ime_osobe,uloga,
ocena_vrednost,ocena_skala,ocena_broj_recenzija,ocena_izvor,
companywall_url,pib,maticni_broj,sifra_delatnosti,napomena,izvori
```

### 6.2 Pravila zapisa

- **Nepoznato = PRAZNA ćelija.** Nikada „Proveriti na 011info", „N/A", „-", „?".
- `uloga`: `vlasnik` | `direktor` | `menadzer` | prazno
- `ocena_skala`: `5` ili `10` — bez toga ocena nema značenje
- `ocena_izvor`: `google` | `sredime` | `yandex` | `011info` | `facebook`
- `telefon`: samo cifre i `+`, bez razmaka i kosih crta
- `izvori`: razdvojeno tačka-zarezom, npr. `google;setmore;companywall`
- jedan red = jedna firma; **bez spojenih ćelija, bez redova-razdelnika,
  bez naslovnog reda iznad zaglavlja**
- jedan sheet, ili CSV

### 6.3 Blok za zalepiti u instrukcije scraping Claude-u

> Izlaz snimi kao CSV sa tačno ovim kolonama i ovim redosledom:
> `naziv_firme,ulica,opstina,grad,telefon,email,sajt,ime_osobe,uloga,ocena_vrednost,ocena_skala,ocena_broj_recenzija,ocena_izvor,companywall_url,pib,maticni_broj,sifra_delatnosti,napomena,izvori`
>
> Pravila: podatak koji ne znaš ostavi kao **praznu ćeliju** — nikada ne piši
> „proveriti", „N/A" ni bilo kakvu rečenicu u polje za podatak. Ocenu razloži na
> vrednost, skalu (5 ili 10), broj recenzija i izvor — u četiri odvojene kolone.
> Telefon zapiši samo ciframa. Jedan red je jedna firma. Bez naslovnih redova,
> bez redova-razdelnika, bez ponavljanja istih firmi u više listova. U `napomenu`
> upiši ono što si video a što bi prodavcu bilo korisno u prvom pozivu.

---

## 7. Landing tracker — najjači signal koji Jovan već proizvodi

Prodajni tok: pozove salon → „istražio sam vas, uradio sam vam besplatnu
stranicu, pogledajte je danas" → dogovori sastanak isto veče → do sastanka
napravi landing page i pokaže ga.

Između poziva i sastanka postoji prozor u kom **on ne zna da li je čovek otvorio
link.** A to je jedina informacija koja mu tada treba.

Aplikacija već ima praćene `/r/` linkove i brojanje klikova (`orTrackedLinks`,
`orLinkClicks`, ruta `/r/` u `convex/http.ts`). Ako svaka besplatna stranica ide
iza praćenog linka, dobija se signal: **„Hair Lab je otvorio stranicu 3 puta,
poslednji put pre 20 minuta."**

To je čovek kog zoveš odmah. Onaj koji do 18h nije otvorio nijednom je čovek
kome šalješ podsetnik, ne kome držiš termin.

Otvaranje stranice je `leadSignal` tipa `landing_opened`, sa vremenom i brojem
otvaranja. **Broj otvaranja i vreme se čuvaju odvojeno; „koliko je vruć" se
računa pri čitanju.**

---

## 8. Pravna pravila (ZZPL / GDPR)

Podaci firme (poslovno ime, PIB, adresa, centrala) **nisu** podaci o ličnosti.
Ime i mobilni vlasnika PR radnje **jesu** — vlasnik PR-a je fizičko lice.

Obavezno od prvog dana, ne kasnije:

1. **`lawfulBasis` i `sourceUrl` po identitetu.** Bez toga ne postoji odbrana.
2. **Brisanje po OSOBI**, ne samo po radnom prostoru. Postojeća mašinerija
   (`purgeMap`, `purgeRuns`) briše po workspace-u; ovo je druga operacija.
3. **Opt-out u svakoj poruci** koja se pošalje iz sistema.
4. Kad podaci nisu uzeti od same osobe, postoji obaveza obaveštavanja u roku od
   30 dana — polje `dataSubjectNotifiedAt` postoji da bi se to moglo dokazati.

---

## 9. Tim, vlasništvo i rupe

### 9.1 Dodela i ishod

Jovan nije sam — 3–4 osobe. Bez vlasništva nad leadom i zabeleženog ishoda
poziva, dva čoveka zovu isti salon u razmaku od dva dana i čovek ih otpiše.

Svaki lead ima vlasnika, poslednji dodir, ishod i sledeći korak.

### 9.2 Rupe kao zadaci, ne kao tišina

Stvarna tabela ima ~20 redova bez telefona i ~30 bez imena osobe. Prazna ćelija
koju niko ne vidi ostaje prazna zauvek.

Tabla piše: **„18 leadova čeka broj telefona"**, „31 lead čeka kontakt osobu".
Rupa koja se vidi se popuni.

### 9.3 Lista „ne diraj"

Postojeći klijenti, oni koji su rekli ne, oni koji su tražili da ih ne zovemo.
Provera se radi **pri uvozu**, ne pri pozivu — inače se sopstveni klijenti
uvoze kao hladni leadovi.

---

## 10. Šta NE gradimo

- **Aplikacija ne skrejpuje.** Ista Meta aplikacija (`1370027634657607`) drži
  Instagram, Facebook stranicu, Threads i Marketing API — i za Enigmu i za
  klijente. Automatizovano prikupljanje vezano za taj identitet rizikuje ban
  koji ne gasi lead mašinu nego sve. Outbound ulazi isključivo uvozom tabele.
- **Ne šaljemo poruke iz sistema u v1.** Gradi se lista „ne diraj" i evidencija,
  ali slanje ostaje ručno dok tok ne bude dokazan.
- **Ne pravimo jedan zbirni broj „vrelina".** Vidi §4.
