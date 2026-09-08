# GL2 — Filteri u URL-u, LinkChip, tab „Niše", profil firme

Datum: 08.09.2026. · Grana: `main` · Model: Opus, effort high

Sve tačke 1–6 su urađene. `npm run typecheck`, `npm run verify:purge` i
`npm run build` prolaze; `npx eslint` nad svim mojim fajlovima je čist.

Pre-flight: `git log -3` je pokazao `e874b42 … [GL1]` na vrhu — GL1 jeste na
`main`. Pročitao sam `nocni-run/izvestaji/GL1.md`, plan §0/§2/§6/§7 i sve
fajlove koje prompt navodi.

CLAUDE.md traži `impeccable` design skill pre svakog UI zadatka — **taj skill
nije dostupan u ovoj sesiji**, pa sam po istom pravilu koristio
`frontend-design`.

---

## 1. Backend za filtere (§7.1)

Nov fajl **`convex/leadFiltersStore.ts`**:

- **`listLeadsFiltered`** (paginirano) — vraća jednu stranu (`strana`,
  `poStrani`, do 100) sa `{ items, ukupno, strana, ukupnoStrana, prekoracen,
  identitetiOdseceni, pregledano, now }`. `items` ima ISTI oblik kao
  `listByStage` (koristi `hydrateLeadRowExtras`), pa tabela nije morala da menja
  crtanje reda.
- **`countLeadsByFacet`** — brojači za sve fasete u jednom upitu.
- **`listPresets` / `savePreset` / `deletePreset`** za `leadFilterPresets`.
- Sve četiri funkcije idu kroz `requireMembership` + poređenje
  `membership.workspaceId !== args.workspaceId`.

**Filteri su server-side, svi.** Argumenti su union literali svuda gde skup
vrednosti postoji u kodu: `faza` (`LEAD_STAGE_VALIDATOR`), `temp`, `sajt` (7
literala), `platforma` (5), `koord`, `dodir`. Slobodan string je ostao samo tamo
gde je vrednost PODATAK a ne šifarnik: `nisa` (slug koji pravi skill ili čovek),
`grad` (grad iz baze) i `q` (tekst pretrage) — za njih literali ne postoje.

**Verovatnoća telefona** (`tel`): firma prolazi ako ima bar jednu
`leadIdentities` sa `kind: "phone"` i `verovatnoca >= prag`. Prag `0` znači
„ima bilo kakvu procenu" i ima izričitu granu — bez nje bi firma bez ijedne
procene prošla kroz `>= 0`. Brojači se vraćaju za pragove 70, 40 i 0.

**Filter `sajt` ima svih sedam vrednosti** (`ima`, `nema`, `nepoznato`,
`ne_radi`, `parkiran`, `drustvene`, `bez_https`) sa brojačem za svaku. Firma
kojoj su `imaSajt`, `sajtStatus` i `sajtHttps` svi odsutni ne ulazi ni u jedan
chip — njen broj se vraća kao `sajtNeprovereno` i traka ga ispisuje kao tekst
(„neprovereno: N"), ne kao chip.

**Brojač fasete se računa BEZ sopstvene grupe u preseku.** „Hot (12)" znači
„ako ovde kliknem, dobiću 12". Bez toga bi, čim izabereš „Hot", svi ostali
chipovi u grupi Temperatura pisali nulu i bili onemogućeni — pa ne bi mogao da
promeniš izbor unutar iste grupe.

**Granica 2000.** `listLeadsFiltered` i `countLeadsByFacet` čitaju najviše 2000
dodela po radnom prostoru (`FILTER_ASSIGNMENT_CAP`). Preko toga
`countLeadsByFacet` vraća `{ prekoracen: true, granica, pregledano }` i NIJEDAN
broj, a traka piše „ima više od 2000 dodela… suzi filter". `listLeadsFiltered`
i dalje vraća stranu (da ekran ne ostane prazan), ali sa `prekoracen: true`, pa
tabela iznad sebe ispisuje da lista nije potpuna.

---

## 2. URL stanje i traka filtera (§7.1)

**`components/app/leadovi/use-lead-filters.ts`** — `useLeadFilters()`:
`useSearchParams` za čitanje, `router.replace(url, { scroll: false })` za upis,
tipizovan `LeadFilters` objekat, `filtersToArgs` za Convex, `filtersToQuery` za
preset. **Nepoznata vrednost se ignoriše, ne baca** (`?temp=vruce` prosto ne
postoji u filteru). Hook ne zna ništa o tabeli — mapa iz GL3 ga preuzima bez
izmena. Parametri koji nisu naši (npr. `?import=`) se pri upisu prenose
netaknuti.

**`components/app/leadovi/lead-filter-bar.tsx`** — traka:

- Faze toka + „samo zaostali" su **uvek vidljivi** (bili su stalno na ekranu i
  pre GL2); ostale grupe (Temperatura, Sajt, Niša, Grad, Platforme, Telefon,
  Koordinate, Poslednji dodir) su iza dugmeta „Filteri" sa brojem aktivnih
  grupa.
