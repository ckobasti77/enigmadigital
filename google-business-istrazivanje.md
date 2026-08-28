# Google Business Profile API — istraživanje pre planiranja

Stanje na dan 27.08.2026. Sve tvrdnje su iz zvanične Google dokumentacije;
gde nešto NISAM mogao da potvrdim, izričito piše da nije potvrđeno.

---

## 0. Jedna stvar koju treba znati pre svega ostalog

**Google Business Profile API ne služi za pronalaženje tuđih firmi.**

Radi isključivo nad profilima koje tvoj Google nalog **poseduje ili
sa-upravlja**. Svaki poziv ide kroz `accounts/{accountId}/locations/{locationId}`,
gde je `accountId` tvoj nalog. Ne postoji način da preko ovog API-ja saznaš
da li neki salon u Beogradu ima sajt ili koliko ima recenzija — osim ako ti
taj salon nije dao pristup svom profilu.

To znači da GBP API **ne rešava lead mašinu**. Rešava nešto drugo, i to nešto
je verovatno vrednije: pretvara „Enigma vodi Instagram i Facebook klijenta" u
„Enigma vodi i Google profil klijenta", iz iste kontrolne table.

Za pronalaženje firmi postoji drugi proizvod — **Places API** — sa sasvim
drugim pravilima i sa ozbiljnim pravnim ograničenjem. To je §7.

---

## 1. Kompletna porodica API-ja

Google Business Profile nije jedan API nego deset zasebnih servisa plus jedan
stari. Svaki se posebno uključuje u Cloud projektu i svaki ima svoju kvotu.

| API | Verzija | Šta radi |
|---|---|---|
| Account Management API | v1.1 | Nalozi, ko sme da upravlja profilom, pozivnice |
| Business Information API | v1 | Podaci lokacije: naziv, adresa, radno vreme, kategorije, telefon, sajt |
| Performance API | v1 | Brojke: prikazi, klikovi, pozivi, rute, ključne reči |
| Media API | v1 | Otpremanje fotografija i videa na profil |
| Notifications API | v1.2 | Pub/Sub obaveštenja u realnom vremenu |
| Verifications API | v1 | Verifikacija lokacije i „Voice of Merchant" status |
| Place Actions API | v1 | Linkovi za akciju: zakazivanje, rezervacija, naručivanje |
| Lodging API | v1.2 | Samo smeštaj (hoteli, apartmani) |
| Q&A API | v1 | **MRTAV** — vidi §2 |
| Business Calls API | v1 | **MRTAV** — vidi §2 |
| Google My Business API | v4.9 | Stari API. Ovde i dalje žive **recenzije** i **objave** |

Ključno: **recenzije i objave (local posts) NEMAJU novi API.** Jedini način da
im se priđe je stari v4.9. Google ga nije ugasio, ali ga i ne razvija.

---

## 2. Šta je mrtvo — ne planirati

**Q&A API — ugašen 3. novembra 2025.**
Google je najavio 15.09.2025, ugasio 03.11.2025. Doslovno iz dokumentacije:
„You can no longer read or post questions and answers using the API."
Napomena: referentni pregled ga i dalje prikazuje u listi API-ja. To je zastarela
stranica — promptovi koji bi se oslonili na nju pravili bi nešto što ne postoji.

**Business Calls API — ugašen 30.05.2023.** Istorija poziva sa profila više nije
dostupna. Zamene nema.

**v4 `reportInsights` — ugašen 30.03.2023.** Zamenjen Performance API-jem.
Stare metrike (`QUERIES_DIRECT`, `VIEWS_MAPS`, `ACTIONS_PHONE`…) su nestale;
neke su preslikane u nove (`VIEWS_MAPS` → `BUSINESS_IMPRESSIONS_*_MAPS`,
`ACTIONS_PHONE` → `CALL_CLICKS`), a većina nema zamenu.

