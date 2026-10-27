# UI/UX ultra boost — revizija i plan

27. 10. 2026. · Jovan i Claude · izvor: Claude dokument „UI/UX ultra boost — revizija i plan“, izvezen bez crteža

> **Kako se koristi u runu:** ovo je ceo nalaz revizije i plan po oblastima. Run čita odluke i korake iz `docs/ULTRA-PLAN.md`; ovde su dokazi, ciljni kanvasi rečima i predlozi po ekranima. Detaljni izveštaji recenzenata (sa putanjama i redovima koda) su u `docs/ultra/revizija/`.


## Sažetak

Aplikacija je zanatski dobra, ali je organizovana po alatima, a ne po tvom poslu. Sve četiri oblasti imaju ocenu od 18 do 21 od 40, što je između lošeg i prihvatljivog. Najveći problem nije izgled: put od poziva do ponude puca posle prvog razgovora, brojevi se ne slažu od ekrana do ekrana, a status sistema kaže „sve radi“ kad ne radi. Revizija je rađena na 62 ekrana u 116 merenja, na tvom prikazu 1536×695 i na telefonu. Četiri nezavisna recenzenta pregledala su po jednu oblast, a peti je merio detektorom i axe proverom.

| Oblast | Ocena (Nielsen) | Najslabije |
| --- | --- | --- |
| Leadovi | 21 / 40 | doslednost |
| Tabla, ljuska, Napredak, Podešavanja | 21 / 40 | doslednost |
| Kanali | 20 / 40 | jezik i doslednost |
| Analitika i automatizacija | 18 / 40 | jezik, doslednost, sprečavanje grešaka |

### Pet najvećih UI problema

1. **Boja je svuda, pa ništa ne vodi.** U bočnoj traci je 12 obojenih pločica, primarno dugme menja boju po modulu (crveno na YouTube-u, sivo na Threads-u), a ekran ima prosečno 26 boja pozadine.
2. **Kartica je osnovni blok.** Tabela leadova pokazuje 2 reda na tvom ekranu, a tu su i kutija u kutiji i debele leve ivice.
3. **Pogrešne stvari su najkrupnije.** XP kartica zauzima pola prvog ekrana table, prihod je sitan tekst na drugom ekranu, a Analitika ima 10 pločica iste težine.
4. **Telefon.** 56 % dodirnih meta je manje od 44 px, gornja traka ima do 192 px, a tabele seku kolone.
5. **Sitan i nedosledan tekst.** Postoji 548 komada teksta od 10 i 11 px, mono font i za reči, četiri formata datuma i sirovi API nazivi.

### Pet najvećih UX problema

1. **Petlja prodaje puca** posle prvog razgovora: korak se ne traži i ne vidi, a ponuda ne postoji kao zapis.
2. **Brojevi se ne slažu i status laže:** četiri broja korisnika za isti period, pravila za oglase koja se sama upišu sa pragom koji niko nije izabrao, zelena tačka dok Instagram ne radi.
3. **Isti posao je na četiri do šest mesta:** razgovori, objave, merenje i automatika.
4. **Gamifikacija bira prioritet:** primarno dugme početnog ekrana nosi misiju, a ne najvredniji posao.
5. **Navigacija ima četiri modela:** period se gubi na prvom kliku, a ⌘K ne nalazi firmu po imenu ni broju.

### Najveća prilika

Režim poziva je već najbolji ekran u aplikaciji. Kad dobije karticu ishoda (rok i faza u istom koraku) i postane jedan red rada za ceo dan, Leadovi sami vode do ponude. Uz početni ekran „Danas“, aplikacija prelazi iz izveštaja u radni sto.

**Sledeći korak:** sve odluke su donete 27. oktobra i stoje u poslednjoj sekciji. Kad kažeš, pišem promptove za prvi noćni run (U1 do U3, istina i temelj).

## Globalni UI problemi

Sistem boja i komponenti je tehnički čist: nijedna boja nije upisana mimo tokena, a provera kontrasta tokena ne nalazi nijedan pad. U upotrebi, međutim, pravi buku. Boja modula je svuda, primarna radnja menja boju od modula do modula, kartica je osnovni gradivni blok, a tekst ispod 12 px i dugmad od 24 do 32 px stoje na svakom ekranu. Prethodni UI boost je rešio monotoniju bojom, i sad ima previše boje.

| Problem (šta se vidi, izmereno) | Predlog | Prioritet |
| --- | --- | --- |
| Boja modula je svuda: 12 obojenih pločica u bočnoj traci odjednom, boja modula na naslovu, broju u fokusu, grafikonu, dugmetu i sjaju. Ekran u proseku ima 11 boja teksta i 26 boja pozadine, a tabela leadova 20 boja teksta. Boje se sudaraju: zelena je i Leadovi i uspeh, cijan je i Tabla i informacija, narandžasta je i Oglasi i niz, crvena je i YouTube i opasnost. | Boja modula samo na aktivnoj stavci bočne trake i ikonici zaglavlja. Grafikoni u jednoj neutralnoj boji sa jednim akcentom. Brojevi beli. | P1 veliko |
| Primarno dugme menja boju po modulu: roze na Instagramu, crveno na YouTube-u (čita se kao „opasno“), ljubičasto u Analitici, sivo na Threads-u i u Podešavanjima (čita se kao „onemogućeno“). Varijanta „default“ izgleda kao primarna, a ne broji se kao primarna: 77 punih dugmadi bez te oznake. | Jedna boja primarne radnje u celoj aplikaciji. Boja modula kaže „gde si“, a ne „šta da klikneš“. „Default“ se ukida. | P1 veliko |
| Kartica je osnovni gradivni blok: kartice upita, firmi, rupa i misija, kutija u kutiji (27 na Podešavanjima, 5 na tabli) i leva ivica od 4 px na radnim karticama, iako DESIGN.md kaže „ivica je uvek 1 px“. Posledica su redovi od 80 px i dva reda tabele na ekranu. | Liste i tabele sa redovima od 36 do 40 px. Kartica samo za ono što se pomera, na primer sledeću firmu. | P1 veliko |
| Dodirne mete na telefonu: 1.095 od 1.946 meta (56 %) je manje od 44 px. „Pozovi“ je 72×28 px, „Zabeleži ishod“ 119×28, „Podešavanja leadova“ 36×28. Uzrok: 474 od 536 dugmadi su male veličine, a pravilo od 44 px nije deo osnovnog dugmeta. | 44 px u osnovu dugmeta kad je uređaj na dodir. Jedna izmena pokriva većinu. | P1 veliko |
| Telefon: lepljiva gornja traka je visoka 147 do 192 px jer se birač perioda prelama u 2 do 3 reda, pa sa donjom trakom zauzima do 29,5 % ekrana. Tabele se seku bez znaka da klize. | Gornja traka u jednom redu. Na telefonu liste umesto širokih tabela. | P1 veliko |
| Tekst ispod 12 px postoji na svih 116 merenja: 548 komada teksta od 10 i 11 px na tvom ekranu, plus tekst od 7 px na grafikonima na telefonu. Izvor su 88 klasa od 9 do 11 px u 28 fajlova i 14 osa grafikona. Isti bedž broja od 10 px kopiran je na 5 mesta. | Skala 12 / 13 / 15 / 20 / 28 bez izuzetaka, uz proveru koda koja pada na sitnije. | P2 smeta |
| Kontrast: 251 pad u 28 merenja (najgore tabela leadova, 27). Prigušen tekst sa providnošću ima 2,77 do 3,69:1, a prigušen tekst na obojenim podlogama 4,33:1. Provera u repou kaže 0 padova jer meri parove boja, ne ono što je stvarno nacrtano. | Bez providnosti na tekstu. Provera kontrasta dobija i parove sa podlogama stanja. | P2 smeta |
| Mono font i za reči, ne samo za brojeve: „za 24 h“, „evidentirano 30.09.2026. 17:41“, „Vremenska zona propertija“. Na Windowsu je to Consolas, pa ekran deluje kao terminal. | Mono samo za cifre u tabelama i za ID. Brojevi u fokusu u Aeonik-u, sa tabularnim ciframa ako ih font ima. | P2 smeta |
| Strane su duge: Podešavanja 6,8 ekrana (10,5 na telefonu), pregled uvoza 8,9, Threads 5,5, YouTube 4,9, Facebook 4,5. Na 19 ekrana nema primarne radnje u prvom ekranu; na Novoj kampanji je na 816 px, na Threads objavi na 1.458 px. | Fokus i radnja iznad preloma, provereno merenjem visine, ne samo brojem dugmadi. | P2 smeta |
| Nedoslednosti sitnog zrna: 39 nativnih padajućih menija pored prilagođenih, četiri formata datuma, tri zapisa trajanja, „53,8%“ bez razmaka, Title Case naslovi. | Jedan meni za izbor, jedan format datuma, broja i trajanja za celu aplikaciju. | P3 sitnica |

**Šta valja globalno:** disciplina tokena, tamna tema izvedena bez sjaja koji smeta, lucide ikonice svuda, pokret uzdržan, i poštenje prema podatku („—“ sa razlogom umesto izmišljene nule).

## Globalni UX problemi

Aplikacija je organizovana po alatima i kanalima, a ne po poslovima. Isti posao (odgovoriti ljudima, objaviti, izmeriti, automatizovati) živi na četiri do šest mesta. Isti broj ima različitu vrednost na različitim ekranima. A ono što ti stvarno radiš, put od poziva do ponude, puca na ključnom mestu.

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Glavna petlja prodaje puca posle prvog razgovora: korak se ne traži, povratni poziv se ne vidi dok ne zakasni, a ponuda ne postoji kao zapis. | Kartica ishoda, jedan red rada na Danas i Tok sa ponudom (vidi Leadovi). | P0 blokira |
| Arhitektura po alatima. Razgovori su na 6 mesta, objavljivanje u 4 kompozera bez kalendara, merenje na tabli, 7 strana Analitike, Atribuciji, pregledu svakog kanala i u Oglasima, a automatizacija na 5 mesta. | Arhitektura po poslovima: Danas, Prodaja, Zajednica, Objave, Rezultati, Automatizacije (vidi predlog arhitekture). | P1 veliko |
| Brojevi se ne slažu: četiri različita broja korisnika za isti period, DM 382 i 404 na istom ekranu, ishod sa šest imena, novac iz dva izvora, valuta pravila upisana u kodu umesto da se čita iz naloga, „Pregledi profila 0“ kad podatka nema. | Sloj mera: jedan rečnik mera (ime, definicija, format, smer, izvor, period). Zbirovi za ceo period, periodi se ne mešaju. | P1 veliko |
| Stanje sistema se protivreči: zelena tačka dok Instagram ne radi 3 dana, „Povezan ✓“ na kanalu za istekao token, „8/8 aktivno“ u Podešavanjima, a kompozer traži ponovno povezivanje i kad je sve u redu. | Jedan izveden status po vezi, koji čitaju svi ekrani. | P1 veliko |
| Prioritet posla bira gamifikacija: primarno dugme početnog ekrana nosi misiju, a ne najvredniji posao. | Napredak nikad ne nosi primarno dugme („Tih napredak“). | P1 veliko |
| Navigacija: četiri modela druge ravni, period koji se ne prenosi, „Danas“ sa tri značenja i isto mesto pod dva imena. | Jedno pravilo navigacije, period koji se pamti, jedno ime po stvari. | P1 veliko |
| Jezik: sirovi API nazivi (TEXT\_POST, ADDED\_PHOTOS, OAuthException 190, FOURTEEN\_MONTHS, page\_view), engleski marketing (Reach, CTR, ROAS, Hook Rate, Lookalike, Organic Search), interna oznaka plana („Dodatak A.2“), imena promenljivih okruženja, mešanje „ti“ i „vi“ i žargon („u preseku“, „dodir“, „kapije“, „Mozak“). | Jedan rečnik za ceo UI (srpski naziv, akronim u oblačiću) i provera koda koja pada na sirov naziv. | P1 veliko |
| Efikasnost: ⌘K ne traži firme, tabele nemaju izbor više redova ni grupne radnje, Danas nema prečice, sort radi samo po strani. | Firme u ⌘K, grupne radnje, prečice na Danas, sort na serveru. | P1 veliko |
| Pomoć je pisana za programera i stoji na ekranu stalno (fusnote koje objašnjavaju greške, kartica „Šta panel ne radi i zašto“). Objašnjenja u oblačićima na prelaz miša ne rade na dodir. | Pomoć u „i“, ljudskim jezikom. Tehničko samo u Podešavanjima. | P2 smeta |
| Telefon kao drugi posao nije osmišljen: na terenu su prvi ekrani filteri i birač perioda, režim poziva nema mesto u donjoj traci, mapa nema „U blizini“. | Teren: kartica sledeće firme, „Pozovi“ u zoni palca, „U blizini“ i navigacija. | P2 smeta |

