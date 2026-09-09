# Plan: /leadovi — UI/UX prerada (5/10 → 10/10)

Izvor istine za promptove UX1–UX3. Sve u §1 je **izmereno na produkciji**
`digital.enigmait.rs` 9.9.2026, ne pretpostavljeno.

---

## §0 Pravila koja se ne krše

1. **Ništa se ne gubi.** Svaka radnja koja danas postoji mora ostati dostupna
   posle prerade. Ako se nešto skloni sa prvog plana, u planu piše gde je sada.
2. **Nijedna kontrola koja ne može da radi.** Ako podatak ne postoji, stoji
   „—" ili se kontrola ne crta — nikad prazno dugme koje ništa ne radi.
3. **Nepoznato ≠ nula.** „Neocenjen" nije „loš"; „bez koordinata" nije „nema
   adresu". Broj koji ne znamo se ne izmišlja.
4. **Srpski, latinica**, u celom UI-ju, uključujući nove nazive.
5. **Tokeni, ne heksadecimalne vrednosti u komponentama.** Nova paleta i skala
   idu u globalni sloj tokena; ostale stranice (Analitika, Instagram, Oglasi,
   OpenReply, Podešavanja) moraju da izgledaju **isto ili bolje**, nikad
   pokvareno. Posle svake faze proveri bar tri druge stranice.
6. **Bez novih zavisnosti** osim onih koje su već u `package.json`
   (`framer-motion` ako postoji — proveri; ako ne, animacija ide CSS-om).
7. Rep runa iz `nocni-run/_zajednicki-rep.md` važi: typecheck → purge gate →
   lint → izveštaj → commit → push.

---

## §1 Šta je izmereno (dijagnoza, sa brojevima)

### 1.1 Stranica ne zna šta me čeka
- 178 leadova, **svih 178 u fazi „Nov"**; U radu 0, Poslata ponuda 0, Sastanak
  0, Dobijen 0, Izgubljen 0, Odložen 0.
- **„Nikad dodirnut: 178"**, „bez dodira 7+ dana: 0", „30+ dana: 0".
- „Zaostali koraci (0)" — prazno stanje sa zelenom kvačicom, iako realno
  postoji 178 firmi koje niko nikad nije zvao.
- Stranica se otvara na tabelu od 178 redova bez ijednog predloga šta prvo.
  Logika hitnosti **postoji u kodu** (`lead-urgency.ts`), ali je ulazna
  površina ne koristi.

**Posledica:** korisnik otvori stranicu i ne zna gde da počne. To je glavni
razlog ocene 5/10, ne boje.

### 1.2 Tabela je monotona jer šest kolona nosi istu vrednost u svakom redu
Kolone danas: `Firma i grad · Fit · Intent · Faza · Temperatura · Vlasnik ·
Poslednji dodir · Sledeći korak / sastanak · Signali · Akcije`.

Izmereno na svih 178 redova:
- **Intent**: „bez signala" u **100 %** redova.
- **Faza**: „Nov" u 100 %.
- **Vlasnik**: „Ti" u 100 % (jedan čovek u radnom prostoru).
- **Poslednji dodir**: „Bez dodira · dodeljen pre 7 dana" u 100 %.
- **Sledeći korak**: „Nema koraka" u 100 %.
- **Temperatura**: „Nova firma" u 100 %, i to kao **`<select>` u svakom redu**
  — 178 formi na ekranu koji je pregled, ne unos.

