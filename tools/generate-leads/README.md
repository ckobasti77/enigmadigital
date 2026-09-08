# `/generate-leads` — skill za pravljenje liste leadova

Izvor skilla koji nalazi male firme u Srbiji po gradu i niši, potvrđuje im
podatke iz primarnih izvora i šalje ih u Enigma Command Center **na pregled**
(staging uvoz, ne direktno u bazu).

Plan i pravila: `generate-leads-plan.md` u korenu repoa, sekcije §3 (Places),
§6 (verovatnoća telefona), §10 (skill). Ovaj README je uputstvo za upotrebu;
plan je izvor istine za odluke.

---

## Instalacija

Skill se pokreće iz Claude Code-a, a `SKILL.md` mora da zna gde je repo:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\admin\Desktop\Web Dev Projects\enigmadigital\tools\generate-leads\install.ps1"
```

Skripta kopira `SKILL.md` u `%USERPROFILE%\.claude\skills\generate-leads\` i u
kopiji zameni `{{REPO_PATH}}` apsolutnom putanjom repoa. Izvor u repou ostaje sa
placeholderom. Posle svake izmene `SKILL.md` u repou — pokreni instalaciju
ponovo.

Ništa se ne instalira preko `npm`. Potreban je samo Node 20+ (`fetch` je
ugrađen).

## Promenljive okruženja

Četiri, sve na nivou korisnika (Windows „User"), nijedna u repou:

| Promenljiva | Čemu služi | Gde se uzima |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | Places Text Search (otkrivanje kandidata) | Google Cloud → APIs & Services → Credentials |
| `ENIGMA_INGEST_TOKEN` | Bearer token za slanje | `digital.enigmait.rs` → Podešavanja → Pristup → Tokeni za uvoz |
| `ENIGMA_INGEST_URL` | adresa ingest rute | `https://<deployment>.convex.site/generate-leads/ingest` |
| `ENIGMA_CONTACT_EMAIL` | kontakt u `User-Agent` (Nominatim, provera sajtova) | poslovni email |

```powershell
[Environment]::SetEnvironmentVariable("ENIGMA_INGEST_TOKEN", "<token>", "User")
```

Posle postavljanja otvori **novi** PowerShell prozor. Provera (ne prikazuje
vrednosti):

```
node "…/tools/generate-leads/run.mjs" proveri-env
```

## Primer runa

```
node run.mjs discover --grad "Beograd" --nisa frizeri --broj 25 --sajt nema
# Claude pročita out/<run-id>/kandidati.json i popuni out/<run-id>/firme.json
node run.mjs check-site --run 2026-09-08-beograd-frizerski-saloni
node run.mjs geocode    --run 2026-09-08-beograd-frizerski-saloni
node run.mjs score      --run 2026-09-08-beograd-frizerski-saloni
node run.mjs send       --run 2026-09-08-beograd-frizerski-saloni --dry-run
node run.mjs send       --run 2026-09-08-beograd-frizerski-saloni
```

Beogradske opštine: `--grad "Zemun|Beograd"` — prvi je kanonski naziv (ide u
upit i u uvoz), ostali se prihvataju u adresi, jer Places za opštine često vraća
adresu sa „Beograd".

Nepoznata niša: `discover` staje i traži `--upiti "frizerski salon,hair salon"`.
Upiti se ne pogađaju — pogrešan upit troši Places kvotu na pogrešne firme.

## Radni folder

`out/<run-id>/` (nije u gitu):

| Fajl | Šta je | Kad nastaje |
| --- | --- | --- |
| `run.json` | stanje runa: grad, niša, cilj, filter, Places pozivi, nedostupni izvori | `discover` |
| `kandidati.json` | Places rezultati, **privremeno** — briše se posle uspešnog slanja | `discover` |
| `firme.json` | ono što je Claude pročitao sa stranica; ulaz za skor i slanje | Claude |
| `payload.json` | telo koje je poslato (ili bi bilo, uz `--dry-run` / posle greške) | `send` |
| `nisa-opis.txt` | predlog opisa niše koji ingest ne prenosi | `send` |

`out/` sadrži imena, adrese i telefone stvarnih ljudi. Ne komituje se, ne
kopira i ne lepi u chat.

## Šta koja poruka na kraju runa znači

