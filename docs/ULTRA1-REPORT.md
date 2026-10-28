# ULTRA1 — završni izveštaj („Istina i temelj“)

Run: grana `ultra1-run` sa `main`, 27.–28. 10. 2026, koraci T01–T14, faze U0–U3. Plan je u `docs/ULTRA-PLAN.md`. Detalji po koraku, sa svim ODLUKAMA, su u `docs/ULTRA1-PROGRESS.md`. Ništa nije gurnuto na GitHub ni pušteno na produkciju. Nijedna baza nije dirana.

## 0. Ukratko
- Brojevi i statusi govore istinu. Svaka veza ima jedan status (Radi / Traži pažnju / Nije povezano), isti na tački, kanalu, Podešavanjima i zvonu. Izmišljene nule i frekvencije su postale „—“ sa razlogom. Rast troška više nije zelen. Valuta dolazi iz naloga, bez tvrdo upisanog „€“.
- Leadovi: beleška više nije kontakt. Svaka nova firma dobija zaduženje. Zatvoren posao nije zaostao. Dodato je dugme „Urađeno“, a „Zovi sada“ ne zove pre dogovora. Stare firme bez zaduženja čekaju migraciju koju puštaš ti (odeljak 6).
- Pravila se više ne upisuju sama. Pravilo koje pauzira traži probu i potvrdu, a istorija ima „Vrati kampanju“.
- Temelj sistema: jedna boja radnje (cijan) na svim modulima, šest uloga dugmeta bez `default`, 44 px na dodir u primitivima, ništa ispod 12 px, kontrast bez providnosti, mono samo za ID i brojčane kolone, jedan `Select`, jedan format (P7) i jedan rečnik bez sirovih API naziva.
- Pet novih provera (`verify:ultra-*`) čuva sve ovo. `regresije` ih pušta same.
- Merenje (116 ekrana): tekst ispod 12 px pao je sa 548 na 0, male dodirne mete na telefonu sa 56,3 % na 15,3 % (cilj je bio ispod 10 %), dugmad bez uloge na 0. Kontrast axe-om nije meren.
- Ostaje šest BLOKADA (odeljak 4), migracija zaduženja i ručna provera na pravim podacima. Ništa od toga nije viđeno na produkciji.

## 1. Kako da pregledaš granu
```bash
git log --oneline main..ultra1-run      # 15 commitova: zatečene izmene, start, T01–T13 (T14 dodaje runner)
git diff --stat main...ultra1-run       # 462 fajla, +27.687 / −5.862 (pre T14)
npm run dev                             # pa otvori http://localhost:3000/?ux=1
```
- Razvojni prikaz (`?ux=1`) radi bez prijave i bez Convex-a, nad fiksturama iz `app/dev-ux/`. Primeri: `/?ux=1`, `/leadovi?ux=1`, `/instagram?ux=1`, `/ads?ux=1`, `/rules?ux=1`, `/settings?ux=1`, `/sistem?ux=1` (vodič sistema). Prazno stanje: dodaj `&prazno=1`.
- Linkovi u razvojnom prikazu gube `?ux=1` (zatečeno), pa posle klika dodaj `?ux=1` ručno.
- Snimci po koracima su u `docs/ultra/snimci/T<ID>-*.png` (77 snimaka).

## 2. Šta je urađeno po fazama

