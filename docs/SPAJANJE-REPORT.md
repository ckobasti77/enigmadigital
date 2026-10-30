# SPAJANJE — završni izveštaj noćnog runa (29–30. 10. 2026.)

Grana `spajanje-run`, lokalno. Ništa nije pushovano ni deployovano. Plan: `docs/SPAJANJE-PLAN.md`. Detalji po koraku: `docs/SPAJANJE-PROGRESS.md`.

## 0. Ukratko

- Devotionov radni deo je u Enigmi. Dokumenti, zadaci, ideje, mape, poruke, beleške, Moj dan, Inbox i web push rade u jednoj aplikaciji, pod jednim nalogom i jednim spiskom projekata.
- Paritet je pun: svih 35 redova §6 su „gotovo“. Web push šalje tek kad postaviš VAPID ključeve.
- Backend: 51 nova tabela i 275 novih funkcija (256 javnih, 19 internih) u `convex/prostor/`. Svaka javna ide kroz omotač projekta ili prijave. Generički test napada svih 256 funkcija ID-jevima iz tuđeg projekta: 0 prekršaja.
- Enigma nije promenila ponašanje. Leadovi, kanali, oglasi, pravila, OpenReply, Novosti i Napredak su se samo preselili u nov meni. Svih 21 regresiona provera prolazi. Prijava, OAuth povratak i pravne strane nisu dirani.
- Testova je bilo 1.168 u 69 fajlova. Sada ih je 2.651 u 209 fajlova, i svi prolaze.
- Run nije video pravu prijavu ni pravu bazu. Sve je provereno testovima i kroz razvojni prikaz (`?ux=1`) sa lažnim podacima. Najvažnije ručne provere su u odeljku 8.
- BLOKADA koja traži tebe nema. Ostala su dva ograničenja razvojnog prikaza (odeljak 5) i oko 40 izbora ukusa koje treba da potvrdiš (odeljak 6).

## 1. Kako da pregledaš granu

```bash
git log --oneline main..spajanje-run        # 31 commit: zatečene izmene, start, S01–S29 (S30 dolazi posle ovog koraka)
git diff --stat main...spajanje-run         # 815 fajlova, +162.715 / −1.070 (do S29)
```

- Prvi commit na grani (`b7c2a99 chore: zatečene lokalne izmene pre noćnog runa SPAJANJE`) nosi tvoju necommitovanu izmenu od pre runa (`tsconfig.json`, jedan red). Pogledaj ga posebno.
- `main` je predak grane, pa je merge fast-forward.
- Novi paketi (samo P10, tačne verzije): `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extensions`, `@tiptap/extension-list`, `@tiptap/extension-table` (svi 3.29.2), `@xyflow/react@12.11.2`, `web-push@3.6.7`, `read-excel-file@9.3.5`; dev `@types/web-push@3.6.4`. `package.json` ima `overrides` za Tiptap.
- Posle povlačenja pusti `npm ci`. Lockfile prolazi i sa npm 10.9.8 i sa npm 11 (popravljeno u S29). Nikad ne puštaj `npm dedupe`: podiže nepovezane pakete (S10).

Lokalno, bez baze (razvojni prikaz):

1. `npm run dev`.
2. Otvori ekrane sa `?ux=1`. Proxy ih prepisuje na `/dev-ux/…`. Prazno stanje: dodaj `&prazno=1`. Posmatrač: `&uloga=client_viewer`. Navigacija klikom gubi `?ux=1`, pa adresu kucaj.

| Nivo | Rute |
|---|---|
| Ja | `/` (Danas), `/moji-zadaci`, `/inbox`, `/poruke`, `/poruke?kanal=chatChannelsux0021`, `/beleske`, `/projekti`, `/novi` |
| Projekat (`enigma-it`) | `/enigma-it` (Početna), `/enigma-it/zadaci`, `/enigma-it/stranica/pagesux0200` (zadatak), `/enigma-it/ideje`, `/enigma-it/ideje?ideja=ideaNodesux0002`, `/enigma-it/poruke`, `/enigma-it/dokumenti`, `/enigma-it/dokumenti/areasux0001?tab=pregled\|zadaci\|dokumenti\|mapa` |
| Stranice | `/enigma-it/stranica/pagesux0101` (beleška), `…/pagesux0104` (zaključana), `…/pagesux0103` (tabela), `…/pagesux0107` (fajl), `…/pagesux0102?tab=mapa` |
| Ostalo u projektu | `/enigma-it/beleske`, `/enigma-it/korpa`, `/enigma-it/aktivnost`, `/enigma-it/puls`, `/enigma-it/settings?tab=projekat\|oblasti\|lozinke\|pristup\|ai` |
| Veza lid ↔ zadatak | `/enigma-it/leadovi/lc_ux_test_002?tab=zadaci` |
| Enigma (isto kao pre) | `/enigma-it/leadovi`, `/leadovi/uvoz`, `/analytics`, `/instagram`, `/facebook`, `/threads`, `/youtube`, `/ads`, `/rules`, `/novosti`, `/napredak`, `/openreply`, `/settings` (sve pod `/enigma-it`) |
| Panel i prijava | `/?rezim=panel`, `/zadaci?rezim=panel`, `/login`, `/pozivnica-ux` |