**Šta valja globalno:** režim poziva, „Šta me čeka“ kao jedan izvor posla, prazna stanja kao misije sa jednim korakom, ⌘K kao radni alat i tastatura u tabeli.

## Kontrolna tabla

Tabla danas radi pet poslova odjednom: igru, listu posla, izveštaj kanala, GA4 grafikon i status veza. Zato se gubi ono najvažnije: tri hitna upita sa sajta stoje ispod misija za XP, a prihod od 12.480 € je mali broj tek na drugom ekranu. Strana je visoka 2.006 px na tvom ekranu (tri ekrana) i 3.554 px na telefonu.

**Posao ekrana:** za tri sekunde reći šta danas mora da se uradi, kako stoji posao (novac, upiti, ponude) i da li nešto ne radi. **Sada:** delimično. Sve postoji, ali nije poređano po važnosti.

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Devet blokova naslaganih jedan ispod drugog, svaki svojim stilom: HUD sa sjajem, kartice misija, lista, 4 KPI kartice, „Poslovanje“ bez kartica, traka od 8 čipova, grafikon, drugi red KPI bez kartica, „Šta radi“ kao kutija u kutiji u kutiji. | Tri zone istog obrasca: Danas (rad), Posao (novac i prodaja), Kanali (zdravlje i trend). Jedan oblik broja na celoj tabli. | P1 veliko |
| Najjače nacrtane stvari su nagrade: plava HUD kartica sa sjajem, pet zlatnih XP čipova, zlatne trake već završenih misija. „Hitno“ je sitan crveni tekst. | Zlato samo u trenutku nagrade. Završene misije se skupe u jedan red. Najveću težinu dobija ono što je hitno. | P1 veliko |
| Brojevi koje vlasnik najviše gleda (prihod 12.480 €, 7 otvorenih ponuda, 18 upita) su sitan tekst u golom redu, tek na drugom ekranu, ispod Instagram dosega. | Red „Posao“ odmah ispod liste Danas: veliki brojevi (28 px) i poređenje sa prošlim mesecom. | P1 veliko |
| Desetak boja na jednom ekranu (ljubičasta, roze, indigo, zelena, cijan, zlatna, narandžasta, crvena). Zelena dugmad „Otvori upite“ stoje na crvenim redovima „Hitno“. | Na tabli boja modula samo na maloj ikonici. Dugmad u listi neutralna; crvena samo za stanje. | P2 smeta |
| Dva reda KPI različitog izgleda (kartice sa linijom i goli brojevi), a Sesije su prikazane dvaput: kao pločica i kao veliki grafikon. | Jedan red kanala. Svaka pločica: broj, promena prema prethodnom periodu, mala linija trenda. | P2 smeta |
| Tehnička greška crvenim mono fontom: „Token je istekao (OAuthException 190)“. | Ljudska poruka sa dugmetom: „Instagram je odjavljen pre 3 dana · Poveži ponovo“. | P2 smeta |
| Pre sadržaja ide oko 130 px zaglavlja: putanja „Kontrolna tabla“ ponavlja naslov, pa podnaslov i ikonica info. | Na tabli bez naslova strane: pozdrav i datum u jednom redu. | P3 sitnica |
| Na telefonu prvi ekran zauzimaju HUD i misije, a posao počinje tek na drugom. | Na telefonu prvo „Danas“ (3 do 5 stavki), sve ostalo sklopljeno. | P1 veliko |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Dva sistema zadataka se takmiče: „Misije dana“ i „Šta me čeka“. Jedino primarno dugme na ekranu je „Odgovori“ na komentare (+30 XP), a tri upita sa sajta (novac) imaju sekundarno dugme ispod njega. | Jedna lista „Danas“, poređana po vrednosti: upiti, zaostali koraci, pozivi, komentari. Misija postaje oznaka na stavci, ne poseban blok. | P1 veliko |
| Misije se biraju i zamrzavaju pri prvom otvaranju dana, a lista posla je živa. Misija „Odgovori na 3 komentara“ broji samo odgovore iz aplikacije: odgovor iz Instagram aplikacije je ne zatvara, pa ostaje primarno dugme ceo dan. | Primarno dugme uvek nosi prvu stavku liste „Danas“. Misije postaju „plan dana“ iz iste liste, uživo. | P1 veliko |
| Kad je misija poziva gotova, na tabli nema dugmeta za pozive. Za pozive postoje tri dnevna cilja u isto vreme: misija od 3 („Završeno“), tempo 3/5 na Leadovima i nedeljni prsten 6/25. | Stalan red „Pozivi danas 3/5 · Nastavi pozive“ i jedan dnevni cilj. | P1 veliko |
| Birač perioda (7, 28, 90 d) u gornjoj traci menja samo deo ekrana. KPI su 28 dana, Poslovanje 7 dana i „ovaj mesec“ uz „za 24 h“, misije danas, krugovi nedelja bez oznake. Izabran period se ne prenosi: 7 d na tabli, klik na pločicu, i modul je opet na 28 d. | Svaka zona piše svoj okvir u naslovu: „Danas“, „Ovaj mesec“, „Poslednjih 28 dana“. Birač perioda samo u zoni Kanali, a izbor se pamti. | P1 veliko |
| Brojevi posla (prihod, ponude, upiti) porede se samo sa juče („za 24 h“), ne sa prošlim mesecom. Poređenje sa prethodnim periodom imaju samo KPI kanala. | Prihod, ponude i upiti se porede sa istim delom prošlog meseca; „za 24 h“ ostaje kao sitan dodatak. | P1 veliko |
| Gornja traka pokazuje zelenu tačku, a Instagram ne radi 3 dana. Greška stoji na dnu strane, na oko 1.950 px. | Traka upozorenja na vrhu table, samo kad nešto ne radi, sa jednom radnjom. Tačka u gornjoj traci prati najgore stanje. | P1 veliko |
| „Instagram doseg 17.124“ sa grafikom, a ispod „Top Instagram objava po dosegu: Nema sinhronizovanih objava“. | Ili oba ili nijedno. Prazno stanje kaže zašto (veza istekla) i šta da uradiš. | P2 smeta |
| Traka „Prikaži na grafikonu“ sa 8 GA4 metrika (Angažovane sesije, Stopa angažovanja, Ključni događaji…) na početnom ekranu. | Tabla pokazuje jednu metriku sajta (upiti). Izbor metrika živi u Analitici. | P2 smeta |
| „Leadovi bez poziva 178 od 178“ stoji među KPI kanala, a to je red posla. | Seli u Danas: „178 firmi čeka prvi poziv · Zovi sledeću“. | P2 smeta |
| Krugovi „Pozivi 6 od 25“, „Sastanci 1 od 3“, „Objave 0 od 2“ nemaju period ni objašnjenje odakle cilj. | Natpis „ove nedelje“ i objašnjenje cilja na klik, ili krugovi idu u Napredak. | P2 smeta |
| Na tabli projekta Enigma IT stoji misija drugog projekta: „Reši 5 nerazrešenih redova · ScanMe“, i to bez dugmeta. | Na tabli projekta samo posao tog projekta. Misije preko svih projekata žive u Napretku. | P2 smeta |

### Šta nema smisla

- Najvidljivija radnja na tabli je odgovor na komentare zbog 30 XP, dok upiti sa sajta čekaju ceo dan.
- „Sve radi“ (zelena tačka gore) i „Instagram ne radi 3 dana“ (crveno dole) na istom ekranu.
- Doseg od 17.124, a „nema objava“.
- Birač perioda koji ne menja pola ekrana.
- Isti broj (Sesije) dvaput, a prihod nijednom krupno.
- Red posla („Leadovi bez poziva“) usred izveštaja kanala.
- Prazno stanje kaže „Danas nema misija“, a odmah ispod stoje dve stavke „Hitno“.
- Tri dnevna cilja za pozive na istom ekranu: misija „Završeno“, tempo 3/5 i nedeljni prsten 6/25.
- Ispod preloma tabla je kopija četiri modula (Analitika, Instagram, OpenReply, Atribucija), ukupno 2,9 visine ekrana.

### Ciljni kanvas

*[crtež u Claude dokumentu: ciljni kanvas Kontrolne table · predlog, brojevi iz sintetičkih podataka]*

Iznad preloma ostaju samo dve stvari: šta danas treba uraditi i kako stoji novac. Kanali dolaze odmah ispod, sa jednim biračem perioda koji važi samo za njih.

## Leadovi

Leadovi dobro vode od uvoza do prvog poziva, a posle prvog razgovora petlja puca. Sledeći korak se ne traži, ne vidi se dok ne zakasni i ne može da se završi. Ponuda i dobijen posao nemaju ni prikaz ni podatke. Režim poziva je najbolji ekran u celoj aplikaciji i treba da postane podrazumevan način rada. Ocena je 21 od 40.

**Posao ekrana:** reći koga sada zvati, pustiti te da to odmah uradiš i voditi svaku firmu od prvog poziva do ponude. **Sada:** do prvog poziva da, posle njega ne. Dokaz iz produkcije: kolone „Stanje“ i „Sledeći korak“ imale su istu vrednost u 100 % redova (merenje iz prethodnog UI plana).

### Gde puca put do ponude

| Korak | Stanje | Gde puca |
| --- | --- | --- |
| Ulaz (uvoz, upit sa sajta) | radi | Firma napravljena iz upita po kodu nema zaduženje, pa je nevidljiva u Tabeli, na Mapi i u redu poziva (proveriti na produkciji). Uvoz ne povezuje kolone, pa kolona „Broj telefona“ ne ulazi. |
| Prvi poziv | radi | Red sadrži samo prve pozive. Uslov „pogodnost iznad proseka“ uvek odseče oko polovine firmi. |
| Ishod | delimično | Nema „zovi kasnije“ ni „traži ponudu“. „Tražio da ga ne zovemo“ ne nudi zabranu kontakta. |
| Sledeći korak | puca | Ne traži se posle ishoda, ne vidi se dok ne zakasni i ne može da se označi kao urađen. |
| Povratni poziv | puca | „Nije se javio“ ne zakazuje novi pokušaj. Zaostali ostaju crveni zauvek, čak i posle Dobijen i Izgubljen. |
| Sastanak | delimično | Faza „Sastanak“ je podrazumevano isključena. Sastanci posle ove nedelje se ne vide. Ishod sastanka koristi ishode poziva. |
| Ponuda | nedostaje | Samo faza, na trećem nivou menija. Nema iznosa, datuma slanja, roka ni podsetnika. |
| Dobijen i Izgubljen | delimično | Nema vrednosti posla, a razlog gubitka je slobodan tekst. |
| Pregled toka | nedostaje | Nema levka, konverzije ni procenta dobijenih poslova. Upit za faze postoji u kodu, ali ga UI ne koristi. |

Osnovna petlja (pozovi, zabeleži ishod, postavi sledeći korak) danas traži 17 do 30 radnji i dve promene ekrana. Cilj su tri pritiska: P, 2, Enter.

*[crtež u Claude dokumentu: put od prvog poziva do ponude · danas i posle predloga]*