Šest od deset kolona troši ~55 % širine i ne razlikuje nijedan red od drugog.
Ono što JESTE različito — signali, kvalitet sajta, procena telefona, niša —
ili je svedeno na broj („3 signala") ili ga u tabeli uopšte nema.

### 1.3 Boja ne znači ništa
- `FIT 27 %` je **istaknut žutom**, `FIT 64 %` je siv. Boja trenutno označava
  „nizak", a čita se kao „važan" — tačno obrnuto od namere.
- Dva akcenta u celoj stranici (plava + žuta). Temperatura ima četiri
  vrednosti sa značenjem (Hot/Warm/Cold/Nova) i **na mapi ima boje**, a u
  tabeli je bezbojni padajući meni. Isti pojam, dva jezika.
- Signali (nema sajt / koristi tuđi booking / visok broj recenzija) su
  prodajna priča i svi izgledaju isto — sivi okvir.

### 1.4 Filteri: zid od ~40 čipova, svi istog ranga
Otvaranjem „Filteri" pada 11 grupa odjednom. Izmereno stanje:
- Temperatura: Nova firma 178 · Cold 0 · Warm 0 · Hot 0
- Sajt: ima 94 · nema 3 · nepoznato 0 · ne radi 1 · parkiran 0 · vodi na mrežu
  0 · bez HTTPS-a 4 · neprovereno 81
- Kvalitet sajta: loš 0 · srednji 0 · dobar 0 · **neocenjen 94** · spor 0
- CMS: „Nijedan sajt u preseku nije ocenjen."
- Preporučena ponuda: svih 7 vrednosti = 0
- Niša: Frizerski 113 · Kozmetički 44 · bez niše 21
- Grad: Beograd 127 · N. Beograd 1 · **bez grada 50**
- Platforme: Instagram 83 · Facebook 47 · TikTok 13 · Threads 0 · sajt kao
  kanal 96
- Telefon: ≥ 70 % 10 · ≥ 40 % 40 · ima procenu 55
- Koordinate: ima 127 · bez 51
- Poslednji dodir: 7+ dana 0 · 30+ dana 0 · nikad dodirnut 178

Dakle **20 od ~40 čipova je nula**, a zauzimaju isto mesta kao oni koji nose
ceo skup. Preseti postoje kao ideja („nijedan još nije sačuvan") ali nijedan
nije ponuđen, pa ih niko ne koristi.

### 1.5 Tri različita imenioca na istoj stranici, bez objašnjenja
- Tabela: **178** leadova
- Rupe u podacima: **od 210** firmi
- Mapa: **127** firmi na mapi, „bez koordinata: 51"

Korisnik ne može da zna koji je broj „istina". (178 = trenutni presek filtera;
210 = sve firme u bazi; 127 = one sa koordinatama. To nigde ne piše.)

### 1.6 Traka tabova meša tri različite vrste stvari
`Tabela leadova · Mapa · Niše · Rupe u podacima · Zaostali koraci · Sastanci ·
Ocenjivanje` — svih sedam istog ranga, a to su:
- **prikazi istih leadova**: Tabela, Mapa
- **radni redovi (posao koji čeka)**: Rupe u podacima, Zaostali koraci, Sastanci
- **podešavanje**: Ocenjivanje (težine Fit/Intent pravila), Niše (šifarnik)

Podešavanje ne pripada istoj traci kao podaci.

### 1.7 Sitno ali stalno
- Vrh stranice troši ~130 px na mrvicu + rečenicu opisa koju niko ne čita, pre
  nego što se vidi ijedan podatak.
- Crveni čip **„Greška sinhronizacije"** stoji trajno u zaglavlju danima →
  alarm postaje tapeta.
- „Rupe u podacima": tabela **beži van ekrana** desno (kolone „Evidentirano"…
  odsečene) na 1568 px širine.
- Mapa se u dva od tri otvaranja iscrta **prazna** (siva površina, legenda i
  kontrole vidljive) — vidi GL6 popravku worker-a; proveriti da li je regresija.
- Prekidač Kompaktno/Udobno postoji, ali „Kompaktno" i dalje ima ćelije u dva
  reda, pa razlika jedva postoji.
- Nema tastature: nema `j/k` kretanja, `/` za pretragu, `Enter` za otvaranje.

---

## §2 Cilj: tri stvari, ovim redom

1. **Da znam šta me čeka** — stranica se otvara na predlog posla, ne na sirovu
   tabelu.
2. **Da se snađem** — jedan pogled kaže gde sam, koliko ih ima i šta je
   različito između redova.
3. **Da bude lepo** — sistem tipografije, boje i pokreta koji izgleda kao
   proizvod, ne kao admin panel.

Redosled je namerno takav: lep raspored monotonih podataka je i dalje monoton.

