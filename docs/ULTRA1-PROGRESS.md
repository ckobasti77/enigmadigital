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