Danas se petlja kida na koraku posle ishoda. Predlog je zatvara u četiri dela: ispravke podataka, kartica ishoda, jedan red rada i tok sa ponudom.

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Danas ima dva fokusa iste težine: traku „Danas 3/5 poziva“ i „Kvalitet baze 50 %“. Pre posla stoje 6 brojčanih čipova i 3 kartice upita, pa red poziva počinje na 620 px. | Sledeća firma kao fokus kartica, iznad 460 px. Kvalitet baze seli u Podatke. | P1 veliko |
| Tabela: na tvom ekranu se vide 2 reda. Filteri od 253 px su uvek otvoreni, a redovi su visoki 80 px jer je „Udobno“ podrazumevano. | Jedan red filtera i redovi od 36 px, što daje 13 do 14 redova iznad preloma. | P1 veliko |
| Uvek vidljivi filteri su filteri kvaliteta podataka (sajt, telefon, niša). Prodajni filteri (faza, interes, poslednji kontakt) su sakriveni u fioci. | U glavni red idu Faza, Sledeći korak i Poslednji kontakt. | P1 veliko |
| Konstantne kolone: „Intent —“ u 21 od 25 redova, „Nov · Nova firma“ i „Prvi poziv“ u svakom redu. | Kolona se prikazuje samo kad ima šta da kaže. Faza i korak postaju živi kad prođe kartica ishoda. | P2 smeta |
| Profil: zaglavlje je visoko 342 px (3 oznake porekla, 6 činjenica, prstenovi Fit i Intent, red „Kopiraj u ScanMe“ iznad fokusa). Broj telefona se ne vidi u zaglavlju. | Zaglavlje u dva reda: ime, faza i interes kao meniji. Poreklo, ScanMe i prstenovi idu niže. | P1 veliko |
| Mapa: iznad preloma je samo 228 px mape, jer i ovde stoje filteri od 253 px. Nazivi na mapi su ćirilicom na desktopu, a engleski na telefonu. | Jedan red filtera i mapa od oko 540 px sa panelom firme desno. Nazivi latinicom. | P1 veliko |
| Leva ivica kartice nosi dva značenja: crveno je i „kasni“ i „Hot“, žuto je i „sastanak uskoro“ i „Warm“. Na strani je 12 zelenkastih dugmadi iste težine, a „+25 XP“ stoji na svakoj kartici. | Ivica samo za hitnost, interes kao čip sa rečju. Jedna radnja po redu. XP samo na kraju ture. | P2 smeta |
| Uvoz: tabela redova počinje na oko 865 px. Redovi su obojeni celom širinom po temperaturi. Isti broj stoji dvaput („Rešeno 58/99“ i „Čistoća 58/99“). | Zaglavlje u jednom redu, grupe po razlogu, pa tabela. Bez bojenja redova. | P2 smeta |
| Telefon: na Tabeli i Mapi prvi ekran su samo filteri. Dugmad su visoka 26 do 33 px. Jezičci klize vodoravno, pa se Rupe, Zaostali i Sastanci ne vide. | Prvi ekran je kartica sledeće firme sa „Pozovi“ od 56 px u zoni palca. Četiri jezička bez klizanja. | P1 veliko |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Posle „Zainteresovan“ u režimu poziva odmah dolazi sledeća firma, a korak se ne traži. Firma je dodirnuta, pa ispada iz „Zovi sada“, a nema korak, pa nije ni u „Vrati se na“. Ostaje van svakog reda. | Kartica ishoda: posle ishoda je rok unapred izabran, Enter čuva i ide dalje. | P0 blokira |
| Korak se ne vidi dok ne zakasni (Danas čita samo zakasnele) i ne može da se završi, jer radnja „urađeno“ ne postoji. Zatvoreni poslovi ostaju među zaostalima. | Danas prikazuje i današnje dogovore. Nova radnja „Korak urađen“. Dobijen i Izgubljen brišu korak. | P0 blokira |
| Nema puta do ponude: faza je na trećem nivou menija, nikad se ne menja sama, ponuda nije zapis, a toka po fazama nema. | Jezičak „Tok“ i ponuda sa iznosom, datumom, rokom i podsetnikom. | P1 veliko |
| Ishod „Tražio da ga ne zovemo“ ne nudi zabranu kontakta, jer se kod ishoda ne poklapa sa listom izraza koja tu zabranu pokreće. To je pravni rizik (ZZPL). | Ispraviti kod ishoda; zabrana se nudi uvek za ovaj ishod. | P1 veliko |
| Greške podataka u petlji. Beleška se upisuje kao kontakt, pa firma ispada iz reda poziva. Firma iz upita po kodu nema zaduženje; u sintetičkim podacima 32 od 210 firmi zato nisu u Tabeli. | Beleška ne dira „poslednji kontakt“. Svaka firma dobija zaduženje automatski. | P1 veliko |
| „Nije se javio“ ne zakazuje novi pokušaj i vraća firmu na vrh sledeće ture. Nema brojača pokušaja. | Sam predloži sledeći pokušaj (+1, +3, +7 radnih dana), a posle trećeg „Odložen 60 dana“. | P1 veliko |
| Tri broja za isto pitanje „koga zvati“: „Danas 3/5“, „Zovi sada 40“ i „4 firme u redu“. Red uzima prvih 50 firmi po vremenu unosa, pa najbolje mogu da ostanu van njega. | Jedan red, rangiran na serveru nad svim firmama. Isti broj svuda. | P1 veliko |
| Sort tabele važi samo za tekuću stranu od 25 redova, i to nigde ne piše. Nema izbora više redova ni grupnih radnji. | Sort na serveru, 50 redova po strani, izbor redova i traka grupnih radnji. | P1 veliko |
| Najtopliji leadovi (upiti sa sajta) nude „Napravi firmu“ umesto „Pozovi“, iako je broj na kartici. Dogovoren povratni poziv nudi „Otvori“ umesto „Pozovi“. | „Pozovi“ kao glavna radnja svuda gde postoji broj. | P1 veliko |
| Sastanci posle ove nedelje ne postoje nigde u aplikaciji. Ishod sastanka koristi listu ishoda poziva („Nije se javio“). Nema dodavanja u kalendar. | Agenda bez granice nedelje, ishodi sastanka (traži ponudu, dogovoren posao, razmisliće), .ics fajl. | P1 veliko |
| Uvoz: kolone se ne mogu povezati ručno. 41 nerešen red se rešava jedan po jedan, oko 160 klikova. Status piše „Primenjen“ uz 41 nerešen red. | Korak „Poveži kolone“, grupno rešavanje po razlogu, status „Primenjen delimično“. | P1 veliko |
| Mapa nema rad po lokaciji: nema „U blizini“ ni navigacije. Jedina posebna radnja je animacija „Preleti hot firme“. | „U blizini“, „Navigacija“ ka Google mapama i kartica ishoda u panelu. | P2 smeta |
| „Pozovi“ na laptopu otvara tel: link, pa Windows pita kojom aplikacijom. Nema „Kopiraj broj“. | Na desktopu veliki broj, „Kopiraj“ i QR kod za telefon. | P2 smeta |
| Žargon i dva jezika: „u preseku“, Fit i Intent, Hot/Warm/Cold pored vrelo/toplo/hladno, „dodir“ pored „ishod“, „vlasnik“ u tri značenja, google\_maps, landing\_tracker, trackedLinkMissing. | Jedan rečnik: Pogodnost, Interes (nizak, srednji, visok), Zabeleži poziv, Zadužen. | P2 smeta |

### Šta nema smisla

- Ista firma stoji i u „Zovi sada“ (nikad dodirnuta) i u „Vrati se na“ (kasni korak), pa se zove pre dogovorenog vremena.
- Dnevnik ture slavi „Zainteresovan“ zelenim čipom, a baš ta firma ostaje bez koraka i van svakog reda.
- „Kombo 2 zaredom“ se računa i za „Nije se javio“. Meri brzinu klikanja, ne ishode.
- Zaostali su crveni zauvek: urađen poziv i zatvoren posao ne skidaju „kasni“.
- Filter „samo nerešeni“ u uvozu onemogućava jedino dugme koje rešava baš te redove.
- Na listi „Bez telefona“ istaknut je čip „nema PIB“.
- Faza „U radu“ se vidi na dva mesta, a menja se na trećem.
- Na telefonu postoje dva „Danas“: u donjoj traci je zvono, a u Leadovima jezičak.

### Šta valja i ostaje

- Režim poziva: jedna firma, tasteri P, 1–4, N i Esc, „Zašto je na spisku“, dnevnik i kraj ture. Ovo je jezgro modula.
- Poštenje brojeva: „—“ umesto nule, imenioci, ispisane granice, predlog zabrane uz poklopljen izraz, obavezno obrazloženje za Dobijen i Izgubljen.
- Čipovi „Zašto“ (nema sajt, samo Instagram, tuđe zakazivanje): razlog poziva za sekundu.
- Istorija firme, filteri u adresi strane i tastatura tabele (j/k, Enter, p, i, s, /).

### Veliki predlozi

1. **Kartica ishoda** (M): jedna komponenta za režim poziva, Danas, Mapu i profil. Ishodi 1–6 sa „Zovi kasnije“ i „Traži ponudu“, rok unapred izabran (Sutra 10h, +2 radna dana, Pon 10h, +7 dana), predlog faze čekiran, beleška u fokusu, Enter čuva i ide dalje.
2. **Jedan red rada na Danas** (L): upiti, pa sastanci bez ishoda, pa dogovoreno za danas i zakasnelo, pa svež signal, pa nove firme. Režim poziva ide kroz ceo red. Desno „Ove nedelje“ (pozivi, sastanci, ponude) i Agenda.
3. **Tok i ponuda kao zapis** (L): kolone po fazi, levak za 30 dana, ponuda sa iznosom i rokom, podsetnik „ponuda bez odgovora 3 radna dana“.
4. **Nova podela: Danas · Tok · Firme · Podaci** (M). Firme su Tabela i Mapa sa jednim redom filtera. Podaci su dopuna, kvalitet baze, uvoz, niše i ocenjivanje. Zaostali i Sastanci postaju filter i Agenda; stare adrese preusmeravaju.
5. **Firme za rad** (M): redovi od 36 px, sort na serveru, grupne radnje.
6. **Uvoz koji ne kažnjava** (M): povezivanje kolona, grupno rešavanje, tačan status.
7. **Ispravke podataka u petlji** (S, svaka posebno): beleška, zabrana kontakta, zaduženje, zatvoreni poslovi van zaostalih.
8. **Teren na telefonu** (M): mapa preko celog ekrana, „U blizini“, navigacija, dugmad od najmanje 44 px.

### Ciljni kanvas: Leadovi → Red

*[crtež u Claude dokumentu: ciljni kanvas Leadovi → Red · predlog, brojevi iz sintetičkih podataka]*

Prvi jezičak Leadova se zove „Red“, da se ne bi mešao sa početnim ekranom „Danas“. Kartica ishoda je ista u režimu poziva, na Mapi i u profilu firme.

## Kanali: Instagram, Facebook, YouTube, Threads, Oglasi

Kanali se ponašaju kao pet zasebnih aplikacija. Pregledi imaju pet različitih rasporeda, razgovori su na šest mesta, objavljuje se iz četiri kompozera bez ijednog kalendara, a automatizacije žive na četiri mesta. Nijedan komentar ni poruka ne vodi u Leadove, iako kanali agencije postoje da dovedu klijente. Ocena ove oblasti je 20 od 40 (Nielsen), na donjoj granici prihvatljivog.