---

## §3 Odluke

### O1 — Nov podrazumevani prikaz: „Danas"
Nov prvi tab, i **podrazumevani** (`?tab=danas`, stara adresa bez parametra
vodi ovde). Tri trake, svaka najviše 5 kartica + „Vidi sve (N)":

| Traka | Kriterijum | Glavna radnja na kartici |
|---|---|---|
| **Zovi sada** | ima telefon, procena ≥ 40 %, nikad dodirnut, Fit ≥ prosek preseka | „Pozovi" (`tel:`) + „Zabeleži ishod" |
| **Vrati se na** | zakazan sastanak ili sledeći korak u naredna 3 dana, plus svi zaostali | „Otvori" / „Zabeleži dodir" |
| **Dopuni pa zovi** | nema telefon ILI nema procenu, a Fit je visok | „Dopuni" (postojeći `lead-gap-fill-dialog`) |

Iznad traka jedan red brojeva sa objašnjenim imeniocem:
`210 firmi u bazi · 178 u preseku · 55 sa procenom telefona · 94 sa sajtom ·
0 dodirnutih`. Svaki broj je dugme koje postavi odgovarajući filter.

Ako je traka prazna — **poštena poruka sa sledećim korakom**, ne kvačica:
„Nijedna firma nema procenu telefona ≥ 40 %. Dopuni ih: `obogati --polja
osobe`." Prazno stanje koje slavi prazninu (današnje „Nema zaostalih koraka!")
je laž kad 178 firmi čeka prvi poziv.

### O2 — Tabela: manje kolona, više razlike
Nove kolone:

