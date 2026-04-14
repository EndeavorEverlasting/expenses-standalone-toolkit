param(
  [Parameter(Mandatory=$true)][string]$WorkbookPath,
  [string]$RunsRoot = ".\scripts\runs",
  [switch]$EngageDeferred,
  [switch]$WriteSuggestions
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sysAdminWrapper = "C:\Users\Cheex\Desktop\dev\SysAdminSuite\tools\ConvertTo-SuiteHtml.ps1"
if (-not (Test-Path $sysAdminWrapper)) {
  throw "SysAdminSuite HTML wrapper not found at $sysAdminWrapper"
}
. $sysAdminWrapper

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$runDir = Join-Path $repoRoot "$RunsRoot\$stamp"
New-Item -ItemType Directory -Path $runDir -Force | Out-Null

$pythonBase = "python -m product.tax_mileage_toolkit.cli"

Write-Host "Running audit + reconcile..." -ForegroundColor Cyan
Invoke-Expression "$pythonBase audit `"$WorkbookPath`" `"$runDir`""
Invoke-Expression "$pythonBase reconcile `"$WorkbookPath`" `"$runDir`""

$suggestCmd = "$pythonBase suggest-clusters `"$WorkbookPath`" `"$runDir`""
if ($EngageDeferred) { $suggestCmd += " --engage-deferred" }
if ($WriteSuggestions) { $suggestCmd += " --write" }
Invoke-Expression $suggestCmd

Write-Host "Running Python-native HTML renderer..." -ForegroundColor Cyan
Invoke-Expression "$pythonBase render-html `"$runDir`""

Write-Host "Rendering SysAdminSuite themed HTML..." -ForegroundColor Cyan
$auditJson = Join-Path $runDir "audit_report.json"
$suggestCsv = Join-Path $runDir "cluster_suggestion_report.csv"
$matchCsv = Join-Path $runDir "cluster_match_report.csv"
$overlapCsv = Join-Path $runDir "cluster_overlap_report.csv"

$audit = Get-Content $auditJson -Raw | ConvertFrom-Json
$auditRows = @()
foreach ($p in $audit.PSObject.Properties) {
  $auditRows += [pscustomobject]@{ Metric = $p.Name; Value = $p.Value }
}
$auditBody = $auditRows | ConvertTo-Html -Fragment
ConvertTo-SuiteHtml -Title "Mileage Audit (Suite Theme)" -Subtitle $runDir -BodyFragment $auditBody -OutputPath (Join-Path $runDir "audit_suite.html")

$suggestRows = Import-Csv $suggestCsv
$suggestBody = $suggestRows | ConvertTo-Html -Fragment
ConvertTo-SuiteHtml -Title "Cluster Suggestions (Suite Theme)" -Subtitle $runDir -BodyFragment $suggestBody -OutputPath (Join-Path $runDir "cluster_suggestions_suite.html")

$matchRows = Import-Csv $matchCsv
$matchBody = $matchRows | ConvertTo-Html -Fragment
ConvertTo-SuiteHtml -Title "Cluster Matches (Suite Theme)" -Subtitle $runDir -BodyFragment $matchBody -OutputPath (Join-Path $runDir "cluster_matches_suite.html")

$overlapRows = Import-Csv $overlapCsv
$overlapBody = $overlapRows | ConvertTo-Html -Fragment
ConvertTo-SuiteHtml -Title "Cluster Overlaps (Suite Theme)" -Subtitle $runDir -BodyFragment $overlapBody -OutputPath (Join-Path $runDir "cluster_overlaps_suite.html")

$indexBody = @"
<ul>
  <li><a href='index.html'>Python Run Index</a></li>
  <li><a href='audit.html'>Audit (Python)</a></li>
  <li><a href='cluster_suggestions.html'>Suggestions (Python)</a></li>
  <li><a href='cluster_matches.html'>Matches (Python)</a></li>
  <li><a href='cluster_overlaps.html'>Overlaps (Python)</a></li>
  <li><a href='audit_suite.html'>Audit (Suite Theme)</a></li>
  <li><a href='cluster_suggestions_suite.html'>Suggestions (Suite Theme)</a></li>
  <li><a href='cluster_matches_suite.html'>Matches (Suite Theme)</a></li>
  <li><a href='cluster_overlaps_suite.html'>Overlaps (Suite Theme)</a></li>
</ul>
"@
ConvertTo-SuiteHtml -Title "Mileage Run Index (Suite Theme)" -Subtitle $runDir -BodyFragment $indexBody -OutputPath (Join-Path $runDir "index_suite.html")

Write-Host "Run complete: $runDir" -ForegroundColor Green