Sa pravom bazom: `npx convex dev` (menja dev deployment: 51 nova tabela, nove funkcije, nov cron), pa `npm run dev` i prijava.

## 2. Šta je urađeno, po oblasti

| Oblast | Šta | Koraci | Snimci |
|---|---|---|---|
| Plan i temelj | Plan spajanja, šema `prostor` (51 tabela), adapter identiteta (`requireClanProjekta`, profil se pravi sam), deljena logika u `lib/prostor/`, alat za prenos | S01, S02 | — |
| Backend | 37 modula u `convex/prostor/`: dokumenti, oblasti, saradnja, korpa, pretraga, zadaci, Moj dan, Puls tima, ideje, beleške, mape, tabele, fajlovi, AI podešavanje, poruke, obaveštenja, push, podsetnici (cron 6 h), lozinke | S03–S06 | — |
| Temelj weba | Base UI primitivi (kartice, kontekstni meni, avatar, fioka…), `lib/toast.ts`, GSAP pokret, kuke `useProjekat*`, alat za ekrane | S07, S08 | S08-* |
| Ljuska | Traka levo („Ja“ + projekti + „+“ + Svi projekti), meni „Ja“ i meni projekta po grupama, rute „Ja“ i `[projekat]`, profil u meniju korisnika, donja traka na telefonu | S09 | S09-* |
| Dokumenti | Oblasti, stablo stranica sa prevlačenjem, Tiptap uređivač, autosave i konflikt, komentari sa @, istorija i vraćanje verzije, prisustvo i zaključavanje, tabele (CSV/XLSX), fajlovi | S10, S11 | S10-*, S11-* |
| Zadaci | Zadaci tima, panel zadatka, zadatak na celu stranu (koraci, izvršioci, rok, prioritet, instrukcije), „Sredi rokove“ | S12 | S12-* |
| Ideje i mape | Tabla po fazama, lista, detalj, glasanje, „Postalo zadatak“; mape oblasti, stranice, ideja i beleški (xyflow, lenjo) | S13, S14 | S13-*, S14-* |
| Poruke | Kanali projekta, lični DM i grupe, reakcije, prisustvo, „Diskusija u Porukama“ sa stranice, ideje i zadatka | S15 | S15-* |
| Ja | Moji zadaci, lični zadaci, Beleške, brzi unos (`q`) | S16 | S16-* |
| Zvono i Inbox | Zvono sa karticama „Čeka te“ i „Inbox“, `/inbox`, podešavanja obaveštenja, web push iza VAPID ključa | S17 | S17-* |
| Danas i početna | Danas iz svih projekata (Moj dan + Čeka te + tiha kartica napretka); jedna početna projekta (Za tebe, Trijaža, Čeka te, brojke, Puls tima, Nedavne izmene); Puls i Aktivnost | S18–S20 | S19-*, S20-* |
| Projekti i tim | Korpa, kartice Oblasti/Lozinke/AI u podešavanjima, opis projekta; `/projekti`, novi projekat sa oblastima i kanalima, profil pri prihvatanju pozivnice | S21, S22 | S21-*, S22-* |
| Lid ↔ zadatak | Jezičak „Zadaci“ na profilu firme, „Novi zadatak“ iz firme, komentara bez odgovora i upozorenja iz „Čeka te“; `pages.leadCompanyId` i `pages.izvor` | S23 | S23-* |
| ⌘K i prečice | Jedna paleta svuda (ekrani, projekti, brzi unos, stranice, zadaci, ideje, poruke, firme); katalog prečica sa testom sudara, `?` je pomoć | S24 | S24-* |
| Prolazi | Tekst i rečnik, prazna stanja; telefon (390); čuvari dizajna (`verify:prostor-dizajn`); performanse (lenji Tiptap/xyflow/dijalozi) i pristupačnost (axe 0 nalaza u radnom delu) | S25–S28 | S25-* … S28-* |
| Revizija | Paritet po redu, generički test izolacije (256 funkcija), regresije Enigme, 13 nalaza (svi zatvoreni) | S29 | S29-* |
| Izveštaj | Ovaj fajl, merenje, završni snimci | S30 | S30-* |

Završni snimci (`docs/spajanje/snimci/S30-<ekran>-{1536,390}.png`): Danas, Moji zadaci, Inbox, Poruke, Svi projekti, Početna projekta, Zadaci, Zadatak, Stranica, Ideje, Mapa oblasti, Firma → Zadaci.

## 3. Paritet (§6 plana), ishod iz S29

Prikaz = ekran se otvara u razvojnom prikazu na 1536 i 390, ima naslov, konzola je čista, nema vodoravnog skrola. Test = Devotion test → preneti test (broj blokova).

