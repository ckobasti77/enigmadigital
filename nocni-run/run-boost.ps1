# nocni-run/run-boost.ps1 - pusta UI/UX boost B0 -> B10 bez nadzora (ui-boost-plan.md, par. 11).
#
# Pokretanje (iz korena repoa, obican PowerShell):
#   powershell -ExecutionPolicy Bypass -File .\nocni-run\run-boost.ps1
#
# Opcije:
#   -Samo B2,B3          pokreni samo navedene faze (zarez bez razmaka; redosled ostaje B0..B10)
#   -Od B4               pokreni od te faze do kraja
#   -CekajPlan           posle plan koraka (B2, B4) stani i cekaj tvoje odobrenje
#   -BezPush             samo commit; nista ne ide na produkciju
#   -SkipPermissions     bypassPermissions umesto auto moda (poslednja opcija)
#   -BezProvereModela    preskoci probni poziv modela i auto moda
#   -BezNastavka         ne salji "nastavi" kad faza stane bez zavrsetka
#   -BezOdbrojavanja     ne cekaj 10 s pre starta
#   -Ispocetka           zanemari prethodni run (inace se nastavlja gde je stao)
#   -ClaudeExe <putanja> koji claude.exe da koristi (inace ga runner sam nalazi)
#   -MaxTurns 800        gornja granica turnova po jednom pozivu
#   -MaxCekanjeSati 10   najduze cekanje na reset limita; duze = run staje
#
# Tabela faza ispod je jedini izvor za model / effort / mod / sesiju:
#   model, effort   -> --model, --effort
#   mod auto        -> --permission-mode auto
#   mod plan        -> 1) --permission-mode plan: Claude samo ispise plan
#                      2) ista sesija, auto mod: "plan je odobren, sprovedi ga"
#   mod goal        -> prompt pocinje sa /goal (Claude radi dok uslov nije
#                      ispunjen); ako faza ne zavrsi, ista sesija dobija kratak
#                      /goal uslov da dovrsi
#   sesija nova     -> --session-id <novi uuid>
#   sesija B4       -> --resume <sesija faze B4> (nastavak iste sesije)
#
# Faza je GOTOVO kad postoji commit sa "[ID]" i (linija "GOTOVO ID" ili
# izvestaj nocni-run/izvestaji/ID.md). Posle uspesne faze runner pushuje
# (osim uz -BezPush). Neuspela faza: izmene idu u git stash, njeni commitovi
# na granu boost-neuspeh/ID-..., main se vraca na stanje pre faze, a faze koje
# od nje zavise se preskacu - tako nista nedovrseno ne ode na produkciju.
#
# Limit pretplate ("You've hit your limit"): runner ceka do reseta i nastavlja
# istu sesiju. Greska API-ja ili pad: do 3 nova pokusaja sa pauzom.
# Ponovno pokretanje iste komande (posle restarta, limita, Ctrl+C) nastavlja:
# faze koje su vec GOTOVO se preskacu, a prekinuta faza nastavlja svoju sesiju.
# Claude u fazama ne sme: git push, convex deploy/dev/env/run, brisanje grana.

