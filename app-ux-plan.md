# Plan: cela aplikacija — UI/UX prerada i „šta me čeka"

Nadređen plan. Za samu stranicu leadova važi i `leadovi-ux-plan.md` (§1 dijagnoza,
§3 odluke O1–O8) — ovaj dokument ga ne poništava, nego ga stavlja u okvir cele
aplikacije i dodaje ono što je Jovan tražio: **obaveštenja kad ga nešto čeka**.

Sve u §1 je izmereno na `digital.enigmait.rs` 9.9.2026.

---

## §0 Pravila (važe za sve faze)

1. Ništa se ne gubi — svaka postojeća radnja ostaje dostupna; ako se skloni sa
   prvog plana, u izveštaju piše gde je sada.
2. Nijedna kontrola koja ne može da radi. Nema podatka → „—", ne prazno dugme.
3. Nepoznato ≠ nula. Broj koji ne znamo se ne izmišlja i ne prikazuje kao 0.
4. Srpski, latinica, u celom UI-ju.
5. Tokeni, ne heksadecimalne vrednosti u komponentama. Nova paleta ide u
   globalni sloj; **posle svake faze proveri bar tri druge stranice**.
6. Bez novih zavisnosti mimo onoga što je već u `package.json`.
7. Prezentacioni sloj se menja slobodno; `convex/` se dira **samo tamo gde
   faza to izričito traži** (A2 i A5), i uvek uz purge mapu i `v.optional`.
8. Rep iz `nocni-run/_zajednicki-rep.md`: typecheck → purge gate → lint →
   izveštaj → commit → push.

---

## §1 Izmereno stanje cele aplikacije

### 1.1 Ništa nigde ne kaže da me nešto čeka
Bočna navigacija ima **13 stavki u 4 grupe i nijedan broj, tačku ni bedž**.
Zaglavlje ima birač perioda, pretragu, crveni čip greške i Odjavu — **nema
mesta gde stoji šta čeka**. A čeka, i to merljivo:

| Šta čeka | Koliko (9.9.2026) | Gde se to danas vidi |
|---|---|---|
| Uvozi zaglavljeni u „U pregledu" | **3** (od 28.8, 2.9, 3.9) | tek ako otvoriš Uvoz → Istorija |
| Primenjeni uvozi sa nerazrešenim redovima | **6 uvoza**, ukupno **78** redova (41+21+9+3+3+1) | isto |
| Leadovi koje niko nikad nije dodirnuo | **178 od 178** | nigde kao zadatak |
| Firme bez telefona | **39 od 210** | Rupe u podacima |
| Firme bez procene „čiji je broj" | **155 od 210** | nigde |
| Sajtovi koji nisu ocenjeni | **94** | filter „Kvalitet sajta" |
| Greška sinhronizacije | trajno crveno | čip bez detalja |

Sedam vrsta posla, nula obaveštenja. **To je glavni nalaz ovog plana.**

### 1.2 Isti šablon na svakoj stranici, i to prazan šablon
Kontrolna tabla, Analitika, Instagram, Facebook, Threads, YouTube, Oglasi,
OpenReply — svuda: opisna rečenica → 4–5 KPI pločica sa sparklajnom → grafikon
→ sekcije. Pločice izgledaju isto i **skoro sve ispod broja pišu
„— — vs prethodnih 28 d"**:
- Kontrolna tabla: 7 pločica, **7 bez poređenja**
- Instagram: 5 pločica, **5 bez poređenja**
- OpenReply: 4 pločice, **1 sa poređenjem** (Prosečan CTR 36,8 % · +66,7 pp)

Dakle mehanizam poređenja POSTOJI, ali je u ~95 % pločica prazan. Prazno
poređenje se ipak crta punom veličinom — element koji zauzima mesto, ponavlja
se ~20 puta kroz aplikaciju i ne kaže ništa.