| # | Funkcija | Novo mesto | Ishod |
|---|---|---|---|
| 1 | Moj dan (plan dana, „Isplaniraj“, sekcije, završeno danas) | `/` Danas | gotovo |
| 2 | Brzi unos (`q`) sa odredištem i rokom | ljuska + ⌘K | gotovo |
| 3 | Moji zadaci (svi projekti + lični), grupe, filteri | `/moji-zadaci` | gotovo |
| 4 | Lični zadaci i „Premesti u projekat“ | `/moji-zadaci` | gotovo |
| 5 | Inbox, nepročitano, „Čeka tebe“ | `/inbox` + zvono | gotovo |
| 6 | Poruke: DM, grupe, kanali, reakcije, prisustvo, pretraga | `/poruke` (pretraga sadržaja u ⌘K) | gotovo |
| 7 | Beleške, „Pošalji u projekat“ | `/beleske` | gotovo |
| 8 | Mapa beleški projekta | `/[projekat]/beleske` | gotovo |
| 9 | Profil, obaveštenja, tiho vreme, web push | meni korisnika | gotovo |
| 10 | Komandni centar | `/[projekat]` | gotovo |
| 11 | Zadaci tima | `/[projekat]/zadaci` | gotovo |
| 12 | Zadatak na celu stranu | `/[projekat]/stranica/[id]` | gotovo |
| 13 | Ideje: tabla, lista, detalj, glasanje, faze | `/[projekat]/ideje` | gotovo |
| 14 | Mapa ideja | Ideje → Mapa | gotovo (prekidač je lokalan, viđen u S14) |
| 15 | Poruke projekta | `/[projekat]/poruke` | gotovo |
| 16 | Oblasti | meni + `/[projekat]/dokumenti/[id]` | gotovo |
| 17 | Stablo stranica | meni projekta | gotovo |
| 18 | Stranica: Tiptap, autosave, konflikt | `/[projekat]/stranica/[id]` | gotovo |
| 19 | Prisustvo, zaključavanje, podstranice, povezano | stranica | gotovo |
| 20 | Komentari sa @ | stranica, oblast, ideja | gotovo |
| 21 | Istorija, „Vrati ovu verziju“ | stranica, oblast, zadatak | gotovo |
| 22 | Stranica-tabela, uvoz CSV/XLSX | stranica | gotovo |
| 23 | Stranica-fajl, prilozi, pregled | stranica | gotovo |
| 24 | Mapa oblasti i stranice | kartica „Mapa“ | gotovo |
| 25 | Korpa | `/[projekat]/korpa` | gotovo |
| 26 | Aktivnost | `/[projekat]/aktivnost` | gotovo |
| 27 | Puls nedelje | `/[projekat]/puls` + kartica | gotovo |
| 28 | Podešavanja: opis, oblasti, tim, pozivnice, lozinke | `/[projekat]/settings` | gotovo |
| 29 | AI provajderi | Podešavanja → AI | gotovo |
| 30 | Pretraga (⌘K) | ⌘K | gotovo |
| 31 | Podsetnici za rokove (6 h) | `convex/crons.ts` | gotovo (nema ekrana) |
| 32 | Web push | zvono, podešavanja | gotovo; šalje tek uz VAPID |
| 33 | Prečice (`q`, `?`, `j`/`k`/`x`) | ljuska | gotovo |
| 34 | Novi projekat sa oblastima i kanalima | `/novi` | gotovo |
| 35 | Pozivnica u tim | Enigmin Pristup + profil | gotovo |

Funkcije: Devotion ima 271 javnu i 31 internu. 263 se poklapaju po modulu i imenu. Nije preneto 39, svaka sa razlogom u planu (16 `startups.*` i 5 `invites.*` zamenjuju Enigmini projekti i pozivnice, 5 `profiles.*` Enigmin Pristup, 14 internih migracija i reset admin lozinke). Testovi: preneto 108 od 118 Devotion fajlova; 10 nije, svaki sa razlogom (migracije, pozivnice, mrtav kod, Devotion pokret, `/izlog`).

## 4. Šta nije urađeno ili je delimično

- **Ništa nije viđeno na pravoj bazi ni sa pravom prijavom.** Run ne sme da dira baze. Sve je kroz testove i lažni Convex.
- **Stanja učitavanja i greške** postoje u kodu, ali se ne vide u razvojnom prikazu, jer lažni Convex odmah vraća podatke (S25).
- **Web push** nije probao nijedan pravi pregledač ni uređaj. Bez VAPID ključeva prekidač se ne crta, a obaveštenja ostaju u Inboxu.
- **Expo push i telefon (Expo)** se ne prenose sada (P22). Backend za Expo tokene postoji i bez tokena ne šalje ništa.
- **AI provajderi** se samo čuvaju; ništa ih ne poziva, kao ni u Devotionu. Ključ (`aiProviders.apiKey`) je u bazi nešifrovan, kao u Devotionu.
- **Lid ↔ zadatak:** veza se postavlja samo pri pravljenju zadatka. Vezivanje postojećeg zadatka za firmu i brisanje veze nisu ponuđeni (S23).
- **Enigmine prečice** (Leadovi, režim poziva) su u pomoći samo za prikaz; obrađuju ih i dalje sami ekrani, da se ponašanje Leadova ne menja (S24).
- **Mapa na telefonu** je samo pregled (zum i pomeranje); uređuje se na računaru (S26).
- **Nisu montirani** `thought-sidebar-drag` i `thought-destination-picker`. Preneti su, ali ih ni Devotion nikad ne pali.
- **Nije spojeno sa `lib/format.ts`:** Devotion formateri datuma (`lib/prostor/dates.ts`, `calendar.ts`) i `formatFileSize` („1.5 MB“ sa tačkom) (S25).
- **Nedeljna obaveštenja Pulsa** (`sendWeeklyPulsNotifications`) nemaju cron, kao ni u Devotionu.
- **Stari Devotion linkovi** (`?view=…`) se ne podržavaju (P13).
- **Veličine ruta pre runa** nisu izmerene, jer stari kod nije smeo da se gradi. Dodatak spajanja je procenjen (odeljak 9).
- **Enigmin dug koji run nije smeo da dira:** odeljak 11.

