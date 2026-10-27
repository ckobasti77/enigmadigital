# ULTRA — UI/UX ultra boost Enigma Command Center (noćni runovi od 27. 10. 2026.)

> Izvor istine za ULTRA runove. Svaki korak ga čita pre rada. Tehničke planove pišu plan koraci u
> `docs/ultra/planovi/<ID>.md`; ovaj fajl se ne prepisuje, osim sekcije 8 kad počne novi run.
> **Ovaj run:** `ultra1`, grana `ultra1-run` sa `main`, faze **U0–U3 („Istina i temelj“)**, koraci **T01–T14**.

## 0. Šta pravimo, u jednoj rečenici
Enigma Command Center prelazi iz izveštaja organizovanog po alatima u miran radni sto, na kom su brojevi i statusi tačni, a jedan sistem dizajna vodi pogled ka poslu.

Revizija od 27. 10. (62 ekrana, 116 merenja; `docs/ultra/REVIZIJA.md`) daje 18–21 od 40 po Nielsenu u sve četiri oblasti. Put od poziva do ponude puca posle prvog razgovora. Isti broj ima različite vrednosti na različitim ekranima, a status kaže „sve radi“ kad ne radi. Boja, sitan tekst i male dodirne mete prave buku. Plan ima 16 faza u četiri noćna runa, po redu „prvo istina, pa izgled“. **Ovaj run radi prve četiri faze:**
- odluke u dokumentima (U0);
- ispravke podataka u Leadovima (U1);
- jedan status i pošteni brojevi (U2);
- temelj sistema dizajna (U3).

Novi ekrani (Danas, Zajednica, Objave, Automatizacije), nova navigacija i kartica ishoda dolaze u kasnijim runovima i **nisu deo ovog**.

## 1. Odluke (Jovan, 27. 10. 2026.)

| # | Odluka | Faza |
|---|---|---|
| O1 | Početni ekran je „Danas“: posao i puls posla. | U9 |
| O2 | Gamifikacija je „Tiha“: na radnim ekranima ostaju samo nedeljni ciljevi i niz. XP, nivo i dostignuća su na strani Napredak, bez XP čipova na karticama i bez XP poruke posle svake radnje. Napredak nikad ne nosi primarno dugme. | U9 |
| O3 | Arhitektura je „srednji put“: kanali ostaju kao stranice za mere platforme. Poslovi preko svih kanala dobijaju svoj dom: Zajednica, Objave, Analitika sa tri jezička i jedan ekran Automatizacije. | U10–U15 |
| O4 | Ponuda je zapis: faza, iznos, datum slanja, rok i podsetnik. | U6 |
| O5 | **Jedna boja primarne radnje u celoj aplikaciji.** Boja modula kaže „gde si“, a ne „šta da klikneš“. | **U3** |
| O6 | Jovan bira broj na mobilnom. Na desktopu „Pozovi“ ne otvara `tel:` link, nego pokazuje krupan broj, dugme Kopiraj i QR kod. Na telefonu ostaje `tel:` link. | U4 |
| O7 | Faza se nikad ne menja sama. Posle Pozovi, Kopiraj ili QR aplikacija pita „Kako je prošlo?“. Faza je predložena prema ishodu (npr. „Traži ponudu“ → Ponuda), a Jovan je potvrđuje Enterom ili menja. | U4 |
| O8 | Posle „Nije se javio“ idu 3 pokušaja (+1, +3, +7 radnih dana), pa „Odložen 60 dana“. | U5 |
| O9 | Interes (visok, srednji, nizak) zamenjuje Hot/Warm/Cold. Izvodi se iz ishoda, uz ručnu izmenu: <br>• Traži ponudu → visok; <br>• Zainteresovan i Zovi kasnije → srednji; <br>• Nije zainteresovan, Nema potrebe, Preskupo, Konkurencija i Tražio da ga ne zovemo → nizak; <br>• Nije se javio, Postojeći klijent i Ostalo ga ne menjaju. <br>Ručna izmena važi dok je sledeći ishod ne promeni. | U4 |
| O10 | Jovan redovno obilazi firme uživo, pa mapa na telefonu (U blizini, navigacija, kartica ishoda kao list odozdo) ide pre sređivanja tabele. | U7 |
| O11 | Razgovori žive u Zajednici: jedan red za sve kanale, sa vezom ka firmi. | U12 |
| O12 | Objave: kalendar i jedan kompozer. | U13 |
| O13 | Upit se broji iz oba izvora, razdvojeno: pozivi iz GA4, a forme i poruke iz baze. | U14 |
| O14 | Postoji jedan ekran „Automatizacije“; OpenReply ostaje samo ime motora. | U15 |
| O15 | **Jezik mera: srpski naziv, akronim u oblačiću** (npr. „Cena po rezultatu“, oblačić „CPA“). | **U3** |
| O16 | **Valuta: sve u evrima, bez preračuna**, jer nalozi za oglase rade u evrima. Aplikacija i dalje piše valutu koju izvor javi. Ako izvor ikad javi drugu valutu, iznos ostaje u toj valuti uz upozorenje i nikad ne dobija znak €. (Tvrdnje o nalogu „u dinarima“ u reviziji potiču iz probnih podataka.) | **U2** |
| O17 | Brojevi kanala: na vrhu svakog kanala stoje tri broja iste veličine: Pratioci (stanje danas, uz promenu za period), Doseg i Upiti (zbir za period). Ispod svakog piše šta je i za koji period; klik na broj menja grafikon. Kanal bez dosega pokazuje svoju meru pod pravim imenom (YouTube: Pregledi). Dok upiti nisu povezani sa kanalom, stoji „—“ sa razlogom. | U11 |
| O18 | Threads pretraga se sakriva dok Meta ne odobri pretragu drugih naloga. YouTube dugme glasi „Otpremi kao privatan“ (sporedno), a upozorenje je prvi red dijaloga. *(po preporuci)* | U11 |
| O19 | Nova automatizacija počinje u probi i samo beleži šta bi uradila; „Uživo“ uključuje Jovan. *(po preporuci)* | U15 |
| O20 | Novosti izlaze iz bočne trake i vide se kao traka u kalendaru Objava, sa svojim uređivačem. *(po preporuci)* | U13 |
| O21 | Snimanje razgovora i prepis govora u tekst su van ovog plana (zaseban projekat). | — |