`Firma` (naziv + grad + niša, tri veličine teksta) ·
`Fit / Intent` (dva tanka merača jedan ispod drugog, brojevi tabularni) ·
`Zašto` (do 3 stvarna signala kao čipovi, ostatak „+N") ·
`Sajt` (bedž statusa + pojas kvaliteta kad postoji ocena) ·
`Telefon` (procena kao mali prsten sa % ili „nije moguće proceniti") ·
`Stanje` (faza + temperatura, kao **čip koji otvara meni na klik**, ne
`<select>` u svakom redu) ·
`Sledeći korak` ·
`Akcije` (jedno **primarno** dugme koje se menja po stanju: Pozovi →
Zabeleži ishod → Zakaži; ostalo pod „…").

- Levi rub reda je **traka hitnosti** (4 px) iz `lead-urgency.ts`.
- Kolone `Intent`, `Faza`, `Vlasnik`, `Poslednji dodir` kao zasebne kolone
  **nestaju** (sadržaj im je u `Fit/Intent`, `Stanje`, i u proširenom redu).
  `Vlasnik` se prikazuje samo ako radni prostor ima **više od jednog člana** —
  inače je kolona koja svima piše isto.
- „Kompaktno" znači stvarno jedan red po leadu (32 px), „Udobno" dva.
- Tastatura: `j/k` kretanje, `Enter` otvara profil, `Space` proširuje red, `/`
  fokusira pretragu, `Esc` zatvara. Fokus vidljiv (`:focus-visible`).

### O3 — Filteri: prvo četiri, ostalo u fioci
- **Uvek vidljiva traka** sa četiri filtera koja stvarno razdvajaju skup:
  Sajt · Kvalitet sajta · Telefon · Niša. Ostalo iza „Više filtera" (bočna
  fioka, ne padajući zid).
- **Vrednost sa 0 se ne crta** kao čip pune veličine — ide u „prikaži i
  prazne (N)". Danas je 20 od 40 čipova nula.
- Grupa čiji su SVI članovi 0 je skupljena i ima objašnjenje zašto
  (`CMS: nijedan sajt u preseku nije ocenjen` je dobar tekst — zadrži ga).
- **Tri ponuđena preseta** od prvog otvaranja (ne prazna lista):
  „Nema sajt, telefon poznat", „Sajt loš ili spor", „Nikad dodirnut, Fit ≥ 50".
- Aktivni filteri ostaju kao uklonjivi čipovi iznad tabele (to danas radi —
  zadrži), plus „očisti sve".

### O4 — Traka tabova: tri vrste, vizuelno razdvojene
`Danas | Leadovi (Tabela · Mapa) | Posao (Rupe 3 · Zaostali 0 · Sastanci 0)`
a `Niše` i `Ocenjivanje` idu u **Podešavanja leadova** (zupčanik desno gore,
ili `/leadovi/podesavanja`). Tabovi u grupi „Posao" nose **broj** — to je
odgovor na „slabo sam obavešten".

### O5 — Vizuelni sistem
- **Tipografija:** skala 12 / 13 / 15 / 20 / 28 sa jasnim namenama; brojevi
  uvek `font-variant-numeric: tabular-nums`; naziv firme je najteži element u
  redu.
- **Boja:** jedan akcenat (postojeća plava) + **semantički niz temperature**
  (Nova → Cold → Warm → Hot) koji je **isti u tabeli, na mapi i u profilu**.
  Fit/Intent koriste neutralno-ka-akcentu skalu gde **više = jače**, nikad
  obrnuto (današnji žuti 27 % je greška).
- **Površine:** tri nivoa dubine (pozadina / kartica / iskačuće), razdvojena
  suptilnom granicom + jednom senkom, bez šarenih okvira.
- **Ritam:** mreža od 8 px; vrh stranice se skraćuje za ~60 px (mrvica i
  opisna rečenica se spajaju u jedan red sa naslovom).
- Kontrast **AA (4.5:1)** za tekst, 3:1 za granice kontrola — proveri
  merenjem, ne na oko. Tamna tema je primarna; svetla mora da ostane ispravna.

### O6 — Pokret
- 150–200 ms, `cubic-bezier(.2,.8,.2,1)`; proširenje reda i fioka filtera
  dobijaju opipljiv, prekidiv prelaz.
- Brojevi koji se menjaju (brojači preseka) prelaze, ne skaču.
- Svaka radnja ima potvrdu u ≤ 100 ms (optimističko stanje dugmeta).
- `prefers-reduced-motion: reduce` isključuje sve osim promene neprozirnosti.

### O7 — Poštenje u zaglavlju
- Crveni čip „Greška sinhronizacije" postaje **žut posle 24 h** i dobija tekst
  šta tačno ne radi + „Otvori Podešavanja". Trajno crveno nije informacija.
- Tri imenioca iz §1.5 dobijaju jedno objašnjenje na jednom mestu (O1, red
  brojeva) i **konzistentne nazive** svuda: „u bazi" / „u preseku" / „na mapi".

### O8 — Šta se NE dira u ovoj preradi
Uvoz i pregled uvoza, `import-review-table`, `import-row-dialog`, cela
`convex/` strana, skill. Ovo je isključivo prezentacioni sloj + rutiranje
tabova. Ako neki podatak fali za novi prikaz, **ne izmišlja se** — traka ili
kolona prikazuje „—" i to se zapisuje u izveštaj kao predlog za sledeći run.

---

## §4 Kriterijum „10/10" (mera, ne osećaj)

Posle sve tri faze mora da važi:

1. Otvaranje `/leadovi` daje **konkretan predlog šta raditi sada**, sa imenom
   firme i jednim dugmetom — bez ijednog klika.
2. U tabeli **nijedna kolona nema istu vrednost u više od 90 % redova**
   (osim naziva firme). Proveri skriptom nad stvarnim presekom.
3. Svaki broj na ekranu ima objašnjen imenilac.
4. Ceo tok „nađi firmu → vidi zašto je dobra → pozovi → zabeleži ishod" ide
   **bez miša** i staje u ≤ 4 pritiska tastera.
5. Kontrast AA prolazi na svim tekstualnim elementima; `:focus-visible` vidljiv
   na svakoj kontroli.
6. Na 390 px širine stranica je upotrebljiva (tabela prelazi u kartice), bez
   vodoravnog klizanja.
7. Nijedna druga stranica aplikacije nije vizuelno pokvarena.
8. Snimci pre/posle (1440×900 i 390×844) stoje u `nocni-run/ux/` kao dokaz.
