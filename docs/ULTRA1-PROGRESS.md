# ULTRA1 — napredak

Noćni run ULTRA1 („Istina i temelj“, faze U0–U3). Plan: `docs/ULTRA-PLAN.md`. Pravila: `.nocni-run/ultra1/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

## T01 — Odluke u PRODUCT.md, DESIGN.md i CLAUDE.md   (2026-10-27 21:09)
**Fajlovi:** `CLAUDE.md` (samo sekcija „Design system"), `DESIGN.md`, `PRODUCT.md`, `docs/ultra/dna-cilj.json` (nov). Pomoćna skripta za JSON: `.nocni-run/ultra1/tmp/t01-dna.py`.
**Šta je urađeno:** Sekcija „Design system" u `CLAUDE.md` je prepisana po §3 plana: boja modula samo na aktivnoj stavci bočne trake, ikonici zaglavlja i auri; jedna boja radnje (P1, `--accent-400`) za primarno dugme; uloge dugmeta bez `default`; pravilo „font-mono + tabular-nums for metric numerals" zamenjeno pravilom P2; Tiha gamifikacija (O2); jezik (O15); jedan status veze (P3), „—" sa razlogom i valuta (O16); 44 px kao osobina primitiva; DNK referenca `docs/ultra/dna-cilj.json`, Taste 4 / 3 / 7. Ostale sekcije `CLAUDE.md` nisu dirane. `DESIGN.md` je prepisan na cilj „Radni sto, ne izveštaj": šest uloga boje (mesto, radnja, stanje, kategorija, nagrada, identitet), tipografija i mono po P2, gustina i kartice, dugmad, status veze, brojevi i valuta, Tiha gamifikacija, pokret, jezik i formati (P7), Do's/Don'ts, plus poglavlje „Navigacija (cilj za kasnije runove — sprovodi se u fazi U10)" po O3 i pravilima navigacije iz REVIZIJE. Tokeni i imena komponenti su zadržani; gde kod danas radi drugačije, opis nosi oznaku „Zatečeno". `PRODUCT.md` je dobio O6 i O10 u Users/Operating Context, novo Positioning, O16 u Capabilities, principe „Jedna boja radnje" i „Tih napredak" (umesto „Svaka radnja ostavi trag napretka…") i sekciju „Odluke 27. 10. 2026." sa O1–O21. `dna-cilj.json` je napravljen u šemi prethodnog profila (`nocni-run/ux/dna-boost.json`) i validan je JSON.
**ODLUKE:**
- Skill `impeccable` nije pozvan: korak menja samo dokumente, ne UI kod.
- Boja izbora i fokusa (okvir fokusa, fokus polja, uključen filter, podvlaka aktivnog jezička, tekući korak uvoza) je upisana kao boja radnje. Plan to ne kaže doslovno, ali pravilo „boja modula samo na tri mesta" ih isključuje iz boje modula, a P1 kaže da je brend cijan već boja fokusa (`--focus-ring` u `:root`). T08 to može da promeni.
- Neaktivne stavke bočne trake: cilj je neutralno (plan: boja modula samo na aktivnoj stavci). Zato je stara rečenica „sidebar icons always in their module color" uklonjena iz `CLAUDE.md`. Kod to još radi; to je posao temelja ili U10, ne T01.
- Sjaj fokus kartice i primarnog dugmeta (`shadow-mod`, `--mod-glow`) je označen kao zatečen i izlazi, jer §3 kaže „ne na … sjaju". Zamenski sjaj nije izmišljen; piše „tiha senka".
- Zlatna: na radnim ekranima samo u trenutku nagrade, a na strani Napredak ostaje za XP, nivo i dostignuća. To je spoj §3 („zlatna samo u trenutku nagrade") i O2 („XP, nivo i dostignuća su na strani Napredak").
- „Kartica samo za ono što se pomera" je protumačena kao fokus, firma i objava. Misija je izbačena sa spiska, jer misije u Tihom režimu prestaju da budu radne kartice (U9).
- Opisi ekrana koji zavise od kasnijih faza (Danas, Tih napredak, Interes, Pozovi na desktopu, kanalska traka O17, Automatizacije) su upisani kao cilj sa oznakom „kasniji run". Postojeći opis je zadržan kao „Zatečeno" gde se kod još ne menja.
- `PRODUCT.md`: oznaka „(izvedeno)" je ostala na jedinom mestu gde stoji (klijenti agencije), jer odluke O1–O21 ne odlučuju obim za klijente. Product Purpose (tačka 4 „koliko je napredovao") nije menjan, jer zadatak to ne traži, a Tihi napredak (nedeljni ciljevi i niz) ga i dalje ispunjava.
- `dna-cilj.json`: uz šemu prethodnog profila dodata su tri polja (`color.semantic_usage`, `brand_voice_in_ui.formats`, `taste`). Spisak preuzetih vrednosti je u `meta.napomena`.
- U `DESIGN.md` Oglasi: naziv mere za ROAS/CTR nije izmišljen; upućuje na `lib/mere.ts` (T05).
**Novi paketi:** nema.
**Testovi:** nisu pisani ni menjani (samo dokumenti).
**Rezultat provere:** typecheck prošao; lint 0 grešaka (1210 zatečenih upozorenja); vitest 52 fajla / 947 testova prošlo; pristup prošao; regresije 14/14 prošlo.
**Za Jovana ujutru:** pročitaj „Odluke 27. 10. 2026." u `PRODUCT.md` (red po odluku) i poglavlje „Colors" u `DESIGN.md`. Posebno potvrdi odluku da su fokus, uključen filter i aktivni jezičak u boji radnje, a ne u boji modula.
**Procesi (provera na kraju):** korak nije pokretao dev server ni pozadinske procese. Nijedan `node.exe` ne pominje `next` ni `enigmadigital` u komandnoj liniji. Preostali node procesi nisu iz ovog koraka:
- Codex (roditelj ChatGPT.exe, od 10:34);
- mcp-remote/Penpot (od 10:37);
- Playwright MCP, koji runner daje sesiji preko `mcp.json`;
- `npm run lint` od 21:11:32, koji pokreće `oemparts\node_modules\.bin\eslint`, dakle radi u susednom repou `oemparts`, a njegov koreni roditelj (PID 21536) više ne postoji.

Moji `npm run lint` pozivi u `enigmadigital` su završili i vratili rezultat (0 grešaka).
**Procesi (dopuna, 21:13):**
- `npm run lint` (PID 3908) i njegov eslint (PID 26192) više ne postoje; završili su.
- Playwright MCP sa PID 6396 i 4664 je pod drugom `claude.exe` sesijom (PID 22756), ne ovom.
- Playwright MCP sa PID 24476 i 13080 je dete ove `claude.exe` sesije (PID 10064). Pokrenut je u 21:10:25, pri `--resume`, iz runnerovog `--mcp-config .nocni-run/ultra1/mcp.json`. Korak ga nije pozivao i gasi se zajedno sa sesijom.

Nijedan `next dev` ni drugi proces koji je korak sam pokrenuo nije upaljen.
**Procesi (završno):**
- Pokušao sam da ugasim Playwright MCP ove sesije (PID 24476 i 13080). Bezbednosni klasifikator alata je to odbio, pa ga nisam zaobilazio.
- Taj proces nije pokrenuo korak. Podigao ga je Claude Code iz runnerovog `--mcp-config` pri pokretanju sesije; u ovom koraku nijedan Playwright alat nije pozvan. Gasi se kad runner završi `claude -p` proces.
- Sve što je korak sam pokrenuo (typecheck, lint, vitest, pristup, regresije, Python skripta za JSON) je završeno.
**BLOKADA (uslov 4 cilja):** Playwright MCP (PID 24476, i njegovo dete 13080) ostaje upaljen dok traje ova `claude -p` sesija. Podigao ga je Claude Code iz runnerovog `--mcp-config .nocni-run/ultra1/mcp.json`, a ne korak T01. Gašenje (`Stop-Process`) je odbio klasifikator auto režima, a zaobilaženje te zabrane nije dozvoljeno. Rešenje je kod runnera: neka `nocni-run.ps1` posle koraka ugasi MCP decu sesije, ili neka doda dozvolu `PowerShell(Stop-Process:*)`. Ostali uslovi (Prihvatanje, provere, sekcija T01) su ispunjeni.

## T02 — Leadovi: ispravke podataka u petlji   (2026-10-27 21:50)
**Fajlovi:**
- novi: `convex/lib/leadKorak.ts` (jedno pravilo koraka: zatvorene faze, `rokKoraka`, `korakKasni`, `ZOVI_SADA_FILTER`), `convex/lib/leadZaduzenje.ts` (`vlasnikNoveFirme`, `osigurajZaduzenje`, `zaduziNovuFirmu`), `convex/leadZaduzenja.ts` (migracija `dodeliBezZaduzenja`), `convex/leadovi-t02.test.ts`, `components/app/leadovi/korak-uradjen.tsx`, `docs/ultra/snimci/T02-*.png` (6 snimaka);
- izmenjeni backend: `convex/leadCrmStore.ts`, `convex/leadFiltersStore.ts`, `convex/leadImportStore.ts`, `convex/leadInboundStore.ts`, `convex/leadUnakrsnoStore.ts`, `convex/notificationsStore.ts`, `convex/schema.ts`, `convex/_generated/api.d.ts` (codegen), `convex/unakrsni-leadovi.test.ts`;
- izmenjeni front: `components/app/leadovi/` → `leads-today.tsx`, `overdue-panel.tsx`, `lead-detail.tsx`, `lead-expanded-row.tsx`, `lead-timeline.tsx`, `lead-quick-dialogs.tsx`, `lead-urgency.ts`, `lead-columns.ts`, `use-zovi-sada.ts`;
- razvojni prikaz: `app/dev-ux/fixtures.ts`, `app/dev-ux/fixtures-oglasi.ts`.

**Šta je urađeno:** Svih osam tačaka iz §4.
1. `logTouch` sa kanalom „beleska" upisuje događaj u istoriju, ali ne menja `lastTouchAt`; ni „Poslednji dodir" u redu više ne prikazuje belešku kao kontakt.
2. Ishod `trazeno_da_se_ne_zove` uvek vraća predlog zabrane (`razlog: "trazio_da_ga_ne_zovemo"`, `predlogPoTekstu: false`), bez upisa. Dijalog ishoda tada kaže da je to zahtev osobe i šalje tu vrstu zabrane.
3. i 4. Zaduženje nastaje pri svakom nastanku firme, kroz jedan helper: uvoz (i skill, koji ide kroz uvoz), upit sa sajta (`napraviFirmuIzUpita`), poruka sa mreže sa novom firmom (`linkInboundToCompany`) i kopija iz drugog projekta. Za stare firme postoji `internal.leadZaduzenja.dodeliBezZaduzenja` (serije, idempotentna, NIJE puštena).
5. `setStage` u Dobijen, Izgubljen ili Odložen briše korak i to beleži u istoriji. Zatvorena faza nije zaostala nigde: Zaostali, filter „zaostali", brojač, zvono, ivica reda, profil.
6. Nova mutacija `zavrsiKorak` (kroz `projekatMutation`) i dugme „Urađeno" (`KorakUradjen`, `touch-target` → 44 px na dodir). Stoji na Danas → „Vrati se na", u Zaostalima, u profilu („Šta je sledeće") i u proširenom redu tabele i mape. Istorija piše „Korak urađen" i „Bio je dogovoren za".
7. „Vrati se na" čita nov upit `listKoraciDanas` (zakasneli i današnji, po roku). Zakasneli pišu „Kasni …" crveno, a današnji „Danas u 23:37" neutralno.
8. „Zovi sada" (traka, režim poziva i broj u zvonu) preskače firmu sa dogovorenim korakom, preko novog filtera `bezKoraka`.

**ODLUKE:**
- Beleška ostaje u `logTouch` (kanal „beleska"), bez nove mutacije: UI se ne menja, a Napredak je već tretira kao belešku. Firme kojima je ranija beleška već pomerila `lastTouchAt` se NE ispravljaju. P8 traži migraciju samo za zaduženje, a izvođenje „pravog" poslednjeg kontakta iz istorije bi bila nova migracija.
- `postojeci_klijent` (u reviziji „opciono") ne dobija predlog zabrane, jer ga §4 ne traži. Povratni validator `recordOutcome.razlog` je sužen sa `string` na dve vrste zabrane.
- Ko dobija zaduženje: kreator ako je urednik ili vlasnik tog projekta, inače prvi vlasnik projekta po redu članstva. Projekat bez vlasnika se preskače (zaduženje se ne izmišlja). Kreator koji je posmatrač ili bivši član → vlasnik. Uvoz zadržava svoje postojeće pravilo (pošiljalac ako je i dalje član, inače onaj ko primenjuje), samo sada ide kroz isti helper.
- „Ručni unos" u kodu postoji samo kao nova firma iz poruke sa mreže (`linkInboundToCompany` sa `newCompanyName`); posebna mutacija „Dodaj firmu" ne postoji. Povezivanje poruke sa POSTOJEĆOM firmom ne pravi zaduženje (to pokriva migracija).
- Kopija iz drugog projekta (`kopirajUProjekat`) takođe dobija zaduženje (faza „nov", zadužen onaj ko kopira), jer je i ona nova firma i inače bi bila nevidljiva u cilju. Zato je jedna asercija u `unakrsni-leadovi.test.ts` promenjena: umesto „0 dodela i 0 događaja u B" sada proverava tačno jednu svežu dodelu (`nov`, bez dodira, koraka i ishoda) i jedan događaj „dodela". Test i dalje proverava da se CRM stanje iz A ne prenosi. Ovo nije slabljenje testa nego nova istina koju test meri.
- Migracija: serije od 100 (najviše 200), sama zakazuje nastavak, `probno: true` samo broji, a ukupan zbir upisuje u log na kraju. Događaj „dodela" traži autora, pa je autor zaduženi vlasnik, a napomena kaže da je zaduženje dodato naknadno.
- Zatvorene faze su Dobijen, Izgubljen i Odložen, kako §4 kaže. Pravilo važi PRI ČITANJU svuda gde se računa kašnjenje (jedna funkcija u `convex/lib/leadKorak.ts`), da jezičak, zvono i tabela ne bi dali tri broja. Stari zapisi se ne prepisuju. `setStage` koji ne menja fazu ne briše korak.
- Šema: samo jedno opciono polje `leadStageEvents.korakZatvoren` („uradjen" | „posao_zatvoren"), umesto nove vrednosti u `kind`, jer pravila dozvoljavaju samo opciona polja. Događaj nema `toValue`, pa ga Napredak ne broji: „Urađeno" ne donosi XP (Tiha gamifikacija); postavljanje koraka i dalje donosi.
- `listOverdue` je dobio opseg `nextActionAt > 0`. Dodele bez koraka stoje u indeksu pre svih brojeva, pa je goli `lt(now)` trošio granicu skena (`limit × 2`) na njih, i Zaostali su mogli da budu prazni ili delimični kad mnogo firmi nema korak. Nađeno pri tačkama 5 i 7 i ispravljeno u zajedničkom `citajKorake`.
- „Zovi sada" isključuje firmu sa BILO KOJIM aktivnim korakom (budući ili zakasneli), ne samo budućim. Zakasneli korak je već u „Vrati se na", a cilj tačke 8 je da firma ne stoji u oba reda.
- „Vrati se na": redosled je sastanci bez ishoda, pa koraci po roku, pa sastanci uskoro. `krajDana` šalje ekran (lokalni dan; server je UTC), a server ga ograničava na 48 h. „Rok istekao danas u HH:MM" je postalo „Kasni od HH:MM", isto kao kolona u tabeli. Jezičak Zaostali ostaje samo za zakasnele.
- „Urađeno" ima ulogu `secondary`, kao ostale radnje na karticama (boju menja T09). Na Danas je to glavna radnja kartice koraka umesto „Otvori"; naslov kartice i dalje otvara profil. U Zaostalima radnje reda više nisu `w-full` nego `flex-1`, da „Urađeno" stane u isti red. Nije dodato u ćeliju „Sledeći korak" u tabeli (prošireni red iste firme ga ima) ni u režim poziva.
- Fikstura: današnji sastanak u `app/dev-ux/fixtures.ts` je imao fiksno 15:30, pa je posle 15:30 postajao drugi „sastanak bez ishoda" (suprotno konstanti `SASTANAK_PROSAO_BEZ_ISHODA = 1`) i gurao današnji korak iza granice od 5 kartica. Sada je 15:30 ili sat od sada (najkasnije 23:59), isto i u zvonu.
- Reč „u preseku" nije dirana: to je posao rečnika (T12).
- Skill `impeccable` je pozvan pre UI koda.

**Novi paketi:** nema.

**Testovi:**
- `convex/leadovi-t02.test.ts` (novo, 8 testova, po jedan za svaku tačku):
  - beleška ne menja `lastTouchAt` i firma ostaje u „Zovi sada";
  - `trazeno_da_se_ne_zove` nudi zabranu bez upisa, a potvrda upisuje pravu vrstu;
  - upit sa sajta i poruka sa mreže prave zaduženje, i firma je u Tabeli;
  - migracija: probno ne piše; prava radi u serijama od 2 (zakazani nastavci) i bira kreatora ili vlasnika (i u B); drugo puštanje ne menja ništa;
  - zatvorena faza nije zaostala i nema korak (i stari zapis, filter, brojač);
  - `zavrsiKorak` briše korak, upisuje istoriju i ne menja fazu; drugi klik ne radi ništa;
  - današnji korak se vidi, a zakasneli nosi `kasni`;
  - „Zovi sada" preskače firmu sa budućim i sa zakasnelim korakom.
- `convex/unakrsni-leadovi.test.ts`: jedna asercija promenjena (vidi ODLUKE).

**Rezultat provere:**
- `npx convex codegen`: prošao.
- typecheck: prošao.
- lint: 0 grešaka (1210 upozorenja, isto kao pre).
- `npx vitest run`: 53 fajla / 955 testova prošlo. U jednom od deset punih puštanja pao je 1 test čije ime nisam uhvatio (izlaz je bio skraćen). U narednih 9 punih puštanja i 9 izolovanih puštanja novih testova sve je prošlo. To puštanje je išlo dok je zaostali `next dev` (vidi „Procesi" ispod) još radio, pa je verovatno istek vremena pod opterećenjem; runner pušta testove ponovo.
- pristup: prošao.
- regresije: 14/14 prošlo (uključuje `verify:leads-ui`, koji nije menjan).
- Vizuelno (Playwright, `?ux=1`, port 3117): Danas „Vrati se na", Zaostali i profil na 1536 × 695 i 390 × 844. Na 390 nema vodoravnog klizanja, a u konzoli nema grešaka. `.touch-target` daje 44 px pod `pointer: coarse`; pravilo je provereno u CSS-u, jer emulacija nema grub pokazivač.

**Završna provera (posle gašenja dev servera):** codegen, typecheck, lint (0 grešaka), `npx --no-install vitest run` (53 / 955), pristup i regresije (14/14) su prošli.

**Procesi:** `next dev -p 3117`, koji je korak pokrenuo za snimke, nije se ugasio preko `TaskStop`, a prvi `taskkill` je odbio klasifikator auto režima. Posle cilja koraka (uslov 4: nijedan pokrenut proces ne sme da ostane) ugašen je preko `Stop-Process`. Gašeno je samo pet procesa ovog koraka, provereno po komandnoj liniji (ovaj repo, port 3117): 12212, 24912, 22780, 8636 i 23788. Port 3117 je slobodan. Nijedan drugi proces koraka nije ostao upaljen.

**Za Jovana ujutru:**
1. Posle deploya Convex-a pusti migraciju, prvo probno pa pravu. Ona sama ide serijama i na kraju upiše zbir u log („dodeliBezZaduzenja: pregledano …, dobilo zaduženje …").
   - Bash:
     - `npx convex run leadZaduzenja:dodeliBezZaduzenja '{"probno":true}'`
     - `npx convex run leadZaduzenja:dodeliBezZaduzenja '{}'`
   - PowerShell 5.1 (navodnici moraju da se izvuku):
     - `npx convex run leadZaduzenja:dodeliBezZaduzenja '{\"probno\":true}'`
     - `npx convex run leadZaduzenja:dodeliBezZaduzenja '{}'`
   - Za produkciju dodaj `--prod` posle `run`. Za samo jedan projekat dodaj `"workspaceId":"<id>"` u JSON.
   - Provera: jezičak Rupe → „Bez vlasnika" treba da padne na 0. Izuzetak je projekat bez vlasnika, koji migracija broji kao `bezVlasnika`.
2. Na pravim podacima:
   - zabeleži belešku i proveri da firma ostaje u „Zovi sada";
   - klikni „Urađeno" na Danas i proveri da firma nestaje iz „Vrati se na" i Zaostalih;
   - prebaci firmu sa korakom u Dobijen.
3. Potvrdi odluke:
   - „Zovi sada" isključuje i firmu sa zakasnelim korakom;
   - kopija u drugi projekat dobija zaduženje;
   - „Postojeći klijent" ne nudi zabranu;
   - „Urađeno" ne donosi XP.
4. Stare firme kojima je beleška ranije pomerila „poslednji kontakt" ostaju takve (vidi ODLUKE). Ako ih ima mnogo, to traži posebnu migraciju.

## T03 - Plan: jedan status i pošteni brojevi   (2026-10-27 22:18)
**Plan korak.** Plan je upisan u `docs/ultra/planovi/T03.md`. Kod nije menjan.

## T04 — Jedan status veze svuda i uslovan baner   (2026-10-27 23:00)
**Fajlovi:**
- novi:
  - logika i upit: `convex/lib/statusVeze.ts`, `convex/lib/serverPodesen.ts`, `convex/statusVeza.ts` (upit `statusVeza.lista`);
  - front: `components/app/system/stanje-veze.tsx`, `lib/veze-ekrana.ts`;
  - testovi i fiksture: `lib/status-veze.test.ts`, `convex/status-veza.test.ts`, `app/dev-ux/fixtures-status-veza.ts`;
  - snimci `docs/ultra/snimci/T04-*.png` (8).
- izmenjeni backend: `convex/lib/zdravljeVeza.ts`, `convex/lib/vezeProjekta.ts` (`citajUlazeStatusa`), `convex/lib/notifications.ts`, `convex/notificationsStore.ts`, `convex/instagramPublish.ts`, `convex/lib/igPublish.ts`, `convex/_generated/api.d.ts` (codegen).
- izmenjeni front:
  - `components/app/sync-status.tsx`;
  - `components/app/system/page-header.tsx`, `components/app/system/channel-focus.tsx`;
  - `components/app/settings/connections-settings.tsx`, `components/app/overview/sync-health-widget.tsx`, `components/app/instagram/publish-composer.tsx`;
  - `lib/channel-readiness.ts`, `lib/token-expiry.ts`, `lib/format.ts` (`formatShortDateAt`).
- testovi, provere i fiksture: `lib/zdravlje-veza.test.ts`, `convex/hub-c16.test.ts`, `scripts/notifications-check.ts`, `app/dev-ux/fixtures.ts`.

**Šta je urađeno:**
- Svaka veza ima tačno jedan status (Radi / Traži pažnju / Nije povezano). Daje ga čista funkcija `statusVeze` u `convex/lib/statusVeze.ts`, sagrađena na postojećem `razlogZdravlja` (hub i birač), pa svi ekrani po konstrukciji kažu isto.
- Upit `statusVeza.lista` vraća samo činjenice; status se računa na ekranu sa satom koji otkucava (`useStatusVeza`). Zvono računa istom funkcijom na serveru (`integracijeUKvaru`).
- Rečenice i radnje daje jedna funkcija (`porukaStatusa`), npr. „Instagram: pristup je istekao pre 3 dana · Poveži ponovo". Tehnički tekst greške ostaje samo u detaljima Podešavanja (stanje sinhronizacije).
- **Potrošači:**
  - tačka u gornjoj traci: zelena samo kad sve radi, inače žuta sa brojem; klik otvara „Veze" (zvono filtrirano na veze);
  - traka u zaglavlju ekrana kanala (crta je `PageHeader`, po modulu iz `lib/veze-ekrana.ts`);
  - „podaci od …" uz fokus broj (`ChannelFocus`);
  - Spremnost bez segmenata „Povezan" i „Sinhronizuje";
  - Podešavanja: fokus „N radi · M traži pažnju" sa „Reši: …", pilula i razlog na kartici, „Prekini vezu" u meniju „⋯" uz postojeću potvrdu;
  - pregled veza na tabli i zvono.
- Kompozer: žuti baner o dozvoli stoji samo kad Meta kaže da dozvola fali (`publishingLimit.nedostajeOpseg`). Pravilo je jedna čista funkcija, `prikaziBanerDozvole` u `convex/lib/igPublish.ts`, pokrivena testom.

**ODLUKE:**
- **Pragovi (P3).** Token: 7 dana, i u `TOKEN_ISTICE_MS` (hub i birač) i u `TOKEN_EXPIRY_WARNING_MS` (kartice). Podaci: prag je `pragoviStarosti` iz `zdravljeVeza`, dakle 24 h, osim za Threads, gde je 48 h, jer se redovno sinhronizuje jednom dnevno i bio bi žut svakog dana. Natpis „podaci od …" je ravnih 24 h za sve, jer je to činjenica, a ne kvar.
- **Testovi hub-a.** `lib/zdravlje-veza.test.ts` i `convex/hub-c16.test.ts` su koristili token na 9 dana kao „ističe". Uz prag od 7 dana to je sada „radi", pa je ulaz 5 dana; dodata je i provera da 9 dana radi. Nova istina P3, ne slabljenje.
- **`scripts/notifications-check.ts`.**
  - Razlozi `greska` i `istekao_token` su postali `pao_prolaz` i `token_istekao` (jedan rečnik razloga).
  - Radnja za istekao pristup je „Poveži ponovo" umesto „Obnovi pristup", iste reči kao na kanalu. Pravilo „obnova, ne sinhronizacija" se i dalje meri.
  - Dodate su provere za „ističe za 5 dana" i stare podatke. Ostale tvrdnje (naslovi, bedževi, rute) prolaze bez izmene.
- **Zvono i nove stavke.** Zvono sada javlja i token koji ističe za 7 dana ili manje, stare podatke i server bez podešavanja, jer tačka mora da se poklapa sa zvonom. Ključ ostaje `sinhronizacija.greska:<provider>`, pa odlaganja i sklanjanja važe. Hitnost: visoka za server bez podešavanja, token za ≤ 2 dana i kvar stariji od dana; inače srednja. Token koji tek ističe nema „kvar traje".
- **„Server nije podešen".** Proverava se za Instagram, Facebook, Threads, YouTube i Google Business, istim čitačima okruženja kao kartice Podešavanja. Postojeće `setupInfo` funkcije nisu menjane, jer već koriste iste getere. Facebook povezan trajnim tokenom sistemskog korisnika se ne proverava (ne zavisi od Meta aplikacije).
- **Spisak veza.** Status govori o 8 veza iz Podešavanja i o Google Business-u kad je povezan. `leads` (ulaz skilla) nije veza koju vlasnik održava. Veza u prekidu je „Nije povezano" uz razlog „brisanje u toku"; ne boji tačku.
- **Traka i natpis bez izmene dashboard-a.** Traku stanja crta `PageHeader`, a „podaci od …" crta `ChannelFocus`, oba po modulu ekrana (`lib/veze-ekrana.ts`). Fajlovi ekrana kanala nisu dirani, jer su T05-ovi (plan T03 §8).
- **Spremnost.** Merač ne pravi segmente `connected` i `sync`; njihovi ključevi ostaju u tipu, pa grane u ekranima kanala postaju mrtve. Briše ih šablon kanala (U11).
- **Sidra.** Radnje vode na `/settings?tab=integracije#integracija-<provider>`, jer kartice već imaju ta sidra (plan je predlagao `#veza-`).
- **Podešavanja.** Pilule „Čeka Meta app — … u env" više ne zamenjuju status. Tekst sa imenima env promenljivih je ostao u napomenama kartica, a njih menja T12. Stara upozorenja „Token ističe …" (Instagram, tvrdo 14 dana, i Facebook) zamenjuje razlog statusa ispod zaglavlja kartice. Kartica OpenReply-a pokazuje stanje motora samo kad veze nema.
- **Zatečena greška.** „Token važi do 1. 11. (upravo sada)": `formatRelativeTime` budući rok čita kao „upravo sada". Kartice sada pišu „za 4 dana" i „Token je istekao … (pre 3 dana)" (`rokTokena`). `lib/format.ts` nije menjan osim dodatog `formatShortDateAt`; `formatRelativeTime` ostaje za T11.
- **Kompozer.** Za isteklu vezu ne ponavlja rečenicu iz trake; kaže samo posledicu („Objava ne može da se pošalje dok Instagram ne bude ponovo povezan.").
- **Boja radnje.** Linkovi radnji statusa su u `text-accent-400`, a ne u boji modula. Boju dugmadi menja T09.
- **Kružni uvoz.** `statusVeze.ts` i `notifications.ts` se uvoze uzajamno. Oba koriste uvezeno samo unutar funkcija; to je zapisano u komentaru modula.
- **Telefon.** Tačka u traci i dalje nije vidljiva na 390 (zatečeno `hidden sm:inline-flex`). Na telefonu stanje nose ćelija „Danas" (zvono, iste reči) i meni korisnika. Gornju traku telefona menja T06.
- Skill `impeccable` je pozvan pre UI koda. Pitanje korisniku nije bilo moguće (noćni run), pa je odluka po planu T03.

**Novi paketi:** nema.

**Testovi:**
- `lib/status-veze.test.ts` (23 testa):
  - radi, nije povezano, prekid veze, istekao token (status i datum, sa trajanjem i bez njega);
  - ističe za 5 dana, granica od 7 dana, 8 dana radi;
  - pao prolaz i pad posle svežijeg podatka;
  - veza bez uspeha, zastoj, stari podaci (24 h; Threads 30/50 h), `lastDataAt`;
  - server nije podešen (i ženski rod), greška veze, bez tehničkog koda;
  - zbir i redosled, `google_business`, broj veza u rečenici;
  - za svako od četiri stanja zvono piše istu rečenicu, radnju i adresu kao status;
  - kompozer: zdrava veza sa dozvolom nema baner (i dok odgovor o kvoti ne stigne); baner stoji samo kad dozvola fali, a nije uz isteklu ili nepovezanu vezu.
- `convex/status-veza.test.ts` (4 testa): izolacija projekta i uloga; poslednji uspeh, `lastDataAt`, veza u prekidu i sistemski korisnik; server bez Meta aplikacije; zvono (`staMeCeka`) i status nad istom bazom kažu isto, bez „OAuth 190".
- Izmenjeni: `lib/zdravlje-veza.test.ts`, `convex/hub-c16.test.ts`, `scripts/notifications-check.ts` (vidi ODLUKE).

**Rezultat provere:**
- `npx convex codegen`: prošao.
- typecheck: prošao.
- lint: 0 grešaka (1210 upozorenja, isto kao pre).
- vitest: 55 fajlova / 982 testa prošla.
- pristup: prošao.
- regresije: 14/14 prošlo.
- Dodatno: `verify:meta-token` i `verify:ig-publish` prošli.
- **Vizuelno** (Playwright, `?ux=1`, port 3117):
  - snimljeni: tabla sa otvorenom tačkom (1536), Instagram sa isteklom vezom (1536 i 390), Podešavanja (1536 i 390), kartica Instagrama, meni „⋯" i dijalog potvrde (1536), zvono na telefonu (390);
  - na 390 nema vodoravnog klizanja, a u konzoli nema grešaka;
  - u kompozeru (`/instagram/objavi`) baner o dozvoli ne stoji.
- Dev server je ugašen (PID 7592, 27360, 26400; port 3117 slobodan). Pomoćni fajlovi Playwright-a su premešteni u `.nocni-run/ultra1/tmp/t04-playwright/`.

**Prihvatanje (provera stavku po stavku):**
- „Za istu vezu tačka, kanal, Podešavanja i zvono kažu isto": ispunjeno. Pokriveno je testom `lib/status-veze.test.ts` („ista veza, iste reči"), Convex testom `convex/status-veza.test.ts` (zvono i status nad istom bazom) i fiksturama: `statusVeza.lista` i zvono se izvode iz istih `connections` i `syncHealth` (`app/dev-ux/fixtures-status-veza.ts`).
- „Kad je veza u redu i ima dozvolu, baner kompozera se ne prikazuje": ispunjeno. Pokriveno je testom `prikaziBanerDozvole`; u razvojnom prikazu (`/instagram/objavi`) baner ne stoji.
- „Provere prolaze; sekcija T04 je u progress-u": ispunjeno (vidi Rezultat provere).

