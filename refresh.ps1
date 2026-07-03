# refresh.ps1 — one-command data refresh: scrape -> QC -> classify -> re-embed
#
# Every step here is incremental (only touches new/changed records), so this
# is safe to run on a schedule (recommended cadence: weekly).
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File refresh.ps1
#   powershell -ExecutionPolicy Bypass -File refresh.ps1 -SkipEmbed   # skip the Supabase rebuild

param(
    [switch]$SkipEmbed
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Force UTF-8 stdout/stderr for the Python steps. Without this, Python falls
# back to the system codepage (cp1252 on Windows) whenever stdout isn't a
# real interactive console (piping, redirection, Task Scheduler) — and any
# scraped title/description with an arrow, em-dash, curly quote, etc. crashes
# the print() call outright.
$env:PYTHONIOENCODING = "utf-8"

function Invoke-Step($cmd, $args) {
    & $cmd @args
    if ($LASTEXITCODE -ne 0) {
        throw "$cmd $($args -join ' ') failed with exit code $LASTEXITCODE"
    }
}

Write-Host "`n=== 1/4 Scraping sources ===" -ForegroundColor Cyan
Invoke-Step python @("fetch_garland.py")
Invoke-Step python @("fetch_mckinney.py")
Invoke-Step python @("fetch_voly.py")
Invoke-Step python @("fetch_idealist.py")
Invoke-Step python @("fetch_reddit.py")

Write-Host "`n=== 2/4 QC filter (curated) ===" -ForegroundColor Cyan
Invoke-Step python @("qc_filter.py")

Write-Host "`n=== 3/4 Unified tags ===" -ForegroundColor Cyan
Invoke-Step python @("classify_listings.py")

if (-not $SkipEmbed) {
    Write-Host "`n=== 4/4 Rebuilding Smart Search index ===" -ForegroundColor Cyan
    Push-Location frontend
    try {
        Invoke-Step node @("scripts/build-rag-index.mjs")
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n=== 4/4 Skipped Smart Search index rebuild (-SkipEmbed) ===" -ForegroundColor Yellow
}

Write-Host "`nDone. Data refreshed." -ForegroundColor Green
