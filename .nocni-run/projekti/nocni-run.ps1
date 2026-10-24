<#
  =====================================================================
   NOCNI RUN - runner: plan od N koraka, svaki korak je jedan `claude -p`
  ---------------------------------------------------------------------
   Pokretanje:  dupli klik na pokreni.cmd (u ovom folderu)
                ili: powershell -ExecutionPolicy Bypass -File .\nocni-run.ps1
   Pre noci:    dupli klik na provera.cmd (selftest CLI-ja + pocetne provere)
   Pracenje:    dupli klik na monitor.cmd (drugi prozor, samo cita)

   Opcije:
     -From K05          krece od tog koraka
     -Only K02,K03      samo ti koraci (i ako su vec zavrseni)
     -BudgetUsd 300     staje kad ukupna cena predje iznos (0 = bez limita)
     -Skip build,lint   preskoci te provere (imena iz config.json "gates")
     -NoBuild           isto sto i -Skip build
     -NoCommit          bez commitova (proba)
     -SelfTestOnly      samo selftest CLI-ja + baseline provere, pa izlaz
     -SkipSelfTest      ne pustaj selftest (koristi poslednji iz state.json)
     -DryRun            samo proveri fajlove i ispisi plan (bez Claude-a i git-a)
     -RepoPath X        repo (podrazumevano: prvi roditeljski folder sa .git)

   Fajlovi u ovom folderu:
     config.json steps.json rules.md prompts\<ID>.md   pise Claude pre runa
     state.json logs\ tmp\ baseline.txt mcp.json      pise runner (gitignore)
     STOP                                             napravi ga -> run staje pre sledeceg koraka

   Bezbednost:
     - Svaki korak je `claude -p --permission-mode auto` (plan koraci: plan).
       Nikad --dangerously-skip-permissions. Ako auto rezim ne dozvoli ni
       obicnu izmenu fajla, run STAJE (selftest).
     - Agentu su zabranjeni git push/commit/reset/clean/checkout/switch/stash/
       rebase/merge, npm publish, rm -rf i sve iz config.json "deny".
     - Commit pravi SAMO runner, lokalno, na grani iz config.json. Nema push-a.
     - Dok je ovaj prozor otvoren racunar ne ide na spavanje (Windows).

   Ovaj fajl je namerno cist ASCII (Windows PowerShell 5.1 cita .ps1 bez
   BOM-a kao ANSI). Srpska slova u tekstu za agenta se prave u Sr().
  =====================================================================
#>
param(
  [string] $RepoPath = "",
  [string] $From = "",
  [string] $Only = "",
  [double] $BudgetUsd = -1,
  [string] $Skip = "",
  [switch] $NoBuild,
  [switch] $NoCommit,
  [switch] $SelfTestOnly,
  [switch] $SkipSelfTest,
  [switch] $DryRun
)

$ErrorActionPreference = "Continue"
$IsWin = ($env:OS -eq "Windows_NT")
$Sep = [string][System.IO.Path]::DirectorySeparatorChar
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$Utf8 = New-Object System.Text.UTF8Encoding($false)

$RunDir = $PSScriptRoot
if (-not $RunDir) { $RunDir = Split-Path -Parent $MyInvocation.MyCommand.Path }
$RunDir = [System.IO.Path]::GetFullPath($RunDir).TrimEnd('\', '/')
$LogDir       = Join-Path $RunDir "logs"
$TmpDir       = Join-Path $RunDir "tmp"
$PromptDir    = Join-Path $RunDir "prompts"
$StateFile    = Join-Path $RunDir "state.json"
$StepsFile    = Join-Path $RunDir "steps.json"
$ConfigFile   = Join-Path $RunDir "config.json"
$RulesFile    = Join-Path $RunDir "rules.md"
$McpFile      = Join-Path $RunDir "mcp.json"
$BaselineFile = Join-Path $RunDir "baseline.txt"
$StopFile     = Join-Path $RunDir "STOP"
New-Item -ItemType Directory -Force -Path $LogDir, $TmpDir | Out-Null
$Log = Join-Path $LogDir ("run-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmm"))
$FailedTestsJs = Join-Path $LogDir "failed-tests.cjs"
$script:CurrentId = "start"
$script:StateLoaded = $false

# -- osnovne pomocne ----------------------------------------------------------
function Write-Log([string]$msg, [string]$color = "Gray") {
  $line = "[{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $msg
  Write-Host $line -ForegroundColor $color
  try { [System.IO.File]::AppendAllText($Log, $line + [Environment]::NewLine, $Utf8) } catch { }
}

function Read-Utf8([string]$path) {
  if (-not $path -or -not (Test-Path -LiteralPath $path)) { return "" }
  try { return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) } catch { return "" }
}

function Tail-Text([string]$text, [int]$n = 50) {
  if (-not $text) { return "" }
  $ls = $text -split "`r?`n"
  if ($ls.Count -le $n) { return ($ls -join "`n") }
  return (($ls | Select-Object -Last $n) -join "`n")
}

function Stop-Run([string]$msg, [int]$code) {
  Write-Log "STOP: $msg" Red
  if ($script:StateLoaded) { $State.current = $null; Save-State }
  exit $code
}

function Find-Repo([string]$start) {
  $d = $start
  for ($i = 0; $i -lt 15 -and $d; $i++) {
    if (Test-Path -LiteralPath (Join-Path $d ".git")) { return $d }
    $p = Split-Path -Parent $d
    if (-not $p -or $p -eq $d) { break }
    $d = $p
  }
  return ""
}

if (-not $RepoPath) { $RepoPath = Find-Repo $RunDir }
if (-not $RepoPath -or -not (Test-Path -LiteralPath $RepoPath)) {
  Write-Log "STOP: ne nalazim git repo iznad $RunDir (zadaj -RepoPath)" Red
  exit 8
}
$RepoPath = [System.IO.Path]::GetFullPath($RepoPath).TrimEnd('\', '/')
Set-Location -LiteralPath $RepoPath

function Get-Rel([string]$full) {
  $f = [System.IO.Path]::GetFullPath($full)
  $r = $RepoPath + $Sep
  if ($f.StartsWith($r, [System.StringComparison]::OrdinalIgnoreCase)) { return ($f.Substring($r.Length) -replace '\\', '/') }
  return ($f -replace '\\', '/')
}
function Get-Abs([string]$rel) {
  return [System.IO.Path]::GetFullPath((Join-Path $RepoPath ($rel -replace '[\\/]', $Sep)))
}
$RunRel = Get-Rel $RunDir

# -- config.json --------------------------------------------------------------
$cfgText = Read-Utf8 $ConfigFile
if (-not $cfgText) { Write-Log "STOP: nema config.json u $RunDir" Red; exit 8 }
try { $Cfg = $cfgText | ConvertFrom-Json } catch { Write-Log "STOP: config.json nije ispravan JSON: $($_.Exception.Message)" Red; exit 8 }

function Cfg([string]$name, $default) {
  $p = $Cfg.PSObject.Properties[$name]
  if ($p -and $null -ne $p.Value -and -not ($p.Value -is [string] -and $p.Value -eq "")) { return $p.Value }
  return $default
}

$Name      = [string](Cfg "name" "NOCNI RUN")
$Slug      = [string](Cfg "slug" (Split-Path -Leaf $RunDir))
$Branch    = [string](Cfg "branch" ($Slug + "-run"))
$Model     = [string](Cfg "defaultModel" "claude-opus-5-5")
$Lang      = ([string](Cfg "lang" "sr")).ToLower(); if ($Lang -ne "en") { $Lang = "sr" }
$PlanRel   = [string](Cfg "planDoc" ("docs/" + $Slug.ToUpper() + "-PLAN.md"))
$ProgRel   = [string](Cfg "progressDoc" ("docs/" + $Slug.ToUpper() + "-PROGRESS.md"))
$PlansRel  = [string](Cfg "plansDir" ("docs/" + $Slug + "/planovi"))
$ShotsRel  = [string](Cfg "screenshotsDir" ("docs/" + $Slug + "/snimci"))
$MaxFix    = [int](Cfg "maxFixAttempts" 2)
$Trailer   = [string](Cfg "commitTrailer" "Co-Authored-By: Claude <noreply@anthropic.com>")
$SelfTestMaxAgeH = [double](Cfg "selfTestMaxAgeHours" 12)
if ($BudgetUsd -lt 0) { $BudgetUsd = [double](Cfg "budgetUsd" 0) }
$Progress  = Get-Abs $ProgRel
$PlanDir   = Get-Abs $PlansRel
$Gates     = @(Cfg "gates" @())
$DenyExtra = @(Cfg "deny" @())
$ExclExtra = @(Cfg "commitExclude" @())
$OwnExtra  = @(Cfg "ownPaths" @())
$DevPorts  = @(Cfg "devPorts" @(3000, 3001, 3002, 3003, 3004, 3005, 3123, 4173, 5173, 8080))
$DevPattern = [string](Cfg "devProcessPattern" '(next|vite|nuxt|astro|remix|convex|webpack|turbo|nodemon|tsx|wrangler)[^ ]*["\s]+(dev|serve|start|watch|preview)|next[\\/]dist[\\/]server|vite[\\/]bin')
$EnvCfg    = Cfg "env" $null
$Assets    = Cfg "assets" $null
$AssetsReadyRel = ""; $AssetsTargetRel = ""
if ($Assets) {
  $AssetsReadyRel = [string]$Assets.ready; if (-not $AssetsReadyRel) { $AssetsReadyRel = "$RunRel/slike/ready" }
  $AssetsTargetRel = [string]$Assets.target
}
$SkipSet = @($Skip -split "," | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ })
if ($NoBuild) { $SkipSet += "build" }

$BaseDeny = @("Bash(git push:*)", "Bash(git commit:*)", "Bash(git reset:*)", "Bash(git clean:*)", "Bash(git checkout:*)",
  "Bash(git switch:*)", "Bash(git stash:*)", "Bash(git rebase:*)", "Bash(git merge:*)", "Bash(git branch -D:*)",
  "Bash(git tag:*)", "Bash(npm publish:*)", "Bash(rm -rf:*)")
$Deny = (@($BaseDeny + $DenyExtra) | Where-Object { $_ } | Select-Object -Unique) -join ","

$BaseExcl = @(".agents", ".claude", ".playwright-mcp", "$RunRel/logs", "$RunRel/state.json", "$RunRel/state.json.tmp", "$RunRel/state.bad.json",
  "$RunRel/tmp", "$RunRel/STOP", "$RunRel/slike", "$RunRel/mcp.json", "$RunRel/baseline.txt")
if ($AssetsReadyRel) { $BaseExcl += $AssetsReadyRel }
$UnsafeGlobs = @("**/node_modules/**", "**/.next/**", "**/.nuxt/**", "**/.turbo/**", "**/.vercel/**", "**/.env", "**/.env.local", "**/.env.*.local", "**/.env.production", "**/.env.development")
$CommitExclude = @(@(@($BaseExcl + $ExclExtra) | Where-Object { $_ } | Select-Object -Unique | ForEach-Object { ":(exclude)$_" }) + @($UnsafeGlobs | ForEach-Object { ":(exclude,glob)$_" }))

# -- tekst za agenta (sr / en) --------------------------------------------------
# U sr tekstu: c^=c sa kvacicom, c~=c sa crticom, s^, z^, dj~ (vidi Sr()).
function Sr([string]$s) {
  if ($Lang -ne "sr" -or -not $s) { return $s }
  return $s.Replace("Dj~", [string][char]0x0110).Replace("dj~", [string][char]0x0111).Replace("C^", [string][char]0x010C).Replace("c^", [string][char]0x010D).Replace("C~", [string][char]0x0106).Replace("c~", [string][char]0x0107).Replace("S^", [string][char]0x0160).Replace("s^", [string][char]0x0161).Replace("Z^", [string][char]0x017D).Replace("z^", [string][char]0x017E)
}