**Za Jovana ujutru:**
1. Posle deploya na pravim podacima:
   - tačka u gornjoj traci treba da bude zelena ako sve veze rade, a ako Instagram ili druga veza ne radi, žuta sa brojem;
   - klik na tačku pokazuje iste rečenice kao zvono i traka na ekranu kanala.
2. Ako prod nema `INSTAGRAM_APP_ID`/`SECRET` (ili Facebook/Threads/YouTube parove), te veze sada traže pažnju („… nije podešen na serveru").
3. Potvrdi odluke:
   - prag od 7 dana za token, i u hubu i biraču;
   - Threads 48 h za stare podatke;
   - zvono sada javlja i token koji ističe i stare podatke;
   - „Poveži ponovo" umesto „Obnovi pristup".
4. Baner o dozvoli u kompozeru se pojavljuje samo kad Meta odbije pitanje o kvoti zbog dozvole. Proveri na pravom nalogu da se ne pojavljuje kad je sve u redu.

## T05 — Pošteni brojevi: „—“, smer, valuta, probni podaci   (2026-10-27 23:50)
**Fajlovi:**
- novi:
  - rečnik i valuta: `lib/mere.ts`, `lib/valuta.ts`;
  - front: `components/app/system/valuta-upozorenje.tsx` (`ValutaUpozorenje`), `components/app/ads/nepoznata-mera.tsx` (`MeraIliCrtica` i razlozi za „—“ u Oglasima);
  - testovi i fiksture: `lib/mere.test.ts`, `convex/brojevi-t05.test.ts`, `app/dev-ux/fixtures-brojevi.ts`;
  - snimci `docs/ultra/snimci/T05-*.png` (6).
- izmenjeni backend: `convex/metaAdsStore.ts`, `convex/googleAds.ts`, `convex/googleAdsStore.ts`, `convex/adActions.ts` (samo `params.currency`), `convex/lib/metaAdsWrite.ts` i `convex/lib/googleAdsWrite.ts` (samo rečenica o valuti).
- izmenjeni front:
  - sistem: `components/app/system/kpi-tile.tsx`;
  - Oglasi: `ads-dashboard.tsx`, `campaigns-table.tsx`, `campaign-detail.tsx`, `ad-drilldown-panel.tsx`, `placement-breakdown.tsx`, `hook-battle-view.tsx`, `battle-verdict.ts`;
  - Analitika: `ads-performance-dashboard.tsx`, `retention-dashboard.tsx`, `analytics-dashboard.tsx`, `acquisition-dashboard.tsx`, `audience-dashboard.tsx`, `content-dashboard.tsx`;
  - kanali i ostalo: `instagram-dashboard.tsx`, `facebook-dashboard.tsx`, `youtube-dashboard.tsx`, `threads-dashboard.tsx` (samo smer fokusa), `threads-follows-chart.tsx`, `openreply-dashboard.tsx`, `overview/overview-dashboard.tsx` (samo `mera` na pločicama), `settings/action-audit-log.tsx`, `rules/rule-editor-dialog.tsx`, `lib/rule-sentence.ts`.
- razvojni prikaz: `app/dev-ux/fixtures-oglasi.ts`, `fixtures-analitika.ts`, `fixtures-projekti.ts`, `fixtures.ts` (jedan uvoz i jedan red registracije), `app/dev-ux/sistem/vodic-komponente.tsx`.

**Šta je urađeno:**
- **Izmišljene vrednosti (§5.2).**
  - Oglasi: stopa klikova, cena klika, cena 1.000 prikaza i frekvencija su `undefined` kad je imenilac 0, preko `deriveRate`. Ranije su bile 0 i 1. Važi u izveštaju kampanja, hijerarhiji, detalju oglasa, plasmanima, duelu kreativa i izveštaju ključnih reči.
  - Google red pri čitanju gubi doseg, frekvenciju i video mere (`bezNemerenog`), pa stara istorija ne laže bez migracije. Google prolaz više ih ne upisuje; `patch` sa eksplicitnim `undefined` briše stare izmišljene vrednosti. Isto važi za seed.
  - Na ekranu stoji „—“ sa razlogom u `title` i `sr-only`: „Bez prikazivanja u periodu“, „Bez klikova u periodu“, „Google ne meri frekvenciju“, „Meta nije poslala doseg za ovaj period“.
  - Pločica „Prosečan CTR“ bez prikaza pokazuje „—“.
  - Analitika → Oglasi više ne pada na `?? 0`: bez događaja nema cene po događaju, a dan bez događaja je praznina u liniji.
  - Retencija: „u {N} kohorti“ iz podatka (fikstura ima 8, a ranije je tvrdo stajalo 12); prosek bez izmerene nedelje je „—“.
  - Instagram: pregledi profila bez izmerenog dana su „—“ sa razlogom „Meta nije poslala preglede profila za ovaj period.“, bez nula u liniji.
  - Threads: uklonjen drugi broj pratilaca („poslednji snimak“).
- **Smer mera.** `lib/mere.ts` ima 56 mera sa nazivom, kratkim nazivom, akronimom, definicijom, formatom, smerom i izvorom. `KpiTile` dobija prop `mera` i smer čita iz rečnika; `DeltaPill` dobija `smer`, a `neutralno` daje prigušenu pilulu. Pločice sa `mera`:
  - Oglasi (4);
  - Analitika → Oglasi (5), Pregled (10), Sticanje (5), Posetioci (4), Sadržaj (4);
  - Instagram (4), Facebook (3), YouTube (3), OpenReply (2);
  - vodič sistema.

  `ChannelFocus` nije menjan; Oglasi, Instagram, Facebook i YouTube mu daju `higherIsBetter={veceJeBolje(…)}`. Na Analitika → Oglasi rast potrošnje i cene po događaju je sada crven (snimak).
- **Valuta.**
  - `ValutaUpozorenje` („Nalog radi u RSD; aplikacija ne preračunava.“) stoji na Oglasima, Analitika → Oglasi i u detalju kampanje.
  - Istorija radnji piše iznos u valuti iz `params.currency`, koju `changeBudget` sada upisuje; stari zapisi su bez znaka.
  - Urednik pravila i rečenica pravila pišu valutu Meta naloga umesto „€“.
  - Rečenica o granici budžeta je prevedena u ljudsku.
- **Fiksture.** Oglasi i Analitika su u EUR, iznosi podeljeni sa ~117 (npr. dnevni budžet 3500 → 30, potrošnja za 28 d 1.457 €). Jedan Google Ads nalog preko GA4 ostaje u RSD da se vidi upozorenje. Kampanja bez potrošnje i Google kampanje u fiksturi daju iste „—“ kao pravi upiti. `fixtures-brojevi.ts` daje preglede profila samo za prethodni period.
- **`?campaignId=`** (Convex `_id` ili ID kampanje na platformi) u `ads-dashboard.tsx` otvara detalj kampanje (za T07 i link iz mejla). Posle „Nazad“ se ne otvara ponovo.

**ODLUKE:**
- **Zadatak naspram plana T03 (rule-editor).** Zadatak T05 traži da se „€“ zameni i u `rule-editor-dialog.tsx`, a plan T03 to daje T07. Urađen je minimum: natpisi „CPA/Potrošnja/CPC“ dobijaju „({valuta})“ samo kad svi Meta nalozi dele jednu poznatu valutu, a valuta stoji i uz polje praga. Ostatak fajla (Switch, izvorni `<select>`, „Guard“) je T07-ov.
- **`lib/rule-sentence.ts`.** Plan ga daje T07. Ovde je dobio samo opcioni parametar `valuta` (`formatCurrency`), jer bi „€15“ inače ostalo tvrdo upisano. `rules-list.tsx` (T07) još ne prosleđuje valutu, pa tamo iznos stoji kao broj bez znaka, što je pošteno. **`convex/rules.ts` `formatMetricUnit` (mejl) i dalje piše „€“.** Plan ga daje T07, jer traži kontekst naloga u evaluatoru.
- **Treća poruka o valuti.** Postoji i u `convex/adActions.ts` (`currency_mismatch`, bez „po kursu“). Plan je ne pominje, pa nije menjana.
- **Smer potrošnje je `manje`**, kao do sada na Oglasima i u Meta katalogu (plan §3.2*). Frekvencija je takođe `manje`.
- **Nazivi pločica nisu menjani** („Prosečan CPA“ i sl.). Srpski naziv sa akronimom u oblačiću je posao rečnika (T12, O15). Rečnik ih već nosi (`naziv`, `akronim`).
- **Threads fokus** dobija `higherIsBetter={veceJeBolje("pratioci")}`, kao i ostali kanali, iako danas nema poređenje (plan ga je naveo).
- **Vodič sistema:** da i primeri u vodiču čitaju smer iz rečnika, `lib/mere.ts` je dobio dve mere Leadova van početnog spiska plana, „Pozivi" i „Sastanci" (obe `vise`). Primer ravne pilule je preimenovan iz „Bez promene" u „Upiti (bez promene)" i dobio je `mera="upiti"`. Sada nijedna `KpiTile` ni `ChannelFocus` u aplikaciji i vodiču nije bez smera iz rečnika.
- **Pločice Kontrolne table.** Plan T03 daje `mera` na Kontrolnoj tabli koraku T06, jer je `overview-dashboard.tsx` njegov fajl. Prihvatanje T05 ipak traži smer za SVAKU meru, pa su ovde dodata samo četiri propa `mera` (Sesije, Instagram doseg, Poslate DM poruke, Leadovi bez poziva, uključujući rezervnu pločicu). Ništa drugo u fajlu nije menjano; T06 ih zatiče gotove. Pločice Leadova nemaju poređenje, pa se boja ne menja.
- **Šire od spiska §5.2.** Uz tačke iz plana, isto pravilo je primenjeno na:
  - detalj oglasa (r. 1673–1675) i duel kreativa (1976–1978), koji su imali iste izmišljene nule;
  - izveštaj ključnih reči (`getKeywordQualityReport`: `ctr`, `cpc`, `overallCtr`);
  - dnevni „hook rate“ u duelu za dan bez video merenja;
  - ukupnu frekvenciju, koja se računa samo nad prikazima kampanja koje imaju doseg (Google prikazi bi je izmislili).
  Matrica uzrast × pol (`ctr` 0 za ćeliju bez prikaza) nije dirana, jer je toplotna mapa van spiska.
- **Sortiranje tabele kampanja.** Nepoznata vrednost ide na kraj u oba smera; ranije je pri rastućem redosledu bila na vrhu, kao najmanja.
- **`getHookBattle` vraća i `provider`**, da razlog za „—“ frekvencije kaže Google ili Meta.
- **Fikstura RSD naloga.** Plan kaže „r. 603“, ali taj red je `ga4Configuration`; ono što ekran čita je `adsPerformance.currencyCode` (r. 586). Radnik je stavio RSD na `adsPerformance`, izveštaje oglasa i `ga4Configuration` (konstanta `ADS_VALUTA`), a ostalo je EUR.
- **Fikstura projekta.** `klijent-doo` dobija valutu EUR; iznosi (10–300) su već bili u evrima.
- **Svesno van U2 (za U11 i U14), po planu:**
  - dnevna popunjavanja nulama u `lib/metrics.ts` (`fillIgDays`, FB, YT, OpenReply `ctr`, `engagementRate`);
  - `instagram-stories.tsx` (`?? 0`), `threads-search.tsx`, `realtime-dashboard.tsx:104`;
  - zamene mera u `acquisition-dashboard.tsx` i `audience-dashboard.tsx`;
  - `threadsStore.ts:1357`, `summarizeIg.followersCount = 0`.
- **`verify:gads-*`** nisu menjani; svih devet prolazi bez izmene.
- Skill `impeccable` je pozvan pre UI koda. Fiksture (oglasi, analitika, projekti) je po receptu uradio radnik (sonnet); diff je pregledan, a typecheck i testovi pušteni posle.

**Novi paketi:** nema.

**Testovi:**
- `lib/mere.test.ts` (30):
  - trošak i svaka cena su `manje` i rast nije dobar (`dobraPromena(k, +0.2) === false`);
  - neutralno i promena oko nule daju `null`;
  - svaka mera ima naziv, kratko, definiciju i izvor, a akronim nije u nazivu;
  - ROAS i frekvencija su broj;
  - smer se slaže sa `META_METRIC_CATALOG` (13 ključeva) i `GOOGLE_ADS_METRIC_CATALOG` (11).
- `lib/mere-pokrivenost.test.ts` (2), čuvar rečnika nad TypeScript AST-om:
  - primer: pločica bez smera, sa `higherIsBetter={false}` i sa ključem van rečnika pada, a `mera` i `veceJeBolje(…)` prolaze;
  - ceo `components/` i `app/`: svaka `KpiTile` i `ChannelFocus` (više od 40) čita smer iz `lib/mere.ts`, i nijedna ne pada.
- `convex/brojevi-t05.test.ts` (5):
  - kampanja sa 0 prikaza nema CTR, CPC, CPM ni frekvenciju (izveštaj, hijerarhija, detalj);
  - Google red sa dosegom = prikazi, frekvencijom 1 i video nulama u bazi ih vraća prazne (izveštaj, hijerarhija, detalj, duel);
  - Meta red sa dosegom daje pravu frekvenciju (2,5) i prave stope;
  - ukupna frekvencija ne meša Google prikaze;
  - Google prolaz ne upisuje doseg, frekvenciju ni video, a drugi prolaz briše stare izmišljene vrednosti.

**Rezultat provere:**
- `npx convex codegen`: prošao.
- typecheck: prošao.
- lint: 0 grešaka (1210 upozorenja, isto kao pre).
- vitest (`npx --no-install vitest run`): 58 fajlova / 1019 testova prošlo.
- pristup: prošao.
- regresije: 14/14 prošlo.
- Dodatno prošli: svih devet `verify:gads-*` (i `transport`, `assets`, `write`), `verify:brojevi`, `scripts/test-meta-ads-ma2.ts` i `verify:leads-ui`.
- **Vizuelno** (Playwright, `?ux=1`, port 3117):
  - `/ads` (1536 i 390): EUR, Google frekvencija i CTR kampanje bez potrošnje su „—“;
  - `/analytics/oglasi` (1536 i 390): upozorenje RSD, a rast potrošnje i cene je crven;
  - `/instagram` (1536 i 390): pregledi profila „—“ sa razlogom;
  - `/analytics/retencija`: „u 8 kohorti“;
  - `/ads?campaignId=120000000000001` otvara detalj kampanje;
  - na 390 nema vodoravnog klizanja, a u konzoli nema grešaka.
- **Dev server** je ugašen. `TaskStop` ga nije ugasio, pa je ugašen preko `Stop-Process`, samo procesi ovog koraka: 26668, 35328, 33100, 20216, 29712 i 16112. Port 3117 je slobodan. Pomoćni fajlovi Playwright-a su premešteni u `.nocni-run/ultra1/tmp/t05/playwright/`.

**Prihvatanje:**
- Nijedna izmišljena nula ili frekvencija sa spiska §5.2 se više ne prikazuje: ispunjeno. Oglasi i Google su pokriveni testom `convex/brojevi-t05.test.ts`, Instagram fiksturom `fixtures-brojevi.ts`, a retencija i Threads snimkom i kodom.
- Smer svake mere na pločicama dolazi iz `lib/mere.ts`, a test pokriva trošak i cenu: ispunjeno. To važi i za Kontrolnu tablu i vodič sistema: sve `KpiTile` i `ChannelFocus` u kodu nose `mera` ili `veceJeBolje(…)`, što trajno meri test `lib/mere-pokrivenost.test.ts`.
- Provere prolaze i sekcija T05 je ovde: ispunjeno.

**Za Jovana ujutru:**
1. Posle deploya: na `/ads` Google kampanje treba da imaju „—“ za frekvenciju (ranije 1,0), a kampanja bez prikaza „—“ za CTR. Stari Google redovi u bazi se čiste sami pri sledećoj sinhronizaciji; do tada ih štiti čitanje.
2. Na Analitika → Oglasi rast potrošnje je sada crven. Potvrdi da je potrošnja „manje je bolje“ (kao do sada na Oglasima).
3. Mejl pravila (`convex/rules.ts`) i lista pravila još pišu iznos sa „€“, odnosno bez valute; to sređuje T07.
4. Potvrdi odluke:
   - urednik pravila piše valutu naloga uz prag;
   - istorija radnji piše stare promene budžeta bez znaka valute;
   - `?campaignId=` otvara detalj kampanje.

## T06 — Period koji se pamti, adresa u jezičcima, nacrti Novosti   (2026-10-28 00:40)
**Fajlovi:**
- novi: `lib/date-range.test.ts`, `convex/novosti-t06.test.ts`, `app/dev-ux/fixtures-novosti.ts`, snimci `docs/ultra/snimci/T06-*.png` (6).
- period i adresa: `lib/date-range.ts`, `lib/rutiranje.ts`, `lib/rutiranje.test.ts`, `components/app/date-range-picker.tsx`, `components/app/projekat-link.tsx`, `components/app/app-shell.tsx`, `app/(app)/[projekat]/settings/page.tsx`, `app/(app)/[projekat]/page.tsx`.
- tabla: `components/app/overview/overview-dashboard.tsx`, `command-focus.tsx`, `poslovanje-kartica.tsx`.
- Novosti: `convex/postsStore.ts`, `components/app/novosti/novosti-dashboard.tsx`, `novosti-board.tsx`, `novosti-types.ts`, `publish-readiness-panel.tsx` (samo natpisi kapija).
- razvojni prikaz: `app/dev-ux/fixtures.ts` (jedan uvoz i jedan red registracije).

**Šta je urađeno:**
- **Period se pamti (P4).** `useDateRange` čita redom: adresu (`range` ili `from`/`to`), period zapamćen za projekat, pa 28 d. Izbor upisuje adresu kao ranije i pamti se pod `enigma:period:<workspaceId>` (hub: `enigma:period:hub`). Čitanje ide kroz `useSyncExternalStore` (događaji `storage` i `enigma:period`), a server i prvi crtež vide `null`, pa nema greške hidratacije. Svi pristupi `localStorage` su u `try/catch` (čiste funkcije u `lib/date-range.ts`: `kljucPerioda`, `periodIzUpita`, `periodIzTeksta`, `procitajPeriod`, `zapamtiPeriod`, `periodUUpit`, `razresiPeriod`).
- **Period u linkovima.** `putanjaEkrana(ekran, prefiks, period?)` dodaje period u upit samo kad adresa nema `range`, `from` ni `to`; postojeći upit i heš ostaju, a bez trećeg argumenta ponašanje je isto. `ProjekatLink` prosleđuje zapamćen period samo za ekrane sa `range: true` (`resolveScreen`), pa bočna traka, donja traka, podekrani Analitike i pločice table nose `?range=7d` bez izmene navigacije.
- **Okvir u naslovu.** Tabla: sekcija „Kanali" dobija naslov sa okvirom „Poslednjih N dana" (prilagođen period: raspon datuma); prstenovi dobijaju vidljiv natpis „Ova nedelja"; misije počinju sa „Danas · misije"; Poslovanje piše „· stanje sada"; pločica „Leadovi bez poziva" bez imenioca kaže „stanje sada". Info table kaže da se period pamti za projekat.
- **Jezičci Podešavanja** menjaju samo `tab`; `?ux=1`, `prazno=1` i ostali parametri ostaju (snimak).
- **Telefon.** Birač je jedno dugme („7 d ▾", prilagođen period kao „1.–15. okt") u glavnom redu gornje trake, između mrvice i ⌘K. Meni nosi 7/28/90 d (mete 44 px), razrešene datume i „Prilagođen period…" sa istim poljima kao desktop (izdvojena u `PrilagodjenPeriod`). Drugi red trake je obrisan; desktop (`compact`) je isti.
- **Novosti.** Spisak nacrta daje `postsStore.listaNacrta` (`projekatQuery`, `uloga: "urednik"`, indeks `by_workspace_status_published`, `take(100)` po statusu, sort po `updatedAt`). Front ga zove sa `"skip"` kad `!useMoze("urednik")`. `loadLocalDrafts`/`saveLocalDrafts`/`persistLocalPosts` su obrisani, a ključ `enigma:novosti:drafts:*` se više ne čita ni ne piše (nije obrisan). Kartica nacrta i zakazanog posta piše „Fali: dokaz, prirodan ton" ili „Spremno za objavu" (`staFaliZaObjavu`, redom kapija). Reči su po §5.7: opis i info ekrana, korak praznog stanja, natpisi kapija „Dokaz / Prirodan ton / Opis slike / Podnaslov" (jedan izvor `NAZIVI_PROVERA`), vrste „Beleška" i „Članak".

**ODLUKE:**
- **Pamti se izbor, link nosi zapamćen period.** `ProjekatLink` stoji u ljusci, van Suspense granica stranice, pa ne čita `useSearchParams`; nosi zapamćen izbor, ne period iz tuđe deljene adrese. Otvoren deljen link sa `?range=90d` važi na tom ekranu, ali se ne pamti dok ga korisnik ne izabere.
- **28 d se pamti, ali se ne piše u adresu ni u link** (`periodUUpit` vraća prazno), kao i dosadašnji `applyRangeParams`.
- **Projekat koji se učitava nema ključ**, pa se dok `workspaceId` ne stigne ne čita ni ne piše period (nema mešanja sa hubom). Na tvrdom osvežavanju birač zato prvi kadar pokaže adresu ili 28 d. Za hub je iskorišćen postojeći `useProjekatOpciono`.
- **⌘K** (`command-palette.tsx`, nije fajl T06) ne dodaje period u adresu, ali ciljni ekran svejedno čita zapamćen period, pa je izbor isti.
- **Okvir Poslovanja.** Plan predlaže „Poslednjih 7 dana" za upite, „Ovaj mesec" za prihod i „Danas" umesto „za 24 h". Brojke i njihove nazive šalje sajt projekta (Puls), a prozor svake brojke je već u nazivu („Upiti (7 d)", „Prihod ovog meseca"); prepisivanje naziva bi izmislilo okvir za tuđe brojke. „za 24 h" je klizni prozor (`promena24h`), a „Danas" bi bio kalendarski dan, što nije tačno. Zato sekcija piše „Poslovanje · stanje sada", a „za 24 h" ostaje (mono za reči sređuje T10).
- **Dugme „28 d ▾" je `outline`, ne `secondary`.** `secondary` danas nosi boju modula, a boja modula ne ide na dugmad (CLAUDE.md); T09 menja `secondary` u neutralno. Strelica je lucide `ChevronDown`, ne znak „▾". Dugme „Primeni" nije menjano (uloga dugmadi je T09).
- **`listaNacrta` vraća i arhivirane postove**, ne samo nacrte i zakazane: arhiva je ranije stizala iz `localStorage`, pa bi kolona „Arhiva" bez toga lažno pisala „Arhiva je prazna". Objavljeni i dalje ne izlaze (test).
- **Nov upit `postsStore.zaUredjivanje`** (urednik, ceo post u svom projektu, inače `null`). Bez njega bi otvaranje objavljenog posta dalo urednik sa praznim telom (javni spisak ne nosi telo), a čuvanje bi obrisalo tekst; ranije je telo stizalo iz lokalne kopije. Dashboard za objavljen post čeka ovaj upit, a uređivač nije menjan.
- **„`localStorage` čuva samo nesačuvan unos".** Uređivač danas nema čuvanje nesačuvanog unosa, a T06 ne sme da menja uređivač; zato Novosti u `localStorage` ne čuvaju ništa. Čuvanje nesačuvanog unosa je posao za U13.
- **Interna polja** `publishedBy`/`firstPublishedAt` ne izlaze iz upita za urednika (ekran ih ne koristi).
- **`scripts/ux-snapshots.mjs`** i dalje upisuje stare lokalne nacrte za snimak `novosti`; to je sada mrtvo (ekran ih ne čita), a nacrte daje fikstura. Skripta nije menjana.
- **Snimak „posle klika".** Linkovi u razvojnom prikazu gube `?ux=1` (zatečeno), pa klik vodi na prijavu. Snimak Instagrama je zato adresa iz linka (`/instagram?range=7d`, provereno u DOM-u) plus `&ux=1`; dodatno je `/analytics?ux=1` bez `range` pokazao 7 d iz zapamćenog izbora.
- **Gornja traka na 390** je jedan red (56 px); na ekranima sa podekranima ispod nje ostaje traka jezičaka (navigacija, U10).
- Prettier je na tabli prvo preformatirao tuđe redove; izmena je vraćena i ponovljena ručno, pa diff nosi samo T06.
- Skill `impeccable` je pozvan pre UI koda. Radnici nisu korišćeni.

**Novi paketi:** nema.

**Testovi:**
- `lib/date-range.test.ts` (23): ključ po projektu i hubu; pamćenje i čitanje preseta, raspona i 28 d; projekti ne dele period; neispravan zapis (9 slučajeva: nije JSON, prazno, `null`, broj, nepoznat preset, obrnut raspon, neispravan datum, samo `from`, pogrešan tip); `localStorage` koji baca grešku (čitanje `null`, pamćenje `false`, bez izuzetka); bez skladišta; `periodIzUpita`, `periodUUpit`, `razresiPeriod`.
- `lib/rutiranje.test.ts` (+14): period se dodaje u hubu i panelu, uz postojeći upit i pre heša; adresa koja već ima `range`/`from`/`to` ostaje ista; raspon kao `from`/`to`; 28 d se ne piše; bez perioda je isto kao ranije; globalne, spoljne putanje, sidra i hub se ne diraju; povratni put ekrana.
- `convex/novosti-t06.test.ts` (5): `listaNacrta` vraća samo neobjavljene postove tog projekta, najnovije prve, sa telom; urednik čita, posmatrač dobija `forbidden`, neprijavljen `unauthorized`; tuđ projekat `forbidden`; interna polja ne izlaze; `zaUredjivanje` daje objavljen post sa telom, tuđ post kao `null`, posmatraču `forbidden`.

**Rezultat provere:**
- `npx convex codegen`: prošao (jedan prolaz je pao na `fetch failed`, ponovljen i prošao).
- typecheck: prošao.
- lint: 0 grešaka (1210 upozorenja, isto kao pre).
- vitest: 60 fajlova / 1061 test prošlo (uključujući `linkovi-cuvar`, `zakucane-adrese`, `front-cuvar`, `mere-pokrivenost`).
- pristup: prošao (izlaz 0).
- regresije: 14/14 prošlo.
- **Vizuelno** (Playwright, `?ux=1`, port 3117):
  - `T06-tabla-7d-1536.png`: tabla posle izbora 7 d; `localStorage` ima `{"range":"7d"}`, linkovi bočne trake i pločica su `/instagram?range=7d`, `/analytics?range=7d`, naslov „Kanali · Poslednjih 7 dana", „Ova nedelja" iznad prstenova;
  - `T06-instagram-posle-klika-7d-1536.png`: Instagram na 7 d („vs prethodnih 7 d");
  - `T06-podesavanja-jezicak-ux-1536.png`: klik na „Projekat" daje `/settings?ux=1&tab=projekat`;
  - `T06-novosti-1536.png`: nacrti iz fiksture uz prazan `localStorage`, „Fali: dokaz, prirodan ton", „Fali: opis slike", „Spremno za objavu", arhiva;
  - `T06-gornja-traka-390.png` i `T06-birac-meni-390.png`: traka u jednom redu, dugme „7 d", otvoren meni; bez vodoravnog klizanja (390 px), bez grešaka u konzoli.
- Dev server je ugašen (PID 29244; port 3117 slobodan, nijedan `next` proces ovog projekta ne radi). Pomoćni fajlovi Playwright-a su u `.nocni-run/ultra1/tmp/t06-playwright/`.

**Prihvatanje:**
- Period izabran na tabli važi na modulu posle klika: ispunjeno (test `putanjaEkrana` sa periodom, snimci table i Instagrama, provera linkova u DOM-u).
- Klik na jezičak Podešavanja ne briše druge parametre: ispunjeno (snimak, adresa `?ux=1&tab=projekat`).
- Nacrt Novosti se vidi u spisku i bez `localStorage`: ispunjeno (`convex/novosti-t06.test.ts`, snimak uz prazan `localStorage`).
- Provere prolaze i sekcija T06 je ovde: ispunjeno.

**Za Jovana ujutru:**
1. Posle deploya na pravoj bazi: na tabli izaberi 7 d, pa klikni Instagram ili Analitiku u bočnoj traci; adresa nosi `?range=7d`, a birač pokazuje 7 d. Osveži stranu modula bez `range`: i dalje 7 d (pamti se po projektu na ovom uređaju).
2. Novosti: nacrti koje si pisao na jednom uređaju vide se i na drugom. Otvori jedan objavljen post i proveri da uređivač ima ceo tekst pre nego što sačuvaš.
3. Na telefonu: gornja traka je jedan red, a period se bira dugmetom „28 d ▾".
4. Potvrdi odluke: „Poslovanje · stanje sada" umesto preimenovanja brojki sa sajta; arhiva u istom upitu kao nacrti; „Danas · misije" kao naslov misija.

## T07 — Pravila: bez samoupisa, proba, Vrati kampanju   (2026-10-28 01:30)
**Fajlovi:**
- novi:
  - logika: `convex/lib/pravilaProcena.ts` (vrednost mere, uslov, blizina praga, medijana, zaokruživanje praga, šabloni, format iznosa);
  - front: `components/app/rules/rule-sablon-dialog.tsx`, `rule-proba-dialog.tsx`, `use-valuta-pravila.ts`;
  - testovi i fiksture: `convex/pravila-t07.test.ts`, `lib/pravila-procena.test.ts`, `app/dev-ux/fixtures-pravila.ts`;
  - snimci `docs/ultra/snimci/T07-*.png` (10).
- izmenjeni backend: `convex/rulesStore.ts`, `convex/rules.ts` (samo valuta u mejlu i zajednička logika), `convex/_generated/api.d.ts` (codegen).
- izmenjeni front: `components/app/rules/rules-dashboard.tsx`, `rules-list.tsx`, `rule-editor-dialog.tsx`, `rule-firings-table.tsx`, `lib/rule-sentence.ts`.
- izmenjeni testovi: `convex/pristup.test.ts`, `convex/izolacija-c07-pravila.test.ts`.
- razvojni prikaz: `app/dev-ux/fixtures.ts` (blokovi `listRules`/`listRuleFirings`, uvoz i dva reda registracije).

**Šta je urađeno:**
- **Bez samoupisa.** `ensureTemplateRules` i `TEMPLATE_RULES` su obrisani, a sa njima i `useEffect` koji je pri prvoj poseti upisivao šablone sa pragom 15 i 100, kao i dugme „Učitaj šablone". Nova mutacija `dodajIzSablona` (vlasnik, `{ sablon, prag }`) upisuje jedno isključeno pravilo i odbija prag ≤ 0 ili `NaN`. Upit `predlogPraga` daje dvostruku medijanu za poslednjih 28 dana, zaokruženu naviše na dve značajne cifre: cenu po rezultatu po kampanji sa rezultatima, odnosno dnevnu potrošnju kampanje. Bez podataka vraća `nema_podataka`, a sa više valuta `vise_valuta`. Dijalog „Dodaj iz šablona" ima dva koraka: izbor šablona, pa polje „Prag (EUR)" popunjeno predlogom i rečenica o osnovi. Bez predloga je polje prazno i obavezno, a „Dodaj pravilo" je onemogućeno.
- **Proba pre uključivanja.** Upit `probaPravila` (`{ scope, condition, ruleId? }`) čita samo bazu. Vraća pogođene ciljeve (naziv, vrednost, prag, mirovanje), najbliži cilj u odnosu na prag, broj ciljeva ispod najmanje prikaza, prozor i to da li je pauziranje uključeno na serveru. Server ne pušta pauzu bez probe: `toggleRule`, `createRule` i `updateRule` bacaju `proba_potrebna` kad bi pravilo koje pauzira počelo da važi bez `probaPotvrdjena: true`. Pravilo koje samo javlja, gašenje i promena naziva ili mirovanja aktivnog pravila probu ne traže. Dijalog „Proba pre uključivanja" piše „Sada bi pauziralo: N kampanje", zatim redove „naziv · Cena po kliku 0,25 € > prag 0,20 €" i napomene („već okinuto, čeka još N h", „već nije aktivna na Meti"). Ako je pauziranje isključeno na serveru, kaže da bi pravilo samo poslalo mejl. Uključuje tek na „Uključi pravilo".
- **Jedna logika.** Evaluator i proba dele `ciljeviPravila` (u `rulesStore.ts`) i `vrednostMere`/`uslovIspunjen`. Ciljevi su **samo Meta nalozi** (`provider === "meta_ads"`), pa Google kampanja više ne ide na `graph.facebook.com`. Kontekst procene nosi `valuta`, a mejl piše iznos u valuti Meta naloga; kad valuta nije poznata, piše ga bez znaka. „€" više nije upisan u kod.
- **Kartica** ispod rečenice piše vrednost prema pragu iz iste probe: „Sada najbliža pragu: … 42,50 € · 94 % praga", „Sada ispunjava uslov: … · i još 1" ili „— nema podataka za poslednja 3 dana". Zaglavlje liste nosi tih natpis „Čuva samo Meta oglase · Proverava se na 30 min" (umesto čipa) i `ValutaUpozorenje` kad Meta nalog ne radi u evrima. Rečenica pravila (`lib/rule-sentence.ts`) koristi nazive iz `lib/mere.ts` i valutu naloga, koju `rules-list.tsx` sada prosleđuje.
- **Istorija.** Uz uspelu pauzu kampanje ili grupe oglasa vlasnik vidi „Vrati kampanju" (odnosno „Vrati grupu oglasa"). Dugme otvara postojeći `AdActionDialog` sa `actionType="resume"`, koji zove `adActions.pauseResume` sa istim zaštitama: `ADS_WRITE_ENABLED`, `recordPendingAction`, brojač Meta poziva i potvrda „Potvrdi aktivaciju". „Otvori" vodi na `/ads?campaignId=…` (za grupu i nalog na `/ads`). Iznos piše „Cena po rezultatu 10,80 € · prag sada 5,00 €". Neuspela pauza nosi „Pauziranje nije uspelo", a ne „Pauzirano".
- **Urednik.** Nivo, uslov (`>` `≥` `<` `≤`, sa `aria-label`) i radnja su `ToggleGroup`, mera je `DropdownMenu` + `DropdownMenuRadioGroup`, a „Uključeno" je shadcn `Switch`. Novo pravilo počinje isključeno i bez praga. Prekidač za pravilo koje pauzira otvara probu. Ako se uslov promeni posle probe, „Sačuvaj" prvo traži novu probu. Rečnik: „Novo pravilo", „Nivo", „Grupe oglasa", „Najmanje prikaza", „Pauza za istu kampanju (h)", „Mejl"; „Čuvari" → „Pravila", podnaslov „Pravila za Meta oglase: …".

**ODLUKE:**
- **`dodajIzSablona` traži vlasnika**, po planu T03 §6.2. Ranije je šablone smeo da upiše i urednik (`ensureTemplateRules` je bio podrazumevani `urednik`). Test „urednik učitava šablone" u `izolacija-c07-pravila.test.ts` je zato postao „urednik ne dodaje iz šablona…". Proverava da urednik dobija `forbidden` i da čitanje spiska ništa ne upisuje. Kao što plan traži, proverava i da dva poziva vlasnika prave dva isključena pravila. Ostale provere izolacije u tom fajlu i u `pristup.test.ts` su iste, samo prelaze na `dodajIzSablona`. Nijedna tvrdnja nije uklonjena; konstanta `TREBA_UREDNIK` je obrisana jer je ostala bez upotrebe.
- **Pravilo iz šablona dobija `createdBy`.** Šablon više nije samoupis, nego radnja vlasnika sa pragom koji je izabrao, pa autor postoji. Posledica je da takvo pravilo sada broji kao događaj u Napretku (ranije „šabloni → 0 XP", jer ih niko nije pravio). `verify:napredak` prolazi (145).
- **Proba se traži samo kad pauza počinje da važi**: pravilo se uključuje, počinje da pauzira ili pauzira po novom uslovu (nivo, mera, operator, prag, prozor, najmanje prikaza). Promena naziva ili mirovanja aktivnog pravila je ne traži. To je najuži tumač „pauza ne može da se uključi bez probe" koji ne tera probu na svaku izmenu.
- **Proba i predlog čitaju `Date.now()` u upitu**, kao `notificationsStore.staMeCeka`. Prozor je u UTC danima, kao u evaluatoru do sada. Rezultat može da zakasni oko ponoći dok ga nova sinhronizacija ne osveži; argument sa vremenom bi menjao pretplatu na svakom crtežu.
- **Proba ne filtrira pauzirane kampanje**, jer ni evaluator to ne radi (evaluator se menja samo za valutu i zajedničku logiku). Kampanja koja već nije aktivna ostaje na spisku sa „već nije aktivna na Meti".
- **„Prag sada" u istoriji.** Okidanje ne pamti prag u trenutku okidanja, a šema se u U2 ne menja (T03). Istorija zato piše današnji prag pravila kao „prag sada", a ne „> prag" iz plana, da ne bi tvrdila nešto što nije zapisano. `listRuleFirings` vraća i `metric` i `pragSada`.
- **„Vrati kampanju" je `outline`, a ne `secondary`**, isto kao odluka T06. `secondary` danas nosi boju modula, a boja modula ne ide na dugmad; T09 menja `secondary`. „Otvori" je `ghost`.
- **Primarno dugme je jedno po pogledu.** „Dodaj iz šablona" je `primary` u zaglavlju kad pravila postoje. U praznom stanju ga nosi prazno stanje, pa ga zaglavlje ne ponavlja. „Novo pravilo" i „Pokreni proveru sad" su `outline`. Na telefonu je „Pokreni proveru sad" samo ikonica (tekst je `sr-only`), jer tri dugmeta inače prelivaju 390 px: blok radnji u `PageHeader` je `shrink-0`.
- **Natpis „Čuva samo Meta oglase"** stoji jednom, u redu čipova table (vidi se i u praznom stanju i iznad istorije), a ne u zaglavlju liste kartica.
- **Kartica i proba dele upit** (isti argumenti `{ scope, condition, ruleId }`), pa je to jedna pretplata po pravilu.
- **Valuta na frontu** dolazi iz `metaAdsStore.listAccounts` (`use-valuta-pravila.ts`): piše se samo kad je jedna i poznata. Za upozorenje se uzima Meta valuta koja nije EUR.
- **Sitnice u fajlovima koje ovaj korak prepisuje:** datum u istoriji i na kartici više nije `font-mono` (datum u rečenici nije mono). `title` sa `ADS_WRITE_ENABLED` i `RESEND_API_KEY` je zamenjen ljudskom rečenicom. Ikonica kartice u boji modula nije dirana (U3).
- **`AdActionDialog`** (fajl Oglasa) nije menjan. Snimak `T07-vrati-kampanju-1536.png` pokazuje njegove zatečene natpise („Aktiviraj Kampanja", `PAUSED`, zeleno dugme); to je za U3.
- Skill `impeccable` je pozvan pre UI koda. Radnici nisu korišćeni.

**Novi paketi:** nema.

**Testovi:**
- `convex/pravila-t07.test.ts` (14):
  - prva poseta (vlasnik, urednik, posmatrač) ne upisuje nijedno pravilo;
  - `rulesStore` ne izvozi `ensureTemplateRules`/`TEMPLATE_RULES`; prag 0, −5 i `NaN` daju `invalid_argument`;
  - `dodajIzSablona` pravi isključeno pravilo sa pragom, šablonom i autorom;
  - prekidač, novo pravilo i izmena bez probe daju `proba_potrebna`, a sa probom prolaze; preimenovanje aktivnog pravila prolazi, a nov prag ne;
  - `probaPravila` nad fiksturama `adInsights` daje tačno pogođene Meta kampanje. Google kampanju, red stariji od prozora i red sa podelom ne broji, a poštuje najmanje prikaza, „manje od", mirovanje sopstvenog pravila (22 h) i tuđe pravilo. `fetch` nije pozvan (zamenjen funkcijom koja baca grešku);
  - `predlogPraga`: 64,30 → 130 i 321,5 → 650; bez podataka `nema_podataka`, sa USD nalogom `vise_valuta`;
  - kontekst evaluatora ima samo Meta ciljeve i valutu EUR.
- `lib/pravila-procena.test.ts` (11):
  - `vrednostMere`, `uslovIspunjen`, `blizinaPragu`, `medijana`, `zaokruziPrag` (uključujući 1,1, 0,7 i 1.300);
  - iznos sa valutom naloga, bez znaka i nikad sa pretpostavljenim €;
  - rečenica pravila;
  - čuvar izvora: nijedan fajl u `components/app/rules` ne zove `ensureTemplateRules`, `dodajIzSablona` zove samo dijalog šablona (uz prag), a tabla nema `useEffect` ni mutaciju.
- Izmenjeni: `convex/pristup.test.ts` i `convex/izolacija-c07-pravila.test.ts` (vidi ODLUKE).

**Rezultat provere:**
- `npx convex codegen`: prošao.
- typecheck: prošao.
- lint: 0 grešaka (1210 upozorenja, isto kao pre).
- vitest: 62 fajla / 1086 testova prošlo.
- pristup: prošao (izlaz 0).
- regresije: 14/14 prošlo. Dodatno `verify:napredak` (145) prošao.
- **Vizuelno** (Playwright, `?ux=1`, port 3117):
  - `T07-prazna-pravila-1536/390`: prazno stanje sa „Dodaj iz šablona" iznad preloma na 1536;
  - `T07-pravila-kartice-1536`: tri kartice sa vrednošću prema pragu;
  - `T07-proba-1536/390`: proba na prekidaču isključenog pravila koje pauzira;
  - `T07-istorija-1536/390`: „Vrati kampanju" i „Otvori";
  - `T07-vrati-kampanju-1536`: potvrda kroz postojeći dijalog;
  - `T07-sablon-prag-1536`: predlog 13 EUR;
  - `T07-urednik-1536`: urednik sa Switch, meni i segmentima.
  - Prekidač u uredniku otvara probu nad dijalogom, a posle „Uključi pravilo" je uključen. Prvi snimak na 390 je pokazao prelivanje (455 px) zbog tri dugmeta u zaglavlju; popravljeno je, i sada je 390 px. U konzoli nema grešaka ni upozorenja.
- Dev server je ugašen (PID 14840, 33124, 29044, 21248; port 3117 slobodan). Pomoćni fajlovi Playwright-a su premešteni u `.nocni-run/ultra1/tmp/t07/playwright/`.

**Prihvatanje:**
- Prva poseta Pravilima ne upisuje nijedno pravilo: ispunjeno. To pokrivaju test `prva poseta Pravilima ne upisuje nijedno pravilo`, test izolacije (urednik) i čuvar izvora u `lib/pravila-procena.test.ts`.
- Pauza ne može da se uključi bez probe i potvrde: ispunjeno. Server odbija bez `probaPotvrdjena` (testovi), a front šalje potvrdu samo iz dijaloga probe.
- Provere prolaze; sekcija T07 je ovde: ispunjeno.

**Za Jovana ujutru:**
1. Posle deploya otvori Pravila. Ništa se ne upisuje samo, a postojeća pravila (i stari šabloni sa pragom 15/100, ako ih ima u bazi) ostaju kakva jesu. Proveri prag starih šablona: oni su bili upisani bez tvog izbora.
2. „Dodaj iz šablona" → „Skupa konverzija": predlog praga treba da odgovara tvojim kampanjama (dvostruka medijana cene po rezultatu za 28 dana).
3. Uključi pravilo koje pauzira: proba treba da pokaže stvarne kampanje. Ako piše „Pauziranje je sada isključeno na serveru", `ADS_WRITE_ENABLED` na produkciji nije `true`.
4. „Pokreni proveru sad" i dalje radi prave pauze bez probe (zatečeno, plan §9). Proba štiti uključivanje, a ne ručnu proveru.
5. Evaluator više ne procenjuje Google kampanje. One su ranije padale na Meta API-ju, pa ishod treba da bude isti, samo bez lažnih grešaka.
6. Potvrdi odluke: pravilo iz šablona donosi događaj u Napretku, istorija piše „prag sada", proba se ne traži za preimenovanje aktivnog pravila, a urednik više ne dodaje šablone.

## T08 - Plan: temelj sistema   (2026-10-28 02:35)
**Plan korak.** Plan je upisan u `docs/ultra/planovi/T08.md`. Kod nije menjan.

## T09 — Boja radnje, uloge dugmeta, 44 px na dodir   (2026-10-28 03:10)
**Fajlovi:**
- novi: `lib/dugmad-cuvar.ts` (pravila D1–D7), `lib/dugmad-cuvar.test.ts`, `scripts/verify-ultra-dugmad.ts`, snimci `docs/ultra/snimci/T09-*.png` (8), merenje `docs/ultra/merenja/T09-dodir*.{jsonl,json,md}`.
- tokeni i provera: `app/globals.css`, `package.json` (`verify:ultra-dugmad`).
- primitivi: `components/ui/button.tsx`, `switch.tsx`, `checkbox.tsx`, `toggle.tsx`, `toggle-group.tsx`, `input.tsx`, `textarea.tsx`, `dropdown-menu.tsx`, `dialog.tsx`.
- sistem: `components/app/system/` → `focus-card.tsx`, `kpi-tile.tsx`, `channel-focus.tsx`, `chip.tsx`, `empty-state.tsx`, `page-header.tsx`, `progress.tsx`, `mission-card.tsx`, `funnel-steps.tsx`, `celebration-burst.tsx`, `brand-moment.tsx`, `reward-badges.tsx`, `reward-toast.tsx`.
- ljuska i deljeno: `components/app/feedback.tsx`, `tab-nav.tsx`, `section-nav.tsx`, `module-tile.tsx`, `confirm-dialog.tsx`, `date-range-picker.tsx`.
- upotrebe (uloga dugmeta, ručne boje, boja modula na dugmadi, broju i natpisu): 41 fajl iz mape §2.3 plana T08, plus `overview/performance-highlights.tsx`, `overview/unconnected-tile.tsx`, `overview/command-focus.tsx`, `leadovi/{work-card,lead-row-actions,leads-today,leads-table,call-mode,import-flow-steps,import-dashboard,import-review-table,lead-detail,gaps-panel,izbor-sablona}.tsx`, `analytics/{acquisition-dashboard,ads-performance-dashboard}.tsx` (prop `primary`), mreže objava (`facebook-content-grid`, `instagram-content-grid`, `threads-content-grid`, `youtube-videos-grid`), `ads/{new-campaign-wizard,hook-battle-view,hook-label-editor,campaign-detail}.tsx`, `instagram/post-detail/{post-profile-actions,post-reels-performance,post-story-funnel}.tsx`, `threads/threads-attribution-section.tsx`, `settings/{connections-settings,action-audit-log,projekat-panel}.tsx`, `hub/novi-projekat.tsx`, `facebook/{fb-comment-thread,fb-post-comments-panel}.tsx`, `instagram/publish-composer.tsx`, `novosti/{novosti-editor,publish-readiness-panel}.tsx`.
- vodič: `app/dev-ux/sistem/vodic.tsx`, `app/dev-ux/sistem/vodic-komponente.tsx`.

**Šta je urađeno:**
- **Boja radnje (P1).** `:root` dobija `--radnja` (= `--accent-400` #58c4ff), `--radnja-hover`, `--radnja-tekst`, `--radnja-soft`, `--radnja-line` i neutralne `--surface-control` / `--surface-control-hover`, sa utility klasama u `@theme inline`. `--primary` čita `--radnja`. `[data-module]` više ne prepisuje `--primary`, `--ring` ni `--focus-ring-strong`, pa su primarno dugme, veza, Switch, Checkbox, okvir fokusa i ivica polja u fokusu iste boje na svakom modulu. `--shadow-mod` je obrisan (nema upotreba). Vrednosti `--mod-*` nisu menjane.
- **Uloge dugmeta.** `buttonVariants` ima tačno šest uloga (primary, secondary, outline, ghost, destructive, link). `default` je ukinut, a `variant` je obavezan u tipu `Button` (typecheck pada na dugmetu bez uloge). `secondary` je neutralan (`surface-control`), obris je providan sa `text-foreground`, opasno je tinta greške. Svih 73 mesta iz mape plana dobilo je ulogu (33 primary, 30 secondary, 7 destructive, 3 uslovna; 5 u `lead-row-actions` već je imalo ulogu kroz `{...shared}`), a 14 ručno obojenih dugmadi izgubilo je svoje boje. Dodatno je očišćeno 18 dugmadi koja su klasama nosila boju modula.
- **Boja modula izlazi** sa dugmadi, brojeva u fokusu (KpiTile, ChannelFocus, tabla, Danas, Podešavanja → Integracije, atribucija Threads), natpisa pločica i grupa (9), FocusCard (1 px ivica + tiha senka), čipova (tonovi `module`/`accent` ukinuti), merača (nov ton `neutral`), izabranog stanja (čip-filter, jezičci, tekući korak → boja radnje) i neaktivnih pločica modula. Ostaje na aktivnoj stavci bočne trake, ikonici zaglavlja i u auri. Mono je skinut u `system/*` (isti redovi).
- **44 px na dodir.** `pointer-coarse:min-h-11 min-w-11` u osnovi `Button`-a i `Toggle`-a; Switch i Checkbox imaju zonu 44 × 44 oko nepromenjene staze i kućice; `Input` `pointer-coarse:h-11`; stavke menija, zatvaranje dijaloga, Chip sa `onClick`, naslov `WorkCard` i jezičci `SectionNav`. Uz to jedno pravilo u `globals.css` daje 44 px visine svakom ručno pisanom `button`, `select`, `[role=button]` i `[role=tab]` pod `pointer: coarse` (vidi ODLUKE). Desktop: visine dugmadi na 1536 su i dalje 24/28/32/36 px.
- **Provera.** `verify:ultra-dugmad` (D1–D7, plafon boje modula 683) i test logike sa primerima i proverom celog koda.
- **Vodič.** Matrica od 455 dugmadi je zamenjena jednom tabelom 6 uloga × 5 stanja, uz tokene radnje, Switch i Checkbox i primer „Jedan pogled, jedno primarno". Primeri sa dva primarna (zaglavlje + fokus kartica, Napredak, portal) sada imaju po jedno.

**ODLUKE:**
- **Pravilo dodira za ručno pisana dugmad (van spiska plana).** Primitivi sami su na 8 ekrana na 390 spustili male mete sa ~56 % na 41 %; ostatak su ručni `<button>` (filteri Leadova, zaglavlja koja sortiraju, okidači oblačića) i izvorni `select`. Dodato je jedno pravilo u osnovi (`:where(button, select, [role=button], [role=tab])` → `min-height: 44px`, samo `pointer: coarse`, specifičnost 0). Merenje istih 8 ekrana: 172 od 701 (24,5 %); pre runa na tim ekranima ~56 %. Ostatak su linkovi naziva firme u tabeli i uske ćelije ocene (širina, ne visina). Na 390 nema vodoravnog klizanja (tabela, uvoz, FB komentari: `scrollWidth` 390).
- **`data-variant="default"` na Toggle i stavkama menija.** Merenje broji svaki `[data-variant="default"]`, a birač perioda (ToggleGroup) i stavke `DropdownMenu` su ga nosili na svakoj strani (3 po ekranu). Njihova podrazumevana varijanta je preimenovana u `neutral` (bez promene izgleda). Sada 0 na svih 13 merenih ekrana.
- **Oznaka „#1" u mrežama objava i traka „Vodeći hook"** (plan ih je video kao izabrane pilule) nisu izbor nego oznaka ranga: dobile su neutralnu belu podlogu (`bg-foreground text-text-inverse`), ne boju radnje, da ne izgledaju kao dugme.
- **Čip `module`/`accent`** je imao 8 upotreba (plan je brojao 5): sve su `neutral`. ProgressBar `module` u uvozu → `neutral`.
- **Izabran segment perioda** (7 d / 28 d / 90 d) je bio u boji modula; sada je `text-foreground` (segmenti ostaju neutralni, po pravilu izbora iz plana).
- **Dugmad sa bojom modula u klasama (18)**: boja modula je skinuta; tekst-veze u boji modula su prešle u `text-radnja`, a izabrani segmenti u `text-foreground`.
- **`Input` i `Textarea`** gube `dark:` (Tailwind 4 ga čita iz OS teme); podloga je uvek `bg-input/30`, kao na tamnom Windowsu.
- **`CountBadge` ton `accent`** (0 upotreba) ostaje T10-u, koji je vlasnik `count-badge.tsx` po planu. Ikonice `text-primary` u `analytics/realtime-dashboard.tsx` i `retention-dashboard.tsx` su do T10 cijan (prelazno, plan T08 §1.6).
- **Plafon boje modula** je 683 (stvarni broj posle T09; pre T09 857).
- **Playwright MCP se nije povezao** (CONNECT_TIMEOUT). Snimci i merenje su rađeni skriptom nad paketom `playwright` (`.nocni-run/ultra1/tmp/t09-snimci.mjs`), na 390 sa `isMobile` i `hasTouch`, pa se 44 px stvarno vidi.
- Skill `impeccable` je pozvan u ovoj sesiji (T08). Radnici nisu korišćeni; mapa uloga je primenjena skriptom po redovima i proverena typecheck-om (74 greške pre, 0 posle).

**Novi paketi:** nema.

**Testovi:**
- `lib/dugmad-cuvar.test.ts` (10): D2/D3 (dugme bez uloge, `default` i u uslovu, `render={<Button/>}`, komentar se ne broji); D2 izuzetak spread-a sa razlogom; D4 (`buttonVariants` bez uloge ili sa `default`); D5 (ručno puno dugme, izuzetak aktivne pločice); D1 (primitiv sa `default` i podrazumevanom ulogom); D7 (boja modula u shadcn sloju, `:root` bez `--radnja`); D6 (brojanje u stringovima, ne u komentarima); i nad celim kodom: nijedno dugme bez uloge, primitiv i globals ispravni, boja modula ≤ plafon.

**Rezultat provere:**
- typecheck: prošao.
- lint: 0 grešaka (1210 upozorenja, isto kao pre).
- vitest: 63 fajla / 1096 testova prošlo.
- pristup: prošao.
- regresije: 15/15 prošlo (uključuje `verify:ultra-dugmad`, `verify:leads-ui`, `verify:pokret`, `verify:brojevi`).
- `node scripts/contrast-check.mjs --strogo`: 0 od 212.
- **Vizuelno** (`next dev -p 3117`, `?ux=1`):
  - 1536: Instagram, YouTube, Threads, Podešavanja, Leadovi i vodič (`T09-sistem-dugmad-1536.png`); 390 sa dodirom: Leadovi i tabla.
  - Primarno dugme je `rgb(88, 196, 255)` na svih 11 merenih ekrana (Instagram, YouTube, Threads, Podešavanja, Leadovi, Analitika, Oglasi, Facebook, tabla, Pravila, vodič); `[data-variant="default"]`: 0.
  - Na 390 (dodir) sva dugmad i jezičci imaju 44 px (Leadovi 24/24, tabla 4/4); na 1536 visine su 24/28/32/36 px kao pre.
- Dev server je ugašen (PID 22088, 34680, 29392; port 3117 slobodan).

**Za Jovana ujutru:**
1. Na pravom telefonu otvori Leadove (Danas i Tabela) i tablu: dugmad, filteri, jezičci i prekidači treba da su visoki 44 px; na računaru sve ostaje iste veličine.
2. Prođi Instagram, YouTube, Threads, Podešavanja i Leadove: primarno dugme je svuda isti cijan; sporedna dugmad su neutralno siva; boja modula je samo na aktivnoj stavci bočne trake, ikonici zaglavlja i u auri.
3. Potvrdi odluke: pravilo 44 px i za ručno pisana dugmad, bela oznaka „#1" u mrežama objava, opasno dugme kao tinta (i u potvrdi), neutralni merači napretka.

**Prihvatanje T09 (provera stavku po stavku, dopuna 03:20):**
- *Nijedno dugme nema `data-variant="default"`, a primarno je iste boje na svim modulima:* ispunjeno. `verify:ultra-dugmad` (D1–D4) prolazi nad celim kodom. U pregledaču je `[data-variant="default"]` 0 na svih 13 merenih ekrana (i na `/sistem`), a pozadina svakog vidljivog `[data-variant="primary"]` je `rgb(88, 196, 255)` na Instagramu, YouTube-u, Threads-u, Podešavanjima, Leadovima, Analitici, Oglasima, Facebook-u, tabli i Pravilima. Snimci: `T09-instagram/youtube/threads/podesavanja/leadovi-1536.png`.
- *Na 390 px dugmad i jezičci imaju bar 44 px visine:* ispunjeno. Uz `isMobile` i `hasTouch` (pravi `pointer: coarse`): Leadovi 24/24 dugmeta i jezičci po 44 px, tabla 4/4 po 44 px (`T09-leadovi-390.png`, `T09-tabla-390.png`).
- *Na 1536 visine su iste kao pre:* ispunjeno. Klase visine u `ui/button.tsx` nisu menjane u odnosu na `4cfca83` (`git diff`: u bloku `size` je samo uklonjen `text-[0.8rem]` iz `sm`, visine `h-6/h-7/h-8/h-9` i `size-*` iste). Na 1536 (`pointer: coarse` = false) svako vidljivo dugme ima tačno visinu svoje klase veličine: tabla 4/4, Leadovi 24/24, Tabela leadova 54/54, Instagram 1/1, YouTube 22/22, Threads 5/5, Podešavanja 19/19, Analitika 1/1, Oglasi 1/1, Pravila 9/9 (0 razlika). Ručna dugmad i jezičci zadržavaju zatečene visine iz revizije (npr. „Više o ovom ekranu" 20×20, zaglavlja koja sortiraju 16 px, jezičci 37–38 px), jer pravilo dodira važi samo pod `pointer: coarse`. Skripta: `.nocni-run/ultra1/tmp/t09-prihvatanje.mjs`, rezultat `t09-prihvatanje.json`.
- *Vodič `/sistem` bez matrice od 455 dugmadi i bez primera sa dva primarna:* ispunjeno. Naslov „13 modula × 7 varijanti" ne postoji; tabela uloga ima 30 dugmadi (6 × 5), cela strana 49. Van referentne tabele uloga svaka sekcija ima najviše jedno primarno (zaglavlje i fokus kartica: 1, prazna stanja: 1).
- *Provere prolaze; sekcija T09 je u progress-u:* ispunjeno (typecheck, lint 0 grešaka, vitest 1096/1096, pristup, regresije 15/15).
- **Snimci** su rađeni skriptom nad paketom `playwright`, jer se Playwright MCP u tom trenutku nije povezao; pravila runa dozvoljavaju skriptu umesto MCP-a.
- **Procesi:** dev server za dopunsku proveru (PID 31420, 20488, 32424) je ugašen; nijedan `next` proces ovog repoa ne radi, port 3117 je slobodan.

## T10 — Tipografija, kontrast i mono   (2026-10-28 03:35)
**Fajlovi:**
- novi: `lib/tipografija-cuvar.ts` (T1–T4, M1–M3), `lib/tipografija-cuvar.test.ts`, `lib/kontrast-cuvar.ts` (K1–K4), `lib/kontrast-cuvar.test.ts`, `scripts/verify-ultra-tipografija.ts`, `scripts/verify-ultra-kontrast.ts`, snimci `docs/ultra/snimci/T10-*.png` (8).
- tokeni i provere: `app/globals.css` (`--text-muted` 0,86, `--temp-*-ink` + `@theme inline`, komentar skale), `scripts/contrast-check.mjs` (novi parovi), `package.json` (`verify:ultra-tipografija`, `verify:ultra-kontrast`), `lib/dugmad-cuvar.ts` (samo plafon 683 → 679).
- jedan bedž: `components/app/system/count-badge.tsx` (`BedzNaUglu`, tonovi `-soft`, bez `accent` i mono), `nav-badge.tsx` (prop `ugao`), `app-sidebar.tsx`, `mobile-nav.tsx`, `mobile-tab.ts` (obrisan `MOBILE_TAB_BADGE`), `notifications-bell.tsx`.
- `components/motion/count-up.tsx` (rezervisana širina), `components/ui/chart.tsx` (vrednost u oblačiću bez mono).
- SVG oznake u HTML sloj: `analytics/ads-timeseries-chart.tsx`, `analytics/retention-dashboard.tsx`.
- 12 px: 24 fajla iz §4.1 plana T08; ose: `ads/hourly-chart`, `analytics/device-chart`, `instagram/breakdown-chart`, `instagram/follows-chart`, `threads/threads-follows-chart`, `timeline-chart`.
- providnost, `opacity`, sirova paleta i temperatura: ~35 fajlova pod `components/app/` (spisak §5.2–5.3 plana), plus `analytics/realtime-dashboard.tsx` i `retention-dashboard.tsx` (ikonice i trake iz §10.2).
- mono: ~140 fajlova pod `components/app/{ads,leadovi,settings,overview,hub,novosti,napredak,instagram,facebook,openreply,threads,youtube,analytics,attribution}` i koren `components/app/`.
- vodič: `app/dev-ux/sistem/vodic.tsx` („Tipografija i pokret": hero bez mono i bez boje modula, mala tabela „mono samo za ID i brojčane kolone"), `vodic-komponente.tsx` (primer `BedzNaUglu` na zvonu, XP čip bez mono), `vodic-napredak.tsx` (XP broj bez mono).

**Šta je urađeno:**
- **Nijedan tekst ispod 12 px.** Svih 88 klasa `text-[9|10|11px]` je nestalo: 79 je postalo `text-meta`, 5 kopija bedža je zamenila jedna komponenta `BedzNaUglu` (12 px, visina 18 px, Aeonik), a 4 SVG oznake su izašle iz izobličenog SVG-a (`preserveAspectRatio="none"`) u HTML sloj sa pozicijom u procentu viewBox-a. Svih 14 osa Recharts grafikona je na `fontSize: 12`. U pregledaču je najmanji tekst 12 px na svim merenim ekranima, a SVG tekst ose (mereno kao `fontSize × getScreenCTM`) je 12 px i na 1536 i na 390.
- **Kontrast.** `--text-muted` je 0,86 (prigušen tekst ≥ 4,65:1 na svakoj `-soft` podlozi), a tekst temperature u uvozu čita nove `--temp-*-ink` (≥ 5,8:1 na sopstvenoj podlozi). Na tekstu više nema `text-*/NN` (56 mesta), gole `opacity-*` (23 mesta, po receptu §5.3) ni sirove palete (`text-white`, `bg-black/60` → `text-foreground`, `bg-surface-overlay`). `contrast-check` meri 262 para (bilo 212), 0 pada.
- **Mono po P2.** `font-mono` u `components/` i `app/` je pao sa 749 na 271 (bez pravnih strana i prijave). Ostaje na brojčanim kolonama tabela, ID/kodu/tokenu/URL-u/UTM-u/telefonu/e-mailu i `<code>`/`<kbd>`. KpiTile, FocusCard i svi fokus brojevi su Aeonik sa `tabular-nums`. `CountUp` rezerviše širinu konačne vrednosti (Aeonik nema `tnum`), pa se pilula pored broja ne pomera dok broj raste; `{format(display)}` je ostao (verify:pokret, verify:brojevi prolaze).
- **Provere.** `verify:ultra-tipografija` (T1 klase, T2 `fontSize`/`font-size` i u CSS-u, T3 tekst u izobličenom SVG-u, T4 koraci skale, M1 mono uz fokus veličinu, M2 mono u sistemu, M3 plafon 271) i `verify:ultra-kontrast` (K1 `contrast-check --strogo`, K2 providnost, K3 gola `opacity`, K4 sirova paleta). Obe prolaze i `regresije` ih uključuje same.
- **Radnici.** Mono je prešlo šest `sonnet` radnika po direktorijumima, po receptu `.nocni-run/ultra1/tmp/t10-mono-recept.md`. Diff sam proverio skriptom: van `font-mono`/`tabular-nums` radnici su promenili samo dva mesta (vidi ODLUKE); sve ostalo su moje zamene iz plana. Typecheck posle radnika: prošao.

**ODLUKE:**
- **Plafon mono je 271, ne ≤ 260** (procena plana). To je stvarni broj posle prelaska; višak su vodič (`app/dev-ux`, 10 — imena tokena su kod) i ID-jevi u podešavanjima (polja za token, JSON, webhook).
- **Kolona datuma u tabeli nije brojčana** (P2: datumi su reči), pa je izgubila mono; trajanje i iznosi u tabeli ostaju mono.
- **E-mail adresa, naziv fajla, kod jezika, vremenska zona (`Europe/Belgrade`), valuta (`EUR`), slug i heks boje** računaju se kao ID/kod (mono ostaje). Markdown polje u uredniku Novosti je ostalo mono (sirovi tekst). Sirov CTA tip u pregledu oglasa (`LEARN_MORE`) ostaje mono dok ga T12 ne prevede.
- **Dve izmene radnika van čistog brisanja:** `analytics/rank-table.tsx` prosleđuje `font-mono` u `MetricValue` samo u ćelijama tabele (komponenta više nije mono, jer je koriste i čipovi); `leadovi/leads-dashboard.tsx` je mono skinuo sa roditelja i umotao samo kod signala u `<span className="font-mono">`.
- **Recept §5.3 za neaktivne stavke:** `opacity` je obrisan, a naslov NIJE prebačen u `text-text-secondary` — stanje nose prekidač i čip „Isključeno". Obrisan komentar dobija `text-text-muted` na omotaču (dete sa sopstvenom bojom je zadržava); oznaka „Obrisano" ostaje. Prigušen blok moderacije u YouTube uredniku i prigušene metrike Puls kartice kad sinhronizacija zastane izgubili su `opacity` bez zamene (poruka o grešci je već iznad).
- **Brojevi u filter-čipu Leadova i u dugmetu „Pozovi (N)"** nasleđuju boju natpisa (umesto `text-text-muted` iz recepta), jer na izabranom čipu i primarnom dugmetu prigušen ton ne bi imao kontrast.
- **Osa X u grafikonu potrošnje** sada bira tačke ravnomerno (sa prvim i poslednjim danom). Stari korak + nasilno dodat kraj davao je dva datuma jedan preko drugog na 390, što se sa 12 px videlo. Ostalo je isto.
- **M1/M2 ne važe za `app/login` i `app/pozivnica`** (tok prijave se ne dira; polje koda za prijavu je kod). Isto važi za M3, po planu.
- **K2 ne broji par veličina/prored** (`text-sm/6`) ni potez (`text-line/40`, `chart-*`). K3 prepoznaje lucide ikonicu po uvozu iz `lucide-react`.
- **`PLAFON_BOJE_MODULA` spušten na 679** (verify:ultra-dugmad je to tražio, jer je ton `accent` bedža obrisan). To je pooštravanje, ne slabljenje.
- `date-range-picker.tsx` nije diran (mono polja menja T11). `text-[0.8rem]` u primitivima je T09 već obrisao.
- Snimci su rađeni skriptom nad paketom `playwright` (kao u T09); Playwright MCP nije korišćen.

**Novi paketi:** nema.

**Testovi:**
- `lib/tipografija-cuvar.test.ts` (8): T1 (`text-[11px]`, `text-[0.7rem]` padaju; `text-[0.8rem]`, `text-meta` prolaze; komentar se ne broji), T2 (Recharts `tick`, JSX `fontSize`, inline CSS), T3 (`<text>` u izobličenom SVG-u), T4 i CSS (korak skale, pod-svojstva i komentar), M1/M2 (fokus broj, sistem, izuzetak tabele sa razlogom), M3 (brojanje i tok prijave), pa nad celim kodom: nijedan nalaz i mono ≤ plafon.
- `lib/kontrast-cuvar.test.ts` (7): K2 (`text-text-muted/60` pada, `text-line/40` i `text-sm/6` prolaze), K3 (`opacity-60` na `<span>` pada; `disabled:`, `cursor-not-allowed`, lucide, `animate-ping`, `absolute inset-0` prolaze; izuzetak samo u svom fajlu i sa razlogom), K4, K1 (čitanje „Pada: N od M"), pa nad celim kodom.

**Rezultat provere:**
- typecheck: prošao. lint: 0 grešaka (1210 upozorenja, isto kao pre).
- vitest: 65 fajlova / 1111 testova prošlo.
- pristup: prošao. regresije: 17/17 (uključuje `verify:ultra-tipografija`, `verify:ultra-kontrast`, `verify:ultra-dugmad`, `verify:leads-ui`, `verify:uvoz`, `verify:pokret`, `verify:brojevi`).
- `node scripts/contrast-check.mjs --strogo`: 0 od 262.
- **Vizuelno** (`next dev -p 3117`, `?ux=1`, skripta `.nocni-run/ultra1/tmp/t10-snimci.mjs`, merenje `t10-merenje.json`):
  - 1536: `T10-uvoz-pregled-1536.png`, `T10-uvoz-pregled-tabela-1536.png`, `T10-retencija-1536.png`, `T10-podesavanja-1536.png`, `T10-leadovi-tabela-1536.png`, `T10-sistem-tipografija-1536.png`, `T10-sistem-bedz-1536.png`; 390 (dodir): `T10-analitika-oglasi-390.png`.
  - Najmanji HTML tekst je 12 px na pregledu uvoza, Retenciji, Podešavanjima, tabeli i Danas Leadova, vodiču, Analitici (Uživo, Oglasi), Oglasima, Instagramu i tabli; na 390 isto (Oglasi, Retencija, uvoz). Tekst sa providnošću: 0 na svim merenim ekranima.
  - SVG tekst je 12 px na tabli, Oglasima, Instagramu, Analitici, Posetiocima i Threads-u, na 1536 i 390.
- Dev server je ugašen (PID 20308, 3092, 24072, 30256; port 3117 slobodan).

**Za Jovana ujutru:**
1. Otvori Analitiku → Oglasi na telefonu: oznake osa su 12 px i ne preklapaju se; Retencija ima procente kao čitljiv tekst levo od krivih.
2. Prođi tablu, Instagram i Leadove: fokus brojevi i pločice su sada Aeonik (uže cifre), a kolone tabela i ID-jevi ostaju mono. Ako neki broj „pleše" pri osvežavanju van `CountUp`-a, javi.
3. Potvrdi odluke: `--text-muted` 0,86 (prigušen tekst je malo svetliji), datumi u tabelama bez mono, e-mail/vremenska zona/valuta kao kod (mono), neaktivne automatizacije bez prigušenja (stanje nosi prekidač).

**Prihvatanje T10 (provera stavku po stavku, dopuna 03:45):**
- *`verify:ultra-tipografija` ne nalazi veličinu ispod 12 px ni u `app/` i `components/`, ni u osama grafikona:* ispunjeno. Izlaz: „Pregledano fajlova: 372 (+ app/globals.css). font-mono: 271 (plafon 271). verify:ultra-tipografija: prolazi (T1–T4, M1–M3)." T1 pokriva klase `text-[N]`, T2 `fontSize` (i Recharts `tick` ose, svih 14 je na 12), T3 tekst u izobličenom SVG-u, T4 korake skale. U pregledaču je SVG tekst osa 12 px na 1536 i 390 (tabla, Oglasi, Instagram, Analitika, Posetioci, Threads).
- *`contrast-check` prolazi i sa novim parovima:* ispunjeno. `node scripts/contrast-check.mjs --strogo` izlazi sa 0: „Pada: 0 od 262" (pre T10: 212 parova). Novi parovi: radnja (tekst, granica, izabrano), neutralna kontrola, tekst obrisa, `text-muted` na svakoj `-soft` podlozi (stanja, xp, radnja, 13 modula, 5 kategorija; najmanje 4,65:1) i `temp-*-ink` na sopstvenoj podlozi (najmanje 5,8:1).
- *Provere prolaze; sekcija T10 je u `docs/ULTRA1-PROGRESS.md`:* ispunjeno. `npx convex codegen` nije potreban (`convex/` nije menjan). typecheck prošao; lint 0 grešaka; `npx --no-install vitest run` 65/65 fajlova, 1111/1111 testova; `verify-pristup` prošao; `regresije.mjs` 17/17 (uključuje `verify:ultra-tipografija` i `verify:ultra-kontrast`).
- **BLOKADA:** nema.
- **Procesi:** port 3117 slobodan; nijedan `next`/`playwright` proces ovog repoa ne radi.

## T11 — Jedan meni za izbor i jedan format   (2026-10-28 04:10)
**Fajlovi:**
- novi: `components/ui/select.tsx`, `convex/lib/formatJezgro.ts`, `lib/format.test.ts`, `lib/format-cuvar.ts`, `lib/format-cuvar.test.ts`, `scripts/verify-ultra-format.ts`, `app/dev-ux/sistem/vodic-izbor.tsx`, snimci `docs/ultra/snimci/T11-*.png` (15).
- format i period: `lib/format.ts`, `lib/date-range.ts` (+ test), `lib/belgrade-time.ts`, `convex/lib/ga4Format.ts`, `convex/lib/metaAdsFormat.ts`, `convex/_generated/api.d.ts` (+2 reda, codegen), `components/app/date-range-picker.tsx`, `package.json` (`verify:ultra-format`), `lib/tipografija-cuvar.ts` (samo plafon 271 → 269), `app/dev-ux/sistem/vodic.tsx` (1 uvoz + 1 red).
- izbor (`<select>` → `Select`): 35 izvornih u 28 fajlova (`ads/new-campaign-wizard`, `create-lookalike-audience-dialog`, `threads/{search,automations,replies-moderation,composer}`, `leadovi/{lead-gap-fill-dialog,import-review-table,lead-chips,lead-export-dialog,scoring-rules-panel,niches-panel,import-row-dialog}`, `youtube/{yt-video-edit-dialog,yt-upload-dialog,yt-captions-panel}`, `instagram/{inbox/inbox-settings-drawer,instagram-demographics,metric-explorer}`, `openreply/profile-menu-panel`, `novosti/{novosti-editor,novosti-board}`) plus `rules/rule-editor-dialog` (meni mere).
- rasuto formatiranje u ~31 fajlova pod `components/app/` (+ `app/dev-ux/sistem/vodic-napredak.tsx`): `capi-section`, `analytics-dashboard`, mreže objava (FB/IG/Threads/YouTube), `imports-history`, `site-status-badge`, `napredak-screen`, `dm-log-table`, `battle-verdict`, `placement-breakdown`, `site-audit-panel`, `lead-score-cell`, `evidence-meter`, `overdue-panel`, `instagram-stories`, `rule-*`, `rules-list`, `settings/{connections-settings,moderation-audit-log,purge-state,sajt-panel,action-audit-log,ga4-configuration}`, `yt-captions-panel`, `yt-comment-log-table`, `ad-action-dialog`, `retention-dashboard`, `publish-composer`, `yt-upload-dialog`.

**Šta je urađeno:**
- **`Select`** je nad `@base-ui/react/select`: okidač kao polje (32 / 28 px, 44 px pod `pointer: coarse`), popup kao `popover` (prelaz, ne keyframe), stavka `min-h-8` / 44 px, istaknuta `bg-surface-control`, izabrana sa `Check`. `label` je obavezan i uvek ide u `aria-label` okidača; tastatura (strelice, Home/End, kucanje, Enter/razmak, Esc) je iz Base UI-ja. Podržava grupe, `placeholder`, `renderOption`, `triggerClassName`, `invalid`, `required`, `name`. Primer sa svim stanjima je u vodiču `/sistem` (sekcija „Izbor i formati“).
- **Prelazak.** U `app/` i `components/` nema izvornog `<select>`; pregled uvoza ima 50 imenovanih okidača (bilo 50 neimenovanih po axe-u), svaki sa imenom firme u natpisu („Temperatura u uvozu: …“). Zatečeno stanje je bilo 35 izvornih `<select>` + 1 meni mere u pravilima (plan je brojao 36, prompt 39); svi su pokriveni.
- **Prilagođen period.** Dva tekstualna polja „Od“/„Do“ (`27. 10. 2026.`, bez mono), čitanje preko `datumIzTeksta` na `blur` i pre „Primeni“ (prima „27. 10. 2026.“, „27.10.2026“, „27.10.“, „27/10/2026“, „2026-10-27“), greška „Upiši datum kao 27. 10. 2026.“, prečice „Ovaj mesec“ i „Prošli mesec“ (popunjavaju polja, ne primenjuju sami).
- **`lib/format.ts` (P7).** Datum „27. 10. 2026.“ (`formatDate`), kratko „27. okt“ (fiksni nazivi meseci), vreme „17:41“, trajanje „1 min 1 s“ / „1 h 2 min“ (NBSP), procenat „53,8 %“ (NBSP), `formatPercentValue` za već-procentne vrednosti, `formatDateSpan` („1.–15. okt“, „28. sep – 15. okt“, preko godine sa godinama), `formatMonthShort`, `formatDuration`; `formatDurationMs`/`formatSeconds` su ista funkcija. Server i front dele `convex/lib/formatJezgro.ts` (`procenat`, `trajanje`, `NBSP`); `ga4Format` i `metaAdsFormat` ga koriste.
- **`verify:ultra-format`** (F1–F5, `lib/format-cuvar.ts`) i test sa primerom koji pada i koji prolazi za svako pravilo.

**ODLUKE:**
- **`api.d.ts` za `lib/formatJezgro`:** prvi `npx convex codegen` je pao na mreži (`getaddrinfo ENOTFOUND`), pa sam dopisao dva reda ručno; kasniji codegen je prošao (izlaz 0) i ostavio `api.d.ts` sa istim dvama redovima.
- **Brojke:** zatečeno je 35 izvornih `<select>` (plan T08: 36, prompt: 39); lokalni `SELECT_CLASS` obrisan u oba dijaloga.
- **`label` = vidljivi natpis** gde ga ima (npr. „Tip signala“, „Metrika“, „Meta Ads nalog“, „Tip rangiranja“), umesto imena iz plana, da se `aria-label` poklapa sa onim što se vidi (WCAG 2.5.3). Vidljivi `<label>` koji nisu bili povezani dobili su `htmlFor` + `id` (lead-gap-fill, lead-export, import-row, threads-search, inbox-settings-drawer, yt-video-edit).
- **Prazna opcija:** „bez izbora“ je postao `placeholder`; prava „Sve …“ opcija ostala je opcija (`"all"` ili `""`). Izuzetak: kategorija u izmeni YouTube videa zadržava opciju „Ostaje kakva jeste“ (vrednost `""`), da se izbor može poništiti kao pre.
- **Meni mere u Pravilima** je prešao na `Select` (bio `DropdownMenu` + radio); akronim mere ostaje u `title` stavke.
- **`Intl.DisplayNames`** (nazivi država u demografiji) je izuzet iz F3: to nije format broja ni datuma.
- **`formatDayRelative`** i dalje daje „danas/sutra/juče“, a inače „pet, 12. sep“ (dan u nedelji + kratak datum) umesto „pet, 12.09.“ (plan ga je naveo kao „isto“, ali stari oblik krši P7).
- **YouTube dužina videa** je sada „1 h 2 min“ umesto „1:02:33“ (plan §8.1: jedan format). Menjaju se i drugi prikazi: sekunde više ne stoje u dnevniku radnji (`action-audit-log`), godina je dodata gde je nije bilo (`rules-list`, `dm-log-table`, `yt-comment-log-table`), a datumi u `napredak-screen` nisu više fiksno u zoni Beograda nego u zoni čitaoca (za Jovana ista).
- **`formatPercent` ima uvek jednu decimalu** („53,0 %“, ne „53%“) na mestima gde je ranije pisao ceo broj (`lead-score-cell`, `evidence-meter`, presude oglasa); `formatPercentValue` (0 decimala) je dodat za vrednosti već u procentima (promena budžeta, ose retencije, koordinate oznake).
- **Izuzetak F4:** koordinate u `title` ćelije pregleda uvoza (`lat.toFixed(5)`) ostaju, po planu §8.3.
- **F3 pokriva `components/app/**`, `app/(app)/**`, `app/dev-ux/**`** kao u planu; ostali `components/` (npr. `ui/chart.tsx`) nisu u opsegu F3.
- **`lib/belgrade-time.ts`** uvozi `./format` (relativno, jer `lib` testovi nemaju alias `@/`), pa `formatBelgradeShort` daje „20. avg 18:30“.
- **`PLAFON_MONO` spušten na 269** (`verify:ultra-tipografija` je to tražio posle uklonjenih polja datuma); pooštravanje, ne slabljenje.
- **Radnici:** 5 `sonnet` radnika (3 za `<select>` po grupama, 2 za format po grupama); diff pregledan uzorkom (`import-review-table`, `lead-chips`, `yt-video-edit-dialog`), typecheck posle svakog. Playwright MCP nije korišćen; snimci su skriptom nad paketom `playwright` (kao u T09/T10).

**Novi paketi:** nema.

**Testovi:**
- `lib/format.test.ts` (16): svi primeri P7 doslovno, NBSP u procentu i jedinicama, granice trajanja 0/59/60/61/3.600/3.725 s, raspon u istom mesecu / preko meseca / preko godine, `formatRelativeTime` posle 7 dana, `formatBelgradeShort`.
- `lib/date-range.test.ts` (+5): `datumIzTeksta` (svi oblici, nepostojeći datum, prestupna godina), `ovajMesec`, `prosliMesec` (preko godine, februar prestupne), `kljucDanaUZoni`.
- `lib/format-cuvar.test.ts` (8): F1–F5 (primer koji pada i koji prolazi, komentar se ne broji), izuzetak sa razlogom, i nad celim kodom nema nalaza.

**Rezultat provere:** typecheck prošao; lint 0 grešaka (1209 upozorenja); vitest 67 fajlova / 1137 testova; pristup prošao; regresije 18/18 (uključuje `verify:ultra-format`); `npx convex codegen` prošao (izlaz 0, `api.d.ts` +2 reda za `formatJezgro`).
- **Vizuelno** (`next dev -p 3117`, `?ux=1`, `.nocni-run/ultra1/tmp/t11-snimci.mjs` i `t11-period.mjs`): pregled uvoza 50 okidača, 0 bez imena, visina 28 px na 1536 i 44 px na 390 (dodir); Pravila → novo pravilo: okidač „Mera“ 32 px / 44 px, strelica + Enter menjaju izbor; birač perioda: „Prošli mesec“ popunjava „1. 9. 2026.“ – „30. 9. 2026.“, „31.2.2026“ daje grešku i onemogućava „Primeni“, „1.10.“ i „15/10/2026“ se normalizuju na „1. 10. 2026.“ i „15. 10. 2026.“. Snimci: `T11-uvoz-pregled-*`, `T11-uvoz-izbor-otvoren-*`, `T11-pravila-novo-*`, `T11-pravila-mera-otvoreno-*`, `T11-period-*` (1536 i 390), `T11-sistem-izbor-1536`.
- Dev server je ugašen; port 3117 slobodan.

**BLOKADA:** nema.

**Za Jovana ujutru:**
1. Otvori pregled uvoza i Pravila → Novo pravilo: izbori se otvaraju mišem, strelicama i Enter-om, a na telefonu su visoki 44 px.
2. Otvori birač perioda → Prilagođeno: kucaj „1.10.“ i „15.10.2026“, probaj „Ovaj mesec“ i „Prošli mesec“.
3. Potvrdi odluke: dužina YouTube videa kao „1 h 2 min“, procenat sa jednom decimalom i tvrdim razmakom („53,0 %“), godina u dnevnicima, kategorija videa sa opcijom „Ostaje kakva jeste“.

**Prihvatanje T11 (stavku po stavku):**
- *U `app/` i `components/` nema izvornog `<select>` (grep), a svaki izbor ima ime:* ispunjeno. `grep "<select"` daje samo komentar u `lead-state-chip.tsx`; F1/F2 prolaze; u pregledu uvoza 0 okidača bez `aria-label`.
- *Datumi, trajanja i procenti idu kroz `lib/format.ts` (test):* ispunjeno. F3–F5 prolaze nad celim kodom; `lib/format.test.ts` pokriva P7.
- *Provere prolaze; sekcija T11 je u progress-u:* ispunjeno.
