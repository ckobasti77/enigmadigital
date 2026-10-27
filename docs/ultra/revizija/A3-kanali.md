# A3 — Kanali (Instagram, Facebook, YouTube, Threads, Oglasi) — revizija

> **Napomena za noćne runove (27. 10. 2026.):** ovo je revizija napravljena pre ULTRA runova. Putanje `ED/…` znače koren ovog repoa; `AUDIT/…` i snimci `nocni-run/ux/bx-*.jpg` nisu u repou. Brojevi su iz sintetičkih podataka razvojnog prikaza (`?ux=1`). Valuta: pravi nalozi za oglase rade u evrima (odluka O16 u `docs/ULTRA-PLAN.md`); tvrdnje o nalogu „u dinarima“ potiču iz probnih podataka. Odluke, obim i redosled važe iz `docs/ULTRA-PLAN.md`, a ne iz pitanja i preporuka u ovom izveštaju.


Obim: 15 ekrana (IG Pregled, Nova objava, Publika, Priče, Inbox, Komentari, Detalj objave; FB Pregled, Komentari; YT Pregled (+dijalog „Pošalji video“), Automatizacije; Threads (5 jezičaka); Oglasi Pregled (+detalj kampanje), Nova kampanja, Publike).
Snimci: `ED/nocni-run/ux/bx-<ekran>-*.jpg`; moji isečci i dodatni snimci u `AUDIT/shots/A3/` (ig-inbox/publika/stories/objava-detalj/objavi-390/inbox-390, threads-moderacija/automatizacije/pretraga/objavi-390, yt-upload-dialog, oglasi-kampanja-detalj, fb-komentari-390).
Napomena o fiksturama: IG Komentari, Inbox, Publika, Priče i Detalj objave nemaju sintetičke podatke (crta se skelet), pa su ocenjeni iz koda. Delta pilule (prethodni period) se u snimcima ne vide zbog fikstura; kod ih računa za IG, FB, YT i Oglase (`deltaPct`), a za Threads ih kod ne računa uopšte.

## 0. Presuda specifičnosti

Polovično autorski. Merač „Spremnost kanala“ (`lib/channel-readiness.ts`, „nepoznato ≠ neispunjeno“), Misija za start na nepovezanom kanalu i red „Objavljuješ kao @nalog · projekat“ su ideje koje pripadaju baš ovom proizvodu. Sve ispod fokus kartice je zamenljiv šablon analitičkog panela (pločice → grafikon → Top 3 → ista mreža još jednom), a Threads kompozer, Threads pretraga, CAPI odeljak i YouTube kvota su konzole API-ja prevedene napola. Najveći promašaj specifičnosti: kanali agencije postoje da dovedu klijente, a nijedan ekran kanala ne vezuje razgovor (komentar, DM) sa Leadovima.

## 1. Nielsen

| # | heuristika | ocena 0–4 | ključni problem |
|---|---|---|---|
| 1 | Vidljivost stanja sistema | 2 | Istekao token piše „Povezan ✓“ (`useChannelSync` u `system/channel-focus.tsx`: `connected: connection !== undefined`, `status === "expired"` se ne gleda), dok zvono za istu vezu ima stavku „istekao_token“. Brojevi od pre 3 dana nemaju oznaku starosti. Baner „ponovo poveži Instagram“ u kompozeru gori uvek. |
| 2 | Podudaranje sa stvarnim svetom | 1 | Sirovi API nazivi na površini: `TEXT_POST`, `CAROUSEL_ALBUM`, `ADDED_PHOTOS`, `MOBILE_STATUS_UPDATE`, `instagram_business_content_publish`, `(reply_control)`, `threads_keyword_search`, `threadsClicks`, „jedinice kvote“, Sales/Traffic/PMax, Ad set, Hook/Hold, CAPI, PII. |
| 3 | Kontrola i sloboda | 2 | Threads jezičci (`useState` u `threads-dashboard.tsx`) i detalj kampanje (`selectedCampaignId` u `ads-dashboard.tsx`) nisu u adresi: Nazad izbacuje iz modula, osveženje gubi mesto, link se ne može poslati. Brisanja imaju potvrdu, zakazano se otkazuje. |
| 4 | Doslednost i standardi | 1 | Pet pregleda kanala, pet rasporeda (tabela u §6.1); tri obrasca podnavigacije; četiri sistema natpisa tipa objave; četiri formata datuma; IG i FB moderacija su dve kopije koda koje se razilaze; primarno dugme na Threads-u je sivo. |
| 5 | Sprečavanje grešaka | 3 | IG kompozer proverava fajl, odnos stranica, broj, termin. Kampanja se pravi pauzirana. YouTube kaže cenu radnje pre klika. Slabo: dnevni budžet podrazumevano „20“ (RSD) bez minimuma (`new-campaign-wizard.tsx:309`). |
| 6 | Prepoznavanje umesto pamćenja | 2 | Bedž „— 5,4 %“ na svakoj kartici nema natpis (značenje samo u `title` oblačiću `EngagementBadge`). Uz to „(3 v)“, „IS: 62,0 %“ i ikonice sa brojem u podnožju kartica. Za Threads odgovore moraš znati na kojoj objavi su. |
| 7 | Fleksibilnost i efikasnost | 2 | Nema jednog reda za odgovaranje, nema prečica (j/k/r). ⌘K ima samo „Nova objava“ (IG) i „Nova kampanja“. Grupno sakrivanje i brisanje komentara postoji. |
| 8 | Estetika i minimalizam | 2 | Top 3 i „Sve objave“ ponavljaju iste kartice. Tekstualne objave dobijaju praznu sličicu od ~250 px. Na ekranu stoje trajne napomene za programera („Šta panel ne radi i zašto“). Na telefonu je kanal visok 6–7,5 hiljada px. |
| 9 | Prepoznavanje i oporavak od grešaka | 3 | Dnevnici poslova imaju razlog i „Pokušaj ponovo“. Ali pad sinhronizacije ne kaže uzrok („Poslednji prolaz nije uspeo“), a ručno osvežavanje priča pada tiho (`console.error`, `instagram-stories.tsx`). |
| 10 | Pomoć i dokumentacija | 2 | „i“ oblačići postoje, ali objašnjenja su pisana za programera (Graph API, App Review, Advanced Access, kontejner) i stoje na ekranu stalno. |

**Ukupno 20/40** (opseg 18–23): „prihvatljivo“, donja granica. P0 nema; P1 ima 19 (od toga 2 međumodulna).

## 2. Kognitivno opterećenje

Stavke: 1 jedan fokus · 2 grupe ≤ 4 · 3 grupisanje · 4 hijerarhija · 5 jedna stvar u trenutku · 6 ≤ 4 izbora · 7 radna memorija · 8 postepeno otkrivanje.

| Ekran | Pada | Koje |
|---|---|---|
| IG Pregled | 2/8 | 6 (6 podstavki + 3 perioda + izbor od 14 mera), 7 (broj komentara koji čekaju i DM-ovi se ne vide, mora se pamtiti/otvarati) |
| IG Nova objava | 2/8 | 1 (žuti baner i kvota se takmiče sa formom), 7 (red zakazanih je ispod forme) |
| FB Pregled | 3/8 | 1 (primarno su komentari, fokus su pratioci), 6 (po 5–6 radnji na svakoj od 10 kartica), 8 (svi komentari i sve objave razvijeni) |
| YT Pregled | 4/8 | 5 (pošalji, izmeni, titlovi, dnevnik i izvori na istom ekranu), 6 (3 dugmeta × 9 kartica), 8, 2 (izvori 8 redova + 3 + 6 kartica + dnevnik) |
| Threads Pregled | 6/8 | 1, 2 (5 + 4 pločice, mešaju period i „kumulativno“), 4 (sve ispod fokusa iste težine), 6 (5 jezičaka, 4 sortiranja), 7 (period naspram „kumulativno na nalogu“), 8 (demografija, atribucija i nespojeni linkovi stalno otvoreni) |
| Threads Objavljivanje | 5/8 | 2, 5, 6, 8, 7 (bajtovi, ISO kodovi, Media ID) |
| Oglasi Pregled | 4/8 | 2 (red kampanje nosi 6 čipova), 4, 6, 7 (CPA, ROAS, CTR, IS, „(3 v)“ moraš znati napamet) |
| Oglasi Publike | 4/8 | 1, 3 (CAPI nema veze sa publikama), 4 (dva narandžasta dugmeta), 6 (4 dugmeta + 4 filtera + pretraga) |
| IG/FB Komentari | 1/8 | 7 (tip objave kao `ADDED_PHOTOS`) |
| YT Automatizacije | 2/8 | 7 (jedinice kvote), 6 (prekidač + 2 načina poklapanja + dva tipa) |

Tačke odluke sa više od 4 opcije:
- Threads `TabNav`: 5 jezičaka.
- Threads kompozer: oko 13 odluka odjednom (tip ×4, auto-objava, link, anketa, `reply_control`, tema, citat, države, 3 prekidača, termin).
- IG podnavigacija: 6 stavki.
- IG „Metrika“: 14 opcija.
- Threads sortiranje: 4.
- Kartica na FB pregledu: Pogledaj/Otvori, komentari ▾, Lajkuj kao stranica, sort.
- YT kartica: Pogledaj na YouTube-u, Izmeni, Titlovi (×9).
- Red kampanje: pauza, trend, „N setova ›“, plus 7 kolona za sortiranje.
- Publike zaglavlje: 4 dugmeta.
- Nova kampanja: Cilj 5 + 6 posebnih kategorija.
- Threads odgovor na čekanju: Odobri, Ignoriši, Sakrij, Odgovori, Obriši (5).

## 3. Emocionalno putovanje

- **Vrh**: IG/FB fokus kartica (veliki roze ili plavi broj, merač 3/4 sa jasnim „3 komentara čekaju odgovor“). YT „Svi uslovi su ispunjeni“. IG kompozer sa pregledom i rečenicom „Objavljuješ kao @nalog · Enigma IT“ daje sigurnost.
- **Doline**:
  1. Otvoriš „Nova objava“ i prvo te dočeka žuto „potrebno je ponovo povezati Instagram … opseg instagram_business_content_publish … token“, i kad je sve u redu.
  2. FB komentari: uz svaki komentar `ADDED_PHOTOS` / `MOBILE_STATUS_UPDATE`.
  3. Threads Objavljivanje: zid API polja.
  4. YouTube: primarno dugme „Pošalji video“ pravi video koji „ostaje PRIVATAN dok Google ne odobri aplikaciju“. Upozorenje je na dnu dijaloga, posle popunjene forme.
  5. Threads „Pretraga i otkrivanje“ pretražuje samo tvoje objave.
  6. Oglasi: „Sales · Hot · IS: 62,0 % · read-only · 2 setova“.
- **Kraj**: svaki pregled se završava duplikatom mreže, dnevnikom, pravnim podnožjem (YT) ili listom „Šta panel ne radi i zašto“ (IG). Nema završnog „gotovo“ trenutka: posle odgovora ili objave ekran ne kaže „čeka te još N“.

## 4. Šta valja i treba zadržati