$TX = @{
  sr = @{
    header         = "Ovo je korak {0} noc~nog runa {1}. Pre rada obavezno proc^itaj {2} (pravila runa). Izvor istine: {3}. S^ta su prethodni koraci uradili i koje su ODLUKE donete: {4}."
    interrupted    = "NAPOMENA: ovaj korak je vec~ bio zapoc^et pa prekinut (gas^enje, restart ili gres^ka). Necommitovane izmene u repou su od tog pokus^aja: pregledaj ih (git status, git diff) i nastavi od njih umesto da krec~es^ ispoc^etka."
    planOnly       = "REZ^IM PLAN: samo c^itas^ i istraz^ujes^. NE menjaj nijedan fajl i ne pokrec~i komande koje menjaju stanje."
    planFinal      = "Kad zavrs^is^: CEO plan vrati kao zavrs^ni odgovor (poslednja poruka), u Markdown-u, bez skrac~ivanja i bez 'vidi gore'. Runner upisuje bas^ taj tekst u {0}. Plan ne pis^i u fajl i ne c^ekaj odobrenje."
    resumeMissing  = "NAPOMENA: ovaj korak je trebalo da nastavi sesiju koraka {0}, ali ide nova sesija. Pre svega proc^itaj plan iz {1} i sekciju {0} u {2}."
    contText       = "Nastavi korak {0} tac^no gde si stao (bio je prekid: limit, mrez^a ili isteklo vreme). Proveri git status i {1}, pa zavrs^i zadatak iz {2}."
    goal           = "Korak {0} je zavrs^en kada: (1) svaka stavka iz odeljka 'Prihvatanje' u {1} je ispunjena ili upisana kao BLOKADA sa razlogom; (2) prolaze provere: {2}; (3) sekcija '## {0}' je dopisana u {3}; (4) nijedan dev server ni drugi proces koji si pokrenuo nije ostao upaljen. Ako uslov ne moz^es^ da ispunis^ ni posle 12 pokus^aja, upis^i BLOKADA sa razlogom u {3} i stani."
    goalFallback   = "Proveri da li je sledec~e tac^no i, ako nije, radi dok ne bude: {0}"
    goalBaselineNote = "(ove su padale vec~ pre runa i nisu deo uslova; ne kvari ih dodatno: {0})"
    fix            = "Runner je posle koraka {0} pustio provere i NISU pros^le:{1}Popravi uzrok bez hakova (ne gasi i ne bris^i testove ni assertion-e, ne iskljuc^uj pravila lint-a, bez @ts-ignore i slic^nog). Pusti iste provere, pa dopuni sekciju {0} u {2}."
    stOk           = "Odgovori samo jednom rec^ju: OK"
    stResume       = "Koju si rec^ napisao u prethodnom odgovoru? Odgovori samo njom."
    stWrite        = "Test dozvola za noc~ni run. 1) Napravi fajl {0} sa tac^no tekstom OK. 2) Pokreni komandu: git --version 3) Odgovori samo izlazom te komande."
    stPlan         = "Test plan rez^ima. Napis^i plan u dve tac^ke kako bi napravio fajl {0} sa tekstom OK. NE pravi fajl, samo opis^i plan."
    stGoal         = "/goal Fajl {0} postoji i sadrz^i tac^no tekst OK. Ako ne uspes^ posle 5 pokus^aja, stani."
    progTitle      = "# {0} - napredak"
    progIntro      = "Noc~ni run {0}. Plan: ``{1}``. Pravila: ``{2}``. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA)."
    progHead       = "## {0} - {1}   ({2})"
    progPlan       = "**Plan korak.** Plan je upisan u ``{0}``. Kod nije menjan."
    progMissing    = "**Runner:** agent nije dopisao sekciju (verovatno je isteklo vreme). Provere prolaze; pogledaj ``git show`` ovog commita i ``{0}``."
    progBlocked    = "**Provere nisu pros^le ni posle {0} popravke:** {1}.`n**Rad je sac^uvan u git stash:** ``{2}`` (vrati sa ``git stash list`` / ``git stash apply``).`n**Za proveru:** ``{3}``. Sledec~i koraci su nastavili od poslednjeg dobrog commita."
    blockedSuffix  = " - BLOKADA (runner)"
    commitBody     = "Noc~ni run {0}, korak {1}. Detalji: {2}"
    wipTitle       = "chore: zatec^ene lokalne izmene pre noc~nog runa {0}"
    wipBody        = "Sve s^to je bilo izmenjeno u radnom stablu pre pokretanja runa, sac^uvano pre prvog koraka (bez .agents/.claude)."
    startTitle     = "plan, pravila i run fajlovi"
  }
  en = @{
    header         = "This is step {0} of the overnight run {1}. Before working, read {2} (run rules). Source of truth: {3}. What earlier steps did and which DECISIONS were made: {4}."
    interrupted    = "NOTE: this step was already started and then interrupted (shutdown, restart or error). Uncommitted changes in the repo come from that attempt: review them (git status, git diff) and continue from them instead of starting over."
    planOnly       = "PLAN MODE: only read and investigate. Do NOT change any file and do not run commands that change state."
    planFinal      = "When done: return the WHOLE plan as your final answer (last message), in Markdown, without shortening and without 'see above'. The runner writes exactly that text to {0}. Do not write the plan to a file and do not wait for approval."
    resumeMissing  = "NOTE: this step was supposed to continue the session of step {0}, but a new session is used. First read the plan in {1} and the {0} section in {2}."
    contText       = "Continue step {0} exactly where you stopped (there was an interruption: limit, network or timeout). Check git status and {1}, then finish the task from {2}."
    goal           = "Step {0} is done when: (1) every item of the 'Acceptance' section in {1} is met or recorded as BLOCKED with a reason; (2) these checks pass: {2}; (3) a '## {0}' section was appended to {3}; (4) no dev server or other process you started is still running. If you cannot meet this after 12 attempts, record BLOCKED with the reason in {3} and stop."
    goalFallback   = "Check whether the following is true and, if not, keep working until it is: {0}"
    goalBaselineNote = "(these already failed before the run and are not part of the condition; do not make them worse: {0})"
    fix            = "After step {0} the runner ran the checks and they FAILED:{1}Fix the cause without hacks (do not disable or delete tests or assertions, do not turn off lint rules, no @ts-ignore or similar). Run the same checks, then update the {0} section in {2}."
    stOk           = "Reply with exactly one word: OK"
    stResume       = "Which word did you write in your previous reply? Reply with only that word."
    stWrite        = "Permission test for an overnight run. 1) Create the file {0} containing exactly the text OK. 2) Run the command: git --version 3) Reply with only that command's output."
    stPlan         = "Plan mode test. Write a two-point plan for creating the file {0} with the text OK. Do NOT create the file, only describe the plan."
    stGoal         = "/goal The file {0} exists and contains exactly the text OK. If you fail after 5 attempts, stop."
    progTitle      = "# {0} - progress"
    progIntro      = "Overnight run {0}. Plan: ``{1}``. Rules: ``{2}``. Every step appends its own section at the end (with its own DECISIONS and BLOCKED items)."
    progHead       = "## {0} - {1}   ({2})"
    progPlan       = "**Plan step.** The plan was written to ``{0}``. No code changed."
    progMissing    = "**Runner:** the agent did not append its section (probably timed out). Checks pass; see ``git show`` of this commit and ``{0}``."
    progBlocked    = "**Checks still failing after {0} fix attempts:** {1}.`n**Work saved in git stash:** ``{2}`` (restore with ``git stash list`` / ``git stash apply``).`n**See:** ``{3}``. Later steps continued from the last good commit."
    blockedSuffix  = " - BLOCKED (runner)"
    commitBody     = "Overnight run {0}, step {1}. Details: {2}"
    wipTitle       = "chore: local changes found before overnight run {0}"
    wipBody        = "Everything that was modified in the working tree before the run started, saved before the first step (without .agents/.claude)."
    startTitle     = "plan, rules and run files"
  }
}
function Tx([string]$key) { return (Sr ([string]$TX[$Lang][$key])) }
function Txf([string]$key, [object[]]$vals) { return ((Tx $key) -f $vals) }

# -- steps.json + provera kompleta -----------------------------------------------
$stepsText = Read-Utf8 $StepsFile
$Steps = @()
try { $parsedSteps = $stepsText | ConvertFrom-Json; $Steps = @($parsedSteps | ForEach-Object { $_ }) } catch { Write-Log "STOP: steps.json nije ispravan JSON: $($_.Exception.Message)" Red; exit 7 }

function Test-Kit {
  $errs = New-Object System.Collections.Generic.List[string]
  if ($Steps.Count -lt 1) { $errs.Add("steps.json nema nijedan korak"); return ,$errs.ToArray() }
  $ids = @{}
  $modes = @("plan", "goal", "auto"); $sessions = @("nova", "ista", "new", "same"); $efforts = @("", "low", "medium", "high", "xhigh", "max")
  for ($i = 0; $i -lt $Steps.Count; $i++) {
    $s = $Steps[$i]; $id = [string]$s.id
    if (-not $id -or $id -notmatch '^[A-Za-z0-9_-]{1,16}$') { $errs.Add("korak #$($i + 1): neispravan id '$id'"); continue }
    if ($ids.ContainsKey($id)) { $errs.Add("${id}: dupli id") }
    if (-not [string]$s.title) { $errs.Add("${id}: nema title") }
    $m = [string]$s.mode; if ($modes -notcontains $m) { $errs.Add("${id}: mode mora biti plan, goal ili auto (sada '$m')") }
    $se = [string]$s.session; if (-not $se) { $se = "nova" }
    if ($sessions -notcontains $se) { $errs.Add("${id}: session mora biti nova ili ista (sada '$se')") }
    if ($se -eq "ista" -or $se -eq "same") {
      $rf = [string]$s.resumeFrom
      if (-not $rf -or -not $ids.ContainsKey($rf)) { $errs.Add("${id}: session ista trazi resumeFrom = ID nekog RANIJEG koraka") }
    }
    $e = [string]$s.effort; if ($efforts -notcontains $e) { $errs.Add("${id}: effort mora biti low/medium/high/xhigh/max (sada '$e')") }
    $t = 0; [void][int]::TryParse([string]$s.timeoutMin, [ref]$t)
    if ($t -lt 5 -or $t -gt 720) { $errs.Add("${id}: timeoutMin mora biti 5-720 (sada '$($s.timeoutMin)')") }
    $pf = Join-Path $PromptDir "$id.md"
    if (-not (Test-Path -LiteralPath $pf)) { $errs.Add("${id}: nema prompts/$id.md") }
    elseif ((Read-Utf8 $pf).Trim().Length -lt 40) { $errs.Add("${id}: prompts/$id.md je skoro prazan") }
    $ids[$id] = $i
  }
  if (-not (Test-Path -LiteralPath $RulesFile)) { $errs.Add("nema rules.md") }
  foreach ($g in $Gates) { if (-not [string]$g.name -or -not [string]$g.cmd) { $errs.Add("config.json gates: svaka provera mora imati name i cmd") } }
  if ($From -and -not ($Steps | Where-Object { [string]$_.id -eq $From })) { $errs.Add("-From $From ne postoji u steps.json") }
  return ,$errs.ToArray()
}

# -- stanje -------------------------------------------------------------------
function New-State {
  return [pscustomobject]@{ run = $Name; branch = $Branch; startedAt = $null; finishedAt = $null; stoppedAt = $null; current = $null
    totalUsd = 0.0; sessionCosts = [pscustomobject]@{}; selftest = $null; baseline = $null; steps = [pscustomobject]@{} }
}
function Load-State {
  $s = $null
  if (Test-Path -LiteralPath $StateFile) {
    try { $s = (Read-Utf8 $StateFile) | ConvertFrom-Json } catch {
      $s = $null
      try { Copy-Item -LiteralPath $StateFile -Destination (Join-Path $RunDir "state.bad.json") -Force } catch { }
      Write-Log "state.json nije citljiv - pravim nov (stari je sacuvan kao state.bad.json)" Yellow
    }
  }
  if (-not $s) { return New-State }
  foreach ($k in @("steps", "sessionCosts")) { if (-not $s.PSObject.Properties[$k] -or $null -eq $s.$k) { $s | Add-Member -NotePropertyName $k -NotePropertyValue ([pscustomobject]@{}) -Force } }
  if (-not $s.PSObject.Properties["totalUsd"] -or $null -eq $s.totalUsd) { $s | Add-Member -NotePropertyName totalUsd -NotePropertyValue 0.0 -Force }
  foreach ($k in @("run", "branch", "startedAt", "finishedAt", "stoppedAt", "current", "selftest", "baseline")) {
    if (-not $s.PSObject.Properties[$k]) { $s | Add-Member -NotePropertyName $k -NotePropertyValue $null -Force }
  }
  return $s
}
function Save-State {
  $tmp = "$StateFile.tmp"
  try {
    [System.IO.File]::WriteAllText($tmp, ($State | ConvertTo-Json -Depth 12), $Utf8)
    Move-Item -LiteralPath $tmp -Destination $StateFile -Force
  } catch { Write-Log "state.json nije upisan: $($_.Exception.Message)" Red }
}
function Get-StepState([string]$id) { $p = $State.steps.PSObject.Properties[$id]; if ($p) { return $p.Value }; return $null }
function Set-StepState([string]$id, $obj) {
  if ($State.steps.PSObject.Properties[$id]) { $State.steps.$id = $obj }
  else { $State.steps | Add-Member -NotePropertyName $id -NotePropertyValue $obj }
  Save-State
}
function Set-Current([string]$id, [string]$phase) {
  $State.current = [pscustomobject]@{ id = $id; phase = $phase; since = (Get-Date).ToString("s") }
  Save-State
}
function Add-Cost([double]$usd) { $State.totalUsd = [math]::Round([double]$State.totalUsd + $usd, 6); Save-State }
function Fmt-Usd([double]$x) { return $x.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture) }