### 1.3 Zaglavlje laže samo sebi
Na `/settings` piše „Google Analytics 4 · **Aktivno** · Poslednja
sinhronizacija pre 2 h", a u istom zaglavlju iznad stoji crveni
**„Greška sinhronizacije"**. Dve tvrdnje na jednom ekranu koje se ne slažu.
Čip je crven na svakoj stranici, uvek isti tekst, bez toga šta tačno ne radi.

### 1.4 Stranica leadova
Detaljno u `leadovi-ux-plan.md` §1. Ukratko: šest od deset kolona ima istu
vrednost u 100 % redova; boja Fit-a radi obrnuto (27 % istaknut, 64 % siv);
20 od ~40 čipova filtera je nula; tri različita imenioca (178 / 210 / 127) bez
objašnjenja; „Zaostali koraci" pokazuje zelenu kvačicu dok 178 firmi čeka prvi
poziv.

### 1.5 Uvoz je najskuplji tok, a najslabije vođen
Tri uvoza stoje „U pregledu" nedeljama; šest primenjenih ima ukupno 78
nerazrešenih redova. Ništa od toga ne dođe do korisnika samo — mora da se seti
da pogleda. „Upozorenja parsera" su korisna, ali stoje u pregledu i nestaju
posle primene.

### 1.6 Sitno
- Instagram „Top sadržaj": tri kartice se iscrtavaju prazne.
- Rupe u podacima: tabela beži van ekrana desno na 1568 px.
- Mapa se u dva od tri otvaranja iscrta prazna.
- Nigde nema tastature (`j/k`, `/`, `Enter`), ni vidljivog `:focus-visible`.

---

## §2 Šta gradimo

### N — „Šta me čeka" (novi sistem, srce ove prerade)

**Izvor:** jedan Convex upit `staMeCeka(workspaceId)` koji **izvodi** zadatke iz
živog stanja. Ništa se ne skladišti kao „obaveštenje" — izvedeno ne može da
zastari i ne traži čišćenje. Jedina nova tabela je `notificationState`
(odbacivanje i odlaganje po korisniku i ključu zadatka) — ide u purge mapu,
polja `v.optional`.

**Proizvođači zadataka (svaki daje: ključ, naslov, broj, hitnost, veza, radnja):**

| Ključ | Naslov | Hitnost |
|---|---|---|
| `uvoz.u_pregledu` | „Uvoz čeka pregled (N)" | visoka posle 24 h |
| `uvoz.nerazreseni` | „N redova nije rešeno u M uvoza" | srednja |
| `sinhronizacija.greska` | „<Integracija> ne sinhronizuje se od <kad>" | visoka posle 24 h |
| `leadovi.zaostali` | „N zaostalih koraka" | visoka |
| `leadovi.sastanci` | „Sastanak danas u HH:MM — <firma>" | visoka |
| `leadovi.nikad_dodirnut` | „N firmi sa visokim Fit-om nikad nije zvano" | srednja |
| `leadovi.bez_telefona` | „N firmi bez broja" | niska |
| `leadovi.neocenjen_sajt` | „N sajtova nije ocenjeno" | niska |
| `kanali.bez_odgovora` | „N poruka/komentara bez odgovora" | srednja |

Pravilo: **zadatak sa brojem 0 se ne pravi.** Prazan spisak znači „nema posla",
i tako i piše — bez zelenih kvačica koje slave prazninu.

**Površine (sve čitaju isti upit):**
1. **Zvono u zaglavlju** sa brojem; panel grupisan po hitnosti; svaka stavka
   ima jednu radnju i „Odloži 1 dan" / „Sakrij".
2. **Bedževi u bočnoj navigaciji** — broj na Leadovima, Podešavanjima,
   kanalima. Bez bedža = nema posla.
3. **Blok „Danas" na vrhu Kontrolne table** — prve tri stavke po hitnosti,
   pre ijedne KPI pločice.
