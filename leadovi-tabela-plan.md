# Leadovi — dinamička tabela, temperatura i modal detalja

Datum: 01.09.2026
Repo: enigmadigital

Referenca za promptove. Sekcije se ne prenumerišu.

---

## §1. Zaključane odluke

| Pitanje | Odluka |
|---|---|
| Spajanje izabranih redova | **Briše se u celini.** Dugme, tok i UI nestaju. |
| „Preskoči" kao odluka | **Ne treba.** Zamenjuje ga brisanje reda u staging koraku. |
| Kolone tabele | **Dinamičke.** Prikazuje se ono što fajl ima, redom kojim ga ima. |
| Fiksne kolone | Temperatura i Detalji, dodate na kraj. |
| Temperatura | **Trajno polje na leadu**, ne samo na staging redu. Menja se i pri uvozu i kasnije. |
| Staging korak | Radni sto: briši redove, briši kolone, postavi temperaturu, pa Uvezi. |

---

## §2. Zašto ovo nije samo UI posao

`leadImportRows.parsed` je **fiksni objekat** sa 18 imenovanih polja. Parser
prepoznate kolone mapira na njih, a **sve ostalo baca**. `rawColumns` postoji,
ali nosi samo NAZIVE kolona iz zaglavlja — vrednosti po redu se nigde ne čuvaju.

Zato „koliko kolona ima fajl, toliko ih ima u tabeli" traži:

1. parser da zadrži sirove ćelije po redu
2. šemu koja ima gde da ih smesti
3. odluku u purge mapi za sve novo
4. i tek onda UI koji ih crta

Mapirana polja (`parsed`) **ostaju** — na njima stoji dedup, provenijencija i
skoring. Sirove kolone se dodaju **pored**, ne umesto.

---

## §3. Izmene šeme

```ts
// leadImportRows — DODATI
  // Ceo red kako je stigao iz fajla, u izvornom redosledu kolona.
  // Niz a ne v.record: red kolona je informacija koju čovek očekuje da vidi
  // istu kao u svom fajlu. Objekat ne garantuje redosled.
  sirovo: v.array(
    v.object({ kolona: v.string(), vrednost: v.string() }),
  ),

  // Temperatura postavljena u staging koraku; prenosi se na lead pri uvozu.
  temperatura: v.union(
    v.literal("nova_firma"),
    v.literal("cold"),
    v.literal("warm"),
    v.literal("hot"),
  ),

  // Meko brisanje. Red se NE briše iz baze — uvoz mora da ostane pošten
  // spisak onoga što je fajl sadržao. Obrisan red se ne prikazuje i ne uvozi.
  obrisan: v.boolean(),

// leadImports — DODATI
  // Kolone koje je čovek sklonio u staging koraku. Kolona se sklanja za CELU
  // tabelu, pa stoji na uvozu a ne na redu.
  skriveneKolone: v.array(v.string()),

// leadCompanies — DODATI
  temperatura: v.optional(
    v.union(
      v.literal("nova_firma"),
      v.literal("cold"),
      v.literal("warm"),
      v.literal("hot"),
    ),
  ),
  temperaturaPromenjenaAt: v.optional(v.number()),
```

**`decision` polje ostaje u šemi** i zadržava svoje vrednosti — na njemu visi
dedup (`matchedCompanyId`, `matchedBy`) i logika primene. Menja se samo to da
UI više ne nudi „spoji" i „preskoči"; podrazumevana vrednost je `nova_firma`.
Brisanje polja iz šeme je poseban zadatak, ne deo ovog.

---

## §4. Šta se dešava sa poklapanjima kad nema spajanja