# total_cost_usd iz `claude -p` je ZBIR cele sesije kad se sesija nastavlja (--resume).
# Zato se po sesiji pamti poslednji zbir i racuna samo razlika.
function Get-CostDelta([string]$sid, [double]$raw) {
  if ($raw -le 0) { return 0.0 }
  if (-not $sid) { return $raw }
  $prev = 0.0
  $p = $State.sessionCosts.PSObject.Properties[$sid]
  if ($p) { $prev = [double]$p.Value; $State.sessionCosts.$sid = $raw }
  else { $State.sessionCosts | Add-Member -NotePropertyName $sid -NotePropertyValue $raw }
  if ($prev -gt 0 -and $raw -ge $prev) { return ($raw - $prev) }
  return $raw
}

# -- effort i modeli ------------------------------------------------------------
$EffortOrder = @("low", "medium", "high", "xhigh", "max")
$script:EffortVia = "flag"      # flag | env | none
$script:EffortMap = @{}
$script:ModelMap  = @{}
$script:PlanOk    = $true
$script:GoalOk    = $true
$script:ResumeOk  = $true
$script:StepModel = $Model
$script:ConsecutiveFail = 0

function Get-Effort([string]$e) {
  if (-not $e) { return "" }
  $hops = 0
  while ($script:EffortMap.ContainsKey($e) -and $hops -lt 6) { $e = [string]$script:EffortMap[$e]; $hops++ }
  return $e
}
function Get-EffortDesc([string]$e) {
  if ($script:EffortVia -eq "none") { return "bez efforta" }
  return "$(Get-Effort $e) ($($script:EffortVia))"
}
function Remap-Effort([string]$bad, [string]$msg) {
  $allowed = @()
  if ($msg -match '(?i)allowed choices are ([a-z, ]+)') { $allowed = @($Matches[1] -split '[,\s]+' | Where-Object { $_ -and $_ -ne 'and' -and $_ -ne 'or' }) }
  $i = [array]::IndexOf($EffortOrder, $bad)
  for ($j = $i - 1; $j -ge 0; $j--) {
    $c = $EffortOrder[$j]
    if ($allowed.Count -eq 0 -or $allowed -contains $c) { return $c }
  }
  return ""
}
function Get-ModelAlias([string]$m) {
  if ($m -match '(?i)opus') { return "opus" }
  if ($m -match '(?i)sonnet') { return "sonnet" }
  if ($m -match '(?i)haiku') { return "haiku" }
  return ""
}
function Resolve-Model([string]$m) {
  if (-not $m) { $m = $Model }
  $hops = 0
  while ($script:ModelMap.ContainsKey($m) -and $hops -lt 4) { $m = [string]$script:ModelMap[$m]; $hops++ }
  return $m
}

# -- procesi (Windows: .cmd, ostalo: bash) ----------------------------------------
function QW([string]$s) { return '"' + $s + '"' }
function QS([string]$s) { return "'" + ($s -replace "'", "'\''") + "'" }
function Q([string]$s) { if ($IsWin) { return (QW $s) }; return (QS $s) }

function New-RunScript([string]$name, [string[]]$body, [hashtable]$callEnv) {
  $pairs = New-Object System.Collections.Generic.List[object]
  if ($EnvCfg) { foreach ($p in $EnvCfg.PSObject.Properties) { $pairs.Add(@($p.Name, [string]$p.Value)) } }
  if ($callEnv) { foreach ($k in $callEnv.Keys) { $pairs.Add(@($k, [string]$callEnv[$k])) } }
  if ($IsWin) {
    $path = Join-Path $LogDir "$name.cmd"
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("@echo off"); $lines.Add("chcp 65001 >nul"); $lines.Add("cd /d " + (QW $RepoPath))
    foreach ($pr in $pairs) { $lines.Add('set "' + $pr[0] + '=' + $pr[1] + '"') }
    foreach ($b in $body) { $lines.Add($b) }
    $lines.Add("exit /b %ERRORLEVEL%")
    [System.IO.File]::WriteAllText($path, (($lines.ToArray()) -join "`r`n") + "`r`n", $Utf8)
  } else {
    $path = Join-Path $LogDir "$name.sh"
    $lines = New-Object System.Collections.Generic.List[string]
    $lines.Add("#!/usr/bin/env bash"); $lines.Add("cd " + (QS $RepoPath))
    foreach ($pr in $pairs) { if ($pr[1] -eq "") { $lines.Add("unset " + $pr[0]) } else { $lines.Add("export " + $pr[0] + "=" + (QS $pr[1])) } }
    foreach ($b in $body) { $lines.Add($b) }
    [System.IO.File]::WriteAllText($path, (($lines.ToArray()) -join "`n") + "`n", $Utf8)
  }
  return $path
}

function Stop-Tree([int]$procId) {
  if ($IsWin) { & taskkill /PID $procId /T /F 2>&1 | Out-Null; return }
  try {
    $kids = @(& ps -o pid= --ppid $procId 2>$null | ForEach-Object { "$_".Trim() } | Where-Object { $_ })
    foreach ($k in $kids) { Stop-Tree ([int]$k) }
  } catch { }
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

function Start-RunScript([string]$path, [int]$timeoutMin) {
  if ($IsWin) { $p = Start-Process -FilePath "cmd.exe" -ArgumentList ("/c " + (QW $path)) -PassThru -NoNewWindow }
  else { $p = Start-Process -FilePath "bash" -ArgumentList (QW $path) -PassThru -NoNewWindow }
  $null = $p.Handle
  $timedOut = $false
  if (-not $p.WaitForExit([int]($timeoutMin * 60 * 1000))) {
    Stop-Tree $p.Id
    $timedOut = $true
    try { [void]$p.WaitForExit(15000) } catch { }
  } else { $p.WaitForExit() }
  $code = $null
  if (-not $timedOut) { try { $code = $p.ExitCode } catch { $code = 1 } }
  return [pscustomobject]@{ timedOut = $timedOut; code = $code }
}

# Pokrece komandu provere (cmd na Windows-u, bash drugde), izlaz u logs\<korak>_<ime>.txt
function Run-Cmd([string]$label, [string]$command, [int]$timeoutMin = 30) {
  $base = "{0}_{1}" -f $script:CurrentId, $label
  $out = Join-Path $LogDir "$base.txt"
  if ($IsWin) { $body = @("call $command > " + (QW $out) + " 2>&1") } else { $body = @("$command > " + (QS $out) + " 2>&1") }
  $sf = New-RunScript $base $body @{}
  $r = Start-RunScript $sf $timeoutMin
  $text = Read-Utf8 $out
  if ($r.timedOut) { return [pscustomobject]@{ code = 124; out = $out; text = $text + "`n[runner] isteklo vreme ($timeoutMin min)" } }
  return [pscustomobject]@{ code = $r.code; out = $out; text = $text }
}

# Gasi samo dev servere OVOG repoa (komandna linija sadrzi putanju repoa).
function Stop-DevServers {
  $repoRx = [regex]::Escape($RepoPath)
  if ($IsWin) {
    try {
      Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
        Where-Object { $_.CommandLine -and $_.CommandLine -match $repoRx -and $_.CommandLine -match $DevPattern } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Log "  ugasen zaostali dev proces $($_.ProcessId)" DarkGray }
    } catch { }
    foreach ($port in $DevPorts) {
      try {
        Get-NetTCPConnection -LocalPort ([int]$port) -State Listen -ErrorAction Stop | ForEach-Object {
          $pp = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
          if ($pp -and $pp.CommandLine -and $pp.CommandLine -match $repoRx) { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Log "  ugasen proces na portu $port" DarkGray }
        }
      } catch { }
    }
  } else {
    try {
      foreach ($l in @(& ps -eo "pid=,args=" 2>$null)) {
        if ("$l" -match '^\s*(\d+)\s+(.*)$') {
          $procId = [int]$Matches[1]; $cmdline = $Matches[2]
          if ($procId -ne $PID -and $cmdline -match $repoRx -and $cmdline -match $DevPattern) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue; Write-Log "  ugasen zaostali dev proces $procId" DarkGray
          }
        }
      }
    } catch { }
  }
}

# -- git ----------------------------------------------------------------------
function Clear-StaleGitLock {
  $lock = Join-Path (Join-Path $RepoPath ".git") "index.lock"
  if (-not (Test-Path -LiteralPath $lock)) { return }
  if (@(Get-Process -Name git -ErrorAction SilentlyContinue).Count -gt 0) { return }
  $dest = "$lock.stale-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  try { Move-Item -LiteralPath $lock -Destination $dest -Force -ErrorAction Stop; Write-Log "  git: zaostali index.lock sklonjen ($(Split-Path $dest -Leaf))" Yellow }
  catch { Write-Log "  git: index.lock postoji i ne mogu da ga sklonim: $($_.Exception.Message)" Red }
}

function Invoke-Git([string[]]$GitArgs) {
  for ($i = 1; $i -le 4; $i++) {
    $out = & git -c advice.addIgnoredFile=false @GitArgs 2>&1
    if ($LASTEXITCODE -eq 0) { return $true }
    $txt = ($out | Out-String)
    if ($txt -match 'index\.lock') { Start-Sleep -Seconds (5 * $i); Clear-StaleGitLock; continue }
    # `git add` vraca 1 kad je neki iskljuceni put vec u .gitignore - ostali fajlovi su ipak dodati.
    if ($GitArgs[0] -eq "add" -and $txt -match 'ignored by one of your \.gitignore' -and $txt -notmatch '(?m)^(fatal|error):') { return $true }
    Write-Log ("  git {0}: {1}" -f ($GitArgs -join " "), (Tail-Text ($out | Out-String) 3)) DarkYellow
    return $false
  }
  return $false
}

function Commit-Paths([string]$message, [string[]]$pathspec) {
  $null = Invoke-Git (@("add", "-A", "--") + $pathspec)
  $staged = & git diff --cached --name-only 2>$null
  if (-not $staged) { return "" }
  $msgFile = Join-Path $TmpDir ("commitmsg-{0}.txt" -f (Get-Date -Format "HHmmssfff"))
  [System.IO.File]::WriteAllText($msgFile, $message, $Utf8)
  $ok = Invoke-Git @("-c", "commit.gpgsign=false", "commit", "-q", "-F", $msgFile)
  if (-not $ok) { $ok = Invoke-Git @("-c", "commit.gpgsign=false", "-c", "user.name=Nocni run", "-c", "user.email=nocni-run@localhost", "commit", "-q", "-F", $msgFile) }
  Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
  if (-not $ok) { return "" }
  return ((& git rev-parse --short HEAD 2>$null) | Out-String).Trim()
}

function Commit-Step([string]$id, [string]$title, [string]$status) {
  if ($NoCommit -or $DryRun) { return }
  $msg = "{0}({1}): {2} [{3}]`n`n{4}`n" -f $Slug, $id, $title, $status, (Txf "commitBody" @($Name, $id, $ProgRel))
  if ($Trailer) { $msg += "`n$Trailer`n" }
  $h = Commit-Paths $msg (@(".") + $CommitExclude)
  if ($h) { Write-Log "  ${id}: commit $h" DarkGray } else { Write-Log "  ${id}: nema izmena za commit" DarkGray }
}