4. **Traka na samoj stranici** kad se zadatak tiče nje (npr. na Uvozu:
   „3 uvoza čekaju pregled").

Crveni čip greške sinhronizacije se **gasi kao poseban element** i postaje
jedna stavka u ovom sistemu, sa imenom integracije i vremenom.

### S — Sistem (tokeni + komponente)
Skala tipografije, semantički niz temperature isti u tabeli/mapi/profilu,
tri nivoa površine, mreža 8 px, trajanja i krive pokreta, `:focus-visible`,
AA kontrast. Komponente koje ostatak aplikacije nasleđuje: **KPI pločica**
(sa poštenim ponašanjem kad poređenja nema — vidi §1.2), kartica, čip, bedž,
prazno stanje, zaglavlje stranice, tabela.

### L — Leadovi
Po `leadovi-ux-plan.md`: „Danas", prerada tabele, filteri, radni redovi, mapa.

### U — Uvoz
Vođen tok: pregled → nerazrešeni → primena → šta je nastalo. Sve što se danas
gubi (78 nerazrešenih redova, tri zaglavljena uvoza) postaje vidljivo kroz N.

### P — Propagacija
Kanali i analitika dobijaju nove komponente. Mehanički posao, bez novih odluka.

---

## §3 Faze, redosled i modeli

Fable na dva mesta gde ukus stvarno odlučuje (A1 sistem, A3 glavni ekran).
Ostalo Opus, a mehaničko Sonnet.

| # | Fajl | Šta radi | Model | Effort | Mode |
|---|---|---|---|---|---|
| A1 | `nocni-run/A1.md` | Design DNA, tokeni, osnovne komponente, pokret kao specifikacija | **Fable** | max | acceptEdits |
| A2 | `nocni-run/A2.md` | „Šta me čeka": upit, tabela stanja, zvono, bedževi, blok na Kontrolnoj tabli | **Opus 5** | high | acceptEdits |
| A3 | `nocni-run/A3.md` | Leadovi: „Danas" + prerada tabele | **Fable** | high | acceptEdits |
| A4 | `nocni-run/A4.md` | Leadovi: filteri, radni redovi, mapa | **Opus 4.8** | high | acceptEdits |
| A5 | `nocni-run/A5.md` | Uvoz: vođen tok i veza sa obaveštenjima | **Opus 4.8** | high | acceptEdits |
| A6 | `nocni-run/A6.md` | Propagacija sistema na kanale, analitiku, podešavanja | **Sonnet 5** | high | acceptEdits |
| A7 | `nocni-run/A7.md` | Prazna stanja, tekst, dostupnost, tastatura | **Sonnet 5** | high | acceptEdits |
| A8 | `nocni-run/A8.md` | Pokret po specifikaciji iz A1 + završno merenje §4 | **Opus 4.8** | high | acceptEdits |

Svaka faza: **nova sesija**, `acceptEdits` (nocni run je headless — plan mode
tamo ne postoji). Redosled je obavezan za A1 → A2 → A3; A4–A8 mogu
po volji posle A3, ali A6 tek posle A1.

---

## §4 Kriterijum gotovosti (mera, ne osećaj)

1. Otvaranje aplikacije daje **konkretan spisak šta me čeka**, sa brojevima i
   po jednim dugmetom — bez ijednog klika.
2. Nijedan zadatak iz tabele u §1.1 ne postoji a da se ne vidi u zvonu.
3. U tabeli leadova nijedna kolona nema istu vrednost u > 90 % redova (osim
   naziva firme) — mereno skriptom.
4. Nijedna KPI pločica ne prikazuje prazno poređenje kao da je podatak.
5. Svaki broj na ekranu ima objašnjen imenilac („u bazi" / „u preseku" /
   „na mapi").
6. Tok „nađi firmu → vidi zašto → pozovi → zabeleži ishod" ide bez miša u
   ≤ 4 pritiska tastera.
7. AA kontrast i `:focus-visible` na svakoj kontroli, `prefers-reduced-motion`
   poštovan.
8. Na 390 px sve stranice upotrebljive, bez vodoravnog klizanja.
9. Nijedna stranica nije vizuelno pokvarena; snimci pre/posle (1440×900 i
   390×844) svih glavnih stranica u `nocni-run/ux/`.
