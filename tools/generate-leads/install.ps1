# ============================================================================
# Globalna instalacija skilla /generate-leads (plan par.10.1)
# ============================================================================
#
# Kopira SKILL.md u %USERPROFILE%\.claude\skills\generate-leads\ i u KOPIJI
# zamenjuje {{REPO_PATH}} apsolutnom putanjom ovog repoa, da skill zna gde je
# run.mjs. Izvor u repou ostaje netaknut, sa placeholderom.
#
# Pokretanje (iz bilo kog foldera):
#   powershell -ExecutionPolicy Bypass -File "<repo>\tools\generate-leads\install.ps1"
#
# NE UPISUJE NIJEDNU TAJNU. Kljucevi i tokeni zive u promenljivama okruzenja
# (`run.mjs proveri-env` ih nabraja), nikad u fajlu skilla.

$ErrorActionPreference = "Stop"

# Koren repoa = dva nivoa iznad ovog fajla (tools\generate-leads\ -> repo).
$alatDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoPath = (Resolve-Path (Join-Path $alatDir "..\..")).Path

$izvor = Join-Path $alatDir "SKILL.md"
if (-not (Test-Path $izvor)) {
    throw "Nema SKILL.md u $alatDir - pokreni skriptu iz repoa."
}

$ciljDir  = Join-Path $env:USERPROFILE ".claude\skills\generate-leads"
$ciljFajl = Join-Path $ciljDir "SKILL.md"

if (-not (Test-Path $ciljDir)) {
    New-Item -ItemType Directory -Path $ciljDir -Force | Out-Null
}

# Kose crte umesto obrnutih: putanja ide u navodnike u komandnim linijama unutar
# SKILL.md, a `C:\Users\...` bi tamo bila escape sekvenca u nekim ljuskama.
$putanjaZaSkill = $repoPath.Replace("\", "/")

$sadrzaj = Get-Content -Path $izvor -Raw -Encoding UTF8
$sadrzaj = $sadrzaj.Replace("{{REPO_PATH}}", $putanjaZaSkill)

if ($sadrzaj -match "\{\{REPO_PATH\}\}") {
    throw "Zamena putanje nije uspela - u kopiji je ostao {{REPO_PATH}}."
}

# UTF8 bez BOM-a: Claude Code cita SKILL.md kao tekst, a BOM ume da zavrsi u
# prvom redu frontmattera i pokvari ga.
$bezBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ciljFajl, $sadrzaj, $bezBom)

Write-Host "Instalirano: $ciljFajl"
Write-Host "Repo:        $putanjaZaSkill"
Write-Host ""
Write-Host "Provera okruzenja (ne prikazuje vrednosti):"
Write-Host "  node `"$putanjaZaSkill/tools/generate-leads/run.mjs`" proveri-env"
Write-Host ""
# Ocena sajta (GL10) trazi Playwright Chromium za snimke ekrana. Instalira se
# JEDNOM po masini; skripta to NE radi sama (moze da potraje i vuce ~150 MB).
$chromiumDir = Join-Path $env:LOCALAPPDATA "ms-playwright"
if (-not (Test-Path $chromiumDir)) {
    Write-Host "Za ocenu sajta (snimci ekrana) instaliraj Chromium JEDNOM, iz korena repoa:"
    Write-Host "  cd `"$repoPath`"; npm install; npx playwright install chromium"
    Write-Host "Bez toga audit-site radi samo sa --samo lighthouse,tehnologije."
    Write-Host ""
}
Write-Host "Skill se poziva sa /generate-leads u novoj Claude Code sesiji."
