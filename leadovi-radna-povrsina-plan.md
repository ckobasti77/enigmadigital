# Leadovi kao radna površina — plan

Cilj nije lepša tabela. Cilj je da se **cold calling radi iz tabele**, bez
otvaranja stranice po firmi, i da se sa dva metra vidi šta je hitno.

---

## §1. Šta danas postoji (izmereno, ne pretpostavljeno)

**Tabela** `components/app/leadovi/leads-table.tsx` (804 linije) — 9 kolona,
sve statične osim temperature. Nema nijedne radnje osim linka na profil.

**Profil firme** `lead-detail.tsx` (626) + `lead-actions-panel.tsx` (858).
Šest radnji, sve iza modala: `assignLead`, `setStage`, `logTouch`,
`setNextAction`, `recordOutcome`, `addToSuppressionFromOutcome`.

**Ključno ograničenje:** `listByStage` / `listByOwner` / `listOverdue`
(`convex/leadCrmStore.ts`) vraćaju **samo `assignment` + `company`**.
Telefon i e-mail **nisu na `leadCompanies`** — žive u `leadIdentities`
(`schema.ts:3290`, `kind: phone | email | instagram | facebook | website | threads`).

**Zato „klik za poziv" danas nije moguć: tabela nema broj telefona.**
To je prva stvar koja se rešava, i to na backendu.

**Nema:** sistema za obaveštenja/toast (`components/ui/` ima samo `popover`),
pojma „sastanak" osim `stage === "sastanak"`, i ekrana za pravila ocenjivanja
(vidi OC1, poseban prompt).

---

## §2. Odluke koje se zaključavaju pre pisanja koda

**O1. Sastanak je svoje polje, ne „sledeći korak".**
`nextActionAt` je „kad se sledeći put javljam". Sastanak je dogovoren termin sa
drugom stranom. To dvoje postoji istovremeno: sastanak u četvrtak, a sledeći
korak „poslati ponudu do srede". Guranje oba u jedno polje trajno gubi jedno.

**O2. Tabela ne zove telefon i ne šalje mail sama.**
Klik otvara `tel:` i `mailto:` — posao operativnog sistema. Aplikacija **beleži
da je dodir pokušan**, ne tvrdi da je razgovor obavljen. Razlika je bitna: nema
lažne istorije.

**O3. Boja u tabeli sme da nosi samo tri značenja.**
Temperatura (već postoji), hitnost (zaostalo / danas / sastanak uskoro), i
ishod (dobijen / izgubljen). Sve preko toga je šum i tabela opet postaje
jednobojna — samo šarenije.

**O4. Prošireni red NE zove nove upite po redu.**
Podaci za proširenje stižu u istom paketu kao i tabela. Upit po otvorenom redu
znači 25 upita na jednom ekranu.

**O5. Profil firme ostaje.** Prošireni red pokriva rad; profil pokriva
istoriju, provenijenciju i retke radnje. Ne dupliraju se — prošireni red ima
dugme „Otvori profil".

---

## §3. LR1 — Backend: tabela mora da dobije čime da radi

`convex/leadCrmStore.ts`, sve tri liste (`listByOwner`, `listByStage`,
`listOverdue`) vraćaju po redu još:

- `telefoni: { value, personName? }[]` i `emailovi: { value, personName? }[]`
  — iz `leadIdentities` po `companyId`, redom kojim su upisane
- `osobe: { name, role, roleConfidence }[]` — iz `leadPeople`
- `signali: string[]` — iz `leadSignals` (tabela već broji signale, ali ne zna
  koji su)
- `poslednjiDodir: { channel, note?, occurredAt }?` — poslednji `leadStageEvents`
  reda `kind: "dodir"`

**Granica:** liste čitaju najviše 25 redova odjednom, pa je to najviše 25×4
dodatnih čitanja. Prihvatljivo. Ako se granica ikad digne iznad 50, ovo se
mora prebaciti na denormalizovana polja — zapisati kao uslov, ne otkriti
kasnije.