param(
  [string[]]$Samo = @(),
  [string]$Od = "",
  [switch]$CekajPlan,
  [switch]$BezPush,
  [switch]$SkipPermissions,
  [switch]$BezProvereModela,
  [switch]$BezNastavka,
  [switch]$BezOdbrojavanja,
  [switch]$Ispocetka,
  [string]$ClaudeExe = "",
  [int]$MaxTurns = 800,
  [int]$MaxCekanjeSati = 10,
  [int]$PauzaGreske = 300,
  [int]$RezervaLimita = 120,
  [int]$MaxLimitCekanja = 8
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = $utf8

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
# git nikad ne sme da stane i ceka lozinku usred noci (push tada samo javi gresku).
$env:GIT_TERMINAL_PROMPT = "0"
# Claude Code se ne azurira sam dok run traje (na Windows-u update usred rada moze da obrise claude.exe).
$env:DISABLE_AUTOUPDATER = "1"

# --- modeli -----------------------------------------------------------------
# Opus 5.5 za sve, Sonnet 5.5 samo za sitan posao (B0 priprema).
# Ako puno ime ne prodje probu, runner sam prelazi na alias "opus".
$OPUS = "claude-opus-5-5"
$SONNET = "sonnet"

# --- tabela faza ------------------------------------------------------------
$faze = [ordered]@{
  B0  = @{ naziv = "Priprema: A9 + vizuelna petlja";         model = $SONNET; effort = "high";  mod = "auto"; sesija = "nova"; zavisi = @() }
  B1  = @{ naziv = "Fiksevi F1-F15";                          model = $OPUS;   effort = "high";  mod = "goal"; sesija = "nova"; zavisi = @("B0") }
  B2  = @{ naziv = "Dizajn sistem 2.0";                       model = $OPUS;   effort = "max";   mod = "plan"; sesija = "nova"; zavisi = @("B0") }
  B3  = @{ naziv = "Ljuska: navigacija";                      model = $OPUS;   effort = "xhigh"; mod = "auto"; sesija = "nova"; zavisi = @("B2") }
  B4  = @{ naziv = "Napredak - backend";                      model = $OPUS;   effort = "xhigh"; mod = "plan"; sesija = "nova"; zavisi = @("B0") }
  B5  = @{ naziv = "Napredak - UI";                           model = $OPUS;   effort = "xhigh"; mod = "auto"; sesija = "B4";   zavisi = @("B3", "B4") }
  B6  = @{ naziv = "Komandni centar + Leadovi Danas + Rezim"; model = $OPUS;   effort = "max";   mod = "auto"; sesija = "nova"; zavisi = @("B5") }
  B7  = @{ naziv = "Leadovi: Tabela, Profil, Uvoz, Mapa";     model = $OPUS;   effort = "xhigh"; mod = "auto"; sesija = "B6";   zavisi = @("B6") }
  B8  = @{ naziv = "Kanali";                                  model = $OPUS;   effort = "high";  mod = "auto"; sesija = "nova"; zavisi = @("B3") }
  B9  = @{ naziv = "Analitika i ostalo";                      model = $OPUS;   effort = "high";  mod = "auto"; sesija = "B8";   zavisi = @("B8") }
  B10 = @{ naziv = "Zavrsna provera i polish";                model = $OPUS;   effort = "xhigh"; mod = "goal"; sesija = "nova"; zavisi = @("B7", "B9") }
}

$logDir = "nocni-run/logs/boost"
$planDir = "nocni-run/planovi"
$stanjeFajl = "$logDir/stanje.json"

# Fajlovi runnera i plana: runner ih komituje pre B0, da ih stash nikad ne odnese.
$INFRA = @("ui-boost-plan.md", "nocni-run/run-boost.ps1", "nocni-run/_boost-headless.md", "nocni-run/_boost-plan-korak.md", "nocni-run/_boost-goal.md")
foreach ($k in $faze.Keys) { $INFRA += "nocni-run/$k.md" }

$GOAL_NASTAVAK = "/goal Svi uslovi iz prvog /goal zadatka ove sesije su ispunjeni i dokazani u ovom razgovoru, postoji commit sa [<ID>], i poslednja linija je GOTOVO <ID> ili NEUSPEH <ID> sa razlogom; ili stani posle 25 turnova i napisi NEUSPEH <ID> sa tacnim spiskom onoga sto fali."
$NASTAVAK_PREKID = "Rad na fazi <ID> je bio prekinut (limit ili greska API-ja), a sada se nastavlja. Nastavi tacno tamo gde si stao, po zadatku i pravilima iz ove sesije. Na kraju commit sa [<ID>] po par. 12 plana, pa poslednja linija GOTOVO <ID>: <hash> ili NEUSPEH <ID>: <razlog>."
$NASTAVAK_PLAN = "Pravljenje plana za fazu <ID> je bilo prekinuto (limit ili greska API-ja). Nastavi istrazivanje gde si stao i kao POSLEDNJU poruku ispisi CEO plan u markdownu. Ne pozivaj ExitPlanMode i nista ne menjaj."

# Sta Claude u fazama nikad ne sme (deny pravila vaze u svim modovima).
$zabrane = @("git push *", "git reset --hard *", "git clean *", "git branch -d *", "git branch -D *", "git worktree remove *",
  "npx convex deploy *", "npx convex dev *", "npx convex env *", "npx convex run *", "npx convex import *",
  "convex deploy *", "convex dev *", "npm run deploy:convex *", "npm run convex:dev *", "vercel *", "npx vercel *")
$ZABRANJENO = (@($zabrane | ForEach-Object { "Bash($_)" }) + @($zabrane | ForEach-Object { "PowerShell($_)" })) -join ","

# Lista alata samo za rezervni acceptEdits mod (kad auto mod nije dostupan).
$ALATI_ACCEPTEDITS = @(
  "Read", "Edit", "Write", "MultiEdit", "Glob", "Grep", "WebFetch", "WebSearch", "Skill", "Agent",
  "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "TodoWrite",
  "Bash(npm:*)", "Bash(npx:*)", "Bash(node:*)", "Bash(git:*)", "Bash(python:*)", "Bash(py:*)",
  "Bash(ls:*)", "Bash(dir:*)", "Bash(mkdir:*)", "Bash(cat:*)", "Bash(type:*)", "Bash(head:*)",
  "Bash(tail:*)", "Bash(wc:*)", "Bash(echo:*)", "Bash(rg:*)", "Bash(grep:*)", "Bash(findstr:*)",
  "Bash(curl:*)", "Bash(taskkill:*)", "Bash(tasklist:*)", "Bash(netstat:*)"
) -join ","

# --- pomocne funkcije -------------------------------------------------------
function Pisi([string]$tekst, [string]$boja = "Gray") { Write-Host $tekst -ForegroundColor $boja }

function Snimi-Tekst([string]$putanja, [string]$tekst) {
  $pun = Join-Path $root $putanja
  $dir = Split-Path -Parent $pun
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  [System.IO.File]::WriteAllText($pun, $tekst, $utf8)
}

function Procitaj([string]$putanja) {
  return [System.IO.File]::ReadAllText((Join-Path $root $putanja), [System.Text.Encoding]::UTF8)
}

function Git-Komanda([string[]]$argumenti) {
  $stari = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $izlaz = & git @argumenti 2>&1 | ForEach-Object { [string]$_ }
  $kod = $LASTEXITCODE
  $ErrorActionPreference = $stari
  return @{ kod = $kod; izlaz = ($izlaz -join "`n") }
}

function Skrati([string]$s, [int]$n) {
  if (-not $s) { return "" }
  $s = ($s -replace "\s+", " ").Trim()
  if ($s.Length -gt $n) { return $s.Substring(0, $n - 3) + "..." }
  return $s
}

function Opis-Alata($c) {
  $ime = [string]$c.name
  $u = $c.input
  $d = ""
  if ($u) {
    if ($u.command) { $d = [string]$u.command }
    elseif ($u.file_path) { $d = [string]$u.file_path }
    elseif ($u.pattern) { $d = [string]$u.pattern }
    elseif ($u.skill) { $d = [string]$u.skill }
    elseif ($u.url) { $d = [string]$u.url }
    elseif ($u.description) { $d = [string]$u.description }
  }
  $d = Skrati $d 100
  if ($d) { return "$ime  $d" }
  return $ime
}

function Verzija-Claude {
  $stari = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $v = (& $script:CLAUDE --version 2>&1 | Out-String)
  $ErrorActionPreference = $stari
  $m = [regex]::Match($v, "(\d+)\.(\d+)\.(\d+)")
  if (-not $m.Success) { return @{ tekst = $v.Trim(); broj = 0 } }
  $broj = [int]$m.Groups[1].Value * 1000000 + [int]$m.Groups[2].Value * 1000 + [int]$m.Groups[3].Value
  return @{ tekst = $m.Value; broj = $broj }
}

function Ver([int]$a, [int]$b, [int]$c) { return $a * 1000000 + $b * 1000 + $c }

function Za-Prikaz([string[]]$argumenti) {
  $out = @()
  $sakrij = $false
  foreach ($a in $argumenti) {
    if ($sakrij) { $out += "<lista>"; $sakrij = $false; continue }
    if ($a -eq "--allowedTools" -or $a -eq "--disallowedTools") { $sakrij = $true }
    $out += $a
  }
  return ($out -join " ")
}

function Unix-U-Vreme($ts) {
  if (-not $ts) { return $null }
  try {
    $t = [double]$ts
    if ($t -gt 100000000000) { $t = $t / 1000 }
    return [DateTimeOffset]::FromUnixTimeSeconds([long]$t).LocalDateTime
  } catch { return $null }
}

# Pokrece claude -p; $ulaz ide na stdin. Cita stream-json i pamti sta treba.
function Pokreni-Claude([string]$id, [string]$korak, [string]$ulaz, [string[]]$argumenti) {
  $ts = Get-Date -Format "yyyyMMdd-HHmmss"
  $baza = "$logDir/$id-$korak-$ts"
  $stanje = @{ rezultat = $null; init = $null; alati = 0; goal = $false; limit = $false; resetsAt = $null; limitTip = ""; apiGreska = "" }
  $sw = New-Object System.IO.StreamWriter((Join-Path $root "$baza.jsonl"), $false, $utf8)
  $obrada = {
    $l = [string]$_
    $sw.WriteLine($l)
    if ($l.Length -gt 0 -and $l[0] -eq "{" -and -not $l.StartsWith('{"type":"stream_event"') -and -not $l.StartsWith('{"type":"user"')) {
      $e = $null
      try { $e = $l | ConvertFrom-Json } catch { $e = $null }
      if ($null -ne $e) {
        if ($e.type -eq "assistant") {
          if ($e.message -and $e.message.content) {
            foreach ($c in $e.message.content) {
              if ($c.type -eq "tool_use") {
                $stanje.alati++
                Write-Host ("    {0}  {1}" -f (Get-Date -Format "HH:mm"), (Opis-Alata $c)) -ForegroundColor DarkGray
              }
              elseif ($c.type -eq "text" -and $c.text -and -not $e.is_api_error_message) {
                if (([string]$c.text).StartsWith("Goal set:")) { $stanje.goal = $true }
                Write-Host ("    {0}  > {1}" -f (Get-Date -Format "HH:mm"), (Skrati ([string]$c.text) 160)) -ForegroundColor Gray
              }
            }
          }
          if ($e.is_api_error_message) {
            $stanje.apiGreska = [string]$e.api_error
            if ($e.api_error -eq "usage_limit_reached" -or $e.error -eq "rate_limit") { $stanje.limit = $true }
            $ri = $null
            if ($e.api_error_params) { $ri = $e.api_error_params.rate_limit_info }
            if ($ri -and $ri.resetsAt) { $stanje.resetsAt = $ri.resetsAt; $stanje.limitTip = [string]$ri.rateLimitType }
          }
        }
        elseif ($e.type -eq "rate_limit_event") {
          $ri = $e.rate_limit_info
          if ($ri -and $ri.status -eq "rejected") {
            $stanje.limit = $true
            if ($ri.resetsAt) { $stanje.resetsAt = $ri.resetsAt; $stanje.limitTip = [string]$ri.rateLimitType }
          }
        }
        elseif ($e.type -eq "active_goal") { if ($null -ne $e.value) { $stanje.goal = $true } }
        elseif ($e.type -eq "system" -and $e.subtype -eq "init") { $stanje.init = $e }
        elseif ($e.type -eq "result") { $stanje.rezultat = $e }
      }
    }
  }
  $errFajl = Join-Path $root "$baza.err"
  # claude.exe moze da nestane usred runa (reinstalacija, update) - tada nadji drugi koji radi
  if (-not (Test-Path $script:CLAUDE -PathType Leaf)) {
    $novi = Nadji-Claude
    if ($novi.exe) {
      Pisi ("    claude.exe vise ne postoji (" + $script:CLAUDE + ") - prelazim na " + $novi.exe + " (" + $novi.verzija + ")") "Yellow"
      $script:CLAUDE = $novi.exe
    }
  }
  Pisi ("  > {0} [{1}] claude {2}" -f $id, $korak, (Za-Prikaz $argumenti)) "DarkCyan"
  $kod = -1
  $stari = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $ulaz | & $script:CLAUDE @argumenti 2> $errFajl | ForEach-Object -Process $obrada
    $kod = $LASTEXITCODE
  }
  catch {
    # npr. claude.exe ne postoji: ne rusi runner, poziv se racuna kao prekid i ponavlja se
    $kod = -1
    $poruka = "Pokretanje claude-a nije uspelo (" + $script:CLAUDE + "): " + $_.Exception.Message
    try { [System.IO.File]::AppendAllText($errFajl, $poruka + "`n", $utf8) } catch { }
    Pisi ("    " + $poruka) "Red"
  }
  finally {
    $sw.Close()
    $ErrorActionPreference = $stari
  }
  if ($stanje.rezultat -and $stanje.rezultat.result) { Snimi-Tekst "$baza.txt" ([string]$stanje.rezultat.result) }
  return @{ kod = $kod; rezultat = $stanje.rezultat; init = $stanje.init; alati = $stanje.alati; goal = $stanje.goal;
    limit = $stanje.limit; resetsAt = $stanje.resetsAt; limitTip = $stanje.limitTip; apiGreska = $stanje.apiGreska; baza = $baza }
}