- Svaki chip nosi broj u zagradi. **Chip sa 0 je `disabled`** sa `title`
  „Nema pogodaka u ovom preseku." — osim kad je već aktivan, jer se aktivan
  filter mora moći ugasiti i kad je presek prazan.
- Aktivni filteri se vide i kad je traka sklopljena: „3 filtera · <chip> <chip>
  · očisti", gde klik na chip gasi tu grupu.
- Pretraga po nazivu (`q`) piše u URL sa 350 ms zadrške — bez toga bi svaki
  pritisak tastera bio nov upit.
- Grad ima više od deset vrednosti → prikazuje se prvih deset po broju + „još
  N"; izabran grad se prikazuje i kad nije među prvih deset.
- **Preseti**: „Sačuvaj kao preset" (ime obavezno), preseti kao chipovi (aktivan
  se prepoznaje po tome što je query identičan), brisanje kroz `ConfirmDialog`.

**`filterMode` je nestao iz tabele.** `stage|overdue` sad žive u URL-u kao
`faza` i `zaostali`, a `LeadsTable` čita `useLeadFilters()`.

---

## 3. LinkChip (§7.2)

**`components/app/link-chip.tsx`** — `vrsta` (10 vrednosti iz plana), `href`,
`label?`, `size`, plus dva dodatka koja su bila potrebna: `copyValue` (za
telefon se kopira broj, ne `tel:+381…`) i `suffix` (bedž stanja sajta stoji
unutar čipa).

- Skraćivanje teksta: domen bez `https://`/`www.`, odnosno `@handle` za
  društvene mreže.
- Spoljni linkovi: `target="_blank"` + `rel="noopener noreferrer"`. `phone` i
  `email` idu kao `tel:` / `mailto:` u istom tabu.
- **Kopiranje**: dugme se NE crta ako `navigator.clipboard.writeText` ne
  postoji. Potvrda traje 1,5 s. Ako `writeText` odbije (nesigurni kontekst),
  prikazuje se neuspeh (crveni ×), a NE kvačica — lažna potvrda je gora od
  tihog neuspeha.

**`ContactLink` je obrisan.** `grep -rn "ContactLink"` sad pogađa samo
`generate-leads-plan.md`, `nocni-run/GL2.md` i komentar-nadgrobnicu u
`lead-chips.tsx` koji kaže gde je otišao. Jedini pozivalac je bio
`lead-expanded-row.tsx`.

Uz to su tri ručno crtane brend ikonice (Instagram, Facebook, TikTok) izvučene
iz `lead-identities-panel.tsx` u **`components/app/brand-glyphs.tsx`** i dodat
je Threads — LinkChip i panel identiteta sad crtaju iste glifove.

---

## 4. Tab „Niše" (§7.3)

`niche` je dodat u `Tab` union i u `TabNav` (ikonica `Compass`), a panel je
**`components/app/leadovi/niches-panel.tsx`**:

- Levo spisak: naziv, broj firmi, sa sajtom / bez sajta / hot / warm, „sajt
  nepoznat: N" kad postoji, skraćen opis.
- Desno panel: bedž autorstva („Claude · datum" ili „<email> · datum"),
  uređivanje opisa (postaje `covek`), platforme (dodavanje sa vrstom/URL-om/
  napomenom i uklanjanje, prikaz kao `LinkChip`), šifre delatnosti, „Prikaži
  firme (N)" i „Obriši".
- Platforma bez URL-a se crta kao isprekidan čip sa napomenom, ne kao link —
  čip koji ne vodi nigde ne sme da izgleda kao da vodi.
- **Prazno stanje**: objašnjenje da nišu obično pravi skill sam pri prvom uvozu
  + dugme „Nova niša".

Nema nijednog dugmeta za AI generisanje opisa — aplikacija ne poziva LLM.

---

## 5. Profil firme (§7.4)