**v4 `localPosts.reportInsights` — ugašen 20.02.2023.** Statistika po pojedinačnoj
objavi više ne postoji. Možeš objaviti post, ali ne možeš saznati koliko je
ljudi videlo baš njega.

---

## 3. Pristup i kvote — ovo je uslov, ne formalnost

Pristup se **ne dobija automatski.** Uslovi iz dokumentacije:

1. Google nalog i Cloud projekat.
2. **Verifikovan Google Business Profile koji postoji najmanje 60 dana.**
3. **Sajt koji predstavlja tu firmu.**
4. Popunjena „GBP API contact form", opcija *Application for Basic API Access*.
5. Prijava mora doći sa mejla koji je **vlasnik ili menadžer** tog profila.

Kako se proverava da li je odobreno: u Cloud konzoli, kvota za API.
**0 QPM = nije odobreno. 300 QPM = odobreno.**

Kvote posle odobrenja:
- Sve API-je: **300 upita u minuti**.
- Business Information: 300 QPD za kreiranje lokacije, 300 QPD za
  `SearchGoogleLocation`, 10.000 QPD za izmene lokacije.
- **Izmene: 10 u minuti po profilu — ovo se ne može povećati.**
- Povećanje kvote se odbija ako je prosečno korišćenje ispod 50% postojeće.

**Pitanje za tebe:** da li Enigma IT ima verifikovan Google profil stariji od
60 dana? Ako nema, prvi korak nije kod nego otvaranje i verifikacija profila,
i onda 60 dana čekanja. To menja redosled celog plana.

---

## 4. TREBA MI — jasna vrednost za ono što već radiš

### 4.1 Recenzije (v4.9 `accounts.locations.reviews`)

Čitanje svih recenzija, odgovaranje, izmena i brisanje odgovora.
Novo u 2026: kad Google odbije tvoj odgovor, API sada vraća **koje pravilo je
prekršeno** — ranije je odgovor prosto nestajao bez objašnjenja.

Zašto ti treba: već imaš OpenReply za komentare na Instagramu i Facebooku.
Google recenzija je isti posao — javni komentar na koji se odgovara — samo
na kanalu koji za lokalni biznis vredi najviše. Salon sa 133 recenzije na
koji niko ne odgovara je tvoja prodajna priča i tvoja usluga u isto vreme.

### 4.2 Performance API — brojke profila

Metrike koje postoje (potvrđeno iz `DailyMetric` enum-a):

- `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`
- `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`
- `BUSINESS_IMPRESSIONS_MOBILE_MAPS`
- `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`
- `CALL_CLICKS` — klikovi na dugme „pozovi"
- `WEBSITE_CLICKS` — klikovi na sajt
- `BUSINESS_DIRECTION_REQUESTS` — traženja rute
- `BUSINESS_CONVERSATIONS` — poruke
- `BUSINESS_BOOKINGS` — rezervacije preko Reserve with Google
- `BUSINESS_FOOD_ORDERS`, `BUSINESS_FOOD_MENU_CLICKS` — samo ugostiteljstvo

Plus zaseban poziv: **ključne reči kojima su ljudi našli firmu**, mesečno
(`locations.searchkeywords.impressions.monthly`).

NIJE POTVRĐENO: koliko meseci unazad podaci sežu i da li postoji donji prag
ispod kog se ključna reč ne prikazuje. Dokumentacija to ne navodi na stranicama
koje sam pročitao. To se saznaje prvim pravim pozivom, ne pretpostavkom.

Zašto ti treba: ovo je jedini kanal u tvojoj aplikaciji gde vidiš **nameru
kupca u trenutku kad kupuje**. „Pozvao je iz Mapa" nije isto što i „lajkovao
objavu". Za frizerski salon je to jedina brojka koja se pretvara u novac.

### 4.3 Business Information API — podaci lokacije

Radno vreme, praznično radno vreme, telefon, sajt, kategorije, opis, atributi.
Čitanje i izmena.

