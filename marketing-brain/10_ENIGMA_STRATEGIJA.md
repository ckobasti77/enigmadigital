# 10 — ENIGMA: strateške odluke

> Ovo je primena fajlova 01–08 na stvarnu Enigmu iz `09_ENIGMA_PROFIL.md`.
> Sve što je ovde označeno **[ODLUKA]** čeka Jovanovu potvrdu pre nego što uđe u izvršenje.
> Sve što je označeno **[NALAZ]** je već tačno i ne treba potvrdu.

---

## 1. Najveći problem: dva lica

**[NALAZ]** Sajt govori jezikom senior product partnera za SaaS/scale-up timove
("EMEA & North America", SLO, observability, dizajn sistemi). Portfolio i lead mašina su
lokalne srpske uslužne firme — saloni, turizam, građevina, video nadzor, moda.

Hormozijev test pozicioniranja:
> **"How narrowly can I define the problem that I solve, so that in that tiny world, in that pond, I am king?"**

Enigma trenutno nije kralj ni u jednom ribnjaku, jer priča o jednom a dokazuje drugi.

**Zašto se ovo mora rešiti pre bilo kakvog contenta:** *"The content is the targeting."*
Ako ne znamo za koga pravimo, algoritam ne zna kome da servira. `03 §1`

**Dokaz je jedini arbitar.** *"Competitors can copy your offer, but they cannot copy your proof."*
Enigma ima dokaz samo na jednoj strani — šest živih sajtova lokalnih srpskih firmi.
Za SaaS/scale-up priču dokaza nema nijednog.

---

## 2. [ODLUKA] Pozicioniranje — predlog

**Ribnjak:** lokalne i regionalne **uslužne firme u Srbiji koje već plaćaju za nešto digitalno**
(booking softver, oglasi, neko im "vodi mreže"), **ali ne vide odakle im dolaze klijenti.**

Zašto baš taj presek:
- To je **fit signal koji je Enigma sama identifikovala** u `lead-masina-istrazivanje.md`: firma
  koja koristi Setmore/Dikidi *već je odlučila da joj treba digitalno i već plaća tuđe rešenje.*
  Hormozi bi to nazvao **most aware** krajem spektra — najkraća pista, najbrža prodaja. `03 §18`
- Tu Enigma ima **najbliži dokaz koji uopšte ima**: 6 živih sajtova za male srpske firme.
  **Poštena ograda:** samo jedan od šest (Studio Lady Gaga) je uslužna firma iz užeg ribnjaka;
  ostali su turizam, video nadzor, moda, građevina i marketing agencija. Dokaz je *susedni*,
  ne identičan — i tako se i predstavlja.
- Tu Enigma ima **nešto što niko u regionu nema** — vidi §3.

**Ono što se prodaje nije sajt.** Sajt je isporuka, ne ponuda.
Formulacija problema koji rešavamo, u jednoj rečenici:

> **"Plaćate marketing, a ne znate koji je post doveo kog klijenta. Mi vam to pokažemo — i onda popravimo."**

Hormozijev test brenda: **"jedna do dve reči"** koje ti ljudi već pridružuju.
Za Enigmu predlog: **merljivo** i **spojeno**. Ne "lepo", ne "brzo", ne "moderno". `06 §6`

**Šta ovo NE znači:** ne brišemo SaaS/product copy zauvek. Hormozijeva lestvica tema ide
**usko → široko, nikad obrnuto** (`03 §3`): kako se popravlja WC → kako se širi vodoinstalaterski
biznis → kako se širi lokalni biznis. Enigma kreće od "lokalna uslužna firma u Srbiji"; širenje
ka product timovima je faza 3, posle dokaza.

---

## 3. [NALAZ] Najveći neiskorišćeni adut

**Command Center se ne pominje na sajtu nijednom.**

Šta on stvarno jeste: Convex baza, ~100 tabela, 10 registrovanih providera (od kojih je Google Business još blokiran), publishing i scheduling
za IG i Threads, motor za komentare i DM (OpenReply), rules engine za zaštitu budžeta oglasa,
Meta CAPI sa deljenim `eventID`, i `/r/<slug>?eid=` shortlink koji spaja **klik iz DM-a → GA4
sesiju → `Lead` event na sajtu.**

To je, Hormozijevim rečnikom, **demonstration, ne proof**:

> *"Proof je nešto što kažeš jednom. Demonstration se radi u realnom vremenu — incredibly difficult to fake."*
> *"How can I do demonstration at scale? How can I provide proof at scale in real time?"* `03 §1`