function Tekst-Rezultata($poziv) {
  if ($poziv -and $poziv.rezultat -and $poziv.rezultat.result) { return [string]$poziv.rezultat.result }
  return ""
}

# Kratak opis greske poziva: tekst rezultata, greske iz rezultata ili prvi red .err fajla.
function Opis-Greske($poziv) {
  $t = Tekst-Rezultata $poziv
  if (-not $t -and $poziv.rezultat -and $poziv.rezultat.errors) { $t = @($poziv.rezultat.errors) -join " " }
  if (-not $t -and $poziv.baza) {
    $f = Join-Path $root "$($poziv.baza).err"
    if (Test-Path $f) {
      $red = Get-Content -Path $f -TotalCount 20 -ErrorAction SilentlyContinue | Where-Object { $_ -and $_.Trim() } | Select-Object -First 1
      if ($red) { $t = [string]$red }
    }
  }
  if (-not $t) { $t = "bez poruke (izlazni kod $($poziv.kod))" }
  return (Skrati $t 160)
}

function Sesija-Iz-Poziva($poziv, [string]$staraSesija) {
  if ($poziv -and $poziv.rezultat -and $poziv.rezultat.session_id) { return [string]$poziv.rezultat.session_id }
  if ($poziv -and $poziv.init -and $poziv.init.session_id) { return [string]$poziv.init.session_id }
  return $staraSesija
}

# Poziv je "prekinut" kad nije stigao do kraja: nema rezultata, ili je rezultat
# greska (limit, API, pad). Kraj zbog --max-turns nije prekid.
function Je-Prekid($poziv) {
  $r = $poziv.rezultat
  if (-not $r) { return $true }
  if (-not $r.is_error) { return $false }
  if ($r.subtype -eq "error_max_turns" -or $r.subtype -eq "error_max_budget_usd") { return $false }
  return $true
}

function Je-Limit($poziv) {
  if ($poziv.limit) { return $true }
  return ((Tekst-Rezultata $poziv) -match "(?i)hit your .{0,30}limit|usage limit|limit reached")
}

function Je-Prijava($poziv) {
  $st = 0
  if ($poziv.rezultat -and $poziv.rezultat.api_error_status) { $st = [int]$poziv.rezultat.api_error_status }
  if ($st -eq 401 -or $st -eq 403) { return $true }
  $t = (Tekst-Rezultata $poziv) + " " + $poziv.apiGreska
  return ($t -match "(?i)invalid api key|invalid x-api-key|run /login|please log ?in|not logged in|oauth token (has )?expired|authentication_error")
}

function Nova-Sesija([string]$sid, [string]$id) {
  if ($IMA_NAME) { return @("--session-id", $sid, "--name", "boost-$id") }
  return @("--session-id", $sid)
}

function Nema-Sesije($poziv) {
  if (-not $poziv.rezultat -or $poziv.init) { return $false }
  $g = @($poziv.rezultat.errors) -join " "
  return ($g -match "No conversation found")
}

# Pokrece poziv i, ako je prekinut, ceka i nastavlja istu sesiju.
# Vraca @{ poziv; sid }. Moze da postavi $script:zaustavi (run staje).
# -NovaAkoNema: ako sesija za --resume ne postoji, isti ulaz ide u novu sesiju.
function Pozovi-Uporno([string]$id, [string]$korak, [string]$ulaz, [string[]]$osnova, [string[]]$sesijaArgs, [string[]]$modArgs, [string]$sid, [string]$nastavak, [switch]$NovaAkoNema) {
  $poziv = Pokreni-Claude $id $korak $ulaz ($osnova + $sesijaArgs + $modArgs)
  if ((Nema-Sesije $poziv) -and $NovaAkoNema) {
    $sid = [guid]::NewGuid().ToString()
    $sesijaArgs = Nova-Sesija $sid $id
    Pisi "    Sesija za nastavak ne postoji - $id krece u novoj sesiji $sid." "Yellow"
    $poziv = Pokreni-Claude $id "$korak-nova" $ulaz ($osnova + $sesijaArgs + $modArgs)
  }
  $sid = Sesija-Iz-Poziva $poziv $sid
  $limiti = 0
  $greske = 0
  $n = 0
  while (Je-Prekid $poziv) {
    $n++
    if (Nema-Sesije $poziv) { Pisi "    Sesija $sid ne postoji - ne mogu da je nastavim." "Red"; break }
    if (Je-Prijava $poziv) {
      $script:zaustavi = "Claude nije prijavljen ili je kljuc nevazeci: " + (Opis-Greske $poziv) + " - pokreni 'claude' i uloguj se, pa ponovo istu komandu (nastavlja gde je stao)"
      break
    }
    $sekundi = 0
    if (Je-Limit $poziv) {
      $limiti++
      if ($limiti -gt $MaxLimitCekanja) { Pisi "    Limit $limiti. put zaredom - odustajem od faze." "Red"; break }
      $reset = Unix-U-Vreme $poziv.resetsAt
      if ($reset) { $sekundi = [int]($reset - (Get-Date)).TotalSeconds + $RezervaLimita }
      else { $sekundi = 1800 }
      if ($sekundi -lt 60) { $sekundi = 60 }
      if ($sekundi -gt $MaxCekanjeSati * 3600) {
        $kad = "nepoznato"
        if ($reset) { $kad = $reset.ToString("yyyy-MM-dd HH:mm") }
        $script:zaustavi = "limit ($($poziv.limitTip)) se resetuje tek $kad - posle toga pokreni istu komandu ponovo (nastavlja fazu $id u istoj sesiji)"
        break
      }
      $do = (Get-Date).AddSeconds($sekundi).ToString("HH:mm")
      Pisi ("    LIMIT ({0}): {1} - cekam do {2} pa nastavljam istu sesiju" -f $poziv.limitTip, (Skrati (Tekst-Rezultata $poziv) 90), $do) "Yellow"
    }
    else {
      $greske++
      if ($greske -gt 3) { Pisi "    Greska ponovljena 3 puta - odustajem od faze." "Red"; break }
      $sekundi = $PauzaGreske * $greske
      $opis = Opis-Greske $poziv
      Pisi ("    PREKID: {0} - nov pokusaj u {1}" -f $opis, (Get-Date).AddSeconds($sekundi).ToString("HH:mm:ss")) "Yellow"
    }
    Start-Sleep -Seconds $sekundi
    if ($poziv.init -and $sid) {
      $poziv = Pokreni-Claude $id "$korak-nastavak$n" $nastavak ($osnova + @("--resume", $sid) + $modArgs)
    }
    else {
      # sesija nije ni nastala - ponovi isti poziv
      $poziv = Pokreni-Claude $id "$korak-ponovo$n" $ulaz ($osnova + $sesijaArgs + $modArgs)
    }
    $sid = Sesija-Iz-Poziva $poziv $sid
  }
  return @{ poziv = $poziv; sid = $sid }
}

