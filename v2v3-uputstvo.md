# V2 + V3 — uputstvo uz `run-v2v3-gemini.ps1`

## 1. Instalacija Gemini CLI (jednom, ~3 min)

```powershell
npm install -g @google/gemini-cli
gemini          # prvi put otvara browser login (isti Google nalog kao Antigravity), pa izadji sa /quit
gemini -m gemini-3.7-flash -p "reci ok"   # test
```

Ako test javi nepoznat model → pusti `gemini -p "reci ok"` (default model) i u skripti promeni `$Model` na model koji ti CLI prijavi da koristi.

## 2. Pokretanje lanca

```powershell
cd "C:\Users\admin\Desktop\Web Dev Projects\enigmadigital"
git status   # mora biti cist!
powershell -NoProfile -ExecutionPolicy Bypass -File .\run-v2v3-gemini.ps1
```

- Lanac: G7(P12 Meta Ads sync) → G8(P13 ekrani) → G9(P14 Hook Battle) → G10(P15 write komande) → G11(P16 rules) → G12(P17 Google Ads) → G13(P18 new hook) → G14(finalni review). Posle svakog koraka ide automatski hostile review + commit.
- `--yolo` režim znači da Gemini sam odobrava svoje izmene — zato je svaki prompt čvrsto ograničen (FORBIDDEN sekcije) i zato je review posle svakog koraka.
- Ako korak pukne: pogledaj `logs\gemini-v2v3\<ime>.log`, obriši eventualni polu-urađeni nered (`git checkout .` ako treba), i pusti skriptu ponovo — `.done` markeri preskaču završene korake.
- **Skripta NE pushuje.** Kad završi, javi mi — pregledam sve pa ti dam push komandu.

## 3. Šta je namerno kodirano "na čekanju" (bez kredencijala)

| Korak | Čeka | Kad stigne |
|---|---|---|
| G7/G8/G9/G10/G13 (Meta Ads) | Z2.1: Marketing API app + System User token (`ads_read` + `ads_management`) | nalepi token u Settings → Meta Ads |
| G12 (Google Ads) | Basic Access odobrenje (prijava poslata 15.8.) + OAuth refresh token | popuni Settings karticu po README uputstvu |
| Sve write akcije | `ADS_WRITE_ENABLED` env | `npx convex env set --prod ADS_WRITE_ENABLED true` TEK kad testiraš na test kampanji |
| ROAS | Z2.2: odluka LEAD_VALUE_EUR | do tada je CPA/CPL primarna metrika |

## 4. P11 — Pixel + CAPI (NIJE u lancu — drugi repo!)

Ovo ide u **sajt repo** (`enigmait` — onaj gde smo stavili GA tag), pusti ručno u Antigravity (Effort: HIGH):

```
This task is in my agency SITE repo (Next.js, already has GA4 via @next/third-parties). Goal: Meta Pixel + Conversions API so Meta Ads can attribute Lead conversions.

TASK
1. Add Meta Pixel (minimal non-blocking loader or @next/third-parties if it supports it — pick and explain). Do not block rendering; no consent-management scope creep.
2. Fire standard events: PageView (all pages), Lead (contact form success — find the existing form submit success path, the same one that fires the GA4 generate_lead event, and hook there), with a generated event_id for deduplication.
3. Server-side Conversions API mirror for the Lead event (same event_id -> Meta deduplicates) from the form's server action/API route. Env: META_PIXEL_ID, META_CAPI_ACCESS_TOKEN — code-complete even though env values do not exist yet; missing env -> silent no-op, never a user-facing error.
4. Lead value parameter from env LEAD_VALUE_EUR.
5. Document the Meta Events Manager test-event verification steps in README.

Surgical changes only — touch the form flow and layout head, nothing else. npx tsc --noEmit and the build must pass.
```

Preduslov za P11: Meta Pixel napravljen u Events Manager-u (dobijaš META_PIXEL_ID) + CAPI token. To radimo zajedno kad dođe red.

## 5. Servisni promptovi (S1–S3, za svaki dan)

- **S1 review** (pre spajanja veće izmene): identičan `$Review` bloku iz skripte — kopiraj ga iz skripte.
- **S2 debug**: "Bug: [OPIS]. Reproduce first: find the exact failing path before proposing any fix. Check in order: syncRuns error text -> Convex logs -> the provider's raw API response (temporary logging allowed, remove after). Minimal fix, verify by re-running the failing path, clean up. No refactoring beyond the fix." (Effort: HIGH)
- **S3 mali feature**: "Read CLAUDE.md. Small addition: [OPIS]. Find the closest existing analog and mirror its structure. Surgical scope; typecheck + lint must pass; update README only if visible behavior changed." (Effort: MEDIUM)

## 6. Redosled u stvarnosti (moja preporuka)

1. Pusti lanac odmah — sve je kodirano defanzivno, radi i bez ijednog kredencijala.
2. Paralelno/posle: Meta app (Z2.1) + Instagram Login app iz P7 — jedan poziv sa mnom, ~30 min za oba.
3. OpenReply deploy (za P6 podatke).
4. Kad Basic Access stigne: OAuth bootstrap za Google Ads po README-u.
5. LEAD_VALUE_EUR odluka → P11 na sajtu → ROAS proradi.
6. `ADS_WRITE_ENABLED=true` TEK posle ručnog testa pause/resume na test kampanji.