I upravo to je odbrana od AI-ja: *"The AI avatar can never have DONE something in the real world."*

**Posledica:** Command Center prestaje da bude interni alat i postaje **glavni marketinški dokaz**.
Konkretno:
- screenshot lanca atribucije (komentar → DM → sesija → Lead) je najjači pojedinačni komad
  sadržaja koji Enigma može da napravi,
- klijentski pristup dashboardu je **mehanizam zaključavanja** (`05 §13`) — retencija bez ugovora,
- to je odgovor na neoboriv prigovor koji svaka agencija dobija: *"Kako da znam da vaš rad radi?"*

---

## 4. [NALAZ] Brojke na sajtu su trenutno minus, ne plus

Stranice usluga tvrde: `+40%` rast konverzije, `5x` engagement, `99.9%` SLO, `3x` prepoznatljivost,
`98%` zadržavanje klijenata, `30+` lansiranja. **Nijedna nema izvor.**

Istovremeno `constants/projects.ts` eksplicitno odbija da izmisli metriku na portfoliju —
*"procenat bi bio broj koji niko ne može da proveri."* To je tačna odluka, i u direktnoj je
kontradikciji sa stranicama usluga.

Hormozijev standard: **substantiated claim = % ljudi → koji postižu X ishod → u Y vremena →
pod Z uslovima**, sa što manje uslova. Plus: *"You have to be absolutely compliant when you use
numbers."* i *"If you don't track, you don't care."* `03 §17`

**Šta se radi:**
1. Svaka brojka bez izvora se **skida** ili prepravlja u opis obima posla.
2. Instrumentacija: GA4 + Meta CAPI na **svaki klijentski sajt koji Enigma pravi**, kao standardni
   deo isporuke. Bez toga ne postoji nijedan budući hook.
3. Za 12 meseci: **"One Year Later" kampanja** — Hormozijeva najuspešnija ikad. Uzmi sve klijente
   starije od godinu dana, izmeri pre/sada, pokaži razliku. Duplo radi: rezultati su najbolji jer
   su preživeli klijenti, **i** dokazuje da klijenti ostaju. `03 §17`

Do tada Enigma koristi **sopstvene** brojke (svoj funnel, svoj dashboard) kao dokaz — to je
legitimno i odmah dostupno.

---

## 5. [NALAZ] Četiri prepreke poverenju koje se rešavaju za jedan dan

Za lokalnog srpskog kupca ovo su najveće kočnice, a sve četiri su trenutno prisutne:

| Prepreka | Stanje | Fix |
|---|---|---|
| Nema About stranice | folder postoji, prazan | priča firme, lica, koliko dugo, šta smo radili pre |
| Nema adrese | nigde | makar grad; lokalni kupac kupuje od nekog "odavde" |
| UK telefon (+44) | u kontaktu i JSON-LD | srpski broj kao primarni |
| Nema nijedne cene | nigde | vidi §6 — bar "od" prag |

Hormozi o legitimnosti (Harvard model, `06 §16`) i o implied authority (`03 §17 t.9`):
longevity, agregacija iskustva, imenovani klijenti, brojevi. Enigma ima sve to i ne koristi ništa.

---

## 6. [ODLUKA] Ponuda — skelet

### 6.1 Value leader (besplatna stvar koja otvara razgovor)

Već je smišljena u `lead-masina-istrazivanje.md` i Hormozijevski je tačna:

> **Napravi im stranicu PRE poziva. Pozovi. "Uradio sam vam besplatnu stranicu — pogledajte je danas."**
> Stranica živi iza praćenog `/r/` linka.

Zašto radi, po Hormoziju:
- To je **lead magnet koji je kompletno rešenje uskog problema**, ne "PDF sa 5 saveta". `02 Lead magneti`
- To je **demonstration, ne promise** — vide rezultat pre nego što plate.
- **Tracked link daje signal namere:** "X je otvorio stranicu 3 puta, poslednji put pre 20 minuta"
  → to je čovek kog zoveš odmah. To je **speed-to-lead**, a Hormozijev podatak je da odziv u
  60 sekundi diže konverziju **+391%**. `02 Speed to lead`

**Napomena o etici i zakonu:** poštuje se sve što je već zapisano u istraživanju — `lawfulBasis`
po identitetu, opt-out u svakoj poruci, lista "ne diraj", brisanje po osobi. Ne skrejpuje se.

