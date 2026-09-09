# nocni-run/run-ux.ps1 - pokrece A1->A8 (UI/UX prerada cele aplikacije).
#
# Pokretanje (iz korena repoa):
#   powershell -ExecutionPolicy Bypass -File .\nocni-run\run-ux.ps1
# Opcije:
#   -Samo A1,A2        pokreni samo navedene (redosled se cuva)
#   -SkipPermissions   koristi --dangerously-skip-permissions
#   -BezPush           samo commit, bez push
#
# Modeli: alias `fable` / `opus` / `sonnet` - koja je tacno verzija Opusa
# odlucuje tvoja Claude Code konfiguracija, skript to ne bira.
# Fable se koristi SAMO u A1 i A3 (sistem i glavni ekran).

param(
  [string[]]$Samo = @("A1","A2","A3","A4","A5","A6","A7","A8"),
  [switch]$SkipPermissions,
  [switch]$BezPush
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- tabela faza ---
$tabela = [ordered]@{
  A1 = @{ model = "fable";  effort = "max";  zavisi = @() }
  A2 = @{ model = "opus";   effort = "high"; zavisi = @("A1") }
  A3 = @{ model = "fable";  effort = "high"; zavisi = @("A1") }
  A4 = @{ model = "opus";   effort = "high"; zavisi = @("A3") }
  A5 = @{ model = "opus";   effort = "high"; zavisi = @("A2") }
  A6 = @{ model = "sonnet"; effort = "high"; zavisi = @("A1") }
  A7 = @{ model = "sonnet"; effort = "high"; zavisi = @("A6") }
  A8 = @{ model = "opus";   effort = "high"; zavisi = @("A1") }
}

# --- pre-flight ---
foreach ($cmd in @("claude","git","node","npm")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Nema '$cmd' na PATH-u." }
}
if (-not (Test-Path "app-ux-plan.md")) { throw "Nema app-ux-plan.md u korenu - pokreni iz repoa enigmadigital." }

$grana = (git branch --show-current).Trim()
if ($grana -ne "main") { throw "Nisi na main (na '$grana'). Prebaci se pa pokreni ponovo." }
$prljavo = git status --porcelain
if ($prljavo) { throw "Radni folder nije cist:`n$prljavo`nKomituj ili stash-uj pa pokreni ponovo." }

git pull --rebase origin main | Out-Null
if ($LASTEXITCODE -ne 0) { throw "git pull nije uspeo." }

New-Item -ItemType Directory -Force -Path "nocni-run\logs","nocni-run\izvestaji","nocni-run\ux" | Out-Null

$rep = Get-Content "nocni-run\_zajednicki-rep.md" -Raw -Encoding UTF8
if ($BezPush) { $rep += "`n`nIZUZETAK ZA OVAJ RUN: korak 6 (git push) PRESKOCI. Samo komituj lokalno.`n" }

$alati = @(
  "Read","Edit","Write","MultiEdit","Glob","Grep","WebFetch","WebSearch",
  "Bash(npm:*)","Bash(npx:*)","Bash(node:*)","Bash(git:*)",
  "Bash(ls:*)","Bash(dir:*)","Bash(mkdir:*)","Bash(cat:*)","Bash(type:*)",
  "Bash(head:*)","Bash(tail:*)","Bash(wc:*)","Bash(echo:*)","Bash(rg:*)",
  "Bash(grep:*)","Bash(findstr:*)","Bash(curl:*)"
) -join ","

$ishodi = [ordered]@{}
$pocetak = Get-Date
$startHash = (git rev-parse --short HEAD).Trim()

Write-Host "=== UX run - start $($pocetak.ToString('yyyy-MM-dd HH:mm')) - HEAD $startHash ===" -ForegroundColor Cyan

foreach ($id in $tabela.Keys) {
  if ($Samo -notcontains $id) { continue }
  $p = $tabela[$id]

  $blokiran = $p.zavisi | Where-Object { ($Samo -contains $_) -and ($ishodi[$_] -ne "GOTOVO") }
  if ($blokiran) {
    Write-Host "--- $id preskocen: zavisi od $($blokiran -join ', ') koji nije GOTOVO" -ForegroundColor Yellow
    $ishodi[$id] = "PRESKOCEN"
    continue
  }

  $promptFajl = "nocni-run\$id.md"
  if (-not (Test-Path $promptFajl)) { $ishodi[$id] = "NEMA PROMPTA"; continue }

  $prompt = (Get-Content $promptFajl -Raw -Encoding UTF8) + "`n`n---`n`n" + $rep
  $ts = Get-Date -Format "yyyyMMdd-HHmm"
  $log = "nocni-run\logs\$id-$ts.log"

  $claudeArgs = @("-p", "--model", $p.model, "--effort", $p.effort, "--output-format", "text", "--verbose")
  if ($SkipPermissions) { $claudeArgs += "--dangerously-skip-permissions" }
  else { $claudeArgs += @("--permission-mode", "acceptEdits", "--allowedTools", $alati) }

  Write-Host "--- $id - $($p.model) - effort $($p.effort) - nova sesija - log $log" -ForegroundColor Cyan
  $t0 = Get-Date

  $ErrorActionPreference = "Continue"
  $prompt | & claude @claudeArgs 2> "$log.err" | Tee-Object -FilePath $log | Out-Null
  $exit = $LASTEXITCODE
  $ErrorActionPreference = "Stop"

  $poslednja = (Get-Content $log -Encoding UTF8 | Where-Object { $_ -match '^(GOTOVO|NEUSPEH) ' } | Select-Object -Last 1)
  $trajanje = [int]((Get-Date) - $t0).TotalMinutes

  if ($exit -eq 0 -and $poslednja -like "GOTOVO*") { $ishodi[$id] = "GOTOVO" }
  elseif ($poslednja) { $ishodi[$id] = $poslednja }
  else { $ishodi[$id] = "NEUSPEH (exit $exit, bez zavrsne linije)" }

  Write-Host "    -> $($ishodi[$id]) - $trajanje min" -ForegroundColor $(if ($ishodi[$id] -eq "GOTOVO") {"Green"} else {"Red"})
}

# --- rezime ---
$kraj = Get-Date
$rezime = @()
$rezime += "# UX run - rezime"
$rezime += ""
$rezime += "Start: $($pocetak.ToString('yyyy-MM-dd HH:mm')) - Kraj: $($kraj.ToString('yyyy-MM-dd HH:mm')) - Trajanje: $([int]($kraj-$pocetak).TotalMinutes) min"
$rezime += "HEAD pre: $startHash - HEAD posle: $((git rev-parse --short HEAD).Trim())"
$rezime += ""
$rezime += "| Faza | Ishod |"
$rezime += "|---|---|"
foreach ($k in $ishodi.Keys) { $rezime += "| $k | $($ishodi[$k]) |" }
$rezime += ""
$rezime += "## Komitovi u runu"
$rezime += ""
$rezime += (git log --oneline "$startHash..HEAD")
$rezime += ""
$rezime += "Izvestaji: nocni-run/izvestaji/A*.md - Snimci: nocni-run/ux/ - Logovi: nocni-run/logs/"
$rezime -join "`n" | Set-Content "nocni-run\logs\REZIME-UX.md" -Encoding UTF8

Write-Host ""
Write-Host ($rezime -join "`n")