## 5. BLOKADE

Nijedna BLOKADA ne traži tvoju odluku. Upisane su dve, obe su ograničenja okruženja:

1. **S25 — stanja učitavanja i greške se ne vide u razvojnom prikazu.** Kod ih ima na svakom ekranu. Proveri ih na pravoj bazi sa usporenom vezom (odeljak 8).
2. **S16 — Playwright MCP proces harnessa je ostao upaljen.** Klasifikator dozvola nije dao da ga korak ugasi. S29 je potvrdio da to nije stvarna blokada: proces ne drži port i gasi se sa sesijom.

## 6. ODLUKE koje traže tvoj stav

Samo izbori ukusa i politike. Tehničke odluke su u progress-u, po koraku.

### 6.1 Predlozi iz plana (P1–P28)

Run je sledio sve predloge. Svi čekaju tvoju potvrdu.

| # | Predlog (ukratko) | Stanje |
|---|---|---|
| P1 | Ime ostaje „Enigma Command Center“; „Devotion“ se ne vidi | sprovedeno (S29: nijedan vidljiv „Devotion“, „startup“, „radni prostor“) |
| P2 | Samo tamna tema; Devotion svetla tema se ne prenosi | sprovedeno |
| P3 | Enigmin dizajn sistem za radni deo (Aeonik, cijan radnja, 12 px, 44 px, mono samo za ID) | sprovedeno, čuvar `verify:prostor-dizajn` |
| P4 | Imenski prostor `prostor` u Convexu | sprovedeno |
| P5 | Projekat = startup (`workspaceId`), `startupAreas` → `areas`, `workspaces.opis` | sprovedeno |
| P6 | Enigmin auth je jedini; profil se pravi sam | sprovedeno |
| P7 | `owner` = vlasnik startupa, `urednik` = član, `client_viewer` bez radnog dela, admin = vlasnik platforme | sprovedeno |
| P8 | Svaka javna funkcija kroz omotač | sprovedeno (256/256, bez novih `// javno:`) |
| P9 | Ljudi = oni koji sa mnom dele projekat kao owner/urednik | sprovedeno i prošireno: i započinjanje razgovora (S06) |
| P10 | Samo navedeni paketi | sprovedeno |
| P11 | Base UI umesto Radixa, toast kroz `lib/toast.ts` | sprovedeno |
| P12 | Pokret kroz GSAP | sprovedeno |
| P13 | Prave rute, hub na `/projekti`, rezervisane putanje | sprovedeno |
| P14 | Traka levo + meni po grupama | sprovedeno |
| P15 | Telefon: donja traka Danas · Projekat · Zadaci · Poruke · Više | sprovedeno |
| P16 | Zvono sa „Čeka te“ i „Inbox“, push uz VAPID | sprovedeno |
| P17 | Danas iz svih projekata | sprovedeno |
| P18 | Jedna početna projekta | sprovedeno |
| P19 | Lid ↔ zadatak | sprovedeno, uz dodatno polje `pages.izvor` (vidi 6.2) |
| P20 | Jedna ⌘K paleta | sprovedeno |
| P21 | Bez Devotion migracija | sprovedeno |
| P22 | Telefon kasnije | sprovedeno |
| P23 | Fiksture za razvojni prikaz | sprovedeno |
| P24 | Gde ide kod | sprovedeno |
| P25 | Provere `verify:prostor-*` | sprovedeno (`prostor-pristup`, `prostor-dizajn`) |
| P26 | Podrazumevane oblasti i kanali (i za postojeće projekte, pri prvom otvaranju) | sprovedeno |
| P27 | Napredak se ne vezuje za radni deo | sprovedeno |
| P28 | Europe/Belgrade; „moji projekti“ do 50 | sprovedeno |

### 6.2 ODLUKE iz koraka

**Dozvole i ko šta vidi**
- Razgovor (DM, grupa) se započinje samo sa ljudima iz zajedničkog projekta; Devotion je dozvoljavao sa svima (S06 O1).
- „Admin“ u porukama je vlasnik platforme: samo on pravi i arhivira kanale tima i briše tuđe poruke; vlasnik projekta ne može (S06 O2, S15 O3).
- AI provajdere i lozinke članova vodi samo nalog koji je vlasnik projekta **i** vlasnik platforme (S05 O3, S21 O3).
- Opis projekta menja samo vlasnik projekta, do 500 znakova (S02 O7–O8).
- Posmatrač od grupe Rad vidi samo Početnu; na Pulsu i Aktivnosti vidi zaključano stanje (S09 O4, S20 O14).
- Odgovori i dalje vraćaju pune profile članova (sa e-poštom) i razlikuju „tuđ“ od „ne postoji“, kao u Devotionu; ne prelazi se granica projekta (S03 O6).
- Uklonjen član se skida sa zadataka tog projekta; preko 250 zadataka uklanjanje pada sa „Prvo ih preraspodelite.“ (S04 O2).
- Deaktiviran profil vidi samo „Profil još nije spreman. Osveži stranicu.“ (S04).
- Profil se pravi pri prihvatanju pozivnice; greška pri tome se guta da prijava nikad ne padne; posmatrač profil ne dobija (S22 O1–O2).

