# Ocena sajta — plan (skill + aplikacija)

Stanje na dan 09.09.2026. Dopuna `generate-leads-plan.md` (§0 pravila važe u
celini). Promptovi: `nocni-run/GL10.md` (i dalje po potrebi).

Cilj: kad firma IMA sajt, skill ga oceni iz tri nezavisna ugla i sve upiše u
aplikaciju, tako da Enigma zna **kome sajt treba popraviti, a ne samo kome
sajt fali**. Ista ocena služi i za razvrstavanje sajtova mimo lead-mašine.

---

## 1. Tri izvora, tri različite vrste istine

| Izvor | Šta daje | Ko izvršava | Kako se čuva |
|---|---|---|---|
| **Lighthouse** (preko PageSpeed Insights API v5) | performance, accessibility, best-practices, SEO (0–100) za mobilni i desktop; LCP, CLS, INP/TBT; terenski CWV kad postoje | `run.mjs audit-site` (mreža, deterministički) | brojevi, izvor `psi`, vreme |
| **Tehnologije** (Wappalyzer otisci) | CMS, framework, e-commerce, booking alat, analitika, pixel, hosting/CDN, jQuery/Bootstrap, verzije gde se vide | `run.mjs audit-site` (HTML + zaglavlja + skripte + kolačići + meta) | lista `{ime, kategorija, verzija?, pouzdanost}` |
| **Claude** (sud) | prvi utisak, jasnoća ponude, put do kontakta/zakazivanja/kupovine, mobilna upotrebljivost, ažurnost; 3 glavne mane; prilika za Enigmu; preporučena ponuda | Claude u skillu, nad snimcima ekrana (desktop + mobilni) i tekstom stranice | ocene 1–5 sa po jednom rečenicom, tekstovi, `model`, vreme |

Nijedan izvor se ne izvodi iz drugog. Ukupna ocena se **računa pri čitanju**
(§0 pravilo 2), nikad se ne skladišti.

### 1.1 Zašto PageSpeed Insights, a ne lokalni Lighthouse / Chrome ekstenzija
Ekstenzije (Wappalyzer, Lighthouse u DevTools) nisu skriptabilne iz skilla i
daju rezultat koji zavisi od Jovanove mašine i mreže. PSI API vraća isti
Lighthouse sa Googleovih servera, besplatno, sa istim uslovima za sve sajtove,
bez lokalnog Chromea. Ključ: `PAGESPEED_API_KEY` (isti Cloud projekat, uključi
„PageSpeed Insights API", nov ključ ograničen na taj API — Places ključ se ne
deli). Bez ključa PSI radi sa niskom anonimnom kvotom, pa je ključ obavezan.
Trošak: 0. Kvota: 25.000 poziva/dan.

### 1.2 Zašto otisci, a ne Wappalyzer ekstenzija
Wappalyzer je zatvorio izvor 2023; zajednica održava otiske u
`enthec/webappanalyzer` (MIT, JSON po tehnologiji, isti format). Skill nosi
kopiju otisaka u `tools/generate-leads/vendor/technologies/` (+ skripta
`osvezi-otiske` koja ih povlači sa GitHuba) i sopstveni matcher za `html`,
`scriptSrc`, `meta`, `headers`, `cookies`, `dom` (bez `js` otisaka koji
traže izvršavanje). Za male sajtove u Srbiji (WordPress, Wix, Squarespace,
Shopify, Joomla, WooCommerce, Elementor, jQuery, GA/GTM, Meta pixel, Cloudflare)
to je dovoljno; pouzdanost se upisuje uz svaku tehnologiju.