function Proceni([string]$id, [string]$odHash, $poziv) {
  $status = ""
  $linija = ""
  $rx = "^\W*(GOTOVO|NEUSPEH)\W+" + $id + "(?!\w)"
  foreach ($l in ((Tekst-Rezultata $poziv) -split "`n")) {
    $m = [regex]::Match($l, $rx)
    if ($m.Success) { $status = $m.Groups[1].Value; $linija = (($l -replace '[`*]', "").Trim()) }
  }
  $log = Git-Komanda @("log", "--format=%h %s", "$odHash..HEAD")
  $commit = ($log.izlaz -split "`n") | Where-Object { $_ -match ("\[" + $id + "\]") } | Select-Object -First 1
  $izvestaj = Test-Path (Join-Path $root "nocni-run/izvestaji/$id.md")
  if ($status -eq "NEUSPEH") { return @{ status = "NEUSPEH"; opis = $linija; razlog = "Claude je prijavio NEUSPEH" } }
  if ($commit -and $status -eq "GOTOVO") { return @{ status = "GOTOVO"; opis = $linija } }
  if ($commit -and $izvestaj) { return @{ status = "GOTOVO"; opis = "GOTOVO (bez zavrsne linije): $commit" } }
  if ($status -eq "GOTOVO") { return @{ status = "NEUSPEH"; opis = "$linija (ali nema commita sa [$id])"; razlog = "napisao si GOTOVO, ali nema commita sa [$id]" } }
  if ($commit) { return @{ status = "NEUSPEH"; opis = "commit $commit postoji, ali nema izvestaja ni zavrsne linije"; razlog = "nema izvestaja nocni-run/izvestaji/$id.md ni zavrsne linije" } }
  return @{ status = "NEUSPEH"; opis = "bez zavrsne linije i bez commita [$id]"; razlog = "nema commita sa [$id] ni zavrsne linije" }
}

function Skloni-Izmene([string]$oznaka) {
  $s = Git-Komanda @("status", "--porcelain")
  if ($s.izlaz.Trim()) {
    $poruka = "boost-$oznaka-" + (Get-Date -Format "yyyyMMdd-HHmm")
    $r = Git-Komanda @("stash", "push", "-u", "-m", $poruka)
    if ($r.kod -eq 0) { return "izmene u git stash: $poruka" }
    return "stash nije uspeo: " + (Skrati $r.izlaz 120)
  }
  return ""
}

# Neuspela faza ne sme da ode na produkciju sa sledecim push-om.
function Skloni-Commitove([string]$id, [string]$odHash) {
  $broj = (Git-Komanda @("rev-list", "--count", "$odHash..HEAD")).izlaz.Trim()
  if (-not $broj -or $broj -eq "0") { return "" }
  $grana = "boost-neuspeh/$id-" + (Get-Date -Format "yyyyMMdd-HHmm")
  $b = Git-Komanda @("branch", $grana, "HEAD")
  if ($b.kod -ne 0) { return "commitovi faze NISU sklonjeni (grana nije napravljena): " + (Skrati $b.izlaz 100) }
  $r = Git-Komanda @("reset", "--hard", $odHash)
  if ($r.kod -ne 0) { return "commitovi su na grani $grana, ali reset nije uspeo: " + (Skrati $r.izlaz 100) }
  return "$broj commit(a) faze premesteno na granu $grana (main vracen na stanje pre faze)"
}

function Gurni {
  if ($BezPush) { return "bez push-a" }
  $r = Git-Komanda @("push", "origin", "main")
  if ($r.kod -eq 0) { return "pushovano" }
  $p = Git-Komanda @("pull", "--rebase", "origin", "main")
  if ($p.kod -ne 0) {
    Git-Komanda @("rebase", "--abort") | Out-Null
    return "PUSH PAO (pull --rebase konflikt, commit je lokalan)"
  }
  $r = Git-Komanda @("push", "origin", "main")
  if ($r.kod -eq 0) { return "pushovano (posle pull --rebase)" }
  return "PUSH PAO: " + (Skrati $r.izlaz 120)
}

function Sacuvaj-Stanje {
  $o = [ordered]@{ azurirano = (Get-Date).ToString("s"); sesije = $sesije; ishodi = $ishodi; uToku = $script:uToku }
  Snimi-Tekst $stanjeFajl ($o | ConvertTo-Json -Depth 5)
}

# Da li posle faze $id ima jos faza koje ce se pokrenuti (ako $id padne)?
function Ima-Jos-Faza([string]$id) {
  $propale = @{}
  foreach ($k in $ishodi.Keys) { if ($ishodi[$k] -ne "GOTOVO") { $propale[$k] = $true } }
  $propale[$id] = $true
  $posle = $false
  foreach ($k in $zaPokretanje) {
    if ($k -eq $id) { $posle = $true; continue }
    if (-not $posle) { continue }
    $blok = @($faze[$k].zavisi | Where-Object { ($zaPokretanje -contains $_) -and $propale.ContainsKey($_) })
    if ($blok.Count -gt 0) { $propale[$k] = $true } else { return $true }
  }
  return $false
}

# --- pre-flight -------------------------------------------------------------
foreach ($cmd in @("git", "node", "npm")) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Nema '$cmd' na PATH-u." }
}

# Koji claude: prvi claude.exe koji stvarno odgovara na --version. npm precica
# (claude.ps1/claude.cmd) moze da pokazuje na obrisan claude.exe posle prekinutog
# update-a, pa runner trazi sam binarni fajl, isto kao SKLOP pipeline.
function Verzija-Fajla([string]$exe) {
  $stari = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $v = ""
  try { $v = (& $exe --version 2>&1 | Out-String) } catch { $v = "" }
  $ErrorActionPreference = $stari
  $m = [regex]::Match($v, "(\d+)\.(\d+)\.(\d+)")
  if ($m.Success) { return $m.Value }
  return ""
}

function Nadji-Claude {
  # 1) kandidati: puni claude.exe fajlovi (bin\claude.exe i binarni fajl iz platform paketa)
  $exe = New-Object System.Collections.Generic.List[string]
  $ostalo = New-Object System.Collections.Generic.List[string]
  $folderi = New-Object System.Collections.Generic.List[string]
  if ($env:USERPROFILE) { $exe.Add((Join-Path $env:USERPROFILE ".local\bin\claude.exe")) }
  foreach ($c in @(Get-Command claude -All -ErrorAction SilentlyContinue)) {
    $src = [string]$c.Source
    if (-not $src) { continue }
    $folderi.Add((Join-Path (Split-Path -Parent $src) "node_modules"))
    if ($src.ToLower().EndsWith(".exe")) { $exe.Add($src) }
    elseif ($c.CommandType -eq "Application") { $ostalo.Add($src) }
  }
  foreach ($c in @(Get-Command node -All -CommandType Application -ErrorAction SilentlyContinue)) {
    if ($c.Source) { $folderi.Add((Join-Path (Split-Path -Parent ([string]$c.Source)) "node_modules")) }
  }
  $stari = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $npmRoot = ""
  try { $npmRoot = (& npm root -g 2>$null | Out-String).Trim() } catch { $npmRoot = "" }
  $ErrorActionPreference = $stari
  if ($npmRoot) { $folderi.Add($npmRoot) }
  if ($env:APPDATA) { $folderi.Add((Join-Path $env:APPDATA "npm\node_modules")) }
  foreach ($nm in $folderi) {
    $pkg = Join-Path $nm "@anthropic-ai\claude-code"
    $exe.Add((Join-Path $pkg "bin\claude.exe"))
    foreach ($plat in @("claude-code-win32-x64", "claude-code-win32-arm64")) {
      # npm drzi pravi binarni fajl u platform paketu; bin\claude.exe je samo njegova kopija
      $exe.Add((Join-Path $pkg "node_modules\@anthropic-ai\$plat\claude.exe"))
      $exe.Add((Join-Path $nm "@anthropic-ai\$plat\claude.exe"))
    }
  }
  # 2) eksplicitni -ClaudeExe ima prednost ako radi
  $provereno = @()
  if ($ClaudeExe) {
    $provereno += $ClaudeExe
    if (Test-Path $ClaudeExe -PathType Leaf) {
      $v = Verzija-Fajla $ClaudeExe
      if ($v) { return @{ exe = $ClaudeExe; verzija = $v; provereno = $provereno } }
    }
  }
  # 3) od svih koji odgovaraju na --version uzmi najnoviju verziju (.cmd precice tek na kraju)
  $vidjeno = @{}
  foreach ($grupa in @(@($exe), @($ostalo))) {
    $najbolji = $null
    foreach ($k in $grupa) {
      if (-not $k) { continue }
      $kljuc = $k.ToLower()
      if ($vidjeno.ContainsKey($kljuc)) { continue }
      $vidjeno[$kljuc] = $true
      if (-not (Test-Path $k -PathType Leaf)) { continue }
      $provereno += $k
      $v = Verzija-Fajla $k
      if (-not $v) { continue }
      $d = $v.Split(".")
      $broj = [int]$d[0] * 1000000 + [int]$d[1] * 1000 + [int]$d[2]
      if (-not $najbolji -or $broj -gt $najbolji.broj) { $najbolji = @{ exe = $k; verzija = $v; broj = $broj } }
    }
    if ($najbolji) { return @{ exe = $najbolji.exe; verzija = $najbolji.verzija; provereno = $provereno } }
  }
  return @{ exe = ""; verzija = ""; provereno = $provereno }
}

