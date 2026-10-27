# A4 — Analitika, Atribucija, automatizacija (OpenReply, Pravila) — revizija

> **Napomena za noćne runove (27. 10. 2026.):** ovo je revizija napravljena pre ULTRA runova. Putanje `ED/…` znače koren ovog repoa; `AUDIT/…` i snimci `nocni-run/ux/bx-*.jpg` nisu u repou. Brojevi su iz sintetičkih podataka razvojnog prikaza (`?ux=1`). Valuta: pravi nalozi za oglase rade u evrima (odluka O16 u `docs/ULTRA-PLAN.md`); tvrdnje o nalogu „u dinarima“ potiču iz probnih podataka. Odluke, obim i redosled važe iz `docs/ULTRA-PLAN.md`, a ne iz pitanja i preporuka u ovom izveštaju.


Obim: 14 ekrana. Analitika: Pregled, prazno, Sticanje, Sadržaj, Posetioci, Oglasi, Uživo i Retencija. Zatim Atribucija, OpenReply (Pregled, prazno, Automatizacije) i Pravila (Čuvari, Istorija). Kod je čitan iz `components/app/{analytics,attribution,openreply,rules}`, iz `convex/{analytics,attribution,openreplyStore,rules,rulesStore,leadSajt,leadInboundIngest}.ts` i iz `lib/{metrics,format,rule-sentence}.ts`.
Dodatni snimci su u `AUDIT/shots/A4/`: `analitika-sticanje-390.jpg`, `analitika-sadrzaj-390.jpg`, `analitika-oglasi-390.jpg`, `pravila-novo-1536.jpg` (urednik pravila), `openreply-nova-1536.jpg` (urednik automatizacije), `openreply-ledolomci-1536.jpg`. Isečci po prvom ekranu su u `shots/A4/sl/`.