**Danas, početna i zvono**
- „Čeka te“ na Danas pokazuje 3 stavke, ne 5, da napredak ostane iznad preloma (S19 O1).
- Kartica napretka na Danas je tiha: bez XP-a i zlata, nivo samo tekstom (S18 E3, S19 O6).
- Devotion „Čeka tebe“ se zove „Ideje za glasanje“ (S18 E7).
- Fokus početne za urednika je „Za tebe“, a jedina primarna radnja „Novi zadatak“ (S18 E8, S20 O2).
- Blok „Čeka te“ na početnoj nosi naslov „Šta me čeka“ (S20 O1).
- Trijaža: 8 redova po zoni, „Prikaži još“ do 100 (S20 O6).
- Inbox u zvonu je lični i isti u „Ja“ i u projektu; broj na zvonu projekta = posao projekta + ceo nepročitani Inbox (S17 O1).
- Toast za nova obaveštenja čita lični Inbox iz svih projekata (S17 O5).
- Radnje u „Čeka te“ su neutralna dugmad sa strelicom, ne u boji modula (S27 O2).
- „Upozorenje → zadatak“ postoji samo u zvonu projekta, ne u zvonu „Ja“ ni u bloku početne (S23 O7).

**Rad sa zadacima i dokumentima**
- Novi zadatak se ne otvara sam; toast nudi samo „Poništi“, bez „Otvori“ (S12 O6, S16 O4).
- Završen red čeka ≈ 0,74 s pre selidbe; kvačica bez „bouncy“ efekta (S08 O8, S12 O2).
- „Hitno“ je žuto, „Visok“ neutralan; crveno samo kašnjenje (S12 O11).
- „Sredi rokove“ stoji i na ekranu Zadaci, ne samo na početnoj (S12 O10).
- Dijalog konflikta: „Prepiši“ primarno, „Učitaj najnoviju“ sporedno (S10 O7).
- Brisanje kolone i reda tabele traži potvrdu (Devotion je brisao odmah) (S11 O3).
- Boja „Ćilibar“ je sada „Narandžasta“, iz palete kategorija (S14 O1).
- Poništi/Ponovi na mapi važi samo dok je mapa otvorena (S14 O3); točkić skroluje stranicu dok ne klikneš u mapu (S14 O5).
- Mapa na telefonu je samo pregled (S26 O2).

**Poruke i ⌘K**
- Pretraga sadržaja poruka je u ⌘K, ne na `/poruke` (S15 O1).
- U „Ja“ ⌘K pretražuje samo lične razgovore; pretrage kroz sve projekte nema (S24 O5).
- `?` je globalna pomoć; lokalno `?` na tabeli Leadova je uklonjeno (S24 O1). Pomoć navodi sve prečice, ne samo aktivne (S24 O4).
- Misao iz ⌘K vodi na mapu beleški projekta (S24 O9).

**Lid ↔ zadatak**
- Dodato polje `pages.izvor` (vrsta, naslov, putanja), da zadatak vodi nazad na povod; plan je imao samo `leadCompanyId` (S23 O1).
- Zadaci na profilu firme su jezičak, ne odeljak (S23 O8).
- Komentar vodi na ekran komentara, ne na sam komentar (S23 O5).

**Ljuska, tekst i ponašanje**
- „Početna“ zamenjuje „Kontrolna tabla“ u meniju (S09 O7).
- Pločica projekta iz „Ja“ vodi na početnu, a iz projekta na isti ekran drugog projekta (S09 O8).
- Svi Enigmini dijalozi sada blago ulaze i izlaze (200 ms); ranije animacija nije radila (S08 O3).
- Dugme Nazad u pregledaču ne pita „Ostani / Napusti“; pita samo klik na interni link (S08 O7).
- Kratka oznaka roka „D-3“ je postala „za 3 d“ (S25 O3).
- „Šta radi“ na početnoj projekta ostaje kartica u kartici (Enigmin blok, nije diran) (S27 O1).
- Ključevi lokalnog skladišta `devotion:*` → `enigma:*`; zapamćeni izbori (prikaz Ideja, kartica oblasti, odredište brzog unosa) vraćaju se na podrazumevane (S29).

## 7. Paketi, env i deploy, tačnim redom