function Stash-Broken([string]$id) {
  if ($DryRun) { return "" }
  $name = "$Slug-run BLOKADA $id $(Get-Date -Format 'yyyyMMdd-HHmm')"
  $spec = @(".", ":(exclude).agents", ":(exclude).claude", ":(exclude).playwright-mcp", ":(exclude)$RunRel")
  if ($AssetsReadyRel) { $spec += ":(exclude)$AssetsReadyRel" }
  foreach ($x in $ExclExtra) { if ($x) { $spec += ":(exclude)$x" } }
  foreach ($x in $UnsafeGlobs) { $spec += ":(exclude,glob)$x" }
  $ok = Invoke-Git (@("stash", "push", "-u", "-m", $name, "--") + $spec)
  if ($ok) { Write-Log "  ${id}: polomljen rad sacuvan u git stash ('$name'), repo vracen na poslednji dobar commit" Yellow }
  else { Write-Log "  ${id}: git stash NIJE uspeo - izmene ostaju u radnom stablu" Red; $name = "(stash nije uspeo)" }
  return $name
}

function Ensure-GitIgnore {
  $gi = Join-Path $RepoPath ".gitignore"
  $want = @("$RunRel/logs/", "$RunRel/tmp/", "$RunRel/state.json", "$RunRel/state.json.tmp", "$RunRel/state.bad.json", "$RunRel/STOP", "$RunRel/baseline.txt", "$RunRel/mcp.json")
  if ($Assets) { $want += "$RunRel/slike/" }
  $cur = Read-Utf8 $gi
  $have = @($cur -split "`r?`n" | ForEach-Object { $_.Trim() })
  $add = @($want | Where-Object { $have -notcontains $_ })
  if ($add.Count -eq 0) { return }
  $text = ""
  if ($cur -and -not $cur.EndsWith("`n")) { $text = "`n" }
  $text += "`n# nocni run $Slug (logovi i stanje runnera)`n" + ($add -join "`n") + "`n"
  [System.IO.File]::AppendAllText($gi, $text, $Utf8)
  Write-Log "  .gitignore: dodato $($add.Count) linija za logove i stanje runa" DarkGray
}

# Necommitovani i neignorisani zavisnosti/build/.env fajlovi: runner ih ne sme commitovati.
function Get-UnsafeUntracked {
  $out = @(& git --no-optional-locks ls-files --others --exclude-standard --directory 2>$null)
  $bad = @($out | ForEach-Object { "$_".Trim('"') } | Where-Object {
    ($_ -match '(^|/)node_modules/' -or $_ -match '(^|/)\.(next|nuxt|turbo|vercel|svelte-kit)/' -or
     ($_ -match '(^|/)\.env(\.[^/]*)?$' -and $_ -notmatch '\.env\.(example|sample|template)$'))
  })
  return ,$bad
}

# -- progress -----------------------------------------------------------------
function Append-Progress([string]$text) {
  if (-not (Test-Path -LiteralPath $Progress)) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Progress) | Out-Null
    $head = (Txf "progTitle" @($Name)) + "`n`n" + (Txf "progIntro" @($Name, $PlanRel, "$RunRel/rules.md")) + "`n"
    [System.IO.File]::WriteAllText($Progress, $head, $Utf8)
  }
  [System.IO.File]::AppendAllText($Progress, "`n" + $text + "`n", $Utf8)
}
function Has-ProgressSection([string]$id) {
  $t = Read-Utf8 $Progress
  return ($t -match ("(?m)^##\s+" + [regex]::Escape($id) + "\b"))
}

# -- claude -p ----------------------------------------------------------------
# Mode: "auto" (svaka radnja ide kroz klasifikator) ili "plan" (samo citanje).
function Invoke-Claude {
  param([string]$Tag, [string]$PromptText, [string]$Effort, [string]$Mode,
        [string]$ResumeId = "", [int]$TimeoutMin = 120, [string]$UseModel = "")
  if (-not $UseModel) { $UseModel = $script:StepModel }
  if (-not $UseModel) { $UseModel = $Model }
  $base   = Join-Path $LogDir $Tag
  $prompt = "$base.prompt.md"
  $jsonl  = "$base.jsonl"
  $err    = "$base.err.txt"
  [System.IO.File]::WriteAllText($prompt, $PromptText, $Utf8)

  $perm = "--permission-mode auto"
  if ($Mode -eq "plan") { $perm = "--permission-mode plan" }
  $eff = Get-Effort $Effort
  $callEnv = @{ "ENABLE_CLAUDEAI_MCP_SERVERS" = "false"; "CLAUDE_CODE_EFFORT_LEVEL" = "" }
  $effortArg = ""
  if ($eff -and $script:EffortVia -eq "flag") { $effortArg = "--effort $eff" }
  if ($eff -and $script:EffortVia -eq "env")  { $callEnv["CLAUDE_CODE_EFFORT_LEVEL"] = $eff }
  $parts = New-Object System.Collections.Generic.List[string]
  if ($IsWin) { $parts.Add("call") }
  foreach ($x in @("claude", "-p", "--model", (Q $UseModel))) { $parts.Add($x) }
  if ($effortArg) { $parts.Add($effortArg) }
  foreach ($x in @($perm, "--output-format", "stream-json", "--verbose", "--strict-mcp-config", "--mcp-config", (Q $McpFile))) { $parts.Add($x) }
  if ($ResumeId) { $parts.Add("--resume"); $parts.Add($ResumeId) }
  foreach ($x in @("--disallowedTools", (Q $Deny), "<", (Q $prompt), ">", (Q $jsonl), "2>", (Q $err))) { $parts.Add($x) }
  $line = ($parts.ToArray()) -join " "
  $sf = New-RunScript $Tag @($line) $callEnv

  if ($DryRun) {
    return [pscustomobject]@{ ok = $true; timedOut = $false; exit = 0; sessionId = "dry-$Tag"; cost = 0.0; isError = $false; result = "dry run"
      errTail = ""; limit = $false; net = $false; auth = $false; badFlag = ""; denials = 0; minutes = 0; turns = 0; jsonl = $jsonl; script = $sf }
  }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $run = Start-RunScript $sf $TimeoutMin
  $res = [ordered]@{
    ok = $false; timedOut = $run.timedOut; exit = $run.code; sessionId = $null; cost = 0.0; isError = $true
    result = ""; errTail = ""; limit = $false; net = $false; auth = $false; badFlag = ""; denials = 0
    minutes = [math]::Round($sw.Elapsed.TotalMinutes, 1); turns = 0; jsonl = $jsonl; script = $sf
  }
  $all = @()
  if (Test-Path -LiteralPath $jsonl) { $all = [System.IO.File]::ReadAllLines($jsonl, [System.Text.Encoding]::UTF8) }
  $resultLine = $null
  for ($i = $all.Count - 1; $i -ge 0; $i--) { if ($all[$i] -match '"type"\s*:\s*"result"') { $resultLine = $all[$i]; break } }
  foreach ($l in $all) { if ($l -match '"session_id"\s*:\s*"([^"]+)"') { $res.sessionId = $Matches[1]; break } }
  if ($resultLine) {
    try {
      $r = $resultLine | ConvertFrom-Json
      if ($r.session_id) { $res.sessionId = [string]$r.session_id }
      if ($r.total_cost_usd) { $res.cost = [double]$r.total_cost_usd }
      if ($r.num_turns) { $res.turns = [int]$r.num_turns }
      $res.isError = [bool]$r.is_error
      $res.result  = [string]$r.result
      if ($r.permission_denials) { $res.denials = @($r.permission_denials).Count }
      $res.ok = -not $res.isError
    } catch { }
  }
  $errText = Read-Utf8 $err
  $res.errTail = Tail-Text $errText 15
  $hay = "$($res.result)`n$errText"
  $shortResult = ($res.result.Length -lt 400)
  if ($res.isError -or -not $resultLine -or $shortResult) {
    if ($hay -match "(?i)hit your [a-z ]*limit|usage limit|limit reached|out of extra usage|rate_limit_error|resets \d|resets [a-z]{3}|\b429\b") { $res.limit = $true }
  }
  if ($res.isError -or -not $resultLine) {
    if ($hay -match "(?i)oauth (session|token) (has )?expired|failed to authenticate|invalid api key|please run /login|not logged in|authentication_error") { $res.auth = $true }
    if ($errText -match "(?i)(unknown option '[^']+'|unknown argument '[^']+'|option '[^']+' argument[^\r\n]*|argument '[^']+' is invalid[^\r\n]*|invalid value[^\r\n]*)") { $res.badFlag = $Matches[1] }
    if (-not $res.limit -and -not $res.auth -and -not $res.badFlag -and
        $hay -match "(?i)ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network error|overloaded|\b529\b|\b502\b|\b503\b|connection error") { $res.net = $true }
  }
  if ($res.ok -and $res.limit -and -not $shortResult) { $res.limit = $false }
  return [pscustomobject]$res
}

# Plan iz plan koraka: najduzi od (zavrsni odgovor | ExitPlanMode | fajl u ~/.claude/plans).
function Get-PlanText($r) {
  $best = [string]$r.result
  if (-not $r.jsonl -or -not (Test-Path -LiteralPath $r.jsonl)) { return $best }
  $planFiles = New-Object System.Collections.Generic.List[string]
  foreach ($l in [System.IO.File]::ReadAllLines($r.jsonl, [System.Text.Encoding]::UTF8)) {
    if ($l -notmatch '"name"\s*:\s*"(ExitPlanMode|Write|Edit|MultiEdit)"') { continue }
    try { $o = $l | ConvertFrom-Json } catch { continue }
    if (-not $o.message -or -not $o.message.content) { continue }
    foreach ($c in @($o.message.content)) {
      if ($c.type -ne "tool_use" -or -not $c.input) { continue }
      $txt = ""
      if ($c.name -eq "ExitPlanMode" -and $c.input.plan) { $txt = [string]$c.input.plan }
      $fp = [string]$c.input.file_path
      if ($fp -and $fp -match '[\\/]\.claude[\\/]plans[\\/]') {
        if (-not $planFiles.Contains($fp)) { $planFiles.Add($fp) }
        if ($c.name -eq "Write" -and $c.input.content) { $txt = [string]$c.input.content }
      }
      if ($txt.Length -gt $best.Length) { $best = $txt }
    }
  }
  foreach ($fp in $planFiles) { $disk = Read-Utf8 $fp; if ($disk.Length -gt $best.Length) { $best = $disk } }
  return $best
}

# Koliko minuta do reseta limita (razni formati poruka). Nepoznato -> 15.
function Get-LimitWaitMinutes([string]$text) {
  $now = Get-Date
  if ($text -match 'limit reached\|(\d{10})') {
    $t = ([DateTimeOffset]::FromUnixTimeSeconds([int64]$Matches[1])).LocalDateTime
    return [math]::Ceiling(($t - $now).TotalMinutes) + 3
  }
  $rx = '(?i)resets?\s+(?:at\s+)?(?:(?<mon>jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?<day>\d{1,2})(?:st|nd|rd|th)?,?\s+(?:at\s+)?)?(?<h>\d{1,2})(?::(?<m>\d{2}))?\s*(?<ap>[ap]\.?m\.?)?'
  if ($text -match $rx) {
    $h = [int]$Matches['h']; $m = 0; if ($Matches['m']) { $m = [int]$Matches['m'] }
    $ap = [string]$Matches['ap']
    if ($ap) { $ap = $ap -replace '\.', ''; if ($ap -ieq 'pm' -and $h -lt 12) { $h += 12 }; if ($ap -ieq 'am' -and $h -eq 12) { $h = 0 } }
    if ($h -lt 24 -and $m -lt 60) {
      if ($Matches['mon']) {
        $months = @{ jan = 1; feb = 2; mar = 3; apr = 4; may = 5; jun = 6; jul = 7; aug = 8; sep = 9; oct = 10; nov = 11; dec = 12 }
        $mo = [int]$months[$Matches['mon'].ToLower()]; $d = [int]$Matches['day']
        try { $t = New-Object DateTime ($now.Year, $mo, $d, $h, $m, 0) } catch { $t = $now.AddMinutes(60) }
        if ($t -lt $now.AddDays(-2)) { $t = $t.AddYears(1) }
      } else {
        $t = $now.Date.AddHours($h).AddMinutes($m)
        while ($t -lt $now) { $t = $t.AddDays(1) }
      }
      return [math]::Ceiling(($t - $now).TotalMinutes) + 3
    }
  }
  if ($text -match '(?i)\bin\s+(\d+)\s*(h|hr|hrs|hours?)\b') { return ([int]$Matches[1]) * 60 + 3 }
  if ($text -match '(?i)\bin\s+(\d+)\s*(m|min|mins|minutes?)\b') { return ([int]$Matches[1]) + 3 }
  return 15
}

