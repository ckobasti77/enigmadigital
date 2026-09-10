# Šta je ostalo posle A1–A8

Sastavljeno u A8 (10.9.2026) čitanjem izveštaja A1–A6 i sopstvenog rada.
Ovo je ulaz za sledeći krug — **nijedna stavka nije mišljenje, svaka ima izvor**
(faza koja ju je zapisala) i procenu vrednosti.

Procena vrednosti: **A** = obara kriterijum iz `app-ux-plan.md` §4, radi se prvo ·
**B** = vidljivo korisniku ili pravi rizik u radu · **C** = higijena koda, može da čeka.

---

## 0. Najveća rupa: A7 nije pokrenut

`nocni-run/run-ux.ps1` je posle A6 preskočio A7 i pokrenuo A8 (vidi
`nocni-run/logs/` — postoji `A6-20260910-0527.log` pa odmah
`A8-20260910-0603.log.err`, između njih ničega). **Nijedan zadatak iz `A7.md`
nije urađen**: prazna stanja (spisak i prolaz kroz sva), ujednačavanje teksta,
`aria-label` na ikonicama-dugmadima, tastatura (`/`, `Esc`, `Enter`, radnje iz
zvona u ⌘K paleti) i prolaz kroz 390 px.

To je razlog zašto §4 tačke **6** i **7** nisu ispunjene.

| Stavka | Vrednost |
|---|---|
| Pokrenuti `nocni-run/A7.md` kao zasebnu sesiju | **A** |

---

## 1. Obara kriterijum iz §4 (vrednost A)

| # | Šta | Odakle | Šta tačno treba |
|---|---|---|---|
| 1.1 | **Zadatak „N firmi bez procene čiji je broj"** ne postoji u zvonu — jedini red iz §1.1 koji se nigde ne vidi (obara §4/2) | A2 „Šta NIJE urađeno", A4 nije stigao | Prvo filter: vrednost `bez_procene` u `DodirFilter`-u ili čip u grupi „Telefon" (`convex/leadFiltersStore.ts`). Tek onda ~7 redova u `convex/lib/notifications.ts` — bez filtera dugme vodi na nefiltriranu tabelu, dakle mrtvo dugme. |
| 1.2 | **`/settings` na 390 px kliza vodoravno** (539 px umesto 390) — obara §4/8 | A1 izmerio, dodelio A6; A6 nije mogao da snimi | Kartice integracija u `connections-settings.tsx`. Popravka je mala, ali bez snimka nije dokaziva — ide zajedno sa 1.3. |
| 1.3 | **Snimci ne postoje za 6 ekrana i za dve faze** (A6 1/12, A8 0/12) — obara §4/9 | A6 „Poznati rizici", A8 | Dva odvojena posla: (a) čist `next dev` (vidi §4 ispod), (b) fixture za Facebook / Threads / YouTube / Ads / Analitiku / Atribuciju u `app/dev-ux/fixtures.ts`. (b) je najveći pojedinačni posao na ovom spisku i jedini koji trajno otvara §4/9. |
| 1.4 | **Nema provere „svaki broj ima imenilac"** — §4/5 je dokazan samo za KPI pločice (72/72), zvono i red brojeva na „Danas" | A8 merenje | Skript koji pada kad metrička brojka nema ni `note` ni `delta` ni `title`. Danas se to ne meri nigde van `KpiTile`-a. |

---

## 2. Vidljivo korisniku ili rizik u radu (vrednost B)

