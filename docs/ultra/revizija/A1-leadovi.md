# A1 — Leadovi — revizija

> **Napomena za noćne runove (27. 10. 2026.):** ovo je revizija napravljena pre ULTRA runova. Putanje `ED/…` znače koren ovog repoa; `AUDIT/…` i snimci `nocni-run/ux/bx-*.jpg` nisu u repou. Brojevi su iz sintetičkih podataka razvojnog prikaza (`?ux=1`). Valuta: pravi nalozi za oglase rade u evrima (odluka O16 u `docs/ULTRA-PLAN.md`); tvrdnje o nalogu „u dinarima“ potiču iz probnih podataka. Odluke, obim i redosled važe iz `docs/ULTRA-PLAN.md`, a ne iz pitanja i preporuka u ovom izveštaju.


Obim: `ED/components/app/leadovi/` (42 fajla), rute `ED/app/(app)/[projekat]/leadovi/` (Danas, Tabela, Mapa, Rupe, Zaostali, Sastanci, Režim poziva, profil `[companyId]`, `uvoz`), uz backend koji ih hrani (`convex/leadCrmStore.ts`, `leadFiltersStore.ts`, `leadInboundStore.ts`, `leadImportStore.ts`, `lib/leadImportParse.ts`).
Snimci: `ED/nocni-run/ux/bx-*`. Isečci prvog ekrana su u `AUDIT/shots/A1/s/*-0fold.jpg`, ostatak strane u `*-rNN.jpg`. Dodatni snimci su u `AUDIT/shots/A1/`: `tabela-vise-filtera`, `tabela-prosiren-red(-isecak)`, `danas-dijalog-ishod`, `danas-ishod-390`, `danas-pozovi-traka(-isecak)`, `poziv-dijalog-sastanak`, `profil-faza-meni`, `profil-sledeci-korak`, `profil-dobijen-dijalog`, `rupe-popuni-dijalog`, `podesavanja-nise`, `podesavanja-ocenjivanje`.
**Odgovori na četiri pitanja iz zadatka su u §11** (životni ciklus, broj koraka petlje, podela na jezičke, pojmovi kvaliteta podataka).
Napomena o dokazima: razvojni prikaz (`?ux=1`) ne izvršava mutacije. Zato su nalazi o tome šta se desi POSLE upisa izvedeni iz koda i označeni „(kod; proveriti na produkciji)". Tvrdnje da nešto „ne postoji" (tok, ponuda, poređenje) zasnovane su na kodu, ne na snimcima.

## 0. Presuda specifičnosti

Modul je delimično autorski. Dva dela su napravljena baš za Jovana i srpsko tržište:
- **Režim poziva**: jedna firma na ekranu, tasteri P/1–4/N/Esc, „Zašto je na spisku", dnevnik ture.
- **Pravila poštenja brojeva**: „—" umesto 0, imenioci, ispisane granice upita, predlog zabrane uz poklopljeni izraz (ZZPL).

Ostatak je zamenljiv „alat za obogaćivanje baze". Ekran je organizovan oko kvaliteta podataka: Kvalitet baze, Rupe, procena telefona, Fit/Intent i četiri reda filtera za sajt. Nije organizovan oko posla „od prvog poziva do ponude". Tok prodaje, ponuda i dobijen posao nemaju svoj prikaz, a sledeći korak nije deo petlje.

## 1. Nielsen

| # | Heuristika | Ocena 0–4 | Ključni problem |
|---|---|---|---|
| 1 | Vidljivost stanja sistema | 2 | Povratne poruke su dobre („Pozvao si … — kako je prošlo?", „Nije sačuvano: … Pritisni ishod ponovo.", imenioci). Loše: korak se ne vidi dok ne zakasni; „Zovi sada 40" stoji uz „4 firme u redu"; faza ostaje „Nov" posle sastanka; uvoz piše „Status: Primenjen" uz 41 nerešen red; sort radi samo na strani od 25, i to nigde ne piše. |
| 2 | Podudarnost sa stvarnim svetom | 2 | Mešaju se engleski i interni žargon: Fit/Intent, Hot/Warm/Cold, Inbound, „u preseku", „dodir", „vlasnik" u dva značenja, `landing_tracker`, `google_maps (potvrđeno)`, `trackedLinkMissing`, „staging", „parser", „deploy", `/generate-leads`. Lista ishoda nema dva najčešća ishoda hladnog poziva: „zovi kasnije (nije tu)" i „traži ponudu". |
| 3 | Kontrola i sloboda | 2 | Postoje Esc u režimu, „Odustani", otkazivanje sastanka i poništavanje uvoza. Ne postoje „korak urađen" ni „bez koraka" (mutacija ne postoji), ni poništavanje ishoda. Firma posle beleške ispada iz reda poziva i ne vraća se. |
| 4 | Doslednost i standardi | 1 | Isti signal ima dva natpisa: „mnogo recenzija" i „visok broj recenzija". Ista temperatura: „Hot/Warm/Cold" i „vrelo/toplo/hladno". Crvena ivica znači i „Hot" i „kasni". Isti bedž broji stavke na jezičcima, a vrste posla u bočnoj traci. Za isti zaostali korak piše „Otvori" na Leadovima, a „Zovi" na Kontrolnoj tabli. Temperatura se menja kroz nativni `<select>` u profilu i uvozu, a kroz meni-čip u tabeli. Mešaju se „ti" i „vi", „Odustani" i „Otkaži". Na telefonu postoje dva „Danas". |
| 5 | Sprečavanje grešaka | 2 | Dobro: obavezno obrazloženje za Dobijen/Izgubljen, upozorenje za datum u prošlosti, predlog zabrane uz pokazan izraz. Loše: „Tražio da ga ne zovemo" NE pokreće predlog zabrane; beleška se upisuje kao dodir; „Nije se javio" nema razmak do ponovnog poziva; zaglavlje „Broj telefona" se pri uvozu ne prepoznaje. |
| 6 | Prepoznavanje umesto pamćenja | 2 | Posle „Zainteresovan" sistem ne nudi sledeći korak; treba zapamtiti malu ikonicu kalendara. Uvoz daje recept „Detalji → Trag → Promeni odluku". Faza je na 3. nivou menija. Prečice tabele su iza ikonice bez natpisa. |
| 7 | Fleksibilnost i efikasnost | 3 | Odlični su režim poziva (P, 1–4, N, Esc), tastatura tabele (j/k, Enter, Space, p, i, s, /, ?), ⌘K, gustina i CSV. Nedostaju grupne radnje i brzi rokovi („sutra 10h"). Sort radi samo po strani, a Danas nema prečica. |
| 8 | Estetika i minimalizam | 2 | Režim poziva je čist. Danas ima dva fokusa i 6 čipova pre posla. Tabela ima 2 reda iznad preloma. Kolone su konstantne (Intent „—", „Nov · Nova firma"). Čip „+25 XP" stoji na svakoj kartici. |
| 9 | Prepoznavanje grešaka i oporavak | 3 | Poruke su na srpskom, konkretne i kažu šta dalje. Slabe tačke: neprepoznata kolona uvoza ispada uz samo upozorenje; „(trackedLinkMissing)" se vidi u UI. |
| 10 | Pomoć i dokumentacija | 2 | „i" oblačići sa kriterijumima i prazna stanja koja objašnjavaju su dobri. Ali pomoć je u `title` (samo hover, nema je na telefonu), prečice su skrivene, a uputstva su recepti u tekstu. |
| | **Ukupno** | **21 / 40** | Opseg 19–23: „prihvatljivo", donja granica. Jak režim poziva vuku nadole doslednost i razbijena petlja ishod → korak → faza. |

## 2. Kognitivno opterećenje (8 stavki: jedan fokus, grupisanje u delove, grupisanje srodnog, hijerarhija, jedna stvar odjednom, malo izbora, radna memorija, postepeno otkrivanje)

- **Danas, 1536×695 — padaju 5/8.**
  - Jedan fokus ✗: traka poziva i „KVALITET BAZE 50 %" stoje u istom redu, iste težine.
  - Grupisanje u delove ✗: 6 brojčanih čipova i 4 dela kvaliteta.
  - Hijerarhija ✗: 3 kartice upita (y 384–556) teže su od reda poziva, koji počinje na y 620.
  - Jedna stvar odjednom ✗.
  - Malo izbora ✗.
  - Prolaze: grupisanje srodnog, radna memorija, postepeno otkrivanje (kriterijumi su u „i").
- **Tabela — padaju 6/8.**
  - Jedan fokus ✗, grupisanje u delove ✗ (13 čipova filtera u 4 reda), hijerarhija ✗ (filteri teži od podataka), malo izbora ✗.
  - Radna memorija ✗: sort važi samo za tekuću stranu, a „Sakriveno: Vlasnik" treba pamtiti.
  - Postepeno otkrivanje ✗: sve grupe filtera su stalno otvorene.
- **Režim poziva — pada 1/8.** Radna memorija ✗: sledeći korak se ne traži, pa se mora zapamtiti ikonica u dnevniku.
- **Profil — padaju 3/8.** Grupisanje u delove ✗ (red od 6 činjenica i 3 oznake porekla), malo izbora ✗ (meni od 5 stavki, podmeni od 7, 6 jezičaka), postepeno otkrivanje ✗ (obrnuto: faza je prejako sakrivena).
- **Uvoz – pregled — pada 7/8.** Samo grupisanje srodnog prolazi.
  - Dva fokusa: „Primeni preostale" i „Reši preostale".
  - Pre tabele stoji 6 blokova.
  - Recept u tekstu.
  - Upozorenja parsera su stalno otvorena.
- **Mapa — pada 5/8.** Filter-panel od 253 px stoji iznad mape.
- **Rupe — padaju 2/8.** Pet pločica iste težine; PIB i kontakt osoba stoje uz telefon.
- **Tačke odluke sa više od 4 opcije:**
  - traka Leadova: 6 jezičaka i 2 dugmeta;
  - dijalog ishoda: 9 ishoda;
  - meni faze: 7 faza;
  - meni čipa „Stanje" u tabeli: 7 faza i 4 temperature u jednoj listi (11 stavki);
  - profil: „Još radnji" (5 stavki) uz podmeni (7) i 6 jezičaka;
  - filteri uvek vidljivi: 13 čipova i 3 preseta; fioka „Više filtera" ima 8 grupa;
  - Rupe: 5 vrsta rupa;
  - Danas: 6 brojčanih čipova;
  - pregled uvoza: 6 čipova „Šta je nastalo" i rezime od 7 delova;
  - istorija uvoza: 3 dugmeta po redu.

## 3. Emocionalno putovanje (vrh i kraj)

- **Vrh: Režim poziva.** Jedna firma, velik broj telefona, 1–4, „2 zaredom", traka ture, i na kraju kartica „Tura je završena · N poziva sa ishodom, od toga M sastanaka · +XP". To je jedini trenutak modula koji se pamti kao „ovo radi za mene".
- **Doline:**
  1. Otvaranje Leadova: dve zone iste težine, šest brojeva i tri upita. Nije jasno gde se počinje.
  2. „Javio se" na kartici Danas: kartica nestaje (kod; proveriti), a traka sa „Zabeleži ishod / Sledeći korak" nestaje sa njom.
  3. Sledeći korak se zadaje kucanjem `mm/dd/yyyy, --:-- --` (US format u snimku) bez ijedne prečice.
  4. Tabela: dva reda na ekranu, a sort „laže".
  5. Uvoz: 41 red jedan po jedan, kroz dijalog.
  6. Zaostali ostaju crveni zauvek: urađen poziv i zatvoren posao ne skidaju „kasni".
  7. Sastanak zakazan za sledeći utorak ne postoji u „Sastancima".
- **Kraj je loš.** Tipičan dan se završava na „Vrati se na / Zaostali" sa crvenim „Kasni 3 dana" koje ne može da se očisti bez izmišljanja novog datuma. Leadovi nemaju zatvaranje dana; postoji samo kraj ture u režimu poziva. Po pravilu vrha i kraja ostaje utisak: „aplikacija me opominje".

## 4. Šta valja i treba zadržati

1. **Režim poziva** (`call-mode.tsx`): zamrznut red, jedna kartica, P/1–4/N/Esc, fokus na „Pozovi" kad stigne nova firma, dnevnik ture, kraj ture sa rezimeom, čitač ekrana najavljuje firmu („Firma 2 od 4: …"). To je pravo jezgro Leadova i treba da postane podrazumevan način rada (§8.1, §8.2).
2. **Poštenje brojeva**:
   - „—" umesto 0, imenioci („od 210 u bazi");
   - „Prikazano 6 najstarijih od N";
   - ispisane granice upita („Projekat ima više od N dodela…");
   - predlog zabrane uz „Poklopljeni izraz";
   - obavezno obrazloženje za Dobijen/Izgubljen.

   To gradi poverenje i ne sme se izgubiti u preradi.
3. **„Zašto" čipovi u kategorijalnim bojama** („nema sajt", „samo Instagram", „tuđe zakazivanje"): razlog poziva i polazna tačka razgovora vide se za sekundu.
4. **Istorija firme** (vremenska osa sa beleškama i ishodima) i **URL kao izvor filtera**: „Vidi sve (N)" otvara baš taj filter, linkovi se mogu deliti, `?rezim=poziv` preživi osvežavanje.