**Posao ekrana:** za svaki kanal reći kako stoji, ko čeka odgovor i šta sledeće objaviti. **Sada:** stanje kanala da, „ko čeka“ i „šta sledeće“ ne. Pet podekrana Instagrama (Komentari, Inbox, Publika, Priče, Detalj objave) nemaju sintetičke podatke, pa su ocenjeni iz koda.

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Pet pregleda, pet rasporeda. Fokus broj je negde stanje (pratioci), a na YouTube-u protok (pregledi). Threads ima 5 pločica bez linije i bez poređenja, Oglasi nemaju spremnost. Postoje tri različita „Top 3“ i četiri formata datuma. | Jedan šablon: zaglavlje sa stanjem veze, tri broja levo (Pratioci, Doseg, Upiti, svaki sa imenom i periodom) i „Čeka te“ desno, jedna mreža objava sa sortom „Najbolje“. Grafikon i dubina idu ispod preloma. | P1 veliko |
| Sirovi API nazivi na ekranu: TEXT\_POST i CAROUSEL\_ALBUM (Threads), ADDED\_PHOTOS i MOBILE\_STATUS\_UPDATE (FB komentari, iako prevod postoji u FB mreži), (reply\_control), (quote\_post\_id), „UTF-8 bajtova“, threadsClicks, „jedinice kvote“, Sales i PMax. U naslovu Threads moderacije stoji interna oznaka plana „Dodatak A.2“. | Jedan rečnik kanala za ceo UI, plus provera koja pada čim se na ekranu pojavi sirov naziv. | P1 veliko |
| Primarna dugmad na Threads-u („Objavi“, „Poveži Threads“, „Novo pravilo“) su siva i izgledaju onemogućeno. Crveno primarno „Pošalji video“ na YouTube-u čita se kao opasnost. | Jedna boja primarne radnje u celoj aplikaciji (vidi Globalni UI). | P1 veliko |
| Brojevi koji nisu iz podatka. „Pregledi profila 0“ kad podatka nema (kod to radi namerno). Google kampanje pokazuju „Frekvencija 1,0“ jer baza upisuje frekvenciju 1 i doseg jednak prikazivanjima. „CTR 0,0 %“ stoji i na kampanji bez prikazivanja. | Nepoznato je „—“ sa razlogom, na primer „Google ne meri frekvenciju“. | P1 veliko |
| Na istom Threads ekranu stoje dva broja pratilaca: 1.264 u fokusu i 1.247 kao „poslednji snimak“. Osa grafikona ponavlja „1,2k“ četiri puta. | Jedan broj pratilaca. Ose sa celim brojevima. | P2 smeta |
| Top 3 i „Sve objave“ crtaju iste kartice dvaput. Tekstualne FB objave dobijaju praznu sličicu od oko 250 px. YouTube ima 27 dugmadi iste težine (3 na svakoj od 9 kartica). | Jedna kompaktna mreža. Klik na karticu otvara panel sa radnjama. | P2 smeta |
| Boja grafikona ne prati kanal: IG grafikon je u cijanu Table, FB i YT stubići u narandžastoj (boja Oglasa), a grafikon Oglasa u cijanu. | Grafikon kanala u jednoj neutralnoj boji sa jednim akcentom. | P2 smeta |
| Telefon: Facebook je visok 6.374 px, YouTube 6.565, Threads 7.548. Tabela kampanja na 390 px pokazuje samo nazive. Birač perioda zauzima oko 120 px na vrhu svakog kanala. | Na telefonu tri broja u jednom redu, „Čeka te“ i objave kao vodoravna traka; kampanje kao kartice; period u meniju. | P1 veliko |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Ne vidi se ko čeka odgovor. IG pregled zna da 3 komentara čekaju, ali pokaže samo siv krug. Poruke (DM) pregled uopšte ne čita, iako ih zvono broji. Threads odgovori se gledaju objavu po objavu iz izbora od 50 objava. YouTube nema ručni odgovor nigde. | Traka „Čeka te“ na svakom kanalu i „Zajednica“: jedan red za sve razgovore. | P1 veliko |
| Stanje veze je netačno u oba smera. Kanal piše „Povezan ✓“ kad je token istekao (gleda samo da veza postoji). IG kompozer uvek pokazuje žuti baner „ponovo poveži Instagram … opseg instagram\_business\_content\_publish“, i kad je sve u redu. | Red stanja veze u zaglavlju svakog kanala („Veza istekla pre 2 dana · Poveži ponovo“). Baner samo kad je stvarno potreban. | P1 veliko |
| Threads jezičci nisu adrese: Nazad izbacuje iz modula, osveženje vraća na Pregled, ⌘K ne može da ih otvori. Isto važi za detalj kampanje i duel kreativa u Oglasima. | Rute i podnavigacija kao kod ostalih kanala. | P1 veliko |
| Primarno dugme YouTube-a „Pošalji video“ pravi samo privatan video. Upozorenje stoji na dnu dijaloga, posle popunjene forme. | „Otpremi kao privatan“ kao sporedno dugme, sa upozorenjem u prvom redu dijaloga. | P1 veliko |
| Threads „Objavljivanje“ je zid od oko 13 API polja otvorenih odjednom, bez pregleda objave. Polje za tekst je na oko 600 px, a dugme „Objavi“ na oko 1.470 px. | Vidljivi su tekst, prilozi i termin. Sve ostalo ide pod „Dodatno“. Kasnije zajednički kompozer. | P1 veliko |
| Oglasi: tabela kampanja, radni predmet ekrana, počinje tačno na prelomu. Akronimi (CPA, ROAS, Hook Rate, Quality Score) nemaju objašnjenje. Čip „Hot“ je interni prioritet sinhronizacije prikazan kao upozorenje. Cilj je na engleskom u tabeli, a na srpskom u detalju. | Tabela iznad preloma, srpski nazivi sa akronimom u oblačiću, „Hot“ se briše. | P1 veliko |
| Kanal i Leadovi nisu povezani. Nijedan komentar ni poruka ne nudi „Napravi lead“ ili „Otvori firmu“, iako firma u Leadovima već nosi IG i FB identitet. | U Zajednici, uz svaki razgovor: firma ako postoji, inače „Napravi lead“. | P1 veliko |
| Podrazumevani dnevni budžet nove kampanje je 20 u valuti naloga, a jedina provera u čarobnjaku je „veće od nule“. | Podrazumevano iz Podešavanja, provera minimuma i „≈ mesečno“ ispod polja. | P2 smeta |
| Slanje konverzija Meti (CAPI) stoji u Publikama, a to je zdravlje integracije. | Seli u Podešavanja → Sajt i oglasi, uz stavku u zvonu kad ima odbijenih. | P2 smeta |
| Threads „Pretraga i otkrivanje“ pretražuje samo tvoje objave, jer Meta još nije odobrila pun pristup. | Sakriti dok odobrenje ne stigne, ili preimenovati u „Pretraga mojih objava“. | P2 smeta |

### Šta nema smisla

- Kanal piše „Povezan ✓“, a zvono u isto vreme kaže da je token iste veze istekao.
- Kompozer traži ponovno povezivanje i kad je sve u redu.
- „Automatizacije (OpenReply)“ su jezičak Threads-a, a OpenReply je poseban modul.
- Atribucija linkova živi u Threads-u, a modul Atribucija postoji.
- Pretraga koja ne pretražuje Threads.
- Ista Google potrošnja se vidi u Oglasima (iz Google Ads-a) i u Analitika → Oglasi (iz GA4), kao dva broja bez objašnjenja.
- Na FB komentare se odgovara na dva mesta: u kartici objave i na posebnoj strani komentara.
- YouTube uslov „Video u 7 dana“ ispunjava i privatan video koji niko ne vidi.
- Za isto mesto postoje tri natpisa: „Poruke (Inbox)“, „Inbox“ i „Poruke“.

### Šta valja i ostaje

- Merač „Spremnost kanala“, koji ne izmišlja (nepoznato nije neispunjeno). Treba ga samo odvojiti od stanja veze.
- „Misija za start“ na nepovezanom kanalu umesto zida nula.
- IG kompozer: pregled uživo, provera fajla, „Objavljuješ kao @nalog“. On je uzor za zajednički kompozer.
- Dnevnici radnji sa razlogom i „Pokušaj ponovo“, i YouTube prevod kvote u radnje („još oko 33 odgovora danas“).

### Rečnik: najvidljivije zamene

| Danas na ekranu | Predlog |
| --- | --- |
| TEXT\_POST, CAROUSEL\_ALBUM, POST, REEL, STORY | Tekst, Album, Objava, Reel, Priča |
| ADDED\_PHOTOS, MOBILE\_STATUS\_UPDATE | Slika, Status |
| opseg instagram\_business\_content\_publish, token | dozvola za objavljivanje, Poveži ponovo |
| 500 UTF-8 bajtova | još N znakova |
| Cooldown, Max po niti, draft, Log izvršenja | Pauza za istu osobu, Najviše u jednoj niti, Proba, Dnevnik |
| jedinice kvote | Danas još oko N odgovora |
| CPA, ROAS, CTR, CPM | Cena po rezultatu, Povraćaj, Stopa klikova, Cena za 1.000 prikazivanja (akronim u oblačiću) |
| Sales, Traffic, Leads, PMax | Prodaja, Saobraćaj, Upiti, Performance Max |
| Ad set, Lookalike, Hook Rate | Grupa oglasa, Slična publika, Zadržavanje prve 3 s |
| Ledolomci, Prozor ističe | Početna pitanja, Rok za odgovor ističe |

### Veliki predlozi

1. **Zajednica** (L): jedan red za IG i FB komentare, IG poruke, Threads odgovore i YouTube komentare. Tri kolone (filteri, red, razgovor), prečice j/k/r i veza ka firmi. Stare strane postaju prečice sa filterom, pa se nijedna radnja ne gubi.
2. **Objave** (L, sam kalendar M): kalendar nedelje po kanalima i jedan kompozer sa izborom kanala. Novosti ostaju svoj uređivač i vide se kao traka u kalendaru.
3. **Jedan šablon pregleda kanala** (M), a Threads prelazi na rute (S).
4. **Stanje veze odvojeno od spremnosti** (S): tačan status u zaglavlju i oznaka „podaci od …“ kad je sinhronizacija stara.
5. **Oglasi: istina u brojevima** (M): bez izmišljene frekvencije, srpski nazivi, kampanja dobija svoju adresu, CAPI seli u Podešavanja.

### Ciljni kanvas: jedan šablon za kanale

*[crtež u Claude dokumentu: ciljni kanvas pregleda kanala · predlog, brojevi iz sintetičkih podataka]*

Svaki kanal odgovara na ista tri pitanja na istim mestima: kako stoji (tri broja sa imenom i periodom: Pratioci, Doseg, Upiti), ko čeka odgovor i šta je objavljeno. Stanje veze je uvek u zaglavlju, nikad zakopano u meraču.

### Kanvas: Zajednica

*[crtež u Claude dokumentu: kanvas Zajednice · predlog, imena su primeri]*

Zajednica čita isti izvor koji zvono već sabira, pa je backend već delom tu. YouTube komentari ulaze kad se doda njihov unos; do tada se vide samo oni koje je zadržala automatizacija.

## Analitika i Atribucija

Analitika odgovara na pitanje „koliko saobraćaja“, a vlasnik pita jedno: da li sajt i kanali donose pozive i upite. Upiti su osmi red sirove tabele GA4 događaja na dnu strane Sadržaj, oko 2.300 px niže. Baza već ima prave upite sa stranicom i UTM oznakom, a Analitika ih ne prikazuje nigde. Uz to, brojevi se ne slažu zbog načina na koji kod računa. Ocena je 18 od 40 (loše).

**Posao ekrana:** reći da li sajt i kanali dovode upite, odakle, i da li je bolje nego pre. **Sada:** ne.

### Isti period, različiti brojevi

Brojevi u tabeli su iz sintetičkih podataka, ali je uzrok razlike u kodu, pa će se razlikovati i u produkciji.

| Mera | Gde se vidi i koliko | Uzrok |
| --- | --- | --- |
| Posete (sesije) | Pregled 2.102 · tabela izvora 2.546 · Sticanje 2.656 · Posetioci 2.669 | dnevni izveštaj protiv izveštaja po izvoru |
| Korisnici | Pregled 1.893 · Sticanje 1.750 · Sadržaj 2.840 · Posetioci 2.295 | korisnici se sabiraju po danima i po stranici, kanalu ili zemlji, pa je svaki broj naduvan |
| Ishod (upit) | Ključni događaji 81 · 128 · 201 · Konverzije 6 · Upiti (7 d) 18 | šest imena i četiri izvora |
| Poslate DM poruke | OpenReply levak 382 · tabela na istom ekranu 404 · Atribucija 404 | levak je za period, tabela od početka |

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Pregled ima 10 pločica iste težine. Ista serija je nacrtana dvaput (mala linija u pločici „Sesije“ i veliki grafikon pored). Birač mere sa 8 pilula se lomi u 2 reda, a na telefonu u 4. | Jedan fokus broj, tri sporedna i jedan grafikon. Izbor mere kao padajući meni u zaglavlju grafikona. | P2 smeta |
| Poskupljenje je obojeno kao uspeh: na Analitika → Oglasi rast potrošnje (+22 %) i cene po događaju je zelen. | Svaka mera nosi smer „bolje je više“ ili „bolje je manje“ iz jednog rečnika mera. | P1 veliko |
| Pogrešan tip grafikona. Naslagana površina uređaja vara oko: tablet izgleda kao 110 poseta dnevno, a ima ih oko 5. Retencija ima dve trećine prazne površine i ISO datume. Toplotna mapa radi samo mišem. | Traka udela za uređaje. Rečenica-sažetak uz mapu. Mapa dostupna tastaturom i dodirom. | P2 smeta |
| Atribucija: fokus kartica deli prostor sa „UTM integritet 1/1“ i natpisom utm\_medium=openreply-dm. Pločice ispod ponavljaju brojeve levka. | Fokus je levak sa brojevima istog perioda. Kvalitet oznaka je jedan red ispod tabele. | P2 smeta |
| Telefon: tabele izvora i kampanja seku kolone bez znaka da klize, iznos je odsečen („38.000 RS“), natpisi pločica isto („ANGAŽOVANE SES…“). | Na telefonu liste umesto tabela: ime, posete, upiti. | P2 smeta |
| Mono font i za običan tekst („Vremenska zona propertija: Europe/Belgrade“). Trajanje ima tri zapisa: 42s, 1m 1s, 1 min 11 s. | Mono samo za cifre. Jedan zapis trajanja: 42 s, 1 min 1 s. | P3 sitnica |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Ekran ne odgovara na glavno pitanje. Fokus su sesije. Klik na telefon, poslata forma i prijava stoje kao sirovi događaji u trećoj tabeli Sadržaja. | Fokus Pregleda je „Upiti“: pozivi, forme i poruke, sa prethodnim periodom i jednom rečenicom zaključka. | P1 veliko |
| Brojevi se ne slažu zbog koda (tabela iznad). Fusnote objašnjavaju grešku umesto da je popravljaju, a stoje 900 px ispod broja. | Zbirovi za ceo period iz GA4. Mera koja ne može tačno da se sabere se ne prikazuje. | P1 veliko |
| Levak Atribucije meša periode. DM poruke i klikovi su od početka, a posete i konverzije za 28 dana, pa „74,8 % prelazi dalje“ deli dva različita perioda. | Svaki korak levka iz istog perioda. | P1 veliko |
| Ishod ima šest imena: Ključni događaji, Konverzije, Web konverzije, Cilj, CR, Upiti. | Jedno ime, „Upiti“, sa vrstom: poziv, forma, poruka. | P1 veliko |
| Atribucija imenom obećava sve kanale, a radi samo Instagram DM → sajt. Google, oglasi, Facebook, Threads i forma sa sajta nisu tu. | Atribucija postaje „Izvori“: svi kanali, posete, upiti, trošak i cena po upitu u jednoj tabeli. | P1 veliko |
| Nigde nije izrečen zaključak: nijedno „rast“, „pad“ ni „najviše“. Grafikoni ne crtaju prethodni period, iako je učitan. | Jedna rečenica po pogledu, sastavljena iz brojeva sa ekrana (bez veštačke inteligencije). Isprekidana linija prethodnog perioda. | P2 smeta |
| Sedam podstrana istog obrasca (objašnjenje, 4 do 5 pločica, tabela). Jedino primarno dugme je „Pogledaj uživo“. Retencija ne vodi ni do jedne odluke. | Tri jezička: Pregled, Izvori, Sajt. Uživo postaje čip „3 na sajtu“ sa bočnim panelom. | P2 smeta |
| Kontrolna tabla ponavlja pola Analitike: isti grafikon sa 8 mera, iste pločice. | Na tabli samo jedna pločica „Upiti“ koja vodi u Analitiku. | P2 smeta |
| Novac iz dva izvora: Google potrošnja iz Google Ads-a (Oglasi) i iz GA4 (Analitika → Oglasi), uz fusnotu da se neće poklapati. Analitika → Oglasi ne zna za Meta oglase. | Novac živi samo u Oglasima. Analitika dobija red „Plaćeno“ u Izvorima, sa cenom po upitu. | P2 smeta |

