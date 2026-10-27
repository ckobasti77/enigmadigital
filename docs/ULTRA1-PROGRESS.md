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
