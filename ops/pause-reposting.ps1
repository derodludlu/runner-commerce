param(
  [switch]$MaintenanceMode
)

$ErrorActionPreference = "Stop"

$Root = "C:\Dev\runnercommercequen35plus"
$Backend = Join-Path $Root "backend"
$MaintenanceFlag = Join-Path $Root ".runner-commerce-maintenance"

if ($MaintenanceMode) {
  New-Item -ItemType File -Force -Path $MaintenanceFlag | Out-Null
  Write-Host "Maintenance mode enabled. Bridge watchdog restarts are paused." -ForegroundColor Yellow
}

Set-Location $Backend
npm run settings:set -- whatsappRepostingEnabled false
Write-Host "WhatsApp reposting paused. Capture can continue if bridges are running." -ForegroundColor Green