- **Osobe** (jezičak „Kontakti"): svaka osoba nosi ulogu, `ProvenanceBadge` za
  IZVOR ULOGE (`person_<id>_role`) pored postojećeg za ime, pa telefone vezane
  za tu osobu kao `LinkChip` + traku verovatnoće + obrazloženje + dugme
  „Ispravi procenu".
- **Platforme** (nova kartica na istom jezičku): red `LinkChip`-ova — kanali iz
  `leadIdentities`, sajt sa firme, Google Maps iz `placeId`
  (`…/maps/place/?q=place_id:<id>`) i CompanyWall. Duplikat po adresi se
  izbacuje.
- **Poreklo** (jezičak „Firma i poreklo"): spisak `polje → vrednost → bedž
  porekla`, sortiran po vremenu opažanja, uključujući `izvestajSkilla` (seče se
  na dva reda, pun tekst u `title`).
- **Stanje sajta**: `LinkChip` sajta nosi `SiteStatusBadge`, a ispod stoji red
  „Ima sajt: ne (proveren: …)" / „Ima sajt: nepoznato — …" /  „Postojanje sajta
  nije proveravano."
- **`setPhoneConfidence`** (`convex/leadDetailStore.ts`): obavezno
  obrazloženje, `verovatnocaIzvor: "covek"`, `verovatnocaAt`. Odbija se:
  identitet koji nije `phone`, telefon bez `personId`, broj i „nije moguće
  proceniti" zajedno, i broj van 0–95. Kad čovek izabere „nije moguće
  proceniti", stari broj se BRIŠE — ostavljen bi se čitao kao važeći.

**`components/app/leadovi/phone-confidence.tsx`**: traka 0–100 sa bojama po
planu (crvena < 40, žuta 40–69, zelena ≥ 70) preko postojećih tokena
`danger`/`warning`/`success` — **nijedna nova hex vrednost**. „Nije moguće
proceniti" je siv tekst; odsustvo procene ne crta ništa (nikad 0 %).

---

## 6. Prošireni red i bedž sajta

- `lead-expanded-row.tsx`: red platformi kao `LinkChip` (kanali iz baze + sajt
  firme, bez duplikata) i **najbolja osoba** — ime · uloga · procenat, uz „+N u
  profilu" kad ih ima više. Ceo spisak osoba više nije u proširenom redu; on je
  u profilu.
- Rangiranje „najbolje osobe" radi server (`hydrateLeadRowExtras`) po §6:
  vlasnik > direktor > menadžer > nepoznato, a unutar iste uloge veća
  verovatnoća telefona.
- **`SiteStatusBadge` je jedna komponenta**
  (`components/app/leadovi/site-status-badge.tsx`) i koristi se na sva tri
  mesta: tabela, prošireni red, profil. Boja nosi PRODAJNI SIGNAL, ne grešku —
  `ne_radi`/`parkiran` su `temp-hot`, `vodi na mrežu` je `temp-warm`, `radi` je
  neutralno. Firma koja nikad nije proveravana nema bedž.

---

## Odluke koje sam doneo sam (nisu iz prompta ni iz plana)

1. **Prazan URL znači SVE faze, ne `nov`.** Prompt kaže „ponašanje isto"; pre
   GL2 je tabela otvarala fazu „nov" jer je `listByStage` tražila fazu.
   `listLeadsFiltered` je ne traži. Da sam zadržao stari podrazumevani izbor,
   morao bih ga upisati u URL pri učitavanju — što znači da bi zalepljen link
   bez `?faza=` značio nešto drugo nego što piše. Sve ostalo (jedan klik na
   fazu = ista lista kao pre, „samo zaostali" = stara `listOverdue`) radi
   identično. **Ovo je jedino mesto gde svesno odstupam od „ponašanje isto".**
2. **Tri „focus" chipa iz stare trake su uklonjena** (zaostali / sastanak danas
   / bez dodira 30+). Oni su filtrirali UČITANIH 200 redova u browseru; sad
   `zaostali` i „bez dodira 30+ dana" postoje kao pravi server-side filteri nad
   celim radnim prostorom, što je strogo bolje. „Sastanak danas" nema
   server-side filter u planu, ali ima sopstveni jezičak „Sastanci" sa
   brojačem, pa nije izgubljen.
3. **Osnovni skup su DODELE (`leadAssignments`), ne firme.** Tabela leadova je
   oduvek lista dodela; firma bez vlasnika u njoj ne postoji ni danas. Filter je
   ne izmišlja — firme bez vlasnika i dalje pokriva jezičak „Rupe u podacima"
   (`bez_vlasnika`). Posledica: brojači u traci broje dodeljene firme.
4. **`dodir` znači „BEZ dodira toliko dana", ne „dodirnut u poslednjih toliko".**
   Plan piše samo `7d|30d|nikad`. CRM traži zapuštene leadove, a tabela već
   crveni kolonu po istom pravilu (30+ dana). Natpisi na chipovima kažu tačno
   to („bez dodira 7+ dana"), pa nema dvosmislenosti. Koristi se
   `assignment.lastTouchAt` (uz `createdAt` kao osnovu kad dodira nikad nije
   bilo), ne poseban upit po firmi — 2000 upita za jedan filter nije opcija.
5. **`tel` u URL-u je go broj (`tel=70`), ne `>=70`.** Plan piše prag kao
   „>=70"; parser prima i taj oblik (skida `>=`), ali upisuje broj.
6. **Preset sa postojećim imenom baca grešku, ne prepisuje.** Tiho prepisivanje
   tuđeg preseta izgleda isto kao čuvanje novog. Poruka kaže da ime postoji.
7. **„Prikaži firme" u niši nije `Link` na `/leadovi?nisa=…`.** Ekran je već
   `/leadovi`, pa bi navigacija promenila adresu a ostavila otvoren jezičak
   „Niše" — klik bez vidljivog ishoda. Radnja umesto toga postavlja filter i
   prebacuje na jezičak sa tabelom.
8. **Straničenje se ne resetuje u efektu.** Server sam skraćuje traženu stranu
   na poslednju koja postoji, a dugmad „Prethodna/Sledeća" računaju od strane
   koju je server vratio. Time nema `setState` u efektu (što novi
   `react-hooks/set-state-in-effect` i zabranjuje) a strana 7 praznog preseka
   se sama vraća na postojeću.
9. **Granica za identitete je 8000 redova po radnom prostoru.** Plan pominje
   samo granicu od 2000 firmi. Filteri „Platforme" i „Telefon" moraju da
   pročitaju `leadIdentities`; kad se granica dosegne, vraća se
   `identitetiOdseceni: true` i traka to ispisuje umesto da tiho izgubi
   platformu.
10. **Profil prikazuje SVE osobe, ne najviše tri.** Plan kaže „do 3 osobe", ali
    to je granica koju poštuje skill pri uvozu. Sakriti četvrtu osobu koja je
    ipak ušla u bazu značilo bi da profil laže o tome šta baza sadrži.
    Prošireni red pokazuje jednu (+ brojač ostalih), kako prompt i traži.
11. **Novo polje u šemi: `niches.opisAutorUserId`** (`v.optional`, `OPCIONO
    NAMERNO`). Plan traži bedž „<ime> · <datum>" kad opis piše čovek, a do sada
    se pisalo samo DA je čovek, ne KOJI. Kad polja nema, bedž piše „Čovek" bez
    imena — izmišljeno ime bi bilo gore.
12. **`hydrateLeadRowExtras` je izvezen iz `leadCrmStore.ts`** (dodat samo
    `export`) da bi ga `leadFiltersStore.ts` koristio umesto da se logika
    dupira. Uz to su mu dodata polja `platforme` i, na osobama, `verovatnoca` /
    `nijeMoguceProceniti` — sve postojeće liste (`listByStage`, `listByOwner`,
    `listOverdue`) dobijaju ista polja, što ništa ne kvari.
13. **`getLeadDetail` vraća i `companyProvenance`** (ravan niz sa `value`).
    `provenanceByField` je mapa alijasa bez vrednosti polja, pa se iz nje ne da
    nacrtati spisak „koje polje je odakle".
14. **`api.d.ts` je dopunjen ručno** (dva reda za `leadFiltersStore`). `npx
    convex codegen` kontaktira deployment, a noćni run to ne sme; ručna dopuna
    je isti rezultat bez mrežnog poziva.

---

## Ručna provera na produkciji (`digital.enigmait.rs`)

**A. Filteri i URL**

1. Otvori `digital.enigmait.rs/leadovi` → jezičak **Tabela leadova**.
2. Gore stoji red **Faze toka** sa brojem u zagradi uz svaku fazu i chip
   **samo zaostali**. Klikni „Nov" — adresa postaje `…/leadovi?faza=nov`,
   lista se sužava, a ispod se pojavljuje red „1 filter · Nov ✕ · očisti".
3. Klikni **Filteri**. Otvaraju se grupe Temperatura, Sajt, Niša, Grad,
   Platforme, Telefon, Koordinate, Poslednji dodir.
4. Klikni „hot" pa „warm" u Temperaturi — adresa je `…?faza=nov&temp=hot,warm`.
   Primeti da brojevi uz „cold" i „Nova firma" i dalje pokazuju koliko bi
   pogodaka bilo da ih dodaš (to je namerno).
5. Nađi chip sa `(0)` — nije dugme; pređi mišem, `title` kaže „Nema pogodaka u
   ovom preseku."
6. **Kopiraj celu adresu i otvori je u novom tabu** — mora da se otvori isti
   presek, sa istim chipovima upaljenim.
7. Ručno pokvari adresu (`&temp=vruce`) i osveži — ekran radi, ta vrednost je
   ignorisana.
8. U polje pretrage ukucaj deo naziva firme; posle ~pola sekunde adresa dobija
   `&q=…` i lista se sužava.
9. Klikni **Sačuvaj kao preset**, upiši ime (npr. `Novi bez sajta`) → **Sačuvaj**.
   Preset se pojavljuje kao chip. Klikni **Očisti**, pa klikni preset — filteri
   se vraćaju. Klikni ✕ na presetu → dijalog potvrde → **Obriši preset**.
10. Probaj isto ime dva puta — druga snimka mora da odbije sa porukom da preset
    tog imena već postoji.

**B. Sajt i LinkChip**

11. U tabeli, u koloni **Firma i grad** (gustina „Udobno"), firma sa sajtom ima
    čip sa domenom; ako je sajt proveravan, uz njega stoji bedž („radi",
    „ne radi", „parkiran", „vodi na mrežu"). Firma koja nikad nije proveravana
    nema bedž — to je ispravno, ne bug.
12. Klikni ikonicu za kopiranje na čipu — na 1,5 s postaje zelena kvačica.
    (Ako otvoriš stranicu preko `http://` umesto `https://`, dugmeta neće ni
    biti — to je takođe ispravno.)
13. Otvori strelicu levo od reda (prošireni red): vide se najbolja osoba
    (ime · uloga · procenat), telefoni i mejlovi kao čipovi, i red platformi.

**C. Niše**

14. Jezičak **Niše**. Ako niša nema, vidiš objašnjenje da ih pravi skill pri
    prvom uvozu + **Nova niša**. Napravi „Test niša" — pojavljuje se u spisku sa
    0 firmi.
15. Klikni **Napiši opis**, upiši rečenicu, **Sačuvaj opis** — bedž pored
    naslova „Opis" piše tvoj e-mail i datum.
16. **Dodaj platformu** → izaberi Instagram, upiši URL, **Dodaj**. Čip se
    pojavljuje i vodi na taj URL. Bez URL-a čip je isprekidan i nije link.
17. **Izmeni** kod „Šifre delatnosti", upiši `9602, 9604`, sačuvaj.
18. **Prikaži firme (0)** — prebacuje na tabelu sa `?nisa=test-nisa` i praznim
    presekom (očekivano; niša je prazna).
19. **Obriši** → dijalog → potvrdi. Niša sa firmama se NEĆE obrisati; poruka
    kaže koliko ih ima.

**D. Profil firme**

20. Otvori bilo koju firmu (klik na naziv) → jezičak **Kontakti**.
21. Ako firma ima osobu sa telefonom, ispod imena stoji čip telefona, traka
    verovatnoće i obrazloženje, uz **Ispravi procenu**.
22. Klikni **Ispravi procenu** → unesi npr. `65`, upiši obrazloženje →
    **Sačuvaj procenu**. Traka postaje žuta, uz nju stoji „ispravio čovek".
    Probaj bez obrazloženja — dugme je isključeno.
23. Prebaci na **Nije moguće proceniti**, upiši obrazloženje, sačuvaj — broj
    nestaje i piše siv tekst.
24. Kartica **Platforme** ispod: sajt, IG/FB/TikTok/Threads, Google Maps (ako
    firma ima `placeId`) i CompanyWall.
25. Jezičak **Firma i poreklo**: uz sajt stoji bedž stanja, ispod red „Ima
    sajt: …", a niže sekcija **Poreklo** sa spiskom polja i izvora.

**E. Čišćenje testa:** obriši „Test niša" (tačka 19) i preset iz tačke 9.
Procenu telefona iz tačke 22 vrati ručno ili ostavi — ona je zabeležena kao
tvoja odluka, sa obrazloženjem.

---

## Poznati rizici i šta NIJE urađeno

- **Ništa nije provereno u browseru.** Noćni run nema pokrenut dev server ni
  Convex deployment. Sve tvrdnje o ekranu su čitanje koda + `npm run build`,
  ne posmatranje.
- **Cena upita filtera nije izmerena na stvarnim podacima.** U najgorem slučaju
  (2000 dodela + 2000 firmi + 8000 identiteta) jedan `countLeadsByFacet` čita
  ~12.000 dokumenata. To je unutar Convex granice od 16.384, ali blizu nje. Ako
  se radni prostor približi tim brojevima, sledeći korak je denormalizacija
  (`platforme` i `najvecaVerovatnocaTelefona` kao polja na `leadCompanies`), a
  ne dizanje granice. Isti uslov je već zapisan uz `hydrateLeadRowExtras`.
- **`countLeadsByFacet` i `listLeadsFiltered` čitaju istu osnovu dvaput** (dva
  odvojena upita). Convex ih drži kao dve pretplate; spajanje bi značilo da se
  brojači ponovo računaju pri svakoj promeni strane, što je gore.
- **Sortiranje i dalje radi samo unutar prikazane strane** (25 redova). To je
  zatečeno ponašanje; sada je strana server-side, pa je napomena iznad tabele i
  dalje tačna.
- **Grad se poredi bez dijakritike i velikih slova**, ali se u URL upisuje
  onako kako stoji u bazi. „Beograd" i „beograd" iz dva različita uvoza bi bila
  dva chipa sa istim brojem pogodaka. Normalizacija grada pri uvozu je posao
  van GL2.
- **`niches.opisAutorUserId` je novo polje** — postojeće niše ga nemaju, pa im
  bedž piše „Čovek" bez imena dok se opis ne izmeni. To je namerno.
- **`npm run lint` ima 1287 grešaka i 21396 upozorenja u celom repou** — sve
  zatečene (GL1 je izmerio 1288/21396), uglavnom `no-explicit-any` u
  `scripts/verify-gads-*.ts`. `npx eslint` nad svakim mojim fajlom je čist.
  Zatečena upozorenja u fajlovima koje sam dirao a nisu moja: `AlertTriangle`
  neiskorišćen u `lead-identities-panel.tsx`, `Doc` neiskorišćen u
  `convex/leadCrmStore.ts` (proveren `git show HEAD` — bilo je i pre GL2).
- **Tab „Mapa" ne postoji** (GL3). `useLeadFilters` je napisan nezavisno od
  tabele baš zato da ga mapa preuzme bez izmena.

---

## Dodati fajlovi

- `convex/leadFiltersStore.ts`
- `components/app/link-chip.tsx`
- `components/app/brand-glyphs.tsx`
- `components/app/leadovi/use-lead-filters.ts`
- `components/app/leadovi/lead-filter-bar.tsx`
- `components/app/leadovi/niches-panel.tsx`
- `components/app/leadovi/site-status-badge.tsx`
- `components/app/leadovi/phone-confidence.tsx`
- `components/app/leadovi/phone-confidence-dialog.tsx`
- `components/app/leadovi/platform-links.ts`
- `nocni-run/izvestaji/GL2.md`

## Izmenjeni fajlovi

- `convex/schema.ts` (`niches.opisAutorUserId`)
- `convex/leadCrmStore.ts` (`hydrateLeadRowExtras`: izvezen + platforme i
  procene po osobi)
- `convex/leadDetailStore.ts` (`setPhoneConfidence`, `companyProvenance`)
- `convex/nichesStore.ts` (`opisAutorUserId`, `opisAutorEmail`)
- `convex/_generated/api.d.ts` (ručno dopunjen)
- `app/(app)/leadovi/page.tsx` (Suspense granica za `useSearchParams`)
- `components/app/leadovi/leads-dashboard.tsx` (tab „Niše")
- `components/app/leadovi/leads-table.tsx` (filteri iz URL-a, server-side
  straničenje, sajt u koloni)
- `components/app/leadovi/lead-expanded-row.tsx` (LinkChip, platforme, najbolja
  osoba)
- `components/app/leadovi/lead-detail.tsx` (Osobe / Platforme / Poreklo, sajt)
- `components/app/leadovi/lead-chips.tsx` (`ContactLink` obrisan)
- `components/app/leadovi/lead-identities-panel.tsx` (ikonice iz
  `brand-glyphs.tsx`)
- `components/app/leadovi/lead-urgency.ts` (`LeadRowPlatform`, procene na osobi)