### Šta nema smisla

- Fusnota objašnjava sopstvenu računsku grešku: „Zbir po izvorima (2.546) odstupa od pločice Sesije (2.102)“.
- Zbir po zemljama (2.848) je veći od „Ukupno korisnika“ (2.295), a fusnota kaže da zbir može biti manji.
- Kolona „Događaji“ su ključni događaji, a tabela „Događaji“ odmah ispod su svi događaji.
- Upiti postoje na Kontrolnoj tabli, a ne postoje u Analitici.
- Prazna Analitika (bez GA4) je potpuno prazna, iako upiti sa sajta stižu u bazu i bez GA4.
- Atribucija i OpenReply crtaju isti levak sa različitim brojevima, na jedan klik razdaljine.

### Šta valja i ostaje

- Poštenje prema podatku: „—“ sa razlogom, razlika između „nije bilo saobraćaja“ i „nije očitano“, oznaka „podaci za danas i juče su privremeni“.
- Levak koji piše „0,32 klika po poruci“ umesto lažnog procenta.
- Uživo: jedan broj i jedan grafikon. To je najbolje komponovan ekran Analitike.

### Veliki predlozi

1. **Prvo brojevi, pa izgled** (M–L): zbirovi za ceo period, korisnici se nikad ne sabiraju po danima, OpenReply brojevi po danu, jedan rečnik mera (naziv, definicija, format, smer „bolje je“, izvor).
2. **Analitika = Upiti** (L): fokus „Upiti“ sa podelom na pozive, forme i poruke, poreklom, trendom i rečenicom.
3. **Sedam podstrana i Atribucija postaju tri jezička** (L): Pregled, Izvori, Sajt. Stare adrese ostaju i preusmeravaju, pa se ništa ne gubi.
4. **Tabla bez kopije Analitike** (S): jedna pločica „Upiti“.

### Ciljni kanvas: Analitika → Pregled

*[crtež u Claude dokumentu: ciljni kanvas Analitika → Pregled · predlog]*

Izvori primaju Sticanje, Atribuciju i Analitika → Oglasi, a Sajt prima Sadržaj, Posetioce i Retenciju. Stare adrese ostaju i preusmeravaju.

## Automatizacija: OpenReply, Pravila i automatizacije po kanalima

Automatizacija živi na pet mesta sa četiri rečnika: OpenReply za Instagram i Facebook, njegovi „Ledolomci i meni“, YouTube, Threads i Pravila. Pravila za oglase su opasna po novac. Valuta je tvrdo upisana u evrima umesto da se čita iz naloga, a šabloni sa pragom od 15 se sami upišu, pa prag koji niko nije izabrao može da pauzira kampanje. Pauza se uključuje jednim klikom, bez potvrde i bez povratka.

**Posao ekrana:** pokazati šta se dešava samo od sebe, da li radi i šta je uradilo. **Sada:** delimično. Sva tri motora rade, ali se ne vide zajedno.

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Urednik automatizacije je modal sa oko 20 polja i unutrašnjim klizanjem. Na tvom ekranu se vide samo naziv i pola okidača. | Bočni list od oko 720 px u tri odeljka (Kad, Uradi, Dodatno), sa pregledom poruke desno. | P2 smeta |
| Pravila: brojevi u čipovima („Pravila 2 · Aktivna 1 · Provera na 30 min“) izgledaju kao filteri. Žuti čip „Pauziraj i javi“ liči na XP nagradu. Urednik pravila koristi drugačije kontrole od kartice. | Brojevi kao tekst uz naslov. Radnja u boji stanja, ne nagrade. Iste kontrole svuda. | P2 smeta |
| Istorija pravila piše „izmereno 1820.00“: decimalna tačka, bez valute, bez praga. | „CPA 18,20 €, prag 15,00 €“, sa valutom iz naloga. | P2 smeta |
| OpenReply pregled: red „Odgovoreno na Instagramu 382 · 100 %“ i „Facebook 0 · 0 %“ zauzima 130 px za podelu 100 prema 0, a broji poslate poruke, ne odgovore. Prazan OpenReply je zid nula. | Brojevi idu na karticu svake automatizacije. Prazno stanje postaje misija „Napravi prvu automatizaciju“. | P2 smeta |
| Zelena kutija od 68 px „Motor je uključen i sluša komentare“ stoji i kad je sve u redu. | Zdravo stanje je jedan red. Kutija samo za problem. | P3 sitnica |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Valuta upisana u kodu: urednik uvek nudi „CPA (€)“, bez obzira na valutu naloga, a šabloni se sami upišu sa pragom 15 i 100. | Valuta iz naloga uz svaki prag. Šabloni računaju prag iz stvarnog CPA i ne upisuju se sami. | P1 veliko |
| Pauza kampanja se uključuje jednim klikom, bez potvrde i bez probe. Posle automatske pauze nema „Vrati kampanju“ na ekranu (mejl ima link, ekran nema). | Pre uključivanja: „Sada bi pauziralo: Prolećna akcija (CPA 6,43 €)“. U istoriji „Vrati kampanju“ i „Otvori“. | P1 veliko |
| Isti model (okidač → radnja) na pet mesta, sa četiri rečnika: automatizacija, kampanja, pravilo, čuvar, „draft“ i „Uživo“. | Jedan ekran „Automatizacije“ sa svim motorima kao rečenicama i jednom istorijom. | P1 veliko |
| „Kampanja“ u OpenReply-u je zapravo automatizacija, a u Oglasima je plaćena kampanja. | U OpenReply-u svuda „automatizacija“. | P1 veliko |
| Izbor objave traži ručno ukucan „media ID iz Instagram API-ja“, iako su objave već sinhronizovane. | Birač objave sa sličicama. | P1 veliko |
| Nova automatizacija je odmah aktivna i odmah javno odgovara. Threads za isti posao ima bezbedan probni režim. | Svaki motor prvo radi kao proba („Sačuvaj kao test“, „Probaj na mom komentaru“), pa tek onda uživo. | P2 smeta |
| Ime „OpenReply“ ne kaže šta modul radi. Tek Podešavanja otkrivaju „Komentar → DM automatizacija“. | U navigaciji „Automatizacije“. OpenReply ostaje ime motora u Podešavanjima. | P2 smeta |
| Pravila čuvaju samo Meta oglase, pa 2 od 6 kampanja (Google) nisu čuvane, i to nigde ne piše. Kartica ne pokazuje koliko je kampanja blizu praga. | Natpis „samo Meta oglasi“ i traka „sada najbliža pragu: 6,43 €, 43 % praga“. | P2 smeta |
| Poruke o greškama pominju imena promenljivih okruženja: IG\_WEBHOOK\_VERIFY\_TOKEN, META\_APP\_SECRET, ADS\_WRITE\_ENABLED, RESEND\_API\_KEY. | Ljudska rečenica i radnja. Tehničko ime samo u Podešavanjima. | P2 smeta |

### Šta nema smisla

- Ista reč „kampanja“ znači dve različite stvari u dva susedna modula.
- Valuta pravila je upisana u kodu, a ne pročitana iz naloga.
- Pregled OpenReply-a je analitika smještena pod „Automatizacija“, a njegovo pitanje (koliko poruka vodi na sajt) je pitanje Atribucije.
- Jezičak „Automatizacije (OpenReply)“ stoji u Threads-u, a OpenReply je poseban modul.
- Istorija pravila je zaseban jezičak sa jednim događajem, a poslednje okidanje već piše na kartici.

### Šta valja i ostaje

- Rečenica pravila: „Ako CPA > … tokom 3 dana uz ≥ 1.000 prikaza → pauziraj i javi mi“. To je tačan model „kad, ako, uradi“ i treba da postane format svake automatizacije.
- Urednik koji kaže „Šalješ kao @nalog“ i „Nedostaje: naziv, ključna reč, tekst poruke“.
- Probni režim na Threads-u i YouTube prevod kvote u broj odgovora.

### Veliki predlozi

1. **Jedan ekran „Automatizacije“** (L): svi motori kao rečenice „KAD → AKO → URADI“, jedna traka stanja (radi, proba, isključeno, ne može i zašto), zajednička istorija sa „Vrati“ i „Otvori“. Urednici kao bočni listovi u istom kalupu. YouTube i Threads vode na filtriran prikaz, pa ništa ne nestaje.
2. **Čuvari budžeta u valuti naloga** (M): proba pre uključivanja, vrednost prema pragu, povratak kampanje.
3. **OpenReply pregled se gasi** (S–M): brojevi idu na karticu automatizacije, levak u Analitika → Izvori.

### Ciljni kanvas: Automatizacije

*[crtež u Claude dokumentu: ciljni kanvas Automatizacije · predlog, brojevi iz sintetičkih podataka]*

Motori ostaju isti (OpenReply, YouTube, Threads, čuvari budžeta); menja se samo to što ih vidiš zajedno, istim rečima i sa jednom istorijom. YouTube i Threads vode na isti ekran sa filterom.

## Napredak i gamifikacija

Napredak je dobro napravljen kao lični pregled, ali sedi na radnim ekranima i nosi fokus i primarna dugmad, pa početni ekran vodi u igru, a ne u posao. Predlog nije da se ukine: ti si ga tražio i on daje ritam. Predlog je da prestane da bira posao umesto tebe.

**Posao ekrana:** lični pregled, odnosno koliko si radio ove nedelje, niz, nivo i rekordi. **Sada:** kao profil da, a kao deo radnih ekrana smeta.

### Gde pomaže