| # | Šta | Odakle | Napomena |
|---|---|---|---|
| 2.1 | **Fit nije filter** — `listLeadsFiltered` ga ne zna, računa se pri čitanju | A3 odluka 4, A4 odluka 2 | Blokira preset „Nikad dodirnut, Fit ≥ 50" i tačan broj iza „Vidi sve (N)" u traci „Zovi sada" (danas nadskup). |
| 2.2 | **Nema ILI između grupa filtera** (`prolaziSve`) | A4 odluka 1 | Blokira preset „Sajt loš ili spor". |
| 2.3 | **Nema upita za buduće korake** (`listOverdue` daje samo prošle) | A3 „Šta NIJE urađeno" | Traka „Vrati se na" pokriva zaostale + sastanke, ne i „sledeći korak u naredna 3 dana". Predlog: argument `do` u `listOverdue` ili `listUpcoming`. |
| 2.4 | **Dva broja za isti posao**: `listGaps.bezTelefona` (panel) i `staMeCeka` (bedž) — različite granice, mogu da se raziđu | A4 „Šta NIJE urađeno" | Traži jedan Convex upit. Danas se poklapaju na 210 firmi. |
| 2.5 | **Trošak upita u ljusci**: `staMeCeka` se izvršava na svakom ekranu (~600 dokumenata), a prozor od 250 komentara obara ponovno računanje celog upita pri svakom novom komentaru | A2 „Poznati rizici" | Meriti pre nego što se dira; prva granica koju treba spustiti je prozor komentara. |
| 2.6 | **Trošak jezička „Danas"** (~1.500 dokumenata po otvaranju) i **`listNiches` u tabeli** | A3 „Poznati rizici" | Na 210 firmi je u redu; na 2000 dodela treba proveriti. |
| 2.7 | **Traka poziva se i dalje zatvara rezom** — `Unfold` bez `open` na 4 mesta (tabela, kartica, „Danas", „Zaostali") | A8 odluka 3 | Sada je jeftino: `Unfold` ume izlazak, treba samo kapija za sadržaj trake (telefon nestane iz stanja pre animacije). |
| 2.8 | **Ostale shadcn primitive su i dalje na keyframe-ima** iz `tw-animate-css` (`dropdown-menu`, `dialog`, `tooltip`, `select`) — dakle neprekidive, i kose se sa CLAUDE.md pravilom 2 | A8 | `popover` je preveden na prelaz u A8 i može da posluži kao obrazac. Ne obara §4, ali je ista greška na još četiri mesta. |
| 2.9 | **`import-review-table` i `import-row-dialog` imaju sopstveni `TEMP_CONFIG`** sa `[var(--temp-*)]` klasama umesto `lib/temperature.ts` | A1 „Šta NIJE urađeno" (dodeljeno A5, A5 ga nije dirao) | Boja temperature u uvozu može da se raziđe sa bojom u tabeli. |
| 2.10 | **Nedefinisani tokeni boja i sirova Tailwind paleta** van leadova: `bg-surface-sunken` 15×, `bg-surface-subtle` 8×, `text-warning-400`, `text-surface-canvas`, `text-text-subtle`, `bg-surface-elevated`; `amber-*`, `blue-*`, `bg-white` u inbox/threads/ads/novosti | A1 §1 (dodeljeno A6; A6 je menjao komponente, ne tokene) | Klase koje tiho ne rade — isti uzrok kao „27 % žut, 64 % siv" iz A1. Meri se sa `node scripts/dna-inventory.mjs`. |
| 2.11 | **Prazna stanja sa zelenom kvačicom**: `novosti-table`, `action-audit-log` (2 preostala od 4) | A1 §1, dodeljeno A7 | Deo A7. |
| 2.12 | **`yt-automations-dashboard` `NoAutomations`** nije na sistemskom `EmptyState`-u | A6 odluka 3 | Deo A7. |
| 2.13 | **`StatusPill` i `Chip` su dva paralelna sistema pilula** (~20 mesta u Podešavanjima) | A6 odluka 1 | Traži odluku: prihvatiti `StatusPill` kao drugi sistemski oblik ili ga ukinuti u korist `Chip`-a. Dok se ne odluči, svaki nov ekran bira nasumično. |
| 2.14 | **`attribution-dashboard` ima ručne KPI kartice** — `StatTile` ima jedan `note`, a tim pločicama trebaju dva reda | A6 odluka 2 | Proširiti `KpiTile`/`StatTile` opcionim `secondaryNote`, pa konvertovati. Prisilna konverzija bi obrisala red podataka. |
| 2.15 | **`CountBadge` ne prelazi** — bedž skoči sa 5 na 4 | A8 odluka 5 | Svesno ostavljeno (dvocifren bedž koji se vrti je šum). Ako se ipak želi, `CountUp` je gotov. |
| 2.16 | **Zvono čita samo 15 najnovijih uvoza i 500 nerazrešenih po uvozu** | A5 „Poznati rizici" | Nerazrešen red u šesnaestom uvozu se ne vidi u zvonu (vidi se u istoriji i traci). |
| 2.17 | **Rezime „Šta je nastalo" čita sve redove uvoza bez granice** | A5 „Poznati rizici" | Danas je najveći uvoz 102 reda; na nekoliko hiljada bi bio skup. |
| 2.18 | **`abandonImport` je jednosmeran** — uvoz sa statusom `ponisten` se ne vraća u „U pregledu" | A5 „Poznati rizici" | Povratak je jedna mutacija; svesno nije dodat bez traženog razloga. |
| 2.19 | **`leadovi.zaostali` ne razlikuje vlasnika** — broji ceo radni prostor | A2 „Šta NIJE urađeno" | Bezopasno dok je jedan operater; postaje pogrešno čim ih bude dvoje. |
| 2.20 | **„Sastanak danas" ne prikazuje ime firme kad ih je više od jednog** | A2 „Šta NIJE urađeno" | Naslov tada glasi „N sastanaka danas". |

