# Plan B4 (plan korak runnera, 2026-10-11 20:17)

# B4 — plan: Napredak (backend)

## 0. Kontekst

Napredak (XP, nivoi, misije, niz, prstenovi, dostignuća) mora da se izvede iz događaja koji već postoje u Convex-u. B5 gradi UI nad ovim API-jem, pa su potpisi i oblici ovde ugovor. Ništa se ne deploy-uje ručno: šema ide kroz push na main, zato su sva nova polja `v.optional`.

Stanje u kodu (provereno): ne postoji ništa pod imenom `napredak` osim B2/B3 prezentacionih komponenti (`PlayerCard`, `XpBar`, `LevelBadge`…) i konstante `NAPREDAK_HREF`.

## 1. Ključne odluke

| # | Odluka | Zašto |
|---|---|---|
| O1 | **Zaključeni dani se pamte kao zbir (`osnova`), otvoreni dani se izvode uživo.** XP = `osnova.xp` + XP iz događaja otvorenih dana. | Čisto izvođenje iz cele istorije čita sve događaje pri svakom upisu, a `stanje` je pretplaćen u ljusci na svakom ekranu. Za godinu dana to je ~15k dokumenata po izvršenju i udara u limit od 32k. |
| O2 | **Otvoren prozor = danas + juče.** Događaj upisan više od jednog beogradskog dana posle svog `occurredAt` daje 0 XP. | `logTouch` i `recordOutcome` primaju vreme unazad (`touchedAt`, `outcomeAt`). Jutarnji upis jučerašnjeg poziva zadržava XP i niz; dublje unazad bi otvorilo zaključene dane. Pravilo zavisi samo od događaja (`occurredAt`, `_creationTime`), pa je determinističko. |
| O3 | **`stanje` ne čita sat.** Dan drži „sidro": poslednji red `napredakDan`, koji upisuje mutacija `zamrzniDan`. | Convex smernica (upit se ne ponavlja kad vreme prođe) i keš: argument je samo `workspaceId`, pa ponovna učitavanja ne koštaju ništa. |
| O4 | **Zamrzavanje je zasebna, idempotentna mutacija `zamrzniDan`**, koju klijent zove kad `stanje.dan` nije današnji beogradski datum. | Upit ne može da piše. Cron u ponoć bi zamrznuo misije iz stanja u 00:00 (pre jutarnje sinhronizacije) i pravio redove za dane kad niko nije otvorio aplikaciju. Kačenje na „prvu mutaciju dana" bi gamifikaciju razvuklo kroz 10+ domenskih mutacija. |
| O5 | Beogradsko vreme u `convex/lib/napredak.ts` je **aritmetika EU pravila** (poslednja nedelja marta i oktobra, 01:00 UTC), bez `Intl` i bez uvoza iz korenskog `lib/`. | `convex/` ne uvozi iz korenskog `lib/` (postojeće pravilo u `notifications.ts`). Test ukršta rezultat sa `lib/belgrade-time.ts` preko granica 2024–2030. |
| O6 | XP sme da **opadne** unutar otvorenog prozora (poništen uvoz, povučen članak, red vraćen na „nerazrešeno"). Zaključeni dani se ne menjaju. | Izvedeno je izvedeno. B5 hook slavi samo rast. |

Odstupanja od doslovnog teksta §6 su u odeljku 15.

## 2. Popis izvora (§6.2, dopunjeno)

| Događaj | Tabela i uslov | Autor | Vreme | Autor postoji? | XP | Kapa |
|---|---|---|---|---|---|---|
| Dodir | `leadStageEvents` `kind:"dodir"`, `toValue ≠ "beleska"` | `actorUserId` (obavezno) | `occurredAt` (= `touchedAt ?? now`, može unazad) | da | 10 | 1 po firmi dnevno |
| Ishod | `leadStageEvents` `kind:"ishod"` | `actorUserId` | `occurredAt` (= `outcomeAt ?? now`) | da | 15 | 1 po firmi dnevno |
| Sledeći korak | `leadStageEvents` `kind:"sledeci_korak"`, `toValue` postoji | `actorUserId` | `occurredAt` (= now) | da | 5 | 1 po firmi dnevno |
| Sastanak dogovoren | `leadStageEvents` `kind:"sastanak"`, `toValue` postoji (bez `toValue` = otkazan) | `actorUserId` | `occurredAt` | da | 50 | **1 po firmi dnevno (dodajem)**; otkazan istog dana = 0 |
| Faza → `poslata_ponuda` | `leadStageEvents` `kind:"faza"`, `toValue:"poslata_ponuda"` | `actorUserId` | `occurredAt` | da | 40 | 1 po firmi (provera ranijih događaja firme, `by_workspace_company`) |
| Faza → `dobijen` | isto, `toValue:"dobijen"` | `actorUserId` | `occurredAt` | da | 250 | 1 po firmi |
| Uvoz primenjen | `leadImports` `status:"primenjen"` | **`appliedBy` (NOVO)**; za stare redove `uploadedBy` | `appliedAt` | delimično: pamti se ko je poslao fajl, ne ko je primenio | 20 | — |
| Rešen red uvoza | `leadImportRows` | **`resolvedBy` (NOVO)** | **`resolvedAt` (NOVO)** | ne | 3 | 100 dnevno |
| Objava IG | `igPublishJobs` `status:"published"` | `createdBy` (obavezno) | `publishedAt` | da | 30 | — |
| Objava Threads | `threadsPublishJobs` `status:"published"`, bez `replyToId` | `createdBy` (opciono; automatski odgovori ga nemaju → 0 XP) | `publishedAt` | da, za ljudske | 30 | — |
| Članak | `posts` `status:"published"` | **`publishedBy` (NOVO)** | **`firstPublishedAt` (NOVO)** | ne (samo tekst `authorName`) | 60 | 1 po članku |
| Moderacija / odgovor | `igModerationLogs`, `fbModerationLogs`: `status:"done"`, `action ∈ {reply, hide, delete}`; uz to Threads odgovor čoveka (`replyToId` postoji) | `userId` (obavezno) / `createdBy` | `createdAt` / `publishedAt` | da | 5 | 20 dnevno, 1 po komentaru |
| Radnja na oglasima | `adActions` `status:"success"` | `userId` (opciono u šemi, svih 8 poziva ga šalje) | `executedAt` | da | 10 | 10 dnevno |
| Pravilo napravljeno | `rules` | **`createdBy` (NOVO)** | `_creationTime` | ne | 20 | 1 po pravilu |
| Dopuna telefona (misija i „Detektiv"; nema svoj XP red) | `leadIdentities` `kind:"phone"` | **`createdBy` (NOVO)** | `createdAt` | ne | 0 | — |
| Misija završena | izvedeno: `napredakDan.misije` + događaji tog dana | — | vreme događaja koji ju je završio | — | 30–80 | 3 dnevno |
| Sve tri misije | izvedeno | — | isto | — | +100 | 1 dnevno |

Mutacije koje OD SADA upisuju autora (stari redovi bez autora = 0 XP):

| Polje | Mutacija | Napomena |
|---|---|---|
| `leadImports.appliedBy` | `leadImportStore.applyImport` | uz postojeći `appliedAt` |
| `leadImportRows.resolvedBy/At` | `leadImportStore.setRowDecision`, `setRowObrisan` | upis kad red prestane da bude nerazrešen (`jeNerazresen` iz `lib/importFlow.ts`); vraćanje briše oba polja |
| `leadIdentities.createdBy` | `leadGapFillStore.fillGap` (`bez_telefona`) | uvoz ga ne upisuje, pa uvoz nije „dopuna" |
| `posts.publishedBy`, `firstPublishedAt` | `postsStore.publish` | samo pri PRVOJ objavi; `publish` danas prepisuje `publishedAt` pri svakoj ponovnoj objavi, pa bi bez drugog polja „povuci → objavi" davalo 60 XP svaki put |
| `rules.createdBy` | `rulesStore.createRule` | šabloni iz `ensureTemplateRules` ostaju bez autora |

## 3. Šema

Nove tabele: sva polja `v.optional` sa komentarom `OPCIONO NAMERNO` (obrazac `notificationState` — upis uvek postavlja `workspaceId`, `userId` i ključ; čitanje nepotpun red preskače).

```ts
napredakDan: defineTable({            // korisnik × radni prostor × beogradski datum
  workspaceId, userId,
  dan: v.string(),                    // "2026-10-11"
  misije: v.array(v.object({ kljuc, cilj, xp, oblast, veza })),   // najviše 3, zamrznuto
  zamrznutoAt: v.number(),
  prvi: v.boolean(),                  // prvi red ovog korisnika (tihi početak)
  naOtvaranju: v.object({ zaostali, nereseniRedovi, odseceno }),  // izmereno pri zamrzavanju
  osnova: v.object({                  // zbir zaključno sa danom `do`
    do, xp, niz, nizDo, najduziNiz,
    brojaci: v.object({ dodiri, pozivi, sastanci, ponude, dobijeni, objave,
                        moderacije, dopune, uvozi, redovi, pravila, danaSaXp }),
    serije: v.object({ uvekIshod, bezZaostataka }),
    rekordi: v.object({ xpDan, xpDanKad, poziviDan, poziviDanKad, sastanciNedelja }),
    otkljucano: v.record(v.string(), v.number()),   // dostignuće → vreme; najviše 24 ključa
  }),
  // zaključak dana (kad dan izađe iz otvorenog prozora)
  zakljucenAt, xp, uracunat,
  brojevi: v.object({ dogadjaji, pozivi, dodiri, ishodi, sastanci, objave, moderacije, dopune, misije }),
}).index("by_user_workspace_dan", ["userId", "workspaceId", "dan"]),

napredakPodesavanja: defineTable({    // jedan red po korisniku × radnom prostoru
  workspaceId, userId, ukljucen, vikendNePrekida, ciljPozivi, ciljSastanci, ciljObjave, updatedAt,
}).index("by_user_workspace", ["userId", "workspaceId"]),

napredakPotvrde: defineTable({        // viđene proslave
  workspaceId, userId,
  opseg,        // "trajno" | datum
  kljuc,        // "misija:pozovi" | "bonus" | "nivo" | "dostignuce:zatvarac"
  vrednost,     // samo za "nivo": najviši potvrđeni
  potvrdjenoAt,
}).index("by_user_workspace_opseg", ["userId", "workspaceId", "opseg"]),
```

Novi indeksi na postojećim tabelama (sve male tabele, nijedan `staged` jer moraju da se čitaju odmah):

| Tabela | Indeks | Polja |
|---|---|---|
| `leadStageEvents` | `by_workspace_actor_time` | `workspaceId, actorUserId, occurredAt` |
| `leadImportRows` | `by_workspace_resolver_time` | `workspaceId, resolvedBy, resolvedAt` |
| `leadIdentities` | `by_workspace_creator_time` | `workspaceId, createdBy, createdAt` |
| `igPublishJobs` | `by_workspace_published` | `workspaceId, publishedAt` |
| `threadsPublishJobs` | `by_workspace_published` | `workspaceId, publishedAt` |

Indeks po `publishedAt` postoji zato što `by_workspace_status` ređa po vremenu pravljenja posla: objava zakazana pre tri nedelje a objavljena danas ne bi bila u prozoru.

Purge mapa: tri nova unosa u `EXTRA_TABLE_OWNERSHIP`, sva `excluded` (brojevi i ključevi, bez tuđeg sadržaja, ne dolaze od provajdera — ista klasa kao `notificationState`).

## 4. `convex/lib/napredak.ts` (čisto, bez Convex uvoza)

```ts
// vreme
danKljuc(ms): string;  pocetakDana(dan): number;  dodajDane(dan, n): string;
ponedeljak(dan): string;  jeVikend(dan): boolean;  sat17(dan): number;  pomerajMin(ms): number;

// događaj (normalizovan iz bilo koje tabele)
type Dogadjaj = { id: string; vrsta: VrstaDogadjaja; at: number; upisanAt: number;
                  autor: string | null; firma?: string; podvrsta?: string; ranije?: boolean };

// XP i kape
PRAVILA_XP: Record<VrstaDogadjaja, { xp; kapa; naslov }>;
obracunajDan(dogadjaji, korisnik, dan): { stavke: Array<{ id, vrsta, xp, razlog? }>; xp; brojevi };
//   razlog: "kapa" | "bez_autora" | "tudj" | "zakasnelo" | "otkazano" | "vec_ranije"

// nivoi
xpZaPrelaz(n): number;  pragNivoa(n): number;
nivoZaXp(xp): { broj, zvanje, rang, xpOd, xpDo, uNivou, zaSledeci, procenat };

// misije
generisiMisije(ulaz: UlazMisija, dan): MisijaDef[];        // ≤ 3, deterministički
napredakMisija(def, dogadjajiDana): { napredak, zavrsena, zavrsenaAt };
naslovMisije(def): string;

// niz, prstenovi, dostignuća
produziNiz(prethodni, dan, uracunat, vikendNePrekida): { niz, nizDo, najduziNiz };
nizUOpasnosti(niz, now): boolean;                          // klijent ga zove sa svojim satom
prstenovi(brojeviNedelje, ciljevi): Prsten[];
DOSTIGNUCA: Array<{ kljuc, naziv, uslov, retkost, cilj }>; // 24 ključa

// cevovod
zakljuciDan(osnova, dan, obracun, misijeDana, naOtvaranju, podesavanja): { osnova, red };
izvedi(ulaz): Stanje;   izvediProfil(ulaz): Profil;   stanjeIskljuceno(podesavanja): Stanje;
```

Pravila koja nisu u §6:
- **Poziv** = dodir sa kanalom `poziv` ILI ishod `nije_se_javio` (traka poziva za „Nije se javio" upisuje samo ishod, bez dodira). Važi za prsten „Pozivi", misiju `pozovi` i „Na liniji".
- **Dan se računa u niz** ako je završena bar jedna misija ili ima ≥ 3 događaja sa XP > 0. Vikend sa uključenom opcijom: neaktivan je neutralan, aktivan produžava.
- **Generator**: kandidati se prave samo kad posao postoji; hitnost je hitnost istog zadatka u zvonu (`napraviZadatke`); najviše jedna misija po oblasti (`pozivi`, `tok`, `uvoz`, `baza`, `kanali`); izjednačene razdvaja heš `dan + ključ`. Prvi dan korisnika bez ijednog poziva: `pozovi` ima cilj 1.

## 5. `convex/napredak.ts`

Svaka funkcija: `requireMembership` + `membership.workspaceId !== args.workspaceId → forbidden`. Korisnik je uvek `membership.userId`, nikad argument.

```ts
stanje:  query({ args: { workspaceId }, returns: v.union(iskljuceno, ukljuceno) })
profil:  query({ args: { workspaceId }, returns: v.union(iskljuceno, profilV) })
podesi:  mutation({ args: { workspaceId, ukljucen?, vikendNePrekida?, ciljPozivi?, ciljSastanci?, ciljObjave? },
                    returns: podesavanjaV })           // ciljevi: ceo broj 1–500 / 1–50 / 1–50
potvrdi: mutation({ args: { workspaceId, kljucevi: v.array(v.string()) },   // najviše 30, nepoznat ključ se odbija
                    returns: v.object({ potvrdjeno: v.number() }) })
zamrzniDan: mutation({ args: { workspaceId }, returns: v.object({ dan, novo, misija }) })
nastaviZakljucavanje: internalMutation({ args: { workspaceId, userId }, returns: v.null() })
```

Oblik `stanje`:

```ts
{ ukljucen: false, podesavanja }
|
{ ukljucen: true,
  spremno: boolean,        // false: dan nije zamrznut ili zaključavanje kasni → XP je donja granica, ne slavi
  odseceno: boolean,       // neko čitanje je udarilo u granicu
  dan: string | null,      // beogradski datum sidra; klijent ga poredi sa svojim i zove zamrzniDan
  prviDan: boolean,
  xp: { ukupno, danas },
  nivo: { broj, zvanje, rang, xpOd, xpDo, uNivou, zaSledeci, procenat },
  niz: { dani, najduzi, danasUracunat, opasnostOd: number | null, vikendNePrekida },
  misije: Array<{ kljuc, naslov, oblast, cilj, napredak, preostalo, xp, zavrsena, veza }>,
  bonus: { xp: 100, osvojen, preostaloMisija },
  prstenovi: Array<{ kljuc: "pozivi" | "sastanci" | "objave", naziv, vrednost, cilj, procenat, pun }>,
  poslednji: Array<{ id, vrsta, naslov, xp, at }>,                     // ≤ 12, najnoviji prvi, samo xp > 0
  proslave: Array<{ kljuc, vrsta: "misija" | "bonus" | "nivo" | "dostignuce", naslov, xp, retkost, at }>,
  sledece: { kljuc, naziv, vrednost, cilj } | null,                    // najbliže zaključano dostignuće
  podesavanja: { ukljucen, vikendNePrekida, ciljPozivi, ciljSastanci, ciljObjave } }
```

Oblik `profil` (kad je uključen):

```ts
{ ukljucen: true, spremno,
  dostignuca: Array<{ kljuc, naziv, uslov, retkost, otkljucanoAt: number | null,
                      napredak: { vrednost, cilj } | null }>,
  otkljucano: number, ukupno: number,
  rekordi: Array<{ kljuc, naziv, vrednost, dan: string | null }>,   // XP u danu, pozivi u danu, najduži niz, sastanci u nedelji
  mapa: { od, do, maks, dani: Array<{ dan, xp }> },                 // 84 dana, gusto, po Beogradu
  zbir: { dodiri, pozivi, sastanci, objave, moderacije, dopune, danaSaXp } }
```

`rang` i `retkost` vraćaju iste literale koje B2 komponente već primaju (`Tier`: `bronze…diamond`, `Rarity`: `common…legendary`), pa B5 nema tabelu preslikavanja. `nivo` se direktno preslikava na postojeći `PlayerProgress`.

## 6. Zamrzavanje i zaključavanje

`zamrzniDan` (dan `T` iz serverskog sata, nikad od klijenta):
1. Red za `T` postoji → vraća `{ novo: false }`. Dva taba u isto vreme rešava OCC.
2. Čita živo stanje istim čitačima kao zvono (`citajUvoze`, `citajLeadove`, `citajKanale` dobijaju `export`; `citajLeadove` vraća i broj „Zovi sada": nikad dodirnut + procena telefona ≥ 40) i pravi misije.
3. Zaključava dane do `T−2`: jedan dan ide odmah; veći razmak ide u `nastaviZakljucavanje` kroz `ctx.scheduler.runAfter(0, …)`, najviše 31 dan po koraku. Dok kasni, `spremno: false`.
4. Upisuje red za `T` (misije + `osnova` + `naOtvaranju`) i briše potvrde starijih dana (do 50).
5. Prvi red korisnika: istorija sa autorom se računa (pošten početak sa stvarnim XP-om), a sve već zarađene proslave se odmah upisuju kao potvrđene, pa nema lavine tostova pri prvom otvaranju.

## 7. Trošak

| Šta | Kad | Dokumenata |
|---|---|---|
| `stanje`, tipičan dan | pri svakom upisu koji dira njegov opseg | 60–150 (članstvo 1, podešavanja 1, dani ≤ 8, potvrde ≤ 30, lead događaji dva dana 20–80, ostali izvori 0–30) |
| `stanje`, najgori dan (veliki uvoz + masovna moderacija) | isto | do ~600; redovi uvoza su jedini krupni dokumenti (do 101 po danu) |
| `zamrzniDan` | 1× dnevno | ~3.500 (isti sken kao zvono: 600 dodela + 600 firmi + 1.500 telefona + komentari) |
| `profil` | samo na `/napredak` | 150–250 (84 reda dana + prozor) |

Dnevno: 40–80 ponovnih izvršenja × ~100 = **4–12 hiljada dokumenata**, plus jedno zamrzavanje. Nedeljno: **30–60 hiljada + ~25 hiljada** za zamrzavanja. Ovo su procene iz granica čitanja u kodu, ne merenja.

Zašto ostaje jeftino:
1. `osnova` — istorija se nikad ne čita ponovo.
2. Svako čitanje ide kroz indeks sa opsegom vremena i `take(n)`.
3. Upit nema sat ni vremenski argument, pa se kešira između tabova i učitavanja.
4. Opseg po `publishedAt` ne hvata poslove koji se tek objavljuju, pa cron objavljivanja ne budi `stanje`.
5. Isključen Napredak čita 2 dokumenta.

## 8. Test — `scripts/napredak-check.ts`, `npm run verify:napredak`

Obrazac `notifications-check.ts` (`proveri()`, `process.exitCode = 1`, bez baze i mreže).

Devet traženih provera: kapa (drugi dodir iste firme istog dana = 0), ponoć (23:59 i 00:01 po Beogradu su dva dana), vikend ne prekida niz, nivo 10 = 2.340, misija ostaje posle završetka, tri misije daju bonus, isključen Napredak nema XP polja, „Zatvarač" na prvom `dobijen`, događaj bez autora = 0.

Dodajem:
- nivo 20 = 8.740 i nivo 30 = 19.140; granice zvanja i rangova;
- ukrštanje vremena sa `lib/belgrade-time.ts` preko promene sata;
- **zaključavanje dan po dan daje isto što i izvođenje odjednom**;
- redosled događaja ne menja XP;
- zakasneli upis (1 dan da, 2 dana ne);
- generator ne pravi misiju bez posla i najviše jednu po oblasti;
- `dobijen` drugi put za istu firmu = 0;
- fixture stvarno daje nivo 7, niz 4, 2/3.

## 9. Fajlovi

Novi: `convex/lib/napredak.ts`, `convex/napredak.ts`, `scripts/napredak-check.ts`, `app/dev-ux/fixtures-napredak.ts`, `nocni-run/izvestaji/B4.md`.

Menjam: `convex/schema.ts`, `convex/lib/purgeMap.ts`, `convex/notificationsStore.ts` (tri `export` + brojač „Zovi sada"), `convex/leadImportStore.ts`, `convex/leadGapFillStore.ts`, `convex/postsStore.ts`, `convex/rulesStore.ts`, `app/dev-ux/fixtures.ts` (registracija), `package.json` (`verify:napredak`), `convex/_generated/api.d.ts`.

`api.d.ts`: prvo `npx convex codegen`. Ovo okruženje ranije nije moglo da dosegne Convex, pa ako ćuti, ručno dodajem `napredak` i `lib/napredak` (isti presedan kao `membersStore`) i to piše u izveštaju.

Fixture: sintetički ulaz prolazi kroz pravi `izvedi` (kao `staMeCeka` kroz `napraviZadatke`), tipiziran sa `R<typeof api.napredak.stanje>`. 1.370 XP = nivo 7 (170/340), niz 4, 2 od 3 misije. `PRAZNO` varijanta: nivo 1, bez misija.

## 10. Redosled rada

1. Pročitati cele mutacije koje menjam (`applyImport`, `setRowDecision`, `setRowObrisan`, `fillGap`, `publish`, `createRule`, `setNextAction`).
2. `convex/lib/napredak.ts` + `scripts/napredak-check.ts` → `verify:napredak` zeleno.
3. Šema (tabele, polja, indeksi) + purge mapa → `verify:purge`.
4. Šest mutacija koje upisuju autora; grep upita sa strogim `returns` nad tim tabelama.
5. `notificationsStore.ts` izvozi.
6. `convex/napredak.ts`.
7. `api.d.ts`, `typecheck`.
8. Fixtures + provera fixture-a u testu.
9. Rep §12: `typecheck`, `verify:purge`, `verify:napredak`, `verify:obavestenja`, `verify:uvoz`, `lint`, izveštaj sa tabelom izvora, commit. Snimci se ne prave jer nema izmene UI-ja.

## 11. Skillovi

Sva četiri su pokrenuta (`convex`, `convex-design`, `marketing-psychology`, `onboarding`).

| Skill | Princip | Gde |
|---|---|---|
| `convex`, `convex-design` | indeks umesto `filter`, ograničena čitanja, bez sata u upitu, validatori za `args` i `returns`, identitet samo sa servera, nastavak kroz scheduler, bez neograničenih nizova | odeljci 3, 5, 6, 7 |
| `marketing-psychology` | goal gradient | `preostalo` na misiji, `zaSledeci` na nivou, `sledece` dostignuće, cilj `min(5, dostupno)` |
| | endowed progress (pošteno) | istorija sa autorom se računa od prvog dana; misija broji ceo dan, i ono pre zamrzavanja |
| | umeren strah od gubitka | samo zastavica „u opasnosti" posle 17 h; vikend neutralan; jedan dan za zakasneli upis; `najduzi` niz se ne gubi; prekid ne oduzima XP |
| | peak-end | dnevni bonus kao kraj dana |
| `onboarding` | time-to-value, jedan cilj | prvi dan: `pozovi` sa ciljem 1 → jedan poziv daje +10 XP, misiju (+60) i „Prvi kontakt" = 70/100 do nivoa 2 |
| | do, don't show | svaka misija nosi `veza` na radnju |

Ne prihvatam:
- **Convex:** `convex-expert` delegiranje i `convex dev --once` proveru (zabranjeno promptom); `@convex-dev/aggregate` i `convex-test`/vitest (bez novih zavisnosti); `staged` indekse; imenovanje `by_a_and_b` (pobeđuje ime iz plana).
- **Psihologija:** oskudicu i tajmere, tabele poretka, nasumične nagrade (XP mora biti deterministički), kupovinu „zamrzavanja niza", poruke uokvirene gubitkom.
- **Onboarding:** lažnih „20 % već urađeno" i primer-podatke (izmišljen broj), mejlove, ture i tooltipove.

## 12. Tokeni

Nema novih. Backend vraća literale koje postojeće komponente već primaju.

## 13. Rizici

1. **Prvo pravo izvršavanje je na produkciji.** Ovde nema Convex-a; dokaz su čist test i `tsc`. Ublaženje: sve je dodatak, niko ne čita `napredak.*` do B5.
2. **Pet novih indeksa** se popunjava pri deploy-u; tabele su male, pa očekujem sekunde.
3. **Strogi `returns` validatori** nad tabelama koje dobijaju polje bi pukli na novom polju. Grep nije našao takve; proveravam ponovo u koraku 4.
4. **`zamrzniDan` čita široko** (kao zvono) i može da se sudari sa sinhronizacijom komentara; Convex ponavlja sam.
5. **Tab otvoren preko ponoći** ostaje na jučerašnjem sidru dok B5 hook ne pozove `zamrzniDan`.
6. **`client_viewer`** može da zove lead mutacije i tako skuplja XP (postojeće ponašanje, ne menjam).
7. **Brisanje leadova** (purge `leads`) ne skida XP iz zaključenih dana.
8. Nađeno usput: `leadImportStore.createImport` ne poredi `args.workspaceId` sa članstvom. Samo prijavljujem u izveštaju.

## 14. Nije u B4

- Merači iz §6.8 i tabela tima.
- XP za YouTube (`ytMediaJobs` nema autora, nije u §6.2).
- XP za povezivanje kanala (`connections` nema autora — „Misija za start" sme da pokaže XP samo uz korake koji imaju pravilo).
- UI, hook i ruta (B5).

## 15. Odluke koje čekaju potvrdu

1. O1–O2: zbir zaključenih dana + prozor od dva dana, umesto čistog izvođenja iz cele istorije.
2. Beleška (kanal `beleska`) ne daje XP za dodir.
3. Sastanak: kapa 1 po firmi dnevno. Plan kaže „—", ali pomeranje termina upisuje nov „dogovoren" događaj, pa bi svako pomeranje dalo 50 XP.
4. Misija `ishodi`: cilj je fiksno 3, ne „svaki današnji poziv". Pokretan cilj bi završenu misiju vraćao u nezavršenu.
5. Uvoz: autor je `appliedBy`, za stare redove `uploadedBy`, pa već primenjeni uvozi daju XP unazad.
6. Moderacija: broje se `reply`, `hide`, `delete`; `unhide`, `like`, `unlike`, `comments_on/off` ne (prekidači). Threads odgovor čoveka = odgovor (5 XP).
7. Isključen Napredak skriva i prstenove; XP se i dalje izvodi, pa je po uključenju tu.
8. `rulesStore.createRule` danas upisuje u `args.workspaceId` bez poređenja sa članstvom. Pošto u taj red upisujem autora, dodajem proveru (2 linije) u istom editu.
9. Stari indeks `leadStageEvents.by_workspace_actor` postaje prefiks novog i niko ga ne čita; ostavljam ga.

Plan je sačuvan i u `C:\Users\admin\.claude\plans\b4-napredak-tingly-umbrella.md`.