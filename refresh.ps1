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

# NOTE: the step runs as a scriptblock, not (command, arg-array) — a parameter
# named $args silently loses to PowerShell's automatic $args variable, which
# once made every step here execute bare `python` with no script (instant
# exit 0, pipeline "succeeded" in 6 seconds having done nothing).
function Invoke-Step([scriptblock]$Step) {
    & $Step
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed with exit code ${LASTEXITCODE}: $Step"
    }
}

Write-Host "`n=== 1/5 Scraping sources ===" -ForegroundColor Cyan
# Curated nonprofits first. Incremental via curated_scraped.json: only NEW orgs
# in orgs.json (e.g. just-merged discovery-agent finds) get scraped; use --force
# to re-scrape everything.
Invoke-Step { python fetch_curated.py }
Invoke-Step { python fetch_garland.py }
Invoke-Step { python fetch_mckinney.py }
Invoke-Step { python fetch_voly.py }
Invoke-Step { python fetch_idealist.py }
Invoke-Step { python fetch_dallasdoinggood.py }
Invoke-Step { python fetch_reddit.py }

Write-Host "`n=== 2/5 QC filter ===" -ForegroundColor Cyan
Invoke-Step { python qc_filter.py }   # dedup + expiry + LLM content judge (curated)
# Scraped portal sources: trusted for content (no judge) but still deduped
# and checked for passed event dates.
Invoke-Step { python qc_filter.py --file frontend/public/data/volops_garland.json --no-judge }
Invoke-Step { python qc_filter.py --file frontend/public/data/volops_mckinney.json --no-judge }
Invoke-Step { python qc_filter.py --file frontend/public/data/volops_voly.json --no-judge }
Invoke-Step { python qc_filter.py --file frontend/public/data/volops_idealist.json --no-judge }
Invoke-Step { python qc_filter.py --file frontend/public/data/volops_dallasdoinggood.json --no-judge }
# Now that each source's own repeats are resolved, resolve duplicates that
# span MORE THAN ONE source (e.g. a curated org also listed on Idealist) —
# keeps the highest-priority source's copy (curated > garland/mckinney/ddg >
# idealist/voly), regardless of which copy has more fields filled in.
Invoke-Step { python qc_filter.py --cross-dedupe }

Write-Host "`n=== 3/5 Unified tags ===" -ForegroundColor Cyan
Invoke-Step { python classify_listings.py }

Write-Host "`n=== 4/5 Geocoding (city-level) ===" -ForegroundColor Cyan
# Offline + free: resolves each listing to a DFW city centroid from
# geo_gazetteer.json. Incremental — only stamps records without a `geo` block.
Invoke-Step { python geocode_listings.py }

if (-not $SkipEmbed) {
    Write-Host "`n=== 5/5 Rebuilding Smart Search index ===" -ForegroundColor Cyan
    Push-Location frontend
    try {
        Invoke-Step { node scripts/build-rag-index.mjs }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n=== 5/5 Skipped Smart Search index rebuild (-SkipEmbed) ===" -ForegroundColor Yellow
}

Write-Host "`nDone. Data refreshed." -ForegroundColor Green