function Wait-ForLimit([string]$text) {
  $wait = Get-LimitWaitMinutes $text
  if ($wait -lt 5) { $wait = 5 }
  if ($wait -gt 360) { $wait = 360 }
  Write-Log ("LIMIT: cekam {0} min (do {1})" -f $wait, (Get-Date).AddMinutes($wait).ToString("HH:mm")) Yellow
  Start-Sleep -Seconds ($wait * 60)
  Write-Log "LIMIT: nastavljam" DarkGray
}

# Jedan poziv sa ponovnim pokusajima (limit, mreza, prijava, nepoznat flag).
function Invoke-WithRetry {
  param([string]$TagBase, [string]$PromptText, [string]$Effort, [string]$Mode, [string]$ResumeId, [int]$TimeoutMin, [string]$ContinueText, [string]$UseModel = "")
  $sid = $ResumeId; $text = $PromptText; $net = 0; $lim = 0; $n = 0; $total = 0.0; $flagFix = 0; $authWait = 0
  $netWaits = @(2, 5, 10, 20, 30, 30, 30, 30, 60, 60, 60, 60)
  while ($true) {
    $n++
    $r = Invoke-Claude -Tag "${TagBase}_$n" -PromptText $text -Effort $Effort -Mode $Mode -ResumeId $sid -TimeoutMin $TimeoutMin -UseModel $UseModel
    $d = Get-CostDelta $r.sessionId $r.cost
    $total += $d; Add-Cost $d
    if ($r.sessionId) { $sid = $r.sessionId }
    if ($r.auth) {
      $authWait++
      if ($authWait -eq 1 -or ($authWait % 12) -eq 0) {
        Write-Log "LOGIN: claude CLI nije prijavljen (istekla prijava). U terminalu pokreni 'claude' i uradi /login - run sam nastavlja (proveravam na 5 min)." Red
      }
      if ($authWait -gt 864) { Stop-Run "72 h bez prijave. Posle /login ponovo pokreni pokreni.cmd" 2 }
      Start-Sleep -Seconds 300
      continue
    }
    if ($authWait -gt 0) { Write-Log "LOGIN: prijava radi - nastavljam" Green; $authWait = 0 }
    if ($r.badFlag -and $flagFix -lt 8) {
      $flagFix++
      if ($r.badFlag -match "(?i)permission.mode") {
        Stop-Run "ova verzija claude CLI-ja ne prihvata --permission-mode auto/plan ($($r.badFlag)). Run namerno ne zaobilazi dozvole - azuriraj Claude Code (claude update) pa pokreni ponovo." 4
      }
      if ($r.badFlag -match "(?i)effort") {
        if ($r.badFlag -match "(?i)unknown option" -and $script:EffortVia -eq "flag") {
          $script:EffortVia = "env"; Write-Log "CLI ne zna --effort: effort ide kroz CLAUDE_CODE_EFFORT_LEVEL" Yellow; continue
        }
        $bad = Get-Effort $Effort
        $to = Remap-Effort $bad "$($r.badFlag) $($r.errTail)"
        if ($to -and $bad) { $script:EffortMap[$bad] = $to; Write-Log "CLI ne prihvata effort '$bad' - koristim '$to'" Yellow; continue }
        if ($script:EffortVia -ne "none") { $script:EffortVia = "none"; Write-Log "effort ne radi - nastavljam bez njega ($($r.badFlag))" Yellow; continue }
      }
      Write-Log "CLI greska u argumentima: $($r.badFlag)" Red
    }
    if ($r.limit -and $lim -lt 400) {
      $lim++; Wait-ForLimit "$($r.result) $($r.errTail)"
      if ($sid -and $ContinueText) { $text = $ContinueText }
      continue
    }
    if ($r.net -and $net -lt $netWaits.Count) {
      $w = $netWaits[$net]; $net++
      Write-Log "MREZA pala (pokusaj $net/$($netWaits.Count)) - cekam $w min" Magenta
      Start-Sleep -Seconds ($w * 60)
      Write-Log "MREZA: nastavljam" DarkGray
      if ($sid -and $ContinueText) { $text = $ContinueText }
      continue
    }
    if ($r.denials -ge 3) { Write-Log "  ${TagBase}: auto rezim je odbio $($r.denials) radnji (vidi $(Split-Path $r.jsonl -Leaf))" Yellow }
    $r | Add-Member -NotePropertyName totalCost -NotePropertyValue $total -Force
    $r | Add-Member -NotePropertyName lastSession -NotePropertyValue $sid -Force
    $r | Add-Member -NotePropertyName calls -NotePropertyValue $n -Force
    return $r
  }
}

# -- provere (gates) --------------------------------------------------------------
$ftjs = @'
const fs = require("fs"), path = require("path");
let r;
try { r = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); } catch (e) { console.log("PARSE_FAIL"); process.exit(0); }
console.log("PARSED_OK");
for (const f of (r.testResults || [])) {
  const leaf = path.basename(String(f.name || f.testFilePath || ""));
  const failed = (f.assertionResults || []).filter(a => a.status === "failed");
  for (const a of failed) console.log((leaf + " :: " + (a.fullName || a.title || "")).replace(/\s+/g, " "));
  if (f.status === "failed" && failed.length === 0) console.log(leaf + " :: (greska u fajlu)");
}
'@
[System.IO.File]::WriteAllText($FailedTestsJs, $ftjs, $Utf8)