- Nedeljni ciljevi (pozivi, sastanci, objave) su pravi poslovni ciljevi.
- Niz daje ritam radnim danima.
- Režim poziva sa turom i rezimeom na kraju.
- Mapa aktivnosti i retke nagrade (nov nivo, dostignuće).

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Na početnom ekranu kartica napretka zauzima 318 px, oko pola prvog ekrana. Dve već završene misije stoje u punoj veličini sa zlatnim ivicama. | Nedeljni ciljevi kao tri tanke trake u desnoj koloni. Završeno nestaje sa table i ostaje na strani Napredak. | P1 veliko |
| Zlatni čip „+25 XP“ stoji na svakoj kartici za poziv, sa istim brojem, pa ne pomaže izbor. „+190 XP danas“ je i na tabli i na Leadovima. Zlatna je najsjajnija boja radne kartice. | Bez XP čipova na radnim karticama. Zbir XP-a samo na kraju ture i u kartici igrača. | P2 smeta |
| Posle svake radnje iskače XP poruka od 2,5 s, i to je jedina iskakača poruka u aplikaciji. Nagrada je glasnija od potvrde posla. | Potvrda posla je poruka („Sačuvano: Zainteresovan, korak sutra 10h“), a XP se tišo menja u kartici igrača. | P2 smeta |
| Na strani Napredak najveći broj je „1.370 / 1.540 XP“ (40 px, zlatno), a ne nedeljni posao. Sva 23 dostignuća su stalno otvorena, a u praznom nalogu to su 23 siva katanca. | Fokus „Ova nedelja“: tri trake sa ciljem i prošlom nedeljom. XP u jednom redu. Otključana dostignuća i sledeća tri. | P2 smeta |
| Prekidači u Podešavanja → Napredak su u sivoj boji, pa „Uključeno“ izgleda kao isključeno. | Prekidač u boji radnje, isti kao svuda. | P2 smeta |
| Kartica igrača u bočnoj traci piše zvanje („Operativac“) umesto tvog imena. | Ime vlasnika, a zvanje uz nivo. | P3 sitnica |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Primarno dugme radnog ekrana nosi misija, pa gamifikacija određuje prioritet posla. | Primarno dugme uvek nosi najvažniji posao. Napredak ga nikad ne bira. | P1 veliko |
| Misiju ne možeš da završiš: odgovori na komentare se broje samo iz aplikacije, a ne iz Instagram aplikacije na telefonu. | Misija se zatvara kad komentar više ne čeka odgovor, bez obzira gde je odgovoren. | P1 veliko |
| Misije se zamrzavaju ujutru, a posao nastaje tokom dana. Isti posao se vidi četiri puta, u različitom redosledu i sa različitim brojevima: misije na tabli, „Šta me čeka“ na tabli, strana Napredak i ⌘K. | „Plan dana“: prve tri stavke iz „Šta me čeka“, uživo. XP za čišćenje hitnih stavki. | P1 veliko |
| Tri dnevna cilja za pozive u isto vreme: misija od 3, tempo od 5 i nedeljni cilj od 25 podeljen na dane. | Jedan dnevni cilj: nedeljni cilj podeljen na radne dane. | P2 smeta |
| Napredak nagrađuje radnje koje ekran krije: 40 XP za fazu „Poslata ponuda“ i 250 XP za „Dobijen“, a faza je na trećem nivou menija. Dostignuća „Ponuda poslata“ i „Zatvarač“ zavise od faze koja se retko menja. | XP prati pravi tok kad ponuda i dobijen posao dobiju svoj ekran (Leadovi → Tok). | P2 smeta |
| „Aktivnih dana 42 od 84“: imenilac broji i vikende, iako vikend nije radni dan. Piše 50 %, a pravo je oko 70 %. | Imenilac su radni dani. | P2 smeta |
| „Kombo 2 zaredom“ se računa i za „Nije se javio“, pa meri brzinu klikanja, a ne ishode. | Kombo samo za razgovore sa ishodom. | P2 smeta |
| Jedan prekidač „Prikazuj XP i proslave“ bez srednjeg režima. Podešavanje je lično i važi za sve projekte, a živi u podešavanjima jednog projekta. | Tri režima: Pun, Tih, Isključen. Mesto u ličnom meniju (avatar). | P2 smeta |

### Šta nema smisla

- Misija „Pozovi 3 firme“ je „Završeno“, dok je dnevni tempo na Leadovima 3 od 5.
- Nov nivo ništa ne otključava, pa je proslava bez sadržaja.
- YouTube ne donosi XP ni za jednu radnju, pa je jedini kanal koji Napredak ne vidi.

### Predlog: „Tih napredak“

1. Tri režima: Pun, Tih (podrazumevano) i Isključen.
2. U Tihom režimu na radnim ekranima ostaju samo nedeljni ciljevi (tanke trake) i niz kao mali znak. Nema XP čipova, nema „+XP danas“, nema iskačuće XP poruke posle svake radnje.
3. Misije postaju „Plan dana“ iz istog spiska posla, uživo, i nijedna ne nosi primarno dugme.
4. Strana Napredak dobija fokus „Ova nedelja“, a ciljevi se menjaju na licu mesta.
5. Režim poziva zadržava turu, kombo za razgovore i zbir XP-a na kraju ture.

## Ljuska: bočna traka, gornja traka, ⌘K, zvono, telefon

Ljuska dobro kaže gde si: boja modula, mrvica i aktivna crta rade. Ali „kuda mogu“ ima četiri različita modela navigacije, a „da li nešto ne radi“ je kontradiktorno, jer tačka u gornjoj traci po dizajnu nikad nije crvena.

### UI

| Problem (šta se vidi) | Predlog | Prioritet |
| --- | --- | --- |
| Podstavke modula u bočnoj traci su dve kolone redova od 24 px. Analitika se čita cik-cak, a Tab ide levo-desno-levo. Uvedeno je da bi traka stala u 695 px. | Bočna traka nosi samo module. Druga ravan je uvek traka jezičaka ispod zaglavlja. | P1 veliko |
| Druga ravan menja mesto: dok je traka proširena, podstavke su levo, a kad je skupljena ili na telefonu, jezičci su gore. Isti ekran Instagrama jednom ima jezičke gore, a jednom nema. | Jezičci uvek na istom mestu, bez obzira na traku. | P1 veliko |
| Telefon: lepljiva gornja traka je visoka 147 do 192 px, jer se birač perioda prelama u 2 do 3 reda. Sa donjom trakom to je do 29,5 % ekrana. | Gornja traka u jednom redu; period u meniju samo na ekranima koji ga koriste. | P1 veliko |
| Na korenu modula mrvica i naslov kažu isto („Kontrolna tabla“ dvaput), na 12 modula. Postoje dva oblika zaglavlja: Leadovi bez naslova, ostali sa naslovom. | Mrvica tek od druge ravni („Instagram / Komentari“). Jedan oblik zaglavlja. | P2 smeta |
| Bedž „9“ na Leadovima broji vrste posla, a ne stvari, pa se ne poklapa ni sa jednim brojem na Leadovima. Zbog rupa u podacima je skoro uvek crven, pa ga oko prestaje da čita. | Bedž broji samo ono što je danas na redu, a crven je samo kad nešto kasni. | P2 smeta |
| Natpis „⌘K“ stoji i na Windowsu, gde radi Ctrl+K. | Natpis prema sistemu: „Ctrl K“. | P2 smeta |
| Prilagođen period: nativna polja pokazuju „09/30/202“, sa odsečenom godinom i američkim redosledom. | Polja jedno ispod drugog, srpski format, prečice „ovaj mesec“ i „prošli mesec“. | P2 smeta |
| Telefon: „Danas“ (zvono) je prozorčić sa vrha sa dugmadima od 24 do 28 px, a „Više“ je list odozdo. To su dva obrasca u istoj traci. „Više“ nema grupe ni Napredak. | Oba kao list odozdo, sa metama od 44 px. „Više“ sa grupama i Napretkom. | P2 smeta |

### UX

| Problem (kako radi) | Predlog | Prioritet |
| --- | --- | --- |
| Četiri modela druge ravni: podrute (Analitika, Instagram, Facebook, YouTube, OpenReply, Oglasi), jezičci u strani (Leadovi, Threads, Podešavanja, Pravila, Uvoz, profil firme), brojevi kao čipovi iznad jezičaka (Pravila) i ekrani samo preko dugmeta (Uvoz, Nova kampanja, Napredak). Radnje su postale jezičci („Nova objava“, „Uživo“). | Jedno pravilo: svi jezičci su podrute sa mrvicom „Modul / Jezičak“, a radnje su dugmad. | P1 veliko |
| Jedna veza, sedam mesta, četiri vrednosti. Tačka piše „Sinhronizovano pre 2 h“ dok Instagram ne radi 3 dana, a u isto vreme stoje crveni „1“ na zupčaniku, „Hitno“ u zvonu, crveni čip na tabli i „✓ aktivno“ u Podešavanjima. | Jedan status po vezi: Radi, Traži pažnju, Nije povezano. Tačka postaje žuta sa brojem („1 veza ne radi“) i vodi na popravku. | P1 veliko |
| Period se ne prenosi između ekrana, iako objašnjenje na tabli tvrdi da „važi na svim ekranima“. Na jednoj strani brojevi imaju do pet različitih perioda bez oznake. | Izabran period se pamti i prenosi. Svaka sekcija sa drugim periodom ga piše u naslovu. | P1 veliko |
| ⌘K ne traži firme ni po imenu ni po broju. Kad firma uzvrati poziv sa 064…, nema brzog načina da je nađeš. | Sekcija „Firme“ u ⌘K: pretraga po imenu i broju telefona. | P1 veliko |
| „Danas“ znači tri stvari: zvono na telefonu, prvi jezičak Leadova i fokus Leadova. Panel zvona se pri tom zove „Šta me čeka“. | Jedno ime za jednu stvar. „Danas“ je početni ekran, a lista posla je „Šta me čeka“. | P2 smeta |
| Ista stvar ima dva imena: „Inbox“ i „Poruke (Inbox)“, „Komentari“ i „Moderacija komentara“, „Uživo“ i „Uživo (poslednjih 30 minuta)“. „Oglasi“ su u bočnoj traci dvaput: kao modul i kao podstavka Analitike. | Natpis jezička i naslov ekrana su isti. Jedno mesto po stvari. | P2 smeta |
| Na telefonu režim poziva nema svoje mesto u donjoj traci, iako je pozivanje sa telefona najprirodnije. | Donja traka: Danas · Leadovi · Pozovi · Instagram · Više. | P2 smeta |

### Šta nema smisla

- Zelena tačka „sve radi“ i crveni „1“ na zupčaniku u isto vreme.
- Radnja je i jezičak i dugme u zaglavlju: „Nova objava“ na Instagramu, „Uživo“ i „Pogledaj uživo“ u Analitici, „Komentari“ i „Odgovori na komentare“ na Facebook-u.
- Bočna traka staje u ekran samo zahvaljujući redovima od 24 px u dve kolone.

### Šta valja i ostaje

- „Šta me čeka“ kao jedan izvor posla za zvono, bedževe, ⌘K i tablu, sa Odloži, Sakrij i Vrati.
- Boja modula i mrvica sa tačkom. Ljuska preživi pad Napretka.
- ⌘K sa zadacima, radnjama i nedavnim, i jezičci sa pravom tastaturom (strelice).

## Novosti, Podešavanja, Sistem i Prijava

Podešavanja su organizovana po implementaciji, a ne po tvom poslu: osam jezičaka meša šest vrsta stvari, a strana Integracija je visoka 4.729 px (10,5 ekrana na telefonu). Novosti čuvaju spisak nacrta samo u pregledaču, iako je sadržaj u bazi. Sistem, živi vodič dizajna, ne pokriva baš one obrasce u kojima živi nedoslednost.

### Podešavanja

| Vrsta | Problem | Predlog | Prioritet |
| --- | --- | --- | --- |
| UX | Osam jezičaka meša šest vrsta stvari: projekat (Projekat, Sajt i oglasi), veze (Integracije), dnevnike (Istorija akcija, Moderacija), lična podešavanja (Napredak), tim (Pristup) i znanje (Mozak). | Pet jezičaka: Opšte · Veze · Sajt i praćenje · Tim i pristup · Ponuda i glas. Dnevnici u svoje module, lično u meni avatara. | P1 veliko |
| UI | Fokus piše „8/8 · Povezano i aktivno ✓ Instagram“, a na istoj strani kartica Instagrama kaže „Čeka Meta app“, stanje sinhronizacije „Greška — Token je istekao“, a raspored „Preskočeno“. Jedna veza ima četiri stanja. | „Radi“ znači povezano i poslednji prolaz uspeo. Fokus: „7 radi · 1 traži pažnju · Reši: Instagram“. | P1 veliko |
| UX | Uputstva za programera u ekranu za vlasnika: „unesi INSTAGRAM\_APP\_ID i INSTAGRAM\_APP\_SECRET u Convex environment varijable“, „OAUTH\_CALLBACK\_ORIGIN“. | „Instagram nije podešen na serveru“ i dugme „Kopiraj uputstvo za programera“. | P2 smeta |
| UI | Fokus broj i primarno dugme su u sivoj boji modula, pa „8/8“ i „Stanje sinhronizacije“ izgledaju onemogućeno. „Prekini vezu“ je trajno otvoren crveni blok u svakoj od 8 kartica. | Boja radnje kao svuda. „Prekini vezu“ u meniju „⋯“, uz potvrdu. | P2 smeta |
| UI | GA4 kartica ispisuje vrednosti iz API-ja: „14 meseci (FOURTEEN\_MONTHS)“, „(ONCE\_PER\_EVENT)“, „BEAUTY\_AND\_FITNESS“. Na ovoj strani je 27 kutija u kutiji. | Veze kao pločice sa stanjem; detalji u bočnom panelu, tehničko sklopljeno. | P2 smeta |
| UX | Podešavanja modula su rasuta. Leadovi imaju svoja (niše, ocenjivanje, uz tekst za programera kao „/generate-leads oceni-sajtove“), a budžet oglasa, osvežavanje Novosti i dnevnici su u globalnim. | Svaki modul nosi svoja podešavanja na istom mestu (zupčanik u zaglavlju modula). Globalna su samo projekat, veze i tim. | P2 smeta |
| UI | Telefon: od 8 jezičaka vide se 3, a strana je visoka 10,5 ekrana. | Pet kratkih jezičaka bez klizanja; veze kao lista. | P2 smeta |
| UX | Klik na jezičak briše ostale parametre adrese strane. | Jezičak menja samo svoj parametar. | P3 sitnica |