| Faza | Šta | Koraci | Snimci |
|---|---|---|---|
| U0 | Odluke O1–O21 i P1–P8 upisane u `PRODUCT.md`, `DESIGN.md` i `CLAUDE.md`. Ciljni DNK je u `docs/ultra/dna-cilj.json`. | T01 | — |
| U1 | Leadovi: beleška ne menja „poslednji kontakt“; „Tražio da ga ne zovemo“ uvek nudi zabranu; zaduženje pri svakom nastanku firme (uvoz, upit, poruka, kopija) i migracija za stare; zatvorene faze nisu zaostale i brišu korak; mutacija `zavrsiKorak` i dugme „Urađeno“; „Vrati se na“ pokazuje i današnje korake; „Zovi sada“ preskače firmu sa korakom. | T02 | `T02-*` (6) |
| U2 | Jedan status veze (`convex/lib/statusVeze.ts`, `useStatusVeza`) za tačku, zaglavlje kanala, Podešavanja, tablu i zvono; baner o dozvoli u kompozeru samo kad dozvola fali. „—“ sa razlogom umesto izmišljenih vrednosti (Oglasi, Google, Instagram, retencija, Threads). Rečnik mera `lib/mere.ts` sa smerom; valuta naloga sa upozorenjem. Period se pamti po projektu i ide u linkove; jezičci Podešavanja čuvaju adresu; nacrti Novosti iz baze. Pravila bez samoupisa, sa probom i „Vrati kampanju“. | T03 (plan), T04, T05, T06, T07 | `T04-*` (8), `T05-*` (6), `T06-*` (6), `T07-*` (10) |
| U3 | Boja radnje `--radnja` (P1) i šest uloga dugmeta; 44 px na dodir u primitivima i za ručno pisana dugmad; 12 px minimum (88 klasa, 14 osa, jedan bedž, SVG oznake); kontrast bez providnosti i `--text-muted` 0,86; mono po P2 (749 → 254); `components/ui/select.tsx` umesto 35 izvornih `<select>`; `lib/format.ts` po P7; `lib/recnik.ts`, `NazivMere` sa akronimom u oblačiću, „Ctrl K“, bez env imena na ekranu. | T08 (plan), T09, T10, T11, T12 | `T09-*` (8), `T10-*` (8), `T11-*` (15), `T12-*` (7) |
| — | Revizija runa: 48 nalaza, 33 popravljena, nijedan kritičan. | T13 | `T13-*` (3) |
| — | Završno merenje i ovaj izveštaj. | T14 | — |