function Get-FailedTests([string]$jsonPath) {
  if (-not (Test-Path -LiteralPath $jsonPath)) { return $null }
  if ($IsWin) { $cmd = "node " + (QW $FailedTestsJs) + " " + (QW $jsonPath) } else { $cmd = "node " + (QS $FailedTestsJs) + " " + (QS $jsonPath) }
  $o = Run-Cmd "failedtests" $cmd 5
  $lines = @(($o.text -split "`r?`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
  if ($lines.Count -eq 0 -or $lines[0] -ne "PARSED_OK") { return $null }
  $list = New-Object System.Collections.Generic.List[string]
  for ($i = 1; $i -lt $lines.Count; $i++) { $list.Add($lines[$i]) }
  return ,$list.ToArray()
}

function Path-Changed([string]$path) {
  $st = & git --no-optional-locks status --porcelain -- $path 2>$null
  return [bool]$st
}

function Test-BaselineBad([string]$gate) {
  if (-not $State.baseline -or -not $State.baseline.bad) { return $false }
  $p = $State.baseline.bad.PSObject.Properties[$gate]
  return ($p -and [bool]$p.Value)
}
function Set-BaselineBad([string]$gate, [bool]$v) {
  if (-not $State.baseline) { return }
  if ($State.baseline.bad.PSObject.Properties[$gate]) { $State.baseline.bad.$gate = $v }
  else { $State.baseline.bad | Add-Member -NotePropertyName $gate -NotePropertyValue $v }
  Save-State
}

function Get-AgentChecksText {
  $agentGates = @($Gates | Where-Object { $SkipSet -notcontains ([string]$_.name).ToLower() -and -not ($_.PSObject.Properties["agent"] -and $_.agent -eq $false) })
  # Provere koje su padale vec pre runa nisu u uslovu (agent ih ne moze/ne sme popraviti po pravilima).
  $bad = @($agentGates | Where-Object { Test-BaselineBad ([string]$_.name) })
  $cmds = @($agentGates | Where-Object { -not (Test-BaselineBad ([string]$_.name)) } | ForEach-Object {
    $c = [string]$_.cmd
    if ([string]$_.when -match '^changed:(.+)$') { $c += $(if ($Lang -eq "en") { " (if " + $Matches[1].Trim() + " changed)" } else { " (ako je menjan " + $Matches[1].Trim() + ")" }) }
    $c })
  $text = "-"; if ($cmds.Count -gt 0) { $text = ($cmds -join ", ") }
  if ($bad.Count -gt 0) { $text += " " + (Txf "goalBaselineNote" @((@($bad | ForEach-Object { [string]$_.cmd }) -join ", "))) }
  return $text
}

function Run-Gates([string]$id, [switch]$IsBaseline) {
  Stop-DevServers
  $fails = New-Object System.Collections.Generic.List[string]
  $summary = ""
  $detail = @{}
  $failedAll = @()
  foreach ($g in $Gates) {
    $gn = [string]$g.name
    if ($SkipSet -contains $gn.ToLower()) { continue }
    $when = [string]$g.when
    if (-not $IsBaseline -and $when -match '^changed:(.+)$') { if (-not (Path-Changed $Matches[1].Trim())) { continue } }
    $to = 30; if ($g.timeoutMin) { $to = [int]$g.timeoutMin }
    $kind = ([string]$g.kind).ToLower()
    if ($kind -eq "vitest" -or $kind -eq "jest") {
      $json = Join-Path $LogDir ("{0}_{1}.json" -f $id, $gn)
      if (Test-Path -LiteralPath $json) { Remove-Item -LiteralPath $json -Force }
      $flag = " --json --outputFile="; if ($kind -eq "vitest") { $flag = " --reporter=json --outputFile=" }
      $q = QS $json; if ($IsWin) { $q = QW $json }
      $v = Run-Cmd $gn ([string]$g.cmd + $flag + $q) $to
      $failed = Get-FailedTests $json
      if ($null -eq $failed) {
        $detail[$gn] = $v.code
        if ($v.code -ne 0) { $fails.Add($gn); $summary += "### $($g.cmd) (exit $($v.code), JSON izvestaj nije nastao)`n" + (Tail-Text $v.text 60) + "`n`n" }
      } else {
        $failedAll = $failed
        $base = @(); if ($State.baseline -and $State.baseline.failedTests) { $base = @($State.baseline.failedTests) }
        $new = @($failed | Where-Object { $base -notcontains $_ })
        if (-not $IsBaseline -and $new.Count -gt 0) {
          # jedan ponovni pokusaj samo za nove pale fajlove (spori ili nestabilni testovi pod opterecenjem)
          $files = @($new | ForEach-Object { ($_ -split ' :: ')[0] } | Select-Object -Unique)
          Write-Log "  ${gn}: $($new.Count) novih palih - ponavljam samo te fajlove ($($files -join ', '))" DarkYellow
          $json2 = Join-Path $LogDir ("{0}_{1}_retry.json" -f $id, $gn)
          if (Test-Path -LiteralPath $json2) { Remove-Item -LiteralPath $json2 -Force }
          $q2 = QS $json2; if ($IsWin) { $q2 = QW $json2 }
          $pats = ($files | ForEach-Object { if ($IsWin) { QW $_ } else { QS $_ } }) -join " "
          $null = Run-Cmd "${gn}_retry" ([string]$g.cmd + " " + $pats + $flag + $q2) $to
          $failed2 = Get-FailedTests $json2
          if ($null -ne $failed2) { $new = @($failed2 | Where-Object { $base -notcontains $_ }) }
        }
        if (-not $IsBaseline -and $new.Count -gt 0) {
          $detail[$gn] = 1; $fails.Add($gn)
          $summary += "### testovi koji padaju (a nisu padali pre runa)`n" + (($new | Select-Object -First 40) -join "`n") + "`n`n" + (Tail-Text $v.text 40) + "`n`n"
        } else { $detail[$gn] = 0 }
      }
    } else {
      $c = Run-Cmd $gn ([string]$g.cmd) $to
      $detail[$gn] = $c.code
      if ($c.code -ne 0) { $fails.Add($gn); $summary += "### $($g.cmd) (exit $($c.code))`n" + (Tail-Text $c.text 60) + "`n`n" }
    }
  }
  # Provera koja je padala vec pre runa nije blokirajuca dok jednom ne prodje.
  $blocking = New-Object System.Collections.Generic.List[string]
  foreach ($gn in $fails) {
    if (-not $IsBaseline -and (Test-BaselineBad $gn)) { Write-Log "  $gn pada, ali je padao i pre runa - nije blokirajuce" DarkYellow }
    else { $blocking.Add($gn) }
  }
  if (-not $IsBaseline -and $State.baseline) {
    foreach ($k in @($detail.Keys)) {
      if ((Test-BaselineBad $k) -and $detail[$k] -eq 0) { Set-BaselineBad $k $false; Write-Log "  $k je sada zelen - od sada je blokirajuci" DarkGray }
    }
  }
  return [pscustomobject]@{ ok = ($blocking.Count -eq 0); fails = $fails.ToArray(); blocking = $blocking.ToArray(); summary = $summary; detail = $detail; failedTests = $failedAll }
}

# -- selftest CLI-ja --------------------------------------------------------------
function Self-Test {
  $script:CurrentId = "selftest"
  Write-Log "SELFTEST: proveravam claude CLI (modeli, effort, auto/plan/goal, nastavak sesije, izmene fajlova)" Cyan
  $ver = Run-Cmd "version" "claude --version" 3
  Write-Log ("  claude --version: " + ($ver.text -replace "\s+", " ").Trim())
  $q = Tx "stOk"
  $script:StepModel = $Model
  $t1 = Invoke-WithRetry -TagBase "selftest_t1" -PromptText $q -Effort "max" -Mode "auto" -TimeoutMin 10
  if (-not ($t1.ok -and $t1.result -match "OK")) {
    $alias = Get-ModelAlias $Model
    if ($alias -and $alias -ne $Model) {
      Write-Log "  model '$Model' nije prihvacen - probam alias '$alias'" Yellow
      $script:ModelMap[$Model] = $alias; $script:StepModel = $alias
      $t1 = Invoke-WithRetry -TagBase "selftest_t1a" -PromptText $q -Effort "max" -Mode "auto" -TimeoutMin 10
      if (-not ($t1.ok -and $t1.result -match "OK")) { $script:ModelMap.Remove($Model) }
    }
  }
  if (-not ($t1.ok -and $t1.result -match "OK")) {
    Stop-Run ("osnovni poziv 'claude -p --permission-mode auto' ne radi: " + (Tail-Text "$($t1.result) $($t1.errTail)" 6) + " | Run namerno NE prelazi na rad bez provere dozvola. Vidi $RunRel/logs/selftest_*.err.txt") 3
  }
  Write-Log "  t1 OK: model=$(Resolve-Model $Model), effort max -> $(Get-EffortDesc 'max'), USD $(Fmt-Usd $t1.totalCost)" Green

  $others = @($Steps | ForEach-Object { [string]$_.model } | Where-Object { $_ -and $_ -ne $Model } | Select-Object -Unique)
  foreach ($m in $others) {
    $tm = Invoke-WithRetry -TagBase ("selftest_m_" + ($m -replace '[^A-Za-z0-9]', '')) -PromptText $q -Effort "high" -Mode "auto" -TimeoutMin 10 -UseModel $m
    if ($tm.ok -and $tm.result -match "OK") { Write-Log "  model $m OK" Green; continue }
    $alias = Get-ModelAlias $m
    if ($alias -and $alias -ne $m) {
      $tm = Invoke-WithRetry -TagBase ("selftest_m_" + $alias) -PromptText $q -Effort "high" -Mode "auto" -TimeoutMin 10 -UseModel $alias
      if ($tm.ok -and $tm.result -match "OK") { $script:ModelMap[$m] = $alias; Write-Log "  model $m -> koristim alias '$alias'" Yellow; continue }
    }
    $script:ModelMap[$m] = $Model
    Write-Log "  model $m nije dostupan - ti koraci idu na $(Resolve-Model $Model)" Yellow
  }

  $t2 = Invoke-WithRetry -TagBase "selftest_t2" -PromptText (Tx "stResume") -Effort "xhigh" -Mode "auto" -ResumeId $t1.lastSession -TimeoutMin 10
  $script:ResumeOk = ($t2.ok -and $t2.result -match "OK")
  Write-Log "  t2 nastavak sesije (--resume), effort xhigh -> $(Get-EffortDesc 'xhigh'): $($script:ResumeOk)" $(if ($script:ResumeOk) { "Green" } else { "Yellow" })

  $wfRel = "$RunRel/tmp/selftest-write.txt"; $wf = Get-Abs $wfRel
  if (Test-Path -LiteralPath $wf) { Remove-Item -LiteralPath $wf -Force }
  $t3 = Invoke-WithRetry -TagBase "selftest_t3" -PromptText (Txf "stWrite" @($wfRel)) -Effort "low" -Mode "auto" -TimeoutMin 10
  $writeOk = (Test-Path -LiteralPath $wf) -and ((Read-Utf8 $wf) -match "OK")
  $bashOk  = ([string]$t3.result -match "git version \d")
  if (Test-Path -LiteralPath $wf) { Remove-Item -LiteralPath $wf -Force }
  Write-Log "  t3 auto rezim: izmena fajla=$writeOk, komanda=$bashOk (odbijenih radnji: $($t3.denials))" $(if ($writeOk -and $bashOk) { "Green" } else { "Red" })
  if (-not ($writeOk -and $bashOk)) {
    Stop-Run ("auto rezim na ovom racunaru ne dozvoljava agentu da menja fajlove ili pokrece komande: " + (Tail-Text "$($t3.result) $($t3.errTail)" 4) + " | Run namerno ne zaobilazi dozvole. Detalji: $RunRel/logs/selftest_t3_*.jsonl") 3
  }

  $pfRel = "$RunRel/tmp/selftest-plan.txt"; $pf = Get-Abs $pfRel
  if (Test-Path -LiteralPath $pf) { Remove-Item -LiteralPath $pf -Force }
  $t4 = Invoke-WithRetry -TagBase "selftest_t4" -PromptText (Txf "stPlan" @($pfRel)) -Effort "low" -Mode "plan" -TimeoutMin 10
  $planText = Get-PlanText $t4
  $script:PlanOk = ($planText.Length -ge 20 -and -not (Test-Path -LiteralPath $pf))
  if (Test-Path -LiteralPath $pf) { Remove-Item -LiteralPath $pf -Force }
  Write-Log "  t4 plan rezim (bez menjanja fajlova): $($script:PlanOk)" $(if ($script:PlanOk) { "Green" } else { "Yellow" })

  $gfRel = "$RunRel/tmp/selftest-goal.txt"; $gf = Get-Abs $gfRel
  if (Test-Path -LiteralPath $gf) { Remove-Item -LiteralPath $gf -Force }
  $null = Invoke-WithRetry -TagBase "selftest_t5" -PromptText (Txf "stGoal" @($gfRel)) -Effort "low" -Mode "auto" -TimeoutMin 15
  $script:GoalOk = (Test-Path -LiteralPath $gf) -and ((Read-Utf8 $gf) -match "OK")
  if (Test-Path -LiteralPath $gf) { Remove-Item -LiteralPath $gf -Force }
  Write-Log "  t5 /goal: $($script:GoalOk)" $(if ($script:GoalOk) { "Green" } else { "Yellow" })

  $State.selftest = [pscustomobject]@{
    at = (Get-Date).ToString("s"); version = ($ver.text -replace "\s+", " ").Trim(); model = $Model
    effortVia = $script:EffortVia; effortMap = $script:EffortMap; modelMap = $script:ModelMap
    resume = $script:ResumeOk; plan = $script:PlanOk; goal = $script:GoalOk
  }
  Save-State
  if (-not $script:PlanOk) { Write-Log "  plan koraci ce ici u auto rezimu sa strogom uputom 'ne menjaj fajlove'" Yellow }
  if (-not $script:GoalOk) { Write-Log "  goal koraci ce posle glavnog poziva dobiti obican nastavak umesto /goal" Yellow }
  if (-not $script:ResumeOk) { Write-Log "  --resume ne radi: 'ista' koraci idu u novu sesiju sa planom iz fajla" Yellow }
  $script:CurrentId = "start"
}

function Restore-SelfTest {
  $st = $State.selftest
  if ($st.effortVia) { $script:EffortVia = [string]$st.effortVia }
  if ($st.effortMap) { foreach ($pr in $st.effortMap.PSObject.Properties) { $script:EffortMap[$pr.Name] = [string]$pr.Value } }
  if ($st.modelMap) { foreach ($pr in $st.modelMap.PSObject.Properties) { $script:ModelMap[$pr.Name] = [string]$pr.Value } }
  $script:ResumeOk = [bool]$st.resume; $script:PlanOk = [bool]$st.plan; $script:GoalOk = [bool]$st.goal
}

# -- slike (opciono): ready -> target pre svakog koraka --------------------------
function Sync-Assets {
  if (-not $Assets -or -not $AssetsTargetRel) { return }
  $src = Get-Abs $AssetsReadyRel
  $dst = Get-Abs $AssetsTargetRel
  if (-not (Test-Path -LiteralPath $src)) { return }
  $n = 0
  try {
    Get-ChildItem -LiteralPath $src -Recurse -File -ErrorAction Stop | ForEach-Object {
      $rel = $_.FullName.Substring($src.Length).TrimStart('\', '/')
      $target = Join-Path $dst $rel
      $copy = $true
      if (Test-Path -LiteralPath $target) {
        $t = Get-Item -LiteralPath $target
        if ($t.Length -eq $_.Length -and $t.LastWriteTimeUtc -ge $_.LastWriteTimeUtc) { $copy = $false }
      }
      if ($copy) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        $n++
      }
    }
  } catch { Write-Log "  slike: kopiranje nije uspelo: $($_.Exception.Message)" DarkYellow; return }
  if ($n -gt 0) { Write-Log "  slike: $n novih/izmenjenih u $AssetsTargetRel" DarkGray }
}

# -- jedan korak ------------------------------------------------------------------
function Run-Step($step) {
  $id = [string]$step.id
  $script:CurrentId = $id
  $title = [string]$step.title
  $script:StepModel = Resolve-Model ([string]$step.model)
  $mode = [string]$step.mode
  $session = [string]$step.session; if (-not $session) { $session = "nova" }
  $timeout = [int]$step.timeoutMin
  $prev = Get-StepState $id
  $wasStarted = ($prev -and [string]$prev.status -eq "U_TOKU")
  Sync-Assets
  Write-Log ("{0} | {1}  [{2}]" -f $id, $title, $script:StepModel) Cyan
  Write-Log ("  effort={0} rezim={1} sesija={2}{3} limit={4} min" -f (Get-EffortDesc ([string]$step.effort)), $mode, $session, $(if ($step.resumeFrom) { " (" + $step.resumeFrom + ")" } else { "" }), $timeout) DarkGray
  $started = Get-Date
  $cost0 = [double]$State.totalUsd
  Set-StepState $id ([pscustomobject]@{ status = "U_TOKU"; startedAt = $started.ToString("s"); sessionId = $(if ($prev) { $prev.sessionId } else { $null }) })
  Set-Current $id "agent"

  $promptRel = "$RunRel/prompts/$id.md"
  $body = Read-Utf8 (Join-Path $PromptDir "$id.md")
  $header = (Txf "header" @($id, $Name, "$RunRel/rules.md", $PlanRel, $ProgRel)) + "`r`n`r`n"
  if ($wasStarted) { $header += (Tx "interrupted") + "`r`n`r`n" }

  $resumeId = ""
  if ($session -eq "ista" -or $session -eq "same") {
    $from = [string]$step.resumeFrom
    $prevStep = Get-StepState $from
    if ($script:ResumeOk -and $prevStep -and $prevStep.sessionId) { $resumeId = [string]$prevStep.sessionId }
    else {
      Write-Log "  nema sesije od $from (ili --resume ne radi) - nova sesija sa planom iz $PlansRel" Yellow
      $header += (Txf "resumeMissing" @($from, "$PlansRel/$from.md", $ProgRel)) + "`r`n`r`n"
    }
  }
  if ($wasStarted -and $prev.sessionId -and $script:ResumeOk) { $resumeId = [string]$prev.sessionId }

  $callMode = "auto"
  $mainPrompt = $header + $body
  if ($mode -eq "plan") {
    if ($script:PlanOk) { $callMode = "plan" } else { $mainPrompt = (Tx "planOnly") + "`r`n`r`n" + $mainPrompt }
    $mainPrompt += "`r`n`r`n" + (Txf "planFinal" @("$PlansRel/$id.md"))
  }
  $continueText = $header + (Txf "contText" @($id, $ProgRel, $promptRel))

  $r = Invoke-WithRetry -TagBase "${id}_main" -PromptText $mainPrompt -Effort ([string]$step.effort) -Mode $callMode -ResumeId $resumeId -TimeoutMin $timeout -ContinueText $continueText
  $sid = $r.lastSession
  $calls = $r.calls
  $attempt = 1
  while (-not $sid -and $attempt -lt 3 -and -not $DryRun) {
    Write-Log "  ${id}: poziv nije ni poceo sesiju ($(Tail-Text "$($r.result) $($r.errTail)" 2)) - ponavljam za 5 min" Yellow
    Start-Sleep -Seconds 300
    $attempt++
    $r = Invoke-WithRetry -TagBase "${id}_main_r$attempt" -PromptText $mainPrompt -Effort ([string]$step.effort) -Mode $callMode -ResumeId $resumeId -TimeoutMin $timeout -ContinueText $continueText
    $sid = $r.lastSession; $calls += $r.calls
  }
  if (-not $sid -and -not $DryRun) {
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes)
    $usd = [double]$State.totalUsd - $cost0
    Write-Log "$id -> GRESKA ($mins min, $calls poziva, USD $(Fmt-Usd $usd))" Red
    Set-StepState $id ([pscustomobject]@{ status = "GRESKA"; sessionId = $null; at = (Get-Date).ToString("s"); minutes = $mins; usd = [math]::Round($usd, 4); calls = $calls })
    $script:ConsecutiveFail++
    if ($script:ConsecutiveFail -ge 3) { Stop-Run "3 koraka zaredom nisu ni pocela - nesto nije u redu sa claude CLI-jem. Vidi $RunRel/logs/*.err.txt" 5 }
    return
  }
  # sesija se pamti odmah: ako se racunar ugasi posle ovoga, nastavak ide u istu sesiju
  Set-StepState $id ([pscustomobject]@{ status = "U_TOKU"; startedAt = $started.ToString("s"); sessionId = $sid })
  $lastTimedOut = $r.timedOut
  if ($r.timedOut) { Write-Log "  ${id}: glavni poziv je istekao ($timeout min)" Yellow }
  if (-not $r.ok -and -not $r.timedOut) { Write-Log "  ${id}: glavni poziv vratio gresku: $(Tail-Text $r.result 3)" Yellow }

  # PLAN korak: plan ide u plansDir/<id>.md
  if ($mode -eq "plan") {
    $planText = Get-PlanText $r
    $mins = [math]::Round(((Get-Date) - $started).TotalMinutes)
    $usd = [double]$State.totalUsd - $cost0
    if ($DryRun) { Write-Log "$id -> OK (0 min, $calls poziva, USD 0.00)" DarkGray; return }
    if ($planText.Length -lt 300) {
      Write-Log "$id -> GRESKA ($mins min, $calls poziva, USD $(Fmt-Usd $usd))" Red
      Write-Log "  ${id}: plan je prekratak ($($planText.Length) znakova) - vidi $RunRel/logs/${id}_main_*.jsonl" Red
      Set-StepState $id ([pscustomobject]@{ status = "GRESKA"; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins; usd = [math]::Round($usd, 4); calls = $calls })
      $script:ConsecutiveFail++
      return
    }
    $script:ConsecutiveFail = 0
    New-Item -ItemType Directory -Force -Path $PlanDir | Out-Null
    $planFile = Join-Path $PlanDir "$id.md"
    [System.IO.File]::WriteAllText($planFile, "# Plan $id - $title`n`n_($Name, $(Get-Date -Format 'yyyy-MM-dd HH:mm'))_`n`n" + $planText.Trim() + "`n", $Utf8)
    Append-Progress ((Txf "progHead" @($id, $title, (Get-Date -Format 'yyyy-MM-dd HH:mm'))) + "`n" + (Txf "progPlan" @("$PlansRel/$id.md")))
    Set-Current $id "commit"
    Commit-Step $id $title "OK"
    Set-StepState $id ([pscustomobject]@{ status = "OK"; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins; usd = [math]::Round($usd, 4); calls = $calls; planChars = $planText.Length })
    Write-Log "$id -> OK ($mins min, $calls poziva, USD $(Fmt-Usd $usd))" Green
    return
  }

  # GOAL korak: ista sesija dobija /goal sa uslovom zavrsetka
  if ($mode -eq "goal" -and $sid) {
    Set-Current $id "goal"
    $goal = Txf "goal" @($id, $promptRel, (Get-AgentChecksText), $ProgRel)
    $goalPrompt = "/goal $goal"
    if (-not $script:GoalOk) { $goalPrompt = Txf "goalFallback" @($goal) }
    $g = Invoke-WithRetry -TagBase "${id}_goal" -PromptText $goalPrompt -Effort ([string]$step.effort) -Mode "auto" -ResumeId $sid -TimeoutMin $timeout -ContinueText ($header + $goalPrompt)
    if ($g.lastSession) { $sid = $g.lastSession }
    $calls += $g.calls
    $lastTimedOut = $g.timedOut
    if ($g.timedOut) { Write-Log "  ${id}: /goal je istekao ($timeout min)" Yellow }
  }

  if ($DryRun) { Write-Log "$id -> OK (0 min, $calls poziva, USD 0.00)" DarkGray; return }
  $script:ConsecutiveFail = 0

  $doGates = $true
  if ($step.PSObject.Properties["gates"] -and $step.gates -eq $false) { $doGates = $false }
  $gate = [pscustomobject]@{ ok = $true; blocking = @(); summary = "" }
  if ($doGates -and $Gates.Count -gt 0) {
    Set-Current $id "provere"
    Write-Log "  ${id}: provera ($((@($Gates | Where-Object { $SkipSet -notcontains ([string]$_.name).ToLower() } | ForEach-Object { $_.name })) -join '/'))..." DarkGray
    $gate = Run-Gates $id
    $fix = 0
    while (-not $gate.ok -and $fix -lt $MaxFix -and $sid) {
      $fix++
      Set-Current $id "popravka $fix/$MaxFix"
      Write-Log "  ${id}: provera pala ($($gate.blocking -join ', ')) - popravka $fix/$MaxFix" Yellow
      $fixPrompt = $header + (Txf "fix" @($id, ("`r`n`r`n" + $gate.summary + "`r`n"), $ProgRel))
      $f = Invoke-WithRetry -TagBase "${id}_fix$fix" -PromptText $fixPrompt -Effort ([string]$step.effort) -Mode "auto" -ResumeId $sid -TimeoutMin ([math]::Min(90, $timeout)) -ContinueText $fixPrompt
      if ($f.lastSession) { $sid = $f.lastSession }
      $calls += $f.calls
      Set-Current $id "provere"
      $gate = Run-Gates $id
    }
  }

  $mins = [math]::Round(((Get-Date) - $started).TotalMinutes)
  $usd = [double]$State.totalUsd - $cost0
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
  Set-Current $id "commit"
  if ($gate.ok) {
    $status = "OK"
    if (-not (Has-ProgressSection $id)) {
      $status = "DELIMICNO"
      Append-Progress ((Txf "progHead" @($id, $title, $stamp)) + "`n" + (Txf "progMissing" @("$RunRel/logs/${id}_*")))
    }
    if ($lastTimedOut) { $status = "DELIMICNO" }
    Commit-Step $id $title $status
    Set-StepState $id ([pscustomobject]@{ status = $status; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins; usd = [math]::Round($usd, 4); calls = $calls })
    Write-Log "$id -> $status ($mins min, $calls poziva, USD $(Fmt-Usd $usd))" Green
  } else {
    $stash = Stash-Broken $id
    Append-Progress ((Txf "progHead" @($id, ($title + (Tx "blockedSuffix")), $stamp)) + "`n" + (Txf "progBlocked" @($MaxFix, ($gate.blocking -join ', '), $stash, "$RunRel/logs/${id}_*.txt")))
    Commit-Step $id $title "BLOKADA"
    Set-StepState $id ([pscustomobject]@{ status = "BLOKADA"; sessionId = $sid; at = (Get-Date).ToString("s"); minutes = $mins; usd = [math]::Round($usd, 4); calls = $calls; stash = $stash })
    Write-Log "$id -> BLOKADA ($mins min, $calls poziva, USD $(Fmt-Usd $usd))" Red
  }
}

# -- MCP konfiguracija za korake --------------------------------------------------
function Write-McpConfig {
  $servers = [ordered]@{}
  $mcp = Cfg "mcp" $null
  if ($mcp) {
    if ($mcp.PSObject.Properties["playwright"] -and $mcp.playwright) {
      $pkg = "@playwright/mcp@latest"; if ($mcp.PSObject.Properties["playwrightPackage"] -and $mcp.playwrightPackage) { $pkg = [string]$mcp.playwrightPackage }
      $pwArgs = @("-y", $pkg, "--headless", "--isolated", "--output-dir", $ShotsRel)
      if ($mcp.PSObject.Properties["playwrightArgs"] -and $mcp.playwrightArgs) { $pwArgs += @($mcp.playwrightArgs | ForEach-Object { [string]$_ }) }
      if ($IsWin) { $servers["playwright"] = [ordered]@{ type = "stdio"; command = "cmd"; args = @(@("/c", "npx") + $pwArgs) } }
      else { $servers["playwright"] = [ordered]@{ type = "stdio"; command = "npx"; args = $pwArgs } }
    }
    if ($mcp.PSObject.Properties["servers"] -and $mcp.servers) { foreach ($p in $mcp.servers.PSObject.Properties) { $servers[$p.Name] = $p.Value } }
  }
  [System.IO.File]::WriteAllText($McpFile, ([ordered]@{ mcpServers = $servers } | ConvertTo-Json -Depth 10), $Utf8)
  return @($servers.Keys)
}

function Show-Plan {
  Write-Log ("PLAN: {0} koraka, model {1}, grana {2}, jezik {3}" -f $Steps.Count, $Model, $Branch, $Lang) Cyan
  Write-Log ("  {0,-6} {1,-20} {2,-7} {3,-5} {4,-12} {5,6}  {6}" -f "ID", "model", "effort", "rezim", "sesija", "limit", "naslov") DarkGray
  foreach ($s in $Steps) {
    $se = [string]$s.session; if (-not $se) { $se = "nova" }
    if ($s.resumeFrom) { $se = "$se ($($s.resumeFrom))" }
    $m = [string]$s.model; if (-not $m) { $m = $Model }
    Write-Log ("  {0,-6} {1,-20} {2,-7} {3,-5} {4,-12} {5,6}  {6}" -f $s.id, $m, $s.effort, $s.mode, $se, $s.timeoutMin, $s.title)
  }
  foreach ($g in $Gates) {
    $extra = @(); if ($g.when) { $extra += [string]$g.when }; if ($g.kind) { $extra += [string]$g.kind }; if ($SkipSet -contains ([string]$g.name).ToLower()) { $extra += "PRESKOCENO" }
    Write-Log ("  provera {0}: {1} {2}" -f $g.name, $g.cmd, $(if ($extra.Count) { "[" + ($extra -join ", ") + "]" } else { "" })) DarkGray
  }
  Write-Log "  zabranjeno agentu: $Deny" DarkGray
  Write-Log "  plan: $PlanRel | napredak: $ProgRel | planovi: $PlansRel | snimci: $ShotsRel" DarkGray
}

# == glavni tok ===================================================================
$State = Load-State
$script:StateLoaded = $true
$problems = Test-Kit
if ($problems.Count -gt 0) {
  foreach ($p in $problems) { Write-Log "  KOMPLET: $p" Red }
  Stop-Run "komplet nije ispravan ($($problems.Count) problema) - popravi fajlove pa pokreni ponovo" 7
}
if (-not (Test-Path -LiteralPath (Get-Abs $PlanRel))) { Write-Log "  upozorenje: nema plana $PlanRel (koraci ga pominju kao izvor istine)" Yellow }
$mcpServers = @(Write-McpConfig)

if ($DryRun) {
  Show-Plan
  $first = $Steps[0]
  $script:CurrentId = [string]$first.id
  $dryMode = "auto"; if ([string]$first.mode -eq "plan") { $dryMode = "plan" }
  $null = Invoke-Claude -Tag "dryrun_$($first.id)" -PromptText "dry run" -Effort ([string]$first.effort) -Mode $dryMode -TimeoutMin 1 -UseModel (Resolve-Model ([string]$first.model))
  Write-Log "DRY RUN: struktura kompleta je ispravna (detaljnija provera: scripts/check_kit.py iz skilla). Primer poziva: $RunRel/logs/dryrun_$($first.id).$(if ($IsWin) { 'cmd' } else { 'sh' })" Green
  exit 0
}

if ($IsWin) {
  try { $Host.UI.RawUI.WindowTitle = "NOCNI RUN $Name - ne zatvaraj ovaj prozor" } catch { }
  # Racunar ne sme da zaspi dok je prozor otvoren; klik u prozor ne sme da zamrzne run (QuickEdit).
  try {
    Add-Type -Namespace NocniRun -Name Native -ErrorAction Stop -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
[DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int nStdHandle);
[DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr hConsoleHandle, out uint lpMode);
[DllImport("kernel32.dll")] public static extern bool SetConsoleMode(IntPtr hConsoleHandle, uint dwMode);
'@
    [void][NocniRun.Native]::SetThreadExecutionState([uint32]2147483649)
    $hIn = [NocniRun.Native]::GetStdHandle(-10); $cmode = [uint32]0
    if ([NocniRun.Native]::GetConsoleMode($hIn, [ref]$cmode)) { [void][NocniRun.Native]::SetConsoleMode($hIn, [uint32](($cmode -band 4294967231) -bor 128)) }
  } catch { }
}

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { Stop-Run "claude CLI nije na PATH-u (instaliraj Claude Code ili otvori nov prozor)" 9 }
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Run "git nije na PATH-u" 9 }