Zašto ti treba: menjanje radnog vremena za tri klijenta pred praznik je posao
od pola sata klikanja po tuđim nalozima. Ovde je jedan poziv. I to je usluga
koja se naplaćuje.

### 4.4 Notifications API — obaveštenja u realnom vremenu

Ide preko Google Cloud Pub/Sub. Potvrđene vrste obaveštenja:

- `NEW_REVIEW` — stigla nova recenzija
- `UPDATED_REVIEW` — recenzija izmenjena
- `NEW_CUSTOMER_MEDIA` — korisnik dodao fotografiju na profil
- `GOOGLE_UPDATE` — Google predlaže izmenu podataka o firmi
- `DUPLICATE_LOCATION` — profil označen kao duplikat
- `VOICE_OF_MERCHANT_UPDATED` — promena statusa „profil je aktivan i vidljiv"
- `NEW_QUESTION`, `UPDATED_QUESTION`, `NEW_ANSWER`, `UPDATED_ANSWER` — mrtvi
- `LOSS_OF_VOICE_OF_MERCHANT` — zastareo, prešlo u `VOICE_OF_MERCHANT_UPDATED`

Zašto ti treba: `VOICE_OF_MERCHANT_UPDATED` i `GOOGLE_UPDATE` su tihi ubice.
Google sam promeni podatke o firmi ili suspenduje profil, klijent ne primeti
mesec dana, i onda kriviš sebe. Obaveštenje to pretvara u zadatak istog dana.

Napomena: Pub/Sub je **novi deo infrastrukture** koji aplikacija do sada nema.
Threads i Meta webhook-ovi idu direktno na HTTP rutu; ovde ide preko Google-ove
redoslednice. To nije teško, ali nije ni besplatno u vremenu.

---

## 5. MOŽDA — zavisi od toga šta hoćeš da prodaješ

### 5.1 Local Posts (v4.9) — objave na Google profilu

Vrste: `STANDARD`, `EVENT`, `OFFER`, `ALERT`.
`CALL_TO_ACTION` dugmad: BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL.
Product Posts se **ne mogu** praviti preko API-ja.

Za: već imaš mašinu za objavljivanje (Threads, Instagram). Dodati Google
profil kao još jedan cilj iste objave je mala izmena, velika prodajna priča:
„objavimo jednom, ide na četiri mesta".

Protiv: **statistika po objavi ne postoji** (ugašena 2023). Objavljuješ u
mrak — vidiš samo zbirne brojke profila, nikad „ovaj post je doneo 12 poziva".
Za tvoj način rada, gde je svaka brojka morala da ima poreklo, to je neprijatno.

### 5.2 Media API — fotografije

Otpremanje slika na profil, čitanje slika koje su dodali gosti.

Za: salon koji dobija fotografije od gostiju a ne odgovara na njih propušta
signal. `NEW_CUSTOMER_MEDIA` obaveštenje plus pregled u aplikaciji.

Protiv: samo po sebi ne donosi novac. Ima smisla tek uz recenzije.

### 5.3 Place Actions API — link za zakazivanje

Dodaje dugme „Zakaži" direktno na Google profil, sa tvojim linkom.

Za: ovo je **direktno povezano sa tvojim postojećim lead signalom**
`koristi_third_party_booking`. Salon koji plaća Setmore ili Dikidi može da
dobije dugme na Google profilu koje vodi na sistem koji si mu ti napravio.
Prodajna rečenica se sama piše.

Protiv: ima smisla tek kad stvarno praviš sisteme za zakazivanje. Ako ne
praviš, ovo je funkcija bez sadržaja.

### 5.4 Account Management API — pozivnice za pristup

Pozivanje Enigme kao menadžera na klijentov profil, iz aplikacije.

Za: onboarding klijenta bez „pošalji mi pristup pa mi javi".
Protiv: radi se jednom po klijentu. Sa tri klijenta godišnje, ručno je brže.

### 5.5 Verifications API

Verifikacija nove lokacije i provera „Voice of Merchant" statusa.

