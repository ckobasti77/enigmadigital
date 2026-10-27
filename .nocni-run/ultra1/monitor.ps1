<#
  =====================================================================
   NOCNI RUN - monitor (samo cita: log, state.json, git status)
  ---------------------------------------------------------------------
   Pokretanje: dupli klik na monitor.cmd, dok run radi u drugom prozoru.
   Ne pise nista, ne dira git index (--no-optional-locks), ne moze da
   pokvari run. Izlaz: Ctrl+C.
   Cist ASCII namerno (Windows PowerShell 5.1).
  =====================================================================
#>
param(
  [int] $Every = 5
)

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$RunDir = $PSScriptRoot
if (-not $RunDir) { $RunDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$LogDir    = Join-Path $RunDir "logs"
$StateFile = Join-Path $RunDir "state.json"
$StepsFile = Join-Path $RunDir "steps.json"
$Bar = "=" * 72

function Read-Utf8([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { return "" }
  try { return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) } catch { return "" }
}

$RepoPath = $RunDir
for ($i = 0; $i -lt 15; $i++) {
  if (Test-Path -LiteralPath (Join-Path $RepoPath ".git")) { break }
  $p = Split-Path -Parent $RepoPath
  if (-not $p -or $p -eq $RepoPath) { break }
  $RepoPath = $p
}

$Name = "NOCNI RUN"
try { $cfg = (Read-Utf8 (Join-Path $RunDir "config.json")) | ConvertFrom-Json; if ($cfg.name) { $Name = [string]$cfg.name } } catch { }
try { $Host.UI.RawUI.WindowTitle = "MONITOR - $Name" } catch { }

$TotalSteps = 0
try { $ps = (Read-Utf8 $StepsFile) | ConvertFrom-Json; $TotalSteps = @($ps | ForEach-Object { $_ }).Count } catch { }

function Parse-Clock([string]$hms) {
  # Log pise samo HH:mm:ss. Ako ispadne u buducnosti, bilo je juce.
  $t = [datetime]::ParseExact($hms, "HH:mm:ss", $null)
  $d = (Get-Date).Date.Add($t.TimeOfDay)
  if ($d -gt (Get-Date).AddMinutes(5)) { $d = $d.AddDays(-1) }
  return $d
}

function Human-Age([timespan]$ts) {
  if ($ts.TotalSeconds -lt 90) { return ("{0:N0} s" -f $ts.TotalSeconds) }
  if ($ts.TotalMinutes -lt 90) { return ("{0:N0} min" -f $ts.TotalMinutes) }
  return ("{0:N1} h" -f $ts.TotalHours)
}

function Short([string]$s, [int]$n) {
  if (-not $s) { return "" }
  $s = $s -replace '\\n', ' ' -replace '\\t', ' ' -replace '\\"', '"' -replace '\\\\', '\'
  $s = ($s -replace '\s+', ' ').Trim()
  if ($s.Length -gt $n) { return $s.Substring(0, $n - 3) + "..." }
  return $s
}

# Poslednji alat koji je agent pozvao (iz stream-json loga claude -p).
function Last-Action([string]$jsonl) {
  try { $tail = @(Get-Content -LiteralPath $jsonl -Tail 150 -Encoding UTF8 -ErrorAction Stop) } catch { return "" }
  for ($i = $tail.Count - 1; $i -ge 0; $i--) {
    $l = $tail[$i]
    if ($l -notmatch '"type":"assistant"') { continue }
    $ms = [regex]::Matches($l, '"name":"([^"]+)","input":\{(.{0,500})')
    if ($ms.Count -gt 0) {
      $m = $ms[$ms.Count - 1]
      $nm = $m.Groups[1].Value -replace '^mcp__playwright__', 'playwright:'
      $inp = $m.Groups[2].Value
      $detail = ""
      foreach ($k in @("description", "command", "file_path", "pattern", "url", "path", "prompt", "skill")) {
        $mm = [regex]::Match($inp, '"' + $k + '":"((?:[^"\\]|\\.)*)')
        if ($mm.Success) { $detail = $mm.Groups[1].Value; break }
      }
      return (Short "$nm  $detail" 100)
    }
    $mt = [regex]::Match($l, '"type":"text","text":"((?:[^"\\]|\\.){1,300})')
    if ($mt.Success) { return (Short ("pise: " + $mt.Groups[1].Value) 100) }
  }
  return ""
}

# Poslednje dirnuti fajlovi (git status bez zakljucavanja indexa).
function Touched-Files {
  $out = @()
  try {
    $st = @(& git -C $RepoPath --no-optional-locks status --porcelain 2>$null)
    foreach ($l in $st) {
      if ("$l".Length -lt 4) { continue }
      $rel = "$l".Substring(3).Trim('"')
      if ($rel -match ' -> ') { $rel = ($rel -split ' -> ')[-1] }
      $full = Join-Path $RepoPath $rel
      if (Test-Path -LiteralPath $full -PathType Leaf) { $out += Get-Item -LiteralPath $full }
    }
  } catch { }
  return @($out | Sort-Object LastWriteTime -Descending | Select-Object -First 6)
}

if (-not (Test-Path -LiteralPath $LogDir)) { Write-Host "Nema logs foldera - run jos nije startovan. Cekam..." -ForegroundColor DarkGray }

while ($true) {
  $logs = @(Get-ChildItem -LiteralPath $LogDir -Filter "run-*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime)
  if ($logs.Count -eq 0) { Start-Sleep -Seconds $Every; continue }
  $log = $logs[$logs.Count - 1]

  # Zavrseni koraci iz SVIH logova (ponovna pokretanja nastavljaju), trenutni iz najnovijeg.
  $done = [ordered]@{}
  foreach ($lf in $logs) {
    foreach ($l in @(Get-Content -LiteralPath $lf.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)) {
      if ($l -match '^\[\d\d:\d\d:\d\d\]\s+(\S+) -> (\w+)\s+\((\d+) min, (\d+) poziva, USD ([\d.,]+)\)') {
        $done[$Matches[1]] = [pscustomobject]@{ Korak = $Matches[1]; Status = $Matches[2]; Minuta = [int]$Matches[3]; Poziva = [int]$Matches[4]; USD = $Matches[5] }
      }
    }
  }

  $lines = @(Get-Content -LiteralPath $log.FullName -Encoding UTF8 -ErrorAction SilentlyContinue)
  $curId = ""; $curName = ""; $curFrom = $null
  $waitMsg = ""; $stopMsg = ""; $finished = $false; $phase = ""
  foreach ($l in $lines) {
    if ($l -match '^\[(\d\d:\d\d:\d\d)\]\s+(\S+)\s+\|\s+(.+?)\s*$') {
      $curId = $Matches[2]; $curName = $Matches[3]; $curFrom = Parse-Clock $Matches[1]; $waitMsg = ""; $phase = ""; $stopMsg = ""; $finished = $false; continue
    }
    if ($l -match '^\[\d\d:\d\d:\d\d\]\s+(\S+) -> ') { $curId = ""; $curFrom = $null; $waitMsg = ""; continue }
    if ($l -match 'LIMIT: cekam (\d+) min \(do (\d\d:\d\d)\)') { $waitMsg = "LIMIT potrosen - ceka reset do $($Matches[2]), pa nastavlja istu sesiju"; continue }
    if ($l -match 'MREZA pala \(pokusaj (\d+)/(\d+)\)')        { $waitMsg = "mreza pala, pokusaj $($Matches[1])/$($Matches[2]) - ceka"; continue }
    if ($l -match '(LIMIT|MREZA): nastavljam')                  { $waitMsg = ""; continue }
    if ($l -match 'LOGIN: claude CLI nije prijavljen')          { $waitMsg = "ceka prijavu: u terminalu pokreni 'claude' pa /login"; continue }
    if ($l -match 'LOGIN: prijava radi')                        { $waitMsg = ""; continue }
    if ($l -match 'SELFTEST:')                                  { $phase = "selftest (provera claude CLI-ja)"; continue }
    if ($l -match 'BASELINE: pustam')                           { $phase = "baseline (pocetne provere)"; continue }
    if ($l -match 'BASELINE: pada')                             { $phase = ""; continue }
    if ($l -match ': provera \(')                               { $phase = "runner pusta provere posle koraka"; continue }
    if ($l -match 'popravka (\d+)/(\d+)')                       { $phase = "agent popravlja pale provere ($($Matches[1])/$($Matches[2]))"; continue }
    if ($l -match '\] (STOP: .+)$')                             { $stopMsg = $Matches[1]; continue }
    if ($l -match '\] (STOP fajl nadjen.+)$')                   { $stopMsg = $Matches[1]; continue }
    if ($l -match '\] (BUDZET dostignut.+)$')                   { $stopMsg = $Matches[1]; continue }
    if ($l -match '\] (KRAJ POKRETANJA.+)$')                    { $stopMsg = $Matches[1]; continue }
    if ($l -match '^\[\d\d:\d\d:\d\d\]\s+GOTOVO')               { $finished = $true; continue }
  }

  $usd = $null
  try { $st = (Read-Utf8 $StateFile) | ConvertFrom-Json; $usd = [double]$st.totalUsd } catch { }
  if ($null -eq $usd) { $usd = 0.0; foreach ($d in $done.Values) { $usd += [double]($d.USD -replace ',', '') } }

  $jl = Get-ChildItem -LiteralPath $LogDir -Filter "*.jsonl" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $touched = Touched-Files

  $finishedCount = @($done.Values | Where-Object { $_.Status -ne 'GRESKA' -and $_.Korak -ne 'start' }).Count
  $w = 30; $fill = 0; if ($TotalSteps -gt 0) { $fill = [math]::Min($w, [math]::Round($w * $finishedCount / $TotalSteps)) }
  $barTxt = "[" + ("#" * $fill) + ("." * ($w - $fill)) + "]"

  Clear-Host
  Write-Host $Bar -ForegroundColor DarkGray
  Write-Host " MONITOR - $Name   $($log.Name)" -ForegroundColor Cyan
  Write-Host (" {0}   osvezavanje na {1}s   Ctrl+C za izlaz" -f (Get-Date -Format 'HH:mm:ss'), $Every) -ForegroundColor DarkGray
  Write-Host $Bar -ForegroundColor DarkGray
  Write-Host (" {0} {1}/{2} koraka   ukupno USD {3}" -f $barTxt, $finishedCount, $TotalSteps, $usd.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)) -ForegroundColor White
  Write-Host ""

  if ($done.Count -gt 0) {
    Write-Host " ZAVRSENO" -ForegroundColor White
    foreach ($d in $done.Values) {
      $c = "Green"
      if ($d.Status -eq "DELIMICNO") { $c = "Cyan" }
      if ($d.Status -eq "BLOKADA")   { $c = "Yellow" }
      if ($d.Status -eq "GRESKA")    { $c = "Red" }
      Write-Host ("  {0,-6} {1,-10} {2,4} min   USD {3,8}   poziva {4}" -f $d.Korak, $d.Status, $d.Minuta, $d.USD, $d.Poziva) -ForegroundColor $c
    }
    Write-Host ""
  }

  if ($stopMsg) {
    Write-Host " RUN JE STAO" -ForegroundColor Red
    Write-Host "  $stopMsg" -ForegroundColor Red
    Write-Host ""
  } elseif ($finished) {
    Write-Host " RUN JE GOTOV. Pogledaj izvestaj i progress u docs\" -ForegroundColor Green
    Write-Host ""
  } elseif ($curId) {
    Write-Host " U TOKU" -ForegroundColor Yellow
    Write-Host "  $curId  -  $curName" -ForegroundColor Yellow
    Write-Host "  traje $(Human-Age ((Get-Date) - $curFrom))" -ForegroundColor DarkGray
    if ($phase)   { Write-Host "  $phase" -ForegroundColor DarkGray }
    if ($waitMsg) { Write-Host "  $waitMsg" -ForegroundColor Magenta }
    Write-Host ""
  } else {
    if ($phase) { Write-Host " PRIPREMA: $phase" -ForegroundColor Yellow }
    elseif ($waitMsg) { Write-Host " $waitMsg" -ForegroundColor Magenta }
    else { Write-Host " Cekam pocetak sledeceg koraka..." -ForegroundColor DarkGray }
    Write-Host ""
  }

  if ($jl -and -not $finished) {
    $age = (Get-Date) - $jl.LastWriteTime
    $act = Last-Action $jl.FullName
    $c = "DarkGray"; if ($age.TotalMinutes -lt 3) { $c = "Green" }
    Write-Host " AGENT  (poslednji znak zivota pre $(Human-Age $age), $($jl.Name))" -ForegroundColor White
    if ($act) { Write-Host "  $act" -ForegroundColor $c }
    Write-Host ""
  }

  if ($touched.Count -gt 0) {
    Write-Host " POSLEDNJE DIRNUTI FAJLOVI (necommitovani)" -ForegroundColor White
    foreach ($f in $touched) {
      $age = (Get-Date) - $f.LastWriteTime
      $rel = $f.FullName.Substring($RepoPath.Length).TrimStart('\', '/')
      $c = "DarkGray"; if ($age.TotalMinutes -lt 2) { $c = "Green" }
      Write-Host ("  {0,-9} {1}" -f (Human-Age $age), $rel) -ForegroundColor $c
    }
    Write-Host ""
  }

  Write-Host " DNEVNIK (poslednjih 10 redova)" -ForegroundColor White
  foreach ($t in ($lines | Where-Object { $_ } | Select-Object -Last 10)) { Write-Host "  $t" -ForegroundColor DarkGray }

  Start-Sleep -Seconds $Every
}