Write-Log "======================================================" DarkGray
Write-Log (" NOCNI RUN {0} - {1} koraka, model {2}, grana {3}, budzet {4}" -f $Name, $Steps.Count, $Model, $Branch, $(if ($BudgetUsd -gt 0) { "USD $BudgetUsd" } else { "bez limita" })) Green
Write-Log (" repo {0}; MCP: {1}; log: {2}" -f $RepoPath, $(if ($mcpServers.Count) { $mcpServers -join ", " } else { "nijedan" }), (Split-Path $Log -Leaf)) DarkGray
if ($SelfTestOnly) { Write-Log " PROVERA: samo selftest + pocetne provere (bez koraka i bez git-a)" DarkGray }
Write-Log "======================================================" DarkGray
if (-not $State.startedAt -and -not $SelfTestOnly) { $State.startedAt = (Get-Date).ToString("s") }
$State.stoppedAt = $null
if (-not $SelfTestOnly) { $State.finishedAt = $null }
Save-State

# zavisnosti, build i .env koji nisu u .gitignore: u proveri upozorenje, u runu stop pre prvog commita
$unsafe = Get-UnsafeUntracked
if ($unsafe.Count -gt 0) {
  $list = (@($unsafe) | Select-Object -First 8) -join ", "
  if ($SelfTestOnly -or $NoCommit) { Write-Log "UPOZORENJE: ovo nije u .gitignore (zavisnosti, build ili .env): $list - dodaj u .gitignore pre pokreni.cmd" Red }
  else { Stop-Run "ovo nije u .gitignore (zavisnosti, build ili .env): $list. Dodaj u .gitignore pa pokreni ponovo - runner ne commituje takve fajlove." 8 }
}