**Predlozi (Claude, čekaju potvrdu).** Ovo su izbori koje sam napravio jer odgovor nije postojao. Run ih sledi, a izveštaj ih navodi za potvrdu.

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | Boja radnje je brend cijan (`--accent-400` #58c4ff, tamni tekst), na svakom ekranu ista. `primary` više ne čita `--mod-strong`. | Već je `--primary` van modula i boja fokusa. Nije boja stanja ni nagrade. Kontrast sa tamnim tekstom je visok. | T08/T09: `app/globals.css`, `components/ui/button.tsx` |
| P2 | Mono (`font-mono`) je samo za ID, kod i brojčane kolone tabela. Brojevi u fokusu, na pločicama i u tekstu su Aeonik sa `tabular-nums`. Reči, datumi u rečenici i natpisi nikad nisu mono. | Odluka „mono samo za cifre“ i ciljni DNK. | T10 |
| P3 | Status veze ima tri vrednosti: <br>• **Radi:** povezano, poslednji prolaz uspeo, token ne ističe za 7 dana, podaci mlađi od 24 h. <br>• **Traži pažnju:** istekao ili uskoro ističe token, poslednji prolaz pao, podaci stariji od 24 h, ili server nije podešen. Uvek uz razlog i jednu radnju. <br>• **Nije povezano.** <br>Tačka u gornjoj traci je zelena samo kad sve povezane veze rade, inače žuta sa brojem („1 veza traži pažnju“). Nepovezan kanal nije kvar i ne boji tačku. | Jedan izvor istine za tačku, kanale, Podešavanja i zvono. | T03, T04 |
| P4 | Period se pamti po projektu (lokalno, uz `try/catch`), podrazumevano 28 dana, i prenosi se u linkovima na ekrane koji ga koriste. | „Lepljiv period“ iz revizije; malo i bezbedno. | T06 |
| P5 | Šabloni pravila se ne upisuju sami. „Dodaj iz šablona“ predlaže prag iz stvarnih podataka naloga (2× medijana CPA za 28 dana, zaokruženo); bez podataka polje ostaje prazno i obavezno. Uključivanje pravila koje pauzira prvo pokazuje probu („Sada bi pauziralo: …“) i traži potvrdu. | Novac: prag koji niko nije izabrao ne sme da radi. | T07 |
| P6 | Nove provere koda dobijaju ime `verify:ultra-<oblast>` u `package.json`, a provera `regresije` ih sama uključuje. | Nijedna nova provera ne ostaje van runa. | T09–T12 |
| P7 | Formati: <br>• datum „27. 10. 2026.“, kratko „27. okt“; <br>• vreme „17:41“; <br>• trajanje „42 s“, „1 min 1 s“; <br>• procenat „53,8 %“ (tvrdi razmak); <br>• hiljade tačkom („12.480“). <br>Sve ide kroz `lib/format.ts`. | Jedan format za celu aplikaciju. | T11 |
| P8 | Nove firme dobijaju zaduženje odmah pri nastanku. Postojeće firme bez zaduženja dobijaju ga kroz internu funkciju koju Jovan pušta ujutru, jer run ne dira bazu. | Run ne sme da menja podatke. | T02 |

## 2. Obim
**Ovaj run radi:** U0 (dokumenti), U1 (sekcija 4), U2 (sekcija 5), U3 (sekcija 6).

**Ne diramo u ovom runu:**
- novi ekrani i arhitektura: Danas, Zajednica, Objave, hub Automatizacija, nove Analitika i Atribucija, bočna traka i navigacija, jezičci Leadova;
- kartica ishoda, red rada, Tok i ponuda, mapa (U4–U8);
- prijava i auth tok, deploy, produkcioni i dev podaci, plaćanja, ScanMe repo;
- višeprojektni sloj (gotov je, samo se koristi);
- putanje OAuth povratka (`/api/auth/callback/*`) i pravne strane;
- `marketing-brain/`, `nocni-run/`, `overnight/`, `_to_delete/`, `content/`, `tools/generate-leads/vendor/`.

**Bez novih npm paketa.**

## 3. Ciljni dizajn DNK (od T01 je u CLAUDE.md i DESIGN.md; U3 ga sprovodi u temelju)
Prethodni profil je bio „kontrolna soba u kojoj svaki pult ima svoju lampicu“, i lampice su upaljene svuda. Cilj je **radni sto**: svetli samo ono što traži Jovana.

| Dimenzija | Pravilo |
|---|---|
| Fokus ekrana | Posao: sledeća firma, prvi upit, red koji čeka. Nikad nagrada. |
| Boja mesta | Boja modula samo na aktivnoj stavci bočne trake i ikonici zaglavlja (plus aurora ≤ 10 %). Ne na naslovu, broju, grafikonu, dugmetu ni sjaju. |
| Boja radnje | Jedna boja primarne radnje u celoj aplikaciji (P1). |
| Boja stanja | Crvena samo za grešku i kašnjenje; žuta za upozorenje; zlatna samo u trenutku nagrade. Interes nije boja ivice. |
| Gustina | Liste i tabele sa redovima od 36 do 40 px. Kartica samo za ono što se pomera. Nema kutije u kutiji ni debele leve ivice (ivica je 1 px). |
| Brojevi | Aeonik sa `tabular-nums`; mono samo po P2. |
| Tipografija | Skala 12 / 13 / 15 / 20 / 28, plus `text-hero` (40) samo za jedan fokus broj ekrana. Ništa ispod 12 px. Verzal samo za natpise grupa. |
| Hijerarhija | Jedan fokus po ekranu (na kanalu traka od tri imenovana broja, O17); ostalo ispod preloma. |
| Status | Jedan status po vezi (P3); traka upozorenja na vrhu pogođenog ekrana, sa jednom radnjom. |
| Gamifikacija | Tiha (O2). |
| Pokret | Bez otkrivanja pri skrolu na radnim ekranima; proslava samo za nov nivo i dostignuće; `prefers-reduced-motion` poštovan. |
| Jezik | Srpski svuda, latinica; akronim u oblačiću (O15); bez sirovih API naziva, imena env promenljivih i internih oznaka plana u UI-ju. |
| Dodir | Dodirne mete ≥ 44 px na uređajima sa grubim pokazivačem (`pointer: coarse`). |

Podešavanja ukusa (Taste): raznovrsnost rasporeda 4, pokret 3, gustina radnih ekrana 7. Tamna tema, Aeonik i lucide (stroke 1.75) ostaju.

## 4. Faza U1: ispravke podataka u Leadovima (T02)
Izvor: `docs/ultra/revizija/A1-leadovi.md` §8.7 i §11.1. Svaka ispravka ima test (convex-test).
1. **Beleška nije kontakt.** Beleška se danas upisuje kao dodir i postavlja „poslednji kontakt“ (`lastTouchAt`), pa firma ispada iz reda poziva. Beleška ostaje u istoriji, ali ne menja `lastTouchAt` ni red poziva.
2. **Zabrana za „Tražio da ga ne zovemo“.** Lista izraza koja pokreće predlog zabrane (`ODBIJANJE_IZRAZI` u `convex/leadCrmStore.ts`, oko r. 588–600) traži `trazio_da_ga_ne_zovemo`. Kod ishoda je, međutim, `trazeno_da_se_ne_zove` (`convex/lib/leadOutcomes.ts`). Za taj ishod se predlog zabrane kontakta nudi uvek, jer je to pravni rizik (ZZPL). I dalje se ništa ne zabranjuje bez Jovanove potvrde.
3. **Upit sa sajta dobija zaduženje.** Firma napravljena iz upita (`convex/leadInboundStore.ts`) danas nema `leadAssignments`, pa se ne vidi u Tabeli, na Mapi ni u redu poziva. Zaduženje se pravi istim putem kao kod uvoza.
4. **Svaka nova firma dobija zaduženje,** bilo da dolazi iz uvoza, upita, skilla ili ručnog unosa.
   - Dobija ga član projekta koji ju je napravio.
   - Kad takvog člana nema (sistem, skill), dobija ga vlasnik projekta.
   - Za postojeće firme bez zaduženja postoji interna funkcija (`internalMutation`, u serijama), po P8.
   - U sintetičkim podacima 32 od 210 firmi su zbog ovoga nevidljive.
5. **Zatvoreni poslovi nisu zaostali.** `listOverdue` isključuje faze Dobijen, Izgubljen i Odložen. `setStage` u zatvorenu fazu briše sledeći korak (`nextActionAt`).
6. **„Korak urađen“.** Nova mutacija (npr. `zavrsiKorak`) briše `nextActionAt` i upisuje događaj u istoriju firme. Uz svaki prikazan korak stoji dugme „Urađeno“: na Leadovi → Danas u „Vrati se na“, na jezičku Zaostali i u profilu firme.
7. **Korak se vidi pre nego što zakasni.** „Vrati se na“ prikazuje i korake dogovorene za danas, ne samo zakasnele. Poređani su po vremenu, a zakasneli nose reč „kasni“.
8. **Red poziva ne zove pre dogovora.** „Zovi sada“ (`use-zovi-sada.ts`) isključuje firme koje imaju budući korak, pa ista firma više ne stoji i u „Zovi sada“ i u „Vrati se na“.

## 5. Faza U2: jedan status i pošteni brojevi (plan T03, sprovode T04–T07)
Izvori: `docs/ultra/revizija/A2-…md` §8.4–8.5 i §8.8, `A3-kanali.md` V6 i V8, `A4-analitika-automatizacija.md` V1 i V5, `B-merenja.md` §7.

### 5.1 Jedan status veze (P3) — T04
Postoji jedna izvedena funkcija statusa (čista, sa testovima) i jedan upit ili hook, koje čitaju svi:
- **Tačka u gornjoj traci** (`sync-status.tsx`, r. 18–33): danas po dizajnu nikad nije crvena.
- **Zaglavlje kanala** (`components/app/system/channel-focus.tsx`, `useChannelSync`, oko r. 162): `connected: connection !== undefined` ne gleda `status === "expired"`.
  - Zaglavlje dobija jedan red stanja, npr. „Veza istekla pre 3 dana · podaci od 24. okt · Poveži ponovo“.
  - Segment „Povezan“ izlazi iz merača Spremnosti; Spremnost ostaje samo za ciljeve.
  - Uz fokus broj stoji „podaci od …“ kad je sinhronizacija starija od 24 h.
- **Podešavanja → Integracije** (`connections-settings.tsx`):
  - fokus glasi „7 radi · 1 traži pažnju · Reši: Instagram“;
  - upozorenje „token ističe za N dana“ je danas samo ovde (r. ~1026–1032) i ide i u zaglavlje kanala;
  - „Prekini vezu“ prelazi u meni „⋯“, uz potvrdu.
- **`sync-health-widget.tsx` i zvono** (`convex/lib/notifications.ts`, stavka „istekao_token“) koriste iste reči.
- **Kompozer:** žuti baner o dozvoli za objavljivanje (`publish-composer.tsx`, oko r. 603–605, `SCOPE_NOTICE_TITLE`) se prikazuje samo kad veza stvarno nema tu dozvolu ili je istekla.

Poruke su ljudske, npr. „Instagram je odjavljen pre 3 dana · Poveži ponovo“, a ne „Token je istekao (OAuthException 190)“. Tehnički kod ostaje samo u detaljima u Podešavanjima.

### 5.2 Brojevi koji nisu iz podatka postaju „—“ sa razlogom — T05
Nula se prikazuje samo kad je izmerena nula.
- **Instagram „Pregledi profila 0“** kad podatka nema (`instagram-dashboard.tsx`, `curProfileViews`) postaje „—“.
- **Google kampanje:** `convex/googleAdsStore.ts` (oko r. 2780–2841) upisuje `reach: impressions`, `frequency: 1`, `video3s: 0` i `thruplay: 0`. Ništa se ne izmišlja: polje ostaje prazno, a prikaz je „—“ uz „Google ne meri frekvenciju“. Pre izmene se proveri šta čitaju `verify:gads-*`.
- **„CTR 0,0 %“** za kampanju bez prikazivanja postaje „—“.
- **Retencija:** „u 12 kohorti“ je tvrdo upisano (`retention-dashboard.tsx:156`) i zamenjuje se brojem iz podatka.
- **Threads:** na istom ekranu stoje dva broja pratilaca (fokus i „poslednji snimak“); ostaje jedan.

### 5.3 Smer „bolje je“ i rečnik mera — T05
`lib/mere.ts` je jedan rečnik mera. Za svaku meru beleži:
- ključ;
- srpski naziv i kratak naziv;
- akronim, kad postoji;
- definiciju za oblačić „i“;
- format: broj, novac, procenat ili trajanje;
- smer: `vise`, `manje` ili `neutralno`;
- izvor.

KpiTile i tabele čitaju smer odatle. Rast troška i cene nije zelen: danas jeste (`ads-performance-dashboard.tsx:150–220`, nema `higherIsBetter={false}`). Ovaj rečnik je i osnova jezika mera u U3 (O15).

### 5.4 Valuta (O16) — T05
- Prikazuje se valuta koju izvor javi. `use-account-currency.ts` i `convex/lib/metaAdsFormat.ts` već ne pretpostavljaju valutu i tako ostaje.
- Kad izvor javi valutu različitu od EUR, iznos ostaje u toj valuti, a ekran nosi upozorenje „Nalog radi u RSD; aplikacija ne preračunava.“
- Tvrdo upisan znak € zamenjuje se valutom naloga: `components/app/rules/rule-editor-dialog.tsx:287–290` („CPA (€)“, „Potrošnja (€)“, „CPC (€)“) i `components/app/settings/action-audit-log.tsx:127`.
- Podrazumevana valuta granica budžeta ostaje EUR (`BUDZET_PODRAZUMEVANO`).
- Provera granice budžeta „konverzija po kursu se ne radi“ ostaje kao zaštita, prevedena u ljudsku rečenicu.

### 5.5 Period koji se pamti (P4) — T06
- `lib/rutiranje.ts:92` (`putanjaEkrana`) i `ProjekatLink` ne nose `?range`. Izbor perioda se pamti i prenosi na ekrane koji ga koriste.
- Sekcija koja ima drugi okvir piše ga u naslovu: „Danas“, „Ovaj mesec“, „Poslednjih 28 dana“.
- Jezičci Podešavanja (`app/(app)/[projekat]/settings/page.tsx:144`, `router.replace`) menjaju samo svoj parametar. Danas brišu ceo upit adrese, pa se gube `?ux=1` i povratni parametri OAuth-a.
- Na telefonu je birač perioda jedna kompaktna kontrola („28 d ▾“), pa se gornja traka ne prelama. Danas je visoka 147–192 px.

### 5.6 Pravila: bez samoupisa, sa probom i povratkom (P5) — T07
Izvori u kodu:
- `convex/rulesStore.ts:41–75`: šabloni sa pragom 15 i 100;
- `components/app/rules/rules-dashboard.tsx:59–65`: samoupis šablona pri prvoj poseti;
- `rule-editor-dialog.tsx`;
- `convex/rules.ts`: evaluator samo za Meta oglase; link iz mejla je `/ads?campaignId=…` (r. ~247).

Šta se menja:
1. Šabloni se ne upisuju sami (P5).
2. Pravilo koje pauzira uključuje se tek posle probe: „Sada bi pauziralo: N kampanja“ (naziv, vrednost, prag) i potvrde.
3. Kartica pokazuje vrednost prema pragu, npr. „sada najbliža pragu: 6,43 €, 43 % praga“.
4. Istorija dobija „Vrati kampanju“ (uz potvrdu) i „Otvori“.
   - „Vrati kampanju“ koristi postojeći put za promenu statusa kampanje, sa istim zaštitama (`ADS_WRITE_ENABLED`, granice).
   - Ako takav put ne postoji, ostaje samo „Otvori“, a za ostatak ide BLOKADA.
5. Natpis „Čuva samo Meta oglase“.
6. Pravila imaju jedno ime: „Pravilo“, a ne „čuvar“ ili „Guard“.
7. Urednik koristi iste kontrole kao kartica: shadcn `Switch`, bez izvornih `<select>`.

### 5.7 Novosti: nacrti iz baze — T06
- Spisak nacrta (`components/app/novosti/novosti-dashboard.tsx:23–51`) čita se iz Convex upita.
- Pregledač (`localStorage`) čuva samo nesačuvan unos u uredniku.
- Kartica nacrta piše šta fali do objave, npr. „Fali: opis slike, podnaslov“.
- Žargon se menja: „četiri kapije“ i „provera humanizera“ postaju „Pre objave: dokaz, prirodan ton, opis slike, podnaslov“.

### 5.8 Probni podaci — T05 i T04
- Razvojni prikaz (`app/dev-ux/fixtures-*.ts`) prelazi na EUR.
- Dobija i primere stanja veze: jedna radi, jedna je istekla, jedna uskoro ističe i jedna sa palim prolazom.

## 6. Faza U3: temelj sistema (plan T08, sprovode T09–T12)
Izvori: `docs/ultra/revizija/B-merenja.md` §7, `docs/ultra/REVIZIJA.md` „Globalni UI problemi“, `A2-…md` §8.9.

### 6.1 Boja radnje i uloge dugmeta (O5, P1) — T09
- `components/ui/button.tsx` ima uloge:
  - **primarno:** puna boja radnje, jedno po pogledu;
  - **sporedno:** neutralna podloga, bez boje modula;
  - **obris**;
  - **tiho**;
  - **opasno:** uvek uz potvrdu;
  - **veza:** u boji radnje.
- `default` se ukida. Dugmad koja danas imaju `default` (oko 77 punih dugmadi bez uloge) dobijaju ulogu: `primary` kad su jedina glavna radnja pogleda, inače `secondary` ili `outline`.
- Pravilo „Button mora imati ulogu“ proverava se u kodu (P6).
- Boja modula izlazi sa dugmadi, sa brojeva u fokusu (FocusCard, KpiTile) i sa natpisa pločica. Ostaje na aktivnoj stavci bočne trake, na ikonici zaglavlja i u auri.
- Prekidači (`Switch`) su u boji radnje: danas su u sivoj boji modula, pa „Uključeno“ izgleda kao isključeno.
- Vodič `/sistem?ux=1` pokazuje nove uloge, bez matrice od 455 dugmadi i bez primera sa dva primarna dugmeta.

### 6.2 Dodirne mete — T09
- Uzrok je u kodu: dugmad su visoka 24, 28 i 32 px (`xs` 65×, `sm` 409× od 536 upotreba), a `.touch-target` (`globals.css:965`) je dodat ručno samo 84×.
- Najmanje 44 px pod `pointer: coarse` ide u osnovu primitiva:
  - Button (sve veličine);
  - jezičci (Tabs/ToggleGroup);
  - okidač menija za izbor;
  - Switch i Checkbox (bar zona dodira);
  - Chip sa `onClick`;
  - naslovni link kartice (`WorkCard`).
- Na desktopu se veličine ne menjaju.

### 6.3 Tipografija — T10
- Uklanja se 88 doslovnih `text-[9px|10px|11px]` u 28 fajlova.
- `tick={{ fontSize: 11 }}`, ponovljen 14 puta u šest Recharts fajlova, ide na 12.
- Bedž broja `h-4 min-w-4 px-1 text-[10px]`, kopiran na 5 mesta, postaje jedna komponenta od 12 px.
- SVG tekst koji se na telefonu smanjuje kroz `viewBox` (Analitika → Oglasi, Retencija) dobija fiksnu veličinu.
- Komentar u `globals.css` („Ništa … nije 11 px“) postaje istinit.

### 6.4 Kontrast — T10
- Na tekstu nema providnosti: nema `text-*/NN` ni `opacity-*`. Koriste se puni tokeni (`text-secondary` …).
- Najgori izmereni slučajevi:
  - `text-text-muted/60` (2,77:1);
  - `opacity-80` na brojevima u čipovima (3,69:1);
  - prigušen tekst na `-soft` podlogama stanja (4,33:1);
  - tekst outline dugmeta na `input/30` (3,87–4,17:1);
  - temperatura na sopstvenoj podlozi (4,01–4,12:1).
- `scripts/contrast-check.mjs` dobija nove parove: `text-muted` × svaka `-soft` podloga, `temp-*` × `temp-*-bg` i tekst outline dugmeta × njegova podloga.

### 6.5 Mono (P2) — T10
- `font-mono` izlazi sa reči, datuma u rečenici i natpisa (npr. „za 24 h“, „evidentirano 30.09.2026. 17:41“, „Vremenska zona propertija“).
- KpiTile, FocusCard i fokus brojevi su Aeonik sa `tabular-nums`.

### 6.6 Jedan meni za izbor — T11
- 39 izvornih `<select>` prelazi na jednu komponentu `components/ui/select.tsx`.
  - Pravi se nad `@base-ui/react`, po uzoru na ostale primitive, bez novih paketa.
  - Svaka upotreba ima natpis ili `aria-label`.
  - axe je u pregledu uvoza našao 50 neimenovanih po strani (`import-review-table.tsx:1362`, `:1387`).
- Prilagođen period dobija srpski format i prečice „ovaj mesec“ i „prošli mesec“. Danas izvorna polja pokazuju „09/30/202“.

### 6.7 Formati (P7) — T11
- `lib/format.ts` je jedini formatar. Danas postoje četiri formata datuma, tri zapisa trajanja i „53,8%“ bez razmaka.
- Nema rasutih `toLocaleString` i `Intl.*` u `components/app/`.

### 6.8 Rečnik i sirovi nazivi (O15) — T12
- `lib/recnik.ts` je jedan rečnik UI pojmova. Spisak je u `docs/ultra/REVIZIJA.md` → „Rečnik: najvidljivije zamene“, u `A3-kanali.md` §6.4 i u `A4-…md` §6. Primeri:
  - TEXT_POST → Tekst;
  - ADDED_PHOTOS → Slika;
  - Ad set → Grupa oglasa;
  - Hook Rate → Zadržavanje prve 3 s;
  - Cooldown → Pauza za istu osobu;
  - Ledolomci → Početna pitanja;
  - „jedinice kvote“ → „Danas još oko N odgovora“.
- Nazive mera daje `lib/mere.ts`. Komponenta za meru prikazuje srpski naziv, a akronim stoji u oblačiću koji radi i na dodir.
- Sa ekrana za vlasnika uklanja se:
  - sirove API vrednosti: FOURTEEN_MONTHS, ONCE_PER_EVENT, BEAUTY_AND_FITNESS, „Status: ACTIVE“ (`ads/campaigns-table.tsx:419`, `ads/campaign-detail.tsx:320`);
  - „OAuthException 190“;
  - imena env promenljivih (IG_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET, ADS_WRITE_ENABLED, RESEND_API_KEY, INSTAGRAM_APP_ID, OAUTH_CALLBACK_ORIGIN). Umesto njih ide ljudska rečenica i „Kopiraj uputstvo za programera“;
  - interna oznaka „Dodatak A.2“.
- „⌘K“ na Windowsu postaje „Ctrl K“.
- Naslovi idu u rečeničnom obliku, ne u Title Case.

### 6.9 Provere u kodu (P6) — T09–T12
U `package.json` dolaze ove provere; svaka ima i mali test sopstvene logike.
- `verify:ultra-dugmad`: nema `variant="default"` ni Button bez uloge.
- `verify:ultra-tipografija`: nema veličina ispod 12 px u klasama i Recharts osama.
- `verify:ultra-kontrast`: pokreće proširen `contrast-check` i statički pada na providnost teksta.
- `verify:ultra-recnik`: pada kad se u JSX tekstu ili prikazanom stringu pojavi sirov naziv iz obrasca (SCREAMING_SNAKE sa donjom crtom, OAuthException, poznata env imena, „Dodatak X.“), uz listu izuzetaka za kod koji se ne prikazuje.
- `verify:ultra-format`, ako T11 to stigne.

## 7. Tehnika i granice
- **Nov kod:** primitivi u `components/ui/`; komponente aplikacije u `components/app/`; čiste funkcije u `lib/` (`lib/mere.ts`, `lib/recnik.ts`, `lib/format.ts`, funkcija statusa veze); backend u `convex/`. Nove provere idu u `scripts/` kao `.ts` ili `.mjs` sa `verify:ultra-*` u `package.json`.
- **Testovi:** `npx vitest run`.
  - Convex testovi su `convex/**/*.test.ts` sa `convex-test` (okruženje `edge-runtime`).
  - Čiste funkcije imaju testove u `lib/**/*.test.ts` (okruženje `node`).
  - Uzor su postojeći testovi.
- **Razvojni prikaz:** `?ux=1` sa lažnim Convex-om (`app/dev-ux/`). Svaka nova komponenta ili stanje mora da se vidi tamo, sa fiksturama.
- **Paketi:** nema novih.
- **Pristupačnost:** WCAG AA. Boja nikad nije jedini nosilac značenja. Fokus je vidljiv, a tastatura radi svuda.
- **Telefon:** 390×844, bez vodoravnog klizanja strane.
- **Referentni prikazi:** 1536×695 (Jovanov ekran), 1440×900 i 390×844. Fokus i primarno dugme staju iznad preloma na 1536×695.
- **Ne dirati:** spisak iz sekcije 2 i pravila iz `.nocni-run/ultra1/rules.md`.

## 8. Koraci (run 1)
Tačne vrednosti su u `.nocni-run/ultra1/steps.json`; prompt svakog koraka je u `.nocni-run/ultra1/prompts/<ID>.md`.

| ID | Naslov | Faza | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|---|
| T01 | Odluke u PRODUCT.md, DESIGN.md i CLAUDE.md | U0 | Opus | high | goal | nova |
| T02 | Leadovi: ispravke podataka u petlji | U1 | Opus | xhigh | goal | nova |
| T03 | Plan: jedan status i pošteni brojevi | U2 | Opus | high | plan | nova |
| T04 | Jedan status veze svuda i uslovan baner | U2 | Opus | xhigh | goal | ista (T03) |
| T05 | Pošteni brojevi: „—“, smer, valuta, probni podaci | U2 | Opus | xhigh | goal | nova |
| T06 | Period koji se pamti, adresa u jezičcima, nacrti Novosti | U2 | Opus | high | goal | nova |
| T07 | Pravila: bez samoupisa, proba, Vrati kampanju | U2 | Opus | xhigh | goal | nova |
| T08 | Plan: temelj sistema | U3 | Opus | max | plan | nova |
| T09 | Boja radnje, uloge dugmeta, 44 px na dodir | U3 | Opus | xhigh | goal | ista (T08) |
| T10 | Tipografija, kontrast i mono | U3 | Opus | high | goal | nova |
| T11 | Jedan meni za izbor i jedan format | U3 | Sonnet | high | goal | nova |
| T12 | Rečnik i provera sirovih naziva | U3 | Opus | high | goal | nova |
| T13 | Revizija runa | — | Opus | max | goal | nova |
| T14 | Završni izveštaj i merenje | — | Opus | high | auto | nova |

## 9. Kriterijum gotovosti i polazne mere
Merenje: `.nocni-run/ultra1/merenje.cjs` nad razvojnim prikazom; to je isti alat kojim je rađena revizija, bez axe-a.

| Mera | Pre runa (27. 10.) | Cilj posle U3 | Cilj celog plana |
|---|---|---|---|
| Tekst manji od 12 px (1536×695, 60 ekrana) | 548 od 10.345 čvorova | 0 | 0 |
| Dodirne mete < 44 px na 390×844 | 1.095 od 1.946 (56 %) | ispod 10 % | ispod 5 % |
| Dugmad sa `data-variant="default"` | oko 77 | 0 | 0 |
| Primarno dugme u boji modula | svuda | nigde | nigde |
| Padovi kontrasta (axe) | 251 | meri Claude ujutru | 0 |
| Ekrani bez fokusa i radnje u prvom ekranu | 19 | — | 0 |
| Isti broj na različitim mestima | razlikuje se | status veze i smer mera isti svuda | isti broj svuda |
| Osnovna petlja poziv → ishod → korak | 17–30 radnji | — | 3 pritiska |

## 10. Kasnije faze (samo za kontekst, NE raditi u ovom runu)
- **Run 2 · Prodaja:**
  - U4 kartica ishoda (O6, O7, O9);
  - U5 jedan red rada (O8);
  - U6 Tok i ponuda (O4);
  - U7 teren na telefonu (O10);
  - U8 Firme i Podaci.
- **Run 3 · Danas i ljuska:**
  - U9 „Danas“ i Tih napredak (O1, O2);
  - U10 navigacija (bočna traka samo moduli, jezičci kao adrese, firme u ⌘K).
- **Run 4 · Kanali, rezultati i automatika:**
  - U11 šablon kanala i Oglasi (O17, O18);
  - U12 Zajednica (O11);
  - U13 Objave (O12, O20);
  - U14 Analitika (O13);
  - U15 Automatizacije (O14, O19);
  - U16 Podešavanja, Sistem i završno merenje.

## 11. Kraj runa
- `docs/ULTRA1-REPORT.md` sadrži:
  - šta je urađeno i šta nije;
  - BLOKADE;
  - predloge P1–P8 za potvrdu;
  - šta Jovan proverava ručno;
  - korake za deploy;
  - merenje pre i posle.
- Merenja idu u `docs/ultra/merenja/T14-*.json` i `.md`; snimci u `docs/ultra/snimci/<ID>-*.png`.
- Ništa se ne gura na GitHub i ništa se ne pušta na produkciju.

## 12. Gde je šta
- `docs/ultra/REVIZIJA.md`: ceo nalaz revizije, predlozi po ekranima i ciljni kanvasi rečima.
- `docs/ultra/revizija/`: pet detaljnih izveštaja sa putanjama i redovima koda:
  - A1 Leadovi;
  - A2 Tabla, ljuska, Napredak, Novosti i Podešavanja;
  - A3 Kanali;
  - A4 Analitika i automatizacija;
  - B merenja.
- `docs/ultra/planovi/`: planovi koraka T03 i T08.
- `docs/ULTRA1-PROGRESS.md`: šta je koji korak uradio, sa ODLUKAMA i BLOKADAMA.