---

## 3. Higijena koda (vrednost C)

| # | Šta | Odakle |
|---|---|---|
| 3.1 | `text-[11px]` / `[10px]` / `[9px]` — 81 mesto van skale 12/13/15/20/28 | A1 §1, dodeljeno A6/A7 |
| 3.2 | `revert*` mrtvo stanje u `import-review-table.tsx` (7 upozorenja) | GL1, ponovljeno u GL9 i A5 |
| 3.3 | ~1.284 zatečenih eslint grešaka u celom repou (uglavnom `no-explicit-any` u `scripts/verify-gads-*`), uključujući kopije u `.claude/worktrees/*` koje eslint takođe skenira | A1–A6, nepromenjeno |
| 3.4 | 60 % razmaka nije na mreži od 8 px (`gap-1.5` 709×, `p-2.5` 399×) | A1 §2 |
| 3.5 | 77 različitih recepata čipa za ~93 upotrebe — sistemski `Chip` tek ulazi u upotrebu | A1 §6 (`dna-posle.md`) |
| 3.6 | `convex/_generated/api.d.ts` je dopisan ručno na dva mesta (A2, A5) jer run ne sme da pokrene `npx convex dev` | A2, A5 |

---

## 4. Alatke koje fale da bi se bilo šta dokazalo

| # | Šta | Zašto boli |
|---|---|---|
| 4.1 | **Nema načina da se dobije čist `next dev`** u noćnom runu. Next 16 dozvoljava jedan dev server po direktorijumu; kad se zaglavi (Turbopack „Jest worker … exceeding retry limit"), svaki sledeći run ostaje bez snimaka. A6 je izgubio 11/12 snimaka, A8 svih 12. | Obara §4/9 svaki put. Rešenje: `run-ux.ps1` da pre svake faze ubije zaostali `next dev` (Next sam ispisuje PID i komandu), ili poseban `distDir` po runu. |
| 4.2 | **Nema `convex-test`** — nijedna Convex funkcija iz A2/A5 nije izvršena nad bazom, samo tipizovana | A2, A5 „Šta NIJE urađeno". Rep zabranjuje instaliranje paketa koje plan ne pominje, pa ovo mora u plan. |
| 4.3 | **Nema sesije za `digital.enigmait.rs`** — nijedna faza A1–A8 nije ništa videla na produkciji | Sve „Ručne provere na produkciji" iz šest izveštaja čekaju čoveka. |
| 4.4 | **Entropija tabele nije merena nad stvarnim presekom** — `--json` put postoji (`verify:leads-ui -- --json …`), ali traži sesiju | §4/3 je dokazan nad 25 sintetičkih redova kalibrisanih na produkciju, ne nad stvarnih 178. |
| 4.5 | **Pokret nije viđen u pregledaču** — `verify:pokret` dokazuje ugovor (trajanja, krive, prekidivost, reduced-motion), ne izgled | A8. Sonda koja meri visinu proširenog reda u kadru prekida ostaje da se napiše. |

---

## Predlog redosleda za sledeći krug

1. **A7** kao što je napisan (obara §4/6 i §4/7).
2. **4.1** — popravi runner da ubija zaostali dev server; bez toga sledeći krug opet nema dokaz.
3. **1.1** — filter `bez_procene` + zadatak u zvonu (zatvara §4/2, i to je poslednji red iz §1.1).
4. **1.3 (b)** — fixture za šest ekrana bez razvojnog prikaza (otvara §4/8 i §4/9 za polovinu aplikacije).
5. **1.2** — `/settings` na 390 px, zajedno sa snimkom kao dokazom.
6. Zatim B-spisak po redu: 2.1 → 2.3 → 2.4 → 2.7 → 2.8.
