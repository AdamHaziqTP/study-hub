<#
  Task 29 — End-to-end AI Agent test (roadmap #16): "Search to Auto-read to
  Save" automated backend chain.

  Exercises the FULL public server flow against a running Study Hub instance:
    1. /api/ai-search     (natural question -> AI-translated PubMed query -> results)
    2. /api/extract-context (auto-read: PubMed + PMC -> AI Study breakdown)
    3. /api/simplify-study  (auto-read: plain-English explanation)
    4. /api/assess-study    (auto-read: evidence context + training application)
    5. /api/save-study      (persist the study into the shared library)

  The auth-gated tail of the flow (personal note -> article/claim -> evidence
  graph) is a MANUAL step because it requires a signed-in browser session; see
  E2E_TEST_PLAN.md for that checklist.

  Usage (PowerShell):
    $env:BASE_URL="http://localhost:3000" ; .\scripts\e2e-test.ps1
    # or omit BASE_URL to target the deployed instance:
    .\scripts\e2e-test.ps1

  Requires the server to be running and (for the AI endpoints) the DeepSeek key
  configured. Exit code 0 = all steps passed.
#>
param(
  [string]$BaseUrl = $env:BASE_URL,
  [string]$Question = "how many times a week should I train?",
  [string]$Pmid = $env:E2E_PMID
)

if (-not $BaseUrl) { $BaseUrl = "https://study-hub-rho-drab.vercel.app" }
$BaseUrl = $BaseUrl.TrimEnd('/')

$global:failures = 0

function Invoke-TestStep {
  param(
    [string]$Name,
    [scriptblock]$Body,
    [string]$OnFail
  )
  try {
    $result = & $Body
    Write-Host ("[PASS] {0}" -f $Name) -ForegroundColor Green
    return $result
  } catch {
    Write-Host ("[FAIL] {0} : {1}" -f $Name, $_.Exception.Message) -ForegroundColor Red
    if ($OnFail) { Write-Host ("       {0}" -f $OnFail) }
    $script:failures++
    return $null
  }
}

Write-Host ("Study Hub E2E backend chain -> {0}" -f $BaseUrl) -ForegroundColor Cyan

# 1. Smart AI-Assisted Search
$search = Invoke-TestStep "ai-search ('$Question')" -OnFail "Is the server up? Is DEEPSEEK_API_KEY set?" {
  $body = @{ question = $Question; retmax = 3; retstart = 0 } | ConvertTo-Json
  Invoke-RestMethod -Uri "$BaseUrl/api/ai-search" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 120
}
if ($search -and $search.data.Count -ge 1) {
  Write-Host ("       -> {0} result(s); translated = {1}" -f $search.data.Count, $search.translatedQuery) -ForegroundColor DarkGray
  if (-not $Pmid) { $Pmid = $search.data[0].pmid }
} else {
  if (-not $Pmid) {
    Write-Host "No PMID available; cannot continue." -ForegroundColor Red
    exit 1
  }
}
Write-Host ("       (using PMID {0})" -f $Pmid) -ForegroundColor DarkGray

# 2. Auto-read: extract Study breakdown
$extract = Invoke-TestStep "extract-context (PMID $Pmid)" -OnFail "DeepSeek + NCBI reachable?" {
  $body = @{ pmid = $Pmid } | ConvertTo-Json
  Invoke-RestMethod -Uri "$BaseUrl/api/extract-context" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 180
}
if ($extract) {
  Write-Host ("       -> sourceInfo = {0}; context researchQuestion present = {1}" -f $extract.sourceInfo, [bool]$extract.context.researchQuestion) -ForegroundColor DarkGray
}

# 3. Auto-read: plain-English simplification
$simple = Invoke-TestStep "simplify-study (PMID $Pmid)" {
  $body = @{ pmid = $Pmid } | ConvertTo-Json
  Invoke-RestMethod -Uri "$BaseUrl/api/simplify-study" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 180
}
if ($simple) {
  Write-Host ("       -> simplification present = {0}" -f [bool]$simple.simplification) -ForegroundColor DarkGray
}

# 4. Auto-read: evidence context + training application
$assess = Invoke-TestStep "assess-study (PMID $Pmid)" {
  $body = @{ pmid = $Pmid } | ConvertTo-Json
  Invoke-RestMethod -Uri "$BaseUrl/api/assess-study" -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 180
}
if ($assess) {
  Write-Host ("       -> assessment present = {0}" -f [bool]$assess.assessment) -ForegroundColor DarkGray
}

# 5. Save to Library (uses the study object returned by search/extract)
$studyObj = $null
if ($search -and $search.data.Count -ge 1) { $studyObj = $search.data[0] }
if (-not $studyObj -and $extract -and $extract.study) { $studyObj = $extract.study }

if ($studyObj) {
  $save = Invoke-TestStep "save-study (PMID $studyObj.pmid)" {
    $payload = @{
      pmid            = $studyObj.pmid
      title           = $studyObj.title
      abstract        = $studyObj.abstract
      authors         = $studyObj.authors
      journal         = $studyObj.journal
      publicationDate = $studyObj.publicationDate
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "$BaseUrl/api/save-study" -Method Post -Body $payload -ContentType 'application/json' -TimeoutSec 60
  }
  if ($save) {
    Write-Host ("       -> success = {0}, alreadyPresent = {1}" -f $save.success, $save.alreadyPresent) -ForegroundColor DarkGray
  }
} else {
  Write-Host "[WARN] No study object available for save-study step." -ForegroundColor Yellow
}

Write-Host ""
if ($global:failures -eq 0) {
  Write-Host "E2E backend chain: ALL PASS" -ForegroundColor Green
  Write-Host "Continue with the manual signed-in tail (note -> article -> graph) per E2E_TEST_PLAN.md." -ForegroundColor Cyan
  exit 0
} else {
  Write-Host ("E2E backend chain: {0} step(s) FAILED" -f $global:failures) -ForegroundColor Red
  exit 1
}