## 5. Po ekranu

### Danas — `/leadovi` — snimci: `bx-leadovi-1536x695.jpg`, `bx-leadovi-390x844.jpg`, `AUDIT/shots/A1/danas-pozovi-traka-isecak.jpg`, `danas-dijalog-ishod.jpg`, `danas-ishod-390.jpg`

- **Posao ekrana:** reći koga da zovem sada i pustiti me da to odmah uradim. **Delimično.** Fokus i režim poziva su dobri, ali red sadrži samo prve pozive, povratni pozivi se vide tek kad zakasne, a prvi ekran ima dva fokusa.
- **UI:**
  - **[P1] Dva fokusa iste težine.** Traka „Danas 3 / 5 poziva" (x 272–1076) i „KVALITET BAZE 50 %" (x 1100–1504: broj 20 px mono bold, zelena traka, dugme) stoje u istom redu, y 152–268. U kodu: `leads-today.tsx`, grid `2fr/1fr` sa `DanasFokus` i `KvalitetBazeMerac`. → Desna kolona treba da bude „Ove nedelje" (pozivi/sastanci/ponude prema cilju) i „Agenda danas". Kvalitet baze seli u Podaci (§8.4).
  - **[P1] Posao počinje ispod preloma.** Naslov „Zovi sada" je na y 593, kartice od y 620. Iznad su 6 brojčanih čipova („210 u bazi · 178 u preseku od toga 55 … 127 na mapi", y 294–320) i 3 kartice upita (y 384–556). → Sledeća firma treba da bude fokus kartica (y ≤ 460), a red kompaktna lista redova od 36 px ispod nje. Čipovi brojeva prelaze u Firme/Podaci.
  - **[P2] Zelena boja modula se razvodnjava.** Na strani je 12+ zelenkastih secondary dugmadi (3× „Napravi firmu", 4× „Pozovi", 5× „Zabeleži ishod"/„Otvori") uz primarno dugme. Glavna radnja kartice („Pozovi") je secondary, iste težine kao „Napravi firmu". → U redu: jedna ikonica-radnja po redu (ghost, puna na fokusu tastature), a puno dugme samo na fokus kartici.
  - **[P2] Zlatni čip „+25 XP" ponovljen 4× sa istim brojem.** Ne razlikuje kartice, pa zlato postaje šum. → Jedna linija u fokusu: „poziv + ishod = +25 XP".
  - **[P2] Leva ivica kartice nosi dva značenja.** `lead-urgency.ts` `rowEdge`: kasni → `--danger #fb7185`, Hot → `--temp-hot #f0604f`; sastanak uskoro → `--warning #fbbf24`, Warm → `--temp-warm #c98500`. Na ivici od 3 px se ne razlikuju. → Ivica nosi samo hitnost; temperatura ide kao čip sa rečju.
  - **[P3] Prazna traka „Dopuni pa zovi 0" troši ~90 px** na pasus i dva linka ka istom mestu („Sve bez broja (39)", „Rupe u podacima (39)"). → Kad je 0, traka se ne crta.
- **UX:**
  - **[P0] Danas ne drži povratne pozive.** Red poziva i režim poziva sadrže SAMO prve pozive (`use-zovi-sada.ts`: `tel: 40, dodir: ["nikad"]`). „Vrati se na" pokazuje SAMO zakasnele korake (`listOverdue`: `nextActionAt < now`). Korak dogovoren za danas u 15:00 do 15:00 nije nigde na Danas, a posle je crven. Kad nema novih firmi, fokus kaže „Red za pozive je prazan", iako čekaju dogovoreni pozivi. → Jedan red: upiti → sastanci bez ishoda → dogovoreno za danas (i zakasnelo) → novi. Režim poziva ide kroz ceo red (§8.2).
  - **[P1] Dva broja za „koga zvati".** Naslov kaže „Zovi sada 40 … Vidi sve (40)", fokus „4 firme u redu". Prvi broj (`ukupno`) ne gleda Fit, drugi (`kandidati`) traži Fit ≥ prosek.
    - Prag je relativan, pa uvek odseče oko polovine.
    - Firme bez merljivog Fit-a ispadaju čim jedna firma ima Fit.
    - Kandidati su prvih 50 po vremenu unosa (`listLeadsFiltered` čita indeks `by_workspace`), pa sa više od 50 kandidata najbolji Fit može ostati van reda.

    → Red = svi kandidati, rangirani na serveru. Isti broj u naslovu i u fokusu.
  - **[P1] Posle „Javio se" kartica nestaje (kod; proveriti).** `logTouch` postavlja `lastTouchAt`, firma više nije „nikad dodirnuta", `useZoviSada` je izbacuje, a traka (faza `answered`: „Zabeleži ishod / Sledeći korak / Zakaži sastanak") se demontira sa karticom. Ishod i korak ostaju neupisani, a firma nije ni u jednoj traci. → Kartica ostaje zamrznuta dok se tok ne završi, ili se umesto trake koristi kartica ishoda nezavisna od liste (§8.1).
  - **[P1] Najtopliji leadovi nemaju „Pozovi".** „Upiti sa sajta" nude samo „Napravi firmu", iako je broj na kartici („Pekara Klas · 064 111 2233"). Firma napravljena iz upita nema zaduženje (`leadInboundStore.ts` ne upisuje `leadAssignments`, za razliku od uvoza), pa je nema u Tabeli, Mapi ni redu poziva; vidi se samo u Rupe → „Bez vlasnika" (kod; proveriti). → „Pozovi" na kartici upita; konverzija pravi zaduženje i nudi ishod/korak.
  - **[P1] Pogrešna radnja za dogovoren poziv.** Kartica „Kasni 3 dana — „Zvati posle 10h"" nudi „Otvori" (prelazak na profil), ne „Pozovi"; broj nije na kartici. Kontrolna tabla za isti posao kaže „Zovi". → Primarno „Pozovi".
  - **[P2] Danas nema prečica**, a režim poziva i tabela imaju. → J/K kroz red, P, 1–6.
- **Nema smisla:**
  - Isto pitanje ima tri broja: „Danas 3 / 5 poziva", „Zovi sada 40" i „4 firme u redu".
  - „Dopuni pa zovi" piše „6 firmi nema broj", a odmah do toga stoji „Sve bez broja (39)". To su dva upita (`listCompaniesWithGap` naspram `listGaps`); u razvojnom prikazu se razilaze, na produkciji proveriti.
  - Link „Sastanci (3)" u traci i jezičak „Sastanci 2" na vrhu broje različite skupove (danas + prošli bez ishoda, naspram toga + naredna 3 dana).
  - Ista firma (Test Salon 2) stoji u „Zovi sada" (nikad dodirnuta) i u „Vrati se na" (kasni korak). To je stvaran slučaj: „Nije se javio" + „Kad ponovo zvati?" ne upisuje dodir. Firma ostaje u redu prvih poziva i zvaće se PRE dogovorenog vremena.
- **Ciljni kanvas 1536×695:**
```
┌ Danas 14 │ Tok │ Firme │ Podaci •                                  [Uvezi] [⚙] ┐ 40
├──────────────────────────────────────────────────────┬────────────────────────────┤
│ SLEDEĆI 1/14 · dogovoren poziv · kasni 3 d          │ OVE NEDELJE                │
│ TS  Test Salon 2 · Beograd · Kozmetički salon   [71] │ Pozivi   6/25  ███░░░      │
│ „Zvati posle 10h" · poslednje: Zainteresovan, 25.10. │ Sastanci 1/3   ██░░        │
│ ☎ +381 60 000 0000  Test Osoba · broj vlasnika  [⧉] │ Ponude   0/2               │
│ [ Pozovi  P ]  [Preskoči N]  [Profil ↗]              ├────────────────────────────┤
│ Ishod: 1 Nije tu · 2 Zainteresovan · 3 Traži ponudu  │ AGENDA DANAS               │
│        4 Sastanak · 5 Ne zanima · 6 Ne zovi · ⋯      │ 11:00 Sastanak · TS9       │
│ Korak: [Sutra 10h][2 dana][Pon 10h][7 dana][📅]      │ 14:00 Poziv · TS6          │
│ Beleška _____________________________  [Sačuvaj ↵]   │ 15:30 Sastanak bez ishoda !│
├──────────────────────────────────────────────────────┴────────────────────────────┤ ~470
│ RED: Upiti 3 · Sastanci bez ishoda 2 · Dogovoreno 3 · Novi 40      [Kreni redom ▶] │
│ ▸ Pekara Klas · upit pre 1 d · „sajt sa porudžbinama"            [☎]               │
│ ▸ Test Salon 6 · sastanak 15:30 bez ishoda                        [Ishod]          │ 695
```
  **390×844:** jezičci „Danas · Tok · Firme · Podaci" bez vodoravnog klizanja (Uvoz i ⚙ u ⋯). Prvi ekran = kartica sledeće firme sa „Pozovi" od 56 px u zoni palca. Ishodi 1–6 su lepljiva donja ploča. Donja navigacija se sakriva dok traje rad sa redom.

### Tabela — `/leadovi?tab=leads` — snimci: `bx-leadovi-tabela-1536x695.jpg`, `bx-leadovi-tabela-390x844.jpg`, `AUDIT/shots/A1/tabela-vise-filtera.jpg`, `tabela-prosiren-red-isecak.jpg`

- **Posao ekrana:** naći bilo koju firmu ili skup firmi i delovati (pozvati, promeniti fazu, izvesti). **Delimično.**
- **UI:**
  - **[P1] Na 1536×695 vide se 2 reda.** Filter-panel zauzima y 152–405 (253 px, uvek otvoren: 13 čipova u 4 reda i 3 preseta). Slede meta-red (y 440) i zaglavlje (y 495–533). Redovi su visoki 80 px jer je podrazumevano „Udobno" (`readDensity` → `comfortable`). B10 §7 je ovo ostavio neurađeno. → Jedan red filtera (padajući čipovi Faza / Interes / Telefon / Sajt / Niša / „Još"). Podrazumevano „Kompaktno" od 36 px daje 13–14 redova iznad preloma.
  - **[P1] Uvek vidljivi filteri su filteri kvaliteta podataka** (Sajt, Kvalitet sajta, Telefon, Niša). Prodajni (Faze toka, Temperatura, Poslednji dodir) su u fioci „Više filtera" (`tabela-vise-filtera.jpg`). To je obrnuto od posla. → U glavni red ide Faza / Sledeći korak / Poslednji kontakt.
  - **[P2] Konstantne i prazne kolone.**
    - „Intent —" stoji u 21 od 25 redova.
    - „Stanje" ponavlja „Nov · Nova firma": isto „nov" dvaput.
    - „Sledeći korak · dodir" ima sivo kurzivno „Prvi poziv"/„Nađi broj" u svakom redu.
    - „Akcije" su prazne u 24 od 25 redova.
    - Plan §1.3 je na produkciji izmerio istu vrednost u 100 % redova za Stanje, Sledeći korak i Intent.

    → Intent se prikazuje kao čip signala samo kad postoji. Kolona „Sledeći korak" pokazuje datum ili „—".
  - **[P2] Isti signal ima dva natpisa:** „mnogo recenzija" u tabeli (`LEAD_SIGNAL_SHORT`), a „visok broj recenzija" na Danas, telefonu i profilu. → Jedan natpis, kratak svuda.
  - **[P2] Kolona Sajt seče domen** („test-salon-2…") i dodaje oznaku „radi". Za poziv je bitno samo „nema / ne radi / spor". → Kolona nosi stanje sajta, a domen ide u oblačić.
  - **[P3]** Dugme prečica je ikonica tastature bez natpisa.
- **UX:**
  - **[P1] Sort važi samo za tekuću stranu od 25.** U kodu, `leads-table.tsx` r. 498: „Sortiranje SE RADI ISKLJUČIVO UNUTAR TEKUĆE STRANE". Klik na „Fit ↑↓" daje najbolje od 25 redova, ne od 178, i to nigde ne piše. Podrazumevani redosled je vreme unosa. → Sort na serveru (Fit, sledeći korak, poslednji kontakt), 50 redova po strani.
  - **[P1] Nema grupnih radnji** (nema izbora redova): ni faza, ni temperatura, ni korak, ni izvoz izabranih. → Kolona za izbor reda + traka radnji.
  - **[P1] 32 od 210 firmi uopšte nisu u tabeli.** Oblačić čipa „u preseku" kaže: „Leadovi sa vlasnikom — redovi tabele, bez ijednog filtera" (`leads-today.tsx`). Tabela lista `leadAssignments`, a firma bez zaduženja tu ne postoji. → Za jednog korisnika automatsko zaduženje; dok to ne postoji, red „i još 32 bez zaduženja [Zaduži sve]".
  - **[P2] Faza se menja kroz čip „Nov · Nova firma ▾"** sa menijem od 11 stavki (7 faza + 4 temperature). Faza se ne vidi kao zaseban pojam.
  - **[P2] Tastatura je skrivena.** j/k, Enter, Space, p, i, s, / i ? postoje, ali je spisak iza ikonice. „s" otvara dijalog sa `datetime-local`.
  - **[P3] Beleška se upisuje kao dodir.** Polje „Beleška" u proširenom redu („upisuje se u istoriju kao dodir „beleška"") zove `logTouch(channel: "beleska")` i postavlja `lastTouchAt`. Firma kojoj je samo zapisana beleška ispada iz „nikad dodirnut" i iz reda poziva. → Beleška ne dira `lastTouchAt`. (Ponašanje je P1 u §11; ovde je samo mesto u UI.)
- **Nema smisla:**
  - „Prikazano 1–25 od 178 u preseku" na vrhu i „Strana 1 od 8 (po 25 leadova)" na dnu.
  - „Sakriveno: Vlasnik — svima „Ti"" za radni prostor sa jednim korisnikom.
  - U fioci „Više filtera" piše „Presek: 178 leadova. Brojevi uz čipove kažu koliko **biste** dobili klikom": „vi", a ostatak aplikacije „ti".
- **Ciljni kanvas 1536×695:**
```
┌ Firme  [Tabela | Mapa]   🔍 Traži firmu (/)                              178 ┐
│ [Faza ▾][Interes ▾][Telefon ▾][Sajt ▾][Niša ▾][Sledeći korak ▾][+ Još]  ✕  │
│ Prikazi: Nikad zvani · Dogovoreno danas · Ponuda bez odgovora · + Sačuvaj  │
├──┬──────────────────────────┬───────────────┬──────────────┬─────────┬──────┤
│☐ │ Firma · grad · niša (240)│ Faza · interes│ Sledeći korak│ Posl. k.│ ☎ ⋯  │
│☐ │ TS Test Salon 1 · Beograd│ Nov  ·  —     │ —            │ nikad   │ ☎ ⋯  │ 36 px
│…   14 redova iznad preloma; sort na serveru; 50/strana                    │
└ traka izbora: [Faza ▸][Interes ▸][Korak ▸][Izvezi izabrane]               ┘
```
  **390×844:** pretraga + jedan red čipova „Filteri (2) ▾" (otvara list odozdo). Prvi ekran = 5 kartica firmi, a ne filteri (danas su filteri do y 715, prva kartica ispod donje trake). „F 64 I —" → „Pogodnost 64".

### Tabela — vraćene kolone — `/leadovi?tab=leads` + „Prikaži" — snimak: `bx-leadovi-tabela-kolone-1536x695.jpg`

- **Posao ekrana:** pokazati kolonu koja je sakrivena jer je ista u svakom redu. **Da, ali je kolona besmislena.**
- **UI: [P2]** Kolona „Vlasnik" sa „Ti" u svakom redu oduzima ~90 px koloni Firma. Natpis „Isto u svakom redu: Vlasnik — svima „Ti" · Sakrij ih" je dobar.
- **UX: [P2]** „Vlasnik" ovde znači zaduženog korisnika. U Rupama „Bez kontakt osobe" znači vlasnika FIRME, a u panelu mape „Vlasnik · verovatno" ulogu osobe. → „Zadužen" za korisnika svuda. Kolona se ne nudi dok tim nema ≥ 2 člana sa radnjama.
- **Nema smisla:** Mehanizam „sakrij konstantne kolone" je pametan, ali leči simptom. Kolone su konstantne zato što faza, korak i temperatura ne ulaze u petlju (§11).
- **Ciljni kanvas:** kao Tabela. Kolona „Zadužen" postoji samo u timu. 390: ništa.

### Zaostali — `/leadovi?tab=overdue` — snimci: `bx-leadovi-zaostali-1536x695.jpg`, `bx-leadovi-zaostali-390x844.jpg`

- **Posao ekrana:** povratni pozivi kojima je prošao rok. **Delimično.** Lista je tačna, ali se nikad ne prazni bez izmišljanja novog datuma.
- **UI:**
  - **[P2] Tri nivoa crvene iste jačine:** crvena ivica, crveni čip „kasni 3 dana" i crveni naslov sekcije „Zaostali koraci".
  - **[P2]** Na 1536×695 ekran je 2/3 prazan (y 370–695). Broj telefona nije na kartici.
- **UX:**
  - **[P1] Korak ne može da se završi.** Nema „Urađeno"/„Obriši korak": mutacija ne postoji u `leadCrmStore.ts`, a `logTouch`/`recordOutcome` ne diraju `nextActionAt`. Posle poziva i ishoda kartica ostaje „kasni" dok se ne izmisli novi rok.
  - **[P1] Zatvoreni poslovi ostaju zaostali.** `listOverdue` ne isključuje Dobijen/Izgubljen/Odložen, a `setStage` ne briše korak, pa zatvoren posao ostaje „zaostao" zauvek.
  - **[P1] Primarna radnja je „Zabeleži ishod"**, a ne „Pozovi", za korak „Zvati posle 10h".
  - **[P2] Nema „Odloži za sutra"** jednim klikom.
- **Nema smisla:** Jezičak duplira traku „Vrati se na" na Danas i bedž zvona („3 zaostala koraka").
- **Ciljni kanvas:** prestaje da bude jezičak; postaje filter „Kasni" u redu na Danas i u Firme. Kartica: `TS Test Salon 2 · „Zvati posle 10h" · kasni 3 d · [☎ Pozovi] [Sutra ▸] [✓ Urađeno]`. 390: isti red; prevlačenje udesno = „Sutra", ulevo = „Urađeno".

### Rupe u podacima — `/leadovi?tab=gaps` — snimci: `bx-leadovi-rupe-1536x695.jpg`, `bx-leadovi-rupe-390x844.jpg`, `AUDIT/shots/A1/rupe-popuni-dijalog.jpg`

- **Posao ekrana:** dopuniti podatke koji blokiraju poziv. **Delimično.** Pet vrsta rupa ima istu težinu, a samo telefon blokira poziv.
- **UI:**
  - **[P2]** 5 pločica iste težine (Bez telefona 39, Bez kontakt osobe 155, Bez vlasnika 32, Bez sajta 3, Bez PIB-a 96), sa brojkama od 28 px.
  - Na listi „Bez telefona" svaka kartica nosi amber čip „nema PIB" (šum na pogrešnoj listi) i „evidentirano 30.09.2026. 17:41" (birokratski).
  - Na telefonu je prvi ekran 5 pločica jedna ispod druge.
- **UX:**
  - **[P1] „Bez vlasnika" nije rupa nego greška sistema.** Opis u `gaps-panel.tsx` kaže „Leadovi koji nisu dodeljeni nijednom operateru". Odmah do nje „Bez kontakt osobe" znači „bez imena direktora, **vlasnika** ili menadžera": ista reč u dva značenja na istom panelu. Tih 32 firme su nevidljive u tabeli.
  - **[P2] Dopuna broja je spora.** „Popuni rupu" otvara formu od 5 polja sa pravnim osnovom (ZZPL), što je ispravno. Nema prečice „Traži na Google mapama / Instagramu" (pretraga sa imenom i gradom), a to je stvaran način nalaženja broja.
  - **[P2] Dopuna stoji uz prodaju.** Amber bedž „39" je u glavnoj traci jezičaka, uz crvene „3" i „2".
  - **[P3]** Naslov „Popuni: Bez telefona", dugme „Otkaži" (drugde „Odustani"), „izaberite" („vi").
- **Nema smisla:**
  - „Bez vlasnika" (zaduženje) i „Bez kontakt osobe" (vlasnik firme) stoje jedna do druge: ista reč, dva značenja.
  - Na listi „Bez telefona" je istaknut amber čip „nema PIB".
  - Bedž jezička („39") broji samo telefone, a jezičak pokazuje pet vrsta rupa.
- **Ciljni kanvas:** seli u **Podaci**. Vrh: „Za poziv fali broj: 39 firmi [Dopunjuj redom ▶]". Dopuna redom = jedna firma na ekranu, kao režim poziva, sa linkovima „Google mape · Instagram · sajt". Ostale rupe su sekundarna lista. „Bez vlasnika" nestaje (automatsko zaduženje). 390: isti red, jedna firma.

### Sastanci — `/leadovi?tab=meetings` — snimci: `bx-leadovi-sastanci-1536x695.jpg`, `bx-leadovi-sastanci-390x844.jpg`, `AUDIT/shots/A1/poziv-dijalog-sastanak.jpg`

- **Posao ekrana:** šta je danas i ove nedelje, i šta čeka ishod. **Delimično.**
- **UI:** **[P2]** Dve kartice u mreži od 3, a pola ekrana je prazno. Crveni naslov od 20 px „Prošli, bez zabeleženog ishoda". Nema vremenske ose ni kalendarskog prikaza.
- **UX:**
  - **[P1] Posle ove nedelje nema ničega.** Sastanci posle ove nedelje se ne prikazuju nigde u jezičku: `meetings-panel.tsx` `groupMeetings` kaže „dalje od ove nedelje: ne prikazuje se". U petak ponedeljni sastanak ne postoji na ekranu. Ni tabela nema filter „ima sastanak".
  - **[P1] Ishod sastanka koristi listu ishoda POZIVA** („Nije se javio", „Kod konkurencije"…). Nema „Traži ponudu", „Dogovoren posao" ni „Razmisliće".
  - **[P2] Faza ne prati sastanak.** U dijalogu sastanka je „Prebaci fazu u „Sastanak"" podrazumevano ISKLJUČENO (`moveToStage = false`), pa faza ostaje „Nov".
  - **[P2] Nema „Dodaj u kalendar" (.ics).** Sastanak živi samo ovde.
  - **[P2] Brojevi se ne slažu.** Bedž „2" broji danas + prošle bez ishoda, a link na Danas „Sastanci (3)" broji i naredna 3 dana.
- **Nema smisla:** Napomena sastanka „Poslati ponudu posle sastanka" je jedino mesto gde se ponuda pominje. Ponuda postoji samo kao slobodan tekst.
- **Ciljni kanvas:** **Agenda** u desnoj koloni na Danas (danas + sutra) i ceo pogled „Agenda" u Firme (filter „ima sastanak", po danima, bez granice nedelje). Kartica sastanka:
  ```
  11:00 · TS9 · „Prvi sastanak u salonu" · [Ishod sastanka ▾: Traži ponudu · Dogovoren posao · Razmisliće · Odbio] [⇩ .ics]
  ```
  390: lista po danima, prošli bez ishoda na vrhu.

### Mapa — `/leadovi?tab=map` — snimci: `bx-leadovi-mapa-1536x695.jpg`, `bx-leadovi-mapa-390x844.jpg`

- **Posao ekrana:** gde su firme, za obilazak i rad po lokaciji. **Slabo.**
- **UI:**
  - **[P1] Iznad preloma je 228 px mape** (mapa počinje na y 467), jer i ovde stoji filter-panel od 253 px. Na telefonu je prvi ekran ceo filter (do y 715), a mapa je ispod preloma.
  - **[P2] Natpisi mape su na drugom pismu i jeziku.** Na desktopu su ćirilicom („БЕОГРАД", „СТАРИ ГРАД", „ПАЛИЛУЛА"), na telefonu engleski („BELGRADE"), a UI je latinica.
  - **[P2]** Pinovi nose temperaturu samo bojom, uz legendu. Klasteri su crveni krugovi sa brojem, a crvena tu nema dogovoreno značenje.
- **UX:**
  - **[P1] Nema rada po lokaciji.** Nema „U blizini mene" ni „Navigacija" (otvaranje rute u Google mapama): `leads-map*.ts*` nema geolokaciju ni link ka mapama. „Preleti hot firme (3)" je animacija preleta, ne plan obilaska.
  - **[P2]** „bez koordinata: 51 · prikaži u tabeli": 29 % firmi nije na mapi.
- **Nema smisla:**
  - Jedina posebna radnja mape je „Preleti hot firme (3)", animacija. Nema „u blizini" ni rute.
  - Iznad mape je ponovljen ceo filter-panel Tabele (4 reda čipova o sajtu i proceni broja), iako se mapa koristi za lokaciju.
- **Ciljni kanvas 1536×695:** zajednički red filtera (1 red), pa mapa ~540 px sa panelom firme od 360 px desno (kartica ishoda §8.1). **390×844:** mapa preko celog ekrana, dugme „U blizini" (geolokacija pregledača, bez nove zavisnosti) i list odozdo „5 najbližih" sa [☎] [Navigacija ↗] [Beleška].

### Mapa — panel firme — `/leadovi?tab=map&firma=…` — snimci: `bx-leadovi-mapa-panel-1536x695.jpg`, `bx-leadovi-mapa-panel-390x844.jpg`

- **Posao ekrana:** brza radnja nad firmom izabranom na mapi. **Da, ali je panel dug.**
- **UI:** **[P2]** Na 695 px se vidi samo vrh panela (Pozovi, kontakt). „Dodir i plan" je ispod unutrašnjeg klizanja. „Vlasnik · verovatno 64 %" (uloga osobe) je treće značenje reči „vlasnik".
- **UX:** **[P2]** „Zabeleži", „Postavi" i „Zakaži" su tri zasebna dugmeta i tri dijaloga. To je ista razbijena petlja kao drugde. „Nema e-mail adrese u bazi." zauzima red.
- **Nema smisla:** Sekcija „Dodir i plan" postoji u tri varijante: panel mape, prošireni red tabele i „Još radnji" u profilu. Svaka ima drugačiji raspored istih radnji.
- **Ciljni kanvas:** panel = zaglavlje (ime, interes, faza) + kartica ishoda (§8.1) + kontakt sklopljen. 390: list odozdo na pola ekrana.

### Profil firme — `/leadovi/[companyId]` — snimci: `bx-leadovi-profil-1536x695.jpg`, `bx-leadovi-profil-390x844.jpg`, `AUDIT/shots/A1/profil-sledeci-korak.jpg`, `profil-dobijen-dijalog.jpg`

- **Posao ekrana:** sve o firmi i jedna sledeća radnja. **Delimično.** Fokus „Šta je sledeće" je dobar, a faza i ponuda su zakopane.
- **UI:**
  - **[P1] Zaglavlje (y 128–470, 342 px) staje pre istorije i nosi previše.**
    - naziv i 3 oznake porekla: „google_maps (potvrđeno)", „Uvoz", „Odgovara projektu ScanMe";
    - red od 6 činjenica: grad, temperatura kao nativni `<select>` sa crvenom ivicom, faza „U radu" kao statičan čip, „sutra u 16:44", „nema sastanka", „vlasnik: ti";
    - prstenovi Fit/Intent sa „64 / 100" ispod (isti broj dvaput);
    - red „Kopiraj u ScanMe — Kopija nosi poreklo…" IZNAD fokusa.

    → Zaglavlje u 2 reda. Poreklo seli u jezičak „Firma i poreklo", ScanMe u „⋯", Fit/Intent u jedan red teksta.
  - **[P2] Temperatura ima dve kontrole:** `<select>` (`TemperatureSelect`) u profilu i uvozu, meni-čip u tabeli.
  - **[P2] Istorija pokazuje sirove podatke:** izvore „landing_tracker", „site_audit", „google_maps", „instagram", „sajt" i „Vrednost: llland_ux_test_000000001" (sirovi ID). „Promena vlasnika" nema „od → do".
- **UX:**
  - **[P1] Faza je na 3. nivou.** Jedini put do „Poslata ponuda"/„Dobijen" je „Još radnji" → Stanje/„Faza ›" → podmeni (`profil-faza-meni.jpg`). Čip „U radu" u zaglavlju nije klikabilan.
  - **[P1] Ponuda ne postoji kao objekat** (nema iznosa, datuma slanja, roka ni dokumenta). Jezičak „Landing" samo prati otvaranja: „Nema kreirane landing stranice za ovu firmu." je bez radnje, a u tekstu stoji „(trackedLinkMissing)".
  - **[P2] Dva pojma za isti posao.** „Zabeleži ishod" je dugme, „Zabeleži dodir…" je u meniju. „Izmeni sledeći korak…" je u meniju, iako je korak srce fokusa.
  - **[P2]** „Dodeli drugom…" traži da se nalepi ID korisnika (placeholder „Nalepi ID korisnika…" u `lead-quick-dialogs.tsx`).
  - **[P2] Dobijen i Izgubljen ne beleže ono što vredi.** Dobijen traži obrazloženje, ali ne i vrednost posla. Za Izgubljen je razlog slobodan tekst, pa nema statistike razloga.
- **Nema smisla:** Četiri stanja stoje jedno uz drugo, a nijedno ne kaže „gde je ovaj posao": temperatura „Hot", faza „U radu", korak „sutra 16:44" i ishod u istoriji „Zainteresovan".
- **Ciljni kanvas 1536×695:**
```
┌ ← Firme   TS  Test Salon 2   [Hot ▾] [U radu ▾]   Beograd, N. Beograd · Fit 64 · Intent 38   ⋯ ┐
│ ┌ ŠTA JE SLEDEĆE · sutra 16:44 · „Zvati posle 10h" ───────────────────────────────────────┐ │
│ │ [ Pozovi ▾ ]  [Zabeleži poziv]  [Sastanak]  [Ponuda]        korak: [Sutra][+2d][📅][✓] │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────┘ │
│ ISTORIJA (2/3)                                   │ KONTAKT: Test Osoba · broj vlasnika 64 %  │
│ ● 25.10 Zainteresovan — „Traži cenu redizajna"   │ ☎ +381 60 … [⧉]  ✉ test2@…               │
│ ● 25.10 Poziv — „Javila se vlasnica, 4 min"      │ SAJT: radi · mobilni 38/100               │
│ ● 23.10 Nije se javio                            │ PONUDA: — [+ Dodaj ponudu]                │
```
  **390×844:** ime + faza ▾ + „Šta je sledeće" + „Pozovi" (56 px) u prvom ekranu. Poreklo, ScanMe i prstenovi idu ispod istorije.

### Profil — „Još radnji" — snimak: `bx-leadovi-profil-radnje-1536x695.jpg`, `AUDIT/shots/A1/profil-faza-meni.jpg`

- **Posao ekrana:** ostale radnje nad firmom. **Da**, ali u meniju su i radnje koje ne bi smele da budu tu.
- **UI:** **[P3]** Meni od 5 stavki u 3 grupe (Kontakt: Piši, Zabeleži dodir…, Izmeni sledeći korak…; Stanje: Faza ›; Vlasnik: ti → Dodeli drugom…) i podmeni od 7 faza; „+ obrazloženje" uz Dobijen/Izgubljen.
- **UX:**
  - **[P1]** Faza i korak su u meniju.
  - **[P2]** Faze su poređane „Poslata ponuda" PRE „Sastanak", a Jovanov tok je poziv → sastanak → ponuda.
  - **[P2]** „Odložen" nema „do kada", pa nikad ne vraća firmu u red.
- **Nema smisla:** Faza „U radu" se vidi na dva mesta (statični čip u zaglavlju i „Faza › U radu" u meniju), a menja se na trećem (podmeni).
- **Ciljni kanvas:** faza je čip-meni u zaglavlju („U radu ▾"), a korak je u fokusu sa brzim rokovima. U „⋯" ostaju Piši, Kopiraj u ScanMe i Zaduži. „Odložen do [datum]" vraća firmu u red.

### Režim poziva — `/leadovi?rezim=poziv` — snimci: `bx-leadovi-poziv-1536x695.jpg`, `bx-leadovi-poziv-390x844.jpg`, `AUDIT/shots/A1/poziv-dijalog-sastanak.jpg`

- **Posao ekrana:** zvati firmu za firmom i beležiti ishod bez razmišljanja. **Najbolji ekran modula, ali bez sledećeg koraka.**
- **UI:**
  - **[P2]** Desna kolona „Ova sesija" je na početku 70 % prazna. To je mesto za „koliko još" i agendu.
  - Broj telefona (28 px, mono bold) je dobar, ali nema „⧉ Kopiraj" (na desktopu se broj realno kuca na telefonu).
  - **[P3]** Prsten Fit od 56 px je za poziv manje bitan od „Zašto".
- **UX:**
  - **[P0] Posle „2 Zainteresovan" odmah dolazi sledeća firma**, a sledeći korak se ne traži (`call-mode.tsx` `zabelezi`: `logTouch` + `recordOutcome` → `dalje`). Faza ostaje „Nov".
    - Firma je dodirnuta, pa izlazi iz „Zovi sada".
    - Nema korak, pa nije u „Vrati se na".
    - Faza je „Nov", pa se ne razlikuje od 177 drugih.
    - Nije ni u jednom redu. Jedini put je ikonica kalendara od ~32 px u dnevniku desno, sa natpisom samo u `title` („Kad se sledeći put javljaš").
  - **[P1]** Red sadrži samo prve pozive (vidi Danas).
  - **[P1] „1 Nije se javio" ne zakazuje ponovni pokušaj.** Ne upisuje dodir ni rok, pa firma ostaje „nikad dodirnuta" i u sledećoj turi je opet prva (red je po Fit-u). Nema brojača pokušaja.
  - **[P1] Ishodi nisu ishodi hladnog poziva.** Nema „Zovi kasnije (nije tu)" ni „Traži ponudu". „4 Zakaži sastanak" otvara dijalog sa `datetime-local` (u snimku US format „mm/dd/yyyy, --:-- --") i sa podrazumevano ISKLJUČENIM „Prebaci fazu u „Sastanak"".
  - **[P2] „P" na desktopu otvara `tel:`.** Na Windowsu je to izbor aplikacije ili Phone Link (pitanje 1).
  - **[P2]** Na telefonu donja navigacija ostaje u fokus režimu i prekriva „Zakaži sastanak…" (y ~775–844).
- **Nema smisla:** „Kombo 2 zaredom" se računa i za „Nije se javio". Meri brzinu kliktanja, a ne ishode.
- **Ciljni kanvas:** kartica iz Danas (gore) preko cele širine levo; desno „Ova tura · 4/10 · ostaje 6" i agenda. Posle tastera ishoda fokus prelazi na red rokova, Enter čuva i ide dalje. **390:** kartica, „Pozovi" 56 px dole, ishodi 1–6 u mreži 3×2 u zoni palca, bez donje navigacije.

### Režim poziva — tok posle dva ishoda — snimci: `bx-leadovi-poziv-tok-1536x695.jpg`, `bx-leadovi-poziv-tok-390x844.jpg`

- **Posao ekrana:** pratiti turu. **Da.**
- **UI:** dnevnik „Test Salon 10 · Zainteresovan · [📅]", „Test Salon 2 · Nije se javio · [📅]"; čipovi „2 poziva", „2 zaredom"; traka 2/4. Čisto.
- **UX:**
  - **[P1]** Dnevnik ne upozorava da „Zainteresovan" nema korak.
  - **[P2]** Kraj ture („Tura je završena") ne traži korake za pozitivne ishode pre izlaska.
- **Nema smisla:** Dnevnik slavi „Zainteresovan" zelenim čipom kao uspeh, a baš ta firma je ostala bez ijednog koraka i nije ni u jednom redu.
- **Ciljni kanvas:** red u dnevniku sa crvenim „bez koraka" i taster „K" za korak poslednje firme. Kraj ture: „2 zainteresovana bez koraka → [Postavi korake]".

### Uvoz — `/leadovi/uvoz` — snimci: `bx-uvoz-1536x695.jpg`, `bx-uvoz-390x844.jpg`

- **Posao ekrana:** ubaciti tabelu u bazu bez duplikata. **Delimično.**
- **UI:**
  - **[P2] Dva fokusa:** fokus kartica „3 uvoza čekaju pregled duže od 24 h" (tri „Nastavi pregled", prvo puno, i „Odustani" ×3 + „Odustani od svih starijih od 30 dana (1)") i desno „ČISTOĆA UVOZA 82 %" sa „Reši preostale (41)".
  - Zona za fajl je ispod preloma (y 518+).
- **UX:**
  - **[P1] Nema povezivanja kolona.** Zaglavlje se prepoznaje po fiksnoj listi (`convex/lib/leadImportParse.ts` r. 582–591: „telefon/tel/phone/mobilni/fiksni/kontakttelefon"). „Broj telefona", „Mob." i „Telefon 1" ne ulaze; ostaje samo upozorenje „Kolona … nije prepoznata i nije uvezena". → Korak „Poveži kolone" kad nešto nije prepoznato: padajući izbor po koloni, pamti se po imenu kolone.
  - **[P2] Limit od 500 redova**, uz poruku „Podelite tabelu na manje segmente" (ručno, „vi").
  - **[P2] Broj na dugmetu ne odgovara tekstu.** „Reši preostale (41)" stoji uz „78 redova čeka odluku u 6 uvoza", a 41 su samo redovi prvog uvoza.
  - **[P3]** „Red sa zaglavljem: Red 1 (indeks: 0)", „staging", „parser".
- **Nema smisla:**
  - Na dugmetu je „(41)", a tekst odmah do njega kaže „78 redova čeka".
  - „Čistoća uvoza 82 %" je objašnjena negacijom: „374 od 452 učitanih redova nema otvorenu odluku".
  - Uvozi stari 34 dana su predstavljeni kao „čekaju duže od 24 h".
- **Ciljni kanvas:**
```
┌ Uvoz leadova   [Novi uvoz] [Istorija]                          Čistoća 82 % ███████░ ┐
│ ┌ 3 uvoza čekaju: test-tabela-1 (34 d, 60) [Nastavi] · -2 (8 d) · -3 (7 d)  [Odustani >30 d] ┐
│ ┌ Prevuci Excel/CSV ─────────────────────────────────────────────── [Izaberi fajl] ┐   │
│ └ posle čitanja: „Prepoznato 9/11 kolona — poveži: Broj telefona → [Telefon ▾]"    ┘   │
```
  390: kartica čekanja + „Izaberi fajl". Čistoća u jednom redu.

### Uvoz — pregled — `/leadovi/uvoz?import=…` — snimci: `bx-uvoz-pregled-1536x695.jpg`, `bx-uvoz-pregled-390x844.jpg`

- **Posao ekrana:** odlučiti za svaki red šta postaje. **Teško.**
- **UI:**
  - **[P1] Tabela redova počinje ispod preloma (~y 865).** Pre nje su steper, čistoća, 2 upozorenja, „Šta je nastalo" i rezime.
  - 99 redova je bez stranica.
  - Redovi su obojeni celom širinom po temperaturi (crveno/žuto/plavo), protivno pravilu „nikad na redovima tabele".
  - 35× isto zeleno „Otvori u leadovima ↗" + „Detalji".
  - Nativni `<select>` temperature je u svakom redu.
  - Na telefonu tabela pokazuje samo „Temperatura | Akcije", bez imena firme.
- **UI [P2]:**
  - Rezime kaže „12 vrelo · 12 toplo · 13 hladno", a izbor u redu „Hot/Warm/Cold": dva jezika u istom kadru.
  - „Rešeno 58/99" u steperu i „Čistoća uvoza 58 / 99" ispod su isti broj.
  - „Učitano 102 reda · 3 sklonjeno · 2 preskočeno pri p…" je odsečeno.
- **UX:**
  - **[P1] Recept umesto radnje.** „41 red nije rešen … Otvori „Detalji" → jezičak „Trag" → „Promeni odluku", pa „Primeni preostale"". To je ~41 × 4 = 160+ klikova.
  - Nema grupnog rešavanja ni razloga u redu. Razlog postoji u kodu (zabrana nije mogla da se proveri, ili sukob polja: `leadImportStore.ts` 846–856), ali red piše samo „nerazrešeno · Red nije ušao u bazu.".
  - **[P1] Status laže:** „Status: Primenjen" stoji uz „Primeni preostale (2)" i „41 red nije rešen".
  - **[P2] Dva dugmeta za isti posao:** „Primeni preostale (2)" (primarno, gore desno) i „Reši preostale" (u upozorenju).
- **Nema smisla:**
  - „Status: Primenjen" uz „Primeni preostale (2)" i „41 red nije rešen".
  - Isti broj dvaput: „Rešeno 58/99" i „Čistoća 58 / 99".
  - Dva jezika za temperaturu: „12 vrelo" u rezimeu i „Hot" u redu.
  - „Klik na broj prikazuje baš te redove…" je uputstvo za čipove koji bi trebalo da izgledaju klikabilno.
- **Ciljni kanvas:**
```
┌ ← test-tabela-4.xlsx · 50 primenjeno · 41 čeka odluku · 2 čeka upis        [Primeni 2] ┐
│ „Moguć duplikat" 23   [Spoji sve sa predlogom] [Sve kao nove] [Pregledaj]             │
│ „Zabrana nije proverena" 18   [Proveri ponovo] [Preskoči sve]                          │
├───┬──────────────────┬──────────┬──────────────────────┬──────────────────────────────┤
│ # │ Firma · grad     │ ☎        │ Razlog               │ Odluka [Nova ▾] (u redu)      │ 36 px
```
  390: grupe razloga kao kartice sa grupnim dugmetom; tabela kao lista „ime · razlog · odluka ▾".

### Uvoz — istorija — snimci: `bx-uvoz-istorija-1536x695.jpg`, `bx-uvoz-istorija-390x844.jpg`

- **Posao ekrana:** šta je uvezeno i šta je ostalo. **Da.**
- **UI:**
  - **[P2]** Po 3 dugmeta u svakom redu (amber „Reši preostale (41)", „Pregled", crveni „Poništi"), ×6.
  - „Upozorenja parsera (3)" je amber dugme u ćeliji imena.
  - Na telefonu je tabela odsečena desno (Status „U pre…", radnje se ne vide), bez znaka da klizi.
- **UX:**
  - **[P2]** „Parsirano" i „Preskočeno / Nerazrešeno 2 / 41" su žargon i sabijeni podaci.
  - **[P2]** „Poništi" (briše firme iz uvoza) stoji odmah uz rutinski „Pregled".
- **Nema smisla:**
  - Kolona „Preskočeno / Nerazrešeno" spaja dva različita broja („2 / 41").
  - „Upozorenja parsera" stoje i na već primenjenom uvozu, gde više ništa ne mogu da promene.
- **Ciljni kanvas:** lista kartica `fajl · datum · 50 novih · 15 spojeno · 41 čeka · [Reši] ⋯ (Pregled, Poništi)`. 390: iste kartice.

### Uvoz — nerazrešeno — `/leadovi/uvoz?prikaz=nerazreseno` — snimci: `bx-uvoz-nereseno-1536x695.jpg`, `bx-uvoz-nereseno-390x844.jpg`

- **Posao ekrana:** samo redovi koji čekaju odluku. **Delimično.**
- **UI:** **[P2]** Filter „samo nerazrešeni (41)" je aktivan, a dugme „Reši preostale" u upozorenju je onemogućeno (sivo) i izgleda pokvareno. Svaki red ponavlja „nerazrešeno" + „Red nije ušao u bazu." (41×).
- **UX:** **[P1]** Isto kao pregled: nema razloga ni grupne radnje.
- **Nema smisla:** Filter „samo nerazrešeni" onemogućava jedino dugme koje rešava baš te redove.
- **Ciljni kanvas:** grupe po razlogu (gore) + lista sa izborom u redu. Onemogućeno dugme se uklanja.

## 6. Međumodulni nalazi

- **Kontrolna tabla duplira Leadove „Danas", sa drugim glagolima.**
  - Misije „Pozovi 3 firme iz Zovi sada" i „Reši 5 nerazrešenih redova".
  - „Šta me čeka": „3 upita sa sajta čekaju → Otvori upite", „3 zaostala koraka → **Zovi**". Leadovi za isti korak kažu „Otvori".
  - Nedeljni prstenovi Pozivi / Sastanci / Objave su na Kontrolnoj tabli, a fokus na Leadovima pokazuje samo pozive.

  → Leadovi „Danas" su jedini izvor za rad sa leadovima. Kontrolna tabla ima jednu liniju „Leadovi: 14 u redu · 2 sastanka · [Kreni]", a prstenovi dobijaju i „Ponude".
- **Dva „Danas" na telefonu.** U donjoj traci „Danas" je zvono („10"), a Leadovi imaju jezičak „Danas". → Zvono preimenovati u „Zadaci", ili jezičak u „Red".
- **Isti bedž, dva značenja.** U bočnoj traci „Leadovi 9" broji VRSTE posla (`nav-badge.tsx`: „broj VRSTA posla, ne zbir stavki"), a jezičci broje stavke. Zbog rupa u podacima bedž je praktično uvek crven, pa ga oko prestaje da čita. → Bedž broji samo ono što je danas na redu (red + sastanci bez ishoda + upiti).
- **Napredak nagrađuje radnje koje ekran krije.** XP pravila daju 40 XP za fazu „Poslata ponuda" i 250 za „Dobijen", a faza je na 3. nivou menija. Postoji misija „Zakaži sastanak", a nema misije za ponudu. Dostignuća „Ponuda poslata" i „Zatvarač" zavise od faze koja se retko menja (plan §1.3: „Nov" u 100 % redova na produkciji).
- **Gamifikacija na Leadovima je predozirana.** „+25 XP" stoji na svakoj kartici, „+190 XP danas" i niz su u fokusu, kartica nivoa u bočnoj traci, a u režimu XP toast posle svakog ishoda i „kombo". → Zadržati kombo i XP ture u režimu poziva i rezime na kraju ture; ukloniti XP čipove po kartici.
- **Dva doma za podešavanja.** „Podešavanja leadova" (Niše, Ocenjivanje) žive iza zupčanika na Leadovima, a postoji i globalno Podešavanja. Tekst tamo je inženjerski: „Težine žive u bazi da bi se kalibrisale bez novog deploy-a", „Kliknuo /r/ link", „ključ: frizerski-salon", „Ocena se pokreće iz skilla: /generate-leads oceni-sajtove" (`podesavanja-ocenjivanje.jpg`, `podesavanja-nise.jpg`). → Seli u Leadovi → Podaci, sa linkom iz globalnih podešavanja. CLI komande idu u oblačić „za tehničara".
- **Unakrsni projekti u zaglavlju profila.** „Odgovara projektu ScanMe" i ceo red „Kopiraj u ScanMe" stoje iznad fokusa. Sam višeprojektni sloj je van obima, ali ovo mesto nije. → Oznaka ide u „⋯" ili u desnu kolonu profila.
- **OpenReply i landing.** Signali „otvorio landing", „kliknuo na naš link" i „pitao za cenu" su jedini Intent, ali se vide samo kao broj u koloni koja je skoro uvek „—". → Svež signal (< 48 h) ide na vrh reda na Danas kao razlog: „otvorio ponudu pre 3 h".
- **Gde modul treba da živi.** Leadovi ostaju prvi posle Kontrolne table u „Radni sto". Jovanov glavni posao je ovde, pa je pitanje (§9) da li posle prijave treba da se otvara „Leadovi → Danas".

## 7. Persone

**Alex (napredan korisnik)**
- Ne može da izabere više redova ni u tabeli ni u uvozu. Faza, temperatura i korak se menjaju jedan po jedan.
- Sort po koloni važi samo za 25 redova.
- Za svaki korak kuca datum; nema „sutra 10h". Dijalog ishoda nema tastere 1–9.
- Danas nema prečica. Režim poziva ima P/1–4/N, ali nema taster za korak.
- 41 nerešen red uvoza je ~160 klikova.

**Sam (tastatura i čitač ekrana)**
- Dijalog ishoda ima 9 dugmadi `role="radio"` bez kretanja strelicama, pa je svako zasebna stanica Tab-a.
- Pomoć je u `title` oblačićima (hint na brojčanim čipovima, „Kad se sledeći put javljaš" na ikonici kalendara). Tastatura i čitač ih ne dobijaju pouzdano.
- Hitnost i temperatura dele boju ivice.
- Pinovi na mapi nose temperaturu samo bojom; tastaturom je zamena tabela.
- Dodirne mete su 26–33 px (B10 §7 nije urađeno).
- Plus: režim poziva najavljuje firmu kroz `aria-live`.

**„Jovan za stolom" (1536×695, desetak otvaranja dnevno)**
- Pri otvaranju prvo vidi „Kvalitet baze 50 %" i tri upita; prva firma za poziv je ispod preloma.
- „Pozovi" na laptopu je `tel:`. Windows pita kojom aplikacijom, a broj se prekucava na telefon jer nema „Kopiraj".
- Posle „Zainteresovan" nema koraka, pa nedelju dana kasnije ne zna koga je trebalo zvati.
- Tabela ima 2 reda i filtere od 253 px.
- Zaostali su crveni zauvek (urađeni koraci, zatvoreni poslovi).
- Utorak sledeće nedelje ne postoji u „Sastancima".
- Faza je na 3. nivou, a ponuda nema iznos.

**„Jovan na terenu" (telefon, jedna ruka)**
- „Danas" u donjoj traci nije „Danas" Leadova.
- Jezičci Leadova klize vodoravno; Rupe, Zaostali i Sastanci su van ekrana.
- Tabela i Mapa: prvi ekran su samo filteri (do y 715). Mapa je ispod preloma i nema „u blizini" ni navigaciju.
- Posle posete ga čeka dijalog sa `datetime-local`, uz čekiranje faze koje je podrazumevano isključeno.
- Beleška u proširenom redu se upisuje kao „dodir".
- U režimu poziva donja traka prekriva „Zakaži sastanak…".
- Dugmad su visoka ~32 px.

## 8. Veliki predlozi

1. **Kartica ishoda: ishod → korak → faza u jednom koraku.**
   - **Šta:** nova komponenta `components/app/leadovi/kartica-ishoda.tsx`, ista u režimu poziva, u fokusu na Danas, u panelu mape i u profilu.
     - Ishodi sa tasterima: 1 Nije tu / zovi kasnije · 2 Zainteresovan · 3 Traži ponudu · 4 Sastanak · 5 Ne zanima (razlog: preskupo / nema potrebe / konkurencija) · 6 Ne zovi više · ⋯ ostalo.
     - Posle ishoda je red rokova unapred izabran po ishodu: „Za 2 h / Sutra 10:00 / Za 2 radna dana / Ponedeljak 10:00 / Za 7 dana / 📅", ←/→ biraju.
     - Predlog faze je unapred čekiran (Zainteresovan → „U radu"; Sastanak → „Sastanak"; Traži ponudu → „Ponuda"; Ne zanima → „Izgubljen" sa razlogom = ishod; Ne zovi → „Izgubljen" + predlog zabrane).
     - Beleška je u fokusu. Enter čuva sve i ide na sledeću firmu.
     - Upis ide kroz POSTOJEĆE mutacije (`recordOutcome`, `logTouch`, `setNextAction`, `setStage`, `setMeeting`). Dodaje se `zavrsiKorak` (briše `nextActionAt`, upisuje događaj `sledeci_korak` bez `toValue`).
   - **Zašto:** danas je korak odvojen, pa se zaboravlja (§11.2), a faza se ne menja (plan §1.3: 100 % „Nov").
   - **Rizik:** pravilo iz `leadCrmStore.ts` „Faza se NIKADA ne menja automatski". Ovde je predlog čekiran, a čovek ga potvrđuje Enter-om; to je i dalje odluka čoveka (pitanje 3).
   - **Veličina:** M.
   - **Šta se gubi:** dijalozi „Zabeleži ishod", „Sledeći korak" i „Zabeleži dodir" ostaju kao „⋯" za ispravke unazad.

2. **Jedan red rada na Danas, a režim poziva ide kroz ceo red.**
   - **Šta:** red = upiti sa sajta → sastanci bez ishoda → dogovoreni pozivi za danas (i zakasneli) → svež signal namere → novi (Fit). Prikazuje se kao fokus kartica + kompaktna lista.
     - „Kreni redom" ulazi u režim poziva nad istim redom.
     - Desna kolona: „Ove nedelje" (pozivi / sastanci / ponude prema cilju) + Agenda.
     - „Nije se javio" automatski predlaže sledeći pokušaj (+1, +3, +7 radnih dana; posle 3 pokušaja „Odložen 60 dana").
     - Firme sa budućim korakom ne ulaze u „novi".
     - Red se računa na serveru nad svim kandidatima, ne nad prvih 50.
   - **Zašto:** sada povratni pozivi postoje samo kad zakasne, a režim zna samo prve pozive.
   - **Rizik:** nov upit za red (proširenje `listLeadsFiltered`/`listOverdue` ili novi `redDanas`).
   - **Veličina:** L.
   - **Šta se gubi i gde seli:** trake „Zovi sada / Vrati se na / Dopuni pa zovi" postaju filteri reda; „Dopuni pa zovi" seli u Podaci; Kvalitet baze seli u Podaci.

3. **„Tok" i ponuda kao objekat.**
   - **Šta:** nov jezičak sa kolonama po fazi: Nov → U kontaktu → Zainteresovan → Sastanak → Ponuda → Dobijen / Izgubljen.
     - Kartica: ime, dana u fazi, sledeći korak, ⚠ „stoji 9 dana".
     - Gore levak za 30 dana iz `leadStageEvents`: pozivi → razgovori → sastanci → ponude → dobijeno, sa procentima prelaza i „—" kad nema podataka.
     - `listByStage` već postoji i nije korišćen.
     - Ponuda dobija polja: iznos, datum slanja, važi do, napomena, link ili landing. To su `v.optional` polja na `leadAssignments` („OPCIONO NAMERNO") ili tabela `leadPonude` u `purgeMap`.
     - „Ponuda bez odgovora > 3 radna dana" ulazi u red na Danas.
   - **Zašto:** Jovanov posao je „do ponude", a modul nema nijedno mesto gde se ponude vide.
   - **Rizik:** promena šeme.
   - **Veličina:** L.
   - **Šta se gubi:** ništa. Faza i dalje postoji i u tabeli.

4. **Nova podela jezičaka: `Danas | Tok | Firme | Podaci`.**
   - **Šta:**
     - Firme = Tabela | Mapa kao prekidač, sa zajedničkim redom filtera.
     - Podaci = Rupe (dopuna redom), Kvalitet baze, Uvoz (i istorija), Niše, Ocenjivanje.
     - Zaostali i Sastanci prestaju da budu jezičci: postaju filteri reda i Agenda u Firme.
     - „Uvezi" ostaje kao dugme koje vodi u Podaci → Uvoz.
   - **Zašto:** danas su na jednoj traci izmešani lista zadataka, dva prikaza baze, tri liste koje dupliraju trake na Danas, održavanje podataka i podešavanja, a toka nema (§11.3).
   - **Rizik:** stari `?tab=` linkovi. Rešava se mapom preusmeravanja (`gaps` → Podaci, `overdue` → Danas sa filterom „Kasni", `meetings` → Firme/Agenda).
   - **Veličina:** M.

5. **Firme (Tabela) za rad, ne za pregled filtera.**
   - **Šta:**
     - jedan red filtera sa padajućim čipovima (Faza / Interes / Telefon / Sajt / Niša / Sledeći korak / + Još);
     - podrazumevano 36 px (13–14 redova iznad preloma);
     - sort na serveru i 50 redova po strani;
     - kolona za izbor + traka grupnih radnji (faza, interes, korak, zaduži, izvezi izabrane);
     - kolone: Firma (240 px) · Faza·interes · Sledeći korak · Poslednji kontakt · Telefon (nivo procene) · Zašto · ⋯.
     - Intent i Sajt idu u oblačić ili čip.
   - **Veličina:** M.
   - **Šta se gubi:** stalno otvorene grupe čipova; ostaju u „+ Još".

6. **Uvoz koji ne kažnjava.**
   - **Šta:**
     - korak „Poveži kolone" kad nešto nije prepoznato, sa pamćenjem po imenu kolone (bez nove zavisnosti);
     - nerešeni redovi grupisani po razlogu, sa grupnim odlukama i izborom u redu (bez dijaloga);
     - status „Primenjen delimično (41 čeka)";
     - bez obojenih redova;
     - limit od 500 redova rešiti deljenjem na serijske poslove, ne porukom korisniku.
   - **Veličina:** M.

7. **Ispravke integriteta podataka u petlji** (S, pojedinačno). Detalji i dokazi su u §11.1.
   - beleška ne postavlja `lastTouchAt`;
   - zabrana se nudi za `trazeno_da_se_ne_zove` (i opciono za `postojeci_klijent`);
   - upit pretvoren u firmu dobija zaduženje;
   - `listOverdue` isključuje Dobijen/Izgubljen/Odložen;
   - `setStage` u zatvorenu fazu briše korak;
   - red poziva isključuje firme sa budućim korakom;
   - za jednog korisnika automatsko zaduženje (32 nevidljive firme).

8. **Teren na telefonu.**
   - **Šta:**
     - Mapa je prvi prikaz Firmi na telefonu, preko celog ekrana.
     - „U blizini" koristi geolokaciju pregledača.
     - Na kartici je „Navigacija ↗" (URL Google mapa, bez zavisnosti).
     - List odozdo sa karticom ishoda.
     - Režim poziva i rad sa redom sakrivaju donju navigaciju.
     - Dugmad su ≥ 44 px.
   - **Veličina:** M.
   - **Rizik:** zavisi od odgovora na pitanje 6.

## 9. Pitanja za Jovana

1. **Kako fizički zoveš kad sediš za laptopom?**
   - (a) Broj čitam sa ekrana i biram na mobilnom.
   - (b) Phone Link / `tel:` na laptopu.
   - (c) Oba.

   *Preporuka:* ako je (a) ili (c), na desktopu „Pozovi" = veliki broj + „Kopiraj" + QR kôd za telefon, a `tel:` samo na telefonu. Ishod se beleži na laptopu.
2. **Šta je za tebe „ponuda"?**
   - (a) Samo faza.
   - (b) Faza + iznos + datum slanja + važi do + automatski podsetnik.
   - (c) Dokument ili landing koji aplikacija pravi.

   *Preporuka:* (b) sada, (c) kasnije.
3. **Sme li faza da prati ishod?** Predlog bi bio unapred čekiran i jedan Enter bi potvrđivao, uprkos pravilu „faza se nikad ne menja sama".
   - (a) Ne, samo ručno.
   - (b) Predlog unapred čekiran + poništi.
   - (c) Potpuno automatski.

   *Preporuka:* (b).
4. **Politika za „Nije se javio".**
   - (a) Ništa automatski.
   - (b) 3 pokušaja (+1 / +3 / +7 radnih dana), pa „Odložen 60 dana".
   - (c) Ručno svaki put.

   *Preporuka:* (b), sa izmenom u Podešavanjima.
5. **Temperatura (Hot/Warm/Cold).**
   - (a) Zadržati ručnu, prevedenu na „Interes: visok/srednji/nizak".
   - (b) Izvoditi je iz ishoda, uz ručnu izmenu.
   - (c) Ukinuti je i koristiti fazu i ishod.

   *Preporuka:* (b), sa srpskim nazivima.
6. **Da li obilaziš firme uživo** (mapa na telefonu je stvaran posao)?
   - (a) Da, redovno.
   - (b) Retko.
   - (c) Ne.

   *Preporuka:* ako je (a), predlog §8.8 ide pre §8.5; ako je (c), mapa ostaje pomoćni prikaz u Firme.
7. **Šta se otvara posle prijave?**
   - (a) Kontrolna tabla.
   - (b) Leadovi → Danas.

   *Preporuka:* (b) za Jovana; Kontrolna tabla ostaje jedan klik.
8. **XP na Leadovima.**
   - (a) Zadržati čip po kartici.
   - (b) Samo rezime ture i kombo u režimu poziva.
   - (c) Isključiti na Leadovima.

   *Preporuka:* (b).

## 10. Sitnice (P3)

- „mnogo recenzija" (tabela) naspram „visok broj recenzija" (svuda drugde).
- Natpisi mape: ćirilica na desktopu, engleski na telefonu.
- Obraćanje „vi" („biste dobili", „Podelite tabelu", „izaberite") usred „ti" teksta. „Otkaži" naspram „Odustani".
- „F 64 I —" na kartici tabele na telefonu je nečitko.
- „prikaži i prazne (7)" u filterima je nejasno; bolje „pokaži i one sa 0".
- „Red sa zaglavljem: Red 1 (indeks: 0)", „staging", „parser", „Parsirano".
- „(trackedLinkMissing)" i „Vrednost: llland_ux_test_000000001" u UI.
- Istorija: sirovi izvori (`landing_tracker`, `site_audit`, `google_maps`); „Promena vlasnika" bez „od → do".
- „google_maps (potvrđeno)" u zaglavlju profila → „Google mape · proveren".
- „Prikazano 1–25 od 178 u preseku" + „Strana 1 od 8 (po 25 leadova)": dva puta isto.
- „Učitano 102 reda · 3 sklonjeno · 2 preskočeno pri p…": odsečeno u steperu uvoza.
- „Popuni: Bez telefona" → „Dodaj broj telefona".
- Ikonica prečica tabele bez natpisa; spisak „?" je pomoć samo za tabelu.
- Fit prsten „64" + „64 / 100" ispod: broj dvaput.
- „Odložen" bez „do kada".
- Dobijen bez vrednosti, Izgubljen bez zatvorene liste razloga.
- „Kliknuo /r/ link", „zbir aktivnih težina 260", „ključ: frizerski-salon", „/generate-leads oceni-sajtove" u Podešavanjima leadova.
- Upit „+381 63 555 0101 · — · bez poruke": kad nema imena, naslov kartice je broj, a ispod stoji „—".
- Na telefonu je u dijalogu ishoda „Sačuvaj ishod" IZNAD „Odustani", a opcije su visoke 34 px.

## 11. Četiri pitanja iz zadatka

### 11.1 Životni ciklus: uvoz → prvi poziv → ishod → korak / povratni poziv → sastanak → ponuda → dobijen / izgubljen

| Korak | Gde u UI | Kod | Stanje | Gde puca |
|---|---|---|---|---|
| 1. Ulaz | Uvoz (xlsx/csv), „Upiti sa sajta → Napravi firmu", skill/API | `leadImportStore`, `leadInboundStore`, `lib/generateLeadsIngest` | radi | Firma iz upita nema `leadAssignments`, pa je nevidljiva u Tabeli, Mapi i redu (samo Rupe → „Bez vlasnika"). Uvoz nema povezivanje kolona („Broj telefona" ne ulazi), limit je 500 redova, a nerešeni redovi se rešavaju jedan po jedan kroz dijalog. |
| 2. Dopuna | Rupe, „Dopuni pa zovi", Kvalitet baze; procena broja i ocena sajta samo iz skilla (CLI) | `leadGapsStore`, `leadGapFillStore` | radi | Dopuna stoji na istom nivou kao prodaja; pet vrsta rupa ima istu težinu. |
| 3. Prvi poziv | Danas „Zovi sada", Režim poziva, `p` u tabeli | `use-zovi-sada.ts` (tel ≥ 40 %, nikad dodirnut, Fit ≥ prosek prvih 50 po vremenu unosa) | radi | Red sadrži samo prve pozive. Prag „Fit ≥ prosek" odseca pola. Firme bez Fit-a ispadaju. „Pozovi" na desktopu je `tel:`. |
| 4. Ishod | Režim 1–4, dijalog sa 9 ishoda, traka posle poziva | `recordOutcome`, `logTouch` | delimično | Dva pojma (dodir / ishod). Nema „zovi kasnije" ni „traži ponudu". „Tražio da ga ne zovemo" ne pokreće predlog zabrane: kôd je `trazeno_da_se_ne_zove`, a lista izraza traži `trazio_da_ga_ne_zovemo` (`leadCrmStore.ts` ~r. 588–600). Beleška se upisuje kao dodir. |
| 5. Sledeći korak | Ikonica 📅 u dnevniku režima, traka „Sledeći korak", „Još radnji → Izmeni sledeći korak…", `s` u tabeli | `setNextAction` | **puca** | Nije deo toka ishoda. `datetime-local` nema prečica. Nema „urađeno" / „obriši" (mutacija ne postoji). Korak je nevidljiv dok ne zakasni. |
| 6. Povratni poziv | „Vrati se na" (samo zakasneli), jezičak Zaostali | `listOverdue` (`nextActionAt < now`) | **puca** | Današnji koraci se ne vide pre roka. Zaostali se ne prazne posle poziva ni posle Dobijen/Izgubljen. Povratni pozivi nisu u režimu poziva. Kartica nudi „Otvori", ne „Pozovi". „Nije se javio" ne zakazuje ponovni pokušaj. |
| 7. Sastanak | „4" u režimu, „Zakaži sastanak" (profil, kartica, panel), Sastanci | `setMeeting`, `listMeetings`, `groupMeetings` | delimično | Faza „Sastanak" je podrazumevano isključena. Posle ove nedelje se sastanci ne vide. Ishod sastanka je lista ishoda poziva. Nema .ics. |
| 8. Ponuda | Faza „Poslata ponuda": „Još radnji → Faza ›" ili čip „Stanje" u tabeli | `setStage` | **nedostaje** | Ponuda nije objekat (iznos, datum, rok, dokument). Nema podsetnika „ponuda bez odgovora". Nema prikaza ponuda; jedino filter „Faze toka" u fioci. „Preporučena ponuda" u filterima je nešto drugo: tip usluge iz ocene sajta. |
| 9. Dobijen / Izgubljen | Isti meni + obavezno obrazloženje | `setStage` | delimično | Nema vrednosti posla. Razlog gubitka je slobodan tekst. Korak ostaje pa firma stoji u „Zaostalima". |
| 10. Pregled toka | — | `listByStage` postoji, ne koristi se nigde u UI | **nedostaje** | Nema levka, konverzije, procenta dobijenih, vremena u fazi ni prihoda. Samo Napredak broji XP za ponudu i dobijen posao. Kontrolna tabla ima prstenove Pozivi / Sastanci / Objave, ne ponude. |

Kratko: aplikacija dobro vodi od uvoza do PRVOG poziva. Posle prvog razgovora petlja puca: korak se ne traži, ne vidi se dok ne zakasne i ne može da se završi. Faza se ne menja, a ponuda i dobijen posao nemaju ni prikaz ni podatke. Dokaz da se tok ne održava u praksi: plan §1.3 je na produkciji izmerio da kolone Stanje („Nov · Nova firma") i Sledeći korak („Prvi poziv") imaju istu vrednost u 100 % redova.

### 11.2 Koliko radnji traje osnovna petlja („pozovi sledeću firmu, zabeleži ishod, postavi sledeći korak")

| Put | Radnje | Ukupno | Tastatura? |
|---|---|---|---|
| A. Režim poziva, prvi poziv → „Zainteresovan" → korak | klik „Započni režim poziva" (1) → `P` (1; na Windowsu dijalog `tel:`, realno prekucavanje broja na telefon) → `2` (1) → [sledeći korak se NE traži] → klik na ikonicu 📅 u dnevniku (1) → datum i vreme u `datetime-local` (~10–14 pritisaka ili 4–6 klikova u biraču) → beleška (opciono) → „Sačuvaj korak" (1) | ~17 radnji; korak 4 se lako preskoči, a faza ostaje „Nov" | delimično: P, 1–4, N, Esc da; za korak nema tastera |
| A'. Isto, ishod „Sastanak" | `4` → dijalog: datum (~12) + beleška + čekiranje „Prebaci fazu" (1, podrazumevano isključeno) + „Zakaži" (1) | ~16 | delimično |
| B. Kartica „Zovi sada" na Danas | „Pozovi" (1) → „Javio se" (1) → [kartica nestaje; kod, proveriti] → Tabela (1) → `/` + ime (~8) → Enter (profil) → „Zabeleži ishod" (1) → izbor (1) → „Sačuvaj ishod" (1) → „Još radnji" (1) → „Izmeni sledeći korak…" (1) → datum (~12) → „Sačuvaj korak" (1) | ~30 radnji, 2 promene ekrana | ne (Danas nema prečica) |
| C. Dogovoren povratni poziv („Vrati se na", kasni) | „Otvori" (1, nova strana) → „Pozovi" (1) → „Javio se" (1) → „Zabeleži ishod" (1) → izbor (1) → „Sačuvaj" (1) → „Sledeći korak" (1) → datum (~12) → „Sačuvaj" (1) → „Nazad na leadove" (1) | ~21 radnja, 2 učitavanja strane; bez novog datuma firma ostaje „Kasni" zauvek | ne |
| D. Tabela | `j/k` → `p` → traka „Javio se" (klik) → `i` (dijalog ishoda, 9 opcija, Tab) → `s` (dijalog, datum ~12) | ~20 | da, uz skriven spisak prečica |

**Idealna petlja** (kartica ishoda §8.1 + jedan red §8.2): `P` (kopiraj ili pozovi) → `2` (Zainteresovan) → Enter. Rok „za 2 radna dana 10:00" i faza „U radu" su unapred izabrani po ishodu, a beleška je u fokusu. Sledeća firma dolazi sama.
- To su 3 pritiska po pozivu bez beleške, 0 promena ekrana, i nijedan pozitivan ishod bez koraka.
- „Nije se javio" = `1` + Enter (sledeći pokušaj se zakazuje sam).
- „Sastanak" = `4`, pa datum iz brzih termina („Sutra 11h", „Čet 10h"), pa Enter.
- Cela tura po mišu: najviše 2 klika po firmi.

### 11.3 Da li su jezičci prava podela posla

Nisu. Na jednoj traci su četiri vrste stvari:
- predlog šta raditi (Danas);
- dva prikaza baze (Tabela, Mapa);
- tri liste koje dupliraju trake na Danas (Zaostali = „Vrati se na", Sastanci = deo „Vrati se na", Rupe = „Dopuni pa zovi");
- održavanje podataka (Rupe sa amber bedžom „39") iste težine kao prodaja.

Uz to su Uvoz i Podešavanja (Niše, Ocenjivanje) dugmad u istoj traci. Nedostaje jedino što posao „do ponude" traži: **tok po fazama**. Na telefonu traka klizi vodoravno, pa se tri jezička ni ne vide.

**Predlog:** `Danas | Tok | Firme | Podaci` (§8.4).

```
Danas   — jedan red (upiti → sastanci bez ishoda → dogovoreno danas/kasni → signal → novi),
          fokus kartica + kartica ishoda, desno Ove nedelje + Agenda          [bedž: broj u redu, crven samo ako kasni]