## 3. Šta nije urađeno ili je delimično, i zašto
1. **Migracija zaduženja nije puštena.** Run ne dira bazu (P8). Koraci su u odeljku 6.
2. **Boja modula na oko 650 mesta u ekranima.** Izašla je sa dugmadi, fokus brojeva, pločica i čipova. Ostaje na izabranim stanjima, ikonicama, `hover:text-mod` i trakama napretka u ekranima kanala, Leadova i Analitike (T08 §1.6, nalaz T13 #38). Plafon u `verify:ultra-dugmad` (654) sprečava rast. Čiste ga faze U10–U16.
3. **Neaktivne stavke bočne trake** i dalje imaju ikonicu u boji modula. Cilj iz `CLAUDE.md` je „samo aktivna stavka“. To je navigacija (U10).
4. **Dodirne mete van primitiva.** Ostaju linkovi naziva firme u tabeli i uske ćelije (problem je širina, ne visina). Na telefonu je 15,3 % meta ispod 44 px, a cilj U3 je bio ispod 10 % (odeljak 8).
5. **Novosti: čuvanje nesačuvanog unosa** u uredniku ne postoji, pa `localStorage` ne čuva ništa (T06). To je posao za U13.
6. **„Pokreni proveru sad“ u Pravilima** i dalje pauzira bez probe (zatečeno). Proba štiti uključivanje pravila, ne ručnu proveru.
7. **Rečnik:** poruke grešaka iz koda koji run nije menjao („Ad Set nije pronađen.“, „Cooldown ne može biti negativan.“) i sirov izvor na profilu firme („google_maps (potvrđeno)“). Zatečeno, za kasniji run (T13 #41, #47).
8. **Kontrast nije meren axe-om.** Merenje je rađeno bez axe-a, kao revizija. `contrast-check` prolazi nad 262 para tokena, ali kompozicije meri tek axe (odeljak 8).
9. **Svesno van U2** (za U11 i U14): popunjavanje nulama u `lib/metrics.ts`, `instagram-stories` (`?? 0`), `realtime-dashboard`, zbir pratilaca Instagrama na Threads-u (T05 ODLUKE).
10. **Grane spremnosti „Povezan“/„Sinhronizuje“** u ekranima kanala su mrtve, ali ostaju u kodu dok ih ne obriše šablon kanala (U11).

## 4. BLOKADE
| # | Šta | Zašto nije urađeno | Šta treba |
|---|---|---|---|
| B1 | Proba pravila i predlog praga čitaju sve `adInsights` redove kroz `.collect()` (T13 #12). | Kod mnogo oglasa mogu da pređu granicu čitanja Convex-a. Isto čitanje deli evaluator koji pauzira kampanje, a noću i bez baze se ne meri. | Otvori Pravila → „Dodaj iz šablona“ na pravim podacima. Ako stigne greška o previše pročitanih dokumenata, treba indeks po periodu. |
| B2 | Hub i birač projekata ne znaju za „server nije podešen“ ni za stare podatke (T13 #13). | Višeprojektni sloj je van obima (plan §2). | Hub može da kaže „Veze rade“ dok tačka kaže „1 veza traži pažnju“. Odluka: preći hub na `statusVeze`. |
| B3 | Zvono čita sat u upitu, pa prelaz praga zbog samog vremena (token 7 d, podaci 24 h) vidi tek pri sledećem upisu (T13 #14). | Popravka menja argumente zaštićenog upita zvona i sve njegove potrošače. | Odluka: argument `sada` za zvono. Upisi sinhronizacije u praksi skraćuju kašnjenje. |
| B4 | Threads sa isteklim tokenom prazni ceo ekran umesto da pokaže podatke i traku (T13 #15). | Zatečeno, u kodu koji run nije menjao. | Šablon kanala (U11). |
| B5 | Boja modula van mape T08 (T13 #38). | Mapa plana ih ne obuhvata; menjanje rasporeda ekrana je van U3. | Faze U11–U16. |
| B6 | Playwright MCP koji runner podiže iz `mcp.json` ostaje upaljen do kraja sesije (T01). | Gašenje je odbio klasifikator auto režima. | Runner (`nocni-run.ps1`) posle koraka gasi MCP decu sesije. |

## 5. Predlozi P1–P8 i ODLUKE koje traže tvoj stav

| # | Šta | Gde se menja | Korak |
|---|---|---|---|
| P1 | Boja radnje je brend cijan `--accent-400` (#58c4ff) sa tamnim tekstom, ista na svakom modulu. | `app/globals.css` (`--radnja*`), `components/ui/button.tsx` | T09 |
| P2 | Mono samo za ID, kod i brojčane kolone tabela; fokus brojevi i pločice su Aeonik sa `tabular-nums`. | `lib/tipografija-cuvar.ts` (M1–M3), ~140 fajlova | T10 |
| P3 | Status veze: Radi / Traži pažnju / Nije povezano; tačka je zelena samo kad sve povezane veze rade. | `convex/lib/statusVeze.ts` | T04 |
| P4 | Period se pamti po projektu (lokalno), podrazumevano 28 d, i ide u linkove. | `lib/date-range.ts`, `lib/rutiranje.ts` | T06 |
| P5 | Šabloni pravila se ne upisuju sami; prag = 2× medijana za 28 d; pauza tek posle probe. | `convex/rulesStore.ts`, `convex/lib/pravilaProcena.ts` | T07 |
| P6 | Nove provere se zovu `verify:ultra-<oblast>` i `regresije` ih pušta same. | `package.json`, `scripts/verify-ultra-*.ts` | T09–T12 |
| P7 | Formati „27. 10. 2026.“, „27. okt“, „17:41“, „1 min 1 s“, „53,8 %“, „12.480“. | `lib/format.ts`, `convex/lib/formatJezgro.ts` | T11 |
| P8 | Nova firma dobija zaduženje odmah; stare kroz internu migraciju koju puštaš ti. | `convex/lib/leadZaduzenje.ts`, `convex/leadZaduzenja.ts` | T02 |
| 1 | Fokus, uključen filter i aktivni jezičak su u boji radnje, ne modula. | `CLAUDE.md`, `DESIGN.md`, `globals.css` | T01, T09 |
| 2 | „Zovi sada“ isključuje firmu i sa zakasnelim korakom (ne samo budućim). | `convex/lib/leadKorak.ts` | T02 |
| 3 | Kopija firme u drugi projekat dobija zaduženje. | `convex/leadUnakrsnoStore.ts` | T02 |
| 4 | „Postojeći klijent“ ne nudi zabranu kontakta. | `convex/leadCrmStore.ts` | T02 |
| 5 | „Urađeno“ ne donosi XP. | `convex/leadCrmStore.ts` (`korakZatvoren`) | T02 |
| 6 | Stare firme kojima je beleška ranije pomerila „poslednji kontakt“ se ne ispravljaju. | — (posebna migracija ako treba) | T02 |
| 7 | Token traži pažnju 7 dana pre isteka (i u hubu i biraču); dani se broje naviše. | `convex/lib/statusVeze.ts`, `lib/token-expiry.ts`, `connections-settings.tsx` | T04, T13 |
| 8 | Threads: stari podaci tek posle 48 h (ostali 24 h). | `convex/lib/zdravljeVeza.ts` | T04 |
| 9 | Zvono javlja i token koji ističe i stare podatke; radnja je „Poveži ponovo“. | `convex/lib/notifications.ts` | T04 |
| 10 | Sklonjeno upozorenje ostaje sklonjeno i kad se razlog promeni (ključ ne zavisi od razloga). | `convex/lib/notifications.ts` | T04, T13 #39 |
| 11 | OpenReply bez webhook-a na serveru traži pažnju. | `convex/lib/serverPodesen.ts` | T13 |
| 12 | Potrošnja i frekvencija su „manje je bolje“ (rast je crven). | `lib/mere.ts` | T05 |
| 13 | Istorija radnji piše stare promene budžeta bez znaka valute. | `settings/action-audit-log.tsx` | T05 |
| 14 | `?campaignId=` otvara detalj kampanje. | `ads/ads-dashboard.tsx` | T05 |
| 15 | „Poslovanje · stanje sada“ umesto preimenovanja brojki sa sajta; „Danas · misije“; arhiva Novosti u istom upitu kao nacrti. | `overview/*`, `convex/postsStore.ts` | T06 |
| 16 | Pravilo iz šablona donosi događaj u Napretku; istorija piše „prag sada“; preimenovanje aktivnog pravila ne traži probu; urednik više ne dodaje šablone (samo vlasnik). | `convex/rulesStore.ts` | T07 |
| 17 | Ručna provera jednog isključenog pravila preko API-ja ide bez probe (zatečeno). | `convex/rules.ts` | T13 #40 |
| 18 | Pravilo 44 px važi i za ručno pisana dugmad; bela oznaka „#1“ u mrežama objava; opasno dugme kao tinta; neutralni merači napretka. | `app/globals.css`, mreže objava, `ui/button.tsx` | T09 |
| 19 | `--text-muted` je 0,86 (malo svetliji); datumi u tabelama bez mono; e-mail, vremenska zona i valuta kao kod (mono); neaktivne automatizacije bez prigušenja. | `globals.css`, tabele | T10 |
| 20 | Dužina YouTube videa „1 h 2 min“; procenat uvek sa jednom decimalom („53,0 %“); godina u dnevnicima; kategorija videa sa „Ostaje kakva jeste“. | `lib/format.ts`, YouTube dijalozi | T11 |
| 21 | Polje datuma bez `inputMode` (iPhone tastatura brojeva nema tačku). | `date-range-picker.tsx` | T13 |
| 22 | Nazivi kanala „Meta Ads“/„Google Ads“ i u hubu; kraći ciljevi kampanje („Upiti“); „Vruće“ umesto „Vrelo“; „System User“ ostaje u rečenicama. | `lib/recnik.ts`, `lib/hub-zbir.ts`, `lib/temperature.ts` | T12 |
| 23 | `testTimeout` 30 s za čuvare koda u vitest-u (bili su nestabilni na 5 s). | `vitest.config.mts` | T12 |
| 24 | Threads brojač piše „još N mesta“ (broji bajtove, ne znakove). | `threads/threads-composer.tsx` | T13 |

## 6. Migracije, env i deploy
Ništa od ovoga nije rađeno u runu. Redosled:

1. **Pregledaj i spoji granu** `ultra1-run` u `main` (odeljak 1).
2. **Provere pre deploya** (lokalno): `npm run typecheck`, `npm run lint`, `npx vitest run`, `node .nocni-run/ultra1/regresije.mjs`, `npm run build`.
3. **Env — novih promenljivih nema.** Status veze sada čita postojeće promenljive na Convex-u i traži pažnju kad fale. Pre deploya proveri na produkcionom Convex-u (Dashboard → Settings → Environment Variables):
   - `INSTAGRAM_APP_ID` i `INSTAGRAM_APP_SECRET` (i parove za Facebook, Threads i YouTube, ako su ti kanali povezani);
   - `IG_WEBHOOK_VERIFY_TOKEN` i `META_APP_SECRET` ili `INSTAGRAM_APP_SECRET` (OpenReply);
   - `ADS_WRITE_ENABLED=true`, ako želiš da pravila stvarno pauziraju i da „Vrati kampanju“ radi.
4. **Convex prvi:** `npm run deploy:convex` (pušta `verify:purge`, pa `npx convex deploy`). Šema dobija samo opciono polje `leadStageEvents.korakZatvoren`, bez novih indeksa, pa deploy ne traži migraciju šeme.
5. **Odmah posle toga front** (Vercel, uobičajen deploy sa `main`). Između ova dva koraka stari front na Pravilima zove obrisanu `ensureTemplateRules` i dobija grešku, pa ih radi jedan za drugim.
6. **Migracija zaduženja (T02, P8)** posle deploya Convex-a. Prvo probno (samo broji), pa pravo. Sama ide serijama od 100 i na kraju upiše zbir u log.
   - Bash:
     ```bash
     npx convex run --prod leadZaduzenja:dodeliBezZaduzenja '{"probno":true}'
     npx convex run --prod leadZaduzenja:dodeliBezZaduzenja '{}'
     ```
   - PowerShell 5.1:
     ```powershell
     npx convex run --prod leadZaduzenja:dodeliBezZaduzenja '{\"probno\":true}'
     npx convex run --prod leadZaduzenja:dodeliBezZaduzenja '{}'
     ```
   - Za jedan projekat dodaj `"workspaceId":"<id>"` u JSON.
   - Provera: Leadovi → Rupe → „Bez vlasnika“ pada na 0 (osim projekta bez vlasnika, koji migracija broji kao `bezVlasnika`).
   - Svaka dodela piše događaj „dodela“. Ako firmi bez zaduženja ima više od oko 600, Napredak tog dana piše da je odsečen; drugih posledica nema.
7. **Google oglasi:** stare izmišljene vrednosti (doseg = prikazi, frekvencija 1) brišu se same pri sledećoj sinhronizaciji; do tada ih krije čitanje. Ne treba ništa da pustiš.
8. **Stari šabloni pravila** (prag 15 i 100), ako su već upisani u bazu, ostaju. Proveri ih ručno (odeljak 7).

## 7. Šta ručno proveravaš (po važnosti)
1. **Prava veza sa isteklim tokenom.** Na produkciji, sa vezom kojoj je istekao pristup (ili posle odjave na Meti): tačka u gornjoj traci je žuta sa brojem, a klik pokazuje istu rečenicu kao zvono, traka na ekranu kanala i kartica u Podešavanjima („… pristup je istekao pre N dana · Poveži ponovo“). „Poveži ponovo“ vodi na pravu karticu. Posle ponovnog povezivanja sve postaje zeleno. Kompozer Instagrama nema žuti baner kad je veza u redu.
2. **Pravila na pravom nalogu.**
   - Prva poseta ne upisuje ništa.
   - „Dodaj iz šablona“ predlaže prag iz tvojih kampanja; ako stigne greška o previše pročitanih dokumenata, to je B1.
   - Uključi pravilo koje pauzira: proba pokazuje stvarne kampanje. Ako piše da je pauziranje isključeno na serveru, `ADS_WRITE_ENABLED` nije `true`.
   - „Vrati kampanju“ u istoriji, sa potvrdom.
   - Mejl pravila piše iznos u valuti naloga.
3. **Boja radnje na svim modulima.** Prođi tablu, Leadove, Instagram, Facebook, Threads, YouTube, Oglase, Analitiku, OpenReply, Pravila, Novosti, Napredak i Podešavanja. Primarno dugme je svuda isti cijan sa tamnim tekstom, najviše jedno po pogledu. Sporedna dugmad su neutralno siva. Prekidači su cijan kad su uključeni. Boja modula je na aktivnoj stavci bočne trake, ikonici zaglavlja i u auri, a ne na brojevima.
4. **Telefon.** Na pravom telefonu otvori Leadove (Danas i Tabela), tablu, Oglase i Pravila:
   - dugmad, filteri, jezičci, izbori i prekidači su bar 44 px;
   - gornja traka je jedan red, a period se bira dugmetom „28 d“;
   - tap na „Cena po rezultatu“ otvara oblačić sa „CPA“;
   - prilagođen period prima „1.10.2026“ sa punom tastaturom;
   - nema vodoravnog klizanja.
5. **Leadovi na pravim podacima:** beleška ne izbacuje firmu iz „Zovi sada“; „Urađeno“ skida firmu iz „Vrati se na“ i Zaostalih; firma prebačena u Dobijen gubi korak; posle migracije „Bez vlasnika“ = 0.
6. **Oglasi:** Google kampanje imaju „—“ za frekvenciju; kampanja bez prikaza ima „—“ za stopu klikova; na Analitika → Oglasi rast potrošnje je crven.
7. **Period:** na tabli izaberi 7 d, pa idi na Instagram i Analitiku; osveži bez `range` i proveri da je i dalje 7 d.
8. **Novosti:** nacrt sa jednog uređaja vidi se na drugom; objavljen post se otvara sa celim tekstom pre čuvanja.
9. **Podešavanja → Integracije:** GA4 kartica piše „14 meseci“, „Jednom po događaju“, „Lepota i fitnes“; „Kopiraj uputstvo za programera“ kopira tekst sa imenima env promenljivih.
10. **Kontrast axe-om** (nije meren u runu): pusti merenje sa `AXE_PATH` (odeljak 8) i uporedi sa 251 pre runa.

## 8. Merenje pre i posle
Merenje T14 je uspelo: `node .nocni-run/ultra1/merenje.cjs --oznaka T14 --port 3117` nad razvojnim prikazom, 116 merenja (60 na 1536×695, 56 na 390×844), bez ijednog neuspelog. Ekrani i alat su isti kao u reviziji 27. 10, bez axe-a. Fajlovi: `docs/ultra/merenja/T14-sazetak.md`, `T14-sazetak.json` i `T14.jsonl`.

| Mera | Pre runa (27. 10.) | Posle runa (28. 10.) |
|---|---|---|
| Tekst ispod 12 px, 1536×695 | 548 od 10.345 čvorova, na 60/60 ekrana | **0** od 10.474 |
| Tekst ispod 12 px, 390×844 | 469 od 8.260, na 56/56 ekrana | **0** od 8.182 |
| Dodirne mete ispod 44 px, 390×844 | 1.095 od 1.946 (56,3 %) | **301 od 1.964 (15,3 %)** |
| Dugmad `data-variant="default"` iznad preloma | oko 77 dugmadi u kodu | **0** (i 0 u kodu) |
| Ekrani bez primarnog dugmeta iznad preloma, 1536 | 19 | 17 |
| Ekrani sa dva ili više primarnih iznad preloma | 0 | 0 |
| Medijana boja teksta / pozadine po ekranu, 1536 | 11 / 26 | 11 / 16 |
| Najviša gornja traka na telefonu | 192 px | 101 px (ekrani sa podekranima; ostali 56 px) |
| Najduža strana, 1536 | uvoz-pregled 8,9 ekrana, podešavanja 6,8 | uvoz-pregled 8,95, podešavanja 6,73 |
| Vodoravni preliv, 390 | instagram-komentari | instagram-komentari (isti, +58 px, birač u `toggle-group`) |
| Greške u konzoli | samo očekivane (`?pad=napredak`) | samo očekivane (3, `?pad=napredak`) |

Napomene uz brojeve:
- **Male mete na telefonu** su najviše u tabeli Leadova (101/236) i pregledu uvoza (50/220): linkovi naziva firme i uske ćelije, gde je problem širina, ne visina. Zatim Facebook 14/46, Threads 14/35, YouTube 13/52, Oglasi 12/44.
- **Male mete na 1536** (prag 24 px): 421, a pre runa 347; uz izuzetak razmaka iz WCAG 2.5.8 pada 10 (pre 5). Rast su uglavnom novi tekstualni okidači oblačića mere (`NazivMere`, visina 16–19 px, npr. „Sesije“, „Prikazi stranica“) i dugmad „prikaži i prazne (N)“ u tabeli. To nije u kriterijumu §9, ali je za U11/U14.
- **Ekrani bez primarnog** (17): Leadovi → Zaostali, Rupe, Sastanci, Mapa (i panel), Napredak (prazno, pad), komentari Instagrama i Facebook-a, nova kampanja, šest podekrana Analitike i Threads → Objavi. Većina su pregledi bez jedne glavne radnje; to je kriterijum celog plana (Danas, U9–U14), ne U3.
- **Boja primarnog dugmeta** ovo merenje ne beleži. T09 ju je izmerio u pregledaču na 11 ekrana: svuda `rgb(88, 196, 255)`.

**Kriterijumi iz `docs/ULTRA-PLAN.md` §9:**

| Mera | Cilj posle U3 | Ishod |
|---|---|---|
| Tekst manji od 12 px | 0 | **Postignuto** (0 na oba prikaza). |
| Dodirne mete < 44 px na 390 | ispod 10 % | **Nije postignuto:** 15,3 % (sa 56,3 %). Ostatak su linkovi i uske ćelije u tabelama, koje menjaju U7/U8. Cilj celog plana je ispod 5 %. |
| Dugmad sa `data-variant="default"` | 0 | **Postignuto** (0 u pregledaču i u kodu; `verify:ultra-dugmad`). |
| Primarno dugme u boji modula | nigde | **Postignuto** za dugmad (T09: svuda cijan; `[data-module]` više ne prepisuje `--primary`, čuvar D7). Boja modula ostaje na drugim elementima (odeljak 3, tačka 2). |
| Padovi kontrasta (axe) | meri Claude ujutru | **Nije mereno** u runu (merenje je bez axe-a). Tokeni: `contrast-check --strogo` 0 od 262 para. Za axe: postavi `AXE_PATH` na `axe.min.js` (verzija 4.14) i pusti isto merenje; pre runa je bilo 251. |
| Ekrani bez fokusa i radnje u prvom ekranu | — (cilj plana 0) | 17 (bilo 19); nije cilj ovog runa. |
| Isti broj na različitim mestima | status veze i smer mera isti svuda | **Postignuto u kodu i razvojnom prikazu:** jedan `statusVeze` za tačku, kanal, Podešavanja i zvono (testovi u `lib/status-veze.test.ts` i `convex/status-veza.test.ts`); smer svake `KpiTile` i `ChannelFocus` iz `lib/mere.ts` (`lib/mere-pokrivenost.test.ts`). Izuzeci su hub i birač (B2) i sat zvona (B3). |
| Osnovna petlja poziv → ishod → korak | — (cilj plana 3 pritiska) | Nije cilj ovog runa (U4–U5). |

## 9. Rezultat provera
Pušteno u T14 (28. 10. 2026, posle merenja i gašenja dev servera), nad HEAD `91d73f3` plus fajlovi T14. Kod u T14 nije menjan.

| Provera | Komanda | Rezultat |
|---|---|---|
| Codegen | `npx convex codegen` | Nije pušten: `convex/` u T14 nije menjan. T13 ga je pustio posle poslednje izmene (izlaz 0). |
| Tipovi | `npm run typecheck` | Prošlo (izlaz 0). |
| Lint | `npm run lint` | Prošlo: 0 grešaka, 1.209 upozorenja (pre runa 1.210, sva zatečena). |
| Testovi | `npx --no-install vitest run` | Prošlo: 69 fajlova, 1.168 testova (pre runa 52 / 947). |
| Pristup | `node --import ./scripts/ts-hooks.mjs scripts/verify-pristup.ts` | Prošlo (izlaz 0). |
| Regresije | `node .nocni-run/ultra1/regresije.mjs` | Prošlo: 19/19 (14 postojećih `verify:*` i 5 `verify:ultra-*`: dugmad, format, kontrast, rečnik, tipografija). |
| Build | `npm run build` (`verify:purge` + `next build`) | Prošlo: 145 tabela + 7 auth u `verify:purge`, „Compiled successfully“, izlaz 0. |
| Merenje | `node .nocni-run/ultra1/merenje.cjs --oznaka T14 --port 3117` | Prošlo: 116 od 116 merenja (odeljak 8). |

Nijedna provera nije pala, pa nijedna sitnica nije popravljana.

## 10. Zatečeno (nije nastalo u runu, nađeno usput, nije menjano)
- **Linkovi u razvojnom prikazu gube `?ux=1`**, pa klik vodi na prijavu (T06).
- **Tačka statusa se ne vidi na 390** (`hidden sm:inline-flex`); stanje na telefonu nose zvono i meni korisnika (T04).
- **`formatRelativeTime` je budući rok čitao kao „upravo sada“** („Token važi do 1. 11. (upravo sada)“). Kartice su prešle na `rokTokena`; sama funkcija je zatečena (T04).
- **Threads ekran sa isteklim tokenom je prazan** (B4).
- **Ručna provera isključenog pravila preko API-ja ide bez probe** (`manualEvaluateRules({ ruleId })`, T13 #40).
- **Poruke grešaka sa sirovim nazivima** iz koda koji run nije menjao: „Ad Set nije pronađen.“, „Cooldown ne može biti negativan.“ (`metaAdsStore`, `adActionsStore`, `threadsAutomations`; T13 #41).
- **Ekrani sa svojim računom zdravlja veze**, mimo jednog statusa: `yt-automations-dashboard.tsx`, kartica „Instagram nalog povezan“ u Podešavanjima (T13 #42).
- **Sirov izvor na profilu firme** „google_maps (potvrđeno)“ u `leadovi/provenance-badge.tsx` (T13 #47).
- **⌘K ne nalazi ekrane po engleskim imenima** („inbox“, „stories“, „dm“) posle prevoda; predlog je polje ključnih reči (U10, T13 #46).
- **`postZaUrednikaValidator`** je ručni spisak polja; novo polje u šemi `posts` bi srušilo upit urednika (T13 #45).
- **Sitnice iz T13 #48:** `formatDate` sa ISO stringom daje „NaN“ (danas bez poziva); dve funkcije `trajanje` i dve `formatSeconds` sa različitim jedinicama; `ChartTooltipContent` je mrtav kod sa `toLocaleString`; „Meta oglasi“ u čarobnjaku novog projekta i „Lid“ u čarobnjaku kampanje; ROAS je uvek zelen, a `battle-verdict` piše „1,0×“; sirovi kodovi u mejlu pravila.
- **`AdActionDialog`** pokazuje „Aktiviraj Kampanja“ i `PAUSED` (T07); rečnik ga nije obuhvatio.
- **`scripts/ux-snapshots.mjs`** i dalje upisuje lokalne nacrte Novosti koje ekran više ne čita (T06).
- **Radnici i Edit ponekad upisuju CRLF** u repo koji je `eol=lf`; vraćeno je na LF u T12 i T13, ali proveri `git diff --stat` pre commita.
- **Izmenjeni fajlovi u `.agents/skills/`** (devet `SKILL.md` i jedan `references/*.md`) su bili izmenjeni pre runa i run ih nije dirao; nisu u commitovima runa.
- **Vodoravni preliv na `instagram-komentari` (390)**: birač u `toggle-group` probija ivicu za ~58 px, isto kao u reviziji.
- **`next dev` se ne gasi preko `TaskStop`** u ovom okruženju; svaki korak ga je gasio preko `Stop-Process` po PID-u.