**Prazno vs nepoznato:** firma bez ijednog telefona vraća `telefoni: []`.
Prikaz razlikuje „nema broj u bazi" od „nije učitano". Ne crta se dugme za
poziv koje ne može da radi.

---

## §4. LR2 — Sastanci: polje, upis, i panel koji upozorava

**Šema, `leadAssignments`:**
```
meetingAt: v.optional(v.number()),        // dogovoren termin
meetingNote: v.optional(v.string()),      // gde/kako, jedna rečenica
meetingSetAt: v.optional(v.number()),     // kad je dogovoren (za istoriju)
```
plus indeks `by_workspace_meeting` na `["workspaceId", "meetingAt"]`.

**Mutacija `setMeeting({ workspaceId, companyId, meetingAt, meetingNote? })`:**
- `requireMembership` + poređenje `membership.workspaceId !== args.workspaceId`
- upisuje `meetingSetAt = Date.now()`
- upisuje `leadStageEvents` red `kind: "sastanak"` (ako taj `kind` ne postoji u
  uniji, dodati ga — istorija mora da zna da je sastanak dogovoren)
- **ne menja `stage` automatski.** Predlaže se prelazak u „Sastanak", ali odluku
  donosi čovek — automatska promena faze bi tiho prepisala rad.
- termin u prošlosti se **dozvoljava** (beleži se sastanak koji je bio), ali
  povratna vrednost nosi `uProslosti: true` i ekran to kaže

**Mutacija `clearMeeting`** — otkazan sastanak. Briše `meetingAt`, ostavlja
`meetingSetAt` i upisuje događaj. Otkazano ≠ nikad zakazano.

**Novi jezičak „Sastanci"** pored „Tabela leadova / Rupe u podacima /
Zaostali koraci":
- **Danas** · **Sutra** · **Ove nedelje** · **Prošli, nezabeležen ishod**
- poslednja grupa je ta koja upozorava: sastanak je prošao a niko nije upisao
  šta se desilo
- svaka stavka: firma, vreme, napomena, dugme „Zabeleži ishod" i „Otvori profil"

**Brojač na jezičku** kad postoji bilo šta u „danas" ili „prošli bez ishoda".

---

## §5. LR3 — Radnje direktno iz reda

Kolona `Akcije`, lepljiva desno, četiri ikone:

| Ikona | Radnja |
|---|---|
| Telefon | `tel:` na prvi broj; padajuće kad ih ima više. Posle klika nudi „Zabeleži poziv" |
| Koverta | `mailto:` na prvi e-mail; isto pravilo |
| Kalendar | „Zakaži sastanak" — datum, vreme, napomena → `setMeeting` |
| Tri tačke | faza, sledeći korak, ishod, dodela, otvori profil |

**Pravilo za „Zabeleži poziv":** posle `tel:` klika red pokazuje traku
„Pozvao si — kako je prošlo?" sa tri dugmeta: *javio se* / *nije se javio* /
*zakaži sastanak*. Traka nestaje na `Zatvori`. **Ništa se ne upisuje bez klika**
— `tel:` link ne dokazuje da je razgovor obavljen (O2).

**Kad broja nema:** ikona je prigušena, bez akcije, i tooltip kaže „Nema broj u
bazi" — ne crta se kontrola koja ne može da radi.

---

## §6. LR4 — Prošireni red

Strelica u prvoj koloni. Klik otvara red **ispod** postojećeg, u istoj tabeli.

Sadržaj (sve iz paketa iz §3, bez novih upita — O4):
- **Kontakt:** sve osobe sa ulogom, svi telefoni i mejlovi, svaki sa svojim
  `tel:` / `mailto:`
- **Signali:** čipovi (`nema_sajt`, `koristi_third_party_booking`…)
- **Poslednji dodir:** kanal, vreme, napomena
- **Sledeći korak** i **Sastanak:** vrednost + dugme za izmenu
- **Beleške:** polje koje odmah upisuje `logTouch` sa kanalom `beleska`
- Dugme **„Otvori profil"**