### 6.2 Core ponuda

Ne "izrada sajta". **Retainer koji se prodaje kao vidljivost sa dokazom:**
sajt + Google Business profil *(napomena: GBP integracija je trenutno blokirana — Enigmin profil
nije stariji od 60 dana, kvota 0 QPM; do odobrenja se GBP radi ručno)* + sadržaj za IG/Threads + **pristup dashboardu gde klijent vidi
odakle mu dolaze ljudi.**

Hormozijeve poluge koje treba ugraditi (`01 §4, §16`):
- **Speed i ease** su jače od popusta — *"fast beats free."* Enigma već obećava 12h odgovor /
  48h plan; to treba da bude u ponudi, ne u sitnim slovima.
- **Garancija / risk reversal** — treba je, ali mora biti **istinita i isporučiva**. Predlažem
  da Jovan bira između tri oblika, svi vezani za nešto što Enigma kontroliše:
  a) rok ("stranica živa za X dana ili ne plaćate taj mesec"),
  b) vidljivost ("ako u dashboardu za 60 dana ne vidite izvor svakog upita — ne plaćate"),
  c) nastavak ("prvi mesec bez ugovora, raskid u svakom trenutku").
  **Ne preporučujem garanciju rezultata** koji zavise od klijenta.
- **Bonusi umesto popusta.** Popust ubija maržu i signalizira da je cena bila lažna. `01 §8`

### 6.3 Cena

**[ODLUKA]** Treba odluka. Hormozijev stav je jednoznačan: *"never lower your prices"*, cena je
pozicioniranje, i **+20% na cenu često znači 2x profit** jer ide direktno u maržu. `01 §8–§9`
Ali pre podizanja cene treba znati **true cost isporuke po klijentu** — što Enigma trenutno ne meri.

Minimalni potez odmah: **"od X EUR mesečno"** na sajtu. Bez toga, svaki poziv troši vreme na
kvalifikaciju koju je stranica mogla da uradi besplatno. Kvalifikacija u copy-u je Hormozijeva
poluga kvaliteta leada — isti CAC, višestruko vredniji klijent. `02 Lead quality`

---

## 7. [ODLUKA] Kanali — Core Four za Enigmu

Hormozijeva Core Four: warm outreach, content, cold outreach, paid ads. Redosled za Enigmu:

**1. Warm outreach — odmah, nula dinara.**
Jovanova mreža, bivši klijenti, ljudi koji su pitali pa nisu kupili. **Rule of 100:**
100 kontakata dnevno **po osobi**, 90 dana. Tim od 3–4 ⇒ realno 100/dan ukupno je već ozbiljno.
Skripte: `08 §1`.

**2. Content — glavna dugoročna igra.** Vidi `11_CONTENT_ENGINE.md`.

**3. Cold outreach — uz besplatnu stranicu kao value leader.**
Postojeći test-set (100 beogradskih salona bez sajta) je spreman. Uvoz tabele, ne skrejpovanje.

**4. Paid ads — TEK kad znamo LTGP:CAC.**
Meta Ads je već povezan sa insights, pause/budget i audit logom. Ali *"ne skaliraj lošu jediničnu
ekonomiju."* Prag za paljenje: **LTGP:CAC ≥ 3:1**. `07 §3`

**+ Referrali — jedini kanal koji raste kvadratno.** `02 Referrals`
Trenutno se ne traže sistematski. Cilj koji Hormozi postavlja: **30% biznisa iz preporuka.**
Najjeftiniji potez u celom dokumentu: **tražiti preporuku u trenutku uspeha** (kad klijent kaže
da mu je stigao upit sa sajta), a ne na kraju projekta.

---

## 8. [NALAZ] Ne uvozi Hormozijevu tier listu platformi

Njegov scorecard (`03 §6`) je merenje **američke B2B publike vlasnika firmi $1M+**.
Njegov zaključak (S: YouTube+IG, F: TikTok) **ne prenosi se automatski** na vlasnika frizerskog
salona u Šapcu.

**Ali okvir se prenosi u celosti.** Pet kriterijuma po platformi:
1. **WHO** — koliko naših kupaca je tamo
2. **HOW MANY** — koliki deo tržišta
3. **GROWTH** — koliko je lako rasti od nule
4. **DEPTH** — prosečno vreme gledanja
5. **CONVERSION** — % saobraćaja na sajt + prosečno trajanje sesije **po izvoru**