Za: ako budeš otvarao profile klijentima od nule.
Protiv: verifikacija ide razglednicom ili telefonom i ionako traži čoveka.
Ono što je stvarno korisno — status profila — dolazi kroz obaveštenja (§4.4)
bez ovog API-ja.

### 5.6 `googleLocations.search` (Business Information API)

Jedini poziv u celoj porodici koji vidi lokacije **van** tvog naloga.
Pretraga Google-ove baze lokacija po nazivu ili adresi, do 10 rezultata.

**Ovo NIJE alat za lead mašinu, ma koliko tako izgledalo.** Namena mu je da
nađe postojeću lokaciju koju hoćeš da preuzmeš, pre nego što napraviš duplikat.
Kvota je 300 poziva **dnevno** — sa tvojih 100 salona po branši i lokaciji,
potrošiš je za pola sata. I ne vraća ono što tebi treba (da li ima sajt, koliko
ima recenzija) na način na koji Places API vraća.

Gde JESTE koristan: kad uvezeš tabelu od 100 salona, ovo može da proveri da li
neki od njih već ima Google profil i da vrati njegov identifikator. To je
signal koji tvoj skoring nema: **firma sa Google profilom naspram firme bez
njega.** Ali 300 dnevno znači da ide u paketima, ne odjednom.

---

## 6. NE TREBA

- **Lodging API** — samo hoteli i apartmani. Tvoji klijenti nisu to.
- **Food / menu metrike** — samo ugostiteljstvo. Ako ne prodaješ restoranima,
  te tri metrike su prazne kolone.
- **Q&A i Business Calls** — mrtvi, vidi §2.

---

## 7. Places API — drugi proizvod, i pravna mina

Ovo je ono što ljudi misle kad kažu „Google API za pronalaženje firmi".
**Nije deo Business Profile porodice.** Zaseban proizvod, zasebna naplata.

Text Search (New) vraća, po nivoima naplate:

- **Pro**: naziv, adresa, koordinate, tip delatnosti, fotografije, Maps link
- **Enterprise**: **`websiteUri`**, **`nationalPhoneNumber`**, **`rating`**,
  **`userRatingCount`**, `businessStatus`, radno vreme
- **Enterprise + Atmosphere**: recenzije, rezervabilnost, parking i ostalo

Polja podebljana gore su **tačno tvoji lead signali**: ima li sajt, koji je
telefon, kolika je ocena, koliko recenzija. Tehnički, ovo bi zamenilo ručni
scraping koji sad radiš.

**Ali:** pravila o čuvanju su restriktivna i nedvosmislena.

> „the place ID, used to uniquely identify a place, is exempt from the caching
> restrictions. You can therefore store place ID values indefinitely."

> „You must not pre-fetch, cache, or store Places API content beyond the
> allowed exceptions."

Dakle: **`place_id` smeš da čuvaš zauvek. Naziv, telefon, sajt, ocenu i broj
recenzija — ne smeš.** Gradnja sopstvene baze firmi od Places podataka je
izričito zabranjena. Postoje ograničeni izuzeci u opštim Maps Platform
uslovima, ali osnovno pravilo je ovo.

Šta to znači za tebe konkretno: `leadCompanies` tabela puna podataka iz Places
API-ja je kršenje uslova. Tabela koja čuva `place_id` i sve ostalo dovlači
uživo pri svakom otvaranju ekrana je u redu — ali to je drugi sistem od onog
koji smo napravili, i košta po pozivu.

Postoji i treće čitanje: podaci koje si **sam prikupio** (kroz tabele koje
ručno uvoziš) nisu Places podaci i na njih se ova pravila ne odnose. Zato je
tvoja postojeća mašina — uvoz tabela — pravno čistija od Places integracije.

**Moj sud:** Places API je zaseban razgovor i zaseban rizik. Ne bih ga mešao
sa GBP integracijom. Ako ga budeš hteo, radi se kao izdvojena faza sa pravnim
delom napred, ne kao dodatak.