Više redova sme biti otvoreno istovremeno. Stanje otvorenosti se **ne pamti**
između učitavanja — lažno pamćenje je gore od nikakvog.

---

## §7. LR5 — Da se sa dva metra vidi šta je hitno

Danas je tabela jednobojna jer boja nosi samo temperaturu, a temperatura je
svuda „nova firma".

**Leva ivica reda, 3px** — jedna od, po prioritetu:
1. crveno — zaostao sledeći korak
2. narandžasto — sastanak danas ili sutra
3. boja temperature (hot/warm/cold)
4. ništa

**Red hitnosti se nikad ne meša:** zaostao lead je zaostao i kad je „cold".

**Kolona „Faza"** postaje čip u boji, ne sivi tekst. „Dobijen" zeleno,
„Izgubljen" prigušeno sivo sa precrtanim tekstom, ostalo neutralno.

**Kolona „Poslednji dodir"** pored datuma dobija relativno vreme („pre 12 dana")
i tiho crveni preko 30 dana bez dodira.

**Traka iznad tabele:** koliko zaostalih, koliko sastanaka danas, koliko bez
dodira duže od 30 dana. Svaki broj je dugme koje filtrira.

**Gustina:** prekidač „Kompaktno / Udobno". Kompaktno smanjuje visinu reda i
sakriva grad ispod naziva.

---

## §8. LR6 — Profil firme, prepravka

Zadržava se, ali prestaje da bude jedini put do radnje.

- šest radnji iz `lead-actions-panel.tsx` (858 linija, sve iza modala) svode se
  na jednu traku radnji na vrhu; modal ostaje samo tamo gde treba napomena
- gore: naziv, grad, temperatura, faza, sledeći korak, sastanak — u jednom redu
- istorija (`lead-timeline`), identiteti, provenijencija i rupe idu u jezičke,
  ne jedan ispod drugog
- na vrhu **„Šta je sledeće"**: jedna rečenica izvedena iz stanja
  („Sastanak sutra u 14h" / „Zaostalo 6 dana" / „Nema planiran korak")

---

## §9. Šta nije traženo a fali

- **`recordOutcome` nema definisan skup ishoda** — `outcome: v.string()`,
  slobodan tekst. Dva čoveka upišu „nije zainteresovan" i „ne zanima ga" i
  statistika je gotova. Treba zatvorena lista + slobodna napomena.
- **Nema kočnice na prijavu** (iz prethodnog kruga, i dalje otvoreno).
- **Nema izvoza filtriranog pogleda** — „Izvezi CSV" izvozi sve.
- **`leadStageEvents` nema `kind: "sastanak"`** ako se LR2 radi kako treba.

---

## §10. Četiri prompta

| # | Šta | Model | Effort | Mode | Čita iz plana |
|---|---|---|---|---|---|
| A1 | ekran za pravila ocenjivanja | Opus 4.8 | medium | Goal | — (samo prompt) |
| A2 | backend: kontakti u paketu + zatvorena lista ishoda | Opus 4.8 | high | Plan | §1–§3, §9 |
| A3 | sastanci: šema, mutacije, panel | Opus 4.8 | high | Plan | §2, §4 |
| B  | cela vizuelna površina: tabela i profil | Fable | max | Goal | §2, §5–§8 |

**Redosled je obavezan.** B čita `telefoni`, `emailovi`, `signali`, `osobe`,
`poslednjiDodir` (A2) i `meetingAt` (A3). Ako B krene ranije, radi nad poljima
kojih nema — a to `tsc` ne hvata, vidi se tek na ekranu.

A1 je nezavisan i može paralelno sa bilo čim.

**Zašto ne max effort na A1–A3:** zadaci su potpuno određeni — nema šta da se
odlučuje, samo da se izvede. Effort se plaća za razmišljanje, a razmišljanje je
u planu već obavljeno. Max ide samo na B, gde se stvarno bira izgled.