Dedup i dalje radi — `matchedCompanyId` se i dalje računa. Bez „spoji" dugmeta,
red koji se poklapa sa postojećom firmom prikazuje se sa **tihom oznakom u redu**
(„već postoji u bazi") i linkom na tu firmu.

Čovek tada bira: obriše red, ili ga ostavi i svesno napravi drugi zapis.
**Poklapanje se prikazuje, odluka ostaje čoveku.** Nikad se ne uvozi tiho preko
postojećeg.

---

## §5. Boje temperature

Izvedene iz `--chart-*` palete, ali kao NAMENSKI tokeni u `app/globals.css`, da
se značenje ne veže za redni broj u grafikonu:

```css
  /* Temperatura leada — jedina boja u tabeli koja nosi značenje. */
  --temp-cold: #1c9dd6;   /* hladno plavo  */
  --temp-warm: #c98500;   /* žuto-narandžasto */
  --temp-hot:  #e04a3c;   /* crveno */
  --temp-cold-bg: rgba(28, 157, 214, 0.10);
  --temp-warm-bg: rgba(201, 133, 0,  0.10);
  --temp-hot-bg:  rgba(224, 74,  60,  0.10);
```

`nova_firma` **nema boju** — to je odsustvo odluke i mora da izgleda tako.

### §5.1. Kako se red boji

Ceo red dobija:
- pozadinu `--temp-*-bg` (10% — dovoljno da se vidi iz daljine, premalo da obori kontrast teksta)
- **levu ivicu 3px** u punoj boji `--temp-*` — to je ono što se čita iz daljine
- pri prelazu mišem pozadina ide na 14%

Tekst u redu **ostaje `--text-primary`**. Boja nosi temperaturu, ne čitljivost.

Provera pre nego što se smatra gotovim: tekst na obojenom redu mora zadržati
kontrast ≥ 4.5:1 prema pozadini reda.

---

## §6. Staging korak — radni sto

Ekran između otpremanja i uvoza. Tri radnje:

**Obriši red.** Ikonica na kraju reda. Postavlja `obrisan: true`. Red bledi i
sklanja se; traka na vrhu javlja „3 reda sklonjena — Vrati". Poništivo dok se ne
uveze.

**Obriši kolonu.** Ikonica u zaglavlju kolone. Dodaje naziv u
`leadImports.skriveneKolone`. Poništivo iz iste trake.

**Postavi temperaturu.** Padajući izbor u koloni Temperatura, četiri opcije.
Menja boju reda odmah.

Dugme **Uvezi** primenjuje: uvoze se samo redovi gde `obrisan === false`.

Traka stanja iznad tabele, jedan red: `120 redova · 3 sklonjena · 2 kolone
skrivene · 41 vrelo` — brojevi, bez pasusa.

---

## §7. Šta se briše bez zamene

- dugme „Spoji izabrane" i ceo tok spajanja
- kolona „Odluka" sa opcijama spoji/preskoči
- brojači odluka koji tu logiku prate

---

## §8. Modal detalja

Trenutno: jedan stubac polja. Menja se u:

**Zaglavlje** — naziv firme veliko, temperatura kao čip koji se menja klikom
direktno u zaglavlju, ivica modala u boji temperature.

**Tri jezička:**
- `Podaci` — mapirana polja, grupisana: Kontakt / Lokacija / Registracija
- `Iz fajla` — sve sirove kolone tog reda, tabela ključ-vrednost
- `Trag` — provenijencija po polju, izvori, poklapanje sa postojećom firmom

**Podnožje** — jedna radnja levo (Obriši red), primarna desno (Zatvori).

Pravila: bez pasusa objašnjenja, bez internih oznaka, najviše jedan pomoćni
tekst po polju. Prazna vrednost se prikazuje kao `—` u prigušenoj boji, nikad
kao prazan prostor koji izgleda kao greška u prikazu.

---

## §9. Stalna pravila projekta koja i ovde važe

- prazan rezultat i neuspela operacija ne smeju da izgledaju isto
- nepoznata vrednost se prikazuje kao nepoznata, nikad kao nula ili prazno
- sirova adresa, telefon i korisničko ime ne idu u log, URL ni poruku greške
- svaka nova tabela mora imati odluku u purge mapi, inače build pada

---

## §10. LT4 — Temperatura u glavnoj tabeli leadova

Uvoz je samo ulaz. Temperatura je stanje odnosa sa firmom i menja se stalno
posle uvoza, pa mora da postoji i da se menja tamo gde se leadovi svakodnevno
gledaju: `/leadovi`.

### §10.1 Šta već postoji i ne dira se

- `leadCompanies.temperatura` — `v.optional(v.union("nova_firma" | "cold" |
  "warm" | "hot"))`, `convex/schema.ts:3213`
- `leadCompanies.temperaturaPromenjenaAt` — `v.optional(v.number())`,
  `convex/schema.ts:3221`
- Upis pri primeni uvoza — `convex/leadImportStore.ts:663` (nova firma) i
  `:984` (spajanje sa postojećom)
- Boje — `app/globals.css:70-75` (`--temp-cold`, `--temp-warm`, `--temp-hot`
  i tri `-bg` varijante)
- `listByOwner` / `listByStage` / `listOverdue` u `convex/leadCrmStore.ts`
  vraćaju **ceo dokument firme** kroz `company`, pa `company.temperatura` već
  stiže do tabele. **Nijedan upit se ne menja.**

### §10.2 Šta nedostaje

1. Mutacija koja menja temperaturu na `leadCompanies` (postoji samo ona za
   staging red, `setRowTemperatura`).
2. Kolona `Temperatura` u `components/app/leadovi/leads-table.tsx`.
3. Bojenje celog reda po temperaturi, isto kao u pregledu uvoza.

### §10.3 Mutacija `setCompanyTemperatura`

Ide u `convex/leadCrmStore.ts`, na kraj fajla.

- args: `workspaceId`, `companyId: v.id("leadCompanies")`, `temperatura`
  (ista četvoročlana unija)
- provera pristupa **mora** biti oblika:
  ```
  const membership = await requireMembership(ctx);
  if (membership.workspaceId !== args.workspaceId) throw forbidden;
  ```
  `requireMembership` vraća radni prostor samog pozivaoca i ne gleda nijedan
  argument; poređenje `args.workspaceId !== args.workspaceId` je prazna
  provera.
- zatim `ctx.db.get(companyId)`, i ako je `null` ili `workspaceId` ne
  odgovara — `not_found`.
- upis: `temperatura` **i** `temperaturaPromenjenaAt: Date.now()` **i**
  `updatedAt: Date.now()`.
- povratak na `nova_firma` je dozvoljen i tada se `temperaturaPromenjenaAt`
  isto upisuje — to je stvarni trenutak ljudske odluke, ne prazno stanje.

### §10.4 Kolona u tabeli

`components/app/leadovi/leads-table.tsx`:
- zaglavlje: novi `<TableHead className="w-32">Temperatura</TableHead>`
  **odmah posle** „Faza" (`:431`), pre „Vlasnik" (`:434`)
- ćelija: `<select>` sa četiri opcije, ista kao u pregledu uvoza, poziva
  `setCompanyTemperatura`
- `colSpan={8}` u praznom stanju (`:518`) postaje `9`
- red skeletona (`:501-510`) dobija jednu `<TableCell>` više — inače
  skeleton ima 8 ćelija a zaglavlje 9 i kolone se razilaze dok se učitava
- kad `companyId` ne postoji (firma obrisana), umesto `<select>` ide
  prigušeno `—` bez kontrole. Ne crta se kontrola koja ne može da radi.

### §10.5 Bojenje reda

Na `<TableRow>` (`:539`) ide pozadina po temperaturi, isto kao u uvozu:
`--temp-hot-bg` / `--temp-warm-bg` / `--temp-cold-bg`, plus leva ivica
3px u punoj boji. `nova_firma` ne dobija ništa — neutralan red je podrazumevano
stanje i ne sme da izgleda kao odluka.

`hover:bg-surface-raised/60` mora da ostane vidljiv i preko obojenog reda.

### §10.6 Šta se NE radi u LT4

- nema filtera po temperaturi (posebno, kasnije)
- nema sortiranja po temperaturi
- ne dira se `lead-detail.tsx`
- ne dira se nijedan upit u `leadCrmStore.ts`

---

## §11. LT7 — Uvezena firma mora da stigne u tabelu leadova

### §11.1 Nalaz

Uvoz `Belgrade_Salon_Leads_100_companywall.xlsx` je primenjen: 100 redova,
4 preskočena, ~96 firmi upisano u `leadCompanies`. Stranica `/leadovi`
prikazuje **„Nema leadova u fazi Nov"**.

Uzrok: `/leadovi` čita `leadAssignments` (`listByOwner`, `listByStage`,
`listOverdue` u `convex/leadCrmStore.ts`). `applyImport`
(`convex/leadImportStore.ts:578`) upisuje `leadCompanies`, `leadPeople`,
`leadFieldProvenance` i signale, ali **nijedan `leadAssignments` red** —
`grep "leadAssignments" convex/leadImportStore.ts` ne vraća ništa.

Jedini put u `leadAssignments` je `assignLead`, a on se u celom projektu zove
sa tačno jednog mesta: `components/app/leadovi/lead-actions-panel.tsx:273`,
koji živi u `lead-detail.tsx`, koji se otvara sa `/leadovi/<companyId>`.
Nigde u aplikaciji ne postoji spisak firmi bez dodele, pa se taj `companyId`
ne može ni pronaći.

**Posledica: 96 uvezenih firmi je u bazi i nedostupno iz aplikacije.**
Temperatura iz LT4 radi ispravno, ali nema nad čim da se prikaže.

### §11.2 Drugi nalaz — primenjen uvoz govori u budućem vremenu

Na primenjenom uvozu (`status: "primenjen"`), jezičak `Trag` i dalje piše:
- „Nema poklapanja u bazi — Ovaj red se tretira kao nova firma u sistemu."
- „Odluka sistema za ovaj red: Nova firma — **Kreira se** novi unos firme…"

Firma je već kreirana i `leadImportRows.createdCompanyId` je popunjen
(`leadImportStore.ts:667`), ali se to polje nigde ne čita. Nema linka ka
napravljenoj firmi ni u tabeli ni u modalu.

Ovo krši stalno pravilo: **završena radnja ne sme da izgleda kao najavljena.**

### §11.3 Odluka

Primena uvoza dodeljuje lead. Uvoz izlazne liste nema drugu svrhu — firma
koja se ne pojavi u toku nije uvezena, samo zapisana.

- vlasnik = `importDoc.uploadedBy ?? membership.userId` (isti izvor koji se
  već koristi za `createdBy` na `leadCompanies`, `leadImportStore.ts:665`)
- faza = `"nov"`
- radi se za **obe grane**: novu firmu i spajanje sa postojećom
- ako `leadAssignments` red za tu firmu **već postoji**, ne dira se —
  postojeća faza i vlasnik su rezultat rada i uvoz ih ne sme pregaziti

### §11.4 Bezbednosna rupa u `applyImport`

`convex/leadImportStore.ts:583`:
```
const membership = await requireMembership(ctx);
const importDoc = await ctx.db.get(args.importId);
if (!importDoc || importDoc.workspaceId !== args.workspaceId) { ... }
```
`membership.workspaceId` se nikad ne poredi. `requireMembership` vraća radni
prostor **pozivaoca** i ne gleda nijedan argument, pa napadač pošalje tuđi
`workspaceId` i tuđi `importId` koji se međusobno poklapaju — provera prolazi
i uvoz se primeni u tuđem radnom prostoru. Ovo je **upisna** rupa, ne samo
čitanje; ispravlja se odmah, u istom promptu.

### §11.5 Šta se menja

**`convex/leadImportStore.ts`**
1. `applyImport` (:583) — dodati odmah posle `requireMembership`:
   ```
   if (membership.workspaceId !== args.workspaceId) throw forbidden;
   ```
2. Nova pomoćna funkcija u istom fajlu (ne izvozi se):
   `ensureAssignment(ctx, { workspaceId, companyId, ownerUserId, now })`
   - traži postojeći red preko indeksa `by_workspace_company`
   - ako postoji → vraća ga i **ništa ne menja**
   - ako ne postoji → `insert` u `leadAssignments` sa `stage: "nov"`,
     `createdAt`, `updatedAt`, plus `leadStageEvents` red
     `{ kind: "dodela", fromValue: undefined, toValue: String(ownerUserId),
       actorUserId: membership.userId, note: "Dodeljen pri uvozu tabele",
       occurredAt: now }`
3. Zvati je u obe grane: posle `insert("leadCompanies")` (:663) i posle
   `patch(targetCompanyId, patch)` (:990)
4. Povratna vrednost `applyImport` (:1125) dobija `assignedCount: number`

**`components/app/leadovi/import-review-table.tsx`**
5. Kad je `importDoc.status === "primenjen"` i red ima `createdCompanyId`,
   u koloni `Akcije` ide link „Otvori u leadovima" ka `/leadovi/<id>`

**`components/app/leadovi/import-row-dialog.tsx`**
6. Kad je uvoz primenjen:
   - „Kreira se novi unos firme…" → „Napravljen je novi unos firme."
   - „Ovaj red se tretira kao nova firma u sistemu." → „Napravljena je nova
     firma u bazi." + dugme „Otvori profil firme" ka `/leadovi/<createdCompanyId>`
   - ako je uvoz primenjen a `createdCompanyId` nedostaje, piše se izričito
     „Firma za ovaj red nije zabeležena." — **ne** prazno i **ne** kao da red
     nije obrađen

### §11.6 Šta se NE radi

- ne dira se `leadCrmStore.ts`
- ne dira se `assignLead` (ostaje kakav jeste)
- ne pravi se ekran „sve firme bez dodele" (posebno, kasnije)
- postojeći primenjeni uvoz se **ne popravlja retroaktivno** ovim promptom;
  za 96 već uvezenih firmi ide zaseban jednokratni zadatak

---

## §12. LT9 — `revertImport` mora da počisti i dodele

### §12.1 Regresija koju je uveo LT7

`ensureAssignment` sada pri primeni uvoza upisuje po jedan red u
`leadAssignments` i jedan u `leadStageEvents`. `revertImport`
(`convex/leadImportStore.ts:1222`) briše pet stvari za svaku firmu koju je
uvoz napravio — signale, identitete, fizička lica, provenijenciju i samu
firmu (`:1265-1310`) — ali **ne briše dodelu ni događaj dodele**.

Posle „Poništi" ostaje red u `leadAssignments` koji pokazuje na obrisanu
firmu. `listByStage` radi `ctx.db.get(assignment.companyId)`, dobija `null`,
i tabela iscrta **„Nepoznata firma"**.

To je tačno ono što se ne sme: **obrisano izgleda isto kao nepoznato.**
Firma nije nepoznata — namerno je uklonjena, i njen red ne sme da ostane.

### §12.2 Šta se menja

`convex/leadImportStore.ts`, `revertImport`, unutar grane koja stvarno briše
firmu (posle koraka 4 „Istorijat tvrdnji", pre koraka 5 „Sama firma"):

**Korak 4b — dodela:**
```
const assignments = await ctx.db
  .query("leadAssignments")
  .withIndex("by_workspace_company", (q) =>
    q.eq("workspaceId", args.workspaceId).eq("companyId", company._id))
  .collect();
for (const a of assignments) await ctx.db.delete(a._id);
```

**Korak 4c — događaji faze:**
`leadStageEvents` za tu firmu se brišu **samo ako ih je napravio ovaj uvoz**.
Ako je posle uvoza neko menjao fazu, beležio dodir ili upisao ishod, ta
istorija je ljudski rad i ne sme da nestane. Kriterijum: brišu se redovi sa
`kind === "dodela"` i `note === "Dodeljen pri uvozu tabele"`. Ostali ostaju.

**Brojači:** povratna vrednost `revertImport` dobija
`revertedAssignmentsCount: number`.

### §12.3 Grana koja se preskače

Firma koju `revertImport` **preskoči** (`skippedModifiedCount`, jer je
menjana posle uvoza) zadržava i svoju dodelu. Firma ostaje — dodela ostaje.

### §12.4 Otvoreno pitanje za korisnika, ne za model

87 firmi iz prvog (primenjenog) uvoza i dalje nema dodelu; LT7 važi tek za
sledeću primenu. Drugi uvoz je u statusu „U pregledu" i njegovih 87 redova
se poklapa sa tim istim firmama, pa bi njegova primena kroz granu spajanja
dodelila tih 87. Preostalih 21 je „nerazrešeno" i preskače se pri primeni.
Odluku donosi korisnik — ne radi se automatski.

---

## §13. LT6 — Zatvaranje `requireMembership` rupe (tačan spisak)

### §13.1 Šta je rupa

`requireMembership(ctx)` čita članstvo **pozivaoca** (`members` po `by_user`)
i **ne gleda nijedan argument**. Funkcija koja u `args` prima
`workspaceId: v.id("workspaces")`, pozove `await requireMembership(ctx);`
bez dodele, i zatim poredi `dokument.workspaceId !== args.workspaceId`, radi
praznu proveru: napadač pošalje **tuđi** `workspaceId` i **tuđi** `id`
dokumenta koji se međusobno poklapaju, i prolazi.

Ispravan oblik, svuda isti:
```ts
const membership = await requireMembership(ctx);
if (membership.workspaceId !== args.workspaceId) {
  throw new ConvexError({
    code: "forbidden",
    message: "Nemate pristup ovom radnom prostoru.",
  });
}
```

### §13.2 Tačan spisak — 22 mesta

Dobijen skriptom nad `convex/*.ts`: funkcija prima `workspaceId` u `args`,
poziva `await requireMembership(ctx);` bez dodele, i nigde ne poredi
`membership.workspaceId !== args.workspaceId`. Van `convex/lead*` nema
nijednog pogotka.

**A. Upisne (7) — prioritet, menjaju tuđe podatke:**
- `leadImportStore.ts` — `setRowDecision`, `revertImport`
- `leadScoringStore.ts` — `upsertIcpRule`, `setIcpRuleActive`,
  `deleteIcpRule`, `seedDefaultIcpRules`
- `leadSuppressionStore.ts` — `removeSuppression`

`revertImport` je posebno teško: briše firme, lica, signale, identitete,
provenijenciju i dodele.

**B. Čitajuće (15) — otkrivaju tuđe podatke:**
- `leadCrmStore.ts` — 4
- `leadImportStore.ts` — 3
- `leadScoringStore.ts` — 3
- `leadGapsStore.ts` — 2
- `leadInboundStore.ts` — 2
- `leadSuppressionStore.ts` — 1

### §13.3 Pravila izvođenja

- menja se **samo** provera pristupa; nijedna druga linija, nijedan naziv,
  nijedna povratna vrednost, nijedan tekst na ekranu
- postojeće provere (`dokument.workspaceId !== args.workspaceId`) **ostaju** —
  nova provera se dodaje **iznad** njih, ne umesto
- ako funkcija već ima `const membership = ...` iz drugog razloga, koristi se
  ta promenljiva, ne pravi se druga
- funkcije koje **ne primaju** `workspaceId` u `args` se ne diraju — one
  radni prostor izvode iz samog članstva i nemaju rupu