---

## 8. Kako se ovo uklapa u aplikaciju koju već imaš

Dobra vest: infrastruktura postoji.

- `providerValidator` u `convex/lib/providers.ts` već ima `ga4`, `google_ads`,
  `youtube` — dodaje se `google_business` kao još jedan.
- Google OAuth tok već radi na tri mesta (`convex/lib/ga4Api.ts`,
  `googleAdsApi.ts`, `youtubeApi.ts`). GBP traži svoj opseg
  (`https://www.googleapis.com/auth/business.manage`), ali obrazac je isti.
- `syncRuns`, `connections`, `purgeMap` — sve već postoji i primenjuje se.
- Recenzije se uklapaju u OpenReply obrazac (komentar → odgovor → log).
- Performance metrike se uklapaju u postojeći obrazac analitike.

Loša vest: **Pub/Sub je novo.** Obaveštenja ne stižu na HTTP rutu kao Meta
webhook, nego kroz Google-ovu redoslednicu koju treba napraviti, dati joj
dozvolu za `mybusiness-api-pubsub@system.gserviceaccount.com`, i pretplatiti se.

I još jedna: **v4.9 za recenzije i objave.** Star API, drugačiji oblik odgovora
od novih v1 API-ja. Ne može se tretirati kao da je isto.

---

## 9. Pitanja na koja mi treba tvoj odgovor pre planiranja

1. **Imaš li verifikovan Google profil za Enigma IT, stariji od 60 dana?**
   Bez toga se pristup ne dobija i sve ostalo čeka.

2. **Ovo je za tebe ili za klijente?** Ako je za klijente, koliko ih ima Google
   profil i koliko njih bi ti dalo pristup? Sa dva klijenta ovo je hobi; sa
   deset je proizvod.

3. **Recenzije: samo čitanje i prikaz, ili i odgovaranje iz aplikacije?**
   Odgovaranje je vrednije ali povlači istu vrstu pravila kao OpenReply —
   ko sme da odgovori, šta se loguje, šta ako Google odbije odgovor.

4. **Objave na Google profil — da ili ne?** Podsećam: nema statistike po
   objavi. Ako te to smeta koliko je smetalo kod svega ostalog, možda ne.

5. **Places API — hoćeš li uopšte da otvaramo tu temu?** Ako hoćeš, ide kao
   zaseban plan sa pravnim delom napred.

---

## 10. Izvori

- Pregled API porodice: developers.google.com/my-business/ref_overview
- Preduslovi za pristup: developers.google.com/my-business/content/prereqs
- Kvote: developers.google.com/my-business/content/limits
- Raspored gašenja: developers.google.com/my-business/content/sunset-dates
- Q&A change log (gašenje 03.11.2025): developers.google.com/my-business/content/qanda/change-log
- Performance API: developers.google.com/my-business/reference/performance/rest
- DailyMetric: developers.google.com/my-business/reference/performance/rest/v1/DailyMetric
- NotificationSetting: developers.google.com/my-business/reference/notifications/rest/v1/NotificationSetting
- v4.9 (recenzije, objave): developers.google.com/my-business/reference/rest
- Places API pravila čuvanja: developers.google.com/maps/documentation/places/web-service/policies
- Places Text Search polja: developers.google.com/maps/documentation/places/web-service/text-search

---

## 11. ODLUKA O OBIMU (27.08.2026) — ovo poništava delove §4, §5 i §7

Posle razgovora, obim je sužen. Sekcije iznad ostaju kao zapis šta API sve
nudi, ali **plan implementacije prati SAMO ovu sekciju.** Brojevi redova u
§0–§10 se ne pomeraju, da promptovi mogu i dalje da pokazuju na njih.

### 11.1 Kontekst