### Novosti

| Vrsta | Problem | Predlog | Prioritet |
| --- | --- | --- | --- |
| UX | Spisak nacrta se čuva samo u pregledaču, iako je sadržaj nacrta u bazi. Nacrt sa laptopa ne postoji na telefonu, a brisanje podataka pregledača ga sakriva zauvek. | Nacrti iz baze. Pregledač čuva samo nesačuvan unos. | P1 veliko |
| UI | Kartica nacrta ne kaže šta fali do objave, pa „Test nacrt 2: tekst koji čeka kapije“ izgleda isto kao svež nacrt. Kolona „Arhiva“ zauzima trećinu širine za jednu stavku. | Kolone Nacrti · Spremno za objavu · Objavljeno, a na kartici „Fali: opis slike, podnaslov“. Arhiva kao veza. | P2 smeta |
| UX | Žargon: „četiri kapije“, „provera humanizera“, „Beleška (note)“, „Tekst (article)“. | „Pre objave: dokaz, prirodan ton, opis slike, podnaslov“; „Beleška“ i „Članak“. | P2 smeta |
| UX | Novosti su u „Radni sto“ uz tablu i Leadove, a koriste se retko. Za istu nameru postoje četiri glagola: Novi post, Nova objava, Objavi, Pošalji video. | Novosti kao traka u kalendaru objava. Jedan glagol: „Nova objava“. | P2 smeta |

### Sistem (živi vodič dizajna)

| Vrsta | Problem | Predlog | Prioritet |
| --- | --- | --- | --- |
| UI | Vodič ne pokriva navigaciju (jezičci, trake), tabele, polja, bočne panele, grafikone, učitavanje i greške. Baš tu je nedoslednost iz ovog dokumenta. | Obrasci ljuske, navigacije, tabela, formi, panela i stanja, plus četiri šablona strane: Radni spisak, Pregled kanala, Izveštaj, Podešavanja. | P1 veliko |
| UI | Varijanta dugmeta „default“ izgleda kao primarna, ali se ne broji kao primarna: 77 punih dugmadi bez te oznake. Zato pravilo „jedno primarno dugme“ prolazi meru, a ne prolazi oko. | Ukinuti „default“. Svako dugme mora imati ulogu: primarno, sporedno, obris, tiho, opasno. | P1 veliko |
| UI | Vodič krši sopstveno pravilo (primer sa dva primarna dugmeta) i crta matricu od 455 dugmadi (13 modula × 7 varijanti × 5 stanja). | Jedan modul na ekranu, birač menja boju. Primeri po pravilima. | P2 smeta |

### Prijava

| Vrsta | Problem | Predlog | Prioritet |
| --- | --- | --- | --- |
| UI | Primeri u poljima liče na unete vrednosti („ti@enigmait.rs“, „••••••••••“), a dugme je prigušeno dok su polja prazna. Izgleda kao da je pregledač popunio polja, a dugme ne radi. | Bez primera u polju za lozinku. Dugme uvek aktivno, provera pri slanju. | P2 smeta |
| UI | Podnaslov „Email i lozinka.“ ne dodaje ništa, a „COMMAND CENTER“ je na engleskom. | Bez podnaslova; ime proizvoda na srpskom ili samo znak. | P3 sitnica |

## Šta nema smisla: jedan spisak

Ovo su nelogičnosti iz svih oblasti na jednom mestu, poređane po tome koliko smetaju poslu. Detalji i predlozi su u sekciji svake oblasti.

| Nelogičnost | Gde |
| --- | --- |
| Najvidljivija radnja početnog ekrana je odgovor na komentare zbog 30 XP, a upiti sa sajta čekaju ceo dan. | Tabla |
| Zainteresovana firma posle poziva ne završi ni u jednom redu. | Leadovi |
| Zaostali koraci ostaju crveni zauvek, i posle urađenog poziva i zatvorenog posla. | Leadovi |
| „Tražio da ga ne zovemo“ ne nudi zabranu kontakta. | Leadovi |
| Ista firma je i „nikad zvana“ i „kasni“, pa se zove pre dogovorenog vremena. | Leadovi |
| Ponuda, cilj celog posla, postoji samo kao faza na trećem nivou menija. | Leadovi |
| Zelena tačka „sve radi“ dok Instagram ne radi 3 dana; „8/8 aktivno“ iznad greške. | Ljuska, Podešavanja |
| Kanal piše „Povezan ✓“, a zvono kaže da je token iste veze istekao. | Kanali |
| Kompozer traži ponovno povezivanje i kad je sve u redu. | Instagram |
| Četiri različita broja korisnika za isti period, a fusnote objašnjavaju sopstvenu grešku. | Analitika |
| Upiti postoje na tabli, a u Analitici ih nema. | Analitika |
| Šabloni pravila se sami upišu sa pragom koji niko nije izabrao, a valuta je upisana u kodu umesto pročitana iz naloga. | Pravila |
| „Kampanja“ je automatizacija u OpenReply-u, a plaćena kampanja u Oglasima. | Automatizacija |
| Atribucija meri samo Instagram DM. | Atribucija |
| Pretraga na Threads-u ne pretražuje Threads. | Threads |
| „Pošalji video“ pravi video koji niko ne vidi, a uslov „video u 7 dana“ se time ispunjava. | YouTube |
| Brojevi koji nisu iz podatka: „Pregledi profila 0“, „Frekvencija 1,0“ za Google, tvrdo upisano „12 kohorti“. | Instagram, Oglasi, Analitika |
| Dva različita broja pratilaca na istom Threads ekranu. | Threads |
| Tri dnevna cilja za pozive na istom ekranu. | Tabla, Leadovi |
| Misija za komentare se ne zatvara odgovorom iz Instagram aplikacije. | Napredak |
| Uvoz piše „Primenjen“ uz 41 nerešen red, a filter „samo nerešeni“ gasi jedino dugme koje ih rešava. | Uvoz |
| Period „važi na svim ekranima“, a nestane na prvom kliku. | Ljuska |
| „Oglasi“ dvaput u bočnoj traci, „Danas“ sa tri značenja, „Inbox“ i „Poruke (Inbox)“ za isto mesto. | Ljuska |
| Radnje su jezičci („Nova objava“, „Uživo“), a isto dugme stoji i u zaglavlju. | Ljuska |
| Nacrt Novosti postoji u bazi, a ne vidi se na drugom uređaju. | Novosti |
| „Kombo 2 zaredom“ se računa i za „Nije se javio“. | Režim poziva |

## Predlog nove arhitekture i ciljni dizajn DNK

Predlog je srednji put: kanali ostaju kao stranice za mere same platforme, a poslovi koji idu preko svih kanala dobijaju svoj dom. To su razgovori (Zajednica), objavljivanje (Objave), merenje (Analitika sa tri jezička) i automatika (jedan ekran Automatizacije). Početni ekran postaje „Danas“. Bočna traka nosi samo module, bez podstavki, a druga ravan je uvek traka jezičaka ispod zaglavlja.

*[crtež u Claude dokumentu: bočna traka sada i predlog · šta gde prelazi]*

Bočna traka ima jedanaest stavki, jednu manje nego danas, ali nijedna nema podstavke. Tri su nove ili spojene: Zajednica, Objave i Automatizacije.

**Pravila navigacije u jednom pasusu:** svaki modul je jedna stavka bočne trake. Svaki ekran modula ima istu traku jezičaka ispod zaglavlja, na istom mestu, bez obzira na to da li je traka skupljena. Svaki jezičak je svoja adresa, a mrvica piše „Modul / Jezičak“ istim rečima kao jezičak. Radnje (Nova objava, Novo pravilo, Uvoz) su dugmad, nikad jezičci. Period se pamti i prenosi, a birač stoji samo tamo gde menja sadržaj. Na telefonu: Danas · Leadovi · Pozovi · Zajednica · Više.

### Ciljni dizajn DNK

Prethodni profil je bio „kontrolna soba u kojoj svaki pult ima svoju lampicu“. Na snimcima se vidi da su lampice upaljene svuda. Cilj je mirniji radni sto, na kom svetli samo ono što traži tebe.

| Dimenzija | Sada (sa snimaka) | Cilj |
| --- | --- | --- |
| Fokus ekrana | Nagrada (XP kartica) ili veliki broj u boji modula | Posao: sledeća firma, prvi upit, red koji čeka |
| Boja mesta | 12 obojenih pločica odjednom; boja modula na naslovu, broju, grafikonu, dugmetu i sjaju | Boja modula samo na aktivnoj stavci i ikonici zaglavlja |
| Boja radnje | Menja se po modulu: roze, crvena, ljubičasta, siva | Jedna boja primarne radnje u celoj aplikaciji |
| Boja stanja | Crvena je i „kasni“ i „Hot“; žuta je i upozorenje i nagrada | Crvena samo za grešku i kašnjenje; zlatna samo u trenutku nagrade |
| Gustina | Kartice svuda; red tabele 80 px | Liste i tabele od 36 do 40 px; kartica samo za ono što se pomera |
| Brojevi | Mono font i za reči | Aeonik sa tabularnim ciframa; mono samo za ID i kod |
| Tipografija | 548 komada teksta od 10 i 11 px; verzal natpis u boji modula na svakoj pločici | 12 / 13 / 15 / 20 / 28 bez izuzetaka; verzal samo za grupe |
| Hijerarhija | 10 pločica iste težine; tri stila brojeva na jednoj strani | Jedan fokus po ekranu (na kanalu traka od tri imenovana broja), ostalo ispod preloma |
| Status | Zelena tačka uvek; greške na dnu, crvenim mono fontom | Jedan status po vezi; traka na vrhu ekrana koji je pogođen |
| Gamifikacija | Najjači vizuelni sloj na tabli; XP čipovi na radnim karticama | Tiha: nedeljni ciljevi i niz; XP posle ture i na strani Napredak |
| Pokret | Brojevi se odbrojavaju, sekcije se otkrivaju pri skrolu | Bez otkrivanja pri skrolu na radnim ekranima; proslava samo za nov nivo i dostignuće |
| Jezik | Srpski uz engleski i sirove API nazive | Srpski svuda, akronim u oblačiću |

Podešavanja ukusa (Taste): raznovrsnost rasporeda ostaje 4, pokret pada sa 4 na 3, a gustina radnih ekrana raste sa 6 na 7. Tamna tema, Aeonik i lucide ostaju.

## Nacrt plana

Redosled je „prvo istina, pa izgled“: prvo ispravke podataka i statusa kojima se ne može verovati, pa temelj sistema, pa prodaja, pa sve ostalo. Plan ima 16 faza u četiri noćna runa. Sve odluke su donete 27. oktobra, pa promptovi mogu da se pišu kad kažeš.

### Faze

1. **U0 · Odluke (sa tobom, bez koda).** Sve su donete 27. oktobra. Upisuju se u PRODUCT.md, DESIGN.md i novi plan.
2. **Prvi run · Istina i temelj**
   1. **U1 · Ispravke podataka u Leadovima** (S): beleška ne dira poslednji kontakt, zabrana za „Tražio da ga ne zovemo“, upit dobija zaduženje, zatvoreni poslovi van zaostalih, radnja „Korak urađen“, automatsko zaduženje.
   2. **U2 · Jedan status i pošteni brojevi** (M): jedan status po vezi za tačku, kanale, Podešavanja i zvono; uslovan baner u kompozeru; „—“ umesto izmišljenih nula i frekvencija; smer „bolje je“ za svaku meru; period koji se pamti; novac u evrima bez preračuna, uz upozorenje ako izvor javi drugu valutu; Pravila sa probom, povratkom i valutom iz naloga; probni podaci prelaze na evre; nacrti Novosti iz baze.
   3. **U3 · Temelj sistema** (M): jedna boja primarne radnje svuda, bez „default“ dugmeta, 44 px na dodir, skala fonta bez 9 do 11 px, kontrast bez providnosti, mono samo za cifre, jedan meni za izbor, jedan format datuma i broja, rečnik (srpski naziv, akronim u oblačiću) i provera koda koja pada na sirove nazive.