**Pre deploya**
1. `npm ci` lokalno, pa provere iz odeljka 10 i `npm run build`.
2. U produkcionoj bazi proveri da nijedan projekat nema adresu (slug) koja je sada rezervisana: `zadaci`, `ideje`, `poruke`, `dokumenti`, `stranica`, `korpa`, `puls`, `aktivnost`, `beleske`, `projekti`, `moji-zadaci`, `inbox`, `otvori`.
3. `digital.enigmait.rs` ne sme biti u domenima panela (Podešavanja → Projekat → Domeni), inače nema trake ni Danas.

**Deploy**
1. **Convex prvo:** `npx convex deploy`. Šema dobija 51 novu tabelu, nove indekse i opciona polja (`workspaces.opis`), funkcije `prostor.*` i cron „podsetnici za rokove“ (6 h). Postojeći podaci se ne menjaju. Prvi prolaz crona šalje podsetnike za otvorene zadatke sa rokom u poslednjih 14 dana i sledećih 48 h; zadataka još nema, pa ništa.
2. **Odmah zatim front:** merge `spajanje-run` u `main` (fast-forward) i push; Vercel gradi. Između ta dva koraka stari front radi nad novim backendom. To je bezbedno: backend je dobio nove tabele, opciona polja i nove funkcije, a postojeće Enigmine funkcije su zadržale argumente i odgovore.

**Nove env promenljive (samo imena)**

| Gde | Ime | Obavezno? |
|---|---|---|
| Convex | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Za web push sve tri; bez njih push je isključen bez greške |
| Vercel | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (isti javni ključ kao u Convexu) | Za prekidač push-a; ugrađuje se pri buildu, pa posle postavljanja treba nov deploy fronta |
| Convex | `EXPO_ACCESS_TOKEN` | Ne; tek za telefon (Expo) |

**Posle deploya, samo od sebe**
- Profil (ime, avatar) za postojeće korisnike nastaje sam pri prvom ulasku (`prostor.profiles.ensureCurrent` iz `auth-gate`). Za pozvanog člana nastaje pri prihvatanju pozivnice.
- Postojeći projekti (Enigma IT) dobijaju oblasti Razvoj/Marketing/Prodaja/Ostalo i kanale poruka pri prvom otvaranju od strane vlasnika ili urednika (`pripremiRadniDeo`, idempotentno). Novi projekti ih dobijaju pri pravljenju.
- Migracija podataka nema; Devotion podaci se ne prenose (O6).

**Stara Devotion produkcija (`notionofstartups.vercel.app`): samo predlog**
- Ostavi je kako jeste dok ne proveriš spojenu verziju sa timom (odeljak 8). Devotion repo i telefon i dalje gađaju njen Convex.
- Kad potvrdiš, na Vercel projektu Devotiona dodaj trajno preusmerenje svih putanja na `https://digital.enigmait.rs/` (bez pokušaja da se mapiraju stari `?view=` linkovi, jer se ne podržavaju). Njen Convex ne briši dok ne dođe run za telefon.
- Pre preusmerenja javi timu da se prijavljuje Enigminim nalogom; Devotion nalozi se ne prenose.

## 8. Šta ručno proveravaš, po važnosti

1. **Prava prijava.** Prijavi se na dev bazi (`npx convex dev`): Danas se otvara posle prijave, profil nastaje sam (ime u meniju korisnika), traka levo pokazuje „Ja“ i projekte. Odjava i ponovna prijava rade kao pre.
2. **Pravi projekat Enigma IT.** Otvori `/enigma-it`: oblasti i kanali se pojave sami. Napravi stranicu, piši, sačekaj „Sačuvano“; u drugoj kartici izmeni istu stranicu i vidi dijalog konflikta. Napravi zadatak, dodeli ga sebi i završi ga kvačicom („Poništi“ vraća). Proveri da su Leadovi, kanali, oglasi i Podešavanja isti kao pre.
3. **Tim.** Pozovi test adresu kroz Pristup, registruj je i proveri da se novi član odmah vidi u dodeli zadatka i u Porukama. Pošalji mu @pominjanje u komentaru: dobija stavku u Inboxu i u zvonu.
4. **Push na pravom pregledaču.** Postavi VAPID promenljive (odeljak 7), uključi „Obaveštenja na ovom uređaju“ na računaru i telefonu, dodeli zadatak sa drugog naloga: sistemsko obaveštenje stiže, a klik vodi na zadatak.
5. **Leadovi i zadaci.** Na profilu firme otvori „Zadaci“ → „Novi zadatak“; zadatak se vidi u Zadacima projekta sa imenom firme, a „Firma: …“ vraća na profil. Na IG/FB komentaru bez odgovora probaj „Napravi zadatak“. U ⌘K potraži firmu po imenu.
6. **Učitavanje i greške.** U DevTools uspori mrežu i otvori Danas, Zadatke, stranicu, Poruke, Korpu, mapu beleški: kosturi umesto skoka, a pri grešci poruka, ne prazan ekran.
7. **Telefon.** Na pravom telefonu: donja traka, „Više“, uređivač stranice sa tastaturom, panel zadatka, mapa (samo pregled).
8. **Prisustvo i prilozi.** Dve kartice na istoj stranici: „<Ime> uređuje“. Otpremi pravu sliku, PDF i `.xlsx` (uvoz u tabelu). Vrati stariju verziju beleške.
9. **AI ključ.** Pre nego što neko unese pravi AI ključ, odluči da li ga šifrujemo kroz `convex/lib/crypto.ts` (sada je u bazi otvoren).