$nadjen = Nadji-Claude
if (-not $nadjen.exe) {
  $spisak = "nijedan"
  if ($nadjen.provereno.Count -gt 0) { $spisak = ($nadjen.provereno -join "; ") }
  throw ("Nijedan claude.exe ne odgovara na --version (provereno: " + $spisak + ").`n" +
    "Ako znas gde je ispravan, pokreni sa: -ClaudeExe ""C:\...\claude.exe""`n" +
    "Inace: Remove-Item -Recurse -Force ""`$(npm root -g)\@anthropic-ai\claude-code"" ; npm install -g @anthropic-ai/claude-code")
}
$script:CLAUDE = $nadjen.exe
if (-not (Get-Command python -ErrorAction SilentlyContinue) -and -not (Get-Command py -ErrorAction SilentlyContinue)) {
  Pisi "UPOZORENJE: nema python/py na PATH-u - skill ui-ux-pro-max nece moci da pokrene pretragu." "Yellow"
}
foreach ($f in $INFRA) {
  if (-not (Test-Path (Join-Path $root $f))) { throw "Nema $f - pokreni iz korena repoa enigmadigital." }
}

$grana = (Git-Komanda @("branch", "--show-current")).izlaz.Trim()
if ($grana -ne "main") { throw "Nisi na main (na '$grana'). Prebaci se pa pokreni ponovo." }
foreach ($x in @("MERGE_HEAD", "rebase-merge", "rebase-apply")) {
  if (Test-Path (Join-Path $root ".git/$x")) { throw "Git je usred merge/rebase-a (.git/$x). Zavrsi ili prekini pa pokreni ponovo." }
}

New-Item -ItemType Directory -Force -Path (Join-Path $root $logDir), (Join-Path $root $planDir), (Join-Path $root "nocni-run/izvestaji") | Out-Null

# Koje faze (radi i "-Samo B2,B3" kroz -File, gde stize kao jedan string).
$sveFaze = @($faze.Keys)
$Samo = @($Samo | ForEach-Object { ([string]$_) -split "[,;\s]+" } | Where-Object { $_ } | ForEach-Object { $_.Trim().ToUpper() })
$Od = $Od.Trim().ToUpper()
foreach ($s in $Samo) { if ($sveFaze -notcontains $s) { throw "Nepoznata faza '$s' (postoje: $($sveFaze -join ', '))." } }
$zaPokretanje = @()
if ($Samo.Count -gt 0) { $zaPokretanje = @($sveFaze | Where-Object { $Samo -contains $_ }) }
elseif ($Od) {
  $i = [array]::IndexOf($sveFaze, $Od)
  if ($i -lt 0) { throw "Nepoznata faza '$Od' (postoje: $($sveFaze -join ', '))." }
  $zaPokretanje = @($sveFaze[$i..($sveFaze.Count - 1)])
}
else { $zaPokretanje = $sveFaze }
$zaPokretanje = @($zaPokretanje)

# Stanje prethodnog runa: sesije, ishodi i faza koja je ostala u toku.
$sesije = [ordered]@{}
$ishodi = [ordered]@{}
$detalji = [ordered]@{}
$script:uToku = $null
$prekinuta = $null
$ranije = @{}
if ((Test-Path (Join-Path $root $stanjeFajl)) -and -not $Ispocetka) {
  try {
    $staro = (Procitaj $stanjeFajl) | ConvertFrom-Json
    if ($staro.sesije) { foreach ($pr in $staro.sesije.PSObject.Properties) { $sesije[$pr.Name] = [string]$pr.Value } }
    if ($staro.ishodi) { foreach ($pr in $staro.ishodi.PSObject.Properties) { $ranije[$pr.Name] = [string]$pr.Value } }
    if ($staro.uToku -and $staro.uToku.faza -and $staro.uToku.sesija) {
      $prekinuta = @{ faza = [string]$staro.uToku.faza; sesija = [string]$staro.uToku.sesija; odHash = [string]$staro.uToku.odHash; korak = [string]$staro.uToku.korak }
    }
  } catch { Pisi "Stanje iz prethodnog runa nije procitano - krecem bez njega." "Yellow" }
}
# Bez -Samo/-Od: faze koje su u prethodnom runu zavrsene se ne ponavljaju.
$vecGotovo = @()
if ($Samo.Count -eq 0 -and -not $Od) {
  foreach ($k in $zaPokretanje) {
    if ($ranije[$k] -eq "GOTOVO" -and -not ($prekinuta -and $prekinuta.faza -eq $k)) { $vecGotovo += $k }
  }
}
foreach ($k in $vecGotovo) { $ishodi[$k] = "GOTOVO"; $detalji[$k] = "GOTOVO u prethodnom runu (ponovo: -Samo $k)" }
if ($vecGotovo.Count -gt 0) { Pisi ("Vec GOTOVO u prethodnom runu, preskacem: " + ($vecGotovo -join ", ") + "  (sve ispocetka: -Ispocetka)") "Yellow" }
if ($prekinuta -and $zaPokretanje -contains $prekinuta.faza) { Pisi "Faza $($prekinuta.faza) je ostala prekinuta - nastavljam njenu sesiju $($prekinuta.sesija)." "Yellow" }
$zaRad = @($zaPokretanje | Where-Object { $vecGotovo -notcontains $_ })
if ($zaRad.Count -eq 0) { Pisi "Sve izabrane faze su vec GOTOVO. Za ponovno pokretanje: -Samo <ID> ili -Ispocetka." "Green"; exit 0 }

$ver = Verzija-Claude
Pisi ("Claude Code: " + $ver.tekst + "  (" + $script:CLAUDE + ")") "Gray"
if ($ver.broj -gt 0 -and $ver.broj -lt (Ver 2 1 139)) { Pisi "UPOZORENJE: /goal trazi Claude Code 2.1.139+ (goal faze ce ici kao obican prompt). Azuriraj: claude update" "Yellow" }
# Opcije koje zavise od verzije: proveri ih u --help umesto nagadjanja.
$stari = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$pomoc = (& $script:CLAUDE --help 2>&1 | Out-String)
$ErrorActionPreference = $stari
$dodatno = @()
if ($pomoc -match "--permission-prompts") { $dodatno += @("--permission-prompts", "none") }
$IMA_NAME = ($pomoc -match "--name <")
$IMA_BEZ_SESIJE = ($pomoc -match "--no-session-persistence")
if ($pomoc -notmatch '"auto"') { Pisi "UPOZORENJE: ova verzija Claude Code-a ne pominje auto mod - azuriraj (claude update) ili koristi -SkipPermissions." "Yellow" }