3. **Drugi run · Prodaja**
   1. **U4 · Kartica ishoda** (M): posle Pozovi, Kopiraj ili QR pitanje „Kako je prošlo?“; ishod, rok i predložena faza u jednom koraku; Interes umesto Hot/Warm/Cold, postavljen iz ishoda uz ručnu izmenu; na desktopu krupan broj, Kopiraj i QR kod.
   2. **U5 · Jedan red rada** (L): Leadovi → Red, režim poziva kroz ceo red, „Nije se javio“ zakazuje +1, +3 i +7 radnih dana pa odlaže na 60 dana, Ove nedelje i Agenda.
   3. **U6 · Tok i ponuda** (L): kolone po fazi, levak, ponuda kao zapis sa iznosom, datumom slanja, rokom i podsetnikom posle 3 radna dana tišine.
   4. **U7 · Teren na telefonu** (M): mapa preko celog ekrana, „U blizini“, navigacija, kartica ishoda kao list odozdo, dugmad od 44 px.
   5. **U8 · Firme i Podaci** (M–L): tabela od 36 px sa grupnim radnjama, dopuna redom, uvoz sa povezivanjem kolona i grupnim rešavanjem.
4. **Treći run · Danas i ljuska**
   1. **U9 · Početni ekran „Danas“ i Tih napredak** (M): sledeći korak, šta me čeka, pozivi, sastanci i posao iznad preloma; kanali ispod; Napredak bez XP čipova na radnim ekranima.
   2. **U10 · Navigacija** (M–L): bočna traka samo moduli, jezičci kao adrese, preusmeravanje starih adresa, firme u ⌘K, telefon sa jednom trakom gore i jednom dole.
5. **Četvrti run · Kanali, rezultati i automatika**
   1. **U11 · Šablon kanala i Oglasi** (M): isti raspored za četiri kanala, sa tri broja na vrhu (Pratioci, Doseg, Upiti); Threads na adrese, a pretraga sakrivena dok Meta ne odobri; YouTube dugme „Otpremi kao privatan“; Oglasi sa tabelom iznad preloma.
   2. **U12 · Zajednica** (L): jedan red za komentare i poruke, sa vezom ka firmi.
   3. **U13 · Objave** (L): kalendar nedelje i jedan kompozer; Novosti izlaze iz bočne trake i vide se kao traka u kalendaru.
   4. **U14 · Analitika** (L): zbirovi za ceo period; upiti su pozivi iz GA4 plus forme i poruke iz baze; Pregled · Izvori · Sajt; Atribucija ulazi u Izvore.
   5. **U15 · Automatizacije** (L): jedan ekran; nova automatizacija počinje u probi, a „Uživo“ uključuješ ti; zajednička istorija; izbor objave sa sličicama.
   6. **U16 · Podešavanja, Sistem i završno merenje** (M): pet jezičaka, veze kao pločice, vodič pokriva sve obrasce, pa ponovna revizija sa istim merama.

### Kriterijum gotovosti (meri se, ne procenjuje)

| Mera | Danas | Cilj |
| --- | --- | --- |
| Osnovna petlja: poziv, ishod, sledeći korak | 17 do 30 radnji | 3 pritiska |
| Tekst manji od 12 px | 548 komada na tvom ekranu | 0 |
| Dodirne mete manje od 44 px na telefonu | 56 % | ispod 5 % |
| Padovi kontrasta (axe) | 251 | 0 |
| Ekrani bez fokusa i radnje u prvom ekranu | 19 | 0 |
| Isti broj na različitim mestima | razlikuje se | isti broj svuda (proverava skripta) |
| Ocena po oblasti (Nielsen) | 18 do 21 od 40 | najmanje 30 od 40 |
| Najduža strana na tvom ekranu | 8,9 ekrana | najviše 3 ekrana |

### Šta ne ulazi

Višeprojektni sloj (gotov je), ScanMe repo, režim za klijente i nove npm zavisnosti, osim ako ih posebno odobriš.

### Rizici

- Ponuda kao zapis i automatsko zaduženje menjaju šemu baze.
- Zbirovi za ceo period troše više GA4 kvote.
- Stare adrese moraju da preusmeravaju, inače se lome linkovi iz mejlova i zvona.
- U prošlom krugu si tražio više boje i gamifikacije, a ovaj plan ih stišava. Potvrdio si to 27. oktobra (Tih napredak, jedna boja radnje).
- Upiti po kanalu traže da se svaki upit poveže sa kanalom (izvor poruke, UTM oznaka). Dok te veze nema, kanal piše „—“, a ne nulu.

## Tvoje odluke

Ovo su odluke koje menjaju plan. Sve su donete u razgovoru 27. oktobra: većinu si izabrao sam, 11, 12 i 14 slede iz srednjeg puta, a 18, 19 i 20 su po preporuci jer nisi imao stav. Svaku možeš da promeniš ovde, slovom u poslednjoj koloni ili komentarom.

| Pitanje | Opcije | Preporuka | Tvoja odluka |
| --- | --- | --- | --- |
| 1. Šta je početni ekran? | (a) „Danas“: posao i puls posla · (b) aplikacija se otvara na Leadovi → Red · (c) komandni centar sa misijama ostaje | a | a |
| 2. Koliko gamifikacije na radnim ekranima? | (a) Pun, kao sada · (b) Tih: ciljevi i niz na radnim ekranima, XP na strani Napredak · (c) Isključen podrazumevano | b | b |
| 3. Koliko duboko menjamo arhitekturu? | (a) Srednji put: Zajednica, Objave, Analitika sa tri jezička, jedan ekran Automatizacije, kanali ostaju · (b) potpuno po poslovima, bez stranica kanala · (c) arhitektura ostaje, popravke unutar ekrana | a | a |
| 4. Šta je za tebe ponuda? | (a) samo faza · (b) faza, iznos, datum slanja, rok i podsetnik · (c) dokument ili landing koji pravi aplikacija | b sada, c kasnije | b |
| 5. Boja primarne radnje | (a) jedna boja u celoj aplikaciji · (b) boja modula, ali bez crvene i sive · (c) kao sada | a | a |
| 6. Kako zoveš kad sediš za laptopom? | (a) čitam broj i biram na mobilnom · (b) Phone Link ili tel: na laptopu · (c) oba | na desktopu broj, Kopiraj i QR kod | a |
| 7. Sme li faza da prati ishod? | (a) ne, samo ručno · (b) predlog unapred čekiran, uz poništi · (c) potpuno automatski | b | b |
| 8. Šta posle „Nije se javio“? | (a) ništa automatski · (b) 3 pokušaja (+1, +3, +7 radnih dana), pa odloženo 60 dana · (c) ručno svaki put | b | b |
| 9. Temperatura Hot/Warm/Cold | (a) ručna, prevedena u „Interes“ · (b) izvedena iz ishoda, uz ručnu izmenu · (c) ukinuti | b | b |
| 10. Obilaziš li firme uživo? | (a) redovno · (b) retko · (c) ne | od ovoga zavisi koliko ulažemo u mapu na telefonu | a |
| 11. Gde žive razgovori? | (a) Zajednica, jedan red za sve kanale · (b) zvono postaje red sa odgovorom na mestu · (c) ostaje po kanalima | a | a |
| 12. Jedan kalendar objava? | (a) Objave: kalendar i jedan kompozer · (b) samo zajednički kalendar · (c) ostaje po kanalima | a | a |
| 13. Šta se broji kao upit? | (a) samo upiti u bazi · (b) samo GA4 događaji · (c) oba, razdvojeno: pozivi iz GA4, forme i poruke iz baze | c | c |
| 14. Automatizacije i ime OpenReply | (a) jedan ekran „Automatizacije“, OpenReply samo ime motora · (b) svaka automatizacija u svom kanalu · (c) zadržati ime, ako je OpenReply brend za klijente | a | a |
| 15. Jezik metrika | (a) srpski naziv, akronim u oblačiću · (b) akronimi ostaju (CPA, ROAS, CTR) · (c) srpski bez akronima | a | a |
| 16. Valuta | (a) valuta izvora, uvek ispisana · (b) sve u dinarima · (c) sve u evrima | a | c |
| 17. Fokus broj kanala | (a) pratioci ili pretplatnici · (b) doseg za period · (c) upiti iz kanala | c kao cilj, a dok podatak ne postoji | drugo tri broja sa imenima |
| 18. Funkcije koje platforma blokira (Threads pretraga, privatan YouTube) | (a) sakriti dok odobrenje ne stigne · (b) ostaviti uz pošten naziv · (c) ostaviti kako je | a za pretragu, b za YouTube | a pretraga · b YouTube |
| 19. Nova automatizacija | (a) prvo kao proba, „Uživo“ je drugi korak · (b) odmah aktivna, kao sada | a | a |
| 20. Novosti u bočnoj traci | (a) koristiš ih ređe od nedeljno, pa idu u Objave · (b) češće, pa ostaju posebna stavka | a | a |

**Napomene uz odluke**

- **6 · Poziv:** biraš broj na mobilnom. Na desktopu „Pozovi“ ne otvara tel: link, nego pokazuje krupan broj, dugme Kopiraj i QR kod. Na telefonu „Pozovi“ ostaje tel: link.
- **7 · Faza:** ništa se ne menja samo od sebe. Posle klika na Pozovi, Kopiraj ili QR aplikacija pita „Kako je prošlo?“, a ti biraš ishod (1 do 6). Faza je predložena prema ishodu koji si izabrao, na primer „Traži ponudu“ → Ponuda, a ti je potvrđuješ Enterom ili menjaš.
- **9 · Interes:** umesto Hot/Warm/Cold piše Interes: visok, srednji ili nizak. Postavlja ga ishod: Traži ponudu → visok; Zainteresovan i Zovi kasnije → srednji; Nije zainteresovan, Nema potrebe, Preskupo, Konkurencija i Tražio da ga ne zovemo → nizak. Nije se javio, Postojeći klijent i Ostalo ga ne menjaju. Ručno ga menjaš kad znaš bolje, a sledeći ishod ga opet postavlja.
- **10 · Teren:** obilaziš firme redovno, pa mapa na telefonu (U blizini, navigacija, kartica ishoda) ide pre sređivanja tabele.
- **16 · Valuta:** sve u evrima, bez preračuna, jer nalozi za oglase već rade u evrima (i granice budžeta su u kodu podrazumevano u EUR). Aplikacija i dalje piše valutu koju izvor javi: ako neki izvor ikad javi drugu valutu, iznos ostaje u toj valuti uz upozorenje i nikad ne dobija znak €. U probnim podacima nalozi su u dinarima, pa je revizija ranije pogrešno tvrdila da i pravi Meta nalog radi u dinarima; to je ispravljeno.
- **17 · Brojevi kanala:** na vrhu svakog kanala stoje tri broja iste veličine: Pratioci (stanje danas, uz promenu za period), Doseg i Upiti (zbir za izabrani period). Ispod svakog broja piše šta je i za koji period, a klik na broj menja grafikon ispod. Kanal bez dosega pokazuje svoju meru pod pravim imenom (YouTube: Pregledi). Dok aplikacija ne ume da poveže upite sa kanalom, umesto broja stoji „—“ sa razlogom. Crtež je u sekciji Kanali.
- **18, 19 i 20 · po preporuci:** nisi imao stav, pa sam uzeo preporuke; sve tri se lako vraćaju. Threads pretraga se sakriva dok Meta ne odobri pretragu drugih naloga. YouTube dugme glasi „Otpremi kao privatan“, a upozorenje je prvi red dijaloga. Nova automatizacija počinje u probi i samo beleži šta bi uradila; „Uživo“ uključuješ ti. Novosti izlaze iz bočne trake i vide se kao traka u kalendaru Objava, sa svojim uređivačem.
- **Kasnije, van ovog plana:** snimanje razgovora i prepis govora u tekst (speech-to-text), da bi se čuvale skripte razgovora. To traži nov servis i saglasnost sagovornika, pa ide kao zaseban projekat.