Tok     — kolone po fazi + levak 30 dana + ponude bez odgovora                [bedž: ponude bez odgovora]
Firme   — [Tabela | Mapa], jedan red filtera, sačuvani prikazi, grupne radnje, Agenda (svi sastanci)
Podaci  — Dopuna redom (telefon), Kvalitet baze, Uvoz + istorija, Niše, Ocenjivanje   [tačka, ne broj]
```
Ciljni kanvas za Danas je u §5 (Danas). Za Tok:
```
┌ Tok · 30 dana: 48 poziva → 11 razgovora → 4 sastanka → 2 ponude → 1 dobijen       [Lista|Kolone] ┐
│ Nov 120 │ U kontaktu 14 │ Zainteresovan 6 │ Sastanak 4 │ Ponuda 2 · 180.000 RSD │ Dobijen 1 │ Izg. 9 │
│ ┌────────┐ ┌──────────┐ ┌─────────────┐ ┌──────────┐ ┌─────────────────────┐ ┌────────┐        │
│ │TS1 0 d │ │TS2 · 3 d │ │TS10 · sutra │ │TS9 11:00 │ │TS3 · 120k · ⚠ 6 d   │ │TS6 ✓   │        │
```
390: Tok je lista po fazama (harmonika) sa brojem i ⚠, a Danas je jedna kartica sa palcem.

### 11.4 Pojmovi kvaliteta podataka: šta pomaže poslu, a šta je interni žargon

| Pojam | Gde se vidi | Pomaže poslu? | Presuda |
|---|---|---|---|
| **Kvalitet baze 50 %** (prosek 4 udela: telefon 81, procena broja 30, ocenjen sajt 0, niša 88) | Danas, gore desno, ista težina kao fokus | Za poziv ne; za održavanje da | Seli u Podaci. Na Danas se pojavljuje samo kad blokira red („Red je prazan: 39 firmi nema broj → Dopuni"). Rečenica „+25 % kad oceniš 94 sajta" je dobra, ali za ekran održavanja. |
| **Fit** (profil kupca, 0–100) | prsten na kartici, merač u tabeli, profil, kriterijum reda | Da, kao redosled | Zadržati za rangiranje reda. Broj se vidi u profilu i režimu, a „Zašto" čipovi nose razlog. Natpis na srpskom („Pogodnost") ili uz objašnjenje. Kriterijum „≥ prosek" ukinuti (§5 Danas). |
| **Intent** (namera) | merač u tabeli, prsten u profilu | Retko; na produkciji „—" u 100 % redova (plan §1.3) | Ukloniti kao kolonu i broj. Kad postoji, prikazati kao čip signala sa vremenom („otvorio ponudu pre 3 h") i podići firmu u redu. |
| **Procena telefona** („čiji je broj", %; filteri ≥ 40 / ≥ 70) | kolona Telefon, filteri, Kvalitet baze, prag reda | Da: broj vlasnika ili centrala menja razgovor | Tri nivoa rečima: „broj vlasnika", „verovatno vlasnik", „nepoznato"; procenat u oblačiću. Pragovi 40/70 ostaju u kodu, ne u natpisima. |
| **„u preseku"** | čip na Danas, Tabela, fioka filtera | Ne; to je interni pojam (firme sa zaduženjem) | Ukloniti reč. Pisati „178 firmi" i, dok postoji, „32 bez zaduženja [Zaduži]". Uzrok rešiti automatskim zaduženjem. |
| **Temperatura** Nova firma / Cold / Warm / Hot | čip „Stanje", `<select>` u profilu i uvozu, pinovi mape, ivica reda | Delimično (ručna procena interesa preklapa se sa ishodom i fazom) | „Interes: — / nizak / srednji / visok", izveden iz ishoda uz ručnu izmenu. Jedan jezik (danas Hot/Warm/Cold, a u uvozu vrelo/toplo/hladno). Ne deli ivicu sa hitnošću. „Nov · Nova firma" više ne postoji. |
| **„Rupe u podacima"** | jezičak sa bedžom 39, jezičak profila | Samo „bez telefona" pomaže pozivu | Preimenovati u „Dopuna", seliti u Podaci. „Bez vlasnika" nije rupa nego greška sistema. „Bez PIB-a" i „Bez kontakt osobe" su sekundarni. |
| **Dodir / ishod** | „Zabeleži dodir" / „Zabeleži ishod" | Ne kao dva pojma | Jedno „Zabeleži poziv / kontakt" sa ishodom; kanal je opcija. „Dodir" ostaje samo u kodu i za XP. |
| **Zaostali / Kasni / Vrati se na** | jezičak, traka, zvono | Da (hitnost) | Jedno ime: „Kasni" kao stanje u redu; „Dogovoreno" za buduće korake. |
| **Poreklo i izvori** („google_maps (potvrđeno)", „Uvoz", „Inbound", `landing_tracker`, `site_audit`) | zaglavlje profila, istorija | Pri pozivu ne | Seli u „Firma i poreklo"; prevesti izvore („Google mape", „ocena sajta", „praćenje landinga"); „Inbound" → „Upit sa sajta". |
| **Čistoća uvoza** | Uvoz | Da, za uvoz | Zadržati jedan broj (danas je isti broj dvaput: „Rešeno 58/99" i „Čistoća 58 / 99"). |
| **Signali / „Zašto"** | čipovi na karticama i u režimu | Da, najkorisniji pojam | Zadržati; ujednačiti natpise; svež signal ide na vrh reda. |
