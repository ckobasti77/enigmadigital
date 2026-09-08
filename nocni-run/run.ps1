# nocni-run/run.ps1 - pokrece GL1->GL5 redom, headless, u ovom repou.
#
# Pokretanje (iz korena repoa):
#   powershell -ExecutionPolicy Bypass -File .\nocni-run\run.ps1
# Opcije:
#   -Samo GL3,GL4          pokreni samo navedene (redosled se cuva)
#   -SkipPermissions       koristi --dangerously-skip-permissions umesto
#                          acceptEdits + liste alata (manje prekida, manje kontrole)
#   -BezPush               dodaje instrukciju da se NE pushuje (samo commit)
#
# Sta radi: za svaki prompt spoji GLn.md + _zajednicki-rep.md, posalje ga u
# `claude -p` sa modelom/effortom iz tabele, loguje u nocni-run/logs/, proveri
# da poslednja linija pocinje sa "GOTOVO", i staje kad padne nesto od cega
# sledeci zavise (GL1 -> svi; GL3 -> GL4).

param(
  [string[]]$Samo = @("GL1","GL2","GL3","GL4","GL5"),
  [switch]$SkipPermissions,
  [switch]$BezPush
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

#  tabela promptova 
$tabela = [ordered]@{
  GL1 = @{ model = "opus";  effort = "high"; nastavlja = $false; zavisi = @() }
  GL2 = @{ model = "opus";  effort = "high"; nastavlja = $false; zavisi = @("GL1") }
  GL3 = @{ model = "fable"; effort = "high"; nastavlja = $false; zavisi = @("GL1") }
  GL4 = @{ model = "fable"; effort = "max";  nastavlja = $true;  zavisi = @("GL3") }
  GL5 = @{ model = "opus";  effort = "max";  nastavlja = $false; zavisi = @("GL1") }
}

#  pre-flight 
foreach ($cmd in @("claude","git","node","npm")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Nema '$cmd' na PATH-u." }
}
if (-not (Test-Path "generate-leads-plan.md")) { throw "Nema generate-leads-plan.md u korenu - pokreni iz repoa enigmadigital." }

$grana = (git branch --show-current).Trim()
if ($grana -ne "main") { throw "Nisi na main (na '$grana'). Prebaci se pa pokreni ponovo." }
$prljavo = git status --porcelain
if ($prljavo) { throw "Radni folder nije cist:`n$prljavo`nKomituj ili stash-uj pa pokreni ponovo." }

git pull --rebase origin main | Out-Null
if ($LASTEXITCODE -ne 0) { throw "git pull nije uspeo." }

New-Item -ItemType Directory -Force -Path "nocni-run\logs","nocni-run\izvestaji" | Out-Null
if (-not (Test-Path "nocni-run\logs\.gitignore")) { Set-Content "nocni-run\logs\.gitignore" "*`n!.gitignore" -Encoding UTF8 }

$rep = Get-Content "nocni-run\_zajednicki-rep.md" -Raw -Encoding UTF8
if ($BezPush) {
  $rep += "`n`nIZUZETAK ZA OVAJ RUN: korak 6 (git push) PRESKOCI. Samo komituj lokalno.`n"
}

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

Write-Host "=== Nocni run - start $($pocetak.ToString('yyyy-MM-dd HH:mm')) - HEAD $startHash ===" -ForegroundColor Cyan

foreach ($id in $tabela.Keys) {
  if ($Samo -notcontains $id) { continue }
  $p = $tabela[$id]

  # zavisnosti
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
  if ($p.nastavlja) { $claudeArgs += "--continue" }
  if ($SkipPermissions) { $claudeArgs += "--dangerously-skip-permissions" }
  else { $claudeArgs += @("--permission-mode", "acceptEdits", "--allowedTools", $alati) }

  Write-Host "--- $id - $($p.model) - effort $($p.effort) - $(if ($p.nastavlja) {'ista sesija'} else {'nova sesija'}) - log $log" -ForegroundColor Cyan
  $t0 = Get-Date

  # stderr (verbose tok) ide u zaseban fajl; u Windows PowerShell 5.1 spajanje
  # 2>&1 uz ErrorActionPreference=Stop rusi skript na prvoj stderr liniji.
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

#  rezime 
$kraj = Get-Date
$rezime = @()
$rezime += "# Nocni run - rezime"
$rezime += ""
$rezime += "Start: $($pocetak.ToString('yyyy-MM-dd HH:mm')) - Kraj: $($kraj.ToString('yyyy-MM-dd HH:mm')) - Trajanje: $([int]($kraj-$pocetak).TotalMinutes) min"
$rezime += "HEAD pre: $startHash - HEAD posle: $((git rev-parse --short HEAD).Trim())"
$rezime += ""
$rezime += "| Prompt | Ishod |"
$rezime += "|---|---|"
foreach ($k in $ishodi.Keys) { $rezime += "| $k | $($ishodi[$k]) |" }
$rezime += ""
$rezime += "## Komitovi u runu"
$rezime += ""
$rezime += (git log --oneline "$startHash..HEAD")
$rezime += ""
$rezime += "Izvestaji po promptu: nocni-run/izvestaji/GL*.md - Logovi: nocni-run/logs/ - Ovaj rezime: nocni-run/logs/REZIME.md"
$rezime -join "`n" | Set-Content "nocni-run\logs\REZIME.md" -Encoding UTF8

Write-Host ""
Write-Host ($rezime -join "`n")