# Ako je remote ispred, povuci (lokalne izmene se cuvaju kroz autostash).
$fetch = Git-Komanda @("fetch", "origin", "main")
if ($fetch.kod -eq 0) {
  $iza = (Git-Komanda @("rev-list", "--count", "HEAD..origin/main")).izlaz.Trim()
  if ($iza -and $iza -ne "0") {
    Pisi "Remote je ispred za $iza commit(a) - git pull --rebase --autostash" "Yellow"
    $pull = Git-Komanda @("pull", "--rebase", "--autostash", "origin", "main")
    if ($pull.kod -ne 0) { throw "git pull nije uspeo: $($pull.izlaz)" }
  }
}
else { Pisi "UPOZORENJE: git fetch nije uspeo (mreza?) - nastavljam sa lokalnim stanjem." "Yellow" }

# Plan, promptovi i runner idu u svoj commit pre faza (stash ih nikad ne odnosi).
if (Test-Path (Join-Path $root "START-BOOST.cmd")) { $INFRA += "START-BOOST.cmd" }
$infraStatus = Git-Komanda (@("status", "--porcelain", "--") + $INFRA)
if ($infraStatus.izlaz.Trim()) {
  Git-Komanda (@("add", "--") + $INFRA) | Out-Null
  $porukaFajl = Join-Path $root "$logDir/commit-infra.txt"
  [System.IO.File]::WriteAllText($porukaFajl, "chore(ux): plan, promptovi i runner za UI/UX boost`n`nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`nClaude-Session: https://claude.ai/code/session_012CNyV44fBRL8xhWX1EgZdp`n", $utf8)
  $ci = Git-Komanda (@("commit", "-q", "-F", $porukaFajl, "--") + $INFRA)
  if ($ci.kod -ne 0) { throw "Commit plana i runnera nije uspeo: $($ci.izlaz)" }
  Pisi ("Komitovani plan, promptovi i runner: " + (Git-Komanda @("log", "-1", "--format=%h %s")).izlaz) "Gray"
}

# Mod izvrsenja po modelu (auto, ili acceptEdits ako auto nije dostupan).
$pocetniMod = "auto"
if ($SkipPermissions) { $pocetniMod = "bypassPermissions" }
$modZaModel = @{}
$prikazModela = @{}
$potrebniModeli = @($zaRad | ForEach-Object { $faze[$_].model } | Select-Object -Unique)

function Probaj-Model([string]$m) {
  $a = @("-p", "--model", $m, "--effort", "low", "--max-turns", "1", "--output-format", "stream-json", "--verbose", "--permission-mode", $pocetniMod) + $dodatno
  if ($IMA_BEZ_SESIJE) { $a += "--no-session-persistence" }
  for ($k = 1; $k -le 4; $k++) {
    $p = Pokreni-Claude "PROBA" ($m -replace "[^a-zA-Z0-9]", "-") "Odgovori samo: OK" $a
    if (-not (Je-Prekid $p)) { return $p }
    if (Je-Prijava $p) { throw "Claude nije prijavljen: $(Opis-Greske $p). Pokreni 'claude', uloguj se, pa ponovo." }
    if (-not (Je-Limit $p)) { return $p }
    $reset = Unix-U-Vreme $p.resetsAt
    $sek = 1800
    if ($reset) { $sek = [int]($reset - (Get-Date)).TotalSeconds + $RezervaLimita }
    if ($sek -lt 60) { $sek = 60 }
    if ($sek -gt $MaxCekanjeSati * 3600) { throw "Limit je dostignut i resetuje se tek $reset. Pokreni posle toga." }
    Pisi "Limit je vec dostignut - cekam do $((Get-Date).AddSeconds($sek).ToString('HH:mm')) pa krecem." "Yellow"
    Start-Sleep -Seconds $sek
  }
  return $p
}

if (-not $BezProvereModela) {
  foreach ($m in $potrebniModeli) {
    $proba = Probaj-Model $m
    if (Je-Prekid $proba) {
      if ($m -eq $OPUS -and $OPUS -ne "opus") {
        Pisi "Model '$m' nije prosao probu ($(Opis-Greske $proba)) - probam alias 'opus'." "Yellow"
        $proba2 = Probaj-Model "opus"
        if (Je-Prekid $proba2) { throw "Ni '$m' ni 'opus' ne rade: $(Opis-Greske $proba2). Pogledaj $($proba2.baza).err i ispravi `$OPUS na vrhu skripte." }
        foreach ($k in @($faze.Keys)) { if ($faze[$k].model -eq $OPUS) { $faze[$k].model = "opus" } }
        $OPUS = "opus"
        $m = "opus"
        $proba = $proba2
      }
      else { throw "Model '$m' ne radi: $(Opis-Greske $proba). Pogledaj $($proba.baza).err." }
    }
    $mod = $pocetniMod
    if (-not $SkipPermissions -and $proba.init -and $proba.init.permissionMode -and $proba.init.permissionMode -ne $pocetniMod) {
      Pisi "UPOZORENJE: auto mod nije dostupan za '$m' (sesija je u '$($proba.init.permissionMode)') - za taj model koristim acceptEdits + listu alata." "Yellow"
      $mod = "acceptEdits"
    }
    $modZaModel[$m] = $mod
    $stvarni = $m
    if ($proba.init -and $proba.init.model) { $stvarni = [string]$proba.init.model }
    $prikazModela[$m] = $stvarni
    Pisi ("Proba OK: {0} -> {1}, mod {2}" -f $m, $stvarni, $mod) "Green"
  }
}

function Mod-Args([string]$model) {
  $mod = $pocetniMod
  if ($modZaModel.ContainsKey($model)) { $mod = $modZaModel[$model] }
  $a = @("--permission-mode", $mod)
  if ($mod -eq "acceptEdits") { $a += @("--allowedTools", $ALATI_ACCEPTEDITS) }
  return $a + @("--disallowedTools", $ZABRANJENO)
}

$headlessSablon = Procitaj "nocni-run/_boost-headless.md"
$planSablon = Procitaj "nocni-run/_boost-plan-korak.md"
$goalSablon = Procitaj "nocni-run/_boost-goal.md"

Pisi ""
Pisi "=== UI/UX boost runner ===" "Cyan"
Pisi ("Push posle faze: {0} | max turnova po pozivu: {1} | logovi: {2}" -f $(if ($BezPush) { "NE" } else { "DA (ide na produkciju)" }), $MaxTurns, $logDir)
Pisi ""
Pisi ("{0,-4} {1,-42} {2,-16} {3,-6} {4,-5} {5}" -f "ID", "Faza", "Model", "Effort", "Mod", "Sesija")
foreach ($id in $zaPokretanje) {
  $p = $faze[$id]
  $ses = if ($p.sesija -eq "nova") { "nova" } else { "ista kao $($p.sesija)" }
  if ($vecGotovo -contains $id) { $ses += "   (vec GOTOVO)" }
  Pisi ("{0,-4} {1,-42} {2,-16} {3,-6} {4,-5} {5}" -f $id, $p.naziv, $p.model, $p.effort, $p.mod, $ses)
}
Pisi ""
if (-not $BezOdbrojavanja) {
  Pisi "Start za 10 s (Ctrl+C za prekid). Racunar neka ostane ukljucen u struju, sa otvorenim poklopcem." "Yellow"
  Start-Sleep -Seconds 10
}

# Racunar ne sme da zaspi dok run traje.
$budan = $false
if ($env:OS -eq "Windows_NT") {
  try {
    Add-Type -Namespace Boost -Name Power -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);' -ErrorAction Stop
    [Boost.Power]::SetThreadExecutionState([uint32]2147483649) | Out-Null   # ES_CONTINUOUS | ES_SYSTEM_REQUIRED
    $budan = $true
  } catch { Pisi "Nisam uspeo da sprecim spavanje racunara - iskljuci sleep rucno." "Yellow" }
}

$pocetak = Get-Date
$pocetniHash = (Git-Komanda @("rev-parse", "--short", "HEAD")).izlaz.Trim()
$script:zaustavi = ""