# grana + pocetni commitovi (jednom po runu)
if (-not $SelfTestOnly) {
  Clear-StaleGitLock
  $cur = ((& git rev-parse --abbrev-ref HEAD 2>$null) | Out-String).Trim()
  if ($cur -ne $Branch) {
    & git show-ref --verify --quiet "refs/heads/$Branch"
    if ($LASTEXITCODE -eq 0) { $null = Invoke-Git @("switch", $Branch) } else { $null = Invoke-Git @("switch", "-c", $Branch) }
    $cur = ((& git rev-parse --abbrev-ref HEAD 2>$null) | Out-String).Trim()
    if ($cur -ne $Branch) { Stop-Run "ne mogu da predjem na granu $Branch (sada: '$cur'). Run nece da commituje na drugu granu." 6 }
  }
  Write-Log "grana: $cur" DarkGray
  if (-not (Get-StepState "_pocetak") -and -not $NoCommit) {
    $script:CurrentId = "pocetak"
    Ensure-GitIgnore
    # 1) zatecene lokalne izmene (nisu deo runa) - poseban commit, da istorija ostane cista
    $own = @($RunRel, ".gitignore", $PlanRel, $ProgRel, $PlansRel, $ShotsRel) + $OwnExtra
    if ($AssetsTargetRel) { $own += $AssetsTargetRel }
    $wipSpec = @(".") + $CommitExclude + @($own | Where-Object { $_ } | ForEach-Object { ":(exclude)$_" })
    $wipMsg = (Txf "wipTitle" @($Name)) + "`n`n" + (Tx "wipBody") + "`n"
    if ($Trailer) { $wipMsg += "`n$Trailer`n" }
    $wh = Commit-Paths $wipMsg $wipSpec
    if ($wh) { Write-Log "  zatecene lokalne izmene sacuvane u commit $wh" DarkGray }
    # 2) plan, pravila, run fajlovi
    Sync-Assets
    Commit-Step "start" (Tx "startTitle") "OK"
    Set-StepState "_pocetak" ([pscustomobject]@{ status = "OK"; at = (Get-Date).ToString("s") })
  }
}

# selftest (ponovo se koristi ako je skoriji od selfTestMaxAgeHours)
$stFresh = $false
if ($State.selftest -and $State.selftest.at) {
  try { $stFresh = (((Get-Date) - [datetime]::Parse([string]$State.selftest.at)).TotalHours -lt $SelfTestMaxAgeH) } catch { $stFresh = $false }
}
if ($SelfTestOnly) { Self-Test }
elseif (($SkipSelfTest -or $stFresh) -and $State.selftest) {
  Restore-SelfTest
  Write-Log "selftest iz stanja ($($State.selftest.at)): plan=$($script:PlanOk) goal=$($script:GoalOk) resume=$($script:ResumeOk) effort=$($script:EffortVia)" DarkGray
} else { Self-Test }

# baseline: sta pada vec pre prvog koraka (jednom po runu; -SelfTestOnly ga uvek ponovi)
if ($Gates.Count -gt 0 -and ($SelfTestOnly -or -not $State.baseline)) {
  $script:CurrentId = "baseline"
  Set-Current "baseline" "provere"
  Write-Log "BASELINE: pustam provere na pocetnom stanju (da znam sta je vec padalo)..." Cyan
  $State.baseline = [pscustomobject]@{ at = (Get-Date).ToString("s"); failedTests = @(); bad = [pscustomobject]@{} }
  $b = Run-Gates "baseline" -IsBaseline
  $State.baseline.failedTests = @($b.failedTests)
  foreach ($k in @($b.detail.Keys)) { $State.baseline.bad | Add-Member -NotePropertyName $k -NotePropertyValue ($b.detail[$k] -ne 0) -Force }
  $State.current = $null
  Save-State
  $lines = @("Baseline ($(Get-Date -Format 'yyyy-MM-dd HH:mm'))")
  foreach ($k in @($b.detail.Keys | Sort-Object)) { $lines += ("{0}: {1}" -f $k, $(if ($b.detail[$k] -ne 0) { "PADA" } else { "ok" })) }
  $lines += "testovi koji su padali i pre runa:"
  $lines += @(@($State.baseline.failedTests) | ForEach-Object { "  - $_" })
  [System.IO.File]::WriteAllText($BaselineFile, ($lines -join "`n") + "`n", $Utf8)
  $badList = @($b.detail.Keys | Where-Object { $b.detail[$_] -ne 0 })
  Write-Log ("BASELINE: pada vec sada: {0}; palih testova: {1}" -f $(if ($badList.Count) { $badList -join ", " } else { "nista" }), @($State.baseline.failedTests).Count) $(if ($badList.Count) { "Yellow" } else { "Cyan" })
  if ($badList.Count) { Write-Log "  (te provere nisu blokirajuce dok jednom ne prodju; ako je to greska u okruzenju, popravi je pre noci)" Yellow }
}

if ($SelfTestOnly) {
  Write-Log "PROVERA GOTOVA: selftest i pocetne provere su u state.json i baseline.txt. Run pokreces sa pokreni.cmd." Green
  exit 0
}

# koraci
$onlyIds = @(); if ($Only) { $onlyIds = @($Only -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$startedLoop = $false; if (-not $From) { $startedLoop = $true }
$stoppedEarly = $false
foreach ($s in $Steps) {
  $id = [string]$s.id
  if (-not $startedLoop) { if ($id -eq $From) { $startedLoop = $true } else { continue } }
  if ($onlyIds.Count -gt 0 -and ($onlyIds -notcontains $id)) { continue }
  $st = Get-StepState $id
  if ($onlyIds.Count -eq 0 -and $st -and (@("OK", "DELIMICNO", "BLOKADA") -contains [string]$st.status)) {
    Write-Log "$id preskocen (vec $($st.status))" DarkGray
    continue
  }
  if (Test-Path -LiteralPath $StopFile) {
    Write-Log "STOP fajl nadjen ($RunRel/STOP) - stajem pre koraka $id. Obrisi STOP i pokreni ponovo da nastavis." Yellow
    $stoppedEarly = $true; break
  }
  if ($BudgetUsd -gt 0 -and [double]$State.totalUsd -ge $BudgetUsd) {
    Write-Log "BUDZET dostignut (USD $(Fmt-Usd ([double]$State.totalUsd)) >= $BudgetUsd) - stajem. Nastavi sa -BudgetUsd vecim brojem." Red
    $stoppedEarly = $true; break
  }
  Run-Step $s
}

$State.current = $null
$rows = @($Steps | ForEach-Object { $x = Get-StepState ([string]$_.id); [pscustomobject]@{ id = [string]$_.id; st = $x } })
$open = @($rows | Where-Object { -not $_.st -or (@("OK", "DELIMICNO", "BLOKADA") -notcontains [string]$_.st.status) } | ForEach-Object { $_.id })
if ($stoppedEarly) { $State.stoppedAt = (Get-Date).ToString("s"); Write-Log "STAO pre kraja (vidi gore). Ponovno pokretanje nastavlja od prvog nezavrsenog koraka." Yellow }
elseif ($open.Count -gt 0 -and ($Only -or $From)) {
  $State.stoppedAt = (Get-Date).ToString("s")
  Write-Log ("KRAJ POKRETANJA (-Only/-From): nezavrseni koraci: {0}. Pokreni bez opcija da nastavis." -f ($open -join ", ")) Yellow
} else {
  $State.finishedAt = (Get-Date).ToString("s")
  if ($open.Count -gt 0) { Write-Log ("GOTOVO (bez uspeha ostali: {0} - ponovno pokretanje ih pokusava ponovo)" -f ($open -join ", ")) Yellow }
  else { Write-Log "GOTOVO" Green }
}
Save-State
$done = @($rows | Where-Object { $_.st -and (@("OK", "DELIMICNO", "BLOKADA", "GRESKA") -contains [string]$_.st.status) })
$cnt = @{}; foreach ($r in $done) { $k = [string]$r.st.status; if ($cnt.ContainsKey($k)) { $cnt[$k]++ } else { $cnt[$k] = 1 } }
Write-Log ("Koraci: {0}/{1} ({2})" -f $done.Count, $Steps.Count, (($cnt.Keys | Sort-Object | ForEach-Object { "$_ $($cnt[$_])" }) -join ", ")) Green
foreach ($r in $done) { Write-Log ("  {0,-6} {1,-10} {2,4} min   USD {3,8}" -f $r.id, $r.st.status, $r.st.minutes, (Fmt-Usd ([double]$r.st.usd))) DarkGray }
Write-Log ("Ukupna cena: USD " + (Fmt-Usd ([double]$State.totalUsd))) Green