Jedan biznis: **Enigma IT**. Jedan Google profil, jedan sajt. Profil postoji,
ali **nije star 60 dana**, pa se pristup API-ju još ne može ni zatražiti.
Proizvod za širu publiku je planiran za sledeću godinu — shema se pravi
višelokacijski od početka, ali se funkcije za tu buduću publiku ne izmišljaju
unapred.

### 11.2 U OBIMU

- **Recenzije**: čitanje i odgovaranje (v4.9 `accounts.locations.reviews`)
- **Metrike**: Performance API, 8 od 12 metrika + mesečne ključne reči
- Nalog i lokacija (Account Management + Business Information, samo čitanje)
- Voice of Merchant status — da se zna da li je profil živ i vidljiv

### 11.3 VAN OBIMA — i zašto

| Šta | Zašto ne |
|---|---|
| **Places API (§7)** | Služi isključivo za pronalaženje TUĐIH firmi, tj. lead generaciju. Ne radi lead generaciju preko Google-a. Nema drugu svrhu. Ispada u celini. |
| **Pub/Sub obaveštenja (§4.4)** | Jedini stvarno nov komad infrastrukture u planu, a dobitak je „recenzija stigne za sekundu umesto za 15 minuta". Za jedan profil sa retkim recenzijama cron je jednako dobar i ima tri mesta manje gde može da pukne. Ovo je izmena mog sopstvenog predloga. |
| **Objave / Local Posts (§5.1)** | Statistika po objavi ne postoji od 2023. Objavljivanje u mrak, bez svrhe za IT firmu sa jednim profilom. |
| **Media API (§5.2)** | Nema vrednost bez recenzija kojima bi bio dodatak. |
| **Place Actions (§5.3)** | Link za zakazivanje. Enigma IT ne prodaje termine. |
| **Business Information — IZMENA (§4.3)** | Radno vreme i kontakti se za jednu firmu menjaju jednom godišnje. Ručno je brže. Čitanje ostaje (treba za prikaz), izmena ne. |
| **Account Management — pozivnice (§5.4)** | Radi se jednom po klijentu. Klijenata na GBP-u nema. |
| **Verifications — pokretanje (§5.5)** | Verifikacija ide razglednicom ili telefonom i traži čoveka. Status profila stiže kroz čitanje lokacije. |
| **`googleLocations.search` (§5.6)** | Postojao je samo da poveže leadove sa Google profilima. Bez lead generacije nema svrhu. |
| **Lodging, food metrike, Q&A, Business Calls (§6, §2)** | Neprimenljivo ili mrtvo. |

### 11.4 Metrike koje ULAZE u shemu (8 od 12)

- `BUSINESS_IMPRESSIONS_DESKTOP_SEARCH`
- `BUSINESS_IMPRESSIONS_MOBILE_SEARCH`
- `BUSINESS_IMPRESSIONS_DESKTOP_MAPS`
- `BUSINESS_IMPRESSIONS_MOBILE_MAPS`
- `WEBSITE_CLICKS`
- `CALL_CLICKS`
- `BUSINESS_DIRECTION_REQUESTS`
- `BUSINESS_CONVERSATIONS`

NE ulaze: `BUSINESS_BOOKINGS`, `BUSINESS_FOOD_ORDERS`,
`BUSINESS_FOOD_MENU_CLICKS`, `DAILY_METRIC_UNKNOWN` — ugostiteljstvo i
rezervni članovi enum-a. Prazna kolona koja nikad neće imati vrednost je
kolona koja laže da nešto meri.

### 11.5 Pravilo koje važi za CELU ovu integraciju

**Nula i nedostupnost ne smeju da izgledaju isto.**

Dok kvota stoji na 0 QPM, nijedan ekran ne sme da prikaže kontrolnu tablu
punu nula. Mora da piše da pristup nije odobren. Profil sa 0 klikova na sajt i
profil čiji podaci nikada nisu stigli su suprotne informacije — jedna je
merenje, druga je odsustvo merenja.

Isto važi i posle odobrenja: dan za koji Google nije vratio vrednost NIJE dan
sa nula prikaza.