### 1.3 Snimci ekrana za Claudeov sud
`run.mjs audit-site` pravi dva snimka Playwright Chromiumom (desktop 1440×900,
mobilni 390×844, full-page do 4000 px, WebP ≤ 300 KB) i čuva tekst stranice.
Playwright i Chromium se instaliraju **jednom** na Jovanovoj mašini
(`npx playwright install chromium`) — skill to proverava i staje sa uputstvom
ako fali, ne instalira sam. Claude gleda slike i tekst, popunjava rubriku iz
§3, i **ne sme** da ocenjuje sajt koji nije video (bez snimka → „nije moguće
oceniti" sa razlogom).

---

## 2. Šema (aplikacija)

### 2.1 Nova tabela `leadSiteAudits`
Jedna po oceni (istorija se čuva; „poslednja" = najveći `auditedAt`).
- `workspaceId`, `companyId`, `url` (konačni URL posle redirekcija), `auditedAt`
- `izvor: "skill"`, `verzijaSkilla`
- `lighthouse?: { mobile?: Kategorije, desktop?: Kategorije, terenski?: {...} }`
  gde `Kategorije = { performance, accessibility, bestPractices, seo,
  lcpMs?, cls?, inpMs?, tbtMs? }` — svaki broj opciono (PSI ume da ne vrati
  kategoriju); odsustvo ≠ 0.
- `tehnologije?: Array<{ ime, kategorija, verzija?, pouzdanost: number }>`,
  `cms?: string` (izvedeno IZ liste pri upisu — dozvoljeno jer je ime, ne
  metrika), `eCommerce?: string`, `booking?: string`
- `claude?: { model, ocene: { prviUtisak, jasnocaPonude, putDoKontakta,
  mobilnaUpotrebljivost, azurnost } (svaka {ocena: 1–5, obrazlozenje}),
  glavneMane: string[] (≤3), prilikaZaEnigmu: string, preporucenaPonuda:
  "nov_sajt"|"redizajn"|"webshop"|"zakazivanje"|"seo"|"brzina"|"nista",
  klikovaDoKontakta?: number }`
- `snimci?: { desktopId?: Id<"_storage">, mobilniId?: Id<"_storage"> }`
- `greske?: string[]` (npr. „PSI mobile: timeout")
- Indeksi: `by_company` (`companyId`, `auditedAt`), `by_workspace`.
- Purge map: `excluded` kao ostale lead tabele iz GL1 (proveri kako je
  `leadFilterPresets` registrovan i uradi isto).

### 2.2 `leadCompanies` +
- `poslednjaOcenaSajtaAt: v.optional(v.number())` i
  `poslednjaOcenaSajtaId: v.optional(v.id("leadSiteAudits"))` — pokazivač da
  lista/filteri ne čitaju istoriju. `OPCIONO NAMERNO`: odsustvo = sajt nikad
  ocenjivan.

### 2.3 Signali (`LEAD_SIGNAL_KINDS` + podrazumevana Fit pravila)
- `sajt_spor` — Lighthouse mobile performance < 50
- `sajt_los_seo` — SEO < 60
- `sajt_slab_ux` — prosek Claudeovih pet ocena ≤ 2,5
- `sajt_bez_puta_do_kontakta` — `putDoKontakta` ≤ 2 ili `klikovaDoKontakta` ≥ 3
- `sajt_zastarela_tehnologija` — CMS/framework iz kratke liste (Joomla ≤ 3,
  Drupal ≤ 7, WordPress bez responsive teme, čist HTML sa `<table>`
  rasporedom, Flash) — lista je u kodu sa obrazloženjem, ne u modelu
- `sajt_bez_zakazivanja` — niša traži zakazivanje (frizeri, kozmetika,
  stomatolozi, teretane — polje `trebaZakazivanje` u `lib/nise.mjs` /
  `niches.trebaZakazivanje`), a sajt nema booking alat ni formu za termin
Svaki dobija podrazumevano pravilo sa težinom i obrazloženjem; ekran
Ocenjivanje nudi „Dodaj nedostajuća podrazumevana pravila" (GL1). Signali se
upisuju pri `applyImport` iz `sajtOcena` reda i pri direktnom upisu ocene.

### 2.4 Ukupna ocena (pri čitanju, `convex/lib/siteScore.ts`)
`kvalitetSajta` 0–100 = 0,25·perf(mobile) + 0,15·seo + 0,10·a11y + 0,10·bp +
0,40·(Claude prosek ×20). Komponenta koje nema se preskače i težine se
renormalizuju; ako fale i Lighthouse i Claude → `null` („nije ocenjeno").
Pojasevi: loš < 40, srednji 40–69, dobar ≥ 70. Funkcija je čista i testirana.

---

## 3. Claudeova rubrika (u `SKILL.md`, doslovno)
Za svaki sajt Claude gleda `desktop.webp`, `mobile.webp` i `tekst.txt`, pa
popunjava:
1. **Prvi utisak (1–5)** — da li izgleda kao sajt koji se održava; jedna
   rečenica sa konkretnim detaljem sa snimka.
2. **Jasnoća ponude (1–5)** — može li posetilac za 5 sekundi da kaže šta
   firma nudi i gde je.
3. **Put do kontakta/zakazivanja/kupovine (1–5)** + `klikovaDoKontakta` —
   koliko klikova od početne do telefona/forme/termina/korpe.
4. **Mobilna upotrebljivost (1–5)** — sa mobilnog snimka: preklapanja,
   sitan tekst, meni, dugmad.
5. **Ažurnost (1–5)** — godina u podnožju, poslednja vest/objava, prazne
   stranice, „u izradi".
Zatim `glavneMane` (≤3, svaka jedna rečenica, svaka vidljiva na snimku),
`prilikaZaEnigmu` (jedna rečenica: šta bi Enigma prodala i zašto baš to),
`preporucenaPonuda` (enum iz §2.1). Zabrane: ocenjivanje bez snimka;
opšte fraze bez detalja („sajt je zastareo"); ocena 3 kao podrazumevana
(svaka ocena mora imati razlog).

---

## 4. Skill — komande i tokovi

### 4.1 `run.mjs audit-site --run <id> [--samo lighthouse|tehnologije|snimci]`
Za svaku firmu sa `sajtStatus: "radi"` (ostale se preskaču i broje):
PSI mobile + desktop (sa `PAGESPEED_API_KEY`, ≤ 1 zahtev/s, timeout 60 s,
1 pokušaj), otisci nad istim HTML-om koji je `check-site` već povukao (ne
fetchuje ponovo ako je mlađi od 1 h), snimci Playwrightom (≤ 3 stranice:
početna + prva „kontakt/zakazivanje" stranica ako postoji + jedna
proizvod/usluga). Upisuje `out/<run>/sajt/<slug>/{psi.json, tehnologije.json,
desktop.webp, mobile.webp, tekst.txt}` i sažetak u `firme.json` pod
`sajtOcena` (bez Claudeovog dela). Greške po firmi idu u `sajtOcena.greske`,
ne ruše run.

### 4.2 Claude korak
Posle `audit-site`, Claude za svaku firmu sa snimcima popunjava
`sajtOcena.claude` po §3. STOP tačka: ispis broja sajtova i procene trajanja
pre početka (≈ 1–2 min po sajtu).

### 4.3 Gde se poziva
- `discover` tok sa `ima` ili `svejedno`: posle `check-site`, obavezno.
- `obogati`: obavezno kad je `sajt` u `--polja` ili bez `--polja`.
- Novo: `/generate-leads oceni-sajtove [--izvoz <csv>] [--od --do]` — samo
  audit za firme koje u aplikaciji imaju sajt (`--izvoz` iz „Izvezi CSV" sa
  filterom `?sajt=ima`), šalje kao `obogati` sa `polja: ["sajtOcena"]`.
- Novo: `/generate-leads oceni-sajt <url>` — jedan sajt, bez slanja; ispisuje
  izveštaj u terminalu i čuva u `out/oceni-sajt/<domen>/`. `--firma <companyId>`
  šalje u aplikaciju za tu firmu.
- Snimci: `send` ih šalje na `POST /generate-leads/snimak` (isti Bearer
  token, `multipart`, ≤ 400 KB po slici, ≤ 2 po firmi) → `ctx.storage.store`
  → id-jevi ulaze u telo ingesta. Ako upload padne, ocena ide bez slika i
  `greske` to kaže.

### 4.4 Ingest
`ParsedLeadRow.sajtOcena?` = ceo objekat iz §2.1 bez `workspaceId/companyId`.
Zod šema + `lib/schema.mjs`. `applyImport`/`attachSkillData`: upis u
`leadSiteAudits`, pokazivači na firmi, signali iz §2.3. Uvek se dodaje NOVA
ocena (istorija), nikad se ne prepisuje stara.

### 4.5 Places FieldMask (usput, štedi kvotu ×5)
Trenutni FieldMask sadrži `places.websiteUri` → Text Search **Enterprise**
SKU (1.000 besplatnih poziva mesečno). Bez `websiteUri` → **Pro** SKU
(5.000 mesečno). Postojanje sajta se ionako proverava po §3.4 iz tri druga
izvora, pa `websiteUri` izbaciti iz FieldMask-a; `kandidati.json` ostaje bez
tog polja, skill nastavlja isto. Napomena u README-u o SKU-ovima.

---

## 5. Aplikacija — prikaz

### 5.1 Profil firme → sekcija „Sajt"
- Zaglavlje: LinkChip sajta + `SiteStatusBadge` + **pojas kvaliteta** (loš/
  srednji/dobar sa brojem) + „ocenjeno <datum>, <model>".
- Četiri pločice Lighthouse (mobilni podrazumevano, preklopnik na desktop),
  ispod LCP/CLS/INP kao mali brojevi sa pojasom (dobro/treba popraviti/loše
  po Google pragovima). Brojevi koji fale pišu „—", ne 0.
- Claudeova rubrika: pet redova sa trakom 1–5 i rečenicom; mane; prilika;
  preporučena ponuda kao istaknut čip.
- Tehnologije: čipovi grupisani po kategoriji, CMS prvi i istaknut.
- Snimci: dve sličice (desktop/mobilni) sa otvaranjem u punoj veličini.
- Istorija ocena: lista prethodnih sa datumom i kvalitetom (klik = prikaz).
- Prazno stanje: „Sajt nije ocenjivan" + kako se pokreće (`oceni-sajt`).

### 5.2 Tabela i filteri
- `SiteStatusBadge` dobija pojas kvaliteta kad ocena postoji (boja pojasa,
  broj u `title`).
- Filteri: `kvalitet` (`los|srednji|dobar|neocenjen`), `cms` (top 8 iz baze
  + „drugo" + „bez CMS-a"), `sajtSpor` (perf < 50), `ponuda` (enum
  `preporucenaPonuda`). Brojači kao ostali (GL2).
- Preset primer u README-u: „Ima sajt · loš · WordPress" = spisak za
  redizajn.

### 5.3 Tab Niše
Po niši: raspodela CMS-a (mali horizontalni stubovi), prosečan kvalitet,
broj sajtova bez zakazivanja. Samo iz postojećih ocena, bez novih upita po
firmi (agregat u `listNiches`).

### 5.4 Mapa
Boja pina ostaje temperatura. Hover kartica dobija red „Sajt: loš 31" kad
postoji.

---

## 6. Šta se NE radi
- Nema poziva Claude API-ja iz aplikacije — sud daje Claude u skillu.
- Nema pokretanja Lighthousea u browseru korisnika.
- Ne čuvaju se HTML sajtova ni tekst stranice u bazi (samo na mašini u
  `out/`), samo snimci i brojevi.
- Ne ocenjuje se sajt sa `sajtStatus` ≠ `radi`.

## 7. Env na Jovanovoj mašini (novo)
- `PAGESPEED_API_KEY` — Google Cloud → APIs & Services → Library → „PageSpeed
  Insights API" → Enable → Credentials → nov ključ, restrikcija na taj API.
- `npx playwright install chromium` jednom (Playwright je dev zavisnost repoa;
  ako nije, GL10 je dodaje).