1. **ChannelFocus + Spremnost kanala** (`system/channel-focus.tsx`, `lib/channel-readiness.ts`): broj iz podatka, uslovi bez izmišljanja („YouTube i Threads nemaju podatak o komentarima, pa im je imenilac 3“), jedan sledeći korak. Zadržati, ali razdvojiti zdravlje veze od ciljeva (V6).
2. **Misija za start** na nepovezanom kanalu (3 koraka + jedno „Poveži …“) umesto zida nula. Važi za svih pet pregleda.
3. **IG kompozer** (`publish-composer.tsx`): pregled uživo, provera fajla po tipu, „Dodatno“ sakriveno, termin po beogradskom vremenu, rečenica o nepovratnosti, „Objavljuješ kao“. Ovo je uzor za jedinstveni kompozer (V2).
4. **Dnevnici sa razlogom**: YT „Poslednje radnje“ („Sličica je veća od 2 MB“, „Medijska kvota za danas je potrošena“), Threads red sa „Pokušaj ponovo“, CAPI „Razlog odbijanja“. YT prevod kvote u radnju („još oko 33 automatska odgovora“) je pravi obrazac za svaku kvotu.

## 5. Po ekranu

### Instagram · Pregled — `/instagram` — snimci: `bx-instagram-1536x695.jpg` (A3: `instagram-1536x695-vp.jpg`, `-00`), `bx-instagram-390x844.jpg`, `bx-instagram-prazno-*.jpg`
- **Posao**: kako nalog stoji i šta sledeće (objavi, odgovori). **Delimično**: pratioci i merač da; „šta čeka odgovor“ ne.
- UI:
  - [P1] „Pregledi profila **0**“ sa ravnom linijom kad podatka nema — `instagram-dashboard.tsx` (`curProfileViews`: `if (!profileViewsCurrent) return 0`; komentar „prazan skup ostaje 0“). → `value={undefined}`, „—“ i razlog „Meta nije poslala preglede profila za ovaj period“.
  - [P2] Glavni grafikon je u `--chart-1` (#1c9dd6, ton Kontrolne table), sparklinije u roze `--mod`. Na FB i YT su stubići u `--chart-2` (#d95926, skoro boja Oglasa #f59740). Boja grafikona kaže „drugi modul“. → Prva serija kanala u `--mod`, druga neutralna (`--text-muted`); `chart-2` ne koristiti na ekranima kanala.
  - [P2] Spremnost „1 / 4“ se crta kao traka napretka u boji modula. Pokvarena veza i „nisi objavio 7 dana“ izgledaju isto (prazan segment). → V6.
  - [P2] Native `<select>` „Metrika“ (14 opcija, `metric-explorer.tsx:280`) stoji kao poseban red iznad grafikona. → Segment sa 4 mere (Pratioci, Doseg, Interakcije, Pregledi profila) + „Još ▾“ u zaglavlju kartice grafikona.
  - [P3] Bedž tipa `POST`/`REEL`/`CAROUSEL` je engleski verzal (`TypeBadge`, `instagram-content-grid.tsx:72`); `VIDEO` se pogrešno mapira u `REEL` (`post-media.tsx:20`).
  - Telefon [P2]: birač perioda u dva reda (~120 px) pre naslova; podnaslov odsečen „Pratioci, doseg i angažo…“; pločice „PROFIL“, „INTERAKCIJE“, „ANGAŽOVANI“ skraćene.
- UX:
  - [P1] Komentari i DM-ovi koji čekaju se ne vide. `igCommentsStore.filterCounts` se čita (unanswered = 3), ali se broj pokaže samo kao siv krug „Komentari odgovoreni“. Dugme „Odgovori na komentare“ dolazi samo ako su komentari **prvi** neispunjen uslov (`readiness.next`); na snimku je prvi „sync“, pa se nudi „Otvori podešavanja“. Nepročitane DM-ove (`orConversations`, koje zvono već broji) pregled ne čita uopšte. → Traka „Čeka te“ u fokus redu (V3).
  - [P1] Istekao token se crta kao „Povezan ✓“, a pod njim „Poslednji prolaz nije uspeo; poslednji uspešan pre 3 d.“ + „Otvori podešavanja“ (opšta strana, bez sidra ka Instagramu). → V6.
  - [P2] Zakazane objave se ne vide na pregledu (red je na `/instagram/objavi`, ispod forme).
  - [P2] „Top sadržaj“ (3 po dosegu) pa „Sve objave“: iste kartice dva puta, Top 3 zauzima ~600 px.
- **Nema smisla**: brojevi u pločicama posle pada sinhronizacije nemaju oznaku starosti, a merač u istoj kartici kaže da je poslednji uspeh pre 3 dana.
- **Ciljni kanvas 1536×695** (šablon za sve kanale, V3):
```
 64 ┌[IG] Instagram  @enigma.it · ● sinhronizovano pre 2 h             [+ Nova objava]┐
130 ├ FOKUS (8/12) ─────────────────────────────┬ ČEKA TE (4/12) ─────────────────────┤
    │ PRATIOCI 2.555  ▲ +3,0 % vs 28 d           │ 3 komentara bez odgovora        →   │
    │ ▁▂▂▃▄▅▅▆ (30 d, --mod)                      │ 2 poruke · rok ističe za 5 h    →   │
    │ Doseg 17.124 ▲ · Interakcije 1.533 ▲ ·     │ Sutra 10:00: 1 zakazana objava  →   │
    │ Stopa angažovanja 5,4 %                    │ Poslednja objava pre 9 d (upoz.)    │
330 ├───────────────────────────────────────────┴─────────────────────────────────────┤
    │ OBJAVE · 30 d   [Najbolje ▾] [Sve|Reels|Objave|Albumi]          Sve objave →     │
    │ [kartica 180 px][…][…][…][…][…]  (slika, doseg, stopa sa natpisom, datum)        │
695 └ prelom — ispod: grafikon sa izborom mere · Publika ukratko · aktivne Priče ──────┘
```
  Telefon: zaglavlje sa „+“ ikonicom-dugmetom (44 px); fokus broj + „Čeka te“ kao tri reda sa strelicom; objave kao vodoravna traka kartica; period u meniju „⋯“ umesto dva reda iznad svega.

### Instagram · Nova objava — `/instagram/objavi` — snimci: `AUDIT/shots/test-ig-objavi-1536.jpg`, A3: `ig-objavi-1536(-00,-01).jpg`, `ig-objavi-390(-00,-01).jpg`
- **Posao**: objaviti ili zakazati sliku, Reel, priču ili album. **Da**, uz najbolju validaciju u aplikaciji. Ekran počinje lažnom uzbunom i krije red zakazanih.
- UI:
  - [P1] Žuti baner „Za objavljivanje je potrebno ponovo povezati Instagram — Objavljivanje traži opseg instagram_business_content_publish, koji token dobijen pre ove verzije nema…“ je **bezuslovan** (`publish-composer.tsx` ~r. 603: `FeedbackNote tone="warning" title={SCOPE_NOTICE_TITLE}` bez uslova). Na telefonu zauzima ~190 px prvog ekrana. → Prikazati samo kad `publishingLimit` vrati grešku opsega ili kad je `status === "expired"`. Tekst: „Instagram treba ponovo povezati da bi objavljivanje radilo.“ + dugme „Poveži ponovo“ (secondary), bez imena opsega i reči „token“.
  - [P2] Kvota kao puna kartica sa trakom iznad forme („Iskorišćeno 3 od 100 … ostalo je još 97“). → Jedan red u podnožju forme, pored „Objavljuješ kao“; traka tek od 70 % (`QuotaLine` već ima ton).
  - [P2] Brojači „0/20 @ 0/30 # 2200“: simbol stoji posle broja, nečitljivo. → „@ 0/20 · # 0/30 · 0/2.200 znakova“.
  - [P3] „Šta panel ne radi i zašto“ (trajna kartica: „Instagram Login-a“, „collaborators“) → „i“ oblačić uz zaglavlje.
- UX:
  - [P2] Natpisi tipa „Story“ i „Carousel“, a navigacija kaže „Priče“. Opis „Instagram pravi drugačiji kontejner za svaki od njih“ (`KIND_LABELS` u `convex/lib/igPublish.ts:59`). → Slika · Reel · Priča · Album; opis „Pravila za fajl zavise od tipa.“
  - [P2] „Zakazane i poslate objave“ su ispod forme (y ≈ 1.150 na 1536). Šta ide sutra vidi se tek posle skrolovanja; kalendara nema. → V2.
  - [P2] `PUBLISHED_UNCONFIRMED_LABEL` „Objavljeno, ID nije potvrđen“ → „Objavljeno — Instagram još nije potvrdio“.
- **Nema smisla**: baner traži ponovno povezivanje, a pregled kanala za isti nalog kaže „Povezan ✓“.
- **Ciljni kanvas 1536×695**:
```
┌[IG] Nova objava · Objavljuješ kao @enigma.it · Enigma IT     [Zakaži ▾] [Objavi sada]┐
├ FORMA (7/12) ───────────────────────────────┬ PREGLED (5/12, lepljiv) ─────────────┤
│ Tip: [Slika][Reel][Priča][Album]             │  ┌─────────────┐                     │
│ ┌ prevuci fajl · JPEG · 4:5–1,91:1 · 8 MB ─┐ │  │ telefon 4:5 │  opis, @, #          │
│ Opis ______________  @ 0/20 · # 0/30 · 0/2.200│  └─────────────┘                     │
│ Kada: (•) odmah ( ) [datum][vreme] Beograd   │  Danas 3/100 (samo red, ≥70 % traka) │
│ ▸ Dodatno (alt tekst, lokacija, oznake, probni Reel)                                 │
└ prelom — ispod: red ove objave i „Sledeće zakazano“ (ili kalendar iz V2) ─────────────┘
```
  Telefon: forma u jednoj koloni, pregled kao „Pregled“ list na dnu; „Objavi“ lepljivo na dnu iznad donje trake.

### Instagram · Publika — `/instagram/publika` — snimak: A3 `ig-publika-1536.jpg` (skelet)
- **Posao**: ko prati nalog i ko reaguje (uzrast, pol, države, gradovi). **Da** po kodu: jezičci Pratioci / Angažovana publika, piramida, rang liste, poruke praga („ispod 100 pratilaca“).
- UI:
  - [P2] Sopstveni period u native `select`-u („Poslednjih 30 dana“) dok je birač u gornjoj traci sakriven (`range: false`). Dva mehanizma perioda u istom modulu. → Ako API dozvoljava samo fiksne prozore, segment [7 d · 30 d · 90 d] na istom mestu gde je birač u gornjoj traci.
  - [P3] „Top Države“ / „Top Gradovi“ u Title Case → „Države“, „Gradovi“.
- UX:
  - [P2] Demografija postoji ovde kao poseban ekran i na Threads pregledu (tri tabele na dnu). FB i YT je nemaju. Isto pitanje ima tri odgovora o mestu.
- **Nema smisla**: prekidač „Tabela“ ovde, a na Threads-u natpis „TABELARNI PRIKAZ“ iznad tabele; isti pojam dva puta drugačije.
- **Kanvas**: `[Pratioci|Angažovani] · period · [Grafikon|Tabela]` u jednom redu; piramida 7/12 levo, Države i Gradovi 5/12 desno jedan ispod drugog. Sve staje iznad preloma. Telefon: piramida, pa dve liste.

### Instagram · Priče — `/instagram/stories` — snimak: A3 `ig-stories-1536.jpg` (skelet)
- **Posao**: aktivne priče sa odbrojavanjem, levak navigacije, arhiva. **Delimično**: tekst i stanja slabi.
- UI:
  - [P3] Naslov „Priče (Stories)“ i natpisi „Napuštanje priče (Tap exit)“, „Prevlačenje na sledeći nalog (Swipe forward)“, „stori/storija“ u opisima (`post-detail/*`).
  - [P3] 4 kartice 9:16 široke ~295 px pune ceo prvi ekran. → Kartice 180 px, 6 u redu, levak ispod je vidljiv.
- UX:
  - [P2] „Automatska anketa aktivnih priča svakih 30 minuta“ (`instagram-stories.tsx`): „anketa“ je pogrešan prevod za *polling*. → „Priče se same osvežavaju na 30 min · poslednje pre 12 min“.
  - [P2] Ručno „Osveži priče“ pada tiho (`console.error`, bez poruke).
  - [P2] Nepovezan nalog: drugačija prazna kartica (žuti `AlertCircle`, „Povežite … da biste“, persiranje) **bez dugmeta**, mrtav kraj. → Ista Misija za start kao na pregledu.
- **Kanvas**: red zaglavlja sa stanjem osvežavanja i „Osveži“ (outline); traka aktivnih priča; levak izabrane priče kao vodoravna traka sa procentima; arhiva kao tabela ispod preloma. Telefon: aktivne priče kao vodoravni karusel.

### Instagram · Inbox — `/instagram/inbox` — snimci: A3 `ig-inbox-1536.jpg`, `ig-inbox-390.jpg` (skelet liste)
- **Posao**: odgovoriti na DM u roku od 24 h. **Delimično**: dva panela su ispravna, ali je polje za odgovor ispod preloma na 1536×695.
- UI:
  - [P1] Kartica ima `h-[calc(100vh-12rem)] min-h-[600px]` (`inbox/inbox-view.tsx`). Na 695 px pobeđuje 600 px, pa je kartica ~736 px (stranica 926 px). Polje za poruku u `ChatView` je na dnu kartice, ispod preloma. Jovan skroluje stranicu, pa i listu poruka unutar nje (dvostruki skrol). → Kartica `h-[calc(100dvh-<visina zaglavlja>)]` bez `min-h` na desktopu; zaglavlje strane sažeti u jedan red.
  - [P2] Prazno desno okno ima poruku spuštenu u donju trećinu, ispod nivoa liste (snimak). → Poruka centrirana u oknu, uz broj „3 razgovora čekaju · najstariji 4 h“.
  - [P3] Reakcije su emodži dugmad 👍 👏 😍 (`chat-view.tsx`). Pravilo „bez emodžija“: reakcija je sadržaj poruke, ali dugmad treba da budu lucide ikonice ili tekst.
- UX:
  - [P2] Persiranje „Izaberite razgovor … da biste“, „Napišite poruku…“, „Kliknite da uklonite vašu reakciju“, a ostatak aplikacije je na „ti“.
  - [P2] „Ledolomci i meni“ (doslovni prevod *ice breakers*) → „Početna pitanja i meni“. „Prozor ističe“ → „Rok za odgovor ističe“. „1000 bajtova“ → „1.000 znakova“ (brojati bajtove interno).
  - [P1, međumodulno] Ovaj ekran je jedno od pet mesta za razgovore. → V1 Zajednica.
- **Nema smisla**: naslov „Poruke (Inbox)“, stavka „Inbox“, mrvica „Poruke (Inbox)“: tri natpisa za jedno mesto.
- **Kanvas**: zamenjuje ga Zajednica sa filterom „Instagram · Poruke“ (V1). Ruta ostaje kao preusmerenje.

### Instagram · Komentari — `/instagram/komentari` — snimak: `bx-instagram-komentari-1536x695.jpg` (skelet), uporedo FB
- **Posao**: odgovoriti, sakriti ili obrisati komentare. **Da** (filteri sa brojem, pretraga, grupne radnje, odgovor na mestu).
- UI:
  - [P3] Trajni red „Instagram ne šalje obaveštenje kad te spomene nalog koji je privatan…“ pod filterima. → Oblačić uz filter „Spominjanja“.
  - [P3] Naslov „Moderacija komentara“, a stavka „Komentari“.
- UX:
  - [P2] Kod je skoro identična kopija FB moderacije (`comments-moderation.tsx` naspram `fb-comments-moderation.tsx`, iste poruke). Razlike su funkcijske (IG Spominjanja, FB Lajkuj), ne dizajnerske. Svaka buduća popravka mora dva puta.
  - [P2] Bez prečica tastature za trijažu (j/k, r, h).
- **Kanvas**: Zajednica sa filterom „Instagram · Komentari · Čeka odgovor“ (V1).

### Instagram · Detalj objave — `/instagram/objave/[mediaId]` — snimak: A3 `ig-objava-detalj-1536.jpg` (skelet, fikstura id 17800000000000001 ne postoji)
- **Posao**: brojevi, radnje na profilu, levak priče i komentari jedne objave. **Da** po kodu; dostupno samo za IG (FB, YT i Threads nemaju detalj).
- UI:
  - [P2] Engleski u natpisima: „Doseg (Reach)“, „Crosspost pregledi“, „Feed objava“, „Reels videa“, „stori“ (`post-detail/*`). Tipovi `ALBUM`/`CAROUSEL`/`REEL`/`STORY` kao sirove vrednosti.
  - [P3] Do 11 `PostMetricCard` iste težine. → 4 glavne (Prikazi, Doseg, Interakcije, Sačuvano) krupno, ostale kao red malih brojeva.
- UX:
  - [P3] Jezičak „Pregled“ ostaje aktivan, mrvica „Instagram / Detalj objave“, „Nazad na sve objave“ postoji. Dobro.
- **Kanvas**:
```
┌ ← Objave   [IG] Detalj objave · Reel · 23. okt 2026.          [Otvori na Instagramu] ┐
├ medij (4/12) ┬ Prikazi · Doseg · Interakcije · Sačuvano (krupno), ostalo u jednom redu ┤
│              │ Reel: prosečno gledanje, preskakanje · Priča: levak                    │
├──────────────┴ Komentari na objavi (odgovor na mestu; ista komponenta kao Zajednica) ─┤
```

### Facebook · Pregled — `/facebook` — snimci: `bx-facebook-1536x695.jpg` (A3 `facebook-1536x695-vp/-00/-01/-02`), `bx-facebook-390x844.jpg`, `bx-facebook-prazno-*`
- **Posao**: stanje stranice + odgovaranje. **Delimično**.
- UI:
  - [P2] Tekstualne objave („Status“, „Deljeno“) dobijaju praznu sličicu od ~250 px sa ikonicom dokumenta (`facebook-content-grid.tsx`). → Tekstualna kartica bez medija: prva 3 reda teksta u većem slovu.
  - [P2] Komentari se broje dva puta na istoj kartici: „💬 18 ↗11“ i „18 Komentari ▾“. → Jedan red: „18 komentara ▾ · 11 deljenja · Otvori ↗“.
  - [P2] Stubići „Dnevni prikazi“ u narandžastoj (`--chart-2`) na plavom modulu.
  - [P3] Prekidač „Sakrij obrisane 1“ je podrazumevano uključen (`useState(true)`), ali izgleda kao neuključeno outline dugme, a natpis je glagol. → „Obrisane: skrivene (1) · Prikaži“.
- UX:
  - [P2] Primarno „Odgovori na komentare“ stoji i kad je 0 komentara na čekanju (`facebook-dashboard.tsx:137`). → Primarno samo kad je N > 0, sa brojem: „Odgovori (3)“; inače bez primarnog.
  - [P2] Uslov „Objava u 7 dana“ je u meraču, a aplikacija nema FB objavljivanje (nema `facebookPublish` u `convex/`). Uslov koji se ne može ispuniti odavde, bez radnje. → Uslov ostaje, uz sledeći korak „Objavi na Facebook-u ↗“ (spoljni link).
  - [P2] Top 3 („#1 Najviše prikaza“) pa „Sve objave“: dupliranje.
  - Telefon [P2]: 6.374 px visine; „Odgovori na komentare“ prelama se ispod naslova.
- **Nema smisla**: komentari se odgovaraju na dva mesta: inline u kartici objave („18 Komentari ▾“) i na `/facebook/komentari`.
- **Kanvas**: šablon V3. Primarno „Odgovori (N)“ samo kad N > 0. U „Čeka te“: komentari i poslednja objava. Mreža objava kompaktna.

### Facebook · Komentari — `/facebook/komentari` — snimci: `bx-facebook-komentari-1536x695.jpg`, A3 `fb-komentari-390.jpg`
- **Posao**: odgovori, lajkuj, sakrij, obriši. **Da**.
- UI:
  - [P1] Tip objave uz svaki komentar je sirov Meta `status_type`: `ADDED_PHOTOS`, `ADDED_VIDEO`, `MOBILE_STATUS_UPDATE` (`fb-comment-thread.tsx:586`: `{thread.post?.statusType ?? "OBJAVA"}`). Prevod već postoji u `facebook-content-grid.tsx` (`STATUS_LABELS`: Slika, Video, Status…), samo se ne koristi ovde. → Izvući mapu u `lib/kanal-recnik.ts` i koristiti na oba mesta.
  - [P2] Četiri radnje vidljive u svakom redu (Odgovori, Lajkuj, Sakrij, Obriši). Na telefonu se lome u dva reda, mete su ~28 px. → Desktop: Odgovori + ghost ikonice na hover ili fokus; telefon: Odgovori + „⋯“.
- UX: isto kao IG Komentari (kopija koda, nema prečica). → V1.
- **Kanvas**: Zajednica, filter „Facebook · Komentari“.

### YouTube · Pregled — `/youtube` (+ dijalog „Pošalji video“) — snimci: `bx-youtube-1536x695.jpg` (A3 `youtube-1536x695-vp/-00…-03`), `bx-youtube-390x844.jpg`, `bx-youtube-prazno-*`, A3 `yt-upload-dialog-1536.jpg`
- **Posao**: kako kanal raste, šta objaviti, odgovori. **Delimično**: ručnog odgovaranja na komentare nema nigde u aplikaciji (samo automatizacija i brisanje kroz dnevnik).
- UI:
  - [P2] Po tri dugmeta na svakoj od 9 kartica (Pogledaj na YouTube-u / Otvori, Izmeni, Titlovi) = 27 dugmadi iste težine. → Klik na karticu otvara panel videa (izmena, titlovi, sličica, brisanje); na kartici samo ↗.
  - [P2] Dva zbira za istu meru na istom ekranu bez objašnjenja: fokus „Pregledi 4.436“ i „Izvori pregleda · 8 izvora · 5.214 pregleda“. Razlika je iz fikstura, ali YT Analytics po dimenzijama u produkciji daje različite zbirove. → Uz zbir izvora: „zbir po izvorima može da odstupa od dnevnog zbira (YouTube)“ ili prikazati samo udele.
  - [P3] „Shorts feed“, „Thumbnail“ (dnevnik), pravno podnožje sa engleskim linkovima („YouTube Terms of Service“). Podnožje mora da postoji, natpisi mogu „Uslovi korišćenja YouTube-a“ i „Google politika privatnosti“.
  - Telefon [P2]: 6.565 px; „Sortiraj po:“ se lomi u dva reda, „Datum ↓“ odsečen na ivici.
- UX:
  - [P1] Primarno dugme ekrana „Pošalji video“ pravi video koji je **zaključano privatan** (`UPLOAD_PRIVATE_NOTICE`, `convex/lib/ytUpload.ts:28`). Upozorenje je na dnu dijaloga, posle popunjene forme. → Dugme „Otpremi kao privatan“ (secondary) dok Google ne odobri aplikaciju, upozorenje kao prvi red dijaloga. Kao primarno: ništa ili „Otvori YouTube Studio ↗“ (pitanje 9.3).
  - [P2] Fokus je „Pregledi (zbir za period)“, protok, dok IG, FB i Threads imaju pratioce (stanje). Pretplatnici su skriveni u pločici „Pratioci (neto)“. Na YouTube-u se kaže „pretplatnici“, ne „pratioci“.
  - [P2] „Poslednje radnje“ (dnevnik slanja i izmena) stoji na pregledu, a kod IG i Threads je dnevnik uz kompozer. Treće mesto za istu stvar.
  - [P2] YouTube prazno: ispod Misije još kartica „Poslednje radnje: Još nijedna izmena nije poslata…“ i pravno podnožje. Šum na praznom ekranu.
- **Nema smisla**: uslov „Video u 7 dana“ se ispunjava i privatnim videom poslatim odavde (`lastPostAt` iz liste videa), a kanal javno nije objavio ništa.
- **Kanvas**: šablon V3. Fokus „Pretplatnici“ + delta. Mini red: Pregledi · Vreme gledanja · Prosečno odgledano. „Čeka te“: komentari koje automatizacija zadržala za pregled · neuspele radnje · poslednji video pre N d. Mreža videa bez dugmadi; izvori pregleda ispod preloma.

### YouTube · Automatizacije — `/youtube/automatizacije` — snimak: `bx-youtube-automatizacije-1536x695.jpg`
- **Posao**: ključne reči u komentarima → javni odgovor ili moderacija. **Da**.
- UI:
  - [P2] Prvi red ekrana je kvota u jedinicama: „Potrošeno 2.350 od 4.000 jedinica danas (deo ovog projekta) · svi projekti: 3.100 od 8.000“. Ljudski prevod „još oko 33 automatska odgovora“ je sitan desno. → Naslov reda: „Danas još oko 33 automatska odgovora“; jedinice u oblačiću.
  - [P3] Brojevi „Odgovora (7 dana) 0“ u crvenoj boji modula liče na grešku. → Broj u `foreground`, natpis u `muted`.
  - [P3] „Video testVideo01A“: sirov ID umesto naslova videa.
- UX:
  - [P2] „Log komentara“ → „Dnevnik komentara“. „Motor je uključen i obilazi komentare kanala“ → „Automatski odgovori su uključeni“. „2 aktivnih automatizacija“ (`yt-automations-dashboard.tsx:173`, pogrešna množina) → `pluralSr` („2 aktivne automatizacije“).
  - [P1, međumodulno] Treće od četiri mesta za automatizacije (Threads „Automatizacije (OpenReply)“, OpenReply „Automatizacije i DM log“, IG Inbox „Ledolomci i meni“). → V7.
- **Kanvas**: `[YT] Automatizacije · Danas još ~33 odgovora · [+ Nova automatizacija]`; levo lista pravila (naziv, okidač → radnja, 7 d, prekidač), desno poslednji okidači iz dnevnika sa linkom na komentar.

### Threads — `/threads` (jezičci Pregled i analitika · Objavljivanje · Moderacija odgovora · Automatizacije (OpenReply) · Pretraga i otkrivanje) — snimci: `bx-threads-1536x695.jpg` (A3 `threads-1536x695-vp/-00…-03`), `bx-threads-390x844.jpg`, `bx-threads-objavi-1536x695.jpg`, `bx-threads-prazno-*`, A3 `threads-moderacija-1536.jpg`, `threads-automatizacije-1536.jpg`, `threads-pretraga-1536.jpg`, `threads-objavi-390-00.jpg`
- **Posao**: isto što i ostali kanali + objavljivanje, odgovori, automatizacija, pretraga. **Delimično**: sve je na jednoj strani, pod jezičcima koji nisu adrese.

Pregled i analitika:
- UI:
  - [P1] Modul je siv (`--mod-threads` #b5bfc9, isto kao `--mod-sistem`), pa primarna „Objavi“, „Poveži Threads“ i „Novo pravilo“ izgledaju **onemogućeno**. B10 je ovo ostavio za odluku. → Primarno u svetlom neutralnom (`--foreground` podloga, tamni tekst) sa `shadow-mod`, ili akcenat Threads-a izabran u Jovanovoj odluci (pitanje 9.4).
  - [P1] Dva različita „trenutna“ broja pratilaca na istom ekranu: fokus „1.264 trenutno stanje naloga“ i „Istorija broja pratilaca: 1.247 poslednji snimak“; y-osa ponavlja „1,2k 1,2k 1,2k 1,2k“. → Jedan broj u fokusu; grafikon bez sopstvenog zbira; ose sa celim brojevima (`areaTicks`).
  - [P2] Red od 5 `StatTile` (ikonica desno, bez sparklinije), a ostali kanali imaju `KpiTile` (ikonica levo, sparklinija). Pomešane su mere perioda („Dnevna serija u periodu“, „Zabeleženo u Threads-u“) i „Kumulativno na nalogu“ (Odgovori, Citati, Repostovi). Kod ne računa nikakvo poređenje sa prethodnim periodom, ni u fokusu ni u pločicama (`threads-dashboard.tsx`), za razliku od IG, FB i YT. → 3 `KpiTile`-a perioda (Prikazi, Klikovi, Interakcije) sa deltom; kumulativni brojevi u oblačić ili na detalj.
  - [P2] Linija prikaza se kida na danima bez merenja (F4).
  - [P2] Sirovi tipovi `TEXT_POST`, `IMAGE`, `CAROUSEL_ALBUM`, `VIDEO` u mono slovu (`threads-content-grid.tsx:63`, `TypeBadge` ispisuje `{type}`). „Ukupno prikaza (views)“, skraćenice „Lajk Odg Repost Citat Delj“.
  - [P2] „TABELARNI PRIKAZ“ kao natpis iznad svake od tri tabele, „Top Države (5)“, „100.0%“ upisano kao string sa tačkom (`threads-demographics-table.tsx:228`) pored „38,6 %“; datumi „2026-10-23“ (ISO) pored „26. okt 2026.“.
- UX:
  - [P1] Atribucija linkova (`threads-attribution-section.tsx`) sa „`threadsClicks` je broj korisnika… `siteClicks` je stvaran broj posetilaca … kroz /r/ redirekt“, „Izvor: Threads Insights API“, „Nespojeni URL-ovi (rupa)“. Sirove promenljive i infrastruktura u tekstu, a tema pripada modulu Atribucija. → Na Threads pregledu jedan red „Klikovi na linkove 187 → dolasci na sajt 104 (63 %) · Atribucija →“; ostatak na `/atribucija` sa filterom Threads.
  - [P2] Pregled je 3.848 px na desktopu, 7.548 px na telefonu: fokus, 5 pločica, 2 grafikona, Top 3, Sve objave, 3 tabele demografije, atribucija sa 4 pločice i 2 tabele.

Jezičci uopšte:
- [P1] Jezičci su `useState<ThreadsTab>` bez adrese. Osveženje vraća na Pregled, Nazad izlazi iz modula, a ⌘K nema „Objavi na Threads“: radnje u ⌘K su adrese (`ACTIONS` u `command-palette.tsx`), a jezičak adresu nema. Bočna traka nema podstavke za Threads (`channelTabs["/threads"]` ima samo „Pregled“), za razliku od IG, FB, YT i Oglasa. Birač perioda u gornjoj traci stoji i na četiri jezička koja ne rade nad periodom. → Rute `/threads/objavi`, `/threads/odgovori`, `/threads/automatizacije`, `/threads/pretraga` kroz `channelTabs` (V4).

Objavljivanje:
- [P1] Zid API polja, sva otvorena:
  - „Automatsko objavljivanje (auto_publish_text) · Preskače kreiranje posebnog kontejnera“, „Prilog linka (link_attachment)“, „Dodaj anketu (poll_attachment)“, „Ko sme da odgovara (reply_control) · Svi (everyone)“, „Tema (topic_tag)“, „Citiraj objavu (quote_post_id) · Threads Media ID“, „Ograniči po državama (allowlisted_country_codes) · ISO kodovi“, „Ghost objava“, „IG Story deljenje · Cross-share na Instagram Story“, „do 500 UTF-8 bajtova; emoji zauzimaju više bajtova“, „500 / 500 bajtova preostalo“.
  - Pregled objave ne postoji (IG ga ima).
  - → Tekst + prilozi + termin vidljivi; sve ostalo pod „Dodatno“; natpisi bez zagrada; brojač „500 znakova“ (bajtove meriti interno); „Citiraj objavu“ prima link objave; države kao izbor sa listom. Na kraju: jedinstveni kompozer (V2).
- [P2] Kvota „Kvota objavljivanja (24h prozor) · Maksimalno 250 objava… · Kvota nije pročitana“ u žutoj, kao kartica na vrhu. → Red u podnožju samo kad je kvota poznata i ≥ 70 %.
- Telefon [P2]: polje za tekst je tek oko y ≈ 820, posle birača perioda, zaglavlja, jezičaka, kvote i 4 velike pločice tipa.

Moderacija odgovora:
- [P1] Odgovori se vide **po jednoj objavi**: padajući izbor sa 50 objava, podrazumevano najnovija (`threads-replies-moderation.tsx`). Pitanje „ko na Threads-u čeka odgovor“ nema odgovor bez prolaska kroz objave. → Spisak odgovora na čekanju preko poslednjih N objava (u pozadini isti upit po objavi, ograničen kvotom); u Zajednici (V1).
- [P2] U naslovu kartice piše **„Moderacija odgovora po objavi (Dodatak A.2)“**: interna oznaka plana na ekranu (krši pravilo „bez internih oznaka“). Uz nju „TIP: TEXT_POST“ i „Threads API zahteva izbor konkretne objave…“.
- [P2] Odgovor na čekanju ima 5 radnji (Odobri, Ignoriši, Sakrij, Odgovori, Obriši); stanja kao mono čipovi („Vidljivo“, „Čeka odobrenje“, „Naš odgovor“).

Automatizacije (OpenReply):
- [P2] Dva preklopljena stanja: prekidač „Uključeno“ i režim „Skica (simulacija)“ / „Uživo (javno slanje)“ sa „Vrati u Skicu“ / „Prebaci u Uživo“. To su 4 kombinacije za jedno pitanje „da li ovo pravilo šalje odgovore“. → Jedan izbor sa tri stanja: Isključeno · Proba (ne šalje) · Uključeno (šalje).
- [P2] „Cooldown: 60 min“, „Max po niti: 3“, „Dnevni limit“, „Log izvršenja“, „`draft` režimu“; tekst odgovora u mono slovu (izgleda kao kod).

Pretraga i otkrivanje:
- [P2] Žuti okvir: „Pretraga trenutno obuhvata samo tvoje objave — pun doseg traži odobrenje Mete (App Review za threads_keyword_search sa Advanced Access-om)“. Funkcija koja ne radi ono što ime obećava; uz to „Keyword 24h (naši pozivi)“, „Profile 24h kvota“, „(KEYWORD)“, „(RECENT)“, „(TOP)“, „(TAG)“. → Sakriti jezičak dok odobrenje ne stigne (pitanje 9.3), ili ga preimenovati u „Pretraga mojih objava“.

- **Nema smisla**: (1) „Automatizacije (OpenReply)“ u Threads-u, a OpenReply je poseban modul u grupi Automatizacija; (2) atribucija linkova u kanalu, a modul Atribucija postoji; (3) Pretraga koja ne pretražuje Threads.
- **Kanvas** (Pregled): šablon V3 sa podnavigacijom u bočnoj traci (Pregled · Objavi · Odgovori · Automatizacije). Fokus Pratioci + delta; „Čeka te“: odgovori na čekanju odobrenja · neuspela objava · zakazano; 3 pločice; mreža objava. Demografija i atribucija su linkovi ispod preloma. Telefon: kao IG.

### Oglasi · Pregled — `/ads` (+ detalj kampanje, duel kreativa) — snimci: `bx-oglasi-1536x695.jpg` (A3 `oglasi-1536x695-vp`, `oglasi-mid.jpg`), `bx-oglasi-390x844.jpg`, `bx-oglasi-prazno-*`, A3 `oglasi-kampanja-detalj-1536.jpg`
- **Posao**: koliko je otišlo, šta je stiglo, po kojoj ceni, i koju kampanju pauzirati ili pojačati. **Delimično**: tabela kampanja, radni predmet ekrana, počinje na y ≈ 690, ispod preloma.
- UI:
  - [P1] **Izmišljeni brojevi za Google**: `convex/googleAdsStore.ts` upisuje `reach: impressions`, `frequency: 1`, `video3s: 0`, `thruplay: 0`. Tabela zato kaže „Frekvencija 1,0“ za Google kampanje, a Meta pada na `frequency = 1` kad dosega nema (`metaAdsStore.ts:1146`). Kampanja bez potrošnje ima „CTR 0,0 %“ (ne zna se, nije 0). → `undefined` u bazi, „—“ i „Google ne meri frekvenciju“ u ćeliji.
  - [P2] Red kampanje nosi do 6 čipova: platforma, „Hot“ (amber + `Flame`, ista ikonica kao niz u Napretku; `title="Hot kampanja (15 min sync)"` je interni prioritet sinhronizacije prikazan kao upozorenje), cilj na engleskom („Sales“, „Traffic“, „Engagement“, „Leads“, „PMax“, „Search“), „podaci od 13:44“ u svakom redu, „IS: 62,0 %“. → Ostaju platforma i cilj (srpski); svežina jednom u zaglavlju („Meta pre 14 min · Google pre 1 h“); „Hot“ se briše (ili tačkica „prati se na 15 min“ u oblačiću); IS ide u kolonu na detalju.
  - [P2] Cilj je engleski u tabeli, a srpski u detalju kampanje („Prodaja“, „Saobraćaj na sajtu“). Mapa u `campaign-detail.tsx` postoji, ali je `campaigns-table.tsx` ne koristi.
  - [P2] Množina: „2 setova“, „2 grupa“ (`campaigns-table.tsx:579`) → „2 seta“, „2 grupe“; kolona „Akcije & Ad setovi“; „read-only“.
  - [P2] Grafikon „Dnevna potrošnja“ u cijan `--chart-1` na narandžastom modulu.
  - Telefon [P1]: tabela kampanja na 390 px pokazuje samo nazive (čipovi odsečeni „Goog“, bez potrošnje i rezultata); oznake na grafikonu se preklapaju („7.221 RSD“ preko „6.643 RSD“); filter platformi se prelama. → Kartica kampanje: naziv, potrošnja, rezultati, cena po rezultatu, pauza.
- UX:
  - [P1] Akronimi bez prevoda u fokus redu: „Prosečan CPA“, „Prosečan ROAS 5,00x“, „vs prethodnih 28 d“. Na detalju još „Impresije“, „CPC“, „CPM“, „Hook Rate (3s / Impresije)“, „Hold Rate (ThruPlay / 3s)“, „Quality Score“, „Search Impr. Share“. → §6.4 (pitanje 9.5).
  - [P2] Detalj kampanje i duel kreativa žive u `useState` na istoj ruti: Nazad ne zatvara detalj, link na kampanju ne postoji. → `/ads/kampanje/[id]`, `/ads/duel/[adSetId]`.
  - [P2] „Pinovano: Test set — Žene 25–44, Beograd (3 v)“: anglicizam i „(3 v)“ bez značenja. → „Prikačeno poređenje: … (3 verzije)“.
  - [P2] Oglasi nemaju merač spremnosti, a imaju stvarne uslove (veza, sinhronizacija, aktivna kampanja, budžet ispod granice iz Podešavanja). → V3/V6.
- **Nema smisla**: ista Google Ads potrošnja se vidi u Oglasima (kampanje, Google API) i u Analitici → „Plaćeni oglasi (Google Ads)“ (`/analytics/oglasi`, GA4). Dva izvora, dva broja, bez rečenice koja objašnjava razliku (§6.6).
- **Kanvas**:
```
 64 ┌[Oglasi] Oglasi · Meta ● pre 14 min · Google ● pre 1 h               [+ Nova kampanja]┐
130 ├ POTROŠNJA 170.794 RSD ▼2 % (5/12) ┬ Rezultati 443 ┬ Cena po rez. 386 RSD ┬ Povraćaj 5,0× ┤
240 ├ KAMPANJE  [Sve 6|Meta 4|Google 2]                       sort: Potrošnja ▾  ──────────┤
    │ ● Prolećna akcija   Meta · Prodaja      87.398 RSD  136  643 RSD  6,5×  ▁▂▃  [⏸] ›  │
    │ ● Pretraga, brend   Google · Pretraga   36.783 RSD   65  566 RSD  6,7×  ▂▂▃  pregled › │
    │ … (5–6 redova iznad preloma)                                                         │
695 └ prelom — ispod: dnevna potrošnja, prikačena poređenja kreativa ────────────────────┘
```
  Telefon: fokus Potrošnja, pa kartice kampanja (2 broja + cena po rezultatu), filter platformi kao segment.

### Oglasi · Nova kampanja — `/ads/nova-kampanja` — snimak: `bx-oglasi-nova-kampanja-1536x695.jpg`
- **Posao**: Meta kampanja (cilj, budžet, publika, kreativa) u tri koraka, kreira se pauzirana. **Da**.
- UI:
  - [P3] „Dalje“ prigušeno bez rečenice šta fali (naziv je prazan). → Ispod dugmeta „Upiši naziv kampanje“.
  - [P3] Native `select` za nalog preko cele širine za jednu opciju. → Kad je nalog jedan, tekst „Nalog: Test Salon — Meta (RSD)“.
- UX:
  - [P2] Podrazumevan „Dnevni budžet (RSD) 20“ (`useState("20")`), validacija samo `> 0`. 20 RSD je verovatno ispod Metinog minimuma za RSD nalog. → Podrazumevano iz Podešavanja (gornja granica / tipičan budžet) i provera minimuma pre koraka 2; ispod polja „≈ 600 RSD mesečno“.
  - [P2] „Posebne kategorije oglasa (special_ad_categories)“, „ad set“, „Kreativ i pregled“ → „Posebne kategorije (stanovanje, zapošljavanje, krediti, politika)“, „grupa oglasa“, „Oglas i pregled“.
  - [P3] Google kampanje se ne prave ovde (tabela ih ima kao „read-only“). Stepper ne kaže „samo Meta“. → Podnaslov „Meta kampanja u tri koraka…“.
- **Kanvas**: stepper; forma 8/12 + desno lepljiv „Sažetak“ (nalog, cilj, budžet dnevno i mesečno, „kreira se pauzirana“) sa „Dalje“. Telefon: sažetak kao red iznad dugmeta.

### Oglasi · Publike — `/ads/publike` — snimak: `bx-oglasi-publike-1536x695.jpg`
- **Posao**: prilagođene i slične publike (stanje isporuke, veličina). **Da**, ali sa tuđim sadržajem.
- UI:
  - [P2] Četiri dugmeta u zaglavlju, dva narandžasta („Nova prilagođena publika“ primarno, „Nova Lookalike publika“ tintovano). → Jedno primarno „Nova publika ▾“ (Prilagođena · Slična); Osveži i Istraži ciljanje kao outline.
  - [P2] Četiri KPI pločice (Ukupno 3, Korisničke liste 0, Lookalike 1, Veb-sajt/Angažovanje 2) su isti brojevi kao filteri ispod („Sve (3) · Korisničke liste (0) · Lookalike (1) · Veb-sajt / Piksel (2)“). → Ostaju samo filteri sa brojem.
  - [P3] „ID: 230000000000001“ pod svakim nazivom → ikonica „kopiraj ID“ na hover; datumi „26.10.2026. 16:50“ (četvrti format).
- UX:
  - [P1] Odeljak „Meta Conversions API (CAPI) · Server-side praćenje konverzija i preusmeravanja (/r/ linkovi i OpenReply) sa nultim curenjem PII-a“, sa redom događaja „Lead“, „Purchase“, nije o publikama. To je zdravlje integracije. → Podešavanja → Sajt i oglasi (tamo su i piksel i CAPI token, vidi poruku u `capi-section.tsx:59`), uz stavku u zvonu kad ima odbijenih.
  - [P2] „Lookalike“, „Veb-sajt / Piksel“, „Sprema/Ispod praga“ → „Slična publika“, „Posetioci sajta“; „Ispod praga“ uz oblačić „manje od 1.000 ljudi — Meta ne isporučuje“.
- **Kanvas**: zaglavlje sa jednim primarnim; red filtera i pretrage; tabela publika iznad preloma. CAPI se seli.

## 6. Međumodulni nalazi

### 6.1 Doslednost pet pregleda kanala (pitanje 1)

| Zona | Instagram | Facebook | YouTube | Threads | Oglasi |
|---|---|---|---|---|---|
| Primarno u zaglavlju | Nova objava (ruta) | Odgovori na komentare (i pri 0) | Pošalji video (dijalog, samo privatno) | Objavi (menja jezičak; sivo) | Nova kampanja (samo vlasnik) |
| Podnavigacija | 6 podstavki u traci | 2 podstavke | 2 podstavke | 5 jezičaka u strani, nisu adrese | 2 podstavke |
| Fokus broj | Pratioci (stanje) | Pratioci stranice (stanje) | Pregledi (protok za period) | Pratioci (stanje) + @nalog | Potrošnja (protok) |
| Poređenje (kod) | da | da | da | **ne** | da |
| Spremnost | 4 uslova | 4 uslova | 3 („Video u 7 dana“) | 3 | **nema** |
| Radnja uz merač | podešavanja ili komentari | samo podešavanja | samo podešavanja | samo podešavanja | — |
| „Šta čeka odgovor“ | krug u meraču; DM nigde | rečenica u meraču + primarno | nigde | nigde (jezičak, objavu po objavu) | — |
| „Šta sledeće objaviti“ | uslov + primarno; red zakazanih na drugom ekranu | uslov bez načina da se ispuni | uslov + upload privatnog | uslov + jezičak | — |
| Pločice | 4 `KpiTile` sa linijom | 3 `KpiTile` | 3 `KpiTile` | 5 `StatTile` bez linije, ikonica desno | 3 u istom redu sa fokusom |
| Grafikon | izbor mere (select) + 1 linija | linija + stubići | linija + stubići | 2 kartice uporedo | 1 linija |
| Sadržaj | Top 3 (doseg) + Sve (Doseg/Sačuvano/Datum) → detalj | Top 3 (prikazi) + Sve (Prikazi/Lajkovi/Datum), komentari na mestu | Top 3 („Najgledaniji“) + Svi (Pregledi/Vreme/Datum), Izmeni/Titlovi | Top 3 („Top prikazi“) + Sve (4 sorta) | tabela kampanja |
| Natpis tipa | POST/REEL/CAROUSEL | Slika/Video/Status | — (trajanje) | TEXT_POST/IMAGE/CAROUSEL_ALBUM | Sales/Traffic… |
| Dnevnik radnji | na Nova objava | — | na pregledu | na jezičku Objavljivanje | — |
| Publika/demografija | poseban ekran | — | izvori pregleda | 3 tabele na dnu pregleda | Publike (Meta liste) |
| Prazno (nepovezan) | Misija, +30 XP | Misija, bez XP | Misija + prazan dnevnik + podnožje | Misija, +30 XP, sivo dugme | Misija; ne-vlasnik nema dugme |

Strukturne razlike koje platforma **ne** opravdava:
1. Threads jezičci u stanju umesto ruta i podstavki.
2. Fokus: stanje (pratioci) na tri kanala, protok (pregledi) na YouTube-u.
3. Threads bez poređenja i bez `KpiTile`.
4. Spremnost bez komentara na YouTube-u i Threads-u: opravdano podatkom, ali se nigde ne kaže da se odgovori ne prate.
5. Oglasi bez merača.
6. Radnja „Odgovori na komentare“ uz merač postoji samo na IG.
7. Tri različita natpisa za Top 3 („Najviše prikaza“, „Najgledaniji“, „Top prikazi“) i tri kriterijuma.
8. Dnevnik radnji na tri različita mesta.
9. Demografija na tri različita mesta.
10. Isti API pojam „views“ je „Prikazi“ (Threads), „Pregledi“ (YT) i „Pregledi sadržaja“ / „Ukupno pregleda“ (IG); interakcije su „Ukupno interakcija“ (IG), „Angažovanja“ (FB), a na Threads-u razbijene na tri pločice.
11. XP uz korak misije stoji na IG i Threads („+30 XP“ za objavu), a FB korak „Odgovori na prvi komentar sa stranice“ nema „+5 XP“, iako odgovor na FB komentar donosi 5 XP (`convex/napredak.ts`: `fbMod`, `MODERACIJA_BROJI = reply/hide/delete`). Oglasi ne pokazuju „+10 XP“ (`oglas`). YouTube ne donosi XP ni za jednu radnju, pa je jedini kanal koji Napredak ne vidi.
12. Četiri formata datuma: „26. okt 2026.“, „26.10.2026. 16:50“, „28.10. 12:51“, „2026-10-23“.

Platforma opravdava: FB bez kompozera (nema API objavljivanja), YouTube bez komentara u meraču (nema podatka), Oglasi bez „objave u 7 dana“.

### 6.2 Razgovori — treba li „Zajednica“ (pitanje 2)

Danas su razgovori na **šest** mesta sa **četiri** implementacije:
- IG Komentari (`comments-moderation.tsx` + `comment-thread.tsx`);
- IG Inbox (`inbox/*`, 24 h rok);
- FB Komentari (kopija IG koda + Lajkuj);
- FB pregled (komentari na mestu u kartici objave);
- Threads Moderacija odgovora (objava po objava, plus Odobri/Ignoriši);
- YouTube: ručnog odgovora nema; komentari se vide samo kroz dnevnik automatizacije i brisanje (`ytComments.ts` ima samo log i brisanje, `ytReply.ts` samo automatski odgovor).

Zvono („Šta me čeka“, `notificationsStore.citajKanale`) već sabira IG komentare, FB komentare i nepročitane DM-ove. To je prototip zajedničkog reda, ali Threads i YouTube ne ulaze.

**Da, jedna „Zajednica“** (V1), jer:
- (a) posao je isti: pročitaj, odgovori, sakrij, idi dalje;
- (b) Jovan 10× dnevno pita „ko čeka“, a danas to zahteva 4 ekrana i biranje objave na Threads-u;
- (c) kod je već dupliran;
- (d) razgovor je ulaz u Leadove, a veze nema: nijedan komentar ili DM ne nudi „Napravi lead“ / „Otvori firmu“, iako firma u Leadovima već nosi IG i FB identitet (`lead-identities-panel.tsx`).

Kanvas: §8 V1.

### 6.3 Objavljivanje — jedan tok i kalendar (pitanje 3)

Danas postoje četiri kompozera i nijedan kalendar:
- IG `/instagram/objavi`: puna strana, pregled, zakazivanje, red ispod forme;
- Threads jezičak „Objavljivanje“: bez pregleda, sva API polja otvorena, zakazivanje, „Red i istorija objavljivanja“;
- YouTube dijalog: bez zakazivanja, samo privatno;
- Novosti (`/novosti`): uređivač sajta sa tablom po statusu.

FB nema objavljivanje. Zajednički su samo „Objavljuješ kao“ i ideja reda. Da bi znao „šta ide ove nedelje“, Jovan otvara tri ekrana i skroluje ispod formi.

**Da, jedan tok „Objave“** (V2): kalendar nedelje + jedan kompozer sa izborom kanala, a pravila pojedinih kanala su sekcije kompozera. Novosti ostaju svoj uređivač (CMS je drugi posao), ali se njihovi zakazani i objavljeni postovi vide kao traka u kalendaru i otvaraju uređivač.

### 6.4 Sirovi API i engleski rečnik → srpski (pitanje 4)

| Gde | Danas | Predlog |
|---|---|---|
| Threads mreža, Moderacija | `TEXT_POST`, `IMAGE`, `VIDEO`, `CAROUSEL_ALBUM`, „TIP: TEXT_POST“ | Tekst, Slika, Video, Album |
| IG mreža, detalj | `POST`, `REEL`, `CAROUSEL`, `ALBUM`, `STORY` | Objava, Reel, Album, Priča |
| FB komentari | `ADDED_PHOTOS`, `ADDED_VIDEO`, `MOBILE_STATUS_UPDATE`, „OBJAVA“ | Slika, Video, Status (postojeća `STATUS_LABELS`) |
| IG kompozer | Story, Carousel, „drugačiji kontejner“ | Priča, Album, „Pravila za fajl zavise od tipa“ |
| IG kompozer baner | „opseg instagram_business_content_publish“, „token“ | „dozvola za objavljivanje“, „Poveži ponovo“ |
| IG kompozer | „Objavljeno, ID nije potvrđen“ | „Objavljeno — Instagram još nije potvrdio“ |
| IG kompozer | „Instagram API nema poziv…“, „Instagram Login-a“, „collaborators“ | u „i“ oblačić: „Lajk i brisanje se rade u aplikaciji Instagram“ |
| Threads kompozer | (auto_publish_text) „kontejnera“ · (link_attachment) · (poll_attachment) · (reply_control) „Svi (everyone)“ · (topic_tag) · (quote_post_id) „Threads Media ID“ · (allowlisted_country_codes) „ISO kodovi“ · (alt_text) | Brzo objavljivanje teksta · Link kartica · Anketa · Ko sme da odgovara: Svi · Tema · Citiraj objavu (nalepi link) · Samo u državama (izbor) · Opis slike za čitače ekrana |
| Threads kompozer | „500 UTF-8 bajtova; emoji zauzimaju više bajtova“, „bajtova preostalo“ | „još N znakova“ |
| Threads kompozer | Ghost objava · IG Story deljenje · Cross-share | Nestaje posle 24 h · Podeli i u Instagram priču |
| Threads/IG kvote | „Kvota objavljivanja (24h prozor)“, „Kvota nije pročitana“, „Keyword 24h (naši pozivi)“, „Profile 24h kvota“ | „Danas još možeš N objava“ / „Preostali broj nije poznat“ |
| Threads automatizacije | Cooldown · Max po niti · Dnevni limit · draft · UŽIVO (Live) · Log izvršenja · (contains)/(exact)/(@mention)/(keyword search) · (linkUrl) | Pauza za istu osobu · Najviše u jednoj niti · Najviše dnevno · Proba · Uključeno · Dnevnik · sadrži/tačno/spominjanje |
| Threads pretraga | `threads_keyword_search`, App Review, Advanced Access, (KEYWORD)/(RECENT)/(TOP)/(TAG) | „Pretraga drugih naloga čeka Metino odobrenje“; Najnovije/Najpopularnije |
| Threads atribucija | `threadsClicks`, `siteClicks`, /r/ redirekt, Threads Insights API, Nespojeni URL-ovi (rupa) | Klikovi u Threads-u, Dolasci na sajt, praćeni link, Linkovi bez praćenja |
| Threads moderacija | „(Dodatak A.2)“ | brisati |
| Priče | „Automatska anketa“, (Tap exit), (Swipe forward), stori | „Osvežava se na 30 min“, Izlaz, Sledeći nalog, priča |
| Detalj objave | Doseg (Reach), Crosspost pregledi, Feed objava, Reels videa | Doseg, Pregledi sa deljenja, Objava na profilu, Reel |
| Inbox | Inbox, Poruke (Inbox), Ledolomci, Prozor ističe, 1000 bajtova | Poruke, Početna pitanja, Rok ističe, 1.000 znakova |
| YouTube | jedinice (kvote), „Pošalji titl za 400 jedinica“, Thumbnail, Shorts feed, Log komentara, Motor | „Danas još ~N odgovora / izmena“, Sličica, Shorts, Dnevnik, Automatski odgovori |
| Oglasi metrike | CPA, ROAS, CTR, CPC, CPM, Impresije, Hook Rate, Hold Rate (ThruPlay / 3s), Quality Score, Search Impr. Share / IS | Cena po rezultatu, Povraćaj (×), Stopa klikova, Cena po kliku, Cena za 1.000 prikazivanja, Prikazivanja, Zadržavanje prve 3 s, Gledanje do kraja, Ocena kvaliteta, Udeo u pretrazi (akronim u oblačiću, pitanje 9.5) |
| Oglasi ciljevi | Sales, Traffic, Engagement, Leads, Awareness, App Promo, Search, PMax | Prodaja, Saobraćaj, Angažovanje, Upiti, Prepoznatljivost, Aplikacija, Pretraga, Performance Max (mapa iz `campaign-detail.tsx`) |
| Oglasi ostalo | Ad set(ovi), Akcije & Ad setovi, read-only, Hot (15 min sync), Pinovano/Pinuj bitku, Vodeći hook, Pauziraj gubitnika, Uporedi hooks, Kreativa, vs | Grupa oglasa, Radnje · Grupe, Samo pregled, (brisati), Prikačeno/Prikači poređenje, Bolja verzija, Pauziraj slabiju, Uporedi verzije, Oglas, u odnosu na |
| Publike / CAPI | Lookalike, Veb-sajt / Piksel, Meta Conversions API (CAPI), Server-side, PII, Lead, Purchase, (special_ad_categories) | Slična publika, Posetioci sajta, Slanje konverzija Meti, sa servera, lični podaci, Upit, Kupovina, Posebne kategorije |

Predlog sprovođenja: `lib/kanal-recnik.ts` (tipovi, ciljevi, stanja, mere), uz proveru u `scripts/` koja pada kad JSX ispisuje string po obrascu `/\b[A-Z]{2,}(_[A-Z]+)+\b/` ili `\([a-z]+_[a-z_]+\)`.

### 6.5 Prazna i nepovezana stanja (pitanje 5)

- **Nepovezan kanal, pregled** (`*-prazno`): dobro. Misija sa tri koraka i jednim „Poveži …“. Rupe:
  - (a) dugme vodi na `/settings` bez sidra ka tom kanalu (P2). → `/settings?veza=instagram` sa otvorenom karticom;
  - (b) birač perioda i dalje stoji u gornjoj traci (P3);
  - (c) YouTube ispod misije crta prazan dnevnik i pravno podnožje (P3);
  - (d) Threads dugme sivo, izgleda onemogućeno (P1, isti uzrok kao primarno);
  - (e) Oglasi za ne-vlasnika: koraci bez dugmeta i bez rečenice „Nalog povezuje vlasnik projekta“ (`ads-dashboard.tsx`), mrtav kraj (P2);
  - (f) XP uz korak samo na IG i Threads, iako FB odgovor i radnja na oglasima takođe donose XP (6.1, tačka 11).
- **Nepovezan kanal, podekrani**: pet različitih obrazaca. Tekst sa linkom (IG Publika, IG/FB Komentari), kartica sa žutim krugom bez dugmeta i persiranjem (Priče), crveni `FeedbackNote` (YT Automatizacije), žuti + crveni baner (kompozer). Podstavke „Nova objava“, „Inbox“ i „Priče“ se vide i kad IG nije povezan. → Jedna Misija za start na svakom podekranu, ili podstavke sakrivene dok kanal nije povezan.
- **Povezan, bez podataka**: dve prazne poruke jedna ispod druge („Još nema podataka za ovaj period“ + „Pokreni kanal“). Prihvatljivo, ali dve kartice za jednu poruku → spojiti u jednu misiju sa urađenim koracima.
- **Istekao token**: ne kaže šta da se radi.
  - Pregled IG, FB, YT i Threads: „Povezan ✓“ + „Poslednji prolaz nije uspeo; poslednji uspešan pre 3 d.“ + „Otvori podešavanja“ (`useChannelSync` ne čita `status`).
  - Oglasi: ništa; brojevi izgledaju sveže, samo red kaže „podaci od 13:44“.
  - Zvono u isto vreme zna „istekao_token“.
  - Upozorenje „Token ističe za N dana“ postoji samo u Podešavanjima (`connections-settings.tsx:1026–1032`), nikad na ekranu kanala.
  - Jedini ekrani koji kažu „istekla“: YT Automatizacije i IG kompozer.
  - → V6: red stanja veze u zaglavlju svakog kanala („● Veza istekla pre 2 d — [Poveži ponovo]“, „● Ističe za 5 d — Obnovi“) i siva oznaka „podaci od 24. okt“ na fokus broju dok sinhronizacija ne proradi.

### 6.6 Ostalo između modula

- **Oglasi ↔ Analitika**: `/analytics/oglasi` „Plaćeni oglasi (Google Ads)“ (GA4: potrošnja, klikovi, sesije, ključni događaji, kampanje, ključne reči) i `/ads` (Google kampanje iz Google Ads API-ja) prikazuju istu potrošnju iz dva izvora. → Kampanje i potrošnja žive u Oglasima. Analitički pogled („šta su posetioci sa oglasa uradili na sajtu“) ostaje u Analitici kao jezičak „Posle klika“, sa rečenicom „Potrošnja je iz Google Ads-a; sesije iz GA4“ i linkom na kampanju.
- **Threads atribucija ↔ Atribucija**: levak klik → dolazak živi u Threads pregledu. → `/atribucija?kanal=threads`; na Threads-u jedan red.
- **Automatizacije na četiri mesta**: OpenReply „Automatizacije i DM log“, Threads „Automatizacije (OpenReply)“, YouTube „Automatizacije“, IG Inbox „Ledolomci i meni“ (bira OpenReply automatizaciju). Isti model (okidač: ključna reč ili spominjanje → radnja: javni odgovor, DM, sakrij), četiri različita UI-ja i rečnika. → V7.
- **CAPI u Publikama** → Podešavanja → Sajt i oglasi (6.5).
- **Kanal ↔ Leadovi**: nema veze. → U Zajednici „Napravi lead“ i „Otvori firmu“ kad nalog postoji u `leadIdentities` (V1).
- **Zvono ↔ ekran kanala**: zvono kaže „istekao token“, kanal kaže „Povezan ✓“ (6.5).
- **Kontrolna tabla ↔ kanali**: „Čeka te“ na kanalu i „Šta me čeka“ na tabli moraju čitati isti izvor (`citajKanale`), proširen na Threads i YouTube.

## 7. Persone

- **Alex (power user)**:
  - Odgovaranje na komentare nema tastaturu (nema j/k/r/h, nema „sledeći neodgovoren“ posle slanja).
  - ⌘K ne zna „Odgovori na komentare“ ni „Objavi na Threads“.
  - Threads jezičak se ne može otvoriti linkom; detalj kampanje se ne može podeliti.
  - Da bi video sve što čeka, otvara IG Komentari, IG Inbox, FB Komentari i Threads (objavu po objavu); YouTube nikako.
  - Sortiranje se ne pamti.
- **Sam (pristupačnost, tastatura)**:
  - Značenje bedža „— 5,4 %“ je samo u `title` (nedostupno tastaturi i dodiru).
  - Brojevi u podnožju kartica su ikonica + broj (repost, citat, deljenje) bez teksta.
  - Siva primarna na Threads-u se čita kao onemogućena.
  - Mono čipovi stanja 11 px („Čeka odobrenje“, „Naš odgovor“).
  - Emodži dugmad za reakcije u DM-u.
  - Fokus u IG Inbox-u: polje za odgovor je ispod preloma, pa fokus odlazi van ekrana.
  - Nativni `select`-ovi (22 u kanalima) su upotrebljivi, ali vizuelno drugačiji od shadcn izbora na ostatku aplikacije.
- **„Jovan za stolom“ (1536×695, 10 otvaranja dnevno)**:
  - Na IG pregledu iznad preloma: fokus i 4 pločice; „3 komentara čekaju“ i DM-ovi se ne vide.
  - IG Inbox: polje za odgovor ispod preloma.
  - Nova objava: baner + kvota pojedu ~160 px pre forme, red zakazanih na y ≈ 1.150.
  - Threads Objavljivanje: polje za tekst na y ≈ 600, „Objavi na Threads“ na y ≈ 1.470.
  - Oglasi: tabela kampanja počinje tačno na prelomu.
  - YouTube: posle klika na primarno saznaje da video ostaje privatan.
  - Svakog jutra mora da prođe 5 kanala da bi saznao da je jedan token istekao (zvono to zna, kanal ne).
- **„Jovan na terenu“ (telefon, jedna ruka)**:
  - Birač perioda u dva reda (~120 px) na vrhu svakog kanala, i na praznom.
  - FB 6.374 px, YT 6.565 px, Threads 7.548 px.
  - FB, YT, Threads i Oglasi su dva dodira daleko (Više).
  - Traka podekrana odseca „Komenta…“ i krije „Nova objava“.
  - Oglasi: tabela kampanja bez brojeva, oznake grafikona se preklapaju.
  - Threads kompozer: polje za tekst tek na drugom ekranu.
  - FB komentari: 4 radnje u dva reda, mete ~28 px (B10 nije podigao na 44 px).
  - Nema „brzog odgovora“ iz zvona: „Danas“ vodi na desktop ekran komentara.

## 8. Veliki predlozi

**V1. „Zajednica“: jedan red za sve razgovore.**
- **Šta**: nova ruta `/zajednica` u grupi Radni sto (posle Leadova), sa bedžom = broj koji čeka. Izvori: IG komentari i spominjanja, IG DM (`orConversations`; zvono ga već broji), FB komentari, Threads odgovori (poslednjih N objava, odobravanje), YouTube komentari zadržani za pregled + komentari koje automatizacija nije obradila (zahteva unos komentara, ne samo dnevnika).
- Kanvas 1536×695:
```
┌[Zajednica] Zajednica · 7 čeka odgovor · najstarije 4 h              [Brzi odgovori ⚙]┐
├ FILTERI (2/12) ┬ RED (4/12) ─────────────────┬ RAZGOVOR (6/12) ──────────────────────┤
│ Čeka odgovor 7 │ ● IG  @ana · „Koliko košta…“ │ objava: [sličica] Balayage… ↗         │
│ Spominjanja 2  │   pre 12 min · komentar      │ @ana: Koliko košta balayage…          │
│ Sakriveno 1    │ ● DM  @marko · rok 5 h ⏳     │ ── firma: Salon Ana (lead) · Otvori → │
│ Sve            │ ● FB  Test K. · „Gde ste…“   │ [odgovor______________] [Pošalji]     │
│ Kanal: IG FB   │ ● TH  @x · čeka odobrenje    │ Sakrij · Obriši · Lajkuj (FB) ·       │
│ Threads YT     │ …                            │ Odobri (TH) · Napravi lead            │
└ prelom ────────┴──────────────────────────────┴───────────────────────────────────────┘
```
  Tastatura: j/k, r (odgovori), Enter (pošalji i idi na sledeći), h (sakrij), e (rešeno). Telefon: red → razgovor preko celog ekrana sa lepljivim poljem za odgovor; „Danas“ u donjoj traci vodi ovde.
- **Zašto**: najčešći posao u kanalima, danas na šest mesta sa četiri kopije koda; zvono već sabira deo.
- **Rizik**: Threads odgovori su po objavi (kvota poziva), YouTube nema unos svih komentara (backend posao); Meta 24 h rok mora ostati vidljiv.
- **Veličina**: L.
- **Gubi se / seli**: `/instagram/komentari`, `/instagram/inbox`, `/facebook/komentari`, Threads jezičak „Moderacija odgovora“ postaju preusmerenja na `/zajednica?kanal=…&vrsta=…`. Podstavke kanala ostaju kao prečice sa brojem. Inline komentari na FB karticama ostaju kao „N komentara →“ (otvara Zajednicu na toj objavi). Nijedna radnja se ne gubi (Lajkuj, Spominjanja, Odobri, Ignoriši idu kao radnje po kanalu).

**V2. „Objave“: kalendar + jedan kompozer.**
- **Šta**: `/objave` u grupi Radni sto. Iznad preloma nedelja (pon–ned) sa trakama po kanalu (IG, Threads, YouTube, Sajt/Novosti) i čipovima stanja (zakazano: info, objavljeno: uspeh, neuspelo: greška, sa „Pokušaj ponovo“). Desno „Red“ (sledećih 5 i neuspela). Primarno „Nova objava“ otvara kompozer: izbor kanala kao čipovi; zajednički delovi (medij, tekst, termin, „Objavljuješ kao“, pregled po kanalu u jezičcima); posebna pravila kao sklopljene sekcije („Instagram: alt tekst, lokacija, probni Reel“, „Threads: anketa, link kartica, ko odgovara“, „YouTube: naslov, kategorija, privatno — zaključano“); validacija po kanalu kao čipovi („Instagram: JPEG 4:5 ✓“, „Threads: 512/500 znakova ✕“).
- **Zašto**: četiri kompozera, nijedan kalendar; red zakazanih je danas ispod formi na dva ekrana.
- **Rizik**: različita ograničenja medija (IG samo JPEG; YT samo privatno; FB bez API-ja), delimičan uspeh (IG prošao, Threads pao) mora biti jasan po kanalu. Novosti ne ulaze u kompozer (svoj uređivač), samo u kalendar.
- **Veličina**: L (kompozer), M (samo kalendar nad postojećim redovima `instagramPublish` i `threadsPublish` i Novostima).
- **Gubi se / seli**: `/instagram/objavi` → `/objave/nova?kanal=instagram`; Threads jezičak → isto sa `kanal=threads`; YT dijalog ostaje dostupan iz YouTube-a i kao kanal u kompozeru; „Nova objava“ u ⌘K vodi na zajednički kompozer.

**V3. Jedan šablon pregleda kanala.**
- **Šta**: svih pet pregleda u istom redosledu i na istom mestu:
  1. zaglavlje sa redom stanja veze (V6) i primarnim po mogućnosti kanala;
  2. fokus red 8/12: glavni broj + delta + mini red 3 mere; desno 4/12 „Čeka te“ (komentari ili odgovori → Zajednica, zakazano ili neuspelo → Objave, poslednja objava pre N d) sa jednim „→“ po redu;
  3. „Objave“: jedna kompaktna mreža sa sortom „Najbolje“ (umesto Top 3 + Sve);
  4. ispod preloma: grafikon sa izborom mere, pa dublje (Publika, izvori, atribucija kao linkovi).

  Za Oglase: fokus Potrošnja, „Čeka te“ = kampanje sa problemom (pauzirana sa budžetom, ROAS ispod cilja iz Pravila, odbijen oglas), pa tabela kampanja. Komponenta `components/app/system/kanal-pregled.tsx` sa slotovima; `ChannelFocus` ostaje.
- **Zašto**: §6.1; danas oko mora ponovo da uči svaki kanal.
- **Rizik**: kanali bez nekog podatka (YouTube komentari, Threads poređenje) moraju da kažu „—“ i razlog, ne da izostave zonu.
- **Veličina**: M.
- **Gubi se / seli**: „Top sadržaj“ kao posebna sekcija (postaje sort); Threads demografija i atribucija (linkovi); YouTube dnevnik (u Objave/Zajednicu).

**V4. Threads kao ostali kanali: rute i podnavigacija.**
- **Šta**: `channelTabs["/threads"]` = Pregled · Objavi · Odgovori · Automatizacije (Pretraga sakrivena dok Meta ne odobri). Rute `/threads/objavi`… uz `EXTRA_SCREENS` (`range: false`, pa nestaje birač perioda). „Objavi“ u zaglavlju je link.
- **Zašto**: Nazad, osveženje, ⌘K, deljenje linka; isti obrazac kao 4 druga kanala.
- **Rizik**: mali (komponente jezičaka već postoje).
- **Veličina**: S.
- **Gubi se / seli**: ništa; posle V1 i V2 „Odgovori“ i „Objavi“ postaju preusmerenja.

**V5. Rečnik kanala i zabrana sirovih naziva.**
- **Šta**: `lib/kanal-recnik.ts` po §6.4 + provera u CI.
- **Zašto**: najvidljiviji P1 u ovom obimu; postojeće mape (`STATUS_LABELS`, ciljevi u `campaign-detail.tsx`) se ne koriste svuda.
- **Rizik**: nizak.
- **Veličina**: S–M.
- **Gubi se**: ništa; akronimi oglasa ostaju u oblačiću.

**V6. Stanje veze odvojeno od Spremnosti.**
- **Šta**: `useChannelSync` vraća `{veza: "aktivna" | "istekla" | "greška" | "ističe", ističeZa, poslednjiUspeh}` iz `connections.status` i `expiresAt`. U zaglavlju kanala jedan red (tačka u boji stanja + rečenica + „Poveži ponovo“ kad treba). Spremnost ostaje samo za ciljeve (objava u 7 dana, odgovori). Fokus broj dobija oznaku „podaci od …“ kad je sinhronizacija starija od 24 h. Baner u kompozeru postaje uslovan.
- **Zašto**: danas kanal kaže „Povezan ✓“ za istekao token, a kompozer kaže „poveži ponovo“ kad je sve u redu.
- **Rizik**: nizak.
- **Veličina**: S.
- **Gubi se**: segment „Povezan“ iz merača (prelazi u red stanja).

**V7. Automatizacije na jednom mestu.**
- **Šta**: grupa Automatizacija dobija jedan ekran „Automatizacije“ sa filterom kanala (IG DM / komentari, Threads, YouTube) i istim modelom okidač → radnja → granice → stanje (Isključeno / Proba / Uključeno). Kvote se pišu kao preostale radnje. OpenReply pregled (levak DM → klik) ostaje kao analitika.
- **Zašto**: četiri UI-ja i četiri rečnika za isti model.
- **Rizik**: različiti backendi (`threadsAutomations`, `ytAutomationsApi`, OpenReply), pa prvo zajednički UI nad postojećim mutacijama.
- **Veličina**: L.
- **Gubi se / seli**: YouTube podstavka „Automatizacije“, Threads jezičak, IG „Ledolomci i meni“ (postaju prečice sa filterom).

**V8. Oglasi: istina u brojevima, srpski nazivi, kampanja kao ruta.**
- **Šta**: ukloniti izmišljene `frequency: 1` i `reach = impressions` (Google) i `CTR 0` bez prikazivanja; ciljevi i mere sa srpskim imenom; detalj kampanje i duel kao rute; CAPI u Podešavanja; tabela iznad preloma; kartice na telefonu; razgraničenje sa Analitika → Oglasi.
- **Rizik**: srednji; dira `googleAdsStore.ts`, pa treba proveriti `verify:gads-*`.
- **Veličina**: M.
- **Gubi se**: ništa.

## 9. Pitanja za Jovana

1. **Gde žive razgovori?**
   - (a) Nova „Zajednica“ u Radnom stolu, svi kanali, sa „Napravi lead“ — **preporuka**;
   - (b) stranice po kanalu ostaju, a samo zvono „Danas“ postaje red sa odgovorom na mestu;
   - (c) ništa se ne menja, samo se Threads i YouTube dodaju u zvono.
2. **Jedan kalendar objava?**
   - (a) „Objave“: kalendar + jedan kompozer za IG, Threads i YouTube, Novosti kao traka u kalendaru — **preporuka**;
   - (b) samo zajednički kalendar, kompozeri ostaju po kanalu;
   - (c) ostaje kako je.
3. **Funkcije koje platforma blokira** (Threads pretraga radi samo nad tvojim objavama; YouTube upload je samo privatan):
   - (a) sakriti dok odobrenje ne stigne, pa vratiti — **preporuka za pretragu**;
   - (b) ostaviti uz preimenovanje („Pretraga mojih objava“, „Otpremi kao privatan“) — **preporuka za YouTube**;
   - (c) ostaviti kako je.
4. **Boja Threads-a** (siva = izgleda onemogućeno, ista kao Podešavanja):
   - (a) primarno u svetlom neutralnom (belo-sivo, tamni tekst) sa senkom — **preporuka**, jer brend je crno-beli;
   - (b) izabrati akcenat (npr. ljubičasto-plava) iako Threads nema boju;
   - (c) ostaviti.
5. **Jezik oglasa**:
   - (a) srpski naziv + akronim u oblačiću („Cena po rezultatu“ — CPA) — **preporuka**, jer aplikacija kasnije ide klijentima;
   - (b) akronimi ostaju (CPA, ROAS, CTR) jer ih ti i klijenti koristite;
   - (c) srpski bez akronima.
6. **Šta je fokus kanala?**
   - (a) pratioci ili pretplatnici sa deltom za sve društvene kanale (YouTube prelazi sa „Pregleda“ na „Pretplatnike“);
   - (b) doseg ili prikazi za period;
   - (c) upiti iz kanala (DM i komentari koji su postali lead, klikovi → sajt) — **preporuka** kao cilj, (a) dok podatak (c) ne postoji. Kanali agencije postoje da dovedu klijente.

## 10. Sitnice (P3)

- „100.0%“ upisano kao string u Threads demografiji; ostali procenti „38,6 %“.
- Četiri formata datuma (6.1); `formatDate` iz `lib/format` svuda.
- „2 aktivnih automatizacija“, „2 setova“, „2 grupa“ → `pluralSr`.
- „Top Države“ / „Top Gradovi“ Title Case; „TABELARNI PRIKAZ“ iznad tabela (brisati).
- „Sačuvano“ (sort u IG mreži) naspram „Čuvanja“ (Metrika) za istu meru.
- FB kartica: „Pogledaj na Facebook-u“ (Top 3) naspram „Otvori“ (Sve objave); isto na YouTube-u; Threads „Otvori na Threads“ naspram „Threads ↗“.
- YouTube „Odgovora (7 dana) 0“ u crvenoj boji modula.
- „Video testVideo01A“: ID umesto naslova.
- YT dijalog „Pošalji video“ na 695 px nema gornju marginu (zaglavlje dijaloga dodiruje ivicu).
- IG Inbox: prazan krug levo od „Instagram poruke“ bez natpisa.
- Dvostruka napomena o pragu demografije (Threads ispod tabela, IG u poruci).
- Native `select` u 12 fajlova kanala, a ostatak aplikacije koristi shadcn `Select`.
- „Pinovano (3 v)“, „IS: 62,0 %“, „Uporedi hooks (3)“ (engleska množina).
- Podnaslovi pregleda ponavljaju šta je na ekranu („Pratioci, doseg i angažovanje naloga…“); posle V6 bolje: „@nalog · sinhronizovano pre 2 h“.
- YouTube pravno podnožje sa engleskim natpisima linkova.
- FB prekidač „Sakrij obrisane“ uključen, a izgleda isključeno.
- Threads oznake na y-osi „1,2k“ ×4; „Prikazi“ linija se kida na danima bez merenja.
- Emodži dugmad reakcija u DM-u (lucide `ThumbsUp`, `Heart` ili tekst).