try {
  foreach ($id in $zaPokretanje) {
    $p = $faze[$id]
    if ($script:zaustavi) { break }
    if ($vecGotovo -contains $id) { continue }

    $blokiran = @($p.zavisi | Where-Object { ($zaPokretanje -contains $_) -and ($ishodi[$_] -ne "GOTOVO") })
    if ($blokiran.Count -gt 0) {
      Pisi "--- $id preskocen: zavisi od $($blokiran -join ', ') koji nije GOTOVO" "Yellow"
      $ishodi[$id] = "PRESKOCEN"
      $detalji[$id] = "zavisi od $($blokiran -join ', ')"
      Sacuvaj-Stanje
      continue
    }

    $promptFajl = "nocni-run/$id.md"
    $tekst = (Procitaj $promptFajl).Trim()
    $headless = $headlessSablon.Replace("<ID>", $id)
    $nastavak = $NASTAVAK_PREKID.Replace("<ID>", $id) + "`n`n---`n`n" + $headless

    # Faza prekinuta u prethodnom runu nastavlja svoju sesiju (osim plan koraka, koji krece ispocetka).
    $nastavljena = $null
    if ($prekinuta -and $prekinuta.faza -eq $id -and ($p.mod -ne "plan" -or $prekinuta.korak -eq "izvrsenje")) { $nastavljena = $prekinuta }
    if ($prekinuta -and $prekinuta.faza -eq $id) { $prekinuta = $null }

    # Svaka faza osim B0 krece od cistog radnog foldera (B0 komituje A9 izmene).
    if ($id -ne "B0" -and -not $nastavljena) {
      $sklonjeno = Skloni-Izmene "pre-$id"
      if ($sklonjeno) { Pisi "    $sklonjeno" "Yellow" }
    }

    $odHash = (Git-Komanda @("rev-parse", "HEAD")).izlaz.Trim()
    if ($nastavljena -and $nastavljena.odHash) { $odHash = $nastavljena.odHash }
    $t0 = Get-Date

    # sesija
    $sid = $null
    $sesijaArgs = @()
    if ($nastavljena) {
      $sid = $nastavljena.sesija
      $sesijaArgs = @("--resume", $sid)
    }
    elseif ($p.sesija -eq "nova") {
      $sid = [guid]::NewGuid().ToString()
      $sesijaArgs = Nova-Sesija $sid $id
    }
    else {
      $sid = $sesije[$p.sesija]
      if ($sid) { $sesijaArgs = @("--resume", $sid) }
      else {
        Pisi "    Nema sesije faze $($p.sesija) - $id krece u novoj sesiji." "Yellow"
        $sid = [guid]::NewGuid().ToString()
        $sesijaArgs = Nova-Sesija $sid $id
      }
    }

    $osnova = @("-p", "--model", $p.model, "--effort", $p.effort, "--output-format", "stream-json", "--verbose", "--max-turns", "$MaxTurns") + $dodatno
    $izvrsi = Mod-Args $p.model
    Pisi ""
    Pisi ("--- {0} - {1} - {2} - effort {3} - mod {4} - sesija {5}" -f $id, $p.naziv, $p.model, $p.effort, $p.mod, $(if ($p.sesija -eq "nova") { "nova" } else { "ista kao $($p.sesija)" })) "Cyan"

    $poziv = $null
    $napomena = @()
    $ocena = $null
    $preskociOcenu = $false

    if ($nastavljena) {
      Pisi "    Nastavljam prekinutu fazu u sesiji $sid (commitovi od $($odHash.Substring(0, [Math]::Min(7, $odHash.Length))))." "Yellow"
      $napomena += "nastavljena posle prekida runa"
      $script:uToku = [ordered]@{ faza = $id; sesija = $sid; odHash = $odHash; korak = "izvrsenje" }
      Sacuvaj-Stanje
      $r = Pozovi-Uporno $id "nastavak-runa" $nastavak $osnova $sesijaArgs $izvrsi $sid $nastavak
      $poziv = $r.poziv; $sid = $r.sid
      if (Nema-Sesije $poziv) {
        # sesija nije ni nastala (run je pao pre prvog poziva faze) - faza krece ispocetka
        Pisi "    Sesija prekinute faze ne postoji - $id krece ispocetka." "Yellow"
        $napomena = @()
        $nastavljena = $null
        $poziv = $null
        if ($p.sesija -ne "nova" -and $sesije[$p.sesija]) { $sid = $sesije[$p.sesija]; $sesijaArgs = @("--resume", $sid) }
        else { $sid = [guid]::NewGuid().ToString(); $sesijaArgs = Nova-Sesija $sid $id }
      }
    }
    if ($nastavljena) { }
    elseif ($p.mod -eq "plan") {
      # 1) plan
      $script:uToku = [ordered]@{ faza = $id; sesija = $sid; odHash = $odHash; korak = "plan" }
      Sacuvaj-Stanje
      $planArgs = @("--permission-mode", "plan", "--disallowedTools", $ZABRANJENO)
      $planUlaz = $tekst + "`n`n---`n`n" + $planSablon.Replace("<ID>", $id)
      $r = Pozovi-Uporno $id "plan" $planUlaz $osnova $sesijaArgs $planArgs $sid ($NASTAVAK_PLAN.Replace("<ID>", $id)) -NovaAkoNema
      $poziv = $r.poziv; $sid = $r.sid
      $plan = Tekst-Rezultata $poziv
      if (-not $script:zaustavi -and $plan.Length -lt 400 -and $sid) {
        $r = Pozovi-Uporno $id "plan2" "Ispisi ceo plan za fazu $id kao tekst poruke (markdown), bez alata i bez ExitPlanMode." $osnova @("--resume", $sid) $planArgs $sid ($NASTAVAK_PLAN.Replace("<ID>", $id))
        $poziv = $r.poziv; $sid = $r.sid
        if ((Tekst-Rezultata $poziv).Length -gt $plan.Length) { $plan = Tekst-Rezultata $poziv }
      }
      $planFajl = "$planDir/$id-plan.md"
      $planTekst = "# Plan $id (plan korak runnera, " + (Get-Date -Format "yyyy-MM-dd HH:mm") + ")`n`n" + $plan
      Snimi-Tekst $planFajl $planTekst
      Snimi-Tekst "$logDir/$id-plan.md" $planTekst
      Pisi "    plan: $planFajl ($($plan.Length) znakova)" "Gray"

      if ($script:zaustavi -or $plan.Length -lt 400) {
        $ocena = @{ status = "NEUSPEH"; opis = "plan nije dobijen ($($plan.Length) znakova)" }
        if ($script:zaustavi) { $ocena.opis = "plan prekinut: $script:zaustavi" }
        $preskociOcenu = $true
      }
      else {
        $izmene = ""
        $odbijen = $false
        if ($CekajPlan) {
          Pisi ""
          Pisi "=== PLAN $id - ceo plan je u $planFajl ===" "Yellow"
          ($plan -split "`n" | Select-Object -First 40) | ForEach-Object { Pisi "  $_" "Gray" }
          $odg = Read-Host "Enter = odobri | upisi izmene u jednom redu | 'stop' = preskoci fazu"
          if ($odg -eq "stop") { $odbijen = $true } elseif ($odg) { $izmene = $odg }
        }
        if ($odbijen) {
          $ishodi[$id] = "PRESKOCEN"
          $detalji[$id] = "plan nije odobren (kopija: $logDir/$id-plan.md)"
          Remove-Item (Join-Path $root $planFajl) -ErrorAction SilentlyContinue
          $script:uToku = $null
          Sacuvaj-Stanje
          continue
        }
        # 2) izvrsenje u istoj sesiji
        $script:uToku = [ordered]@{ faza = $id; sesija = $sid; odHash = $odHash; korak = "izvrsenje" }
        Sacuvaj-Stanje
        $odobreno = "Plan iz tvoje prethodne poruke je ODOBREN"
        if ($izmene) { $odobreno += ", uz ove izmene: $izmene" }
        $odobreno += ". Runner ga je sacuvao u $planFajl (taj fajl ide u commit faze). Sada ga sprovedi u celosti po promptu $id (deo 'Posle odobrenja') i zavrsi repom iz par. 12 plana ui-boost-plan.md: commit sa [$id] i poslednja linija GOTOVO $id."
        $r = Pozovi-Uporno $id "izvrsenje" ($odobreno + "`n`n---`n`n" + $headless) $osnova @("--resume", $sid) $izvrsi $sid $nastavak
        $poziv = $r.poziv; $sid = $r.sid
      }
    }
    elseif ($p.mod -eq "goal") {
      $script:uToku = [ordered]@{ faza = $id; sesija = $sid; odHash = $odHash; korak = "goal" }
      Sacuvaj-Stanje
      $goalUlaz = $tekst + "`n`n" + $goalSablon.Replace("<ID>", $id).Trim()
      $r = Pozovi-Uporno $id "goal" $goalUlaz $osnova $sesijaArgs $izvrsi $sid $nastavak -NovaAkoNema
      $poziv = $r.poziv; $sid = $r.sid
      if (-not $script:zaustavi -and -not $poziv.goal -and -not (Je-Prekid $poziv)) {
        # /goal nije prihvacen (stara verzija, iskljuceni hookovi...) -> isti zadatak kao obican prompt
        Pisi "    /goal nije prihvacen ($(Skrati (Tekst-Rezultata $poziv) 100)) - saljem isti zadatak kao obican prompt." "Yellow"
        $napomena += "goal nije prihvacen, obican prompt"
        $obican = ($tekst -replace "^/goal\s+", "") + "`n`n---`n`n" + $headless
        $r = Pozovi-Uporno $id "obican" $obican $osnova @("--resume", $sid) $izvrsi $sid $nastavak
        $poziv = $r.poziv; $sid = $r.sid
      }
    }
    else {
      $script:uToku = [ordered]@{ faza = $id; sesija = $sid; odHash = $odHash; korak = "auto" }
      Sacuvaj-Stanje
      $r = Pozovi-Uporno $id "auto" ($tekst + "`n`n---`n`n" + $headless) $osnova $sesijaArgs $izvrsi $sid $nastavak -NovaAkoNema
      $poziv = $r.poziv; $sid = $r.sid
    }
    if ($sid -and $script:uToku) { $script:uToku.sesija = $sid; Sacuvaj-Stanje }

    # Faza nije zavrsena (bez commita / bez linije): jos jedna runda u istoj sesiji.
    if (-not $preskociOcenu -and -not $script:zaustavi -and -not $BezNastavka -and $sid) {
      $ocena = Proceni $id $odHash $poziv
      if ($ocena.status -ne "GOTOVO" -and $ocena.razlog -ne "Claude je prijavio NEUSPEH") {
        if ($p.mod -eq "goal") {
          $napomena += "goal nastavak"
          $r = Pozovi-Uporno $id "goal2" ($GOAL_NASTAVAK.Replace("<ID>", $id)) $osnova @("--resume", $sid) $izvrsi $sid $nastavak
        }
        else {
          $napomena += "nastavak"
          $poruka = "Faza $id nije zavrsena: $($ocena.razlog). Nastavi tacno tamo gde si stao, zavrsi preostalo po promptu $id i repu iz par. 12 (izvestaj nocni-run/izvestaji/$id.md, commit sa [$id]), pa zavrsi linijom GOTOVO $id ili NEUSPEH $id."
          $r = Pozovi-Uporno $id "nastavak" ($poruka + "`n`n---`n`n" + $headless) $osnova @("--resume", $sid) $izvrsi $sid $nastavak
        }
        $poziv = $r.poziv; $sid = $r.sid
      }
    }

    if ($sid) { $sesije[$id] = $sid }
    if (-not $preskociOcenu) { $ocena = Proceni $id $odHash $poziv }
    if ($script:zaustavi -and $ocena.status -ne "GOTOVO") { $ocena = @{ status = "NEUSPEH"; opis = "run zaustavljen: $script:zaustavi" } }
    $trajanje = [int]((Get-Date) - $t0).TotalMinutes
    $sesKratko = ""
    if ($sid) { $sesKratko = " | sesija $sid" }

    if ($ocena.status -eq "GOTOVO") {
      $ishodi[$id] = "GOTOVO"
      $script:uToku = $null
      $push = Gurni
      $detalji[$id] = "$($ocena.opis) | $push | $trajanje min$sesKratko"
      if ($napomena.Count -gt 0) { $detalji[$id] += " | " + ($napomena -join ", ") }
      Pisi "    -> GOTOVO - $push - $trajanje min" "Green"
    }
    else {
      $ishodi[$id] = "NEUSPEH"
      $detalji[$id] = "$($ocena.opis) | $trajanje min$sesKratko"
      if ($napomena.Count -gt 0) { $detalji[$id] += " | " + ($napomena -join ", ") }
      Pisi "    -> NEUSPEH - $($ocena.opis) - $trajanje min" "Red"
      if ($script:zaustavi) {
        # run staje; sledece pokretanje iste komande nastavlja ovu sesiju
        $detalji[$id] += " | izmene ostavljene lokalno; ista komanda kasnije nastavlja ovu sesiju"
      }
      elseif (Ima-Jos-Faza $id) {
        $script:uToku = $null
        $stash = Skloni-Izmene "$id-nedovrseno"
        $sklonjeni = Skloni-Commitove $id $odHash
        foreach ($x in @($stash, $sklonjeni)) { if ($x) { $detalji[$id] += " | $x"; Pisi "    $x" "Yellow" } }
      }
      else {
        $script:uToku = $null
        $detalji[$id] += " | izmene i commitovi faze ostavljeni lokalno (nisu pushovani)"
      }
    }
    Sacuvaj-Stanje
  }
}
finally {
  if ($budan) { try { [Boost.Power]::SetThreadExecutionState([uint32]2147483648) | Out-Null } catch { } }

  $kraj = Get-Date
  $krajHash = (Git-Komanda @("rev-parse", "--short", "HEAD")).izlaz.Trim()
  $rezime = @()
  $rezime += "# UI/UX boost - rezime runa"
  $rezime += ""
  $rezime += "Start: $($pocetak.ToString('yyyy-MM-dd HH:mm')) - Kraj: $($kraj.ToString('yyyy-MM-dd HH:mm')) - Trajanje: $([int]($kraj - $pocetak).TotalMinutes) min"
  $rezime += "HEAD pre: $pocetniHash - HEAD posle: $krajHash - push: $(if ($BezPush) { 'NE' } else { 'DA' })"
  $mi = @()
  foreach ($m in $modZaModel.Keys) { $mi += "$m -> $($prikazModela[$m]) ($($modZaModel[$m]))" }
  if ($mi.Count -gt 0) { $rezime += "Modeli: " + ($mi -join "; ") }
  if ($script:zaustavi) { $rezime += ""; $rezime += "**RUN ZAUSTAVLJEN:** $script:zaustavi" }
  $rezime += ""
  $rezime += "| Faza | Model | Effort | Mod | Sesija | Ishod | Detalji |"
  $rezime += "|---|---|---|---|---|---|---|"
  foreach ($id in $zaPokretanje) {
    $p = $faze[$id]
    $ish = if ($ishodi.Contains($id)) { $ishodi[$id] } else { "NIJE POKRENUT" }
    $det = if ($detalji.Contains($id)) { $detalji[$id] } else { "" }
    $ses = if ($p.sesija -eq "nova") { "nova" } else { "ista kao $($p.sesija)" }
    $rezime += "| $id | $($p.model) | $($p.effort) | $($p.mod) | $ses | $ish | $det |"
  }
  $rezime += ""
  $rezime += "## Commitovi u runu"
  $rezime += ""
  $rezime += (Git-Komanda @("log", "--oneline", "$pocetniHash..HEAD")).izlaz
  $rezime += ""
  $rezime += "Izvestaji: nocni-run/izvestaji/B*.md - Planovi: nocni-run/planovi/ - Snimci: nocni-run/ux/ - Logovi: $logDir/"
  $rezime += "Sesiju faze otvoris sa: claude --resume <sesija> - Nedovrsene izmene: git stash list - Commitovi neuspelih faza: git branch --list boost-neuspeh/*"
  if ($BezPush) { $rezime += "Push nije radjen (-BezPush): kad pregledas, git push origin main." }
  Snimi-Tekst "$logDir/REZIME-BOOST.md" ($rezime -join "`n")
  Pisi ""
  Pisi ($rezime -join "`n")
}