## 9. Brojevi

| Mera | Pre runa (`main`) | Posle runa |
|---|---|---|
| Testovi (`npx vitest run`) | 1.168 u 69 fajlova | 2.651 u 209 fajlova |
| Javne Convex funkcije (`verify:pristup`) | 379 (364 omotačem, 15 `// javno:`) | 635 (620 omotačem, 15 `// javno:`) |
| Od toga radni deo (`convex/prostor/`) | — | 256 javnih (178 projektnih, 78 ličnih) + 19 internih |
| Tabele (`verify:purge`) | 145 + 7 auth | 196 + 7 auth (51 nova, sve sa odlukom o brisanju) |
| Convex moduli radnog dela | — | 40 fajlova u `convex/prostor/` (+ `lib/`), 53 test fajla |
| Direktni pozivi sa fronta (`verify-pristup`) | 32 | 161, 0 nedozvoljenih |
| Regresione provere | 19 | 21 (ultra 5, prostor 2) |
| Rute ekrana | — | Ja: 8 (`/`, `/moji-zadaci`, `/inbox`, `/poruke`, `/beleske`, `/projekti`, `/novi`, `/otvori`); projekat: 9 novih (`zadaci`, `ideje`, `poruke`, `dokumenti`, `stranica`, `beleske`, `korpa`, `puls`, `aktivnost`) |

**Veličine ruta** (prvo učitavanje JS, KB nekompresovano / gzip, posle S28; izvor `.nocni-run/spajanje/tmp/s28/bundle-kraj.json`):

| Ruta | KB |
|---|---|
| Ljuska (zajedničko svim rutama iza prijave) | 1350 / 432 |
| `/` Danas | 1636 / 528 |
| `/[projekat]` početna | 2153 / 678 |
| `/[projekat]/zadaci` | 1621 / 526 |
| `/[projekat]/stranica/[id]` | 1790 / 575 |
| `/[projekat]/leadovi` | 1692 / 533 |
| `/[projekat]/analytics` | 1829 / 571 |
| `/[projekat]/ads` | 1979 / 606 |
| `/login` | 824 / 255 |

Tiptap (454 KB), xyflow (193 KB), `read-excel-file` (78 KB) i mapa leadova su lenji i nisu u prvom učitavanju nijedne rute. Procena dodatka spajanja na Enigminim ekranima: oko 140 KB (Leadovi ≈ +9 % u odnosu na početak runa). Tačno poređenje sa `main` nije moguće, jer Next 16 build ne štampa KB po ruti, a stari kod run nije smeo da gradi.

**Merenje ekrana** (`node .nocni-run/spajanje/merenje.cjs --oznaka SPAJANJE --port 3117`; kopija ULTRA1 alata sa novim ekranima; rezultat u `docs/spajanje/merenja/SPAJANJE-sazetak.md`):

| Mera | Enigma pre runa (T14) | Enigma sada | Radni deo sada |
|---|---|---|---|
| Izmereno ekrana (1536 / 390) | 60 / 56 | 60 / 56 | 33 / 33 |
| Tekst ispod 12 px (1536) | 0 od 10474 | 0 od 11576 | 0 od 3401 |
| Tekst ispod 12 px (390) | 0 od 8182 | 0 od 8240 | 0 od 2107 |
| Ekrani bez primarnog dugmeta iznad preloma (1536) | 17 | 17 | 16 |
| Ekrani sa više od jednog primarnog iznad preloma (1536) | — | nema | nema |
| Dugmad bez uloge (default) iznad preloma (1536) | 0 | 0 | 0 |
| Dodirne mete ispod 44 px (390) | 301 od 1964 (15,3 %) | 287 od 2158 (13.3 %) | 39 od 1088 (3.6 %) |
| Najduže strane (1536, u visinama ekrana) | uvoz-pregled 8,95 · podesavanja 6,73 | uvoz-pregled 8.95 · podesavanja 6.73 · threads 5.65 · youtube 4.9 · uvoz-nereseno 4.85 | stranica 2.86 · aktivnost 2.49 · puls 2.34 · beleske-ja 2.31 · inbox 2.22 |
| Medijana boja teksta / pozadine (1536) | 11 / 16 | 11 / 19 | 9 / 13 |
| Najviša lepljiva gornja traka (390) | 101 px | 101 px | 56 px |
| Vodoravni preliv (390) | instagram-komentari | instagram-komentari | nema |
| Greške u konzoli (1536 + 390) | — | 3 | 0 |