| Poruka | Značenje | Šta uraditi |
| --- | --- | --- |
| `Poslato X redova (traženo Y)` | X redova je u stagingu, čeka pregled | otvori link iz poruke |
| `Grad je iscrpljen za ovaj upit` | Places je vratio sve što ima, a to je manje od traženog | ne dopunjuj — probaj drugu nišu ili susednu opštinu |
| `Places nije iscrpljen, neobrađenih kandidata: N` | stalo se pre cilja, ali kandidata ima još | pokreni obradu preostalih kandidata u istom runu |
| `Nedostupni izvori: …` | neki izvor je blokirao proveru; ti redovi imaju manje podataka | vidi upozorenja iznad tabele u pregledu uvoza |
| `Telefona: N, sa procenom: M` | M osoba ima izračunatu verovatnoću, N − M nema | „nije moguće proceniti" je ispravan ishod, ne greška |
| `Bez ikakvog kontakta: N` | N firmi nema ni telefon, ni mejl, ni profil, ni sajt | ostaju u uvozu kao leadovi za obilazak |
| `Telo ne odgovara ingest šemi` | lokalna validacija je odbila telo pre slanja | popravi `firme.json` po navedenim putanjama polja |
| `Slanje nije uspelo (status …)` | aplikacija je odbila zahtev; JSON je sačuvan | ponovi `send` posle ispravke — bez novih Places poziva |

Nijedna poruka ne sadrži sirov telefon, mejl ni ime osobe (plan §0 pravilo 6).

## Kako se rezultat čita u aplikaciji

1. Otvori link iz poslednje poruke: `digital.enigmait.rs/leadovi/uvoz?import=<id>`
   (ili Leadovi → **Uvoz** → Istorija uvoza → red
   `generate-leads · <grad> · <niša> · <datum>`).
2. **Iznad tabele** stoje upozorenja iz runa: nedostupni izvori, „grad je
   iscrpljen", verzija skilla i broj Places poziva.
3. **U tabeli** su kolone: Niša, Sajt (`ima · radi` / `ima · parkiran` /
   `nema` / `nepoznato`), Koord. (✓ / —), Osobe (`Ime · 72 %` ili
   `Ime · bez procene`), Platforme.
4. Redovi se odbacuju pojedinačno pre primene. **Primeni** upisuje u
   `leadCompanies`; dok to ne uradiš, ništa nije u bazi.
5. Posle primene: profil firme ima sekcije Osobe (traka verovatnoće +
   obrazloženje), Platforme i Poreklo (izvor po polju).

## Opis niše

`lib/nise.mjs` nosi opis svake niše (3–4 rečenice, napisao ih Claude). **Ingest
šema nema polje za taj opis** — red nosi samo slug niše. Zato `send` upisuje
tekst u `out/<run-id>/nisa-opis.txt` i ispiše putanju; u aplikaciju se nalepi
ručno (Leadovi → Niše → Opis), čime opis dobija `opisAutor: "covek"`.

Da bi opis putovao sa uvozom i ostao zapisan kao `opisAutor: "claude"`, ingest
šema bi morala da dobije polje (npr. `upit.nisaOpis`) i `upsertNicheBySlug` da
ga upiše pri prvom pravljenju niše. To je izmena u Convexu, ne u skillu.

## Testovi

```
npm run verify:gl-skill      # iz korena repoa
node run.mjs self-test       # sa bilo koje mašine
```

Bez mreže, bez ključeva, bez Places kvote. Proverava:

- **skor (§6)** — 8 slučajeva, uključujući dva „nije moguće proceniti", kap na
  95 i pod na 0; obrazloženje mora da ima tačno dve rečenice i nijednu cifru;
- **niše** — 10 mapiranja slobodnog teksta i stabilnost slugova pod
  `normalizeNicheSlug` iz Convexa;
- **šemu** — 3 JSON primera kroz OBE kopije (`lib/schema.mjs` i zod iz
  `convex/lib/generateLeadsIngest.ts`); presude, putanje polja i granice
  (200 / 3 / 10) moraju da se poklope;
- **status sajta (§3.8)** — 6 lažnih odgovora kroz čistu `klasifikuj()`, bez
  ijednog mrežnog poziva.

Van repoa `convex/lib/generateLeadsIngest.ts` ne postoji, pa se poređenje šema
**preskače uz jasnu poruku** (ostatak testa i dalje važi). `--strogo` pretvara
taj preskok u pad; `npm run verify:gl-skill` ga koristi.

## Granice koje se ne pomeraju

- Places služi **samo za otkrivanje**. Trajno se čuva jedino `placeId`; sve
  ostalo u bazi ima `sourceUrl` koji nije Google (plan §3, §O3).
- Koordinate su iz Nominatima (OSM), nikad iz Placesa. Mapa nosi atribuciju
  „© OpenStreetMap contributors" (§O4).
- Bez skrejpera Google Mapsa i bez headless browsera za Places (§O11).
- Provera sajta: jedan zahtev, timeout 8 s, najviše 3 redirekcije, nikad prema
  privatnoj adresi ili `localhost`, nikad retry (§3.8).
- Nominatim: najviše 1 zahtev u sekundi, jedan pokušaj po adresi (§3.6).
- Skill piše u staging, nikad direktno u `leadCompanies` (§O2).