Ograde harnesa:
- Fiksture nemaju prethodni period, pa pilule promene nisu na snimcima. Ocenjujem ih iz koda i pišem „nema poređenja" samo tamo gde ga kod ne računa.
- Fiksture nemaju `orAutomationsApi.listAutomations` ni sadržaj „Ledolomci", pa su ta dva prikaza na snimku večiti skeleton. Spisak automatizacija ocenjujem iz koda.
- Brojke u fiksturama su ručno pravljene. Kontradikciju navodim kao nalaz samo kad je **kod garantuje i u produkciji** (označeno „uzrok u kodu"). Ostalo je ilustracija.

---

## 0. Presuda specifičnosti

Analitika je zamenljiva. Njenih sedam ekrana su preslikani standardni GA4 izveštaji u tamnoj temi: Acquisition, Pages, Tech/Geo, Realtime, Cohorts i Google Ads. Isti bi stajali u bilo kom šablonu „GA4 dashboard". Ništa u njima ne zna da korisnik živi od poziva i upita.
Baza već ima prave upite: forma sa sajta stiže sa stranicom i UTM-om (`convex/leadSajt.ts` → `leadInbound`, izvor „website"), a tu su i DM-ovi i IG/FB/Threads komentari (`leadInboundIngest.ts`). Analitika nijedan od njih ne prikazuje.
Automatizacije su autorskije: rečenica pravila, „Šalješ kao @nalog", ključne reči koje izjednačavaju naša slova. Ali su razbacane na četiri mesta, pod internim imenima (OpenReply, Čuvari, Motor), i ne liče jedna na drugu.

## 1. Nielsen

| # | Heuristika | Ocena | Ključni problem |
|---|---|---|---|
| 1 | Vidljivost stanja | 2 | Trake stanja postoje: „Podaci za danas i juče su privremeni", „Ažurirano pre 22s", traka motora. Ali traka automatizacija piše „0 aktivnih automatizacija" dok se spisak još učitava (`automations-dashboard.tsx:51`, `?? 0`). Nigde ne piše da su DM-ovi i klikovi u tabeli kampanja i na Atribuciji brojani **od početka**, a ne za izabrani period. |
| 2 | Jezik korisnika | 1 | Sirovi GA4/Meta nazivi kao natpisi: Organic Search, Referral, `page_view`, `firstSessionDate`, `utm_medium=openreply-dm`, „adInsights prozor", Scope, Ad Setovi, cooldown, Thresholding, „propertija". Uz to Desktop/Mobile, Serbia/Croatia, „Ledolomci", „Motor sluša komentare". |
| 3 | Kontrola i sloboda | 2 | Pravilo koje pauzira kampanje uključuje se jednim klikom, bez potvrde i bez probe. U istoriji nema „Vrati kampanju". Nova automatizacija je podrazumevano aktivna, pa odmah javno odgovara, dok Threads za isti posao ima bezbedan „draft". |
| 4 | Doslednost | 1 | Ista mera ima 3–5 brojeva i 2–4 imena na različitim ekranima: Korisnici, Sesije, Ključni događaji/Konverzije/Događaji, Poslati DM. „Kampanja" je automatizacija u OpenReply-u, a plaćena kampanja u Oglasima. Tabela izvora je Aeonik sa ikonicama na Pregledu, a bold mono bez ikonica na Sticanju. Pilula je zelena za rast potrošnje. |
| 5 | Sprečavanje grešaka | 1 | Pravila su tvrdo u evrima: „CPA (€)", šabloni sa pragom 15 i 100 (`rulesStore.ts:41-75`). Meta nalog izveštava u RSD, a evaluator poredi sirov broj, pa bi uključen „CPA Guard" pauzirao svaku kampanju čiji je CPA veći od 15 RSD. ID objave se kuca ručno („media ID iz Instagram API-ja"). Prag se čita sa `parseFloat(...) \|\| 0`. |
| 6 | Prepoznavanje, ne pamćenje | 2 | Za odgovor na „koliko upita" treba znati da su na dnu Sadržaja, u tabeli sirovih događaja, i sabrati ih u glavi. Za poređenje treba pamtiti 2.102 sa Pregleda dok gledaš 2.656 na Sticanju. |
| 7 | Fleksibilnost i efikasnost | 2 | Postoje preseti perioda i sortiranje. Ne postoje filter po kanalu, prethodni period na grafikonu, prelaz iz reda izvora u detalj ni izvoz. Toplotna mapa radi samo mišem. Jedina „prečica" je primarno „Pogledaj uživo". |
| 8 | Estetika i minimalizam | 2 | Mirno i čisto, ali je zid brojeva: Pregled ima 10 pločica iste težine, Sticanje 5, Sadržaj i Posetioci po 4. Četiri podekrana imaju karticu-objašnjenje koja ponavlja podnaslov. Vremenska zona stoji u podnožju svake strane. |
| 9 | Oporavak od greške | 2 | Greške provere i motora imaju tekst i put, ali sa imenima promenljivih okruženja (IG_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, ADS_WRITE_ENABLED, RESEND_API_KEY). Pauziranu kampanju ne možeš da vratiš odavde. |
| 10 | Pomoć i dokumentacija | 3 | Objašnjenja na mestu ima mnogo: fusnote o razlici zbirova, metodologija kohorti, prozor od 24 h, „Facebook ne može da proveri praćenje". Namera je dobra, ali fusnote dokumentuju greške koje treba popraviti. |
| | **Ukupno** | **18/40** | **Loše (12–19). Opseg 16–20**, zavisno od toga koliko teško računaš pogrešan zbir korisnika. |

## 2. Kognitivno opterećenje (stavke od 8 koje padaju)

| Ekran | Pada | Koje |
|---|---|---|
| Analitika › Pregled | 4/8 | komadi (10 pločica, 7 u istom redu), minimalan izbor (birač mere od 8 pilula), radna memorija (2.102 u pločici, 2.546 u tabeli, objašnjenje 900 px niže), postepeno otkrivanje (10 mera i 12 izvora odjednom) |
| Sticanje | 5/8 | fokus (5 jednakih pločica), hijerarhija (najjača je kartica-predavanje), komadi (7 kanala × 2 trake × 2 broja), radna memorija (prvi dodir protiv ove posete), postepeno otkrivanje (pojam „opsega" na ulazu) |
| Sadržaj | 5/8 | fokus, hijerarhija, komadi (tri tabele od 31, 17 i 14 redova), radna memorija (kolona „Događaji" su ključni događaji, a tabela „Događaji" su svi), postepeno otkrivanje (sirovi događaji) |
| Posetioci | 4/8 | fokus, hijerarhija, minimalan izbor (168 ćelija mape bez sažetka), radna memorija (zbir po zemljama 2.848 je veći od „Ukupno korisnika" 2.295, a fusnota kaže da zbir može biti *manji*) |
| Uživo | 1/8 | postepeno otkrivanje (napomena o API-ju). Dobar ekran. |
| Retencija | 5/8 | fokus (najjače je upozorenje o pragu zbog jedne ćelije), komadi (matrica 8 × 12), radna memorija (pločica kaže 12 kohorti, matrica ima 8 redova), hijerarhija, postepeno otkrivanje |
| Atribucija | 3/8 | radna memorija (doživotni DM-ovi i 28-dnevne sesije u istom levku, nigde rečeno), grupisanje (98 i 6 iz levka ponovljeni u pločicama ispod), postepeno otkrivanje (UTM integritet i `utm_medium=` u fokusu) |
| OpenReply › Pregled | 3/8 | radna memorija (382 u levku, 404 u tabeli istog ekrana), grupisanje (red „Odgovoreno IG/FB" od 130 px za podelu 100/0), dosledno imenovanje (kampanja ili automatizacija) |
| Urednik automatizacije | 4/8 | jedna stvar u trenutku, minimalan izbor, komadi, postepeno otkrivanje (≈20 polja u modalu sa klizanjem od 60 vh) |
| Pravila | 2/8 | grupisanje (čipovi-brojevi izgledaju kao filteri), radna memorija (prag u €, kampanje u RSD) |

**Tačke odluke sa više od 4 opcije:**
1. Birač mere na grafikonu: 8 pilula. Na Pregledu i na Kontrolnoj tabli lomi se u 2 reda na 1536, a u 4 reda na 390.
2. Podnavigacija Analitike: 7 stavki u dve grupe, kao mreža 2 × 4 u bočnoj traci.
3. Kompaktne pločice Pregleda: 7 mera iste težine.
4. Urednik automatizacije: platforma (3), okidač (3), „kada se okida" (2), podudaranje (2), objave (2), dugmad ili brzi odgovori (3), plus tri prekidača (Zaprati, Naknadna, Javni odgovor). Sve u jednom modalu.
5. Urednik pravila: metrika (5), operator (4), nivo (3), akcija (3) i četiri broja.
6. Pravila, iznad sadržaja: 4 čipa, 2 jezička i 2 dugmeta.
7. Toplotna mapa: 168 ćelija bez rečenice-sažetka.

## 3. Emocionalno putovanje

- **Vrhovi.**
  - Atribucija: tirkizni levak „Poslati DM 404 → Klikovi 131 → GA4 sesije 98 → Konverzije 6" izgleda kao odgovor na „da li mi DM-ovi donose posao".
  - Uživo: „14 aktivnih posetilaca" i stubići po minutu daju utisak da je sajt živ.
- **Kraj.** Poslednje što Jovan pročita na tri ekrana su priznanja da se brojevi ne slažu:
  - „Zbir po izvorima (2.546) … odstupa od pločice „Sesije" (2.102)";
  - „brojevi se neće poklapati sa ekranom Oglasi";
  - „Google je mogao da izostavi redove…".

  Po peak-end pravilu, utisak se završava nepoverenjem.
- **Doline.**
  1. Svaka podstrana daje drugi broj „korisnika" (1.893, 1.750, 2.840, 2.295).
  2. Lov na upite: dno Sadržaja, tabela koja počinje sa `page_view` i `session_start`, a `phone_click` je osmi red.
  3. Pravilo „€1500" nad kampanjama u RSD.
  4. Ručni „media ID" u uredniku automatizacije.
- **Ispravka.** Vrh treba da bude broj upita sa rečenicom „više nego prošlog perioda, rast nosi Google pretraga". Kraj treba da bude jedan red kvaliteta podataka, a ne tri fusnote.

## 4. Šta valja i treba zadržati

1. **Infrastruktura poštenja.**
   - `KpiTile` crta „—" sa razlogom.
   - `fillDays` razlikuje „nije bilo saobraćaja" (0) od „nije očitano" (rupa).
   - Tu su i „Prag primenjen" i „Podaci za danas i juče su privremeni".

   Zadržati. Samo prestati da se njome objašnjavaju sopstvene računske greške.
2. **`FunnelSteps` sa `ratioOnly`.** „0,32 klikova po poruci" umesto lažnog CTR-a preko 100 % je ispravno modelovanje. Prenosi se u novi levak.
3. **Rečenica pravila** (`lib/rule-sentence.ts`): „Ako CPA > … tokom 3 dana uz ≥1000 impresija → pauziraj i javi mi". To je tačan mentalni model *kad → ako → uradi* i treba da postane format svake automatizacije u aplikaciji.
4. **Urednik automatizacije i Uživo.**
   - Urednik ima „Šalješ kao @test.salon · Enigma IT" i „Nedostaje: naziv, bar jedna ključna reč, tekst poruke", i objašnjava ograničenja platformi (24 h, FB ne proverava praćenje).
   - Uživo ima jedan broj i jedan grafikon. To je najbolje komponovan ekran Analitike.
   - `SourceIcon` uz izvore na Pregledu je pravi obrazac za sve tabele izvora.

---

## 5. Po ekranu

### Analitika › Pregled — `/analytics` — snimci: `bx-analitika-1536x695.jpg`, `bx-analitika-390x844.jpg`
- **Posao:** odgovoriti „da li sajt radi za mene u ovom periodu". **Obavlja: ne.** Odgovara na „koliko saobraćaja": fokus su Sesije. Upiti su jedan neimenovan broj („Ključni događaji 81"), osmi po redu, ispod preloma.
- UI:
  - [P2] **Ista serija je nacrtana dvaput, jedna pored druge.** Dokaz: sparklinija u hero pločici „Sesije 2.102" i veliki grafikon „Sesije" desno (y 245–490). Predlog: hero pločica bez sparklinije, jedan grafikon.
  - [P2] **Donje ivice se ne poklapaju.** Dokaz: leva kolona sa tri pločice ide do y≈580, grafikon do y≈490, pa iznad preloma ostaje 90 px praznine. Predlog: grafikon puni visinu kolone (`items-stretch`), ili samo dve pločice levo.
  - [P2] **Birač mere jede prostor iznad preloma.** Dokaz: „Prikaži na grafikonu:" sa 8 pilula se lomi u 2 reda (y 170–230), 60 px za izbor koji retko treba. Predlog: `Select` u zaglavlju grafikona, ili tri pilule (Posete · Upiti · Stopa) i „Još ▾".
  - [P2] **Zid od 10 brojeva iste težine.** Dokaz: 7 kompaktnih pločica od 96 px, isti stil; jedini poslovno važan broj je osmi. Predlog: kanvas ispod — jedan fokus i tri sekundarna broja.
  - [P2] **Telefon seče natpise.** Dokaz na 390: „ANGAŽOVANE SES…", „STOPA ANGAŽOVA…"; `shortLabel` daje „PO SESIJI" i „PO KORISNIKU" bez imenice. Tabela izvora seče kolonu „Ključni događaji" na ivici kartice, bez senke i znaka da klizi. Birač mere zauzima 4 reda.
  - [P3] **Mono van brojeva.** `font-mono` (na Windowsu Consolas) se koristi i za tekst: „Vremenska zona propertija: Europe/Belgrade". Zapis „42s" je bez razmaka.
- UX:
  - [P1] **Ekran ne odgovara na glavno pitanje.** GA4 već broji `phone_click`, `form_submit` i `generate_lead` (vidi Sadržaj › Događaji), a baza ima upite sa sajta sa stranicom i UTM-om (`leadInbound`). Pregled ne pokazuje ništa od toga. Predlog: fokus „Upiti" (V2, kanvas ispod).
  - [P1] **„Korisnici 1.893" je pogrešan broj (uzrok u kodu).** To je zbir dnevnih korisnika: `lib/metrics.ts` `summarize`, `totalUsersSum += r.totalUsers`. Korisnici se ne sabiraju po danima — ko dođe 5 dana, broji se 5 puta. Broj je zato uvek veći od GA4 broja za isti period i različit od „korisnika" na svakoj podstrani. Ista greška ulazi u „Klj. događaji po korisniku". Predlog: V1.
  - [P2] **GA4 ime, drugi broj.** „Klj. događaji po sesiji 3,9%" se računa kao `keyEvents / sessions` (`convex/lib/ga4Catalog.ts:82`), a nosi GA4 ime `sessionKeyEventRate`. U GA4 to ime znači „udeo sesija sa bar jednim ključnim događajem", pa broj ne liči na GA4, a može i da pređe 100 %. Predlog: „Upita na 100 poseta: 3,9".
  - [P2] **Kontradikcija u istoj koloni, objašnjenje 900 px niže.** Pločica kaže „Sesije 2.102", zaglavlje tabele „Izvori saobraćaja · Top 12 od 24 · 2.546 sesija". Objašnjenje je siva fusnota od 12 px ispod tabele (`traffic-table.tsx:89`). Predlog: tabela izvora prikazuje udele normalizovane na broj iz pločice, ili pločica sama kaže „po izvorima 2.546".
  - [P2] **Primarno dugme nije radnja.** „Pogledaj uživo" (`analytics-dashboard.tsx:44-57`) i sam B10 §8 zove najslabijim. Predlog: bez primarnog dugmeta, ili „Otvori upite (3)" ka Leadovima. Uživo postaje tihi čip „● 3 na sajtu" u zaglavlju.
  - [P2] **Grafikon ne zna za prethodni period (u kodu).** `SessionsChart` crta samo tekuće `values`, iako je `previousRows` već učitan. Predlog: isprekidana linija prethodnog perioda.
  - [P3] **Birač mere nema stanje za čitač ekrana.** Dugmad nemaju `aria-pressed` (`sessions-chart.tsx:71`).
- **Nema smisla:**
  - Isti grafikon sa istim biračem od 8 mera stoji i na Kontrolnoj tabli (`overview-dashboard.tsx:280`), zajedno sa „Sesije 2.102", „Korisnici 1.893" i „Ključni događaji 81". Pregled Analitike je kopija polovine Kontrolne table.
  - Podnaslov obećava „u odnosu na prethodni period iste dužine". Dok prethodni period nije sinhronizovan (prvih 56 dana kod 28 d), nijedna pločica nema poređenje, a obećanje ostaje.
- **Ciljni kanvas (1536×695):**
```
┌ gornja traka 56: ● Analitika      [7 d|28 d|90 d|kal] 30.09.–27.10. · 28 d    ⌘K  zvono  ●  ┐
│ Analitika   Pregled · Izvori · Sajt                                  ● 3 na sajtu sada ›  │ y72–112
├───────────────────────────────────────────────┬──────────────────────────────────────────┤
│ UPITI · 28 d                                  │ ODAKLE SU UPITI                  Δ        │
│ 47        ↑ +12 % (pre: 42)                   │ Google pretraga  ██████████  19   +4      │
│ Pozivi 21 · Forme 18 · Poruke 8               │ Instagram        ██████      11   −2      │
│ ▁▃▂▅▃▆▂▄▇▃▅▂▆ stubići po danu                 │ Direktno         ████         7    0      │
│ - - - - prethodnih 28 d (isprekidano)         │ Google oglasi    ███          5   +1      │
│ „Više upita nego prošlog perioda;             │ Ostalo           ███          5   +1      │
│  rast nosi Google pretraga (+4)."             │ Svi izvori ›                              │
├────────────────┬───────────────┬──────────────┴───┬──────────────────────────────────────┤ y≈520
│ Posete 2.102   │ Upita na 100  │ Cena po upitu    │ Stranice koje donose upite            │
│ ↑ 8 %          │ poseta 2,2 ↑  │ (oglasi) 1.950   │ /cenovnik 12 · /kontakt 9 · / 7 ›     │
│                │               │ RSD ↓ 6 %        │                                       │
└────────────────┴───────────────┴──────────────────┴──────────────────────────────────────┘ y≈640
 ispod preloma: sažetak Izvora (6 redova) · jedan red kvaliteta podataka („danas i juče: privremeno")
```
  - **390×844:**
    1. „Upiti 47 ↑12 %", ispod toga pozivi · forme · poruke i stubići.
    2. „Odakle su upiti": 5 redova sa trakom.
    3. Tri sekundarna broja u jednom redu kompaktnih ćelija. „● 3 na sajtu" je u zaglavlju, birača mere nema.

### Analitika — prazno — `/analytics?prazno=1` — snimci: `bx-analitika-prazno-1536x695.jpg`, `bx-analitika-prazno-390x844.jpg`
- **Posao:** dovesti do povezivanja GA4. **Obavlja: da** — Misija sa jednim primarnim „Poveži GA4".
- UI:
  - [P3] Bočna traka i dalje nudi 7 podstavki, a svaka vodi na svoj prazan ekran. Predlog: dok GA4 nije povezan, podstavke se ne crtaju (rute ostaju).
  - [P3] Birač perioda je aktivan iako nema šta da se bira.
- UX:
  - [P2] Obećanje „ovde stižu sesije, korisnici i konverzije sajta" ne kaže šta Jovan dobija u poslovnom smislu. Korak „service account, samo čitanje" je žargon bez linka na uputstvo.
  - [P2] **Upiti postoje i bez GA4.** Forma sa sajta ide kroz `POST /projekti/lead` u `leadInbound`, ali ekran je potpuno prazan. Predlog: blok „Upiti iz baze" radi i bez GA4, a GA4 se nudi kao „dodaj posete i izvore".
- **Ciljni kanvas:** levo Misija „Poveži GA4" (primarno), desno „Upiti sa sajta · 28 d: 18 (forma 12 · poruke 6)" ako ih ima. **390:** Misija, ispod nje kartica upita iz baze.

### Sticanje — `/analytics/sticanje` — snimci: `bx-analitika-sticanje-1536x695.jpg`, `shots/A4/analitika-sticanje-390.jpg`
- **Posao:** odakle dolaze novi ljudi i koji kanal donosi upite. **Obavlja: delimično.** Kanale nabraja (na engleskom), ali grafikon poredi korisnike sa sesijama, ne sa upitima.
- UI:
  - [P2] Najistaknutija stvar iznad preloma je kartica-predavanje „**Prvi dodir** kaže odakle je korisnik prvi put došao… **Ova poseta**…" (y 165–240). Ispod nje je 5 jednakih pločica sa skoro istim sparklinijama, pa fokusa nema.
  - [P2] **Dve komponente za isti podatak.** Tabela „Izvori i medijumi" je bold mono, bez ikonice (`google / organic`, `source-acquisition-table.tsx`). Isti podatak Pregled crta Aeonikom sa `SourceIcon` (`traffic-table.tsx`).
  - [P2] Kanali su na engleskom: Organic Search, Direct, Organic Social, Paid Search, Referral, Email, Organic Video.
  - [P2] 390: tabela pokazuje samo kolonu „Novi korisnici", a ostale tri su van ekrana bez znaka.
- UX:
  - [P1] **Zbirovi se ne slažu na istoj strani.** Pločice „Novi korisnici 1.547 · Ukupno korisnika 1.750 · Ključni događaji 128" protiv reda „Ukupno (svi izvori) 1.753 · 2.154 · 140". Uzrok u kodu: pločice čitaju `acquisitionByChannel`, a tabela `acquisitionBySource`; oba sabiraju korisnike po danima i po dimenziji (`convex/analytics.ts` ~307, ~497).
  - [P2] **Pločica može da pokaže drugu meru pod istim natpisom.** „Novi korisnici" ima rezervu `channels.totals.firstNewUsers || curDailySum.activeUsers` (`acquisition-dashboard.tsx:166`), isto i „Ukupno korisnika" (`:181`). Kad je zbir po kanalima 0 ili ga nema, pod natpisom „Novi korisnici" stoje *aktivni* korisnici iz drugog izveštaja, a prava nula se nikad ne vidi (`||` umesto `??`). Predlog: „—" sa razlogom, bez zamene mere.
  - [P2] Pojam „opseg" (first-user ili session scope) je analitičarski. Jovanu treba jedno pitanje: koji kanal donosi upite. Tabela ima kolonu „Ključni događaji", ali je sortirana po novim korisnicima i nema stopu.
  - [P3] Žuti čip „Prag primenjen" (Organic Video) nema objašnjenje na mestu.
- **Nema smisla:** „Sesije 2.656" ovde i „Sesije 2.102" na Pregledu, za isti period. „Ukupno korisnika" ovde i „Korisnici" tamo.
- **Ciljni kanvas:** ekran se gasi i postaje **Izvori** (kanvas ispod Atribucije). Prekidač „Prvi dolazak / Ova poseta" ostaje kao sitna kontrola u Izvorima. **390:** lista kanala (ime · posete · upiti), dodir otvara detalj kanala.

### Sadržaj — `/analytics/sadrzaj` — snimci: `bx-analitika-sadrzaj-1536x695.jpg`, `shots/A4/analitika-sadrzaj-390.jpg`
- **Posao:** koje stranice rade za posao. **Obavlja: delimično.** Stranice rangira po prikazima, ne po upitima. Najvažniji podatak celog modula (`phone_click` 117, `form_submit` 74, `generate_lead` 58) je u trećoj tabeli, oko 2.300 px niže.
- UI:
  - [P2] Iznad preloma su kartica-objašnjenje i 4 jednake pločice; prva tabela počinje na y≈465.
  - [P2] Putanje su u mono (`/blog/nega-lica-kod-kuce`), bez naslova stranice. Redovi ostatka su bold-italic.
  - [P3] Trajanje u tri zapisa na istom ekranu: „1m 1s" (pločica), „1 min 11 s" (tabela), „48 s".
- UX:
  - [P1] **Upiti su sakriveni u sirovoj tabeli događaja.** Ispred njih su `page_view`, `session_start`, `user_engagement`, `first_visit`, `scroll` — automatski GA4 događaji bez vrednosti za Jovana. Predlog: na vrh Analitike kao „Upiti: pozivi · forme · prijave". Tabela događaja ide u „Tehnički detalji".
  - [P2] **Isti natpis, dve mere.** Kolona „Događaji" u tabelama stranica i ulaznih stranica sadrži *ključne* događaje (`pages-table.tsx:58`, `landing-pages-table.tsx:63`), a odmah ispod je tabela „Događaji" sa *svim* događajima.
  - [P2] **„Korisnici 2.840" je zbir korisnika po stranicama i po danima** (`convex/analytics.ts:641-643`). Ko vidi tri stranice, broji se tri puta. „Prosečno zadržavanje" deli trajanje tim zbirom.
  - [P2] **Nepoznato je prikazano kao 0.** „Ostale stranice (19) — Korisnici 0" i „Ostali događaji (3) — Korisnici 0 · 0,00". Pravilo kaže „—".
  - [P3] „odskok 41,0%" ispod „59,0%" ponavlja isti podatak (odskok = 1 − angažovanje).
- **Nema smisla:** zbir tri ključna događaja u tabeli je 249, a pločica „Ključni događaji" kaže 201 (u fiksturi). Ekran nema nijedan dokaz koji od dva broja važi.
- **Ciljni kanvas:** ekran ulazi u **Sajt** (kanvas ispod Posetilaca). **390:** „Stranice koje donose upite" kao lista (putanja · upiti · stopa).

### Posetioci — `/analytics/posetioci` — snimak: `bx-analitika-posetioci-1536x695.jpg`
- **Posao:** na čemu, odakle i kada ljudi gledaju sajt. **Obavlja: delimično.** Podaci su tu, zaključak nije: nigde ne piše „72,5 % sa telefona" ni „najviše radnim danima 9–14 h".
- UI:
  - [P2] **Naslagana površina uređaja vara oko.** Vrh zelene linije („Tablet") je zbir sve tri serije, pa izgleda da tablet ima ~110 sesija dnevno, a ima ~5. Predlog: jedna 100 % traka i tri broja (već postoje ispod grafikona); grafikon kroz vreme izbaciti.
  - [P2] **Engleski nazivi.** „Desktop / Mobile / Tablet" i „Serbia, Bosnia & Herzegovina, Croatia…". Predlog: `countryId` iz GA4 i `Intl.DisplayNames('sr-Latn', {type: 'region'})`, bez nove zavisnosti. Uređaji: Računar / Telefon / Tablet.
  - [P2] **Toplotna mapa radi samo mišem.** 168 ćelija u plavoj boji grafikona; detalji samo na `onMouseEnter` (`time-of-day-heatmap.tsx:118`), ćelije nemaju fokus ni `aria-label`. „Pređite mišem…" ne radi na telefonu.
  - [P3] Vremenska zona je napisana dvaput (u kartici mape i u podnožju). „stopa 68,0%" nema imenicu.
- UX:
  - [P2] **Fusnota protivreči broju.** „Ukupno korisnika 2.295", a geografski zbir je „Ukupno (23 države) 2.848"; fusnota kaže „Zbir može biti manji". Uzrok u kodu: korisnici se sabiraju po zemljama i danima.
- **Ciljni kanvas — Sajt (1536×695):**
```
│ Analitika   Pregled · Izvori · Sajt                                                       │
├──────────────────────────────────────────┬───────────────────────────────────────────────┤
│ STRANICE KOJE DONOSE UPITE               │ KO I KADA                                       │
│ /cenovnik    960 prikaza  12 upita 1,3 % │ Telefon 72 % ███████ Računar 23 % ██ Tablet 5 %│
│ /kontakt     515           9       1,7 % │ Srbija 70 % · BiH 8 % · Crna Gora 5 % · …      │
│ /          2.140           7       0,3 % │ „Najviše poseta: radnim danima 9–14 h"         │
│ /zakazivanje 640           6       0,9 % │ [mapa 7×24, ćelije fokusabilne, broj u ćeliji  │
│ … Sve stranice (31) ›                    │  na fokus/dodir]                                │
├──────────────────────────────────────────┴───────────────────────────────────────────────┤
│ ▸ Ulazne stranice   ▸ Povratak posetilaca (kohorte)   ▸ Tehnički detalji (svi GA4 događaji) │
```
  - **390:** stranice sa upitima kao lista; „Ko i kada" kao tri rečenice i traka; mapa se otvara na dodir.

### Analitika › Oglasi — `/analytics/oglasi` — snimci: `bx-analitika-oglasi-1536x695.jpg`, `shots/A4/analitika-oglasi-390.jpg`
- **Posao:** da li plaćeni oglasi dovode ljude koji nešto urade na sajtu. **Obavlja: delimično.** Prikazuje samo Google Ads (preko GA4 veze, `convex/analytics.ts` `adsPerformance`), a podnavigacija kaže samo „Oglasi". Meta oglasi — 4 od 6 kampanja u modulu Oglasi — ovde ne postoje.
- UI:
  - [P1] **Poskupljenje je obojeno kao uspeh.** „Potrošnja ↗ +22,0%" i „Cena / klj. događaj ↗ +3,7%" su zelene (`ads-performance-dashboard.tsx:150-220`, nema `higherIsBetter={false}`). DESIGN.md (KpiTile) izričito traži obrnuto.
  - [P2] Podnaslov grafikona je tekst za programera: „Dva sinhronizovana grafikona sa zajedničkom vremenskom osom i nišanom."
  - [P3] Oznake ose se sudaraju („25. okt27. okt"). Podeoci su „2.108 / 1.054 / 0" (maksimum i polovina) umesto okruglih. Legenda i ose su u mono.
  - [P2] 390: valuta je odsečena u pločici („38.000 RS"), a i „vs pre…".
- UX:
  - [P2] **Dva izvora istine za novac.** Potrošnja za iste Google kampanje dolazi iz Ads API-ja u Oglasima i iz GA4 veze ovde. Fusnota sama kaže „brojevi se neće poklapati sa ekranom Oglasi".
  - [P2] Nepoznata potrošnja postaje 0 (`value={curTotals?.cost ?? 0}`).
  - [P3] Kartica-objašnjenje ponavlja podnaslov.
- **Ciljni kanvas:** ekran se gasi. Novac živi samo u Oglasima (API). GA4 tabeli kampanja u Oglasima dodaje kolone „Posete" i „Upiti", a u Izvorima daje red „Plaćeno" (Google · Meta) sa cenom po upitu. **390:** isto, kao dodatni red u kartici kampanje.

### Uživo — `/analytics/uzivo` — snimak: `bx-analitika-uzivo-1536x695.jpg`
- **Posao:** ko je na sajtu sad. **Obavlja: da, jasno.** Ali posao je bitan samo na dan pokretanja kampanje.
- UI:
  - [P3] Naslovi stranica su u mono („Test Salon | Početna").
  - [P3] Države su na engleskom.
  - [P3] Napomena na dnu pominje „GA4 Realtime API-ja" i „2 i 6 sati".
  - Fokus je dobar: broj „14", stubići po minutu, oznaka „Sada".
- UX:
  - [P2] **Vanity mera postavljena kao dnevna radnja.** Uživo je meta jedinog primarnog dugmeta Analitike i stoji u grupi „Svakodnevno" (`nav-items.ts:508-509`). Predlog: čip „● N na sajtu" u zaglavlju Analitike otvara bočni panel sa ovim sadržajem; ruta `/analytics/uzivo` ostaje.
- **Ciljni kanvas:** bočni panel od 480 px desno: broj, stubići za 30 min, top 5 stranica, izvori sada. **390:** panel preko celog ekrana.

### Retencija — `/analytics/retencija` — snimak: `bx-analitika-retencija-1536x695.jpg`
- **Posao:** da li se posetioci vraćaju. **Obavlja: tehnički da, poslovno ne.** Za sajt salona ili agencije iz kohortne matrice ne sledi nijedna odluka.
- UI:
  - [P2] Iznad preloma je najjače žuto upozorenje „Privatnost i pragovi (Thresholding)", i to zbog jedne ćelije.
  - [P2] X-osa ide do „Ned 11", a linije staju na „Ned 4", pa su 2/3 grafikona prazne. Pet kohorti se slilo u jednu liniju.
  - [P2] Datumi su u ISO zapisu (2026-09-22) i u legendi i u matrici. Matrica je plava, ne u boji modula.
- UX:
  - [P2] **Broj koji nije iz podatka.** „Ukupno novih korisnika 1.555 · u 12 kohorti": „12" je tvrdo upisan tekst (`retention-dashboard.tsx:156`), a matrica ima 8 redova.
  - [P3] Metodologija pominje `firstSessionDate`.
- **Ciljni kanvas:** izlazi iz navigacije. U Sajtu postaje jedan red: „Vratilo se posle nedelju dana: 31,8 % novih posetilaca (pre: 30,1 %) · Kohorte ›", a link vodi na postojeći ekran (ruta ostaje). **390:** ista rečenica.

### Atribucija — `/atribucija` — snimci: `bx-atribucija-1536x695.jpg`, `bx-atribucija-390x844.jpg`
- **Posao po imenu:** koji kanal ili kampanja donosi upite. **Stvarno radi:** samo Instagram DM automatizacija → sajt. **Obavlja: ne** za ime koje nosi, **delimično** za IG DM.
- UI:
  - [P2] Fokus kartica deli prostor sa „UTM INTEGRITET 1 / 1" i natpisom `utm_medium=openreply-dm`. Mera kvaliteta podataka je dobila fokus.
  - [P2] Tri pločice ispod ponavljaju brojeve iz levka (98 sesija, 6 konverzija), plus 383. Ista informacija dvaput iznad preloma.
  - [P2] Sirove UTM vrednosti su drugi red naziva kanala (`utm_medium=bio`, `utm_medium=—`).
  - [P2] 390: tabele kampanja i kanala su odsečene desno („↓ 1. D", „Ud"), bez znaka.
- UX:
  - [P1] **Levak meša periode (uzrok u kodu).** DM-ovi i klikovi su doživotni: `convex/attribution.ts` `report` čita `orCampaignStats` bez datuma. Sesije i konverzije su za izabrani period (`ga4TrafficDaily` od–do). „74,8 % prelazi dalje" zato deli 28-dnevne sesije doživotnim klikovima. Promena perioda menja samo donju polovinu levka.
  - [P1] **Ime obećava sve kanale.** Google pretrage, oglasa, Facebooka, Threads-a i forme sa sajta (`leadInbound` sa `utm`) ovde nema.
  - [P2] Pet imena za isti ishod: „Konverzije", „Ključni događaji (GA4)", „Web konverzije", „DM → Cilj", „CR".
  - [P2] Poređenje sa prethodnim periodom ne postoji ni u kodu (`attribution/*.tsx` nema `prevFrom`).
  - [P2] Primarno dugme „Otvori automatizacije" je pogrešno mesto: atribucija nije ekran na kom se menja automatizacija.
- **Nema smisla:** OpenReply › Pregled i Atribucija pokazuju isti levak (prva dva koraka) sa različitim brojevima — 382/161 i 404/131 — za isti period, jedan klik razdaljine u bočnoj traci.
- **Ciljni kanvas — Izvori (1536×695), prima Sticanje, Atribuciju i Analitika › Oglasi:**
```
│ Analitika   Pregled · Izvori · Sajt                     [Prvi dolazak | Ova poseta] (sitno) │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Kanal                  Posete    Δ     Upiti   Δ   Upita/100   Trošak        Cena po upitu│
│ ▸ Google pretraga       1.010   +6 %     19   +4      1,9          —             —       │
│ ▾ Instagram               482   −3 %     11   −2      2,3          —             —       │
│     Bio link              210             6                                               │
│     Priče                  44             1                                               │
│     DM automatizacija      98             4   DM 382 → klik 161 → posete 98 → upiti 4     │
│ ▸ Google oglasi           207   +9 %      5   +1      2,4      9.750 RSD    1.950 RSD     │
│ ▸ Meta oglasi             …                                    …            …            │
│ ▸ Direktno                536             7                                               │
│ ▸ Ostalo (6)              …                                                               │
│ Ukupno                  2.102 (isti broj kao na Pregledu)   47                            │
```
  - Pravila kanvasa: levak DM nosi samo periodne brojeve. UTM integritet je jedan red ispod tabele („1 od 1 automatizacije ima ispravnu oznaku linka").
  - **390:** lista kanala (ime · posete · upiti). Dodir otvara detalj ispod reda.

### OpenReply › Pregled — `/openreply` — snimci: `bx-openreply-1536x695.jpg`, `bx-openreply-390x844.jpg`
- **Posao:** da li automatski DM-ovi rade (šalju se i otvaraju se linkovi). **Obavlja: delimično.**
- UI:
  - [P2] Red „Odgovoreno na Instagramu 382 · 100,0%" / „Odgovoreno na Facebook-u 0 · 0,0%" zauzima 130 px iznad preloma za podelu 100/0. Natpis „Odgovoreno" pri tome broji poslate DM-ove, ne odgovore.
  - [P2] Kolona „Udeo" u tabeli kampanja ponavlja „Klikova po poruci" (0,37 i traka za 0,37). B10 §7 ju je video; nije popravljena.
  - [P3] „3 kampanja": obe grane ternarnog izraza u `campaigns-table.tsx:87` su „kampanja".
- UX:
  - [P1] **Levak i tabela na istom ekranu su iz različitih perioda.** Levak „Poslati DM 382 · Klikovi 161" je za 28 d. Tabela ispod, „3 kampanja · 404 poslatih DM-ova", je od početka: `openreplyStore.campaigns` nema `from/to`. Ni reči o tome, a birač perioda stoji iznad.
  - [P1] **Jedna reč, tri značenja.** „Kampanja" na ovom ekranu je „Automatizacija" na susednom (`orCampaignStats.orCampaignId` = `automationId`, ime = `automation.name`). U Oglasima je „kampanja" plaćena kampanja.
  - [P2] **Ime ne kaže šta radi.** „OpenReply" objašnjavaju tek Podešavanja: „Komentar → DM automatizacija" (`connections-settings.tsx:639-641`). Stvarno: Instagram i Facebook, komentari i poruke, DM sa linkom i dugmićima, kapija praćenja, naknadna poruka, javni odgovor, ledolomci.
  - [P2] Pregled je analitika smeštena pod „Automatizacija", a njegovo pitanje (koliko DM-ova vodi na sajt) je pitanje Atribucije.
- **Ciljni kanvas:** ekran se gasi. Brojevi po automatizaciji idu na njenu karticu, gde već postoje Poslato, Neuspelo, Klikovi i Klikova po poruci (`automations-list.tsx:274-282`), računati za period. Levak ide u Izvori › Instagram › DM automatizacija. Ruta `/openreply` preusmerava na Automatizacije. **390:** kartica automatizacije nosi „382 poruke · 161 klik (28 d)".

### OpenReply — prazno — `/openreply?prazno=1` — snimci: `bx-openreply-prazno-1536x695.jpg`, `bx-openreply-prazno-390x844.jpg`
- **Posao:** dovesti do prve automatizacije. **Obavlja: ne** — prikazuje nule.
- UI/UX:
  - [P2] **Zid nula.** „Klikova po poruci 0,00" (`summarizeOr`: `ctr: dmsSent > 0 ? … : 0`), ravna sparklinija na nuli, „Aktivne kampanje 0 od 0 ukupno", levak sa praznim trakama i „prelaz nije poznat". Plan §5.7 to zabranjuje; mera bez poruka je „—".
  - [P2] Jedino dugme vodi na „Otvori automatizacije", a „Nova automatizacija" je tek drugi klik. Ovaj prazan ekran nije Misija, iako Analitika jeste.
- **Ciljni kanvas:** Misija „Napravi prvu automatizaciju" sa tri koraka (ključna reč → poruka → probaj svojim komentarom). Primarno dugme otvara urednik, ispod je primer rečenice. **390:** isto, jedna kolona.

### OpenReply › Automatizacije — `/openreply/automatizacije` — snimci: `bx-openreply-automatizacije-1536x695.jpg`, `shots/A4/openreply-nova-1536.jpg`, `shots/A4/openreply-ledolomci-1536.jpg`
- **Posao:** napraviti i menjati automatske odgovore i videti šta je poslato. **Obavlja: delimično.**
- UI:
  - [P2] Kad je sve u redu, stoji zelena kutija od 68 px: „Motor je uključen i sluša komentare". Kutija treba problemima; zdravo stanje je jedan red ili čip.
  - [P2] **Urednik je modal.** `max-w-2xl`, sa unutrašnjim klizanjem `max-h-[60vh]` (≈417 px na 695) i ~20 polja: Okidač, Poruka, Link, Dugmad/Brzi odgovori, Zaprati pre poruke, Naknadna poruka, Javni odgovor. Na 1536×695 se vide naziv i pola okidača (snimak `openreply-nova-1536.jpg`). Prema `operate.md`, modal ne sme biti prvi izbor.
  - [P3] Placeholder „Poslato u DM! 📩" sadrži emodži.
- UX:
  - [P1] **Ručni media ID.** „Jedna objava" traži da korisnik ukuca „media ID iz Instagram API-ja" (`automation-editor-dialog.tsx:574-578`). Objave su već sinhronizovane, pa treba birač objave sa sličicama.
  - [P2] **Nova automatizacija je odmah aktivna.** Čip „Automatizacija je aktivna" je u podnožju urednika, pa prvi sačuvan pokušaj odmah javno odgovara na Instagramu. Threads za isto ima „draft" režim simulacije (`threads-automations.tsx:226, 319-321`). Predlog: podrazumevano „Sačuvaj kao test" i „Probaj na mom komentaru".
  - [P2] Dok se spisak učitava, traka kaže „0 aktivnih automatizacija" (`automations-dashboard.tsx:51`).
  - [P2] **Žargon i interna imena.** „Ledolomci i meni", „DM log", „Motor", „Webhook nije do kraja podešen … IG_WEBHOOK_VERIFY_TOKEN i META_APP_SECRET".
- **Nema smisla:** isti obrazac postoji tri puta, sa tri rečnika. Obrazac: traka motora → jezičci → „Nova automatizacija" → kartice sa ključnim rečima → log. Mesta: ovde, `/youtube/automatizacije` (vidi `bx-youtube-automatizacije-1536x695.jpg`) i jezičak „Automatizacije" na Threads-u. Rečnici: „automatizacija", „pravilo", „Uživo/draft".
- **Ciljni kanvas:** hub Automatizacije (§6.3).

### Pravila › Čuvari — `/rules` — snimci: `bx-pravila-1536x695.jpg`, `bx-pravila-390x844.jpg`, `shots/A4/pravila-novo-1536.jpg`
- **Posao:** čuvar budžeta — sam pauzira ili javi kad oglas postane skup. **Obavlja: delimično.** Pravila se vide i uključuju. Ali ne vidiš koliko je kampanja blizu praga, valuta je pogrešna, i nigde ne piše da čuva samo Meta oglase (`rules.ts` uvozi samo `metaAdsApi`), pa 2 od 6 kampanja (Google) nisu čuvane.
- UI:
  - [P2] **Čipovi izgledaju kao filteri.** Red „Pravila 2 · Aktivna 1 · Okidanja u istoriji 1 · Provera na 30 min" ima ivicu i ikonicu, isti stil kao jezičci, a čipovi nisu radnje. „Provera na 30 min" je podešavanje, ne broj.
  - [P2] Žuti čip „Pauziraj i javi" (warning ≈ XP zlatna, B10 §8) na kartici aktivnog pravila čita se kao nagrada.
  - [P2] **Urednik ne liči na karticu.** Ima izvorne `<select>` i ručno pravljeno dugme „Pravilo je aktivno/pauzirano", a kartica koristi shadcn `Switch`. Rečenica-pregled je ispod unutrašnjeg klizanja i na 1536×695 se ne vidi pre „Kreiraj pravilo" (snimak `pravila-novo-1536.jpg`).
  - [P3] Kartica kaže „Aktivno / Isključeno", urednik „aktivno / pauzirano". Rečenica nosi „(cooldown 12h)", a red ispod „Pauza između okidanja 12 h" — isto dvaput, jednom na engleskom.
  - [P2] 390: dugmad zaglavlja i 4 čipa zauzimaju 3 reda pre prve kartice. Ikonice olovke i korpe su male i jedna do druge.
- UX:
  - [P1] **Pogrešna valuta.**
    - Urednik nudi „CPA (€) / Potrošnja (€) / CPC (€)" (`rule-editor-dialog.tsx:287-290`).
    - Šabloni dolaze sa pragom 15 i 100 (`rulesStore.ts:41-75`) i sami se upisuju pri prvoj poseti (`rules-dashboard.tsx:59-65`).
    - Mejl formatira „€" (`rules.ts:61`).
    - Meta nalog izveštava u RSD (Oglasi: Prosečan CPA 386 RSD).

    Evaluator poredi sirov broj, pa bi uključen „CPA Guard" pauzirao svaku kampanju čiji je CPA veći od 15 RSD — dakle sve.
  - [P1] **Pauza bez potvrde.** Pravilo koje pauzira uključuje se jednim klikom na `Switch`, bez potvrde i bez probe tipa „Sada bi pauziralo: Prolećna akcija (CPA 643 RSD)".
  - [P2] Kartica ne pokazuje trenutnu vrednost prema pragu („CPA sada 950 RSD / prag 1.500"). Najkorisniji broj ovog ekrana ne postoji.
  - [P2] **Pet imena za istu stvar.** Modul „Pravila", jezičak „Čuvari", podnaslov „Čuvari oglasa", urednik „Novo automatizovano pravilo", šablon „CPA Guard".
  - [P2] Žargon u uredniku: „Nivo primene (Scope)", „Ad Setovi", „adInsights prozor", „Min. impresija (šum)", „Email alert".
- **Ciljni kanvas:** čuvar je kartica u hubu Automatizacije (filter „Oglasi") i čip na redu kampanje u Oglasima:
```
┌ ⛨ CPA kampanje > 1.500 RSD (3 dana, ≥1.000 prikaza) → pauziraj + mejl         [● Radi] ┐
│ Sada najbliža pragu: „Prolećna akcija" 643 RSD  ▓▓▓▓░░░░░░ 43 % praga                   │
│ Poslednje: 25.10. 16:45 pauzirao „Prolećna akcija" (1.820 RSD)    [Vrati kampanju]       │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
  - **390:** ista kartica. Prekidač od 44 px, a uključivanje pauze otvara potvrdu sa listom pogođenih kampanja.

### Pravila › Istorija okidanja — `/rules` (jezičak) — snimci: `bx-pravila-istorija-1536x695.jpg`, `bx-pravila-istorija-390x844.jpg`
- **Posao:** šta su čuvari uradili i treba li da reagujem. **Obavlja: delimično.**
- UI:
  - [P2] „izmereno 1820.00": tačka kao decimalni znak (`toFixed(2)`, `rule-firings-table.tsx:111`), bez valute i bez praga. Treba „CPA 1.820,00 RSD > prag 1.500 RSD".
  - Vremenska osa je čista, tačka je u boji radnje — dobro.
- UX:
  - [P1] **Posle automatske pauze nema oporavka odavde.** Nema dugmeta „Vrati kampanju" ni linka na kampanju; ostaje odlazak u Oglase i traženje po imenu. Mejl ima link (`/ads?campaignId=…`, `rules.ts:247`), ekran nema.
  - [P2] Tooltipovi nose imena promenljivih: „ADS_WRITE_ENABLED nije true", „RESEND_API_KEY nije konfigurisan".
  - [P3] Istorija je zaseban jezičak sa jednim događajem, a poslednje okidanje već piše na kartici.
- **Ciljni kanvas:** zajednička istorija na dnu huba Automatizacije, sa filterom „Oglasi" i radnjama „Vrati kampanju" i „Otvori". **390:** lista događaja, radnja kao dugme od 44 px.

---

## 6. Međumodulni nalazi i IA

### 6.1 Analitika je razbijena — mapa mera, kontradikcije, ciljna struktura

**Gde se ista mera pojavljuje** (brojevi iz fikstura, za 28 d; kolona „uzrok" je ono što kod garantuje i u produkciji):

| Mera | Kontrolna tabla | Analitika (podstrane) | Atribucija | OpenReply | Kanali / Oglasi | Uzrok razlike |
|---|---|---|---|---|---|---|
| Posete (Sesije) | pločica 2.102 i grafikon | Pregled 2.102, tabela 2.546 · Sticanje 2.656 · Posetioci 2.669, geo 3.183 · Sadržaj ulazne 2.655 · Oglasi 894 (plaćene) | IG 383 · DM 98 | — | — | dnevni izveštaj protiv izveštaja po dimenziji |
| Korisnici | 1.893 | Pregled 1.893 · Sticanje „Ukupno korisnika" 1.750 (red 2.154) · Sadržaj 2.840 · Posetioci 2.295 (geo 2.848) · Uživo 14 (30 min) | — | — | — | **zbir po danima i po dimenziji** (`lib/metrics.ts`, `convex/analytics.ts`) |
| Novi korisnici | — | Pregled 1.155 · Sticanje 1.547 (red 1.753) · Retencija 1.555 „u 12 kohorti" | — | — | — | isto, plus tvrdo upisano „12" |
| Ishod (upit) | „Ključni događaji 81" · „Konverzije 4" (Top kampanja) · „Upiti (7 d) 18" (Puls) · „3 upita sa sajta čekaju" | Ključni događaji: Pregled 81 · Sticanje 128 (140) · Sadržaj 201 (a 117+74+58 = 249) · geo 150 · Oglasi 40. Kolona „Događaji" su ključni. | „Konverzije" 6, „16 sa IG", „Ključni događaji (GA4)" 4, „CR", „DM → Cilj" | — | Oglasi „Rezultati 443", „CPA" | četiri izvora (GA4 po izveštaju, Puls, `leadInbound`, Meta „rezultati") i šest imena |
| Pregledi stranica | — | Pregled „Pregledi stranica" 5.043 · Sadržaj „Prikazi stranica" 7.536 · `page_view` 6.410 | — | — | FB/Threads „Prikazi" (drugo značenje) | dva izveštaja, dva imena |
| Vreme | — | „Vreme angažovanja po sesiji 42s" · „Prosečno zadržavanje 1m 1s" (po korisniku) · „1 min 11 s" | — | — | YT „Vreme gledanja" | različite definicije i zapisi |
| Poslati DM | 382 · Top kampanja 214 | — | 404 (od početka) | levak 382 (period) · tabela 404 (od početka) | — | `orCampaignStats` (doživotno) protiv `orDaily` |
| Klikovi na link | 161 | — | 131 | 161 · tabela 131 | Threads „Threads klikovi" | isto |
| Instagram → sajt | — | Pregled: instagram/social 318 + l.instagram.com 164 | „Ukupno Instagram sesija 383" (bio 210) | — | — | različiti filteri izvora i medijuma |
| Novac | „Prihod ovog meseca (€)" | Oglasi (Google, GA4) 38.000 RSD | — | — | Oglasi 170.794 RSD (Meta i Google, API) · Pravila u € | GA4 trošak protiv Ads API-ja, € tvrdo u Pravilima |
| Prozor | 28 d i „Upiti (7 d)" | 28 d · Retencija 12 nedelja · Uživo 30 min | doživotno pomešano sa 28 d | pomešano | YT automatizacije „7 dana" | — |

**Kontradikcije koje kod garantuje** (nisu samo u fiksturi):
- **K1. Četiri različita „Korisnika" za isti period.** Svaki upit sabira `totalUsers` po danima, a podstrane još i po dimenziji (stranica, kanal, zemlja). Mesta u kodu: `lib/metrics.ts` `summarize`; `convex/analytics.ts` ~307, ~497, 641-643, 907-909, 1058-1060, 1201-1202, 1323-1325.
- **K2. Sesije na pločici i po izvorima.** Pločica sabira dnevni izveštaj, a tabela izvora izveštaj po izvoru, medijumu i kampanji. Fusnota postoji, ali 900 px niže.
- **K3. „Poslati DM" u levku i u tabeli istog ekrana.** Levak OpenReply-a je za period, tabela je od početka (`openreplyStore.campaigns` nema period). Atribucija i Top kampanja na Kontrolnoj tabli koriste doživotni broj.
- **K4. Levak Atribucije meša periode** (vidi ekran Atribucija).
- **K5. Ishod ima šest imena i četiri izvora**, a nijedan ekran ih ne poravnava.
- **K6. Kolona „Događaji" su ključni događaji**, tabela „Događaji" su svi.
- **K7. Google potrošnja iz dva izvora** (Ads API i GA4), a valuta je € u Pravilima i na Poslovanju, RSD u Oglasima.
- **K8. Pilula promene ima suprotno značenje** za potrošnju na Analitika › Oglasi i u Oglasima.

**Ciljna struktura — šta gde živi:**

| Mesto | Ostaje / dolazi | Odlazi i kuda |
|---|---|---|
| Kontrolna tabla | Jedna pločica „Upiti · 28 d" sa deltom (vodi u Analitiku). Poslovanje (Puls) ostaje. | Grafikon sa 8 mera, Sesije, Korisnici i Ključni događaji → Analitika. „Poslate DM poruke" → brojač u Automatizacijama. |
| Analitika › Pregled | Upiti (fokus) i njihova podela, odakle su, trend sa prethodnim periodom, 3 sekundarna broja, jedna rečenica. | — |
| Analitika › Izvori | Kanal → posete → upiti → upita na 100 → trošak → cena po upitu. Redovi se otvaraju: izvor/medijum, kampanja, IG (bio, priče, DM levak), Plaćeno (Google, Meta). | Prima Sticanje, Atribuciju i Analitika › Oglasi (rute preusmeravaju). |
| Analitika › Sajt | Stranice sa upitima, uređaji, zemlje, sati. Sklopljeno: ulazne stranice, povratak posetilaca, Tehnički detalji (svi GA4 događaji, kvalitet podataka). | Prima Sadržaj, Posetioce i Retenciju. |
| Uživo | Čip u zaglavlju i bočni panel; ruta ostaje. | Izlazi iz podnavigacije. |
| Kanali (IG/FB/YT/Threads) | Izvorne mere platforme (doseg, pratioci, pregledi), plus jedan red „Na sajt: N poseta · M upita ›" koji vodi u Izvore filtrirane po kanalu. | Threads tabele „Praćeni linkovi / Nespojeni URL-ovi" → Izvori › Threads (alat za linkove može da ostane na Threads-u). |
| Oglasi | Jedini izvor novca. Kolone „Posete (GA4)" i „Upiti" po kampanji, čip čuvara na redu. | — |
| Automatizacije | Brojači po automatizaciji za period. | Levak → Izvori. |

**Bočna traka:**
- RADNI STO: Tabla, Leadovi, Novosti.
- KANALI: Instagram, Facebook, YouTube, Threads, Oglasi.
- UVID I AUTOMATIKA: Analitika (3 podstavke), Automatizacije.

To je dve stavke manje (Atribucija; OpenReply i Pravila postaju jedna), a Analitika ima 3 podstavke umesto 7. B10 §7 beleži da bočnoj traci na Analitici ostaje samo 5 px rezerve na 695 px; ovo je rešava.

**Ciljni kanvas Analitike na 1536×695:** kanvas „Pregled" u §5 (Analitika › Pregled).

### 6.2 Da li grafikoni odgovaraju na pitanja vlasnika

| Pitanje | Gde danas | Odgovor | Šta treba |
|---|---|---|---|
| Da li sajt donosi pozive i upite? | Sadržaj › Događaji (dno), Kontrolna tabla › Poslovanje „Upiti (7 d)" | **Ne.** Skriveno, bez trenda, a tabela događaja nema deltu. | Pregled sa fokusom „Upiti": pozivi (GA4 `phone_click`), forme (`leadInbound` website i `form_submit`), poruke (DM i komentari iz `leadInbound`). |
| Koji kanal donosi leadove? | Pregled (kolona „Ključni događaji", sortirano po sesijama), Sticanje (grafikon bez upita), Atribucija (samo IG DM) | **Delimično** | Izvori sortirani po upitima, sa stopom i troškom. Izvor leada iz baze (UTM forme, kanal komentara ili DM-a). |
| Bolje ili gore nego prošli period? | Pilule na pločicama (kad prethodni period postoji) | **Delimično.** Grafikoni nemaju prethodni period, tabele nemaju delte, zaključak nije izrečen. | Isprekidana linija prethodnog perioda, kolona Δ u Izvorima, rečenica. |
| Isplate li se oglasi? | Oglasi (CPA/ROAS platforme), Analitika › Oglasi (samo Google, pogrešne boje) | **Delimično**, sa dva broja potrošnje | Cena po upitu po platformi, na jednom mestu. |

**Ocena grafikona:**
- **Površina Sesija** (chart-6): tip je dobar. Y-osa nema jedinicu ni naslov, a `monotone` krivina zaobljuje vrhove. Nema prethodnog perioda (u kodu), i dupla je sa Kontrolnom tablom.
- **Parne trake na Sticanju** porede korisnike prvog dodira sa sesijama — dve različite jedinice na istoj skali, pogled za analitičara. Zameniti trakama „upiti po kanalu".
- **Naslagana površina uređaja** vara oko: gornja linija je zbir. Zameniti trakom udela.
- **Toplotna mapa:** tip je dobar, ali nema rečenicu-sažetak i nema pristup tastaturom i dodirom.
- **Dvojni grafikon na Analitika › Oglasi:** ideja je dobra, ali podeoci su maksimum i polovina, oznake se sudaraju, podnaslov je za programera, a boje pilula su pogrešne.
- **Krive retencije:** linije se preklapaju, 2/3 površine su prazne, legenda je u ISO datumima.
- **OpenReply linija i stubići:** u redu.
- **`FunnelSteps`:** komponenta je odlična; podaci u njoj su pomešani (K3, K4).

**Jedinice i zapisi (sr-RS):**
- Hiljade su dobre („2.102").
- Trajanje ima tri zapisa (42s / 1m 1s / 1 min 11 s); treba jedan: „42 s", „1 min 1 s".
- Retencija ima ISO datume.
- Pravila imaju „1820.00" bez valute i „€" pored RSD.
- „53,8%": srpski pravopis traži razmak („53,8 %"). Odluka je opciona, ali jedna za celu aplikaciju.

**Uvid:** nigde nije izrečen (grep: nijedan „najviše", „pad", „rast" u analitici). Sve mora da se zaključi. Predlog: čista funkcija u `lib/` sastavlja jednu rečenicu po pogledu iz podataka koji su već na ekranu — bez AI i bez nove zavisnosti — npr. „Upita: 47 (↑12 % prema 42). Najviše: Google pretraga 19 (+4). Pad: Instagram 11 (−2)."

### 6.3 Automatizacija je razbacana — jedan modul, jedan mentalni model

**Popis:**

| Mesto | Kanal | Okidač | Uslov | Radnja | Trag | Rečnik |
|---|---|---|---|---|---|---|
| OpenReply › Automatizacije | IG i FB | komentar ili DM sa ključnom reči | bilo koja/sve reči, deo/cela reč, sve objave ili jedna (ručni ID) | DM sa linkom, dugmićima i brzim odgovorima; kapija praćenja; naknadna poruka; javni odgovor | „DM log" | automatizacija; na Pregledu „kampanja" |
| OpenReply › Ledolomci i meni | IG profil | početak razgovora ili meni | — | pokreće automatizaciju | — | ledolomci |
| YouTube › Automatizacije | YouTube | komentar sa ključnom reči | bilo koja reč, deo reči, svi videi | javni odgovor ili moderacija („Zadrži za pregled") | „Log komentara", kvota | automatizacija; „Odgovora (7 dana)" |
| Threads › jezičak Automatizacije | Threads | odgovor ili spominjanje sa ključnom reči | tip poklapanja, max po niti, države | javni odgovor; režimi draft i Uživo | izvršenja | „pravilo", „Uživo (Live)", `draft` |
| Pravila | samo Meta oglasi | provera na 30 min | metrika veća od praga u prozoru, min. prikaza, nivo | pauza, mejl | „Istorija okidanja" | pravilo, čuvar, Guard |

Pravila bodovanja u Leadovima (`scoring-rules-panel`) nisu automatizacija radnje i ostaju u Leadovima.

**Mentalni model** (jedna rečenica po automatizaciji, kao `rule-sentence.ts` danas):
- **KAD** — okidač: događaj na kanalu (komentar, DM, odgovor) ili vreme (svakih 30 min).
- **AKO** — uslov: ključne reči i objava, ili metrika veća od praga za N dana uz min. prikaza.
- **URADI** — radnja: poruka, javni odgovor, sakrij ili zadrži, pauziraj kampanju, javi mejlom.
- **TRAG** — istorija: šta, kome, kada, ishod, i radnja povratka [Vrati / Otvori].
- **STANJE** — Radi · Test · Isključeno · Ne može (i zašto: token, kvota, webhook).

**Preporuka:** jedan modul „Automatizacije" (jedna stavka bočne trake).
- Hub prikazuje sve motore kao jednu listu rečenica, sa jednom trakom stanja i jednom istorijom.
- Urednici ostaju po vrsti (polja su stvarno različita), ali u istom kalupu: bočni list od ~720 px sa tri odeljka (Kad · Uradi · Dodatno), pregledom poruke desno, rečenicom i dugmetom „Sačuvaj kao test".
- Svaki motor dobija test režim (Threads model) pre „Uživo".
- YouTube › Automatizacije i Threads › Automatizacije ostaju kao filtrirani prikazi huba, sa linkom „Sve automatizacije ›", pa ništa ne nestaje.
- „Ledolomci i meni" postaje odeljak „Instagram razgovor" u hubu.
- Pravila se vide i kao čip na kampanji u Oglasima.
- Ime „OpenReply" ostaje samo u Podešavanjima, kao ime motora.

**Kanvas huba (1536×695):**
```
│ Automatizacije                                                 [+ Nova automatizacija ▾]  │
│ Stanje: IG i FB ● radi · YouTube ● radi (kvota 59 %) · Threads ◐ test · Oglasi ● na 30 min │ 1 red; problem = crveni čip „Reši ›"
│ [Sve 9] [Poruke 3] [YouTube 3] [Threads 1] [Oglasi 2]                         [Pretraga]  │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ ● KAD IG komentar sadrži „cenovnik"   → DM + link /cenovnik      28 d: 214 DM · 79 klik  [⏽] ✎ │
│ ● KAD YouTube komentar „cena"         → javni odgovor            28 d: 9 odgovora        [⏽] ✎ │
│ ◐ KAD Threads odgovor „termin"        → javni odgovor (TEST)     28 d: 3 simulacije      [⏽] ✎ │
│ ● KAD CPA kampanje > 1.500 RSD (3 d)  → pauziraj + mejl          poslednje 25.10. 16:45  [⏽] ✎ │
│ ○ KAD potrošnja > 5.000 RSD (1 d)     → mejl                     nikad                   [⏽] ✎ │
├──────────────────────────────── Istorija (sve) ──────────────────────────────────────────┤
│ 16:50 Čuvar CPA pauzirao „Prolećna akcija" (1.820 RSD > 1.500 RSD)  [Vrati kampanju] [Otvori] │
│ 16:41 DM → @marko (cenovnik) · link otvoren                                                │
```
**Urednik (bočni list):**
```
┌ Nova automatizacija ───────────────────────────── [Test ○ Uživo] ┐┌ Pregled poruke ┐
│ 1 KAD    [Instagram ▾] [Komentar ▾] sadrži [cenovnik ×][ponuda ×] ││ @test.salon    │
│          na [● Sve objave  ○ Izaberi objavu: ▦ ▦ ▦ sličice]       ││ Hvala! Evo…    │
│ 2 URADI  Poruka [……………………………………] 120/900   Link [https://…]      ││ [Cenovnik]     │
│ 3 DODATNO ▸ Zaprati pre poruke ▸ Naknadna poruka ▸ Javni odgovor  ││                │
│ „Kad neko na Instagramu komentariše ‚cenovnik', pošalji mu DM…"   ││                │
│ Nedostaje: tekst poruke                 [Otkaži] [Sačuvaj kao test]││                │
└───────────────────────────────────────────────────────────────────┘└────────────────┘
```
**390:** hub je lista kartica (rečenica i prekidač od 44 px), a filteri su čipovi koji klize. Urednik se otvara preko celog ekrana, odeljak po odeljak.

### 6.4 Žargon — šta zadržati, prevesti, objasniti

| Termin (gde) | Odluka | Predlog |
|---|---|---|
| Sesije (sve) | prevesti | „Posete"; u (i): „GA4 sesija, prekida se posle 30 min neaktivnosti" |
| Korisnici / Ukupno korisnika / Novi korisnici | prevesti, posle ispravke zbira | „Posetioci", „Novi posetioci" |
| Angažovane sesije, Stopa angažovanja, odskok (bounce) | u detalje, objasniti | „Posete sa interakcijom (≥10 s, 2+ stranice ili upit)". Odskok izbaciti (= 1 − angažovanje). |
| Ključni događaji / Konverzije / Web konverzije / Cilj / CR | zameniti | „Upiti" sa vrstom (poziv, forma, poruka). „Ključni događaji" samo u Tehničkim detaljima, sa (i). |
| Klj. događaji po sesiji / po korisniku | zameniti | „Upita na 100 poseta" |
| `page_view`, `session_start`, `user_engagement`, `first_visit`, `scroll`, `click`, `form_start`, `phone_click`, `form_submit`, `generate_lead`, `file_download` | prevesti, sirovo ime sitno uz prevod | „Klik na telefon (phone_click)", „Poslata forma (form_submit)" … |
| Organic Search, Direct, Organic Social, Paid Search, Referral, Email, Organic Video, (not set), (direct)/(none), cpc | prevesti | „Google pretraga", „Direktno", „Društvene mreže", „Plaćena pretraga", „Drugi sajtovi", „Email", „Video", „bez oznake" |
| Izvor / medij(um) | prevesti, spojiti | Jedna kolona „Izvor": ikonica i ljudski naziv („Instagram · bio link"); sirovo `instagram / social` u `title` |
| Prvi dodir / Ova poseta | zadržati, sakriti | Mali prekidač u Izvorima: „Prvi dolazak" / „Ova poseta" |
| Prag primenjen / Thresholding | prevesti | „Google sakrio male brojeve (privatnost)" |
| Retencija, kohorte, `firstSessionDate` | prevesti, sakriti | „Povratak posetilaca" |
| property, „propertija", Realtime API, service account | ukloniti iz glavnog UI-ja | Vremenska zona u Podešavanjima; „service account" samo u uputstvu za povezivanje |
| Desktop/Mobile/Tablet, imena država | prevesti | „Računar / Telefon / Tablet"; `Intl.DisplayNames` |
| CTR | zadržati i objasniti | „CTR (klikova na 100 prikaza)". U OpenReply-u ostaje „klikova po poruci". |
| CPC / CPA / ROAS | zadržati skraćenicu uz srpski naziv | „Cena po kliku (CPC)", „Cena po rezultatu (CPA)", „Povrat na oglase (ROAS)". ROAS sakriti kad nema vrednosti konverzija. |
| Impresije (Pravila) / Prikazi (FB, Threads) | ujednačiti | „Prikazi" |
| UTM, `utm_medium=…`, slug | u detalj, objasniti | „Oznaka linka (UTM)": jedna rečenica šta je |
| Scope, Ad Setovi, adInsights prozor, cooldown, Email alert, Guard | prevesti ili ukloniti | „Važi za", „Grupe oglasa", (ukloniti), „Pauza između okidanja", „Mejl", „Čuvar" |
| Ledolomci, DM log, Motor, Webhook, imena promenljivih okruženja | prevesti ili ukloniti | „Pitanja na početku razgovora", „Poslate poruke", „Automatski odgovori rade". Imena promenljivih samo u Podešavanjima, vlasniku. |
| DM, Lead | zadržati | razumljivo |

### 6.5 Ostala dupliranja sa drugim modulima
- **Kontrolna tabla** ponavlja Analitiku: isti `SessionsChart` sa 8 mera, Sesije, Korisnici, Ključni događaji, DM i klikovi. Ima i četvrti izvor ishoda („Upiti (7 d)" iz Pulsa) i „3 upita sa sajta čekaju" (`leadInbound`). Upiti, dakle, postoje na Tabli, a ne postoje u Analitici.
- **Tri mesta za oglase:** Oglasi (API), Analitika › Oglasi (GA4, samo Google) i Pravila (samo Meta, u €).
- **YouTube „Izvori saobraćaja"** (izvori pregleda na YouTube-u) imaju isto ime kao „Izvori saobraćaja" sajta. Pri preimenovanju treba ih razlikovati: „Odakle dolaze gledaoci".

---

## 7. Persone — crvene zastavice

- **Alex (power user):**
  - Ne može da filtrira Analitiku po kanalu („samo Instagram") niti da iz reda izvora uđe u stranice tog izvora.
  - Nema izvoza tabela ni poređenja dva perioda na grafikonu.
  - Tri urednika automatizacija sa tri modela. Nema masovnog uključivanja i isključivanja, ni pretrage po ključnoj reči kroz sve motore.
  - Da bi uporedio dva broja, mora da otvori dve podstrane i da veruje fusnoti.
- **Sam (tastatura i čitač ekrana):**
  - Toplotna mapa nudi detalj samo na `onMouseEnter`; ćelije nemaju fokus ni `aria-label`.
  - Birač mere (Pregled i Kontrolna tabla) nema `aria-pressed`.
  - Ključna objašnjenja su sive fusnote od 12 px (2.546 protiv 2.102).
  - Na Analitika › Oglasi boja pilule tvrdi suprotno od strelice: rast potrošnje je zelen.
  - Čipovi-brojevi na Pravilima izgledaju kao kontrole.
- **„Jovan za stolom" (1536×695, 10 otvaranja dnevno):**
  - **„Koliko poziva ove nedelje?"** Analitika → Sadržaj → klizanje ~2.300 px → tabela Događaji → `phone_click`. Poređenja nema. Četiri koraka, a odgovora „više ili manje" nema.
  - **„Da li je DM nešto doneo?"** OpenReply kaže 382, Atribucija 404. Koji je tačan?
  - Prag pravila je u €, Oglasi su u RSD, pa računa u glavi. Posle automatske pauze ide u Oglase i traži kampanju po imenu.
- **„Jovan na terenu" (390×844, jedna ruka):**
  - Prvi ekran Analitike su birač perioda, traka jezičaka, naslov i „Pogledaj uživo", pa tek onda prvi broj — Sesije.
  - Tabele izvora i kampanja seku kolone bez znaka; „38.000 RS" je odsečeno.
  - Urednik automatizacije sa ~20 polja u modalu je neupotrebljiv, a ID objave na telefonu ne može ni da nađe.
  - Pravilo koje pauzira kampanje uključuje se jednim dodirom, bez potvrde — lako slučajno. Olovka i korpa su male i jedna do druge.

## 8. Veliki predlozi (strukturne promene)

**V1. Prvo brojevi, pa izgled (sloj mera)** — veličina **M–L**
- **Šta:**
  - Period-nivo GA4 zbirovi bez dimenzije datuma za 7, 28 i 90 d i za proizvoljan opseg na zahtev (u `convex/ga4.ts` sinhronizaciji). Korisnici se nikad ne sabiraju po danima ni po dimenziji. Gde se to ne može, mera se ne prikazuje.
  - OpenReply brojevi po automatizaciji po danu, za period (umesto doživotnog `orCampaignStats`). Atribucija ne meša prozore.
  - Jedan rečnik mera u `lib/` (naziv, kratki naziv, definicija za (i), format, polaritet, izvor) koji koriste sve pločice i tabele.
- **Zašto:** K1–K8. Svaki dizajn iznad pogrešnih brojeva samo lepše prikazuje nepoverenje.
- **Rizik:** više GA4 kvote, migracija dnevnih tabela.
- **Gubi se:** ništa. Fusnote „zbir odstupa" nestaju jer više nisu potrebne.

**V2. Analitika = Upiti** — veličina **L**
- **Šta:** fokus Pregleda je „Upiti", sa delom „pozivi · forme · poruke", trendom, prethodnim periodom i rečenicom. Izvor je `leadInbound` (forma sa stranicom i UTM-om, komentari, DM-ovi) plus GA4 događaji koje Jovan označi kao upit.
- **Zašto:** to je jedino pitanje koje vlasnik postavlja ovom modulu, a podatak već postoji u bazi.
- **Rizik:** definicija upita je njegova odluka (§9). GA4 nazivi događaja se razlikuju po sajtu, pa treba podešavanje „Šta se broji kao upit" po projektu.
- **Gubi se:** hero „Sesije". Posete ostaju kao sekundarni broj.

**V3. Sedam podstrana plus Atribucija → tri jezička (Pregled · Izvori · Sajt)** — veličina **L**
- **Šta:**
  - Izvori primaju Sticanje, Atribuciju i Analitika › Oglasi.
  - Sajt prima Sadržaj, Posetioce i Retenciju (sklopljeno).
  - Uživo postaje čip i panel.
  - Rute ostaju i preusmeravaju.
  - Stavka „Atribucija" nestaje iz bočne trake.
- **Zašto:** sedam ekrana sa istim obrascem (objašnjenje → 4–5 pločica → tabela) i različitim brojevima.
- **Rizik:** navika (mala — jedan korisnik) i obim prerade.
- **Gubi se:** ništa. Sve tabele su dostupne kroz otvaranje redova i sklopljene sekcije.

**V4. Jedan modul „Automatizacije"** — veličina **L**
- **Šta:** hub iz §6.3. Čini ga spisak svih motora kao rečenice KAD → URADI, jedna traka stanja, zajednička istorija sa „Vrati" i „Otvori", urednici kao bočni listovi u istom kalupu, i test režim za svaki motor.
- **Zašto:** četiri mesta, četiri rečnika, tri ista obrasca. „Kampanja" je pogrešno ime za automatizaciju. „OpenReply" ne kaže šta radi.
- **Rizik:** hub agregira postojeće upite (bez promene motora). Urednici se prepakuju, ne prepisuju.
- **Gubi se / seli:**
  - OpenReply › Pregled → kartice automatizacija i Izvori.
  - YouTube i Threads automatizacije ostaju kao filtrirani prikazi.
  - „Ledolomci i meni" → odeljak „Instagram razgovor".

**V5. Čuvari budžeta u valuti naloga, sa probom i povratkom** — veličina **M**
- **Šta:**
  - Valuta se čita iz Meta naloga i piše uz svaki prag.
  - Šabloni računaju prag iz stvarnog CPA naloga (npr. 2× medijana) umesto 15 €, i ne upisuju se sami.
  - Uključivanje pauze pokazuje probu: „sada bi pauziralo N kampanja".
  - Kartica pokazuje vrednost prema pragu.
  - Istorija dobija „Vrati kampanju" i „Otvori".
  - Jasno piše „samo Meta oglasi", dok Google ne bude podržan.
- **Zašto:** P1 rizik po novac (K7) i nema oporavka.
- **Gubi se:** ništa.

**V6. Kontrolna tabla bez kopije Analitike** — veličina **S**
- **Šta:** umesto grafikona sa 8 mera i četiri GA4 pločice, jedna pločica „Upiti · 28 d", koja vodi u Analitiku.
- **Zašto:** dva ekrana pokazuju isto, a nijedan ne pokazuje upite.
- **Rizik:** nema.
- **Gubi se:** grafikon na Tabli (ostaje u Analitici).

## 9. Pitanja za Jovana

1. **Šta se broji kao „upit"?**
   - (a) Samo upiti u bazi: forma sa sajta, DM-ovi i komentari koji su postali lead.
   - (b) GA4 ključni događaji: klik na telefon, forma, `generate_lead`.
   - (c) Oba, razdvojeno: „pozivi" iz GA4 (poziv inače ne ostavlja trag) i „forme i poruke" iz baze.

   **Preporuka: (c).**
2. **Retencija, Uživo i Analitika › Oglasi?**
   - (a) Retencija postaje sklopljena sekcija u Sajtu, Uživo čip i panel, Analitika › Oglasi se spaja u Oglase i Izvore.
   - (b) Zadržati kao podekrane.
   - (c) Retenciju obrisati.

   **Preporuka: (a)** — ništa se ne gubi, a navigacija pada sa 7 na 3.
3. **Automatizacije na jednom mestu?**
   - (a) Jedan modul „Automatizacije" za sve motore, sa zajedničkom istorijom; kanali vode na filtrirani prikaz.
   - (b) Svaka automatizacija u svom kanalu, bez centra.
   - (c) Sve ostaje kako jeste.

   **Preporuka: (a).**
4. **Ime „OpenReply" u navigaciji?**
   - (a) „Automatizacije" (posle V4), a OpenReply samo kao ime motora u Podešavanjima.
   - (b) „Auto-odgovori".
   - (c) Zadržati, ako je OpenReply brend koji planiraš da prodaješ klijentima.

   **Preporuka: (a)**, osim ako važi (c).
5. **Valuta:**
   - (a) Sve u valuti izvora, uvek ispisanoj (oglasi u RSD, prihod u € ako ga sajt tako šalje).
   - (b) Sve u RSD.
   - (c) Sve u €.

   **Preporuka: (a).**
6. **Termini:**
   - (a) Srpski svuda („Posete", „Posetioci", „Upiti"), GA4 naziv u (i).
   - (b) GA4 nazivi sa objašnjenjem.

   **Preporuka: (a).**
7. **Nova automatizacija:**
   - (a) Podrazumevano u testu, „Uživo" je drugi korak.
   - (b) Podrazumevano aktivna, kao danas.

   **Preporuka: (a)**, kao na Threads-u.

## 10. Sitnice (P3)

- „3 kampanja": `campaigns-table.tsx:87` ima istu reč u obe grane.
- Trajanje: „42s", „1m 1s", „1 min 11 s" → jedan zapis („42 s", „1 min 1 s").
- Retencija: ISO datumi u legendi i matrici → „22. 9.".
- Istorija pravila: „izmereno 1820.00" → „1.820,00 RSD (prag 1.500 RSD)".
- Analitika › Oglasi: oznake ose se sudaraju („25. okt27. okt"); podeoci „2.108 / 1.054" → okrugli.
- „Vremenska zona propertija: Europe/Belgrade" u podnožju svake podstrane, u mono → jednom, u Podešavanjima.
- Podnaslov grafikona „Dva sinhronizovana grafikona… nišanom" → „Potrošnja i upiti po danu".
- Kartice-objašnjenja koje ponavljaju podnaslov (`acquisition-dashboard.tsx` ~150, `content-dashboard.tsx` ~132, `audience-dashboard.tsx` ~142, `ads-performance-dashboard.tsx` ~141) → ukloniti, definicije u (i).
- „Ostale stranice (19) — Korisnici 0", „Ostali događaji (3) — 0 · 0,00" → „—".
- „Odgovoreno na Instagramu/Facebook-u" broji poslate DM-ove → „Poslato na Instagramu".
- „131 link klikova" (Atribucija) → „131 klik na link".
- Placeholder „Poslato u DM! 📩" i „npr. CPA Guard (maksimalno €15 po konverziji)" → bez emodžija, bez € i bez engleskog.
- Čip „Provera na 30 min" je podešavanje, ne broj → tekst uz naslov.
- Mobilna traka jezičaka Analitike ima natpise grupa velikim slovima („SVAKODNEVNO", „DETALJNO") usred klizanja → posle V3 nisu potrebni.
- Podnavigacija Analitike u bočnoj traci je mreža 2 × 4; redosled čitanja nije jasan → posle V3 tri stavke u jednom redu.
- Zelena traka „Motor je uključen…" (68 px) za zdravo stanje → jedan red ili čip.
- „Pređite mišem preko kvadratića" → fokus i dodir, i rečenica-sažetak.
- Uživo: „Ažurirano pre 22s" → „pre 22 s".
- Tabela izvora na Sticanju i u Analitika › Oglasi: nazivi u bold mono → Aeonik sa `SourceIcon`; mono samo za cifre.
- Urednik pravila: izvorni `<select>` i ručni prekidač → shadcn `Select` i `Switch`, isti kao na kartici.