**Enigma jedina od svih može ovo da izmeri za sebe, danas.** GA4 već daje saobraćaj po
source/medium, a `/atribucija` ruta već prati lanac sadržaj → DM klik → sesija → konverzija.

**Prvi zadatak pre content plana:** pustiti Hormozijev scorecard na sopstvenim GA4 podacima i
napraviti **Enigma tier listu**. Dok se to ne izmeri, `11_CONTENT_ENGINE.md` radi po najboljoj
proceni i eksplicitno je označava kao pretpostavku.

---

## 9. [ODLUKA] Merenje — uparene metrike

Hormozijevo pravilo: **nikad jedna metrika.** Uvek količina × kvalitet, inače optimizuješ za smeće.
On koristi `ad revenue = views × RPM`. Enigma nema RPM, ali ima nešto bolje:

| Količina | × | Kvalitet |
|---|---|---|
| broj objava nedeljno | × | **lead rate po izvoru** (sesije iz tog izvora → `Lead` event) |
| broj outreach kontakata | × | % koji otvore `/r/` stranicu |
| broj poziva | × | close rate |
| broj klijenata | × | mesečni churn |

**Input ciljevi, ne output ciljevi.** *"Make the ACTION the goal, not the outcome."*
Nedeljni skor je: **da li je objavljeno** i **da li je urađen outreach** — ne koliko je bilo pregleda.

**Tri broja koja se moraju izračunati u prvih 30 dana:** CAC, LTGP, 30-day cash. Bez njih nijedna
odluka o budžetu nije odluka nego kockanje. `07 §2`

---

## 10. Prvih 90 dana

### Dani 1–30 — temelji (ništa od ovoga ne košta ništa)
- [ ] About stranica, srpski telefon, grad, "od X EUR"
- [ ] Skinuti sve nepotkrepljene brojke sa stranica usluga
- [ ] Izračunati CAC / LTGP / 30-day cash iz postojećih 6 klijenata
- [ ] Enigma tier lista platformi iz sopstvenog GA4 (§8)
- [ ] Warm outreach starta: Rule of 100, svaki dan, bez izuzetka
- [ ] Content faza 2: pouzdana kadenca na **jednoj** platformi (predlog: Instagram)

### Dani 31–60 — dokaz i ponuda
- [ ] Instrumentacija (GA4 + CAPI) na svaki klijentski sajt kao standard isporuke
- [ ] Prvi case study po Hormozijevoj specifikaciji: **konkretan avatar, konkretan problem,
      konkretan ishod, u konkretnom vremenu**
- [ ] Ponuda spakovana: garancija izabrana, cenovni prag objavljen, ime ponude
- [ ] Cold outreach pilot: 100 salona, besplatna stranica iza `/r/` linka, poziv onima koji otvore
- [ ] Content faza 3: isti sadržaj na svim kanalima, drugo pakovanje po platformi

### Dani 61–90 — sistem
- [ ] Referral mehanizam: pitanje u trenutku uspeha, ugrađeno u proces
- [ ] Onboarding i time-to-first-value mereni (`05 §15`)
- [ ] Prva odluka o paid ads — pali se samo ako je LTGP:CAC ≥ 3:1
- [ ] Content faza 4: maksimalna kadenca po platformi koju platforma podnosi

---

## 11. Šta Enigma NE treba da radi u ovih 90 dana

- **Ne otvarati nove platforme.** `More → Better → New.` TikTok, X i LinkedIn čekaju dok
  Instagram i Threads ne budu maksimalno iskorišćeni.
- **Ne praviti novi proizvod.** Šest usluga je već previše za tim od 3–4 ljudi.
  Dva odvojena Hormozijeva okvira koja idu u istom smeru: **"kill the vampire"** — ubij proizvod
  koji troši pažnju a ne nosi novac (`07 §13`, `3yAiVjcImQ4`); i **Chick-fil-A** — meni je četvrtina
  konkurentskog, a prihod po lokaciji dvostruk (`06 §12`, `TIH1w-KuATk`). To nije zabeležen rez
  pa rast, nego zatečeno stanje fokusa.
- **Ne kupovati pratioce, ne koristiti pods, ne juriti hashtag hakove.** Dokumentovano da ubija
  organsku distribuciju do resetovanja naloga. `03 §5`
- **Ne paliti oglase pre nego što se izračuna LTGP:CAC.**
- **Ne praviti "brand awareness" content bez ponude iza njega.** Goodwill se gradi davanjem,
  ali svaki komad mora da vodi ka nečemu što postoji.
