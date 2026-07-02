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

Write-Host "`n=== 1/4 Scraping sources ===" -ForegroundColor Cyan
python fetch_garland.py
python fetch_mckinney.py
python fetch_voly.py
python fetch_idealist.py
python fetch_reddit.py

Write-Host "`n=== 2/4 QC filter (curated) ===" -ForegroundColor Cyan
python qc_filter.py

Write-Host "`n=== 3/4 Unified tags ===" -ForegroundColor Cyan
python classify_listings.py

if (-not $SkipEmbed) {
    Write-Host "`n=== 4/4 Rebuilding Smart Search index ===" -ForegroundColor Cyan
    Push-Location frontend
    node scripts/build-rag-index.mjs
    Pop-Location
} else {
    Write-Host "`n=== 4/4 Skipped Smart Search index rebuild (-SkipEmbed) ===" -ForegroundColor Yellow
}

Write-Host "`nDone. Data refreshed." -ForegroundColor Green
