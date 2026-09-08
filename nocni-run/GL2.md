# GL2 — Filteri u URL-u, LinkChip, tab Niše, profil firme

Model: **Opus** · Effort: **high** · Mode: **acceptEdits (implementacija)** · Sesija: **nova**

Ti si u repou `enigmadigital`. GL1 je već na `main` (proveri `git log -3`;
ako nema komita sa `[GL1]`, STANI i završi sa `NEUSPEH GL2: GL1 nije na main`).
Pročitaj `nocni-run/izvestaji/GL1.md` — tamo su odluke koje je GL1 doneo.

Pročitaj `generate-leads-plan.md` — sekcije **§0, §2, §6 (samo prikaz na
kraju), §7**. Pročitaj `components/app/leadovi/leads-table.tsx` (celo),
`lead-chips.tsx`, `lead-row-actions.tsx`, `lead-expanded-row.tsx`,
`leads-dashboard.tsx`, `app/(app)/leadovi/[companyId]/lead-detail-page-client.tsx`,
`convex/leadCrmStore.ts` (list query koje tabela koristi), `convex/nichesStore.ts`.

## Uradi, ovim redom

### 1. Backend za filtere (§7.1)
- `listLeadsFiltered` (paginirano) i `countLeadsByFacet` u `leadCrmStore.ts`
  ili novom `leadFiltersStore.ts`. Svi filteri server-side. Argumenti su
  eksplicitno tipizirani (union literali), ne slobodni stringovi.
- Verovatnoća telefona kao filter: firma prolazi ako ima bar jednu
  identifikaciju `kind: "phone"` sa `verovatnoca >= prag`.
- Filter `sajt` ima sedam vrednosti (§7.1): `ima`, `nema`, `nepoznato`,
  `ne_radi`, `parkiran`, `drustvene`, `bez_https`. Brojači za svih sedam.
  Firma koja nikad nije proveravana (polja odsutna) ne ulazi ni u jedan —
  brojač „neprovereno: N" se prikazuje kao tekst, ne kao chip.
- `poslednjiDodir` filter koristi postojeće polje iz obogaćene liste (LR1).
- Gornja granica 2000 firmi po workspaceu za brojače; preko toga vrati
  `{ prekoracen: true }` i UI kaže „>2000, suzi filter".
- `leadFilterPresets`: `listPresets`, `savePreset`, `deletePreset`.

### 2. URL stanje i traka filtera (§7.1)
- `useLeadFilters()` hook (`components/app/leadovi/use-lead-filters.ts`):
  čita `useSearchParams`, piše `router.replace` bez skrola, parsira u tipizovan
  objekat, ignoriše nepoznate vrednosti (ne baca).
- Traka: grupe chipova sa brojem u zagradi; chip sa 0 je `disabled` sa
  `title` tooltipom. Aktivni chipovi se vide i u sklopljenoj traci kao
  „3 filtera · očisti".
- Postojeći `filterMode` (`stage|overdue`) se seli u URL (`faza`, `zaostali`)
  — ponašanje isto, izvor istine je URL.
- Preseti: „Sačuvaj kao preset" (ime, obavezno), lista preseta kao chipovi,
  brisanje sa potvrdom.
- Tab Mapa još ne postoji (GL3) — hook mora biti nezavisan od tabele da bi ga
  mapa preuzela bez izmena.

### 3. LinkChip (§7.2)
Napravi `components/app/link-chip.tsx`, zameni SVAKI `ContactLink` poziv,
obriši `ContactLink` kad više nema referenci (grep da potvrdiš). Kopiranje
preko `navigator.clipboard` sa vizuelnom potvrdom 1,5 s; ako clipboard API
ne postoji, dugme za kopiranje se ne crta.

### 4. Tab „Niše" (§7.3)
Dodaj `niche` u `Tab` union i `TabNav` u `leads-dashboard.tsx`. Komponenta
`components/app/leadovi/niches-panel.tsx` po §7.3. Bedž „Claude · datum" /
„Ime · datum". Prazno stanje kad nema niša: objašnjenje da skill pravi nišu
pri prvom uvozu + dugme „Nova niša".

### 5. Profil firme (§7.4)
Sekcije Osobe / Platforme / Poreklo. `setPhoneConfidence` mutacija
(obavezno obrazloženje, `verovatnocaIzvor: "covek"`, `verovatnocaAt`). Traka
verovatnoće — boje preko postojećih tokena iz `globals.css` (danger/warning/
success ili kako se zovu; ne uvodi nove hex vrednosti). „Nije moguće
proceniti" kao siv tekst; odsustvo procene se ne prikazuje kao 0.

### 6. Prošireni red u tabeli i bedž sajta
U `lead-expanded-row.tsx` dodaj red platformi (LinkChip) i najbolju osobu
(ime · uloga · % ) — bez dupliranja profila, samo najvažnije. Bedž statusa
sajta (§7.4, poslednja tačka) pored LinkChipa sajta u tabeli, proširenom
redu i profilu — jedna komponenta `SiteStatusBadge`, ne tri kopije.

## Kriterijum gotovosti
Tačke 1–3 obavezne. 4–6 ako ne stigneš → u izveštaj sa razlogom, ali tab
„Niše" ne sme da postoji bez sadržaja (ne dodaj tab ako panel nije gotov).