- Polazno je ULTRA1 T14, poslednje merenje `main`-a pre runa, istim alatom. Enigmini ekrani su isti spisak (sada pod `/enigma-it/…`); radni deo je nov, pa nema polaznu vrednost.
- Enigma se nije pokvarila: tekst ispod 12 px ostaje 0, ekrana bez primarnog dugmeta iznad preloma ostaje 17, a male dodirne mete na 390 su pale sa 15,3 % na 13,3 % (nova ljuska).
- Radni deo: 0 sitnog teksta, 3,6 % malih dodirnih meta (najviše na mapi oblasti 10/34 i stranici-tabeli 8/59), gornja traka na 390 je 56 px, bez vodoravnog preliva.
- 16 ekrana radnog dela nema primarno dugme iznad preloma (stranice, korpa, puls, aktivnost, podešavanja…). To je namerno: pravilo je najviše jedno primarno dugme, a ekran za čitanje ga ne mora imati.
- Tri greške u konzoli su namerni padovi (`napredak-pad`, `ljuska-pad-napretka`, `?pad=napredak`). Na ekranima radnog dela grešaka nema.
- Dva klika iz starog ULTRA1 spiska ne pogađaju novu ljusku na 390 (`ljuska-meni`: klik na „Meni korisnika“ istekao posle 10 s; `ljuska-danas`: dugme „Šta me čeka“ u donjoj traci više ne postoji, jer je zvono sada „Čeka te“ u gornjoj traci). Ta dva ekrana su izmerena bez otvorenog sloja; to je zastareo selektor alata, ne greška ekrana.
- Ceo spisak: `docs/spajanje/merenja/SPAJANJE.jsonl` (184 merenja), sažetak `SPAJANJE-sazetak.md` i `.json`.

Pristupačnost (S28, axe-core 4.13): 0 nalaza u radnom delu i u svim otvorenim slojevima, na 24 ekrana na 1536 i 390, plus 14 radnji tastaturom.

## 10. Rezultat provera

Pušteno u S30, posle merenja i snimaka (kod u S30 nije menjan, pa `npx convex codegen` nije bio potreban):

| Provera | Rezultat |
|---|---|
| `npm run typecheck` | prolazi (izlaz 0) |
| `npm run lint` | prolazi: 0 grešaka, 1.210 upozorenja (isto kao posle S21) |
| `npx --no-install vitest run` | prolazi: 209 fajlova, 2.651 test |
| `node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts` | prolazi: 635 javnih (620 omotačem, 15 `// javno:`, 0 bez omotača); front 161 direktan poziv, 0 nedozvoljenih |
| `node .nocni-run/spajanje/regresije.mjs` | prolazi: 21 provera (`verify:ultra-*` 5, `verify:prostor-*` 2) |
| `npm run build` (sa `verify:purge`) | prolazi (izlaz 0) |

Provere koje su padale i pre runa (`.nocni-run/spajanje/baseline.txt`): nema. Dev server na 3117 je ugašen, port je slobodan.

## 11. Zatečeno (nije od runa)

**Enigma (run ih nije smeo da dira)**
- Podešavanja → GA4 konfiguracija na 390: dve tabele sa vodoravnim skrolom nisu dostupne tastaturi (axe `scrollable-region-focusable`). Ispravka: omotač tabele dobija `tabIndex={0}` i ime.
- `performance-highlights.tsx` („Šta radi“) i Podešavanja → Integracije imaju karticu u kartici; Leadovi nemaju `h1`.
- `dark:text-warning` na tri Instagram ekrana (bez efekta); selektor `[stroke='#ccc']` u `components/ui/chart.tsx`.
- Instagram komentari na 390 imaju vodoravni preliv (isti nalaz kao u ULTRA1 T14).
- IG komentari nemaju fiksturu u razvojnom prikazu (`igCommentsStore.listThreads`).
- Radna kopija ima izmene u `.agents/skills/convex-*` koje nisu od runa; nisu dirane.

**Devotion (snimak)**
- `attach` je dozvoljavao podmetanje i brisanje tuđeg fajla (logo, slika, avatar). U Enigmi je zatvoreno (S05).
- `aiProviders.apiKey` je čuvan nešifrovan; tako je i preneto.
- `listContributionsPaginated` nema gornju granicu; više upita vraća pune profile sa e-poštom.
- `sendWeeklyPulsNotifications` postoji, a nijedan cron je ne zove.
- `thought-sidebar-drag` i `thought-destination-picker` su mrtav kod.
- Gramatika toasta („Fajl je kreirana“, „Dodato je 2 fajlova“) i mešani CRLF/LF; ispravljeno pri prenosu.

**Alati i platforma**
- npm 10.9.8 skida polja `libc` iz lockfile-a, a npm 11 ih ne vraća (bez posledica). `npm dedupe` podiže nepovezane pakete.
- `npx convex codegen` u ovoj verziji CLI-ja šalje šemu dev deploymentu na proveru (`start_push`).
- Next 16 build ne štampa KB po ruti; `next experimental-analyze` kvari `.next/dev` (posle njega `next dev` daje 404).
- Zastareli `.next/types` i `.next/dev/types` obaraju `tsc` posle promene ruta; pomaže brisanje `.next`.
- Razvojni prikaz gubi `?ux=1` pri navigaciji klikom; Next razvojni znak pokriva profil na dnu trake (samo u dev-u).
- Tailwind 4 skenira i `docs/` i logove Playwright-a, pa doslovna klasa u dokumentu može da obori CSS (S08).
- `convex-test` 0.0.65 ne pušta sat transakcije unazad.
- Claude Code klasifikator dozvola ne da koraku da ugasi proces (Playwright MCP), a CLI gasi pozadinske radnike 10 minuta posle kraja poteza.
