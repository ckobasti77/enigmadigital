# Noćni run — /generate-leads ekosistem

Plan: `../generate-leads-plan.md`. Svaki prompt čita svoje sekcije plana i
završava zajedničkim repom (`_zajednicki-rep.md`): typecheck → purge gate →
lint → izveštaj → commit → push.

| # | Prompt | Šta | Model | Effort | Mode | Sesija | Zavisi od |
|---|---|---|---|---|---|---|---|
| 1 | `GL1.md` | Šema (+ status sajta), ingest endpoint, tokeni za uvoz, niše backend, 2 nova signala, provera temperature | Opus | high | acceptEdits | nova | — |
| 2 | `GL2.md` | Filteri u URL-u sa brojačima i presetima, LinkChip, tab Niše, profil firme | Opus | high | acceptEdits | nova | GL1 |
| 3 | `GL3.md` | Mapa — MapLibre native (klasteri, ekstruzija = fit, boja = temperatura), mini mapa | Fable | high | acceptEdits | nova | GL1 (GL2 poželjno) |
| 4 | `GL4.md` | three.js sloj + GSAP letovi, reduced-motion, čišćenje | Fable | max | acceptEdits | **ista kao GL3** (`--continue`) | GL3 |
| 5 | `GL5.md` | Skill `/generate-leads` (ima/nema/svejedno): `tools/generate-leads/`, `run.mjs` sa `check-site`, skor §6, install.ps1 | Opus | max | acceptEdits | nova | GL1 |

Redosled izvršavanja: GL1 → GL2 → GL3 → GL4 → GL5. Skript staje sa
zavisnim promptovima ako prethodni nije završio sa `GOTOVO`.

## Pokretanje
Vidi `run.ps1` zaglavlje. Ujutru čitaš `logs/REZIME.md`, pa
`izvestaji/GL*.md` (svaki ima „kako se proverava na produkciji").

## Zašto acceptEdits, a ne auto
`-p` (headless) ne podržava `auto` mod. `acceptEdits` + lista alata
(`npm`, `npx`, `node`, `git`, čitanje) daje sve što promptovi traže. Ako
vidiš u logu da je nešto odbijeno zbog dozvola, sledeći put pokreni sa
`-SkipPermissions`.

## Posle runa (ručno, Jovan)
1. Settings → „Tokeni za uvoz" → Novi token → kopiraj → u PowerShellu
   `Read-Host -AsSecureString` obrazac kao za Places ključ, promenljiva
   `ENIGMA_INGEST_TOKEN`; plus `ENIGMA_INGEST_URL` i `ENIGMA_CONTACT_EMAIL`.
2. `powershell -File tools\generate-leads\install.ps1` (globalni skill).
3. `node tools\generate-leads\run.mjs self-test`.
4. Prvi pravi run: `/generate-leads Beograd frizeri 5 nema` sa `--dry-run`
   u `send` koraku, pa pogledaj `out/<run>/payload.json` pre pravog slanja.
